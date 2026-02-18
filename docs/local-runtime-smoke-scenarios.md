# Local Runtime Smoke Scenarios

## Purpose
Define a complete local smoke suite as real user journeys, including edge cases, to validate runtime parity after the RedwoodSDK + Cloudflare migration.

## Deep Dive Snapshot
- Public pages: `/`, `/share/:id`, `/privacy`, `/terms`, `/docs`, `/docs/*` redirect.
- Auth pages: `/login`, `/register`.
- Protected pages: `/chat/:id`, `/project/:projectId`, `/project/:projectId/chat/:chatId`, `/settings/*`.
- APIs: `/api/auth/*`, `/api/chat`, `/api/chat/:id/stream`, `/api/files/upload`, `/api/files/*`, `/api/chat-model`, `/api/mcp/oauth/callback`, `/api/dev-login`, `/api/cron/cleanup`.
- Core user features: chat send/edit/stop, model selection, sidebar history/search, sharing + cloning, projects, model settings, connectors settings, tool/artifact rendering.

## Scenario List (User Flows + Edge Cases)

Legend:
- `Gate`: `always`, `auth`, `attachments`, `mcp`, `cron-secret`.
- `Persona`: `Anonymous`, `Authenticated`, `Any`.

### Runtime, Routing, and Session Gates
| ID | Gate | Persona | What user does (main scenario) | Edge cases that must also pass | Pass criteria |
| --- | --- | --- | --- | --- | --- |
| RT-001 | always | Anonymous | User pastes `/chat/<id>` directly in address bar while logged out. | Also verify `/project/<id>` and `/settings` direct hits; stale cookies do not bypass gate. | User lands on `/login`; no protected content flashes. |
| RT-002 | auth | Authenticated | Signed-in user manually opens `/login` and `/register`. | Repeat after hard refresh; check both routes separately. | User is redirected to `/`. |
| RT-003 | always | Any | User opens `/privacy`. | Mobile viewport and desktop viewport both render. | Policy page loads with content, status 200. |
| RT-004 | always | Any | User opens `/terms`. | Mobile and desktop render check. | Terms page loads with content, status 200. |
| RT-005 | always | Any | User opens `/docs` then tries `/docs/some-page`. | Include query params in `/docs/*` path. | `/docs` page renders; `/docs/*` redirects to external docs URL. |
| RT-006 | always | Any | User (or monitor) requests `/robots.txt` and `/sitemap.xml`. | Validate body not empty and content-type correct. | Both routes return 200 with expected text/XML content. |
| RT-007 | always | Any | User requests `/manifest.webmanifest`. | Validate JSON parse and icon list presence. | Returns 200 with valid manifest JSON. |
| RT-008 | always | Any | User hits `/api/dev-login`. | In non-development mode it must be blocked (404). | In dev: session cookie + redirect to `/`; non-dev: 404. |

### Anonymous User Journeys
| ID | Gate | Persona | What user does (main scenario) | Edge cases that must also pass | Pass criteria |
| --- | --- | --- | --- | --- | --- |
| AN-001 | always | Anonymous | User opens home page and starts exploring chat UI without signing in. | Refresh page and confirm state remains anonymous. | Welcome, composer, and anonymous affordances render; no user menu/history persistence. |
| AN-002 | always | Anonymous | User attempts to open persisted chat URL `/chat/<id>`. | Repeat from history back/forward navigation. | User is pushed back to anonymous-safe route (`/`). |
| AN-003 | always | Anonymous | User clicks Share button in chat header. | Also test share action from a chat item menu if available. | Login prompt is shown; no visibility mutation runs. |
| AN-004 | always | Anonymous | User opens Tools selector in composer footer. | Try selecting each visible tool option. | Login prompt appears; tool selection does not activate. |
| AN-005 | attachments | Anonymous | User clicks attachment button and tries attach flow. | Also test drag-drop and paste file attempts. | Attach blocked with sign-in prompt/error; no upload request succeeds. |
| AN-006 | always | Anonymous | User opens model selector and tries models not in anonymous allowlist. | Verify disabled model entries cannot be selected. | Restricted models are blocked/disabled and do not become active. |

