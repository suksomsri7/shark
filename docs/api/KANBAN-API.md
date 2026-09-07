# SHARK Task Board API

Machine readable contract: `/api/v1/kanban/openapi.json` (OpenAPI 3.1.0, no API key needed).
Base URL: `https://shark.in.th/api/v1/kanban` - contract version 1.0.0 - 56 operations.
Generated from the operation registry by `scripts/gen-kanban-api-docs.mts`. Do not edit by hand: run the script.

## Who this is for

- **AI agents** running a shop's task boards on behalf of its owner. Read the Conventions and the Error codes table first: every failure has a stable `code` to branch on, and `message_th` is already worded for a Thai shop owner, so it can be shown as is.
- **Developers** wiring another system into the boards (a helpdesk, a form, an n8n flow, a nightly report). Everything in this document is generated from the same registry the live API dispatches from, so nothing here can drift from the running code.

## Authentication and scopes

Send `Authorization: Bearer <api key>`. Keys are created by the shop owner in the task board settings (Task boards > Settings > API); the raw key is shown once.

A key carries a list of scopes. Scopes are the same permission keys the human roles use, so a key can never do more than a person could. Bundles are ready made sets; the owner can still tick single scopes on top.

| Bundle | What it can do | Scopes |
| --- | --- | --- |
| `kanban-read` | Read every board of the bound task board system: boards, columns, cards, comments and attachments. No writes at all. | `kanban.board.read` |
| `kanban-edit` | Everything in kanban-read plus creating and editing boards, columns, cards, labels, comments and attachments. Acts as EDITOR on every board. | `kanban.board.read` `kanban.board.create` `kanban.board.rename` `kanban.column.create` `kanban.card.create` `kanban.card.update` `kanban.card.move` `kanban.card.delete` `kanban.card.comment` `kanban.card.attach` `kanban.label.manage` |
| `kanban-admin` | Everything in kanban-edit plus board members, archiving boards and columns, templates and automation. Acts as ADMIN on every board. | `kanban.board.read` `kanban.board.create` `kanban.board.rename` `kanban.column.create` `kanban.card.create` `kanban.card.update` `kanban.card.move` `kanban.card.delete` `kanban.card.comment` `kanban.card.attach` `kanban.label.manage` `kanban.board.delete` `kanban.board.member.manage` `kanban.column.delete` `kanban.template.manage` `kanban.automation.manage` `kanban.report.view` |

### The key's board role

A key has no board membership: nobody invites it to a board. Its role on **every** board of the system it is bound to is derived from its scopes instead:

| Holds | Board role | Means |
| --- | --- | --- |
| `kanban.board.member.manage` | `ADMIN` | Everything, including members, WIP limits, the done column flag and `force` moves. |
| any write scope (cards, columns, labels, comments, attachments, board creation) | `EDITOR` | Create and change content on every board, but not membership. |
| read scopes only | `VIEWER` | Read only. |

`GET /ping` tells you which one you got, so an integration can check it once at startup instead of guessing from a 403.

A key also **sees every board of the system it is bound to, including private ones**: the shop owner issued the key and chose its scopes, exactly like an automation of their own. A board of another shop, or of another task board system, answers 404 - never 403.

A key is normally bound to one task board system. If it is not, every call must carry `X-Shark-System: <AppSystem id>`. Calls that need a scope the key lacks fail with 403 `scope_missing` and the missing scope in `hint`.

## Conventions

These are the rules of the module, copied verbatim from the contract description in `/api/v1/kanban/openapi.json`:

REST API for the SHARK task board module (Kanban). One API key works inside one task board system (AppSystem of type KANBAN) and sees every board of that system.

