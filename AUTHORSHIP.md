# Authorship Statement

This repository (`redChatHeavy`) is a replatformed fork of ChatJS.

## Transparency

For the replatform phase, implementation and documentation were produced primarily by `gpt-5.3-codex` with minimal manual coding.

- The migration execution (code edits, runtime/debug fixes, and validation runs) was Codex-led.
- The migration planning/closure docs and README updates in this fork were written by Codex.
- The human role was project direction, scope decisions, and final approval.

## Upstream Credit

The underlying product foundation and many non-migration files originated from the upstream ChatJS project and its contributors.
- Upstream ChatJS: https://github.com/franciscomoretti/chatjs
- Historical lineage: https://github.com/vercel/ai-chatbot

This repo does not claim sole human authorship for that upstream work.

## Feature Parity Intent

This fork targets practical parity with the upstream ChatJS core feature surface while replatforming to RedwoodSDK + Cloudflare (Workers, Durable Objects, KV, and R2).

## Experiment Context

This migration was also run as an explicit capability test for `gpt-5.3-codex`: can it take a production-style app fork and execute the full replatform with near-zero manual coding intervention.
