// QC — POS RUN ใบ P2.7: QR สั่ง / สั่งล่วงหน้าจ่ายก่อน (PENDING_PAYMENT → PREPAID → บิลตอนรับ) · QR โต๊ะย้ายมาประตู POS (/q/t/<qrToken>)
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ (oracle writer) · ไม่ต้องมี seed (ร้านชั่วคราว + ผู้ใช้ชั่วคราวของตัวเอง)
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.7.md §1–§4 · §6 แผนข้อสอบ · §7 CD1–CD7 · §10 มติผู้คุม 1–16 (ผูกมัด — §10 ชนะ §6) ·
//        ตารางชื่อ = ledger/wo-notes/pos-P2.7-oracle.md (ผู้สร้าง S ห้ามแก้ข้อสอบนี้ — ORACLE-EDIT ของผู้คุมเท่านั้น)
//        ต่อยอด: qc-pos-p2.8 (ร้านชั่วคราว · ช่องทาง · ออเดอร์) · qc-pos-p1.7 (ใบขอรับเงิน · Beam ปลอมผ่าน deps · webhook) ·
//        qc-pos-p2.4 (L1/L3 ฐานของประตูเดิม · exportSigs) · qc-pos-p2.6 (เมนู/สถานี/โต๊ะ · 86 · pos.product.availability) ·
//        qc-pos-p2.10 (หน้าสาธารณะ · จอลูกค้า · 0 เขียนต่อโพล) · qc-pos-p1.3 (quoteRegisterCart) · qc-pos-p2.13 (REST orders · OR1)
//
// ของที่ใบ P2.7 S ต้องส่ง (ย่อ — ละเอียดในโน้ต):
//   migration `<ts>_pos_p27_qr_orders` (ts > ทุก migration เดิม): lock_timeout 3s · ALTER TYPE ADD VALUE IF NOT EXISTS PENDING_PAYMENT/PREPAID/QR ·
//     PosOrder + payBy paidAt paymentIntentId publicToken(unique) customerClaimAt · PosPaymentIntent + orderId · deviceId/createdByUserId DROP NOT NULL ·
//     ตาราง PosOrderLink (ไม่มี FK) · index (tenantId, unitId, paymentState, payBy) · ไม่แตะ schema ร้านอาหาร
//   pos/qr-order-shared.ts (บริสุทธิ์) · pos/qr-order.ts (ประตูสาธารณะ — ไม่เขียน PosOrder*/PosPaymentIntent/Restaurant* เอง) ·
//   order.ts (บล็อก POS P2.7: ingestPreorderInTx · onIntentPaid · กิ่ง PREPAID ใน acceptInTx · expirePreorders · ลิงก์สั่งล่วงหน้า) ·
//   payment-intent.ts createIntentForOrderInTx · restaurant/index.ts (บล็อก POS P2.7: guestRoundInTx guestTableViewForPos rotateTableQrForPos) ·
//   pos/table.ts registerRotateTableQr · channel-shared QR_ORDER · order-adapters QR · outbox-consumers intent_paid · cron hourly expirePreorders ·
//   regResolveOptions ย้ายไปไฟล์ shared บริสุทธิ์ (register.ts = hunk import เท่านั้น) · หน้า (store)/q/** + actions.ts · ข้อความ pos.qr.*
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p2.8): SKIP เมื่อของ P2.7 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST4 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p27-<rand>` + `-t2` (ร้านอื่นมี POS) + `-t3` (ไม่มี POS) + ผู้ใช้
//    `posqc-p27-<rand>-*@qc.invalid` (ลบทั้งหมดใน finally · แถวค้าง = 0) · ไม่มีเครือข่าย (fetch = ตัวกั้น 503 · Beam = ตัวปลอมผ่าน deps) · ทุกข้อห่อ try/catch
//    fixture ผ่านฟังก์ชันของโมดูล · Prisma ตรงเฉพาะ Tenant/BusinessUnit/User/Membership/AccountSystemLink/PaymentProfile ·
//    AppSystem.settings.pos.payment (เปิด Beam/manualConfirmRequiresManager แบบ qc-pos-p1.7) · ย้อนเวลา payBy/expiresAt ของแถวทดสอบ (PY8 PY9) ·
//    SQL ดิบ = xmin / information_schema / ลายนิ้วมือ + ลบร้านชั่วคราว + ลบถังอัตรา ChatRateBucket ของรอบนี้เท่านั้น
//    โมดูล/ฟังก์ชัน/โมเดลที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + ตรวจว่ามี) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.7";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · X1 idempotency/เล่นซ้ำ/แข่ง · X2 ข้ามขอบเขต/โทเคน · X3 สิทธิ์ · X4 เงิน/จำนวน · X5 ไม่เขียนอะไร · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.7-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[R1 มติ 8 10 12] schema + migration เพิ่มอย่างเดียว: enum PosOrderPaymentState + PENDING_PAYMENT PREPAID · SalesChannelAdapter + QR · PosOrder + payBy/paidAt/customerClaimAt DateTime? · paymentIntentId String? · publicToken String? @unique · @@index([tenantId, unitId, paymentState, payBy]) · PosPaymentIntent + orderId String? · deviceId/createdByUserId String? · model PosOrderLink (id tenantId systemId unitId token @unique status createdByUserId rotatedAt? · ไม่มี @relation) · schema ร้านอาหาร/PosSale/SalesChannel/PosOrderLine/PosOrderEvent ไม่เปลี่ยน · migration เดียว `<ts>_pos_p27_qr_orders` (ts ใหม่กว่าทุก migration เดิม) คำสั่งในรายการเท่านั้น (lock_timeout 3s · ADD VALUE IF NOT EXISTS ×3 · ADD COLUMN IF NOT EXISTS · DROP NOT NULL ×2 · CREATE TABLE IF NOT EXISTS PosOrderLink ไม่มี REFERENCES · CREATE [UNIQUE] INDEX IF NOT EXISTS) · scope.ts PosOrderLink: sys() · pos-qc-env POS_MODELS posOrderLink"),
  D("ST2", "S", "[R2 R4 มติ 2 13 hard rules] ไฟล์/ชื่อ/ผู้เขียนเดียว: qr-order-shared บริสุทธิ์ + export ค่าคงที่/ตัวแกะตามตารางชื่อ (QR_REFUSAL_CODES = 5 รหัส · โทเคน 16/12 ตัว Crockford · 30 บรรทัด/qty 50/โน้ต 200/ชื่อ 100 · normalizeThaiPhone · qrRefusalMessageKey) · qr-order.ts export ประตูสาธารณะครบ + ไม่เขียน PosOrder*/PosPaymentIntent/Restaurant*/TableSession เอง + ไม่ import session/auth + ร้านอาหารผ่าน import(\"@/lib/modules/restaurant\") เท่านั้น · ผู้เขียน PosOrder*/PosOrderLink = order.ts · PosPaymentIntent = payment-intent.ts · order.ts บล็อก // POS P2.7 ▸ … ◂ (ingestPreorderInTx · onIntentPaid · กิ่ง PREPAID ใน acceptInTx ที่ใช้ lockSaleIntents/consumeSaleIntents · expirePreorders · ลิงก์) + createSale( จุดเดียวใน orderCreateSale · payment-intent.ts createIntentForOrderInTx · restaurant/index.ts บล็อก POS P2.7 export guestRoundInTx guestTableViewForPos rotateTableQrForPos · pos/table.ts registerRotateTableQr · channel-shared QR_ORDER (ท้ายสุด · \"สั่งออนไลน์ (QR)\") · ORDER_ADAPTERS QR: local(\"QR\") · ORDER_INPUT_PAYMENT_STATES = UNPAID PAY_ON_PICKUP · outbox-consumers intent_paid เรียก onIntentPaid (บล็อก POS P2.7) · cron hourly เรียก expirePreorders"),
  D("ST3", "S", "[มติ 1 5 9 CD7] ของเดิม: register.ts ต่างจากฐานเฉพาะการย้าย regResolveOptions (+ RegOptGroup/RegOptChoice/RegPickedOption) ไปไฟล์ *-shared บริสุทธิ์แล้ว import กลับ · service.ts tender.ts pos-sale-contract.json sha = ฐาน · ทะเบียนผู้เรียก createSale = ฐาน (order.ts ยัง 1 จุด) · ลายเซ็น export ของ restaurant/{table,order,menu,kds,storefront,scope}.ts = ฐาน P2.4 L3 · storefront.ts + api/store/…/restaurant/** + components/restaurant-qr.tsx ตรงฐานทุกไบต์ · restaurant/order.ts createOrder/writeOrderTx/cancelOrderItem/billPreview/placeGuestOrder ตรงฐาน (ตัวแทนสถิตของ S2.42) — ฐาน = 62a319cc หรือ หมุดของเลน 05975437"),  // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin): คำอธิบายฐาน = หมุดของเลน (K3)
  D("ST4", "S", "[§3 มติ 1 11 15 hard rules · ST7] หน้า (store)/q/t/[qrToken] · (store)/q/[linkToken] · (store)/q/o/[orderToken]: force-dynamic · noindex · ไม่ import session/auth · ไม่มี new Date()/Date.now() ในหน้า SSR · notFound() เมื่อโทเคนผิดรูป · (store)/q/actions.ts \"use server\" async ล้วน + เรียก qr-order · 'use client' import ได้แค่ *-shared/*-actions · 0 อักษรไทยในโค้ด (store)/q/** + components/pos/qr/** · pos.json th/en ก้อน qr.* คีย์ชุดเดียวกัน (th มีไทย · en ไม่มี) + qr.errors.{qrClosed sessionChanged tokenInvalid rateLimited preorderExpired productUnavailable validation} · หน้าเดิม restaurant/t/[qrToken]/page.tsx = ฐาน + บรรทัดในบล็อก // POS P2.7 ▸ … ◂ ที่ redirect ไป /q/t/ เท่านั้น"),
  // ── TK โทเคน ──
  D("TK1", "X2", "[§3 มติ 11] โทเคนโต๊ะ: tableDoor(qrToken A1) = สาขา A (ชื่อสาขา/โต๊ะ · เมนูราคา QR_TABLE ของ A) · qrToken B1 = สาขา B · โต๊ะที่เก็บถาวร/ปิดใช้ → TOKEN_INVALID · รอบที่ส่งด้วยโทเคน A ลงสาขา A เท่านั้น (สาขา B 0 แถว)"),
  D("TK2", "X3", "[§3 มติ 11] เปลี่ยน QR: registerRotateTableQr โดย STAFF (ไม่มี restaurant.table.rotateQr) → PERMISSION_DENIED (โทเคนเดิม) · OWNER → โทเคนใหม่ · โทเคนเก่า → TOKEN_INVALID ทั้ง tableDoor/placeTableRound (0 แถว) · โทเคนใหม่ใช้ได้"),
  D("TK3", "X3", "[§3 มติ 11] ลิงก์สั่งล่วงหน้า: createOrderLink/rotateOrderLink/revokeOrderLink โดย STAFF (ไม่มี pos.channel.manage) → PERMISSION_DENIED · OWNER: create ซ้ำ = ลิงก์เดิม (ACTIVE 1 ต่อสาขา) · token 16 ตัว Crockford · rotate → ลิงก์ใหม่ ACTIVE เก่า REVOKED (linkDoor เก่า TOKEN_INVALID) · revoke → TOKEN_INVALID · ACTIVE ของสาขา ≤ 1 ตลอด"),
  D("TK4", "X2", "[§3 มติ 11] ไม่มีช่องรู้ว่ามีอยู่: โทเคนมั่วรูปถูก / ผิดรูป / ลิงก์ที่ revoke / qrToken โต๊ะส่งเข้า linkDoor / ลิงก์ส่งเข้า orderStatus / โทเคนออเดอร์มั่ว / ลิงก์ร้าน T2 ที่ถูก revoke → TOKEN_INVALID รูปเดียวกันทุกตัว (code + messageKey + message เท่ากัน) · orderStatus ต้องใช้ publicToken 12 ตัวของออเดอร์ · ไม่มีแถวใหม่"),
  D("TK5", "-", "[มติ 1 CD7] legacyTableQrRedirect(tenant, unit, qrToken): สาขาที่มี POS ผูก → \"/q/t/<qrToken>\" · ร้านไม่มี POS (T3) → null · โทเคนไม่ใช่ของสาขานั้น → null · (หน้าเดิม redirect ไปปลายทางนี้ = สถิตใน ST4 · 307/308 จริง = CONTROLLER-RUN)"),
  // ── PO ออเดอร์สาธารณะ ──
  D("PO1", "X4", "[§3 R3 P2.2] เมนูสาธารณะ: linkDoor สาขา A = สินค้าที่ขายในช่องทาง QR_ORDER ราคา ผัดไทย 8000 priceSource CHANNEL · น้ำ 1000 BASE · ชาเย็น (notSold QR_ORDER) ไม่อยู่ · ส้มตำ (86) อยู่แต่ available false · tableDoor A1 ผัดไทย 7500 CHANNEL · ตัวเลือก (กลุ่ม/ตัวเลือก/ส่วนต่าง) ตรงแคตตาล็อก"),
  D("PO2", "X5", "[§2 S7 มติ 16 P2.8] 86/ไม่ขาย: placePreorder ส้มตำ (86) → PRODUCT_UNAVAILABLE lineIndex 1 · ชาเย็น notSold → CHANNEL_NOT_SOLD|PRODUCT_UNAVAILABLE lineIndex 0 · placeTableRound ส้มตำ → PRODUCT_UNAVAILABLE · ไม่มี PosOrder/intent/รอบ/session ใหม่"),
  D("PO3", "X5", "[R3 CD4] ตัวเลือก: ต้มยำ (กลุ่มบังคับ) ไม่เลือก → OPTIONS_REQUIRED · choiceId ของกลุ่มอื่น → OPTIONS_INVALID (lineIndex) · ไม่มีแถว · ผัดไทย + ไข่ดาว (+1000) → บรรทัด 9000 options สำเนา (ทั้งสั่งล่วงหน้าและรอบโต๊ะ)"),
  D("PO4", "X4", "[R3 CD4 มติ 9] quote สาธารณะ = เครื่องคิดราคาหน้าขาย: quotePreorderCart(link) ยอด/ราคาต่อบรรทัด = quoteRegisterCart(OWNER, channelId QR_ORDER) · quoteTableCart(qrToken) ราคาต่อบรรทัด/ยอดก่อนค่าบริการ = quoteRegisterCart(channelId QR_TABLE) · quote ไม่เขียนอะไร"),
  D("PO5", "X5", "[§3 มติ 11] ประตูปิด → QR_CLOSED: QR_ORDER ปิดใช้ (active false) · พักรับ (pausedUntil) · ครัวหยุดรับ · วันนี้ร้านปิด (specialClosures) → placePreorder QR_CLOSED + linkDoor open:false แต่ยังเห็นเมนู · QR_TABLE ปิดใช้ → placeTableRound QR_CLOSED · ไม่มีแถวใหม่ · เปิดคืนแล้วสั่งได้"),
  D("PO6", "X5", "[§3 มติ 11 R4 PDPA] ขีดจำกัด + ข้อมูลส่วนตัว: IP เดียว 11 ครั้ง/นาที → ครั้งที่ 11 RATE_LIMITED (0 แถว) · ไม่มีเบอร์ / เบอร์ผิดรูป / ชื่อ 101 ตัว / 31 บรรทัด / qty 51 / โน้ต 201 → VALIDATION · คำปฏิเสธสาธารณะ = {ok:false, code, messageKey qr.errors.* ที่มีทั้ง th/en, message?, lineIndex?, retryAfterSec?} เท่านั้น · ผลอ่านสาธารณะ (linkDoor tableDoor orderStatus tableBill) ไม่มีเบอร์เต็ม/ชื่อพนักงาน/รหัสสมาชิก · เบอร์ที่เก็บ = รูปปกติ 0XXXXXXXXX"),
  // ── PY จ่ายก่อน ──
  D("PY1", "X4", "[S1 S2 มติ 3 4 8] placePreorder (STATIC) → PosOrder QR_ORDER adapter QR NEW PENDING_PAYMENT PICKUP · publicToken 12 ตัว · payBy = receivedAt + qrExpiryMinutes (20) · 1 intent PROMPTPAY_STATIC PENDING ยอด = total · expiresAt = payBy · orderId · deviceId/createdByUserId null · คีย์ posorder-pay-<id> · paymentIntentId · 0 บิล/รอบครัว/สต็อก · counts.byColumn.new ไม่เพิ่ม · orderStatus = QR ของใบเดียวกัน (payload/ยอด/หมดเวลา) · pos.order.received 1 (paymentState PENDING_PAYMENT)"),
  D("PY2", "X1", "[S6] คีย์เดิม ×2 → ออเดอร์เดิม + intent เดิม (duplicated true · ไม่มีแถวเพิ่ม) · 10 คำขอพร้อมกันคีย์ใหม่ (IP ต่างกัน) → ออเดอร์ 1 · intent 1 · ผล ok ทั้งหมดชี้ใบเดียวกัน · (fix 2 hunter H5) 10 พร้อมกันคีย์เดียวกันบน Beam → createCharge 1 ครั้ง"), // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.7 fix 2)
  D("PY3", "X5", "[S1 มติ 8] acceptOrder ออเดอร์ PENDING_PAYMENT (OWNER) → ORDER_UNPAID · version เดิม · ไม่มีบิล/รอบครัว/event ใหม่ · payOrder → ORDER_STATE_INVALID"),
  D("PY4", "X1", "[S3 มติ 3 13] Beam (ร้านเปิด + deps.beam): intent PROMPTPAY_BEAM · createCharge 1 ครั้ง {total, pos-<pi>, promptpay} · webhook SUCCEEDED → ระบาย ×2 → PREPAID + paidAt · event paid 1 · version +1 · counts.new +1 · webhook ซ้ำ + consumers[pos.payment.intent_paid] ซ้ำ ×2 → ไม่เปลี่ยน · ยังไม่มีบิล (autoAccept ปิด)"),
  D("PY5", "X4", "[S3 S4 มติ 5] autoAccept เปิด + Beam จ่าย → ACCEPTED (acceptedBy null) + บิล POS sourceId ออเดอร์ คีย์ posorder-<id> · PosPayment PROMPTPAY = total ref pi_ · channel QR_ORDER ref = code · shift null · intent CONSUMED saleId · PAID · รอบครัว 1 · น้ำ (นับสต็อก) −1 ครั้งเดียว · GL ของบิล = รูปเดียวกับบิลหน้าขาย PROMPTPAY pi_ ยอดเดียวกัน"),
  D("PY6", "X4", "[S4 มติ 5 P2.8 มติ 10] PREPAID (autoAccept ปิด) → acceptOrder โดย STAFF ที่เครื่อง DEV1 → บิล shiftId = กะ DEV1 · soldBy STAFF · intent CONSUMED · PAID · บิล 1 · รับซ้ำ → ORDER_STATE_INVALID (บิลยัง 1)"),
  D("PY7", "X3", "[S3 มติ 3] QR นิ่ง: claimPaid → event customer_paid_claim + customerClaimAt (ไม่มีผลเงิน · ยัง PENDING_PAYMENT) · manualConfirmRequiresManager เปิด: STAFF confirmPaymentIntentManual → PERMISSION_DENIED (ยัง PENDING) · MANAGER → PAID → ระบาย → PREPAID (event paid 1 · ทางเดียวกับ Beam)"),
  D("PY8", "X1", "[S2] หมดเวลา: ย้อน payBy/expiresAt → orderStatus (ขี้เกียจ) → CANCELLED event expired (reason PAYMENT_EXPIRED) + intent EXPIRED · อ่านซ้ำไม่เขียนเพิ่ม · claimPaid → PREORDER_EXPIRED · ออเดอร์ที่สอง expirePreorders ×2 → 1 แล้ว 0 · ยืนยันเองหลังหมดเวลา → INTENT_EXPIRED"),
  D("PY9", "X4", "[S5 มติ 5] เงินเข้าหลังหมดเวลา (Beam): ออเดอร์ CANCELLED (หมดเวลา) + webhook → ไม่ฟื้น (CANCELLED version เดิม · ไม่มีบิล) · ops ERROR pos.order.late_payment 1 แถว (เล่นซ้ำ ×2 ยัง 1) · intent PAID lateWebhook ไม่ถูกใช้ · หน้าขายใช้ pi_ นี้จ่ายบิลได้ (PROMPTPAY ref pi_ → CONSUMED)"),
  D("PY10", "X5", "[S4 S5 มติ 5] PREPAID ถูกปฏิเสธ → REJECTED · intent ยัง PAID ไม่ถูกใช้ · ops ERROR pos.payment.refund_needed 1 · ไม่มีบิล · BLOCK ไข่เค็ม (เหลือ 1 สั่ง 2) PREPAID → accept STOCK_INSUFFICIENT · ยัง NEW/PREPAID version เดิม 0 บิล 0 event · payOrder ออเดอร์ QR → ORDER_STATE_INVALID"),
  D("PY11", "X2", "[มติ 10 CD5] ใบขอรับเงินของออเดอร์ (deviceId null) ไม่โผล่ในจอลูกค้า P2.10 ของ DEV1 (publish paying ที่อ้าง intent ของออเดอร์ → view.pay.qr ไม่ใช่ใบนั้น) · xReport กะ DEV1 ไม่เปลี่ยนจากการสร้าง/จ่าย intent ของออเดอร์ (ก่อนรับ)"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.7 fix 2) R1 F2: ใบของออเดอร์ผูกกับออเดอร์ (lockSaleIntents forOrderId)
  D("PY12", "X2", "[R1 F2 · hunter H1] ใบของออเดอร์ที่ยังเปิดอยู่ (PENDING_PAYMENT · PREPAID) → บิลหน้าขาย / มัดจำ อ้าง pi_ นี้ (ยอดเท่ากัน) ถูกปฏิเสธ INTENT_* · 0 บิล · intent ยัง PAID · ออเดอร์ยัง PREPAID · หลังออเดอร์ถูกปฏิเสธ (ปิดแล้ว) หน้าขายใช้ pi_ ได้ (CONSUMED · เงินเข้าหลังปิด 24 ชม.)"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.7 fix 2) hunter H3: ช่องทางปิดกันเฉพาะคำสั่งใหม่
  D("PY13", "X5", "[hunter H3 · มติ 11] PREPAID แล้วร้านปิดช่องทาง QR_ORDER (active false) → acceptOrder ได้ · บิลช่องทาง QR_ORDER · intent CONSUMED · สั่งใหม่ → QR_CLOSED (0 แถว) · (fix 3 G1) บิลหน้าขาย channelId = QR_ORDER ที่ปิดอยู่ → CHANNEL_INVALID (quote + submit · 0 บิล) · เปิดคืน"), // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.7 fix 3)
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.7 fix 2) hunter H4: เงินเข้าหลังหมดเวลาโดยไม่มีใครอ่านสถานะก่อน
  D("PY9b", "X4", "[hunter H4 · S5] Beam: ย้อน payBy/expiresAt โดยไม่อ่านสถานะ/ไม่กวาด → webhook → ระบาย → ออเดอร์ CANCELLED (event expired 1) ไม่ใช่ PREPAID · ops ERROR pos.order.late_payment 1 · intent PAID lateWebhook ไม่ถูกใช้ · ไม่มีบิล"),
  // ── TB QR โต๊ะ ──
  D("TB1", "X5", "[มติ §10 ข้อบกพร่อง 1] เปิดหน้าโต๊ะ + โพล 10 ครั้ง (โต๊ะว่าง A1 · โต๊ะเปิดอยู่ A2) → TableSession 0 แถวใหม่ · xmin ของ session เดิมไม่เปลี่ยน · ไม่มีถังอัตรา/outbox/audit · ตัวควบคุมบวก: ประตูเดิม resolveTableSession บนโต๊ะว่างสร้าง session (+1)"),
  D("TB2", "X4", "[§1 a] รอบแรกของแขก (โต๊ะว่าง A3) → session ใหม่ openedByUserId null + รอบ placedByUserId null + รายการ productId ราคา QR_TABLE 7500 · ไม่มีบิล · ผล {roundId sessionId}"),
  D("TB3", "-", "[§1 a] รอบที่สอง (expectedSessionId = ของรอบแรก) → session เดิม · รอบ 2 · TableSession ของโต๊ะยัง 1"),
  D("TB4", "X1", "[§1 a P2.4 R2] ปิดโต๊ะระหว่างโหลดกับส่ง: session A4 (พนักงานเปิด · ไม่มีรายการ) ปิดแล้วส่ง expectedSessionId เดิม → SESSION_CHANGED · 0 รอบ · ไม่เปิด session ใหม่ · แข่งกัน (ส่งรอบ ∥ registerCloseTable) ×3 → ไม่มีรอบใน session ที่ไม่ OPEN"),
  D("TB5", "-", "[§1 a] โต๊ะที่ถูกรวม: รวม A6 เข้า A5 → รอบจาก QR ของ A6 ลง session ของ A5 · A6 ไม่มี session ใหม่"),
  D("TB6", "X4", "[มติ 6 · §10 ข้อบกพร่อง 2] บิลแขก = บิลโต๊ะของหน้าขาย: tableBill(A3).totalSatang = quoteRegisterCart({tableSessionId}).grandTotalSatang (QR_TABLE + ค่าบริการ POS ปัดครึ่งขึ้น) ≠ billPreview เดิม (ปัดลง · ตัวควบคุม) · PromptPay payload = promptpayPayload(ยอดนั้น) · แจ้งชำระ → คำขอ PAY_PROMPTPAY 1 · แผนแยกบิลเปิดอยู่ → payHidden true + ไม่มี payload"),
  D("TB7", "X1", "[S7 P2.6 ช่องว่าง] ตัวนับเมนู 1 → รอบแขก 1 ชิ้น → ตัวนับ 0 + isOutOfStock · pos.product.availability {available:false source STOCK} 1 แถวพอดี · เล่น consumer ซ้ำ ×2 → ไม่เพิ่ม · รอบถัดไป PRODUCT_UNAVAILABLE"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.7 fix 2) R1 F1: กันส่งรอบซ้ำแบบ single-flight
  D("TB8", "X1", "[R1 F1 · hunter H2 · CD-O7] ส่งรอบเดียวกัน 3 คำขอพร้อมกัน guestToken + ตะกร้าเดียวกัน (โต๊ะว่าง A1) → ผล ok ทุกคำขอ roundId เดียวกัน · รอบ 1 · session 1"),
  // ── KD ครัว ──
  D("KD1", "-", "[S8 P2.6] รอบ QR ของแขกอยู่บนบอร์ดสถานีทันทีที่ส่ง · source QR"),
  D("KD2", "X5", "[S8] ออเดอร์สั่งล่วงหน้า: รอบครัว 0 ตอน PENDING_PAYMENT และ PREPAID · หลังรับ = 1 (source ONLINE)"),
  // ── OR REST (P2.13) ──
  D("OR1", "X5", "[มติ 14] (เมื่อ P2.13 อยู่บน tip) REST POST /orders/{id}/accept บนออเดอร์ PENDING_PAYMENT → 409 ORDER_UNPAID · GET /orders แสดงสถานะใหม่ได้ไม่ 5xx · ยังไม่มี P2.13 = SKIP พร้อมเหตุผล"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว T T2 T3 เหลือ 0 แถวทุกตารางที่มี tenantId (PosOrder*/PosOrderLink/PosPaymentIntent/PosSale*/RestaurantOrder*/TableSession/RestaurantServiceRequest/OutboxEvent/AuditLog/OpsEvent/InvMovement/AccountJournal*/ApiKey …) · Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0 · ถังอัตรา ChatRateBucket ของรอบนี้ 0"),
  D("Z2", "-", "รอยของรอบนี้นอกร้านชั่วคราว = 0 (PosOrder/PosSale คีย์ · InvItem sku · AuditLog/OutboxEvent/OpsEvent ที่มีรหัสรอบ · Tenant slug) · ลายนิ้วมือร้านอื่น (PosOrder PosPaymentIntent TableSession RestaurantOrder SalesChannel) ก่อน/หลังพิมพ์เป็นข้อมูล"),
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
const results = new Map<string, { ok: boolean; expected: string; actual: string; skipped?: boolean }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = id.startsWith("P2.7-") ? id : `P2.7-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)?.slice(0, 120)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
/** ข้อที่ข้ามได้ตามมติ (OR1 ก่อน P2.13) — นับเป็นผ่านแบบข้าม พร้อมเหตุผลใน JSON */
function skipChk(id: string, reason: string): void {
  const full = `P2.7-${id}`;
  results.set(full, { ok: true, expected: "SKIP", actual: reason, skipped: true });
  console.log(`  ⏭️  [${full}] SKIP — ${reason}`);
}
/** ห่อข้อสอบหนึ่งข้อ — throw = แดงพร้อมเหตุผล (ไม่ล้มทั้งชุด) */
async function step(id: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    chk(id, false, "ไม่ throw", `harness throw: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
  }
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
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
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const PMAX = process.env.QC_ALL === "1" ? 99 : 8; // QC_ALL=1 = พิมพ์ทุกเหตุผล
const P8 = (p: string[]) => p.slice(0, PMAX).join(" · ") + (p.length > PMAX ? ` …(+${p.length - PMAX})` : "");
const setStr = (xs: unknown[]) => [...xs].map(String).sort(byId).join(",");
const sha256 = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const CROCK_RE = /^[0-9A-HJKMNP-TV-Z]+$/;

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
// ตัดคอมเมนต์บรรทัดก่อนคอมเมนต์ก้อน — คอมเมนต์บรรทัดที่มี "/*" (เช่น path `/api/m/*`) จะไม่เปิดก้อนยาวกลืนโค้ด
const stripComments = (s: string) => s.replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const stripPrismaComments = (s: string) => s.replace(/\/\/.*$/gm, "");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
function prismaBlock(src: string, kind: "model" | "enum", name: string): string {
  const m = new RegExp(`\\b${kind}\\s+${name}\\s*\\{`).exec(src);
  if (!m) return "";
  const end = src.indexOf("\n}", m.index);
  return end < 0 ? "" : src.slice(m.index, end + 2);
}
const fieldLine = (block: string, f: string): string => (new RegExp(`^\\s*${f}\\s+[^\\n]*$`, "m").exec(block)?.[0] ?? "").trim();
const fieldLines = (block: string): string[] =>
  block
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => /^[a-zA-Z_]\w*\s+\S/.test(l));
const fieldNames = (block: string): string[] => fieldLines(block).map((l) => l.split(/\s+/)[0]!);
const enumValues = (block: string): string[] => (block ? block.split("\n").slice(1).map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l)) : []);
/** ช่วงของ const/ออบเจกต์ที่เริ่มด้วย marker (ถึงวงเล็บปิดคู่แรก) */
function constBody(src: string, marker: string): string {
  const i0 = src.indexOf(marker);
  if (i0 < 0) return "";
  const eq = src.indexOf("=", i0);
  if (eq < 0) return "";
  const i = eq + 1;
  const open = src.slice(i).search(/[[{(]/);
  if (open < 0) return "";
  const start = i + open;
  const o = src[start]!;
  const c = o === "[" ? "]" : o === "(" ? ")" : "}";
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    if (src[j] === o) depth++;
    else if (src[j] === c && --depth === 0) return src.slice(start, j + 1);
  }
  return "";
}
/** เนื้อฟังก์ชัน (export หรือไม่ก็ได้) ถึงฟังก์ชันระดับบนตัวถัดไป */
function fnBody(src: string, name: string): string {
  const m = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`).exec(src);
  if (!m) return "";
  const rest = src.slice(m.index + m[0].length);
  const next = rest.search(/\n(?:export\s+)?(?:async\s+)?function\s+\w+|\nexport\s/);
  return next < 0 ? rest : rest.slice(0, next);
}
const firstStatement = (raw: string) => raw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart();
const isUseServer = (raw: string) => /^["']use server["']/.test(firstStatement(raw));
const isUseClient = (raw: string) => /^["']use client["']/.test(firstStatement(raw));
const MARK = "POS P2.7";
/** เลขบรรทัด (0-based) ที่อยู่ในรอยต่อ `// POS P2.7 ▸ … ◂` (บรรทัดเดียวหรือหลายบรรทัด) */
function markedLines(raw: string, tag = MARK): Set<number> {
  const out = new Set<number>();
  const lines = raw.split("\n");
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const starts = l.includes(`${tag} ▸`);
    if (starts) open = true;
    if (open) out.add(i);
    if (open && l.includes("◂") && (!starts || l.lastIndexOf("◂") > l.indexOf(`${tag} ▸`))) open = false;
  }
  return out;
}
/** import ของ next/navigation โดยตัดชื่อ redirect/permanentRedirect ออก (หน้าเดิมเพิ่มชื่อนี้ในบรรทัด import เดิมได้) · ว่าง = "" */
const normNavImport = (l: string): string => {
  const m = /^\s*import\s*\{([^}]*)\}\s*from\s*["']next\/navigation["'];?/.exec(l);
  if (!m) return l;
  const ids = m[1]!.split(",").map((x) => x.trim()).filter((x) => x && x !== "redirect" && x !== "permanentRedirect");
  return ids.length ? `import { ${ids.join(", ")} } from "next/navigation";` : "";
};
const normBlank = (raw: string) =>
  raw
    .split("\n")
    .map((l) => normNavImport(l.replace(/\s+$/, "")))
    .filter((l) => l !== "")
    .join("\n");
/** ข้อความที่ตัดบรรทัดในรอยต่อ POS P2.7 ออก (ยกเว้นบรรทัด import ของ next/navigation ที่ถูกแก้ — คงไว้แบบตัดชื่อ redirect) · ไม่สนบรรทัดว่าง/ช่องว่างท้ายบรรทัด */
const withoutMarked = (raw: string): string => {
  const mk = markedLines(raw);
  return normBlank(
    raw
      .split("\n")
      .filter((l, i) => !mk.has(i) || /^\s*import\s*\{[^}]*\}\s*from\s*["']next\/navigation["']/.test(l))
      .map((l) => l.replace(/\s*\/\/\s*POS P2\.7 ▸.*$/, ""))
      .join("\n"),
  );
};

/**
 * ลายเซ็นของ export (สูตรเดียวกับ qc-pos-p2.4 L3): ฟังก์ชัน = ข้อความตั้งแต่ `export` ถึงวงเล็บปีกกาเปิดของตัวฟังก์ชัน ·
 * type = ข้อความถึง `;` ที่ระดับนอกสุด · ตัดคอมเมนต์ + ยุบช่องว่าง + ตัด trailing comma → sha256 12 ตัวแรก
 */
function exportSigs(src: string): Map<string, string> {
  const s = stripComments(src);
  const out = new Map<string, string>();
  const OPEN = "({[<";
  const CLOSE = ")}]>";
  const norm = (t: string) => t.replace(/\s+/g, " ").replace(/\s*([(){}<>,:;|&=?[\]])\s*/g, "$1").replace(/;\}/g, "}").replace(/,\)/g, ")").trim();
  for (const m of s.matchAll(/export\s+(async\s+)?function\s+(\w+)/g)) {
    const name = m[2]!;
    let depth = 0;
    let body = -1;
    let prev = "";
    for (let i = m.index! + m[0].length; i < s.length; i++) {
      const c = s[i]!;
      if (c === "=" && s[i + 1] === ">") {
        prev = "⇒";
        i++;
        continue;
      }
      if (depth === 0 && c === "{" && !/[:|&,(<=?⇒]/.test(prev)) {
        body = i;
        break;
      }
      if (OPEN.includes(c)) depth++;
      else if (CLOSE.includes(c)) depth--;
      if (!/\s/.test(c)) prev = c;
    }
    const sig = norm(s.slice(m.index!, body < 0 ? m.index! + 200 : body));
    out.set(name, createHash("sha256").update(sig).digest("hex").slice(0, 12));
  }
  for (const m of s.matchAll(/export\s+type\s+(\w+)/g)) {
    const name = m[1]!;
    let depth = 0;
    let end = s.length;
    for (let i = s.indexOf("=", m.index! + m[0].length) + 1; i > 0 && i < s.length; i++) {
      const c = s[i]!;
      if (c === "=" && s[i + 1] === ">") {
        i++;
        continue;
      }
      if (OPEN.includes(c)) depth++;
      else if (CLOSE.includes(c)) depth--;
      else if (c === ";" && depth === 0) {
        end = i;
        break;
      }
      if (depth === 0 && c === "\n" && /^\s*export\b/.test(s.slice(i + 1, i + 40))) {
        end = i;
        break;
      }
    }
    const sig = norm(s.slice(m.index!, end)).replace(/,\}/g, "}");
    out.set(`type ${name}`, createHash("sha256").update(sig).digest("hex").slice(0, 12));
  }
  return out;
}

// ── git (ฐานของสิ่งที่ใบนี้ห้ามแตะ = 62a319cc หรือหมุดของเลน 05975437 — ผ่านเมื่อตรงฐานใดฐานหนึ่ง) ──
const BASE_REV = "62a319cc";
function gitBuf(args: string[]): Buffer | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
}
let baseRevsCache: string[] | null = null;
/** ฐานที่ยอมรับ (ไม่ซ้ำ · มีจริงในรีโป) */
function baseRevs(): string[] {
  if (baseRevsCache) return baseRevsCache;
  const out: string[] = [];
  const add = (r: string | null | undefined) => {
    const v = (r ?? "").trim();
    if (v && !out.includes(v)) out.push(v);
  };
  add(gitBuf(["rev-parse", "--verify", "-q", `${BASE_REV}^{commit}`])?.toString("utf8"));
  add(gitBuf(["rev-parse", "--verify", "-q", "0617d17b^{commit}"])?.toString("utf8")); // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p2.7 ST1/ST3 · lane-pin 05975437 → 0617d17b = merge P3.4 S หลัง P3.5 S) · ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin · มติ 3 · TL-1 · CD-B1 re-pin → merge 05975437): หมุดคงที่ 05975437 (ฐานของ P2.14 = first parent ของ merge) แทนฐานร่วมกับสาขาต้นทาง
  add(gitBuf(["rev-parse", "--verify", "-q", "bafdf89f^{commit}"])?.toString("utf8")); // ORACLE-EDIT ผู้คุม 21.10 (CD-RP9 qc-pos-p2.7 ST1/ST3 · lane-pin + bafdf89f = tip หลัง merge P3.6 S: PosSale +3 คอลัมน์เครดิต · register.ts บล็อก P3.6)
  add(gitBuf(["rev-parse", "--verify", "-q", "c4584062^{commit}"])?.toString("utf8")); // ORACLE-EDIT ผู้คุม 23.10 (CD-RP21 qc-pos-p2.7 ST1/ST3 · lane-pin + c4584062 = tip หลัง merge P5.2 fix A+B+C+F: register.ts F7 ยกเลิกข้ามสาขา + approvedDiscountOf(unitId) R1 F2)
  add(gitBuf(["rev-parse", "--verify", "-q", "e9b765b4^{commit}"])?.toString("utf8")); // ORACLE-EDIT ผู้คุม 23.10 (CD-RP22 qc-pos-p2.7 ST1/ST3 · lane-pin + e9b765b4 = tip หลัง merge P5.1 batch B: restaurant/order.ts resolveLines ราคาติดลบ (R1 F2) · register.ts MA1b quote mirror)
  add(gitBuf(["rev-parse", "--verify", "-q", "6b1f84a5^{commit}"])?.toString("utf8")); // ORACLE-EDIT ผู้คุม 23.10 (CD-RP23 qc-pos-p2.7 ST1/ST3 · lane-pin + 6b1f84a5 = tip หลัง merge P5.1 batch C: ริบมัดจำ no-show · ใบรับโมดูล TRANSFER · รายงานกะ)
  add(gitBuf(["rev-parse", "--verify", "-q", "98f60761^{commit}"])?.toString("utf8")); // ORACLE-EDIT ผู้คุม 23.10 (CD-RP24 qc-pos-p2.7 ST1/ST3 · lane-pin + 98f60761 = tip หลัง merge P5.2 batch D+E+device: register/refund actions ใช้คุกกี้เครื่อง · D11 restaurant writers)
  add(gitBuf(["rev-parse", "--verify", "-q", "4016a352^{commit}"])?.toString("utf8")); // ORACLE-EDIT ผู้คุม A 24.10 (CD-RP25 qc-pos-p2.7 ST1/ST3 · lane-pin + 4016a352 = tip หลัง merge P4.3 fix1+fix2 (register.ts regResolveOptions ย้าย/เพิ่ม · P4.3 board-card/dueDate/price-rule) + P6.1 fix1+fix2 (prisma #37 index no-op))
  baseRevsCache = out;
  return out;
}
const showAt = (rev: string, path: string): string | null => {
  const b = gitBuf(["show", `${rev}:${path}`]);
  return b ? b.toString("utf8") : null;
};
const shaAt = (rev: string, path: string): string | null => {
  const b = gitBuf(["show", `${rev}:${path}`]);
  return b ? sha256(b) : null;
};
function schemaAt(rev: string): string {
  const ls = gitBuf(["ls-tree", "--name-only", rev, "prisma/schema/"]);
  if (!ls) return "";
  return ls
    .toString("utf8")
    .split("\n")
    .filter((f) => f.endsWith(".prisma"))
    .map((f) => stripPrismaComments(gitBuf(["show", `${rev}:${f}`])?.toString("utf8") ?? ""))
    .join("\n");
}
/** ไฟล์ตรงฐานใดฐานหนึ่งทุกไบต์ — คืน null = ตรง · ไม่งั้นข้อความเหตุผล */
function sameAsBase(path: string): string | null {
  const raw = existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path)) : null;
  if (!raw) return `${path} ไม่มีไฟล์`;
  const h = sha256(raw);
  const revs = baseRevs();
  if (!revs.length) return `${path}: อ่าน git ไม่ได้ (ไม่มีฐานให้เทียบ)`;
  for (const r of revs) if (shaAt(r, path) === h) return null;
  return `${path.split("/").slice(-3).join("/")} ต่างจากฐาน (${revs.map((r) => r.slice(0, 8)).join("/")})`;
}

// ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 CD-2) ▸ มติ 13: route เดิมใต้ api/store/…/restaurant/** = ฐาน + บรรทัดในบล็อก `// POS P2.14 ▸ … ◂` (ไม่นับบรรทัดว่าง) —
//   กฎเดียวกับ P2.14 L2 (ตัวกัน LEG-1 อยู่ในบล็อกที่มาร์ก · เนื้อเดิมทุกบรรทัดคงอยู่) · storefront.ts + restaurant-qr.tsx ยังตรงฐานทุกไบต์
function p214Marked(src: string): Set<number> {
  const mk = new Set<number>();
  let open = false;
  src.split("\n").forEach((l, i) => {
    const starts = /POS P2\.14\s*▸/.test(l);
    if (starts || open) mk.add(i);
    if (starts && !l.includes("◂")) open = true;
    else if (open && l.includes("◂")) open = false;
  });
  return mk;
}
const p214NormBlank = (s: string) => s.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "").join("\n");
function sameAsBaseOrP214Marked(path: string): string | null {
  const exact = sameAsBase(path);
  if (!exact) return null;
  const now = existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), "utf8") : null;
  if (now === null) return exact;
  const mk = p214Marked(now);
  const stripped = p214NormBlank(now.split("\n").filter((_, i) => !mk.has(i)).join("\n"));
  for (const r of baseRevs()) {
    const b = showAt(r, path);
    if (b !== null && p214NormBlank(b) === stripped) return null;
  }
  return `${exact} (ไม่ใช่ฐาน + บล็อก POS P2.14 ด้วย)`;
}
// ◂ ORACLE-EDIT

