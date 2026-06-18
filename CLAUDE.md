# filadd-chrome-recorder

Generic Chrome MV3 extension that records Google Meet calls (tab audio + microphone) and streams the recording — as a multipart upload, while the call is in progress — to Filadd's `file-uploads-api`, which lands the assembled `.webm` in a transient recordings bucket. The downstream work — **diarized transcription** (`transcript-api`, Deepgram), **speaker review in Notion**, and **living-context delivery** (`ai-conversations-api`) — will ultimately be owned by **n8n** orchestration flows ("the actual job"). Until those exist, `api/` is a **local n8n stand-in** that now implements all three flows (Upload + Processing + Delivery) as a runnable rehearsal against the real local services; **only authoring the actual n8n workflows remains**. Successor to `lowcode-orientation-transcriptor-extension`. Only the `project` profile ships today; the machinery stays generic so others can be re-added.

Read `spec.md` for the full architecture, the research findings behind every major design decision (tabCapture invocation rules, leave-call detection strategy, audio-mixing graph, multipart upload constraints, persistence trade-offs), and the bucket setup requirements.

## Repo layout

- Extension at the root (Vite + @crxjs/vite-plugin + TypeScript + XState v5).
- `api/` — the **local n8n stand-in** (Node + Hono). Mirrors n8n's three flows:
  - **Upload**: `auth.ts` validates the extension's Filadd JWT via the **gateway** (`gateway-auth.ts` → `GET /api/user/me/`, which both validates the token and resolves the user's email); `app.ts` proxies the streaming multipart upload to `file-uploads-api` (`file-uploads-client.ts`) — `POST /uploads`, `POST /uploads/part`, `GET`/`DELETE /uploads/:key`. `profiles.ts` is the trust boundary (validates `pitchId`, renders the upload config + metadata).
  - **Processing** (`processing.ts`): `GET /processing/preview`, `POST /processing/run` → `recordings-bucket.ts` (S3 list/head/presign/delete, via `@aws-sdk/client-s3`) → `transcript-client.ts` (diarized, Deepgram) → `notion-client.ts` (create Transcription + Speakers + Segments) → delete audio.
  - **Delivery** (`delivery.ts`): `POST /delivery/run` → query `speakers_assigned` → rebuild named transcript → `ai-conversations-client.ts` (context generation) → upsert the Notion Context (page body) → mark `delivered`.
  - Own `package.json` + `.env` (`NOTION_*`, `TRANSCRIPT_API_URL`, `AI_CONVERSATIONS_*`, `AWS_REGION`, gateway/file-uploads URLs). See spec.md §6–§7.
- `src/profiles/profiles.ts` (UI shape) and `api/src/profiles.ts` (upload-config + validation) intentionally duplicate the profile table: the server is the trust boundary and must own its copy.

## Commands

```bash
npm install            # extension deps (root)
npm run dev            # Vite dev server with extension HMR
npm run build          # typecheck + production build → dist/ (load unpacked)
npm test               # vitest unit tests (state machine, part buffer)

cd api && npm install
npm run dev            # stand-in on :8787 (needs .env: GATEWAY_URL, FILE_UPLOADS_API_URL, …)
npm test               # vitest unit + route tests (gateway-auth, file-uploads-client, app)
```

Run the real Filadd services locally via the `dockerfiles` repo's `./manage.sh up file-uploads users` (plus the gateway); the stand-in proxies to them.

## Architecture in one paragraph

The **service worker** owns an XState v5 recording-lifecycle machine (snapshot persisted to `chrome.storage.session`, rehydrated on every SW restart), orchestrates everything, owns all persistence, and is the **only context that reads the `auth._token.local` cookie** (offscreen docs can't); it creates the upload session via the stand-in and hands the offscreen doc the streamId, the session, the JWT, and the first presigned part. The **offscreen document** (`USER_MEDIA` reason — no lifetime cap) owns all media handles and the upload loop, PUTting each part directly to S3 and reporting ETags to the SW via messages; the **content script** injects an informative Shadow-DOM pill (above the join button on the pre-join screen, next to the account avatar in the in-call top bar, floating fallback) and detects call end via the locale-independent `call_end` Material-icon ligature; the **popup** (React) holds the start/stop CTA, profile tabs (only shown with >1 enabled profile), the per-profile fields (project: pitch select), a first-run onboarding overlay (identifier + mic grant), and a settings overlay (identifier edit, profile enable/disable, and the pitch list `{label, Notion URL}`); a one-time **permission page** (React) obtains the mic grant (offscreen docs can't show prompts). Speaker review happens **in Notion**, not in the extension. UI surfaces never poll the API directly — they render a snapshot from `chrome.storage.local` reactively via `onChanged`.

