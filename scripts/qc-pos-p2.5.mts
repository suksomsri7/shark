// QC — POS RUN ใบ P2.5: แยกบิล 3 แบบ (รายรายการ · หารเท่า · ตามที่นั่ง) + ย้าย/รวมโต๊ะ + พิมพ์ใบรายการ (pre-bill)
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ · ไม่ต้องมี seed (ร้านชั่วคราว + ผู้ใช้ชั่วคราวของตัวเอง)
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.5.md §0 ข้อเท็จจริง · §2 R1–R11 · §3 schema · §4 เงิน/สต็อก · §5 CD1–CD12 · §6 แผนข้อสอบ · §7 หมุด ·
//        §10 มติผู้คุมงาน 1–12 (ผูกมัด: 3 แบบตามภาพ 15B/15C · แผนเก็บในตาราง POS ใหม่ · ส่วนแบ่งเป็นบรรทัดเงินล้วน + ใบที่เลขต่ำสุดตัดสต็อก ·
//        เศษสตางค์ largest remainder เสมอไปใบเลขต่ำ · ส่วนลดโต๊ะอยู่บนแผน · แผนแช่แข็งเมื่อจ่ายใบแรก · รายการจ่ายครบเมื่อใบสุดท้ายที่ถือมันจ่าย ·
//        ย้าย/รวมผ่าน *InTx ใหม่ + โต๊ะที่ว่างลง "ต้องเก็บ" · ใบรายการไม่มีเลขเอกสาร ไม่เปลี่ยนสถานะ audit 1 แถว/ครั้ง · ไม่มีคีย์สิทธิ์ใหม่ · 2–20 ใบ)
//        ต่อยอด: qc-pos-p2.4 (fixture โต๊ะ/รอบ/บิลโต๊ะ · ROI/TS/L3 หมุด · ตัวรับ void) · qc-pos-p2.6 (รอบครัว/kdsBoard · ธุรกรรมที่สามถือล็อก K10) ·
//        qc-hf-tx HT2.8 (pg_blocking_pids) · qc-pos-p1.8 (void/refund + ระบายคิวซ้ำ) · qc-pos-p1.3 (quote/submit)
//        โน้ต: ledger/wo-notes/pos-P2.5-oracle.md (ตารางชื่อ = สัญญาของผู้สร้าง S · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P2.5 (S) ต้องส่ง (ย่อ — ละเอียดในโน้ต):
//   migration `20261210100000_pos_p25_split`: enum PosTableSplitMode/PosTableSplitStatus/PosTableSplitPartStatus · ตาราง PosTableSplit ·
//     PosTableSplitPart · PosTableSplitLine (+ partial unique "PosTableSplit_session_open_key" WHERE status='OPEN' · part (saleId) WHERE NOT NULL)
//   pos/table-split-shared.ts (บริสุทธิ์): allocateTableSplit · TABLE_SPLIT_MODES · TABLE_SPLIT_MIN_PARTS · TABLE_SPLIT_MAX_PARTS
//   pos/table-split.ts: registerSplitTable · registerCancelSplit · registerSplitDetail
//   pos/table.ts: registerMoveTable · registerMergeTables · registerTablePreBill · tableSaleVoided แยกใบได้ (รอยต่อ POS P2.5)
//   pos/pre-bill-render.ts (บริสุทธิ์): renderPreBillHtml · renderPreBillEscPos · PRE_BILL_LABELS
//   restaurant/index.ts (รอยต่อ // POS P2.5 ▸ … ◂): moveTableSessionInTx · mergeTableSessionsInTx · unlinkTableItemsInTx
//   register.ts: quote/submit รับ tableSplitPartId (+ submit expectedSplitVersion) · รหัสใหม่ TABLE_SPLIT_OPEN TABLE_SPLIT_EXISTS TABLE_SPLIT_LOCKED
//     TABLE_SPLIT_PART_PAID TABLE_SPLIT_NOT_FOUND TABLE_BUSY TABLE_HAS_DRAFT
//
// ขอบเขต: ST สถิต · M เงินแยกบิล · P วงจรแผน · S สต็อก/บัญชี · X void/คืน · C แข่งกัน (ธุรกรรมที่สามถือล็อก) · T ย้าย/รวม · B ใบรายการ ·
//         L ของเดิม (PAR) · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p2.4): SKIP เมื่อของ P2.5 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash · L เขียว)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST3 + L1 L2 + บริสุทธิ์ M6 B3 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p25-<rand>` + `posqc-p25-<rand>-t2` + ผู้ใช้ `posqc-p25-<rand>-*@qc.invalid`
//    (ลบทั้งหมดใน finally · แถวค้าง = 0) · ไม่มีเครือข่าย (fetch = ตัวกั้น 503) · ทุกข้อห่อ try/catch (ข้อพัง = แดงพร้อมเหตุผล ไม่ล้มทั้งชุด)
//    fixture ผ่านฟังก์ชันของโมดูล · Prisma ตรงเฉพาะ Tenant/BusinessUnit/User/Membership/AccountSystemLink · SQL ดิบ = ล็อก/xmin/ลายนิ้วมือ/ลบร้านชั่วคราว
//    การแข่งทุกข้อ (C) บังคับลำดับด้วยธุรกรรมที่สามถือล็อก + pg_blocking_pids (ไม่พึ่งจังหวะ)
//    โมดูล/ฟังก์ชันที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + ตรวจว่ามี) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.5";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 idempotency/เล่นซ้ำ/แข่ง · X2 ข้ามขอบเขต · X3 สิทธิ์/เพดาน · X4 เงิน/จำนวน · X5 ไม่เขียนอะไร · PAR = เขียวทั้งก่อนและหลังสร้าง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.5-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[§3 มติ 2] schema + migration เพิ่มอย่างเดียว: enum PosTableSplitMode {ITEM EQUAL SEAT} · PosTableSplitStatus {OPEN DONE CANCELLED} · PosTableSplitPartStatus {OPEN PAID} · model PosTableSplit / PosTableSplitPart / PosTableSplitLine ฟิลด์ตาม §3 (ส่วนเกินต้องไม่บังคับ) · @@unique([splitId, no]) · ไม่มี @relation ไป TableSession/RestaurantOrderItem/PosSale · TableSession/RestaurantOrderItem/PosSale ไม่เปลี่ยน · migration เดียว `20261210100000_pos_p25_split`: lock_timeout · IF NOT EXISTS ทุก CREATE TABLE/INDEX · partial unique \"PosTableSplit_session_open_key\" WHERE status='OPEN' · part (saleId) WHERE NOT NULL · ไม่แตะตารางอื่น"),
  D("ST2", "S", "[R1 R4 R11] ลงทะเบียน: core/scope.ts 3 model · pos-qc-env POS_MODELS posTableSplit/posTableSplitPart/posTableSplitLine · RegisterRefusalCode + REFUSAL_KEY มี 7 รหัสใหม่ (errors.<camel>) · REG_QUOTE_KEYS มี tableSplitPartId · REG_SUBMIT_KEYS มี expectedSplitVersion · pos.json th/en: register.errors.<7> + ก้อน tables.split/move/merge/preBill (คีย์ชุดเดียวกัน · th ไทย · en ไม่มีไทย)"),
  D("ST3", "S", "[R7 R8 R9 §7 มติ 8 9] ขอบเขต: restaurant/index.ts รอยต่อ POS P2.5 ▸ export moveTableSessionInTx mergeTableSessionsInTx unlinkTableItemsInTx · pos/table-split.ts + pos/table.ts export ฟังก์ชันใหม่ครบ 6 · table-split-shared.ts + pre-bill-render.ts บริสุทธิ์ (ไม่ถึง prisma/เซิร์ฟเวอร์ · ไม่มีนาฬิกา/สุ่ม · pre-bill-render import แค่ *-shared/receipt-render) · ไฟล์ pos ไม่เขียน Restaurant*/TableSession ตรง · ไฟล์ \"use server\" เรียกครบ 6 + catch · tableSaleVoided มีรอยต่อ POS P2.5 · ไฟล์ใหม่ไม่ปล่อย outbox · table-split.ts ไม่มี ticketForSale · 'use client' ไม่ import table-split/table · จอใหม่ (ถ้ามี) ไม่มีอักษรไทยในโค้ด · POS-OWNER-PENDING มีบรรทัด P2.5"),
  // ── M เงินแยกบิล ──
  D("M1", "X4", "[R1 R2 R5 15B มติ 4] registerSplitTable ITEM บนโต๊ะ A5 (ข้าว 3+1 · ลาเต้ 1+1 · ที่เหลือตามภาพ) → ใบ 1 ฐาน 67500 ค่าบริการ 6750 สุทธิ 74250 · ใบ 2 56500/5650/62150 · Σ 136400 = quote ทั้งโต๊ะ · แผนที่เก็บ (แถว PosTableSplit/Part/Line) = ผลของ allocateTableSplit ตรงตัว · version 1 · itemsHash = quote"),
  // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU c · มติ 3): เศษสตางค์ของส่วนแบ่งต่อรายการหมุนเวียน (rot) แทนไปใบต่ำเสมอ — เดิม "ฐาน 41334/41334/41332 (ส่วนแบ่งต่อรายการ เศษไปใบต่ำ)" ◂
  D("M2", "X4", "[R2 มติ 4 CD4 · HF-FU มติ 3] EQUAL 3 บน 136400 → สุทธิ 45467 / 45467 / 45466 (เศษ 2 → ใบ 1–2) · ฐาน 41334/41333/41333 (ส่วนแบ่งต่อรายการ เศษหมุนเวียนตามลำดับรายการ) · Σ ตรง · แทนด้วย EQUAL 4 (splitId+expectedVersion) → 4 × 34100 · version 2 · ส่วนแบ่ง 1 ชิ้นชื่อลงท้าย (1/4)"),
  D("M3", "X4", "[R1 R2 15C] SEAT 4 ที่นั่ง + ยำวุ้นเส้นกลางโต๊ะ → 33825 / 45815 / 24255 / 32505 · ยำ 3750 × 4 · ใบ 1 ถือสต็อกของยำ (stockOwner) · Σ 136400 · ลืมระบุที่นั่ง 1 รายการ → VALIDATION ไม่มีแผน"),
  D("M4", "X3", "[R2 R5 CD5 มติ 5] ส่วนลดท้ายบิล 10% บนแผน ITEM 15B → ส่วนลด 6750/5650 · ค่าบริการ 6075/5085 · สุทธิ 66825/55935 · Σ 122760 = quote ทั้งโต๊ะที่ส่วนลดเดียวกัน · CASHIER แทนแผนด้วย 20% → DISCOUNT_EXCEEDS_LIMIT (แผนเดิมคงอยู่) · MANAGER 20% → ok"),
  D("M5", "X4", "[R2(6) COMMON-1] VAT ของแต่ละใบ = splitIncludedVat(สุทธิใบ) ที่ระดับบิลของใบ (บิลจริงของ 15B ทั้งสองใบ) · |Σ VAT ใบ − VAT ทั้งโต๊ะ| ≤ ⌊(N+1)/2⌋ · ข้อบริสุทธิ์ vatRateBp 0 → VAT 0 ทุกใบ"),
  D("M6", "P", "[R2 มติ 4 CD11] allocateTableSplit บริสุทธิ์: 15B/15C/EQUAL 3/EQUAL 4 ตรงตัวเลข · 500 แผนสุ่ม (seed คงที่ · ITEM/EQUAL/SEAT · ส่วนลด · ค่าบริการ) ตรงตัวอ้างอิง largest remainder เสมอไปใบต่ำ · Σ สุทธิ = ยอดทั้งโต๊ะ · สต็อกต่อรายการ = qty หนึ่งครั้ง · เรียกซ้ำผลเดิม ไม่แก้อินพุต · ปฏิเสธ: 1/21 ใบ · ใบว่าง · ยังไม่ระบุ/เกิน · ITEM แบ่งกลาง · 201 รายการ TOO_MANY_LINES"),
  D("M7", "X4", "[R4 CD5 มติ 5] สมาชิกของโต๊ะไปอยู่ใบ 1 (ปริยาย) → quote ใบ 1 tierDiscountSatang > 0 · ใบ 2 ไม่มีส่วนลดสมาชิก · Σ(ยอด + ส่วนลดสมาชิก) = ยอดแผน · คูปองบนใบ 2 (ไม่มีสมาชิก) → VALIDATION · จ่ายใบ 1 → PosSale.customerId = สมาชิก · ใบ 2 ไม่มี"),
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 1 ruling 5 · CD-P25-N3 option 2: no VAT-EXCLUDED mode in the register)
  D("M8", "X4", "[มติ fix1 ข้อ 5 · CD-P25-N3] (ก) regVat คืนได้แค่ INCLUDED | NONE (หมุดซอร์ส · ไม่มี EXCLUDED ใน regVat/regFixedServiceCharge) · (ข) แผน 2 ใบทั้งโหมด INCLUDED และ NONE → ยอดของใบในแผน (ที่จอแสดง) = grandTotal ของ quote ใบ (ที่เก็บจริง) ตรงทุกสตางค์ · NONE → VAT 0"),
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 1 ruling 7 · F4 · P2.9 merged: STORE_CREDIT on a split part uses the part's member)
  D("M9", "X2", "[มติ fix1 ข้อ 7 · F4] ใบของโต๊ะสมาชิก (ใบ 1 = สมาชิก) จ่ายด้วย STORE_CREDIT → ok (เครดิตของสมาชิกของใบ) · ส่ง memberId ของสมาชิกอื่นบนใบนั้น + STORE_CREDIT → STORE_CREDIT_NOT_OWNER ไม่มีบิล · ใบที่ไม่มีสมาชิก + STORE_CREDIT → STORE_CREDIT_NOT_OWNER"),
  // ── P วงจรแผน ──
  D("P1", "X1", "[R3 R4 R10 มติ 7] จ่ายใบ 1 (tableSplitPartId + expectedSplitVersion) → PosSale POS sourceId=session STORE · subtotal/billDiscount/serviceCharge = แผน · บรรทัดเต็มหน่วย (กะเพรา 2×9900 · ข้าว 3×1500 itemId ข้าว · …) · ใบ 1 PAID+saleId · รายการเฉพาะใบ 1 ผูกบิล · ข้าว/ลาเต้ (มีในใบ 2 ด้วย) ยังไม่ผูก · session OPEN · ส่งซ้ำคีย์เดิม → บิลเดิม duplicated · registerTableDetail.split {paidParts 1 partCount 2 remainingSatang 62150} · การ์ดผัง split {1,2}"),
  D("P2", "-", "[R4 มติ 7] จ่ายใบสุดท้าย → ทุกรายการผูกบิล (ข้าว/ลาเต้ = บิลใบที่จ่ายครบ) · แผน DONE + doneAt · session CLOSED + dirtySince · ไม่มีรอบครัวใหม่ · ตัวแปร: มีรอบร่าง HELD → จ่ายครบแล้ว session ยัง OPEN dirtySince null"),
  D("P3", "X5", "[R4 R5 มติ 6] ขณะแผน OPEN: quote/submit ทั้งโต๊ะ (tableSessionId) → TABLE_SPLIT_OPEN · registerCancelTableItem รายการในแผน → TABLE_SPLIT_OPEN · ใบ: tableSplitPartId+tableSessionId / lines ไม่ว่าง / billDiscount / heldCartId / channelId → VALIDATION · ไม่มีบิล/รายการไม่เปลี่ยน"),
  D("P4", "X1", "[R5 มติ 6] expectedVersion เก่า → VERSION_CHANGED · แทนแผน → version+1 · หลังจ่ายใบแรก แทน/ยกเลิก → TABLE_SPLIT_LOCKED · registerCancelSplit แผนที่ยังไม่จ่าย → CANCELLED (cancelledAt) · แล้วจ่ายทั้งโต๊ะได้ตามเดิม · สร้างซ้ำขณะมีแผน OPEN → TABLE_SPLIT_EXISTS + {splitId, version}"),
  D("P5", "X3", "[R1 R5 CD10 CD11] ขอบเขต/เพดาน: partCount 1 / 21 · ใบว่าง · ยังไม่ระบุ/เกินจำนวน · รายการโต๊ะอื่น → VALIDATION · expectedItemsHash เก่า → TABLE_ITEMS_CHANGED · session ร้าน T2 / ctx สาขา B → TABLE_NOT_FOUND · ใบมั่ว → TABLE_SPLIT_NOT_FOUND · NOPERM/WAITER (pos.sale.read) สร้าง → PERMISSION_DENIED · WAITER อ่าน registerSplitDetail ok · ไม่มีแถวแผน"),
  D("P6", "-", "[R5 R10 R4 §4] รอบระหว่างแผน + ครัว: แยกบิลขณะตั๋ว COOKING → kdsStatus ไม่เปลี่ยน · ส่งรอบใหม่หลังแยก → อยู่นอกแผน (outsideItemIds) · จ่ายครบทุกใบ → DONE แต่ session OPEN · quote ทั้งโต๊ะ = เฉพาะรายการใหม่ · kdsTicketDone หลังจ่ายใบ ok · บิลของใบไม่สร้าง RestaurantOrder (heal ก็ไม่สร้าง) · ยกเลิกรายการในแผนผ่านประตูเดิม → จ่ายใบ TABLE_ITEMS_CHANGED ไม่เขียน"),
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 1 ruling 2 · pos-P2.5-review.md N2)
  D("P7", "X5", "[มติ fix1 ข้อ 2] หน้าเดิม /restaurant: checkoutAction + confirmPromptpayPaymentAction เรียก legacyCheckoutSplitGuard · cancelOrderItemAction เรียก legacyCancelItemSplitGuard ก่อนประตูเดิม · ใบ 1 จ่ายแล้ว → ตัวกันเช็คบิล ok:false · ตัวกันยกเลิกรายการในแผน ok:false · โต๊ะไม่มีแผน ok:true · ไม่มีบิล · แผน/รายการไม่เปลี่ยน"),
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 2 ruling 1 · F1 = hunter N2 partial)
  D("P8", "X5", "[มติ fix2 ข้อ 1] ผู้ช่วย AI restaurant_close_bill (runKind → dispatch · proposals.ts) เรียก legacyCheckoutSplitGuard ก่อน restaurantSvc.checkout · ใบ 1 จ่ายแล้ว (แผน OPEN) → ปฏิเสธ (โยนเหตุผล) ไม่มีบิล รายการ/แผนไม่เปลี่ยน · ตัวควบคุม: โต๊ะไม่มีแผน → ปิดบิลได้"),
  // ── S สต็อก/บัญชี ──
  D("S1", "X4", "[R3 §4 มติ 3] ตัดสต็อกครั้งเดียว: 15B ข้าว (PRODUCT) OUT −3 บนบิลใบ 1 / −1 บนบิลใบ 2 (Σ −4) · EQUAL 4: ข้าว −4 และวุ้นเส้น (สูตรของยำ) −1 บนบิลใบ 1 เท่านั้น · ใบ 2–4 ไม่มี OUT · onHand ตรง"),
  D("S2", "X5", "[§4] ตัวนับเมนู (MenuItem.stockQty ของบราวนี่) ไม่ขยับจากการจ่ายใบใด ๆ (หักไปแล้วตอนส่งรอบ)"),
  D("S3", "X4", "[§4 R4] GL ต่อใบ: Dr 1000 = ยอดบิล · Cr 2200 = VAT บิล · Σ Dr = Σ Cr · Σ ยอดบิลทุกใบ = 136400 · สร้าง/แทน/ยกเลิกแผน + ใบรายการ → JournalEntry/OutboxEvent/เลขใบเสร็จ +0 · ใบกำกับเต็มรูปบนใบหนึ่ง → เอกสาร TAX_INVOICE 1 ใบของบิลนั้น"),
  // ── X void/คืน ──
  D("X1", "X1", "[R6 มติ 7] void บิลใบ 2 + ระบายคิว → JV กลับรายการ · ข้าว +1 · ใบ 2 OPEN saleId null · แผน DONE → OPEN · รายการที่มีในใบ 2 หลุด (ข้าว ลาเต้ ต้มยำ ปลาหมึก บราวนี่) · รายการเฉพาะใบ 1 ยังผูกบิลใบ 1 · session กลับ OPEN · เล่นตัวรับซ้ำ 2 รอบ → ไม่เปลี่ยน"),
  D("X2", "X1", "[R6 §4] จ่ายใบ 2 ใหม่ (คีย์ใหม่) → บิลใหม่ · DONE · ทุกรายการผูก · ข้าวตัดอีก 1 ครั้ง · Σ ใบ PAID = 136400 · EQUAL: void ใบที่ถือสต็อก (ใบ 1) → ข้าว +4 วุ้นเส้น +1 ครั้งเดียว (ระบายซ้ำไม่เพิ่ม) · จ่ายใหม่ → ตัดครั้งเดียว"),
  D("X3", "X5", "[R6 P2.4 R8] คืนเงินบางบรรทัดของบิลใบ → แผน/ใบ/รายการ/session ไม่เปลี่ยน"),
  D("X4", "-", "[R6 CD7] จ่ายครบ → เปิดโต๊ะเดิมให้ลูกค้าใหม่ → void บิลใบ 1 → ใบ 1 OPEN · session เดิมยัง CLOSED · quote/จ่ายใบ 1 → TABLE_SESSION_CLOSED ไม่มีบิล"),
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 1 ruling 1 · pos-P2.5-review.md F1/N1)
  D("X5", "X1", "[มติ fix1 ข้อ 1] แผนเก่า DONE + แผนใหม่ OPEN บน session เดียว → void บิลใบของแผนเก่า → ตัวรับ void จบ (event DONE ไม่ FAILED) · ใบ OPEN saleId null · แผนเก่ายัง DONE · แผนใหม่ไม่เปลี่ยน · รายการของใบหลุด (ค้างจ่าย)"),
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 2 ruling 3 · F3)
  D("X5b", "S", "[มติ fix2 ข้อ 3] หมุดซอร์ส tableSaleVoided: catch ของการลองซ้ำแบบไม่เปิดแผน (once(false)) ตรวจ isTxConflict ก่อน audit pos.table.split.voidConflict และโยนต่อ (คิวลองใหม่)"),
  // ── C แข่งกัน (ธุรกรรมที่สามถือล็อก) ──
  D("C1", "X1", "[R5 CD6] สองเครื่องสร้างแผนบน session เดียวพร้อมกัน (ถือแถวรายการแรกไว้ · ทั้งคู่รอ) → แผน OPEN 1 · อีกคน TABLE_SPLIT_EXISTS + splitId ของผู้ชนะ"),
  D("C2", "X1", "[R4] สองเครื่อง คนละคีย์ จ่ายใบเดียวกัน (ถือรายการไว้ · ทั้งคู่รอ) → บิล 1 + TABLE_SPLIT_PART_PAID · Δ PosSale/PosPayment/เลขใบเสร็จ +1 · OutboxEvent ที่ไม่ใช่ของบิลผู้ชนะ 0"),
  D("C3", "X1", "[R4 มติ 7] สองเครื่องจ่ายคนละใบพร้อมกัน (ถือรายการไว้) → บิล 2 ใบ · แผน DONE · ทุกรายการผูกบิลเดียวกัน (ใบที่จ่ายครบ) · session CLOSED ครั้งเดียว + dirtySince"),
  D("C4", "X1", "[R5 P5] สร้างแผน ⇄ จ่ายทั้งโต๊ะ (ถือรายการไว้ · ทั้งคู่รอ) → ผู้ชนะคนเดียว: บิล + แผนถูกปฏิเสธ หรือ แผน OPEN + จ่าย TABLE_SPLIT_OPEN · ไม่มีทั้งบิลทั้งแผน"),
  D("C5", "X1", "[R7 มติ 8] ย้าย ⇄ เปิดโต๊ะปลายทาง (ถือล็อกโต๊ะปลายทาง) → session OPEN บนโต๊ะปลายทาง 1 แถว (ย้ายผ่าน+เปิดได้ session เดิม หรือ เปิดใหม่+ย้าย TABLE_BUSY) · ย้าย ⇄ จ่ายของ session เดียวกัน (ถือแถว session) → ok ทั้งคู่ · session CLOSED บนโต๊ะใหม่ · โต๊ะเดิมต้องเก็บ"),
  D("C6", "X1", "[R8 มติ 8] รวมโต๊ะ ⇄ จ่ายของโต๊ะต้นทาง (ถือรายการไว้) → จ่ายแล้วรวม (ออเดอร์ที่จ่ายย้ายตาม) หรือ รวมแล้วจ่าย TABLE_ITEMS_CHANGED · รายการหนึ่งไม่มีสองบิล · บิลบางส่วนเดิมของโต๊ะต้นทาง void แล้วรายการกลับมาค้างจ่ายบนโต๊ะปลายทาง"),
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 2 ruling 4 · hunter Low · id C7 because C6 exists)
  // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU i · มติ 5): + probe NOWAIT (ธุรกรรมที่สามถือแถวบัตร · ระหว่างคำขอ PIN ผิดรอบัตร แถวรายการ/ใบต้องไม่ถูกล็อก) — fail-before 1a964205 = 55P03 ◂
  D("C7", "X1", "[มติ fix2 ข้อ 4 · HF-FU มติ 5] จ่ายใบด้วยบัตรของขวัญ PIN ผิด 10 คำขอพร้อมกัน (คนละคีย์) บนบัตรใบเดียว → ทุกคำตอบ GIFT_CARD_PIN/GIFT_CARD_LOCKED (ไม่มี P2028/หมดเวลา) · ตัวนับ 5 · บัตรถูกล็อก · ใบยัง OPEN · ไม่มีบิล · ตัวควบคุม: บัตรใหม่ PIN ถูก → จ่ายใบได้ครั้งเดียว · probe: ธุรกรรมที่สามถือแถวบัตร FOR UPDATE → คำขอ PIN ผิด 1 รายการรอ → SELECT … FOR UPDATE NOWAIT บนรายการของใบ + แถวใบสำเร็จ (ไม่มี 55P03) · ปล่อยแล้วได้ GIFT_CARD_PIN"),
  // ── T ย้าย/รวม ──
  D("T1", "-", "[R7 CD8 มติ 8] registerMoveTable (WAITER) ขณะรอบ NEW + รอบร่าง + แผน OPEN → tableId เปลี่ยน · โต๊ะเดิม dirtySince (ต้องเก็บ) · โต๊ะใหม่สะอาด · ผัง: เดิม NEEDS_CLEARING ใหม่ DINING · kdsBoard label = ชื่อโต๊ะใหม่ · รายการยัง NEW · รอบร่าง/แผนตาม session · ย้ายไปโต๊ะเดิม → {ok, changed:false}"),
  D("T2", "X2", "[R7 CD10] ย้ายไปโต๊ะที่มีลูกค้า → TABLE_BUSY · INACTIVE → TABLE_INACTIVE · โต๊ะร้าน T2 / id มั่ว / ctx สาขา B → TABLE_NOT_FOUND · session ปิดแล้ว → TABLE_SESSION_CLOSED · CASHIER/NOPERM → PERMISSION_DENIED · ไม่เขียน · โต๊ะที่จองไว้ → ok + reservationOverridden (การจองยัง BOOKED)"),
  D("T3", "X1", "[R8 CD8] registerMergeTables (WAITER) A←B,C → ออเดอร์/คำขอย้าย · guestCount Σ · สมาชิกของต้นทาง · ต้นทาง MERGED + mergedIntoId + dirtySince · รอบร่างเดียวย้ายตาม · เล่นซ้ำ → changed:false · รอบร่างสองที่ → TABLE_HAS_DRAFT · ต้นทางมีแผน OPEN → TABLE_SPLIT_OPEN · 6 ต้นทาง / ปลายทางซ้ำ → VALIDATION · CASHIER → PERMISSION_DENIED · ต้นทางร้าน T2 → TABLE_NOT_FOUND · ไม่เขียน"),
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 1 ruling 6 · pos-P2.5-review.md N4)
  D("T4", "-", "[มติ fix1 ข้อ 6] แผน DONE บนโต๊ะ B (มีรอบร่าง) → รวม B เข้า A → แผนย้ายไป session A · void บิลใบ 1 → ใบ OPEN บน session A · quote/จ่ายใบ 1 ได้ · แผน DONE · แผน OPEN บน session ที่ปิดแล้ว (โต๊ะ A5 หลัง X4) ไม่กันการยกเลิกรายการ"),
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 2 ruling 2 · F2)
  // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU d · มติ 4 refuse): แผน DONE ฝั่งต้นทาง = ปฏิเสธด้วย · ตัวควบคุมเปลี่ยนเป็น "ไม่มีแผน → รวมได้" — เดิม "ตัวควบคุม: มีแต่แผน DONE → รวมด้วยประตูเดิมได้" ◂
  D("T5", "X5", "[มติ fix2 ข้อ 2 · HF-FU มติ 4] หน้าเดิม mergeSessionAction เรียก legacyMergeSplitGuard ก่อน table.mergeSession · แผน OPEN ฝั่งต้นทาง / ฝั่งปลายทาง → ปฏิเสธ ออเดอร์ไม่ย้าย แผนไม่เปลี่ยน · แผน DONE ฝั่งต้นทาง → ปฏิเสธ (ออเดอร์ไม่ย้าย แผนยัง DONE บน session ต้นทาง) · ตัวควบคุม: ไม่มีแผน → รวมด้วยประตูเดิมได้"),
  // ── B ใบรายการ ──
  D("B1", "X5", "[R9 มติ 9] registerTablePreBill ทั้งโต๊ะ → kind PRE_BILL · notReceipt · ยอด = quote (subtotal/serviceCharge/vat/total/itemsHash) · ไม่มีคีย์เลขเอกสาร/เลขภาษี · เลขใบเสร็จ +0 · session/โต๊ะไม่เปลี่ยน (ไม่ขอเช็คบิล) · AuditLog pos.table.preBill 1 แถวต่อครั้ง (2 ครั้ง = 2) · ไม่มี outbox/JV"),
  D("B2", "X2", "[R9 CD9 CD10] ใบรายการของใบ (tableSplitPartId) = ยอดของใบ + part {no, of} · copy:true → copy · WAITER (pos.sale.read) ok · NOPERM → PERMISSION_DENIED · session ร้าน T2 / ctx สาขา B → TABLE_NOT_FOUND · session CLOSED → TABLE_SESSION_CLOSED · ใบมั่ว → TABLE_SPLIT_NOT_FOUND"),
  D("B3", "P", "[R9 มติ 9] pre-bill-render บริสุทธิ์: renderPreBillHtml/renderPreBillEscPos ผลเดิมทุกไบต์ · หัว th \"ใบรายการ — ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษี\" · en \"PRE-BILL — NOT A RECEIPT\" · ท้าย \"ตรวจรายการแล้วแจ้งพนักงานเพื่อชำระเงิน\" · copy → \"สำเนา\"/\"COPY\" · ยอดพิมพ์ตาม payload (1,364.00) · ไม่มีคำว่าใบกำกับภาษีเต็มรูป/เลขที่"),
  // ── L ของเดิม (PAR) ──
  D("L1", "PAR", "[§7 มติ 8] ลายเซ็น export ของ restaurant/{table,order,menu,kds,storefront,scope}.ts = ตาราง L3 ของ qc-pos-p2.4 ตรงตัว (รวม moveSession/mergeSession) · TableSession/RestaurantOrderItem ชุดฟิลด์ = TS_FIELDS/ROI_FIELDS"),
  D("L2", "PAR", "[§7] scripts/pos-sale-contract.json sha 7a418de1… ตรงตัว · ทะเบียนผู้เรียก createSale เท่าเดิม (ไฟล์แยกบิล/ใบรายการไม่มี createSale) · register.ts เรียก ticketForSale 2 จุดเท่าเดิม"),
  D("L3", "PAR", "[§0 §7 มติ 8] ประตูเดิม moveSession/mergeSession ผลตรงทุกไบต์: ย้าย {ok:true} (ไม่ตั้ง dirtySince) · ย้ายไปโต๊ะไม่ว่าง → ข้อความเดิม · รวม {ok:true} (guestCount ไม่รวม · ต้นทาง MERGED ไม่ตั้ง dirtySince) · รวมโต๊ะเดียวกัน/ต้นทางที่ MERGED → ข้อความเดิม"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว T + T2 เหลือ 0 แถวทุกตารางที่มี tenantId (PosTableSplit* TableSession Restaurant* PosHeldCart PosSale* OutboxEvent AuditLog InvMovement AccountJournal* …) · แถว Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0"),
  D("Z2", "-", "รอยของรอบนี้นอกร้านชั่วคราว = 0 (PosSale คีย์ · AuditLog/OutboxEvent ที่มีรหัสรอบ · Tenant slug) · ลายนิ้วมือร้านอื่น (RestaurantTable TableSession RestaurantOrderItem PosHeldCart นับ + แฮช) ก่อน/หลังพิมพ์เป็นข้อมูล"),
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
  const full = id.startsWith("P2.5-") ? id : `P2.5-${id}`;
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
/** VAT รวมใน (สูตรเดียวกับ money/vat.ts splitIncludedVat — ข้อสอบเขียนเอง) */
const vatOf = (gross: number, rateBp: number) => (rateBp > 0 ? gross - Math.floor((2 * gross * 10_000 + (10_000 + rateBp)) / (2 * (10_000 + rateBp))) : 0);
const setStr = (xs: unknown[]) => [...xs].map(String).sort(byId).join(",");

// ═════════════════════════ ตัวอ้างอิงของข้อสอบ (largest remainder · มติ 4) — เขียนเอง ไม่ import ═════════════════════════
/** แบ่ง total ตามน้ำหนัก: floor ก่อน แล้วเศษไปใบที่เศษมากสุด · เสมอกัน → ใบเลขต่ำ · น้ำหนักรวม 0 = แบ่งเท่า (เศษไปใบต่ำ) · BigInt กันล้น */
function lrSplit(total: number, weights: number[]): number[] {
  const n = weights.length;
  const ZERO = BigInt(0);
  const W = weights.reduce((a, b) => a + BigInt(b), ZERO);
  if (W <= ZERO) {
    const q = Math.floor(total / n);
    const r = total - q * n;
    return weights.map((_, i) => q + (i < r ? 1 : 0));
  }
  const T = BigInt(total);
  const base = weights.map((w) => (T * BigInt(w)) / W);
  const rem = weights.map((w, i) => ({ i, r: (T * BigInt(w)) % W }));
  let left = Number(T - base.reduce((a, b) => a + b, ZERO));
  rem.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const out = base.map(Number);
  for (const x of rem) {
    if (left <= 0) break;
    out[x.i]!++;
    left--;
  }
  return out;
}
type RItem = { id: string; qty: number; unitSatang: number };
type RAlloc = { itemId: string; partNo: number | null; qty: number };
type RDisc = { type: "PERCENT" | "AMOUNT"; value: number } | null;
type RIn = { mode: "ITEM" | "EQUAL" | "SEAT"; partCount: number; items: RItem[]; allocations?: RAlloc[]; billDiscount?: RDisc; serviceChargeBp: number; vatRateBp?: number };
type RLine = { itemId: string; qty: number | null; shareNum: number | null; shareDen: number | null; amountSatang: number; stockOwner: boolean };
type RPart = { no: number; baseSatang: number; discountSatang: number; serviceChargeSatang: number; totalSatang: number; vatSatang: number; lines: RLine[] };
type ROut = { ok: true; baseSatang: number; discountSatang: number; serviceChargeSatang: number; totalSatang: number; parts: RPart[] } | { ok: false; code: string };
/** ตัวอ้างอิง allocateTableSplit (R2 + CONTROLLER-DECISION 1 ของโน้ต: EQUAL ยอดสุทธิ q+1 ให้ใบ 1..r · ค่าบริการของใบ = สุทธิ − ฐาน + ส่วนลด) */
function refAlloc(i: RIn): ROut {
  const N = i.partCount;
  if (!Number.isInteger(N) || N < 2 || N > 20) return { ok: false, code: "VALIDATION" };
  if (i.items.length > 200) return { ok: false, code: "TOO_MANY_LINES" };
  if (!i.items.length) return { ok: false, code: "VALIDATION" };
  const whole = new Map<string, Map<number, number>>(); // item → part → k
  const shared = new Map<string, number>(); // item → units กลางโต๊ะ (ทุกใบหาร)
  if (i.mode === "EQUAL") {
    if (i.allocations && i.allocations.length) return { ok: false, code: "VALIDATION" };
    for (const it of i.items) shared.set(it.id, it.qty);
  } else {
    const got = new Map<string, number>();
    for (const a of i.allocations ?? []) {
      if (!i.items.some((x) => x.id === a.itemId) || !Number.isInteger(a.qty) || a.qty < 1) return { ok: false, code: "VALIDATION" };
      if (a.partNo === null) {
        if (i.mode !== "SEAT") return { ok: false, code: "VALIDATION" };
        shared.set(a.itemId, (shared.get(a.itemId) ?? 0) + a.qty);
      } else {
        if (!Number.isInteger(a.partNo) || a.partNo < 1 || a.partNo > N) return { ok: false, code: "VALIDATION" };
        const m = whole.get(a.itemId) ?? new Map<number, number>();
        m.set(a.partNo, (m.get(a.partNo) ?? 0) + a.qty);
        whole.set(a.itemId, m);
      }
      got.set(a.itemId, (got.get(a.itemId) ?? 0) + a.qty);
    }
    for (const it of i.items) if ((got.get(it.id) ?? 0) !== it.qty) return { ok: false, code: "VALIDATION" };
  }
  const lines: RLine[][] = Array.from({ length: N }, () => []);
  // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU c · มติ 3): เศษของส่วนแบ่งหมุนเวียนข้ามรายการกลางโต๊ะ (EQUAL และ SEAT กติกาเดียว) — ใบ p ได้ +1 เมื่อ ((p−1−rot) mod N) < r
  //   แล้ว rot = (rot + r) mod N ตามลำดับรายการที่ส่งมา · เจ้าของสต็อกยังเป็นใบ 1 · ยอดสุทธิ EQUAL ยังเป็น q+1 ให้ใบ 1..r — เดิม `q + (p <= r ? 1 : 0)` ◂
  let rot = 0;
  for (const it of i.items) {
    for (const [p, k] of [...(whole.get(it.id) ?? new Map<number, number>()).entries()].sort((a, b) => a[0] - b[0]))
      lines[p - 1]!.push({ itemId: it.id, qty: k, shareNum: null, shareDen: null, amountSatang: k * it.unitSatang, stockOwner: true });
    const u = shared.get(it.id) ?? 0;
    if (u > 0) {
      const g = u * it.unitSatang;
      const q = Math.floor(g / N);
      const r = g - q * N;
      for (let p = 1; p <= N; p++) lines[p - 1]!.push({ itemId: it.id, qty: null, shareNum: u, shareDen: N, amountSatang: q + ((((p - 1 - rot) % N) + N) % N < r ? 1 : 0), stockOwner: p === 1 });
      rot = (rot + r) % N;
    }
  }
  if (lines.some((l) => !l.length)) return { ok: false, code: "VALIDATION" };
  const b = lines.map((l) => sum(l.map((x) => x.amountSatang)));
  const B = sum(b);
  const d0 = i.billDiscount;
  const Dd = !d0 ? 0 : d0.type === "AMOUNT" ? d0.value : d0.value > 10_000 ? B + 1 : halfUp(B * d0.value, 10_000);
  if (Dd > B) return { ok: false, code: "BILL_DISCOUNT_EXCEEDS_TOTAL" };
  const d = lrSplit(Dd, b);
  const S = halfUp((B - Dd) * i.serviceChargeBp, 10_000);
  let s: number[];
  let t: number[];
  if (i.mode === "EQUAL") {
    const T = B - Dd + S;
    const q = Math.floor(T / N);
    const r = T - q * N;
    t = b.map((_, k) => q + (k < r ? 1 : 0));
    s = t.map((x, k) => x - b[k]! + d[k]!);
  } else {
    s = lrSplit(S, b.map((x, k) => x - d[k]!));
    t = b.map((x, k) => x - d[k]! + s[k]!);
  }
  const vr = i.vatRateBp ?? 0;
  return {
    ok: true,
    baseSatang: B,
    discountSatang: Dd,
    serviceChargeSatang: S,
    totalSatang: B - Dd + S,
    parts: b.map((x, k) => ({ no: k + 1, baseSatang: x, discountSatang: d[k]!, serviceChargeSatang: s[k]!, totalSatang: t[k]!, vatSatang: vatOf(t[k]!, vr), lines: lines[k]! })),
  };
}
/** เทียบผลแผน (บริสุทธิ์หรือของเซิร์ฟเวอร์) กับตัวอ้างอิง — คืนรายการความต่าง (ว่าง = ตรง) · idMap แปลง id รายการเป็นชื่อเล่นในข้อความ */
function diffPlan(got: Any, want: ROut, idMap: (id: string) => string = (x) => x.slice(-6)): string[] {
  const p: string[] = [];
  if (!want.ok) return got?.ok === false && String(got.code) === want.code ? [] : [`คาด ${want.code} ได้ ${codeOf(got)}`];
  if (!isRecord(got)) return [`ผล ${short(got, 60)}`];
  for (const k of ["baseSatang", "discountSatang", "serviceChargeSatang", "totalSatang"] as const) if (got[k] !== want[k]) p.push(`${k} ${got[k]} (คาด ${want[k]})`);
  const parts = (Array.isArray(got.parts) ? got.parts : []) as Any[];
  if (parts.length !== want.parts.length) p.push(`parts ${parts.length} (คาด ${want.parts.length})`);
  for (const wp of want.parts) {
    const gp = parts.find((x) => Number(x?.no) === wp.no);
    if (!gp) {
      p.push(`ไม่มีใบ ${wp.no}`);
      continue;
    }
    for (const k of ["baseSatang", "discountSatang", "serviceChargeSatang", "totalSatang"] as const) if (gp[k] !== wp[k]) p.push(`ใบ${wp.no}.${k} ${gp[k]} (คาด ${wp[k]})`);
    if ("vatSatang" in gp && gp.vatSatang !== wp.vatSatang) p.push(`ใบ${wp.no}.vatSatang ${gp.vatSatang} (คาด ${wp.vatSatang})`);
    const key = (l: Any) => `${l.itemId}|${l.qty === null || l.qty === undefined ? "S" : "W"}`;
    const proj = (l: Any) => `${idMap(String(l.itemId))}:${l.qty ?? "-"}:${l.shareNum ?? "-"}/${l.shareDen ?? "-"}:${l.amountSatang}:${l.stockOwner ? "O" : "x"}`;
    const gl = ((Array.isArray(gp.lines) ? gp.lines : []) as Any[]).map((l) => ({ k: key(l), v: proj(l) })).sort((a, b) => byId(a.k, b.k));
    const wl = wp.lines.map((l) => ({ k: key(l), v: proj(l) })).sort((a, b) => byId(a.k, b.k));
    if (gl.map((x) => x.v).join(",") !== wl.map((x) => x.v).join(",")) p.push(`ใบ${wp.no}.lines ${short(gl.map((x) => x.v), 160)} (คาด ${short(wl.map((x) => x.v), 160)})`);
  }
  return p;
}

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
 * ลายเซ็นของ export (L1 · สูตรเดียวกับ qc-pos-p2.4 L3): ฟังก์ชัน = ข้อความตั้งแต่ `export` ถึงวงเล็บปีกกาเปิดของตัวฟังก์ชัน ·
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
  restPosTables: `${REST_DIR}/pos-tables.ts`,
  restPosSplit: `${REST_DIR}/pos-split.ts`,
  table: `${POS_DIR}/table.ts`,
  split: `${POS_DIR}/table-split.ts`,
  splitShared: `${POS_DIR}/table-split-shared.ts`,
  preBill: `${POS_DIR}/pre-bill-render.ts`,
  register: `${POS_DIR}/register.ts`,
  regShared: `${POS_DIR}/register-shared.ts`,
  consumers: "src/lib/outbox-consumers.ts",
  scope: "src/lib/core/scope.ts",
  qcEnv: "scripts/pos-qc-env.mts",
  contract: "scripts/pos-sale-contract.json",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  ownerPending: "ledger/POS-OWNER-PENDING.md",
};
/** sha256 ของ scripts/pos-sale-contract.json (= qc-pos-p2.4 ST4 / qc-pos-p2.6 L3 · §7 หมุด) */
// ORACLE-EDIT ผู้คุม 14 ต.ค. (CD-P29-1: payMethods[].giftCard + pos/order.ts caller recorded — same re-pin as qc-pos-p2.4/p2.6 · P2.9 S merged 4967ce2d) — เดิม 7a418de17b44bf7c54e9ee99a3cb740ae596fb6fb240978901e8a07b011697cd ◂
const CONTRACT_SHA_BASE = "762e073cd5f80eeeb915835ae6b85e5793956facdfe233f90d65484db04dac55"; // ORACLE-EDIT ผู้คุม 21.10 (CD-RP9 qc-pos-p2.5): sha สัญญาหลัง merge P3.6 S f6ae3054 (+4 ฟิลด์ optional CreateSaleInput · ba68f669 → 762e073c) · ORACLE-EDIT ผู้คุม 17 ต.ค. (CD-RP1 qc-pos-p2.5 L2): sha สัญญาหลัง P3.4 S (0617d17b · +CreateSaleInput.offline) — เดิม 72afb258e9c0dc46c4d5ea2346835b6a56afda551038325d14ed9e12910546ad
const MIGRATION_NAME = "20261210100000_pos_p25_split";
const NEW_CODES = ["TABLE_SPLIT_OPEN", "TABLE_SPLIT_EXISTS", "TABLE_SPLIT_LOCKED", "TABLE_SPLIT_PART_PAID", "TABLE_SPLIT_NOT_FOUND", "TABLE_BUSY", "TABLE_HAS_DRAFT"] as const;
const camelKey = (code: string) => "errors." + code.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const SPLIT_FNS = ["registerSplitTable", "registerCancelSplit", "registerSplitDetail"] as const;
const TABLE_NEW_FNS = ["registerMoveTable", "registerMergeTables", "registerTablePreBill"] as const;
const FACADE_FNS = ["moveTableSessionInTx", "mergeTableSessionsInTx", "unlinkTableItemsInTx"] as const;
const SHARED_EXPORTS = ["allocateTableSplit", "TABLE_SPLIT_MODES", "TABLE_SPLIT_MIN_PARTS", "TABLE_SPLIT_MAX_PARTS"] as const;
const RENDER_EXPORTS = ["renderPreBillHtml", "renderPreBillEscPos", "PRE_BILL_LABELS"] as const;
const MSG_BLOCKS = ["split", "move", "merge", "preBill"] as const;
const PREBILL_TITLE_TH = "ใบรายการ — ไม่ใช่ใบเสร็จรับเงิน/ใบกำกับภาษี";
const PREBILL_TITLE_EN = "PRE-BILL — NOT A RECEIPT";
const PREBILL_FOOTER_TH = "ตรวจรายการแล้วแจ้งพนักงานเพื่อชำระเงิน";
const AUDIT_PREBILL = "pos.table.preBill";
/** คีย์ที่ห้ามมีใน payload ใบรายการ (ทุกระดับ) — ไม่ใช่เอกสารภาษี (มติ 9) */
const PREBILL_FORBIDDEN = ["receiptNo", "receiptNumber", "abbNo", "abbNumber", "taxId", "taxInvoiceNo", "docNo", "documentNo", "seq"];
const ENUMS: Record<string, string[]> = { PosTableSplitMode: ["ITEM", "EQUAL", "SEAT"], PosTableSplitStatus: ["OPEN", "DONE", "CANCELLED"], PosTableSplitPartStatus: ["OPEN", "PAID"] };
const MODEL_FIELDS: Record<string, [string, RegExp][]> = {
  PosTableSplit: [
    ["id", /^id\s+String\s+@id\b/], ["tenantId", /^tenantId\s+String(\s|$)/], ["systemId", /^systemId\s+String(\s|$)/], ["unitId", /^unitId\s+String(\s|$)/],
    ["sessionId", /^sessionId\s+String(\s|$)/], ["mode", /^mode\s+PosTableSplitMode(\s|$)/], ["status", /^status\s+PosTableSplitStatus(\s|$)/], ["partCount", /^partCount\s+Int(\s|$)/],
    ["itemsHash", /^itemsHash\s+String(\s|$)/], ["billDiscount", /^billDiscount\s+Json\?/], ["serviceChargeBp", /^serviceChargeBp\s+Int(\s|$)/],
    ["baseSatang", /^baseSatang\s+Int(\s|$)/], ["discountSatang", /^discountSatang\s+Int(\s|$)/], ["serviceChargeSatang", /^serviceChargeSatang\s+Int(\s|$)/], ["totalSatang", /^totalSatang\s+Int(\s|$)/],
    ["version", /^version\s+Int\s+@default\(1\)/], ["createdByUserId", /^createdByUserId\s+String\??(\s|$)/], ["createdAt", /^createdAt\s+DateTime\s+@default\(now\(\)\)/],
    ["updatedAt", /^updatedAt\s+DateTime\s+@updatedAt/], ["doneAt", /^doneAt\s+DateTime\?/], ["cancelledAt", /^cancelledAt\s+DateTime\?/],
  ],
  PosTableSplitPart: [
    ["id", /^id\s+String\s+@id\b/], ["tenantId", /^tenantId\s+String(\s|$)/], ["splitId", /^splitId\s+String(\s|$)/], ["no", /^no\s+Int(\s|$)/],
    ["label", /^label\s+String\?/], ["memberId", /^memberId\s+String\?/], ["baseSatang", /^baseSatang\s+Int(\s|$)/], ["discountSatang", /^discountSatang\s+Int(\s|$)/],
    ["serviceChargeSatang", /^serviceChargeSatang\s+Int(\s|$)/], ["totalSatang", /^totalSatang\s+Int(\s|$)/], ["status", /^status\s+PosTableSplitPartStatus(\s|$)/],
    ["saleId", /^saleId\s+String\?/], ["paidAt", /^paidAt\s+DateTime\?/],
  ],
  PosTableSplitLine: [
    ["id", /^id\s+String\s+@id\b/], ["tenantId", /^tenantId\s+String(\s|$)/], ["splitId", /^splitId\s+String(\s|$)/], ["partId", /^partId\s+String(\s|$)/],
    ["itemId", /^itemId\s+String(\s|$)/], ["qty", /^qty\s+Int\?/], ["shareNum", /^shareNum\s+Int\?/], ["shareDen", /^shareDen\s+Int\?/],
    ["amountSatang", /^amountSatang\s+Int(\s|$)/], ["stockOwner", /^stockOwner\s+Boolean(\s|$)/],
  ],
};
/** = qc-pos-p2.4 TS_FIELDS (ไม่เปลี่ยน · ห้ามเพิ่มความสัมพันธ์ไปตารางแยกบิล) */
const TS_FIELDS = ["id", "tenantId", "unitId", "tableId", "table", "status", "guestCount", "memberId", "openedByUserId", "mergedIntoId", "mergedInto", "mergedFrom", "openedAt", "closedAt", "createdAt", "updatedAt", "orders", "serviceRequests"];
/** = qc-pos-p2.4/p2.6 ROI_FIELDS (ORACLE-EDIT 14 ต.ค. + stockTaken) */
const ROI_FIELDS = ["id", "tenantId", "unitId", "orderId", "order", "menuItemId", "menuItem", "stationId", "station", "nameSnapshot", "unitPrice", "optionsTotal", "qty", "lineTotal", "note", "kdsStatus", "isRush", "cookingAt", "readyAt", "servedAt", "cancelledAt", "cancelReason", "cancelledByUserId", "saleId", "settledAt", "productId", "createdAt", "updatedAt", "options", "stockTaken"];
/** ทะเบียนผู้เรียก createSale (= qc-pos-p2.4 L2 / qc-pos-p2.6 L3 · สูตรเดียวกัน) */
// ORACLE-EDIT ผู้คุม 15 ต.ค. (P2.13) มติ 1: POST /sales ผ่าน submitRegisterSale ⇒ ไฟล์ pos/api/ops/sales.ts ไม่เรียก createSale แล้ว (1 → 0 · ถอดแถว)
const CALL_SITES: Record<string, number> = {
  "src/lib/actions/booking.ts": 1, "src/lib/actions/pos.ts": 1, "src/lib/ai/proposals.ts": 1, "src/lib/modules/booking/service.ts": 1,
  "src/lib/modules/clinic/service.ts": 1, "src/lib/modules/giftcard/service.ts": 2, "src/lib/modules/hotel/service.ts": 2,
  "src/lib/modules/member/subscription.ts": 1, "src/lib/modules/pos/register.ts": 1,
  "src/lib/modules/rental/service.ts": 2, "src/lib/modules/restaurant/order.ts": 1, "src/lib/modules/school/service.ts": 1,
  "src/lib/modules/shop/service.ts": 1, "src/lib/modules/ticket/service.ts": 1,
};
/** ผู้เรียกที่ใบอื่นเพิ่มได้ (P2.8 มติ: pos/order.ts 1 จุด) — มี = ต้องเท่านี้พอดี · ไม่มี = ผ่าน */
const CALL_SITES_ALLOWED_LATER: Record<string, number> = { "src/lib/modules/pos/order.ts": 1 };
/** register.ts เรียก ticketForSale ณ 4449123f (ทางใบขอรับเงิน :2460 + ทางปกติ :2805 · §7 ไม่มีจุดใหม่บนทางแยกบิล) */
const TICKET_FOR_SALE_IN_REGISTER = 2;
/** ลายเซ็น export ของโมดูลร้านอาหาร (= qc-pos-p2.4 SIGS_BASE ตรงตัว · R11/§7 แช่แข็ง รวม moveSession/mergeSession) */
const SIGS_BASE: Record<string, Record<string, string>> = {
  table: { listZones: "c8e66837ad1f", createZone: "657bb8ee1f6f", archiveZone: "1336f49c9347", createTable: "7c7335ab1a16", updateTable: "b3b16d37834a", archiveTable: "47d96578b58e", rotateQr: "d5e7b11b54d8", floorPlan: "5d6efa1d21d5", openSession: "ab58a6782f51", getSession: "38a38ad81b0a", openSessionOfTable: "6e6fbb24512b", openSessionsList: "99cca1fa8063", linkMember: "c579f79820a7", closeSession: "05a2d36cbde3", moveSession: "ca73dc7db579", mergeSession: "e2678ceaf8ad", "type TableCard": "dd90e6b09769" },
  order: { createOrder: "0ad725a9b31a", confirmOrder: "2108ca257e17", cancelOrderItem: "dae18c0cc783", setOrderRush: "4852e65ca7ae", createServiceRequest: "97c5f05f6e71", ackServiceRequest: "db4fa0866436", doneServiceRequest: "5396c3e2da71", listServiceRequests: "ee280efc9e7d", billPreview: "51fa4f808e6d", checkout: "8baf40c40637", voidCheckout: "471cc12884c3", billsToday: "0dce2df518da", ordersToday: "4ef771e3551a", "type CartLine": "eb7dfe6bb8a2", "type OrderError": "16b2614ffb88", "type BillLine": "4b470b8a90d1", "type BillToday": "366788f537a5" },
  menu: { getSetting: "f700dee962e0", updateSetting: "79d111854167", setKitchenPause: "4e67db9cc931", ensureDefaultStations: "894d9978ce47", listStations: "effe0d67ea7f", createStation: "4eadae186018", listCategories: "160def563ced", createCategory: "d2346c115e77", archiveCategory: "87644a22bb6d", listOptionGroups: "644ce3d6366d", createOptionGroup: "8cd876100eff", archiveOptionGroup: "0fa449815cf8", setChoiceStock: "5bd5a5463933", listItems: "1fc6faba97a3", getItem: "71032293f7ff", createItem: "82bf759e3162", updateItem: "67b302b17226", setItemOptionGroups: "b27f4bbb5879", duplicateItem: "62f7a2ced447", archiveItem: "3b9ed28cc3f1", setItemStock: "4c5b39aa477a", orderingMenu: "0335bba33bf9", resetDailyStock: "98ca27407c5c", "type OrderingMenuChoice": "5fe03be7e840", "type OrderingMenuGroup": "0686bac15880", "type OrderingMenuItem": "c4d70abcfc39", "type OrderingMenuCat": "df2872299963" },
  kds: { stationQueue: "0b629f94e719", advanceItem: "02f15cb51c4d", recallItem: "525c524982ac", expoQueue: "53924013f2cb" },
  storefront: { resolveUnit: "8e8a249ea05f", publicMenu: "565700125ede", resolveTableSession: "63240575d567", tableStatusForGuest: "e0efafa8e491", guestBill: "341ebe3ef184", notifyPromptpayPayment: "9f887f1e2496", placeGuestOrder: "1e486abc28d4", "type GuestBill": "ff8cf6e2e286" },
  scope: { bizDateBkk: "904b1cf77499", nowMinutesBkk: "50abf9b645bc", dowBkk: "038b8485d5d4", baht: "5f8bdb640984", hhmmToMin: "a80d74af739e", kitchenOpenNow: "bdbb011302fa", "type ServiceHourDay": "74ce2d5dbdc4", "type SpecialClosure": "8dbb78ea5f91" },
};

