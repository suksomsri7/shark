// QC — POS RUN ใบ P3.4 S: ออฟไลน์ (C-13 v2) — snapshot ราคา/สินค้าต่อเครื่อง · /sync/sales (route ของ session + REST op sync.sales) · คิวผู้จัดการ
//   เขียนก่อนสร้าง (fail-before) · ฐานข้อสอบ session/pos 72669941 (ทิปผู้คุม · ทิปโค้ด c5fc223b · F0 = CD-FU2a e2957aca)
// requires: (ไม่ต้อง seed — ร้านชั่วคราว posqc-p34-<rand> + ร้านอื่น posqc-p34-<rand>-t2 ของข้อสอบเอง · Z2 อ่านลายนิ้วมือนอกร้านชั่วคราว)
//
// สัญญา: ledger/pos-briefs/pos-brief-P3.4.md ⚠️1–8 · §0 · §1 · §2 R1–R13 · §3 · §10 มติ 1–15 (ผูกมัด · §10 ชนะ §1–§6) ·
//   ตารางชื่อเต็ม + drift + ORACLE-EDIT (file:line) + CONTROLLER-DECISION + รายการ SKIP ของใบ U = ledger/wo-notes/pos-P3.4-oracle.md
//
// ชื่อที่ข้อสอบนี้ตั้ง (ผู้สร้างต้องทำให้มีจริง) — ย่อ (ฉบับเต็มในโน้ต):
//   SHARED src/lib/modules/pos/offline-shared.ts (บริสุทธิ์ · ใช้ร่วม client · ห้าม import อะไรที่ถึง prisma/server-only/next/node: · ไม่มี Date.now()/Math.random()):
//     OFFLINE_TENDERS = ["CASH","TRANSFER"] · OFFLINE_SYNC_BATCH_MAX 50 · OFFLINE_MAX_AGE_MS 86_400_000 · OFFLINE_MAX_BILLS 300 · OFFLINE_PRICE_GRACE_MS 900_000 ·
//     OFFLINE_CLOCK_SKEW_MS 120_000 · OFFLINE_SHIFT_SLACK_MS 300_000 ·
//     OFFLINE_REFUSAL_CODES = PRICE_MISMATCH CLOCK_INVALID SHIFT_CLOSED SELLER_MISMATCH OFFLINE_REF_TAKEN STOCK_INSUFFICIENT ·
//     posOfflineEnabled(settings) (AppSystem(POS).settings.pos.offline.enabled === true เท่านั้น) · offlineRef(code, seq) → "OFF-C1-0007" | null ·
//     parseOfflineRef(ref) → {code, seq} | null · nextOfflineSeq(local, server) = max(local, server, 0) + 1 ·
//     offlineSaleRefusal(sale) → null | {code:"VALIDATION", field} · offlineCartTotals(snapshot, cart: RegisterQuoteInput) → PriceCartResult (= priceCart) ·
//     offlineBatches(items, size?) → items[][] เรียง (soldAt, seq) ≤ 50 · classifyOfflineResult(r | null) → "remove" | "park" | "keep" ·
//     offlineSellGate({enabled, deviceActive, snapshotIssuedAt, priceValidUntil, queueLength, now}) → {ok:true} | {ok:false, reason} ·
//     offlineSlipPayload(OfflineSlipInput) → ReceiptPayload (kind RECEIPT · หัว "ใบรับเงินชั่วคราว — รอออกเลขจริง" · ไม่มี QR /r/) ·
//     offlineRefusalMessageKey(code) → คีย์ใต้ pos.register (th/en มีครบ)
//   FACADE src/lib/modules/pos/offline-sync.ts (ไม่ใช่ "use client"/"use server"):
//     issueOfflineSnapshot(ctx{tenantId,systemId,unitId,deviceId}, actor, opts?{now?}, client?) → {ok:true, snapshot:{hash, issuedAt, priceValidUntil,
//       offlineCode, offlineSeq, vat:{mode,rateBp}, serviceChargeBp, products: RegisterProduct-whitelist & {choices:[{choiceId,groupId,name,priceDeltaSatang}]}}}
//     syncOfflineSales(ctx, actor, {deviceId, items[≤50]}, opts?{now?}, client?) → {ok:true, results:[{offlineRef, status OK|DUPLICATE|REJECTED, offlineSaleId?,
//       saleId?, receiptNo?, reason?, drift?}]} | {ok:false, code} — item = {offlineRef, idempotencyKey, soldAt ISO, shiftId?, staffToken?, sellerUserId?, snapshotHash,
//       sale: RegisterSubmitInput ไม่มี idempotencyKey/staffToken} · คำอ้างราคา = sale.expectedGrandTotalSatang
//     listOfflineRejected(ctx, actor, input?{limit?}) → {ok:true, items:[{id, offlineRef, deviceId, soldAt, reason, status, ...}]}
//     acceptOfflineSale(ctx, actor, {id}) → {ok:true, saleId, receiptNo, duplicated?} · discardOfflineSale(ctx, actor, {id, reason ≥ 5}) → {ok:true, duplicated?}
//   ROUTE  src/app/api/pos/sync/route.ts (POST · session · pos.sale.create ของผู้ใช้ session · เครื่องของสาขาใน session) — ไม่มี session route ของ POS มาก่อนที่ 72669941
//   REST   op sync.sales · POST /sync/sales · scope pos.offline.sync (คีย์ใหม่ใน core/permissions.ts โมดูล pos · ไม่มีในหน้า register) · 49 op · kind write
//   staff-pin.ts staffActorFromToken(ctx, token, client?, opts?{at?: Date}) — บล็อก // POS P3.4 ▸ … ◂ เดียว (ไม่แตะ verifyStaffPin · มติ 12)
//   createSale input.offline?: {ref: string; soldAt: Date | string} → PosSale.offlineRef · syncedAt = now · paidAt = soldAt · เลขใบเสร็จจากตัวนับเดือนของ soldAt · createdAt = เวลาเซิร์ฟเวอร์
//   DB R1  PosSale.offlineRef String? · PosSale.syncedAt DateTime? · unique (unitId, offlineRef) WHERE offlineRef IS NOT NULL · PosDevice.offlineCode String? · PosDevice.offlineSeq Int @default(0) ·
//          PosOfflineSale (tenantId unitId systemId deviceId offlineRef idempotencyKey payload soldAt status reason? drift? saleId? resolvedByUserId? createdAt · unique (tenantId, idempotencyKey)) ·
//          PosOfflineSnapshot (tenantId unitId deviceId issuedAt priceMap hash · เก็บ 2 ล่าสุดต่อเครื่อง) · สถานะเป็น String (SYNCED REJECTED ACCEPTED_BY_MANAGER DISCARDED)
//   audit  pos.sale.offline_synced {offlineRef, deviceId, soldAt, syncedAt, drift?, via?} ต่อบิลที่ซิงก์ · pos.sale.offline_discarded {reason}
//
// 🔴 กติกาข้อสอบ (แบบ qc-pos-p2.13/p2.14): SKIP เมื่อของหลักของใบยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash · Z เขียว)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ST + Q (อ่านไฟล์ + import offline-shared ที่ผ่านด่านบริสุทธิ์ ST3 เท่านั้น · ไม่โหลด prisma)
//    ฐาน = QC4 เท่านั้น · ร้านชั่วคราวลบใน finally · ไม่มีเครือข่าย (globalThis.fetch = ตัวกั้น) · SQL ดิบเฉพาะแถวของร้านชั่วคราว (เลื่อนเวลาเปิดกะ/เพิกถอน)
//    เวลา: เลื่อนนาฬิกาผ่าน opts.now ของ facade + issueStaffToken({now}) — ไม่ sleep · ไม่ฮาร์ดโค้ดวันที่
//    ใบ U (P3.4U) = ภาพ V ทั้งหมด + IndexedDB + จอ — ไม่อยู่ในชุดนี้ (รายการ SKIP ในโน้ต · ไม่นับเป็นเขียว)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p3.4";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";
/** ฐานของข้อสอบ — ไฟล์เดิมที่ใบนี้แตะได้แค่บล็อก // POS P3.4 ▸ … ◂ เทียบกับฐานนี้ */
const BASE_REV = process.env.P34_BASE || "72669941";