Conventions that apply to every operation:
1. Authentication is `Authorization: Bearer <api key>`. The key carries its own scopes; an operation returns 403 `scope_missing` when the key lacks the scope listed as `x-shark-scope`.
2. The board role of a key comes from its scopes, not from board membership: a key holding `kanban.board.member.manage` acts as ADMIN on every board, a key holding any write scope acts as EDITOR, a read-only key acts as VIEWER.
3. `X-Shark-System` selects the task board system and is only needed when the key is not bound to one; if the key is bound and the header disagrees, the call fails with 403 `system_mismatch`.
4. Timestamps are ISO-8601 strings in UTC (`dueAt`, `createdAt`, `completedAt`). A due date with no time means the end of that Thai calendar day as stored by the app.
5. Card and column order is a fractional index string in `position`. Never compute it yourself: move a card or a column by naming its neighbours (`beforeCardId` / `afterCardId`), and the server returns the new `position`.
6. Every write (POST, PATCH, PUT, DELETE) requires an `Idempotency-Key` header. Retrying with the same key and the same body replays the stored response with header `Idempotent-Replayed: true`; the same key with a different body fails with 409 `idempotency_conflict`.
7. Operations marked `x-shark-kind: danger` are hard to undo (archiving a board, a column or a card, removing a member). They additionally require `confirm: true` (a real boolean) and a `reason` of at least 5 characters in the body; the reason is stored in the audit log.
8. Success is `{ data, page?, requestId }`. Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }` - see the `Error` schema for every code. `requestId` is also returned in the `X-Request-Id` header; quote it when reporting a problem.
9. A board the key cannot see answers 404 `not_found`, never 403 - the API never confirms that a private board exists.
10. Rate limits are per key and per class: 300 reads and 60 writes per minute. A 429 response carries `Retry-After`; successful responses carry `X-RateLimit-Remaining`.
11. Some list operations can also render CSV: send `Accept: text/csv` and, when the operation lists `text/csv` under its 200 response, you get `text/csv; charset=utf-8` with a UTF-8 BOM and `Content-Disposition: attachment` instead of the JSON envelope. Every cell is safe against spreadsheet formula injection.
12. Outgoing webhooks. The shop can subscribe an endpoint to any of these events: `kanban.card.created`, `kanban.card.moved`, `kanban.card.assigned`, `kanban.card.completed`, `kanban.card.due_soon`, `kanban.card.overdue`, `kanban.checklist.completed`, `kanban.comment.added`, `kanban.card.archived`. Each delivery is `POST` with `X-Shark-Event`, a body of `{ type, payload, sentAt }` and header `X-Shark-Signature` = HMAC-SHA256 of the raw body with the endpoint secret, lowercase hex. Delivery is at least once (5 retries), so handlers must be idempotent. Full list with one example body per event: docs/api/KANBAN-API.md, section Webhooks.

### Shapes of a reply

- **Lists are plain arrays.** There is no `page` / `pageSize` pagination anywhere in this module: `GET /boards`, `GET /boards/{id}/cards`, `GET /boards/{id}/columns`, `GET /boards/{id}/labels`, `GET /cards/{id}/comments` and `GET /cards/{id}/attachments` return the whole set in `data`.
- **`GET /search` is cursor based.** `data` is the array of cards; the reply adds `total` and `nextCursor` next to `data` at the top level. Ask for the next page by sending `cursor=<nextCursor>`; `nextCursor: null` means you have everything. `take` (1-100, default 20) sets the page size.
- **Activity lists carry their own cursor.** `GET /boards/{id}/activity` and `GET /cards/{id}/activity` answer `{ items, nextCursor }` inside `data`.
- **No `Date` objects and no shop ids leak out.** Timestamps are ISO-8601 UTC strings or `null`; `tenantId` and `systemId` are never echoed back - the key already knows where it is.
- **CSV.** One operation renders CSV when asked with `Accept: text/csv`: `GET /boards/{id}/cards`. The file is UTF-8 with a BOM and comes back as an attachment instead of the JSON envelope.

## Error codes

Branch on `error.code`, never on the message text. The list is shared by every SHARK REST module, so a few codes below can only come from another module; they are marked as such.

| Code | HTTP | Meaning | What to do |
| --- | --- | --- | --- |
| `unauthorized` | 401 | No `Authorization: Bearer` header, or the key is unknown or revoked. | Check the header spelling and that the key was not revoked in the task board settings. |
| `key_expired` | 401 | The key was valid but its expiry date has passed. | Rotate the key in the task board settings; the old key stops working immediately. |
| `system_required` | 400 | The key is not bound to one task board system and no `X-Shark-System` header was sent. | Send `X-Shark-System: <AppSystem id>`, or use a key that is bound to a single system. |
| `system_mismatch` | 403 | `X-Shark-System` points at a different system than the key is bound to, or at a system that is not a task board of this shop. | Drop the header, or send the id the key is bound to. |
| `scope_missing` | 403 | The key does not hold the scope this operation needs. | Read `hint` for the exact scope name, then add it to the key (or pick a wider bundle) and retry. |
| `invalid_json` | 400 | The request body is not parseable JSON. | Send valid JSON and `Content-Type: application/json`. |
| `validation` | 422 | The payload did not match the schema. `details[]` lists every offending field. | Fix the fields in `details[]`. Unknown fields are rejected on purpose, so check spelling too. |
| `idempotency_required` | 400 | A write was sent without the `Idempotency-Key` header. | Generate one key per logical attempt (a UUID is fine) and send it. |
| `idempotency_conflict` | 409 | The same `Idempotency-Key` was reused with a different body. | Use a fresh key for a different request; reuse the old key only to retry the identical one. |
| `idempotency_in_progress` | 409 | A request with this key is still running. | Wait a moment and retry with the same key; you will get the original response. |
| `confirm_required` | 409 | A danger operation was called without `confirm: true`. | Ask a human first, then resend with `confirm: true` and a `reason`. |
| `not_found` | 404 | No such operation, or the board, column, card, label, checklist, comment or attachment does not exist inside this task board system. A board the key may not see answers this too, never 403. | Check the path against this document, and that the id belongs to the same system the key is bound to. |
| `method_not_allowed` | 405 | The path exists but not with this HTTP method. The `Allow` header lists what works. | Use one of the methods in `Allow`. |
| `rate_limited` | 429 | Too many calls for this key: 300 reads or 60 writes per minute. | Wait `Retry-After` seconds and retry; watch `X-RateLimit-Remaining` to slow down before you hit it. |
| `period_locked` | 409 | Accounting specific (a closed accounting period). The task board module never returns this code. | Nothing to do here; it cannot happen on a task board endpoint. |
| `state_conflict` | 409 | The record is not in a state that allows this: the card is archived, the target column is at its WIP limit, the two columns belong to different boards, or the board has no done column. | Read the current state first (`GET /cards/{id}`, `GET /boards/{id}/columns`). A WIP limit can be overridden with `force: true` by a key that acts as board ADMIN. |
| `duplicate` | 409 | A conflicting record already exists, for example a label name that is already used on that board. | Reuse the existing record, or send a different unique value. |
| `forbidden` | 403 | The operation is refused by a business rule, not by the scope check: the key's board role is too low, the key has no owning user (comments, `my-tasks`), or it asked for someone else's task inbox. | Read `message_en`. A wider bundle (`kanban-admin`) or a key created by the right user usually fixes it. |
| `unprocessable` | 422 | The request was understood but cannot be completed as asked, for example archiving a column that still holds cards. | Read `message_en` and `message_th`; the Thai message is safe to show to the shop owner. |
| `upstream_unavailable` | 503 | An external service an operation depends on is not configured or not reachable right now. | Retry later; this is not caused by the request itself. |

## Operations

### Read operations

Safe to call at any time. No `Idempotency-Key`, nothing is written, nothing is audited. 17 of the 56 operations.

#### `boards.activity`

**GET /boards/{id}/activity** - History of everything that happened on a board, newest first. · scope: `kanban.board.read` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `take` | integer | no | How many entries to return. Default 20. · min 1 · max 100 |
| `cursor` | string | no | `nextCursor` of the previous page. · max length 200 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/boards/123/activity" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `boards.archived`

**GET /boards/{id}/archive** - What is in the archive of this board: archived cards and archived columns. · scope: `kanban.board.read` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `q` | string | no | Filter by card or column name. · max length 200 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/boards/123/archive" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `cards.list`

**GET /boards/{id}/cards** - List the cards of one board, with column, assignee, status and text filters. · scope: `kanban.board.read` · read · AI tool: `kanban_list_cards` · `Accept: text/csv` supported

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `columnId` | string | no | Only cards in this column. · max length 40 |
| `assignee` | string | no | Only cards assigned to this user id. · max length 40 |
| `status` | enum("open", "done", "all") | no | open (not completed, default), done, or all. |
| `q` | string | no | Free text on the card title. · max length 200 |
| `includeArchived` | enum("true", "false") | no | Include archived cards. Default false. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/boards/123/cards" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `columns.list`

**GET /boards/{id}/columns** - List the active columns of a board with how many cards are in each. · scope: `kanban.board.read` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/boards/123/columns" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `labels.list`

**GET /boards/{id}/labels** - List the labels of a board with how many cards carry each one. · scope: `kanban.board.read` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/boards/123/labels" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `boards.members.list`

**GET /boards/{id}/members** - List the people explicitly invited to this board and their board role. · scope: `kanban.board.read` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/boards/123/members" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `boards.summary`

**GET /boards/{id}/summary** - Counts for one board: cards per column, how many are done, overdue or unassigned. · scope: `kanban.board.read` · read · AI tool: `kanban_board_summary`

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/boards/123/summary" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `boards.get`

**GET /boards/{id}** - Open one board with its active columns and the cards inside each column, plus the role this key has on it. · scope: `kanban.board.read` · read · AI tool: `kanban_get_board`

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/boards/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `boards.list`

**GET /boards** - List every board of this task board system with its card count. · scope: `kanban.board.read` · read · AI tool: `kanban_list_boards`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `includeArchived` | enum("true", "false") | no | Include boards that were archived. Default false. |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/boards" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `cards.activity`

**GET /cards/{id}/activity** - History of one card, newest first. · scope: `kanban.board.read` · read

Path parameters: `id` (required).

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `take` | integer | no | How many entries to return. Default 20. · min 1 · max 100 |
| `cursor` | string | no | `nextCursor` of the previous page. · max length 200 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/cards/123/activity" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `attachments.list`

**GET /cards/{id}/attachments** - List the files attached to a card, oldest first, with a public URL for each one. · scope: `kanban.board.read` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/cards/123/attachments" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `comments.list`

**GET /cards/{id}/comments** - Read every comment on a card, oldest first. Deleted comments are not returned. · scope: `kanban.board.read` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/cards/123/comments" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `cards.get`

**GET /cards/{id}** - Read one card with its description, checklists, comments and attachments. · scope: `kanban.board.read` · read

Path parameters: `id` (required).

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/cards/123" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `my-tasks`

**GET /my-tasks** - The task inbox of one user: cards grouped by due date, checklist items assigned to them and the weekly counters. · scope: `kanban.board.read` · read · AI tool: `kanban_my_tasks`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `userId` | string | no | Whose tasks to read. Only a key with `kanban.board.member.manage` may ask about someone else; other keys read the tasks of the user who created the key. · max length 40 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/my-tasks" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `ping`

**GET /ping** - Check that the API key works, and see which task board system and board role it is bound to. · scope: `kanban.board.read` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/ping" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `search`

**GET /search** - Search cards across every board this key can see, with the same filters as the app. · scope: `kanban.board.read` · read · AI tool: `kanban_search_cards`

| Query | Type | Required | Rules |
| --- | --- | --- | --- |
| `q` | string | no | Free text on the card title. · max length 200 |
| `assignee` | string | no | User id, or the literal `me` for the user who created this key. · max length 40 |
| `label` | string | no | Label name. · max length 60 |
| `due` | enum("overdue", "today", "week", "none") | no | Due bucket. |
| `status` | enum("open", "done") | no | open = not completed, done = completed. |
| `board` | string | no | Only boards whose name contains this text. · max length 120 |
| `take` | integer | no | How many cards to return. Default 20. · min 1 · max 100 |
| `cursor` | string | no | `nextCursor` of the previous page. · max length 400 |

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/search" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

#### `templates.list`

**GET /templates** - Board templates available to this shop (platform templates first, then the shop's own). · scope: `kanban.board.read` · read

No query parameters.

```bash
curl -sS -X GET "https://shark.in.th/api/v1/kanban/templates" \
  -H "Authorization: Bearer $SHARK_API_KEY"