### Authenticated Core Chat Journeys
| ID | Gate | Persona | What user does (main scenario) | Edge cases that must also pass | Pass criteria |
| --- | --- | --- | --- | --- | --- |
| AU-001 | auth | Authenticated | User signs in (dev login), returns to chat shell. | Hard refresh after login; check sidebar user nav and credits. | Session is active and authenticated UI renders. |
| AU-002 | auth | Authenticated | User clicks New Chat from sidebar. | Keyboard shortcut variant (`Cmd/Ctrl+Shift+O`) also works. | Route goes to `/` and starts fresh draft context. |
| AU-003 | auth | Authenticated | User sends a prompt from a fresh chat. | First-message flow with URL change and persisted chat id. | URL transitions to `/chat/:id`, message appears, assistant response arrives. |
| AU-004 | auth | Authenticated | User edits a prior user message and resubmits. | Ensure trailing assistant/user branch is trimmed correctly. | Updated branch replaces old continuation. |
| AU-005 | auth | Authenticated | User clicks Copy on user and assistant messages. | Empty/non-text message copy should fail gracefully. | Copy succeeds for text, with success feedback and no crash. |
| AU-006 | auth | Authenticated | User upvotes/downvotes assistant response. | Repeated clicks should honor disabled state. | Vote mutation succeeds and control state updates correctly. |
| AU-007 | auth | Authenticated | User opens Search Chats dialog and navigates to selected chat. | Trigger by button and keyboard shortcut (`Cmd/Ctrl+K`). | Dialog opens, results filter, selected chat route loads. |
| AU-008 | auth | Authenticated | User renames, pins/unpins, and deletes chats from sidebar menu. | Active-chat deletion should route safely to `/`. | Sidebar and chat list update immediately and remain consistent after refresh. |
| AU-009 | auth | Authenticated | User stops an in-progress stream from composer submit/stop control. | Stop during `streaming` and `submitted` states. | Stream halts and UI returns to non-streaming state without hanging. |
| AU-010 | auth | Authenticated | User changes model in model selector. | Reload page and verify selected model cookie behavior. | `/api/chat-model` cookie sync works and selected model persists. |

### Sharing and Clone Journeys
| ID | Gate | Persona | What user does (main scenario) | Edge cases that must also pass | Pass criteria |
| --- | --- | --- | --- | --- | --- |
| SH-001 | auth | Authenticated | User opens share dialog and makes chat public. | Repeat on chat already public. | Visibility changes to public and share URL is available. |
| SH-002 | always | Any | Another user opens `/share/:id`. | Anonymous viewer and authenticated viewer both tested. | Shared chat renders read-only with expected content. |
| SH-003 | auth | Authenticated | Owner switches shared chat back to private. | Existing shared link opened in new session after toggle. | Shared URL becomes unavailable/private. |
| SH-004 | auth | Authenticated | Viewer clicks Save/Clone on shared chat. | Clone with attachment/document content in source chat. | New private chat is created and editable at `/chat/:id`. |
| SH-005 | always | Any | Viewer on shared page attempts to edit or send. | Check no editable composer appears. | Shared thread remains read-only. |
| SH-006 | auth | Authenticated | User copies share link from dialog. | Copy action from both info and shared states in dialog. | Clipboard gets valid `/share/:id` URL. |

### Project Journeys
| ID | Gate | Persona | What user does (main scenario) | Edge cases that must also pass | Pass criteria |
| --- | --- | --- | --- | --- | --- |
| PR-001 | auth | Authenticated | User creates project from sidebar “New project”. | Empty name blocked; cancel path works. | New project appears in sidebar and route loads `/project/:id`. |
| PR-002 | auth | Authenticated | User opens project home. | Project with no chats and with existing chats both render correctly. | Project header, instructions control, and input area render. |
| PR-003 | auth | Authenticated | User sets and saves project instructions. | Reopen dialog, edit, and clear instructions. | Instructions persist and reload correctly. |
| PR-004 | auth | Authenticated | User renames project from sidebar menu. | Icon/color edits in same dialog. | Updated metadata appears in sidebar and project page. |
| PR-005 | auth | Authenticated | User sends first message from `/project/:id`. | Browser refresh after route transition. | Route transitions to `/project/:id/chat/:chatId` and chat is linked to project. |
| PR-006 | auth | Authenticated | User manages project chat item (rename/delete/share). | Deleting current project chat while viewing it. | Actions succeed and list/route state remain coherent. |
| PR-007 | auth | Authenticated | User deletes project from sidebar. | Delete while currently inside that project's route. | Project is removed and route safely falls back to `/`. |

