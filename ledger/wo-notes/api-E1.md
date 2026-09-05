# WO E1 — สกิล AI `account` (tools จากทะเบียน op · proposal kinds · dispatch)

สถานะ: **ทำเสร็จ · รอ Fable ตรวจรับ** · ห้าม commit (ต้นไม้ dirty ตามกติกา)
ข้อสอบ: `scripts/qc-account-api-ai-skill.mts` → **30/32 (CRITICAL 1 · MAJOR 1)** — ที่ไม่ผ่าน 2 ข้อคือ
**ข้อสอบขัดกับกติกาบัญชีของระบบ ไม่ใช่โค้ดพลาด** (หลักฐานวัดจริงอยู่ท้ายไฟล์ §7) — ไม่แตะ oracle ตามกติกา

---

## 1. ไฟล์ที่แตะ

| ไฟล์ | ทำอะไร |
|---|---|
| `src/lib/modules/account/api/run.ts` | **ใหม่** — ประตูร่วม "รัน op 1 ตัวในนามของ actor": `validateOpInput` / `validateWith` / `detailsMessageTh` / `runOpAsActor` (ตรวจสิทธิ์ `actorCan` → `op.handler` → `unwrapEnvelope` → `writeAudit` เฉพาะ write/danger) |
| `src/lib/modules/account/api/dispatch.ts` | REST เลิกเรียก `op.handler`/`writeAudit` เอง → ใช้ `validateOpInput` + `runOpAsActor` (พฤติกรรม HTTP เดิมทุกอย่าง: confirm/reason · idempotency · ซอง · CSV) |
| `src/lib/modules/account/api/actor.ts` | `ApiActor.kind: "apikey" \| "user" \| "assistant"` · `keyId?` (ไม่บังคับแล้ว) · `userId?` · helper `actorAuditId` / `actorRefId` / `actorAuditType` / `actorDocSource` |
| `src/lib/modules/account/api/op.ts` | `ApiOpTool` เพิ่ม `hint?` (ประโยคอังกฤษบอกผู้ช่วยว่าเมื่อไรควรเรียก) |
| `src/lib/modules/account/api/idempotency.ts` | ใช้ `actor.keyId` แบบตรวจก่อน (กันซ้ำผูกกับคีย์ API เท่านั้น — AI ไม่ผ่านทางนี้) |
| `ops/documents-write.ts` | `source: actorDocSource(actor)` (คีย์=API · AI=AI) 2 จุด · `approvePurchaseOrder(..., actorRefId(actor))` |
| `ops/payments-write.ts`, `ops/finance-write.ts` | คีย์กันซ้ำชั้นบริการใช้ `actorRefId(actor)` แทน `actor.keyId` ตรง ๆ |
| `ops/*.ts` (12 ไฟล์) | ใส่ `tool: { name, hint }` ให้ op 36 ตัว (ดู §3) |
| `src/lib/ai/account-ops.ts` | **ใหม่** — สะพาน AI↔ทะเบียน: สร้าง tool def จาก `ACCOUNT_OPS.filter(o => o.tool)` · actor `assistant`/`user` · แปลงผลเป็น JSON คีย์ไทย · สรุปข้อเสนอภาษาไทย · `dispatchAccountKind` |
| `src/lib/ai/tools-account.ts` | **ใหม่** — `accountTools(): AiTool[]` (บาง ๆ: read→ทำทันที · write→`createProposal`) |
| `src/lib/ai/tools.ts` | `toolRegistry()` += `...accountTools()` (63 → 99 tool · ของเดิมไม่ถูกแตะ) |
| `src/lib/ai/skills.ts` | สกิล `account` (label ไทย · summary อังกฤษ · systems `["ACCOUNT"]` · 36 tool) + ด่านใน `assertSkillRegistryComplete()` ที่เทียบรายชื่อกับทะเบียน "ไม่ขาดไม่เกิน" |
| `src/lib/ai/proposals.ts` | `ProposalKind` = union เดิม \| `` `account.${string}` `` · `KIND_ACCESS` = ของเดิม + `accountKindAccess()` (derive จาก `op.action`) · `DESTRUCTIVE_KINDS` += `accountDestructiveKinds()` · `dispatch()` แตกสาขาเดียวสำหรับ `account.*` → `dispatchAccountKind` |
| `scripts/gen-account-api-docs.mts` | ต่อท้ายบรรทัด op ว่า `AI tool: \`account_x\`` + section ใหม่ **## AI tools** (ตาราง tool ↔ op ↔ class ↔ scope) |
| `docs/api/ACCOUNT-API.md` | regenerate (199 op · มี section AI tools) — `--check` เขียว |

