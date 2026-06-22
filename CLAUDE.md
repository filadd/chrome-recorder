# filadd-chrome-recorder

Generic Chrome MV3 extension that records Google Meet calls (tab audio + microphone) and streams the recording — as a multipart upload, while the call is in progress — to **`chrome-recorder-consumer-api`** (via the Filadd **gateway**), which proxies the multipart upload to `file-uploads-api` and lands the assembled `.webm` in a transient recordings bucket. That consumer API also owns the downstream work as **Celery Beat jobs**: **diarized transcription** (`transcript-api`, Deepgram), **speaker review in Notion**, and **living-context delivery** (`ai-conversations-api`). This repo is the **extension only**; the consumer API lives in the separate `chrome-recorder-consumer-api` repo. Successor to `lowcode-orientation-transcriptor-extension`. Only the `project` profile ships today; the machinery stays generic so others can be re-added.

Read `spec.md` for the full architecture, the research findings behind every major design decision (tabCapture invocation rules, leave-call detection strategy, audio-mixing graph, multipart upload constraints, persistence trade-offs), and the bucket setup requirements.

## Repo layout

- Extension at the root (Vite + @crxjs/vite-plugin + TypeScript + XState v5). This repo is the extension only.
- The backend — **`chrome-recorder-consumer-api`** (FastAPI + Celery, separate repo) — owns the three flows the extension talks to (Upload) or that run behind it (Processing, Delivery):
  - **Upload** (extension-facing, behind the gateway): validates the caller (gateway-injected `X-UserId` → resolve email via users-api), validates `pitchId`, proxies the streaming multipart upload to `file-uploads-api`, stamping `{pitch_id, recorded_by}` as S3 object metadata. The extension hits `POST /uploads/`, `POST /uploads/part/`, `GET`/`DELETE /uploads/{key}/` under the gateway prefix `/api/chrome-recorder`.
  - **Processing** (Celery Beat): list the recordings bucket → diarized transcription (`transcript-api`, Deepgram) → write Notion Transcription + Speakers + Segments → delete the audio.
  - **Delivery** (Celery Beat): for transcriptions a reviewer marked `speakers_assigned`, rebuild the named transcript → `ai-conversations-api` context generation → upsert the Notion Context page body → mark `delivered`.
- `src/profiles/profiles.ts` holds the UI profile shape; `chrome-recorder-consumer-api`'s own profiles module owns the upload-config + validation copy. They intentionally duplicate the profile table: the server is the trust boundary and must own its copy.

## Commands

```bash
npm install            # extension deps (root)
npm run dev            # Vite dev server with extension HMR
npm run build          # typecheck + production build → dist/ (load unpacked)
npm test               # vitest unit tests (state machine, part buffer)
```

The extension uploads through the gateway at `/api/chrome-recorder/uploads…`; the gateway origin is set per build mode (`.env.development` → `http://localhost:8000`, `.env.production` → `https://gateway.filadd.com`). Bring up the local backend — gateway + `chrome-recorder-consumer-api` + its dependencies — from the `dockerfiles` repo: `./manage.sh up chrome-recorder --workers`.

## Architecture in one paragraph

The **service worker** owns an XState v5 recording-lifecycle machine (snapshot persisted to `chrome.storage.session`, rehydrated on every SW restart), orchestrates everything, owns all persistence, and is the **only context that reads the `auth._token.local` cookie** (offscreen docs can't); it creates the upload session via `chrome-recorder-consumer-api` (through the gateway) and hands the offscreen doc the streamId, the session, the JWT, and the first presigned part. The **offscreen document** (`USER_MEDIA` reason — no lifetime cap) owns all media handles and the upload loop, PUTting each part directly to S3 and reporting ETags to the SW via messages; the **content script** injects an informative Shadow-DOM pill (above the join button on the pre-join screen, next to the account avatar in the in-call top bar, floating fallback) and detects call end via the locale-independent `call_end` Material-icon ligature; the **popup** (React) holds the start/stop CTA, profile tabs (only shown with >1 enabled profile), the per-profile fields (project: pitch select), a first-run onboarding overlay (identifier + mic grant), and a settings overlay (identifier edit, profile enable/disable, and the pitch list `{label, Notion URL}`); a one-time **permission page** (React) obtains the mic grant (offscreen docs can't show prompts). Speaker review happens **in Notion**, not in the extension. UI surfaces never poll the API directly — they render a snapshot from `chrome.storage.local` reactively via `onChanged`.

