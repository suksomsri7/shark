# WO S3a.1-R2 — แก้ผลเส้นโมเดลจริง (RESOLUTIONS §Z.6 R-Z41…R-Z45)

> RUN "เลขา AI" · เลน c `/root/projects/shark-sec-c` · branch `wip/sec-s3a1-s2` · merge ทิปผู้คุม `c8240ea37` (SHA ตรง) · 6–7 พ.ย. UTC · builder Opus
> ใบ `ledger/secretary-briefs/sec-brief-S3a.1-R2.md` · FINDING `ledger/wo-notes/sec-s3a1-r.md` F1–F6 · ข้อสอบ `scripts/qc-sec-s3a1-r2.mts` (ใหม่ · ผู้คุมทบทวน) · ไม่เรียกโมเดลจริง (฿0)

## 1. มติ → ไฟล์
| มติ | ไฟล์ | ทำอะไร |
|---|---|---|
| R-Z41 (F1) | `src/lib/ai/tools.ts` | `today_appointments` (เดิม NO_ARGS → `{includeCancelled?}`) · `upcoming_schedule` (+`includeCancelled`) คืน `id` ทุกแถว · true = รวม CANCELLED/NO_SHOW + `สถานะ` + `มัดจำ {สถานะ, จำนวนบาท, คืนได้}` (`depositOfAppt` → `depositInfo` · คืนได้ = REFUND_DUE/FORFEIT_PENDING ∧ ค้างคืน > 0 · จำนวน = ค้างคืน หรือที่จ่าย) · คำอธิบาย `refund_booking_deposit` ชี้ includeCancelled=true · สิทธิ์อ่านเท่าเดิม |
| R-Z42 (F2) | `tools.ts` · `proposals.ts` | `pos_create_sale.memberId?` (ตรวจสมาชิกของร้าน + `visibleMembers` ตอนเสนอ · ตรวจซ้ำตอนลงมือ) → `posSvc.createSale({memberId})` · summary/ผลบอก "ผูกสมาชิก <ชื่อ>" · `customer_search` คืน `id` · คำอธิบาย `point_adjust` ห้ามใช้แทนแต้มจากการซื้อ |
| R-Z43 (F3) | `src/lib/ai/provider.ts` | `ACTION_WORDS` + ร่าง · ส่ง · คืน · ออกใบ · แจ้ง |
| R-Z44 (F4) | `pricing.ts` (`Price.cacheWritePerM` = in×1.25 · `cacheReadPerM` = in×0.1 · `costMicroUsd(…, cache?)`) · `provider.ts` (`AiReply.cacheWrite/cacheRead` · `parseAnthropicReply` tokensIn = input_tokens) · `credit.ts` (`ChargeInput.cacheWrite/cacheRead` · คิดราคาแยก · คอลัมน์ `AiCreditTxn.tokensIn` = ขาเข้ารวม) · `service.ts` (สะสมแคชต่อเทิร์น · AiMessage/AiUsage tokensIn = รวม — เพดานรายวันความหมายเดิม) · ส่งต่อแคชที่จุดหักเงิน 17 ไฟล์ (crm-bridges/chat · interview · analyst · mobile/chat · support-ai · crm/calls · translate · task-from-chat · crm/ai-bridges · kanban/ai · after-hours · ai-suggest · member/reviews · automation-suggest · dorm/import-ai · dna/actions · account/inbox-ai) · `dorm/meter-ai` รวมแคชเข้าขาเข้า (ยอดถูกเก็บลงแถวมิเตอร์แล้วหักทีหลัง ⇒ คิดราคาขาเข้าเต็มแบบเดิม) |
| R-Z45 (F6) | `account-ops.ts` (`extraHint` ของ `documents.create` · `dispatchAccountKind(..., out)` ตั้ง `account.document` entity) · `proposals.ts` (`dispatchChatSend` + `latestQuoteLine` · ด่านก่อน claim ใน executeProposal · `ChatSendNotReady` · `NO_APPROVED_DOC_NOTE`) | quote ไม่มี documentId ⇒ ใบ `account.documents.create` EXECUTED ล่าสุดของบทสนทนาเดียวกัน → ต่อท้าย "ใบเสนอราคา เลขที่ … · ยอด … บาท · <ลิงก์ /r/<token> ถ้ามี>" · ไม่มี ⇒ ปฏิเสธไทยก่อน claim (คง PENDING) |
| docs | `docs/modules/31-secretary.md` §1.5 | 3 บรรทัด (ส่งใบในเทิร์นเดียว · แต้มจากบิล · includeCancelled) |