> `scripts/acc-v2-expected.json` + `scripts/fixtures/acc-v2/*.json` ที่ dirty อยู่ **ไม่ใช่ของ WO นี้** — qc:all ปิดเฟส D re-seed ทับ (generatedAt 15:32Z)

---

## 2. ทำไมต้องมี `run.ts` (การใช้ pipeline เดิมซ้ำ)

ก่อน E1 มีผู้เรียก op ทางเดียว (REST) — ตรรกะ "ตรวจ input → ตรวจสิทธิ์ → handler → audit" อยู่ใน `dispatch.ts`
E1 เพิ่มผู้เรียกอีก 2 ทาง (ผู้ช่วยอ่านเอง · คนกดยืนยันข้อเสนอ) ⇒ ถ้าปล่อยให้ฝั่ง AI เรียก `op.handler` ตรง ๆ
วันหนึ่งจะมีทางที่ลืม `actorCan` หรือลืม `writeAudit` เงียบ ๆ
⇒ ยก 4 ขั้นนั้นออกมาเป็น `runOpAsActor()` **ทุกทางเดินใช้ตัวเดียวกัน**:

| ขั้น | REST | AI อ่าน | AI เขียน (หลังยืนยัน) |
|---|---|---|---|
| ตรวจ input (zod ของ op) | `validateOpInput` | `validateOpInput` (หลังแปลง args) | `validateOpInput` **ซ้ำอีกครั้งจาก payload ใน DB** |
| ตรวจสิทธิ์ | `require.ts` (scope) + `actorCan` ใน run | `actorCan` (scope อ่านของผู้ช่วย) | `assertCan` ของ `KIND_ACCESS` (คนกด) + `actorCan` |
| handler | เดียวกัน | เดียวกัน | เดียวกัน |
| audit | `actorType API_KEY` · `after {keyName, opId, requestId, reason?}` | ไม่เขียน (read) | `actorType USER` · `after {proposalId, actor, opId, requestId, reason?}` |
| กันซ้ำ | `Idempotency-Key` (ผูก keyId) | — | สถานะข้อเสนอ PENDING→EXECUTED (atomic) + `idempotencyKey = ai-<proposalId>` ส่งต่อชั้นบริการ |

สิ่งที่ **ไม่** ถูกยกมา (เป็นเรื่อง HTTP ล้วน): rate limit · `Idempotency-Key` header · `confirm:true`/reason ของ danger (ฝั่ง AI ใช้การยืนยัน 2 ชั้นแทน) · การแปลงเป็น `Response`

---

## 3. tool ↔ op ↔ kind (36 ตัว · ชื่อคงที่ตลอดไป)

**อ่าน (14) — ทำทันที ไม่ต้องยืนยัน**

| tool | op | scope |
|---|---|---|
| `account_dashboard` | `dashboard.get` | account.doc.view |
| `account_list_documents` | `documents.list` | account.doc.view |
| `account_get_document` | `documents.get` | account.doc.view |
| `account_report` | `reports.profit-loss` (+ อีก 6 op ผ่าน `kind`) | account.report.view / tax.view / journal.view |
| `account_search_contacts` | `contacts.list` | account.doc.view |
| `account_get_contact` | `contacts.get` | account.doc.view |
| `account_search_products` | `products.list` | account.doc.view |
| `account_finance_balances` | `finance-accounts.list` | account.finance.manage |
| `account_wht_summary` | `wht.list` | account.tax.view |
| `account_list_journal` | `journal.list` | account.journal.view |
| `account_assets` | `assets.list` | account.asset.manage |
| `account_chart_of_accounts` | `chart.list` | account.journal.view |
| `account_settings` | `settings.get` | account.doc.view |
| `account_parse_quick_create` | `documents.parse` | account.doc.view |

`account_report` เป็น tool เดียวครอบรายงาน 7 ตัว (`kind` = trial-balance / profit-loss / balance-sheet / cash-flow / vat-pp30 / aging / general-ledger)
เหตุผล: ทะเบียนต้อง map **1 tool = 1 op** (ข้อสอบ E1-K1.4 นับ "ไม่ขาดไม่เกิน") จึงประกาศ `tool` ที่ op เดียว
แล้วตาราง `REPORT_OP_OF` ใน `account-ops.ts` ส่ง `kind` ไปยัง op พี่น้องในทะเบียนเดียวกัน (ไม่ได้เขียนตรรกะรายงานใหม่)
ช่วงวันที่ไม่ส่ง = เดือนไทยปัจจุบัน · คู่มือบอกเรื่องนี้ไว้ใน section **AI tools**

