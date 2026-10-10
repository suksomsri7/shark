# T1.10 — Mobile API: team routes (Opus · server lane) 🎯 hunter (API surface)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-E C19/C21/C33 first. Contract: AI-TEAM-RUN §2 T1.10. Spec: `docs/api/AI-TEAM-MOBILE-API.md` (T0.2) — the spec is the contract; update it in the same WO if the code must differ (reviewer diffs them).

## Verified facts (REVIEW §3)
- Helpers: `requireMobile(req) → MobileGate` `src/lib/mobile/auth.ts:74` (Bearer + `X-Tenant-Id`, membership accepted, tenant not SUSPENDED/CLOSED), `mobileUser(req)` `:53`, `mobileError(g)` `:89`, `mobileDenied(g, q)` + `AI_CHAT` `guard.ts:10,23`, `mobileAiCtx(g)` `:31`; CRM pattern `runMobileCrm(req, g, run, { readBody?, bucket? })` `crm-routes.ts:51` (rate 120/min, body parsing, `wakeOutbox`); `readJson(req)` `member-routes.ts:65`.
- `/api/mobile/usage/route.ts:3–6` shape frozen: `{ scope:"credit", used, limit, pct, warn, degraded, blocked, resetAt, balanceMicro }`; GET currently calls `ensureWallet` (writes) — T3.6 changes the content; here only switch to the non-writing read (`canSpendPeek`/`balanceOf` without grant? `balanceOf` calls `ensureWallet` → use a new `peekWallet(tenantId)` in credit.ts that never creates).
- `GET /api/mobile/me` returns `{ user, memberships[{ tenantId, name, role, branding }] }` — add `uiVersion` per membership from `AiSettings.uiVersion` (default 1) and top-level `viewerRole` per tenant (`OWNER` | `APPROVER` (can confirm any money/customer kind) | `MEMBER`).
- Rate limit `checkRateLimitDb` `src/lib/core/rate-limit-db.ts:37`.
- Docs generator: F13.2/.5/.8/.11 compare `docs/api/*.md` with a generator for registry modules — the mobile API has no generator; write the doc by hand and add a static check in `fitness-ai-team.mts` (F16.7: every `route.ts` under `src/app/api/mobile/team/**` appears in the doc and vice versa).

## Deliverables
- `src/lib/mobile/team-auth.ts`: `requireMobileUser(req) → { user, memberships: { tenantId, m: MembershipCtx, role }[] } | error`; `runMobileTeam(req, g, fn, { readBody?, bucket?, permission? })` (zod parse → 400 `{ error: "validation", issues }`, `ForbiddenError` → 404-style `{ error: "not_found" }` for cross-tenant and `{ error: "forbidden" }` for same-tenant missing permission — follow the pattern mobile CRM uses; rate buckets `team-write` 60/min, `team-sample` 30/min, `team-draft` 10/min).
- Routes (all under `src/app/api/mobile/team/`): `employees` (GET list / POST create) · `employees/[id]` (GET / PATCH) · `employees/[id]/pause|resume|terminate` (POST) · `positions` (GET visible + `?recommend=1`) · `employees/[id]/manual` (GET current / POST new version) · `employees/[id]/manual/versions` (GET) · `employees/[id]/manual/revert` (POST) · `employees/[id]/manual/draft` (POST text → draft) · `employees/[id]/access` (GET / PUT) · `employees/[id]/tasks` (GET filter / POST start) · `tasks/[id]/done|archive` (POST) · `schedules` (GET / POST) · `schedules/[id]` (PATCH / DELETE) · `inbox` (GET — `requireMobileUser`, all tenants, `?tenantId&filter&cursor`) · `inbox/decide` (POST — `requireMobile` with the row's tenant) · `persona/sample-speech` (POST) · `summary` (GET: people count, AI count, pack key, quota pct, tasks today, pending approvals, viewerRole) · `quota` (GET `quotaSnapshot` — before T3.1 returns `{ pct: 0, state: "OK", cycleEnd: null, perEmployee: [] }` and the doc says so) · `conversations` v2 listing hunk: `GET /api/mobile/conversations?scope=team` includes `e~` rooms visible.
- Response zod schemas are **whitelists** (`.strict()` objects built from DTO types); forbidden keys asserted by F16.1.
- `docs/api/AI-TEAM-MOBILE-API.md` updated to match; F16.7 static check.

## Files you own
`src/lib/mobile/team-auth.ts`, `src/app/api/mobile/team/**`, hunks: `src/app/api/mobile/me/route.ts` (uiVersion/viewerRole), `src/app/api/mobile/usage/route.ts` (non-writing read), `src/app/api/mobile/conversations/route.ts` (scope=team), `src/lib/ai/credit.ts` (`peekWallet`), `docs/api/AI-TEAM-MOBILE-API.md`, F16.7 in `scripts/fitness-ai-team.mts`.

## Acceptance (oracle `qc-ai-t1.10`, handler-level like `qc-mobile-chat.mts`)
S1 auth matrix per route · S2 zod 400 · S3 DTO forbidden keys · S4 inbox cross-tenant + wrong `X-Tenant-Id` on decide → 404 · S5 `/usage` keys identical + no wallet write on GET · S6 `me.uiVersion`/`viewerRole` · S7 rate limit 429 · S8 approver without `ai.chat.send` can decide · S9 docs ↔ routes · S10 terminate without confirm → 400. Regressions: `qc-mobile-app` `qc-mobile-auth` `qc-mobile-chat` `qc-mobile-authz-hotfix` `qc-mobile-help` `qc-crm-c3.7`.

## Controller rulings
- Error bodies never say "tenant exists but you are not a member" (always `not_found`).
- `summary.hoursSaved` is `null` until T4.5 (the app renders "—").
- Hunter lens: IDOR on every `[id]` (employee/task/schedule of another tenant with a valid Bearer of AT-1), mass-assignment through PATCH bodies (`isDefault`, `status`, `commanderUserIds` by non-managers).
