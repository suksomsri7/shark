# P2.13 S + U-lite — REST `/api/v1/pos` (48 ops) · registry/docs/skill · API-key issuance — builder notes

Builder (account B) · 15 Oct 2026 · tree `/root/projects/shark-pos-b` · branch `wip/pos-p2.13` from `d0561566` (= `origin/session/pos` 1c29ca9e code) + merge of `origin/wip/pos-p2.13-oracle` 580ecbbb.
Contract: `ledger/pos-briefs/pos-brief-P2.13.md` §10 rulings 1–11 (CD1–CD10) · oracle notes `ledger/wo-notes/pos-P2.13-oracle.md`.
Logs: `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p213/runs/` (line 1 of each = `tree= head= dirty=`).

## Status
(see "Gates" at the end — updated after the final run)

## Red-before at this base (d0561566)
- `qc-pos-p2.13` forced = **2/49** (Z1 Z2; RP2 is now real because P2.12 S merged → red) — `runs/base-p213-forced.log`
- `qc-pos-api-skill` forced = **1/10** (K10) — `runs/base-skill-forced.log`

## Files (names table of the oracle notes, implemented exactly)
- Route: `src/app/api/v1/pos/[...path]/route.ts` (5 thin exports) · `src/app/api/v1/pos/openapi.json/route.ts`
- `src/lib/modules/pos/api/{config,actor,dispatch,openapi,http-errors,keys}.ts` + `units.ts` (unit gate + record-unit lookups, read only)
- Ops `src/lib/modules/pos/api/ops/{meta,sales,shifts,devices,products,channels,orders,reports}.ts` — 48 ops in §1 order; P0.2 ids kept (`sales.create/void/summary/byDay`, test ids POS-P0.2-OP.1–4); new ops' test id = their op id (quoted row of `OPS_SPEC` in qc-pos-p2.13 → fitness F13.13)
- `src/lib/modules/pos/api-key-actions.ts` ("use server": `listPosApiKeysAction` · `createPosApiKeyAction` · `revokePosApiKeyAction`)
- `scripts/gen-pos-api-docs.mts` → `docs/api/POS-API.md` + `.claude/skills/shark-pos-api/references/endpoints.md` (gitignored; copied to `/root/.claude/skills/shark-pos-api/`)
- `src/app/developers/pos/page.tsx` (server, tokens only, `data-testid="developers-pos"`) · `src/app/developers/pos.md/route.ts`
- Skill (hand written, gitignored): `.claude/skills/shark-pos-api/SKILL.md` + `references/recipes.md` (9 curl recipes, each with a replayable `Error branch:`) — byte-identical copies in `/root/.claude/skills/shark-pos-api/`
- U-lite: `src/app/app/sys/[id]/pos/settings/ApiKeysCard.tsx` (new) · messages `pos.settings.api.*` in `src/messages/{th,en}/pos.json` (69 keys each) · 20 rows in `scripts/pos-ui-inventory.json` · wo `p2.13` in `scripts/visual-pos.mts`

## Marked hunks in shared/hot files (`// POS P2.13 ▸ … ◂`)
- `src/lib/api-keys/scopes.ts` — `isPosFilterScope` + `POS_FILTER_UNIT_PREFIX` (pseudo-scope `pos.filter.unit:<unitId>`, placed before the `*_SCOPE_KEYS` initialisers to avoid TDZ) · `POS_SCOPE_KEYS` · bundle ids · `pos-read/pos-operate/pos-admin` exactly §2.1
- `src/lib/ai/skills.ts` — `POS_TOOL_SCOPES` + one clause in `toolAllowedForApiKey` (ruling 7). Legacy general keys (`scopes []`) keep their previous behaviour (HF-APIV1 general-key gate decides).
- `src/app/api/v1/ai/tools/[name]/route.ts` — **deviation**: the HF-APIV1 general-key gate moved before the scope gate (2 lines). Without it the ruling-7 gate answers scoped module keys 403 with the scope body instead of `key_not_general` (qc-hf-apiv1-scope HF-12.6.x). Module tools are unaffected (the general gate always passes them).
- `src/lib/modules/pos/catalog.ts` — `CatalogCtx.actorMembership?` + `CATALOG_API_ACTOR_PREFIX = "apikey:"` + `actorOf` path (only `apikey:` prefix + STAFF membership; ruling 4)
- `src/lib/modules/pos/register.ts` — `RegisterApiCtx` (`apiKeyId`, `apiShiftId` set only by server code), `RegScope.apiKeyId`; bills from REST = `sourceModule "API"`, `sourceId = keyId`; replay compares source API + keyId; shift = `shiftId` not sent ⇒ createSale's "other sources" rule (ruling 6)
- `src/lib/modules/pos/shift.ts` — `resolveApiRefundShift` (CD5)
- `src/lib/modules/pos/refund.ts` — **CD5** API refunds: bill's shift when OPEN, else other-sources rule; **deviation**: bills with `sourceModule "API"` are refundable (`POS_REFUND_SOURCES = ["POS","API"]`) — otherwise a bill sold through the API could never be refunded (agent acceptance task "refund one line")
- `src/lib/modules/pos/order.ts` — **deviation (CD5 extended to `orders.pay`)**: REST pay (ctx `apiKeyId`) skips the device-shift check and lets createSale bind the shift (other-sources rule); `saleBase.shiftId` may be `undefined`
- `scripts/fitness.mts` — F13.13 (test ids) · F13.14 (POS-API.md == generator) · F13.15 (no op declares tool)
- `src/app/developers/page.tsx` — link block · `src/app/app/sys/[id]/pos/settings/SharkSettings.tsx` — card mount (2 lines)
- Untouched: `pos-sale-contract.json` (sha 72afb258…) · `service.ts` · `prisma/` · `package.json` · `outbox-consumers.ts` · `ai/tools.ts` · `lib/api/**`

