// QC — POS RUN ใบ P2.14: ปิดเฟส 2 (qc:all = ชุดด่าน P2 · parity ทุกจอ · HANDOVER-P2) + ไล่เก็บ follow-up ของเฟส 2 (ถังที่ไม่เคยเปิด "HF-FU2")
//   เขียนก่อนสร้าง (fail-before) · ผู้สร้าง (builder) P2.14 S หลัง P2.7U merge · ฐานข้อสอบ session/pos 92b7149d
// requires: (ไม่ต้อง seed — ร้านชั่วคราว posqc-p214-<rand> ของข้อสอบเอง · Z2 อ่านลายนิ้วมือนอกร้านชั่วคราว)
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.14.md ⚠️1–11 · §0 · §1 · ตาราง 94 แถว · §2 (รหัสข้อ) · §3 · §10 มติ 1–11 (ผูกมัด · §10 ชนะ §2) ·
//   ตารางชื่อเต็ม + drift + ORACLE-EDIT/ADD (file:line) + CONTROLLER-DECISION = ledger/wo-notes/pos-P2.14-oracle.md
//
// ชื่อที่ข้อสอบนี้ตั้ง (ผู้สร้างต้องทำให้มีจริง) — ย่อ (ฉบับเต็มในโน้ต):
//   LEG  src/lib/modules/pos/legacy-door.ts  posLinkedLegacyDoor(tenantId, unitId, opts?: {write?: boolean; db?: client}) → Promise<boolean>
//        (true = สาขาผูก POS ⇒ ประตูเดิมปิด · ค้นไม่ได้/DB ล้ม ⇒ write ? true : false · ไม่ throw) — ใช้ใน route เดิม 5 ตัว · action เดิม 6 ตัว · หน้าเดิม 5 หน้า · AI ปิดบิล
//        route เดิม (api/store/…/restaurant/{order,session,service-request} · (store)/s/…/restaurant/{bill,notify-payment}) บนสาขาที่ผูก POS =
//        409 {error:"POS_LINKED", door:"/q/t/<qrToken>"} ก่อนเรียก storefront · สาขาไม่ผูก POS = ไฟล์ฐาน + บล็อก // POS P2.14 ▸ … ◂ เท่านั้น
//        action เดิม checkoutAction/advanceItemAction คืน {ok:false, code:"POS_LINKED"} · action void-return = redirect/ปฏิเสธ (ไม่มีผล) · AI restaurant_close_bill = throw
//   API-1  POST /sales เงินสดไม่ส่ง shiftId: requiredOtherSources เปิด ⇒ กะเปิดกะเดียวของสาขา (0 หรือ ≥ 2 = ปฏิเสธ SHIFT_REQUIRED) · ปิด ⇒ data.outOfShift = true
//   API-2  revokePosApiKeyAction: ผู้เพิกถอนต้องครอบทุกสาขาของคีย์ (คีย์ไม่จำกัดสาขา = ต้องดูแลทุกสาขา) ไม่งั้น PERMISSION_DENIED
//   API-3  audit ของ catalog เมื่อคีย์ API เขียน = actorType "API_KEY" + actorId = keyId (ไม่มี "apikey:")
//   API-4  posApprovalCards: requestedById = keyId ⇒ requesterName "API: <ชื่อคีย์>"
//   API-5  POST /sales/{id}/tax-invoice ส่ง serviceKey "pos-api:<keyId>:<saleId>" ⇒ audit pos.taxinvoice.issued after.serviceKey
//   API-9  REST void/refund ⇒ audit pos.sale.void / pos.sale.refund after.source = "API" (มือคน = ไม่มี "API")
//   API-10 GET /sales/{id} data.totals = {subtotalSatang lineDiscountSatang billDiscountSatang couponSatang tierSatang serviceChargeSatang vatSatang
//          grandTotalSatang tipSatang refundedSatang} (+vatRateBp ได้) · billDetail ของลิ้นชัก (facade) คงคีย์เดิม · gen-pos-api-docs --check = 0
//   API-11 CSV_HEADERS.daily มี "จำนวนคืนเงิน" "ยอดคืนเงิน" = refundCount / refundTotalSatang ของ JSON
//   DSP-1  publishDisplayState: จอ = จอของ ctx.deviceId (เครื่องของหน้าขาย) · input.deviceCode ≠ ctx.deviceId หรือ ctx ไม่มี deviceId ⇒ ไม่เขียน
//   QR-1   expirePreorders: NEW + PREPAID ที่ใบเงิน paidAt + 24 ชม. ≤ ตอนนี้ ⇒ CANCELLED + PosOrderEvent "expired_paid" + ops "pos.payment.refund_needed"
//          (ไม่มี enum ใหม่ · มติ 9) · releaseHeldOrders กวาด held ของวันก่อนด้วย (ไม่จำกัดต้นวันนี้)
//   QR-2   เงินเข้าหลังออเดอร์ปิด ⇒ PosOrderEvent "refund_needed" 1 แถว · orderStatus().view.refundPending อ่านแถวนี้ (ถาวร แม้ใบเปลี่ยนสถานะ)
//   QR-3   รอบของแขก / สั่งล่วงหน้า กันซ้ำด้วย pg_advisory_xact_lock + ค้น 10 วิ ใน DB (สองโปรเซส = 1 รอบ · 1 ใบ · Beam charge 1)
//   ORD-1..6 · DEP-1 (depositId ในคำปฏิเสธ) · PRC-1..3 (origin "own"|"inherited" ในเซลล์ unitPriceMatrix) · ACC-2 · TL-5 · RPT-1..5 · UI-4 · UI-8 — ดูหัวข้อแต่ละข้อ
//   DOC/TL scripts/pos-gates.json + scripts/pos-gates-all.sh (--dry) · scripts/pos-visual-sweep.json · scripts/qc-all-discovery.mts isQcAllSuite ·
//          skills/shark-pos-api/** (tracked) + scripts/sync-skills.sh · ledger/HANDOVER-2026-10-xx-POS-P2.md · ledger/wo-notes/pos-P2.14-parity.md
//
// 🔴 กติกาข้อสอบ (แบบ qc-pos-p2.13): SKIP เมื่อของหลักของใบยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต (K G V H A9) แบบอ่านไฟล์ (ไม่โหลด prisma)
//    SKIP-with-reason (มติ 10): ส่วนที่ต้องรอ P2.7U (qr-public · /q/** ใน POS_PAGES/ทะเบียนปุ่ม) และ K3 (รอชุด re-pin ท้ายใบ · มติ 3) — นับผ่านพร้อมเหตุผล แม้ QC_FORCE
//    ฐาน = QC4 เท่านั้น · ร้านชั่วคราวลบใน finally · ไม่มีเครือข่าย (globalThis.fetch = ตัวกั้น) · SQL ดิบเฉพาะแถวของร้านชั่วคราว
//    Q5/Q6 = โปรเซสลูก 2 ตัว (สคริปต์นี้ --child …) = "สองเครื่อง" จริง (Prisma คนละตัว · หน่วยความจำคนละก้อน)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.14";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const CHILD = process.argv.includes("--child");
const FORCE = process.env.QC_FORCE === "1";
/** ฐานของข้อสอบ (session/pos 92b7149d) — ไฟล์เดิมที่ใบนี้แตะได้แค่บล็อก // POS P2.14 ▸ … ◂ เทียบกับฐานนี้ */
const BASE_REV = process.env.P214_BASE || "92b7149d";