```

### Write operations

Change data. `Idempotency-Key` is required and every success is written to the audit log with the key name. 35 of the 56 operations.

#### `attachments.delete`

**DELETE /attachments/{id}** - Remove one attachment from a card. If it was the card cover, the cover is cleared too. · scope: `kanban.card.attach` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/kanban/attachments/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `cards.create`

**POST /boards/{id}/cards** - Create a card in a column of this board. · scope: `kanban.card.create` · write · AI tool: `kanban_create_card`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `columnId` | string | yes | Column the card starts in (must belong to this board). · min length 1 · max length 40 |
| `title` | string | yes | What has to be done. · min length 1 · max length 300 |
| `description` | string or null | no | Longer description (HTML is sanitised). · max length 20000 |
| `assigneeUserId` | string or null | no | User id responsible for the card. · max length 40 |
| `dueAt` | string or null | no | Due date and time. · format date-time |
| `startAt` | string or null | no | Start date and time. · format date-time |
| `labels` | array of string | no | Label names; labels that do not exist yet are created on the board. · max 10 items |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/boards/123/cards" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"columnId":"col_123","title":"Service the rental regulators"}'
```

#### `columns.create`

**POST /boards/{id}/columns** - Add a column to the end of a board. · scope: `kanban.column.create` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | Column name, for example 'In progress'. · min length 1 · max length 60 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/boards/123/columns" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"In progress"}'
```

#### `labels.create`

**POST /boards/{id}/labels** - Create a label on a board. Labels belong to one board, not to the whole shop. · scope: `kanban.label.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | Label name. Must be unique inside the board. · min length 1 · max length 40 |
| `color` | enum("SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE") | yes | One of the six label colours. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/boards/123/labels" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"Urgent","color":"SLATE"}'
```

#### `boards.members.update`

**PATCH /boards/{id}/members/{userId}** - Change the board role of one member. The last declared ADMIN of a board cannot be demoted. · scope: `kanban.board.member.manage` · write

Path parameters: `id`, `userId` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `role` | enum("VIEWER", "EDITOR", "ADMIN") | yes | New board role. |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/kanban/boards/123/members/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"role":"VIEWER"}'
```

