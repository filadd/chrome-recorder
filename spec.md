# filadd-chrome-recorder — Specification

## 1. Purpose

A Chrome extension that records Google Meet conversations and uploads them for transcription — the audio itself is transient. The design is:

- **Simpler for the user**: no screen-share picker, no pinned recording tab. The user starts recording from the extension popup; it stops automatically when they leave the call. An informative pill (above the join button pre-call, next to the avatar in the in-call top bar) always surfaces state, including a neutral "ready" label while idle — a content-script click can't grant the popup any invocation right anyway, so it's never a click affordance, just a presence signal.
- **Resilient**: the recording is streamed in parts *during* the call, so if anything crashes mid-call everything uploaded so far is recoverable.
- **Deterministic downstream**: each profile captures the association it needs (the **pitch id**) *at record time*, stamped as S3 object metadata, so the processing flow never has to reconstruct "which conversation is this?" after the fact.
- **Audio-transient by design**: the recordings bucket is a transient queue, not an archive. The processing flow deletes each object after transcription; a lifecycle rule expires stragglers. Only transcripts and what's derived from them persist.

The extension uploads through **`chrome-recorder-consumer-api`** (a Filadd FastAPI service, fronted by the **gateway**), which proxies the multipart upload to Filadd's existing **`file-uploads-api`**. That same consumer API owns the downstream work — **Upload** (validate the caller, proxy the multipart upload to `file-uploads-api`), **Processing** (Celery Beat: list the recordings bucket → `transcript-api` diarized transcription → write the Notion Transcription with the transcript in its page body → delete the audio), and **Delivery** (Celery Beat: poll Notion for reviewed transcripts → rewrite the transcript body with the assigned names → `ai-conversations-api` context generation → upsert the Notion Context). This repo is the **extension only**; the consumer API lives in the separate `chrome-recorder-consumer-api` repo. See the Notion design docs *Pitch conversations transcriber*, *Multipart Uploads*, *Transcription API*, and *Chrome Recorder Extension*.

## 2. Use cases / profiles

A **profile** describes what identifies a recording and what the processing flow does with it. Profiles are built into the extension; the user selects the active one in the popup. Fields are hardcoded per profile — there is no dynamic field framework.

| Profile | Purpose | User-provided | Destination | Processing |
|---|---|---|---|---|
| `project` | Pitch/project conversations | `pitchId` (required — select over the settings-managed pitch list) | `filadd-chrome-recorder-prod` / `projects/{uuid}.webm` | Transcript + living context page under the Notion pitch (consumer-api) |

Speaker **names are not entered at record time** — under the new architecture they're assigned *after* transcription, **in Notion** (the reviewer sets a Person on each numeric speaker row). So `project` asks only for the pitch at record time. `project` is the only profile that ships today; the table stays a const map so another profile is a table entry, not a refactor.

### Object metadata is the processing contract

`file-uploads-api` generates the object key (`{uuid}.webm`) and lands it under the configured destination. **`x-amz-meta-*` object metadata carries what the processing flow needs**, set once at `CreateMultipartUpload` (immutable, ~2 KB total, ASCII):

| Metadata key | Source |
|---|---|
| `pitch_id` | the `pitchId` field (Notion page id) |
| `recorded_by` | the recorder's **email**, resolved by the consumer API from the gateway-injected `X-UserId` via users-api |

**Trust boundary**: the extension sends only `{profileId, pitchId}` plus its Filadd JWT. The **consumer API renders the upload configuration** (destination bucket/path, content type, allowed mimetypes, metadata) from its own copy of the profile table, validates `pitchId` (32-hex Notion page id), and stamps `recorded_by` from the email resolved via users-api (from the gateway-injected `X-UserId`) — never from the client. A tampered client cannot choose a bucket, forge `recorded_by`, or smuggle metadata.

## 3. Architecture