### Settings Journeys (Models + Connectors)
| ID | Gate | Persona | What user does (main scenario) | Edge cases that must also pass | Pass criteria |
| --- | --- | --- | --- | --- | --- |
| ST-001 | auth | Authenticated | User opens `/settings` general page. | Refresh and direct navigation from URL bar. | Page renders without client/server errors. |
| ST-002 | auth | Authenticated | User opens `/settings/models` and toggles model switches. | Toggle several models quickly and reload. | Preferences persist and table remains stable. |
| ST-003 | auth | Authenticated | User searches models and presses refresh button. | No-result search term path. | Filtered results behave correctly; refresh invalidates data. |
| ST-004 | auth | Authenticated | User verifies enabled models map to model selector options. | Disable active model and ensure fallback selection is valid. | Selector reflects settings; app does not break on disabled active model. |
| ST-005 | auth | Authenticated | User opens `/settings/connectors`. | Empty state and populated state both validated. | Connectors page loads and sections render correctly. |
| ST-006 | mcp | Authenticated | User tries creating connector with invalid values, then valid values. | Name normalization/duplicate namespace behavior. | Validation errors appear for invalid input; valid connector can be created. |
| ST-007 | mcp | Authenticated | User opens connector details, toggles enabled, and uninstalls. | Built-in/global connector edit restrictions respected. | Toggle and uninstall behavior match permissions and update list state. |
| ST-008 | mcp | Any | OAuth callback invoked with missing/error params. | Invalid `state` and provider error payload both handled. | Redirect to connectors page with readable error query. |

### Tool, Canvas, and Artifact Journeys
| ID | Gate | Persona | What user does (main scenario) | Edge cases that must also pass | Pass criteria |
| --- | --- | --- | --- | --- | --- |
| TL-001 | auth | Authenticated | User opens fixture chat containing reasoning part and toggles it. | Toggle repeatedly and across reload. | Reasoning block expands/collapses without corruption. |
| TL-002 | auth | Authenticated | User views research-progress cards from tool updates. | Progress card expanded and collapsed states. | Research updates render correctly. |
| TL-003 | auth | Authenticated | User opens sources from research annotations. | Source list open in desktop and mobile dialogs/drawers. | Source cards and outbound links render. |
| TL-004 | auth | Authenticated | User opens generated image output and image modal. | Close/reopen modal; image actions present. | Generated image renders and modal interaction works. |
| TL-005 | auth | Authenticated | User clicks document tool preview to open artifact panel. | Opening from latest and older artifact-producing messages. | Artifact panel opens with expected document data. |
| TL-006 | auth | Authenticated | User closes artifact panel from close action. | Reopen via document preview after close. | Panel closes cleanly and can be reopened. |
| TL-007 | auth | Authenticated | User checks code-execution tool UI tabs (Code/Output). | Output-only case and no-output case. | Tabs render and output area displays expected content. |
| TL-008 | auth | Authenticated | User sees follow-up suggestions on last assistant response. | Suggestions should not appear on non-last assistant messages. | Suggestions appear only in correct context. |

### API and Runtime Endpoint Journeys
| ID | Gate | Persona | What user does (main scenario) | Edge cases that must also pass | Pass criteria |
| --- | --- | --- | --- | --- | --- |
| API-001 | always | Any | Client posts model selection to `/api/chat-model`. | Invalid payload path tested (`model` missing/non-string). | Valid request sets cookie; invalid request returns 400. |
| API-002 | attachments | Anonymous | Anonymous upload attempt to `/api/files/upload`. | Request with and without multipart body. | Unauthorized path returns 401. |
| API-003 | attachments | Authenticated | Authenticated upload with unsupported mime or oversize file. | Unsupported type and oversize both tested. | Request rejected with 400 and readable error. |
| API-004 | attachments | Any | User tries to fetch private attachment without access rights. | Logged-out and wrong-user access attempts. | Download route returns 403. |
| API-005 | attachments | Any | User requests attachment with `HEAD` and byte `Range`. | Invalid range should return 416; valid range should return 206. | Route handles HEAD/range semantics correctly. |
| API-006 | always | Any | Client calls `/api/chat/:id/stream` without `messageId`. | Missing/invalid ids, non-owner access to private chat. | Bad request/not found/forbidden responses are correct. |
| API-007 | cron-secret | Any | Call `/api/cron/cleanup` without bearer or wrong bearer. | Wrong method (non-GET) check included. | Unauthorized/method checks return expected status. |
| API-008 | cron-secret | Any | Call `/api/cron/cleanup` with valid bearer. | Response body structure check (`success`, `timestamp`, `results`). | Returns success payload and no runtime error. |

## Run Log Table (Track Until Pass)

Use this table during execution. Mark each attempt as `P`, `F`, or `S`.

