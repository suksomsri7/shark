// QC — POS RUN ใบ P2.6: KDS ใหม่ + ใบครัว + 86 → ทุกช่องทาง (ตั๋วครัว = รอบ RestaurantOrder × สถานี จากทุกแหล่งขาย ·
//   pos/kds.ts actions/board/expo/backlog · ผู้เขียนความพร้อมขาย catalog.setAvailability + PosAvailabilityMark + event pos.product.availability
//   + ตัวรับกระจายไป adapter · ออเดอร์ออนไลน์ PREPARING/READY ตาม KDS · พักครัว/คิวค้าง · ใบครัว + คีย์เครื่องพิมพ์)
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ · ไม่ต้องมี seed (ร้านชั่วคราว + ผู้ใช้ชั่วคราวของตัวเอง)
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.6.md §2 R1–R16 · §3 migration · §4 แผนข้อสอบ · §5 CD1–CD9 · §9 มติผู้คุมงาน 1–16 (ผูกมัด:
//        RestaurantOrder + 6 คอลัมน์ลิงก์ · SKIP-until-export ของ P2.4/P2.8 · ตั๋วหลัง commit + heal · routing (รอบโต๊ะคง P2.4 R5) ·
//        86 ต่อสาขา · ทางร้อนแช่แข็ง · ไม่มีคีย์สิทธิ์ใหม่ · ใบครัวพิมพ์จากเครื่อง · ลำดับเป้าเวลา · พัก/คิวค้าง · 86 ตอน ingest = P2.8 (ตรวจอย่างเดียว) ·
//        เข้าทาง route เท่านั้น · CD2/4/5/6/7 · migration ตรงตัว · pins · ลำดับสร้าง)
//        ต่อยอด: qc-pos-p2.4 (รูปข้อสอบ fail-before · ตาราง L3 ลายเซ็น + ROI_FIELDS ใช้ตรงตัว) · qc-pos-p2.8 (ชื่อ PosOrder/orders) ·
//        qc-pos-p1.1 S2.41–S2.43 (จำนวนคำสั่งทางร้อน 13/6 — ทำซ้ำเป็น L2) · qc-pos-p1.10 (ค่าตั้งเครื่องพิมพ์) · qc-pos-p1.6 (ทะเบียนผู้เรียก createSale)
//        โน้ต: ledger/wo-notes/pos-P2.6-oracle.md (ตารางชื่อ = สัญญาของผู้สร้าง S · ความคลาดเคลื่อน · CONTROLLER-DECISION · SKIP-until-export)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P2.6 (S) ต้องส่ง (ย่อ — ละเอียดในโน้ต):
//   migration `20261208100000_pos_p26_kds`: RestaurantOrder + posSaleId posOrderId channelCode channelName externalRef targetMinutes ·
//     partial unique RestaurantOrder_posSaleId_key / RestaurantOrder_posOrderId_key · RestaurantSetting.autoAcceptMaxOpen ·
//     enum PosAvailabilitySource {KDS STOCK MANUAL} · ตาราง PosAvailabilityMark (ไม่มี FK) · scope sys() · POS_MODELS
//   pos/kds.ts: ticketForSale · healMissingTickets · kdsStart · kdsLineDone · kdsTicketDone · kdsServed · kdsRecall · kdsRush · kdsBoard ·
//     kitchenProgress · kitchenBacklog · kitchenSlipPayload · kdsSetAutoAcceptMax
//   pos/kds-shared.ts (บริสุทธิ์) · pos/kds-actions.ts ("use server") · pos/kitchen-slip-render.ts (บริสุทธิ์)
//   catalog.ts: setAvailability · availabilityFor (+ บน facade `catalog`) · restaurant/index.ts รอยต่อ // POS P2.6 ▸ … ◂ (ฟังก์ชัน *InTx)
//   outbox-consumers.ts: "pos.product.availability" (+ รอยต่อ P2.6 ที่ pos.sale.voided / pos.order.cancelled / pos.order.rejected)
//   device-shared.ts: kitchenSlip "off"|"after-sale" + kitchenStationIds (เพิ่มเฉพาะเมื่อส่งมา)
//
// ขอบเขต: ST สถิต · K ตั๋ว · B ปุ่มครัว · T ตัวอ่าน/เวลา · O ออนไลน์ · A 86 · V void/คืน · P ใบครัว/เครื่องพิมพ์ · L ของเดิม (PAR) · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p2.4/p2.8): SKIP เมื่อของ P2.6 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash · L เขียว)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต + บริสุทธิ์ (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ข้อที่ต้องใช้ของ P2.4 S (restaurant/index.ts createOrderInTx · pos/table.ts) หรือ P2.8 S (PosOrder · pos/order.ts · ORDER_ADAPTERS)
//    = "SKIP-until-export": แดงพร้อมเหตุผลขึ้นต้น `SKIP-until-export(P2.x S)` จนกว่าของนั้นจะอยู่บนฐาน (มติ 2 — ไม่มีวันเขียวลอย)
//    ฐาน = QC4 เท่านั้น (host ep-frosty-lab ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p26-<rand>` + `-t2` + ผู้ใช้ `posqc-p26-<rand>-*@qc.invalid`
//    (ลบทั้งหมดใน finally · แถวค้าง = 0) · ไม่มีเครือข่าย (fetch = ตัวกั้น 503) · ทุกข้อห่อ try/catch (ข้อพัง = แดงพร้อมเหตุผล ไม่ล้มทั้งชุด)
//    fixture ผ่านฟังก์ชันของโมดูล · Prisma ตรงเฉพาะ Tenant/BusinessUnit/User/Membership + การจัดฉากบนแถวของตัวเอง
//    (ลบรอบเพื่อทดสอบ heal · ย้อน bizDate ของรอบเพื่อทดสอบ TICKET_TOO_OLD) · SQL ดิบ = xmin / information_schema / ลายนิ้วมือ / ลบร้านชั่วคราว
//    คอลัมน์ใหม่อ่านผ่าน delegate (client เก่า = undefined = แดงพร้อมเหตุผล) · โมดูล/ฟังก์ชันที่ยังไม่มีเข้าถึงแบบไดนามิก — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.6";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 idempotency/เล่นซ้ำ/แข่ง · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน/จำนวน/สต็อก · X5 ไม่เขียนอะไร · PAR = ต้องเขียวทั้งก่อนและหลังสร้าง ·
//          "-" เชิงหน้าที่ · ป้าย [P2.4] / [P2.8] = SKIP-until-export ของใบนั้น
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.6-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[§3 มติ 1 14] schema + migration เพิ่มอย่างเดียว: RestaurantOrder + posSaleId/posOrderId/channelCode/channelName/externalRef String? + targetMinutes Int? (ไม่มี @unique/@@index ใน schema — partial unique อยู่ใน SQL) · RestaurantSetting + autoAcceptMaxOpen Int? · enum PosAvailabilitySource {KDS STOCK MANUAL} · model PosAvailabilityMark {id tenantId systemId unitId productId source note? markedAt markedByUserId?} @@unique([unitId, productId]) @@index([tenantId, unitId]) ไม่มี @relation · RestaurantOrderItem/PosDevice/MenuItem/PosProduct/PosSale ไม่เปลี่ยน · migration เดียว `20261208100000_pos_p26_kds`: SET lock_timeout '3s' · ADD COLUMN IF NOT EXISTS ×7 · CREATE UNIQUE INDEX IF NOT EXISTS \"RestaurantOrder_posSaleId_key\"/\"RestaurantOrder_posOrderId_key\" … WHERE … IS NOT NULL · CREATE TYPE · CREATE TABLE IF NOT EXISTS (ไม่มี REFERENCES) · ดัชนีของ PosAvailabilityMark · ไม่มีคำสั่งอื่น"),
  D("ST2", "S", "[R16 มติ 7 14] ลงทะเบียน: core/scope.ts PosAvailabilityMark: sys() · pos-qc-env POS_MODELS posAvailabilityMark · kds-shared มีรหัส TICKET_NOT_FOUND TICKET_TOO_OLD KDS_STATION_NOT_FOUND · pos.json th/en: ก้อน kds.* (คีย์ชุดเดียวกัน · th มีอักษรไทย · en ไม่มี) + kds.errors.{ticketNotFound ticketTooOld kdsStationNotFound} · ST7: 0 อักษรไทยในโค้ด src/components/pos/kds/** + src/app/app/sys/[id]/pos/kds/** · ไม่มีคีย์สิทธิ์ใหม่ (pos.kds.* / pos.product.availability)"),
  D("ST3", "S", "[R1 R3 R6 R9 R10 R14 มติ 3 6 hard rules] ขอบเขต: pos/kds.ts export ฟังก์ชันครบ 13 ตัว · kds-shared.ts + kitchen-slip-render.ts บริสุทธิ์ (ไม่ถึง prisma) · kds-actions.ts \"use server\" async ล้วน + catch + เรียกฟังก์ชันผู้ใช้ทุกตัว + setAvailability · restaurant/index.ts มีรอยต่อ // POS P2.6 ▸ … ◂ ที่ export ฟังก์ชัน *InTx · catalog.ts export setAvailability + availabilityFor และอยู่บน facade catalog · modules/pos เข้าถึงร้านอาหารผ่าน import(\"@/lib/modules/restaurant\") เท่านั้น · modules/pos + outbox-consumers ไม่เขียนตาราง Restaurant*/KdsStation ตรง · register.ts เรียก ticketForSale 2 จุดบนบรรทัดรอยต่อ POS P2.6 · outbox-consumers มี \"pos.product.availability\" + รอยต่อ POS P2.6 ที่ pos.sale.voided / pos.order.cancelled / pos.order.rejected · 'use client' import ได้แค่ *-shared / ตัวเรนเดอร์บริสุทธิ์"),
  D("ST4", "PAR", "[มติ 6 7 12 15] POS_NAV_KEYS ตรงฐาน (ไม่มี kds) · settings-overview ROLE_ROWS ชุด task เดิม (ไม่มีแถวครัว/86) · permissions.ts มีคีย์ restaurant.kds.advance/recall · restaurant.order.rush · restaurant.kitchen.pause · pos.sale.create · pos.product.manage · ทุกไฟล์ \"use server\" ใน modules/pos export async function ล้วน · ทางร้อน consumeMenuStock/markMenuItemOutOfStock/restoreMenuStock + createOrder/cancelOrderItem ไม่ปล่อย outbox"),
  D("ST5", "S", "[มติ 6 13 14 16] POS-OWNER-PENDING.md มีบรรทัด P2.6: (ก) เจ้าของร้านอาหาร — schema RestaurantOrder/RestaurantSetting (ข) จอครัวเดิมเดินรายการที่ชำระแล้วไม่ได้ (advanceItem/paid) (ค) ช่องว่าง event 86 ของ QR จนถึง P2.7"),
  // ── K ตั๋ว ──
  D("K1", "-", "[R1 R2 R3 CD3 มติ 3] ขายหน้าร้าน (CASHIER · เครื่อง 1) กะเพรา×2 (เผ็ดกลาง ไข่ดาว · โน้ต ไม่ใส่ถั่ว) + ชาไทย + น้ำเปล่า → รอบ 1 รอบ TAKEAWAY CONFIRMED posSaleId placedByUserId=CASHIER dailyNo · 2 ตั๋ว (ครัวร้อน เครื่องดื่ม) · ไม่มีบรรทัดน้ำ · ชื่อ/จำนวน/โน้ต/ตัวเลือก (choiceSnapshot) สำเนาจากบิล · productId + menuItemId · saleId ของรายการ = null (ทำอาหาร ≠ เก็บเงิน)"),
  D("K2", "X1", "[R3 มติ 3] ticketForSale ซ้ำ 2 รอบ → รอบเดิม created:false · ลบรอบ (จัดฉาก) แล้วยิง healMissingTickets 10 + ticketForSale 2 พร้อมกัน → รอบของบิลนั้น 1 รอบเท่านั้น"),
  D("K3", "X5", "[R2 มติ 4] บิลที่มีแต่น้ำเปล่า + เมล็ดกาแฟ (ไม่ตั้งสถานี) → ไม่มีรอบ · สาขา B (ไม่มีสถานี) ขายคุกกี้ (stationId เป็นสถานีของสาขา A) → ไม่มีรอบ · heal ไม่สร้างรอบให้บิลทั้งสอง"),
  D("K4", "-", "[R2 มติ 4] สินค้าไม่ใช่เมนู (คุกกี้ · updateProduct({stationId: ขนม})) ขายที่สาขา A → รอบ 1 ตั๋วที่ขนม · productId = คุกกี้ · menuItemId null"),
  D("K5", "X1", "[P2.4][R2 R3 มติ 3 4] บิลโต๊ะ (submit มี tableSessionId) → ไม่มีรอบเพิ่ม (heal ก็ไม่สร้าง) · ส่งรอบโต๊ะ (registerSendTableRound) → ตั๋ว source TABLE ป้ายชื่อโต๊ะ + staffName"),
  D("K6", "-", "[R1 R7] ประตูเดิมเข้าคิวเดียว: เปิดโต๊ะ + createOrder โดยพนักงาน → source TABLE (label ชื่อโต๊ะ · staffName) · QR placeGuestOrder → source QR · createOrder TAKEAWAY หน้าเดิม → source LEGACY · ทั้งหมดอยู่บนบอร์ดสถานีของตัวเอง"),
  D("K7", "X1", "[P2.8][R4 มติ 13] LINEMAN NEW → acceptOrder → รอบในธุรกรรมเดียวกับการรับ (xmin RestaurantOrder = PosOrder) posOrderId channelCode LINEMAN channelName externalRef targetMinutes 15 type DELIVERY · รับซ้ำ → รอบเดิม · บิล PLATFORM ของออเดอร์ไม่ได้รอบเพิ่ม · CHAT DIRECT รับแล้วยังไม่จ่าย → มีตั๋ว · ingest MANUAL startStatus ACCEPTED → มีรอบ"),
  D("K8", "X4", "[R3 R9 มติ 6] ครัวซองต์ stockQty 1 ขาย ×2 ที่หน้าร้าน → บิลผ่าน · ตั๋ว qty 2 · ตัวนับ 0 (ไม่ติดลบ) · isOutOfStock true · event pos.product.availability 1 แถว {available:false source STOCK}"),
  D("K9", "X1", "[R3 มติ 3] ลบรอบของบิล (จัดฉาก) → อ่านบอร์ดครั้งถัดไปสร้างคืน 1 รอบ · บิลที่ VOIDED ก่อน heal → ไม่สร้างคืน"),
  // ── B ปุ่มครัว ──
  D("B1", "X1", "[R6] kdsStart (COOK) ตั๋วครัวร้อน → รายการ NEW → COOKING (cookingAt) · ตั๋วเครื่องดื่มไม่ขยับ · ซ้ำ → ok changed 0"),
  D("B2", "-", "[R5 R6 R7] kdsLineDone 1 บรรทัด → READY · บอร์ด: ตั๋ว COOKING doneCount 1 lineCount 2 (เสร็จ 1/2) · lines[].done"),
  D("B3", "-", "[R5 R6] kdsTicketDone → READY · kdsServed → SERVED (ตั๋วหลุดบอร์ด) · รอบยัง CONFIRMED จนเครื่องดื่มเสิร์ฟ → COMPLETED · NEW → READY ด้วย kdsTicketDone ได้"),
  D("B4", "-", "[CD4 มติ 13] รายการที่ชำระแล้วผ่าน checkout เดิม (saleId ตั้ง) → kdsStart/kdsTicketDone ได้ · ตัวควบคุม: advanceItem เดิมยังปฏิเสธ \"รายการนี้ชำระแล้ว\""),
  D("B5", "X1", "[R6] kdsTicketDone 2 คำขอพร้อมกัน → ok ทั้งคู่ · Σ changed = จำนวนรายการที่ยังไม่ READY (มีผลครั้งเดียว) · readyAt ไม่ถูกเขียนทับ"),
  D("B6", "X5", "[R6] kdsRecall ตั๋วที่เสิร์ฟแล้ว → COOKING · readyAt/servedAt null · รอบ COMPLETED → CONFIRMED · ตั๋วของเมื่อวาน (bizDate ย้อน) → TICKET_TOO_OLD ไม่เขียน · CANCELLED ไม่ขยับ"),
  D("B7", "X2", "[R6 R15] รอบร้าน T2 / ctx สาขา B บนรอบสาขา A / id มั่ว → TICKET_NOT_FOUND (start lineDone done served recall rush slip) ไม่เขียน · บอร์ดสถานีมั่ว → KDS_STATION_NOT_FOUND"),
  D("B8", "X3", "[R15 มติ 7] CASHIER อ่านบอร์ดได้แต่เดินตั๋วไม่ได้ (PERMISSION_DENIED) · NOPERM อ่านบอร์ด → PERMISSION_DENIED · COOK เร่งไม่ได้ (restaurant.order.rush) · OWNER kdsRush → isRush + ขึ้นหัวคอลัมน์กำลังทำ · ยกเลิกเร่งได้"),
  // ── T ตัวอ่าน/เวลา ──
  D("T1", "P", "[R1 R5 CD2] kds-shared บริสุทธิ์: ticketStateOf (ทุกรายการ SERVED → SERVED · ทุกรายการ ≥ READY → READY · ทุกรายการ NEW → NEW · อื่น ๆ COOKING · ยกเลิกหมด/ว่าง → null · CANCELLED ไม่นับ) · ticketSourceOf (ONLINE REGISTER TABLE QR LEGACY) · KDS_SOURCES · KDS_TICKET_STATES · ไม่แก้อินพุต"),
  D("T2", "P", "[R8 CD5 มติ 9] ticketTargetMinutes: ออนไลน์ 15 > prepMinutes สูงสุด 8 > kdsCriticalMins 10 · ticketTimer(นาฬิกาฉีดเข้า): elapsedSec remainingSec · warn เมื่อเหลือ ≤ 120 วิ (ยังไม่เลย) · late เมื่อ elapsed ≥ เป้า · KDS_WARN_SEC 120 · avgReadyMinutes = floor ค่าเฉลี่ย (0 เมื่อว่าง)"),
  D("T3", "P", "[R7 R16] sortColumn: ใหม่ = sentAt · กำลังทำ = เร่งก่อน แล้ว remainingSec น้อยก่อน · พร้อม = readyAt (ไม่แก้อินพุต · เสมอกันเรียง id) · kdsRefusalMessageKey 3 รหัส = errors.<camel> · รหัสแปลก = errors.unknown"),
  D("T4", "-", "[R7 R8] kdsBoard ครัวร้อน: stations[] (id name nameEn openCount = ตั๋วที่ยังไม่เสิร์ฟจาก DB) · ตั๋วครบตาม DB (สถานะ = ticketStateOf ของรายการจริง) · คีย์ ticket ครบ · no = dailyNo · label/source · targetMinutes (กะเพรา 8 · ชาไทย 10) · elapsed/remaining/warn/late สอดคล้อง serverNow + ticketTimer · ลำดับคอลัมน์ = sortColumn · pending Σ qty NEW+COOKING ตามชื่อ"),
  D("T5", "-", "[R7 R13] servedToday {count last} = DB · avgMinutes = DB · expo = ตั๋ว READY ทุกสถานี · kitchenBacklog = ตั๋ว NEW+COOKING ต่อสถานี · พักครัว → board.paused · QR ถูกปฏิเสธ · ขายหน้าร้านยังได้ (และยังได้ตั๋ว)"),
  // ── O ออนไลน์ ──
  D("O1", "-", "[P2.8][R11 CD7] ตั๋วแรกของรอบออนไลน์ออกจาก NEW → PosOrder ACCEPTED → PREPARING (PosOrderEvent 1 แถว actor null) · start อีกสถานี → ไม่มี event เพิ่ม"),
  D("O2", "X1", "[P2.8][R11] READY บางสถานี → ยัง PREPARING · ครบทุกสถานี → READY + outbox pos.order.ready 1 แถว · recall → ออเดอร์ยัง READY"),
  D("O3", "X1", "[P2.8][R11] ยกเลิกออเดอร์ CHAT ที่รับแล้ว → ระบายคิว → รายการ NEW/COOKING/READY ของรอบ = CANCELLED (cancelReason \"ออเดอร์ถูกยกเลิก\") · ระบาย/เล่นซ้ำ ×2 → ไม่เปลี่ยน"),
  D("O4", "-", "[P2.8][R11 R13 มติ 10] kitchenProgress {orderId done total} = DB · autoAcceptMaxOpen 1 + CHAT autoAccept → ออเดอร์ค้าง NEW (ครัวค้าง) · ล้างเพดาน → ACCEPTED · พักครัว → CHAT ingest CHANNEL_PAUSED · LINEMAN (MANUAL) ยังได้"),
  // ── A 86 ──
  D("A1", "-", "[R9 CD6] COOK setAvailability({ผัดไทย MENU · KDS · false}) → MenuItem.isOutOfStock · PosAvailabilityMark (source KDS · markedBy COOK) · AuditLog pos.product.availability · outbox 1 แถว {productId unitId systemId available:false source KDS at} · board.eightySix มีผัดไทย"),
  D("A2", "X1", "[R9] เรียกซ้ำ → ok ไม่มี event เพิ่ม · คืนขาย → event available:true · mark หาย · isOutOfStock false · คืนซ้ำ → ไม่มี event"),
  D("A3", "-", "[R9 มติ 5 7] CASHIER 86 น้ำเปล่า (ไม่ใช่เมนู · MANUAL) → unavailableUnitIds มีสาขา A · mark · event · สาขาอื่นไม่โดน · คืนขาย → ออกจากรายการ + event available:true"),
  D("A4", "X5", "[R10 มติ 5] ระหว่าง 86: registerCatalog ไทล์ soldOut UNAVAILABLE + soldOutMark {source KDS at} · quote → PRODUCT_UNAVAILABLE lineIndex · orderingMenu isOutOfStock · availabilityFor(สาขา, ids) = false/true · ไม่มีบิล"),
  D("A5", "X5", "[P2.8][R10 มติ 11] ingest ออเดอร์ที่มีผัดไทยที่ 86 → PRODUCT_UNAVAILABLE lineIndex 1 · ไม่มี PosOrder"),
  D("A6", "X1", "[P2.8][R10] ตัวรับ pos.product.availability → ORDER_ADAPTERS[adapter].setAvailability ครั้งเดียวต่อช่องทาง active ที่ adapter ≠ NONE ของสาขา (LINEMAN/CHAT/WEB) พร้อม productId · ช่องทาง NONE/สาขาอื่นไม่ถูกเรียก · เล่นซ้ำ ×2 → ไม่ throw ไม่มีแถว outbox/audit/mark เพิ่ม"),
  D("A7", "X1", "[R9 มติ 6] ประตูเดิม setItemStock({isOutOfStock:true}) → event MANUAL 1 · เรียกซ้ำ (ไม่พลิก) → 0 · ปลด → available:true · resetDailyStock พลิกตัวนับหมด → available:true · ทางร้อน (createOrder หมดพอดี) → ไม่มี event (ช่องว่างถึง P2.7)"),
  D("A8", "X3", "[R15 มติ 7] NOPERM → PERMISSION_DENIED · สินค้าร้าน T2 / id มั่ว → PRODUCT_NOT_FOUND · source แปลก → VALIDATION · ไม่เขียน (ไม่มี event/mark/audit)"),
  D("A9", "X1", "[R9] 86 สินค้าเดียวกัน 10 คำขอพร้อมกัน → ok ทั้งหมด · event 1 · mark 1"),
  // ── V void/คืน ──
  D("V1", "X1", "[R12] void บิลหน้าร้าน (voidSaleByActor) + ระบายคิว → รายการ NEW/COOKING/READY = CANCELLED · SERVED คงเดิม · ตัวนับขนมครกคืนเฉพาะ NEW (3 → 5) · เล่น consumers[pos.sale.voided] ซ้ำ ×2 → ไม่เปลี่ยน"),
  D("V2", "X5", "[R12] คืนเงินบางบรรทัด (refundSale) ของบิล K1 → รายการ/รอบครัวไม่เปลี่ยน"),
  // ── P ใบครัว/เครื่องพิมพ์ ──
  D("P1", "-", "[R14 CD8] kitchenSlipPayload(รอบ K1) → 2 ใบ (ใบละสถานี) · ไม่มีคีย์เงิน · lines {qty name options note} · stationId → 1 ใบ · copy:true → copy · locale en → printLocale en (sourceLabel ไม่มีอักษรไทย) · NOPERM → PERMISSION_DENIED · รอบมั่ว → TICKET_NOT_FOUND"),
  D("P2", "P", "[R14] kitchen-slip-render บริสุทธิ์: renderKitchenSlipHtml / renderKitchenSlipEscPos ผลเหมือนเดิมทุกครั้ง (ไม่มีนาฬิกา) · HTML มีชื่อสถานี/รายการ/โน้ต ไม่มี ฿ · copy → ป้าย \"พิมพ์ซ้ำ\" · ESC/POS = Uint8Array ไม่ว่าง"),
  D("P3", "P", "[R14 มติ 8] parsePrinterConfig: kitchenSlip \"after-sale\" + kitchenStationIds [s1 s2] ผ่านตรงตัว · ค่าผิด (kitchenSlip \"always\" · kitchenStationIds \"x\" / [1]) → VALIDATION ระบุฟิลด์ · ไม่ส่ง = ไม่มีคีย์ใหม่ในผล (qc-pos-p1.10 PC1/G4 คงเดิม)"),
  // ── L ของเดิม (PAR) ──
  D("L1", "PAR", "[มติ 13 15] ลายเซ็น export ของ restaurant/{table,order,menu,kds,storefront,scope}.ts = ตาราง L3 ของ qc-pos-p2.4 ตรงตัว · RestaurantOrderItem ชุดฟิลด์ = ROI_FIELDS ของ qc-pos-p2.4"),
  D("L2", "PAR", "[มติ 6 15] ทางร้อน (ดัก SQL แบบ qc-pos-p1.1 S2.42): createOrder หมดพอดี = 13 คำสั่ง · cancelOrderItem = 6 · คงที่สองรอบ · ไม่แตะ PosProduct/OutboxEvent · advanceItem เดิมปฏิเสธรายการที่ชำระแล้ว · stationQueue/expoQueue ทำงาน"),
  D("L3", "PAR", "[มติ 15] scripts/pos-sale-contract.json sha 7a418de1… ตรงตัว · ทะเบียนผู้เรียก createSale เท่าเดิม (ไฟล์ kds*/kitchen-slip* ไม่มี createSale)"),
  D("L4", "PAR", "[มติ 8 15] PosPrinterConfig: POS_PRINTER_DEFAULTS 6 คีย์เดิมค่าเดิม · parsePrinterConfig(undefined/null/{}) = 6 คีย์เดิมพอดี · ค่าครบผ่านตรงตัว · คีย์แปลกถูกทิ้ง"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว T + T2 เหลือ 0 แถวทุกตารางที่มี tenantId (Restaurant* KdsStation PosAvailabilityMark PosOrder* PosSale* SalesChannel OutboxEvent AuditLog InvMovement …) · แถว Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0"),
  D("Z2", "-", "รอยของรอบนี้นอกร้านชั่วคราว = 0 (PosSale คีย์ · AuditLog/OutboxEvent ที่มีรหัสรอบ · Tenant slug) · ลายนิ้วมือร้านอื่น (RestaurantOrder RestaurantOrderItem MenuItem PosProduct นับ + แฮช) ก่อน/หลังพิมพ์เป็นข้อมูล"),
];
/** ข้อที่ต้องรอของใบอื่น (มติ 2) */
const DEP_P24 = new Set(["K5"].map((x) => `P2.6-${x}`));
const DEP_P28 = new Set(["K7", "O1", "O2", "O3", "O4", "A5", "A6"].map((x) => `P2.6-${x}`));

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  const byX = new Map<string, number>();
  for (const [, x] of CHECKS) byX.set(x, (byX.get(x) ?? 0) + 1);
  console.log(`X-coverage: ${[...byX.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log(`SKIP-until-export: P2.4 S → ${[...DEP_P24].join(" ")} · P2.8 S → ${[...DEP_P28].join(" ")}`);
  process.exit(0);
}

// ═════════════════════════ ตัวช่วยทั่วไป ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = id.startsWith("P2.6-") ? id : `P2.6-${id}`;
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
const setStr = (xs: unknown[]) => [...xs].map(String).sort(byId).join(",");
const camelKey = (code: string) => "errors." + code.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const msOf = (v: unknown): number => (v instanceof Date ? v.getTime() : typeof v === "string" || typeof v === "number" ? new Date(v).getTime() : NaN);

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
 * ลายเซ็นของ export (L1 — สูตรเดียวกับ qc-pos-p2.4 L3): ฟังก์ชัน = ข้อความตั้งแต่ `export` ถึงวงเล็บปีกกาเปิดของตัวฟังก์ชัน ·
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
  kds: `${POS_DIR}/kds.ts`,
  kdsShared: `${POS_DIR}/kds-shared.ts`,
  kdsActions: `${POS_DIR}/kds-actions.ts`,
  slipRender: `${POS_DIR}/kitchen-slip-render.ts`,
  catalog: `${POS_DIR}/catalog.ts`,
  catalogLegacy: `${POS_DIR}/catalog-legacy.ts`,
  posIndex: `${POS_DIR}/index.ts`,
  register: `${POS_DIR}/register.ts`,
  regShared: `${POS_DIR}/register-shared.ts`,
  devShared: `${POS_DIR}/device-shared.ts`,
  tabs: `${POS_DIR}/tabs.ts`,
  settingsOverview: `${POS_DIR}/settings-overview.ts`,
  restIndex: `${REST_DIR}/index.ts`,
  restOrder: `${REST_DIR}/order.ts`,
  restTable: `${POS_DIR}/table.ts`,
  orderMod: `${POS_DIR}/order.ts`,
  orderAdapters: `${POS_DIR}/order-adapters.ts`,
  consumers: "src/lib/outbox-consumers.ts",
  scope: "src/lib/core/scope.ts",
  perms: "src/lib/core/permissions.ts",
  qcEnv: "scripts/pos-qc-env.mts",
  contract: "scripts/pos-sale-contract.json",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  ownerPending: "ledger/POS-OWNER-PENDING.md",
};
/** sha256 ของ scripts/pos-sale-contract.json (มติ 15 · = ค่า re-pin ของ qc-pos-p2.4 ST4 ที่ 0c20c473) */
const CONTRACT_SHA_BASE = "7a418de17b44bf7c54e9ee99a3cb740ae596fb6fb240978901e8a07b011697cd";
const MIGRATION_NAME = "20261208100000_pos_p26_kds";
const NEW_CODES = ["TICKET_NOT_FOUND", "TICKET_TOO_OLD", "KDS_STATION_NOT_FOUND"] as const;
/** ฟังก์ชันของ pos/kds.ts (ชื่อตรงตัว — ตารางชื่อของโน้ต) */
const KDS_USER_FNS = ["kdsStart", "kdsLineDone", "kdsTicketDone", "kdsServed", "kdsRecall", "kdsRush", "kdsBoard", "kitchenSlipPayload", "kitchenProgress", "kdsSetAutoAcceptMax"] as const;
const KDS_SYS_FNS = ["ticketForSale", "healMissingTickets", "kitchenBacklog"] as const;
const KDS_FNS = [...KDS_SYS_FNS, ...KDS_USER_FNS] as const;
const SHARED_EXPORTS = ["KDS_TICKET_STATES", "KDS_SOURCES", "KDS_WARN_SEC", "ticketStateOf", "ticketSourceOf", "ticketTargetMinutes", "ticketTimer", "avgReadyMinutes", "sortColumn", "kdsRefusalMessageKey"] as const;
const SLIP_EXPORTS = ["renderKitchenSlipHtml", "renderKitchenSlipEscPos"] as const;
const RO_NEW: [string, RegExp][] = [
  ["posSaleId", /^posSaleId\s+String\?(\s|$)/],
  ["posOrderId", /^posOrderId\s+String\?(\s|$)/],
  ["channelCode", /^channelCode\s+String\?(\s|$)/],
  ["channelName", /^channelName\s+String\?(\s|$)/],
  ["externalRef", /^externalRef\s+String\?(\s|$)/],
  ["targetMinutes", /^targetMinutes\s+Int\?(\s|$)/],
];
/** ฟิลด์ ณ f71f4e30 */
const RO_BASE = ["id", "tenantId", "unitId", "type", "status", "sessionId", "session", "bizDate", "dailyNo", "memberId", "guestName", "guestPhone", "guestToken", "note", "isRush", "pickupStatus", "pickupAt", "readyAt", "pickedUpAt", "placedByUserId", "cancelReason", "createdAt", "updatedAt", "items"];
const RS_BASE = ["id", "tenantId", "unitId", "serviceChargeBps", "requireApproval", "serviceHours", "specialClosures", "lastOrderMins", "kitchenPaused", "kitchenPausedNote", "kdsWarnMins", "kdsCriticalMins", "pickupEnabled", "pickupSlotMins", "pickupLeadMins", "createdAt", "updatedAt"];
const PD_BASE = ["id", "tenantId", "unitId", "systemId", "name", "deviceCode", "status", "posRegNo", "printerConfig", "registeredByUserId", "lastSeenAt", "revokedAt", "createdAt", "updatedAt"];
const MARK_FIELDS: [string, RegExp][] = [
  ["id", /^id\s+String\s+@id\b/],
  ["tenantId", /^tenantId\s+String(\s|$)/],
  ["systemId", /^systemId\s+String(\s|$)/],
  ["unitId", /^unitId\s+String(\s|$)/],
  ["productId", /^productId\s+String(\s|$)/],
  ["source", /^source\s+PosAvailabilitySource(\s|$)/],
  ["note", /^note\s+String\?/],
  ["markedAt", /^markedAt\s+DateTime(\s|$)/],
  ["markedByUserId", /^markedByUserId\s+String\?/],
];
const MARK_COLS = ["id", "tenantId", "systemId", "unitId", "productId", "source", "note", "markedAt", "markedByUserId"];
const AVAIL_SOURCES = ["KDS", "STOCK", "MANUAL"];
/** === qc-pos-p2.4 ROI_FIELDS (ตรงตัว · มติ 1 15) */
const ROI_FIELDS = ["id", "tenantId", "unitId", "orderId", "order", "menuItemId", "menuItem", "stationId", "station", "nameSnapshot", "unitPrice", "optionsTotal", "qty", "lineTotal", "note", "kdsStatus", "isRush", "cookingAt", "readyAt", "servedAt", "cancelledAt", "cancelReason", "cancelledByUserId", "saleId", "settledAt", "productId", "createdAt", "updatedAt", "options"];
/** === qc-pos-p2.4 SIGS_BASE (ตาราง L3 ตรงตัว · มติ 15) */
const SIGS_BASE: Record<string, Record<string, string>> = {
  table: { listZones: "c8e66837ad1f", createZone: "657bb8ee1f6f", archiveZone: "1336f49c9347", createTable: "7c7335ab1a16", updateTable: "b3b16d37834a", archiveTable: "47d96578b58e", rotateQr: "d5e7b11b54d8", floorPlan: "5d6efa1d21d5", openSession: "ab58a6782f51", getSession: "38a38ad81b0a", openSessionOfTable: "6e6fbb24512b", openSessionsList: "99cca1fa8063", linkMember: "c579f79820a7", closeSession: "05a2d36cbde3", moveSession: "ca73dc7db579", mergeSession: "e2678ceaf8ad", "type TableCard": "dd90e6b09769" },
  order: { createOrder: "0ad725a9b31a", confirmOrder: "2108ca257e17", cancelOrderItem: "dae18c0cc783", setOrderRush: "4852e65ca7ae", createServiceRequest: "97c5f05f6e71", ackServiceRequest: "db4fa0866436", doneServiceRequest: "5396c3e2da71", listServiceRequests: "ee280efc9e7d", billPreview: "51fa4f808e6d", checkout: "8baf40c40637", voidCheckout: "471cc12884c3", billsToday: "0dce2df518da", ordersToday: "4ef771e3551a", "type CartLine": "eb7dfe6bb8a2", "type OrderError": "16b2614ffb88", "type BillLine": "4b470b8a90d1", "type BillToday": "366788f537a5" },
  menu: { getSetting: "f700dee962e0", updateSetting: "79d111854167", setKitchenPause: "4e67db9cc931", ensureDefaultStations: "894d9978ce47", listStations: "effe0d67ea7f", createStation: "4eadae186018", listCategories: "160def563ced", createCategory: "d2346c115e77", archiveCategory: "87644a22bb6d", listOptionGroups: "644ce3d6366d", createOptionGroup: "8cd876100eff", archiveOptionGroup: "0fa449815cf8", setChoiceStock: "5bd5a5463933", listItems: "1fc6faba97a3", getItem: "71032293f7ff", createItem: "82bf759e3162", updateItem: "67b302b17226", setItemOptionGroups: "b27f4bbb5879", duplicateItem: "62f7a2ced447", archiveItem: "3b9ed28cc3f1", setItemStock: "4c5b39aa477a", orderingMenu: "0335bba33bf9", resetDailyStock: "98ca27407c5c", "type OrderingMenuChoice": "5fe03be7e840", "type OrderingMenuGroup": "0686bac15880", "type OrderingMenuItem": "c4d70abcfc39", "type OrderingMenuCat": "df2872299963" },
  kds: { stationQueue: "0b629f94e719", advanceItem: "02f15cb51c4d", recallItem: "525c524982ac", expoQueue: "53924013f2cb" },
  storefront: { resolveUnit: "8e8a249ea05f", publicMenu: "565700125ede", resolveTableSession: "63240575d567", tableStatusForGuest: "e0efafa8e491", guestBill: "341ebe3ef184", notifyPromptpayPayment: "9f887f1e2496", placeGuestOrder: "1e486abc28d4", "type GuestBill": "ff8cf6e2e286" },
  scope: { bizDateBkk: "904b1cf77499", nowMinutesBkk: "50abf9b645bc", dowBkk: "038b8485d5d4", baht: "5f8bdb640984", hhmmToMin: "a80d74af739e", kitchenOpenNow: "bdbb011302fa", "type ServiceHourDay": "74ce2d5dbdc4", "type SpecialClosure": "8dbb78ea5f91" },
};
/** ทะเบียนผู้เรียก createSale ณ f71f4e30 (= qc-pos-p1.6 U4 / qc-pos-p2.4 L2 · วัดด้วยสูตรเดียวกัน) */
const CALL_SITES: Record<string, number> = {
  "src/lib/actions/booking.ts": 1, "src/lib/actions/pos.ts": 1, "src/lib/ai/proposals.ts": 1, "src/lib/modules/booking/service.ts": 1,
  "src/lib/modules/clinic/service.ts": 1, "src/lib/modules/giftcard/service.ts": 2, "src/lib/modules/hotel/service.ts": 2,
  "src/lib/modules/member/subscription.ts": 1, "src/lib/modules/pos/api/ops/sales.ts": 1, "src/lib/modules/pos/register.ts": 1,
  "src/lib/modules/rental/service.ts": 2, "src/lib/modules/restaurant/order.ts": 1, "src/lib/modules/school/service.ts": 1,
  "src/lib/modules/shop/service.ts": 1, "src/lib/modules/ticket/service.ts": 1,
};
/** ผู้เรียกใหม่ที่ใบอื่นได้รับอนุญาตให้เพิ่ม (P2.8 มติ: pos/order.ts 1 จุด) — ไม่นับเป็นความต่างของ P2.6 */
const CALL_SITES_ALLOWED_LATER: Record<string, number> = { "src/lib/modules/pos/order.ts": 1 };
const POS_NAV_BASE = ["overview", "register", "products", "stock", "sales", "shifts", "close", "reports", "settings"];
const ROLE_TASKS_BASE = ["sell", "discount", "priceOverride", "void", "refund", "shiftOperate", "shiftManage", "productManage", "stockCount", "reports", "settings", "onlineOrders"];
const PRINTER_DEFAULTS_BASE = { paper: "80", mode: "browser", autoPrint: false, drawerKick: false, thaiText: "raster", copies: 1 } as const;
const THAI_SCAN_DIRS = ["src/components/pos/kds", "src/app/app/sys/[id]/pos/kds"];

const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4", "ST5", "L1", "L3"].map((x) => `P2.6-${x}`);
const PURE_IDS = ["T1", "T2", "T3", "P2", "P3", "L4"].map((x) => `P2.6-${x}`);
const skipReasons: string[] = [];
for (const f of [F.kds, F.kdsShared, F.kdsActions, F.slipRender]) if (!existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);
for (const [f, names] of [
  [F.kds, [...KDS_FNS]],
  [F.kdsShared, [...SHARED_EXPORTS]],
  [F.slipRender, [...SLIP_EXPORTS]],
  [F.catalog, ["setAvailability", "availabilityFor"]],
] as [string, string[]][])
  for (const n of names) if (!exportsFn(srcOf(f), n)) skipReasons.push(`ยังไม่มี export ${n} (${f.split("/").slice(-2).join("/")})`);
/** ของใบอื่นบนฐาน (มติ 2) — ไม่ใช่เหตุ SKIP ของทั้งชุด แต่เป็นเหตุแดงของข้อที่รอ */
const depP24: string[] = [];
if (!exportsFn(srcOf(F.restIndex), "createOrderInTx")) depP24.push("restaurant/index.ts ยังไม่ export createOrderInTx");
for (const n of ["registerOpenTable", "registerSendTableRound"]) if (!exportsFn(srcOf(F.restTable), n)) depP24.push(`pos/table.ts ยังไม่ export ${n}`);
const depP28: string[] = [];
for (const n of ["ingestOrder", "acceptOrder", "cancelOrder", "setChannelOrderSettings"]) if (!exportsFn(srcOf(F.orderMod), n)) depP28.push(`pos/order.ts ยังไม่ export ${n}`);
if (!exportsFn(srcOf(F.orderAdapters), "ORDER_ADAPTERS")) depP28.push("pos/order-adapters.ts ยังไม่ export ORDER_ADAPTERS");
const DEP_MSG = (id: string): string => {
  const full = `P2.6-${id}`;
  if (DEP_P24.has(full) && depP24.length) return `SKIP-until-export(P2.4 S): ${depP24.join(" · ")}`;
  if (DEP_P28.has(full) && depP28.length) return `SKIP-until-export(P2.8 S): ${depP28.join(" · ")}`;
  return "";
};

/** ไฟล์ "shared"/ตัวเรนเดอร์ไม่ import prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (ค่า) — เงื่อนไขที่ --no-db โหลดได้ */
const purePath = (f: string): boolean => {
  const s = srcOf(f);
  if (!s) return false;
  const valueImports = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const dyn = [...s.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);
  return ![...valueImports, ...dyn].some((p) =>
    /@prisma\/client|\/db$|^\.\/db$|@\/lib\/core\/db|@\/lib\/modules\/(inventory|account|system|restaurant|member|shop|chat)|^node:|^crypto$|^\.\/(kds|order|order-adapters|catalog|catalog-legacy|register|service|bills|refund|held-cart|table|channel|shift|device|price)$|@\/lib\/modules\/pos\/(kds|order|catalog|catalog-legacy|register|service|bills|refund|table|channel|shift|device)$/.test(p),
  );
};

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  // ST1 schema + migration
  {
    const p: string[] = [];
    const ro = prismaBlock(schemaSrc, "model", "RestaurantOrder");
    for (const [f, re] of RO_NEW) {
      const l = fieldLine(ro, f);
      if (!l) p.push(`RestaurantOrder ไม่มี ${f}`);
      else if (!re.test(l) || /@unique|@default/.test(l)) p.push(`RestaurantOrder.${f} = ${short(l, 60)}`);
    }
    const roExtra = fieldNames(ro).filter((f) => !RO_BASE.includes(f) && !RO_NEW.some(([n]) => n === f));
    const roMiss = RO_BASE.filter((f) => !fieldNames(ro).includes(f));
    if (roExtra.length || roMiss.length) p.push(`RestaurantOrder ฟิลด์นอกสัญญา (เกิน ${roExtra.join(",") || "-"} · ขาด ${roMiss.join(",") || "-"})`);
    if (/@@(unique|index)\(\s*\[\s*(posSaleId|posOrderId)\b/.test(ro)) p.push("RestaurantOrder มี @@unique/@@index ของ posSaleId/posOrderId ใน schema (partial unique อยู่ใน SQL เท่านั้น)");
    const rs = prismaBlock(schemaSrc, "model", "RestaurantSetting");
    const aa = fieldLine(rs, "autoAcceptMaxOpen");
    if (!aa) p.push("RestaurantSetting ไม่มี autoAcceptMaxOpen");
    else if (!/^autoAcceptMaxOpen\s+Int\?(\s|$)/.test(aa) || /@default/.test(aa)) p.push(`RestaurantSetting.autoAcceptMaxOpen = ${short(aa, 60)} (คาด Int? ไม่มี default)`);
    const rsExtra = fieldNames(rs).filter((f) => !RS_BASE.includes(f) && f !== "autoAcceptMaxOpen");
    if (rsExtra.length) p.push(`RestaurantSetting ฟิลด์เกิน ${rsExtra.join(",")}`);
    const en = prismaBlock(schemaSrc, "enum", "PosAvailabilitySource");
    const vals = en ? en.split("\n").slice(1).map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l)) : [];
    if (!en) p.push("ไม่มี enum PosAvailabilitySource");
    else if (setStr(vals) !== setStr(AVAIL_SOURCES)) p.push(`PosAvailabilitySource = ${vals.join(",")}`);
    const mk = prismaBlock(schemaSrc, "model", "PosAvailabilityMark");
    if (!mk) p.push("ไม่มี model PosAvailabilityMark");
    else {
      for (const [f, re] of MARK_FIELDS) {
        const l = fieldLine(mk, f);
        if (!l) p.push(`PosAvailabilityMark ขาด ${f}`);
        else if (!re.test(l)) p.push(`PosAvailabilityMark.${f} = ${short(l, 70)}`);
      }
      for (const l of fieldLines(mk).filter((l) => !MARK_FIELDS.some(([f]) => l.split(/\s+/)[0] === f))) {
        const typ = l.split(/\s+/)[1] ?? "";
        if (!(typ.endsWith("?") || typ.endsWith("[]") || /@default\(|@updatedAt/.test(l))) p.push(`PosAvailabilityMark ฟิลด์เกินที่บังคับ: ${short(l, 60)}`);
      }
      if (/@relation/.test(mk)) p.push("PosAvailabilityMark มี @relation (§3: ไม่มี FK)");
      if (!/@@unique\(\s*\[\s*unitId\s*,\s*productId\s*\]\s*\)/.test(mk)) p.push("PosAvailabilityMark ไม่มี @@unique([unitId, productId])");
      if (!/@@index\(\s*\[\s*tenantId\s*,\s*unitId\s*\]\s*\)/.test(mk)) p.push("PosAvailabilityMark ไม่มี @@index([tenantId, unitId])");
    }
    const roi = fieldNames(prismaBlock(schemaSrc, "model", "RestaurantOrderItem"));
    if (setStr(roi) !== setStr(ROI_FIELDS)) p.push("RestaurantOrderItem ฟิลด์เปลี่ยน");
    const pd = fieldNames(prismaBlock(schemaSrc, "model", "PosDevice"));
    if (setStr(pd) !== setStr(PD_BASE)) p.push(`PosDevice ฟิลด์เปลี่ยน (มติ 12: ไม่มี role/kind · คีย์เครื่องพิมพ์อยู่ใน JSON) ${pd.filter((f) => !PD_BASE.includes(f)).join(",")}`);
    for (const m of ["MenuItem", "PosProduct", "PosSale", "PosSaleLine", "TableSession"]) {
      const bad = fieldNames(prismaBlock(schemaSrc, "model", m)).filter((f) => /^(posSaleId|posOrderId|targetMinutes|autoAcceptMaxOpen|availabilitySource|kitchenSlip|kitchenStationIds|kdsTicket\w*|eightySix\w*)$/.test(f));
      if (bad.length) p.push(`${m} ได้ฟิลด์ของ P2.6 (${bad.join(",")}) — §3 ห้ามแตะ`);
    }
    // migration
    const files = walk("prisma/migrations", [], /\.sql$/).filter((f) => /"PosAvailabilityMark"|"PosAvailabilitySource"|"autoAcceptMaxOpen"|"RestaurantOrder_posSaleId_key"|ADD COLUMN[^;]*"posOrderId"/i.test(rd(f)));
    if (files.length !== 1) p.push(`migration ที่แตะ PosAvailabilityMark/autoAcceptMaxOpen/posSaleId = ${files.length} ไฟล์ (คาด 1)`);
    for (const f of files) {
      const name = f.split("/").slice(-2, -1)[0] ?? "";
      if (name !== MIGRATION_NAME) p.push(`ชื่อ migration ${name} (คาด ${MIGRATION_NAME})`);
      let sql = rd(f).replace(/--.*$/gm, "");
      const doBlocks = [...sql.matchAll(/DO\s+\$\$([\s\S]*?)\$\$\s*;/gi)].map((m) => m[1]!);
      for (const b of doBlocks)
        if (!/CREATE\s+TYPE\s+"PosAvailabilitySource"/i.test(b) || /\b(DROP|RENAME|DELETE|UPDATE|TRUNCATE|INSERT)\b/i.test(b)) p.push(`DO block นอกรายการ (${short(b.replace(/\s+/g, " "), 60)})`);
      const inDo = doBlocks.join("\n");
      sql = sql.replace(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi, "");
      const stmts = sql.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
      const RO_ADD = /^ADD COLUMN IF NOT EXISTS "(posSaleId|posOrderId|channelCode|channelName|externalRef)" TEXT$|^ADD COLUMN IF NOT EXISTS "targetMinutes" INTEGER$/i;
      const roAdds: string[] = [];
      const ok = (s: string): boolean => {
        if (/^SET lock_timeout\s*=\s*'3s'$/i.test(s) || /^SET lock_timeout TO '3s'$/i.test(s) || /^RESET lock_timeout$/i.test(s)) return true;
        const at = /^ALTER TABLE "RestaurantOrder" (.+)$/i.exec(s);
        if (at) {
          const parts = at[1]!.split(/,\s*(?=ADD COLUMN)/i).map((x) => x.trim());
          if (parts.every((x) => RO_ADD.test(x))) {
            roAdds.push(...parts.map((x) => /"(\w+)"/.exec(x)![1]!));
            return true;
          }
          return false;
        }
        return (
          /^ALTER TABLE "RestaurantSetting" ADD COLUMN IF NOT EXISTS "autoAcceptMaxOpen" INTEGER$/i.test(s) ||
          /^CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantOrder_posSaleId_key" ON "RestaurantOrder" ?\( ?"posSaleId" ?\) WHERE \(?"posSaleId" IS NOT NULL\)?$/i.test(s) ||
          /^CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantOrder_posOrderId_key" ON "RestaurantOrder" ?\( ?"posOrderId" ?\) WHERE \(?"posOrderId" IS NOT NULL\)?$/i.test(s) ||
          /^CREATE TYPE "PosAvailabilitySource" AS ENUM ?\(/i.test(s) ||
          /^CREATE TABLE IF NOT EXISTS "PosAvailabilityMark" \(/i.test(s) ||
          /^CREATE UNIQUE INDEX IF NOT EXISTS "[^"]+" ON "PosAvailabilityMark" ?\( ?"unitId", ?"productId" ?\)$/i.test(s) ||
          /^CREATE INDEX IF NOT EXISTS "[^"]+" ON "PosAvailabilityMark" ?\( ?"tenantId", ?"unitId" ?\)$/i.test(s)
        );
      };
      const bad = stmts.filter((s) => !ok(s) || /\b(DROP|RENAME|TRUNCATE|DELETE FROM|UPDATE "|INSERT INTO|ALTER COLUMN|ADD VALUE|CONCURRENTLY|REFERENCES|FOREIGN KEY)\b/i.test(s));
      if (bad.length) p.push(`${name}: คำสั่งนอกรายการอนุญาต (${short(bad[0], 110)})`);
      if (setStr(roAdds) !== setStr(RO_NEW.map(([n]) => n))) p.push(`ADD COLUMN ของ RestaurantOrder = ${setStr(roAdds) || "-"} (คาด 6 คอลัมน์ IF NOT EXISTS)`);
      const all = stmts.join(";\n") + "\n" + inDo;
      if (!/"RestaurantOrder_posSaleId_key"/.test(all)) p.push("ไม่มี partial unique RestaurantOrder_posSaleId_key");
      if (!/"RestaurantOrder_posOrderId_key"/.test(all)) p.push("ไม่มี partial unique RestaurantOrder_posOrderId_key");
      if (!/"autoAcceptMaxOpen" INTEGER/i.test(all)) p.push('ไม่มี ADD COLUMN "autoAcceptMaxOpen" INTEGER');
      const ty = /CREATE\s+TYPE\s+"PosAvailabilitySource"\s+AS\s+ENUM\s*\(([^)]*)\)/i.exec(all);
      if (!ty) p.push('ไม่มี CREATE TYPE "PosAvailabilitySource"');
      else if (setStr(ty[1]!.split(",").map((x) => x.trim().replace(/'/g, ""))) !== setStr(AVAIL_SOURCES)) p.push(`ENUM ${ty[1]}`);
      const ct = stmts.find((s) => /^CREATE TABLE IF NOT EXISTS "PosAvailabilityMark"/i.test(s)) ?? "";
      if (!ct) p.push('ไม่มี CREATE TABLE IF NOT EXISTS "PosAvailabilityMark"');
      else {
        const miss = MARK_COLS.filter((c) => !new RegExp(`"${c}"`).test(ct));
        if (miss.length) p.push(`CREATE TABLE ขาด ${miss.join(",")}`);
        if (!/"source" "PosAvailabilitySource" NOT NULL/i.test(ct)) p.push('"source" ไม่ใช่ "PosAvailabilitySource" NOT NULL');
      }
      if (!stmts.some((s) => /^CREATE UNIQUE INDEX IF NOT EXISTS "[^"]+" ON "PosAvailabilityMark"/i.test(s))) p.push("ไม่มี unique (unitId, productId) ของ PosAvailabilityMark");
      if (!stmts.some((s) => /^SET lock_timeout/i.test(s))) p.push("ไม่มี SET lock_timeout '3s'");
    }
    chk("ST1", p.length === 0, "6 คอลัมน์ RestaurantOrder + autoAcceptMaxOpen + PosAvailabilityMark + migration เดียวเพิ่มล้วน", P8(p) || `ครบ (${files[0] ?? "—"})`);
  }
  // ST2 ลงทะเบียน + ข้อความ + ST7 + ไม่มีคีย์สิทธิ์ใหม่
  {
    const p: string[] = [];
    if (!/\bPosAvailabilityMark\s*:\s*sys\(\)/.test(srcOf(F.scope))) p.push("scope.ts ไม่มี PosAvailabilityMark: sys()");
    const env = srcOf(F.qcEnv);
    const pm = env.slice(env.indexOf("export const POS_MODELS"), env.indexOf("export type PosModelKey"));
    if (!/\bposAvailabilityMark\s*:\s*\{[^}]*model:\s*"PosAvailabilityMark"/.test(pm)) p.push('pos-qc-env POS_MODELS ไม่มี posAvailabilityMark {model: "PosAvailabilityMark"}');
    const ks = srcOf(F.kdsShared);
    for (const c of NEW_CODES) if (!new RegExp(`["']${c}["']`).test(ks)) p.push(`kds-shared.ts ไม่มีรหัส ${c}`);
    const leaves = (o: unknown, pre = ""): [string, string][] => (typeof o === "string" ? [[pre, o]] : isRecord(o) ? Object.entries(o).flatMap(([k, v]) => leaves(v, pre ? `${pre}.${k}` : k)) : []);
    const blocks: Record<string, [string, string][]> = {};
    for (const [lang, f] of [["th", F.msgTh], ["en", F.msgEn]] as const) {
      let j: Any = null;
      try {
        j = JSON.parse(rd(f) || "null");
      } catch (e) {
        p.push(`${f} อ่าน JSON ไม่ได้: ${(e as Error).message.slice(0, 40)}`);
      }
      const lv = leaves(j?.kds);
      blocks[lang] = lv;
      if (!lv.length) p.push(`${lang}: ไม่มีก้อนข้อความ kds.*`);
      else if (lang === "th" && !lv.some(([, s]) => THAI.test(s))) p.push("th: kds.* ไม่มีข้อความไทย");
      else if (lang === "en" && lv.some(([, s]) => THAI.test(s))) p.push(`en: kds.* มีอักษรไทย (${lv.filter(([, s]) => THAI.test(s)).map(([k]) => k).slice(0, 3).join(",")})`);
      for (const c of NEW_CODES) {
        const k = camelKey(c).slice("errors.".length);
        const v = j?.kds?.errors?.[k];
        if (typeof v !== "string" || !v.trim()) p.push(`${lang}: kds.errors.${k} ไม่มี`);
        else if (lang === "th" && !THAI.test(v)) p.push(`th: kds.errors.${k} ไม่ใช่ภาษาไทย`);
      }
    }
    const kt = (blocks.th ?? []).map(([k]) => k).sort();
    const ke = (blocks.en ?? []).map(([k]) => k).sort();
    if (kt.length && ke.length && short(kt, 20000) !== short(ke, 20000)) p.push(`คีย์ kds.* th/en ไม่ตรงกัน (th ${kt.length} · en ${ke.length})`);
    // ST7: ไม่มีอักษรไทยในโค้ดจอใหม่ (ข้อความผ่าน messages เท่านั้น)
    let scanned = 0;
    for (const d of THAI_SCAN_DIRS)
      for (const f of walk(d)) {
        scanned++;
        const lines = stripComments(rd(f)).split("\n").filter((l) => THAI.test(l));
        if (lines.length) p.push(`ST7 ${f.split("/").slice(-3).join("/")} มีอักษรไทย ${lines.length} บรรทัด (${short(lines[0]!.trim(), 40)})`);
      }
    // ไม่มีคีย์สิทธิ์ใหม่ (มติ 7)
    const perms = srcOf(F.perms);
    const newKeys = [...perms.matchAll(/"(pos\.kds\.[\w.]+|pos\.product\.availability|pos\.kitchen\.[\w.]+)"\s*:/g)].map((m) => m[1]!);
    if (newKeys.length) p.push(`permissions.ts มีคีย์ใหม่ ${newKeys.join(",")} (มติ 7: ห้าม)`);
    chk("ST2", p.length === 0, "scope · POS_MODELS · 3 รหัส · ข้อความ th/en kds.* · ST7 ไทย 0 · ไม่มีคีย์สิทธิ์ใหม่", P8(p) || `ครบ (${kt.length} คีย์ kds.* · สแกน ${scanned} ไฟล์จอ)`);
  }
  // ST3 ขอบเขตโมดูล
  {
    const p: string[] = [];
    const kds = srcOf(F.kds);
    if (!kds) p.push("ไม่มี pos/kds.ts");
    for (const n of KDS_FNS) if (kds && !exportsFn(kds, n)) p.push(`pos/kds.ts ไม่ export ${n}`);
    for (const [f, names] of [[F.kdsShared, SHARED_EXPORTS], [F.slipRender, SLIP_EXPORTS]] as [string, readonly string[]][]) {
      if (!existsSync(join(ROOT, f))) p.push(`ไม่มี ${f.split("/").pop()}`);
      else {
        if (!purePath(f)) p.push(`${f.split("/").pop()} import prisma/db/โมดูลเซิร์ฟเวอร์/node: (ต้องบริสุทธิ์ · client-safe)`);
        for (const n of names) if (!exportsFn(srcOf(f), n)) p.push(`${f.split("/").pop()} ไม่ export ${n}`);
      }
    }
    const kaRaw = rd(F.kdsActions);
    if (!kaRaw) p.push("ไม่มี pos/kds-actions.ts");
    else {
      if (!isUseServer(kaRaw)) p.push('kds-actions.ts ไม่ขึ้นต้น "use server"');
      const ka = stripComments(kaRaw);
      const bad = [...ka.matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim()).filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`kds-actions.ts export ที่ไม่ใช่ async function (${short(bad.map((b) => b.slice(0, 40)), 100)})`);
      for (const n of [...KDS_USER_FNS, "setAvailability"]) if (!new RegExp(`\\b${n}\\s*\\(`).test(ka)) p.push(`kds-actions.ts ไม่เรียก ${n}`);
      const starts = [...ka.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map((m) => ({ name: m[1]!, at: m.index! }));
      for (let i = 0; i < starts.length; i++) {
        const body = ka.slice(starts[i]!.at, i + 1 < starts.length ? starts[i + 1]!.at : ka.length);
        if (!/\bcatch\b/.test(body)) p.push(`${starts[i]!.name} ไม่มี catch`);
      }
    }
    // facade ร้านอาหาร: รอยต่อ P2.6 ที่ export ฟังก์ชัน *InTx
    const idxRaw = rd(F.restIndex);
    if (!idxRaw) p.push("ไม่มี restaurant/index.ts (P2.4 S)");
    else {
      const m = /POS P2\.6\s*▸([\s\S]*?)◂/.exec(idxRaw);
      if (!m) p.push("restaurant/index.ts ไม่มีรอยต่อ // POS P2.6 ▸ … ◂");
      else {
        const lines = idxRaw.slice(Math.max(0, idxRaw.lastIndexOf("\n", m.index)), idxRaw.indexOf("\n", m.index + m[0].length) + 1 || idxRaw.length);
        if (!/\w+InTx\b/.test(lines)) p.push("รอยต่อ POS P2.6 ใน restaurant/index.ts ไม่มีฟังก์ชัน *InTx");
      }
    }
    // catalog: ผู้เขียน/ผู้อ่านความพร้อมขาย + facade
    const cat = srcOf(F.catalog);
    for (const n of ["setAvailability", "availabilityFor"]) if (!exportsFn(cat, n)) p.push(`catalog.ts ไม่ export ${n}`);
    const facade = constBody(srcOf(F.posIndex), "export const catalog");
    for (const n of ["setAvailability", "availabilityFor"]) if (!new RegExp(`\\b${n}\\b`).test(facade)) p.push(`facade catalog (pos/index.ts) ไม่มี ${n}`);
    // POS → ร้านอาหาร: ผ่าน index เท่านั้น · แบบ lazy
    for (const f of walk(POS_DIR)) {
      const s = srcOf(f);
      const deep = [...s.matchAll(/(?:from\s*|import\s*\(\s*)["'](@\/lib\/modules\/restaurant\/[^"']+|\.\.\/restaurant[^"']*)["']/g)].map((m) => m[1]!);
      if (deep.length) p.push(`${f.split("/").slice(-2).join("/")} import ร้านอาหารแบบเจาะไฟล์ (${deep[0]})`);
      if (/^\s*import\s+(?!type\b)[^;]*?from\s+["']@\/lib\/modules\/restaurant["']/m.test(s)) p.push(`${f.split("/").slice(-2).join("/")} import ร้านอาหารแบบ static (ต้อง import())`);
    }
    if (kds && !/import\s*\(\s*["']@\/lib\/modules\/restaurant["']\s*\)/.test(kds)) p.push('pos/kds.ts ไม่เรียก import("@/lib/modules/restaurant")');
    // ผู้เขียนตารางร้านอาหาร = restaurant/* เท่านั้น
    const W = "(create|createMany|update|updateMany|upsert|delete|deleteMany)";
    const RM = "(restaurantOrder|restaurantOrderItem|restaurantOrderItemOption|restaurantTable|restaurantZone|tableSession|restaurantServiceRequest|restaurantReservation|restaurantDailyCounter|restaurantSetting|kdsStation)";
    for (const f of [...walk(POS_DIR), F.consumers]) {
      const s = srcOf(f);
      if (new RegExp(`\\.${RM}\\.${W}\\b`).test(s)) p.push(`${f.split("/").slice(-2).join("/")} เขียนตารางร้านอาหารตรง (ต้องผ่าน facade)`);
      if (/(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"(Restaurant\w*|TableSession|KdsStation)"/i.test(s)) p.push(`${f.split("/").slice(-2).join("/")} SQL เขียนตารางร้านอาหารตรง`);
    }
    // register.ts: 2 จุดหลัง commit บนบรรทัดรอยต่อ
    const regLines = rd(F.register).split("\n");
    const tfs = regLines.map((l, i) => ({ l, i })).filter((x) => /\bticketForSale\s*\(/.test(stripComments(x.l)));
    if (tfs.length !== 2) p.push(`register.ts เรียก ticketForSale ${tfs.length} จุด (คาด 2: ทางปกติ + ทาง intents)`);
    for (const x of tfs) if (!/POS P2\.6\s*▸/.test(regLines.slice(Math.max(0, x.i - 3), x.i + 2).join("\n"))) p.push(`register.ts:${x.i + 1} ticketForSale ไม่อยู่ในรอยต่อ POS P2.6 ▸`);
    // ตัวรับ
    const consRaw = rd(F.consumers);
    const cl = consRaw.split("\n");
    const near = (key: string): string => {
      const i = cl.findIndex((l) => new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:`).test(l));
      return i < 0 ? "" : cl.slice(Math.max(0, i - 8), i + 8).join("\n");
    };
    if (!near("pos.product.availability")) p.push("outbox-consumers.ts ไม่มี pos.product.availability");
    for (const key of ["pos.product.availability", "pos.sale.voided", "pos.order.cancelled", "pos.order.rejected"]) {
      const n = near(key);
      if (!n) {
        if (key !== "pos.product.availability") p.push(`outbox-consumers.ts ไม่มี ${key}${key.startsWith("pos.order") ? " (P2.8 S)" : ""}`);
      } else if (!/POS P2\.6\s*▸/.test(n)) p.push(`ตัวรับ ${key} ไม่มีรอยต่อ POS P2.6 ▸ (±8 บรรทัด)`);
    }
    // 'use client'
    for (const f of walk("src")) {
      const raw = rd(f);
      if (!isUseClient(raw)) continue;
      const imps = [...stripComments(raw).matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
      const badc = imps.filter((x) => /modules\/pos\/kds$|modules\/pos\/catalog$|modules\/restaurant$|modules\/restaurant\/index$/.test(x));
      if (badc.length) p.push(`${f} ('use client') import ${badc.join(",")}`);
    }
    chk("ST3", p.length === 0, "kds.ts 13 ฟังก์ชัน · shared/renderer บริสุทธิ์ · actions · facade P2.6 · catalog · lazy import · ผู้เขียนเดียว · register 2 จุด · ตัวรับ", P8(p) || "ครบ");
  }
  // ST4 PAR
  {
    const p: string[] = [];
    const nav = /POS_NAV_KEYS\s*=\s*\[([^\]]*)\]/.exec(srcOf(F.tabs))?.[1] ?? "";
    const navKeys = [...nav.matchAll(/"(\w+)"/g)].map((m) => m[1]!);
    if (navKeys.join(",") !== POS_NAV_BASE.join(",")) p.push(`POS_NAV_KEYS = ${navKeys.join(",")} (คาด ${POS_NAV_BASE.join(",")})`);
    const rows = constBody(srcOf(F.settingsOverview), "const ROLE_ROWS");
    const tasks = [...rows.matchAll(/task:\s*"(\w+)"/g)].map((m) => m[1]!);
    if (tasks.join(",") !== ROLE_TASKS_BASE.join(",")) p.push(`ROLE_ROWS task = ${tasks.join(",")}`);
    const perms = srcOf(F.perms);
    for (const k of ["restaurant.kds.advance", "restaurant.kds.recall", "restaurant.order.rush", "restaurant.kitchen.pause", "pos.sale.create", "pos.product.manage"]) if (!new RegExp(`"${k.replace(/\./g, "\\.")}"\\s*:`).test(perms)) p.push(`permissions.ts ไม่มี ${k}`);
    const files = walk(POS_DIR).filter((f) => isUseServer(rd(f)));
    for (const f of files) {
      const bad = [...srcOf(f).matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim()).filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`${f.split("/").pop()}: export ที่ไม่ใช่ async function (${short(bad.map((b) => b.slice(0, 40)), 100)})`);
    }
    const leg = srcOf(F.catalogLegacy);
    for (const n of ["consumeMenuStock", "markMenuItemOutOfStock", "restoreMenuStock"]) if (/\bemitOutbox\w*\b|outboxEvent\b/.test(fnBody(leg, n))) p.push(`catalog-legacy ${n} ปล่อย outbox (มติ 6: ทางร้อนแช่แข็ง)`);
    const ord = srcOf(F.restOrder);
    for (const n of ["createOrder", "cancelOrderItem"]) if (/\bemitOutbox\w*\b|outboxEvent\b/.test(fnBody(ord, n))) p.push(`restaurant/order.ts ${n} ปล่อย outbox (มติ 6)`);
    chk("ST4", p.length === 0, "nav · role rows · คีย์สิทธิ์เดิม · use server · ทางร้อนไม่มี outbox", P8(p) || `ครบ (${files.length} ไฟล์ use server)`);
  }
  // ST5 โน้ตเจ้าของ
  {
    const p: string[] = [];
    const own = rd(F.ownerPending).split("\n").filter((l) => /P2\.6/.test(l));
    if (!own.some((l) => /(RestaurantOrder|RestaurantSetting|autoAcceptMaxOpen|schema ร้านอาหาร|restaurant schema|restaurant owner|เจ้าของร้านอาหาร)/i.test(l))) p.push("ไม่มีบรรทัด P2.6 เรื่อง schema ร้านอาหาร (RestaurantOrder/RestaurantSetting)");
    if (!own.some((l) => /(advanceItem|ชำระแล้ว|paid)/i.test(l) && /(KDS|จอครัว|board|ครัวเดิม|legacy)/i.test(l))) p.push("ไม่มีบรรทัด P2.6 เรื่องจอครัวเดิมเดินรายการที่ชำระแล้วไม่ได้");
    if (!own.some((l) => /P2\.7/.test(l) && /(event|86|QR|อีเวนต์|หมด)/i.test(l))) p.push("ไม่มีบรรทัด P2.6 เรื่องช่องว่าง event 86 ของ QR จนถึง P2.7");
    chk("ST5", p.length === 0, "บรรทัด P2.6 สามเรื่องใน POS-OWNER-PENDING.md", P8(p) || `ครบ (${own.length} บรรทัด)`);
  }
  // L1 ลายเซ็น export ของร้านอาหาร + ROI
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
    const roi = fieldNames(prismaBlock(walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n"), "model", "RestaurantOrderItem"));
    if (setStr(roi) !== setStr(ROI_FIELDS)) p.push(`RestaurantOrderItem ฟิลด์เปลี่ยน (เกิน ${roi.filter((f) => !ROI_FIELDS.includes(f)).join(",") || "-"} / ขาด ${ROI_FIELDS.filter((f) => !roi.includes(f)).join(",") || "-"})`);
    chk("L1", p.length === 0, "export เดิมทุกตัวลายเซ็นเดิม (ตาราง L3 ของ p2.4) · ROI_FIELDS เดิม", P8(p) || `ครบ (${n} export · ${roi.length} ฟิลด์)`);
  }
  // L3 สัญญา createSale + ทะเบียนผู้เรียก
  {
    const p: string[] = [];
    const raw = existsSync(join(ROOT, F.contract)) ? readFileSync(join(ROOT, F.contract)) : Buffer.from("");
    const h = createHash("sha256").update(raw).digest("hex");
    if (h !== CONTRACT_SHA_BASE) p.push(`pos-sale-contract.json เปลี่ยน (sha ${h.slice(0, 12)} ≠ ${CONTRACT_SHA_BASE.slice(0, 12)})`);
    const found: Record<string, number> = {};
    for (const f of walk("src")) {
      if (f.endsWith("src/lib/modules/pos/service.ts") || f.endsWith("src/lib/contracts.ts")) continue;
      const k = (stripComments(rd(f)).match(/\bcreateSale\s*\(/g) ?? []).length;
      if (k) found[f] = k;
    }
    const want = (f: string) => CALL_SITES[f] ?? (found[f] === CALL_SITES_ALLOWED_LATER[f] ? CALL_SITES_ALLOWED_LATER[f] : 0);
    const diff = [...new Set([...Object.keys(CALL_SITES), ...Object.keys(found)])].filter((f) => want(f) !== (found[f] ?? 0)).map((f) => `${f.replace("src/lib/", "")}:${want(f)}→${found[f] ?? 0}`);
    if (diff.length) p.push(`ต่าง: ${diff.join(", ")}`);
    for (const f of [F.kds, F.kdsShared, F.kdsActions, F.slipRender]) if (/\bcreateSale\b/.test(srcOf(f))) p.push(`${f.split("/").pop()} อ้าง createSale`);
    chk("L3", p.length === 0, "สัญญา createSale ตรง sha · ทะเบียนผู้เรียกเท่าเดิม", P8(p) || `ครบ (${sum(Object.values(found))} จุด/${Object.keys(found).length} ไฟล์)`);
  }
}

// ═════════════════════════ 1b. บริสุทธิ์ (ไม่แตะ DB) ═════════════════════════
const SAMPLE_SLIP = Object.freeze({
  stationName: "ครัวร้อน",
  no: 14,
  source: "REGISTER",
  sourceLabel: "ซื้อกลับ",
  channelName: null,
  externalRef: null,
  sentAt: "2026-10-10T05:00:00.000Z",
  staffName: "ต้น",
  lines: Object.freeze([Object.freeze({ qty: 2, name: "กะเพราหมูกรอบ", options: Object.freeze(["เผ็ดกลาง", "ไข่ดาว"]), note: "ไม่ใส่ถั่ว" })]),
  copy: false,
  printLocale: "th",
});
const bytesOf = (r: Any): Uint8Array | null => (r instanceof Uint8Array ? r : r?.bytes instanceof Uint8Array ? r.bytes : null);
async function runPure(shared: Any, slipMod: Any, devShared: Any): Promise<void> {
  console.log("\n── T1–T3 · P2 · P3 · L4 บริสุทธิ์ (kds-shared · kitchen-slip-render · device-shared) ──");
  // T1 สถานะตั๋ว + แหล่งที่มา
  {
    const p: string[] = [];
    if (!shared) p.push(`${MISSING} kds-shared.ts`);
    if (!Array.isArray(shared?.KDS_TICKET_STATES) || shared.KDS_TICKET_STATES.join(",") !== "NEW,COOKING,READY,SERVED") p.push(`KDS_TICKET_STATES = ${short(shared?.KDS_TICKET_STATES, 60)}`);
    if (!Array.isArray(shared?.KDS_SOURCES) || setStr(shared.KDS_SOURCES) !== setStr(["TABLE", "QR", "REGISTER", "ONLINE", "LEGACY"])) p.push(`KDS_SOURCES = ${short(shared?.KDS_SOURCES, 60)}`);
    const cases: [string[], string | null][] = [
      [["SERVED", "SERVED"], "SERVED"], [["SERVED", "CANCELLED"], "SERVED"], [["READY", "SERVED"], "READY"], [["READY"], "READY"],
      [["NEW", "NEW"], "NEW"], [["NEW", "CANCELLED"], "NEW"], [["NEW", "COOKING"], "COOKING"], [["NEW", "READY"], "COOKING"],
      [["COOKING"], "COOKING"], [["COOKING", "SERVED"], "COOKING"], [["CANCELLED"], null], [["CANCELLED", "CANCELLED"], null], [[], null],
    ];
    if (typeof shared?.ticketStateOf !== "function") p.push(`${MISSING} ticketStateOf`);
    else
      for (const [st, want] of cases) {
        const inp = Object.freeze([...st]);
        const got = callSync(shared, "ticketStateOf", inp);
        if ((got ?? null) !== want) p.push(`ticketStateOf(${st.join("+") || "∅"}) = ${short(got, 30)} (คาด ${want})`);
        if (inp.join(",") !== st.join(",")) p.push("ticketStateOf แก้อินพุต");
      }
    const src: [Record<string, string | null>, string][] = [
      [{ sessionId: null, placedByUserId: null, posSaleId: null, posOrderId: "o1" }, "ONLINE"],
      [{ sessionId: null, placedByUserId: "u1", posSaleId: "s1", posOrderId: null }, "REGISTER"],
      [{ sessionId: "t1", placedByUserId: "u1", posSaleId: null, posOrderId: null }, "TABLE"],
      [{ sessionId: "t1", placedByUserId: null, posSaleId: null, posOrderId: null }, "QR"],
      [{ sessionId: null, placedByUserId: "u1", posSaleId: null, posOrderId: null }, "LEGACY"],
      [{ sessionId: null, placedByUserId: null, posSaleId: null, posOrderId: null }, "LEGACY"],
    ];
    if (typeof shared?.ticketSourceOf !== "function") p.push(`${MISSING} ticketSourceOf`);
    else
      for (const [inp, want] of src) {
        const got = callSync(shared, "ticketSourceOf", Object.freeze({ ...inp }));
        if (got !== want) p.push(`ticketSourceOf(${short(Object.fromEntries(Object.entries(inp).filter(([, v]) => v)), 60)}) = ${short(got, 20)} (คาด ${want})`);
      }
    chk("T1", p.length === 0, "สถานะตั๋ว 13 กรณี · แหล่งที่มา 6 กรณี · ค่าคงที่", P8(p) || "ครบ");
  }
  // T2 เป้าเวลา + ตัวจับเวลา (นาฬิกาฉีดเข้า)
  {
    const p: string[] = [];
    const tg: [Record<string, unknown>, number][] = [
      [{ roundTargetMinutes: 15, prepMinutes: [8, null], criticalMins: 10 }, 15],
      [{ roundTargetMinutes: null, prepMinutes: [8, null, 5], criticalMins: 10 }, 8],
      [{ roundTargetMinutes: null, prepMinutes: [null], criticalMins: 10 }, 10],
      [{ roundTargetMinutes: null, prepMinutes: [], criticalMins: 10 }, 10],
    ];
    if (typeof shared?.ticketTargetMinutes !== "function") p.push(`${MISSING} ticketTargetMinutes`);
    else for (const [inp, want] of tg) {
      const got = callSync(shared, "ticketTargetMinutes", Object.freeze({ ...inp }));
      if (got !== want) p.push(`ticketTargetMinutes(${short(inp, 70)}) = ${short(got, 20)} (คาด ${want})`);
    }
    if (shared?.KDS_WARN_SEC !== 120) p.push(`KDS_WARN_SEC = ${short(shared?.KDS_WARN_SEC)}`);
    const sent = 1_800_000_000_000;
    const tm: [number, { elapsedSec: number; remainingSec: number; warn: boolean; late: boolean }][] = [
      [0, { elapsedSec: 0, remainingSec: 600, warn: false, late: false }],
      [479_999, { elapsedSec: 479, remainingSec: 121, warn: false, late: false }],
      [480_000, { elapsedSec: 480, remainingSec: 120, warn: true, late: false }],
      [599_999, { elapsedSec: 599, remainingSec: 1, warn: true, late: false }],
      [600_000, { elapsedSec: 600, remainingSec: 0, warn: false, late: true }],
      [660_000, { elapsedSec: 660, remainingSec: -60, warn: false, late: true }],
    ];
    if (typeof shared?.ticketTimer !== "function") p.push(`${MISSING} ticketTimer`);
    else for (const [dt, want] of tm) {
      const got = callSync(shared, "ticketTimer", Object.freeze({ sentAtMs: sent, targetMinutes: 10, nowMs: sent + dt }));
      const proj = isRecord(got) ? { elapsedSec: got.elapsedSec, remainingSec: got.remainingSec, warn: got.warn, late: got.late } : got;
      if (JSON.stringify(proj) !== JSON.stringify(want)) p.push(`ticketTimer(+${dt}ms) = ${short(proj, 90)} (คาด ${short(want, 90)})`);
    }
    const av: [{ sentAtMs: number; readyAtMs: number }[], number][] = [
      [[], 0],
      [[{ sentAtMs: 0, readyAtMs: 300_000 }, { sentAtMs: 0, readyAtMs: 659_999 }], 7],
      [[{ sentAtMs: 1000, readyAtMs: 601_000 }], 10],
    ];
    if (typeof shared?.avgReadyMinutes !== "function") p.push(`${MISSING} avgReadyMinutes`);
    else for (const [inp, want] of av) {
      const got = callSync(shared, "avgReadyMinutes", Object.freeze(inp.map((x) => Object.freeze({ ...x }))));
      if (got !== want) p.push(`avgReadyMinutes(${inp.length} ใบ) = ${short(got, 20)} (คาด ${want})`);
    }
    chk("T2", p.length === 0, "เป้า 15>8>10 · warn ≤120 วิ · late ≥ เป้า · ค่าเฉลี่ย floor", P8(p) || "ครบ");
  }
  // T3 ลำดับคอลัมน์ + คีย์ข้อความ
  {
    const p: string[] = [];
    const ids = (r: Any) => (Array.isArray(r) ? r.map((x: Any) => x?.id).join(",") : short(r, 60));
    if (typeof shared?.sortColumn !== "function") p.push(`${MISSING} sortColumn`);
    else {
      const nw = Object.freeze([{ id: "b", isRush: false, sentAtMs: 200, remainingSec: 0, readyAtMs: null }, { id: "a", isRush: true, sentAtMs: 200, remainingSec: 0, readyAtMs: null }, { id: "c", isRush: false, sentAtMs: 100, remainingSec: 0, readyAtMs: null }].map((x) => Object.freeze(x)));
      const ck = Object.freeze([
        { id: "x", isRush: false, sentAtMs: 1, remainingSec: 30, readyAtMs: null }, { id: "y", isRush: true, sentAtMs: 2, remainingSec: 500, readyAtMs: null },
        { id: "z", isRush: false, sentAtMs: 3, remainingSec: -10, readyAtMs: null }, { id: "w", isRush: true, sentAtMs: 4, remainingSec: 100, readyAtMs: null },
        { id: "v", isRush: false, sentAtMs: 5, remainingSec: 30, readyAtMs: null },
      ].map((x) => Object.freeze(x)));
      const rd2 = Object.freeze([{ id: "r1", isRush: false, sentAtMs: 1, remainingSec: 0, readyAtMs: 300 }, { id: "r2", isRush: true, sentAtMs: 2, remainingSec: 0, readyAtMs: 100 }].map((x) => Object.freeze(x)));
      for (const [col, inp, want] of [["NEW", nw, "c,a,b"], ["COOKING", ck, "w,y,z,v,x"], ["READY", rd2, "r2,r1"]] as [string, readonly Any[], string][]) {
        const before = inp.map((x) => x.id).join(",");
        const got = callSync(shared, "sortColumn", col, inp);
        if (ids(got) !== want) p.push(`sortColumn(${col}) = ${ids(got)} (คาด ${want})`);
        if (inp.map((x) => x.id).join(",") !== before) p.push(`sortColumn(${col}) แก้อินพุต`);
      }
    }
    for (const c of NEW_CODES) {
      const k = callSync(shared, "kdsRefusalMessageKey", c);
      if (k !== camelKey(c)) p.push(`kdsRefusalMessageKey(${c}) = ${short(k, 40)} (คาด ${camelKey(c)})`);
    }
    const ku = callSync(shared, "kdsRefusalMessageKey", "SOMETHING_ELSE");
    if (ku !== "errors.unknown") p.push(`kdsRefusalMessageKey(แปลก) = ${short(ku, 40)} (คาด errors.unknown)`);
    chk("T3", p.length === 0, "ใหม่ตาม sentAt · กำลังทำ เร่งก่อน+เหลือน้อยก่อน · พร้อมตาม readyAt · คีย์ข้อความ", P8(p) || "ครบ");
  }
  // P2 ตัวเรนเดอร์ใบครัว
  {
    const p: string[] = [];
    if (!slipMod) p.push(`${MISSING} kitchen-slip-render.ts`);
    const h1 = callSync(slipMod, "renderKitchenSlipHtml", SAMPLE_SLIP, { paper: "80", locale: "th" });
    const h2 = callSync(slipMod, "renderKitchenSlipHtml", SAMPLE_SLIP, { paper: "80", locale: "th" });
    if (typeof h1 !== "string") p.push(`renderKitchenSlipHtml → ${codeOf(h1)} ${short(h1?.message ?? "", 60)}`);
    else {
      if (h1 !== h2) p.push("HTML สองครั้งไม่เหมือนกัน (มีนาฬิกา/สุ่ม)");
      for (const w of ["ครัวร้อน", "กะเพราหมูกรอบ", "ไม่ใส่ถั่ว", "เผ็ดกลาง", "ไข่ดาว"]) if (!h1.includes(w)) p.push(`HTML ไม่มี "${w}"`);
      if (/฿|satang|price/i.test(h1)) p.push("HTML มีเงิน/ราคา");
      if (h1.includes("พิมพ์ซ้ำ")) p.push('HTML ต้นฉบับมีคำว่า "พิมพ์ซ้ำ"');
      const hc = callSync(slipMod, "renderKitchenSlipHtml", { ...SAMPLE_SLIP, copy: true }, { paper: "80", locale: "th" });
      if (typeof hc !== "string" || !hc.includes("พิมพ์ซ้ำ")) p.push('copy:true ไม่มีป้าย "พิมพ์ซ้ำ"');
    }
    const e1 = callSync(slipMod, "renderKitchenSlipEscPos", SAMPLE_SLIP, { paper: "80", thaiText: "raster" });
    const e2 = callSync(slipMod, "renderKitchenSlipEscPos", SAMPLE_SLIP, { paper: "80", thaiText: "raster" });
    const b1 = bytesOf(e1);
    const b2 = bytesOf(e2);
    if (!b1 || !b1.length) p.push(`renderKitchenSlipEscPos → ${b1 ? "ว่าง" : `${codeOf(e1)} ${short(e1?.message ?? "", 60)}`}`);
    else if (!b2 || Buffer.compare(Buffer.from(b1), Buffer.from(b2)) !== 0 || short(e1?.rasterSlots ?? null, 4000) !== short(e2?.rasterSlots ?? null, 4000)) p.push("ESC/POS สองครั้งไม่เหมือนกัน");
    chk("P2", p.length === 0, "HTML/ESC/POS คงที่ · มีสถานี/รายการ/โน้ต/ตัวเลือก · ไม่มีเงิน · ป้ายพิมพ์ซ้ำ", P8(p) || `ครบ (${b1?.length ?? 0} ไบต์)`);
  }
  // P3 คีย์ใบครัวใน parsePrinterConfig
  {
    const p: string[] = [];
    const cfgOf = (r: Any): Any => (r?.ok === true ? r.config : null);
    const r1 = callSync(devShared, "parsePrinterConfig", { kitchenSlip: "after-sale", kitchenStationIds: ["s1", "s2"] });
    const c1 = cfgOf(r1);
    if (!c1) p.push(`parse(kitchenSlip after-sale) → ${codeOf(r1)} ${short(r1?.message ?? "", 60)}`);
    else {
      if (c1.kitchenSlip !== "after-sale" || short(c1.kitchenStationIds) !== '["s1","s2"]') p.push(`kitchenSlip/kitchenStationIds = ${short([c1.kitchenSlip, c1.kitchenStationIds], 80)}`);
      for (const [k, v] of Object.entries(PRINTER_DEFAULTS_BASE)) if (c1[k] !== v) p.push(`คีย์เดิม ${k} = ${short(c1[k])} (คาด ${short(v)})`);
    }
    const r2 = cfgOf(callSync(devShared, "parsePrinterConfig", { kitchenSlip: "off", kitchenStationIds: [] }));
    if (!r2 || r2.kitchenSlip !== "off" || short(r2.kitchenStationIds) !== "[]") p.push(`parse(off, []) = ${short(r2, 80)}`);
    for (const [field, bad] of [["kitchenSlip", { kitchenSlip: "always" }], ["kitchenStationIds", { kitchenStationIds: "x" }], ["kitchenStationIds", { kitchenStationIds: [1] }]] as [string, Any][]) {
      const r = callSync(devShared, "parsePrinterConfig", bad);
      if (!(r?.ok === false && r.code === "VALIDATION" && (r.field === field || String(r.message ?? "").includes(field)))) p.push(`${short(bad, 40)} → ${codeOf(r)} ${short(r?.field ?? "", 30)} (คาด VALIDATION field ${field})`);
    }
    for (const v of [undefined, { paper: "58" }]) {
      const c = cfgOf(callSync(devShared, "parsePrinterConfig", v));
      if (c && ("kitchenSlip" in c || "kitchenStationIds" in c)) p.push(`parse(${short(v ?? "undefined", 20)}) เติมคีย์ใบครัวเอง (CD: เพิ่มเฉพาะเมื่อส่งมา — qc-pos-p1.10 PC1/G4)`);
    }
    chk("P3", p.length === 0, "kitchenSlip/kitchenStationIds ผ่านตรงตัว · ค่าผิด VALIDATION ระบุฟิลด์ · ไม่ส่ง = ไม่มีคีย์", P8(p) || "ครบ");
  }
  // L4 PAR ค่าตั้งเครื่องพิมพ์เดิม
  {
    const p: string[] = [];
    const D0 = devShared?.POS_PRINTER_DEFAULTS;
    if (!isRecord(D0)) p.push(`${MISSING} POS_PRINTER_DEFAULTS`);
    else for (const [k, v] of Object.entries(PRINTER_DEFAULTS_BASE)) if (D0[k] !== v) p.push(`POS_PRINTER_DEFAULTS.${k} = ${short(D0[k])}`);
    const exact = (a: Any, b: Record<string, unknown>) => isRecord(a) && Object.keys(b).every((k) => a[k] === b[k]) && Object.keys(a).every((k) => k in b);
    for (const v of [undefined, null, {}]) {
      const r = callSync(devShared, "parsePrinterConfig", v);
      if (!exact(r?.config, PRINTER_DEFAULTS_BASE)) p.push(`parse(${short(v ?? String(v), 10)}) = ${short(r?.config ?? r, 120)}`);
    }
    const full = { paper: "58", mode: "escpos-usb", autoPrint: true, drawerKick: true, thaiText: "tis620", copies: 2 };
    const rf = callSync(devShared, "parsePrinterConfig", { ...full, foo: 1 });
    if (!exact(rf?.config, full)) p.push(`ค่าครบ+คีย์แปลก = ${short(rf?.config ?? rf, 120)}`);
    chk("L4", p.length === 0, "ค่าปริยาย 6 คีย์เดิม · ค่าครบผ่าน · คีย์แปลกทิ้ง", P8(p) || "ครบ");
  }
}

// ═════════════════════════ 1c. --no-db ═════════════════════════
const loadShared = async () => (existsSync(join(ROOT, F.kdsShared)) && purePath(F.kdsShared) ? await tryImport("@/lib/modules/pos/kds-shared") : null);
const loadSlip = async () => (existsSync(join(ROOT, F.slipRender)) && purePath(F.slipRender) ? await tryImport("@/lib/modules/pos/kitchen-slip-render") : null);
const loadDevShared = async () => (purePath(F.devShared) ? await tryImport("@/lib/modules/pos/device-shared") : null);
if (NODB) {
  const ids = [...STATIC_IDS, ...PURE_IDS];
  console.log(`[${SUITE}] --no-db: รัน ${ids.length} ข้อ (สถิต + บริสุทธิ์ · ไม่โหลด prisma)`);
  let crashedS = "";
  try {
    await runStatic();
    for (const f of [F.kdsShared, F.slipRender]) if (existsSync(join(ROOT, f)) && !purePath(f)) console.log(`  ⚠️  ${f.split("/").pop()} ไม่บริสุทธิ์ — --no-db ไม่โหลด`);
    await runPure(await loadShared(), await loadSlip(), await loadDevShared());
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of ids) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, missing: skipReasons, depP24, depP28 })}`);
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
const MARK: Any = typeof P.posAvailabilityMark?.findMany === "function" ? P.posAvailabilityMark : null;
if (!MARK) skipReasons.push("Prisma client ยังไม่มี delegate posAvailabilityMark");
const PO: Any = typeof P.posOrder?.findMany === "function" ? P.posOrder : null;
const POE: Any = typeof P.posOrderEvent?.findMany === "function" ? P.posOrderEvent : null;
if (!PO) depP28.push("Prisma client ยังไม่มี delegate posOrder");
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('RestaurantOrder','RestaurantSetting','PosAvailabilityMark','PosOrder')`)) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const COL = {
  ro: RO_NEW.every(([c]) => dbCols.has(`RestaurantOrder.${c}`)),
  aa: dbCols.has("RestaurantSetting.autoAcceptMaxOpen"),
  mark: dbCols.has("PosAvailabilityMark.productId"),
};
if (!COL.ro) skipReasons.push("ฐาน QC4 ยังไม่มีคอลัมน์ลิงก์ของ RestaurantOrder (posSaleId …)");
if (!COL.aa) skipReasons.push("ฐาน QC4 ยังไม่มีคอลัมน์ RestaurantSetting.autoAcceptMaxOpen");
if (!COL.mark) skipReasons.push("ฐาน QC4 ยังไม่มีตาราง PosAvailabilityMark");
if (!dbCols.has("PosOrder.id")) depP28.push("ฐาน QC4 ยังไม่มีตาราง PosOrder");

const FP_TABLES: [string, string][] = [["RestaurantOrder", "updatedAt"], ["RestaurantOrderItem", "updatedAt"], ["MenuItem", "updatedAt"], ["PosProduct", "updatedAt"]];
/** ลายนิ้วมือของร้านที่ไม่ใช่ร้านชั่วคราวของข้อสอบนี้ (ข้อมูล — lane อื่นเขียนพร้อมกันได้) */
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h
         FROM "${tb}" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE 'posqc-p26-%'))`,
      )) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      out[tb] = `err:${(e as Error).message.slice(0, 40)}`;
    }
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.6 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล · L เขียว)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, depP24, depP28 })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · L เขียว)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ex = (f: string) => existsSync(join(ROOT, f));
const sharedMod = await loadShared();
const slipMod = await loadSlip();
const devSharedMod = await loadDevShared();
const kdsMod = ex(F.kds) ? await tryImport("@/lib/modules/pos/kds") : null;
const catalog = await tryImport("@/lib/modules/pos/catalog");
const register = await tryImport("@/lib/modules/pos/register");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const chMod = await tryImport("@/lib/modules/pos/channel");
const tableMod = ex(F.restTable) ? await tryImport("@/lib/modules/pos/table") : null;
const heldMod = await tryImport("@/lib/modules/pos/held-cart");
const orderMod = ex(F.orderMod) ? await tryImport("@/lib/modules/pos/order") : null;
const adaptersMod = ex(F.orderAdapters) ? await tryImport("@/lib/modules/pos/order-adapters") : null;
const invSvc = await tryImport("@/lib/modules/inventory/service");
const menu = await tryImport("@/lib/modules/restaurant/menu");
const rtable = await tryImport("@/lib/modules/restaurant/table");
const rorder = await tryImport("@/lib/modules/restaurant/order");
const rkds = await tryImport("@/lib/modules/restaurant/kds");
const storefront = await tryImport("@/lib/modules/restaurant/storefront");
const sysSvc = await tryImport("@/lib/modules/system/service");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p2.6-${RAND}`;
const T_SLUG = `posqc-p26-${RAND}`;
const T2_SLUG = `posqc-p26-${RAND}-t2`;
const EMAIL_PREFIX = `${T_SLUG}-`;
const KEY_PREFIX = `qc26-${RAND}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";
const RUN_START = Date.now();
const MIN = 60_000;
const MY_SALES: string[] = [];
const bizToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

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

// ── ตัวดัก SQL (L2 — แบบ qc-pos-p1.1 S2.42: ห่อ pg.Client.prototype.query) ──
const sqlLog: string[] = [];
let sqlOn = false;
let sqlTapOk = false;
async function installSqlTap(): Promise<void> {
  try {
    const pgMod: Any = await import("pg" as string);
    const pgc: Any = pgMod.default ?? pgMod;
    const proto: Any = pgc?.Client?.prototype;
    if (proto && typeof proto.query === "function" && !proto.__qcP26Tap) {
      const orig = proto.query;
      proto.query = function (this: Any, ...args: Any[]) {
        if (sqlOn) {
          const a = args[0];
          sqlLog.push(typeof a === "string" ? a : String(a?.text ?? ""));
        }
        return orig.apply(this, args);
      };
      proto.__qcP26Tap = true;
    }
    sqlOn = true;
    sqlLog.length = 0;
    await P.tenant.findFirst({ where: { id: T || "none" }, select: { id: true } });
    sqlOn = false;
    sqlTapOk = sqlLog.some((s) => /"Tenant"/.test(s));
  } catch {
    sqlOn = false;
    sqlTapOk = false;
  }
}
async function traceSql(fn: () => Promise<unknown>): Promise<{ r: Any; err: string; sql: string[] }> {
  sqlLog.length = 0;
  sqlOn = true;
  try {
    const r = await fn();
    return { r, err: "", sql: [...sqlLog] };
  } catch (e) {
    return { r: null, err: String((e as Error)?.message ?? e).slice(0, 120), sql: [...sqlLog] };
  } finally {
    sqlOn = false;
  }
}

/** สถานะตั๋วอ้างอิงของข้อสอบเอง (R5 — ไม่ใช้ของผู้สร้าง) */
function refState(sts: string[]): string | null {
  const live = sts.filter((s) => s !== "CANCELLED");
  if (!live.length) return null;
  if (live.every((s) => s === "SERVED")) return "SERVED";
  if (live.every((s) => s === "READY" || s === "SERVED")) return "READY";
  if (live.every((s) => s === "NEW")) return "NEW";
  return "COOKING";
}
function refSource(r: Any): string {
  if (r?.posOrderId) return "ONLINE";
  if (r?.posSaleId) return "REGISTER";
  if (r?.sessionId && r?.placedByUserId) return "TABLE";
  if (r?.sessionId) return "QR";
  return "LEGACY";
}
/** ลำดับคอลัมน์อ้างอิง (R7) */
function refSort(col: string, ts: Any[]): string[] {
  const key = (t: Any) => `${t.orderId}|${t.stationId}`;
  const arr = [...ts];
  if (col === "NEW") arr.sort((a, b) => msOf(a.sentAt) - msOf(b.sentAt) || byId(key(a), key(b)));
  else if (col === "COOKING") arr.sort((a, b) => Number(!!b.isRush) - Number(!!a.isRush) || Number(a.remainingSec) - Number(b.remainingSec) || byId(key(a), key(b)));
  else arr.sort((a, b) => msOf(a.readyAt) - msOf(b.readyAt) || byId(key(a), key(b)));
  return arr.map(key);
}
const TICKET_KEYS = ["orderId", "stationId", "no", "source", "label", "isRush", "state", "sentAt", "elapsedSec", "targetMinutes", "remainingSec", "late", "warn", "lines", "doneCount", "lineCount"];
const LINE_KEYS = ["itemId", "qty", "name", "options", "note", "done", "cancelled"];
const BOARD_KEYS = ["stations", "tickets", "servedToday", "pending", "avgMinutes", "targetMinutes", "paused", "eightySix", "serverNow"];
const MONEY_KEY = /satang|price|total|amount|baht/i;
function moneyKeys(o: unknown, pre = ""): string[] {
  if (Array.isArray(o)) return o.flatMap((v, i) => moneyKeys(v, `${pre}[${i}]`));
  if (!isRecord(o)) return [];
  return Object.entries(o).flatMap(([k, v]) => [...(MONEY_KEY.test(k) ? [`${pre}.${k}`] : []), ...moneyKeys(v, `${pre}.${k}`)]);
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} ──`);
  console.log("   สาขา A (RESTAURANT · POS + คลัง · สถานี ครัวร้อน/เครื่องดื่ม/ขนม · โต๊ะ A1–A4 · kdsCriticalMins 10 · ช่องทาง LINEMAN + CHAT) · สาขา B (SHOP · ไม่มีสถานี) · ร้าน T2 สาขา X (POS · สถานี · เมนู · รอบเดิม)");
  let fx = "";
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean>; name: string }> = {};
  const ST: Record<string, string> = {}; // hot drink dessert
  const MI: Record<string, string> = {}; // เมนู → MenuItem.id
  const PP: Record<string, string> = {}; // ชื่อเล่น → PosProduct.id
  const CHO: Record<string, string> = {}; // ตัวเลือก → MenuOptionChoice.id
  const TB: Record<string, string> = {};
  const QR: Record<string, string> = {};
  const CHN: Record<string, string> = {}; // ช่องทาง
  const X: Record<string, string> = {}; // ของร้าน T2
  const NAME: Record<string, string> = {};
  try {
    T = (await P.tenant.create({ data: { name: `QC P2.6 ครัว ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P2.6 ร้านที่สอง ${RAND}`, slug: T2_SLUG } })).id;
    U.A = (await P.businessUnit.create({ data: { tenantId: T, type: "RESTAURANT", name: `${TAG} สาขาA`, slug: `${T_SLUG}-a` } })).id;
    U.B = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาB`, slug: `${T_SLUG}-b` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "RESTAURANT", name: `${TAG} สาขาX`, slug: `${T2_SLUG}-x` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
    S.INV = (await sysSvc.createSystem(T, "INVENTORY", `คลัง ${RAND}`)).id;
    S.POS2 = (await sysSvc.createSystem(T2, "POS", `POS T2 ${RAND}`)).id;
    for (const u of [U.A, U.B]) {
      await sysSvc.linkUnit(T, S.POS, u);
      await sysSvc.linkUnit(T, S.INV, u);
    }
    await sysSvc.linkUnit(T2, S.POS2, U.X);
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
  }
  const spec: [string, string, string[], Record<string, boolean>][] = [
    ["OWNER", "OWNER", ["*"], {}],
    ["MGR", "MANAGER", [U.A ?? "-"], {}],
    ["CASHIER", "STAFF", [U.A ?? "-"], { "pos.sale.create": true }],
    ["COOK", "STAFF", [U.A ?? "-"], { "restaurant.kds.advance": true, "restaurant.kds.recall": true }],
    ["NOPERM", "STAFF", [U.A ?? "-"], {}],
  ];
  if (!fx) {
    try {
      for (const [k, role, unitAccess, perms] of spec) {
        const name = `${k} คิวซี${RAND}`;
        const u = await P.user.create({ data: { email: `${EMAIL_PREFIX}${k.toLowerCase()}@qc.invalid`, name } });
        await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess, permissions: perms, acceptedAt: new Date() } });
        US[k] = { id: u.id, role, unitAccess, perms, name };
      }
    } catch (e) {
      fx = `ผู้ใช้:${(e as Error).message.slice(0, 140)}`;
    }
  }
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const cc = (k: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", actorUserId: uid(k) });
  const DEV1 = `qc26${RAND}d1`;
  const DEVB = `qc26${RAND}db`;
  const ctxA = (dev?: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", unitId: U.A ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const ctxB = (dev?: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", unitId: U.B ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? r?.reason ?? r?.err ?? "", 80)}`);
    return r;
  };
  const soft: string[] = [];

  // ─── สถานี · ค่าตั้ง · เมนู · ตัวเลือก ───
  if (!fx) {
    try {
      for (const nm of ["ครัวร้อน", "เครื่องดื่ม", "ขนม"]) must(`createStation ${nm}`, await menu.createStation(T, U.A, nm));
      for (const s of (await menu.listStations(T, U.A)) as Any[]) ST[s.name === "ครัวร้อน" ? "hot" : s.name === "เครื่องดื่ม" ? "drink" : "dessert"] = s.id;
      if (!ST.hot || !ST.drink || !ST.dessert) throw new Error(`สถานีไม่ครบ ${short(ST, 80)}`);
      await menu.updateSetting(T, U.A, { kdsCriticalMins: 10 });
      const cat = must("createCategory", await menu.createCategory(T, U.A, { name: `อาหาร ${RAND}` }, uid("OWNER")));
      const grp = must("createOptionGroup", await menu.createOptionGroup(T, U.A, { name: `เพิ่มเติม ${RAND}`, minSelect: 0, maxSelect: 2, choices: [{ name: "เผ็ดกลาง", priceDelta: 0 }, { name: "ไข่ดาว", priceDelta: 1000 }] }));
      for (const c of (await P.menuOptionChoice.findMany({ where: { tenantId: T, groupId: grp.id } })) as Any[]) CHO[c.name === "ไข่ดาว" ? "egg" : "spicy"] = c.id;
      const mk = async (key: string, name: string, basePrice: number, stationId: string, o: Any = {}) => {
        const r = must(`createItem ${key}`, await menu.createItem(T, U.A, { categoryId: cat.id, stationId, name, basePrice, ...o }, uid("OWNER")));
        MI[key] = r.id;
        NAME[key] = name;
        PP[key] = String((await P.menuItem.findUnique({ where: { id: r.id }, select: { posProductId: true } }))?.posProductId ?? "");
        if (!PP[key]) throw new Error(`เมนู ${key} ไม่มี posProductId (POS ไม่ผูกสาขา?)`);
      };
      await mk("kaprao", `กะเพราหมูกรอบ ${RAND}`, 8900, ST.hot, { prepMinutes: 8, optionGroupIds: [grp.id] });
      await mk("chayen", `ชาไทยเย็น ${RAND}`, 4500, ST.drink);
      await mk("croissant", `ครัวซองต์ ${RAND}`, 9500, ST.dessert, { stockQty: 1 });
      await mk("khanomkrok", `ขนมครก ${RAND}`, 4000, ST.dessert, { stockQty: 5 });
      await mk("padthai", `ผัดไทย ${RAND}`, 9000, ST.hot);
      await mk("somtam", `ส้มตำ ${RAND}`, 6000, ST.hot, { stockQty: 3, dailyStockQty: 3 });
      await mk("s1", `${TAG} s242-1`, 5000, ST.hot, { stockQty: 1 });
      await mk("s0", `${TAG} s242-0`, 5000, ST.hot, { stockQty: 0 });
      await mk("sc", `${TAG} s242-c`, 5000, ST.hot, { stockQty: 5 });
    } catch (e) {
      fx = `เมนู:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── สินค้าไม่ใช่เมนู (คลัง → PRODUCT) ───
  if (!fx) {
    try {
      const inv = async (key: string, name: string, price: number) => {
        const ictx = { tenantId: T, systemId: S.INV, actorUserId: uid("OWNER") };
        const it = await invSvc.createItem(ictx, { sku: `${KEY_PREFIX}-${key}`, name, unitLabel: "ชิ้น", costSatang: 100 });
        await invSvc.receive(ictx, { itemId: it.id, qty: 100, costSatang: 100, idempotencyKey: `${KEY_PREFIX}-recv-${key}` });
        PP[key] = String((await P.posProduct.findFirst({ where: { tenantId: T, systemId: S.POS, invItemId: it.id }, select: { id: true } }))?.id ?? "");
        NAME[key] = name;
        if (!PP[key]) throw new Error(`${key} ไม่มีแถว PRODUCT (P1.1b)`);
        must(`setPrice ${key}`, await call(catalog, "setPrice", cc("OWNER"), PP[key], price));
      };
      await inv("water", `น้ำเปล่า ${RAND}`, 1000);
      await inv("beans", `เมล็ดกาแฟ ${RAND}`, 25000);
      await inv("cookie", `คุกกี้ ${RAND}`, 3500);
      // มติ 4: สินค้าไม่ใช่เมนูเข้าครัวเมื่อ PosProduct.stationId ตั้ง (ผู้เขียน updateProduct({stationId}) · pos.product.manage)
      const up = await call(catalog, "updateProduct", cc("OWNER"), PP.cookie, { stationId: ST.dessert });
      if (up?.ok === false) soft.push(`updateProduct({stationId}) คุกกี้ → ${codeOf(up)} ${short(up.message ?? "", 60)}`);
    } catch (e) {
      fx = `สินค้า:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── โต๊ะ · ช่องทาง · เครื่อง + กะ · ร้าน T2 ───
  if (!fx) {
    try {
      const z = must("zone", await rtable.createZone(T, U.A, `ในร้าน ${RAND}`));
      for (const nm of ["A1", "A2", "A3", "A4"]) {
        const r = must(`table ${nm}`, await rtable.createTable(T, U.A, { zoneId: z.id, name: nm, seats: 4 }));
        TB[nm] = r.id;
        QR[nm] = r.qrToken;
      }
      for (const [u, key] of [[U.A, "A"], [U.B, "B"]] as const) {
        const r = await call(chMod, "ensureUnitChannels", P, { tenantId: T, systemId: S.POS, unitId: u });
        if (!Array.isArray(r)) throw new Error(`ensureUnitChannels ${key}: ${codeOf(r)}`);
        for (const c of r as Any[]) CHN[`${c.code}_${key}`] = c.id;
      }
      const lm = must("saveChannel LINEMAN", await call(chMod, "saveChannel", ctxA(), A("OWNER"), { code: "LINEMAN", name: `LINE MAN ${RAND}`, commissionBp: 3000 }));
      CHN.LM = String(lm.channel?.id ?? "");
      NAME.LM = `LINE MAN ${RAND}`;
      for (const [dev, ctx, label] of [[DEV1, ctxA, "A"], [DEVB, ctxB, "B"]] as const) {
        const rg = await call(devMod, "registerDevice", ctx(), A("OWNER"), { name: `เคาน์เตอร์ QC P2.6 ${label}`, deviceCode: dev });
        if (rg?.ok !== true) soft.push(`registerDevice ${label}: ${codeOf(rg)}`);
        const o = await call(shiftMod, "openShift", ctx(dev), A("OWNER"), { deviceId: dev, deviceLabel: `เคาน์เตอร์ QC P2.6 ${label}`, floatSatang: 0 });
        if (o?.ok !== true) throw new Error(`เปิดกะ ${label}: ${codeOf(o)} ${short(o?.message ?? "", 60)}`);
      }
      // ร้าน T2: สถานี + เมนู + รอบเดิม (เป้าของ TICKET_NOT_FOUND / PRODUCT_NOT_FOUND)
      must("T2 station", await menu.createStation(T2, U.X, "ครัว"));
      X.station = String(((await menu.listStations(T2, U.X)) as Any[])[0]?.id ?? "");
      const c2 = must("T2 category", await menu.createCategory(T2, U.X, { name: `หมวด T2 ${RAND}` }));
      const m2 = must("T2 item", await menu.createItem(T2, U.X, { categoryId: c2.id, stationId: X.station, name: `เมนู T2 ${RAND}`, basePrice: 5000 }));
      X.menu = m2.id;
      X.product = String((await P.menuItem.findUnique({ where: { id: m2.id }, select: { posProductId: true } }))?.posProductId ?? "");
      const o2 = must("T2 order", await rorder.createOrder({ tenantId: T2, unitId: U.X, type: "TAKEAWAY", cart: [{ menuItemId: m2.id, qty: 1, choiceIds: [] }], placedByUserId: uid("OWNER") }));
      X.order = String(o2.id);
      X.item = String(((await P.restaurantOrderItem.findMany({ where: { tenantId: T2, orderId: X.order } })) as Any[])[0]?.id ?? "");
    } catch (e) {
      fx = `โต๊ะ/ช่องทาง/กะ/T2:${(e as Error).message.slice(0, 160)}`;
    }
  }
  if (fx) console.log(`  ⚠️  fixture: ${fx}`);
  if (soft.length) console.log(`  ⚠️  fixture (อ่อน — ข้อที่เกี่ยวข้องแดงตามเหตุผล): ${soft.join(" · ")}`);
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NCOL = () => (!COL.ro ? `${MISSING} คอลัมน์ลิงก์ RestaurantOrder · ` : "") + (!COL.mark ? `${MISSING} ตาราง PosAvailabilityMark · ` : "");
  const NK = (...names: string[]) => names.filter((n) => typeof kdsMod?.[n] !== "function").map((n) => `${MISSING} ${n} · `).join("");

  // ─── ตัวช่วย ───
  let keyN = 0;
  const newKey = (pfx = "k") => `${KEY_PREFIX}-${pfx}-${++keyN}`;
  const ln = (key: string, qty: number, o: { choices?: string[]; note?: string } = {}): Any => ({
    productId: PP[key] ?? `none-${key}`,
    qty,
    ...(o.choices ? { options: o.choices.map((c) => ({ choiceId: CHO[c] ?? `none-${c}` })) } : {}),
    ...(o.note ? { note: o.note } : {}),
  });
  /** ขายหน้าร้าน: quote → submit (เงินสดพอดี) */
  const sell = async (lines: Any[], o: { actor?: string; ctx?: Any } = {}): Promise<{ saleId: string; r: Any; q: Any }> => {
    const ctx = o.ctx ?? ctxA(DEV1);
    const actor = A(o.actor ?? "CASHIER");
    const q = await call(register, "quoteRegisterCart", ctx, actor, { lines });
    if (q?.ok !== true) return { saleId: "", r: q, q };
    const grand = Number(q.grandTotalSatang);
    const r = await call(register, "submitRegisterSale", ctx, actor, { lines, idempotencyKey: newKey("s"), expectedGrandTotalSatang: grand, payMethods: [{ type: "CASH", amountSatang: grand }], cashReceivedSatang: grand });
    const saleId = r?.ok === true ? String(r.saleId ?? "") : "";
    if (saleId) MY_SALES.push(saleId);
    return { saleId, r, q };
  };
  const SALE_FAIL = (s: { saleId: string; r: Any }) => (s.saleId ? "" : `ขายไม่ผ่าน ${codeOf(s.r)} ${short(s.r?.message ?? "", 60)} · `);
  const roundsAll = async (tid = T): Promise<Any[]> => ((await P.restaurantOrder.findMany({ where: { tenantId: tid }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]);
  const roundsOfSale = async (saleId: string): Promise<Any[]> => (saleId ? (await roundsAll()).filter((r) => r.posSaleId === saleId) : []);
  const roundsOfOrder = async (orderId: string): Promise<Any[]> => (orderId ? (await roundsAll()).filter((r) => r.posOrderId === orderId) : []);
  const waitRounds = async (saleId: string, ms = 3000): Promise<Any[]> => {
    const t0 = Date.now();
    for (;;) {
      const rs = await roundsOfSale(saleId);
      if (rs.length || Date.now() - t0 > ms) return rs;
      await sleep(250);
    }
  };
  const itemsOf = async (orderId: string, tid = T): Promise<Any[]> =>
    orderId ? ((await P.restaurantOrderItem.findMany({ where: { tenantId: tid, orderId }, include: { options: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]) : [];
  const roundRow = async (id: string, tid = T): Promise<Any> => (id ? P.restaurantOrder.findFirst({ where: { tenantId: tid, id } }).catch(() => null) : null);
  const menuRow = async (key: string): Promise<Any> => (MI[key] ? P.menuItem.findUnique({ where: { id: MI[key] } }).catch(() => null) : null);
  const delRound = async (orderId: string) => {
    const its = (await P.restaurantOrderItem.findMany({ where: { tenantId: T, orderId }, select: { id: true } })) as Any[];
    await P.restaurantOrderItemOption.deleteMany({ where: { tenantId: T, orderItemId: { in: its.map((i) => i.id) } } });
    await P.restaurantOrderItem.deleteMany({ where: { tenantId: T, orderId } });
    await P.restaurantOrder.deleteMany({ where: { tenantId: T, id: orderId } });
  };
  const K = (fn: string, ...args: unknown[]) => call(kdsMod, fn, ...args);
  const O = (fn: string, ...args: unknown[]) => call(orderMod, fn, ...args);
  const board = (stationId: string, actor = "OWNER", ctx: Any = ctxA()) => K("kdsBoard", ctx, A(actor), { stationId });
  const ticketOf = (b: Any, orderId: string, stationId: string): Any => (Array.isArray(b?.tickets) ? (b.tickets as Any[]).find((t) => t.orderId === orderId && t.stationId === stationId) ?? null : null);
  const tk = (orderId: string, stationId: string) => ({ orderId, stationId });
  const obx = async (type: string): Promise<Any[]> => ((await P.outboxEvent.findMany({ where: { tenantId: T, type }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]);
  const availEvents = async (productId: string): Promise<Any[]> => (await obx("pos.product.availability")).filter((e) => isRecord(e.payload) && e.payload.productId === productId);
  const markOf = async (productId: string, unitId = U.A): Promise<Any> => (MARK ? MARK.findFirst({ where: { tenantId: T, unitId, productId } }).catch(() => null) : null);
  const markCount = async (): Promise<number> => (MARK ? Number(await MARK.count({ where: { tenantId: T } }).catch(() => -1)) : -1);
  const auditCount = async (action: string): Promise<number> => Number(await P.auditLog.count({ where: { tenantId: T, action } }).catch(() => -1));
  const outboxCount = async (): Promise<number> => Number(await P.outboxEvent.count({ where: { tenantId: T } }).catch(() => -1));
  const setAvail = (actor: string, productId: string, available: boolean, source: string, extra: Any = {}, ctx: Any = ctxA()) =>
    call(catalog, "setAvailability", ctx, A(actor), { productId, unitId: ctx.unitId, available, source, ...extra });
  const snapItems = async (orderId: string) => short((await itemsOf(orderId)).map((x) => [x.id, x.kdsStatus, x.qty, x.cancelledAt?.toISOString?.() ?? null, x.readyAt?.toISOString?.() ?? null, x.servedAt?.toISOString?.() ?? null, x.saleId]), 100_000);
  const replay = async (type: string, pred: (e: Any) => boolean, times = 2): Promise<string[]> => {
    const errs: string[] = [];
    const h = consMod?.consumers?.[type];
    const evs = (await obx(type)).filter(pred);
    if (!evs.length) errs.push(`ไม่พบ event ${type}`);
    else if (typeof h !== "function") errs.push(`ไม่มี consumers[${type}]`);
    else
      for (const ev of evs)
        for (let i = 0; i < times; i++)
          try {
            await h(ev);
          } catch (e) {
            errs.push(`replay ${type} ×${i + 1} throw ${(e as Error).message.slice(0, 60)}`);
          }
    return errs;
  };

  // ════════ L2 PAR ทางร้อน (ก่อนอย่างอื่น — ยังไม่มีบิล/คิวพื้นหลัง) ════════
  console.log("\n── L2 ทางร้อนของเดิม (ต้องเขียวทั้งก่อนและหลังสร้าง) ──");
  await drain();
  await sleep(400);
  await installSqlTap();
  await step("L2", async () => {
    const p: string[] = [];
    if (fx) throw new Error(`fixture: ${fx}`);
    if (!sqlTapOk) p.push("ตัวดัก SQL ใช้ไม่ได้ (คู่บวกไม่เห็นคำสั่ง)");
    const BASE = { createOrderOutOfStock: 13, cancelOrderItem: 6 };
    const cart = [{ menuItemId: MI.s1, qty: 1, choiceIds: [] }, { menuItemId: MI.s0, qty: 1, choiceIds: [] }];
    const callOos = () => rorder.createOrder({ tenantId: T, unitId: U.A, type: "TAKEAWAY", cart, placedByUserId: uid("MGR") });
    const warm = await callOos();
    const t1 = await traceSql(callOos);
    const t2 = await traceSql(callOos);
    const oos = (t: { r: Any }) => t.r?.ok === false && t.r?.err?.code === "OUT_OF_STOCK";
    if (warm?.ok !== false || !oos(t1) || !oos(t2)) p.push(`createOrder หมดพอดี → ${short(t1.r?.err ?? t1.r, 60)}`);
    if ((await menuRow("s1"))?.stockQty !== 1) p.push("s242-1 ไม่ถูก rollback");
    const o = await rorder.createOrder({ tenantId: T, unitId: U.A, type: "TAKEAWAY", cart: [{ menuItemId: MI.sc, qty: 1, choiceIds: [] }, { menuItemId: MI.sc, qty: 1, choiceIds: [] }, { menuItemId: MI.sc, qty: 1, choiceIds: [] }], placedByUserId: uid("MGR") });
    const its = o?.ok ? await itemsOf(String(o.id)) : [];
    if (its.length !== 3) p.push(`createOrder 3 บรรทัด → ${short(o, 60)}`);
    const c1 = await traceSql(() => rorder.cancelOrderItem(T, U.A, its[0]?.id ?? "none", "qc", uid("MGR")));
    const c2 = await traceSql(() => rorder.cancelOrderItem(T, U.A, its[1]?.id ?? "none", "qc", uid("MGR")));
    if (c1.r?.ok !== true || c2.r?.ok !== true) p.push(`cancelOrderItem → ${short(c1.r ?? c1.err, 60)}`);
    const n = { createOrderOutOfStock: t1.sql.length, cancelOrderItem: c1.sql.length };
    const stable = t1.sql.length === t2.sql.length && c1.sql.length === c2.sql.length;
    if (n.createOrderOutOfStock !== BASE.createOrderOutOfStock || n.cancelOrderItem !== BASE.cancelOrderItem || !stable) p.push(`จำนวนคำสั่ง ${JSON.stringify(n)} (รอบสอง ${t2.sql.length}/${c2.sql.length}) ≠ ฐาน ${JSON.stringify(BASE)}`);
    const touch = [t1, t2, c1, c2].flatMap((t) => t.sql).filter((s) => /"PosProduct"|"OutboxEvent"|"PosAvailabilityMark"/.test(s));
    if (touch.length) p.push(`ทางร้อนแตะ PosProduct/OutboxEvent/PosAvailabilityMark (${short(touch[0]!.replace(/\s+/g, " "), 60)})`);
    console.log(`  ℹ️  [L2] createOrder: ${t1.sql.map((s) => s.replace(/\s+/g, " ").slice(0, 40)).join(" ¦ ")}`);
    // advance/recall/queue ของเดิม
    const it3 = its[2]?.id ?? "none";
    const a1 = await rkds.advanceItem(T, U.A, it3, "COOKING");
    const a2 = await rkds.advanceItem(T, U.A, it3, "READY");
    const rc = await rkds.recallItem(T, U.A, it3);
    const back = await rkds.advanceItem(T, U.A, it3, "NEW");
    if (a1?.ok !== true || a2?.ok !== true || rc?.ok !== true || back?.ok !== false) p.push(`advance/recall เดิม ${short([a1, a2, rc, back], 120)}`);
    const q = (await rkds.stationQueue(T, U.A, ST.hot)) as Any[];
    if (!q.some((x) => x.id === it3)) p.push("stationQueue ไม่มีรายการ COOKING");
    const ex0 = (await rkds.expoQueue(T, U.A)) as Any[];
    if (!Array.isArray(ex0)) p.push("expoQueue ไม่คืนอาร์เรย์");
    // รายการที่ชำระผ่าน checkout เดิม → advanceItem ปฏิเสธ (ตัวควบคุมของ CD4)
    const os = await rtable.openSession(T, U.A, TB.A4, { guestCount: 1, openedByUserId: uid("MGR") });
    const lo = os?.ok ? await rorder.createOrder({ tenantId: T, unitId: U.A, type: "DINE_IN", sessionId: os.id, cart: [{ menuItemId: MI.sc, qty: 1, choiceIds: [] }], placedByUserId: uid("MGR") }) : null;
    const co = os?.ok ? await rorder.checkout({ tenantId: T, unitId: U.A, sessionId: os.id, payMethod: "CASH" }) : null;
    if (co?.ok && co.saleId) MY_SALES.push(String(co.saleId));
    const paid = lo?.ok ? (await itemsOf(String(lo.id)))[0] : null;
    const ap = paid ? await rkds.advanceItem(T, U.A, paid.id, "COOKING") : null;
    if (!paid?.saleId || ap?.ok !== false || ap?.reason !== "รายการนี้ชำระแล้ว") p.push(`advanceItem รายการที่ชำระแล้ว → ${short(ap ?? co ?? os, 80)}`);
    chk("L2", p.length === 0, "13/6 คงที่ · ไม่แตะ PosProduct/Outbox · advance/recall/queue เดิม · ปฏิเสธรายการที่ชำระแล้ว", P8(p) || `ครบ ${JSON.stringify(n)}`);
  });

  // ════════ K ตั๋ว ════════
  console.log("\n── K ตั๋วครัวจากทุกแหล่ง ──");
  const RD: Record<string, string> = {}; // รอบ (RestaurantOrder.id)
  const SL: Record<string, string> = {}; // บิล
  await step("K1", async () => {
    const p: string[] = [];
    const s = await sell([ln("kaprao", 2, { choices: ["spicy", "egg"], note: "ไม่ใส่ถั่ว" }), ln("chayen", 1), ln("water", 1)]);
    SL.K1 = s.saleId;
    const rs = await waitRounds(s.saleId);
    const r = rs[0];
    if (rs.length !== 1) p.push(`รอบของบิล = ${rs.length} (คาด 1)`);
    if (r) {
      RD.K1 = r.id;
      const want = { type: "TAKEAWAY", status: "CONFIRMED", sessionId: null, placedByUserId: uid("CASHIER") };
      for (const [k, v] of Object.entries(want)) if (r[k] !== v) p.push(`round.${k} = ${short(r[k], 30)} (คาด ${short(v, 30)})`);
      if (!(Number(r.dailyNo) >= 1)) p.push(`dailyNo ${r.dailyNo}`);
      const its = await itemsOf(r.id);
      const kap = its.find((x) => x.menuItemId === MI.kaprao);
      const cha = its.find((x) => x.menuItemId === MI.chayen);
      if (its.length !== 2) p.push(`รายการ ${its.length} (คาด 2: ไม่มีน้ำเปล่า)`);
      if (its.some((x) => x.productId === PP.water)) p.push("มีบรรทัดน้ำเปล่า (ไม่มีสถานี)");
      if (!kap || kap.stationId !== ST.hot || kap.qty !== 2 || kap.note !== "ไม่ใส่ถั่ว" || kap.productId !== PP.kaprao || kap.kdsStatus !== "NEW" || !String(kap.nameSnapshot).includes("กะเพรา"))
        p.push(`กะเพรา ${short(kap && { st: kap.stationId === ST.hot, qty: kap.qty, note: kap.note, pid: kap.productId === PP.kaprao, s: kap.kdsStatus, n: kap.nameSnapshot }, 140)}`);
      if (kap && setStr((kap.options as Any[]).map((o) => o.choiceSnapshot)) !== setStr(["เผ็ดกลาง", "ไข่ดาว"])) p.push(`ตัวเลือก ${short((kap.options as Any[]).map((o) => o.choiceSnapshot), 60)}`);
      if (!cha || cha.stationId !== ST.drink || cha.qty !== 1) p.push("ชาไทยไม่อยู่สถานีเครื่องดื่ม");
      if (its.some((x) => x.saleId !== null || x.settledAt !== null)) p.push("รายการของรอบหน้าร้านมี saleId/settledAt (CD: ทำอาหาร ≠ เก็บเงิน · ลิงก์อยู่ที่ round.posSaleId)");
      const b = await board(ST.hot);
      const t = ticketOf(b, r.id, ST.hot);
      if (!t) p.push(`บอร์ดครัวร้อนไม่มีตั๋ว (${codeOf(b)})`);
      else {
        if (t.source !== "REGISTER" || t.no !== r.dailyNo) p.push(`ตั๋ว source ${t.source} no ${t.no}`);
        const l0 = (t.lines as Any[])?.[0];
        if (!l0 || l0.note !== "ไม่ใส่ถั่ว" || setStr(l0.options ?? []) !== setStr(["เผ็ดกลาง", "ไข่ดาว"])) p.push(`บรรทัดตั๋ว ${short(l0, 120)}`);
      }
    }
    chk("K1", NCOL() === "" && p.length === 0, "1 รอบ TAKEAWAY · 2 ตั๋ว · ไม่มีน้ำ · สำเนาตัวเลือก/โน้ต · saleId รายการ null", FX(NCOL() + SALE_FAIL(s) + (P8(p) || "ครบ")));
  });
  await step("K2", async () => {
    const p: string[] = [];
    const s = await sell([ln("chayen", 1)]);
    SL.K2 = s.saleId;
    const r0 = (await waitRounds(s.saleId))[0];
    const a = await K("ticketForSale", T, U.A, s.saleId);
    const b = await K("ticketForSale", T, U.A, s.saleId);
    for (const x of [a, b]) if (x?.ok !== true || x.created !== false || (r0 && x.orderId !== r0.id)) p.push(`ticketForSale ซ้ำ → ${codeOf(x)} created ${short(x?.created)} orderId ${x?.orderId === r0?.id ? "เดิม" : short(x?.orderId, 20)}`);
    if (r0) await delRound(r0.id);
    const rs = await Promise.all([
      ...Array.from({ length: 10 }, () => K("healMissingTickets", T, U.A)),
      K("ticketForSale", T, U.A, s.saleId),
      K("ticketForSale", T, U.A, s.saleId),
    ]);
    const bad = rs.filter((x) => x?.ok !== true);
    if (bad.length) p.push(`${bad.length}/12 คำขอไม่ ok (${codeOf(bad[0])} ${short(bad[0]?.message ?? "", 50)})`);
    const after = await roundsOfSale(s.saleId);
    if (after.length !== 1) p.push(`หลังแข่ง heal ×10 + ticketForSale ×2 → รอบ ${after.length} (คาด 1)`);
    else RD.K2 = after[0].id;
    chk("K2", NCOL() === "" && NK("ticketForSale", "healMissingTickets") === "" && p.length === 0, "ซ้ำ = รอบเดิม · แข่ง = 1 รอบ", FX(NCOL() + NK("ticketForSale", "healMissingTickets") + SALE_FAIL(s) + (P8(p) || "ครบ")));
  });
  await step("K3", async () => {
    const p: string[] = [];
    const s1 = await sell([ln("water", 1), ln("beans", 1)]);
    const s2 = await sell([ln("cookie", 1)], { actor: "OWNER", ctx: ctxB(DEVB) });
    await sleep(1500);
    const hA = await K("healMissingTickets", T, U.A);
    const hB = await K("healMissingTickets", T, U.B);
    if (hA?.ok !== true || hB?.ok !== true) p.push(`healMissingTickets → ${codeOf(hA)}/${codeOf(hB)}`);
    if ((await roundsOfSale(s1.saleId)).length) p.push("บิลน้ำ+เมล็ดกาแฟได้รอบ");
    if ((await roundsOfSale(s2.saleId)).length) p.push("บิลสาขา B ได้รอบ");
    if ((await roundsAll()).some((r) => r.unitId === U.B)) p.push("มีรอบที่สาขา B");
    const ok = !!s1.saleId && !!s2.saleId;
    chk("K3", ok && NCOL() === "" && p.length === 0, "ไม่มีรอบ (ไม่มีสถานี / สาขาไม่มีสถานี)", FX(NCOL() + SALE_FAIL(s1) + SALE_FAIL(s2) + (P8(p) || "ครบ")));
  });
  await step("K4", async () => {
    const p: string[] = [];
    const s = await sell([ln("cookie", 2)]);
    const rs = await waitRounds(s.saleId);
    if (rs.length !== 1) p.push(`รอบ ${rs.length} (คาด 1 · คุกกี้มี stationId = ขนม)`);
    else {
      RD.K4 = rs[0].id;
      const its = await itemsOf(rs[0].id);
      if (its.length !== 1 || its[0].stationId !== ST.dessert || its[0].productId !== PP.cookie || its[0].menuItemId !== null || its[0].qty !== 2) p.push(`รายการ ${short(its.map((x) => [x.stationId === ST.dessert, x.productId === PP.cookie, x.menuItemId, x.qty]), 100)}`);
    }
    chk("K4", NCOL() === "" && p.length === 0, "สินค้าไม่ใช่เมนูที่ตั้งสถานี → ตั๋วที่ขนม", FX(NCOL() + soft.filter((x) => /stationId/.test(x)).join(" ") + SALE_FAIL(s) + (P8(p) || "ครบ")));
  });
  await step("K5", async () => {
    const dep = DEP_MSG("K5");
    if (dep) {
      chk("K5", false, "ของ P2.4 S อยู่บนฐาน", dep);
      return;
    }
    const p: string[] = [];
    const tbl = (fn: string, ...args: unknown[]) => call(tableMod, fn, ...args);
    const op = await tbl("registerOpenTable", ctxA(), A("OWNER"), { tableId: TB.A3, guestCount: 2 });
    const sid = String(op?.sessionId ?? "");
    const h = await call(heldMod, "holdRegisterCart", ctxA(DEV1), A("OWNER"), { cart: { lines: [ln("kaprao", 1)] }, tableSessionId: sid });
    const send = await tbl("registerSendTableRound", ctxA(DEV1), A("OWNER"), { tableSessionId: sid, heldCartId: String(h?.heldCart?.id ?? "") });
    if (send?.ok !== true) p.push(`ส่งรอบโต๊ะ → ${codeOf(send)} ${short(send?.message ?? "", 60)}`);
    else {
      RD.K5 = String(send.orderId);
      const t = ticketOf(await board(ST.hot), RD.K5, ST.hot);
      if (!t || t.source !== "TABLE" || !String(t.label ?? "").includes("A3") || t.staffName !== US.OWNER?.name) p.push(`ตั๋วโต๊ะ ${short(t && { source: t.source, label: t.label, staff: t.staffName }, 100)}`);
    }
    const q = await call(register, "quoteRegisterCart", ctxA(DEV1), A("OWNER"), { lines: [], tableSessionId: sid });
    const grand = q?.ok === true ? Number(q.grandTotalSatang) : 0;
    const pay = await call(register, "submitRegisterSale", ctxA(DEV1), A("OWNER"), { lines: [], tableSessionId: sid, expectedTableItemsHash: q?.table?.itemsHash ?? "none", idempotencyKey: newKey("tb"), expectedGrandTotalSatang: grand, payMethods: [{ type: "CASH", amountSatang: grand }], cashReceivedSatang: grand });
    if (pay?.ok !== true) p.push(`บิลโต๊ะ → ${codeOf(pay)} ${short(pay?.message ?? "", 60)}`);
    else {
      MY_SALES.push(String(pay.saleId));
      await sleep(1500);
      await K("healMissingTickets", T, U.A);
      if ((await roundsOfSale(String(pay.saleId))).length) p.push("บิลโต๊ะได้รอบเพิ่ม");
      const ofSession = (await roundsAll()).filter((r) => r.sessionId === sid);
      if (ofSession.length !== 1) p.push(`รอบของโต๊ะ ${ofSession.length} (คาด 1 = รอบที่ส่ง)`);
    }
    chk("K5", p.length === 0, "บิลโต๊ะไม่มีรอบเพิ่ม · รอบที่ส่ง = TABLE + staffName", FX(NCOL() + (P8(p) || "ครบ")));
  });
  await step("K6", async () => {
    const p: string[] = [];
    const os = await rtable.openSession(T, U.A, TB.A1, { guestCount: 2, openedByUserId: uid("MGR") });
    const tab = os?.ok ? await rorder.createOrder({ tenantId: T, unitId: U.A, type: "DINE_IN", sessionId: os.id, cart: [{ menuItemId: MI.kaprao, qty: 1, choiceIds: [] }], placedByUserId: uid("MGR") }) : null;
    const qr = await storefront.placeGuestOrder({ tenantId: T, unitId: U.A, qrToken: QR.A2, cart: [{ menuItemId: MI.kaprao, qty: 1, choiceIds: [CHO.spicy] }] });
    const leg = await rorder.createOrder({ tenantId: T, unitId: U.A, type: "TAKEAWAY", cart: [{ menuItemId: MI.chayen, qty: 1, choiceIds: [] }], placedByUserId: uid("MGR") });
    if (!tab?.ok || !qr?.ok || !leg?.ok) throw new Error(`ประตูเดิม ${short([tab, qr, leg], 120)}`);
    RD.TAB = String(tab.id);
    RD.QR = String(qr.id);
    RD.LEG = String(leg.id);
    SL.TABSESSION = String(os.id);
    const bh = await board(ST.hot);
    const bd = await board(ST.drink);
    const t1 = ticketOf(bh, RD.TAB, ST.hot);
    const t2 = ticketOf(bh, RD.QR, ST.hot);
    const t3 = ticketOf(bd, RD.LEG, ST.drink);
    if (!t1 || t1.source !== "TABLE" || !String(t1.label ?? "").includes("A1") || t1.staffName !== US.MGR?.name) p.push(`โต๊ะ ${short(t1 && { s: t1.source, l: t1.label, staff: t1.staffName }, 90) || `ไม่มี (${codeOf(bh)})`}`);
    if (!t2 || t2.source !== "QR" || !String(t2.label ?? "").includes("A2")) p.push(`QR ${short(t2 && { s: t2.source, l: t2.label }, 90) || "ไม่มี"}`);
    if (!t3 || t3.source !== "LEGACY") p.push(`หน้าเดิม ${short(t3 && { s: t3.source }, 60) || `ไม่มี (${codeOf(bd)})`}`);
    chk("K6", NK("kdsBoard") === "" && p.length === 0, "โต๊ะ/QR/หน้าเดิม อยู่คิวเดียว source ถูก", FX(NK("kdsBoard") + (P8(p) || "ครบ")));
  });
  const ON: Record<string, string> = {}; // ออเดอร์ออนไลน์
  await step("K7", async () => {
    const dep = DEP_MSG("K7");
    if (dep) {
      chk("K7", false, "ของ P2.8 S อยู่บนฐาน", dep);
      return;
    }
    const p: string[] = [];
    const lmRef = `LM-${RAND}`;
    const ing = await O("ingestOrder", ctxA(DEV1), A("OWNER"), { channelId: CHN.LM, externalRef: lmRef, idempotencyKey: newKey("lm"), lines: [{ productId: PP.kaprao, qty: 1 }, { productId: PP.chayen, qty: 1 }], customer: { name: "คุณเอก" }, fulfilment: "DELIVERY", startStatus: "NEW" });
    ON.LM = String(ing?.orderId ?? "");
    if (!ON.LM) throw new Error(`ingest LINEMAN → ${codeOf(ing)} ${short(ing?.message ?? "", 60)}`);
    if ((await roundsOfOrder(ON.LM)).length) p.push("NEW มีรอบแล้ว (ต้องสร้างตอนรับ)");
    const acc = await O("acceptOrder", ctxA(DEV1), A("OWNER"), { id: ON.LM });
    if (acc?.ok !== true) p.push(`accept → ${codeOf(acc)} ${short(acc?.message ?? "", 60)}`);
    const rs = await roundsOfOrder(ON.LM);
    if (rs.length !== 1) p.push(`รอบของออเดอร์ ${rs.length} (คาด 1)`);
    else {
      RD.LM = rs[0].id;
      const r = rs[0];
      const want = { channelCode: "LINEMAN", channelName: NAME.LM, externalRef: lmRef, targetMinutes: 15, type: "DELIVERY", status: "CONFIRMED" };
      for (const [k, v] of Object.entries(want)) if (r[k] !== v) p.push(`round.${k} = ${short(r[k], 30)} (คาด ${short(v, 30)})`);
      const xr = (await P.$queryRawUnsafe(`SELECT xmin::text AS x FROM "RestaurantOrder" WHERE id = $1`, r.id)) as Any[];
      const xo = (await P.$queryRawUnsafe(`SELECT xmin::text AS x FROM "PosOrder" WHERE id = $1`, ON.LM)) as Any[];
      if (!xr[0]?.x || xr[0]?.x !== xo[0]?.x) p.push(`xmin รอบ ${xr[0]?.x} ≠ ออเดอร์ ${xo[0]?.x} (ไม่ใช่ธุรกรรมเดียว)`);
    }
    const acc2 = await O("acceptOrder", ctxA(DEV1), A("OWNER"), { id: ON.LM });
    if (acc2?.ok === true && acc2.duplicated !== true) p.push("รับซ้ำได้ ok ใหม่");
    if ((await roundsOfOrder(ON.LM)).length !== 1) p.push("รับซ้ำได้รอบเพิ่ม");
    const saleId = String(acc?.saleId ?? (await PO?.findUnique({ where: { id: ON.LM } }))?.saleId ?? "");
    if (saleId) {
      MY_SALES.push(saleId);
      await sleep(1000);
      await K("healMissingTickets", T, U.A);
      if ((await roundsOfSale(saleId)).length) p.push("บิล PLATFORM ของออเดอร์ได้รอบเพิ่ม (heal ต้องข้าม sourceId)");
    }
    const ch = await O("ingestOrder", ctxA(DEV1), A("OWNER"), { channelId: CHN.CHAT_A, idempotencyKey: newKey("ch"), lines: [{ productId: PP.kaprao, qty: 1 }], customer: { name: "คุณบี" }, fulfilment: "PICKUP", paymentState: "UNPAID" });
    ON.CHAT = String(ch?.orderId ?? "");
    const cacc = ON.CHAT ? await O("acceptOrder", ctxA(DEV1), A("OWNER"), { id: ON.CHAT }) : ch;
    const crs = await roundsOfOrder(ON.CHAT);
    const cpo = ON.CHAT && PO ? await PO.findUnique({ where: { id: ON.CHAT } }) : null;
    if (cacc?.ok !== true || crs.length !== 1 || cpo?.paymentState !== "UNPAID") p.push(`CHAT รับแล้วยังไม่จ่าย → ${codeOf(cacc)} รอบ ${crs.length} ${cpo?.paymentState}`);
    else RD.CHAT = crs[0].id;
    const m = await O("ingestOrder", ctxA(DEV1), A("OWNER"), { channelId: CHN.LM, externalRef: `LM2-${RAND}`, idempotencyKey: newKey("lm2"), lines: [{ productId: PP.kaprao, qty: 1 }], customer: { name: "คุณซี" }, fulfilment: "PICKUP" });
    ON.LM2 = String(m?.orderId ?? "");
    if ((await roundsOfOrder(ON.LM2)).length !== 1) p.push(`ingest MANUAL (ACCEPTED) → ${codeOf(m)} รอบ ${(await roundsOfOrder(ON.LM2)).length}`);
    chk("K7", p.length === 0, "รอบในธุรกรรมรับ · ลิงก์ช่องทาง · รับซ้ำ = เดิม · DIRECT ยังไม่จ่ายก็มีตั๋ว", FX(NCOL() + (P8(p) || "ครบ")));
  });
  await step("K8", async () => {
    const p: string[] = [];
    const s = await sell([ln("croissant", 2)]);
    const rs = await waitRounds(s.saleId);
    const it = rs[0] ? (await itemsOf(rs[0].id))[0] : null;
    if (rs.length !== 1 || it?.qty !== 2 || it?.stationId !== ST.dessert) p.push(`รอบ ${rs.length} รายการ ${short(it && [it.qty, it.stationId === ST.dessert], 40)}`);
    await sleep(500);
    const m = await menuRow("croissant");
    if (m?.stockQty !== 0 || m?.isOutOfStock !== true) p.push(`MenuItem stockQty ${m?.stockQty} isOutOfStock ${m?.isOutOfStock} (คาด 0/true)`);
    const ev = await availEvents(PP.croissant);
    if (ev.length !== 1 || ev[0]?.payload?.available !== false || ev[0]?.payload?.source !== "STOCK") p.push(`event ${ev.length} ${short(ev.map((e) => e.payload), 120)}`);
    chk("K8", NCOL() === "" && p.length === 0, "บิลผ่าน · ตัวนับ 0 · 86 อัตโนมัติ · event STOCK 1", FX(NCOL() + SALE_FAIL(s) + (P8(p) || "ครบ")));
  });
  await step("K9", async () => {
    const p: string[] = [];
    const s = await sell([ln("chayen", 1)]);
    const r0 = (await waitRounds(s.saleId))[0];
    if (r0) await delRound(r0.id);
    const b = await board(ST.drink);
    if (b?.ok !== true) p.push(`kdsBoard → ${codeOf(b)}`);
    const rs = await roundsOfSale(s.saleId);
    if (rs.length !== 1) p.push(`อ่านบอร์ดแล้วรอบ ${rs.length} (คาด 1 — heal)`);
    else if (!ticketOf(b, rs[0].id, ST.drink)) p.push("รอบที่ heal ไม่อยู่บนบอร์ดรอบนั้น");
    const v = await sell([ln("chayen", 1)]);
    const v0 = (await waitRounds(v.saleId))[0];
    if (v0) await delRound(v0.id);
    const vd = await call(billsMod, "voidSaleByActor", ctxA(DEV1), A("OWNER"), { unitId: U.A, saleId: v.saleId, idempotencyKey: newKey("void"), reason: "ลูกค้ายกเลิก" });
    if (vd?.ok !== true) p.push(`void → ${codeOf(vd)}`);
    await drain();
    await board(ST.drink);
    if ((await roundsOfSale(v.saleId)).length) p.push("บิล VOIDED ได้รอบคืน");
    chk("K9", NCOL() === "" && NK("kdsBoard") === "" && p.length === 0, "heal ตอนอ่านบอร์ด · VOIDED ไม่ heal", FX(NCOL() + NK("kdsBoard") + SALE_FAIL(s) + (P8(p) || "ครบ")));
  });

  // ════════ B ปุ่มครัว ════════
  console.log("\n── B ปุ่มครัว (start · line · done · served · recall · rush) ──");
  const sB = fx ? { saleId: "", r: null, q: null } : await sell([ln("kaprao", 1), ln("kaprao", 1, { choices: ["egg"] }), ln("chayen", 1)]);
  RD.B = (await waitRounds(sB.saleId))[0]?.id ?? "";
  const itB = async () => {
    const its = await itemsOf(RD.B);
    return { hot: its.filter((x) => x.stationId === ST.hot), drink: its.filter((x) => x.stationId === ST.drink) };
  };
  const NB = () => (RD.B ? "" : `ไม่มีรอบของบิล B (${SALE_FAIL(sB) || "หลังขายไม่มีรอบ"}) · `);
  await step("B1", async () => {
    const p: string[] = [];
    const r = await K("kdsStart", ctxA(), A("COOK"), tk(RD.B, ST.hot));
    if (r?.ok !== true || r.changed !== 2) p.push(`kdsStart → ${codeOf(r)} changed ${short(r?.changed)} (คาด 2)`);
    const { hot, drink } = await itB();
    if (hot.length !== 2 || hot.some((x) => x.kdsStatus !== "COOKING" || !x.cookingAt)) p.push(`ครัวร้อน ${short(hot.map((x) => x.kdsStatus), 60)}`);
    if (drink.some((x) => x.kdsStatus !== "NEW")) p.push("เครื่องดื่มขยับ");
    const r2 = await K("kdsStart", ctxA(), A("COOK"), tk(RD.B, ST.hot));
    if (r2?.ok !== true || r2.changed !== 0) p.push(`ซ้ำ → ${codeOf(r2)} changed ${short(r2?.changed)} (คาด ok 0)`);
    chk("B1", NB() === "" && p.length === 0, "NEW→COOKING เฉพาะตั๋วนั้น · ซ้ำ changed 0", FX(NB() + NK("kdsStart") + (P8(p) || "ครบ")));
  });
  await step("B2", async () => {
    const p: string[] = [];
    const h0 = (await itB()).hot[0];
    const r = await K("kdsLineDone", ctxA(), A("COOK"), { itemId: h0?.id ?? "none" });
    if (r?.ok !== true || r.changed !== 1) p.push(`kdsLineDone → ${codeOf(r)} changed ${short(r?.changed)}`);
    const h = (await itB()).hot;
    if (h.find((x) => x.id === h0?.id)?.kdsStatus !== "READY" || !h.find((x) => x.id === h0?.id)?.readyAt) p.push("บรรทัดไม่ READY");
    const t = ticketOf(await board(ST.hot, "COOK"), RD.B, ST.hot);
    if (!t || t.state !== "COOKING" || t.doneCount !== 1 || t.lineCount !== 2) p.push(`ตั๋ว ${short(t && { state: t.state, done: t.doneCount, n: t.lineCount }, 80)} (คาด COOKING 1/2)`);
    else if (!(t.lines as Any[]).some((l) => l.itemId === h0?.id && l.done === true) || !(t.lines as Any[]).some((l) => l.itemId !== h0?.id && l.done === false)) p.push("lines[].done ไม่ตรง");
    chk("B2", NB() === "" && p.length === 0, "บรรทัด READY · ตั๋ว COOKING 1/2", FX(NB() + NK("kdsLineDone") + (P8(p) || "ครบ")));
  });
  await step("B5", async () => {
    const p: string[] = [];
    const before = (await itB()).hot;
    const ready0 = before.find((x) => x.kdsStatus === "READY")?.readyAt?.toISOString?.() ?? "";
    const rs = await Promise.all([K("kdsTicketDone", ctxA(), A("COOK"), tk(RD.B, ST.hot)), K("kdsTicketDone", ctxA(), A("COOK"), tk(RD.B, ST.hot))]);
    if (rs.some((x) => x?.ok !== true)) p.push(`ผล ${rs.map(codeOf).join("/")}`);
    const ch = sum(rs.map((x) => Number(x?.changed ?? NaN)));
    if (ch !== 1) p.push(`Σ changed = ${ch} (คาด 1)`);
    const after = (await itB()).hot;
    if (after.some((x) => x.kdsStatus !== "READY")) p.push(`ยังไม่ READY ${short(after.map((x) => x.kdsStatus), 40)}`);
    if ((after.find((x) => x.id === before.find((y) => y.kdsStatus === "READY")?.id)?.readyAt?.toISOString?.() ?? "") !== ready0) p.push("readyAt ของบรรทัดที่เสร็จก่อนถูกเขียนทับ");
    chk("B5", NB() === "" && p.length === 0, "แข่ง 2 คำขอ → มีผลครั้งเดียว", FX(NB() + NK("kdsTicketDone") + (P8(p) || "ครบ")));
  });
  await step("B3", async () => {
    const p: string[] = [];
    const s1 = await K("kdsServed", ctxA(), A("COOK"), tk(RD.B, ST.hot));
    if (s1?.ok !== true || s1.changed !== 2) p.push(`served ครัวร้อน → ${codeOf(s1)} changed ${short(s1?.changed)}`);
    if ((await itB()).hot.some((x) => x.kdsStatus !== "SERVED" || !x.servedAt)) p.push("ครัวร้อนไม่ SERVED");
    if ((await roundRow(RD.B))?.status !== "CONFIRMED") p.push(`รอบ ${(await roundRow(RD.B))?.status} ก่อนเครื่องดื่มเสิร์ฟ (คาด CONFIRMED)`);
    if (ticketOf(await board(ST.hot), RD.B, ST.hot)) p.push("ตั๋วที่เสิร์ฟแล้วยังอยู่บนบอร์ด");
    const d1 = await K("kdsTicketDone", ctxA(), A("COOK"), tk(RD.B, ST.drink));
    const d2 = await K("kdsServed", ctxA(), A("COOK"), tk(RD.B, ST.drink));
    if (d1?.ok !== true || d1.changed !== 1 || d2?.ok !== true) p.push(`เครื่องดื่ม NEW→READY→SERVED → ${codeOf(d1)}/${codeOf(d2)}`);
    if ((await roundRow(RD.B))?.status !== "COMPLETED") p.push(`รอบ ${(await roundRow(RD.B))?.status} (คาด COMPLETED)`);
    chk("B3", NB() === "" && p.length === 0, "READY → SERVED · รอบ COMPLETED เมื่อครบทุกสถานี", FX(NB() + NK("kdsServed") + (P8(p) || "ครบ")));
  });
  await step("B6", async () => {
    const p: string[] = [];
    const r = await K("kdsRecall", ctxA(), A("COOK"), tk(RD.B, ST.drink));
    if (r?.ok !== true) p.push(`recall → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
    const d = (await itB()).drink[0];
    if (d?.kdsStatus !== "COOKING" || d?.readyAt !== null || d?.servedAt !== null) p.push(`เครื่องดื่ม ${d?.kdsStatus} readyAt ${short(d?.readyAt, 24)} servedAt ${short(d?.servedAt, 24)}`);
    if ((await roundRow(RD.B))?.status !== "CONFIRMED") p.push(`รอบ ${(await roundRow(RD.B))?.status} (คาด CONFIRMED)`);
    // ตั๋วเมื่อวาน
    const so = await sell([ln("chayen", 1)]);
    const ro = (await waitRounds(so.saleId))[0];
    if (!ro) p.push(`ไม่มีรอบเมื่อวาน (${SALE_FAIL(so)})`);
    else {
      await K("kdsTicketDone", ctxA(), A("COOK"), tk(ro.id, ST.drink));
      const y = new Date(Date.now() + 7 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
      await P.restaurantOrder.update({ where: { id: ro.id }, data: { bizDate: y } }); // จัดฉาก: รอบของเมื่อวาน
      const s0 = await snapItems(ro.id);
      const old = await K("kdsRecall", ctxA(), A("COOK"), tk(ro.id, ST.drink));
      if (!refused(old, "TICKET_TOO_OLD")) p.push(`recall เมื่อวาน → ${codeOf(old)} (คาด TICKET_TOO_OLD)`);
      if ((await snapItems(ro.id)) !== s0) p.push("recall เมื่อวานเขียนแถว");
    }
    // CANCELLED ไม่ขยับ
    const lo = await rorder.createOrder({ tenantId: T, unitId: U.A, type: "TAKEAWAY", cart: [{ menuItemId: MI.padthai, qty: 1, choiceIds: [] }, { menuItemId: MI.chayen, qty: 1, choiceIds: [] }], placedByUserId: uid("MGR") });
    const li = lo?.ok ? await itemsOf(String(lo.id)) : [];
    const pt = li.find((x) => x.menuItemId === MI.padthai);
    if (pt) await rorder.cancelOrderItem(T, U.A, pt.id, "qc", uid("MGR"));
    const cx = lo?.ok ? await K("kdsTicketDone", ctxA(), A("COOK"), tk(String(lo.id), ST.hot)) : null;
    if (!(cx?.ok === true && cx.changed === 0) && !refused(cx, "TICKET_NOT_FOUND")) p.push(`ตั๋วที่ยกเลิกหมด → ${codeOf(cx)} changed ${short(cx?.changed)}`);
    if ((await itemsOf(String(lo?.id ?? ""))).find((x) => x.id === pt?.id)?.kdsStatus !== "CANCELLED") p.push("รายการ CANCELLED ขยับ");
    chk("B6", NB() === "" && p.length === 0, "recall → COOKING + CONFIRMED · เมื่อวาน TICKET_TOO_OLD · CANCELLED คงเดิม", FX(NB() + NK("kdsRecall") + (P8(p) || "ครบ")));
  });
  await step("B4", async () => {
    const p: string[] = [];
    const co = SL.TABSESSION ? await rorder.checkout({ tenantId: T, unitId: U.A, sessionId: SL.TABSESSION, payMethod: "CASH" }) : null;
    if (co?.ok && co.saleId) MY_SALES.push((SL.TABCO = String(co.saleId)));
    const it = (await itemsOf(RD.TAB ?? ""))[0];
    if (!it?.saleId) p.push(`checkout เดิมไม่ผูกรายการ (${short(co, 80)})`);
    const ctl = it ? await rkds.advanceItem(T, U.A, it.id, "COOKING") : null;
    if (ctl?.ok !== false || ctl?.reason !== "รายการนี้ชำระแล้ว") p.push(`ตัวควบคุม advanceItem → ${short(ctl, 60)}`);
    const st = await K("kdsStart", ctxA(), A("COOK"), tk(RD.TAB ?? "none", ST.hot));
    if (st?.ok !== true || st.changed !== 1) p.push(`kdsStart รายการที่จ่ายแล้ว → ${codeOf(st)} changed ${short(st?.changed)}`);
    if ((await itemsOf(RD.TAB ?? ""))[0]?.kdsStatus !== "COOKING") p.push("รายการที่จ่ายแล้วไม่ COOKING");
    await board(ST.hot);
    if (SL.TABCO && (await roundsOfSale(SL.TABCO)).length) p.push("บิล checkout เดิม (RESTAURANT) ได้รอบจาก heal");
    chk("B4", p.length === 0, "cooking ≠ billing · advanceItem เดิมยังปฏิเสธ", FX(NK("kdsStart") + (P8(p) || "ครบ")));
  });
  await step("B7", async () => {
    const p: string[] = [];
    const xs0 = await snapItems(X.order ?? "");
    const t2s0 = short((await itemsOf(X.order ?? "", T2)).map((x) => [x.kdsStatus, x.isRush]));
    const b0 = await snapItems(RD.K1 ?? "");
    const probes: [string, string, Any, Any][] = [
      ["kdsStart T2", "kdsStart", ctxA(), tk(X.order ?? "none", X.station ?? "none")],
      ["kdsTicketDone T2", "kdsTicketDone", ctxA(), tk(X.order ?? "none", X.station ?? "none")],
      ["kdsServed T2", "kdsServed", ctxA(), tk(X.order ?? "none", X.station ?? "none")],
      ["kdsRecall T2", "kdsRecall", ctxA(), tk(X.order ?? "none", X.station ?? "none")],
      ["kdsLineDone T2", "kdsLineDone", ctxA(), { itemId: X.item ?? "none" }],
      ["kdsRush T2", "kdsRush", ctxA(), { orderId: X.order ?? "none", rush: true }],
      ["kitchenSlipPayload T2", "kitchenSlipPayload", ctxA(), { orderId: X.order ?? "none" }],
      ["kdsStart สาขา B", "kdsStart", ctxB(), tk(RD.K1 ?? "none", ST.hot)],
      ["kdsLineDone สาขา B", "kdsLineDone", ctxB(), { itemId: (await itemsOf(RD.K1 ?? ""))[0]?.id ?? "none" }],
      ["kdsStart id มั่ว", "kdsStart", ctxA(), tk("qc-no-such-order", ST.hot)],
    ];
    for (const [label, fn, ctx, input] of probes) {
      const r = await K(fn, ctx, A("OWNER"), input);
      if (!refused(r, "TICKET_NOT_FOUND")) p.push(`${label} → ${codeOf(r)}`);
    }
    if ((await snapItems(X.order ?? "")) !== xs0 || short((await itemsOf(X.order ?? "", T2)).map((x) => [x.kdsStatus, x.isRush])) !== t2s0) p.push("รายการร้าน T2 ถูกเขียน");
    if ((await snapItems(RD.K1 ?? "")) !== b0) p.push("รอบสาขา A ถูกเขียนจาก ctx สาขา B");
    const bs = await board("qc-no-such-station");
    if (!refused(bs, "KDS_STATION_NOT_FOUND")) p.push(`บอร์ดสถานีมั่ว → ${codeOf(bs)}`);
    const bb = await K("kdsBoard", ctxB(), A("OWNER"), { stationId: "expo" });
    if (bb?.ok !== true || !Array.isArray(bb.stations) || bb.stations.length !== 0 || (bb.tickets ?? []).length !== 0) p.push(`บอร์ดสาขา B (ไม่มีสถานี) → ${codeOf(bb)} ${short(bb?.stations, 40)}`);
    chk("B7", p.length === 0, "TICKET_NOT_FOUND ×10 · ไม่เขียน · สถานีมั่ว KDS_STATION_NOT_FOUND · สาขาไม่มีสถานี = บอร์ดว่าง", FX(NK("kdsStart", "kdsBoard") + (P8(p) || "ครบ")));
  });
  await step("B8", async () => {
    const p: string[] = [];
    const rc = await board(ST.hot, "CASHIER");
    if (rc?.ok !== true) p.push(`CASHIER อ่านบอร์ด → ${codeOf(rc)}`);
    const k0 = await snapItems(RD.K1 ?? "");
    for (const [fn, input] of [["kdsStart", tk(RD.K1 ?? "none", ST.hot)], ["kdsTicketDone", tk(RD.K1 ?? "none", ST.hot)]] as [string, Any][]) {
      const r = await K(fn, ctxA(), A("CASHIER"), input);
      if (!refused(r, "PERMISSION_DENIED")) p.push(`CASHIER ${fn} → ${codeOf(r)}`);
    }
    const rn = await board(ST.hot, "NOPERM");
    if (!refused(rn, "PERMISSION_DENIED")) p.push(`NOPERM อ่านบอร์ด → ${codeOf(rn)}`);
    const rr = await K("kdsRush", ctxA(), A("COOK"), { orderId: RD.K1 ?? "none", rush: true });
    if (!refused(rr, "PERMISSION_DENIED")) p.push(`COOK kdsRush → ${codeOf(rr)}`);
    if ((await snapItems(RD.K1 ?? "")) !== k0) p.push("คำขอที่ถูกปฏิเสธเขียนแถว");
    const st = await K("kdsStart", ctxA(), A("COOK"), tk(RD.K1 ?? "none", ST.hot));
    if (st?.ok !== true) p.push(`COOK kdsStart → ${codeOf(st)}`);
    const ru = await K("kdsRush", ctxA(), A("OWNER"), { orderId: RD.K1 ?? "none", rush: true });
    if (ru?.ok !== true) p.push(`OWNER kdsRush → ${codeOf(ru)}`);
    if (!(await roundRow(RD.K1 ?? ""))?.isRush || (await itemsOf(RD.K1 ?? "")).filter((x) => x.kdsStatus === "COOKING" || x.kdsStatus === "NEW").some((x) => !x.isRush)) p.push("isRush ไม่ถูกตั้ง");
    const b = await board(ST.hot);
    const cooking = Array.isArray(b?.tickets) ? (b.tickets as Any[]).filter((t) => t.state === "COOKING") : [];
    if (cooking[0]?.orderId !== RD.K1) p.push(`หัวคอลัมน์กำลังทำ = ${short(cooking[0]?.orderId, 30)} (คาดรอบ K1 ที่เร่ง)`);
    const un = await K("kdsRush", ctxA(), A("OWNER"), { orderId: RD.K1 ?? "none", rush: false });
    if (un?.ok !== true || (await roundRow(RD.K1 ?? ""))?.isRush !== false) p.push(`ยกเลิกเร่ง → ${codeOf(un)}`);
    chk("B8", p.length === 0, "CASHIER อ่านได้เดินไม่ได้ · NOPERM ไม่ได้ · COOK เร่งไม่ได้ · เร่ง = หัวคอลัมน์", FX(NK("kdsBoard", "kdsRush") + (P8(p) || "ครบ")));
  });

  // ════════ T ตัวอ่าน (บอร์ด) ════════
  console.log("\n── T4–T5 บอร์ด/expo/คิวค้าง ──");
  /** ตั๋วอ้างอิงจาก DB (รอบ CONFIRMED/COMPLETED ของวันนี้ที่สาขา A) */
  const refTickets = async (): Promise<Any[]> => {
    const today = bizToday();
    const rounds = (await roundsAll()).filter((r) => r.unitId === U.A && r.bizDate === today && (r.status === "CONFIRMED" || r.status === "COMPLETED"));
    const out: Any[] = [];
    const prep = new Map<string, number | null>();
    for (const m of (await P.menuItem.findMany({ where: { tenantId: T, unitId: U.A }, select: { id: true, prepMinutes: true } })) as Any[]) prep.set(m.id, m.prepMinutes);
    for (const r of rounds) {
      const its = await itemsOf(r.id);
      const byStation = new Map<string, Any[]>();
      for (const it of its) byStation.set(it.stationId, [...(byStation.get(it.stationId) ?? []), it]);
      for (const [stationId, xs] of byStation) {
        const state = refState(xs.map((x) => x.kdsStatus));
        if (!state) continue;
        const live = xs.filter((x) => x.kdsStatus !== "CANCELLED");
        const preps = live.map((x) => (x.menuItemId ? prep.get(x.menuItemId) ?? null : null)).filter((v): v is number => typeof v === "number");
        const target = r.targetMinutes ?? (preps.length ? Math.max(...preps) : 10);
        const readyAt = live.every((x) => x.readyAt) ? Math.max(...live.map((x) => msOf(x.readyAt))) : null;
        out.push({ orderId: r.id, stationId, state, source: refSource(r), no: r.dailyNo, sentAtMs: msOf(r.createdAt), target, readyAt, lineCount: live.length, doneCount: live.filter((x) => x.kdsStatus === "READY" || x.kdsStatus === "SERVED").length, items: live });
      }
    }
    return out;
  };
  await step("T4", async () => {
    const p: string[] = [];
    const b = await board(ST.hot);
    if (b?.ok !== true) {
      chk("T4", false, "บอร์ดตรง DB", FX(NK("kdsBoard") + `kdsBoard → ${codeOf(b)} ${short(b?.message ?? "", 60)}`));
      return;
    }
    const missKeys = BOARD_KEYS.filter((k) => !(k in b));
    if (missKeys.length) p.push(`บอร์ดขาดคีย์ ${missKeys.join(",")}`);
    const ref = await refTickets();
    const onBoard = ref.filter((t) => t.stationId === ST.hot && t.state !== "SERVED");
    const got = (b.tickets ?? []) as Any[];
    const key = (t: Any) => `${t.orderId}|${t.stationId}`;
    if (setStr(got.map(key)) !== setStr(onBoard.map(key))) p.push(`ชุดตั๋ว ${got.length} ≠ DB ${onBoard.length} (เกิน ${got.filter((t) => !onBoard.some((r) => key(r) === key(t))).length} · ขาด ${onBoard.filter((r) => !got.some((t) => key(r) === key(t))).length})`);
    const now = msOf(b.serverNow);
    if (!Number.isFinite(now) || Math.abs(now - Date.now()) > 60_000) p.push(`serverNow ${short(b.serverNow, 30)}`);
    for (const t of got) {
      const r = onBoard.find((x) => key(x) === key(t));
      const mk = TICKET_KEYS.filter((k) => !(k in t));
      if (mk.length) p.push(`ตั๋ว ${t.no} ขาดคีย์ ${mk.join(",")}`);
      const lk = (t.lines ?? []).flatMap((l: Any) => LINE_KEYS.filter((k) => !(k in l)));
      if (lk.length) p.push(`บรรทัดตั๋ว ${t.no} ขาดคีย์ ${[...new Set(lk)].join(",")}`);
      if (!r) continue;
      if (t.state !== r.state || t.source !== r.source || t.no !== r.no || t.targetMinutes !== r.target || t.lineCount !== r.lineCount || t.doneCount !== r.doneCount)
        p.push(`ตั๋ว #${r.no}: ${short({ state: [t.state, r.state], source: [t.source, r.source], target: [t.targetMinutes, r.target], done: [t.doneCount, r.doneCount], n: [t.lineCount, r.lineCount] }, 160)}`);
      const el = Math.floor((now - r.sentAtMs) / 1000);
      if (Math.abs(Number(t.elapsedSec) - el) > 2 || t.remainingSec !== t.targetMinutes * 60 - t.elapsedSec) p.push(`ตั๋ว #${r.no} เวลา elapsed ${t.elapsedSec} (คาด ~${el}) remaining ${t.remainingSec}`);
      const late = Number(t.elapsedSec) >= Number(t.targetMinutes) * 60;
      if (t.late !== late || t.warn !== (!late && Number(t.remainingSec) <= 120)) p.push(`ตั๋ว #${r.no} warn/late ${t.warn}/${t.late}`);
    }
    if (ref.some((t) => t.orderId === RD.K1 && t.stationId === ST.hot && t.target !== 8)) p.push("อ้างอิงเป้ากะเพรา ≠ 8");
    const k1 = got.find((t) => t.orderId === RD.K1 && t.stationId === ST.hot);
    if (k1 && k1.targetMinutes !== 8) p.push(`เป้าตั๋วกะเพรา ${k1.targetMinutes} (คาด 8 = prepMinutes)`);
    const bd = await board(ST.drink);
    const ch = ((bd?.tickets ?? []) as Any[]).find((t) => t.orderId === RD.K2 && t.stationId === ST.drink);
    if (!ch || ch.targetMinutes !== 10) p.push(`เป้าตั๋วชาไทย ${short(ch?.targetMinutes)} (คาด 10 = kdsCriticalMins)`);
    for (const col of ["NEW", "COOKING", "READY"]) {
      const inCol = got.filter((t) => t.state === col);
      if (inCol.map(key).join(",") !== refSort(col, inCol).join(",")) p.push(`ลำดับคอลัมน์ ${col} ไม่ตรงกติกา`);
    }
    const stH = ((b.stations ?? []) as Any[]).find((s) => s.id === ST.hot);
    if (!stH || stH.openCount !== onBoard.length || ((b.stations ?? []) as Any[]).length !== 3) p.push(`stations ${short((b.stations ?? []).map((s: Any) => [s.name, s.openCount]), 100)} (คาด 3 · ครัวร้อน ${onBoard.length})`);
    const pend = new Map<string, number>();
    for (const t of ref.filter((x) => x.stationId === ST.hot)) for (const it of t.items as Any[]) if (it.kdsStatus === "NEW" || it.kdsStatus === "COOKING") pend.set(it.nameSnapshot, (pend.get(it.nameSnapshot) ?? 0) + it.qty);
    const gotPend = new Map(((b.pending ?? []) as Any[]).map((x) => [x.name, x.qty]));
    const wantTop = [...pend.entries()].sort((a, c) => c[1] - a[1]).slice(0, 8);
    if (wantTop.some(([n, q]) => gotPend.get(n) !== q)) p.push(`pending ${short([...gotPend.entries()], 120)} (คาด ${short(wantTop, 120)})`);
    chk("T4", NK("kdsBoard") === "" && p.length === 0, "ตั๋ว/สถานะ/เป้า/เวลา/ลำดับ/นับ ตรง DB", FX(P8(p) || `ครบ (${got.length} ตั๋ว)`));
  });
  await step("T5", async () => {
    const p: string[] = [];
    const b = await board(ST.hot);
    if (b?.ok !== true) {
      chk("T5", false, "servedToday · avg · expo · backlog · พักครัว", FX(NK("kdsBoard", "kitchenBacklog") + `kdsBoard → ${codeOf(b)}`));
      return;
    }
    const ref = await refTickets();
    const served = ref.filter((t) => t.stationId === ST.hot && t.state === "SERVED");
    if (b.servedToday?.count !== served.length) p.push(`servedToday.count ${short(b.servedToday?.count)} (คาด ${served.length})`);
    const lastServed = served.sort((a, c) => Math.max(...c.items.map((x: Any) => msOf(x.servedAt))) - Math.max(...a.items.map((x: Any) => msOf(x.servedAt))))[0];
    if (lastServed && b.servedToday?.last?.no !== lastServed.no) p.push(`servedToday.last.no ${short(b.servedToday?.last?.no)} (คาด ${lastServed.no})`);
    const pairs = ref.filter((t) => t.stationId === ST.hot && t.readyAt).map((t) => ({ sentAtMs: t.sentAtMs, readyAtMs: t.readyAt }));
    const avg = pairs.length ? Math.floor(sum(pairs.map((x) => (x.readyAtMs - x.sentAtMs) / 60_000)) / pairs.length) : 0;
    if (b.avgMinutes !== avg) p.push(`avgMinutes ${short(b.avgMinutes)} (คาด ${avg} จาก ${pairs.length} ใบ)`);
    const ex0 = await board("expo");
    const readyRef = ref.filter((t) => t.state === "READY").map((t) => `${t.orderId}|${t.stationId}`);
    const exGot = ((ex0?.tickets ?? []) as Any[]).map((t) => `${t.orderId}|${t.stationId}`);
    if (ex0?.ok !== true || setStr(exGot) !== setStr(readyRef)) p.push(`expo ${codeOf(ex0)} ${exGot.length} ใบ (คาด READY ทุกสถานี ${readyRef.length})`);
    const bl = await K("kitchenBacklog", T, U.A);
    const arr: Any[] = Array.isArray(bl) ? bl : Array.isArray(bl?.stations) ? bl.stations : [];
    for (const sid of [ST.hot, ST.drink, ST.dessert]) {
      const want = ref.filter((t) => t.stationId === sid && (t.state === "NEW" || t.state === "COOKING")).length;
      const g = arr.find((x) => x.stationId === sid)?.open;
      if (g !== want) p.push(`kitchenBacklog ${sid === ST.hot ? "ครัวร้อน" : sid === ST.drink ? "เครื่องดื่ม" : "ขนม"} = ${short(g)} (คาด ${want})`);
    }
    // พักครัว
    await menu.setKitchenPause(T, U.A, true, "qc");
    try {
      const bp = await board(ST.hot);
      if (bp?.paused !== true) p.push(`board.paused ${short(bp?.paused)} (คาด true)`);
      const qr = await storefront.placeGuestOrder({ tenantId: T, unitId: U.A, qrToken: QR.A2, cart: [{ menuItemId: MI.chayen, qty: 1, choiceIds: [] }] });
      if (qr?.ok !== false || qr?.err?.code !== "KITCHEN_CLOSED") p.push(`QR ระหว่างพัก → ${short(qr, 60)}`);
      const s = await sell([ln("chayen", 1)]);
      if (!s.saleId) p.push(`ขายหน้าร้านระหว่างพัก → ${codeOf(s.r)}`);
      else if ((await waitRounds(s.saleId)).length !== 1) p.push("ขายหน้าร้านระหว่างพักไม่ได้ตั๋ว (หน้าร้านไม่ถูกพัก)");
    } finally {
      await menu.setKitchenPause(T, U.A, false);
    }
    if ((await board(ST.hot))?.paused !== false) p.push("เลิกพักแล้ว paused ไม่ false");
    chk("T5", NK("kdsBoard", "kitchenBacklog") === "" && p.length === 0, "servedToday · avg · expo · backlog · พักครัว", FX(NK("kdsBoard", "kitchenBacklog") + (P8(p) || "ครบ")));
  });

  // ════════ O ออนไลน์ (P2.8) ════════
  console.log("\n── O ออเดอร์ออนไลน์ตามครัว ──");
  const poRow = async (id: string): Promise<Any> => (PO && id ? PO.findUnique({ where: { id } }).catch(() => null) : null);
  const poEvents = async (id: string): Promise<Any[]> => (POE && id ? ((await POE.findMany({ where: { orderId: id }, orderBy: [{ at: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]) : []);
  const depGate = (id: string): boolean => {
    const dep = DEP_MSG(id);
    if (dep) chk(id, false, "ของ P2.8 S อยู่บนฐาน", dep);
    return !dep;
  };
  await step("O1", async () => {
    if (!depGate("O1")) return;
    const p: string[] = [];
    if (!RD.LM) throw new Error("ไม่มีรอบ LINEMAN (K7)");
    const s1 = await K("kdsStart", ctxA(), A("COOK"), tk(RD.LM, ST.hot));
    if (s1?.ok !== true) p.push(`kdsStart → ${codeOf(s1)}`);
    const o = await poRow(ON.LM);
    const evs = (await poEvents(ON.LM)).filter((e) => e.toStatus === "PREPARING");
    if (o?.status !== "PREPARING" || evs.length !== 1 || evs[0]?.actorUserId !== null || evs[0]?.fromStatus !== "ACCEPTED") p.push(`ออเดอร์ ${o?.status} · event PREPARING ${evs.length} ${short(evs[0] && [evs[0].fromStatus, evs[0].actorUserId], 60)}`);
    await K("kdsStart", ctxA(), A("COOK"), tk(RD.LM, ST.drink));
    if ((await poEvents(ON.LM)).filter((e) => e.toStatus === "PREPARING").length !== 1) p.push("start สถานีที่สองได้ event เพิ่ม");
    chk("O1", p.length === 0, "ตั๋วแรกออกจาก NEW → PREPARING (1 event · actor null)", FX(P8(p) || "ครบ"));
  });
  await step("O2", async () => {
    if (!depGate("O2")) return;
    const p: string[] = [];
    const readyEv = async () => (await obx("pos.order.ready")).filter((e) => e.payload?.orderId === ON.LM);
    await K("kdsTicketDone", ctxA(), A("COOK"), tk(RD.LM, ST.hot));
    if ((await poRow(ON.LM))?.status !== "PREPARING") p.push(`READY บางสถานี → ${(await poRow(ON.LM))?.status} (คาด PREPARING)`);
    await K("kdsTicketDone", ctxA(), A("COOK"), tk(RD.LM, ST.drink));
    if ((await poRow(ON.LM))?.status !== "READY" || (await readyEv()).length !== 1) p.push(`ครบทุกสถานี → ${(await poRow(ON.LM))?.status} · ready event ${(await readyEv()).length}`);
    await K("kdsRecall", ctxA(), A("COOK"), tk(RD.LM, ST.drink));
    if ((await poRow(ON.LM))?.status !== "READY") p.push(`recall → ออเดอร์ ${(await poRow(ON.LM))?.status} (คาด READY คงเดิม)`);
    await K("kdsTicketDone", ctxA(), A("COOK"), tk(RD.LM, ST.drink));
    if ((await readyEv()).length !== 1) p.push(`READY ซ้ำได้ ready event ${(await readyEv()).length}`);
    chk("O2", p.length === 0, "บางส่วน = PREPARING · ครบ = READY + ready 1 · recall ไม่ถอย", FX(P8(p) || "ครบ"));
  });
  await step("O3", async () => {
    if (!depGate("O3")) return;
    const p: string[] = [];
    if (!RD.CHAT) throw new Error("ไม่มีรอบ CHAT (K7)");
    const c = await O("cancelOrder", ctxA(DEV1), A("OWNER"), { id: ON.CHAT, reason: "ลูกค้ายกเลิก" });
    if (c?.ok !== true) p.push(`cancelOrder → ${codeOf(c)} ${short(c?.message ?? "", 60)}`);
    await drain();
    const its = await itemsOf(RD.CHAT);
    if (!its.length || its.some((x) => x.kdsStatus !== "CANCELLED" || x.cancelReason !== "ออเดอร์ถูกยกเลิก")) p.push(`รายการ ${short(its.map((x) => [x.kdsStatus, x.cancelReason]), 100)}`);
    const s0 = await snapItems(RD.CHAT);
    p.push(...(await replay("pos.order.cancelled", (e) => e.payload?.orderId === ON.CHAT)));
    await drain();
    if ((await snapItems(RD.CHAT)) !== s0) p.push("เล่นซ้ำแล้วรายการเปลี่ยน");
    chk("O3", p.length === 0, "ยกเลิกออเดอร์ → รายการครัว CANCELLED · เล่นซ้ำไม่เปลี่ยน", FX(P8(p) || "ครบ"));
  });
  await step("O4", async () => {
    if (!depGate("O4")) return;
    const p: string[] = [];
    const pr = await K("kitchenProgress", ctxA(), A("OWNER"), { posOrderIds: [ON.LM, ON.LM2] });
    const arr: Any[] = Array.isArray(pr?.progress) ? pr.progress : [];
    for (const [oid, rid] of [[ON.LM, RD.LM], [ON.LM2, (await roundsOfOrder(ON.LM2))[0]?.id ?? ""]] as [string, string][]) {
      const live = (await itemsOf(rid)).filter((x) => x.kdsStatus !== "CANCELLED");
      const want = { done: live.filter((x) => x.kdsStatus === "READY" || x.kdsStatus === "SERVED").length, total: live.length };
      const g = arr.find((x) => x.orderId === oid);
      if (g?.done !== want.done || g?.total !== want.total) p.push(`kitchenProgress ${oid.slice(-6)} = ${short(g && [g.done, g.total])} (คาด ${want.done}/${want.total})`);
    }
    const sm = await K("kdsSetAutoAcceptMax", ctxA(), A("OWNER"), { maxOpen: 1 });
    const ca = await O("setChannelOrderSettings", ctxA(), A("OWNER"), { channelId: CHN.CHAT_A, autoAccept: true });
    if (sm?.ok !== true || ca?.ok !== true) p.push(`ตั้งเพดาน/autoAccept → ${codeOf(sm)}/${codeOf(ca)}`);
    const chat = (k: string) => O("ingestOrder", ctxA(DEV1), A("OWNER"), { channelId: CHN.CHAT_A, idempotencyKey: newKey(k), lines: [{ productId: PP.chayen, qty: 1 }], customer: { name: "คุณดี" }, fulfilment: "PICKUP", paymentState: "UNPAID" });
    const i1 = await chat("bk1");
    if ((await poRow(String(i1?.orderId ?? "")))?.status !== "NEW") p.push(`ครัวค้าง ≥ 1 + autoAccept → ${(await poRow(String(i1?.orderId ?? "")))?.status ?? codeOf(i1)} (คาด NEW)`);
    await K("kdsSetAutoAcceptMax", ctxA(), A("OWNER"), { maxOpen: null });
    const i2 = await chat("bk2");
    if ((await poRow(String(i2?.orderId ?? "")))?.status !== "ACCEPTED") p.push(`ไม่มีเพดาน → ${(await poRow(String(i2?.orderId ?? "")))?.status ?? codeOf(i2)} (คาด ACCEPTED)`);
    await menu.setKitchenPause(T, U.A, true, "qc");
    try {
      const i3 = await chat("bk3");
      if (!refused(i3, "CHANNEL_PAUSED")) p.push(`พักครัว CHAT → ${codeOf(i3)} (คาด CHANNEL_PAUSED)`);
      const i4 = await O("ingestOrder", ctxA(DEV1), A("OWNER"), { channelId: CHN.LM, externalRef: `LM3-${RAND}`, idempotencyKey: newKey("lm3"), lines: [{ productId: PP.chayen, qty: 1 }], customer: { name: "คุณอี" }, fulfilment: "PICKUP" });
      if (i4?.ok !== true) p.push(`พักครัว LINEMAN (MANUAL) → ${codeOf(i4)} (คาด ok)`);
    } finally {
      await menu.setKitchenPause(T, U.A, false);
      await O("setChannelOrderSettings", ctxA(), A("OWNER"), { channelId: CHN.CHAT_A, autoAccept: false });
    }
    chk("O4", p.length === 0, "progress x/y · เพดานครัวค้างหยุด autoAccept · พักครัวพักออนไลน์ (ไม่พัก MANUAL)", FX(NK("kitchenProgress", "kdsSetAutoAcceptMax") + (P8(p) || "ครบ")));
  });

  // ════════ A 86 ════════
  console.log("\n── A 86 → ทุกช่องทาง ──");
  const NA = () => (typeof catalog?.setAvailability === "function" ? "" : `${MISSING} catalog.setAvailability · `);
  await step("A1", async () => {
    const p: string[] = [];
    const a0 = await auditCount("pos.product.availability");
    const r = await setAvail("COOK", PP.padthai, false, "KDS", { note: "เส้นหมด" });
    if (r?.ok !== true) p.push(`setAvailability → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    if ((await menuRow("padthai"))?.isOutOfStock !== true) p.push("MenuItem.isOutOfStock ไม่ true");
    const m = await markOf(PP.padthai);
    if (!m || m.source !== "KDS" || m.markedByUserId !== uid("COOK") || m.systemId !== S.POS || !m.markedAt) p.push(`mark ${short(m && { s: m.source, by: m.markedByUserId === uid("COOK"), sys: m.systemId === S.POS }, 80)}`);
    if ((await auditCount("pos.product.availability")) !== a0 + 1) p.push(`audit pos.product.availability +${(await auditCount("pos.product.availability")) - a0} (คาด +1)`);
    const ev = await availEvents(PP.padthai);
    const pl = ev[0]?.payload ?? {};
    const want = { productId: PP.padthai, unitId: U.A, systemId: S.POS, available: false, source: "KDS" };
    if (ev.length !== 1 || Object.entries(want).some(([k, v]) => pl[k] !== v) || !Number.isFinite(msOf(pl.at))) p.push(`event ${ev.length} ${short(pl, 160)}`);
    const b = await board(ST.hot);
    const e86 = ((b?.eightySix ?? []) as Any[]).find((x) => x.productId === PP.padthai);
    if (!e86 || e86.source !== "KDS" || !Number.isFinite(msOf(e86.at))) p.push(`board.eightySix ${short(b?.eightySix, 100)}`);
    chk("A1", NA() === "" && NCOL() === "" && p.length === 0, "MenuItem 86 · mark KDS · audit · event 1 · บอร์ด 86", FX(NA() + NCOL() + (P8(p) || "ครบ")));
  });
  await step("A5", async () => {
    if (DEP_MSG("A5")) {
      chk("A5", false, "ของ P2.8 S อยู่บนฐาน", DEP_MSG("A5"));
      return;
    }
    const p: string[] = [];
    const key = newKey("a5");
    const r = await O("ingestOrder", ctxA(DEV1), A("OWNER"), { channelId: CHN.LM, externalRef: `LM5-${RAND}`, idempotencyKey: key, lines: [{ productId: PP.kaprao, qty: 1 }, { productId: PP.padthai, qty: 1 }], customer: { name: "คุณเอฟ" }, fulfilment: "PICKUP", startStatus: "NEW" });
    if (!refused(r, "PRODUCT_UNAVAILABLE") || r.lineIndex !== 1) p.push(`ingest → ${codeOf(r)} lineIndex ${short(r?.lineIndex)} (คาด PRODUCT_UNAVAILABLE 1)`);
    if (PO && (await PO.count({ where: { tenantId: T, idempotencyKey: key } })) !== 0) p.push("มี PosOrder");
    chk("A5", p.length === 0, "ingest ปฏิเสธสินค้าที่ 86 + lineIndex", FX(P8(p) || "ครบ"));
  });
  await step("A4", async () => {
    const p: string[] = [];
    const n0 = Number(await P.posSale.count({ where: { tenantId: T } }));
    const cat = await call(register, "registerCatalog", ctxA(DEV1), A("CASHIER"), { q: NAME.padthai });
    const tile = ((cat?.products ?? []) as Any[]).find((x) => x.id === PP.padthai);
    if (!tile || tile.soldOut !== true || tile.soldOutReason !== "UNAVAILABLE") p.push(`ไทล์ ${short(tile && { soldOut: tile.soldOut, r: tile.soldOutReason }, 80) || codeOf(cat)}`);
    else if (tile.soldOutMark?.source !== "KDS" || !Number.isFinite(msOf(tile.soldOutMark?.at))) p.push(`ไทล์ soldOutMark ${short(tile.soldOutMark, 80)} (คาด {source KDS at})`);
    const q = await call(register, "quoteRegisterCart", ctxA(DEV1), A("CASHIER"), { lines: [ln("chayen", 1), ln("padthai", 1)] });
    if (!refused(q, "PRODUCT_UNAVAILABLE") || q.lineIndex !== 1) p.push(`quote → ${codeOf(q)} lineIndex ${short(q?.lineIndex)}`);
    const om = (await menu.orderingMenu(T, U.A)) as Any[];
    const it = om.flatMap((c) => c.items as Any[]).find((x) => x.id === MI.padthai);
    if (it?.isOutOfStock !== true) p.push(`orderingMenu ผัดไทย isOutOfStock ${short(it?.isOutOfStock)}`);
    const av = await call(catalog, "availabilityFor", T, U.A, [PP.padthai, PP.kaprao]);
    const get = (k: string) => (av instanceof Map ? av.get(k) : isRecord(av) ? (isRecord(av.availability) ? av.availability[k] : av[k]) : undefined);
    if (get(PP.padthai) !== false || get(PP.kaprao) !== true) p.push(`availabilityFor = ${short(av instanceof Map ? [...av.entries()] : av, 120)}`);
    if (Number(await P.posSale.count({ where: { tenantId: T } })) !== n0) p.push("มีบิลเพิ่ม");
    chk("A4", p.length === 0, "ไทล์ UNAVAILABLE + ครัวแจ้ง · quote ปฏิเสธ · QR/staff menu หมด · availabilityFor", FX(P8(p) || "ครบ"));
  });
  await step("A2", async () => {
    const p: string[] = [];
    const m0 = await markOf(PP.padthai);
    const r1 = await setAvail("COOK", PP.padthai, false, "KDS");
    if (r1?.ok !== true || (await availEvents(PP.padthai)).length !== 1) p.push(`เรียกซ้ำ → ${codeOf(r1)} event ${(await availEvents(PP.padthai)).length} (คาด ok 1)`);
    if (short(await markOf(PP.padthai)) !== short(m0)) p.push("เรียกซ้ำแล้ว mark เปลี่ยน");
    const r2 = await setAvail("COOK", PP.padthai, true, "KDS");
    const ev = await availEvents(PP.padthai);
    if (r2?.ok !== true || ev.length !== 2 || ev[1]?.payload?.available !== true) p.push(`คืนขาย → ${codeOf(r2)} event ${ev.length} ${short(ev[1]?.payload?.available)}`);
    if (await markOf(PP.padthai)) p.push("คืนขายแล้ว mark ยังอยู่");
    if ((await menuRow("padthai"))?.isOutOfStock !== false) p.push("isOutOfStock ไม่ false");
    const r3 = await setAvail("COOK", PP.padthai, true, "KDS");
    if (r3?.ok !== true || (await availEvents(PP.padthai)).length !== 2) p.push(`คืนซ้ำ → ${codeOf(r3)} event ${(await availEvents(PP.padthai)).length}`);
    chk("A2", NA() === "" && p.length === 0, "event เฉพาะเมื่อพลิก · คืนขายลบ mark", FX(NA() + (P8(p) || "ครบ")));
  });
  await step("A3", async () => {
    const p: string[] = [];
    const r = await setAvail("CASHIER", PP.water, false, "MANUAL");
    if (r?.ok !== true) p.push(`CASHIER 86 น้ำ → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const row = await P.posProduct.findUnique({ where: { id: PP.water } });
    if (!(row?.unavailableUnitIds ?? []).includes(U.A) || (row?.unavailableUnitIds ?? []).includes(U.B)) p.push(`unavailableUnitIds ${short(row?.unavailableUnitIds, 80)}`);
    const m = await markOf(PP.water);
    if (m?.source !== "MANUAL") p.push(`mark ${short(m?.source)}`);
    const ev = await availEvents(PP.water);
    if (ev.length !== 1 || ev[0]?.payload?.source !== "MANUAL" || ev[0]?.payload?.available !== false) p.push(`event ${ev.length} ${short(ev[0]?.payload, 100)}`);
    const sb = await sell([ln("water", 1)], { actor: "OWNER", ctx: ctxB(DEVB) });
    if (!sb.saleId) p.push(`สาขา B ขายน้ำไม่ได้ (${codeOf(sb.r)}) — 86 ต้องเป็นรายสาขา`);
    const r2 = await setAvail("CASHIER", PP.water, true, "MANUAL");
    const row2 = await P.posProduct.findUnique({ where: { id: PP.water } });
    const ev2 = await availEvents(PP.water);
    if (r2?.ok !== true || (row2?.unavailableUnitIds ?? []).includes(U.A) || ev2.length !== 2 || ev2[1]?.payload?.available !== true || (await markOf(PP.water))) p.push(`คืนขาย → ${codeOf(r2)} unavailable ${short(row2?.unavailableUnitIds, 40)} event ${ev2.length}`);
    chk("A3", NA() === "" && p.length === 0, "ไม่ใช่เมนู → unavailableUnitIds ของสาขา + mark + event", FX(NA() + (P8(p) || "ครบ")));
  });
  await step("A6", async () => {
    if (DEP_MSG("A6")) {
      chk("A6", false, "ของ P2.8 S อยู่บนฐาน", DEP_MSG("A6"));
      return;
    }
    const p: string[] = [];
    const reg = adaptersMod?.ORDER_ADAPTERS;
    const calls: { adapter: string; arg: string }[] = [];
    const orig: Record<string, Any> = {};
    for (const a of ["MANUAL", "WEB", "CHAT"]) {
      const ad = reg?.[a];
      if (!ad || typeof ad.setAvailability !== "function") {
        p.push(`ORDER_ADAPTERS.${a}.setAvailability ไม่มี`);
        continue;
      }
      orig[a] = ad.setAvailability;
      try {
        ad.setAvailability = async (...args: Any[]) => {
          calls.push({ adapter: a, arg: short(args, 2000) });
          return { pushed: false };
        };
      } catch (e) {
        p.push(`แทนที่ ${a}.setAvailability ไม่ได้ (${(e as Error).message.slice(0, 40)} — CD: registry ต้องไม่ freeze)`);
      }
    }
    try {
      const ev = (await availEvents(PP.padthai))[0];
      const h = consMod?.consumers?.["pos.product.availability"];
      if (!ev || typeof h !== "function") p.push(`ไม่มี event/ตัวรับ (${!!ev}/${typeof h})`);
      else {
        await h(ev);
        const chans = ((await P.salesChannel.findMany({ where: { tenantId: T, unitId: U.A, active: true } })) as Any[]).filter((c) => c.adapter !== "NONE" && !c.archivedAt);
        for (const c of chans) {
          const n = calls.filter((x) => x.adapter === c.adapter && (x.arg.includes(c.id) || x.arg.includes(`"${c.code}"`)) && x.arg.includes(PP.padthai)).length;
          if (n !== 1) p.push(`ช่องทาง ${c.code} (${c.adapter}) ถูกเรียก ${n} ครั้ง (คาด 1)`);
        }
        const nB = calls.filter((x) => Object.entries(CHN).some(([k, id]) => k.endsWith("_B") && x.arg.includes(id))).length;
        if (nB) p.push(`ช่องทางสาขา B ถูกเรียก ${nB}`);
        if (calls.length !== chans.length) p.push(`เรียกรวม ${calls.length} (คาด ${chans.length} = ช่องทาง active ที่ adapter ≠ NONE)`);
        const o0 = await outboxCount();
        const m0 = await markCount();
        const a0 = await auditCount("pos.product.availability");
        for (let i = 0; i < 2; i++)
          try {
            await h(ev);
          } catch (e) {
            p.push(`เล่นซ้ำ ×${i + 1} throw ${(e as Error).message.slice(0, 60)}`);
          }
        if ((await outboxCount()) !== o0 || (await markCount()) !== m0 || (await auditCount("pos.product.availability")) !== a0) p.push("เล่นซ้ำแล้วมีแถว outbox/mark/audit เพิ่ม");
      }
    } finally {
      for (const [a, fn] of Object.entries(orig)) reg[a].setAvailability = fn;
    }
    chk("A6", p.length === 0, "กระจายไป adapter ช่องทางละ 1 · เล่นซ้ำไม่มีผลเพิ่ม", FX(P8(p) || `ครบ (${calls.length} ครั้ง)`));
  });
  await step("A7", async () => {
    const p: string[] = [];
    const ev = async () => (await availEvents(PP.somtam)).map((e) => `${e.payload?.available}:${e.payload?.source}`);
    await menu.setItemStock(T, U.A, MI.somtam, { isOutOfStock: true }, uid("MGR"));
    const e1 = await ev();
    await menu.setItemStock(T, U.A, MI.somtam, { isOutOfStock: true }, uid("MGR"));
    const e2 = await ev();
    await menu.setItemStock(T, U.A, MI.somtam, { isOutOfStock: false }, uid("MGR"));
    await menu.setItemStock(T, U.A, MI.somtam, { stockQty: 0 }, uid("MGR"));
    await menu.resetDailyStock(T, U.A);
    const e3 = await ev();
    if (e1.join(",") !== "false:MANUAL") p.push(`86 เดิม → ${e1.join(",") || "ไม่มี event"}`);
    if (e2.length !== e1.length) p.push(`เรียกซ้ำ (ไม่พลิก) ได้ event เพิ่ม`);
    if (e3.join(",") !== "false:MANUAL,true:MANUAL,false:MANUAL,true:MANUAL") p.push(`ลำดับ event ${e3.join(",")} (คาด 86 · ปลด · ตัวนับหมด · รีเซ็ตรายวัน)`);
    // ทางร้อนแช่แข็ง: createOrder หมดพอดี → 86 อัตโนมัติ แต่ไม่มี event (ช่องว่างถึง P2.7)
    const n0 = (await ev()).length;
    const o = await rorder.createOrder({ tenantId: T, unitId: U.A, type: "TAKEAWAY", cart: [{ menuItemId: MI.somtam, qty: 3, choiceIds: [] }], placedByUserId: uid("MGR") });
    if (o?.ok !== true || (await menuRow("somtam"))?.isOutOfStock !== true) p.push(`createOrder ส้มตำ 3 → ${short(o, 60)} 86 ${(await menuRow("somtam"))?.isOutOfStock}`);
    if ((await ev()).length !== n0) p.push("ทางร้อนปล่อย event (มติ 6: ห้าม)");
    chk("A7", NCOL() === "" && p.length === 0, "ประตูเดิมพลิก = event MANUAL · ไม่พลิก = 0 · ทางร้อน = 0", FX(NCOL() + (P8(p) || "ครบ")));
  });
  await step("A8", async () => {
    const p: string[] = [];
    const o0 = await outboxCount();
    const m0 = await markCount();
    const a0 = await auditCount("pos.product.availability");
    const cases: [string, Any, string][] = [
      ["NOPERM", await setAvail("NOPERM", PP.kaprao, false, "KDS"), "PERMISSION_DENIED"],
      ["สินค้าร้าน T2", await setAvail("OWNER", X.product ?? "none", false, "KDS"), "PRODUCT_NOT_FOUND"],
      ["id มั่ว", await setAvail("OWNER", "qc-no-such-product", false, "KDS"), "PRODUCT_NOT_FOUND"],
      ["เมนูสาขา A ที่สาขา B", await setAvail("OWNER", PP.kaprao, false, "KDS", {}, ctxB()), "PRODUCT_NOT_FOUND"],
      ["source แปลก", await setAvail("OWNER", PP.kaprao, false, "STOCK_SYNC"), "VALIDATION"],
      ["available ไม่ใช่ boolean", await call(catalog, "setAvailability", ctxA(), A("OWNER"), { productId: PP.kaprao, unitId: U.A, available: "no", source: "KDS" }), "VALIDATION"],
    ];
    for (const [label, r, code] of cases) if (!refused(r, code)) p.push(`${label} → ${codeOf(r)} (คาด ${code})`);
    if ((await outboxCount()) !== o0 || (await markCount()) !== m0 || (await auditCount("pos.product.availability")) !== a0) p.push("คำขอที่ถูกปฏิเสธเขียนแถว");
    if ((await menuRow("kaprao"))?.isOutOfStock !== false) p.push("กะเพราถูก 86");
    chk("A8", NA() === "" && p.length === 0, "สิทธิ์/ขอบเขต/รูปแบบ ปฏิเสธ · ไม่เขียน", FX(NA() + (P8(p) || "ครบ")));
  });
  await step("A9", async () => {
    const p: string[] = [];
    const rs = await Promise.all(Array.from({ length: 10 }, () => setAvail("OWNER", PP.beans, false, "MANUAL")));
    if (rs.some((r) => r?.ok !== true)) p.push(`ผล ${[...new Set(rs.map(codeOf))].join("/")}`);
    const ev = await availEvents(PP.beans);
    if (ev.length !== 1) p.push(`event ${ev.length} (คาด 1)`);
    const nm = MARK ? Number(await MARK.count({ where: { tenantId: T, productId: PP.beans } })) : -1;
    if (nm !== 1) p.push(`mark ${nm} (คาด 1)`);
    await setAvail("OWNER", PP.beans, true, "MANUAL");
    chk("A9", NA() === "" && NCOL() === "" && p.length === 0, "แข่ง 10 คำขอ → event 1 mark 1", FX(NA() + NCOL() + (P8(p) || "ครบ")));
  });

  // ════════ V void/คืน ════════
  console.log("\n── V void/คืนเงิน ──");
  await step("V1", async () => {
    const p: string[] = [];
    const s = await sell([ln("kaprao", 1), ln("kaprao", 1, { choices: ["egg"] }), ln("chayen", 1), ln("khanomkrok", 2)]);
    const r = (await waitRounds(s.saleId))[0];
    if (!r) {
      chk("V1", false, "void → ยกเลิกที่ยังไม่เสิร์ฟ", FX(NCOL() + `ไม่มีรอบของบิล (${SALE_FAIL(s) || "หลังขายไม่มีรอบ — R3"})`));
      return;
    }
    const its0 = await itemsOf(r.id);
    const hot = its0.filter((x) => x.stationId === ST.hot);
    await K("kdsStart", ctxA(), A("COOK"), tk(r.id, ST.hot));
    await K("kdsLineDone", ctxA(), A("COOK"), { itemId: hot[1]?.id ?? "none" });
    await K("kdsTicketDone", ctxA(), A("COOK"), tk(r.id, ST.drink));
    await K("kdsServed", ctxA(), A("COOK"), tk(r.id, ST.drink));
    const pre = (await itemsOf(r.id)).map((x) => `${x.stationId === ST.hot ? "H" : x.stationId === ST.drink ? "D" : "K"}:${x.kdsStatus}`).sort();
    if (pre.join(",") !== ["D:SERVED", "H:COOKING", "H:READY", "K:NEW"].join(",")) p.push(`สถานะก่อน void ${pre.join(",")}`);
    const kk0 = (await menuRow("khanomkrok"))?.stockQty;
    if (kk0 !== 3) p.push(`ขนมครกหลังขาย stockQty ${kk0} (คาด 3 — หักแบบไม่ติดลบ R3)`);
    const vd = await call(billsMod, "voidSaleByActor", ctxA(DEV1), A("OWNER"), { unitId: U.A, saleId: s.saleId, idempotencyKey: newKey("void"), reason: "ลูกค้ายกเลิก" });
    if (vd?.ok !== true) p.push(`void → ${codeOf(vd)} ${short(vd?.message ?? "", 60)}`);
    await drain();
    const post = (await itemsOf(r.id)).map((x) => `${x.stationId === ST.hot ? "H" : x.stationId === ST.drink ? "D" : "K"}:${x.kdsStatus}`).sort();
    if (post.join(",") !== ["D:SERVED", "H:CANCELLED", "H:CANCELLED", "K:CANCELLED"].join(",")) p.push(`สถานะหลัง void ${post.join(",")} (คาด SERVED คงเดิม · ที่เหลือ CANCELLED)`);
    if ((await menuRow("khanomkrok"))?.stockQty !== 5) p.push(`ขนมครก stockQty ${(await menuRow("khanomkrok"))?.stockQty} (คาด 5 — คืนเฉพาะ NEW)`);
    const s0 = await snapItems(r.id);
    const k0 = (await menuRow("khanomkrok"))?.stockQty;
    p.push(...(await replay("pos.sale.voided", (e) => e.payload?.saleId === s.saleId)));
    await drain();
    if ((await snapItems(r.id)) !== s0 || (await menuRow("khanomkrok"))?.stockQty !== k0) p.push("เล่นซ้ำแล้วรายการ/ตัวนับเปลี่ยน");
    chk("V1", NCOL() === "" && p.length === 0, "void → ยกเลิกที่ยังไม่เสิร์ฟ · คืนตัวนับ NEW · เล่นซ้ำไม่เปลี่ยน", FX(NCOL() + (P8(p) || "ครบ")));
  });
  await step("V2", async () => {
    const p: string[] = [];
    if (!SL.K1 || !RD.K1) {
      chk("V2", false, "คืนเงินไม่แตะครัว", FX(NCOL() + `ไม่มีบิล/รอบ K1 (บิล ${SL.K1 ? "มี" : "ไม่มี"} · รอบ ${RD.K1 ? "มี" : "ไม่มี — R3"})`));
      return;
    }
    const line = ((await P.posSaleLine.findMany({ where: { saleId: SL.K1 } }).catch(() => [])) as Any[]).find((l) => l.productId === PP.chayen);
    const s0 = await snapItems(RD.K1);
    const r0 = short(await roundRow(RD.K1));
    const input = (amt: number): Any => ({ saleId: SL.K1, lines: [{ lineId: line?.id ?? "none", qty: 1, restock: false }], payMethods: [{ type: "CASH", amountSatang: amt }], reasonCode: "CHANGED_MIND", reason: "ลูกค้าเปลี่ยนใจ", idempotencyKey: newKey("rf") });
    const probe = await call(refundMod, "refundSale", ctxA(DEV1), A("OWNER"), input(0));
    const amt = Number(/ยอดคืน (\d+)/.exec(String(probe?.message ?? ""))?.[1] ?? NaN);
    const r = await call(refundMod, "refundSale", ctxA(DEV1), A("OWNER"), input(Number.isFinite(amt) ? amt : 4500));
    if (r?.ok !== true) p.push(`refundSale → ${codeOf(r)} ${short(r?.message ?? "", 60)} (probe ${codeOf(probe)} ${amt})`);
    else MY_SALES.push(String(r.refund?.id ?? ""));
    await drain();
    if ((await snapItems(RD.K1)) !== s0 || short(await roundRow(RD.K1)) !== r0) p.push("คืนเงินแล้วรอบครัวเปลี่ยน");
    chk("V2", p.length === 0, "คืนเงินไม่แตะครัว", FX(P8(p) || "ครบ"));
  });

  // ════════ P1 ใบครัว ════════
  console.log("\n── P1 ใบครัว ──");
  await step("P1", async () => {
    const p: string[] = [];
    const r = await K("kitchenSlipPayload", ctxA(), A("COOK"), { orderId: RD.K1 ?? "none" });
    const slips: Any[] = Array.isArray(r?.slips) ? r.slips : [];
    if (r?.ok !== true || slips.length !== 2) p.push(`payload → ${codeOf(r)} ${slips.length} ใบ (คาด 2)`);
    const mk = moneyKeys(r);
    if (mk.length) p.push(`มีคีย์เงิน ${mk.slice(0, 3).join(",")}`);
    const rr = await roundRow(RD.K1 ?? "");
    const hotSlip = slips.find((s) => s.stationName === "ครัวร้อน");
    if (!hotSlip || hotSlip.no !== rr?.dailyNo || hotSlip.copy !== false) p.push(`ใบครัวร้อน ${short(hotSlip && { no: hotSlip.no, copy: hotSlip.copy }, 60)}`);
    const l0 = (hotSlip?.lines ?? [])[0];
    if (!l0 || l0.qty !== 2 || !String(l0.name).includes("กะเพรา") || l0.note !== "ไม่ใส่ถั่ว" || setStr(l0.options ?? []) !== setStr(["เผ็ดกลาง", "ไข่ดาว"])) p.push(`บรรทัด ${short(l0, 120)}`);
    for (const s of slips) for (const k of ["stationName", "no", "sourceLabel", "sentAt", "lines", "copy", "printLocale"]) if (!(k in s)) p.push(`ใบขาดคีย์ ${k}`);
    const one = await K("kitchenSlipPayload", ctxA(), A("COOK"), { orderId: RD.K1 ?? "none", stationId: ST.drink });
    if (one?.ok !== true || (one.slips ?? []).length !== 1 || one.slips[0]?.stationName !== "เครื่องดื่ม") p.push(`stationId → ${codeOf(one)} ${(one?.slips ?? []).length} ใบ`);
    const cp = await K("kitchenSlipPayload", ctxA(), A("COOK"), { orderId: RD.K1 ?? "none", copy: true });
    if (cp?.ok !== true || (cp.slips ?? []).some((s: Any) => s.copy !== true)) p.push(`copy:true → ${codeOf(cp)}`);
    const en = await K("kitchenSlipPayload", ctxA(), A("COOK"), { orderId: RD.K1 ?? "none", locale: "en" });
    if (en?.ok !== true || (en.slips ?? []).some((s: Any) => s.printLocale !== "en" || THAI.test(String(s.sourceLabel ?? "")))) p.push(`locale en → ${codeOf(en)} ${short((en?.slips ?? []).map((s: Any) => [s.printLocale, s.sourceLabel]), 80)}`);
    const np = await K("kitchenSlipPayload", ctxA(), A("NOPERM"), { orderId: RD.K1 ?? "none" });
    if (!refused(np, "PERMISSION_DENIED")) p.push(`NOPERM → ${codeOf(np)}`);
    const nf = await K("kitchenSlipPayload", ctxA(), A("COOK"), { orderId: "qc-no-such-order" });
    if (!refused(nf, "TICKET_NOT_FOUND")) p.push(`รอบมั่ว → ${codeOf(nf)}`);
    chk("P1", NK("kitchenSlipPayload") === "" && p.length === 0, "ใบละสถานี · ไม่มีเงิน · copy · locale · สิทธิ์ · ขอบเขต", FX(NK("kitchenSlipPayload") + (P8(p) || "ครบ")));
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
  await runPure(sharedMod, slipMod, devSharedMod);
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
  await n("menuItem", () => P.menuItem.count({ where: { name: { contains: RAND }, createdAt: { gte: since } } }));
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
const depRed = failed.filter((id) => results.get(id)?.actual.startsWith("SKIP-until-export"));
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""} · PAR ${parIds.length - parRed.length}/${parIds.length} · SKIP-until-export ${depRed.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, parRed, depSkipped: depRed, skipped: false, forced: FORCE, missing: skipReasons, depP24, depP28, guardHits: guardHits.length, residue: tempLeft.length + wipe.tenantLeft + wipe.usersLeft, leaks, fpDrift })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P2.6 S: จอ /app/sys/[id]/pos/kds (ภาพ 04) · ไทล์ "หมด · ครัวแจ้ง HH:MM" · ชิป 06 · มิเตอร์ 09 "ครัวกำลังทำ x/y" · 17B ฟอร์มใบครัว ·
//   visual-pos p2.6u (P2.6U · ผู้คุมงาน) · การพิมพ์จริงผ่าน WebUSB/Bluetooth (ฝั่ง client) · LAN (P3.11) · push จริงไปแพลตฟอร์ม (P3.1–3.3) ·
//   การ์ด Kanban ของหมด (P3.8) · 86 รายช่องทาง/ปลดอัตโนมัติรายวัน (P3) · event ของทางร้อน QR (P2.7)
//   ชุด regression (qc-restaurant* · qc-pos-p2.4 · p2.8 · p2.3 · p2.2 · p2.1 · p1.1 S2.41–S2.43 · p1.3 p1.5 p1.6 p1.9 p1.10 p1.12 p1.16 p1.18 · ชุดเงิน · fitness-pos) ผู้สร้างรันก่อน/หลัง (ผลต้องเท่าเดิม)
