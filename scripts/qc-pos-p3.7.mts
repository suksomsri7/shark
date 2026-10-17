// QC — POS RUN ใบ P3.7 (S): แชท — ใบเสร็จอัตโนมัติ · สถานะออเดอร์ · ลิงก์จ่ายในแชท (ประตู A พนักงาน + ประตู B ลิงก์ติดแท็ก) · บอทตอบตามกฎ (C-11)
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ · ไม่ต้องมี seed (ร้านชั่วคราว + ผู้ใช้ชั่วคราวของตัวเอง)
//
// สัญญา: ledger/pos-briefs/pos-brief-P3.7.md §2 R1–R12 · §3 (ไม่มี migration) · §4 แผนข้อสอบ (id ตรงตัว) · §5 หมุด · §10 มติผู้คุม 1–13 (ผูกมัด:
//        สวิตช์ OWNER เท่านั้น ปิดทั้งหมดเป็นค่าปริยาย · at-most-once ด้วย unique ChatMessage(conversationId, clientMessageId) · ประตู A + B (B คง QR_ORDER) ·
//        บอทตามกฎเท่านั้น · ข้อความ th/en ตายตัว · Q7 นอกขอบเขต · Q8 ตอบรับแจ้งปัญหาผ่าน notifyCustomer · รอยต่อแชท chat/pos-seam.ts + บล็อก chat/index.ts +
//        composition root src/lib/pos-chat-bridges.ts · outbox-consumers.ts :719 ห่อชั้นนอกสุดบรรทัดเดียว · ไฟล์ POS ใหม่ห้ามตรง pos/receipt*.ts)
//        ต่อยอด: qc-pos-p1.11 (ตัวส่ง LINE ที่ฉีด · เพดาน 5/24 ชม.) · qc-pos-p2.7 (ออเดอร์จ่ายก่อน · ลิงก์ /q/<link> · ระบายคิว) · qc-pos-p2.8 (วงจรออเดอร์) ·
//        qc-chat-notify (ensureWebchatConnection + receiveWebchatInbound = ห้องแชทจริงที่ไม่แตะเครือข่าย) · qc-pos-p1.18 (facts)
//        โน้ต: ledger/wo-notes/pos-P3.7-oracle.md (ตารางชื่อ = สัญญาของผู้สร้าง S · ความคลาดเคลื่อน · ORACLE-EDIT · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P3.7 (S) ต้องส่ง (ย่อ — ละเอียดในโน้ต):
//   chat/pos-seam.ts (ของโมดูลแชท · ผู้เขียน ChatMessage/ChatConversation ของงานนี้ที่เดียว): notifyCustomer(input, deps?) · botContext · setBotPaused
//     + บล็อก `// POS P3.7 ▸ … ◂` ท้าย chat/index.ts
//   src/lib/pos-chat-bridges.ts (composition root): notifyCustomer · ordersForChatCustomer · requestChatPayment · mintChatPreorderLink ·
//     ตัวรับคิว onSalePaidChat · onSaleRefundedChat · onOrderEventChat · onIntentPaidChat · onChatMessageReceivedBot (ทุกตัว (evt, deps?) · ไม่ throw)
//   pos/chat-link-shared.ts (บริสุทธิ์): posChatSettings · matchBotIntent · POS_CHAT_TEXTS (th/en) · pos/chat-link.ts: setPosChatSettings (OWNER เท่านั้น) ·
//   pos/chat-link-actions.ts ("use server") · pos/chat-order.ts (ผู้ประสานประตู A) · order.ts บล็อก requestChatPaymentInTx · qr-order.ts placePreorder input.chatTag
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p2.7/p2.8): SKIP เมื่อของ P3.7 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST3 + บริสุทธิ์ CS2 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ep-frosty-lab ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p37-<rand>` + `-t2` + ผู้ใช้ `posqc-p37-<rand>-*@qc.invalid`
//    (ลบทั้งหมดใน finally · แถวค้าง = 0) · ทุกข้อห่อ try/catch · โมดูล/ฟังก์ชันที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)`) — next build ตรวจชนิด scripts/*.mts
//    🔴 ไม่มีเครือข่ายเลย: globalThis.fetch = ตัวกั้น (503 + บันทึก host/เนื้อคำขอ) ตลอดช่วง DB · ห้อง WEBCHAT = adapter ไม่ยิงอะไร (ส่งจริงของ webchat = no-op) ·
//       เส้น LINE ของสมาชิกทดสอบด้วย "ตัวส่งที่ฉีด" (deps.send ของรอยต่อ ส่งผ่าน deps ของตัวรับ root ที่เรียกตรง) เท่านั้น — ระหว่างที่ต้องระบายคิว
//       สวิตช์ที่ทำให้เส้น LINE ทำงานถูกปิด หรือแถวถูกเขียนไปแล้ว (เล่นซ้ำ = ซ้ำคีย์ ไม่ส่ง) · การเชื่อมต่อ LINE ของร้านชั่วคราวเปิด CONNECTED เฉพาะช่วงที่ต้องใช้
//    fixture ผ่านฟังก์ชันของโมดูล (system/chat/member/pos) · Prisma ตรงเฉพาะ Tenant/BusinessUnit/User/Membership + การเชื่อมต่อ LINE ปลอม (credentials เป็นอ็อบเจกต์ ·
//    ไม่มีโทเคนจริง) + ผู้ติดต่อ/ห้อง LINE ของสมาชิก (ไม่มีฟังก์ชันโมดูลที่สร้างได้โดยไม่แตะเครือข่าย — แบบเดียวกับ qc-pos-p1.11) + blockedAt ของผู้ติดต่อหนึ่งราย +
//    defaultUnitId ของช่อง webchat + ข้อความเข้าชนิดรูปภาพหนึ่งแถว (AR5) + ค่าตั้ง settings.pos.chat/payment ของระบบ POS (สลับสวิตช์ — ข้อ CS3 ทดสอบตัวเขียนจริงแยก) ·
//    SQL ดิบ = ย้อนเวลา (payBy · receivedAt · createdAt ของข้อความพนักงาน · meta.posBotPausedUntil ไม่แตะ) / ลายนิ้วมือ / ลบร้านชั่วคราว
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p3.7";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 idempotency/เล่นซ้ำ/แข่ง · X2 ข้ามขอบเขต/ความเป็นส่วนตัว · X3 สิทธิ์ · X4 เงิน · X5 ไม่เขียน/ไม่ส่ง · PAR = เขียวทั้งก่อนและหลังสร้าง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P3.7-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── CS ค่าตั้ง ──
  D("CS1", "X5", "[R3 §10-1 ค่าปริยาย] สวิตช์ปิดทั้งหมด: บิลสมาชิก M1 + ออเดอร์ CHAT ผูกห้อง (รับ → พร้อม) + ข้อความเข้า \"สถานะออเดอร์\" → drain → ChatMessage OUT ที่ clientMessageId ขึ้นต้น pos: = 0 · ตัวรับของ root (onSalePaidChat · onOrderEventChat · onChatMessageReceivedBot) ถูกเรียกตรงด้วย deps.notify (สปาย) → สปาย 0 ครั้ง · ไม่ throw"),
  D("CS2", "P", "[R3] posChatSettings (บริสุทธิ์ · อ่าน settings.pos.chat): ค่าปริยาย {receiptAuto false · refundNotice false · orderStatus false · autoReply false · statusKinds [accepted ready cancelled paid] · botPauseHours 24} · ค่าที่ไม่ใช่ true = false · botPauseHours 0→1 · 100→72 · \"5\"→24 · statusKinds กรองค่าแปลก/ซ้ำ · ไม่ใช่ array → ปริยาย · คีย์แปลกไม่หลุดออกมา"),
  D("CS3", "X3", "[R3 §10-1 OWNER เท่านั้น] setPosChatSettings(ctx, actor, patch): STAFF / MANAGER → PERMISSION_DENIED (ไม่เขียน) · คีย์แปลก / botPauseHours 0 · 73 · \"5\" / statusKinds [\"bogus\"] / receiptAuto \"yes\" → VALIDATION · OWNER {receiptAuto:true, botPauseHours:12} → ok + settings.pos.chat เก็บค่า + AuditLog pos.settings.updated +1 · settings.pos.payment ไม่เปลี่ยน · คืนค่า → ปิด"),
  D("CS4", "X2", "[R3] ctx = ระบบ POS ของร้าน T2 (tenantId ร้าน T) → NOT_FOUND · ค่าตั้งของ T2 ไม่เปลี่ยน"),
  // ── RC ใบเสร็จอัตโนมัติ ──
  D("RC1", "-", "[R1 R4 R5] receiptAuto เปิด + LINE เชื่อมอยู่: onSalePaidChat(evt บิล M1, {send}) → ChatMessage OUT 1 แถวในห้อง LINE ของ M1: senderUserId null · clientMessageId pos:receipt:<saleId> · body = receiptLineText(receiptNo, grand − refunded, <origin>/r/<token>) · deliveryStatus SENT · meta.source pos · ตัวส่งที่ฉีด 1 ครั้ง (externalUserId ของ M1 · ข้อความเดียวกัน) · ห้อง: status/staffUnreadCount/firstResponseAt/assignee ไม่เปลี่ยน · lastMessageDirection OUT · AuditLog pos.receipt.auto_sent 1 (SYSTEM · PosSale · after.to LINE:member)"),
  D("RC2", "X1", "[R1 §10-2 at-most-once] เรียกตรงซ้ำ ×2 + consumers[pos.sale.paid] ×2 + พร้อมกัน 2 → ยัง 1 แถว · ตัวส่งยัง 1 ครั้ง · audit auto_sent ยัง 1 · ไม่มีคำขอเครือข่ายที่มีเลขบิลนี้ (ตัวกั้น fetch)"),
  D("RC3", "X5", "[R4] M2 (ถอนความยินยอม LINE) / M3 (ผู้ติดต่อถูกบล็อก) / walk-in → 0 แถว · ตัวส่ง 0 · consumers[pos.sale.paid] เล่นซ้ำไม่ throw"),
  D("RC4", "X5", "[R1 R4] การเชื่อมต่อ LINE ถูกปิด (DISABLED) → บิล M1 อีกใบ: 0 แถว · ตัวส่ง 0 · OpsEvent WARN pos.chat.notify มีรหัส NO_CONNECTION (ไม่มีข้อความ/LINE id/เบอร์/ชื่อ) · แถวบิล + แถวชำระไม่เปลี่ยน"),
  D("RC5", "X5", "[R5] บิล M1 ถูกยกเลิก (VOIDED) ก่อนตัวรับทำงาน → 0 แถว · ตัวส่ง 0"),
  D("RC6", "-", "[R5] ออเดอร์ CHAT walk-in ผูกห้อง WEBCHAT → acceptOrder + payOrder → drain → ใบเสร็จ 1 แถวในห้องนั้น (pos:receipt:<saleId> · body = receiptLineText) · AuditLog auto_sent after.to CHAT:order · บิลไม่มี memberId"),
  D("RC7", "X5", "[R4 R5] ออเดอร์แพลตฟอร์ม (LINEMAN · PLATFORM) ที่มี chatConversationId → บิลตอนรับ → drain → 0 แถวในห้องนั้น"),
  D("RC8", "X1", "[R5 · P1.11 R7] หลังส่งอัตโนมัติ: sendReceipt (LINE · deps.line ปลอม) ผ่าน 5 ครั้ง · ครั้งที่ 6 RATE_LIMITED (auto_sent ไม่นับ) · refundNotice: onSaleRefundedChat(evt ใบคืน, {send}) → 1 แถว pos:refund:<refundSaleId> (คืนเงิน · ยอดใบคืน · เลขบิลเดิม · /r/<token ใบคืน>) · เรียกซ้ำ ×2 + consumers[pos.sale.refunded] → ยัง 1"),
  // ── CO ประตู A / B ──
  D("CO1", "-", "[R7 §10-3 ประตู A] requestChatPayment(ctx, STAFF (sale.create + order.accept), {orderId}) ออเดอร์ CHAT NEW UNPAID ผูกห้อง → {ok, sent:true, duplicated:false, intentId} · ออเดอร์ NEW PENDING_PAYMENT · payBy ≈ ตอนนี้ + 20 นาที · publicToken 12 ตัว · paymentIntentId · version +1 · PosOrderEvent payment_requested 1 · ใบ PROMPTPAY_STATIC PENDING ยอด = ออเดอร์ (orderId · expiresAt = payBy · คีย์ posorder-pay-<id>) · ข้อความ 1 แถว pos:ordpay:<orderId>:<intentId> (ยอด · HH:mm ของ payBy · <origin>/q/o/<token>) · ไม่มีบิล"),
  D("CO2", "X1", "[R7] เรียกซ้ำ ×2 + พร้อมกัน 3 → ok · duplicated:true · intent/โทเคนเดิม · ใบของออเดอร์ 1 · ข้อความจ่าย 1 · payment_requested 1 · version เดิม"),
  D("CO3", "X3", "[R7 §10-1] ปฏิเสธ (ไม่เขียน · ไม่มีใบ/ข้อความ · รหัสใหม่ NO_CHAT_LINK มี messageKey orders.chatPay.errors.* ใน th/en): ออเดอร์ LINEMAN / ออเดอร์ CHAT ที่รับแล้ว → ORDER_STATE_INVALID · CHAT ไม่ผูกห้อง → NO_CHAT_LINK · CASHIER (ไม่มี pos.order.accept) → PERMISSION_DENIED · id ของร้าน T2 / id มั่ว → ORDER_NOT_FOUND"),
  D("CO4", "X5", "[R7] สาขา B ไม่มีพร้อมเพย์ → PROMPTPAY_NOT_CONFIGURED (messageKey มีใน th/en) · ออเดอร์ไม่เปลี่ยน (UNPAID · version) · ไม่มีใบ/ข้อความ"),
  D("CO5", "X4", "[R6 R7 R5] ยืนยันเงินเข้า (confirmPaymentIntentManual) → drain → PREPAID + ข้อความ paid 1 (pos:order:<id>:paid · ได้รับเงิน · รหัส) → acceptOrder → บิล POS (sourceId = ออเดอร์) ชำระ PROMPTPAY แถวเดียว = grand · ใบ CONSUMED · ใบเสร็จในห้องนั้น 1"),
  D("CO6", "-", "[R8 §10-3 ประตู B] mintChatPreorderLink({tenantId, conversationId}) → {ok, url <origin>/q/<linkToken>?c=<tag>, expiresAt ≈ +24 ชม.} · placePreorder(linkToken, {…, chatTag}) → ok · ออเดอร์ QR_ORDER PENDING_PAYMENT chatConversationId = ห้องนั้น"),
  D("CO7", "X2", "[R8] แท็กถูกแก้ / หมดอายุ (mint ด้วย now −25 ชม.) / แท็กของร้าน T2 / สตริงมั่ว → placePreorder ok · ออเดอร์ chatConversationId null (ไม่ปฏิเสธลูกค้า) · createSale( ใน order.ts = ฐาน"),
  // ── OS สถานะออเดอร์ ──
  D("OS1", "X1", "[R6] orderStatus เปิด: ออเดอร์ CHAT ผูกห้อง accept → ข้อความ 1 (pos:order:<id>:accepted · รหัส · HH:mm = acceptedAt + prepMinutes เวลาไทย) · markPreparing → ไม่มีข้อความ · markReady → ข้อความ 1 (pos:order:<id>:ready · รหัส) · เล่น consumers accepted/ready ซ้ำ ×2 + drain → ยัง 2"),
  D("OS2", "X5", "[R6] payOrder + handOver (completed) → ไม่มีข้อความสถานะเพิ่ม (pos:order:<id>: ยัง 2)"),
  D("OS3", "-", "[R6] ปฏิเสธออเดอร์ PREPAID (ประตู A จ่ายแล้ว · มี refund_needed) → ข้อความ cancelled มีบรรทัดคืนเงิน · ปฏิเสธออเดอร์ UNPAID → cancelled ไม่มีบรรทัดคืนเงิน · คีย์ pos:order:<id>:cancelled"),
  D("OS4", "-", "[R6] หมดเวลาชำระ (payBy ผ่านไป → expirePreorders) → CANCELLED + ข้อความ pos:order:<id>:cancelled (หมดเวลา…)"),
  D("OS5", "X5", "[R4 R6] ออเดอร์ CHAT walk-in ไม่ผูกห้อง accept → 0 · ออเดอร์ LINEMAN (PLATFORM) ที่มี chatConversationId → 0"),
  D("OS6", "-", "[R3 R6] statusKinds [accepted cancelled paid] → accepted ส่ง · ready ไม่ส่ง"),
  // ── AR บอทตามกฎ ──
  D("AR1", "-", "[R9 Q5] autoReply เปิด: \"สถานะออเดอร์\" ในห้องที่มีออเดอร์ผูก 4 ใบ + 1 ใบเก่า 49 ชม. → ตอบ 1 (pos:bot:<inboundId> · senderUserId null) มีรหัสออเดอร์ล่าสุด + /q/o/<token> · ไม่เกิน 3 รหัส · ไม่มีใบเก่า · ไม่มีเบอร์ · ordersForChatCustomer ≤ 3 ของห้องนี้ ไม่มีใบเก่า"),
  D("AR2", "X2", "[R9 R10] ห้องอื่นพิมพ์รหัสออเดอร์ของห้องแรก / พิมพ์เบอร์ลูกค้า → ตอบ \"ไม่พบออเดอร์…\" ไม่มีรหัส/ลิงก์/เบอร์ · ordersForChatCustomer ของห้องนั้น = []"),
  D("AR3", "-", "[R8 R9] \"ขอดูเมนู\" → ตอบลิงก์ <origin>/q/<linkToken>?c=<tag> (สั่งด้วยแท็กนี้ → ออเดอร์ผูกห้องนั้น) · พักช่องทาง QR_ORDER → \"menu\" ตอบข้อความร้านปิด (ไม่มี /q/)"),
  D("AR4", "-", "[R1 R9] \"ขอคุยกับพนักงาน\" → ตอบส่งต่อ · meta.posBotPausedUntil ≈ +24 ชม. (botContext เห็นค่าเดียวกัน) · ข้อความถัดไป → เงียบ · เรียกตรง now +1 ชม. → เงียบ · now +25 ชม. → ตอบ"),
  D("AR5", "X5", "[R9] เงียบ: ห้องมีผู้รับผิดชอบ · พนักงานตอบเมื่อ 10 นาที · สวิตช์ปิด · ข้อความรูปภาพ · ตัวควบคุมบวก: พนักงานตอบเมื่อ 40 นาที → ตอบ"),
  D("AR6", "X1", "[R9] 3 ข้อความใน 5 วินาที (ห้องเดียว) → ตอบ 1"),
  D("AR7", "X1", "[R9] เล่น consumers[chat.message.received] ซ้ำ ×2 + พร้อมกัน 2 + เรียกตรง now +1 ชม. → ยังตอบ 1 ต่อข้อความเข้า"),
  D("AR8", "PAR", "[R9 compose] ตัวรับเดิมของแชทยังทำงาน: ห้องผูกสมาชิก (สวิตช์ปิด / เปิด) → ไทม์ไลน์สมาชิกเพิ่มเท่ากัน · event chat.message.received DONE ไม่มี lastError"),
  // ── PV ข้อมูลส่วนตัว ──
  D("PV1", "X2", "[R10] ทุก body ของ ChatMessage pos:* ในรอบ (≥ 1 แถว): ไม่มีเบอร์ (ทุกรูปแบบ) · ไม่มีชื่อลูกค้า/สมาชิก · ไม่มี LINE externalUserId · ไม่มีเลขบัตร"),
  D("PV2", "X2", "[R10] AuditLog pos.receipt.auto_sent + OpsEvent pos.chat.notify ของร้าน (≥ 1 ทั้งคู่): ไม่มีเนื้อความข้อความ · externalUserId · เบอร์ · ชื่อ"),
  // ── X ข้ามร้าน ──
  D("X1", "PAR", "[R2 assertCustomerLinks] ingestOrder CHAT ที่ chatConversationId เป็นห้องของร้าน T2 → VALIDATION (orders.errors.conversationNotFound) · ไม่มีออเดอร์"),
  D("X2", "X2", "[R1 R2] notifyCustomer(ร้าน T, ห้องของ T2) → NO_CONVERSATION ไม่มีแถว · botContext → null · ordersForChatCustomer → ไม่มีออเดอร์ · mintChatPreorderLink → ok:false · ห้อง T2 ไม่มีข้อความ OUT · ข้อความ pos:* ทุกแถวเป็นของร้าน T"),
  // ── ST สถิต ──
  D("ST1", "S", "[R1 R2 hard rules] ขอบเขต: มี chat/pos-seam.ts (ไม่ import POS/root) + src/lib/pos-chat-bridges.ts (import เฉพาะ @/lib/modules/{chat,pos,member} (index) · @/lib/core/* · node:) · modules/pos/** ไม่ import @/lib/modules/chat · ไม่แตะ prisma chatContact/chatMessage/chatChannelConnection · ไม่ import root แบบ static · ไฟล์ที่เปลี่ยน/ใหม่ใต้ src/ เขียน ChatMessage/ChatConversation ได้ที่ chat/pos-seam.ts เท่านั้น · scripts/fitness.mts = ฐาน (ไม่มีเส้นใหม่) · chat-link-actions.ts \"use server\" async ล้วน"),
  D("ST2", "S", "[ตารางชื่อ R1–R12 §10] chat/index.ts บล็อก POS P3.7 export notifyCustomer botContext setBotPaused จาก ./pos-seam · root export 9 ชื่อ · outbox-consumers ผูก 5 ตัวรับที่คีย์ของมัน · order.ts export requestChatPaymentInTx ในบล็อก · chat-order.ts เรียก requestChatPaymentInTx/prepareOrderIntent/orderIntentUnused · chat-link-shared บริสุทธิ์ (posChatSettings · matchBotIntent ตามตาราง · POS_CHAT_TEXTS th/en คีย์ครบ 12) · setPosChatSettings · fact orderStatusBot true null · ข้อความ orders.chatPay.* / chat.notify.* / settings.cards.CHAT (โควตา) th+en · คีย์ audit/ops/dedupe ในซอร์ส · Q8 pos:issue-ack: · qr-order + หน้า /q อ่าน chatTag"),
  D("ST3", "PAR", "[§3 §5 §10-10 hard rules] หมุดเทียบ 72669941: ไม่มี diff ใต้ prisma/ · service.ts (createSale/voidSale) refund*.ts payment-intent.ts register*.ts tender*.ts held-cart.ts pos/receipt*.ts chat/service.ts ตรงฐานทุกไบต์ · ไม่มีไฟล์ใหม่ pos/receipt*.ts · outbox-consumers.ts: ทุกบรรทัดที่เพิ่มอยู่ในรอยต่อ POS P3.7 · บรรทัดที่ลบเป็นของคีย์ที่อนุญาต · \"pos.sale.paid\" เปลี่ยน 1 บรรทัดแทน 1 บรรทัด (ห่อชั้นนอก คงนิพจน์เดิม) · chat/index.ts เพิ่มอย่างเดียวในบล็อก POS P3.7 เดียว · order.ts ทุกบรรทัดที่เปลี่ยนมีรอยต่อ + บล็อกหลายบรรทัดเดียว"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว T T2 เหลือ 0 แถวทุกตารางที่มี tenantId (ChatMessage/Conversation/Contact/Connection · PosOrder* · Intent · PosSale* · AuditLog · OutboxEvent · OpsEvent …) · Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0 · ถังอัตรา posbot:/ลิงก์ของรอบ 0"),
  D("Z2", "-", "รอยของรอบนี้นอกร้านชั่วคราว = 0 (PosSale/PosOrder คีย์ · ChatMessage pos:* ของร้านอื่นที่สร้างช่วงรอบ · AuditLog/OutboxEvent/OpsEvent ที่มีรหัสรอบ · Tenant slug) · ลายนิ้วมือร้านอื่น (ChatMessage OUT pos:* · PosOrder · PosPaymentIntent) ก่อน/หลังพิมพ์เป็นข้อมูล"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  const byX = new Map<string, number>();
  for (const [, x] of CHECKS) byX.set(x, (byX.get(x) ?? 0) + 1);
  console.log(`X-coverage: ${[...byX.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  process.exit(0);
}

// ═════════════════════════ ตัวช่วยทั่วไป ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = id.startsWith("P3.7-") ? id : `P3.7-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)?.slice(0, 120)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
/** ห่อข้อสอบหนึ่งข้อ — throw = แดงพร้อมเหตุผล (ไม่ล้มทั้งชุด) */
async function step(id: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    chk(id, false, "ไม่ throw", `harness throw: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
  }
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const ex = (p: string) => existsSync(join(ROOT, p));
const short = (v: unknown, n = 220) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : r === null ? "null" : typeof r === "string" ? "STRING" : "VALUE");
const refused = (r: Any, ...codes: string[]) => r?.ok === false && codes.includes(String(r.code));
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1]!;
  return "THROW";
}
const MISSING = "ยังไม่มีโมดูล/ฟังก์ชัน";
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { __missing: true, code: `MISSING:${name}` };
  try {
    return fn(...args);
  } catch (e) {
    return { __threw: true, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
const THAI = /[ก-๛]/;
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const PMAX = process.env.QC_ALL === "1" ? 99 : 8;
const P8 = (p: string[]) => p.slice(0, PMAX).join(" · ") + (p.length > PMAX ? ` …(+${p.length - PMAX})` : "");
const sha256 = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const CROCK12 = /^[0-9A-HJKMNP-TV-Z]{12}$/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** เวลาไทย HH:mm */
const hhmm = (d: Date | string | number): string => {
  const x = new Date(new Date(d).getTime() + 7 * 3_600_000);
  return `${String(x.getUTCHours()).padStart(2, "0")}:${String(x.getUTCMinutes()).padStart(2, "0")}`;
};
const hhmmNear = (d: Date | string | number): string[] => [-60_000, 0, 60_000].map((dx) => hhmm(new Date(d).getTime() + dx));
/** เบอร์โทรรูปแบบทั่วไป (หลังตัด URL ออก) */
const PHONE_RE = /(?<![\w/-])0\d{1,2}[-\s.]?\d{3}[-\s.]?\d{3,4}(?![\w])/;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/;
const stripUrls = (s: string) => s.replace(/https?:\/\/\S+/g, " ").replace(/\/(?:r|q)\/\S+/g, " ");

// ── ซอร์ส (สถิต) ──
function walk(dir: string, out: string[] = [], re = /\.(tsx|ts)$/): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const f of readdirSync(abs)) {
    const rel = `${dir}/${f}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out, re);
    else if (re.test(f)) out.push(rel);
  }
  return out;
}
// ตัดคอมเมนต์บรรทัดก่อนคอมเมนต์ก้อน (path ที่มี "/*" ในคอมเมนต์บรรทัดไม่เปิดก้อนยาว)
const stripComments = (s: string) => s.replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
const firstStatement = (raw: string) => raw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart();
const isUseServer = (raw: string) => /^["']use server["']/.test(firstStatement(raw));
/** โมดูลที่ไฟล์ import (static + dynamic + re-export) */
const importsOf = (src: string): string[] => {
  const s = stripComments(src);
  const out: string[] = [];
  for (const m of s.matchAll(/(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']/g)) out.push(m[1]!);
  for (const m of s.matchAll(/import\s*["']([^"']+)["']/g)) out.push(m[1]!);
  for (const m of s.matchAll(/import\(\s*["']([^"']+)["']/g)) out.push(m[1]!);
  return out;
};
const staticImportsOf = (src: string): string[] => {
  const s = stripComments(src);
  const out: string[] = [];
  for (const m of s.matchAll(/(?:^|\n)\s*(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']/g)) out.push(m[1]!);
  return out;
};
const MARK = "POS P3.7";
/** เลขบรรทัด (0-based) ที่อยู่ในรอยต่อ `// POS P3.7 ▸ … ◂` (บรรทัดเดียวหรือหลายบรรทัด) */
function markedLines(raw: string, tag = MARK): Set<number> {
  const out = new Set<number>();
  const lines = raw.split("\n");
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const starts = l.includes(`${tag} ▸`);
    if (starts) open = true;
    if (open || l.includes(tag)) out.add(i);
    if (open && l.includes("◂") && (!starts || l.lastIndexOf("◂") > l.indexOf(`${tag} ▸`))) open = false;
  }
  return out;
}
/** จำนวนบล็อกหลายบรรทัด (▸ ไม่ปิดในบรรทัดเดียวกัน) */
function multiLineBlocks(raw: string, tag = MARK): { start: number; end: number; text: string }[] {
  const lines = raw.split("\n");
  const out: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const at = l.indexOf(`${tag} ▸`);
    if (at < 0 || l.lastIndexOf("◂") > at) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j]!.includes("◂")) j++;
    out.push({ start: i, end: j, text: lines.slice(i, j + 1).join("\n") });
    i = j;
  }
  return out;
}
function flatKeys(o: unknown, pre = "", out = new Map<string, string>()): Map<string, string> {
  if (isRecord(o)) for (const [k, v] of Object.entries(o)) flatKeys(v, pre ? `${pre}.${k}` : k, out);
  else out.set(pre, String(o ?? ""));
  return out;
}
const at = (o: unknown, path: string): unknown => path.split(".").reduce<unknown>((a, k) => (isRecord(a) ? a[k] : undefined), o);

// ── git (หมุด = 72669941 · ฐานของใบ P3.7) ──
const BASE_REV = "72669941";
const P37_PIN = process.env.P37_PIN || "42b823e9"; // ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.7 CD-B5): หมุดของเลน (ฐานของผู้สร้าง S)
function gitBuf(args: string[]): Buffer | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
}
const gitStr = (args: string[]) => gitBuf(args)?.toString("utf8") ?? null;
const baseOk = () => bases().length > 0;
let basesCache: string[] | null = null;
/**
 * ฐานที่ยอมรับ (ไม่ซ้ำ · มีจริง): 72669941 (ฐานของบรีฟ) · หมุดของเลน P37_PIN (ปริยาย 42b823e9 = ฐานของผู้สร้างที่รวม P3.4/P3.5/P3.9 แล้ว) —  // ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.7 CD-B5): หมุดคงที่แทนฐานร่วมกับสาขาต้นทาง (qc-pos-p2.14 K3)
 * ผ่านเมื่อตรงฐานใดฐานหนึ่ง (ผู้สร้างอาจเริ่มจากปลาย session/pos ที่รวมใบอื่นแล้ว เช่น P3.4/P3.9 · แบบเดียวกับ qc-pos-p2.7)
 */
function bases(): string[] {
  if (basesCache) return basesCache;
  const out: string[] = [];
  const add = (r: string | null | undefined) => {
    const v = (r ?? "").trim();
    if (v && !out.includes(v)) out.push(v);
  };
  add(gitStr(["rev-parse", "--verify", "-q", `${BASE_REV}^{commit}`]));
  add(gitStr(["rev-parse", "--verify", "-q", `${P37_PIN}^{commit}`])); // ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.7 CD-B5): เดิมฐานร่วม HEAD กับ session/pos (ท้องถิ่น + origin) — ตัดทิ้ง ใช้หมุดคงที่
  basesCache = out;
  return out;
}
/** ฐานที่ใกล้ที่สุด (หมุด P37_PIN ถ้ามี ไม่งั้น 72669941) — ใช้หา "ไฟล์ที่ใบนี้เปลี่ยน" (ORACLE-EDIT P3.7 CD-B5) */
const nearBase = (): string => bases()[bases().length - 1] ?? BASE_REV;
const showAt = (path: string, rev = BASE_REV): string | null => gitStr(["show", `${rev}:${path}`]);
/** ไฟล์ตรงฐานใดฐานหนึ่งทุกไบต์ — null = ตรง · ไม่งั้นเหตุผล */
function sameAsBase(path: string): string | null {
  const raw = ex(path) ? readFileSync(join(ROOT, path)) : null;
  let why = "";
  for (const rev of bases()) {
    const b = gitBuf(["show", `${rev}:${path}`]);
    if (!raw && !b) return null;
    if (raw && b && sha256(raw) === sha256(b)) return null;
    why = !raw ? `${path} ถูกลบ` : !b ? `${path} เป็นไฟล์ใหม่ (ฐานไม่มี)` : `${path.split("/").slice(-2).join("/")} ต่างจากฐาน (${bases().map((r) => r.slice(0, 8)).join("/")})`;
  }
  return why || `${path}: ไม่มีฐานให้เทียบ`;
}
/** ไฟล์ที่เปลี่ยน (เทียบฐานที่ใกล้ที่สุด · รวมยังไม่ commit) + ไฟล์ใหม่ที่ยังไม่ track ใต้ path */
function changedFiles(path: string): string[] {
  const a = (gitStr(["diff", "--name-only", nearBase(), "--", path]) ?? "").split("\n").filter(Boolean);
  const b = (gitStr(["ls-files", "--others", "--exclude-standard", "--", path]) ?? "").split("\n").filter(Boolean);
  return [...new Set([...a, ...b])];
}
type Hunk = { oldStart: number; removed: string[]; added: { line: number; text: string }[] };
/** hunk ของ diff -U0 เทียบฐาน (เลขบรรทัดใหม่ 0-based) */
function hunksOf(path: string, rev = BASE_REV): Hunk[] | null {
  const d = gitStr(["diff", "-U0", rev, "--", path]);
  if (d === null) return null;
  const out: Hunk[] = [];
  let cur: Hunk | null = null;
  let newLine = 0;
  for (const l of d.split("\n")) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) {
      cur = { oldStart: Number(h[1]), removed: [], added: [] };
      out.push(cur);
      newLine = Number(h[2]) - 1;
      continue;
    }
    if (!cur || l.startsWith("+++") || l.startsWith("---")) continue;
    if (l.startsWith("-")) cur.removed.push(l.slice(1));
    else if (l.startsWith("+")) cur.added.push({ line: newLine++, text: l.slice(1) });
  }
  return out;
}

// ═════════════════════════ ค่าคงที่ของสัญญา (ตารางชื่อ — ledger/wo-notes/pos-P3.7-oracle.md) ═════════════════════════
const POS_DIR = "src/lib/modules/pos";
const F = {
  seam: "src/lib/modules/chat/pos-seam.ts",
  chatIndex: "src/lib/modules/chat/index.ts",
  chatService: "src/lib/modules/chat/service.ts",
  root: "src/lib/pos-chat-bridges.ts",
  receiptBridges: "src/lib/pos-receipt-bridges.ts",
  consumers: "src/lib/outbox-consumers.ts",
  shared: `${POS_DIR}/chat-link-shared.ts`,
  link: `${POS_DIR}/chat-link.ts`,
  actions: `${POS_DIR}/chat-link-actions.ts`,
  chatOrder: `${POS_DIR}/chat-order.ts`,
  order: `${POS_DIR}/order.ts`,
  posIndex: `${POS_DIR}/index.ts`,
  service: `${POS_DIR}/service.ts`,
  intent: `${POS_DIR}/payment-intent.ts`,
  heldCart: `${POS_DIR}/held-cart.ts`,
  qr: `${POS_DIR}/qr-order.ts`,
  qrDir: "src/app/(store)/q",
  qrPage: "src/app/(store)/q/[linkToken]/page.tsx",
  integrations: "src/lib/pos-integrations.ts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  fitness: "scripts/fitness.mts",
};
const SEAM_FNS = ["notifyCustomer", "botContext", "setBotPaused"] as const;
const ROOT_FNS = ["notifyCustomer", "ordersForChatCustomer", "requestChatPayment", "mintChatPreorderLink", "onSalePaidChat", "onSaleRefundedChat", "onOrderEventChat", "onIntentPaidChat", "onChatMessageReceivedBot"] as const;
/** คีย์ของ outbox-consumers.ts ที่ใบนี้แตะได้ → ตัวรับของ root ที่ต้องอยู่ในบรรทัด/ก้อนของคีย์นั้น */
const CONSUMER_WIRING: readonly [string, string][] = [
  ["pos.sale.paid", "onSalePaidChat"],
  ["pos.sale.refunded", "onSaleRefundedChat"],
  ["pos.payment.intent_paid", "onIntentPaidChat"],
  ["pos.order.accepted", "onOrderEventChat"],
  ["pos.order.ready", "onOrderEventChat"],
  ["pos.order.rejected", "onOrderEventChat"],
  ["pos.order.cancelled", "onOrderEventChat"],
  ["chat.message.received", "onChatMessageReceivedBot"],
];
const SALE_PAID_CHAIN = 'compose(compose(compose(posSalePaid, stampFromSale), memberSaleBridge("onPosSalePaid")), crmBridge("onPosSalePaid"))';
const CHAT_DEFAULTS = { receiptAuto: false, refundNotice: false, orderStatus: false, autoReply: false, statusKinds: ["accepted", "ready", "cancelled", "paid"], botPauseHours: 24 };
const TEXT_KEYS = ["accepted", "ready", "paid", "cancelled", "refundLine", "expired", "payRequest", "refundNotice", "botNotFound", "botHandoff", "botOrderLink", "botOrderClosed"] as const;
const INTENT_TABLE: readonly [string, string | null][] = [
  ["สถานะออเดอร์", "STATUS"],
  ["ออเดอร์ถึงไหนแล้วคะ", "STATUS"],
  ["order status please", "STATUS"],
  ["OD-0012", "STATUS"],
  ["ขอดูเมนูหน่อย", "ORDER"],
  ["อยากสั่งข้าวผัด", "ORDER"],
  ["menu", "ORDER"],
  ["ขอคุยกับพนักงาน", "HUMAN"],
  ["talk to staff", "HUMAN"],
  ["สวัสดีครับ", null],
  ["ขอบคุณค่ะ", null],
  ["", null],
];
const DEDUPE_LITERALS = ["pos:receipt:", "pos:refund:", "pos:order:", "pos:ordpay:", "pos:bot:"] as const;
const QUOTA_TEXT_TH = "ใช้โควตาข้อความ LINE OA ของร้าน";

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
const STATIC_IDS = ["ST1", "ST2", "ST3", "CS2"].map((x) => `P3.7-${x}`);
const skipReasons: string[] = [];
/** chat-link-shared.ts บริสุทธิ์ไหม (ไม่ import prisma/db/server/next · relative ได้เฉพาะ *-shared) — "" = ใช่ */
function sharedImpure(): string {
  const raw = rd(F.shared);
  if (!raw) return `ไม่มี ${F.shared}`;
  // นับเฉพาะ import ที่เป็นค่า (import type ไม่โหลดโมดูลตอนรัน)
  const s = stripComments(raw);
  const mods: string[] = [];
  for (const m of s.matchAll(/(?:^|\n)\s*import\s+(?!type\b)[^"'`;]*?from\s*["']([^"']+)["']/g)) mods.push(m[1]!);
  for (const m of s.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) mods.push(m[1]!);
  for (const m of s.matchAll(/(?:^|\n)\s*export\s+(?!type\b)[^"'`;]*?from\s*["']([^"']+)["']/g)) mods.push(m[1]!);
  for (const m of s.matchAll(/import\(\s*["']([^"']+)["']/g)) mods.push(m[1]!);
  const bad = mods.filter((m) => /@\/lib\/core\/db|(^|\/)db$|server-only|^next\/|@\/lib\/modules\/(?!pos\/[\w-]+-shared$)|^\.\/(?![\w-]+-shared$)|^\.\.\/|pos-chat-bridges|^@prisma\/client$/.test(m));
  return bad.map((m) => `import ${m}`).join(", ");
}

async function runStatic(): Promise<void> {
  const haveGit = baseOk();
  // ST1 ขอบเขต
  await step("ST1", () => {
    const p: string[] = [];
    if (!ex(F.seam)) p.push(`${MISSING} ${F.seam}`);
    else {
      const bad = importsOf(rd(F.seam)).filter((m) => /modules\/pos|\.\.\/pos|pos-chat-bridges|pos-receipt-bridges|@\/lib\/pos-/.test(m));
      if (bad.length) p.push(`pos-seam import POS: ${bad.join(",")}`);
    }
    if (!ex(F.root)) p.push(`${MISSING} ${F.root}`);
    else {
      const bad = importsOf(rd(F.root)).filter((m) => !/^(@\/lib\/modules\/(chat|pos|member)|@\/lib\/core\/[\w/-]+|node:[\w/]+|@prisma\/client)$/.test(m));
      if (bad.length) p.push(`root import นอกขอบเขต: ${bad.slice(0, 4).join(",")}`);
    }
    for (const f of walk(POS_DIR)) {
      const raw = rd(f);
      const s = stripComments(raw);
      const nm = f.split("/").pop();
      if (importsOf(raw).some((m) => /^@\/lib\/modules\/chat(\/|$)|^\.\.\/chat(\/|$)/.test(m))) p.push(`${nm} import แชท`);
      if (/\.(chatContact|chatMessage|chatChannelConnection)\s*\./.test(s)) p.push(`${nm} แตะ prisma ของแชทตรง`);
      if (staticImportsOf(raw).some((m) => /pos-chat-bridges/.test(m))) p.push(`${nm} import root แบบ static`);
    }
    if (haveGit) {
      for (const f of changedFiles("src").filter((x) => /\.(ts|tsx)$/.test(x) && x !== F.seam && ex(x))) {
        const s = stripComments(rd(f));
        if (/\.(chatMessage|chatConversation)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(s) || /(INSERT\s+INTO|UPDATE)\s+"Chat(Message|Conversation)"/i.test(s)) p.push(`${f.split("/").slice(-2).join("/")} เขียน ChatMessage/ChatConversation (ต้องอยู่ที่ chat/pos-seam.ts เท่านั้น)`);
      }
      const fit = sameAsBase(F.fitness);
      if (fit) p.push(`fitness.mts เปลี่ยน (${fit}) — ห้ามเพิ่มเส้น`);
    } else p.push(`อ่าน git ${BASE_REV} ไม่ได้`);
    if (ex(F.actions)) {
      const raw = rd(F.actions);
      if (!isUseServer(raw)) p.push("chat-link-actions.ts ไม่ขึ้นต้น \"use server\"");
      const s = stripComments(raw);
      const nonAsync = [...s.matchAll(/export\s+(?!async\s+function)(const|let|var|function|class|default|type\b|interface\b|enum\b|\{|\*)/g)].length;
      if (nonAsync) p.push(`chat-link-actions.ts export ที่ไม่ใช่ async function ${nonAsync}`);
    } else p.push(`${MISSING} ${F.actions}`);
    chk("ST1", p.length === 0, "รอยต่อแชท + root ตามขอบเขต · POS ไม่รู้จักแชท · ผู้เขียนข้อความแชทเดียว · ไม่มีเส้น fitness ใหม่", P8(p) || "ครบ");
  });

  // ST2 ตารางชื่อ
  await step("ST2", async () => {
    const p: string[] = [];
    // chat/index.ts บล็อก
    const ci = rd(F.chatIndex);
    const blk = multiLineBlocks(ci);
    const blockText = blk.map((b) => b.text).join("\n");
    if (!blk.length) p.push("chat/index.ts ไม่มีบล็อก POS P3.7");
    else for (const n of SEAM_FNS) if (!new RegExp(`\\b${n}\\b`).test(blockText) || !/["']\.\/pos-seam["']/.test(blockText)) p.push(`chat/index.ts บล็อกไม่ export ${n} จาก ./pos-seam`);
    const seam = stripComments(rd(F.seam));
    for (const n of SEAM_FNS) if (seam && !exportsFn(seam, n)) p.push(`pos-seam ไม่ export ${n}`);
    if (seam && !seam.includes("posBotPausedUntil")) p.push("pos-seam ไม่มีคีย์ meta posBotPausedUntil");
    for (const c of ["NO_CHAT_IDENTITY", "BLOCKED", "NO_CONNECTION", "NO_CONVERSATION", "SEND_FAILED"]) if (seam && !seam.includes(c)) p.push(`pos-seam ไม่มีรหัส ${c}`);
    // root
    const root = stripComments(rd(F.root));
    if (root) {
      for (const n of ROOT_FNS) if (!exportsFn(root, n)) p.push(`root ไม่ export ${n}`);
      for (const k of [...DEDUPE_LITERALS, "pos.receipt.auto_sent", "pos.chat.notify", "posbot:"]) if (!root.includes(k)) p.push(`root ไม่มี "${k}"`);
    }
    // outbox-consumers ผูกตัวรับ
    const cons = rd(F.consumers);
    const consLines = cons.split("\n");
    for (const [key, fn] of CONSUMER_WIRING) {
      const i = consLines.findIndex((l) => l.includes(`"${key}":`));
      if (i < 0) {
        p.push(`ไม่มีคีย์ ${key}`);
        continue;
      }
      let j = i + 1;
      while (j < consLines.length && !/^\s{2}"[\w.]+":|^\s{2}\/\/|^};/.test(consLines[j]!)) j++;
      const chunk = consLines.slice(i, key === "chat.message.received" ? j : i + 1).join("\n");
      if (!chunk.includes(fn)) p.push(`${key} ไม่เรียก ${fn}`);
    }
    if (!/import\(\s*["']@\/lib\/pos-chat-bridges["']\s*\)/.test(cons)) p.push("outbox-consumers ไม่โหลด @/lib/pos-chat-bridges แบบ dynamic");
    // order.ts
    const ord = rd(F.order);
    const ob = multiLineBlocks(ord).filter((b) => /export\s+async\s+function\s+requestChatPaymentInTx\b/.test(b.text));
    if (!ob.length) p.push("order.ts ไม่มี export requestChatPaymentInTx ในบล็อก POS P3.7");
    else if (!/payment_requested/.test(ob[0]!.text)) p.push("requestChatPaymentInTx ไม่บันทึก PosOrderEvent payment_requested");
    const co = stripComments(rd(F.chatOrder));
    if (!co) p.push(`${MISSING} ${F.chatOrder}`);
    else for (const n of ["requestChatPaymentInTx", "prepareOrderIntent", "orderIntentUnused"]) if (!new RegExp(`\\b${n}\\s*\\(`).test(co)) p.push(`chat-order.ts ไม่เรียก ${n}`);
    if (!multiLineBlocks(rd(F.posIndex)).length && !rd(F.posIndex).includes(MARK)) p.push("pos/index.ts ไม่มีรอยต่อ POS P3.7 (facade)");
    // chat-link-shared บริสุทธิ์ + พฤติกรรม
    const imp = sharedImpure();
    if (imp) p.push(`chat-link-shared: ${imp}`);
    else {
      const sh = stripComments(rd(F.shared));
      for (const n of ["posChatSettings", "matchBotIntent", "POS_CHAT_TEXTS"]) if (!exportsFn(sh, n)) p.push(`chat-link-shared ไม่ export ${n}`);
      const mod = await tryImport("@/lib/modules/pos/chat-link-shared");
      if (mod) {
        const miss: string[] = [];
        for (const [txt, want] of INTENT_TABLE) {
          const got = callSync(mod, "matchBotIntent", txt);
          const g = got === undefined ? null : got;
          if (g !== want) miss.push(`"${txt}"→${short(g, 20)} (คาด ${want})`);
        }
        if (miss.length) p.push(`matchBotIntent: ${miss.slice(0, 4).join(" · ")}`);
        const T0 = mod.POS_CHAT_TEXTS;
        if (!isRecord(T0) || !isRecord(T0.th) || !isRecord(T0.en)) p.push("POS_CHAT_TEXTS ไม่มี th/en");
        else {
          const kt = Object.keys(T0.th).sort().join(",");
          const ke = Object.keys(T0.en).sort().join(",");
          if (kt !== ke) p.push("POS_CHAT_TEXTS th/en คีย์ไม่ตรงกัน");
          for (const k of TEXT_KEYS) {
            const th = T0.th[k];
            const en = T0.en[k];
            if (typeof th !== "string" || !th.trim() || !THAI.test(th)) p.push(`th.${k} ว่าง/ไม่ใช่ไทย`);
            if (typeof en !== "string" || !en.trim() || THAI.test(en)) p.push(`en.${k} ว่าง/มีอักษรไทย`);
            for (const v of [th, en]) if (typeof v === "string" && PHONE_RE.test(stripUrls(v))) p.push(`${k} มีรูปเบอร์`);
          }
        }
      }
    }
    if (!exportsFn(stripComments(rd(F.link)), "setPosChatSettings")) p.push(`${F.link} ไม่ export setPosChatSettings`);
    const linkSrc = rd(F.link);
    if (linkSrc && !/pos\.settings\.updated|POS_SETTINGS_AUDIT/.test(linkSrc)) p.push("setPosChatSettings ไม่เขียน audit pos.settings.updated");
    // facts
    const integ = rd(F.integrations);
    if (!/\["orderStatusBot",\s*true,\s*null\]/.test(integ)) p.push(`fact orderStatusBot = ${short(/\["orderStatusBot",[^\]]*\]/.exec(integ)?.[0] ?? "ไม่มี", 50)} (คาด ["orderStatusBot", true, null])`);
    // ข้อความ
    let th: Any = null;
    let en: Any = null;
    try {
      th = JSON.parse(rd(F.msgTh) || "null");
      en = JSON.parse(rd(F.msgEn) || "null");
    } catch {
      p.push("pos.json อ่านไม่ได้");
    }
    if (th && en) {
      for (const path of ["orders.chatPay", "chat.notify", "settings.cards.CHAT"]) {
        const a = at(th, path);
        const b = at(en, path);
        if (!isRecord(a) || !isRecord(b)) {
          p.push(`ไม่มีก้อนข้อความ ${path} (th/en)`);
          continue;
        }
        const fa = flatKeys(a);
        const fb = flatKeys(b);
        if ([...fa.keys()].sort().join(",") !== [...fb.keys()].sort().join(",")) p.push(`${path} th/en คีย์ไม่ตรง`);
        if ([...fa.values()].some((v) => !v.trim())) p.push(`${path} th มีค่าว่าง`);
        if ([...fb.values()].some((v) => THAI.test(v))) p.push(`${path} en มีอักษรไทย`);
      }
      const chatCard = flatKeys(at(th, "settings.cards.CHAT") ?? {});
      if (![...chatCard.values()].some((v) => v.includes(QUOTA_TEXT_TH))) p.push(`settings.cards.CHAT (th) ไม่มี "${QUOTA_TEXT_TH}" (มติ 4)`);
      for (const k of ["noChatLink", "promptpayNotConfigured"]) if (typeof at(th, `orders.chatPay.errors.${k}`) !== "string" || typeof at(en, `orders.chatPay.errors.${k}`) !== "string") p.push(`ไม่มี orders.chatPay.errors.${k} (th/en)`);
    }
    // Q8
    const rb = rd(F.receiptBridges);
    const rbMarked = rb.split("\n").filter((_, i) => markedLines(rb).has(i)).join("\n");
    if (!/pos:issue-ack:/.test(rbMarked) || !/notifyCustomer/.test(rbMarked)) p.push("pos-receipt-bridges ไม่ส่งตอบรับผ่าน notifyCustomer คีย์ pos:issue-ack: ในรอยต่อ POS P3.7 (มติ 8)");
    // ประตู B
    const qr = rd(F.qr);
    if (!qr.includes("chatTag") || !qr.includes(MARK)) p.push("qr-order.ts ไม่รับ chatTag ในรอยต่อ POS P3.7");
    const qrAppHas = walk(F.qrDir).some((f) => rd(f).includes("chatTag"));
    if (!qrAppHas) p.push("หน้า/แอ็กชัน /q ไม่ส่ง chatTag");
    if (!rd(F.qrPage).includes(MARK)) p.push("(store)/q/[linkToken]/page.tsx ไม่มีรอยต่อ POS P3.7 (อ่าน searchParams.c)");
    chk("ST2", p.length === 0, "ตารางชื่อครบตามโน้ต", P8(p) || "ครบ");
  });

  // ST3 หมุด (PAR)
  await step("ST3", () => {
    const p: string[] = [];
    if (!baseOk()) {
      chk("ST3", false, `อ่าน git ${BASE_REV} ได้`, "ไม่มี commit ฐาน");
      return;
    }
    const pr = changedFiles("prisma");
    if (pr.length) p.push(`prisma/ เปลี่ยน: ${pr.slice(0, 3).join(",")}`);
    const posFiles = [...new Set(bases().flatMap((rev) => (gitStr(["ls-tree", "--name-only", `${rev}:${POS_DIR}/`]) ?? "").split("\n").filter(Boolean)))];
    const nowFiles = existsSync(join(ROOT, POS_DIR)) ? readdirSync(join(ROOT, POS_DIR)) : [];
    const pinned = [...new Set([...posFiles, ...nowFiles])].filter((f) => /^(register|tender|refund|receipt)[\w-]*\.tsx?$/.test(f) || f === "service.ts" || f === "payment-intent.ts" || f === "held-cart.ts").map((f) => `${POS_DIR}/${f}`);
    for (const f of [...pinned, F.chatService]) {
      const r = sameAsBase(f);
      if (r) p.push(r);
    }
    const newReceipt = nowFiles.filter((f) => /^receipt.*\.ts$/.test(f) && !posFiles.includes(f));
    if (newReceipt.length) p.push(`ไฟล์ใหม่ pos/${newReceipt.join(",")} (p2.12 ST1)`);
    // ── รอยต่อ: วิเคราะห์ต่อฐาน · ผ่านเมื่อฐานใดฐานหนึ่งไม่มีข้อผิด (รายงานฐานที่ผิดน้อยที่สุด) ──
    const perBase = bases().map((rev) => ({ rev, v: hunkViolations(rev) }));
    const best = perBase.sort((a, b) => a.v.length - b.v.length)[0];
    if (best && best.v.length) p.push(...best.v.map((x) => `[${best.rev.slice(0, 8)}] ${x}`));
    chk("ST3", p.length === 0, `หมุดเทียบ ${BASE_REV} (หรือหมุดเลน ${P37_PIN}) ครบ`, P8(p) || "ครบ (ตรงฐาน/รอยต่อเท่านั้น)");
  });
  /** ข้อผิดของรอยต่อใน outbox-consumers.ts · chat/index.ts · order.ts เทียบฐาน rev */
  function hunkViolations(rev: string): string[] {
    const p: string[] = [];
    // outbox-consumers
    const consNow = rd(F.consumers);
    const mk = markedLines(consNow);
    const hk = hunksOf(F.consumers, rev) ?? [];
    const allowedKey = (l: string) => CONSUMER_WIRING.some(([k]) => l.includes(`"${k}":`)) || /^\s*\},\s*crmBridge\("onChatMessage"\)\)\),?\s*$/.test(l);
    let paidHunks = 0;
    for (const h of hk) {
      const unmarked = h.added.filter((a) => !mk.has(a.line) && a.text.trim() !== "");
      if (unmarked.length) p.push(`outbox-consumers บรรทัดใหม่ไม่มีรอยต่อ: ${short(unmarked[0]!.text.trim(), 60)}`);
      const badRm = h.removed.filter((l) => l.trim() !== "" && !allowedKey(l));
      if (badRm.length) p.push(`outbox-consumers ลบ/แก้บรรทัดเดิม: ${short(badRm[0]!.trim(), 60)}`);
      if (h.removed.some((l) => l.includes('"pos.sale.paid":'))) {
        paidHunks++;
        if (h.removed.length !== 1 || h.added.length !== 1) p.push(`"pos.sale.paid" ไม่ใช่ 1 บรรทัดแทน 1 บรรทัด (−${h.removed.length} +${h.added.length})`);
        else if (!h.added[0]!.text.includes(SALE_PAID_CHAIN)) p.push('"pos.sale.paid" บรรทัดใหม่ไม่คงนิพจน์เดิม (ห่อชั้นนอกเท่านั้น)');
      }
    }
    if (paidHunks > 1) p.push(`"pos.sale.paid" แตะ ${paidHunks} hunk`);
    // chat/index.ts
    const ciH = hunksOf(F.chatIndex, rev) ?? [];
    if (ciH.some((h) => h.removed.some((l) => l.trim() !== ""))) p.push("chat/index.ts ลบ/แก้บรรทัดเดิม");
    const ciNow = rd(F.chatIndex);
    const ciMk = markedLines(ciNow);
    if (ciH.some((h) => h.added.some((a) => a.text.trim() !== "" && !ciMk.has(a.line)))) p.push("chat/index.ts มีบรรทัดใหม่นอกบล็อก POS P3.7");
    const ciCount = (ciNow.match(/POS P3\.7 ▸/g) ?? []).length;
    if (ciCount > 1) p.push(`chat/index.ts มีรอยต่อ POS P3.7 ${ciCount} จุด (คาด 1)`);
    // order.ts
    const ordNow = rd(F.order);
    const oMk = markedLines(ordNow);
    const oH = hunksOf(F.order, rev) ?? [];
    for (const h of oH) {
      const unmarked = h.added.filter((a) => a.text.trim() !== "" && !oMk.has(a.line));
      if (unmarked.length) p.push(`order.ts บรรทัดใหม่ไม่มีรอยต่อ: ${short(unmarked[0]!.text.trim(), 60)}`);
      if (h.removed.some((l) => l.trim() !== "") && !h.added.length) p.push("order.ts ลบบรรทัดเดิม");
    }
    const oBlocks = multiLineBlocks(ordNow).length;
    if (oBlocks > 1) p.push(`order.ts มีบล็อก POS P3.7 หลายบรรทัด ${oBlocks} ก้อน (คาด 1)`);
    return p;
  }

  // CS2 บริสุทธิ์
  await step("CS2", async () => {
    const p: string[] = [];
    const imp = sharedImpure();
    if (imp) {
      chk("CS2", false, "posChatSettings บริสุทธิ์", imp);
      return;
    }
    const mod = await tryImport("@/lib/modules/pos/chat-link-shared");
    const S0 = (v: unknown) => callSync(mod, "posChatSettings", v);
    const norm = (o: Any) => JSON.stringify(o && typeof o === "object" ? Object.fromEntries(Object.keys(CHAT_DEFAULTS).map((k) => [k, (o as Any)[k]])) : o);
    const def = JSON.stringify(CHAT_DEFAULTS);
    for (const v of [null, {}, { pos: {} }, { pos: { chat: "x" } }]) {
      const r = S0(v);
      if (r?.__missing) {
        p.push(`${MISSING} posChatSettings`);
        break;
      }
      if (norm(r) !== def) p.push(`${short(v, 30)} → ${short(r, 120)} (คาดค่าปริยาย)`);
    }
    const c = (chat: Any) => S0({ pos: { chat } });
    const cases: [Any, Partial<typeof CHAT_DEFAULTS>][] = [
      [{ receiptAuto: true, refundNotice: 1, orderStatus: "true", autoReply: true }, { receiptAuto: true, refundNotice: false, orderStatus: false, autoReply: true }],
      [{ botPauseHours: 0 }, { botPauseHours: 1 }],
      [{ botPauseHours: 100 }, { botPauseHours: 72 }],
      [{ botPauseHours: "5" }, { botPauseHours: 24 }],
      [{ botPauseHours: 6 }, { botPauseHours: 6 }],
      [{ statusKinds: ["ready", "bogus", "ready", "paid"] }, { statusKinds: ["ready", "paid"] }],
      [{ statusKinds: "ready" }, { statusKinds: CHAT_DEFAULTS.statusKinds }],
    ];
    if (!p.length)
      for (const [inp, want] of cases) {
        const r = c(inp);
        for (const [k, v] of Object.entries(want)) if (JSON.stringify(r?.[k]) !== JSON.stringify(v)) p.push(`${short(inp, 50)} → ${k}=${short(r?.[k], 40)} (คาด ${short(v, 40)})`);
      }
    const extra = c({ receiptAuto: true, secretToken: "x" });
    if (isRecord(extra) && "secretToken" in extra) p.push("คีย์แปลกหลุดออกมาในผล");
    chk("CS2", p.length === 0, "ค่าปริยาย/ตัดขอบ/กรองถูกต้อง", P8(p) || "ครบ");
  });
}

// ═════════════════════════ 1c. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อ (สถิต + บริสุทธิ์ · ไม่โหลด prisma)`);
  let crashedS = "";
  try {
    await runStatic();
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const HOST = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "?";
  }
})();
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// ═════════════════════════ 3. ด่าน SKIP + ลายนิ้วมือก่อน ═════════════════════════
for (const [f, label] of [[F.root, "src/lib/pos-chat-bridges.ts (composition root)"], [F.seam, "chat/pos-seam.ts (รอยต่อแชท)"], [F.shared, "pos/chat-link-shared.ts"], [F.link, "pos/chat-link.ts"], [F.chatOrder, "pos/chat-order.ts"]] as const) if (!ex(f)) skipReasons.push(`ยังไม่มี ${label}`);
if (!/export\s+async\s+function\s+requestChatPaymentInTx\b/.test(rd(F.order))) skipReasons.push("order.ts ยังไม่มี requestChatPaymentInTx");
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const FP_SQL: [string, string][] = [
  ["ChatMessagePos", `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."deliveryStatus"::text,''), ',' ORDER BY x.id)), '-') AS h FROM "ChatMessage" x WHERE x."clientMessageId" LIKE 'pos:%' AND NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE 'posqc-p37-%'))`],
  ["PosOrder", `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || x.version::text, ',' ORDER BY x.id)), '-') AS h FROM "PosOrder" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE 'posqc-p37-%'))`],
  ["PosPaymentIntent", `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || x.status::text, ',' ORDER BY x.id)), '-') AS h FROM "PosPaymentIntent" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE 'posqc-p37-%'))`],
];
/** ลายนิ้วมือของร้านที่ไม่ใช่ร้านชั่วคราว (ข้อมูล — lane อื่นเขียนพร้อมกันได้) */
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, sql] of FP_SQL) {
    try {
      const r = (await P.$queryRawUnsafe(sql)) as Any[];
      out[k] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      out[k] = `อ่านไม่ได้:${(e as Error).message.slice(0, 30)}`;
    }
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P3.7 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons.slice(0, 12)) console.log(`   • ${r}`);
  console.log(`   ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล ไม่ crash)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const root = ex(F.root) ? await tryImport("@/lib/pos-chat-bridges") : null;
const chatIdx = await tryImport("@/lib/modules/chat");
const chatSvc = await tryImport("@/lib/modules/chat/service");
const linkMod = ex(F.link) ? await tryImport("@/lib/modules/pos/chat-link") : null;
const sharedMod = ex(F.shared) && !sharedImpure() ? await tryImport("@/lib/modules/pos/chat-link-shared") : null;
const ord = await tryImport("@/lib/modules/pos/order");
const qr = await tryImport("@/lib/modules/pos/qr-order");
const intentMod = await tryImport("@/lib/modules/pos/payment-intent");
const register = await tryImport("@/lib/modules/pos/register");
const svc = await tryImport("@/lib/modules/pos/service");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const sendMod = await tryImport("@/lib/modules/pos/receipt-send");
const regShared = await tryImport("@/lib/modules/pos/register-shared");
const catalogMod = await tryImport("@/lib/modules/pos/catalog");
const chMod = await tryImport("@/lib/modules/pos/channel");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const sysSvc = await tryImport("@/lib/modules/system/service");
const memberIdx = await tryImport("@/lib/modules/member");
const consMod = await tryImport("@/lib/outbox-consumers");
const originMod = await tryImport("@/lib/core/origin");
let ORIGIN = "";
try {
  ORIGIN = String(await originMod?.publicOrigin?.()).replace(/\/+$/, "");
} catch (e) {
  console.log(`  ⚠️  publicOrigin() ล้มในบริบทสคริปต์: ${(e as Error).message.slice(0, 120)}`);
}
/** ฟังก์ชันของรอยต่อแชท: ผ่าน facade chat/index ก่อน (notifyCustomer ตกไปใช้ตัวที่ root re-export ได้) */
const SEAM = (n: string): Any => (typeof chatIdx?.[n] === "function" ? chatIdx : n === "notifyCustomer" && typeof root?.[n] === "function" ? root : chatIdx);

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p3.7-${RAND}`;
const T_SLUG = `posqc-p37-${RAND}`;
const T2_SLUG = `${T_SLUG}-t2`;
const EMAIL_PREFIX = `${T_SLUG}-`;
const KEY_PREFIX = `qc37-${RAND}`;
let T = "";
let T2 = "";
const RUN_START = Date.now();
const MIN = 60_000;
const HOUR = 3_600_000;
const PPID = "0105561177639";
const PHONE = "0812345678";
const PHONE_FMT = "081-234-5678";
const CUST_NAME = `คุณลูกค้า${RAND}`;
/** ห้องแชทที่รอบนี้สร้าง (ล้างถังอัตรา posbot:<conversationId>) */
const SEEN_CONVS = new Set<string>();
const SEEN_TOKENS = new Set<string>();

// ── ตัวกั้นเครือข่าย (บันทึก host + เนื้อคำขอ) ──
const realFetch = globalThis.fetch;
const guardHits: { host: string; body: string }[] = [];
function installFetchGuard() {
  globalThis.fetch = (async (input: Any, init?: Any) => {
    let host = "?";
    try {
      host = new URL(typeof input === "string" ? input : String(input?.url ?? input)).host;
    } catch {
      /* ไม่ใช่ URL */
    }
    let body = "";
    try {
      body = typeof init?.body === "string" ? init.body.slice(0, 2000) : "";
    } catch {
      /* ไม่มี */
    }
    guardHits.push({ host, body });
    return new Response(`blocked by ${SUITE}`, { status: 503 });
  }) as typeof fetch;
}
function removeFetchGuard() {
  globalThis.fetch = realFetch;
}
async function drain(): Promise<void> {
  for (let i = 0; i < 2; i++) {
    try {
      if (typeof consMod?.drainAll === "function") await consMod.drainAll();
    } catch (e) {
      console.log(`  (drainAll ล้ม: ${(e as Error).message.slice(0, 100)})`);
    }
  }
}
/** ระบายจน event ของร้านชั่วคราวที่ถึงเวลาไม่เหลือ PENDING (รวมงานพื้นหลังของ scheduleDrain) */
async function settle(maxMs = 15_000): Promise<void> {
  await drain();
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const ids = [T, T2].filter(Boolean);
    const n = ids.length ? Number(await P.outboxEvent.count({ where: { tenantId: { in: ids }, status: "PENDING", availableAt: { lte: new Date() } } }).catch(() => 0)) : 0;
    if (!n) return;
    await sleep(250);
    await drain();
  }
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ -t2) · DB ${HOST} · origin ${ORIGIN || "(ไม่มี)"} ──`);
  console.log("   สาขา A (POS · พร้อมเพย์ของสาขา · ลิงก์สั่งล่วงหน้า · CHAT/QR_ORDER/LINEMAN) · B (POS · ไม่มีพร้อมเพย์) · ระบบสมาชิก + แชท (WEBCHAT + LINE ปลอม) · T2 X (POS + แชท)");
  let fx = "";
  const soft: string[] = [];
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean> }> = {};
  const CH: Record<string, string> = {};
  const LINK: Record<string, string> = {};
  let PRD = "";
  let PRDX = "";
  try {
    T = (await P.tenant.create({ data: { name: `QC P3.7 แชท ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P3.7 ร้านที่สอง ${RAND}`, slug: T2_SLUG } })).id;
    for (const [k, tid, slug] of [["A", T, `${T_SLUG}-a`], ["B", T, `${T_SLUG}-b`], ["X", T2, `${T2_SLUG}-x`]] as const) U[k] = (await P.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: `${TAG} สาขา${k}`, slug } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", `สมาชิก ${RAND}`)).id;
    S.CHAT = (await sysSvc.createSystem(T, "CHAT", `แชท ${RAND}`)).id;
    S.POSX = (await sysSvc.createSystem(T2, "POS", `POS T2 ${RAND}`)).id;
    S.CHATX = (await sysSvc.createSystem(T2, "CHAT", `แชท T2 ${RAND}`)).id;
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.POS, U.B);
    await sysSvc.linkUnit(T, S.MEM, U.A);
    await sysSvc.linkUnit(T, S.CHAT, U.A);
    await sysSvc.linkUnit(T2, S.POSX, U.X);
    await sysSvc.linkUnit(T2, S.CHATX, U.X);
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  // ผู้ใช้ + Membership จริง
  const spec: [string, () => string, string, () => string[], Record<string, boolean>][] = [
    ["OWNER", () => T, "OWNER", () => ["*"], {}],
    ["MGR", () => T, "MANAGER", () => [U.A ?? "-", U.B ?? "-"], {}],
    ["STAFF", () => T, "STAFF", () => [U.A ?? "-", U.B ?? "-"], { "pos.sale.create": true, "pos.order.accept": true, "pos.order.reject": true, "pos.sale.read": true }],
    ["CASHIER", () => T, "STAFF", () => [U.A ?? "-"], { "pos.sale.create": true, "pos.sale.read": true }],
    ["OWNER2", () => T2, "OWNER", () => ["*"], {}],
  ];
  if (!fx) {
    try {
      for (const [k, tid, role, ua, perms] of spec) {
        const u = await P.user.create({ data: { email: `${EMAIL_PREFIX}${k.toLowerCase()}@qc.invalid`, name: `${k} คิวซี${RAND}` } });
        await P.membership.create({ data: { userId: u.id, tenantId: tid(), role, unitAccess: ua(), permissions: perms, acceptedAt: new Date() } });
        US[k] = { id: u.id, role, unitAccess: ua(), perms };
      }
    } catch (e) {
      fx = `ผู้ใช้:${(e as Error).message.slice(0, 140)}`;
    }
  }
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const cc = (k: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", actorUserId: uid(k) });
  const DEV1 = `qc37${RAND}d1`;
  const ctxU = (u: string, dev?: string): Any => ({ tenantId: u === "X" ? T2 : T, systemId: (u === "X" ? S.POSX : S.POS) ?? "none", unitId: U[u] ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? r?.reason ?? "", 80)}`);
    return r;
  };
  let keyN = 0;
  const newKey = (pfx = "k") => `${KEY_PREFIX}-${pfx}-${++keyN}`;
  let ipN = 0;
  const freshIp = () => `qc-p37-${RAND}-ip${++ipN}`;

  // ─── ค่าตั้ง POS (พร้อมเพย์ของสาขา A + ร้าน T2 · QR 20 นาที · Beam ปิด) ───
  const posSettings = async (sysId: string): Promise<Any> => {
    const sys = await P.appSystem.findUnique({ where: { id: sysId }, select: { settings: true } });
    return isRecord(sys?.settings) ? sys.settings : {};
  };
  const patchPos = async (sysId: string, key: string, patch: Any): Promise<void> => {
    const base = await posSettings(sysId);
    const pos = isRecord(base.pos) ? { ...base.pos } : {};
    pos[key] = { ...(isRecord(pos[key]) ? pos[key] : {}), ...patch };
    await P.appSystem.update({ where: { id: sysId }, data: { settings: { ...base, pos } } });
  };
  /** สลับสวิตช์ (fixture — CS3 ทดสอบตัวเขียนจริง) */
  const setChat = (patch: Any) => (S.POS ? patchPos(S.POS, "chat", patch) : Promise.resolve());
  if (!fx) {
    try {
      await patchPos(S.POS, "payment", { qrExpiryMinutes: 20, beam: { enabled: false }, manualConfirmRequiresManager: false, promptpayIdByUnit: { [U.A!]: PPID } });
      await patchPos(S.POSX, "payment", { qrExpiryMinutes: 20, beam: { enabled: false }, promptpayIdByUnit: { [U.X!]: PPID } });
    } catch (e) {
      fx = `ค่าตั้ง POS:${(e as Error).message.slice(0, 120)}`;
    }
  }
  // ─── ช่องทาง + สินค้า + ลิงก์ ───
  if (!fx) {
    try {
      for (const u of ["A", "B", "X"]) {
        const r = await call(chMod, "ensureUnitChannels", P, { tenantId: u === "X" ? T2 : T, systemId: u === "X" ? S.POSX : S.POS, unitId: U[u] });
        if (!Array.isArray(r)) throw new Error(`ensureUnitChannels ${u}: ${codeOf(r)}`);
        for (const c of r as Any[]) CH[`${c.code}_${u}`] = c.id;
      }
      const lm = must("saveChannel LINEMAN", await call(chMod, "saveChannel", ctxU("A"), A("OWNER"), { code: "LINEMAN", name: `LINE MAN ${RAND}`, commissionBp: 3000 }));
      CH.LM = String(lm.channel?.id ?? "");
      PRD = String((await call(catalogMod, "createProduct", cc("OWNER"), { name: `ข้าวผัด ${RAND}`, kind: "MENU", basePriceSatang: 8000 }))?.id ?? "");
      PRDX = String((await call(catalogMod, "createProduct", { tenantId: T2, systemId: S.POSX, actorUserId: uid("OWNER2") }, { name: `ข้าวผัด T2 ${RAND}`, kind: "MENU", basePriceSatang: 8000 }))?.id ?? "");
      if (!PRD || !PRDX) throw new Error("createProduct ไม่ได้ id");
      for (const [u, actor] of [["A", "OWNER"], ["X", "OWNER2"]] as const) {
        const r = await call(ord, "createOrderLink", ctxU(u), A(actor), {});
        LINK[u] = r?.ok === true ? String(r.link?.token ?? "") : "";
        if (LINK[u]) SEEN_TOKENS.add(LINK[u]!);
        else soft.push(`createOrderLink ${u}: ${codeOf(r)}`);
      }
    } catch (e) {
      fx = `ช่องทาง/สินค้า:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── เครื่อง + กะ (สาขา A) ───
  if (!fx) {
    const rg = await call(devMod, "registerDevice", ctxU("A"), A("OWNER"), { name: "เคาน์เตอร์ QC P3.7", deviceCode: DEV1 });
    if (rg?.ok !== true) console.log(`  ⚠️  registerDevice: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    const o = await call(shiftMod, "openShift", ctxU("A", DEV1), A("OWNER"), { deviceId: DEV1, deviceLabel: "เคาน์เตอร์ QC P3.7", floatSatang: 0 });
    if (o?.ok !== true) fx = `เปิดกะ: ${codeOf(o)} ${short(o?.message ?? "", 80)}`;
  }
  // ─── สมาชิก M1 (LINE · ยินยอมไม่ระบุ) · M2 (ถอนความยินยอม LINE) · M3 (ผู้ติดต่อถูกบล็อก) · M4 (ไม่มี LINE · ผูกห้อง webchat ใน AR8) ───
  type Mem = { id: string; name: string; phone: string; partyId: string; lineUid: string; contactId: string; convId: string };
  const M: Record<string, Mem> = {};
  let LINEC = "";
  let WEB: Any = null;
  let WEBX: Any = null;
  if (!fx) {
    try {
      await chatSvc.setMemberSystem(T, S.CHAT, S.MEM);
      WEB = await chatSvc.ensureWebchatConnection(T, S.CHAT);
      WEB = await P.chatChannelConnection.update({ where: { id: WEB.id }, data: { defaultUnitId: U.A } });
      WEBX = await chatSvc.ensureWebchatConnection(T2, S.CHATX);
      WEBX = await P.chatChannelConnection.update({ where: { id: WEBX.id }, data: { defaultUnitId: U.X } });
      // LINE ปลอม: credentials เป็นอ็อบเจกต์ (decryptCreds รับแบบ dev/seed) · ไม่มีโทเคนจริง · เริ่ม DISABLED
      LINEC = (await P.chatChannelConnection.create({ data: { tenantId: T, systemId: S.CHAT, type: "LINE", displayName: `LINE QC ${RAND}`, externalAccountId: `Uqc37bot${RAND}`, credentials: { channelAccessToken: `qc-p37-fake-${RAND}`, channelSecret: "qc" }, defaultUnitId: U.A, status: "DISABLED" } })).id;
      for (const k of ["M1", "M2", "M3", "M4"]) {
        const name = `สมใจ ${k} แชท${RAND}`;
        const phone = `089${k.slice(1)}${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
        const c = await memberIdx.findOrCreate({ tenantId: T, memberSystemId: S.MEM, phone, name, source: "STAFF" });
        M[k] = { id: c.id, name, phone, partyId: String(c.partyId ?? ""), lineUid: "", contactId: "", convId: "" };
        if (k === "M4") continue;
        const lineUid = `Uqc37${RAND}${k.toLowerCase()}line`;
        const ct = await P.chatContact.create({ data: { tenantId: T, systemId: S.CHAT, channel: "LINE", channelConnectionId: LINEC, externalUserId: lineUid, displayName: name, customerId: c.id, partyId: c.partyId ?? null, blockedAt: k === "M3" ? new Date() : null } });
        const cv = await P.chatConversation.create({ data: { tenantId: T, systemId: S.CHAT, channel: "LINE", channelConnectionId: LINEC, contactId: ct.id, unitId: U.A, status: "OPEN", lastMessageAt: new Date(Date.now() - HOUR), lastMessageDirection: "IN" } });
        M[k] = { ...M[k]!, lineUid, contactId: ct.id, convId: cv.id };
        SEEN_CONVS.add(cv.id);
      }
      if (!M.M1!.partyId) soft.push("M1 ไม่มี partyId (findOrCreate)");
      const consent = await call(memberIdx, "setConsent", { tenantId: T, systemId: S.MEM, actorUserId: uid("OWNER") }, A("OWNER"), M.M2!.id, { channel: "LINE", granted: false, source: "STAFF" });
      if (consent?.ok === false) {
        soft.push(`setConsent M2: ${codeOf(consent)} → ใช้แถวตรง`);
        await P.memberConsent.create({ data: { tenantId: T, customerId: M.M2!.id, channel: "LINE", granted: false, source: "STAFF", revokedAt: new Date() } });
      }
    } catch (e) {
      fx = `สมาชิก/แชท:${(e as Error).message.slice(0, 160)}`;
    }
  }
  if (fx) console.log(`  ⚠️  fixture: ${fx}`);
  if (soft.length) console.log(`  ℹ️  fixture อ่อน: ${soft.join(" · ")}`);
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NEED = (...xs: [unknown, string][]) => xs.filter(([v]) => !v).map(([, l]) => `${MISSING} ${l} · `).join("");
  const NR = () => NEED([root, "src/lib/pos-chat-bridges.ts"]);
  const why = (p: string[], extra = "") => FX(extra + (P8(p) || "ครบ"));

  // ─── ตัวช่วย ───
  const lineConn = async (status: "CONNECTED" | "DISABLED") => (LINEC ? chatSvc.setConnectionStatus(T, LINEC, status) : undefined);
  const obx = async (type: string, tid = T): Promise<Any[]> => ((await P.outboxEvent.findMany({ where: { tenantId: tid, type }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]);
  const evtOf = async (type: string, pred: (e: Any) => boolean): Promise<Any> => (await obx(type)).find(pred) ?? null;
  const posMsgs = async (where: Any = {}): Promise<Any[]> => ((await P.chatMessage.findMany({ where: { tenantId: T, clientMessageId: { startsWith: "pos:" }, ...where }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]);
  const msgsByKey = async (prefix: string): Promise<Any[]> => posMsgs({ clientMessageId: { startsWith: prefix } });
  const allPosMsgCount = async (): Promise<number> => Number(await P.chatMessage.count({ where: { tenantId: T, clientMessageId: { startsWith: "pos:" } } }).catch(() => -1));
  const sentCap: Any[] = [];
  const capSend = async (m: Any) => {
    sentCap.push({ ...(isRecord(m) ? m : { m }) });
    return { externalMessageId: `qc37-${RAND}-${sentCap.length}` };
  };
  const spyCalls: Any[] = [];
  const spyNotify = async (input: Any) => {
    spyCalls.push(input);
    return { ok: true, duplicated: false };
  };
  const RC = (fn: string, evt: Any, deps?: Any) => call(root, fn, evt, ...(deps ? [deps] : []));
  const saleRow = async (id: string): Promise<Any> => (id ? P.posSale.findUnique({ where: { id }, include: { payments: true } }).catch(() => null) : null);
  const orderRow = async (id: string): Promise<Any> => (id ? P.posOrder.findUnique({ where: { id } }).catch(() => null) : null);
  const intentsOf = async (orderId: string): Promise<Any[]> => (orderId ? ((await P.posPaymentIntent.findMany({ where: { tenantId: T, orderId } }).catch(() => [])) as Any[]) : []);
  const evsOf = async (orderId: string, type?: string): Promise<Any[]> => (orderId ? ((await P.posOrderEvent.findMany({ where: { tenantId: T, orderId, ...(type ? { type } : {}) } }).catch(() => [])) as Any[]) : []);
  const auditOf = async (action: string, targetId?: string): Promise<Any[]> => ((await P.auditLog.findMany({ where: { tenantId: T, action, ...(targetId ? { targetId } : {}) } }).catch(() => [])) as Any[]);
  const ORIG = (path: string) => (ORIGIN ? `${ORIGIN}${path}` : path);
  const urlOk = (body: string, path: string) => (ORIGIN ? body.includes(`${ORIGIN}${path}`) : body.includes(path));
  const money = (s: number): string => String(callSync(regShared, "moneyText", s));
  const replay = async (type: string, ev: Any, n = 2, parallel = 0): Promise<string> => {
    const h = consMod?.consumers?.[type];
    if (!ev || typeof h !== "function") return `ไม่มี event/consumer ${type} ให้เล่นซ้ำ`;
    try {
      for (let i = 0; i < n; i++) await h(ev);
      if (parallel) await Promise.all(Array.from({ length: parallel }, () => h(ev)));
    } catch (e) {
      return `เล่นซ้ำ ${type} throw ${(e as Error).message.slice(0, 60)}`;
    }
    return "";
  };
  /** ขายที่หน้าขาย (บรรทัดกำหนดเอง · เงินสด) */
  const sell = async (label: string, memberId?: string, price = 5000): Promise<{ id: string; receiptNo: string; grand: number; lineId: string; err: string }> => {
    if (fx) return { id: "", receiptNo: "", grand: 0, lineId: "", err: "fixture" };
    const c = ctxU("A", DEV1);
    const cart: Any = { lines: [{ name: `ของ ${label} ${RAND}`, qty: 1, unitPriceSatang: price }], ...(memberId ? { memberId } : {}) };
    const q = await call(register, "quoteRegisterCart", c, A("OWNER"), cart);
    if (q?.ok !== true) return { id: "", receiptNo: "", grand: 0, lineId: "", err: `quote ${codeOf(q)} ${short(q?.message ?? "", 60)}` };
    const grand = Number(q.grandTotalSatang);
    const r = await call(register, "submitRegisterSale", c, A("OWNER"), { ...cart, idempotencyKey: newKey(`s-${label}`), expectedGrandTotalSatang: grand, payMethods: [{ type: "CASH", amountSatang: grand }], cashReceivedSatang: grand });
    if (r?.ok !== true) return { id: "", receiptNo: "", grand, lineId: "", err: `submit ${codeOf(r)} ${short(r?.message ?? "", 60)}` };
    const row = await saleRow(String(r.saleId));
    const line = (await P.posSaleLine.findFirst({ where: { saleId: String(r.saleId) } }).catch(() => null)) as Any;
    return { id: String(r.saleId), receiptNo: String(row?.receiptNo ?? r.receiptNo ?? ""), grand, lineId: String(line?.id ?? ""), err: "" };
  };
  /** ออเดอร์ที่พนักงานคีย์ (CHAT ปริยาย · NEW · UNPAID) */
  const keyOrder = async (o: { conv?: string | null; unit?: string; channelCode?: string; channelId?: string; start?: "NEW" | "ACCEPTED"; memberId?: string } = {}): Promise<Any> => {
    const unit = o.unit ?? "A";
    const ch = o.channelId ? { channelId: o.channelId } : { channelCode: o.channelCode ?? "CHAT" };
    const isPlatform = !!o.channelId && o.channelId === CH.LM;
    const input: Any = {
      ...ch,
      ...(isPlatform ? { externalRef: `LM-${RAND}-${++keyN}` } : {}),
      idempotencyKey: newKey("o"),
      lines: [{ productId: PRD, qty: 1 }],
      customer: { name: CUST_NAME, phone: PHONE_FMT, ...(o.memberId ? { memberId: o.memberId } : {}) },
      fulfilment: "PICKUP",
      startStatus: o.start ?? "NEW",
      ...(isPlatform ? {} : { paymentState: "UNPAID" }),
      ...(o.conv ? { chatConversationId: o.conv } : {}),
    };
    const r = await call(ord, "ingestOrder", ctxU(unit, unit === "A" ? DEV1 : undefined), A("OWNER"), input);
    return r?.ok === true ? { r, row: await orderRow(String(r.orderId)) } : { r, row: null };
  };
  const OFAIL = (x: Any) => (x?.row ? "" : `ingestOrder → ${codeOf(x?.r)} ${short(x?.r?.message ?? "", 60)} · `);
  type Conv = { id: string; guest: string; label: string };
  let convN = 0;
  /** ห้อง WEBCHAT ใหม่ (ข้อความแรกเป็นคำทักที่ไม่ตรงกฎใด) — ระบายจนเสร็จก่อนคืน */
  const newConv = async (label: string, conn: Any = WEB, body = "สวัสดีค่ะ"): Promise<Conv> => {
    const guest = `qc37${RAND}g${++convN}${label}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
    if (!conn) return { id: "", guest, label };
    const r = await chatSvc.receiveWebchatInbound({ connection: conn, guestToken: guest, body, displayName: `ลูกค้า ${label}` });
    const id = String(r?.conversationId ?? "");
    if (id) SEEN_CONVS.add(id);
    await settle();
    return { id, guest, label };
  };
  /** ข้อความเข้าในห้องเดิม → คืน id ข้อความเข้า */
  const say = async (c: Conv, body: string, conn: Any = WEB, doSettle = true): Promise<string> => {
    if (!c.id || !conn) return "";
    await chatSvc.receiveWebchatInbound({ connection: conn, guestToken: c.guest, body });
    if (doSettle) await settle();
    const m = (await P.chatMessage.findFirst({ where: { conversationId: c.id, direction: "IN" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }).catch(() => null)) as Any;
    return String(m?.id ?? "");
  };
  const botsOf = async (convId: string): Promise<Any[]> => (convId ? posMsgs({ conversationId: convId, clientMessageId: { startsWith: "pos:bot:" } }) : []);
  const chatEvtOf = async (inboundId: string): Promise<Any> => (inboundId ? ((await P.outboxEvent.findFirst({ where: { tenantId: T, idempotencyKey: `chat.msg.${inboundId}` } }).catch(() => null)) as Any) : null);
  const confirm = (intentId: string) => call(intentMod, "confirmPaymentIntentManual", ctxU("A", DEV1), A("OWNER"), { intentId });
  const reqPay = (orderId: string, actor = "STAFF", unit = "A") => call(root, "requestChatPayment", ctxU(unit, unit === "A" ? DEV1 : undefined), A(actor), { orderId });
  const accept = (id: string, actor = "STAFF") => call(ord, "acceptOrder", ctxU("A", DEV1), A(actor), { id });
  const payOrder = async (o: Any) => call(ord, "payOrder", ctxU("A", DEV1), A("OWNER"), { id: o.id, idempotencyKey: newKey("pay"), payMethods: [{ type: "CASH", amountSatang: o.totalSatang }], cashReceivedSatang: o.totalSatang });
  let MSG_TH: Any = null;
  let MSG_EN: Any = null;
  try {
    MSG_TH = JSON.parse(rd(F.msgTh));
    MSG_EN = JSON.parse(rd(F.msgEn));
  } catch {
    /* ST2 รายงานแล้ว */
  }
  const msgKeyBad = (r: Any): string => {
    const k = typeof r?.messageKey === "string" ? r.messageKey : "";
    if (!k) return `${codeOf(r)} ไม่มี messageKey`;
    return typeof at(MSG_TH, k) === "string" && typeof at(MSG_EN, k) === "string" ? "" : `messageKey ${k} ไม่มีใน th/en`;
  };
  const pick = <K extends string>(o: Any, ks: readonly K[]): string => JSON.stringify(ks.map((k) => o?.[k] instanceof Date ? o[k].toISOString() : o?.[k] ?? null));

  // ════════ CS ค่าตั้ง ════════
  await step("CS1", async () => {
    const p: string[] = [];
    // ไม่ตั้งสวิตช์ = ค่าปริยาย (ไม่มีก้อน chat)
    if (S.POS) {
      const base = await posSettings(S.POS);
      if (isRecord(base.pos)) {
        const { chat: _c, ...rest } = base.pos as Any;
        await P.appSystem.update({ where: { id: S.POS }, data: { settings: { ...base, pos: rest } } });
      }
    }
    await lineConn("CONNECTED");
    const m0 = await allPosMsgCount();
    const b = await sell("cs1", M.M1?.id);
    if (b.err) p.push(`บิล ${b.err}`);
    const cv = await newConv("cs1");
    const o = await keyOrder({ conv: cv.id });
    if (!o.row) p.push(OFAIL(o));
    else {
      const a = await accept(o.row.id);
      if (a?.ok !== true) p.push(`accept ${codeOf(a)}`);
      const mp = await call(ord, "markPreparing", ctxU("A", DEV1), A("STAFF"), { id: o.row.id });
      if (mp?.ok !== true) p.push(`markPreparing ${codeOf(mp)}`);
      const r = await call(ord, "markReady", ctxU("A", DEV1), A("STAFF"), { id: o.row.id });
      if (r?.ok !== true) p.push(`markReady ${codeOf(r)}`);
    }
    const inb = await say(cv, "สถานะออเดอร์");
    await settle();
    const m1 = await allPosMsgCount();
    if (m1 !== m0) p.push(`ChatMessage pos:* ${m0}→${m1} (คาด 0 เพิ่ม)`);
    if (sentCap.length) p.push(`ตัวส่งถูกเรียก ${sentCap.length}`);
    // สปาย: ตัวรับของ root ถูกเรียกตรง
    const evs: [string, Any][] = [
      ["onSalePaidChat", await evtOf("pos.sale.paid", (e) => e.payload?.saleId === b.id)],
      ["onOrderEventChat", o.row ? await evtOf("pos.order.accepted", (e) => e.payload?.orderId === o.row.id) : null],
      ["onOrderEventChat", o.row ? await evtOf("pos.order.ready", (e) => e.payload?.orderId === o.row.id) : null],
      ["onChatMessageReceivedBot", await chatEvtOf(inb)],
    ];
    for (const [fn, ev] of evs) {
      if (!ev) {
        p.push(`ไม่มี event ของ ${fn}`);
        continue;
      }
      const r = await RC(fn, ev, { notify: spyNotify, send: capSend });
      if (r?.missing || r?.threw) p.push(`${fn} → ${codeOf(r)}`);
    }
    if (spyCalls.length) p.push(`สปาย notify ถูกเรียก ${spyCalls.length} ครั้ง (คาด 0 · สวิตช์ปิด)`);
    if (sentCap.length) p.push(`ตัวส่งถูกเรียก ${sentCap.length} (คาด 0)`);
    if ((await allPosMsgCount()) !== m0) p.push("เรียกตรงแล้วมีแถว pos:*");
    await lineConn("DISABLED");
    chk("CS1", !fx && !NR() && p.length === 0, "สวิตช์ปิด = ไม่มีข้อความ · ไม่เรียกรอยต่อ", why(p, NR()));
  });

  await step("CS3", async () => {
    const p: string[] = [];
    const ctx = { tenantId: T, systemId: S.POS };
    const chatNow = async () => (await posSettings(S.POS)).pos?.chat ?? null;
    const payNow = async () => JSON.stringify((await posSettings(S.POS)).pos?.payment ?? null);
    const pay0 = await payNow();
    const a0 = (await auditOf("pos.settings.updated")).length;
    const c0 = JSON.stringify(await chatNow());
    for (const k of ["STAFF", "MGR"]) {
      const r = await call(linkMod, "setPosChatSettings", ctx, A(k), { receiptAuto: true });
      if (!refused(r, "PERMISSION_DENIED")) p.push(`${k} → ${codeOf(r)} (คาด PERMISSION_DENIED)`);
    }
    for (const bad of [{ foo: 1 }, { botPauseHours: 0 }, { botPauseHours: 73 }, { botPauseHours: "5" }, { statusKinds: ["bogus"] }, { receiptAuto: "yes" }]) {
      const r = await call(linkMod, "setPosChatSettings", ctx, A("OWNER"), bad);
      if (!refused(r, "VALIDATION")) p.push(`${short(bad, 30)} → ${codeOf(r)} (คาด VALIDATION)`);
    }
    if (JSON.stringify(await chatNow()) !== c0) p.push("ปฏิเสธแล้วยังเขียนค่าตั้ง");
    const ok = await call(linkMod, "setPosChatSettings", ctx, A("OWNER"), { receiptAuto: true, botPauseHours: 12 });
    const st = await chatNow();
    if (ok?.ok !== true) p.push(`OWNER → ${codeOf(ok)} ${short(ok?.message ?? "", 60)}`);
    else {
      if (st?.receiptAuto !== true || st?.botPauseHours !== 12) p.push(`เก็บค่า ${short(st, 80)}`);
      if ((await auditOf("pos.settings.updated")).length !== a0 + 1) p.push(`audit pos.settings.updated ${(await auditOf("pos.settings.updated")).length - a0} (คาด +1)`);
    }
    if ((await payNow()) !== pay0) p.push("settings.pos.payment ถูกแก้");
    const back = await call(linkMod, "setPosChatSettings", ctx, A("OWNER"), { receiptAuto: false });
    if (back?.ok !== true) p.push(`คืนค่า → ${codeOf(back)}`);
    await setChat({ ...CHAT_DEFAULTS });
    chk("CS3", !fx && !NEED([linkMod, F.link]) && p.length === 0, "OWNER เท่านั้น · ตรวจค่า · audit", why(p, NEED([linkMod, F.link])));
  });

  await step("CS4", async () => {
    const p: string[] = [];
    const x0 = JSON.stringify(await posSettings(S.POSX));
    const r = await call(linkMod, "setPosChatSettings", { tenantId: T, systemId: S.POSX }, A("OWNER"), { receiptAuto: true });
    if (!refused(r, "NOT_FOUND")) p.push(`ระบบ POS ของ T2 → ${codeOf(r)} (คาด NOT_FOUND)`);
    if (JSON.stringify(await posSettings(S.POSX)) !== x0) p.push("ค่าตั้งของ T2 เปลี่ยน");
    chk("CS4", !fx && !NEED([linkMod, F.link]) && p.length === 0, "ระบบของร้านอื่น = NOT_FOUND ไม่เขียน", why(p, NEED([linkMod, F.link])));
  });

  // ════════ RC ใบเสร็จอัตโนมัติ ════════
  // บิลทั้งหมดเกิดตอนสวิตช์ปิด + ระบายจน DONE แล้วจึงเปิด (ตัวรับในคิวไม่วิ่งเส้น LINE) — เส้น LINE ทดสอบผ่านการเรียกตรงพร้อมตัวส่งที่ฉีด
  await setChat({ receiptAuto: false, refundNotice: false, orderStatus: false, autoReply: false });
  const bM1 = await sell("rc-m1", M.M1?.id, 13500);
  const bM2 = await sell("rc-m2", M.M2?.id);
  const bM3 = await sell("rc-m3", M.M3?.id);
  const bW = await sell("rc-walkin");
  const bNC = await sell("rc-noconn", M.M1?.id, 4200);
  const bV = await sell("rc-void", M.M1?.id, 4500);
  const bR = await sell("rc-refund", M.M1?.id, 17500);
  for (const b of [bM1, bM2, bM3, bW, bNC, bV, bR]) if (b.err) console.log(`  ⚠️  บิล: ${b.err}`);
  await settle();
  let voidErr = "";
  if (bV.id) {
    const r = await call(svc, "voidSale", T, U.A, bV.id);
    if (r?.ok === false) voidErr = `voidSale ${codeOf(r)}`;
  }
  let refundId = "";
  let refundGrand = 0;
  if (bR.id && bR.lineId) {
    const r = await call(refundMod, "refundSale", ctxU("A", DEV1), A("OWNER"), { saleId: bR.id, lines: [{ lineId: bR.lineId, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: bR.grand }], reasonCode: "CHANGED_MIND", reason: "ลูกค้าเปลี่ยนใจ", idempotencyKey: newKey("rf") });
    if (r?.ok === true) {
      refundId = String(r.refund?.id ?? "");
      refundGrand = Number(r.refund?.grandTotalSatang ?? 0);
    } else console.log(`  ⚠️  refundSale: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
  }
  await settle();
  await setChat({ receiptAuto: true, refundNotice: true });
  await lineConn("CONNECTED");
  const paidEvt = async (saleId: string) => (saleId ? evtOf("pos.sale.paid", (e) => e.payload?.saleId === saleId) : null);
  const receiptRows = async (saleId: string) => (saleId ? msgsByKey(`pos:receipt:${saleId}`) : []);

  await step("RC1", async () => {
    const p: string[] = [];
    const ev = await paidEvt(bM1.id);
    if (bM1.err || !ev) p.push(`บิล M1 ${bM1.err || "ไม่มี event"}`);
    else {
      const conv0 = await P.chatConversation.findUnique({ where: { id: M.M1!.convId } });
      const n0 = sentCap.length;
      const r = await RC("onSalePaidChat", ev, { send: capSend });
      if (r?.missing || r?.threw) p.push(`onSalePaidChat → ${codeOf(r)}`);
      const rows = await receiptRows(bM1.id);
      const sale = await saleRow(bM1.id);
      const url = ORIG(`/r/${sale?.publicToken ?? "?"}`);
      const want = String(callSync(sendMod, "receiptLineText", sale?.receiptNo ?? bM1.receiptNo, Number(sale?.grandTotalSatang ?? 0) - Number(sale?.refundedSatang ?? 0), url));
      if (rows.length !== 1) p.push(`แถวใบเสร็จ ${rows.length} (คาด 1)`);
      const m = rows[0];
      if (m) {
        if (m.conversationId !== M.M1!.convId) p.push("ไม่ใช่ห้อง LINE ของ M1");
        if (m.direction !== "OUT" || m.senderUserId !== null || m.type !== "TEXT") p.push(`แถว ${short([m.direction, m.senderUserId, m.type], 50)}`);
        if (m.body !== want) p.push(`body ${short(m.body, 90)} (คาด ${short(want, 90)})`);
        if (m.deliveryStatus !== "SENT") p.push(`deliveryStatus ${m.deliveryStatus}`);
        if (!isRecord(m.meta) || m.meta.source !== "pos") p.push(`meta ${short(m.meta, 60)}`);
      }
      const caps = sentCap.slice(n0);
      if (caps.length !== 1) p.push(`ตัวส่ง ${caps.length} ครั้ง (คาด 1)`);
      else if (caps[0].externalUserId !== M.M1!.lineUid || caps[0].text !== want) p.push(`ตัวส่งได้ ${short({ u: caps[0].externalUserId, t: caps[0].text }, 120)}`);
      const conv1 = await P.chatConversation.findUnique({ where: { id: M.M1!.convId } });
      const keys = ["status", "staffUnreadCount", "firstResponseAt", "assigneeUserId"] as const;
      if (pick(conv0, keys) !== pick(conv1, keys)) p.push(`ห้องเปลี่ยน ${pick(conv0, keys)}→${pick(conv1, keys)}`);
      if (conv1?.lastMessageDirection !== "OUT") p.push(`lastMessageDirection ${conv1?.lastMessageDirection}`);
      const au = await auditOf("pos.receipt.auto_sent", bM1.id);
      if (au.length !== 1 || au[0]?.actorType !== "SYSTEM" || au[0]?.targetType !== "PosSale" || au[0]?.after?.to !== "LINE:member") p.push(`audit auto_sent ${au.length} ${short(au[0]?.after, 60)}`);
    }
    chk("RC1", !fx && !NR() && p.length === 0, "ใบเสร็จอัตโนมัติ 1 แถว · ตัวส่ง 1 · audit", why(p, NR()));
  });

  await step("RC2", async () => {
    const p: string[] = [];
    const ev = await paidEvt(bM1.id);
    const n0 = sentCap.length;
    const g0 = guardHits.length;
    if (!ev) p.push("ไม่มี event");
    else {
      for (let i = 0; i < 2; i++) await RC("onSalePaidChat", ev, { send: capSend });
      const rp = await replay("pos.sale.paid", ev, 2, 2);
      if (rp) p.push(rp);
      await Promise.all([RC("onSalePaidChat", ev, { send: capSend }), RC("onSalePaidChat", ev, { send: capSend })]);
      const rows = await receiptRows(bM1.id);
      if (rows.length !== 1) p.push(`แถว ${rows.length} (คาด 1)`);
      if (sentCap.length !== n0) p.push(`ตัวส่งถูกเรียกเพิ่ม ${sentCap.length - n0}`);
      if ((await auditOf("pos.receipt.auto_sent", bM1.id)).length !== 1) p.push("audit auto_sent ไม่ใช่ 1");
      const leaked = guardHits.slice(g0).filter((h) => bM1.receiptNo && h.body.includes(bM1.receiptNo));
      if (leaked.length) p.push(`คำขอเครือข่ายที่มีเลขบิล ${leaked.length} (${leaked[0]!.host})`);
    }
    chk("RC2", !fx && !NR() && p.length === 0, "at-most-once: 1 แถว · ส่ง 1", why(p, NR()));
  });

  await step("RC3", async () => {
    const p: string[] = [];
    const n0 = sentCap.length;
    for (const [lbl, b] of [["M2", bM2], ["M3", bM3], ["walk-in", bW]] as const) {
      const ev = await paidEvt(b.id);
      if (!ev) {
        p.push(`${lbl} ไม่มีบิล/event ${b.err}`);
        continue;
      }
      const r = await RC("onSalePaidChat", ev, { send: capSend });
      if (r?.missing || r?.threw) p.push(`${lbl} → ${codeOf(r)}`);
      const rp = await replay("pos.sale.paid", ev, 1);
      if (rp) p.push(`${lbl} ${rp}`);
      if ((await receiptRows(b.id)).length) p.push(`${lbl} มีแถวใบเสร็จ`);
    }
    if (sentCap.length !== n0) p.push(`ตัวส่ง ${sentCap.length - n0} (คาด 0)`);
    chk("RC3", !fx && !NR() && p.length === 0, "ถอนยินยอม/บล็อก/walk-in = ไม่ส่ง", why(p, NR()));
  });

  await step("RC4", async () => {
    const p: string[] = [];
    await lineConn("DISABLED");
    const ev = await paidEvt(bNC.id);
    const n0 = sentCap.length;
    const s0 = await saleRow(bNC.id);
    if (!ev) p.push(`ไม่มีบิล/event ${bNC.err}`);
    else {
      const r = await RC("onSalePaidChat", ev, { send: capSend });
      if (r?.missing || r?.threw) p.push(`onSalePaidChat → ${codeOf(r)}`);
      if ((await receiptRows(bNC.id)).length) p.push("มีแถวทั้งที่ไม่มีการเชื่อมต่อ");
      if (sentCap.length !== n0) p.push("ตัวส่งถูกเรียก");
      const ops = ((await P.opsEvent.findMany({ where: { tenantId: T, createdAt: { gte: new Date(RUN_START - MIN) } } }).catch(() => [])) as Any[]).filter((o) => [o.source, o.message, o.detail].join(" ").includes("pos.chat.notify"));
      const hit = ops.filter((o) => [o.message, o.detail].join(" ").includes("NO_CONNECTION"));
      if (!hit.length) p.push(`OpsEvent pos.chat.notify NO_CONNECTION 0 (มี pos.chat.notify ${ops.length})`);
      else {
        if (hit.some((o) => o.level !== "WARN")) p.push(`ระดับ ${hit.map((o) => o.level).join(",")}`);
        const txt = hit.map((o) => [o.message, o.detail].join(" ")).join(" ");
        if ([M.M1!.lineUid, M.M1!.phone, M.M1!.name, bNC.receiptNo ? `ใบเสร็จ ${bNC.receiptNo}` : "\u0000"].some((x) => x && txt.includes(x))) p.push("ops มี LINE id/เบอร์/ชื่อ/ข้อความ");
      }
      const s1 = await saleRow(bNC.id);
      const keys = ["status", "grandTotalSatang", "refundedSatang", "updatedAt", "memberId"] as const;
      if (pick(s0, keys) !== pick(s1, keys) || JSON.stringify((s0?.payments ?? []).map((x: Any) => [x.type, x.amountSatang])) !== JSON.stringify((s1?.payments ?? []).map((x: Any) => [x.type, x.amountSatang]))) p.push("แถวบิล/ชำระเปลี่ยน");
    }
    await lineConn("CONNECTED");
    chk("RC4", !fx && !NR() && p.length === 0, "ไม่มีการเชื่อมต่อ = ไม่ส่ง + ops WARN รหัสเท่านั้น", why(p, NR()));
  });

  await step("RC5", async () => {
    const p: string[] = [];
    const ev = await paidEvt(bV.id);
    const n0 = sentCap.length;
    if (voidErr || !ev) p.push(`fixture void ${voidErr || "ไม่มี event"}`);
    else {
      if ((await saleRow(bV.id))?.status !== "VOIDED") p.push("บิลไม่ VOIDED");
      const r = await RC("onSalePaidChat", ev, { send: capSend });
      if (r?.missing || r?.threw) p.push(`onSalePaidChat → ${codeOf(r)}`);
      if ((await receiptRows(bV.id)).length) p.push("ส่งใบเสร็จของบิลที่ยกเลิก");
      if (sentCap.length !== n0) p.push("ตัวส่งถูกเรียก");
    }
    chk("RC5", !fx && !NR() && p.length === 0, "บิล VOIDED = ไม่ส่ง", why(p, NR()));
  });

  await step("RC8", async () => {
    const p: string[] = [];
    // (ก) เพดานของการส่งด้วยมือยังเป็น 5 หลังส่งอัตโนมัติ
    const fakeLine = async () => ({ ok: true });
    for (let i = 1; i <= 6; i++) {
      const r = await call(sendMod, "sendReceipt", { tenantId: T, systemId: S.POS }, A("OWNER"), { saleId: bM1.id, via: "LINE" }, { deps: { line: fakeLine } });
      if (i <= 5 && r?.ok !== true) p.push(`ส่งด้วยมือครั้งที่ ${i} → ${codeOf(r)}`);
      if (i === 6 && !refused(r, "RATE_LIMITED")) p.push(`ครั้งที่ 6 → ${codeOf(r)} (คาด RATE_LIMITED)`);
    }
    if ((await auditOf("pos.receipt.sent", bM1.id)).length !== 5) p.push(`audit pos.receipt.sent ${(await auditOf("pos.receipt.sent", bM1.id)).length} (คาด 5)`);
    // (ข) แจ้งคืนเงิน
    const ev = refundId ? await evtOf("pos.sale.refunded", (e) => JSON.stringify(e.payload ?? {}).includes(refundId)) : null;
    if (!ev) p.push(`ไม่มีใบคืน/event pos.sale.refunded (${refundId || "refundSale ล้ม"})`);
    else {
      const n0 = sentCap.length;
      const r = await RC("onSaleRefundedChat", ev, { send: capSend });
      if (r?.missing || r?.threw) p.push(`onSaleRefundedChat → ${codeOf(r)}`);
      for (let i = 0; i < 2; i++) await RC("onSaleRefundedChat", ev, { send: capSend });
      const rp = await replay("pos.sale.refunded", ev, 1);
      if (rp) p.push(rp);
      const rows = await msgsByKey(`pos:refund:${refundId}`);
      if (rows.length !== 1) p.push(`แถวแจ้งคืน ${rows.length} (คาด 1)`);
      const rs = await saleRow(refundId);
      const body = String(rows[0]?.body ?? "");
      if (rows[0]) {
        if (!/คืนเงิน/.test(body) || !body.includes(money(refundGrand)) || !body.includes(bR.receiptNo) || !urlOk(body, `/r/${rs?.publicToken ?? "?"}`)) p.push(`body ${short(body, 120)}`);
        if (rows[0].conversationId !== M.M1!.convId) p.push("ไม่ใช่ห้อง LINE ของ M1");
      }
      if (sentCap.length - n0 !== 1) p.push(`ตัวส่ง ${sentCap.length - n0} (คาด 1)`);
    }
    chk("RC8", !fx && !NR() && p.length === 0, "เพดานมือ 5 เท่าเดิม · แจ้งคืนเงิน 1 ครั้ง", why(p, NR()));
  });
  await lineConn("DISABLED");

  // RC6/RC7 — ออเดอร์ (ห้อง WEBCHAT · ระบายคิวได้)
  await step("RC6", async () => {
    const p: string[] = [];
    const cv = await newConv("rc6");
    const o = await keyOrder({ conv: cv.id });
    if (!o.row) p.push(OFAIL(o));
    else {
      const a = await accept(o.row.id);
      if (a?.ok !== true) p.push(`accept ${codeOf(a)}`);
      const pr = await payOrder(await orderRow(o.row.id));
      if (pr?.ok !== true) p.push(`payOrder ${codeOf(pr)} ${short(pr?.message ?? "", 50)}`);
      await settle();
      const saleId = String((await orderRow(o.row.id))?.saleId ?? "");
      const sale = await saleRow(saleId);
      if (!sale) p.push("ไม่มีบิลของออเดอร์");
      else {
        if (sale.memberId) p.push("บิลออเดอร์มี memberId (Q7 นอกขอบเขต)");
        const rows = await receiptRows(saleId);
        const want = String(callSync(sendMod, "receiptLineText", sale.receiptNo, sale.grandTotalSatang - sale.refundedSatang, ORIG(`/r/${sale.publicToken}`)));
        if (rows.length !== 1) p.push(`แถวใบเสร็จ ${rows.length} (คาด 1)`);
        else {
          if (rows[0].conversationId !== cv.id) p.push("ไม่ใช่ห้องของออเดอร์");
          if (rows[0].body !== want) p.push(`body ${short(rows[0].body, 80)} (คาด ${short(want, 80)})`);
        }
        const au = await auditOf("pos.receipt.auto_sent", saleId);
        if (au.length !== 1 || au[0]?.after?.to !== "CHAT:order") p.push(`audit ${au.length} ${short(au[0]?.after, 60)}`);
      }
    }
    chk("RC6", !fx && !NR() && p.length === 0, "ใบเสร็จของบิลออเดอร์ไปห้องของออเดอร์", why(p, NR()));
  });

  await step("RC7", async () => {
    const p: string[] = [];
    const cv = await newConv("rc7");
    const o = await keyOrder({ conv: cv.id, channelId: CH.LM, start: "ACCEPTED" });
    if (!o.row) p.push(OFAIL(o));
    else {
      await settle();
      const saleId = String((await orderRow(o.row.id))?.saleId ?? "");
      if (!saleId) p.push("ไม่มีบิล PLATFORM ตอนรับ");
      const rows = await posMsgs({ conversationId: cv.id });
      if (rows.length) p.push(`มีข้อความ pos:* ${rows.length} ในห้องของออเดอร์แพลตฟอร์ม`);
    }
    chk("RC7", !fx && !NR() && p.length === 0, "ออเดอร์แพลตฟอร์ม = ไม่ส่ง", why(p, NR()));
  });

  // ════════ CO ประตู A / B ════════
  await setChat({ orderStatus: true });
  const CV: Record<string, Conv> = {};
  for (const k of ["co1", "co3", "co4", "co5", "tag", "tag2"]) CV[k] = await newConv(k);
  let O1: Any = null;
  let PAY1: Any = null;
  await step("CO1", async () => {
    const p: string[] = [];
    const o = await keyOrder({ conv: CV.co1!.id });
    O1 = o.row;
    if (!o.row) p.push(OFAIL(o));
    else {
      const t0 = Date.now();
      const r = await reqPay(o.row.id);
      PAY1 = r;
      if (r?.ok !== true || r.sent !== true || r.duplicated !== false || !r.intentId) p.push(`requestChatPayment → ${codeOf(r)} ${short(r, 120)}`);
      const row = await orderRow(o.row.id);
      if (row?.status !== "NEW" || row?.paymentState !== "PENDING_PAYMENT") p.push(`ออเดอร์ ${short([row?.status, row?.paymentState], 40)}`);
      const pb = row?.payBy ? new Date(row.payBy).getTime() : NaN;
      if (!(Math.abs(pb - t0 - 20 * MIN) <= 90_000)) p.push(`payBy − ตอนนี้ = ${Math.round((pb - t0) / 1000)} วิ (คาด ≈1200)`);
      if (!CROCK12.test(String(row?.publicToken ?? ""))) p.push(`publicToken ${short(row?.publicToken, 20)}`);
      if (row?.version !== o.row.version + 1) p.push(`version ${o.row.version}→${row?.version} (คาด +1)`);
      const its = await intentsOf(o.row.id);
      const it = its[0];
      if (its.length !== 1 || !it) p.push(`ใบ ${its.length} (คาด 1)`);
      else {
        if (it.kind !== "PROMPTPAY_STATIC" || it.status !== "PENDING" || it.amountSatang !== row?.totalSatang) p.push(`ใบ ${short([it.kind, it.status, it.amountSatang], 60)}`);
        if (row?.paymentIntentId !== it.id || (r?.intentId && r.intentId !== it.id)) p.push("paymentIntentId ≠ ใบ");
        if (Math.abs(new Date(it.expiresAt).getTime() - pb) > 1000) p.push("expiresAt ≠ payBy");
        if (it.idempotencyKey !== `posorder-pay-${o.row.id}`) p.push(`คีย์ใบ ${short(it.idempotencyKey, 40)}`);
      }
      if ((await evsOf(o.row.id, "payment_requested")).length !== 1) p.push(`payment_requested ${(await evsOf(o.row.id, "payment_requested")).length}`);
      const rows = await msgsByKey(`pos:ordpay:${o.row.id}:`);
      if (rows.length !== 1) p.push(`ข้อความจ่าย ${rows.length} (คาด 1)`);
      else {
        const b = String(rows[0].body ?? "");
        if (rows[0].clientMessageId !== `pos:ordpay:${o.row.id}:${it?.id ?? "?"}`) p.push(`คีย์ ${rows[0].clientMessageId}`);
        if (rows[0].conversationId !== CV.co1!.id) p.push("ไม่ใช่ห้องของออเดอร์");
        if (!b.includes(money(row?.totalSatang ?? 0)) || !hhmmNear(pb).some((h) => b.includes(h)) || !urlOk(b, `/q/o/${row?.publicToken ?? "?"}`)) p.push(`body ${short(b, 120)}`);
      }
      if ((await P.posSale.count({ where: { tenantId: T, sourceId: o.row.id } })) !== 0) p.push("มีบิล");
    }
    chk("CO1", !fx && !NR() && p.length === 0, "ประตู A: PENDING_PAYMENT + ใบ + ลิงก์ในห้อง", why(p, NR()));
  });

  await step("CO2", async () => {
    const p: string[] = [];
    if (!O1) p.push("ไม่มีออเดอร์ CO1");
    else {
      const v0 = (await orderRow(O1.id))?.version;
      const tok0 = (await orderRow(O1.id))?.publicToken;
      const rs = [await reqPay(O1.id), await reqPay(O1.id), ...(await Promise.all([reqPay(O1.id), reqPay(O1.id), reqPay(O1.id)]))];
      const bad = rs.filter((r) => r?.ok !== true || r.duplicated !== true || (PAY1?.intentId && r.intentId !== PAY1.intentId));
      if (bad.length) p.push(`${bad.length}/5 ไม่ใช่ ok+duplicated+intent เดิม (${codeOf(bad[0])} ${short(bad[0]?.duplicated, 6)})`);
      const row = await orderRow(O1.id);
      if (row?.version !== v0 || row?.publicToken !== tok0) p.push(`version/โทเคนเปลี่ยน ${v0}→${row?.version}`);
      if ((await intentsOf(O1.id)).length !== 1) p.push(`ใบ ${(await intentsOf(O1.id)).length}`);
      if ((await msgsByKey(`pos:ordpay:${O1.id}:`)).length !== 1) p.push(`ข้อความจ่าย ${(await msgsByKey(`pos:ordpay:${O1.id}:`)).length}`);
      if ((await evsOf(O1.id, "payment_requested")).length !== 1) p.push("payment_requested ไม่ใช่ 1");
    }
    chk("CO2", !fx && !NR() && p.length === 0, "เล่นซ้ำ = ใบ/โทเคน/ข้อความเดิม", why(p, NR()));
  });

  await step("CO3", async () => {
    const p: string[] = [];
    const lm = await keyOrder({ conv: CV.co3!.id, channelId: CH.LM, start: "NEW" });
    const acc = await keyOrder({ conv: CV.co3!.id });
    if (acc.row) await accept(acc.row.id);
    const noConv = await keyOrder({});
    const okOrder = await keyOrder({ conv: CV.co3!.id });
    const x = fx ? null : await call(ord, "ingestOrder", ctxU("X"), A("OWNER2"), { channelCode: "CHAT", idempotencyKey: newKey("x"), lines: [{ productId: PRDX, qty: 1 }], customer: { name: CUST_NAME }, fulfilment: "PICKUP", startStatus: "NEW", paymentState: "UNPAID" });
    const cases: [string, Any, string, string][] = [
      ["LINEMAN", lm.row, "STAFF", "ORDER_STATE_INVALID"],
      ["CHAT รับแล้ว", acc.row, "STAFF", "ORDER_STATE_INVALID"],
      ["CHAT ไม่ผูกห้อง", noConv.row, "STAFF", "NO_CHAT_LINK"],
      ["CASHIER", okOrder.row, "CASHIER", "PERMISSION_DENIED"],
      ["ร้าน T2", x?.ok ? { id: x.orderId } : null, "STAFF", "ORDER_NOT_FOUND"],
      ["id มั่ว", { id: "cl0000000000000000000000" }, "STAFF", "ORDER_NOT_FOUND"],
    ];
    const m0 = await allPosMsgCount();
    for (const [lbl, o, actor, code] of cases) {
      if (!o?.id) {
        p.push(`${lbl}: fixture ไม่มีออเดอร์`);
        continue;
      }
      const before = await orderRow(o.id);
      const r = await reqPay(o.id, actor);
      if (!refused(r, code)) p.push(`${lbl} → ${codeOf(r)} (คาด ${code})`);
      else if (code === "NO_CHAT_LINK" || code === "ORDER_STATE_INVALID") {
        const mk = msgKeyBad(r);
        if (mk && code === "NO_CHAT_LINK") p.push(`${lbl}: ${mk}`);
      }
      const after = await orderRow(o.id);
      if (before && pick(before, ["version", "paymentState", "status", "payBy"] as const) !== pick(after, ["version", "paymentState", "status", "payBy"] as const)) p.push(`${lbl}: ออเดอร์เปลี่ยน`);
      if (before && (await intentsOf(o.id)).length) p.push(`${lbl}: มีใบ`);
    }
    if ((await allPosMsgCount()) !== m0) p.push("มีข้อความเพิ่ม");
    chk("CO3", !fx && !NR() && p.length === 0, "ปฏิเสธตามรหัส · ไม่เขียน", why(p, NR()));
  });

  await step("CO4", async () => {
    const p: string[] = [];
    const o = await keyOrder({ conv: CV.co4!.id, unit: "B" });
    if (!o.row) p.push(OFAIL(o));
    else {
      const m0 = await allPosMsgCount();
      const r = await reqPay(o.row.id, "STAFF", "B");
      if (!refused(r, "PROMPTPAY_NOT_CONFIGURED")) p.push(`→ ${codeOf(r)} (คาด PROMPTPAY_NOT_CONFIGURED)`);
      else {
        const mk = msgKeyBad(r);
        if (mk) p.push(mk);
      }
      const row = await orderRow(o.row.id);
      if (row?.paymentState !== "UNPAID" || row?.version !== o.row.version || row?.payBy) p.push(`ออเดอร์เปลี่ยน ${short([row?.paymentState, row?.version], 40)}`);
      if ((await intentsOf(o.row.id)).length) p.push("มีใบ");
      if ((await allPosMsgCount()) !== m0) p.push("มีข้อความ");
    }
    chk("CO4", !fx && !NR() && p.length === 0, "ไม่มีพร้อมเพย์ = ปฏิเสธ ไม่เขียน", why(p, NR()));
  });

  let O5: Any = null;
  await step("CO5", async () => {
    const p: string[] = [];
    const o = await keyOrder({ conv: CV.co5!.id });
    O5 = o.row;
    if (!o.row) p.push(OFAIL(o));
    else {
      const r = await reqPay(o.row.id);
      if (r?.ok !== true) p.push(`requestChatPayment → ${codeOf(r)}`);
      const it = (await intentsOf(o.row.id))[0];
      if (!it) p.push("ไม่มีใบ");
      else {
        const c = await confirm(it.id);
        if (c?.ok !== true) p.push(`confirm → ${codeOf(c)}`);
        await settle();
        const row = await orderRow(o.row.id);
        if (row?.paymentState !== "PREPAID") p.push(`หลังเงินเข้า ${row?.paymentState} (คาด PREPAID)`);
        const paid = await msgsByKey(`pos:order:${o.row.id}:paid`);
        if (paid.length !== 1 || !/ได้รับเงิน/.test(String(paid[0]?.body)) || !String(paid[0]?.body).includes(row?.code ?? "?")) p.push(`ข้อความ paid ${paid.length} ${short(paid[0]?.body, 80)}`);
        const a = await accept(o.row.id);
        if (a?.ok !== true) p.push(`accept → ${codeOf(a)}`);
        await settle();
        const row2 = await orderRow(o.row.id);
        const sale = await saleRow(String(row2?.saleId ?? ""));
        if (!sale) p.push("ไม่มีบิล");
        else {
          if (sale.sourceModule !== "POS" || sale.sourceId !== o.row.id) p.push(`บิล ${short([sale.sourceModule, sale.sourceId], 50)}`);
          if (sale.payments.length !== 1 || sale.payments[0].type !== "PROMPTPAY" || sale.payments[0].amountSatang !== sale.grandTotalSatang) p.push(`ชำระ ${short(sale.payments.map((x: Any) => [x.type, x.amountSatang]), 60)}`);
          if ((await receiptRows(sale.id)).filter((m: Any) => m.conversationId === CV.co5!.id).length !== 1) p.push("ไม่มีใบเสร็จในห้อง (receiptAuto เปิดอยู่)");
        }
        const it2 = (await intentsOf(o.row.id))[0];
        if (it2?.status !== "CONSUMED") p.push(`ใบ ${it2?.status} (คาด CONSUMED)`);
      }
    }
    chk("CO5", !fx && !NR() && p.length === 0, "เงินเข้า → PREPAID + แจ้ง → รับ = บิลใช้ใบ + ใบเสร็จ", why(p, NR()));
  });

  const placeTagged = async (tag: string | null, link = LINK.A ?? "") => {
    const key = newKey("po").replace(/[^A-Za-z0-9_-]/g, "_");
    const r = await call(qr, "placePreorder", link, { lines: [{ productId: PRD, qty: 1 }], customer: { name: CUST_NAME, phone: PHONE_FMT }, idempotencyKey: key, ...(tag !== null ? { chatTag: tag } : {}) }, { ip: freshIp() });
    const tok = r?.ok === true ? String(r.orderToken ?? "") : "";
    if (tok) SEEN_TOKENS.add(tok);
    const row = tok ? await P.posOrder.findFirst({ where: { tenantId: T, publicToken: tok } }).catch(() => null) : null;
    return { r, row };
  };
  const tagOf = (url: string): { link: string; tag: string } => {
    try {
      const u = new URL(url, "https://x.invalid");
      const m = /\/q\/([^/?#]+)/.exec(u.pathname);
      return { link: m?.[1] ?? "", tag: u.searchParams.get("c") ?? "" };
    } catch {
      return { link: "", tag: "" };
    }
  };
  await step("CO6", async () => {
    const p: string[] = [];
    const t0 = Date.now();
    const m = await call(root, "mintChatPreorderLink", { tenantId: T, conversationId: CV.tag!.id });
    if (m?.ok !== true || typeof m.url !== "string") p.push(`mintChatPreorderLink → ${codeOf(m)} ${short(m, 80)}`);
    else {
      const { link, tag } = tagOf(m.url);
      if (link !== LINK.A || !tag || tag.length > 400) p.push(`url ${short(m.url, 100)} (คาด /q/${LINK.A}?c=<tag>)`);
      if (ORIGIN && !m.url.startsWith(`${ORIGIN}/q/`)) p.push("url ไม่ขึ้นต้น origin");
      const exp = new Date(m.expiresAt ?? 0).getTime();
      if (!(Math.abs(exp - t0 - 24 * HOUR) <= 5 * MIN)) p.push(`expiresAt ${short(m.expiresAt, 30)} (คาด ≈ +24 ชม.)`);
      const x = await placeTagged(tag);
      if (x.r?.ok !== true || !x.row) p.push(`placePreorder → ${codeOf(x.r)}`);
      else if (x.row.chatConversationId !== CV.tag!.id || x.row.channelCode !== "QR_ORDER" || x.row.paymentState !== "PENDING_PAYMENT") p.push(`ออเดอร์ ${short([x.row.chatConversationId, x.row.channelCode, x.row.paymentState], 80)}`);
    }
    chk("CO6", !fx && !NR() && p.length === 0, "ประตู B: ลิงก์ติดแท็ก → ออเดอร์ผูกห้อง", why(p, NR()));
  });

  await step("CO7", async () => {
    const p: string[] = [];
    const good = await call(root, "mintChatPreorderLink", { tenantId: T, conversationId: CV.tag2!.id });
    const old = await call(root, "mintChatPreorderLink", { tenantId: T, conversationId: CV.tag2!.id, now: new Date(Date.now() - 25 * HOUR) });
    const cx = WEBX ? await newConv("x-tag", WEBX) : null;
    const t2 = cx?.id ? await call(root, "mintChatPreorderLink", { tenantId: T2, conversationId: cx.id }) : null;
    const g = good?.ok ? tagOf(good.url).tag : "";
    const flip = (s: string) => (s ? s.slice(0, -1) + (s.slice(-1) === "A" ? "B" : "A") : "");
    const cases: [string, string][] = [
      ["แก้ตัวท้าย", flip(g)],
      ["หมดอายุ", old?.ok ? tagOf(old.url).tag : ""],
      ["ของร้าน T2", t2?.ok ? tagOf(t2.url).tag : ""],
      ["สตริงมั่ว", "not-a-real-tag"],
    ];
    if (!g) p.push(`mint ล้ม ${codeOf(good)}`);
    for (const [lbl, tag] of cases) {
      if (!tag) {
        p.push(`${lbl}: ไม่ได้แท็ก (${lbl === "หมดอายุ" ? codeOf(old) : lbl === "ของร้าน T2" ? codeOf(t2) : "-"})`);
        continue;
      }
      const x = await placeTagged(tag);
      if (x.r?.ok !== true || !x.row) p.push(`${lbl}: placePreorder → ${codeOf(x.r)} (คาด ok)`);
      else if (x.row.chatConversationId !== null) p.push(`${lbl}: ผูกห้อง ${short(x.row.chatConversationId, 30)}`);
    }
    const cnt = (s: string | null) => (s === null ? -1 : (stripComments(s).match(/\bcreateSale\s*\(/g) ?? []).length);
    const baseCnts = bases().map((rev) => cnt(showAt(F.order, rev)));
    if (!baseCnts.includes(cnt(rd(F.order)))) p.push(`createSale( ใน order.ts ${baseCnts.join("/")}→${cnt(rd(F.order))}`);
    chk("CO7", !fx && !NR() && p.length === 0, "แท็กเสีย = สั่งได้แต่ไม่ผูกห้อง", why(p, NR()));
  });

  // ════════ OS สถานะออเดอร์ (orderStatus เปิด) ════════
  const statusRows = async (orderId: string) => (orderId ? msgsByKey(`pos:order:${orderId}:`) : []);
  let OS1o: Any = null;
  await step("OS1", async () => {
    const p: string[] = [];
    const cv = await newConv("os1");
    const o = await keyOrder({ conv: cv.id });
    OS1o = o.row;
    if (!o.row) p.push(OFAIL(o));
    else {
      const a = await accept(o.row.id);
      if (a?.ok !== true) p.push(`accept ${codeOf(a)}`);
      await settle();
      const row = await orderRow(o.row.id);
      const acc = await msgsByKey(`pos:order:${o.row.id}:accepted`);
      const eta = new Date(row?.acceptedAt ?? 0).getTime() + Number(row?.prepMinutes ?? 15) * MIN;
      if (acc.length !== 1) p.push(`accepted ${acc.length} (คาด 1)`);
      else if (!String(acc[0].body).includes(row?.code ?? "?") || !hhmmNear(eta).some((h) => String(acc[0].body).includes(h))) p.push(`accepted body ${short(acc[0].body, 100)} (คาดรหัส + ${hhmm(eta)})`);
      const afterAcc = (await statusRows(o.row.id)).length;
      const mp = await call(ord, "markPreparing", ctxU("A", DEV1), A("STAFF"), { id: o.row.id });
      if (mp?.ok !== true) p.push(`markPreparing ${codeOf(mp)}`);
      await settle();
      if ((await statusRows(o.row.id)).length !== afterAcc) p.push("PREPARING มีข้อความ");
      const mr = await call(ord, "markReady", ctxU("A", DEV1), A("STAFF"), { id: o.row.id });
      if (mr?.ok !== true) p.push(`markReady ${codeOf(mr)}`);
      await settle();
      const rdy = await msgsByKey(`pos:order:${o.row.id}:ready`);
      if (rdy.length !== 1 || !String(rdy[0]?.body).includes(row?.code ?? "?")) p.push(`ready ${rdy.length} ${short(rdy[0]?.body, 60)}`);
      for (const t of ["pos.order.accepted", "pos.order.ready"]) {
        const rp = await replay(t, await evtOf(t, (e) => e.payload?.orderId === o.row.id), 2);
        if (rp) p.push(rp);
      }
      await settle();
      if ((await statusRows(o.row.id)).length !== 2) p.push(`หลังเล่นซ้ำ ${(await statusRows(o.row.id)).length} (คาด 2)`);
    }
    chk("OS1", !fx && !NR() && p.length === 0, "รับ/พร้อม = ข้อความละ 1 · เตรียม = ไม่มี", why(p, NR()));
  });

  await step("OS2", async () => {
    const p: string[] = [];
    if (!OS1o) p.push("ไม่มีออเดอร์ OS1");
    else {
      const pr = await payOrder(await orderRow(OS1o.id));
      if (pr?.ok !== true) p.push(`payOrder ${codeOf(pr)}`);
      const h = await call(ord, "handOver", ctxU("A", DEV1), A("STAFF"), { id: OS1o.id });
      if (h?.ok !== true) p.push(`handOver ${codeOf(h)}`);
      await settle();
      if ((await statusRows(OS1o.id)).length !== 2) p.push(`ข้อความสถานะ ${(await statusRows(OS1o.id)).length} (คาด 2 · completed ไม่ส่ง)`);
    }
    chk("OS2", !fx && !NR() && p.length === 0, "ส่งมอบ = ไม่มีข้อความสถานะ", why(p, NR()));
  });

  await step("OS3", async () => {
    const p: string[] = [];
    const cvP = await newConv("os3p");
    const cvU = await newConv("os3u");
    const oP = await keyOrder({ conv: cvP.id });
    const oU = await keyOrder({ conv: cvU.id });
    if (!oP.row || !oU.row) p.push(OFAIL(oP) + OFAIL(oU));
    else {
      await reqPay(oP.row.id);
      const it = (await intentsOf(oP.row.id))[0];
      if (it) await confirm(it.id);
      await settle();
      if ((await orderRow(oP.row.id))?.paymentState !== "PREPAID") p.push("ออเดอร์ P ไม่ PREPAID");
      for (const o of [oP.row, oU.row]) {
        const r = await call(ord, "rejectOrder", ctxU("A", DEV1), A("STAFF"), { id: o.id, reasonCode: "TOO_BUSY" });
        if (r?.ok !== true) p.push(`reject ${codeOf(r)}`);
      }
      await settle();
      if (!(await evsOf(oP.row.id, "refund_needed")).length) p.push("ไม่มี refund_needed (fixture)");
      const cP = await msgsByKey(`pos:order:${oP.row.id}:cancelled`);
      const cU = await msgsByKey(`pos:order:${oU.row.id}:cancelled`);
      if (cP.length !== 1 || !/คืนเงิน/.test(String(cP[0]?.body))) p.push(`PREPAID cancelled ${cP.length} ${short(cP[0]?.body, 80)} (คาดบรรทัดคืนเงิน)`);
      if (cU.length !== 1 || /คืนเงิน/.test(String(cU[0]?.body)) || !String(cU[0]?.body).includes(oU.row.code)) p.push(`UNPAID cancelled ${cU.length} ${short(cU[0]?.body, 80)} (คาดไม่มีบรรทัดคืนเงิน)`);
    }
    chk("OS3", !fx && !NR() && p.length === 0, "ยกเลิก/ปฏิเสธ: บรรทัดคืนเงินเฉพาะที่มี refund_needed", why(p, NR()));
  });

  await step("OS4", async () => {
    const p: string[] = [];
    const cv = await newConv("os4");
    const o = await keyOrder({ conv: cv.id });
    if (!o.row) p.push(OFAIL(o));
    else {
      const r = await reqPay(o.row.id);
      if (r?.ok !== true) p.push(`requestChatPayment ${codeOf(r)}`);
      const past = new Date(Date.now() - MIN);
      await P.$executeRawUnsafe(`UPDATE "PosOrder" SET "payBy" = $2 WHERE id = $1 AND "tenantId" = $3`, o.row.id, past, T);
      await P.$executeRawUnsafe(`UPDATE "PosPaymentIntent" SET "expiresAt" = $2 WHERE "orderId" = $1 AND "tenantId" = $3`, o.row.id, past, T);
      const ex = await call(ord, "expirePreorders", T);
      if (ex?.ok === false) p.push(`expirePreorders ${codeOf(ex)}`);
      await settle();
      const row = await orderRow(o.row.id);
      if (row?.status !== "CANCELLED") p.push(`ออเดอร์ ${row?.status} (คาด CANCELLED)`);
      const c = await msgsByKey(`pos:order:${o.row.id}:cancelled`);
      if (c.length !== 1 || !/หมดเวลา/.test(String(c[0]?.body))) p.push(`expired ${c.length} ${short(c[0]?.body, 80)}`);
    }
    chk("OS4", !fx && !NR() && p.length === 0, "หมดเวลาชำระ = ข้อความหมดเวลา", why(p, NR()));
  });

  await step("OS5", async () => {
    const p: string[] = [];
    const oN = await keyOrder({});
    const cv = await newConv("os5");
    if (!oN.row) p.push(OFAIL(oN));
    else {
      await accept(oN.row.id);
      await settle();
      if ((await statusRows(oN.row.id)).length) p.push("ออเดอร์ไม่ผูกห้องมีข้อความ");
    }
    const lm = await keyOrder({ conv: cv.id, channelId: CH.LM, start: "ACCEPTED" });
    if (!lm.row) p.push(OFAIL(lm));
    else {
      await settle();
      if ((await posMsgs({ conversationId: cv.id })).length) p.push("ออเดอร์แพลตฟอร์มมีข้อความ");
    }
    chk("OS5", !fx && !NR() && p.length === 0, "ไม่ผูกห้อง/แพลตฟอร์ม = ไม่ส่ง", why(p, NR()));
  });

  await step("OS6", async () => {
    const p: string[] = [];
    await setChat({ statusKinds: ["accepted", "cancelled", "paid"] });
    const cv = await newConv("os6");
    const o = await keyOrder({ conv: cv.id });
    if (!o.row) p.push(OFAIL(o));
    else {
      await accept(o.row.id);
      await call(ord, "markPreparing", ctxU("A", DEV1), A("STAFF"), { id: o.row.id });
      await call(ord, "markReady", ctxU("A", DEV1), A("STAFF"), { id: o.row.id });
      await settle();
      if ((await msgsByKey(`pos:order:${o.row.id}:accepted`)).length !== 1) p.push("accepted ไม่ส่ง");
      if ((await msgsByKey(`pos:order:${o.row.id}:ready`)).length) p.push("ready ส่งทั้งที่ไม่อยู่ใน statusKinds");
    }
    await setChat({ statusKinds: CHAT_DEFAULTS.statusKinds });
    chk("OS6", !fx && !NR() && p.length === 0, "statusKinds กรองชนิด", why(p, NR()));
  });

  // ════════ AR บอทตามกฎ ════════
  // ห้องทั้งหมดสร้างตอน autoReply ปิด (ข้อความแรกเป็นคำทัก) และระบายเสร็จก่อนเปิด
  await setChat({ autoReply: false, orderStatus: false, receiptAuto: false });
  const AC: Record<string, Conv> = {};
  for (const k of ["a1", "a2", "a2b", "a3", "a3b", "a4", "a5a", "a5b", "a5c", "a5d", "a5e", "a6", "m1", "m2"]) AC[k] = await newConv(k);
  const AO: Any[] = [];
  let AGED: Any = null;
  if (!fx) {
    const aged = await keyOrder({ conv: AC.a1!.id });
    AGED = aged.row;
    if (AGED) {
      const t = new Date(Date.now() - 49 * HOUR);
      await P.$executeRawUnsafe(`UPDATE "PosOrder" SET "receivedAt" = $2, "createdAt" = $2 WHERE id = $1 AND "tenantId" = $3`, AGED.id, t, T);
    }
    for (let i = 0; i < 3; i++) AO.push((await keyOrder({ conv: AC.a1!.id })).row);
    const last = await keyOrder({ conv: AC.a1!.id });
    if (last.row) await reqPay(last.row.id);
    AO.push(last.row ? await orderRow(last.row.id) : null);
    await settle();
  }
  const NEWEST = AO[AO.length - 1];
  await setChat({ autoReply: true });

  let AR1_IN = "";
  await step("AR1", async () => {
    const p: string[] = [];
    AR1_IN = await say(AC.a1!, "สถานะออเดอร์");
    const b = await botsOf(AC.a1!.id);
    if (b.length !== 1) p.push(`คำตอบ ${b.length} (คาด 1)`);
    else {
      const body = String(b[0].body ?? "");
      if (b[0].clientMessageId !== `pos:bot:${AR1_IN}` || b[0].senderUserId !== null || b[0].direction !== "OUT") p.push(`แถว ${short([b[0].clientMessageId, b[0].senderUserId], 60)}`);
      if (!NEWEST || !body.includes(NEWEST.code) || !urlOk(body, `/q/o/${NEWEST.publicToken ?? "?"}`)) p.push(`ไม่มีรหัส/ลิงก์ออเดอร์ล่าสุด ${short(body, 100)}`);
      const codes = AO.filter(Boolean).map((o: Any) => o.code).filter((c: string) => body.includes(c));
      if (codes.length > 3) p.push(`แสดง ${codes.length} รหัส (≤ 3)`);
      if (AGED && body.includes(AGED.code)) p.push("แสดงใบเก่า 49 ชม.");
      if (PHONE_RE.test(stripUrls(body)) || body.includes(PHONE) || body.includes(CUST_NAME)) p.push("มีเบอร์/ชื่อลูกค้า");
    }
    const lst = await call(root, "ordersForChatCustomer", { tenantId: T, conversationId: AC.a1!.id });
    const ids: string[] = lst?.ok === true && Array.isArray(lst.orders) ? lst.orders.map((o: Any) => String(o.orderId)) : [];
    if (lst?.ok !== true) p.push(`ordersForChatCustomer → ${codeOf(lst)}`);
    else {
      if (ids.length < 1 || ids.length > 3) p.push(`ordersForChatCustomer ${ids.length} ใบ (คาด 1–3)`);
      if (AGED && ids.includes(AGED.id)) p.push("ordersForChatCustomer มีใบเก่า");
      if (NEWEST && !ids.includes(NEWEST.id)) p.push("ordersForChatCustomer ไม่มีใบล่าสุด");
      const mine = new Set(AO.filter(Boolean).map((o: Any) => o.id));
      if (ids.some((id) => !mine.has(id))) p.push("ordersForChatCustomer มีออเดอร์ของห้องอื่น");
    }
    chk("AR1", !fx && !NR() && p.length === 0, "STATUS: ออเดอร์ของห้องนี้ ≤ 3 · 48 ชม. · ไม่มีเบอร์", why(p, NR()));
  });

  await step("AR2", async () => {
    const p: string[] = [];
    const code = NEWEST?.code ?? "OD-0001";
    await say(AC.a2!, `สถานะ ${code}`);
    await say(AC.a2b!, `เบอร์ ${PHONE} ออเดอร์ถึงไหน`);
    for (const c of [AC.a2!, AC.a2b!]) {
      const b = await botsOf(c.id);
      const body = String(b[0]?.body ?? "");
      if (b.length !== 1) p.push(`${c.label}: คำตอบ ${b.length} (คาด 1)`);
      else {
        if (!/ไม่พบ/.test(body)) p.push(`${c.label}: ไม่ใช่ "ไม่พบ" ${short(body, 60)}`);
        if (body.includes(code) || body.includes("/q/o/") || PHONE_RE.test(stripUrls(body)) || body.includes(PHONE)) p.push(`${c.label}: มีรหัส/ลิงก์/เบอร์`);
      }
    }
    const lst = await call(root, "ordersForChatCustomer", { tenantId: T, conversationId: AC.a2!.id });
    if (lst?.ok !== true || !Array.isArray(lst.orders) || lst.orders.length) p.push(`ordersForChatCustomer ห้องอื่น → ${codeOf(lst)} ${short(lst?.orders?.length, 5)}`);
    chk("AR2", !fx && !NR() && p.length === 0, "ไม่ค้นจากรหัส/เบอร์ที่พิมพ์", why(p, NR()));
  });

  await step("AR3", async () => {
    const p: string[] = [];
    await say(AC.a3!, "ขอดูเมนูหน่อย");
    const b = await botsOf(AC.a3!.id);
    const body = String(b[0]?.body ?? "");
    const mm = /(?:https?:\/\/\S+)?\/q\/[A-Za-z0-9_-]+\?c=[^\s]+/.exec(body);
    if (b.length !== 1 || !mm) p.push(`คำตอบ ${b.length} ${short(body, 80)} (คาด /q/<link>?c=)`);
    else {
      const { link, tag } = tagOf(mm[0]);
      if (link !== LINK.A) p.push(`ลิงก์ ${link} ≠ ลิงก์สาขา`);
      const x = await placeTagged(tag);
      if (x.row?.chatConversationId !== AC.a3!.id) p.push(`สั่งด้วยแท็กของบอท → ผูก ${short(x.row?.chatConversationId, 30)} (${codeOf(x.r)})`);
    }
    const qo = CH.QR_ORDER_A ?? "";
    const pz = await call(ord, "setChannelOrderSettings", ctxU("A"), A("OWNER"), { channelId: qo, pausedUntil: new Date(Date.now() + HOUR).toISOString() });
    if (pz?.ok !== true) p.push(`(fixture) พัก QR_ORDER → ${codeOf(pz)}`);
    await say(AC.a3b!, "menu");
    const b2 = await botsOf(AC.a3b!.id);
    if (b2.length !== 1 || /\/q\//.test(String(b2[0]?.body ?? "")) || !String(b2[0]?.body ?? "").trim()) p.push(`ร้านปิด → ${b2.length} ${short(b2[0]?.body, 60)}`);
    await call(ord, "setChannelOrderSettings", ctxU("A"), A("OWNER"), { channelId: qo, pausedUntil: null });
    chk("AR3", !fx && !NR() && p.length === 0, "ORDER: ลิงก์ติดแท็ก · ร้านปิด = ข้อความปิด", why(p, NR()));
  });

  await step("AR4", async () => {
    const p: string[] = [];
    const t0 = Date.now();
    await say(AC.a4!, "ขอคุยกับพนักงานค่ะ");
    const b = await botsOf(AC.a4!.id);
    if (b.length !== 1 || !/ส่งต่อ/.test(String(b[0]?.body ?? ""))) p.push(`คำตอบ HUMAN ${b.length} ${short(b[0]?.body, 60)}`);
    const conv = await P.chatConversation.findUnique({ where: { id: AC.a4!.id } });
    const until = new Date(String(isRecord(conv?.meta) ? conv.meta.posBotPausedUntil : "")).getTime();
    if (!(Math.abs(until - t0 - 24 * HOUR) <= 10 * MIN)) p.push(`meta.posBotPausedUntil ${short(conv?.meta, 80)} (คาด ≈ +24 ชม.)`);
    const ctxB = await call(SEAM("botContext"), "botContext", { tenantId: T, conversationId: AC.a4!.id });
    if (!ctxB || ctxB.ok === false || new Date(String(ctxB.posBotPausedUntil ?? "")).getTime() !== until) p.push(`botContext ${short(ctxB?.posBotPausedUntil ?? codeOf(ctxB), 60)}`);
    const nb = (await botsOf(AC.a4!.id)).length;
    const inb = await say(AC.a4!, "สถานะออเดอร์");
    if ((await botsOf(AC.a4!.id)).length !== nb) p.push("ข้อความถัดไปไม่เงียบ");
    const ev = await chatEvtOf(inb);
    if (!ev) p.push("ไม่มี event ของข้อความถัดไป");
    else {
      await RC("onChatMessageReceivedBot", ev, { now: new Date(Date.now() + HOUR) });
      if ((await botsOf(AC.a4!.id)).length !== nb) p.push("now +1 ชม. ไม่เงียบ (ยังพัก)");
      const r = await RC("onChatMessageReceivedBot", ev, { now: new Date(Date.now() + 25 * HOUR) });
      if (r?.missing || r?.threw) p.push(`onChatMessageReceivedBot → ${codeOf(r)}`);
      if ((await botsOf(AC.a4!.id)).length !== nb + 1) p.push(`now +25 ชม. → คำตอบ +${(await botsOf(AC.a4!.id)).length - nb} (คาด +1)`);
    }
    chk("AR4", !fx && !NR() && p.length === 0, "HUMAN: พักบอท 24 ชม. แล้วกลับมาตอบ", why(p, NR()));
  });

  await step("AR5", async () => {
    const p: string[] = [];
    // (ก) มีผู้รับผิดชอบ
    const as = await chatSvc.assign({ tenantId: T, systemId: S.CHAT, conversationId: AC.a5a!.id, assigneeUserId: uid("OWNER"), actorUserId: uid("OWNER"), unitAccess: ["*"] });
    if (!as?.ok) p.push(`(fixture) assign ${short(as?.reason, 40)}`);
    await say(AC.a5a!, "สถานะออเดอร์");
    if ((await botsOf(AC.a5a!.id)).length) p.push("มีผู้รับผิดชอบแล้วยังตอบ");
    // (ข)(ค) พนักงานตอบ 10 / 40 นาที
    for (const [c, mins] of [[AC.a5b!, 10], [AC.a5c!, 40]] as const) {
      const rr = await chatSvc.sendReply({ tenantId: T, systemId: S.CHAT, conversationId: c.id, senderUserId: uid("OWNER"), body: "ทีมงานตอบเองค่ะ", unitAccess: ["*"] });
      if (rr?.ok === false) p.push(`(fixture) sendReply ${short(rr?.reason, 40)}`);
      await P.$executeRawUnsafe(`UPDATE "ChatMessage" SET "createdAt" = $2 WHERE "conversationId" = $1 AND direction = 'OUT' AND "senderUserId" IS NOT NULL AND "tenantId" = $3`, c.id, new Date(Date.now() - mins * MIN), T);
      await say(c, "สถานะออเดอร์");
    }
    if ((await botsOf(AC.a5b!.id)).length) p.push("พนักงานตอบ 10 นาทีก่อนแล้วยังตอบ");
    if ((await botsOf(AC.a5c!.id)).length !== 1) p.push(`ตัวควบคุมบวก (40 นาที) → ${(await botsOf(AC.a5c!.id)).length} (คาด 1)`);
    // (ง) สวิตช์ปิด
    await setChat({ autoReply: false });
    await say(AC.a5d!, "สถานะออเดอร์");
    await setChat({ autoReply: true });
    if ((await botsOf(AC.a5d!.id)).length) p.push("สวิตช์ปิดแล้วยังตอบ");
    // (จ) รูปภาพ
    if (AC.a5e!.id) {
      const img = await P.chatMessage.create({ data: { tenantId: T, systemId: S.CHAT, conversationId: AC.a5e!.id, direction: "IN", type: "IMAGE", body: null, deliveryStatus: "SENT" } });
      const r = await RC("onChatMessageReceivedBot", { id: `qc37-${RAND}-img`, tenantId: T, type: "chat.message.received", payload: { conversationId: AC.a5e!.id, channel: "WEBCHAT" }, idempotencyKey: `chat.msg.${img.id}`, systemId: S.CHAT, unitId: U.A, status: "PENDING", attempts: 0, createdAt: new Date(), availableAt: new Date() });
      if (r?.missing || r?.threw) p.push(`onChatMessageReceivedBot (รูป) → ${codeOf(r)}`);
      if ((await botsOf(AC.a5e!.id)).length) p.push("ตอบข้อความรูปภาพ");
    }
    chk("AR5", !fx && !NR() && p.length === 0, "ด่านเงียบครบ + ตัวควบคุมบวก", why(p, NR()));
  });

  await step("AR6", async () => {
    const p: string[] = [];
    const t0 = Date.now();
    for (let i = 0; i < 3; i++) await say(AC.a6!, `สถานะออเดอร์ ${i + 1}`, WEB, false);
    if (Date.now() - t0 > 5000) p.push(`(fixture) 3 ข้อความใช้ ${Date.now() - t0} ms`);
    await settle();
    if ((await botsOf(AC.a6!.id)).length !== 1) p.push(`คำตอบ ${(await botsOf(AC.a6!.id)).length} (คาด 1)`);
    chk("AR6", !fx && !NR() && p.length === 0, "อัตรา 1 คำตอบ/ห้อง/20 วิ", why(p, NR()));
  });

  await step("AR7", async () => {
    const p: string[] = [];
    const ev = await chatEvtOf(AR1_IN);
    if (!ev) p.push("ไม่มี event ของ AR1");
    else {
      const rp = await replay("chat.message.received", ev, 2, 2);
      if (rp) p.push(rp);
      await RC("onChatMessageReceivedBot", ev, { now: new Date(Date.now() + HOUR) });
      await settle();
      const b = (await botsOf(AC.a1!.id)).filter((m: Any) => m.clientMessageId === `pos:bot:${AR1_IN}`);
      if (b.length !== 1) p.push(`คำตอบของข้อความ AR1 ${b.length} (คาด 1)`);
    }
    chk("AR7", !fx && !NR() && p.length === 0, "เล่นซ้ำ = คำตอบเดิม", why(p, NR()));
  });

  await step("AR8", async () => {
    const p: string[] = [];
    const deltas: number[] = [];
    for (const [c, on] of [[AC.m1!, false], [AC.m2!, true]] as const) {
      const ct = await P.chatConversation.findUnique({ where: { id: c.id }, select: { contactId: true } });
      const ln = await chatSvc.linkCustomer({ tenantId: T, systemId: S.CHAT, contactId: ct?.contactId ?? "none", actorUserId: uid("OWNER"), customerId: M.M4?.id ?? null, unitAccess: ["*"] });
      if (!ln?.ok) p.push(`(fixture) linkCustomer ${short(ln?.reason, 40)}`);
      await setChat({ autoReply: on });
      const a0 = Number(await P.memberActivity.count({ where: { tenantId: T, customerId: M.M4?.id ?? "none" } }).catch(() => -1));
      const inb = await say(c, on ? "สถานะออเดอร์" : "สวัสดีอีกครั้ง");
      const a1 = Number(await P.memberActivity.count({ where: { tenantId: T, customerId: M.M4?.id ?? "none" } }).catch(() => -1));
      deltas.push(a1 - a0);
      const ev = await chatEvtOf(inb);
      if (!ev || ev.status !== "DONE" || ev.lastError) p.push(`${c.label}: event ${short([ev?.status, ev?.lastError], 80)}`);
    }
    await setChat({ autoReply: true });
    if (deltas[0] !== deltas[1]) p.push(`ไทม์ไลน์สมาชิก ปิด +${deltas[0]} · เปิด +${deltas[1]} (คาดเท่ากัน)`);
    chk("AR8", !fx && p.length === 0, "ตัวรับเดิมของแชททำงานเท่าเดิม", why(p, `ไทม์ไลน์ ${deltas.join("/")} · `));
  });

  // ════════ X ข้ามร้าน ════════
  let CONVX: Conv | null = null;
  await step("X1", async () => {
    const p: string[] = [];
    CONVX = WEBX ? await newConv("x1", WEBX) : null;
    if (!CONVX?.id) p.push("(fixture) ไม่มีห้อง T2");
    else {
      const key = newKey("xconv");
      const r = await call(ord, "ingestOrder", ctxU("A", DEV1), A("OWNER"), { channelCode: "CHAT", idempotencyKey: key, lines: [{ productId: PRD, qty: 1 }], customer: { name: CUST_NAME }, fulfilment: "PICKUP", chatConversationId: CONVX.id });
      if (!refused(r, "VALIDATION") || r.messageKey !== "orders.errors.conversationNotFound") p.push(`→ ${codeOf(r)} ${short(r?.messageKey, 40)} (คาด VALIDATION conversationNotFound)`);
      if (await P.posOrder.count({ where: { tenantId: T, idempotencyKey: key } })) p.push("มีออเดอร์");
    }
    chk("X1", !fx && p.length === 0, "ห้องของร้านอื่น = VALIDATION", why(p));
  });

  await step("X2", async () => {
    const p: string[] = [];
    const cx = CONVX as Conv | null;
    if (!cx?.id) p.push("(fixture) ไม่มีห้อง T2");
    else {
      const n = await call(SEAM("notifyCustomer"), "notifyCustomer", { tenantId: T, target: { conversationId: cx.id }, text: "qc ข้ามร้าน", dedupeKey: `pos:qc:${RAND}:x2`, kind: "qc" });
      if (!refused(n, "NO_CONVERSATION")) p.push(`notifyCustomer → ${codeOf(n)} (คาด NO_CONVERSATION)`);
      const b = await call(SEAM("botContext"), "botContext", { tenantId: T, conversationId: cx.id });
      if (b !== null && !(b?.ok === false && !b?.missing)) p.push(`botContext → ${short(b, 60)} (คาด null)`);
      const l = await call(root, "ordersForChatCustomer", { tenantId: T, conversationId: cx.id });
      if (l?.missing || (l?.ok === true && Array.isArray(l.orders) && l.orders.length)) p.push(`ordersForChatCustomer → ${codeOf(l)}`);
      const mm = await call(root, "mintChatPreorderLink", { tenantId: T, conversationId: cx.id });
      if (mm?.ok !== false || mm?.missing) p.push(`mintChatPreorderLink → ${codeOf(mm)} (คาด ok:false)`);
      if (await P.chatMessage.count({ where: { conversationId: cx.id, direction: "OUT" } })) p.push("ห้อง T2 มีข้อความ OUT");
    }
    const foreign = (await P.chatMessage.findMany({ where: { tenantId: T2, clientMessageId: { startsWith: "pos:" } } }).catch(() => [])) as Any[];
    if (foreign.length) p.push(`ร้าน T2 มีแถว pos:* ${foreign.length}`);
    const mine = await posMsgs();
    const convT = new Set(((await P.chatConversation.findMany({ where: { id: { in: mine.map((m: Any) => m.conversationId) } }, select: { id: true, tenantId: true } }).catch(() => [])) as Any[]).filter((c) => c.tenantId === T).map((c) => c.id));
    if (mine.some((m: Any) => !convT.has(m.conversationId))) p.push("แถว pos:* อยู่ในห้องที่ไม่ใช่ของร้าน T");
    chk("X2", !fx && !NR() && p.length === 0, "ทุกแถวผูกร้าน · ห้องร้านอื่นไม่ได้รับ", why(p, NR()));
  });

  // ════════ PV ข้อมูลส่วนตัว ════════
  await step("PV1", async () => {
    const p: string[] = [];
    const rows = await posMsgs();
    if (!rows.length) p.push("ไม่มีข้อความ pos:* ให้ตรวจ (ตัวควบคุมบวก)");
    const secrets = [PHONE, PHONE_FMT, CUST_NAME, ...Object.values(M).flatMap((m) => [m.phone, m.name, m.lineUid].filter(Boolean))];
    for (const m of rows) {
      const b = String(m.body ?? "");
      const hit = secrets.find((s) => s && b.includes(s));
      if (hit) p.push(`${m.clientMessageId}: มี ${hit.slice(0, 12)}`);
      if (PHONE_RE.test(stripUrls(b))) p.push(`${m.clientMessageId}: รูปเบอร์`);
      if (CARD_RE.test(stripUrls(b))) p.push(`${m.clientMessageId}: รูปเลขบัตร`);
    }
    chk("PV1", !fx && p.length === 0, "ข้อความไม่มีข้อมูลส่วนตัว", why(p, `ตรวจ ${rows.length} แถว · `));
  });

  await step("PV2", async () => {
    const p: string[] = [];
    const aud = (await P.auditLog.findMany({ where: { tenantId: T, action: "pos.receipt.auto_sent" } }).catch(() => [])) as Any[];
    const ops = ((await P.opsEvent.findMany({ where: { tenantId: T } }).catch(() => [])) as Any[]).filter((o) => [o.source, o.message, o.detail].join(" ").includes("pos.chat.notify"));
    if (!aud.length) p.push("ไม่มี audit pos.receipt.auto_sent ให้ตรวจ");
    if (!ops.length) p.push("ไม่มี ops pos.chat.notify ให้ตรวจ");
    const bodies = (await posMsgs()).map((m: Any) => String(m.body ?? "")).filter((b: string) => b.length >= 12);
    const secrets = [PHONE, PHONE_FMT, CUST_NAME, ...Object.values(M).flatMap((m) => [m.phone, m.name, m.lineUid].filter(Boolean))];
    for (const [lbl, txt] of [...aud.map((a) => ["audit", JSON.stringify([a.before, a.after])] as const), ...ops.map((o) => ["ops", [o.message, o.detail].join(" ")] as const)]) {
      const hit = secrets.find((s) => s && txt.includes(s));
      if (hit) p.push(`${lbl}: มี ${hit.slice(0, 12)}`);
      if (bodies.some((b: string) => txt.includes(b))) p.push(`${lbl}: มีเนื้อความข้อความ`);
      if (PHONE_RE.test(stripUrls(txt))) p.push(`${lbl}: รูปเบอร์`);
    }
    chk("PV2", !fx && p.length === 0, "audit/ops มีแต่รหัส", why(p, `audit ${aud.length} · ops ${ops.length} · `));
  });
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งสอง + ผู้ใช้ชั่วคราว + ถังอัตรา ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; usersLeft: number; bucketsLeft: number; err: string };
async function wipeTenants(): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, bucketsLeft: 0, err: "" };
  const targets = ([[T, T_SLUG, "T"], [T2, T2_SLUG, "T2"]] as [string, string, string][]).filter(([id]) => !!id);
  if (targets.length) {
    for (const [id, slug] of targets) {
      const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, id)) as Any[];
      if (t.length && t[0].slug !== slug) {
        rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
        return rep;
      }
    }
    await drain();
    await sleep(300);
    const tables = ((await P.$queryRawUnsafe(
      `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
       WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
    )) as Any[]).map((r: Any) => String(r.t));
    rep.tables = tables.length;
    for (const [id, slug, lbl] of targets) {
      await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, id).catch(() => {});
      let pending = [...tables];
      for (let pass = 0; pass < 10 && pending.length; pass++) {
        const next: string[] = [];
        for (const tb of pending) {
          try {
            await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id);
          } catch {
            next.push(tb);
          }
        }
        pending = next;
      }
      try {
        await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, id, slug);
      } catch (e) {
        rep.err = [rep.err, `ลบ Tenant ${slug} ไม่ได้: ${(e as Error).message.slice(0, 80)}`].filter(Boolean).join(" · ");
      }
      for (const tb of tables) {
        try {
          const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, id)) as Any[])[0]?.n ?? 0);
          if (n) rep.left[`${lbl}.${tb}`] = n;
        } catch {
          rep.left[`${lbl}.${tb}`] = -1;
        }
      }
      rep.tenantLeft += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, id)) as Any[])[0]?.n ?? 0);
    }
  }
  try {
    await P.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX, endsWith: "@qc.invalid" } } });
    rep.usersLeft = Number(await P.user.count({ where: { email: { startsWith: EMAIL_PREFIX } } }));
  } catch (e) {
    rep.err = [rep.err, `ลบผู้ใช้ไม่ได้: ${(e as Error).message.slice(0, 80)}`].filter(Boolean).join(" · ");
  }
  try {
    const keys = [...SEEN_CONVS, ...SEEN_TOKENS].filter(Boolean);
    const where = `key LIKE $1 OR EXISTS (SELECT 1 FROM unnest($2::text[]) t WHERE position(t IN key) > 0)`;
    await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE ${where}`, `%${RAND}%`, keys);
    rep.bucketsLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE ${where}`, `%${RAND}%`, keys)) as Any[])[0]?.n ?? 0);
  } catch (e) {
    rep.err = [rep.err, `ลบถังอัตราไม่ได้: ${(e as Error).message.slice(0, 80)}`].filter(Boolean).join(" · ");
  }
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
let wipe: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, bucketsLeft: 0, err: "" };
try {
  await runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    wipe = await wipeTenants();
    const residue = Object.values(wipe.left).reduce((a, b) => a + Math.abs(b), 0) + wipe.tenantLeft + wipe.usersLeft + wipe.bucketsLeft;
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"} + ${T2 || "-"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft} · ผู้ใช้ ${wipe.usersLeft} · ถังอัตรา ${wipe.bucketsLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
  } catch (e) {
    wipe.err = `cleanup: ${(e as Error).message.slice(0, 200)}`;
    console.log(`💥 ${wipe.err}`);
  } finally {
    removeFetchGuard();
  }
}
if (guardHits.length) console.log(`  ℹ️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits.map((h) => h.host))].join(", ")}`);
await sleep(200);
const tempLeft = Object.entries(wipe.left).map(([k, v]) => `${k}:${v}`);
chk("Z1", tempLeft.length === 0 && wipe.tenantLeft === 0 && wipe.usersLeft === 0 && wipe.bucketsLeft === 0 && !wipe.err, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0 · ถังอัตรา 0",
  [tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "แถว Tenant ยังอยู่" : "", wipe.usersLeft ? `ผู้ใช้เหลือ ${wipe.usersLeft}` : "ผู้ใช้ 0", wipe.bucketsLeft ? `ถังอัตราเหลือ ${wipe.bucketsLeft}` : "ถังอัตรา 0", wipe.err].filter(Boolean).join(" · "));
