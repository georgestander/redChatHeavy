# ChatJS Branching V2 Plan (Informed by Branch-Chat)

## Summary
Upgrade `chatjs` branching from a mostly in-memory sibling-navigation model to a durable, URL-addressable, branch-aware system that preserves context fidelity and improves branch UX.

This plan intentionally keeps `chatjs`'s existing `parentMessageId` DAG foundation, while importing the strongest patterns from `Branch-Chat`:
- Explicit branch entities and provenance metadata
- Branch-chain context assembly (instead of shallow history slices)
- Branch-from-selection workflows
- Parent context + compare UX
- Branch titles and tree-based navigation

## Scenario Plan (Required Before Implementation)

### Stakeholders
- End users: need reliable branch exploration without losing context.
- Product/docs: need roadmap claim to match real capabilities.
- Engineering: need additive migration with low regression risk.
- Support/on-call: need clear fallback and telemetry for invalid branch state.

### Success Criteria
- Branch IDs are durable and URL-addressable.
- Context sent to model is branch-chain accurate.
- Branch UX supports create/switch/rename, with clear parent context.
- Existing non-branch chat flows continue working across chat/project/share surfaces.

### Assumptions
- Existing message DAG via `parentMessageId` remains canonical.
- Additive schema migration is acceptable in current rollout window.
- `pnpm test:types`, `pnpm test:unit`, and targeted Playwright smoke suites are canonical validation gates.

### Known Risks and Failure Modes
- Incorrect branch-chain assembly can produce wrong assistant responses.
- Branch query parsing can cause invalid thread hydration or share-page leakage.
- Stream switching during active generation can surface stale deltas.
- Backfill/migration can leave orphaned messages or missing root branches.

## Scenario Coverage Matrix

| Scenario ID | Scenario | Acceptance Checks | Unit Test Mapping | Regression Test Mapping |
| --- | --- | --- | --- | --- |
| BV2-S1 | Root branch bootstraps for legacy chats | Existing chats load with deterministic root branch; no chat becomes unreadable | `lib/branching/branching.test.ts` (`ensureRootBranch`, backfill/idempotency) | `pnpm test:unit` + targeted DB migration test run |
| BV2-S2 | Branch creation from message (no selection span) | New branch is created with parent linkage and provenance message id | `lib/branching/branching.test.ts` (`createBranchFromSelection` base case) | Playwright chat flow: create branch from message action |
| BV2-S3 | Branch creation from text selection | Span/excerpt persisted and linked to child branch | `lib/branching/branching.test.ts` (`span/excerpt persistence`, sanitization) | Playwright UI scenario for selection popover branching |
| BV2-S4 | Branch-aware context assembly across multiple ancestor levels | Model input includes correct cutoffs at each fork; no duplicate user turn | `lib/branching/context-assembly.test.ts` (fork cutoff, dedupe) | API chat integration tests for parent/child send behavior |
| BV2-S5 | URL branch deep-link loads same active branch after refresh | `/chat/:id?branch=` remains stable on reload | `lib/branching/url-resolution.test.ts` | Playwright route refresh checks on chat page |
| BV2-S6 | Project chat deep-link with branch | `/project/:projectId/chat/:chatId?branch=` resolves correct branch | `lib/branching/url-resolution.test.ts` (project variant) | Playwright project route branch-switch persistence |
| BV2-S7 | Shared chat deep-link with branch is read-only and constrained | Branch param resolves only within shared chat; composer remains hidden | `lib/branching/url-resolution.test.ts` (share auth/read-only guards) | Playwright shared chat route regression |
| BV2-S8 | Sidebar tree navigation updates active branch without stale stream artifacts | Switching branch stops stream/reset data stream safely | `providers/message-tree-provider.test.tsx` (stream reset on branch switch) | Manual + Playwright branch switch while streaming |
| BV2-S9 | Branch rename updates tree + persisted metadata | Rename is visible in sidebar and survives refresh | `lib/branching/branching.test.ts` (rename sanitization/persistence) | Playwright sidebar rename regression |
| BV2-S10 | Migration/backfill safety on large chats | Backfill is idempotent and preserves message lineage | `lib/branching/migration.test.ts` | `pnpm db:migrate` on seeded branch data + smoke read tests |
| BV2-S11 | Invalid `branch` query fallback | Invalid/missing branch id gracefully falls back (root/last active) with telemetry | `lib/branching/url-resolution.test.ts` (invalid ids) | Playwright invalid URL param handling |
| BV2-S12 | Non-branch legacy editing flow still works | AU-004 edit/resubmit branch trim behavior remains correct | Existing + updated tests around `multimodal-input` and thread trim | `docs/local-runtime-smoke-scenarios.md` AU-004 execution |

### Validation Coupling Rules
- Every implemented scenario must have:
  - at least one unit/integration test in `pnpm test:unit`
  - at least one regression path in Playwright or documented smoke run