#### `boards.members.add`

**POST /boards/{id}/members** - Invite a staff member to a board (or change the role of someone already invited). · scope: `kanban.board.member.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `userId` | string | yes | User id of a staff member of this shop. · min length 1 · max length 40 |
| `role` | enum("VIEWER", "EDITOR", "ADMIN") | no | Board role. Default EDITOR. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/boards/123/members" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"userId":"usr_123"}'
```

#### `boards.restore`

**POST /boards/{id}/restore** - Bring an archived board back into the app. · scope: `kanban.board.delete` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/boards/123/restore" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `boards.star`

**PUT /boards/{id}/star** - Star or unstar a board. The star belongs to the user who created this API key. · scope: `kanban.board.read` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `starred` | boolean | yes | true = star the board, false = remove the star. |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/kanban/boards/123/star" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"starred":true}'
```

#### `boards.update`

**PATCH /boards/{id}** - Change the name, description, colour, branch or visibility of a board. Requires the ADMIN role on that board. · scope: `kanban.board.rename` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | no | min length 1 · max length 120 |
| `description` | string or null | no | max length 2000 |
| `unitId` | string or null | no | max length 40 |
| `visibility` | enum("PRIVATE", "TENANT") | no | - |
| `color` | enum("SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE") | no | - |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/kanban/boards/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `boards.create`

**POST /boards** - Create a board, optionally from a template. · scope: `kanban.board.create` · write · AI tool: `kanban_create_board`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | yes | Board name. · min length 1 · max length 120 |
| `description` | string or null | no | max length 2000 |
| `unitId` | string or null | no | Business unit (branch) the board belongs to. Null = whole company. · max length 40 |
| `visibility` | enum("PRIVATE", "TENANT") | no | PRIVATE (default) or TENANT (everyone in the shop can read it). |
| `color` | enum("SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE") | no | - |
| `template` | string | no | Key or id of a board template (from GET /templates). When given, the board is created with the template columns, labels and cards. · max length 60 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/boards" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"Rental gear"}'
```

#### `cards.assignees.set`

**PUT /cards/{id}/assignees** - Replace the list of people responsible for a card. Everyone newly added is notified. · scope: `kanban.card.update` · write · AI tool: `kanban_assign_card`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `userIds` | array of string | yes | Complete list of user ids responsible for this card. The first one owns the legacy single-assignee field. · max 20 items |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/kanban/cards/123/assignees" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"userIds":["usr_123"]}'
```

#### `attachments.create`

**POST /cards/{id}/attachments** - Attach one file to a card by sending its content base64 encoded. The file type must be an allowed one and its real bytes must match the declared contentType. · scope: `kanban.card.attach` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `filename` | string | yes | File name shown on the card, for example receipt.pdf. · min length 1 · max length 200 |
| `contentType` | string | yes | MIME type of the file, for example image/png. The real bytes must match it; a renamed file is rejected. · min length 1 · max length 120 |
| `dataBase64` | string | yes | File content, base64 encoded, without any data: prefix. Max 10MB once decoded. · min length 1 · max length 13981024 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/cards/123/attachments" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"filename":"receipt.pdf","contentType":"application/pdf","dataBase64":"SGVsbG8gU0hBUksK"}'
```

#### `checklists.create`

**POST /cards/{id}/checklists** - Add a checklist to a card. A card can hold several checklists, each with its own items. · scope: `kanban.card.update` · write · AI tool: `kanban_add_checklist`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `title` | string | yes | Name of the checklist, for example 'Steps' or 'Before delivery'. · min length 1 · max length 120 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/cards/123/checklists" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"title":"Before the boat leaves"}'
```

#### `comments.create`

**POST /cards/{id}/comments** - Write a comment on a card. The author is the user who created this API key, so a key with no owning user cannot comment. · scope: `kanban.card.comment` · write · AI tool: `kanban_add_comment`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `body` | string | yes | Comment text. Mention a person with the markup @[Name](userId); that person gets notified. · min length 1 · max length 5000 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/cards/123/comments" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"body":"Called the supplier, they answer tomorrow."}'
```

#### `cards.complete`

**POST /cards/{id}/complete** - Mark a card done by moving it into the board's done column. · scope: `kanban.card.move` · write · AI tool: `kanban_complete_card`

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/cards/123/complete" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `cards.cover`

**PUT /cards/{id}/cover** - Set or clear the cover image of a card. Only an image attachment already on that card can be the cover. · scope: `kanban.card.attach` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `attachmentId` | string or null | yes | Id of an image attachment of this card to use as its cover. Send null to remove the cover. · max length 40 |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/kanban/cards/123/cover" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"attachmentId":"att_123"}'
```

#### `cards.duplicate`

**POST /cards/{id}/duplicate** - Copy a card (description, dates, labels, assignees and checklists) into the same column. · scope: `kanban.card.create` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/cards/123/duplicate" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `cards.labels.set`

**PUT /cards/{id}/labels** - Replace the labels on a card. · scope: `kanban.card.update` · write · AI tool: `kanban_set_labels`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `labelIds` | array of string | yes | Complete list of label ids of this board (from GET /boards/{id}/labels). · max 20 items |

```bash
curl -sS -X PUT "https://shark.in.th/api/v1/kanban/cards/123/labels" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"labelIds":["lbl_123"]}'
```

#### `cards.move`

**POST /cards/{id}/move** - Move a card to another column and/or another position, by naming its new neighbours. · scope: `kanban.card.move` · write · AI tool: `kanban_move_card`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `toColumnId` | string | yes | Column the card ends up in (same board). · min length 1 · max length 40 |
| `beforeCardId` | string or null | no | Put the card immediately before this card. · max length 40 |
| `afterCardId` | string or null | no | Put the card immediately after this card. Ignored when beforeCardId is given. · max length 40 |
| `force` | boolean | no | Ignore the WIP limit of the target column. Requires the ADMIN role on the board. |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/cards/123/move" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"toColumnId":"col_456"}'
```

