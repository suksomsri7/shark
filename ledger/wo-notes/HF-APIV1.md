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

# Round 2 (checkpoint)
- [x] oracle extended (S1 chat · S2 AI · S3 rotated + seeds for all 8 routes · N2 malformed · N4 code) — RED2 on c2287e53: `ผ่าน 61/120` saved `ledger/wo-notes/HF-APIV1-red2.txt`
- [x] before2 baseline (c2287e53) of 51 qc-chat*/qc-ai* suites captured in scratchpad reg-before2/ (21 API suites = round-1 "after")
- [x] implement N2/N4 · S1 · S2 · docs — GREEN 120/120 · after2 72 suites identical (3 ORACLE-EDITs on fake apiKey rows) · fitness 33/33 both
- [x] GREEN · after2 regressions · fitness · typecheck (exit 0) · notes · commit/push

## Round 2 — rule (one predicate for every general-key lane)
`src/lib/api-keys/route-auth.ts` `isGeneralApiKey(k)` = `scopes.length === 0 && systemId === null && scopesMalformed !== true`;
`keyNotGeneralResponse()` = fixed 403 `{error (Thai, no blame), error_en, code: "key_not_general"}` (N4: was `scope_missing`);
`requireLegacyFullAccessKey(auth)` now delegates to both. Used by: 8 legacy data routes (round 1) · chat secret mode (S1) · AI non-module tools (S2).

- **N2** `src/lib/api-keys/service.ts`: `verifyApiKeyDetailed`/`verifyApiKey` expose `scopesMalformed` (scopesJson not an array of strings); `parseScopes` unchanged (still returns string[] for every other caller). `ApiAuth` gets the same optional field. 4 + 3 lines.
- **S1** `src/lib/modules/chat/public-auth.ts` `authenticateSecret` (after verify + rate limit, before any chat data):
  (a) general key → the original line `resolveChatSystemId(key.tenantId, X-Shark-System)` unchanged (SiamDive flow byte-for-byte);
  (b) key bound to an active CHAT system of the same tenant (and scopes not malformed) → that system; a different `X-Shark-System` → 403 `system_mismatch`;
  anything else → 403 `key_not_general`, so no route reaches `ensureWebchatConnection` / contact / message / attachment code.
  No chat key issuer exists today (issuers: platform `/app/settings/api` = general; account/kanban/member/CRM settings bind their own system type). (b) is implemented for the future/for keys made directly via the service.
- **S2** new `src/app/api/v1/ai/general-key-gate.ts` (beside the routes; skills.ts/tools.ts untouched): a tool is "module-scoped" when any of `accountToolScope` / `kanbanToolScope` / `memberToolScope` / `crmApi.crmToolScope` is non-null; otherwise `generalToolGate` requires `isGeneralApiKey`. Convention: listing routes FILTER (skills list drops skills left with 0 tools, `core.tools` filtered — empty for module keys; `/skills/<id>` → existing 404); execution `/tools/<name>` → 403 `key_not_general` (checked after the existing scope check, so module-tool behaviour and its 403 body are unchanged).
- **Docs**: one paragraph in `src/app/developers/page.tsx` §1. No chat API doc exists under `docs/api/` (chat contract lives in `ledger/PLAN-CHAT-PLATFORM.md` — not edited).

### Chat auth modes (not changed)
- **secret** — `Authorization: Bearer shark_…` → `verifyApiKey` (now gated as above); no CORS; identity of the customer comes from the body.
- **widget** — `X-Shark-Widget: swk_…` (hash in `ChatChannelConnection`) + `Origin` in `originAllowlist` (empty = deny all); customer identity only from the server-signed HMAC guest token (`X-Shark-Guest`/cookie), never from body/query; rate limit per guest or per IP.
- **guest mint** (`/chat/guest`, widget only) — issues the HMAC guest token bound to the connection.
- Sending both headers → 401. Member customer sessions (`cs_…`) belong to `/api/v1/member/*` altAuth, not chat.