- No scenario is marked complete until both mappings pass.

## Why This Is Needed
- Current roadmap intent is correct but underspecified (`docs/roadmap/branching.mdx`).
- `chatjs` already has parent-linked messages and sibling navigation, but branch state is not first-class/durable in the same way as `Branch-Chat`.
- Context construction currently truncates aggressively (`app/(chat)/api/chat/route.ts`) and can miss important branch ancestry on long trees.

## Current State in ChatJS
- Message DAG exists via `Message.parentMessageId` (`lib/db/schema.ts`).
- Thread reconstruction and sibling traversal exists (`lib/thread-utils.ts`, `providers/message-tree-provider.tsx`).
- Edit flow creates alternate continuations by trimming and resubmitting (`components/multimodal-input.tsx`).
- UI branch controls are primarily sibling prev/next (`components/message-siblings.tsx`).
- Initial thread pick is newest-leaf based (`hooks/use-chat-system-initial-state.ts`, `app/(chat)/project/[projectId]/chat/[chatId]/project-chat-page.tsx`, `app/(chat)/share/[id]/shared-chat-page.tsx`).

## Best Bits to Bring Over from Branch-Chat

| Capability | Branch-Chat Reference | Why It Matters | ChatJS Landing Zone |
| --- | --- | --- | --- |
| Explicit `Branch` model with `createdFrom` provenance (`messageId`, `span`, `excerpt`) | `src/lib/conversation/model.ts`, `src/app/shared/conversation.server.ts` | Makes branches inspectable, nameable, and deep-linkable | New DB model + branch service in `lib/db/*` + `lib/branching/*` |
| Branch tree construction | `src/app/shared/conversation.server.ts` (`buildBranchTree`) | Enables meaningful branch navigation vs flat sibling controls | `providers/message-tree-provider.tsx` + new sidebar tree component |
| Branch-chain context assembly with cutoff at fork point | `src/app/shared/conversation.server.ts` (`assembleConversationMessages`) | Preserves correct context across parent/child branches | `app/(chat)/api/chat/route.ts` (replace naive history slicing) |
| Branch-from-selection action | `src/app/components/conversation/BranchableMessage.tsx` | High-signal UX for exploring alternatives | `components/message-actions.tsx` + message rendering components |
| Parent context sheet + compare mode | `src/app/components/conversation/ParentContextSheet.tsx`, `ConversationPage.tsx` | Helps users orient when diverging from parent | New compare panel in chat layout |
| Auto branch title derivation / summarization | `src/app/shared/conversation.server.ts` (`maybeAutoSummarizeRootBranchTitle`) | Makes branches understandable at glance | New branch title strategy in backend service |

## Target State
1. Branches are first-class records with durable IDs.
2. Active branch is URL-addressable (`/chat/:id?branch=:branchId`), not only local runtime state.
3. Message send uses branch-aware context assembly from branch ancestry.
4. Users can branch from a message or selected text and navigate branch trees.
5. Shared/project pages resolve consistent branch state when branch query is present.

## Design Decisions

### 1) Keep `parentMessageId` as canonical message graph
Do not replace the message DAG. Extend it with branch metadata.

### 2) Add a branch layer instead of re-platforming storage
Adopt `Branch-Chat` semantics without moving to Durable Object snapshot storage.

### 3) URL is source of truth for active branch selection
Thread state in store remains important for runtime UX, but branch identity must survive refresh/navigation/share links.

### 4) Roll out behind a feature flag
Use `branchingV2` flag so we can run shadow validation and rollback safely.

## Proposed Data Model (Additive)

### New table: `ChatBranch`
- `id` (uuid, PK)
- `chatId` (FK to `Chat`)
- `parentBranchId` (nullable FK to `ChatBranch`)
- `title` (text, not null)
- `createdFromMessageId` (nullable FK to `Message`)
- `createdFromStart` (nullable int)
- `createdFromEnd` (nullable int)
- `createdFromExcerpt` (nullable text)
- `headMessageId` (nullable FK to `Message`)
- `createdAt` (timestamp)
- `archivedAt` (nullable timestamp)

### Optional message extension
- Add `branchId` on `Message` for fast branch retrieval and integrity checks.

Recommendation: add `Message.branchId` in V2. It simplifies queries and avoids expensive repeated branch inference.

## API / Service Surface

Add a `lib/branching/` domain layer with:
- `ensureRootBranch(chatId)`
- `getBranchGraph(chatId)`
- `createBranchFromSelection({ chatId, parentBranchId, messageId, span, excerpt, title? })`
- `renameBranch({ chatId, branchId, title })`
- `resolveActiveBranch({ chatId, requestedBranchId? })`
- `buildContextForBranchSend({ chatId, branchId, nextUserMessage })`