## Hard-won constraints — do not "simplify" these away

- `tabCapture.getMediaStreamId` needs an activeTab-style invocation (toolbar click / keyboard shortcut) per tab. A content-script click is a valid *gesture* but never grants invocation; host_permissions don't help. Recording is therefore started from the popup.
- **Offscreen documents can only use `chrome.runtime`** — no `chrome.storage`, no `chrome.cookies`, no tabs. All persistence (pending-upload record, snapshots) and the JWT cookie read happen in the SW; the SW passes the token to the offscreen doc in the `start-capture` message, and the offscreen doc reports ETags back via messages.
- Uploads run in the offscreen document, never the SW (SW fetch/lifetime limits kill long uploads).
- Media streams are released the moment the recorder stops — never held through upload finalization (the OS shows a recording indicator as long as they're alive).
- Captured tab audio must be re-routed to `ctx.destination` or the user stops hearing the call; the mic must never be routed there (feedback).
- The extension's mic capture is independent of Meet's — Meet's mute does NOT propagate to it. Mute is mirrored by watching the mic button's `data-is-muted` attribute and zeroing the mic gain node.
- **The server owns the parts ledger** (`file-uploads-api`'s Redis). The client never holds a ledger: it PUTs each part to the presigned URL it holds, reads the `ETag`, and reports it to the consumer API's `POST /uploads/part/`, which records it and returns the **next** part's URL. Part numbers are consecutive from 1; the bucket CORS must expose the `ETag` header (else `res.headers.get("ETag")` is null).
- Audio bytes are buffered in memory only — by design (see spec.md §persistence). Persist upload *metadata* (`{session, lastPart}`), not audio. Crash recovery reconciles the session by `key` via `GET /uploads/{key}/` (complete a still-`PENDING` prefix with `complete:true` on the last recorded part, or clear a finished/vanished session).
- **`file-uploads-api` owns the object key + destination + metadata.** The extension sends only `{profileId, pitchId}` + the JWT; the consumer API resolves `recorded_by` (the user's email, from users-api via `X-UserId`) and builds the upload config — `destination.bucket = filadd-chrome-recorder-prod`, `path = projects`, `metadata = {pitch_id, recorded_by}`, set as S3 object metadata at `CreateMultipartUpload`. `content_type`/`allowed_mimetypes` must be **`video/webm`** (file-uploads' `MIME_TYPES` Literal has no `audio/webm`).
- **Auth is the gateway's job.** The extension never decodes the JWT; it sends `Authorization: Bearer <JWT>` to the gateway, which validates it and injects `X-UserId`. The consumer API reads `X-UserId` and resolves the email via users-api `GET /api/user/me/`; it never calls the gateway for auth itself. The extension reads `auth._token.local` (value already `Bearer <JWT>`) from the Filadd frontend origin — needs `cookies` + host_permissions for that origin.
- **The recordings bucket is transient** (managed outside this repo). `filadd-chrome-recorder-prod` (final destination) expires objects after 7 days; `file-uploads-api-prod` (file-uploads staging) has an `AbortIncompleteMultipartUpload` rule.
- **Notion (Processing/Delivery) gotchas — handled in `chrome-recorder-consumer-api`, but relevant to the data model.** Resolving `Recorded by` (person) from an email needs a Notion **integration token with the user-read capability** (a Personal Access Token gets `403` on `GET /v1/users`, leaving it blank). **Segments relate to Speaker rows** (not a bare index) and **Speaker.Person is free text** (reviewer types it). The **living Context is the page body** (markdown blocks), not a property. **Database templates can't be applied via the API**, and an invalid **Pitch relation is silently dropped** (validate `pitchId` is a real Pitches page). See spec.md §7.

## Conventions

- Named exports, arrow functions, one module per component/function unless highly cohesive.
- UI pages (popup, permission) are React 19; the content-script pill stays vanilla Shadow-DOM to keep the Meet bundle light. Storage reaches React through the hooks in `src/shared/hooks/` — no polling, no query library.
- Profile metadata is tied to the Meet slug it was typed for (`settings.meetingFields`) and resets silently on a different meeting.
- No TypeScript enums — const maps with derived types.
- Null checks via `value == null`.
- i18n: every user-visible string goes through `chrome.i18n` (`_locales/{es,en,pt_br}`, Spanish default).
