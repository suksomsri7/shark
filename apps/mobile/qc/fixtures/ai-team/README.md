# AI-team screen fixtures (`apps/mobile/qc/fixtures/ai-team/`)

Mock API payloads for rendering the SHARK HUB v2 "ทีมพนักงาน AI" screens with `apps/mobile/qc/shoot-ai-team.mjs` (built by work order T0.3 as a copy of `shoot-crm.mjs`: web export of a QC copy of the app + puppeteer request interception + screenshots at 390×844, light and dark).

Contract of every payload: `docs/api/AI-TEAM-MOBILE-API.md` (the `Z…Response` schema of the route). A fixture that does not parse with the route's schema is a wrong fixture — the screen would be tested against data the server can never send.

## One file per work order

`<wo>.json` in this folder, lower case: `t0.3.json`, `t2.2.json`, `t2.8.json` … A work order that needs several states of one screen (empty team, five employees, quota exhausted) adds a suffix: `t2.2-empty.json`, `t3.4-exhausted.json`.

Who writes it: the **oracle** of that work order (`scripts/qc-ai-<wo>.mts`), from the QC seed (`scripts/seed-ai-team-qc.mts`, shops AT-1 / AT-2 / AT-X on QC4):

- when the server function exists, by calling the real function / route handler and saving its answer (so the picture shows what the API really returns) — the house rule of `scripts/qc-crm-c3.7.mts`;
- before that (lane B works ahead of T1.10), by hand from the DTO shapes of the API contract. The T2 wrap-up after T1.10 regenerates every file from the real API and re-shoots a "live" set.

Builders never edit a fixture to make a screen look right; a wrong fixture is an ORACLE-EDIT request.

## Format

```jsonc
{
  "wo": "t2.2",                       // work order
  "screens": ["A1"],                  // mockup ids this file serves (ledger/DESIGN-AI-TEAM.md §2)
  "generatedBy": "scripts/qc-ai-t2.2.mts",
  "source": "contract",               // "contract" = hand-written from the DTO shapes · "live" = produced by the real server functions
  "session": { "tenantId": "t1" },    // the active tenant the app starts with (the mock bearer is set by the shooter)

  // ── short keys: the routes almost every screen needs ──
  "me":        { /* GET /api/mobile/me                      → ZMeResponse (uiVersion: 2) */ },
  "summary":   { /* GET /api/mobile/team/summary            → ZTeamSummaryResponse */ },
  "quota":     { /* GET /api/mobile/team/quota              → ZTeamQuotaResponse */ },
  "employees": { /* GET /api/mobile/team/employees          → ZEmployeesResponse */ },
  "positions": { /* GET /api/mobile/team/positions          → ZPositionsResponse */ },
  "recommend": { /* GET /api/mobile/team/positions/recommend → ZPositionsRecommendResponse */ },
  "inbox":     { /* GET /api/mobile/team/inbox              → ZInboxResponse */ },
  "schedules": { /* GET /api/mobile/team/schedules          → ZSchedulesResponse */ },

  // ── short keys with a route parameter: one entry per id, "*" = any other id ──
  "employee":  { "emp-ek": { /* GET /api/mobile/team/employees/[id] → ZEmployeeDetailResponse */ }, "*": { } },
  "tasks":     { "emp-ek": { /* GET /api/mobile/team/employees/[id]/tasks → ZEmployeeTasksResponse */ } },
  "task":      { "task-q0012": { /* GET /api/mobile/team/tasks/[id] → ZTaskDetailResponse */ } },
  "messages":  { "e~emp-ek~a1": { /* GET /api/mobile/conversations/[id]/messages → ZMessagesResponse */ } },

  // ── everything else: keyed by the route pattern exactly as the API contract's heading writes it ──
  "routes": {
    "GET /api/mobile/team/employees/[id]/manual/versions": { "emp-ek": { /* ZManualVersionsResponse */ } },
    "POST /api/mobile/team/inbox/decide": { "ok": true, "status": "EXECUTED", "note": "ส่งใบเสนอราคาแล้ว" },
    "POST /api/mobile/team/persona/sample-speech": { "text": "สวัสดีครับ …" },
    "POST /api/mobile/chat/send": { "$sse": [ { "type": "status", "label": "กำลังคิด" }, { "type": "done", "result": { "ok": true, "conversationId": "e~emp-ek~a1", "reply": "…" } } ] }
  },

  // ── optional: answers that differ per X-Tenant-Id (A2 switcher, A7 cross-tenant inbox) ──
  "byTenant": { "t2": { "summary": { }, "quota": { } } }
}
```

Rules the shooter applies:

1. A request is matched by method + path with every id segment replaced by `[id]` — the same normalisation the oracle of T0.2 uses for the API contract. Query strings are ignored for matching; a value may instead be keyed by the full query (`"GET /api/mobile/team/inbox?view=DECIDED_TODAY"`) when a screen needs both.
2. Short keys are aliases of the routes written next to them above; `routes` wins when both name the same route.
3. Special values: `{ "$status": 500, "$body": { "error": "…" } }` answers an error (error-state pictures), `{ "$delayMs": 3000, … }` delays the answer (loading-state pictures), `{ "$sse": [ … ] }` streams events.
4. A request with no entry answers 404 and is listed under `unmocked` in `summary.json` — a screen that fires a request its fixture does not know fails the picture check.
5. Requests the mock received are logged (method, path, `X-Tenant-Id`, body) so an oracle can assert "the approve button sent the row's tenant" or "one call per debounce".

## What must never be in a fixture

- Real customer data: names, phone numbers and e-mails are the fictitious ones of the QC seed (`@qc.shark`, 089-555-01xx).
- Secrets of any kind (keys, session values, connection strings).
- Micro-dollar amounts, prompts, model names, cost per task, wages — the API contract has none of them in a team response, so a fixture carrying one proves a leak, not a feature.
- Task counts per pack ("≈ N งาน") while `approxTasks` is null (RESOLUTIONS R-A5 / R-C3).

## Checklist for the oracle that writes a fixture

- [ ] every payload parses with the route's `Z…Response` schema (import the schema once the route file exists)
- [ ] ids are stable strings of the seed or clearly synthetic (`emp-ek`, `task-q0012`) — never a production id
- [ ] file written under this folder only; `sha256` of the file goes into the shooter's `summary.json`
- [ ] light and dark shots use the same file