#### `cards.restore`

**POST /cards/{id}/restore** - Bring an archived card back onto the board. · scope: `kanban.card.delete` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/cards/123/restore" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `cards.update`

**PATCH /cards/{id}** - Change the title, description, dates or reminder of a card. · scope: `kanban.card.update` · write · AI tool: `kanban_update_card`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `title` | string | no | min length 1 · max length 300 |
| `description` | string or null | no | max length 20000 |
| `dueAt` | string or null | no | ISO-8601 timestamp in UTC, for example 2026-10-05T10:00:00.000Z · format date-time |
| `startAt` | string or null | no | ISO-8601 timestamp in UTC, for example 2026-10-05T10:00:00.000Z · format date-time |
| `reminderMinutesBefore` | integer or null | no | Remind this many minutes before the due time. · min 0 · max 43200 |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/kanban/cards/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `checklist-items.move`

**POST /checklist-items/{id}/move** - Reorder one item inside its checklist by naming its new neighbour. Returns the new position key. · scope: `kanban.card.update` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `beforeItemId` | string or null | no | Put the item immediately before this item of the same checklist. · max length 40 |
| `afterItemId` | string or null | no | Put the item immediately after this item. Ignored when beforeItemId is given. Sending neither moves the item to the end. · max length 40 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/checklist-items/123/move" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `checklist-items.delete`

**DELETE /checklist-items/{id}** - Delete one checklist item. · scope: `kanban.card.update` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/kanban/checklist-items/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `checklist-items.update`

**PATCH /checklist-items/{id}** - Change the text, assignee or due date of one checklist item, and/or tick it off. Sending only done just ticks it. · scope: `kanban.card.update` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `text` | string | no | New text of the item. · min length 1 · max length 500 |
| `assigneeUserId` | string or null | no | New assignee. Send null to clear it. · max length 40 |
| `dueAt` | string or null | no | New due date. Send null to clear it. · format date-time |
| `done` | boolean | no | true ticks the item off, false un-ticks it. |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/kanban/checklist-items/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `checklist-items.create`

**POST /checklists/{id}/items** - Add one item to the end of a checklist, optionally assigned to a person and with its own due date. · scope: `kanban.card.update` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `text` | string | yes | What has to be done in this step. · min length 1 · max length 500 |
| `assigneeUserId` | string or null | no | Staff member responsible for this step. Must be a member of this shop. · max length 40 |
| `dueAt` | string or null | no | Due date and time of this step. · format date-time |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/checklists/123/items" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"text":"Call the supplier"}'
```

#### `checklists.delete`

**DELETE /checklists/{id}** - Delete a whole checklist and every item inside it. Items are removed for good, not archived. · scope: `kanban.card.update` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/kanban/checklists/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `checklists.update`

**PATCH /checklists/{id}** - Rename one checklist. · scope: `kanban.card.update` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `title` | string | yes | New name of the checklist. · min length 1 · max length 120 |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/kanban/checklists/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"title":"Before the boat leaves"}'
```

#### `columns.move-all`

**POST /columns/{id}/move-all** - Move every active card of one column to the end of another column on the same board, keeping their order. · scope: `kanban.card.move` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `toColumnId` | string | yes | Column on the same board that all the cards move to. · min length 1 · max length 40 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/columns/123/move-all" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"toColumnId":"col_456"}'
```

#### `columns.move`

**POST /columns/{id}/move** - Move a column left or right. Without an anchor the column goes to the end of the board. · scope: `kanban.card.move` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `beforeColumnId` | string or null | no | Put this column immediately to the left of that column. · max length 40 |
| `afterColumnId` | string or null | no | Put this column immediately to the right of that column. · max length 40 |

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/columns/123/move" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `columns.restore`

**POST /columns/{id}/restore** - Bring an archived column back. It returns to the end of the board with the cards still attached to it. · scope: `kanban.column.create` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/kanban/columns/123/restore" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `columns.update`

**PATCH /columns/{id}** - Rename a column, set its work-in-progress limit, or turn it into the done column. · scope: `kanban.column.create` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | no | New column name. · min length 1 · max length 60 |
| `wipLimit` | integer or null | no | How many cards may sit in this column at once. 0 or null = no limit. Requires the ADMIN role on that board. · min 0 · max 999 |
| `isDoneColumn` | boolean | no | Mark this column as the 'done' column: cards moved here are counted as completed. Requires the ADMIN role. |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/kanban/columns/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### `comments.delete`

**DELETE /comments/{id}** - Delete a comment. Allowed for the author of the comment, or for a key that holds the board member management scope (board ADMIN). · scope: `kanban.card.comment` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/kanban/comments/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `comments.update`

**PATCH /comments/{id}** - Edit a comment. Only the author can edit their own words, so this works only on comments written by the user who created this API key. · scope: `kanban.card.comment` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `body` | string | yes | Comment text. Mention a person with the markup @[Name](userId); that person gets notified. · min length 1 · max length 5000 |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/kanban/comments/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"body":"Called the supplier, they answer tomorrow."}'
```

#### `labels.delete`

**DELETE /labels/{id}** - Delete a label. The label is removed from every card that carried it; no card is deleted. · scope: `kanban.label.manage` · write

Path parameters: `id` (required).