**เขียน (18) — เสนอ → เจ้าของยืนยัน 1 ชั้น**

| tool | op | scope |
|---|---|---|
| `account_create_document` | `documents.create` | account.doc.create |
| `account_issue_document` | `documents.issue` | account.doc.issue |
| `account_convert_document` | `documents.convert` | account.doc.create |
| `account_approve_document` | `documents.approve` | account.doc.approve |
| `account_record_payment` | `payments.record` | account.payment.record |
| `account_create_payment_link` | `documents.public-link` | account.doc.public_link |
| `account_create_contact` | `contacts.create` | account.contact.manage |
| `account_update_contact` | `contacts.update` | account.contact.manage |
| `account_create_product` | `products.create` | account.product.manage |
| `account_issue_goods` | `stock-documents.create` | account.product.manage |
| `account_post_journal` | `journal.create` | account.journal.adjust |
| `account_close_period` | `periods.close` | account.period.close |
| `account_run_depreciation` | `assets.depreciation-run` | account.asset.manage |
| `account_transfer_funds` | `finance.transfer` | account.finance.manage |
| `account_email_document` | `documents.remind` | account.doc.view |
| `account_create_recurring` | `recurring.create` | account.doc.create |
| `account_upload_file` | `documents.add-attachment` | account.doc.create |
| `account_read_bill_image` | `inbox.read` | account.document.manage |

**อันตราย (4) — เสนอ → ยืนยัน 2 ชั้น (`confirm2x`)**

| tool | op | kind ของข้อเสนอ |
|---|---|---|
| `account_void_document` | `documents.void` | `account.documents.void` |
| `account_void_payment` | `payments.void` | `account.payments.void` |
| `account_merge_contacts` | `contacts.merge` | `account.contacts.merge` |
| `account_reopen_period` | `periods.reopen` | `account.periods.reopen` |

op ตั้งค่า/นำเข้า/สิทธิ์/webhook **ไม่มี tool** ตามสเปค (199 op → เปิดให้ AI 36)

### สคีมาที่ผู้ช่วยเห็น
ปกติ = `jsonSchemaOf(op.input)` + path param (ตั้งชื่อให้อ่านออก: `{id}` ของ `/documents/{id}/issue` → `documentId`,
`{key}` ของ `/periods/{key}/close` → `periodKey`) + `systemName` (ตัวเลือก · ร้านที่มีสมุดหลายเล่ม) · `additionalProperties:false` เสมอ
มี 3 ตัวที่สคีมา REST ไม่เหมาะให้ LLM กรอกตรง ๆ จึงมี adapter ใน `account-ops.ts` (แปลงกลับเป็น input ของ op เดิมก่อนตรวจ zod เสมอ):
- `account_report` — args รวม 7 รายงาน
- `account_list_documents` — `type` เป็น **enum จริง** (ของ REST เป็นสตริงอิสระเพราะรับหลายชนิดคั่นจุลภาค) ⇒ ผู้ช่วยพิมพ์ชนิดมั่วได้ error ไทย ไม่ใช่รายการว่างที่เข้าใจผิด · บังคับ `pageSize: 20`
- `account_record_payment` — REST รับ `rows[]` (หลายงวดในคำสั่งเดียว) · ผู้ช่วยทำทีละครั้ง จึงกรอกแบน ๆ แล้วห่อเป็น 1 row
- `account_create_document` — สคีมาเหมือน REST แต่เพิ่ม `lines` เข้า `required` (REST ปล่อยว่างได้เพราะใบรวมใช้ `childIds`)

---

## 4. ทางเดินของข้อเสนอ (write/danger)

