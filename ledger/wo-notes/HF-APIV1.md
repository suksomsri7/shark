# HF-APIV1 — legacy `/api/v1/*` ignore API-key scopes / system binding (hotfix)

Worktree `/root/projects/shark-hf` · branch `hotfix/apiv1-scope` (base origin/main 04d2ade9) · DB = QC4 only.

## Status (checkpoint)
- [x] 1. key model read — notes below
- [x] 2. oracle `scripts/qc-hf-apiv1-scope.mts` RED on unfixed code
- [x] 3. guard `requireLegacyFullAccessKey` + 8 routes
- [x] 4. GREEN + regressions before/after
- [x] 5. audit (report only)
- [x] 6. fitness (env / no env) + typecheck
- [x] 7. commit + push

## 1. What "legacy key" means in code (house semantics)
- `src/lib/api-keys/service.ts:23` — `scopes: [] (ค่าปริยาย) = คีย์อ่านรุ่นเดิมของ /api/v1/*`; `:25` — `systemId null = คีย์ระดับร้าน`; `:118` — `[] = คีย์รุ่นเดิม`.
- `src/lib/api-keys/route-auth.ts:20-22` — same on `ApiAuth`.
- `src/lib/api-keys/scopes.ts:403` — UI label for `[]` = "อ่าน API กลาง (คีย์รุ่นเดิม)" (shop-wide read of the general API).
- Issuer of legacy keys: `src/app/app/settings/api/actions.ts:40` `createApiKey(ctx, name)` → scopes [] + systemId null. `rotateApiKey` copies scopes/systemId, so a rotated legacy key stays legacy.
- Module issuers (account `connections-actions.ts:123`, kanban `settings-actions.ts:73`, member `api-actions.ts:82` + op `keys.create`, CRM `sys/[id]/crm/settings/api/actions.ts:67`) ALWAYS bind `systemId`; scopes normally a bundle. Account form can produce scopes [] + bound (no tick, no bundle).
- Newer modules (`src/lib/api/require.ts:217` `actorCan(actor, op.action)`): empty scopes = NO access there. That does not conflict with this rule — those modules gate their own routes; the legacy routes are the "general API" the [] key was built for. So: legacy = `scopes.length === 0 && systemId === null` keeps working; anything else fails closed on the 8 data routes.
- `/api/v1/me` returns only `{tenant:{id,name,slug}}` (identity of the key's own shop) → stays open to every valid key (module integrations use it as a ping / to show which shop they are connected to; nothing beyond identity).
- baseline (unfixed) regressions + fitness captured in scratchpad reg-before/; RED 26/67 saved ledger/wo-notes/HF-APIV1-red.txt; patch re-applied

## 2. Rule implemented
`src/lib/api-keys/route-auth.ts:73` `requireLegacyFullAccessKey(auth)` (additive, return shape of `authenticateApiRequest` unchanged):
legacy = `scopes.length === 0 && systemId === null` ⇒ `null` (continue as before); anything else ⇒ **403** fixed body
`{ error: <Thai, does not blame the caller>, error_en, code: "scope_missing" }` (legacy routes' house shape is `{error}` via `apiJson`;
`code` reuses the existing vocabulary of `src/lib/api/require.ts`). No data, no counts, byte-identical on all 8 routes/all keys/all shops.
Called right after auth in each of the 8 data routes (+1 import, +2 lines each). Runs after the 60/min rate limit (same as before).
`/api/v1/me` NOT guarded — returns only `{tenant:{id,name,slug}}` of the key's own shop (identity, no shop data).

## 3. Per-route table
| route | legacy (scopes [] · no system) | scoped only | system-bound (incl. scopes [] + bound) | scoped + bound | expired/revoked | other-tenant legacy |
|---|---|---|---|---|---|---|
| /sales | 200 → 200 | 200 → **403** | 200 → **403** | 200 → **403** | 401 → 401 | own shop only (unchanged) |
| /customers | 200 → 200 | 200 → **403** | 200 → **403** | 200 → **403** | 401 → 401 | unchanged |
| /inventory/items | 200 → 200 | 200 → **403** | 200 → **403** | 200 → **403** | 401 → 401 | unchanged |
| /appointments | 200 → 200 | 200 → **403** | 200 → **403** | 200 → **403** | 401 → 401 | unchanged |
| /queue/tickets | 200 → 200 | 200 → **403** | 200 → **403** | 200 → **403** | 401 → 401 | unchanged |
| /reservations | 200 → 200 | 200 → **403** | 200 → **403** | 200 → **403** | 401 → 401 | unchanged |
| /shop/orders | 200 → 200 | 200 → **403** | 200 → **403** | 200 → **403** | 401 → 401 | unchanged |
| /tickets/orders | 200 → 200 | 200 → **403** | 200 → **403** | 200 → **403** | 401 → 401 | unchanged |
| /me | 200 → 200 | 200 → 200 | 200 → 200 | 200 → 200 | 401 → 401 | unchanged |

## 4. Acceptance
- A1 oracle `scripts/qc-hf-apiv1-scope.mts`: RED before `ผ่าน 26/67` (41 CRITICAL = every scoped/bound call got 200 with data; full output `ledger/wo-notes/HF-APIV1-red.txt`) → GREEN after `ผ่าน 67/67 · JSON_SUMMARY {"total":67,"passed":67,"findings":[]}`.
- A2 before → after identical JSON_SUMMARY on QC4 (21 suites):
  qc-public-api 18/18 · qc-account-api-keys 51/51 · qc-ai-skills 23/23 · qc-chat-api-v1 89/89 · qc-account-api-core 64/64 · -webhooks 22/22 ·
  -write-docs 52/52 · -write-finance 33/33 · -write-gl 35/35 · -write-master 44/44 · -write-ops 29/29 · -write-payments 32/32 · -write-settings 39/39 ·
  pre-existing RED on QC4 (same ids before and after, unrelated to this hotfix): -ai-external CRASH (`reading 'slice'`), -ai-skill 28/33 (E1-K2.* "ยังไม่ได้เปิดระบบบัญชี" — fixture shop has no account system on QC4),
  -read-docs/-read-finance/-read-gl/-read-master CRASH ("ไม่พบระบบที่จะผูกคีย์ในร้านนี้" — same fixture gap), -docs 10/17 (F2.* `.claude/skills/shark-account-api` not in the repo), -openapi 25/26 (OA-4.5).
  NOT run: qc-account-api-settings (puppeteer against :3215 = CRM's server — lane rule 4). No ORACLE-EDITs needed (no existing oracle asserted the insecure behaviour; qc-public-api uses legacy keys only).
- A3 `pnpm fitness` with QC4 env 33/33 → 33/33 · without env 33/33 → 33/33.
- A4 `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` → `tsc --noEmit` exit 0, no errors (waited ~25 min for the machine lock).

## 5. Audit (report only — not fixed)
1. **HIGH — `/api/v1/chat/*` secret mode** (`src/lib/modules/chat/public-auth.ts:286-300`): `verifyApiKey` then ignores `scopes`/`systemId`; the chat system is taken from the `X-Shark-System` header or the shop's first CHAT system. ⇒ any valid key of the shop (kanban-read, account-bound, member-read …) can act as the chat *secret* server: claim to be any customer by `externalUserId` from the body, post messages, read threads/unread, register identities. Same hole as this hotfix but with write + impersonation. Fix needs the same legacy-only rule (or a chat scope) — must keep the SiamDive chat integration key working: check which key type it uses before changing.
2. **MEDIUM — `/api/v1/ai/tools/<name>` + `/api/v1/ai/skills`** (`src/lib/ai/skills.ts:332-347`): only tools of `account`/`tasks`/`members`/`crm` are scope-gated; every other tool (`sales_summary`, `sales_by_day`, `financial_summary`, `low_stock`, `chat_unread_conversations`, booking/shop/hotel/ticket/hr/approvals … reads) returns `true` for ANY key ⇒ a kanban-read or account-bound key reads POS sales/financial summary/stock/chat via the AI lane. Write tools only create owner-confirmed proposals (lower risk). The brief assumed these routes "do check" — they check only the four scoped modules.
3. LOW — legacy routes for legacy keys: no cross-tenant leak (every query is `tenantDb({tenantId: auth.tenantId,…})`). By design they aggregate across ALL POS systems/units of the shop (sales, appointments, queue, reservations, shop, tickets) and expose PII (phones, names, memberId) to the legacy key — acceptable for a shop-wide key but worth documenting on /developers.
4. LOW (perf) — `/api/v1/shop/orders/route.ts`: `findMany` per unit has **no `take`** — loads every order of every unit then slices in memory.
5. Module REST (`/api/v1/{account,kanban,member,crm}/*`) go through `src/lib/api/require.ts` (system binding + `actorCan` scope check) — OK.

## 6. Customer impact
- Keys from ตั้งค่า › API สำหรับนักพัฒนา (`/app/settings/api`, scopes [] + no system) and their rotations: **no change**.
- Keys issued from a module's settings (account connections, kanban, member, CRM — always system-bound, normally with a bundle) and keys issued through the member REST `keys.create` op: **lose** the 8 legacy data routes (sales, customers, inventory/items, appointments, queue/tickets, reservations, shop/orders, tickets/orders) — they now get 403 with a Thai/English message pointing to the general key. They keep `/api/v1/me`, their own module REST and the AI routes unchanged.
- An integration that today reads POS sales/customers with an account/kanban/member/CRM key will break — this access was never intended (the key UI labels them module-only), but prod usage should be checked before deploy (see decision).

## 7. Controller decisions before deploy
- D1: confirm nobody in prod relies on a module key for the legacy routes — e.g. `SELECT id, tenantId, name, "systemId", "scopesJson", "lastUsedAt" FROM "ApiKey" WHERE "revokedAt" IS NULL AND ("systemId" IS NOT NULL OR jsonb_array_length("scopesJson") > 0) AND "lastUsedAt" > now() - interval '30 days'` (CONTROLLER-RUN, read-only on prod; request logs for /api/v1/{sales,…} would be the exact answer).
- D2: house semantics note — in module REST (`require.ts:217`) empty scopes = NO access, while on the legacy lane empty scopes = full shop read. I kept the legacy meaning (service.ts:23, scopes.ts:403) so today's legacy callers keep working. Consequence: an account-module key issued with no tick and no bundle (scopes [] + bound) is now treated as bound ⇒ 403 here (and it already had no access in account REST).
- D3: audit #1 (chat) and #2 (AI tools) are the same class of hole and remain open; schedule follow-up hotfixes.