const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2", "ST3", "L1", "L2"].map((x) => `P2.5-${x}`);
const PURE_IDS = ["M6", "B3"].map((x) => `P2.5-${x}`);
const skipReasons: string[] = [];
for (const f of [F.split, F.splitShared, F.preBill]) if (!existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);
for (const [f, names] of [
  [F.split, [...SPLIT_FNS]],
  [F.table, [...TABLE_NEW_FNS]],
  [F.splitShared, [...SHARED_EXPORTS]],
  [F.preBill, [...RENDER_EXPORTS]],
  [F.restIndex, [...FACADE_FNS]],
] as [string, string[]][])
  for (const n of names) if (!exportsFn(srcOf(f), n)) skipReasons.push(`ยังไม่มี export ${n} (${f.split("/").slice(-2).join("/")})`);

/** ไฟล์ "shared"/ตัวเรนเดอร์ ไม่ import prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (ค่า) และไม่มีนาฬิกา/สุ่ม — เงื่อนไขที่ --no-db โหลดได้ */
const purePath = (f: string): boolean => {
  const s = srcOf(f);
  if (!s) return false;
  const valueImports = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const dyn = [...s.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);
  if ([...valueImports, ...dyn].some((p) => /@prisma\/client|\/db$|^\.\/db$|@\/lib\/core\/db|@\/lib\/modules\/(inventory|account|system|restaurant|member)|^node:|^crypto$|^next|server-only|^\.\/(catalog|catalog-legacy|register|service|bills|refund|held-cart|table|table-split|channel|shift|device|receipt|kds)$/.test(p))) return false;
  return !/\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)|\bMath\.random\s*\(/.test(s);
};
const pureImportsOnly = (f: string, allowed: RegExp): string[] =>
  [...srcOf(f).matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!).filter((p) => !allowed.test(p));

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  // ST1 schema + migration
  {
    const p: string[] = [];
    for (const [en, vals] of Object.entries(ENUMS)) {
      const b = prismaBlock(schemaSrc, "enum", en);
      const got = b ? b.split("\n").slice(1).map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l)) : [];
      if (!b) p.push(`ไม่มี enum ${en}`);
      else if (setStr(got) !== setStr(vals)) p.push(`${en} = ${got.join(",")} (คาด ${vals.join(",")})`);
    }
    for (const [model, fields] of Object.entries(MODEL_FIELDS)) {
      const b = prismaBlock(schemaSrc, "model", model);
      if (!b) {
        p.push(`ไม่มี model ${model}`);
        continue;
      }
      for (const [f, re] of fields) {
        const l = fieldLine(b, f);
        if (!l) p.push(`${model} ขาด ${f}`);
        else if (!re.test(l)) p.push(`${model}.${f} = ${short(l, 70)}`);
      }
      const extra = fieldLines(b).filter((l) => !fields.some(([f]) => l.split(/\s+/)[0] === f));
      for (const l of extra) {
        const typ = l.split(/\s+/)[1] ?? "";
        const relToSplit = /^PosTableSplit(Part|Line)?$/.test(typ); // ความสัมพันธ์ภายในตารางแยกบิล (part → split) ได้
        if (!(typ.endsWith("?") || typ.endsWith("[]") || /@default\(|@updatedAt/.test(l) || relToSplit)) p.push(`${model} ฟิลด์เกินที่บังคับ: ${short(l, 60)}`);
        if (/^(TableSession|RestaurantOrderItem|RestaurantTable|PosSale|RestaurantOrder)\b/.test(typ)) p.push(`${model} มี @relation ไป ${typ} (§3 ห้าม)`);
      }
    }
    if (!/@@unique\(\s*\[\s*splitId\s*,\s*no\s*\]/.test(prismaBlock(schemaSrc, "model", "PosTableSplitPart"))) p.push("PosTableSplitPart ไม่มี @@unique([splitId, no])");
    const tsn = fieldNames(prismaBlock(schemaSrc, "model", "TableSession"));
    const tsExtra = fieldLines(prismaBlock(schemaSrc, "model", "TableSession")).filter((l) => !TS_FIELDS.includes(l.split(/\s+/)[0]!)).filter((l) => !/^\w+\s+(PosHeldCart|RestaurantReservation)\[\]/.test(l));
    if (TS_FIELDS.some((f) => !tsn.includes(f)) || tsExtra.length) p.push(`TableSession เปลี่ยน (เกิน ${tsExtra.map((l) => l.split(/\s+/)[0]).join(",") || "-"})`);
    const roi = fieldNames(prismaBlock(schemaSrc, "model", "RestaurantOrderItem"));
    if (setStr(roi) !== setStr(ROI_FIELDS)) p.push(`RestaurantOrderItem ฟิลด์เปลี่ยน (${roi.filter((f) => !ROI_FIELDS.includes(f)).join(",") || "-"} / ${ROI_FIELDS.filter((f) => !roi.includes(f)).join(",") || "-"})`);
    if (/PosTableSplit/.test(prismaBlock(schemaSrc, "model", "PosSale"))) p.push("PosSale อ้าง PosTableSplit* (§3: ไม่มีคอลัมน์/ความสัมพันธ์ใหม่บน PosSale)");
    // migration
    const files = walk("prisma/migrations", [], /\.sql$/).filter((f) => /"PosTableSplit/.test(rd(f)));
    if (files.length !== 1) p.push(`migration ที่แตะ PosTableSplit* = ${files.length} ไฟล์ (คาด 1)`);
    for (const f of files) {
      const name = f.split("/").slice(-2, -1)[0] ?? "";
      if (name !== MIGRATION_NAME) p.push(`ชื่อ migration ${name} (คาด ${MIGRATION_NAME})`);
      let sql = rd(f).replace(/--.*$/gm, "");
      const doBlocks = [...sql.matchAll(/DO\s+\$\$([\s\S]*?)\$\$\s*;/gi)].map((m) => m[1]!);
      for (const b of doBlocks)
        if (!(/CREATE\s+TYPE\s+"PosTableSplit\w*"/i.test(b) || /ALTER\s+TABLE\s+"PosTableSplit\w*"\s+ADD\s+CONSTRAINT/i.test(b)) || /\b(DROP|RENAME|DELETE|UPDATE|TRUNCATE|INSERT)\b/i.test(b))
          p.push(`DO block นอกรายการ (${short(b.replace(/\s+/g, " "), 60)})`);
      const inDo = doBlocks.join("\n");
      sql = sql.replace(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi, "");
      const stmts = sql.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
      const ok = (s: string) =>
        /^(SET|RESET) lock_timeout\b/i.test(s) ||
        /^CREATE TYPE "PosTableSplit\w*" AS ENUM ?\(/i.test(s) ||
        /^CREATE TABLE IF NOT EXISTS "PosTableSplit(Part|Line)?" \(/i.test(s) ||
        /^CREATE (UNIQUE )?INDEX IF NOT EXISTS "[^"]+" ON "PosTableSplit(Part|Line)?"/i.test(s) ||
        /^ALTER TABLE "PosTableSplit(Part|Line)?" ADD CONSTRAINT "[^"]+" (FOREIGN KEY|CHECK)\b/i.test(s);
      const bad = stmts.filter((s) => !ok(s) || /\b(DROP|RENAME|TRUNCATE|DELETE FROM|UPDATE "|INSERT INTO|ALTER COLUMN|ADD VALUE|CONCURRENTLY)\b/i.test(s));
      if (bad.length) p.push(`${name}: คำสั่งนอกรายการอนุญาต/ไม่มี IF NOT EXISTS (${short(bad[0], 90)})`);
      const all = stmts.join(";\n") + "\n" + inDo;
      for (const [en, vals] of Object.entries(ENUMS)) {
        const ty = new RegExp(`CREATE\\s+TYPE\\s+"${en}"\\s+AS\\s+ENUM\\s*\\(([^)]*)\\)`, "i").exec(all);
        if (!ty) p.push(`ไม่มี CREATE TYPE "${en}"`);
        else if (setStr(ty[1]!.split(",").map((x) => x.trim().replace(/'/g, ""))) !== setStr(vals)) p.push(`ENUM ${en} ${ty[1]}`);
      }
      for (const t of ["PosTableSplit", "PosTableSplitPart", "PosTableSplitLine"]) {
        const ct = stmts.find((s) => new RegExp(`^CREATE TABLE IF NOT EXISTS "${t}" \\(`, "i").test(s)) ?? "";
        if (!ct) p.push(`ไม่มี CREATE TABLE IF NOT EXISTS "${t}"`);
        else {
          const miss = MODEL_FIELDS[t]!.map(([c]) => c).filter((c) => !new RegExp(`"${c}"`).test(ct));
          if (miss.length) p.push(`${t} ขาดคอลัมน์ ${miss.join(",")}`);
          if (/"(TableSession|RestaurantOrderItem|PosSale|RestaurantTable)"/.test(ct)) p.push(`${t} อ้างตารางร้านอาหาร/PosSale (§3 ห้าม FK)`);
        }
      }
      const fkBad = [...stmts, inDo].filter((s) => /REFERENCES\s+"(TableSession|RestaurantOrderItem|PosSale|RestaurantTable|RestaurantOrder)"/i.test(s));
      if (fkBad.length) p.push(`FK ไปตารางร้านอาหาร/PosSale (${short(fkBad[0], 60)})`);
      const pu = stmts.find((s) => /"PosTableSplit_session_open_key"/.test(s)) ?? "";
      if (!pu) p.push('ไม่มี partial unique "PosTableSplit_session_open_key"');
      else if (!/^CREATE UNIQUE INDEX/i.test(pu) || !/\(\s*"sessionId"\s*\)/.test(pu) || !/WHERE[\s\S]*"?status"?\s*=\s*'OPEN'/i.test(pu)) p.push(`PosTableSplit_session_open_key ไม่ใช่ UNIQUE ("sessionId") WHERE status='OPEN' (${short(pu, 80)})`);
      const ps = stmts.find((s) => /^CREATE UNIQUE INDEX/i.test(s) && /ON "PosTableSplitPart"/i.test(s) && /\(\s*"saleId"\s*\)/.test(s)) ?? "";
      if (!ps || !/WHERE[\s\S]*"saleId"\s+IS\s+NOT\s+NULL/i.test(ps)) p.push(`ไม่มี partial unique PosTableSplitPart("saleId") WHERE "saleId" IS NOT NULL`);
      if (!/lock_timeout/i.test(all)) p.push("ไม่มี SET lock_timeout");
    }
    chk("ST1", p.length === 0, "3 enum + 3 ตาราง + migration เดียวเพิ่มล้วน", P8(p) || `ครบ (${files[0] ?? "—"})`);
  }
  // ST2 ลงทะเบียน
  {
    const p: string[] = [];
    const sc = srcOf(F.scope);
    for (const m of ["PosTableSplit", "PosTableSplitPart", "PosTableSplitLine"]) if (!new RegExp(`\\b${m}\\s*:\\s*(sys\\(\\)|unit|tenant)\\s*,`).test(sc)) p.push(`scope.ts ไม่มี ${m}: sys()/unit/tenant`);
    const env = srcOf(F.qcEnv);
    const pm = env.slice(env.indexOf("export const POS_MODELS"), env.indexOf("export type PosModelKey"));
    for (const [k, m] of [["posTableSplit", "PosTableSplit"], ["posTableSplitPart", "PosTableSplitPart"], ["posTableSplitLine", "PosTableSplitLine"]])
      if (!new RegExp(`\\b${k}\\s*:\\s*\\{[^}]*model:\\s*"${m}"`).test(pm)) p.push(`pos-qc-env POS_MODELS ไม่มี ${k} {model: "${m}"}`);
    const rs = srcOf(F.regShared);
    const union = rs.slice(rs.indexOf("export type RegisterRefusalCode"), rs.indexOf(";", rs.indexOf("export type RegisterRefusalCode")));
    const keyMap = constBody(rs, "const REFUSAL_KEY");
    for (const c of NEW_CODES) {
      if (!new RegExp(`"${c}"`).test(union)) p.push(`RegisterRefusalCode ไม่มี ${c}`);
      if (!new RegExp(`\\b${c}\\s*:\\s*"${camelKey(c).replace(".", "\\.")}"`).test(keyMap)) p.push(`REFUSAL_KEY ไม่มี ${c}: "${camelKey(c)}"`);
    }
    const reg = srcOf(F.register);
    if (!/"tableSplitPartId"/.test(constBody(reg, "const REG_QUOTE_KEYS"))) p.push("REG_QUOTE_KEYS ไม่มี tableSplitPartId");
    if (!/"expectedSplitVersion"/.test(constBody(reg, "const REG_SUBMIT_KEYS"))) p.push("REG_SUBMIT_KEYS ไม่มี expectedSplitVersion");
    const leaves = (o: unknown, pre = ""): [string, string][] => (typeof o === "string" ? [[pre, o]] : isRecord(o) ? Object.entries(o).flatMap(([k, v]) => leaves(v, pre ? `${pre}.${k}` : k)) : []);
    const blocks: Record<string, [string, string][]> = {};
    for (const [lang, f] of [["th", F.msgTh], ["en", F.msgEn]] as const) {
      let j: Any = null;
      try {
        j = JSON.parse(rd(f) || "null");
      } catch (e) {
        p.push(`${f} อ่าน JSON ไม่ได้: ${(e as Error).message.slice(0, 40)}`);
      }
      const all: [string, string][] = [];
      for (const b of MSG_BLOCKS) {
        const lv = leaves(j?.tables?.[b], b);
        if (!lv.length) p.push(`${lang}: ไม่มีก้อนข้อความ tables.${b}.*`);
        else if (lang === "th" && !lv.some(([, s]) => THAI.test(s))) p.push(`th: tables.${b}.* ไม่มีข้อความไทย`);
        else if (lang === "en" && lv.some(([, s]) => THAI.test(s))) p.push(`en: tables.${b}.* มีอักษรไทย`);
        all.push(...lv);
      }
      blocks[lang] = all;
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
    if (kt.length && ke.length && short(kt, 20000) !== short(ke, 20000)) p.push(`คีย์ tables.{split,move,merge,preBill} th/en ไม่ตรงกัน (th ${kt.length} · en ${ke.length})`);
    chk("ST2", p.length === 0, "scope · POS_MODELS · 7 รหัส + คีย์ข้อความ · คีย์ quote/submit · ข้อความ th/en", P8(p) || `ครบ (${kt.length} คีย์)`);
  }
  // ST3 ขอบเขต
  {
    const p: string[] = [];
    const idxRaw = rd(F.restIndex);
    const idx = stripComments(idxRaw);
    if (!/POS P2\.5\s*▸/.test(idxRaw)) p.push("restaurant/index.ts ไม่มีรอยต่อ // POS P2.5 ▸ … ◂");
    for (const n of FACADE_FNS) {
      if (!exportsFn(idx, n)) p.push(`restaurant/index.ts ไม่ export ${n}`);
      if (!exportsFn(srcOf(F.restPosTables), n) && !exportsFn(srcOf(F.restPosSplit), n)) p.push(`${n} ไม่ได้นิยามใน restaurant/pos-tables.ts หรือ restaurant/pos-split.ts`);
    }
    for (const n of SPLIT_FNS) if (!exportsFn(srcOf(F.split), n)) p.push(`pos/table-split.ts ไม่ export ${n}`);
    for (const n of TABLE_NEW_FNS) if (!exportsFn(srcOf(F.table), n)) p.push(`pos/table.ts ไม่ export ${n}`);
    for (const f of [F.splitShared, F.preBill]) {
      if (!existsSync(join(ROOT, f))) p.push(`ไม่มี ${f.split("/").pop()}`);
      else if (!purePath(f)) p.push(`${f.split("/").pop()} ไม่บริสุทธิ์ (import prisma/เซิร์ฟเวอร์/node: หรือมี Date.now/new Date()/Math.random)`);
    }
    for (const n of SHARED_EXPORTS) if (!exportsFn(srcOf(F.splitShared), n)) p.push(`table-split-shared.ts ไม่ export ${n}`);
    for (const n of RENDER_EXPORTS) if (!exportsFn(srcOf(F.preBill), n)) p.push(`pre-bill-render.ts ไม่ export ${n}`);
    const rbad = existsSync(join(ROOT, F.preBill)) ? pureImportsOnly(F.preBill, /^\.\/([\w-]+-shared|receipt-render)$/) : [];
    if (rbad.length) p.push(`pre-bill-render.ts import นอก *-shared/receipt-render (${rbad.join(",")})`);
    // POS → ร้านอาหาร: index แบบ lazy เท่านั้น · ไม่เขียนตารางร้านอาหารตรง
    const W = "(create|createMany|update|updateMany|upsert|delete|deleteMany)";
    const RM = "(restaurantOrder|restaurantOrderItem|restaurantOrderItemOption|restaurantTable|restaurantZone|tableSession|restaurantServiceRequest|restaurantReservation|restaurantDailyCounter)";
    for (const f of [...walk(POS_DIR), F.consumers]) {
      const s = srcOf(f);
      const deep = [...s.matchAll(/(?:from\s*|import\s*\(\s*)["'](@\/lib\/modules\/restaurant\/[^"']+|\.\.\/restaurant[^"']*)["']/g)].map((m) => m[1]!);
      if (deep.length) p.push(`${f.split("/").slice(-2).join("/")} import ร้านอาหารแบบเจาะไฟล์ (${deep[0]})`);
      if (/^\s*import\s+(?!type\b)[^;]*?from\s+["']@\/lib\/modules\/restaurant["']/m.test(s)) p.push(`${f.split("/").slice(-2).join("/")} import ร้านอาหารแบบ static`);
      if (new RegExp(`\\.${RM}\\.${W}\\b`).test(s)) p.push(`${f.split("/").slice(-2).join("/")} เขียนตารางร้านอาหารตรง (ต้องผ่าน facade)`);
      if (/(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"(Restaurant\w*|TableSession)"/i.test(s)) p.push(`${f.split("/").slice(-2).join("/")} SQL เขียนตารางร้านอาหารตรง`);
    }
    // ไฟล์ action ("use server") ของ modules/pos รวมกันเรียกครบ 6 + catch
    const actFiles = walk(POS_DIR).filter((f) => isUseServer(rd(f)));
    const act = actFiles.map((f) => srcOf(f)).join("\n");
    for (const n of [...SPLIT_FNS, ...TABLE_NEW_FNS]) if (!new RegExp(`\\b${n}\\s*\\(`).test(act)) p.push(`ไม่มีไฟล์ "use server" ใน modules/pos ที่เรียก ${n}`);
    for (const f of actFiles) {
      const s = srcOf(f);
      const bad = [...s.matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim()).filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`${f.split("/").pop()}: export ที่ไม่ใช่ async function`);
      const starts = [...s.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map((m) => ({ name: m[1]!, at: m.index! }));
      for (let i = 0; i < starts.length; i++) {
        const body = s.slice(starts[i]!.at, i + 1 < starts.length ? starts[i + 1]!.at : s.length);
        if ([...SPLIT_FNS, ...TABLE_NEW_FNS].some((n) => new RegExp(`\\b${n}\\s*\\(`).test(body)) && !/\bcatch\b/.test(body)) p.push(`${starts[i]!.name} ไม่มี catch`);
      }
    }
    // ตัวรับ void แยกใบได้ (หนึ่งก้อนในตัวเดิม)
    if (!/POS P2\.5\s*▸/.test(fnBody(rd(F.table), "tableSaleVoided"))) p.push("pos/table.ts tableSaleVoided ไม่มีรอยต่อ POS P2.5 ▸ (ตัวรับ void แยกใบ · มติ 7)");
    // ไฟล์ใหม่ไม่ปล่อย outbox · ไม่มี ticketForSale บนทางแยกบิล
    for (const f of [F.split, F.splitShared, F.preBill, F.restPosSplit]) if (/\bemitOutbox\b|\.outboxEvent\.(create|createMany|upsert)\b/.test(srcOf(f))) p.push(`${f.split("/").pop()} ปล่อย outbox event (แผน/ใบรายการไม่ลงบัญชี · §4)`);
    if (/\bticketForSale\b/.test(srcOf(F.split))) p.push("table-split.ts อ้าง ticketForSale (§7: ไม่มีรอบครัวบนทางแยกบิล)");
    // 'use client' ไม่ import ฝั่งเซิร์ฟเวอร์ของแยกบิล
    for (const f of walk("src")) {
      const raw = rd(f);
      if (!isUseClient(raw)) continue;
      const imps = [...stripComments(raw).matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
      const badc = imps.filter((x) => /modules\/pos\/(table|table-split)$|modules\/restaurant$/.test(x));
      if (badc.length) p.push(`${f} ('use client') import ${badc.join(",")}`);
    }
    // ST7: จอใหม่ของ P2.5 (ถ้ามี) ไม่มีอักษรไทยในโค้ด (ข้อความผ่าน pos.tables.*)
    const ui = walk("src/components/pos", [], /\.tsx$/).filter((f) => /split|pre-?bill|move-?table|merge-?table/i.test(f));
    for (const f of ui) {
      const lits = [...stripComments(rd(f)).matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1|>([^<>{}\n]+)</g)].map((m) => m[2] ?? m[3] ?? "").filter((x) => THAI.test(x));
      if (lits.length) p.push(`${f.split("/").pop()} มีอักษรไทยในโค้ด ${lits.length} ที่ (${short(lits[0], 30)})`);
    }
    const own = rd(F.ownerPending).split("\n").filter((l) => /P2\.5/.test(l));
    if (!own.length) p.push("POS-OWNER-PENDING.md ไม่มีบรรทัด P2.5 (§4 known effects: จำนวนต่อสินค้าในรายงาน · คืนเงินบรรทัดส่วนแบ่ง · VAT ต่างได้ ≤ ⌊(N+1)/2⌋)");
    chk("ST3", p.length === 0, "facade P2.5 · export ครบ · บริสุทธิ์ · ผู้เขียนเดียว · actions · ตัวรับ void · ไม่มี outbox/ticketForSale ใหม่ · ST7 · โน้ตเจ้าของ", P8(p) || `ครบ (${actFiles.length} ไฟล์ use server · ${ui.length} จอใหม่)`);
  }
  // L1 ลายเซ็น export ของร้านอาหาร + ชุดฟิลด์
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
    const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
    const roi = fieldNames(prismaBlock(schemaSrc, "model", "RestaurantOrderItem"));
    if (setStr(roi) !== setStr(ROI_FIELDS)) p.push("RestaurantOrderItem ชุดฟิลด์ ≠ ROI_FIELDS");
    const tsn = fieldNames(prismaBlock(schemaSrc, "model", "TableSession")).filter((f) => !/^(heldCarts|reservations|posHeldCarts)$/.test(f));
    if (TS_FIELDS.some((f) => !tsn.includes(f))) p.push("TableSession ขาดฟิลด์ของ TS_FIELDS");
    chk("L1", p.length === 0, "export เดิมทุกตัวลายเซ็นเดิม · ชุดฟิลด์เดิม", P8(p) || `ครบ (${n} export)`);
  }
  // L2 สัญญา createSale + ผู้เรียก + ticketForSale
  {
    const p: string[] = [];
    const raw = existsSync(join(ROOT, F.contract)) ? readFileSync(join(ROOT, F.contract)) : Buffer.from("");
    const h = createHash("sha256").update(raw).digest("hex");
    if (h !== CONTRACT_SHA_BASE) p.push(`pos-sale-contract.json เปลี่ยน (sha ${h.slice(0, 12)} ≠ ${CONTRACT_SHA_BASE.slice(0, 12)})`);
    const found: Record<string, number> = {};
    for (const f of walk("src")) {
      if (f.endsWith("src/lib/modules/pos/service.ts") || f.endsWith("src/lib/contracts.ts")) continue;
      const n = (stripComments(rd(f)).match(/\bcreateSale\s*\(/g) ?? []).length;
      if (n) found[f] = n;
    }
    const want = (f: string) => CALL_SITES[f] ?? (found[f] === CALL_SITES_ALLOWED_LATER[f] ? CALL_SITES_ALLOWED_LATER[f] : 0);
    const diff = [...new Set([...Object.keys(CALL_SITES), ...Object.keys(found)])].filter((f) => want(f) !== (found[f] ?? 0)).map((f) => `${f.replace("src/lib/", "")}:${want(f)}→${found[f] ?? 0}`);
    if (diff.length) p.push(`ผู้เรียก createSale ต่าง: ${diff.join(", ")}`);
    for (const f of [F.split, F.splitShared, F.preBill, F.restPosSplit]) if (/\bcreateSale\b/.test(srcOf(f))) p.push(`${f.split("/").pop()} อ้าง createSale`);
    const tfs = (srcOf(F.register).match(/\bticketForSale\s*\(/g) ?? []).length;
    if (tfs !== TICKET_FOR_SALE_IN_REGISTER) p.push(`register.ts เรียก ticketForSale ${tfs} จุด (คาด ${TICKET_FOR_SALE_IN_REGISTER})`);
    chk("L2", p.length === 0, "สัญญา createSale ตรง · ผู้เรียกเท่าเดิม · ticketForSale 2 จุด", P8(p) || `ครบ (${sum(Object.values(found))} จุด/${Object.keys(found).length} ไฟล์)`);
  }
}

// ═════════════════════════ 1b. บริสุทธิ์ (ไม่แตะ DB) ═════════════════════════
/** เมนูของภาพ 03/15 (โต๊ะ A5) — id = ชื่อเล่น · ราคา/ชิ้น สตางค์ · Σ 124000 */
const A5_MENU: [string, number, number][] = [["tomyum", 1, 18000], ["kaprao", 2, 9900], ["rice", 4, 1500], ["squid", 1, 23000], ["yum", 1, 15000], ["chayen", 3, 6900], ["latte", 2, 7500], ["brownie", 1, 6500]];
/** 15B: บิล 1 = กะเพรา×2 ข้าว×3 ยำ ชาไทย×3 ลาเต้×1 · บิล 2 = ต้มยำ ปลาหมึก ข้าว×1 ลาเต้×1 บราวนี่ */
const ALLOC_15B: [string, number | null, number][] = [["tomyum", 2, 1], ["kaprao", 1, 2], ["rice", 1, 3], ["rice", 2, 1], ["squid", 2, 1], ["yum", 1, 1], ["chayen", 1, 3], ["latte", 1, 1], ["latte", 2, 1], ["brownie", 2, 1]];
/** 15C ตามที่นั่ง: ที่นั่ง 1 ต้มยำ ข้าว ลาเต้ · 2 ปลาหมึก ข้าว ชาไทย บราวนี่ · 3 กะเพรา ข้าว ชาไทย · 4 กะเพรา ข้าว ชาไทย ลาเต้ · กลางโต๊ะ ยำ */
const ALLOC_15C: [string, number | null, number][] = [
  ["tomyum", 1, 1], ["rice", 1, 1], ["latte", 1, 1],
  ["squid", 2, 1], ["rice", 2, 1], ["chayen", 2, 1], ["brownie", 2, 1],
  ["kaprao", 3, 1], ["rice", 3, 1], ["chayen", 3, 1],
  ["kaprao", 4, 1], ["rice", 4, 1], ["chayen", 4, 1], ["latte", 4, 1],
  ["yum", null, 1],
];
const pureItems = (): RItem[] => A5_MENU.map(([k, q, u]) => ({ id: k, qty: q, unitSatang: u }));
const pureAlloc = (spec: [string, number | null, number][], idOf: (k: string) => string = (k) => k): RAlloc[] => spec.map(([k, p, q]) => ({ itemId: idOf(k), partNo: p, qty: q }));
/** ค่าที่ภาพ/บรีฟกำหนด (สตางค์) — ข้อสอบตรวจทั้งตัวอ้างอิงและผลจริง */
const WANT_15B = [74250, 62150];
const WANT_15C = [33825, 45815, 24255, 32505];
const WANT_EQ3 = [45467, 45467, 45466];
const WANT_EQ4 = [34100, 34100, 34100, 34100];
/** PRNG มีเมล็ด (mulberry32) — 500 แผนเหมือนกันทุกรอบ */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randomPlan(r: () => number): RIn {
  const ri = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const modes = ["ITEM", "EQUAL", "SEAT"] as const;
  for (;;) {
    const mode = modes[ri(0, 2)]!;
    const N = r() < 0.15 ? ri(9, 20) : ri(2, 8);
    const items: RItem[] = Array.from({ length: ri(1, 14) }, (_, k) => ({ id: `i${String(k).padStart(2, "0")}`, qty: ri(1, 6), unitSatang: r() < 0.1 ? 0 : ri(1, 60000) }));
    const allocations: RAlloc[] = [];
    if (mode !== "EQUAL") {
      let next = 1;
      for (const it of items)
        for (let u = 0; u < it.qty; u++) {
          const shared = mode === "SEAT" && r() < 0.25;
          const p = shared ? null : next <= N ? next++ : ri(1, N);
          const same = allocations.find((a) => a.itemId === it.id && a.partNo === p);
          if (same) same.qty++;
          else allocations.push({ itemId: it.id, partNo: p, qty: 1 });
        }
      const covered = new Set(allocations.filter((a) => a.partNo !== null).map((a) => a.partNo));
      const anyShared = allocations.some((a) => a.partNo === null);
      if (!anyShared && covered.size < N) continue; // ใบว่าง — สุ่มใหม่ (ข้อปฏิเสธใบว่างตรวจแยก)
    }
    const B = sum(items.map((x) => x.qty * x.unitSatang));
    const dk = r();
    const billDiscount: RDisc = dk < 0.6 ? null : dk < 0.8 ? { type: "PERCENT", value: ri(1, 5000) } : { type: "AMOUNT", value: ri(0, B) };
    const serviceChargeBp = [0, 500, 1000, 1250, 333][ri(0, 4)]!;
    return { mode, partCount: N, items, ...(mode === "EQUAL" ? {} : { allocations }), billDiscount, serviceChargeBp, vatRateBp: r() < 0.8 ? 700 : 0 };
  }
}
async function runPure(sharedMod: Any, renderMod: Any): Promise<void> {
  console.log("\n── บริสุทธิ์ (ไม่แตะ DB) ──");
  // M6 allocateTableSplit
  {
    const p: string[] = [];
    const alloc = (i: RIn) => callSync(sharedMod, "allocateTableSplit", i);
    if (!sharedMod) p.push(`${MISSING} table-split-shared.ts (หรือไม่บริสุทธิ์)`);
    else {
      const ex: [string, RIn, number[]][] = [
        ["15B", { mode: "ITEM", partCount: 2, items: pureItems(), allocations: pureAlloc(ALLOC_15B), serviceChargeBp: 1000, vatRateBp: 700 }, WANT_15B],
        ["15C", { mode: "SEAT", partCount: 4, items: pureItems(), allocations: pureAlloc(ALLOC_15C), serviceChargeBp: 1000, vatRateBp: 700 }, WANT_15C],
        ["EQ3", { mode: "EQUAL", partCount: 3, items: pureItems(), serviceChargeBp: 1000, vatRateBp: 700 }, WANT_EQ3],
        ["EQ4", { mode: "EQUAL", partCount: 4, items: pureItems(), serviceChargeBp: 1000, vatRateBp: 700 }, WANT_EQ4],
      ];
      for (const [lbl, inp, want] of ex) {
        const ref = refAlloc(inp);
        if (!ref.ok || short(ref.parts.map((x) => x.totalSatang)) !== short(want)) p.push(`(ตัวอ้างอิงของข้อสอบ) ${lbl} ${short(ref.ok ? ref.parts.map((x) => x.totalSatang) : ref)}`);
        const got = alloc(inp);
        const d = diffPlan(got, ref);
        if (d.length) p.push(`${lbl}: ${P8(d)}`);
      }
      // VAT NONE
      const v0 = alloc({ mode: "EQUAL", partCount: 3, items: pureItems(), serviceChargeBp: 1000, vatRateBp: 0 });
      if (v0?.ok !== true || ((v0.parts ?? []) as Any[]).some((x) => x.vatSatang !== 0)) p.push(`vatRateBp 0 → ${short(v0?.parts?.map((x: Any) => x.vatSatang) ?? codeOf(v0), 60)}`);
      // 500 แผนสุ่ม
      const r = rng(0x25_15c);
      let bad = 0;
      for (let k = 0; k < 500; k++) {
        const inp = randomPlan(r);
        const frozen = JSON.stringify(inp);
        const ref = refAlloc(inp);
        const g1 = alloc(inp);
        const g2 = alloc(JSON.parse(frozen) as RIn);
        const d = diffPlan(g1, ref);
        if (JSON.stringify(inp) !== frozen) d.push("แก้อินพุต");
        if (short(g1, 100000) !== short(g2, 100000)) d.push("เรียกซ้ำผลต่าง");
        if (ref.ok && g1?.ok === true) {
          const parts = g1.parts as Any[];
          if (sum(parts.map((x) => Number(x.totalSatang))) !== ref.totalSatang) d.push("Σ สุทธิ ≠ ยอดทั้งโต๊ะ");
          for (const it of inp.items) {
            const st = sum(parts.flatMap((x) => (x.lines as Any[]).filter((l) => l.itemId === it.id && l.stockOwner).map((l) => Number(l.qty ?? l.shareNum))));
            if (st !== it.qty) d.push(`สต็อก ${it.id} ${st}/${it.qty}`);
          }
        }
        if (d.length) {
          bad++;
          if (bad <= 3) p.push(`แผนสุ่ม #${k} (${inp.mode} ${inp.partCount} ใบ ${inp.items.length} รายการ): ${P8(d)}`);
        }
      }
      if (bad > 3) p.push(`แผนสุ่มผิดรวม ${bad}/500`);
      // ปฏิเสธ
      const items = pureItems();
      const rej: [string, RIn, string][] = [
        ["1 ใบ", { mode: "EQUAL", partCount: 1, items, serviceChargeBp: 1000 }, "VALIDATION"],
        ["21 ใบ", { mode: "EQUAL", partCount: 21, items, serviceChargeBp: 1000 }, "VALIDATION"],
        ["ใบว่าง (ITEM 3 ใบ ระบุแค่ 1–2)", { mode: "ITEM", partCount: 3, items, allocations: pureAlloc(ALLOC_15B), serviceChargeBp: 1000 }, "VALIDATION"],
        ["ยังไม่ระบุ (ขาดบราวนี่)", { mode: "ITEM", partCount: 2, items, allocations: pureAlloc(ALLOC_15B.filter(([k]) => k !== "brownie")), serviceChargeBp: 1000 }, "VALIDATION"],
        ["เกินจำนวน (ข้าว 3+2)", { mode: "ITEM", partCount: 2, items, allocations: pureAlloc(ALLOC_15B.map(([k, pn, q]) => (k === "rice" && pn === 2 ? [k, pn, 2] : [k, pn, q]))), serviceChargeBp: 1000 }, "VALIDATION"],
        ["ITEM แบ่งกลางโต๊ะ", { mode: "ITEM", partCount: 2, items, allocations: pureAlloc(ALLOC_15B.map(([k, pn, q]) => (k === "yum" ? [k, null, q] : [k, pn, q]))), serviceChargeBp: 1000 }, "VALIDATION"],
        ["ใบเลข 3 บนแผน 2 ใบ", { mode: "ITEM", partCount: 2, items, allocations: pureAlloc(ALLOC_15B.map(([k, pn, q]) => (k === "brownie" ? [k, 3, q] : [k, pn, q]))), serviceChargeBp: 1000 }, "VALIDATION"],
        ["201 รายการ", { mode: "EQUAL", partCount: 2, items: Array.from({ length: 201 }, (_, k) => ({ id: `x${k}`, qty: 1, unitSatang: 100 })), serviceChargeBp: 0 }, "TOO_MANY_LINES"],
      ];
      for (const [lbl, inp, want] of rej) {
        const g = alloc(inp);
        if (!refused(g, want)) p.push(`${lbl} → ${codeOf(g)} (คาด ${want})`);
      }
      for (const [n, v] of [["TABLE_SPLIT_MIN_PARTS", 2], ["TABLE_SPLIT_MAX_PARTS", 20]] as const) if (sharedMod[n] !== v) p.push(`${n} = ${short(sharedMod[n])} (คาด ${v})`);
      if (setStr(Array.isArray(sharedMod.TABLE_SPLIT_MODES) ? sharedMod.TABLE_SPLIT_MODES : []) !== setStr(["ITEM", "EQUAL", "SEAT"])) p.push(`TABLE_SPLIT_MODES ${short(sharedMod.TABLE_SPLIT_MODES)}`);
    }
    chk("M6", p.length === 0, "ตัวเลขภาพ 15B/15C/EQUAL ตรง · 500 แผนตรงตัวอ้างอิง · ปฏิเสธ 8 แบบ", P8(p) || "ครบ (4 ตัวอย่าง + 500 แผน + 8 ปฏิเสธ)");
  }
  // B3 ตัวเรนเดอร์ใบรายการ
  {
    const p: string[] = [];
    if (!renderMod) p.push(`${MISSING} pre-bill-render.ts (หรือไม่บริสุทธิ์)`);
    else {
      const payload = (o: Any = {}): Any => ({
        kind: "PRE_BILL", shop: { name: "บ้านกาแฟสวนผึ้ง", branch: "สาขาหัวหิน" }, tableName: "A5", guestCount: 4, openedAt: "2026-10-14T05:02:00.000Z", printedAt: "2026-10-14T06:30:00.000Z",
        staffName: "น้ำฝน", part: null, member: null,
        lines: [{ qty: 1, name: "ต้มยำกุ้ง", options: [], amountSatang: 18000 }, { qty: 2, name: "กะเพราไก่ไข่ดาว", options: ["ไข่ดาว"], amountSatang: 19800 }],
        subtotalSatang: 124000, discountSatang: 0, serviceCharge: { rateBp: 1000, satang: 12400 }, vatIncludedSatang: 8923, totalSatang: 136400, itemsHash: "h", notReceipt: true, copy: false, locale: "th", ...o,
      });
      const html = (pl: Any, locale: string) => callSync(renderMod, "renderPreBillHtml", pl, { paper: "80", locale });
      const esc = (pl: Any, locale: string) => callSync(renderMod, "renderPreBillEscPos", pl, { paper: "80", thaiText: "raster", locale });
      const h1 = html(payload(), "th");
      const h2 = html(payload(), "th");
      if (typeof h1 !== "string") p.push(`renderPreBillHtml → ${short(h1, 80)}`);
      else {
        if (h1 !== h2) p.push("HTML สองครั้งไม่เท่ากัน");
        if (!h1.includes(PREBILL_TITLE_TH)) p.push(`HTML th ไม่มีหัว "${PREBILL_TITLE_TH}"`);
        if (!h1.includes(PREBILL_FOOTER_TH)) p.push(`HTML th ไม่มีท้าย "${PREBILL_FOOTER_TH}"`);
        if (!h1.includes("1,364.00") || !h1.includes("124.00")) p.push("HTML ไม่มียอด 1,364.00 / ค่าบริการ 124.00 ตาม payload");
        if (h1.includes("สำเนา")) p.push("ต้นฉบับมีคำว่า สำเนา");
        if (/ใบกำกับภาษีเต็มรูป|เลขที่ใบเสร็จ|TAX INVOICE \(ABB\)/.test(h1)) p.push("HTML มีคำของเอกสารภาษี/เลขที่ใบเสร็จ");
        const hc = html(payload({ copy: true }), "th");
        if (typeof hc !== "string" || !hc.includes("สำเนา")) p.push("copy:true ไม่มีคำว่า สำเนา");
        const he = html(payload({ locale: "en" }), "en");
        if (typeof he !== "string" || !he.includes(PREBILL_TITLE_EN)) p.push(`HTML en ไม่มี "${PREBILL_TITLE_EN}"`);
        const hec = html(payload({ locale: "en", copy: true }), "en");
        if (typeof hec !== "string" || !/\bCOPY\b/.test(hec)) p.push("en copy ไม่มี COPY");
        const hp = html(payload({ part: { no: 1, of: 2 } }), "th");
        if (typeof hp !== "string" || !/บิล\s*1\s*จาก\s*2/.test(hp)) p.push('ใบรายการของใบ ไม่มี "บิล 1 จาก 2"');
      }
      const e1 = esc(payload(), "th");
      const e2 = esc(payload(), "th");
      const bytes = (e: Any) => (e?.bytes instanceof Uint8Array ? Buffer.from(e.bytes).toString("hex") : "");
      if (!bytes(e1)) p.push(`renderPreBillEscPos → ${short(e1, 80)}`);
      else if (bytes(e1) !== bytes(e2) || short(e1.rasterSlots, 100000) !== short(e2.rasterSlots, 100000)) p.push("ESC/POS สองครั้งไม่เท่ากัน");
      const L = renderMod.PRE_BILL_LABELS;
      if (L?.th?.title !== PREBILL_TITLE_TH || L?.th?.footer !== PREBILL_FOOTER_TH || L?.th?.copy !== "สำเนา" || !String(L?.en?.title ?? "").includes(PREBILL_TITLE_EN) || L?.en?.copy !== "COPY") p.push(`PRE_BILL_LABELS ${short(L, 160)}`);
    }
    chk("B3", p.length === 0, "เรนเดอร์ซ้ำได้ผลเดิม · ป้าย th/en · สำเนา · ยอดตาม payload", P8(p) || "ครบ");
  }
}

// ═════════════════════════ 1c. --no-db ═════════════════════════
const loadShared = async () => (existsSync(join(ROOT, F.splitShared)) && purePath(F.splitShared) ? await tryImport("@/lib/modules/pos/table-split-shared") : null);
const loadRender = async () => (existsSync(join(ROOT, F.preBill)) && purePath(F.preBill) ? await tryImport("@/lib/modules/pos/pre-bill-render") : null);
if (NODB) {
  const ids = [...STATIC_IDS, ...PURE_IDS];
  console.log(`[${SUITE}] --no-db: รัน ${ids.length} ข้อ (สถิต + บริสุทธิ์ · ไม่โหลด prisma)`);
  let crashedS = "";
  try {
    await runStatic();
    await runPure(await loadShared(), await loadRender());
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
const SPL: Any = typeof P.posTableSplit?.findMany === "function" ? P.posTableSplit : null;
const SPP: Any = typeof P.posTableSplitPart?.findMany === "function" ? P.posTableSplitPart : null;
const SPLN: Any = typeof P.posTableSplitLine?.findMany === "function" ? P.posTableSplitLine : null;
if (!SPL || !SPP || !SPLN) skipReasons.push("Prisma client ยังไม่มี delegate posTableSplit/posTableSplitPart/posTableSplitLine");
const dbTables = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ('PosTableSplit','PosTableSplitPart','PosTableSplitLine')`)) as Any[];
  for (const r of rows) dbTables.add(String(r.table_name));
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const COL = { split: dbTables.size === 3 };
if (!COL.split) skipReasons.push(`ฐาน QC4 ยังไม่มีตาราง PosTableSplit* (${dbTables.size}/3)`);

const FP_TABLES: [string, string][] = [["RestaurantTable", "updatedAt"], ["TableSession", "updatedAt"], ["RestaurantOrderItem", "updatedAt"], ["PosHeldCart", "version"]];
/** ลายนิ้วมือของร้านที่ไม่ใช่ร้านชั่วคราวของข้อสอบนี้ (ข้อมูล — lane อื่นเขียนพร้อมกันได้) */
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h
         FROM "${tb}" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE 'posqc-p25-%'))`,
      )) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      out[tb] = `err:${(e as Error).message.slice(0, 40)}`;
    }
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.5 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
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
const renderMod = await loadRender();
const tableMod = await tryImport("@/lib/modules/pos/table");
const splitMod = ex(F.split) ? await tryImport("@/lib/modules/pos/table-split") : null;
const catalog = await tryImport("@/lib/modules/pos/catalog");
const register = await tryImport("@/lib/modules/pos/register");
const heldMod = await tryImport("@/lib/modules/pos/held-cart");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const paySetMod = await tryImport("@/lib/modules/pos/payment-settings");
const kdsMod = await tryImport("@/lib/modules/pos/kds");
const invSvc = await tryImport("@/lib/modules/inventory/service");
const menu = await tryImport("@/lib/modules/restaurant/menu");
const rtable = await tryImport("@/lib/modules/restaurant/table");
const rorder = await tryImport("@/lib/modules/restaurant/order");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const memMod = await tryImport("@/lib/modules/member");
const tierMod = await tryImport("@/lib/modules/member/tiers");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p2.5-${RAND}`;
const T_SLUG = `posqc-p25-${RAND}`;
const T2_SLUG = `posqc-p25-${RAND}-t2`;
const EMAIL_PREFIX = `${T_SLUG}-`;
const KEY_PREFIX = `qc25-${RAND}`;
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
  console.log("   สาขา A (RESTAURANT · POS + คลัง + สมาชิก + บัญชี VAT 7% · ค่าบริการ POS 10%) · สาขา B (POS · ไม่มีโต๊ะ) · ร้าน T2 สาขา X (โต๊ะ X1 + session)");
  let fx = "";
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean> }> = {};
  const TB: Record<string, string> = {}; // ชื่อโต๊ะ → id
  const MI: Record<string, string> = {}; // เมนู → MenuItem.id
  const PP: Record<string, string> = {}; // ชื่อเล่น → PosProduct.id
  const ST: Record<string, string> = {}; // สถานี
  const INV: Record<string, string> = {};
  let ZONE = "";
  let MEMBER = "";
  const MEMBER_NAME = `คุณวิภา คิวซี ${RAND}`;
  let SX = ""; // session ของโต๊ะร้าน T2
  try {
    T = (await P.tenant.create({ data: { name: `QC P2.5 แยกบิล ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P2.5 ร้านที่สอง ${RAND}`, slug: T2_SLUG } })).id;
    U.A = (await P.businessUnit.create({ data: { tenantId: T, type: "RESTAURANT", name: `${TAG} สาขาA`, slug: `${T_SLUG}-a` } })).id;
    U.B = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขาB`, slug: `${T_SLUG}-b` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "RESTAURANT", name: `${TAG} สาขาX`, slug: `${T2_SLUG}-x` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
    S.INV = (await sysSvc.createSystem(T, "INVENTORY", `คลัง ${RAND}`)).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี ${RAND}`)).id;
    S.MEM = (await sysSvc.createSystem(T, "MEMBER", `สมาชิก ${RAND}`)).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: `บ้านกาแฟสวนผึ้งคิวซี ${RAND} จำกัด`, taxId: "0105561177639", vatRegistered: true });
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
  // ผู้ใช้ + Membership จริง (CD10: ไม่มีคีย์ใหม่)
  const spec: [string, string, string[], Record<string, boolean>][] = [
    ["OWNER", "OWNER", ["*"], {}],
    ["MGR", "MANAGER", [U.A ?? "-"], {}],
    ["CASHIER", "STAFF", [U.A ?? "-"], { "pos.sale.create": true }],
    ["WAITER", "STAFF", [U.A ?? "-"], { "pos.sale.read": true, "restaurant.session.move": true, "restaurant.session.merge": true }],
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
  const DEV1 = `qc25${RAND}d1`;
  const DEV2 = `qc25${RAND}d2`;
  const ctxA = (dev?: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", unitId: U.A ?? "none", ...(dev ? { deviceId: dev } : {}) });
  const ctxB = (): Any => ({ tenantId: T, systemId: S.POS ?? "none", unitId: U.B ?? "none" });
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? r?.reason ?? "", 80)}`);
    return r;
  };

  // ─── เมนูของภาพ 03/15 · ข้าว (PRODUCT นับสต็อก) · วุ้นเส้น (วัตถุดิบในสูตรยำ) · ค่าบริการ ───
  if (!fx) {
    try {
      await menu.ensureDefaultStations(T, U.A);
      const sts = (await menu.listStations(T, U.A)) as Any[];
      ST.hot = String(sts.find((s) => s.name !== "เครื่องดื่ม")?.id ?? sts[0]?.id ?? "");
      ST.drink = String(sts.find((s) => s.name === "เครื่องดื่ม")?.id ?? ST.hot);
      const cat = must("createCategory", await menu.createCategory(T, U.A, { name: `อาหาร ${RAND}` }, uid("OWNER")));
      const mk = async (key: string, name: string, basePrice: number, stationId: string, o: Any = {}) => {
        const r = must(`createItem ${key}`, await menu.createItem(T, U.A, { categoryId: cat.id, stationId, name, basePrice, ...o }, uid("OWNER")));
        MI[key] = r.id;
        PP[key] = String((await P.menuItem.findUnique({ where: { id: r.id }, select: { posProductId: true } }))?.posProductId ?? "");
        if (!PP[key]) throw new Error(`เมนู ${key} ไม่มี posProductId`);
      };
      await mk("tomyum", `ต้มยำกุ้ง ${RAND}`, 18000, ST.hot!);
      await mk("kaprao", `กะเพราไก่ไข่ดาว ${RAND}`, 9900, ST.hot!);
      await mk("squid", `ปลาหมึกผัดไข่เค็ม ${RAND}`, 23000, ST.hot!);
      await mk("yum", `ยำวุ้นเส้น ${RAND}`, 15000, ST.hot!);
      await mk("chayen", `ชาไทยเย็น ${RAND}`, 6900, ST.drink!);
      await mk("latte", `ลาเต้เย็น ${RAND}`, 7500, ST.drink!);
      await mk("brownie", `บราวนี่ ${RAND}`, 6500, ST.hot!, { stockQty: 500 });
      const ic: Any = { tenantId: T, systemId: S.INV, actorUserId: uid("OWNER") };
      for (const [k, nm, cost] of [["rice", `ข้าวสวย ${RAND}`, 500], ["noodle", `วุ้นเส้น ${RAND}`, 300]] as const) {
        const it = await invSvc.createItem(ic, { sku: `${KEY_PREFIX}-${k}`, name: nm, unitLabel: k === "rice" ? "ถ้วย" : "ห่อ", costSatang: cost });
        INV[k] = it.id;
        await invSvc.receive(ic, { itemId: it.id, qty: 300, costSatang: cost, idempotencyKey: `${KEY_PREFIX}-recv-${k}` });
      }
      PP.rice = String((await P.posProduct.findFirst({ where: { tenantId: T, systemId: S.POS, invItemId: INV.rice }, select: { id: true } }))?.id ?? "");
      if (!PP.rice) throw new Error("ข้าวสวยไม่มีแถว PRODUCT (P1.1b)");
      must("setPrice rice", await call(catalog, "setPrice", cc("OWNER"), PP.rice, 1500));
      must("ค่าบริการ POS", await call(paySetMod, "updatePosPaymentSettings", { tenantId: T, systemId: S.POS }, A("OWNER"), { serviceCharge: { enabled: true, rateBp: 1000 } }));
      await menu.updateSetting(T, U.A, { serviceChargeBps: 1000 });
    } catch (e) {
      fx = `เมนู/สินค้า:${(e as Error).message.slice(0, 160)}`;
    }
    // สูตรยำ (P2.3 · MENU ตั้งสูตรได้) — ล้ม = S1/X2 แดงด้วยเหตุ fixture (ไม่หยุดทั้งชุด)
    if (!fx) {
      const rr = await call(catalog, "setRecipe", cc("OWNER"), PP.yum, [{ invItemId: INV.noodle, qty: 1 }]);
      if (rr?.ok === false) console.log(`  ⚠️  setRecipe ยำวุ้นเส้น: ${codeOf(rr)} ${short(rr?.message ?? "", 80)}`);
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
      console.log(`  ⚠️  สมาชิก: ${(e as Error).message.slice(0, 120)} (M7/T3 แดงด้วยเหตุ fixture)`);
    }
  }
  // ─── โซน · โต๊ะ (สร้างตามต้องการ) · ร้าน T2 ───
  const mkT = async (name: string): Promise<string> => {
    if (TB[name]) return TB[name]!;
    const r = must(`table ${name}`, await rtable.createTable(T, U.A, { zoneId: ZONE, name, seats: 4 }));
    TB[name] = r.id;
    return r.id;
  };
  if (!fx) {
    try {
      ZONE = must("zone", await rtable.createZone(T, U.A, `ในร้าน ${RAND}`)).id;
      await mkT("A6");
      await rtable.updateTable(T, U.A, TB.A6, { status: "INACTIVE" });
      const zx = must("zone X", await rtable.createZone(T2, U.X, `โซนร้านอื่น ${RAND}`));
      const x1 = must("table X1", await rtable.createTable(T2, U.X, { zoneId: zx.id, name: "X1", seats: 4 }));
      TB.X1 = x1.id;
      SX = String(must("session X1", await rtable.openSession(T2, U.X, TB.X1, { guestCount: 2 })).id ?? "");
    } catch (e) {
      fx = `โต๊ะ:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── เครื่อง + กะ (2 เครื่อง) ───
  if (!fx) {
    for (const [k, dev] of [["1", DEV1], ["2", DEV2]] as const) {
      const rg = await call(devMod, "registerDevice", ctxA(), A("OWNER"), { name: `เคาน์เตอร์ QC P2.5 ${k}`, deviceCode: dev });
      if (rg?.ok !== true) console.log(`  ⚠️  registerDevice ${k}: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
      const o = await call(shiftMod, "openShift", ctxA(dev), A("OWNER"), { deviceId: dev, deviceLabel: `เคาน์เตอร์ QC P2.5 ${k}`, floatSatang: 0 });
      if (o?.ok !== true) fx = `เปิดกะ ${k}: ${codeOf(o)} ${short(o?.message ?? "", 80)}`;
    }
  }
  if (fx) console.log(`  ⚠️  fixture: ${fx}`);
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NS = (fns: string[]) =>
    fns.map((n) => (typeof splitMod?.[n] === "function" || typeof tableMod?.[n] === "function" ? "" : `${MISSING} ${n} · `)).join("") + (!COL.split ? `${MISSING} ตาราง PosTableSplit* · ` : "");

  // ─── ตัวช่วย ───
  let keyN = 0;
  const newKey = (pfx = "k") => `${KEY_PREFIX}-${pfx}-${++keyN}`;
  const KEY_OF_PP = (pid: string) => Object.entries(PP).find(([, v]) => v === pid)?.[0] ?? pid.slice(-6);
  const ml = (key: string, qty: number): Any => ({ productId: PP[key] ?? `none-${key}`, qty });
  const sessRow = async (id: string): Promise<Any> => (id ? P.tableSession.findUnique({ where: { id } }).catch(() => null) : null);
  const tableRow = async (id: string): Promise<Any> => (id ? P.restaurantTable.findUnique({ where: { id } }).catch(() => null) : null);
  const itemsOf = async (sessionId: string): Promise<Any[]> =>
    sessionId ? ((await P.restaurantOrderItem.findMany({ where: { tenantId: T, order: { sessionId } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]) : [];
  const itemRow = async (id: string): Promise<Any> => (id ? P.restaurantOrderItem.findUnique({ where: { id } }).catch(() => null) : null);
  const openSessCount = async (tableId: string) => Number(await P.tableSession.count({ where: { tenantId: T, tableId, status: "OPEN" } }).catch(() => -1));
  const heldRow = async (id: string): Promise<Any> => (id ? P.posHeldCart.findUnique({ where: { id } }).catch(() => null) : null);
  const saleRow = async (id: string): Promise<Any> => (id ? P.posSale.findUnique({ where: { id }, include: { lines: true, payments: true } }).catch(() => null) : null);
  const onHand = async (k: string) => Number((await P.invItem.findUnique({ where: { id: INV[k] ?? "none" }, select: { onHand: true } }).catch(() => null))?.onHand ?? NaN);
  const outOf = async (saleId: string, k: string) =>
    sum(((await P.invMovement.findMany({ where: { tenantId: T, refId: saleId || "none", itemId: INV[k] ?? "none", type: "OUT" } }).catch(() => [])) as Any[]).map((m) => Number(m.qtyDelta)));
  const tbl = (fn: string, ...args: unknown[]) => call(tableMod, fn, ...args);
  const sp = (fn: string, ...args: unknown[]) => call(splitMod, fn, ...args);
  const hold = (sessionId: string, lines: Any[], ctx: Any = ctxA(DEV1)) => call(heldMod, "holdRegisterCart", ctx, A("OWNER"), { cart: { lines }, tableSessionId: sessionId, newDraft: true });
  const sendRound = async (sessionId: string, lines: Any[]): Promise<{ orderId: string; itemIds: string[] }> => {
    const h = await hold(sessionId, lines);
    const s = await tbl("registerSendTableRound", ctxA(DEV1), A("OWNER"), { tableSessionId: sessionId, heldCartId: String(h?.heldCart?.id ?? "") });
    if (s?.ok !== true) throw new Error(`ส่งรอบ: พัก ${codeOf(h)} · ส่ง ${codeOf(s)} ${short(s?.message ?? "", 60)}`);
    return { orderId: String(s.orderId), itemIds: ((s.itemIds ?? []) as string[]).map(String) };
  };
  const A5_LINES = (): Any[] => A5_MENU.map(([k, q]) => ml(k, q));
  type Seat = { sid: string; it: Record<string, string>; orderId: string };
  /** เปิดโต๊ะ (ทาง P2.4) + ส่งรอบเมนูภาพ 15 (8 รายการ · Σ 124000) — คืน session + รายการตามชื่อเล่น */
  const seat = async (name: string, o: { guestCount?: number; memberId?: string; lines?: Any[] } = {}): Promise<Seat> => {
    await mkT(name);
    const r = await tbl("registerOpenTable", ctxA(), A("OWNER"), { tableId: TB[name], guestCount: o.guestCount ?? 4, ...(o.memberId ? { memberId: o.memberId } : {}) });
    if (r?.ok !== true || !r.sessionId) throw new Error(`เปิดโต๊ะ ${name}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    const sid = String(r.sessionId);
    const lines = o.lines ?? A5_LINES();
    const sent = lines.length ? await sendRound(sid, lines) : { orderId: "", itemIds: [] };
    const it: Record<string, string> = {};
    for (const row of (await P.restaurantOrderItem.findMany({ where: { id: { in: sent.itemIds } } }).catch(() => [])) as Any[]) it[KEY_OF_PP(String(row.productId ?? ""))] = row.id;
    return { sid, it, orderId: sent.orderId };
  };
  const wq = (sessionId: string, extra: Any = {}, ctx: Any = ctxA(DEV2), actor = "OWNER") => call(register, "quoteRegisterCart", ctx, A(actor), { lines: [], tableSessionId: sessionId, ...extra });
  const wpay = async (sessionId: string, q: Any, o: { key?: string; ctx?: Any } = {}): Promise<{ r: Any; key: string }> => {
    const key = o.key ?? newKey("wp");
    const grand = q?.ok === true ? Number(q.grandTotalSatang) : 0;
    const r = await call(register, "submitRegisterSale", o.ctx ?? ctxA(DEV2), A("OWNER"), {
      lines: [], tableSessionId: sessionId, expectedTableItemsHash: q?.table?.itemsHash ?? "none",
      idempotencyKey: key, expectedGrandTotalSatang: grand, payMethods: [{ type: "CASH", amountSatang: grand }], cashReceivedSatang: grand,
    });
    if (r?.ok === true && r.saleId && !MY_SALES.includes(String(r.saleId))) MY_SALES.push(String(r.saleId));
    return { r, key };
  };
  const hashOf = async (sessionId: string): Promise<string> => String((await wq(sessionId))?.table?.itemsHash ?? "none");
  const alloc = (s: Seat, spec: [string, number | null, number][]): RAlloc[] => pureAlloc(spec, (k) => s.it[k] ?? `none-${k}`);
  /** สร้าง/แทนแผน — body = {mode, partCount, allocations?, billDiscount?, parts?, splitId?, expectedVersion?} · expectedItemsHash จาก quote ทั้งโต๊ะ */
  const mkSplit = async (sessionId: string, body: Any, actor = "OWNER", ctx: Any = ctxA(DEV1), hash?: string): Promise<Any> =>
    sp("registerSplitTable", ctx, A(actor), { tableSessionId: sessionId, expectedItemsHash: hash ?? (await hashOf(sessionId)), ...body });
  const splitOf = (r: Any): Any => (r?.ok === true && isRecord(r.split) ? r.split : null);
  const partOf = (split: Any, no: number): Any => ((split?.parts ?? []) as Any[]).find((x) => Number(x?.no) === no) ?? null;
  const pq = (partId: string, extra: Any = {}, ctx: Any = ctxA(DEV2), actor = "OWNER") => call(register, "quoteRegisterCart", ctx, A(actor), { lines: [], tableSplitPartId: partId || "none", ...extra });
  const ppay = async (partId: string, q: Any, o: { key?: string; ctx?: Any; actor?: string; version?: number; extra?: Any } = {}): Promise<{ r: Any; key: string }> => {
    const key = o.key ?? newKey("pp");
    const grand = q?.ok === true ? Number(q.grandTotalSatang) : 0;
    const r = await call(register, "submitRegisterSale", o.ctx ?? ctxA(DEV2), A(o.actor ?? "OWNER"), {
      lines: [], tableSplitPartId: partId || "none", expectedSplitVersion: o.version ?? Number(q?.split?.version ?? 1),
      idempotencyKey: key, expectedGrandTotalSatang: grand, payMethods: [{ type: "CASH", amountSatang: grand }], cashReceivedSatang: grand, ...(o.extra ?? {}),
    });
    if (r?.ok === true && r.saleId && !MY_SALES.includes(String(r.saleId))) MY_SALES.push(String(r.saleId));
    return { r, key };
  };
  /** จ่ายใบตามเลข (quote แล้ว submit) — คืน saleId หรือ "" */
  const payPart = async (split: Any, no: number, ctx: Any = ctxA(DEV2), extra: Any = {}): Promise<{ saleId: string; q: Any; r: Any; key: string }> => {
    const pid = String(partOf(split, no)?.id ?? "");
    const q = await pq(pid, {}, ctx);
    const { r, key } = await ppay(pid, q, { ctx, extra });
    return { saleId: r?.ok === true ? String(r.saleId) : "", q, r, key };
  };
  const planRow = async (splitId: string): Promise<Any> => (SPL && splitId ? SPL.findUnique({ where: { id: splitId } }).catch(() => null) : null);
  const partRows = async (splitId: string): Promise<Any[]> => (SPP && splitId ? ((await SPP.findMany({ where: { splitId }, orderBy: { no: "asc" } }).catch(() => [])) as Any[]) : []);
  const openPlans = async (sessionId: string) => (SPL ? Number(await SPL.count({ where: { tenantId: T, sessionId, status: "OPEN" } }).catch(() => -1)) : -1);
  const planCount = async () => (SPL ? Number(await SPL.count({ where: { tenantId: { in: [T, T2] } } }).catch(() => -1)) : -1);
  /** สแนปช็อตของโต๊ะ + แผน (เทียบ "ไม่เปลี่ยน") */
  const snap = async (sessionId: string, splitId = ""): Promise<string> => {
    const its = (await itemsOf(sessionId)).map((x) => [x.id.slice(-6), x.saleId ?? "-", x.settledAt ? 1 : 0, x.kdsStatus]);
    const s = await sessRow(sessionId);
    const t = await tableRow(String(s?.tableId ?? ""));
    const pl = await planRow(splitId);
    const pr = (await partRows(splitId)).map((x) => [x.no, x.status, x.saleId ?? "-"]);
    return short({ its, s: [s?.status, s?.tableId], dirty: t?.dirtySince ? 1 : 0, pl: pl ? [pl.status, pl.version] : null, pr }, 100000);
  };
  const counts = async () => ({
    sale: Number(await P.posSale.count({ where: { tenantId: T } }).catch(() => -1)),
    pay: Number(await P.posPayment.count({ where: { tenantId: T } }).catch(() => -1)),
    seq: sum(((await P.posReceiptCounter.findMany({ where: { tenantId: T, unitId: U.A } }).catch(() => [])) as Any[]).map((r) => r.seq)),
    je: Number(await P.accountJournalEntry.count({ where: { tenantId: T } }).catch(() => -1)),
    ob: Number(await P.outboxEvent.count({ where: { tenantId: T } }).catch(() => -1)),
  });
  const voidSale = async (saleId: string, ctx: Any = ctxA(DEV2)) => {
    const v = await call(billsMod, "voidSaleByActor", ctx, A("OWNER"), { unitId: U.A, saleId: saleId || "none", idempotencyKey: newKey("void"), reason: "ลูกค้ายกเลิก" });
    await drain();
    return v;
  };
  const replayVoided = async (saleId: string): Promise<string[]> => {
    const out: string[] = [];
    const h = consMod?.consumers?.["pos.sale.voided"];
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "pos.sale.voided" } }).catch(() => [])) as Any[]).filter((e) => isRecord(e.payload) && e.payload.saleId === saleId && !!saleId);
    if (!evs.length) out.push(`ไม่พบ event voided ของ ${saleId.slice(-6) || "-"}`);
    else if (typeof h !== "function") out.push("ไม่มี consumers[pos.sale.voided]");
    else
      for (const ev of evs)
        for (let i = 0; i < 2; i++)
          try {
            await h(ev);
          } catch (e) {
            out.push(`replay ×${i + 1} throw ${(e as Error).message.slice(0, 60)}`);
          }
    return out;
  };
  const jvBalanced = async (saleId: string): Promise<string> => {
    const sale = await saleRow(saleId);
    const es = saleId ? ((await P.accountJournalEntry.findMany({ where: { tenantId: T, refType: "PosSale", refId: saleId, reversalOfId: null }, include: { lines: { include: { account: { select: { code: true } } } } } }).catch(() => [])) as Any[]) : [];
    const ls = es.flatMap((e) => e.lines ?? []) as Any[];
    const amt = (code: string, side: "debit" | "credit") => sum(ls.filter((l) => l.account?.code === code).map((l) => Number(l[side])));
    const dr = sum(ls.map((l) => Number(l.debit)));
    const cr = sum(ls.map((l) => Number(l.credit)));
    if (!sale) return "ไม่มีบิล";
    if (!es.length || amt("1000", "debit") !== sale.grandTotalSatang || amt("2200", "credit") !== sale.vatSatang || dr !== cr || cr !== sale.grandTotalSatang || !(amt("4000", "credit") > 0))
      return `JV ${es.length} · Dr1000 ${amt("1000", "debit")}/${sale.grandTotalSatang} · Cr2200 ${amt("2200", "credit")}/${sale.vatSatang} · Σ ${dr}/${cr}`;
    return "";
  };
  /**
   * ธุรกรรมที่สามถือล็อก (sql) → เริ่มงานทีละตัวตามลำดับ: เริ่ม → รอจนมี backend ถูก pid นี้กั้น ≥ 1 แล้วรออีก gapMs (ให้ตัวนั้นเข้าคิวจริง) → ตัวถัดไป ·
   * ครบแล้วปล่อย (แบบ qc-hf-tx HT2.8 · ลำดับเข้าคิว = ลำดับ starters ⇒ ผลแน่นอน ไม่พึ่งจังหวะ) · blocked = จำนวนสูงสุดที่เห็นถูกกั้นตรงโดยผู้ถือ
   */
  const holdLock = async (sql: string, args: unknown[], starters: (() => Promise<Any>)[], gapMs = 1000): Promise<{ blocked: number; heldMs: number; res: Any[] }> => {
    let blocked = 0;
    let heldMs = 0;
    const box: { ps: Promise<Any>[] } = { ps: [] };
    await P.$transaction(
      async (tx: Any) => {
        await tx.$queryRawUnsafe(sql, ...args);
        const pid = Number(((await tx.$queryRawUnsafe(`SELECT pg_backend_pid()::int AS p`)) as Any[])[0].p);
        const t0 = Date.now();
        for (const f of starters) {
          box.ps.push(f().catch((e: unknown) => ({ ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 120), threw: true })));
          const t1 = Date.now();
          let seenAt = 0;
          while (Date.now() - t1 < 8_000) {
            const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))`, pid)) as Any[])[0].n);
            if (n > blocked) blocked = n;
            if (n > 0 && !seenAt) seenAt = Date.now();
            if (seenAt && Date.now() - seenAt >= gapMs) break;
            await sleep(150);
          }
        }
        heldMs = Date.now() - t0;
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
    return { blocked, heldMs, res: await Promise.all(box.ps) };
  };
  const lowestItem = (s: Seat) => Object.values(s.it).sort(byId)[0] ?? "none";
  const LOCK_ITEM = `SELECT id FROM "RestaurantOrderItem" WHERE id = $1 FOR UPDATE`;
  const LOCK_SESSION = `SELECT id FROM "TableSession" WHERE id = $1 FOR UPDATE`;
  const LOCK_TABLE_SQL = `SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext($1::text))) l`;

  // ════════ L3 PAR (ก่อนอย่างอื่น — ประตูเดิมล้วน) ════════
  console.log("\n── L ของเดิม (ต้องเขียวทั้งก่อนและหลังสร้าง) ──");
  await step("L3", async () => {
    const p: string[] = [];
    for (const n of ["L1", "L2", "L3", "L4", "L5"]) await mkT(n);
    const os = async (n: string, g: number) => String((await rtable.openSession(T, U.A, TB[n], { guestCount: g, openedByUserId: uid("OWNER") }))?.id ?? "");
    const s1 = await os("L1", 2);
    const s2 = await os("L2", 2);
    const s3 = await os("L3", 2);
    const s4 = await os("L4", 3);
    if (!s1 || !s2 || !s3 || !s4) throw new Error("openSession เดิมไม่ได้");
    const mv = await rtable.moveSession(T, U.A, s1, TB.L5);
    if (JSON.stringify(mv) !== JSON.stringify({ ok: true })) p.push(`moveSession ${short(mv, 80)}`);
    const r1 = await sessRow(s1);
    const t1 = await tableRow(TB.L1!);
    if (r1?.tableId !== TB.L5 || r1?.status !== "OPEN" || (t1 && t1.dirtySince !== null)) p.push(`หลังย้าย tableId ${r1?.tableId === TB.L5 ? "L5" : r1?.tableId} · L1 dirtySince ${short(t1?.dirtySince, 30)} (ประตูเดิมไม่ตั้ง)`);
    const busy = await rtable.moveSession(T, U.A, s1, TB.L2);
    if (JSON.stringify(busy) !== JSON.stringify({ ok: false, reason: "โต๊ะปลายทางไม่ว่าง — ใช้ 'รวมโต๊ะ' แทน" })) p.push(`ย้ายไปโต๊ะไม่ว่าง ${short(busy, 80)}`);
    const mg = await rtable.mergeSession(T, U.A, s3, s4);
    if (JSON.stringify(mg) !== JSON.stringify({ ok: true })) p.push(`mergeSession ${short(mg, 80)}`);
    const r3 = await sessRow(s3);
    const r4 = await sessRow(s4);
    const t4 = await tableRow(TB.L4!);
    if (r3?.guestCount !== 2 || r4?.status !== "MERGED" || r4?.mergedIntoId !== s3 || (t4 && t4.dirtySince !== null)) p.push(`หลังรวม into guest ${r3?.guestCount} (คาด 2 ไม่รวม) · from ${r4?.status} · L4 dirty ${short(t4?.dirtySince, 30)}`);
    const same = await rtable.mergeSession(T, U.A, s3, s3);
    if (JSON.stringify(same) !== JSON.stringify({ ok: false, reason: "เลือกคนละโต๊ะ" })) p.push(`รวมโต๊ะเดียวกัน ${short(same, 80)}`);
    const again = await rtable.mergeSession(T, U.A, s3, s4);
    if (JSON.stringify(again) !== JSON.stringify({ ok: false, reason: "โต๊ะต้นทางไม่พร้อม" })) p.push(`รวมซ้ำ (ต้นทาง MERGED) ${short(again, 80)}`);
    chk("L3", p.length === 0, "moveSession/mergeSession ประตูเดิมผลเดิมทุกไบต์", FX(P8(p) || "ครบ (เหมือนฐาน)"));
  });

  // ─── โต๊ะหลัก A5 (ภาพ 15B) ───
  const nameOfItem = (s: Seat) => (id: string) => Object.entries(s.it).find(([, v]) => v === id)?.[0] ?? id.slice(-6);
  const itemsOfSeat = (s: Seat): RItem[] => A5_MENU.map(([k, q, u]) => ({ id: s.it[k] ?? `none-${k}`, qty: q, unitSatang: u }));
  let S15: Seat = { sid: "", it: {}, orderId: "" };
  try {
    S15 = await seat("A5", { guestCount: 4 });
  } catch (e) {
    console.log(`  ⚠️  fixture A5: ${(e as Error).message.slice(0, 120)}`);
  }
  const Q15 = await wq(S15.sid);
  const fx15 = Q15?.ok === true && Q15.grandTotalSatang === 136400 && Q15.subtotalSatang === 124000 ? "" : `(fixture) quote A5 ${codeOf(Q15)} ${short({ g: Q15?.grandTotalSatang, s: Q15?.subtotalSatang }, 60)} (คาด 136400/124000) · `;

  // ════════ P5 ขอบเขต/เพดาน (ก่อนมีแผน) ════════
  console.log("\n── P5 ขอบเขต · M เงินแยกบิล ──");
  await step("P5", async () => {
    const p: string[] = [];
    const n0 = await planCount();
    const h = await hashOf(S15.sid);
    const other = await seat("B9", { lines: [ml("rice", 1)] });
    const cases: [string, () => Promise<Any>, string][] = [
      ["partCount 1", () => mkSplit(S15.sid, { mode: "EQUAL", partCount: 1 }), "VALIDATION"],
      ["partCount 21", () => mkSplit(S15.sid, { mode: "EQUAL", partCount: 21 }), "VALIDATION"],
      ["ใบว่าง (ITEM 3 ใบ)", () => mkSplit(S15.sid, { mode: "ITEM", partCount: 3, allocations: alloc(S15, ALLOC_15B) }), "VALIDATION"],
      ["ยังไม่ระบุบราวนี่", () => mkSplit(S15.sid, { mode: "ITEM", partCount: 2, allocations: alloc(S15, ALLOC_15B.filter(([k]) => k !== "brownie")) }), "VALIDATION"],
      ["ข้าวเกิน (3+2)", () => mkSplit(S15.sid, { mode: "ITEM", partCount: 2, allocations: alloc(S15, ALLOC_15B.map(([k, pn, q]) => (k === "rice" && pn === 2 ? [k, pn, 2] : [k, pn, q]))) }), "VALIDATION"],
      ["รายการของโต๊ะอื่น", () => mkSplit(S15.sid, { mode: "ITEM", partCount: 2, allocations: [...alloc(S15, ALLOC_15B), { itemId: other.it.rice ?? "none", partNo: 1, qty: 1 }] }), "VALIDATION"],
      ["expectedItemsHash เก่า", () => mkSplit(S15.sid, { mode: "EQUAL", partCount: 2 }, "OWNER", ctxA(DEV1), `${h}x`), "TABLE_ITEMS_CHANGED"],
      ["session ร้าน T2", () => mkSplit(SX, { mode: "EQUAL", partCount: 2 }, "OWNER", ctxA(DEV1), h), "TABLE_NOT_FOUND"],
      ["ctx สาขา B", () => mkSplit(S15.sid, { mode: "EQUAL", partCount: 2 }, "OWNER", ctxB(), h), "TABLE_NOT_FOUND"],
      ["NOPERM", () => mkSplit(S15.sid, { mode: "EQUAL", partCount: 2 }, "NOPERM", ctxA(DEV1), h), "PERMISSION_DENIED"],
      ["WAITER (pos.sale.read)", () => mkSplit(S15.sid, { mode: "EQUAL", partCount: 2 }, "WAITER", ctxA(DEV1), h), "PERMISSION_DENIED"],
      ["quote ใบมั่ว", () => pq(`nope${RAND}`), "TABLE_SPLIT_NOT_FOUND"],
      ["ยกเลิกแผนมั่ว", () => sp("registerCancelSplit", ctxA(DEV1), A("OWNER"), { splitId: `nope${RAND}`, expectedVersion: 1 }), "TABLE_SPLIT_NOT_FOUND"],
    ];
    for (const [lbl, f, want] of cases) {
      const r = await f();
      if (!refused(r, want)) p.push(`${lbl} → ${codeOf(r)} (คาด ${want})`);
    }
    const det = await sp("registerSplitDetail", ctxA(), A("WAITER"), { tableSessionId: S15.sid });
    if (det?.ok !== true || det.split !== null || !Array.isArray(det.outsideItemIds)) p.push(`WAITER registerSplitDetail (ยังไม่มีแผน) → ${codeOf(det)} ${short({ split: det?.split, out: det?.outsideItemIds }, 60)} (คาด ok · split null)`);
    const n1 = await planCount();
    if (n1 !== n0) p.push(`แถวแผน ${n0} → ${n1} (คำขอที่ถูกปฏิเสธเขียนแถว)`);
    chk("P5", NS([...SPLIT_FNS]) === "" && p.length === 0, "ปฏิเสธ 13 แบบ ไม่เขียน · WAITER อ่านได้", FX(NS([...SPLIT_FNS]) + fx15 + (P8(p) || "ครบ")));
  });

  // ════════ B1 ใบรายการทั้งโต๊ะ (ก่อนมีแผน) ════════
  await step("B1", async () => {
    const p: string[] = [];
    await drain();
    const c0 = await counts();
    const s0 = await snap(S15.sid);
    const rq0 = Number(await P.restaurantServiceRequest.count({ where: { tenantId: T, sessionId: S15.sid } }).catch(() => -1));
    const auditN = async () => Number(await P.auditLog.count({ where: { tenantId: T, action: AUDIT_PREBILL } }).catch(() => -1));
    const a0 = await auditN();
    const r = await tbl("registerTablePreBill", ctxA(DEV1), A("CASHIER"), { tableSessionId: S15.sid, locale: "th" });
    const pl = r?.ok === true ? r.payload : null;
    if (!pl) p.push(`registerTablePreBill → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      const head = [pl.kind, pl.notReceipt, pl.tableName, pl.guestCount, pl.subtotalSatang, pl.serviceCharge?.rateBp, pl.serviceCharge?.satang, pl.vatIncludedSatang, pl.totalSatang, pl.itemsHash === Q15?.table?.itemsHash, pl.copy];
      const want = ["PRE_BILL", true, "A5", 4, Q15?.subtotalSatang, 1000, Q15?.serviceChargeSatang, Q15?.vatSatang, Q15?.grandTotalSatang, true, false];
      if (short(head) !== short(want)) p.push(`payload [kind notReceipt table guests subtotal rateBp sc vat total hash copy] ${short(head, 160)} (คาด ${short(want, 160)})`);
      const ls = (Array.isArray(pl.lines) ? pl.lines : []) as Any[];
      if (ls.length !== 8 || sum(ls.map((l) => Number(l.amountSatang))) !== 124000) p.push(`lines ${ls.length} Σ ${sum(ls.map((l) => Number(l.amountSatang)))} (คาด 8 · 124000)`);
      const keysDeep = (o: unknown): string[] => (Array.isArray(o) ? o.flatMap(keysDeep) : isRecord(o) ? Object.entries(o).flatMap(([k, v]) => [k, ...keysDeep(v)]) : []);
      const bad = keysDeep(pl).filter((k) => PREBILL_FORBIDDEN.includes(k));
      if (bad.length) p.push(`payload มีคีย์เอกสาร ${[...new Set(bad)].join(",")}`);
      if (!pl.printedAt || !pl.shop?.name) p.push(`printedAt/shop ${short({ at: pl.printedAt, shop: pl.shop }, 80)}`);
    }
    const r2 = await tbl("registerTablePreBill", ctxA(DEV1), A("OWNER"), { tableSessionId: S15.sid, locale: "en" });
    if (r2?.ok !== true) p.push(`ครั้งที่ 2 (en) → ${codeOf(r2)}`);
    await drain();
    const a1 = await auditN();
    if (a1 - a0 !== 2) p.push(`AuditLog ${AUDIT_PREBILL} +${a1 - a0} (คาด +2)`);
    const au = (await P.auditLog.findFirst({ where: { tenantId: T, action: AUDIT_PREBILL }, orderBy: { createdAt: "asc" } }).catch(() => null)) as Any;
    if (au && (au.after?.sessionId !== S15.sid || au.after?.totalSatang !== 136400 || !au.after?.itemsHash)) p.push(`audit.after ${short(au.after, 120)} (คาด {sessionId, totalSatang 136400, itemsHash})`);
    const c1 = await counts();
    if (c1.seq !== c0.seq || c1.je !== c0.je || c1.ob !== c0.ob || c1.sale !== c0.sale) p.push(`เลขใบเสร็จ ${c0.seq}→${c1.seq} · JV ${c0.je}→${c1.je} · outbox ${c0.ob}→${c1.ob} · บิล ${c0.sale}→${c1.sale}`);
    if ((await snap(S15.sid)) !== s0) p.push("session/โต๊ะ/รายการเปลี่ยน");
    const rq1 = Number(await P.restaurantServiceRequest.count({ where: { tenantId: T, sessionId: S15.sid } }).catch(() => -1));
    if (rq1 !== rq0) p.push(`คำขอจากโต๊ะ ${rq0}→${rq1} (ใบรายการต้องไม่ตั้ง "ขอเช็คบิล")`);
    chk("B1", NS(["registerTablePreBill"]) === "" && p.length === 0, "ยอด = quote · ไม่ใช่เอกสาร · ไม่เปลี่ยนสถานะ · audit ต่อครั้ง", FX(NS(["registerTablePreBill"]) + fx15 + (P8(p) || "ครบ")));
  });

  const PAID: Record<string, string> = {};
  // ผู้ซื้อใบกำกับเต็มรูป (เลข mod-11 ถูก · S3 ออกบนใบ 2 ของโต๊ะ A4)
  const rnd9 = () => String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const withCheck = (d12: string): string => {
    let s = 0;
    for (let i = 0; i < 12; i++) s += Number(d12[i]) * (13 - i);
    return `${d12}${(11 - (s % 11)) % 10}`;
  };
  const BUYER = { kind: "JURISTIC", name: `บริษัท ผู้ซื้อแยกบิล ${RAND} จำกัด`, taxId: withCheck(`010${rnd9()}`), branchCode: "00000", address: "88/8 ถ.เพชรเกษม ต.หัวหิน อ.หัวหิน จ.ประจวบคีรีขันธ์ 77110", email: null };
  // ════════ M1 15B ════════
  let PLAN15: Any = null;
  await step("M1", async () => {
    const p: string[] = [];
    const r = await mkSplit(S15.sid, { mode: "ITEM", partCount: 2, allocations: alloc(S15, ALLOC_15B) });
    PLAN15 = splitOf(r);
    const ref = refAlloc({ mode: "ITEM", partCount: 2, items: itemsOfSeat(S15), allocations: alloc(S15, ALLOC_15B), serviceChargeBp: 1000, vatRateBp: 700 });
    if (!PLAN15) p.push(`registerSplitTable → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    else {
      p.push(...diffPlan(PLAN15, ref, nameOfItem(S15)));
      const tt = ((PLAN15.parts ?? []) as Any[]).map((x) => x.totalSatang);
      if (short(tt) !== short(WANT_15B)) p.push(`สุทธิต่อใบ ${short(tt)} (คาด ${short(WANT_15B)})`);
      const head = [PLAN15.mode, PLAN15.status, PLAN15.partCount, PLAN15.version, PLAN15.itemsHash === Q15?.table?.itemsHash, PLAN15.serviceChargeBp];
      if (short(head) !== short(["ITEM", "OPEN", 2, 1, true, 1000])) p.push(`แผน [mode status parts version hash bp] ${short(head)}`);
      const row = await planRow(String(PLAN15.splitId ?? ""));
      const parts = await partRows(String(PLAN15.splitId ?? ""));
      const lines = SPLN ? ((await SPLN.findMany({ where: { splitId: String(PLAN15.splitId ?? "none") } }).catch(() => [])) as Any[]) : [];
      if (!row || row.sessionId !== S15.sid || row.status !== "OPEN" || row.version !== 1 || row.totalSatang !== 136400 || row.serviceChargeSatang !== 12400 || row.unitId !== U.A || row.systemId !== S.POS) p.push(`แถว PosTableSplit ${short(row && { st: row.status, v: row.version, t: row.totalSatang, sc: row.serviceChargeSatang }, 100)}`);
      if (short(parts.map((x) => [x.no, x.totalSatang, x.status, x.saleId])) !== short([[1, 74250, "OPEN", null], [2, 62150, "OPEN", null]])) p.push(`แถว PosTableSplitPart ${short(parts.map((x) => [x.no, x.totalSatang, x.status]), 100)}`);
      if (ref.ok && lines.length !== sum(ref.parts.map((x) => x.lines.length))) p.push(`แถว PosTableSplitLine ${lines.length} (คาด ${ref.ok ? sum(ref.parts.map((x) => x.lines.length)) : "-"})`);
    }
    chk("M1", NS(["registerSplitTable"]) === "" && p.length === 0, "15B: 74250 / 62150 · Σ 136400 · แถวที่เก็บ = ผลบริสุทธิ์", FX(NS(["registerSplitTable"]) + fx15 + (P8(p) || "ครบ")));
  });

  // ════════ M2 EQUAL ════════
  let SEQ: Seat = { sid: "", it: {}, orderId: "" };
  let PLANEQ: Any = null;
  await step("M2", async () => {
    const p: string[] = [];
    SEQ = await seat("A1", { guestCount: 4 });
    const r3 = await mkSplit(SEQ.sid, { mode: "EQUAL", partCount: 3 });
    const s3 = splitOf(r3);
    const base = { items: itemsOfSeat(SEQ), serviceChargeBp: 1000, vatRateBp: 700 };
    if (!s3) p.push(`EQUAL 3 → ${codeOf(r3)} ${short(r3?.message ?? "", 60)}`);
    else {
      p.push(...diffPlan(s3, refAlloc({ mode: "EQUAL", partCount: 3, ...base }), nameOfItem(SEQ)).map((x) => `EQ3 ${x}`));
      const tt = ((s3.parts ?? []) as Any[]).map((x) => x.totalSatang);
      if (short(tt) !== short(WANT_EQ3)) p.push(`EQ3 สุทธิ ${short(tt)} (คาด ${short(WANT_EQ3)})`);
    }
    const r4 = await mkSplit(SEQ.sid, { mode: "EQUAL", partCount: 4, splitId: s3?.splitId ?? "none", expectedVersion: Number(s3?.version ?? 1) });
    PLANEQ = splitOf(r4);
    if (!PLANEQ) p.push(`แทนด้วย EQUAL 4 → ${codeOf(r4)} ${short(r4?.message ?? "", 60)}`);
    else {
      p.push(...diffPlan(PLANEQ, refAlloc({ mode: "EQUAL", partCount: 4, ...base }), nameOfItem(SEQ)).map((x) => `EQ4 ${x}`));
      const tt = ((PLANEQ.parts ?? []) as Any[]).map((x) => x.totalSatang);
      if (short(tt) !== short(WANT_EQ4)) p.push(`EQ4 สุทธิ ${short(tt)} (คาด ${short(WANT_EQ4)})`);
      if (PLANEQ.version !== 2 || PLANEQ.splitId !== s3?.splitId) p.push(`แทนแผน version ${PLANEQ.version} (คาด 2) · splitId ${PLANEQ.splitId === s3?.splitId ? "เดิม" : "ใหม่"} (คาดเดิม)`);
      const ty = ((partOf(PLANEQ, 2)?.lines ?? []) as Any[]).find((l) => l.itemId === SEQ.it.tomyum);
      if (!ty || !String(ty.name ?? "").endsWith(" (1/4)")) p.push(`ชื่อส่วนแบ่งต้มยำ ${short(ty?.name)} (คาดลงท้าย " (1/4)")`);
      if ((await openPlans(SEQ.sid)) !== 1 || (await partRows(String(PLANEQ.splitId))).length !== 4) p.push(`แผน OPEN ${await openPlans(SEQ.sid)} · ใบ ${(await partRows(String(PLANEQ.splitId))).length} (คาด 1 · 4)`);
    }
    chk("M2", NS(["registerSplitTable"]) === "" && p.length === 0, "EQUAL 3 = 45467/45467/45466 · แทนเป็น EQUAL 4 = 4×34100 v2", FX(NS(["registerSplitTable"]) + (P8(p) || "ครบ")));
  });

  // ════════ M3 SEAT ════════
  let SSEAT: Seat = { sid: "", it: {}, orderId: "" };
  let PLANSEAT: Any = null;
  await step("M3", async () => {
    const p: string[] = [];
    SSEAT = await seat("A2", { guestCount: 4 });
    const bad = await mkSplit(SSEAT.sid, { mode: "SEAT", partCount: 4, allocations: alloc(SSEAT, ALLOC_15C.filter(([k]) => k !== "brownie")) });
    if (!refused(bad, "VALIDATION") || (await openPlans(SSEAT.sid)) > 0) p.push(`ลืมระบุที่นั่งบราวนี่ → ${codeOf(bad)} · แผน OPEN ${await openPlans(SSEAT.sid)}`);
    const r = await mkSplit(SSEAT.sid, { mode: "SEAT", partCount: 4, allocations: alloc(SSEAT, ALLOC_15C) });
    PLANSEAT = splitOf(r);
    if (!PLANSEAT) p.push(`SEAT → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      p.push(...diffPlan(PLANSEAT, refAlloc({ mode: "SEAT", partCount: 4, items: itemsOfSeat(SSEAT), allocations: alloc(SSEAT, ALLOC_15C), serviceChargeBp: 1000, vatRateBp: 700 }), nameOfItem(SSEAT)));
      const tt = ((PLANSEAT.parts ?? []) as Any[]).map((x) => x.totalSatang);
      if (short(tt) !== short(WANT_15C)) p.push(`สุทธิต่อที่นั่ง ${short(tt)} (คาด ${short(WANT_15C)})`);
      const yum = ((PLANSEAT.parts ?? []) as Any[]).map((x) => ((x.lines ?? []) as Any[]).find((l) => l.itemId === SSEAT.it.yum));
      if (short(yum.map((l) => [l?.amountSatang, !!l?.stockOwner])) !== short([[3750, true], [3750, false], [3750, false], [3750, false]])) p.push(`ยำกลางโต๊ะ ${short(yum.map((l) => [l?.amountSatang, l?.stockOwner]))}`);
    }
    chk("M3", NS(["registerSplitTable"]) === "" && p.length === 0, "15C: 33825/45815/24255/32505 · ยำ 3750×4 เจ้าของสต็อกใบ 1 · ลืมระบุ = VALIDATION", FX(NS(["registerSplitTable"]) + (P8(p) || "ครบ")));
  });

  // ════════ M4 ส่วนลดท้ายบิลบนแผน ════════
  await step("M4", async () => {
    const p: string[] = [];
    const s = await seat("A3", { guestCount: 4 });
    const pct = (bp: number) => ({ type: "PERCENT" as const, value: bp });
    const base = { mode: "ITEM" as const, partCount: 2, items: itemsOfSeat(s), allocations: alloc(s, ALLOC_15B), serviceChargeBp: 1000, vatRateBp: 700 };
    // ORACLE-EDIT ผู้คุม 14 ต.ค. (CD-P25-B1: whole-table quote is refused TABLE_SPLIT_OPEN while a plan is open — ruling 6/P3)
    const qd = await wq(s.sid, { billDiscount: pct(1000) });
    if (qd?.ok !== true || qd.grandTotalSatang !== 122760) p.push(`(ตัวควบคุม) quote ทั้งโต๊ะส่วนลด 10% → ${codeOf(qd)} ${qd?.grandTotalSatang} (คาด 122760)`);
    const r1 = await mkSplit(s.sid, { mode: "ITEM", partCount: 2, allocations: alloc(s, ALLOC_15B), billDiscount: pct(1000) });
    const s1 = splitOf(r1);
    if (!s1) p.push(`ส่วนลด 10% → ${codeOf(r1)} ${short(r1?.message ?? "", 60)}`);
    else {
      p.push(...diffPlan(s1, refAlloc({ ...base, billDiscount: pct(1000) }), nameOfItem(s)));
      const got = ((s1.parts ?? []) as Any[]).map((x) => [x.discountSatang, x.serviceChargeSatang, x.totalSatang]);
      if (short(got) !== short([[6750, 6075, 66825], [5650, 5085, 55935]])) p.push(`[ส่วนลด ค่าบริการ สุทธิ] ${short(got)}`);
    }
    const v1 = Number(s1?.version ?? 1);
    const rc = await mkSplit(s.sid, { mode: "ITEM", partCount: 2, allocations: alloc(s, ALLOC_15B), billDiscount: pct(2000), splitId: s1?.splitId ?? "none", expectedVersion: v1 }, "CASHIER");
    if (!refused(rc, "DISCOUNT_EXCEEDS_LIMIT")) p.push(`CASHIER 20% → ${codeOf(rc)} (คาด DISCOUNT_EXCEEDS_LIMIT)`);
    const row = await planRow(String(s1?.splitId ?? ""));
    if (s1 && (row?.version !== v1 || row?.discountSatang !== 12400)) p.push(`หลังถูกปฏิเสธ แผน v${row?.version} ส่วนลด ${row?.discountSatang} (คาดเดิม)`);
    const rm = await mkSplit(s.sid, { mode: "ITEM", partCount: 2, allocations: alloc(s, ALLOC_15B), billDiscount: pct(2000), splitId: s1?.splitId ?? "none", expectedVersion: v1 }, "MGR");
    const sm = splitOf(rm);
    if (!sm) p.push(`MANAGER 20% → ${codeOf(rm)}`);
    else p.push(...diffPlan(sm, refAlloc({ ...base, billDiscount: pct(2000) }), nameOfItem(s)).map((x) => `20% ${x}`));
    chk("M4", NS(["registerSplitTable"]) === "" && p.length === 0, "10%: 66825/55935 = quote 122760 · CASHIER 20% ถูกปฏิเสธ · MANAGER ok", FX(NS(["registerSplitTable"]) + (P8(p) || "ครบ")));
  });

  // ════════ M7 สมาชิก ════════
  await step("M7", async () => {
    const p: string[] = [];
    if (!MEMBER) throw new Error("ไม่มีสมาชิก (fixture)");
    const s = await seat("A4", { guestCount: 2, memberId: MEMBER });
    const r = await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 });
    const sp2 = splitOf(r);
    if (!sp2) p.push(`EQUAL 2 → ${codeOf(r)}`);
    else {
      if (partOf(sp2, 1)?.memberId !== MEMBER || (partOf(sp2, 2)?.memberId ?? null) !== null) p.push(`สมาชิกของใบ ${short([partOf(sp2, 1)?.memberId === MEMBER, partOf(sp2, 2)?.memberId ?? null])} (คาด ใบ 1 = สมาชิกของโต๊ะ · ใบ 2 null)`);
      const q1 = await pq(String(partOf(sp2, 1)?.id ?? ""));
      const q2 = await pq(String(partOf(sp2, 2)?.id ?? ""));
      const md = (q: Any) => Number(q?.memberDiscountSatang ?? q?.tierDiscountSatang ?? 0);
      if (q1?.ok !== true || !(Number(q1.tierDiscountSatang ?? 0) > 0)) p.push(`ใบ 1 quote ${codeOf(q1)} tierDiscount ${q1?.tierDiscountSatang}`);
      if (q2?.ok !== true || md(q2) !== 0) p.push(`ใบ 2 quote ${codeOf(q2)} ส่วนลดสมาชิก ${md(q2)} (คาด 0)`);
      if (q1?.ok === true && q2?.ok === true && q1.grandTotalSatang + md(q1) + q2.grandTotalSatang + md(q2) !== 136400) p.push(`Σ(ยอด+ส่วนลดสมาชิก) ${q1.grandTotalSatang + md(q1) + q2.grandTotalSatang + md(q2)} (คาด 136400)`);
      const qc = await pq(String(partOf(sp2, 2)?.id ?? ""), { couponCode: `QC25${RAND}` });
      if (!refused(qc, "VALIDATION")) p.push(`คูปองบนใบ 2 (ไม่มีสมาชิก) → ${codeOf(qc)} (คาด VALIDATION)`);
      const a = await payPart(sp2, 1);
      const b = await payPart(sp2, 2, ctxA(DEV2), { taxInvoice: { ...BUYER } });
      PAID.tax = b.saleId;
      const sa = await saleRow(a.saleId);
      const sb = await saleRow(b.saleId);
      if (sa?.memberId !== MEMBER || (sb && sb.memberId !== null) || !sb) p.push(`บิล memberId ใบ1 ${sa?.memberId === MEMBER ? "สมาชิก" : short(sa?.memberId ?? codeOf(a.r))} · ใบ2 ${short(sb?.memberId ?? codeOf(b.r))}`);
    }
    chk("M7", NS(["registerSplitTable"]) === "" && p.length === 0, "สิทธิ์สมาชิกเฉพาะใบที่มีสมาชิก · Σ = ยอดแผน", FX(NS(["registerSplitTable"]) + (P8(p) || "ครบ")));
  });

  // ════════ P3 ขณะแผน OPEN ════════
  console.log("\n── P วงจรแผน ──");
  await step("P3", async () => {
    const p: string[] = [];
    if (!PLAN15) p.push("ไม่มีแผน 15B (M1)");
    const c0 = await counts();
    const s0 = await snap(S15.sid, String(PLAN15?.splitId ?? ""));
    const q = await wq(S15.sid);
    if (!refused(q, "TABLE_SPLIT_OPEN")) p.push(`quote ทั้งโต๊ะ → ${codeOf(q)}`);
    const w = await wpay(S15.sid, Q15);
    if (!refused(w.r, "TABLE_SPLIT_OPEN")) p.push(`submit ทั้งโต๊ะ → ${codeOf(w.r)}`);
    const ci = await tbl("registerCancelTableItem", ctxA(), A("OWNER"), { itemId: S15.it.brownie ?? "none", reason: "ลูกค้าเปลี่ยนใจ" });
    if (!refused(ci, "TABLE_SPLIT_OPEN")) p.push(`ยกเลิกรายการในแผน → ${codeOf(ci)}`);
    const pid = String(partOf(PLAN15, 1)?.id ?? "");
    const bads: [string, Any][] = [
      ["tableSplitPartId + tableSessionId", { tableSessionId: S15.sid }],
      ["lines ไม่ว่าง", { lines: [ml("rice", 1)] }],
      ["billDiscount", { billDiscount: { type: "PERCENT", value: 500 } }],
      ["heldCartId", { heldCartId: `held${RAND}` }],
      ["channelId", { channelId: `ch${RAND}` }],
    ];
    for (const [lbl, extra] of bads) {
      const r = await pq(pid, extra);
      if (!refused(r, "VALIDATION")) p.push(`quote ใบ + ${lbl} → ${codeOf(r)}`);
    }
    const qq = await pq(pid);
    const sb = await ppay(pid, qq, { extra: { lines: [ml("rice", 1)] } });
    if (!refused(sb.r, "VALIDATION")) p.push(`submit ใบ + lines → ${codeOf(sb.r)}`);
    const c1 = await counts();
    if (c1.sale !== c0.sale || c1.seq !== c0.seq) p.push(`บิล ${c0.sale}→${c1.sale} · เลข ${c0.seq}→${c1.seq}`);
    if ((await snap(S15.sid, String(PLAN15?.splitId ?? ""))) !== s0) p.push("รายการ/แผน/session เปลี่ยน");
    chk("P3", NS(["registerSplitTable"]) === "" && p.length === 0, "ทั้งโต๊ะ/ยกเลิกรายการ = TABLE_SPLIT_OPEN · รูปคำขอผิด = VALIDATION · ไม่เขียน", FX(NS(["registerSplitTable"]) + (P8(p) || "ครบ")));
  });

  // ════════ P1 จ่ายใบ 1 ════════
  let BROWNIE_STOCK0 = NaN;
  let RICE0 = NaN;
  await step("P1", async () => {
    const p: string[] = [];
    BROWNIE_STOCK0 = Number((await P.menuItem.findUnique({ where: { id: MI.brownie ?? "none" }, select: { stockQty: true } }).catch(() => null))?.stockQty ?? NaN);
    RICE0 = await onHand("rice");
    const pid = String(partOf(PLAN15, 1)?.id ?? "");
    const q = await pq(pid, {}, ctxA(DEV2));
    if (q?.ok !== true || q.grandTotalSatang !== 74250 || q.subtotalSatang !== 67500 || q.serviceChargeSatang !== 6750 || q.billDiscountSatang !== 0 || q.split?.partNo !== 1 || q.split?.partCount !== 2) p.push(`quote ใบ 1 ${codeOf(q)} ${short(q?.ok ? { g: q.grandTotalSatang, sub: q.subtotalSatang, sc: q.serviceChargeSatang, split: q.split } : q?.message, 140)}`);
    const { r, key } = await ppay(pid, q, { ctx: ctxA(DEV2) });
    const saleId = r?.ok === true ? String(r.saleId) : "";
    PAID.p1 = saleId;
    PAID.p1key = key;
    const sale = await saleRow(saleId);
    if (!sale) p.push(`submit ใบ 1 → ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    else {
      const head = [sale.sourceModule, sale.sourceId === S15.sid, sale.channelCode, sale.status, sale.grandTotalSatang, sale.subtotalSatang, sale.serviceChargeSatang, sale.discountSatang];
      if (short(head) !== short(["POS", true, "STORE", "PAID", 74250, 67500, 6750, 0])) p.push(`บิล [module sourceId channel status grand subtotal sc discount] ${short(head, 140)}`);
      const ls = (sale.lines as Any[]).map((l) => [KEY_OF_PP(String(l.productId ?? "")), l.qty, l.unitPriceSatang, l.itemId === INV.rice ? "rice" : l.itemId ? "inv" : "-"]).sort((a, b) => byId(String(a[0]), String(b[0])));
      const want = [["chayen", 3, 6900, "-"], ["kaprao", 2, 9900, "-"], ["latte", 1, 7500, "-"], ["rice", 3, 1500, "rice"], ["yum", 1, 15000, "-"]];
      if (short(ls) !== short(want)) p.push(`บรรทัดบิล ${short(ls, 200)} (คาด ${short(want, 200)})`);
    }
    const prt = (await partRows(String(PLAN15?.splitId ?? "")))[0];
    if (prt?.status !== "PAID" || prt?.saleId !== saleId || !prt?.paidAt) p.push(`ใบ 1 ${short(prt && [prt.status, prt.saleId === saleId], 60)}`);
    const its = await itemsOf(S15.sid);
    const st = (k: string) => (its.find((x) => x.id === S15.it[k])?.saleId === saleId && saleId ? "S1" : its.find((x) => x.id === S15.it[k])?.saleId ? "?" : "-");
    const got = ["kaprao", "yum", "chayen", "rice", "latte", "tomyum", "squid", "brownie"].map(st);
    if (got.join(",") !== "S1,S1,S1,-,-,-,-,-") p.push(`รายการผูกบิล [kaprao yum chayen rice latte tomyum squid brownie] ${got.join(",")} (คาด S1×3 แล้วว่าง)`);
    if ((await sessRow(S15.sid))?.status !== "OPEN") p.push(`session ${(await sessRow(S15.sid))?.status} (คาด OPEN)`);
    const rp = await ppay(pid, q, { key, ctx: ctxA(DEV2) });
    if (rp.r?.ok !== true || String(rp.r.saleId) !== saleId || rp.r.duplicated !== true) p.push(`ส่งซ้ำคีย์เดิม → ${codeOf(rp.r)} ${short({ same: String(rp.r?.saleId) === saleId, dup: rp.r?.duplicated }, 60)}`);
    const det = await tbl("registerTableDetail", ctxA(), A("OWNER"), { tableSessionId: S15.sid });
    const ds = det?.split;
    if (det?.ok !== true || ds?.splitId !== PLAN15?.splitId || ds?.mode !== "ITEM" || ds?.paidParts !== 1 || ds?.partCount !== 2 || ds?.remainingSatang !== 62150) p.push(`registerTableDetail.split ${short(ds, 120)}`);
    const fl = await tbl("registerTables", ctxA(), A("OWNER"));
    const card = Array.isArray(fl?.tables) ? (fl.tables as Any[]).find((t) => t.id === TB.A5) : null;
    if (card?.split?.paidParts !== 1 || card?.split?.partCount !== 2) p.push(`การ์ดผัง A5 split ${short(card?.split, 60)}`);
    chk("P1", NS(["registerSplitTable"]) === "" && p.length === 0, "บิลของใบ 1 · รายการเฉพาะใบผูก · ที่ใช้ร่วมยังไม่ผูก · เล่นซ้ำ = บิลเดิม", FX(NS(["registerSplitTable"]) + (P8(p) || "ครบ")));
  });

  // ════════ P4 วงจรแผน ════════
  await step("P4", async () => {
    const p: string[] = [];
    // แผนที่ยังไม่จ่าย (SEAT): version เก่า / แทน / สร้างซ้ำ
    const v = Number(PLANSEAT?.version ?? 1);
    const body = { mode: "SEAT", partCount: 4, allocations: alloc(SSEAT, ALLOC_15C) };
    const stale = await mkSplit(SSEAT.sid, { ...body, splitId: PLANSEAT?.splitId ?? "none", expectedVersion: v + 5 });
    if (!refused(stale, "VERSION_CHANGED")) p.push(`expectedVersion เก่า → ${codeOf(stale)}`);
    const rep = await mkSplit(SSEAT.sid, { ...body, splitId: PLANSEAT?.splitId ?? "none", expectedVersion: v });
    const s2 = splitOf(rep);
    if (!s2 || s2.version !== v + 1) p.push(`แทนแผน → ${codeOf(rep)} version ${s2?.version} (คาด ${v + 1})`);
    else PLANSEAT = s2;
    const dup = await mkSplit(SSEAT.sid, { mode: "EQUAL", partCount: 2 });
    if (!refused(dup, "TABLE_SPLIT_EXISTS") || dup?.splitId !== PLANSEAT?.splitId || dup?.version !== PLANSEAT?.version) p.push(`สร้างซ้ำขณะมีแผน → ${codeOf(dup)} ${short({ splitId: dup?.splitId === PLANSEAT?.splitId, version: dup?.version }, 60)} (คาด TABLE_SPLIT_EXISTS + splitId/version ปัจจุบัน)`);
    // แผนที่จ่ายแล้ว 1 ใบ (15B หลัง P1): แทน/ยกเลิก = TABLE_SPLIT_LOCKED
    const v15 = Number((await planRow(String(PLAN15?.splitId ?? "")))?.version ?? 1);
    const lk1 = await mkSplit(S15.sid, { mode: "EQUAL", partCount: 2, splitId: PLAN15?.splitId ?? "none", expectedVersion: v15 });
    const lk2 = await sp("registerCancelSplit", ctxA(DEV1), A("OWNER"), { splitId: PLAN15?.splitId ?? "none", expectedVersion: v15 });
    if (!refused(lk1, "TABLE_SPLIT_LOCKED") || !refused(lk2, "TABLE_SPLIT_LOCKED")) p.push(`หลังจ่ายใบแรก แทน → ${codeOf(lk1)} · ยกเลิก → ${codeOf(lk2)} (คาด TABLE_SPLIT_LOCKED ทั้งคู่)`);
    // ยกเลิกแผนที่ยังไม่จ่าย → จ่ายทั้งโต๊ะได้
    const s = await seat("B8", { lines: [ml("kaprao", 2), ml("chayen", 1)] }); // ไม่มีข้าว — ไม่กวนตัวนับข้าวของ S1/X2
    const pl = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }));
    const cs = await sp("registerCancelSplit", ctxA(DEV1), A("OWNER"), { splitId: pl?.splitId ?? "none", expectedVersion: Number(pl?.version ?? 1) });
    const row = await planRow(String(pl?.splitId ?? ""));
    if (cs?.ok !== true || row?.status !== "CANCELLED" || !row?.cancelledAt) p.push(`ยกเลิกแผน → ${codeOf(cs)} สถานะ ${row?.status}`);
    const cs2 = await sp("registerCancelSplit", ctxA(DEV1), A("OWNER"), { splitId: pl?.splitId ?? "none", expectedVersion: Number(pl?.version ?? 1) });
    if (cs2?.ok === true && (await planRow(String(pl?.splitId ?? "")))?.status !== "CANCELLED") p.push("ยกเลิกซ้ำแล้วสถานะเปลี่ยน");
    const q = await wq(s.sid);
    const w = await wpay(s.sid, q);
    if (w.r?.ok !== true || (await sessRow(s.sid))?.status !== "CLOSED") p.push(`จ่ายทั้งโต๊ะหลังยกเลิกแผน → quote ${codeOf(q)} · submit ${codeOf(w.r)} · session ${(await sessRow(s.sid))?.status}`);
    chk("P4", NS([...SPLIT_FNS]) === "" && p.length === 0, "VERSION_CHANGED · version+1 · LOCKED หลังจ่าย · ยกเลิก → ทั้งโต๊ะจ่ายได้ · EXISTS", FX(NS([...SPLIT_FNS]) + (P8(p) || "ครบ")));
  });

  // ════════ P2 จ่ายใบสุดท้าย ════════
  await step("P2", async () => {
    const p: string[] = [];
    const pid = String(partOf(PLAN15, 2)?.id ?? "");
    const q = await pq(pid, {}, ctxA(DEV1));
    const { r } = await ppay(pid, q, { ctx: ctxA(DEV1) });
    const saleId = r?.ok === true ? String(r.saleId) : "";
    PAID.p2 = saleId;
    if (!saleId) p.push(`จ่ายใบ 2 → ${codeOf(r)} ${short(r?.message ?? "", 80)} (quote ${codeOf(q)} ${q?.grandTotalSatang})`);
    else {
      const its = await itemsOf(S15.sid);
      const of = (k: string) => its.find((x) => x.id === S15.it[k])?.saleId;
      const wantS2 = ["tomyum", "squid", "brownie", "rice", "latte"].filter((k) => of(k) !== saleId);
      const wantS1 = ["kaprao", "yum", "chayen"].filter((k) => of(k) !== PAID.p1);
      if (wantS2.length || wantS1.length) p.push(`ผูกบิลผิด: ไม่ใช่บิลใบ 2 ${wantS2.join(",") || "-"} · ไม่ใช่บิลใบ 1 ${wantS1.join(",") || "-"}`);
      if (its.some((x) => !x.settledAt)) p.push("มีรายการไม่มี settledAt");
      const row = await planRow(String(PLAN15?.splitId ?? ""));
      if (row?.status !== "DONE" || !row?.doneAt) p.push(`แผน ${row?.status} doneAt ${short(row?.doneAt, 30)}`);
      const s = await sessRow(S15.sid);
      const t = await tableRow(TB.A5!);
      if (s?.status !== "CLOSED" || !(t?.dirtySince instanceof Date)) p.push(`session ${s?.status} · dirtySince ${short(t?.dirtySince, 30)}`);
      const rounds = Number(await P.restaurantOrder.count({ where: { tenantId: T, sessionId: S15.sid } }).catch(() => -1));
      if (rounds !== 1) p.push(`RestaurantOrder ของ session ${rounds} (คาด 1 — บิลของใบไม่สร้างรอบครัว)`);
    }
    // ตัวแปร: รอบร่าง HELD ค้าง → จ่ายครบแล้ว session ยัง OPEN
    const sd = await seat("B7", { lines: [ml("kaprao", 1), ml("latte", 1)] }); // ไม่มีข้าว — ไม่กวนตัวนับข้าวของ S1/X2
    const pl = splitOf(await mkSplit(sd.sid, { mode: "EQUAL", partCount: 2 }));
    const h = await hold(sd.sid, [ml("chayen", 1)]);
    const a = await payPart(pl, 1);
    const b = await payPart(pl, 2);
    const sv = await sessRow(sd.sid);
    const tv = await tableRow(TB.B7!);
    if (!a.saleId || !b.saleId || sv?.status !== "OPEN" || tv?.dirtySince !== null || (await heldRow(String(h?.heldCart?.id ?? "")))?.status !== "HELD") p.push(`มีรอบร่าง: ใบ ${codeOf(a.r)}/${codeOf(b.r)} · session ${sv?.status} · dirty ${short(tv?.dirtySince, 30)} (คาด OPEN · null · ร่าง HELD)`);
    chk("P2", NS(["registerSplitTable"]) === "" && p.length === 0, "ใบสุดท้าย → DONE + ปิดโต๊ะ · มีรอบร่าง = ไม่ปิด", FX(NS(["registerSplitTable"]) + (P8(p) || "ครบ")));
  });

  // ════════ M5 VAT ต่อใบ ════════
  await step("M5", async () => {
    const p: string[] = [];
    const vats: number[] = [];
    for (const [k, t] of [["p1", 74250], ["p2", 62150]] as const) {
      const s = await saleRow(PAID[k] ?? "");
      if (!s) p.push(`ไม่มีบิล ${k}`);
      else {
        if (s.grandTotalSatang !== t || s.vatSatang !== vatOf(t, 700)) p.push(`${k} ยอด ${s.grandTotalSatang} VAT ${s.vatSatang} (คาด ${t} · ${vatOf(t, 700)})`);
        vats.push(Number(s.vatSatang));
      }
    }
    if (vats.length === 2 && Math.abs(sum(vats) - vatOf(136400, 700)) > 1) p.push(`|Σ VAT ${sum(vats)} − ${vatOf(136400, 700)}| > 1`);
    // EQUAL 3 (บริสุทธิ์ + ตัวอ้างอิง): VAT ต่อใบ = vatOf(สุทธิใบ) · ต่างจากทั้งโต๊ะ ≤ 2
    const e3 = callSync(sharedMod, "allocateTableSplit", { mode: "EQUAL", partCount: 3, items: pureItems(), serviceChargeBp: 1000, vatRateBp: 700 });
    const pv = ((e3?.parts ?? []) as Any[]).map((x) => Number(x.vatSatang));
    if (e3?.ok !== true || short(pv) !== short(WANT_EQ3.map((t) => vatOf(t, 700))) || Math.abs(sum(pv) - vatOf(136400, 700)) > 2) p.push(`EQUAL 3 VAT ${short(pv)} (คาด ${short(WANT_EQ3.map((t) => vatOf(t, 700)))})`);
    const e0 = callSync(sharedMod, "allocateTableSplit", { mode: "EQUAL", partCount: 3, items: pureItems(), serviceChargeBp: 1000, vatRateBp: 0 });
    if (e0?.ok !== true || ((e0.parts ?? []) as Any[]).some((x) => x.vatSatang !== 0)) p.push(`vatRateBp 0 → ${short(((e0?.parts ?? []) as Any[]).map((x) => x.vatSatang))}`);
    chk("M5", p.length === 0, "VAT ของใบ = vatOf(สุทธิใบ) · Σ ต่างจากทั้งโต๊ะ ≤ ⌊(N+1)/2⌋", FX(P8(p) || "ครบ"));
  });

  // ════════ S สต็อก/บัญชี ════════
  console.log("\n── S สต็อก/บัญชี ──");
  const PAIDEQ: string[] = [];
  let RICE_EQ0 = NaN;
  let NOODLE_EQ0 = NaN;
  await step("S1", async () => {
    const p: string[] = [];
    const o1 = await outOf(PAID.p1 ?? "", "rice");
    const o2 = await outOf(PAID.p2 ?? "", "rice");
    if (o1 !== -3 || o2 !== -1) p.push(`15B ข้าว OUT ใบ1 ${o1} · ใบ2 ${o2} (คาด −3 · −1)`);
    const nd = await outOf(PAID.p1 ?? "", "noodle");
    if (nd !== -1) p.push(`15B วุ้นเส้น (ยำในใบ 1) OUT ${nd} (คาด −1 · สูตร P2.3)`);
    const rh = await onHand("rice");
    if (rh - RICE0 !== -4) p.push(`ข้าว onHand ${RICE0} → ${rh} (คาด −4)`);
    // EQUAL 4: ใบ 1 ถือสต็อกทั้งหมด
    RICE_EQ0 = await onHand("rice");
    NOODLE_EQ0 = await onHand("noodle");
    for (let no = 1; no <= 4; no++) {
      const x = await payPart(PLANEQ, no, no % 2 ? ctxA(DEV1) : ctxA(DEV2));
      PAIDEQ.push(x.saleId);
      if (!x.saleId) p.push(`จ่าย EQUAL ใบ ${no} → ${codeOf(x.r)} ${short(x.r?.message ?? "", 60)}`);
    }
    if (PAIDEQ.every(Boolean)) {
      const rice = await Promise.all(PAIDEQ.map((s) => outOf(s, "rice")));
      const noodle = await Promise.all(PAIDEQ.map((s) => outOf(s, "noodle")));
      if (short(rice) !== short([-4, 0, 0, 0]) || short(noodle) !== short([-1, 0, 0, 0])) p.push(`EQUAL OUT ข้าว ${short(rice)} วุ้นเส้น ${short(noodle)} (คาด [-4,0,0,0] · [-1,0,0,0])`);
      if ((await onHand("rice")) - RICE_EQ0 !== -4 || (await onHand("noodle")) - NOODLE_EQ0 !== -1) p.push(`EQUAL onHand ข้าว ${(await onHand("rice")) - RICE_EQ0} วุ้นเส้น ${(await onHand("noodle")) - NOODLE_EQ0}`);
      const s2 = await saleRow(PAIDEQ[1]!);
      const ty = ((s2?.lines ?? []) as Any[]).find((l) => l.productId === PP.tomyum);
      if (!ty || ty.qty !== 1 || ty.unitPriceSatang !== 4500 || !String(ty.name ?? "").endsWith(" (1/4)") || ty.itemId) p.push(`บรรทัดส่วนแบ่งต้มยำ (ใบ 2) ${short(ty && [ty.name, ty.qty, ty.unitPriceSatang, ty.itemId], 100)} (คาด "… (1/4)" · 1 · 4500 · ไม่มี itemId)`);
    }
    chk("S1", p.length === 0, "15B ข้าว −3/−1 · EQUAL ข้าว −4 วุ้นเส้น −1 เฉพาะใบ 1", FX(P8(p) || "ครบ"));
  });
  await step("S2", async () => {
    const p: string[] = [];
    const now = Number((await P.menuItem.findUnique({ where: { id: MI.brownie ?? "none" }, select: { stockQty: true } }).catch(() => null))?.stockQty ?? NaN);
    if (!Number.isFinite(BROWNIE_STOCK0) || now !== BROWNIE_STOCK0) p.push(`บราวนี่ stockQty ก่อนจ่าย ${BROWNIE_STOCK0} → หลังจ่ายใบ ${now}`);
    if (!PAID.p2) p.push("ไม่มีบิลใบ 2 (P2)");
    chk("S2", p.length === 0, "ตัวนับเมนูไม่ขยับจากบิลของใบ", FX(P8(p) || `ครบ (${now})`));
  });
  await step("S3", async () => {
    const p: string[] = [];
    await drain();
    const sales = [PAID.p1 ?? "", PAID.p2 ?? ""];
    for (const s of sales) {
      const j = await jvBalanced(s);
      if (j) p.push(`${s.slice(-6) || "-"}: ${j}`);
    }
    const grands = await Promise.all(sales.map(async (s) => Number((await saleRow(s))?.grandTotalSatang ?? 0)));
    if (sum(grands) !== 136400) p.push(`Σ ยอดบิลของใบ ${sum(grands)} (คาด 136400)`);
    const tax = Number(await P.accountDocument.count({ where: { tenantId: T, refType: "PosSale", refId: PAID.tax || "none", docType: "TAX_INVOICE" } }).catch(() => -1));
    const s2 = await saleRow(PAID.tax ?? "");
    if (tax !== 1 || !s2?.taxInvoice) p.push(`ใบกำกับเต็มรูปบนใบ 2 ของโต๊ะ A4 (M7): เอกสาร ${tax} · PosSale.taxInvoice ${s2?.taxInvoice ? "มี" : "ไม่มี"}`);
    // แผน/แทน/ยกเลิก/ใบรายการ → ไม่ลงบัญชี
    const s = await seat("B6", { lines: [ml("rice", 2), ml("kaprao", 1)] });
    await drain();
    await sleep(300);
    const c0 = await counts();
    const pl = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }));
    const pl2 = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 3, splitId: pl?.splitId ?? "none", expectedVersion: Number(pl?.version ?? 1) }));
    const pb = await tbl("registerTablePreBill", ctxA(DEV1), A("OWNER"), { tableSplitPartId: String(partOf(pl2, 1)?.id ?? "none") });
    const cs = await sp("registerCancelSplit", ctxA(DEV1), A("OWNER"), { splitId: pl2?.splitId ?? "none", expectedVersion: Number(pl2?.version ?? 1) });
    await drain();
    const c1 = await counts();
    if (!pl || !pl2 || pb?.ok !== true || cs?.ok !== true) p.push(`แผน ${pl ? "ok" : "ไม่มี"} · แทน ${pl2 ? "ok" : "ไม่มี"} · ใบรายการ ${codeOf(pb)} · ยกเลิก ${codeOf(cs)}`);
    if (c1.je !== c0.je || c1.ob !== c0.ob || c1.seq !== c0.seq || c1.sale !== c0.sale) p.push(`JV ${c0.je}→${c1.je} · outbox ${c0.ob}→${c1.ob} · เลข ${c0.seq}→${c1.seq} · บิล ${c0.sale}→${c1.sale}`);
    chk("S3", p.length === 0, "GL ต่อใบดุล · Σ = 136400 · แผน/ใบรายการไม่ลงบัญชี · ใบกำกับเต็มรูปบนใบ", FX(P8(p) || "ครบ"));
  });

  // ════════ B2 ใบรายการของใบ + ปฏิเสธ ════════
  console.log("\n── B ใบรายการ ──");
  await step("B2", async () => {
    const p: string[] = [];
    const pid2 = String(partOf(PLANSEAT, 2)?.id ?? "");
    const r = await tbl("registerTablePreBill", ctxA(DEV1), A("WAITER"), { tableSplitPartId: pid2, copy: true });
    const pl = r?.ok === true ? r.payload : null;
    if (!pl) p.push(`ใบรายการที่นั่ง 2 (WAITER) → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      const head = [pl.kind, pl.notReceipt, pl.part?.no, pl.part?.of, pl.subtotalSatang, pl.discountSatang, pl.serviceCharge?.satang, pl.totalSatang, pl.copy, pl.tableName];
      if (short(head) !== short(["PRE_BILL", true, 2, 4, 41650, 0, 4165, 45815, true, "A2"])) p.push(`payload ${short(head, 160)} (คาด PRE_BILL true 2 4 41650 0 4165 45815 true A2)`);
    }
    const cases: [string, Any, Any, string][] = [
      ["NOPERM", A("NOPERM"), { tableSessionId: SSEAT.sid }, "PERMISSION_DENIED"],
      ["session ร้าน T2", A("OWNER"), { tableSessionId: SX }, "TABLE_NOT_FOUND"],
      ["session CLOSED (A5 หลังจ่ายครบ)", A("OWNER"), { tableSessionId: S15.sid }, "TABLE_SESSION_CLOSED"],
      ["ใบมั่ว", A("OWNER"), { tableSplitPartId: `nope${RAND}` }, "TABLE_SPLIT_NOT_FOUND"],
    ];
    for (const [lbl, actor, input, want] of cases) {
      const x = await call(tableMod, "registerTablePreBill", ctxA(DEV1), actor, input);
      if (!refused(x, want)) p.push(`${lbl} → ${codeOf(x)} (คาด ${want})`);
    }
    const xb = await call(tableMod, "registerTablePreBill", ctxB(), A("OWNER"), { tableSessionId: SSEAT.sid });
    if (!refused(xb, "TABLE_NOT_FOUND")) p.push(`ctx สาขา B → ${codeOf(xb)}`);
    chk("B2", NS(["registerTablePreBill"]) === "" && p.length === 0, "ใบรายการของใบ = ยอดใบ · สิทธิ์/ขอบเขต/ปิดแล้ว", FX(NS(["registerTablePreBill"]) + (P8(p) || "ครบ")));
  });

  // ════════ X void/คืน ════════
  console.log("\n── X void/คืน ──");
  await step("X1", async () => {
    const p: string[] = [];
    const sale2 = PAID.p2 ?? "";
    if (!sale2) throw new Error("ไม่มีบิลใบ 2 (P2)");
    const r0 = await onHand("rice");
    const v = await voidSale(sale2);
    if (v?.ok !== true) p.push(`voidSaleByActor → ${codeOf(v)} ${short(v?.message ?? "", 60)}`);
    const orig = ((await P.accountJournalEntry.findMany({ where: { tenantId: T, refType: "PosSale", refId: sale2, reversalOfId: null } }).catch(() => [])) as Any[]).map((e) => e.id);
    const rev = orig.length ? Number(await P.accountJournalEntry.count({ where: { tenantId: T, reversalOfId: { in: orig } } }).catch(() => -1)) : 0;
    if (!orig.length || rev < 1) p.push(`JV กลับรายการ ${rev} (ต้นฉบับ ${orig.length})`);
    if ((await onHand("rice")) - r0 !== 1) p.push(`ข้าวคืน ${(await onHand("rice")) - r0} (คาด +1)`);
    const parts = await partRows(String(PLAN15?.splitId ?? ""));
    const row = await planRow(String(PLAN15?.splitId ?? ""));
    if (parts[1]?.status !== "OPEN" || parts[1]?.saleId !== null || parts[0]?.status !== "PAID" || row?.status !== "OPEN") p.push(`ใบ ${short(parts.map((x) => [x.no, x.status, x.saleId ? "sale" : null]), 80)} · แผน ${row?.status} (คาด ใบ 2 OPEN · แผน OPEN)`);
    const its = await itemsOf(S15.sid);
    const of = (k: string) => its.find((x) => x.id === S15.it[k]);
    const loose = ["tomyum", "squid", "brownie", "rice", "latte"].filter((k) => of(k)?.saleId !== null || of(k)?.settledAt !== null);
    const kept = ["kaprao", "yum", "chayen"].filter((k) => of(k)?.saleId !== PAID.p1);
    if (loose.length || kept.length) p.push(`ยังไม่หลุด ${loose.join(",") || "-"} · หลุดผิด ${kept.join(",") || "-"}`);
    const s = await sessRow(S15.sid);
    const t = await tableRow(TB.A5!);
    if (s?.status !== "OPEN" || t?.dirtySince !== null) p.push(`session ${s?.status} · dirtySince ${short(t?.dirtySince, 30)} (คาด OPEN · null)`);
    const s0 = await snap(S15.sid, String(PLAN15?.splitId ?? ""));
    p.push(...(await replayVoided(sale2)));
    await drain();
    if ((await snap(S15.sid, String(PLAN15?.splitId ?? ""))) !== s0) p.push("เล่นตัวรับซ้ำแล้วโต๊ะ/แผนเปลี่ยน");
    chk("X1", NS(["registerSplitTable"]) === "" && p.length === 0, "void ใบ 2 → ใบ/แผนเปิด · รายการของใบหลุด · โต๊ะเปิดกลับ · เล่นซ้ำไม่เปลี่ยน", FX(NS(["registerSplitTable"]) + (P8(p) || "ครบ")));
  });
  await step("X2", async () => {
    const p: string[] = [];
    const rr0 = await onHand("rice");
    const re = await payPart(PLAN15, 2, ctxA(DEV1));
    PAID.p2b = re.saleId;
    if (!re.saleId || re.saleId === PAID.p2) p.push(`จ่ายใบ 2 ใหม่ → ${codeOf(re.r)} ${short(re.r?.message ?? "", 60)}`);
    else {
      const row = await planRow(String(PLAN15?.splitId ?? ""));
      const its = await itemsOf(S15.sid);
      if (row?.status !== "DONE" || its.some((x) => !x.saleId) || (await sessRow(S15.sid))?.status !== "CLOSED") p.push(`หลังจ่ายใหม่ แผน ${row?.status} · ค้าง ${its.filter((x) => !x.saleId).length} · session ${(await sessRow(S15.sid))?.status}`);
      if ((await outOf(re.saleId, "rice")) !== -1 || (await onHand("rice")) - rr0 !== -1) p.push(`ข้าว OUT ${await outOf(re.saleId, "rice")} · onHand ${(await onHand("rice")) - rr0} (คาด −1 · −1)`);
      const paidSum = sum((await partRows(String(PLAN15?.splitId ?? ""))).filter((x) => x.status === "PAID").map((x) => Number(x.totalSatang)));
      if (paidSum !== 136400) p.push(`Σ ใบ PAID ${paidSum}`);
    }
    // EQUAL: void ใบที่ถือสต็อก (ใบ 1) → คืนครั้งเดียว · จ่ายใหม่ → ตัดครั้งเดียว
    const own = PAIDEQ[0] ?? "";
    if (!own) p.push("ไม่มีบิล EQUAL ใบ 1 (S1)");
    else {
      const r0 = await onHand("rice");
      const n0 = await onHand("noodle");
      const v = await voidSale(own);
      await drain();
      const dr = (await onHand("rice")) - r0;
      const dn = (await onHand("noodle")) - n0;
      if (v?.ok !== true || dr !== 4 || dn !== 1) p.push(`void ใบเจ้าของสต็อก → ${codeOf(v)} · ข้าว +${dr} วุ้นเส้น +${dn} (คาด +4 · +1)`);
      const e1 = await payPart(PLANEQ, 1, ctxA(DEV1));
      if (!e1.saleId || (await outOf(e1.saleId, "rice")) !== -4 || (await outOf(e1.saleId, "noodle")) !== -1 || (await onHand("rice")) - r0 !== 0 || (await onHand("noodle")) - n0 !== 0) p.push(`จ่ายใบ 1 ใหม่ → ${codeOf(e1.r)} · ข้าว OUT ${await outOf(e1.saleId, "rice")} วุ้นเส้น OUT ${await outOf(e1.saleId, "noodle")} · สุทธิ ข้าว ${(await onHand("rice")) - r0} วุ้นเส้น ${(await onHand("noodle")) - n0}`);
      const rowE = await planRow(String(PLANEQ?.splitId ?? ""));
      if (rowE?.status !== "DONE" || (await sessRow(SEQ.sid))?.status !== "CLOSED") p.push(`EQUAL แผน ${rowE?.status} · session ${(await sessRow(SEQ.sid))?.status}`);
    }
    chk("X2", p.length === 0, "จ่ายใหม่ = บิลใหม่ · DONE · ตัดสต็อกครั้งเดียว · void ใบเจ้าของคืนครั้งเดียว", FX(P8(p) || "ครบ"));
  });
  await step("X3", async () => {
    const p: string[] = [];
    const saleId = PAID.p2b ?? "";
    if (!saleId) throw new Error("ไม่มีบิลใบ 2 ใหม่ (X2)");
    const line = ((await P.posSaleLine.findMany({ where: { saleId } }).catch(() => [])) as Any[]).find((l) => l.productId === PP.tomyum);
    const s0 = await snap(S15.sid, String(PLAN15?.splitId ?? ""));
    const input = (amt: number): Any => ({ saleId, lines: [{ lineId: line?.id ?? "none", qty: 1, restock: false }], payMethods: [{ type: "CASH", amountSatang: amt }], reasonCode: "CHANGED_MIND", reason: "ลูกค้าเปลี่ยนใจ", idempotencyKey: newKey("rf") });
    const probe = await call(refundMod, "refundSale", ctxA(DEV1), A("OWNER"), input(1));
    const amt = Number(/ยอดคืน (\d+)/.exec(String(probe?.message ?? ""))?.[1] ?? NaN);
    const r = await call(refundMod, "refundSale", ctxA(DEV1), A("OWNER"), input(amt));
    if (r?.ok !== true) p.push(`refundSale → ${codeOf(r)} ${short(r?.message ?? "", 60)} (probe ${codeOf(probe)} ${amt})`);
    else MY_SALES.push(String(r.refund?.id ?? ""));
    await drain();
    if ((await snap(S15.sid, String(PLAN15?.splitId ?? ""))) !== s0) p.push("คืนเงินแล้วแผน/ใบ/รายการ/session เปลี่ยน");
    chk("X3", p.length === 0, "คืนเงินบรรทัดของบิลใบไม่แตะแผน/โต๊ะ", FX(P8(p) || "ครบ"));
  });
  await step("X4", async () => {
    const p: string[] = [];
    const op = await tbl("registerOpenTable", ctxA(), A("OWNER"), { tableId: TB.A5, guestCount: 2 });
    if (op?.ok !== true || op.created !== true) p.push(`เปิด A5 ให้ลูกค้าใหม่ → ${codeOf(op)} created ${short(op?.created)}`);
    const c0 = await counts();
    const v = await voidSale(PAID.p1 ?? "");
    if (v?.ok !== true) p.push(`void บิลใบ 1 → ${codeOf(v)} ${short(v?.message ?? "", 60)}`);
    const parts = await partRows(String(PLAN15?.splitId ?? ""));
    if (parts[0]?.status !== "OPEN" || parts[0]?.saleId !== null) p.push(`ใบ 1 ${short([parts[0]?.status, parts[0]?.saleId], 60)} (คาด OPEN · null)`);
    if ((await sessRow(S15.sid))?.status !== "CLOSED" || (await openSessCount(TB.A5!)) !== 1) p.push(`session เดิม ${(await sessRow(S15.sid))?.status} · OPEN บน A5 ${await openSessCount(TB.A5!)} (คาด CLOSED · 1)`);
    const pid = String(partOf(PLAN15, 1)?.id ?? "");
    const q = await pq(pid);
    const pay = await ppay(pid, { ok: true, grandTotalSatang: 74250, split: { version: Number((await planRow(String(PLAN15?.splitId ?? "")))?.version ?? 1) } });
    if (!refused(q, "TABLE_SESSION_CLOSED") || !refused(pay.r, "TABLE_SESSION_CLOSED")) p.push(`ใบ 1 หลังโต๊ะเปิดให้ลูกค้าใหม่: quote ${codeOf(q)} · จ่าย ${codeOf(pay.r)} (คาด TABLE_SESSION_CLOSED)`);
    const c1 = await counts();
    if (c1.sale !== c0.sale) p.push(`บิล ${c0.sale}→${c1.sale}`);
    chk("X4", p.length === 0, "void ใบหลังโต๊ะมีลูกค้าใหม่ → ใบเปิดแต่จ่ายไม่ได้ (session ปิด)", FX(P8(p) || "ครบ"));
  });
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 1 ruling 1 · pos-P2.5-review.md F1/N1)
  await step("X5", async () => {
    const p: string[] = [];
    const s = await seat("X5", { guestCount: 2, lines: [ml("kaprao", 1), ml("chayen", 1)] });
    const pl1 = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }));
    const h = await hold(s.sid, [ml("latte", 1)]); // รอบร่าง = จ่ายครบแล้ว session ยัง OPEN
    const a = await payPart(pl1, 1);
    const b = await payPart(pl1, 2);
    const sent = await tbl("registerSendTableRound", ctxA(DEV1), A("OWNER"), { tableSessionId: s.sid, heldCartId: String(h?.heldCart?.id ?? "") });
    const pl2 = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }));
    if (!a.saleId || !b.saleId || sent?.ok !== true || !pl2 || (await planRow(String(pl1?.splitId ?? "")))?.status !== "DONE") throw new Error(`(fixture) ใบ ${codeOf(a.r)}/${codeOf(b.r)} · ส่งรอบ ${codeOf(sent)} · แผนใหม่ ${pl2 ? "ok" : "ไม่มี"}`);
    const v = await voidSale(a.saleId);
    if (v?.ok !== true) p.push(`void บิลใบ 1 ของแผนเก่า → ${codeOf(v)}`);
    const evs = ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "pos.sale.voided" } }).catch(() => [])) as Any[]).filter((e) => isRecord(e.payload) && e.payload.saleId === a.saleId);
    if (evs.length !== 1 || evs[0].status !== "DONE") p.push(`event voided ${short(evs.map((e) => e.status))} (คาด DONE)`);
    const parts = await partRows(String(pl1?.splitId ?? ""));
    if (parts[0]?.status !== "OPEN" || parts[0]?.saleId !== null || parts[1]?.status !== "PAID") p.push(`ใบแผนเก่า ${short(parts.map((x) => [x.no, x.status, x.saleId ? "sale" : null]))} (คาด ใบ 1 OPEN · ใบ 2 PAID)`);
    const r1 = await planRow(String(pl1?.splitId ?? ""));
    const r2 = await planRow(String(pl2?.splitId ?? ""));
    if (r1?.status !== "DONE" || r2?.status !== "OPEN" || r2?.version !== pl2?.version) p.push(`แผนเก่า ${r1?.status} (คาด DONE) · แผนใหม่ ${r2?.status} v${r2?.version}`);
    const its = await itemsOf(s.sid);
    const old = [s.it.kaprao, s.it.chayen].map((id) => its.find((x) => x.id === id));
    if (old.some((x) => !x || x.saleId !== null || x.settledAt !== null)) p.push(`รายการของใบ 1 ยังผูกบิล ${short(old.map((x) => (x?.saleId ? "sale" : null)))}`);
    if ((await sessRow(s.sid))?.status !== "OPEN") p.push(`session ${(await sessRow(s.sid))?.status} (คาด OPEN)`);
    chk("X5", p.length === 0, "void ใบของแผน DONE ขณะมีแผนใหม่ OPEN → ตัวรับจบ · ใบ OPEN · แผนเก่า DONE · รายการหลุด", FX(P8(p) || "ครบ"));
  });
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 2 ruling 3 · F3)
  await step("X5b", async () => {
    const p: string[] = [];
    const b = fnBody(stripComments(rd(F.table)), "tableSaleVoided");
    const at = b.indexOf("once(false)");
    const tail = at < 0 ? "" : b.slice(at);
    const ci = tail.search(/catch\s*\(\s*(\w+)\s*\)/);
    const cv = ci < 0 ? "" : (/catch\s*\(\s*(\w+)\s*\)/.exec(tail.slice(ci))?.[1] ?? "");
    const blk = ci < 0 ? "" : tail.slice(ci);
    const iConf = cv ? blk.search(new RegExp(`isTxConflict\\(\\s*${cv}\\s*\\)`)) : -1;
    const iThrow = cv ? blk.search(new RegExp(`throw\\s+${cv}\\b`)) : -1;
    const iAudit = blk.indexOf("pos.table.split.voidConflict");
    if (at < 0 || !cv) p.push("ไม่พบการลองซ้ำแบบไม่เปิดแผน (once(false)) + catch");
    else if (iConf < 0 || iAudit < 0 || iConf > iAudit || iThrow < 0 || iThrow > iAudit) p.push(`catch(${cv}): isTxConflict@${iConf} throw@${iThrow} audit@${iAudit} (คาด isTxConflict + throw ก่อน audit)`);
    chk("X5b", p.length === 0, "ลองซ้ำที่ยังชน (deadlock/write conflict) โยนต่อ · audit เฉพาะทางที่ไม่ใช่ชนกัน", P8(p) || "ครบ");
  });

  // ════════ P6 รอบระหว่างแผน + ครัว ════════
  await step("P6", async () => {
    const p: string[] = [];
    const s = await seat("B5", { guestCount: 2, lines: [ml("tomyum", 1), ml("kaprao", 1), ml("chayen", 1)] });
    const st = await call(kdsMod, "kdsStart", ctxA(DEV1), A("OWNER"), { orderId: s.orderId, stationId: ST.hot });
    const hot = [s.it.tomyum, s.it.kaprao].filter(Boolean) as string[];
    const kds0 = (await Promise.all(hot.map(itemRow))).map((x) => x?.kdsStatus);
    if (st?.ok !== true || kds0.some((k) => k !== "COOKING")) p.push(`(fixture) kdsStart → ${codeOf(st)} สถานะ ${kds0.join(",")}`);
    const pl = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }));
    if (!pl) p.push("สร้างแผน EQUAL 2 ไม่ได้");
    const kds1 = (await Promise.all(hot.map(itemRow))).map((x) => x?.kdsStatus);
    if (short(kds1) !== short(kds0)) p.push(`แยกบิลแล้วสถานะครัวเปลี่ยน ${kds0.join(",")} → ${kds1.join(",")}`);
    const r2 = await sendRound(s.sid, [ml("latte", 1)]).catch((e: Error) => ({ orderId: "", itemIds: [] as string[], err: e.message }));
    const det = await sp("registerSplitDetail", ctxA(), A("OWNER"), { tableSessionId: s.sid });
    if (!r2.itemIds.length || det?.ok !== true || setStr(det.outsideItemIds ?? []) !== setStr(r2.itemIds) || det.split?.splitId !== pl?.splitId) p.push(`ส่งรอบหลังแยก → ${r2.itemIds.length} รายการ · outsideItemIds ${short(det?.outsideItemIds, 60)} (คาด = รายการใหม่)`);
    const orders0 = Number(await P.restaurantOrder.count({ where: { tenantId: T } }).catch(() => -1));
    const a = await payPart(pl, 1);
    const b = await payPart(pl, 2);
    if (!a.saleId || !b.saleId) p.push(`จ่ายใบ → ${codeOf(a.r)} / ${codeOf(b.r)}`);
    if ((await planRow(String(pl?.splitId ?? "")))?.status !== "DONE" || (await sessRow(s.sid))?.status !== "OPEN") p.push(`หลังจ่ายครบ แผน ${(await planRow(String(pl?.splitId ?? "")))?.status} · session ${(await sessRow(s.sid))?.status} (คาด DONE · OPEN)`);
    const q = await wq(s.sid);
    if (q?.ok !== true || setStr(q.table?.itemIds ?? []) !== setStr(r2.itemIds) || q.grandTotalSatang !== 8250) p.push(`quote ทั้งโต๊ะหลัง DONE → ${codeOf(q)} ${short({ ids: q?.table?.itemIds?.length, g: q?.grandTotalSatang }, 60)} (คาด เฉพาะลาเต้ · 8250)`);
    const td = await call(kdsMod, "kdsTicketDone", ctxA(DEV1), A("OWNER"), { orderId: s.orderId, stationId: ST.hot });
    if (td?.ok !== true || !(Number(td.changed) > 0)) p.push(`kdsTicketDone หลังจ่ายใบ → ${codeOf(td)} changed ${short(td?.changed)}`);
    const orders1 = Number(await P.restaurantOrder.count({ where: { tenantId: T } }).catch(() => -1));
    await call(kdsMod, "healMissingTickets", T, U.A);
    const orders2 = Number(await P.restaurantOrder.count({ where: { tenantId: T } }).catch(() => -1));
    if (orders1 !== orders0 || orders2 !== orders0) p.push(`RestaurantOrder ${orders0} → หลังจ่าย ${orders1} → หลัง heal ${orders2} (คาดไม่เพิ่ม)`);
    // ยกเลิกรายการในแผนผ่านประตูเดิม → จ่ายใบ TABLE_ITEMS_CHANGED ไม่เขียน
    const s2 = await seat("B4", { guestCount: 2, lines: [ml("rice", 1), ml("kaprao", 1)] });
    const pl2 = splitOf(await mkSplit(s2.sid, { mode: "EQUAL", partCount: 2 }));
    const lc = await rorder.cancelOrderItem(T, U.A, s2.it.kaprao ?? "none", "ครัวทำไม่ได้", uid("OWNER"));
    const c0 = await counts();
    const x = await payPart(pl2, 1);
    const c1 = await counts();
    if (lc?.ok !== true || !refused(x.r, "TABLE_ITEMS_CHANGED") || c1.sale !== c0.sale || c1.seq !== c0.seq) p.push(`ยกเลิกผ่านประตูเดิม ${short(lc, 40)} → จ่ายใบ ${codeOf(x.r)} · บิล ${c0.sale}→${c1.sale} (คาด TABLE_ITEMS_CHANGED ไม่มีบิล)`);
    chk("P6", NS(["registerSplitTable", "registerSplitDetail"]) === "" && p.length === 0, "ครัวไม่ถูกแตะ · รอบใหม่อยู่นอกแผน · DONE ไม่ปิดโต๊ะ · ไม่มีรอบครัวจากบิลใบ", FX(NS(["registerSplitTable", "registerSplitDetail"]) + (P8(p) || "ครบ")));
  });
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 1 ruling 2 · pos-P2.5-review.md N2)
  await step("P7", async () => {
    const p: string[] = [];
    const act = stripComments(rd("src/lib/actions/restaurant.ts"));
    const body = (n: string) => {
      const m = new RegExp(`export\\s+async\\s+function\\s+${n}\\b`).exec(act);
      if (!m) return "";
      const rest = act.slice(m.index + m[0].length);
      const nx = rest.search(/\nexport\s/);
      return nx < 0 ? rest : rest.slice(0, nx);
    };
    for (const [fn, guard, door] of [["checkoutAction", "legacyCheckoutSplitGuard", "order.checkout("], ["confirmPromptpayPaymentAction", "legacyCheckoutSplitGuard", "order.checkout("], ["cancelOrderItemAction", "legacyCancelItemSplitGuard", "order.cancelOrderItem("]] as const) {
      const b = body(fn);
      const gi = b.search(new RegExp(`\\b${guard}\\s*\\(`));
      const di = b.indexOf(door);
      if (!b || gi < 0 || di < 0 || gi > di) p.push(`${fn}: ${guard} ${gi < 0 ? "ไม่ถูกเรียก" : "อยู่หลังประตูเดิม"}`);
    }
    const s = await seat("P7", { guestCount: 2, lines: [ml("kaprao", 1), ml("chayen", 1)] });
    const free = await seat("P7b", { guestCount: 2, lines: [ml("kaprao", 1)] });
    const pl = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }));
    const a = await payPart(pl, 1);
    if (!a.saleId) throw new Error(`(fixture) จ่ายใบ 1 ${codeOf(a.r)}`);
    const c0 = await counts();
    const s0 = await snap(s.sid, String(pl?.splitId ?? ""));
    const g1 = await sp("legacyCheckoutSplitGuard", { tenantId: T, unitId: U.A, sessionId: s.sid });
    const g2 = await sp("legacyCancelItemSplitGuard", { tenantId: T, unitId: U.A, itemId: s.it.kaprao ?? "none" });
    const g3 = await sp("legacyCheckoutSplitGuard", { tenantId: T, unitId: U.A, sessionId: free.sid });
    const g4 = await sp("legacyCancelItemSplitGuard", { tenantId: T, unitId: U.A, itemId: free.it.kaprao ?? "none" });
    if (g1?.ok !== false || typeof g1?.reason !== "string" || !g1.reason) p.push(`ตัวกันเช็คบิล (มีแผน) → ${short(g1, 80)} (คาด ok:false + reason)`);
    if (g2?.ok !== false || typeof g2?.reason !== "string" || !g2.reason) p.push(`ตัวกันยกเลิกรายการในแผน → ${short(g2, 80)} (คาด ok:false + reason)`);
    if (g3?.ok !== true || g4?.ok !== true) p.push(`โต๊ะไม่มีแผน → เช็คบิล ${short(g3, 40)} · ยกเลิก ${short(g4, 40)} (คาด ok:true)`);
    const c1 = await counts();
    if (c1.sale !== c0.sale || c1.seq !== c0.seq) p.push(`บิล ${c0.sale}→${c1.sale}`);
    if ((await snap(s.sid, String(pl?.splitId ?? ""))) !== s0) p.push("แผน/รายการ/session เปลี่ยน");
    chk("P7", p.length === 0, "หน้าเดิมกันเช็คบิล/ยกเลิกรายการขณะแผนเปิด · ไม่มีบิล", FX(P8(p) || "ครบ"));
  });
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 2 ruling 1 · F1)
  await step("P8", async () => {
    const p: string[] = [];
    const src = stripComments(rd("src/lib/ai/proposals.ts"));
    const i0 = src.indexOf('kind === "restaurant_close_bill"');
    const blk = i0 < 0 ? "" : src.slice(i0, src.indexOf("\n  if (kind ===", i0 + 10));
    const gi = blk.search(/\blegacyCheckoutSplitGuard\s*\(/);
    const di = blk.indexOf("restaurantSvc.checkout(");
    if (gi < 0 || di < 0 || gi > di) p.push(`proposals.ts restaurant_close_bill: legacyCheckoutSplitGuard ${gi < 0 ? "ไม่ถูกเรียก" : "อยู่หลัง checkout"}`);
    const proposals = await tryImport("@/lib/ai/proposals");
    const m: Any = { role: "OWNER", unitAccess: ["*"], permissions: {} };
    const s = await seat("P8", { guestCount: 2, lines: [ml("kaprao", 1), ml("chayen", 1)] });
    const pl = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }));
    const a = await payPart(pl, 1);
    if (!a.saleId) throw new Error(`(fixture) จ่ายใบ 1 ${codeOf(a.r)}`);
    const c0 = await counts();
    const s0 = await snap(s.sid, String(pl?.splitId ?? ""));
    const r = await call(proposals, "runKind", m, T, "restaurant_close_bill", { unitName: `${TAG} สาขาA`, tableName: "P8", payMethod: "CASH" }, `${KEY_PREFIX}-p8`, uid("OWNER"));
    // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 LEG-3 · CD-B4): สาขา A ผูก POS ⇒ ผู้ช่วยปฏิเสธ POS_LINKED ก่อนตัวกันแผน — นับเป็นการปฏิเสธ (ไม่มีบิล · แผน/โต๊ะเดิม)
    if (!(r?.ok === false && ((r.threw && /แยกบิล/.test(String(r.message ?? ""))) || r.code === "POS_LINKED" || /POS_LINKED/.test(String(r.message ?? ""))))) p.push(`ปิดบิลด้วยผู้ช่วย ขณะแผน OPEN → ${short(r, 100)} (คาด โยนเหตุผลของตัวกัน หรือ POS_LINKED)`);
    const c1 = await counts();
    if (c1.sale !== c0.sale) p.push(`บิล ${c0.sale}→${c1.sale}`);
    if ((await snap(s.sid, String(pl?.splitId ?? ""))) !== s0 || (await planRow(String(pl?.splitId ?? "")))?.status !== "OPEN") p.push("รายการ/แผน/session เปลี่ยน");
    // ตัวควบคุม: โต๊ะไม่มีแผน → ปิดบิลด้วยผู้ช่วยได้
    const q = await seat("Q8", { guestCount: 2, lines: [ml("kaprao", 1)] });
    const before = (await counts()).sale;
    const ok = await call(proposals, "runKind", m, T, "restaurant_close_bill", { unitName: `${TAG} สาขาA`, tableName: "Q8", payMethod: "CASH" }, `${KEY_PREFIX}-q8`, uid("OWNER"));
    // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 LEG-3 · CD-B4): สาขาที่ผูก POS = POS_LINKED แม้โต๊ะไม่มีแผน — ไม่มีบิล · โต๊ะยัง OPEN
    if (!(ok?.ok === false && (ok?.code === "POS_LINKED" || /POS_LINKED/.test(String(ok?.message ?? "")))) || (await counts()).sale !== before || (await sessRow(q.sid))?.status !== "OPEN") p.push(`(สาขาผูก POS) โต๊ะไม่มีแผน → ${short(ok, 100)} · บิล ${before}→${(await counts()).sale} · session ${(await sessRow(q.sid))?.status} (คาด POS_LINKED · ไม่มีบิล · OPEN)`);
    chk("P8", p.length === 0, "ผู้ช่วย AI ปิดบิลโต๊ะที่แยกบิลอยู่ไม่ได้ · สาขาผูก POS = POS_LINKED ไม่มีบิล โต๊ะยังเปิด", FX(P8(p) || "ครบ")); // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 LEG-3 · CD-B4)
  });

  // ════════ C แข่งกัน (ธุรกรรมที่สามถือล็อก) ════════
  console.log("\n── C แข่งกัน (ธุรกรรมที่สามถือล็อก · pg_blocking_pids) ──");
  await step("C1", async () => {
    const p: string[] = [];
    const s = await seat("C1");
    const h = await hashOf(s.sid);
    const hl = await holdLock(LOCK_ITEM, [lowestItem(s)], [() => mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }, "OWNER", ctxA(DEV1), h), () => mkSplit(s.sid, { mode: "EQUAL", partCount: 3 }, "MGR", ctxA(DEV2), h)]);
    const win = hl.res.filter((r) => r?.ok === true);
    const ex = hl.res.filter((r) => refused(r, "TABLE_SPLIT_EXISTS"));
    if (hl.blocked < 1) p.push("ไม่มีใครรอล็อกรายการ (การสร้างแผนต้องล็อกรายการก่อน · R5)");
    if (win.length !== 1 || ex.length !== 1) p.push(`ผล ${hl.res.map(codeOf).join(",")} (คาด OK + TABLE_SPLIT_EXISTS)`);
    else if (ex[0].splitId !== splitOf(win[0])?.splitId) p.push("TABLE_SPLIT_EXISTS ไม่บอก splitId ของผู้ชนะ");
    if ((await openPlans(s.sid)) !== 1) p.push(`แผน OPEN ${await openPlans(s.sid)} (คาด 1)`);
    chk("C1", NS(["registerSplitTable"]) === "" && p.length === 0, "สร้างพร้อมกัน = แผนเดียว", FX(NS(["registerSplitTable"]) + (P8(p) || `ครบ (รอ ${hl.blocked} · ถือ ${hl.heldMs} ms)`)));
  });
  await step("C2", async () => {
    const p: string[] = [];
    const s = await seat("C2");
    const pl = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }));
    const pid = String(partOf(pl, 1)?.id ?? "");
    const q1 = await pq(pid, {}, ctxA(DEV1));
    const q2 = await pq(pid, {}, ctxA(DEV2));
    await drain();
    const c0 = await counts();
    const t0 = new Date(Date.now() - 1000);
    const hl = await holdLock(LOCK_ITEM, [lowestItem(s)], [() => ppay(pid, q1, { ctx: ctxA(DEV1) }).then((x) => x.r), () => ppay(pid, q2, { ctx: ctxA(DEV2) }).then((x) => x.r)]);
    const win = hl.res.find((r) => r?.ok === true);
    const lost = hl.res.filter((r) => refused(r, "TABLE_SPLIT_PART_PAID")).length;
    if (hl.blocked < 1) p.push("ไม่มีใครรอล็อกรายการ");
    if (!win || lost !== 1) p.push(`ผล ${hl.res.map(codeOf).join(",")} (คาด OK + TABLE_SPLIT_PART_PAID)`);
    const c1 = await counts();
    if (c1.sale - c0.sale !== (win ? 1 : 0) || c1.pay - c0.pay !== (win ? 1 : 0) || c1.seq - c0.seq !== (win ? 1 : 0)) p.push(`Δ PosSale ${c1.sale - c0.sale} · PosPayment ${c1.pay - c0.pay} · เลข ${c1.seq - c0.seq}`);
    if (win) {
      const extra = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND "createdAt" >= $2 AND payload::text NOT LIKE $3`, T, t0, `%${win.saleId}%`).catch(() => [{ n: -1 }])) as Any[];
      if (Number(extra[0]?.n) !== 0) p.push(`OutboxEvent ที่ไม่ใช่ของบิลผู้ชนะ ${extra[0]?.n}`);
    }
    chk("C2", NS(["registerSplitTable"]) === "" && p.length === 0, "จ่ายใบเดียวกันพร้อมกัน = บิลเดียว", FX(NS(["registerSplitTable"]) + (P8(p) || `ครบ (รอ ${hl.blocked})`)));
  });
  await step("C3", async () => {
    const p: string[] = [];
    const s = await seat("C3");
    const pl = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }));
    const [i1, i2] = [String(partOf(pl, 1)?.id ?? ""), String(partOf(pl, 2)?.id ?? "")];
    const q1 = await pq(i1, {}, ctxA(DEV1));
    const q2 = await pq(i2, {}, ctxA(DEV2));
    const hl = await holdLock(LOCK_ITEM, [lowestItem(s)], [() => ppay(i1, q1, { ctx: ctxA(DEV1) }).then((x) => x.r), () => ppay(i2, q2, { ctx: ctxA(DEV2) }).then((x) => x.r)]);
    const ids = hl.res.filter((r) => r?.ok === true).map((r) => String(r.saleId));
    if (hl.blocked < 1) p.push("ไม่มีใครรอล็อกรายการ");
    if (ids.length !== 2 || ids[0] === ids[1]) p.push(`ผล ${hl.res.map(codeOf).join(",")} (คาด OK ทั้งคู่ คนละบิล)`);
    const its = await itemsOf(s.sid);
    const sales = new Set(its.map((x) => x.saleId));
    if (its.some((x) => !x.saleId) || sales.size !== 1 || !ids.includes(String([...sales][0]))) p.push(`รายการผูกบิล ${short([...sales].map((x) => (x ? String(x).slice(-6) : null)), 60)} (คาดบิลเดียว = ใบที่จ่ายครบ)`);
    const t = await tableRow(TB.C3!);
    if ((await planRow(String(pl?.splitId ?? "")))?.status !== "DONE" || (await sessRow(s.sid))?.status !== "CLOSED" || !(t?.dirtySince instanceof Date)) p.push(`แผน ${(await planRow(String(pl?.splitId ?? "")))?.status} · session ${(await sessRow(s.sid))?.status} · dirty ${short(t?.dirtySince, 30)}`);
    chk("C3", NS(["registerSplitTable"]) === "" && p.length === 0, "คนละใบพร้อมกัน = 2 บิล · ปิดโต๊ะครั้งเดียว", FX(NS(["registerSplitTable"]) + (P8(p) || `ครบ (รอ ${hl.blocked})`)));
  });
  await step("C4", async () => {
    const p: string[] = [];
    for (const first of ["plan", "pay"] as const) {
      const s = await seat(first === "plan" ? "C4" : "C5");
      const q = await wq(s.sid);
      const key = newKey("c4");
      const plan = () => mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }, "OWNER", ctxA(DEV1), String(q?.table?.itemsHash ?? "none"));
      const pay = () => wpay(s.sid, q, { key, ctx: ctxA(DEV2) }).then((x) => x.r);
      const hl = await holdLock(LOCK_ITEM, [lowestItem(s)], first === "plan" ? [plan, pay] : [pay, plan]);
      const [rp, rw] = first === "plan" ? hl.res : [hl.res[1], hl.res[0]];
      const planOk = rp?.ok === true;
      const payOk = rw?.ok === true;
      const sales = Number(await P.posSale.count({ where: { tenantId: T, idempotencyKey: { endsWith: key } } }).catch(() => -1));
      const plans = await openPlans(s.sid);
      if (hl.blocked < 1) p.push(`${first} ก่อน: ไม่มีใครรอล็อกรายการ`);
      if (planOk === payOk) p.push(`${first} ก่อน: แผน ${codeOf(rp)} · จ่าย ${codeOf(rw)} (คาดผู้ชนะคนเดียว)`);
      if (planOk && (!refused(rw, "TABLE_SPLIT_OPEN") || sales !== 0 || plans !== 1)) p.push(`${first} ก่อน: แผนชนะ แต่จ่าย ${codeOf(rw)} · บิล ${sales} · แผน OPEN ${plans}`);
      if (payOk && (sales !== 1 || plans !== 0)) p.push(`${first} ก่อน: จ่ายชนะ แต่บิล ${sales} · แผน OPEN ${plans}`);
      if (first === "plan" && !planOk) p.push(`plan ก่อน: แผน (เข้าคิวก่อน) ไม่ชนะ ${codeOf(rp)}`);
      if (first === "pay" && !payOk) p.push(`pay ก่อน: จ่าย (เข้าคิวก่อน) ไม่ชนะ ${codeOf(rw)}`);
    }
    chk("C4", NS(["registerSplitTable"]) === "" && p.length === 0, "แผน ⇄ จ่ายทั้งโต๊ะ = ผู้ชนะคนเดียวตามลำดับคิว (สองลำดับ)", FX(NS(["registerSplitTable"]) + (P8(p) || "ครบ (สองลำดับ)")));
  });
  await step("C5", async () => {
    const p: string[] = [];
    // (a) ย้าย ⇄ เปิดโต๊ะปลายทาง
    const s = await seat("M1", { lines: [ml("rice", 1)] });
    await mkT("M2");
    const hl = await holdLock(LOCK_TABLE_SQL, [`restaurant-table:${TB.M2}`], [
      () => tbl("registerMoveTable", ctxA(), A("WAITER"), { tableSessionId: s.sid, toTableId: TB.M2 }),
      () => tbl("registerOpenTable", ctxA(), A("OWNER"), { tableId: TB.M2, guestCount: 2 }),
    ]);
    const [mv, op] = hl.res;
    const n = await openSessCount(TB.M2!);
    const okA = mv?.ok === true && op?.ok === true && op.created === false && String(op.sessionId) === s.sid;
    const okB = op?.ok === true && op.created === true && refused(mv, "TABLE_BUSY");
    if (hl.blocked < 1) p.push("(a) ไม่มีใครรอล็อกโต๊ะปลายทาง (ย้ายต้องถือล็อกโต๊ะทั้งสอง · R7)");
    if (n !== 1 || !(okA || okB)) p.push(`(a) OPEN บน M2 ${n} · ย้าย ${codeOf(mv)} · เปิด ${codeOf(op)} created ${short(op?.created)} (คาด 1 แถว และผลสอดคล้อง)`);
    // (b) ย้าย ⇄ จ่าย session เดียวกัน (ย้ายเข้าคิวก่อน)
    const s2 = await seat("M3", { lines: [ml("rice", 1)] });
    await mkT("M4");
    const q = await wq(s2.sid);
    const hb = await holdLock(LOCK_SESSION, [s2.sid], [
      () => tbl("registerMoveTable", ctxA(), A("WAITER"), { tableSessionId: s2.sid, toTableId: TB.M4 }),
      () => wpay(s2.sid, q, { ctx: ctxA(DEV2) }).then((x) => x.r),
    ]);
    const [mv2, pay2] = hb.res;
    const ss = await sessRow(s2.sid);
    const t3 = await tableRow(TB.M3!);
    if (hb.blocked < 1) p.push("(b) ไม่มีใครรอแถว session");
    if (mv2?.ok !== true || pay2?.ok !== true || ss?.tableId !== TB.M4 || ss?.status !== "CLOSED" || !(t3?.dirtySince instanceof Date)) p.push(`(b) ย้าย ${codeOf(mv2)} ${short(mv2?.message ?? "", 40)} · จ่าย ${codeOf(pay2)} ${short(pay2?.message ?? "", 40)} · session ${ss?.status} บน ${ss?.tableId === TB.M4 ? "M4" : "M3"} · M3 dirty ${short(t3?.dirtySince, 30)}`);
    chk("C5", NS(["registerMoveTable"]) === "" && p.length === 0, "ย้าย ⇄ เปิดโต๊ะ = OPEN แถวเดียว · ย้าย ⇄ จ่าย = ok ทั้งคู่ (ไม่ deadlock)", FX(NS(["registerMoveTable"]) + (P8(p) || "ครบ")));
  });
  await step("C6", async () => {
    const p: string[] = [];
    const into = await seat("G1", { lines: [ml("rice", 1)] });
    const from = await seat("G2", { lines: [ml("kaprao", 1)] });
    const i1 = from.it.kaprao ?? "";
    await hold(from.sid, [ml("chayen", 1)]); // รอบร่าง HELD = จ่ายแล้วโต๊ะต้นทางยังเปิด
    const x = await wpay(from.sid, await wq(from.sid));
    const X = x.r?.ok === true ? String(x.r.saleId) : "";
    const held = ((await P.posHeldCart.findMany({ where: { tenantId: T } }).catch(() => [])) as Any[]).find((r) => r.tableSessionId === from.sid && r.status === "HELD");
    const sent = await tbl("registerSendTableRound", ctxA(DEV1), A("OWNER"), { tableSessionId: from.sid, heldCartId: String(held?.id ?? "") });
    const i2 = String(((sent?.itemIds ?? []) as string[])[0] ?? "");
    if (!X || !i2 || (await sessRow(from.sid))?.status !== "OPEN") throw new Error(`(fixture) บิลบางส่วน ${codeOf(x.r)} · ส่งรอบ ${codeOf(sent)} · session ${(await sessRow(from.sid))?.status}`);
    const q2 = await wq(from.sid);
    const hl = await holdLock(LOCK_ITEM, [i2], [
      () => wpay(from.sid, q2, { ctx: ctxA(DEV2) }).then((y) => y.r),
      () => tbl("registerMergeTables", ctxA(), A("WAITER"), { intoSessionId: into.sid, fromSessionIds: [from.sid] }),
    ]);
    const [pay, mg] = hl.res;
    const it2 = await itemRow(i2);
    const linesFor = Number(await P.posSaleLine.count({ where: { tenantId: T, sale: { sourceId: { in: [from.sid, into.sid] }, status: "PAID" }, productId: PP.chayen } }).catch(() => -1));
    const payThenMerge = pay?.ok === true && mg?.ok === true && it2?.saleId === String(pay.saleId);
    const mergeThenPay = mg?.ok === true && refused(pay, "TABLE_ITEMS_CHANGED") && it2?.saleId === null;
    if (hl.blocked < 1) p.push("ไม่มีใครรอล็อกรายการ");
    if (!(payThenMerge || mergeThenPay)) p.push(`จ่าย ${codeOf(pay)} ${short(pay?.message ?? "", 40)} · รวม ${codeOf(mg)} ${short(mg?.message ?? "", 40)} · I2 saleId ${short(it2?.saleId ?? null, 12)} (คาด จ่ายแล้วรวม หรือ รวมแล้วจ่าย TABLE_ITEMS_CHANGED · ไม่ deadlock)`);
    if (linesFor > 1) p.push(`ชาไทย (I2) อยู่ในบิล PAID ${linesFor} ใบ`);
    const fs = await sessRow(from.sid);
    if (fs?.status !== "MERGED" || fs?.mergedIntoId !== into.sid) p.push(`ต้นทาง ${fs?.status} (คาด MERGED → ปลายทาง)`);
    const v = await voidSale(X);
    const it1 = await itemRow(i1);
    const qi = await wq(into.sid);
    const listed = qi?.ok === true && ((qi.table?.itemIds ?? []) as string[]).includes(i1);
    if (v?.ok !== true || it1?.saleId !== null || !listed) p.push(`void บิลบางส่วนเดิม ${codeOf(v)} · I1 saleId ${it1?.saleId ? "ยังผูก" : "null"} · quote ปลายทาง ${codeOf(qi)} มี I1 ${listed}`);
    chk("C6", NS(["registerMergeTables"]) === "" && p.length === 0, "รวม ⇄ จ่ายต้นทาง = ลำดับใดก็ได้ ไม่มีสองบิล ไม่ deadlock · บิลเดิม void แล้วกลับมาค้างที่ปลายทาง", FX(NS(["registerMergeTables"]) + (P8(p) || `ครบ (${payThenMerge ? "จ่ายแล้วรวม" : "รวมแล้วจ่าย"})`)));
  });
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 2 ruling 4 · hunter Low)
  await step("C7", async () => {
    const p: string[] = [];
    const gcMod = await tryImport("@/lib/modules/giftcard");
    const gctx: Any = { tenantId: T, systemId: S.MEM, posSystemId: S.POS, actorUserId: uid("OWNER") };
    const own: Any = A("OWNER");
    await gcMod.setSettings(gctx, own, { enabled: true, accountingLink: false });
    const sell = async (k: string) => {
      const r = await gcMod.sell(gctx, own, { satang: 50_000, payMethods: [{ type: "CASH", amountSatang: 50_000 }], unitId: U.A, recipient: { print: true }, idempotencyKey: `${KEY_PREFIX}-gc-${k}` });
      if (!r?.giftCardId) throw new Error(`(fixture) ขายบัตร ${k}: ${short(r, 80)}`);
      return { id: String(r.giftCardId), number: String(r.number), pin: String(r.pin) };
    };
    const bad = await sell("bad");
    const good = await sell("good");
    const probe = await sell("probe"); // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU i): บัตรของ probe NOWAIT ◂
    await drain();
    const s = await seat("C7", { guestCount: 2, lines: [ml("kaprao", 1), ml("chayen", 1)] });
    const pl = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }));
    const pid = String(partOf(pl, 1)?.id ?? "");
    const q = await pq(pid);
    const grand = q?.ok === true ? Number(q.grandTotalSatang) : 0;
    if (!pl || !grand) throw new Error(`(fixture) แผน/quote ${codeOf(q)}`);
    const sub = (k: string, card: { number: string }, pin: string) =>
      call(register, "submitRegisterSale", ctxA(DEV2), A("OWNER"), { lines: [], tableSplitPartId: pid, expectedSplitVersion: Number(pl.version), idempotencyKey: k, expectedGrandTotalSatang: grand, payMethods: [{ type: "GIFT_CARD", amountSatang: grand, giftCard: { number: card.number, pin } }] });
    const keys = Array.from({ length: 10 }, () => newKey("c7"));
    const pins = Array.from({ length: 10 }, (_, i) => String(200000 + i * 7919).slice(-6)).map((x) => (x === bad.pin ? "000002" : x));
    const rs = await Promise.all(keys.map((k, i) => sub(k, bad, pins[i]!)));
    const codes = rs.map(codeOf);
    const c = await P.giftCard.findUnique({ where: { id: bad.id } }).catch(() => null);
    const sales = Number(await P.posSale.count({ where: { tenantId: T, OR: keys.map((k) => ({ idempotencyKey: { endsWith: k } })) } }).catch(() => -1));
    if (codes.some((x) => x !== "GIFT_CARD_PIN" && x !== "GIFT_CARD_LOCKED") || !codes.includes("GIFT_CARD_LOCKED")) p.push(`คำตอบ ${[...new Set(codes)].join(",")} (คาด PIN/LOCKED เท่านั้น · มี LOCKED)`);
    if (c?.pinFailedCount !== 5 || !(c?.pinLockedUntil instanceof Date) || c?.balanceSatang !== 50_000) p.push(`บัตร ตัวนับ ${c?.pinFailedCount} · ล็อก ${short(c?.pinLockedUntil, 30)} · ยอด ${c?.balanceSatang}`);
    if (sales !== 0 || (await partRows(String(pl.splitId)))[0]?.status !== "OPEN") p.push(`บิล ${sales} · ใบ 1 ${(await partRows(String(pl.splitId)))[0]?.status}`);
    // ตัวควบคุม: บัตรใหม่ PIN ถูก → จ่ายใบได้ครั้งเดียว
    const k1 = newKey("c7ok");
    const ok1 = await sub(k1, good, good.pin);
    if (ok1?.ok === true) MY_SALES.push(String(ok1.saleId));
    const ok2 = await sub(newKey("c7ok"), good, good.pin);
    const g2 = await P.giftCard.findUnique({ where: { id: good.id } }).catch(() => null);
    if (ok1?.ok !== true || !refused(ok2, "TABLE_SPLIT_PART_PAID") || g2?.balanceSatang !== 50_000 - grand) p.push(`(ตัวควบคุม) PIN ถูก → ${codeOf(ok1)} ${short(ok1?.message ?? "", 40)} · ซ้ำ ${codeOf(ok2)} · ยอดบัตร ${g2?.balanceSatang}`);
    // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU i · มติ 5): probe NOWAIT บนใบ 2 (ใบ 1 จ่ายแล้วโดยตัวควบคุม) — ธุรกรรมที่สามถือแถวบัตร probe FOR UPDATE · ยิงคำขอ PIN ผิด 1 รายการ ·
    //   รอจนถูกกั้น (pg_blocking_pids) · tx4 SELECT … FOR UPDATE NOWAIT บนรายการของใบ + แถวใบ ⇒ ต้องสำเร็จ (ตรวจ PIN ก่อนล็อกใบ/รายการ · c4194261) ·
    //   ปล่อยแล้วคำขอได้ GIFT_CARD_PIN · fail-before บน 1a964205 = 55P03 ทั้งสอง (ledger/wo-notes/HF-FU-red.txt §C7) ◂
    {
      const part2 = partOf(pl, 2);
      const pid2 = String(part2?.id ?? "");
      const items2 = [...new Set(((part2?.lines ?? []) as Any[]).map((l) => String(l.itemId)))];
      const q2 = await pq(pid2);
      const grand2 = q2?.ok === true ? Number(q2.grandTotalSatang) : 0;
      const wrong = probe.pin === "000001" ? "000002" : "000001";
      const pgCode = (e: unknown): string => {
        const o = e as { code?: unknown; meta?: { code?: unknown }; message?: unknown } | null;
        return String(o?.meta?.code ?? "") || (/\b(55P03)\b/.exec(String(o?.message ?? ""))?.[1] ?? `ERR:${String(o?.code ?? "")}:${String(o?.message ?? e).slice(0, 80)}`);
      };
      const nowait = async (sql: string, args: unknown[]): Promise<string> => {
        try {
          await P.$transaction(async (t4: Any) => {
            await t4.$queryRawUnsafe(sql, ...args);
          }, { timeout: 10_000, maxWait: 10_000 });
          return "OK";
        } catch (e) {
          return pgCode(e);
        }
      };
      const box: { p: Promise<Any> | null } = { p: null };
      const res: Record<string, string> = {};
      let blocked = 0;
      if (!pid2 || !items2.length || !grand2) p.push(`(fixture) probe ใบ 2 ${codeOf(q2)} · รายการ ${items2.length}`);
      else {
        await P.$transaction(
          async (tx: Any) => {
            await tx.$queryRawUnsafe(`SELECT id FROM "GiftCard" WHERE id = $1 FOR UPDATE`, probe.id);
            const bpid = Number(((await tx.$queryRawUnsafe(`SELECT pg_backend_pid()::int AS p`)) as Any[])[0].p);
            box.p = call(register, "submitRegisterSale", ctxA(DEV2), A("OWNER"), { lines: [], tableSplitPartId: pid2, expectedSplitVersion: Number(pl.version), idempotencyKey: newKey("c7probe"), expectedGrandTotalSatang: grand2, payMethods: [{ type: "GIFT_CARD", amountSatang: grand2, giftCard: { number: probe.number, pin: wrong } }] });
            const t1 = Date.now();
            while (Date.now() - t1 < 12_000) {
              const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))`, bpid)) as Any[])[0].n);
              if (n > blocked) blocked = n;
              if (n > 0) break;
              await sleep(150);
            }
            await sleep(700);
            res.items = await nowait(`SELECT id FROM "RestaurantOrderItem" WHERE id = ANY($1::text[]) FOR UPDATE NOWAIT`, [items2]);
            res.part = await nowait(`SELECT id FROM "PosTableSplitPart" WHERE id = $1 FOR UPDATE NOWAIT`, [pid2]);
          },
          { timeout: 60_000, maxWait: 15_000 },
        );
        const sub = await box.p;
        if (blocked < 1) p.push("probe: คำขอ PIN ผิดไม่ถูกแถวบัตรกั้น (จัดฉากไม่ถึง)");
        if (res.items !== "OK" || res.part !== "OK") p.push(`probe NOWAIT ระหว่างรอบัตร: รายการ ${res.items} · ใบ ${res.part} (คาด OK ทั้งคู่ — 55P03 = ล็อกใบ/รายการก่อนตรวจ PIN)`);
        if (!refused(sub, "GIFT_CARD_PIN") || (await partRows(String(pl.splitId)))[1]?.status !== "OPEN") p.push(`probe: หลังปล่อย ${codeOf(sub)} · ใบ 2 ${(await partRows(String(pl.splitId)))[1]?.status} (คาด GIFT_CARD_PIN · OPEN)`);
      }
    }
    chk("C7", p.length === 0, "PIN ผิดพร้อมกันบนใบ = PIN/LOCKED ล้วน · ตัวนับ 5 · ไม่มีบิล · PIN ถูกจ่ายได้ครั้งเดียว · probe NOWAIT ไม่ติดล็อก", FX(P8(p) || "ครบ"));
  });

  // ════════ T ย้าย/รวม ════════
  console.log("\n── T ย้าย/รวมโต๊ะ ──");
  const cardOf = (f: Any, name: string): Any => (Array.isArray(f?.tables) ? (f.tables as Any[]).find((t) => t.id === TB[name]) ?? null : null);
  await step("T1", async () => {
    const p: string[] = [];
    const s = await seat("N1", { guestCount: 2, lines: [ml("tomyum", 1), ml("chayen", 1)] });
    await mkT("N2");
    const h = await hold(s.sid, [ml("rice", 1)]);
    const hid = String(h?.heldCart?.id ?? "");
    const pl = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }));
    const mv = await tbl("registerMoveTable", ctxA(), A("WAITER"), { tableSessionId: s.sid, toTableId: TB.N2 });
    if (mv?.ok !== true || mv.changed !== true) p.push(`ย้าย (WAITER) → ${codeOf(mv)} changed ${short(mv?.changed)} ${short(mv?.message ?? "", 40)}`);
    const ss = await sessRow(s.sid);
    const t1 = await tableRow(TB.N1!);
    const t2 = await tableRow(TB.N2!);
    if (ss?.tableId !== TB.N2 || ss?.status !== "OPEN" || !(t1?.dirtySince instanceof Date) || t2?.dirtySince !== null) p.push(`session บน ${ss?.tableId === TB.N2 ? "N2" : "N1"} ${ss?.status} · N1 dirty ${short(t1?.dirtySince, 25)} · N2 dirty ${short(t2?.dirtySince, 25)}`);
    const f = await tbl("registerTables", ctxA(), A("OWNER"));
    const c1 = cardOf(f, "N1");
    const c2 = cardOf(f, "N2");
    if (c1?.state !== "NEEDS_CLEARING" || c1?.sessionId || c2?.state !== "DINING" || c2?.sessionId !== s.sid) p.push(`ผัง N1 ${c1?.state}/${c1?.sessionId ? "มี session" : "-"} · N2 ${c2?.state}/${c2?.sessionId === s.sid ? "session" : c2?.sessionId}`);
    const bd = await call(kdsMod, "kdsBoard", ctxA(DEV1), A("OWNER"), { stationId: ST.hot });
    const tk = Array.isArray(bd?.tickets) ? (bd.tickets as Any[]).find((x) => x.orderId === s.orderId) : null;
    if (tk?.label !== "N2") p.push(`kdsBoard label ${short(tk?.label ?? codeOf(bd))} (คาด N2)`);
    if ((await itemRow(s.it.tomyum ?? ""))?.kdsStatus !== "NEW") p.push("รายการไม่ใช่ NEW หลังย้าย");
    const det = await tbl("registerTableDetail", ctxA(), A("OWNER"), { tableSessionId: s.sid });
    if (det?.session?.tableName !== "N2" || det?.draft?.heldCartId !== hid) p.push(`แผงโต๊ะ ${short({ t: det?.session?.tableName, d: det?.draft?.heldCartId === hid }, 60)} (คาด N2 · รอบร่างเดิม)`);
    const sd = await sp("registerSplitDetail", ctxA(), A("OWNER"), { tableSessionId: s.sid });
    if (!pl || sd?.split?.splitId !== pl.splitId || sd?.split?.status !== "OPEN") p.push(`แผนหลังย้าย ${short(sd?.split?.status ?? codeOf(sd))}`);
    const same = await tbl("registerMoveTable", ctxA(), A("WAITER"), { tableSessionId: s.sid, toTableId: TB.N2 });
    if (same?.ok !== true || same.changed !== false) p.push(`ย้ายไปโต๊ะเดิม → ${codeOf(same)} changed ${short(same?.changed)}`);
    chk("T1", NS(["registerMoveTable"]) === "" && p.length === 0, "ย้าย: tableId · ต้องเก็บ/สะอาด · ผัง · ป้ายครัว · ร่าง/แผนตาม", FX(NS(["registerMoveTable"]) + (P8(p) || "ครบ")));
  });
  await step("T2", async () => {
    const p: string[] = [];
    const s = await seat("N3", { lines: [ml("rice", 1)] });
    await seat("N4", { lines: [ml("rice", 1)] });
    const closed = await seat("N6", { lines: [ml("rice", 1)] });
    await wpay(closed.sid, await wq(closed.sid));
    const mv = (actor: string, sid: string, to: string, ctx: Any = ctxA()) => tbl("registerMoveTable", ctx, A(actor), { tableSessionId: sid, toTableId: to });
    const cases: [string, () => Promise<Any>, string][] = [
      ["โต๊ะมีลูกค้า", () => mv("OWNER", s.sid, TB.N4!), "TABLE_BUSY"],
      ["INACTIVE", () => mv("OWNER", s.sid, TB.A6!), "TABLE_INACTIVE"],
      ["โต๊ะร้าน T2", () => mv("OWNER", s.sid, TB.X1!), "TABLE_NOT_FOUND"],
      ["id มั่ว", () => mv("OWNER", s.sid, `nope${RAND}`), "TABLE_NOT_FOUND"],
      ["ctx สาขา B", () => mv("OWNER", s.sid, TB.N4!, ctxB()), "TABLE_NOT_FOUND"],
      ["session ร้าน T2", () => mv("OWNER", SX, TB.N4!), "TABLE_NOT_FOUND"],
      ["session ปิดแล้ว", () => mv("OWNER", closed.sid, TB.N4!), "TABLE_SESSION_CLOSED"],
      ["CASHIER", () => mv("CASHIER", s.sid, TB.A6!), "PERMISSION_DENIED"],
      ["NOPERM", () => mv("NOPERM", s.sid, TB.A6!), "PERMISSION_DENIED"],
    ];
    for (const [lbl, f, want] of cases) {
      const r = await f();
      if (!refused(r, want)) p.push(`${lbl} → ${codeOf(r)} (คาด ${want})`);
    }
    if ((await sessRow(s.sid))?.tableId !== TB.N3) p.push("session ถูกย้ายทั้งที่ถูกปฏิเสธ");
    await mkT("N5");
    const rs = await tbl("registerCreateReservation", ctxA(), A("OWNER"), { tableId: TB.N5, name: `คุณอรทัย ${RAND}`, phone: "0812345678", partySize: 2, at: new Date(Date.now() + 10 * MIN).toISOString() });
    const ok = await mv("OWNER", s.sid, TB.N5!);
    const rr = rs?.ok === true ? await P.restaurantReservation.findUnique({ where: { id: String(rs.id) } }).catch(() => null) : null;
    if (rs?.ok !== true || ok?.ok !== true || ok.reservationOverridden !== true || rr?.status !== "BOOKED") p.push(`ย้ายไปโต๊ะที่จองไว้ → จอง ${codeOf(rs)} · ย้าย ${codeOf(ok)} overridden ${short(ok?.reservationOverridden)} · การจอง ${rr?.status}`);
    chk("T2", NS(["registerMoveTable"]) === "" && p.length === 0, "ปฏิเสธ 9 แบบไม่เขียน · โต๊ะที่จอง = ย้ายได้ + แจ้ง", FX(NS(["registerMoveTable"]) + (P8(p) || "ครบ")));
  });
  await step("T3", async () => {
    const p: string[] = [];
    const into = await seat("K1", { guestCount: 2, lines: [ml("rice", 1)] });
    const f1 = await seat("K2", { guestCount: 3, ...(MEMBER ? { memberId: MEMBER } : {}), lines: [ml("kaprao", 1)] });
    const f2 = await seat("K3", { guestCount: 4, lines: [ml("chayen", 1)] });
    const rq = await rorder.createServiceRequest(T, U.A, f1.sid, "CALL_STAFF");
    const dh = await hold(f2.sid, [ml("rice", 1)]);
    const did = String(dh?.heldCart?.id ?? "");
    const mg = await tbl("registerMergeTables", ctxA(), A("WAITER"), { intoSessionId: into.sid, fromSessionIds: [f1.sid, f2.sid] });
    if (mg?.ok !== true || mg.changed !== true) p.push(`รวม (WAITER) → ${codeOf(mg)} changed ${short(mg?.changed)} ${short(mg?.message ?? "", 40)}`);
    const ords = (await P.restaurantOrder.findMany({ where: { id: { in: [f1.orderId, f2.orderId] } } }).catch(() => [])) as Any[];
    if (ords.length !== 2 || ords.some((o) => o.sessionId !== into.sid)) p.push(`ออเดอร์ต้นทางย้าย ${ords.filter((o) => o.sessionId === into.sid).length}/2`);
    const req = rq?.ok ? await P.restaurantServiceRequest.findUnique({ where: { id: rq.id } }).catch(() => null) : null;
    if (req?.sessionId !== into.sid) p.push(`คำขอเรียกพนักงาน ${req ? "ไม่ย้าย" : `สร้างไม่ได้ ${short(rq, 40)}`}`);
    const si = await sessRow(into.sid);
    if (si?.guestCount !== 9 || (MEMBER && si?.memberId !== MEMBER)) p.push(`ปลายทาง guestCount ${si?.guestCount} (คาด 9) · สมาชิก ${si?.memberId === MEMBER ? "ok" : si?.memberId}`);
    for (const [nm, f] of [["K2", f1], ["K3", f2]] as const) {
      const r = await sessRow(f.sid);
      const t = await tableRow(TB[nm]!);
      if (r?.status !== "MERGED" || r?.mergedIntoId !== into.sid || !(t?.dirtySince instanceof Date)) p.push(`${nm} ${r?.status} → ${r?.mergedIntoId === into.sid ? "ปลายทาง" : r?.mergedIntoId} · dirty ${short(t?.dirtySince, 25)}`);
    }
    const dr = await heldRow(did);
    if (dr?.tableSessionId !== into.sid || dr?.status !== "HELD") p.push(`รอบร่างต้นทาง ${dr?.status} ${dr?.tableSessionId === into.sid ? "→ปลายทาง" : "ไม่ย้าย"}`);
    const rp = await tbl("registerMergeTables", ctxA(), A("WAITER"), { intoSessionId: into.sid, fromSessionIds: [f1.sid, f2.sid] });
    if (rp?.ok !== true || rp.changed !== false) p.push(`รวมซ้ำ → ${codeOf(rp)} changed ${short(rp?.changed)}`);
    // ปฏิเสธ
    const a = await seat("K4", { lines: [ml("rice", 1)] });
    const b = await seat("K5", { lines: [ml("rice", 1)] });
    await hold(a.sid, [ml("rice", 1)]);
    await hold(b.sid, [ml("rice", 1)]);
    const c = await seat("K6", { lines: [ml("rice", 1)] });
    const d = await seat("K7", { lines: [ml("rice", 1)] });
    const e = await seat("K8", { lines: [ml("rice", 1)] });
    await hold(d.sid, [ml("rice", 1)]);
    await hold(e.sid, [ml("rice", 1)]);
    const g = await seat("K9", { lines: [ml("rice", 1)] });
    const hh = await seat("K10", { lines: [ml("rice", 2)] });
    await mkSplit(hh.sid, { mode: "EQUAL", partCount: 2 });
    const m = (actor: string, intoId: string, froms: string[]) => tbl("registerMergeTables", ctxA(), A(actor), { intoSessionId: intoId, fromSessionIds: froms });
    const cases: [string, () => Promise<Any>, string][] = [
      ["รอบร่างทั้งปลายทางและต้นทาง", () => m("OWNER", a.sid, [b.sid]), "TABLE_HAS_DRAFT"],
      ["รอบร่างในต้นทางสองที่", () => m("OWNER", c.sid, [d.sid, e.sid]), "TABLE_HAS_DRAFT"],
      ["ต้นทางมีแผน OPEN", () => m("OWNER", g.sid, [hh.sid]), "TABLE_SPLIT_OPEN"],
      ["ต้นทาง 6 โต๊ะ", () => m("OWNER", g.sid, [b.sid, d.sid, e.sid, hh.sid, c.sid, a.sid]), "VALIDATION"],
      ["ปลายทางอยู่ในต้นทาง", () => m("OWNER", g.sid, [g.sid]), "VALIDATION"],
      ["CASHIER", () => m("CASHIER", g.sid, [c.sid]), "PERMISSION_DENIED"],
      ["ต้นทางร้าน T2", () => m("OWNER", g.sid, [SX]), "TABLE_NOT_FOUND"],
    ];
    for (const [lbl, f, want] of cases) {
      const r = await f();
      if (!refused(r, want)) p.push(`${lbl} → ${codeOf(r)} (คาด ${want})`);
    }
    const st = await Promise.all([a, b, c, d, e, g, hh].map(async (x) => (await sessRow(x.sid))?.status));
    if (st.some((x) => x !== "OPEN")) p.push(`หลังปฏิเสธ สถานะ ${st.join(",")} (คาด OPEN ทั้งหมด)`);
    chk("T3", NS(["registerMergeTables"]) === "" && p.length === 0, "รวม: ออเดอร์/คำขอ/แขก/สมาชิก/ร่าง · MERGED + ต้องเก็บ · เล่นซ้ำ · ปฏิเสธ 7 แบบไม่เขียน", FX(NS(["registerMergeTables"]) + (P8(p) || "ครบ")));
  });
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 1 ruling 6 · pos-P2.5-review.md N4)
  await step("T4", async () => {
    const p: string[] = [];
    const into = await seat("T4a", { guestCount: 2, lines: [ml("chayen", 1)] });
    const from = await seat("T4b", { guestCount: 2, lines: [ml("kaprao", 1), ml("latte", 1)] });
    const pl = splitOf(await mkSplit(from.sid, { mode: "EQUAL", partCount: 2 }));
    await hold(from.sid, [ml("chayen", 1)]); // รอบร่าง = แผน DONE แล้วโต๊ะ B ยัง OPEN (รวมได้)
    const a = await payPart(pl, 1);
    const b = await payPart(pl, 2);
    if (!a.saleId || !b.saleId || (await planRow(String(pl?.splitId ?? "")))?.status !== "DONE" || (await sessRow(from.sid))?.status !== "OPEN") throw new Error(`(fixture) ใบ ${codeOf(a.r)}/${codeOf(b.r)} · session B ${(await sessRow(from.sid))?.status}`);
    const mg = await tbl("registerMergeTables", ctxA(), A("OWNER"), { intoSessionId: into.sid, fromSessionIds: [from.sid] });
    if (mg?.ok !== true) p.push(`รวม B เข้า A → ${codeOf(mg)}`);
    if ((await planRow(String(pl?.splitId ?? "")))?.sessionId !== into.sid) p.push("แผน DONE ไม่ย้ายไป session ปลายทาง");
    const v = await voidSale(a.saleId);
    if (v?.ok !== true) p.push(`void บิลใบ 1 → ${codeOf(v)}`);
    const pr = (await partRows(String(pl?.splitId ?? "")))[0];
    if (pr?.status !== "OPEN" || pr?.saleId !== null) p.push(`ใบ 1 ${short([pr?.status, pr?.saleId], 40)} (คาด OPEN · null)`);
    const re = await payPart(pl, 1);
    if (!re.saleId || (await planRow(String(pl?.splitId ?? "")))?.status !== "DONE") p.push(`จ่ายใบ 1 ใหม่บนโต๊ะ A → quote ${codeOf(re.q)} · จ่าย ${codeOf(re.r)} ${short(re.r?.message ?? "", 40)} · แผน ${(await planRow(String(pl?.splitId ?? "")))?.status}`);
    // แผน OPEN บน session ที่ปิดแล้ว (โต๊ะ A5 หลัง X4) ไม่กันการยกเลิกรายการที่ค้างจ่าย
    const s15 = await planRow(String(PLAN15?.splitId ?? ""));
    if (s15?.status === "OPEN" && (await sessRow(S15.sid))?.status === "CLOSED") {
      const ci = await tbl("registerCancelTableItem", ctxA(), A("OWNER"), { itemId: S15.it.kaprao ?? "none", reason: "ลูกค้าเปลี่ยนใจ" });
      if (ci?.ok !== true) p.push(`ยกเลิกรายการของแผน OPEN บน session ที่ปิดแล้ว → ${codeOf(ci)} (คาด ok)`);
    } else p.push(`(fixture) แผน A5 ${s15?.status} · session ${(await sessRow(S15.sid))?.status} (คาด OPEN · CLOSED จาก X4)`);
    chk("T4", p.length === 0, "รวมโต๊ะย้ายแผน DONE · void ใบหลังรวมจ่ายต่อได้ · แผนบน session ปิดไม่กันการยกเลิก", FX(P8(p) || "ครบ"));
  });
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 2 ruling 2 · F2)
  await step("T5", async () => {
    const p: string[] = [];
    const act = stripComments(rd("src/lib/actions/restaurant.ts"));
    const mi = act.search(/export\s+async\s+function\s+mergeSessionAction\b/);
    const rest0 = mi < 0 ? "" : act.slice(mi + 10);
    const body = rest0.slice(0, rest0.search(/\nexport\s/) < 0 ? undefined : rest0.search(/\nexport\s/));
    const gi = body.search(/\blegacyMergeSplitGuard\s*\(/);
    const di = body.indexOf("table.mergeSession(");
    if (gi < 0 || di < 0 || gi > di) p.push(`mergeSessionAction: legacyMergeSplitGuard ${gi < 0 ? "ไม่ถูกเรียก" : "อยู่หลังประตูเดิม"}`);
    const legacy = async (into: Seat, from: Seat) => {
      const g = await sp("legacyMergeSplitGuard", { tenantId: T, unitId: U.A, intoSessionId: into.sid, fromSessionId: from.sid });
      return g?.ok === true ? { g, m: await rtable.mergeSession(T, U.A, into.sid, from.sid) } : { g, m: null };
    };
    // แผน OPEN ฝั่งต้นทาง / ฝั่งปลายทาง
    for (const side of ["from", "into"] as const) {
      const into = await seat(`T5${side}i`, { guestCount: 2, lines: [ml("kaprao", 1)] });
      const from = await seat(`T5${side}f`, { guestCount: 2, lines: [ml("chayen", 1)] });
      const pl = splitOf(await mkSplit(side === "from" ? from.sid : into.sid, { mode: "EQUAL", partCount: 2 }));
      const s0 = await snap(side === "from" ? from.sid : into.sid, String(pl?.splitId ?? ""));
      const x = await legacy(into, from);
      const ord = await P.restaurantOrder.findUnique({ where: { id: from.orderId } }).catch(() => null);
      if (x.g?.ok !== false || typeof x.g?.reason !== "string" || x.m) p.push(`แผน OPEN ฝั่ง${side === "from" ? "ต้นทาง" : "ปลายทาง"} → ตัวกัน ${short(x.g, 60)}`);
      if (ord?.sessionId !== from.sid || (await sessRow(from.sid))?.status !== "OPEN") p.push(`ฝั่ง${side}: ออเดอร์ย้าย/ต้นทางไม่ OPEN`);
      if ((await snap(side === "from" ? from.sid : into.sid, String(pl?.splitId ?? ""))) !== s0) p.push(`ฝั่ง${side}: แผน/รายการเปลี่ยน`);
    }
    // ORACLE-EDIT ผู้คุม 15 ต.ค. (HF-FU d · มติ 4): แผน DONE ฝั่งต้นทาง (ต้นทางมีรอบร่าง ⇒ ยัง OPEN) → ปฏิเสธ · ออเดอร์ไม่ย้าย · แผนยัง DONE บน session ต้นทาง
    //   (เดิม = ตัวควบคุม "มีแต่แผน DONE → รวมได้") · ตัวควบคุมใหม่: ไม่มีแผน → รวมด้วยประตูเดิมได้ ◂
    const into = await seat("T5ci", { guestCount: 2, lines: [ml("kaprao", 1)] });
    const from = await seat("T5cf", { guestCount: 2, lines: [ml("chayen", 1)] });
    const pl = splitOf(await mkSplit(from.sid, { mode: "EQUAL", partCount: 2 }));
    await hold(from.sid, [ml("latte", 1)]);
    const a = await payPart(pl, 1);
    const b = await payPart(pl, 2);
    if (!a.saleId || !b.saleId || (await planRow(String(pl?.splitId ?? "")))?.status !== "DONE") p.push(`(fixture) แผน DONE ${codeOf(a.r)}/${codeOf(b.r)}`);
    const x = await legacy(into, from);
    const ordD = await P.restaurantOrder.findUnique({ where: { id: from.orderId } }).catch(() => null);
    const plD = await planRow(String(pl?.splitId ?? ""));
    if (x.g?.ok !== false || typeof x.g?.reason !== "string" || x.m) p.push(`แผน DONE ฝั่งต้นทาง → ตัวกัน ${short(x.g, 60)} · รวม ${short(x.m, 40)} (คาด ปฏิเสธ · HF-FU มติ 4)`);
    if (ordD?.sessionId !== from.sid || (await sessRow(from.sid))?.status !== "OPEN" || plD?.status !== "DONE" || plD?.sessionId !== from.sid) p.push(`แผน DONE ฝั่งต้นทาง: ออเดอร์ ${ordD?.sessionId === from.sid ? "อยู่เดิม" : "ย้าย"} · ต้นทาง ${(await sessRow(from.sid))?.status} · แผน ${plD?.status} ${plD?.sessionId === from.sid ? "session เดิม" : "ย้าย"}`);
    const into2 = await seat("T5ni", { guestCount: 2, lines: [ml("kaprao", 1)] });
    const from2 = await seat("T5nf", { guestCount: 2, lines: [ml("chayen", 1)] });
    const y = await legacy(into2, from2);
    if (y.g?.ok !== true || JSON.stringify(y.m) !== JSON.stringify({ ok: true }) || (await sessRow(from2.sid))?.status !== "MERGED") p.push(`(ตัวควบคุม) ไม่มีแผน → ตัวกัน ${short(y.g, 40)} · รวม ${short(y.m, 40)}`);
    chk("T5", p.length === 0, "หน้าเดิมรวมโต๊ะที่มีแผน OPEN ไม่ได้ (ต้นทาง/ปลายทาง) · แผน DONE ฝั่งต้นทางไม่ได้ · ไม่มีแผนรวมได้", FX(P8(p) || "ครบ"));
  });
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 1 ruling 5 · CD-P25-N3 option 2: no VAT-EXCLUDED mode in the register)
  await step("M8", async () => {
    const p: string[] = [];
    const reg = stripComments(rd(F.register));
    const fnOf = (name: string) => {
      const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(reg);
      if (!m) return "";
      const end = reg.indexOf("\n}", m.index);
      return end < 0 ? "" : reg.slice(m.index, end + 2);
    };
    const rv = fnOf("regVat");
    const modes = [...rv.matchAll(/mode:\s*"([A-Z]+)"/g)].map((m) => m[1]!);
    if (!rv || /EXCLUDED/.test(rv) || !modes.length || modes.some((x) => x !== "INCLUDED" && x !== "NONE")) p.push(`regVat คืน ${short(modes)} ${/EXCLUDED/.test(rv) ? "มี EXCLUDED" : ""}`);
    if (/EXCLUDED/.test(fnOf("regFixedServiceCharge"))) p.push("regFixedServiceCharge ยังมีทาง EXCLUDED");
    const run = async (name: string, mode: "INCLUDED" | "NONE") => {
      const s = await seat(name, { guestCount: 2, lines: [ml("squid", 1), ml("brownie", 1)] });
      const pl = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }));
      if (!pl) return p.push(`${mode}: สร้างแผนไม่ได้`);
      for (const no of [1, 2]) {
        const pt = partOf(pl, no);
        const q = await pq(String(pt?.id ?? ""));
        if (q?.ok !== true || q.grandTotalSatang !== pt?.totalSatang) p.push(`${mode} ใบ ${no}: แสดง ${pt?.totalSatang} · เก็บ ${q?.ok ? q.grandTotalSatang : codeOf(q)}`);
        if (mode === "NONE" && (pt?.vatSatang !== 0 || q?.vatSatang !== 0)) p.push(`NONE ใบ ${no}: VAT แผน ${pt?.vatSatang} · quote ${q?.vatSatang} (คาด 0)`);
        if (mode === "INCLUDED" && (q?.vatMode !== "INCLUDED" || pt?.vatSatang !== q?.vatSatang)) p.push(`INCLUDED ใบ ${no}: VAT แผน ${pt?.vatSatang} · quote ${q?.vatSatang} ${q?.vatMode}`);
      }
      const sum = ((pl.parts ?? []) as Any[]).reduce((t, x) => t + Number(x.totalSatang), 0);
      if (sum !== pl.totalSatang) p.push(`${mode}: Σ ใบ ${sum} ≠ แผน ${pl.totalSatang}`);
    };
    await run("M8a", "INCLUDED");
    const org = { orgName: `บ้านกาแฟสวนผึ้งคิวซี ${RAND} จำกัด`, taxId: "0105561177639" };
    try {
      await accSvc.saveSettings(T, S.ACC, { ...org, vatRegistered: false });
      await run("M8b", "NONE");
    } finally {
      await accSvc.saveSettings(T, S.ACC, { ...org, vatRegistered: true });
    }
    chk("M8", p.length === 0, "VAT ของหน้าขาย = INCLUDED|NONE · ยอดใบที่แสดง = ยอดที่เก็บ ทั้งสองโหมด", FX(P8(p) || "ครบ"));
  });
  // ORACLE-ADD ผู้คุม 14 ต.ค. (P2.5 fix round 1 ruling 7 · F4 · P2.9 merged: STORE_CREDIT on a split part uses the part's member)
  await step("M9", async () => {
    const p: string[] = [];
    if (!MEMBER) throw new Error("ไม่มีสมาชิก (fixture)");
    const ctxM: Any = { tenantId: T, systemId: S.MEM, actorUserId: uid("OWNER") };
    const other = await memMod.createMember(ctxM, A("OWNER"), { phone: `0896${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`, name: `คุณสมศรี คิวซี ${RAND}`, source: "WALK_IN", homeUnitId: U.A });
    const OTHER = String(other?.customerId ?? "");
    for (const [cust, k] of [[MEMBER, "m"], [OTHER, "o"]] as const)
      await P.$transaction((tx: Any) => memMod.issueStoreCredit(T, { systemId: S.MEM, customerId: cust, satang: 300_000, idempotencyKey: `${KEY_PREFIX}-sc-${k}`, refundSaleId: `${KEY_PREFIX}-fixture` }, tx));
    const s = await seat("M9", { guestCount: 2, memberId: MEMBER, lines: [ml("tomyum", 1), ml("chayen", 1)] });
    const pl = splitOf(await mkSplit(s.sid, { mode: "EQUAL", partCount: 2 }));
    if (!pl || partOf(pl, 1)?.memberId !== MEMBER) throw new Error(`(fixture) แผน ${pl ? "ok" : "ไม่มี"} · ใบ 1 สมาชิก ${partOf(pl, 1)?.memberId === MEMBER}`);
    const credit = async (no: number, memberId: string | null) => {
      const pid = String(partOf(pl, no)?.id ?? "");
      const q = await pq(pid, memberId ? { memberId: partOf(pl, no)?.memberId ?? memberId } : {});
      const grand = q?.ok === true ? Number(q.grandTotalSatang) : Number(partOf(pl, no)?.totalSatang ?? 0);
      const r = await call(register, "submitRegisterSale", ctxA(DEV2), A("OWNER"), {
        lines: [], tableSplitPartId: pid, expectedSplitVersion: Number(pl.version), ...(memberId ? { memberId } : {}),
        idempotencyKey: newKey("sc"), expectedGrandTotalSatang: grand, payMethods: [{ type: "STORE_CREDIT", amountSatang: grand }],
      });
      if (r?.ok === true && r.saleId) MY_SALES.push(String(r.saleId));
      return r;
    };
    const c0 = await counts();
    const wrong = await credit(1, OTHER);
    if (!refused(wrong, "STORE_CREDIT_NOT_OWNER")) p.push(`ใบ 1 + memberId สมาชิกอื่น + STORE_CREDIT → ${codeOf(wrong)} (คาด STORE_CREDIT_NOT_OWNER)`);
    const none = await credit(2, null);
    if (!refused(none, "STORE_CREDIT_NOT_OWNER")) p.push(`ใบ 2 (ไม่มีสมาชิก) + STORE_CREDIT → ${codeOf(none)} (คาด STORE_CREDIT_NOT_OWNER)`);
    const c1 = await counts();
    if (c1.sale !== c0.sale) p.push(`ปฏิเสธแล้วยังมีบิล ${c0.sale}→${c1.sale}`);
    const ok = await credit(1, MEMBER);
    const sale = await saleRow(String(ok?.saleId ?? ""));
    if (ok?.ok !== true || sale?.memberId !== MEMBER || !(sale?.payments as Any[] | undefined)?.some((x) => x.type === "STORE_CREDIT")) p.push(`ใบ 1 (สมาชิกของใบ) + STORE_CREDIT → ${codeOf(ok)} ${short(ok?.message ?? "", 60)}`);
    const okNoId = await (async () => {
      // ใบ 1 จ่ายแล้ว — ตรวจกรณีไม่ส่ง memberId ด้วยโต๊ะใหม่ (เซิร์ฟเวอร์ใช้สมาชิกของใบ)
      const s2 = await seat("M9b", { guestCount: 2, memberId: MEMBER, lines: [ml("tomyum", 1)] });
      const pl2 = splitOf(await mkSplit(s2.sid, { mode: "EQUAL", partCount: 2 }));
      const pid = String(partOf(pl2, 1)?.id ?? "");
      const q = await pq(pid);
      const grand = q?.ok === true ? Number(q.grandTotalSatang) : 0;
      return call(register, "submitRegisterSale", ctxA(DEV2), A("OWNER"), { lines: [], tableSplitPartId: pid, expectedSplitVersion: Number(pl2?.version ?? 1), idempotencyKey: newKey("sc"), expectedGrandTotalSatang: grand, payMethods: [{ type: "STORE_CREDIT", amountSatang: grand }] });
    })();
    if (okNoId?.ok !== true) p.push(`ใบสมาชิกไม่ส่ง memberId + STORE_CREDIT → ${codeOf(okNoId)} (คาด ok · สมาชิกของใบ)`);
    else MY_SALES.push(String(okNoId.saleId));
    chk("M9", p.length === 0, "STORE_CREDIT บนใบ = เครดิตของสมาชิกของใบ · สมาชิกอื่น/ใบไม่มีสมาชิก = STORE_CREDIT_NOT_OWNER", FX(P8(p) || "ครบ"));
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
  await runPure(sharedMod, renderMod);
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
// นอกขอบเขต P2.5 S: จอ 15B/15C + ปุ่มแผงโต๊ะ 03 + ลากย้าย/รวม + พรีวิวใบรายการ (P2.5U · visual ของผู้คุมงาน) · แยกตามยอดเงิน (มติ 1 ตัดทิ้ง) ·
//   ยกเลิกการรวมโต๊ะ · ย้ายรายการเดี่ยวข้ามโต๊ะ · QR ของโต๊ะที่ถูกย้าย/รวม (P2.7) · พิมพ์ผ่าน LAN (P3.11) · รายงานต่อบรรทัดส่วนแบ่ง (P2.12) ·
//   ชุด regression (qc-pos-p2.4 · p2.6 · p2.8 · p1.x · qc-restaurant* · qc-hf-tx · money set) ผู้สร้างรันก่อน/หลัง (ผลต้องเท่าเดิม)
