# P2.13 oracle — REST `/api/v1/pos` + skill `shark-pos-api` + docs (registry) · `scripts/qc-pos-p2.13.mts` + `scripts/qc-pos-api-skill.mts`

Oracle writer (account B) · 15 Oct 2026 · tree `/root/projects/shark-pos-b` · branch `wip/pos-p2.13-oracle` from `origin/session/pos` **f37d605b**.
Contract = `ledger/pos-briefs/pos-brief-P2.13.md` (controller tree) ⚠️1–10 · §0–§6 · §10 rulings 1–10.
Main suite **49 checks**: `ST1–ST6 · AU1–AU8 · RL1–RL2 · ID1–ID5 · SA1–SA8 · OR1–OR6 · PR1–PR5 · RP1–RP4 · SH1–SH3 · Z1–Z2`.
Skill harness **10 checks**: `K1–K10` (ids `P2.13S-K*`). Red-before = `ledger/wo-notes/P2.13-red.txt`.

## Run
- `pnpm exec tsx scripts/qc-pos-p2.13.mts --list` (no DB) · `--no-db` = ST1–ST6 by reading files (no prisma in-process; ST4 spawns `gen-pos-api-docs --check` only when the script exists)
- QC4: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p2.13.mts` (same for `qc-pos-api-skill.mts`)
- Without `QC_FORCE=1` both SKIP (exit 0) while the route / `pos/api/*` files / SKILL.md are missing.
- ST5 pins compare against `git merge-base HEAD origin/session/pos` (fallback `f37d605b`, override `P213_BASE=<rev>`).
- RP2 (P2.12 kinds) = SKIP-with-reason while `REPORT_KINDS` lacks `branches hourly anomalies` — also under QC_FORCE (ruling 10); turns real after P2.12 S merges.
- Skill harness self-test knob `P213_SKILL_DIR=<dir>` (positive control of the curl/recipe parser only; gates never set it). Sample used at write time: scratch `p213o/skill-sample` → K1–K4 + K7 green, K5/K6 red as expected.
- Fixtures: temp tenant `posqc-p213-<rand>` (+`-t2`) — POS S1 (units A,B) · POS S2 (unit C) · INVENTORY (A) · ACCOUNT (VAT 7 %, linked to S1) · KANBAN · T2 POS (unit X) · users OWNER / STAFFK (STAFF, `pos.sale.read` only = creator of the admin key) / OWNER2 · channels LINEMAN (MANUAL, PLATFORM) · CUSTOM_APP (adapter API, DIRECT) · CUSTOM_WALK (DIRECT) · products water/tee (stock, 1000/20000) · latte MENU 6500 + option "เพิ่มช็อต" +1500 · weighed beef 40000/kg PLU 54321 (rule prefix 20 WEIGHT) · barcode product 2500 · device + open shift on A · 12 keys. Everything wiped in `finally`; rate buckets `%:api:%:<keyId>` deleted.

## Names table (the contract the builder implements)
| What | Name / shape |
|---|---|
| route | `src/app/api/v1/pos/[...path]/route.ts` — 5 one-line exports `GET POST PATCH PUT DELETE` delegating to `@/lib/modules/pos/api/dispatch` (no prisma / if / switch, ≤ 30 lines) · `src/app/api/v1/pos/openapi.json/route.ts` `GET` (no key) = 48 operations |
| module files | `src/lib/modules/pos/api/{config,actor,dispatch,openapi,http-errors,keys}.ts` · ops `pos/api/ops/{meta,sales,shifts,devices,products,channels,orders,reports}.ts` |
| config | `POS_API_CONFIG {module:"pos", systemType:"POS", scopePrefix:"pos.", rateNs:"pos", makeActor, messages}` (rate read 300 · write 60 · report 30 / min / key → `X-RateLimit-Limit` 300/60/30) |
| actor | `posApiKeyActor` → `ApiActor` + synthetic `RegisterActor {userId: keyId, role:"STAFF", unitAccess:["*"] \| filter units, permissions: {scope:true…}}` — the oracle calls every facade directly with exactly this actor for PAR |
| service key | `keys.ts` `posApiServiceKey(keyId, idempotencyKey)` = `"api_" + sha256hex(keyId + "\n" + idempotencyKey).slice(0, 64)`; PosSale.idempotencyKey must **end with** it (register prefix `reg2:` allowed) · keep `posSaleServiceKey` in `ops/sales.ts` exported unchanged (P0.2 S5.11) |
| refusal map | `http-errors.ts` `export type PosRefusalCode` · `export const POS_REFUSAL_HTTP: Record<PosRefusalCode, {status, code, en}>` covering the 122 codes of RegisterRefusalCode · BillsRefusalCode · ReceiptRefusalCode · RefundRefusalCode · ShiftRefusalCode · PosDeviceRefusalCode · CatalogErrorCode · ChannelRefusalCode · OrderRefusalCode · ReportRefusalCode · TaxInvoiceRefusalCode · PosSaleErrorCode · `export function toPosApiError` · statuses: `*NOT_FOUND`→404 not_found · PERMISSION_DENIED/NO_PERMISSION→403 forbidden · VALIDATION/PAYMENT_MISMATCH/INVALID_LINE/REASON_REQUIRED/TAX_ID_INVALID→422 validation · IDEMPOTENCY_CONFLICT→409 idempotency_conflict · ORDER_STATE_* ORDER_UNPAID CHANNEL_PAUSED SHIFT_* HAS_REFUNDS PRICE_CHANGED SALE_NOT_VOIDABLE/REFUNDABLE NOT_ELIGIBLE ALREADY_ISSUED TOO_LATE SALE_VOIDED→409 state_conflict · `*_TAKEN`→409 duplicate · RATE_LIMITED→429 · BUSY→503 upstream_unavailable · INTERNAL→500 (code not pinned) · `en` ASCII |
| ops (48) | see table below — id · method · path · scope · kind exact; `module "pos"`, `auditAction "pos.api.<id>"`, ASCII summary, Thai label, unique test id, strict input, **no `tool`** |
| scopes | `api-keys/scopes.ts` bundles `pos-read` = [pos.sale.read, pos.report.view] · `pos-operate` = read + [pos.sale.create, pos.order.accept, pos.shift.manage, pos.device.manage] · `pos-admin` = operate + [pos.sale.void, pos.sale.refund, pos.sale.priceOverride, pos.order.reject, pos.product.manage, pos.product.setPrice, pos.channel.manage, pos.taxinvoice.issue, pos.report.anomaly] (exact sets) · `POS_SCOPE_KEYS` · `isApiScope("pos.filter.unit:<unitId>") === true` · `POS_SCOPES` (op.ts) holds every scope used |
| key issuer | `src/lib/modules/pos/api-key-actions.ts` ("use server") — async create/list/revoke functions · `expandBundles` + bundle must be `pos-*` + `createApiKey(...)` · gates `api.key.create` / `api.key.revoke` + `pos.settings.manage` |
| AI gate | `ai/skills.ts` `toolAllowedForApiKey` one hunk marked `POS P2.13 ▸` · `sales_summary`/`sales_by_day` ⇐ `pos.sale.read` · `pos_create_sale` ⇐ `pos.sale.create` · `void_sale` ⇐ `pos.sale.void` (others false) |
| docs | `scripts/gen-pos-api-docs.mts --check` exit 0 · `docs/api/POS-API.md` (every `METHOD path` + Idempotency-Key, confirm, satang, unitId, `pos.sale.paid` webhooks) · `.claude/skills/shark-pos-api/references/endpoints.md` (every `METHOD path`) · `src/app/developers/pos/page.tsx` (buildOpenApi/POS_OPS) · `src/app/developers/pos.md/route.ts` GET = doc bytes · link in `src/app/developers/page.tsx` · `scripts/fitness.mts` block calling `gen-pos-api-docs` |
| response contract | read ops: `data` = facade success object minus `ok` (or the value of its single remaining field) · `sales.list` / `products.list` = `data[]` + `page` · write: `sales.create` → `data.saleId` · `orders.create` → `data.orderId` + `data.duplicated` · `sales.refund` → `data.refund.id` (or `data.refundId`) · `products.create` → `data.id` (or `data.product.id`) |
| unitId | required on list/create ops (GET `/sales /products /orders /channels /devices /shifts /shifts/current` query · POST `/sales /sales/quote /orders /products` body) · optional on `{id}` ops (record's unit after the unit gate; mismatch = 404) — the oracle calls both ways · per-key filter `pos.filter.unit:<id>` ⇒ other units 404 |
| POST /sales body | `{unitId, lines (product {productId, qty, options?:[{choiceId}], weighedBarcode?} \| custom {name, qty, unitPriceSatang}), payMethods [{type, amountSatang, reference?}], expectedGrandTotalSatang?, channelId?, channelRef?, cashReceivedSatang?, note?, billDiscount?}` → `submitRegisterSale` · tenders CASH TRANSFER PROMPTPAY CARD PLATFORM only; GIFT_CARD STORE_CREDIT DEPOSIT ROOM_CHARGE + memberId couponCode memberChoices staffToken managerPin managerUserId heldCartId → 422 · the P0.2 shape `{unitId, lines:[{name,qty,unitPriceSatang}], payMethods:[CASH]}` (no expected) must still pass the schema (p2.9 O2 / p2.9b P6 positive control) |
| POST /orders body | `{unitId}` + `ingestOrder` input minus `idempotencyKey` (op derives it) — `channelId`, `externalRef?`, `startStatus?`, `fulfilment`, `lines`, `customer` … |
| danger bodies | `{confirm:true, reason ≥ 5, …}` — void `{reason}` · refund `{reason, reasonCode, lines:[{lineId, qty}], payMethods}` · archive `{reason}` · cancel `{reason}` |
| other bodies | quote `{unitId, lines}` (no Idempotency-Key, no claim) · reject `{reasonCode, note?}` · pause `{until ISO}` / resume `{}` · availability `{available}` · setPrice `{priceSatang}` · tax-invoice `{buyer}` · pay `{payMethods, cashReceivedSatang?}` · reports query `from, to (YYYY-MM-DD), unitId?` + `Accept: text/csv` |

| # | op id | method path | scope | kind |
|---|---|---|---|---|
| 1 | units.list | GET /units | pos.sale.read | read |
| 2–9 | sales.list · sales.get · sales.receipt · sales.quote · sales.create · sales.void · sales.refundable · sales.refund | GET /sales · GET /sales/{id} · GET /sales/{id}/receipt · POST /sales/quote · POST /sales · POST /sales/{id}/void · GET /sales/{id}/refundable · POST /sales/{id}/refund | read ×3 + quote: pos.sale.read/create · create pos.sale.create · void pos.sale.void · refundable/refund pos.sale.refund | read read read read(rate read) write danger read danger |
| 10 | sales.taxInvoice | POST /sales/{id}/tax-invoice | pos.taxinvoice.issue | write |
| 11–14 | shifts.list · shifts.current · shifts.xReport · shifts.zReport | GET /shifts · /shifts/current · /shifts/{id}/x-report · /shifts/{id}/z-report | pos.shift.manage | read |
| 15 | devices.list | GET /devices | pos.device.manage | read |
| 16–23 | products.list · lookup · options · create · update · setPrice · archive · availability | GET /products · GET /products/lookup · GET /products/{id}/options · POST /products · PATCH /products/{id} · PUT /products/{id}/price · POST /products/{id}/archive · POST /products/{id}/availability | read · create · create · manage · manage · setPrice · manage · create | read read read write write write danger write |
| 24–26 | channels.list · pause · resume | GET /channels · POST /channels/{id}/pause · /resume | pos.sale.read · pos.order.accept ×2 | read write write |
| 27–36 | orders.list · get · create · accept · reject · preparing · ready · complete · cancel · pay | GET /orders · GET /orders/{id} · POST /orders · POST /orders/{id}/{accept,reject,preparing,ready,complete,cancel,pay} | read · read · sale.create · order.accept · order.reject · accept ×3 · order.reject · sale.create | read read write write write write write write danger write |
| 37–48 | sales.summary · sales.byDay · reports.{products,staff,payments,margin,shifts,tax,channels,branches,hourly,anomalies} | GET /reports/summary · /reports/daily · /reports/<kind> | pos.report.view (anomalies: pos.report.anomaly) | read (rate report) |

## Drift vs brief §0 / ⚠️ (verified at f37d605b)
1. `POS_OPS` is at `pos/api/registry.ts:20–24` (brief :58–62) — cosmetic.
2. Pause only refuses adapters WEB/CHAT/API (`order.ts:227–228` `pauseRefuses`); a MANUAL channel (LINEMAN preset) still ingests while paused ⇒ OR5 pauses a custom channel with `adapter:"API"` (saveChannel accepts `adapter`, `channel.ts:236, :272`).
3. MANUAL ingest defaults to `startStatus ACCEPTED` (`order-shared.ts:17–18`) ⇒ a PLATFORM sale is created at ingest; OR1/OR2 send `startStatus:"NEW"` so accept is tested on its own. `ingestOrder` requires `fulfilment` (`order-shared.ts` parse).
4. `billsPageData` answers an empty page (not NOT_FOUND) for an unreadable unit (`bills.ts:191`) ⇒ the op must gate the unit (`posUnitIsLinked` + filter) before the facade (AU7, RP4).
5. `listForUnit` and every catalog write resolve a Membership from `actorUserId` (`catalog.ts:257–268`) — confirms ⚠️3; PR1 PAR uses the owner's ctx, PR4 needs ruling 4's `actorMembership` path.
6. CASH refund refuses `SHIFT_REQUIRED` when shifts are required and there is no device shift (`refund.ts:585`) — ruling 6 covers sales only (CONTROLLER-DECISION CD5). Fixture shop does not require shifts.
7. `API_ERROR_CODES` has no `internal` code (`api/respond.ts:19–51`) ⇒ oracle pins INTERNAL → status 500 only.
8. Weighed EAN-13 needs `settings.pos.weighedBarcode {enabled, rules:[{prefix:"20", kind:"WEIGHT"}]}` (`scan-shared.ts:135–141`) — set by the fixture.
9. `pos.report.anomaly` does not exist at f37d605b (P2.12 S) — `pos-admin` can only be exact after P2.12 merges (builder is sequenced after it, ruling 10).
10. The "10 CALL_SITES maps" are 6 literal maps + 1 derived reader + 2 git-base comparisons = 9 places (list below) — CD8.

## Pre-approved ORACLE-EDIT batch (ruling 1 — builder, one `test(...)` commit per suite, marker `// ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.13)`)
`createSale(` caller pins — value of `src/lib/modules/pos/api/ops/sales.ts` 1 → 0 (remove the key):
- `scripts/qc-pos-p1.6.mts:404` (map `CALL_SITES` :395–412, check P1.6-U4 :469–478)
- `scripts/qc-hf-tx.mts:187–200` HT6.4 — reads the p1.6 map (no edit; green once :404 changes)
- `scripts/qc-hf-fu.mts:300` (map :297–303, used :587)
- `scripts/qc-pos-p2.4.mts:384` (map :381–387, used :658–659)
- `scripts/qc-pos-p2.5.mts:528` (map :525–531, used :809–810)
- `scripts/qc-pos-p2.6.mts:430` (map :427–433, used :782–783)
- `scripts/qc-pos-p2.8.mts:448` (map :445–451, used :752)
- `scripts/qc-pos-p2.9.mts:387–409` L2 — compares with git `BASE_REV 57dc226b` (:39): needs an explicit `pos/api/ops/sales.ts` 1→0 allowance
- `scripts/qc-pos-p2.9b.mts:423–446` L2 — git `BASE_REV e7b05787` (:45): same allowance
`qc-pos-p0.2.mts` skeleton pins: S2.3 `:156` (no POS bundle) · S3.5 `:174` (no op declares tool — stays green under ruling 7, edit only if needed) · S4.4 `:198` (allowedMethods(/sales)=[POST] → [GET,POST]) · S4.5 `:199` (GET /sales → null) · S4.6 `:201` (no route dir) · S7.2–S7.6 `:324–366` only if `/reports/summary|daily` are re-based to from/to.

## CONTROLLER-DECISION items
- **CD1 other p0.2 pins the re-point turns red** (not in the batch): S1.5 `:380` (declared test ids = 4, `:373`) · S1.6 `:147` (VALID payloads `:94–99` cover 4 ops) · S3.3 `:170` (every op needs a `POS_LEGACY_AI_TOOLS` row) · S6.0 `:271` / S6.4 `:278` (positive controls expect `QC-WRITE-BLOCKED` to bubble; `submitRegisterSale`'s `regGuard` returns INTERNAL) · S5.7 `:225` + S1.6 `days` payloads if summary/daily are re-based · S5.8 `:213` / S5.10 `:221` if the builder drops the custom-line superRefine · S5.11 `:233` stays green only if `posSaleServiceKey` is kept. Rec: extend the batch to S1.5 S1.6 S3.3 S6.0 S6.4 (+S5.7 if re-based); keep `posSaleServiceKey` + the custom-only superRefine.
- **CD2** `qc-pos-p2.1.mts:488` (ST3 `:489`) pins `EXTERNAL_PAY_TYPES = ["CASH","TRANSFER","PROMPTPAY"] as const` in `ops/sales.ts` ("คงเดิมถึง P2.13") — ruling 5 adds CARD/PLATFORM ⇒ red ⇒ add to batch.
- **CD3** `qc-pos-p1.9.mts:450–463` (S.R2.3 text of `voidErrorToApi` in `ops/sales.ts`) + `:1700–1721` (S.R2.8 imports it) — builder must keep `voidErrorToApi` there (or batch-edit).
- **CD4** `qc-pos-p2.9.mts:1841–1853` (O2) / `qc-pos-p2.9b.mts:1283–1295` (P6) safeParse `sales.create` with the P0.2 shape (no `expectedGrandTotalSatang`) as positive control — oracle ST1 requires it to keep parsing (`expectedGrandTotalSatang` optional; when absent the server uses Σ payMethods). Confirm, or batch-edit those two.
- **CD5** refund/void/order-pay shift rule for API callers without a device (`refund.ts:585`) — ruling 6 names sales only.
- **CD6** HTTP of PAYMENT_MISMATCH (oracle 422 validation, brief SA4) vs PRICE_CHANGED (409 state_conflict, §3 "total mismatch"); code for INTERNAL 500.
- **CD7** suites that pin `register*.ts` / `service.ts` / `catalog.ts` untouched vs merge-base (e.g. `qc-pos-p2.10` ST2, `qc-hf-fu` ST1) go red on the builder's wip branch because of the ruled hunks (catalog `actorOf` §2.4, register/shift Q5) — expected green on the merge tip (merge-base = HEAD); confirm or batch.
- **CD8** "10 maps" vs 9 places found (above).
- **CD9** response contract (data = facade result minus `ok`; paged lists `data[]` + `page`) and optional `unitId` on `{id}` ops are oracle choices — confirm.
- **CD10** `/sales/{id}/split`, `/devices/{id}/revoke`, `/shifts/open` etc. pinned 404 (SH3); `POST /devices` is P3 but would be 405 (GET /devices exists) — not pinned.

## `--list` — qc-pos-p2.13 (49)
```
qc-pos-p2.13 — 49 ข้อ (id · X · หัวข้อ)
P2.13-ST1	S	[§1 §2.1 มติ 3] ทะเบียน 48 op = OPS_SPEC (id·method·path·scope·kind ตรงตัว) · module pos · auditAction pos.api.<id> · summary ASCII · ป้ายไทย · test id ไม่ซ้ำ · ไม่มี tool (P0.2 S3.5) · POS_SCOPES ครบทุก scope ที่ใช้ · bundle pos-read/pos-operate/pos-admin = §2.1 ตรงตัว · scope เป็นคีย์สิทธิ์จริง · (DB) input strict + รูป P0.2 ของ sales.create ยังผ่าน schema
P2.13-ST2	S	[§6 มติ 8] ไฟล์ตามตารางชื่อ: route [...path] = 5 export บางส่งต่อ dispatch ของโมดูล (ไม่มี prisma/if/await อื่น) · openapi.json/route.ts · pos/api/{config,actor,dispatch,openapi,http-errors,keys}.ts · ops/{meta,sales,shifts,devices,products,channels,orders,reports}.ts · config rateNs pos/systemType POS/scopePrefix pos. · api-key-actions.ts "use server" create/list/revoke + api.key.create/api.key.revoke + pos.settings.manage + bundle pos-* + createApiKey
P2.13-ST3	S	[§5 มติ 1] ops/*.ts เรียก facade เท่านั้น: ไม่มี createSale( (sales.ts 1 → 0) · ไม่มี $transaction / .create( .update( .upsert( .delete( *Many( / $executeRaw · ไม่ import @prisma/client ค่า · keys.ts posApiServiceKey = api_ + sha256(keyId\n+key)[0..63] (DB: ค่าจริง)
P2.13-ST4	S	[§4 มติ 8] gen-pos-api-docs --check exit 0 · docs/api/POS-API.md + skill endpoints.md มีทุก `METHOD path` · /developers/pos (buildOpenApi/POS_OPS) + /developers/pos.md route + ลิงก์จาก /developers · fitness.mts F13 เรียก gen-pos-api-docs · (DB) openapi.json = 48 operation · pos.md = ไฟล์คู่มือเป๊ะ
P2.13-ST5	S	[⚠️4 มติ 1 7 10] หมุด (เทียบ merge-base): pos-sale-contract.json sha คงเดิม · ไม่มี diff ใต้ prisma/ · outbox-consumers.ts ai/tools.ts package.json ไม่แตะ · createSale( ต่อไฟล์ = ฐาน ยกเว้น pos/api/ops/sales.ts → 0 · skills.ts มี hunk `POS P2.13 ▸` ใน toolAllowedForApiKey · (DB) ด่าน AI: sales_summary/by_day ⇐ pos.sale.read · pos_create_sale ⇐ create · void_sale ⇐ void (คีย์อื่น false)
P2.13-ST6	S	[§3 มติ 5] http-errors.ts: POS_REFUSAL_HTTP เป็น Record<PosRefusalCode,…> ครอบทุกรหัสของ facade ที่ op เรียก (register bills receipt refund shift device catalog channel order reports tax-invoice + PosSaleErrorCode) · message_en ASCII ทุกแถว · สถานะตาม §3 (NOT_FOUND 404 · PERMISSION_DENIED 403 · VALIDATION/PAYMENT_MISMATCH 422 · state 409 · *_TAKEN 409 duplicate · BUSY 503 · INTERNAL 500)
P2.13-AU1	A	[§0 gate] ไม่มี Bearer → 401 unauthorized (GET /units · POST /sales) · ไม่มีบิลเกิด
P2.13-AU2	A	[§0 gate] คีย์หมดอายุ (expiresAt ผ่านไปแล้ว) → 401 key_expired
P2.13-AU3	A	[§0 gate · issuer rule] คีย์ที่ผูกระบบ KANBAN (scope pos-read) → 403 system_mismatch
P2.13-AU4	A	[§0 gate] คีย์ผูก POS S1 + หัว X-Shark-System = S2 → 403 system_mismatch · ไม่ส่งหัว → 200 (ตัวควบคุมบวก)
P2.13-AU5	A	[§0 gate] คีย์ไม่ผูกระบบ ไม่ส่งหัว → 400 system_required · ส่งหัว S1 → 200 · ส่งหัวระบบ KANBAN → 403 system_mismatch
P2.13-AU6	A	[§2.1 มติ 3] คีย์ pos-read: POST /sales → 403 scope_missing + hint มี pos.sale.create · GET /sales → 200 · ไม่มีบิลเกิด
P2.13-AU7	A	[§2.2 มติ 2] unitId ของระบบ POS อื่นในร้าน (S2) / ร้านอื่น (-t2) / มั่ว → 404 not_found บน GET /sales · GET /products · POST /sales · GET /orders (ไม่บอกว่ามีอยู่) · ตัวควบคุมบวก: สาขา A → 200
P2.13-AU8	A	[HF-APIV1 PAR] คีย์รุ่นเดิม scope [] (+หัว S1) → 403 scope_missing ทุก op ที่ลอง (GET /units /sales /reports/daily · POST /sales) · /api/v1/sales เดิมด้วยคีย์นั้น → 200 มีบิล API ของรอบนี้ (ไม่เปลี่ยน)
P2.13-RL1	A	[§0 rate] ถัง pos:api:write:<keyId> ครบ 60 ในนาทีนี้ → คำขอเขียนถัดไป 429 rate_limited + Retry-After · ไม่มีบิลเกิด · คำตอบสำเร็จมี X-RateLimit-Limit 60/300/30 ตามชนิด
P2.13-RL2	A	[§0 rate] ถังแยก: ระหว่างที่ write ของคีย์นั้น 429 → GET /units ของคีย์เดียวกัน 200 · ไม่มีแถว kb:api:% / acct:api:% ของคีย์นั้น
P2.13-ID1	I	[§3] POST /sales ไม่มี Idempotency-Key → 400 idempotency_required · 0 บิล
P2.13-ID2	I	[§3 มติ 5] คีย์+body เดิม → saleId เดิม + Idempotent-Replayed: true · 1 PosSale (idempotencyKey ลงท้าย api_<sha>[0..63] · sourceModule API · sourceId = soldByUserId = keyId) · ลบแถว ApiIdempotency (จำลองหมดอายุ) แล้วยิงซ้ำ → saleId เดิม ยังคง 1 บิล
P2.13-ID3	I	[§3] Idempotency-Key เดิม body ต่าง → 409 idempotency_conflict · ยังคง 1 บิล
P2.13-ID4	I	[§3 ⚠️6] คีย์ API สองใบ Idempotency-Key เดียวกัน → 2 บิล (service key ต่อคีย์ · คีย์กันซ้ำของบิลต่างกัน)
P2.13-ID5	I	[§3] ยิงพร้อมกัน 2 คำขอเหมือนกัน → บิลเดียว · ไม่มี 5xx · ผลเป็น 200 (+replay) หรือ 409 idempotency_in_progress
P2.13-SA1	M	[มติ 1 PAR] บิล API vs บิลหน้าขาย (submitRegisterSale ด้วยเจ้าของ) ตะกร้าเดียวกัน (สินค้าคลัง ×2 · เมนู+ตัวเลือก · สินค้าชั่ง) → grandTotal/VAT/subtotal · บรรทัด (productId qty unitPrice lineTotal) · วิธีจ่าย · รูป JV ต่อบัญชี · การตัดสต็อกต่อสินค้า เท่ากันทุกตัว
P2.13-SA2	M	[§1 #5] POST /sales/quote (ไม่มี Idempotency-Key) → 200 ยอด = quoteRegisterCart ตรง · บิลที่ขายด้วยยอดนั้น = ยอด quote · quote ไม่สร้างบิล/แถวกันซ้ำ
P2.13-SA3	M	[มติ 1] บรรทัดกำหนดเองด้วยคีย์ที่ไม่มี pos.sale.priceOverride (pos-operate) → 403 forbidden · 0 บิล · คีย์ pos-admin → 200
P2.13-SA4	M	[§3] Σ วิธีจ่าย ≠ ยอด → 422 validation · expectedGrandTotalSatang ผิด → 409 state_conflict (PRICE_CHANGED) · 0 บิล
P2.13-SA5	M	[มติ 5] วิธีจ่าย GIFT_CARD / STORE_CREDIT / DEPOSIT / ROOM_CHARGE และ memberId / couponCode / staffToken / managerPin → 422 validation · 0 บิล · ตัวควบคุมบวก: CARD → 200
P2.13-SA6	M	[§1 #7] void (danger): ไม่มี confirm → 409 confirm_required · confirm+reason → 200 VOIDED · JV สุทธิต่อบัญชี = 0 · สต็อกคืนครบ · บิลจากระบบอื่น (HOTEL) → 409 state_conflict ไม่ถูกยกเลิก
P2.13-SA7	M	[§1 #8–9] GET /sales/{id}/refundable = saleForRefund (PAR) · คืน 1 หน่วย (danger) → 200 ใบ REFUND · คืนสต็อก +1 · pos.sale.refunded 1 ครั้ง · ยิงซ้ำคีย์เดิม → replay ใบเดิม · ระบายคิว 2 รอบ ไม่ซ้ำผล
P2.13-SA8	M	[§1 #9 IN-B] คีย์ไม่มี pos.sale.refund → 403 scope_missing (refundable + refund) · tax-invoice: คีย์ไม่มี pos.taxinvoice.issue → 403 · pos-admin = ผลเดียวกับ issueFullTaxInvoice ตรงบนบิลคู่ (PAR)
P2.13-OR1	O	[§1 #25–27] POST /orders เข้าช่องทาง MANUAL (LINEMAN) เลขออเดอร์เดิมสองครั้ง (คนละ Idempotency-Key) → ออเดอร์เดียว ครั้งที่สอง duplicated:true · GET /orders + /orders/{id} = listOrders/getOrder (PAR)
P2.13-OR2	O	[§1 #28] accept ออเดอร์ PLATFORM (NEW) → 200 · บิลเดียว · JV COMMISSION ของบิล ≥ 1
P2.13-OR3	O	[§1 #29] reject reasonCode TOO_BUSY → 200 REJECTED · reasonCode มั่ว → 422 validation
P2.13-OR4	O	[§1 #30–32 #34] ออเดอร์ DIRECT: accept → preparing → ready → complete → pay CASH → 200 บิล + ออเดอร์ PAID · ขั้นผิด (preparing บนออเดอร์ที่ส่งมอบแล้ว) → 409 state_conflict
P2.13-OR5	O	[§1 #23–24] pause ช่องทาง adapter API → POST /orders → 409 state_conflict (CHANNEL_PAUSED) · resume → POST /orders → 200
P2.13-OR6	O	[§1 #33] cancel ออเดอร์ที่มีบิล: คีย์มี pos.order.reject แต่ไม่มี pos.sale.void → 403 forbidden · บิลไม่ถูกยกเลิก · pos-admin → 200 · บิล VOIDED
P2.13-PR1	R	[§1 #14 #16] GET /products?unitId=A → รายการ id+ราคา = listForUnit (PAR) + page · GET /products/{id}/options = registerProductOptions (PAR)
P2.13-PR2	R	[§1 #15] GET /products/lookup บาร์โค้ดปกติ → สินค้านั้น · ป้ายชั่ง EAN-13 (20…) → สินค้าชั่ง + กรัม/ราคาของป้าย = registerScan (PAR) · บาร์โค้ดไม่มี → 200 ไม่พบ
P2.13-PR3	M	[§1 #21 86] availability false → 200 · outbox pos.product.availability 1 · quote สินค้านั้น → ปฏิเสธ (4xx) · registerScan เห็นหมด · availability true → ขายได้อีก
P2.13-PR4	M	[มติ 4] create/update/archive ผ่านคีย์ pos-admin ที่ผู้สร้างคีย์เป็น STAFF ไม่มี pos.product.manage → 200 ทั้งสาม (สิทธิ์ = scope ของคีย์) · AuditLog API_KEY action pos.api.products.* · แถว PosProduct ตรง (ผ่าน catalog.ts)
P2.13-PR5	M	[§1 #19] PUT /products/{id}/price ด้วยคีย์มีแค่ pos.product.manage → 403 scope_missing · pos-admin → 200 ราคาเปลี่ยนจริง
P2.13-RP1	R	[§1 #35–43] /reports/{daily products staff payments margin shifts tax channels} = reader ตรงด้วย actor สังเคราะห์ของคีย์ (PAR) · /reports/summary 200 ยอดตรงผลรวม daily
P2.13-RP2	R	[§1 #44–45 IN-B · มติ 10] /reports/{branches hourly anomalies} = reader ตรง (PAR) — SKIP-with-reason เมื่อ REPORT_KINDS ยังไม่มี (ก่อน P2.12 S merge)
P2.13-RP3	R	[§1 มติ 8] Accept: text/csv บน /reports/daily = reportCsv ตรง (ไบต์เดียวกัน · BOM) · ช่วง 93 วัน → 422 validation
P2.13-RP4	A	[มติ 2] คีย์ตัวกรอง pos.filter.unit:A: GET /reports/daily?unitId=B → 404 · ไม่ระบุสาขา = ยอดของ A เท่านั้น (PAR reader unitAccess [A]) · GET /sales?unitId=B → 404
P2.13-SH1	R	[§1 #10–12 IN-B] /shifts · /shifts/{id}/x-report · /z-report · /shifts/current = listShifts/xReport/zReport/currentShift ตรง (PAR) · คีย์ pos-read → 403 scope_missing
P2.13-SH2	R	[§1 #1–4 #13 #22] GET /units = สาขาที่ผูก S1 (A,B ไม่มีสาขาของ S2/-t2) · GET /sales = billsPageData (id ชุดเดียวกัน + page) · /sales/{id} = billDetail · /sales/{id}/receipt = receiptPayload ต้นฉบับ (PAR) · GET /devices = listDevices · GET /channels = listChannels (PAR) · pos-read บน /devices → 403
P2.13-SH3	A	[§1 NEVER/P3] /staff/verify-pin · /staff/pins · /display/pair · /sales/{id}/split · /approvals · /deposits · /held-carts · /shifts/open · /webhooks/{code} · /devices/{id}/revoke → 404 not_found
P2.13-Z1	-	QC4 คืนสภาพ: ร้านชั่วคราว (+ -t2) 0 แถวทุกตารางที่มี tenantId (ApiKey · ApiIdempotency · บิล · ออเดอร์) + Tenant ถูกลบ · ถังเพดานของคีย์รอบนี้ 0
P2.13-Z2	-	ลายนิ้วมือนอกร้านชั่วคราว (PosSale · PosOrder · PosProduct · SalesChannel · ApiKey ของร้าน seed) เท่าเดิม
X-coverage: S=6 A=12 I=5 M=11 O=6 R=7 -=2
```
## `--list` — qc-pos-api-skill (10)
```
qc-pos-api-skill — 10 ข้อ (id · X · หัวข้อ)
P2.13S-K1	S	[§4 มติ 8] .claude/skills/shark-pos-api/SKILL.md มี front-matter name: shark-pos-api + description (ASCII) · หัวข้อ When to use / Setup / Conventions / Safety
P2.13S-K2	S	[§4] Setup: https://shark.in.th/api/v1/pos · Authorization: Bearer · X-Shark-System · ชี้ไป references/endpoints.md + recipes.md
P2.13S-K3	S	[§3 §4] Conventions: satang (จำนวนเต็ม) · unitId · Idempotency-Key · แยกทางด้วย error.code · page/pageSize · Accept: text/csv
P2.13S-K4	S	[§4 safety] never void/refund/cancel โดยผู้ใช้ไม่ได้สั่ง · confirm: true + reason · quote ก่อนขาย · never ask for PINs (ไม่มีทาง PIN ใน API)
P2.13S-K5	S	[มติ 8] references/endpoints.md (สร้างจาก gen-pos-api-docs) มีทุก `METHOD path` ของ 48 op
P2.13S-K6	S	[§4] สำเนา /root/.claude/skills/shark-pos-api/{SKILL.md, references/recipes.md, references/endpoints.md} ตรงไบต์กับของ repo
P2.13S-K7	S	[§4] recipes.md ≥ 8 ก้อน curl แกะได้ (method · URL ใต้ /api/v1/pos · ตัวแปรที่รู้จักเท่านั้น · JSON body ถูก) · ครอบ 8 งาน · write มี Idempotency-Key · danger มี confirm:true+reason · ทุกก้อนมี Error branch ที่เล่นซ้ำได้
P2.13S-K8	M	[§4 ชั้น a] เล่นซ้ำทุกสูตรผ่าน route ในโปรเซส (แทนค่าฟิกซ์เจอร์) → 200 ทุกก้อน · สูตร CSV ได้ text/csv
P2.13S-K9	M	[§4 ชั้น a] ทุกสูตร: กลายรูปตาม Error branch ที่เขียนไว้ → ได้สถานะ + error.code ตรงตามที่เขียน
P2.13S-K10	-	QC4 คืนสภาพ: ร้านชั่วคราว 0 แถว (คีย์ · แถวกันซ้ำ · บิล · ออเดอร์) + Tenant ถูกลบ · ถังเพดานของคีย์รอบนี้ 0
```

## Fail-before summary
See `ledger/wo-notes/P2.13-red.txt` (filled after the forced QC4 runs).