```
LLM เรียก account_create_document {type, contactId, lines[…]}
  └ account-ops: หาสมุดบัญชี → zod ของ op (ผิด = {error: ไทย} ไม่มี proposal)
      └ สรุปไทย: "สร้างเอกสาร · ใบแจ้งหนี้ · ผู้ติดต่อ ณัฐพล ทดสอบ · ยอด 10,700.00 บาท"
      └ createProposal(kind "account.documents.create", payload {opId, input, params})
      └ tool คืน {proposalId, summary, waiting:"user_confirm"}   ← ยังไม่มีเอกสารเกิด
เจ้าของกดยืนยันในการ์ด → executeProposal(m, ctx, id)
  ├ assertCan(m, KIND_ACCESS["account.documents.create"] = {account, account.doc.create})   ← ไม่ผ่าน = คง PENDING
  ├ risk DESTRUCTIVE + ไม่มี confirm2x → needsSecondConfirm (ยังไม่ทำ)
  ├ claim PENDING→EXECUTED แบบ atomic (กดซ้ำ/กดพร้อมกัน = ทำครั้งเดียว)
  └ dispatch → isAccountKind → dispatchAccountKind
       ├ zod ของ op อีกรอบ (payload ใน DB อาจมาจากสัญญาคนละรุ่น)
       ├ runOpAsActor(op, actor kind "user" = membership คนกด) → handler เดียวกับ REST
       └ note ไทย: "สร้างเอกสารเรียบร้อยแล้ว — IV-2026-09-0001 · สถานะ AWAITING_PAYMENT · ยอด 10,700.00 บาท"
```

- payload เก็บ `{opId, input, params}` (input ที่ผ่าน zod แล้ว) — execute อ่านจากแถว DB อย่างเดียว ไม่เชื่อ client (กติกาเดิมของ proposals)
- `reason` ของคำสั่งอันตรายอยู่ใน input ของ op อยู่แล้ว ⇒ ไหลเข้า handler **และ** ลง `AuditLog.after.reason` เหมือน REST
- เอกสารที่เกิดจากทางนี้ `source = "AI"` (คีย์ภายนอกยังเป็น `"API"`) — `actorDocSource(actor)` ตัดสินที่เดียว

## 5. การแมป actor

| ใคร | `kind` | สิทธิ์ (`membership`) | audit |
|---|---|---|---|
| แอปภายนอกถือคีย์ (REST) | `apikey` | `membershipFromScopes(key.scopes)` (STAFF + scope ตรงตัว) | `API_KEY` / `actorId = keyId` / `after.keyName` |
| ผู้ช่วยอ่านข้อมูลเอง | `assistant` | `membershipFromScopes([doc.view, report.view, journal.view, tax.view, finance.manage, asset.manage])` — **อ่านอย่างเดียว** | ไม่เขียน (op read ไม่เขียน audit) |
| คนกดยืนยันข้อเสนอ | `user` | Membership จริงของคนกด (OWNER/MANAGER ผ่านหมดตาม `evaluate`) | `USER` / `actorId = userId ?? null` / `after.proposalId` |

ด่านกันผู้ช่วยเขียนเอง 2 ชั้น: (1) `runAccountTool` รันทันทีเฉพาะ `op.kind === "read"` (2) actor `assistant` ไม่มี scope เขียนเลย
`ApiActor.keyId` กลายเป็น optional ⇒ โค้ดที่เคยสมมติว่ามีเสมอถูกเปลี่ยนเป็น `actorRefId()` (approvedById · คีย์กันซ้ำ transfer/payment) และ `withIdempotency` ประกาศชัดว่าใช้ได้เฉพาะคำขอที่มาจากคีย์

## 6. ผลลัพธ์ที่ผู้ช่วยได้ (read)

คีย์ไทย · เงินเป็น "บาท" (satang/100) · แถวยาวตัดที่ 20 พร้อมบรรทัดบอกว่าตัด · ตัด `tenantId`/`systemId`/`createdById` ทิ้งเสมอ
`account_dashboard` มี renderer เฉพาะ (ผลดิบ ≈7.7 KB → เหลือสรุปที่ตอบคำถามเจ้าของร้านได้จริง) และ
`account_report {kind:"aging"}` เติม "ยอดรวมบาท/เกินกำหนดรวมบาท" ที่ REST ไม่ได้คืน (ผู้ช่วยไม่ต้องบวกเอง = ไม่มีเลขมั่ว)
ตัวเลขตรงเฉลย seed: ค้างรับ 494,300.00 บาท · INVOICE tab overdue = 4 ใบ · aging AR รวม = 494,300.00 บาท

---

## 7. 🔴 ข้อสอบ 2 ข้อที่ขัดกับกติกาบัญชีของระบบ (ไม่ได้แก้ oracle · ส่งให้ Fable ตัดสิน)

