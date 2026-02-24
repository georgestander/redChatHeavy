# Changelog

All notable changes to ChatJS are documented here.

> ChatJS is under active development. Breaking changes may occur between releases.

## February 2026

### 2026-02-24 08:53 UTC - PR #6: [codex] Sync root changelog with changelog automation

- Added a root-level `CHANGELOG.md` as a first-class changelog surface for GitHub users.
- Updated changelog merge automation to keep `CHANGELOG.md` and `docs/changelog.mdx` in sync.
- Added README links to make changelog discovery explicit from the repo landing page.

[View PR](https://github.com/georgestander/redChatHeavy/pull/6)
<!-- changelog-pr:6 -->

### 2026-02-24 07:01 UTC - PR #5: [codex] Branching parity and local runtime stability

- Fixed branching parity lint blockers and dependency issues so PR checks pass reliably.
- Improved branch selection wrapper behavior to avoid flaky/non-compliant interaction handling.
- Added CI-safe cleanup updates for auth/session helper signatures and changelog update script linting.

[View PR](https://github.com/georgestander/redChatHeavy/pull/5)
<!-- changelog-pr:5 -->

### Initial Release

The first public release of ChatJS (formerly Sparka AI), forked from [Vercel AI Chatbot](https://github.com/vercel/ai-chatbot) with significant enhancements.

### Multi-Model Support

Access 120+ models through Vercel AI Gateway. Switch between providers seamlessly without changing your code.

### Authentication

Better Auth integration with support for GitHub, Google, and Vercel OAuth providers out of the box.

### Resumable Streams

Continue AI responses after page refresh. Never lose a response mid-generation again.

### Canvas

Create and edit text, code, and spreadsheet documents directly in your chat interface.

### AI Tools

- **Web search** - Real-time search via Tavily or Firecrawl
- **Code execution** - Python sandbox with matplotlib, pandas, numpy
- **Image generation** - AI-powered image creation
- **MCP support** - Model Context Protocol for external tools
- **File attachments** - Drag and drop images, PDFs, documents

### Infrastructure

Built on a modern stack designed for production:

- **PostgreSQL** with Drizzle ORM for the primary database
- **Redis** for resumable streams and caching
- **Vercel Blob** for file storage
- **tRPC** for type-safe APIs
- **Better Auth** for authentication

### Developer Experience

- Full TypeScript support throughout
- Biome + Ultracite for fast linting and formatting
- Evalite for AI evaluation
- Docker support for containerized deployment