## Hard-won constraints — do not "simplify" these away

- `tabCapture.getMediaStreamId` needs an activeTab-style invocation (toolbar click / keyboard shortcut) per tab. A content-script click is a valid *gesture* but never grants invocation; host_permissions don't help. Recording is therefore started from the popup.
- **Offscreen documents can only use `chrome.runtime`** — no `chrome.storage`, no `chrome.cookies`, no tabs. All persistence (pending-upload record, snapshots) and the JWT cookie read happen in the SW; the SW passes the token to the offscreen doc in the `start-capture` message, and the offscreen doc reports ETags back via messages.
- Uploads run in the offscreen document, never the SW (SW fetch/lifetime limits kill long uploads).
- Media streams are released the moment the recorder stops — never held through upload finalization (the OS shows a recording indicator as long as they're alive).
- Captured tab audio must be re-routed to `ctx.destination` or the user stops hearing the call; the mic must never be routed there (feedback).
- The extension's mic capture is independent of Meet's — Meet's mute does NOT propagate to it. Mute is mirrored by watching the mic button's `data-is-muted` attribute and zeroing the mic gain node.
- **The server owns the parts ledger** (`file-uploads-api`'s Redis). The client never holds a ledger: it PUTs each part to the presigned URL it holds, reads the `ETag`, and reports it to the stand-in's `POST /uploads/part`, which records it and returns the **next** part's URL. Part numbers are consecutive from 1; the bucket CORS must expose the `ETag` header (else `res.headers.get("ETag")` is null).
- Audio bytes are buffered in memory only — by design (see spec.md §persistence). Persist upload *metadata* (`{session, lastPart}`), not audio. Crash recovery reconciles the session by `key` via `GET /uploads/:key` (complete a still-`PENDING` prefix with `complete:true` on the last recorded part, or clear a finished/vanished session).
- **`file-uploads-api` owns the object key + destination + metadata.** The extension sends only `{profileId, pitchId}` + the JWT; the stand-in resolves `recorded_by` (the user's email, from the gateway) and builds the upload config — `destination.bucket = filadd-chrome-recorder-prod`, `path = projects`, `metadata = {pitch_id, recorded_by}`, set as S3 object metadata at `CreateMultipartUpload`. `content_type`/`allowed_mimetypes` must be **`video/webm`** (file-uploads' `MIME_TYPES` Literal has no `audio/webm`).
- **Auth is the gateway's job.** The stand-in never decodes the JWT; it forwards `Authorization` to `GET {GATEWAY_URL}/api/user/me/` (the gateway validates + injects `X-UserId`; users-api returns the user incl. email). `file-uploads-api` has no app-level auth, so the stand-in calls it directly. The extension reads `auth._token.local` (value already `Bearer <JWT>`) from the Filadd frontend origin — needs `cookies` + host_permissions for that origin.
- **The recordings bucket is transient.** `filadd-chrome-recorder-prod` (final destination) expires objects after 7 days; `file-uploads-api-prod` (file-uploads staging) has an `AbortIncompleteMultipartUpload` rule. Neither is managed by this repo.
- **Notion (Processing/Delivery) gotchas.** A **Personal Access Token cannot list workspace users** (`GET /v1/users` → 403) — so `Recorded by` (person) can't be resolved from an email with a PAT (best-effort, left blank); use an integration token with the user-read capability if it must work. **Segments relate to Speaker rows** (not a bare index) and **Speaker.Person is free text** (reviewer types it). The **living Context is the page body** (markdown blocks), not a property. **Database templates can't be applied via the API**, and an invalid **Pitch relation is silently dropped** (validate `pitchId` is a real Pitches page). See spec.md §7.

## Conventions

- Named exports, arrow functions, one module per component/function unless highly cohesive.
- UI pages (popup, permission) are React 19; the content-script pill stays vanilla Shadow-DOM to keep the Meet bundle light. Storage reaches React through the hooks in `src/shared/hooks/` — no polling, no query library.
- Profile metadata is tied to the Meet slug it was typed for (`settings.meetingFields`) and resets silently on a different meeting.
- No TypeScript enums — const maps with derived types.
- Null checks via `value == null`.
- i18n: every user-visible string goes through `chrome.i18n` (`_locales/{es,en,pt_br}`, Spanish default).