### E1-K3.11 (CRITICAL) — "ยืนยันชั้นสอง → VOIDED + reversal JV"
ลำดับในข้อสอบ: สร้าง → ออกเอกสาร → **รับชำระเต็มจำนวน (K3.7 = PAID)** → `account_void_document`
กติกาของระบบ (มีมาตั้งแต่ก่อน E1): **เอกสารที่ยังมีการรับชำระค้างอยู่ ยกเลิกไม่ได้ ต้องยกเลิกการชำระก่อน**
- `src/lib/modules/account/service.ts:3096` — `voidDocument` โยน `"มีการรับชำระค้างอยู่ — ยกเลิกการชำระก่อน"` เมื่อมี payment ที่ยังไม่ void
- ทางเดินอื่นก็เจอเหมือนกัน ไม่ใช่เรื่องของ AI: UI `actions.ts:276 voidDocumentAction` เรียก `voidDocument` ตัวเดียวกัน ไม่มี cascade
- ข้อสอบ C1 (REST) ที่เขียวอยู่ ยกเลิก **ใบที่ยังไม่ชำระ** (`qc-account-api-write-docs.mts` C1-W3.3)

**หลักฐานวัดจริง** (probe: tenant ใหม่บน QC · เรียกผ่าน `runOpAsActor` ด้วย actor `apikey` = ทางเดิน REST เป๊ะ):
```
pay   : {"data":{"status":"PAID","paidSatang":1070000,...}}
status after pay: PAID
REST void on PAID doc      => {"err":"มีการรับชำระค้างอยู่ — ยกเลิกการชำระก่อน","status":422}
status after void attempt  : PAID
REST void payment          => {"data":{"status":"AWAITING_PAYMENT"}}
REST void after pay voided => {"data":{"docNo":"IV-2026-09-0001","status":"VOIDED"}}
final status: VOIDED · journal entries for doc: 2   ← ต้นฉบับ + reversal
```
⇒ ฝั่ง AI ทำถูกแล้ว (คืน `{ok:false, note:"มีการรับชำระค้างอยู่ — ยกเลิกการชำระก่อน"}` = ข้อความไทยของ service เอง)
**ทางแก้ที่เสนอ (Fable ตัดสิน)**: ข้อสอบควรแทรก `account_void_payment` + ยืนยัน ก่อน K3.11 (ซึ่งจะได้ทดสอบ tool อันตรายตัวที่ 2 ไปด้วย)
หรือย้าย K3.9–K3.11 ไปใช้เอกสารอีกใบที่ยังไม่ได้ชำระ

### E1-K3.14 (MAJOR) — เป็นผลพวงของ K3.11
ข้อสอบคาดว่า `account_create_payment_link` บนเอกสาร **VOIDED** ต้องยืนยันแล้ว `ok:false`
แต่เอกสารยัง PAID (เพราะ K3.11 ยกเลิกไม่สำเร็จ) ⇒ ลิงก์สร้างได้จริง `ok:true`
เงื่อนไขที่ข้อสอบอ้างมีอยู่จริงในโค้ด: `service.ts:3288` `ensurePublicTaxInvoiceLink` ปฏิเสธ DRAFT/CANCELLED/VOIDED
("ต้องออกเอกสารก่อนจึงสร้างลิงก์ได้") ⇒ ข้อนี้จะเขียวเองทันทีที่ K3.11 ทำให้เอกสารเป็น VOIDED ได้

---

## 8. คำสั่งที่รัน + บรรทัดสุดท้าย

