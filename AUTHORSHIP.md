# Authorship

## How This Was Built

`redChatHeavy` is a framework and runtime migration: taking a working Next.js/Vercel chat application and replatforming it onto RedwoodSDK and Cloudflare Workers. That kind of work is mostly architectural decision-making up front, then a long tail of mechanical rewrites.

I used Codex to accelerate the mechanical phase. Here is how the work broke down:

### My contributions (human)

- **Migration strategy**: decided what to migrate, in what order, and what to preserve vs. rebuild
- **Architecture design**: chose Durable Objects for resumable streaming, R2 for storage, KV for caching, Better Auth over NextAuth, Drizzle over Prisma
- **Technical direction**: defined the target patterns for routing, middleware, server actions, and binding access
- **Review and verification**: reviewed every generated change, caught edge cases, and validated against the upstream feature set
- **Decision-making**: resolved ambiguities, chose tradeoffs, and decided when something was good enough vs. needed rework

### AI contributions (Codex)

- **Route rewrites**: translating Next.js App Router patterns to RedwoodSDK worker routing
- **Middleware adaptation**: converting Vercel middleware to Cloudflare Workers middleware
- **Binding wiring**: connecting KV, R2, and Durable Object bindings throughout the codebase
- **Boilerplate migration**: updating imports, config files, and build tooling
- **Documentation**: drafting initial README and migration docs

### Why I am transparent about this

AI-assisted development is how a lot of software gets built now. Pretending otherwise would be dishonest. But there is a meaningful difference between "AI wrote this" and "I architected this and used AI to implement it faster." The former implies the human was optional. The latter reflects what actually happened.

The decisions that make this repo interesting were mine: choosing Durable Objects for stateful streaming, designing the R2 attachment pipeline, and structuring the auth migration. The mechanical work of rewriting hundreds of route handlers and adapter patterns was Codex. Both were necessary. Neither was sufficient alone.

## Upstream Lineage

The chat application itself is not original work. It descends from:

1. [vercel/ai-chatbot](https://github.com/vercel/ai-chatbot): the original template
2. [franciscomoretti/chatjs](https://github.com/franciscomoretti/chatjs): the direct upstream fork

The value of this repo is the replatform, not the chat UI.
