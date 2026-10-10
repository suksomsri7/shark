// QC — POS RUN ใบ P2.8: จอออเดอร์ทุกช่องทาง (PosOrder/PosOrderLine/PosOrderEvent · ประตูรับออเดอร์เดียว + X1 idempotency ·
//   adapter MANUAL/WEB/CHAT · วงจร NEW→ACCEPTED→PREPARING→READY→HANDED / REJECTED / CANCELLED แบบมีเวอร์ชัน ·
//   บิล PLATFORM ตอนรับ · บิล DIRECT ตอน payOrder · ค่าตั้งรับออเดอร์ของช่องทาง · เว็บร้านอ่านราคาช่องทาง WEB แบบอ่านสองทาง · event pos.order.*)
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ · ไม่ต้องมี seed (ร้านชั่วคราว + ผู้ใช้ชั่วคราวของตัวเอง)
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.8.md §2 R1–R11 · §3 migration · §4 แผนข้อสอบ · §5 CD1–CD9 · §9 มติผู้คุมงาน 1–15 (ผูกมัด:
//        PosOrder เป็นของ POS · PLATFORM = บิลตอนรับ / DIRECT = บิลตอนจ่าย · จุดเรียก createSale ของตัวเอง orderCreateSale ใน pos/order.ts ·
//        อ่านสองทาง + แถว (WEB, null) + บรรทัดยืนยันของเว็บร้านไม่มี itemId · CHAT คีย์โดยพนักงาน + พลิก fact · ไม่มีรอบ QR · ไม่มีคีย์ nav ·
//        บรรทัดกำหนดเองต้องมี pos.sale.priceOverride · กติกากะ · unique X1 · ลิงก์ void/cancel · migration ตรงตัว · ลำดับสร้าง)
//        ต่อยอด: qc-pos-p2.1 (ร้านชั่วคราว · ช่องทาง · GL PLATFORM) · qc-pos-p2.2 (แถวราคาช่องทาง · resolvePrices) · qc-pos-p2.4 (โครงข้อสอบ fail-before) ·
//        qc-pos-p1.6 (ทะเบียนผู้เรียก createSale) · qc-pos-p1.18 (facts/แถวบทบาท) · qc-shop + qc-shop-refund (ตัวเลขเงิน/สต็อกของเว็บร้าน — ห้ามแก้) · qc-pos-p1.8 (ระบายคิวซ้ำ)
//        โน้ต: ledger/wo-notes/pos-P2.8-oracle.md (ตารางชื่อ = สัญญาของผู้สร้าง S · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P2.8 (S) ต้องส่ง (ย่อ — ละเอียดในโน้ต):
//   migration `20261207100000_pos_p28_orders`: enum PosOrderStatus/PosOrderPaymentState/PosOrderFulfilment · ตาราง PosOrder/PosOrderLine/PosOrderEvent
//     (ไม่มี FK) · unique (tenantId, channelId, externalRef) · unique (tenantId, idempotencyKey) · index (tenantId, unitId, status, receivedAt)
//   pos/order.ts (ผู้เขียนเดียว): ingestOrder · ingestInTx · sourceCancelledInTx · acceptOrder · rejectOrder · markPreparing · markReady · handOver ·
//     cancelOrder · payOrder · setPrepMinutes · setChannelOrderSettings · listOrders · getOrder · orderCreateSale (createSale จุดเดียว)
//   pos/order-shared.ts (บริสุทธิ์) · pos/order-adapters.ts · pos/order-actions.ts ("use server") · pos/index.ts `orders` · catalog.ts backfillWebPrices
//   shop/service.ts (รอยต่อ POS P2.8) · outbox-consumers.ts (6 event + shop.order.paid + pos.sale.voided) · รหัสปฏิเสธใหม่:
//     ORDER_NOT_FOUND ORDER_STATE_INVALID ORDER_STATE_CHANGED ORDER_UNPAID CHANNEL_PAUSED
//
// ขอบเขต: ST สถิต (ST7 บริสุทธิ์) · I รับออเดอร์ · A วงจร · S บิล · V ยกเลิก · W เว็บร้าน · R ตัวอ่าน · E event · L ของเดิม (PAR) · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p2.4): SKIP เมื่อของ P2.8 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash · PAR/L เขียว)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST6 + L2 L3 + บริสุทธิ์ ST7 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ep-frosty-lab ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p28-<rand>` + `-t2` (ร้านอื่น) + `-t3` (ไม่มี POS) + ผู้ใช้
//    `posqc-p28-<rand>-*@qc.invalid` (ลบทั้งหมดใน finally · แถวค้าง = 0) · ไม่มีเครือข่าย (fetch = ตัวกั้น 503) · ทุกข้อห่อ try/catch
//    fixture ผ่านฟังก์ชันของโมดูล · Prisma ตรงเฉพาะ Tenant/BusinessUnit/User/Membership/AccountSystemLink + ย้อนเวลา receivedAt/acceptedAt ของแถวทดสอบ (R3) +
//    ลบแถวราคา WEB ของสินค้าทดสอบหนึ่งแถว (W7 จำลองข้อมูลก่อน P2.8) · SQL ดิบ = xmin / information_schema / ลายนิ้วมือ + ลบร้านชั่วคราวเท่านั้น
//    โมดูล/ฟังก์ชัน/โมเดลที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + ตรวจว่ามี) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.8";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 idempotency/เล่นซ้ำ/แข่ง · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน/จำนวน · X5 ไม่เขียนอะไร · PAR = ต้องเขียวทั้งก่อนและหลังสร้าง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.8-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[§3 R1 มติ 14] schema + migration เพิ่มอย่างเดียว: enum PosOrderStatus {NEW ACCEPTED PREPARING READY HANDED REJECTED CANCELLED} · PosOrderPaymentState {UNPAID PAY_ON_PICKUP PLATFORM_PAID PAID REFUNDED} · PosOrderFulfilment {PICKUP DELIVERY DINE_IN} · model PosOrder/PosOrderLine/PosOrderEvent ฟิลด์ตาม R1 (ไม่มี @relation/FK) + @@unique([tenantId, channelId, externalRef]) + @@unique([tenantId, idempotencyKey]) + @@index([tenantId, unitId, status, receivedAt]) · ShopOrder/ShopOrderLine/ShopProduct/SalesChannel/PosSale ไม่เปลี่ยน · migration เดียว `20261207100000_pos_p28_orders`: SET lock_timeout '3s' · CREATE TYPE ×3 · CREATE TABLE IF NOT EXISTS ×3 (ไม่มี REFERENCES) · CREATE UNIQUE INDEX IF NOT EXISTS ×2 · CREATE INDEX IF NOT EXISTS ×1 · ไม่มีคำสั่งอื่น"),
  D("ST2", "S", "[R1 R11 §3 CD8] ลงทะเบียน: core/scope.ts PosOrder/PosOrderLine/PosOrderEvent: sys() · pos-qc-env POS_MODELS posOrder posOrderLine posOrderEvent + POS_FUTURE_MODELS ไม่มี ExternalOrder/ExternalOrderEvent · permissions.ts \"pos.order.accept\" (ป้าย รับ/เตรียม/พร้อม/ส่งมอบ/ตั้งเวลาเตรียมและพักรับออเดอร์ออนไลน์) + \"pos.order.reject\" (ปฏิเสธ/ยกเลิกออเดอร์ออนไลน์) · OrderRefusalCode (order-shared · = RegisterRefusalCode + 5 รหัสใหม่ · ORACLE-EDIT fix 1) · pos.json th/en: register.errors.{orderNotFound orderStateInvalid orderStateChanged orderUnpaid channelPaused} + ก้อน orders.* (คีย์ชุดเดียวกัน · th มีอักษรไทย · en ไม่มี)"),
  D("ST3", "S", "[R4 R10 CD1 CD7 มติ 1 3 13 hard rules] ขอบเขต: มี pos/order.ts order-shared.ts order-adapters.ts order-actions.ts · order.ts export ฟังก์ชันครบ 14 ตัว + createSale( จุดเดียวในฟังก์ชัน orderCreateSale · order-shared บริสุทธิ์ · order-adapters export ORDER_ADAPTERS (MANUAL WEB CHAT) · order-actions \"use server\" async ล้วน + catch + เรียกฟังก์ชันผู้ใช้ทุกตัว · pos/index.ts export `orders` (14 ตัว) · ผู้เขียน PosOrder* = pos/order.ts เท่านั้น · ไม่มีเส้น pos→shop/pos→chat (pos→restaurant ได้เฉพาะบรรทัด POS P2.4) และไฟล์ order* ไม่ import shop/chat/restaurant · shop/service.ts เรียก orders. ผ่าน @/lib/modules/pos ภายในรอยต่อ POS P2.8 ▸ … ◂ (ingestInTx ใน createOrder · sourceCancelledInTx ใน cancelOrder) · outbox-consumers มี 6 pos.order.* + รอยต่อ POS P2.8 ที่ shop.order.paid / pos.sale.voided และเรียก shop cancelOrder ที่ composition root · automation labels 6 event · catalog.ts export backfillWebPrices · catalog-legacy create/updateShopProduct มีรอยต่อ POS P2.8"),
  D("ST4", "S", "[มติ 8 15] POS-OWNER-PENDING.md มีบรรทัด P2.8: (ก) เจ้าของเว็บร้าน (shop/service.ts · ShopOrderLine.posProductId · ราคาเว็บ) (ข) แบบฟอร์มคีย์ออเดอร์ไม่มีในภาพ 09 (ค) webPriceConflict"),
  D("ST5", "S", "[มติ 5 CD9] facts: pos-integrations CHAT chatOrders = true (null) · orderStatusBot ยัง false \"P3.7\" · ป้าย th settings.cards.CHAT.facts.chatOrders = \"คีย์ออเดอร์จากแชทโดยพนักงาน\" · settings-overview แถว onlineOrders permission \"pos.order.accept\" planned null"),
  D("ST6", "PAR", "[มติ 3 7 hard rules] register.ts · service.ts · channel.ts · pos-sale-contract.json ไม่ถูก P2.8 แตะ (sha = be246009 หรือ = merge-base กับ origin/session/pos) · POS_NAV_KEYS ไม่มี orders (ตรงฐาน) · ทุกไฟล์ \"use server\" ใน modules/pos export async function ล้วน · modules/pos ไม่ import @/lib/modules/chat หรือ @/lib/modules/shop"),
  D("ST7", "P", "[R2 R3 R8 R11] order-shared บริสุทธิ์: ORDER_STATUSES / ORDER_PAYMENT_STATES / ORDER_FULFILMENTS / ORDER_REJECT_REASONS ตรงลำดับ · canTransition ครบ 49 คู่ (9 คู่ที่อนุญาต) · ORDER_ACCEPT_WINDOW_SEC 120 · acceptRemainingSec · orderLateMinutes · maskPhone \"08x-xxx-1234\" · parseIngestInput (คีย์แปลก / 101 บรรทัด / qty 0 / ref 41 ตัว / fulfilment แปลก / startStatus READY / บรรทัดไม่มีสินค้าและไม่มีชื่อ+ราคา / ไม่มี idempotencyKey → VALIDATION · ถูกต้อง → ok + ref ตัดช่องว่าง) · refusalMessageKey 5 รหัส"),
  // ── I รับออเดอร์ ──
  D("I1", "-", "[R3 R4 R6 มติ 10] MANUAL LINEMAN (STAFF · เครื่อง 1) startStatus ACCEPTED ref LM-48213 ผัดไทยกุ้ง×2 (ไม่ใส่ไข่ · ไม่ใส่ผักชี) + ต้มยำ + น้ำ → {ok, orderId, duplicated:false, saleId} · PosOrder (channel LINEMAN · adapter MANUAL · ref · code <PFX>-NNNN · ACCEPTED · PLATFORM_PAID · DELIVERY · ลูกค้า · 42000 · saleId · acceptedBy/createdBy STAFF · prepMinutes 15) · 3 บรรทัด Σ 42000"),
  D("I2", "X1", "[R3 มติ 12 X1] เล่นซ้ำ (ช่องทาง, ref) 2 รอบ + ref เดิมคีย์ใหม่ → ออเดอร์เดิม duplicated:true · 10 คำขอพร้อมกัน ref ใหม่ → ออเดอร์ 1 · duplicated 9 · บิล 1 (คีย์ posorder-<id>) · pos.order.received 1 · pos.order.accepted 1 · pos.sale.paid 1"),
  D("I3", "X5", "[R3] ref เดิม + บรรทัดต่าง / คีย์เดิม + บรรทัดต่าง → IDEMPOTENCY_CONFLICT · PosOrder บิล outbox ไม่เพิ่ม"),
  D("I4", "X4", "[R3 CD3] ราคาแช่แข็งตอนรับ: ผัดไทย LINEMAN 15000 priceSource CHANNEL · ต้มยำ 11000 BASE · options สำเนา (choiceId ชื่อ delta) · แก้ราคาช่องทางเป็น 16000 → บรรทัดเดิม/getOrder ไม่เปลี่ยน · ออเดอร์ใหม่ได้ 16000"),
  D("I5", "X5", "[R3] GRAB ต้มยำ notSold → CHANNEL_NOT_SOLD lineIndex 1 · ตัวเลือกของกลุ่มที่ไม่ผูก → OPTIONS_INVALID · ไม่เขียน"),
  D("I6", "X2", "[R3] ช่องทางของสาขา B / ร้าน T2 / ที่ archive / id มั่ว / channelCode ไม่มีจริง → CHANNEL_INVALID · ไม่เขียน"),
  D("I7", "-", "[R3 R7] พัก CHAT → ingestOrder CHANNEL_PAUSED · พัก WEB ของสาขาเว็บ → ingestInTx CHANNEL_PAUSED · พัก LINEMAN (MANUAL) → ok · เลิกพัก"),
  D("I8", "X3", "[R3 มติ 8] บรรทัดกำหนดเอง (ชื่อ+ราคา) โดย STAFF ไม่มี pos.sale.priceOverride → PERMISSION_DENIED · OWNER → ok (productId null · 3000) · NOPERM → PERMISSION_DENIED · 101 บรรทัด → VALIDATION"),
  // ORACLE-ADD (ผู้คุมงาน มติ 25 = บรีฟ §9 มติ 16 · 10 ต.ค.) — 86 ตอนรับเข้า (ตัวอ่าน catalog ชุดเดียวกับไทล์/quote ของหน้าขาย)
  D("I9", "X5", "[R3 มติ 16 · ORACLE-ADD 25] 86 ตอนรับ: ต้มยำปิดขายที่สาขา A → ingestOrder PRODUCT_UNAVAILABLE lineIndex 1 · สินค้าเว็บสาขา B (ผูก POS) ปิดขายที่ B → createOrder ของเว็บร้าน throw (ingestInTx PRODUCT_UNAVAILABLE) · ไม่มี PosOrder/ShopOrder/บิล/outbox · เปิดขายคืน → รับได้ทั้งสองประตู"),
  // ── A วงจร ──
  D("A1", "-", "[R2 R5 R10] GRAB NEW → accept (STAFF2) → markPreparing → markReady → handOver: HANDED · PosOrderEvent toStatus NEW ACCEPTED PREPARING READY HANDED (from null…READY · actor ของ accept = STAFF2) · outbox received/accepted/ready/completed อย่างละ 1 · version +4 · acceptedAt readyAt handedAt closedAt"),
  D("A2", "X1", "[R2 R6 X1] รับพร้อมกัน 2 คำขอ → ok 1 + ORDER_STATE_CHANGED 1 (order.status ACCEPTED) · บิล 1 · รับซ้ำอีกครั้ง → ปฏิเสธ บิลยัง 1 · PosOrder + PosOrderEvent(ACCEPTED) + PosSaleLine xmin เดียวกัน (ธุรกรรมเดียว)"),
  D("A3", "X5", "[R5] rejectOrder NEW (TOO_BUSY + note) → REJECTED rejectReason closedAt ไม่มีบิล outbox rejected 1 · ปฏิเสธซ้ำ / ปฏิเสธออเดอร์ที่รับแล้ว → ORDER_STATE_INVALID · reasonCode แปลก → VALIDATION (ยัง NEW)"),
  D("A4", "X3", "[R5 CD8] STAFF accept/reject · STAFF2 reject (ไม่มี pos.order.reject) · NOPERM accept → PERMISSION_DENIED · ยัง NEW version เดิม · STAFF2 accept → ok"),
  D("A5", "X2", "[R5] id ของร้าน T2 / ctx สาขา B บนออเดอร์สาขา A / id มั่ว → ORDER_NOT_FOUND (getOrder accept reject) · ออเดอร์ T2 ยัง NEW"),
  D("A6", "X5", "[R2] เปลี่ยนสถานะผิดลำดับ: NEW → markReady/handOver/markPreparing/cancelOrder · HANDED → markPreparing/cancelOrder → ORDER_STATE_INVALID · ไม่มี PosOrderEvent ใหม่ version เดิม"),
  D("A7", "-", "[R7] autoAccept: CHAT → ingest ได้ ACCEPTED acceptedByUserId null (audit auto) · WEB สาขาเว็บ → createOrder ของเว็บร้านได้ PosOrder ACCEPTED actor null · LINEMAN (MANUAL) autoAccept → ยัง NEW"),
  D("A8", "X3", "[R5 R7] setChannelOrderSettings: prepMinutes 0/181 · pausedUntil > 24 ชม. · adapterConfig มีความลับ → VALIDATION · {version, note} ok · STAFF → PERMISSION_DENIED · STAFF2 ok · ช่องทางร้าน T2 → CHANNEL_INVALID · accept ใช้ prepMinutes ของช่องทาง (20) · accept 181 → VALIDATION · setPrepMinutes 25 ok / 0 VALIDATION"),
  // ── S บิล ──
  D("S1", "X4", "[R6 มติ 2 10] บิลของ LM-48213: sourceModule POS · sourceId = ออเดอร์ · คีย์ posorder-<id> · channel LINEMAN ref LM-48213 PLATFORM 12600/0 · PosPayment 1 แถว PLATFORM 42000 · บรรทัด productId ครบ + priceSource + options · soldBy STAFF · shiftId = กะเครื่อง 1"),
  D("S2", "X4", "[R6 P2.1 G] GL: PAID Dr 1100 42000 / Cr 4000 / Cr 2200 · COMMISSION Dr 6500 12600 / Cr 1100 12600 · 1100 สุทธิ 29400 · GRAB ฿310: COMMISSION 1100:0/8507 1155:557/0 6500:7950/0"),
  D("S3", "X4", "[R6 CD5] สต็อก: น้ำ (นับสต็อก) ของบิล LM-48213 ตัดครั้งเดียว Σ −1 · (เมื่อ P2.3 merge แล้ว) ผัดกะเพรา BOM ตัดส่วนประกอบตามสูตร"),
  D("S4", "X4", "[R6 P2.1 CD8] ค่าบริการ POS 10% เปิดอยู่ → บิลออเดอร์ serviceCharge 0 · tip 0 · ส่วนลด 0 · grand = Σ บรรทัด"),
  D("S5", "X5", "[R5 R6] CHAT (DIRECT · PAY_ON_PICKUP) READY → handOver ORDER_UNPAID · payOrder CASH ไม่มีเครื่อง → SHIFT_REQUIRED · PLATFORM → CHANNEL_PAY_MISMATCH/VALIDATION · Σ ไม่ตรง → PAYMENT_MISMATCH/VALIDATION · ไม่มีบิล"),
  D("S6", "X4", "[R6 มติ 10] payOrder CASH 12000 รับ 20000 (เครื่อง 2) → บิล POS sourceId ออเดอร์ · CHAT DIRECT · shiftId กะเครื่อง 2 · ทอน 8000 · ออเดอร์ PAID + saleId · X ของกะเครื่อง 2 billCount +1 salesTotal +12000 · handOver → HANDED"),
  D("S7", "X1", "[R6] payOrder คีย์เดิม → บิลเดิม · คีย์ใหม่หลังจ่ายแล้ว → ไม่มีบิลที่สอง (บิลของออเดอร์ = 1)"),
  D("S8", "X5", "[CD5 มติ 11] นโยบาย BLOCK + ไข่เค็มเหลือ 1 สั่ง 2: accept → STOCK_INSUFFICIENT ออเดอร์ยัง NEW version เดิม ไม่มีบิล/event · ingest startStatus ACCEPTED → STOCK_INSUFFICIENT ไม่มีแถวออเดอร์"),
  // ── V ยกเลิก ──
  D("V1", "X1", "[R6 มติ 13] ยกเลิกบิลจากลิ้นชักบิล (voidSaleByActor) ของออเดอร์ READY → ระบายคิว → CANCELLED + REFUNDED · outbox cancelled 1 · เล่น consumers[pos.sale.voided] ซ้ำ 2 รอบ + drain → ไม่เปลี่ยน"),
  D("V2", "X3", "[R5 CD8] cancelOrder หลังรับ (มีบิล) โดย STAFF2 (ไม่มี pos.sale.void) → PERMISSION_DENIED · เหตุผลว่าง → VALIDATION · ออเดอร์/บิลไม่เปลี่ยน"),
  D("V3", "X4", "[R5 มติ 13] cancelOrder โดย MANAGER → CANCELLED + REFUNDED · บิล VOIDED · COMMISSION ถูกกลับ (6500 และ 1100 สุทธิ 0) · outbox cancelled 1 (ไม่เบิ้ล)"),
  D("V4", "X5", "[มติ 13] คืนบางส่วน (น้ำ 2 ขวด PLATFORM) ของบิล GRAB ที่ HANDED → ออเดอร์ HANDED PLATFORM_PAID version เดิม"),
  // ── W เว็บร้าน ──
  D("W1", "-", "[R4 R9] createOrder เว็บร้านสาขา S → PosOrder 1 แถว: WEB (channel WEB ของสาขา S) adapter WEB · ref = รหัส SO · shopOrderId · NEW · UNPAID · ยอด = ShopOrder · บรรทัด productId = ShopOrderLine.posProductId (เขียนแล้ว) · received 1"),
  D("W2", "X5", "[R4] ร้านไม่มี POS (T3): createOrder ได้ ShopOrder · PosOrder 0 · ไม่ throw"),
  D("W3", "X1", "[R4 R10] confirmOrderPaid → ระบายคิว ×2 → PosOrder saleId = posSaleId · PAID · channelId = ช่องทางของบิล · เล่น consumers[shop.order.paid] ซ้ำ → version เดิม"),
  D("W4", "-", "[R4 · H4] shop cancelOrder (รอชำระ) → PosOrder CANCELLED · outbox cancelled 1 · แข่งกับ acceptOrder (accept ชนะก่อน) → ออเดอร์ยังถูกยกเลิก (อ่านใหม่แล้วลองอีกครั้ง)"),
  D("W5", "X1", "[R5 มติ 13] rejectOrder ออเดอร์เว็บ (MANAGER) → REJECTED → ระบายคิว → ShopOrder CANCELLED · เล่นซ้ำ → ไม่เปลี่ยน"),
  D("W6", "X4", "[R9 CD4 มติ 4] แถวร่วม InvItem (ฐาน ฿200) ขายเว็บ ฿250: dual-write แถว (WEB, null) 25000 · storefront listProducts({storefront}) 25000 · createOrder 25000 · ราคา STORE ยัง 20000 · แก้แถว WEB 26000 → storefront + createOrder 26000 · ShopProduct.priceSatang ยัง 25000"),
  D("W7", "X1", "[R9 มติ 4] backfillWebPrices: รอบแรกเขียนแถว WEB ที่หาย (25000) · รอบสองเขียน 0 · แก้วขายสองสาขาคนละราคา → webPriceConflict ≥ 1 (มี posProductId) · createOrder สาขา S 9000 / S2 9500 (ราคาของตัวเอง)"),
  D("W8", "X4", "[R9 มติ 4] บรรทัดบิลยืนยันของเว็บร้าน: productId = posProductId · ไม่มี itemId · priceSource มีค่า · สต็อกเสื้อตัดครั้งเดียวทางเว็บร้าน (ecom-<order>-<line>) −2 · ไม่มีแถวตัดสต็อกของบิล"),
  // ORACLE-ADD (P2.8 fix รอบ 2 · รีวิว F1 F2 · มติผู้คุม 10 ต.ค. 05:1xZ)
  D("W9", "X5", "[R5 มติ 13 · F1] ออเดอร์เว็บที่ร้านยืนยันรับเงินแล้ว (PAID · ยัง NEW) → rejectOrder และ cancelOrder ORDER_STATE_INVALID (ข้อความให้คืนเงิน/ยกเลิกที่หน้าเว็บร้าน) · ออเดอร์/ShopOrder/บิล ECOM ไม่เปลี่ยน · ตัวควบคุม: ออเดอร์เว็บที่ยังไม่จ่าย reject → ShopOrder CANCELLED"),
  D("W11", "X1", "[R4 R5 · H1] การยืนยันรับเงินของเว็บร้านสะท้อนเข้าออเดอร์ในธุรกรรมของมันเอง (ไม่พึ่งคิว): (a) ปฏิเสธก่อน (ยังไม่ระบาย) → confirmOrderPaid ok:false ไม่มีบิล ecom-<id> · ระบายแล้ว ShopOrder CANCELLED (b) ยืนยันก่อน → ก่อนระบายออเดอร์ PAID → reject ORDER_STATE_INVALID webPaid (c) แถว shop.order.paid DONE โดยไม่รันตัวผูก → ยัง PAID + saleId"),
  D("W10", "X4", "[R9 CD4 มติ 4 · F2] หน้าเว็บอ่านชั้นราคาเฉพาะของช่องทาง WEB: ไม่มีแถว WEB + แถวสาขา (ทุกช่องทาง) ฿170 + กติกาทุกช่องทาง −10% → storefront/createOrder = ราคา ShopProduct ฿200 · กติกาที่ระบุ WEB −20% → ฿160 ทั้ง storefront และ createOrder · บรรทัดบิลยืนยันรับเงิน priceSource RULE + priceRuleId (H5)"),
  // ── R ตัวอ่าน ──
  D("R1", "-", "[R8] listOrders สาขา A: counts.byColumn {new preparing ready done} + counts.byChannel ตรงความจริงใน DB · summary {count totalSatang rejectedCancelled avgAcceptSeconds onTime{n m}} · การ์ด LM-48213 (ref itemCount 3 · 42000 · channel {code name}) · กรอง status/channelId"),
  D("R2", "X4", "[R8] getOrder: commission LM-48213 {12600 · 0 · net 29400} = channelCommission · GRAB {7950 · 557 · net 22493} · บรรทัด 3 แถว (options note) · history {count avgSatang} ของเบอร์เดียวกันที่สาขา = ความจริงใน DB"),
  D("R3", "-", "[R8 CD6] เวลา: รับเข้ามา 50 วิ → acceptRemainingSec 69–70 · acceptBy = receivedAt + 120 วิ · 200 วิ → 0 · รับแล้ว 20 นาที เตรียม 15 → prepDueAt = acceptedAt + 15 นาที · lateMinutes 5"),
  D("R4", "X3", "[R8] STAFFR (pos.sale.read) / STAFF อ่านได้ · NOPERM → PERMISSION_DENIED · การ์ดมี phoneMasked 08x-xxx-1234 ไม่มีเบอร์เต็มในผลทั้งก้อน"),
  // ── E event ──
  D("E1", "-", "[R10] ทุก pos.order.* ของร้าน: (orderId, type) ละ 1 แถว · payload มี orderId channelId channelCode status ตรงออเดอร์ · status ตรงชนิด · consumers + automation labels มีครบ 6 ชนิด"),
  D("E2", "X1", "[R10 COMMON 4] เล่น consumers ของทุก pos.order.* ซ้ำ 2 รอบ + drain 2 รอบ → PosOrder version / ShopOrder status / จำนวน outbox ไม่เปลี่ยน"),
  // ── L ของเดิม (PAR) ──
  D("L1", "PAR", "[migration step 3 · qc-shop] เว็บร้านเดิม (สาขา L ร้านชั่วคราว): สินค้า 25000 (ผูกคลัง 50) + 15000 · createOrder 65000 SO-xxxx PENDING_PAYMENT · confirm → PosSale ECOM ecom-<id> 65000 PROMPTPAY PAID + posSaleId · สต็อก 50→48 · ยืนยันซ้ำ false บิล 1 · cancel PENDING ok · refund → VOIDED สต็อก 50"),
  D("L2", "PAR", "[มติ 3 CD7 hard rules] pos-sale-contract.json ไม่เปลี่ยน · ทะเบียนผู้เรียก createSale = ฐาน be246009 (15 ไฟล์/18 จุด) + pos/order.ts 1 จุดเมื่อมีไฟล์"),
  D("L3", "PAR", "[CD9 ORACLE-EDIT] qc-pos-p1.18 ตรงโค้ด: ทูเพิล chatOrders ใน FACTS = pos-integrations · แถว onlineOrders ใน ROLE_ROWS = settings-overview · qc-pos-p1.6 CALL_SITES มี pos/order.ts เมื่อมีไฟล์เท่านั้น"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว T T2 T3 เหลือ 0 แถวทุกตารางที่มี tenantId (PosOrder/Line/Event ShopOrder/Line/Product SalesChannel PosProductChannelPrice PosSale/Line/Payment/Option OutboxEvent AuditLog InvMovement AccountJournal* …) · Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0"),
  D("Z2", "-", "รอยของรอบนี้นอกร้านชั่วคราว = 0 (PosOrder/PosSale คีย์ · InvItem sku · AuditLog/OutboxEvent ที่มีรหัสรอบ · Tenant slug) · ลายนิ้วมือร้านอื่น (PosOrder ShopOrder SalesChannel PosProductChannelPrice นับ + แฮช) ก่อน/หลังพิมพ์เป็นข้อมูล"),
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
  const full = id.startsWith("P2.8-") ? id : `P2.8-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)?.slice(0, 120)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
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
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} ${name}`, missing: true };
  try {
    return fn(...args);
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
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const PMAX = process.env.QC_ALL === "1" ? 99 : 8; // QC_ALL=1 = พิมพ์ทุกเหตุผล
const P8 = (p: string[]) => p.slice(0, PMAX).join(" · ") + (p.length > PMAX ? ` …(+${p.length - PMAX})` : "");
const setStr = (xs: unknown[]) => [...xs].map(String).sort(byId).join(",");
const sha256 = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");

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
/** บรรทัดที่อยู่ในรอยต่อ `// POS P2.8 ▸ … ◂` (บรรทัดเดียวหรือหลายบรรทัด) */
function markedLines(raw: string, tag = "POS P2.8"): Set<number> {
  const out = new Set<number>();
  const lines = raw.split("\n");
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const starts = l.includes(`${tag} ▸`);
    if (starts) open = true;
    if (open) out.add(i);
    if (open && l.includes("◂") && (!starts || l.indexOf("◂") > l.indexOf(`${tag} ▸`))) open = false;
  }
  return out;
}

// ── git (PAR: ของที่ P2.8 ห้ามแตะ = ตรงฐาน be246009 หรือตรง merge-base กับ origin/session/pos) ──
const BASE_REV = "be246009";
function gitBuf(args: string[]): Buffer | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
}
let mergeBaseRev: string | null | undefined;
function mergeBase(): string | null {
  if (mergeBaseRev !== undefined) return mergeBaseRev;
  const r = gitBuf(["merge-base", "HEAD", "origin/session/pos"]);
  mergeBaseRev = r ? r.toString("utf8").trim() || null : null;
  return mergeBaseRev;
}
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