```
pnpm exec tsx scripts/qc-account-api-ai-skill.mts
  ผ่าน 30/32 · FINDINGS: CRITICAL 1 · MAJOR 1 · MINOR 0 (ทั้งสองข้อ = ข้อสอบขัดกติกาบัญชี ดู §7)
  JSON_SUMMARY {"total":32,"passed":30,"findings":["E1-K3.11","E1-K3.14"]}

pnpm exec tsx scripts/qc-ai-skills.mts            JSON_SUMMARY {"total":23,"passed":23,"findings":[]}
pnpm exec tsx scripts/qc-ai.mts                   JSON_SUMMARY {"total":17,"passed":17,"findings":[]}
pnpm exec tsx scripts/qc-account-api-core.mts     JSON_SUMMARY {"total":64,"passed":64,"findings":[]}
pnpm exec tsx scripts/qc-account-api-openapi.mts  JSON_SUMMARY {"total":26,"passed":26,"findings":[]}
pnpm exec tsx scripts/qc-account-api-write-docs.mts      JSON_SUMMARY {"total":52,"passed":52,"findings":[]}
pnpm exec tsx scripts/qc-account-api-write-payments.mts  JSON_SUMMARY {"total":32,"passed":32,"findings":[]}
pnpm exec tsx scripts/qc-account-api-write-finance.mts   JSON_SUMMARY {"total":33,"passed":33,"findings":[]}
pnpm exec tsx scripts/qc-account-api-read-docs.mts       JSON_SUMMARY {"total":50,"passed":50,"findings":[]}
pnpm exec tsx scripts/qc-account-api-write-ops.mts       JSON_SUMMARY {"total":29,"passed":29,"findings":[]}
pnpm exec tsx scripts/qc-account-cpa.mts          JSON_SUMMARY {"total":107,"passed":107,"findings":[]}

pnpm exec tsx scripts/gen-account-api-docs.mts            ✅ เขียน docs/api/ACCOUNT-API.md (199 op · 174716 ไบต์)
pnpm exec tsx scripts/gen-account-api-docs.mts --check    ✅ docs/api/ACCOUNT-API.md ตรงกับทะเบียน (199 op)

NODE_OPTIONS=--max-old-space-size=3584 pnpm typecheck     → 0 error
pnpm fitness                                              JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
env -u DATABASE_URL -u DIRECT_URL -u SESSION_SECRET pnpm fitness
                                                          JSON_SUMMARY {"total":20,"passed":20,"findings":[]}
   (F13.1 199 op มีข้อสอบ · F13.2 คู่มือไม่ stale · F13.3 tool บัญชี 36 ตัวลงทะเบียนในสกิลแล้ว)
```
DB ทุกคำสั่งชี้ Neon QC `ep-plain-art` (export ต่อบรรทัดตามกติกา · `qc-ai*.mts` มี `loadEnvFile(".env")` ในหัวไฟล์
⇒ รันโดย export QC env นำหน้าเสมอ ซึ่ง "ชนะ" ค่าจากไฟล์)

## 9. หมายเหตุถึง Fable / WO ถัดไป
- **E2 ได้ของแถมไปแล้ว**: `parameters` ของ `account_create_document` มี `required: ["type","lines"]` และ `properties.lines.type === "array"` (E2-X1.3) · คู่มือมี section AI tools แล้ว (E2-X4.1 ยังต้องเติมเรื่อง `/api/v1/ai/skills/account` + `pendingConfirmation` เมื่อ route มีจริง — ไม่เขียนล่วงหน้าเพราะคู่มือห้ามโกหก)
- `/api/v1/ai/skills/account` (route เดิม) ตอนนี้คืน tool บัญชี 36 ตัวได้ทันทีเพราะอ่านจาก `SKILLS` + `toolRegistry()`
- ต้นทุน context: tool def บัญชีรวม ≈ 49.6k ตัวอักษร ⇒ **โหลดผ่าน `load_skill` เท่านั้น** (ไม่มีตัวไหนอยู่ใน `CORE_TOOLS`) · ตัวใหญ่สุด `account_create_document` 4.9k
- qc:all ที่ Fable สั่งปิดเฟส D จบตอน 15:5x (21m27s · exit 1) — **รันคาบเกี่ยวกับการแก้ของ E1** (suite ที่ spawn หลังผมเริ่มแก้ ใช้โค้ดใหม่) ⇒ ผลรอบนั้นเชื่อไม่ได้ทั้งรอบ ควรรันใหม่ตอนตรวจรับ


## ภาคผนวกโดย Fable (ตรวจรับ 6 ก.ย. 00:30 น.)
- **K3.11/K3.14**: builder ถูก — oracle สั่งยกเลิกใบที่ PAID ทั้งที่กติกาบัญชีต้องยกเลิกการชำระก่อน ⇒ แก้ oracle เพิ่ม **K3.10a** `account_void_payment` (DESTRUCTIVE: ชั้นแรก needsSecondConfirm → ชั้นสอง ok → ใบพ้น PAID) ก่อน void ใบ · 33/33
- รับ `api/run.ts` (validateOpInput + runOpAsActor) เป็นประตูร่วม REST/AI — dispatch.ts ใช้ตัวเดียวกัน ไม่ลอกซ้ำ · `ApiActor.kind` 3 แบบ · เอกสารจาก AI ได้ source AI
- รันซ้ำเอง: ai-skill 33 · qc-ai-skills 23 · qc-ai 17 · core 64 · openapi 26 · write-docs 52 · write-payments 32 · docs --check 199 op · typecheck 0 · fitness 20/20 ×2
