# filadd-chrome-recorder

Chrome extension that records Google Meet calls (tab audio + microphone) and streams them — as a multipart upload, while the call is in progress — to Filadd's `file-uploads-api`, which lands the assembled recording in a transient bucket. Downstream processing (transcription, speaker review in Notion, living-context delivery) is orchestrated by **n8n** outside this repo. Until those flows exist, `api/` is a **local n8n stand-in** that implements only the upload path.

See **[spec.md](./spec.md)** for the full architecture and design rationale, and **[CLAUDE.md](./CLAUDE.md)** for development conventions.

## Quick start

```bash
# Extension
npm install
npm run build          # → dist/ — load unpacked at chrome://extensions
npm run dev            # dev server with HMR

# n8n stand-in (local)
cd api
npm install
cp .env.example .env   # set GATEWAY_URL + FILE_UPLOADS_API_URL (+ destination vars)
npm run dev            # http://localhost:8787
```

The stand-in proxies to the **real** Filadd services run locally — bring them up from the `dockerfiles` repo:

```bash
cd ../dockerfiles && ./manage.sh up file-uploads users   # plus the gateway
```

## Using it

1. Load the extension and open the popup once: set your identifier and grant the microphone permission.
2. Log into Filadd in the same browser — the extension reads the `auth._token.local` session cookie and authenticates every upload as you.
3. **Project**: register pitches (name + Notion URL) in the settings gear, then pick one before recording.
4. Join a Google Meet call and start from the popup (or `Ctrl+Shift+S`) — Chrome requires one explicit invocation per tab before tab capture is allowed.
5. Recording streams to S3 in 5 MiB parts as the call progresses and stops automatically when you leave the call.

## Bucket requirements

The file-uploads staging bucket needs CORS with `ExposeHeaders: ["ETag"]` (browser multipart reads each part's ETag from its PUT) and an `AbortIncompleteMultipartUpload` lifecycle rule. The final destination bucket (`filadd-chrome-recorder-prod`) expires objects after 7 days — see [spec.md](./spec.md).
