# filadd-chrome-recorder

Chrome extension that records Google Meet calls (tab audio + microphone) and streams them to S3 via multipart upload while the call is in progress. S3 is transient staging: an n8n pipeline transcribes each recording, routes the result per profile (**orientation** → scheduler session, **project** → Notion pitch page), and deletes the audio.

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

1. Load the extension and open the popup once: set your identifier and grant the microphone permission.
2. **Orientation**: log into filadd.com in the same browser — the popup reads the web session and lists today's sessions in a dropdown (manual session-id input as fallback). **Project**: register pitches (name + Notion URL) in the settings gear, then pick one and list the participants.
3. Join a Google Meet call and start from the popup (or `Ctrl+Shift+S`) — Chrome requires one explicit invocation per tab before tab capture is allowed.
4. Recording streams to S3 in 5 MiB parts as the call progresses and stops automatically when you leave the call.

## S3 bucket requirements

The staging bucket needs CORS with `ExposeHeaders: ["ETag"]`, a lifecycle rule aborting incomplete multipart uploads, and a 3-day expiration that guarantees audio is never retained — see [spec.md §9](./spec.md#9-s3-bucket-setup-transient-staging-bucket).

## API smoke test

```bash
curl -s http://localhost:8787/uploads \
  -H 'Authorization: Bearer dev-token' -H 'Content-Type: application/json' \
  -d '{"profileId":"orientation","auto":{"meetSlug":"abc-defg-hij","userId":"me@filadd.com","timestamp":"20260607T150200Z"},"fields":{"sessionId":"12345"}}'
```