// ═════════════════════════ ค่าคงที่ของสัญญา (ตารางชื่อ — ledger/wo-notes/pos-P2.7-oracle.md) ═════════════════════════
const POS_DIR = "src/lib/modules/pos";
const REST_DIR = "src/lib/modules/restaurant";
const Q_DIR = "src/app/(store)/q";
const LEGACY_PAGE = "src/app/(store)/s/[tenantSlug]/[unitSlug]/restaurant/t/[qrToken]/page.tsx";
const LEGACY_API_DIR = "src/app/api/store/[tenantSlug]/[unitSlug]/restaurant";
const F = {
  qr: `${POS_DIR}/qr-order.ts`,
  qrShared: `${POS_DIR}/qr-order-shared.ts`,
  order: `${POS_DIR}/order.ts`,
  orderShared: `${POS_DIR}/order-shared.ts`,
  orderAdapters: `${POS_DIR}/order-adapters.ts`,
  intent: `${POS_DIR}/payment-intent.ts`,
  channelShared: `${POS_DIR}/channel-shared.ts`,
  posTable: `${POS_DIR}/table.ts`,
  register: `${POS_DIR}/register.ts`,
  service: `${POS_DIR}/service.ts`,
  tender: `${POS_DIR}/tender.ts`,
  contract: "scripts/pos-sale-contract.json",
  restIndex: `${REST_DIR}/index.ts`,
  restOrder: `${REST_DIR}/order.ts`,
  storefront: `${REST_DIR}/storefront.ts`,
  restQrUi: "src/components/restaurant-qr.tsx",
  consumers: "src/lib/outbox-consumers.ts",
  cron: "src/app/api/cron/hourly/route.ts",
  scope: "src/lib/core/scope.ts",
  qcEnv: "scripts/pos-qc-env.mts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  pageTable: `${Q_DIR}/t/[qrToken]/page.tsx`,
  pageLink: `${Q_DIR}/[linkToken]/page.tsx`,
  pageOrder: `${Q_DIR}/o/[orderToken]/page.tsx`,
  qActions: `${Q_DIR}/actions.ts`,
  qUi: "src/components/pos/qr",
};
const MIGRATION_SUFFIX = "_pos_p27_qr_orders";
const PAY_STATES_NEW = ["PENDING_PAYMENT", "PREPAID"] as const;
const PAY_STATES_BASE = ["UNPAID", "PAY_ON_PICKUP", "PLATFORM_PAID", "PAID", "REFUNDED"] as const;
const ADAPTERS_BASE = ["NONE", "MANUAL", "WEB", "CHAT", "API"] as const;
const QR_CODES = ["QR_CLOSED", "SESSION_CHANGED", "TOKEN_INVALID", "RATE_LIMITED", "PREORDER_EXPIRED"] as const;
const camelKey = (code: string) => code.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const QR_ERROR_KEYS = [...QR_CODES.map(camelKey), "productUnavailable", "validation"];
/** ประตูสาธารณะ (pos/qr-order.ts) — ไม่มี session · ปฏิเสธ = {ok:false, code, messageKey} */
const QR_FNS = [
  "tableDoor", // (qrToken) → {ok, view:{unit:{name}, table:{name}, open, closedReason?, menu, session:{id, rounds}|null, ver}} · 0 เขียน
  "tablePoll", // (qrToken, {sinceVer?}) → {ok, changed:false, ver} | {ok, changed:true, ver, view} · 0 เขียน
  "quoteTableCart", // (qrToken, {lines}) → {ok, lines:[{productId, qty, unitPriceSatang, lineTotalSatang, priceSource}], subtotalSatang, serviceChargeSatang, totalSatang}
  "placeTableRound", // (qrToken, {lines, expectedSessionId?, guestToken?, note?}, {ip}) → {ok, roundId, sessionId}
  "tableServiceRequest", // (qrToken, {kind: "CALL_STAFF"|"REQUEST_BILL"}, {ip}) → {ok}
  "tableBill", // (qrToken) → {ok, bill:{lines, subtotalSatang, serviceChargeSatang, totalSatang, promptpayPayload|null, payHidden}}
  "tableNotifyPaid", // (qrToken, {ip}) → {ok} (คำขอ PAY_PROMPTPAY เดิม)
  "linkDoor", // (linkToken) → {ok, view:{unit:{name}, open, closedReason?, menu, prepMinutes}} · 0 เขียน
  "quotePreorderCart", // (linkToken, {lines}) → {ok, lines, subtotalSatang, totalSatang}
  "placePreorder", // (linkToken, {lines, customer:{name, phone}, idempotencyKey, note?}, {ip}, deps?:{beam}) → {ok, orderToken, duplicated}
  "orderStatus", // (orderToken, {sinceVer?}) → {ok, changed, ver, view?:{code, status, paymentState, totalSatang, payBy, pay:{kind, amountSatang, qrPayload, expiresAt}|null, receiptToken, phoneMasked, lines}} · หมดเวลา = เขียนครั้งเดียว
  "claimPaid", // (orderToken, {ip}) → {ok} · event customer_paid_claim (ไม่มีผลเงิน)
  "legacyTableQrRedirect", // (tenantId, unitId, qrToken) → "/q/t/<qrToken>" | null
] as const;
const ORDER_NEW_FNS = ["ingestPreorderInTx", "onIntentPaid", "expirePreorders", "getOrderLink", "createOrderLink", "rotateOrderLink", "revokeOrderLink"] as const;
const REST_NEW_FNS = ["guestRoundInTx", "guestTableViewForPos", "rotateTableQrForPos"] as const;
const QR_SHARED_EXPORTS = ["QR_REFUSAL_CODES", "QR_LINK_TOKEN_RE", "QR_ORDER_TOKEN_RE", "QR_MAX_LINES", "QR_MAX_QTY", "QR_NOTE_MAX", "QR_NAME_MAX", "QR_SUBMIT_PER_TOKEN_PER_MIN", "normalizeThaiPhone", "qrRefusalMessageKey"] as const;
/** ตารางร้านอาหาร (ผู้เขียน = restaurant/* เท่านั้น · สูตรเดียวกับ qc-pos-p2.4 ST3) */
const W = "(create|createMany|update|updateMany|upsert|delete|deleteMany)";
const RM = "(restaurantOrder|restaurantOrderItem|restaurantOrderItemOption|restaurantTable|restaurantZone|tableSession|restaurantServiceRequest|restaurantReservation|restaurantDailyCounter|menuItem)";
/** โมดูล session/auth ที่หน้าสาธารณะ + ประตู qr-order ห้าม import */
const AUTH_MOD = /["'](@\/lib\/core\/(context|session|auth)|@\/lib\/actions\/auth|@\/lib\/mobile\/auth|@\/lib\/modules\/pos\/staff-session|@\/lib\/modules\/member\/(customer-session|session-facade)|next-auth[^"']*|@\/auth)["']/;
/** ทะเบียนผู้เรียก createSale — นับด้วยสูตรเดียวกับ qc-pos-p1.6 · เทียบกับฐาน (ไม่ตายตัว: P2.13 ถอด api/ops/sales.ts) */
const countCreateSale = (src: string) => (stripComments(src).match(/\bcreateSale\s*\(/g) ?? []).length;
/** ชนิดที่ย้ายพร้อม regResolveOptions (CD4 · มติ 9) */
const MOVED_IDS = new Set(["regResolveOptions", "RegOptGroup", "RegOptChoice", "RegPickedOption"]);

const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4"].map((x) => `P2.7-${x}`);
const skipReasons: string[] = [];
for (const f of [F.qr, F.qrShared, F.pageTable, F.pageLink, F.pageOrder, F.qActions]) if (!existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);
for (const n of QR_FNS) if (!exportsFn(srcOf(F.qr), n)) skipReasons.push(`ยังไม่มี export ${n} (pos/qr-order.ts)`);
for (const n of ORDER_NEW_FNS) if (!exportsFn(srcOf(F.order), n)) skipReasons.push(`ยังไม่มี export ${n} (pos/order.ts)`);
if (!exportsFn(srcOf(F.intent), "createIntentForOrderInTx")) skipReasons.push("ยังไม่มี export createIntentForOrderInTx (pos/payment-intent.ts)");
for (const n of REST_NEW_FNS) if (!exportsFn(srcOf(F.restIndex), n)) skipReasons.push(`ยังไม่มี export ${n} (restaurant/index.ts)`);
if (!/"QR_ORDER"/.test(constBody(srcOf(F.channelShared), "export const CHANNEL_BUILTIN_CODES"))) skipReasons.push("CHANNEL_BUILTIN_CODES ยังไม่มี QR_ORDER");

/** ไฟล์ "shared" ไม่ import prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (ค่า) และไม่มีเวลา/สุ่ม — เงื่อนไขที่ --no-db โหลดได้ */
const purePath = (f: string): boolean => {
  const s = srcOf(f);
  if (!s) return false;
  const valueImports = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const dyn = [...s.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);
  if (/\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)|Math\.random\s*\(/.test(s)) return false;
  return ![...valueImports, ...dyn].some((p) =>
    /@prisma\/client|\/db$|^\.\/db$|@\/lib\/core\/db|@\/lib\/modules\/(inventory|account|system|restaurant|member|shop|chat)|^node:|^crypto$|^\.\/(order|order-adapters|catalog|catalog-legacy|register|service|bills|refund|held-cart|table|channel|shift|device|price|payment-intent|qr-order|kds|display)$/.test(p),
  );
};
const importsFrom = (src: string): { mod: string; ids: string[]; typeOnly: boolean; text: string }[] => {
  const out: { mod: string; ids: string[]; typeOnly: boolean; text: string }[] = [];
  for (const m of src.matchAll(/^\s*import\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["'];?/gm)) {
    const body = m[2]!;
    const brace = /\{([\s\S]*)\}/.exec(body)?.[1] ?? "";
    const ids = brace
      .split(",")
      .map((x) => x.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim())
      .filter(Boolean);
    const def = body.replace(/\{[\s\S]*\}/, "").replace(/,/g, " ").trim();
    if (def && !def.startsWith("*")) ids.push(`default:${def}`);
    if (def.startsWith("*")) ids.push(def.replace(/\s+/g, " "));
    out.push({ mod: m[3]!, ids, typeOnly: !!m[1], text: m[0] });
  }
  return out;
};
/** ตัด import ทั้งหมด + บล็อกประกาศตามชื่อ (function / type) — ใช้เทียบ register.ts กับฐาน */
function stripDecls(src: string, names: Set<string>): string {
  let s = src.replace(/^\s*import\s+[^;]*?from\s+["'][^"']+["'];?[^\n]*$/gm, "");
  for (const n of names) {
    // type X = … ; (ถึง ; ระดับนอกสุด)
    const t = new RegExp(`(^|\\n)\\s*(export\\s+)?type\\s+${n}\\b`).exec(s);
    if (t) {
      let depth = 0;
      let end = s.length;
      for (let i = t.index + t[0].length; i < s.length; i++) {
        const c = s[i]!;
        if ("({[<".includes(c)) depth++;
        else if (")}]>".includes(c)) depth--;
        else if (c === ";" && depth <= 0) {
          end = i + 1;
          break;
        }
      }
      s = s.slice(0, t.index) + "\n" + s.slice(end);
    }
    // function X(…) { … } (จับคู่ปีกกาของตัวฟังก์ชัน)
    const f = new RegExp(`(^|\\n)\\s*(export\\s+)?(async\\s+)?function\\s+${n}\\b`).exec(s);
    if (f) {
      let i = f.index + f[0].length;
      let depth = 0;
      let bodyStart = -1;
      let prev = "";
      for (; i < s.length; i++) {
        const c = s[i]!;
        if (c === "=" && s[i + 1] === ">") {
          prev = "⇒";
          i++;
          continue;
        }
        if (depth === 0 && c === "{" && !/[:|&,(<=?⇒]/.test(prev)) {
          bodyStart = i;
          break;
        }
        if ("({[<".includes(c)) depth++;
        else if (")}]>".includes(c)) depth--;
        if (!/\s/.test(c)) prev = c;
      }
      if (bodyStart > 0) {
        let d = 0;
        let end = s.length;
        for (let j = bodyStart; j < s.length; j++) {
          if (s[j] === "{") d++;
          else if (s[j] === "}" && --d === 0) {
            end = j + 1;
            break;
          }
        }
        s = s.slice(0, f.index) + "\n" + s.slice(end);
      }
    }
  }
  return s.replace(/\s+/g, " ").trim();
}
const flatKeys = (o: unknown, pfx = ""): Map<string, string> => {
  const m = new Map<string, string>();
  if (isRecord(o)) for (const [k, v] of Object.entries(o)) for (const [kk, vv] of isRecord(v) ? flatKeys(v, `${pfx}${k}.`) : new Map([[`${pfx}${k}`, String(v)]])) m.set(kk, vv);
  return m;
};

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
const MIG_ALLOWED: RegExp[] = [
  /^SET\s+(LOCAL\s+)?lock_timeout\s*(=|TO)\s*'3s'$/i,
  /^ALTER\s+TYPE\s+"PosOrderPaymentState"\s+ADD\s+VALUE\s+IF\s+NOT\s+EXISTS\s+'(PENDING_PAYMENT|PREPAID)'(\s+(AFTER|BEFORE)\s+'\w+')?$/i,
  /^ALTER\s+TYPE\s+"SalesChannelAdapter"\s+ADD\s+VALUE\s+IF\s+NOT\s+EXISTS\s+'QR'(\s+(AFTER|BEFORE)\s+'\w+')?$/i,
  /^ALTER\s+TABLE\s+"PosOrder"\s+(ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+"(payBy|paidAt|customerClaimAt)"\s+TIMESTAMP\(3\)|ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+"(paymentIntentId|publicToken)"\s+TEXT)(\s*,\s*ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+"(payBy|paidAt|customerClaimAt|paymentIntentId|publicToken)"\s+(TIMESTAMP\(3\)|TEXT))*$/i,
  /^ALTER\s+TABLE\s+"PosPaymentIntent"\s+((ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+"orderId"\s+TEXT|ALTER\s+COLUMN\s+"(deviceId|createdByUserId)"\s+DROP\s+NOT\s+NULL)(\s*,\s*)?)+$/i,
  /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+"PosOrderLink"\s*\(/i,
  /^CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+"[A-Za-z0-9_]+"\s+ON\s+"(PosOrder|PosOrderLink|PosPaymentIntent)"\s*\(/i,
  /^DO\s+\$\$\s*BEGIN\s+CREATE\s+TYPE\s+"PosOrderLinkStatus"\s+AS\s+ENUM\s*\(\s*'ACTIVE'\s*,\s*'REVOKED'\s*\)\s*;\s*EXCEPTION\s+WHEN\s+duplicate_object\s+THEN\s+null\s*;\s*END\s+\$\$$/i,
];
function migrationDirs(): string[] {
  const abs = join(ROOT, "prisma/migrations");
  return existsSync(abs) ? readdirSync(abs).filter((d) => /^\d{14}_/.test(d) && statSync(join(abs, d)).isDirectory()).sort() : [];
}
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  const revs = baseRevs();
  console.log(`   ฐานที่ยอมรับ: ${revs.map((r) => r.slice(0, 10)).join(" · ") || "(อ่าน git ไม่ได้)"}`);
  // ── ST1 schema + migration + ทะเบียน ──
  await step("ST1", async () => {
    const p: string[] = [];
    const pay = enumValues(prismaBlock(schemaSrc, "enum", "PosOrderPaymentState"));
    if (setStr(pay) !== setStr([...PAY_STATES_BASE, ...PAY_STATES_NEW])) p.push(`PosOrderPaymentState = ${pay.join(",")} (คาด ${[...PAY_STATES_BASE, ...PAY_STATES_NEW].join(",")})`);
    const ad = enumValues(prismaBlock(schemaSrc, "enum", "SalesChannelAdapter"));
    if (setStr(ad) !== setStr([...ADAPTERS_BASE, "QR"])) p.push(`SalesChannelAdapter = ${ad.join(",")} (คาด + QR)`);
    const po = prismaBlock(schemaSrc, "model", "PosOrder");
    for (const [f, re] of [
      ["payBy", /^payBy\s+DateTime\?/],
      ["paidAt", /^paidAt\s+DateTime\?/],
      ["customerClaimAt", /^customerClaimAt\s+DateTime\?/],
      ["paymentIntentId", /^paymentIntentId\s+String\?/],
      ["publicToken", /^publicToken\s+String\?\s+@unique\b/],
    ] as const) {
      const l = fieldLine(po, f);
      if (!l) p.push(`PosOrder ขาด ${f}`);
      else if (!re.test(l)) p.push(`PosOrder.${f} = ${short(l, 60)}`);
    }
    if (po && !/@@index\(\s*\[\s*tenantId\s*,\s*unitId\s*,\s*paymentState\s*,\s*payBy\s*\]\s*\)/.test(po)) p.push("PosOrder ไม่มี @@index([tenantId, unitId, paymentState, payBy])");
    const pi = prismaBlock(schemaSrc, "model", "PosPaymentIntent");
    for (const [f, re] of [
      ["orderId", /^orderId\s+String\?/],
      ["deviceId", /^deviceId\s+String\?/],
      ["createdByUserId", /^createdByUserId\s+String\?/],
    ] as const) {
      const l = fieldLine(pi, f);
      if (!l) p.push(`PosPaymentIntent ขาด ${f}`);
      else if (!re.test(l)) p.push(`PosPaymentIntent.${f} = ${short(l, 60)} (CD5: nullable)`);
    }
    const lk = prismaBlock(schemaSrc, "model", "PosOrderLink");
    if (!lk) p.push("ไม่มี model PosOrderLink");
    else {
      for (const [f, re] of [
        ["id", /^id\s+String\s+@id\b/],
        ["tenantId", /^tenantId\s+String(\s|$)/],
        ["systemId", /^systemId\s+String(\s|$)/],
        ["unitId", /^unitId\s+String(\s|$)/],
        ["token", /^token\s+String\s+@unique\b/],
        ["status", /^status\s+(String|PosOrderLinkStatus)(\s|$)/],
        ["createdByUserId", /^createdByUserId\s+String(\s|$)/],
        ["rotatedAt", /^rotatedAt\s+DateTime\?/],
      ] as const) {
        const l = fieldLine(lk, f);
        if (!l) p.push(`PosOrderLink ขาด ${f}`);
        else if (!re.test(l)) p.push(`PosOrderLink.${f} = ${short(l, 60)}`);
      }
      if (/@relation\b/.test(lk)) p.push("PosOrderLink มี @relation (ไม่มี FK)");
    }
    // โมเดลเดิมไม่เปลี่ยน (เทียบฐาน)
    const baseSchemas = revs.map((r) => schemaAt(r)).filter(Boolean);
    if (!baseSchemas.length) p.push("อ่าน schema ของฐานไม่ได้ (git)");
    for (const m of ["PosSale", "PosSaleLine", "PosPayment", "SalesChannel", "PosOrderLine", "PosOrderEvent", "TableSession", "RestaurantTable", "RestaurantOrder", "RestaurantOrderItem", "RestaurantServiceRequest", "MenuItem", "RestaurantSetting"]) {
      const now = setStr(fieldNames(prismaBlock(schemaSrc, "model", m)));
      if (baseSchemas.length && !baseSchemas.some((b) => setStr(fieldNames(prismaBlock(b, "model", m))) === now)) p.push(`${m} ฟิลด์เปลี่ยนจากฐาน`);
    }
    const poBaseOk = baseSchemas.some((b) => {
      const was = fieldNames(prismaBlock(b, "model", "PosOrder"));
      const now = fieldNames(po);
      const added = now.filter((f) => !was.includes(f));
      return was.every((f) => now.includes(f)) && setStr(added) === setStr(["payBy", "paidAt", "customerClaimAt", "paymentIntentId", "publicToken"]);
    });
    if (baseSchemas.length && !poBaseOk) p.push("PosOrder: ฟิลด์ที่เพิ่ม ≠ payBy paidAt customerClaimAt paymentIntentId publicToken (หรือฟิลด์เดิมหาย)");
    const restBaseOk = revs.some((r) => {
      const b = showAt(r, "prisma/schema/restaurant.prisma");
      return b !== null && normBlank(stripPrismaComments(b)) === normBlank(stripPrismaComments(rd("prisma/schema/restaurant.prisma")));
    });
    if (!restBaseOk) p.push("restaurant.prisma ต่างจากฐาน (มติ 12: ไม่แตะ schema ร้านอาหาร)");
    // migration
    const dirs = migrationDirs();
    const mine = dirs.filter((d) => d.endsWith(MIGRATION_SUFFIX));
    if (mine.length !== 1) p.push(`migration *${MIGRATION_SUFFIX} = ${mine.length} โฟลเดอร์ (คาด 1)`);
    else {
      const name = mine[0]!;
      // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p2.7 ST1): มติ 12 = ใหม่กว่าทุก migration ที่มีอยู่ที่ฐานของ P2.7 (64923c13) — ไม่ใช่ "ล่าสุดตลอดกาล" (ใบหลัง ๆ เพิ่ม migration ตามแบบ · เดิม dirs[last] === name)
      const p27BaseDirs = (gitBuf(["ls-tree", "--name-only", "64923c13", "prisma/migrations/"])?.toString("utf8") ?? "").split("\n").map((x) => x.split("/").pop() ?? "").filter((d) => /^\d{14}_/.test(d) && d !== name);
      if (!p27BaseDirs.length) p.push("อ่านรายชื่อ migration ที่ฐาน 64923c13 ไม่ได้ (git)");
      const notOlder = p27BaseDirs.filter((d) => d >= name);
      if (notOlder.length) p.push(`${name} ไม่ใหม่กว่า migration ที่ฐาน 64923c13: ${notOlder.join(",")} (มติ 12)`);
      const sql = rd(`prisma/migrations/${name}/migration.sql`).replace(/--[^\n]*/g, "");
      const stmts = sql
        .split(/;\s*(?=\n|$)/)
        .map((x) => x.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      // DO $$ … $$ ถูกตัดกลาง — ต่อกลับ
      const joined: string[] = [];
      for (const st of stmts) {
        const last = joined[joined.length - 1];
        if (last !== undefined && /^DO \$\$/i.test(last) && !/END \$\$$/i.test(last)) joined[joined.length - 1] = `${last}; ${st}`;
        else joined.push(st);
      }
      const bad = joined.filter((s) => !MIG_ALLOWED.some((re) => re.test(s)));
      if (bad.length) p.push(`คำสั่งนอกรายการ ${bad.length}: ${short(bad[0], 110)}`);
      const all = joined.join(";\n");
      if (!/SET\s+(LOCAL\s+)?lock_timeout\s*(=|TO)\s*'3s'/i.test(all)) p.push("ไม่มี SET lock_timeout '3s'");
      for (const v of ["PENDING_PAYMENT", "PREPAID"]) if (!new RegExp(`ALTER TYPE "PosOrderPaymentState" ADD VALUE IF NOT EXISTS '${v}'`, "i").test(all)) p.push(`ไม่มี ADD VALUE IF NOT EXISTS '${v}'`);
      if (!/ALTER TYPE "SalesChannelAdapter" ADD VALUE IF NOT EXISTS 'QR'/i.test(all)) p.push("ไม่มี ADD VALUE IF NOT EXISTS 'QR'");
      for (const c of ["payBy", "paidAt", "customerClaimAt", "paymentIntentId", "publicToken"]) if (!new RegExp(`ADD COLUMN IF NOT EXISTS "${c}"`).test(all)) p.push(`PosOrder ไม่ ADD COLUMN "${c}"`);
      if (!/"PosPaymentIntent"[^;]*ADD COLUMN IF NOT EXISTS "orderId"/i.test(all)) p.push('PosPaymentIntent ไม่ ADD COLUMN "orderId"');
      for (const c of ["deviceId", "createdByUserId"]) if (!new RegExp(`ALTER COLUMN "${c}" DROP NOT NULL`, "i").test(all)) p.push(`ไม่มี "${c}" DROP NOT NULL`);
      const ct = joined.find((s) => /^CREATE TABLE IF NOT EXISTS "PosOrderLink"/i.test(s)) ?? "";
      if (!ct) p.push('ไม่มี CREATE TABLE IF NOT EXISTS "PosOrderLink"');
      else if (/REFERENCES|FOREIGN KEY/i.test(ct)) p.push("PosOrderLink มี FK");
      if (!/CREATE UNIQUE INDEX IF NOT EXISTS "[A-Za-z0-9_]+" ON "PosOrder" ?\( ?"publicToken" ?\)/i.test(all)) p.push('ไม่มี unique index "PosOrder"("publicToken")');
      if (!/CREATE UNIQUE INDEX IF NOT EXISTS "[A-Za-z0-9_]+" ON "PosOrderLink" ?\( ?"token" ?\)/i.test(all)) p.push('ไม่มี unique index "PosOrderLink"("token")');
      if (!/CREATE INDEX IF NOT EXISTS "[A-Za-z0-9_]+" ON "PosOrder" ?\( ?"tenantId" ?, ?"unitId" ?, ?"paymentState" ?, ?"payBy" ?\)/i.test(all)) p.push('ไม่มี index "PosOrder"(tenantId, unitId, paymentState, payBy)');
      if (/\b(DROP\s+(TABLE|COLUMN|TYPE|INDEX)|DELETE\s+FROM|UPDATE\s+"|TRUNCATE|RENAME)\b/i.test(all)) p.push("มีคำสั่งลบ/แก้ข้อมูลเดิม (เพิ่มอย่างเดียว)");
    }
    // ทะเบียน
    if (!/\bPosOrderLink\s*:\s*sys\(\)/.test(srcOf(F.scope))) p.push("scope.ts ไม่มี PosOrderLink: sys()");
    const env = srcOf(F.qcEnv);
    const pm = env.slice(env.indexOf("export const POS_MODELS"), env.indexOf("export type PosModelKey"));
    if (!/\bposOrderLink\s*:\s*\{[^}]*model:\s*"PosOrderLink"/.test(pm)) p.push('pos-qc-env POS_MODELS ไม่มี posOrderLink {model: "PosOrderLink"}');
    chk("ST1", p.length === 0, "enum/ฟิลด์/ตาราง/migration ตาม R1 · ของเดิมไม่เปลี่ยน · ทะเบียนครบ", P8(p) || `ครบ (${mine[0]})`);
  });

  // ── ST2 ไฟล์/ชื่อ/ผู้เขียนเดียว ──
  await step("ST2", async () => {
    const p: string[] = [];
    // qr-order-shared
    if (!existsSync(join(ROOT, F.qrShared))) p.push("ไม่มี pos/qr-order-shared.ts");
    else {
      if (!purePath(F.qrShared)) p.push("qr-order-shared.ts ไม่บริสุทธิ์ (import prisma/เซิร์ฟเวอร์/node: หรือมี Date.now/new Date()/Math.random)");
      for (const n of QR_SHARED_EXPORTS) if (!exportsFn(srcOf(F.qrShared), n)) p.push(`qr-order-shared ไม่ export ${n}`);
      if (purePath(F.qrShared)) {
        const sh = await tryImport("@/lib/modules/pos/qr-order-shared");
        if (!sh) p.push("โหลด qr-order-shared ไม่ได้");
        else {
          if (!Array.isArray(sh.QR_REFUSAL_CODES) || setStr(sh.QR_REFUSAL_CODES) !== setStr([...QR_CODES])) p.push(`QR_REFUSAL_CODES = ${short(sh.QR_REFUSAL_CODES, 100)}`);
          const re16 = sh.QR_LINK_TOKEN_RE instanceof RegExp ? sh.QR_LINK_TOKEN_RE : null;
          const re12 = sh.QR_ORDER_TOKEN_RE instanceof RegExp ? sh.QR_ORDER_TOKEN_RE : null;
          if (!re16 || !re16.test("0123456789ABCDEF") || re16.test("0123456789ABCDEI") || re16.test("0123456789ABCDE") || re16.test("0123456789abcdef")) p.push("QR_LINK_TOKEN_RE ไม่ใช่ 16 ตัว Crockford ตัวใหญ่");
          if (!re12 || !re12.test("0123456789AB") || re12.test("0123456789AU") || re12.test("0123456789ABC")) p.push("QR_ORDER_TOKEN_RE ไม่ใช่ 12 ตัว Crockford");
          for (const [n, v] of [["QR_MAX_LINES", 30], ["QR_MAX_QTY", 50], ["QR_NOTE_MAX", 200], ["QR_NAME_MAX", 100], ["QR_SUBMIT_PER_TOKEN_PER_MIN", 60]] as const) if (sh[n] !== v) p.push(`${n} = ${short(sh[n], 20)} (คาด ${v})`);
          const ph = (x: string) => (typeof sh.normalizeThaiPhone === "function" ? sh.normalizeThaiPhone(x) : "MISSING");
          const phoneCases: [string, string | null][] = [["081-234-5678", "0812345678"], ["+66812345678", "0812345678"], ["66 81 234 5678", "0812345678"], ["021234567", "021234567"], ["12345", null], ["08123456789", null], ["", null]];
          for (const [i, want] of phoneCases) if (ph(i) !== want) p.push(`normalizeThaiPhone(${JSON.stringify(i)}) = ${short(ph(i), 20)} (คาด ${want})`);
          for (const c of QR_CODES) {
            const k = typeof sh.qrRefusalMessageKey === "function" ? sh.qrRefusalMessageKey(c) : "MISSING";
            if (k !== `qr.errors.${camelKey(c)}`) p.push(`qrRefusalMessageKey(${c}) = ${short(k, 40)}`);
          }
        }
      }
    }
    // qr-order.ts
    const qraw = rd(F.qr);
    const q = stripComments(qraw);
    if (!qraw) p.push("ไม่มี pos/qr-order.ts");
    else {
      for (const n of QR_FNS) if (!exportsFn(q, n)) p.push(`qr-order.ts ไม่ export ${n}`);
      if (new RegExp(`\\.(posOrder|posOrderLine|posOrderEvent|posOrderLink|posPaymentIntent)\\.${W}\\b`).test(q)) p.push("qr-order.ts เขียน PosOrder*/PosPaymentIntent ตรง (มติ 13)");
      if (new RegExp(`\\.${RM}\\.${W}\\b`).test(q)) p.push("qr-order.ts เขียนตารางร้านอาหารตรง (มติ 13)");
      if (/\$executeRaw|INSERT\s+INTO|UPDATE\s+"|DELETE\s+FROM/i.test(q)) p.push("qr-order.ts มี SQL เขียนดิบ");
      if (/\bcreateSale\s*\(/.test(q)) p.push("qr-order.ts เรียก createSale");
      if (AUTH_MOD.test(q) || /\brequireTenant\s*\(/.test(q)) p.push("qr-order.ts import session/auth");
      if (/(?:from\s*|import\s*\(\s*)["'](@\/lib\/modules\/restaurant\/[^"']+|\.\.\/restaurant[^"']*)["']/.test(q)) p.push("qr-order.ts import ร้านอาหารแบบเจาะไฟล์");
      if (/^\s*import\s+(?!type\b)[^;]*?from\s+["']@\/lib\/modules\/restaurant["']/m.test(q)) p.push('qr-order.ts import ร้านอาหารแบบ static (ต้อง import("@/lib/modules/restaurant"))');
      if (/(?:from\s*|import\s*\(\s*)["']@\/lib\/modules\/(shop|chat)(\/[^"']*)?["']/.test(q)) p.push("qr-order.ts import shop/chat");
    }
    // ผู้เขียนเดียว
    for (const f of walk("src")) {
      const s = srcOf(f);
      if (f !== F.order && new RegExp(`\\.(posOrder|posOrderLine|posOrderEvent|posOrderLink)\\.${W}\\b`).test(s)) p.push(`${f.replace("src/lib/", "")} เขียน PosOrder*/PosOrderLink (ผู้เขียนเดียว = order.ts)`);
      if (f !== F.intent && new RegExp(`\\.posPaymentIntent\\.${W}\\b`).test(s)) p.push(`${f.replace("src/lib/", "")} เขียน PosPaymentIntent (ผู้เขียนเดียว = payment-intent.ts)`);
      if (f !== F.order && /(INSERT\s+INTO|UPDATE)\s+"PosOrder(Line|Event|Link)?"/i.test(s)) p.push(`${f.replace("src/lib/", "")} SQL เขียน PosOrder*`);
      if (f !== F.intent && /(INSERT\s+INTO|UPDATE)\s+"PosPaymentIntent"/i.test(s)) p.push(`${f.replace("src/lib/", "")} SQL เขียน PosPaymentIntent`);
    }
    for (const f of [...walk(POS_DIR), F.consumers]) if (new RegExp(`\\.${RM.replace("|menuItem", "")}\\.${W}\\b`).test(srcOf(f))) p.push(`${f.split("/").slice(-2).join("/")} เขียนตารางร้านอาหารตรง`);
    // order.ts บล็อก
    const oraw = rd(F.order);
    const o = stripComments(oraw);
    for (const n of ORDER_NEW_FNS) if (!exportsFn(o, n)) p.push(`order.ts ไม่ export ${n}`);
    const omk = markedLines(oraw);
    const olines = oraw.split("\n");
    for (const n of ["ingestPreorderInTx", "onIntentPaid", "expirePreorders"]) {
      const i = olines.findIndex((l) => new RegExp(`function\\s+${n}\\b`).test(l));
      if (i >= 0 && !omk.has(i) && !omk.has(i - 1) && !(i > 1 && omk.has(i - 2))) p.push(`order.ts ${n} ไม่อยู่ในบล็อก // POS P2.7 ▸ … ◂`);
    }
    const acc = fnBody(oraw, "acceptInTx");
    if (!/POS P2\.7\s*▸/.test(acc)) p.push("acceptInTx ไม่มีบล็อก POS P2.7 (กิ่ง PREPAID)");
    if (!/PREPAID/.test(stripComments(acc))) p.push("acceptInTx ไม่มีกิ่ง PREPAID");
    if (!/\blockSaleIntents\b/.test(o) || !/\bconsumeSaleIntents\b/.test(o)) p.push("order.ts ไม่ใช้ lockSaleIntents + consumeSaleIntents (มติ 5)");
    const cs = countCreateSale(oraw);
    if (cs !== 1 || !/\bcreateSale\s*\(/.test(stripComments(fnBody(oraw, "orderCreateSale")))) p.push(`order.ts createSale( ${cs} จุด / ไม่อยู่ใน orderCreateSale (มติ 5: จุดเดียว)`);
    if (/(?:from\s*|import\s*\(\s*)["'](@\/lib\/modules\/(shop|chat|restaurant)(\/[^"']*)?|\.\.\/(shop|chat|restaurant)[^"']*)["']/.test(o)) p.push("order.ts import shop/chat/restaurant");
    const os = srcOf(F.orderShared);
    if (!/export\s+const\s+ORDER_INPUT_PAYMENT_STATES\s*=\s*\[\s*"UNPAID"\s*,\s*"PAY_ON_PICKUP"\s*\]\s*as\s+const/.test(os)) p.push("ORDER_INPUT_PAYMENT_STATES ไม่ใช่ UNPAID, PAY_ON_PICKUP (มติ 8)");
    // payment-intent
    const iraw = rd(F.intent);
    if (!exportsFn(stripComments(iraw), "createIntentForOrderInTx")) p.push("payment-intent.ts ไม่ export createIntentForOrderInTx");
    else {
      const i = iraw.split("\n").findIndex((l) => /function\s+createIntentForOrderInTx\b/.test(l));
      const mk = markedLines(iraw);
      if (i >= 0 && !mk.has(i) && !mk.has(i - 1) && !(i > 1 && mk.has(i - 2))) p.push("createIntentForOrderInTx ไม่อยู่ในบล็อก // POS P2.7 ▸ … ◂");
    }
    // restaurant facade
    const ridx = rd(F.restIndex);
    if (!/POS P2\.7\s*▸/.test(ridx)) p.push("restaurant/index.ts ไม่มีรอยต่อ // POS P2.7 ▸ … ◂");
    const rmk = markedLines(ridx);
    for (const n of REST_NEW_FNS) {
      if (!exportsFn(stripComments(ridx), n)) p.push(`restaurant/index.ts ไม่ export ${n}`);
      else if (!ridx.split("\n").some((l, i) => rmk.has(i) && new RegExp(`\\b${n}\\b`).test(l))) p.push(`${n} ไม่อยู่ในบล็อก POS P2.7 ของ restaurant/index.ts`);
      if (!walk(REST_DIR).some((f) => f !== F.restIndex && exportsFn(srcOf(f), n))) p.push(`${n} ไม่ได้นิยามในไฟล์ของ restaurant/`);
    }
    if (!exportsFn(srcOf(F.posTable), "registerRotateTableQr")) p.push("pos/table.ts ไม่ export registerRotateTableQr");
    // ช่องทาง + adapter
    const chs = srcOf(F.channelShared);
    const codes = [...constBody(chs, "export const CHANNEL_BUILTIN_CODES").matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]!);
    if (codes.join(",") !== "STORE,QR_TABLE,WEB,CHAT,QR_ORDER") p.push(`CHANNEL_BUILTIN_CODES = ${codes.join(",")} (คาด STORE,QR_TABLE,WEB,CHAT,QR_ORDER)`);
    if (!/QR_ORDER\s*:\s*"สั่งออนไลน์ \(QR\)"/.test(chs)) p.push('CHANNEL_BUILTIN_NAMES.QR_ORDER ≠ "สั่งออนไลน์ (QR)"');
    const ad = srcOf(F.orderAdapters);
    if (!/\bQR\s*:\s*local\(\s*"QR"\s*\)/.test(constBody(ad, "export const ORDER_ADAPTERS"))) p.push('ORDER_ADAPTERS ไม่มี QR: local("QR")');
    if (!/OrderAdapterKind\s*=[^;]*"QR"/.test(ad)) p.push('OrderAdapterKind ไม่มี "QR"');
    // outbox + cron
    const craw = rd(F.consumers);
    const ci = craw.split("\n").findIndex((l) => /"pos\.payment\.intent_paid"\s*:/.test(l));
    const cmk = markedLines(craw);
    if (ci < 0) p.push("outbox-consumers ไม่มี pos.payment.intent_paid");
    else {
      const seg = craw.split("\n").slice(Math.max(0, ci - 2), ci + 3).join("\n");
      if (!/onIntentPaid/.test(seg)) p.push("ตัวรับ pos.payment.intent_paid ไม่เรียก onIntentPaid");
      if (![ci - 1, ci, ci + 1].some((i) => cmk.has(i))) p.push("ตัวรับ intent_paid ไม่อยู่ในรอยต่อ // POS P2.7 ▸ … ◂");
      if (/withAutomation\(\s*async\s*\(\)\s*=>\s*\{\s*\}\s*\)/.test(craw.split("\n")[ci] ?? "")) p.push("ตัวรับ intent_paid ยังเป็น no-op");
    }
    if (!/\bexpirePreorders\s*\(/.test(srcOf(F.cron))) p.push("cron hourly ไม่เรียก expirePreorders");
    chk("ST2", p.length === 0, "ไฟล์/ชื่อ/บล็อกตามตารางชื่อ · ผู้เขียนเดียว · ช่องทาง/adapter/ตัวรับ/cron", P8(p) || "ครบ");
  });

  // ── ST3 ของเดิม (ฐาน) ──
  await step("ST3", async () => {
    const p: string[] = [];
    if (!revs.length) p.push("อ่าน git ไม่ได้ (ไม่มีฐาน)");
    // register.ts: ย้าย regResolveOptions เท่านั้น
    const reg = rd(F.register);
    const regNoC = stripComments(reg);
    if (/function\s+regResolveOptions\b/.test(regNoC)) p.push("register.ts ยังนิยาม regResolveOptions (มติ 9: ย้ายไปไฟล์ shared)");
    const imp = importsFrom(regNoC).find((i) => i.ids.includes("regResolveOptions"));
    if (!imp) p.push("register.ts ไม่ import regResolveOptions");
    else {
      if (!/^\.\/[a-z-]+-shared$/.test(imp.mod)) p.push(`register.ts import regResolveOptions จาก ${imp.mod} (ต้องเป็น ./*-shared)`);
      const sf = `${POS_DIR}/${imp.mod.slice(2)}.ts`;
      if (!exportsFn(srcOf(sf), "regResolveOptions")) p.push(`${sf.split("/").pop()} ไม่ export regResolveOptions`);
      if (!purePath(sf)) p.push(`${sf.split("/").pop()} ไม่บริสุทธิ์`);
    }
    const regOk = revs.some((r) => {
      const b = showAt(r, F.register);
      if (b === null) return false;
      if (b === reg) return true;
      const bNoC = stripComments(b);
      const movedHere = new Set([...MOVED_IDS].filter((n) => !new RegExp(`(function|type)\\s+${n}\\b`).test(regNoC)));
      if (stripDecls(bNoC, movedHere) !== stripDecls(regNoC, new Set())) return false;
      // import: เพิ่มได้เฉพาะชื่อที่ย้ายจาก ./*-shared · ห้ามลบ import เดิม
      const was = importsFrom(bNoC);
      const now = importsFrom(regNoC);
      const idsOf = (xs: typeof was, mod: string) => new Set(xs.filter((x) => x.mod === mod).flatMap((x) => x.ids));
      for (const mod of new Set([...was.map((x) => x.mod), ...now.map((x) => x.mod)])) {
        const a = idsOf(was, mod);
        const c = idsOf(now, mod);
        if ([...a].some((x) => !c.has(x))) return false;
        const added = [...c].filter((x) => !a.has(x));
        if (added.length && (!/^\.\/[a-z-]+-shared$/.test(mod) || added.some((x) => !MOVED_IDS.has(x)))) return false;
      }
      return true;
    });
    if (!regOk) p.push("register.ts ต่างจากฐานเกินการย้าย regResolveOptions (มติ 9 — hunk import เท่านั้น)");
    for (const f of [F.service, F.tender, F.contract]) {
      const r = sameAsBase(f);
      if (r) p.push(r);
    }
    // ทะเบียนผู้เรียก createSale = ฐาน
    const found = new Map<string, number>();
    for (const f of walk("src")) {
      if (f.endsWith("src/lib/modules/pos/service.ts") || f.endsWith("src/lib/contracts.ts")) continue;
      const n = countCreateSale(rd(f));
      if (n) found.set(f, n);
    }
    const regOkAt = revs.some((r) => {
      const hit = gitBuf(["grep", "-l", "createSale", r, "--", "src/"]);
      if (hit === null) return false;
      const ls = hit.toString("utf8").split("\n").map((x) => x.slice(r.length + 1)).filter((x) => /\.(ts|tsx)$/.test(x));
      const base = new Map<string, number>();
      for (const f of ls) {
        if (f.endsWith("src/lib/modules/pos/service.ts") || f.endsWith("src/lib/contracts.ts")) continue;
        const n = countCreateSale(showAt(r, f) ?? "");
        if (n) base.set(f, n);
      }
      const keys = new Set([...base.keys(), ...found.keys()]);
      return [...keys].every((k) => (base.get(k) ?? 0) === (found.get(k) ?? 0));
    });
    if (!regOkAt) p.push(`ทะเบียนผู้เรียก createSale ต่างจากฐาน (${[...found.entries()].map(([f, n]) => `${f.split("/").pop()}:${n}`).join(" ").slice(0, 160)})`);
    // ลายเซ็น export ร้านอาหาร (ฐาน P2.4 L3) — เทียบกับฐาน git (ชุดเดียวกับ SIGS_BASE ของ p2.4 ณ ฐาน)
    for (const file of ["table", "order", "menu", "kds", "storefront", "scope"]) {
      const path = `${REST_DIR}/${file}.ts`;
      const now = exportSigs(rd(path));
      const ok = revs.some((r) => {
        const b = showAt(r, path);
        if (b === null) return false;
        const was = exportSigs(b);
        return [...was.entries()].every(([k, v]) => now.get(k) === v);
      });
      if (!ok) p.push(`restaurant/${file}.ts ลายเซ็น export เดิมเปลี่ยน/หาย`);
    }
    // ประตูเดิมตรงทุกไบต์
    for (const f of [F.storefront, F.restQrUi, ...walk(LEGACY_API_DIR)]) {
      const r = f.startsWith(LEGACY_API_DIR) ? sameAsBaseOrP214Marked(f) : sameAsBase(f); // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 CD-2)
      if (r) p.push(r);
    }
    const ro = rd(F.restOrder);
    for (const n of ["createOrder", "writeOrderTx", "cancelOrderItem", "billPreview", "resolveLines"]) {
      const now = fnBody(ro, n);
      if (!now) {
        p.push(`restaurant/order.ts ไม่มี ${n}`);
        continue;
      }
      if (!revs.some((r) => fnBody(showAt(r, F.restOrder) ?? "", n) === now)) p.push(`restaurant/order.ts ${n} ต่างจากฐาน (S2.42 / L1)`);
    }
    chk("ST3", p.length === 0, "register.ts = ย้าย regResolveOptions เท่านั้น · service/tender/สัญญา/ทะเบียน createSale = ฐาน · ประตูเดิมตรงฐาน", P8(p) || `ครบ (ฐาน ${revs.map((r) => r.slice(0, 8)).join("/")})`);
  });

  // ── ST4 หน้าสาธารณะ + ข้อความ + หน้าเดิม ──
  await step("ST4", async () => {
    const p: string[] = [];
    for (const [f, re] of [[F.pageTable, /isTableQrToken|QR_TABLE_TOKEN_RE|qrToken/], [F.pageLink, /QR_LINK_TOKEN_RE|isLinkToken/], [F.pageOrder, /QR_ORDER_TOKEN_RE|isOrderToken|RECEIPT_TOKEN_RE/]] as const) {
      const raw = rd(f);
      if (!raw) {
        p.push(`ไม่มี ${f.replace(Q_DIR, "(store)/q")}`);
        continue;
      }
      const s = stripComments(raw);
      const nm = f.replace(Q_DIR, "q");
      if (!/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(s)) p.push(`${nm} ไม่ force-dynamic`);
      if (!/noindex|index\s*:\s*false/.test(s)) p.push(`${nm} ไม่ noindex`);
      if (AUTH_MOD.test(s) || /\brequireTenant\s*\(/.test(s)) p.push(`${nm} import session/auth`);
      if (/\bnew\s+Date\s*\(|\bDate\.now\s*\(/.test(s)) p.push(`${nm} มี new Date()/Date.now() ใน SSR`);
      if (!/\bnotFound\s*\(/.test(s) || !re.test(s)) p.push(`${nm} ไม่ notFound() เมื่อโทเคนผิดรูป`);
      if (!/@\/lib\/modules\/pos\/qr-order/.test(s)) p.push(`${nm} ไม่อ่านผ่าน pos/qr-order`);
    }
    const act = rd(F.qActions);
    if (!act) p.push("ไม่มี (store)/q/actions.ts");
    else {
      if (!isUseServer(act)) p.push("q/actions.ts ไม่ใช่ \"use server\"");
      const bad = [...stripComments(act).matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim()).filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`q/actions.ts export ที่ไม่ใช่ async function (${short(bad[0], 60)})`);
      if (!/@\/lib\/modules\/pos\/qr-order/.test(act)) p.push("q/actions.ts ไม่เรียก pos/qr-order");
      if (AUTH_MOD.test(stripComments(act))) p.push("q/actions.ts import session/auth");
      for (const n of ["placeTableRound", "placePreorder", "claimPaid"]) if (!new RegExp(`\\b${n}\\s*\\(`).test(stripComments(act))) p.push(`q/actions.ts ไม่เรียก ${n}`);
    }
    // ST7: 0 อักษรไทย · 'use client' import เฉพาะ *-shared / *-actions
    const uiFiles = [...walk(Q_DIR), ...walk(F.qUi)];
    for (const f of uiFiles) {
      const s = stripComments(rd(f));
      const thai = s.split("\n").filter((l) => THAI.test(l));
      if (thai.length) p.push(`ST7 ${f.split("/").slice(-2).join("/")} มีอักษรไทย ${thai.length} บรรทัด (${short(thai[0]!.trim(), 40)})`);
      if (isUseClient(rd(f)))
        for (const m of s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm))
          if (/^@\/lib\/(modules|core)\//.test(m[1]!) && !/-shared$|-actions$/.test(m[1]!)) p.push(`'use client' ${f.split("/").pop()} ← ${m[1]}`);
    }
    // ข้อความ
    let th: Any = null;
    let en: Any = null;
    try {
      th = JSON.parse(rd(F.msgTh));
      en = JSON.parse(rd(F.msgEn));
    } catch (e) {
      p.push(`อ่าน pos.json ไม่ได้: ${(e as Error).message.slice(0, 60)}`);
    }
    if (th && en) {
      if (!isRecord(th.qr) || !isRecord(en.qr)) p.push("pos.json ไม่มีก้อน qr (th/en)");
      else {
        const kt = flatKeys(th.qr);
        const ke = flatKeys(en.qr);
        const onlyT = [...kt.keys()].filter((k) => !ke.has(k));
        const onlyE = [...ke.keys()].filter((k) => !kt.has(k));
        if (onlyT.length || onlyE.length) p.push(`คีย์ qr ไม่ตรงกัน (th เท่านั้น ${onlyT.slice(0, 3).join(",")} · en เท่านั้น ${onlyE.slice(0, 3).join(",")})`);
        const enThai = [...ke.entries()].filter(([, v]) => THAI.test(v)).map(([k]) => k);
        if (enThai.length) p.push(`en มีอักษรไทย: ${enThai.slice(0, 3).join(",")}`);
        for (const k of QR_ERROR_KEYS) {
          if (!kt.has(`errors.${k}`) || !ke.has(`errors.${k}`)) p.push(`ไม่มี qr.errors.${k} (th/en)`);
          else if (!THAI.test(kt.get(`errors.${k}`)!)) p.push(`th qr.errors.${k} ไม่มีอักษรไทย`);
        }
      }
    }
    // หน้าเดิม: ฐาน + บล็อก redirect เท่านั้น
    const lp = rd(LEGACY_PAGE);
    if (!lp) p.push("ไม่มีหน้าเดิม restaurant/t/[qrToken]/page.tsx");
    else {
      const mk = markedLines(lp);
      const marked = lp.split("\n").filter((_, i) => mk.has(i)).join("\n");
      if (!mk.size) p.push("หน้าเดิมไม่มีบล็อก // POS P2.7 ▸ … ◂ (redirect)");
      else {
        if (!/\b(redirect|permanentRedirect)\s*\(/.test(marked)) p.push("บล็อกของหน้าเดิมไม่เรียก redirect()/permanentRedirect()");
        if (!/legacyTableQrRedirect/.test(marked)) p.push("บล็อกของหน้าเดิมไม่ใช้ legacyTableQrRedirect");
      }
      const okBase = revs.some((r) => {
        const b = showAt(r, LEGACY_PAGE);
        return b !== null && normBlank(b) === withoutMarked(lp);
      });
      if (!okBase) p.push("หน้าเดิม (ตัดบล็อก POS P2.7 แล้ว) ≠ ฐาน (มติ 1: redirect hunk เท่านั้น)");
    }
    chk("ST4", p.length === 0, "หน้า q/* force-dynamic noindex ไม่มี session/เวลา SSR · actions · ST7 · ข้อความ qr.* · หน้าเดิม = ฐาน + redirect", P8(p) || `ครบ (${uiFiles.length} ไฟล์ UI)`);
  });
}

// ═════════════════════════ 1c. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อ (สถิต · ไม่โหลด prisma)`);
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
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, missing: skipReasons })}`);
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
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const delegate = (k: string): Any => (typeof P[k]?.findMany === "function" ? P[k] : null);
const PO: Any = delegate("posOrder");
const POE: Any = delegate("posOrderEvent");
const PL: Any = delegate("posOrderLink");
const PI: Any = delegate("posPaymentIntent");
if (!PL) skipReasons.push("Prisma client ยังไม่มี delegate posOrderLink");
const dbCols = new Map<string, Set<string>>();
try {
  const rows = (await P.$queryRawUnsafe(
    `SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosOrder','PosPaymentIntent','PosOrderLink')`,
  )) as Any[];
  for (const r of rows) {
    const t = String(r.t);
    if (!dbCols.has(t)) dbCols.set(t, new Set());
    dbCols.get(t)!.add(String(r.c));
  }
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
for (const c of ["payBy", "paidAt", "paymentIntentId", "publicToken", "customerClaimAt"]) if (!dbCols.get("PosOrder")?.has(c)) skipReasons.push(`ฐาน QC4: PosOrder ยังไม่มีคอลัมน์ ${c}`);
if (!dbCols.get("PosPaymentIntent")?.has("orderId")) skipReasons.push("ฐาน QC4: PosPaymentIntent ยังไม่มีคอลัมน์ orderId");
if (!dbCols.has("PosOrderLink")) skipReasons.push("ฐาน QC4 ยังไม่มีตาราง PosOrderLink");
try {
  const ev = (await P.$queryRawUnsafe(`SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname IN ('PosOrderPaymentState','SalesChannelAdapter')`)) as Any[];
  const vals = new Set(ev.map((x) => String(x.v)));
  for (const v of ["PENDING_PAYMENT", "PREPAID", "QR"]) if (!vals.has(v)) skipReasons.push(`ฐาน QC4: enum ยังไม่มีค่า ${v}`);
} catch (e) {
  console.log(`  (อ่าน pg_enum ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}

const FP_TABLES: [string, string][] = [["PosOrder", "version"], ["PosPaymentIntent", "status"], ["TableSession", "status"], ["RestaurantOrder", "status"], ["SalesChannel", "updatedAt"]];
/** ลายนิ้วมือของร้านที่ไม่ใช่ร้านชั่วคราวของข้อสอบนี้ (ข้อมูล — lane อื่นเขียนพร้อมกันได้) */
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h
         FROM "${tb}" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE 'posqc-p27-%'))`,
      )) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      out[tb] = `อ่านไม่ได้:${(e as Error).message.slice(0, 30)}`;
    }
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.7 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons.slice(0, 12)) console.log(`   • ${r}`);
  if (skipReasons.length > 12) console.log(`   • …(+${skipReasons.length - 12})`);
  console.log(`   ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล ไม่ crash)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ex = (f: string) => existsSync(join(ROOT, f));
const qr = ex(F.qr) ? await tryImport("@/lib/modules/pos/qr-order") : null;
const ord = await tryImport("@/lib/modules/pos/order");
const intentMod = await tryImport("@/lib/modules/pos/payment-intent");
const webhookMod = await tryImport("@/lib/modules/pos/payment-webhook");
const register = await tryImport("@/lib/modules/pos/register");
const posTable = await tryImport("@/lib/modules/pos/table");
const splitMod = await tryImport("@/lib/modules/pos/table-split");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const chMod = await tryImport("@/lib/modules/pos/channel");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const kdsMod = await tryImport("@/lib/modules/pos/kds");
const dispMod = await tryImport("@/lib/modules/pos/display");
const paySetMod = await tryImport("@/lib/modules/pos/payment-settings");
const depMod = await tryImport("@/lib/modules/pos/deposit"); // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.7 fix 2) PY12 มัดจำ
const setGenMod = await tryImport("@/lib/modules/pos/settings-general");
const invSvc = await tryImport("@/lib/modules/inventory/service");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const consMod = await tryImport("@/lib/outbox-consumers");
const menu = await tryImport("@/lib/modules/restaurant/menu");
const rtable = await tryImport("@/lib/modules/restaurant/table");
const rorder = await tryImport("@/lib/modules/restaurant/order");
const storefront = await tryImport("@/lib/modules/restaurant/storefront");
const ppMod = await tryImport("@/lib/payment/promptpay");
const API_ROUTE = "src/app/api/v1/pos/[...path]/route.ts";
const HAS_P213 = ex(API_ROUTE) && ex(`${POS_DIR}/api/ops/orders.ts`);
const apiRoute = HAS_P213 ? await tryImport("@/app/api/v1/pos/[...path]/route") : null;
const akSvc = HAS_P213 ? await tryImport("@/lib/api-keys/service") : null;
const scopesMod = HAS_P213 ? await tryImport("@/lib/api-keys/scopes") : null;

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p2.7-${RAND}`;
const T_SLUG = `posqc-p27-${RAND}`;
const T2_SLUG = `${T_SLUG}-t2`;
const T3_SLUG = `${T_SLUG}-t3`;
const EMAIL_PREFIX = `${T_SLUG}-`;
const KEY_PREFIX = `qc27-${RAND}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";
let T3 = "";
const RUN_START = Date.now();
const MIN = 60_000;
const PPID = "0812345678";
/** โทเคนที่รอบนี้เห็น (ใช้ล้างถังอัตราที่ผู้สร้างอาจคีย์ด้วยโทเคน) */
const SEEN_TOKENS = new Set<string>();

// ── ตัวกั้นเครือข่าย ──
const realFetch = globalThis.fetch;
const guardHits: string[] = [];
function installFetchGuard() {
  globalThis.fetch = (async (input: Any) => {
    let host = "?";
    try {
      host = new URL(typeof input === "string" ? input : String(input?.url ?? input)).host;
    } catch {
      /* ไม่ใช่ URL */
    }
    guardHits.push(host);
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
// ── Beam ปลอม (รูปเดียวกับ qc-pos-p1.7: {enabled, createCharge}) ──
type BeamMode = "ok" | "off";
const beamCalls: Any[] = [];
let beamN = 0;
const fakeBeam = (mode: BeamMode) => ({
  enabled: () => mode !== "off",
  createCharge: async (input: Any) => {
    beamCalls.push({ ...input });
    const n = ++beamN;
    return { chargeId: `chg_qc27_${RAND}_${n}`, url: `https://pay.beam.example/qc27/${RAND}/${n}`, qrPayload: `BEAMQR-${RAND}-${n}` };
  },
});
const halfUp = (num: number, den: number) => Math.floor((2 * num + den) / (2 * den));

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ -t2 ร้านอื่นมี POS · -t3 ไม่มี POS) · DB ${HOST} ──`);
  console.log("   สาขา A (RESTAURANT · POS + คลัง · สมุด VAT · ค่าบริการ POS 10% · ร้านอาหาร 10% ปัดลง · BLOCK · DEV1 กะเปิด) · B (RESTAURANT · POS) · T2 X · T3 N (ไม่มี POS)");
  let fx = "";
  const soft: string[] = [];
  const U: Record<string, string> = {};
  const UN: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; tid: string; role: string; unitAccess: string[]; perms: Record<string, boolean> }> = {};
  const CH: Record<string, string> = {};
  const PP: Record<string, string> = {};
  const MI: Record<string, string> = {};
  const INV: Record<string, string> = {};
  const CHO: Record<string, string> = {};
  const ST: Record<string, string> = {};
  const TB: Record<string, string> = {};
  const QR: Record<string, string> = {};
  const LINK: Record<string, string> = {};
  let SHIFT1 = "";
  try {
    T = (await P.tenant.create({ data: { name: `QC P2.7 QR สั่ง ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P2.7 ร้านที่สอง ${RAND}`, slug: T2_SLUG } })).id;
    T3 = (await P.tenant.create({ data: { name: `QC P2.7 ร้านไม่มี POS ${RAND}`, slug: T3_SLUG } })).id;
    for (const [k, tid, slug] of [["A", T, `${T_SLUG}-a`], ["B", T, `${T_SLUG}-b`], ["X", T2, `${T2_SLUG}-x`], ["N", T3, `${T3_SLUG}-n`]] as const) {
      UN[k] = `${TAG} สาขา${k}`;
      U[k] = (await P.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: UN[k], slug } })).id;
    }
    S.POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
    S.INV = (await sysSvc.createSystem(T, "INVENTORY", `คลัง ${RAND}`)).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี ${RAND}`)).id;
    S.POSX = (await sysSvc.createSystem(T2, "POS", `POS T2 ${RAND}`)).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: `ร้าน QR คิวซี ${RAND} จำกัด`, taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.POS, U.B);
    await sysSvc.linkUnit(T, S.INV, U.A);
    await sysSvc.linkUnit(T2, S.POSX, U.X);
    await P.paymentProfile.create({ data: { tenantId: T, promptpayId: PPID, displayName: `ร้าน QR คิวซี ${RAND}` } });
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  // ผู้ใช้ + Membership จริง
  const spec: [string, () => string, string, () => string[], Record<string, boolean>][] = [
    ["OWNER", () => T, "OWNER", () => ["*"], {}],
    ["MGR", () => T, "MANAGER", () => [U.A ?? "-", U.B ?? "-"], {}],
    ["STAFF", () => T, "STAFF", () => [U.A ?? "-", U.B ?? "-"], { "pos.sale.create": true, "pos.order.accept": true }],
    ["OWNER2", () => T2, "OWNER", () => ["*"], {}],
  ];
  if (!fx) {
    try {
      for (const [k, tid, role, ua, perms] of spec) {
        const u = await P.user.create({ data: { email: `${EMAIL_PREFIX}${k.toLowerCase()}@qc.invalid`, name: `${k} คิวซี${RAND}` } });
        await P.membership.create({ data: { userId: u.id, tenantId: tid(), role, unitAccess: ua(), permissions: perms, acceptedAt: new Date() } });
        US[k] = { id: u.id, tid: tid(), role, unitAccess: ua(), perms };
      }
    } catch (e) {
      fx = `ผู้ใช้:${(e as Error).message.slice(0, 140)}`;
    }
  }
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const cc = (k: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", actorUserId: uid(k) });
  const DEV1 = `qc27${RAND}d1`;
  const ctxU = (u: string, dev?: string): Any => ({ tenantId: u === "X" ? T2 : T, systemId: (u === "X" ? S.POSX : S.POS) ?? "none", unitId: U[u] ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? r?.reason ?? "", 80)}`);
    return r;
  };
  let keyN = 0;
  const newKey = (pfx = "k") => `${KEY_PREFIX}-${pfx}-${++keyN}`;
  let ipN = 0;
  const freshIp = () => `qc-p27-${RAND}-ip${++ipN}`;

  // ─── ช่องทาง ───
  if (!fx) {
    try {
      for (const u of ["A", "B", "X"]) {
        const r = await call(chMod, "ensureUnitChannels", P, { tenantId: u === "X" ? T2 : T, systemId: u === "X" ? S.POSX : S.POS, unitId: U[u] });
        if (!Array.isArray(r)) throw new Error(`ensureUnitChannels ${u}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
        for (const c of r as Any[]) CH[`${c.code}_${u}`] = c.id;
      }
      if (!CH.QR_ORDER_A) soft.push("ไม่มีช่องทาง QR_ORDER (builtin ใหม่ · มติ 2)");
    } catch (e) {
      fx = `ช่องทาง:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── สถานี · ค่าตั้งร้านอาหาร · เมนู · ตัวเลือก ───
  if (!fx) {
    try {
      for (const [u, tid, names] of [["A", T, ["ครัวร้อน", "เครื่องดื่ม"]], ["B", T, ["ครัวบี"]], ["X", T2, ["ครัวเอ็กซ์"]], ["N", T3, ["ครัวเอ็น"]]] as const) {
        for (const nm of names) must(`createStation ${u} ${nm}`, await menu.createStation(tid, U[u], nm));
        for (const s of (await menu.listStations(tid, U[u])) as Any[]) ST[`${u}:${s.name}`] = s.id;
      }
      ST.hot = ST["A:ครัวร้อน"] ?? "";
      ST.drink = ST["A:เครื่องดื่ม"] ?? "";
      if (!ST.hot || !ST.drink || !ST["B:ครัวบี"]) throw new Error(`สถานีไม่ครบ ${short(ST, 80)}`);
      await menu.updateSetting(T, U.A, { serviceChargeBps: 1000 });
      const cat = must("createCategory A", await menu.createCategory(T, U.A, { name: `อาหาร ${RAND}` }, uid("OWNER")));
      const egg = must("optionGroup ไข่", await menu.createOptionGroup(T, U.A, { name: `ไข่ ${RAND}`, minSelect: 0, maxSelect: 1, choices: [{ name: "ไม่ใส่ไข่", priceDelta: 0 }, { name: "ไข่ดาว", priceDelta: 1000 }] }));
      const spice = must("optionGroup เผ็ด", await menu.createOptionGroup(T, U.A, { name: `ระดับเผ็ด ${RAND}`, minSelect: 1, maxSelect: 1, choices: [{ name: "เผ็ดน้อย", priceDelta: 0 }, { name: "เผ็ดมาก", priceDelta: 0 }] }));
      const oth = must("optionGroup อื่น", await menu.createOptionGroup(T, U.A, { name: `อื่น ${RAND}`, minSelect: 0, maxSelect: 1, choices: [{ name: "พิเศษ", priceDelta: 500 }] }));
      for (const c of (await P.menuOptionChoice.findMany({ where: { tenantId: T, groupId: { in: [egg.id, spice.id, oth.id] } } })) as Any[])
        CHO[{ ไม่ใส่ไข่: "noegg", ไข่ดาว: "fried", เผ็ดน้อย: "mild", เผ็ดมาก: "hot", พิเศษ: "other" }[String(c.name)] ?? "?"] = c.id;
      const mk = async (key: string, u: "A" | "B", catId: string, name: string, basePrice: number, stationId: string, o: Any = {}) => {
        const r = must(`createItem ${key}`, await menu.createItem(T, U[u], { categoryId: catId, stationId, name, basePrice, ...o }, uid("OWNER")));
        MI[key] = r.id;
        PP[key] = String((await P.menuItem.findUnique({ where: { id: r.id }, select: { posProductId: true } }))?.posProductId ?? "");
        if (!PP[key]) throw new Error(`เมนู ${key} ไม่มี posProductId (POS ไม่ผูกสาขา?)`);
      };
      await mk("padthai", "A", cat.id, `ผัดไทย ${RAND}`, 9000, ST.hot, { optionGroupIds: [egg.id] });
      await mk("tomyum", "A", cat.id, `ต้มยำ ${RAND}`, 11000, ST.hot, { optionGroupIds: [spice.id] });
      await mk("chayen", "A", cat.id, `ชาเย็น ${RAND}`, 4500, ST.drink);
      await mk("somtam", "A", cat.id, `ส้มตำ ${RAND}`, 6000, ST.hot);
      await mk("rice", "A", cat.id, `ข้าวสวย ${RAND}`, 1805, ST.hot);
      await mk("croissant", "A", cat.id, `ครัวซองต์ ${RAND}`, 9500, ST.drink, { stockQty: 1 });
      const catB = must("createCategory B", await menu.createCategory(T, U.B, { name: `อาหาร B ${RAND}` }, uid("OWNER")));
      await mk("padthaiB", "B", catB.id, `ผัดไทยบี ${RAND}`, 9000, ST["B:ครัวบี"]!);
      // สินค้าคลัง (นับสต็อก)
      const ictx = { tenantId: T, systemId: S.INV, actorUserId: uid("OWNER") };
      for (const [key, name, qty, price] of [["water", `น้ำเปล่า ${RAND}`, 100, 1000], ["salt", `ไข่เค็ม ${RAND}`, 1, 2000]] as const) {
        const it = await invSvc.createItem(ictx, { sku: `${KEY_PREFIX}-${key}`, name, unitLabel: "ชิ้น", costSatang: 300 });
        INV[key] = it.id;
        await invSvc.receive(ictx, { itemId: it.id, qty, costSatang: 300, idempotencyKey: `${KEY_PREFIX}-recv-${key}` });
        PP[key] = String((await P.posProduct.findFirst({ where: { tenantId: T, systemId: S.POS, invItemId: it.id }, select: { id: true } }))?.id ?? "");
        if (!PP[key]) throw new Error(`${key} ไม่มีแถว PRODUCT (P1.1b)`);
        must(`setPrice ${key}`, await call(catalog, "setPrice", cc("OWNER"), PP[key], price));
      }
    } catch (e) {
      fx = `เมนู/สินค้า:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── ราคาช่องทาง (QR_ORDER = builtin ใหม่ → ก่อนสร้างแถวนี้ถูกปฏิเสธ = อ่อน) · 86 · ค่าตั้ง POS ───
  if (!fx) {
    const cp = async (productId: string, rows: Any[]) => call(catalog, "setChannelPrices", cc("OWNER"), { productId, rows });
    const r1 = await cp(PP.padthai!, [{ channelCode: "QR_TABLE", unitId: null, priceSatang: 7500 }, { channelCode: "QR_ORDER", unitId: null, priceSatang: 8000 }]);
    if (r1?.ok === false || r1?.threw) {
      soft.push(`ราคา QR_ORDER ผัดไทย: ${codeOf(r1)}`);
      const r1b = await cp(PP.padthai!, [{ channelCode: "QR_TABLE", unitId: null, priceSatang: 7500 }]);
      if (r1b?.ok === false || r1b?.threw) soft.push(`ราคา QR_TABLE ผัดไทย: ${codeOf(r1b)}`);
    }
    const r2 = await cp(PP.chayen!, [{ channelCode: "QR_ORDER", unitId: null, priceSatang: null, notSold: true }]);
    if (r2?.ok === false || r2?.threw) soft.push(`notSold QR_ORDER ชาเย็น: ${codeOf(r2)}`);
    const av = await call(catalog, "setAvailability", ctxU("A"), A("OWNER"), { productId: PP.somtam, unitId: U.A, available: false, source: "MANUAL" });
    if (av?.ok !== true) fx = `86 ส้มตำ: ${codeOf(av)} ${short(av?.message ?? "", 60)}`;
    const ps = await call(paySetMod, "updatePosPaymentSettings", { tenantId: T, systemId: S.POS }, A("OWNER"), { serviceCharge: { enabled: true, rateBp: 1000 } });
    if (ps?.ok === false) fx = `ค่าบริการ POS: ${codeOf(ps)}`;
    const bp = await call(setGenMod, "updatePosUnitStockPolicy", { tenantId: T, systemId: S.POS }, A("OWNER"), { unitId: U.A, oversellPolicy: "BLOCK" });
    if (bp?.ok === false) fx = `นโยบาย BLOCK: ${codeOf(bp)} ${short(bp?.message ?? "", 60)}`;
  }
  const setPay = async (patch: Any): Promise<void> => {
    if (!S.POS) return;
    const sys = await P.appSystem.findUnique({ where: { id: S.POS }, select: { settings: true } });
    const base = isRecord(sys?.settings) ? sys.settings : {};
    const pos = isRecord(base.pos) ? { ...base.pos } : {};
    pos.payment = { ...(isRecord(pos.payment) ? pos.payment : {}), ...patch };
    await P.appSystem.update({ where: { id: S.POS }, data: { settings: { ...base, pos } } });
  };
  if (!fx) await setPay({ qrExpiryMinutes: 20, beam: { enabled: false }, manualConfirmRequiresManager: false });
  // ─── เครื่อง + กะ ───
  if (!fx) {
    const rg = await call(devMod, "registerDevice", ctxU("A"), A("OWNER"), { name: `เคาน์เตอร์ QC P2.7`, deviceCode: DEV1 });
    if (rg?.ok !== true) console.log(`  ⚠️  registerDevice: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    const o = await call(shiftMod, "openShift", ctxU("A", DEV1), A("OWNER"), { deviceId: DEV1, deviceLabel: `เคาน์เตอร์ QC P2.7`, floatSatang: 0 });
    if (o?.ok !== true) fx = `เปิดกะ: ${codeOf(o)} ${short(o?.message ?? "", 80)}`;
    else SHIFT1 = String(o.shift?.id ?? "");
  }
  // ─── โต๊ะ ───
  if (!fx) {
    try {
      const tables: [string, string, string[]][] = [
        ["A", T, ["A1", "A2", "A3", "A4", "A4b", "A4c", "A4d", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12", "A15"]],
        ["B", T, ["B1"]],
        ["X", T2, ["X1"]],
        ["N", T3, ["N1"]],
      ];
      for (const [u, tid, names] of tables) {
        const z = must(`zone ${u}`, await rtable.createZone(tid, U[u], `โซน ${u} ${RAND}`));
        for (const nm of names) {
          const r = must(`table ${nm}`, await rtable.createTable(tid, U[u], { zoneId: z.id, name: nm, seats: 4 }));
          TB[nm] = r.id;
          QR[nm] = r.qrToken;
          SEEN_TOKENS.add(String(r.qrToken));
        }
      }
    } catch (e) {
      fx = `โต๊ะ:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── ลิงก์สั่งล่วงหน้า (ของใหม่ — อ่อน) ───
  const O = (fn: string, ...args: unknown[]) => call(ord, fn, ...args);
  const Q = (fn: string, ...args: unknown[]) => call(qr, fn, ...args);
  if (!fx) {
    for (const [u, actor] of [["A", "OWNER"], ["B", "OWNER"], ["X", "OWNER2"]] as const) {
      const r = await O("createOrderLink", ctxU(u), A(actor), {});
      LINK[u] = r?.ok === true ? String(r.link?.token ?? "") : "";
      if (LINK[u]) SEEN_TOKENS.add(LINK[u]!);
      else soft.push(`createOrderLink ${u}: ${codeOf(r)}`);
    }
  }
  if (fx) console.log(`  ⚠️  fixture: ${fx}`);
  if (soft.length) console.log(`  ℹ️  fixture ส่วนที่ขึ้นกับของใหม่ (ข้อที่เกี่ยวข้องแดงตามเหตุผล): ${soft.join(" · ")}`);
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NEED = (...xs: [unknown, string][]) => xs.filter(([v]) => !v).map(([, l]) => `${MISSING} ${l} · `).join("");
  const NQ = () => NEED([qr, "pos/qr-order.ts"]);
  const why = (p: string[], extra = "") => FX(extra + (P8(p) || "ครบ"));

  // ─── ตัวช่วย ───
  const CUST = { name: "คุณบีคิวซี", phone: "081-234-5678" };
  const PHONE = "0812345678";
  const pl = (key: string, qty: number, choices?: string[], note?: string): Any => ({
    productId: PP[key] ?? `none-${key}`,
    qty,
    ...(choices ? { choiceIds: choices.map((c) => CHO[c] ?? `none-${c}`) } : {}),
    ...(note ? { note } : {}),
  });
  const rl = (key: string, qty: number, choices?: string[]): Any => ({ productId: PP[key] ?? `none-${key}`, qty, ...(choices ? { options: choices.map((c) => ({ choiceId: CHO[c] ?? `none-${c}` })) } : {}) });
  const orderRow = async (id: string): Promise<Any> => (PO && id ? PO.findUnique({ where: { id } }).catch(() => null) : null);
  const intentRow = async (id: string): Promise<Any> => (PI && id ? PI.findUnique({ where: { id } }).catch(() => null) : null);
  const intentsOf = async (orderId: string): Promise<Any[]> => (PI && orderId ? ((await PI.findMany({ where: { tenantId: T, orderId } }).catch(() => [])) as Any[]) : []);
  const evsOf = async (orderId: string, type?: string): Promise<Any[]> =>
    POE && orderId ? ((await POE.findMany({ where: { tenantId: T, orderId, ...(type ? { type } : {}) }, orderBy: [{ at: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]) : [];
  const salesOf = async (orderId: string): Promise<Any[]> =>
    orderId ? ((await P.posSale.findMany({ where: { tenantId: T, sourceModule: "POS", sourceId: orderId }, include: { lines: true, payments: true } }).catch(() => [])) as Any[]) : [];
  const roundsOfOrder = async (orderId: string): Promise<Any[]> => (orderId ? ((await P.restaurantOrder.findMany({ where: { tenantId: T, posOrderId: orderId } }).catch(() => [])) as Any[]) : []);
  const obx = async (type: string): Promise<Any[]> => ((await P.outboxEvent.findMany({ where: { tenantId: T, type }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]);
  const opsHits = async (marker: string, needle = ""): Promise<Any[]> =>
    ((await P.opsEvent.findMany({ where: { tenantId: T } }).catch(() => [])) as Any[]).filter((e) => [e.message, e.detail].some((s) => String(s ?? "").includes(marker)) && (!needle || [e.message, e.detail].some((s) => String(s ?? "").includes(needle))));
  const counts = async (): Promise<Record<string, number>> => ({
    order: PO ? Number(await PO.count({ where: { tenantId: T } }).catch(() => -1)) : -1,
    intent: PI ? Number(await PI.count({ where: { tenantId: T } }).catch(() => -1)) : -1,
    sale: Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1)),
    round: Number(await P.restaurantOrder.count({ where: { tenantId: T } }).catch(() => -1)),
    session: Number(await P.tableSession.count({ where: { tenantId: T } }).catch(() => -1)),
    request: Number(await P.restaurantServiceRequest.count({ where: { tenantId: T } }).catch(() => -1)),
    event: POE ? Number(await POE.count({ where: { tenantId: T } }).catch(() => -1)) : -1,
  });
  const diffCounts = (a: Record<string, number>, b: Record<string, number>, allow: Record<string, number> = {}) =>
    Object.keys(a)
      .filter((k) => b[k]! - a[k]! !== (allow[k] ?? 0))
      .map((k) => `${k} ${a[k]}→${b[k]}${allow[k] ? ` (คาด +${allow[k]})` : ""}`);
  const newOrders = async (since: Date): Promise<Any[]> => (PO ? ((await PO.findMany({ where: { tenantId: T, createdAt: { gte: since } }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]) : []);
  type Pre = { r: Any; tok: string; row: Any; intent: Any; key: string };
  const preorder = async (lines: Any[], o: { key?: string; ip?: string; deps?: Any; token?: string; customer?: Any; note?: string } = {}): Promise<Pre> => {
    const key = o.key ?? newKey("po");
    const input = { lines, customer: o.customer ?? CUST, idempotencyKey: key, ...(o.note ? { note: o.note } : {}) };
    const r = await Q("placePreorder", o.token ?? LINK.A ?? "", input, { ip: o.ip ?? freshIp() }, ...(o.deps ? [o.deps] : []));
    const tok = r?.ok === true ? String(r.orderToken ?? "") : "";
    if (tok) SEEN_TOKENS.add(tok);
    const row = tok && PO ? await PO.findFirst({ where: { tenantId: { in: [T, T2] }, publicToken: tok } }).catch(() => null) : null;
    const intent = row ? ((await intentsOf(row.id))[0] ?? (row.paymentIntentId ? await intentRow(row.paymentIntentId) : null)) : null;
    return { r, tok, row, intent, key };
  };
  const PREFAIL = (x: Pre) => (x.row ? "" : `placePreorder → ${codeOf(x.r)} ${short(x.r?.message ?? "", 60)} · `);
  const hook = async (intent: Any, over: Any = {}): Promise<Any> =>
    call(webhookMod, "onBeamWebhookEvent", { referenceId: `pos-${String(intent?.id ?? "none")}`, chargeId: String(intent?.beamChargeId ?? "none"), status: "SUCCEEDED", amountSatang: Number(intent?.amountSatang ?? 0), raw: "{}", ...over });
  const manual = (intentId: string, actor = "MGR") => call(intentMod, "confirmPaymentIntentManual", ctxU("A", DEV1), A(actor), { intentId });
  const replay = async (type: string, pred: (e: Any) => boolean, n = 2): Promise<string> => {
    const h = consMod?.consumers?.[type];
    const ev = (await obx(type)).find(pred);
    if (!ev || typeof h !== "function") return `ไม่มี event/consumer ${type} ให้เล่นซ้ำ`;
    for (let i = 0; i < n; i++) {
      try {
        await h(ev);
      } catch (e) {
        return `เล่นซ้ำ throw ${(e as Error).message.slice(0, 50)}`;
      }
    }
    return "";
  };
  const newCount = async (): Promise<number> => {
    const r = await O("listOrders", ctxU("A"), A("OWNER"), {});
    return r?.ok === true ? Number(r.counts?.byColumn?.new ?? -1) : -1;
  };
  const refusalShapeBad = (r: Any): string => {
    if (r?.ok !== false) return `ไม่ใช่คำปฏิเสธ (${codeOf(r)})`;
    const extra = Object.keys(r).filter((k) => !["ok", "code", "messageKey", "message", "lineIndex", "retryAfterSec"].includes(k));
    if (extra.length) return `${r.code}: คีย์เกิน ${extra.join(",")}`;
    if (typeof r.messageKey !== "string" || !/^qr\.errors\.[a-zA-Z]+$/.test(r.messageKey)) return `${r.code}: messageKey ${short(r.messageKey, 40)}`;
    return "";
  };
  let MSG_TH: Map<string, string> = new Map();
  let MSG_EN: Map<string, string> = new Map();
  try {
    MSG_TH = flatKeys(JSON.parse(rd(F.msgTh)));
    MSG_EN = flatKeys(JSON.parse(rd(F.msgEn)));
  } catch {
    /* ST4 รายงานแล้ว */
  }
  const msgKeyBad = (r: Any): string => (r?.ok === false && typeof r.messageKey === "string" && (!MSG_TH.has(r.messageKey) || !MSG_EN.has(r.messageKey)) ? `${r.messageKey} ไม่มีใน th/en` : "");
  const menuOf = (r: Any): Any[] => (r?.ok === true && Array.isArray(r.view?.menu) ? r.view.menu : []);
  const itemOf = (r: Any, key: string): Any => menuOf(r).find((m) => m.productId === PP[key]) ?? null;
  const round = async (qrToken: string, lines: Any[], o: { expectedSessionId?: string | null; ip?: string } = {}) =>
    Q("placeTableRound", qrToken, { lines, ...(o.expectedSessionId !== undefined ? { expectedSessionId: o.expectedSessionId } : {}) }, { ip: o.ip ?? freshIp() });
  const sessionsOf = async (tableId: string): Promise<Any[]> => (tableId ? ((await P.tableSession.findMany({ where: { tenantId: T, tableId }, orderBy: { openedAt: "asc" } }).catch(() => [])) as Any[]) : []);
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.7 fix 2) TB8: รอบทั้งหมดของโต๊ะ (ทุก session)
  const roundsOfTable = async (name: string): Promise<Any[]> => (TB[name] ? ((await P.restaurantOrder.findMany({ where: { tenantId: T, session: { tableId: TB[name] } } }).catch(() => [])) as Any[]) : []);
  const roundsOfSession = async (sessionId: string): Promise<Any[]> => (sessionId ? ((await P.restaurantOrder.findMany({ where: { tenantId: T, sessionId }, include: { items: { include: { options: true } } } }).catch(() => [])) as Any[]) : []);
  const xmin = async (table: string, id: string): Promise<string> => {
    const r = (await P.$queryRawUnsafe(`SELECT xmin::text AS x FROM "${table}" WHERE id = $1`, id).catch(() => [])) as Any[];
    return String(r[0]?.x ?? "-");
  };
  const openTable = async (name: string): Promise<string> => {
    const r = await call(posTable, "registerOpenTable", ctxU("A", DEV1), A("OWNER"), { tableId: TB[name], guestCount: 2 });
    return r?.ok === true ? String(r.sessionId) : "";
  };
  const bucketCount = async (): Promise<number> => {
    const toks = [...SEEN_TOKENS].filter(Boolean);
    const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1 OR key = ANY($2::text[]) OR EXISTS (SELECT 1 FROM unnest($2::text[]) t WHERE position(t IN key) > 0)`, `%${RAND}%`, toks).catch(() => [{ n: -1 }])) as Any[];
    return Number(r[0]?.n ?? -1);
  };
  const BKK_TODAY = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  type JLine = { code: string; debit: number; credit: number };
  const journalShape = async (saleId: string): Promise<string> => {
    if (!saleId) return "—";
    const es = (await P.accountJournalEntry.findMany({ where: { tenantId: T, refType: "PosSale", refId: saleId }, include: { lines: { include: { account: { select: { code: true } } } } } }).catch(() => [])) as Any[];
    const m = new Map<string, [number, number]>();
    for (const l of es.flatMap((e: Any) => (e.lines ?? []) as Any[]).map((l: Any): JLine => ({ code: String(l.account?.code ?? "?"), debit: l.debit, credit: l.credit }))) {
      const a = m.get(l.code) ?? [0, 0];
      m.set(l.code, [a[0] + l.debit, a[1] + l.credit]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([c, [d, k]]) => `${c}:${d}/${k}`).join(" ") || "—";
  };
  /** บิลหน้าขาย PROMPTPAY อ้างใบขอรับเงินที่ยืนยันแล้ว (ตัวควบคุม GL · การใช้ pi_ ของ PY9) */
  const sellWithIntent = async (lines: Any[], intentId: string, channelId?: string): Promise<{ saleId: string; r: Any }> => {
    const ctx = ctxU("A", DEV1);
    const base = { lines, ...(channelId ? { channelId } : {}) };
    const q = await call(register, "quoteRegisterCart", ctx, A("OWNER"), base);
    if (q?.ok !== true) return { saleId: "", r: q };
    const grand = Number(q.grandTotalSatang);
    const r = await call(register, "submitRegisterSale", ctx, A("OWNER"), { ...base, idempotencyKey: newKey("rs"), expectedGrandTotalSatang: grand, payMethods: [{ type: "PROMPTPAY", amountSatang: grand, reference: intentId }] });
    return { saleId: r?.ok === true ? String(r.saleId ?? "") : "", r };
  };
  const staffIntent = async (amount: number): Promise<Any> => {
    const r = await call(intentMod, "createPaymentIntent", ctxU("A", DEV1), A("OWNER"), { method: "PROMPTPAY", amountSatang: amount, idempotencyKey: newKey("si").replace(/[^A-Za-z0-9_-]/g, "_"), deviceId: DEV1 });
    return r?.ok === true ? r.intent : null;
  };
  const minusTime = (v: Any): string => JSON.stringify(v ?? null, (k, x) => (/At$|^generated|^now$|^asOf|Time$/.test(k) ? undefined : x));

  // ════════ TK โทเคน ════════
  await step("TK1", async () => {
    const p: string[] = [];
    const a = await Q("tableDoor", QR.A1 ?? "");
    const b = await Q("tableDoor", QR.B1 ?? "");
    if (a?.ok !== true) p.push(`tableDoor A1 → ${codeOf(a)}`);
    else {
      if (a.view?.unit?.name !== UN.A || a.view?.table?.name !== "A1") p.push(`A1 → สาขา/โต๊ะ ${short([a.view?.unit?.name, a.view?.table?.name], 80)}`);
      if (!itemOf(a, "padthai")) p.push("เมนู A1 ไม่มีผัดไทย");
    }
    if (b?.ok !== true) p.push(`tableDoor B1 → ${codeOf(b)}`);
    else {
      if (b.view?.unit?.name !== UN.B || b.view?.table?.name !== "B1") p.push(`B1 → สาขา/โต๊ะ ${short([b.view?.unit?.name, b.view?.table?.name], 80)}`);
      if (!itemOf(b, "padthaiB")) p.push("เมนู B1 ไม่มีผัดไทยบี");
    }
    if (!fx) {
      await rtable.updateTable(T, U.A, TB.A7, { status: "INACTIVE" });
      await rtable.archiveTable(T, U.A, TB.A8);
    }
    for (const [lbl, tok] of [["ปิดใช้ A7", QR.A7], ["เก็บถาวร A8", QR.A8]] as const) {
      const r = await Q("tableDoor", tok ?? "");
      if (!refused(r, "TOKEN_INVALID")) p.push(`${lbl} → ${codeOf(r)} (คาด TOKEN_INVALID)`);
    }
    const c0 = await counts();
    const rr = await round(QR.A9 ?? "", [pl("chayen", 1)]);
    const roundsB = Number(await P.restaurantOrder.count({ where: { tenantId: T, unitId: U.B } }).catch(() => -1));
    if (rr?.ok !== true) p.push(`รอบ A9 → ${codeOf(rr)} ${short(rr?.message ?? "", 60)}`);
    else {
      const ro = await P.restaurantOrder.findFirst({ where: { id: String(rr.roundId ?? "") } }).catch(() => null);
      if (ro?.unitId !== U.A || ro?.tenantId !== T) p.push(`รอบลง ${short({ unit: ro?.unitId === U.A ? "A" : ro?.unitId, tenant: ro?.tenantId === T }, 80)}`);
    }
    if (roundsB !== 0) p.push(`สาขา B มีรอบ ${roundsB}`);
    const c1 = await counts();
    const d = diffCounts(c0, c1, rr?.ok === true ? { round: 1, session: 1 } : {});
    if (d.length) p.push(`แถว: ${d.join(", ")}`);
    chk("TK1", !fx && !NQ() && p.length === 0, "โทเคนโต๊ะผูกสาขาของตัวเอง · ปิด/เก็บ = TOKEN_INVALID · รอบลงสาขา A", why(p, NQ()));
  });

  await step("TK2", async () => {
    const p: string[] = [];
    const old = QR.A9 ?? "";
    const d = await call(posTable, "registerRotateTableQr", ctxU("A", DEV1), A("STAFF"), { tableId: TB.A9 });
    if (!refused(d, "PERMISSION_DENIED")) p.push(`STAFF → ${codeOf(d)} (คาด PERMISSION_DENIED)`);
    const still = await P.restaurantTable.findUnique({ where: { id: TB.A9 ?? "none" }, select: { qrToken: true } }).catch(() => null);
    if (still?.qrToken !== old) p.push("STAFF เปลี่ยน QR ได้");
    const r = await call(posTable, "registerRotateTableQr", ctxU("A", DEV1), A("OWNER"), { tableId: TB.A9 });
    const fresh = r?.ok === true ? String(r.qrToken ?? "") : "";
    if (!fresh || fresh === old) p.push(`OWNER → ${codeOf(r)} ${short(r?.qrToken, 30)}`);
    else {
      SEEN_TOKENS.add(fresh);
      QR.A9 = fresh;
      const row = await P.restaurantTable.findUnique({ where: { id: TB.A9 ?? "none" }, select: { qrToken: true } }).catch(() => null);
      if (row?.qrToken !== fresh) p.push("แถวโต๊ะไม่ใช่โทเคนใหม่");
    }
    const c0 = await counts();
    const od = await Q("tableDoor", old);
    const orr = await round(old, [pl("chayen", 1)]);
    if (!refused(od, "TOKEN_INVALID") || !refused(orr, "TOKEN_INVALID")) p.push(`โทเคนเก่า → ${codeOf(od)} / ${codeOf(orr)} (คาด TOKEN_INVALID)`);
    const dd = diffCounts(c0, await counts());
    if (dd.length) p.push(`โทเคนเก่าเขียนแถว: ${dd.join(", ")}`);
    const nd = await Q("tableDoor", fresh);
    if (nd?.ok !== true || nd.view?.table?.name !== "A9") p.push(`โทเคนใหม่ → ${codeOf(nd)}`);
    chk("TK2", !fx && !NQ() && p.length === 0, "STAFF ไม่มีสิทธิ์ · OWNER เปลี่ยนได้ · เก่า TOKEN_INVALID · ใหม่ใช้ได้", why(p, NQ()));
  });

  await step("TK3", async () => {
    const p: string[] = [];
    const activeOf = async (u: string) => (PL ? Number(await PL.count({ where: { tenantId: T, unitId: U[u], status: "ACTIVE" } }).catch(() => -1)) : -1);
    for (const fn of ["createOrderLink", "rotateOrderLink", "revokeOrderLink"]) {
      const r = await O(fn, ctxU("A"), A("STAFF"), {});
      if (!refused(r, "PERMISSION_DENIED")) p.push(`STAFF ${fn} → ${codeOf(r)} (คาด PERMISSION_DENIED)`);
    }
    const again = await O("createOrderLink", ctxU("A"), A("OWNER"), {});
    if (again?.ok !== true || again.link?.token !== LINK.A) p.push(`create ซ้ำ → ${codeOf(again)} ${again?.link?.token === LINK.A ? "" : "ลิงก์ใหม่ (คาดลิงก์เดิม)"}`);
    const tok = LINK.A ?? "";
    if (!/^[0-9A-HJKMNP-TV-Z]{16}$/.test(tok)) p.push(`token ${short(tok, 20)} ไม่ใช่ 16 ตัว Crockford`);
    if ((await activeOf("A")) !== 1) p.push(`ACTIVE ของสาขา A = ${await activeOf("A")}`);
    const g = await O("getOrderLink", ctxU("A"), A("OWNER"), {});
    if (g?.ok !== true || g.link?.token !== tok) p.push(`getOrderLink → ${codeOf(g)}`);
    const ro = await O("rotateOrderLink", ctxU("A"), A("OWNER"), {});
    const nt = ro?.ok === true ? String(ro.link?.token ?? "") : "";
    if (!nt || nt === tok) p.push(`rotate → ${codeOf(ro)}`);
    else {
      SEEN_TOKENS.add(nt);
      const oldRow = PL ? await PL.findFirst({ where: { tenantId: T, token: tok } }).catch(() => null) : null;
      const newRow = PL ? await PL.findFirst({ where: { tenantId: T, token: nt } }).catch(() => null) : null;
      if (oldRow?.status !== "REVOKED" || newRow?.status !== "ACTIVE" || !(oldRow?.rotatedAt || newRow?.rotatedAt)) p.push(`ลิงก์เก่า/ใหม่ ${short({ old: oldRow?.status, new: newRow?.status, rotatedAt: !!(oldRow?.rotatedAt || newRow?.rotatedAt) }, 80)} (คาด REVOKED/ACTIVE + rotatedAt)`);
      if (!refused(await Q("linkDoor", tok), "TOKEN_INVALID")) p.push("linkDoor ลิงก์เก่าไม่ TOKEN_INVALID");
      const nd = await Q("linkDoor", nt);
      if (nd?.ok !== true || nd.view?.unit?.name !== UN.A) p.push(`linkDoor ลิงก์ใหม่ → ${codeOf(nd)}`);
      LINK.A = nt;
    }
    if ((await activeOf("A")) !== 1) p.push(`หลัง rotate ACTIVE ${await activeOf("A")}`);
    // revoke ลิงก์ของ T2 (ใช้ใน TK4) — ของ A ยังต้องใช้ต่อ
    const rv = await O("revokeOrderLink", ctxU("X"), A("OWNER2"), {});
    if (rv?.ok !== true) p.push(`revoke X → ${codeOf(rv)}`);
    if (LINK.X && !refused(await Q("linkDoor", LINK.X), "TOKEN_INVALID")) p.push("linkDoor หลัง revoke ไม่ TOKEN_INVALID");
    if (PL && Number(await PL.count({ where: { tenantId: T2, status: "ACTIVE" } }).catch(() => -1)) !== 0) p.push("T2 ยังมีลิงก์ ACTIVE หลัง revoke");
    chk("TK3", !fx && !NQ() && p.length === 0, "สิทธิ์ pos.channel.manage · ACTIVE 1 ต่อสาขา · rotate/revoke = TOKEN_INVALID", why(p, NEED([PL, "โมเดล PosOrderLink"]) + NQ()));
  });

  await step("TK4", async () => {
    const p: string[] = [];
    const c0 = await counts();
    const cases: [string, Promise<Any>][] = [
      ["linkDoor มั่ว (รูปถูก)", Q("linkDoor", "0123456789ABCDEF")],
      ["linkDoor ผิดรูป", Q("linkDoor", "../../etc")],
      ["linkDoor revoke (T2)", Q("linkDoor", LINK.X ?? "ZZZZZZZZZZZZZZZZ")],
      ["linkDoor ← qrToken โต๊ะ", Q("linkDoor", QR.A1 ?? "x")],
      ["tableDoor มั่ว", Q("tableDoor", "qr_00000000000000000000000000000000")],
      ["tableDoor ← ลิงก์", Q("tableDoor", LINK.A ?? "x")],
      ["orderStatus มั่ว", Q("orderStatus", "0123456789AB", {})],
      ["orderStatus ← ลิงก์", Q("orderStatus", LINK.A ?? "x", {})],
      ["placePreorder ลิงก์ revoke", Q("placePreorder", LINK.X ?? "ZZZZZZZZZZZZZZZZ", { lines: [pl("padthai", 1)], customer: CUST, idempotencyKey: newKey("tk4") }, { ip: freshIp() })],
      ["claimPaid มั่ว", Q("claimPaid", "0123456789AB", { ip: freshIp() })],
    ];
    const rs = await Promise.all(cases.map(([, x]) => x));
    const sig = (r: Any) => short({ ok: r?.ok, code: r?.code, messageKey: r?.messageKey, message: r?.message }, 300);
    const s0 = sig(rs[0]);
    rs.forEach((r, i) => {
      if (!refused(r, "TOKEN_INVALID")) p.push(`${cases[i]![0]} → ${codeOf(r)}`);
      else if (sig(r) !== s0) p.push(`${cases[i]![0]} รูปคำปฏิเสธต่าง (${short(sig(r), 60)})`);
    });
    const d = diffCounts(c0, await counts());
    if (d.length) p.push(`แถว: ${d.join(", ")}`);
    chk("TK4", !fx && !NQ() && p.length === 0, "TOKEN_INVALID รูปเดียวกันทุกกรณี · ไม่เขียน", why(p, NQ()));
  });

  await step("TK5", async () => {
    const p: string[] = [];
    const a = await Q("legacyTableQrRedirect", T, U.A, QR.A1 ?? "");
    const n = await Q("legacyTableQrRedirect", T3, U.N, QR.N1 ?? "");
    const wrong = await Q("legacyTableQrRedirect", T, U.B, QR.A1 ?? "");
    if (a !== `/q/t/${QR.A1}`) p.push(`สาขา A (มี POS) → ${short(a, 60)} (คาด /q/t/<qrToken>)`);
    if (n !== null) p.push(`T3 (ไม่มี POS) → ${short(n, 60)} (คาด null)`);
    if (wrong !== null) p.push(`โทเคนของ A กับสาขา B → ${short(wrong, 60)} (คาด null)`);
    chk("TK5", !fx && !NQ() && p.length === 0, "มี POS = /q/t/<qrToken> · ไม่มี POS / ไม่ใช่สาขานั้น = null", why(p, NQ()));
  });

  // ════════ PO ออเดอร์สาธารณะ ════════
  await step("PO1", async () => {
    const p: string[] = [];
    const l = await Q("linkDoor", LINK.A ?? "");
    const t = await Q("tableDoor", QR.A1 ?? "");
    if (l?.ok !== true) p.push(`linkDoor → ${codeOf(l)}`);
    else {
      const pt = itemOf(l, "padthai");
      if (pt?.priceSatang !== 8000 || pt?.priceSource !== "CHANNEL") p.push(`QR_ORDER ผัดไทย ${short({ price: pt?.priceSatang, src: pt?.priceSource }, 60)} (คาด 8000 CHANNEL)`);
      const w = itemOf(l, "water");
      if (w?.priceSatang !== 1000 || w?.priceSource !== "BASE") p.push(`น้ำ ${short({ price: w?.priceSatang, src: w?.priceSource }, 60)} (คาด 1000 BASE)`);
      if (itemOf(l, "chayen")) p.push("ชาเย็น (notSold QR_ORDER) อยู่ในเมนู");
      const sm = itemOf(l, "somtam");
      if (!sm || sm.available !== false) p.push(`ส้มตำ (86) ${sm ? `available ${sm.available}` : "ไม่อยู่"} (คาด อยู่ + available false)`);
      if (pt?.available !== true) p.push("ผัดไทย available ไม่ใช่ true");
      const g = Array.isArray(pt?.optionGroups) ? pt.optionGroups[0] : null;
      const ch = Array.isArray(g?.choices) ? g.choices : [];
      if (!g || g.minSelect !== 0 || g.maxSelect !== 1 || ch.length !== 2 || ch.find((c: Any) => c.choiceId === CHO.fried)?.priceDeltaSatang !== 1000 || ch.find((c: Any) => c.choiceId === CHO.noegg)?.priceDeltaSatang !== 0) p.push(`ตัวเลือกผัดไทย ${short(g, 140)}`);
    }
    if (t?.ok !== true) p.push(`tableDoor → ${codeOf(t)}`);
    else {
      const pt = itemOf(t, "padthai");
      if (pt?.priceSatang !== 7500 || pt?.priceSource !== "CHANNEL") p.push(`QR_TABLE ผัดไทย ${short({ price: pt?.priceSatang, src: pt?.priceSource }, 60)} (คาด 7500 CHANNEL)`);
      const cy = itemOf(t, "chayen");
      if (cy?.priceSatang !== 4500) p.push(`QR_TABLE ชาเย็น ${short(cy?.priceSatang, 20)} (คาด 4500)`);
    }
    chk("PO1", !fx && !NQ() && p.length === 0, "เมนูราคาช่องทาง · ไม่ขาย = ไม่แสดง · 86 = หมด · ตัวเลือกตรง", why(p, NQ() + (soft.length ? `(fixture: ${soft.join(" · ")}) · ` : "")));
  });

  await step("PO2", async () => {
    const p: string[] = [];
    const c0 = await counts();
    const a = await preorder([pl("padthai", 1), pl("somtam", 1)]);
    if (!refused(a.r, "PRODUCT_UNAVAILABLE") || a.r?.lineIndex !== 1) p.push(`สั่งล่วงหน้า ส้มตำ → ${codeOf(a.r)} line ${short(a.r?.lineIndex, 5)} (คาด PRODUCT_UNAVAILABLE 1)`);
    const b = await preorder([pl("chayen", 1)]);
    if (!refused(b.r, "CHANNEL_NOT_SOLD", "PRODUCT_UNAVAILABLE") || b.r?.lineIndex !== 0) p.push(`สั่งล่วงหน้า ชาเย็น → ${codeOf(b.r)} line ${short(b.r?.lineIndex, 5)} (คาด CHANNEL_NOT_SOLD 0)`);
    const t = await round(QR.A11 ?? "", [pl("somtam", 1)]);
    if (!refused(t, "PRODUCT_UNAVAILABLE") || t?.lineIndex !== 0) p.push(`รอบโต๊ะ ส้มตำ → ${codeOf(t)} line ${short(t?.lineIndex, 5)}`);
    for (const r of [a.r, b.r, t]) {
      const bad = refusalShapeBad(r) || msgKeyBad(r);
      if (bad && r?.ok === false && !r.missing) p.push(`รูปคำปฏิเสธ: ${bad}`);
    }
    const d = diffCounts(c0, await counts());
    if (d.length) p.push(`แถว: ${d.join(", ")}`);
    chk("PO2", !fx && !NQ() && p.length === 0, "86/ไม่ขาย = ปฏิเสธพร้อม lineIndex · ไม่เขียน", why(p, NQ()));
  });

  await step("PO3", async () => {
    const p: string[] = [];
    const c0 = await counts();
    const a = await preorder([pl("tomyum", 1)]);
    if (!refused(a.r, "OPTIONS_REQUIRED") || a.r?.lineIndex !== 0) p.push(`ต้มยำไม่เลือก → ${codeOf(a.r)} line ${short(a.r?.lineIndex, 5)} (คาด OPTIONS_REQUIRED 0)`);
    const b = await preorder([pl("water", 1), pl("padthai", 1, ["other"])]);
    if (!refused(b.r, "OPTIONS_INVALID") || b.r?.lineIndex !== 1) p.push(`ตัวเลือกกลุ่มอื่น → ${codeOf(b.r)} line ${short(b.r?.lineIndex, 5)} (คาด OPTIONS_INVALID 1)`);
    const t = await round(QR.A11 ?? "", [pl("tomyum", 1)]);
    if (!refused(t, "OPTIONS_REQUIRED")) p.push(`รอบโต๊ะต้มยำไม่เลือก → ${codeOf(t)}`);
    const d = diffCounts(c0, await counts());
    if (d.length) p.push(`ปฏิเสธแล้วเขียน: ${d.join(", ")}`);
    const ok = await preorder([pl("padthai", 1, ["fried"])]);
    if (!ok.row) p.push(`ผัดไทย+ไข่ดาว ${PREFAIL(ok)}`);
    else {
      const ls = (await P.posOrderLine.findMany({ where: { tenantId: T, orderId: ok.row.id } }).catch(() => [])) as Any[];
      const opt = Array.isArray(ls[0]?.options) ? ls[0].options : [];
      if (ls.length !== 1 || ls[0].unitPriceSatang !== 9000 || ls[0].lineTotalSatang !== 9000 || opt.length !== 1 || opt[0]?.choiceId !== CHO.fried || opt[0]?.priceDeltaSatang !== 1000) p.push(`บรรทัด ${short(ls.map((x) => [x.unitPriceSatang, x.lineTotalSatang, x.options]), 140)} (คาด 9000 + ไข่ดาว 1000)`);
    }
    const tr = await round(QR.A11 ?? "", [pl("padthai", 1, ["fried"])]);
    if (tr?.ok !== true) p.push(`รอบโต๊ะ ผัดไทย+ไข่ดาว → ${codeOf(tr)}`);
    else {
      const its = (await P.restaurantOrderItem.findMany({ where: { tenantId: T, orderId: String(tr.roundId ?? "") }, include: { options: true } }).catch(() => [])) as Any[];
      const it = its[0];
      if (its.length !== 1 || it.unitPrice + it.optionsTotal !== 8500 || it.lineTotal !== 8500 || it.productId !== PP.padthai || (it.options ?? []).length !== 1) p.push(`รายการโต๊ะ ${short(its.map((x) => [x.unitPrice, x.optionsTotal, x.lineTotal, x.productId === PP.padthai, (x.options ?? []).length]), 120)} (คาด 7500+1000)`);
    }
    chk("PO3", !fx && !NQ() && p.length === 0, "บังคับ/ผิดกลุ่ม = ปฏิเสธไม่เขียน · ส่วนต่างตัวเลือกเข้าราคา", why(p, NQ()));
  });

  await step("PO4", async () => {
    const p: string[] = [];
    const c0 = await counts();
    const lines = [pl("padthai", 2, ["fried"]), pl("water", 3)];
    const reg = [rl("padthai", 2, ["fried"]), rl("water", 3)];
    const qp = await Q("quotePreorderCart", LINK.A ?? "", { lines });
    const rp = await call(register, "quoteRegisterCart", ctxU("A"), A("OWNER"), { lines: reg, ...(CH.QR_ORDER_A ? { channelId: CH.QR_ORDER_A } : {}) });
    if (!CH.QR_ORDER_A) p.push("ไม่มีช่องทาง QR_ORDER ให้เทียบ");
    if (qp?.ok !== true || rp?.ok !== true) p.push(`quote สั่งล่วงหน้า ${codeOf(qp)} / หน้าขาย ${codeOf(rp)}`);
    else {
      if (qp.totalSatang !== rp.grandTotalSatang) p.push(`ยอดสั่งล่วงหน้า ${qp.totalSatang} ≠ หน้าขาย ${rp.grandTotalSatang}`);
      const up = (xs: Any[]) => (Array.isArray(xs) ? xs.map((x) => Number(x.unitPriceSatang)).join(",") : "-");
      if (up(qp.lines) !== up(rp.lines)) p.push(`ราคาต่อหน่วย ${up(qp.lines)} ≠ ${up(rp.lines)}`);
      if (qp.totalSatang !== 2 * 9000 + 3 * 1000) p.push(`ยอด ${qp.totalSatang} (คาด 21000)`);
    }
    const qt = await Q("quoteTableCart", QR.A1 ?? "", { lines });
    const rt = await call(register, "quoteRegisterCart", ctxU("A"), A("OWNER"), { lines: reg, ...(CH.QR_TABLE_A ? { channelId: CH.QR_TABLE_A } : {}) });
    if (qt?.ok !== true || rt?.ok !== true) p.push(`quote โต๊ะ ${codeOf(qt)} / หน้าขาย ${codeOf(rt)}`);
    else {
      if (qt.subtotalSatang !== rt.subtotalSatang || qt.serviceChargeSatang !== rt.serviceChargeSatang || qt.totalSatang !== rt.grandTotalSatang)
        p.push(`โต๊ะ ${short([qt.subtotalSatang, qt.serviceChargeSatang, qt.totalSatang], 60)} ≠ หน้าขาย ${short([rt.subtotalSatang, rt.serviceChargeSatang, rt.grandTotalSatang], 60)}`);
      if (rt.serviceChargeSatang !== halfUp((2 * 8500 + 3 * 1000) * 1000, 10_000)) p.push(`(ตัวควบคุม) ค่าบริการหน้าขาย ${rt.serviceChargeSatang}`);
    }
    const d = diffCounts(c0, await counts());
    if (d.length) p.push(`quote เขียนแถว: ${d.join(", ")}`);
    chk("PO4", !fx && !NQ() && p.length === 0, "quote สาธารณะ = quoteRegisterCart ของช่องทาง · ไม่เขียน", why(p, NQ()));
  });

  await step("PO5", async () => {
    const p: string[] = [];
    const c0 = await counts();
    const closedCase = async (label: string, close: () => Promise<Any>, open: () => Promise<Any>) => {
      const cr = await close();
      if (cr?.ok === false) p.push(`(fixture) ปิด ${label}: ${codeOf(cr)} ${short(cr?.message ?? cr?.reason ?? "", 50)}`);
      const r = await preorder([pl("padthai", 1)]);
      const v = await Q("linkDoor", LINK.A ?? "");
      if (!refused(r.r, "QR_CLOSED")) p.push(`${label} → ${codeOf(r.r)} (คาด QR_CLOSED)`);
      else if (refusalShapeBad(r.r) || msgKeyBad(r.r)) p.push(`${label}: ${refusalShapeBad(r.r) || msgKeyBad(r.r)}`);
      if (v?.ok !== true || v.view?.open !== false || !menuOf(v).length) p.push(`${label} linkDoor ${short({ ok: v?.ok, open: v?.view?.open, menu: menuOf(v).length }, 60)} (คาด open:false + เมนู)`);
      await open();
    };
    const qo = CH.QR_ORDER_A ?? "none";
    await closedCase("QR_ORDER ปิดใช้", () => call(chMod, "saveChannel", ctxU("A"), A("OWNER"), { id: qo, name: "สั่งออนไลน์ (QR)", active: false }), () => call(chMod, "saveChannel", ctxU("A"), A("OWNER"), { id: qo, name: "สั่งออนไลน์ (QR)", active: true }));
    await closedCase("พักรับ", () => O("setChannelOrderSettings", ctxU("A"), A("OWNER"), { channelId: qo, pausedUntil: new Date(Date.now() + 30 * MIN).toISOString() }), () => O("setChannelOrderSettings", ctxU("A"), A("OWNER"), { channelId: qo, pausedUntil: null }));
    await closedCase("ครัวหยุดรับ", () => menu.setKitchenPause(T, U.A, true, "QC P2.7"), () => menu.setKitchenPause(T, U.A, false));
    await closedCase("วันนี้ร้านปิด", () => menu.updateSetting(T, U.A, { specialClosures: [{ date: BKK_TODAY, closed: true, note: "QC" }] }), () => menu.updateSetting(T, U.A, { specialClosures: [] }));
    const qt = CH.QR_TABLE_A ?? "none";
    const cr = await call(chMod, "saveChannel", ctxU("A"), A("OWNER"), { id: qt, name: "QR โต๊ะ", active: false });
    if (cr?.ok === false) p.push(`(fixture) ปิด QR_TABLE: ${codeOf(cr)}`);
    const tr = await round(QR.A12 ?? "", [pl("chayen", 1)]);
    const tv = await Q("tableDoor", QR.A12 ?? "");
    if (!refused(tr, "QR_CLOSED")) p.push(`QR_TABLE ปิดใช้ → ${codeOf(tr)} (คาด QR_CLOSED)`);
    if (tv?.ok !== true || tv.view?.open !== false) p.push(`tableDoor ปิด ${short({ ok: tv?.ok, open: tv?.view?.open }, 40)}`);
    await call(chMod, "saveChannel", ctxU("A"), A("OWNER"), { id: qt, name: "QR โต๊ะ", active: true });
    const d = diffCounts(c0, await counts());
    if (d.length) p.push(`ประตูปิดแล้วเขียน: ${d.join(", ")}`);
    const back = await preorder([pl("padthai", 1)]);
    if (!back.row) p.push(`เปิดคืนแล้ว ${PREFAIL(back)}`);
    chk("PO5", !fx && !NQ() && p.length === 0, "ปิด 4 แบบ + QR_TABLE ปิด = QR_CLOSED · เมนูยังเห็น · ไม่เขียน · เปิดคืนสั่งได้", why(p, NQ()));
  });

  // ════════ PY จ่ายก่อน ════════
  const KD: { pending: number; prepaid: number; accepted: number; acceptedSrc: string } = { pending: -1, prepaid: -1, accepted: -1, acceptedSrc: "" };
  let O1: Pre | null = null;
  await step("PY1", async () => {
    const p: string[] = [];
    const c0 = await counts();
    const n0 = await newCount();
    const mv0 = Number(await P.invMovement.count({ where: { tenantId: T } }).catch(() => -1));
    const t0 = Date.now();
    O1 = await preorder([pl("padthai", 1), pl("water", 1)]);
    const o = O1.row;
    const it = O1.intent;
    if (!o) p.push(PREFAIL(O1));
    else {
      if (O1.r?.duplicated !== false) p.push(`duplicated ${short(O1.r?.duplicated, 10)} (คาด false)`);
      if (o.channelId !== CH.QR_ORDER_A || o.channelCode !== "QR_ORDER" || o.adapter !== "QR") p.push(`ช่องทาง ${short([o.channelCode, o.adapter], 40)} (คาด QR_ORDER/QR)`);
      if (o.status !== "NEW" || o.paymentState !== "PENDING_PAYMENT" || o.fulfilment !== "PICKUP") p.push(`สถานะ ${short([o.status, o.paymentState, o.fulfilment], 60)}`);
      if (!/^[0-9A-HJKMNP-TV-Z]{12}$/.test(String(o.publicToken ?? ""))) p.push(`publicToken ${short(o.publicToken, 20)}`);
      if (o.totalSatang !== 9000) p.push(`ยอด ${o.totalSatang} (คาด 9000)`);
      if (o.customerPhone !== PHONE || o.customerName !== CUST.name) p.push(`ลูกค้า ${short([o.customerName, o.customerPhone], 50)}`);
      if (o.createdByUserId !== null || o.saleId !== null || o.paidAt !== null) p.push(`createdBy/saleId/paidAt ${short([o.createdByUserId, o.saleId, o.paidAt], 60)}`);
      const pb = o.payBy ? new Date(o.payBy).getTime() : NaN;
      const rec = new Date(o.receivedAt).getTime();
      if (!(Math.abs(pb - rec - 20 * MIN) <= 2000)) p.push(`payBy − receivedAt = ${Math.round((pb - rec) / 1000)} วิ (คาด 1200 = qrExpiryMinutes 20)`);
      if (!(rec >= t0 - 5000 && rec <= Date.now() + 5000)) p.push("receivedAt ไม่ใช่ตอนนี้");
      const its = await intentsOf(o.id);
      if (its.length !== 1) p.push(`intent ${its.length} ใบ (คาด 1)`);
      if (!it) p.push("ไม่มี intent ของออเดอร์");
      else {
        if (it.kind !== "PROMPTPAY_STATIC" || it.status !== "PENDING" || it.amountSatang !== 9000) p.push(`intent ${short([it.kind, it.status, it.amountSatang], 60)}`);
        if (Math.abs(new Date(it.expiresAt).getTime() - pb) > 1000) p.push(`expiresAt ≠ payBy (${short([it.expiresAt, o.payBy], 80)})`);
        if (it.deviceId !== null || it.createdByUserId !== null) p.push(`deviceId/createdByUserId ${short([it.deviceId, it.createdByUserId], 50)} (คาด null · CD5)`);
        if (it.idempotencyKey !== `posorder-pay-${o.id}`) p.push(`คีย์ intent ${short(it.idempotencyKey, 50)}`);
        if (o.paymentIntentId !== it.id) p.push("PosOrder.paymentIntentId ≠ intent");
        if (!it.qrPayload) p.push("intent ไม่มี qrPayload");
      }
      if ((await salesOf(o.id)).length) p.push("มีบิลตอน PENDING_PAYMENT");
      KD.pending = (await roundsOfOrder(o.id)).length;
      if (KD.pending) p.push(`รอบครัว ${KD.pending} ตอน PENDING_PAYMENT`);
      const st = await Q("orderStatus", O1.tok, {});
      const pay = st?.view?.pay;
      if (st?.ok !== true || st.view?.status !== "NEW" || st.view?.paymentState !== "PENDING_PAYMENT") p.push(`orderStatus ${codeOf(st)} ${short([st?.view?.status, st?.view?.paymentState], 50)}`);
      else if (!pay || pay.qrPayload !== it?.qrPayload || pay.amountSatang !== it?.amountSatang || new Date(pay.expiresAt).getTime() !== new Date(it?.expiresAt ?? 0).getTime() || pay.kind !== "PROMPTPAY_STATIC") p.push(`QR ในหน้าสถานะ ≠ ใบเดียวกัน (${short(pay, 100)})`);
      const rec1 = (await obx("pos.order.received")).filter((e) => e.payload?.orderId === o.id);
      if (rec1.length !== 1 || rec1[0]?.payload?.paymentState !== "PENDING_PAYMENT") p.push(`pos.order.received ${rec1.length} (paymentState ${short(rec1[0]?.payload?.paymentState, 20)})`);
    }
    const n1 = await newCount();
    if (n0 < 0 || n1 !== n0) p.push(`counts.byColumn.new ${n0}→${n1} (คาดไม่เปลี่ยน)`);
    const d = diffCounts(c0, await counts(), { order: 1, intent: 1, event: 1 });
    if (d.length) p.push(`แถว: ${d.join(", ")}`);
    const mv1 = Number(await P.invMovement.count({ where: { tenantId: T } }).catch(() => -1));
    if (mv1 !== mv0) p.push(`InvMovement ${mv0}→${mv1}`);
    chk("PY1", !fx && !NQ() && p.length === 0, "PENDING_PAYMENT + intent เดียวกับ QR · payBy = +20 นาที · 0 บิล/ครัว/สต็อก", why(p, NQ()));
  });

  await step("PY2", async () => {
    const p: string[] = [];
    const o = O1?.row;
    if (!o) p.push(`ไม่มีออเดอร์ PY1 (${codeOf(O1?.r)})`);
    else {
      const c0 = await counts();
      for (let i = 0; i < 2; i++) {
        const r = await preorder([pl("padthai", 1), pl("water", 1)], { key: O1!.key });
        if (r.r?.ok !== true || r.r.duplicated !== true || r.tok !== O1!.tok || r.intent?.id !== O1!.intent?.id) p.push(`เล่นซ้ำ ${i + 1} → ${codeOf(r.r)} dup ${short(r.r?.duplicated, 6)} ${r.tok === O1!.tok ? "" : "โทเคนอื่น"}`);
      }
      const d = diffCounts(c0, await counts());
      if (d.length) p.push(`เล่นซ้ำเขียน: ${d.join(", ")}`);
    }
    const c1 = await counts();
    const key = newKey("par");
    const rs = await Promise.all(Array.from({ length: 10 }, () => preorder([pl("padthai", 1)], { key })));
    const toks = new Set(rs.filter((x) => x.r?.ok === true).map((x) => x.tok));
    const okN = rs.filter((x) => x.r?.ok === true).length;
    if (okN < 1 || toks.size !== 1) p.push(`10 พร้อมกัน → ok ${okN} · โทเคน ${toks.size} (คาด 1) · ${[...new Set(rs.map((x) => codeOf(x.r)))].join(",")}`);
    const bad = rs.filter((x) => x.r?.ok !== true && !refused(x.r, "RATE_LIMITED"));
    if (bad.length) p.push(`ปฏิเสธที่ไม่ใช่ RATE_LIMITED ${bad.length}: ${codeOf(bad[0]!.r)}`);
    const d = diffCounts(c1, await counts(), { order: 1, intent: 1, event: 1 });
    if (d.length) p.push(`10 พร้อมกัน: ${d.join(", ")}`);
    // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.7 fix 2) hunter H5: 10 พร้อมกันคีย์เดียวกันบน Beam = charge เดียว
    await setPay({ beam: { enabled: true } });
    const bk = newKey("parb");
    const b0 = beamCalls.length;
    const c2 = await counts();
    const rb = await Promise.all(Array.from({ length: 10 }, () => preorder([pl("padthai", 1)], { key: bk, deps: { beam: fakeBeam("ok") } })));
    await setPay({ beam: { enabled: false } });
    const tb = new Set(rb.filter((x) => x.r?.ok === true).map((x) => x.tok));
    if (tb.size !== 1) p.push(`Beam 10 พร้อมกัน → โทเคน ${tb.size} · ${[...new Set(rb.map((x) => codeOf(x.r)))].join(",")}`);
    if (beamCalls.length - b0 !== 1) p.push(`Beam createCharge ${beamCalls.length - b0} ครั้ง (คาด 1)`);
    const d2 = diffCounts(c2, await counts(), { order: 1, intent: 1, event: 1 });
    if (d2.length) p.push(`Beam 10 พร้อมกัน: ${d2.join(", ")}`);
    chk("PY2", !fx && !NQ() && p.length === 0, "คีย์เดิม = ใบเดิม · 10 พร้อมกัน = 1 ออเดอร์ 1 intent", why(p, NQ()));
  });

  await step("PY3", async () => {
    const p: string[] = [];
    const o = O1?.row ? await orderRow(O1.row.id) : null;
    if (!o) p.push("ไม่มีออเดอร์ PY1");
    else {
      const c0 = await counts();
      const a = await O("acceptOrder", ctxU("A", DEV1), A("OWNER"), { id: o.id });
      if (!refused(a, "ORDER_UNPAID")) p.push(`accept PENDING_PAYMENT → ${codeOf(a)} (คาด ORDER_UNPAID)`);
      const pay = await O("payOrder", ctxU("A", DEV1), A("OWNER"), { id: o.id, idempotencyKey: newKey("pay"), payMethods: [{ type: "CASH", amountSatang: o.totalSatang }], cashReceivedSatang: o.totalSatang });
      if (!refused(pay, "ORDER_STATE_INVALID")) p.push(`payOrder → ${codeOf(pay)} (คาด ORDER_STATE_INVALID)`);
      const o2 = await orderRow(o.id);
      if (o2?.version !== o.version || o2?.status !== "NEW" || o2?.paymentState !== "PENDING_PAYMENT") p.push(`ออเดอร์เปลี่ยน ${short([o2?.status, o2?.paymentState, o2?.version], 50)}`);
      const d = diffCounts(c0, await counts());
      if (d.length) p.push(`เขียน: ${d.join(", ")}`);
    }
    chk("PY3", !fx && !NQ() && p.length === 0, "รับออเดอร์ที่ยังไม่จ่าย = ORDER_UNPAID · payOrder = ORDER_STATE_INVALID · ไม่เขียน", why(p, NQ()));
  });

  const beamOk = { beam: fakeBeam("ok") };
  let O4: Pre | null = null;
  await step("PY4", async () => {
    const p: string[] = [];
    await setPay({ beam: { enabled: true } });
    const b0 = beamCalls.length;
    O4 = await preorder([pl("padthai", 1)], { deps: beamOk });
    await setPay({ beam: { enabled: false } });
    const o = O4.row;
    const it = O4.intent;
    if (!o || !it) p.push(PREFAIL(O4) || "ไม่มี intent");
    else {
      if (it.kind !== "PROMPTPAY_BEAM" || !it.beamChargeId) p.push(`intent ${short([it.kind, it.beamChargeId], 60)} (คาด PROMPTPAY_BEAM)`);
      const calls = beamCalls.slice(b0);
      if (calls.length !== 1 || calls[0]?.amountSatang !== 8000 || calls[0]?.referenceId !== `pos-${it.id}` || calls[0]?.method !== "promptpay") p.push(`createCharge ${calls.length} ครั้ง ${short(calls[0], 100)}`);
      const n0 = await newCount();
      const v0 = o.version;
      const w = await hook(it);
      if (w?.ok !== true) p.push(`webhook → ${codeOf(w)}`);
      await drain();
      const o2 = await orderRow(o.id);
      if (o2?.status !== "NEW" || o2?.paymentState !== "PREPAID" || !o2?.paidAt) p.push(`หลังจ่าย ${short([o2?.status, o2?.paymentState, !!o2?.paidAt], 50)} (คาด NEW/PREPAID + paidAt)`);
      if (o2?.version !== v0 + 1) p.push(`version ${v0}→${o2?.version} (คาด +1)`);
      if ((await evsOf(o.id, "paid")).length !== 1) p.push(`event paid ${(await evsOf(o.id, "paid")).length}`);
      const n1 = await newCount();
      if (n1 !== n0 + 1) p.push(`counts.new ${n0}→${n1} (คาด +1 · PREPAID นับในใหม่)`);
      // เล่นซ้ำ
      await hook(it);
      const rp = await replay("pos.payment.intent_paid", (e) => e.payload?.intentId === it.id);
      if (rp) p.push(rp);
      await drain();
      const o3 = await orderRow(o.id);
      if (o3?.version !== o2?.version || (await evsOf(o.id, "paid")).length !== 1) p.push(`เล่นซ้ำแล้วเปลี่ยน v${o2?.version}→${o3?.version} paid ${(await evsOf(o.id, "paid")).length}`);
      if ((await obx("pos.payment.intent_paid")).filter((e) => e.payload?.intentId === it.id).length !== 1) p.push("outbox intent_paid ไม่ใช่ 1");
      if ((await salesOf(o.id)).length) p.push("มีบิลทั้งที่ autoAccept ปิด");
      KD.prepaid = (await roundsOfOrder(o.id)).length;
      if (KD.prepaid) p.push(`รอบครัว ${KD.prepaid} ตอน PREPAID`);
    }
    chk("PY4", !fx && !NQ() && p.length === 0, "Beam จ่าย → PREPAID ครั้งเดียว · ซ้ำไม่เปลี่ยน · ยังไม่มีบิล", why(p, NQ()));
  });

  await step("PY5", async () => {
    const p: string[] = [];
    const qo = CH.QR_ORDER_A ?? "none";
    const st = await O("setChannelOrderSettings", ctxU("A"), A("OWNER"), { channelId: qo, autoAccept: true });
    if (st?.ok !== true) p.push(`(fixture) autoAccept → ${codeOf(st)}`);
    await setPay({ beam: { enabled: true } });
    const x = await preorder([pl("padthai", 1), pl("water", 1)], { deps: beamOk });
    await setPay({ beam: { enabled: false } });
    const waterOut0 = Number((await P.invMovement.aggregate({ where: { tenantId: T, itemId: INV.water ?? "none" }, _sum: { qtyDelta: true } }).catch(() => null))?._sum?.qtyDelta ?? 0);
    if (!x.row || !x.intent) p.push(PREFAIL(x) || "ไม่มี intent");
    else {
      await hook(x.intent);
      await drain();
      const o = await orderRow(x.row.id);
      const sales = await salesOf(x.row.id);
      const s = sales[0];
      if (o?.status !== "ACCEPTED" || o?.paymentState !== "PAID" || o?.acceptedByUserId !== null || !o?.saleId) p.push(`ออเดอร์ ${short([o?.status, o?.paymentState, o?.acceptedByUserId, !!o?.saleId], 70)} (คาด ACCEPTED/PAID/null/บิล)`);
      if (sales.length !== 1) p.push(`บิล ${sales.length} (คาด 1)`);
      if (s) {
        if (s.idempotencyKey !== `posorder-${x.row.id}` || s.channelId !== qo || s.channelRef !== x.row.code || s.shiftId !== null || s.grandTotalSatang !== 9000) p.push(`บิล ${short({ key: s.idempotencyKey, ch: s.channelId === qo, ref: s.channelRef, shift: s.shiftId, grand: s.grandTotalSatang }, 140)}`);
        const pm = s.payments ?? [];
        if (pm.length !== 1 || pm[0].type !== "PROMPTPAY" || pm[0].amountSatang !== 9000 || pm[0].reference !== x.intent.id) p.push(`ชำระ ${short(pm.map((m: Any) => [m.type, m.amountSatang, m.reference === x.intent.id]), 100)}`);
        if (o?.saleId !== s.id) p.push("PosOrder.saleId ≠ บิล");
      }
      const it2 = await intentRow(x.intent.id);
      if (it2?.status !== "CONSUMED" || it2?.saleId !== s?.id) p.push(`intent ${short([it2?.status, it2?.saleId === s?.id], 40)} (คาด CONSUMED + saleId)`);
      const rs = await roundsOfOrder(x.row.id);
      KD.accepted = rs.length;
      if (rs.length !== 1) p.push(`รอบครัว ${rs.length} (คาด 1)`);
      const b = await call(kdsMod, "kdsBoard", ctxU("A"), A("OWNER"), { stationId: ST.hot });
      const tk = Array.isArray(b?.tickets) ? (b.tickets as Any[]).find((t) => t.orderId === rs[0]?.id) : null;
      KD.acceptedSrc = String(tk?.source ?? codeOf(b));
      const waterOut1 = Number((await P.invMovement.aggregate({ where: { tenantId: T, itemId: INV.water ?? "none" }, _sum: { qtyDelta: true } }).catch(() => null))?._sum?.qtyDelta ?? 0);
      await drain();
      const waterOut2 = Number((await P.invMovement.aggregate({ where: { tenantId: T, itemId: INV.water ?? "none" }, _sum: { qtyDelta: true } }).catch(() => null))?._sum?.qtyDelta ?? 0);
      if (waterOut1 - waterOut0 !== -1 || waterOut2 !== waterOut1) p.push(`น้ำ Σqty ${waterOut0}→${waterOut1}→${waterOut2} (คาด −1 ครั้งเดียว)`);
      // GL: บิลหน้าขาย PROMPTPAY pi_ ยอดเดียวกัน (ช่องทาง QR_ORDER) = รูปเดียวกัน
      const si = await staffIntent(9000);
      if (si?.id) await manual(si.id, "OWNER");
      const ctl = si?.id ? await sellWithIntent([rl("padthai", 1), rl("water", 1)], si.id, qo) : { saleId: "", r: null };
      await drain();
      if (!ctl.saleId) p.push(`(ตัวควบคุม) บิลหน้าขาย PROMPTPAY → ${codeOf(ctl.r)} ${short(ctl.r?.message ?? "", 60)}`);
      else {
        const a = await journalShape(s?.id ?? "");
        const c = await journalShape(ctl.saleId);
        if (a === "—" || a !== c) p.push(`GL ออเดอร์ ${a} ≠ หน้าขาย ${c}`);
      }
    }
    await O("setChannelOrderSettings", ctxU("A"), A("OWNER"), { channelId: qo, autoAccept: false });
    chk("PY5", !fx && !NQ() && p.length === 0, "autoAccept: จ่าย → ACCEPTED + บิล PROMPTPAY pi_ + CONSUMED + ครัว 1 + สต็อกครั้งเดียว + GL เท่าหน้าขาย", why(p, NQ()));
  });

  const prepaidStatic = async (lines: Any[]): Promise<Pre & { ok: string }> => {
    const x = await preorder(lines);
    if (!x.row || !x.intent) return { ...x, ok: PREFAIL(x) || "ไม่มี intent" };
    const m = await manual(x.intent.id, "MGR");
    await drain();
    const o = await orderRow(x.row.id);
    return { ...x, row: o ?? x.row, ok: m?.ok === true && o?.paymentState === "PREPAID" ? "" : `ทำ PREPAID ไม่ได้ (manual ${codeOf(m)} · ${o?.paymentState}) · ` };
  };
  await step("PY6", async () => {
    const p: string[] = [];
    const x = await prepaidStatic([pl("padthai", 1)]);
    if (x.ok) p.push(x.ok);
    else {
      const a = await O("acceptOrder", ctxU("A", DEV1), A("STAFF"), { id: x.row.id });
      if (a?.ok !== true) p.push(`STAFF accept → ${codeOf(a)} ${short(a?.message ?? "", 60)}`);
      const sales = await salesOf(x.row.id);
      const s = sales[0];
      if (sales.length !== 1 || s?.shiftId !== SHIFT1 || s?.soldByUserId !== uid("STAFF")) p.push(`บิล ${sales.length} · shift ${s?.shiftId === SHIFT1 ? "DEV1" : short(s?.shiftId, 20)} · soldBy ${s?.soldByUserId === uid("STAFF") ? "STAFF" : short(s?.soldByUserId, 20)}`);
      const it = await intentRow(x.intent.id);
      if (it?.status !== "CONSUMED" || it?.saleId !== s?.id) p.push(`intent ${it?.status}`);
      const o = await orderRow(x.row.id);
      if (o?.status !== "ACCEPTED" || o?.paymentState !== "PAID" || o?.acceptedByUserId !== uid("STAFF")) p.push(`ออเดอร์ ${short([o?.status, o?.paymentState], 40)}`);
      const again = await O("acceptOrder", ctxU("A", DEV1), A("STAFF"), { id: x.row.id });
      if (!refused(again, "ORDER_STATE_INVALID")) p.push(`รับซ้ำ → ${codeOf(again)}`);
      if ((await salesOf(x.row.id)).length !== 1) p.push("รับซ้ำแล้วบิล ≠ 1");
    }
    chk("PY6", !fx && !NQ() && p.length === 0, "รับ PREPAID ที่เครื่อง = บิลในกะเครื่อง · intent CONSUMED · ซ้ำไม่มีบิลที่สอง", why(p, NQ()));
  });

  await step("PY7", async () => {
    const p: string[] = [];
    const x = await preorder([pl("padthai", 1)]);
    if (!x.row || !x.intent) p.push(PREFAIL(x) || "ไม่มี intent");
    else {
      const c = await Q("claimPaid", x.tok, { ip: freshIp() });
      if (c?.ok !== true) p.push(`claimPaid → ${codeOf(c)}`);
      const o = await orderRow(x.row.id);
      if ((await evsOf(x.row.id, "customer_paid_claim")).length !== 1 || !o?.customerClaimAt) p.push(`claim event ${(await evsOf(x.row.id, "customer_paid_claim")).length} · customerClaimAt ${!!o?.customerClaimAt}`);
      if (o?.paymentState !== "PENDING_PAYMENT" || (await intentRow(x.intent.id))?.status !== "PENDING") p.push(`claim มีผลเงิน (${o?.paymentState})`);
      await setPay({ manualConfirmRequiresManager: true });
      const s = await manual(x.intent.id, "STAFF");
      if (!refused(s, "PERMISSION_DENIED")) p.push(`STAFF ยืนยันเอง → ${codeOf(s)} (คาด PERMISSION_DENIED)`);
      await drain();
      if ((await orderRow(x.row.id))?.paymentState !== "PENDING_PAYMENT") p.push("STAFF ถูกปฏิเสธแต่ออเดอร์เปลี่ยน");
      const m = await manual(x.intent.id, "MGR");
      await setPay({ manualConfirmRequiresManager: false });
      if (m?.ok !== true) p.push(`MANAGER → ${codeOf(m)}`);
      await drain();
      const o2 = await orderRow(x.row.id);
      if (o2?.paymentState !== "PREPAID" || (await evsOf(x.row.id, "paid")).length !== 1) p.push(`หลัง MANAGER ${o2?.paymentState} paid ${(await evsOf(x.row.id, "paid")).length}`);
    }
    chk("PY7", !fx && !NQ() && p.length === 0, "claim = event ไม่มีเงิน · STAFF ถูกกัน · MANAGER → PREPAID ทางเดียวกัน", why(p, NQ()));
  });

  const pastDue = async (x: Pre) => {
    const past = new Date(Date.now() - MIN);
    if (PO && x.row) await PO.update({ where: { id: x.row.id }, data: { payBy: past } }).catch((e: Error) => console.log(`  ⚠️  ย้อน payBy: ${e.message.slice(0, 80)}`));
    if (PI && x.intent) await PI.update({ where: { id: x.intent.id }, data: { expiresAt: past } }).catch((e: Error) => console.log(`  ⚠️  ย้อน expiresAt: ${e.message.slice(0, 80)}`));
  };
  await step("PY8", async () => {
    const p: string[] = [];
    const x = await preorder([pl("padthai", 1)]);
    if (!x.row || !x.intent) p.push(PREFAIL(x) || "ไม่มี intent");
    else {
      await pastDue(x);
      const s1 = await Q("orderStatus", x.tok, {});
      const o = await orderRow(x.row.id);
      const ex1 = await evsOf(x.row.id, "expired");
      if (s1?.ok !== true || o?.status !== "CANCELLED") p.push(`อ่านหลังหมดเวลา → ${codeOf(s1)} · ${o?.status} (คาด CANCELLED)`);
      if (ex1.length !== 1 || !(JSON.stringify(ex1[0]?.payload ?? null).includes("PAYMENT_EXPIRED") || o?.rejectReason === "PAYMENT_EXPIRED")) p.push(`event expired ${ex1.length} · reason ${short(ex1[0]?.payload ?? o?.rejectReason, 60)}`);
      if ((await intentRow(x.intent.id))?.status !== "EXPIRED") p.push(`intent ${(await intentRow(x.intent.id))?.status} (คาด EXPIRED)`);
      const v1 = o?.version;
      await Q("orderStatus", x.tok, {});
      if ((await orderRow(x.row.id))?.version !== v1 || (await evsOf(x.row.id, "expired")).length !== 1) p.push("อ่านซ้ำแล้วเขียนเพิ่ม");
      const c = await Q("claimPaid", x.tok, { ip: freshIp() });
      if (!refused(c, "PREORDER_EXPIRED")) p.push(`claimPaid หมดเวลา → ${codeOf(c)} (คาด PREORDER_EXPIRED)`);
    }
    const y = await preorder([pl("padthai", 1)]);
    if (!y.row || !y.intent) p.push(`ออเดอร์ที่สอง ${PREFAIL(y)}`);
    else {
      await pastDue(y);
      const e1 = await O("expirePreorders", T);
      const e2 = await O("expirePreorders", T);
      if (Number(e1?.expired) !== 1 || Number(e2?.expired) !== 0) p.push(`expirePreorders ×2 → ${short(e1?.expired ?? codeOf(e1), 10)} / ${short(e2?.expired ?? codeOf(e2), 10)} (คาด 1 / 0)`);
      const o = await orderRow(y.row.id);
      if (o?.status !== "CANCELLED" || (await evsOf(y.row.id, "expired")).length !== 1 || (await intentRow(y.intent.id))?.status !== "EXPIRED") p.push(`กวาด → ${o?.status} · expired ${(await evsOf(y.row.id, "expired")).length} · intent ${(await intentRow(y.intent.id))?.status}`);
      const m = await manual(y.intent.id, "MGR");
      if (!refused(m, "INTENT_EXPIRED")) p.push(`ยืนยันเองหลังหมดเวลา → ${codeOf(m)} (คาด INTENT_EXPIRED)`);
    }
    chk("PY8", !fx && !NQ() && p.length === 0, "หมดเวลา: อ่าน/กวาด → CANCELLED + EXPIRED ครั้งเดียว · claim = PREORDER_EXPIRED", why(p, NQ()));
  });

  await step("PY9", async () => {
    const p: string[] = [];
    await setPay({ beam: { enabled: true } });
    const x = await preorder([pl("padthai", 1), pl("water", 1)], { deps: beamOk });
    await setPay({ beam: { enabled: false } });
    if (!x.row || !x.intent) p.push(PREFAIL(x) || "ไม่มี intent");
    else {
      await pastDue(x);
      await O("expirePreorders", T);
      const o0 = await orderRow(x.row.id);
      if (o0?.status !== "CANCELLED") p.push(`(fixture) หมดเวลาไม่ CANCELLED (${o0?.status})`);
      const ops0 = (await opsHits("pos.order.late_payment")).length;
      const w = await hook(x.intent);
      if (w?.ok !== true) p.push(`webhook → ${codeOf(w)}`);
      await drain();
      const o1 = await orderRow(x.row.id);
      if (o1?.status !== "CANCELLED" || o1?.version !== o0?.version || o1?.saleId) p.push(`ฟื้น? ${short([o1?.status, o0?.version, o1?.version, o1?.saleId], 60)}`);
      const it = await intentRow(x.intent.id);
      if (it?.status !== "PAID" || it?.lateWebhook !== true || it?.saleId) p.push(`intent ${short([it?.status, it?.lateWebhook, it?.saleId], 50)} (คาด PAID late ไม่ถูกใช้)`);
      const ops1 = (await opsHits("pos.order.late_payment")).length;
      const rp = await replay("pos.payment.intent_paid", (e) => e.payload?.intentId === x.intent.id);
      if (rp) p.push(rp);
      const ops2 = (await opsHits("pos.order.late_payment")).length;
      const lvl = (await opsHits("pos.order.late_payment"))[0]?.level;
      if (ops1 - ops0 !== 1 || ops2 !== ops1 || lvl !== "ERROR") p.push(`ops late_payment ${ops0}→${ops1}→${ops2} level ${short(lvl, 10)} (คาด +1 ERROR · เล่นซ้ำคงเดิม)`);
      if ((await salesOf(x.row.id)).length) p.push("มีบิลของออเดอร์ที่ยกเลิก");
      const sold = await sellWithIntent([rl("padthai", 1), rl("water", 1)], x.intent.id, CH.QR_ORDER_A);
      if (!sold.saleId) p.push(`หน้าขายใช้ pi_ → ${codeOf(sold.r)} ${short(sold.r?.message ?? "", 60)}`);
      else if ((await intentRow(x.intent.id))?.status !== "CONSUMED") p.push("หน้าขายใช้แล้ว intent ไม่ CONSUMED");
    }
    chk("PY9", !fx && !NQ() && p.length === 0, "เงินเข้าหลังหมดเวลา: ไม่ฟื้น · ops ERROR 1 · หน้าขายใช้ pi_ ได้", why(p, NQ()));
  });

  await step("PY10", async () => {
    const p: string[] = [];
    const x = await prepaidStatic([pl("padthai", 1)]);
    if (x.ok) p.push(`(ปฏิเสธ) ${x.ok}`);
    else {
      const r = await O("rejectOrder", ctxU("A", DEV1), A("OWNER"), { id: x.row.id, reasonCode: "TOO_BUSY" });
      if (r?.ok !== true) p.push(`reject PREPAID → ${codeOf(r)}`);
      await drain();
      const o = await orderRow(x.row.id);
      if (o?.status !== "REJECTED" || o?.saleId) p.push(`ออเดอร์ ${short([o?.status, o?.saleId], 40)}`);
      const it = await intentRow(x.intent.id);
      if (it?.status !== "PAID" || it?.saleId) p.push(`intent ${it?.status} (คาด PAID ไม่ถูกใช้)`);
      const ops = await opsHits("pos.payment.refund_needed", x.intent.id);
      if (ops.length !== 1 || ops[0]?.level !== "ERROR") p.push(`ops refund_needed ของ intent นี้ ${ops.length} ${short(ops[0]?.level, 8)}`);
      if ((await salesOf(x.row.id)).length) p.push("มีบิลของออเดอร์ที่ปฏิเสธ");
    }
    const y = await prepaidStatic([pl("salt", 2)]);
    if (y.ok) p.push(`(BLOCK) ${y.ok}`);
    else {
      const v0 = y.row.version;
      const e0 = (await evsOf(y.row.id)).length;
      const a = await O("acceptOrder", ctxU("A", DEV1), A("OWNER"), { id: y.row.id });
      if (!refused(a, "STOCK_INSUFFICIENT")) p.push(`accept BLOCK → ${codeOf(a)} (คาด STOCK_INSUFFICIENT)`);
      const o = await orderRow(y.row.id);
      if (o?.status !== "NEW" || o?.paymentState !== "PREPAID" || o?.version !== v0 || (await evsOf(y.row.id)).length !== e0 || (await salesOf(y.row.id)).length) p.push(`หลังปฏิเสธ ${short([o?.status, o?.paymentState, v0, o?.version], 60)} · event ${e0}→${(await evsOf(y.row.id)).length}`);
      if ((await intentRow(y.intent.id))?.status !== "PAID") p.push("intent ถูกแตะ");
      const pay = await O("payOrder", ctxU("A", DEV1), A("OWNER"), { id: y.row.id, idempotencyKey: newKey("pay"), payMethods: [{ type: "CASH", amountSatang: y.row.totalSatang }], cashReceivedSatang: y.row.totalSatang });
      if (!refused(pay, "ORDER_STATE_INVALID")) p.push(`payOrder ออเดอร์ QR → ${codeOf(pay)} (คาด ORDER_STATE_INVALID)`);
    }
    chk("PY10", !fx && !NQ() && p.length === 0, "ปฏิเสธ PREPAID = refund_needed · BLOCK = ไม่เขียน · payOrder ปฏิเสธ", why(p, NQ()));
  });

  await step("PY11", async () => {
    const p: string[] = [];
    // จอลูกค้า DEV1 (P2.10)
    const en = await call(dispMod, "enableCustomerDisplay", ctxU("A"), A("OWNER"), { deviceCode: DEV1 });
    const pr = en?.ok === true ? await call(dispMod, "pairCustomerDisplay", { code: String(en.pairCode ?? "") }, { ip: freshIp() }) : en;
    const tok = pr?.ok === true ? String(pr.token ?? "") : "";
    if (!tok) p.push(`(fixture) จอลูกค้า ${codeOf(en)}/${codeOf(pr)}`);
    let seq = 0;
    const PAYST = (amt: number, intentId: string): Any => ({
      phase: "paying",
      lines: [{ qty: 1, name: "QC", grossSatang: amt, discountSatang: 0 }],
      totals: { subtotalSatang: amt, lineDiscountSatang: 0, billDiscountSatang: 0, serviceChargeSatang: 0, grandTotalSatang: amt },
      pay: { method: "PROMPTPAY", dueSatang: amt, roundSatang: amt, paidSatang: 0, remainingSatang: amt, intentId },
    });
    const qrOf = async (intentId: string, amt: number): Promise<Any> => {
      const pb = await call(dispMod, "publishDisplayState", ctxU("A", DEV1), A("OWNER"), { deviceCode: DEV1, seq: ++seq, state: PAYST(amt, intentId) });
      if (pb?.ok !== true) return { err: `publish ${codeOf(pb)} ${short(pb?.message ?? "", 40)}` };
      const r = await call(dispMod, "readCustomerDisplay", { token: tok });
      return r?.ok === true ? (r.view?.pay?.qr ?? null) : { err: `read ${codeOf(r)}` };
    };
    const xr = async () => {
      const r = await call(shiftMod, "xReport", ctxU("A", DEV1), A("OWNER"), { shiftId: SHIFT1 });
      return r?.ok === true ? minusTime(r.report) : `ERR:${codeOf(r)}`;
    };
    const x0 = await xr();
    const x = await preorder([pl("padthai", 1)]);
    if (!x.row || !x.intent) p.push(PREFAIL(x) || "ไม่มี intent");
    else {
      await manual(x.intent.id, "MGR");
      await drain();
    }
    const x1 = await xr();
    if (x0.startsWith("ERR") || x1 !== x0) p.push(`xReport กะ DEV1 เปลี่ยน/อ่านไม่ได้ (${short(x0, 40)} → ${short(x1, 40)})`);
    if (x.intent && tok) {
      const ctl = await staffIntent(4321);
      const qc = ctl?.id ? await qrOf(ctl.id, 4321) : { err: "ไม่มีใบควบคุม" };
      if (qc?.err || qc?.intentId !== ctl?.id) p.push(`(ตัวควบคุม) ใบของ DEV1 ไม่โผล่บนจอ ${short(qc, 80)}`);
      const qo = await qrOf(x.intent.id, x.intent.amountSatang);
      if (qo?.err) p.push(String(qo.err));
      else if ((qo?.intentId ?? null) !== null) p.push(`ใบของออเดอร์โผล่บนจอ DEV1 (${short(qo, 80)})`); // ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.7 fix 1) CD-B1: จอไม่อ้างใบใด (intentId null) — QR นิ่งของร้านยอดเดียวกันเป็นไบต์เดียวกับ QR นิ่งของใบโดยธรรมชาติ ⇒ ไม่เทียบ payload
    }
    chk("PY11", !fx && !NQ() && p.length === 0, "ใบของออเดอร์ไม่อยู่บนจอ/กะของเครื่องใด", why(p, NQ()));
  });

  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.7 fix 2) R1 F2 — ใบของออเดอร์ที่ยังเปิดอยู่ใช้จ่ายบิลอื่นไม่ได้
  await step("PY12", async () => {
    const p: string[] = [];
    const sales = async () => Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1));
    await call(paySetMod, "updatePosPaymentSettings", { tenantId: T, systemId: S.POS }, A("OWNER"), { deposit: { enabled: true } });
    const dep = (intentId: string, amt: number) =>
      call(depMod, "registerTakeDeposit", ctxU("A", DEV1), A("OWNER"), { amountSatang: amt, payMethods: [{ type: "PROMPTPAY", amountSatang: amt, reference: intentId }], customerName: "คุณมัดจำคิวซี", phone: "0899999999", idempotencyKey: newKey("dep") });
    // PENDING_PAYMENT
    const y = await preorder([pl("padthai", 1)]);
    if (!y.row || !y.intent) p.push(`(PENDING) ${PREFAIL(y) || "ไม่มี intent"}`);
    else {
      const s0 = await sales();
      const a = await sellWithIntent([rl("padthai", 1)], y.intent.id, CH.QR_ORDER_A);
      if (a.saleId || !/^INTENT_/.test(String(a.r?.code ?? ""))) p.push(`PENDING: หน้าขาย → ${codeOf(a.r)} (คาด INTENT_*)`);
      if ((await sales()) !== s0) p.push("PENDING: มีบิลเพิ่ม");
    }
    // PREPAID
    const x = await prepaidStatic([pl("padthai", 1)]);
    if (x.ok) p.push(x.ok);
    else {
      const s0 = await sales();
      const a = await sellWithIntent([rl("padthai", 1)], x.intent.id, CH.QR_ORDER_A);
      if (a.saleId || !/^INTENT_/.test(String(a.r?.code ?? ""))) p.push(`PREPAID: หน้าขาย → ${codeOf(a.r)} ${a.saleId ? "มีบิล" : ""} (คาด INTENT_* · 0 บิล)`);
      const dp = await dep(x.intent.id, x.intent.amountSatang);
      if (dp?.ok === true || !/^INTENT_/.test(String(dp?.code ?? ""))) p.push(`PREPAID: มัดจำ → ${codeOf(dp)} ${short(dp?.message ?? "", 50)} (คาด INTENT_*)`);
      if ((await sales()) !== s0) p.push(`มีบิลเพิ่ม ${s0}→${await sales()}`);
      if ((await intentRow(x.intent.id))?.status !== "PAID") p.push(`intent ${(await intentRow(x.intent.id))?.status} (คาด PAID)`);
      if ((await orderRow(x.row.id))?.paymentState !== "PREPAID") p.push(`ออเดอร์ ${(await orderRow(x.row.id))?.paymentState} (คาด PREPAID)`);
      const rj = await O("rejectOrder", ctxU("A", DEV1), A("OWNER"), { id: x.row.id, reasonCode: "TOO_BUSY" });
      if (rj?.ok !== true) p.push(`(fixture) ปฏิเสธ → ${codeOf(rj)}`);
      const b = await sellWithIntent([rl("padthai", 1)], x.intent.id, CH.QR_ORDER_A);
      if (!b.saleId) p.push(`หลังปิดออเดอร์ หน้าขายใช้ pi_ → ${codeOf(b.r)} ${short(b.r?.message ?? "", 60)}`);
      else if ((await intentRow(x.intent.id))?.status !== "CONSUMED") p.push("ใช้แล้ว intent ไม่ CONSUMED");
    }
    await call(paySetMod, "updatePosPaymentSettings", { tenantId: T, systemId: S.POS }, A("OWNER"), { deposit: { enabled: false } });
    chk("PY12", !fx && !NQ() && p.length === 0, "ใบของออเดอร์ที่เปิดอยู่ = หน้าขาย/มัดจำปฏิเสธ · ปิดแล้ว = ใช้ได้", why(p, NQ()));
  });

  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.7 fix 2) hunter H3 — ช่องทาง QR_ORDER ปิดหลังลูกค้าจ่าย: รับได้ · คำสั่งใหม่ปิด
  await step("PY13", async () => {
    const p: string[] = [];
    const qo = CH.QR_ORDER_A ?? "none";
    const x = await prepaidStatic([pl("padthai", 1)]);
    if (x.ok) p.push(x.ok);
    else {
      const off = await call(chMod, "saveChannel", ctxU("A"), A("OWNER"), { id: qo, name: "สั่งออนไลน์ (QR)", active: false });
      if (off?.ok === false) p.push(`(fixture) ปิดช่องทาง → ${codeOf(off)}`);
      const c0 = await counts();
      const n = await preorder([pl("padthai", 1)]);
      if (!refused(n.r, "QR_CLOSED")) p.push(`สั่งใหม่ตอนปิด → ${codeOf(n.r)} (คาด QR_CLOSED)`);
      // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.7 fix 3) R2 G1: ข้อยกเว้นช่องทางปิดใช้ได้เฉพาะการรับ PREPAID — หน้าขายเลือก QR_ORDER ที่ปิดอยู่ไม่ได้
      const sl0 = Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1));
      const rq = await call(register, "quoteRegisterCart", ctxU("A", DEV1), A("OWNER"), { lines: [rl("water", 1)], channelId: qo });
      if (!refused(rq, "CHANNEL_INVALID")) p.push(`quote หน้าขายช่องทาง QR_ORDER ที่ปิด → ${codeOf(rq)} (คาด CHANNEL_INVALID)`);
      const rsub = await call(register, "submitRegisterSale", ctxU("A", DEV1), A("OWNER"), { lines: [rl("water", 1)], channelId: qo, idempotencyKey: newKey("rsq"), expectedGrandTotalSatang: 1000, payMethods: [{ type: "CASH", amountSatang: 1000 }], cashReceivedSatang: 1000 });
      if (!refused(rsub, "CHANNEL_INVALID")) p.push(`ขายหน้าขายช่องทาง QR_ORDER ที่ปิด → ${codeOf(rsub)} (คาด CHANNEL_INVALID)`);
      if (Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1)) !== sl0) p.push("หน้าขายช่องทางปิดแล้วมีบิล");
      const d = diffCounts(c0, await counts());
      if (d.length) p.push(`ปิดแล้วเขียน: ${d.join(", ")}`);
      const a = await O("acceptOrder", ctxU("A", DEV1), A("OWNER"), { id: x.row.id });
      if (a?.ok !== true) p.push(`accept PREPAID ตอนช่องทางปิด → ${codeOf(a)} ${short(a?.message ?? "", 60)}`);
      const s = (await salesOf(x.row.id))[0];
      if (!s || s.channelId !== qo) p.push(`บิล ${s ? `ช่องทาง ${s.channelId === qo ? "QR_ORDER" : s.channelId}` : "ไม่มี"}`);
      if ((await intentRow(x.intent.id))?.status !== "CONSUMED") p.push(`intent ${(await intentRow(x.intent.id))?.status}`);
      await call(chMod, "saveChannel", ctxU("A"), A("OWNER"), { id: qo, name: "สั่งออนไลน์ (QR)", active: true });
    }
    chk("PY13", !fx && !NQ() && p.length === 0, "ช่องทางปิด = กันคำสั่งใหม่ · PREPAID ยังรับได้", why(p, NQ()));
  });

  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.7 fix 2) hunter H4 — เงินเข้าหลังหมดเวลา โดยไม่มีการอ่าน/กวาดก่อน
  await step("PY9b", async () => {
    const p: string[] = [];
    await setPay({ beam: { enabled: true } });
    const x = await preorder([pl("padthai", 1)], { deps: { beam: fakeBeam("ok") } });
    await setPay({ beam: { enabled: false } });
    if (!x.row || !x.intent) p.push(PREFAIL(x) || "ไม่มี intent");
    else {
      await pastDue(x);
      const ops0 = (await opsHits("pos.order.late_payment", x.intent.id)).length;
      const w = await hook(x.intent);
      if (w?.ok !== true) p.push(`webhook → ${codeOf(w)}`);
      await drain();
      const o = await orderRow(x.row.id);
      if (o?.status !== "CANCELLED" || o?.paymentState === "PREPAID") p.push(`ออเดอร์ ${short([o?.status, o?.paymentState], 40)} (คาด CANCELLED ไม่ใช่ PREPAID)`);
      if ((await evsOf(x.row.id, "expired")).length !== 1) p.push(`event expired ${(await evsOf(x.row.id, "expired")).length}`);
      const ops1 = (await opsHits("pos.order.late_payment", x.intent.id)).length;
      if (ops1 - ops0 !== 1) p.push(`ops late_payment ${ops0}→${ops1} (คาด +1)`);
      const it = await intentRow(x.intent.id);
      if (it?.status !== "PAID" || it?.lateWebhook !== true || it?.saleId) p.push(`intent ${short([it?.status, it?.lateWebhook, it?.saleId], 50)}`);
      if ((await salesOf(x.row.id)).length) p.push("มีบิล");
    }
    chk("PY9b", !fx && !NQ() && p.length === 0, "เงินเข้าหลังหมดเวลา (ไม่มีการอ่านก่อน) = CANCELLED + late_payment", why(p, NQ()));
  });

  // ════════ PO6 ขีดจำกัด + ข้อมูลส่วนตัว (ใช้ออเดอร์ของ PY1) ════════
  await step("PO6", async () => {
    const p: string[] = [];
    // อัตรา: IP เดียว 11 ครั้ง (ลิงก์สาขา B)
    const ip = freshIp();
    const rs: Any[] = [];
    for (let i = 0; i < 11; i++) rs.push((await preorder([pl("padthaiB", 1)], { token: LINK.B ?? "", ip })).r);
    const okN = rs.filter((r) => r?.ok === true).length;
    if (okN !== 10 || !refused(rs[10], "RATE_LIMITED")) p.push(`11 ครั้ง/IP → ok ${okN} · ครั้งที่ 11 ${codeOf(rs[10])} (คาด 10 ok + RATE_LIMITED)`);
    else if (refusalShapeBad(rs[10]) || msgKeyBad(rs[10]) || rs[10].messageKey !== "qr.errors.rateLimited") p.push(`RATE_LIMITED รูป ${refusalShapeBad(rs[10]) || msgKeyBad(rs[10]) || rs[10].messageKey}`);
    const ordersB = PO ? Number(await PO.count({ where: { tenantId: T, unitId: U.B } }).catch(() => -1)) : -1;
    if (ordersB !== okN) p.push(`ออเดอร์สาขา B ${ordersB} (คาด ${okN})`);
    // ตรวจข้อมูล
    const c0 = await counts();
    const long = "ก".repeat(101);
    const cases: [string, Any[], Any][] = [
      ["ไม่มีเบอร์", [pl("padthai", 1)], { name: "คุณซี" }],
      ["เบอร์ผิดรูป", [pl("padthai", 1)], { name: "คุณซี", phone: "12345" }],
      ["ชื่อ 101 ตัว", [pl("padthai", 1)], { name: long, phone: "0812345678" }],
      ["31 บรรทัด", Array.from({ length: 31 }, () => pl("water", 1)), CUST],
      ["qty 51", [pl("water", 51)], CUST],
      ["โน้ต 201", [pl("water", 1, undefined, "x".repeat(201))], CUST],
    ];
    for (const [lbl, lines, cust] of cases) {
      const r = (await preorder(lines, { customer: cust })).r;
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)} (คาด VALIDATION)`);
      else if (refusalShapeBad(r) || msgKeyBad(r)) p.push(`${lbl}: ${refusalShapeBad(r) || msgKeyBad(r)}`);
    }
    const d = diffCounts(c0, await counts());
    if (d.length) p.push(`ตรวจไม่ผ่านแล้วเขียน: ${d.join(", ")}`);
    // ผลอ่านสาธารณะไม่มีข้อมูลส่วนตัว/ชื่อพนักงาน
    const openA2 = await openTable("A2");
    const reads: [string, Any][] = [
      ["orderStatus", O1?.tok ? await Q("orderStatus", O1.tok, {}) : null],
      ["linkDoor", await Q("linkDoor", LINK.A ?? "")],
      ["tableDoor A2 (พนักงานเปิด)", await Q("tableDoor", QR.A2 ?? "")],
      ["tableBill A2", await Q("tableBill", QR.A2 ?? "")],
    ];
    const staffNames = Object.keys(US).map((k) => `${k} คิวซี${RAND}`);
    for (const [lbl, r] of reads) {
      if (r?.ok !== true) {
        p.push(`${lbl} → ${codeOf(r)}`);
        continue;
      }
      const j = JSON.stringify(r);
      if (j.includes(PHONE) || j.includes("081-234-5678")) p.push(`${lbl} มีเบอร์เต็ม`);
      for (const n of staffNames) if (j.includes(n)) p.push(`${lbl} มีชื่อพนักงาน`);
      for (const k of Object.keys(US)) if (j.includes(uid(k))) p.push(`${lbl} มี userId พนักงาน`);
    }
    if (!openA2) p.push("(fixture) เปิดโต๊ะ A2 ไม่ได้");
    if (O1?.row && O1.row.customerPhone !== PHONE) p.push(`เบอร์ที่เก็บ ${short(O1.row.customerPhone, 20)} (คาด ${PHONE})`);
    chk("PO6", !fx && !NQ() && p.length === 0, "ครั้งที่ 11/IP = RATE_LIMITED · ตรวจข้อมูล = VALIDATION ไม่เขียน · รูปคำปฏิเสธ · ไม่มีข้อมูลส่วนตัว", why(p, NQ()));
  });

  // ════════ TB QR โต๊ะ ════════
  await step("TB1", async () => {
    const p: string[] = [];
    const sA2 = await openTable("A2");
    const ses0 = Number(await P.tableSession.count({ where: { tenantId: T } }).catch(() => -1));
    const x0 = sA2 ? await xmin("TableSession", sA2) : "-";
    const ob0 = Number(await P.outboxEvent.count({ where: { tenantId: T } }).catch(() => -1));
    const au0 = Number(await P.auditLog.count({ where: { tenantId: T } }).catch(() => -1));
    const bk0 = await bucketCount();
    const v = await Q("tableDoor", QR.A1 ?? "");
    let ver = String(v?.view?.ver ?? "");
    const v2 = await Q("tableDoor", QR.A2 ?? "");
    if (v?.ok !== true || v.view?.session !== null) p.push(`tableDoor A1 → ${codeOf(v)} session ${short(v?.view?.session, 40)} (คาด null)`);
    if (v2?.ok !== true || v2.view?.session?.id !== sA2) p.push(`tableDoor A2 → ${codeOf(v2)} session ${v2?.view?.session?.id === sA2 ? "ตรง" : short(v2?.view?.session?.id, 30)}`);
    let unchanged = 0;
    for (let i = 0; i < 10; i++) {
      const tok = i % 2 ? QR.A2 : QR.A1;
      const r = await Q("tablePoll", tok ?? "", i % 2 ? {} : { sinceVer: ver });
      if (r?.ok !== true) {
        p.push(`โพล ${i + 1} → ${codeOf(r)}`);
        break;
      }
      if (!(i % 2)) {
        if (r.changed === false) unchanged++;
        ver = String(r.ver ?? ver);
      }
    }
    if (unchanged !== 5) p.push(`โพลด้วย sinceVer เดิม changed:false ${unchanged}/5`);
    const ses1 = Number(await P.tableSession.count({ where: { tenantId: T } }).catch(() => -1));
    if (ses1 !== ses0 || (await sessionsOf(TB.A1 ?? "")).length) p.push(`TableSession ${ses0}→${ses1} (คาดไม่เปลี่ยน · A1 ${(await sessionsOf(TB.A1 ?? "")).length})`);
    if (sA2 && (await xmin("TableSession", sA2)) !== x0) p.push("session A2 ถูกเขียน (xmin เปลี่ยน)");
    const ob1 = Number(await P.outboxEvent.count({ where: { tenantId: T } }).catch(() => -1));
    const au1 = Number(await P.auditLog.count({ where: { tenantId: T } }).catch(() => -1));
    const bk1 = await bucketCount();
    if (ob1 !== ob0 || au1 !== au0 || bk1 !== bk0) p.push(`outbox ${ob0}→${ob1} · audit ${au0}→${au1} · ถังอัตรา ${bk0}→${bk1}`);
    // ตัวควบคุมบวก: ประตูเดิมสร้าง session ผีบนโต๊ะว่าง
    const g = await storefront.resolveTableSession(T, U.A, QR.A15 ?? "");
    if (g?.ok !== true || (await sessionsOf(TB.A15 ?? "")).length !== 1) p.push(`(ตัวควบคุม) resolveTableSession เดิมไม่สร้าง session (${short(g, 60)})`);
    chk("TB1", !fx && !NQ() && p.length === 0, "เปิดหน้า + โพล 10 ครั้ง = 0 เขียน · ประตูเดิมสร้าง session (ตัวควบคุม)", why(p, NQ()));
  });

  let S3 = "";
  await step("TB2", async () => {
    const p: string[] = [];
    const sale0 = Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1));
    const r = await round(QR.A3 ?? "", [pl("padthai", 1)]);
    if (r?.ok !== true) p.push(`รอบแรก → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      S3 = String(r.sessionId ?? "");
      const ss = await sessionsOf(TB.A3 ?? "");
      if (ss.length !== 1 || ss[0].id !== S3 || ss[0].openedByUserId !== null || ss[0].status !== "OPEN") p.push(`session ${short(ss.map((x) => [x.id === S3, x.openedByUserId, x.status]), 80)} (คาด 1 OPEN แขกเปิด)`);
      const rs = await roundsOfSession(S3);
      const ro = rs.find((x) => x.id === r.roundId);
      if (rs.length !== 1 || !ro || ro.placedByUserId !== null || ro.type !== "DINE_IN") p.push(`รอบ ${short(rs.map((x) => [x.id === r.roundId, x.placedByUserId, x.type]), 80)}`);
      const it = ro?.items?.[0];
      if (!it || it.productId !== PP.padthai || it.unitPrice !== 7500 || it.lineTotal !== 7500 || it.qty !== 1 || it.stationId !== ST.hot) p.push(`รายการ ${short(it ? [it.productId === PP.padthai, it.unitPrice, it.lineTotal, it.stationId === ST.hot] : null, 80)} (คาด ผัดไทย 7500 ครัวร้อน)`);
    }
    if (Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1)) !== sale0) p.push("มีบิลจากรอบ QR");
    chk("TB2", !fx && !NQ() && p.length === 0, "รอบแรก = session แขก + รอบ productId ราคา QR_TABLE", why(p, NQ()));
  });

  await step("TB3", async () => {
    const p: string[] = [];
    if (!S3) p.push("ไม่มี session จาก TB2");
    const r = await round(QR.A3 ?? "", [pl("rice", 1)], { expectedSessionId: S3 || null });
    if (r?.ok !== true || r.sessionId !== S3) p.push(`รอบสอง → ${codeOf(r)} session ${r?.sessionId === S3 ? "เดิม" : short(r?.sessionId, 30)}`);
    if ((await roundsOfSession(S3)).length !== 2) p.push(`รอบใน session ${(await roundsOfSession(S3)).length} (คาด 2)`);
    if ((await sessionsOf(TB.A3 ?? "")).length !== 1) p.push(`session ของ A3 ${(await sessionsOf(TB.A3 ?? "")).length}`);
    chk("TB3", !fx && !NQ() && p.length === 0, "รอบที่สอง = session เดิม", why(p, NQ()));
  });

  await step("TB4", async () => {
    const p: string[] = [];
    // ลำดับ: เปิด → ปิด → ส่งด้วย session ที่โหลดไว้
    const s = await openTable("A4");
    if (!s) p.push("(fixture) เปิดโต๊ะ A4 ไม่ได้");
    else {
      const cl = await call(posTable, "registerCloseTable", ctxU("A", DEV1), A("OWNER"), { tableSessionId: s });
      if (cl?.ok !== true) p.push(`(fixture) ปิดโต๊ะ → ${codeOf(cl)}`);
      const r = await round(QR.A4 ?? "", [pl("chayen", 1)], { expectedSessionId: s });
      if (!refused(r, "SESSION_CHANGED")) p.push(`ส่งหลังปิด → ${codeOf(r)} (คาด SESSION_CHANGED)`);
      else if (refusalShapeBad(r) || msgKeyBad(r)) p.push(refusalShapeBad(r) || msgKeyBad(r));
      if ((await roundsOfSession(s)).length) p.push("มีรอบใน session ที่ปิด");
      if ((await sessionsOf(TB.A4 ?? "")).length !== 1) p.push(`เปิด session ใหม่ (${(await sessionsOf(TB.A4 ?? "")).length})`);
    }
    // แข่ง ×3
    for (const name of ["A4b", "A4c", "A4d"]) {
      const sid = await openTable(name);
      if (!sid) {
        p.push(`(fixture) เปิด ${name} ไม่ได้`);
        continue;
      }
      const [rr, cl] = await Promise.all([round(QR[name] ?? "", [pl("chayen", 1)], { expectedSessionId: sid }), call(posTable, "registerCloseTable", ctxU("A", DEV1), A("OWNER"), { tableSessionId: sid })]);
      const sess = (await sessionsOf(TB[name] ?? "")).find((x) => x.id === sid);
      const rounds = await roundsOfSession(sid);
      if (sess?.status !== "OPEN" && rounds.length) p.push(`${name}: รอบ ${rounds.length} ใน session ${sess?.status} (คาด 0)`);
      if (rr?.ok === true && (sess?.status !== "OPEN" || !refused(cl, "TABLE_HAS_UNPAID"))) p.push(`${name}: ส่งผ่านแต่ปิด ${codeOf(cl)} session ${sess?.status}`);
      if (rr?.ok !== true && !refused(rr, "SESSION_CHANGED")) p.push(`${name}: ส่ง → ${codeOf(rr)} (คาด ok หรือ SESSION_CHANGED)`);
      if ((await sessionsOf(TB[name] ?? "")).length !== 1) p.push(`${name}: session ${(await sessionsOf(TB[name] ?? "")).length}`);
    }
    chk("TB4", !fx && !NQ() && p.length === 0, "ปิดแล้วส่ง = SESSION_CHANGED ไม่เขียน · แข่งกันไม่มีรอบใน session ที่ปิด", why(p, NQ()));
  });

  await step("TB5", async () => {
    const p: string[] = [];
    const s5 = await openTable("A5");
    const s6 = await openTable("A6");
    if (!s5 || !s6) p.push("(fixture) เปิด A5/A6 ไม่ได้");
    else {
      const m = await call(posTable, "registerMergeTables", ctxU("A", DEV1), A("OWNER"), { intoSessionId: s5, fromSessionIds: [s6] });
      if (m?.ok !== true) p.push(`(fixture) รวมโต๊ะ → ${codeOf(m)} ${short(m?.message ?? "", 50)}`);
      const r = await round(QR.A6 ?? "", [pl("chayen", 1)]);
      if (r?.ok !== true || r.sessionId !== s5) p.push(`รอบจาก A6 → ${codeOf(r)} session ${r?.sessionId === s5 ? "A5" : r?.sessionId === s6 ? "A6 (MERGED)" : short(r?.sessionId, 30)}`);
      if ((await roundsOfSession(s5)).length !== 1 || (await roundsOfSession(s6)).length) p.push(`รอบ A5 ${(await roundsOfSession(s5)).length} · A6 ${(await roundsOfSession(s6)).length}`);
      if ((await sessionsOf(TB.A6 ?? "")).some((x) => x.status === "OPEN")) p.push("A6 มี session OPEN ใหม่");
    }
    chk("TB5", !fx && !NQ() && p.length === 0, "โต๊ะที่ถูกรวม = รอบลงโต๊ะปลายทาง", why(p, NQ()));
  });

  await step("TB6", async () => {
    const p: string[] = [];
    if (!S3) p.push("ไม่มี session จาก TB2/TB3");
    const q = await call(register, "quoteRegisterCart", ctxU("A", DEV1), A("OWNER"), { lines: [], tableSessionId: S3 || "none" });
    const want = 7500 + 1805 + halfUp((7500 + 1805) * 1000, 10_000);
    if (q?.ok !== true || q.grandTotalSatang !== want || q.channel?.code !== "QR_TABLE") p.push(`(ตัวควบคุม) บิลโต๊ะหน้าขาย ${codeOf(q)} ${short([q?.grandTotalSatang, q?.channel?.code], 40)} (คาด ${want} QR_TABLE)`);
    const legacy = S3 ? await rorder.billPreview(T, U.A, S3) : null;
    if (legacy && legacy.totalSatang === want) p.push(`(ตัวควบคุม) billPreview เดิมเท่ายอด POS (${legacy.totalSatang}) — ข้อบกพร่องไม่ปรากฏ`);
    const b = await Q("tableBill", QR.A3 ?? "");
    const bill = b?.ok === true ? b.bill : null;
    if (!bill) p.push(`tableBill → ${codeOf(b)}`);
    else {
      if (bill.totalSatang !== q?.grandTotalSatang || bill.totalSatang !== want) p.push(`บิลแขก ${bill.totalSatang} ≠ หน้าขาย ${q?.grandTotalSatang} (คาด ${want})`);
      if (bill.serviceChargeSatang !== q?.serviceChargeSatang) p.push(`ค่าบริการ ${bill.serviceChargeSatang} ≠ ${q?.serviceChargeSatang}`);
      const pp = typeof ppMod?.promptpayPayload === "function" ? String(ppMod.promptpayPayload({ id: PPID, amountSatang: want })) : "?";
      if (bill.promptpayPayload !== pp || bill.payHidden !== false) p.push(`PromptPay ${short(bill.promptpayPayload, 30)} payHidden ${short(bill.payHidden, 6)} (คาด payload ของ ${want})`);
    }
    const rq0 = Number(await P.restaurantServiceRequest.count({ where: { tenantId: T, sessionId: S3 || "none", type: "PAY_PROMPTPAY" } }).catch(() => -1));
    const n = await Q("tableNotifyPaid", QR.A3 ?? "", { ip: freshIp() });
    const rq1 = Number(await P.restaurantServiceRequest.count({ where: { tenantId: T, sessionId: S3 || "none", type: "PAY_PROMPTPAY" } }).catch(() => -1));
    if (n?.ok !== true || rq1 !== rq0 + 1) p.push(`แจ้งชำระ → ${codeOf(n)} คำขอ ${rq0}→${rq1}`);
    // แผนแยกบิลเปิดอยู่ → ซ่อนการจ่าย
    const sp = q?.ok === true ? await call(splitMod, "registerSplitTable", ctxU("A", DEV1), A("OWNER"), { tableSessionId: S3, mode: "EQUAL", partCount: 2, expectedItemsHash: q.table?.itemsHash }) : null;
    if (sp?.ok !== true) p.push(`(fixture) แยกบิล → ${codeOf(sp)} ${short(sp?.message ?? "", 50)}`);
    else {
      const b2 = await Q("tableBill", QR.A3 ?? "");
      if (b2?.ok !== true || b2.bill?.payHidden !== true || b2.bill?.promptpayPayload) p.push(`แยกบิลเปิด → ${codeOf(b2)} payHidden ${short(b2?.bill?.payHidden, 6)} payload ${b2?.bill?.promptpayPayload ? "มี" : "ไม่มี"}`);
    }
    chk("TB6", !fx && !NQ() && p.length === 0, "บิลแขก = บิลโต๊ะหน้าขาย (ปัดครึ่งขึ้น) ≠ ประตูเดิม · PromptPay ยอดนั้น · แจ้งชำระ · แยกบิล = ซ่อน", why(p, NQ()));
  });

  await step("TB7", async () => {
    const p: string[] = [];
    const evs = async () => (await obx("pos.product.availability")).filter((e) => isRecord(e.payload) && e.payload.productId === PP.croissant);
    const e0 = (await evs()).length;
    const r = await round(QR.A10 ?? "", [pl("croissant", 1)]);
    if (r?.ok !== true) p.push(`รอบ → ${codeOf(r)}`);
    await drain();
    const mi = await P.menuItem.findUnique({ where: { id: MI.croissant ?? "none" } }).catch(() => null);
    if (mi?.stockQty !== 0 || mi?.isOutOfStock !== true) p.push(`ตัวนับ ${short([mi?.stockQty, mi?.isOutOfStock], 30)} (คาด 0/true)`);
    const e1 = await evs();
    const fresh = e1.slice(e0);
    if (fresh.length !== 1 || fresh[0]?.payload?.available !== false || fresh[0]?.payload?.source !== "STOCK") p.push(`event ${fresh.length} ${short(fresh[0]?.payload, 100)} (คาด 1 · available false · STOCK)`);
    const rp = await replay("pos.product.availability", (e) => isRecord(e.payload) && e.payload.productId === PP.croissant);
    if (rp) p.push(rp);
    await drain();
    if ((await evs()).length !== e1.length) p.push("เล่นซ้ำแล้ว event เพิ่ม");
    const r2 = await round(QR.A10 ?? "", [pl("croissant", 1)], { expectedSessionId: r?.sessionId ?? null });
    if (!refused(r2, "PRODUCT_UNAVAILABLE")) p.push(`รอบถัดไป → ${codeOf(r2)} (คาด PRODUCT_UNAVAILABLE)`);
    chk("TB7", !fx && !NQ() && p.length === 0, "ตัวนับหมดจากรอบ QR = availability STOCK 1 แถว · ซ้ำไม่เพิ่ม", why(p, NQ()));
  });

  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.7 fix 2) R1 F1 — single-flight ของรอบแขก
  await step("TB8", async () => {
    const p: string[] = [];
    const g = `qc27${RAND}guest01`;
    const r0 = (await roundsOfTable("A1")).length;
    const input = { lines: [pl("chayen", 1)], guestToken: g };
    const rs = await Promise.all([0, 1, 2].map(() => Q("placeTableRound", QR.A1 ?? "", input, { ip: freshIp() })));
    const ids = new Set(rs.map((r) => (r?.ok === true ? String(r.roundId) : `ERR:${codeOf(r)}`)));
    if (ids.size !== 1 || rs.some((r) => r?.ok !== true)) p.push(`3 คำขอพร้อมกัน → ${[...ids].join(",")} (คาด ok ทั้งหมด roundId เดียว)`);
    const r1 = (await roundsOfTable("A1")).length;
    if (r1 - r0 !== 1) p.push(`รอบใหม่ ${r1 - r0} (คาด 1)`);
    if ((await sessionsOf(TB.A1 ?? "")).length !== 1) p.push(`session ของ A1 ${(await sessionsOf(TB.A1 ?? "")).length} (คาด 1)`);
    chk("TB8", !fx && !NQ() && p.length === 0, "ส่งซ้ำพร้อมกัน guestToken เดียวกัน = รอบเดียว", why(p, NQ()));
  });

  // ════════ KD ครัว ════════
  await step("KD1", async () => {
    const p: string[] = [];
    const rs = S3 ? await roundsOfSession(S3) : [];
    const b = await call(kdsMod, "kdsBoard", ctxU("A"), A("OWNER"), { stationId: ST.hot });
    const tickets: Any[] = Array.isArray(b?.tickets) ? b.tickets : [];
    if (b?.ok === false) p.push(`kdsBoard → ${codeOf(b)}`);
    if (!rs.length) p.push("ไม่มีรอบ QR ของ A3");
    for (const r of rs) {
      const t = tickets.find((x) => x.orderId === r.id);
      if (!t || t.source !== "QR") p.push(`รอบ #${r.dailyNo} ${t ? `source ${t.source}` : "ไม่อยู่บนบอร์ด"} (คาด QR)`);
    }
    chk("KD1", !fx && !NQ() && p.length === 0, "รอบ QR อยู่บนบอร์ดทันที · source QR", why(p, NQ()));
  });
  await step("KD2", async () => {
    const p: string[] = [];
    if (KD.pending !== 0) p.push(`รอบตอน PENDING_PAYMENT ${KD.pending} (คาด 0)`);
    if (KD.prepaid !== 0) p.push(`รอบตอน PREPAID ${KD.prepaid} (คาด 0)`);
    if (KD.accepted !== 1 || KD.acceptedSrc !== "ONLINE") p.push(`หลังรับ ${KD.accepted} รอบ source ${KD.acceptedSrc} (คาด 1 ONLINE)`);
    chk("KD2", !fx && !NQ() && p.length === 0, "สั่งล่วงหน้าเข้าครัวเมื่อรับเท่านั้น", why(p, NQ()));
  });

  // ════════ OR1 REST (P2.13) ════════
  await step("OR1", async () => {
    if (!HAS_P213) {
      skipChk("OR1", "P2.13 ยังไม่อยู่บน tip (ไม่มี src/app/api/v1/pos/[...path]/route.ts + pos/api/ops/orders.ts) — มติ 14");
      return;
    }
    const p: string[] = [];
    let raw = "";
    try {
      const scopes = typeof scopesMod?.expandBundles === "function" ? scopesMod.expandBundles(["pos-admin"]) : [];
      const k = await akSvc.createApiKey({ tenantId: T }, `QC P2.7 OR1 ${RAND}`, { scopes, systemId: S.POS });
      raw = String(k?.rawKey ?? "");
    } catch (e) {
      p.push(`(fixture) createApiKey: ${(e as Error).message.slice(0, 80)}`);
    }
    const x = await preorder([pl("padthai", 1)]);
    if (!x.row) p.push(PREFAIL(x));
    const api = async (method: string, path: string, body?: Any): Promise<{ status: number; text: string; body: Any }> => {
      const fn = apiRoute?.[method];
      if (typeof fn !== "function") return { status: 0, text: "route ยังไม่มี", body: null };
      const headers: Record<string, string> = { authorization: `Bearer ${raw}`, ...(method !== "GET" ? { "idempotency-key": newKey("or1") } : {}), ...(body ? { "content-type": "application/json" } : {}) };
      try {
        const res: Response = await fn(new Request(`http://x/api/v1/pos${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
        const text = await res.text();
        let j: Any = null;
        try {
          j = JSON.parse(text);
        } catch {
          j = null;
        }
        return { status: res.status, text, body: j };
      } catch (e) {
        return { status: -1, text: (e as Error).message.slice(0, 100), body: null };
      }
    };
    if (raw && x.row) {
      const a = await api("POST", `/orders/${x.row.id}/accept`, { unitId: U.A });
      if (a.status !== 409 || a.body?.error?.code !== "state_conflict") p.push(`REST accept PENDING_PAYMENT → ${a.status} ${short(a.body?.error?.code ?? a.text, 40)} (คาด 409 state_conflict)`);
      const f = await O("acceptOrder", ctxU("A", DEV1), A("OWNER"), { id: x.row.id });
      if (!refused(f, "ORDER_UNPAID")) p.push(`facade → ${codeOf(f)} (คาด ORDER_UNPAID)`);
      const l = await api("GET", `/orders?unitId=${U.A}`);
      if (l.status !== 200 || !l.text.includes(x.row.id)) p.push(`REST list → ${l.status} ${l.text.includes(x.row.id) ? "" : "ไม่มีออเดอร์"}`);
      const g = await api("GET", `/orders/${x.row.id}?unitId=${U.A}`);
      if (g.status !== 200 || !/PENDING_PAYMENT/.test(g.text)) p.push(`REST get → ${g.status} ${/PENDING_PAYMENT/.test(g.text) ? "" : "ไม่มี PENDING_PAYMENT"}`);
      if ((await orderRow(x.row.id))?.version !== x.row.version) p.push("REST accept เขียนออเดอร์");
    }
    chk("OR1", !fx && !NQ() && p.length === 0, "REST accept = 409 ORDER_UNPAID · list/get แสดงสถานะใหม่", why(p, NQ()));
  });
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งสาม + ผู้ใช้ชั่วคราว + ถังอัตราของรอบนี้ ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; usersLeft: number; bucketsLeft: number; err: string };
async function wipeTenants(): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, bucketsLeft: 0, err: "" };
  const targets = ([[T, T_SLUG, "T"], [T2, T2_SLUG, "T2"], [T3, T3_SLUG, "T3"]] as [string, string, string][]).filter(([id]) => !!id);
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
    const toks = [...SEEN_TOKENS].filter(Boolean);
    const where = `key LIKE $1 OR EXISTS (SELECT 1 FROM unnest($2::text[]) t WHERE position(t IN key) > 0)`;
    await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE ${where}`, `%${RAND}%`, toks);
    rep.bucketsLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE ${where}`, `%${RAND}%`, toks)) as Any[])[0]?.n ?? 0);
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
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"} + ${T2 || "-"} + ${T3 || "-"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft} · ผู้ใช้ ${wipe.usersLeft} · ถังอัตรา ${wipe.bucketsLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
  } catch (e) {
    wipe.err = `cleanup: ${(e as Error).message.slice(0, 200)}`;
    console.log(`💥 ${wipe.err}`);
  } finally {
    removeFetchGuard();
  }
}
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
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
  if (PO) await n("posOrder", () => PO.count({ where: { idempotencyKey: { contains: KEY_PREFIX } } }));
  await n("invItem", () => P.invItem.count({ where: { sku: { startsWith: KEY_PREFIX } } }));
  await n("menuItem", () => P.menuItem.count({ where: { name: { contains: RAND } } }));
  await n("posProduct", () => P.posProduct.count({ where: { name: { contains: RAND }, createdAt: { gte: since } } }));
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
const skippedChecks = [...results.entries()].filter(([, r]) => r.skipped).map(([id, r]) => `${id}: ${r.actual}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}${skippedChecks.length ? ` · ข้าม ${skippedChecks.length}` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, skippedChecks, forced: FORCE, crashed: crashed || null, missing: skipReasons, guardHits: guardHits.length, residue: tempLeft.length + wipe.tenantLeft + wipe.usersLeft + wipe.bucketsLeft, leaks, fpDrift })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P2.7 S: หน้าตาหน้าสาธารณะ/จอ 09/แผงโต๊ะ/พิมพ์ QR ทุกโต๊ะ/ช่องทาง QR ในตั้งค่า (P2.7U · visual-pos p2.7) · 307/308 จริงของหน้าเดิม (CONTROLLER-RUN) ·
//   ส่งถึงบ้าน/นัดเวลารับ (P2.14) · LINE/Grab (P3.1–3.3) · สมาชิก/แต้มบนหน้าสาธารณะ · คืนเงินผ่าน Beam · ลิงก์จ่ายในแชท (P3.7) · ถอดประตูเดิม (P2.14)
//   ชุด regression (มติ 14): qc-restaurant · qc-restaurant-pay · -money · -void · qc-pos-p2.4 (L1 L3) p2.5 p2.6 p2.8 p2.13 p1.7 p1.6 p2.1 (ORACLE-EDIT) p2.2 p1.18 ·
//   qc-hf-tx · qc-pos-p1.1 (S2.42) p1.3 · qc-shop* · ชุดเงิน · fitness ±env · typecheck — ผู้สร้างรันก่อน/หลัง (ผลต้องเท่าเดิม)