// ═════════════════════════ ทะเบียนข้อสอบ ═════════════════════════
// X-group: L ประตูเดิม · A REST/คีย์ · D จอลูกค้า · Q QR · O ออเดอร์ · P ราคา/มัดจำ/ช่องทาง · R รายงาน · U จอ · K เอกสาร/เครื่องมือ · G ด่าน · V ภาพ · H ส่งมอบ · Z คืนสภาพ
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.14-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── L ประตูร้านอาหารเดิมบนสาขาที่ผูก POS (LEG-1–4 · มติ 1 "guard, not delete") ──
  D("L1", "L", "[F1 LEG-1 มติ 1] route เดิม 5 ตัว (api/store/…/restaurant/{order,session,service-request} · (store)/s/…/restaurant/{bill,notify-payment}) บนสาขา A ที่ผูก POS → 409 {error POS_LINKED, door /q/t/<qrToken>} · ไม่มี TableSession/RestaurantOrder/คำขอบริการใหม่ · ทุก route เรียก posLinkedLegacyDoor ก่อน storefront"),
  D("L2", "L", "[F1 ตัวควบคุม] สาขา N ไม่ผูก POS: route เดิม 5 ตัวตอบแบบเดิม (session/order/service-request/bill/notify-payment = 200 ok) · ไฟล์ route ทั้ง 5 = ฐาน 92b7149d + บล็อก // POS P2.14 ▸ … ◂ เท่านั้น"),
  D("L3", "L", "[F1 LEG-2/4] action เดิมบนสาขา A ปฏิเสธ (checkoutAction · confirmPromptpayPaymentAction · cancelOrderItemAction · mergeSessionAction · advanceItemAction · recallItemAction) ไม่มีบิล/ไม่ยกเลิก/ไม่รวม/ไม่เลื่อน · + voidCheckoutAction (0 VOIDED · บิลยัง PAID · โต๊ะเดิม) · createStaffOrderAction (0 รอบ) · ผู้เขียนเดิมทุกตัวมีด่าน · ตัวควบคุม: advanceItemAction ที่สาขา N เลื่อนได้ · หน้าเดิม 5 หน้า (checkout/[sessionId] tables/[sessionId] order kds kds/[stationId]) เรียก guard + redirect ไป /pos/"), // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 LEG-2b · H3)
  D("L4", "L", "[F1 LEG-3] ข้อเสนอ AI restaurant_close_bill บนโต๊ะของสาขา A (runKind) → ปฏิเสธ (throw) · ไม่มี PosSale · session ยัง OPEN"),
  D("L5", "L", "[F1 มติ 1 fail-closed] posLinkedLegacyDoor(T, A) = true · (T, N) = false · DB ล้ม (client ที่ throw) + write → true (ปิด) · ไม่ throw"),
  // ── A REST /api/v1/pos + คีย์ (API-1..11) ──
  D("A1", "A", "[F2 API-1 มติ 2] POST /sales เงินสดไม่ส่ง shiftId: otherSources ปิด → 200 data.outOfShift true (บิลไม่มีกะ) · เปิด + 0 กะ → ปฏิเสธ 0 บิล · 1 กะ → ผูกกะนั้น · ≥ 2 กะ → ปฏิเสธ SHIFT_REQUIRED 0 บิล · ≥ 2 กะ + shiftId ที่ถูก → ผูกกะนั้น"),
  D("A2", "A", "[F4 API-2] revokePosApiKeyAction ของคนที่ดูแลสาขา A เท่านั้น: คีย์จำกัดสาขา B / คีย์ไม่จำกัดสาขา → PERMISSION_DENIED ไม่ถูกเพิกถอน · คีย์จำกัดสาขา A → ok · ตัวควบคุม: เจ้าของเพิกถอนคีย์ไม่จำกัดสาขาได้"),
  D("A3", "A", "[F4 API-3 มติ 9] POST /products ด้วยคีย์ pos-admin → แถว audit ของ catalog (pos.product.*) actorType API_KEY · actorId = keyId · ไม่มีแถว actorId ขึ้นต้น apikey:"),
  D("A4", "A", "[F4 API-4] posApprovalCards: คำขอที่ requestedById = keyId → requesterName \"API: <ชื่อคีย์>\" · คำขอของคนจริง → ชื่อคน (ตัวควบคุม)"),
  D("A5", "A", "[F4 API-5] tax-invoice ผ่าน REST: ops/sales.ts ส่ง serviceKey pos-api:<keyId>:<saleId> · audit pos.taxinvoice.issued after.serviceKey ตรงตัว · ยิงซ้ำคีย์ Idempotency ใหม่ = เอกสารเดิม"),
  D("A6", "A", "[F4 API-9] REST void → audit pos.sale.void after.source \"API\" · REST refund → audit pos.sale.refund after.source \"API\" · void ของคนที่ลิ้นชักบิล → ไม่มี source API"),
  D("A7", "A", "[C9 API-6] REST void บิลของออเดอร์ทุกสถานะ (ACCEPTED PREPARING READY HANDED) → ระบายคิว: ยังไม่ส่งมอบ = CANCELLED + REFUNDED · ส่งมอบแล้ว = HANDED + REFUNDED · ระบายซ้ำไม่เปลี่ยน"),
  D("A8", "A", "[C9 API-7] เล่นซ้ำหลัง TTL 24 ชม. (ลบแถว ApiIdempotency) โดยไม่ส่ง expectedGrandTotalSatang ขณะสินค้าถูก 86 → 200 saleId เดิม (ค้นคีย์ก่อน quote) · ยังคง 1 บิล"),
  D("A9", "A", "[C9 API-8 static] กฎรูปคำตอบทั้งทะเบียน: op ชนิด write/danger ทุกตัวคืน data รูปคงที่ (ไม่ return posData( ตรงจาก facade ที่ผลมีฟิลด์ duplicated ได้) — posResult/วัตถุระบุคีย์"),
  D("A10", "A", "[C10 API-10 มติ 8] GET /sales/{id} data.totals = 10 คีย์ *Satang ตัวเลขตรงบิล · ไม่มีคีย์เดิม (subtotal grandTotal refunded …) · billDetail ของลิ้นชักคงคีย์เดิม · gen-pos-api-docs --check exit 0"),
  D("A11", "A", "[C10 API-11 มติ 8] CSV daily มีคอลัมน์ จำนวนคืนเงิน · ยอดคืนเงิน = refundCount / refundTotalSatang ของ JSON (วันที่มีใบคืน)"),
  // ── D จอลูกค้า ──
  D("D1", "D", "[F3 DSP-1 มติ 9] แคชเชียร์บนเครื่อง X (ctx.deviceId X) ส่งภาพให้จอของ Y → จอ Y ไม่ถูกเขียน · ctx ไม่มี deviceId → ไม่เขียน · ตัวควบคุม: deviceCode X จาก X → เขียนจอ X"),
  D("D1b", "D", "[fix1 H4 DSP-1b] ผ่าน publishDisplayStateAction (session จริง): แคชเชียร์ (ไม่มีกะ) และเจ้าของ (กะ OPEN ที่ X) ส่ง {deviceId:Y, deviceCode:Y} ปลอม → DEVICE_NOT_REGISTERED · จอ Y ไม่เปลี่ยน · ตัวควบคุม: เจ้าของ deviceCode X → เขียนจอ X"), // ORACLE-ADD ผู้คุม 16 ต.ค. (P2.14 H4 · D1b)
  // ── Q QR / สั่งล่วงหน้า ──
  D("Q1", "Q", "[F5 QR-1a มติ 9] ออเดอร์ PREPAID ที่ไม่มีใครรับ เงินเข้าเกิน 24 ชม. → expirePreorders → CANCELLED · PosOrderEvent expired_paid 1 · ops pos.payment.refund_needed 1 · หน้าสถานะ refundPending true · acceptOrder หลังนั้นไม่ใช่ INTENT_EXPIRED ค้าง"),
  D("Q2", "Q", "[F5 QR-1b] ออเดอร์ held (พักครัว) ที่รับเข้าเมื่อวาน → releaseHeldOrders → ACCEPTED (ไม่จำกัดต้นวันนี้)"),
  D("Q3", "Q", "[F5 X9] เล่นซ้ำ: expirePreorders ×2 + ระบาย ×2 → expired_paid 1 · ops refund_needed 1 · outbox pos.order.cancelled 1 · เงินเข้าซ้ำของ Q4 → refund_needed 1"),
  D("Q4", "Q", "[F6 QR-2] ปฏิเสธตอนรอเงิน แล้วเงินเข้า → PosOrderEvent refund_needed 1 · orderStatus refundPending true · ใบเปลี่ยนสถานะภายหลัง (EXPIRED) → refundPending ยัง true (ถาวร)"),
  D("Q5", "Q", "[F7 QR-3 มติ 9] รอบของแขก (guestToken + ตะกร้าเดียวกัน) ส่งพร้อมกันจาก 2 โปรเซส → รอบครัว 1 รอบ"),
  D("Q6", "Q", "[F7 QR-3] สั่งล่วงหน้าคีย์เดียวกันพร้อมกันจาก 2 โปรเซส (Beam ปลอม 1.5 วิ) → ออเดอร์ 1 · ใบขอรับเงิน 1 · createCharge 1"),
  // ── O ออเดอร์ ──
  D("O1", "O", "[C8 ORD-2/6] ล็อก posorder-release ถูกถือ → releaseHeldOrders (ทางอ่าน) คืนเร็ว (< 2 วิ) swept:false ไม่รับ · ปล่อยล็อกแล้วกวาด = ACCEPTED · re-read ช่องทาง FOR SHARE"),
  D("O2", "O", "[C8 ORD-3] ingest รับอัตโนมัติถือล็อกเดียวกับตัวกวาด: ระหว่างล็อกถูกถือ ingest ไม่รับอัตโนมัติจนกว่าล็อกจะว่าง (รอ หรือคง NEW + held)"),
  D("O3", "O", "[C8 ORD-4] ทิ้งรอบร่างกำพร้า: ล็อก session ก่อนอ่านซ้ำ — ธุรกรรมอื่นถือ session (เปิดกลับ OPEN) ขณะกวาด → ร่างยัง HELD"),
  D("O4", "O", "[C8 ORD-5] บิลของออเดอร์ถูกคืนเงินครบ (REFUNDED) → handOver ปฏิเสธ · ออเดอร์ไม่เป็น HANDED"),
  D("O5", "O", "[C8 ORD-1 · ORD-1b] ประตูเว็บ ingestInTx ใช้การมองเห็นตามคลังของสาขา (C3) เมื่อสาขาผูกคลัง: สินค้าคลังที่สาขา W (ผูกคลังอื่น) → PRODUCT_NOT_FOUND lineIndex 0 · สาขา A → ok · สาขา B (ไม่ผูกคลังเลย) → ok ตามกติกาเดิม"), // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ORD-1b · CD-B5)
  D("O5b", "O", "[fix1 H1 ORD-1b] เว็บร้าน createOrder: สินค้าที่สาขาผูกคลังมองไม่เห็น → throw · ShopOrder 0 · PosSale 0 · PosOrder 0 · สาขาไม่ผูกคลัง → ShopOrder 1 + PosOrder 1 · ไม่มี ShopOrder ที่ไม่มี PosOrder ในร้านนี้"), // ORACLE-ADD ผู้คุม 16 ต.ค. (P2.14 ORD-1b · O5b)
  D("O5c", "O", "[fix2 G1/H2] เว็บร้านสาขาผูก POS (A): สินค้าราคาเกิน ORDER_UNIT_PRICE_MAX → createOrder throw · ShopOrder 0 · ร้านนี้ไม่มีบิล ECOM ที่ไม่มี PosOrder (สาขาผูก POS)"), // ORACLE-ADD ผู้คุม 16 ต.ค. (P2.14 G1/H2 · O5c)
  // ── P ราคา · มัดจำ · ช่องทาง · บัญชี · จอ ──
  D("P1", "P", "[C11 DEP-1] คำปฏิเสธ DEPOSIT_NOT_FOUND / DEPOSIT_NOT_OWNER / DEPOSIT_LOCKED มี depositId ของแถวนั้น"),
  D("P2", "P", "[C11 PRC-1] bulkChannelMarkup level-aware: (code, ทุกสาขา) notSold → ปรับที่ (code, A) ข้าม · (null, A) notSold → ปรับที่ (code, ทุกสาขา) ข้าม · สินค้ายังไม่ขาย"),
  D("P3", "P", "[C11 PRC-2] saveChannel แก้โดยไม่ส่ง name → ok ชื่อเดิม · audit pos.channel.updated อยู่ในธุรกรรมเดียวกับการเขียน (xmin เดียวกัน)"),
  D("P4", "P", "[C11 PRC-3] unitPriceMatrix เซลล์มี origin: แถว (code, A) = own ที่ A · (code, ทุกสาขา) = inherited ที่ B · ราคาฐาน = null · source เดิมคงอยู่"),
  D("P5", "P", "[C11 ACC-2 static] account-bridge: reason other-book ไม่เข้าข้อความ WARN \"บรรทัดถูกปฏิเสธ/สมุดออกไม่ได้\" ทั้งสองทาง"),
  D("P6", "P", "[C11 TL-5] displayStateSchema ปฏิเสธ totals.member ที่ไม่มี kind · /d ล้างคุกกี้ค้างเมื่อ SSR อ่านได้ DISPLAY_NOT_PAIRED (clearDisplayCookieAction + staleCookie)"),
  // ── R รายงาน ──
  D("R1", "R", "[C12 RPT-1] A5 นับ pos.discount.override บน PosTableSplit (ผู้อนุมัติคนเดียว 3 แผน/วัน → แถว A5 count 3)"),
  D("R2", "R", "[C12 RPT-2] reportStaff แถวมี staffDiscountSatang (ฐาน A3) + a3Flag: ส่วนลดท้ายบิลของพนักงาน 30% → true · ส่วนลดสมาชิกล้วน → staffDiscount 0 · false"),
  D("R3", "R", "[C12 RPT-3] บิลวันนี้จัดวันตามวันธุรกิจ (ตัดวัน 04:00): บิล 02:00 ของเมื่อวาน = วันก่อนหน้า ไม่ใช่เมื่อวาน"),
  D("R4", "R", "[C12 RPT-5] บิลทุกสาขา กรองรหัสช่องทาง (channelCode LINEMAN) ข้ามสาขา → เฉพาะบิล LINEMAN ของ A และ B"),
  D("R5", "R", "[U13 UI-4] billDetail บรรทัดมี costSatang (จากความเคลื่อนไหวสต็อกของบิล) + marginSatang · ประวัติสต็อก (posStockHistoryAction) แถวของบิลมี sale {receiptNo lineName qty}"),
  D("R5b", "R", "[fix1 H2] ต้นทุน/กำไรต่อบรรทัด = pos.report.view เท่านั้น: แคชเชียร์ (CASH) billDetail → costSatang/marginSatang null · คีย์ API มีแค่ pos.sale.read → GET /sales/{id} ไม่มีฟิลด์ · คีย์ pos-read (มี report.view) → ค่า · เจ้าของ → ค่า"), // ORACLE-ADD ผู้คุม 16 ต.ค. (P2.14 H2 · R5b)
  // ── U จอ ──
  D("U1", "U", "[U13 UI-8] saleNeedsKitchen: บิลสินค้าปลีกล้วน → false · บิลเมนูที่มีสถานี → true · kdsQueueNoAction คืน kitchen · PayDone แสดง kitchenNoTicket เฉพาะเมื่อ kitchen"),
  // ── K เอกสาร/เครื่องมือ ──
  D("K1", "K", "[D14 DOC-1 มติ 8] facts การ์ด 10: platformCommission true · tableReservationsOnMap true · callQueueFromTable/voucherPayment/advanceBookingBill false \"P4+\" (CD-P312-K1 · เดิม \"P3\") · ไม่มี fact false ที่ติดป้ายใบที่ปิดแล้ว (แถว P2 ✅ ใน POS-MASTER-PLAN = P2.1–P2.13)"),
  D("K2", "K", "[D15 DOC-2 มติ 4] git ls-files skills/shark-pos-api/{SKILL.md, references/recipes.md, references/endpoints.md} · gen-pos-api-docs/qc-pos-p2.13/qc-pos-api-skill อ่านทางนี้ (ไม่อ่าน .claude/skills/shark-pos-api) · scripts/sync-skills.sh (สองบ้าน · เทียบไบต์)"),
  D("K3", "K", "[D16 TL-1 มติ 3] ไม่มี qc-* ใช้ merge-base กับ origin/session/pos (allow-list ว่างหลังชุด re-pin) — SKIP-with-reason จนชุด re-pin ท้ายใบลง"),
  // ── G ด่าน ──
  D("G1", "G", "[D17 มติ 5] scripts/pos-gates.json ครอบทุก qc-pos-* · qc-hf-* · ชุด regression (MASTER-PLAN §1 + มติ 5) · คำสั่ง fitness ±env/fitness-pos/gen-check/typecheck/visual · runner scripts/pos-gates-all.sh (ไม่ export CI · QC4 + ล็อก POS · SUMMARY.txt · --dry = แผนครบทุกแถว)"),
  D("G2", "G", "[D17] ไม่มีแถวชี้ไฟล์ที่ไม่มี · mode forced|unforced ตามด่าน SKIP ของชุด · needs ตรงเครื่องหมาย // requires: · ไม่มีชื่อซ้ำ"),
  D("G3", "G", "[D17] ทุกชุดในแผนผ่านตัวกรองของ qc-all เอง (scripts/qc-all-discovery.mts isQcAllSuite · qc-all.mts ใช้ตัวเดียวกัน)"),
  D("G4", "G", "[D17 มติ 5] แดงที่ยอมรับ (accepted) มี reason + owner + opRef ที่มีอยู่จริงใน POS-OWNER-PENDING.md"),
  // ── V ภาพ ──
  D("V1", "V", "[D18 มติ 6] scripts/pos-visual-sweep.json: ทุก POS_PAGES มีรอบ th และ en · visual-pos มี EN_MOBILE_PAGES (register sales receipt-public display + qr-public) — qr-public SKIP-with-reason จน P2.7U"),
  D("V2", "V", "[D18] ทุกค่าคงที่ wo-gated (/^p…/i.test(WO)) ของ visual-pos.mts มีรอบที่ wo ตรง"),
  D("V3", "V", "[D18] ทุก page.tsx ใต้ sys/[id]/pos/** · (store)/{d,r,q}/** · developers/pos แมปกับหน้าใน POS_PAGES หรือข้อยกเว้นที่ระบุ · หน้าสาธารณะมีแถวทะเบียนปุ่ม — /q/** SKIP-with-reason จน P2.7U"),
  D("V4", "V", "[D18 ⚠️6] ทุกหน้าพนักงานของ POS มีแถว pos-ui-inventory.json และ (หมุดสิทธิ์ใน qc-hf-pos-page-authz หรือการ์ดปฏิเสธในหน้าที่ระบุในแมนิเฟสต์) — ORACLE-ADD stock/shifts/settings/reports/price-rules"),
  // ── H ส่งมอบ ──
  D("H1", "H", "[D19 มติ 7] ledger/HANDOVER-2026-10-xx-POS-P2.md มี §0–§7 · ทุกแถว P2.1–P2.14 + P2.9b + ใบ U ทุกใบ + HF ของเฟส มี SHA ที่เป็นบรรพบุรุษของ HEAD"),
  D("H2", "H", "[D19 DOC-5] POS-CONTRACTS.md ตาราง event ⊇ ทุกคีย์ pos.* ใน outbox-consumers.ts (ตรงตัวพิมพ์)"),
  D("H3", "H", "[D19] ledger/wo-notes/pos-P2.14-parity.md มีแถว · OPEN 0 · DEVIATION มีอ้างอิงมติ"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว 0 แถวทุกตารางที่มี tenantId + Tenant ถูกลบ · ผู้ใช้/เซสชันของรอบ 0 · ถังเพดานอัตราของรอบ 0"),
  D("Z2", "-", "ลายนิ้วมือนอกร้านชั่วคราว (PosSale · PosOrder · PosProduct · SalesChannel · TableSession · PosCustomerDisplay · ApiKey ของร้าน seed) เท่าเดิม"),
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
const results = new Map<string, { ok: boolean; expected: string; actual: string; skip?: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = id.startsWith("P2.14-") ? id : `P2.14-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
/** SKIP-with-reason (นับผ่าน · มติ 10: ส่วนที่รอ P2.7U · K3 รอชุด re-pin) */
function skipChk(id: string, why: string): void {
  const full = `P2.14-${id}`;
  results.set(full, { ok: true, expected: "-", actual: "-", skip: why });
  console.log(`  ⏭  [${full}] ${TITLE.get(full)} — SKIP: ${why}`);
}
const abs = (p: string) => (p.startsWith("/") ? p : join(ROOT, p));
const ex = (p: string) => existsSync(abs(p));
const rd = (p: string) => (ex(p) ? readFileSync(abs(p), "utf8") : "");
const short = (v: unknown, n = 200) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
const joinP = (p: string[], ok = "ครบ") => p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "") || ok;
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const THAI = /[ก-๛]/;
function walk(dir: string, out: string[] = [], re = /\.(tsx|ts)$/): string[] {
  const a = abs(dir);
  if (!existsSync(a)) return out;
  for (const f of readdirSync(a)) {
    const rel = `${dir}/${f}`;
    if (statSync(abs(rel)).isDirectory()) walk(rel, out, re);
    else if (re.test(f)) out.push(rel);
  }
  return out;
}
/**
 * ตัดคอมเมนต์แบบไล่ตัวอักษร (เคารพสตริง '…' "…" `…` และคอมเมนต์บรรทัด) — แก้ปัญหาแบบ regex ที่ /* ในคอมเมนต์บรรทัดกลืนโค้ดยาว (TL-2 ของ p2.9b)
 * regex literal ไม่ได้แยกพิเศษ (พอสำหรับการค้นข้อความในข้อสอบ)
 */
function stripCode(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      const e = src.indexOf("*/", i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      out += c;
      i++;
      while (i < n && src[i] !== q) {
        if (src[i] === "\\" && i + 1 < n) {
          out += src[i]! + src[i + 1]!;
          i += 2;
          continue;
        }
        if (q !== "`" && src[i] === "\n") break;
        out += src[i]!;
        i++;
      }
      if (i < n) out += src[i]!;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
const srcOf = (f: string) => stripCode(rd(f));
function gitBuf(args: string[]): Buffer | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
}
const gitStr = (args: string[]) => gitBuf(args)?.toString("utf8") ?? null;
const gitOk = (args: string[]): boolean => {
  try {
    execFileSync("git", ["-C", ROOT, ...args], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const showAt = (rev: string, f: string): string | null => gitStr(["show", `${rev}:${f}`]);
/** บรรทัดในบล็อก // POS P2.14 ▸ … ◂ (บรรทัดเดียวหรือหลายบรรทัด) */
function markedLines(src: string): Set<number> {
  const lines = src.split("\n");
  const mk = new Set<number>();
  let open = false;
  lines.forEach((l, i) => {
    const starts = /POS P2\.14\s*▸/.test(l);
    if (starts || open) mk.add(i);
    if (starts && !l.includes("◂")) open = true;
    else if (open && l.includes("◂")) open = false;
  });
  return mk;
}
const normBlank = (s: string) => s.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "").join("\n");
const withoutMarked = (src: string) => {
  const mk = markedLines(src);
  return normBlank(src.split("\n").filter((_, i) => !mk.has(i)).join("\n"));
};
/** เนื้อฟังก์ชัน export (โค้ดตัดคอมเมนต์แล้ว) — จบที่ export ถัดไป */
function fnBody(code: string, name: string): string {
  const m = new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`).exec(code);
  if (!m) return "";
  const rest = code.slice(m.index + m[0].length);
  const nx = rest.search(/\nexport\s/);
  return nx < 0 ? rest : rest.slice(0, nx);
}
// ── สตริงที่ข้อสอบนี้ค้นในไฟล์อื่น (ประกอบตอนรันเพื่อไม่ให้ไฟล์นี้ชนกฎของตัวเอง — K3) ──
const ORIGIN_POS = ["origin", "session", "pos"].join("/");
const MERGE_BASE = ["merge", "base"].join("-");

// ── ประตูเดิม: ชื่อที่นับเป็น "เรียก guard" = posLinkedLegacyDoor · ชื่อที่ import จาก legacy-door · ฟังก์ชันในไฟล์ที่เรียกชื่อเหล่านั้น ──
function doorCallNames(code: string): string[] {
  const names = new Set<string>(["posLinkedLegacyDoor"]);
  for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*legacy-door["']/g))
    for (const n of m[1]!.split(",")) {
      const x = (n.trim().split(/\s+as\s+/).pop() ?? "").trim();
      if (/^\w+$/.test(x)) names.add(x);
    }
  const defs = [...code.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(|(?:^|\n)\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g)].map((m) => ({ name: m[1] ?? m[2] ?? "", at: m.index ?? 0 }));
  for (let pass = 0; pass < 3; pass++)
    defs.forEach((d, i) => {
      if (!d.name || names.has(d.name)) return;
      const body = code.slice(d.at, defs[i + 1]?.at ?? code.length);
      const inner = body.slice(body.indexOf("(") + 1);
      if ([...names].some((n) => new RegExp(`\\b${n}\\s*\\(`).test(inner))) names.add(d.name);
    });
  return [...names];
}
/** ตำแหน่งแรกที่เรียกชื่อใดชื่อหนึ่ง (ไม่นับบรรทัดประกาศฟังก์ชัน) · -1 = ไม่เรียก */
function firstDoorCall(code: string, names: string[]): number {
  const masked = code.replace(/function\s+(\w+)\s*\(/g, "function __def(").replace(/const\s+(\w+)\s*=\s*(async\s*)?\(/g, "const __def = (");
  const idx = names.map((n) => masked.search(new RegExp(`\\b${n}\\s*\\(`))).filter((i) => i >= 0);
  return idx.length ? Math.min(...idx) : -1;
}
/** CSV แบบมีเครื่องหมายคำพูด (RFC 4180 อย่างง่าย) */
function csvParse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}
const POS_DIR = "src/lib/modules/pos";
const F = {
  legacyDoor: `${POS_DIR}/legacy-door.ts`,
  qrOrder: `${POS_DIR}/qr-order.ts`,
  order: `${POS_DIR}/order.ts`,
  actRest: "src/lib/actions/restaurant.ts",
  proposals: "src/lib/ai/proposals.ts",
  integrations: "src/lib/pos-integrations.ts",
  plan: "ledger/POS-MASTER-PLAN.md",
  contracts: "ledger/POS-CONTRACTS.md",
  ownerPending: "ledger/POS-OWNER-PENDING.md",
  outbox: "src/lib/outbox-consumers.ts",
  gates: "scripts/pos-gates.json",
  gatesRunner: "scripts/pos-gates-all.sh",
  sweep: "scripts/pos-visual-sweep.json",
  qcAll: "scripts/qc-all.mts",
  qcAllDiscovery: "scripts/qc-all-discovery.mts",
  visual: "scripts/visual-pos.mts",
  qcEnv: "scripts/pos-qc-env.mts",
  inventory: "scripts/pos-ui-inventory.json",
  authz: "scripts/qc-hf-pos-page-authz.mts",
  skillDir: "skills/shark-pos-api",
  syncSkills: "scripts/sync-skills.sh",
  gen: "scripts/gen-pos-api-docs.mts",
  p213: "scripts/qc-pos-p2.13.mts",
  apiSkill: "scripts/qc-pos-api-skill.mts",
  opsDir: `${POS_DIR}/api/ops`,
  opsSales: `${POS_DIR}/api/ops/sales.ts`,
  bridge: `${POS_DIR}/account-bridge.ts`,
  dPage: "src/app/(store)/d/page.tsx",
  dActions: "src/app/(store)/d/actions.ts",
  payDone: "src/components/pos/register/PayDone.tsx",
  kdsActions: `${POS_DIR}/kds-actions.ts`,
  parity: "ledger/wo-notes/pos-P2.14-parity.md",
};
const LEGACY_ROUTES = [
  "src/app/api/store/[tenantSlug]/[unitSlug]/restaurant/order/route.ts",
  "src/app/api/store/[tenantSlug]/[unitSlug]/restaurant/session/route.ts",
  "src/app/api/store/[tenantSlug]/[unitSlug]/restaurant/service-request/route.ts",
  "src/app/(store)/s/[tenantSlug]/[unitSlug]/restaurant/bill/route.ts",
  "src/app/(store)/s/[tenantSlug]/[unitSlug]/restaurant/notify-payment/route.ts",
] as const;
const LEGACY_PAGES = [
  "src/app/app/u/[unitSlug]/restaurant/checkout/[sessionId]/page.tsx",
  "src/app/app/u/[unitSlug]/restaurant/tables/[sessionId]/page.tsx",
  "src/app/app/u/[unitSlug]/restaurant/order/page.tsx",
  "src/app/app/u/[unitSlug]/restaurant/kds/page.tsx",
  "src/app/app/u/[unitSlug]/restaurant/kds/[stationId]/page.tsx",
] as const;
const LEGACY_ACTIONS = ["checkoutAction", "confirmPromptpayPaymentAction", "cancelOrderItemAction", "mergeSessionAction", "advanceItemAction", "recallItemAction",
  // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 LEG-2b · H3): ผู้เขียนเดิมทุกตัวที่แตะโต๊ะ/รอบ/บิลของสาขาที่ผูก POS
  "voidCheckoutAction", "createStaffOrderAction", "createItemAction", "duplicateItemAction", "openSessionAction", "closeSessionAction", "moveSessionAction", "setTableStatusAction", "rotateQrAction", "linkMemberByPhoneAction", "confirmOrderAction", "rushOrderAction", "ackRequestAction", "doneRequestAction"] as const;
/** มติ 3: หกชุดที่ปักกับ merge-base ของ origin/session/pos (+ p2.7 ST3 แบบทนทาน — CONTROLLER-DECISION ในโน้ต) = ชุด re-pin ท้ายใบ */
const REPIN_PENDING = ["qc-hf-fu.mts", "qc-pos-p2.8.mts", "qc-pos-p2.11.mts", "qc-pos-p2.12.mts", "qc-pos-p2.13.mts", "qc-pos-p2.10.mts", "qc-pos-p2.7.mts"];
/** มติ 3: allow-list หลังชุด re-pin = ว่าง (ถ้าผู้คุมให้ p2.7 คงแบบทนทาน → ORACLE-EDIT เพิ่มที่นี่) */
const REPIN_ALLOW_AFTER: readonly string[] = [];
/** มติ 5: ชุด regression นอก qc-pos-* และ qc-hf-* ที่ต้องอยู่ในแผนด่าน P2 */
const REGRESSION_SET = [
  "qc-restaurant", "qc-restaurant-money", "qc-restaurant-pay", "qc-restaurant-void", "qc-shop", "qc-shop-refund",
  "qc-hotel-money", "qc-ticket-money", "qc-subscription-money", "qc-account-cpa",
];
/** มติ 5: แดงที่ยอมรับจาก P1 (ยังต้องมีเหตุผล + เจ้าของ) */
const ACCEPTED_SET = ["qc-acc-v2-pos-lines", "qc-member-m2.6", "qc-member-m2.7", "qc-member-m2.8", "qc-member-m1.7"];
/** คำสั่งที่ไม่ใช่ qc-* (มติ 5) */
const GATE_COMMANDS = ["fitness-noenv", "fitness-qc4", "fitness-pos", "gen-check", "typecheck", "visual-list", "visual-dry-th", "visual-dry-en"];
/** ใบของเฟส 2 ที่ HANDOVER-P2 ต้องระบุ (มติ 7 · H1) */
const P2_ROWS = ["P2.1", "P2.2", "P2.3", "P2.4", "P2.5", "P2.6", "P2.7", "P2.8", "P2.9", "P2.9b", "P2.10", "P2.11", "P2.12", "P2.13", "P2.14"];
const P2_U = ["P2.1", "P2.2", "P2.3", "P2.4", "P2.5", "P2.6", "P2.7", "P2.8", "P2.9", "P2.9b", "P2.11", "P2.12"];
const P2_HF = ["HF-TX", "HF-PP", "HF-PP2", "HF-GC", "HF-GC2", "HF-FU"];
/** DOC-1 ค่าที่ต้องเป็น (มติ 8) */
const FACTS_WANT: Record<string, [boolean, string | null]> = {
  platformCommission: [true, null],
  tableReservationsOnMap: [true, null],
  // ORACLE-EDIT ผู้คุม B 22.10 (CD-P312-K1 · ป้ายเฟสปิดแล้ว P3 → "P4+" · promptpayReconcile → "W4" · old [false, "P3"] ×3 · revert: คืนตัวอักษรเดิมพร้อมคืนป้ายใน src/lib/pos-integrations.ts)
  callQueueFromTable: [false, "P4+"],
  voucherPayment: [false, "P4+"],
  advanceBookingBill: [false, "P4+"],
};
const API10_KEYS = ["subtotalSatang", "lineDiscountSatang", "billDiscountSatang", "couponSatang", "tierSatang", "serviceChargeSatang", "vatSatang", "grandTotalSatang", "tipSatang", "refundedSatang"];
const API10_LEGACY = ["subtotal", "lineDiscount", "billDiscount", "coupon", "tier", "serviceCharge", "grandTotal", "tip", "refunded"];

// ── ด่าน SKIP (ของหลักของใบ) ──
const skipReasons: string[] = [];
for (const f of [F.legacyDoor, F.gatesRunner, F.qcAllDiscovery, F.syncSkills, `${F.skillDir}/SKILL.md`]) if (!ex(f)) skipReasons.push(`${f} ยังไม่มี`);

// ── P2.7U อยู่บนทิปหรือยัง (POS_PAGES มี qr-public) — อ่านข้อความ ไม่ import ──
function posPagesFromSrc(): string[] {
  const m = /export\s+const\s+POS_PAGES\s*=\s*\[([^\]]*)\]/.exec(rd(F.qcEnv));
  return m ? [...m[1]!.matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1]!) : [];
}
const POS_PAGES_NOW = posPagesFromSrc();
const HAS_P27U = POS_PAGES_NOW.includes("qr-public");
const P27U_WAIT = "รอ P2.7U (POS_PAGES ยังไม่มี qr-public · /q/** ยังไม่อยู่ในแผนภาพ/ทะเบียนปุ่ม) — มติ 10";

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
const STATIC_IDS = ["K1", "K2", "K3", "G1", "G2", "G3", "G4", "V1", "V2", "V3", "V4", "H1", "H2", "H3", "A9"].map((x) => `P2.14-${x}`);
const readJson = (f: string): { v: Any; err: string } => {
  const raw = rd(f);
  if (!raw) return { v: null, err: `ไม่มี ${f}` };
  try {
    return { v: JSON.parse(raw), err: "" };
  } catch (e) {
    return { v: null, err: `${f} ไม่ใช่ JSON: ${(e as Error).message.slice(0, 60)}` };
  }
};
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SHA_IN = /`([0-9a-f]{7,40})`/g;
const shaAncestor = new Map<string, boolean>();
const isAncestor = (sha: string): boolean => {
  if (!shaAncestor.has(sha)) shaAncestor.set(sha, gitOk(["merge-base", "--is-ancestor", sha, "HEAD"]));
  return shaAncestor.get(sha)!;
};
/** แถวตารางที่ขึ้นต้นด้วย id (P2.1 ≠ P2.10 ≠ P2.1U) */
const rowsOfId = (lines: string[], id: string) => lines.filter((l) => new RegExp(`^\\|\\s*\\**${escRe(id)}(?![\\w.])`).test(l));
const shasOf = (l: string) => [...l.matchAll(SHA_IN)].map((m) => m[1]!);
/** route ของไฟล์หน้า: ตัด src/app · กลุ่ม (xxx) · /page.tsx */
const routeOf = (file: string) => file.replace(/^src\/app/, "").replace(/\/\([^/)]+\)/g, "").replace(/\/page\.tsx$/, "") || "/";

async function runStatic(): Promise<void> {
  console.log(`\n── ข้อสถิต (ไม่แตะ DB · ฐาน ${BASE_REV} · P2.7U บนทิป: ${HAS_P27U ? "ใช่" : "ยัง"}) ──`);
  const step = async (id: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
    } catch (e) {
      chk(id, false, "ตรวจได้ (ไม่ crash)", `THROW ${(e as Error)?.message?.slice(0, 160)}`);
    }
  };

  // ── K1 facts การ์ด 10 ──
  await step("K1", () => {
    const p: string[] = [];
    const src = srcOf(F.integrations);
    const at = src.indexOf("const FACTS");
    const blk = at < 0 ? "" : src.slice(at, src.indexOf("};", at) + 2);
    const facts = new Map<string, [boolean, string | null]>();
    for (const m of blk.matchAll(/\[\s*"(\w+)"\s*,\s*(true|false)\s*,\s*(null|"([^"]*)")\s*\]/g)) facts.set(m[1]!, [m[2] === "true", m[4] ?? null]);
    if (!facts.size) p.push("อ่าน FACTS ของ pos-integrations.ts ไม่ได้");
    for (const [k, [live, ph]] of Object.entries(FACTS_WANT)) {
      const got = facts.get(k);
      if (!got || got[0] !== live || got[1] !== ph) p.push(`${k} = ${short(got)} (คาด [${live}, ${JSON.stringify(ph)}])`);
    }
    const lines = rd(F.plan).split("\n");
    const ticked = new Set<string>();
    const closed = new Set<string>();
    for (const l of lines) {
      const m = /^\|\s*(P[0-9]\.[0-9]+[a-z]?)\s*\|/.exec(l);
      if (!m) continue;
      if (/^P[01]\./.test(m[1]!)) closed.add(m[1]!);
      if (l.includes("✅")) {
        ticked.add(m[1]!);
        closed.add(m[1]!);
      }
    }
    const want = P2_ROWS.filter((x) => x !== "P2.14" && x !== "P2.9b");
    const unticked = want.filter((x) => !ticked.has(x));
    if (unticked.length) p.push(`POS-MASTER-PLAN แถว P2 ยังไม่ติ๊ก ✅: ${unticked.join(",")}`);
    const stale = [...facts.entries()].filter(([, [live, ph]]) => !live && ph && closed.has(ph)).map(([k, [, ph]]) => `${k}:${ph}`);
    if (stale.length) p.push(`fact false ติดป้ายใบที่ปิดแล้ว: ${stale.join(",")}`);
    chk("K1", p.length === 0, "facts ตามมติ 8 · P2.1–P2.13 ✅ · ไม่มีป้ายใบที่ปิด", joinP(p));
  });

  // ── K2 สกิลอยู่ในรีโป ──
  await step("K2", () => {
    const p: string[] = [];
    const ls = new Set((gitStr(["ls-files", "--", F.skillDir]) ?? "").split("\n").filter(Boolean));
    for (const f of ["SKILL.md", "references/recipes.md", "references/endpoints.md"]) if (!ls.has(`${F.skillDir}/${f}`)) p.push(`git ls-files ไม่มี ${F.skillDir}/${f}`);
    for (const f of [F.gen, F.p213, F.apiSkill]) {
      const c = srcOf(f);
      if (!c.includes(F.skillDir)) p.push(`${f.split("/").pop()} ไม่อ่าน ${F.skillDir}`);
      if (c.includes(`.claude/${F.skillDir}`)) p.push(`${f.split("/").pop()} ยังอ่าน .claude/${F.skillDir}`);
    }
    const sync = rd(F.syncSkills);
    if (!sync) p.push(`ไม่มี ${F.syncSkills}`);
    else {
      if (!(gitStr(["ls-files", "--", F.syncSkills]) ?? "").trim()) p.push(`${F.syncSkills} ไม่ได้ track`);
      if (/^\s*export\s+CI\b/m.test(sync)) p.push("sync-skills.sh export CI");
      for (const h of ["/root/.claude/skills", "/root/.claude-b/skills"]) if (!sync.includes(h)) p.push(`sync-skills.sh ไม่คัดไป ${h}`);
      if (!/\b(cmp|diff|sha256sum)\b/.test(sync)) p.push("sync-skills.sh ไม่เทียบไบต์ (cmp/diff/sha256sum)");
    }
    for (const home of ["/root/.claude/skills/shark-pos-api", "/root/.claude-b/skills/shark-pos-api"]) {
      if (!existsSync(home) || !ls.size) continue;
      for (const f of ["SKILL.md", "references/recipes.md", "references/endpoints.md"]) {
        const a = rd(`${F.skillDir}/${f}`);
        const b = existsSync(`${home}/${f}`) ? readFileSync(`${home}/${f}`, "utf8") : null;
        if (a && b !== a) p.push(`${home}/${f} ≠ สำเนาในรีโป`);
      }
    }
    chk("K2", p.length === 0, "tracked 3 ไฟล์ · ตัวอ่าน 3 ตัวชี้ทางใหม่ · sync-skills.sh", joinP(p));
  });

  // ── K3 หมุด merge-base ──
  await step("K3", () => {
    const hits = readdirSync(abs("scripts"))
      .filter((f) => /^qc-.*\.mts$/.test(f) && f !== `${SUITE}.mts`)
      .filter((f) => {
        const c = srcOf(`scripts/${f}`);
        return c.includes(MERGE_BASE) && c.includes(ORIGIN_POS);
      });
    const others = hits.filter((f) => !REPIN_PENDING.includes(f) && !REPIN_ALLOW_AFTER.includes(f));
    const pending = hits.filter((f) => REPIN_PENDING.includes(f) && !REPIN_ALLOW_AFTER.includes(f));
    const landed = REPIN_PENDING.some((f) => !hits.includes(f));
    if (others.length) chk("K3", false, "ไม่มีชุดใหม่ที่ปักกับ merge-base ของ origin", `ชุดนอกรายการ: ${others.join(",")}`);
    else if (!landed) skipChk("K3", `รอชุด re-pin ท้ายใบ (มติ 3) — ยังปัก ${pending.length} ชุด: ${pending.join(",")}`);
    else chk("K3", pending.length === 0, "allow-list ว่าง (ทุกชุด re-pin แล้ว)", pending.length ? `ยังไม่ re-pin: ${pending.join(",")}` : "ครบ");
  });

  // ── G ด่าน ──
  const man = readJson(F.gates);
  const suites: Any[] = Array.isArray(man.v?.suites) ? man.v.suites : [];
  const cmds: Any[] = Array.isArray(man.v?.commands) ? man.v.commands : [];
  const names = suites.map((s) => String(s?.suite ?? ""));
  await step("G1", () => {
    const p: string[] = [];
    if (man.err) p.push(man.err);
    const files = readdirSync(abs("scripts")).filter((f) => /^qc-(pos|hf)-.*\.mts$/.test(f) || /^qc-account-api-.*\.mts$/.test(f)).map((f) => f.replace(/\.mts$/, ""));
    const planLine = rd(F.plan).split("\n").find((l) => l.includes("เงินจริง")) ?? "";
    const planSet = [...planLine.matchAll(/(qc-[\w.-]+)\.mts/g)].map((m) => m[1]!);
    const req = [...new Set([...files, ...REGRESSION_SET, ...ACCEPTED_SET, ...planSet])];
    const miss = req.filter((s) => !names.includes(s));
    if (miss.length) p.push(`แผนขาด ${miss.length}: ${miss.slice(0, 6).join(",")}`);
    const cn = cmds.map((c) => String(c?.name ?? ""));
    const missC = GATE_COMMANDS.filter((c) => !cn.includes(c));
    if (missC.length) p.push(`คำสั่งขาด: ${missC.join(",")}`);
    const tc = cmds.find((c) => c?.name === "typecheck");
    if (tc && !/max-old-space-size=8192/.test(String(tc.run))) p.push("typecheck ไม่ใช้ heap 8192");
    const sh = rd(F.gatesRunner);
    if (!sh) p.push(`ไม่มี ${F.gatesRunner}`);
    else {
      const code = sh.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
      if (/^\s*export\s+CI\b/m.test(code) || /\bexport\s+CI=/.test(code)) p.push("runner export CI");
      for (const tok of ["pos-gates.json", "qc4.sh", "/tmp/shark-gate-pos.lock", "with-gate-lock.sh", "iso.sh", "SUMMARY.txt", "DONE", "HEAD.txt", "QC_FORCE=1", "10500M", "/tmp/pos-gate.lock", "--dry"]) if (!code.includes(tok)) p.push(`runner ไม่มี ${tok}`);
      const dry = spawnSync("bash", [abs(F.gatesRunner), "--dry"], { cwd: ROOT, encoding: "utf8", timeout: 60_000, env: { ...process.env, CI: "" } });
      if (dry.status !== 0) p.push(`--dry exit ${dry.status} ${short((dry.stdout ?? "") + (dry.stderr ?? ""), 80)}`);
      else {
        const plan = (dry.stdout ?? "").split("\n").map((l) => /^PLAN\s+(\S+)\s+(\S+)/.exec(l)).filter((m): m is RegExpExecArray => !!m).map((m) => m[1]!);
        const want = [...names, ...cn];
        if (plan.join(",") !== want.join(",")) p.push(`--dry แผน ${plan.length} แถว (คาด ${want.length} ตามลำดับแมนิเฟสต์)`);
      }
    }
    chk("G1", p.length === 0, "แผนครบ · runner ตามกติกา · --dry = แผน", joinP(p));
  });
  await step("G2", () => {
    const p: string[] = [];
    if (man.err) p.push(man.err);
    const seen = new Set<string>();
    for (const s of suites) {
      const n = String(s?.suite ?? "");
      if (!n || seen.has(n)) p.push(`ชื่อว่าง/ซ้ำ ${n}`);
      seen.add(n);
      const f = `scripts/${n}.mts`;
      if (!ex(f)) {
        p.push(`ไม่มีไฟล์ ${f}`);
        continue;
      }
      const raw = rd(f);
      const wantMode = /QC_FORCE/.test(raw) ? "forced" : "unforced";
      if (s.mode !== "forced" && s.mode !== "unforced") p.push(`${n} mode ${s.mode}`);
      else if (s.mode !== wantMode) p.push(`${n} mode ${s.mode} (ชุดนี้${wantMode === "forced" ? "มี" : "ไม่มี"}ด่าน SKIP → ${wantMode})`);
      const req = /\/\/\s*requires:\s*([a-z0-9-]+-seed)/.exec(raw.split("\n").slice(0, 40).join("\n"))?.[1] ?? null;
      if ((s.needs ?? null) !== req) p.push(`${n} needs ${s.needs ?? "-"} (หัวไฟล์ ${req ?? "-"})`);
    }
    for (const c of cmds) {
      const n = String(c?.name ?? "");
      if (!n || seen.has(n) || typeof c?.run !== "string" || !c.run) p.push(`คำสั่งว่าง/ซ้ำ ${n}`);
      seen.add(n);
    }
    if (!suites.length) p.push("ไม่มี suites");
    chk("G2", p.length === 0, "ไฟล์มีจริง · mode · needs · ไม่ซ้ำ", joinP(p));
  });
  await step("G3", async () => {
    const p: string[] = [];
    let isQc: ((f: string) => boolean) | null = null;
    if (ex(F.qcAllDiscovery)) {
      try {
        const m = (await import("./qc-all-discovery.mjs" as string)) as Any;
        if (typeof m?.isQcAllSuite === "function") isQc = m.isQcAllSuite;
        else p.push("qc-all-discovery.mts ไม่ export isQcAllSuite");
      } catch (e) {
        p.push(`import qc-all-discovery ไม่ได้: ${(e as Error).message.slice(0, 60)}`);
      }
    } else p.push(`ไม่มี ${F.qcAllDiscovery} (ตัวกรองของ qc-all ยังไม่ export — อ่านแพตเทิร์นจากไฟล์แทน)`);
    const qa = srcOf(F.qcAll);
    if (!/qc-all-discovery/.test(qa) || !/\bisQcAllSuite\b/.test(qa)) p.push("qc-all.mts ไม่ใช้ isQcAllSuite จาก qc-all-discovery");
    if (!isQc) {
      // อ่านแพตเทิร์นจาก qc-all.mts (ยังไม่ export) เพื่อรายงานผลจริงของแผน
      const ex1 = [...qa.matchAll(/f\s*!==\s*"([^"]+)"/g)].map((m) => m[1]!);
      isQc = (f: string) => /^qc-.*\.mts$/.test(f) && !ex1.includes(f);
    }
    const out = names.filter((n) => !isQc!(`${n}.mts`));
    if (out.length) p.push(`ไม่ผ่านตัวกรอง qc-all: ${out.join(",")}`);
    chk("G3", p.length === 0, "ทุกชุดในแผนผ่าน isQcAllSuite ของ qc-all", joinP(p));
  });
  await step("G4", () => {
    const p: string[] = [];
    const op = rd(F.ownerPending);
    for (const n of ACCEPTED_SET) {
      const s = suites.find((x) => x?.suite === n);
      if (!s) p.push(`${n} ไม่อยู่ในแผน`);
      else if (!isRecord(s.accepted)) p.push(`${n} ไม่มี accepted`);
    }
    for (const s of suites.filter((x) => x?.accepted !== undefined)) {
      const a = s.accepted;
      if (!isRecord(a)) {
        p.push(`${s.suite} accepted ไม่ใช่วัตถุ`);
        continue;
      }
      if (typeof a.reason !== "string" || a.reason.length < 10) p.push(`${s.suite} ไม่มี reason`);
      if (typeof a.owner !== "string" || !a.owner) p.push(`${s.suite} ไม่มี owner`);
      if (typeof a.opRef !== "string" || !a.opRef || !op.includes(a.opRef)) p.push(`${s.suite} opRef "${short(a.opRef, 40)}" ไม่พบใน POS-OWNER-PENDING.md`);
    }
    chk("G4", p.length === 0, "แดงที่ยอมรับมีเหตุผล + เจ้าของ + บรรทัดใน OP", joinP(p));
  });

  // ── V ภาพ ──
  const sw = readJson(F.sweep);
  const runs: Any[] = Array.isArray(sw.v?.runs) ? sw.v.runs : [];
  const pageMap: Record<string, Any> = isRecord(sw.v?.pages) ? sw.v.pages : {};
  const exempt: Any[] = Array.isArray(sw.v?.exempt) ? sw.v.exempt : [];
  const refusals: Record<string, Any> = isRecord(sw.v?.refusals) ? sw.v.refusals : {};
  const inv = readJson(F.inventory);
  const invRows: Any[] = Array.isArray(inv.v?.rows) ? inv.v.rows : [];
  const invPages = new Set(invRows.map((r) => String(r?.page ?? "")));
  const vis = srcOf(F.visual);
  await step("V1", () => {
    const p: string[] = [];
    let waitP27 = false;
    if (sw.err) p.push(sw.err);
    const pagesOf = (r: Any): string[] => (Array.isArray(r?.pages) ? r.pages.map(String) : []);
    for (const pg of [...POS_PAGES_NOW, "qr-public"]) {
      for (const loc of ["th", "en"]) {
        const ok = runs.some((r) => pagesOf(r).includes(pg) && Array.isArray(r?.locales) && r.locales.includes(loc));
        if (!ok) p.push(`${pg} ไม่มีรอบ ${loc}`);
      }
    }
    const m = /EN_MOBILE_PAGES\b[^=\n]*=\s*(?:new Set(?:<[^>]*>)?\()?\[([^\]]*)\]/.exec(vis);
    const enMobile = m ? [...m[1]!.matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1]!) : [];
    if (!m) p.push("visual-pos.mts ไม่มี EN_MOBILE_PAGES (มติ 6: en × 390 ของ register/pay/bills/หน้าสาธารณะ)");
    for (const pg of ["register", "sales", "receipt-public", "display"]) if (m && !enMobile.includes(pg)) p.push(`EN_MOBILE_PAGES ขาด ${pg}`);
    if (m && !/LOCALE_EN[^\n]*EN_MOBILE_PAGES|EN_MOBILE_PAGES[^\n]*LOCALE_EN/.test(vis)) p.push("ตัวเลือกขนาดจอของ LOCALE=en ไม่ใช้ EN_MOBILE_PAGES");
    if (!HAS_P27U) waitP27 = true;
    else if (m && !enMobile.includes("qr-public")) p.push("EN_MOBILE_PAGES ขาด qr-public");
    if (p.length) chk("V1", false, "ทุกหน้ามีรอบ th + en · EN_MOBILE_PAGES", joinP(p));
    else if (waitP27) skipChk("V1", P27U_WAIT);
    else chk("V1", true, "ทุกหน้ามีรอบ th + en · EN_MOBILE_PAGES", "ครบ");
  });
  await step("V2", () => {
    const p: string[] = [];
    if (sw.err) p.push(sw.err);
    const res = [...new Set([...vis.matchAll(/\/(\^p[^/\n]*)\/i\.test\(WO/g)].map((m) => m[1]!))];
    if (!res.length) p.push("อ่านค่าคงที่ wo-gated ของ visual-pos.mts ไม่ได้");
    const wos = runs.map((r) => String(r?.wo ?? ""));
    for (const w of wos) if (!/^[A-Za-z0-9._-]+$/.test(w) || w.includes("..")) p.push(`wo "${w}" ไม่ถูกรูป`);
    for (const r of res) {
      let re: RegExp | null = null;
      try {
        re = new RegExp(r, "i");
      } catch {
        p.push(`regex ${r} คอมไพล์ไม่ได้`);
        continue;
      }
      if (!wos.some((w) => re!.test(w))) p.push(`ไม่มีรอบของ /${r}/`);
    }
    chk("V2", p.length === 0, `ทุก wo-gated (${res.length}) มีรอบ`, joinP(p));
  });
  await step("V3", () => {
    const p: string[] = [];
    let waitP27 = false;
    if (sw.err) p.push(sw.err);
    const files = [
      ...walk("src/app/app/sys/[id]/pos", [], /^page\.tsx$/),
      ...walk("src/app/(store)/d", [], /^page\.tsx$/),
      ...walk("src/app/(store)/r", [], /^page\.tsx$/),
      ...walk("src/app/(store)/q", [], /^page\.tsx$/),
      ...walk("src/app/developers/pos", [], /^page\.tsx$/),
    ];
    const mapped = new Map<string, string>();
    for (const [pg, v] of Object.entries(pageMap)) for (const f of Array.isArray(v) ? v : [v]) mapped.set(String(f), pg);
    for (const f of files) {
      const pg = mapped.get(f);
      const exm = exempt.find((x) => x?.file === f);
      const isQ = f.startsWith("src/app/(store)/q/");
      if (!pg && !exm) {
        if (isQ && !HAS_P27U) waitP27 = true;
        else p.push(`${f} ไม่แมปหน้าและไม่อยู่ในข้อยกเว้น`);
        continue;
      }
      if (pg && !POS_PAGES_NOW.includes(pg)) {
        if (pg === "qr-public" && !HAS_P27U) waitP27 = true;
        else p.push(`${f} → ${pg} ไม่อยู่ใน POS_PAGES`);
      }
      if (exm && (!POS_PAGES_NOW.includes(String(exm.parent)) || typeof exm.why !== "string" || !exm.why)) p.push(`ข้อยกเว้น ${f} parent/why ไม่ถูก`);
      const isPublic = !f.startsWith("src/app/app/");
      if (isPublic && !invPages.has(routeOf(f))) {
        if (isQ && !HAS_P27U) waitP27 = true;
        else p.push(`หน้าสาธารณะ ${routeOf(f)} ไม่มีแถวทะเบียนปุ่ม`);
      }
    }
    for (const f of mapped.keys()) if (!files.includes(f)) p.push(`แมนิเฟสต์ชี้ ${f} ที่ไม่มี`);
    if (p.length) chk("V3", false, "ทุกหน้าแมป/ยกเว้น · หน้าสาธารณะมีทะเบียน", joinP(p));
    else if (waitP27) skipChk("V3", P27U_WAIT);
    else chk("V3", true, "ทุกหน้าแมป/ยกเว้น · หน้าสาธารณะมีทะเบียน", `ครบ (${files.length} หน้า)`);
  });
  await step("V4", () => {
    const p: string[] = [];
    const authz = rd(F.authz);
    const staff = walk("src/app/app/sys/[id]/pos", [], /^page\.tsx$/);
    for (const f of staff) {
      const route = routeOf(f);
      if (!invPages.has(route)) p.push(`${route} ไม่มีแถว pos-ui-inventory`);
      const pinned = authz.includes(f);
      const tid = typeof refusals[route] === "string" ? String(refusals[route]) : "";
      const refusalOk = !!tid && invRows.some((r) => r?.page === route && r?.testid === tid);
      if (!pinned && !refusalOk) p.push(`${route.replace("/app/sys/[id]/pos/", "")} ไม่มีหมุดสิทธิ์/การ์ดปฏิเสธ`);
    }
    chk("V4", p.length === 0, "ทุกหน้าพนักงาน: ทะเบียนปุ่ม + (หมุดสิทธิ์ | การ์ดปฏิเสธ)", joinP(p));
  });

  // ── H ส่งมอบ ──
  await step("H1", () => {
    const p: string[] = [];
    const hs = existsSync(abs("ledger")) ? readdirSync(abs("ledger")).filter((f) => /^HANDOVER-2026-10-\d\d-POS-P2\.md$/.test(f)) : [];
    if (!hs.length) {
      chk("H1", false, "มี ledger/HANDOVER-2026-10-xx-POS-P2.md", "ยังไม่มี");
      return;
    }
    const doc = rd(`ledger/${hs[0]}`);
    const lines = doc.split("\n");
    for (let k = 0; k <= 7; k++) if (!new RegExp(`§\\s*${k}(?![0-9])`).test(doc)) p.push(`ไม่มี §${k}`);
    const bad = (shas: string[]) => shas.filter((s) => !isAncestor(s));
    for (const id of P2_ROWS) {
      const rows = rowsOfId(lines, id).filter((l) => shasOf(l).length);
      if (!rows.length) p.push(`${id} ไม่มีแถว + SHA`);
      else if (rows.every((l) => bad(shasOf(l)).length)) p.push(`${id} SHA ไม่ใช่บรรพบุรุษ: ${bad(shasOf(rows[0]!)).join(",")}`);
    }
    for (const id of P2_U) {
      const tok = new RegExp(`(^|[^\\w.])${escRe(id)}U(?![\\w.])`);
      const own = lines.filter((l) => tok.test(l) && shasOf(l).length);
      const inRow = rowsOfId(lines, id).filter((l) => /\bU\s*`[0-9a-f]{7,40}`/.test(l));
      const cand = [...own, ...inRow];
      if (!cand.length) p.push(`${id}U ไม่มี SHA`);
      else if (cand.every((l) => bad(shasOf(l)).length)) p.push(`${id}U SHA ไม่ใช่บรรพบุรุษ`);
    }
    for (const hf of P2_HF) {
      const tok = new RegExp(`(^|[^\\w-])${escRe(hf)}(?![\\w-])`);
      const cand = lines.filter((l) => tok.test(l) && shasOf(l).length);
      if (!cand.length) p.push(`${hf} ไม่มี SHA`);
      else if (cand.every((l) => bad(shasOf(l)).length)) p.push(`${hf} SHA ไม่ใช่บรรพบุรุษ`);
    }
    chk("H1", p.length === 0, "§0–§7 · ทุกใบ P2/U/HF มี SHA บรรพบุรุษ", joinP(p, `ครบ (${hs[0]})`));
  });
  await step("H2", () => {
    const p: string[] = [];
    const keys = [...new Set([...rd(F.outbox).matchAll(/^\s*"(pos\.[\w.]+)"\s*:/gm)].map((m) => m[1]!))];
    if (!keys.length) p.push("อ่านคีย์ pos.* ของ outbox-consumers.ts ไม่ได้");
    const doc = rd(F.contracts);
    const at = doc.search(/\n## Event/);
    const sec = at < 0 ? "" : doc.slice(at + 1, (() => {
      const n = doc.indexOf("\n## ", at + 4);
      return n < 0 ? doc.length : n;
    })());
    const listed = new Set<string>();
    for (const l of sec.split("\n").filter((x) => x.startsWith("|"))) {
      const cell = (l.split("|")[1] ?? "").replace(/~~[^~]*~~/g, "");
      for (const m of cell.matchAll(/`(pos\.[\w./]+)`/g)) {
        const parts = m[1]!.split("/");
        const first = parts[0]!;
        listed.add(first);
        const pre = first.slice(0, first.lastIndexOf(".") + 1);
        for (const rest of parts.slice(1)) listed.add(rest.startsWith("pos.") ? rest : pre + rest);
      }
    }
    if (!sec) p.push("POS-CONTRACTS.md ไม่มีหัวข้อ ## Event");
    const miss = keys.filter((k) => !listed.has(k));
    if (miss.length) p.push(`ตารางขาด ${miss.length}: ${miss.join(",")}`);
    chk("H2", p.length === 0, `ตาราง event ⊇ ${keys.length} คีย์ pos.*`, joinP(p));
  });
  await step("H3", () => {
    const p: string[] = [];
    const doc = rd(F.parity);
    if (!doc) {
      chk("H3", false, "มี ledger/wo-notes/pos-P2.14-parity.md", "ยังไม่มี");
      return;
    }
    const lines = doc.split("\n");
    const hi = lines.findIndex((l) => l.startsWith("|") && /\|\s*status\s*\|/i.test(l));
    if (hi < 0) p.push("ไม่มีตารางที่มีคอลัมน์ status");
    else {
      const head = lines[hi]!.split("|").map((x) => x.trim().toLowerCase());
      const si = head.indexOf("status");
      const rows = lines.slice(hi + 2).filter((l) => l.startsWith("|"));
      if (!rows.length) p.push("ตารางไม่มีแถว");
      let open = 0;
      for (const r of rows) {
        const c = (r.split("|")[si] ?? "").trim();
        if (/^OPEN\b/i.test(c)) open++;
        else if (/^DEVIATION\b/i.test(c) && !/\(ref|→|มติ|ruling/i.test(c)) p.push(`DEVIATION ไม่มีอ้างอิง: ${short(r, 60)}`);
        else if (!/^(MATCH|DEVIATION)\b/i.test(c)) p.push(`สถานะแปลก "${short(c, 30)}"`);
      }
      if (open) p.push(`OPEN ${open} แถว`);
    }
    chk("H3", p.length === 0, "parity มีแถว · OPEN 0", joinP(p));
  });

  // ── A9 กฎรูปคำตอบ (static) ──
  await step("A9", () => {
    const p: string[] = [];
    const ops = walk(F.opsDir);
    if (!ops.length) p.push("ไม่มี ops/");
    let n = 0;
    for (const f of ops) {
      const c = srcOf(f);
      const starts = [...c.matchAll(/definePosOp\s*\(\s*\{/g)].map((m) => m.index!);
      starts.forEach((s, i) => {
        const body = c.slice(s, starts[i + 1] ?? c.length);
        const kind = /\bkind\s*:\s*"(\w+)"/.exec(body)?.[1];
        if (kind !== "write" && kind !== "danger") return;
        n++;
        const id = /\bid\s*:\s*"([^"]+)"/.exec(body)?.[1] ?? "?";
        const h = body.indexOf("handler");
        if (h >= 0 && /\breturn\s+posData\s*\(/.test(body.slice(h))) p.push(`${id} return posData(`);
      });
    }
    chk("A9", n > 0 && p.length === 0, "op เขียนทุกตัวคืนรูปคงที่", joinP(p, `ครบ (${n} op)`));
  });
}

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อ (สถิต · ไม่โหลด prisma)`);
  try {
    await runStatic();
  } catch (e) {
    console.log(`💥 harness: ${(e as Error)?.stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  const skippedN = [...results.entries()].filter(([, r]) => r.skip).map(([id, r]) => `${id}: ${r.skip}`);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}${skippedN.length ? ` (SKIP ${skippedN.length})` : ""}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skippedChecks: skippedN, skipped: false, registered: CHECKS.length, hasP27U: HAS_P27U, missing: skipReasons })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
// 🔴 ต้องตั้งก่อน import โมดูลใดที่ดึง next/* (async-local-storage ของ Next จับค่า global ตอนโหลดโมดูล) — ไม่งั้น server action ใน scope = Invariant
{
  const { AsyncLocalStorage } = await import("node:async_hooks");
  (globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
}
const TIDS = (envMod.PQC_TENANT_IDS as string[]) ?? [];
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
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
const MISSING = "ยังไม่มีโมดูล/ฟังก์ชัน";
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown; digest?: unknown } | null;
  if (typeof o?.digest === "string" && o.digest.startsWith("NEXT_REDIRECT")) return "NEXT_REDIRECT";
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  return m ? m[1]! : "THROW";
}
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} — ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    const d = (e as { digest?: unknown })?.digest;
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true, ...(typeof d === "string" ? { digest: d } : {}) };
  }
}
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : "UNKNOWN");

// ═════════════════════════ 2b. โปรเซสลูก (Q5/Q6 — "เครื่องที่สอง") ═════════════════════════
// โปรโตคอล: --child <q5|q6> <base64 JSON> → โหลดโมดูล → พิมพ์ CHILD_READY → รอบรรทัด GO ทาง stdin → ทำงาน → CHILD_RESULT <json>
if (CHILD) {
  assertQc4BeforeWrite();
  installFetchGuard();
  const task = process.argv[process.argv.indexOf("--child") + 1] ?? "";
  let arg: Any = {};
  try {
    arg = JSON.parse(Buffer.from(process.argv[process.argv.indexOf("--child") + 2] ?? "", "base64").toString("utf8"));
  } catch {
    arg = {};
  }
  const qrMod = await tryImport("@/lib/modules/pos/qr-order");
  let charges = 0;
  const beam = {
    enabled: () => true,
    createCharge: async (input: Any) => {
      charges++;
      await sleep(Number(arg.beamDelayMs ?? 1500));
      return { chargeId: `chg_qc214_${String(arg.tag ?? "x")}_${process.pid}_${charges}`, url: `https://pay.beam.example/qc214/${process.pid}`, qrPayload: `BEAMQR-${String(input?.referenceId ?? "")}` };
    },
  };
  console.log("CHILD_READY");
  await new Promise<void>((resolve) => {
    let buf = "";
    process.stdin.on("data", (d) => {
      buf += String(d);
      if (buf.includes("GO")) resolve();
    });
    setTimeout(resolve, 120_000);
  });
  let result: Any;
  if (task === "q5") result = await call(qrMod, "placeTableRound", String(arg.qrToken ?? ""), arg.input ?? {}, { ip: String(arg.ip ?? "child") });
  else if (task === "q6") result = await call(qrMod, "placePreorder", String(arg.linkToken ?? ""), arg.input ?? {}, { ip: String(arg.ip ?? "child") }, { beam });
  else result = { ok: false, code: "CHILD_TASK_UNKNOWN" };
  console.log(`CHILD_RESULT ${JSON.stringify({ result, charges, pid: process.pid, at: Date.now() })}`);
  removeFetchGuard();
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}

// ═════════════════════════ 3. ด่าน SKIP ═════════════════════════
const FP_TABLES: [string, string][] = [["PosSale", "status"], ["PosOrder", "version"], ["PosProduct", "updatedAt"], ["SalesChannel", "updatedAt"], ["TableSession", "status"], ["PosCustomerDisplay", "stateSeq"]];
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h
         FROM "${tb}" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE 'posqc-p214-%'))`,
      )) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      out[tb] = `err:${(e as Error).message.slice(0, 30)}`;
    }
  }
  try {
    const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n, coalesce(md5(string_agg(id || ':' || coalesce("revokedAt"::text,''), ',' ORDER BY id)), '-') AS h FROM "ApiKey" WHERE "tenantId" = ANY($1::text[])`, TIDS)) as Any[];
    out.ApiKeySeed = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
  } catch (e) {
    out.ApiKeySeed = `err:${(e as Error).message.slice(0, 30)}`;
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.14 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · Z เขียว)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const invSvc = await tryImport("@/lib/modules/inventory/service");
const posSvc = await tryImport("@/lib/modules/pos/service");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const regFacade = await tryImport("@/lib/modules/pos/register");
const chMod = await tryImport("@/lib/modules/pos/channel");
const orderMod = await tryImport("@/lib/modules/pos/order");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const reportsMod = await tryImport("@/lib/modules/pos/reports");
const qrMod = await tryImport("@/lib/modules/pos/qr-order");
const piMod = await tryImport("@/lib/modules/pos/payment-intent");
const dispMod = await tryImport("@/lib/modules/pos/display");
const dispShared = await tryImport("@/lib/modules/pos/display-shared");
const heldMod = await tryImport("@/lib/modules/pos/held-cart");
const kdsMod = await tryImport("@/lib/modules/pos/kds");
const depMod = await tryImport("@/lib/modules/pos/deposit");
const apprMod = await tryImport("@/lib/modules/pos/pos-approval");
const posIdx = await tryImport("@/lib/modules/pos");
const consMod = await tryImport("@/lib/outbox-consumers");
const akSvc = await tryImport("@/lib/api-keys/service");
const scopesMod = await tryImport("@/lib/api-keys/scopes");
const menu = await tryImport("@/lib/modules/restaurant/menu");
const shopSvc = await tryImport("@/lib/modules/shop/service"); // ORACLE-ADD ผู้คุม 16 ต.ค. (P2.14 ORD-1b · O5b)
const rtable = await tryImport("@/lib/modules/restaurant/table");
const rorder = await tryImport("@/lib/modules/restaurant/order");
const coreHash = await tryImport("@/lib/core/hash");
const legacyDoorMod = ex(F.legacyDoor) ? await tryImport("@/lib/modules/pos/legacy-door") : null;
/** posLinkedLegacyDoor — ไฟล์ของมันเอง (ตารางชื่อ) หรือ re-export จาก qr-order / pos index */
const doorFn = (): Any => legacyDoorMod?.posLinkedLegacyDoor ?? qrMod?.posLinkedLegacyDoor ?? posIdx?.posLinkedLegacyDoor ?? null;
const apiRoute = await tryImport("@/app/api/v1/pos/[...path]/route");
const LR = {
  order: await tryImport("@/app/api/store/[tenantSlug]/[unitSlug]/restaurant/order/route"),
  session: await tryImport("@/app/api/store/[tenantSlug]/[unitSlug]/restaurant/session/route"),
  service: await tryImport("@/app/api/store/[tenantSlug]/[unitSlug]/restaurant/service-request/route"),
  bill: await tryImport("@/app/(store)/s/[tenantSlug]/[unitSlug]/restaurant/bill/route"),
  notify: await tryImport("@/app/(store)/s/[tenantSlug]/[unitSlug]/restaurant/notify-payment/route"),
};

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p214-${RAND}`;
const T_SLUG = `posqc-p214-${RAND}`;
const EMAIL_PREFIX = `${T_SLUG}-`;
let T = "";
const keyIds: string[] = [];
const userIds: string[] = [];
async function drain(n = 2): Promise<void> {
  for (let i = 0; i < n; i++) {
    try {
      if (typeof consMod?.drainAll === "function") await consMod.drainAll();
    } catch (e) {
      console.log(`  (drainAll ล้ม: ${(e as Error).message.slice(0, 100)})`);
    }
  }
}

// ── Next request scope (เทคนิคเดียวกับ qc-hf-o23 / qc-crm-v1) — ให้ server action อ่านคุกกี้ session ได้ในโปรเซส ──
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
async function inScope<R>(cookie: string, pathname: string, fn: () => Promise<R>): Promise<R> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) throw new Error("ไม่มี Next request scope (next/dist/... โหลดไม่ได้)");
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": SUITE, "x-forwarded-for": "203.0.113.214" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}
/** เรียก action ใน scope — redirect() = {ok:false, code NEXT_REDIRECT, digest} · throw อื่น = code ของมัน */
async function act(cookie: string, path: string, mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  if (typeof mod?.[name] !== "function") return { ok: false, code: `MISSING:${name}`, missing: true };
  try {
    const r = await inScope(cookie, path, () => mod[name](...args));
    return r === undefined ? { ok: true, void: true } : r;
  } catch (e) {
    const d = (e as { digest?: unknown })?.digest;
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true, ...(typeof d === "string" ? { digest: d } : {}) };
  }
}
const fd = (o: Record<string, string>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

// ── REST ในโปรเซส (แบบ qc-pos-p2.13) ──
type Res = { status: number; body: Any; headers: Headers; text: string };
let idemN = 0;
const freshIdem = () => `p214-${RAND}-${++idemN}`;
async function api(method: string, path: string, key: string | null, opts: { body?: unknown; idem?: string | false; headers?: Record<string, string>; accept?: string } = {}): Promise<Res> {
  const fn = apiRoute?.[method];
  if (typeof fn !== "function") return { status: 0, body: { error: { code: "ROUTE_MISSING" } }, headers: new Headers(), text: "route ยังไม่มี" };
  const headers: Record<string, string> = { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(opts.headers ?? {}) };
  if (opts.accept) headers.accept = opts.accept;
  if (method !== "GET" && opts.idem !== false) headers["idempotency-key"] = opts.idem ?? freshIdem();
  let b: string | undefined;
  if (opts.body !== undefined) {
    b = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  try {
    const res: Response = await fn(new Request(`http://x/api/v1/pos${path}`, { method, headers, body: b }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await res.arrayBuffer()));
    let body: Any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text };
    }
    return { status: res.status, body, headers: res.headers, text };
  } catch (e) {
    return { status: -1, body: { error: { code: "THROW", message: (e as Error).message.slice(0, 160) } }, headers: new Headers(), text: "" };
  }
}
const ecode = (r: Res): string => String(r.body?.error?.code ?? "");
const st = (r: Res) => `${r.status}${ecode(r) ? `:${ecode(r)}` : ""}`;
/** route เดิมของหน้าร้าน (store) ในโปรเซส */
let ipN = 0;
const freshIp = () => `qc-p214-${RAND}-ip${++ipN}`;
async function legacy(mod: Any, method: "GET" | "POST", url: string, params: { tenantSlug: string; unitSlug: string }, body?: unknown): Promise<{ status: number; body: Any }> {
  const fn = mod?.[method];
  if (typeof fn !== "function") return { status: 0, body: { error: "ROUTE_MISSING" } };
  try {
    const res: Response = await fn(new Request(`http://x${url}`, { method, headers: { "x-forwarded-for": freshIp(), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined }), { params: Promise.resolve(params) });
    const text = await res.text();
    let j: Any = null;
    try {
      j = JSON.parse(text);
    } catch {
      j = { _raw: text.slice(0, 80) };
    }
    return { status: res.status, body: j };
  } catch (e) {
    return { status: -1, body: { error: "THROW", message: (e as Error).message.slice(0, 120) } };
  }
}
/** โปรเซสลูก 2 ตัวพร้อมกัน (Q5/Q6) — คืนผลของทั้งคู่ · ไม่พร้อม/ค้าง = หมายเหตุ */
async function twinChildren(task: "q5" | "q6", args: [Any, Any]): Promise<{ results: Any[]; note: string }> {
  const script = process.argv[1] ?? join(ROOT, "scripts", `${SUITE}.mts`);
  const kids = args.map((a) =>
    spawn(process.execPath, [...process.execArgv, script, "--child", task, Buffer.from(JSON.stringify(a)).toString("base64")], { cwd: ROOT, env: { ...process.env }, stdio: ["pipe", "pipe", "pipe"] }),
  );
  const outs = kids.map(() => ({ text: "", ready: false, result: null as Any }));
  kids.forEach((k, i) => {
    k.stdout.on("data", (d) => {
      outs[i]!.text += String(d);
      if (outs[i]!.text.includes("CHILD_READY")) outs[i]!.ready = true;
      const m = /CHILD_RESULT (\{.*\})/.exec(outs[i]!.text);
      if (m && !outs[i]!.result) {
        try {
          outs[i]!.result = JSON.parse(m[1]!);
        } catch {
          outs[i]!.result = { parseError: true };
        }
      }
    });
    k.stderr.on("data", (d) => {
      outs[i]!.text += String(d);
    });
  });
  let note = "";
  const t0 = Date.now();
  while (!outs.every((o) => o.ready) && Date.now() - t0 < 150_000) await sleep(200);
  if (!outs.every((o) => o.ready)) note = `โปรเซสลูกไม่พร้อม (${outs.map((o) => (o.ready ? "ready" : short(o.text.slice(-120), 120))).join(" | ")})`;
  for (const k of kids) k.stdin.write("GO\n");
  const t1 = Date.now();
  while (!outs.every((o) => o.result) && Date.now() - t1 < 90_000) await sleep(200);
  for (const k of kids) {
    try {
      k.stdin.end();
      if (k.exitCode === null) k.kill("SIGTERM");
    } catch {
      /* จบแล้ว */
    }
  }
  if (!outs.every((o) => o.result)) note += ` · โปรเซสลูกไม่ตอบ (${outs.map((o) => short(o.text.slice(-160), 160)).join(" | ")})`;
  return { results: outs.map((o) => o.result), note };
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} · DB ${HOST} ──`);
  console.log("   สาขา A (RESTAURANT · POS + คลัง + สมุด VAT · DEV1 กะเปิด · DEV2) · B (RESTAURANT · POS ไม่มีคลัง · DEVB1 DEVB2) · N (RESTAURANT ไม่ผูก POS = ตัวควบคุมประตูเดิม)");
  let fx = "";
  const notes: string[] = [];
  const U: Record<string, string> = {};
  const UN: Record<string, string> = {};
  const SLUG: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; name: string; role: string; unitAccess: string[]; perms: Record<string, boolean> }> = {};
  const CH: Record<string, string> = {};
  const PP: Record<string, string> = {};
  const MI: Record<string, string> = {};
  const INV: Record<string, string> = {};
  const ST: Record<string, string> = {};
  const TB: Record<string, string> = {};
  const TBN: Record<string, string> = {};
  const QR: Record<string, string> = {};
  const DEVID: Record<string, string> = {};
  let LINK_A = "";
  let SHIFT1 = "";
  const fixture = async (label: string, fn: () => Promise<void>) => {
    if (fx) return;
    try {
      await fn();
    } catch (e) {
      fx = `${label}: ${String((e as Error)?.message ?? e).slice(0, 160)}`;
      console.log(`  ⚠️  fixture ${fx}`);
    }
  };
  const soft = async <R,>(label: string, fn: () => Promise<R>): Promise<R | null> => {
    try {
      return await fn();
    } catch (e) {
      notes.push(`${label}: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
      return null;
    }
  };
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? r?.reason ?? "", 80)}`);
    return r;
  };
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const cc = (k = "OWNER"): Any => ({ tenantId: T, systemId: S.POS ?? "none", actorUserId: uid(k) });
  const ctxU = (u: string, dev?: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", unitId: U[u] ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const rctx = (u?: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", ...(u ? { unitId: U[u] } : {}) });
  const invCtx = (): Any => ({ tenantId: T, systemId: S.INV ?? "none", actorUserId: uid("OWNER") });
  let keyN = 0;
  const newKey = (pfx = "k") => `qc214${RAND}${pfx}${++keyN}`;
  const DEV1 = `qc214${RAND}dev1`;
  const DEV2 = `qc214${RAND}dev2`;
  const DEVB1 = `qc214${RAND}devb1`;
  const DEVB2 = `qc214${RAND}devb2`;
  const today = String(posIdx?.bkkToday?.() ?? new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
  const minus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const bkkDayStart = (d: string) => new Date(Date.parse(`${d}T00:00:00+07:00`));
  const patchPos = async (patch: (pos: Record<string, Any>) => void): Promise<void> => {
    const sys = await P.appSystem.findUnique({ where: { id: S.POS }, select: { settings: true } });
    const base = isRecord(sys?.settings) ? sys.settings : {};
    const pos = isRecord(base.pos) ? { ...base.pos } : {};
    patch(pos);
    await P.appSystem.update({ where: { id: S.POS }, data: { settings: { ...base, pos } } });
  };
  const setPay = (patch: Any) => patchPos((pos) => void (pos.payment = { ...(isRecord(pos.payment) ? pos.payment : {}), ...patch }));
  const setOtherSources = (on: boolean) =>
    patchPos((pos) => {
      const sh = isRecord(pos.shift) ? { ...pos.shift } : {};
      sh.required = { ...(isRecord(sh.required) ? sh.required : {}), otherSources: on };
      pos.shift = sh;
    });

  // ─── ร้าน · สาขา · ระบบ ───
  await fixture("ร้านชั่วคราว", async () => {
    T = (await P.tenant.create({ data: { name: `QC P2.14 ปิดเฟส 2 ${RAND}`, slug: T_SLUG } })).id;
    for (const k of ["A", "B", "N"]) {
      UN[k] = `${TAG} สาขา${k}`;
      SLUG[k] = `${T_SLUG}-${k.toLowerCase()}`;
      U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "RESTAURANT", name: UN[k], slug: SLUG[k] } })).id;
    }
    S.POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
    S.INV = (await sysSvc.createSystem(T, "INVENTORY", `คลัง ${RAND}`)).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี ${RAND}`)).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: `ร้านปิดเฟส คิวซี ${RAND} จำกัด`, taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.POS, U.B);
    await sysSvc.linkUnit(T, S.INV, U.A);
    await P.paymentProfile.create({ data: { tenantId: T, promptpayId: "0812345678", displayName: `ร้านปิดเฟส ${RAND}` } });
  });
  // ─── ผู้ใช้ + Membership จริง ───
  await fixture("ผู้ใช้", async () => {
    const spec: [string, string, () => string[], Record<string, boolean>][] = [
      ["OWNER", "OWNER", () => ["*"], {}],
      ["MGR", "MANAGER", () => [U.A!, U.B!], {}],
      ["CASH", "STAFF", () => [U.A!], { "pos.sale.create": true }],
      ["KADMIN", "STAFF", () => [U.A!], { "pos.settings.manage": true, "api.key.revoke": true, "pos.sale.read": true }],
      ["K2", "STAFF", () => [U.B!], { "pos.sale.create": true }],
      ["C2", "STAFF", () => [U.B!], { "pos.sale.create": true }],
    ];
    for (const [k, role, ua, perms] of spec) {
      const name = `${k} คิวซี${RAND}`;
      const u = await P.user.create({ data: { email: `${EMAIL_PREFIX}${k.toLowerCase()}@qc.invalid`, name } });
      userIds.push(u.id);
      await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess: ua(), permissions: perms, acceptedAt: new Date() } });
      US[k] = { id: u.id, name, role, unitAccess: ua(), perms };
    }
  });
  const DAY = 86_400_000;
  const cookieOf = async (k: string): Promise<string> => {
    const token = coreHash.randomToken(32) as string;
    await P.session.create({ data: { userId: uid(k), tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
    return `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${T}`;
  };
  const CK: Record<string, string> = {};
  await fixture("เซสชัน", async () => {
    CK.OWNER = await cookieOf("OWNER");
    CK.KADMIN = await cookieOf("KADMIN");
  });
  // ─── ช่องทาง ───
  await fixture("ช่องทาง", async () => {
    for (const u of ["A", "B"]) {
      const r = await call(chMod, "ensureUnitChannels", P, { tenantId: T, systemId: S.POS, unitId: U[u] });
      if (!Array.isArray(r)) throw new Error(`ensureUnitChannels ${u}: ${codeOf(r)}`);
      for (const c of r as Any[]) CH[`${c.code}_${u}`] = c.id;
    }
    const save = async (alias: string, u: string, input: Any) => {
      const r = must(`saveChannel ${alias}`, await call(chMod, "saveChannel", ctxU(u), A("OWNER"), input));
      CH[alias] = String(r.channel?.id ?? "");
    };
    await save("LM_A", "A", { code: "LINEMAN", name: `LINE MAN ${RAND}`, commissionBp: 3000 });
    await save("LM_B", "B", { code: "LINEMAN", name: `LINE MAN บี ${RAND}`, commissionBp: 3000 });
    await save("WALK_A", "A", { code: "CUSTOM_WALK", name: `สั่งหน้าร้าน ${RAND}`, payout: "DIRECT", adapter: "NONE" });
    await save("GB_A", "A", { code: "GRAB", name: `Grab ${RAND}`, payout: "PLATFORM", commissionBp: 2500, adapter: "NONE" });
    await save("GB_B", "B", { code: "GRAB", name: `Grab บี ${RAND}`, payout: "PLATFORM", commissionBp: 2500, adapter: "NONE" });
    await save("AUTO_B", "B", { code: "CUSTOM_AUTO", name: `รับอัตโนมัติ ${RAND}`, payout: "DIRECT", adapter: "NONE" });
    await save("P3_A", "A", { code: "CUSTOM_PRC", name: `ช่องทางเดิม ${RAND}`, payout: "DIRECT", adapter: "NONE" });
    const auto = async (u: string, id: string, on: boolean) => must(`autoAccept ${id.slice(-6)}`, await call(orderMod, "setChannelOrderSettings", ctxU(u), A("OWNER"), { channelId: id, autoAccept: on }));
    await auto("A", CH.GB_A!, true);
    await auto("B", CH.GB_B!, true);
    await auto("B", CH.AUTO_B!, true);
    if (CH.QR_ORDER_A) await auto("A", CH.QR_ORDER_A, false);
    else notes.push("ไม่มีช่องทาง QR_ORDER ของสาขา A");
  });
  // ─── สถานี · เมนู (A · N) · สินค้าคลัง · สินค้าแคตตาล็อก ───
  await fixture("เมนู/สินค้า", async () => {
    for (const [u, names] of [["A", ["ครัวร้อน", "บาร์"]], ["N", ["ครัวเอ็น"]]] as const) {
      for (const nm of names) must(`createStation ${u} ${nm}`, await menu.createStation(T, U[u], nm));
      for (const s of (await menu.listStations(T, U[u])) as Any[]) ST[`${u}:${s.name}`] = s.id;
    }
    const catA = must("createCategory A", await menu.createCategory(T, U.A, { name: `อาหาร ${RAND}` }, uid("OWNER")));
    const catN = must("createCategory N", await menu.createCategory(T, U.N, { name: `อาหารเอ็น ${RAND}` }, uid("OWNER")));
    const ia = must("createItem padthai", await menu.createItem(T, U.A, { categoryId: catA.id, stationId: ST["A:ครัวร้อน"], name: `ผัดไทย ${RAND}`, basePrice: 9000 }, uid("OWNER")));
    MI.padthai = ia.id;
    PP.padthai = String((await P.menuItem.findUnique({ where: { id: ia.id }, select: { posProductId: true } }))?.posProductId ?? "");
    if (!PP.padthai) throw new Error("เมนูผัดไทยไม่มี posProductId (POS ไม่ผูกสาขา A?)");
    const iN = must("createItem N", await menu.createItem(T, U.N, { categoryId: catN.id, stationId: ST["N:ครัวเอ็น"], name: `ผัดไทยเอ็น ${RAND}`, basePrice: 9000 }, uid("OWNER")));
    MI.padthaiN = iN.id;
    const it = await invSvc.createItem(invCtx(), { sku: `${TAG}-water`, name: `น้ำเปล่า ${RAND}`, unitLabel: "ชิ้น", costSatang: 400 });
    INV.water = it.id;
    await invSvc.receive(invCtx(), { itemId: it.id, qty: 200, costSatang: 400, idempotencyKey: `${TAG}-recv-water` });
    PP.water = String((await P.posProduct.findFirst({ where: { tenantId: T, systemId: S.POS, invItemId: it.id }, select: { id: true } }))?.id ?? "");
    if (!PP.water) throw new Error("น้ำเปล่าไม่มีแถว PosProduct");
    must("setPrice water", await call(catalog, "setPrice", cc(), PP.water, 1000));
    for (const [k, nm, price] of [["bar", "ขนมชิ้น", 5000], ["a8", "สินค้า TTL", 3000], ["mx", "ราคา X", 10000], ["my", "ราคา Y", 10000], ["mz", "ราคา Z", 10000]] as const) {
      PP[k] = String(must(`createProduct ${k}`, await call(catalog, "createProduct", cc(), { name: `${nm} ${RAND}`, kind: "PRODUCT", basePriceSatang: price }))?.id ?? "");
      if (!PP[k]) throw new Error(`createProduct ${k} ไม่มี id`);
    }
  });
  // ─── เครื่อง + กะ ───
  await fixture("เครื่อง/กะ", async () => {
    for (const [dev, u] of [[DEV1, "A"], [DEV2, "A"], [DEVB1, "B"], [DEVB2, "B"]] as const) {
      const r = must(`registerDevice ${dev.slice(-4)}`, await call(devMod, "registerDevice", ctxU(u), A("OWNER"), { name: `เครื่อง ${dev.slice(-4)} ${RAND}`, deviceCode: dev }));
      DEVID[dev] = String(r.device?.id ?? "");
    }
    const o = must("openShift DEV1", await call(shiftMod, "openShift", ctxU("A", DEV1), A("OWNER"), { deviceId: DEV1, deviceLabel: `เครื่อง dev1 ${RAND}`, floatSatang: 0 }));
    SHIFT1 = String(o.shift?.id ?? o.shiftId ?? "");
  });
  // ─── โต๊ะ ───
  await fixture("โต๊ะ", async () => {
    for (const [u, names] of [["A", ["L1T", "L3a", "L3b", "L4T", "Q5T", "O3T"]], ["N", ["N1", "N3"]]] as const) {
      const z = must(`zone ${u}`, await rtable.createZone(T, U[u], `โซน ${u} ${RAND}`));
      for (const nm of names) {
        const full = `${nm}-${RAND}`;
        const r = must(`table ${nm}`, await rtable.createTable(T, U[u], { zoneId: z.id, name: full, seats: 4 }));
        TB[nm] = r.id;
        TBN[nm] = full;
        QR[nm] = String(r.qrToken ?? (await P.restaurantTable.findUnique({ where: { id: r.id }, select: { qrToken: true } }))?.qrToken ?? "");
      }
    }
  });
  // ─── ลิงก์สั่งล่วงหน้า · ค่าตั้งการจ่าย ───
  await fixture("ลิงก์/ค่าตั้ง", async () => {
    await setPay({ qrExpiryMinutes: 20, beam: { enabled: false }, manualConfirmRequiresManager: false });
    const r = await call(orderMod, "createOrderLink", ctxU("A"), A("OWNER"), {});
    LINK_A = r?.ok === true ? String(r.link?.token ?? "") : "";
    if (!LINK_A) notes.push(`createOrderLink A: ${codeOf(r)}`);
  });
  // ─── คีย์ API ───
  const bundle = (id: string): string[] => {
    try {
      return scopesMod.expandBundles([id]);
    } catch {
      notes.push(`expandBundles(${id}) ไม่ได้`);
      return [];
    }
  };
  const K: Record<string, { id: string; raw: string; name: string } | null> = {};
  const mkKey = async (label: string, scopes: string[]): Promise<{ id: string; raw: string; name: string } | null> =>
    soft(`createApiKey ${label}`, async () => {
      const name = `QC P2.14 ${label} ${RAND}`;
      const k = await akSvc.createApiKey({ tenantId: T }, name, { scopes, systemId: S.POS, createdById: uid("OWNER") });
      keyIds.push(k.id);
      return { id: k.id as string, raw: k.rawKey as string, name };
    });
  if (!fx) {
    const FP = "pos.filter.unit:";
    K.admin = await mkKey("admin", bundle("pos-admin"));
    K.op = await mkKey("operate", bundle("pos-operate"));
    K.read = await mkKey("read", bundle("pos-read"));
    K.kA2 = await mkKey("revoke-A", [...bundle("pos-read"), `${FP}${U.A}`]);
    K.kB2 = await mkKey("revoke-B", [...bundle("pos-read"), `${FP}${U.B}`]);
    K.kAll2 = await mkKey("revoke-all", bundle("pos-read"));
    K.kAll3 = await mkKey("revoke-owner", bundle("pos-read"));
  }
  const raw = (k: string) => K[k]?.raw ?? `shark_none_${k}`;
  await drain();
  if (fx) console.log(`  ⚠️  fixture: ${fx}`);
  if (notes.length) console.log(`  ℹ️  fixture หมายเหตุ ${notes.length}: ${notes.slice(0, 6).join(" | ")}`);

  // ─── ตัวช่วยของข้อสอบ ───
  const run = async (id: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      chk(id, false, "ตรวจได้ (ไม่ crash)", FX(`THROW ${String((e as Error)?.message ?? e).slice(0, 160)}`));
    }
  };
  const P8 = (p: string[]) => joinP(p, "");
  const why = (p: string[]) => FX(P8(p) || "ครบ");
  const saleRow = async (id: string): Promise<Any> => (id ? P.posSale.findUnique({ where: { id }, include: { lines: true, payments: true } }).catch(() => null) : null);
  const orderRow = async (id: string): Promise<Any> => (id ? P.posOrder.findUnique({ where: { id } }).catch(() => null) : null);
  const evsOf = async (orderId: string, type?: string): Promise<Any[]> =>
    orderId ? ((await P.posOrderEvent.findMany({ where: { tenantId: T, orderId, ...(type ? { type } : {}) }, orderBy: [{ at: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]) : [];
  /** ops ของ marker ที่อ้างออเดอร์นี้ (id หรือรหัสออเดอร์ในข้อความ/รายละเอียด) */
  const opsFor = async (marker: string, order: Any): Promise<Any[]> =>
    ((await P.opsEvent.findMany({ where: { tenantId: T } }).catch(() => [])) as Any[]).filter((e) => {
      const txt = `${e.message ?? ""} ${e.detail ?? ""}`;
      return txt.includes(marker) && !!order && ((!!order.id && txt.includes(String(order.id))) || (!!order.code && txt.includes(String(order.code))));
    });
  const outboxN = async (type: string, needle?: string): Promise<number> =>
    ((await P.outboxEvent.findMany({ where: { tenantId: T, type } }).catch(() => [])) as Any[]).filter((e) => !needle || JSON.stringify(e.payload ?? {}).includes(needle)).length;
  const regSale = async (u: string, dev: string | undefined, lines: Any[], total: number, actor = "OWNER"): Promise<Any> =>
    call(regFacade, "submitRegisterSale", ctxU(u, dev), A(actor), { lines, payMethods: [{ type: "CASH", amountSatang: total }], cashReceivedSatang: total, expectedGrandTotalSatang: total, idempotencyKey: newKey("reg") });
  const ingest = (u: string, dev: string | undefined, channelId: string, label: string, lines: Any[], extra: Any = {}) =>
    call(orderMod, "ingestOrder", ctxU(u, dev), A("OWNER"), { channelId, idempotencyKey: newKey(label), lines, customer: { name: `คุณ ${label}` }, fulfilment: "PICKUP", ...extra });
  const holdLock = (key: string, ms: number): Promise<unknown> =>
    P.$transaction(
      async (tx: Any) => {
        await tx.$queryRawUnsafe(`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext($1))) l`, key);
        await sleep(ms);
      },
      { timeout: ms + 20_000, maxWait: 10_000 },
    ).catch((e: unknown) => notes.push(`holdLock ${key}: ${(e as Error).message.slice(0, 80)}`));

  // ════════════════ L ประตูร้านอาหารเดิม ════════════════
  const restAct = await tryImport("@/lib/actions/restaurant");
  const legacyCounts = async (tableId: string) => ({
    session: Number(await P.tableSession.count({ where: { tenantId: T, tableId } }).catch(() => -1)),
    order: Number(await P.restaurantOrder.count({ where: { tenantId: T } }).catch(() => -1)),
    request: Number(await P.restaurantServiceRequest.count({ where: { tenantId: T } }).catch(() => -1)),
  });
  const legacyCalls = (u: string, tok: string, mi: string): [string, Any, "GET" | "POST", string, unknown][] => [
    ["session", LR.session, "GET", `/api/store/${T_SLUG}/${SLUG[u]}/restaurant/session?qrToken=${encodeURIComponent(tok)}`, undefined],
    ["order", LR.order, "POST", `/api/store/${T_SLUG}/${SLUG[u]}/restaurant/order`, { qrToken: tok, items: [{ menuItemId: mi, qty: 1 }] }],
    ["service-request", LR.service, "POST", `/api/store/${T_SLUG}/${SLUG[u]}/restaurant/service-request`, { qrToken: tok, type: "CALL_STAFF" }],
    ["bill", LR.bill, "GET", `/s/${T_SLUG}/${SLUG[u]}/restaurant/bill?qrToken=${encodeURIComponent(tok)}`, undefined],
    ["notify-payment", LR.notify, "POST", `/s/${T_SLUG}/${SLUG[u]}/restaurant/notify-payment`, { qrToken: tok }],
  ];
  await run("L1", async () => {
    const p: string[] = [];
    const tok = QR.L1T ?? "";
    const c0 = await legacyCounts(TB.L1T ?? "none");
    for (const [name, mod, method, url, body] of legacyCalls("A", tok, MI.padthai ?? "none")) {
      const r = await legacy(mod, method, url, { tenantSlug: T_SLUG, unitSlug: SLUG.A ?? "" }, body);
      const door = String(r.body?.door ?? "");
      if (!(r.status === 409 && r.body?.error === "POS_LINKED" && (door === `/q/t/${tok}` || door === `/q/t/${encodeURIComponent(tok)}`))) p.push(`${name} → ${r.status} ${short(r.body, 70)}`);
    }
    const c1 = await legacyCounts(TB.L1T ?? "none");
    for (const k of Object.keys(c0) as (keyof typeof c0)[]) if (c1[k] !== c0[k]) p.push(`${k} ${c0[k]}→${c1[k]} (คาดไม่เปลี่ยน)`);
    for (const f of LEGACY_ROUTES) {
      const code = srcOf(f);
      const gi = firstDoorCall(code, doorCallNames(code));
      const si = code.search(/\b(placeGuestOrder|resolveTableSession|guestBill|notifyPromptpayPayment)\s*\(/);
      if (gi < 0 || (si >= 0 && gi > si)) p.push(`${f.split("/").slice(-2).join("/")}: posLinkedLegacyDoor ${gi < 0 ? "ไม่ถูกเรียก" : "อยู่หลัง storefront"}`);
    }
    chk("L1", !fx && p.length === 0, "409 POS_LINKED ×5 · ไม่มีแถวใหม่ · guard ก่อน storefront", why(p));
  });
  await run("L2", async () => {
    const p: string[] = [];
    const tok = QR.N1 ?? "";
    for (const [name, mod, method, url, body] of legacyCalls("N", tok, MI.padthaiN ?? "none")) {
      const r = await legacy(mod, method, url, { tenantSlug: T_SLUG, unitSlug: SLUG.N ?? "" }, body);
      if (!(r.status === 200 && r.body?.ok === true)) p.push(`${name} → ${r.status} ${short(r.body, 70)}`);
    }
    for (const f of LEGACY_ROUTES) {
      const base = showAt(BASE_REV, f);
      if (base === null) p.push(`อ่าน ${f} ที่ ${BASE_REV} ไม่ได้`);
      else if (withoutMarked(rd(f)) !== normBlank(base)) p.push(`${f.split("/").slice(-2).join("/")} ≠ ฐาน + บล็อก POS P2.14`);
    }
    chk("L2", !fx && p.length === 0, "สาขาไม่ผูก POS: 200 ok ×5 · ไฟล์ = ฐาน + บล็อกที่มาร์ก", why(p));
  });
  await run("L3", async () => {
    const p: string[] = [];
    const path = `/app/u/${SLUG.A}/restaurant`;
    const ck = CK.OWNER ?? "";
    const openS = async (u: string, tbl: string): Promise<string> => String(must(`openSession ${tbl}`, await rtable.openSession(T, U[u], TB[tbl], { openedByUserId: uid("OWNER") })).id ?? "");
    const S3 = await openS("A", "L3a");
    const S4 = await openS("A", "L3b");
    const SN = await openS("N", "N3");
    const mkOrder = async (u: string, sid: string, mi: string) => must(`createOrder ${sid.slice(-4)}`, await rorder.createOrder({ tenantId: T, unitId: U[u], type: "DINE_IN", sessionId: sid, cart: [{ menuItemId: mi, qty: 1, choiceIds: [] }], placedByUserId: uid("OWNER") }));
    await mkOrder("A", S3, MI.padthai!);
    await mkOrder("A", S4, MI.padthai!);
    await mkOrder("N", SN, MI.padthaiN!);
    const itemsOf = async (sid: string): Promise<Any[]> => (await P.restaurantOrderItem.findMany({ where: { order: { sessionId: sid } } }).catch(() => [])) as Any[];
    const it3 = (await itemsOf(S3))[0];
    const itN = (await itemsOf(SN))[0];
    if (!it3 || !itN) p.push("(fixture) ไม่มีรายการอาหารของ session");
    const salesOfSession = async (sid: string) => Number(await P.posSale.count({ where: { tenantId: T, sourceId: sid } }).catch(() => -1));
    /** ปฏิเสธจริง = redirect() · รหัส POS_LINKED · หรือคืน {ok:false} (ไม่นับ throw อื่น เช่น Invariant ของฮาร์เนส) */
    const refused = (r: Any) => r?.code === "NEXT_REDIRECT" || r?.code === "POS_LINKED" || /POS_LINKED/.test(String(r?.message ?? r?.reason ?? "")) || (r?.ok === false && !r?.threw);
    const posLinked = (r: Any) => r?.ok === false && (r?.code === "POS_LINKED" || /POS_LINKED/.test(String(r?.reason ?? r?.message ?? "")));
    // ตัวควบคุมบวกก่อน (สาขา N ไม่ผูก POS · พิสูจน์ว่าฮาร์เนส session/scope ใช้ได้)
    const rn = await act(ck, `/app/u/${SLUG.N}/restaurant`, restAct, "advanceItemAction", SLUG.N, String(itN?.id ?? "none"), "COOKING");
    const itNa = itN ? await P.restaurantOrderItem.findUnique({ where: { id: itN.id } }) : null;
    if (rn?.ok !== true || itNa?.kdsStatus !== "COOKING") p.push(`(ตัวควบคุม) N advanceItemAction → ${short(rn, 60)} · ${itNa?.kdsStatus}`);
    // ลำดับ: ไม่เปลี่ยนเงินก่อน (ฐานจะเขียนจริง — แดงตามเหตุผลอยู่แล้ว)
    const rc = await act(ck, path, restAct, "cancelOrderItemAction", SLUG.A, fd({ itemId: String(it3?.id ?? "none"), reason: "qc p2.14" }));
    const it3a = it3 ? await P.restaurantOrderItem.findUnique({ where: { id: it3.id } }) : null;
    if (!refused(rc) || it3a?.kdsStatus === "CANCELLED") p.push(`cancelOrderItemAction → ${short(rc, 50)} · รายการ ${it3a?.kdsStatus}`);
    const ra = await act(ck, path, restAct, "advanceItemAction", SLUG.A, String(it3?.id ?? "none"), "COOKING");
    const it3b = it3 ? await P.restaurantOrderItem.findUnique({ where: { id: it3.id } }) : null;
    if (!posLinked(ra) || it3b?.kdsStatus === "COOKING") p.push(`advanceItemAction → ${short(ra, 50)} · รายการ ${it3b?.kdsStatus} (คาด POS_LINKED ไม่เลื่อน)`);
    const rr = await act(ck, path, restAct, "recallItemAction", SLUG.A, fd({ itemId: String(it3?.id ?? "none") }));
    if (!refused(rr)) p.push(`recallItemAction → ${short(rr, 50)} (คาดปฏิเสธ)`);
    const rm = await act(ck, path, restAct, "mergeSessionAction", SLUG.A, fd({ intoSessionId: S3, fromSessionId: S4 }));
    const s4 = await P.tableSession.findUnique({ where: { id: S4 } }).catch(() => null);
    if (!refused(rm) || s4?.status !== "OPEN") p.push(`mergeSessionAction → ${short(rm, 50)} · S4 ${s4?.status}`);
    const rp = await act(ck, path, restAct, "confirmPromptpayPaymentAction", SLUG.A, fd({ sessionId: S3, requestId: "" }));
    if (!refused(rp) || (await salesOfSession(S3)) !== 0) p.push(`confirmPromptpayPaymentAction → ${short(rp, 50)} · บิล ${await salesOfSession(S3)}`);
    const rk = await act(ck, path, restAct, "checkoutAction", SLUG.A, { sessionId: S3, payMethod: "CASH" });
    if (!posLinked(rk) || (await salesOfSession(S3)) !== 0) p.push(`checkoutAction → ${short(rk, 50)} · บิล ${await salesOfSession(S3)} (คาด POS_LINKED 0 บิล)`);
    // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 LEG-2b · H3): voidCheckout บนโต๊ะที่มีบิล POS ชำระแล้ว = ปฏิเสธ (0 VOIDED · บิลยัง PAID · โต๊ะเดิม) · createStaffOrder = ปฏิเสธ (0 รอบ)
    const vs = await call(posSvc, "createSale", { tenantId: T, unitId: U.A, systemId: S.POS, sourceModule: "POS", idempotencyKey: newKey("l3void"), lines: [{ name: `โต๊ะ L3 ${RAND}`, qty: 1, unitPriceSatang: 5000 }], payMethods: [{ type: "CASH", amountSatang: 5000 }] });
    const vSale = String(vs?.saleId ?? "");
    const it4 = (await itemsOf(S4))[0];
    if (!vSale || !it4) p.push(`(fixture) บิลโต๊ะ ${codeOf(vs)} · รายการ S4 ${!!it4}`);
    else await P.restaurantOrderItem.update({ where: { id: it4.id }, data: { saleId: vSale } });
    const s4b = await P.tableSession.findUnique({ where: { id: S4 } }).catch(() => null);
    const voided0 = await P.posSale.count({ where: { tenantId: T, unitId: U.A, status: "VOIDED" } });
    const rv = await act(ck, path, restAct, "voidCheckoutAction", SLUG.A, fd({ sessionId: S4 }));
    const vRow = vSale ? await P.posSale.findUnique({ where: { id: vSale }, select: { status: true } }) : null;
    const voided = (await P.posSale.count({ where: { tenantId: T, unitId: U.A, status: "VOIDED" } })) - voided0;
    const s4c = await P.tableSession.findUnique({ where: { id: S4 } }).catch(() => null);
    const it4b = it4 ? await P.restaurantOrderItem.findUnique({ where: { id: it4.id } }) : null;
    if (!refused(rv) || vRow?.status !== "PAID" || voided !== 0 || s4c?.status !== s4b?.status || it4b?.saleId !== vSale) p.push(`voidCheckoutAction → ${short(rv, 50)} · บิล ${vRow?.status} · VOIDED ${voided} · โต๊ะ ${s4b?.status}→${s4c?.status} · รายการผูกบิล ${it4b?.saleId === vSale} (คาด ปฏิเสธ · PAID · 0 · เดิม · ผูกเดิม)`);
    const ordersOf = async (sid: string) => Number(await P.restaurantOrder.count({ where: { sessionId: sid } }).catch(() => -1));
    const o3 = await ordersOf(S3);
    const ro = await act(ck, path, restAct, "createStaffOrderAction", SLUG.A, { sessionId: S3, type: "DINE_IN", cart: [{ menuItemId: MI.padthai!, qty: 1, choiceIds: [] }] });
    const o3b = await ordersOf(S3);
    if (!posLinked(ro) && !(ro?.ok === false && ro?.err?.code === "POS_LINKED")) p.push(`createStaffOrderAction → ${short(ro, 60)} (คาด POS_LINKED)`);
    if (o3b !== o3) p.push(`createStaffOrderAction สร้างรอบ ${o3}→${o3b} (คาด 0 รอบใหม่)`);
    // สถิต: action + หน้าเดิม
    const actCode = srcOf(F.actRest);
    const actNames = doorCallNames(actCode);
    for (const fn of LEGACY_ACTIONS) {
      const b = fnBody(actCode, fn);
      if (!/POS_LINKED/.test(b) && firstDoorCall(b, actNames) < 0) p.push(`${fn} ไม่มีด่าน POS_LINKED`);
    }
    for (const f of LEGACY_PAGES) {
      const c = srcOf(f);
      if (firstDoorCall(c, doorCallNames(c)) < 0 || !/\bredirect\s*\(/.test(c) || !/\/pos\//.test(c)) p.push(`${f.replace("src/app/app/u/[unitSlug]/restaurant/", "")} ไม่ redirect ไป /pos/ ด้วย guard`);
    }
    chk("L3", !fx && p.length === 0, "action เดิม 6 ตัวปฏิเสธบนสาขาที่ผูก POS · N ทำงาน · หน้าเดิม 5 หน้า redirect", why(p));
  });
  await run("L4", async () => {
    const p: string[] = [];
    const prop = await tryImport("@/lib/ai/proposals");
    const S5 = String(must("openSession L4T", await rtable.openSession(T, U.A, TB.L4T, { openedByUserId: uid("OWNER") })).id ?? "");
    must("createOrder L4", await rorder.createOrder({ tenantId: T, unitId: U.A, type: "DINE_IN", sessionId: S5, cart: [{ menuItemId: MI.padthai, qty: 1, choiceIds: [] }], placedByUserId: uid("OWNER") }));
    const m = { userId: uid("OWNER"), role: "OWNER", unitAccess: ["*"], permissions: {} };
    const r = await call(prop, "runKind", m, T, "restaurant_close_bill", { tableName: TBN.L4T, payMethod: "CASH", unitName: UN.A }, `qc214-${RAND}-l4`, uid("OWNER"));
    const sales = Number(await P.posSale.count({ where: { tenantId: T, sourceId: S5 } }).catch(() => -1));
    const s5 = await P.tableSession.findUnique({ where: { id: S5 } }).catch(() => null);
    if (r?.missing) p.push(MISSING + " runKind");
    else if (r?.threw !== true) p.push(`runKind → ${short(r, 80)} (คาด throw ปฏิเสธ)`);
    if (sales !== 0 || s5?.status !== "OPEN") p.push(`บิล ${sales} · session ${s5?.status} (คาด 0 · OPEN)`);
    const pc = srcOf(F.proposals);
    if (!/POS_LINKED/.test(pc) && firstDoorCall(pc, doorCallNames(pc)) < 0) p.push("proposals.ts ไม่มีด่าน POS_LINKED");
    chk("L4", !fx && p.length === 0, "ข้อเสนอ AI ปิดบิลถูกปฏิเสธ · 0 บิล · โต๊ะยังเปิด", why(p));
  });
  await run("L5", async () => {
    const p: string[] = [];
    const fn = doorFn();
    if (typeof fn !== "function") p.push(`${MISSING} posLinkedLegacyDoor (${F.legacyDoor})`);
    else {
      const safe = async (...args: unknown[]): Promise<unknown> => {
        try {
          return await fn(...args);
        } catch (e) {
          return `THROW ${(e as Error).message.slice(0, 60)}`;
        }
      };
      const throwing = new Proxy({}, { get: () => { throw new Error("qc-p2.14: db down"); } });
      const a = await safe(T, U.A);
      const n = await safe(T, U.N);
      const w = await safe(T, U.N, { write: true, db: throwing });
      if (a !== true) p.push(`(T, A) = ${short(a, 40)} (คาด true)`);
      if (n !== false) p.push(`(T, N) = ${short(n, 40)} (คาด false)`);
      if (w !== true) p.push(`DB ล้ม + write = ${short(w, 40)} (คาด true · fail-closed)`);
    }
    chk("L5", !fx && p.length === 0, "A true · N false · DB ล้ม+write true", why(p));
  });

  // ════════════════ A REST /api/v1/pos + คีย์ ════════════════
  const salesOfT = async (): Promise<number> => Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1));
  const saleIdOf = (r: Res): string => String(r.body?.data?.saleId ?? r.body?.data?.sale?.id ?? "");
  await run("A1", async () => {
    const p: string[] = [];
    const body = (extra: Any = {}) => ({ unitId: U.B, lines: [{ productId: PP.bar, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 5000 }], cashReceivedSatang: 5000, ...extra });
    const refusedShift = (r: Res) => (r.status === 409 || r.status === 422) && /กะ/.test(String(r.body?.error?.message_th ?? r.body?.error?.message ?? ""));
    await setOtherSources(false);
    const r1 = await api("POST", "/sales", raw("op"), { body: body() });
    const s1 = await saleRow(saleIdOf(r1));
    if (r1.status !== 200 || r1.body?.data?.outOfShift !== true || s1?.shiftId !== null) p.push(`ปิด otherSources → ${st(r1)} outOfShift=${short(r1.body?.data?.outOfShift)} shift=${short(s1?.shiftId)} (คาด 200 · true · null)`);
    await setOtherSources(true);
    const n0 = await salesOfT();
    const r2 = await api("POST", "/sales", raw("op"), { body: body() });
    if (!refusedShift(r2) || (await salesOfT()) !== n0) p.push(`เปิด + 0 กะ → ${st(r2)} บิล ${n0}→${await salesOfT()}`);
    const o1 = await call(shiftMod, "openShift", ctxU("B", DEVB1), A("OWNER"), { deviceId: DEVB1, deviceLabel: "B1", floatSatang: 0 });
    const B1 = String(o1?.shift?.id ?? "");
    const r3 = await api("POST", "/sales", raw("op"), { body: body() });
    const s3 = await saleRow(saleIdOf(r3));
    if (r3.status !== 200 || !B1 || s3?.shiftId !== B1 || r3.body?.data?.outOfShift === true) p.push(`เปิด + 1 กะ → ${st(r3)} shift ${short(s3?.shiftId)} (คาด ${B1.slice(-6)})`);
    const o2 = await call(shiftMod, "openShift", ctxU("B", DEVB2), A("OWNER"), { deviceId: DEVB2, deviceLabel: "B2", floatSatang: 0 });
    const B2 = String(o2?.shift?.id ?? "");
    const n1 = await salesOfT();
    const r4 = await api("POST", "/sales", raw("op"), { body: body() });
    if (!refusedShift(r4) || (await salesOfT()) !== n1) p.push(`เปิด + 2 กะ → ${st(r4)} บิล ${n1}→${await salesOfT()} (คาดปฏิเสธ SHIFT_REQUIRED)`);
    const r5 = await api("POST", "/sales", raw("op"), { body: body({ shiftId: B2 }) });
    const s5 = await saleRow(saleIdOf(r5));
    if (r5.status !== 200 || !B2 || s5?.shiftId !== B2) p.push(`2 กะ + shiftId → ${st(r5)} shift ${short(s5?.shiftId)}`);
    await setOtherSources(false);
    if (!o1?.ok || !o2?.ok) p.push(`(fixture) เปิดกะ B ${codeOf(o1)}/${codeOf(o2)}`);
    chk("A1", !fx && p.length === 0, "outOfShift · 0/≥2 กะ = ปฏิเสธ · 1 กะ/shiftId = ผูกกะ", why(p));
  });
  const keyActs = await tryImport("@/lib/modules/pos/api-key-actions");
  await run("A2", async () => {
    const p: string[] = [];
    const path = `/app/sys/${S.POS}/pos/settings`;
    const revoked = async (k: string) => !!(await P.apiKey.findUnique({ where: { id: K[k]?.id ?? "none" }, select: { revokedAt: true } }).catch(() => null))?.revokedAt;
    const rv = (ck: string, k: string) => act(ck, path, keyActs, "revokePosApiKeyAction", { systemId: S.POS, keyId: K[k]?.id ?? "none" });
    const rB = await rv(CK.KADMIN ?? "", "kB2");
    if (rB?.code !== "PERMISSION_DENIED" || (await revoked("kB2"))) p.push(`คีย์สาขา B → ${short(rB, 50)} revoked=${await revoked("kB2")}`);
    const rAll = await rv(CK.KADMIN ?? "", "kAll2");
    if (rAll?.code !== "PERMISSION_DENIED" || (await revoked("kAll2"))) p.push(`คีย์ทุกสาขา → ${short(rAll, 50)} revoked=${await revoked("kAll2")}`);
    const rA = await rv(CK.KADMIN ?? "", "kA2");
    if (rA?.ok !== true || !(await revoked("kA2"))) p.push(`คีย์สาขา A → ${short(rA, 50)} (คาด ok)`);
    const rO = await rv(CK.OWNER ?? "", "kAll3");
    if (rO?.ok !== true || !(await revoked("kAll3"))) p.push(`(ตัวควบคุม) เจ้าของ → ${short(rO, 50)}`);
    chk("A2", !fx && p.length === 0, "เพิกถอนได้เฉพาะคีย์ในสาขาที่ดูแลครบ", why(p));
  });
  await run("A3", async () => {
    const p: string[] = [];
    const nm = `สินค้าจาก API ${RAND}`;
    const c = await api("POST", "/products", raw("admin"), { body: { unitId: U.A, name: nm, kind: "PRODUCT", basePriceSatang: 4900 } });
    const id = String(c.body?.data?.id ?? c.body?.data?.product?.id ?? (await P.posProduct.findFirst({ where: { tenantId: T, name: nm }, select: { id: true } }).catch(() => null))?.id ?? "");
    if (c.status !== 200 || !id) p.push(`POST /products → ${st(c)}`);
    const au = (await P.auditLog.findMany({ where: { tenantId: T, targetType: "PosProduct", targetId: id || "none", action: { startsWith: "pos.product." } } }).catch(() => [])) as Any[];
    if (!au.length) p.push("ไม่มี audit ของ catalog");
    for (const a of au) if (a.actorType !== "API_KEY" || a.actorId !== K.admin?.id) p.push(`${a.action} actorType ${a.actorType} actorId ${short(a.actorId, 30)}`);
    const bad = Number(await P.auditLog.count({ where: { tenantId: T, actorId: { startsWith: "apikey:" } } }).catch(() => -1));
    if (bad !== 0) p.push(`แถว actorId apikey:* ${bad}`);
    chk("A3", !fx && p.length === 0, "audit catalog = API_KEY + keyId", why(p));
  });
  await run("A4", async () => {
    const p: string[] = [];
    const rk = `qc214req${RAND}key`;
    const ru = `qc214req${RAND}usr`;
    const pl = (by: string) => ({ ref: `qc214-${RAND}`, entityId: `qc214-${RAND}`, requestedById: by, amountSatang: 100, unitId: U.A, systemId: S.POS, title: "QC P2.14" });
    await P.posApprovalPayload.create({ data: { requestId: rk, tenantId: T, kind: "POS_VOID", payload: pl(K.admin?.id ?? "none") } });
    await P.posApprovalPayload.create({ data: { requestId: ru, tenantId: T, kind: "POS_VOID", payload: pl(uid("CASH")) } });
    const cards = await call(apprMod, "posApprovalCards", T, [rk, ru]);
    const get = (id: string): Any => (cards instanceof Map ? cards.get(id) : isRecord(cards) ? cards[id] : null);
    if (get(rk)?.requesterName !== `API: ${K.admin?.name}`) p.push(`คำขอของคีย์ → ${short(get(rk)?.requesterName)} (คาด "API: ${K.admin?.name}")`);
    if (get(ru)?.requesterName !== US.CASH?.name) p.push(`(ตัวควบคุม) คำขอของคน → ${short(get(ru)?.requesterName)}`);
    chk("A4", !fx && p.length === 0, "API: <ชื่อคีย์> · คนจริง = ชื่อคน", why(p));
  });
  await run("A5", async () => {
    const p: string[] = [];
    const opsSrc = srcOf(F.opsSales);
    const at = opsSrc.indexOf('id: "sales.taxInvoice"');
    const blk = at < 0 ? "" : opsSrc.slice(at, opsSrc.indexOf("definePosOp", at + 10) > 0 ? opsSrc.indexOf("definePosOp", at + 10) : opsSrc.length);
    if (!/pos-api:/.test(blk) || !/serviceKey/.test(blk)) p.push("ops/sales.ts taxInvoice ไม่ส่ง serviceKey pos-api:<keyId>:<saleId>");
    const s = await api("POST", "/sales", raw("admin"), { body: { unitId: U.A, lines: [{ productId: PP.bar, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 5000 }], cashReceivedSatang: 5000 } });
    const id = saleIdOf(s);
    await drain(3);
    const buyer = { kind: "JURISTIC", name: `บริษัท ผู้ซื้อ คิวซี ${RAND} จำกัด`, taxId: "0105561177639", branchCode: "00000", address: "1 ถนนทดสอบ กรุงเทพฯ 10110" };
    const t1 = await api("POST", `/sales/${id || "none"}/tax-invoice`, raw("admin"), { body: { unitId: U.A, buyer } });
    const t2 = await api("POST", `/sales/${id || "none"}/tax-invoice`, raw("admin"), { body: { unitId: U.A, buyer } });
    const d1 = String(t1.body?.data?.docId ?? "");
    if (t1.status !== 200 || !d1) p.push(`tax-invoice → ${st(t1)} ${short(t1.body?.error?.message_th ?? "", 60)}`);
    if (t2.status !== 200 || String(t2.body?.data?.docId ?? "") !== d1) p.push(`ซ้ำด้วยคีย์ใหม่ → ${st(t2)} doc ${short(t2.body?.data?.docId)}`);
    const au = (await P.auditLog.findFirst({ where: { tenantId: T, action: "pos.taxinvoice.issued", targetId: id || "none" } }).catch(() => null)) as Any;
    if (au?.after?.serviceKey !== `pos-api:${K.admin?.id}:${id}`) p.push(`audit after.serviceKey ${short(au?.after?.serviceKey)} (คาด pos-api:<keyId>:<saleId>)`);
    chk("A5", !fx && p.length === 0, "serviceKey pos-api:<keyId>:<saleId> · เอกสารเดิม", why(p));
  });
  await run("A6", async () => {
    const p: string[] = [];
    const mk = async () => saleIdOf(await api("POST", "/sales", raw("admin"), { body: { unitId: U.A, lines: [{ productId: PP.bar, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 5000 }], cashReceivedSatang: 5000 } }));
    const id1 = await mk();
    const v = await api("POST", `/sales/${id1 || "none"}/void`, raw("admin"), { body: { confirm: true, reason: "ทดสอบยกเลิกผ่าน API" } });
    const av = (await P.auditLog.findFirst({ where: { tenantId: T, action: "pos.sale.void", targetId: id1 || "none" } }).catch(() => null)) as Any;
    if (v.status !== 200 || av?.after?.source !== "API") p.push(`REST void → ${st(v)} after.source ${short(av?.after?.source)}`);
    const id2 = await mk();
    const g = await api("GET", `/sales/${id2 || "none"}/refundable`, raw("admin"));
    const line = (g.body?.data?.lines ?? g.body?.data?.sale?.lines ?? [])[0] ?? (await saleRow(id2))?.lines?.[0];
    const lineId = String(line?.lineId ?? line?.id ?? "");
    const rf = await api("POST", `/sales/${id2 || "none"}/refund`, raw("admin"), { body: { confirm: true, reason: "ลูกค้าคืนสินค้า", reasonCode: "CHANGED_MIND", lines: [{ lineId, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 5000 }] } });
    const rid = String(rf.body?.data?.refund?.id ?? rf.body?.data?.refundId ?? "");
    const ar = (await P.auditLog.findFirst({ where: { tenantId: T, action: "pos.sale.refund", targetId: rid || "none" } }).catch(() => null)) as Any;
    if (rf.status !== 200 || ar?.after?.source !== "API") p.push(`REST refund → ${st(rf)} after.source ${short(ar?.after?.source)}`);
    const h = await regSale("A", DEV1, [{ productId: PP.bar, qty: 1 }], 5000);
    const vh = await call(billsMod, "voidSaleByActor", ctxU("A", DEV1), A("OWNER"), { unitId: U.A, saleId: String(h?.saleId ?? "none"), reason: "ทดสอบยกเลิกโดยคน", idempotencyKey: newKey("vh") });
    const ah = (await P.auditLog.findFirst({ where: { tenantId: T, action: "pos.sale.void", targetId: String(h?.saleId ?? "none") } }).catch(() => null)) as Any;
    if (vh?.ok !== true || !ah || ah.after?.source === "API") p.push(`(ตัวควบคุม) void ของคน → ${codeOf(vh)} source ${short(ah?.after?.source)}`);
    chk("A6", !fx && p.length === 0, "REST void/refund after.source API · ของคนไม่ใช่", why(p));
  });
  const paidOrder = async (label: string, to: "ACCEPTED" | "PREPARING" | "READY" | "HANDED"): Promise<{ orderId: string; saleId: string; note: string }> => {
    const ing = await ingest("A", DEV1, CH.WALK_A ?? "none", label, [{ productId: PP.bar, qty: 1 }]);
    const orderId = ing?.ok === true ? String(ing.orderId ?? "") : "";
    if (!orderId) return { orderId: "", saleId: "", note: `ingest ${codeOf(ing)} ${short(ing?.message ?? "", 40)}` };
    const ctx = ctxU("A", DEV1);
    const ac = await call(orderMod, "acceptOrder", ctx, A("OWNER"), { id: orderId });
    const o = await orderRow(orderId);
    const pay = await call(orderMod, "payOrder", ctx, A("OWNER"), { id: orderId, idempotencyKey: newKey(`${label}p`), payMethods: [{ type: "CASH", amountSatang: o?.totalSatang ?? 0 }], cashReceivedSatang: o?.totalSatang ?? 0 });
    let note = ac?.ok !== true ? `accept ${codeOf(ac)}` : pay?.ok !== true ? `pay ${codeOf(pay)} ${short(pay?.message ?? "", 40)}` : "";
    if (to !== "ACCEPTED") {
      const a = await call(orderMod, "markPreparing", ctx, A("OWNER"), { id: orderId });
      if (a?.ok !== true) note += ` preparing ${codeOf(a)}`;
    }
    if (to === "READY" || to === "HANDED") {
      const b = await call(orderMod, "markReady", ctx, A("OWNER"), { id: orderId });
      if (b?.ok !== true) note += ` ready ${codeOf(b)}`;
    }
    if (to === "HANDED") {
      const c = await call(orderMod, "handOver", ctx, A("OWNER"), { id: orderId });
      if (c?.ok !== true) note += ` handOver ${codeOf(c)}`;
    }
    return { orderId, saleId: String(pay?.saleId ?? (await orderRow(orderId))?.saleId ?? ""), note };
  };
  await run("A7", async () => {
    const p: string[] = [];
    const want: Record<string, [string, string]> = { ACCEPTED: ["CANCELLED", "REFUNDED"], PREPARING: ["CANCELLED", "REFUNDED"], READY: ["CANCELLED", "REFUNDED"], HANDED: ["HANDED", "REFUNDED"] };
    const made: [string, { orderId: string; saleId: string; note: string }][] = [];
    for (const s of Object.keys(want) as ("ACCEPTED" | "PREPARING" | "READY" | "HANDED")[]) made.push([s, await paidOrder(`a7${s.toLowerCase()}`, s)]);
    for (const [s, m] of made) {
      if (m.note || !m.saleId) {
        p.push(`(fixture ${s}) ${m.note || "ไม่มีบิล"}`);
        continue;
      }
      const v = await api("POST", `/sales/${m.saleId}/void`, raw("admin"), { body: { confirm: true, reason: `ยกเลิกบิลออเดอร์ ${s}` } });
      if (v.status !== 200) p.push(`${s} void → ${st(v)}`);
    }
    await drain(3);
    const snap: Record<string, string> = {};
    for (const [s, m] of made) {
      const o = await orderRow(m.orderId);
      snap[s] = `${o?.status}/${o?.paymentState}/${o?.version}`;
      if (o && (o.status !== want[s]![0] || o.paymentState !== want[s]![1])) p.push(`${s} → ${o.status}/${o.paymentState} (คาด ${want[s]!.join("/")})`);
    }
    await drain(2);
    for (const [s, m] of made) {
      const o = await orderRow(m.orderId);
      if (o && `${o.status}/${o.paymentState}/${o.version}` !== snap[s]) p.push(`${s} ระบายซ้ำเปลี่ยน ${snap[s]} → ${o.status}/${o.paymentState}/${o.version}`);
    }
    chk("A7", !fx && p.length === 0, "void บิลของออเดอร์ทุกสถานะปิดออเดอร์ถูก · เล่นซ้ำไม่เปลี่ยน", why(p));
  });
  await run("A8", async () => {
    const p: string[] = [];
    const k = `p214-${RAND}-a8`;
    const body = { unitId: U.A, lines: [{ productId: PP.a8, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 3000 }], cashReceivedSatang: 3000 };
    const r1 = await api("POST", "/sales", raw("admin"), { body, idem: k });
    const id1 = saleIdOf(r1);
    if (r1.status !== 200 || !id1) p.push(`(fixture) บิลแรก ${st(r1)}`);
    const off = await call(catalog, "setAvailability", ctxU("A"), A("OWNER"), { productId: PP.a8, unitId: U.A, available: false, source: "MANUAL" });
    if (off?.ok === false) p.push(`(fixture) 86 ${codeOf(off)}`);
    await P.$executeRawUnsafe(`DELETE FROM "ApiIdempotency" WHERE "tenantId" = $1 AND "keyId" = $2`, T, K.admin?.id ?? "none");
    const r2 = await api("POST", "/sales", raw("admin"), { body, idem: k });
    if (r2.status !== 200 || saleIdOf(r2) !== id1) p.push(`เล่นซ้ำหลัง TTL → ${st(r2)} saleId ${short(saleIdOf(r2), 20)} (คาด ${id1.slice(-8)})`);
    const sale = await saleRow(id1);
    const same = sale?.idempotencyKey ? Number(await P.posSale.count({ where: { tenantId: T, idempotencyKey: sale.idempotencyKey } }).catch(() => -1)) : -1;
    if (same !== 1) p.push(`บิลของคีย์นี้ ${same} (คาด 1)`);
    await call(catalog, "setAvailability", ctxU("A"), A("OWNER"), { productId: PP.a8, unitId: U.A, available: true, source: "MANUAL" });
    chk("A8", !fx && p.length === 0, "ค้นคีย์ก่อน quote: บิลเดิม", why(p));
  });
  await run("A10", async () => {
    const p: string[] = [];
    const s = await api("POST", "/sales", raw("admin"), { body: { unitId: U.A, lines: [{ productId: PP.bar, qty: 2 }], payMethods: [{ type: "CASH", amountSatang: 10000 }], cashReceivedSatang: 10000 } });
    const id = saleIdOf(s);
    const g = await api("GET", `/sales/${id || "none"}?unitId=${U.A}`, raw("read"));
    const t = g.body?.data?.totals;
    const row = await saleRow(id);
    if (g.status !== 200 || !isRecord(t)) p.push(`GET /sales/{id} → ${st(g)} totals ${short(t, 60)}`);
    else {
      for (const k of API10_KEYS) if (!Number.isInteger(t[k])) p.push(`totals.${k} ไม่ใช่จำนวนเต็ม`);
      for (const k of API10_LEGACY) if (k in t) p.push(`totals ยังมีคีย์เดิม ${k}`);
      if (row) {
        for (const [k, col] of [["grandTotalSatang", "grandTotalSatang"], ["vatSatang", "vatSatang"], ["tipSatang", "tipSatang"], ["refundedSatang", "refundedSatang"], ["serviceChargeSatang", "serviceChargeSatang"]] as const) if (t[k] !== row[col]) p.push(`totals.${k} ${t[k]} ≠ บิล ${row[col]}`);
      }
    }
    const d = await call(billsMod, "billDetail", ctxU("A"), A("OWNER"), { saleId: id || "none", unitId: U.A });
    const dt = d?.ok === true ? (d.bill?.totals ?? d.detail?.totals ?? d.totals) : null;
    if (!isRecord(dt) || !("subtotal" in dt) || !("grandTotal" in dt)) p.push(`billDetail ของลิ้นชักเปลี่ยนรูป (${short(dt, 60)})`);
    else if (isRecord(t) && t.subtotalSatang !== dt.subtotal) p.push(`subtotalSatang ${t.subtotalSatang} ≠ ลิ้นชัก ${dt.subtotal}`);
    const gen = spawnSync("pnpm", ["exec", "tsx", "scripts/gen-pos-api-docs.mts", "--check"], { cwd: ROOT, encoding: "utf8", timeout: 240_000 });
    if (gen.status !== 0) p.push(`gen-pos-api-docs --check exit ${gen.status} ${short((gen.stdout ?? "") + (gen.stderr ?? ""), 80)}`);
    chk("A10", !fx && p.length === 0, "totals 10 คีย์ *Satang · ลิ้นชักคงเดิม · --check 0", why(p));
  });
  await run("A11", async () => {
    const p: string[] = [];
    const heads: string[] = Array.isArray(reportsMod?.CSV_HEADERS?.daily) ? reportsMod.CSV_HEADERS.daily : [];
    const ic = heads.indexOf("จำนวนคืนเงิน");
    const ia = heads.indexOf("ยอดคืนเงิน");
    if (ic < 0 || ia < 0) p.push(`CSV_HEADERS.daily ไม่มี จำนวนคืนเงิน/ยอดคืนเงิน (${heads.length} คอลัมน์)`);
    const j = await call(reportsMod, "reportDailySales", rctx("A"), A("OWNER"), { from: today, to: today });
    const row = (j?.report?.rows ?? []).find((r: Any) => r.businessDate === today);
    if (!row || !(row.refundCount >= 1)) p.push(`(fixture) วันนี้ไม่มีใบคืน (refundCount ${short(row?.refundCount)})`);
    const c = await call(reportsMod, "reportCsv", rctx("A"), A("OWNER"), { kind: "daily", from: today, to: today });
    const lines = csvParse(String(c?.body ?? "").replace(/^﻿/, ""));
    const data = lines.find((l) => l[0] === today);
    if (c?.ok !== true || !data) p.push(`reportCsv daily → ${codeOf(c)}`);
    else if (ic >= 0 && ia >= 0 && row) {
      const num = (s: string | undefined) => Number(String(s ?? "").replace(/["\s,]/g, ""));
      if (num(data[ic]) !== row.refundCount) p.push(`CSV จำนวนคืนเงิน ${data[ic]} ≠ ${row.refundCount}`);
      const baht = num(data[ia]);
      if (Math.round(baht * 100) !== row.refundTotalSatang && baht !== row.refundTotalSatang) p.push(`CSV ยอดคืนเงิน ${data[ia]} ≠ ${row.refundTotalSatang} สตางค์`);
    }
    chk("A11", !fx && p.length === 0, "CSV daily มีคอลัมน์คืนเงินตรง JSON", why(p));
  });

  // ════════════════ D จอลูกค้า ════════════════
  await run("D1", async () => {
    const p: string[] = [];
    const pairOf = async (dev: string): Promise<boolean> => {
      const e = await call(dispMod, "enableCustomerDisplay", ctxU("A"), A("OWNER"), { deviceId: DEVID[dev] });
      const code = String(e?.pairCode ?? "");
      const pr = code ? await call(dispMod, "pairCustomerDisplay", { code }, { ip: freshIp() }) : null;
      return pr?.ok === true;
    };
    const okX = await pairOf(DEV1);
    const okY = await pairOf(DEV2);
    if (!okX || !okY) p.push(`(fixture) จับคู่จอ X ${okX} Y ${okY}`);
    await call(devMod, "heartbeat", ctxU("A", DEV1), A("CASH"), { deviceCode: DEV1 });
    const rowOf = async (dev: string): Promise<Any> => P.posCustomerDisplay.findFirst({ where: { tenantId: T, deviceId: DEVID[dev] ?? "none", status: "ACTIVE" } }).catch(() => null);
    const state = { phase: "cart", lines: [{ qty: 1, name: "น้ำเปล่า", grossSatang: 1000, discountSatang: 0 }], totals: { subtotalSatang: 1000, lineDiscountSatang: 0, billDiscountSatang: 0, serviceChargeSatang: 0, grandTotalSatang: 1000 } };
    const y0 = Number((await rowOf(DEV2))?.stateSeq ?? -1);
    const seq = Math.floor(Date.now() / 1000);
    const r1 = await call(dispMod, "publishDisplayState", ctxU("A", DEV1), A("CASH"), { deviceCode: DEV2, seq, state });
    const y1 = Number((await rowOf(DEV2))?.stateSeq ?? -1);
    if (y1 !== y0) p.push(`เครื่อง X ส่งให้จอ Y → เขียนจอ Y (seq ${y0}→${y1} · ${codeOf(r1)})`);
    const r2 = await call(dispMod, "publishDisplayState", ctxU("A"), A("CASH"), { deviceCode: DEV2, seq: seq + 1, state });
    const y2 = Number((await rowOf(DEV2))?.stateSeq ?? -1);
    if (y2 !== y0) p.push(`ไม่มีเครื่องใน ctx → เขียนจอ Y (seq ${y0}→${y2} · ${codeOf(r2)})`);
    const r3 = await call(dispMod, "publishDisplayState", ctxU("A", DEV1), A("CASH"), { deviceCode: DEV1, seq: seq + 2, state });
    const x3 = Number((await rowOf(DEV1))?.stateSeq ?? -1);
    if (r3?.ok !== true || r3?.written !== true || x3 !== seq + 2) p.push(`(ตัวควบคุม) X → จอ X ${short(r3, 60)} seq ${x3}`);
    chk("D1", !fx && p.length === 0, "จอผูกเครื่องของ ctx · X เขียนจอ Y ไม่ได้", why(p));
  });
  // ORACLE-ADD ผู้คุม 16 ต.ค. (P2.14 H4 · D1b) ▸ ผ่าน action จริง — เครื่องมาจากเซิร์ฟเวอร์ (กะ OPEN ของผู้ใช้) ไม่ใช่ args ◂
  await run("D1b", async () => {
    const p: string[] = [];
    const dispActs = await tryImport("@/lib/modules/pos/display-actions");
    const path = `/app/sys/${S.POS}/pos/register`;
    const rowOf = async (dev: string): Promise<Any> => P.posCustomerDisplay.findFirst({ where: { tenantId: T, deviceId: DEVID[dev] ?? "none", status: "ACTIVE" } }).catch(() => null);
    const state = { phase: "cart", lines: [{ qty: 1, name: "น้ำเปล่า", grossSatang: 1000, discountSatang: 0 }], totals: { subtotalSatang: 1000, lineDiscountSatang: 0, billDiscountSatang: 0, serviceChargeSatang: 0, grandTotalSatang: 1000 } };
    if (!(await rowOf(DEV2)) || !(await rowOf(DEV1))) p.push("(fixture) จอ X/Y ไม่ได้จับคู่ (D1)");
    const ckCash = await cookieOf("CASH");
    const y0 = Number((await rowOf(DEV2))?.stateSeq ?? -1);
    const seq = Math.floor(Date.now() / 1000) + 100;
    const base = { systemId: S.POS, unitId: U.A, seq, state };
    const rc = await act(ckCash, path, dispActs, "publishDisplayStateAction", { ...base, deviceId: DEV2, deviceCode: DEV2 });
    const ro = await act(CK.OWNER ?? "", path, dispActs, "publishDisplayStateAction", { ...base, seq: seq + 1, deviceId: DEV2, deviceCode: DEV2 });
    const y1 = Number((await rowOf(DEV2))?.stateSeq ?? -1);
    if (rc?.code !== "DEVICE_NOT_REGISTERED") p.push(`แคชเชียร์ปลอม Y → ${short(rc, 60)} (คาด DEVICE_NOT_REGISTERED)`);
    if (ro?.code !== "DEVICE_NOT_REGISTERED") p.push(`เจ้าของ (กะ X) ปลอม Y → ${short(ro, 60)} (คาด DEVICE_NOT_REGISTERED)`);
    if (y1 !== y0) p.push(`จอ Y เปลี่ยน seq ${y0}→${y1}`);
    const rx = await act(CK.OWNER ?? "", path, dispActs, "publishDisplayStateAction", { ...base, seq: seq + 2, deviceCode: DEV1 });
    const x1 = Number((await rowOf(DEV1))?.stateSeq ?? -1);
    if (rx?.ok !== true || rx?.written !== true || x1 !== seq + 2) p.push(`(ตัวควบคุม) เจ้าของ X → จอ X ${short(rx, 60)} seq ${x1}`);
    chk("D1b", !fx && p.length === 0, "action ใช้เครื่องจากกะของผู้ใช้ · deviceId ปลอมไม่มีผล", why(p));
  });

  // ════════════════ Q QR / สั่งล่วงหน้า ════════════════
  const preorder = async (label: string, phone: string): Promise<{ token: string; order: Any; note: string }> => {
    const r = await call(qrMod, "placePreorder", LINK_A, { lines: [{ productId: PP.padthai, qty: 1 }], customer: { name: `คุณ ${label}`, phone }, idempotencyKey: `qc214${RAND}${label}` }, { ip: freshIp() });
    const token = r?.ok === true ? String(r.orderToken ?? "") : "";
    const order = token ? await P.posOrder.findUnique({ where: { publicToken: token } }).catch(() => null) : null;
    return { token, order, note: token && order ? "" : `placePreorder ${codeOf(r)} ${short(r?.message ?? "", 50)}` };
  };
  const statusOf = async (token: string): Promise<Any> => {
    const r = await call(qrMod, "orderStatus", token);
    return r?.ok === true ? r.view ?? null : null;
  };
  let Q1: { token: string; order: Any; note: string } = { token: "", order: null, note: "ไม่ถูกสร้าง" };
  await run("Q1", async () => {
    const p: string[] = [];
    Q1 = await preorder("q1", "0812345601");
    if (Q1.note) p.push(`(fixture) ${Q1.note}`);
    const pi = String(Q1.order?.paymentIntentId ?? "");
    const mp = pi ? await call(piMod, "markIntentPaid", pi, { via: "MANUAL" }) : null;
    await drain();
    if (pi) await call(orderMod, "onIntentPaid", pi);
    const o1 = await orderRow(Q1.order?.id ?? "");
    if (o1?.paymentState !== "PREPAID" || o1?.status !== "NEW") p.push(`(fixture) หลังเงินเข้า ${o1?.status}/${o1?.paymentState} (คาด NEW/PREPAID · ${codeOf(mp)})`);
    if (pi) {
      await P.$executeRawUnsafe(`UPDATE "PosPaymentIntent" SET "paidAt" = now() - interval '25 hours' WHERE id = $1 AND "tenantId" = $2`, pi, T);
      await P.$executeRawUnsafe(`UPDATE "PosOrder" SET "paidAt" = now() - interval '25 hours' WHERE id = $1 AND "tenantId" = $2`, Q1.order.id, T);
    }
    await call(orderMod, "expirePreorders", T);
    await drain();
    const o2 = await orderRow(Q1.order?.id ?? "");
    if (o2?.status !== "CANCELLED") p.push(`expirePreorders → ${o2?.status}/${o2?.paymentState} (คาด CANCELLED)`);
    const ev = await evsOf(Q1.order?.id ?? "", "expired_paid");
    if (ev.length !== 1) p.push(`PosOrderEvent expired_paid ${ev.length} (คาด 1)`);
    const ops = await opsFor("pos.payment.refund_needed", Q1.order);
    if (ops.length < 1) p.push("ไม่มี ops pos.payment.refund_needed ของออเดอร์นี้");
    const v = await statusOf(Q1.token);
    if (v?.refundPending !== true) p.push(`หน้าสถานะ refundPending ${short(v?.refundPending)} (คาด true)`);
    const ac = await call(orderMod, "acceptOrder", ctxU("A", DEV1), A("OWNER"), { id: Q1.order?.id ?? "none" });
    if (ac?.ok === true || ac?.code === "INTENT_EXPIRED") p.push(`acceptOrder หลังปิด → ${codeOf(ac)} (คาดปฏิเสธที่ไม่ใช่ INTENT_EXPIRED ค้าง)`);
    chk("Q1", !fx && p.length === 0, "PREPAID > 24 ชม. → CANCELLED + expired_paid + ops refund_needed", why(p));
  });
  await run("Q2", async () => {
    const p: string[] = [];
    let id = "";
    await menu.setKitchenPause(T, U.A, true, "qc p2.14 Q2");
    try {
      const r = await ingest("A", undefined, CH.GB_A ?? "none", "q2", [{ productId: PP.bar, qty: 1 }], { externalRef: `GQ2-${RAND}` });
      id = r?.ok === true ? String(r.orderId ?? "") : "";
      if (!id) p.push(`(fixture) ingest ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
    } finally {
      await menu.setKitchenPause(T, U.A, false);
    }
    const held = await evsOf(id, "held");
    if (id && !held.length) p.push("(fixture) ไม่มี held");
    if (id) await P.$executeRawUnsafe(`UPDATE "PosOrder" SET "receivedAt" = $2 WHERE id = $1 AND "tenantId" = $3`, id, new Date(bkkDayStart(today).getTime() - 3 * 3_600_000), T);
    const rel = await call(orderMod, "releaseHeldOrders", T, U.A, { limit: 20 });
    const o = await orderRow(id);
    if (!Array.isArray(rel?.accepted) || !rel.accepted.includes(id) || o?.status !== "ACCEPTED") p.push(`ออเดอร์เมื่อวาน → ${o?.status} · accepted ${short(rel?.accepted, 60)} (คาด ACCEPTED)`);
    chk("Q2", !fx && p.length === 0, "held ข้ามเที่ยงคืนถูกกวาด", why(p));
  });
  let Q4: { token: string; order: Any; note: string } = { token: "", order: null, note: "ไม่ถูกสร้าง" };
  await run("Q4", async () => {
    const p: string[] = [];
    Q4 = await preorder("q4", "0812345604");
    if (Q4.note) p.push(`(fixture) ${Q4.note}`);
    const rj = await call(orderMod, "rejectOrder", ctxU("A"), A("OWNER"), { id: Q4.order?.id ?? "none", reasonCode: "TOO_BUSY" });
    if (rj?.ok !== true) p.push(`(fixture) rejectOrder ${codeOf(rj)} ${short(rj?.message ?? "", 50)}`);
    const pi = String(Q4.order?.paymentIntentId ?? "");
    if (pi) await call(piMod, "markIntentPaid", pi, { via: "WEBHOOK", amountSatang: Number(Q4.order?.totalSatang ?? 0) });
    await drain();
    if (pi) await call(orderMod, "onIntentPaid", pi);
    const ev = await evsOf(Q4.order?.id ?? "", "refund_needed");
    if (ev.length !== 1) p.push(`PosOrderEvent refund_needed ${ev.length} (คาด 1)`);
    const v1 = await statusOf(Q4.token);
    if (v1?.refundPending !== true) p.push(`หน้าสถานะ refundPending ${short(v1?.refundPending)} (คาด true)`);
    if (pi) await P.$executeRawUnsafe(`UPDATE "PosPaymentIntent" SET status = 'EXPIRED' WHERE id = $1 AND "tenantId" = $2`, pi, T);
    const v2 = await statusOf(Q4.token);
    if (v2?.refundPending !== true) p.push(`ใบเปลี่ยนเป็น EXPIRED → refundPending ${short(v2?.refundPending)} (คาด true ถาวร)`);
    chk("Q4", !fx && p.length === 0, "refund_needed ถาวร · หน้าสถานะอ่านได้", why(p));
  });
  await run("Q3", async () => {
    const p: string[] = [];
    await call(orderMod, "expirePreorders", T);
    await drain(2);
    await call(orderMod, "expirePreorders", T);
    await drain(2);
    const id1 = String(Q1.order?.id ?? "none");
    const e1 = await evsOf(id1, "expired_paid");
    const o1 = await opsFor("pos.payment.refund_needed", Q1.order);
    const c1 = await outboxN("pos.order.cancelled", id1);
    if (e1.length !== 1 || o1.length !== 1 || c1 !== 1) p.push(`Q1 เล่นซ้ำ: expired_paid ${e1.length} · ops ${o1.length} · cancelled ${c1} (คาด 1 · 1 · 1)`);
    const pi = String(Q4.order?.paymentIntentId ?? "");
    if (pi) {
      await call(piMod, "markIntentPaid", pi, { via: "WEBHOOK", amountSatang: Number(Q4.order?.totalSatang ?? 0) });
      await drain();
      await call(orderMod, "onIntentPaid", pi);
    }
    const e4 = await evsOf(String(Q4.order?.id ?? "none"), "refund_needed");
    if (e4.length !== 1) p.push(`Q4 เงินเข้าซ้ำ: refund_needed ${e4.length} (คาด 1)`);
    chk("Q3", !fx && !!Q1.order && !!Q4.order && p.length === 0, "เล่นซ้ำ = 1 event", why(p));
  });
  await run("Q5", async () => {
    const p: string[] = [];
    const tok = QR.Q5T ?? "";
    const input = { lines: [{ productId: PP.padthai, qty: 1 }], guestToken: `qc214g${RAND}` };
    const { results, note } = await twinChildren("q5", [{ qrToken: tok, input, ip: freshIp() }, { qrToken: tok, input, ip: freshIp() }]);
    if (note) p.push(`(ฮาร์เนส) ${note}`);
    const okN = results.filter((r) => r?.result?.ok === true).length;
    const sess = ((await P.tableSession.findMany({ where: { tenantId: T, tableId: TB.Q5T ?? "none" }, select: { id: true } }).catch(() => [])) as Any[]).map((s) => s.id);
    const rounds = Number(await P.restaurantOrder.count({ where: { tenantId: T, sessionId: { in: sess } } }).catch(() => -1));
    if (okN < 1) p.push(`(fixture) ไม่มีโปรเซสใดส่งรอบได้ ${short(results.map((r) => codeOf(r?.result)), 60)}`);
    if (rounds !== 1) p.push(`รอบครัว ${rounds} (คาด 1 · ผล ${short(results.map((r) => codeOf(r?.result)), 60)})`);
    chk("Q5", !fx && p.length === 0, "สองเครื่อง = รอบเดียว", why(p));
  });
  await run("Q6", async () => {
    const p: string[] = [];
    await setPay({ beam: { enabled: true } });
    const input = { lines: [{ productId: PP.padthai, qty: 1 }], customer: { name: "คุณคิวหก", phone: "0812345606" }, idempotencyKey: `qc214${RAND}q6` };
    const { results, note } = await twinChildren("q6", [
      { linkToken: LINK_A, input, ip: freshIp(), beamDelayMs: 1500, tag: "a" },
      { linkToken: LINK_A, input, ip: freshIp(), beamDelayMs: 1500, tag: "b" },
    ]);
    await setPay({ beam: { enabled: false } });
    if (note) p.push(`(ฮาร์เนส) ${note}`);
    const charges = results.reduce((t, r) => t + Number(r?.charges ?? 0), 0);
    const orders = ((await P.posOrder.findMany({ where: { tenantId: T, customerName: "คุณคิวหก" }, select: { id: true } }).catch(() => [])) as Any[]).map((o) => o.id);
    const intents = Number(await P.posPaymentIntent.count({ where: { tenantId: T, orderId: { in: orders } } }).catch(() => -1));
    if (!results.some((r) => r?.result?.ok === true)) p.push(`(fixture) ไม่มีโปรเซสใดสั่งได้ ${short(results.map((r) => codeOf(r?.result)), 60)}`);
    if (charges !== 1 || orders.length !== 1 || intents !== 1) p.push(`createCharge ${charges} · ออเดอร์ ${orders.length} · ใบ ${intents} (คาด 1 · 1 · 1)`);
    chk("Q6", !fx && p.length === 0, "สองเครื่อง = ออเดอร์ 1 ใบ 1 charge 1", why(p));
  });

  // ════════════════ O ออเดอร์ ════════════════
  const RELEASE_KEY = (u: string) => `posorder-release:${T}:${U[u]}`;
  await run("O1", async () => {
    const p: string[] = [];
    let id = "";
    await menu.setKitchenPause(T, U.B, true, "qc p2.14 O1");
    try {
      const r = await ingest("B", undefined, CH.GB_B ?? "none", "o1", [{ productId: PP.bar, qty: 1 }], { externalRef: `GO1-${RAND}` });
      id = r?.ok === true ? String(r.orderId ?? "") : "";
      if (!id) p.push(`(fixture) ingest ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
    } finally {
      await menu.setKitchenPause(T, U.B, false);
    }
    if (id && !(await evsOf(id, "held")).length) p.push("(fixture) ไม่มี held");
    const holder = holdLock(RELEASE_KEY("B"), 4000);
    await sleep(400);
    const t0 = Date.now();
    const r1 = await call(orderMod, "releaseHeldOrders", T, U.B, { limit: 20 });
    const el = Date.now() - t0;
    const mid = await orderRow(id);
    await holder;
    if (el >= 2000) p.push(`ทางอ่านรอล็อก ${el} ms (คาด < 2000 · try-lock)`);
    if (r1?.swept !== false) p.push(`ผลคืน swept ${short(r1?.swept)} (คาด false เมื่อล็อกไม่ว่าง)`);
    if (mid?.status !== "NEW" && el < 2000) p.push(`ระหว่างล็อกถูกถือ ออเดอร์ ${mid?.status}`);
    const r2 = await call(orderMod, "releaseHeldOrders", T, U.B, { limit: 20 });
    const o2 = await orderRow(id);
    if (o2?.status !== "ACCEPTED") p.push(`หลังปล่อยล็อก → ${o2?.status} (${short(r2?.accepted, 40)})`);
    const body = fnBody(srcOf(F.order), "releaseHeldOrders");
    if (!/pg_try_advisory_xact_lock/.test(body)) p.push("releaseHeldOrders ไม่ใช้ pg_try_advisory_xact_lock");
    if (!/FOR SHARE/.test(body)) p.push("re-read ช่องทางใน releaseHeldOrders ไม่ FOR SHARE (ORD-6)");
    chk("O1", !fx && p.length === 0, "ล็อกไม่ว่าง = ข้าม (swept:false) ไม่จอดรอ", why(p));
  });
  await run("O2", async () => {
    const p: string[] = [];
    const holder = holdLock(RELEASE_KEY("B"), 3000);
    await sleep(300);
    const t0 = Date.now();
    const r = await ingest("B", undefined, CH.AUTO_B ?? "none", "o2", [{ productId: PP.bar, qty: 1 }]);
    const el = Date.now() - t0;
    const id = r?.ok === true ? String(r.orderId ?? "") : "";
    const atReturn = await orderRow(id);
    const heldNow = (await evsOf(id, "held")).length;
    await holder;
    if (!id) p.push(`(fixture) ingest ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
    else if (el < 2500 && atReturn?.status === "ACCEPTED") p.push(`ingest รับอัตโนมัติระหว่างล็อกถูกถือ (${el} ms · ACCEPTED) — ไม่ได้ถือล็อกของตัวกวาด`);
    else if (el < 2500 && !(atReturn?.status === "NEW" && heldNow > 0)) p.push(`ingest จบเร็ว ${el} ms สถานะ ${atReturn?.status} held ${heldNow} (คาด รอล็อก หรือ NEW + held)`);
    chk("O2", !fx && p.length === 0, "ingest รับอัตโนมัติใต้ล็อกเดียวกับตัวกวาด", why(p));
  });
  await run("O3", async () => {
    const p: string[] = [];
    const sid = String(must("openSession O3T", await rtable.openSession(T, U.A, TB.O3T, { openedByUserId: uid("OWNER") })).id ?? "");
    const draft = await P.posHeldCart.create({ data: { tenantId: T, unitId: U.A, systemId: S.POS, cartJson: { lines: [] }, lineCount: 0, approxTotalSatang: 0, heldByUserId: uid("OWNER"), tableSessionId: sid } });
    await P.$executeRawUnsafe(`UPDATE "TableSession" SET status = 'CLOSED' WHERE id = $1 AND "tenantId" = $2`, sid, T);
    const holder = P.$transaction(
      async (tx: Any) => {
        await tx.$queryRawUnsafe(`SELECT id FROM "TableSession" WHERE id = $1 FOR UPDATE`, sid);
        await tx.$executeRawUnsafe(`UPDATE "TableSession" SET status = 'OPEN' WHERE id = $1`, sid);
        await sleep(2500);
      },
      { timeout: 25_000, maxWait: 10_000 },
    ).catch((e: unknown) => notes.push(`O3 holder: ${(e as Error).message.slice(0, 80)}`));
    await sleep(300);
    const sw = await call(heldMod, "sweepOrphanTableDrafts", P, { tenantId: T, systemId: S.POS, unitId: U.A });
    await holder;
    const d = await P.posHeldCart.findUnique({ where: { id: draft.id } }).catch(() => null);
    const s = await P.tableSession.findUnique({ where: { id: sid } }).catch(() => null);
    if (s?.status !== "OPEN") p.push(`(fixture) session ${s?.status}`);
    if (d?.status !== "HELD") p.push(`ร่าง ${d?.status} (คาด HELD — session เปิดกลับระหว่างกวาด · ผล ${short(sw, 40)})`);
    chk("O3", !fx && p.length === 0, "ล็อก session ก่อนอ่านซ้ำ: ร่างไม่ถูกทิ้ง", why(p));
  });
  await run("O4", async () => {
    const p: string[] = [];
    const m = await paidOrder("o4", "READY");
    if (m.note || !m.saleId) p.push(`(fixture) ${m.note || "ไม่มีบิล"}`);
    const sale = await saleRow(m.saleId);
    const lines = (sale?.lines ?? []) as Any[];
    const rf = await call(refundMod, "refundSale", ctxU("A", DEV1), A("OWNER"), {
      saleId: m.saleId || "none",
      lines: lines.map((l) => ({ lineId: l.id, qty: l.qty, restock: true })),
      payMethods: [{ type: "CASH", amountSatang: Number(sale?.grandTotalSatang ?? 0) }],
      reasonCode: "OTHER",
      reason: "คืนเงินทั้งบิลทดสอบ",
      idempotencyKey: newKey("o4r"),
    });
    await drain();
    const s2 = await saleRow(m.saleId);
    if (rf?.ok !== true || s2?.status !== "REFUNDED") p.push(`(fixture) คืนครบ ${codeOf(rf)} ${short(rf?.message ?? "", 40)} สถานะ ${s2?.status}`);
    const h = await call(orderMod, "handOver", ctxU("A", DEV1), A("OWNER"), { id: m.orderId || "none" });
    const o = await orderRow(m.orderId);
    if (h?.ok === true || o?.status === "HANDED") p.push(`handOver ออเดอร์ที่คืนเงินครบ → ${codeOf(h)} สถานะ ${o?.status}`);
    chk("O4", !fx && p.length === 0, "บิล REFUNDED → ส่งมอบไม่ได้", why(p));
  });
  // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 ORD-1b · CD-B5): สาขาไม่ผูกคลัง (B) = กติกาเดิม (ok) · สาขาผูกคลังอื่น (W ใหม่ · คลังที่สอง) = มองไม่เห็น ⇒ PRODUCT_NOT_FOUND
  let unitW = "";
  await run("O5", async () => {
    const p: string[] = [];
    const input = (k: string) => ({ channelCode: "WEB", idempotencyKey: newKey(k), lines: [{ productId: PP.water, qty: 1 }], customer: { name: `คุณเว็บ ${k}` }, fulfilment: "PICKUP" });
    const viaTx = async (u: string, k: string): Promise<Any> => {
      try {
        return await P.$transaction((tx: Any) => orderMod.ingestInTx(tx, { tenantId: T, unitId: u }, input(k)));
      } catch (e) {
        return { ok: false, code: errCode(e), message: String((e as Error).message).slice(0, 120), threw: true };
      }
    };
    unitW = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาW`, slug: `${T_SLUG}-w` } })).id;
    const inv2 = (await sysSvc.createSystem(T, "INVENTORY", `คลังสอง ${RAND}`)).id;
    await sysSvc.linkUnit(T, S.POS, unitW);
    await sysSvc.linkUnit(T, inv2, unitW);
    const rW = await viaTx(unitW, "o5w");
    if (!(rW?.ok === false && rW?.code === "PRODUCT_NOT_FOUND" && rW?.lineIndex === 0)) p.push(`สาขา W (ผูกคลังอื่น) → ${short(rW, 80)} (คาด PRODUCT_NOT_FOUND lineIndex 0)`);
    const rB = await viaTx(U.B!, "o5b");
    if (rB?.ok !== true || rB?.skipped) p.push(`สาขา B (ไม่ผูกคลัง · กติกาเดิม) → ${short(rB, 80)} (คาด ok)`);
    const rA = await viaTx(U.A!, "o5a");
    if (rA?.ok !== true || rA?.skipped) p.push(`(ตัวควบคุม) สาขา A → ${short(rA, 80)}`);
    chk("O5", !fx && p.length === 0, "ประตูเว็บใช้การมองเห็นตามคลังของสาขาที่ผูกคลัง · ไม่ผูกคลัง = กติกาเดิม", why(p));
  });
  // ORACLE-ADD ผู้คุม 16 ต.ค. (P2.14 ORD-1b · O5b) ▸ เว็บร้านจริง (shop createOrder) — ไม่มีเงินโดยไม่มีออเดอร์ ◂
  await run("O5b", async () => {
    const p: string[] = [];
    if (!shopSvc?.createOrder || !unitW) throw new Error(`(fixture) shop createOrder ${!!shopSvc?.createOrder} · unitW ${!!unitW}`);
    const waterInv = String((await P.posProduct.findFirst({ where: { id: PP.water }, select: { invItemId: true } }))?.invItemId ?? "");
    const sc = (u: string): Any => ({ tenantId: T, unitId: u, actorUserId: uid("OWNER") });
    const spW = await shopSvc.createProduct(sc(unitW), { name: `น้ำ W ${RAND}`, priceSatang: 1000, invItemId: waterInv });
    const spB = await shopSvc.createProduct(sc(U.B!), { name: `น้ำ B ${RAND}`, priceSatang: 1000, invItemId: waterInv });
    const mapped = await P.shopProduct.findMany({ where: { tenantId: T, id: { in: [String(spW?.id), String(spB?.id)] } }, select: { id: true, posProductId: true } });
    if (mapped.some((m: Any) => !m.posProductId)) p.push(`(fixture) ShopProduct ไม่ผูก posProductId ${short(mapped, 80)}`);
    let wErr = "";
    try {
      await shopSvc.createOrder(sc(unitW), { customerName: "คุณ O5b W", customerPhone: "0811111111", lines: [{ productId: String(spW?.id), qty: 1 }] });
    } catch (e) {
      wErr = String((e as Error).message).slice(0, 80);
    }
    if (!wErr) p.push("สาขา W (ผูกคลัง · มองไม่เห็น) createOrder ไม่ throw");
    const soW = await P.shopOrder.count({ where: { tenantId: T, unitId: unitW } });
    const poW = await P.posOrder.count({ where: { tenantId: T, unitId: unitW } });
    const psW = await P.posSale.count({ where: { tenantId: T, unitId: unitW } });
    if (soW !== 0 || poW !== 0 || psW !== 0) p.push(`สาขา W: ShopOrder ${soW} · PosOrder ${poW} · PosSale ${psW} (คาด 0 · 0 · 0)`);
    let bOrder: Any = null;
    try {
      bOrder = await shopSvc.createOrder(sc(U.B!), { customerName: "คุณ O5b B", customerPhone: "0822222222", lines: [{ productId: String(spB?.id), qty: 1 }] });
    } catch (e) {
      p.push(`สาขา B (ไม่ผูกคลัง) createOrder throw ${String((e as Error).message).slice(0, 60)} (คาด สร้างได้ตามเดิม)`);
    }
    if (bOrder?.id) {
      const po = await P.posOrder.count({ where: { tenantId: T, unitId: U.B, shopOrderId: bOrder.id } });
      if (po !== 1) p.push(`สาขา B: PosOrder ของ ShopOrder ${po} (คาด 1)`);
    }
    const shopIds = (await P.shopOrder.findMany({ where: { tenantId: T }, select: { id: true } })).map((x: Any) => x.id);
    const linked = new Set((await P.posOrder.findMany({ where: { tenantId: T, shopOrderId: { in: shopIds } }, select: { shopOrderId: true } })).map((x: Any) => x.shopOrderId));
    const orphan = shopIds.filter((id: string) => !linked.has(id));
    if (orphan.length) p.push(`ShopOrder ที่ไม่มี PosOrder ${orphan.length}`);
    chk("O5b", !fx && p.length === 0, "เว็บร้าน: มองไม่เห็น = ไม่มี ShopOrder · ไม่ผูกคลัง = ออเดอร์ POS ตามเดิม · ไม่มีเงินโดยไม่มีออเดอร์", why(p));
  });
  // ORACLE-ADD ผู้คุม 16 ต.ค. (P2.14 G1/H2 · O5c) ▸ คำปฏิเสธใดก็ตามของประตู POS = เว็บร้านไม่รับออเดอร์ (ไม่ใช่ log แล้วรับ) ◂
  await run("O5c", async () => {
    const p: string[] = [];
    if (!shopSvc?.createOrder) throw new Error("(fixture) shop createOrder");
    const MAX = 100_000_000; // = ORDER_UNIT_PRICE_MAX (order-shared.ts)
    const sc = (u: string): Any => ({ tenantId: T, unitId: u, actorUserId: uid("OWNER") });
    const sp = await shopSvc.createProduct(sc(U.A!), { name: `ของแพงเกิน O5c ${RAND}`, priceSatang: MAX + 1 });
    if (!sp?.id) p.push("(fixture) ShopProduct ราคาเกินไม่ถูกสร้าง");
    const so0 = await P.shopOrder.count({ where: { tenantId: T, unitId: U.A } });
    let err = "";
    try {
      await shopSvc.createOrder(sc(U.A!), { customerName: "คุณ O5c", customerPhone: "0833333333", lines: [{ productId: String(sp?.id ?? "none"), qty: 1 }] });
    } catch (e) {
      err = String((e as Error).message).slice(0, 80);
    }
    const so1 = await P.shopOrder.count({ where: { tenantId: T, unitId: U.A } });
    if (!err) p.push("ราคาเกินเพดาน createOrder ไม่ throw");
    if (so1 !== so0) p.push(`ShopOrder สาขา A ${so0}→${so1} (คาด ไม่เพิ่ม)`);
    const linkedUnits = (await P.appSystemUnit.findMany({ where: { tenantId: T, type: "POS" }, select: { unitId: true } })).map((x: Any) => x.unitId);
    const ecom = await P.posSale.findMany({ where: { tenantId: T, sourceModule: "ECOM", refSaleId: null, unitId: { in: linkedUnits } }, select: { id: true } }); // บิลขาย (ไม่นับใบคืน)
    const withOrder = new Set((await P.posOrder.findMany({ where: { tenantId: T, saleId: { in: ecom.map((x: Any) => x.id) } }, select: { saleId: true } })).map((x: Any) => x.saleId));
    const orphan = ecom.filter((x: Any) => !withOrder.has(x.id));
    if (orphan.length) p.push(`บิล ECOM ที่ไม่มี PosOrder บนสาขาผูก POS ${orphan.length}`);
    chk("O5c", !fx && p.length === 0, "เว็บร้าน: ประตู POS ปฏิเสธ = ไม่มี ShopOrder · ไม่มีบิล ECOM ไร้ออเดอร์", why(p));
  });

  // ════════════════ P ราคา · มัดจำ · ช่องทาง · บัญชี · จอ ════════════════
  await run("P1", async () => {
    const p: string[] = [];
    await patchPos((pos) => void (pos.deposit = { ...(isRecord(pos.deposit) ? pos.deposit : {}), enabled: true }));
    const dep = await call(depMod, "registerTakeDeposit", ctxU("A", DEV1), A("OWNER"), { amountSatang: 50_000, payMethods: [{ type: "CASH", amountSatang: 50_000 }], customerName: "คุณมัดจำ", phone: "0812345670", idempotencyKey: newKey("dep") });
    const D = String(dep?.deposit?.id ?? "");
    if (!D) p.push(`(fixture) registerTakeDeposit ${codeOf(dep)} ${short(dep?.message ?? "", 50)}`);
    const pay = (pm: Any) => call(regFacade, "submitRegisterSale", ctxU("A", DEV1), A("OWNER"), { lines: [{ productId: PP.bar, qty: 1 }], payMethods: [pm], expectedGrandTotalSatang: 5000, idempotencyKey: newKey("dp") });
    const ghost = `qc214nodep${RAND}`;
    const nf = await pay({ type: "DEPOSIT", amountSatang: 5000, depositId: ghost, phoneLast4: "0000" });
    if (nf?.code !== "DEPOSIT_NOT_FOUND" || nf?.depositId !== ghost) p.push(`ไม่พบ → ${codeOf(nf)} depositId ${short(nf?.depositId)}`);
    const no = await pay({ type: "DEPOSIT", amountSatang: 5000, depositId: D || "none", phoneLast4: "9999" });
    if (no?.code !== "DEPOSIT_NOT_OWNER" || no?.depositId !== D) p.push(`เลขท้ายผิด → ${codeOf(no)} depositId ${short(no?.depositId)}`);
    let lk: Any = null;
    for (let i = 0; i < 8 && lk?.code !== "DEPOSIT_LOCKED"; i++) lk = await pay({ type: "DEPOSIT", amountSatang: 5000, depositId: D || "none", phoneLast4: "9999" });
    if (lk?.code !== "DEPOSIT_LOCKED" || lk?.depositId !== D) p.push(`ล็อก → ${codeOf(lk)} depositId ${short(lk?.depositId)}`);
    chk("P1", !fx && p.length === 0, "คำปฏิเสธมัดจำมี depositId", why(p));
  });
  const cpRows = async (productId: string): Promise<Any[]> => (await P.posProductChannelPrice.findMany({ where: { tenantId: T, productId } }).catch(() => [])) as Any[];
  const matrixCell = async (productId: string, u: string, code: string): Promise<Any> => {
    const m = await call(catalog, "unitPriceMatrix", cc(), { productIds: [productId], unitIds: [U.A, U.B], channelCodes: ["STORE", "LINEMAN"] });
    return (Array.isArray(m?.cells) ? m.cells : []).find((c: Any) => c.unitId === U[u] && c.channelCode === code) ?? { missing: codeOf(m) };
  };
  await run("P2", async () => {
    const p: string[] = [];
    const sx = await call(catalog, "setChannelPrices", cc(), { productId: PP.mx, rows: [{ channelCode: "LINEMAN", unitId: null, priceSatang: null, notSold: true }] });
    const sy = await call(catalog, "setChannelPrices", cc(), { productId: PP.my, rows: [{ channelCode: null, unitId: U.A, priceSatang: null, notSold: true }] });
    if (sx?.ok === false || sy?.ok === false) p.push(`(fixture) notSold ${codeOf(sx)}/${codeOf(sy)}`);
    const bx = await call(catalog, "bulkChannelMarkup", cc(), { channelCode: "LINEMAN", unitId: U.A, markupBp: 1000, roundTo: 1, productIds: [PP.mx] });
    if ((await cpRows(PP.mx!)).some((r) => r.channelCode === "LINEMAN" && r.unitId === U.A)) p.push(`X: เขียนแถว (LINEMAN, A) ทับ notSold ของทุกสาขา (${short(bx, 50)})`);
    const cx = await matrixCell(PP.mx!, "A", "LINEMAN");
    if (cx?.refusal !== "CHANNEL_NOT_SOLD") p.push(`X ที่ A/LINEMAN → ${short(cx, 60)} (คาด CHANNEL_NOT_SOLD)`);
    const by = await call(catalog, "bulkChannelMarkup", cc(), { channelCode: "LINEMAN", unitId: null, markupBp: 1000, roundTo: 1, productIds: [PP.my] });
    // ORACLE-EDIT ผู้คุม 16 ต.ค. (HF-FU2 PRC-1) ▸ มติ 4 HF-FU2: แถว (LINEMAN, ทุกสาขา) ได้ — ต้องมาคู่กับ (LINEMAN, A, ไม่ขาย) ที่พาลง · B ได้ราคาบวก (10000 +10% = 11000) ◂
    const ry = await cpRows(PP.my!);
    if (ry.some((r) => r.channelCode === "LINEMAN" && r.unitId === null) && !ry.some((r) => r.channelCode === "LINEMAN" && r.unitId === U.A && r.notSold === true)) p.push(`Y: เขียนแถว (LINEMAN, ทุกสาขา) โดยไม่พา notSold ของ A ลง (${short(by, 50)})`);
    const cyB = await matrixCell(PP.my!, "B", "LINEMAN");
    if (cyB?.unitPriceSatang !== 11_000) p.push(`Y ที่ B/LINEMAN → ${short(cyB, 60)} (คาด 11000)`);
    const cy = await matrixCell(PP.my!, "A", "LINEMAN");
    if (cy?.refusal !== "CHANNEL_NOT_SOLD") p.push(`Y ที่ A/LINEMAN → ${short(cy, 60)} (คาด CHANNEL_NOT_SOLD)`);
    chk("P2", !fx && p.length === 0, "ปรับทั้งช่องทางไม่ทำให้สินค้าที่ไม่ขายกลับมาขาย", why(p));
  });
  await run("P3", async () => {
    const p: string[] = [];
    const nm = `ชื่อใหม่ ${RAND}`;
    const r1 = await call(chMod, "saveChannel", ctxU("A"), A("OWNER"), { id: CH.P3_A, name: nm });
    if (r1?.ok !== true) p.push(`(fixture) เปลี่ยนชื่อ ${codeOf(r1)}`);
    const r2 = await call(chMod, "saveChannel", ctxU("A"), A("OWNER"), { id: CH.P3_A, commissionBp: 1500 });
    const row = await P.salesChannel.findUnique({ where: { id: CH.P3_A ?? "none" } }).catch(() => null);
    if (r2?.ok !== true || row?.name !== nm || row?.commissionBp !== 1500) p.push(`แก้โดยไม่ส่ง name → ${codeOf(r2)} ${short(r2?.message ?? "", 40)} · ชื่อ ${short(row?.name, 30)} · bp ${row?.commissionBp}`);
    const au = (await P.auditLog.findFirst({ where: { tenantId: T, action: "pos.channel.updated", targetId: CH.P3_A ?? "none" }, orderBy: { createdAt: "desc" } }).catch(() => null)) as Any;
    const xr = (await P.$queryRawUnsafe(`SELECT xmin::text AS x FROM "SalesChannel" WHERE id = $1`, CH.P3_A ?? "none")) as Any[];
    const xa = au ? ((await P.$queryRawUnsafe(`SELECT xmin::text AS x FROM "AuditLog" WHERE id = $1`, au.id)) as Any[]) : [];
    if (!au || !xr[0] || xr[0].x !== xa[0]?.x) p.push(`audit กับการเขียนคนละธุรกรรม (xmin ${xr[0]?.x} vs ${xa[0]?.x ?? "ไม่มี audit"})`);
    chk("P3", !fx && p.length === 0, "name ไม่บังคับตอนแก้ · audit ในธุรกรรมเดียว", why(p));
  });
  await run("P4", async () => {
    const p: string[] = [];
    const s = await call(catalog, "setChannelPrices", cc(), { productId: PP.mz, rows: [{ channelCode: "LINEMAN", unitId: null, priceSatang: 12_000 }, { channelCode: "LINEMAN", unitId: U.A, priceSatang: 11_000 }] });
    if (s?.ok === false) p.push(`(fixture) ราคาช่องทาง ${codeOf(s)}`);
    const a = await matrixCell(PP.mz!, "A", "LINEMAN");
    const b = await matrixCell(PP.mz!, "B", "LINEMAN");
    const base = await matrixCell(PP.mz!, "A", "STORE");
    const view = (c: Any) => short({ price: c?.unitPriceSatang, source: c?.source, origin: c?.origin, refusal: c?.refusal, missing: c?.missing }, 90);
    if (a?.origin !== "own" || a?.unitPriceSatang !== 11_000) p.push(`A/LINEMAN ${view(a)} (คาด own 11000)`);
    if (b?.origin !== "inherited" || b?.unitPriceSatang !== 12_000) p.push(`B/LINEMAN ${view(b)} (คาด inherited 12000)`);
    if (base?.origin !== null || base?.source !== "BASE") p.push(`A/STORE ${view(base)} (คาด origin null · source BASE)`);
    chk("P4", !fx && p.length === 0, "origin own/inherited/null · source เดิม", why(p));
  });
  await run("P5", async () => {
    const p: string[] = [];
    const c = srcOf(F.bridge);
    const at = c.indexOf("else if (buyer)");
    const end = c.indexOf("postSaleCommission(", at);
    const blk = at < 0 ? "" : c.slice(at, end < 0 ? at + 2000 : end);
    if (!blk) p.push("หา WARN ของคำขอใบกำกับใน account-bridge.ts ไม่เจอ");
    if ((blk.match(/other-book/g) ?? []).length < 1) p.push("WARN ใบกำกับ (logOps) ไม่ยกเว้น other-book");
    const cw = blk.slice(blk.indexOf("console.warn") - 200);
    if (blk.includes("console.warn") && !/other-book/.test(cw)) p.push("console.warn บรรทัดถูกปฏิเสธ ไม่ยกเว้น other-book");
    chk("P5", p.length === 0, "other-book ไม่ขึ้นข้อความผิด", P8(p) || "ครบ");
  });
  await run("P6", async () => {
    const p: string[] = [];
    const sch = dispShared?.displayStateSchema;
    const st0 = (member: Any) => ({ phase: "cart", lines: [{ qty: 1, name: "น้ำเปล่า", grossSatang: 1000, discountSatang: 0 }], totals: { subtotalSatang: 1000, lineDiscountSatang: 0, billDiscountSatang: 0, serviceChargeSatang: 0, grandTotalSatang: 1000, member } });
    if (typeof sch?.safeParse !== "function") p.push(`${MISSING} displayStateSchema`);
    else {
      if (sch.safeParse(st0([{ label: "ส่วนลดสมาชิก", satang: 100 }])).success) p.push("totals.member ไม่มี kind ยังผ่าน (คาดปฏิเสธ)");
      if (!sch.safeParse(st0([{ kind: "TIER", label: "ส่วนลดสมาชิก", satang: 100 }])).success) p.push("(ตัวควบคุม) totals.member มี kind ถูกปฏิเสธ");
    }
    const actsSrc = srcOf(F.dActions);
    if (!/export\s+async\s+function\s+clearDisplayCookieAction\b/.test(actsSrc) || !/maxAge\s*:\s*0|\.delete\s*\(/.test(fnBody(actsSrc, "clearDisplayCookieAction"))) p.push("(store)/d/actions.ts ไม่มี clearDisplayCookieAction ที่ล้างคุกกี้");
    const pg = srcOf(F.dPage);
    if (!/\bstaleCookie\b/.test(pg) || !/clearDisplayCookieAction/.test(pg)) p.push("/d page ไม่ส่ง staleCookie + clearDisplayCookieAction เมื่อ DISPLAY_NOT_PAIRED");
    chk("P6", p.length === 0, "kind บังคับ · ล้างคุกกี้ค้าง", P8(p) || "ครบ");
  });

  // ════════════════ R รายงาน ════════════════
  await run("R1", async () => {
    const p: string[] = [];
    for (let i = 0; i < 3; i++) {
      const sp = await P.posTableSplit.create({ data: { tenantId: T, systemId: S.POS, unitId: U.B, sessionId: `qc214ses${RAND}${i}`, mode: "EQUAL", partCount: 2, itemsHash: `qc214-${i}`, serviceChargeBp: 0, baseSatang: 1000, discountSatang: 500, serviceChargeSatang: 0, totalSatang: 500, createdByUserId: uid("CASH") } });
      await P.auditLog.create({ data: { tenantId: T, unitId: U.B, actorType: "USER", actorId: uid("MGR"), action: "pos.discount.override", targetType: "PosTableSplit", targetId: sp.id, after: { splitId: sp.id, byUserId: uid("MGR"), forUserId: uid("CASH"), discountSatang: 500, via: "pin" } } });
    }
    const an = await call(reportsMod, "reportAnomalies", rctx(), A("OWNER"), { from: today, to: today });
    const rows = an?.ok === true && Array.isArray(an.report?.rows) ? (an.report.rows as Any[]) : [];
    if (an?.ok !== true) p.push(`reportAnomalies → ${codeOf(an)}`);
    const a5 = rows.filter((r) => r.rule === "A5" && r.userId === uid("MGR") && r.unitId === U.B);
    if (a5.length !== 1 || a5[0]?.count !== 3) p.push(`A5 ของผู้จัดการที่ B ${short(a5.map((r) => [r.count, r.value]), 60)} (คาด 1 แถว count 3)`);
    chk("R1", !fx && p.length === 0, "A5 นับ override บนแผนแยกบิล", why(p));
  });
  const directSale = async (u: string, input: Any): Promise<string> => {
    const r = await call(posSvc, "createSale", { tenantId: T, unitId: U[u], systemId: S.POS, sourceModule: "POS", idempotencyKey: newKey("ds"), ...input });
    return String(r?.saleId ?? "");
  };
  await run("R2", async () => {
    const p: string[] = [];
    const sK = await directSale("B", { lines: [{ name: `ชุด K ${RAND}`, qty: 1, unitPriceSatang: 10_000 }], billDiscountSatang: 3000, payMethods: [{ type: "CASH", amountSatang: 7000 }], soldByUserId: uid("K2") });
    const sC = await directSale("B", { lines: [{ name: `ชุด C ${RAND}`, qty: 1, unitPriceSatang: 10_000 }], billDiscountSatang: 3000, payMethods: [{ type: "CASH", amountSatang: 7000 }], soldByUserId: uid("C2") });
    if (!sK || !sC) p.push(`(fixture) บิล K ${!!sK} C ${!!sC}`);
    if (sC) await P.$executeRawUnsafe(`UPDATE "PosSale" SET "memberBenefits" = $2::jsonb WHERE id = $1 AND "tenantId" = $3`, sC, JSON.stringify({ lines: [{ kind: "TIER", ref: `qc214-${RAND}`, label: "Gold", discountSatang: 3000 }], pointsBurned: 0 }), T);
    const r = await call(reportsMod, "reportStaff", rctx("B"), A("OWNER"), { from: today, to: today });
    const rows = r?.ok === true && Array.isArray(r.report?.rows) ? (r.report.rows as Any[]) : [];
    const rk = rows.find((x) => x.userId === uid("K2"));
    const rc = rows.find((x) => x.userId === uid("C2"));
    if (!rk || rk.staffDiscountSatang !== 3000 || rk.a3Flag !== true) p.push(`K ${short(rk && { d: rk.discountSatang, s: rk.staffDiscountSatang, f: rk.a3Flag }, 80)} (คาด staff 3000 · a3Flag true)`);
    if (!rc || rc.discountSatang !== 3000 || rc.staffDiscountSatang !== 0 || rc.a3Flag !== false) p.push(`C ${short(rc && { d: rc.discountSatang, s: rc.staffDiscountSatang, f: rc.a3Flag }, 80)} (คาด discount 3000 · staff 0 · false)`);
    chk("R2", !fx && p.length === 0, "แถวพนักงานมีฐาน A3 + ธง", why(p));
  });
  await run("R4", async () => {
    const p: string[] = [];
    const lmA = await directSale("A", { lines: [{ name: `LM A ${RAND}`, qty: 1, unitPriceSatang: 8000 }], payMethods: [{ type: "PLATFORM", amountSatang: 8000 }], channelId: CH.LM_A });
    const lmB = await directSale("B", { lines: [{ name: `LM B ${RAND}`, qty: 1, unitPriceSatang: 8000 }], payMethods: [{ type: "PLATFORM", amountSatang: 8000 }], channelId: CH.LM_B });
    const store = await directSale("A", { lines: [{ name: `หน้าร้าน ${RAND}`, qty: 1, unitPriceSatang: 8000 }], payMethods: [{ type: "CASH", amountSatang: 8000 }] });
    if (!lmA || !lmB || !store) p.push(`(fixture) บิล ${!!lmA}/${!!lmB}/${!!store}`);
    const r = await call(billsMod, "billsPageData", ctxU("A"), A("OWNER"), { unitId: "*", date: today, pageSize: 50, channelCode: "LINEMAN" });
    const ids = new Set(((r?.items ?? []) as Any[]).map((x) => String(x.id)));
    if (r?.ok !== true) p.push(`billsPageData → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
    else {
      if (!ids.has(lmA) || !ids.has(lmB)) p.push(`ไม่ครบ LINEMAN A ${ids.has(lmA)} B ${ids.has(lmB)}`);
      if (ids.has(store) || ids.size !== 2) p.push(`มีบิลที่ไม่ใช่ LINEMAN (${ids.size} ใบ · หน้าร้าน ${ids.has(store)})`);
    }
    chk("R4", !fx && p.length === 0, "กรองรหัสช่องทางข้ามสาขา", why(p));
  });
  await run("R5", async () => {
    const p: string[] = [];
    const s = await regSale("A", DEV1, [{ productId: PP.water, qty: 2 }], 2000);
    const id = String(s?.saleId ?? "");
    if (!id) p.push(`(fixture) ขาย ${codeOf(s)} ${short(s?.message ?? "", 40)}`);
    await drain(3);
    const d = await call(billsMod, "billDetail", ctxU("A"), A("OWNER"), { saleId: id || "none", unitId: U.A });
    const ln = (d?.bill?.lines ?? [])[0];
    if (!ln || ln.costSatang !== 800 || ln.marginSatang !== Number(ln.lineTotalSatang) - 800) p.push(`บรรทัดลิ้นชัก cost ${short(ln?.costSatang)} margin ${short(ln?.marginSatang)} (คาด 800 · ${Number(ln?.lineTotalSatang) - 800})`);
    const stockActs = await tryImport("@/lib/modules/pos/stock-count-actions");
    const h = await act(CK.OWNER ?? "", `/app/sys/${S.POS}/pos/stock`, stockActs, "posStockHistoryAction", { systemId: S.POS, unitId: U.A, limit: 20 });
    const rno = String((await saleRow(id))?.receiptNo ?? "@@");
    const mv = ((h?.movements ?? []) as Any[]).find((m) => m?.sale?.receiptNo === rno);
    if (h?.ok !== true) p.push(`posStockHistoryAction → ${codeOf(h)} ${short(h?.message ?? "", 40)}`);
    else if (!mv || !String(mv.sale.lineName ?? "").includes(RAND) || Math.abs(Number(mv.sale.qty)) !== 2) p.push(`ประวัติสต็อกไม่มี sale {receiptNo ${rno} · lineName · qty 2} (${short(mv?.sale, 60)})`);
    chk("R5", !fx && p.length === 0, "ต้นทุน/กำไรต่อบรรทัด · ประวัติสต็อกบอกบิล", why(p));
  });
  // ORACLE-ADD ผู้คุม 16 ต.ค. (P2.14 H2 · R5b) ▸ ต้นทุน/กำไรเห็นได้เฉพาะผู้ดูรายงาน — ลิ้นชักบิลและ REST ทางเดียวกัน ◂
  await run("R5b", async () => {
    const p: string[] = [];
    const s = await regSale("A", DEV1, [{ productId: PP.water, qty: 1 }], 1000);
    const id = String(s?.saleId ?? "");
    if (!id) p.push(`(fixture) ขาย ${codeOf(s)} ${short(s?.message ?? "", 40)}`);
    await drain(3);
    const lnOf = (d: Any): Any => ((d?.bill?.lines ?? []) as Any[])[0];
    const own = lnOf(await call(billsMod, "billDetail", ctxU("A"), A("OWNER"), { saleId: id || "none", unitId: U.A }));
    if (!own || own.costSatang !== 400) p.push(`เจ้าของ billDetail cost ${short(own?.costSatang)} (คาด 400)`);
    const cash = lnOf(await call(billsMod, "billDetail", ctxU("A"), A("CASH"), { saleId: id || "none", unitId: U.A }));
    if (!cash) p.push("แคชเชียร์ billDetail ไม่มีบรรทัด");
    else if (cash.costSatang !== null || cash.marginSatang !== null) p.push(`แคชเชียร์ billDetail cost ${short(cash.costSatang)} margin ${short(cash.marginSatang)} (คาด null)`);
    const kSale = await mkKey("sale-read-only", ["pos.sale.read"]);
    const gNo = await api("GET", `/sales/${id || "none"}?unitId=${U.A}`, kSale?.raw ?? "shark_none_sale");
    const lNo = ((gNo.body?.data?.lines ?? []) as Any[])[0];
    if (gNo.status !== 200 || !lNo) p.push(`คีย์ pos.sale.read GET → ${gNo.status} ${short(gNo.body, 60)}`);
    else if ("costSatang" in lNo || "marginSatang" in lNo) p.push(`คีย์ pos.sale.read ได้ cost ${short(lNo.costSatang)} margin ${short(lNo.marginSatang)} (คาด ไม่มีฟิลด์)`);
    const gYes = await api("GET", `/sales/${id || "none"}?unitId=${U.A}`, raw("read"));
    const lYes = ((gYes.body?.data?.lines ?? []) as Any[])[0];
    if (gYes.status !== 200 || lYes?.costSatang !== 400) p.push(`(ตัวควบคุม) คีย์ pos-read GET cost ${short(lYes?.costSatang)} (คาด 400)`);
    chk("R5b", !fx && p.length === 0, "ต้นทุน/กำไร = ผู้ดูรายงานเท่านั้น (ลิ้นชัก · REST)", why(p));
  });
  await run("R3", async () => {
    const p: string[] = [];
    const id = await directSale("B", { lines: [{ name: `ดึก ${RAND}`, qty: 1, unitPriceSatang: 4000 }], payMethods: [{ type: "CASH", amountSatang: 4000 }] });
    const y1 = minus(today, 1);
    const y2 = minus(today, 2);
    const at = new Date(Date.parse(`${y1}T02:00:00+07:00`));
    if (id) await P.$executeRawUnsafe(`UPDATE "PosSale" SET "createdAt" = $2, "paidAt" = $2 WHERE id = $1 AND "tenantId" = $3`, id, at, T);
    const page = async (date: string): Promise<Set<string>> => {
      const r = await call(billsMod, "billsPageData", ctxU("B"), A("OWNER"), { unitId: U.B, date, pageSize: 50 });
      if (r?.ok !== true) p.push(`billsPageData ${date} → ${codeOf(r)}`);
      return new Set(((r?.items ?? []) as Any[]).map((x) => String(x.id)));
    };
    const c0 = await page(y1);
    if (!c0.has(id)) p.push(`(ตัวควบคุม ตัดวันเที่ยงคืน) ${y1} ไม่มีบิล 02:00`);
    await patchPos((pos) => void (pos.reports = { ...(isRecord(pos.reports) ? pos.reports : {}), dayCutoffMinutes: 240 }));
    try {
      const d1 = await page(y1);
      const d2 = await page(y2);
      if (d1.has(id)) p.push(`ตัดวัน 04:00: บิล 02:00 ของ ${y1} ยังอยู่วัน ${y1} (คาดวัน ${y2})`);
      if (!d2.has(id)) p.push(`ตัดวัน 04:00: วัน ${y2} ไม่มีบิล 02:00 ของ ${y1}`);
    } finally {
      await patchPos((pos) => void (pos.reports = { ...(isRecord(pos.reports) ? pos.reports : {}), dayCutoffMinutes: 0 }));
    }
    chk("R3", !fx && p.length === 0, "บิลวันนี้ = วันธุรกิจ (ตัดวัน)", why(p));
  });

  // ════════════════ U จอ ════════════════
  await run("U1", async () => {
    const p: string[] = [];
    const retail = await regSale("A", DEV1, [{ productId: PP.water, qty: 1 }], 1000);
    const food = await regSale("A", DEV1, [{ productId: PP.padthai, qty: 1 }], 9000);
    if (!retail?.saleId || !food?.saleId) p.push(`(fixture) ขาย ${codeOf(retail)}/${codeOf(food)} ${short(food?.message ?? "", 40)}`);
    const fn = kdsMod?.saleNeedsKitchen;
    if (typeof fn !== "function") p.push(`${MISSING} kds.saleNeedsKitchen`);
    else {
      const a = await fn(T, U.A, String(retail?.saleId ?? "none")).catch((e: unknown) => `THROW ${(e as Error).message.slice(0, 40)}`);
      const b = await fn(T, U.A, String(food?.saleId ?? "none")).catch((e: unknown) => `THROW ${(e as Error).message.slice(0, 40)}`);
      if (a !== false) p.push(`บิลปลีก → ${short(a)} (คาด false)`);
      if (b !== true) p.push(`บิลเมนูมีสถานี → ${short(b)} (คาด true)`);
    }
    const qa = fnBody(srcOf(F.kdsActions), "kdsQueueNoAction");
    if (!/saleNeedsKitchen/.test(qa) || !/\bkitchen\b/.test(qa)) p.push("kdsQueueNoAction ไม่คืน kitchen จาก saleNeedsKitchen");
    const pd = srcOf(F.payDone);
    const line = pd.split("\n").find((l) => l.includes("kitchenNoTicket")) ?? "";
    if (!/\bkitchen\b/.test(line.replace(/kitchenNoTicket|kitchenSlipSettings/g, ""))) p.push("PayDone แสดง kitchenNoTicket โดยไม่ดูธง kitchen");
    chk("U1", !fx && p.length === 0, "ไม่มีรายการครัว = ไม่เตือนใบครัว", why(p));
  });

  if (notes.length) console.log(`  ℹ️  หมายเหตุ ${notes.length}: ${notes.slice(0, 8).join(" | ")}`);
}

// ═════════════════════════ 6. คืนสภาพ ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; err: string };
async function wipeTenant(tid: string, slug: string): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, err: "" };
  if (!tid) return rep;
  try {
    const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, tid)) as Any[];
    if (t.length && t[0].slug !== slug) {
      rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
      return rep;
    }
  } catch (e) {
    rep.err = `อ่าน Tenant ไม่ได้: ${(e as Error).message.slice(0, 60)}`;
    return rep;
  }
  const tables = ((await P.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as Any[]).map((r: Any) => String(r.t));
  rep.tables = tables.length;
  await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  await P.$executeRawUnsafe(`UPDATE "Customer" SET "mergedIntoId" = NULL, "referredById" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  let pending = [...tables];
  for (let pass = 0; pass < 12 && pending.length; pass++) {
    const next: string[] = [];
    for (const tb of pending) {
      try {
        await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, tid);
      } catch {
        next.push(tb);
      }
    }
    pending = next;
  }
  try {
    await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, tid, slug);
  } catch (e) {
    rep.err = `ลบ Tenant ไม่ได้: ${(e as Error).message.slice(0, 80)}`;
  }
  for (const tb of tables) {
    try {
      const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, tid)) as Any[])[0]?.n ?? 0);
      if (n) rep.left[tb] = n;
    } catch {
      rep.left[tb] = -1;
    }
  }
  rep.tenantLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, tid)) as Any[])[0]?.n ?? 0);
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
let wipe: WipeReport = { tables: 0, left: {}, tenantLeft: 0, err: "" };
let usersLeft = -1;
let bucketsLeft = -1;
try {
  await runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    await drain();
    await sleep(300);
    wipe = await wipeTenant(T, T_SLUG);
    const residue = Object.values(wipe.left).reduce((a, b) => a + Math.abs(b), 0) + wipe.tenantLeft;
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
    for (const id of userIds) {
      await P.session.deleteMany({ where: { userId: id } }).catch(() => {});
      await P.appNotification?.deleteMany?.({ where: { recipientUserId: id } })?.catch?.(() => {});
      await P.membership.deleteMany({ where: { userId: id } }).catch(() => {});
    }
    await P.$executeRawUnsafe(`DELETE FROM "User" WHERE email LIKE $1`, `${EMAIL_PREFIX}%@qc.invalid`).catch(() => {});
    usersLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, `${EMAIL_PREFIX}%@qc.invalid`)) as Any[])[0]?.n ?? -1);
    let nb = 0;
    for (const kid of keyIds) nb += Number(await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%:api:%:${kid}`).catch(() => 0));
    nb += Number(await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%qc-p214-${RAND}%`).catch(() => 0));
    bucketsLeft = 0;
    for (const kid of keyIds) bucketsLeft += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, `%:api:%:${kid}`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
    bucketsLeft += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, `%qc-p214-${RAND}%`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
    console.log(`  ลบผู้ใช้ของรอบ · เหลือ ${usersLeft} · ถังเพดานอัตรา ลบ ${nb} เหลือ ${bucketsLeft}`);
  } catch (e) {
    wipe.err = `cleanup: ${(e as Error).message.slice(0, 200)}`;
    console.log(`💥 cleanup ${(e as Error).message.slice(0, 200)}`);
  } finally {
    removeFetchGuard();
  }
}
await sleep(200);
const tempLeft = Object.entries(wipe.left).map(([k, v]) => `${k}:${v}`);
chk("Z1", tempLeft.length === 0 && wipe.tenantLeft === 0 && !wipe.err && usersLeft === 0 && bucketsLeft === 0, "ร้านชั่วคราว 0 แถว · Tenant ลบ · ผู้ใช้ 0 · ถังเพดาน 0", [tempLeft.length ? `เหลือ ${tempLeft.join(", ")}` : `0 แถว (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "Tenant ยังอยู่" : "", wipe.err, `ผู้ใช้ ${usersLeft}`, `ถังเพดาน ${bucketsLeft}`].filter(Boolean).join(" · "));
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
const fpErr = Object.values(fpBefore).some((v) => v.startsWith("err"));
chk("Z2", fpDrift.length === 0 && !fpErr, "ลายนิ้วมือเท่าเดิม", fpDrift.length ? `ต่าง ${fpDrift.join(", ")}` : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
const skipped = [...results.entries()].filter(([, r]) => r.skip).map(([id, r]) => `${id}: ${r.skip}`);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${skipped.length ? ` (SKIP ${skipped.length})` : ""}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skippedChecks: skipped, skipped: false, forced: FORCE, missing: skipReasons, hasP27U: HAS_P27U, crashed: !!crashed, guardHits: guardHits.length, residue: tempLeft.length + wipe.tenantLeft })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P2.14 (§1 e): ฟีเจอร์ใหม่ทุกอย่าง (นัดรับ/ส่ง · voucher เป็นวิธีจ่าย · บัตร/เครดิต/มัดจำผ่าน API · Beam refund · adapter แพลตฟอร์ม …) ·
//   ภาพ parity จริง (CONTROLLER-RUN บน QC5 ทรี d ตาม scripts/pos-visual-sweep.json) · qc:all ทั้งรีโป (CONTROLLER-RUN บน Neon branch ส่วนตัว · O27) ·
//   ORACLE-EDIT/ADD ของชุดอื่น (รายการ file:line ในโน้ต oracle — ผู้สร้างทำเป็น commit test(...) ของตัวเองตอนถึงขั้นที่ต้องใช้)