## 2. ต่างจากมติ / ตัดสินเอง
1. **ลิงก์ใบเสนอราคา**: ไม่มีลิงก์สาธารณะสำหรับ QUOTATION ในโค้ด (`ensurePublicTaxInvoiceLink` รับเฉพาะ RECEIPT/INVOICE/DEPOSIT_RECEIPT) ⇒ ต่อลิงก์ `/r/<publicToken>` เฉพาะเมื่อเอกสารมี token อยู่แล้ว · ไม่สร้าง token ให้เอง (การเปิดลิงก์สาธารณะของใบเสนอราคา = ตัดสินใจผลิตภัณฑ์) · ใบ DRAFT ไม่มีเลข ⇒ "ฉบับร่าง" + ยอด
2. **id เอกสาร**: หาใบผ่านบันทึกการกระทำ (`AiActionLog.entityType = account.document` ของข้อเสนอที่ EXECUTED) — เพิ่ม out-param ให้ `dispatchAccountKind` (ก่อนนี้บัญชีไม่ตั้ง entity) · ใบที่อนุมัติก่อน deploy ใบนี้ไม่มี entity ⇒ ถือว่า "ยังไม่มีใบ"
3. **AiCreditTxn/AiUsage tokensIn** เก็บขาเข้ารวม (ไม่ใช่แคช + เขียน + อ่าน) ให้ความหมายตรงกับแถวเก่า · เงินคิดแยกราคาแคชแล้ว
4. `dorm/meter-ai` รวมแคชเข้าขาเข้า (ไม่ได้แยกราคา) — ยอดเก็บลงแถวมิเตอร์แล้วหักภายหลัง · system prompt สั้น (แคชมักเป็น 0)
5. T2 ระบายคิวด้วย `onPosSalePaid(tid, saleId)` ตรง (ตัวเดียวกับ consumer `pos.sale.paid`) — ไม่เรียก `drainAll` (กันไปประมวลผล event ของร้านอื่นในฐาน QC ร่วม)

## 3. ผล (ฐาน QC เลขา · SHARK_AI_MOCK)
- `qc-sec-s3a1-r2` **16/16** ×2 (residue 0)
- regression: s3a1-s2 28/28 · s3a.1 16/17 (R-1 SKIP โมเดลจริง) · s1.19 26/26 · qc-ai-credit 32/32 · qc-chat-api-v1 89/89 · qc-booking-deposit 18/18 · qc-ai-tools 18/18 · qc-ai-tools2 8/8 · qc-ai-phase-b1 9/9 · qc-ai-wave5b 24/24
- **แดงตามมติ (ขอ ORACLE-EDIT)**:
  - `qc-sec-s1.12` E-2/E-3/E-5 (12/15): ข้อสอบเสนอ `send_customer_message` kind=`quote` **ไม่มีเอกสาร** แล้วคาดว่าอนุมัติส่งได้ — R-Z45 สั่งให้ปฏิเสธ (E-3/E-5 ตามมาจาก E-2) · เสนอ: ข้อสอบ T-2 ใช้ kind=`reply` (หรือสร้างใบ EXECUTED + บันทึก `account.document` ในห้องก่อน E-2)
  - `qc-sec-s1.20` B-6 (18/19): คาด `tokensIn === 530` (รวมแคช) — R-Z44 สั่ง tokensIn = ไม่ใช่แคช · เสนอ: `tokensIn === 100 && cacheWrite === 30 && cacheRead === 400`