Update send path:
- Replace history truncation (`previousMessages = messageThreadToParent.slice(-5)`) with branch-aware context builder and token-budgeted truncation.

## URL and State Model
- Add query param parsing for `branch` on:
  - `/chat/:id`
  - `/project/:projectId/chat/:chatId`
  - `/share/:id` (read-only branch resolution)
- Keep existing thread epoch behavior (`components/chat-system.tsx`) but key it by active branch changes as well.
- Default branch fallback order:
  1. `branch` query param if valid
  2. last active branch for chat (if stored)
  3. root branch

## UX Plan

### V2.1 (Core UX)
- Keep current sibling controls as compatibility fallback.
- Add branch tree section in sidebar:
  - Expand/collapse branch nodes
  - Active branch highlight
  - Rename branch action
- Add branch badge/metadata on message rows (origin and branch title where helpful).

### V2.2 (Advanced UX from Branch-Chat)
- Add branch-from-selection action on assistant content.
- Add parent context panel and compare mode.
- Add quick "Branch message" action in message actions row.

## Migration Strategy

### Backfill
1. Create root branch per chat.
2. Assign existing messages to root branch (`Message.branchId = rootBranchId`) if adding `Message.branchId`.
3. Derive initial `headMessageId` using current default leaf heuristic.

### Compatibility
- If branch records are missing, synthesize root branch at read time and repair asynchronously.
- If `branch` query param is invalid, fall back safely and emit telemetry.

## Rollout Phases

### Phase 0: Baseline + Flag (1-2 days)
- Add `branchingV2` feature flag.
- Add instrumentation for:
  - branch create/switch/send
  - invalid branch query fallback
  - context token size before/after new builder
- Add fixtures for multi-branch chat DAGs.

### Phase 1: Schema + Branch Services (2-3 days)
- Add migrations for `ChatBranch` (+ optional `Message.branchId`).
- Build `lib/branching` service layer and read/write paths.
- Implement root branch bootstrapping and backfill scripts.

### Phase 2: Branch-Aware Send Context (2-3 days)
- Implement chain-based context assembly modeled after `Branch-Chat`.
- Add token-budget truncation policy after chain assembly.
- Update `app/(chat)/api/chat/route.ts` and `app/(chat)/api/chat/get-thread-up-to-message-id.ts` callers accordingly.

### Phase 3: URL-State + Thread Rehydration (2 days)
- Resolve active branch from URL on all chat surfaces.
- Stop relying solely on default newest-leaf initialization.
- Ensure refresh/share behavior remains deterministic.

### Phase 4: Sidebar Tree + Branch Actions (2-4 days)
- Add branch tree UI and rename support.
- Add "branch message" action.
- Preserve current sibling controls until confidence is high.

### Phase 5: Selection Branching + Compare Mode (2-3 days)
- Add selection popover and provenance capture (`span`, `excerpt`).
- Add parent context sheet and compare layout.

### Phase 6: Hardening + Docs (1-2 days)
- Complete tests and smoke scenarios.
- Update docs:
  - `docs/roadmap/branching.mdx` from placeholder to implementation guide
  - add cookbook/usage page for branch workflows

## Testing Plan

### Unit
- Branch tree construction and ordering.
- Branch-chain context assembly with fork cutoffs.
- Title derivation and sanitization.
- Invalid/missing branch fallback behavior.

### Integration
- Send message on child branch uses correct ancestry.
- Branch creation from message + selection provenance.
- URL branch resolution across main/project/share routes.

### E2E / Smoke
- Extend `docs/local-runtime-smoke-scenarios.md` with branching V2 scenarios:
  - deep-link into branch
  - refresh stability
  - create branch from selection
  - compare parent/child context

## Risks and Mitigations

### Risk: context inflation increases latency/cost
Mitigation:
- Apply token-budget truncation after assembly.
- Add telemetry and fail-safe clipping.

### Risk: migration complexity on large chats
Mitigation:
- Incremental backfill with repair-on-read fallback.
- Idempotent scripts.

### Risk: branch switching during streaming creates stale UI state
Mitigation:
- Reuse current stream stop + data stream reset patterns in `MessageTreeProvider`.
- Add branch switch guard while stream is active where necessary.

### Risk: shared links leak non-selected branches unintentionally
Mitigation:
- Keep share mode read-only.
- Validate branch belongs to shared chat and only load requested branch path.

## Definition of Done
- Branch IDs are durable and URL-addressable.
- Message send context is branch-chain aware (not fixed 5-message slice).
- Users can create/navigate/rename branches from UI.
- Branch behavior is consistent across chat/project/share pages.
- Branching docs are fully updated (no "coming soon" placeholders).

## Suggested Sequence If We Want Fast Value
1. Phase 0-2 first (data and context correctness).
2. Phase 3 (URL durability).
3. Phase 4-5 (UX parity with Branch-Chat).
4. Phase 6 (docs + hardening).
