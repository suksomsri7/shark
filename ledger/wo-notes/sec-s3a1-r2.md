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
