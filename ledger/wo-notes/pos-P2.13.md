# P2.13 S + U-lite — REST `/api/v1/pos` (48 ops) · registry/docs/skill · API-key issuance — builder notes

Builder (account B) · 15 Oct 2026 · tree `/root/projects/shark-pos-b` · branch `wip/pos-p2.13` from `d0561566` (= `origin/session/pos` 1c29ca9e code) + merge of `origin/wip/pos-p2.13-oracle` 580ecbbb.
Contract: `ledger/pos-briefs/pos-brief-P2.13.md` §10 rulings 1–11 (CD1–CD10) · oracle notes `ledger/wo-notes/pos-P2.13-oracle.md`.
Logs: `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p213/runs/` (line 1 of each = `tree= head= dirty=`).

## Status
Built and gated. `qc-pos-p2.13` **48/49** (forced ×2 + unforced + post-merge) — the only red is **OR4 = CONTROLLER-DECISION CD-B1** (oracle step order contradicts order.ts). `qc-pos-api-skill` 10/10. Typecheck 0 (2 runs). Fitness ±env 53/53 · fitness-pos 8/8.

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
- **CD-B1 · `qc-pos-p2.13` OR4 (oracle defect)** — the oracle sells a DIRECT order as accept → preparing → ready → **complete → pay**. `order.ts step("HANDED")` refuses hand-over of an UNPAID / PAY_ON_PICKUP order (`ORDER_UNPAID` → 409 `state_conflict`, existing P2.8 rule), and `payOrder` refuses a HANDED order. Actual: `complete 409:state_conflict · pay 200` (pay works through the API since the CD5 extension). Rec: ORACLE-EDIT OR4 to accept → preparing → ready → **pay → complete**, illegal step = preparing on the HANDED order (both already behave). Not edited (outside the pre-approved batch).
- **CD-B2 · route reorder** `src/app/api/v1/ai/tools/[name]/route.ts` (not in the hunk list): ruling 7 + oracle ST5 (`sales_summary` with `["kanban.card.read"]` = false) made the scope gate answer module keys before the HF-APIV1 general-key gate ⇒ `qc-hf-apiv1-scope` HF-12.6.x lost `key_not_general` (and HF-12.1–12.3 lost legacy keys). Fixed by (a) legacy `[]` keys keep the old behaviour in the skills.ts hunk, (b) moving the general-key gate first (same answers for every module tool). Now hf-apiv1 143/143. Confirm the reorder.
- **CD-B3 · CD5 extended**: API refunds (refund.ts) as ruled, and also `orders.pay` (order.ts hunk: REST pay = createSale's other-sources rule instead of the device shift — without it every API cash order payment is `SHIFT_REQUIRED`). Confirm.
- **CD-B4 · API bills refundable**: refund.ts treats `sourceModule "API"` as POS-owned (else a bill sold through the API can never be refunded — agent acceptance task "refund one line"). Still not voidable from the bills drawer UI (`bills.ts voidSaleByActor` refuses non-POS; REST `sales.void` works) and API bills do not create KDS tickets (`kds.ts` NOT_REGISTER_SALE) — owner line added; rec: follow-up card if wanted.
- **CD7 class (by design, not decisions)**: lane pins comparing `register*.ts`/`refund.ts`/`order.ts`/scripts against the merge-base are red on the wip branch, green on the merge tip: `qc-pos-p2.10` ST2 · `qc-hf-fu` ST1 · `qc-pos-p2.11` ST4 · plus the same class `qc-pos-p2.8` ST6 and `qc-pos-p2.12` ST1.
- Environment note: `qc-kanban-k1.15` S3.2/S3.4 need the gitignored kanban skill folder in the tree — copied from `/root/.claude/skills/shark-kanban-api` (local only) → 30/30.

## Visual `--state` list for the controller (wo `p2.13`, owner + `--user manager`, th + LOCALE=en, 3 sizes)
`settings-shark-api-keys-empty` · `settings-shark-api-keys-create` · `settings-shark-api-keys-raw` · `settings-shark-api-keys-list` · `settings-shark-api-keys-revoke` · `developers-pos` (public page smoke, no session). Run th/en and owner/manager one at a time (the empty state needs zero keys on the QC POS system).

## Gates (head after merge 84437d7e unless noted · logs `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p213/runs/`)
| Gate | Result | Log |
|---|---|---|
| qc-pos-p2.13 forced #1 / #2 | 48/49 (OR4 = CD-B1) | g2-p213-f1.log · g2-p213-f2.log (head 5580a77f) |
| qc-pos-p2.13 unforced | 48/49 (OR4) | g2-p213-u.log (5580a77f) · g4-p213-postmerge.log (84437d7e) |
| qc-pos-api-skill forced | 10/10 | g2-skill.log · dev3-skill.log |
| qc-pos-p0.2 (edited) | 56/56 | g2-p02.log |
| qc-hf-apiv1-scope | 143/143 | g2-hf-apiv1.log (first run 133/143 → CD-B2 fix) |
| qc-account-api-core | 64/64 | g1-qc-account-api-core.log |
| qc-kanban-k1.15 | 30/30 | g2-kanban.log |
| qc-ai-skills | 23/23 | g1-qc-ai-skills.log |
| qc-pos-p1.3 | 128/128 | g1-qc-pos-p1.3.log |
| qc-pos-p1.8 | 49/49 | g3-p18.log (after the shift.ts fix) |
| qc-pos-p2.8 | 60/61 (ST6 = CD7 class) | g1-qc-pos-p2.8.log |
| qc-pos-p1.17 | 40/40 | g1-qc-pos-p1.17.log |
| qc-pos-p2.11 | 33/34 (ST4 = CD7) | g1-qc-pos-p2.11.log |
| qc-pos-p2.12 | 32/33 (ST1 = CD7 class) | g1-qc-pos-p2.12.log |
| qc-pos-p1.6 | 48/48 | g1-qc-pos-p1.6.log |
| qc-hf-tx | 22/22 | g1-qc-hf-tx.log |
| qc-hf-fu | 28/29 (ST1 = CD7) | g1-qc-hf-fu.log |
| qc-pos-p2.6 | 67/67 | g1-qc-pos-p2.6.log |
| qc-pos-p1.1 | 180/180 | g1-qc-pos-p1.1.log |
| qc-pos-p2.1 (edited) | 55/55 | g1-qc-pos-p2.1.log |
| qc-pos-p2.9 / p2.9b | 62/62 · 53/53 | g1-qc-pos-p2.9.log · g1-qc-pos-p2.9b.log |
| qc-pos-p1.9 | 53/53 | g3-p19.log (first run 52/53 → S.R2.1 fixed) |
| qc-pos-p2.10 | 12/13 (ST2 = CD7) | g1-qc-pos-p2.10.log |
| qc-hf-pos-page-authz | 81/81 | g1-qc-hf-pos-page-authz.log |
| gen-pos-api-docs --check | exit 0 | — |
| typecheck | #1 3 errors (fixed) · #2 exit 0, 0 errors | typecheck1.log · typecheck2.log |
| fitness (env / no env) · fitness-pos | 53/53 · 53/53 · 8/8 | fitness-env.log · fitness-noenv.log · fitness-pos.log |
| visual-pos p2.13 --states --dry (th/en × owner/manager) | exit 0 (18/6/18/6 shots) | visual-dry-*.log |

## Fix round 1 (builder · 15 Oct 2026 · rulings `pos-P2.13-review.md` §"Controller rulings — fix round 1" 1–8)
Base be0f92cb → merged tip **5bbd1722** (= fix commits + merge of `origin/session/pos` 9a21e36c, P2.12U; no schema change ⇒ no `prisma generate`). Logs: `…/scratchpad/p213/runs/fix1/` (line 1 = `tree= head= dirty=`).

### Oracle (test-first)
- `0e69cecc` ORACLE-EDIT OR4 (CD-B1, marker `// ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.13)`): accept → preparing → ready → **pay → complete** · illegal step = preparing on the HANDED order.
- `cb87affd` ORACLE-ADD (marker `// ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 fix 1)`): AU9 · SA9 · SA10 · OR7 · RP5 ⇒ 54 checks. Fixtures inside the checks: POS_VOID policy ≥ ฿1,000 (SA9) · 2nd device + shift S opened/closed (SA10) · `manualConfirmRequiresManager` on/off around AU9 (+ positive control CASH 200) · DIRECT channel `CUSTOM_WALKB` on branch B with no shift (OR7, positive control TRANSFER 200).
- Red-before (`c6e1c7be`, `P2.13-red.txt` §fix1 · `runs/fix1/red-p213-u.log`): unforced 48/54 — AU9 SA9 SA10 OR7 RP5 red as expected; OR4's step order passes after the edit but OR4 stayed red on a **second oracle-vs-code mismatch**: `orders.pay` answered `data` = the saleId string on a first pay (CD9 single-field rule) and `{saleId, duplicated}` on a replay ⇒ fixed in code (`9c22b9aa`, below), no further oracle edit.

### Per ruling (files · marked hunks `// POS P2.13 ▸ fix1 … ◂`)
1. **F1** `d0006a64` — `pos/api/ops/sales.ts` `sales.void` → `voidSaleByActor` (service key `posOpServiceKey`, refusals via `posResult` → map; `foreignSaleError` + status pre-check + `voidErrorToApi` kept; raw `voidSale` import gone). `bills.ts:635` predicate `POS || API` **and** `bills.ts:456` `billDetail.isPos` `POS || API` (**deviation**: second hunk needed so the drawer actually offers void/refund for API bills — otherwise the corrected owner line is false). Owner line (F8) appended. Op summary + docs.
2. **F2/H1** `b5f0d02b` — `service.ts` S11 one line `sourceModule === "POS" || === "API"`, FOR SHARE kept; contract sha 72afb258 unchanged; fitness-pos F15.2 green (info: voidSale caller −1 `ops/sales.ts`, snapshot not regenerated).
3. **F3/H2 option (b)** `347d5536` — `register.ts` HF-PP gate `(!!s.apiKeyId || !evaluate(… pos.shift.manage …))` · `order.ts` HF-PP2 gate `(apiPay || !can(…))` ⇒ PERMISSION_DENIED 403 `forbidden`, 0 bills. `pos-operate` bundle keeps `pos.shift.manage` (AU6/SH1 unchanged, no ORACLE-EDIT needed); bundle summary (`scopes.ts` P2.13 block), contract text §5, docs, SKILL, owner line.
4. **F4** `fcc2e0e1` — `reports.ts` `reportStaff`: seller ids not found as users → tenant `ApiKey` (one `findMany` per chunk) → `"API: <name>"`; op summary + docs. **F5** `386cfc35` — contract text §5 + SKILL (custom-only cart in a service-charge shop = 422; add a catalog line). **F6** `d591cfb4` — `http-errors.ts` `hintOf` APPROVAL_REQUIRED/PENDING_APPROVAL → hint with `requestId`; APPROVAL_REQUIRED no longer `nothingWritten` (stored, same key replays it); contract text §7, docs ("deciding approval requests" not in the API), SKILL line. **F7/F8 + follow-ups** `b944434c` — owner-pending lines → HF-FU2 (F7 catalog audit actorType · tax-invoice service key · order state after REST void · revoke scope · replay-after-TTL quote caveat · + 2 builder lines, below).
5. **H3** `f77d9aab` — `order.ts` `payOrder`: REST + CASH rows ⇒ bind the single OPEN shift of the branch (passed as `shiftId`, createSale re-checks under FOR SHARE); 0 or 2+ open shifts ⇒ SHIFT_REQUIRED before any write; non-cash = other-sources rule as before. **`submitRegisterSale` (POST /sales) does NOT already refuse**: CASH without `shiftId` while `requiredOtherSources` is off lands out of shift (createSale other-sources rule, same as every non-register source) — not changed (prompt scoped H3 to payOrder); follow-up line (6). Contract text §14 + `orders.pay` summary.
- Extra `9c22b9aa` — `ops/orders.ts` `orders.pay` always answers `{ saleId, duplicated }` (marked hunk; docs "Shapes of a reply"). Follow-up line (7): other single-field write replies may flip shape on `duplicated` — audit all ops.
- Docs/skill: `gen-pos-api-docs.mts` regenerated in each commit that changed a summary (pre-commit F13.14) · `.claude/skills/shark-pos-api/SKILL.md` (gitignored) updated + `references/*` copied byte-identical to `/root/.claude/skills/shark-pos-api/`.

### CONTROLLER-DECISION
- **CD-F1a** — REST `sales.void` of an **AI**-sourced bill (`sourceModule "AI"`, `ai/proposals.ts`) is now refused SALE_NOT_VOIDABLE (409) because the ruled predicate is `["POS","API"]`; before fix1 the raw `voidSale` voided it (the drawer never could). Rec: keep (AI bills void in the app) or add `"AI"` to both bills.ts predicates.

### Gates (merged tip 5bbd1722 unless noted)
| Gate | Result | Log |
|---|---|---|
| qc-pos-p2.13 forced #1 / #2 / unforced | 54/54 · 54/54 · 54/54 | m-p213-f1 · m-p213-f2 · m-p213-u (pre-merge b944434c: g-p213-f1/f2/u 54/54 ×3) |
| qc-pos-api-skill forced | 10/10 | m-skill |
| qc-pos-p1.9 · p1.8 · p1.3 | 53/53 · 49/49 · 128/128 | m-p19 · m-p18 · m-p13 |
| qc-pos-p2.8 | 60/61 (ST6 = CD7 lane pin, register/service sha vs base) | m-p28 |
| qc-pos-p1.17 · hf-apiv1-scope · p0.2 | 40/40 · 143/143 · 56/56 | m-p117 · m-hf-apiv1 · m-p02 |
| extra: qc-pos-p2.12 · p1.16 · hf-pos-page-authz | 32/33 (ST1 = CD7 lane pin, now incl. service.ts) · 28/28 · 82/82 | m-p212 · m-p116 · m-authz |
| extra (pre-merge b944434c): qc-pos-p1.15 · p1.7 | 39/39 · 33/33 | g-p115 · g-p17 |
| gen-pos-api-docs --check | exit 0 | m-gen-check |
| typecheck | 0 errors (pre-merge #1 + merged #2) | typecheck1 · typecheck2 |
| fitness no env / env · fitness-pos | 53/53 · 53/53 · exit 0 | m-fitness-noenv · m-fitness-env · m-fitness-pos |
| visual-pos p2.13 --states --dry th/en × owner/manager · p2.12u --dry | exit 0 ×5 | m-visual-dry-* |

## Skill fix-up (builder · 15 Oct 2026 · `wip/pos-p2.13-skill` on 42cc377e · ruling = end of `pos-P2.13-review.md` · transcript `pos-P2.13-agent.md`)
Skill dir `.claude/skills/shark-pos-api/` is gitignored ⇒ delivered as the canonical copy `/root/.claude/skills/shark-pos-api/` (`diff -r` identical to tree b). SKILL = `SKILL.md`, REC = `references/recipes.md`.
### Oracle
- 19460144 `test(qc-pos-api-skill)` ORACLE-ADD (marker `// ORACLE-ADD ผู้คุม 15 ต.ค. (P2.13 skill fix)`): brief's K7/K8 registered as **K7b** (no `$VAR`/`$(uuidgen)` inside `'…'` — shell scanner) and **K8b** (POST /orders recipe on CUSTOM `$CHANNEL_CODE` with `startStatus NEW` → replay 2xx, DB order NEW on kind CUSTOM → accept recipe with ORDER_ID = that order → 2xx, DB ACCEPTED) because K7/K8 ids were taken · additive fixture var `$CHANNEL_CODE` (CUSTOM channel `PHONE`, adapter NONE, payout DIRECT) · 10 + 2 = 12.
- Red-before at 42cc377e: 10/12 (K7b K8b red) — `P2.13-red.txt` §skillfix (9bb74ebc). Extra controls (scratch): every recipe run through real bash with a stub `curl` → all 12 bodies valid JSON with values filled in; the old recipes give 4 BAD (quote, sell, refund, 86) = exactly K7b's red list.
### Gap → change
1. order create: SKILL:133-160 (`## Orders`: body fields, channel kinds that take orders, MANUAL-adapter ⇒ ACCEPTED vs CUSTOM/other ⇒ NEW, auto-accept exception, `acceptBy` = received + 2 min = display target, no auto reject (order.ts:583/641, order-shared.ts:28), reject `reasonCode` list) · REC:151 new recipe `POST /orders` + REC:173 accept recipe text.
2. quoting: REC:20 rule (double-quoted bodies, `\"`), every body rewritten; `export` example REC:16.
3. open shift: SKILL:121 `## Shifts` (`/shifts/current` needs `deviceId` from `GET /devices`; `GET /shifts` has **no** status filter — keep `status: OPEN` rows) + SKILL:71 list sizes (`GET /shifts` = newest 50, `limit` ≤ 200, shift.ts:855; `GET /orders` = since day start, ≤ 7 days) · REC:55 new recipe · conventions #10 in `pos/api/openapi.ts:42` (⇒ POS-API.md Conventions).
5. line ids: SKILL:171 (only `/refundable`, needs `pos.sale.refund` = pos-admin) · REC:119 new recipe (Error branch 403 scope_missing).
7. reports `unitId`: SKILL:79 (omitted = all permitted branches ⇒ `unitId: null`, reports.ts:43) · REC:216 (daily CSV recipe now sends `unitId`).
8. `duplicated`: SKILL:55 (POS dedupe — externalRef / key after the 24 h window — vs replay header `Idempotent-Replayed: true` with the first body) · REC sell recipe · gen-pos-api-docs.mts:373.
9. `reasonCode`: SKILL:175 + REC refund recipe (DAMAGED, WRONG_ITEM, CHANGED_MIND, OTHER = refund-shared.ts REFUND_REASON_CODES; order reject = ORDER_REJECT_REASONS).
10. wording: `pos/api/openapi.ts:61-80` post-processes the core doc — X-Shark-System, 403, 404 descriptions say "POS system" (core `src/lib/api/openapi.ts` untouched: shared with accounting) · 0 "accounting book" left in `/api/v1/pos/openapi.json` (48/48 ops patched) · `/developers/pos` does not echo these strings ⇒ unchanged.
- also: receipt link = `data.footer.qrEReceiptUrl` (null when the shop turned the e-receipt QR off) SKILL:117 · REC:114.
- gaps 4/6 (P2.14 lines, not changed): noted as "known naming gaps" SKILL:84 · REC:101 · gen-pos-api-docs.mts:374.
- 1c87f392 `docs(pos-api)`: generator + openapi text + regenerated `docs/api/POS-API.md` + skill `endpoints.md` (unchanged bytes). No response shape/status/code, no prisma/, no package.json.
### Gates (head after 1c87f392 · logs `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/p213s/runs/`)
qc-pos-api-skill 12/12 unforced ×2 (skill-u1/u2) · qc-pos-p2.13 54/54 unforced · qc-kanban-k1.15 30/30 · gen-pos-api-docs --check 0 · fitness 53/53 no-env + QC4 env · fitness-pos 8/8 · typecheck 0 (heap 8192).