// ═════════════════════════ ค่าคงที่ของสัญญา ═════════════════════════
const POS_DIR = "src/lib/modules/pos";
const F = {
  order: `${POS_DIR}/order.ts`,
  orderShared: `${POS_DIR}/order-shared.ts`,
  orderAdapters: `${POS_DIR}/order-adapters.ts`,
  orderActions: `${POS_DIR}/order-actions.ts`,
  posIndex: `${POS_DIR}/index.ts`,
  register: `${POS_DIR}/register.ts`,
  service: `${POS_DIR}/service.ts`,
  channel: `${POS_DIR}/channel.ts`,
  channelShared: `${POS_DIR}/channel-shared.ts`,
  regShared: `${POS_DIR}/register-shared.ts`,
  catalog: `${POS_DIR}/catalog.ts`,
  catalogLegacy: `${POS_DIR}/catalog-legacy.ts`,
  settingsOverview: `${POS_DIR}/settings-overview.ts`,
  tabs: `${POS_DIR}/tabs.ts`,
  shop: "src/lib/modules/shop/service.ts",
  consumers: "src/lib/outbox-consumers.ts",
  autoLabels: "src/lib/automation/labels.ts",
  fitness: "scripts/fitness.mts",
  scope: "src/lib/core/scope.ts",
  perms: "src/lib/core/permissions.ts",
  qcEnv: "scripts/pos-qc-env.mts",
  contract: "scripts/pos-sale-contract.json",
  integrations: "src/lib/pos-integrations.ts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  ownerPending: "ledger/POS-OWNER-PENDING.md",
  qc16: "scripts/qc-pos-p1.6.mts",
  qc118: "scripts/qc-pos-p1.18.mts",
};
/** sha256 ณ be246009 ของไฟล์ที่ P2.8 ห้ามแตะ (มติ 3) */
const PAR_FILES: Record<string, string> = {
  [F.register]: "304e04e734e758f73ef530550de873f6931ec14c0e7e0aeaf051ce7fb3697484",
  [F.service]: "526f64b9becd860a939463ee458b1dcc40631e49c2eb7d8a6af4725290050481",
  [F.channel]: "a80e970626a2595d1888d474559f992dbce53bb0b4c4a1832581f47bb0c4d6de",
  [F.contract]: "eaced8dcd2b3761f70853ace19918ce2c1a74924fcb28b4ff1afe1ffdbf08eed",
};
/** ฟิลด์ ณ be246009 ของโมเดลที่ P2.8 ห้ามเปลี่ยน (§3 · มติ 14) */
const BASE_MODEL_FIELDS: Record<string, string[]> = {
  ShopOrder: ["id", "tenantId", "unitId", "code", "status", "customerName", "customerPhone", "note", "totalSatang", "posSaleId", "paidAt", "cancelledAt", "refundedAt", "createdAt", "partyId", "lines"],
  ShopOrderLine: ["id", "tenantId", "orderId", "order", "productId", "product", "name", "qty", "unitPriceSatang", "lineTotalSatang", "posProductId"],
  ShopProduct: ["id", "tenantId", "unitId", "name", "description", "priceSatang", "imageUrl", "invItemId", "active", "sortOrder", "createdAt", "updatedAt", "posProductId", "lines"],
  SalesChannel: ["id", "tenantId", "systemId", "unitId", "code", "kind", "name", "adapter", "active", "sortOrder", "payout", "commissionBp", "commissionFixedSatang", "commissionVatBp", "archivedAt", "createdAt", "updatedAt", "autoAccept", "prepMinutes", "pausedUntil", "adapterConfig"],
  PosSale: ["id", "tenantId", "unitId", "systemId", "memberId", "sourceModule", "sourceId", "idempotencyKey", "receiptNo", "status", "subtotalSatang", "discountSatang", "vatSatang", "grandTotalSatang", "pointEarned", "paidAt", "createdAt", "updatedAt", "voucherUseIds", "giftCardTxnId", "tierDiscountSatang", "stampEventIds", "attributionId", "giftCardId", "note", "serviceChargeSatang", "tipSatang", "shiftId", "soldByUserId", "docType", "refSaleId", "refundedSatang", "reasonCode", "publicToken", "taxInvoice", "taxInvoiceDocId", "memberSnapshot", "memberBenefits", "channelId", "channelCode", "channelRef", "channelPayout", "channelCommissionSatang", "channelCommissionVatSatang", "lines", "payments"],
};
const BASE_NAV_KEYS = ["overview", "register", "products", "stock", "sales", "shifts", "close", "reports", "settings"];
const MIGRATION_NAME = "20261207100000_pos_p28_orders";
const ORDER_STATUSES = ["NEW", "ACCEPTED", "PREPARING", "READY", "HANDED", "REJECTED", "CANCELLED"] as const;
const PAY_STATES = ["UNPAID", "PAY_ON_PICKUP", "PLATFORM_PAID", "PAID", "REFUNDED"] as const;
const FULFILMENTS = ["PICKUP", "DELIVERY", "DINE_IN"] as const;
const REJECT_REASONS = ["OUT_OF_STOCK", "CLOSING", "TOO_BUSY", "OTHER"] as const;
/** คู่ที่อนุญาต (R2 + มติ: NEW→CANCELLED = ต้นทางยกเลิก เช่นเว็บร้าน/แพลตฟอร์ม · cancelOrder ของพนักงานบน NEW ยังปฏิเสธ — ใช้ reject) */
const ALLOWED_T = new Set(["NEW>ACCEPTED", "NEW>REJECTED", "NEW>CANCELLED", "ACCEPTED>PREPARING", "PREPARING>READY", "READY>HANDED", "ACCEPTED>CANCELLED", "PREPARING>CANCELLED", "READY>CANCELLED"]);
const ORDER_FNS = ["ingestOrder", "ingestInTx", "sourceCancelledInTx", "acceptOrder", "rejectOrder", "markPreparing", "markReady", "handOver", "cancelOrder", "payOrder", "setPrepMinutes", "setChannelOrderSettings", "listOrders", "getOrder"] as const;
const USER_FNS = ORDER_FNS.filter((f) => f !== "ingestInTx" && f !== "sourceCancelledInTx");
const SHARED_EXPORTS = ["ORDER_STATUSES", "ORDER_PAYMENT_STATES", "ORDER_FULFILMENTS", "ORDER_REJECT_REASONS", "canTransition", "ORDER_ACCEPT_WINDOW_SEC", "acceptRemainingSec", "orderLateMinutes", "maskPhone", "parseIngestInput"] as const;
const NEW_CODES = ["ORDER_NOT_FOUND", "ORDER_STATE_INVALID", "ORDER_STATE_CHANGED", "ORDER_UNPAID", "CHANNEL_PAUSED"] as const;
const camelKey = (code: string) => "errors." + code.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const EVENTS = ["pos.order.received", "pos.order.accepted", "pos.order.rejected", "pos.order.ready", "pos.order.completed", "pos.order.cancelled"] as const;
const PERM_LABELS: [string, string][] = [
  ["pos.order.accept", "รับ/เตรียม/พร้อม/ส่งมอบ/ตั้งเวลาเตรียมและพักรับออเดอร์ออนไลน์"],
  ["pos.order.reject", "ปฏิเสธ/ยกเลิกออเดอร์ออนไลน์"],
];
const CHAT_FACT_LABEL = "คีย์ออเดอร์จากแชทโดยพนักงาน";
/** ฟิลด์บังคับของ 3 โมเดลใหม่ (R1) — ส่วนเกินต้องไม่บังคับ (?, [], @default, @updatedAt) */
const ORDER_FIELDS: [string, RegExp][] = [
  ["id", /^id\s+String\s+@id\b/],
  ["tenantId", /^tenantId\s+String(\s|$)/],
  ["systemId", /^systemId\s+String(\s|$)/],
  ["unitId", /^unitId\s+String(\s|$)/],
  ["channelId", /^channelId\s+String(\s|$)/],
  ["channelCode", /^channelCode\s+String(\s|$)/],
  ["adapter", /^adapter\s+SalesChannelAdapter(\s|$)/],
  ["externalRef", /^externalRef\s+String\?/],
  ["code", /^code\s+String(\s|$)/],
  ["idempotencyKey", /^idempotencyKey\s+String(\s|$)/],
  ["status", /^status\s+PosOrderStatus(\s|$)/],
  ["paymentState", /^paymentState\s+PosOrderPaymentState(\s|$)/],
  ["fulfilment", /^fulfilment\s+PosOrderFulfilment(\s|$)/],
  ["customerName", /^customerName\s+String(\s|$)/],
  ["customerPhone", /^customerPhone\s+String\?/],
  ["memberId", /^memberId\s+String\?/],
  ["partyId", /^partyId\s+String\?/],
  ["address", /^address\s+String\?/],
  ["note", /^note\s+String\?/],
  ["chatConversationId", /^chatConversationId\s+String\?/],
  ["shopOrderId", /^shopOrderId\s+String\?/],
  ["totalSatang", /^totalSatang\s+Int(\s|$)/],
  ["prepMinutes", /^prepMinutes\s+Int\?/],
  ["receivedAt", /^receivedAt\s+DateTime(\s|$)/],
  ["acceptedAt", /^acceptedAt\s+DateTime\?/],
  ["readyAt", /^readyAt\s+DateTime\?/],
  ["handedAt", /^handedAt\s+DateTime\?/],
  ["closedAt", /^closedAt\s+DateTime\?/],
  ["rejectReason", /^rejectReason\s+String\?/],
  ["saleId", /^saleId\s+String\?/],
  ["acceptedByUserId", /^acceptedByUserId\s+String\?/],
  ["createdByUserId", /^createdByUserId\s+String\?/],
  ["version", /^version\s+Int(\s|$)/],
];
const LINE_FIELDS: [string, RegExp][] = [
  ["id", /^id\s+String\s+@id\b/],
  ["tenantId", /^tenantId\s+String(\s|$)/],
  ["orderId", /^orderId\s+String(\s|$)/],
  ["productId", /^productId\s+String\?/],
  ["name", /^name\s+String(\s|$)/],
  ["qty", /^qty\s+Int(\s|$)/],
  ["unitPriceSatang", /^unitPriceSatang\s+Int(\s|$)/],
  ["listPriceSatang", /^listPriceSatang\s+Int\?/],
  ["priceSource", /^priceSource\s+\w+\?/],
  ["priceRuleId", /^priceRuleId\s+String\?/],
  ["options", /^options\s+Json\??(\s|$)/],
  ["note", /^note\s+String\?/],
  ["lineTotalSatang", /^lineTotalSatang\s+Int(\s|$)/],
];
const EVENT_FIELDS: [string, RegExp][] = [
  ["id", /^id\s+String\s+@id\b/],
  ["tenantId", /^tenantId\s+String(\s|$)/],
  ["orderId", /^orderId\s+String(\s|$)/],
  ["type", /^type\s+String(\s|$)/],
  ["fromStatus", /^fromStatus\s+(PosOrderStatus|String)\?/],
  ["toStatus", /^toStatus\s+(PosOrderStatus|String)(\s|$)/],
  ["actorUserId", /^actorUserId\s+String\?/],
  ["payload", /^payload\s+Json\?/],
  ["at", /^at\s+DateTime(\s|$)/],
];
/** ทะเบียนผู้เรียก createSale ณ be246009 (= qc-pos-p1.6 CALL_SITES · สูตรเดียวกัน) */
const CALL_SITES: Record<string, number> = {
  "src/lib/actions/booking.ts": 1, "src/lib/actions/pos.ts": 1, "src/lib/ai/proposals.ts": 1, "src/lib/modules/booking/service.ts": 1,
  "src/lib/modules/clinic/service.ts": 1, "src/lib/modules/giftcard/service.ts": 2, "src/lib/modules/hotel/service.ts": 2,
  "src/lib/modules/member/subscription.ts": 1, "src/lib/modules/pos/api/ops/sales.ts": 1, "src/lib/modules/pos/register.ts": 1,
  "src/lib/modules/rental/service.ts": 2, "src/lib/modules/restaurant/order.ts": 1, "src/lib/modules/school/service.ts": 1,
  "src/lib/modules/shop/service.ts": 1, "src/lib/modules/ticket/service.ts": 1,
};

const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4", "ST5", "ST6", "L2", "L3"].map((x) => `P2.8-${x}`);
const PURE_IDS = ["ST7"].map((x) => `P2.8-${x}`);
const skipReasons: string[] = [];
for (const f of [F.order, F.orderShared, F.orderAdapters, F.orderActions]) if (!existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);
for (const n of ORDER_FNS) if (!exportsFn(srcOf(F.order), n)) skipReasons.push(`ยังไม่มี export ${n} (pos/order.ts)`);
if (!/export\s+const\s+orders\b/.test(srcOf(F.posIndex))) skipReasons.push("pos/index.ts ยังไม่ export orders");
for (const n of SHARED_EXPORTS) if (!exportsFn(srcOf(F.orderShared), n)) skipReasons.push(`ยังไม่มี export ${n} (pos/order-shared.ts)`);
if (!exportsFn(srcOf(F.catalog), "backfillWebPrices")) skipReasons.push("ยังไม่มี export backfillWebPrices (pos/catalog.ts)");

