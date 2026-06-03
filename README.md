# filadd-chrome-recorder

Chrome extension that records Google Meet calls (tab audio + microphone) and streams them to S3 via multipart upload while the call is in progress. Configurable through built-in profiles (orientation sessions, private conversations, project conversations).

See **[spec.md](./spec.md)** for the full architecture and design rationale, and **[CLAUDE.md](./CLAUDE.md)** for development conventions.

## Quick start

```bash
# Extension
npm install
npm run build          # → dist/ — load unpacked at chrome://extensions
npm run dev            # dev server with HMR

# Upload API (test/reference implementation)
cd api
npm install
cp .env.example .env   # fill in AWS credentials + bucket names
npm run dev            # http://localhost:8787
```

## Using it

1. Load the extension and open the popup once: pick a profile, set your identifier, and grant the microphone permission.
2. Join a Google Meet call — a **Record** toggle appears in the top-right corner of the page.
3. The first time on a tab, click the extension icon (or press `Ctrl+Shift+S`) when prompted — Chrome requires one explicit invocation per tab before tab capture is allowed.
4. Recording streams to S3 in 5 MiB parts as the call progresses and stops automatically when you leave the call.

## S3 bucket requirements

Each bucket needs CORS with `ExposeHeaders: ["ETag"]` and a lifecycle rule aborting incomplete multipart uploads — see [spec.md §7](./spec.md#7-s3-bucket-setup-required-per-bucket).

## API smoke test

```bash
curl -s http://localhost:8787/uploads \
  -H 'Authorization: Bearer dev-token' -H 'Content-Type: application/json' \
  -d '{"profileId":"private","auto":{"userId":"me@filadd.com","date":"2026-06-03","timestamp":"20260603T150200Z"},"fields":{"title":"test"}}'
```