| Scenario ID | Gate | Attempt 1 | Attempt 2 | Attempt 3 | Attempt 4 | Pass Attempt # | Current Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RT-001 | always | - | - | - | - | - | Not run |  |
| RT-002 | auth | - | - | - | - | - | Not run |  |
| RT-003 | always | - | - | - | - | - | Not run |  |
| RT-004 | always | - | - | - | - | - | Not run |  |
| RT-005 | always | - | - | - | - | - | Not run |  |
| RT-006 | always | - | - | - | - | - | Not run |  |
| RT-007 | always | - | - | - | - | - | Not run |  |
| RT-008 | always | - | - | - | - | - | Not run |  |
| AN-001 | always | - | - | - | - | - | Not run |  |
| AN-002 | always | - | - | - | - | - | Not run |  |
| AN-003 | always | - | - | - | - | - | Not run |  |
| AN-004 | always | - | - | - | - | - | Not run |  |
| AN-005 | attachments | - | - | - | - | - | Not run |  |
| AN-006 | always | - | - | - | - | - | Not run |  |
| AU-001 | auth | - | - | - | - | - | Not run |  |
| AU-002 | auth | - | - | - | - | - | Not run |  |
| AU-003 | auth | - | - | - | - | - | Not run |  |
| AU-004 | auth | - | - | - | - | - | Not run |  |
| AU-005 | auth | - | - | - | - | - | Not run |  |
| AU-006 | auth | - | - | - | - | - | Not run |  |
| AU-007 | auth | - | - | - | - | - | Not run |  |
| AU-008 | auth | - | - | - | - | - | Not run |  |
| AU-009 | auth | - | - | - | - | - | Not run |  |
| AU-010 | auth | - | - | - | - | - | Not run |  |
| SH-001 | auth | - | - | - | - | - | Not run |  |
| SH-002 | always | - | - | - | - | - | Not run |  |
| SH-003 | auth | - | - | - | - | - | Not run |  |
| SH-004 | auth | - | - | - | - | - | Not run |  |
| SH-005 | always | - | - | - | - | - | Not run |  |
| SH-006 | auth | - | - | - | - | - | Not run |  |
| PR-001 | auth | - | - | - | - | - | Not run |  |
| PR-002 | auth | - | - | - | - | - | Not run |  |
| PR-003 | auth | - | - | - | - | - | Not run |  |
| PR-004 | auth | - | - | - | - | - | Not run |  |
| PR-005 | auth | - | - | - | - | - | Not run |  |
| PR-006 | auth | - | - | - | - | - | Not run |  |
| PR-007 | auth | - | - | - | - | - | Not run |  |
| ST-001 | auth | - | - | - | - | - | Not run |  |
| ST-002 | auth | - | - | - | - | - | Not run |  |
| ST-003 | auth | - | - | - | - | - | Not run |  |
| ST-004 | auth | - | - | - | - | - | Not run |  |
| ST-005 | auth | - | - | - | - | - | Not run |  |
| ST-006 | mcp | - | - | - | - | - | Not run |  |
| ST-007 | mcp | - | - | - | - | - | Not run |  |
| ST-008 | mcp | - | - | - | - | - | Not run |  |
| TL-001 | auth | - | - | - | - | - | Not run |  |
| TL-002 | auth | - | - | - | - | - | Not run |  |
| TL-003 | auth | - | - | - | - | - | Not run |  |
| TL-004 | auth | - | - | - | - | - | Not run |  |
| TL-005 | auth | - | - | - | - | - | Not run |  |
| TL-006 | auth | - | - | - | - | - | Not run |  |
| TL-007 | auth | - | - | - | - | - | Not run |  |
| TL-008 | auth | - | - | - | - | - | Not run |  |
| API-001 | always | - | - | - | - | - | Not run |  |
| API-002 | attachments | - | - | - | - | - | Not run |  |
| API-003 | attachments | - | - | - | - | - | Not run |  |
| API-004 | attachments | - | - | - | - | - | Not run |  |
| API-005 | attachments | - | - | - | - | - | Not run |  |
| API-006 | always | - | - | - | - | - | Not run |  |
| API-007 | cron-secret | - | - | - | - | - | Not run |  |
| API-008 | cron-secret | - | - | - | - | - | Not run |  |

## Exit Criteria for Smoke Execution Phase
- Every `always` scenario ends in `P`.
- Every gated scenario ends in `P` or `S` with explicit reason in `Notes`.
- No scenario remains `Not run`.
- Any `F` includes a fix note and a subsequent passing attempt.