No body fields.

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/kanban/labels/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)"
```

#### `labels.update`

**PATCH /labels/{id}** - Rename a label or change its colour. Renaming updates every card that carries it. · scope: `kanban.label.manage` · write

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `name` | string | no | New label name. Must stay unique inside the board. · min length 1 · max length 40 |
| `color` | enum("SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE") | no | New colour. |

```bash
curl -sS -X PATCH "https://shark.in.th/api/v1/kanban/labels/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Danger operations

Hard to undo. On top of the write rules they need `confirm: true` and a `reason` of at least 5 characters. An AI agent must ask a human before calling these. 4 of the 56 operations.

#### `boards.members.remove`

**DELETE /boards/{id}/members/{userId}** - Remove a member from a board. On a private board that person immediately stops seeing it. · scope: `kanban.board.member.manage` · danger

Path parameters: `id`, `userId` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why this person is being removed from the board. Stored in the audit log. · min length 5 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/kanban/boards/123/members/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

#### `boards.archive`

**DELETE /boards/{id}** - Archive a whole board. The board and everything on it disappears from the app until it is restored. · scope: `kanban.board.delete` · danger

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why this is being archived. Stored in the audit log. · min length 5 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/kanban/boards/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

#### `cards.archive`

**DELETE /cards/{id}** - Archive a card. It leaves the board and lives in the board archive until restored. · scope: `kanban.card.delete` · danger · AI tool: `kanban_archive_card`

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why the card is being archived. Stored in the audit log. · min length 5 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/kanban/cards/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

#### `columns.archive`

**DELETE /columns/{id}** - Archive a column. The column must be empty first: move its cards away with POST /columns/{id}/move-all. · scope: `kanban.column.delete` · danger

Path parameters: `id` (required).

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `reason` | string | yes | Why this is being archived. Stored in the audit log. · min length 5 |
| `confirm` | enum(true) | yes | Must be exactly true. Proves the caller meant to run an operation that is hard to undo. |

```bash
curl -sS -X DELETE "https://shark.in.th/api/v1/kanban/columns/123" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"reason for the audit log","confirm":true}'
```

## AI tools

16 of these operations are also exposed to the SHARK assistant as tools of the `tasks` skill.
Read tools run straight away. Write and danger tools never run by themselves: they create a proposal that the shop owner confirms in the app, and only then the very same operation below is executed, with the confirming person's permissions and their name in the audit log. Danger tools need a second confirmation.

Tools carrying the destructive flag: `kanban_archive_card`.

| Tool | Operation | Class | Scope |
| --- | --- | --- | --- |
| `kanban_add_checklist` | `checklists.create` | write | `kanban.card.update` |
| `kanban_add_comment` | `comments.create` | write | `kanban.card.comment` |
| `kanban_archive_card` | `cards.archive` | danger | `kanban.card.delete` |
| `kanban_assign_card` | `cards.assignees.set` | write | `kanban.card.update` |
| `kanban_board_summary` | `boards.summary` | read | `kanban.board.read` |
| `kanban_complete_card` | `cards.complete` | write | `kanban.card.move` |
| `kanban_create_board` | `boards.create` | write | `kanban.board.create` |
| `kanban_create_card` | `cards.create` | write | `kanban.card.create` |
| `kanban_get_board` | `boards.get` | read | `kanban.board.read` |
| `kanban_list_boards` | `boards.list` | read | `kanban.board.read` |
| `kanban_list_cards` | `cards.list` | read | `kanban.board.read` |
| `kanban_move_card` | `cards.move` | write | `kanban.card.move` |
| `kanban_my_tasks` | `my-tasks` | read | `kanban.board.read` |
| `kanban_search_cards` | `search` | read | `kanban.board.read` |
| `kanban_set_labels` | `cards.labels.set` | write | `kanban.card.update` |
| `kanban_update_card` | `cards.update` | write | `kanban.card.update` |

## AI agents

Bring your own model. The same tools the SHARK assistant uses are published as a skill manifest, so an outside agent (Claude, GPT, Gemini, an open model, an n8n flow) can drive the task boards with the shop owner's API key. Nothing here is a second API: every tool call lands on the operation of the same name listed above.

### Manifest

```bash
curl -sS "https://shark.in.th/api/v1/ai/skills" -H "Authorization: Bearer $SHARK_API_KEY"
curl -sS "https://shark.in.th/api/v1/ai/skills/tasks" -H "Authorization: Bearer $SHARK_API_KEY"
```

`GET https://shark.in.th/api/v1/ai/skills` lists the skills this shop can use. The task board skill is listed only when the shop has an active task board system and the key is allowed to call at least one of its tools. A shop without task boards, or a key whose scopes reach none of the tools, gets 404 from `https://shark.in.th/api/v1/ai/skills/tasks` - the same answer as a skill that does not exist, so nothing leaks about what is behind the wall.

`GET https://shark.in.th/api/v1/ai/skills/tasks` returns the 16 tools (6 read, 10 write or danger) in OpenAI function-calling shape, so they can be handed to the model without conversion:

```text
{ "id": "tasks", "label": "งานและบอร์ด", "summary": "...", "tools": [
  { "type": "function",
    "function": { "name": "kanban_my_tasks", "description": "...", "parameters": { ...JSON Schema... } },
    "write": false },
  ...
] }
```

`parameters` is the JSON Schema of that operation's input - the very schema the REST endpoint validates against - plus any path id (`boardId`, `cardId`, ...) as a required property and an optional `systemName` string for shops that run more than one task board system. Anthropic's shape is one field rename (`function.name` -> `name`, `function.parameters` -> `input_schema`). `write: true` marks a tool that changes data.

### Calling a tool

`POST https://shark.in.th/api/v1/ai/tools/<tool name>` with `{ "args": { ... } }`. Authentication is the same Bearer key as the REST API. Send `X-Shark-System: <system id>` when the key is not bound to one task board system. A key may only call the tools its scopes allow; anything else answers 403 with the missing scope in `hint`. An unknown tool name answers 404. Bad arguments never crash the call: the answer is still 200 and `result` carries a Thai `error` string the agent can read back to the user.