// ═════════════════════════ ทะเบียนข้อสอบ ═════════════════════════
// X: ST สถิต · Q คิวบริสุทธิ์ · SY facade (QC4) · RS REST · SEC ความปลอดภัย · Z คืนสภาพ
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P3.4-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต (--no-db) ──
  D("ST1", "ST", "[R1 มติ 2] migration *_pos_p34_offline ใบเดียว · เพิ่มล้วน (ADD COLUMN nullable/DEFAULT · CREATE TABLE/INDEX · ไม่มี DROP/ALTER TYPE/CREATE TYPE/ALTER COLUMN/RENAME/UPDATE/DELETE) · unique (unitId, offlineRef) WHERE offlineRef IS NOT NULL · schema R1 ครบ (สถานะ String) · prisma/schema เทียบ 72669941 ลบ 0 บรรทัด (-w) · ไม่มี enum ใหม่"),
  D("ST2", "ST", "[§10.13 COMMON 2] pos-sale-contract.json = เพิ่มล้วนเทียบ 72669941 + CreateSaleInput.offline (optional · ref + soldAt) · ผู้เรียก createSale เท่าเดิม (นับแบบ hf-fu CALL_SITES) · outbox-consumers.ts ตรงไบต์ · staff-pin.ts = ฐาน + บล็อก POS P3.4 ▸ เดียว (at) · verifyStaffPin ไม่แตะ · register.ts/service.ts แก้เฉพาะในบล็อก POS P3.4"),
  D("ST3", "ST", "[R13 ST3] offline-shared.ts บริสุทธิ์ (ไล่ import ทั้งสาย: ไม่ถึง @/lib/core/db · @prisma/client · server-only · next/ · node: · ไฟล์ \"use server\" · ไม่มี Date.now()/Math.random()) · offline-sync.ts ไม่ใช่ use client/use server + export 5 ฟังก์ชัน · ไม่เรียก createSale ตรง (ผ่าน submitRegisterSale)"),
  D("ST4", "ST", "[มติ 9 Q7] ไม่มี service worker ใน P3.4: public/ ไม่มี *sw*.js/service-worker · src ไม่มี navigator.serviceWorker / serviceWorker.register / caches.open · next.config.ts ไม่มี headers() ของ sw"),
  D("ST5", "ST", "[มติ 2 R5] REST: op sync.sales POST /sync/sales · scope pos.offline.sync · kind write · 49 op พอดี · POS_SCOPES มี pos.offline.sync · core/permissions.ts มีคีย์ pos.offline.sync · docs/api/POS-API.md + skills endpoints.md มี POST /sync/sales · gen-pos-api-docs --check exit 0"),
  D("ST6", "ST", "[F15.4] ข้อความ: offlineRefusalMessageKey ของ 6 รหัส (PRICE_MISMATCH CLOCK_INVALID SHIFT_CLOSED SELLER_MISMATCH OFFLINE_REF_TAKEN STOCK_INSUFFICIENT) → คีย์ใต้ pos.register ต่างกันทุกตัว · มีทั้ง th/en · th มีอักษรไทย · en ไม่มี"),
  D("ST7", "ST", "[F15.3] data-testid ใหม่ (ไม่มีที่ 72669941) ที่มีคำ offline|sync ใน src ทุกตัวมีแถว pos-ui-inventory.json (ตรงตัวหรือแพตเทิร์น *)"),
  D("ST8", "ST", "[R3 ST8] ธงปริยายปิด: posOfflineEnabled({}) / null / enabled:\"true\" / enabled:1 = false · enabled:true = true · pos.json register.status.offlineBanner (th/en) ตรงฐาน 72669941 (จอเดิมเมื่อปิดธง)"),
  // ── Q คิวบริสุทธิ์ (ไม่แตะ DB) ──
  D("Q1", "Q", "[R4] offlineRef(\"C1\",7) = OFF-C1-0007 · seq ≥ 10000 ไม่ตัด · parseOfflineRef กลับได้ · รหัส/seq ผิดรูป → null · nextOfflineSeq = max(local, server)+1 · จองต่อเนื่องเพิ่มขึ้นเสมอแม้ server ยกพื้น"),
  D("Q2", "Q", "[R3 มติ 4 5] offlineSaleRefusal: เงินสด / โอน / เงินสด+โอน = null · PROMPTPAY CARD GIFT_CARD STORE_CREDIT DEPOSIT PLATFORM · memberId · couponCode · memberChoices · tableSessionId · tableSplitPartId · heldCartId · channelId → {code VALIDATION} · OFFLINE_TENDERS = CASH TRANSFER"),
  D("Q3", "Q", "[R3 Q3] offlineCartTotals(snapshot, cart) = priceCart บนราคา snapshot ทุกสตางค์ 12 ตะกร้า (ตัวเลือก · ชั่ง · ส่วนลดบรรทัด/ท้ายบิล บาท/% · ค่าบริการ · VAT INCLUDED/NONE · ราคา 0 · ผสม) · สินค้าไม่อยู่ใน snapshot / ตัวเลือกของสินค้าอื่น → ok:false"),
  D("Q4", "Q", "[R5] offlineBatches เรียง (soldAt, seq จาก offlineRef) · 120 รายการ → 50/50/20 · size > 50 ถูกบีบเป็น 50 · OFFLINE_SYNC_BATCH_MAX 50"),
  D("Q5", "Q", "[R11] classifyOfflineResult: OK/DUPLICATE → remove · REJECTED → park · null/undefined (เครือข่าย/5xx/BUSY) / สถานะแปลก → keep"),
  D("Q6", "Q", "[มติ 6 Q4] offlineSellGate: ปิดธง/เครื่องไม่ ACTIVE/ไม่มี snapshot/อายุ > 24 ชม./เลย priceValidUntil + 15 นาที/คิว ≥ 300 → ok:false · ขอบที่ยังขายได้ → ok:true · ค่าคงที่ 24 ชม. 300 15 นาที 2 นาที 5 นาที"),
  D("Q7", "Q", "[R12 มติ 2] offlineSlipPayload → ReceiptPayload kind RECEIPT · doc.receiptNo = OFF-… · footer.qrEReceiptUrl null · renderReceiptHtml th มี \"ใบรับเงินชั่วคราว\" + \"รอออกเลขจริง\" ไม่มี \"ใบกำกับภาษีอย่างย่อ\" · ไม่มี /r/ · en ไม่มีอักษรไทย"),
  // ── SY facade (QC4) ──
  D("SY1", "SY", "[R7 มติ 3] 3 บิลเงินสดของเครื่อง D1 → 3 บิล (offlineRef · syncedAt ≈ ตอนซิงก์ · paidAt = soldAt · createdAt = เวลาเซิร์ฟเวอร์ · กะ D1 · ผู้ขาย = ผู้ใช้ session) · PosOfflineSale SYNCED + saleId · pos.sale.paid ×1 · audit pos.sale.offline_synced ×1 ต่อบิล · บิลข้ามเดือน (soldAt 23:50 วันสุดท้ายของเดือนก่อน · opts.now 00:10) → เลขใบเสร็จเดือนของ soldAt · JE periodKey เดือนของ soldAt"),
  D("SY2", "SY", "[R5 มติ 14] ส่งชุดผสม (OK ×5 + REJECTED ×1) ซ้ำ 2 รอบ → DUPLICATE saleId/receiptNo เดิม · REJECTED เหตุผลเดิม · Δแถว 0 (PosSale PosSaleLine PosPayment InvMovement OutboxEvent AccountJournalEntry AuditLog PosOfflineSale)"),
  D("SY3", "SY", "[R5] ชุดที่ตัวกลางเป็นสินค้าไม่มีจริง → 1,3 OK · 2 REJECTED ไม่มีบิล · ทั้ง 3 ลง PosOfflineSale (SYNCED/REJECTED/SYNCED · payload เก็บ)"),
  D("SY4", "SY", "[R6 มติ 10] ราคาเปลี่ยนหลัง snapshot (เค้ก 4500 → 5500) ขายที่ 4500 → OK ที่ราคา snapshot (ยอดบิล 4500) + drift ในผล · PosOfflineSale.drift · audit after.drift"),
  D("SY5", "SY", "[R6] ราคาปลอม (ไม่ตรงราคา ณ soldAt และไม่ตรง snapshot) → REJECTED PRICE_MISMATCH · ไม่มีบิล · ลง PosOfflineSale REJECTED"),
  D("SY6", "SY", "[R6 · fix1 N3] happy hour เปิดตอน soldAt ปิดตอนซิงก์ (ช้ากว่า 30 นาที) → REJECTED PRICE_WINDOW_REVIEW → ผู้จัดการรับ = ราคา ณ soldAt 3000 ไม่มี drift · ตัวควบคุม: ราคาโปรหลังโปรจบ → PRICE_MISMATCH"), // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 fix1 N3)
  D("SY7", "SY", "[R8 มติ 7] กะที่บันทึกถูกปิดก่อนซิงก์ → REJECTED SHIFT_CLOSED ไม่มีบิล → ผู้จัดการ accept → บิล shiftId null · อยู่ใน offShiftCash ของวันนี้"),
  D("SY8", "SY", "[R8] เครื่องถูกเพิกถอน: soldAt ก่อน revokedAt → OK · soldAt หลัง revokedAt → REJECTED ไม่มีบิล"),
  D("SY9", "SY", "[R8 มติ 12] โทเคนหมดอายุตอนซิงก์แต่ยังไม่หมดตอน soldAt → OK ผู้ขาย = คนในโทเคน · soldAt หลังหมดอายุ → REJECTED · ตั้ง PIN ใหม่ → REJECTED · staffActorFromToken(…, {at}) ทำงาน · ไม่มีโทเคน: sellerUserId ≠ ผู้ใช้ session → SELLER_MISMATCH · = ผู้ใช้ session → OK · payload ไม่เก็บโทเคนดิบ"),
  D("SY10", "SY", "[R3 มติ 4 5] เนื้อหาที่ออฟไลน์ห้าม (PROMPTPAY · CARD · GIFT_CARD · DEPOSIT · memberId · couponCode · memberChoices · tableSessionId) → REJECTED VALIDATION ไม่มีบิล · TRANSFER (มีเลขอ้างอิง) + เงินสด → OK"),
  D("SY11", "SY", "[R7 มติ 6] นาฬิกา: soldAt > now + 2 นาที · < snapshot.issuedAt · < เปิดกะ − 5 นาที · < now − 24 ชม. → CLOCK_INVALID · soldAt ผิดรูป → REJECTED · ตัวควบคุม soldAt = now + 60 วิ → OK"),
  D("SY12", "SY", "[R9] สต็อก ALLOW_NEGATIVE: ตัดครั้งเดียว (InvMovement 1 แถว · ติดลบได้ · ส่งซ้ำไม่ตัดซ้ำ) · BLOCK + ไม่พอ → REJECTED STOCK_INSUFFICIENT ไม่มีบิล"),
  D("SY13", "SY", "[R5 R3] ปฏิเสธทั้งชุด ไม่เขียนอะไร: ร้านอื่น (T2 + เครื่องของ T) · ผู้ขายนอกสาขา · เครื่องไม่ลงทะเบียน · ไม่มี pos.sale.create · > 50 รายการ · ปิดธง = sync ยังรับ (F5) · snapshot ของเครื่องไม่ลงทะเบียน/ปิดธง ถูกปฏิเสธ"), // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 fix1 F5)
  D("SY14", "SY", "[R4] บิลออนไลน์ unknown ที่ commit แล้ว (คีย์เดียวกัน) ถูกซิงก์ → DUPLICATE saleId เดิม · Δบิล 0"),
  D("SY15", "SY", "[R4 R1 มติ 14] offlineRef ซ้ำคีย์ใหม่ → REJECTED OFFLINE_REF_TAKEN · D2 มี offlineCode ของตัวเอง (≠ D1) seq 1 อิสระ → OK · D2 ส่งเลขของ D1 → REJECTED · PosDevice.offlineSeq = high-water · snapshot ใหม่บอก offlineSeq"),
  D("SY16", "SY", "[R9] บิลซิงก์ไม่สร้างรอบครัว (สินค้าผูกสถานี) แม้ healMissingTickets · ตัวควบคุม: บิลออนไลน์ของสินค้าเดียวกัน → มีรอบ"),
  D("SY17", "SY", "[R10 มติ 7] คิวผู้จัดการ: list มี REJECTED ของสาขา (ไม่มี SYNCED) · accept ×2 = บิลเดียว · discard ×2 = DISCARDED ครั้งเดียว · เหตุผล < 5 ตัว → VALIDATION · accept หลัง discard → ปฏิเสธ · แคชเชียร์ไม่มี pos.shift.manage → PERMISSION_DENIED (list/accept/discard) · audit"),
  D("SY18", "SY", "[fix1 N1 · CD-P34g] ผู้ขายที่ตรวจแล้วเท่านั้น: โทเคนปลอมอ้าง OWNER / sellerUserId = OWNER + ส่วนลด 50% (เกินเพดานแคชเชียร์) ซิงก์โดย CASH → REJECTED · list แยก claimedSellerUserId (OWNER) / verifiedSellerUserId (CASH) · ผู้จัดการรับ → คิดด้วยเพดานของ CASH ⇒ ปฏิเสธ · ไม่มีบิล (ไม่มีบิลที่ soldBy = OWNER)"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix1 N1)
  D("SY19", "SY", "[fix1 N2 = F3 · fix2 G1 · CD-P34g/i] อ้างกะ A ที่ปิดแล้วขณะ soldAt อยู่ในกะ B ที่เปิด → ไม่ใช่ SHIFT_CLOSED · รับ = ผูกกะ B · กะของบิล: ผู้จัดการรับบิลที่ถูกปฏิเสธด้วยเหตุอื่น (ผู้ขายไม่ตรง) ขณะกะ D7 ที่ครอบ soldAt ยังเปิด → บิลผูกกะ D7 (ไม่ใช่นอกกะ) · รอบแรก: ไม่ส่ง shiftId · ไม่มีกะครอบ soldAt · เครื่องมีกะเปิดอยู่ → REJECTED SHIFT_REQUIRED ไม่มีบิล"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix1 N2)
  D("SY20", "SY", "[fix1 N3 · fix2 G2 N6 · CD-P34g/i] + บิลโปรที่มีสินค้า 86 ตอนซิงก์ → REVIEW · ทาง snapshot soldAt ∈ (pvu, pvu+15] ซิงก์ช้า → REVIEW · โปรซิงก์ภายใน 30 นาที → OK · เวลาราคา: snapshot มี priceValidUntil แล้ว soldAt > pvu + 15 นาที → CLOCK_INVALID · โปร ณ soldAt ถูกกว่าราคาตอนซิงก์ และซิงก์ช้า > 30 นาที → REJECTED PRICE_WINDOW_REVIEW → ผู้จัดการรับ = ราคา ณ soldAt · audit after.priceAtSyncSatang ของบิลที่ซิงก์ · PRICE_WINDOW_REVIEW อยู่ใน OFFLINE_REFUSAL_CODES + ข้อความ th/en"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix1 N3)
  D("SY21", "SY", "[fix1 N4 = F1 · CD-P34g] snapshot ภายใน 24 ชม. ไม่ถูกตัด: ขายบน S1 แล้วเครื่องออก S2 + S3 ก่อนซิงก์ → บิลบน S1 = OK · PosOfflineSnapshot ของเครื่อง 3 แถว"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix1 N4)
  D("SY22", "SY", "[fix1 N5 = F4 · fix2 N9 · CD-P34g/i] + รายการที่คีย์ชนบิลออนไลน์อื่น → ทิ้งได้ (DISCARDED ไม่ผูกบิลนั้น) · คิวค้าง: แถว PROCESSING เก่า (> 5 นาที) ที่บิล reg2:<key> commit แล้ว → ทิ้งไม่ได้ · ปรับเป็น SYNCED + saleId เดิม · ไม่มี audit ทิ้ง · แถว ACCEPTED_BY_MANAGER ที่ไม่มี saleId อยู่ใน list → รับซ้ำได้บิล"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix1 N5)
  D("SY23", "SY", "[fix1 F2 · CD-P34g] ของหมด (86) หลังขายออฟไลน์: หมากฝรั่งถูก 86 ที่สาขาก่อนซิงก์ → บิลที่ขายไปแล้ว = OK · สินค้าที่ถูกเก็บถาวร (เค้ก) → REJECTED ไม่มีบิล"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix1 F2)
  D("SY24", "SY", "[fix1 F6 · CD-P34g] เลข OFF รหัส C<n> ต้องเป็นรูปมาตรฐาน: OFF-<รหัสเครื่อง>-00011 (เติมศูนย์เกิน) → REJECTED ไม่มีบิล · OFF-<รหัสเครื่อง>-0012 → OK"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix1 F6)
  D("SY25", "SY", "[fix2 N8 · CD-P34i] snapshot: ออกซ้ำเครื่องเดิมภายใน 60 วิ → RATE_LIMITED · hash ที่แถว REJECTED ยังอ้างอยู่ไม่ถูกตัด แม้เก่ากว่า 48 ชม. และไม่ใช่ 2 ล่าสุด (3 แถว)"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix2 N8)
  D("SY26", "SY", "[fix2 N7 · CD-P34i] ผู้ขายที่อ้างโดยไม่มีโทเคน ≠ ผู้ใช้ที่ซิงก์ (OWNER): รับบิล = เพดานส่วนลดต่ำกว่าระหว่างคนที่อ้าง (CASH 10%) กับผู้ซิงก์ ⇒ ส่วนลด 50% ปฏิเสธ ไม่มีบิล · ส่วนลด 5% → OK (soldBy = ผู้ซิงก์) · คนที่อ้างไม่ใช่สมาชิกของสาขา → SELLER_MISMATCH"), // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix2 N7)
  // ── RS REST ──
  D("RS1", "RS", "[R5 มติ 2] POST /sync/sales (คีย์ pos-operate + pos.offline.sync) → 200 data.results ต่อรายการ (status OK · saleId · receiptNo) · บิลมี offlineRef"),
  D("RS2", "RS", "[R5] Idempotency-Key เดิม → replay (idempotent-replayed true · data เดิม) · ลบแถว ApiIdempotency แล้วส่งใหม่ → DUPLICATE saleId เดิม · 1 บิล"),
  D("RS3", "RS", "[R5] 51 รายการ → 422 · คีย์แปลกในรายการ → 422 · ไม่มีบิล/PosOfflineSale ใหม่"),
  D("RS4", "RS", "[มติ 2] คีย์ไม่มี pos.offline.sync → 403 scope_missing · เครื่องของสาขาอื่น (unitId A + เครื่อง B) → 404 not_found · ไม่เขียนอะไร"),
  D("RS5", "RS", "[มติ 2 13] POS_OPS 49 ตัวมี sync.sales · openapi.json 49 operation มี paths./sync/sales.post · isApiScope(pos.offline.sync) · POS_SCOPE_KEYS มี"),
  // ── SEC ──
  D("SEC1", "SEC", "[R2 R13] snapshot: สินค้า keys ⊆ RegisterProduct + choices · ไม่มีคีย์ cost/margin/onHand/phone/email/member/token ทั้งก้อน · ราคา = ราคาหน้าร้าน ณ issuedAt · PosOfflineSnapshot (เครื่อง, hash) เก็บ priceMap ตรง"),
  D("SEC2", "SEC", "[R5 มติ 2] route src/app/api/pos/sync/route.ts: POST · session (@/lib/core/context) · pos.sale.create · เรียก syncOfflineSales · ไม่ใช่ \"use server\" · facade: ctx สาขา A + เครื่องของสาขา B / ctx สาขา B + เครื่อง A → ปฏิเสธ 0 แถว"),
  D("SEC3", "SEC", "[R6 มติ 14 · fix1 N4] snapshot ต่อเครื่อง: รายการของ D1 ที่อ้าง hash ของ D2 → REJECTED ไม่มีบิล · เครื่อง D5 ออก snapshot 3 ครั้ง (−60 ชม. −59 ชม. ตอนนี้ · ราคาเปลี่ยน · fix2 G3) → เก็บ 2 แถว · hash ที่ถูกตัดทิ้ง → REJECTED"), // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 fix1 N4)
  // ── Z ──
  D("Z1", "Z", "QC4 คืนสภาพ: ร้านชั่วคราว 0 แถวทุกตารางที่มี tenantId (รวม PosOfflineSale/PosOfflineSnapshot) + Tenant ถูกลบ · ผู้ใช้ของรอบ 0 · ถังเพดานอัตราของคีย์รอบนี้ 0"),
  D("Z2", "Z", "ลายนิ้วมือนอกร้านชั่วคราว (PosSale · PosReceiptCounter seq · PosDevice offlineSeq/status · PosOfflineSale · PosOfflineSnapshot · AuditLog pos.sale.offline_*) เท่าเดิม"),
];
/** ใบ U (P3.4U · CONTROLLER-RUN) — ไม่อยู่ในชุดนี้ · ไม่นับเป็นเขียว (มติ 11) */
const U_ONLY = [
  "V offline-sale (บิลเงินสดออฟไลน์ → การ์ดจบ เลข OFF · context ใหม่ + ธงเปิด)",
  "V offline-queue (ป้าย รอซิงก์ 2 + แบนเนอร์ 19ง)",
  "V offline-tenders (ชิปพร้อมเพย์/บัตร/แต้ม ปิด + เหตุผล)",
  "V offline-sync-back (setOfflineMode(false) → ป้าย 0 · บิลได้เลขจริง)",
  "V offline-rejected (คิวผู้จัดการ · หน้าใหม่ owner-ack แบบ P2.8)",
  "V settings-offline-live (สวิตช์ live + รายการค้าง)",
  "ST3-U IndexedDB ไม่เขียนคีย์ managerPin|pin|phoneLast4|cost · ชื่อ DB shark-pos-off:<systemId>:<unitId> · ล้าง snapshot ตอน logout/STAFF_TOKEN_INVALID",
  "ST6-U ข้อความ register.offline.* (แบนเนอร์/ชิป 19ง) + settings.offline.* แบบ live",
  "ST7-U แถว ui-inventory ของ testid ใหม่ทุกตัวของจอ",
  "ST8-U OfflineCard / แท็บออฟไลน์เมื่อปิดธง = ภาพวันนี้ (harness offline + settings-offline เดิม)",
  "Q-U Web Locks leader · backoff · ปิดกะบนเครื่องถูกบล็อกเมื่อคิว > 0 · บิลรอซิงก์ void/คืนไม่ได้ · ตัวยืนยัน PIN ออฟไลน์ PBKDF2 ≥ 310k (มติ 8)",
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  const byX = new Map<string, number>();
  for (const [, x] of CHECKS) byX.set(x, (byX.get(x) ?? 0) + 1);
  console.log(`X-coverage: ${[...byX.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log(`U-only (P3.4U · ไม่อยู่ในชุดนี้ · ไม่นับเขียว): ${U_ONLY.length}`);
  for (const u of U_ONLY) console.log(`  - ${u}`);
  process.exit(0);
}

// ═════════════════════════ ตัวช่วยทั่วไป ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = id.startsWith("P3.4-") ? id : `P3.4-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
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
/** ตัดคอมเมนต์แบบไล่ตัวอักษร (เคารพสตริง '…' "…" `…`) — แบบ qc-pos-p2.14 */
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
const showAt = (rev: string, f: string): string | null => gitStr(["show", `${rev}:${f}`]);
const BASE_OK = !!gitStr(["rev-parse", "--verify", "-q", `${BASE_REV}^{commit}`])?.trim();
// ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p3.4 ST1/ST2): ใบพี่น้อง P3.5 S merge เข้า session/pos ก่อน (688fc3ed = 72669941 + HF-FU2 + P3.5 S) —
//   ไฟล์ร้อน/migration/enum ที่ "ตรงกับ 688fc3ed + บล็อก POS P3.4 เท่านั้น" = ของพี่น้อง ไม่ใช่ของใบนี้ ⇒ รับ (ฐาน BASE_REV ยังรับเหมือนเดิม)
//   เทียบกับต้นไม้ของ merge P3.5 แทน "ตัดบรรทัดในบล็อก P3.5" เพราะโค้ด P3.5 ไม่ได้อยู่ใน ▸…◂ ทุกบรรทัด (เช่นเนื้อ scheduleGate · REG_MESSAGE 2 บรรทัดหลัง) — รับเฉพาะสิ่งที่ merge P3.5 มีจริง
const SIB_REV = process.env.P34_SIB || "688fc3ed"; // CD-RP9 21.10: คง 688fc3ed (ST2 staff-pin ต้องเทียบ rev ก่อน P3.4 merge) — migration/schema ใหม่ของใบหลัง ดูที่ LANE_REV ใน ST1
const SIB_OK = !!gitStr(["rev-parse", "--verify", "-q", `${SIB_REV}^{commit}`])?.trim();
// ORACLE-EDIT ผู้คุม 17.10 (CD-RP4 · หมุดเลนที่ 3 = product tip หลัง merge P3.8 ซึ่งแตะ outbox-consumers.ts · ST2 ยอมรับไบต์เท่ากับ rev ใดก็ได้ใน revsHot)
const LANE_REV = process.env.P34_LANE || "9cfa81bb"; // ORACLE-EDIT ผู้คุม 21.10 (CD-RP10 · re-pin bafdf89f → 9cfa81bb) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP9 · re-pin b2458030 → bafdf89f) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP8 · re-pin 02b67f91 → b2458030) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP5 · re-pin a2c9a4c7 → 02b67f91)
const LANE_OK = !!gitStr(["rev-parse", "--verify", "-q", `${LANE_REV}^{commit}`])?.trim();
/** บรรทัดในบล็อก // POS P3.4 ▸ … ◂ (บรรทัดเดียวหรือหลายบรรทัด) */
function markedLines(src: string): { lines: Set<number>; blocks: number; text: string } {
  const ls = src.split("\n");
  const mk = new Set<number>();
  let open = false;
  let blocks = 0;
  let text = "";
  ls.forEach((l, i) => {
    const starts = /POS P3\.4\s*▸/.test(l);
    if (starts) blocks++;
    if (starts || open) {
      mk.add(i);
      text += `${l}\n`;
    }
    if (starts && !l.includes("◂")) open = true;
    else if (open && l.includes("◂")) open = false;
  });
  return { lines: mk, blocks, text };
}
/** บรรทัดที่ไม่อยู่ในบล็อก P3.4 ของ head ต้องเป็น subsequence ของฐาน — คืนบรรทัดที่เพิ่มนอกบล็อก + จำนวนบรรทัดฐานที่หายไป */
function onlyMarked(base: string, head: string): { added: string[]; dropped: number; blocks: number; text: string } {
  const m = markedLines(head);
  const norm = (s: string[]) => s.map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
  const hu = norm(head.split("\n").filter((_, i) => !m.lines.has(i)));
  const bl = norm(base.split("\n"));
  let j = 0;
  const added: string[] = [];
  let kept = 0;
  for (const l of hu) {
    let k = j;
    while (k < bl.length && bl[k] !== l) k++;
    if (k === bl.length) added.push(l.trim().slice(0, 80));
    else {
      j = k + 1;
      kept++;
    }
  }
  return { added, dropped: bl.length - kept, blocks: m.blocks, text: m.text };
}
/** เนื้อฟังก์ชัน export (โค้ดตัดคอมเมนต์แล้ว) — จบที่ export ถัดไป */
function fnBody(code: string, name: string): string {
  const m = new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`).exec(code);
  if (!m) return "";
  const rest = code.slice(m.index + m[0].length);
  const nx = rest.search(/\nexport\s/);
  return nx < 0 ? rest : rest.slice(0, nx);
}
const readJson = (raw: string | null): Any => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
const getPath = (o: Any, path: string): Any => path.split(".").reduce((a: Any, k) => (isRecord(a) ? a[k] : undefined), o);
/** ค่าทุกใบของฐานต้องมีและเท่ากันที่ head (เพิ่มได้ · ห้ามลบ/เปลี่ยน) — คืน path ที่ต่าง */
function notSubset(base: Any, head: Any, path = "", out: string[] = []): string[] {
  if (Array.isArray(base)) {
    if (!Array.isArray(head)) out.push(`${path} ไม่ใช่ array`);
    else if (JSON.stringify(base) !== JSON.stringify(head)) {
      // array ของสัญญา = รายการลายเซ็น/ผู้เรียก — ต้องเหมือนเดิมทุกตัว (ลำดับเดียวกัน)
      out.push(`${path} เปลี่ยน`);
    }
    return out;
  }
  if (isRecord(base)) {
    if (!isRecord(head)) {
      out.push(`${path} หาย`);
      return out;
    }
    for (const k of Object.keys(base)) notSubset(base[k], head[k], path ? `${path}.${k}` : k, out);
    return out;
  }
  if (base !== head) out.push(`${path} ${short(base, 30)}→${short(head, 30)}`);
  return out;
}
/** ซอร์สที่ตัดบรรทัดในบล็อก POS P3.4 ออก */
const markedStrip = (src: string) => {
  const m = markedLines(src);
  return src.split("\n").filter((_, i) => !m.lines.has(i)).join("\n");
};
const POS_DIR = "src/lib/modules/pos";
const F = {
  shared: `${POS_DIR}/offline-shared.ts`,
  facade: `${POS_DIR}/offline-sync.ts`,
  route: "src/app/api/pos/sync/route.ts",
  register: `${POS_DIR}/register.ts`,
  service: `${POS_DIR}/service.ts`,
  staffPin: `${POS_DIR}/staff-pin.ts`,
  outbox: "src/lib/outbox-consumers.ts",
  contract: "scripts/pos-sale-contract.json",
  schemaDir: "prisma/schema",
  schemaPos: "prisma/schema/pos.prisma",
  migrations: "prisma/migrations",
  opsDir: `${POS_DIR}/api/ops`,
  opTs: `${POS_DIR}/api/op.ts`,
  perms: "src/lib/core/permissions.ts",
  gen: "scripts/gen-pos-api-docs.mts",
  endpointsMd: "skills/shark-pos-api/references/endpoints.md",
  apiMd: "docs/api/POS-API.md",
  thPos: "src/messages/th/pos.json",
  enPos: "src/messages/en/pos.json",
  inventory: "scripts/pos-ui-inventory.json",
  nextConfig: "next.config.ts",
  restRoute: "src/app/api/v1/pos/[...path]/route.ts",
  openapiRoute: "src/app/api/v1/pos/openapi.json/route.ts",
};
const FACADE_FNS = ["syncOfflineSales", "issueOfflineSnapshot", "listOfflineRejected", "acceptOfflineSale", "discardOfflineSale"] as const;
const SHARED_FNS = ["posOfflineEnabled", "offlineRef", "parseOfflineRef", "nextOfflineSeq", "offlineSaleRefusal", "offlineCartTotals", "offlineBatches", "classifyOfflineResult", "offlineSellGate", "offlineSlipPayload", "offlineRefusalMessageKey"] as const;
const OFFLINE_CODES = ["PRICE_MISMATCH", "CLOCK_INVALID", "SHIFT_CLOSED", "SELLER_MISMATCH", "OFFLINE_REF_TAKEN", "STOCK_INSUFFICIENT"] as const;
const SCOPE_KEY = "pos.offline.sync";
const AUDIT_SYNCED = "pos.sale.offline_synced";
const AUDIT_DISCARDED = "pos.sale.offline_discarded";
const OPS_TOTAL = 49;
/** ชุดคีย์ของ RegisterProduct (register-shared.ts ที่ 72669941) + choices/optionGroups ของ snapshot */
const PRODUCT_WHITELIST = new Set([
  "id", "invItemId", "name", "nameEn", "kind", "categoryId", "priceSatang", "sku", "barcode", "imageUrl", "optionGroupCount", "requiredOptionGroupCount",
  "parentId", "variantCount", "soldByWeight", "soldOut", "soldOutReason", "soldOutMark", "stockLeft", "trackStock", "trackStockMode", "listPriceSatang",
  "priceSource", "priceRule", "notSold", "choices", "optionGroups",
]);
const FORBIDDEN_KEY = /(cost|margin|onhand|phone|email|member|pinhash|token|secret|password)/i;

// ── ด่าน SKIP (ของหลักของใบ) ──
const skipReasons: string[] = [];
for (const f of [F.facade, F.shared, F.route]) if (!ex(f)) skipReasons.push(`${f} ยังไม่มี`);

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4", "ST5", "ST6", "ST7", "ST8"].map((x) => `P3.4-${x}`);
const Q_IDS = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"].map((x) => `P3.4-${x}`);
let SHARED_PURE = false;
let sh: Any = null; // โมดูล offline-shared (โหลดหลัง ST3 ผ่าน)
const step = async (id: string, fn: () => Promise<void> | void) => {
  try {
    await fn();
  } catch (e) {
    chk(id, false, "ตรวจได้ (ไม่ crash)", `THROW ${(e as Error)?.message?.slice(0, 160)}`);
  }
};
/** แกะ model จาก .prisma: ชื่อฟิลด์ → บรรทัด (ชนิด + ตัวเสริม) */
function modelFields(src: string, name: string): Map<string, string> | null {
  const m = new RegExp(`\\nmodel\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(`\n${src}`);
  if (!m) return null;
  const out = new Map<string, string>();
  for (const raw of m[1]!.split("\n")) {
    const l = raw.replace(/\/\/.*$/, "").trim();
    const fm = /^(\w+)\s+(.+)$/.exec(l);
    if (fm && !l.startsWith("@@")) out.set(fm[1]!, fm[2]!.trim());
    if (l.startsWith("@@")) out.set(`${l.slice(0, 60)}`, l);
  }
  return out;
}
const allSchema = (rev: string | null): string => {
  if (rev === null) return walk(F.schemaDir, [], /\.prisma$/).map((f) => rd(f)).join("\n");
  const ls = (gitStr(["ls-tree", "--name-only", rev, `${F.schemaDir}/`]) ?? "").split("\n").filter((x) => x.endsWith(".prisma"));
  return ls.map((f) => showAt(rev, f) ?? "").join("\n");
};
/** ทะเบียนผู้เรียก createSale (กติกาเดียวกับ qc-hf-fu ST1 CALL_SITES) — head หรือ rev */
function createSaleCallers(rev: string | null): Record<string, number> {
  const found: Record<string, number> = {};
  const files = rev === null ? walk("src") : (gitStr(["grep", "-l", "-F", "createSale", rev, "--", "src"]) ?? "").split("\n").filter(Boolean).map((l) => l.replace(`${rev}:`, ""));
  for (const f of files) {
    if (f.endsWith("src/lib/modules/pos/service.ts") || f.endsWith("src/lib/contracts.ts")) continue;
    const body = rev === null ? rd(f) : showAt(rev, f) ?? "";
    const n = (stripCode(body).match(/\bcreateSale\s*\(/g) ?? []).length;
    if (n) found[f] = n;
  }
  return found;
}
/** แกะ op จากซอร์สของ ops/*.ts (แบบ qc-pos-p2.13 parseOps) */
type ParsedOp = { id: string; method: string; path: string; action: string; kind: string; file: string };
function parseOps(): { ops: ParsedOp[]; scopes: Record<string, string> } {
  const scopes: Record<string, string> = {};
  const opTs = srcOf(F.opTs);
  const sb = /POS_SCOPES\s*=\s*\{([\s\S]*?)\}\s*as\s+const/.exec(opTs)?.[1] ?? "";
  for (const m of sb.matchAll(/(\w+)\s*:\s*"([^"]+)"/g)) scopes[m[1]!] = m[2]!;
  const ops: ParsedOp[] = [];
  for (const file of walk(F.opsDir)) {
    const src = srcOf(file);
    for (const m of src.matchAll(/definePosOp\s*\(\s*\{/g)) {
      const body = src.slice(m.index!, m.index! + 2500);
      const str = (k: string) => new RegExp(`\\b${k}\\s*:\\s*"([^"]*)"`).exec(body)?.[1] ?? "";
      const actRaw = /\baction\s*:\s*([^,\n]+)/.exec(body)?.[1]?.trim() ?? "";
      const action = /^"([^"]+)"$/.exec(actRaw)?.[1] ?? scopes[/POS_SCOPES\.(\w+)/.exec(actRaw)?.[1] ?? ""] ?? actRaw;
      ops.push({ id: str("id"), method: str("method"), path: str("path"), action, kind: str("kind"), file });
    }
  }
  return { ops, scopes };
}
/** ไล่ import ทั้งสายของไฟล์ (relative + @/) — คืนปัญหาความบริสุทธิ์ */
function purityProblems(entry: string): string[] {
  const probs: string[] = [];
  const seen = new Set<string>();
  const resolve = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
    else if (spec.startsWith(".")) base = join(from.split("/").slice(0, -1).join("/"), spec);
    else return null;
    for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) if (ex(c) && statSync(abs(c)).isFile()) return c;
    return null;
  };
  const visit = (f: string, depth: number) => {
    if (seen.has(f) || depth > 12) return;
    seen.add(f);
    const raw = rd(f);
    const code = stripCode(raw);
    if (/^\s*["']use server["']/.test(code)) probs.push(`${f} เป็น "use server"`);
    const imps = [...code.matchAll(/(?:^|\n)\s*(import|export)\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/g)].map((m) => ({ spec: m[3]!, clause: m[2]! }));
    for (const m of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) imps.push({ spec: m[1]!, clause: "dynamic" });
    for (const m of code.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)) imps.push({ spec: m[1]!, clause: "side" });
    for (const { spec, clause } of imps) {
      if (/^\{(\s*type\s+\w+(\s+as\s+\w+)?\s*,?)+\s*\}$/.test(clause.trim())) continue; // import { type A, type B } = ชนิดล้วน
      if (spec === "@/lib/core/db" || spec.startsWith("@prisma/") || spec === "server-only" || spec.startsWith("next/") || spec === "next" || spec.startsWith("node:") || /^(fs|path|crypto|child_process)$/.test(spec)) {
        probs.push(`${f} import ${spec}`);
        continue;
      }
      const r = resolve(f, spec);
      if (r) visit(r, depth + 1);
    }
  };
  visit(entry, 0);
  return probs;
}

async function runStatic(): Promise<void> {
  console.log(`\n── ST ข้อสถิต (ไม่แตะ DB · ฐาน ${BASE_REV}${BASE_OK ? "" : " — ไม่มีในรีโปนี้!"}) ──`);

  // ── ST1 migration + schema ──
  await step("ST1", () => {
    const p: string[] = [];
    const dirs = readdirSync(abs(F.migrations)).filter((d) => statSync(abs(`${F.migrations}/${d}`)).isDirectory());
    const baseDirs = new Set((gitStr(["ls-tree", "--name-only", BASE_REV, `${F.migrations}/`]) ?? "").split("\n").map((x) => x.split("/").pop() ?? ""));
    // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p3.4 ST1): migration ที่มีอยู่แล้วใน merge P3.5 (SIB_REV) = ของพี่น้อง (*_pos_p35_staff_commission) ไม่นับเป็น "ใหม่อื่น"
    if (SIB_OK) for (const x of (gitStr(["ls-tree", "--name-only", SIB_REV, `${F.migrations}/`]) ?? "").split("\n")) if (!/_pos_p34_offline$/.test(x)) baseDirs.add(x.split("/").pop() ?? "");
    // ORACLE-EDIT ผู้คุม 21.10 (CD-RP9 qc-pos-p3.4 ST1): migration ของใบที่ merge หลัง P3.4 (P3.6 S: *_pos_p36_credit_enum · *_pos_p36_credit) มีอยู่ที่หมุดเลน LANE_REV = ไม่ใช่ "ใหม่อื่น" — ใบนี้ยังต้องมี *_pos_p34_offline ใบเดียวและเพิ่มล้วน ◂
    if (LANE_OK) for (const x of (gitStr(["ls-tree", "--name-only", LANE_REV, `${F.migrations}/`]) ?? "").split("\n")) if (!/_pos_p34_offline$/.test(x)) baseDirs.add(x.split("/").pop() ?? "");
    const fresh = dirs.filter((d) => !baseDirs.has(d));
    const mine = dirs.filter((d) => /_pos_p34_offline$/.test(d));
    if (mine.length !== 1) p.push(`migration *_pos_p34_offline ${mine.length} ใบ (คาด 1)`);
    const other = fresh.filter((d) => !mine.includes(d));
    if (other.length) p.push(`migration ใหม่อื่น: ${other.join(",")}`);
    if (mine.length === 1) {
      const sql = rd(`${F.migrations}/${mine[0]}/migration.sql`).replace(/--[^\n]*/g, "");
      if (!sql.trim()) p.push("migration.sql ว่าง/ไม่มี");
      const up = sql.toUpperCase();
      for (const bad of [/\bDROP\b/, /\bALTER\s+TYPE\b/, /\bCREATE\s+TYPE\b/, /\bALTER\s+COLUMN\b/, /\bRENAME\b/, /\bTRUNCATE\b/, /\bDELETE\s+FROM\b/, /\bUPDATE\s+"/]) if (bad.test(up)) p.push(`SQL มี ${bad.source}`);
      const created = new Set([...sql.matchAll(/CREATE\s+TABLE\s+"(\w+)"/gi)].map((m) => m[1]!));
      for (const t of ["PosOfflineSale", "PosOfflineSnapshot"]) if (!created.has(t)) p.push(`ไม่มี CREATE TABLE "${t}"`);
      const stmts = sql.split(";").map((s) => s.trim()).filter(Boolean);
      const addCols: string[] = [];
      for (const s of stmts) {
        const at = /^ALTER\s+TABLE\s+"(\w+)"\s+([\s\S]+)$/i.exec(s);
        if (/^CREATE\s+TABLE\b/i.test(s) || /^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(s)) continue;
        if (at) {
          const [, tb, rest] = at;
          if (/^ADD\s+CONSTRAINT\b/i.test(rest!)) {
            if (!created.has(tb!)) p.push(`ADD CONSTRAINT บนตารางเดิม ${tb}`);
            continue;
          }
          for (const part of rest!.split(/,\s*(?=ADD\s+COLUMN)/i)) {
            const cm = /^ADD\s+COLUMN\s+"(\w+)"\s+([\s\S]+)$/i.exec(part.trim());
            if (!cm) {
              p.push(`ALTER TABLE ${tb} ทำอย่างอื่น: ${short(part, 50)}`);
              continue;
            }
            addCols.push(`${tb}.${cm[1]}`);
            if (/NOT\s+NULL/i.test(cm[2]!) && !/DEFAULT/i.test(cm[2]!)) p.push(`${tb}.${cm[1]} NOT NULL ไม่มี DEFAULT`);
          }
          continue;
        }
        p.push(`คำสั่งที่ไม่อนุญาต: ${short(s, 60)}`);
      }
      for (const c of ["PosSale.offlineRef", "PosSale.syncedAt", "PosDevice.offlineCode", "PosDevice.offlineSeq"]) if (!addCols.includes(c)) p.push(`ไม่มี ADD COLUMN ${c}`);
      if (!/CREATE\s+UNIQUE\s+INDEX\s+"?\w+"?\s+ON\s+"PosSale"\s*\(\s*"unitId"\s*,\s*"offlineRef"\s*\)\s*WHERE\s+"offlineRef"\s+IS\s+NOT\s+NULL/i.test(sql)) p.push('ไม่มี partial unique "PosSale"("unitId","offlineRef") WHERE "offlineRef" IS NOT NULL');
      if (!/CREATE\s+UNIQUE\s+INDEX\s+"?\w+"?\s+ON\s+"PosOfflineSale"\s*\(\s*"tenantId"\s*,\s*"idempotencyKey"\s*\)/i.test(sql)) p.push('ไม่มี unique "PosOfflineSale"("tenantId","idempotencyKey")');
    }
    // schema
    const sch = rd(F.schemaPos);
    const sale = modelFields(sch, "PosSale");
    const dev = modelFields(sch, "PosDevice");
    const want: [Map<string, string> | null, string, RegExp][] = [
      [sale, "offlineRef", /^String\?/],
      [sale, "syncedAt", /^DateTime\?/],
      [dev, "offlineCode", /^String\?/],
      [dev, "offlineSeq", /^Int\s+@default\(0\)/],
    ];
    for (const [m, f, re] of want) if (!m?.get(f) || !re.test(m.get(f)!)) p.push(`${f} ${m?.get(f) ?? "ไม่มี"}`);
    const allNow = allSchema(null);
    const off = modelFields(allNow, "PosOfflineSale");
    const snap = modelFields(allNow, "PosOfflineSnapshot");
    if (!off) p.push("ไม่มี model PosOfflineSale");
    else {
      const need: [string, RegExp][] = [
        ["tenantId", /^String\b/], ["unitId", /^String\b/], ["systemId", /^String\b/], ["deviceId", /^String\b/], ["offlineRef", /^String\b(?!\?)/],
        ["idempotencyKey", /^String\b(?!\?)/], ["payload", /^Json\b/], ["soldAt", /^DateTime\b(?!\?)/], ["status", /^String\b(?!\?)/], ["reason", /^String\?/],
        ["drift", /^Json\?/], ["saleId", /^String\?/], ["resolvedByUserId", /^String\?/], ["createdAt", /^DateTime\b/],
      ];
      for (const [f, re] of need) if (!off.get(f) || !re.test(off.get(f)!)) p.push(`PosOfflineSale.${f} ${off.get(f) ?? "ไม่มี"}`);
      if (![...off.values()].some((v) => /@@unique\(\[\s*tenantId\s*,\s*idempotencyKey\s*\]/.test(v))) p.push("PosOfflineSale ไม่มี @@unique([tenantId, idempotencyKey])");
    }
    if (!snap) p.push("ไม่มี model PosOfflineSnapshot");
    else for (const [f, re] of [["tenantId", /^String\b/], ["unitId", /^String\b/], ["deviceId", /^String\b/], ["issuedAt", /^DateTime\b/], ["priceMap", /^Json\b/], ["hash", /^String\b/]] as [string, RegExp][]) if (!snap.get(f) || !re.test(snap.get(f)!)) p.push(`PosOfflineSnapshot.${f} ${snap.get(f) ?? "ไม่มี"}`);
    const enumsBase = (allSchema(BASE_REV).match(/\nenum\s+\w+/g) ?? []).length;
    const enumsNow = (allNow.match(/\nenum\s+\w+/g) ?? []).length;
    const enumsSib = SIB_OK ? (allSchema(SIB_REV).match(/\nenum\s+\w+/g) ?? []).length : -1; // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p3.4 ST1): enum ของ P3.5 (PosStaffCommissionKind/Status) มีที่ SIB_REV แล้ว
    if (enumsNow !== enumsBase && enumsNow !== enumsSib) p.push(`enum ${enumsBase}→${enumsNow} (มติ 2: ไม่มี enum ใหม่ · พี่น้อง ${enumsSib})`);
    const ns = gitStr(["diff", "-w", "--numstat", BASE_REV, "--", F.schemaDir]) ?? "";
    const delLines = ns.split("\n").filter(Boolean).reduce((t, l) => t + (Number(l.split("\t")[1]) || 0), 0);
    if (!BASE_OK) p.push(`ไม่มี ${BASE_REV} ให้เทียบ`);
    if (delLines) p.push(`prisma/schema ลบ ${delLines} บรรทัดเทียบ ${BASE_REV}`);
    chk("ST1", p.length === 0, "migration เพิ่มล้วน 1 ใบ · schema R1 · schema ลบ 0 · enum เท่าเดิม", joinP(p));
  });

  // ── ST2 สัญญา + ผู้เรียก + ไฟล์ร้อน ──
  await step("ST2", () => {
    const p: string[] = [];
    const base = readJson(showAt(BASE_REV, F.contract));
    const head = readJson(rd(F.contract));
    if (!base || !head) p.push(`อ่าน ${F.contract} ไม่ได้ (ฐาน ${!!base} · head ${!!head})`);
    else {
      const diff = notSubset(base, head);
      if (diff.length) p.push(`สัญญาไม่ใช่เพิ่มล้วน: ${diff.slice(0, 4).join(" · ")}`);
      const off = getPath(head, "types.CreateSaleInput.offline");
      if (!isRecord(off) || off.optional !== true || !/ref/.test(String(off.type)) || !/soldAt/.test(String(off.type))) p.push(`CreateSaleInput.offline ${short(off, 80)}`);
    }
    const cb = createSaleCallers(BASE_REV);
    const ch = createSaleCallers(null);
    const cd = [...new Set([...Object.keys(cb), ...Object.keys(ch)])].filter((f) => (cb[f] ?? 0) !== (ch[f] ?? 0)).map((f) => `${f.replace("src/lib/", "")}:${cb[f] ?? 0}→${ch[f] ?? 0}`);
    if (!Object.keys(cb).length) p.push("นับผู้เรียกที่ฐานไม่ได้");
    if (cd.length) p.push(`ผู้เรียก createSale ต่าง: ${cd.join(", ")}`);
    // ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p3.4 ST2): ไฟล์ร้อนผ่านเมื่อตรงเงื่อนไขเดิมเทียบ BASE_REV หรือเทียบ SIB_REV (merge P3.5 S) — กฎเดิมทุกข้อ (outbox ตรงไบต์ · staff-pin บล็อก P3.4 เดียว + at · ไม่แก้นอกบล็อก · verifyStaffPin ไม่ถูกแตะ "นอกจากของ P3.5") ใช้ทั้งคู่ · ไม่ผ่านทั้งคู่ = รายงานปัญหาเทียบ BASE_REV
    const revsHot = [BASE_REV, ...(SIB_OK ? [SIB_REV] : []), ...(LANE_OK ? [LANE_REV] : [])]; // ORACLE-EDIT ผู้คุม 17.10 (CD-RP4)
    const firstOk = (fn: (rev: string) => string[]): string[] => {
      const r0 = fn(BASE_REV);
      if (!r0.length) return r0;
      for (const rv of revsHot.slice(1)) if (!fn(rv).length) return [];
      return r0;
    };
    p.push(...firstOk((rv) => {
      const ob = gitBuf(["show", `${rv}:${F.outbox}`]);
      const oh = ex(F.outbox) ? readFileSync(abs(F.outbox)) : null;
      return !ob || !oh || !ob.equals(oh) ? ["outbox-consumers.ts ไม่ตรงไบต์กับฐาน"] : [];
    }));
    p.push(...firstOk((rv) => {
      const q: string[] = [];
      const spB = showAt(rv, F.staffPin) ?? "";
      const spH = rd(F.staffPin);
      const sp = onlyMarked(spB, spH);
      if (sp.blocks !== 1) q.push(`staff-pin.ts บล็อก POS P3.4 ${sp.blocks} (คาด 1)`);
      if (sp.blocks && !/\bat\b/.test(sp.text)) q.push("บล็อก P3.4 ของ staff-pin.ts ไม่มีตัวเลือก at");
      if (sp.added.length) q.push(`staff-pin.ts แก้นอกบล็อก: ${sp.added.slice(0, 2).join(" | ")}`);
      if (sp.dropped > 3) q.push(`staff-pin.ts บรรทัดฐานหาย ${sp.dropped}`);
      const vb = fnBody(stripCode(spB), "verifyStaffPin");
      const vh = fnBody(stripCode(markedStrip(spH)), "verifyStaffPin");
      if (!vb || vb.replace(/\s+/g, "") !== vh.replace(/\s+/g, "")) q.push("verifyStaffPin ถูกแตะ (มติ 12)");
      return q;
    }));
    for (const f of [F.register, F.service]) {
      p.push(...firstOk((rv) => {
        const q: string[] = [];
        const r = onlyMarked(showAt(rv, f) ?? "", rd(f));
        if (r.blocks < 1) q.push(`${f.split("/").pop()} ไม่มีบล็อก POS P3.4`);
        if (r.added.length) q.push(`${f.split("/").pop()} แก้นอกบล็อก ${r.added.length}: ${r.added.slice(0, 2).join(" | ")}`);
        if (r.dropped > 8) q.push(`${f.split("/").pop()} บรรทัดฐานหาย ${r.dropped}`);
        return q;
      }));
    }
    chk("ST2", p.length === 0, "สัญญาเพิ่มล้วน + offline · ผู้เรียกเท่าเดิม · outbox ตรงไบต์ · staff-pin 1 บล็อก (at) · register/service ในบล็อก", joinP(p));
  });

  // ── ST3 ความบริสุทธิ์ ──
  await step("ST3", () => {
    const p: string[] = [];
    if (!ex(F.shared)) p.push(`${F.shared} ยังไม่มี`);
    else {
      const probs = purityProblems(F.shared);
      p.push(...probs.slice(0, 4));
      const code = srcOf(F.shared);
      if (/^\s*["']use (client|server)["']/.test(code)) p.push("offline-shared.ts มี directive (ต้องเป็นโมดูลกลางไม่มี directive)");
      if (/\bDate\.now\s*\(/.test(code) || /\bnew\s+Date\s*\(\s*\)/.test(code) || /\bMath\.random\s*\(/.test(code)) p.push("offline-shared.ts อ่านเวลา/สุ่มเอง (ต้องรับ now)");
      for (const fn of SHARED_FNS) if (!new RegExp(`export\\s+(async\\s+)?function\\s+${fn}\\b|export\\s+const\\s+${fn}\\b`).test(code)) p.push(`ไม่ export ${fn}`);
      SHARED_PURE = probs.length === 0;
    }
    if (!ex(F.facade)) p.push(`${F.facade} ยังไม่มี`);
    else {
      const fc = srcOf(F.facade);
      if (/^\s*["']use (client|server)["']/.test(fc)) p.push("offline-sync.ts มี directive use client/use server");
      for (const fn of FACADE_FNS) if (!new RegExp(`export\\s+async\\s+function\\s+${fn}\\b`).test(fc)) p.push(`offline-sync.ts ไม่ export async ${fn}`);
      if (/\bcreateSale\s*\(/.test(fc)) p.push("offline-sync.ts เรียก createSale ตรง (ต้องผ่าน submitRegisterSale)");
      if (!/\bsubmitRegisterSale\b/.test(fc)) p.push("offline-sync.ts ไม่ใช้ submitRegisterSale");
    }
    chk("ST3", p.length === 0, "offline-shared บริสุทธิ์ + export ครบ · facade export 5 · ผ่าน submitRegisterSale", joinP(p));
  });

  // ── ST4 ไม่มี service worker ──
  await step("ST4", () => {
    const p: string[] = [];
    const pub = walk("public", [], /\.(js|mjs)$/).filter((f) => /(^|[/_.-])(sw|service-?worker)([._-]|\.js$)/i.test(f.split("/").pop() ?? ""));
    if (pub.length) p.push(`public มี ${pub.join(",")}`);
    for (const f of walk("src", [], /\.(ts|tsx|js|mjs)$/)) {
      const c = srcOf(f);
      if (/navigator\s*\.\s*serviceWorker|serviceWorker\s*\.\s*register|\bcaches\s*\.\s*open\s*\(/.test(c)) p.push(`${f} ใช้ SW/Cache API`);
    }
    const nc = srcOf(F.nextConfig);
    if (/headers\s*\(/.test(nc) && /sw\.js|service-?worker/i.test(nc)) p.push("next.config.ts มี headers ของ sw");
    chk("ST4", p.length === 0, "ไม่มี SW/Cache API (มติ 9)", joinP(p, "ไม่มี"));
  });

  // ── ST5 REST op ──
  await step("ST5", () => {
    const p: string[] = [];
    const { ops, scopes } = parseOps();
    const op = ops.find((o) => o.id === "sync.sales");
    if (!op) p.push("ไม่มี op sync.sales");
    else {
      if (op.method !== "POST" || op.path !== "/sync/sales") p.push(`sync.sales ${op.method} ${op.path}`);
      if (op.action !== SCOPE_KEY) p.push(`sync.sales scope ${op.action}`);
      if (op.kind !== "write") p.push(`sync.sales kind ${op.kind}`);
    }
    if (ops.length !== OPS_TOTAL) p.push(`op ${ops.length} ตัว (คาด ${OPS_TOTAL})`);
    if (!Object.values(scopes).includes(SCOPE_KEY)) p.push(`POS_SCOPES ไม่มี ${SCOPE_KEY}`);
    if (!new RegExp(`["']${SCOPE_KEY.replace(/\./g, "\\.")}["']\\s*:`).test(srcOf(F.perms))) p.push(`core/permissions.ts ไม่มีคีย์ ${SCOPE_KEY}`);
    for (const f of [F.apiMd, F.endpointsMd]) if (!/POST\s+`?\/sync\/sales/.test(rd(f))) p.push(`${f} ไม่มี POST /sync/sales`);
    const g = spawnSync("pnpm", ["exec", "tsx", F.gen, "--check"], { cwd: ROOT, encoding: "utf8", timeout: 240_000, env: { ...process.env } });
    if (g.status !== 0) p.push(`gen-pos-api-docs --check exit ${g.status ?? "?"}: ${short((g.stdout || "") + (g.stderr || ""), 120).replace(/\s+/g, " ")}`);
    chk("ST5", p.length === 0, `sync.sales POST /sync/sales ${SCOPE_KEY} write · ${OPS_TOTAL} op · คีย์สิทธิ์ · เอกสาร · gen --check 0`, joinP(p));
  });

  // ── โหลด offline-shared (ต้องผ่านด่านบริสุทธิ์ก่อน — --no-db ห้ามลากถึง prisma) ──
  // P34_SHARED_PATH = ตัวควบคุมบวกของผู้เขียนข้อสอบ (โมดูลอ้างอิงนอกทรี · ไม่ใช่ทางของผู้สร้าง) — พิมพ์เตือนทุกครั้ง
  const ALT = process.env.P34_SHARED_PATH ?? "";
  if (ALT) console.log(`  ⚠️  P34_SHARED_PATH=${ALT} — ตรวจ Q/ST6/ST8 กับโมดูลอ้างอิง (self-test ของข้อสอบ ไม่ใช่ผลของใบ)`);
  if (SHARED_PURE || ALT) {
    try {
      sh = await import((ALT || "@/lib/modules/pos/offline-shared") as string);
    } catch (e) {
      console.log(`  (โหลด offline-shared ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    }
  }
  const SHARED_WHY = !ex(F.shared) ? `${F.shared} ยังไม่มี` : !SHARED_PURE ? "offline-shared ไม่ผ่าน ST3 (ไม่ import ใน --no-db)" : "โหลด offline-shared ไม่ได้";
  const fnOf = (n: string): Any => (sh && typeof sh[n] === "function" ? sh[n] : null);

  // ── ST6 ข้อความ ──
  await step("ST6", () => {
    const p: string[] = [];
    const th = readJson(rd(F.thPos));
    const en = readJson(rd(F.enPos));
    const keyOf = fnOf("offlineRefusalMessageKey");
    if (!keyOf) p.push(`${SHARED_WHY} — offlineRefusalMessageKey`);
    else {
      const keys = OFFLINE_CODES.map((c) => String(keyOf(c) ?? ""));
      if (new Set(keys).size !== keys.length) p.push(`คีย์ซ้ำ ${keys.join(",")}`);
      OFFLINE_CODES.forEach((c, i) => {
        const k = keys[i]!;
        const tv = getPath(th?.register, k);
        const ev = getPath(en?.register, k);
        if (!k || k === "errors.unknown") p.push(`${c} → ${k || "ว่าง"}`);
        else if (typeof tv !== "string" || !THAI.test(tv)) p.push(`th register.${k} ${short(tv, 30)}`);
        else if (typeof ev !== "string" || !ev.trim() || THAI.test(ev)) p.push(`en register.${k} ${short(ev, 30)}`);
      });
    }
    chk("ST6", p.length === 0, "6 รหัส → คีย์ต่างกัน · th ไทย · en ไม่มีไทย", joinP(p));
  });

  // ── ST7 แถว ui-inventory ของ testid ใหม่ ──
  await step("ST7", () => {
    const p: string[] = [];
    const inv = readJson(rd(F.inventory));
    const rows: Any[] = Array.isArray(inv?.rows) ? inv.rows : [];
    if (!rows.length) p.push("อ่าน pos-ui-inventory.json ไม่ได้");
    const re = /data-testid=(?:"([^"]*)"|\{`([^`]*)`\})/g;
    const tidsOf = (txt: string) => [...txt.matchAll(re)].map((m) => (m[1] ?? m[2] ?? "").replace(/\$\{[^}]*\}/g, "*")).filter((t) => /offline|sync/i.test(t));
    const baseTxt = (gitStr(["grep", "-h", "-o", "-E", "data-testid=(\"[^\"]*\"|\\{`[^`]*`\\})", BASE_REV, "--", "src"]) ?? "");
    const baseSet = new Set(tidsOf(baseTxt));
    const now = new Set<string>();
    for (const f of walk("src")) for (const t of tidsOf(rd(f))) now.add(t);
    const fresh = [...now].filter((t) => !baseSet.has(t));
    const covered = (t: string) => rows.some((r) => r?.testid === t || (typeof r?.testid === "string" && r.testid.endsWith("*") && t.startsWith(r.testid.slice(0, -1))));
    const miss = fresh.filter((t) => !covered(t));
    if (miss.length) p.push(`ไม่มีแถว: ${miss.join(",")}`);
    chk("ST7", p.length === 0, "testid ใหม่ offline|sync มีแถวครบ", miss.length ? joinP(p) : `ครบ (ใหม่ ${fresh.length})`);
  });

  // ── ST8 ธงปริยายปิด ──
  await step("ST8", () => {
    const p: string[] = [];
    const en = fnOf("posOfflineEnabled");
    if (!en) p.push(`${SHARED_WHY} — posOfflineEnabled`);
    else {
      const cases: [unknown, boolean][] = [[{}, false], [null, false], [undefined, false], [{ pos: {} }, false], [{ pos: { offline: { enabled: "true" } } }, false], [{ pos: { offline: { enabled: 1 } } }, false], [{ pos: { offline: { enabled: false } } }, false], [{ pos: { offline: { enabled: true } } }, true]];
      for (const [v, want] of cases) if (en(v) !== want) p.push(`posOfflineEnabled(${short(v, 50)}) = ${en(v)}`);
    }
    for (const f of [F.thPos, F.enPos]) {
      const b = getPath(readJson(showAt(BASE_REV, f)), "register.status.offlineBanner");
      const h = getPath(readJson(rd(f)), "register.status.offlineBanner");
      if (typeof b !== "string" || b !== h) p.push(`${f.split("/")[2]} register.status.offlineBanner เปลี่ยน`);
    }
    chk("ST8", p.length === 0, "ปริยาย false · true เฉพาะ enabled:true · แบนเนอร์เดิม", joinP(p));
  });

  // ═════════════ Q คิวบริสุทธิ์ ═════════════
  console.log(`\n── Q คิวบริสุทธิ์ (offline-shared · ไม่แตะ DB) ──`);
  const need = (names: string[]): string | null => {
    const miss = names.filter((n) => !fnOf(n));
    return miss.length ? `${SHARED_WHY} — ไม่มี ${miss.join(",")}` : null;
  };
  await step("Q1", () => {
    const why = need(["offlineRef", "parseOfflineRef", "nextOfflineSeq"]);
    if (why) return void chk("Q1", false, "ฟังก์ชันครบ", why);
    const p: string[] = [];
    for (const [c, s, w] of [["C1", 7, "OFF-C1-0007"], ["C12", 10000, "OFF-C12-10000"], ["C3", 1, "OFF-C3-0001"], ["C9", 123, "OFF-C9-0123"]] as const) {
      const r = sh.offlineRef(c, s);
      if (r !== w) p.push(`offlineRef(${c},${s}) = ${short(r, 30)}`);
      const back = sh.parseOfflineRef(w);
      if (!isRecord(back) || back.code !== c || back.seq !== s) p.push(`parse(${w}) = ${short(back, 40)}`);
    }
    for (const [c, s] of [["c1", 1], ["C1", 0], ["C1", -1], ["C1", 1.5], ["", 1], ["C1-", 1], ["X;1", 2], ["C1", Number.NaN]] as [string, number][]) {
      const r = sh.offlineRef(c, s);
      if (r !== null) p.push(`offlineRef(${JSON.stringify(c)},${s}) = ${short(r, 30)} (คาด null)`);
    }
    for (const bad of ["OFF-C1-007", "OFF-C1-0000", "off-C1-0001", "OFF--0001", "OFF-C1-0001x", 42, null]) if (sh.parseOfflineRef(bad) !== null) p.push(`parse(${short(bad, 20)}) ไม่ใช่ null`);
    for (const [a, b, w] of [[3, 7, 8], [9, 2, 10], [0, 0, 1], [-5, Number.NaN, 1]] as const) if (sh.nextOfflineSeq(a, b) !== w) p.push(`nextOfflineSeq(${a},${b}) = ${sh.nextOfflineSeq(a, b)}`);
    let local = 0;
    const seqs: number[] = [];
    for (const floor of [0, 0, 5, 5, 2, 9, 0]) {
      const s = sh.nextOfflineSeq(local, floor);
      if (!(s > local && s > floor)) p.push(`จอง ${s} ไม่เกิน local ${local}/server ${floor}`);
      seqs.push(s);
      local = s;
    }
    if (seqs.some((s, i) => i > 0 && s <= seqs[i - 1]!)) p.push(`ไม่เพิ่มขึ้น ${seqs.join(",")}`);
    chk("Q1", p.length === 0, "รูปแบบ OFF-<code>-<seq 4+> · parse · null · max+1", joinP(p, seqs.join(",")));
  });
  await step("Q2", () => {
    const why = need(["offlineSaleRefusal"]);
    if (why) return void chk("Q2", false, "ฟังก์ชันครบ", why);
    const p: string[] = [];
    const ln = [{ productId: "p1", qty: 1 }];
    const base = (o: Any = {}): Any => ({ lines: ln, payMethods: [{ type: "CASH", amountSatang: 1000 }], cashReceivedSatang: 1000, expectedGrandTotalSatang: 1000, ...o });
    const ok: [string, Any][] = [
      ["เงินสด", base()],
      ["โอน", base({ payMethods: [{ type: "TRANSFER", amountSatang: 1000, reference: "KBANK123" }], cashReceivedSatang: undefined })],
      ["โอนไม่มีอ้างอิง", base({ payMethods: [{ type: "TRANSFER", amountSatang: 1000 }], cashReceivedSatang: undefined })],
      ["เงินสด+โอน", base({ payMethods: [{ type: "CASH", amountSatang: 400 }, { type: "TRANSFER", amountSatang: 600 }], cashReceivedSatang: 500 })],
      ["ส่วนลดท้ายบิล", base({ billDiscount: { type: "AMOUNT", value: 100 }, expectedGrandTotalSatang: 900, payMethods: [{ type: "CASH", amountSatang: 900 }] })],
    ];
    for (const [k, s] of ok) if (sh.offlineSaleRefusal(s) !== null) p.push(`${k} ถูกปฏิเสธ ${short(sh.offlineSaleRefusal(s), 50)}`);
    const bad: [string, Any][] = [
      ...["PROMPTPAY", "CARD", "GIFT_CARD", "STORE_CREDIT", "DEPOSIT", "PLATFORM"].map((t): [string, Any] => [t, base({ payMethods: [{ type: t, amountSatang: 1000 }], cashReceivedSatang: undefined })]),
      ["memberId", base({ memberId: "m1" })],
      ["couponCode", base({ couponCode: "SAVE10" })],
      ["memberChoices", base({ memberChoices: { points: 10 } })],
      ["tableSessionId", base({ tableSessionId: "ts1", lines: [] })],
      ["tableSplitPartId", base({ tableSplitPartId: "sp1", lines: [] })],
      ["heldCartId", base({ heldCartId: "h1" })],
      ["channelId", base({ channelId: "ch1" })],
      ["เงินสด+พร้อมเพย์", base({ payMethods: [{ type: "CASH", amountSatang: 500 }, { type: "PROMPTPAY", amountSatang: 500 }], cashReceivedSatang: 500 })],
    ];
    for (const [k, s] of bad) {
      const r = sh.offlineSaleRefusal(s);
      if (!isRecord(r) || r.code !== "VALIDATION") p.push(`${k} → ${short(r, 40)}`);
    }
    const t = sh.OFFLINE_TENDERS;
    if (!Array.isArray(t) || t.join(",") !== "CASH,TRANSFER") p.push(`OFFLINE_TENDERS ${short(t, 40)}`);
    chk("Q2", p.length === 0, "อนุญาต 5 · ปฏิเสธ 14 เป็น VALIDATION · OFFLINE_TENDERS", joinP(p));
  });
  await step("Q3", async () => {
    const why = need(["offlineCartTotals"]);
    if (why) return void chk("Q3", false, "ฟังก์ชันครบ", why);
    const pc = (await import("@/lib/modules/pos/pricing-shared" as string)) as Any;
    const sc = (await import("@/lib/modules/pos/scan-shared" as string)) as Any;
    const p: string[] = [];
    const prod = (id: string, priceSatang: number, o: Any = {}): Any => ({
      id, invItemId: null, name: `สินค้า ${id}`, nameEn: null, kind: "PRODUCT", categoryId: null, priceSatang, sku: null, barcode: null, imageUrl: null,
      optionGroupCount: (o.choices ?? []).length ? 1 : 0, requiredOptionGroupCount: 0, parentId: null, variantCount: 0, soldByWeight: !!o.soldByWeight,
      soldOut: false, soldOutReason: null, stockLeft: null, trackStock: false, trackStockMode: "auto", listPriceSatang: priceSatang, priceSource: "BASE", priceRule: null, notSold: false,
      choices: o.choices ?? [],
    });
    const SNAP: Any = {
      hash: "h-q3", issuedAt: "2026-10-16T00:00:00.000Z", priceValidUntil: null, offlineCode: "C1", offlineSeq: 0, vat: { mode: "INCLUDED", rateBp: 700 }, serviceChargeBp: 0,
      products: [
        prod("pA", 6500, { choices: [{ choiceId: "c1", groupId: "g1", name: "เพิ่มช็อต", priceDeltaSatang: 1500 }, { choiceId: "c2", groupId: "g1", name: "หวานน้อย", priceDeltaSatang: 0 }, { choiceId: "c3", groupId: "g2", name: "ไข่", priceDeltaSatang: 1000 }] }),
        prod("pB", 1000),
        prod("pW", 40000, { soldByWeight: true }),
        prod("pZ", 0),
        prod("pC", 3333),
      ],
    };
    const byId = new Map<string, Any>(SNAP.products.map((x: Any) => [x.id, x]));
    const expect = (snap: Any, cart: Any): Any =>
      pc.priceCart({
        lines: cart.lines.map((l: Any) => {
          const pr = byId.get(l.productId);
          const deltas = (l.options ?? []).map((o: Any) => pr.choices.find((c: Any) => c.choiceId === o.choiceId)?.priceDeltaSatang ?? 0);
          const unit = pr.soldByWeight ? sc.weighedPriceSatang(l.weightGrams, pr.priceSatang) : pr.priceSatang;
          return { qty: l.qty, unitPriceSatang: unit, optionDeltasSatang: deltas, discount: l.discount ?? null };
        }),
        billDiscount: cart.billDiscount ?? null,
        vat: snap.vat,
        serviceChargeBp: snap.serviceChargeBp,
      });
    const NONE = { ...SNAP, vat: { mode: "NONE", rateBp: 0 } };
    const SVC = { ...SNAP, serviceChargeBp: 1000 };
    const carts: [string, Any, Any][] = [
      ["1 ชิ้น", SNAP, { lines: [{ productId: "pB", qty: 1 }] }],
      ["qty 3", SNAP, { lines: [{ productId: "pC", qty: 3 }] }],
      ["ตัวเลือก", SNAP, { lines: [{ productId: "pA", qty: 2, options: [{ choiceId: "c1" }, { choiceId: "c3" }] }] }],
      ["ชั่ง 1,250 ก.", SNAP, { lines: [{ productId: "pW", qty: 1, weightGrams: 1250 }] }],
      ["ส่วนลดบรรทัดบาท", SNAP, { lines: [{ productId: "pC", qty: 2, discount: { type: "AMOUNT", value: 500 } }] }],
      ["ส่วนลดบรรทัด %", SNAP, { lines: [{ productId: "pC", qty: 3, discount: { type: "PERCENT", value: 1250 } }] }],
      ["ท้ายบิล %", SNAP, { lines: [{ productId: "pB", qty: 1 }, { productId: "pC", qty: 1 }], billDiscount: { type: "PERCENT", value: 1000 } }],
      ["ท้ายบิลบาท", SNAP, { lines: [{ productId: "pA", qty: 1, options: [{ choiceId: "c2" }] }], billDiscount: { type: "AMOUNT", value: 700 } }],
      ["ค่าบริการ 10%", SVC, { lines: [{ productId: "pC", qty: 1 }, { productId: "pB", qty: 2 }] }],
      ["VAT NONE", NONE, { lines: [{ productId: "pC", qty: 2 }] }],
      ["ผสม", SVC, { lines: [{ productId: "pA", qty: 1, options: [{ choiceId: "c1" }], discount: { type: "PERCENT", value: 500 } }, { productId: "pW", qty: 1, weightGrams: 333 }, { productId: "pB", qty: 4 }], billDiscount: { type: "AMOUNT", value: 1234 } }],
      ["ราคา 0", SNAP, { lines: [{ productId: "pZ", qty: 2 }, { productId: "pB", qty: 1 }] }],
    ];
    const KEYS = ["subtotalSatang", "lineDiscountSatang", "billDiscountSatang", "serviceChargeSatang", "vatSatang", "grandTotalSatang"];
    for (const [k, snap, cart] of carts) {
      const want = expect(snap, cart);
      const got = sh.offlineCartTotals(snap, cart);
      if (!want?.ok) p.push(`${k}: ตัวคาด ok:false ${want?.code}`);
      else if (!got?.ok || KEYS.some((x) => got[x] !== want[x])) p.push(`${k}: ${short(got?.ok ? KEYS.map((x) => got[x]).join("/") : got, 60)} ≠ ${KEYS.map((x) => want[x]).join("/")}`);
    }
    const unk = sh.offlineCartTotals(SNAP, { lines: [{ productId: "nope", qty: 1 }] });
    if (unk?.ok !== false) p.push(`สินค้าไม่อยู่ใน snapshot → ${short(unk, 40)}`);
    const foreign = sh.offlineCartTotals(SNAP, { lines: [{ productId: "pB", qty: 1, options: [{ choiceId: "c1" }] }] });
    if (foreign?.ok !== false) p.push(`ตัวเลือกของสินค้าอื่น → ${short(foreign, 40)}`);
    chk("Q3", p.length === 0, "12/12 ตรง priceCart · ปฏิเสธ 2", joinP(p, "12/12"));
  });
  await step("Q4", () => {
    const why = need(["offlineBatches"]);
    if (why) return void chk("Q4", false, "ฟังก์ชันครบ", why);
    const p: string[] = [];
    const it = (t: string, seq: number) => ({ soldAt: t, offlineRef: `OFF-C1-${String(seq).padStart(4, "0")}` });
    const items = [it("2026-10-16T03:00:00.000Z", 5), it("2026-10-16T01:00:00.000Z", 9), it("2026-10-16T03:00:00.000Z", 2), it("2026-10-16T02:00:00.000Z", 12), it("2026-10-16T01:00:00.000Z", 10000), it("2026-10-16T03:00:00.000Z", 11)];
    const out = sh.offlineBatches(items);
    const flat = Array.isArray(out) ? out.flat().map((x: Any) => x.offlineRef) : [];
    const want = ["OFF-C1-0009", "OFF-C1-10000", "OFF-C1-0012", "OFF-C1-0002", "OFF-C1-0005", "OFF-C1-0011"];
    if (flat.join(",") !== want.join(",")) p.push(`ลำดับ ${flat.join(",")}`);
    if (JSON.stringify(items.map((x) => x.offlineRef)) !== JSON.stringify(["OFF-C1-0005", "OFF-C1-0009", "OFF-C1-0002", "OFF-C1-0012", "OFF-C1-10000", "OFF-C1-0011"])) p.push("แก้ array ที่ส่งเข้า");
    const many = Array.from({ length: 120 }, (_, i) => it(new Date(Date.UTC(2026, 9, 16, 0, i)).toISOString(), i + 1));
    const b = sh.offlineBatches(many);
    if (!Array.isArray(b) || b.map((x: Any[]) => x.length).join("/") !== "50/50/20") p.push(`120 → ${Array.isArray(b) ? b.map((x: Any[]) => x.length).join("/") : short(b, 30)}`);
    const big = sh.offlineBatches(many, 80);
    if (!Array.isArray(big) || big[0]?.length !== 50) p.push(`size 80 → ชุดแรก ${big?.[0]?.length}`);
    if (sh.OFFLINE_SYNC_BATCH_MAX !== 50) p.push(`OFFLINE_SYNC_BATCH_MAX ${sh.OFFLINE_SYNC_BATCH_MAX}`);
    chk("Q4", p.length === 0, "(soldAt, seq) · 50/50/20 · บีบ 50", joinP(p));
  });
  await step("Q5", () => {
    const why = need(["classifyOfflineResult"]);
    if (why) return void chk("Q5", false, "ฟังก์ชันครบ", why);
    const p: string[] = [];
    const cases: [Any, string][] = [[{ offlineRef: "OFF-C1-0001", status: "OK", saleId: "s" }, "remove"], [{ offlineRef: "x", status: "DUPLICATE", saleId: "s" }, "remove"], [{ offlineRef: "x", status: "REJECTED", reason: "PRICE_MISMATCH" }, "park"], [null, "keep"], [undefined, "keep"], [{ status: "WHAT" }, "keep"], [{}, "keep"]];
    for (const [r, w] of cases) if (sh.classifyOfflineResult(r) !== w) p.push(`${short(r, 40)} → ${sh.classifyOfflineResult(r)}`);
    chk("Q5", p.length === 0, "remove/remove/park/keep×4", joinP(p));
  });
  await step("Q6", () => {
    const why = need(["offlineSellGate"]);
    if (why) return void chk("Q6", false, "ฟังก์ชันครบ", why);
    const p: string[] = [];
    const NOW = Date.UTC(2026, 9, 16, 5, 0, 0);
    const H = 3_600_000;
    const M = 60_000;
    const g = (o: Any = {}): Any => sh.offlineSellGate({ enabled: true, deviceActive: true, snapshotIssuedAt: new Date(NOW - H).toISOString(), priceValidUntil: null, queueLength: 0, now: NOW, ...o });
    const okCases: [string, Any][] = [
      ["ปกติ", {}],
      ["อายุ 23:59", { snapshotIssuedAt: new Date(NOW - 24 * H + M).toISOString() }],
      ["เลย priceValidUntil 14 นาที", { priceValidUntil: new Date(NOW - 14 * M).toISOString() }],
      ["คิว 299", { queueLength: 299 }],
      ["now เป็น Date", { now: new Date(NOW) }],
    ];
    const noCases: [string, Any][] = [
      ["ปิดธง", { enabled: false }],
      ["เครื่องไม่ ACTIVE", { deviceActive: false }],
      ["ไม่มี snapshot", { snapshotIssuedAt: null }],
      ["อายุ 24:00:01", { snapshotIssuedAt: new Date(NOW - 24 * H - 1000).toISOString() }],
      ["เลย priceValidUntil 15 นาที + 1 วิ", { priceValidUntil: new Date(NOW - 15 * M - 1000).toISOString() }],
      ["คิว 300", { queueLength: 300 }],
    ];
    for (const [k, o] of okCases) if (g(o)?.ok !== true) p.push(`${k} → ${short(g(o), 50)}`);
    for (const [k, o] of noCases) {
      const r = g(o);
      if (r?.ok !== false || typeof r?.reason !== "string" || !r.reason) p.push(`${k} → ${short(r, 50)}`);
    }
    const consts: [string, number][] = [["OFFLINE_MAX_AGE_MS", 86_400_000], ["OFFLINE_MAX_BILLS", 300], ["OFFLINE_PRICE_GRACE_MS", 900_000], ["OFFLINE_CLOCK_SKEW_MS", 120_000], ["OFFLINE_SHIFT_SLACK_MS", 300_000]];
    for (const [k, v] of consts) if (sh[k] !== v) p.push(`${k} = ${sh[k]}`);
    const codes = sh.OFFLINE_REFUSAL_CODES;
    if (!Array.isArray(codes) || OFFLINE_CODES.some((c) => !codes.includes(c))) p.push(`OFFLINE_REFUSAL_CODES ${short(codes, 80)}`);
    chk("Q6", p.length === 0, "ขายได้ 5 · หยุด 6 (มี reason) · ค่าคงที่ 5 · รหัส 6", joinP(p));
  });
  await step("Q7", async () => {
    const why = need(["offlineSlipPayload"]);
    if (why) return void chk("Q7", false, "ฟังก์ชันครบ", why);
    const rr = (await import("@/lib/modules/pos/receipt-render" as string)) as Any;
    const p: string[] = [];
    const input = {
      offlineRef: "OFF-C1-0007",
      soldAt: "2026-10-16T03:42:00.000Z",
      shop: { name: "ร้านกาแฟคิวซี", branchName: "สาขาสีลม", address: "1 ถนนสีลม", phone: "020000000", taxId: "0105561177639", branchNo: "00000" },
      cashierName: "แคชเชียร์",
      lines: [{ name: "อเมริกาโน่เย็น", qty: 2, unitPriceSatang: 6500, discountSatang: 0, lineTotalSatang: 13000 }, { name: "ครัวซองต์", qty: 1, unitPriceSatang: 5500, discountSatang: 500, lineTotalSatang: 5000 }],
      totals: { ok: true, subtotalSatang: 18500, lineDiscountSatang: 500, billDiscountSatang: 0, couponDiscountSatang: 0, netSatang: 18000, serviceChargeSatang: 0, vatSatang: 1178, grandTotalSatang: 18000, vatMode: "INCLUDED", vatRateBp: 700, lines: [] },
      payments: [{ type: "CASH", amountSatang: 18000, tenderedSatang: 20000, changeSatang: 2000 }],
      printLocale: "th",
    };
    const slip = sh.offlineSlipPayload(input);
    if (!isRecord(slip)) p.push(`ผล ${short(slip, 40)}`);
    else {
      if (slip.kind !== "RECEIPT") p.push(`kind ${slip.kind}`);
      if (slip.doc?.receiptNo !== "OFF-C1-0007") p.push(`doc.receiptNo ${slip.doc?.receiptNo}`);
      if (slip.footer?.qrEReceiptUrl !== null) p.push(`qrEReceiptUrl ${short(slip.footer?.qrEReceiptUrl, 30)}`);
      if (slip.totals?.grandTotalSatang !== 18000) p.push(`grandTotal ${slip.totals?.grandTotalSatang}`);
      if (JSON.stringify(slip).includes("/r/")) p.push("payload มี /r/");
      try {
        const th = String(rr.renderReceiptHtml(slip, { paper: "80", locale: "th" }));
        const en = String(rr.renderReceiptHtml(slip, { paper: "80", locale: "en" }));
        if (!th.includes("ใบรับเงินชั่วคราว") || !th.includes("รอออกเลขจริง")) p.push("HTML th ไม่มีหัว ใบรับเงินชั่วคราว — รอออกเลขจริง");
        if (th.includes("ใบกำกับภาษีอย่างย่อ")) p.push("HTML th มี ใบกำกับภาษีอย่างย่อ");
        if (th.includes("/r/") || en.includes("/r/")) p.push("HTML มี /r/");
        const enText = en.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
        const shopTh = [input.shop.name, input.shop.branchName, input.shop.address, input.cashierName, ...input.lines.map((l) => l.name)];
        let rest = enText;
        for (const s of shopTh) rest = rest.split(s).join(" ");
        if (THAI.test(rest)) p.push(`HTML en มีอักษรไทยนอกข้อมูลร้าน/สินค้า: ${short((/[ก-๛][^<]{0,20}/.exec(rest) ?? [""])[0], 30)}`);
        if (!/OFF-C1-0007/.test(th)) p.push("HTML ไม่มีเลข OFF");
      } catch (e) {
        p.push(`renderReceiptHtml: ${(e as Error).message.slice(0, 60)}`);
      }
    }
    chk("Q7", p.length === 0, "RECEIPT · OFF · ไม่มี QR · หัวใบรับเงินชั่วคราว — รอออกเลขจริง · ไม่ใช่ ABB", joinP(p));
  });
}

if (NODB) {
  try {
    await runStatic();
  } catch (e) {
    console.log(`💥 harness: ${(e as Error)?.stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
  for (const id of [...STATIC_IDS, ...Q_IDS]) if (!results.has(id)) chk(id, false, "ถูกตรวจ", "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, base: BASE_REV, missing: skipReasons })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
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

// ═════════════════════════ 3. ด่าน SKIP + ลายนิ้วมือ ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const TMP_LIKE = "posqc-p34-%";
const NOT_TMP = `NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE '${TMP_LIKE}'))`;
/** ลายนิ้วมือนอกร้านชั่วคราว — คอลัมน์/ตารางที่ยังไม่มี = "absent" (ก่อน/หลังเท่ากัน) · อ่านคอลัมน์ใหม่ผ่าน to_jsonb (ไม่พังก่อน migration) */
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const q = async (k: string, sql: string, ...args: unknown[]) => {
    try {
      const r = (await P.$queryRawUnsafe(sql, ...args)) as Any[];
      out[k] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      const m = (e as Error).message;
      out[k] = /does not exist|42P01/.test(m) ? "absent" : `err:${m.slice(0, 30)}`;
    }
  };
  await q("PosSale", `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || x.status::text || ':' || coalesce(to_jsonb(x)->>'offlineRef',''), ',' ORDER BY x.id)), '-') AS h FROM "PosSale" x WHERE ${NOT_TMP}`);
  await q("PosReceiptCounter", `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || x.seq::text, ',' ORDER BY x.id)), '-') AS h FROM "PosReceiptCounter" x WHERE ${NOT_TMP}`);
  await q("PosDevice", `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || x.status::text || ':' || coalesce(x."revokedAt"::text,'') || ':' || coalesce(to_jsonb(x)->>'offlineSeq','') || ':' || coalesce(to_jsonb(x)->>'offlineCode',''), ',' ORDER BY x.id)), '-') AS h FROM "PosDevice" x WHERE ${NOT_TMP}`);
  await q("PosOfflineSale", `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || x.status, ',' ORDER BY x.id)), '-') AS h FROM "PosOfflineSale" x WHERE ${NOT_TMP}`);
  await q("PosOfflineSnapshot", `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id, ',' ORDER BY x.id)), '-') AS h FROM "PosOfflineSnapshot" x WHERE ${NOT_TMP}`);
  await q("AuditOffline", `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id, ',' ORDER BY x.id)), '-') AS h FROM "AuditLog" x WHERE x.action LIKE 'pos.sale.offline%' AND (x."tenantId" IS NULL OR ${NOT_TMP})`);
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P3.4 S ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · Z เขียว)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  return m ? m[1]! : "THROW";
}
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `ยังไม่มีโมดูล/ฟังก์ชัน — ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : "UNKNOWN");
const offMod = ex(F.facade) ? await tryImport("@/lib/modules/pos/offline-sync") : null;
const route = ex(F.restRoute) ? await tryImport("@/app/api/v1/pos/[...path]/route") : null;
const oaRoute = ex(F.openapiRoute) ? await tryImport("@/app/api/v1/pos/openapi.json/route") : null;
const regMod = await tryImport("@/lib/modules/pos/api/registry");
const akSvc = await tryImport("@/lib/api-keys/service");
const scopesMod = await tryImport("@/lib/api-keys/scopes");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const invSvc = await tryImport("@/lib/modules/inventory/service");
const catalog = await tryImport("@/lib/modules/pos/catalog");
const regFacade = await tryImport("@/lib/modules/pos/register");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const staffMod = await tryImport("@/lib/modules/pos/staff-pin");
const ruleMod = await tryImport("@/lib/modules/pos/price-rule");
const kdsMod = await tryImport("@/lib/modules/pos/kds");
const menu = await tryImport("@/lib/modules/restaurant/menu");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p34-${RAND}`;
const T_SLUG = `posqc-p34-${RAND}`;
const T2_SLUG = `${T_SLUG}-t2`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";
const keyIds: string[] = [];

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
async function drain(n = 2): Promise<void> {
  for (let i = 0; i < n; i++) {
    try {
      if (typeof consMod?.drainAll === "function") await consMod.drainAll();
    } catch (e) {
      console.log(`  (drainAll ล้ม: ${(e as Error).message.slice(0, 100)})`);
    }
  }
}
// ── เรียก route REST ในโปรเซส (แบบ qc-pos-p2.13) ──
type Res = { status: number; body: Any; headers: Headers; text: string };
let idemN = 0;
const freshIdem = () => `p34-${RAND}-${++idemN}`;
async function api(method: string, path: string, key: string | null, opts: { body?: unknown; idem?: string | false } = {}): Promise<Res> {
  const fn = route?.[method];
  if (typeof fn !== "function") return { status: 0, body: { error: { code: "ROUTE_MISSING" } }, headers: new Headers(), text: "route ยังไม่มี" };
  const headers: Record<string, string> = { ...(key ? { authorization: `Bearer ${key}` } : {}) };
  if (method !== "GET" && opts.idem !== false) headers["idempotency-key"] = opts.idem ?? freshIdem();
  let b: string | undefined;
  if (opts.body !== undefined) {
    b = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  try {
    const res: Response = await fn(new Request(`http://x/api/v1/pos${path}`, { method, headers, body: b }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
    const text = await res.text();
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
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (isRecord(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "undefined";
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
const H = 3_600_000;
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
/** YYYYMM ตามเวลาไทยของ ms */
const bkkYm = (ms: number) => new Date(ms + 7 * H).toISOString().slice(0, 7).replace("-", "");
const offRef = (code: string, seq: number) => `OFF-${code}-${String(seq).padStart(4, "0")}`;
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} ──`);
  let fx = "";
  const notes: string[] = [];
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean> }> = {};
  const PR: Record<string, string> = {};
  const INV: Record<string, string> = {};
  const CHO: Record<string, string> = {};
  const fstep = async <R,>(label: string, fn: () => Promise<R> | R): Promise<R | null> => {
    try {
      return await fn();
    } catch (e) {
      const m = `${label}: ${String((e as Error)?.message ?? e).slice(0, 140)}`;
      notes.push(m);
      console.log(`  ⚠️  fixture ${m}`);
      return null;
    }
  };
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    return r;
  };
  const T0 = Date.now();
  try {
    T = (await P.tenant.create({ data: { name: `QC P3.4 ออฟไลน์ ${RAND}`, slug: T_SLUG, limits: { posDevices: 30 } } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P3.4 ร้านอื่น ${RAND}`, slug: T2_SLUG, limits: { posDevices: 5 } } })).id;
    U.A = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาA`, slug: `${T_SLUG}-a` } })).id;
    U.B = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาB`, slug: `${T_SLUG}-b` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "SHOP", name: `${TAG} สาขาX`, slug: `${T2_SLUG}-x` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
    S.INV = (await sysSvc.createSystem(T, "INVENTORY", `คลัง ${RAND}`)).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี ${RAND}`)).id;
    S.POSX = (await sysSvc.createSystem(T2, "POS", `POS T2 ${RAND}`)).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: `ร้านออฟไลน์คิวซี ${RAND} จำกัด`, taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.POS, U.B);
    await sysSvc.linkUnit(T, S.INV, U.A);
    await sysSvc.linkUnit(T2, S.POSX, U.X);
    for (const sid of [S.POS, S.POSX]) {
      const s0 = (await P.appSystem.findUnique({ where: { id: sid }, select: { settings: true } }))?.settings ?? {};
      const pos0 = isRecord(s0.pos) ? s0.pos : {};
      await P.appSystem.update({ where: { id: sid }, data: { settings: { ...s0, pos: { ...pos0, offline: { enabled: true } } } } });
    }
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  if (!fx) {
    try {
      for (const [k, tid, role, ua, perms] of [
        ["OWNER", T, "OWNER", ["*"], {}],
        ["CASH", T, "STAFF", [U.A!], { "pos.sale.create": true, "pos.shift.operate": true }],
        ["CASH2", T, "STAFF", [U.A!], { "pos.sale.create": true, "pos.shift.operate": true }],
        ["NOPERM", T, "STAFF", [U.A!], {}],
        ["CASHB", T, "STAFF", [U.B!], { "pos.sale.create": true }],
        ["OWNER2", T2, "OWNER", ["*"], {}],
      ] as const) {
        const u = await P.user.create({ data: { email: `${T_SLUG}-${k.toLowerCase()}@qc.invalid`, name: `${k} คิวซี${RAND}` } });
        await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess: [...ua], permissions: perms, acceptedAt: new Date() } });
        US[k] = { id: u.id, role, unitAccess: [...ua], perms: { ...perms } };
      }
    } catch (e) {
      fx = `ผู้ใช้:${(e as Error).message.slice(0, 140)}`;
    }
  }
  const FXB = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const cc = (k = "OWNER"): Any => ({ tenantId: T, systemId: S.POS ?? "none", actorUserId: uid(k) });
  const ctxU = (u: string, dev?: string): Any => ({ tenantId: u === "X" ? T2 : T, systemId: (u === "X" ? S.POSX : S.POS) ?? "none", unitId: U[u] ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const invCtx = (): Any => ({ tenantId: T, systemId: S.INV ?? "none", actorUserId: uid("OWNER") });
  let keyN = 0;
  const newKey = (pfx = "k") => `p34${RAND}${pfx}${++keyN}`;

  // ─── สินค้า ───
  const rowOf = async (invId: string): Promise<string> => String((await P.posProduct.findFirst({ where: { tenantId: T, systemId: S.POS, invItemId: invId }, select: { id: true } }).catch(() => null))?.id ?? "");
  let STATION = "";
  if (!fx) {
    await fstep("สินค้า", async () => {
      const mkInv = async (key: string, name: string, qty: number, cost: number, price: number) => {
        const it = await invSvc.createItem(invCtx(), { sku: `${TAG}-${key}`, name: `${name} ${RAND}`, unitLabel: "ชิ้น", costSatang: cost });
        INV[key] = it.id;
        if (qty > 0) await invSvc.receive(invCtx(), { itemId: it.id, qty, costSatang: cost, idempotencyKey: `${TAG}-recv-${key}` });
        PR[key] = await rowOf(it.id);
        if (!PR[key]) throw new Error(`${key} ไม่มีแถว PosProduct`);
        must(`setPrice ${key}`, await call(catalog, "setPrice", cc(), PR[key], price));
      };
      await mkInv("water", "น้ำเปล่า", 200, 400, 1000);
      await mkInv("cookie", "คุกกี้", 2, 1500, 3500);
      await mkInv("kitchen", "ขนมเข้าครัว", 50, 800, 2500);
      const grp = must("createOptionGroup", await call(catalog, "createOptionGroup", cc(), { unitId: U.A, name: `ช็อต ${RAND}`, minSelect: 0, maxSelect: 1, choices: [{ name: "หวานน้อย", priceDelta: 0 }, { name: "เพิ่มช็อต", priceDelta: 1500 }] }));
      for (const c of (await P.menuOptionChoice.findMany({ where: { tenantId: T, groupId: grp.id } })) as Any[]) CHO[c.name === "เพิ่มช็อต" ? "shot" : "less"] = c.id;
      PR.latte = String(must("createProduct ลาเต้", await call(catalog, "createProduct", cc(), { name: `ลาเต้ ${RAND}`, kind: "MENU", basePriceSatang: 6500 }))?.id ?? "");
      must("optionGroups ลาเต้", await call(catalog, "setProductOptionGroups", cc(), PR.latte, [grp.id]));
      for (const [k, nm, pr] of [["cake", "เค้ก", 4500], ["tea", "ชาเขียว", 5000], ["gum", "หมากฝรั่ง", 1500]] as const) PR[k] = String(must(`createProduct ${k}`, await call(catalog, "createProduct", cc(), { name: `${nm} ${RAND}`, kind: "PRODUCT", basePriceSatang: pr }))?.id ?? "");
      must("createStation", await menu.createStation(T, U.A, `ครัว ${RAND}`));
      STATION = String(((await menu.listStations(T, U.A)) as Any[])[0]?.id ?? "");
      if (!STATION) throw new Error("ไม่มีสถานีครัว");
      const up = await call(catalog, "updateProduct", cc(), PR.kitchen, { stationId: STATION });
      if (up?.ok === false) throw new Error(`updateProduct stationId ${codeOf(up)}`);
      // happy hour ของชาเขียว: [T0−3h, T0−1h) ราคา 3000
      must("savePriceRule", await call(ruleMod, "savePriceRule", ctxU("A"), A("OWNER"), { name: `แฮปปี้ ${RAND}`, kind: "PROMO", active: true, priority: 0, productIds: [PR.tea], categoryIds: [], channelCodes: [], unitIds: [], adjust: "PRICE", valueSatang: 3000, startsAt: iso(T0 - 3 * H), endsAt: iso(T0 - 1 * H), weekdays: [], timeFrom: null, timeTo: null }));
    });
  }
  // ─── เครื่อง + กะ ───
  const DEV: Record<string, string> = {};
  const DEVID: Record<string, string> = {};
  const SH: Record<string, string> = {};
  for (const k of ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "DR"]) DEV[k] = `p34${RAND}${k.toLowerCase()}dev`;
  DEV.DB = `p34${RAND}dbdev`;
  DEV.DX = `p34${RAND}dxdev`;
  DEV.GHOST = `p34${RAND}ghostdev`;
  if (!fx) {
    await fstep("เครื่อง/กะ", async () => {
      for (const k of ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "DR"]) {
        const r = must(`registerDevice ${k}`, await call(devMod, "registerDevice", ctxU("A"), A("OWNER"), { name: `เครื่อง ${k} ${RAND}`, deviceCode: DEV[k] }));
        DEVID[k] = String(r.device?.id ?? "");
      }
      DEVID.DB = String(must("registerDevice DB", await call(devMod, "registerDevice", ctxU("B"), A("OWNER"), { name: `เครื่อง B ${RAND}`, deviceCode: DEV.DB }))?.device?.id ?? "");
      DEVID.DX = String(must("registerDevice DX", await call(devMod, "registerDevice", ctxU("X"), A("OWNER2"), { name: `เครื่อง X ${RAND}`, deviceCode: DEV.DX }))?.device?.id ?? "");
      for (const [k, ago] of [["D1", 6 * H], ["D4", 3 * H], ["D7", 3 * H]] as const) {
        const o = must(`openShift ${k}`, await call(shiftMod, "openShift", ctxU("A", DEV[k]), A("OWNER"), { deviceId: DEV[k], deviceLabel: `เครื่อง ${k}`, floatSatang: 0 }));
        SH[k] = String(o.shift?.id ?? "");
        await P.$executeRawUnsafe(`UPDATE "PosShift" SET "openedAt" = $1 WHERE id = $2 AND "tenantId" = $3`, new Date(T0 - ago), SH[k], T);
      }
    });
  }
  await drain();

  // ─── snapshot ต่อเครื่อง (เลื่อนนาฬิกาผ่าน opts.now) ───
  const SN: Record<string, Any> = {};
  const issue = async (k: string, at: number, ctx: Any = ctxU("A", DEV[k]), actor: Any = A("OWNER")): Promise<Any> => call(offMod, "issueOfflineSnapshot", ctx, actor, { now: new Date(at) });
  // เดือนก่อน: 23:50 วันสุดท้าย (เวลาไทย) · ตอนซิงก์ 00:10 วันที่ 1 ของเดือนนี้
  const bkk = new Date(T0 + 7 * H);
  const firstBkk = Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), 1) - 7 * H;
  const SOLD_M = firstBkk - 10 * MIN;
  const NOW_M = firstBkk + 10 * MIN;
  if (!fx) {
    for (const [k, at] of [["D1", T0 - 5 * H], ["D2", T0 - 1 * H], ["D3", SOLD_M - 10 * MIN], ["D4", T0 - 150 * MIN], ["DR", T0 - 2 * H], ["D6", T0 - 30 * MIN], ["D7", T0 - 10 * H], ["D8", T0 - 30 * H]] as const) {
      const r = await issue(k, at);
      if (r?.ok === true && isRecord(r.snapshot)) SN[k] = r.snapshot;
      else notes.push(`snapshot ${k}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    }
    // ราคาเค้กเปลี่ยนหลัง snapshot ของ D1 (SY4)
    await fstep("setPrice เค้ก 5500", async () => must("setPrice cake", await call(catalog, "setPrice", cc(), PR.cake, 5500)));
  }
  const codeOfDev = (k: string) => String(SN[k]?.offlineCode ?? `Z${k}`);
  const seqOf: Record<string, number> = {};
  const nextRef = (k: string) => {
    seqOf[k] = (seqOf[k] ?? 0) + 1;
    return offRef(codeOfDev(k), seqOf[k]!);
  };
  type ItemOpts = { lines: Any[]; total: number; soldAt: number; pay?: Any[]; shift?: string | null; staffToken?: string; sellerUserId?: string; ref?: string; key?: string; hash?: string; extra?: Any };
  const mkItem = (k: string, o: ItemOpts): Any => {
    const pays = o.pay ?? [{ type: "CASH", amountSatang: o.total }];
    const cash = pays.filter((x: Any) => x.type === "CASH").reduce((t: number, x: Any) => t + x.amountSatang, 0);
    const shift = o.shift === undefined ? SH[k] : o.shift;
    return {
      offlineRef: o.ref ?? nextRef(k),
      idempotencyKey: o.key ?? newKey("i"),
      soldAt: iso(o.soldAt),
      ...(shift ? { shiftId: shift } : {}),
      ...(o.staffToken ? { staffToken: o.staffToken } : {}),
      ...(o.sellerUserId ? { sellerUserId: o.sellerUserId } : {}),
      snapshotHash: o.hash ?? String(SN[k]?.hash ?? "none"),
      sale: { lines: o.lines, payMethods: pays, ...(cash > 0 ? { cashReceivedSatang: cash } : {}), expectedGrandTotalSatang: o.total, ...(o.extra ?? {}) },
    };
  };
  const sync = (k: string, items: Any[], o: { actor?: string; ctx?: Any; now?: number; deviceId?: string } = {}): Promise<Any> =>
    call(offMod, "syncOfflineSales", o.ctx ?? ctxU("A", DEV[k]), A(o.actor ?? "OWNER"), { deviceId: o.deviceId ?? DEV[k], items }, o.now !== undefined ? { now: new Date(o.now) } : {});
  const resOf = (r: Any, ref: string): Any => (r?.ok === true && Array.isArray(r.results) ? r.results.find((x: Any) => x?.offlineRef === ref) ?? null : null);
  const stOf = (x: Any) => (x ? `${x.status}${x.reason ? `:${x.reason}` : ""}` : "ไม่มีผล");
  const why = (r: Any) => (r?.ok === true ? "" : `sync ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
  const saleRow = async (id: unknown): Promise<Any> => (typeof id === "string" && id ? P.posSale.findFirst({ where: { tenantId: T, id } }).catch(() => null) : null);
  const offRows = async (where: Any = {}): Promise<Any[]> => {
    try {
      return (await P.posOfflineSale.findMany({ where: { tenantId: T, ...where }, orderBy: { createdAt: "asc" } })) as Any[];
    } catch (e) {
      notes.push(`PosOfflineSale อ่านไม่ได้: ${(e as Error).message.slice(0, 60)}`);
      return [];
    }
  };
  const offRowOf = async (ref: string): Promise<Any> => (await offRows({ offlineRef: ref }))[0] ?? null;
  const countT = async (tb: string): Promise<number> => {
    try {
      return Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, T)) as Any[])[0]?.n ?? -1);
    } catch {
      return -1;
    }
  };
  const DELTA_TABLES = ["PosSale", "PosSaleLine", "PosPayment", "InvMovement", "OutboxEvent", "AccountJournalEntry", "AuditLog", "PosOfflineSale"];
  const counts = async (): Promise<Record<string, number>> => Object.fromEntries(await Promise.all(DELTA_TABLES.map(async (t) => [t, await countT(t)] as const)));
  const deltaOf = (a: Record<string, number>, b: Record<string, number>) => DELTA_TABLES.filter((t) => a[t] !== b[t] || a[t] === -1).map((t) => `${t} ${a[t]}→${b[t]}`);
  const audits = async (action: string, targetId?: string): Promise<Any[]> => (await P.auditLog.findMany({ where: { tenantId: T, action, ...(targetId ? { targetId } : {}) } }).catch(() => [])) as Any[];
  const near = (a: unknown, ms: number, tol = 1500) => a instanceof Date && Math.abs(a.getTime() - ms) <= tol;
  const W = (q: number) => ({ productId: PR.water, qty: q });
  /** ฟิกซ์เจอร์ล้ม ⇒ แดงตามเหตุผล (คืน true = ตรวจแล้ว ไม่ต้องตรวจซ้ำ) */
  const NO_FX = (id: string): boolean => {
    if (!fx) return false;
    chk(id, false, "ฟิกซ์เจอร์พร้อม", FXB(notes.slice(0, 3).join(" | ")));
    return true;
  };

  // ═════ SY1 ═════
  const SY1: Any[] = [];
  let SY1r: Any = null;
  {
    const p: string[] = [];
    if (!fx) {
      SY1.push(mkItem("D1", { lines: [W(1)], total: 1000, soldAt: T0 - 4 * H }));
      SY1.push(mkItem("D1", { lines: [{ productId: PR.latte, qty: 1, options: [{ choiceId: CHO.shot }] }], total: 8000, soldAt: T0 - 4 * H + 5 * MIN }));
      SY1.push(mkItem("D1", { lines: [W(2)], total: 2000, soldAt: T0 - 4 * H + 10 * MIN }));
      const t1 = Date.now();
      SY1r = await sync("D1", SY1);
      const t2 = Date.now();
      if (why(SY1r)) p.push(why(SY1r));
      await drain();
      for (const it of SY1) {
        const x = resOf(SY1r, it.offlineRef);
        if (x?.status !== "OK" || !x?.saleId) {
          p.push(`${it.offlineRef} ${stOf(x)}`);
          continue;
        }
        const s = await saleRow(x.saleId);
        if (!s) {
          p.push(`${it.offlineRef} ไม่มีแถวบิล`);
          continue;
        }
        if (s.offlineRef !== it.offlineRef) p.push(`offlineRef ${s.offlineRef}`);
        if (!(s.syncedAt instanceof Date) || s.syncedAt.getTime() < t1 - 1000 || s.syncedAt.getTime() > t2 + 1000) p.push(`syncedAt ${short(s.syncedAt, 30)}`);
        if (!near(s.paidAt, Date.parse(it.soldAt))) p.push(`paidAt ${short(s.paidAt, 30)} ≠ soldAt ${it.soldAt}`);
        if (!(s.createdAt instanceof Date) || s.createdAt.getTime() < t1 - 1000) p.push(`createdAt ${short(s.createdAt, 30)} (ต้องเป็นเวลาเซิร์ฟเวอร์)`);
        if (s.shiftId !== SH.D1) p.push(`shiftId ${s.shiftId}`);
        if (s.soldByUserId !== uid("OWNER")) p.push(`soldBy ${s.soldByUserId}`);
        if (!String(s.receiptNo ?? "").startsWith(`${bkkYm(Date.parse(it.soldAt))}-`) || x.receiptNo !== s.receiptNo) p.push(`receiptNo ${s.receiptNo}/${x.receiptNo}`);
        if (s.grandTotalSatang !== it.sale.expectedGrandTotalSatang) p.push(`ยอด ${s.grandTotalSatang}`);
        const ob = await P.outboxEvent.count({ where: { tenantId: T, type: "pos.sale.paid", idempotencyKey: `PosSale#${s.id}#PAID` } });
        if (ob !== 1) p.push(`pos.sale.paid ${ob}`);
        const au = await audits(AUDIT_SYNCED, s.id);
        if (au.length !== 1 || au[0]?.after?.offlineRef !== it.offlineRef || !au[0]?.after?.soldAt || !au[0]?.after?.syncedAt || !au[0]?.after?.deviceId) p.push(`audit ${au.length} ${short(au[0]?.after, 60)}`);
        const o = await offRowOf(it.offlineRef);
        if (o?.status !== "SYNCED" || o?.saleId !== s.id || o?.idempotencyKey !== it.idempotencyKey) p.push(`PosOfflineSale ${short(o && { st: o.status, sale: o.saleId }, 60)}`);
      }
      // บิลข้ามเดือน (D3 · ไม่มีกะ · opts.now 00:10 วันที่ 1)
      const im = mkItem("D3", { lines: [W(1)], total: 1000, soldAt: SOLD_M, shift: null });
      const rm = await sync("D3", [im], { now: NOW_M });
      const xm = resOf(rm, im.offlineRef);
      if (xm?.status !== "OK") p.push(`ข้ามเดือน ${stOf(xm)} ${why(rm)}`);
      else {
        await drain();
        const s = await saleRow(xm.saleId);
        const ym = bkkYm(SOLD_M);
        if (!String(s?.receiptNo ?? "").startsWith(`${ym}-`)) p.push(`ข้ามเดือน receiptNo ${s?.receiptNo} (คาด ${ym}-…)`);
        if (!near(s?.paidAt, SOLD_M)) p.push(`ข้ามเดือน paidAt ${short(s?.paidAt, 30)}`);
        if (!(s?.createdAt instanceof Date) || s.createdAt.getTime() < T0 - 1000) p.push("ข้ามเดือน createdAt ถูกย้อน");
        const je = (await P.accountJournalEntry.findMany({ where: { tenantId: T, refType: "PosSale", refId: String(xm.saleId) } }).catch(() => [])) as Any[];
        const wantPk = `${ym.slice(0, 4)}-${ym.slice(4)}`;
        if (!je.length || je.some((e) => e.periodKey !== wantPk)) p.push(`ข้ามเดือน JE ${je.map((e) => e.periodKey).join(",") || "ไม่มี"} (คาด ${wantPk})`);
      }
    }
    if (!NO_FX("SY1")) chk("SY1", p.length === 0, "3 บิล · offlineRef/syncedAt/paidAt=soldAt/createdAt ตอนนี้/กะ/เลขเดือน soldAt · outbox ×1 · audit ×1 · ข้ามเดือน receipt+JE เดือนของ soldAt", FXB(joinP(p)));
  }

  // ═════ SY3 ═════
  const SY3: Any[] = [];
  let SY3r: Any = null;
  {
    const p: string[] = [];
    if (!fx) {
      SY3.push(mkItem("D1", { lines: [W(1)], total: 1000, soldAt: T0 - 3 * H - 40 * MIN }));
      SY3.push(mkItem("D1", { lines: [{ productId: `nope${RAND}`, qty: 1 }], total: 1000, soldAt: T0 - 3 * H - 35 * MIN }));
      SY3.push(mkItem("D1", { lines: [W(3)], total: 3000, soldAt: T0 - 3 * H - 30 * MIN }));
      const before = await countT("PosSale");
      SY3r = await sync("D1", SY3);
      if (why(SY3r)) p.push(why(SY3r));
      const [a, b, c] = SY3.map((it) => resOf(SY3r, it.offlineRef));
      if (a?.status !== "OK" || c?.status !== "OK") p.push(`1/3 ${stOf(a)} ${stOf(c)}`);
      if (b?.status !== "REJECTED" || b?.saleId) p.push(`2 ${stOf(b)} sale ${b?.saleId ?? "-"}`);
      const after = await countT("PosSale");
      if (after - before !== 2) p.push(`บิลใหม่ ${after - before} (คาด 2)`);
      const rows = await Promise.all(SY3.map((it) => offRowOf(it.offlineRef)));
      const sts = rows.map((r) => r?.status ?? "-").join("/");
      if (sts !== "SYNCED/REJECTED/SYNCED") p.push(`PosOfflineSale ${sts}`);
      if (!rows[1] || !isRecord(rows[1].payload) || !rows[1].reason) p.push(`แถว REJECTED ไม่มี payload/reason ${short(rows[1] && { r: rows[1].reason }, 40)}`);
    }
    if (!NO_FX("SY3")) chk("SY3", p.length === 0, "OK/REJECTED/OK · บิล +2 · บันทึก 3 แถว", FXB(joinP(p)));
  }

  // ═════ SY2 ═════
  {
    const p: string[] = [];
    if (!fx) {
      await drain();
      const c0 = await counts();
      const batch = [...SY1, ...SY3];
      for (let round = 1; round <= 2; round++) {
        const r = await sync("D1", batch);
        if (why(r)) p.push(`รอบ ${round}: ${why(r)}`);
        for (const it of batch) {
          const x = resOf(r, it.offlineRef);
          const first = resOf(SY1r, it.offlineRef) ?? resOf(SY3r, it.offlineRef);
          if (first?.status === "OK") {
            if (x?.status !== "DUPLICATE" || x?.saleId !== first.saleId || x?.receiptNo !== first.receiptNo) p.push(`รอบ ${round} ${it.offlineRef} ${stOf(x)}`);
          } else if (x?.status !== "REJECTED" || x?.reason !== first?.reason || x?.saleId) p.push(`รอบ ${round} ${it.offlineRef} ${stOf(x)} (เดิม ${stOf(first)})`);
        }
      }
      await drain();
      const d = deltaOf(c0, await counts());
      if (d.length) p.push(`Δแถว ${d.join(", ")}`);
    }
    if (!NO_FX("SY2")) chk("SY2", p.length === 0, "DUPLICATE ×5 · REJECTED เดิม ×1 · สองรอบ · Δ0 ทุกตาราง", FXB(joinP(p)));
  }

  // ═════ SY4 · SY5 · SY6 ═════
  {
    const p4: string[] = [];
    const p5: string[] = [];
    const p6: string[] = [];
    if (!fx) {
      const i4 = mkItem("D1", { lines: [{ productId: PR.cake, qty: 1 }], total: 4500, soldAt: T0 - 90 * MIN });
      const i5 = mkItem("D1", { lines: [{ productId: PR.cake, qty: 1 }], total: 3000, soldAt: T0 - 85 * MIN });
      const i6 = mkItem("D1", { lines: [{ productId: PR.tea, qty: 1 }], total: 3000, soldAt: T0 - 2 * H });
      const i6c = mkItem("D1", { lines: [{ productId: PR.tea, qty: 1 }], total: 3000, soldAt: T0 - 20 * MIN });
      const before = await countT("PosSale");
      const r = await sync("D1", [i4, i5, i6, i6c]);
      const w = why(r);
      // SY4
      const x4 = resOf(r, i4.offlineRef);
      if (w) p4.push(w);
      if (x4?.status !== "OK" || !x4?.drift) p4.push(`ผล ${stOf(x4)} drift ${short(x4?.drift, 40)}`);
      const s4 = await saleRow(x4?.saleId);
      if (s4?.grandTotalSatang !== 4500) p4.push(`ยอดบิล ${s4?.grandTotalSatang ?? "-"} (คาด 4500 ราคา snapshot)`);
      const o4 = await offRowOf(i4.offlineRef);
      if (!o4?.drift) p4.push("PosOfflineSale.drift ว่าง");
      const a4 = s4 ? await audits(AUDIT_SYNCED, s4.id) : [];
      if (!a4[0]?.after?.drift) p4.push(`audit after.drift ${short(a4[0]?.after, 50)}`);
      if (!JSON.stringify(x4?.drift ?? "").includes(PR.cake ?? "@@")) p4.push("drift ไม่ระบุสินค้า");
      // SY5
      const x5 = resOf(r, i5.offlineRef);
      if (w) p5.push(w);
      if (x5?.status !== "REJECTED" || x5?.reason !== "PRICE_MISMATCH" || x5?.saleId) p5.push(`ผล ${stOf(x5)}`);
      const o5 = await offRowOf(i5.offlineRef);
      if (o5?.status !== "REJECTED" || o5?.reason !== "PRICE_MISMATCH" || o5?.saleId) p5.push(`PosOfflineSale ${short(o5 && { s: o5.status, r: o5.reason }, 50)}`);
      // SY6 — ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 fix1 N3 · CD-P34g): ราคาโปร ณ soldAt < ราคาตอนซิงก์ และซิงก์ช้ากว่า 30 นาที ⇒ REJECTED PRICE_WINDOW_REVIEW (คิวผู้จัดการ) ·
      //   ผู้จัดการรับ ⇒ คิดราคา ณ soldAt = 3000 ไม่มี drift (พิสูจน์ R6 เดิมผ่านทางรับ)
      const x6 = resOf(r, i6.offlineRef);
      if (w) p6.push(w);
      if (x6?.status !== "REJECTED" || x6?.reason !== "PRICE_WINDOW_REVIEW" || x6?.saleId) p6.push(`โปรตอนขาย (ซิงก์ช้า) ${stOf(x6)} (คาด REJECTED:PRICE_WINDOW_REVIEW)`);
      const a6 = await call(offMod, "acceptOfflineSale", ctxU("A"), A("OWNER"), { id: String(x6?.offlineSaleId ?? "none") });
      if (a6?.ok !== true) p6.push(`accept โปร ${codeOf(a6)}`);
      const s6 = await saleRow(a6?.saleId);
      if (s6?.grandTotalSatang !== 3000) p6.push(`ยอด ${s6?.grandTotalSatang ?? "-"}`);
      const o6 = s6 ? await offRowOf(i6.offlineRef) : null;
      if (o6 && o6.drift) p6.push(`drift ${short(o6.drift, 30)} (คาด ไม่มี)`);
      const x6c = resOf(r, i6c.offlineRef);
      if (x6c?.status !== "REJECTED" || x6c?.reason !== "PRICE_MISMATCH") p6.push(`ตัวควบคุมหลังโปรจบ ${stOf(x6c)}`);
      const after = await countT("PosSale");
      if (after - before !== 2) p5.push(`บิลใหม่ ${after - before} (คาด 2: SY4 + SY6 ที่ผู้จัดการรับ)`); // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 fix1 N3): นับหลัง accept ของ SY6
    }
    if (!NO_FX("SY4")) chk("SY4", p4.length === 0, "OK ที่ 4500 + drift (ผล · แถว · audit)", FXB(joinP(p4)));
    if (!NO_FX("SY5")) chk("SY5", p5.length === 0, "REJECTED PRICE_MISMATCH ไม่มีบิล", FXB(joinP(p5)));
    if (!NO_FX("SY6")) chk("SY6", p6.length === 0, "โปร ณ soldAt OK ไม่มี drift · หลังโปรจบ PRICE_MISMATCH", FXB(joinP(p6)));
  }

  // ═════ SY7 กะปิดก่อนซิงก์ ═════
  let SY7_OFFID = "";
  let SY7_SALE = "";
  {
    const p: string[] = [];
    if (!fx) {
      const it = mkItem("D4", { lines: [W(1)], total: 1000, soldAt: T0 - 2 * H });
      const cl = await call(shiftMod, "closeShift", ctxU("A", DEV.D4), A("OWNER"), { shiftId: SH.D4, countedCashSatang: 0, note: "ปิดก่อนซิงก์", idempotencyKey: newKey("close") });
      if (cl?.ok !== true) p.push(`closeShift ${codeOf(cl)}`);
      const r = await sync("D4", [it]);
      const x = resOf(r, it.offlineRef);
      if (x?.status !== "REJECTED" || x?.reason !== "SHIFT_CLOSED" || x?.saleId) p.push(`ซิงก์ ${stOf(x)} ${why(r)}`);
      SY7_OFFID = String(x?.offlineSaleId ?? (await offRowOf(it.offlineRef))?.id ?? "");
      const ac = await call(offMod, "acceptOfflineSale", ctxU("A"), A("OWNER"), { id: SY7_OFFID || "none" });
      if (ac?.ok !== true || !ac?.saleId) p.push(`accept ${codeOf(ac)} ${short(ac?.message ?? "", 50)}`);
      else {
        SY7_SALE = String(ac.saleId);
        const s = await saleRow(SY7_SALE);
        if (!s || s.shiftId !== null) p.push(`บิล shiftId ${s?.shiftId ?? "ไม่มีบิล"}`);
        if (s?.offlineRef !== it.offlineRef) p.push(`บิล offlineRef ${s?.offlineRef}`);
        const off = await call(shiftMod, "offShiftCash", ctxU("A"), A("OWNER"), {});
        if (!(off?.ok === true && Array.isArray(off.bills) && off.bills.some((b: Any) => b.saleId === SY7_SALE))) p.push(`offShiftCash ไม่มีบิล (${codeOf(off)})`);
        const o = await offRowOf(it.offlineRef);
        if (o?.status !== "ACCEPTED_BY_MANAGER" || o?.saleId !== SY7_SALE || o?.resolvedByUserId !== uid("OWNER")) p.push(`PosOfflineSale ${short(o && { s: o.status, by: o.resolvedByUserId }, 60)}`);
      }
    }
    if (!NO_FX("SY7")) chk("SY7", p.length === 0, "SHIFT_CLOSED → accept → shiftId null · offShiftCash · ACCEPTED_BY_MANAGER", FXB(joinP(p)));
  }

  // ═════ SY8 เครื่องถูกเพิกถอน ═════
  {
    const p: string[] = [];
    if (!fx) {
      const before = mkItem("DR", { lines: [W(1)], total: 1000, soldAt: T0 - 60 * MIN, shift: null });
      const afterIt = mkItem("DR", { lines: [W(1)], total: 1000, soldAt: T0 - 10 * MIN, shift: null });
      const rv = await call(devMod, "revokeDevice", ctxU("A"), A("OWNER"), { id: DEVID.DR });
      if (rv?.ok !== true) p.push(`revokeDevice ${codeOf(rv)}`);
      await P.$executeRawUnsafe(`UPDATE "PosDevice" SET "revokedAt" = $1 WHERE id = $2 AND "tenantId" = $3`, new Date(T0 - 30 * MIN), DEVID.DR, T);
      const r = await sync("DR", [before, afterIt]);
      const a = resOf(r, before.offlineRef);
      const b = resOf(r, afterIt.offlineRef);
      if (a?.status !== "OK") p.push(`ก่อนเพิกถอน ${stOf(a)} ${why(r)}`);
      if (b?.status !== "REJECTED" || b?.saleId) p.push(`หลังเพิกถอน ${stOf(b)}`);
    }
    if (!NO_FX("SY8")) chk("SY8", p.length === 0, "ก่อน revokedAt OK · หลัง REJECTED", FXB(joinP(p)));
  }

  // ═════ SY9 โทเคน/ผู้ขาย ═════
  {
    const p: string[] = [];
    if (!fx) {
      const ctxS = { tenantId: T, systemId: S.POS, unitId: U.A, deviceId: DEV.D1 };
      const sp = await call(staffMod, "setStaffPin", ctxS, A("OWNER"), { userId: uid("CASH"), pin: "582913" });
      if (sp?.ok !== true) p.push(`setStaffPin ${codeOf(sp)}`);
      const tok1 = await call(staffMod, "issueStaffToken", ctxS, { unitId: U.A, deviceId: DEV.D1, userId: uid("CASH") }, { now: new Date(T0 - 13 * H) });
      const tokA = String(tok1?.staffToken ?? "");
      if (!tokA) p.push(`issueStaffToken ${codeOf(tok1)} ${short(tok1?.message ?? "", 40)}`);
      // ตัวช่วยของ staff-pin (มติ 12)
      const atOk = await call(staffMod, "staffActorFromToken", ctxS, tokA, undefined, { at: new Date(T0 - 2 * H) });
      const atNow = await call(staffMod, "staffActorFromToken", ctxS, tokA);
      if (atOk?.userId !== uid("CASH")) p.push(`staffActorFromToken({at}) ${short(atOk, 40)}`);
      if (atNow !== null) p.push(`ไม่ส่ง at ต้องหมดอายุ (null) ได้ ${short(atNow, 30)}`);
      const iOk = mkItem("D1", { lines: [W(1)], total: 1000, soldAt: T0 - 2 * H, staffToken: tokA });
      const iLate = mkItem("D1", { lines: [W(1)], total: 1000, soldAt: T0 - 30 * MIN, staffToken: tokA });
      const iMis = mkItem("D1", { lines: [W(1)], total: 1000, soldAt: T0 - 115 * MIN, sellerUserId: uid("CASH2") });
      const iSelf = mkItem("D1", { lines: [W(1)], total: 1000, soldAt: T0 - 110 * MIN, sellerUserId: uid("OWNER") });
      const r = await sync("D1", [iOk, iLate, iMis, iSelf]);
      if (why(r)) p.push(why(r));
      const xo = resOf(r, iOk.offlineRef);
      const so = await saleRow(xo?.saleId);
      if (xo?.status !== "OK" || so?.soldByUserId !== uid("CASH")) p.push(`โทเคนตอน soldAt ${stOf(xo)} ผู้ขาย ${so?.soldByUserId ?? "-"}`);
      const xl = resOf(r, iLate.offlineRef);
      if (xl?.status !== "REJECTED" || xl?.saleId) p.push(`soldAt หลังหมดอายุ ${stOf(xl)}`);
      const xm = resOf(r, iMis.offlineRef);
      if (xm?.status !== "REJECTED" || xm?.reason !== "SELLER_MISMATCH") p.push(`ผู้ขายอื่นไม่มีโทเคน ${stOf(xm)}`);
      const xs = resOf(r, iSelf.offlineRef);
      const ss = await saleRow(xs?.saleId);
      if (xs?.status !== "OK" || ss?.soldByUserId !== uid("OWNER")) p.push(`ผู้ขาย = session ${stOf(xs)}`);
      // PIN ใหม่ ⇒ โทเคนเก่าใช้ไม่ได้
      const tok2 = await call(staffMod, "issueStaffToken", ctxS, { unitId: U.A, deviceId: DEV.D1, userId: uid("CASH") }, { now: new Date(T0 - 2 * H) });
      const sp2 = await call(staffMod, "setStaffPin", ctxS, A("OWNER"), { userId: uid("CASH"), pin: "739164" });
      if (sp2?.ok !== true) p.push(`setStaffPin ใหม่ ${codeOf(sp2)}`);
      const iPin = mkItem("D1", { lines: [W(1)], total: 1000, soldAt: T0 - 100 * MIN, staffToken: String(tok2?.staffToken ?? "x") });
      const r2 = await sync("D1", [iPin]);
      const xp = resOf(r2, iPin.offlineRef);
      if (xp?.status !== "REJECTED" || xp?.saleId) p.push(`PIN เปลี่ยน ${stOf(xp)} ${why(r2)}`);
      const rows = await offRows({ offlineRef: { in: [iOk.offlineRef, iLate.offlineRef, iPin.offlineRef] } });
      if (rows.some((o) => JSON.stringify(o.payload ?? "").includes(tokA.slice(-24) || "@@") || (tok2?.staffToken && JSON.stringify(o.payload ?? "").includes(String(tok2.staffToken).slice(-24))))) p.push("PosOfflineSale.payload เก็บโทเคนดิบ");
    }
    if (!NO_FX("SY9")) chk("SY9", p.length === 0, "โทเคน at=soldAt OK · หลังหมดอายุ/PIN ใหม่ REJECTED · SELLER_MISMATCH · ผู้ขาย session OK · ไม่เก็บโทเคน", FXB(joinP(p)));
  }

  // ═════ SY10 เนื้อหาที่ห้าม ═════
  {
    const p: string[] = [];
    if (!fx) {
      const ln = [W(1)];
      const bad: [string, Any][] = [
        ["PROMPTPAY", mkItem("D1", { lines: ln, total: 1000, soldAt: T0 - 80 * MIN, pay: [{ type: "PROMPTPAY", amountSatang: 1000 }] })],
        ["CARD", mkItem("D1", { lines: ln, total: 1000, soldAt: T0 - 80 * MIN + 1000, pay: [{ type: "CARD", amountSatang: 1000, reference: "1234" }] })],
        ["GIFT_CARD", mkItem("D1", { lines: ln, total: 1000, soldAt: T0 - 80 * MIN + 2000, pay: [{ type: "GIFT_CARD", amountSatang: 1000, giftCard: { number: "GC0000000001", pin: "1111" } }] })],
        ["DEPOSIT", mkItem("D1", { lines: ln, total: 1000, soldAt: T0 - 80 * MIN + 3000, pay: [{ type: "DEPOSIT", amountSatang: 1000, depositId: "dep1" }] })],
        ["memberId", mkItem("D1", { lines: ln, total: 1000, soldAt: T0 - 80 * MIN + 4000, extra: { memberId: "member-x" } })],
        ["couponCode", mkItem("D1", { lines: ln, total: 1000, soldAt: T0 - 80 * MIN + 5000, extra: { couponCode: "SAVE10" } })],
        ["memberChoices", mkItem("D1", { lines: ln, total: 1000, soldAt: T0 - 80 * MIN + 6000, extra: { memberChoices: { points: 10 } } })],
        ["tableSessionId", mkItem("D1", { lines: [], total: 1000, soldAt: T0 - 80 * MIN + 7000, extra: { tableSessionId: "ts-x" } })],
      ];
      const okT = mkItem("D1", { lines: ln, total: 1000, soldAt: T0 - 79 * MIN, pay: [{ type: "TRANSFER", amountSatang: 1000, reference: "KBANK-REF-1" }] });
      const okC = mkItem("D1", { lines: [W(2)], total: 2000, soldAt: T0 - 78 * MIN });
      const before = await countT("PosSale");
      const r = await sync("D1", [...bad.map(([, it]) => it), okT, okC]);
      if (why(r)) p.push(why(r));
      for (const [k, it] of bad) {
        const x = resOf(r, it.offlineRef);
        if (x?.status !== "REJECTED" || x?.reason !== "VALIDATION" || x?.saleId) p.push(`${k} ${stOf(x)}`);
      }
      if (resOf(r, okT.offlineRef)?.status !== "OK") p.push(`TRANSFER ${stOf(resOf(r, okT.offlineRef))}`);
      if (resOf(r, okC.offlineRef)?.status !== "OK") p.push(`เงินสด ${stOf(resOf(r, okC.offlineRef))}`);
      const after = await countT("PosSale");
      if (after - before !== 2) p.push(`บิลใหม่ ${after - before} (คาด 2)`);
    }
    if (!NO_FX("SY10")) chk("SY10", p.length === 0, "8 REJECTED VALIDATION · TRANSFER + เงินสด OK · บิล +2", FXB(joinP(p)));
  }

  // ═════ SY11 นาฬิกา ═════
  {
    const p: string[] = [];
    if (!fx) {
      const now = Date.now();
      const fut = mkItem("D1", { lines: [W(1)], total: 1000, soldAt: now + 5 * MIN });
      const preSnap = mkItem("D1", { lines: [W(1)], total: 1000, soldAt: T0 - 5 * H - MIN });
      const ctrl = mkItem("D1", { lines: [W(1)], total: 1000, soldAt: now + 60_000 });
      const badStr = { ...mkItem("D1", { lines: [W(1)], total: 1000, soldAt: now - MIN }), soldAt: "เมื่อวาน" };
      const preShift = mkItem("D7", { lines: [W(1)], total: 1000, soldAt: T0 - 4 * H });
      const old = mkItem("D8", { lines: [W(1)], total: 1000, soldAt: T0 - 25 * H, shift: null });
      const r1 = await sync("D1", [fut, preSnap, ctrl, badStr]);
      const r2 = await sync("D7", [preShift]);
      const r3 = await sync("D8", [old]);
      for (const [k, r, it] of [["อนาคต +5 นาที", r1, fut], ["ก่อน snapshot", r1, preSnap], ["ก่อนเปิดกะ − 5 นาที", r2, preShift], ["เก่ากว่า 24 ชม.", r3, old]] as const) {
        const x = resOf(r, it.offlineRef);
        if (x?.status !== "REJECTED" || x?.reason !== "CLOCK_INVALID" || x?.saleId) p.push(`${k} ${stOf(x)} ${why(r)}`);
      }
      const xb = resOf(r1, badStr.offlineRef);
      if (xb?.status !== "REJECTED" || xb?.saleId) p.push(`soldAt ผิดรูป ${stOf(xb)}`);
      const xc = resOf(r1, ctrl.offlineRef);
      if (xc?.status !== "OK") p.push(`ตัวควบคุม +60 วิ ${stOf(xc)}`);
    }
    if (!NO_FX("SY11")) chk("SY11", p.length === 0, "CLOCK_INVALID ×4 · ผิดรูป REJECTED · +60 วิ OK", FXB(joinP(p)));
  }

  // ═════ SY12 สต็อก ═════
  {
    const p: string[] = [];
    if (!fx) {
      const allow = mkItem("D1", { lines: [{ productId: PR.cookie, qty: 3 }], total: 10500, soldAt: T0 - 70 * MIN });
      const r = await sync("D1", [allow]);
      const x = resOf(r, allow.offlineRef);
      await drain();
      if (x?.status !== "OK") p.push(`ALLOW_NEGATIVE ${stOf(x)} ${why(r)}`);
      const mv = async () => Number(await P.invMovement.count({ where: { tenantId: T, refType: "PosSale", refId: String(x?.saleId ?? "none") } }).catch(() => -1));
      const m1 = await mv();
      const onHand = Number((await P.invItem.findUnique({ where: { id: INV.cookie }, select: { onHand: true } }).catch(() => null))?.onHand ?? 999);
      if (m1 !== 1) p.push(`InvMovement ${m1} (คาด 1)`);
      if (onHand !== -1) p.push(`onHand ${onHand} (คาด −1)`);
      await sync("D1", [allow]);
      await drain();
      if ((await mv()) !== 1) p.push("ส่งซ้ำตัดซ้ำ");
      const u0 = (await P.businessUnit.findUnique({ where: { id: U.A }, select: { settings: true } }))?.settings ?? {};
      const pos0 = isRecord(u0.pos) ? u0.pos : {};
      await P.businessUnit.update({ where: { id: U.A }, data: { settings: { ...u0, pos: { ...pos0, stock: { ...(isRecord(pos0.stock) ? pos0.stock : {}), oversellPolicy: "BLOCK" } } } } });
      try {
        const blk = mkItem("D1", { lines: [{ productId: PR.cookie, qty: 1 }], total: 3500, soldAt: T0 - 65 * MIN });
        const rb = await sync("D1", [blk]);
        const xb = resOf(rb, blk.offlineRef);
        if (xb?.status !== "REJECTED" || xb?.reason !== "STOCK_INSUFFICIENT" || xb?.saleId) p.push(`BLOCK ${stOf(xb)} ${why(rb)}`);
      } finally {
        await P.businessUnit.update({ where: { id: U.A }, data: { settings: u0 } });
      }
    }
    if (!NO_FX("SY12")) chk("SY12", p.length === 0, "ALLOW_NEGATIVE ตัด 1 ครั้ง (−1) · BLOCK → STOCK_INSUFFICIENT", FXB(joinP(p)));
  }

  // ═════ SY13 ปฏิเสธทั้งชุด ═════
  {
    const p: string[] = [];
    if (!fx) {
      const c0 = await counts();
      const off0 = await offRows();
      const one = (k: string) => [mkItem(k, { lines: [W(1)], total: 1000, soldAt: T0 - 50 * MIN })];
      const cases: [string, () => Promise<Any>][] = [
        ["ร้าน T2 + เครื่องของ T", () => sync("D1", one("D1"), { ctx: ctxU("X", DEV.D1), actor: "OWNER2" })],
        ["ผู้ขายของสาขา B ที่สาขา A", () => sync("D1", one("D1"), { actor: "CASHB" })],
        ["เครื่องไม่ลงทะเบียน", () => sync("GHOST", one("GHOST"), { ctx: ctxU("A", DEV.GHOST) })],
        ["ไม่มี pos.sale.create", () => sync("D1", one("D1"), { actor: "NOPERM" })],
        ["deviceId ≠ ctx.deviceId", () => sync("D1", one("D1"), { deviceId: DEV.D2 })],
        ["> 50 รายการ", () => sync("D1", Array.from({ length: 51 }, (_, i) => mkItem("D1", { lines: [W(1)], total: 1000, soldAt: T0 - 49 * MIN + i * 1000 })))],
      ];
      for (const [k, fn] of cases) {
        const r = await fn();
        if (r?.ok !== false || String(r?.code ?? "").startsWith("MISSING")) p.push(`${k} → ${codeOf(r)}`);
      }
      // ปิดธง
      const s0 = (await P.appSystem.findUnique({ where: { id: S.POS }, select: { settings: true } }))?.settings ?? {};
      await P.appSystem.update({ where: { id: S.POS }, data: { settings: { ...s0, pos: { ...(isRecord(s0.pos) ? s0.pos : {}), offline: { enabled: false } } } } });
      try {
        // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 fix1 F5): ปิดธง = หยุดออก snapshot (หยุดขาย) เท่านั้น · บิลที่ค้างในคิวยังซิงก์ได้ (เงินสดต้องลงบิล) — ส่งชุดว่าง (ไม่เขียนอะไร) ต้องไม่ถูกปฏิเสธ
        const r = await sync("D1", []);
        if (r?.ok !== true || !Array.isArray(r?.results)) p.push(`ปิดธง sync ชุดค้าง → ${codeOf(r)} (คาด ok — มติ F5)`);
        const sn = await issue("D2", Date.now());
        if (sn?.ok !== false || String(sn?.code ?? "").startsWith("MISSING")) p.push(`ปิดธง snapshot → ${codeOf(sn)}`);
      } finally {
        await P.appSystem.update({ where: { id: S.POS }, data: { settings: s0 } });
      }
      const g = await issue("GHOST", Date.now(), ctxU("A", DEV.GHOST));
      if (g?.ok !== false || String(g?.code ?? "").startsWith("MISSING")) p.push(`snapshot เครื่องไม่ลงทะเบียน → ${codeOf(g)}`);
      const gn = await issue("D1", Date.now(), ctxU("A", DEV.D1), A("NOPERM"));
      if (gn?.ok !== false || String(gn?.code ?? "").startsWith("MISSING")) p.push(`snapshot ไม่มีสิทธิ์ → ${codeOf(gn)}`);
      const d = deltaOf(c0, await counts());
      if (d.length) p.push(`เขียนแถว: ${d.join(", ")}`);
      const off1 = await offRows();
      if (off1.length !== off0.length) p.push(`PosOfflineSale ${off0.length}→${off1.length}`);
      const t2n = Number(await P.posSale.count({ where: { tenantId: T2 } }).catch(() => -1));
      if (t2n !== 0) p.push(`ร้าน T2 มีบิล ${t2n}`);
    }
    if (!NO_FX("SY13")) chk("SY13", p.length === 0, "ปฏิเสธ 7 ทาง + snapshot 3 ทาง · ไม่เขียนอะไร", FXB(joinP(p)));
  }

  // ═════ SY14 บิลออนไลน์ unknown ═════
  {
    const p: string[] = [];
    if (!fx) {
      const key = newKey("online");
      const sale = { lines: [W(1)], payMethods: [{ type: "CASH", amountSatang: 1000 }], cashReceivedSatang: 1000, expectedGrandTotalSatang: 1000 };
      const on = await call(regFacade, "submitRegisterSale", ctxU("A", DEV.D1), A("OWNER"), { ...sale, idempotencyKey: key });
      if (on?.ok !== true) p.push(`ขายออนไลน์ ${codeOf(on)}`);
      const before = await countT("PosSale");
      const it = mkItem("D1", { lines: sale.lines, total: 1000, soldAt: Date.now() - MIN, key });
      const r = await sync("D1", [it]);
      const x = resOf(r, it.offlineRef);
      if (x?.status !== "DUPLICATE" || x?.saleId !== on?.saleId) p.push(`ซิงก์ ${stOf(x)} sale ${x?.saleId ?? "-"} vs ${on?.saleId ?? "-"} ${why(r)}`);
      const after = await countT("PosSale");
      if (after !== before) p.push(`บิล ${before}→${after}`);
    }
    if (!NO_FX("SY14")) chk("SY14", p.length === 0, "DUPLICATE saleId ออนไลน์ · Δ0", FXB(joinP(p)));
  }

  // ═════ SY15 เลข OFF ═════
  {
    const p: string[] = [];
    if (!fx) {
      const first = SY1[0];
      const reuse = mkItem("D1", { lines: [W(1)], total: 1000, soldAt: T0 - 45 * MIN, ref: first?.offlineRef ?? "OFF-Z-0001" });
      const r1 = await sync("D1", [reuse]);
      const x1 = resOf(r1, reuse.offlineRef);
      if (x1?.status !== "REJECTED" || x1?.reason !== "OFFLINE_REF_TAKEN" || x1?.saleId) p.push(`ใช้เลขซ้ำ ${stOf(x1)} ${why(r1)}`);
      const c1 = String(SN.D1?.offlineCode ?? "");
      const c2 = String(SN.D2?.offlineCode ?? "");
      if (!c1 || !c2 || c1 === c2) p.push(`offlineCode D1 ${c1 || "-"} D2 ${c2 || "-"}`);
      const d2a = mkItem("D2", { lines: [W(1)], total: 1000, soldAt: T0 - 40 * MIN, shift: null });
      const d2steal = mkItem("D2", { lines: [W(1)], total: 1000, soldAt: T0 - 39 * MIN, shift: null, ref: offRef(c1 || "Z", 9000) });
      const r2 = await sync("D2", [d2a, d2steal]);
      if (!d2a.offlineRef.endsWith("-0001") || resOf(r2, d2a.offlineRef)?.status !== "OK") p.push(`D2 seq 1 ${d2a.offlineRef} ${stOf(resOf(r2, d2a.offlineRef))} ${why(r2)}`);
      const xs = resOf(r2, d2steal.offlineRef);
      if (xs?.status !== "REJECTED" || xs?.saleId) p.push(`D2 ใช้รหัสของ D1 ${stOf(xs)}`);
      const dv = (await P.$queryRawUnsafe(`SELECT to_jsonb(x)->>'offlineSeq' AS s, to_jsonb(x)->>'offlineCode' AS c FROM "PosDevice" x WHERE id = $1 AND "tenantId" = $2`, DEVID.D1, T).catch(() => [])) as Any[];
      const okSeqs = (await offRows({ deviceId: { in: [DEVID.D1, DEV.D1] } })).filter((o) => o.status !== "REJECTED").map((o) => Number(/-(\d+)$/.exec(String(o.offlineRef))?.[1] ?? 0));
      const hw = Number(dv[0]?.s ?? -1);
      if (!okSeqs.length || hw < Math.max(...okSeqs)) p.push(`PosDevice.offlineSeq ${dv[0]?.s ?? "ไม่มี"} < high-water ${okSeqs.length ? Math.max(...okSeqs) : "-"}`);
      if (dv[0]?.c !== c1) p.push(`PosDevice.offlineCode ${dv[0]?.c ?? "-"} ≠ ${c1}`);
      const again = await issue("D1", Date.now());
      if (again?.ok !== true || Number(again.snapshot?.offlineSeq) !== hw || again.snapshot?.offlineCode !== c1) p.push(`snapshot ใหม่ offlineSeq ${again?.snapshot?.offlineSeq ?? codeOf(again)} code ${again?.snapshot?.offlineCode ?? "-"}`);
    }
    if (!NO_FX("SY15")) chk("SY15", p.length === 0, "OFFLINE_REF_TAKEN · รหัสต่อเครื่อง · seq อิสระ · ขโมยรหัส REJECTED · high-water", FXB(joinP(p)));
  }

  // ═════ SY16 ครัว ═════
  {
    const p: string[] = [];
    if (!fx) {
      const it = mkItem("D1", { lines: [{ productId: PR.kitchen, qty: 1 }], total: 2500, soldAt: T0 - 30 * MIN });
      const r = await sync("D1", [it]);
      const x = resOf(r, it.offlineRef);
      if (x?.status !== "OK") p.push(`ซิงก์ ${stOf(x)} ${why(r)}`);
      const sid = String(x?.saleId ?? "");
      if (sid && (await call(kdsMod, "roundOfSale", T, U.A, sid))) p.push("บิลซิงก์มีรอบครัว");
      await call(kdsMod, "healMissingTickets", T, U.A);
      if (sid && (await call(kdsMod, "roundOfSale", T, U.A, sid))) p.push("healMissingTickets สร้างรอบให้บิลซิงก์");
      const on = await call(regFacade, "submitRegisterSale", ctxU("A", DEV.D1), A("OWNER"), { lines: [{ productId: PR.kitchen, qty: 1 }], payMethods: [{ type: "CASH", amountSatang: 2500 }], cashReceivedSatang: 2500, expectedGrandTotalSatang: 2500, idempotencyKey: newKey("kds") });
      const rr = on?.ok === true ? await call(kdsMod, "roundOfSale", T, U.A, on.saleId) : null;
      if (!rr?.orderId) p.push(`ตัวควบคุมออนไลน์ไม่มีรอบ (${codeOf(on)})`);
    }
    if (!NO_FX("SY16")) chk("SY16", p.length === 0, "ไม่มีรอบ (รวม heal) · ออนไลน์มีรอบ", FXB(joinP(p)));
  }

  // ═════ SY17 คิวผู้จัดการ ═════
  {
    const p: string[] = [];
    if (!fx) {
      const ls = await call(offMod, "listOfflineRejected", ctxU("A"), A("OWNER"), { limit: 200 });
      const items: Any[] = ls?.ok === true && Array.isArray(ls.items) ? ls.items : [];
      if (ls?.ok !== true) p.push(`list ${codeOf(ls)}`);
      const rows = await offRows();
      const rej = rows.filter((o) => o.status === "REJECTED").map((o) => o.id);
      const listed = new Set(items.map((i) => i.id));
      if (!rej.length || rej.some((id) => !listed.has(id))) p.push(`list ${items.length} ไม่ครบ REJECTED ${rej.length}`);
      if (items.some((i) => i.status && i.status !== "REJECTED")) p.push("list มีแถวที่ไม่ใช่ REJECTED");
      if (rows.filter((o) => o.status === "SYNCED").some((o) => listed.has(o.id))) p.push("list มี SYNCED");
      const forged = rows.find((o) => o.status === "REJECTED" && o.reason === "PRICE_MISMATCH");
      // สิทธิ์
      for (const [k, fn] of [
        ["list", () => call(offMod, "listOfflineRejected", ctxU("A"), A("CASH"), {})],
        ["accept", () => call(offMod, "acceptOfflineSale", ctxU("A"), A("CASH"), { id: forged?.id ?? "none" })],
        ["discard", () => call(offMod, "discardOfflineSale", ctxU("A"), A("CASH"), { id: forged?.id ?? "none", reason: "แคชเชียร์ทิ้งเอง" })],
      ] as [string, () => Promise<Any>][]) {
        const r = await fn();
        if (r?.ok !== false || r?.code !== "PERMISSION_DENIED") p.push(`แคชเชียร์ ${k} → ${codeOf(r)}`);
      }
      // accept ×2 (บิลของ SY7)
      const a2 = await call(offMod, "acceptOfflineSale", ctxU("A"), A("OWNER"), { id: SY7_OFFID || "none" });
      if (a2?.ok !== true || String(a2.saleId) !== SY7_SALE || !SY7_SALE) p.push(`accept ซ้ำ ${codeOf(a2)} sale ${a2?.saleId ?? "-"} vs ${SY7_SALE || "-"}`);
      const nSale = SY7_SALE ? Number(await P.posSale.count({ where: { tenantId: T, offlineRef: (await saleRow(SY7_SALE))?.offlineRef ?? "@@" } }).catch(() => -1)) : -1;
      if (nSale !== 1) p.push(`บิลของรายการ accept ${nSale}`);
      const aa = SY7_SALE ? await audits(AUDIT_SYNCED, SY7_SALE) : [];
      if (aa.length !== 1 || aa[0]?.after?.via !== "manager" || aa[0]?.actorId !== uid("OWNER")) p.push(`audit accept ${aa.length} via ${aa[0]?.after?.via ?? "-"}`);
      // discard ×2
      const short4 = await call(offMod, "discardOfflineSale", ctxU("A"), A("OWNER"), { id: forged?.id ?? "none", reason: "ผิด" });
      if (short4?.ok !== false || short4?.code !== "VALIDATION") p.push(`เหตุผลสั้น → ${codeOf(short4)}`);
      const d1 = await call(offMod, "discardOfflineSale", ctxU("A"), A("OWNER"), { id: forged?.id ?? "none", reason: "ราคาไม่ตรง ตรวจลิ้นชักแล้ว" });
      const d2 = await call(offMod, "discardOfflineSale", ctxU("A"), A("OWNER"), { id: forged?.id ?? "none", reason: "ราคาไม่ตรง ตรวจลิ้นชักแล้ว" });
      if (d1?.ok !== true || d2?.ok !== true) p.push(`discard ×2 ${codeOf(d1)}/${codeOf(d2)}`);
      const fr = forged ? (await offRows({ id: forged.id }))[0] : null;
      if (fr?.status !== "DISCARDED" || fr?.saleId || fr?.resolvedByUserId !== uid("OWNER")) p.push(`แถวทิ้ง ${short(fr && { s: fr.status, by: fr.resolvedByUserId }, 50)}`);
      const ad = forged ? await audits(AUDIT_DISCARDED, forged.id) : [];
      if (ad.length !== 1 || !String(ad[0]?.after?.reason ?? "").includes("ราคาไม่ตรง")) p.push(`audit discard ${ad.length}`);
      const ax = await call(offMod, "acceptOfflineSale", ctxU("A"), A("OWNER"), { id: forged?.id ?? "none" });
      if (ax?.ok !== false) p.push(`accept หลัง discard → ${codeOf(ax)}`);
      const dx = await call(offMod, "discardOfflineSale", ctxU("A"), A("OWNER"), { id: SY7_OFFID || "none", reason: "ทิ้งหลังรับแล้ว" });
      if (dx?.ok !== false) p.push(`discard หลัง accept → ${codeOf(dx)}`);
      const ox = await call(offMod, "listOfflineRejected", ctxU("X"), A("OWNER2"), {});
      if (ox?.ok === true && Array.isArray(ox.items) && ox.items.length) p.push(`ร้าน T2 เห็นคิว ${ox.items.length}`);
    }
    if (!NO_FX("SY17")) chk("SY17", p.length === 0, "list REJECTED · สิทธิ์ · accept ×2 · discard ×2 · ลำดับสถานะ · audit", FXB(joinP(p)));
  }

  // ═════ SEC1 ═════
  {
    const p: string[] = [];
    if (!fx) {
      const s = SN.D1;
      if (!isRecord(s)) p.push(`ไม่มี snapshot D1 (${notes.find((n) => n.startsWith("snapshot D1")) ?? "?"})`);
      else {
        const bad: string[] = [];
        const scan = (v: unknown, path: string) => {
          if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${path}[${i}]`));
          else if (isRecord(v))
            for (const [k, x] of Object.entries(v)) {
              if (FORBIDDEN_KEY.test(k)) bad.push(`${path}.${k}`);
              scan(x, `${path}.${k}`);
            }
        };
        scan(s, "snapshot");
        if (bad.length) p.push(`คีย์ต้องห้าม ${bad.slice(0, 4).join(",")}`);
        const prods: Any[] = Array.isArray(s.products) ? s.products : [];
        const extra = [...new Set(prods.flatMap((x) => Object.keys(x ?? {})).filter((k) => !PRODUCT_WHITELIST.has(k)))];
        if (extra.length) p.push(`คีย์สินค้านอก whitelist: ${extra.join(",")}`);
        const price = (id: string) => prods.find((x) => x?.id === id)?.priceSatang;
        for (const [k, want] of [["water", 1000], ["cake", 4500], ["tea", 5000], ["latte", 6500]] as const) if (price(PR[k]!) !== want) p.push(`${k} ${price(PR[k]!) ?? "ไม่มี"} (คาด ${want})`);
        const lat = prods.find((x) => x?.id === PR.latte);
        if (!Array.isArray(lat?.choices) || !lat.choices.some((c: Any) => c.choiceId === CHO.shot && c.priceDeltaSatang === 1500)) p.push(`latte choices ${short(lat?.choices, 60)}`);
        if (!s.hash || !s.offlineCode || !near(new Date(String(s.issuedAt)), T0 - 5 * H)) p.push(`hash/offlineCode/issuedAt ${short({ h: s.hash, c: s.offlineCode, i: s.issuedAt }, 80)}`);
        if (!isRecord(s.vat)) p.push("ไม่มี vat");
        try {
          const row = await P.posOfflineSnapshot.findFirst({ where: { tenantId: T, hash: String(s.hash) } });
          if (!row || ![DEVID.D1, DEV.D1].includes(row.deviceId)) p.push(`PosOfflineSnapshot ${short(row && row.deviceId, 30)}`);
          else if (row.priceMap?.[PR.cake] !== 4500 || row.priceMap?.[PR.water] !== 1000) p.push(`priceMap ${short(row.priceMap, 60)}`);
        } catch (e) {
          p.push(`PosOfflineSnapshot: ${(e as Error).message.slice(0, 60)}`);
        }
      }
    }
    if (!NO_FX("SEC1")) chk("SEC1", p.length === 0, "whitelist · ไม่มีคีย์ต้องห้าม · ราคาหน้าร้าน ณ issuedAt · priceMap", FXB(joinP(p)));
  }

  // ═════ SEC2 route + เครื่องของสาขาอื่น ═════
  {
    const p: string[] = [];
    const rt = srcOf(F.route);
    if (!rt) p.push(`${F.route} ยังไม่มี`);
    else {
      if (/^\s*["']use server["']/.test(rt)) p.push("route เป็น use server");
      if (!/export\s+(async\s+)?(function|const)\s+POST\b/.test(rt)) p.push("ไม่มี POST");
      if (!/@\/lib\/core\/context/.test(rt)) p.push("ไม่ใช้ session (@/lib/core/context)");
      // pos.sale.create ตรวจที่ facade (SY13 NOPERM) — route ต้องส่งผู้ใช้ session ให้ syncOfflineSales เท่านั้น
      if (!/syncOfflineSales/.test(rt)) p.push("ไม่เรียก syncOfflineSales");
      if (/prisma\./.test(rt)) p.push("route แตะ prisma ตรง");
    }
    if (!fx) {
      const c0 = await counts();
      const r1 = await sync("DB", [mkItem("DB", { lines: [W(1)], total: 1000, soldAt: T0 - 20 * MIN, shift: null })], { ctx: ctxU("A", DEV.DB) });
      if (r1?.ok !== false || String(r1?.code ?? "").startsWith("MISSING")) p.push(`สาขา A + เครื่อง B → ${codeOf(r1)}`);
      const r2 = await sync("D1", [mkItem("D1", { lines: [W(1)], total: 1000, soldAt: T0 - 20 * MIN, shift: null })], { ctx: ctxU("B", DEV.D1) });
      if (r2?.ok !== false || String(r2?.code ?? "").startsWith("MISSING")) p.push(`สาขา B + เครื่อง A → ${codeOf(r2)}`);
      const d = deltaOf(c0, await counts());
      if (d.length) p.push(`เขียนแถว ${d.join(",")}`);
    }
    chk("SEC2", p.length === 0, "route session/POST/syncOfflineSales · ข้ามสาขาปฏิเสธ 0 แถว", FXB(joinP(p)));
  }

  // ═════ SEC3 snapshot ต่อเครื่อง ═════
  {
    const p: string[] = [];
    if (!fx) {
      const foreign = mkItem("D1", { lines: [W(1)], total: 1000, soldAt: T0 - 15 * MIN, hash: String(SN.D2?.hash ?? "none-d2") });
      const r = await sync("D1", [foreign]);
      const x = resOf(r, foreign.offlineRef);
      if (x?.status !== "REJECTED" || x?.saleId) p.push(`hash ของ D2 บน D1 ${stOf(x)} ${why(r)}`);
      const hs: string[] = [];
      for (const [i, price] of [1600, 1700, 1800].entries()) {
        const sp = await call(catalog, "setPrice", cc(), PR.gum, price);
        if (sp?.ok === false) p.push(`setPrice gum ${price} ${codeOf(sp)}`);
        // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 fix1 N4 · CD-P34g): เก็บทุก snapshot ภายใน 24 ชม. ∪ 2 ล่าสุด ⇒ สองใบแรกออกเมื่อ 30/29 ชม.ก่อน (ใบแรกพ้นทั้งสองเกณฑ์ = ถูกตัด)
        // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 fix2 G3 · CD-P34i): หน้าต่างเก็บ = 48 ชม. ⇒ สองใบแรกออกเมื่อ 60/59 ชม.ก่อน
        const sn = await issue("D5", i === 2 ? Date.now() - MIN : Date.now() - (60 - i) * H);
        hs.push(String(sn?.snapshot?.hash ?? `none${i}`));
      }
      if (new Set(hs).size !== 3) p.push(`hash ไม่ต่างกัน ${hs.join(",")}`);
      const n = Number((await Promise.resolve(P.posOfflineSnapshot?.count?.({ where: { tenantId: T, deviceId: { in: [DEVID.D5, DEV.D5] } } })).catch(() => -1)) ?? -1);
      if (n !== 2) p.push(`PosOfflineSnapshot ของ D5 ${n} แถว (คาด 2)`);
      const evicted = mkItem("D5", { lines: [W(1)], total: 1000, soldAt: Date.now() - MIN, shift: null, hash: hs[0] });
      const kept = mkItem("D5", { lines: [W(1)], total: 1000, soldAt: Date.now() - MIN + 1000, shift: null, hash: hs[2] });
      const r5 = await sync("D5", [evicted, kept]);
      if (resOf(r5, evicted.offlineRef)?.status !== "REJECTED") p.push(`hash ที่ถูกตัด ${stOf(resOf(r5, evicted.offlineRef))} ${why(r5)}`);
      if (resOf(r5, kept.offlineRef)?.status !== "OK") p.push(`hash ล่าสุด ${stOf(resOf(r5, kept.offlineRef))}`);
    }
    if (!NO_FX("SEC3")) chk("SEC3", p.length === 0, "hash ของเครื่องอื่น REJECTED · เก็บ 2 · hash ถูกตัด REJECTED · ล่าสุด OK", FXB(joinP(p)));
  }

  // ═════ RS REST ═════
  {
    const bundle = (id: string): string[] => {
      try {
        return scopesMod.expandBundles([id]);
      } catch {
        return [];
      }
    };
    const mkKey = async (label: string, scopes: string[]): Promise<{ id: string; raw: string } | null> =>
      fstep(`createApiKey ${label}`, async () => {
        const k = await akSvc.createApiKey({ tenantId: T }, `QC P3.4 ${label} ${RAND}`, { scopes, systemId: S.POS });
        keyIds.push(k.id);
        return { id: k.id as string, raw: k.rawKey as string };
      });
    const K: Record<string, { id: string; raw: string } | null> = {};
    if (!fx) {
      K.sync = await mkKey("sync", [...bundle("pos-operate"), SCOPE_KEY]);
      K.op = await mkKey("operate", bundle("pos-operate"));
    }
    const raw = (k: string) => K[k]?.raw ?? `shark_none_${k}`;
    const keyScopes = K.sync ? (((await P.apiKey.findUnique({ where: { id: K.sync.id }, select: { scopesJson: true } }).catch(() => null))?.scopesJson as string[] | undefined) ?? []) : [];
    const keyNote = K.sync && !keyScopes.includes(SCOPE_KEY) ? ` · คีย์ไม่ได้ scope ${SCOPE_KEY} (ยังไม่ใช่ scope ที่รู้จัก)` : "";
    const body = (items: Any[], dev = DEV.D6, unit = U.A) => ({ unitId: unit, deviceId: dev, items });
    // RS1
    let RS_ITEM: Any = null;
    let RS_SALE = "";
    let RS_BODY: Any = null;
    {
      const p: string[] = [];
      if (!fx) {
        RS_ITEM = mkItem("D6", { lines: [W(1)], total: 1000, soldAt: T0 - 10 * MIN, shift: null });
        const r = await api("POST", "/sync/sales", raw("sync"), { body: body([RS_ITEM]), idem: `p34-${RAND}-rs` });
        const res: Any[] = Array.isArray(r.body?.data?.results) ? r.body.data.results : [];
        const x = res.find((i) => i?.offlineRef === RS_ITEM.offlineRef);
        if (r.status !== 200 || res.length !== 1 || x?.status !== "OK" || !x?.saleId || !x?.receiptNo) p.push(`${st(r)} ${short(r.body?.data ?? r.body?.error, 80)}${keyNote}`);
        RS_SALE = String(x?.saleId ?? "");
        RS_BODY = r.body?.data ?? null;
        const s = await saleRow(RS_SALE);
        if (RS_SALE && s?.offlineRef !== RS_ITEM.offlineRef) p.push(`บิล offlineRef ${s?.offlineRef}`);
      }
      if (!NO_FX("RS1")) chk("RS1", p.length === 0, "200 results[1] OK saleId receiptNo · บิลมี offlineRef", FXB(joinP(p)));
    }
    // RS2
    {
      const p: string[] = [];
      if (!fx && RS_ITEM) {
        const before = await countT("PosSale");
        const r = await api("POST", "/sync/sales", raw("sync"), { body: body([RS_ITEM]), idem: `p34-${RAND}-rs` });
        if (r.status !== 200 || r.headers.get("idempotent-replayed") !== "true") p.push(`replay ${st(r)} replayed=${r.headers.get("idempotent-replayed")}`);
        const first = r.body?.data?.results?.[0];
        if (first?.saleId !== RS_SALE || !RS_SALE) p.push(`replay saleId ${first?.saleId ?? "-"}`);
        if (stable(r.body?.data) !== stable(RS_BODY)) p.push("replay data ไม่เหมือนครั้งแรก");
        await P.apiIdempotency.deleteMany({ where: { tenantId: T, keyId: K.sync?.id ?? "none" } }).catch(() => {});
        const r2 = await api("POST", "/sync/sales", raw("sync"), { body: body([RS_ITEM]), idem: `p34-${RAND}-rs` });
        const x2 = r2.body?.data?.results?.[0];
        if (r2.status !== 200 || x2?.status !== "DUPLICATE" || x2?.saleId !== RS_SALE) p.push(`หลังลบแถวกันซ้ำ ${st(r2)} ${stOf(x2)}`);
        const after = await countT("PosSale");
        if (after !== before) p.push(`บิล ${before}→${after}`);
      } else if (!fx) p.push("RS1 ไม่มีรายการ");
      if (!NO_FX("RS2")) chk("RS2", p.length === 0, "replay true · DUPLICATE saleId เดิม · 1 บิล", FXB(joinP(p)));
    }
    // RS3
    {
      const p: string[] = [];
      if (!fx) {
        const c0 = await counts();
        const many = Array.from({ length: 51 }, (_, i) => mkItem("D6", { lines: [W(1)], total: 1000, soldAt: T0 - 9 * MIN + i * 1000, shift: null }));
        const r1 = await api("POST", "/sync/sales", raw("sync"), { body: body(many) });
        if (r1.status !== 422) p.push(`51 รายการ → ${st(r1)}`);
        const odd = { ...mkItem("D6", { lines: [W(1)], total: 1000, soldAt: T0 - 8 * MIN, shift: null }), extraKey: "x" };
        const r2 = await api("POST", "/sync/sales", raw("sync"), { body: body([odd]) });
        if (r2.status !== 422) p.push(`คีย์แปลก → ${st(r2)}`);
        const d = deltaOf(c0, await counts()).filter((x) => !x.startsWith("AuditLog"));
        if (d.length) p.push(`เขียนแถว ${d.join(",")}`);
      }
      if (!NO_FX("RS3")) chk("RS3", p.length === 0, "422 ×2 · ไม่มีบิล/แถวใหม่", FXB(joinP(p)));
    }
    // RS4
    {
      const p: string[] = [];
      if (!fx) {
        const c0 = await counts();
        const r1 = await api("POST", "/sync/sales", raw("op"), { body: body([mkItem("D6", { lines: [W(1)], total: 1000, soldAt: T0 - 7 * MIN, shift: null })]) });
        if (!(r1.status === 403 && ecode(r1) === "scope_missing")) p.push(`ไม่มี scope → ${st(r1)}`);
        const r2 = await api("POST", "/sync/sales", raw("sync"), { body: body([mkItem("DB", { lines: [W(1)], total: 1000, soldAt: T0 - 7 * MIN, shift: null })], DEV.DB, U.A) });
        if (!(r2.status === 404 && ecode(r2) === "not_found")) p.push(`เครื่องสาขาอื่น → ${st(r2)}`);
        const d = deltaOf(c0, await counts()).filter((x) => !x.startsWith("AuditLog"));
        if (d.length) p.push(`เขียนแถว ${d.join(",")}`);
      }
      if (!NO_FX("RS4")) chk("RS4", p.length === 0, "403 scope_missing · 404 not_found · ไม่เขียน", FXB(joinP(p)));
    }
  }
  // RS5 (ไม่ต้องมีฟิกซ์เจอร์)
  {
    const p: string[] = [];
    const ops: Any[] = Array.isArray(regMod?.POS_OPS) ? regMod.POS_OPS : [];
    if (ops.length !== OPS_TOTAL) p.push(`POS_OPS ${ops.length}`);
    const so = ops.find((o) => o?.id === "sync.sales");
    if (!so || so.method !== "POST" || so.path !== "/sync/sales" || so.action !== SCOPE_KEY) p.push(`sync.sales ${short(so && { m: so.method, p: so.path, a: so.action }, 60)}`);
    if (typeof oaRoute?.GET !== "function") p.push("openapi.json route โหลดไม่ได้");
    else {
      try {
        const spec = await (await oaRoute.GET(new Request("http://x/api/v1/pos/openapi.json"))).json();
        const n = Object.values(spec?.paths ?? {}).reduce((a: number, v: Any) => a + Object.keys(v ?? {}).length, 0);
        if (n !== OPS_TOTAL) p.push(`openapi ${n} operation`);
        if (!spec?.paths?.["/sync/sales"]?.post) p.push("openapi ไม่มี /sync/sales post");
      } catch (e) {
        p.push(`openapi.json: ${(e as Error).message.slice(0, 60)}`);
      }
    }
    if (typeof scopesMod?.isApiScope !== "function" || !scopesMod.isApiScope(SCOPE_KEY)) p.push(`isApiScope(${SCOPE_KEY}) false`);
    if (!Array.isArray(scopesMod?.POS_SCOPE_KEYS) || !scopesMod.POS_SCOPE_KEYS.includes(SCOPE_KEY)) p.push(`POS_SCOPE_KEYS ไม่มี ${SCOPE_KEY}`);
    chk("RS5", p.length === 0, `${OPS_TOTAL} op · openapi ${OPS_TOTAL} + /sync/sales · scope ของคีย์`, joinP(p));
  }
  // ═════ fix1 (CD-P34g) — เครื่องใหม่ N1–N6 ของรอบแก้ (snapshot เมื่อ 40 นาทีก่อน · ไม่มีกะ) ═════ // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix1 N1)
  const NOW1 = Date.now();
  if (!fx) {
    await fstep("fix1 เครื่อง N1–N6", async () => {
      for (const k of ["N1", "N2", "N3", "N4", "N5", "N6"]) {
        DEV[k] = `p34${RAND}${k.toLowerCase()}dev`;
        const r = must(`registerDevice ${k}`, await call(devMod, "registerDevice", ctxU("A"), A("OWNER"), { name: `เครื่อง ${k} ${RAND}`, deviceCode: DEV[k] }));
        DEVID[k] = String(r.device?.id ?? "");
        const sn = await issue(k, NOW1 - 40 * MIN);
        if (sn?.ok === true && isRecord(sn.snapshot)) SN[k] = sn.snapshot;
        else notes.push(`snapshot ${k}: ${codeOf(sn)}`);
      }
    });
  }
  // ═════ SY18 ผู้ขายที่ตรวจแล้ว (N1) ═════
  {
    const p: string[] = [];
    if (!fx) {
      const forged = `${Buffer.from(JSON.stringify({ u: uid("OWNER"), e: NOW1 + 6 * H, v: "-" })).toString("base64url")}.forgedsignature000000`;
      const disc = () => [{ productId: PR.water, qty: 1, discount: { type: "PERCENT", value: 5000 } }];
      const iTok = mkItem("N1", { lines: disc(), total: 500, soldAt: NOW1 - 30 * MIN, shift: null, staffToken: forged });
      const iClaim = mkItem("N1", { lines: disc(), total: 500, soldAt: NOW1 - 29 * MIN, shift: null, sellerUserId: uid("OWNER") });
      const r = await sync("N1", [iTok, iClaim], { actor: "CASH" });
      for (const [k, it] of [["โทเคนปลอม", iTok], ["อ้างผู้ขาย", iClaim]] as const) {
        const x = resOf(r, it.offlineRef);
        if (x?.status !== "REJECTED" || x?.saleId) p.push(`รอบแรก ${k} ${stOf(x)} ${why(r)}`);
      }
      const ls = await call(offMod, "listOfflineRejected", ctxU("A"), A("OWNER"), { limit: 200 });
      for (const [k, it] of [["โทเคนปลอม", iTok], ["อ้างผู้ขาย", iClaim]] as const) {
        const row = await offRowOf(it.offlineRef);
        const li = (Array.isArray(ls?.items) ? ls.items : []).find((x: Any) => x?.id === row?.id);
        if (li?.claimedSellerUserId !== uid("OWNER") || li?.verifiedSellerUserId !== uid("CASH")) p.push(`list ${k} claimed ${li?.claimedSellerUserId ?? "-"} verified ${li?.verifiedSellerUserId ?? "-"}`);
        if (JSON.stringify(row?.payload ?? "").includes("forgedsignature")) p.push(`${k} payload เก็บโทเคน`);
        const ac = await call(offMod, "acceptOfflineSale", ctxU("A"), A("OWNER"), { id: String(row?.id ?? "none") });
        if (ac?.ok === true) {
          const s = await saleRow(ac.saleId);
          p.push(`accept ${k} ได้บิล (soldBy ${s?.soldByUserId === uid("OWNER") ? "OWNER" : s?.soldByUserId ?? "-"} · ต้องปฏิเสธด้วยเพดานของ CASH)`);
        }
        const n = Number(await P.posSale.count({ where: { tenantId: T, offlineRef: it.offlineRef } }).catch(() => -1));
        if (n !== 0) p.push(`${k} มีบิล ${n}`);
      }
    }
    if (!NO_FX("SY18")) chk("SY18", p.length === 0, "REJECTED ×2 · claimed/verified แยก · accept ปฏิเสธ (เพดาน CASH) · ไม่มีบิล", FXB(joinP(p)));
  }
  // ═════ SY19 กะของบิล (N2 = F3) ═════ // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix1 N2)
  {
    const p: string[] = [];
    if (!fx) {
      const a = mkItem("D7", { lines: [W(1)], total: 1000, soldAt: T0 - 60 * MIN, sellerUserId: uid("CASH2") });
      const b = mkItem("D7", { lines: [W(1)], total: 1000, soldAt: T0 - 4 * H - 10 * MIN, shift: null });
      const r = await sync("D7", [a, b]);
      const xa = resOf(r, a.offlineRef);
      const xb = resOf(r, b.offlineRef);
      if (xa?.status !== "REJECTED" || xa?.reason !== "SELLER_MISMATCH") p.push(`ผู้ขายไม่ตรง ${stOf(xa)} ${why(r)}`);
      const ac = await call(offMod, "acceptOfflineSale", ctxU("A"), A("OWNER"), { id: String(xa?.offlineSaleId ?? "none") });
      const s = ac?.ok === true ? await saleRow(ac.saleId) : null;
      if (ac?.ok !== true || !s || s.shiftId !== SH.D7) p.push(`accept ${codeOf(ac)} shiftId ${s?.shiftId ?? "-"} (คาด กะ D7 ที่ยังเปิด ${SH.D7})`);
      if (xb?.status !== "REJECTED" || xb?.reason !== "SHIFT_REQUIRED" || xb?.saleId) p.push(`ช่องว่างก่อนเปิดกะ ไม่ส่ง shiftId ${stOf(xb)} (คาด REJECTED:SHIFT_REQUIRED)`);
      const nb = Number(await P.posSale.count({ where: { tenantId: T, offlineRef: b.offlineRef } }).catch(() => -1));
      if (nb !== 0) p.push(`ช่องว่าง มีบิล ${nb}`);
      // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 fix2 G1 · CD-P34i): อ้างกะ A ที่ปิดแล้ว ขณะ soldAt อยู่ในกะ B ที่เปิด ⇒ ไม่ใช่ SHIFT_CLOSED · ผู้จัดการรับ = ผูกกะ B
      {
        const oa = await call(shiftMod, "openShift", ctxU("A", DEV.N2), A("OWNER"), { deviceId: DEV.N2, deviceLabel: "เครื่อง N2", floatSatang: 0 });
        const shA = String(oa?.shift?.id ?? "");
        const ca = shA ? await call(shiftMod, "closeShift", ctxU("A", DEV.N2), A("OWNER"), { shiftId: shA, countedCashSatang: 0, note: "ปิดกะ A ก่อนเปิด B", idempotencyKey: newKey("closeA") }) : null;
        if (!shA || ca?.ok !== true) p.push(`กะ A ${codeOf(oa)} / ปิด ${codeOf(ca)}`);
        await P.$executeRawUnsafe(`UPDATE "PosShift" SET "openedAt" = $1, "closedAt" = $2 WHERE id = $3 AND "tenantId" = $4`, new Date(Date.now() - 3 * H), new Date(Date.now() - 90 * MIN), shA || "none", T);
        const ob = await call(shiftMod, "openShift", ctxU("A", DEV.N2), A("OWNER"), { deviceId: DEV.N2, deviceLabel: "เครื่อง N2", floatSatang: 0 });
        const shB = String(ob?.shift?.id ?? "");
        if (!shB) p.push(`กะ B ${codeOf(ob)}`);
        await P.$executeRawUnsafe(`UPDATE "PosShift" SET "openedAt" = $1 WHERE id = $2 AND "tenantId" = $3`, new Date(Date.now() - 60 * MIN), shB || "none", T);
        const c = mkItem("N2", { lines: [W(1)], total: 1000, soldAt: Date.now() - 30 * MIN, shift: shA || null });
        const rc = await sync("N2", [c]);
        const xc = resOf(rc, c.offlineRef);
        if (xc?.status !== "REJECTED" || xc?.reason === "SHIFT_CLOSED" || xc?.saleId) p.push(`อ้างกะ A ที่ไม่ครอบ soldAt ${stOf(xc)} (คาด REJECTED ที่ไม่ใช่ SHIFT_CLOSED) ${why(rc)}`);
        const acc = await call(offMod, "acceptOfflineSale", ctxU("A"), A("OWNER"), { id: String(xc?.offlineSaleId ?? "none") });
        const sc2 = acc?.ok === true ? await saleRow(acc.saleId) : null;
        if (acc?.ok !== true || !shB || sc2?.shiftId !== shB) p.push(`accept อ้างกะ A ${codeOf(acc)} shiftId ${sc2?.shiftId ?? "-"} (คาด กะ B ${shB || "-"})`);
      }
    }
    if (!NO_FX("SY19")) chk("SY19", p.length === 0, "accept ผูกกะ D7 ที่เปิด · ไม่มีกะครอบ + เครื่องมีกะเปิด → SHIFT_REQUIRED", FXB(joinP(p)));
  }
  // ═════ SY20 เวลาราคา (N3) ═════ // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix1 N3)
  {
    const p: string[] = [];
    if (!fx) {
      // (a) priceValidUntil ของ snapshot N3 = 35 นาทีก่อน (SQL ดิบเฉพาะแถวของร้านชั่วคราว) · ขายเมื่อ 10 นาทีก่อน = เลย pvu + 15 นาที
      const h3 = String(SN.N3?.hash ?? "none");
      await P.$executeRawUnsafe(`UPDATE "PosOfflineSnapshot" SET "priceMap" = jsonb_set("priceMap", '{$priceValidUntil}', to_jsonb($1::text)) WHERE "tenantId" = $2 AND hash = $3`, iso(NOW1 - 35 * MIN), T, h3).catch((e: Error) => p.push(`ตั้ง pvu ไม่ได้ ${e.message.slice(0, 40)}`));
      const ia = mkItem("N3", { lines: [W(1)], total: 1000, soldAt: Date.now() - 10 * MIN, shift: null });
      const ra = await sync("N3", [ia]);
      const xa = resOf(ra, ia.offlineRef);
      if (xa?.status !== "REJECTED" || xa?.reason !== "CLOCK_INVALID" || xa?.saleId) p.push(`เลย pvu + 15 นาที ${stOf(xa)} ${why(ra)}`);
      // (b) โปรชาเขียว ณ soldAt (T0−150 นาที) ซิงก์ตอนนี้ (โปรจบแล้ว)
      const ib = mkItem("D1", { lines: [{ productId: PR.tea, qty: 1 }], total: 3000, soldAt: T0 - 150 * MIN });
      const rb = await sync("D1", [ib]);
      const xb = resOf(rb, ib.offlineRef);
      if (xb?.status !== "REJECTED" || xb?.reason !== "PRICE_WINDOW_REVIEW" || xb?.saleId) p.push(`โปรซิงก์ช้า ${stOf(xb)} ${why(rb)}`);
      const ab = await call(offMod, "acceptOfflineSale", ctxU("A"), A("OWNER"), { id: String(xb?.offlineSaleId ?? "none") });
      const sb = ab?.ok === true ? await saleRow(ab.saleId) : null;
      if (ab?.ok !== true || sb?.grandTotalSatang !== 3000) p.push(`accept โปร ${codeOf(ab)} ยอด ${sb?.grandTotalSatang ?? "-"}`);
      // (c) audit priceAtSyncSatang
      const ic = mkItem("D2", { lines: [W(1)], total: 1000, soldAt: Date.now() - 5 * MIN, shift: null });
      const rc = await sync("D2", [ic]);
      const xc = resOf(rc, ic.offlineRef);
      const au = xc?.saleId ? await audits(AUDIT_SYNCED, String(xc.saleId)) : [];
      if (xc?.status !== "OK" || au[0]?.after?.priceAtSyncSatang !== 1000) p.push(`audit priceAtSyncSatang ${stOf(xc)} ${short(au[0]?.after?.priceAtSyncSatang, 20)}`);
      const codes = sh?.OFFLINE_REFUSAL_CODES ?? (await import("@/lib/modules/pos/offline-shared" as string).catch(() => null))?.OFFLINE_REFUSAL_CODES;
      if (!Array.isArray(codes) || !codes.includes("PRICE_WINDOW_REVIEW")) p.push("OFFLINE_REFUSAL_CODES ไม่มี PRICE_WINDOW_REVIEW");
      const mk = (await import("@/lib/modules/pos/offline-shared" as string).catch(() => null))?.offlineRefusalMessageKey?.("PRICE_WINDOW_REVIEW");
      const th = readJson(rd(F.thPos));
      const en = readJson(rd(F.enPos));
      if (!mk || mk === "offline.refusal.other" || !THAI.test(String(getPath(th?.register, mk) ?? "")) || !String(getPath(en?.register, mk) ?? "").trim() || THAI.test(String(getPath(en?.register, mk) ?? ""))) p.push(`ข้อความ PRICE_WINDOW_REVIEW ${mk ?? "-"}`);
      // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 fix2 G2 N6 · CD-P34i): (d) บิลโปรที่มีสินค้าที่ถูก 86 ตอนซิงก์ → ยังเข้าคิว PRICE_WINDOW_REVIEW (ราคาตอนซิงก์คิดทางออฟไลน์ ไม่ใช้ด่าน 86)
      {
        const off86 = await call(catalog, "setAvailability", ctxU("A"), A("OWNER"), { productId: PR.gum, unitId: U.A, available: false, source: "MANUAL" });
        if (off86?.ok === false) p.push(`86 หมากฝรั่ง ${codeOf(off86)}`);
        const gumNow = Number(((await P.posProduct.findFirst({ where: { tenantId: T, id: PR.gum }, select: { basePriceSatang: true } }).catch(() => null)) as Any)?.basePriceSatang ?? 1800);
        const id = mkItem("D1", { lines: [{ productId: PR.tea, qty: 1 }, { productId: PR.gum, qty: 1 }], total: 3000 + gumNow, soldAt: T0 - 140 * MIN });
        const rd2 = await sync("D1", [id]);
        const xd = resOf(rd2, id.offlineRef);
        if (xd?.status !== "REJECTED" || xd?.reason !== "PRICE_WINDOW_REVIEW" || xd?.saleId) p.push(`โปร + สินค้า 86 ${stOf(xd)} ${why(rd2)} (คาด PRICE_WINDOW_REVIEW)`);
        await call(catalog, "setAvailability", ctxU("A"), A("OWNER"), { productId: PR.gum, unitId: U.A, available: true, source: "MANUAL" });
      }
      // (e) ทาง snapshot: soldAt ∈ (pvu, pvu + 15 นาที] ซิงก์ช้า 2 ชม. + ราคา snapshot ถูกกว่าราคาตอนซิงก์ → PRICE_WINDOW_REVIEW
      {
        DEV.N7 = `p34${RAND}n7dev`;
        const rg = await call(devMod, "registerDevice", ctxU("A"), A("OWNER"), { name: `เครื่อง N7 ${RAND}`, deviceCode: DEV.N7 });
        DEVID.N7 = String(rg?.device?.id ?? "");
        const sn7 = await issue("N7", Date.now() - 3 * H);
        if (sn7?.ok === true) SN.N7 = sn7.snapshot;
        else p.push(`snapshot N7 ${codeOf(sn7)}`);
        const gumSnap = Number((Array.isArray(SN.N7?.products) ? SN.N7.products : []).find((x: Any) => x?.id === PR.gum)?.priceSatang ?? -1);
        const up = await call(catalog, "setPrice", cc(), PR.gum, gumSnap + 200);
        if (up?.ok === false) p.push(`setPrice gum ${codeOf(up)}`);
        const soldE = Date.now() - 2 * H;
        await P.$executeRawUnsafe(`UPDATE "PosOfflineSnapshot" SET "priceMap" = jsonb_set("priceMap", '{$priceValidUntil}', to_jsonb($1::text)) WHERE "tenantId" = $2 AND hash = $3`, iso(soldE - 5 * MIN), T, String(SN.N7?.hash ?? "none"));
        const ie = mkItem("N7", { lines: [{ productId: PR.gum, qty: 1 }], total: gumSnap, soldAt: soldE, shift: null });
        const re = await sync("N7", [ie]);
        const xe = resOf(re, ie.offlineRef);
        if (xe?.status !== "REJECTED" || xe?.reason !== "PRICE_WINDOW_REVIEW" || xe?.saleId) p.push(`ทาง snapshot ในช่วงผ่อน pvu ซิงก์ช้า ${stOf(xe)} ${why(re)} (คาด PRICE_WINDOW_REVIEW)`);
      }
      // (f) ตัวควบคุมบวก: บิลโปรที่ซิงก์ภายใน 30 นาที (opts.now = soldAt + 20 นาที) → OK ยอด 3000
      {
        const soldF = T0 - 130 * MIN;
        const iF = mkItem("D1", { lines: [{ productId: PR.tea, qty: 1 }], total: 3000, soldAt: soldF });
        const rF = await sync("D1", [iF], { now: soldF + 20 * MIN });
        const xF = resOf(rF, iF.offlineRef);
        const sF = await saleRow(xF?.saleId);
        if (xF?.status !== "OK" || sF?.grandTotalSatang !== 3000) p.push(`โปรซิงก์ภายใน 30 นาที ${stOf(xF)} ยอด ${sF?.grandTotalSatang ?? "-"} ${why(rF)} (คาด OK 3000)`);
      }
    }
    if (!NO_FX("SY20")) chk("SY20", p.length === 0, "pvu + 15 นาที → CLOCK_INVALID · โปรซิงก์ช้า → PRICE_WINDOW_REVIEW → accept 3000 · audit priceAtSyncSatang · รหัส + ข้อความ", FXB(joinP(p)));
  }
  // ═════ SY21 snapshot ภายใน 24 ชม. (N4) ═════ // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix1 N4)
  {
    const p: string[] = [];
    if (!fx) {
      const h1 = String(SN.N4?.hash ?? "none-n4");
      const it = mkItem("N4", { lines: [W(1)], total: 1000, soldAt: Date.now() - 30 * MIN, shift: null, hash: h1 });
      for (const ago of [20, 10]) {
        const sn = await issue("N4", Date.now() - ago * MIN);
        if (sn?.ok !== true) p.push(`ออก snapshot ${ago} นาที ${codeOf(sn)}`);
      }
      const n = Number(await Promise.resolve(P.posOfflineSnapshot?.count?.({ where: { tenantId: T, deviceId: { in: [DEVID.N4, DEV.N4] } } })).catch(() => -1));
      if (n !== 3) p.push(`PosOfflineSnapshot ของ N4 ${n} แถว (คาด 3)`);
      const r = await sync("N4", [it]);
      const x = resOf(r, it.offlineRef);
      if (x?.status !== "OK" || !x?.saleId) p.push(`บิลบน S1 ${stOf(x)} ${why(r)}`);
    }
    if (!NO_FX("SY21")) chk("SY21", p.length === 0, "S1 ยังอยู่ (3 แถว) · บิลบน S1 OK", FXB(joinP(p)));
  }
  // ═════ SY22 คิวค้าง (N5) ═════ // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix1 N5)
  {
    const p: string[] = [];
    if (!fx) {
      // (a) จำลองล้มหลัง createSale ก่อน settle: แถวกลับเป็น PROCESSING เก่า 10 นาที ไม่มี saleId (SQL ดิบเฉพาะแถวของร้านชั่วคราว)
      const ia = mkItem("N5", { lines: [W(1)], total: 1000, soldAt: Date.now() - 20 * MIN, shift: null });
      const ra = await sync("N5", [ia]);
      const xa = resOf(ra, ia.offlineRef);
      if (xa?.status !== "OK" || !xa?.saleId) p.push(`ซิงก์ ${stOf(xa)} ${why(ra)}`);
      const rowA = await offRowOf(ia.offlineRef);
      await P.$executeRawUnsafe(`UPDATE "PosOfflineSale" SET status = 'REJECTED', reason = 'PROCESSING', "saleId" = NULL, "createdAt" = $1 WHERE id = $2 AND "tenantId" = $3`, new Date(Date.now() - 10 * MIN), String(rowA?.id ?? "none"), T);
      const da = await call(offMod, "discardOfflineSale", ctxU("A"), A("OWNER"), { id: String(rowA?.id ?? "none"), reason: "ทิ้งแถวค้างหลังล้ม" });
      const ra2 = await offRowOf(ia.offlineRef);
      if (ra2?.status !== "SYNCED" || ra2?.saleId !== xa?.saleId) p.push(`ทิ้งแถว PROCESSING ที่มีบิล → ${codeOf(da)} · แถว ${short(ra2 && { s: ra2.status, sale: ra2.saleId }, 60)} (คาด SYNCED + บิลเดิม)`);
      if ((await audits(AUDIT_DISCARDED, String(rowA?.id ?? "none"))).length) p.push("มี audit ทิ้ง");
      // (b) ACCEPTED_BY_MANAGER ไม่มี saleId (ล้มหลังจอง) → อยู่ใน list · รับซ้ำได้บิล
      const ib = mkItem("N5", { lines: [W(1)], total: 1000, soldAt: Date.now() - 19 * MIN, shift: null, sellerUserId: uid("CASH2") });
      const rb = await sync("N5", [ib]);
      const xb = resOf(rb, ib.offlineRef);
      if (xb?.status !== "REJECTED") p.push(`รายการ (b) ${stOf(xb)}`);
      await P.$executeRawUnsafe(`UPDATE "PosOfflineSale" SET status = 'ACCEPTED_BY_MANAGER', "resolvedByUserId" = $1 WHERE id = $2 AND "tenantId" = $3`, uid("OWNER"), String(xb?.offlineSaleId ?? "none"), T);
      const ls = await call(offMod, "listOfflineRejected", ctxU("A"), A("OWNER"), { limit: 200 });
      if (!(Array.isArray(ls?.items) && ls.items.some((x: Any) => x?.id === xb?.offlineSaleId && x?.status === "ACCEPTED_BY_MANAGER"))) p.push(`list ไม่มีแถว ACCEPTED_BY_MANAGER ที่ไม่มีบิล (${codeOf(ls)})`);
      const ab = await call(offMod, "acceptOfflineSale", ctxU("A"), A("OWNER"), { id: String(xb?.offlineSaleId ?? "none") });
      if (ab?.ok !== true || !ab?.saleId) p.push(`รับซ้ำ ${codeOf(ab)}`);
      // ORACLE-EDIT ผู้คุม 17 ต.ค. (P3.4 fix2 N9 · CD-P34i): (c) รายการที่ใช้คีย์ของบิลออนไลน์อื่น (IDEMPOTENCY_CONFLICT) → ทิ้ง = DISCARDED (ไม่ย้ายไปผูกบิลออนไลน์นั้น)
      {
        const key = newKey("n9");
        const on = await call(regFacade, "submitRegisterSale", ctxU("A", DEV.N5), A("OWNER"), { lines: [W(2)], payMethods: [{ type: "CASH", amountSatang: 2000 }], cashReceivedSatang: 2000, expectedGrandTotalSatang: 2000, idempotencyKey: key });
        if (on?.ok !== true) p.push(`บิลออนไลน์ ${codeOf(on)}`);
        const ic = mkItem("N5", { lines: [W(1)], total: 1000, soldAt: Date.now() - 18 * MIN, shift: null, key });
        const rc = await sync("N5", [ic]);
        const xc = resOf(rc, ic.offlineRef);
        if (xc?.status !== "REJECTED") p.push(`คีย์ชนบิลออนไลน์ ${stOf(xc)} ${why(rc)}`);
        const dc = await call(offMod, "discardOfflineSale", ctxU("A"), A("OWNER"), { id: String(xc?.offlineSaleId ?? "none"), reason: "คีย์ชนบิลออนไลน์อื่น" });
        const rowC = await offRowOf(ic.offlineRef);
        if (dc?.ok !== true || rowC?.status !== "DISCARDED" || rowC?.saleId) p.push(`ทิ้งรายการคีย์ชน → ${codeOf(dc)} · แถว ${short(rowC && { s: rowC.status, sale: rowC.saleId }, 60)} (คาด DISCARDED ไม่มี saleId)`);
      }
    }
    if (!NO_FX("SY22")) chk("SY22", p.length === 0, "PROCESSING ที่มีบิล → SYNCED (ไม่ทิ้ง) · ACCEPTED ไม่มีบิล อยู่ใน list + รับซ้ำได้", FXB(joinP(p)));
  }
  // ═════ SY23 ของหมดหลังขาย (F2) ═════ // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix1 F2)
  {
    const p: string[] = [];
    if (!fx) {
      const price = (id: string) => Number((Array.isArray(SN.N6?.products) ? SN.N6.products : []).find((x: Any) => x?.id === id)?.priceSatang ?? -1);
      const av = await call(catalog, "setAvailability", ctxU("A"), A("OWNER"), { productId: PR.gum, unitId: U.A, available: false, source: "MANUAL" });
      if (av?.ok === false) p.push(`setAvailability ${codeOf(av)}`);
      const i86 = mkItem("N6", { lines: [{ productId: PR.gum, qty: 1 }], total: price(PR.gum), soldAt: Date.now() - 15 * MIN, shift: null });
      const cakeAt = price(PR.cake);
      const ar = await call(catalog, "archive", cc(), PR.cake);
      if (ar?.ok === false) p.push(`archive เค้ก ${codeOf(ar)}`);
      const iArc = mkItem("N6", { lines: [{ productId: PR.cake, qty: 1 }], total: cakeAt, soldAt: Date.now() - 14 * MIN, shift: null });
      const r = await sync("N6", [i86, iArc]);
      const x86 = resOf(r, i86.offlineRef);
      const xa = resOf(r, iArc.offlineRef);
      if (x86?.status !== "OK" || !x86?.saleId) p.push(`หมากฝรั่ง 86 หลังขาย ${stOf(x86)} ${why(r)}`);
      if (xa?.status !== "REJECTED" || xa?.saleId) p.push(`เค้กเก็บถาวร ${stOf(xa)}`);
      await call(catalog, "setAvailability", ctxU("A"), A("OWNER"), { productId: PR.gum, unitId: U.A, available: true, source: "MANUAL" });
    }
    if (!NO_FX("SY23")) chk("SY23", p.length === 0, "86 หลังขาย OK · เก็บถาวร REJECTED", FXB(joinP(p)));
  }
  // ═════ SY24 เลข OFF มาตรฐาน (F6) ═════ // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix1 F6)
  {
    const p: string[] = [];
    if (!fx) {
      const c6 = String(SN.N6?.offlineCode ?? "C99");
      const bad = mkItem("N6", { lines: [W(1)], total: 1000, soldAt: Date.now() - 12 * MIN, shift: null, ref: `OFF-${c6}-00011` });
      const good = mkItem("N6", { lines: [W(1)], total: 1000, soldAt: Date.now() - 11 * MIN, shift: null, ref: `OFF-${c6}-0012` });
      const r = await sync("N6", [bad, good]);
      const xb = resOf(r, bad.offlineRef);
      const xg = resOf(r, good.offlineRef);
      if (xb?.status !== "REJECTED" || xb?.saleId) p.push(`ไม่มาตรฐาน ${stOf(xb)} ${why(r)}`);
      if (xg?.status !== "OK") p.push(`มาตรฐาน ${stOf(xg)}`);
    }
    if (!NO_FX("SY24")) chk("SY24", p.length === 0, "-00011 REJECTED · -0012 OK", FXB(joinP(p)));
  }
  // ═════ SY25 snapshot: เพดานอัตรา + ไม่ตัด hash ที่ยังอ้าง (N8) ═════ // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix2 N8)
  {
    const p: string[] = [];
    if (!fx) {
      for (const k of ["N8", "N9"]) {
        DEV[k] = `p34${RAND}${k.toLowerCase()}dev`;
        const rg = await call(devMod, "registerDevice", ctxU("A"), A("OWNER"), { name: `เครื่อง ${k} ${RAND}`, deviceCode: DEV[k] });
        DEVID[k] = String(rg?.device?.id ?? "");
      }
      const tq = Date.now() - 5 * MIN;
      const q1 = await issue("N8", tq);
      const q2 = await issue("N8", tq + 10_000);
      if (q1?.ok !== true || q2?.ok !== false || q2?.code !== "RATE_LIMITED") p.push(`ออกซ้ำใน 60 วิ ${codeOf(q1)} → ${codeOf(q2)} (คาด RATE_LIMITED)`);
      // N9: S1 เมื่อ 50 ชม.ก่อน · รายการที่อ้าง S1 ถูกปฏิเสธ (เก่ากว่า 24 ชม.) · แล้วออก S2 S3 ⇒ S1 ต้องยังอยู่
      const s1 = await issue("N9", Date.now() - 50 * H);
      if (s1?.ok === true) SN.N9 = s1.snapshot;
      else p.push(`S1 ${codeOf(s1)}`);
      const it = mkItem("N9", { lines: [W(1)], total: 1000, soldAt: Date.now() - 49 * H, shift: null, hash: String(SN.N9?.hash ?? "none") });
      const r = await sync("N9", [it]);
      if (resOf(r, it.offlineRef)?.status !== "REJECTED") p.push(`รายการบน S1 ${stOf(resOf(r, it.offlineRef))} ${why(r)}`);
      for (const ago of [3, 1]) {
        const sx = await issue("N9", Date.now() - ago * MIN);
        if (sx?.ok !== true) p.push(`ออก snapshot ${ago} นาที ${codeOf(sx)}`);
      }
      const n = Number(await P.posOfflineSnapshot.count({ where: { tenantId: T, deviceId: { in: [DEVID.N9, DEV.N9] } } }).catch(() => -1));
      const kept = Number(await P.posOfflineSnapshot.count({ where: { tenantId: T, hash: String(SN.N9?.hash ?? "none") } }).catch(() => -1));
      if (n !== 3 || kept !== 1) p.push(`PosOfflineSnapshot ของ N9 ${n} แถว · S1 ${kept} (คาด 3 · 1)`);
    }
    if (!NO_FX("SY25")) chk("SY25", p.length === 0, "RATE_LIMITED · hash ที่ยังอ้างไม่ถูกตัด", FXB(joinP(p)));
  }
  // ═════ SY26 ผู้ขายที่อ้าง ≠ ผู้ซิงก์ = เพดานต่ำกว่า (N7) ═════ // ORACLE-ADD ผู้คุม 17 ต.ค. (P3.4 fix2 N7)
  {
    const p: string[] = [];
    if (!fx) {
      const ln = (bp: number) => [{ productId: PR.water, qty: 1, discount: { type: "PERCENT", value: bp } }];
      const big = mkItem("N1", { lines: ln(5000), total: 500, soldAt: Date.now() - 25 * MIN, shift: null, sellerUserId: uid("CASH") });
      const small = mkItem("N1", { lines: ln(500), total: 950, soldAt: Date.now() - 24 * MIN, shift: null, sellerUserId: uid("CASH") });
      const alien = mkItem("N1", { lines: ln(500), total: 950, soldAt: Date.now() - 23 * MIN, shift: null, sellerUserId: uid("OWNER2") });
      const r = await sync("N1", [big, small, alien]);
      for (const it of [big, small, alien]) if (resOf(r, it.offlineRef)?.status !== "REJECTED") p.push(`รอบแรก ${it.offlineRef} ${stOf(resOf(r, it.offlineRef))} ${why(r)}`);
      const acc = async (it: Any) => call(offMod, "acceptOfflineSale", ctxU("A"), A("OWNER"), { id: String(resOf(r, it.offlineRef)?.offlineSaleId ?? "none") });
      const aBig = await acc(big);
      if (aBig?.ok === true) p.push(`ส่วนลด 50% ได้บิล (ต้องปฏิเสธด้วยเพดาน CASH)`);
      const aSmall = await acc(small);
      const sSmall = aSmall?.ok === true ? await saleRow(aSmall.saleId) : null;
      if (aSmall?.ok !== true || sSmall?.soldByUserId !== uid("OWNER")) p.push(`ส่วนลด 5% ${codeOf(aSmall)} soldBy ${sSmall?.soldByUserId ?? "-"}`);
      const aAlien = await acc(alien);
      if (aAlien?.ok !== false || aAlien?.code !== "SELLER_MISMATCH") p.push(`อ้างคนนอกสาขา → ${codeOf(aAlien)} (คาด SELLER_MISMATCH)`);
    }
    if (!NO_FX("SY26")) chk("SY26", p.length === 0, "50% ปฏิเสธ · 5% OK · คนนอก SELLER_MISMATCH", FXB(joinP(p)));
  }
  // ── fix1 ADD END ──
  if (notes.length) console.log(`  ℹ️  ฟิกซ์เจอร์มีหมายเหตุ ${notes.length}: ${notes.slice(0, 8).join(" | ")}`);
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
  await P.$executeRawUnsafe(`DELETE FROM "User" WHERE email LIKE $1`, `${slug}-%@qc.invalid`).catch(() => {});
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
const wipes: WipeReport[] = [];
let bucketsLeft = -1;
let usersLeft = -1;
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
    for (const [tid, slug] of [[T, T_SLUG], [T2, T2_SLUG]] as const) {
      const w = await wipeTenant(tid, slug);
      wipes.push(w);
      const residue = Object.values(w.left).reduce((a, b) => a + Math.abs(b), 0) + w.tenantLeft;
      console.log(`  ลบร้านชั่วคราว ${tid || "(ไม่ได้สร้าง)"}: ${w.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(w.left)} · Tenant ${w.tenantLeft}${w.err ? ` · ${w.err}` : ""}`);
    }
    let nb = 0;
    for (const kid of keyIds) nb += Number(await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%:api:%:${kid}`).catch(() => 0));
    bucketsLeft = 0;
    for (const kid of keyIds) bucketsLeft += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, `%:api:%:${kid}`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
    usersLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, `${T_SLUG}-%@qc.invalid`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
    console.log(`  ลบถังเพดานอัตราของคีย์รอบนี้ ${nb} แถว · เหลือ ${bucketsLeft} · ผู้ใช้ของรอบเหลือ ${usersLeft}`);
  } catch (e) {
    wipes.push({ tables: 0, left: {}, tenantLeft: 0, err: `cleanup: ${(e as Error).message.slice(0, 200)}` });
    console.log(`💥 cleanup ${(e as Error).message.slice(0, 200)}`);
  } finally {
    removeFetchGuard();
  }
}
await sleep(200);
const tempLeft = wipes.flatMap((w) => Object.entries(w.left).map(([k, v]) => `${k}:${v}`));
const tenantLeft = wipes.reduce((a, w) => a + w.tenantLeft, 0);
const wipeErr = wipes.map((w) => w.err).filter(Boolean).join(" · ");
chk("Z1", tempLeft.length === 0 && tenantLeft === 0 && !wipeErr && bucketsLeft === 0 && usersLeft === 0, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · ผู้ใช้ 0 · ถังเพดาน 0", [tempLeft.length ? `เหลือ ${tempLeft.join(", ")}` : `0 แถว (${wipes[0]?.tables ?? 0} ตาราง)`, tenantLeft ? "Tenant ยังอยู่" : "", wipeErr, `ผู้ใช้ ${usersLeft}`, `ถังเพดาน ${bucketsLeft}`].filter(Boolean).join(" · "));
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
const fpErr = Object.entries(fpBefore).filter(([, v]) => v.startsWith("err")).map(([k]) => k);
chk("Z2", fpDrift.length === 0 && !fpErr.length, "ลายนิ้วมือเท่าเดิม", fpDrift.length ? `ต่าง ${fpDrift.join(", ")}` : fpErr.length ? `อ่านไม่ได้ ${fpErr.join(",")}` : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, base: BASE_REV, guardHits: guardHits.length, residue: tempLeft.length + tenantLeft, uOnly: U_ONLY.length })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P3.4 S: จอ/IndexedDB/วงซิงก์/ภาพ V = P3.4U · SW app-shell = P3.4b (W12) · เลข ABB ต่อเครื่อง = W11 (O2) · สมาชิก/แต้ม/คูปองออฟไลน์ = ใบหลัง ·
//   รูปสลิปโอน = P3.10 · GET /catalog/snapshot ทาง REST = ไม่อยู่ใน 49 op (มติ 2 — REST มี sync.sales ตัวเดียว)