## Behaviour decisions inside the rulings
- Response contract (CD9): read `data` = facade result minus `ok` (single field ⇒ its value). `sales.list` = `paged(items)` + `date/counts/summary`; `products.list` = cursor paging (`page` + `nextCursor`, `page.total` = rows of this page).
- `expectedGrandTotalSatang` optional (CD4): absent ⇒ the op takes `grandTotalSatang` of `quoteRegisterCart` (no money math in the op). `cashReceivedSatang` absent ⇒ = CASH part.
- Custom-only (P0.2 shape) carts keep the schema checks Σpay = Σlines and Int bounds (CD1 → S5.8/S5.10 green); `posSaleServiceKey` + `voidErrorToApi` kept (CD1, CD3).
- `sales.void` keeps the P0.2 path (`voidSale` + foreign-source 409), now with `{actorUserId: keyId, reason}` audit, unit filter, `HAS_REFUNDS` → 409.
- Refund lines `restock` default **true** (the facade only restocks `restock === true`; SA7 expects +1).
- Reports `from/to` optional (default last 7 days); `sales.summary` = `{from,to,unitId,...totals}` of `reportDailySales`; every report op has CSV via `reportCsv`.
- Refusal map: 122 codes (exhaustive `Record<PosRefusalCode,…>`), INTERNAL/UNKNOWN → 500 `internal` (CD6); returned refusals with 409/429/503 flagged `nothingWritten` (claim released).
- Key issuance: `pos.settings.manage` (assertCan) + `api.key.create|revoke`; bundle must be `pos-*`; issuer must hold every scope (STAFF) and, unless OWNER/"*", must restrict the key to own branches; branch filter ids must be linked to this POS system.

## ORACLE-EDIT batch applied (marker `// ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.13)`, one `test(...)` commit per suite)
- `createSale` caller pins `pos/api/ops/sales.ts` 1 → 0: `qc-pos-p1.6.mts:404` · `qc-hf-fu.mts:297` · `qc-pos-p2.4.mts:381` · `qc-pos-p2.5.mts:525` · `qc-pos-p2.6.mts:427` · `qc-pos-p2.8.mts:445` · `qc-pos-p2.9.mts` L2 (`delete base[...]`) · `qc-pos-p2.9b.mts` L2 (same) · `qc-hf-tx` HT6.4 reads the p1.6 map (no edit)
- `qc-pos-p2.1.mts:488` ST3 — five v1 tenders (CD2)
- `qc-pos-p0.2.mts` (CD1): S1.5 (coverage of the 4 P0.2 ops) · S1.6 (VALID from/to, 4 P0.2 ops) · S2.3 (exact `pos-*` bundles) · S3.3 (P0.2 ops have rows) · S4.4 `[GET,POST]` · S4.5 `sales.list` · S4.6 route exists · S5.7 from/to · S6.0/S6.4 positive control = "not 404 and not ok" · S7.1–S7.6 re-based on `reportDailySales` (PAR with the reader, 404 on a ghost system). S3.5 needed no edit.

## CONTROLLER-DECISION
(filled at the end)

## Visual `--state` list for the controller (wo `p2.13`, owner + `--user manager`, th + LOCALE=en, 3 sizes)
`settings-shark-api-keys-empty` · `settings-shark-api-keys-create` · `settings-shark-api-keys-raw` · `settings-shark-api-keys-list` · `settings-shark-api-keys-revoke` · `developers-pos` (public page smoke, no session). Run th/en and owner/manager one at a time (the empty state needs zero keys on the QC POS system).

## Gates
(filled at the end)