### Per-route table (round 2 additions; before → after)
| lane | general key (incl. rotated) | module key (scoped and/or bound to non-chat system) | key bound to a CHAT system | malformed scopesJson |
|---|---|---|---|---|
| 8 legacy data routes | 200 → 200 | 403 → 403 (`code` scope_missing → key_not_general) | 200 → **403** | 200 → **403** |
| chat secret: identities/messages/thread/unread/replies/read/attachments | 200 → 200 (same system resolution) | 200 (+writes) → **403**, no rows | 200 (first CHAT system!) → 200 on its bound system; other header → **403** | 200 → **403** |
| chat widget / guest | unchanged | n/a | n/a | n/a |
| AI `/skills` | all → all | non-module skills + core listed → **filtered** (core []) | (same as module key) | listed → filtered |
| AI `/skills/<id>` non-module | 200 → 200 | 200 → **404** | 404 | 404 |
| AI `/tools/<non-module>` | 200 → 200 | 200 (+writes: aiMemory, kb) → **403** | 403 | 403 |
| AI module tools (account/kanban/member/crm) | unchanged | unchanged scope logic | unchanged | unchanged |
| `/me` | 200 | 200 | 200 | 200 |

### Acceptance round 2
- Oracle `qc-hf-apiv1-scope`: RED2 on c2287e53 `ผ่าน 61/120` (`ledger/wo-notes/HF-APIV1-red2.txt`: chat writes `chatMessage 1→15, chatContact 2→3 …`, AI write `aiMemory 0→1`, malformed keys read data, chat-bound key ignored its binding) → GREEN `ผ่าน 120/120 · JSON_SUMMARY {"total":120,"passed":120,"findings":[]}`.
  S3 included: rotated legacy key = positive control on 8 routes + chat + AI; the pre-rotation key → 401; every data route now has a seeded row per shop (appointment/queue/reservation/ticket included) so "200 + data" and "other shop sees only its own" are real.
- Regressions (before = c2287e53, after = round 2), identical final summary line on all 72 suites: the 21 API suites (same numbers as round 1) + 51 `qc-chat*`/`qc-ai*` (all green except pre-existing `qc-ai-actions 11/12` CRASH finding, same before/after).
- ORACLE-EDIT (3, identical): `scripts/qc-chat-api-v1.mts`, `qc-chat-replies.mts`, `qc-chat-business-hours.mts` — their fake prisma `tables.apiKey` rows lacked the schema columns.
  before: `{ id: "key-1", …, lastUsedAt: new Date(), createdAt: new Date() }` → after: `{ …, createdAt: new Date(), scopesJson: [], systemId: null }` (+1 comment line).
  Reason: real rows always have `scopesJson` (NOT NULL DEFAULT '[]') and `systemId` (null); without them the fake key reads as malformed/bound and is (correctly) refused. Without the edit: 64/81 · 27/52 · 53/73; with it: 89/89 · 60/60 · 73/73 (= before).
- Fitness 33/33 with and without env (unchanged). Typecheck (5632 MB heap command, once) → `tsc --noEmit` exit 0.

### Customer impact (round 2)
- SiamDive (general key from /app/settings/api): no change on any chat endpoint or system resolution.
- Any module key (account/kanban/member/CRM) used on `/api/v1/chat/*` secret mode: now 403 (previously could impersonate customers, post messages/replies, read threads).
- Module keys on `/api/v1/ai/*`: no longer see/run non-module tools (sales/financial summaries, stock, chat inbox, memory, KB, core tools such as list_systems/kb_search/remember_fact/support_open_case). Their own module tools work as before.
- Keys whose stored scopesJson is malformed (only possible by hand-editing the DB) lose all general-key lanes.