```mermaid
flowchart LR
    CS["Content script<br/>pill + leave detection"] -->|"STOP"| SW["Service worker<br/>XState machine<br/>orchestration + cookie JWT"]
    P["Popup<br/>profile + pitch"] -->|"start / settings"| SW
    SW -->|"streamId + session<br/>+ token + first part"| OFF["Offscreen document<br/>capture + mix + record<br/>upload loop"]
    SW -->|"create / part / status / abort<br/>(Bearer JWT)"| GW["gateway<br/>(validates JWT,<br/>injects X-UserId)"]
    OFF -->|"PUT parts (presigned)"| S3["Recordings bucket"]
    OFF -->|"part / status (Bearer JWT)"| GW
    GW -->|"X-UserId"| API["chrome-recorder-consumer-api<br/>FastAPI + Celery"]
    API -->|"GET /api/user/me/ (X-UserId)"| USERS["users-api<br/>(email = recorded_by)"]
    API -->|"multipart create / part"| FU["file-uploads-api"]
    FU -->|"assemble + post-process + land"| S3
    API -.->|"Processing (Beat): list + presign GET + delete"| S3
    API -->|"diarized transcription"| TR["transcript-api<br/>(Deepgram)"]
    API -->|"Delivery (Beat): context generation"| AIC["ai-conversations-api"]
    API -->|"Transcriptions / Contexts"| NOTION["Notion"]
```

(Processing + Delivery run as Celery Beat jobs inside `chrome-recorder-consumer-api` — §7.)

### Context responsibilities

