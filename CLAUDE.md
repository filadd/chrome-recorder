# filadd-chrome-recorder

Generic Chrome MV3 extension that records Google Meet calls (tab audio + microphone) and streams the recording to S3 via multipart upload while the call is in progress. Successor to `lowcode-orientation-transcriptor-extension` — simpler, more resilient, and configurable through built-in *profiles* (orientation sessions, private conversations, project conversations).

Read `spec.md` for the full architecture, the research findings behind every major design decision (tabCapture invocation rules, leave-call detection strategy, audio-mixing graph, multipart upload constraints, persistence trade-offs), and the S3 bucket setup requirements.

## Repo layout

- Extension at the root (Vite + @crxjs/vite-plugin + TypeScript + XState v5).
- `api/` — standalone test/reference API (Node + Hono + AWS SDK v3) that issues presigned multipart URLs. Own `package.json`.
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

The **service worker** owns an XState v5 recording-lifecycle machine (snapshot persisted to `chrome.storage.session`, rehydrated on every SW restart), orchestrates everything, and owns all persistence; the **offscreen document** (`USER_MEDIA` reason — no lifetime cap) owns all media handles and the upload loop, reporting part ETags to the SW via messages; the **content script** injects an informative Shadow-DOM pill (above the join button on the pre-join screen, next to the account avatar in the in-call top bar, floating fallback) and detects call end via the locale-independent `call_end` Material-icon ligature; the **popup** (React) holds the start/stop CTA, profile tabs, per-meeting metadata fields, a first-run onboarding overlay (identifier + mic grant), and a settings overlay (identifier edit + profile enable/disable — only `orientation` by default; the tab selector hides when a single profile is enabled); a one-time **permission page** (React) obtains the mic grant (offscreen docs can't show prompts). UI surfaces never poll — they render a snapshot from `chrome.storage.local` reactively via `onChanged`.

## Hard-won constraints — do not "simplify" these away

- `tabCapture.getMediaStreamId` needs an activeTab-style invocation (toolbar click / keyboard shortcut) per tab. A content-script click is a valid *gesture* but never grants invocation; host_permissions don't help. Recording is therefore started from the popup.
- **Offscreen documents can only use `chrome.runtime`** — no `chrome.storage`, no tabs, nothing else. All persistence (ETag ledger, snapshots) happens in the SW; the offscreen doc reports via messages.
- Uploads run in the offscreen document, never the SW (SW fetch/lifetime limits kill long uploads).
- Media streams are released the moment the recorder stops — never held through upload finalization (the OS shows a recording indicator as long as they're alive).
- Captured tab audio must be re-routed to `ctx.destination` or the user stops hearing the call; the mic must never be routed there (feedback).
- The extension's mic capture is independent of Meet's — Meet's mute does NOT propagate to it. Mute is mirrored by watching the mic button's `data-is-muted` attribute and zeroing the mic gain node.
- S3 part numbers must be consecutive from 1; bucket CORS must expose the `ETag` header; the API's S3Client sets `requestChecksumCalculation: "WHEN_REQUIRED"`.
- Audio bytes are buffered in memory only — by design (see spec.md §persistence). Persist upload *metadata*, not audio.

## Conventions

- Named exports, arrow functions, one module per component/function unless highly cohesive.
- UI pages (popup, permission) are React 19; the content-script pill stays vanilla Shadow-DOM to keep the Meet bundle light. Storage reaches React through the hooks in `src/shared/hooks/` — no polling, no query library.
- Profile metadata is tied to the Meet slug it was typed for (`settings.meetingFields`) and resets silently on a different meeting.
- No TypeScript enums — const maps with derived types.
- Null checks via `value == null`.
- i18n: every user-visible string goes through `chrome.i18n` (`_locales/{es,en,pt_br}`, Spanish default).