/** รอยของรอบนี้นอกร้านชั่วคราว (ตัวตัดสิน Z2 — ไม่ไวต่อ lane อื่นที่เขียนพร้อมกัน) */
async function leaksOutside(): Promise<string[]> {
  const out: string[] = [];
  const n = async (lbl: string, f: () => Promise<unknown>) => {
    try {
      const v = Number(await f());
      if (v) out.push(`${lbl}:${v}`);
    } catch (e) {
      out.push(`${lbl}:err ${(e as Error).message.slice(0, 40)}`);
    }
  };
  const since = new Date(RUN_START - MIN);
  const like = `%${RAND}%`;
  await n("posSale", () => P.posSale.count({ where: { idempotencyKey: { contains: KEY_PREFIX } } }));
  await n("posOrder", () => P.posOrder.count({ where: { idempotencyKey: { contains: KEY_PREFIX } } }));
  await n("posProduct", () => P.posProduct.count({ where: { name: { contains: RAND }, createdAt: { gte: since } } }));
  await n("chatContact", () => P.chatContact.count({ where: { externalUserId: { contains: RAND } } }));
  await n("auditLog", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "createdAt" >= $1 AND (coalesce("after"::text,'') || coalesce("before"::text,'')) LIKE $2`, since, like)) as Any[])[0]?.n);
  await n("outboxEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "createdAt" >= $1 AND ("payload"::text LIKE $2 OR "idempotencyKey" LIKE $2)`, since, like)) as Any[])[0]?.n);
  await n("opsEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OpsEvent" WHERE "createdAt" >= $1 AND (coalesce("message",'') || coalesce("detail",'')) LIKE $2`, since, like)) as Any[])[0]?.n);
  await n("tenant", () => P.tenant.count({ where: { slug: { startsWith: T_SLUG } } }));
  return out;
}
const leaks = await leaksOutside();
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("Z2", leaks.length === 0, "ไม่มีรอยของรอบนี้นอกร้านชั่วคราว (ลายนิ้วมือ = ข้อมูล)",
  [leaks.length ? `หลุด ${leaks.join(", ")}` : "ไม่มีรอย", fpDrift.length ? `(ข้อมูล · lane อื่นอาจเขียน) ลายนิ้วมือต่าง ${fpDrift.join(", ")}` : `ลายนิ้วมือร้านอื่นเท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`].join(" · "));
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, crashed: crashed || null, missing: skipReasons, guardHits: guardHits.length, residue: tempLeft.length + wipe.tenantLeft + wipe.usersLeft + wipe.bucketsLeft, leaks, fpDrift })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P3.7 S: การ์ดแชทในหน้าตั้งค่า (สวิตช์ + ข้อความโควตา) · ปุ่ม "ส่งลิงก์ชำระในแชท"/ชิป "แจ้งในแชทแล้ว" บนจอ 09 · ชื่อ/ระดับสมาชิกบนแผงออเดอร์ (UI-13) ·
//   ชิป PayDone "ส่งทาง LINE อัตโนมัติ" · หน้าตาข้อความบอทในห้องแชท (P3.7U · visual-pos p3.7u) · flex/rich card · FB/IG/WA · reply token (โมดูลแชท) ·
//   คำตอบ FAQ/KB/LLM (P3.9) · แต้ม/memberId บนบิลออเดอร์ (Q7 → P3.6) · ตัวแก้ข้อความ (Q6)
//   ชุด regression (§4): qc-pos-* ทั้งหมด (p1.11 p1.18 p2.6 p2.7 p2.8 p2.14 G1) · qc-hf-tx · qc-hf-fu · ชุดแชท (core-v2 notify(-v2) replies security(-scope)
//   member-autolink v2-room retention api-v1) · ชุดสมาชิกที่ระบาย pos.sale.paid · qc-account-cpa · ชุดเงิน · fitness ±env · fitness-pos · gen-pos-api-docs --check · typecheck 8192