### Controller decisions (round 2)
- D4: module keys lose the AI **core** tools too (`list_systems`, `ask_clarify`, `propose_plan`, `open_system`, `kb_search`, `remember_fact`, `list_memories`, `support_open_case`) — strict reading of "belongs to none of the four modules". If an external agent built on a module key relies on e.g. `list_systems`/`ask_clarify`, whitelist the harmless ones in `general-key-gate.ts`.
- D5: the 3 ORACLE-EDITs touch Fable oracles; CRM-branch oracles with fake `apiKey` rows lacking `scopesJson/systemId` will fail the same way after merge if they hit chat secret mode/AI non-module tools — fix the fake, not the gate.
- D6: chat-bound keys have no issuer UI yet; if one is added later it inherits rule (b).

### Follow-ups (NOT in this hotfix)
- N1 account/kanban settings can rotate/revoke another system's key · N3 label of bound `[]` keys ("อ่าน API กลาง (คีย์รุ่นเดิม)" shown for a bound key) · N5 · `shop/orders` missing `take`.

# Round 3 (final)
- `rotateApiKey` (service.ts): stored scopesJson malformed ⇒ throw Thai ("ข้อมูลสิทธิ์ของคีย์นี้ในระบบไม่สมบูรณ์ จึงหมุนคีย์ให้ไม่ได้ — เพิกถอนคีย์นี้แล้วสร้างคีย์ใหม่แทน") inside the tx ⇒ the claim/revoke rolls back, row unchanged, no child key.
- Chat rule (b) tightened: bound to an active CHAT system of the same tenant **and** `scopes.length === 0` (no chat scope vocabulary yet); bound + any scope ⇒ 403 `key_not_general`.
- `revokeKanbanApiKeyAction` (kanban/settings-actions.ts): mirrors member AUDIT L9 — `prisma.apiKey.findFirst({ id, tenantId, systemId })` first; not owned ⇒ `{ ok:false, "ไม่พบคีย์นี้ในระบบบอร์ดงานนี้ — รีเฟรชหน้าแล้วลองใหม่อีกครั้ง" }`.
- Comment-only fix `chat/service.ts` resolveChatSystemId (caller answers 404 for general key / 403 for bound key).
- Oracle: HF-11.3 asserts `code === "system_mismatch"`; HF-13 bound+scopes, inactive chat system, other tenant's chat system ⇒ 403; `/chat/config` + `/chat/guest` with module Bearer ⇒ 403 and no rows; malformed shapes now 5 (object, string, [1], ["x",1], JSON null) on data routes + chat + rotation (HF-14); "nothing written" snapshots fail when a table cannot be counted; HF-15 kanban settings action (requireTenant/next-cache stubbed in-process): cannot revoke the shop's general key nor an account-bound key, can revoke its own.
- RED3 on 3285b19f `ผ่าน 133/141` (`ledger/wo-notes/HF-APIV1-red3.txt`, the 8 new behaviours) → GREEN `ผ่าน 141/141`.
- Regressions before = 3285b19f: 75 suites identical (72 + qc-kanban-k1.15 28/30 · qc-kanban-k2.7 30/31 · qc-member-fix-s1 S1-ERR fixture crash — all pre-existing, same before/after). Fitness 33/33 both modes.
- D4 ruling applied: module keys on `/api/v1/ai/*` lose `core.tools` (returned empty: list_systems, ask_clarify, propose_plan, open_system, kb_search, remember_fact, list_memories, support_open_case), every non-module skill (sales, inventory, booking, shop, restaurant, hotel, rental, ticket, school, clinic, hr, approvals, chat, knowledge, automation, memory — hidden/404), and inside the `crm` skill the three legacy non-registry tools `recent_leads`, `marketing_create_campaign`, `growth_recommendations` (registry CRM tools incl. `crm_create_lead` keep their scope rule).
- Note for the CRM session (account/connections-actions.ts not touched here — CRM C5.4-B changes it): after CRM merges, `accountManagedKey` still lets the accounting settings page rotate an UNBOUND general key; this hotfix makes general keys more valuable (chat impersonation, all shop data). Recommendation: general keys are managed only from /app/settings/api (account page may rotate/revoke only keys bound to its own ACCOUNT system).
- Typecheck (5632 MB heap, once) → `tsc --noEmit` exit 0.