- `qc-pos-p6.1` P6.1-Z1 (30/31): ด่านขอบเขตของเลน POS (เทียบหมุดเลน c91d8735 — ทรีนี้แตะ src/ ตามธรรมชาติ) ⇒ ใช้กับทรีเลขาไม่ได้ (ไม่เกี่ยวกับใบ) · ข้ออื่นเขียว
- typecheck 0 · fitness pre-commit ✅ · `env -u DATABASE_URL` 53/53

## 4. รอบ 3 — R-Z49 VAT ปริยายจากค่าตั้งค่าร้าน (รอบจริง #2 บนทิป 39d337292 = 2/3 · ใบเสนอราคาตกเพราะถาม VAT)
- merge ทิปผู้คุม `cbc960331` (fast-forward — มีงานรอบ R2 ของเลนนี้อยู่แล้ว)
- `src/lib/ai/account-ops.ts`: `fillDocVatDefaults(opId, tenantId, systemId, input)` — เฉพาะ `documents.create` · บรรทัดที่ไม่ระบุ `vatRateBp` ⇒ 700 (จด VAT) / 0 (ไม่จด) · ไม่ระบุ `vatMode` ⇒ EXCLUDE / NONE · อ่าน `AccountSettings.vatRegistered` (ไม่มีแถว = ค่าปริยาย schema = จด) · ค่าที่ระบุเองชนะ · เรียกทั้งตอนเสนอ (`runAccountTool` หลัง `prepareCall` ⇒ สรุปยอดรวม VAT ถูก) และก่อนลงมือ (`dispatchAccountKind` ก่อน `validateOpInput` — ข้อเสนอรุ่นเก่า)
- `extraHint` ของ `documents.create` เพิ่มประโยค VAT (อังกฤษ · ASCII ล้วน — ข้อสอบ E1-K1.7 ของ qc-account-api-ai-skill บังคับ ASCII จึงเปลี่ยน "—" ในประโยค R-Z45 เป็น ";" ด้วย)
- ข้อสอบ `qc-sec-s3a1-r2` T6-1…T6-4 (จด = 700/EXCLUDE/9,630.00 · ไม่จด = 0/NONE/9,000.00 · ระบุ 0 เองชนะ · hint มี "Do not ask about VAT")
- ผล: r2 **20/20** ×2 (residue 0) · s3a.1 16/17 (R-1 SKIP) · s1.12 15/15 · qc-ai-tools 18/18 · typecheck 0 · fitness pre-commit ✅ · no-DB 53/53
- `qc-account-api-ai-skill` 28/33: E1-K2.1/2.3/2.5/2.6/2.8 = "ยังไม่ได้เปิดระบบบัญชี" — ข้อสอบนี้ต้องใช้ร้าน seed บัญชี (เฉลย 494300 · ณัฐพล) ซึ่งไม่มีในฐาน QC เลขา · ไม่เกี่ยวกับใบ · E1-K1.7 (ASCII) เขียวหลังแก้

## 5. รอบ 4 — R-Z50 กติกาห้ามถามค่าปริยายชั้นแกน (รอบจริง #3 ใบเสนอราคา 0/3 · ถาม VAT ก่อน load_skill)
- merge ทิปผู้คุม `1b6c59b87` (SHA ตรง)
- `src/lib/ai/tools.ts` `ask_clarify`: + "Do not ask about VAT/tax, discounts, document numbering or format: the shop's settings decide and the system fills them in. Ask only for what the system cannot know (which customer, which items, quantity, price, which bill/board)." · เปลี่ยน "Never guess — call…" เป็น "Never guess; call…" ให้คำอธิบายทั้งก้อนเป็น ASCII (ข้อความเดิมมีขีดยาว)
- `src/lib/ai/persona.ts`: `SHOP_DEFAULTS_RULE` "- ค่าปริยายของร้าน เช่น VAT/รูปแบบเอกสาร ระบบเติมให้ — ห้ามถาม · ถามเฉพาะสิ่งที่ระบบรู้เองไม่ได้" ต่อจาก `DATA_NOT_COMMAND_RULE` เฉพาะห้องเลขา (`secRoom` = ตัวตนเลขา/ข้อมูลสด/บล็อกลูกค้า) — ห้อง AI เดิม prompt เดิมทุกไบต์ (s1.2 P-1 เขียว)
- ข้อสอบ r2 T7-1 (ask_clarify ASCII + 2 ประโยค) · T7-2 (prompt ห้องเลขามีกติกา · ห้องเดิมไม่มี)
- ผล: r2 **22/22** ×2 (residue 0) · qc-ai-tools 18/18 · s3a.1 16/17 (R-1 SKIP) · qc-sec-s1.2 28/28 · qc-account-api-ai-skill 28/33 (K1.7 เขียว · K2.x = ไม่มีร้าน seed บัญชีในฐาน QC เลขา เหมือนรอบ 3) · ไม่มีข้อสอบชื่อ persona/ai-prompt แยก (grep qc-*persona*/qc-ai-prompt* = ไม่มี) · typecheck 0 · fitness no-DB 53/53