Rate limit on this lane: 60 calls per minute per key (429 with `retry-after`), independent of the REST limits above.

### Read tools run straight away

```bash
curl -sS -X POST "https://shark.in.th/api/v1/ai/tools/kanban_my_tasks" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"args":{}}'
```

```json
{
  "tool": "kanban_my_tasks",
  "skill": "tasks",
  "write": false,
  "result": "{\"งานเลยกำหนด\":2,\"งานวันนี้\":5,\"งานสัปดาห์นี้\":11}"
}
```

`result` is a JSON string the model reads back to the user (the object above is shortened; the real answer carries the card rows as well).

### Write tools return a proposal, not a card

An outside agent can never change a board on its own, even with a valid key. A write or danger tool creates a **proposal** (`summary` is Thai, written for the owner) that the shop owner confirms in the SHARK app or website. Only then does the operation run, with the confirming person's permissions and their name in the audit log; danger tools ask a second time.

```bash
curl -sS -X POST "https://shark.in.th/api/v1/ai/tools/kanban_create_card" \
  -H "Authorization: Bearer $SHARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"args":{"boardId":"brd_123","columnId":"col_123","title":"Service the rental regulators"}}'
```

```json
{
  "tool": "kanban_create_card",
  "skill": "tasks",
  "write": true,
  "pendingConfirmation": true,
  "conversationId": "cnv_8f2a",
  "result": "{\"proposalId\":\"prp_41c9\",\"summary\":\"สร้างการ์ดงาน · Service the rental regulators\",\"waiting\":\"user_confirm\"}"
}
```

Nothing exists on the board yet. The owner opens the conversation, reads the Thai summary and taps confirm; the card is then created. Tell the user the request is waiting for their confirmation - never report the card as created until a later read tool shows it.

If a card must be created without a human in the loop, use the REST operations above instead: they execute immediately, and the key's scopes are the only gate.

## Webhooks

Everything above is you calling SHARK. Webhooks are SHARK calling you: the shop owner adds an endpoint URL in the shop settings (Connections > External apps / API), ticks the events it wants, and gets a signing secret shown once.

Delivery is at least once and ordered by the moment the change was committed. Events are written inside the same database transaction as the change itself, so an event exists only if the change really happened, and a change never happens without its event. A delivery that does not answer 2xx within 5 seconds is retried up to 5 times with a growing delay, so **make your handler idempotent**: key on the ids in the payload.

Every event below fires wherever the change came from - a person dragging a card in the app, this REST API, or an automation rule. There is no separate "API only" event.

### Request format

`POST <your url>` with `Content-Type: application/json` and these headers:

| Header | Value |
| --- | --- |
| `X-Shark-Event` | The event type, for example `kanban.card.moved`. |
| `X-Shark-Signature` | `HMAC-SHA256(secret, raw request body)` as lowercase hex. |

The body is always the same three fields:

```json
{
  "type": "kanban.card.moved",
  "payload": {
    "cardId": "cmf1crd0001",
    "boardId": "cmf1brd0001"
  },
  "sentAt": "2026-09-06T09:15:00.000Z"
}
```

`payload` never contains your shop id or task board system id: the endpoint already belongs to one shop. It also never carries card descriptions, comment text or customer names - only ids plus the short labels needed to route the event. Read the rest with the REST operations above. Instants are ISO-8601 UTC strings ending in `At`, the same convention as the REST API.

### Verifying `X-Shark-Signature`

1. Read the **raw** request body as bytes, before any JSON parsing or pretty printing.
2. Compute `HMAC-SHA256` over those bytes with the endpoint secret; render it as lowercase hex.
3. Compare with the `X-Shark-Signature` header using a constant time comparison. Reject with 401 when it differs.
4. Only then parse the JSON, answer 2xx immediately and process asynchronously.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