- **Service worker** (`src/background/service-worker.ts`): hosts the XState actor, handles invocation surfaces (action click, keyboard command), calls `tabCapture.getMediaStreamId`, **reads the `auth._token.local` cookie** (the offscreen doc can't), creates the upload session via `chrome-recorder-consumer-api` (through the gateway), manages the offscreen document lifecycle, watches `tabs.onRemoved`/`onUpdated` as the auto-stop backstop, and runs crash recovery on startup. Holds **no media handles** and does **no uploads**.
- **Offscreen document** (`src/offscreen/`): the only context allowed to hold MediaStreams long-term. Captures tab audio + mic, mixes, records, buffers, and runs the upload loop — PUTting parts directly to S3 and reporting ETags to the SW. Created with reason `USER_MEDIA` (no lifetime cap); explicitly closed after finalization. Receives the JWT + first presigned part from the SW in `start-capture`.
- **Content script** (`src/content/`): detects Meet call pages, injects the Shadow-DOM overlay (purely informative — always visible, showing a neutral "ready" state while idle and recording/uploading/error/etc. otherwise), detects call end.
- **Popup** (`src/popup/`): profile picker, per-profile field form (pitch select), userId setting, pitch-list management in settings, status mirror, and recovery affordances.
- **Permission page** (`src/permission/`): a visible page whose only job is the one-time mic `getUserMedia` grant — offscreen documents cannot show permission prompts.

Speaker review is **not** an extension surface anymore — it lives in Notion (between the consumer API's Processing and Delivery flows; §7).

### State

- The recording lifecycle is an XState v5 machine: `idle → arming → recording → stopping → finalizing → finished`, plus `needsPermission` and `error`. The actor's persisted snapshot is written to `chrome.storage.session` on every transition and rehydrated when the SW restarts (MV3 SWs die after ~30 s idle — routine).
- A small **UI snapshot** (`{state, slug, profileId, startedAt, partsDone, error}`) is written to `chrome.storage.local`; the overlay and popup subscribe via `chrome.storage.onChanged`. No polling.
- Non-serializable handles (streams, recorder, AudioContext) exist only in the offscreen document. If the SW rehydrates into `recording`, it pings the offscreen doc; no answer ⇒ transition to `error` and run upload recovery.

## 4. Research findings (drive the design — verified June 2026)

### 4.1 tabCapture invocation rules

`chrome.tabCapture.getMediaStreamId` requires **two distinct gates** ([docs](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)):

1. **activeTab-style invocation on the target tab** — granted ONLY by: toolbar-icon click, `commands` keyboard shortcut, context-menu item, or omnibox. **Content-script clicks never grant it. Host permissions do not remove it.** The grant persists while the user stays on the tab/origin.
2. **A transient user gesture** at call time — a content-script click *does* satisfy this; the call must happen synchronously in the gesture's message handler.

**Resulting UX**: recording starts from the popup — opening it (icon click or the `_execute_action` Ctrl+Shift+S shortcut) is the invocation, and the Start button click is the gesture, so `getMediaStreamId` always succeeds from there.

### 4.2 Leave-call detection (locale-independent, layered)

Leave detection must be locale-independent and catch non-click exits. It stops on the first of:

1. **Primary — DOM heartbeat**: the `call_end` Material ligature's debounced disappearance (~1.5 s) means the call ended — by any path.
2. **Media-level**: the captured tab audio track fires `ended` when capture stops (tab closed/navigated) — observed in the offscreen document.
3. **Backstop**: `tabs.onRemoved` / `onUpdated` (URL no longer a Meet slug) in the SW.
4. **Fast path**: a click listener on the `call_end` button stops instantly, ahead of the debounce.

### 4.3 Audio pipeline

```
tabSource ─ tabGain ──→ destNode (recording) ──→ MediaRecorder
tabSource ────────────→ ctx.destination (speakers — REQUIRED, capture mutes the tab)
micSource ─ micGain ──→ destNode (recording)     mic NEVER to speakers (feedback)
```

- Tab stream: `getUserMedia({ audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId } } })`.
- Mic: `echoCancellation: true` (cancels remote audio leaking into the mic).
- `AudioContext` may start `suspended` in an offscreen doc → always `await ctx.resume()`.
- Recorder: `audio/webm;codecs=opus` (guarded by `isTypeSupported`), `audioBitsPerSecond: 64000` (~28 MB/h), ~3 s timeslice.
- **Meet's mute is mirrored, not inherited**: the content script watches the mic button's `data-is-muted` attribute and the offscreen doc ramps `micGain` to 0/1 accordingly.
- Known limitation: live MediaRecorder webm lacks duration/cues metadata → playable but not seekable until remuxed. Irrelevant once the pipeline consumes and deletes the audio. (Note: `file-uploads-api` validates the assembled file's mimetype with `python-magic`, which detects opus-in-webm as **`video/webm`** — the consumer API declares the upload as `video/webm` accordingly.)

### 4.4 Streaming multipart upload (via file-uploads-api)

- `file-uploads-api` exposes multipart as a transfer mode of its existing upload: a **create** endpoint starts the session and returns the first presigned `UploadPart` URL; a **part** endpoint records each `{key, part_number, etag}` and returns the **next** URL; the final call sets `complete: true`, after which a Celery task runs `CompleteMultipartUpload` then the standard validate → (transcode) → destination-move. **The server owns the parts ledger** (Redis) — the client stores nothing.
- `CompleteMultipartUpload` is **pure byte concatenation** in part-number order. Splitting the MediaRecorder webm at arbitrary 5 MiB boundaries is valid; the final object is byte-identical to the stream.
- Parts: 5 MiB–5 GiB each (last part any size), max 10,000, **consecutive from 1**.
- **Bucket CORS must list `ETag` in `ExposeHeaders`** or `response.headers.get("ETag")` silently returns `null` (the classic browser-multipart failure). See §8.
- **Sequential one-ahead presigning**: the create call issues the part-1 URL and each part call returns only the next URL, so parts upload in order — a single in-flight PUT that suits a streaming recorder.
- **Presigned-URL TTL must outlive the buffer fill**: the part-1 URL is minted at create but only PUT once the first 5 MiB buffers (~5+ min at audio bitrates), past file-uploads' 300 s default → an expired-URL 403. `chrome-recorder-consumer-api` therefore sends a per-upload `presigned_url_expiration` (its `UPLOAD_PRESIGNED_URL_EXPIRATION`, default 3600 s), which file-uploads applies to every part URL; file-uploads' global default stays 300 s for other callers.
- Uploads run in the **offscreen document**: MV3 service workers are killed on >30 s fetches / >5 min requests; a `USER_MEDIA` offscreen doc has no such caps.
- **Object metadata is supplied at create** (`metadata` JSON → S3 object metadata) and is immutable afterwards.

### 4.5 Persistence: metadata only, no audio in IndexedDB

The offscreen document owns capture; if it dies, capture is over — there is no future audio to protect. **Decision**: audio buffers in memory; the SW persists `{session: {key, filepath, profileId}, lastPart: {partNumber, etag}}` to `chrome.storage.local` after each part. Worst-case loss on a hard crash = the unflushed tail (< one 5 MiB part). Recovery on restart reconciles the session by `key` via `GET /uploads/{key}/`: complete a still-`PENDING` prefix with `complete:true` on the last recorded part, or clear a finished/vanished session.

### 4.6 State machine library

XState v5: the only mature option with first-class snapshot persistence, DOM-free core, TypeScript-first. Caveats handled: actions are not re-executed on rehydrate; snapshots invalidated by machine-shape changes → fall back to `idle` on an unreadable snapshot.

## 5. Recording flow (end to end)

1. Content script matches `meet.google.com/([a-z]{3}-[a-z]{4}-[a-z]{3})` → injects the informative pill, hidden until there is a state worth showing (needs-permission, arming, recording, uploading, finished, error) — it isn't clickable, since a content-script click can never grant `tabCapture` the invocation it needs (see §4.1).
2. User starts from the popup (or Ctrl+Shift+S). Mic missing → SW opens the permission page; `pitchId` unfilled → the popup form blocks the start; not logged into Filadd (no `auth._token.local`) → the start surfaces an auth error.
3. SW: `getMediaStreamId({ targetTabId })` → reads the JWT cookie → `POST /uploads/ {profileId, pitchId}` to the consumer API through the gateway (the gateway validates the JWT + injects `X-UserId`; the consumer API resolves the email and creates the file-uploads multipart session) → persists `{session, lastPart: null}` → ensures the offscreen doc → sends `START_CAPTURE { streamId, session, token, firstPart }`.
4. Offscreen: builds the audio graph, starts MediaRecorder; chunks accumulate in memory; at ≥5 MiB a part is cut → PUT to the held presigned URL (retry w/ backoff, reusing the URL) → read the `ETag` → report it to the SW (for the ledger) **and** to `POST /uploads/part/`, which returns the next part's URL.
5. Stop (leave detection, tab close, track end, or popup stop) → streams released immediately → final part flushed and recorded with `complete:true` → poll `GET /uploads/{key}/` until `COMPLETED` → UI snapshot `finished` → offscreen doc closed.
6. Cancel → `DELETE /uploads/{key}/` (abort; no orphaned parts billing).
7. `runtime.onStartup`: an unfinished persisted session → reconcile via `GET /uploads/{key}/` → finalize the prefix, or surface/clear in the popup.

## 6. Upload API — `chrome-recorder-consumer-api` (via the gateway)

The extension never holds AWS credentials. `chrome-recorder-consumer-api` is the trust boundary and the BFF between the extension and the internal services; it is fronted by the gateway, which terminates auth.

### 6.1 Contract (what the extension calls)

The extension calls the gateway under the prefix `/api/chrome-recorder`; the gateway strips `/api` and proxies to the consumer API's `/api/uploads…`. All requests carry `Authorization: <auth._token.local value>` (already `Bearer <JWT>`) and `Content-Type: application/json`.

| Route (client-facing) | Body → Response |
|---|---|
| `POST /api/chrome-recorder/uploads/` | `{profileId, pitchId}` → resolve email (users-api), validate `pitchId`, build the file-uploads config (+ metadata `{pitch_id, recorded_by}`), `createMultipart` → `{key, filepath, partNumber, url}` (first presigned part) |
| `POST /api/chrome-recorder/uploads/part/` | `{key, partNumber, etag, complete?}` → `recordPart` → `{key, status, partNumber, url}` (next presigned part, or `ASSEMBLING` on `complete:true`) |
| `GET /api/chrome-recorder/uploads/{key}/` | → `{status, parts}` (passthrough of the file-uploads session status; recovery + completion poll) |
| `DELETE /api/chrome-recorder/uploads/{key}/` | → `204` (abort the multipart session) |

Errors: `401` (invalid/absent JWT — rejected by the gateway before the consumer API), `422` (missing `X-UserId`), `400` (missing/malformed `pitchId`), `404` (unknown profile / missing session), file-uploads `409`/`422` forwarded, `502` (file-uploads/users unreachable).

### 6.2 Auth + proxy targets

- **Auth is the gateway's**: the gateway validates the JWT (HS256, local) and injects `X-UserId`; the consumer API never calls the gateway for auth. To resolve `recorded_by`, the consumer API calls users-api `GET /api/user/me/` forwarding `X-UserId`; users-api returns the user incl. `email` (= `recorded_by`).
- **file-uploads-api**: the consumer API calls file-uploads' multipart endpoints (`/api/presigned-multipart-upload/`, `/api/presigned-multipart-upload-part/`, `GET`/`DELETE …/{key}/`) via the internal HTTP pool.

### 6.3 Running it locally

The extension's gateway origin is set per build mode — `.env.development` → `http://localhost:8000` (local gateway), `.env.production` → `https://gateway.filadd.com`. Bring up the backend — gateway + `chrome-recorder-consumer-api` + dependencies — from the `dockerfiles` repo: `./manage.sh up chrome-recorder --workers`. `file-uploads-api`'s S3 client points at real AWS (no MinIO override), so local part PUTs hit the real staging bucket. The consumer API's destination is fixed (`DESTINATION_BUCKET=filadd-chrome-recorder-prod`, `DESTINATION_PATH=projects`).

## 7. Processing & delivery (Celery Beat jobs in `chrome-recorder-consumer-api`)

Transcription, speaker review, and living-context delivery run as **Celery Beat jobs** inside `chrome-recorder-consumer-api` (no extension JWT — distinct from the Upload endpoints). Each is a **looper → processor** pair: a Beat-scheduled looper polls the source and enqueues one processor task per item; per-item failures are isolated so one bad recording never blocks the batch.

| Job | Does |
|---|---|
| **Processing** (Beat) | Looper lists bucket objects under `projects/` + their `pitch_id`/`recorded_by` metadata and **skips recordings already claimed in Notion**, enqueueing a processor per remaining recording. Processor: skip if no `pitch_id` or already claimed → **create the Notion Transcription in `processing` first — the claim, stamped with the recording key in `Recording`** → presign a GET → `transcript-api` diarized transcription → write the diarized transcript into the page body (a Speaker legend + spoken lines) → promote to `pending` → **delete the audio**. On any failure the page is set to **`failed`** and the audio is left in place; the claim stops it being reprocessed into duplicates (a run can outlast the Beat interval). |
| **Delivery** (Beat) | Looper queries Notion for Transcriptions a reviewer marked `speakers_assigned`, enqueues a processor per transcription. Processor: rebuild the named transcript from the page body → **rewrite the page body with the assigned names** (the legend's `Speaker N` labels are replaced by the names, so the page reads as the finished conversation; idempotent on retry) → `ai-conversations` context generation → upsert the Notion Context → mark `delivered` (stays `speakers_assigned` on failure for retry) |

```mermaid
sequenceDiagram
    participant API as chrome-recorder-consumer-api (Beat)
    participant S3 as Recordings bucket
    participant TR as transcript-api (Deepgram)
    participant N as Notion
    participant AIC as ai-conversations-api
    Note over API,N: Processing
    API->>S3: list projects/*.webm + HeadObject (pitch_id, recorded_by)
    API->>N: skip recordings already claimed (Recording key)
    API->>N: create Transcription(processing) — claim, before the slow work
    API->>S3: presign GET
    API->>TR: POST /api/transcription/ {audio_url, strategy:diarized, mode:async}
    TR-->>API: {id}; poll GET /api/transcription/{id}/ → {segments[]}
    API->>N: write transcript to page body, State → pending (or → failed on error)
    API->>S3: delete audio (success only)
    Note over N: Review (human): type each Speaker's Person, State → speakers_assigned
    Note over API,AIC: Delivery
    API->>N: query Transcriptions where State = speakers_assigned
    API->>N: read page body (legend + lines) → named transcript
    API->>N: rewrite page body with assigned names
    API->>AIC: conversation (prompt) + message (current context + transcript)
    AIC-->>API: updated context
    API->>N: upsert Context(pitch), State → delivered
```

**Diarization is `transcript-api`, not `ai-conversations`.** `transcript-api` owns the Deepgram `diarized` strategy (`POST /api/transcription/` `strategy:diarized, mode:async`; poll `GET /api/transcription/{id}/`). `ai-conversations-api` only does the **context-generation conversation**: the consumer API sends the configured prompt and a user message with three blocks — the **pitch content** (the pitch page's title + body, as background), the **current living context**, and the **named transcript**. The prompt is a deliberately **focused "reduced situation state"** (inspired by the `evolve-situation-state` skill but stripped of its change-log/source-history/metadata cruft): it returns a short markdown living context with **Descripción / Decisiones / Action items (`- [ ]`) / Temas abiertos** sections, evolving the prior context incrementally rather than rewriting history.

### Notion data model

Four databases under the *Contexto de pitches automático* building-project page (created global + related, **not** per-page nested):

- **Recorder Transcriptions** — one row per recording: `Name`, `State` (select: `processing`/`pending`/`speakers_assigned`/`delivered`/`failed`), `Pitch` (relation → the existing Pitches DB), `Recorded by` (person), and `Recording` (text — the S3 key the row was built from; Processing claims a recording by writing this up front, then skips any recording whose key already has a row). The **diarized transcript lives in the page body** (not in child rows): a `## Speakers` legend of `Speaker N → ` bullets the reviewer fills in with names, followed by `## Transcript` lines `Speaker N [mm:ss]: text`. Writing the body is ~2 API calls (one create + a batched block-append, ≤100 blocks/call) instead of one `POST` per segment — far less exposed to a transient Notion blip mid-write. Delivery reads the body back and maps the legend onto the lines.
- **Recorder Contexts** — one row per pitch: `Pitch` (relation) + `Updated` (date). The living context itself is the **page body** (markdown-ish blocks — headings/bullets/paragraphs), not a property: long prose renders better and isn't capped at a 2000-char rich-text chunk. Delivery replaces the body each run. The durable outcome.

### Auth + config

The consumer API reaches Notion with a **token** (`NOTION_TOKEN`) and the four DB ids; `transcript-api`/`ai-conversations` via the internal HTTP pool; the recordings bucket via the AWS provider chain (`aioboto3`). The full env (`NOTION_*`, `AI_CONVERSATIONS_*`, `AWS_S3_*`, `REDIS_URL`, service URLs) lives in the consumer-api repo's `.env.example`. Per-item failures are isolated (logged, audio kept for retry) so one bad recording never blocks the batch.

### Known Notion limitations

- **Resolving `Recorded by` (a person field) needs an integration token with the user-read capability.** A Personal Access Token gets `403` on `GET /v1/users`, leaving `Recorded by` blank. The consumer API uses a user-read integration token so the happy path resolves the person; a defensive fallback swallows a 403 and leaves it blank. (This is also why speaker names are reviewer-typed free text in the body legend, not people fields.)
- **Database templates can't be applied via the API.** The *Pitch Trascription* template's useful inline views are linked-database blocks, which the public API can neither instantiate on page-create nor build. Moot for the transcript now that it lives in the page body, but still relevant for any Pitch-relation or context views: reviewer applies the template manually, or set DB-level grouped views.
- **Invalid Pitch relations are silently dropped.** Notion ignores a relation to a page outside the Pitches DB rather than erroring, yielding a dangling Transcription. The consumer API validates `pitchId` *format* (32-hex) at upload time; validating that it's a real Pitches page is a worthwhile further hardening.

## 8. Recordings bucket setup (transient)

Two buckets, neither managed by this repo:

- **`file-uploads-api-prod`** — file-uploads' temp/staging bucket where parts are presigned + assembled. Needs **CORS** with `ExposedHeaders: [ETag]` for the extension origin (browser multipart reads each part's ETag) and an **`AbortIncompleteMultipartUpload`** lifecycle rule so abandoned sessions are reclaimed. Shared by file-uploads-api — merge rules, don't overwrite.
- **`filadd-chrome-recorder-prod`** (region **`sa-east-1`**) — the final destination file-uploads moves assembled recordings to. Transient: a lifecycle rule **expires objects after 7 days** (the backstop that makes "we never retain audio" a system property). The consumer API's Processing job deletes each recording once transcribed. The consumer API's `AWS_S3_REGION` **must** be `sa-east-1`: a presigned GET bakes the region into its signature and can't follow a redirect, so a region mismatch yields `AuthorizationQueryParametersError` (a 400 when `transcript-api`/Deepgram fetches the audio), even though bucket *listing* still works.

## 9. Future work / out of scope

- The backend (`chrome-recorder-consumer-api`) lives in its own repo and is deployed separately (its own K8s app/namespace + secrets) — out of scope here; this repo only needs the gateway origin + the Upload wire contract.
- Tail persistence across browser crashes (IndexedDB) if it becomes a product requirement.
- Mic device picker.
