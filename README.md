# filadd-chrome-recorder

Chrome extension that records Google Meet calls (tab audio + microphone) and streams them — as a multipart upload, while the call is in progress — to **`chrome-recorder-consumer-api`** (via the Filadd **gateway**), which proxies the upload to `file-uploads-api` and lands the assembled recording in a transient bucket. The consumer API then runs the downstream pipeline as Celery Beat jobs: diarized transcription (`transcript-api`), speaker review in Notion, and living-context delivery (`ai-conversations-api`).

See **[spec.md](./spec.md)** for the full architecture and design rationale, and **[CLAUDE.md](./CLAUDE.md)** for development conventions.

## Quick start

```bash
npm install
npm run build          # → dist/ — load unpacked at chrome://extensions
npm run dev            # dev server with HMR
npm test               # vitest unit tests (state machine, part buffer)
```

The extension uploads through the Filadd gateway at `/api/chrome-recorder/uploads…`. The gateway origin is configured per build mode in `.env.development` (local gateway, `http://localhost:8000`) and `.env.production` (`https://gateway.filadd.com`); see `.env.example`. Bring up the local stack — the gateway, `chrome-recorder-consumer-api`, and its dependencies — from the `dockerfiles` repo:

```bash
cd ../dockerfiles && ./manage.sh up chrome-recorder --workers
```

## Using it

1. Load the extension and open the popup once: set your identifier and grant the microphone permission.
2. Log into Filadd in the same browser — the extension reads the `auth._token.local` session cookie and sends it as the `Authorization: Bearer <JWT>` header; the gateway validates it and injects `X-UserId`, so every upload is attributed to you.
3. **Project**: register pitches (name + Notion URL) in the settings gear, then pick one before recording.
4. Join a Google Meet call and start from the popup (or `Ctrl+Shift+S`) — Chrome requires one explicit invocation per tab before tab capture is allowed.
5. Recording streams to S3 in 5 MiB parts as the call progresses and stops automatically when you leave the call.

## Bucket requirements

The file-uploads staging bucket needs CORS with `ExposeHeaders: ["ETag"]` (browser multipart reads each part's ETag from its PUT) and an `AbortIncompleteMultipartUpload` lifecycle rule. The final destination bucket (`filadd-chrome-recorder-prod`) expires objects after 7 days — see [spec.md](./spec.md).