## 6. รอบ 5 — R-Z51 ไม่ถามยืนยันก่อนเสนอ (รอบจริง #4: VAT ไม่ถามแล้ว · จบด้วย ask_clarify "ยืนยันสร้างและส่งไหม" · load_skill ซ้ำ)
- merge ทิปผู้คุม `65c619b90` (SHA ตรง)
- (ก) `tools.ts` ask_clarify + "Never ask for confirmation to proceed (e.g. 'shall I create or send it?'): every write is a proposal that a person approves in the app. When the user asks to create and send, propose both now." (ASCII)
- (ข) `persona.ts` `NO_CONFIRM_RULE` เฉพาะห้องเลขา (ต่อจาก SHOP_DEFAULTS_RULE) · ห้องเดิมไบต์เดิม (s1.2 28/28)
- (ค) `secretary/customer-context.ts customerBlock`: บรรทัดที่ 2 "ส่งข้อความถึงลูกค้าคนนี้: send_customer_message conversationId=<id>" (ก่อนข้อความล่าสุด ⇒ ไม่ถูกตัดตอนบล็อกยาว) · rooms.ts ไม่ได้ประกอบข้อความบริบทเอง (บล็อกนี้ตัวเดียวที่เข้า prompt) · service ยังเติม conversationId ปริยายให้ send_customer_message เหมือนเดิม
- (ง) load_skill: enum ตัดสกิลที่โหลดแล้วออกอยู่แล้ว (`currentTools` → `LOAD_SKILL_TOOL(ยังไม่โหลด)`) — ไม่ใช่บั๊กของ enum · แต่ (1) ผลของ load_skill บอกแค่ "tools are now available" ไม่บอกชื่อ (2) ขอสกิลที่โหลดแล้วซ้ำ (โมเดลไม่ได้ถูกบังคับด้วย enum เสมอ) = ตอบ "Loaded" ซ้ำเหมือนโหลดใหม่ ⇒ แก้ใน `service.ts`: ผลบอก "These tools are available from now on: <ชื่อ>" · ซ้ำ = "Already loaded: X (tools …) — do not load again; call the tool you need" · หมายเหตุ: account_search_contacts ซ้ำ 3 รอบ = เรื่องโมเดลค้นซ้ำ (ไม่มีด่านในโค้ด) — จดไว้ดูรอบจริง #5
- (จ) r2 T8-1 (ask_clarify ASCII + ประโยคใหม่) · T8-2 (prompt ห้องเลขามี/ห้องเดิมไม่มี) · T9-1 (บล็อกลูกค้ามี conversationId แม้ข้อความล่าสุดยาว)
- ผล: r2 **25/25** ×2 (residue 0) · s1.2 28/28 · s1.22 14/14 · qc-ai-tools 18/18 · qc-ai-skills 23/23 · s3a.1 16/17 (R-1 SKIP) · qc-account-api-ai-skill 28/33 (K1.7 เขียว · K2.x = ไม่มีร้าน seed บัญชี) · typecheck 0 · fitness no-DB 53/53
- ไฟล์ร่วม: `src/lib/ai/service.ts` เฉพาะบล็อก load_skill (ผลข้อความ + กันโหลดซ้ำ)
