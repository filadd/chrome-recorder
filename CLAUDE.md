# filadd-chrome-recorder

Generic Chrome MV3 extension that records Google Meet calls (tab audio + microphone) and streams the recording to S3 via multipart upload while the call is in progress. S3 is **transient** with two queues: an event-driven AWS pipeline (S3 `ObjectCreated` → Ingest Lambda → Deepgram async callback → Callback Lambda) transcribes each `projects/*.webm` into a **review artifact** (`reviews/*.json`) and deletes the audio; the user then assigns speaker names in an in-extension **review** step (diarization gives numeric speakers — names are human-assigned, not entered at record time); a **Finalize Lambda** applies the naming and writes the `project` transcript + living context page under a Notion pitch, deleting the artifact. Successor to `lowcode-orientation-transcriptor-extension`. Only the `project` profile ships today; the machinery stays generic so others can be re-added.

Read `spec.md` for the full architecture, the research findings behind every major design decision (tabCapture invocation rules, leave-call detection strategy, audio-mixing graph, multipart upload constraints, persistence trade-offs), and the S3 bucket setup requirements.

## Repo layout

- Extension at the root (Vite + @crxjs/vite-plugin + TypeScript + XState v5).
- `api/` — the upload API **and** the processing pipeline (Node + Hono + AWS SDK v3), one SAM stack. `app.ts`/`lambda.ts` are the multipart signer + the `/reviews` routes (Function URL); `ingest.ts` (S3 event → Deepgram async submit) and `callback.ts` (Deepgram callback → format + guess names + write review artifact + delete audio, own Function URL) are the transcription pipeline; `finalize.ts` (apply naming → summary/context LLM → Notion → delete artifact, async-invoked on submit) and `sweeper.ts` (daily best-guess backstop) close the loop. Logic lives in `src/pipeline/{secrets,deepgram,llm,notion,routing,review,review-store,review-guess}.ts`. `index.ts` serves the signer locally. SAM (`template.yaml`) provisions all functions plus the bucket (created + owned by the stack, `DeletionPolicy: Retain`). Own `package.json`.
- `src/profiles/profiles.ts` and `api/src/profiles.ts` intentionally duplicate the profile table: the server is the trust boundary and must own its copy.

## Commands

```bash
npm install            # extension deps (root)
npm run dev            # Vite dev server with extension HMR
npm run build          # typecheck + production build → dist/ (load unpacked)
npm test               # vitest unit tests (state machine, part buffer, key rendering)

cd api && npm install
npm run dev            # API on :8787 (needs .env, see api/.env.example)
```

## Architecture in one paragraph

The **service worker** owns an XState v5 recording-lifecycle machine (snapshot persisted to `chrome.storage.session`, rehydrated on every SW restart), orchestrates everything, and owns all persistence; the **offscreen document** (`USER_MEDIA` reason — no lifetime cap) owns all media handles and the upload loop, reporting part ETags to the SW via messages; the **content script** injects an informative Shadow-DOM pill (above the join button on the pre-join screen, next to the account avatar in the in-call top bar, floating fallback) and detects call end via the locale-independent `call_end` Material-icon ligature; the **popup** (React) holds the start/stop CTA, profile tabs (only shown with >1 enabled profile), the per-profile fields (project: pitch select), a **pending-reviews inbox**, a first-run onboarding overlay (identifier + mic grant), and a settings overlay (identifier edit, profile enable/disable, and the pitch list `{label, Notion URL}`); a one-time **permission page** (React) obtains the mic grant (offscreen docs can't show prompts); a **review page** (React, opened from the inbox with `?key=`) assigns speaker names (name / merge / ignore) after transcription. The SW polls the review queue via `chrome.alarms` (fast burst after a recording, then daily) and mirrors it to `chrome.storage.local` + the toolbar badge. UI surfaces never poll the API directly — they render a snapshot from `chrome.storage.local` reactively via `onChanged`.

## Hard-won constraints — do not "simplify" these away

- `tabCapture.getMediaStreamId` needs an activeTab-style invocation (toolbar click / keyboard shortcut) per tab. A content-script click is a valid *gesture* but never grants invocation; host_permissions don't help. Recording is therefore started from the popup.
- **Offscreen documents can only use `chrome.runtime`** — no `chrome.storage`, no tabs, nothing else. All persistence (ETag ledger, snapshots) happens in the SW; the offscreen doc reports via messages.
- Uploads run in the offscreen document, never the SW (SW fetch/lifetime limits kill long uploads).
- Media streams are released the moment the recorder stops — never held through upload finalization (the OS shows a recording indicator as long as they're alive).
- Captured tab audio must be re-routed to `ctx.destination` or the user stops hearing the call; the mic must never be routed there (feedback).
- The extension's mic capture is independent of Meet's — Meet's mute does NOT propagate to it. Mute is mirrored by watching the mic button's `data-is-muted` attribute and zeroing the mic gain node.
- S3 part numbers must be consecutive from 1; bucket CORS must expose the `ETag` header; the API's S3Client sets `requestChecksumCalculation: "WHEN_REQUIRED"`.
- Audio bytes are buffered in memory only — by design (see spec.md §persistence). Persist upload *metadata*, not audio.
- **Object metadata is the pipeline contract** (`pitch_id`, `meet_slug`, `recorded_by`, `started_at`): set once at `CreateMultipartUpload`, immutable, 2 KB total, ASCII-only values — the API maps/sanitizes them (`api/src/keys.ts`). Mutable per-object state (`status` tag) goes in object *tags*, not metadata. Speaker names are **not** in metadata — they're assigned post-transcription in the review.
- **The bucket is the only state** — no ledger DB. `projects/*.webm` = pending transcription, `reviews/*.json` = pending review; deletion = done. Review keys are partitioned by `recorded_by` (`reviews/{recordedBy}/{epochMs}-{pitchId}-{uuid}.json`) so listing a user's queue is one prefix `ListObjectsV2` and inbox rows parse from the key. Review is **blocking**: nothing reaches Notion until names are confirmed (human submit, or the sweeper's best-guess after `REVIEW_STALE_DAYS`).
- **Pipeline idempotency**: the Callback writes the artifact + deletes the audio (a duplicate callback for a deleted key no-ops); Finalize deletes the artifact (a duplicate/missing-artifact invoke acks). A `status` tag (`submitted`/`processing`) guards in-flight transcription. Deepgram re-POSTs on 5xx (~10×) is the only transcription retry; finalize is async-invoked (or run inline locally when `FINALIZE_FUNCTION_NAME` is unset).
- **Pipeline secrets** (Deepgram, callback token, LLM, Notion) live in one Secrets Manager secret (`PIPELINE_SECRET_ARN`), fetched once per cold start and memoized — never in Lambda env vars. The LLM is provider-agnostic (`LLM_BASE_URL`/`LLM_MODEL`, OpenAI-compatible).

## Conventions

- Named exports, arrow functions, one module per component/function unless highly cohesive.
- UI pages (popup, permission, review) are React 19; the content-script pill stays vanilla Shadow-DOM to keep the Meet bundle light. Storage reaches React through the hooks in `src/shared/hooks/` — no polling, no query library.
- Profile metadata is tied to the Meet slug it was typed for (`settings.meetingFields`) and resets silently on a different meeting.
- No TypeScript enums — const maps with derived types.
- Null checks via `value == null`.
- i18n: every user-visible string goes through `chrome.i18n` (`_locales/{es,en,pt_br}`, Spanish default).
