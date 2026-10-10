// QC — POS RUN ใบ P2.4: โหมดโต๊ะในหน้าขาย (ผังโต๊ะ · เปิด/ปิด/เก็บโต๊ะ · รอบร่าง = บิลพักผูกโต๊ะ · ส่งรอบ = RestaurantOrder ·
//   เช็คบิลผ่าน quote/submit ของหน้าขายด้วย tableSessionId + ยึดรายการในธุรกรรมเดียว · ตัวรับ void · โต๊ะจองแบบย่อ · ของเดิมแช่แข็ง)
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ · ไม่ต้องมี seed (ร้านชั่วคราว + ผู้ใช้ชั่วคราวของตัวเอง)
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.4.md §2 R1–R12 · §3 migration · §4 แผนข้อสอบ · §5 CD1–CD8 · §9 มติผู้คุมงาน (ผูกมัด: ราคาแช่แข็งตอนส่งรอบ ·
//        โต๊ะจองแบบย่อ (คิว = PLANNED) · ค่าบริการจากค่าตั้ง POS เท่านั้น · QR_TABLE เมื่อแขกเปิดโต๊ะ · ไม่มีค่าตั้งใหม่ · หน้าเดิมคงอยู่ ·
//        ย้าย/รวม = PLANNED · advisory lock ตอนเปิดโต๊ะ · X/Z แสดงอย่างเดียว)
//        ต่อยอด: qc-restaurant* (fixture เมนู/โต๊ะ/ออเดอร์/เช็คบิล — ต้องเขียวเหมือนเดิมทุกไบต์) · qc-pos-p1.5 (บิลพัก) · qc-pos-p1.3 (quote/submit) ·
//        qc-pos-p1.6 (ทะเบียนผู้เรียก createSale) · qc-pos-p2.1 (ร้านชั่วคราว · ช่องทาง · GL) · qc-pos-p1.12 (สมาชิก/ระดับ) · qc-pos-p2.3 (โครงข้อสอบ)
//        โน้ต: ledger/wo-notes/pos-P2.4-oracle.md (ตารางชื่อ = สัญญาของผู้สร้าง S · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P2.4 (S) ต้องส่ง (ย่อ — ละเอียดในโน้ต):
//   migration `20261206100000_pos_p24_tables`: PosHeldCart.tableSessionId TEXT + partial unique PosHeldCart_tableSessionId_held_key ·
//     RestaurantTable.dirtySince TIMESTAMP(3) · enum RestReservationStatus + ตาราง RestaurantReservation (scope unit)
//   restaurant/index.ts (facade · รอยต่อ // POS P2.4 ▸ … ◂): createOrderInTx(tx, …) + ฟังก์ชันรับ tx ที่ pos/table.ts ใช้ (ชื่ออื่นผู้สร้างตั้งเอง)
//   pos/table.ts: registerTables · registerOpenTable · registerSendTableRound · registerCloseTable · registerClearTable ·
//     registerCreateReservation · registerSeatReservation · registerCancelReservation · registerTableRequests · registerAckTableRequest ·
//     registerDoneTableRequest · registerCancelTableItem — ทุกตัว (ctx: RegisterCtx, actor: RegisterActor, input) → {ok:true,…} | RegisterRefusal
//   pos/table-shared.ts (บริสุทธิ์): TABLE_STATES · tableStateOf · tableItemsHash · reservationHolds · RESERVATION_HOLD_DEFAULT_MINUTES · RESERVATION_LATE_MINUTES
//   pos/table-actions.ts ("use server") · register.ts: quote/submit รับ tableSessionId (+ expectedTableItemsHash) · held-cart.ts: holdRegisterCart({cart, tableSessionId})
//   outbox-consumers.ts: ตัวรับ pos.sale.voided ฝั่งโต๊ะ (หนึ่งก้อน · รอยต่อ POS P2.4) · fitness.mts: เส้น "pos→restaurant" (รอยต่อ POS P2.4)
//   รหัสปฏิเสธใหม่: TABLE_NOT_FOUND TABLE_INACTIVE TABLE_SESSION_CLOSED TABLE_EMPTY TABLE_ITEMS_CHANGED TABLE_HAS_UNPAID
//
// ขอบเขต: ST สถิต (ST5 บริสุทธิ์) · T ผัง/เปิดโต๊ะ · D รอบร่าง/ส่งรอบ · B quote บิลโต๊ะ · P ชำระ · V void/คืน/ปิด/เก็บ · R โต๊ะจอง · L ของเดิม (PAR) · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p2.3): SKIP เมื่อของ P2.4 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash · L เขียว)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST4 + L2 L3 + บริสุทธิ์ ST5 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ep-frosty-lab ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p24-<rand>` + `posqc-p24-<rand>-t2` + ผู้ใช้ `posqc-p24-<rand>-*@qc.invalid`
//    (ลบทั้งหมดใน finally · แถวค้าง = 0) · ไม่มีเครือข่าย (fetch = ตัวกั้น 503) · ทุกข้อห่อ try/catch (ข้อพัง = แดงพร้อมเหตุผล ไม่ล้มทั้งชุด)
//    fixture ผ่านฟังก์ชันของโมดูล · Prisma ตรงเฉพาะ Tenant/BusinessUnit/User/Membership/AccountSystemLink (แบบ qc-pos-p2.3) ·
//    SQL ดิบ = อ่าน xmin / information_schema / ลายนิ้วมือ + ลบร้านชั่วคราวเท่านั้น · คอลัมน์ใหม่อ่านผ่าน delegate (client เก่า = undefined = แดงพร้อมเหตุผล)
//    โมดูล/ฟังก์ชันที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + ตรวจว่ามี) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.4";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 idempotency/เล่นซ้ำ/แข่ง · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน/จำนวน · X5 ไม่เขียนอะไร · PAR = ต้องเขียวทั้งก่อนและหลังสร้าง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.4-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[§3 R4 R10] schema + migration เพิ่มอย่างเดียว: PosHeldCart.tableSessionId String? · RestaurantTable.dirtySince DateTime? · enum RestReservationStatus {BOOKED SEATED CANCELLED NO_SHOW} · model RestaurantReservation ฟิลด์บังคับครบ (id tenantId unitId tableId? name phone? partySize at holdFromMinutes @default(15) status @default(BOOKED) createdAt updatedAt · ส่วนเกินต้องไม่บังคับ) + @@index([tenantId]) · TableSession/RestaurantOrderItem ไม่เปลี่ยน · migration เดียว `20261206100000_pos_p24_tables`: lock_timeout · ADD COLUMN \"tableSessionId\" TEXT · partial unique \"PosHeldCart_tableSessionId_held_key\" WHERE status='HELD' AND \"tableSessionId\" IS NOT NULL · ADD COLUMN \"dirtySince\" TIMESTAMP(3) · CREATE TYPE + CREATE TABLE RestaurantReservation · ไม่มี one_open_session_per_table/DROP/UPDATE/DELETE/ADD VALUE/backfill"),
  D("ST2", "S", "[R1 R12] ลงทะเบียน: core/scope.ts RestaurantReservation: unit · pos-qc-env POS_MODELS restaurantReservation · RegisterRefusalCode มี 6 รหัส TABLE_* · REG_QUOTE_KEYS มี tableSessionId · REG_SUBMIT_KEYS มี expectedTableItemsHash · pos.json th/en: register.errors.{tableNotFound tableInactive tableSessionClosed tableEmpty tableItemsChanged tableHasUnpaid} + ก้อน tables.* (คีย์ชุดเดียวกัน · th มีอักษรไทย · en ไม่มี)"),
  D("ST3", "S", "[R1 CD1 hard rules] ขอบเขต: มี restaurant/index.ts (รอยต่อ POS P2.4 ▸ · export createOrderInTx) · order.ts export createOrderInTx · pos/table.ts export ฟังก์ชันโต๊ะครบ 12 ตัว · ไฟล์ pos เข้าถึงร้านอาหารผ่าน `import(\"@/lib/modules/restaurant\")` เท่านั้น (ไม่ deep import · ไม่ static value import) · modules/pos + outbox-consumers ไม่เขียนตาราง Restaurant*/TableSession ตรง · fitness.mts มี \"pos→restaurant\" หนึ่งครั้งบนบรรทัดรอยต่อ POS P2.4 · openSession มี pg_advisory_xact_lock · table-actions.ts \"use server\" async ล้วน เรียกฟังก์ชันโต๊ะทุกตัว + catch · table-shared.ts บริสุทธิ์ · 'use client' ไม่ import pos/table หรือ restaurant · ตัวรับ pos.sale.voided มีรอยต่อ POS P2.4 · POS-OWNER-PENDING.md มีบรรทัด P2.4 (schema ร้านอาหาร · one_open_session_per_table · race ของ checkout เดิม)"),
  D("ST4", "PAR", "[CD4 Q2 R12] scripts/pos-sale-contract.json ตรงฐาน 6dbcafe0 ทุกไบต์ (sha256) · pos-integrations BOOKING tableReservationsOnMap/callQueueFromTable ยัง false \"P2.4\" (คิว = PLANNED) · ไฟล์ \"use server\" ใน modules/pos export async function ล้วน · pos/table.ts + restaurant/index.ts ไม่ปล่อย outbox event ใหม่ (ตัวรับอย่างเดียว)"),
  D("ST5", "P", "[R2 R6 R10 R12] table-shared บริสุทธิ์: TABLE_STATES = INACTIVE BILL_REQUESTED DINING NEEDS_CLEARING RESERVED FREE (ลำดับความสำคัญ) · tableStateOf ครบ 32 แบบ = ธงแรกที่จริงตามลำดับ · reservationHolds(at, hold, now) จริงเฉพาะ at−hold ≤ now ≤ at+30 นาที · ค่าคงที่ 15/30 · tableItemsHash ไม่ขึ้นกับลำดับ คงที่ ต่างเมื่อชุดต่าง ไม่แก้อินพุต · refusalMessageKey(TABLE_*) = errors.<camel>"),
  // ── T ผัง/เปิดโต๊ะ ──
  D("T1", "-", "[R2] registerTables หลังชำระ: zones 2 โซน · tables ทุกโต๊ะของสาขา (คีย์ DTO ครบ) · สถานะ A1/A7 NEEDS_CLEARING (dirtySince) · A2 FREE · A3 INACTIVE · A4 BILL_REQUESTED · A5/A9 DINING · summary {used total guests avgMinutes unpaidSatang} ตรงความจริงใน DB (total = โต๊ะ ACTIVE · used = โต๊ะที่มี session OPEN · unpaid = Σ ยังไม่จ่าย)"),
  D("T2", "X1", "[R3 Q9] registerOpenTable 10 คำขอพร้อมกันบน A1 → ok ทั้ง 10 · created:true 1 ครั้ง · sessionId เดียว · OPEN 1 แถว (guestCount 4 · openedByUserId = STAFF) · ประตูเดิม table.openSession 10 คำขอพร้อมกันบน C5 → OPEN 1 แถว (advisory lock ครอบประตูเดิมด้วย)"),
  D("T3", "X2", "[R1] โต๊ะร้าน T2 / โต๊ะสาขา A จาก ctx สาขา B / id มั่ว → TABLE_NOT_FOUND (open + clear) · registerTables สาขา B → tables [] · ไม่มี session ใหม่"),
  D("T4", "X5", "[R3] A3 INACTIVE → registerOpenTable TABLE_INACTIVE · ไม่มี session (ตัวควบคุม: ประตูเดิมก็ปฏิเสธ)"),
  D("T5", "X3", "[R2 R3 CD8] STAFF ที่ไม่มี restaurant.session.open → PERMISSION_DENIED · STAFF ที่มีแค่ pos.sale.read → registerTables ok แต่เปิดโต๊ะไม่ได้ · ไม่มีสิทธิ์ pos เลย → registerTables PERMISSION_DENIED · ไม่มี session ใหม่"),
  D("T6", "-", "[R2 R9] การ์ด A5: DINING · guestCount 3 · unpaidSatang 22000 (ไม่รวมรายการที่จ่ายแล้วผ่าน checkout เดิม) · unsentCount 2 (บรรทัดของรอบร่าง) · readyCount 1 · member {name, tier \"Silver\"} · openedByStaff · flags.callStaff → ack ยังจริง → done เป็นเท็จ (registerAckTableRequest/registerDoneTableRequest) · registerTableRequests มีคำขอนั้น"),
  // ── D รอบร่าง/ส่งรอบ ──
  D("D1", "X1", "[R4 CD6] holdRegisterCart({cart, tableSessionId}) → PosHeldCart 1 แถว (tableSessionId · HELD · version 1) · พักซ้ำ = แก้แถวเดิม (id เดิม · version 2 · lineCount 2) · HELD ต่อ session = 1"),
  D("D2", "X5", "[R4 R1] รอบร่างไม่ขึ้นใน listHeldCarts (บิลพักปกติขึ้น = ตัวควบคุม) · couponCode / billDiscount → VALIDATION · session ที่ปิดแล้ว → TABLE_SESSION_CLOSED · session ร้าน T2 / ctx สาขา B → TABLE_NOT_FOUND · รอบร่างเดิมไม่ถูกแตะ"),
  D("D3", "-", "[R5 CD2 CD3] registerSendTableRound(STAFF) → {ok, orderId, itemIds} · RestaurantOrder DINE_IN CONFIRMED placedByUserId=STAFF · ต้มยำ: menuItemId productId unitPrice 18000 optionsTotal 4000 qty 2 lineTotal 44000 note สถานีของเมนู NEW + option 2 แถว · น้ำ: menuItemId null productId unitPrice 1000 · รอบร่าง RECALLED"),
  D("D4", "X1", "[R5] ส่งรอบร่างเดียวกัน 2 คำขอพร้อมกัน → ok 1 + ALREADY_RECALLED 1 · ออเดอร์ +1 · ส่งซ้ำ → ALREADY_RECALLED ไม่มีออเดอร์เพิ่ม"),
  D("D5", "X5", "[R5] เมนู stockQty 2 สั่ง 3 (บรรทัดที่ 2) → PRODUCT_UNAVAILABLE lineIndex 1 · ไม่มีออเดอร์/รายการใหม่ · stockQty ยัง 2 · รอบร่างยัง HELD"),
  D("D6", "-", "[R5] บรรทัด PRODUCT (น้ำ) ได้ stationId = สถานีแรกของสาขา (ensureDefaultStations) · createOrder เดิมเขียน productId = MenuItem.posProductId"),
  // ORACLE-ADD ผู้คุม 10 ต.ค. (P2.4 S fix 2 · F1): รอบร่างแข่งกัน — expectedVersion/heldCartId/newDraft
  D("D7", "X1", "[R4 F1 N1 N2] รอบร่างแข่งกัน: newDraft:true → แถวใหม่ · พักด้วย heldCartId+expectedVersion เดิมสองเครื่อง (ทีละคำขอ + พร้อมกัน) → ผ่าน 1 · VERSION_CHANGED 1 (บรรทัดของผู้ชนะไม่หาย) · heldCartId ไม่มี expectedVersion → VALIDATION · newDraft:true ขณะมี HELD → VERSION_CHANGED · พักหลังส่งครัว (RECALLED) → VERSION_CHANGED ไม่มีรอบร่างใหม่ · พักไม่ระบุร่างหลังส่ง → VALIDATION ไม่มีรอบร่างใหม่ · newDraft:true หลังส่ง → แถวใหม่"),
  // ── B quote บิลโต๊ะ ──
  D("B1", "X4", "[R6 CD3] quoteRegisterCart({lines: [], tableSessionId}) → บรรทัดจากรายการที่ยังไม่จ่าย (productId · unitPriceSatang = unitPrice+optionsTotal · grossSatang · options choiceId) + table {sessionId tableName \"A1\" itemIds itemsHash} · เปลี่ยนราคาเมนูหลังส่ง → quote ยังราคาเดิม"),
  D("B2", "X2", "[R6 R1] tableSessionId + lines ไม่ว่าง → VALIDATION · session ร้าน T2 / ctx สาขา B / id มั่ว → TABLE_NOT_FOUND"),
  D("B3", "X4", "[R6] สมาชิกจาก session (เปิดโต๊ะพร้อม memberId) → tierDiscountSatang > 0 และเท่าตะกร้าปกติที่แนบสมาชิกคนเดียวกัน · ยอดสุทธิเท่ากัน"),
  D("B4", "X4", "[R6 CD7 Q4] ค่าบริการจากค่าตั้ง POS ปัดครึ่งขึ้น: 19805 → 1981 (เท่าตะกร้าปกติ · ไม่ใช่ floor 1980 ของ RestaurantSetting ที่ billPreview เดิมยังใช้) · ช่องทาง STORE · โต๊ะที่แขกเปิดผ่าน QR → channel QR_TABLE + ค่าบริการ 181"),
  D("B5", "X5", "[R6] session ว่าง → TABLE_EMPTY · มีแต่รายการที่ยกเลิก → TABLE_EMPTY"),
  D("B6", "-", "[R6] itemsHash คงที่เมื่อไม่มีอะไรเปลี่ยน · รอบร่างที่ยังไม่ส่งไม่ถูกคิดเงิน (hash/บรรทัดเท่าเดิม) · ส่งรอบใหม่ → hash เปลี่ยน + itemIds เพิ่ม 1 · itemsHash = tableItemsHash(itemIds)"),
  // ── P ชำระ ──
  D("P1", "X4", "[R7 CD4 Q4] submitRegisterSale({lines: [], tableSessionId, expectedTableItemsHash}) เครื่อง 2 → PosSale POS sourceId=session channel STORE shiftId=กะเครื่อง 2 · ค่าบริการ 4881 (ปัดครึ่งขึ้น) · บรรทัด productId/itemId/options · รายการทั้งหมด saleId+settledAt · session CLOSED · dirtySince ตั้ง · รายการ/session/บรรทัดบิล xmin เดียวกัน (ธุรกรรมเดียว)"),
  D("P2", "X1", "[R7] ส่งซ้ำคีย์เดิม → บิลเดิม duplicated:true · คีย์ใหม่หลังจ่ายแล้ว → ปฏิเสธ (TABLE_EMPTY/TABLE_SESSION_CLOSED/TABLE_ITEMS_CHANGED) ไม่มีบิลเพิ่ม"),
  D("P3", "X1", "[R7] 2 เครื่อง คนละคีย์ จ่ายโต๊ะเดียวกันพร้อมกัน → บิล 1 ใบ + TABLE_ITEMS_CHANGED · PosSale +1 · PosPayment +1 · เลขใบเสร็จ +1 · OutboxEvent ที่ไม่ใช่ของบิลผู้ชนะ = 0 · รายการผูกบิลผู้ชนะ"),
  D("P4", "X5", "[R7] ส่งรอบใหม่ระหว่าง quote กับ submit → TABLE_ITEMS_CHANGED (ก่อน PRICE_CHANGED) · ไม่มีบิล · รายการยังไม่จ่าย · session OPEN"),
  D("P5", "X4", "[R7] น้ำ (PRODUCT นับสต็อก) ตัดตอนจ่าย: OUT 2 แถว (คีย์ pos-consume-<sale>-<line>) Σ −3 · onHand −3"),
  D("P6", "-", "[R7] มีรอบร่าง HELD อยู่ → จ่ายแล้ว session ยัง OPEN · dirtySince null · รอบร่างยัง HELD"),
  D("P7", "X4", "[R7 CD4] GL ของบิล P1: Dr 1000 = ยอดบิล · Cr 2200 = VAT ของบิล · Σ Dr = Σ Cr = ยอดบิล (รวมค่าบริการ)"),
  D("P8", "X4", "[Q10] xReport: กะเครื่อง 2 billCount +1 salesTotal +ยอดบิล · กะเครื่อง 1 ไม่ขยับ"),
  // ── V void/คืน/ปิด/เก็บ ──
  D("V1", "-", "[R8 CD5] ยกเลิกบิลโต๊ะจากลิ้นชักบิล (voidSaleByActor) + ระบายคิว → รายการของบิลหลุด (saleId/settledAt null) · session A1 กลับ OPEN · บิล VOIDED"),
  D("V2", "X1", "[R8] เล่น consumers[pos.sale.voided] ของบิล V1 ซ้ำ 2 รอบ → รายการ/session/dirtySince ไม่เปลี่ยน · เล่นซ้ำ void ของบิล RESTAURANT เดิม (L1) → session L1 ยัง CLOSED รายการยังผูกบิลใหม่"),
  D("V3", "X5", "[R8] คืนเงิน ⅓ ของบิลโต๊ะ (P3) → รายการ/session/dirtySince ของโต๊ะไม่เปลี่ยน"),
  D("V4", "X3", "[R9] registerCloseTable: มีค้างจ่าย → TABLE_HAS_UNPAID · STAFF (ไม่มี session.close) → PERMISSION_DENIED · session ว่าง (มีรอบร่าง) → CANCELLED + รอบร่าง DISCARDED · registerClearTable (MANAGER) → dirtySince null · ผัง FREE"),
  // ORACLE-ADD ผู้คุม 10 ต.ค. (P2.4 S fix 2 · F2): ปิดโต๊ะ/จ่ายรายการสุดท้าย ⇄ รอบที่กำลังส่ง
  D("V5", "X1", "[R7 R9 F2] รอบที่ถือล็อก session (lockOpenSessionInTx FOR SHARE + createOrderInTx) ขณะจ่ายรายการสุดท้าย → บิลผ่าน · session ยัง OPEN · รายการรอบใหม่ค้างจ่าย (ไม่ตกใน session ที่ปิด) · ปิดโต๊ะระหว่างรอบถือล็อก → รอ แล้ว TABLE_HAS_UNPAID · ปิดก่อน → lockOpenSessionInTx ปฏิเสธ (ไม่ OPEN)"),
  // ── R โต๊ะจอง ──
  D("R1", "-", "[R10 Q2] registerCreateReservation A6 (+10 นาที · 6 คน) → BOOKED · ผัง RESERVED + reservation {id name partySize} · registerSeatReservation → session OPEN guestCount 6 · SEATED · ผัง DINING"),
  D("R2", "-", "[R10] ยกเลิก → CANCELLED · ผัง FREE · จองอีก 3 ชม. → ผัง FREE (นอกช่วงกัน) · holdFromMinutes ปริยาย 15 · เปิดโต๊ะที่ถูกจองไว้ → ok + reservationOverridden true · การจองยัง BOOKED"),
  D("R3", "X2", "[R10 R1] โต๊ะร้าน T2 / ctx สาขา B / id การจองมั่ว → TABLE_NOT_FOUND · STAFF ที่ไม่มี restaurant.session.open → PERMISSION_DENIED · partySize 0 → VALIDATION · ไม่มีแถวใหม่"),
  // ORACLE-ADD ผู้คุม 10 ต.ค. (P2.4 S fix 2 · F3): พาลูกค้าที่จองนั่งโต๊ะที่มีลูกค้าอยู่
  D("R4", "X5", "[R10 F3] โต๊ะ E5 มี session OPEN (2 คน) + การจอง 6 คน → registerSeatReservation = VALIDATION \"โต๊ะนี้มีลูกค้าอยู่ — ปิดบิลก่อนจึงนั่งจองได้\" · การจองยัง BOOKED ไม่มี sessionId · session เดิม guestCount 2 · OPEN 1 แถว"),
  // ── L ของเดิม (PAR) ──
  D("L1", "PAR", "[R11] ประตูเดิม: openSession + createOrder → billPreview ตรงทุกไบต์ (floor ค่าบริการ 2561) · checkout CASH → ผล + PosSale (RESTAURANT · คีย์ rest-<sha> · บรรทัด Service charge 10% · channel STORE · ไม่มีกะ/ผู้ขาย) · voidCheckout ตรงทุกไบต์ · void ซ้ำ = ข้อความเดิม · checkout อีกรอบ = คีย์ -r1"),
  D("L2", "PAR", "[R11 CD4] ทะเบียนผู้เรียก createSale ของ qc-pos-p1.6 ไม่เปลี่ยน (18 จุด/15 ไฟล์ · register.ts 1 · restaurant/order.ts 1) · pos/table*.ts + restaurant/index.ts ไม่มี createSale("),
  D("L3", "PAR", "[R11] ทุก export ของ restaurant/{table,order,menu,kds,storefront,scope}.ts ณ 6dbcafe0 (ฟังก์ชัน + type) ยังอยู่ด้วยลายเซ็นเดิม (sha ของพารามิเตอร์ + ชนิดผล)"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว T + T2 เหลือ 0 แถวทุกตารางที่มี tenantId (Restaurant* TableSession PosHeldCart PosSale/Line/Payment SalesChannel OutboxEvent AuditLog InvMovement AccountJournal* …) · แถว Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0"),
  D("Z2", "-", "รอยของรอบนี้นอกร้านชั่วคราว = 0 (PosSale คีย์ · AuditLog/OutboxEvent ที่มีรหัสรอบ · โซนชื่อรอบ · Tenant slug) · ลายนิ้วมือร้านอื่น (RestaurantTable TableSession RestaurantOrderItem PosHeldCart นับ + แฮช) ก่อน/หลังพิมพ์เป็นข้อมูล"),
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
  const full = id.startsWith("P2.4-") ? id : `P2.4-${id}`;
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
const refused = (r: Any, code: string) => r?.ok === false && String(r.code) === code;
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
/** ปัดครึ่งขึ้นแบบจำนวนเต็ม (สูตรเดียวกับ pricing-shared roundHalfUp — ข้อสอบเขียนเอง ไม่ import) */
const halfUp = (num: number, den: number) => Math.floor((2 * num + den) / (2 * den));
const setStr = (xs: unknown[]) => [...xs].map(String).sort(byId).join(",");

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
/** เนื้อฟังก์ชันที่ export (ถึงฟังก์ชัน export ตัวถัดไป) */
function fnBody(src: string, name: string): string {
  const m = new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`).exec(src);
  if (!m) return "";
  const rest = src.slice(m.index + m[0].length);
  const next = rest.search(/\nexport\s/);
  return next < 0 ? rest : rest.slice(0, next);
}
const firstStatement = (raw: string) => raw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart();
const isUseServer = (raw: string) => /^["']use server["']/.test(firstStatement(raw));
const isUseClient = (raw: string) => /^["']use client["']/.test(firstStatement(raw));

/**
 * ลายเซ็นของ export (L3): ฟังก์ชัน = ข้อความตั้งแต่ `export` ถึงวงเล็บปีกกาเปิดของตัวฟังก์ชัน (พารามิเตอร์ + ชนิดผลที่ประกาศ) ·
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

const POS_DIR = "src/lib/modules/pos";
const REST_DIR = "src/lib/modules/restaurant";
const F = {
  restIndex: `${REST_DIR}/index.ts`,
  restOrder: `${REST_DIR}/order.ts`,
  restTable: `${REST_DIR}/table.ts`,
  table: `${POS_DIR}/table.ts`,
  tableActions: `${POS_DIR}/table-actions.ts`,
  tableShared: `${POS_DIR}/table-shared.ts`,
  register: `${POS_DIR}/register.ts`,
  regShared: `${POS_DIR}/register-shared.ts`,
  consumers: "src/lib/outbox-consumers.ts",
  fitness: "scripts/fitness.mts",
  scope: "src/lib/core/scope.ts",
  qcEnv: "scripts/pos-qc-env.mts",
  contract: "scripts/pos-sale-contract.json",
  integrations: "src/lib/pos-integrations.ts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  ownerPending: "ledger/POS-OWNER-PENDING.md",
};
/** sha256 ของ scripts/pos-sale-contract.json — ORACLE-EDIT ผู้คุม 10 ต.ค.: re-pin ที่ 0c20c473 (merge P2.2 S เพิ่มคีย์บรรทัด priceSource/priceRuleId/listPriceSatang · CD4: P2.4 ห้ามเปลี่ยนอีก) · เดิม 6dbcafe0 = eaced8dc… */
const CONTRACT_SHA_BASE = "7a418de17b44bf7c54e9ee99a3cb740ae596fb6fb240978901e8a07b011697cd";
const MIGRATION_NAME = "20261206100000_pos_p24_tables";
const NEW_CODES = ["TABLE_NOT_FOUND", "TABLE_INACTIVE", "TABLE_SESSION_CLOSED", "TABLE_EMPTY", "TABLE_ITEMS_CHANGED", "TABLE_HAS_UNPAID"] as const;
const camelKey = (code: string) => "errors." + code.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const TABLE_FNS = [
  "registerTables", "registerOpenTable", "registerSendTableRound", "registerCloseTable", "registerClearTable",
  "registerCreateReservation", "registerSeatReservation", "registerCancelReservation",
  "registerTableRequests", "registerAckTableRequest", "registerDoneTableRequest", "registerCancelTableItem",
] as const;
const SHARED_EXPORTS = ["TABLE_STATES", "tableStateOf", "tableItemsHash", "reservationHolds", "RESERVATION_HOLD_DEFAULT_MINUTES", "RESERVATION_LATE_MINUTES"] as const;
const STATES = ["INACTIVE", "BILL_REQUESTED", "DINING", "NEEDS_CLEARING", "RESERVED", "FREE"] as const;
const RES_STATUS = ["BOOKED", "SEATED", "CANCELLED", "NO_SHOW"];
const RES_FIELDS: [string, RegExp][] = [
  ["id", /^id\s+String\s+@id\b/],
  ["tenantId", /^tenantId\s+String(\s|$)/],
  ["unitId", /^unitId\s+String(\s|$)/],
  ["tableId", /^tableId\s+String\?/],
  ["name", /^name\s+String(\s|$)/],
  ["phone", /^phone\s+String\?/],
  ["partySize", /^partySize\s+Int(\s|$)/],
  ["at", /^at\s+DateTime(\s|$)/],
  ["holdFromMinutes", /^holdFromMinutes\s+Int\s+@default\(15\)/],
  ["status", /^status\s+RestReservationStatus\s+@default\(BOOKED\)/],
  ["createdAt", /^createdAt\s+DateTime\s+@default\(now\(\)\)/],
  ["updatedAt", /^updatedAt\s+DateTime\s+@updatedAt/],
];
const RES_COLS = ["id", "tenantId", "unitId", "tableId", "name", "phone", "partySize", "at", "holdFromMinutes", "status", "createdAt", "updatedAt"];
/** ฟิลด์ ณ 6dbcafe0 (ห้ามเปลี่ยน · TableSession เพิ่มได้เฉพาะลิสต์ความสัมพันธ์ PosHeldCart[]/RestaurantReservation[]) */
const TS_FIELDS = ["id", "tenantId", "unitId", "tableId", "table", "status", "guestCount", "memberId", "openedByUserId", "mergedIntoId", "mergedInto", "mergedFrom", "openedAt", "closedAt", "createdAt", "updatedAt", "orders", "serviceRequests"];
const ROI_FIELDS = ["id", "tenantId", "unitId", "orderId", "order", "menuItemId", "menuItem", "stationId", "station", "nameSnapshot", "unitPrice", "optionsTotal", "qty", "lineTotal", "note", "kdsStatus", "isRush", "cookingAt", "readyAt", "servedAt", "cancelledAt", "cancelReason", "cancelledByUserId", "saleId", "settledAt", "productId", "createdAt", "updatedAt", "options"];
const TABLE_DTO_KEYS = ["id", "name", "zoneId", "seats", "state", "sessionId", "guestCount", "openedAt", "unpaidSatang", "unsentCount", "readyCount", "member", "openedByStaff", "flags", "dirtySince", "reservation"];
const SUMMARY_KEYS = ["used", "total", "guests", "avgMinutes", "unpaidSatang"];
/** ทะเบียนผู้เรียก createSale ณ 6dbcafe0 (= qc-pos-p1.6 U4 · วัดด้วยสูตรเดียวกัน) */
const CALL_SITES: Record<string, number> = {
  "src/lib/actions/booking.ts": 1, "src/lib/actions/pos.ts": 1, "src/lib/ai/proposals.ts": 1, "src/lib/modules/booking/service.ts": 1,
  "src/lib/modules/clinic/service.ts": 1, "src/lib/modules/giftcard/service.ts": 2, "src/lib/modules/hotel/service.ts": 2,
  "src/lib/modules/member/subscription.ts": 1, "src/lib/modules/pos/api/ops/sales.ts": 1, "src/lib/modules/pos/register.ts": 1,
  "src/lib/modules/rental/service.ts": 2, "src/lib/modules/restaurant/order.ts": 1, "src/lib/modules/school/service.ts": 1,
  "src/lib/modules/shop/service.ts": 1, "src/lib/modules/ticket/service.ts": 1,
};
/** ORACLE-EDIT ผู้คุม 10 ต.ค. (P2.4 S fix 1 · มติ 3): จุดเรียก createSale ที่ใบอื่นเพิ่มได้ (P2.8 S · pos/order.ts 1 จุด) — แบบเดียวกับ qc-pos-p2.6 · มี = ต้องเท่านี้พอดี · ไม่มี = ผ่าน */
const CALL_SITES_ALLOWED_LATER: Record<string, number> = { "src/lib/modules/pos/order.ts": 1 };
/** ลายเซ็น export ของโมดูลร้านอาหาร ณ 6dbcafe0 (exportSigs) — R11 แช่แข็ง */
const SIGS_BASE: Record<string, Record<string, string>> = {
  table: { listZones: "c8e66837ad1f", createZone: "657bb8ee1f6f", archiveZone: "1336f49c9347", createTable: "7c7335ab1a16", updateTable: "b3b16d37834a", archiveTable: "47d96578b58e", rotateQr: "d5e7b11b54d8", floorPlan: "5d6efa1d21d5", openSession: "ab58a6782f51", getSession: "38a38ad81b0a", openSessionOfTable: "6e6fbb24512b", openSessionsList: "99cca1fa8063", linkMember: "c579f79820a7", closeSession: "05a2d36cbde3", moveSession: "ca73dc7db579", mergeSession: "e2678ceaf8ad", "type TableCard": "dd90e6b09769" },
  order: { createOrder: "0ad725a9b31a", confirmOrder: "2108ca257e17", cancelOrderItem: "dae18c0cc783", setOrderRush: "4852e65ca7ae", createServiceRequest: "97c5f05f6e71", ackServiceRequest: "db4fa0866436", doneServiceRequest: "5396c3e2da71", listServiceRequests: "ee280efc9e7d", billPreview: "51fa4f808e6d", checkout: "8baf40c40637", voidCheckout: "471cc12884c3", billsToday: "0dce2df518da", ordersToday: "4ef771e3551a", "type CartLine": "eb7dfe6bb8a2", "type OrderError": "16b2614ffb88", "type BillLine": "4b470b8a90d1", "type BillToday": "366788f537a5" },
  menu: { getSetting: "f700dee962e0", updateSetting: "79d111854167", setKitchenPause: "4e67db9cc931", ensureDefaultStations: "894d9978ce47", listStations: "effe0d67ea7f", createStation: "4eadae186018", listCategories: "160def563ced", createCategory: "d2346c115e77", archiveCategory: "87644a22bb6d", listOptionGroups: "644ce3d6366d", createOptionGroup: "8cd876100eff", archiveOptionGroup: "0fa449815cf8", setChoiceStock: "5bd5a5463933", listItems: "1fc6faba97a3", getItem: "71032293f7ff", createItem: "82bf759e3162", updateItem: "67b302b17226", setItemOptionGroups: "b27f4bbb5879", duplicateItem: "62f7a2ced447", archiveItem: "3b9ed28cc3f1", setItemStock: "4c5b39aa477a", orderingMenu: "0335bba33bf9", resetDailyStock: "98ca27407c5c", "type OrderingMenuChoice": "5fe03be7e840", "type OrderingMenuGroup": "0686bac15880", "type OrderingMenuItem": "c4d70abcfc39", "type OrderingMenuCat": "df2872299963" },
  kds: { stationQueue: "0b629f94e719", advanceItem: "02f15cb51c4d", recallItem: "525c524982ac", expoQueue: "53924013f2cb" },
  storefront: { resolveUnit: "8e8a249ea05f", publicMenu: "565700125ede", resolveTableSession: "63240575d567", tableStatusForGuest: "e0efafa8e491", guestBill: "341ebe3ef184", notifyPromptpayPayment: "9f887f1e2496", placeGuestOrder: "1e486abc28d4", "type GuestBill": "ff8cf6e2e286" },
  scope: { bizDateBkk: "904b1cf77499", nowMinutesBkk: "50abf9b645bc", dowBkk: "038b8485d5d4", baht: "5f8bdb640984", hhmmToMin: "a80d74af739e", kitchenOpenNow: "bdbb011302fa", "type ServiceHourDay": "74ce2d5dbdc4", "type SpecialClosure": "8dbb78ea5f91" },
};

const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4", "L2", "L3"].map((x) => `P2.4-${x}`);
const PURE_IDS = ["ST5"].map((x) => `P2.4-${x}`);
const skipReasons: string[] = [];
for (const f of [F.restIndex, F.table, F.tableShared, F.tableActions]) if (!existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);
for (const [f, names] of [
  [F.restIndex, ["createOrderInTx"]],
  [F.restOrder, ["createOrderInTx"]],
  [F.table, [...TABLE_FNS]],
  [F.tableShared, [...SHARED_EXPORTS]],
] as [string, string[]][])
  for (const n of names) if (!exportsFn(srcOf(f), n)) skipReasons.push(`ยังไม่มี export ${n} (${f.split("/").slice(-2).join("/")})`);

/** ไฟล์ "shared" ไม่ import prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (ค่า) — เงื่อนไขที่ --no-db โหลดได้ */
const purePath = (f: string): boolean => {
  const s = srcOf(f);
  if (!s) return false;
  const valueImports = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const dyn = [...s.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);
  return ![...valueImports, ...dyn].some((p) => /@prisma\/client|\/db$|^\.\/db$|@\/lib\/core\/db|@\/lib\/modules\/(inventory|account|system|restaurant|member)|^node:|^crypto$|^\.\/(catalog|catalog-legacy|register|service|bills|refund|held-cart|table|channel|shift|device)$/.test(p));
};

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  // ST1 schema + migration
  {
    const p: string[] = [];
    const hc = prismaBlock(schemaSrc, "model", "PosHeldCart");
    const ts = fieldLine(hc, "tableSessionId");
    if (!ts) p.push("PosHeldCart ไม่มี tableSessionId");
    else if (!/^tableSessionId\s+String\?(\s|$)/.test(ts)) p.push(`PosHeldCart.tableSessionId = ${short(ts, 60)} (คาด String?)`);
    const rt = prismaBlock(schemaSrc, "model", "RestaurantTable");
    const ds = fieldLine(rt, "dirtySince");
    if (!ds) p.push("RestaurantTable ไม่มี dirtySince");
    else if (!/^dirtySince\s+DateTime\?(\s|$)/.test(ds) || /@default/.test(ds)) p.push(`RestaurantTable.dirtySince = ${short(ds, 60)} (คาด DateTime? ไม่มี default)`);
    const en = prismaBlock(schemaSrc, "enum", "RestReservationStatus");
    const vals = en ? en.split("\n").slice(1).map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l)) : [];
    if (!en) p.push("ไม่มี enum RestReservationStatus");
    else if (setStr(vals) !== setStr(RES_STATUS)) p.push(`RestReservationStatus = ${vals.join(",")} (คาด ${RES_STATUS.join(",")})`);
    const rr = prismaBlock(schemaSrc, "model", "RestaurantReservation");
    if (!rr) p.push("ไม่มี model RestaurantReservation");
    else {
      for (const [f, re] of RES_FIELDS) {
        const l = fieldLine(rr, f);
        if (!l) p.push(`RestaurantReservation ขาด ${f}`);
        else if (!re.test(l)) p.push(`RestaurantReservation.${f} = ${short(l, 70)}`);
      }
      const extra = fieldLines(rr).filter((l) => !RES_FIELDS.some(([f]) => l.split(/\s+/)[0] === f));
      for (const l of extra) {
        const typ = l.split(/\s+/)[1] ?? "";
        if (!(typ.endsWith("?") || typ.endsWith("[]") || /@default\(|@updatedAt/.test(l))) p.push(`RestaurantReservation ฟิลด์เกินที่บังคับ: ${short(l, 60)}`);
      }
      if (!/@@index\(\s*\[\s*tenantId\s*\]\s*\)/.test(rr)) p.push("RestaurantReservation ไม่มี @@index([tenantId])");
    }
    const tsb = prismaBlock(schemaSrc, "model", "TableSession");
    const tsn = fieldNames(tsb);
    const tsMiss = TS_FIELDS.filter((f) => !tsn.includes(f));
    const tsExtra = fieldLines(tsb).filter((l) => !TS_FIELDS.includes(l.split(/\s+/)[0]!)).filter((l) => !/^\w+\s+(PosHeldCart|RestaurantReservation)\[\]/.test(l));
    if (tsMiss.length || tsExtra.length) p.push(`TableSession เปลี่ยน (ขาด ${tsMiss.join(",") || "-"} · เกิน ${tsExtra.map((l) => l.split(/\s+/)[0]).join(",") || "-"})`);
    const roi = fieldNames(prismaBlock(schemaSrc, "model", "RestaurantOrderItem"));
    if (setStr(roi) !== setStr(ROI_FIELDS)) p.push(`RestaurantOrderItem ฟิลด์เปลี่ยน (${roi.filter((f) => !ROI_FIELDS.includes(f)).join(",") || "-"} / ${ROI_FIELDS.filter((f) => !roi.includes(f)).join(",") || "-"})`);
    // migration
    const files = walk("prisma/migrations", [], /\.sql$/).filter((f) => /"tableSessionId"|"dirtySince"|"RestaurantReservation"|"RestReservationStatus"/.test(rd(f)));
    if (files.length !== 1) p.push(`migration ที่แตะ tableSessionId/dirtySince/RestaurantReservation = ${files.length} ไฟล์ (คาด 1)`);
    for (const f of files) {
      const name = f.split("/").slice(-2, -1)[0] ?? "";
      if (name !== MIGRATION_NAME) p.push(`ชื่อ migration ${name} (คาด ${MIGRATION_NAME})`);
      let sql = rd(f).replace(/--.*$/gm, "");
      if (/one_open_session_per_table/i.test(sql)) p.push("migration สร้าง one_open_session_per_table (Q9 → P6.1 CONCURRENTLY)");
      const doBlocks = [...sql.matchAll(/DO\s+\$\$([\s\S]*?)\$\$\s*;/gi)].map((m) => m[1]!);
      for (const b of doBlocks)
        if (!(/CREATE\s+TYPE\s+"RestReservationStatus"/i.test(b) || /ALTER\s+TABLE\s+"RestaurantReservation"\s+ADD\s+CONSTRAINT/i.test(b)) || /\b(DROP|RENAME|DELETE|UPDATE|TRUNCATE|INSERT)\b/i.test(b))
          p.push(`DO block นอกรายการ (${short(b.replace(/\s+/g, " "), 60)})`);
      const inDo = doBlocks.join("\n");
      sql = sql.replace(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi, "");
      const stmts = sql.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
      const ok = (s: string) =>
        /^(SET|RESET) lock_timeout\b/i.test(s) ||
        /^ALTER TABLE "PosHeldCart" ADD COLUMN (IF NOT EXISTS )?"tableSessionId" TEXT$/i.test(s) ||
        /^CREATE UNIQUE INDEX (IF NOT EXISTS )?"PosHeldCart_tableSessionId_held_key" ON "PosHeldCart" ?\( ?"tableSessionId" ?\) WHERE /i.test(s) ||
        /^ALTER TABLE "RestaurantTable" ADD COLUMN (IF NOT EXISTS )?"dirtySince" TIMESTAMP\(3\)$/i.test(s) ||
        /^CREATE TYPE "RestReservationStatus" AS ENUM ?\(/i.test(s) ||
        /^CREATE TABLE (IF NOT EXISTS )?"RestaurantReservation" \(/i.test(s) ||
        /^CREATE (UNIQUE )?INDEX (IF NOT EXISTS )?"[^"]+" ON "RestaurantReservation"/i.test(s) ||
        /^ALTER TABLE "RestaurantReservation" ADD CONSTRAINT "[^"]+" (FOREIGN KEY|CHECK)\b/i.test(s);
      const bad = stmts.filter((s) => !ok(s) || /\b(DROP|RENAME|TRUNCATE|DELETE FROM|UPDATE "|INSERT INTO|ALTER COLUMN|ADD VALUE|CONCURRENTLY)\b/i.test(s));
      if (bad.length) p.push(`${name}: คำสั่งนอกรายการอนุญาต (${short(bad[0], 90)})`);
      const all = stmts.join(";\n") + "\n" + inDo;
      if (!/ADD COLUMN (IF NOT EXISTS )?"tableSessionId" TEXT\b/i.test(all)) p.push('ไม่มี ADD COLUMN "tableSessionId" TEXT');
      const pu = stmts.find((s) => /"PosHeldCart_tableSessionId_held_key"/.test(s)) ?? "";
      if (!pu) p.push("ไม่มี partial unique PosHeldCart_tableSessionId_held_key");
      else if (!/WHERE[\s\S]*"?status"?\s*=\s*'HELD'/i.test(pu) || !/"tableSessionId"\s+IS\s+NOT\s+NULL/i.test(pu)) p.push(`partial unique ไม่มี WHERE status='HELD' AND "tableSessionId" IS NOT NULL (${short(pu, 80)})`);
      if (!/ADD COLUMN (IF NOT EXISTS )?"dirtySince" TIMESTAMP\(3\)/i.test(all)) p.push('ไม่มี ADD COLUMN "dirtySince" TIMESTAMP(3)');
      const ty = /CREATE\s+TYPE\s+"RestReservationStatus"\s+AS\s+ENUM\s*\(([^)]*)\)/i.exec(all);
      if (!ty) p.push('ไม่มี CREATE TYPE "RestReservationStatus"');
      else if (setStr(ty[1]!.split(",").map((x) => x.trim().replace(/'/g, ""))) !== setStr(RES_STATUS)) p.push(`ENUM ${ty[1]}`);
      const ct = stmts.find((s) => /^CREATE TABLE (IF NOT EXISTS )?"RestaurantReservation"/i.test(s)) ?? "";
      if (!ct) p.push('ไม่มี CREATE TABLE "RestaurantReservation"');
      else {
        const miss = RES_COLS.filter((c) => !new RegExp(`"${c}"`).test(ct));
        if (miss.length) p.push(`CREATE TABLE ขาด ${miss.join(",")}`);
        if (!/"holdFromMinutes" INTEGER NOT NULL DEFAULT 15/i.test(ct)) p.push('"holdFromMinutes" ไม่ใช่ INTEGER NOT NULL DEFAULT 15');
        if (!/"status" "RestReservationStatus" NOT NULL DEFAULT 'BOOKED'/i.test(ct)) p.push(`"status" ไม่ใช่ "RestReservationStatus" NOT NULL DEFAULT 'BOOKED'`);
      }
      if (!/lock_timeout/i.test(all)) p.push("ไม่มี SET lock_timeout");
    }
    chk("ST1", p.length === 0, "tableSessionId + dirtySince + RestaurantReservation + migration เดียวเพิ่มล้วน", P8(p) || `ครบ (${files[0] ?? "—"})`);
  }
  // ST2 ลงทะเบียน
  {
    const p: string[] = [];
    if (!/\bRestaurantReservation\s*:\s*unit\b/.test(srcOf(F.scope))) p.push("scope.ts ไม่มี RestaurantReservation: unit");
    const env = srcOf(F.qcEnv);
    const pm = env.slice(env.indexOf("export const POS_MODELS"), env.indexOf("export type PosModelKey"));
    if (!/\brestaurantReservation\s*:\s*\{[^}]*model:\s*"RestaurantReservation"/.test(pm)) p.push('pos-qc-env POS_MODELS ไม่มี restaurantReservation {model: "RestaurantReservation"}');
    const rs = srcOf(F.regShared);
    const union = rs.slice(rs.indexOf("export type RegisterRefusalCode"), rs.indexOf(";", rs.indexOf("export type RegisterRefusalCode")));
    for (const c of NEW_CODES) if (!new RegExp(`"${c}"`).test(union)) p.push(`RegisterRefusalCode ไม่มี ${c}`);
    const reg = srcOf(F.register);
    if (!/"tableSessionId"/.test(constBody(reg, "const REG_QUOTE_KEYS"))) p.push("REG_QUOTE_KEYS ไม่มี tableSessionId");
    if (!/"expectedTableItemsHash"/.test(constBody(reg, "const REG_SUBMIT_KEYS"))) p.push("REG_SUBMIT_KEYS ไม่มี expectedTableItemsHash");
    const leaves = (o: unknown, pre = ""): [string, string][] => (typeof o === "string" ? [[pre, o]] : isRecord(o) ? Object.entries(o).flatMap(([k, v]) => leaves(v, pre ? `${pre}.${k}` : k)) : []);
    const blocks: Record<string, [string, string][]> = {};
    for (const [lang, f] of [["th", F.msgTh], ["en", F.msgEn]] as const) {
      let j: Any = null;
      try {
        j = JSON.parse(rd(f) || "null");
      } catch (e) {
        p.push(`${f} อ่าน JSON ไม่ได้: ${(e as Error).message.slice(0, 40)}`);
      }
      const lv = leaves(j?.tables);
      blocks[lang] = lv;
      if (!lv.length) p.push(`${lang}: ไม่มีก้อนข้อความ tables.*`);
      else if (lang === "th" && !lv.some(([, s]) => THAI.test(s))) p.push("th: tables.* ไม่มีข้อความไทย");
      else if (lang === "en" && lv.some(([, s]) => THAI.test(s))) p.push(`en: tables.* มีอักษรไทย (${lv.filter(([, s]) => THAI.test(s)).map(([k]) => k).slice(0, 3).join(",")})`);
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
    if (kt.length && ke.length && short(kt, 8000) !== short(ke, 8000)) p.push(`คีย์ tables.* th/en ไม่ตรงกัน (th ${kt.length} · en ${ke.length})`);
    chk("ST2", p.length === 0, "scope · POS_MODELS · 6 รหัส · คีย์ quote/submit · ข้อความ th/en", P8(p) || `ครบ (${kt.length} คีย์ tables.*)`);
  }
  // ST3 ขอบเขตโมดูล
  {
    const p: string[] = [];
    const idxRaw = rd(F.restIndex);
    if (!idxRaw) p.push("ไม่มี restaurant/index.ts");
    else {
      if (!/POS P2\.4\s*▸/.test(idxRaw)) p.push("restaurant/index.ts ไม่มีรอยต่อ // POS P2.4 ▸ … ◂");
      if (!exportsFn(stripComments(idxRaw), "createOrderInTx")) p.push("restaurant/index.ts ไม่ export createOrderInTx");
    }
    if (!exportsFn(srcOf(F.restOrder), "createOrderInTx")) p.push("restaurant/order.ts ไม่ export createOrderInTx");
    const tsrc = srcOf(F.table);
    for (const n of TABLE_FNS) if (!exportsFn(tsrc, n)) p.push(`pos/table.ts ไม่ export ${n}`);
    // POS → ร้านอาหาร: ผ่าน index เท่านั้น · แบบ lazy (import()) · type import ได้
    let lazyUsers = 0;
    for (const f of walk(POS_DIR)) {
      const s = srcOf(f);
      const deep = [...s.matchAll(/(?:from\s*|import\s*\(\s*)["'](@\/lib\/modules\/restaurant\/[^"']+|\.\.\/restaurant[^"']*)["']/g)].map((m) => m[1]!);
      if (deep.length) p.push(`${f.split("/").slice(-2).join("/")} import ร้านอาหารแบบเจาะไฟล์ (${deep[0]})`);
      if (/^\s*import\s+(?!type\b)[^;]*?from\s+["']@\/lib\/modules\/restaurant["']/m.test(s)) p.push(`${f.split("/").slice(-2).join("/")} import ร้านอาหารแบบ static (ต้อง import() — กันวง restaurant→pos)`);
      if (/import\s*\(\s*["']@\/lib\/modules\/restaurant["']\s*\)/.test(s)) lazyUsers++;
    }
    if (lazyUsers < 1) p.push('ไม่มีไฟล์ใน modules/pos ที่เรียก import("@/lib/modules/restaurant")');
    // ผู้เขียนตารางร้านอาหาร = restaurant/* เท่านั้น
    const W = "(create|createMany|update|updateMany|upsert|delete|deleteMany)";
    const RM = "(restaurantOrder|restaurantOrderItem|restaurantOrderItemOption|restaurantTable|restaurantZone|tableSession|restaurantServiceRequest|restaurantReservation|restaurantDailyCounter)";
    for (const f of [...walk(POS_DIR), F.consumers]) {
      const s = srcOf(f);
      if (new RegExp(`\\.${RM}\\.${W}\\b`).test(s)) p.push(`${f.split("/").slice(-2).join("/")} เขียนตารางร้านอาหารตรง (ต้องผ่าน facade)`);
      if (/(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"(Restaurant\w*|TableSession)"/i.test(s)) p.push(`${f.split("/").slice(-2).join("/")} SQL เขียนตารางร้านอาหารตรง`);
    }
    // เส้น fitness
    const fit = rd(F.fitness);
    const edgeLines = fit.split("\n").filter((l) => /"pos→restaurant"/.test(l));
    if (edgeLines.length !== 1) p.push(`fitness.mts มี "pos→restaurant" ${edgeLines.length} บรรทัด (คาด 1)`);
    else if (!/POS P2\.4\s*▸/.test(edgeLines[0]!)) p.push('บรรทัด "pos→restaurant" ไม่มีรอยต่อ // POS P2.4 ▸ … ◂');
    // ORACLE-EDIT ผู้คุม 10 ต.ค. (P2.4 S fix 1 · มติ 1): ตัดเฉพาะคอมเมนต์บรรทัด — stripComments มองสตริง "/*" ใน F1.3 ของ fitness.mts เป็นคอมเมนต์ก้อน แล้วกลืน ALLOWED_EDGES ทั้งก้อน
    if (!/"pos→restaurant"/.test(constBody(fit.replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1"), "const ALLOWED_EDGES"))) p.push('"pos→restaurant" ไม่อยู่ใน ALLOWED_EDGES');
    // advisory lock ใน openSession
    if (!/pg_advisory_xact_lock/.test(fnBody(srcOf(F.restTable), "openSession"))) p.push("restaurant/table.ts openSession ไม่มี pg_advisory_xact_lock (Q9)");
    // table-actions
    const taRaw = rd(F.tableActions);
    if (!taRaw) p.push("ไม่มี pos/table-actions.ts");
    else {
      if (!isUseServer(taRaw)) p.push('table-actions.ts ไม่ขึ้นต้น "use server"');
      const ta = stripComments(taRaw);
      const bad = [...ta.matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim()).filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`table-actions.ts export ที่ไม่ใช่ async function (${short(bad.map((b) => b.slice(0, 40)), 100)})`);
      for (const n of TABLE_FNS) if (!new RegExp(`\\b${n}\\s*\\(`).test(ta)) p.push(`table-actions.ts ไม่เรียก ${n}`);
      const starts = [...ta.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map((m) => ({ name: m[1]!, at: m.index! }));
      for (let i = 0; i < starts.length; i++) {
        const body = ta.slice(starts[i]!.at, i + 1 < starts.length ? starts[i + 1]!.at : ta.length);
        if (!/\bcatch\b/.test(body)) p.push(`${starts[i]!.name} ไม่มี catch`);
      }
    }
    // table-shared บริสุทธิ์
    if (!existsSync(join(ROOT, F.tableShared))) p.push("ไม่มี pos/table-shared.ts");
    else {
      if (!purePath(F.tableShared)) p.push("table-shared.ts import prisma/db/โมดูลเซิร์ฟเวอร์/node: (ต้องบริสุทธิ์ · client-safe)");
      for (const n of SHARED_EXPORTS) if (!exportsFn(srcOf(F.tableShared), n)) p.push(`table-shared.ts ไม่ export ${n}`);
    }
    // 'use client'
    for (const f of walk("src")) {
      const raw = rd(f);
      if (!isUseClient(raw)) continue;
      const imps = [...stripComments(raw).matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
      const badc = imps.filter((x) => /modules\/pos\/table$|modules\/restaurant\/index$|modules\/restaurant$/.test(x));
      if (badc.length) p.push(`${f} ('use client') import ${badc.join(",")}`);
    }
    // ตัวรับ void
    const consRaw = rd(F.consumers);
    const cl = consRaw.split("\n");
    const iv = cl.findIndex((l) => /"pos\.sale\.voided"\s*:/.test(l));
    if (iv < 0) p.push("outbox-consumers.ts ไม่มี pos.sale.voided");
    else if (!/POS P2\.4\s*▸/.test(cl.slice(Math.max(0, iv - 8), iv + 8).join("\n"))) p.push("ตัวรับ pos.sale.voided ไม่มีรอยต่อ POS P2.4 ▸ (±8 บรรทัด)");
    if (!/import\s*\(\s*["']@\/lib\/modules\/(restaurant|pos\/table)["']\s*\)/.test(stripComments(consRaw))) p.push('outbox-consumers.ts ไม่เรียก import("@/lib/modules/restaurant") หรือ import("@/lib/modules/pos/table") (ตัวรับเขียนผ่าน facade)');
    // โน้ตเจ้าของ
    const own = rd(F.ownerPending).split("\n").filter((l) => /P2\.4/.test(l));
    if (!own.some((l) => /RestaurantReservation|dirtySince|schema ร้านอาหาร|restaurant schema/i.test(l))) p.push("POS-OWNER-PENDING.md ไม่มีบรรทัด P2.4 เรื่อง schema ร้านอาหาร (RestaurantReservation/dirtySince)");
    if (!own.some((l) => /one_open_session_per_table/.test(l))) p.push("POS-OWNER-PENDING.md ไม่มีบรรทัด P2.4 เรื่อง one_open_session_per_table (P6.1)");
    if (!own.some((l) => /checkout/i.test(l) && /(race|แข่ง|พร้อมกัน|claim|ยึด)/i.test(l))) p.push("POS-OWNER-PENDING.md ไม่มีบรรทัด P2.4 เรื่อง race ของ checkout เดิม (Q9)");
    chk("ST3", p.length === 0, "facade · export ครบ · lazy index import · ผู้เขียนเดียว · fitness · lock · actions · shared · ตัวรับ · โน้ตเจ้าของ", P8(p) || `ครบ (${lazyUsers} ไฟล์ pos ใช้ facade)`);
  }
  // ST4 สัญญา + facts + use server + ไม่มี event ใหม่
  {
    const p: string[] = [];
    const raw = existsSync(join(ROOT, F.contract)) ? readFileSync(join(ROOT, F.contract)) : Buffer.from("");
    const h = createHash("sha256").update(raw).digest("hex");
    if (h !== CONTRACT_SHA_BASE) p.push(`pos-sale-contract.json เปลี่ยน (sha ${h.slice(0, 12)} ≠ ${CONTRACT_SHA_BASE.slice(0, 12)})`);
    const integ = srcOf(F.integrations);
    if (!/\["tableReservationsOnMap",\s*false,\s*"P2\.4"\]/.test(integ)) p.push('BOOKING tableReservationsOnMap ไม่ใช่ false "P2.4"');
    if (!/\["callQueueFromTable",\s*false,\s*"P2\.4"\]/.test(integ)) p.push('BOOKING callQueueFromTable ไม่ใช่ false "P2.4"');
    const files = walk(POS_DIR).filter((f) => isUseServer(rd(f)));
    for (const f of files) {
      const bad = [...srcOf(f).matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim()).filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`${f.split("/").pop()}: export ที่ไม่ใช่ async function (${short(bad.map((b) => b.slice(0, 40)), 100)})`);
    }
    for (const f of [F.table, F.restIndex]) if (/\bemitOutbox\b|\.outboxEvent\.(create|createMany|upsert)\b/.test(srcOf(f))) p.push(`${f.split("/").slice(-2).join("/")} ปล่อย outbox event (R12: ตัวรับอย่างเดียว)`);
    chk("ST4", p.length === 0, "สัญญา createSale ตรงฐาน · BOOKING facts false · use server · ไม่มี event ใหม่", P8(p) || `ครบ (${files.length} ไฟล์ use server)`);
  }
  // L2 ทะเบียนผู้เรียก createSale
  {
    const p: string[] = [];
    const found: Record<string, number> = {};
    for (const f of walk("src")) {
      if (f.endsWith("src/lib/modules/pos/service.ts") || f.endsWith("src/lib/contracts.ts")) continue;
      const n = (stripComments(rd(f)).match(/\bcreateSale\s*\(/g) ?? []).length;
      if (n) found[f] = n;
    }
    const want = (f: string) => CALL_SITES[f] ?? (found[f] === CALL_SITES_ALLOWED_LATER[f] ? CALL_SITES_ALLOWED_LATER[f] : 0);
    const diff = [...new Set([...Object.keys(CALL_SITES), ...Object.keys(found)])].filter((f) => want(f) !== (found[f] ?? 0)).map((f) => `${f.replace("src/lib/", "")}:${want(f)}→${found[f] ?? 0}`);
    if (diff.length) p.push(`ต่าง: ${diff.join(", ")}`);
    for (const f of [F.table, F.tableActions, F.tableShared, F.restIndex]) if (/\bcreateSale\b/.test(srcOf(f))) p.push(`${f.split("/").pop()} อ้าง createSale`);
    const total = sum(Object.values(found));
    chk("L2", p.length === 0, "18 จุด/15 ไฟล์ตรงทะเบียน · ไฟล์โต๊ะไม่มี createSale", P8(p) || `ครบ (${total} จุด/${Object.keys(found).length} ไฟล์)`);
  }
  // L3 ลายเซ็น export ของร้านอาหาร
  {
    const p: string[] = [];
    let n = 0;
    for (const [file, want] of Object.entries(SIGS_BASE)) {
      const got = exportSigs(rd(`${REST_DIR}/${file}.ts`));
      for (const [name, sha] of Object.entries(want)) {
        n++;
        const g = got.get(name);
        if (!g) p.push(`${file}.${name} หายไป`);
        else if (g !== sha) p.push(`${file}.${name} ลายเซ็นเปลี่ยน (${sha} → ${g})`);
      }
    }
    chk("L3", p.length === 0, "export เดิมทุกตัวลายเซ็นเดิม", P8(p) || `ครบ (${n} export)`);
  }
}

// ═════════════════════════ 1b. บริสุทธิ์ (ไม่แตะ DB) ═════════════════════════
async function runPure(shared: Any, regShared: Any): Promise<void> {
  console.log("\n── ST5 บริสุทธิ์ (table-shared · refusalMessageKey) ──");
  const p: string[] = [];
  if (!shared) p.push(`${MISSING} table-shared.ts`);
  // TABLE_STATES
  const ts = shared?.TABLE_STATES;
  if (!Array.isArray(ts) || ts.join(",") !== STATES.join(",")) p.push(`TABLE_STATES = ${short(ts, 80)} (คาด ${STATES.join(",")})`);
  // tableStateOf: ธงแรกที่จริงตามลำดับ
  if (typeof shared?.tableStateOf !== "function") p.push(`${MISSING} tableStateOf`);
  else {
    let wrong = 0;
    let first = "";
    for (let m = 0; m < 32; m++) {
      const flags = { inactive: !!(m & 1), billRequested: !!(m & 2), open: !!(m & 4), dirty: !!(m & 8), reserved: !!(m & 16) };
      const want = flags.inactive ? "INACTIVE" : flags.billRequested ? "BILL_REQUESTED" : flags.open ? "DINING" : flags.dirty ? "NEEDS_CLEARING" : flags.reserved ? "RESERVED" : "FREE";
      const got = callSync(shared, "tableStateOf", Object.freeze({ ...flags }));
      if (got !== want) {
        wrong++;
        if (!first) first = `${short(flags, 90)} → ${short(got, 40)} (คาด ${want})`;
      }
    }
    if (wrong) p.push(`tableStateOf ผิด ${wrong}/32 เช่น ${first}`);
  }
  // reservationHolds + ค่าคงที่
  if (shared?.RESERVATION_HOLD_DEFAULT_MINUTES !== 15) p.push(`RESERVATION_HOLD_DEFAULT_MINUTES = ${short(shared?.RESERVATION_HOLD_DEFAULT_MINUTES)}`);
  if (shared?.RESERVATION_LATE_MINUTES !== 30) p.push(`RESERVATION_LATE_MINUTES = ${short(shared?.RESERVATION_LATE_MINUTES)}`);
  if (typeof shared?.reservationHolds !== "function") p.push(`${MISSING} reservationHolds`);
  else {
    const at = 1_800_000_000_000;
    const MINUTE = 60_000;
    const cases: [number, number, boolean][] = [
      [at - 15 * MINUTE - 1, 15, false], [at - 15 * MINUTE, 15, true], [at, 15, true], [at + 30 * MINUTE, 15, true], [at + 30 * MINUTE + 1, 15, false],
      [at - 60 * MINUTE, 60, true], [at - 61 * MINUTE, 60, false], [at - 1, 0, false],
    ];
    for (const [now, hold, want] of cases) {
      const got = callSync(shared, "reservationHolds", at, hold, now);
      if (got !== want) p.push(`reservationHolds(at, ${hold}, at${now - at >= 0 ? "+" : ""}${(now - at) / MINUTE}m) = ${short(got, 30)} (คาด ${want})`);
    }
  }
  // tableItemsHash
  if (typeof shared?.tableItemsHash !== "function") p.push(`${MISSING} tableItemsHash`);
  else {
    const a = Object.freeze(["it_b", "it_a", "it_c"]);
    const h1 = callSync(shared, "tableItemsHash", a);
    const h2 = callSync(shared, "tableItemsHash", ["it_c", "it_a", "it_b"]);
    const h3 = callSync(shared, "tableItemsHash", ["it_a", "it_b"]);
    const h4 = callSync(shared, "tableItemsHash", ["it_b", "it_a", "it_c"]);
    if (typeof h1 !== "string" || !h1) p.push(`tableItemsHash → ${short(h1, 60)} (คาดสตริงไม่ว่าง)`);
    else {
      if (h1 !== h2) p.push("tableItemsHash ขึ้นกับลำดับ");
      if (h1 === h3) p.push("tableItemsHash ชุดต่างได้ค่าเดียวกัน");
      if (h1 !== h4) p.push("tableItemsHash ไม่คงที่");
    }
    if (a.join(",") !== "it_b,it_a,it_c") p.push("tableItemsHash แก้อินพุต");
  }
  // refusalMessageKey
  for (const c of NEW_CODES) {
    const k = callSync(regShared, "refusalMessageKey", c);
    if (k !== camelKey(c)) p.push(`refusalMessageKey(${c}) = ${short(k, 40)} (คาด ${camelKey(c)})`);
  }
  chk("ST5", p.length === 0, "สถานะ 6 แบบ · ลำดับความสำคัญ · ช่วงกันโต๊ะ · hash · คีย์ข้อความ", P8(p) || "ครบ");
}

// ═════════════════════════ 1c. --no-db ═════════════════════════
const loadShared = async () => (existsSync(join(ROOT, F.tableShared)) && purePath(F.tableShared) ? await tryImport("@/lib/modules/pos/table-shared") : null);
const loadRegShared = async () => (purePath(F.regShared) ? await tryImport("@/lib/modules/pos/register-shared") : null);
if (NODB) {
  const ids = [...STATIC_IDS, ...PURE_IDS];
  console.log(`[${SUITE}] --no-db: รัน ${ids.length} ข้อ (สถิต + บริสุทธิ์ · ไม่โหลด prisma)`);
  let crashedS = "";
  try {
    await runStatic();
    if (existsSync(join(ROOT, F.tableShared)) && !purePath(F.tableShared)) console.log("  ⚠️  table-shared.ts ไม่บริสุทธิ์ — --no-db ไม่โหลด (ST5 แดง)");
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
const RES: Any = typeof P.restaurantReservation?.findMany === "function" ? P.restaurantReservation : null;
if (!RES) skipReasons.push("Prisma client ยังไม่มี delegate restaurantReservation");
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosHeldCart','RestaurantTable','RestaurantReservation')`)) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const COL = { held: dbCols.has("PosHeldCart.tableSessionId"), dirty: dbCols.has("RestaurantTable.dirtySince"), res: dbCols.has("RestaurantReservation.partySize") };
if (!COL.held) skipReasons.push("ฐาน QC4 ยังไม่มีคอลัมน์ PosHeldCart.tableSessionId");
if (!COL.dirty) skipReasons.push("ฐาน QC4 ยังไม่มีคอลัมน์ RestaurantTable.dirtySince");
if (!COL.res) skipReasons.push("ฐาน QC4 ยังไม่มีตาราง RestaurantReservation");

const FP_TABLES: [string, string][] = [["RestaurantTable", "updatedAt"], ["TableSession", "updatedAt"], ["RestaurantOrderItem", "updatedAt"], ["PosHeldCart", "version"]];
/** ลายนิ้วมือของร้านที่ไม่ใช่ร้านชั่วคราวของข้อสอบนี้ (ข้อมูล — lane อื่นเขียนพร้อมกันได้) */
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h
         FROM "${tb}" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE 'posqc-p24-%'))`,
      )) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      out[tb] = `err:${(e as Error).message.slice(0, 40)}`;
    }
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.4 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล · L เขียว)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · L เขียว)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ex = (f: string) => existsSync(join(ROOT, f));
const sharedMod = await loadShared();
const regSharedMod = await loadRegShared();
const tableMod = ex(F.table) ? await tryImport("@/lib/modules/pos/table") : null;
const catalog = await tryImport("@/lib/modules/pos/catalog");
const register = await tryImport("@/lib/modules/pos/register");
const heldMod = await tryImport("@/lib/modules/pos/held-cart");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const paySetMod = await tryImport("@/lib/modules/pos/payment-settings");
const invSvc = await tryImport("@/lib/modules/inventory/service");
const menu = await tryImport("@/lib/modules/restaurant/menu");
const rtable = await tryImport("@/lib/modules/restaurant/table");
const rorder = await tryImport("@/lib/modules/restaurant/order");
const kds = await tryImport("@/lib/modules/restaurant/kds");
const storefront = await tryImport("@/lib/modules/restaurant/storefront");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const memMod = await tryImport("@/lib/modules/member");
const tierMod = await tryImport("@/lib/modules/member/tiers");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p2.4-${RAND}`;
const T_SLUG = `posqc-p24-${RAND}`;
const T2_SLUG = `posqc-p24-${RAND}-t2`;
const EMAIL_PREFIX = `${T_SLUG}-`;
const KEY_PREFIX = `qc24-${RAND}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";
const RUN_START = Date.now();
const MIN = 60_000;
const MY_SALES: string[] = [];

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

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} ──`);
  console.log("   สาขา A (RESTAURANT · POS + คลัง + สมาชิก + บัญชี VAT · ค่าบริการ POS 10% · RestaurantSetting 10%) · สาขา B (POS · ไม่มีโต๊ะ) · ร้าน T2 สาขา X (โต๊ะ X1)");
  let fx = "";
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean> }> = {};
  const TB: Record<string, string> = {}; // ชื่อโต๊ะ → id
  const QR: Record<string, string> = {}; // ชื่อโต๊ะ → qrToken
  const ZN: Record<string, { id: string; name: string }> = {};
  const MI: Record<string, string> = {}; // เมนู → MenuItem.id
  const PP: Record<string, string> = {}; // ชื่อเล่น → PosProduct.id
  const CH: Record<string, string> = {}; // ตัวเลือก → MenuOptionChoice.id
  const ST: Record<string, string> = {}; // สถานี
  const INV: Record<string, string> = {};
  const SID: Record<string, string> = {}; // ชื่อโต๊ะ → TableSession.id
  const SALE: Record<string, string> = {};
  let MEMBER = "";
  const MEMBER_NAME = `คุณวิภา คิวซี ${RAND}`;
  let SX = ""; // session ของโต๊ะร้าน T2
  try {
    T = (await P.tenant.create({ data: { name: `QC P2.4 โหมดโต๊ะ ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P2.4 ร้านที่สอง ${RAND}`, slug: T2_SLUG } })).id;
    U.A = (await P.businessUnit.create({ data: { tenantId: T, type: "RESTAURANT", name: `${TAG} สาขาA`, slug: `${T_SLUG}-a` } })).id;
    U.B = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาB`, slug: `${T_SLUG}-b` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "RESTAURANT", name: `${TAG} สาขาX`, slug: `${T2_SLUG}-x` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
    S.INV = (await sysSvc.createSystem(T, "INVENTORY", `คลัง ${RAND}`)).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี ${RAND}`)).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", `สมาชิก ${RAND}`)).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: `ร้านโต๊ะคิวซี ${RAND} จำกัด`, taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.POS, U.B);
    await sysSvc.linkUnit(T, S.INV, U.A);
    await sysSvc.linkUnit(T, S.MEM, U.A);
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  // ผู้ใช้ + Membership จริง
  const spec: [string, string, string[], Record<string, boolean>][] = [
    ["OWNER", "OWNER", ["*"], {}],
    ["MGR", "MANAGER", [U.A ?? "-"], {}],
    ["STAFF", "STAFF", [U.A ?? "-"], { "pos.sale.create": true, "restaurant.session.open": true, "restaurant.order.create": true }],
    ["STAFF0", "STAFF", [U.A ?? "-"], { "pos.sale.create": true }],
    ["STAFFR", "STAFF", [U.A ?? "-"], { "pos.sale.read": true }],
    ["NOPERM", "STAFF", [U.A ?? "-"], {}],
  ];
  if (!fx) {
    try {
      for (const [k, role, unitAccess, perms] of spec) {
        const u = await P.user.create({ data: { email: `${EMAIL_PREFIX}${k.toLowerCase()}@qc.invalid`, name: `${k} คิวซี${RAND}` } });
        await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess, permissions: perms, acceptedAt: new Date() } });
        US[k] = { id: u.id, role, unitAccess, perms };
      }
    } catch (e) {
      fx = `ผู้ใช้:${(e as Error).message.slice(0, 140)}`;
    }
  }
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const cc = (k: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", actorUserId: uid(k) });
  const DEV1 = `qc24${RAND}d1`;
  const DEV2 = `qc24${RAND}d2`;
  const ctxA = (dev?: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", unitId: U.A ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const ctxB = (): Any => ({ tenantId: T, systemId: S.POS ?? "none", unitId: U.B ?? "none" });
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? r?.reason ?? "", 80)}`);
    return r;
  };

  // ─── เมนู · ตัวเลือก · สถานี · น้ำเปล่า (PRODUCT ผ่านคลัง) · ค่าตั้ง ───
  if (!fx) {
    try {
      await menu.ensureDefaultStations(T, U.A);
      must("createStation", await menu.createStation(T, U.A, `ยำ ${RAND}`));
      for (const s of (await menu.listStations(T, U.A)) as Any[]) ST[s.name === "ครัว" ? "k" : s.name === "เครื่องดื่ม" ? "d" : "y"] = s.id;
      ST.first = String(((await menu.listStations(T, U.A)) as Any[])[0]?.id ?? "");
      const cat = must("createCategory", await menu.createCategory(T, U.A, { name: `อาหาร ${RAND}` }, uid("OWNER")));
      const grp = must("createOptionGroup", await menu.createOptionGroup(T, U.A, { name: `เพิ่มเติม ${RAND}`, minSelect: 0, maxSelect: 2, choices: [{ name: "เผ็ดกลาง", priceDelta: 0 }, { name: "กุ้งเพิ่ม", priceDelta: 4000 }] }));
      for (const c of (await P.menuOptionChoice.findMany({ where: { tenantId: T, groupId: grp.id } })) as Any[]) CH[c.name === "กุ้งเพิ่ม" ? "shrimp" : "spicy"] = c.id;
      const mk = async (key: string, name: string, basePrice: number, stationId: string, o: Any = {}) => {
        const r = must(`createItem ${key}`, await menu.createItem(T, U.A, { categoryId: cat.id, stationId, name, basePrice, ...o }, uid("OWNER")));
        MI[key] = r.id;
        PP[key] = String((await P.menuItem.findUnique({ where: { id: r.id }, select: { posProductId: true } }))?.posProductId ?? "");
        if (!PP[key]) throw new Error(`เมนู ${key} ไม่มี posProductId (POS ไม่ผูกสาขา?)`);
      };
      await mk("tomyum", `ต้มยำ ${RAND}`, 18000, ST.y!, { optionGroupIds: [grp.id] });
      await mk("rice", `ข้าวสวย ${RAND}`, 1805, ST.k!);
      await mk("stock", `ผัดกะเพรา ${RAND}`, 16000, ST.k!, { stockQty: 2 });
      const it = await invSvc.createItem({ tenantId: T, systemId: S.INV, actorUserId: uid("OWNER") }, { sku: `${KEY_PREFIX}-water`, name: `น้ำเปล่า ${RAND}`, unitLabel: "ขวด", costSatang: 400 });
      INV.water = it.id;
      await invSvc.receive({ tenantId: T, systemId: S.INV, actorUserId: uid("OWNER") }, { itemId: it.id, qty: 100, costSatang: 400, idempotencyKey: `${KEY_PREFIX}-recv-water` });
      PP.water = String((await P.posProduct.findFirst({ where: { tenantId: T, systemId: S.POS, invItemId: it.id }, select: { id: true } }))?.id ?? "");
      if (!PP.water) throw new Error("น้ำเปล่าไม่มีแถว PRODUCT (P1.1b)");
      must("setPrice water", await call(catalog, "setPrice", cc("OWNER"), PP.water, 1000));
      must("ค่าบริการ POS", await call(paySetMod, "updatePosPaymentSettings", { tenantId: T, systemId: S.POS }, A("OWNER"), { serviceCharge: { enabled: true, rateBp: 1000 } }));
      await menu.updateSetting(T, U.A, { serviceChargeBps: 1000 });
    } catch (e) {
      fx = `เมนู/สินค้า:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── สมาชิก (Silver ลด 10%) ───
  if (!fx) {
    try {
      const ctxM: Any = { tenantId: T, systemId: S.MEM, actorUserId: uid("OWNER") };
      const silver = await tierMod.createTierDef(ctxM, A("OWNER"), { key: "silver", name: "Silver", color: "SLATE", isDefault: true, legacyTier: "SILVER" });
      await tierMod.setBenefits(ctxM, A("OWNER"), silver.id, [{ type: "DISCOUNT_PCT", config: { pct: 10, maxSatang: 100_000 } }]);
      const m = await memMod.createMember(ctxM, A("OWNER"), { phone: `0897${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`, name: MEMBER_NAME, source: "WALK_IN", homeUnitId: U.A });
      MEMBER = String(m?.customerId ?? "");
      try {
        await tierMod.applyTierChange(ctxM, MEMBER, silver.id, "MANUAL", { qc: TAG }, { byUserId: uid("OWNER") });
      } catch {
        /* เป็น Silver ปริยายอยู่แล้ว */
      }
      if (!MEMBER) throw new Error("ไม่มี customerId");
    } catch (e) {
      console.log(`  ⚠️  สมาชิก: ${(e as Error).message.slice(0, 120)} (B3/T6 แดงด้วยเหตุ fixture)`);
    }
  }
  // ─── โซน · โต๊ะ ───
  if (!fx) {
    try {
      for (const [k, nm] of [["Z1", `ในร้าน ${RAND}`], ["Z2", `ระเบียง ${RAND}`]] as const) ZN[k] = { id: must(`zone ${k}`, await rtable.createZone(T, U.A, nm)).id, name: nm };
      const mkT = async (name: string, zone: string, tid = T, unit = U.A!) => {
        const r = must(`table ${name}`, await rtable.createTable(tid, unit, { zoneId: zone, name, seats: 4 }));
        TB[name] = r.id;
        QR[name] = r.qrToken;
      };
      for (let i = 1; i <= 9; i++) await mkT(`A${i}`, ZN.Z1!.id);
      for (let i = 1; i <= 7; i++) await mkT(`C${i}`, ZN.Z2!.id);
      await mkT("L1", ZN.Z2!.id);
      await rtable.updateTable(T, U.A, TB.A3, { status: "INACTIVE" });
      const zx = must("zone X", await rtable.createZone(T2, U.X, `โซนร้านอื่น ${RAND}`));
      await mkT("X1", zx.id, T2, U.X!);
      SX = String(must("session X1", await rtable.openSession(T2, U.X, TB.X1, { guestCount: 2 })).id ?? "");
    } catch (e) {
      fx = `โต๊ะ:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── เครื่อง + กะ (2 เครื่อง) ───
  const SHIFT: Record<string, string> = {};
  if (!fx) {
    for (const [k, dev] of [["1", DEV1], ["2", DEV2]] as const) {
      const rg = await call(devMod, "registerDevice", ctxA(), A("OWNER"), { name: `เคาน์เตอร์ QC P2.4 ${k}`, deviceCode: dev });
      if (rg?.ok !== true) console.log(`  ⚠️  registerDevice ${k}: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
      const o = await call(shiftMod, "openShift", ctxA(dev), A("OWNER"), { deviceId: dev, deviceLabel: `เคาน์เตอร์ QC P2.4 ${k}`, floatSatang: 0 });
      if (o?.ok !== true) fx = `เปิดกะ ${k}: ${codeOf(o)} ${short(o?.message ?? "", 80)}`;
      else SHIFT[k] = String(o.shift?.id ?? "");
    }
  }
  if (fx) console.log(`  ⚠️  fixture: ${fx}`);
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NCOL = () => (!COL.held ? `${MISSING} คอลัมน์ PosHeldCart.tableSessionId · ` : "") + (!COL.dirty ? `${MISSING} คอลัมน์ RestaurantTable.dirtySince · ` : "") + (!COL.res ? `${MISSING} ตาราง RestaurantReservation · ` : "");
  const NT = (name: string) => (typeof tableMod?.[name] === "function" ? "" : `${MISSING} ${name} · `);

  // ─── ตัวช่วย ───
  let keyN = 0;
  const newKey = (pfx = "k") => `${KEY_PREFIX}-${pfx}-${++keyN}`;
  const tbl = (fn: string, ...args: unknown[]) => call(tableMod, fn, ...args);
  const opts = (...names: string[]) => names.map((n) => ({ choiceId: CH[n] ?? `none-${n}` }));
  const ml = (key: string, qty: number, ...choices: string[]): Any => ({ productId: PP[key] ?? `none-${key}`, qty, ...(choices.length ? { options: opts(...choices) } : {}) });
  const sessRow = async (id: string): Promise<Any> => (id ? P.tableSession.findUnique({ where: { id } }).catch(() => null) : null);
  const tableRow = async (id: string): Promise<Any> => (id ? P.restaurantTable.findUnique({ where: { id } }).catch(() => null) : null);
  const itemsOf = async (sessionId: string): Promise<Any[]> =>
    sessionId ? ((await P.restaurantOrderItem.findMany({ where: { tenantId: T, order: { sessionId } }, include: { options: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]) : [];
  const openSessCount = async (tableId: string, tid = T) => Number(await P.tableSession.count({ where: { tenantId: tid, tableId, status: "OPEN" } }).catch(() => -1));
  const heldRows = async (sessionId: string): Promise<Any[]> => ((await P.posHeldCart.findMany({ where: { tenantId: T } }).catch(() => [])) as Any[]).filter((r) => r.tableSessionId === sessionId && !!sessionId);
  const heldRow = async (id: string): Promise<Any> => (id ? P.posHeldCart.findUnique({ where: { id } }).catch(() => null) : null);
  /** เปิดโต๊ะ: ทางใหม่ (registerOpenTable) — ยังไม่มี = ประตูเดิม (openSession + linkMember) เพื่อให้ข้อถัดไปมี session ตรวจต่อได้ */
  const openT = async (name: string, o: { guestCount?: number; memberId?: string; actor?: string } = {}): Promise<string> => {
    const r = await tbl("registerOpenTable", ctxA(), A(o.actor ?? "OWNER"), { tableId: TB[name], ...(o.guestCount ? { guestCount: o.guestCount } : {}), ...(o.memberId ? { memberId: o.memberId } : {}) });
    if (r?.ok === true && r.sessionId) return (SID[name] = String(r.sessionId));
    const l = await rtable.openSession(T, U.A, TB[name], { guestCount: o.guestCount, openedByUserId: uid(o.actor ?? "OWNER") });
    if (l?.ok && o.memberId) await rtable.linkMember(T, U.A, l.id, o.memberId);
    return (SID[name] = l?.ok ? String(l.id) : "");
  };
  /** ออเดอร์ผ่านประตูเดิม (เมนูเท่านั้น) */
  const legacyOrder = async (sessionId: string, cart: [string, number, string[]][]): Promise<Any> =>
    rorder.createOrder({ tenantId: T, unitId: U.A, type: "DINE_IN", sessionId, cart: cart.map(([k, qty, ch]) => ({ menuItemId: MI[k], qty, choiceIds: ch.map((c) => CH[c]) })), placedByUserId: uid("OWNER") });
  // ORACLE-EDIT ผู้คุม 10 ต.ค. (P2.4 S fix 3 · N1): โหมดโต๊ะต้องระบุร่าง — ปริยาย newDraft:true · แก้ร่างเดิมส่ง {heldCartId, expectedVersion} (assertion เดิมทุกข้อ)
  const hold = (sessionId: string, lines: Any[], actor = "OWNER", extra: Any = {}, ctx: Any = ctxA(DEV1), mode: Any = { newDraft: true }) =>
    call(heldMod, "holdRegisterCart", ctx, A(actor), { cart: { lines, ...extra }, tableSessionId: sessionId, ...mode });
  const send = (sessionId: string, heldCartId: string, actor = "OWNER") => tbl("registerSendTableRound", ctxA(DEV1), A(actor), { tableSessionId: sessionId, heldCartId });
  const tq = (sessionId: string, extra: Any = {}, ctx: Any = ctxA(DEV2), actor = "OWNER") => call(register, "quoteRegisterCart", ctx, A(actor), { lines: [], tableSessionId: sessionId, ...extra });
  const quote = (lines: Any[], extra: Any = {}) => call(register, "quoteRegisterCart", ctxA(DEV2), A("OWNER"), { lines, ...extra });
  const tpay = async (sessionId: string, q: Any, o: { key?: string; ctx?: Any } = {}): Promise<{ r: Any; key: string }> => {
    const key = o.key ?? newKey("tp");
    const grand = q?.ok === true ? Number(q.grandTotalSatang) : 0;
    const r = await call(register, "submitRegisterSale", o.ctx ?? ctxA(DEV2), A("OWNER"), {
      lines: [], tableSessionId: sessionId, expectedTableItemsHash: q?.table?.itemsHash ?? "none",
      idempotencyKey: key, expectedGrandTotalSatang: grand, payMethods: [{ type: "CASH", amountSatang: grand }], cashReceivedSatang: grand,
    });
    if (r?.ok === true && r.saleId && !MY_SALES.includes(String(r.saleId))) MY_SALES.push(String(r.saleId));
    return { r, key };
  };
  const floor = (ctx: Any = ctxA(), actor = "OWNER") => tbl("registerTables", ctx, A(actor));
  const cardOf = (f: Any, name: string): Any => (Array.isArray(f?.tables) ? (f.tables as Any[]).find((t) => t.id === TB[name]) ?? null : null);
  /** สมมูล: ตะกร้าปกติจากรายการของ session (productId = item.productId ?? MenuItem.posProductId) */
  const eqLines = async (sessionId: string): Promise<Any[]> => {
    const its = (await itemsOf(sessionId)).filter((x) => x.kdsStatus !== "CANCELLED" && !x.saleId);
    const out: Any[] = [];
    for (const it of its) {
      const pid = it.productId ?? (it.menuItemId ? (await P.menuItem.findUnique({ where: { id: it.menuItemId }, select: { posProductId: true } }))?.posProductId : null);
      out.push({ productId: pid, qty: it.qty, ...(it.options?.length ? { options: (it.options as Any[]).map((o) => ({ choiceId: o.choiceId })) } : {}) });
    }
    return out;
  };
  const xOf = async (dev: string, shiftId: string): Promise<Any> => {
    const r = shiftId ? await call(shiftMod, "xReport", ctxA(dev), A("OWNER"), { shiftId }) : null;
    return r?.ok === true ? r.report : null;
  };
  const pendingReq = async (sessionId: string, type: string): Promise<Any> => P.restaurantServiceRequest.findFirst({ where: { tenantId: T, sessionId, type }, orderBy: { createdAt: "desc" } }).catch(() => null);
  const MSG_VOID_NONE = "โต๊ะนี้ยังไม่มีบิลที่ชำระ — ไม่มีอะไรให้ยกเลิก";

  // ════════ L1 PAR (ก่อนอย่างอื่น — ประตูเดิมล้วน) ════════
  console.log("\n── L ของเดิม (ต้องเขียวทั้งก่อนและหลังสร้าง) ──");
  await step("L1", async () => {
    const p: string[] = [];
    const os = await rtable.openSession(T, U.A, TB.L1, { guestCount: 2, openedByUserId: uid("OWNER") });
    if (!os?.ok) throw new Error(`openSession L1: ${short(os, 80)}`);
    const sid = String(os.id);
    SID.L1 = sid;
    const o = await legacyOrder(sid, [["tomyum", 1, ["shrimp"]], ["rice", 2, []]]);
    if (!o?.ok) throw new Error(`createOrder: ${short(o, 80)}`);
    const its = await itemsOf(sid);
    const nameOfItem = new Map(its.map((x) => [x.id, x.nameSnapshot]));
    const bp = await rorder.billPreview(T, U.A, sid);
    const projBp = { ...bp, lines: [...(bp.lines as Any[])].map((l) => ({ ...l, itemId: nameOfItem.get(l.itemId) === `ต้มยำ ${RAND}` ? "TOMYUM" : nameOfItem.get(l.itemId) === `ข้าวสวย ${RAND}` ? "RICE" : l.itemId })).sort((a, b) => byId(a.name, b.name)) };
    const wantBp = {
      lines: [
        { itemId: "RICE", name: `ข้าวสวย ${RAND}`, qty: 2, unitPriceSatang: 1805, lineTotalSatang: 3610 },
        { itemId: "TOMYUM", name: `ต้มยำ ${RAND} (กุ้งเพิ่ม)`, qty: 1, unitPriceSatang: 22000, lineTotalSatang: 22000 },
      ].sort((a, b) => byId(a.name, b.name)),
      subtotalSatang: 25610, serviceChargeSatang: 2561, totalSatang: 28171, serviceChargeBps: 1000,
    };
    if (JSON.stringify(projBp) !== JSON.stringify(wantBp)) p.push(`billPreview ${short(projBp, 260)}`);
    const co = await rorder.checkout({ tenantId: T, unitId: U.A, sessionId: sid, payMethod: "CASH" });
    const projCo = { ok: co?.ok, saleId: typeof co?.saleId, receiptNo: typeof co?.receiptNo, totalSatang: co?.totalSatang, pointEarned: co?.pointEarned, sessionClosed: co?.sessionClosed };
    if (JSON.stringify(projCo) !== JSON.stringify({ ok: true, saleId: "string", receiptNo: "string", totalSatang: 28171, pointEarned: 0, sessionClosed: true })) p.push(`checkout ${short(co, 160)}`);
    const saleId = String(co?.saleId ?? "");
    SALE.L1 = saleId;
    const key = "rest-" + createHash("sha256").update(`${sid}:${its.map((x) => x.id).sort().join(",")}`).digest("hex").slice(0, 40);
    const sale = saleId ? await P.posSale.findUnique({ where: { id: saleId }, include: { lines: true, payments: true } }).catch(() => null) : null;
    if (!sale) p.push("ไม่พบ PosSale ของ checkout");
    else {
      const proj = {
        sourceModule: sale.sourceModule, sourceId: sale.sourceId === sid, status: sale.status, grand: sale.grandTotalSatang, sc: sale.serviceChargeSatang,
        channelCode: sale.channelCode ?? null, shiftId: sale.shiftId, soldBy: sale.soldByUserId, key: sale.idempotencyKey === key,
        lines: (sale.lines as Any[]).map((l) => [l.name, l.qty, l.unitPriceSatang, l.lineTotalSatang, l.productId ?? null, l.itemId ?? null]).sort((a, b) => byId(String(a[0]), String(b[0]))),
        pay: (sale.payments as Any[]).map((x) => [x.type, x.amountSatang]),
      };
      const want = {
        sourceModule: "RESTAURANT", sourceId: true, status: "PAID", grand: 28171, sc: 0, channelCode: "STORE", shiftId: null, soldBy: null, key: true,
        lines: [["Service charge 10%", 1, 2561, 2561, null, null], [`ข้าวสวย ${RAND}`, 2, 1805, 3610, null, null], [`ต้มยำ ${RAND} (กุ้งเพิ่ม)`, 1, 22000, 22000, null, null]].sort((a, b) => byId(String(a[0]), String(b[0]))),
        pay: [["CASH", 28171]],
      };
      if (JSON.stringify(proj) !== JSON.stringify(want)) p.push(`PosSale ${short(proj, 300)}`);
    }
    const linked = (await itemsOf(sid)).filter((x) => x.saleId === saleId && x.settledAt).length;
    if (linked !== 2 || (await sessRow(sid))?.status !== "CLOSED") p.push(`หลังเช็คบิล ผูก ${linked}/2 · session ${(await sessRow(sid))?.status}`);
    await drain();
    const vc = await rorder.voidCheckout(T, U.A, sid);
    if (JSON.stringify(vc) !== JSON.stringify({ ok: true, voidedSaleIds: [saleId], itemsReset: 2, sessionReopened: true, saleVoided: true })) p.push(`voidCheckout ${short(vc, 160)}`);
    await drain();
    const after = await itemsOf(sid);
    if (after.some((x) => x.saleId) || (await sessRow(sid))?.status !== "OPEN") p.push(`หลัง void รายการผูก ${after.filter((x) => x.saleId).length} · session ${(await sessRow(sid))?.status}`);
    const vs = await P.posSale.findUnique({ where: { id: saleId || "none" }, select: { status: true } }).catch(() => null);
    if (vs?.status !== "VOIDED") p.push(`บิลหลัง void ${vs?.status}`);
    const vc2 = await rorder.voidCheckout(T, U.A, sid);
    if (JSON.stringify(vc2) !== JSON.stringify({ ok: false, reason: MSG_VOID_NONE })) p.push(`void ซ้ำ ${short(vc2, 120)}`);
    const co2 = await rorder.checkout({ tenantId: T, unitId: U.A, sessionId: sid, payMethod: "CASH" });
    const s2 = co2?.saleId ? await P.posSale.findUnique({ where: { id: co2.saleId }, select: { idempotencyKey: true, status: true, grandTotalSatang: true } }).catch(() => null) : null;
    if (co2?.ok !== true || co2.totalSatang !== 28171 || co2.sessionClosed !== true || s2?.idempotencyKey !== `${key}-r1` || s2?.status !== "PAID") p.push(`checkout หลัง void ${short(co2, 100)} คีย์ ${short(s2?.idempotencyKey, 60)}`);
    SALE.L1b = String(co2?.saleId ?? "");
    await drain();
    chk("L1", p.length === 0, "billPreview/checkout/voidCheckout ประตูเดิมตรงทุกไบต์", FX(P8(p) || "ครบ (เหมือนฐาน)"));
  });

  // ════════ T เปิดโต๊ะ ════════
  console.log("\n── T ผัง/เปิดโต๊ะ ──");
  await step("T2", async () => {
    const p: string[] = [];
    const rs = await Promise.all(Array.from({ length: 10 }, () => tbl("registerOpenTable", ctxA(), A("STAFF"), { tableId: TB.A1, guestCount: 4 })));
    const oks = rs.filter((r) => r?.ok === true);
    const created = oks.filter((r) => r.created === true).length;
    const ids = new Set(oks.map((r) => String(r.sessionId)));
    if (oks.length !== 10 || created !== 1 || ids.size !== 1) p.push(`ok ${oks.length}/10 · created ${created} · sessionId ${ids.size} (${[...new Set(rs.map(codeOf))].join(",")})`);
    if (ids.size === 1) SID.A1 = [...ids][0]!;
    const nA1 = await openSessCount(TB.A1!);
    if (oks.length && nA1 !== 1) p.push(`A1 OPEN ${nA1} แถว`);
    if (!SID.A1) {
      const l = await rtable.openSession(T, U.A, TB.A1, { guestCount: 4, openedByUserId: uid("STAFF") });
      SID.A1 = l?.ok ? String(l.id) : "";
    } else {
      const s = await sessRow(SID.A1);
      if (s?.guestCount !== 4 || s?.openedByUserId !== uid("STAFF")) p.push(`session guestCount ${s?.guestCount} openedBy ${s?.openedByUserId === uid("STAFF") ? "STAFF" : s?.openedByUserId}`);
    }
    const ls = await Promise.all(Array.from({ length: 10 }, () => rtable.openSession(T, U.A, TB.C5, { guestCount: 2 }).catch((e: Error) => ({ ok: false, reason: e.message }))));
    const nC5 = await openSessCount(TB.C5!);
    const lids = new Set(ls.filter((r: Any) => r?.ok).map((r: Any) => String(r.id)));
    if (nC5 !== 1 || lids.size !== 1) p.push(`ประตูเดิม C5: OPEN ${nC5} แถว · id ${lids.size} (advisory lock ยังไม่ครอบ)`);
    SID.C5 = [...lids][0] ?? "";
    chk("T2", NT("registerOpenTable") === "" && p.length === 0, "10 พร้อมกัน = 1 session (ทางใหม่ + ประตูเดิม)", FX(NT("registerOpenTable") + (P8(p) || "ครบ")));
  });
  await step("T3", async () => {
    const p: string[] = [];
    const c0 = Number(await P.tableSession.count({ where: { tenantId: { in: [T, T2] } } }).catch(() => -1));
    const cases: [string, Any, string, Any][] = [
      ["open โต๊ะร้าน T2", ctxA(), "registerOpenTable", { tableId: TB.X1 }],
      ["open A2 จาก ctx สาขา B", ctxB(), "registerOpenTable", { tableId: TB.A2 }],
      ["open id มั่ว", ctxA(), "registerOpenTable", { tableId: `nope${RAND}` }],
      ["clear โต๊ะร้าน T2", ctxA(), "registerClearTable", { tableId: TB.X1 }],
      ["clear A2 จาก ctx สาขา B", ctxB(), "registerClearTable", { tableId: TB.A2 }],
    ];
    for (const [lbl, ctx, fn, input] of cases) {
      const r = await tbl(fn, ctx, A("OWNER"), input);
      if (!refused(r, "TABLE_NOT_FOUND")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const fb = await floor(ctxB());
    if (fb?.ok !== true || !Array.isArray(fb.tables) || fb.tables.length !== 0) p.push(`registerTables สาขา B → ${codeOf(fb)} ${Array.isArray(fb?.tables) ? fb.tables.length : "-"} โต๊ะ`);
    const c1 = Number(await P.tableSession.count({ where: { tenantId: { in: [T, T2] } } }).catch(() => -1));
    if (c1 !== c0) p.push(`session ${c0} → ${c1}`);
    chk("T3", p.length === 0, "TABLE_NOT_FOUND ×5 · สาขา B ไม่มีโต๊ะ · ไม่เขียน", FX(P8(p) || "ครบ"));
  });
  await step("T4", async () => {
    const p: string[] = [];
    const r = await tbl("registerOpenTable", ctxA(), A("OWNER"), { tableId: TB.A3 });
    if (!refused(r, "TABLE_INACTIVE")) p.push(`A3 → ${codeOf(r)}`);
    const l = await rtable.openSession(T, U.A, TB.A3, {});
    if (l?.ok !== false) p.push(`(ตัวควบคุม) ประตูเดิมเปิด A3 ได้ ${short(l, 60)}`);
    if ((await openSessCount(TB.A3!)) !== 0) p.push("A3 มี session");
    chk("T4", p.length === 0, "INACTIVE = TABLE_INACTIVE · ไม่มี session", FX(P8(p) || "ครบ"));
  });
  await step("T5", async () => {
    const p: string[] = [];
    for (const k of ["STAFF0", "STAFFR"]) {
      const r = await tbl("registerOpenTable", ctxA(), A(k), { tableId: TB.A2 });
      if (!refused(r, "PERMISSION_DENIED")) p.push(`${k} เปิดโต๊ะ → ${codeOf(r)}`);
    }
    const fr = await floor(ctxA(), "STAFFR");
    if (fr?.ok !== true) p.push(`STAFFR (pos.sale.read) registerTables → ${codeOf(fr)}`);
    const fn = await floor(ctxA(), "NOPERM");
    if (!refused(fn, "PERMISSION_DENIED")) p.push(`NOPERM registerTables → ${codeOf(fn)}`);
    if ((await openSessCount(TB.A2!)) !== 0) p.push("A2 มี session");
    chk("T5", p.length === 0, "สิทธิ์ restaurant.session.open · pos.sale.read อ่านผังได้", FX(P8(p) || "ครบ"));
  });

  // ════════ D รอบร่าง/ส่งรอบ ════════
  console.log("\n── D รอบร่าง/ส่งรอบ ──");
  const DRAFT: Record<string, string> = {};
  const D3LINES = (): Any[] => [{ ...ml("tomyum", 2, "spicy", "shrimp"), note: "ไม่ใส่ผักชี" }, ml("water", 2)];
  await step("D1", async () => {
    const p: string[] = [];
    const h1 = await hold(SID.A1!, [ml("tomyum", 1, "spicy")]);
    if (h1?.ok !== true) p.push(`พักครั้งแรก → ${codeOf(h1)} ${short(h1?.message ?? "", 60)}`);
    const id1 = String(h1?.heldCart?.id ?? "");
    const r1 = await heldRows(SID.A1!);
    if (r1.length !== 1 || r1[0]?.id !== id1 || r1[0]?.status !== "HELD" || r1[0]?.version !== 1) p.push(`หลังพักครั้งแรก แถวผูกโต๊ะ ${short(r1.map((r) => [r.id === id1 ? "id1" : r.id, r.status, r.version]), 100)}`);
    const h2 = await hold(SID.A1!, D3LINES(), "OWNER", {}, ctxA(DEV1), { heldCartId: id1, expectedVersion: Number(h1?.draftVersion ?? r1[0]?.version ?? 1) }); // ORACLE-EDIT fix 3 (N1)
    const id2 = String(h2?.heldCart?.id ?? "");
    if (h2?.ok !== true || id2 !== id1) p.push(`พักซ้ำ → ${codeOf(h2)} id ${id2 === id1 ? "เดิม" : "ใหม่"}`);
    const r2 = await heldRows(SID.A1!);
    if (r2.length !== 1 || r2[0]?.version !== 2 || r2[0]?.lineCount !== 2 || r2[0]?.status !== "HELD") p.push(`หลังพักซ้ำ ${short(r2.map((r) => [r.status, r.version, r.lineCount]), 100)} (คาด 1 แถว HELD v2 2 บรรทัด)`);
    DRAFT.A1 = id2 || id1;
    chk("D1", NCOL() === "" && p.length === 0, "1 แถวต่อโต๊ะ · พักซ้ำ = version+1", FX(NCOL() + (P8(p) || "ครบ")));
  });
  await step("D2", async () => {
    const p: string[] = [];
    const ctl = await call(heldMod, "holdRegisterCart", ctxA(DEV1), A("OWNER"), { cart: { lines: [ml("water", 1)] }, label: `ปกติ ${RAND}` });
    const ctlId = String(ctl?.heldCart?.id ?? "");
    const lst = await call(heldMod, "listHeldCarts", ctxA(DEV1), A("OWNER"));
    const ids = ((lst?.items ?? []) as Any[]).map((x) => x.id);
    if (!ctlId || !ids.includes(ctlId)) p.push(`(ตัวควบคุม) บิลพักปกติไม่ขึ้น ${codeOf(lst)}`);
    if (DRAFT.A1 && ids.includes(DRAFT.A1)) p.push("รอบร่างขึ้นใน listHeldCarts");
    if (ctlId) await call(heldMod, "discardHeldCart", ctxA(DEV1), A("OWNER"), { id: ctlId });
    const v0 = (await heldRow(DRAFT.A1 ?? ""))?.version;
    const n0 = Number(await P.posHeldCart.count({ where: { tenantId: T } }).catch(() => -1));
    const custom = { name: `ค่าบริการพิเศษ ${RAND}`, qty: 1, unitPriceSatang: 100 };
    const cases: [string, () => Promise<Any>, string][] = [
      ["couponCode", () => hold(SID.A1!, [ml("water", 1)], "OWNER", { couponCode: "QC24" }), "VALIDATION"],
      ["billDiscount", () => hold(SID.A1!, [ml("water", 1)], "OWNER", { billDiscount: { type: "AMOUNT", value: 100 } }), "VALIDATION"],
      ["session ร้าน T2", () => hold(SX, [custom]), "TABLE_NOT_FOUND"],
      ["ctx สาขา B", () => hold(SID.A1!, [custom], "OWNER", {}, ctxB()), "TABLE_NOT_FOUND"],
    ];
    // session ที่ปิดแล้ว (ประตูเดิม: เปิด C7 แล้วปิดว่าง = CANCELLED)
    const c7 = await rtable.openSession(T, U.A, TB.C7, { guestCount: 1 });
    if (c7?.ok) {
      await rtable.closeSession(T, U.A, c7.id);
      cases.push(["session ปิดแล้ว", () => hold(String(c7.id), [ml("water", 1)]), "TABLE_SESSION_CLOSED"]);
    } else p.push("(fixture) เปิด C7 ไม่ได้");
    for (const [lbl, f, want] of cases) {
      const r = await f();
      if (!refused(r, want)) p.push(`${lbl} → ${codeOf(r)} (คาด ${want})`);
    }
    const n1 = Number(await P.posHeldCart.count({ where: { tenantId: T } }).catch(() => -1));
    if (n1 !== n0) p.push(`PosHeldCart ${n0} → ${n1} (คำขอที่ถูกปฏิเสธเขียนแถว)`);
    if ((await heldRow(DRAFT.A1 ?? ""))?.version !== v0) p.push("รอบร่าง A1 ถูกแตะ");
    chk("D2", NCOL() === "" && p.length === 0, "ซ่อนจากลิ้นชัก · VALIDATION ×2 · TABLE_NOT_FOUND ×2 · TABLE_SESSION_CLOSED", FX(NCOL() + (P8(p) || "ครบ")));
  });
  let D3_WATER_ITEM: Any = null;
  await step("D3", async () => {
    const p: string[] = [];
    const r = await send(SID.A1!, DRAFT.A1 ?? "", "STAFF");
    if (r?.ok !== true) p.push(`send → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      const ord = await P.restaurantOrder.findUnique({ where: { id: String(r.orderId) } }).catch(() => null);
      if (!ord || ord.type !== "DINE_IN" || ord.status !== "CONFIRMED" || ord.sessionId !== SID.A1 || ord.placedByUserId !== uid("STAFF")) p.push(`ออเดอร์ ${short(ord && { t: ord.type, s: ord.status, sess: ord.sessionId === SID.A1, by: ord.placedByUserId === uid("STAFF") }, 100)}`);
      const its = (await P.restaurantOrderItem.findMany({ where: { orderId: String(r.orderId) }, include: { options: true } }).catch(() => [])) as Any[];
      if (!Array.isArray(r.itemIds) || setStr(r.itemIds) !== setStr(its.map((x) => x.id))) p.push(`itemIds ${short(r.itemIds, 80)} ≠ รายการจริง ${its.length}`);
      const ty = its.find((x) => x.productId === PP.tomyum);
      const wa = its.find((x) => x.productId === PP.water);
      D3_WATER_ITEM = wa ?? null;
      if (!ty) p.push(`ไม่มีรายการต้มยำที่มี productId (${short(its.map((x) => [x.nameSnapshot, x.productId]), 120)})`);
      else {
        const got = [ty.menuItemId === MI.tomyum, ty.unitPrice, ty.optionsTotal, ty.qty, ty.lineTotal, ty.note, ty.kdsStatus, ty.stationId === ST.y, ty.saleId];
        if (short(got) !== short([true, 18000, 4000, 2, 44000, "ไม่ใส่ผักชี", "NEW", true, null])) p.push(`ต้มยำ [menuItem,unit,opts,qty,line,note,kds,station,sale] ${short(got, 120)}`);
        const ops = (ty.options as Any[]).map((o) => `${o.choiceId === CH.shrimp ? "shrimp" : o.choiceId === CH.spicy ? "spicy" : o.choiceId}:${o.priceDelta}`).sort().join(",");
        if (ops !== "shrimp:4000,spicy:0") p.push(`ตัวเลือก ${ops || "ไม่มี"}`);
      }
      if (!wa) p.push("ไม่มีรายการน้ำ");
      else if (short([wa.menuItemId, wa.unitPrice, wa.optionsTotal, wa.qty, wa.lineTotal, wa.kdsStatus]) !== short([null, 1000, 0, 2, 2000, "NEW"])) p.push(`น้ำ ${short([wa.menuItemId, wa.unitPrice, wa.optionsTotal, wa.qty, wa.lineTotal, wa.kdsStatus], 100)}`);
    }
    const dr = await heldRow(DRAFT.A1 ?? "");
    if (dr?.status !== "RECALLED") p.push(`รอบร่าง ${dr?.status ?? "ไม่พบ"} (คาด RECALLED)`);
    chk("D3", NT("registerSendTableRound") === "" && p.length === 0, "ออเดอร์ + รายการ productId + ตัวเลือก + ราคาแช่แข็ง + RECALLED", FX(NT("registerSendTableRound") + (P8(p) || "ครบ")));
  });
  await step("D4", async () => {
    const p: string[] = [];
    const h = await hold(SID.A1!, [ml("rice", 1)]);
    const hid = String(h?.heldCart?.id ?? "");
    if (!hid) p.push(`พัก → ${codeOf(h)}`);
    const o0 = Number(await P.restaurantOrder.count({ where: { tenantId: T, sessionId: SID.A1 } }).catch(() => -1));
    const rs = await Promise.all([send(SID.A1!, hid, "STAFF"), send(SID.A1!, hid, "OWNER")]);
    const okN = rs.filter((r) => r?.ok === true).length;
    const ar = rs.filter((r) => refused(r, "ALREADY_RECALLED")).length;
    if (okN !== 1 || ar !== 1) p.push(`ok ${okN} · ALREADY_RECALLED ${ar} (${rs.map(codeOf).join(",")})`);
    const o1 = Number(await P.restaurantOrder.count({ where: { tenantId: T, sessionId: SID.A1 } }).catch(() => -1));
    if (o1 !== o0 + 1) p.push(`ออเดอร์ ${o0} → ${o1} (คาด +1)`);
    const again = await send(SID.A1!, hid, "OWNER");
    if (!refused(again, "ALREADY_RECALLED")) p.push(`ส่งซ้ำ → ${codeOf(again)}`);
    if (Number(await P.restaurantOrder.count({ where: { tenantId: T, sessionId: SID.A1 } }).catch(() => -1)) !== o1) p.push("ส่งซ้ำแล้วออเดอร์เพิ่ม");
    chk("D4", NT("registerSendTableRound") === "" && p.length === 0, "ผู้ชนะคนเดียว · ส่งซ้ำ ALREADY_RECALLED", FX(NT("registerSendTableRound") + (P8(p) || "ครบ")));
  });
  await step("D5", async () => {
    const p: string[] = [];
    await openT("C6");
    const h = await hold(SID.C6 ?? "", [ml("water", 1), ml("stock", 3)]);
    const hid = String(h?.heldCart?.id ?? "");
    if (!hid) p.push(`พัก → ${codeOf(h)} ${short(h?.message ?? "", 60)}`);
    const o0 = Number(await P.restaurantOrder.count({ where: { tenantId: T } }).catch(() => -1));
    const i0 = Number(await P.restaurantOrderItem.count({ where: { tenantId: T } }).catch(() => -1));
    const r = await send(SID.C6 ?? "", hid);
    if (!refused(r, "PRODUCT_UNAVAILABLE") || r?.lineIndex !== 1) p.push(`send → ${codeOf(r)} lineIndex ${short(r?.lineIndex)} (คาด PRODUCT_UNAVAILABLE 1)`);
    if (Number(await P.restaurantOrder.count({ where: { tenantId: T } }).catch(() => -1)) !== o0 || Number(await P.restaurantOrderItem.count({ where: { tenantId: T } }).catch(() => -1)) !== i0) p.push("มีออเดอร์/รายการใหม่");
    const st = (await P.menuItem.findUnique({ where: { id: MI.stock }, select: { stockQty: true } }).catch(() => null))?.stockQty;
    if (st !== 2) p.push(`stockQty ${st} (คาด 2)`);
    const dr = await heldRow(hid);
    if (hid && dr?.status !== "HELD") p.push(`รอบร่าง ${dr?.status} (คาด HELD)`);
    chk("D5", NT("registerSendTableRound") === "" && p.length === 0, "PRODUCT_UNAVAILABLE lineIndex 1 · ไม่เขียน", FX(NT("registerSendTableRound") + (P8(p) || "ครบ")));
  });
  await step("D6", async () => {
    const p: string[] = [];
    if (!D3_WATER_ITEM) p.push("ไม่มีรายการน้ำจาก D3");
    else if (D3_WATER_ITEM.stationId !== ST.first) p.push(`น้ำ stationId ${D3_WATER_ITEM.stationId === ST.y ? "สถานียำ" : D3_WATER_ITEM.stationId} (คาด สถานีแรก "ครัว")`);
    const o = await legacyOrder(SID.C6 || SID.A1 || "", [["rice", 1, []]]);
    const its = o?.ok ? ((await P.restaurantOrderItem.findMany({ where: { orderId: o.id } }).catch(() => [])) as Any[]) : [];
    if (!o?.ok || its.length !== 1 || its[0]?.productId !== PP.rice) p.push(`createOrder เดิม → productId ${short(its.map((x) => x.productId === PP.rice ? "rice" : x.productId), 60)} (คาด posProductId ของเมนู)`);
    chk("D6", p.length === 0, "PRODUCT = สถานีแรก · createOrder เดิมเขียน productId", FX(P8(p) || "ครบ"));
  });

  // ORACLE-ADD ผู้คุม 10 ต.ค. (P2.4 S fix 2 · F1) — โต๊ะ E1 ของข้อนี้เอง
  const mkExtraTable = async (name: string) => {
    const r = must(`table ${name}`, await rtable.createTable(T, U.A, { zoneId: ZN.Z2!.id, name, seats: 4 }));
    TB[name] = r.id;
    QR[name] = r.qrToken;
  };
  await step("D7", async () => {
    const p: string[] = [];
    await mkExtraTable("E1");
    const sid = await openT("E1", { guestCount: 2 });
    const hd = (input: Any, actor = "OWNER") => call(heldMod, "holdRegisterCart", ctxA(DEV1), A(actor), { tableSessionId: sid, ...input });
    const ver = async (id: string) => Number((await heldRow(id))?.version ?? -1);
    const h0 = await hd({ cart: { lines: [ml("water", 1)] }, newDraft: true });
    const id = String(h0?.heldCart?.id ?? "");
    if (h0?.ok !== true || !id) p.push(`newDraft → ${codeOf(h0)} ${short(h0?.message ?? "", 60)}`);
    const v1 = await ver(id);
    // ทีละคำขอ: A ได้ · B (เวอร์ชันเดิม) ถูกปฏิเสธ · บรรทัดของ A อยู่ครบ
    const a = await hd({ cart: { lines: [ml("water", 1), ml("rice", 1)] }, heldCartId: id, expectedVersion: v1 });
    const b = await hd({ cart: { lines: [ml("water", 1), ml("tomyum", 1, "spicy")] }, heldCartId: id, expectedVersion: v1 });
    const rowAB = await heldRow(id);
    const cartAB = JSON.stringify((rowAB?.cartJson as Any)?.cart ?? null);
    if (a?.ok !== true || !refused(b, "VERSION_CHANGED") || rowAB?.version !== v1 + 1 || rowAB?.lineCount !== 2 || !cartAB.includes(PP.rice ?? "none") || cartAB.includes(PP.tomyum ?? "none"))
      p.push(`ทีละคำขอ A ${codeOf(a)} · B ${codeOf(b)} · แถว v${rowAB?.version} ${rowAB?.lineCount} บรรทัด ข้าว ${cartAB.includes(PP.rice ?? "none")} ต้มยำ ${cartAB.includes(PP.tomyum ?? "none")}`);
    // พร้อมกัน: เวอร์ชันเดียวกันสองคำขอ → ผ่าน 1
    const v2 = await ver(id);
    const par = await Promise.all([
      hd({ cart: { lines: [ml("water", 2)] }, heldCartId: id, expectedVersion: v2 }),
      hd({ cart: { lines: [ml("water", 3)] }, heldCartId: id, expectedVersion: v2 }, "STAFF"),
    ]);
    const okN = par.filter((r) => r?.ok === true).length;
    const vcN = par.filter((r) => refused(r, "VERSION_CHANGED")).length;
    if (okN !== 1 || vcN !== 1 || (await ver(id)) !== v2 + 1) p.push(`พร้อมกัน ${par.map(codeOf).join(",")} · v${await ver(id)} (คาด ${v2 + 1})`);
    // newDraft ขณะมี HELD
    // ORACLE-EDIT ผู้คุม 10 ต.ค. (P2.4 S fix 3 · N2): heldCartId ต้องมาคู่ expectedVersion — ไม่มี = VALIDATION ไม่แตะร่าง
    const vNo = await ver(id);
    const noVer = await hd({ cart: { lines: [ml("water", 5)] }, heldCartId: id });
    if (!refused(noVer, "VALIDATION") || (await ver(id)) !== vNo) p.push(`heldCartId ไม่มี expectedVersion → ${codeOf(noVer)} · v${vNo}→${await ver(id)}`);
    const nd = await hd({ cart: { lines: [ml("water", 1)] }, newDraft: true });
    if (!refused(nd, "VERSION_CHANGED")) p.push(`newDraft ขณะมี HELD → ${codeOf(nd)}`);
    // ส่งครัวแล้วพักทับ → ปฏิเสธ · ไม่มีรอบร่างใหม่
    const sent = await send(sid, id, "OWNER");
    if (sent?.ok !== true) p.push(`ส่งครัว → ${codeOf(sent)}`);
    const late = await hd({ cart: { lines: [ml("water", 1)] }, heldCartId: id, expectedVersion: await ver(id) });
    const held = (await heldRows(sid)).filter((r) => r.status === "HELD");
    if (!refused(late, "VERSION_CHANGED") || held.length !== 0) p.push(`พักหลังส่ง → ${codeOf(late)} · HELD ${held.length}`);
    // ORACLE-EDIT ผู้คุม 10 ต.ค. (P2.4 S fix 3 · N1): พักแบบไม่ระบุร่างหลังส่ง (กรณี R1 (b)) = VALIDATION · ไม่มีร่าง HELD ใหม่
    const bare = await hd({ cart: { lines: [ml("water", 1)] } });
    const heldBare = (await heldRows(sid)).filter((r) => r.status === "HELD");
    if (!refused(bare, "VALIDATION") || heldBare.length !== 0) p.push(`พักไม่ระบุร่างหลังส่ง → ${codeOf(bare)} · HELD ${heldBare.length}`);
    const fresh = await hd({ cart: { lines: [ml("water", 1)] }, newDraft: true });
    if (fresh?.ok !== true || String(fresh?.heldCart?.id ?? "") === id) p.push(`newDraft หลังส่ง → ${codeOf(fresh)}`);
    chk("D7", p.length === 0, "รอบร่างไม่ทับกัน · ส่งแล้วไม่เกิดร่างซ้ำ", FX(P8(p) || "ครบ"));
  });

  // ─── fixture A4 (ขอเช็คบิล) · A5 (ทานอยู่ · จ่ายบางส่วน · สมาชิก · ร่าง · พร้อมเสิร์ฟ · เรียกพนักงาน) ───
  let fxA = "";
  try {
    const a4 = await rtable.openSession(T, U.A, TB.A4, { guestCount: 2, openedByUserId: uid("OWNER") });
    SID.A4 = String(a4?.id ?? "");
    await legacyOrder(SID.A4, [["rice", 1, []]]);
    await rorder.createServiceRequest(T, U.A, SID.A4, "REQUEST_BILL");
    const a5 = await rtable.openSession(T, U.A, TB.A5, { guestCount: 3, openedByUserId: uid("OWNER") });
    SID.A5 = String(a5?.id ?? "");
    await legacyOrder(SID.A5, [["tomyum", 1, ["shrimp"]], ["rice", 2, []]]);
    const its = await itemsOf(SID.A5);
    const rice = its.find((x) => x.menuItemId === MI.rice);
    const ty = its.find((x) => x.menuItemId === MI.tomyum);
    const co = await rorder.checkout({ tenantId: T, unitId: U.A, sessionId: SID.A5, itemIds: [rice?.id], payMethod: "CASH" });
    if (!co?.ok) throw new Error(`checkout บางส่วน: ${short(co, 80)}`);
    SALE.A5 = String(co.saleId);
    // ผูกสมาชิกหลังเช็คบิลบางส่วน — checkout เดิมพร้อมสมาชิกที่มีส่วนลดระดับ = PAYMENT_MISMATCH (drift ของประตูเดิม · โน้ต)
    if (MEMBER) await rtable.linkMember(T, U.A, SID.A5, MEMBER);
    await kds.advanceItem(T, U.A, ty?.id, "COOKING");
    await kds.advanceItem(T, U.A, ty?.id, "READY");
    await hold(SID.A5, [ml("water", 1), ml("rice", 1)]);
    await rorder.createServiceRequest(T, U.A, SID.A5, "CALL_STAFF");
  } catch (e) {
    fxA = `A4/A5:${(e as Error).message.slice(0, 120)}`;
    console.log(`  ⚠️  ${fxA}`);
  }

  // ════════ B quote บิลโต๊ะ ════════
  console.log("\n── B quote บิลโต๊ะ ──");
  await step("B1", async () => {
    const p: string[] = [];
    const q1 = await tq(SID.A1!);
    const unpaid = (await itemsOf(SID.A1!)).filter((x) => !x.saleId && x.kdsStatus !== "CANCELLED");
    if (q1?.ok !== true) p.push(`quote → ${codeOf(q1)} ${short(q1?.message ?? "", 60)}`);
    else {
      const t = q1.table;
      if (!isRecord(t) || t.sessionId !== SID.A1 || t.tableName !== "A1" || !Array.isArray(t.itemIds) || typeof t.itemsHash !== "string" || !t.itemsHash) p.push(`table ${short(t, 120)}`);
      else if (setStr(t.itemIds) !== setStr(unpaid.map((x) => x.id))) p.push(`itemIds ${t.itemIds.length} ≠ รายการค้างจ่าย ${unpaid.length}`);
      const lines = (q1.lines ?? []) as Any[];
      if (lines.length !== unpaid.length) p.push(`บรรทัด ${lines.length} (คาด ${unpaid.length})`);
      const ty = lines.find((l) => l.productId === PP.tomyum);
      if (!ty || ty.unitPriceSatang !== 22000 || ty.grossSatang !== 44000 || setStr(((ty.options ?? []) as Any[]).map((o) => o.choiceId)) !== setStr([CH.spicy, CH.shrimp]))
        p.push(`ต้มยำ ${short(ty && { u: ty.unitPriceSatang, g: ty.grossSatang, o: (ty.options ?? []).length }, 80)}`);
      const wa = lines.find((l) => l.productId === PP.water);
      if (!wa || wa.unitPriceSatang !== 1000 || wa.grossSatang !== 2000) p.push(`น้ำ ${short(wa && { u: wa.unitPriceSatang, g: wa.grossSatang }, 60)}`);
      if (!lines.some((l) => l.productId === PP.rice && l.unitPriceSatang === 1805)) p.push("ไม่มีบรรทัดข้าว ฿18.05");
      // ราคาเปลี่ยนหลังส่ง
      await menu.updateItem(T, U.A, MI.tomyum, { basePrice: 20000 }, uid("OWNER"));
      const pr = (await P.posProduct.findUnique({ where: { id: PP.tomyum }, select: { basePriceSatang: true } }).catch(() => null))?.basePriceSatang;
      if (pr !== 20000) p.push(`(ตัวควบคุม) ราคาแคตตาล็อกหลังแก้ ${pr}`);
      const q2 = await tq(SID.A1!);
      const ty2 = ((q2?.lines ?? []) as Any[]).find((l) => l.productId === PP.tomyum);
      if (q2?.ok !== true || ty2?.unitPriceSatang !== 22000 || q2.grandTotalSatang !== q1.grandTotalSatang) p.push(`หลังเปลี่ยนราคา ต้มยำ ${ty2?.unitPriceSatang} ยอด ${q2?.grandTotalSatang} (คาด 22000 · ${q1.grandTotalSatang})`);
      await menu.updateItem(T, U.A, MI.tomyum, { basePrice: 18000 }, uid("OWNER"));
    }
    chk("B1", p.length === 0, "บรรทัดจากรายการ · ราคาแช่แข็ง · table {…}", FX(P8(p) || "ครบ"));
  });
  await step("B2", async () => {
    const p: string[] = [];
    const cases: [string, () => Promise<Any>, string][] = [
      ["lines ไม่ว่าง", () => tq(SID.A1!, { lines: [ml("water", 1)] }), "VALIDATION"],
      ["session ร้าน T2", () => tq(SX), "TABLE_NOT_FOUND"],
      ["ctx สาขา B", () => tq(SID.A1!, {}, ctxB()), "TABLE_NOT_FOUND"],
      ["id มั่ว", () => tq(`nope${RAND}`), "TABLE_NOT_FOUND"],
    ];
    for (const [lbl, f, want] of cases) {
      const r = await f();
      if (!refused(r, want)) p.push(`${lbl} → ${codeOf(r)} (คาด ${want})`);
    }
    chk("B2", p.length === 0, "VALIDATION · TABLE_NOT_FOUND ×3", FX(P8(p) || "ครบ"));
  });
  await step("B3", async () => {
    const p: string[] = [];
    if (!MEMBER) p.push("(fixture) ไม่มีสมาชิก");
    await openT("C1", { guestCount: 2, memberId: MEMBER });
    if ((await sessRow(SID.C1 ?? ""))?.memberId !== MEMBER) p.push("session C1 ไม่มี memberId");
    await legacyOrder(SID.C1 ?? "", [["tomyum", 1, ["spicy"]]]);
    const q = await tq(SID.C1 ?? "");
    const eq = await quote(await eqLines(SID.C1 ?? ""), { memberId: MEMBER });
    if (eq?.ok !== true || !(eq.tierDiscountSatang > 0)) p.push(`(ตัวควบคุม) ตะกร้าปกติ + สมาชิก → ${codeOf(eq)} tier ${eq?.tierDiscountSatang}`);
    if (q?.ok !== true) p.push(`quote โต๊ะ → ${codeOf(q)} ${short(q?.message ?? "", 60)}`);
    else if (!(q.tierDiscountSatang > 0) || q.tierDiscountSatang !== eq?.tierDiscountSatang || q.grandTotalSatang !== eq?.grandTotalSatang || q.memberDiscountSatang !== eq?.memberDiscountSatang)
      p.push(`tier ${q.tierDiscountSatang}/${eq?.tierDiscountSatang} · ยอด ${q.grandTotalSatang}/${eq?.grandTotalSatang}`);
    chk("B3", p.length === 0, "สมาชิกจาก session = ส่วนลดระดับเท่าตะกร้าปกติ", FX(P8(p) || "ครบ"));
  });
  await step("B4", async () => {
    const p: string[] = [];
    await openT("C2", { guestCount: 2 });
    await legacyOrder(SID.C2 ?? "", [["tomyum", 1, ["spicy"]], ["rice", 1, []]]);
    const q = await tq(SID.C2 ?? "");
    const eq = await quote(await eqLines(SID.C2 ?? ""));
    const want = halfUp(19805 * 1000, 10_000);
    if (eq?.ok !== true || eq.serviceChargeSatang !== want) p.push(`(ตัวควบคุม) ตะกร้าปกติ ค่าบริการ ${eq?.serviceChargeSatang} (คาด ${want})`);
    if (q?.ok !== true) p.push(`quote โต๊ะ → ${codeOf(q)} ${short(q?.message ?? "", 60)}`);
    else {
      if (q.serviceChargeSatang !== want || q.grandTotalSatang !== eq?.grandTotalSatang || q.vatSatang !== eq?.vatSatang || q.subtotalSatang !== 19805) p.push(`ค่าบริการ ${q.serviceChargeSatang} ยอด ${q.grandTotalSatang}/${eq?.grandTotalSatang} VAT ${q.vatSatang}/${eq?.vatSatang} subtotal ${q.subtotalSatang}`);
      if (q.channel?.code !== "STORE") p.push(`ช่องทาง ${short(q.channel?.code ?? q.channel, 30)} (คาด STORE)`);
    }
    const bp = await rorder.billPreview(T, U.A, SID.C2 ?? "");
    if (bp?.serviceChargeSatang !== 1980) p.push(`(ตัวควบคุม) billPreview เดิม ${bp?.serviceChargeSatang} (คาด floor 1980)`);
    // แขกเปิดโต๊ะผ่าน QR → QR_TABLE
    const g = await storefront.resolveTableSession(T, U.A, QR.C3);
    SID.C3 = String(g?.sessionId ?? "");
    if ((await sessRow(SID.C3))?.openedByUserId !== null) p.push("(fixture) session QR มี openedByUserId");
    await legacyOrder(SID.C3, [["rice", 1, []]]);
    const qq = await tq(SID.C3);
    if (qq?.ok !== true || qq.channel?.code !== "QR_TABLE" || qq.serviceChargeSatang !== halfUp(1805 * 1000, 10_000)) p.push(`QR → ${codeOf(qq)} ช่องทาง ${short(qq?.channel?.code, 20)} ค่าบริการ ${qq?.serviceChargeSatang} (คาด QR_TABLE 181)`);
    chk("B4", p.length === 0, "ค่าบริการ POS ปัดครึ่งขึ้น 1981 · STORE · QR_TABLE 181", FX(P8(p) || "ครบ"));
  });
  await step("B5", async () => {
    const p: string[] = [];
    await openT("C4", { guestCount: 1 });
    const r1 = await tq(SID.C4 ?? "");
    if (!refused(r1, "TABLE_EMPTY")) p.push(`ว่าง → ${codeOf(r1)}`);
    const o = await legacyOrder(SID.C4 ?? "", [["rice", 1, []]]);
    const it = o?.ok ? ((await P.restaurantOrderItem.findFirst({ where: { orderId: o.id } }).catch(() => null)) as Any) : null;
    const c = it ? await rorder.cancelOrderItem(T, U.A, it.id, "สั่งผิด", uid("OWNER")) : null;
    if (!c?.ok) p.push(`(fixture) ยกเลิกรายการ ${short(c, 60)}`);
    const r2 = await tq(SID.C4 ?? "");
    if (!refused(r2, "TABLE_EMPTY")) p.push(`มีแต่รายการยกเลิก → ${codeOf(r2)}`);
    chk("B5", p.length === 0, "TABLE_EMPTY ×2", FX(P8(p) || "ครบ"));
  });
  await step("B6", async () => {
    const p: string[] = [];
    const q1 = await tq(SID.A1!);
    const q1b = await tq(SID.A1!);
    if (q1?.ok !== true || q1b?.ok !== true) p.push(`quote → ${codeOf(q1)}`);
    else if (q1.table?.itemsHash !== q1b.table?.itemsHash) p.push("hash ไม่คงที่");
    const h = await hold(SID.A1!, [ml("water", 1)]);
    const q2 = await tq(SID.A1!);
    if (q2?.ok === true && (q2.table?.itemsHash !== q1?.table?.itemsHash || (q2.lines ?? []).length !== (q1?.lines ?? []).length)) p.push("รอบร่างที่ยังไม่ส่งถูกคิดเงิน (hash/บรรทัดเปลี่ยน)");
    const s = await send(SID.A1!, String(h?.heldCart?.id ?? ""));
    if (s?.ok !== true) p.push(`ส่งรอบใหม่ → ${codeOf(s)}`);
    const q3 = await tq(SID.A1!);
    if (q3?.ok === true && q1?.ok === true) {
      if (q3.table?.itemsHash === q1.table?.itemsHash) p.push("ส่งรอบใหม่แล้ว hash เดิม");
      if ((q3.table?.itemIds ?? []).length !== (q1.table?.itemIds ?? []).length + 1) p.push(`itemIds ${(q1.table?.itemIds ?? []).length} → ${(q3.table?.itemIds ?? []).length} (คาด +1)`);
    } else if (q1?.ok === true) p.push(`quote หลังส่ง → ${codeOf(q3)}`);
    if (q3?.ok === true) {
      const hh = callSync(sharedMod, "tableItemsHash", q3.table?.itemIds ?? []);
      if (hh !== q3.table?.itemsHash) p.push(`itemsHash ≠ tableItemsHash(itemIds) (${short(hh, 20)})`);
    }
    chk("B6", p.length === 0, "hash คงที่ · ร่างไม่คิดเงิน · รอบใหม่เปลี่ยน hash", FX(P8(p) || "ครบ"));
  });

  // ════════ P ชำระ ════════
  console.log("\n── P ชำระ ──");
  let P1: { q: Any; r: Any; key: string; sale: Any; xb: Any[]; water0: number } | null = null;
  await step("P1", async () => {
    const p: string[] = [];
    const q = await tq(SID.A1!);
    const xb = [await xOf(DEV1, SHIFT["1"] ?? ""), await xOf(DEV2, SHIFT["2"] ?? "")];
    const water0 = Number((await P.invItem.findUnique({ where: { id: INV.water }, select: { onHand: true } }).catch(() => null))?.onHand ?? NaN);
    const unpaid = (await itemsOf(SID.A1!)).filter((x) => !x.saleId && x.kdsStatus !== "CANCELLED");
    const sub = sum(unpaid.map((x) => x.lineTotal));
    const { r, key } = await tpay(SID.A1!, q, { ctx: ctxA(DEV2) });
    const saleId = r?.ok === true ? String(r.saleId) : "";
    SALE.A1 = saleId;
    const sale = saleId ? await P.posSale.findUnique({ where: { id: saleId }, include: { lines: { include: { options: true } } } }).catch(() => null) : null;
    P1 = { q, r, key, sale, xb, water0 };
    if (!sale) p.push(`submit → ${codeOf(r)} ${short(r?.message ?? "", 80)} (quote ${codeOf(q)})`);
    else {
      const head = [sale.sourceModule, sale.sourceId === SID.A1, sale.channelCode, sale.shiftId === SHIFT["2"], sale.status, sale.grandTotalSatang === q.grandTotalSatang, sale.serviceChargeSatang];
      if (short(head) !== short(["POS", true, "STORE", true, "PAID", true, halfUp(sub * 1000, 10_000)])) p.push(`บิล [module,sourceId,channel,shift2,status,ยอด=quote,ค่าบริการ] ${short(head, 120)} (sub ${sub})`);
      const ls = sale.lines as Any[];
      if (ls.length !== unpaid.length) p.push(`บรรทัดบิล ${ls.length} (คาด ${unpaid.length})`);
      const ty = ls.find((l) => l.productId === PP.tomyum);
      if (!ty || ty.qty !== 2 || ty.unitPriceSatang !== 22000 || setStr(((ty.options ?? []) as Any[]).map((o) => o.choiceId)) !== setStr([CH.spicy, CH.shrimp])) p.push(`บรรทัดต้มยำ ${short(ty && [ty.qty, ty.unitPriceSatang, (ty.options ?? []).length], 60)}`);
      const wl = ls.filter((l) => l.productId === PP.water);
      if (wl.length !== 2 || wl.some((l) => l.itemId !== INV.water)) p.push(`บรรทัดน้ำ ${wl.length} itemId ${short(wl.map((l) => l.itemId === INV.water), 30)}`);
    }
    const after = await itemsOf(SID.A1!);
    const linked = after.filter((x) => unpaid.some((u) => u.id === x.id) && x.saleId === saleId && saleId && x.settledAt);
    if (linked.length !== unpaid.length) p.push(`รายการผูกบิล ${linked.length}/${unpaid.length}`);
    const s = await sessRow(SID.A1!);
    if (s?.status !== "CLOSED") p.push(`session ${s?.status} (คาด CLOSED)`);
    const t = await tableRow(TB.A1!);
    if (!(t?.dirtySince instanceof Date) || t.dirtySince.getTime() < RUN_START - MIN) p.push(`dirtySince ${short(t?.dirtySince ?? "ไม่มีคอลัมน์", 40)}`);
    if (saleId && unpaid.length) {
      const xi = (await P.$queryRawUnsafe(`SELECT DISTINCT xmin::text AS x FROM "RestaurantOrderItem" WHERE id = ANY($1::text[])`, unpaid.map((x) => x.id)).catch(() => [])) as Any[];
      const xs = (await P.$queryRawUnsafe(`SELECT xmin::text AS x FROM "TableSession" WHERE id = $1`, SID.A1).catch(() => [])) as Any[];
      const xl = (await P.$queryRawUnsafe(`SELECT DISTINCT xmin::text AS x FROM "PosSaleLine" WHERE "saleId" = $1`, saleId).catch(() => [])) as Any[];
      if (xi.length !== 1 || xs[0]?.x !== xi[0]?.x || xl.length !== 1 || xl[0]?.x !== xi[0]?.x) p.push(`xmin รายการ ${xi.map((r: Any) => r.x).join("/")} · session ${xs[0]?.x} · บรรทัดบิล ${xl.map((r: Any) => r.x).join("/")} (คาดค่าเดียว)`);
    }
    chk("P1", NCOL() === "" && p.length === 0, "บิล POS ของโต๊ะ · ยึดรายการ + ปิดโต๊ะ + ต้องเก็บ ในธุรกรรมเดียว", FX(NCOL() + (P8(p) || "ครบ")));
  });
  await step("P2", async () => {
    const p: string[] = [];
    if (!P1?.sale) p.push("ไม่มีบิล P1");
    const r2 = await tpay(SID.A1!, P1?.q, { key: P1?.key, ctx: ctxA(DEV2) });
    if (r2.r?.ok !== true || String(r2.r.saleId) !== SALE.A1 || r2.r.duplicated !== true) p.push(`คีย์เดิม → ${codeOf(r2.r)} ${short({ same: String(r2.r?.saleId) === SALE.A1, dup: r2.r?.duplicated }, 60)}`);
    const n0 = Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1));
    const r3 = await tpay(SID.A1!, P1?.q, { ctx: ctxA(DEV2) });
    if (r3.r?.ok !== false || !["TABLE_EMPTY", "TABLE_SESSION_CLOSED", "TABLE_ITEMS_CHANGED"].includes(String(r3.r?.code))) p.push(`คีย์ใหม่หลังจ่าย → ${codeOf(r3.r)}`);
    if (Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1)) !== n0) p.push("มีบิลเพิ่ม");
    chk("P2", p.length === 0, "เล่นซ้ำ = บิลเดิม · จ่ายซ้ำคีย์ใหม่ = ปฏิเสธ", FX(P8(p) || "ครบ"));
  });
  await step("P5", async () => {
    const p: string[] = [];
    const saleId = SALE.A1 ?? "";
    if (!saleId) p.push("ไม่มีบิล P1");
    else {
      const ls = ((await P.posSaleLine.findMany({ where: { saleId } }).catch(() => [])) as Any[]).filter((l) => l.itemId === INV.water);
      const mv = (await P.invMovement.findMany({ where: { tenantId: T, refId: saleId, type: "OUT" } }).catch(() => [])) as Any[];
      const wantKeys = setStr(ls.map((l) => `pos-consume-${saleId}-${l.id}`));
      if (mv.length !== 2 || setStr(mv.map((m) => m.idempotencyKey)) !== wantKeys || sum(mv.map((m) => m.qtyDelta)) !== -3 || mv.some((m) => m.itemId !== INV.water)) p.push(`OUT ${short(mv.map((m) => [m.qtyDelta, String(m.idempotencyKey).slice(-12)]), 120)}`);
      const oh = Number((await P.invItem.findUnique({ where: { id: INV.water }, select: { onHand: true } }).catch(() => null))?.onHand ?? NaN);
      if (oh - (P1?.water0 ?? NaN) !== -3) p.push(`onHand ${P1?.water0} → ${oh} (คาด −3)`);
    }
    chk("P5", p.length === 0, "น้ำ OUT 2 แถว Σ −3", FX(P8(p) || "ครบ"));
  });
  await step("P7", async () => {
    const p: string[] = [];
    await drain();
    const saleId = SALE.A1 ?? "";
    const sale = saleId ? await P.posSale.findUnique({ where: { id: saleId }, select: { grandTotalSatang: true, vatSatang: true } }).catch(() => null) : null;
    const es = saleId ? ((await P.accountJournalEntry.findMany({ where: { tenantId: T, refType: "PosSale", refId: saleId }, include: { lines: { include: { account: { select: { code: true } } } } } }).catch(() => [])) as Any[]) : [];
    const ls = es.flatMap((e) => e.lines ?? []) as Any[];
    const amt = (code: string, side: "debit" | "credit") => sum(ls.filter((l) => l.account?.code === code).map((l) => l[side]));
    const dr = sum(ls.map((l) => l.debit));
    const cr = sum(ls.map((l) => l.credit));
    if (!sale) p.push("ไม่มีบิล P1");
    else if (!es.length || amt("1000", "debit") !== sale.grandTotalSatang || amt("2200", "credit") !== sale.vatSatang || dr !== cr || cr !== sale.grandTotalSatang || !(amt("4000", "credit") > 0))
      p.push(`JV ${es.length} · Dr1000 ${amt("1000", "debit")} · Cr2200 ${amt("2200", "credit")}/${sale.vatSatang} · Cr4000 ${amt("4000", "credit")} · Σ ${dr}/${cr} · ยอด ${sale.grandTotalSatang}`);
    chk("P7", p.length === 0, "Dr 1000 = ยอด · Cr 2200 = VAT · Σ ดุล", FX(P8(p) || "ครบ"));
  });
  await step("P8", async () => {
    const p: string[] = [];
    const [b1, b2] = P1?.xb ?? [null, null];
    const a1 = await xOf(DEV1, SHIFT["1"] ?? "");
    const a2 = await xOf(DEV2, SHIFT["2"] ?? "");
    const grand = Number(P1?.sale?.grandTotalSatang ?? NaN);
    if (!b1 || !b2 || !a1 || !a2) p.push("xReport อ่านไม่ได้");
    else {
      if (a2.billCount - b2.billCount !== 1 || a2.salesTotalSatang - b2.salesTotalSatang !== grand) p.push(`กะ 2: บิล +${a2.billCount - b2.billCount} ยอด +${a2.salesTotalSatang - b2.salesTotalSatang} (คาด +1 · +${grand})`);
      if (a1.billCount !== b1.billCount || a1.salesTotalSatang !== b1.salesTotalSatang) p.push(`กะ 1 ขยับ บิล ${b1.billCount}→${a1.billCount}`);
    }
    chk("P8", p.length === 0, "บิลอยู่ในกะของเครื่องที่จ่าย", FX(P8(p) || "ครบ"));
  });
  await step("P3", async () => {
    const p: string[] = [];
    await openT("A7", { guestCount: 2 });
    await legacyOrder(SID.A7 ?? "", [["rice", 3, []]]);
    const q1 = await tq(SID.A7 ?? "", {}, ctxA(DEV1));
    const q2 = await tq(SID.A7 ?? "", {}, ctxA(DEV2));
    const t0 = new Date(Date.now() - 1000);
    const cnt = async () => ({
      sale: Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1)),
      pay: Number(await P.posPayment.count({ where: { tenantId: T } }).catch(() => -1)),
      seq: sum(((await P.posReceiptCounter.findMany({ where: { tenantId: T, unitId: U.A } }).catch(() => [])) as Any[]).map((r) => r.seq)),
    });
    const c0 = await cnt();
    const [x1, x2] = await Promise.all([tpay(SID.A7 ?? "", q1, { ctx: ctxA(DEV1) }), tpay(SID.A7 ?? "", q2, { ctx: ctxA(DEV2) })]);
    const rs = [x1.r, x2.r];
    const win = rs.find((r) => r?.ok === true);
    const lost = rs.filter((r) => refused(r, "TABLE_ITEMS_CHANGED")).length;
    if (!win || lost !== 1) p.push(`ผล ${rs.map(codeOf).join(",")} (คาด OK + TABLE_ITEMS_CHANGED)`);
    const c1 = await cnt();
    if (c1.sale - c0.sale !== (win ? 1 : 0) || c1.pay - c0.pay !== (win ? 1 : 0) || c1.seq - c0.seq !== (win ? 1 : 0)) p.push(`Δ PosSale ${c1.sale - c0.sale} · PosPayment ${c1.pay - c0.pay} · เลขใบเสร็จ ${c1.seq - c0.seq}`);
    if (win) {
      SALE.A7 = String(win.saleId);
      const extra = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND "createdAt" >= $2 AND payload::text NOT LIKE $3`, T, t0, `%${win.saleId}%`).catch(() => [{ n: -1 }])) as Any[];
      if (Number(extra[0]?.n) !== 0) p.push(`OutboxEvent ที่ไม่ใช่ของบิลผู้ชนะ ${extra[0]?.n}`);
      const its = await itemsOf(SID.A7 ?? "");
      if (its.some((x) => x.saleId !== win.saleId)) p.push("รายการไม่ได้ผูกบิลผู้ชนะทั้งหมด");
    }
    chk("P3", p.length === 0, "สองเครื่องพร้อมกัน = บิลเดียว · ผู้แพ้ไม่เขียนอะไร", FX(P8(p) || "ครบ"));
  });
  await step("P4", async () => {
    const p: string[] = [];
    await openT("A8", { guestCount: 2 });
    await legacyOrder(SID.A8 ?? "", [["rice", 1, []]]);
    const q = await tq(SID.A8 ?? "");
    await legacyOrder(SID.A8 ?? "", [["rice", 1, []]]);
    const { r, key } = await tpay(SID.A8 ?? "", q, { ctx: ctxA(DEV1) });
    if (!refused(r, "TABLE_ITEMS_CHANGED")) p.push(`submit → ${codeOf(r)} (คาด TABLE_ITEMS_CHANGED)`);
    if (Number(await P.posSale.count({ where: { tenantId: T, idempotencyKey: { endsWith: key } } }).catch(() => -1)) !== 0) p.push("มีบิลของคีย์นี้");
    const its = await itemsOf(SID.A8 ?? "");
    if (its.length !== 2 || its.some((x) => x.saleId)) p.push(`รายการ ${its.length} ผูกบิล ${its.filter((x) => x.saleId).length}`);
    if ((await sessRow(SID.A8 ?? ""))?.status !== "OPEN") p.push("session ไม่ OPEN");
    chk("P4", p.length === 0, "รอบใหม่ระหว่างทาง = TABLE_ITEMS_CHANGED ไม่มีบิล", FX(P8(p) || "ครบ"));
  });
  await step("P6", async () => {
    const p: string[] = [];
    await openT("A9", { guestCount: 2 });
    await legacyOrder(SID.A9 ?? "", [["rice", 1, []]]);
    const h = await hold(SID.A9 ?? "", [ml("water", 1)]);
    const hid = String(h?.heldCart?.id ?? "");
    const q = await tq(SID.A9 ?? "");
    const { r } = await tpay(SID.A9 ?? "", q, { ctx: ctxA(DEV1) });
    if (r?.ok !== true) p.push(`submit → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else SALE.A9 = String(r.saleId);
    if ((await sessRow(SID.A9 ?? ""))?.status !== "OPEN") p.push(`session ${(await sessRow(SID.A9 ?? ""))?.status} (คาด OPEN)`);
    const t = await tableRow(TB.A9!);
    if (t?.dirtySince !== null) p.push(`dirtySince ${short(t?.dirtySince ?? "ไม่มีคอลัมน์", 30)} (คาด null)`);
    if ((await heldRow(hid))?.status !== "HELD") p.push(`รอบร่าง ${(await heldRow(hid))?.status} (คาด HELD)`);
    chk("P6", NCOL() === "" && p.length === 0, "มีร่างค้าง = ยังไม่ปิดโต๊ะ", FX(NCOL() + (P8(p) || "ครบ")));
  });

  // ════════ T1 ผัง (หลังชำระ) · T6 การ์ด A5 ════════
  console.log("\n── T ผัง ──");
  await step("T1", async () => {
    const p: string[] = [];
    const f = await floor();
    if (f?.ok !== true) p.push(`registerTables → ${codeOf(f)} ${short(f?.message ?? "", 60)}`);
    else {
      const zs = (f.zones ?? []) as Any[];
      for (const z of Object.values(ZN)) if (!zs.some((x) => x.id === z.id && x.name === z.name)) p.push(`ไม่มีโซน ${z.name}`);
      const tables = (f.tables ?? []) as Any[];
      const nT = Number(await P.restaurantTable.count({ where: { tenantId: T, unitId: U.A, archivedAt: null } }).catch(() => -1));
      if (tables.length !== nT) p.push(`โต๊ะ ${tables.length} (คาด ${nT})`);
      const missKeys = TABLE_DTO_KEYS.filter((k) => tables.some((t) => !(k in t)));
      if (missKeys.length) p.push(`DTO ขาดคีย์ ${missKeys.join(",")}`);
      const want: [string, string][] = [["A1", "NEEDS_CLEARING"], ["A7", "NEEDS_CLEARING"], ["A2", "FREE"], ["A3", "INACTIVE"], ["A4", "BILL_REQUESTED"], ["A5", "DINING"], ["A9", "DINING"]];
      for (const [n, st] of want) {
        const c = cardOf(f, n);
        if (c?.state !== st) p.push(`${n} ${c?.state ?? "ไม่มี"} (คาด ${st})`);
      }
      if (!cardOf(f, "A1")?.dirtySince) p.push("A1 dirtySince ว่าง");
      const sm = f.summary ?? {};
      const missS = SUMMARY_KEYS.filter((k) => typeof sm[k] !== "number");
      if (missS.length) p.push(`summary ขาด ${missS.join(",")}`);
      const open = (await P.tableSession.findMany({ where: { tenantId: T, unitId: U.A, status: "OPEN", table: { archivedAt: null } } }).catch(() => [])) as Any[];
      const used = new Set(open.map((s) => s.tableId)).size;
      const guests = sum(open.map((s) => s.guestCount ?? 0));
      let unpaid = 0;
      for (const s of open) unpaid += sum((await itemsOf(s.id)).filter((x) => !x.saleId && x.kdsStatus !== "CANCELLED").map((x) => x.lineTotal));
      const active = Number(await P.restaurantTable.count({ where: { tenantId: T, unitId: U.A, archivedAt: null, status: "ACTIVE" } }).catch(() => -1));
      const runMin = Math.ceil((Date.now() - RUN_START) / MIN) + 1;
      if (sm.used !== used || sm.total !== active || sm.guests !== guests || sm.unpaidSatang !== unpaid || sm.unpaidSatang !== sum(tables.map((t) => Number(t.unpaidSatang ?? 0))) || !Number.isInteger(sm.avgMinutes) || sm.avgMinutes < 0 || sm.avgMinutes > runMin)
        p.push(`summary ${short(sm, 120)} (คาด used ${used} total ${active} guests ${guests} unpaid ${unpaid} avg 0..${runMin})`);
    }
    chk("T1", NT("registerTables") === "" && p.length === 0, "สถานะ 5 แบบ + summary ตรงความจริง", FX(NT("registerTables") + (P8(p) || "ครบ")));
  });
  await step("T6", async () => {
    const p: string[] = [];
    if (fxA) p.push(`(fixture) ${fxA}`);
    const f = await floor();
    const c = cardOf(f, "A5");
    if (!c) p.push(`ไม่มีการ์ด A5 (${codeOf(f)})`);
    else {
      const got = { state: c.state, sessionId: c.sessionId === SID.A5, guestCount: c.guestCount, unpaid: c.unpaidSatang, unsent: c.unsentCount, ready: c.readyCount, staff: c.openedByStaff, flags: c.flags, dirty: c.dirtySince ?? null, res: c.reservation ?? null, opened: !!c.openedAt };
      const want = { state: "DINING", sessionId: true, guestCount: 3, unpaid: 22000, unsent: 2, ready: 1, staff: true, flags: { callStaff: true, billRequested: false, payNotified: false }, dirty: null, res: null, opened: true };
      if (short(got, 600) !== short(want, 600)) p.push(`การ์ด ${short(got, 220)}`);
      if (c.member?.name !== MEMBER_NAME || c.member?.tier !== "Silver") p.push(`member ${short(c.member, 80)}`);
      const a4 = cardOf(f, "A4");
      if (a4?.flags?.billRequested !== true) p.push(`A4 flags ${short(a4?.flags, 60)}`);
    }
    const req = await pendingReq(SID.A5 ?? "", "CALL_STAFF");
    const lst = await tbl("registerTableRequests", ctxA(), A("OWNER"));
    if (lst?.ok !== true || !((lst.requests ?? []) as Any[]).some((x) => x.id === req?.id)) p.push(`registerTableRequests → ${codeOf(lst)} (ไม่มีคำขอ CALL_STAFF ของ A5)`);
    const ak = await tbl("registerAckTableRequest", ctxA(), A("OWNER"), { requestId: req?.id });
    const s1 = (await P.restaurantServiceRequest.findUnique({ where: { id: req?.id ?? "none" } }).catch(() => null))?.status;
    const f1 = cardOf(await floor(), "A5");
    if (ak?.ok !== true || s1 !== "ACKED" || f1?.flags?.callStaff !== true) p.push(`ack → ${codeOf(ak)} ${s1} callStaff ${f1?.flags?.callStaff}`);
    const dn = await tbl("registerDoneTableRequest", ctxA(), A("OWNER"), { requestId: req?.id });
    const s2 = (await P.restaurantServiceRequest.findUnique({ where: { id: req?.id ?? "none" } }).catch(() => null))?.status;
    const f2 = cardOf(await floor(), "A5");
    if (dn?.ok !== true || s2 !== "DONE" || f2?.flags?.callStaff !== false) p.push(`done → ${codeOf(dn)} ${s2} callStaff ${f2?.flags?.callStaff}`);
    chk("T6", NT("registerTables") === "" && p.length === 0, "การ์ด A5 ครบ · ack/done", FX(NT("registerTables") + (P8(p) || "ครบ")));
  });

  // ════════ V void/คืน/ปิด/เก็บ ════════
  console.log("\n── V void/คืน/ปิด/เก็บ ──");
  const snapA = async (name: string) => {
    const its = await itemsOf(SID[name] ?? "");
    const s = await sessRow(SID[name] ?? "");
    const t = await tableRow(TB[name] ?? "");
    return short({ its: its.map((x) => [x.id, x.saleId, x.settledAt?.toISOString?.() ?? null, x.updatedAt?.toISOString?.()]), s: [s?.status, s?.updatedAt?.toISOString?.(), s?.closedAt?.toISOString?.() ?? null], d: t?.dirtySince?.toISOString?.() ?? null }, 100_000);
  };
  await step("V1", async () => {
    const p: string[] = [];
    const saleId = SALE.A1 ?? "";
    if (!saleId) p.push("ไม่มีบิล P1");
    else {
      const paidIds = (await itemsOf(SID.A1!)).filter((x) => x.saleId === saleId).map((x) => x.id);
      const v = await call(billsMod, "voidSaleByActor", ctxA(DEV2), A("OWNER"), { unitId: U.A, saleId, idempotencyKey: newKey("void"), reason: "ลูกค้ายกเลิก" });
      if (v?.ok !== true) p.push(`voidSaleByActor → ${codeOf(v)} ${short(v?.message ?? "", 60)}`);
      await drain();
      const its = (await itemsOf(SID.A1!)).filter((x) => paidIds.includes(x.id));
      if (!paidIds.length || its.some((x) => x.saleId !== null || x.settledAt !== null)) p.push(`รายการยังผูก ${its.filter((x) => x.saleId).length}/${paidIds.length}`);
      const s = await sessRow(SID.A1!);
      if (s?.status !== "OPEN" || s?.closedAt !== null) p.push(`session ${s?.status} closedAt ${short(s?.closedAt, 30)}`);
      if ((await P.posSale.findUnique({ where: { id: saleId }, select: { status: true } }).catch(() => null))?.status !== "VOIDED") p.push("บิลไม่ VOIDED");
    }
    chk("V1", p.length === 0, "void จากลิ้นชัก → ตัวรับคืนรายการ + เปิดโต๊ะ", FX(P8(p) || "ครบ"));
  });
  await step("V2", async () => {
    const p: string[] = [];
    const h = consMod?.consumers?.["pos.sale.voided"];
    const evOf = async (saleId: string) => ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "pos.sale.voided" } }).catch(() => [])) as Any[]).filter((e) => isRecord(e.payload) && e.payload.saleId === saleId && !!saleId);
    const replay = async (saleId: string) => {
      const evs = await evOf(saleId);
      if (!evs.length) p.push(`ไม่พบ event voided ของ ${saleId.slice(-6) || "-"}`);
      else if (typeof h !== "function") p.push("ไม่มี consumers[pos.sale.voided]");
      else
        for (const ev of evs)
          for (let i = 0; i < 2; i++)
            try {
              await h(ev);
            } catch (e) {
              p.push(`replay ×${i + 1} throw ${(e as Error).message.slice(0, 60)}`);
            }
    };
    const a0 = await snapA("A1");
    await replay(SALE.A1 ?? "");
    if ((await snapA("A1")) !== a0) p.push("เล่นซ้ำแล้วรายการ/session/dirtySince ของ A1 เปลี่ยน");
    const l0 = await snapA("L1");
    await replay(SALE.L1 ?? "");
    const ls = await sessRow(SID.L1 ?? "");
    if ((await snapA("L1")) !== l0 || ls?.status !== "CLOSED") p.push(`เล่นซ้ำ void ของบิล RESTAURANT เดิม → L1 เปลี่ยน (session ${ls?.status})`);
    chk("V2", p.length === 0, "ตัวรับ idempotent · ไม่ยุ่งบิลเดิมที่จ่ายใหม่แล้ว", FX(P8(p) || "ครบ"));
  });
  await step("V3", async () => {
    const p: string[] = [];
    const saleId = SALE.A7 ?? "";
    if (!saleId) p.push("ไม่มีบิล P3");
    else {
      const line = ((await P.posSaleLine.findMany({ where: { saleId } }).catch(() => [])) as Any[]).find((l) => l.qty === 3);
      const s0 = await snapA("A7");
      const input = (amt: number): Any => ({ saleId, lines: [{ lineId: line?.id ?? "none", qty: 1, restock: false }], payMethods: [{ type: "CASH", amountSatang: amt }], reasonCode: "CHANGED_MIND", reason: "ลูกค้าเปลี่ยนใจ", idempotencyKey: newKey("rf") });
      // ORACLE-EDIT ผู้คุม 10 ต.ค. (P2.4 S fix 1 · มติ 2): probe 1 สตางค์ — 0 ถูกปฏิเสธ VALIDATION ที่ refund.ts:158 ก่อนถึงด่าน Σ (PAYMENT_MISMATCH พกยอดคืน)
      const probe = await call(refundMod, "refundSale", ctxA(DEV1), A("OWNER"), input(1));
      const amt = Number(/ยอดคืน (\d+)/.exec(String(probe?.message ?? ""))?.[1] ?? NaN);
      const r = await call(refundMod, "refundSale", ctxA(DEV1), A("OWNER"), input(amt));
      if (r?.ok !== true) p.push(`refundSale → ${codeOf(r)} ${short(r?.message ?? "", 60)} (probe ${codeOf(probe)} ${amt})`);
      else MY_SALES.push(String(r.refund?.id ?? ""));
      await drain();
      if ((await snapA("A7")) !== s0) p.push("คืนเงินแล้วข้อมูลโต๊ะ A7 เปลี่ยน");
    }
    chk("V3", p.length === 0, "คืนเงินไม่แตะโต๊ะ", FX(P8(p) || "ครบ"));
  });
  await step("V4", async () => {
    const p: string[] = [];
    const r1 = await tbl("registerCloseTable", ctxA(), A("OWNER"), { tableSessionId: SID.A1 });
    if (!refused(r1, "TABLE_HAS_UNPAID") || (await sessRow(SID.A1 ?? ""))?.status !== "OPEN") p.push(`A1 ค้างจ่าย → ${codeOf(r1)} session ${(await sessRow(SID.A1 ?? ""))?.status}`);
    const r2 = await tbl("registerCloseTable", ctxA(), A("STAFF"), { tableSessionId: SID.C4 });
    if (!refused(r2, "PERMISSION_DENIED")) p.push(`STAFF ปิดโต๊ะ → ${codeOf(r2)}`);
    const h = await hold(SID.C4 ?? "", [ml("water", 1)]);
    const hid = String(h?.heldCart?.id ?? "");
    const r3 = await tbl("registerCloseTable", ctxA(), A("OWNER"), { tableSessionId: SID.C4 });
    const s3 = await sessRow(SID.C4 ?? "");
    if (r3?.ok !== true || r3.status !== "CANCELLED" || s3?.status !== "CANCELLED") p.push(`C4 ว่าง → ${codeOf(r3)} ${short(r3?.status)} session ${s3?.status}`);
    if (!hid || (await heldRow(hid))?.status !== "DISCARDED") p.push(`รอบร่าง C4 ${(await heldRow(hid))?.status ?? codeOf(h)} (คาด DISCARDED)`);
    const r4 = await tbl("registerClearTable", ctxA(), A("MGR"), { tableId: TB.A7 });
    const t = await tableRow(TB.A7!);
    const c = cardOf(await floor(), "A7");
    if (r4?.ok !== true || t?.dirtySince !== null || c?.state !== "FREE") p.push(`เก็บ A7 → ${codeOf(r4)} dirtySince ${short(t?.dirtySince ?? "ไม่มีคอลัมน์", 30)} ผัง ${c?.state}`);
    chk("V4", NT("registerCloseTable") === "" && p.length === 0, "ปิดโต๊ะ/เก็บโต๊ะตามกติกา", FX(NT("registerCloseTable") + (P8(p) || "ครบ")));
  });

  // ORACLE-ADD ผู้คุม 10 ต.ค. (P2.4 S fix 2 · F2) — โต๊ะ E2–E4 ของข้อนี้เอง
  await step("V5", async () => {
    const p: string[] = [];
    const restIdx = await tryImport("@/lib/modules/restaurant");
    const lockFn = typeof restIdx?.lockOpenSessionInTx === "function" ? restIdx.lockOpenSessionInTx : null;
    if (!lockFn) p.push(`${MISSING} lockOpenSessionInTx (restaurant/index.ts)`);
    const riceLine = { productId: PP.rice, name: `ข้าวสวย ${RAND}`, qty: 1, choiceIds: [], unitPrice: 1805, optionsTotal: 0 };
    /** รอบที่ถือ session: ล็อก (ถ้ามี) → createOrderInTx → แจ้ง → ค้างธุรกรรม holdMs */
    const roundTx = (sessionId: string, holdMs: number, onInserted: () => void) =>
      P.$transaction(
        async (tx: Any) => {
          if (lockFn) {
            const l = await lockFn(tx, { tenantId: T, unitId: U.A, sessionId });
            if (l?.ok !== true) throw new Error(`lock ${short(l, 60)}`);
          }
          await restIdx.createOrderInTx(tx, { tenantId: T, unitId: U.A, sessionId, placedByUserId: uid("OWNER"), lines: [riceLine] });
          onInserted();
          await sleep(holdMs);
        },
        { timeout: 30_000, maxWait: 10_000 },
      );
    // (c) จ่ายรายการสุดท้ายขณะรอบใหม่ถือ session → โต๊ะไม่ปิด รอบใหม่ยังค้างจ่าย
    await mkExtraTable("E2");
    const s2 = await openT("E2", { guestCount: 2 });
    await legacyOrder(s2, [["rice", 1, []]]);
    const q2 = await tq(s2);
    let inserted2!: () => void;
    const ins2 = new Promise<void>((r) => (inserted2 = r));
    const t2 = roundTx(s2, 4000, () => inserted2()).then(() => "ok", (e: Error) => `throw ${e.message.slice(0, 60)}`);
    await Promise.race([ins2, sleep(15_000)]);
    const pay = await tpay(s2, q2, { ctx: ctxA(DEV2) });
    const t2r = await t2;
    const sess2 = await sessRow(s2);
    const unpaid2 = (await itemsOf(s2)).filter((x) => !x.saleId && x.kdsStatus !== "CANCELLED");
    const tb2 = await tableRow(TB.E2!);
    if (pay.r?.ok !== true || t2r !== "ok" || sess2?.status !== "OPEN" || unpaid2.length !== 1 || tb2?.dirtySince !== null)
      p.push(`จ่ายขณะรอบถือ session: บิล ${codeOf(pay.r)} · รอบ ${t2r} · session ${sess2?.status} · ค้างจ่าย ${unpaid2.length} · dirty ${short(tb2?.dirtySince ?? null, 30)}`);
    // (a) ปิดโต๊ะระหว่างรอบถือล็อก → รอ แล้วเห็นรายการค้างจ่าย
    await mkExtraTable("E3");
    const s3 = await openT("E3", { guestCount: 1 });
    let inserted3!: () => void;
    const ins3 = new Promise<void>((r) => (inserted3 = r));
    const t3 = roundTx(s3, 2500, () => inserted3()).then(() => "ok", (e: Error) => `throw ${e.message.slice(0, 60)}`);
    await Promise.race([ins3, sleep(15_000)]);
    let closeDone = false;
    const cl = tbl("registerCloseTable", ctxA(), A("OWNER"), { tableSessionId: s3 }).then((r: Any) => ((closeDone = true), r));
    await sleep(1200);
    const blocked = !closeDone;
    const [t3r, clr] = await Promise.all([t3, cl]);
    if (!blocked || t3r !== "ok" || !refused(clr, "TABLE_HAS_UNPAID") || (await sessRow(s3))?.status !== "OPEN") p.push(`ปิดระหว่างรอบ: รอ ${blocked} · รอบ ${t3r} · ปิด ${codeOf(clr)} · session ${(await sessRow(s3))?.status}`);
    // (b) ปิดก่อน → รอบถัดไปถือ session ไม่ได้
    await mkExtraTable("E4");
    const s4 = await openT("E4", { guestCount: 1 });
    const c4 = await tbl("registerCloseTable", ctxA(), A("OWNER"), { tableSessionId: s4 });
    const l4 = lockFn ? await P.$transaction((tx: Any) => lockFn(tx, { tenantId: T, unitId: U.A, sessionId: s4 })).catch((e: Error) => ({ ok: "throw", m: e.message })) : null;
    if (c4?.ok !== true || !l4 || l4.ok !== false) p.push(`ปิดก่อน: ปิด ${codeOf(c4)} · ล็อก ${short(l4, 60)}`);
    chk("V5", p.length === 0, "รอบใหม่ไม่ตกใน session ที่ปิด · ปิด/จ่ายรอรอบ", FX(P8(p) || "ครบ"));
  });

  // ════════ R โต๊ะจอง ════════
  console.log("\n── R โต๊ะจอง ──");
  const resRow = async (id: string): Promise<Any> => (RES && id ? RES.findUnique({ where: { id } }).catch(() => null) : null);
  const resCount = async () => (RES ? Number(await RES.count({ where: { tenantId: { in: [T, T2] } } }).catch(() => -1)) : -1);
  const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
  const mkRes = (table: string, ms: number, o: Any = {}, actor = "STAFF", ctx: Any = ctxA()) =>
    tbl("registerCreateReservation", ctx, A(actor), { tableId: TB[table] ?? table, name: `คุณอรทัย ${RAND}`, phone: "0812345678", partySize: 6, at: iso(ms), ...o });
  await step("R1", async () => {
    const p: string[] = [];
    const cr = await mkRes("A6", 10 * MIN, { holdFromMinutes: 15 });
    const id = String(cr?.id ?? "");
    if (cr?.ok !== true || !id) p.push(`create → ${codeOf(cr)} ${short(cr?.message ?? "", 60)}`);
    const r0 = await resRow(id);
    if (id && (r0?.status !== "BOOKED" || r0?.partySize !== 6 || r0?.tableId !== TB.A6 || r0?.holdFromMinutes !== 15)) p.push(`แถว ${short(r0 && [r0.status, r0.partySize, r0.tableId === TB.A6, r0.holdFromMinutes], 80)}`);
    const c0 = cardOf(await floor(), "A6");
    if (c0?.state !== "RESERVED" || c0?.reservation?.id !== id || c0?.reservation?.partySize !== 6 || c0?.reservation?.name !== `คุณอรทัย ${RAND}`) p.push(`ผัง A6 ${c0?.state} ${short(c0?.reservation, 80)}`);
    const st = await tbl("registerSeatReservation", ctxA(), A("STAFF"), { reservationId: id });
    if (st?.ok !== true || !st.sessionId) p.push(`seat → ${codeOf(st)}`);
    const s = await sessRow(String(st?.sessionId ?? ""));
    if (st?.ok === true && (s?.status !== "OPEN" || s?.tableId !== TB.A6 || s?.guestCount !== 6)) p.push(`session ${short(s && [s.status, s.tableId === TB.A6, s.guestCount], 60)}`);
    if ((await resRow(id))?.status !== "SEATED") p.push(`การจอง ${(await resRow(id))?.status} (คาด SEATED)`);
    const c1 = cardOf(await floor(), "A6");
    if (c1?.state !== "DINING") p.push(`ผังหลังนั่ง ${c1?.state}`);
    chk("R1", NCOL() === "" && NT("registerCreateReservation") === "" && p.length === 0, "จอง → RESERVED → นั่ง → DINING", FX(NCOL() + NT("registerCreateReservation") + (P8(p) || "ครบ")));
  });
  await step("R2", async () => {
    const p: string[] = [];
    const a = await mkRes("A2", 10 * MIN);
    const ida = String(a?.id ?? "");
    if (cardOf(await floor(), "A2")?.state !== "RESERVED") p.push("A2 ไม่ RESERVED ก่อนยกเลิก");
    const cx = await tbl("registerCancelReservation", ctxA(), A("STAFF"), { reservationId: ida });
    if (cx?.ok !== true || (await resRow(ida))?.status !== "CANCELLED" || cardOf(await floor(), "A2")?.state !== "FREE") p.push(`ยกเลิก → ${codeOf(cx)} ${(await resRow(ida))?.status} ผัง ${cardOf(await floor(), "A2")?.state}`);
    const far = await mkRes("A2", 180 * MIN);
    if (far?.ok !== true || cardOf(await floor(), "A2")?.state !== "FREE") p.push(`จองอีก 3 ชม. → ${codeOf(far)} ผัง ${cardOf(await floor(), "A2")?.state} (คาด FREE)`);
    if (far?.ok === true && (await resRow(String(far.id)))?.holdFromMinutes !== 15) p.push(`holdFromMinutes ปริยาย ${(await resRow(String(far.id)))?.holdFromMinutes}`);
    if (far?.ok === true) await tbl("registerCancelReservation", ctxA(), A("STAFF"), { reservationId: far.id });
    // เปิดโต๊ะที่ถูกจองไว้
    const c7 = await mkRes("C7", 5 * MIN);
    const ov = await tbl("registerOpenTable", ctxA(), A("STAFF"), { tableId: TB.C7, guestCount: 2 });
    if (ov?.ok !== true || ov.reservationOverridden !== true) p.push(`เปิด C7 ที่จองไว้ → ${codeOf(ov)} overridden ${short(ov?.reservationOverridden)}`);
    if (c7?.ok === true && (await resRow(String(c7.id)))?.status !== "BOOKED") p.push(`การจอง C7 ${(await resRow(String(c7.id)))?.status} (คาด BOOKED)`);
    chk("R2", NCOL() === "" && NT("registerCancelReservation") === "" && p.length === 0, "ยกเลิก/นอกช่วง = FREE · ปริยาย 15 · เปิดทับได้พร้อมธง", FX(NCOL() + NT("registerCancelReservation") + (P8(p) || "ครบ")));
  });
  await step("R3", async () => {
    const p: string[] = [];
    const n0 = await resCount();
    const cases: [string, () => Promise<Any>, string][] = [
      ["โต๊ะร้าน T2", () => mkRes("X1", 10 * MIN), "TABLE_NOT_FOUND"],
      ["ctx สาขา B", () => mkRes("A2", 10 * MIN, {}, "OWNER", ctxB()), "TABLE_NOT_FOUND"],
      ["seat id มั่ว", () => tbl("registerSeatReservation", ctxA(), A("STAFF"), { reservationId: `nope${RAND}` }), "TABLE_NOT_FOUND"],
      ["cancel id มั่ว", () => tbl("registerCancelReservation", ctxA(), A("STAFF"), { reservationId: `nope${RAND}` }), "TABLE_NOT_FOUND"],
      ["STAFF0 ไม่มี session.open", () => mkRes("A2", 10 * MIN, {}, "STAFF0"), "PERMISSION_DENIED"],
      ["partySize 0", () => mkRes("A2", 10 * MIN, { partySize: 0 }), "VALIDATION"],
    ];
    for (const [lbl, f, want] of cases) {
      const r = await f();
      if (!refused(r, want)) p.push(`${lbl} → ${codeOf(r)} (คาด ${want})`);
    }
    if ((await resCount()) !== n0) p.push(`แถวการจอง ${n0} → ${await resCount()}`);
    chk("R3", NCOL() === "" && p.length === 0, "TABLE_NOT_FOUND ×4 · PERMISSION_DENIED · VALIDATION · ไม่เขียน", FX(NCOL() + (P8(p) || "ครบ")));
  });
  // ORACLE-ADD ผู้คุม 10 ต.ค. (P2.4 S fix 2 · F3) — โต๊ะ E5 ของข้อนี้เอง
  await step("R4", async () => {
    const p: string[] = [];
    await mkExtraTable("E5");
    const sid = await openT("E5", { guestCount: 2 });
    const cr = await mkRes("E5", 10 * MIN);
    const id = String(cr?.id ?? "");
    if (cr?.ok !== true) p.push(`จอง → ${codeOf(cr)}`);
    const st = await tbl("registerSeatReservation", ctxA(), A("STAFF"), { reservationId: id });
    if (!refused(st, "VALIDATION") || !String(st?.message ?? "").includes("โต๊ะนี้มีลูกค้าอยู่ — ปิดบิลก่อนจึงนั่งจองได้")) p.push(`นั่ง → ${codeOf(st)} ${short(st?.message ?? "", 60)}`);
    const r = await resRow(id);
    if (r?.status !== "BOOKED" || r?.sessionId) p.push(`การจอง ${r?.status} sessionId ${short(r?.sessionId ?? null, 20)}`);
    const s = await sessRow(sid);
    if (s?.status !== "OPEN" || s?.guestCount !== 2 || (await openSessCount(TB.E5!)) !== 1) p.push(`session ${s?.status} guestCount ${s?.guestCount} OPEN ${await openSessCount(TB.E5!)}`);
    chk("R4", NCOL() === "" && p.length === 0, "นั่งโต๊ะที่มีลูกค้า = VALIDATION ไม่เขียน", FX(NCOL() + (P8(p) || "ครบ")));
  });
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งสอง + ผู้ใช้ชั่วคราว ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; usersLeft: number; err: string };
async function wipeTenants(): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
  const targets = ([[T, T_SLUG], [T2, T2_SLUG]] as [string, string][]).filter(([id]) => !!id);
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
    for (const [id, slug] of targets) {
      await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, id).catch(() => {});
      await P.$executeRawUnsafe(`UPDATE "TableSession" SET "mergedIntoId" = NULL WHERE "tenantId" = $1`, id).catch(() => {});
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
          if (n) rep.left[`${slug === T_SLUG ? "T" : "T2"}.${tb}`] = n;
        } catch {
          rep.left[tb] = -1;
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
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"} + ${T2 || "-"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft} · ผู้ใช้ ${wipe.usersLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
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
  if (MY_SALES.length) await n("posSale.id", () => P.posSale.count({ where: { id: { in: MY_SALES.filter(Boolean) } } }));
  await n("invItem", () => P.invItem.count({ where: { sku: { startsWith: KEY_PREFIX } } }));
  await n("restaurantZone", () => P.restaurantZone.count({ where: { name: { contains: RAND } } }));
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
// นอกขอบเขต P2.4 S: จอ 03 โหมดโต๊ะ · แท็บ "โต๊ะ" · ชิป "ซื้อกลับ/ทานที่ร้าน" · ตัวอักษรไทยในจอ (P2.4U · visual ของผู้คุมงาน) ·
//   ย้าย/รวม/แยกบิล (P2.5) · KDS/ใบครัว/86 event (P2.6) · QR สั่ง/จ่ายก่อน + สลับตัวอ่านเมนูไป PosProduct (P2.7) · คิวหน้าร้าน + จองจากระบบจอง (แถวใหม่หลัง P2.7) ·
//   ลบหน้า /app/u/…/restaurant (P2.14) · one_open_session_per_table CONCURRENTLY (P6.1) · ส่วนประกอบ P2.3 บนบิลโต๊ะ (ผู้สร้างรันหลัง merge P2.3 S)
//   ชุด regression (qc-restaurant* · qc-pos-p1.1 S2.41–S2.43 · p1.3 p1.5 p1.6 p1.9 p1.12 p1.15 p1.16 p2.1 …) ผู้สร้างรันก่อน/หลัง (ผลต้องเท่าเดิม)