/** ไฟล์ "shared" ไม่ import prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (ค่า) — เงื่อนไขที่ --no-db โหลดได้ */
const purePath = (f: string): boolean => {
  const s = srcOf(f);
  if (!s) return false;
  const valueImports = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const dyn = [...s.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);
  return ![...valueImports, ...dyn].some((p) =>
    /@prisma\/client|\/db$|^\.\/db$|@\/lib\/core\/db|@\/lib\/modules\/(inventory|account|system|restaurant|member|shop|chat)|^node:|^crypto$|^\.\/(order|order-adapters|catalog|catalog-legacy|register|service|bills|refund|held-cart|table|channel|shift|device|price)$/.test(p),
  );
};

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
function modelCheck(p: string[], schemaSrc: string, model: string, want: [string, RegExp][]): void {
  const b = prismaBlock(schemaSrc, "model", model);
  if (!b) {
    p.push(`ไม่มี model ${model}`);
    return;
  }
  for (const [f, re] of want) {
    const l = fieldLine(b, f);
    if (!l) p.push(`${model} ขาด ${f}`);
    else if (!re.test(l)) p.push(`${model}.${f} = ${short(l, 70)}`);
  }
  for (const l of fieldLines(b).filter((x) => !want.some(([f]) => x.split(/\s+/)[0] === f))) {
    const typ = l.split(/\s+/)[1] ?? "";
    if (!(typ.endsWith("?") || typ.endsWith("[]") || /@default\(|@updatedAt/.test(l))) p.push(`${model} ฟิลด์เกินที่บังคับ: ${short(l, 60)}`);
  }
  if (/@relation\b/.test(b)) p.push(`${model} มี @relation (R1: id หลวม ไม่มี FK)`);
}
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  // ST1 schema + migration
  await step("ST1", async () => {
    const p: string[] = [];
    for (const [en, vals] of [["PosOrderStatus", ORDER_STATUSES], ["PosOrderPaymentState", PAY_STATES], ["PosOrderFulfilment", FULFILMENTS]] as const) {
      const v = enumValues(prismaBlock(schemaSrc, "enum", en));
      if (!v.length) p.push(`ไม่มี enum ${en}`);
      else if (setStr(v) !== setStr([...vals])) p.push(`${en} = ${v.join(",")} (คาด ${vals.join(",")})`);
    }
    modelCheck(p, schemaSrc, "PosOrder", ORDER_FIELDS);
    modelCheck(p, schemaSrc, "PosOrderLine", LINE_FIELDS);
    modelCheck(p, schemaSrc, "PosOrderEvent", EVENT_FIELDS);
    const po = prismaBlock(schemaSrc, "model", "PosOrder");
    if (po) {
      if (!/@@unique\(\s*\[\s*tenantId\s*,\s*channelId\s*,\s*externalRef\s*\]\s*\)/.test(po)) p.push("PosOrder ไม่มี @@unique([tenantId, channelId, externalRef])");
      if (!/@@unique\(\s*\[\s*tenantId\s*,\s*idempotencyKey\s*\]\s*\)/.test(po)) p.push("PosOrder ไม่มี @@unique([tenantId, idempotencyKey])");
      if (!/@@index\(\s*\[\s*tenantId\s*,\s*unitId\s*,\s*status\s*,\s*receivedAt\s*\]\s*\)/.test(po)) p.push("PosOrder ไม่มี @@index([tenantId, unitId, status, receivedAt])");
    }
    // โมเดลเดิมไม่เปลี่ยน (ฐาน be246009 หรือ merge-base)
    const mb = mergeBase();
    const mbSchema = mb ? schemaAt(mb) : "";
    for (const [m, base] of Object.entries(BASE_MODEL_FIELDS)) {
      const now = setStr(fieldNames(prismaBlock(schemaSrc, "model", m)));
      const atMb = mbSchema ? setStr(fieldNames(prismaBlock(mbSchema, "model", m))) : "";
      if (now !== setStr(base) && now !== atMb) p.push(`${m} ฟิลด์เปลี่ยน (เกิน ${fieldNames(prismaBlock(schemaSrc, "model", m)).filter((f) => !base.includes(f)).join(",") || "-"} · ขาด ${base.filter((f) => !fieldNames(prismaBlock(schemaSrc, "model", m)).includes(f)).join(",") || "-"})`);
    }
    // migration
    const files = walk("prisma/migrations", [], /\.sql$/).filter((f) => /"PosOrder"|"PosOrderLine"|"PosOrderEvent"|"PosOrderStatus"/.test(rd(f)));
    if (files.length !== 1) p.push(`migration ที่แตะ PosOrder* = ${files.length} ไฟล์ (คาด 1)`);
    for (const f of files) {
      const name = f.split("/").slice(-2, -1)[0] ?? "";
      if (name !== MIGRATION_NAME) p.push(`ชื่อ migration ${name} (คาด ${MIGRATION_NAME})`);
      let sql = rd(f).replace(/--.*$/gm, "");
      const doBlocks = [...sql.matchAll(/DO\s+\$\$([\s\S]*?)\$\$\s*;/gi)].map((m) => m[1]!);
      for (const b of doBlocks)
        if (!/CREATE\s+TYPE\s+"PosOrder(Status|PaymentState|Fulfilment)"/i.test(b) || /\b(DROP|RENAME|DELETE|UPDATE|TRUNCATE|INSERT|ALTER)\b/i.test(b)) p.push(`DO block นอกรายการ (${short(b.replace(/\s+/g, " "), 60)})`);
      const inDo = doBlocks.join("\n");
      sql = sql.replace(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi, "");
      const stmts = sql.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
      const ok = (s: string) =>
        /^(SET|RESET) lock_timeout\b/i.test(s) ||
        /^CREATE TYPE "PosOrder(Status|PaymentState|Fulfilment)" AS ENUM ?\(/i.test(s) ||
        /^CREATE TABLE IF NOT EXISTS "PosOrder(Line|Event)?" ?\(/i.test(s) ||
        /^CREATE UNIQUE INDEX IF NOT EXISTS "[^"]+" ON "PosOrder" ?\(/i.test(s) ||
        /^CREATE INDEX IF NOT EXISTS "[^"]+" ON "PosOrder" ?\(/i.test(s);
      const bad = stmts.filter((s) => !ok(s) || /\b(DROP|RENAME|TRUNCATE|DELETE FROM|UPDATE "|INSERT INTO|ALTER |ADD VALUE|CONCURRENTLY|REFERENCES|FOREIGN KEY)\b/i.test(s));
      if (bad.length) p.push(`${name}: คำสั่งนอกรายการ (${short(bad[0], 90)})`);
      const all = stmts.join(";\n") + "\n" + inDo;
      const lt = /SET lock_timeout\s*(=|TO)\s*'([^']*)'/i.exec(all);
      if (!lt) p.push("ไม่มี SET lock_timeout");
      else if (lt[2] !== "3s") p.push(`lock_timeout '${lt[2]}' (คาด '3s')`);
      for (const [en, vals] of [["PosOrderStatus", ORDER_STATUSES], ["PosOrderPaymentState", PAY_STATES], ["PosOrderFulfilment", FULFILMENTS]] as const) {
        const ty = new RegExp(`CREATE\\s+TYPE\\s+"${en}"\\s+AS\\s+ENUM\\s*\\(([^)]*)\\)`, "i").exec(all);
        if (!ty) p.push(`ไม่มี CREATE TYPE "${en}"`);
        else if (setStr(ty[1]!.split(",").map((x) => x.trim().replace(/'/g, ""))) !== setStr([...vals])) p.push(`ENUM ${en} = ${ty[1]}`);
      }
      const tables = stmts.filter((s) => /^CREATE TABLE/i.test(s));
      if (setStr(tables.map((s) => /"(PosOrder\w*)"/.exec(s)?.[1] ?? "?")) !== setStr(["PosOrder", "PosOrderLine", "PosOrderEvent"])) p.push(`CREATE TABLE = ${tables.map((s) => /"(PosOrder\w*)"/.exec(s)?.[1]).join(",")} (คาด 3 ตาราง)`);
      const cols = (s: string) => (/\(([^)]*)\)\s*$/.exec(s)?.[1] ?? "").split(",").map((c) => c.trim().replace(/"/g, ""));
      const uniq = stmts.filter((s) => /^CREATE UNIQUE INDEX/i.test(s)).map((s) => cols(s).join(","));
      if (setStr(uniq) !== setStr(["tenantId,channelId,externalRef", "tenantId,idempotencyKey"])) p.push(`UNIQUE = ${uniq.join(" | ") || "-"} (คาด (tenantId,channelId,externalRef) + (tenantId,idempotencyKey))`);
      const idx = stmts.filter((s) => /^CREATE INDEX/i.test(s)).map((s) => cols(s).join(","));
      if (idx.length !== 1 || idx[0] !== "tenantId,unitId,status,receivedAt") p.push(`INDEX = ${idx.join(" | ") || "-"} (คาด 1 ตัว (tenantId,unitId,status,receivedAt))`);
      const ctOrder = tables.find((s) => /"PosOrder" ?\(/.test(s)) ?? "";
      for (const c of ["tenantId", "systemId", "unitId", "channelId", "channelCode", "externalRef", "code", "idempotencyKey", "status", "paymentState", "fulfilment", "totalSatang", "receivedAt", "version", "saleId", "shopOrderId"])
        if (ctOrder && !new RegExp(`"${c}"`).test(ctOrder)) p.push(`CREATE TABLE "PosOrder" ขาด "${c}"`);
    }
    chk("ST1", p.length === 0, "3 enum + 3 ตาราง (R1 · ไม่มี FK) + 2 unique + 1 index · โมเดลเดิมไม่เปลี่ยน · migration เดียวเพิ่มล้วน", P8(p) || `ครบ (${files[0] ?? "—"})`);
  });
  // ST2 ลงทะเบียน
  await step("ST2", async () => {
    const p: string[] = [];
    const scope = srcOf(F.scope);
    for (const m of ["PosOrder", "PosOrderLine", "PosOrderEvent"]) if (!new RegExp(`\\b${m}\\s*:\\s*sys\\(\\)`).test(scope)) p.push(`scope.ts ไม่มี ${m}: sys()`);
    const env = srcOf(F.qcEnv);
    const pm = env.slice(env.indexOf("export const POS_MODELS"), env.indexOf("export type PosModelKey"));
    for (const [k, m] of [["posOrder", "PosOrder"], ["posOrderLine", "PosOrderLine"], ["posOrderEvent", "PosOrderEvent"]])
      if (!new RegExp(`\\b${k}\\s*:\\s*\\{[^}]*model:\\s*"${m}"`).test(pm)) p.push(`POS_MODELS ไม่มี ${k} {model: "${m}"}`);
    const fut = constBody(env, "export const POS_FUTURE_MODELS");
    for (const m of ["ExternalOrder", "ExternalOrderEvent"]) if (new RegExp(`"${m}"`).test(fut)) p.push(`POS_FUTURE_MODELS ยังมี ${m}`);
    const perms = rd(F.perms);
    for (const [k, label] of PERM_LABELS) {
      const m = new RegExp(`"${k.replace(/\./g, "\\.")}"\\s*:\\s*"([^"]*)"`).exec(perms);
      if (!m) p.push(`permissions.ts ไม่มี "${k}"`);
      else if (!m[1]!.startsWith(label)) p.push(`ป้าย ${k} = ${short(m[1], 60)} (คาดขึ้นต้น ${label})`);
    }
    // ORACLE-EDIT (P2.8 fix รอบ 1 · มติผู้คุม 1): รหัสใหม่อยู่ใน OrderRefusalCode ของ order-shared.ts (= RegisterRefusalCode + 5 รหัส) —
    //   register.ts มี REG_MESSAGE: Record<RegisterRefusalCode, string> และห้ามแตะ (มติ 3) · ข้อความ th/en ตรวจด้านล่าง · refusalMessageKey ตรวจใน ST7
    const os2 = srcOf(F.orderShared);
    const i0 = os2.indexOf("export type OrderRefusalCode");
    const union = i0 < 0 ? "" : os2.slice(i0, os2.indexOf(";", i0));
    if (!union) p.push("order-shared.ts ไม่มี export type OrderRefusalCode");
    else if (!/\bRegisterRefusalCode\b/.test(union)) p.push("OrderRefusalCode ไม่รวม RegisterRefusalCode");
    for (const c of NEW_CODES) if (!new RegExp(`"${c}"`).test(union)) p.push(`OrderRefusalCode ไม่มี ${c}`);
    const leaves = (o: unknown, pre = ""): [string, string][] => (typeof o === "string" ? [[pre, o]] : isRecord(o) ? Object.entries(o).flatMap(([k, v]) => leaves(v, pre ? `${pre}.${k}` : k)) : []);
    const blocks: Record<string, [string, string][]> = {};
    for (const [lang, f] of [["th", F.msgTh], ["en", F.msgEn]] as const) {
      let j: Any = null;
      try {
        j = JSON.parse(rd(f) || "null");
      } catch (e) {
        p.push(`${f} อ่าน JSON ไม่ได้: ${(e as Error).message.slice(0, 40)}`);
      }
      const lv = leaves(j?.orders);
      blocks[lang] = lv;
      if (!lv.length) p.push(`${lang}: ไม่มีก้อนข้อความ orders.*`);
      else if (lang === "th" && !lv.some(([, s]) => THAI.test(s))) p.push("th: orders.* ไม่มีข้อความไทย");
      else if (lang === "en" && lv.some(([, s]) => THAI.test(s))) p.push(`en: orders.* มีอักษรไทย (${lv.filter(([, s]) => THAI.test(s)).map(([k]) => k).slice(0, 3).join(",")})`);
      for (const c of NEW_CODES) {
        const k = camelKey(c).slice("errors.".length);
        const v = j?.register?.errors?.[k];
        if (typeof v !== "string" || !v.trim()) p.push(`${lang}: register.errors.${k} ไม่มี`);
        else if (lang === "th" && !THAI.test(v)) p.push(`th: register.errors.${k} ไม่ใช่ภาษาไทย`);
        else if (lang === "en" && THAI.test(v)) p.push(`en: register.errors.${k} มีอักษรไทย`);
      }
    }
    const kt = (blocks.th ?? []).map(([k]) => k).sort();
    const ke = (blocks.en ?? []).map(([k]) => k).sort();
    if (kt.length && ke.length && short(kt, 20000) !== short(ke, 20000)) p.push(`คีย์ orders.* th/en ไม่ตรงกัน (th ${kt.length} · en ${ke.length})`);
    chk("ST2", p.length === 0, "scope 3× sys() · POS_MODELS · FUTURE ไม่มี ExternalOrder* · 2 สิทธิ์ + ป้าย · 5 รหัส · ข้อความ th/en", P8(p) || `ครบ (${kt.length} คีย์ orders.*)`);
  });
  // ST3 ขอบเขตโมดูล
  await step("ST3", async () => {
    const p: string[] = [];
    for (const f of [F.order, F.orderShared, F.orderAdapters, F.orderActions]) if (!existsSync(join(ROOT, f))) p.push(`ไม่มี ${f.split("/").slice(-2).join("/")}`);
    const os = srcOf(F.order);
    for (const n of ORDER_FNS) if (os && !exportsFn(os, n)) p.push(`order.ts ไม่ export ${n}`);
    if (os) {
      const n = (os.match(/\bcreateSale\s*\(/g) ?? []).length;
      if (n !== 1) p.push(`order.ts มี createSale( ${n} จุด (คาด 1)`);
      if (!/\bcreateSale\s*\(/.test(fnBody(os, "orderCreateSale"))) p.push("createSale( ไม่อยู่ในฟังก์ชัน orderCreateSale");
    }
    if (existsSync(join(ROOT, F.orderShared))) {
      if (!purePath(F.orderShared)) p.push("order-shared.ts import prisma/db/โมดูลเซิร์ฟเวอร์/node: (ต้องบริสุทธิ์)");
      for (const n of SHARED_EXPORTS) if (!exportsFn(srcOf(F.orderShared), n)) p.push(`order-shared.ts ไม่ export ${n}`);
    }
    const ad = srcOf(F.orderAdapters);
    if (ad) {
      if (!exportsFn(ad, "ORDER_ADAPTERS")) p.push("order-adapters.ts ไม่ export ORDER_ADAPTERS");
      const body = constBody(ad, "export const ORDER_ADAPTERS");
      for (const a of ["MANUAL", "WEB", "CHAT"]) if (!new RegExp(`\\b${a}\\b`).test(body)) p.push(`ORDER_ADAPTERS ไม่มี ${a}`);
    }
    const taRaw = rd(F.orderActions);
    if (taRaw) {
      if (!isUseServer(taRaw)) p.push('order-actions.ts ไม่ขึ้นต้น "use server"');
      const ta = stripComments(taRaw);
      const bad = [...ta.matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim()).filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`order-actions.ts export ที่ไม่ใช่ async function (${short(bad.map((b) => b.slice(0, 40)), 100)})`);
      for (const n of USER_FNS) if (!new RegExp(`\\b${n}\\s*\\(`).test(ta)) p.push(`order-actions.ts ไม่เรียก ${n}`);
      const starts = [...ta.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map((m) => ({ name: m[1]!, at: m.index! }));
      for (let i = 0; i < starts.length; i++) {
        const body = ta.slice(starts[i]!.at, i + 1 < starts.length ? starts[i + 1]!.at : ta.length);
        if (!/\bcatch\b/.test(body)) p.push(`${starts[i]!.name} ไม่มี catch`);
      }
    }
    const idx = constBody(srcOf(F.posIndex), "export const orders");
    if (!idx) p.push("pos/index.ts ไม่มี export const orders");
    else for (const n of ORDER_FNS) if (!new RegExp(`\\b${n}\\b`).test(idx)) p.push(`orders facade ไม่มี ${n}`);
    // ผู้เขียน PosOrder* = pos/order.ts เท่านั้น
    for (const f of walk("src")) {
      if (f === F.order) continue;
      const s = srcOf(f);
      if (/\.(posOrder|posOrderLine|posOrderEvent)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(s) || /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"PosOrder(Line|Event)?"/.test(s)) p.push(`${f.replace("src/lib/", "")} เขียนตาราง PosOrder* (ต้องผ่าน pos/order.ts)`);
    }
    // เส้น fitness + import ของไฟล์ order*
    const fit = rd(F.fitness).split("\n");
    for (const e of ["pos→shop", "pos→chat"]) if (fit.some((l) => l.includes(`"${e}"`))) p.push(`fitness.mts มี "${e}" (ห้ามตลอด · มติ 1)`);
    const pr = fit.filter((l) => l.includes('"pos→restaurant"'));
    if (pr.some((l) => !/POS P2\.4/.test(l))) p.push('fitness.mts มี "pos→restaurant" ที่ไม่ใช่บรรทัด POS P2.4 (มติ 6)');
    for (const f of [F.order, F.orderShared, F.orderAdapters, F.orderActions]) {
      const s = srcOf(f);
      if (/(?:from\s*|import\s*\(\s*)["'](@\/lib\/modules\/(shop|chat|restaurant)[^"']*|\.\.\/(shop|chat|restaurant)[^"']*)["']/.test(s)) p.push(`${f.split("/").pop()} import shop/chat/restaurant`);
    }
    // shop/service.ts: orders ผ่าน facade ในรอยต่อ
    const shopRaw = rd(F.shop);
    const marked = markedLines(shopRaw);
    if (marked.size === 0) p.push("shop/service.ts ไม่มีรอยต่อ // POS P2.8 ▸ … ◂");
    const shopLines = shopRaw.split("\n");
    const outside = shopLines.map((l, i) => [l, i] as const).filter(([l, i]) => /\bingestInTx\b|\bsourceCancelledInTx\b|\borders\s*\./.test(l.replace(/\/\/.*$/, "")) && !marked.has(i));
    if (outside.length) p.push(`shop/service.ts ใช้ orders นอกรอยต่อ (บรรทัด ${outside.map(([, i]) => i + 1).slice(0, 4).join(",")})`);
    const shop = stripComments(shopRaw);
    if (!/import\s*\{[^}]*\borders\b[^}]*\}\s*from\s*["']@\/lib\/modules\/pos["']|import\s*\(\s*["']@\/lib\/modules\/pos["']\s*\)/.test(shop)) p.push('shop/service.ts ไม่ได้ใช้ orders จาก "@/lib/modules/pos"');
    if (/["']@\/lib\/modules\/pos\/order(-[a-z]+)?["']/.test(shop)) p.push("shop/service.ts import pos/order* ตรง (ต้องผ่าน facade)");
    if (!/\bingestInTx\b/.test(fnBody(shop, "createOrder"))) p.push("shop createOrder ไม่เรียก ingestInTx");
    if (!/\bsourceCancelledInTx\b/.test(fnBody(shop, "cancelOrder"))) p.push("shop cancelOrder ไม่เรียก sourceCancelledInTx");
    // outbox-consumers
    const consRaw = rd(F.consumers);
    const cons = stripComments(consRaw);
    for (const e of EVENTS) if (!new RegExp(`"${e.replace(/\./g, "\\.")}"\\s*:`).test(cons)) p.push(`outbox-consumers ไม่มี ${e}`);
    const cl = consRaw.split("\n");
    for (const e of ["shop.order.paid", "pos.sale.voided"]) {
      const i = cl.findIndex((l) => new RegExp(`"${e.replace(/\./g, "\\.")}"\\s*:`).test(l));
      if (i < 0) p.push(`outbox-consumers ไม่มี ${e}`);
      else if (!/POS P2\.8\s*▸/.test(cl.slice(Math.max(0, i - 8), i + 9).join("\n"))) p.push(`ตัวรับ ${e} ไม่มีรอยต่อ POS P2.8 ▸ (±8 บรรทัด)`);
    }
    if (!/@\/lib\/modules\/shop/.test(cons) || !/\bcancelOrder\b/.test(cons)) p.push("outbox-consumers ไม่เรียก shop cancelOrder (pos.order.rejected ของเว็บ · composition root)");
    const labels = rd(F.autoLabels);
    for (const e of EVENTS) if (!labels.includes(`"${e}"`)) p.push(`automation labels ไม่มี ${e}`);
    if (!exportsFn(srcOf(F.catalog), "backfillWebPrices")) p.push("catalog.ts ไม่ export backfillWebPrices");
    const leg = rd(F.catalogLegacy);
    for (const fn of ["createShopProduct", "updateShopProduct"]) if (!/POS P2\.8/.test(fnBody(leg, fn))) p.push(`catalog-legacy ${fn} ไม่มีรอยต่อ POS P2.8 (dual-write แถว WEB)`);
    chk("ST3", p.length === 0, "ไฟล์ · export · จุด createSale เดียว · shared บริสุทธิ์ · actions · facade · ผู้เขียนเดียว · เส้น · รอยต่อเว็บร้าน · ตัวรับ · labels · backfill · dual-write", P8(p) || "ครบ");
  });
  // ST4 โน้ตเจ้าของ
  await step("ST4", async () => {
    const p: string[] = [];
    const own = rd(F.ownerPending).split("\n").filter((l) => /P2\.8/.test(l));
    if (!own.some((l) => /shop\/service\.ts|ShopOrderLine\.posProductId|เว็บร้าน|storefront/i.test(l))) p.push("ไม่มีบรรทัด P2.8 ของเจ้าของเว็บร้าน (shop/service.ts · ShopOrderLine.posProductId · ราคาเว็บ)");
    if (!own.some((l) => /\b09\b/.test(l) && /(manual|คีย์ออเดอร์|แบบฟอร์ม|sheet)/i.test(l))) p.push("ไม่มีบรรทัด P2.8 เรื่องแบบฟอร์มคีย์ออเดอร์ (ภาพ 09 ไม่มี)");
    if (!own.some((l) => /webPriceConflict/.test(l))) p.push("ไม่มีบรรทัด P2.8 เรื่อง webPriceConflict");
    chk("ST4", p.length === 0, "3 บรรทัดเจ้าของ P2.8", P8(p) || `ครบ (${own.length} บรรทัด P2.8)`);
  });
  // ST5 facts
  await step("ST5", async () => {
    const p: string[] = [];
    const integ = srcOf(F.integrations);
    if (!/\["chatOrders",\s*true,\s*null\]/.test(integ)) p.push(`CHAT chatOrders = ${short(/\["chatOrders",[^\]]*\]/.exec(integ)?.[0] ?? "ไม่มี", 50)} (คาด ["chatOrders", true, null])`);
    if (!/\["orderStatusBot",\s*false,\s*"P3\.7"\]/.test(integ)) p.push('orderStatusBot ไม่ใช่ false "P3.7"');
    let th: Any = null;
    try {
      th = JSON.parse(rd(F.msgTh) || "null");
    } catch {
      /* ST2 รายงานแล้ว */
    }
    const lab = th?.settings?.cards?.CHAT?.facts?.chatOrders;
    if (lab !== CHAT_FACT_LABEL) p.push(`ป้าย chatOrders = ${short(lab, 40)} (คาด ${CHAT_FACT_LABEL})`);
    if (!/\{\s*task:\s*"onlineOrders",\s*permission:\s*"pos\.order\.accept",\s*planned:\s*null/.test(srcOf(F.settingsOverview))) p.push('settings-overview onlineOrders ไม่ใช่ permission "pos.order.accept" planned null');
    chk("ST5", p.length === 0, "chatOrders true · orderStatusBot P3.7 · ป้าย · onlineOrders → pos.order.accept", P8(p) || "ครบ");
  });
  // ST6 PAR
  await step("ST6", async () => {
    const p: string[] = [];
    const mb = mergeBase();
    for (const [f, base] of Object.entries(PAR_FILES)) {
      const raw = existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f)) : Buffer.from("");
      const h = sha256(raw);
      if (h === base) continue;
      const atMb = mb ? shaAt(mb, f) : null;
      if (h !== atMb) p.push(`${f.split("/").pop()} เปลี่ยน (sha ${h.slice(0, 12)} ≠ ฐาน ${base.slice(0, 12)} / merge-base ${atMb ? atMb.slice(0, 12) : "ไม่มี"})`);
    }
    const nav = constBody(srcOf(F.tabs), "export const POS_NAV_KEYS");
    const keys = [...nav.matchAll(/"([a-z]+)"/g)].map((m) => m[1]!);
    if (keys.join(",") !== BASE_NAV_KEYS.join(",")) p.push(`POS_NAV_KEYS = ${keys.join(",")} (มติ 7: ไม่มีคีย์ใหม่)`);
    const files = walk(POS_DIR).filter((f) => isUseServer(rd(f)));
    for (const f of files) {
      const bad = [...srcOf(f).matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim()).filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`${f.split("/").pop()}: export ที่ไม่ใช่ async function (${short(bad.map((b) => b.slice(0, 40)), 100)})`);
    }
    for (const f of walk(POS_DIR)) if (/(?:from\s*|import\s*\(\s*)["']@\/lib\/modules\/(chat|shop)(\/[^"']*)?["']/.test(srcOf(f))) p.push(`${f.replace("src/lib/modules/", "")} import chat/shop (มติ 1 5)`);
    chk("ST6", p.length === 0, "4 ไฟล์ไม่ถูกแตะ · nav เดิม · use server async · pos ไม่ import chat/shop", P8(p) || `ครบ (merge-base ${mb ? mb.slice(0, 8) : "ไม่มี"} · ${files.length} ไฟล์ use server)`);
  });
  // L2 สัญญา createSale + ทะเบียนผู้เรียก
  await step("L2", async () => {
    const p: string[] = [];
    const raw = existsSync(join(ROOT, F.contract)) ? readFileSync(join(ROOT, F.contract)) : Buffer.from("");
    const h = sha256(raw);
    const mb = mergeBase();
    if (h !== PAR_FILES[F.contract] && h !== (mb ? shaAt(mb, F.contract) : null)) p.push(`pos-sale-contract.json เปลี่ยน (sha ${h.slice(0, 12)})`);
    const want: Record<string, number> = { ...CALL_SITES, ...(existsSync(join(ROOT, F.order)) ? { [F.order]: 1 } : {}) };
    const found: Record<string, number> = {};
    for (const f of walk("src")) {
      if (f.endsWith("src/lib/modules/pos/service.ts") || f.endsWith("src/lib/contracts.ts")) continue;
      const n = (stripComments(rd(f)).match(/\bcreateSale\s*\(/g) ?? []).length;
      if (n) found[f] = n;
    }
    const diff = [...new Set([...Object.keys(want), ...Object.keys(found)])].filter((f) => want[f] !== found[f]).map((f) => `${f.replace("src/lib/", "")}:${want[f] ?? 0}→${found[f] ?? 0}`);
    if (diff.length) p.push(`ทะเบียนต่าง: ${diff.join(", ")}`);
    chk("L2", p.length === 0, "สัญญา createSale เดิม · ผู้เรียก = ฐาน (+ pos/order.ts 1 เมื่อมี)", P8(p) || `ครบ (${sum(Object.values(found))} จุด/${Object.keys(found).length} ไฟล์)`);
  });
  // L3 ข้อสอบเดิมตรงโค้ด (เป้า ORACLE-EDIT)
  await step("L3", async () => {
    const p: string[] = [];
    const tup = (s: string) => /\["chatOrders",\s*(true|false),\s*(null|"[^"]*")\]/.exec(s)?.slice(1).join("|") ?? "ไม่มี";
    const a = tup(srcOf(F.integrations));
    const b = tup(rd(F.qc118));
    if (a !== b) p.push(`chatOrders: โค้ด ${a} · qc-pos-p1.18 ${b} (ORACLE-EDIT :317)`);
    const so = /\{\s*task:\s*"onlineOrders",\s*permission:\s*(null|"[^"]*"),\s*planned:\s*(null|"[^"]*")/.exec(srcOf(F.settingsOverview))?.slice(1).join("|") ?? "ไม่มี";
    const rr = /\["onlineOrders",\s*(null|"[^"]*"),\s*(null|"[^"]*")\]/.exec(rd(F.qc118))?.slice(1).join("|") ?? "ไม่มี";
    if (so !== rr) p.push(`onlineOrders: โค้ด ${so} · qc-pos-p1.18 ${rr} (ORACLE-EDIT :338)`);
    const has = /"src\/lib\/modules\/pos\/order\.ts"\s*:\s*1\b/.test(constBody(rd(F.qc16), "const CALL_SITES"));
    const ex = existsSync(join(ROOT, F.order));
    if (has !== ex) p.push(`qc-pos-p1.6 CALL_SITES ${has ? "มี" : "ไม่มี"} pos/order.ts แต่ไฟล์${ex ? "มี" : "ไม่มี"} (ORACLE-EDIT :395–411)`);
    chk("L3", p.length === 0, "qc-pos-p1.18 facts/แถวบทบาท + qc-pos-p1.6 ทะเบียน ตรงโค้ด", P8(p) || `ครบ (chatOrders ${a} · onlineOrders ${so})`);
  });
}

// ═════════════════════════ 1b. บริสุทธิ์ (ไม่แตะ DB) ═════════════════════════
async function runPure(shared: Any, regShared: Any): Promise<void> {
  console.log("\n── ST7 บริสุทธิ์ (order-shared · refusalMessageKey) ──");
  await step("ST7", async () => {
    const p: string[] = [];
    if (!shared) p.push(`${MISSING} order-shared.ts`);
    for (const [n, want] of [["ORDER_STATUSES", ORDER_STATUSES], ["ORDER_PAYMENT_STATES", PAY_STATES], ["ORDER_FULFILMENTS", FULFILMENTS], ["ORDER_REJECT_REASONS", REJECT_REASONS]] as const) {
      const v = shared?.[n];
      if (!Array.isArray(v) || v.join(",") !== want.join(",")) p.push(`${n} = ${short(v, 80)} (คาด ${want.join(",")})`);
    }
    if (typeof shared?.canTransition !== "function") p.push(`${MISSING} canTransition`);
    else {
      let wrong = 0;
      let first = "";
      for (const a of ORDER_STATUSES)
        for (const b of ORDER_STATUSES) {
          const want = ALLOWED_T.has(`${a}>${b}`);
          const got = callSync(shared, "canTransition", a, b);
          if (got !== want) {
            wrong++;
            if (!first) first = `${a}→${b} = ${short(got, 30)} (คาด ${want})`;
          }
        }
      if (wrong) p.push(`canTransition ผิด ${wrong}/49 เช่น ${first}`);
    }
    if (shared?.ORDER_ACCEPT_WINDOW_SEC !== 120) p.push(`ORDER_ACCEPT_WINDOW_SEC = ${short(shared?.ORDER_ACCEPT_WINDOW_SEC)}`);
    const t0 = 1_800_000_000_000;
    if (typeof shared?.acceptRemainingSec !== "function") p.push(`${MISSING} acceptRemainingSec`);
    else
      for (const [el, want] of [[0, 120], [50_000, 70], [50_400, 70], [119_000, 1], [120_000, 0], [200_000, 0]] as const) {
        const got = callSync(shared, "acceptRemainingSec", t0, t0 + el);
        if (got !== want) p.push(`acceptRemainingSec(+${el / 1000}s) = ${short(got, 20)} (คาด ${want})`);
      }
    if (typeof shared?.orderLateMinutes !== "function") p.push(`${MISSING} orderLateMinutes`);
    else
      for (const [el, want] of [[-1000, 0], [0, 0], [59_000, 0], [60_000, 1], [330_000, 5]] as const) {
        const got = callSync(shared, "orderLateMinutes", t0, t0 + el);
        if (got !== want) p.push(`orderLateMinutes(due${el >= 0 ? "+" : ""}${el / 1000}s) = ${short(got, 20)} (คาด ${want})`);
      }
    if (typeof shared?.maskPhone !== "function") p.push(`${MISSING} maskPhone`);
    else
      for (const [inp, want] of [["0812341234", "08x-xxx-1234"], ["081-234-1234", "08x-xxx-1234"], [null, null], ["", null]] as const) {
        const got = callSync(shared, "maskPhone", inp);
        if (got !== want) p.push(`maskPhone(${short(inp, 20)}) = ${short(got, 30)} (คาด ${short(want, 20)})`);
      }
    if (typeof shared?.parseIngestInput !== "function") p.push(`${MISSING} parseIngestInput`);
    else {
      const line = { productId: "p_1", qty: 1 };
      const base = { channelCode: "LINEMAN", externalRef: "  LM-1  ", idempotencyKey: "k-1", lines: [line], customer: { name: "คุณเอ" }, fulfilment: "PICKUP" };
      const okR = callSync(shared, "parseIngestInput", base);
      if (okR?.ok !== true) p.push(`ข้อมูลถูกต้อง → ${codeOf(okR)} ${short(okR?.message ?? "", 60)}`);
      else if (okR.value?.externalRef !== "LM-1") p.push(`externalRef ไม่ถูกตัดช่องว่าง (${short(okR.value?.externalRef, 20)})`);
      const bad: [string, unknown][] = [
        ["คีย์แปลก", { ...base, bogus: 1 }],
        ["101 บรรทัด", { ...base, lines: Array.from({ length: 101 }, () => line) }],
        ["qty 0", { ...base, lines: [{ productId: "p_1", qty: 0 }] }],
        ["ref 41 ตัว", { ...base, externalRef: "R".repeat(41) }],
        ["fulfilment แปลก", { ...base, fulfilment: "BOAT" }],
        ["startStatus READY", { ...base, startStatus: "READY" }],
        ["บรรทัดไม่มีสินค้า/ชื่อ+ราคา", { ...base, lines: [{ qty: 1 }] }],
        ["ไม่มี idempotencyKey", { ...base, idempotencyKey: undefined }],
      ];
      for (const [lbl, inp] of bad) {
        const r = callSync(shared, "parseIngestInput", inp);
        if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)} (คาด VALIDATION)`);
      }
    }
    for (const c of NEW_CODES) {
      const k = callSync(regShared, "refusalMessageKey", c);
      if (k !== camelKey(c)) p.push(`refusalMessageKey(${c}) = ${short(k, 40)} (คาด ${camelKey(c)})`);
    }
    chk("ST7", p.length === 0, "ค่าคงที่ · 49 คู่ · เวลา · ปิดเบอร์ · ตัวแกะ · คีย์ข้อความ", P8(p) || "ครบ");
  });
}

// ═════════════════════════ 1c. --no-db ═════════════════════════
const loadShared = async () => (existsSync(join(ROOT, F.orderShared)) && purePath(F.orderShared) ? await tryImport("@/lib/modules/pos/order-shared") : null);
const loadRegShared = async () => (purePath(F.regShared) ? await tryImport("@/lib/modules/pos/register-shared") : null);
if (NODB) {
  const ids = [...STATIC_IDS, ...PURE_IDS];
  console.log(`[${SUITE}] --no-db: รัน ${ids.length} ข้อ (สถิต + บริสุทธิ์ · ไม่โหลด prisma)`);
  let crashedS = "";
  try {
    await runStatic();
    if (existsSync(join(ROOT, F.orderShared)) && !purePath(F.orderShared)) console.log("  ⚠️  order-shared.ts ไม่บริสุทธิ์ — --no-db ไม่โหลด (ST7 แดง)");
    await runPure(await loadShared(), await loadRegShared());
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of ids) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
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
const POL: Any = delegate("posOrderLine");
const POE: Any = delegate("posOrderEvent");
const PCP: Any = delegate("posProductChannelPrice");
for (const [k, d] of [["posOrder", PO], ["posOrderLine", POL], ["posOrderEvent", POE]] as const) if (!d) skipReasons.push(`Prisma client ยังไม่มี delegate ${k}`);
const dbTables = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ('PosOrder','PosOrderLine','PosOrderEvent','PosProductChannelPrice')`)) as Any[];
  for (const r of rows) dbTables.add(String(r.table_name));
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
for (const t of ["PosOrder", "PosOrderLine", "PosOrderEvent"]) if (!dbTables.has(t)) skipReasons.push(`ฐาน QC4 ยังไม่มีตาราง ${t}`);
if (!dbTables.has("PosProductChannelPrice") || !PCP) skipReasons.push("ฐาน/ไคลเอนต์ยังไม่มี PosProductChannelPrice (P2.2 S ยังไม่ merge — มติ 9)");

const FP_TABLES: [string, string][] = [["PosOrder", "version"], ["ShopOrder", "status"], ["SalesChannel", "updatedAt"], ["PosProductChannelPrice", "updatedAt"]];
/** ลายนิ้วมือของร้านที่ไม่ใช่ร้านชั่วคราวของข้อสอบนี้ (ข้อมูล — lane อื่นเขียนพร้อมกันได้) */
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h
         FROM "${tb}" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE 'posqc-p28-%'))`,
      )) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      out[tb] = `ไม่มีตาราง/อ่านไม่ได้:${(e as Error).message.slice(0, 30)}`;
    }
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.8 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons.slice(0, 12)) console.log(`   • ${r}`);
  if (skipReasons.length > 12) console.log(`   • …(+${skipReasons.length - 12})`);
  console.log(`   ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล · PAR/L เขียว)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · PAR/L เขียว)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const sharedMod = await loadShared();
const regSharedMod = await loadRegShared();
const posIdx = await tryImport("@/lib/modules/pos");
const ord: Any = isRecord(posIdx?.orders) ? posIdx.orders : null;
const catalog = await tryImport("@/lib/modules/pos/catalog");
const chMod = await tryImport("@/lib/modules/pos/channel");
const chShared = await tryImport("@/lib/modules/pos/channel-shared");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const paySetMod = await tryImport("@/lib/modules/pos/payment-settings");
const setGenMod = await tryImport("@/lib/modules/pos/settings-general");
const invSvc = await tryImport("@/lib/modules/inventory/service");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const shop = await tryImport("@/lib/modules/shop/service");
const consMod = await tryImport("@/lib/outbox-consumers");
const HAS_P23 = existsSync(join(ROOT, `${POS_DIR}/recipe-shared.ts`));

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p2.8-${RAND}`;
const T_SLUG = `posqc-p28-${RAND}`;
const T2_SLUG = `${T_SLUG}-t2`;
const T3_SLUG = `${T_SLUG}-t3`;
const EMAIL_PREFIX = `${T_SLUG}-`;
const KEY_PREFIX = `qc28-${RAND}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";
let T3 = "";
const RUN_START = Date.now();
const MIN = 60_000;

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
/** VAT รวมในราคา (สูตรเดียวกับ qc-pos-p2.1) */
const vatOf = (g: number, bp: number) => {
  const den = 10_000 + bp;
  return g - Math.floor((2 * g * 10_000 + den) / (2 * den));
};

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ -t2 ร้านอื่น · -t3 ไม่มี POS) · DB ${HOST} ──`);
  console.log("   สาขา A (RESTAURANT · POS + คลัง · สมุด VAT · ค่าบริการ POS 10% · BLOCK) · B (POS) · S S2 L (เว็บร้าน ไม่ผูก POS = POS แรก) · T2 สาขา X · T3 สาขา N (ไม่มี POS)");
  let fx = "";
  const soft: string[] = []; // fixture ที่ขึ้นกับ P2.2/P2.3 (ไม่หยุดชุด)
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; tid: string; role: string; unitAccess: string[]; perms: Record<string, boolean> }> = {};
  const CH: Record<string, string> = {};
  const PR: Record<string, string> = {};
  const INV: Record<string, string> = {};
  const CHO: Record<string, string> = {};
  const SP: Record<string, string> = {};
  const ORD: Record<string, string> = {};
  const SHIFT: Record<string, string> = {};
  try {
    T = (await P.tenant.create({ data: { name: `QC P2.8 ออเดอร์ออนไลน์ ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P2.8 ร้านที่สอง ${RAND}`, slug: T2_SLUG } })).id;
    T3 = (await P.tenant.create({ data: { name: `QC P2.8 ร้านไม่มี POS ${RAND}`, slug: T3_SLUG } })).id;
    U.A = (await P.businessUnit.create({ data: { tenantId: T, type: "RESTAURANT", name: `${TAG} สาขาA`, slug: `${T_SLUG}-a` } })).id;
    for (const k of ["B", "S", "S2", "L"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "SHOP", name: `${TAG} สาขาX`, slug: `${T2_SLUG}-x` } })).id;
    U.N = (await P.businessUnit.create({ data: { tenantId: T3, type: "SHOP", name: `${TAG} สาขาN`, slug: `${T3_SLUG}-n` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
    S.INV = (await sysSvc.createSystem(T, "INVENTORY", `คลัง ${RAND}`)).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี ${RAND}`)).id;
    S.POSX = (await sysSvc.createSystem(T2, "POS", `POS T2 ${RAND}`)).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: `ร้านออเดอร์คิวซี ${RAND} จำกัด`, taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.POS, U.B);
    await sysSvc.linkUnit(T, S.INV, U.A);
    await sysSvc.linkUnit(T2, S.POSX, U.X);
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  // ผู้ใช้ + Membership จริง
  const spec: [string, () => string, string, () => string[], Record<string, boolean>][] = [
    ["OWNER", () => T, "OWNER", () => ["*"], {}],
    ["MGR", () => T, "MANAGER", () => [U.A, U.B, U.S, U.S2].map((x) => x ?? "-"), {}],
    ["STAFF", () => T, "STAFF", () => [U.A ?? "-", U.S ?? "-"], { "pos.sale.create": true }],
    ["STAFF2", () => T, "STAFF", () => [U.A ?? "-", U.S ?? "-"], { "pos.sale.create": true, "pos.order.accept": true }],
    ["STAFFR", () => T, "STAFF", () => [U.A ?? "-"], { "pos.sale.read": true }],
    ["NOPERM", () => T, "STAFF", () => [U.A ?? "-"], {}],
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
  const DEV1 = `qc28${RAND}d1`;
  const DEV2 = `qc28${RAND}d2`;
  const ctxU = (u: string, dev?: string): Any => ({ tenantId: u === "X" ? T2 : T, systemId: (u === "X" ? S.POSX : S.POS) ?? "none", unitId: U[u] ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const sctx = (u: string): Any => ({ tenantId: u === "N" ? T3 : T, unitId: U[u] ?? "none", actorUserId: uid("OWNER") });
  const invCtx = (): Any => ({ tenantId: T, systemId: S.INV ?? "none", actorUserId: uid("OWNER") });
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? r?.reason ?? "", 80)}`);
    return r;
  };
  let keyN = 0;
  const newKey = (pfx = "k") => `${KEY_PREFIX}-${pfx}-${++keyN}`;

  // ─── ช่องทาง ───
  if (!fx) {
    try {
      const ens = async (u: string): Promise<Any[]> => {
        const r = await call(chMod, "ensureUnitChannels", P, { tenantId: u === "X" ? T2 : T, systemId: u === "X" ? S.POSX : S.POS, unitId: U[u] });
        if (!Array.isArray(r)) throw new Error(`ensureUnitChannels ${u}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
        return r;
      };
      for (const u of ["A", "B", "S", "S2", "L", "X"]) for (const c of await ens(u)) CH[`${c.code}_${u}`] = c.id;
      const save = async (alias: string, u: string, actor: string, input: Any) => {
        const r = must(`saveChannel ${alias}`, await call(chMod, "saveChannel", ctxU(u), A(actor), input));
        CH[alias] = String(r.channel?.id ?? "");
      };
      await save("LM", "A", "OWNER", { code: "LINEMAN", name: `LINE MAN ${RAND}`, commissionBp: 3000 });
      await save("GB", "A", "OWNER", { code: "GRAB", name: `Grab ${RAND}`, payout: "PLATFORM", commissionBp: 2500, commissionFixedSatang: 200, commissionVatBp: 700 });
      await save("AG", "A", "OWNER", { code: "CUSTOM_AGENT", name: `ตัวแทน ${RAND}`, payout: "DIRECT", commissionBp: 1000 });
      await save("OLD", "A", "OWNER", { code: "CUSTOM_OLD", name: `เลิกใช้ ${RAND}`, payout: "DIRECT" });
      must("archive OLD", await call(chMod, "archiveChannel", ctxU("A"), A("OWNER"), { id: CH.OLD }));
      await save("LM_B", "B", "OWNER", { code: "LINEMAN", name: `LINE MAN B ${RAND}`, commissionBp: 3000 });
      await save("LM_X", "X", "OWNER2", { code: "LINEMAN", name: `LINE MAN T2 ${RAND}`, commissionBp: 3000 });
    } catch (e) {
      fx = `ช่องทาง:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── สินค้า (แคตตาล็อก + คลัง) ───
  const rowOf = async (invId: string): Promise<string> => String((await P.posProduct.findFirst({ where: { tenantId: T, systemId: S.POS, invItemId: invId }, select: { id: true } }).catch(() => null))?.id ?? "");
  if (!fx) {
    try {
      const grp = must("createOptionGroup ไข่", await call(catalog, "createOptionGroup", cc("OWNER"), { unitId: U.A, name: `ไข่ ${RAND}`, minSelect: 0, maxSelect: 1, choices: [{ name: "ไม่ใส่ไข่", priceDelta: 0 }, { name: "ไข่ดาว", priceDelta: 1000 }] }));
      const oth = must("createOptionGroup อื่น", await call(catalog, "createOptionGroup", cc("OWNER"), { unitId: U.A, name: `อื่น ${RAND}`, minSelect: 0, maxSelect: 1, choices: [{ name: "X", priceDelta: 0 }] }));
      for (const c of (await P.menuOptionChoice.findMany({ where: { tenantId: T, groupId: { in: [grp.id, oth.id] } } })) as Any[]) CHO[c.name === "ไม่ใส่ไข่" ? "noegg" : c.name === "ไข่ดาว" ? "fried" : "other"] = c.id;
      PR.padthai = String(must("createProduct ผัดไทย", await call(catalog, "createProduct", cc("OWNER"), { name: `ผัดไทยกุ้ง ${RAND}`, kind: "MENU", basePriceSatang: 12000 }))?.id ?? "");
      PR.tomyum = String(must("createProduct ต้มยำ", await call(catalog, "createProduct", cc("OWNER"), { name: `ต้มยำ ${RAND}`, kind: "MENU", basePriceSatang: 11000 }))?.id ?? "");
      must("optionGroups ผัดไทย", await call(catalog, "setProductOptionGroups", cc("OWNER"), PR.padthai, [grp.id]));
      const mkInv = async (key: string, name: string, qty: number, cost: number, price: number) => {
        const it = await invSvc.createItem(invCtx(), { sku: `${KEY_PREFIX}-${key}`, name: `${name} ${RAND}`, unitLabel: "ชิ้น", costSatang: cost });
        INV[key] = it.id;
        if (qty > 0) await invSvc.receive(invCtx(), { itemId: it.id, qty, costSatang: cost, idempotencyKey: `${KEY_PREFIX}-recv-${key}` });
        PR[key] = await rowOf(it.id);
        if (!PR[key]) throw new Error(`${key} ไม่มีแถว PRODUCT (P1.1b)`);
        if (price >= 0) must(`setPrice ${key}`, await call(catalog, "setPrice", cc("OWNER"), PR[key], price));
      };
      await mkInv("water", "น้ำเปล่า", 100, 400, 1000);
      await mkInv("salt", "ไข่เค็ม", 1, 500, 2000);
      await mkInv("tee", "เสื้อยืด", 50, 8000, 20000);
      await mkInv("cup", "แก้วน้ำ", 50, 3000, 8000);
      await mkInv("rice", "ข้าวสาร", 100, 100, -1);
      await mkInv("basil", "ใบกะเพรา", 100, 50, -1);
      await mkInv("l1", "เสื้อ L1", 50, 8000, -1);
    } catch (e) {
      fx = `สินค้า:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── เว็บร้าน (ShopProduct ผ่านประตูเดิม) ───
  if (!fx) {
    try {
      SP.tee = String((await shop.createProduct(sctx("S"), { name: `เสื้อ ${RAND}`, priceSatang: 25000, invItemId: INV.tee }))?.id ?? "");
      SP.hat = String((await shop.createProduct(sctx("S"), { name: `หมวก ${RAND}`, priceSatang: 15000 }))?.id ?? "");
      SP.cupS = String((await shop.createProduct(sctx("S"), { name: `แก้ว S ${RAND}`, priceSatang: 9000, invItemId: INV.cup }))?.id ?? "");
      SP.cupS2 = String((await shop.createProduct(sctx("S2"), { name: `แก้ว S2 ${RAND}`, priceSatang: 9500, invItemId: INV.cup }))?.id ?? "");
      SP.lTee = String((await shop.createProduct(sctx("L"), { name: `เสื้อยืดดำ ${RAND}`, priceSatang: 25000, invItemId: INV.l1 }))?.id ?? "");
      SP.lHat = String((await shop.createProduct(sctx("L"), { name: `หมวก L ${RAND}`, priceSatang: 15000 }))?.id ?? "");
      SP.n = String((await shop.createProduct(sctx("N"), { name: `ของ ${RAND}`, priceSatang: 1000 }))?.id ?? "");
      for (const k of Object.keys(SP)) if (!SP[k]) throw new Error(`ShopProduct ${k} ไม่ได้ id`);
    } catch (e) {
      fx = `เว็บร้าน:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── ราคาช่องทาง (P2.2) · สูตร BOM (P2.3) — ไม่หยุดชุด ───
  const setCp = async (productId: string, rows: Any[]): Promise<Any> => call(catalog, "setChannelPrices", cc("OWNER"), { productId, rows });
  if (!fx) {
    const r1 = await setCp(PR.padthai!, [{ channelCode: "LINEMAN", unitId: null, priceSatang: 15000 }]);
    if (r1?.ok === false) soft.push(`ราคา LINEMAN ผัดไทย: ${codeOf(r1)}`);
    const r2 = await setCp(PR.tomyum!, [{ channelCode: "GRAB", unitId: null, priceSatang: null, notSold: true }]);
    if (r2?.ok === false) soft.push(`notSold GRAB ต้มยำ: ${codeOf(r2)}`);
    if (HAS_P23) {
      const k = await call(catalog, "createProduct", cc("OWNER"), { name: `ผัดกะเพรา ${RAND}`, kind: "MENU", basePriceSatang: 9000 });
      PR.kaprao = String(k?.id ?? "");
      const rr = await call(catalog, "setRecipe", cc("OWNER"), PR.kaprao, [{ invItemId: INV.rice, qty: 1 }, { invItemId: INV.basil, qty: 2 }]);
      if (rr?.ok === false || !PR.kaprao) soft.push(`สูตรผัดกะเพรา: ${codeOf(rr)}`);
    } else soft.push("P2.3 ยังไม่ merge (ไม่มี recipe-shared.ts) — ข้ามส่วน BOM ของ S3");
    const ps = await call(paySetMod, "updatePosPaymentSettings", { tenantId: T, systemId: S.POS }, A("OWNER"), { serviceCharge: { enabled: true, rateBp: 1000 } });
    if (ps?.ok === false) fx = `ค่าบริการ POS: ${codeOf(ps)}`;
    const bp = await call(setGenMod, "updatePosUnitStockPolicy", { tenantId: T, systemId: S.POS }, A("OWNER"), { unitId: U.A, oversellPolicy: "BLOCK" });
    if (bp?.ok === false) fx = `นโยบาย BLOCK: ${codeOf(bp)} ${short(bp?.message ?? "", 60)}`;
  }
  // ─── เครื่อง + กะ (สาขา A) ───
  if (!fx) {
    for (const [k, dev] of [["1", DEV1], ["2", DEV2]] as const) {
      const rg = await call(devMod, "registerDevice", ctxU("A"), A("OWNER"), { name: `เคาน์เตอร์ QC P2.8 ${k}`, deviceCode: dev });
      if (rg?.ok !== true) console.log(`  ⚠️  registerDevice ${k}: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
      const o = await call(shiftMod, "openShift", ctxU("A", dev), A("OWNER"), { deviceId: dev, deviceLabel: `เคาน์เตอร์ QC P2.8 ${k}`, floatSatang: 0 });
      if (o?.ok !== true) fx = `เปิดกะ ${k}: ${codeOf(o)} ${short(o?.message ?? "", 80)}`;
      else SHIFT[k] = String(o.shift?.id ?? "");
    }
  }
  if (fx) console.log(`  ⚠️  fixture: ${fx}`);
  if (soft.length) console.log(`  ℹ️  fixture ส่วนที่ขึ้นกับใบอื่น: ${soft.join(" · ")}`);
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NO = () => (PO ? "" : `${MISSING} โมเดล PosOrder · `) + (ord ? "" : `${MISSING} facade orders · `);
  const SOFT = () => (soft.length ? ` (fixture: ${soft.join(" · ")})` : "");
  const good = (p: string[]) => !fx && NO() === "" && p.length === 0;
  const why = (p: string[]) => FX(NO() + (P8(p) || "ครบ"));

  // ─── ตัวช่วย ───
  const O = (fn: string, ...args: unknown[]) => call(ord, fn, ...args);
  const CUST = { name: "คุณเอก", phone: "0812341234" };
  const ln = (key: string, qty: number, o: { choices?: string[]; note?: string } = {}): Any => ({
    productId: PR[key] ?? `none-${key}`,
    qty,
    ...(o.choices ? { choiceIds: o.choices.map((c) => CHO[c] ?? `none-${c}`) } : {}),
    ...(o.note ? { note: o.note } : {}),
  });
  const LM_LINES = (): Any[] => [ln("padthai", 2, { choices: ["noegg"], note: "ไม่ใส่ผักชี" }), ln("tomyum", 1), ln("water", 1)];
  const ingest = (u: string, actor: string, input: Any, dev?: string) => O("ingestOrder", ctxU(u, dev), A(actor), input);
  const lmInput = (ref: string, o: Any = {}): Any => ({ channelId: CH.LM, externalRef: ref, idempotencyKey: newKey("lm"), lines: LM_LINES(), customer: CUST, fulfilment: "DELIVERY", address: "คอนโด QC ชั้น 8", note: "ขอช้อนส้อม", ...o });
  const mk = async (label: string, u: string, actor: string, input: Any, dev?: string): Promise<{ id: string; r: Any }> => {
    const r = fx ? { ok: false, code: "FIXTURE" } : await ingest(u, actor, input, dev);
    const id = r?.ok === true ? String(r.orderId ?? "") : "";
    if (!id) console.log(`  ⚠️  ออเดอร์ ${label}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    return { id, r };
  };
  const row = async (id: string): Promise<Any> => (PO && id ? PO.findUnique({ where: { id } }).catch(() => null) : null);
  const linesOf = async (id: string): Promise<Any[]> => (POL && id ? ((await POL.findMany({ where: { orderId: id } }).catch(() => [])) as Any[]) : []);
  const evsOf = async (id: string): Promise<Any[]> => (POE && id ? ((await POE.findMany({ where: { orderId: id }, orderBy: [{ at: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]) : []);
  const obx = async (type: string, orderId?: string): Promise<Any[]> =>
    ((await P.outboxEvent.findMany({ where: { tenantId: { in: [T, T2].filter(Boolean) }, type } }).catch(() => [])) as Any[]).filter((e) => orderId === undefined || e.payload?.orderId === orderId);
  const obxOrder = async (orderId: string): Promise<Any[]> =>
    ((await P.outboxEvent.findMany({ where: { tenantId: T, type: { startsWith: "pos.order." } } }).catch(() => [])) as Any[]).filter((e) => e.payload?.orderId === orderId);
  const salesOf = async (orderId: string): Promise<Any[]> =>
    orderId ? ((await P.posSale.findMany({ where: { tenantId: T, sourceModule: "POS", sourceId: orderId }, include: { lines: { include: { options: true } }, payments: true } }).catch(() => [])) as Any[]) : [];
  const counts = async (): Promise<Record<string, number>> => ({
    order: PO ? Number(await PO.count({ where: { tenantId: { in: [T, T2] } } }).catch(() => -1)) : -1,
    event: POE ? Number(await POE.count({ where: { tenantId: { in: [T, T2] } } }).catch(() => -1)) : -1,
    sale: Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1)),
    outbox: Number(await P.outboxEvent.count({ where: { tenantId: T, type: { startsWith: "pos.order." } } }).catch(() => -1)),
  });
  const sameCounts = (a: Record<string, number>, b: Record<string, number>) => Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => `${k} ${a[k]}→${b[k]}`);
  const xminOf = async (table: string, ids: string[]): Promise<string[]> => {
    if (!ids.filter(Boolean).length) return [];
    const r = (await P.$queryRawUnsafe(`SELECT xmin::text AS x FROM "${table}" WHERE id = ANY($1::text[])`, ids.filter(Boolean)).catch(() => [])) as Any[];
    return r.map((x) => String(x.x));
  };
  type Line = { code: string; debit: number; credit: number };
  type Entry = { key: string; status: string; lines: Line[] };
  const jv = async (refIds: string[]): Promise<Entry[]> => {
    const ids = refIds.filter(Boolean);
    if (!ids.length) return [];
    const es = (await P.accountJournalEntry.findMany({ where: { tenantId: T, refType: "PosSale", refId: { in: ids } }, include: { lines: { include: { account: { select: { code: true } } } } }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[];
    return es.map((e: Any) => ({ key: String(e.idempotencyKey ?? ""), status: String(e.status), lines: (e.lines ?? []).map((l: Any) => ({ code: String(l.account?.code ?? "?"), debit: l.debit, credit: l.credit })) }));
  };
  const shape = (e: Entry | undefined): string => {
    if (!e) return "—";
    const m = new Map<string, [number, number]>();
    for (const l of e.lines) {
      const a = m.get(l.code) ?? [0, 0];
      m.set(l.code, [a[0] + l.debit, a[1] + l.credit]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([c, [d, k]]) => `${c}:${d}/${k}`).join(" ");
  };
  const net = (es: Entry[]): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const l of es.flatMap((e) => e.lines)) m[l.code] = (m[l.code] ?? 0) + l.debit - l.credit;
    return m;
  };
  const K = (id: string, ev: string) => `PosSale#${id}#${ev}`;
  const settings = (u: string, actor: string, input: Any) => O("setChannelOrderSettings", ctxU(u), A(actor), input);
  const ordStr = (o: Any) => short({ status: o?.status, pay: o?.paymentState, v: o?.version, sale: o?.saleId ? "มี" : null }, 120);

  // ════════ L1 เว็บร้านเดิม (PAR · ไม่ขึ้นกับ P2.8) ════════
  await step("L1", async () => {
    const p: string[] = [];
    if (fx) p.push(`fixture ${fx}`);
    else {
      const c = sctx("L");
      const od = await shop.createOrder(c, { customerName: "คุณลูกค้า", customerPhone: "0899999999", lines: [{ productId: SP.lTee, qty: 2 }, { productId: SP.lHat, qty: 1 }] });
      const so = await P.shopOrder.findUnique({ where: { id: od.id } });
      if (od.totalSatang !== 65000 || !/^SO-\d{4}$/.test(String(od.code)) || so?.status !== "PENDING_PAYMENT") p.push(`createOrder ${short(od, 80)} ${so?.status}`);
      const sl = (await P.shopOrderLine.findMany({ where: { orderId: od.id } })) as Any[];
      if (sl.length !== 2 || sl.find((l: Any) => l.productId === SP.lTee)?.unitPriceSatang !== 25000) p.push(`บรรทัด ${sl.length} · ${short(sl.map((l: Any) => l.unitPriceSatang), 40)}`);
      const cf = await shop.confirmOrderPaid(c, od.id);
      const after = await P.shopOrder.findUnique({ where: { id: od.id } });
      const sale = await P.posSale.findFirst({ where: { tenantId: T, idempotencyKey: `ecom-${od.id}` }, include: { payments: true } });
      if (cf?.ok !== true || after?.status !== "PAID" || sale?.grandTotalSatang !== 65000 || sale?.status !== "PAID" || after?.posSaleId !== sale?.id || sale?.sourceModule !== "ECOM") p.push(`confirm ${short(cf, 40)} ${after?.status} ${sale?.grandTotalSatang} ${sale?.sourceModule}`);
      if (sale && (sale.payments?.length !== 1 || sale.payments[0]?.type !== "PROMPTPAY" || sale.payments[0]?.amountSatang !== 65000)) p.push(`PosPayment ${short(sale.payments?.map((x: Any) => [x.type, x.amountSatang]), 60)}`);
      const oh = Number((await P.invItem.findUnique({ where: { id: INV.l1 } }))?.onHand);
      if (oh !== 48) p.push(`สต็อก ${oh} (คาด 48)`);
      const again = await shop.confirmOrderPaid(c, od.id);
      if (again?.ok !== false || (await P.posSale.count({ where: { tenantId: T, idempotencyKey: `ecom-${od.id}` } })) !== 1) p.push("ยืนยันซ้ำไม่ใช่ false/บิลไม่ใช่ 1");
      const od2 = await shop.createOrder(c, { customerName: "ข", customerPhone: "0800000002", lines: [{ productId: SP.lHat, qty: 1 }] });
      if ((await shop.cancelOrder(c, od2.id)) !== true || (await shop.confirmOrderPaid(c, od2.id))?.ok !== false) p.push("cancel PENDING ไม่ใช่ true/false");
      const rf = await shop.refundOrder(c, od.id);
      const s2 = sale ? await P.posSale.findUnique({ where: { id: sale.id } }) : null;
      const oh2 = Number((await P.invItem.findUnique({ where: { id: INV.l1 } }))?.onHand);
      if (rf?.ok !== true || s2?.status !== "VOIDED" || oh2 !== 50) p.push(`refund ${short(rf, 40)} บิล ${s2?.status} สต็อก ${oh2}`);
    }
    chk("L1", p.length === 0, "65000 · PROMPTPAY · 50→48 · ยืนยันซ้ำ false · cancel · refund 50", P8(p) || "ครบ");
  });

  // ════════ W2 ร้านไม่มี POS ════════
  await step("W2", async () => {
    const p: string[] = [];
    let od: Any = null;
    try {
      od = fx ? null : await shop.createOrder(sctx("N"), { customerName: "คุณไม่มีPOS", customerPhone: "0811110000", lines: [{ productId: SP.n, qty: 1 }] });
    } catch (e) {
      p.push(`createOrder throw: ${(e as Error).message.slice(0, 80)}`);
    }
    if (!fx && !od?.id && !p.length) p.push("ไม่ได้ ShopOrder");
    const n = PO ? Number(await PO.count({ where: { tenantId: T3 } }).catch(() => -1)) : -1;
    if (n !== 0) p.push(`PosOrder ของ T3 = ${n} (คาด 0)`);
    chk("W2", !fx && PO && p.length === 0, "ShopOrder ได้ · PosOrder 0 · ไม่ throw", FX((PO ? "" : `${MISSING} โมเดล PosOrder · `) + (P8(p) || `ShopOrder ${od?.code ?? "-"}`)));
  });

  // ════════ I รับออเดอร์ ════════
  const I1_IN = lmInput("LM-48213", { startStatus: "ACCEPTED" });
  const i1 = await mk("LM-48213", "A", "STAFF", I1_IN, DEV1);
  ORD.LM = i1.id;
  // ORACLE-EDIT (P2.8 fix รอบ 1 · มติผู้คุม 3): ระบายคิวให้ pos.sale.paid ของบิล LM-48213 (PAID + COMMISSION) ลงก่อนข้อถัดไปเขียน JV อื่น —
  //   เลข JV ของบัญชี (nextJournalNo = count+1) ชนกันเมื่อเขียนพร้อมกัน (เรื่องของเจ้าของบัญชี · POS-OWNER-PENDING) ⇒ S2 อ่าน JV ได้แน่นอน
  await drain();
  await step("I1", async () => {
    const p: string[] = [];
    const r = i1.r;
    if (r?.ok !== true) p.push(`ingestOrder → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else if (r.duplicated !== false || typeof r.saleId !== "string" || !r.saleId) p.push(`ผล ${short({ duplicated: r.duplicated, saleId: r.saleId }, 80)}`);
    const o = await row(ORD.LM!);
    if (ORD.LM && !o) p.push("ไม่มีแถว PosOrder");
    if (o) {
      const want: Record<string, unknown> = { tenantId: T, systemId: S.POS, unitId: U.A, channelId: CH.LM, channelCode: "LINEMAN", adapter: "MANUAL", externalRef: "LM-48213", status: "ACCEPTED", paymentState: "PLATFORM_PAID", fulfilment: "DELIVERY", customerName: "คุณเอก", customerPhone: "0812341234", totalSatang: 42000, acceptedByUserId: uid("STAFF"), createdByUserId: uid("STAFF"), prepMinutes: 15 };
      for (const [k, v] of Object.entries(want)) if (o[k] !== v) p.push(`${k} = ${short(o[k], 40)} (คาด ${short(v, 40)})`);
      if (!/^[A-Z0-9]{1,6}-\d{4}$/.test(String(o.code ?? ""))) p.push(`code ${short(o.code, 20)} (คาด <PFX>-NNNN)`);
      if (!o.saleId || o.saleId !== r?.saleId) p.push(`saleId ${short(o.saleId, 30)}`);
      if (!o.acceptedAt || !o.receivedAt) p.push("acceptedAt/receivedAt ว่าง");
      if (typeof o.version !== "number" || o.version < 1) p.push(`version ${short(o.version)}`);
      const ls = await linesOf(ORD.LM!);
      if (ls.length !== 3 || sum(ls.map((l: Any) => Number(l.lineTotalSatang))) !== 42000) p.push(`บรรทัด ${ls.length} Σ ${sum(ls.map((l: Any) => Number(l.lineTotalSatang)))}`);
      const pt = ls.find((l: Any) => l.productId === PR.padthai);
      if (!pt || pt.qty !== 2 || pt.note !== "ไม่ใส่ผักชี") p.push(`บรรทัดผัดไทย ${short(pt && { qty: pt.qty, note: pt.note }, 60)}`);
    }
    chk("I1", good(p), "ACCEPTED + บิล · ฟิลด์ R1 ครบ · 3 บรรทัด 42000", why(p) + SOFT());
  });
  await step("I2", async () => {
    const p: string[] = [];
    const before = await counts();
    // เล่นซ้ำ (ช่องทาง, ref) 2 รอบ: ข้อมูลเดิมทุกตัว (คีย์เดิม) + คีย์ใหม่บน ref เดิม (unique ของ ref ชนะ)
    const replays: Any[] = fx ? [] : [await ingest("A", "STAFF", I1_IN, DEV1), await ingest("A", "STAFF", { ...I1_IN, idempotencyKey: newKey("lm-rep") }, DEV1)];
    for (const r of replays) if (r?.ok !== true || r.duplicated !== true || r.orderId !== ORD.LM) p.push(`ref เดิม → ${codeOf(r)} dup ${short(r?.duplicated)} ${r?.orderId === ORD.LM ? "id เดิม" : "id อื่น"}`);
    const mid = await counts();
    const d1 = sameCounts(before, mid);
    if (d1.length) p.push(`เล่นซ้ำเขียนเพิ่ม: ${d1.join(", ")}`);
    // 10 พร้อมกัน ref ใหม่ คีย์เดียว
    const key = newKey("par");
    const inp = lmInput("LM-48299", { startStatus: "ACCEPTED", idempotencyKey: key });
    const rs: Any[] = fx ? [] : await Promise.all(Array.from({ length: 10 }, () => ingest("A", "STAFF", inp, DEV1)));
    const ids = [...new Set(rs.filter((r) => r?.ok === true).map((r) => String(r.orderId)))];
    const dups = rs.filter((r) => r?.ok === true && r.duplicated === true).length;
    if (rs.filter((r) => r?.ok === true).length !== 10) p.push(`ok ${rs.filter((r) => r?.ok === true).length}/10 (${[...new Set(rs.filter((r) => r?.ok !== true).map(codeOf))].join(",")})`);
    if (ids.length !== 1) p.push(`orderId ต่างกัน ${ids.length}`);
    if (dups !== 9) p.push(`duplicated ${dups} (คาด 9)`);
    const oid = ids[0] ?? "";
    ORD.PAR = oid;
    const after = await counts();
    if (after.order - mid.order !== 1) p.push(`PosOrder +${after.order - mid.order} (คาด 1)`);
    const ss = await salesOf(oid);
    if (ss.length !== 1 || ss[0]?.idempotencyKey !== `posorder-${oid}`) p.push(`บิล ${ss.length} คีย์ ${short(ss[0]?.idempotencyKey, 40)}`);
    for (const t of ["pos.order.received", "pos.order.accepted"]) {
      const n = (await obx(t, oid)).length;
      if (n !== 1) p.push(`${t} ${n} (คาด 1)`);
    }
    const paid = ss[0] ? (await obx("pos.sale.paid")).filter((e) => e.payload?.saleId === ss[0].id).length : 0;
    if (paid !== 1) p.push(`pos.sale.paid ${paid} (คาด 1)`);
    chk("I2", good(p), "ref เดิม = ออเดอร์เดิม · 10 พร้อมกัน = 1 ออเดอร์ 1 บิล 1 event ต่อชนิด", why(p));
  });
  await step("I3", async () => {
    const p: string[] = [];
    const before = await counts();
    const r1 = fx ? null : await ingest("A", "STAFF", lmInput("LM-48213", { startStatus: "ACCEPTED", lines: [ln("tomyum", 2)] }), DEV1);
    if (!refused(r1, "IDEMPOTENCY_CONFLICT")) p.push(`ref เดิม บรรทัดต่าง → ${codeOf(r1)}`);
    const k = newKey("conf");
    // ORACLE-EDIT (P2.8 fix รอบ 1 · มติผู้คุม 2): ออเดอร์ตั้งต้นเริ่ม NEW — MANUAL ปริยาย ACCEPTED (CD2) จะเปิดบิลซึ่งไม่ใช่สิ่งที่ข้อนี้วัด ·
    //   การนับบิล before→after ยังครอบทั้งข้อ (คำปฏิเสธ IDEMPOTENCY_CONFLICT ต้องไม่สร้างบิล/ออเดอร์/outbox)
    const r2a = fx ? null : await ingest("A", "STAFF", lmInput("LM-48300", { idempotencyKey: k, lines: [ln("tomyum", 1)], startStatus: "NEW" }), DEV1);
    const mid = await counts();
    const r2 = fx ? null : await ingest("A", "STAFF", lmInput("LM-48399", { idempotencyKey: k, lines: [ln("tomyum", 3)] }), DEV1);
    if (r2a?.ok !== true) p.push(`(ตั้งต้น) LM-48300 → ${codeOf(r2a)}`);
    if (!refused(r2, "IDEMPOTENCY_CONFLICT")) p.push(`คีย์เดิม บรรทัดต่าง → ${codeOf(r2)}`);
    const after = await counts();
    const d = sameCounts(mid, after);
    if (d.length) p.push(`ปฏิเสธแล้วยังเขียน: ${d.join(", ")}`);
    if (before.sale !== after.sale) p.push(`บิล ${before.sale}→${after.sale}`);
    chk("I3", good(p), "IDEMPOTENCY_CONFLICT ×2 · ไม่เขียน", why(p));
  });
  await step("I4", async () => {
    const p: string[] = [];
    const ls = await linesOf(ORD.LM!);
    const pt = ls.find((l: Any) => l.productId === PR.padthai);
    const tm = ls.find((l: Any) => l.productId === PR.tomyum);
    if (!pt || pt.unitPriceSatang !== 15000 || pt.priceSource !== "CHANNEL") p.push(`ผัดไทย ${short(pt && { u: pt.unitPriceSatang, s: pt.priceSource }, 60)} (คาด 15000 CHANNEL)`);
    if (!tm || tm.unitPriceSatang !== 11000 || tm.priceSource !== "BASE") p.push(`ต้มยำ ${short(tm && { u: tm.unitPriceSatang, s: tm.priceSource }, 60)} (คาด 11000 BASE)`);
    const opts = Array.isArray(pt?.options) ? pt.options : [];
    if (opts.length !== 1 || opts[0]?.choiceId !== CHO.noegg || opts[0]?.choiceName !== "ไม่ใส่ไข่" || opts[0]?.priceDeltaSatang !== 0) p.push(`options ${short(opts, 100)}`);
    const before = short(ls.map((l: Any) => [l.id, l.unitPriceSatang, l.lineTotalSatang]).sort(), 2000);
    const up = fx ? null : await setCp(PR.padthai!, [{ channelCode: "LINEMAN", unitId: null, priceSatang: 16000 }]);
    if (up?.ok === false) p.push(`แก้ราคา → ${codeOf(up)}`);
    const after = short((await linesOf(ORD.LM!)).map((l: Any) => [l.id, l.unitPriceSatang, l.lineTotalSatang]).sort(), 2000);
    if (before !== after) p.push("บรรทัดเดิมเปลี่ยนหลังแก้ราคา");
    const g = fx ? null : await O("getOrder", ctxU("A"), A("MGR"), { id: ORD.LM });
    const gp = (g?.order?.lines ?? []).find((l: Any) => l.productId === PR.padthai);
    if (gp?.unitPriceSatang !== 15000) p.push(`getOrder ผัดไทย ${short(gp?.unitPriceSatang)} (คาด 15000)`);
    const n = await mk("LM-48214", "A", "STAFF", lmInput("LM-48214", { startStatus: "NEW" }));
    ORD.LM2 = n.id;
    const np = (await linesOf(n.id)).find((l: Any) => l.productId === PR.padthai);
    if (np?.unitPriceSatang !== 16000 || np?.priceSource !== "CHANNEL") p.push(`ออเดอร์ใหม่ ผัดไทย ${short(np && { u: np.unitPriceSatang, s: np.priceSource }, 60)} (คาด 16000 CHANNEL)`);
    if (!fx) await setCp(PR.padthai!, [{ channelCode: "LINEMAN", unitId: null, priceSatang: 15000 }]);
    chk("I4", good(p), "แช่แข็ง 15000 CHANNEL · options · ใหม่ 16000", why(p) + SOFT());
  });
  await step("I5", async () => {
    const p: string[] = [];
    const before = await counts();
    const r1 = fx ? null : await ingest("A", "STAFF", { channelId: CH.GB, externalRef: "GF-NS1", idempotencyKey: newKey("ns"), lines: [ln("padthai", 1), ln("tomyum", 1)], customer: CUST, fulfilment: "PICKUP" });
    if (!refused(r1, "CHANNEL_NOT_SOLD") || r1?.lineIndex !== 1) p.push(`notSold → ${codeOf(r1)} lineIndex ${short(r1?.lineIndex)}`);
    const r2 = fx ? null : await ingest("A", "STAFF", { channelId: CH.GB, externalRef: "GF-OPT", idempotencyKey: newKey("opt"), lines: [ln("padthai", 1, { choices: ["other"] })], customer: CUST, fulfilment: "PICKUP" });
    if (!refused(r2, "OPTIONS_INVALID")) p.push(`ตัวเลือกกลุ่มอื่น → ${codeOf(r2)}`);
    const d = sameCounts(before, await counts());
    if (d.length) p.push(`ปฏิเสธแล้วยังเขียน: ${d.join(", ")}`);
    chk("I5", good(p), "CHANNEL_NOT_SOLD lineIndex 1 · OPTIONS_INVALID · ไม่เขียน", why(p) + SOFT());
  });
  await step("I6", async () => {
    const p: string[] = [];
    const before = await counts();
    const tries: [string, Any][] = [
      ["สาขา B", { channelId: CH.LM_B }],
      ["ร้าน T2", { channelId: CH.LM_X }],
      ["archive", { channelId: CH.OLD }],
      ["id มั่ว", { channelId: "ch_nope_qc28" }],
      ["code ไม่มี", { channelCode: "NOPE_QC" }],
    ];
    for (const [lbl, ch] of tries) {
      const r = fx ? null : await ingest("A", "OWNER", { ...ch, externalRef: `INV-${lbl.length}`, idempotencyKey: newKey("inv"), lines: [ln("tomyum", 1)], customer: CUST, fulfilment: "PICKUP", startStatus: "NEW" });
      if (!refused(r, "CHANNEL_INVALID")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const d = sameCounts(before, await counts());
    if (d.length) p.push(`ปฏิเสธแล้วยังเขียน: ${d.join(", ")}`);
    chk("I6", good(p), "CHANNEL_INVALID ×5 · ไม่เขียน", why(p));
  });
  await step("I7", async () => {
    const p: string[] = [];
    const until = new Date(Date.now() + 30 * MIN).toISOString();
    const s1 = fx ? null : await settings("A", "MGR", { channelId: CH.CHAT_A, pausedUntil: until });
    const s2 = fx ? null : await settings("S", "MGR", { channelId: CH.WEB_S, pausedUntil: until });
    const s3 = fx ? null : await settings("A", "MGR", { channelId: CH.LM, pausedUntil: until });
    for (const [l, s] of [["CHAT", s1], ["WEB", s2], ["LINEMAN", s3]] as const) if (s?.ok !== true) p.push(`พัก ${l} → ${codeOf(s)}`);
    const before = await counts();
    const rc = fx ? null : await ingest("A", "STAFF", { channelId: CH.CHAT_A, idempotencyKey: newKey("pc"), lines: [ln("tomyum", 1)], customer: CUST, fulfilment: "PICKUP", paymentState: "PAY_ON_PICKUP" });
    if (!refused(rc, "CHANNEL_PAUSED")) p.push(`CHAT ที่พัก → ${codeOf(rc)}`);
    let rw: Any = null;
    if (!fx && typeof ord?.ingestInTx === "function")
      rw = await P.$transaction((tx: Any) => call(ord, "ingestInTx", tx, { tenantId: T, unitId: U.S }, { channelCode: "WEB", externalRef: "SO-QCP", idempotencyKey: newKey("pw"), lines: [{ productId: PR.tee, qty: 1 }], customer: { name: "คุณเว็บ", phone: "0811112222" }, fulfilment: "PICKUP" })).catch((e: Error) => ({ ok: false, code: errCode(e), message: e.message }));
    else rw = { ok: false, code: "MISSING:ingestInTx" };
    if (!refused(rw, "CHANNEL_PAUSED")) p.push(`WEB ที่พัก (ingestInTx) → ${codeOf(rw)}`);
    const mid = await counts();
    if (sameCounts(before, mid).length) p.push(`พักแล้วยังเขียน: ${sameCounts(before, mid).join(", ")}`);
    const rl = await mk("LM-paused", "A", "STAFF", lmInput("LM-48305", { startStatus: "NEW" }));
    if (!rl.id) p.push(`LINEMAN (MANUAL) ที่พัก → ${codeOf(rl.r)} (คาด ok)`);
    ORD.PAUSED_LM = rl.id;
    for (const [u, ch] of [["A", CH.CHAT_A], ["S", CH.WEB_S], ["A", CH.LM]] as const) if (!fx) await settings(u, "MGR", { channelId: ch, pausedUntil: null });
    const sc = (await P.salesChannel.findMany({ where: { id: { in: [CH.CHAT_A, CH.WEB_S, CH.LM].filter(Boolean) } } }).catch(() => [])) as Any[];
    if (sc.some((c: Any) => c.pausedUntil !== null)) p.push("เลิกพักแล้ว pausedUntil ไม่ว่าง");
    chk("I7", good(p), "CHAT/WEB CHANNEL_PAUSED · MANUAL ok · เลิกพัก", why(p));
  });
  await step("I8", async () => {
    const p: string[] = [];
    const custom = { name: `ค่าส่งพิเศษ ${RAND}`, unitPriceSatang: 3000, qty: 1 };
    const before = await counts();
    const r1 = fx ? null : await ingest("A", "STAFF", { channelId: CH.LM, externalRef: "LM-CUS1", idempotencyKey: newKey("cus"), lines: [custom], customer: CUST, fulfilment: "DELIVERY", startStatus: "NEW" });
    if (!refused(r1, "PERMISSION_DENIED")) p.push(`STAFF บรรทัดกำหนดเอง → ${codeOf(r1)}`);
    const r3 = fx ? null : await ingest("A", "NOPERM", { channelId: CH.LM, externalRef: "LM-NOP1", idempotencyKey: newKey("nop"), lines: [ln("tomyum", 1)], customer: CUST, fulfilment: "DELIVERY", startStatus: "NEW" });
    if (!refused(r3, "PERMISSION_DENIED")) p.push(`NOPERM → ${codeOf(r3)}`);
    const r4 = fx ? null : await ingest("A", "OWNER", { channelId: CH.LM, externalRef: "LM-BIG1", idempotencyKey: newKey("big"), lines: Array.from({ length: 101 }, () => ln("tomyum", 1)), customer: CUST, fulfilment: "DELIVERY", startStatus: "NEW" });
    if (!refused(r4, "VALIDATION")) p.push(`101 บรรทัด → ${codeOf(r4)}`);
    const d = sameCounts(before, await counts());
    if (d.length) p.push(`ปฏิเสธแล้วยังเขียน: ${d.join(", ")}`);
    const ok = await mk("LM-CUS2", "A", "OWNER", { channelId: CH.LM, externalRef: "LM-CUS2", idempotencyKey: newKey("cus"), lines: [custom], customer: CUST, fulfilment: "DELIVERY", startStatus: "NEW" });
    const cl = (await linesOf(ok.id))[0];
    if (!ok.id) p.push(`OWNER → ${codeOf(ok.r)}`);
    else if (!cl || cl.productId !== null || cl.unitPriceSatang !== 3000 || cl.lineTotalSatang !== 3000) p.push(`บรรทัดกำหนดเอง ${short(cl && { p: cl.productId, u: cl.unitPriceSatang }, 60)}`);
    ORD.CUS = ok.id;
    chk("I8", good(p), "PERMISSION_DENIED ×2 · VALIDATION · OWNER ok", why(p));
  });

  await step("I9", async () => {
    const p: string[] = [];
    const setAvail = (productId: string, unitId: string, on: boolean) => call(catalog, "updateProduct", cc("OWNER"), productId, { availability: { [unitId]: on } });
    const shopCount = async () => Number(await P.shopOrder.count({ where: { tenantId: T, unitId: U.B } }).catch(() => -1));
    let spB = "";
    if (!fx)
      try {
        spB = String((await shop.createProduct(sctx("B"), { name: `ของปิดขาย ${RAND}`, priceSatang: 5000 }))?.id ?? "");
      } catch (e) {
        p.push(`(ตั้งต้น) สินค้าเว็บสาขา B throw ${(e as Error).message.slice(0, 60)}`);
      }
    const rowB = spB ? String((await P.shopProduct.findUnique({ where: { id: spB } }).catch(() => null))?.posProductId ?? "") : "";
    if (!fx && !rowB) p.push("(ตั้งต้น) สินค้าเว็บสาขา B ไม่มีแถวแคตตาล็อก");
    const before = await counts();
    const sb0 = await shopCount();
    const o1 = fx ? null : await setAvail(PR.tomyum!, U.A!, false);
    const o2 = fx || !rowB ? null : await setAvail(rowB, U.B!, false);
    for (const [l, o] of [["ต้มยำ A", o1], ["สินค้าเว็บ B", o2]] as const) if (o?.ok === false) p.push(`(ตั้งต้น) ปิดขาย ${l} → ${codeOf(o)}`);
    const r = fx ? null : await ingest("A", "STAFF", { channelId: CH.LM, externalRef: "LM-86A", idempotencyKey: newKey("86a"), lines: [ln("padthai", 1), ln("tomyum", 1)], customer: CUST, fulfilment: "DELIVERY", startStatus: "NEW" });
    if (!refused(r, "PRODUCT_UNAVAILABLE") || r?.lineIndex !== 1) p.push(`ingestOrder ต้มยำที่ปิดขาย → ${codeOf(r)} lineIndex ${short(r?.lineIndex)} (คาด PRODUCT_UNAVAILABLE 1)`);
    let webThrew = "";
    if (!fx && spB)
      try {
        const so = await shop.createOrder(sctx("B"), { customerName: "คุณปิดขาย", customerPhone: "0811118686", lines: [{ productId: spB, qty: 1 }] });
        p.push(`createOrder ของเว็บที่ปิดขายผ่าน (${short(so?.code, 20)}) — คาด throw`);
      } catch (e) {
        webThrew = (e as Error).message;
      }
    if (!fx && spB && !/หมด|ปิดขาย/.test(webThrew)) p.push(`createOrder throw ข้อความ ${short(webThrew, 60)} (คาดแจ้งว่าหมด/ปิดขาย)`);
    const mid = await counts();
    const d = sameCounts(before, mid);
    if (d.length) p.push(`ปฏิเสธแล้วยังเขียน: ${d.join(", ")}`);
    if ((await shopCount()) !== sb0) p.push(`ShopOrder สาขา B ${sb0}→${await shopCount()} (คาดไม่เพิ่ม)`);
    // positive control: เปิดขายคืน → รับได้ทั้งสองประตู
    if (!fx) await setAvail(PR.tomyum!, U.A!, true);
    if (!fx && rowB) await setAvail(rowB, U.B!, true);
    const ok1 = await mk("LM-86B", "A", "STAFF", { channelId: CH.LM, externalRef: "LM-86B", idempotencyKey: newKey("86b"), lines: [ln("padthai", 1), ln("tomyum", 1)], customer: CUST, fulfilment: "DELIVERY", startStatus: "NEW" });
    if (!ok1.id) p.push(`หลังเปิดขาย ingestOrder → ${codeOf(ok1.r)}`);
    if (!fx && spB)
      try {
        const so2 = await shop.createOrder(sctx("B"), { customerName: "คุณเปิดขาย", customerPhone: "0811118687", lines: [{ productId: spB, qty: 1 }] });
        const po = PO && so2?.id ? await PO.count({ where: { tenantId: T, shopOrderId: so2.id } }).catch(() => -1) : -1;
        if (po !== 1) p.push(`หลังเปิดขาย createOrder ได้ PosOrder ${po} (คาด 1)`);
      } catch (e) {
        p.push(`หลังเปิดขาย createOrder throw ${(e as Error).message.slice(0, 60)}`);
      }
    chk("I9", good(p), "PRODUCT_UNAVAILABLE lineIndex 1 · เว็บร้าน throw ไม่เขียน · เปิดคืนรับได้", why(p));
  });

  // ════════ A วงจร ════════
  const gb = await mk("GRAB ฿310", "A", "STAFF", { channelId: CH.GB, externalRef: "GF-31000", idempotencyKey: newKey("gb"), lines: [ln("padthai", 2), ln("water", 7)], customer: { name: "คุณบี", phone: "0899990001" }, fulfilment: "PICKUP", startStatus: "NEW" });
  ORD.GB = gb.id;
  await step("A1", async () => {
    const p: string[] = [];
    const o0 = await row(gb.id);
    if (gb.id && (o0?.status !== "NEW" || o0?.paymentState !== "PLATFORM_PAID" || o0?.saleId !== null || o0?.totalSatang !== 31000)) p.push(`หลังรับเข้า ${ordStr(o0)} ยอด ${short(o0?.totalSatang)} (คาด NEW PLATFORM_PAID ไม่มีบิล 31000)`);
    const v0 = Number(o0?.version);
    const steps: [string, string][] = [["acceptOrder", "ACCEPTED"], ["markPreparing", "PREPARING"], ["markReady", "READY"], ["handOver", "HANDED"]];
    for (const [fn, st] of steps) {
      const r = fx || !gb.id ? null : await O(fn, ctxU("A", DEV1), A("STAFF2"), { id: gb.id });
      if (r?.ok !== true) p.push(`${fn} → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
      else if ((await row(gb.id))?.status !== st) p.push(`หลัง ${fn} สถานะ ${(await row(gb.id))?.status} (คาด ${st})`);
    }
    const o = await row(gb.id);
    if (o) {
      if (o.status !== "HANDED") p.push(`สุดท้าย ${o.status}`);
      for (const f of ["acceptedAt", "readyAt", "handedAt", "closedAt", "saleId"]) if (!o[f]) p.push(`${f} ว่าง`);
      if (Number(o.version) - v0 !== 4) p.push(`version ${v0}→${o.version} (คาด +4)`);
      if (o.acceptedByUserId !== uid("STAFF2")) p.push(`acceptedByUserId ${short(o.acceptedByUserId, 30)}`);
    }
    const ev = await evsOf(gb.id);
    if (ev.map((e: Any) => e.toStatus).join(",") !== "NEW,ACCEPTED,PREPARING,READY,HANDED") p.push(`PosOrderEvent toStatus ${ev.map((e: Any) => e.toStatus).join(",") || "—"}`);
    if (ev.map((e: Any) => e.fromStatus ?? "null").join(",") !== "null,NEW,ACCEPTED,PREPARING,READY") p.push(`fromStatus ${ev.map((e: Any) => e.fromStatus ?? "null").join(",") || "—"}`);
    if (ev[1] && ev[1].actorUserId !== uid("STAFF2")) p.push(`actor ของ ACCEPTED ${short(ev[1].actorUserId, 30)}`);
    const types = (await obxOrder(gb.id)).map((e: Any) => e.type).sort();
    if (types.join(",") !== ["pos.order.accepted", "pos.order.completed", "pos.order.ready", "pos.order.received"].join(",")) p.push(`outbox ${types.join(",") || "—"} (คาด received accepted ready completed อย่างละ 1)`);
    chk("A1", good(p), "NEW→…→HANDED · 5 PosOrderEvent · 4 outbox · version +4", why(p));
  });
  await step("A2", async () => {
    const p: string[] = [];
    const a2 = await mk("LM-48301", "A", "STAFF", lmInput("LM-48301", { startStatus: "NEW" }));
    ORD.A2 = a2.id;
    const rs: Any[] = fx || !a2.id ? [] : await Promise.all([O("acceptOrder", ctxU("A", DEV1), A("STAFF2"), { id: a2.id }), O("acceptOrder", ctxU("A", DEV2), A("MGR"), { id: a2.id })]);
    const oks = rs.filter((r) => r?.ok === true).length;
    const lost = rs.find((r) => r?.ok !== true);
    if (oks !== 1) p.push(`ok ${oks}/2 (${rs.map(codeOf).join(",")})`);
    if (!refused(lost, "ORDER_STATE_CHANGED")) p.push(`ผู้แพ้ → ${codeOf(lost)} (คาด ORDER_STATE_CHANGED)`);
    else if (lost?.order?.status !== "ACCEPTED") p.push(`ผู้แพ้ไม่มีแถวสด (order.status ${short(lost?.order?.status)})`);
    const r3 = fx || !a2.id ? null : await O("acceptOrder", ctxU("A", DEV1), A("STAFF2"), { id: a2.id });
    if (!refused(r3, "ORDER_STATE_INVALID", "ORDER_STATE_CHANGED")) p.push(`รับซ้ำ → ${codeOf(r3)}`);
    const ss = await salesOf(a2.id);
    if (ss.length !== 1) p.push(`บิล ${ss.length} (คาด 1)`);
    const o = await row(a2.id);
    const evA = (await evsOf(a2.id)).filter((e: Any) => e.toStatus === "ACCEPTED");
    if (evA.length !== 1) p.push(`PosOrderEvent ACCEPTED ${evA.length}`);
    if (o && ss[0] && evA[0]) {
      const xs = [...(await xminOf("PosOrder", [o.id])), ...(await xminOf("PosOrderEvent", [evA[0].id])), ...(await xminOf("PosSaleLine", ss[0].lines.map((l: Any) => l.id)))];
      if (new Set(xs).size !== 1) p.push(`xmin ไม่เท่ากัน ${short(xs, 80)} (รับ + บิล ต้องธุรกรรมเดียว)`);
    }
    chk("A2", good(p), "ผู้ชนะ 1 + ORDER_STATE_CHANGED · บิล 1 · xmin เดียว", why(p));
  });
  await step("A3", async () => {
    const p: string[] = [];
    const a3 = await mk("LM-48302", "A", "STAFF", lmInput("LM-48302", { startStatus: "NEW" }));
    const r = fx || !a3.id ? null : await O("rejectOrder", ctxU("A"), A("MGR"), { id: a3.id, reasonCode: "TOO_BUSY", note: "ครัวเต็ม" });
    if (r?.ok !== true) p.push(`reject → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
    const o = await row(a3.id);
    if (o && (o.status !== "REJECTED" || !String(o.rejectReason ?? "").includes("TOO_BUSY") || !o.closedAt || o.saleId !== null)) p.push(`แถว ${ordStr(o)} reason ${short(o.rejectReason, 40)}`);
    if ((await salesOf(a3.id)).length) p.push("มีบิล");
    if ((await obx("pos.order.rejected", a3.id)).length !== 1) p.push(`outbox rejected ${(await obx("pos.order.rejected", a3.id)).length}`);
    const again = fx || !a3.id ? null : await O("rejectOrder", ctxU("A"), A("MGR"), { id: a3.id, reasonCode: "TOO_BUSY" });
    if (!refused(again, "ORDER_STATE_INVALID")) p.push(`ปฏิเสธซ้ำ → ${codeOf(again)}`);
    const acc = fx || !ORD.A2 ? null : await O("rejectOrder", ctxU("A"), A("MGR"), { id: ORD.A2, reasonCode: "OTHER" });
    if (!refused(acc, "ORDER_STATE_INVALID")) p.push(`ปฏิเสธออเดอร์ที่รับแล้ว → ${codeOf(acc)}`);
    const a4 = await mk("LM-48303", "A", "STAFF", lmInput("LM-48303", { startStatus: "NEW" }));
    ORD.A4 = a4.id;
    const bad = fx || !a4.id ? null : await O("rejectOrder", ctxU("A"), A("MGR"), { id: a4.id, reasonCode: "BAD" });
    if (!refused(bad, "VALIDATION")) p.push(`reasonCode แปลก → ${codeOf(bad)}`);
    if (a4.id && (await row(a4.id))?.status !== "NEW") p.push("หลัง VALIDATION ไม่ใช่ NEW");
    chk("A3", good(p), "REJECTED · ไม่มีบิล · rejected 1 · ORDER_STATE_INVALID ×2 · VALIDATION", why(p));
  });
  await step("A4", async () => {
    const p: string[] = [];
    const id = ORD.A4 ?? "";
    const o0 = await row(id);
    const tries: [string, string, Any][] = [
      ["STAFF accept", "STAFF", ["acceptOrder", { id }]],
      ["STAFF reject", "STAFF", ["rejectOrder", { id, reasonCode: "CLOSING" }]],
      ["STAFF2 reject", "STAFF2", ["rejectOrder", { id, reasonCode: "CLOSING" }]],
      ["NOPERM accept", "NOPERM", ["acceptOrder", { id }]],
    ];
    for (const [lbl, who, [fn, input]] of tries) {
      const r = fx || !id ? null : await O(fn, ctxU("A", DEV1), A(who), input);
      if (!refused(r, "PERMISSION_DENIED")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const o1 = await row(id);
    if (o0 && (o1?.status !== "NEW" || o1?.version !== o0.version)) p.push(`หลังปฏิเสธ ${ordStr(o1)} (v ${o0.version})`);
    const ok = fx || !id ? null : await O("acceptOrder", ctxU("A", DEV1), A("STAFF2"), { id });
    if (ok?.ok !== true) p.push(`STAFF2 accept → ${codeOf(ok)}`);
    chk("A4", good(p), "PERMISSION_DENIED ×4 · ไม่เปลี่ยน · STAFF2 ok", why(p));
  });
  await step("A5", async () => {
    const p: string[] = [];
    const x = fx ? { ok: false, code: "FIXTURE" } : await O("ingestOrder", ctxU("X"), A("OWNER2"), { channelId: CH.LM_X, externalRef: "LMX-1", idempotencyKey: newKey("x"), lines: [{ name: `ของร้าน T2 ${RAND}`, unitPriceSatang: 1000, qty: 1 }], customer: { name: "คุณที" }, fulfilment: "PICKUP", startStatus: "NEW" });
    const xid = x?.ok === true ? String(x.orderId ?? "") : "";
    if (!xid) p.push(`(ตั้งต้น) ออเดอร์ T2 → ${codeOf(x)}`);
    const tries: [string, Any, string, Any][] = [
      ["T2 getOrder", ctxU("A"), "getOrder", { id: xid || "none" }],
      ["T2 accept", ctxU("A", DEV1), "acceptOrder", { id: xid || "none" }],
      ["T2 reject", ctxU("A"), "rejectOrder", { id: xid || "none", reasonCode: "OTHER" }],
      ["สาขา B accept", ctxU("B"), "acceptOrder", { id: ORD.LM2 || "none" }],
      ["สาขา B getOrder", ctxU("B"), "getOrder", { id: ORD.LM2 || "none" }],
      ["id มั่ว", ctxU("A"), "getOrder", { id: "po_nope_qc28" }],
    ];
    for (const [lbl, c, fn, input] of tries) {
      const r = fx ? null : await O(fn, c, A("MGR"), input);
      if (!refused(r, "ORDER_NOT_FOUND")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    if (xid && (await row(xid))?.status !== "NEW") p.push("ออเดอร์ T2 ถูกแตะ");
    if (ORD.LM2 && (await row(ORD.LM2))?.status !== "NEW") p.push("ออเดอร์สาขา A ถูกแตะจาก ctx B");
    chk("A5", good(p), "ORDER_NOT_FOUND ×6 · ไม่แตะ", why(p));
  });
  await step("A6", async () => {
    const p: string[] = [];
    const a6 = await mk("LM-48304", "A", "STAFF", lmInput("LM-48304", { startStatus: "NEW" }));
    const snap = async () => short([(await row(a6.id))?.version, (await evsOf(a6.id)).length, (await row(ORD.GB!))?.version, (await evsOf(ORD.GB!)).length], 80);
    const s0 = await snap();
    const tries: [string, string, Any][] = [
      ["NEW markReady", "markReady", { id: a6.id }],
      ["NEW handOver", "handOver", { id: a6.id }],
      ["NEW markPreparing", "markPreparing", { id: a6.id }],
      ["NEW cancelOrder", "cancelOrder", { id: a6.id, reason: "ทดสอบ" }],
      ["HANDED markPreparing", "markPreparing", { id: ORD.GB }],
      ["HANDED cancelOrder", "cancelOrder", { id: ORD.GB, reason: "ทดสอบ" }],
    ];
    for (const [lbl, fn, input] of tries) {
      const r = fx || !a6.id ? null : await O(fn, ctxU("A", DEV1), A("MGR"), input);
      if (!refused(r, "ORDER_STATE_INVALID")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const s1 = await snap();
    if (s0 !== s1) p.push(`เขียนเพิ่ม ${s0} → ${s1}`);
    chk("A6", good(p), "ORDER_STATE_INVALID ×6 · ไม่เขียน", why(p));
  });
  await step("A7", async () => {
    const p: string[] = [];
    const s1 = fx ? null : await settings("A", "MGR", { channelId: CH.CHAT_A, autoAccept: true });
    if (s1?.ok !== true) p.push(`autoAccept CHAT → ${codeOf(s1)}`);
    const c = await mk("CHAT auto", "A", "STAFF", { channelId: CH.CHAT_A, idempotencyKey: newKey("chat"), lines: [ln("tomyum", 1)], customer: { name: "คุณแชท", phone: "0866660000" }, fulfilment: "PICKUP", paymentState: "PAY_ON_PICKUP" });
    const o = await row(c.id);
    if (c.id && (o?.status !== "ACCEPTED" || o?.acceptedByUserId !== null || o?.createdByUserId !== uid("STAFF") || o?.saleId !== null || o?.paymentState !== "PAY_ON_PICKUP" || o?.adapter !== "CHAT")) p.push(`CHAT ${ordStr(o)} by ${short(o?.acceptedByUserId, 20)} adapter ${o?.adapter}`);
    const au = c.id ? ((await P.auditLog.findMany({ where: { tenantId: T, targetId: c.id } }).catch(() => [])) as Any[]) : [];
    if (!au.some((a: Any) => /accept/i.test(String(a.action)) && (a.actorId === null || a.after?.auto === true))) p.push(`audit auto ไม่มี (${au.map((a: Any) => a.action).join(",") || "—"})`);
    const s2 = fx ? null : await settings("S", "MGR", { channelId: CH.WEB_S, autoAccept: true });
    if (s2?.ok !== true) p.push(`autoAccept WEB → ${codeOf(s2)}`);
    let so: Any = null;
    try {
      so = fx ? null : await shop.createOrder(sctx("S"), { customerName: "คุณออโต้", customerPhone: "0877770000", lines: [{ productId: SP.hat, qty: 1 }] });
    } catch (e) {
      p.push(`createOrder throw ${(e as Error).message.slice(0, 60)}`);
    }
    const w = PO && so?.id ? await PO.findFirst({ where: { tenantId: T, shopOrderId: so.id } }).catch(() => null) : null;
    if (!w || w.status !== "ACCEPTED" || w.acceptedByUserId !== null) p.push(`WEB auto ${ordStr(w)}`);
    const s3 = fx ? null : await settings("A", "MGR", { channelId: CH.LM, autoAccept: true });
    if (s3?.ok !== true) p.push(`autoAccept LINEMAN → ${codeOf(s3)}`);
    const m = await mk("LM-48306", "A", "STAFF", lmInput("LM-48306", { startStatus: "NEW" }));
    if (m.id && (await row(m.id))?.status !== "NEW") p.push(`MANUAL autoAccept ได้ ${(await row(m.id))?.status} (คาด NEW)`);
    for (const [u, ch] of [["A", CH.CHAT_A], ["S", CH.WEB_S], ["A", CH.LM]] as const) if (!fx) await settings(u, "MGR", { channelId: ch, autoAccept: false });
    chk("A7", good(p), "CHAT/WEB auto ACCEPTED actor null · MANUAL ยัง NEW", why(p));
  });
  await step("A8", async () => {
    const p: string[] = [];
    const bads: [string, Any][] = [
      ["prep 0", { prepMinutes: 0 }],
      ["prep 181", { prepMinutes: 181 }],
      ["พัก > 24 ชม.", { pausedUntil: new Date(Date.now() + 25 * 60 * MIN).toISOString() }],
      ["adapterConfig ลับ", { adapterConfig: { apiKey: "sk_live_qc" } }],
    ];
    for (const [lbl, x] of bads) {
      const r = fx ? null : await settings("A", "MGR", { channelId: CH.LM, ...x });
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const okc = fx ? null : await settings("A", "MGR", { channelId: CH.LM, adapterConfig: { version: 1, note: "ทดสอบ" } });
    if (okc?.ok !== true) p.push(`{version, note} → ${codeOf(okc)}`);
    const st = fx ? null : await settings("A", "STAFF", { channelId: CH.LM, prepMinutes: 20 });
    if (!refused(st, "PERMISSION_DENIED")) p.push(`STAFF → ${codeOf(st)}`);
    const st2 = fx ? null : await settings("A", "STAFF2", { channelId: CH.LM, prepMinutes: 20 });
    if (st2?.ok !== true) p.push(`STAFF2 → ${codeOf(st2)}`);
    const t2 = fx ? null : await settings("A", "MGR", { channelId: CH.LM_X, prepMinutes: 20 });
    if (!refused(t2, "CHANNEL_INVALID")) p.push(`ช่องทาง T2 → ${codeOf(t2)}`);
    const ch = await P.salesChannel.findUnique({ where: { id: CH.LM } }).catch(() => null);
    if (ch && (ch.prepMinutes !== 20 || ch.adapterConfig?.version !== 1)) p.push(`SalesChannel ${short({ prep: ch.prepMinutes, cfg: ch.adapterConfig }, 80)}`);
    const a8 = await mk("LM-48307", "A", "STAFF", lmInput("LM-48307", { startStatus: "NEW" }));
    const ra = fx || !a8.id ? null : await O("acceptOrder", ctxU("A", DEV1), A("STAFF2"), { id: a8.id });
    if (ra?.ok !== true || (await row(a8.id))?.prepMinutes !== 20) p.push(`accept ปริยาย → ${codeOf(ra)} prep ${(await row(a8.id))?.prepMinutes} (คาด 20)`);
    ORD.A8 = a8.id;
    const a8b = await mk("LM-48308", "A", "STAFF", lmInput("LM-48308", { startStatus: "NEW" }));
    const rb = fx || !a8b.id ? null : await O("acceptOrder", ctxU("A", DEV1), A("STAFF2"), { id: a8b.id, prepMinutes: 181 });
    if (!refused(rb, "VALIDATION") || (await row(a8b.id))?.status !== "NEW") p.push(`accept 181 → ${codeOf(rb)}`);
    const sp = fx || !a8.id ? null : await O("setPrepMinutes", ctxU("A"), A("STAFF2"), { id: a8.id, prepMinutes: 25 });
    if (sp?.ok !== true || (await row(a8.id))?.prepMinutes !== 25) p.push(`setPrepMinutes 25 → ${codeOf(sp)}`);
    const sp0 = fx || !a8.id ? null : await O("setPrepMinutes", ctxU("A"), A("STAFF2"), { id: a8.id, prepMinutes: 0 });
    if (!refused(sp0, "VALIDATION")) p.push(`setPrepMinutes 0 → ${codeOf(sp0)}`);
    if (!fx) await settings("A", "MGR", { channelId: CH.LM, prepMinutes: null });
    chk("A8", good(p), "ช่วงค่า · สิทธิ์ · ช่องทางร้านอื่น · prepMinutes ของช่องทาง/ออเดอร์", why(p));
  });

  // ════════ S บิล ════════
  const sLM = (await salesOf(ORD.LM ?? ""))[0] ?? null;
  await step("S1", async () => {
    const p: string[] = [];
    const ss = await salesOf(ORD.LM ?? "");
    const s = ss[0];
    if (ss.length !== 1) p.push(`บิลของออเดอร์ ${ss.length} (คาด 1)`);
    if (s) {
      const want: Record<string, unknown> = { idempotencyKey: `posorder-${ORD.LM}`, sourceModule: "POS", sourceId: ORD.LM, channelId: CH.LM, channelCode: "LINEMAN", channelRef: "LM-48213", channelPayout: "PLATFORM", channelCommissionSatang: 12600, channelCommissionVatSatang: 0, grandTotalSatang: 42000, soldByUserId: uid("STAFF"), shiftId: SHIFT["1"], status: "PAID" };
      for (const [k, v] of Object.entries(want)) if (s[k] !== v) p.push(`${k} = ${short(s[k], 40)} (คาด ${short(v, 40)})`);
      if (s.payments?.length !== 1 || s.payments[0]?.type !== "PLATFORM" || s.payments[0]?.amountSatang !== 42000) p.push(`PosPayment ${short(s.payments?.map((x: Any) => [x.type, x.amountSatang]), 60)}`);
      const ls = s.lines ?? [];
      if (ls.length !== 3 || ls.some((l: Any) => !l.productId)) p.push(`บรรทัด ${ls.length} productId ${ls.filter((l: Any) => l.productId).length}`);
      if (ls.some((l: Any) => l.priceSource === undefined || l.priceSource === null)) p.push(`priceSource ว่าง (${short(ls.map((l: Any) => l.priceSource), 60)})`);
      const pt = ls.find((l: Any) => l.productId === PR.padthai);
      if (!pt || pt.options?.length !== 1 || pt.options[0]?.choiceId !== CHO.noegg) p.push(`options ผัดไทย ${short(pt?.options?.map((o: Any) => o.choiceName), 60)}`);
      const wt = ls.find((l: Any) => l.productId === PR.water);
      if (!wt || wt.itemId !== INV.water) p.push(`น้ำ itemId ${short(wt?.itemId, 30)} (คาดผูก InvItem)`);
    }
    if (!sLM) p.push("ไม่มีบิล");
    chk("S1", good(p), "บิล POS ของออเดอร์ · LINEMAN PLATFORM 12600 · productId/priceSource/options · กะเครื่อง 1", why(p) + SOFT());
  });
  await drain();
  await step("S2", async () => {
    const p: string[] = [];
    const es = await jv([sLM?.id ?? ""]);
    const paid = es.filter((e) => e.key === K(sLM?.id ?? "", "PAID"));
    const com = es.filter((e) => e.key === K(sLM?.id ?? "", "COMMISSION"));
    const v = vatOf(42000, 700);
    const wantPaid = `1100:42000/0 2200:0/${v} 4000:0/${42000 - v}`;
    if (paid.length !== 1 || shape(paid[0]) !== wantPaid) p.push(`PAID ${paid.length} · ${shape(paid[0])} (คาด ${wantPaid})`);
    if (com.length !== 1 || shape(com[0]) !== "1100:0/12600 6500:12600/0") p.push(`COMMISSION ${com.length} · ${shape(com[0])}`);
    if ((net(es)["1100"] ?? 0) !== 29400) p.push(`1100 สุทธิ ${net(es)["1100"] ?? 0} (คาด 29400)`);
    const sg = (await salesOf(ORD.GB ?? ""))[0];
    const eg = await jv([sg?.id ?? ""]);
    const cg = eg.filter((e) => e.key === K(sg?.id ?? "", "COMMISSION"));
    if (cg.length !== 1 || shape(cg[0]) !== "1100:0/8507 1155:557/0 6500:7950/0") p.push(`GRAB COMMISSION ${cg.length} · ${shape(cg[0])}`);
    chk("S2", good(p) && !!sLM, "PAID + COMMISSION (LINEMAN · GRAB) ตาม P2.1 G", why(p));
  });
  await step("S3", async () => {
    const p: string[] = [];
    const mv = async (saleId: string, itemId: string): Promise<Any[]> =>
      saleId && itemId ? ((await P.invMovement.findMany({ where: { tenantId: T, itemId, OR: [{ refId: saleId }, { idempotencyKey: { contains: saleId } }] } }).catch(() => [])) as Any[]) : [];
    const w = await mv(sLM?.id ?? "", INV.water ?? "");
    if (w.length !== 1 || sum(w.map((m: Any) => m.qtyDelta)) !== -1) p.push(`น้ำของบิล LM-48213: ${w.length} แถว Σ ${sum(w.map((m: Any) => m.qtyDelta))} (คาด 1 แถว −1)`);
    let bom = "ข้าม BOM (P2.3 ยังไม่ merge)";
    if (HAS_P23 && PR.kaprao) {
      const k = await mk("LM-BOM", "A", "STAFF", lmInput("LM-48340", { startStatus: "ACCEPTED", lines: [ln("kaprao", 1)] }), DEV1);
      const s = (await salesOf(k.id))[0];
      const r = await mv(s?.id ?? "", INV.rice ?? "");
      const b = await mv(s?.id ?? "", INV.basil ?? "");
      if (sum(r.map((m: Any) => m.qtyDelta)) !== -1 || sum(b.map((m: Any) => m.qtyDelta)) !== -2) p.push(`BOM ข้าว Σ ${sum(r.map((m: Any) => m.qtyDelta))} (−1) · กะเพรา Σ ${sum(b.map((m: Any) => m.qtyDelta))} (−2)`);
      bom = "BOM ตรวจแล้ว";
    }
    chk("S3", good(p) && !!sLM, "น้ำ −1 ครั้งเดียว · BOM (เมื่อมี P2.3)", why(p) + ` · ${bom}`);
  });
  await step("S4", async () => {
    const p: string[] = [];
    const s = sLM ? await P.posSale.findUnique({ where: { id: sLM.id }, include: { lines: true } }).catch(() => null) : null;
    if (!s) p.push("ไม่มีบิล");
    else {
      if (s.serviceChargeSatang !== 0 || s.tipSatang !== 0 || s.discountSatang !== 0) p.push(`ค่าบริการ ${s.serviceChargeSatang} · ทิป ${s.tipSatang} · ส่วนลด ${s.discountSatang} (คาด 0)`);
      if (s.grandTotalSatang !== sum((s.lines ?? []).map((l: Any) => l.lineTotalSatang))) p.push(`grand ${s.grandTotalSatang} ≠ Σ บรรทัด`);
    }
    chk("S4", good(p), "ค่าบริการ 0 · ทิป 0 · grand = Σ บรรทัด (ค่าบริการ POS 10% เปิดอยู่)", why(p));
  });
  const c1 = await mk("CHAT C1", "A", "STAFF", { channelId: CH.CHAT_A, idempotencyKey: newKey("c1"), lines: [ln("tomyum", 1), ln("water", 1)], customer: { name: "คุณแชทหนึ่ง", phone: "0866660001" }, fulfilment: "PICKUP", paymentState: "PAY_ON_PICKUP" });
  ORD.C1 = c1.id;
  await step("S5", async () => {
    const p: string[] = [];
    for (const fn of ["acceptOrder", "markPreparing", "markReady"]) {
      const r = fx || !c1.id ? null : await O(fn, ctxU("A", DEV2), A("STAFF2"), { id: c1.id });
      if (r?.ok !== true) p.push(`(ตั้งต้น) ${fn} → ${codeOf(r)}`);
    }
    const h = fx || !c1.id ? null : await O("handOver", ctxU("A", DEV2), A("STAFF2"), { id: c1.id });
    if (!refused(h, "ORDER_UNPAID")) p.push(`handOver ยังไม่จ่าย → ${codeOf(h)}`);
    const pay = (dev: string | undefined, methods: Any[], cash?: number) => O("payOrder", ctxU("A", dev), A("STAFF2"), { id: c1.id, idempotencyKey: newKey("pay"), payMethods: methods, ...(cash !== undefined ? { cashReceivedSatang: cash } : {}) });
    const r1 = fx || !c1.id ? null : await pay(undefined, [{ type: "CASH", amountSatang: 12000 }], 20000);
    if (!refused(r1, "SHIFT_REQUIRED")) p.push(`CASH ไม่มีเครื่อง → ${codeOf(r1)}`);
    const r2 = fx || !c1.id ? null : await pay(DEV2, [{ type: "PLATFORM", amountSatang: 12000 }]);
    if (!refused(r2, "CHANNEL_PAY_MISMATCH", "VALIDATION")) p.push(`PLATFORM บน DIRECT → ${codeOf(r2)}`);
    const r3 = fx || !c1.id ? null : await pay(DEV2, [{ type: "CASH", amountSatang: 11000 }], 11000);
    if (!refused(r3, "PAYMENT_MISMATCH", "VALIDATION")) p.push(`Σ ไม่ตรง → ${codeOf(r3)}`);
    if ((await salesOf(c1.id)).length) p.push("มีบิล");
    const o = await row(c1.id);
    if (o && (o.status !== "READY" || o.paymentState !== "PAY_ON_PICKUP" || o.totalSatang !== 12000)) p.push(`แถว ${ordStr(o)} ยอด ${o.totalSatang}`);
    chk("S5", good(p), "ORDER_UNPAID · SHIFT_REQUIRED · CHANNEL_PAY_MISMATCH · PAYMENT_MISMATCH · ไม่มีบิล", why(p));
  });
  const PAY_KEY = newKey("pay-ok");
  await step("S6", async () => {
    const p: string[] = [];
    const xr = async () => call(shiftMod, "xReport", ctxU("A", DEV2), A("OWNER"), { shiftId: SHIFT["2"] });
    const x0 = await xr();
    const r = fx || !c1.id ? null : await O("payOrder", ctxU("A", DEV2), A("STAFF2"), { id: c1.id, idempotencyKey: PAY_KEY, payMethods: [{ type: "CASH", amountSatang: 12000 }], cashReceivedSatang: 20000 });
    if (r?.ok !== true || !r.saleId) p.push(`payOrder → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const s = (await salesOf(c1.id))[0];
    if (s) {
      const want: Record<string, unknown> = { sourceModule: "POS", sourceId: c1.id, channelId: CH.CHAT_A, channelCode: "CHAT", channelPayout: "DIRECT", shiftId: SHIFT["2"], grandTotalSatang: 12000, soldByUserId: uid("STAFF2") };
      for (const [k, v] of Object.entries(want)) if (s[k] !== v) p.push(`${k} = ${short(s[k], 40)} (คาด ${short(v, 40)})`);
      const cash = s.payments?.find((x: Any) => x.type === "CASH");
      if (s.payments?.length !== 1 || cash?.amountSatang !== 12000 || cash?.tenderedSatang !== 20000 || cash?.changeSatang !== 8000) p.push(`PosPayment ${short(s.payments?.map((x: Any) => [x.type, x.amountSatang, x.tenderedSatang, x.changeSatang]), 80)}`);
      if (r?.saleId && r.saleId !== s.id) p.push("saleId ของผลไม่ตรงบิล");
    } else if (!p.length) p.push("ไม่มีบิล");
    const o = await row(c1.id);
    if (o && (o.paymentState !== "PAID" || o.saleId !== s?.id)) p.push(`ออเดอร์ ${ordStr(o)}`);
    const x1 = await xr();
    if (x0?.ok !== true || x1?.ok !== true) p.push(`xReport → ${codeOf(x1)}`);
    else if (x1.report.billCount - x0.report.billCount !== 1 || x1.report.salesTotalSatang - x0.report.salesTotalSatang !== 12000) p.push(`X กะเครื่อง 2 billCount +${x1.report.billCount - x0.report.billCount} salesTotal +${x1.report.salesTotalSatang - x0.report.salesTotalSatang}`);
    const h = fx || !c1.id ? null : await O("handOver", ctxU("A", DEV2), A("STAFF2"), { id: c1.id });
    if (h?.ok !== true || (await row(c1.id))?.status !== "HANDED") p.push(`handOver หลังจ่าย → ${codeOf(h)}`);
    chk("S6", good(p), "บิล CASH ในกะเครื่อง 2 · ทอน 8000 · PAID · X +1/+12000 · HANDED", why(p));
  });
  await step("S7", async () => {
    const p: string[] = [];
    const s0 = (await salesOf(c1.id))[0];
    const r1 = fx || !c1.id ? null : await O("payOrder", ctxU("A", DEV2), A("STAFF2"), { id: c1.id, idempotencyKey: PAY_KEY, payMethods: [{ type: "CASH", amountSatang: 12000 }], cashReceivedSatang: 20000 });
    if (r1?.ok !== true || r1.saleId !== s0?.id) p.push(`คีย์เดิม → ${codeOf(r1)} ${r1?.saleId === s0?.id ? "บิลเดิม" : "บิลอื่น"}`);
    const r2 = fx || !c1.id ? null : await O("payOrder", ctxU("A", DEV2), A("STAFF2"), { id: c1.id, idempotencyKey: newKey("pay2"), payMethods: [{ type: "CASH", amountSatang: 12000 }], cashReceivedSatang: 12000 });
    if (r2?.ok === true && r2.saleId !== s0?.id) p.push("คีย์ใหม่ได้บิลที่สอง");
    const n = (await salesOf(c1.id)).length;
    if (n !== 1) p.push(`บิลของออเดอร์ ${n} (คาด 1)`);
    chk("S7", good(p) && !!s0, "คีย์เดิม = บิลเดิม · ไม่มีบิลที่สอง", why(p) + ` · คีย์ใหม่ → ${codeOf(r2)}`);
  });
  await step("S8", async () => {
    const p: string[] = [];
    const s8 = await mk("LM-48320", "A", "STAFF", lmInput("LM-48320", { startStatus: "NEW", lines: [ln("salt", 2)] }));
    const o0 = await row(s8.id);
    const before = await counts();
    const r = fx || !s8.id ? null : await O("acceptOrder", ctxU("A", DEV1), A("STAFF2"), { id: s8.id });
    if (!refused(r, "STOCK_INSUFFICIENT")) p.push(`accept ของไม่พอ → ${codeOf(r)}`);
    const o1 = await row(s8.id);
    if (o0 && (o1?.status !== "NEW" || o1?.version !== o0.version || o1?.saleId !== null)) p.push(`หลังปฏิเสธ ${ordStr(o1)}`);
    const d1 = sameCounts(before, await counts());
    if (d1.length) p.push(`accept ปฏิเสธแล้วยังเขียน: ${d1.join(", ")}`);
    const k = newKey("salt");
    const mid = await counts();
    const r2 = fx ? null : await ingest("A", "STAFF", lmInput("LM-48321", { startStatus: "ACCEPTED", lines: [ln("salt", 2)], idempotencyKey: k }), DEV1);
    if (!refused(r2, "STOCK_INSUFFICIENT")) p.push(`ingest ACCEPTED ของไม่พอ → ${codeOf(r2)}`);
    const n = PO ? Number(await PO.count({ where: { tenantId: T, idempotencyKey: k } }).catch(() => -1)) : -1;
    if (n !== 0) p.push(`แถวออเดอร์ของคีย์ ${n} (คาด 0)`);
    const d2 = sameCounts(mid, await counts());
    if (d2.length) p.push(`ingest ปฏิเสธแล้วยังเขียน: ${d2.join(", ")}`);
    chk("S8", good(p), "STOCK_INSUFFICIENT · ยัง NEW · ไม่เขียน ×2", why(p));
  });

  // ════════ V ยกเลิก ════════
  await step("V1", async () => {
    const p: string[] = [];
    const v1 = await mk("LM-48310", "A", "STAFF", lmInput("LM-48310", { startStatus: "ACCEPTED" }), DEV1);
    for (const fn of ["markPreparing", "markReady"]) {
      const r = fx || !v1.id ? null : await O(fn, ctxU("A", DEV1), A("STAFF2"), { id: v1.id });
      if (r?.ok !== true) p.push(`(ตั้งต้น) ${fn} → ${codeOf(r)}`);
    }
    const s = (await salesOf(v1.id))[0];
    const vr = s ? await call(billsMod, "voidSaleByActor", ctxU("A", DEV1), A("OWNER"), { unitId: U.A, saleId: s.id, idempotencyKey: newKey("void"), reason: "ลูกค้ายกเลิกผ่านแพลตฟอร์ม" }) : null;
    if (vr?.ok !== true) p.push(`voidSaleByActor → ${codeOf(vr)} ${short(vr?.message ?? "", 60)}`);
    await drain();
    const o = await row(v1.id);
    if (o && (o.status !== "CANCELLED" || o.paymentState !== "REFUNDED" || !o.closedAt)) p.push(`หลัง void ${ordStr(o)}`);
    if ((await obx("pos.order.cancelled", v1.id)).length !== 1) p.push(`outbox cancelled ${(await obx("pos.order.cancelled", v1.id)).length}`);
    const ev = s ? (await obx("pos.sale.voided")).find((e) => e.payload?.saleId === s.id) : null;
    const h = consMod?.consumers?.["pos.sale.voided"];
    const v0 = (await row(v1.id))?.version;
    if (ev && typeof h === "function")
      for (let i = 0; i < 2; i++) {
        try {
          await h(ev);
        } catch (e) {
          p.push(`เล่นซ้ำ throw ${(e as Error).message.slice(0, 50)}`);
        }
      }
    else p.push("ไม่มี event/consumer pos.sale.voided ให้เล่นซ้ำ");
    await drain();
    const o2 = await row(v1.id);
    if (o2 && o2.version !== v0) p.push(`เล่นซ้ำแล้ว version ${v0}→${o2.version}`);
    if ((await obx("pos.order.cancelled", v1.id)).length !== 1) p.push("เล่นซ้ำแล้ว cancelled เพิ่ม");
    chk("V1", good(p), "void จากลิ้นชัก → CANCELLED REFUNDED · cancelled 1 · เล่นซ้ำไม่เปลี่ยน", why(p));
  });
  const v2 = await mk("LM-48311", "A", "STAFF", lmInput("LM-48311", { startStatus: "ACCEPTED" }), DEV1);
  // ORACLE-EDIT (P2.8 fix รอบ 1 · มติผู้คุม 3): pos.sale.paid ของบิลนี้ (PAID + COMMISSION ต้นฉบับ) ต้องลงก่อน V3 ยกเลิกบิล —
  //   บิลที่ถูก void ก่อนคิวมาถึงข้ามการลงบัญชีโดยออกแบบ (ไม่มี COMMISSION ให้กลับ) ⇒ V3 วัดการกลับรายการได้แน่นอน
  await drain();
  await step("V2", async () => {
    const p: string[] = [];
    const o0 = await row(v2.id);
    const r1 = fx || !v2.id ? null : await O("cancelOrder", ctxU("A", DEV1), A("STAFF2"), { id: v2.id, reason: "ร้านทำไม่ทัน" });
    if (!refused(r1, "PERMISSION_DENIED")) p.push(`STAFF2 → ${codeOf(r1)}`);
    const r2 = fx || !v2.id ? null : await O("cancelOrder", ctxU("A", DEV1), A("MGR"), { id: v2.id, reason: "   " });
    if (!refused(r2, "VALIDATION")) p.push(`เหตุผลว่าง → ${codeOf(r2)}`);
    const o1 = await row(v2.id);
    const s = (await salesOf(v2.id))[0];
    if (o0 && (o1?.status !== "ACCEPTED" || o1?.version !== o0.version)) p.push(`ออเดอร์ ${ordStr(o1)}`);
    if (s && s.status !== "PAID") p.push(`บิล ${s.status}`);
    if (!s && v2.id) p.push("ไม่มีบิล (ตั้งต้น)");
    chk("V2", good(p), "PERMISSION_DENIED · VALIDATION · ไม่เปลี่ยน", why(p));
  });
  await step("V3", async () => {
    const p: string[] = [];
    const r = fx || !v2.id ? null : await O("cancelOrder", ctxU("A", DEV1), A("MGR"), { id: v2.id, reason: "ร้านทำไม่ทัน", idempotencyKey: newKey("cx") });
    if (r?.ok !== true) p.push(`cancelOrder → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    await drain();
    const o = await row(v2.id);
    if (o && (o.status !== "CANCELLED" || o.paymentState !== "REFUNDED")) p.push(`ออเดอร์ ${ordStr(o)}`);
    const s = (await salesOf(v2.id))[0];
    if (!s || s.status !== "VOIDED") p.push(`บิล ${s?.status ?? "ไม่มี"} (คาด VOIDED)`);
    const es = await jv([s?.id ?? ""]);
    if (es.filter((e) => e.key === K(s?.id ?? "", "COMMISSION")).length !== 1) p.push("ไม่มี COMMISSION ต้นฉบับ");
    const n = net(es);
    if ((n["6500"] ?? 0) !== 0 || (n["1100"] ?? 0) !== 0) p.push(`สุทธิ 6500 ${n["6500"] ?? 0} · 1100 ${n["1100"] ?? 0} (คาด 0/0)`);
    if ((await obx("pos.order.cancelled", v2.id)).length !== 1) p.push(`outbox cancelled ${(await obx("pos.order.cancelled", v2.id)).length} (คาด 1)`);
    chk("V3", good(p), "CANCELLED REFUNDED · บิล VOIDED · COMMISSION กลับ · cancelled 1", why(p));
  });
  await step("V4", async () => {
    const p: string[] = [];
    const s = (await salesOf(ORD.GB ?? ""))[0];
    const wl = s?.lines?.find((l: Any) => l.productId === PR.water);
    const o0 = await row(ORD.GB ?? "");
    const rr = s && wl ? await call(refundMod, "refundSale", ctxU("A", DEV1), A("OWNER"), { saleId: s.id, lines: [{ lineId: wl.id, qty: 2 }], payMethods: [{ type: "PLATFORM", amountSatang: 2000 }], reasonCode: "CHANGED_MIND", reason: "ลูกค้าไม่รับน้ำ", idempotencyKey: newKey("rf") }) : null;
    if (rr?.ok !== true) p.push(`refundSale → ${codeOf(rr)} ${short(rr?.message ?? "", 60)}`);
    await drain();
    const o1 = await row(ORD.GB ?? "");
    if (o0 && (o1?.status !== "HANDED" || o1?.paymentState !== "PLATFORM_PAID" || o1?.version !== o0.version)) p.push(`ออเดอร์ ${ordStr(o0)} → ${ordStr(o1)}`);
    chk("V4", good(p), "คืนบางส่วน → ออเดอร์ไม่เปลี่ยน", why(p));
  });

  // ════════ W เว็บร้าน ════════
  const poOfShop = async (shopOrderId: string): Promise<Any[]> => (PO && shopOrderId ? ((await PO.findMany({ where: { tenantId: T, shopOrderId } }).catch(() => [])) as Any[]) : []);
  const shopTry = async (label: string, f: () => Promise<Any>, p: string[]): Promise<Any> => {
    try {
      return fx ? null : await f();
    } catch (e) {
      p.push(`${label} throw ${(e as Error).message.slice(0, 60)}`);
      return null;
    }
  };
  let so1: Any = null;
  await step("W1", async () => {
    const p: string[] = [];
    so1 = await shopTry("createOrder", () => shop.createOrder(sctx("S"), { customerName: "คุณเว็บ", customerPhone: "0811112222", note: "ฝากไว้ที่ป้อม", lines: [{ productId: SP.tee, qty: 2 }, { productId: SP.hat, qty: 1 }] }), p);
    const pos = await poOfShop(so1?.id ?? "");
    if (pos.length !== 1) p.push(`PosOrder ของ ShopOrder ${pos.length} (คาด 1)`);
    const o = pos[0];
    if (o) {
      const want: Record<string, unknown> = { unitId: U.S, systemId: S.POS, channelId: CH.WEB_S, channelCode: "WEB", adapter: "WEB", externalRef: so1?.code, status: "NEW", paymentState: "UNPAID", totalSatang: so1?.totalSatang, customerName: "คุณเว็บ" };
      for (const [k, v] of Object.entries(want)) if (o[k] !== v) p.push(`${k} = ${short(o[k], 40)} (คาด ${short(v, 40)})`);
      ORD.W1 = o.id;
      const sl = (await P.shopOrderLine.findMany({ where: { orderId: so1.id } }).catch(() => [])) as Any[];
      if (sl.some((l: Any) => !l.posProductId)) p.push("ShopOrderLine.posProductId ว่าง");
      if (sl.find((l: Any) => l.productId === SP.tee)?.posProductId !== PR.tee) p.push("ShopOrderLine เสื้อ posProductId ≠ แถวร่วมของ InvItem");
      const ol = await linesOf(o.id);
      if (setStr(ol.map((l: Any) => `${l.productId}:${l.qty}:${l.unitPriceSatang}`)) !== setStr(sl.map((l: Any) => `${l.posProductId}:${l.qty}:${l.unitPriceSatang}`))) p.push(`บรรทัด ${short(ol.map((l: Any) => [l.productId === PR.tee ? "tee" : "?", l.qty, l.unitPriceSatang]), 80)} ≠ ShopOrderLine`);
      if ((await obx("pos.order.received", o.id)).length !== 1) p.push("received ไม่ใช่ 1");
    }
    chk("W1", good(p) && !!so1, "PosOrder WEB NEW UNPAID · ref = SO · บรรทัด = ShopOrderLine (posProductId)", why(p) + ` · ${so1?.code ?? "-"} ${so1?.totalSatang ?? "-"}`);
  });
  await step("W6", async () => {
    const p: string[] = [];
    const webRow = async () => (PCP ? ((await PCP.findMany({ where: { tenantId: T, productId: PR.tee, channelCode: "WEB", unitId: null } }).catch(() => [])) as Any[]) : []);
    const w0 = await webRow();
    if (w0.length !== 1 || w0[0]?.priceSatang !== 25000) p.push(`แถว (WEB, null) ของเสื้อ ${short(w0.map((r: Any) => r.priceSatang), 40)} (คาด 1 แถว 25000 · dual-write)`);
    const priceIn = async (): Promise<number | undefined> => {
      const ls = await shopTry("listProducts", () => shop.listProducts(sctx("S"), { activeOnly: true, storefront: true }), p);
      return (Array.isArray(ls) ? ls : []).find((x: Any) => x.id === SP.tee)?.priceSatang;
    };
    const l0 = await priceIn();
    if (l0 !== 25000) p.push(`storefront เสื้อ ${short(l0)} (คาด 25000)`);
    const sl = so1?.id ? ((await P.shopOrderLine.findMany({ where: { orderId: so1.id } }).catch(() => [])) as Any[]) : [];
    if (sl.find((l: Any) => l.productId === SP.tee)?.unitPriceSatang !== 25000) p.push("createOrder เสื้อไม่ใช่ 25000");
    const rp = await call(posIdx, "resolvePrices", P, { tenantId: T, systemId: S.POS, unitId: U.A }, { channelCode: "STORE", items: [{ productId: PR.tee }] });
    if (rp?.ok !== true || rp.items?.[0]?.unitPriceSatang !== 20000) p.push(`ราคา STORE ของแถวร่วม → ${codeOf(rp)} ${short(rp?.items?.[0]?.unitPriceSatang)} (คาด 20000)`);
    const up = fx ? null : await setCp(PR.tee!, [{ channelCode: "WEB", unitId: null, priceSatang: 26000 }]);
    if (up?.ok === false) p.push(`แก้แถว WEB → ${codeOf(up)}`);
    const l1 = await priceIn();
    if (l1 !== 26000) p.push(`storefront หลังแก้ ${short(l1)} (คาด 26000)`);
    const so6 = await shopTry("createOrder", () => shop.createOrder(sctx("S"), { customerName: "คุณราคาใหม่", customerPhone: "0811113333", lines: [{ productId: SP.tee, qty: 1 }] }), p);
    if (so6 && so6.totalSatang !== 26000) p.push(`createOrder หลังแก้ ${so6.totalSatang} (คาด 26000)`);
    const sp = SP.tee ? await P.shopProduct.findUnique({ where: { id: SP.tee } }).catch(() => null) : null;
    if (sp?.priceSatang !== 25000) p.push(`ShopProduct.priceSatang ${sp?.priceSatang} (คาด 25000 ไม่ถูกแก้)`);
    if (!fx) await setCp(PR.tee!, [{ channelCode: "WEB", unitId: null, priceSatang: 25000 }]);
    chk("W6", good(p) && !!PCP, "แถว WEB = ราคาเว็บ · storefront/createOrder อ่านแถว WEB · STORE ยัง 20000", why(p) + SOFT());
  });
  let cf1: Any = null;
  await step("W3", async () => {
    const p: string[] = [];
    cf1 = so1?.id ? await shopTry("confirmOrderPaid", () => shop.confirmOrderPaid(sctx("S"), so1.id), p) : null;
    if (cf1?.ok !== true || !cf1.posSaleId) p.push(`confirmOrderPaid → ${short(cf1, 60)}`);
    await drain();
    const o = await row(ORD.W1 ?? "");
    const sale = cf1?.posSaleId ? await P.posSale.findUnique({ where: { id: cf1.posSaleId } }).catch(() => null) : null;
    if (o && (o.saleId !== cf1?.posSaleId || o.paymentState !== "PAID")) p.push(`ออเดอร์ ${ordStr(o)} saleId ${o.saleId === cf1?.posSaleId ? "ตรง" : "ไม่ตรง"}`);
    if (o && sale && sale.channelId !== o.channelId) p.push(`channelId บิล ${short(sale.channelId, 20)} ≠ ออเดอร์`);
    const v0 = o?.version;
    const ev = so1?.id ? (await obx("shop.order.paid", so1.id))[0] : null;
    const h = consMod?.consumers?.["shop.order.paid"];
    if (ev && typeof h === "function")
      for (let i = 0; i < 2; i++) {
        try {
          await h(ev);
        } catch (e) {
          p.push(`เล่นซ้ำ throw ${(e as Error).message.slice(0, 50)}`);
        }
      }
    else p.push("ไม่มี event/consumer shop.order.paid");
    await drain();
    const o2 = await row(ORD.W1 ?? "");
    if (o2 && o2.version !== v0) p.push(`เล่นซ้ำแล้ว version ${v0}→${o2.version}`);
    if (!ORD.W1) p.push("ไม่มี PosOrder ของ W1");
    chk("W3", good(p), "ผูก saleId · PAID · ช่องทางเดียวกับบิล · เล่นซ้ำไม่เปลี่ยน", why(p));
  });
  await step("W8", async () => {
    const p: string[] = [];
    const sale = cf1?.posSaleId ? await P.posSale.findUnique({ where: { id: cf1.posSaleId }, include: { lines: true } }).catch(() => null) : null;
    if (!sale) p.push("ไม่มีบิลของเว็บร้าน");
    else {
      const sl = (await P.shopOrderLine.findMany({ where: { orderId: so1.id } }).catch(() => [])) as Any[];
      if (sale.lines.some((l: Any) => !l.productId) || sl.some((l: Any) => !l.posProductId)) p.push(`productId/posProductId ว่าง (บิล ${sale.lines.filter((l: Any) => l.productId).length}/${sale.lines.length} · ShopOrderLine ${sl.filter((l: Any) => l.posProductId).length}/${sl.length})`);
      else if (setStr(sale.lines.map((l: Any) => l.productId)) !== setStr(sl.map((l: Any) => l.posProductId))) p.push(`productId ${short(sale.lines.map((l: Any) => l.productId), 60)} ≠ posProductId`);
      if (sale.lines.some((l: Any) => l.itemId)) p.push("มี itemId บนบรรทัดบิลเว็บร้าน (ตัดสต็อกซ้ำ)");
      if (sale.lines.some((l: Any) => l.priceSource === undefined || l.priceSource === null)) p.push(`priceSource ว่าง (${short(sale.lines.map((l: Any) => l.priceSource), 40)})`);
      const mv = (await P.invMovement.findMany({ where: { tenantId: T, itemId: INV.tee } }).catch(() => [])) as Any[];
      const shopCut = mv.filter((m: Any) => m.refType === "ShopOrder" && m.refId === so1.id);
      const posCut = mv.filter((m: Any) => m.refId === sale.id || String(m.idempotencyKey ?? "").includes(sale.id));
      if (shopCut.length !== 1 || sum(shopCut.map((m: Any) => m.qtyDelta)) !== -2 || !String(shopCut[0]?.idempotencyKey ?? "").startsWith(`ecom-${so1.id}-`)) p.push(`ตัดสต็อกเว็บร้าน ${shopCut.length} แถว Σ ${sum(shopCut.map((m: Any) => m.qtyDelta))}`);
      if (posCut.length) p.push(`มีแถวตัดสต็อกของบิล ${posCut.length}`);
      const oh = Number((await P.invItem.findUnique({ where: { id: INV.tee } }).catch(() => null))?.onHand);
      if (oh !== 48) p.push(`onHand เสื้อ ${oh} (คาด 48)`);
    }
    chk("W8", !fx && p.length === 0, "productId = posProductId · ไม่มี itemId · priceSource · ตัดครั้งเดียว −2", FX(P8(p) || "ครบ"));
  });
  await step("W4", async () => {
    const p: string[] = [];
    const so2 = await shopTry("createOrder", () => shop.createOrder(sctx("S"), { customerName: "คุณยกเลิก", customerPhone: "0811114444", lines: [{ productId: SP.hat, qty: 1 }] }), p);
    const o0 = (await poOfShop(so2?.id ?? ""))[0];
    if (!o0 || o0.status !== "NEW") p.push(`ก่อนยกเลิก ${ordStr(o0)}`);
    const ok = so2?.id ? await shopTry("cancelOrder", () => shop.cancelOrder(sctx("S"), so2.id), p) : null;
    if (ok !== true) p.push(`shop cancelOrder → ${short(ok)}`);
    const o1 = (await poOfShop(so2?.id ?? ""))[0];
    if (!o1 || o1.status !== "CANCELLED" || !o1.closedAt) p.push(`หลังยกเลิก ${ordStr(o1)}`);
    if (o1 && (await obx("pos.order.cancelled", o1.id)).length !== 1) p.push("cancelled ไม่ใช่ 1");
    // EDIT (P2.8 fix รอบ 3 · H4): เว็บร้านยกเลิกแข่งกับการรับ — ล็อกแถวออเดอร์ (FOR UPDATE · ข้อสอบเท่านั้น) ให้ accept เข้าคิวก่อน แล้ว shop cancel อ่านเวอร์ชันเดิม
    //   แล้วรอ · ปล่อยล็อก ⇒ accept ชนะ ⇒ การยกเลิกจากต้นทางต้องอ่านใหม่แล้วยกเลิกจาก ACCEPTED (ไม่ใช่ ShopOrder CANCELLED + ออเดอร์ ACCEPTED)
    const so4 = await shopTry("createOrder", () => shop.createOrder(sctx("S"), { customerName: "คุณแข่งยกเลิก", customerPhone: "0811114445", lines: [{ productId: SP.hat, qty: 1 }] }), p);
    const o4 = (await poOfShop(so4?.id ?? ""))[0];
    if (!fx && o4 && so4?.id) {
      let accP: Any = null;
      let canP: Any = null;
      await P.$transaction(
        async (tx: Any) => {
          await tx.$queryRawUnsafe(`SELECT id FROM "PosOrder" WHERE id = $1 FOR UPDATE`, o4.id);
          accP = O("acceptOrder", ctxU("S"), A("MGR"), { id: o4.id });
          await sleep(500);
          canP = shop.cancelOrder(sctx("S"), so4.id).catch((e: Error) => `throw ${e.message.slice(0, 60)}`);
          await sleep(800);
        },
        { timeout: 15_000, maxWait: 10_000 },
      );
      const accR = await accP;
      const canR = await canP;
      const st4 = (await P.shopOrder.findUnique({ where: { id: so4.id } }).catch(() => null))?.status;
      const r4 = await row(o4.id);
      if (accR?.ok !== true || canR !== true || st4 !== "CANCELLED") p.push(`(แข่ง) accept ${codeOf(accR)} · shop cancel ${short(canR, 40)} · ShopOrder ${st4} (คาด OK · true · CANCELLED)`);
      if (r4?.status !== "CANCELLED") p.push(`(แข่ง) ออเดอร์หลังเว็บร้านยกเลิก ${ordStr(r4)} (คาด CANCELLED — ต้นทางยกเลิกต้องอ่านใหม่แล้วลองอีกครั้ง)`);
    } else if (!fx) p.push("(ตั้งต้น แข่ง) ไม่มีออเดอร์เว็บ");
    chk("W4", good(p), "shop cancel → PosOrder CANCELLED · cancelled 1 · แข่งกับ accept แล้วยังยกเลิก", why(p));
  });
  await step("W5", async () => {
    const p: string[] = [];
    const so3 = await shopTry("createOrder", () => shop.createOrder(sctx("S"), { customerName: "คุณถูกปฏิเสธ", customerPhone: "0811115555", lines: [{ productId: SP.hat, qty: 1 }] }), p);
    const o = (await poOfShop(so3?.id ?? ""))[0];
    const r = o ? await O("rejectOrder", ctxU("S"), A("MGR"), { id: o.id, reasonCode: "OUT_OF_STOCK" }) : null;
    if (r?.ok !== true) p.push(`rejectOrder → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
    await drain();
    const st = async () => (so3?.id ? (await P.shopOrder.findUnique({ where: { id: so3.id } }).catch(() => null))?.status : null);
    if ((await st()) !== "CANCELLED") p.push(`ShopOrder ${await st()} (คาด CANCELLED)`);
    const v0 = o ? (await row(o.id))?.version : null;
    const ev = o ? (await obx("pos.order.rejected", o.id))[0] : null;
    const h = consMod?.consumers?.["pos.order.rejected"];
    if (ev && typeof h === "function")
      for (let i = 0; i < 2; i++) {
        try {
          await h(ev);
        } catch (e) {
          p.push(`เล่นซ้ำ throw ${(e as Error).message.slice(0, 50)}`);
        }
      }
    else p.push("ไม่มี event/consumer pos.order.rejected");
    await drain();
    if ((await st()) !== "CANCELLED" || (o && (await row(o.id))?.version !== v0)) p.push("เล่นซ้ำแล้วเปลี่ยน");
    chk("W5", good(p), "REJECTED → ShopOrder CANCELLED · เล่นซ้ำไม่เปลี่ยน", why(p));
  });
  await step("W9", async () => {
    const p: string[] = [];
    const so9 = await shopTry("createOrder", () => shop.createOrder(sctx("S"), { customerName: "คุณจ่ายแล้ว", customerPhone: "0811119999", lines: [{ productId: SP.hat, qty: 1 }] }), p);
    const cf = so9?.id ? await shopTry("confirmOrderPaid", () => shop.confirmOrderPaid(sctx("S"), so9.id), p) : null;
    if (!fx && cf?.ok !== true) p.push(`(ตั้งต้น) confirmOrderPaid → ${short(cf, 60)}`);
    await drain();
    const o = (await poOfShop(so9?.id ?? ""))[0];
    if (!fx && (!o || o.status !== "NEW" || o.paymentState !== "PAID" || o.saleId !== cf?.posSaleId)) p.push(`(ตั้งต้น) ออเดอร์เว็บที่จ่ายแล้ว ${ordStr(o)} (คาด NEW PAID + saleId)`);
    const v0 = o?.version;
    const r = o ? await O("rejectOrder", ctxU("S"), A("MGR"), { id: o.id, reasonCode: "OUT_OF_STOCK" }) : null;
    if (!refused(r, "ORDER_STATE_INVALID")) p.push(`reject ออเดอร์เว็บที่จ่ายแล้ว → ${codeOf(r)} (คาด ORDER_STATE_INVALID)`);
    else if (!/คืนเงิน|หน้าเว็บร้าน/.test(String(r?.message ?? ""))) p.push(`ข้อความ ${short(r?.message, 60)} (คาดบอกให้คืนเงิน/ยกเลิกที่หน้าเว็บร้าน)`);
    // EDIT (P2.8 fix รอบ 3 · R2 nit): ยกเลิกออเดอร์เว็บที่จ่ายแล้วก็ถูกปฏิเสธด้วยเหตุเดียวกัน
    const rc = o ? await O("cancelOrder", ctxU("S"), A("MGR"), { id: o.id, reason: "ลูกค้าขอยกเลิก" }) : null;
    if (!refused(rc, "ORDER_STATE_INVALID") || !/คืนเงิน|หน้าเว็บร้าน/.test(String(rc?.message ?? ""))) p.push(`cancel ออเดอร์เว็บที่จ่ายแล้ว → ${codeOf(rc)} ${short(rc?.message ?? "", 40)} (คาด ORDER_STATE_INVALID · คืนเงิน/ยกเลิกที่หน้าเว็บร้าน)`);
    await drain();
    const o1 = o ? await row(o.id) : null;
    if (o && (o1?.status !== "NEW" || o1?.paymentState !== "PAID" || o1?.version !== v0)) p.push(`ออเดอร์หลังปฏิเสธ ${ordStr(o1)} (คาดไม่เปลี่ยน v${v0})`);
    const shopSt = so9?.id ? (await P.shopOrder.findUnique({ where: { id: so9.id } }).catch(() => null))?.status : null;
    const saleSt = cf?.posSaleId ? (await P.posSale.findUnique({ where: { id: cf.posSaleId } }).catch(() => null))?.status : null;
    if (!fx && (shopSt !== "PAID" || saleSt !== "PAID")) p.push(`ShopOrder ${shopSt} · บิล ${saleSt} (คาด PAID · PAID)`);
    // ตัวควบคุม: ออเดอร์เว็บที่ยังไม่จ่าย → ปฏิเสธได้ → ตัวรับคิวยกเลิก ShopOrder
    const so9b = await shopTry("createOrder", () => shop.createOrder(sctx("S"), { customerName: "คุณยังไม่จ่าย", customerPhone: "0811119998", lines: [{ productId: SP.hat, qty: 1 }] }), p);
    const ob = (await poOfShop(so9b?.id ?? ""))[0];
    const rb = ob ? await O("rejectOrder", ctxU("S"), A("MGR"), { id: ob.id, reasonCode: "OUT_OF_STOCK" }) : null;
    if (!fx && rb?.ok !== true) p.push(`(ตัวควบคุม) reject ออเดอร์เว็บที่ยังไม่จ่าย → ${codeOf(rb)}`);
    await drain();
    const sb = so9b?.id ? (await P.shopOrder.findUnique({ where: { id: so9b.id } }).catch(() => null))?.status : null;
    if (!fx && sb !== "CANCELLED") p.push(`(ตัวควบคุม) ShopOrder ${sb} (คาด CANCELLED)`);
    chk("W9", good(p), "PAID WEB → ORDER_STATE_INVALID · ไม่มีอะไรเปลี่ยน · ยังไม่จ่าย → ยกเลิก ShopOrder", why(p));
  });
  await step("W7", async () => {
    const p: string[] = [];
    if (PCP && !fx) await PCP.deleteMany({ where: { tenantId: T, productId: PR.tee, channelCode: "WEB" } }).catch(() => null);
    const bf = () => call(catalog, "backfillWebPrices", { tenantIds: [T], dryRun: false });
    const b1 = fx ? null : await bf();
    const b2 = fx ? null : await bf();
    if (b1?.ok === false) p.push(`backfill รอบแรก → ${codeOf(b1)}`);
    if (!(Number(b1?.written) >= 1)) p.push(`รอบแรก written ${short(b1?.written)} (คาด ≥ 1)`);
    if (Number(b2?.written) !== 0 || b2?.ok === false) p.push(`รอบสอง written ${short(b2?.written)} (คาด 0)`);
    const wr = PCP ? ((await PCP.findMany({ where: { tenantId: T, productId: PR.tee, channelCode: "WEB", unitId: null } }).catch(() => [])) as Any[]) : [];
    if (wr.length !== 1 || wr[0]?.priceSatang !== 25000) p.push(`แถว WEB เสื้อหลัง backfill ${short(wr.map((r: Any) => r.priceSatang))}`);
    if (!(Number(b2?.webPriceConflict) >= 1)) p.push(`webPriceConflict ${short(b2?.webPriceConflict)} (คาด ≥ 1)`);
    if (!(Array.isArray(b2?.conflicts) && b2.conflicts.some((c: Any) => c?.posProductId === PR.cup))) p.push(`conflicts ไม่มีแก้ว (${short(b2?.conflicts, 80)})`);
    const oS = await shopTry("createOrder S", () => shop.createOrder(sctx("S"), { customerName: "คุณแก้ว", customerPhone: "0811116666", lines: [{ productId: SP.cupS, qty: 1 }] }), p);
    const oS2 = await shopTry("createOrder S2", () => shop.createOrder(sctx("S2"), { customerName: "คุณแก้วสอง", customerPhone: "0811117777", lines: [{ productId: SP.cupS2, qty: 1 }] }), p);
    if (oS?.totalSatang !== 9000 || oS2?.totalSatang !== 9500) p.push(`แก้ว S ${short(oS?.totalSatang)} · S2 ${short(oS2?.totalSatang)} (คาด 9000 · 9500)`);
    chk("W7", good(p) && !!PCP, "backfill เขียนแถวที่หาย · รอบสอง 0 · conflict นับ + ราคาของตัวเอง", why(p) + SOFT());
  });

  /** แทนตัวรับคิวชั่วคราว (ข้อสอบเท่านั้น · fix รอบ 3): "run" = รอประตูเปิดแล้วรันตัวจริง · "skip" = รอประตูเปิดแล้วไม่รัน (จำลองขั้นเสริมที่ล้มเงียบ/แถว DONE โดยไม่รัน)
   *  ห้ามเรียก drain() ก่อน open() (ตัวระบายในโปรเซสต่อคิวกัน) · restore() คืนตัวจริง */
  const swapConsumer = (type: string, mode: "run" | "skip", gated = true) => {
    const cons = consMod?.consumers as Record<string, Any> | undefined;
    const orig = cons?.[type];
    let opened = !gated;
    let openFn: () => void = () => {};
    const gate = gated ? new Promise<void>((r) => (openFn = r)) : Promise.resolve();
    if (cons && orig) cons[type] = async (e: Any) => {
      await gate;
      if (mode === "run") await orig(e);
    };
    return { ok: !!(cons && orig), open: () => { if (!opened) { opened = true; openFn(); } }, restore: () => { if (cons && orig) cons[type] = orig; } };
  };
  await step("W11", async () => {
    const p: string[] = [];
    // (a) ปฏิเสธก่อน (คิวยังไม่ระบาย) → ยืนยันรับเงิน ⇒ ปฏิเสธการยืนยัน ไม่มีบิล ECOM · ระบายแล้ว ShopOrder CANCELLED
    const hRej = swapConsumer("pos.order.rejected", "run");
    let soA: Any = null;
    try {
      soA = await shopTry("createOrder", () => shop.createOrder(sctx("S"), { customerName: "คุณถูกปฏิเสธก่อนจ่าย", customerPhone: "0811110021", lines: [{ productId: SP.hat, qty: 1 }] }), p);
      const oa = (await poOfShop(soA?.id ?? ""))[0];
      const rj = oa ? await O("rejectOrder", ctxU("S"), A("MGR"), { id: oa.id, reasonCode: "TOO_BUSY" }) : null;
      if (!fx && rj?.ok !== true) p.push(`(a ตั้งต้น) reject → ${codeOf(rj)}`);
      const cfA = soA?.id ? await shopTry("confirmOrderPaid", () => shop.confirmOrderPaid(sctx("S"), soA.id), p) : null;
      if (!fx && cfA?.ok !== false) p.push(`(a) confirmOrderPaid หลังปฏิเสธ → ${short(cfA, 60)} (คาด ok:false)`);
      const nA = soA?.id ? Number(await P.posSale.count({ where: { tenantId: T, idempotencyKey: `ecom-${soA.id}` } }).catch(() => -1)) : -1;
      if (!fx && nA !== 0) p.push(`(a) บิล ecom-<id> ${nA} (คาด 0)`);
    } finally {
      hRej.open();
      hRej.restore();
    }
    await drain();
    const stA = soA?.id ? (await P.shopOrder.findUnique({ where: { id: soA.id } }).catch(() => null))?.status : null;
    if (!fx && stA !== "CANCELLED") p.push(`(a) ShopOrder หลังระบาย ${stA} (คาด CANCELLED)`);
    // (b) ยืนยันรับเงินก่อน (ไม่ระบาย) ⇒ ออเดอร์ PAID ทันที ⇒ ปฏิเสธ = webPaid · (c) แถว shop.order.paid DONE โดยไม่รันตัวผูก ⇒ ยัง PAID + saleId
    const hPaid = swapConsumer("shop.order.paid", "skip");
    let soB: Any = null;
    let cfB: Any = null;
    let obId = "";
    try {
      soB = await shopTry("createOrder", () => shop.createOrder(sctx("S"), { customerName: "คุณจ่ายก่อน", customerPhone: "0811110022", lines: [{ productId: SP.hat, qty: 1 }] }), p);
      cfB = soB?.id ? await shopTry("confirmOrderPaid", () => shop.confirmOrderPaid(sctx("S"), soB.id), p) : null;
      if (!fx && cfB?.ok !== true) p.push(`(b ตั้งต้น) confirmOrderPaid → ${short(cfB, 60)}`);
      const ob = (await poOfShop(soB?.id ?? ""))[0];
      obId = String(ob?.id ?? "");
      if (!fx && ob?.paymentState !== "PAID") p.push(`(b) ก่อนระบายคิว ออเดอร์ ${ordStr(ob)} (คาด PAID ทันทีที่ยืนยัน)`);
      const rjB = ob ? await O("rejectOrder", ctxU("S"), A("MGR"), { id: ob.id, reasonCode: "OUT_OF_STOCK" }) : null;
      if (!refused(rjB, "ORDER_STATE_INVALID") || !/คืนเงิน|หน้าเว็บร้าน/.test(String(rjB?.message ?? ""))) p.push(`(b) reject หลังยืนยัน (ก่อนระบาย) → ${codeOf(rjB)} (คาด ORDER_STATE_INVALID webPaid)`);
    } finally {
      hPaid.open();
    }
    await drain();
    hPaid.restore();
    const ev = soB?.id ? (await obx("shop.order.paid", soB.id))[0] : null;
    if (!fx && ev?.status !== "DONE") p.push(`(c) แถว shop.order.paid ${short(ev?.status)} (คาด DONE โดยไม่รันตัวผูก)`);
    const obb = obId ? await row(obId) : null;
    if (!fx && (obb?.paymentState !== "PAID" || obb?.saleId !== cfB?.posSaleId || obb?.status !== "NEW")) p.push(`(c) ออเดอร์ ${ordStr(obb)} saleId ${obb?.saleId === cfB?.posSaleId ? "ตรง" : "ไม่ตรง"} (คาด NEW PAID + saleId จากธุรกรรมของเว็บร้าน)`);
    chk("W11", good(p) && hRej.ok && hPaid.ok, "ปฏิเสธก่อน → ยืนยันถูกปฏิเสธ ไม่มีบิล · ยืนยันก่อน → PAID ทันที → ปฏิเสธไม่ได้ · ไม่พึ่งตัวรับคิว", why(p));
  });
  await step("W10", async () => {
    const p: string[] = [];
    const ruleMod = await tryImport("@/lib/modules/pos/price-rule");
    let sp10 = "";
    if (!fx)
      try {
        sp10 = String((await shop.createProduct(sctx("B"), { name: `ของชั้นราคา ${RAND}`, priceSatang: 20000 }))?.id ?? "");
      } catch (e) {
        p.push(`(ตั้งต้น) สินค้าเว็บสาขา B throw ${(e as Error).message.slice(0, 60)}`);
      }
    const row10 = sp10 ? String((await P.shopProduct.findUnique({ where: { id: sp10 } }).catch(() => null))?.posProductId ?? "") : "";
    if (!fx && !row10) p.push("(ตั้งต้น) ไม่มีแถวแคตตาล็อก");
    const webRows = PCP && row10 ? Number(await PCP.count({ where: { tenantId: T, productId: row10, channelCode: "WEB" } }).catch(() => -1)) : -1;
    if (!fx && webRows !== 0) p.push(`(ตั้งต้น) แถว WEB ${webRows} (คาด 0 — ราคาเว็บ = ราคาฐาน)`);
    const br = fx || !row10 ? null : await setCp(row10, [{ channelCode: null, unitId: U.B, priceSatang: 17000 }]);
    if (br?.ok === false) p.push(`(ตั้งต้น) แถวสาขา B → ${codeOf(br)}`);
    const ruleIn = (o: Any): Any => ({ name: `โปร ${RAND}`, kind: "PROMO", active: true, priority: 0, productIds: [row10 || "none"], categoryIds: [], channelCodes: [], unitIds: [], adjust: "PERCENT_OFF", valueSatang: null, valueBp: 1000, startsAt: null, endsAt: null, weekdays: [], timeFrom: null, timeTo: null, ...o });
    const ruleIds: string[] = [];
    const save = async (lbl: string, o: Any) => {
      const r = fx ? null : await call(ruleMod, "savePriceRule", ctxU("A"), A("OWNER"), ruleIn(o));
      if (r?.ok !== true) p.push(`(ตั้งต้น) ${lbl} → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
      else ruleIds.push(String(r.rule?.id ?? ""));
    };
    const priceIn = async (): Promise<number | undefined> => {
      const ls = await shopTry("listProducts", () => shop.listProducts(sctx("B"), { activeOnly: true, storefront: true }), p);
      return (Array.isArray(ls) ? ls : []).find((x: Any) => x.id === sp10)?.priceSatang;
    };
    const orderTotal = async (): Promise<number | undefined> => (await shopTry("createOrder", () => shop.createOrder(sctx("B"), { customerName: "คุณชั้นราคา", customerPhone: "0811110010", lines: [{ productId: sp10, qty: 1 }] }), p))?.totalSatang;
    await save("กติกาทุกช่องทาง −10%", { name: `ทุกช่องทาง −10% ${RAND}` });
    const l0 = fx ? undefined : await priceIn();
    const t0 = fx ? undefined : await orderTotal();
    if (l0 !== 20000 || t0 !== 20000) p.push(`แถวสาขา + กติกาทุกช่องทาง: storefront ${short(l0)} · createOrder ${short(t0)} (คาด 20000 · 20000 = ราคา ShopProduct)`);
    await save("กติกา WEB −20%", { name: `WEB −20% ${RAND}`, channelCodes: ["WEB"], valueBp: 2000, priority: 10 });
    const l1 = fx ? undefined : await priceIn();
    const t1 = fx ? undefined : await orderTotal();
    if (l1 !== 16000 || t1 !== 16000) p.push(`กติกาที่ระบุ WEB: storefront ${short(l1)} · createOrder ${short(t1)} (คาด 16000 · 16000)`);
    // EDIT (P2.8 fix รอบ 3 · H5): บรรทัดของบิลเว็บร้าน (ยืนยันรับเงิน) บอกที่มา RULE + รหัสกติกา WEB (ผ่านบรรทัดออเดอร์ในจอ POS)
    if (!fx && sp10 && ruleIds[1]) {
      const soR = await shopTry("createOrder", () => shop.createOrder(sctx("B"), { customerName: "คุณกติกาเว็บ", customerPhone: "0811110011", lines: [{ productId: sp10, qty: 1 }] }), p);
      const cfR = soR?.id ? await shopTry("confirmOrderPaid", () => shop.confirmOrderPaid(sctx("B"), soR.id), p) : null;
      const sl = cfR?.posSaleId ? ((await P.posSaleLine.findMany({ where: { saleId: cfR.posSaleId } }).catch(() => [])) as Any[]) : [];
      const ln10 = sl.find((l: Any) => l.productId === row10);
      if (!ln10 || ln10.priceSource !== "RULE" || ln10.priceRuleId !== ruleIds[1] || ln10.unitPriceSatang !== 16000) p.push(`บรรทัดบิลเว็บของกติกา WEB ${short(ln10 && { s: ln10.priceSource, r: ln10.priceRuleId === ruleIds[1] ? "ตรง" : ln10.priceRuleId, u: ln10.unitPriceSatang }, 80)} (คาด RULE · รหัสกติกา WEB · 16000)`);
    }
    for (const id of ruleIds) if (id) await call(ruleMod, "archivePriceRule", ctxU("A"), A("OWNER"), { id });
    chk("W10", good(p) && !!PCP, "ไม่มีแถว WEB: แถวสาขา/กติกาทุกช่องทางไม่ถึงหน้าเว็บ · กติกา WEB ถึง", why(p));
  });

  // ════════ R ตัวอ่าน ════════
  const CARD_KEYS = ["id", "channel", "ref", "status", "paymentState", "itemCount", "totalSatang", "customerName", "phoneMasked", "fulfilment", "note", "receivedAt", "acceptBy", "acceptRemainingSec", "prepDueAt", "lateMinutes", "saleId"];
  const list = (u: string, actor: string, input: Any = {}) => O("listOrders", ctxU(u), A(actor), input);
  await step("R1", async () => {
    const p: string[] = [];
    const lo = fx ? null : await list("A", "MGR", {});
    const rows = PO ? ((await PO.findMany({ where: { tenantId: T, unitId: U.A } }).catch(() => [])) as Any[]) : [];
    if (lo?.ok !== true) p.push(`listOrders → ${codeOf(lo)}`);
    else {
      const cnt = (f: (o: Any) => boolean) => rows.filter(f).length;
      const wantCol = { new: cnt((o) => o.status === "NEW"), preparing: cnt((o) => o.status === "ACCEPTED" || o.status === "PREPARING"), ready: cnt((o) => o.status === "READY"), done: cnt((o) => o.status === "HANDED") };
      if (Object.entries(wantCol).some(([k, v]) => lo.counts?.byColumn?.[k] !== v)) p.push(`byColumn ${short(lo.counts?.byColumn, 100)} (คาด ${short(wantCol, 100)})`);
      const byCh: Record<string, number> = {};
      for (const o of rows) byCh[o.channelId] = (byCh[o.channelId] ?? 0) + 1;
      if (Object.entries(byCh).some(([k, v]) => lo.counts?.byChannel?.[k] !== v) || Object.keys(lo.counts?.byChannel ?? {}).some((k) => (lo.counts.byChannel[k] ?? 0) !== (byCh[k] ?? 0))) p.push(`byChannel ${short(lo.counts?.byChannel, 120)} (คาด ${short(byCh, 120)})`);
      const live = rows.filter((o) => o.status !== "REJECTED" && o.status !== "CANCELLED");
      const sm = lo.summary ?? {};
      if (sm.count !== rows.length || sm.totalSatang !== sum(live.map((o) => o.totalSatang)) || sm.rejectedCancelled !== rows.length - live.length) p.push(`summary ${short({ c: sm.count, t: sm.totalSatang, rc: sm.rejectedCancelled }, 80)} (คาด ${rows.length} · ${sum(live.map((o) => o.totalSatang))} · ${rows.length - live.length})`);
      if (!Number.isInteger(sm.avgAcceptSeconds) || sm.avgAcceptSeconds < 0) p.push(`avgAcceptSeconds ${short(sm.avgAcceptSeconds)}`);
      if (sm.onTime?.m !== wantCol.done || !(sm.onTime?.n >= 0 && sm.onTime?.n <= sm.onTime?.m)) p.push(`onTime ${short(sm.onTime, 40)} (m คาด ${wantCol.done})`);
      const cards: Any[] = Array.isArray(lo.orders) ? lo.orders : [];
      if (cards.length !== rows.length) p.push(`การ์ด ${cards.length} (คาด ${rows.length})`);
      const c = cards.find((x) => x.id === ORD.LM);
      if (!c) p.push("ไม่มีการ์ด LM-48213");
      else {
        const miss = CARD_KEYS.filter((k) => !(k in c));
        if (miss.length) p.push(`การ์ดขาดคีย์ ${miss.join(",")}`);
        if (c.ref !== "LM-48213" || c.itemCount !== 3 || c.totalSatang !== 42000 || c.channel?.code !== "LINEMAN" || c.channel?.name !== `LINE MAN ${RAND}` || c.status !== "ACCEPTED" || !c.saleId) p.push(`การ์ด ${short({ ref: c.ref, n: c.itemCount, t: c.totalSatang, ch: c.channel, st: c.status }, 120)}`);
      }
      const fNew = fx ? null : await list("A", "MGR", { status: "NEW" });
      if (!(Array.isArray(fNew?.orders) && fNew.orders.length === wantCol.new && fNew.orders.every((x: Any) => x.status === "NEW"))) p.push(`กรอง NEW ${short(fNew?.orders?.length)} (คาด ${wantCol.new})`);
      const fCh = fx ? null : await list("A", "MGR", { channelId: CH.LM });
      if (!(Array.isArray(fCh?.orders) && fCh.orders.length === (byCh[CH.LM!] ?? 0) && fCh.orders.every((x: Any) => x.channel?.code === "LINEMAN"))) p.push(`กรอง LINEMAN ${short(fCh?.orders?.length)} (คาด ${byCh[CH.LM!] ?? 0})`);
    }
    chk("R1", good(p), "คอลัมน์ · ช่องทาง · สรุปวัน · การ์ด · ตัวกรอง ตรง DB", why(p));
  });
  await step("R2", async () => {
    const p: string[] = [];
    const g = fx ? null : await O("getOrder", ctxU("A"), A("MGR"), { id: ORD.LM });
    if (g?.ok !== true) p.push(`getOrder → ${codeOf(g)}`);
    const want = typeof chShared?.channelCommission === "function" ? chShared.channelCommission(42000, { commissionBp: 3000, commissionFixedSatang: 0, commissionVatBp: 0 }) : null;
    const cm = g?.order?.commission;
    if (cm?.commissionSatang !== 12600 || cm?.commissionVatSatang !== 0 || cm?.netSatang !== 29400 || cm?.commissionSatang !== want?.commissionSatang) p.push(`commission LM ${short(cm, 100)} (คาด 12600/0/29400)`);
    const ls: Any[] = g?.order?.lines ?? [];
    const pt = ls.find((l: Any) => l.productId === PR.padthai);
    if (ls.length !== 3 || pt?.options?.length !== 1 || pt?.note !== "ไม่ใส่ผักชี") p.push(`บรรทัด ${ls.length} · options ${short(pt?.options?.length)} · note ${short(pt?.note, 20)}`);
    const rows = PO ? ((await PO.findMany({ where: { tenantId: T, unitId: U.A, customerPhone: "0812341234" } }).catch(() => [])) as Any[]) : [];
    const hc = rows.length;
    const ha = hc ? Math.round(sum(rows.map((o) => o.totalSatang)) / hc) : 0;
    if (g?.order?.history?.count !== hc || g?.order?.history?.avgSatang !== ha) p.push(`history ${short(g?.order?.history, 60)} (คาด ${hc} · ${ha})`);
    const gg = fx || !ORD.GB ? null : await O("getOrder", ctxU("A"), A("MGR"), { id: ORD.GB });
    const cg = gg?.order?.commission;
    if (cg?.commissionSatang !== 7950 || cg?.commissionVatSatang !== 557 || cg?.netSatang !== 22493) p.push(`commission GRAB ${short(cg, 100)} (คาด 7950/557/22493)`);
    chk("R2", good(p), "commission 126/294 · GRAB 79.50/5.57/224.93 · บรรทัด · history", why(p));
  });
  await step("R3", async () => {
    const p: string[] = [];
    const n = await mk("LM-48330", "A", "STAFF", lmInput("LM-48330", { startStatus: "NEW" }));
    const card = async (id: string, status?: string) => ((await list("A", "MGR", status ? { status } : {}))?.orders ?? []).find((x: Any) => x.id === id);
    if (n.id && PO) {
      const rAt = new Date(Date.now() - 50_000);
      await PO.update({ where: { id: n.id }, data: { receivedAt: rAt } });
      const c = await card(n.id, "NEW");
      if (!(c?.acceptRemainingSec >= 68 && c?.acceptRemainingSec <= 70)) p.push(`50 วิ → acceptRemainingSec ${short(c?.acceptRemainingSec)} (คาด 68–70)`);
      if (Math.abs(new Date(c?.acceptBy ?? 0).getTime() - (rAt.getTime() + 120_000)) > 1000) p.push(`acceptBy ${short(c?.acceptBy, 30)} (คาด receivedAt + 120 วิ)`);
      await PO.update({ where: { id: n.id }, data: { receivedAt: new Date(Date.now() - 200_000) } });
      const c2 = await card(n.id, "NEW");
      if (c2?.acceptRemainingSec !== 0) p.push(`200 วิ → ${short(c2?.acceptRemainingSec)} (คาด 0)`);
    } else p.push("ไม่มีออเดอร์ NEW");
    const m = await mk("LM-48331", "A", "STAFF", lmInput("LM-48331", { startStatus: "NEW" }));
    const ra = fx || !m.id ? null : await O("acceptOrder", ctxU("A", DEV1), A("STAFF2"), { id: m.id, prepMinutes: 15 });
    if (ra?.ok !== true) p.push(`accept → ${codeOf(ra)}`);
    else if (PO) {
      const aAt = new Date(Date.now() - 20 * MIN);
      await PO.update({ where: { id: m.id }, data: { acceptedAt: aAt, receivedAt: new Date(aAt.getTime() - MIN) } });
      const c = await card(m.id);
      if (Math.abs(new Date(c?.prepDueAt ?? 0).getTime() - (aAt.getTime() + 15 * MIN)) > 1000) p.push(`prepDueAt ${short(c?.prepDueAt, 30)} (คาด acceptedAt + 15 นาที)`);
      if (c?.lateMinutes !== 5) p.push(`lateMinutes ${short(c?.lateMinutes)} (คาด 5)`);
    }
    chk("R3", good(p), "acceptRemainingSec · acceptBy · prepDueAt · lateMinutes", why(p));
  });
  await step("R4", async () => {
    const p: string[] = [];
    const rr = fx ? null : await list("A", "STAFFR", {});
    const rs = fx ? null : await list("A", "STAFF", {});
    const rn = fx ? null : await list("A", "NOPERM", {});
    if (rr?.ok !== true) p.push(`STAFFR → ${codeOf(rr)}`);
    if (rs?.ok !== true) p.push(`STAFF → ${codeOf(rs)}`);
    if (!refused(rn, "PERMISSION_DENIED")) p.push(`NOPERM → ${codeOf(rn)}`);
    const c = (rr?.orders ?? []).find((x: Any) => x.id === ORD.LM);
    if (c?.phoneMasked !== "08x-xxx-1234") p.push(`phoneMasked ${short(c?.phoneMasked, 20)}`);
    const js = short(rr, 1_000_000);
    if (/0812341234|081-234-1234/.test(js)) p.push("ผลมีเบอร์เต็ม");
    chk("R4", good(p), "STAFFR/STAFF ok · NOPERM PERMISSION_DENIED · เบอร์ปิดบัง", why(p));
  });

  // ════════ E event ════════
  const TYPE_STATUS: Record<string, string[]> = { "pos.order.received": ["NEW", "ACCEPTED"], "pos.order.accepted": ["ACCEPTED"], "pos.order.rejected": ["REJECTED"], "pos.order.ready": ["READY"], "pos.order.completed": ["HANDED"], "pos.order.cancelled": ["CANCELLED"] };
  await step("E1", async () => {
    const p: string[] = [];
    const evs = (await P.outboxEvent.findMany({ where: { tenantId: T, type: { startsWith: "pos.order." } } }).catch(() => [])) as Any[];
    const orders = PO ? ((await PO.findMany({ where: { tenantId: T } }).catch(() => [])) as Any[]) : [];
    const byId = new Map(orders.map((o: Any) => [o.id, o]));
    const seen = new Map<string, number>();
    for (const e of evs) {
      const pl = e.payload ?? {};
      const miss = ["orderId", "channelId", "channelCode", "status"].filter((k) => !(k in pl));
      if (miss.length) p.push(`${e.type} payload ขาด ${miss.join(",")}`);
      const o = byId.get(pl.orderId);
      if (!o) p.push(`${e.type} ออเดอร์ไม่พบ`);
      else if (pl.channelId !== o.channelId || pl.channelCode !== o.channelCode) p.push(`${e.type} ช่องทางไม่ตรง`);
      if (!(TYPE_STATUS[e.type] ?? []).includes(pl.status)) p.push(`${e.type} status ${short(pl.status)}`);
      const k = `${pl.orderId}|${e.type}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const dup = [...seen.entries()].filter(([, n]) => n > 1);
    if (dup.length) p.push(`ซ้ำ ${dup.length} คู่ (${short(dup[0], 60)})`);
    const noRecv = orders.filter((o: Any) => !seen.has(`${o.id}|pos.order.received`));
    if (noRecv.length) p.push(`ออเดอร์ไม่มี received ${noRecv.length}`);
    if (!evs.length) p.push("ไม่มี pos.order.* เลย");
    for (const t of EVENTS) if (typeof consMod?.consumers?.[t] !== "function") p.push(`consumers ไม่มี ${t}`);
    const labels = rd(F.autoLabels);
    for (const t of EVENTS) if (!labels.includes(`"${t}"`)) p.push(`automation labels ไม่มี ${t}`);
    chk("E1", good(p), "ละ 1 ต่อ (ออเดอร์, ชนิด) · payload 4 คีย์ตรง · status ตรงชนิด · ลงทะเบียน 6", why(p) + ` · ${evs.length} แถว`);
  });
  await step("E2", async () => {
    const p: string[] = [];
    const snap = async () =>
      short(
        [
          PO ? ((await PO.findMany({ where: { tenantId: T }, select: { id: true, version: true, status: true, paymentState: true }, orderBy: { id: "asc" } }).catch(() => [])) as Any[]) : [],
          ((await P.shopOrder.findMany({ where: { tenantId: T }, select: { id: true, status: true }, orderBy: { id: "asc" } }).catch(() => [])) as Any[]),
          Number(await P.outboxEvent.count({ where: { tenantId: T } }).catch(() => -1)),
        ],
        1_000_000,
      );
    await drain();
    const s0 = await snap();
    const evs = (await P.outboxEvent.findMany({ where: { tenantId: T, type: { startsWith: "pos.order." } } }).catch(() => [])) as Any[];
    let n = 0;
    for (let i = 0; i < 2; i++)
      for (const e of evs) {
        const h = consMod?.consumers?.[e.type];
        if (typeof h !== "function") continue;
        try {
          await h(e);
          n++;
        } catch (err) {
          p.push(`${e.type} throw ${(err as Error).message.slice(0, 40)}`);
        }
      }
    await drain();
    const s1 = await snap();
    if (s0 !== s1) p.push("เล่นซ้ำแล้วสถานะ/เวอร์ชัน/จำนวน outbox เปลี่ยน");
    if (!evs.length) p.push("ไม่มี event ให้เล่นซ้ำ");
    chk("E2", good(p), "เล่นซ้ำ 2 รอบ ไม่มีผลซ้ำ", why(p) + ` · ขับ ${n} ครั้ง`);
  });
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งสาม + ผู้ใช้ชั่วคราว ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; usersLeft: number; err: string };
async function wipeTenants(): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
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
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
let wipe: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
try {
  await runStatic();
  await runPure(sharedMod, regSharedMod);
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    wipe = await wipeTenants();
    const residue = Object.values(wipe.left).reduce((a, b) => a + Math.abs(b), 0) + wipe.tenantLeft + wipe.usersLeft;
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"} + ${T2 || "-"} + ${T3 || "-"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft} · ผู้ใช้ ${wipe.usersLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
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
chk("Z1", tempLeft.length === 0 && wipe.tenantLeft === 0 && wipe.usersLeft === 0 && !wipe.err, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0",
  [tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "แถว Tenant ยังอยู่" : "", wipe.usersLeft ? `ผู้ใช้เหลือ ${wipe.usersLeft}` : "ผู้ใช้ 0", wipe.err].filter(Boolean).join(" · "));
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
  await n("shopProduct", () => P.shopProduct.count({ where: { name: { contains: RAND } } }));
  await n("salesChannel", () => P.salesChannel.count({ where: { name: { contains: RAND } } }));
  await n("posProduct", () => P.posProduct.count({ where: { name: { contains: RAND }, createdAt: { gte: since } } }));
  await n("auditLog", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "createdAt" >= $1 AND (coalesce("after"::text,'') || coalesce("before"::text,'')) LIKE $2`, since, like)) as Any[])[0]?.n);
  await n("outboxEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "createdAt" >= $1 AND ("payload"::text LIKE $2 OR "idempotencyKey" LIKE $2)`, since, like)) as Any[])[0]?.n);
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
const parIds = CHECKS.filter(([, x]) => x === "PAR").map(([id]) => id);
const parRed = parIds.filter((id) => failed.includes(id));
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""} · PAR ${parIds.length - parRed.length}/${parIds.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, parRed, skipped: false, forced: FORCE, missing: skipReasons, guardHits: guardHits.length, residue: tempLeft.length + wipe.tenantLeft + wipe.usersLeft, leaks, fpDrift })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P2.8 S: จอ 09 (P2.8U · visual ของผู้คุมงาน) · แท็บโหมด "ออเดอร์ออนไลน์" · แบบฟอร์มคีย์ออเดอร์ (รอเจ้าของ · มติ 8) · เสียงเตือน ·
//   API/เว็บฮุคแพลตฟอร์ม + ซิงก์เมนู (P3.1–3.3) · บอทสถานะในแชท (P3.7) · PENDING_PAYMENT/ใบขอรับเงินผู้จ่ายทางไกล (P2.7) · KDS/ใบครัว/พักอัตโนมัติเมื่อครัวค้าง (P2.6) ·
//   ใบปะหน้า/ไรเดอร์ (P3) · รายงานช่องทาง (P2.12) · รอบ QR โต๊ะ (มติ 6 · PLANNED จน P2.7)
//   ชุด regression (qc-shop · qc-shop-refund · qc-pos-p2.1 p2.2 p2.3 p2.4 · p1.16 p1.8 p1.6 (ORACLE-EDIT) p1.18 (ORACLE-EDIT) p1.3 p1.5 p1.9 p1.12 p1.13 · qc-pos-account · ชุดเงิน) ผู้สร้างรันก่อน/หลัง (ผลต้องเท่าเดิม)
