<div align="center">
<img src="app/icon.svg" alt="redChatHeavy" width="64" height="64">

# redChatHeavy

ChatJS replatformed to RedwoodSDK + Cloudflare Workers.
</div>

## What This Repo Is

`redChatHeavy` started from a ChatJS codebase and was migrated off the original Next.js/Vercel runtime.

This repository is focused on the Cloudflare-native architecture:

- RedwoodSDK + Vite worker runtime
- Cloudflare Workers routing and middleware
- Durable Objects + KV for resumable stream buffering
- R2-backed file storage and serving
- Better Auth + AI Gateway + Drizzle/Postgres domain logic

## Attribution

This project builds directly on prior open-source work from the ChatJS codebase.
The point of this repo is the replatform and continued development, not pretending the foundation came from nowhere.

## Current Runtime Snapshot

- Deploy target: Cloudflare Workers
- Server model: RedwoodSDK worker + server actions
- Streaming: resumable chat streams via Durable Objects
- Storage: R2 for attachments
- Cache/rate limits: KV namespaces

## Local Development

Install and run:

```bash
pnpm install
SKIP_ENV_VALIDATION=1 pnpm dev
```

If `5173` is busy, Vite will move to the next free port.

## Validation

```bash
pnpm run lint
SKIP_ENV_VALIDATION=1 pnpm run test
SKIP_ENV_VALIDATION=1 pnpm run build
```

`SKIP_ENV_VALIDATION=1` is for local verification only and is ignored in CI/production.

## License

Apache-2.0