// Express style handler. Read the RAW body: any reformatting breaks the signature.
export function handleSharkWebhook(rawBody: Buffer, headers: Record<string, string>) {
  const expected = createHmac("sha256", process.env.SHARK_WEBHOOK_SECRET!).update(rawBody).digest("hex");
  const got = headers["x-shark-signature"] ?? "";
  if (got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return { status: 401 };
  }
  const event = JSON.parse(rawBody.toString("utf8")) as { type: string; payload: unknown; sentAt: string };
  // Answer 2xx fast, then do the work. Anything else is retried up to 5 times.
  void enqueue(event);
  return { status: 200 };
}
```

### Events

| Event | Fires when |
| --- | --- |
| `kanban.card.created` | A card was created, whichever way it was created (a person on the board, this REST API, an automation rule). |
| `kanban.card.moved` | A card moved to another column. Reordering inside the same column does not fire, on purpose: it would flood the queue. |
| `kanban.card.assigned` | Somebody became responsible for a card. One delivery per person added, so a card given to two people fires twice. |
| `kanban.card.completed` | A card entered the column flagged as the done column and got its `completedAt`. Fires next to `kanban.card.moved`, not instead of it. |
| `kanban.card.due_soon` | A card is approaching its due date. Declared so integrators can build their side now; the job that scans due dates ships with the reminders work, so nothing is delivered yet. |
| `kanban.card.overdue` | A card passed its due date. Same as above: declared now, delivered once the reminder job ships. |
| `kanban.checklist.completed` | The last open item of one checklist was ticked off. Fires on the transition only; ticking an already complete checklist again does nothing. |
| `kanban.comment.added` | A new comment was written on a card. `mentions` holds the user ids mentioned with the @[Name](userId) markup. |
| `kanban.card.archived` | A card was archived. Archiving, restoring and archiving again produces one delivery each time. |

#### `kanban.card.created`

A card was created, whichever way it was created (a person on the board, this REST API, an automation rule).

```json
{
  "type": "kanban.card.created",
  "payload": {
    "cardId": "cmf1crd0001",
    "boardId": "cmf1brd0001",
    "columnId": "cmf1col0001",
    "cardNo": 42,
    "title": "Service the rental regulators",
    "sourceType": "AUTOMATION"
  },
  "sentAt": "2026-09-06T09:15:00.000Z"
}
```

#### `kanban.card.moved`

A card moved to another column. Reordering inside the same column does not fire, on purpose: it would flood the queue.

```json
{
  "type": "kanban.card.moved",
  "payload": {
    "cardId": "cmf1crd0001",
    "boardId": "cmf1brd0001",
    "fromColumnId": "cmf1col0001",
    "toColumnId": "cmf1col0002",
    "cardNo": 42,
    "title": "Service the rental regulators"
  },
  "sentAt": "2026-09-06T09:15:00.000Z"
}
```

#### `kanban.card.assigned`

Somebody became responsible for a card. One delivery per person added, so a card given to two people fires twice.

```json
{
  "type": "kanban.card.assigned",
  "payload": {
    "cardId": "cmf1crd0001",
    "boardId": "cmf1brd0001",
    "assigneeUserId": "cmf1usr0001"
  },
  "sentAt": "2026-09-06T09:15:00.000Z"
}
```

#### `kanban.card.completed`

A card entered the column flagged as the done column and got its `completedAt`. Fires next to `kanban.card.moved`, not instead of it.

```json
{
  "type": "kanban.card.completed",
  "payload": {
    "cardId": "cmf1crd0001",
    "boardId": "cmf1brd0001",
    "columnId": "cmf1col0003",
    "cardNo": 42,
    "completedAt": "2026-09-06T09:15:00.000Z"
  },
  "sentAt": "2026-09-06T09:15:00.000Z"
}
```

#### `kanban.card.due_soon`

> **Not delivered yet.** The event type is registered so you can subscribe and build your handler, but no code path emits it in this release.

A card is approaching its due date. Declared so integrators can build their side now; the job that scans due dates ships with the reminders work, so nothing is delivered yet.

```json
{
  "type": "kanban.card.due_soon",
  "payload": {
    "cardId": "cmf1crd0001",
    "boardId": "cmf1brd0001",
    "dueAt": "2026-09-07T10:00:00.000Z",
    "assigneeUserIds": [
      "cmf1usr0001"
    ]
  },
  "sentAt": "2026-09-06T09:15:00.000Z"
}
```

#### `kanban.card.overdue`

> **Not delivered yet.** The event type is registered so you can subscribe and build your handler, but no code path emits it in this release.

A card passed its due date. Same as above: declared now, delivered once the reminder job ships.

```json
{
  "type": "kanban.card.overdue",
  "payload": {
    "cardId": "cmf1crd0001",
    "boardId": "cmf1brd0001",
    "dueAt": "2026-09-05T10:00:00.000Z",
    "overdueDays": 1
  },
  "sentAt": "2026-09-06T09:15:00.000Z"
}
```

#### `kanban.checklist.completed`

The last open item of one checklist was ticked off. Fires on the transition only; ticking an already complete checklist again does nothing.

```json
{
  "type": "kanban.checklist.completed",
  "payload": {
    "checklistId": "cmf1chk0001",
    "cardId": "cmf1crd0001"
  },
  "sentAt": "2026-09-06T09:15:00.000Z"
}
```

#### `kanban.comment.added`

A new comment was written on a card. `mentions` holds the user ids mentioned with the @[Name](userId) markup.

```json
{
  "type": "kanban.comment.added",
  "payload": {
    "commentId": "cmf1cmt0001",
    "cardId": "cmf1crd0001",
    "boardId": "cmf1brd0001",
    "authorUserId": "cmf1usr0001",
    "mentions": [
      "cmf1usr0002"
    ]
  },
  "sentAt": "2026-09-06T09:15:00.000Z"
}
```

#### `kanban.card.archived`

A card was archived. Archiving, restoring and archiving again produces one delivery each time.

```json
{
  "type": "kanban.card.archived",
  "payload": {
    "cardId": "cmf1crd0001",
    "boardId": "cmf1brd0001",
    "cardNo": 42,
    "title": "Service the rental regulators"
  },
  "sentAt": "2026-09-06T09:15:00.000Z"
}
```

## Glossary (Thai <-> English task board terms)

Field names and codes in this API are English. This table maps them to the Thai words a shop owner or a staff member uses.

| ไทย | English | In the API |
| --- | --- | --- |
| ระบบบอร์ดงาน | task board system (AppSystem of type KANBAN) | `X-Shark-System` |
| บอร์ด | board | `/boards` |
| คอลัมน์ / รายการ | column (list) | `/columns` |
| การ์ดงาน | card | `/cards` |
| เลขการ์ด | card number inside the board | `cardNo` |
| ตำแหน่งในคอลัมน์ | fractional index position | `position` |
| คอลัมน์ 'เสร็จ' | done column | `isDoneColumn` |
| เพดานงานค้าง | work in progress limit | `wipLimit` |
| ผู้รับผิดชอบ | assignee | `assigneeUserId` / `userIds` |
| ป้ายกำกับ | label | `/labels` |
| เช็คลิสต์ / รายการย่อย | checklist / checklist item | `/checklists` / `/checklist-items` |
| ความเห็น | comment | `/cards/{id}/comments` |
| ไฟล์แนบ | attachment | `/cards/{id}/attachments` |
| ภาพหน้าปกการ์ด | card cover | `PUT /cards/{id}/cover` |
| กำหนดส่ง | due date | `dueAt` |
| เก็บเข้าคลัง | archive | `status: ARCHIVED` · danger operations |
| กู้คืน | restore | `/restore` |
| บอร์ดส่วนตัว / ทั้งร้าน | private / tenant wide board | `visibility` |
| สาขา | business unit (branch) | `unitId` |
| เทมเพลตบอร์ด | board template | `GET /templates` · `template` |
| งานของฉัน | task inbox of one person | `GET /my-tasks` |
