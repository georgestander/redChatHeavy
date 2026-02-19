<p align="center">
  <img src="app/icon.svg" width="80" alt="redChatHeavy" />
</p>

# redChatHeavy

**A full-stack AI chat application replatformed from Next.js/Vercel to RedwoodSDK on Cloudflare Workers.**

Durable Objects for resumable streaming · KV for cache and rate limiting · R2 for file storage · Better Auth · AI Gateway · Drizzle/Postgres

---

## Why This Exists

Most AI chat interfaces run on Vercel. I wanted to understand what it takes to run one on Cloudflare's edge infrastructure instead, and whether that architecture is meaningfully better for real-time streaming workloads.

`redChatHeavy` is a full replatform of [ChatJS](https://github.com/franciscomoretti/chatjs) (itself descended from [vercel/ai-chatbot](https://github.com/vercel/ai-chatbot)) onto a Cloudflare-native stack. The migration preserved all core functionality: multi-model chat, streaming, auth, attachments, and sharing while replacing the runtime, routing, storage, and deployment layers entirely.

## Architecture Decisions

| Layer | Vercel/Next.js (original) | Cloudflare/RedwoodSDK (this repo) |
|-------|---------------------------|-----------------------------------|
| Runtime | Node.js on Vercel Edge | Cloudflare Workers |
| Framework | Next.js App Router | RedwoodSDK + Vite |
| Streaming | Vercel AI SDK streams | Durable Objects for resumable buffering |
| File storage | Vercel Blob | R2 |
| Cache / rate limiting | In-memory / Vercel KV | Cloudflare KV namespaces |
| Auth | NextAuth | Better Auth |
| ORM | Prisma | Drizzle |
| AI routing | Direct provider calls | AI Gateway |

The most interesting part of the migration was the streaming architecture. Durable Objects provide resumable, stateful stream buffering at the edge. If a client disconnects mid-stream, the response is still being written and can be picked up again. That is hard to do cleanly on a serverless Node runtime.

## Feature Parity

This repo maintains practical parity with the upstream ChatJS feature set:

- Multi-model chat with streaming responses
- Auth and session management
- File attachments and serving
- Chat history, projects, and sharing
- Settings and configuration UX
- MCP / tooling integrations

## Development Approach

This migration was executed using Codex as an implementation accelerator. I designed the migration strategy, made all architectural decisions, and reviewed every change. Codex handled the mechanical work of rewriting routes, adapting middleware patterns, and wiring up Cloudflare bindings.

I wrote about this (with the help of Codex) approach and the tradeoffs in [AUTHORSHIP.md](AUTHORSHIP.md).

## Getting Started

```bash
pnpm install
SKIP_ENV_VALIDATION=1 pnpm dev
```

If port `5173` is busy, Vite will move to the next free port.

## Validation

```bash
pnpm run lint
SKIP_ENV_VALIDATION=1 pnpm run test
SKIP_ENV_VALIDATION=1 pnpm run build
```

`SKIP_ENV_VALIDATION=1` is for local verification only and is ignored in CI/production.

## Open Questions

- **Postgres provider (Neon) is not final**: Neon is the current Postgres backend, but I am still evaluating whether it is the long-term fit for this project.
- **In-app branching UX**: I want to bring database branching directly into this app, using ideas from [branch-Chat](https://github.com/georgestander/branch-Chat).

## Upstream Attribution

This project builds on prior open-source work and I want to be clear about that lineage:

- Direct upstream: [franciscomoretti/chatjs](https://github.com/franciscomoretti/chatjs)
- Historical lineage: [vercel/ai-chatbot](https://github.com/vercel/ai-chatbot)

The value of this repo is the replatform and the architectural decisions, not the chat UI itself.

## License

Apache-2.0
