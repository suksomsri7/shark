// QC — POS RUN ใบ P2.11 (S): หลายสาขา — แถวราคานอกเอื้อม (F4) · บันทึกตามขอบเขตสาขา · คัดลอก/เทียบราคาสาขา ·
//   ตัวตนภาษีของใบเสร็จต่อสาขา · รายงานช่องทาง · แผนที่คลังร่วม · งานตามหลัง k / l-price / m(i)
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ (ฐาน origin/session/pos f164d9d6 · โค้ด 3dd0639d)
// requires: pos-seed (userId ของร้าน QC กาแฟ/อาหาร = ผู้กระทำจริงใน audit + สมาชิกภาพในร้านชั่วคราว)
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.11.md §0–§7 · §10 มติผู้คุมงาน 1–10 (ผูกมัด)
//        ต่อยอด: qc-pos-p2.2 (แถวราคา · setChannelPrices · bulk) · qc-pos-p1.17 (รายงาน · ภาพรวม OV) · qc-pos-p1.10 (ใบเสร็จ payload/HTML/ESC-POS) ·
//                qc-pos-p1.18 (ตัวเขียนค่าตั้ง) · qc-pos-p1.14 (R16 โอนในคลังเดียว) · qc-pos-p2.3 (ส่วนต่างสูตรตามตัวเลือก)
//        โน้ต: ledger/wo-notes/pos-P2.11-oracle.md (ตารางชื่อ = สัญญาของผู้สร้าง S · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P2.11 (S) ต้องส่ง (ย่อ — ละเอียดในโน้ต):
//   catalog.ts: setChannelPrices "นอกเอื้อม" (ช่องทางเก็บแล้ว / สาขาเก็บแล้ว-เลิกผูก / สาขาที่ผู้กระทำไม่มี pos.product.setPrice):
//     ไม่ส่ง = คงไว้ · ส่งค่าเดิม = รับ · เปลี่ยน/ใหม่ = VALIDATION reason PRICE_ROW_DEAD field "rows" (ตาย) หรือ PERMISSION_DENIED (นอกสิทธิ์) ไม่เขียนอะไร ·
//     copyUnitPrices · unitPriceMatrix · CatalogError += field reason · bulk เกิน 500 = reason BULK_TOO_MANY + field ·
//     ลบ PosRecipeChoiceLine ของกลุ่มที่ถอด/เก็บ (ผู้เขียนเดียวยังเป็น catalog.ts)
//   posUnitInventoryMap (export ที่เดียว · สำเนา inventorySystemsOfPos/recipe-actions หายไป)
//   receipt-settings-shared.ts receiptUnitOverride · receipt-settings.ts updatePosReceiptUnitSettings · receipt.ts ใช้ค่าต่อสาขา (รอยต่อ P2.11)
//   reports.ts reportChannels + REPORT_KINDS/CSV "channels" · report-overview.ts ส่วน "channels" · ข้อความ th/en
//
// ขอบเขต: ST สถิต · PR ราคา · RN ใบเสร็จ · RP รายงาน · SK/TR คลัง · FU งานตามหลัง · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p2.2): SKIP เมื่อของ P2.11 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ST1–ST4 + FU1 + FU3 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ep-frosty-lab ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p211-<rand>` + `-t2` (ลบทั้งร้านใน finally · แถวค้าง = 0)
//    ข้อมูลทดสอบผ่านฟังก์ชันของโมดูล · SQL ดิบเฉพาะ: ธงเก็บถาวรของสาขา · เลื่อนเวลา createdAt/paidAt ของบิลรายงาน (RP · โน้ต D2) · ลบร้าน
//    ไม่มีเครือข่าย: globalThis.fetch = ตัวกั้น (503 + นับ) ตลอดช่วง DB
//    โมดูล/ฟังก์ชันที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + catch) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.11";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 idempotency/เล่นซ้ำ · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน · X5 ไม่เขียนอะไร/ผลข้างเคียงครบ · PAR เท่าพฤติกรรมเดิม · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.11-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[§10 มติ 1 · ไม่มี migration] prisma/ (schema + migrations) ไม่ต่างจาก หมุดของเลน 05975437 (หรือ f164d9d6) · ไม่มีไฟล์ใหม่ใต้ prisma/"),  // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin): คำอธิบายฐาน = หมุดของเลน (K3)
  D("ST2", "S", "[F15.1 · มติ 6 · m(i)] PosProductChannelPrice + PosRecipeChoiceLine เขียนใน catalog.ts เท่านั้น · posUnitInventoryMap export ที่เดียวใน src/lib · ไม่มี function inventorySystemsOfPos · recipe-actions.ts ไม่ค้นลิงก์ INVENTORY เอง (ใช้ posUnitInventoryMap) · catalog.ts export copyUnitPrices unitPriceMatrix · unitPriceMatrix/reportChannels อ่านอย่างเดียว"),
  D("ST3", "S", "[§4 §5 มติ 4 5 Q6] reports.ts REPORT_KINDS มี \"channels\" + CSV_HEADERS.channels + export reportChannels · report-overview.ts OVERVIEW_SECTIONS มี \"channels\" · receipt-settings-shared.ts export receiptUnitOverride (ไม่ import prisma/db) · receipt-settings.ts export updatePosReceiptUnitSettings + คีย์ byUnit · ข้อความ report.kinds.channels th (ไทย) + en (ไม่มีอักษรไทย)"),
  D("ST4", "S", "[§3 มติ 9] ไฟล์เลน A ไม่ถูกแตะ (= merge-base หรือ f164d9d6): pos/service.ts · register*.ts · tender*.ts · refund*.ts · account-bridge.ts · outbox-consumers.ts · modules/account/** · receipt.ts/receipt-render.ts: ทุก hunk ที่เปลี่ยนมีเครื่องหมาย P2.11"),
  // ── PR ราคา (catalog.ts) ──
  D("PR1", "-", "[F4 ครึ่ง A · มติ 2] ช่องทาง ZZQC เก็บถาวรแล้ว: ส่งแถว ZZQC เดิมทุกไบต์ + เปลี่ยน LINEMAN ทุกสาขา → ok changed · แถว ZZQC id/updatedAt เดิม · ส่งเฉพาะ LINEMAN → แถว ZZQC คงไว้ (นอกเอื้อม) แต่แถว (ทุกช่องทาง, A) ที่อยู่ในเอื้อมถูกลบตามเดิม"),
  D("PR2", "X5", "[F4 · มติ 2 · l-price] แถวตายที่เปลี่ยน/ใหม่ → VALIDATION reason PRICE_ROW_DEAD field \"rows\" ไม่เขียนอะไร (แถว+audit เท่าเดิม): ZZQC เปลี่ยนราคา · (ZZQC, B) ใหม่ · (ทุกช่องทาง, C เก็บถาวร) เปลี่ยน · (LINEMAN, D เลิกผูก) ใหม่"),
  D("PR3", "-", "[F4 ครึ่ง B · F6] แถวของสาขา C (เก็บถาวร) และ D (เลิกผูก) รอดการบันทึกที่ไม่ส่งมัน (id/ค่าเดิม) · คืนสภาพ C + ผูก D ใหม่ → resolvePrices ที่ C STORE 6,500 BRANCH · LINEMAN 9,900 CHANNEL · D STORE 6,600 BRANCH"),
  D("PR4", "X3", "[§2 มติ 2 8] ผู้จัดการสาขา A (membership จริง) บันทึก (LINEMAN, A) + (ทุกช่องทาง, A) โดยไม่ส่งแถว B/ทุกสาขา → ok · แถว B + (LINEMAN, ทุกสาขา) ทุกไบต์เดิม · แถว A updatedByUserId = ผู้จัดการ · audit 1 แถว actorId ผู้จัดการ after.rows = ชุดเต็มหลังบันทึก (5 แถว) · ส่งแถว B ค่าเดิมมาด้วย = รับ ไม่เปลี่ยน ไม่มี audit"),
  D("PR5", "X3", "[§2 มติ 2] ผู้จัดการสาขา A เปลี่ยน (LINEMAN, B) / (LINEMAN, ทุกสาขา) / ใหม่ (ทุกช่องทาง, E) → PERMISSION_DENIED · พนักงาน (pos.sale.create) เปลี่ยนแถว A → PERMISSION_DENIED · ทุกกรณีไม่มีแถว/audit เปลี่ยน"),
  D("PR6", "X1", "[§1 F5] copyUnitPrices A→B (productIds Q1–Q4): overwrite false ข้าม (x, B) ที่มีอยู่ · notSold คัดลอก · แถวช่องทางตายไม่คัดลอก · written 4 skipped 2 productIds [Q1,Q2,Q4] · audit pos.product.channelPrice 1 แถว/สินค้า · รันซ้ำ changed false ไม่มี audit · overwrite true แทน (LINEMAN, B) 9,999 → 9,000 written 1 · รันซ้ำ changed false · แถว B ที่ไม่มีที่ A คงอยู่"),
  D("PR7", "X2", "[§1 X2] copyUnitPrices สิทธิ์/ขอบเขต: ผู้จัดการ A (ไม่มี B) / พนักงาน → PERMISSION_DENIED · ผู้จัดการ A+B → ok · ปลายทาง C เก็บถาวร / D เลิกผูก → VALIDATION field toUnitId · A→A → VALIDATION · สาขาร้าน T2 (ปลายทาง/ต้นทาง) + สินค้าร้าน T2 → NOT_FOUND · คำปฏิเสธไม่เขียนอะไร"),
  D("PR8", "PAR", "[§1] unitPriceMatrix = priceOf(loadPriceBook) ทุกช่อง (สินค้า × สาขา × ช่องทาง: ราคา · ที่มา · PRICE_NOT_SET/CHANNEL_NOT_SOLD) · สาขาปริยาย = A B E (ไม่รวม C เก็บถาวร · D เลิกผูก) · ช่องทางปริยายมี STORE LINEMAN ไม่มี ZZQC · ผู้จัดการ A เห็นแค่ A · ขอ B → NOT_FOUND · สินค้าร้าน T2 → NOT_FOUND · อ่านอย่างเดียว"),
  D("PR9", "-", "[l-price · P2.2U-R2 N2] คำปฏิเสธมี field + reason คงที่ (จอไม่ต้องจับข้อความ): bulk productIds 501 → VALIDATION BULK_TOO_MANY field productIds · หมวดที่มีสินค้า 501 → BULK_TOO_MANY field categoryId · แถวตายของ PR2 → PRICE_ROW_DEAD field rows"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.11 fix รอบ 1 · มติ 1–3 ใน pos-P2.11-review.md) ▸ PR10 (R1 F3) · PR11 (hunt L1) · PR12 (hunt L2) ◂
  D("PR10", "X3", "[fix1 มติ 1 · R1 F3] copyUnitPrices ไม่ส่ง productIds ข้ามสินค้าสาขาเดียวที่ผู้กระทำมองไม่เห็น (แถวเดิมที่ต้นทาง) → ok นับ skipped ไม่ NOT_FOUND · แถวของสินค้านั้นเท่าเดิม · รันซ้ำ changed false · skipped เท่ากับของเจ้าของ (ที่ข้ามด้วยกติกาสินค้าของสาขาอื่น)"),
  D("PR11", "X5", "[fix1 มติ 2 · hunt L1] setChannelPrices purgeDead:true (ขอบเขตทั้งสินค้าเท่านั้น): เจ้าของล้างแถวตาย (ช่องทางเก็บถาวร · สาขาเก็บถาวร/เลิกผูก) แถวที่ใช้ได้ id/ค่าเดิม · audit via purgeDead · ผู้จัดการ A → PERMISSION_DENIED ไม่เขียนอะไร · ไม่ส่งธง = แถวตายคงไว้ (PR1/PR3) · purgeDead ไม่ใช่ boolean → VALIDATION"),
  D("PR12", "X3", "[fix1 มติ 3 · hunt L2] บันทึกที่ไม่เปลี่ยนอะไร: ผลไม่ขึ้นกับลำดับแถว — ผู้จัดการ A ส่ง (LINEMAN, B) ค่าเดิม ก่อน/หลังแถว A ค่าเดิม → ok changed false ทั้งสองลำดับ ไม่มี audit · พนักงานทั้งสองลำดับ → PERMISSION_DENIED (ส่งเฉพาะแถว B = ลบแถว A ที่อยู่ในเอื้อม ⇒ ไม่ใช่กรณีไม่เปลี่ยน · ไม่ตรวจ)"),
  // ── RN ใบเสร็จ ──
  D("RN1", "-", "[§4 มติ 4] สาขา A ตั้ง taxBranchNo 00001 → ใบกำกับอย่างย่อของบิล A: payload shop.branchNo 00001 · HTML th \"สาขาที่ 00001\" · en \"Branch 00001\" · ESC/POS raster \"สาขาที่ 00001\" · สาขา B (ไม่ตั้ง) = สมุด 00000 → \"สำนักงานใหญ่\" ไม่มี 00001"),
  D("RN2", "-", "[§4] ที่อยู่/โทรต่อสาขา: A = ค่าสาขา · B = หัวระบบ (ที่อยู่) → สมุด (โทร) · ล้างที่อยู่ A (null) → หัวระบบ · receiptUnitOverride(settings, unit) ตรงค่าที่เก็บ / ค่าว่างหรือพัง = null ทั้งสามช่อง · posReceiptSettings ยังอ่านหัวระบบได้ · ตัวเขียนระดับระบบ (updatePosReceiptSettings) ไม่ทับ byUnit"),
  D("RN3", "X3", "[§4 มติ 4] updatePosReceiptUnitSettings: VALIDATION field taxBranchNo (1234 · 123456 · 12a45) · field unitId (C เก็บถาวร · D เลิกผูก · id มั่ว · สาขาร้าน T2) · คีย์แปลก · ที่อยู่ 201 ตัว → ไม่เขียนอะไร · PERMISSION_DENIED: ผู้จัดการ A / A+B ตั้ง taxBranchNo · ผู้จัดการ A ตั้งที่อยู่ B · พนักงาน · ผู้จัดการ A ตั้งที่อยู่ A ได้ · audit pos.settings.updated เบอร์ปิดบัง · ค่าเดิม = ไม่ลง audit · byUnit ของสาขาอื่น + header ไม่ถูกทับ"),
  D("RN4", "-", "[§4 · qc-pos-p1.10 P5] ระบบ POS2 ไม่ผูกสมุด (ใบเสร็จ RECEIPT) · สาขา D ตั้ง taxBranchNo 00009 ได้ (ตัวเขียนใช้กับ POS ใน ctx) → บิลของ D: ไม่มี shop.branchNo/taxId · HTML/ESC-POS ไม่มี \"สาขาที่\" / 00009"),
  D("RN5", "PAR", "[§4 O2] เลขใบเสร็จต่อสาขา/เดือน คงรูปแบบ: บิลแรกของ A และ B = YYYYMM-0001 (เดือนไทยปัจจุบัน) · บิลที่สองของ A = -0002 · ใบคืน A และ B = CNYYYYMM-0001 ทั้งคู่ · ไม่มีคำนำหน้าสาขา"),
  // ── RP รายงาน ──
  D("RP1", "X4", "[§5 มติ 5 Q6] reportChannels ต่อสาขา (วัน D0): แถวต่อรหัส {channelCode name billCount grossSatang refundSatang commissionSatang commissionVatSatang netSatang sharePct} ตรงตัวอ้างอิงของข้อสอบจากแถว PosSale · บิล VOIDED ไม่นับ · ใบคืนหักยอด+ค่าคอมฯ ส่วนของใบ · totals = Σ · เรียง net มาก→น้อย · CSV kind channels (หัวคอลัมน์ + แถวเท่ารายงาน)"),
  D("RP2", "X2", "[§5] ไม่ระบุสาขา (เจ้าของ) = Σ รายงาน A + B ต่อรหัส · ผู้จัดการ A ไม่ระบุสาขา = รายงานของ A เท่านั้น · ระบุสาขา E (ไม่มีบิล) = rows []"),
  D("RP3", "-", "[§5 P2.1 CD1] รวมตามรหัสข้ามสาขา: LINEMAN ของ A และ B = 1 แถว (บิล 2 · ยอด Σ) · ชื่อ: ระบุสาขา B = ชื่อช่องทางของ B · ระบุ A = ของ A · ทุกสาขา = ชื่อของสาขาใดสาขาหนึ่งที่มีรหัสนี้"),
  D("RP4", "-", "[§5 P1.18 Q9] ตัดวัน 240 นาที: บิล 02:00 น. ของ D0+1 อยู่วัน D0+1 เมื่อ cutoff 0 · ตั้ง 240 (updatePosGeneralSettings) → นับเป็น D0 · D0+1 ไม่มีแถว · ตรงตัวอ้างอิงที่ตัดวันเดียวกัน"),
  D("RP5", "PAR", "[§5 R6] reportOverview ส่วน \"channels\" = reportChannels (ยกเว้น generatedAt) · daily/payments ยัง = รายงานเดิม (OV PAR) · only:[channels] มีแค่ส่วนนี้ · ช่วง 93 วัน: channels VALIDATION แต่กราฟ ok · พนักงานไม่มีสิทธิ์รายงาน: ภาพรวม ok:true ทุกส่วน PERMISSION_DENIED"),
  // ── SK/TR คลัง ──
  D("SK1", "-", "[§6] posUnitInventoryMap(T, POS): units = A B E (ไม่มี C เก็บถาวร · D เลิกผูก) · A,B → คลังร่วม · E → คลังของตัวเอง · groups: คลังร่วม {A,B} shared true · คลัง E {E} shared false"),
  D("SK2", "PAR", "[§6 Q3] รับ 10 ที่ A → ขายที่ A 1 → onHand 9 + ที่เก็บปริยายของคลังที่แผนที่ชี้ = 9 · ขายที่ B 1 → 8 (คลังร่วม = สต็อกร่วม · พฤติกรรมเดิม)"),
  D("TR1", "PAR", "[§6 R16] posTransferStock ที่ A ไปที่เก็บของคลัง E → NOT_FOUND ไม่มีความเคลื่อนไหว · ตัวควบคุมบวก: ไปที่เก็บที่สองของคลังร่วม → ok"),
  // ── FU งานตามหลัง ──
  D("FU1", "P", "[k · ORACLE-EDIT qc-pos-p2.2 ST1] qc-pos-p2.2.mts มี function p22MigrationTouched(sql) ที่ตั้งอยู่เดี่ยว (ST1 ใช้กรองไฟล์) · ตรวจข้อความสังเคราะห์: index/enum/DROP-only ของวัตถุ P2.2 = true · ตาราง PosOrderLine ที่ใช้ชนิด PosPriceSource / ตารางอื่น / คอมเมนต์ = false · migration จริง = ไฟล์ 20261204100000_pos_p22_prices ไฟล์เดียว"),
  D("FU2", "X5", "[m(i) · P2.3U F1] ถอดกลุ่มตัวเลือก (setProductOptionGroups) → PosRecipeChoiceLine ของตัวเลือกกลุ่มนั้นถูกลบ แถวของกลุ่มอื่นคงอยู่ · ผูกกลับ = ไม่มีแถวเก่าฟื้น · เก็บกลุ่ม (menu.archiveOptionGroup) → แถวของกลุ่มนั้นทุกสินค้าถูกลบ · สินค้าที่ไม่ใช้กลุ่มนั้นไม่เปลี่ยน"),
  D("FU3", "S", "[l-price] CatalogError มี field + reason · catalog-price-actions.ts refusalOf ส่ง field + reason ต่อ · price-shared.ts PRICE_REFUSAL_REASONS มี PRICE_ROW_DEAD BULK_TOO_MANY · ข้อความ price.errors.<camel> ครบ th (ไทย) + en (ไม่มีอักษรไทย)"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราวทั้งสองเหลือ 0 แถวทุกตารางที่มี tenantId (ราคา · บิล · ตัวนับ · ช่องทาง · audit · outbox · คลัง · ค่าตั้ง …) + แถว Tenant ถูกลบ"),
  D("Z2", "-", "ไม่มีแถวของรอบนี้นอกร้านชั่วคราว (บิล/เครื่อง/สินค้า/audit/outbox/membership) · ลายนิ้วมือ PosProductChannelPrice + PosRecipeChoiceLine + PosReceiptCounter ของร้านอื่นก่อน = หลัง"),
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
  const full = id.startsWith("P2.11-") ? id : `P2.11-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${(TITLE.get(full) ?? "").slice(0, 140)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
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
/** คำปฏิเสธแบบใดก็ได้ (คืนค่า หรือ throw error ที่มี .code — แบบ CatalogError) */
const codeIs = (r: Any, code: string) => r?.ok === false && String(r.code) === code && !r.missing;
/** สำเร็จ = ไม่ใช่คำปฏิเสธ/ไม่ throw */
const okish = (r: Any) => r !== null && r !== undefined && r.ok !== false;
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1]!;
  return "THROW";
}
const MISSING = "ยังไม่มีโมดูล/ฟังก์ชัน";
/** เรียกฟังก์ชันของโมดูล — throw = คำปฏิเสธที่พก code + field + reason ของ error (CatalogError ของ P2.11) */
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} — ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    const o = e as { field?: unknown; reason?: unknown; message?: unknown } | null;
    return {
      ok: false,
      code: errCode(e),
      message: String(o?.message ?? e).slice(0, 200),
      threw: true,
      ...(typeof o?.field === "string" ? { field: o.field } : {}),
      ...(typeof o?.reason === "string" ? { reason: o.reason } : {}),
    };
  }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} — ${name}`, missing: true };
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
const camel = (code: string) => code.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const P8 = (p: string[]) => p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "");
const J = (v: unknown) => JSON.stringify(v);
/** ครึ่งขึ้นของ a×b/c (จำนวนเต็มไม่ติดลบ) — ตัวอ้างอิงของข้อสอบเอง */
const halfUp = (a: number, b: number, c: number) => (c > 0 ? Math.floor((2 * a * b + c) / (2 * c)) : 0);

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
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
/** ช่วงของ const/ออบเจกต์ที่เริ่มด้วย marker (ถึงวงเล็บปิดคู่แรก) */
function constBody(src: string, marker: string): string {
  const i0 = src.indexOf(marker);
  if (i0 < 0) return "";
  const eq = src.indexOf("=", i0);
  if (eq < 0) return "";
  const i = eq + 1;
  const open = src.slice(i).search(/[[{]/);
  if (open < 0) return "";
  const start = i + open;
  const o = src[start]!;
  const c = o === "[" ? "]" : "}";
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    if (src[j] === o) depth++;
    else if (src[j] === c && --depth === 0) return src.slice(start, j + 1);
  }
  return "";
}
/** ข้อความของฟังก์ชัน `name` (ตั้งแต่คำว่า function ถึงวงเล็บปีกกาปิดของตัวฟังก์ชัน) — ไม่พบ = "" */
function fnText(src: string, name: string): string {
  const m = new RegExp(`(export\\s+)?(async\\s+)?function\\s+${name}\\s*[(<]`).exec(src);
  if (!m) return "";
  // วงเล็บปีกกาแรกหลังวงเล็บปิดของพารามิเตอร์ (ข้ามชนิดผลลัพธ์ที่เป็นออบเจกต์ด้วยการนับวงเล็บกลม)
  let i = src.indexOf("(", m.index);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) break;
  }
  // ชนิดผลลัพธ์อาจมี { … } (Promise<{…}>) — หา "{" ที่ตามหลัง ")" ระดับ 0 และไม่อยู่ใน <…>
  let angle = 0;
  let j = i + 1;
  for (; j < src.length; j++) {
    const ch = src[j]!;
    if (ch === "<") angle++;
    else if (ch === ">" && src[j - 1] !== "=") angle = Math.max(0, angle - 1);
    else if (ch === "{" && angle === 0) {
      // ชนิดผลลัพธ์แบบ `: { … }` ตรง ๆ (ไม่มี Promise) — ถ้าก่อนหน้าคือ ":" ให้ข้ามก้อนนี้
      const before = src.slice(i + 1, j).trim();
      if (before.endsWith(":") || /\|\s*$/.test(before)) {
        let d = 0;
        for (; j < src.length; j++) {
          if (src[j] === "{") d++;
          else if (src[j] === "}" && --d === 0) break;
        }
        continue;
      }
      break;
    }
  }
  let d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}" && --d === 0) return src.slice(m.index, k + 1);
  }
  return "";
}
/** ไฟล์ไม่ import prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (ค่า) — ไฟล์ "shared" ที่จอ/--no-db โหลดได้ */
const purePath = (f: string): boolean => {
  const s = stripComments(rd(f));
  if (!s) return false;
  const valueImports = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const reexports = [...s.matchAll(/^\s*export\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const dyn = [...s.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);
  return ![...valueImports, ...reexports, ...dyn].some((p) => /@prisma\/client|\/db$|^\.\/db$|@\/lib\/core\/db|@\/lib\/core\/(rbac|context|audit)|@\/lib\/modules\/(?!pos\/[a-z-]+-shared)|^\.\/(?![a-z-]+-shared$)[a-z-]+$/.test(p));
};

// ── git (ฐาน = หมุดของเลน 05975437 · สำรอง f164d9d6) ──
const BASE_REV = "f164d9d6";
function git(args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }).toString("utf8");
  } catch {
    return null;
  }
}
const LANE_PIN = "adfcee44"; // ORACLE-EDIT ผู้คุม 25.10 (P5.3 fix1 merge (barcode index · register*.ts/RegisterScreen.tsx/route) CD-RP29 · re-pin 4016a352 → adfcee44) · ORACLE-EDIT ผู้คุม 24.10 (P4.3 fix1+fix2 + P6.1 fix1+fix2 merge CD-RP25 · re-pin 98f60761 → 4016a352) · ORACLE-EDIT ผู้คุม 23.10 (P5.2 D+E+device merge CD-RP24 · re-pin 6b1f84a5 → 98f60761) · ORACLE-EDIT ผู้คุม 23.10 (P5.1 batch C merge CD-RP23 · re-pin e9b765b4 → 6b1f84a5) · ORACLE-EDIT ผู้คุม 23.10 (P5.1 batch B merge CD-RP22 · re-pin c4584062 → e9b765b4) · ORACLE-EDIT ผู้คุม 23.10 (P5.2 fix A+B+C+F merge CD-RP21 · re-pin 6668b832 → c4584062) · ORACLE-EDIT ผู้คุม 23.10 (P3 close freeze CD-RP19 · re-pin 9cfa81bb → 6668b832) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP10 P3-SKEL merge · re-pin bafdf89f → 9cfa81bb) · ORACLE-EDIT ผู้คุม 21.10 (CD-RP9 P3.6 merge · re-pin 02b67f91 → bafdf89f) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP5 · product tip after P3.7 merge · re-pin a2c9a4c7 → 02b67f91) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP4 · product tip after P3.8 merge · re-pin 8bded5a7 → a2c9a4c7) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP1b · settings-general re-resolution · re-pin 0617d17b → 8bded5a7) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP1 lane-pin · re-pin 3b8a228d → 0617d17b) · ORACLE-EDIT ผู้คุม 16.10 (HF-FU2 lane-pin · re-pin 05975437 → 3b8a228d) · ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin · มติ 3 · TL-1 · CD-B1 re-pin → merge 05975437): หมุดคงที่ 05975437 (ฐานของ P2.14 = first parent ของ merge) แทนฐานร่วมกับสาขาต้นทาง
const MB = (() => {
  const r = git(["rev-parse", "--verify", "-q", `${LANE_PIN}^{commit}`]); // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin · มติ 3 · TL-1 · CD-B1 re-pin → merge 05975437): หมุดคงที่ 05975437 (ฐานของ P2.14 = first parent ของ merge) แทนฐานร่วมกับสาขาต้นทาง
  return r ? r.trim() : "";
})();
const BASES = [MB, BASE_REV].filter((x, i, a) => !!x && a.indexOf(x) === i);
/** ไฟล์ไม่ถูกแตะ = เนื้อหาเท่ากับที่ฐานใดฐานหนึ่ง (ไม่มีทั้งสองฝั่ง = ไม่แตะ) */
function untouched(path: string): boolean {
  const now = existsSync(join(ROOT, path)) ? readFileSync(join(ROOT, path), "utf8") : null;
  return BASES.some((b) => (git(["show", `${b}:${path}`]) ?? null) === now);
}
const lsAt = (rev: string, dir: string): string[] => (git(["ls-tree", "-r", "--name-only", rev, "--", dir]) ?? "").split("\n").filter(Boolean);

// ═════════════════════════ ชื่อที่ข้อสอบ "ตั้ง" (ตารางชื่อในโน้ต = สัญญาของผู้สร้าง) ═════════════════════════
const POS_DIR = "src/lib/modules/pos";
const F = {
  catalog: `${POS_DIR}/catalog.ts`,
  catalogLegacy: `${POS_DIR}/catalog-legacy.ts`,
  priceActions: `${POS_DIR}/catalog-price-actions.ts`,
  priceShared: `${POS_DIR}/price-shared.ts`,
  recipeActions: `${POS_DIR}/recipe-actions.ts`,
  reports: `${POS_DIR}/reports.ts`,
  overview: `${POS_DIR}/report-overview.ts`,
  receipt: `${POS_DIR}/receipt.ts`,
  receiptRender: `${POS_DIR}/receipt-render.ts`,
  rsShared: `${POS_DIR}/receipt-settings-shared.ts`,
  rs: `${POS_DIR}/receipt-settings.ts`,
  p22: "scripts/qc-pos-p2.2.mts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
};
const NEW_CATALOG_FNS = ["copyUnitPrices", "unitPriceMatrix"] as const;
const MAP_FN = "posUnitInventoryMap";
const REASONS = ["PRICE_ROW_DEAD", "BULK_TOO_MANY"] as const;
const AUDIT_CP = "pos.product.channelPrice";
const AUDIT_SETTINGS = "pos.settings.updated";
const P22_FILTER_FN = "p22MigrationTouched";
const P22_MIGRATION = "20261204100000_pos_p22_prices";
/** คีย์ของแถวรายงานช่องทาง (§5 · ตัวเลขทั้งหมดเป็นสตางค์ยกเว้น sharePct) */
const CH_ROW_KEYS = ["channelCode", "name", "billCount", "grossSatang", "refundSatang", "commissionSatang", "commissionVatSatang", "netSatang", "sharePct"] as const;
const CH_NUM_KEYS = ["billCount", "grossSatang", "refundSatang", "commissionSatang", "commissionVatSatang", "netSatang"] as const;
/** ไฟล์เลน A (P2.9b ถืออยู่ · §3 · มติ 9) */
const LANE_A_FIXED = [`${POS_DIR}/service.ts`, `${POS_DIR}/account-bridge.ts`, "src/lib/outbox-consumers.ts"];
const LANE_A_RE = new RegExp(`^${POS_DIR.replace(/\//g, "\\/")}\\/(register[^/]*|tender[^/]*|refund[^/]*)\\.(ts|tsx)$`);
const MARKED_FILES = [F.receipt, F.receiptRender];

const srcOf = (f: string) => stripComments(rd(f));
/** ไฟล์ใน src/lib ที่ export ชื่อนี้ */
const exportersOf = (name: string) => walk("src/lib").filter((f) => exportsFn(srcOf(f), name));
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4", "FU1", "FU3"].map((x) => `P2.11-${x}`);
const skipReasons: string[] = [];
for (const n of NEW_CATALOG_FNS) if (!exportsFn(srcOf(F.catalog), n)) skipReasons.push(`ยังไม่มี export ${n} (catalog.ts)`);
if (exportersOf(MAP_FN).length !== 1) skipReasons.push(`ยังไม่มี export ${MAP_FN} ที่เดียวใน src/lib`);
if (!exportsFn(srcOf(F.reports), "reportChannels")) skipReasons.push("ยังไม่มี export reportChannels (reports.ts)");
if (!exportsFn(srcOf(F.rsShared), "receiptUnitOverride")) skipReasons.push("ยังไม่มี export receiptUnitOverride (receipt-settings-shared.ts)");
if (!exportsFn(srcOf(F.rs), "updatePosReceiptUnitSettings")) skipReasons.push("ยังไม่มี export updatePosReceiptUnitSettings (receipt-settings.ts)");
if (!/["']channels["']/.test(constBody(srcOf(F.overview), "export const OVERVIEW_SECTIONS"))) skipReasons.push('OVERVIEW_SECTIONS ยังไม่มี "channels" (report-overview.ts)');

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
const readJson = (f: string, p: string[]): Any => {
  try {
    return JSON.parse(rd(f) || "null");
  } catch (e) {
    p.push(`${f} อ่าน JSON ไม่ได้: ${(e as Error).message.slice(0, 40)}`);
    return null;
  }
};
const dig = (o: Any, path: string): Any => path.split(".").reduce((a: Any, k) => (isRecord(a) ? a[k] : undefined), o);
/** คีย์ข้อความ th (ต้องมีอักษรไทย) + en (ต้องไม่มีอักษรไทย) */
function msgPair(path: string, p: string[]): void {
  const th = readJson(F.msgTh, p);
  const en = readJson(F.msgEn, p);
  const a = dig(th, path);
  const b = dig(en, path);
  if (typeof a !== "string" || !a.trim()) p.push(`th: ไม่มี ${path}`);
  else if (!THAI.test(a)) p.push(`th: ${path} ไม่ใช่ไทย`);
  if (typeof b !== "string" || !b.trim()) p.push(`en: ไม่มี ${path}`);
  else if (THAI.test(b)) p.push(`en: ${path} มีอักษรไทย (${short(b, 30)})`);
}
/** ผู้เขียนตาราง (prisma delegate หรือ SQL ดิบ) ใน src */
const writersOf = (delegate: string, table: string) =>
  walk("src")
    .filter((f) => new RegExp(`\\.${delegate}\\s*\\.\\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\\b|(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+"${table}"`).test(srcOf(f)))
    .map((f) => f.replace(`${POS_DIR}/`, ""));
const WRITE_RE = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw|\baudit\s*\(|writeAudit\s*\(/;

async function runStatic(): Promise<void> {
  console.log(`\n── ST ข้อสถิต (ไม่แตะ DB · ฐาน ${BASES.map((b) => b.slice(0, 8)).join(" / ") || "ไม่มี"}) ──`);
  // ST1 ไม่มี migration / schema เปลี่ยน
  {
    const p: string[] = [];
    if (!BASES.length) p.push("หา merge-base / f164d9d6 ไม่ได้ (git fetch origin session/pos ก่อน)");
    const changed = BASES.map((b) => (git(["diff", "--name-only", b, "--", "prisma"]) ?? "?").split("\n").filter(Boolean));
    const untracked = (git(["ls-files", "--others", "--exclude-standard", "--", "prisma"]) ?? "").split("\n").filter(Boolean);
    const best = changed.length ? changed.reduce((a, b) => (a.length <= b.length ? a : b)) : ["?"];
    if (best.length) p.push(`prisma/ ต่างจากฐาน: ${best.slice(0, 5).join(", ")}`);
    if (untracked.length) p.push(`ไฟล์ใหม่ใต้ prisma/: ${untracked.slice(0, 5).join(", ")}`);
    chk("ST1", p.length === 0, "prisma/ เท่าฐาน · ไม่มีไฟล์ใหม่", P8(p) || "ไม่มี migration/schema เปลี่ยน");
  }
  // ST2 ผู้เขียนเดียว · แผนที่คลัง export ที่เดียว · ฟังก์ชันใหม่ · อ่านอย่างเดียว
  {
    const p: string[] = [];
    const cpw = writersOf("posProductChannelPrice", "PosProductChannelPrice");
    if (cpw.join(",") !== "catalog.ts") p.push(`ผู้เขียน PosProductChannelPrice = ${cpw.join(",") || "ไม่มี"} (คาด catalog.ts)`);
    const rcw = writersOf("posRecipeChoiceLine", "PosRecipeChoiceLine");
    if (rcw.join(",") !== "catalog.ts") p.push(`ผู้เขียน PosRecipeChoiceLine = ${rcw.join(",") || "ไม่มี"} (คาด catalog.ts — qc-pos-p2.3 ST3)`);
    const ex = exportersOf(MAP_FN);
    if (ex.length !== 1) p.push(`export ${MAP_FN} ${ex.length} ไฟล์ (${ex.join(",") || "—"} · คาด 1)`);
    const dupDefs = walk("src").filter((f) => /\bfunction\s+inventorySystemsOfPos\b|\binventorySystemsOfPos\s*=\s*(async\s*)?\(/.test(srcOf(f)));
    if (dupDefs.length) p.push(`ยังมี inventorySystemsOfPos ใน ${dupDefs.join(",")}`);
    const ra = srcOf(F.recipeActions);
    if (/type:\s*["']INVENTORY["']/.test(ra)) p.push("recipe-actions.ts ยังค้นลิงก์ INVENTORY เอง (สำเนาของ inventorySystemsOfPos)");
    if (!new RegExp(`\\b${MAP_FN}\\b`).test(ra)) p.push(`recipe-actions.ts ไม่ใช้ ${MAP_FN}`);
    const cat = srcOf(F.catalog);
    if (!new RegExp(`\\b${MAP_FN}\\b`).test(cat)) p.push(`catalog.ts ไม่ใช้ ${MAP_FN}`);
    for (const n of NEW_CATALOG_FNS) if (!exportsFn(cat, n)) p.push(`catalog.ts ไม่ export ${n}`);
    const um = fnText(cat, "unitPriceMatrix");
    if (um && WRITE_RE.test(um)) p.push("unitPriceMatrix มีคำสั่งเขียน/audit (ต้องอ่านอย่างเดียว)");
    const rc = fnText(srcOf(F.reports), "reportChannels");
    if (rc && WRITE_RE.test(rc)) p.push("reportChannels มีคำสั่งเขียน (ต้องอ่านอย่างเดียว)");
    chk("ST2", p.length === 0, "ผู้เขียนเดียว catalog.ts · แผนที่คลัง export ที่เดียว · ไม่มีสำเนา · ฟังก์ชันใหม่อ่านอย่างเดียว", P8(p) || `ครบ (${ex[0] ?? "—"})`);
  }
  // ST3 รายงาน/ภาพรวม/ใบเสร็จต่อสาขา + ข้อความ
  {
    const p: string[] = [];
    const rep = srcOf(F.reports);
    if (!/["']channels["']/.test(constBody(rep, "export const REPORT_KINDS"))) p.push('REPORT_KINDS ไม่มี "channels"');
    if (!/\bchannels\s*:/.test(constBody(rep, "export const CSV_HEADERS"))) p.push("CSV_HEADERS ไม่มี channels");
    if (!exportsFn(rep, "reportChannels")) p.push("reports.ts ไม่ export reportChannels");
    if (!/["']channels["']/.test(constBody(srcOf(F.overview), "export const OVERVIEW_SECTIONS"))) p.push('OVERVIEW_SECTIONS ไม่มี "channels"');
    if (!exportsFn(srcOf(F.rsShared), "receiptUnitOverride")) p.push("receipt-settings-shared.ts ไม่ export receiptUnitOverride");
    else if (!purePath(F.rsShared)) p.push("receipt-settings-shared.ts import prisma/db/โมดูลเซิร์ฟเวอร์ (ต้องบริสุทธิ์)");
    const rs = srcOf(F.rs);
    if (!exportsFn(rs, "updatePosReceiptUnitSettings")) p.push("receipt-settings.ts ไม่ export updatePosReceiptUnitSettings");
    if (!/byUnit/.test(rs + srcOf(F.rsShared))) p.push("receipt-settings*.ts ไม่มีคีย์ byUnit");
    msgPair("report.kinds.channels", p);
    chk("ST3", p.length === 0, "channels ในรายงาน/CSV/ภาพรวม · ตัวอ่าน/ตัวเขียนค่าใบเสร็จต่อสาขา · ข้อความ th/en", P8(p) || "ครบ");
  }
  // ST4 ไฟล์เลน A ไม่ถูกแตะ · receipt*.ts เฉพาะ hunk ที่มีเครื่องหมาย
  {
    const p: string[] = [];
    const now = [...walk(POS_DIR).filter((f) => LANE_A_RE.test(f)), ...walk("src/lib/modules/account")];
    const before = BASES.length ? [...lsAt(BASES[0]!, POS_DIR).filter((f) => LANE_A_RE.test(f)), ...lsAt(BASES[0]!, "src/lib/modules/account")] : [];
    const files = [...new Set([...LANE_A_FIXED, ...now, ...before])];
    const touched = files.filter((f) => !untouched(f));
    if (touched.length) p.push(`ไฟล์เลน A ถูกแตะ: ${touched.map((f) => f.split("/").pop()).join(", ")}`);
    for (const f of MARKED_FILES) {
      if (untouched(f)) continue;
      const diff = BASES.length ? (git(["diff", "-U0", BASES[0]!, "--", f]) ?? "") : "";
      const hunks = diff.split(/\n(?=@@ )/).filter((h) => h.startsWith("@@ "));
      const bad = hunks.filter((h) => !h.split("\n").some((l) => l.startsWith("+") && /P2\.11/.test(l)));
      if (bad.length) p.push(`${f.split("/").pop()}: ${bad.length}/${hunks.length} hunk ไม่มีเครื่องหมาย P2.11 (${short(bad[0]!.split("\n")[0], 40)})`);
    }
    chk("ST4", p.length === 0, "ไฟล์เลน A เท่าฐาน · receipt*.ts มีแต่ hunk ที่มีเครื่องหมาย P2.11", P8(p) || `ครบ (${files.length} ไฟล์เลน A)`);
  }
  // FU3 field + reason ของคำปฏิเสธราคา + ข้อความ
  {
    const p: string[] = [];
    const cat = srcOf(F.catalog);
    const cls = (/class\s+CatalogError\b[\s\S]*?\n\}/.exec(cat) ?? [""])[0];
    if (!cls) p.push("ไม่พบ class CatalogError");
    else for (const k of ["field", "reason"]) if (!new RegExp(`readonly\\s+${k}\\??\\s*:`).test(cls)) p.push(`CatalogError ไม่มี readonly ${k}`);
    const act = srcOf(F.priceActions);
    const ro = fnText(act, "refusalOf");
    for (const k of ["field", "reason"]) if (!new RegExp(`\\b${k}\\b`).test(ro)) p.push(`catalog-price-actions.ts refusalOf ไม่ส่ง ${k} ต่อ`);
    if (!/reason\?\s*:/.test(act)) p.push("PriceActionRefusal ไม่มี reason?");
    const rs = constBody(srcOf(F.priceShared), "export const PRICE_REFUSAL_REASONS");
    if (!rs) p.push("price-shared.ts ไม่มี export const PRICE_REFUSAL_REASONS");
    const listed = [...rs.matchAll(/["']([A-Z][A-Z0-9_]+)["']/g)].map((m) => m[1]!);
    for (const r of REASONS) if (!listed.includes(r)) p.push(`PRICE_REFUSAL_REASONS ไม่มี ${r}`);
    for (const r of new Set([...REASONS, ...listed])) msgPair(`price.errors.${camel(r)}`, p);
    chk("FU3", p.length === 0, "CatalogError field/reason · action ส่งต่อ · PRICE_REFUSAL_REASONS · price.errors.* th/en", P8(p) || `ครบ (${listed.join(",")})`);
  }
}

// ═════════════════════════ 1b. FU1 — ตัวกรอง ST1 ของ qc-pos-p2.2 (บริสุทธิ์) ═════════════════════════
/** ข้อความสังเคราะห์ → ผลที่ต้องได้ (true = แตะวัตถุของ P2.2) */
const FU1_CASES: readonly [string, string, boolean][] = [
  ["index-only CREATE UNIQUE INDEX", 'CREATE UNIQUE INDEX IF NOT EXISTS "PosProductChannelPrice_x_key" ON "PosProductChannelPrice" ("productId");', true],
  ["index-only PosPriceRule", 'CREATE INDEX "PosPriceRule_tenant_idx" ON "PosPriceRule"("tenantId");', true],
  ["enum-only ADD VALUE", `ALTER TYPE "PosPriceSource" ADD VALUE 'MANUAL';`, true],
  ["DROP INDEX มือ", 'DROP INDEX IF EXISTS "PosProductChannelPrice_product_code_unit_key";', true],
  ["DROP TABLE", 'DROP TABLE "PosPriceRule";', true],
  ["DROP TYPE", 'DROP TYPE IF EXISTS "PosPriceRuleKind";', true],
  ["DROP COLUMN ของ PosSaleLine", 'ALTER TABLE "PosSaleLine" DROP COLUMN "listPriceSatang";', true],
  ["DROP CONSTRAINT CHECK", 'ALTER TABLE "PosProductChannelPrice" DROP CONSTRAINT "PosProductChannelPrice_row_check";', true],
  ["migration P2.2 เดิม", 'SET lock_timeout = \'5s\';\nCREATE TABLE IF NOT EXISTS "PosPriceRule" ("id" TEXT NOT NULL);\nALTER TABLE "PosSaleLine" ADD COLUMN IF NOT EXISTS "priceSource" "PosPriceSource";', true],
  ["ตาราง P2.8 ใช้ชนิด PosPriceSource", 'CREATE TABLE "PosOrderLine" (\n  "id" TEXT NOT NULL,\n  "listPriceSatang" INTEGER,\n  "priceSource" "PosPriceSource",\n  "priceRuleId" TEXT\n);', false],
  ["คอลัมน์ชื่อเดียวกันบนตารางอื่น", 'ALTER TABLE "PosOrderLine" ADD COLUMN "priceRuleId" TEXT;', false],
  ["คอลัมน์อื่นของ PosSaleLine", 'ALTER TABLE "PosSaleLine" ADD COLUMN "giftCardId" TEXT;', false],
  ["index ตารางอื่น", 'CREATE INDEX "PosSale_unit_idx" ON "PosSale"("unitId");', false],
  ["คอมเมนต์ล้วน", '-- แตะ "PosPriceRule" ภายหลัง\nSELECT 1;', false],
];
async function runFu1(): Promise<void> {
  const p: string[] = [];
  const src = rd(F.p22);
  const text = fnText(src, P22_FILTER_FN);
  let fn: ((sql: string) => unknown) | null = null;
  if (!text) p.push(`${F.p22} ยังไม่มี function ${P22_FILTER_FN}(sql) (ORACLE-EDIT k ยังไม่ทำ)`);
  else {
    const uses = (stripComments(src).match(new RegExp(`\\b${P22_FILTER_FN}\\s*\\(`, "g")) ?? []).length;
    if (uses < 2) p.push(`${P22_FILTER_FN} ไม่ถูก ST1 เรียกใช้ (พบ ${uses} ครั้ง)`);
    try {
      const ts = (await import("typescript" as string)) as Any;
      const tsm = ts.default ?? ts;
      const js = String(tsm.transpileModule(text.replace(/^export\s+/, ""), { compilerOptions: { target: tsm.ScriptTarget.ES2020, module: tsm.ModuleKind.ESNext } }).outputText);
      fn = new Function(`${js}\nreturn ${P22_FILTER_FN};`)() as (sql: string) => unknown;
    } catch (e) {
      p.push(`แปล/โหลด ${P22_FILTER_FN} ไม่ได้ (ต้องตั้งอยู่เดี่ยว ไม่อ้างตัวแปรนอก): ${(e as Error).message.slice(0, 80)}`);
    }
  }
  if (fn) {
    for (const [lbl, sql, want] of FU1_CASES) {
      let got: unknown;
      try {
        got = fn(sql);
      } catch (e) {
        got = `throw ${(e as Error).message.slice(0, 30)}`;
      }
      if (got !== want) p.push(`${lbl} → ${String(got)} (คาด ${want})`);
    }
    const real = walk("prisma/migrations", [], /\.sql$/).filter((f) => {
      try {
        return fn!(rd(f)) === true;
      } catch {
        return false;
      }
    });
    const names = real.map((f) => f.split("/").slice(-2, -1)[0] ?? f);
    if (names.join(",") !== P22_MIGRATION) p.push(`migration จริงที่ตัวกรองจับ = ${names.join(",") || "—"} (คาด ${P22_MIGRATION})`);
  }
  chk("FU1", p.length === 0, `${P22_FILTER_FN} ตั้งอยู่เดี่ยว · ${FU1_CASES.length} กรณีสังเคราะห์ · migration จริง 1 ไฟล์`, P8(p) || "ครบ");
}

// ═════════════════════════ 1c. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อ (สถิต + FU1 บริสุทธิ์ · ไม่โหลด prisma)`);
  let crashedS = "";
  try {
    await runStatic();
    await runFu1();
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
const PQC = envMod.PQC as Any;
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

// ═════════════════════════ 3. ด่าน SKIP ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
let seedOk = false;
try {
  seedOk = !!(await envMod.resolvePosScope(prisma, "coffee"));
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!seedOk) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed — รัน scripts/seed-pos-qc.mts ก่อน (ใช้ userId เจ้าของ/แคชเชียร์)");
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.11 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ${seedOk ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: seedOk })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const catalogMod = await tryImport("@/lib/modules/pos/catalog");
const priceMod = await tryImport("@/lib/modules/pos/price");
const register = await tryImport("@/lib/modules/pos/register");
const chMod = await tryImport("@/lib/modules/pos/channel");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const svc = await tryImport("@/lib/modules/pos/service");
const repMod = await tryImport("@/lib/modules/pos/reports");
const ovMod = await tryImport("@/lib/modules/pos/report-overview");
const receiptMod = await tryImport("@/lib/modules/pos/receipt");
const renderMod = await tryImport("@/lib/modules/pos/receipt-render");
const rsMod = await tryImport("@/lib/modules/pos/receipt-settings");
const rsShared = await tryImport("@/lib/modules/pos/receipt-settings-shared");
const genMod = await tryImport("@/lib/modules/pos/settings-general");
const stockMod = await tryImport("@/lib/modules/pos/stock-count");
const menuMod = await tryImport("@/lib/modules/restaurant/menu");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const invSvc = await tryImport("@/lib/modules/inventory/service");
const consMod = await tryImport("@/lib/outbox-consumers");
/** โมดูลที่ export posUnitInventoryMap (ที่เดียว — ST2) */
const mapFile = exportersOf(MAP_FN)[0] ?? "";
const mapMod = mapFile ? await tryImport(`@/${mapFile.replace(/^src\//, "").replace(/\.(ts|tsx)$/, "")}`) : null;

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p2.11-${RAND}`;
const T_SLUG = `posqc-p211-${RAND}`;
const T2_SLUG = `posqc-p211-${RAND}-t2`;
const KEY_PREFIX = `qc211-${RAND}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";
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

// ═════════════════════════ 5. ตัวอ้างอิงรายงานช่องทาง (ของข้อสอบเอง · จากแถว PosSale ดิบ) ═════════════════════════
type ChSale = {
  id: string;
  unitId: string;
  status: string;
  docType: string;
  channelCode: string | null;
  sourceModule: string | null;
  grandTotalSatang: number;
  channelCommissionSatang: number;
  channelCommissionVatSatang: number;
  createdAt: Date;
};
type ChRow = { channelCode: string; billCount: number; grossSatang: number; refundSatang: number; commissionSatang: number; commissionVatSatang: number; netSatang: number; sharePct: number };
/** วันธุรกิจเวลาไทยของเวลา t (cutoff นาทีหลังเที่ยงคืน) */
const bizDate = (t: Date, cutoffMin: number) => new Date(t.getTime() + 7 * 3_600_000 - cutoffMin * 60_000).toISOString().slice(0, 10);
/**
 * §5 — ตัวอ้างอิง: บิล SALE ที่ไม่ VOIDED (PAID/REFUNDED) นับบิล + ยอด + ค่าคอมฯ · ใบ REFUND ที่ไม่ VOIDED หักยอด + ค่าคอมฯ ส่วนของใบ ·
 * รหัส = channelCode ?? (ECOM → WEB · อื่น STORE) · net = gross − refund − commission − commissionVat · sharePct = round1(100 × net / Σ net) (Σ ≤ 0 → 0) ·
 * เรียง net มาก→น้อย แล้วรหัส ก→ฮ
 */
function expChannels(sales: ChSale[], unitIds: string[], from: string, to: string, cutoffMin: number): { rows: ChRow[]; totals: Omit<ChRow, "channelCode" | "sharePct"> } {
  const by = new Map<string, ChRow>();
  for (const s of sales) {
    if (!unitIds.includes(s.unitId) || s.status === "VOIDED") continue;
    const d = bizDate(s.createdAt, cutoffMin);
    if (d < from || d > to) continue;
    const code = s.channelCode ?? (s.sourceModule === "ECOM" ? "WEB" : "STORE");
    const r = by.get(code) ?? { channelCode: code, billCount: 0, grossSatang: 0, refundSatang: 0, commissionSatang: 0, commissionVatSatang: 0, netSatang: 0, sharePct: 0 };
    const sign = s.docType === "REFUND" ? -1 : 1;
    if (s.docType === "REFUND") r.refundSatang += s.grandTotalSatang;
    else {
      r.billCount += 1;
      r.grossSatang += s.grandTotalSatang;
    }
    r.commissionSatang += sign * s.channelCommissionSatang;
    r.commissionVatSatang += sign * s.channelCommissionVatSatang;
    by.set(code, r);
  }
  const rows = [...by.values()];
  for (const r of rows) r.netSatang = r.grossSatang - r.refundSatang - r.commissionSatang - r.commissionVatSatang;
  const totalNet = sum(rows.map((r) => r.netSatang));
  for (const r of rows) r.sharePct = totalNet > 0 ? Math.round((1000 * r.netSatang) / totalNet) / 10 : 0;
  rows.sort((a, b) => b.netSatang - a.netSatang || a.channelCode.localeCompare(b.channelCode));
  const totals = {
    billCount: sum(rows.map((r) => r.billCount)),
    grossSatang: sum(rows.map((r) => r.grossSatang)),
    refundSatang: sum(rows.map((r) => r.refundSatang)),
    commissionSatang: sum(rows.map((r) => r.commissionSatang)),
    commissionVatSatang: sum(rows.map((r) => r.commissionVatSatang)),
    netSatang: totalNet,
  };
  return { rows, totals };
}
/** เทียบผลรายงานกับตัวอ้างอิง (คีย์ตัวเลข + sharePct + ลำดับ) */
function cmpChannels(label: string, r: Any, exp: ReturnType<typeof expChannels>, p: string[]): void {
  if (r?.ok !== true) return void p.push(`${label}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
  const rows: Any[] = Array.isArray(r.report?.rows) ? r.report.rows : [];
  if (r.report?.kind !== "channels") p.push(`${label}: kind ${r.report?.kind}`);
  const got = rows.map((x) => x?.channelCode).join(",");
  const want = exp.rows.map((x) => x.channelCode).join(",");
  if (got !== want) p.push(`${label}: ลำดับรหัส ${got || "—"} (คาด ${want || "—"})`);
  for (const e of exp.rows) {
    const g = rows.find((x) => x?.channelCode === e.channelCode);
    if (!g) continue;
    const miss = CH_ROW_KEYS.filter((k) => !(k in g));
    if (miss.length) p.push(`${label} ${e.channelCode}: ไม่มีคีย์ ${miss.join(",")}`);
    for (const k of [...CH_NUM_KEYS, "sharePct"] as const) if (g[k] !== e[k]) p.push(`${label} ${e.channelCode}.${k} ${g[k]} (คาด ${e[k]})`);
    if (typeof g.name !== "string" || !g.name.trim()) p.push(`${label} ${e.channelCode}: name ว่าง`);
  }
  const t = r.report?.totals ?? {};
  for (const k of CH_NUM_KEYS) if (t[k] !== exp.totals[k]) p.push(`${label} totals.${k} ${t[k]} (คาด ${exp.totals[k]})`);
}

// ═════════════════════════ 6. ข้อที่ต้องมี DB ═════════════════════════
async function runDb() {
  const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && id !== "P2.11-Z1" && id !== "P2.11-Z2");
  if (!seedOk) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed (scripts/seed-pos-qc.mts) — ข้อ DB ตรวจไม่ได้");
    return;
  }
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} ──`);
  console.log("   POS ผูกสมุด VAT 7% (ใบกำกับอย่างย่อ · สาขา 00000) · สาขา A B (คลังร่วม) · C (เก็บถาวรภายหลัง) · D (ย้ายไป POS2 ภายหลัง) · E (คลังของตัวเอง) · ร้าน T2 สาขา X");
  let fx = "";
  const notes: string[] = [];
  const S: Record<string, string> = {};
  const U: Record<string, string> = {};
  const ownerId: string = PQC.coffee.users.owner.userId;
  const mgrAId: string = PQC.coffee.users.cashier.userId;
  const mgrABId: string = PQC.resto.users.owner.userId;
  const cashAId: string = PQC.resto.users.cashier.userId;
  const step = async (label: string, fn: () => unknown): Promise<Any> => {
    try {
      return await fn();
    } catch (e) {
      const m = `${label}: ${String((e as Error)?.message ?? e).slice(0, 140)}`;
      notes.push(m);
      console.log(`  ⚠️  fixture ${m}`);
      return null;
    }
  };
  const BOOK = { orgName: "ร้านหลายสาขาคิวซี จำกัด", taxId: "0105561177639", branchCode: "00000", address: "1 ถ.สมุดบัญชี กรุงเทพฯ", phone: "021110000" };
  try {
    T = (await P.tenant.create({ data: { name: `QC P2.11 หลายสาขา ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P2.11 ร้านที่สอง ${RAND}`, slug: T2_SLUG } })).id;
    for (const k of ["A", "B", "C", "D", "E"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "SHOP", name: `${TAG} สาขาX`, slug: `${T2_SLUG}-x` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", "POS QC P2.11")).id;
    S.POS2 = (await sysSvc.createSystem(T, "POS", "POS ที่สอง QC P2.11")).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชี VAT QC P2.11")).id;
    S.INV_AB = (await sysSvc.createSystem(T, "INVENTORY", "คลังร่วม A+B QC P2.11")).id;
    S.INV_E = (await sysSvc.createSystem(T, "INVENTORY", "คลัง E QC P2.11")).id;
    S.POSX = (await sysSvc.createSystem(T2, "POS", "POS ร้าน T2")).id;
    await accSvc.saveSettings(T, S.ACC, { ...BOOK, vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    for (const k of ["A", "B", "C", "D", "E"]) await sysSvc.linkUnit(T, S.POS, U[k]);
    for (const k of ["A", "B", "C"]) await sysSvc.linkUnit(T, S.INV_AB, U[k]);
    await sysSvc.linkUnit(T, S.INV_E, U.E);
    await sysSvc.linkUnit(T2, S.POSX, U.X);
    // สมาชิกภาพในร้านชั่วคราว (แคตตาล็อกอ่านสิทธิ์จาก Membership ของ actorUserId)
    await P.membership.create({ data: { userId: ownerId, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    await P.membership.create({ data: { userId: mgrAId, tenantId: T, role: "MANAGER", unitAccess: [U.A], permissions: {}, acceptedAt: new Date() } });
    await P.membership.create({ data: { userId: mgrABId, tenantId: T, role: "MANAGER", unitAccess: [U.A, U.B], permissions: {}, acceptedAt: new Date() } });
    await P.membership.create({ data: { userId: cashAId, tenantId: T, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.create": true }, acceptedAt: new Date() } });
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NOTE = () => (notes.length ? `fixture(${notes.length}): ${short(notes[0], 80)} · ` : "");

  // ─── ผู้กระทำ (ออบเจกต์แบบ session · แคตตาล็อกอ่าน Membership ของ userId) ───
  const owner = { userId: ownerId, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const mgrA = { userId: mgrAId, role: "MANAGER", unitAccess: [U.A], permissions: {} };
  const mgrAB = { userId: mgrABId, role: "MANAGER", unitAccess: [U.A, U.B], permissions: {} };
  const cashA = { userId: cashAId, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.create": true } };
  const SYSTEM_ACTOR: unknown = catalogMod?.CATALOG_SYSTEM_ACTOR ?? ownerId;
  const cctxSys: Any = { tenantId: T, systemId: S.POS, actorUserId: SYSTEM_ACTOR };
  const cctxOf = (userId: string): Any => ({ tenantId: T, systemId: S.POS, actorUserId: userId });
  const ctxOf = (k: string, deviceId?: string): Any => ({ tenantId: k === "X" ? T2 : T, systemId: k === "X" ? S.POSX : S.POS, unitId: U[k], ...(deviceId ? { deviceId } : {}) });
  const posCtx: Any = { tenantId: T, systemId: S.POS };
  const uk = (id: string | null) => (id === null ? "*" : (Object.entries(U).find(([, v]) => v === id)?.[0] ?? `?${String(id).slice(-4)}`));

  // ─── เครื่อง + กะ (A · B) ───
  const DEV: Record<string, string> = { A: `qc211${RAND}a`, B: `qc211${RAND}b` };
  if (!fx)
    for (const k of ["A", "B"]) {
      const rg = await call(devMod, "registerDevice", ctxOf(k), owner, { name: `เคาน์เตอร์ ${k} QC P2.11`, deviceCode: DEV[k] });
      if (rg?.ok !== true) notes.push(`registerDevice ${k}: ${codeOf(rg)} ${short(rg?.message ?? "", 60)}`);
      const o = await call(shiftMod, "openShift", ctxOf(k, DEV[k]), owner, { deviceId: DEV[k], deviceLabel: `เคาน์เตอร์ ${k} QC P2.11`, floatSatang: 0 });
      if (o?.ok !== true) fx = `เปิดกะ ${k}: ${codeOf(o)} ${short(o?.message ?? "", 80)}`;
    }

  // ─── ช่องทาง: LINEMAN ที่ A (30% · VAT 7%) และ B (25% · VAT 7%) ชื่อต่างกัน · ZZQC ที่ A (เก็บถาวรหลังตั้งราคา) ───
  const CH: Record<string, Any> = {};
  const CH_NAME = { A: `LINE MAN เอ ${RAND}`, B: `LINE MAN บี ${RAND}` };
  if (!fx) {
    for (const k of ["A", "B"] as const) {
      const r = await call(chMod, "saveChannel", ctxOf(k), owner, { code: "LINEMAN", name: CH_NAME[k], commissionBp: k === "A" ? 3000 : 2500, commissionVatBp: 700 });
      CH[`LM_${k}`] = r?.channel ?? null;
      if (!r?.channel?.id) notes.push(`saveChannel LINEMAN ${k}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
      const l = await call(chMod, "listChannels", ctxOf(k), owner, {});
      CH[`STORE_${k}`] = (l?.items ?? []).find((i: Any) => i?.code === "STORE") ?? null;
    }
    const zz = await call(chMod, "saveChannel", ctxOf("A"), owner, { code: "ZZQC", name: `ช่องทางเลิกใช้ ${RAND}`, payout: "DIRECT" });
    CH.ZZ = zz?.channel ?? null;
    if (!CH.ZZ?.id) notes.push(`saveChannel ZZQC: ${codeOf(zz)} ${short(zz?.message ?? "", 60)}`);
  }

  // ─── แคตตาล็อก ───
  const PR: Record<string, string> = {};
  const mkProd = async (key: string, input: Any, c: Any = cctxSys): Promise<void> => {
    const r = await step(`สินค้า ${key}`, () => catalogMod.createProduct(c, { name: `${key} ${TAG}`, ...input }));
    if (typeof r?.id === "string") PR[key] = r.id;
  };
  if (!fx) {
    for (const [k, v] of [["P1", 7500], ["P2", 6000], ["P3", 8000], ["Q1", 5000], ["Q2", 5000], ["Q3", 4000], ["Q4", 4500], ["Q5", 5200], ["S1", 10_000]] as const) await mkProd(k, { basePriceSatang: v });
    await mkProd("Pn", {});
    await mkProd("S0", { basePriceSatang: 2000 });
    await mkProd("T2P", { basePriceSatang: 5000 }, { tenantId: T2, systemId: S.POSX, actorUserId: SYSTEM_ACTOR });
    const miss = ["P1", "P2", "P3", "Q1", "Q2", "Q3", "Q4", "Q5", "S1", "Pn", "S0", "T2P"].filter((k) => !PR[k]);
    if (miss.length) notes.push(`แคตตาล็อกขาด ${miss.join(",")}`);
  }
  const row = (channelCode: string | null, unitId: string | null, priceSatang: number | null, notSold?: boolean) => ({ channelCode, unitId, priceSatang, ...(notSold !== undefined ? { notSold } : {}) });
  const setCP = (userId: string, productId: string, rows: Any) => (fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(catalogMod, "setChannelPrices", cctxOf(userId), { productId, rows }));
  // แถวราคาตั้งต้น (เจ้าของ · ก่อนเก็บถาวร/เลิกผูก) — เขียนผ่าน setChannelPrices ของฐานเดิม
  const SEED: Record<string, Any[]> = {
    P1: [row("LINEMAN", null, 9000), row("ZZQC", null, 8000), row("ZZQC", U.A, 8100), row(null, U.A, 7000)],
    P2: [row(null, U.A, 7000), row(null, U.C, 6500), row("LINEMAN", U.C, 9900), row(null, U.D, 6600)],
    P3: [row("LINEMAN", null, 9500), row("LINEMAN", U.A, 9000), row(null, U.A, 7000), row("LINEMAN", U.B, 9200), row(null, U.B, 7200)],
    Q1: [row("LINEMAN", U.A, 9000), row(null, U.A, 7000), row("LINEMAN", U.B, 9999)],
    Q2: [row(null, U.A, null, true), row("LINEMAN", U.A, null, true)],
    Q3: [row(null, U.B, 4400)],
    Q4: [row("ZZQC", U.A, 8100), row(null, U.A, 5000)],
    Q5: [row(null, U.A, 5500)],
    Pn: [row("LINEMAN", U.A, 3000)],
  };
  if (!fx)
    for (const [k, rows] of Object.entries(SEED)) {
      if (!PR[k]) continue;
      const r = await setCP(ownerId, PR[k], rows);
      if (!okish(r)) notes.push(`ตั้งราคา ${k}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    }
  // ธงเก็บถาวร (มติ 7: SQL ดิบเฉพาะธง) · ช่องทาง = ฟังก์ชันของโมดูล · เลิกผูก D = ย้ายไป POS2 (linkUnit)
  const setStatus = (k: string, status: "ACTIVE" | "ARCHIVED") => P.$executeRawUnsafe(`UPDATE "BusinessUnit" SET status = $1::"UnitStatus" WHERE id = $2 AND "tenantId" = $3`, status, U[k], T);
  if (!fx) {
    if (CH.ZZ?.id) {
      const a = await call(chMod, "archiveChannel", ctxOf("A"), owner, { id: CH.ZZ.id });
      if (a?.ok !== true) notes.push(`archiveChannel ZZQC: ${codeOf(a)}`);
    }
    await step("เก็บถาวรสาขา C", () => setStatus("C", "ARCHIVED"));
    await step("ย้าย D ไป POS2", () => sysSvc.linkUnit(T, S.POS2, U.D));
  }
  console.log(`   สินค้า ${Object.keys(PR).length} · ช่องทาง ${Object.keys(CH).filter((k) => CH[k]).join(",")}${notes.length ? ` · ⚠️ ${notes.length} รายการ fixture` : ""}`);

  // ─── ตัวอ่าน ───
  type CpRow = { id: string; channelCode: string | null; unitId: string | null; priceSatang: number | null; notSold: boolean; updatedByUserId: string; updatedAt: Date };
  const cpRows = async (productId: string, tenantId = T): Promise<CpRow[]> =>
    productId
      ? ((await P.$queryRawUnsafe(`SELECT id, "channelCode", "unitId", "priceSatang", "notSold", "updatedByUserId", "updatedAt" FROM "PosProductChannelPrice" WHERE "tenantId" = $1 AND "productId" = $2`, tenantId, productId).catch(() => [])) as CpRow[])
      : [];
  const sigOf = (rows: CpRow[]) => rows.map((r) => `${r.channelCode ?? "*"}|${uk(r.unitId ?? null)}|${r.notSold ? "X" : r.priceSatang}`).sort().join(",");
  const fpOf = (rows: CpRow[]) => rows.map((r) => `${r.id}|${r.channelCode ?? "*"}|${uk(r.unitId)}|${r.notSold ? "X" : r.priceSatang}|${r.updatedByUserId}|${new Date(r.updatedAt).toISOString()}`).sort().join(",");
  const cpSig = async (k: string) => sigOf(await cpRows(PR[k] ?? ""));
  const cpFp = async (k: string) => fpOf(await cpRows(PR[k] ?? ""));
  const pick = (rows: CpRow[], pred: (r: CpRow) => boolean) => fpOf(rows.filter(pred));
  const auditsOf = async (action: string, targetId?: string): Promise<Any[]> =>
    ((await P.auditLog.findMany({ where: { tenantId: T, action, ...(targetId ? { targetId } : {}) }, orderBy: { createdAt: "asc" } }).catch(() => [])) as Any[]);
  const cpAudits = async (k: string) => (PR[k] ? (await auditsOf(AUDIT_CP, PR[k])).length : -1);
  const deadOk = (r: Any) => codeIs(r, "VALIDATION") && r.reason === "PRICE_ROW_DEAD" && r.field === "rows";
  const refusalTxt = (r: Any) => `${codeOf(r)}${r?.reason ? `/${r.reason}` : ""}${r?.field ? `@${r.field}` : ""}`;
  const deadSeen: Any[] = [];

  const S_ = (...xs: string[]) => [...xs].sort().join(",");
  const ZZ = (r: CpRow) => r.channelCode === "ZZQC";
  const aud0 = async () => Number(await P.auditLog.count({ where: { tenantId: T } }).catch(() => -1));

  // ════════ PR1 ช่องทางเก็บถาวร: ส่งเดิม = รับ · ไม่ส่ง = คงไว้ ════════
  {
    const p: string[] = [];
    const before = await cpRows(PR.P1 ?? "");
    const zzFp = pick(before, ZZ);
    if (sigOf(before) !== S_("LINEMAN|*|9000", "ZZQC|*|8000", "ZZQC|A|8100", "*|A|7000")) p.push(`fixture P1 = ${sigOf(before) || "—"}`);
    const a = await setCP(ownerId, PR.P1 ?? "", [row("LINEMAN", null, 9100), row("ZZQC", null, 8000), row("ZZQC", U.A, 8100), row(null, U.A, 7000)]);
    if (!okish(a) || a?.changed !== true) p.push(`ส่งแถว ZZQC เดิม + LINEMAN 9,100 → ${refusalTxt(a)} ${short(a?.message ?? "", 50)} changed=${a?.changed}`);
    const mid = await cpRows(PR.P1 ?? "");
    if (sigOf(mid) !== S_("LINEMAN|*|9100", "ZZQC|*|8000", "ZZQC|A|8100", "*|A|7000")) p.push(`หลังส่งเดิม ${sigOf(mid)}`);
    if (!zzFp || pick(mid, ZZ) !== zzFp) p.push("แถว ZZQC ถูกเขียนใหม่ (id/updatedAt/ผู้แก้เปลี่ยน)");
    const b = await setCP(ownerId, PR.P1 ?? "", [row("LINEMAN", null, 9100)]);
    if (!okish(b)) p.push(`ส่งเฉพาะ LINEMAN → ${refusalTxt(b)} ${short(b?.message ?? "", 50)}`);
    const after = await cpRows(PR.P1 ?? "");
    if (sigOf(after) !== S_("LINEMAN|*|9100", "ZZQC|*|8000", "ZZQC|A|8100")) p.push(`หลังไม่ส่ง ZZQC ${sigOf(after)} (คาด ZZQC คงไว้ · (ทุกช่องทาง, A) ถูกลบ)`);
    if (!zzFp || pick(after, ZZ) !== zzFp) p.push("แถว ZZQC เปลี่ยนหลังการบันทึกที่ไม่ส่งมัน");
    chk("PR1", !fx && p.length === 0, "ส่งเดิม = รับ · ไม่ส่ง = คงไว้ · แถวในเอื้อมยังลบได้", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ════════ PR2 แถวตายที่เปลี่ยน/ใหม่ = PRICE_ROW_DEAD ไม่เขียนอะไร ════════
  {
    const p: string[] = [];
    const cases: [string, string, Any[]][] = [
      ["ZZQC เปลี่ยนราคา", "P1", [row("LINEMAN", null, 9100), row("ZZQC", null, 8200), row("ZZQC", U.A, 8100)]],
      ["(ZZQC, B) ใหม่", "P1", [row("LINEMAN", null, 9100), row("ZZQC", null, 8000), row("ZZQC", U.A, 8100), row("ZZQC", U.B, 8300)]],
      ["(ทุกช่องทาง, C เก็บถาวร) เปลี่ยน", "P2", [row(null, U.A, 7000), row(null, U.C, 6400), row("LINEMAN", U.C, 9900), row(null, U.D, 6600)]],
      ["(LINEMAN, D เลิกผูก) ใหม่", "P2", [row(null, U.A, 7000), row(null, U.C, 6500), row("LINEMAN", U.C, 9900), row(null, U.D, 6600), row("LINEMAN", U.D, 9000)]],
    ];
    for (const [lbl, k, rows] of cases) {
      const fp0 = await cpFp(k);
      const a0 = await cpAudits(k);
      const r = await setCP(ownerId, PR[k] ?? "", rows);
      deadSeen.push(r);
      if (!deadOk(r)) p.push(`${lbl} → ${refusalTxt(r)} ${short(r?.message ?? "", 40)} (คาด VALIDATION/PRICE_ROW_DEAD@rows)`);
      if ((await cpFp(k)) !== fp0) p.push(`${lbl}: แถวเปลี่ยน`);
      if ((await cpAudits(k)) !== a0) p.push(`${lbl}: มี audit`);
    }
    chk("PR2", !fx && p.length === 0, "VALIDATION reason PRICE_ROW_DEAD field rows × 4 · แถว/audit เท่าเดิม", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ════════ PR3 แถวของสาขาเก็บถาวร/เลิกผูกรอด แล้วกลับมามีผล ════════
  {
    const p: string[] = [];
    const before = await cpRows(PR.P2 ?? "");
    const dead = (r: CpRow) => r.unitId === U.C || r.unitId === U.D;
    const deadFp = pick(before, dead);
    if (before.filter(dead).length !== 3) p.push(`fixture P2 แถว C/D = ${before.filter(dead).length} (คาด 3 · ${sigOf(before)})`);
    const r = await setCP(ownerId, PR.P2 ?? "", [row(null, U.A, 7100)]);
    if (!okish(r)) p.push(`บันทึก (ทุกช่องทาง, A) 7,100 → ${refusalTxt(r)} ${short(r?.message ?? "", 50)}`);
    const after = await cpRows(PR.P2 ?? "");
    if (!deadFp || pick(after, dead) !== deadFp) p.push(`แถว C/D หาย/เปลี่ยน: ${sigOf(after.filter(dead)) || "ไม่มีแล้ว"}`);
    if (!after.some((x) => x.unitId === U.A && x.channelCode === null && x.priceSatang === 7100)) p.push(`(ทุกช่องทาง, A) ไม่เป็น 7,100 (${sigOf(after)})`);
    // คืนสภาพ C + ผูก D กลับ → ราคาของสาขากลับมามีผล (ทางเดียวกับหน้าขาย: resolvePrices / priceOf)
    if (!fx) {
      await step("คืนสภาพ C", () => setStatus("C", "ACTIVE"));
      await step("ผูก D กลับ POS", () => sysSvc.linkUnit(T, S.POS, U.D));
      const rp = async (k: string, code: string) => {
        const x = await call(priceMod, "resolvePrices", P, { tenantId: T, systemId: S.POS, unitId: U[k] }, { channelCode: code, items: [{ productId: PR.P2 ?? "none" }] });
        return x?.ok === true ? `${x.items?.[0]?.unitPriceSatang}/${x.items?.[0]?.source}` : refusalTxt(x);
      };
      for (const [k, code, want] of [["C", "STORE", "6500/BRANCH"], ["C", "LINEMAN", "9900/CHANNEL"], ["D", "STORE", "6600/BRANCH"]] as const) {
        const got = await rp(k, code);
        if (got !== want) p.push(`${k} ${code} = ${got} (คาด ${want})`);
      }
      await step("เก็บถาวร C อีกครั้ง", () => setStatus("C", "ARCHIVED"));
      await step("ย้าย D ไป POS2 อีกครั้ง", () => sysSvc.linkUnit(T, S.POS2, U.D));
    }
    chk("PR3", !fx && p.length === 0, "แถว C/D รอด id/ค่าเดิม · คืนสภาพแล้วราคาสาขามีผล", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ════════ PR4 ผู้จัดการสาขา A บันทึกเฉพาะแถวของตัวเอง ════════
  {
    const p: string[] = [];
    const before = await cpRows(PR.P3 ?? "");
    const notA = (r: CpRow) => r.unitId !== U.A;
    const keepFp = pick(before, notA);
    if (before.length !== 5) p.push(`fixture P3 ${sigOf(before)}`);
    const a0 = await cpAudits("P3");
    const r = await setCP(mgrAId, PR.P3 ?? "", [row("LINEMAN", U.A, 9050), row(null, U.A, 7000)]);
    if (!okish(r) || r?.changed !== true) p.push(`ผู้จัดการ A บันทึก (LINEMAN, A) 9,050 → ${refusalTxt(r)} ${short(r?.message ?? "", 50)} changed=${r?.changed}`);
    const after = await cpRows(PR.P3 ?? "");
    if (!keepFp || pick(after, notA) !== keepFp) p.push(`แถว B/ทุกสาขา เปลี่ยน: ${sigOf(after.filter(notA))}`);
    const la = after.find((x) => x.channelCode === "LINEMAN" && x.unitId === U.A);
    if (la?.priceSatang !== 9050 || la?.updatedByUserId !== mgrAId) p.push(`(LINEMAN, A) = ${la?.priceSatang}/${short(la?.updatedByUserId, 30)} (คาด 9,050/ผู้จัดการ)`);
    const na = after.find((x) => x.channelCode === null && x.unitId === U.A);
    const naBefore = before.find((x) => x.channelCode === null && x.unitId === U.A);
    if (!na || !naBefore || fpOf([na]) !== fpOf([naBefore])) p.push("(ทุกช่องทาง, A) ค่าเดิมถูกเขียนใหม่");
    const aud = await auditsOf(AUDIT_CP, PR.P3 ?? "-");
    if (aud.length !== a0 + 1) p.push(`audit ${a0} → ${aud.length} (คาด +1)`);
    const last = aud[aud.length - 1];
    if (last && last.actorId !== mgrAId) p.push(`audit actorId ${short(last.actorId, 30)} (คาด ผู้จัดการ)`);
    const afterRows: Any[] = Array.isArray(last?.after?.rows) ? last.after.rows : [];
    if (afterRows.length !== 5 || !afterRows.some((x) => x?.channelCode === "LINEMAN" && x?.unitId === U.B && x?.priceSatang === 9200)) p.push(`audit after.rows = ${afterRows.length} แถว (คาด ชุดเต็ม 5 รวม (LINEMAN, B) 9,200)`);
    // ส่งแถว B ค่าเดิมมาด้วย = รับ (นอกเอื้อม · ไม่เปลี่ยน) ไม่มี audit
    const fp1 = await cpFp("P3");
    const r2 = await setCP(mgrAId, PR.P3 ?? "", [row("LINEMAN", U.A, 9050), row(null, U.A, 7000), row("LINEMAN", U.B, 9200)]);
    if (!okish(r2) || r2?.changed !== false) p.push(`ส่ง (LINEMAN, B) ค่าเดิม → ${refusalTxt(r2)} ${short(r2?.message ?? "", 40)} changed=${r2?.changed} (คาด ok/false)`);
    if ((await cpFp("P3")) !== fp1 || (await cpAudits("P3")) !== a0 + 1) p.push("ส่งค่าเดิมแล้วแถว/audit เปลี่ยน");
    chk("PR4", !fx && p.length === 0, "ผู้จัดการ A บันทึกได้ · แถวนอกเอื้อมทุกไบต์เดิม · audit ชุดเต็ม", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ════════ PR5 นอกสิทธิ์ที่เปลี่ยน/ใหม่ = PERMISSION_DENIED ไม่เขียนอะไร ════════
  {
    const p: string[] = [];
    const cases: [string, string, Any[]][] = [
      ["ผู้จัดการ A เปลี่ยน (LINEMAN, B)", mgrAId, [row("LINEMAN", U.A, 9050), row(null, U.A, 7000), row("LINEMAN", U.B, 9300)]],
      ["ผู้จัดการ A เปลี่ยน (LINEMAN, ทุกสาขา)", mgrAId, [row("LINEMAN", U.A, 9050), row(null, U.A, 7000), row("LINEMAN", null, 9600)]],
      ["ผู้จัดการ A ใหม่ (ทุกช่องทาง, E)", mgrAId, [row("LINEMAN", U.A, 9050), row(null, U.A, 7000), row(null, U.E, 5000)]],
      ["พนักงานเปลี่ยนแถว A", cashAId, [row(null, U.A, 7000), row("LINEMAN", U.A, 9060)]],
    ];
    for (const [lbl, who, rows] of cases) {
      const fp0 = await cpFp("P3");
      const a0 = await aud0();
      const r = await setCP(who, PR.P3 ?? "", rows);
      if (!codeIs(r, "PERMISSION_DENIED")) p.push(`${lbl} → ${refusalTxt(r)} ${short(r?.message ?? "", 40)}`);
      if ((await cpFp("P3")) !== fp0) p.push(`${lbl}: แถวเปลี่ยน`);
      if ((await aud0()) !== a0) p.push(`${lbl}: มี audit`);
    }
    chk("PR5", !fx && p.length === 0, "PERMISSION_DENIED × 4 · แถว/audit เท่าเดิม", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ════════ PR6 copyUnitPrices A→B ════════
  const copy = (userId: string, input: Any) => (fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(catalogMod, "copyUnitPrices", cctxOf(userId), input));
  {
    const p: string[] = [];
    const ids = ["Q1", "Q2", "Q3", "Q4"].map((k) => PR[k] ?? "none");
    const a0 = Object.fromEntries(await Promise.all(["Q1", "Q2", "Q3", "Q4"].map(async (k) => [k, await cpAudits(k)] as const)));
    const want = (r: Any, changed: boolean, written: number, prods: string[] | null, lbl: string) => {
      if (!okish(r)) return void p.push(`${lbl} → ${refusalTxt(r)} ${short(r?.message ?? "", 50)}`);
      if (r.changed !== changed) p.push(`${lbl}: changed ${r.changed} (คาด ${changed})`);
      if (r.written !== written) p.push(`${lbl}: written ${r.written} (คาด ${written})`);
      if (prods && S_(...(Array.isArray(r.productIds) ? r.productIds : [])) !== S_(...prods.map((k) => PR[k] ?? k))) p.push(`${lbl}: productIds ${short(r.productIds, 80)}`);
    };
    const r1 = await copy(ownerId, { fromUnitId: U.A, toUnitId: U.B, overwrite: false, productIds: ids });
    want(r1, true, 4, ["Q1", "Q2", "Q4"], "overwrite:false");
    if (okish(r1) && r1.skipped !== 2) p.push(`overwrite:false skipped ${r1.skipped} (คาด 2 = (LINEMAN, B) ที่มีอยู่ + ZZQC ตาย)`);
    const sig1: Record<string, string> = {
      Q1: S_("LINEMAN|A|9000", "*|A|7000", "LINEMAN|B|9999", "*|B|7000"),
      Q2: S_("*|A|X", "LINEMAN|A|X", "*|B|X", "LINEMAN|B|X"),
      Q3: "*|B|4400",
      Q4: S_("ZZQC|A|8100", "*|A|5000", "*|B|5000"),
    };
    for (const k of ["Q1", "Q2", "Q3", "Q4"]) if ((await cpSig(k)) !== sig1[k]) p.push(`${k} = ${await cpSig(k)} (คาด ${sig1[k]})`);
    const nb = (await cpRows(PR.Q1 ?? "")).find((x) => x.unitId === U.B && x.channelCode === null);
    if (nb && nb.updatedByUserId !== ownerId) p.push(`แถวใหม่ updatedByUserId ${short(nb.updatedByUserId, 30)}`);
    for (const [k, inc] of [["Q1", 1], ["Q2", 1], ["Q3", 0], ["Q4", 1]] as const) if ((await cpAudits(k)) !== a0[k]! + inc) p.push(`${k} audit ${a0[k]} → ${await cpAudits(k)} (คาด +${inc})`);
    const r2 = await copy(ownerId, { fromUnitId: U.A, toUnitId: U.B, overwrite: false, productIds: ids });
    want(r2, false, 0, [], "รันซ้ำ overwrite:false");
    const r3 = await copy(ownerId, { fromUnitId: U.A, toUnitId: U.B, overwrite: true, productIds: ids });
    want(r3, true, 1, ["Q1"], "overwrite:true");
    if ((await cpSig("Q1")) !== S_("LINEMAN|A|9000", "*|A|7000", "LINEMAN|B|9000", "*|B|7000")) p.push(`Q1 หลัง overwrite = ${await cpSig("Q1")}`);
    if ((await cpSig("Q3")) !== "*|B|4400") p.push(`Q3 แถว B ที่ไม่มีที่ A หาย/เปลี่ยน ${await cpSig("Q3")}`);
    const r4 = await copy(ownerId, { fromUnitId: U.A, toUnitId: U.B, overwrite: true, productIds: ids });
    want(r4, false, 0, [], "รันซ้ำ overwrite:true");
    for (const [k, inc] of [["Q1", 2], ["Q2", 1], ["Q3", 0], ["Q4", 1]] as const) if ((await cpAudits(k)) !== a0[k]! + inc) p.push(`จบ ${k} audit +${(await cpAudits(k)) - a0[k]!} (คาด +${inc})`);
    const lastQ1 = (await auditsOf(AUDIT_CP, PR.Q1 ?? "-")).pop();
    if (lastQ1 && lastQ1.actorId !== ownerId) p.push(`audit actorId ${short(lastQ1.actorId, 30)}`);
    chk("PR6", !fx && p.length === 0, "ข้าม/แทนตาม overwrite · notSold · แถวตายไม่คัดลอก · audit ต่อสินค้า · รันซ้ำไม่เปลี่ยน", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ════════ PR7 copyUnitPrices สิทธิ์ + ขอบเขต ════════
  {
    const p: string[] = [];
    const q5 = [PR.Q5 ?? "none"];
    const fp0 = await cpFp("Q5");
    const a0 = await aud0();
    const cases: [string, string, Any, (r: Any) => boolean, string][] = [
      ["ผู้จัดการ A (ไม่มี B)", mgrAId, { fromUnitId: U.A, toUnitId: U.B, overwrite: false, productIds: q5 }, (r) => codeIs(r, "PERMISSION_DENIED"), "PERMISSION_DENIED"],
      ["พนักงาน", cashAId, { fromUnitId: U.A, toUnitId: U.B, overwrite: false, productIds: q5 }, (r) => codeIs(r, "PERMISSION_DENIED"), "PERMISSION_DENIED"],
      ["ปลายทาง C เก็บถาวร", ownerId, { fromUnitId: U.A, toUnitId: U.C, overwrite: false, productIds: q5 }, (r) => codeIs(r, "VALIDATION") && r.field === "toUnitId", "VALIDATION@toUnitId"],
      ["ปลายทาง D เลิกผูก", ownerId, { fromUnitId: U.A, toUnitId: U.D, overwrite: false, productIds: q5 }, (r) => codeIs(r, "VALIDATION") && r.field === "toUnitId", "VALIDATION@toUnitId"],
      ["A→A", ownerId, { fromUnitId: U.A, toUnitId: U.A, overwrite: false, productIds: q5 }, (r) => codeIs(r, "VALIDATION"), "VALIDATION"],
      ["ปลายทางร้าน T2", ownerId, { fromUnitId: U.A, toUnitId: U.X, overwrite: false, productIds: q5 }, (r) => codeIs(r, "NOT_FOUND"), "NOT_FOUND"],
      ["ต้นทางร้าน T2", ownerId, { fromUnitId: U.X, toUnitId: U.B, overwrite: false, productIds: q5 }, (r) => codeIs(r, "NOT_FOUND"), "NOT_FOUND"],
      ["สินค้าร้าน T2", ownerId, { fromUnitId: U.A, toUnitId: U.B, overwrite: false, productIds: [PR.T2P ?? "none"] }, (r) => codeIs(r, "NOT_FOUND"), "NOT_FOUND"],
    ];
    for (const [lbl, who, input, ok, exp] of cases) {
      const r = await copy(who, input);
      if (!ok(r)) p.push(`${lbl} → ${refusalTxt(r)} (คาด ${exp})`);
    }
    if ((await cpFp("Q5")) !== fp0) p.push(`Q5 เปลี่ยนหลังคำปฏิเสธ ${await cpSig("Q5")}`);
    if ((await aud0()) !== a0) p.push("คำปฏิเสธมี audit");
    if (PR.T2P && (await cpRows(PR.T2P, T2)).length !== 0) p.push("สินค้าร้าน T2 มีแถวราคา");
    const ok = await copy(mgrABId, { fromUnitId: U.A, toUnitId: U.B, overwrite: false, productIds: q5 });
    if (!okish(ok) || ok?.changed !== true) p.push(`ผู้จัดการ A+B → ${refusalTxt(ok)} ${short(ok?.message ?? "", 40)} changed=${ok?.changed}`);
    if ((await cpSig("Q5")) !== S_("*|A|5500", "*|B|5500")) p.push(`Q5 หลังผู้จัดการ A+B = ${await cpSig("Q5")}`);
    chk("PR7", !fx && p.length === 0, "PERMISSION_DENIED ×2 · VALIDATION ×3 · NOT_FOUND ×3 · ไม่เขียนอะไร · ผู้จัดการ A+B ได้", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ════════ PR8 unitPriceMatrix = priceOf ทุกช่อง ════════
  {
    const p: string[] = [];
    const keys = ["P3", "Q1", "Q2", "Pn"];
    const ids = keys.map((k) => PR[k] ?? "none");
    const fpAll0 = (await Promise.all(keys.map((k) => cpFp(k)))).join(";");
    const a0 = await aud0();
    const mx = (userId: string, input: Any) => (fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(catalogMod, "unitPriceMatrix", cctxOf(userId), input));
    // ตัวอ้างอิง: ทางเดียวกับหน้าขาย (loadPriceBook + priceOf ของ price.ts) ต่อสาขา A B E × STORE LINEMAN
    const prods = (await P.posProduct.findMany({ where: { tenantId: T, id: { in: ids } }, select: { id: true, basePriceSatang: true, categoryId: true, parentId: true, soldByWeight: true } }).catch(() => [])) as Any[];
    const refs: { key: string; productId: string; unit: string; code: string; exp: string }[] = [];
    const kinds = new Set<string>();
    for (const u of ["A", "B", "E"]) {
      const book = typeof priceMod?.loadPriceBook === "function" ? await priceMod.loadPriceBook(P, { tenantId: T, systemId: S.POS, unitId: U[u] }, prods, new Date()) : null;
      for (const pr of prods)
        for (const code of ["STORE", "LINEMAN"]) {
          const ref = book ? priceMod.priceOf(book, pr, code) : { ok: false, code: "NO_PRICE_MODULE" };
          kinds.add(ref.ok ? String(ref.source) : String(ref.code));
          refs.push({ key: keys[ids.indexOf(pr.id)] ?? pr.id, productId: pr.id, unit: u, code, exp: ref.ok ? `${ref.unitPriceSatang}/${ref.source}/null` : `null/null/${ref.code}` });
        }
    }
    if (refs.length !== keys.length * 6) p.push(`fixture: ตัวอ้างอิง ${refs.length} ช่อง (คาด ${keys.length * 6})`);
    for (const k of ["BRANCH", "CHANNEL", "PRICE_NOT_SET", "CHANNEL_NOT_SOLD"]) if (!kinds.has(k)) p.push(`fixture: ตัวอ้างอิงไม่มีช่อง ${k}`);
    const m = await mx(ownerId, { productIds: ids, channelCodes: ["STORE", "LINEMAN"] });
    const units: string[] = Array.isArray(m?.units) ? m.units.map((u: Any) => String(u?.unitId)) : [];
    const cells: Any[] = Array.isArray(m?.cells) ? m.cells : [];
    if (!okish(m)) p.push(`เจ้าของ → ${refusalTxt(m)} ${short(m?.message ?? "", 50)}`);
    else {
      if (S_(...units.map(uk)) !== S_("A", "B", "E")) p.push(`units ${S_(...units.map(uk))} (คาด A,B,E)`);
      if (S_(...(Array.isArray(m.channelCodes) ? m.channelCodes : [])) !== S_("STORE", "LINEMAN")) p.push(`channelCodes ${short(m.channelCodes, 60)}`);
      if (cells.length !== keys.length * 3 * 2) p.push(`cells ${cells.length} (คาด ${keys.length * 3 * 2})`);
      for (const r of refs) {
        const c = cells.find((x) => x?.productId === r.productId && x?.unitId === U[r.unit] && x?.channelCode === r.code);
        const got = c ? `${c.unitPriceSatang}/${c.source}/${c.refusal}` : "ไม่มีช่อง";
        if (got !== r.exp) p.push(`${r.key}@${r.unit}/${r.code} = ${got} (คาด ${r.exp})`);
      }
    }
    const m2 = await mx(ownerId, { productIds: [PR.P3 ?? "none"] });
    const codes2: string[] = Array.isArray(m2?.channelCodes) ? m2.channelCodes : [];
    if (!okish(m2) || !codes2.includes("STORE") || !codes2.includes("LINEMAN") || codes2.includes("ZZQC")) p.push(`ช่องทางปริยาย ${refusalTxt(m2)} ${short(codes2, 60)} (คาด มี STORE LINEMAN · ไม่มี ZZQC)`);
    const m3 = await mx(mgrAId, { productIds: [PR.P3 ?? "none"], channelCodes: ["STORE"] });
    const u3 = Array.isArray(m3?.units) ? m3.units.map((u: Any) => uk(String(u?.unitId))) : [];
    if (!okish(m3) || S_(...u3) !== "A") p.push(`ผู้จัดการ A units ${refusalTxt(m3)} ${short(u3, 40)} (คาด A)`);
    const m4 = await mx(mgrAId, { productIds: [PR.P3 ?? "none"], unitIds: [U.B] });
    if (!codeIs(m4, "NOT_FOUND")) p.push(`ผู้จัดการ A ขอ B → ${refusalTxt(m4)} (คาด NOT_FOUND)`);
    const m5 = await mx(ownerId, { productIds: [PR.T2P ?? "none"] });
    if (!codeIs(m5, "NOT_FOUND")) p.push(`สินค้าร้าน T2 → ${refusalTxt(m5)} (คาด NOT_FOUND)`);
    if ((await Promise.all(keys.map((k) => cpFp(k)))).join(";") !== fpAll0 || (await aud0()) !== a0) p.push("ตัวอ่านเขียนแถว/audit");
    chk("PR8", !fx && p.length === 0, "ทุกช่อง = priceOf · สาขา/ช่องทางปริยาย · ขอบเขตผู้จัดการ · NOT_FOUND · อ่านอย่างเดียว", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ════════ PR9 field + reason คงที่ ════════
  {
    const p: string[] = [];
    const bulk = (input: Any) => (fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(catalogMod, "bulkChannelMarkup", cctxOf(ownerId), input));
    const many = Array.from({ length: 501 }, (_, i) => `qc211${RAND}p${i}`);
    const b1 = await bulk({ channelCode: "LINEMAN", unitId: null, markupBp: 1000, roundTo: 1, productIds: many });
    if (!(codeIs(b1, "VALIDATION") && b1.reason === "BULK_TOO_MANY" && b1.field === "productIds")) p.push(`productIds 501 → ${refusalTxt(b1)} (คาด VALIDATION/BULK_TOO_MANY@productIds)`);
    // หมวดที่มีสินค้า 501 รายการ (ผ่าน createProduct ทีละรายการ)
    let catId = "";
    let made = 0;
    if (!fx) {
      const t0 = Date.now();
      const cat = await step("หมวด 501", () => catalogMod.createCategory(cctxSys, { name: `หมวดใหญ่ ${RAND}` }));
      catId = String(cat?.id ?? "");
      for (let i = 0; catId && i < 501; i++) {
        const r = await call(catalogMod, "createProduct", cctxSys, { name: `จำนวนมาก ${i} ${TAG}`, basePriceSatang: 100 + i, categoryId: catId });
        if (typeof r?.id === "string") made++;
        else if (made < i - 5) break;
      }
      console.log(`   หมวด 501: สร้าง ${made} สินค้าใน ${Math.round((Date.now() - t0) / 1000)} วินาที`);
    }
    if (made !== 501) p.push(`fixture หมวด: สร้างได้ ${made}/501`);
    const b2 = await bulk({ channelCode: "LINEMAN", unitId: null, markupBp: 1000, roundTo: 1, categoryId: catId || "none" });
    if (!(codeIs(b2, "VALIDATION") && b2.reason === "BULK_TOO_MANY" && b2.field === "categoryId")) p.push(`หมวด 501 → ${refusalTxt(b2)} (คาด VALIDATION/BULK_TOO_MANY@categoryId)`);
    if (deadSeen.length !== 4 || !deadSeen.every(deadOk)) p.push(`แถวตายของ PR2: ${deadSeen.map(refusalTxt).join(" · ") || "ไม่มี"}`);
    chk("PR9", !fx && p.length === 0, "BULK_TOO_MANY@productIds · BULK_TOO_MANY@categoryId · PRICE_ROW_DEAD@rows", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ════════ ORACLE-ADD ผู้คุม 15 ต.ค. (P2.11 fix รอบ 1 · มติ 1–3 ใน pos-P2.11-review.md) ▸ PR10–PR12 ◂ ════════
  // PR11 purgeDead (hunt L1)
  {
    const p: string[] = [];
    const setP = (userId: string, productId: string, rows: Any, purgeDead: unknown) => (fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(catalogMod, "setChannelPrices", cctxOf(userId), { productId, rows, purgeDead }));
    const b2 = await cpRows(PR.P2 ?? "");
    const live2 = (r: CpRow) => r.unitId === U.A && r.channelCode === null;
    if (sigOf(b2) !== S_("*|A|7100", "*|C|6500", "LINEMAN|C|9900", "*|D|6600")) p.push(`fixture P2 = ${sigOf(b2)}`);
    const n0 = await cpAudits("P2");
    // ไม่ส่งธง = แถวตายคงไว้
    const k = await setCP(ownerId, PR.P2 ?? "", [row(null, U.A, 7100)]);
    if (!okish(k) || (await cpFp("P2")) !== fpOf(b2)) p.push(`ไม่ส่งธง → ${refusalTxt(k)} แถว ${await cpSig("P2")}`);
    const bad = await setP(ownerId, PR.P2 ?? "", [row(null, U.A, 7100)], "yes");
    if (!codeIs(bad, "VALIDATION")) p.push(`purgeDead "yes" → ${refusalTxt(bad)} (คาด VALIDATION)`);
    const a0 = await aud0();
    const m = await setP(mgrAId, PR.P2 ?? "", [row(null, U.A, 7100)], true);
    if (!codeIs(m, "PERMISSION_DENIED")) p.push(`ผู้จัดการ A purge → ${refusalTxt(m)} (คาด PERMISSION_DENIED)`);
    if ((await cpFp("P2")) !== fpOf(b2) || (await aud0()) !== a0) p.push("ผู้จัดการ A purge เขียน/ลง audit");
    const o = await setP(ownerId, PR.P2 ?? "", [row(null, U.A, 7100)], true);
    if (!okish(o) || o?.changed !== true) p.push(`เจ้าของ purge P2 → ${refusalTxt(o)} changed=${o?.changed}`);
    const a2 = await cpRows(PR.P2 ?? "");
    if (sigOf(a2) !== "*|A|7100" || pick(a2, live2) !== pick(b2, live2)) p.push(`P2 หลัง purge ${sigOf(a2)} (คาด *|A|7100 id เดิม)`);
    const au = await auditsOf(AUDIT_CP, PR.P2 ?? "-");
    const lastA = au[au.length - 1];
    if (au.length !== n0 + 1 || lastA?.after?.via !== "purgeDead" || lastA?.actorId !== ownerId) p.push(`audit P2 ${au.length - n0} via ${short(lastA?.after?.via, 20)}`);
    const b1 = await cpRows(PR.P1 ?? "");
    const lm = (r: CpRow) => r.channelCode === "LINEMAN";
    const o1 = await setP(ownerId, PR.P1 ?? "", [row("LINEMAN", null, 9100)], true);
    const a1 = await cpRows(PR.P1 ?? "");
    if (!okish(o1) || sigOf(a1) !== "LINEMAN|*|9100" || pick(a1, lm) !== pick(b1, lm)) p.push(`P1 purge → ${refusalTxt(o1)} ${sigOf(a1)} (คาด ZZQC หาย · LINEMAN เดิม)`);
    const again = await setP(ownerId, PR.P1 ?? "", [row("LINEMAN", null, 9100)], true);
    if (!okish(again) || again?.changed !== false) p.push(`purge ซ้ำ → ${refusalTxt(again)} changed=${again?.changed}`);
    chk("PR11", !fx && p.length === 0, "purgeDead: เจ้าของล้างแถวตาย · แถวใช้ได้เดิม · audit purgeDead · ผู้จัดการ DENIED ไม่เขียน · ไม่ส่งธง = คงไว้", FX(NOTE() + (P8(p) || "ครบ")));
  }
  // PR12 บันทึกที่ไม่เปลี่ยน ไม่ขึ้นกับลำดับ (hunt L2)
  {
    const p: string[] = [];
    const cur = await cpRows(PR.P3 ?? "");
    const val = (code: string | null, unit: string) => cur.find((x) => x.channelCode === code && x.unitId === unit);
    const la = val("LINEMAN", U.A ?? "");
    const lb = val("LINEMAN", U.B ?? "");
    const na = val(null, U.A ?? "");
    if (!la || !lb || !na) p.push(`fixture P3 ${sigOf(cur)}`);
    const rA = row("LINEMAN", U.A, la?.priceSatang ?? 0);
    const rB = row("LINEMAN", U.B, lb?.priceSatang ?? 0);
    const rN = row(null, U.A, na?.priceSatang ?? 0);
    const fp0 = await cpFp("P3");
    const a0 = await aud0();
    for (const [lbl, who, rows, want] of [
      ["ผู้จัดการ A · B ก่อน", mgrAId, [rB, rA, rN], "OK"],
      ["ผู้จัดการ A · B หลัง", mgrAId, [rA, rN, rB], "OK"],
      ["พนักงาน · B ก่อน", cashAId, [rB, rA, rN], "PERMISSION_DENIED"],
      ["พนักงาน · B หลัง", cashAId, [rA, rN, rB], "PERMISSION_DENIED"],
    ] as const) {
      const r = await setCP(who, PR.P3 ?? "", rows);
      const got = okish(r) ? (r.changed === false ? "OK" : `OK changed=${r.changed}`) : String(r?.code);
      if (got !== want) p.push(`${lbl} → ${got} ${short(r?.message ?? "", 30)} (คาด ${want})`);
    }
    if ((await cpFp("P3")) !== fp0 || (await aud0()) !== a0) p.push("แถว/audit เปลี่ยน");
    chk("PR12", !fx && p.length === 0, "ไม่เปลี่ยนอะไร: ok ทั้งสองลำดับ (ผู้จัดการ A) · พนักงาน DENIED ทั้งสองลำดับ · ไม่เขียน", FX(NOTE() + (P8(p) || "ครบ")));
  }
  // PR10 (หลัง PR11/PR12 — คัดลอกทั้งสาขา A→B เปลี่ยนแถว B ของสินค้าอื่น) copy ไม่ส่ง productIds ข้ามสินค้าที่มองไม่เห็น (R1 F3)
  {
    const p: string[] = [];
    if (!fx) {
      await mkProd("H1", { basePriceSatang: 3000 });
      if (PR.H1) {
        const r0 = await setCP(ownerId, PR.H1, [row(null, U.A, 2900)]);
        if (!okish(r0)) p.push(`fixture H1 แถว (ทุกช่องทาง, A) → ${refusalTxt(r0)}`);
        const mv = await step("H1 → สินค้าของสาขา E", () => catalogMod.updateProduct(cctxSys, PR.H1, { unitId: U.E }));
        if (!mv) p.push("fixture H1 ย้ายไปสาขา E ไม่ได้");
      } else p.push("fixture H1 ไม่มี");
    }
    const h0 = await cpFp("H1");
    const r1 = await copy(mgrABId, { fromUnitId: U.A, toUnitId: U.B, overwrite: false });
    if (!okish(r1)) p.push(`ผู้จัดการ A+B ไม่ส่ง productIds → ${refusalTxt(r1)} ${short(r1?.message ?? "", 40)} (คาด ok + skipped)`);
    else {
      if (!(r1.skipped >= 1)) p.push(`skipped ${r1.skipped} (คาด ≥ 1)`);
      if (Array.isArray(r1.productIds) && r1.productIds.includes(PR.H1)) p.push("H1 ถูกเขียน");
    }
    if ((await cpFp("H1")) !== h0 || !h0) p.push(`แถว H1 เปลี่ยน ${await cpSig("H1")}`);
    const r2 = await copy(mgrABId, { fromUnitId: U.A, toUnitId: U.B, overwrite: false });
    const r3 = await copy(ownerId, { fromUnitId: U.A, toUnitId: U.B, overwrite: false });
    if (!okish(r2) || r2.changed !== false) p.push(`รันซ้ำผู้จัดการ → ${refusalTxt(r2)} changed=${r2?.changed}`);
    if (!okish(r3) || r3.changed !== false) p.push(`เจ้าของ → ${refusalTxt(r3)} changed=${r3?.changed}`);
    if (okish(r2) && okish(r3) && r2.skipped !== r3.skipped) p.push(`skipped ผู้จัดการ ${r2.skipped} ≠ เจ้าของ ${r3.skipped}`);
    chk("PR10", !fx && p.length === 0, "ไม่ส่ง productIds: ข้าม+นับสินค้าที่มองไม่เห็น · ไม่ NOT_FOUND · ไม่เขียน H1 · รันซ้ำไม่เปลี่ยน", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ─── ขายผ่านหน้าขาย (quote → submit) · คืนเงิน ───
  let keyN = 0;
  const newKey = (pfx = "k") => `${KEY_PREFIX}-${pfx}-${++keyN}`;
  type Sold = { saleId: string; grand: number };
  const sell = async (k: string, lines: Any[], channel: Any = null, alt: { ctx: Any; devCtx: Any } | null = null): Promise<Sold> => {
    if (fx) return { saleId: "", grand: 0 };
    const cart = { lines, ...(channel?.id ? { channelId: channel.id } : {}) };
    const q = await call(register, "quoteRegisterCart", alt?.ctx ?? ctxOf(k), owner, cart);
    const g = q?.ok === true ? Number(q.grandTotalSatang) : NaN;
    if (!Number.isFinite(g)) {
      notes.push(`quote ${k}: ${codeOf(q)} ${short(q?.message ?? "", 60)}`);
      return { saleId: "", grand: 0 };
    }
    const platform = channel?.payout === "PLATFORM";
    const input = { ...cart, idempotencyKey: newKey("reg"), expectedGrandTotalSatang: g, payMethods: [{ type: platform ? "PLATFORM" : "CASH", amountSatang: g }], ...(platform ? {} : { cashReceivedSatang: g }) };
    const r = await call(register, "submitRegisterSale", alt?.devCtx ?? ctxOf(k, DEV[k]), owner, input);
    const saleId = r?.ok === true ? String(r.saleId ?? "") : "";
    if (!saleId) notes.push(`submit ${k}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    return { saleId, grand: g };
  };
  const refund = async (k: string, s: Sold, qty: number, amount: number, type = "CASH"): Promise<string> => {
    if (!s.saleId) return "";
    const line = await P.posSaleLine.findFirst({ where: { saleId: s.saleId }, select: { id: true } }).catch(() => null);
    const r = await call(refundMod, "refundSale", ctxOf(k, DEV[k]), owner, {
      saleId: s.saleId,
      lines: [{ lineId: String(line?.id ?? ""), qty }],
      payMethods: [{ type, amountSatang: amount }],
      reasonCode: "CHANGED_MIND",
      reason: "ลูกค้าเปลี่ยนใจ",
      idempotencyKey: newKey("rf"),
    });
    const id = r?.ok === true ? String(r.refund?.id ?? "") : "";
    if (!id) notes.push(`refund ${k}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    return id;
  };
  const pl = (productId: string | undefined, qty = 1) => ({ productId: productId ?? "none", qty });
  const receiptNoOf = async (id: string) => (id ? String((await P.posSale.findUnique({ where: { id }, select: { receiptNo: true } }).catch(() => null))?.receiptNo ?? "") : "");

  // ════════ RN ใบเสร็จต่อสาขา ════════
  const updUnit = (actor: Any, input: Any) => (fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(rsMod, "updatePosReceiptUnitSettings", posCtx, actor, input));
  const posSettings = async (): Promise<Any> => (await P.appSystem.findUnique({ where: { id: S.POS || "-" }, select: { settings: true } }).catch(() => null))?.settings ?? null;
  const HEADER_ADDR = `ที่อยู่ระบบ ${RAND}`;
  const A_ADDR = "999 ถ.สาขาเอ";
  const A_PHONE = "0811111111";
  const B_PHONE = "0822222222";
  if (!fx) {
    const h = await call(rsMod, "updatePosReceiptSettings", posCtx, owner, { header: { address: HEADER_ADDR } });
    if (h?.ok !== true) notes.push(`updatePosReceiptSettings header: ${codeOf(h)} ${short(h?.message ?? "", 60)}`);
  }
  const wA = await updUnit(owner, { unitId: U.A, patch: { taxBranchNo: "00001", address: A_ADDR, phone: A_PHONE } });
  const sA = await sell("A", [pl(PR.S1)]);
  const sB = await sell("B", [pl(PR.S1)]);
  const sA0 = await sell("A", [pl(PR.S0)]);
  // RN4: POS2 ไม่ผูกสมุดบัญชี ⇒ ใบเสร็จ RECEIPT · สาขา D อยู่ใน POS2 (หลัง PR3) และตั้งค่าสาขา 00009 ไว้
  DEV.D = `qc211${RAND}d`;
  const ctx2 = (deviceId?: string): Any => ({ tenantId: T, systemId: S.POS2, unitId: U.D, ...(deviceId ? { deviceId } : {}) });
  let wD: Any = { ok: false, code: "FIXTURE" };
  let sD: Sold = { saleId: "", grand: 0 };
  if (!fx) {
    const rg = await call(devMod, "registerDevice", ctx2(), owner, { name: "เคาน์เตอร์ D QC P2.11", deviceCode: DEV.D });
    if (rg?.ok !== true) notes.push(`registerDevice D: ${codeOf(rg)} ${short(rg?.message ?? "", 60)}`);
    const o = await call(shiftMod, "openShift", ctx2(DEV.D), owner, { deviceId: DEV.D, deviceLabel: "เคาน์เตอร์ D QC P2.11", floatSatang: 0 });
    if (o?.ok !== true) notes.push(`เปิดกะ D: ${codeOf(o)} ${short(o?.message ?? "", 60)}`);
    await mkProd("S2P", { basePriceSatang: 2000 }, { tenantId: T, systemId: S.POS2, actorUserId: SYSTEM_ACTOR });
    wD = await call(rsMod, "updatePosReceiptUnitSettings", { tenantId: T, systemId: S.POS2 }, owner, { unitId: U.D, patch: { taxBranchNo: "00009" } });
    sD = await sell("D", [pl(PR.S2P)], null, { ctx: ctx2(), devCtx: ctx2(DEV.D) });
  }
  const payloadOf = async (k: string, saleId: string): Promise<Any> => {
    if (!saleId) return null;
    const r = await call(receiptMod, "receiptPayload", ctxOf(k), owner, { saleId });
    return r?.ok === true ? r.payload : null;
  };
  const html = (pl0: Any, locale: "th" | "en" = "th"): string => {
    const r = callSync(renderMod, "renderReceiptHtml", pl0, { paper: "80", locale });
    return typeof r === "string" ? r : "";
  };
  const text = (pl0: Any): string => {
    const r = callSync(renderMod, "encodeEscPos", pl0, { paper: "80", drawerKick: false, thaiText: "raster", cut: true });
    return Array.isArray(r?.rasterSlots) ? r.rasterSlots.map((s: Any) => String(s?.text ?? "")).join("\n") : "";
  };
  const PA = await payloadOf("A", sA.saleId);
  const PB = await payloadOf("B", sB.saleId);
  const PD0 = sD.saleId ? (((r: Any) => (r?.ok === true ? r.payload : null))(await call(receiptMod, "receiptPayload", ctx2(), owner, { saleId: sD.saleId }))) : null;
  const HEAD_OFFICE = String(renderMod?.RECEIPT_LABELS?.th?.headOffice ?? "สำนักงานใหญ่");
  {
    const p: string[] = [];
    if (wA?.ok !== true) p.push(`ตั้ง taxBranchNo A → ${refusalTxt(wA)} ${short(wA?.message ?? "", 50)}`);
    if (!PA) p.push(`payload A ${sA.saleId ? "อ่านไม่ได้" : "ไม่มีบิล"}`);
    else {
      if (PA.kind !== "TAX_INVOICE_ABB") p.push(`A kind ${PA.kind}`);
      if (PA.shop?.branchNo !== "00001") p.push(`A shop.branchNo ${PA.shop?.branchNo} (คาด 00001)`);
      if (PA.shop?.taxId !== BOOK.taxId) p.push(`A taxId ${PA.shop?.taxId}`);
      if (!html(PA).includes("สาขาที่ 00001")) p.push('A HTML th ไม่มี "สาขาที่ 00001"');
      if (!html(PA, "en").includes("Branch 00001")) p.push('A HTML en ไม่มี "Branch 00001"');
      if (!text(PA).includes("สาขาที่ 00001")) p.push('A ESC/POS ไม่มี "สาขาที่ 00001"');
    }
    if (!PB) p.push(`payload B ${sB.saleId ? "อ่านไม่ได้" : "ไม่มีบิล"}`);
    else {
      if (PB.kind !== "TAX_INVOICE_ABB") p.push(`B kind ${PB.kind}`);
      if (PB.shop?.branchNo !== "00000") p.push(`B shop.branchNo ${PB.shop?.branchNo} (คาด สมุด 00000)`);
      const hb = html(PB);
      if (!hb.includes(HEAD_OFFICE) || hb.includes("00001")) p.push(`B HTML ${hb.includes(HEAD_OFFICE) ? "" : "ไม่มีสำนักงานใหญ่ "}${hb.includes("00001") ? "มี 00001" : ""}`);
      if (!text(PB).includes(HEAD_OFFICE)) p.push("B ESC/POS ไม่มีสำนักงานใหญ่");
    }
    chk("RN1", !fx && p.length === 0, "A = สาขาที่ 00001 (payload/HTML th-en/ESC-POS) · B = สมุด 00000 สำนักงานใหญ่", FX(NOTE() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    if (PA && (PA.shop?.address !== A_ADDR || PA.shop?.phone !== A_PHONE)) p.push(`A ที่อยู่/โทร ${short([PA.shop?.address, PA.shop?.phone], 80)}`);
    if (PB && (PB.shop?.address !== HEADER_ADDR || PB.shop?.phone !== BOOK.phone)) p.push(`B ที่อยู่/โทร ${short([PB.shop?.address, PB.shop?.phone], 80)} (คาด หัวระบบ/สมุด)`);
    if (!PA || !PB) p.push("payload A/B ไม่มี (ดู RN1)");
    const ro = (s: Any, u: string) => callSync(rsShared, "receiptUnitOverride", s, u);
    const NONE = J({ taxBranchNo: null, address: null, phone: null });
    const st = await posSettings();
    const pick3 = (o: Any) => J({ taxBranchNo: o?.taxBranchNo ?? "∅", address: o?.address ?? "∅", phone: o?.phone ?? "∅" });
    const exactNone = (o: Any) => J({ taxBranchNo: o?.taxBranchNo, address: o?.address, phone: o?.phone }) === NONE;
    if (pick3(ro(st, U.A)) !== J({ taxBranchNo: "00001", address: A_ADDR, phone: A_PHONE })) p.push(`receiptUnitOverride(A) ${short(ro(st, U.A), 100)}`);
    if (!exactNone(ro(st, U.B))) p.push(`receiptUnitOverride(B) ${short(ro(st, U.B), 80)} (คาด null ×3)`);
    for (const [lbl, s] of [["null", null], ["byUnit สตริง", { pos: { receipt: { byUnit: "x" } } }], ["ค่าพัง", { pos: { receipt: { byUnit: { [U.A]: { taxBranchNo: "12", address: 5, phone: [] } } } } }]] as const)
      if (!exactNone(ro(s, U.A))) p.push(`receiptUnitOverride(${lbl}) ${short(ro(s, U.A), 80)}`);
    const rs0 = await call(rsMod, "posReceiptSettings", posCtx);
    if (rs0?.settings?.header?.address !== HEADER_ADDR) p.push(`posReceiptSettings header.address ${short(rs0?.settings?.header?.address ?? codeOf(rs0), 50)} (byUnit ทำให้อ่านค่าตั้งพัง?)`);
    const sys = !fx ? await call(rsMod, "updatePosReceiptSettings", posCtx, owner, { footer: `ขอบคุณ ${RAND}` }) : null;
    if (sys && sys.ok !== true) p.push(`updatePosReceiptSettings footer → ${codeOf(sys)}`);
    if (pick3(ro(await posSettings(), U.A)) !== J({ taxBranchNo: "00001", address: A_ADDR, phone: A_PHONE })) p.push("ตัวเขียนระดับระบบทับ byUnit");
    const clr = await updUnit(owner, { unitId: U.A, patch: { address: null } });
    if (clr?.ok !== true) p.push(`ล้างที่อยู่ A → ${refusalTxt(clr)}`);
    const PA2 = await payloadOf("A", sA.saleId);
    if (PA2 && (PA2.shop?.address !== HEADER_ADDR || PA2.shop?.phone !== A_PHONE || PA2.shop?.branchNo !== "00001")) p.push(`A หลังล้างที่อยู่ ${short([PA2.shop?.address, PA2.shop?.phone, PA2.shop?.branchNo], 90)}`);
    chk("RN2", !fx && p.length === 0, "ที่อยู่/โทรต่อสาขา → หัวระบบ → สมุด · ตัวอ่านบริสุทธิ์ · byUnit ไม่ทำค่าตั้งพัง/ไม่ถูกทับ", FX(NOTE() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    const st0 = J(await posSettings());
    const bad: [string, Any, Any, string, string][] = [
      ["taxBranchNo 1234", owner, { unitId: U.A, patch: { taxBranchNo: "1234" } }, "VALIDATION", "taxBranchNo"],
      ["taxBranchNo 123456", owner, { unitId: U.A, patch: { taxBranchNo: "123456" } }, "VALIDATION", "taxBranchNo"],
      ["taxBranchNo 12a45", owner, { unitId: U.A, patch: { taxBranchNo: "12a45" } }, "VALIDATION", "taxBranchNo"],
      ["สาขา C เก็บถาวร", owner, { unitId: U.C, patch: { address: "x" } }, "VALIDATION", "unitId"],
      ["สาขา D เลิกผูก", owner, { unitId: U.D, patch: { address: "x" } }, "VALIDATION", "unitId"],
      ["สาขามั่ว", owner, { unitId: `nope${RAND}`, patch: { address: "x" } }, "VALIDATION", "unitId"],
      ["สาขาร้าน T2", owner, { unitId: U.X, patch: { address: "x" } }, "VALIDATION", "unitId"],
      ["คีย์แปลก", owner, { unitId: U.A, patch: { footer: "x" } }, "VALIDATION", ""],
      ["ที่อยู่ 201 ตัว", owner, { unitId: U.A, patch: { address: "ก".repeat(201) } }, "VALIDATION", "address"],
      ["ผู้จัดการ A ตั้ง taxBranchNo", mgrA, { unitId: U.A, patch: { taxBranchNo: "00002" } }, "PERMISSION_DENIED", ""],
      ["ผู้จัดการ A+B ตั้ง taxBranchNo", mgrAB, { unitId: U.A, patch: { taxBranchNo: "00002" } }, "PERMISSION_DENIED", ""],
      ["ผู้จัดการ A ตั้งที่อยู่ B", mgrA, { unitId: U.B, patch: { address: "x" } }, "PERMISSION_DENIED", ""],
      ["พนักงาน ตั้งที่อยู่ A", cashA, { unitId: U.A, patch: { address: "x" } }, "PERMISSION_DENIED", ""],
    ];
    for (const [lbl, who, input, code, field] of bad) {
      const r = await updUnit(who, input);
      if (!(codeIs(r, code) && (!field || r.field === field))) p.push(`${lbl} → ${refusalTxt(r)} (คาด ${code}${field ? `@${field}` : ""})`);
    }
    if (J(await posSettings()) !== st0) p.push("คำปฏิเสธเปลี่ยนค่าตั้ง");
    const auds = async () => (S.POS ? await auditsOf(AUDIT_SETTINGS, S.POS) : []);
    const n0 = (await auds()).length;
    const wb = await updUnit(owner, { unitId: U.B, patch: { phone: B_PHONE } });
    if (wb?.ok !== true) p.push(`เจ้าของตั้งโทร B → ${refusalTxt(wb)}`);
    const a1 = await auds();
    const lastB = a1[a1.length - 1];
    const tB = short([lastB?.before, lastB?.after], 20_000);
    if (a1.length !== n0 + 1) p.push(`audit โทร B ${n0} → ${a1.length} (คาด +1)`);
    else if (tB.includes(B_PHONE) || !tB.includes(U.B)) p.push(`audit โทร B ${tB.includes(B_PHONE) ? "มีเบอร์ดิบ" : ""} ${tB.includes(U.B) ? "" : "ไม่มี unitId"}`);
    const wm = await updUnit(mgrA, { unitId: U.A, patch: { address: "ที่อยู่ผู้จัดการ" } });
    if (wm?.ok !== true) p.push(`ผู้จัดการ A ตั้งที่อยู่ A → ${refusalTxt(wm)} ${short(wm?.message ?? "", 40)}`);
    const a2 = await auds();
    if (a2.length !== n0 + 2 || a2[a2.length - 1]?.actorId !== mgrAId) p.push(`audit ผู้จัดการ ${a2.length - n0} แถว actor ${short(a2[a2.length - 1]?.actorId, 30)}`);
    const again = await updUnit(mgrA, { unitId: U.A, patch: { address: "ที่อยู่ผู้จัดการ" } });
    if (again?.ok !== true || (await auds()).length !== n0 + 2) p.push(`ค่าเดิมซ้ำ → ${refusalTxt(again)} audit ${(await auds()).length - n0}`);
    const st = await posSettings();
    const ro = (u: string) => callSync(rsShared, "receiptUnitOverride", st, u);
    if (ro(U.A)?.address !== "ที่อยู่ผู้จัดการ" || ro(U.A)?.taxBranchNo !== "00001" || ro(U.A)?.phone !== A_PHONE) p.push(`byUnit A ${short(ro(U.A), 90)}`);
    if (ro(U.B)?.phone !== B_PHONE) p.push(`byUnit B ถูกทับ ${short(ro(U.B), 60)}`);
    if (st?.pos?.receipt?.header?.address !== HEADER_ADDR) p.push(`header.address ถูกทับ ${short(st?.pos?.receipt?.header?.address, 40)}`);
    chk("RN3", !fx && p.length === 0, "VALIDATION ×9 · PERMISSION_DENIED ×4 · ไม่เขียนอะไร · audit ปิดบังเบอร์ · ค่าเดิมไม่ลง · ไม่ทับคีย์อื่น", FX(NOTE() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    if (wD?.ok !== true) p.push(`ตั้ง taxBranchNo 00009 ที่ D (POS2) → ${refusalTxt(wD)} ${short(wD?.message ?? "", 40)}`);
    if (!PD0) p.push(`payload บิล D (POS2 ไม่ผูกสมุด) ${sD.saleId ? "อ่านไม่ได้" : "ไม่มีบิล"}`);
    else {
      if (PD0.kind !== "RECEIPT") p.push(`kind ${PD0.kind} (คาด RECEIPT — POS2 ไม่ผูกสมุด)`);
      if (PD0.shop?.branchNo !== undefined || PD0.shop?.taxId !== undefined) p.push(`มี branchNo/taxId ${short([PD0.shop?.branchNo, PD0.shop?.taxId], 40)}`);
      const h0 = html(PD0);
      const t0 = text(PD0);
      if (h0.includes("สาขาที่") || h0.includes("00009") || t0.includes("สาขาที่") || t0.includes("00009")) p.push("HTML/ESC-POS มีสาขาที่/00009");
    }
    chk("RN4", !fx && p.length === 0, "RECEIPT (POS2 ไม่ผูกสมุด · สาขา D ตั้ง 00009) ไม่มีเลขสาขา", FX(NOTE() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    const period = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7).replace("-", "");
    const nA = await receiptNoOf(sA.saleId);
    const nB = await receiptNoOf(sB.saleId);
    const nA0 = await receiptNoOf(sA0.saleId);
    for (const [lbl, n, want] of [["A แรก", nA, `${period}-0001`], ["B แรก", nB, `${period}-0001`], ["A ที่สอง", nA0, `${period}-0002`]] as const) {
      if (!/^\d{6}-\d{4}$/.test(n) || n !== want) p.push(`${lbl} ${n || "—"} (คาด ${want})`);
    }
    const rA = await refund("A", sA, 1, sA.grand);
    const rB = await refund("B", sB, 1, sB.grand);
    for (const [lbl, id] of [["ใบคืน A", rA], ["ใบคืน B", rB]] as const) {
      const n = await receiptNoOf(id);
      if (!/^CN\d{6}-\d{4}$/.test(n) || n !== `CN${period}-0001`) p.push(`${lbl} ${n || "—"} (คาด CN${period}-0001)`);
    }
    chk("RN5", !fx && p.length === 0, "YYYYMM-NNNN ต่อสาขา · CN ต่อสาขา · ไม่มีคำนำหน้า", FX(NOTE() + (P8(p) || `ครบ (${nA} · ${nB} · ${nA0})`)));
  }

  // ════════ RP รายงานช่องทาง (บิลเลื่อนเวลาไป D0 = 2026-09-20 · D1 = 2026-09-21) ════════
  const D0 = "2026-09-20";
  const D1 = "2026-09-21";
  const s1 = await sell("A", [pl(PR.S1)]);
  const s2 = await sell("A", [pl(PR.S1, 2)], CH.LM_A);
  const s3 = await sell("A", [pl(PR.S1)]);
  const s4 = await sell("B", [pl(PR.S1, 3)]);
  const s5 = await sell("B", [pl(PR.S1)], CH.LM_B);
  const s6 = await sell("A", [pl(PR.S1)]);
  const r1 = s2.saleId ? await refund("A", s2, 1, Math.round(s2.grand / 2), CH.LM_A?.payout === "PLATFORM" ? "PLATFORM" : "CASH") : "";
  if (s3.saleId) {
    const v = await call(svc, "voidSale", T, U.A, s3.saleId);
    if (v?.ok === false) notes.push(`voidSale s3: ${codeOf(v)} ${short(v.message, 60)}`);
  }
  // มติ 7 + โน้ต D2: เลื่อนเวลาเอกสาร (createdAt/paidAt) ด้วย SQL ดิบ — ช่วงรายงานแยกจากบิลวันนี้ของ RN/SK ได้แน่นอน
  const at = (iso: string, plusMin = 0) => new Date(Date.parse(iso) + plusMin * MIN);
  const moves: [string, Date][] = [
    [s1.saleId, at(`${D0}T05:00:00Z`, 0)],
    [s2.saleId, at(`${D0}T05:00:00Z`, 1)],
    [s3.saleId, at(`${D0}T05:00:00Z`, 2)],
    [r1, at(`${D0}T05:00:00Z`, 3)],
    [s4.saleId, at(`${D0}T05:00:00Z`, 4)],
    [s5.saleId, at(`${D0}T05:00:00Z`, 5)],
    [s6.saleId, at(`${D0}T19:00:00Z`)], // = 02:00 น. ของ D1 เวลาไทย
  ];
  for (const [id, d] of moves) if (id) await step("เลื่อนเวลาบิล", () => P.$executeRawUnsafe(`UPDATE "PosSale" SET "createdAt" = $1, "paidAt" = $1 WHERE id = $2 AND "tenantId" = $3`, d, id, T));
  await drain();
  const chSales = (await P.posSale.findMany({
    where: { tenantId: T, systemId: S.POS || "-" },
    select: { id: true, unitId: true, status: true, docType: true, channelCode: true, sourceModule: true, grandTotalSatang: true, channelCommissionSatang: true, channelCommissionVatSatang: true, createdAt: true },
  }).catch(() => [])) as ChSale[];
  const rctx = (k?: string): Any => ({ tenantId: T, systemId: S.POS, ...(k ? { unitId: U[k] } : {}) });
  const rep = (k: string | undefined, actor: Any, from: string, to: string) => call(repMod, "reportChannels", rctx(k), actor, { from, to });
  // ข้อสอบตรวจตัวเอง: ค่าคอมฯ ของบิล LINEMAN A = ครึ่งขึ้น 30% · VAT 7% ของค่าคอมฯ · ใบคืนมีส่วนแบ่งค่าคอมฯ
  const fxRp: string[] = [];
  {
    const S2 = chSales.find((x) => x.id === s2.saleId);
    if (!S2) fxRp.push("ไม่มีบิล LINEMAN A");
    else if (S2.channelCode !== "LINEMAN" || S2.channelCommissionSatang !== halfUp(S2.grandTotalSatang, 3000, 10_000) || S2.channelCommissionVatSatang !== halfUp(S2.channelCommissionSatang, 700, 10_000)) fxRp.push(`บิล LINEMAN A ${short(S2, 160)}`);
    const R1 = chSales.find((x) => x.id === r1);
    if (!R1 || R1.docType !== "REFUND" || R1.channelCode !== "LINEMAN" || !(R1.channelCommissionSatang > 0)) fxRp.push(`ใบคืน LINEMAN ${short(R1 ?? "ไม่มี", 120)}`);
    if (chSales.find((x) => x.id === s3.saleId)?.status !== "VOIDED") fxRp.push("บิล s3 ไม่ VOIDED");
    for (const s of [s1, s2, s3, s4, s5, s6]) if (!s.saleId) fxRp.push("บิลรายงานสร้างไม่ครบ");
  }
  const FXR = () => (fxRp.length ? `fixture RP: ${P8(fxRp)} · ` : "");
  const rAll = await rep(undefined, owner, D0, D0);
  const rA = await rep("A", owner, D0, D0);
  const rB = await rep("B", owner, D0, D0);
  {
    const p: string[] = [];
    cmpChannels("A", rA, expChannels(chSales, [U.A], D0, D0, 0), p);
    cmpChannels("B", rB, expChannels(chSales, [U.B], D0, D0, 0), p);
    if (rA?.ok === true && (rA.report?.from !== D0 || rA.report?.to !== D0 || rA.report?.unitId !== U.A)) p.push(`A from/to/unitId ${short([rA.report?.from, rA.report?.to, uk(rA.report?.unitId ?? null)], 60)}`);
    const eA = expChannels(chSales, [U.A], D0, D0, 0);
    const eAll = expChannels(chSales, [U.A, U.B], D0, D0, 0);
    const daily = await call(repMod, "reportDailySales", rctx(), owner, { from: D0, to: D0 });
    if (daily?.ok !== true || daily.report?.totals?.netSalesSatang !== eAll.totals.grossSatang - eAll.totals.refundSatang || daily.report?.totals?.billCount !== eAll.totals.billCount)
      fxRp.push(`ตัวอ้างอิง ≠ reportDailySales (net ${daily?.report?.totals?.netSalesSatang} vs ${eAll.totals.grossSatang - eAll.totals.refundSatang} · บิล ${daily?.report?.totals?.billCount} vs ${eAll.totals.billCount})`);
    if (eA.rows.find((x) => x.channelCode === "STORE")?.billCount !== 1 || !(eA.rows.find((x) => x.channelCode === "LINEMAN")?.refundSatang ?? 0)) fxRp.push(`ตัวอ้างอิง A ${short(eA.rows, 160)}`);
    const csv = await call(repMod, "reportCsv", rctx(), owner, { kind: "channels", from: D0, to: D0 });
    if (csv?.ok !== true) p.push(`CSV channels → ${codeOf(csv)} ${short(csv?.message ?? "", 40)}`);
    else {
      const lines = String(csv.body ?? "").replace(/^﻿/, "").split("\n").filter(Boolean);
      const head = Array.isArray(repMod?.CSV_HEADERS?.channels) ? repMod.CSV_HEADERS.channels.join(",") : "";
      const nRows = Array.isArray(rAll?.report?.rows) ? rAll.report.rows.length : -1;
      if (!head || lines[0] !== head) p.push(`CSV หัว ${short(lines[0], 60)} (คาด ${short(head, 60)})`);
      if (lines.length !== nRows + 1 || !lines.some((l) => l.includes("LINEMAN"))) p.push(`CSV ${lines.length - 1} แถว (คาด ${nRows}) ${lines.some((l) => l.includes("LINEMAN")) ? "" : "ไม่มี LINEMAN"}`);
      if (!/channels/.test(String(csv.filename ?? ""))) p.push(`CSV filename ${csv.filename}`);
    }
    chk("RP1", !fx && fxRp.length === 0 && p.length === 0, "ต่อสาขาตรงตัวอ้างอิง (VOIDED ไม่นับ · ใบคืนหัก) · totals · CSV channels", FX(NOTE() + FXR() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    cmpChannels("ทุกสาขา", rAll, expChannels(chSales, [U.A, U.B], D0, D0, 0), p);
    if (rAll?.ok === true && rA?.ok === true && rB?.ok === true) {
      const codes = new Set<string>([...rA.report.rows, ...rB.report.rows].map((x: Any) => String(x.channelCode)));
      for (const c of codes)
        for (const k of CH_NUM_KEYS) {
          const s = sum([rA, rB].map((r) => Number(r.report.rows.find((x: Any) => x.channelCode === c)?.[k] ?? 0)));
          const g = rAll.report.rows.find((x: Any) => x.channelCode === c)?.[k];
          if (g !== s) p.push(`ทุกสาขา ${c}.${k} ${g} ≠ A+B ${s}`);
        }
    }
    const rM = await rep(undefined, mgrA, D0, D0);
    cmpChannels("ผู้จัดการ A ไม่ระบุสาขา", rM, expChannels(chSales, [U.A], D0, D0, 0), p);
    const rE = await rep("E", owner, D0, D0);
    if (rE?.ok !== true || !Array.isArray(rE.report?.rows) || rE.report.rows.length !== 0) p.push(`สาขา E → ${codeOf(rE)} ${short(rE?.report?.rows, 60)} (คาด rows [])`);
    chk("RP2", !fx && fxRp.length === 0 && p.length === 0, "ทุกสาขา = Σ A+B · ผู้จัดการ A = A · E ว่าง", FX(NOTE() + FXR() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    const lm = (r: Any) => (Array.isArray(r?.report?.rows) ? r.report.rows.filter((x: Any) => x?.channelCode === "LINEMAN") : []);
    const all = lm(rAll);
    if (all.length !== 1) p.push(`ทุกสาขา LINEMAN ${all.length} แถว (คาด 1)`);
    else {
      if (all[0].billCount !== 2) p.push(`ทุกสาขา LINEMAN billCount ${all[0].billCount} (คาด 2)`);
      if (![CH_NAME.A, CH_NAME.B].includes(all[0].name)) p.push(`ทุกสาขา LINEMAN name ${short(all[0].name, 40)}`);
    }
    if (lm(rB)[0]?.name !== CH_NAME.B) p.push(`B LINEMAN name ${short(lm(rB)[0]?.name, 40)} (คาด ${CH_NAME.B})`);
    if (lm(rA)[0]?.name !== CH_NAME.A) p.push(`A LINEMAN name ${short(lm(rA)[0]?.name, 40)} (คาด ${CH_NAME.A})`);
    chk("RP3", !fx && fxRp.length === 0 && p.length === 0, "LINEMAN A+B = 1 แถว บิล 2 · ชื่อตามสาขาที่เลือก", FX(NOTE() + FXR() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    const e1 = expChannels(chSales, [U.A, U.B], D1, D1, 0);
    cmpChannels("D1 cutoff 0", await rep(undefined, owner, D1, D1), e1, p);
    if (e1.rows.find((x) => x.channelCode === "STORE")?.billCount !== 1) fxRp.push(`ตัวอ้างอิง D1 cutoff 0 ${short(e1.rows, 80)} (คาด STORE 1 บิล)`);
    const set = (m: number) => (fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(genMod, "updatePosGeneralSettings", posCtx, owner, { dayCutoffMinutes: m }));
    const c1 = await set(240);
    if (c1?.ok !== true) p.push(`ตั้ง cutoff 240 → ${codeOf(c1)} ${short(c1?.message ?? "", 40)}`);
    const e0 = expChannels(chSales, [U.A, U.B], D0, D0, 240);
    cmpChannels("D0 cutoff 240", await rep(undefined, owner, D0, D0), e0, p);
    const store0 = expChannels(chSales, [U.A, U.B], D0, D0, 0).rows.find((x) => x.channelCode === "STORE")?.billCount ?? 0;
    if ((e0.rows.find((x) => x.channelCode === "STORE")?.billCount ?? 0) !== store0 + 1) fxRp.push("ตัวอ้างอิง cutoff 240 ไม่ย้ายบิล 02:00 มา D0");
    const r1d = await rep(undefined, owner, D1, D1);
    if (r1d?.ok !== true || (r1d.report?.rows ?? [1]).length !== 0) p.push(`D1 cutoff 240 → ${codeOf(r1d)} ${short(r1d?.report?.rows, 60)} (คาด rows [])`);
    const c0 = await set(0);
    if (c0?.ok !== true) p.push(`คืน cutoff 0 → ${codeOf(c0)}`);
    chk("RP4", !fx && fxRp.length === 0 && p.length === 0, "บิล 02:00 ย้ายวันตาม cutoff 240 · ตรงตัวอ้างอิง", FX(NOTE() + FXR() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    const OV = (actor: Any, input: Any) => call(ovMod, "reportOverview", rctx(), actor, input);
    const noGen = (x: Any) => J(isRecord(x) ? { ...x, generatedAt: undefined } : x);
    const o = await OV(owner, { from: D0, to: D0 });
    if (o?.ok !== true) p.push(`ภาพรวม → ${codeOf(o)}`);
    else {
      const v = o.overview ?? {};
      const direct = await rep(undefined, owner, D0, D0);
      if (v.channels?.ok !== true) p.push(`ส่วน channels → ${codeOf(v.channels)}`);
      else if (direct?.ok !== true || noGen(v.channels.data) !== noGen(direct.report)) p.push(`channels ≠ reportChannels ${short(v.channels.data?.rows, 80)}`);
      const dd = await call(repMod, "reportDailySales", rctx(), owner, { from: D0, to: D0 });
      if (v.daily?.ok !== true || noGen(v.daily.data) !== noGen(dd?.report)) p.push("daily ≠ reportDailySales (OV PAR)");
      const pp = await call(repMod, "reportPayments", rctx(), owner, { from: D0, to: D0 });
      if (v.payments?.ok !== true || noGen(v.payments.data) !== noGen(pp?.report)) p.push("payments ≠ reportPayments (OV PAR)");
    }
    const only = await OV(owner, { from: D0, to: D0, only: ["channels"] });
    if (only?.ok !== true || only.overview?.channels?.ok !== true || only.overview?.daily !== undefined) p.push(`only:[channels] → ${codeOf(only)} channels ${codeOf(only?.overview?.channels)} daily ${only?.overview?.daily === undefined ? "ไม่มี" : "มี"}`);
    const from93 = new Date(Date.parse(`${D0}T00:00:00Z`) - 92 * 86_400_000).toISOString().slice(0, 10);
    const long = await OV(owner, { from: from93, to: D0 });
    if (long?.ok !== true || !codeIs(long.overview?.channels, "VALIDATION") || long.overview?.chart?.ok !== true) p.push(`93 วัน → channels ${codeOf(long?.overview?.channels)} chart ${codeOf(long?.overview?.chart)} (คาด VALIDATION / ok)`);
    const den = await OV(cashA, { from: D0, to: D0 });
    if (den?.ok !== true || !codeIs(den.overview?.channels, "PERMISSION_DENIED") || !codeIs(den.overview?.daily, "PERMISSION_DENIED")) p.push(`พนักงาน → ${codeOf(den)} channels ${codeOf(den?.overview?.channels)} daily ${codeOf(den?.overview?.daily)}`);
    chk("RP5", !fx && p.length === 0, "ส่วน channels = reportChannels · OV PAR · only · ปฏิเสธต่อส่วน", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ════════ SK แผนที่คลัง · TR โอน ════════
  const map = fx ? null : await call(mapMod, MAP_FN, T, S.POS);
  const unitInv = new Map<string, string | null>((Array.isArray(map?.units) ? map.units : []).map((u: Any) => [String(u?.unitId), u?.inventorySystemId ?? null]));
  {
    const p: string[] = [];
    if (!mapMod) p.push(`${MAP_FN} ยังไม่มี (ไม่มีไฟล์ที่ export)`);
    else if (!okish(map)) p.push(`${MAP_FN} → ${refusalTxt(map)} ${short(map?.message ?? "", 50)}`);
    else {
      if (S_(...[...unitInv.keys()].map(uk)) !== S_("A", "B", "E")) p.push(`units ${S_(...[...unitInv.keys()].map(uk))} (คาด A,B,E)`);
      for (const [k, inv] of [["A", S.INV_AB], ["B", S.INV_AB], ["E", S.INV_E]] as const) if (unitInv.get(U[k]!) !== inv) p.push(`${k} → ${short(unitInv.get(U[k]!), 30)}`);
      const groups: Any[] = Array.isArray(map.groups) ? map.groups : [];
      const g = (inv: string) => groups.find((x) => x?.inventorySystemId === inv);
      if (groups.length !== 2) p.push(`groups ${groups.length} (คาด 2)`);
      if (S_(...(g(S.INV_AB)?.unitIds ?? []).map(uk)) !== S_("A", "B") || g(S.INV_AB)?.shared !== true) p.push(`คลังร่วม ${short(g(S.INV_AB), 120)}`);
      if (S_(...(g(S.INV_E)?.unitIds ?? []).map(uk)) !== "E" || g(S.INV_E)?.shared !== false) p.push(`คลัง E ${short(g(S.INV_E), 120)}`);
    }
    chk("SK1", !fx && p.length === 0, "A,B คลังร่วม (shared) · E คลังเดี่ยว · ไม่มี C/D", FX(NOTE() + (P8(p) || "ครบ")));
  }
  let I1 = "";
  let PI1 = "";
  if (!fx) {
    const it = await step("InvItem คลังร่วม", () => invSvc.createItem({ tenantId: T, systemId: S.INV_AB, actorUserId: ownerId }, { sku: `${TAG}-i1`, name: `สต็อกร่วม ${RAND}`, costSatang: 100, priceSatang: 4000 }));
    I1 = String(it?.id ?? "");
    PI1 = String((I1 ? await P.posProduct.findFirst({ where: { tenantId: T, systemId: S.POS, invItemId: I1 }, select: { id: true } }).catch(() => null) : null)?.id ?? "");
    if (!PI1) notes.push("InvItem คลังร่วมไม่มีแถว PosProduct (ensureForInvItem)");
    else {
      const sp = await call(catalogMod, "setPrice", cctxSys, PI1, 4000);
      if (sp?.ok === false) notes.push(`setPrice สินค้าคลัง: ${codeOf(sp)} ${short(sp?.message ?? "", 60)}`);
    }
  }
  const onHand = async () => Number((I1 ? await P.invItem.findUnique({ where: { id: I1 }, select: { onHand: true } }).catch(() => null) : null)?.onHand ?? NaN);
  const invOfA = unitInv.get(U.A ?? "") ?? S.INV_AB;
  const defLoc = !fx && I1 ? String((await step("ที่เก็บปริยาย", () => invSvc.ensureDefaultLocation({ tenantId: T, systemId: invOfA })))?.id ?? "") : "";
  const locQty = async () => Number((I1 && defLoc ? await P.invLocationStock.findFirst({ where: { itemId: I1, locationId: defLoc }, select: { onHand: true } }).catch(() => null) : null)?.onHand ?? NaN);
  {
    const p: string[] = [];
    const rc = I1 ? await call(stockMod, "posReceiveStock", ctxOf("A", DEV.A), owner, { itemId: I1, qty: 10, idempotencyKey: newKey("rcv") }) : { ok: false, code: "NO_ITEM" };
    if (rc?.ok !== true) p.push(`รับ 10 → ${codeOf(rc)} ${short(rc?.message ?? "", 40)}`);
    const a = await sell("A", [pl(PI1)]);
    await drain();
    if (!a.saleId) p.push("ขายที่ A ไม่สำเร็จ");
    if ((await onHand()) !== 9 || (await locQty()) !== 9) p.push(`หลังขาย A onHand ${await onHand()} ที่เก็บปริยาย ${await locQty()} (คาด 9/9)`);
    const b = await sell("B", [pl(PI1)]);
    await drain();
    if (!b.saleId) p.push("ขายที่ B ไม่สำเร็จ");
    if ((await onHand()) !== 8 || (await locQty()) !== 8) p.push(`หลังขาย B onHand ${await onHand()} ที่เก็บปริยาย ${await locQty()} (คาด 8/8)`);
    if (!mapMod || unitInv.get(U.B ?? "") !== S.INV_AB) p.push(`แผนที่คลังไม่ชี้ B → คลังร่วม (${short(unitInv.get(U.B ?? ""), 30)})`);
    chk("SK2", !fx && p.length === 0, "สต็อกร่วม: ขาย A/B ตัดที่เก็บปริยายเดียวกันตามแผนที่", FX(NOTE() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    const locE = !fx ? String((await step("ที่เก็บคลัง E", () => invSvc.createLocation({ tenantId: T, systemId: S.INV_E }, { name: `ชั้น E ${RAND}` })))?.id ?? "") : "";
    const locAB2 = !fx ? String((await step("ที่เก็บที่สองคลังร่วม", () => invSvc.createLocation({ tenantId: T, systemId: S.INV_AB }, { name: `ชั้นสอง ${RAND}` })))?.id ?? "") : "";
    const before = await onHand();
    const k = newKey("tf");
    const r = await call(stockMod, "posTransferStock", ctxOf("A", DEV.A), owner, { itemId: I1 || "none", qty: 1, toLocationId: locE || "none", idempotencyKey: k });
    if (!codeIs(r, "NOT_FOUND")) p.push(`ไปคลัง E → ${refusalTxt(r)} (คาด NOT_FOUND)`);
    const mv = Number(await P.invMovement.count({ where: { tenantId: T, idempotencyKey: { startsWith: `pos-tf-${k}` } } }).catch(() => -1));
    if (mv !== 0) p.push(`มีความเคลื่อนไหว ${mv}`);
    if ((await onHand()) !== before) p.push("onHand เปลี่ยน");
    const ok = await call(stockMod, "posTransferStock", ctxOf("A", DEV.A), owner, { itemId: I1 || "none", qty: 1, toLocationId: locAB2 || "none", idempotencyKey: newKey("tf") });
    if (ok?.ok !== true) p.push(`ตัวควบคุมบวก ในคลังร่วม → ${refusalTxt(ok)}`);
    chk("TR1", !fx && p.length === 0, "ข้ามคลัง = NOT_FOUND ไม่เคลื่อน · ในคลังเดียวกันได้", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ════════ FU2 ส่วนต่างสูตรของกลุ่มที่ถอด/เก็บ ════════
  {
    const p: string[] = [];
    const ids: Record<string, string> = {};
    const choice: Record<string, string> = {};
    if (!fx) {
      const r1i = await step("วัตถุดิบ", () => invSvc.createItem({ tenantId: T, systemId: S.INV_AB, actorUserId: ownerId }, { sku: `${TAG}-r1`, name: `นมสด ${RAND}`, costSatang: 10, priceSatang: 1000 }));
      ids.R1 = String(r1i?.id ?? "");
      for (const [g, nm, ch] of [["G1", `ท็อปปิ้ง ${RAND}`, [["c1", 0], ["c2", 500]]], ["G2", `ขนาด ${RAND}`, [["d1", 1000]]]] as const) {
        const r = await step(`กลุ่ม ${g}`, () => catalogMod.createOptionGroup(cctxSys, { unitId: U.A, name: nm, minSelect: 0, maxSelect: 2, choices: ch.map(([name, priceDelta]) => ({ name, priceDelta })) }));
        ids[g] = String(r?.id ?? "");
      }
      const cs = (await P.menuOptionChoice.findMany({ where: { tenantId: T, groupId: { in: [ids.G1, ids.G2].filter(Boolean) } }, select: { id: true, name: true } }).catch(() => [])) as Any[];
      for (const c of cs) choice[c.name] = c.id;
      for (const k of ["F1", "F2", "F3"]) await mkProd(k, { kind: "MENU", basePriceSatang: 6000 });
      const links: [string, string[]][] = [["F1", [ids.G1!, ids.G2!]], ["F2", [ids.G2!]], ["F3", [ids.G1!]]];
      for (const [k, gs] of links) await step(`ผูกกลุ่ม ${k}`, () => catalogMod.setProductOptionGroups(cctxSys, PR[k], gs));
      const lines: [string, [string, number][]][] = [["F1", [["c1", 5], ["d1", 3]]], ["F2", [["d1", 2]]], ["F3", [["c1", 4]]]];
      for (const [k, ls] of lines) await step(`ส่วนต่างสูตร ${k}`, () => catalogMod.setRecipeChoiceLines(cctxSys, PR[k], ls.map(([c, q]) => ({ choiceId: choice[c], invItemId: ids.R1, qtyDelta: q }))));
    }
    const nameOf = new Map(Object.entries(choice).map(([n, id]) => [id, n]));
    const lines = async (k: string) =>
      PR[k]
        ? S_(...((await P.posRecipeChoiceLine.findMany({ where: { tenantId: T, productId: PR[k] }, select: { choiceId: true, qtyDelta: true } }).catch(() => [])) as Any[]).map((l) => `${nameOf.get(l.choiceId) ?? "?"}:${l.qtyDelta}`))
        : "ไม่มีสินค้า";
    const expect = async (lbl: string, want: Record<string, string>) => {
      for (const [k, w] of Object.entries(want)) {
        const g = await lines(k);
        if (g !== w) p.push(`${lbl} ${k} = ${g || "∅"} (คาด ${w || "∅"})`);
      }
    };
    await expect("ตั้งต้น", { F1: S_("c1:5", "d1:3"), F2: "d1:2", F3: "c1:4" });
    const u = !fx ? await call(catalogMod, "setProductOptionGroups", cctxSys, PR.F1 ?? "none", [ids.G2]) : null;
    if (u && !okish(u)) p.push(`ถอด G1 → ${refusalTxt(u)}`);
    await expect("ถอด G1 จาก F1", { F1: "d1:3", F2: "d1:2", F3: "c1:4" });
    const rl = !fx ? await call(catalogMod, "setProductOptionGroups", cctxSys, PR.F1 ?? "none", [ids.G1, ids.G2]) : null;
    if (rl && !okish(rl)) p.push(`ผูก G1 กลับ → ${refusalTxt(rl)}`);
    await expect("ผูก G1 กลับ", { F1: "d1:3" });
    const ar = !fx ? await call(menuMod, "archiveOptionGroup", T, U.A, ids.G2 ?? "none") : null;
    if (ar && !okish(ar)) p.push(`เก็บ G2 → ${refusalTxt(ar)}`);
    await expect("เก็บ G2", { F1: "", F2: "", F3: "c1:4" });
    chk("FU2", !fx && p.length === 0, "ถอด/เก็บกลุ่ม → ส่วนต่างของกลุ่มนั้นหาย · ผูกกลับไม่ฟื้น · กลุ่มอื่นคงอยู่", FX(NOTE() + (P8(p) || "ครบ")));
  }
  await drain();
  if (notes.length) console.log(`  ℹ️  fixture ${notes.length} รายการ: ${notes.slice(0, 6).join(" | ")}`);
}

// ═════════════════════════ 7. คืนสภาพ — ลบร้านชั่วคราวทั้งร้าน ═════════════════════════
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
  let pending = [...tables];
  for (let pass = 0; pass < 10 && pending.length; pass++) {
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
/** ลายนิ้วมือของตารางที่ P2.11 เขียนของร้านที่ไม่ใช่ร้านชั่วคราว P2.11 (ทุกรอบ) */
async function othersFingerprint(): Promise<string> {
  const notTemp = `NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = x."tenantId" AND t.slug LIKE 'posqc-p211-%')`;
  const one = async (tb: string, agg: string) => {
    try {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n, ${agg} AS m FROM "${tb}" x WHERE ${notTemp}`)) as Any[];
      return `${tb}:${r[0]?.n ?? "?"}@${r[0]?.m ?? "?"}`;
    } catch (e) {
      return `${tb}:err ${(e as Error).message.slice(0, 40)}`;
    }
  };
  return [
    await one("PosProductChannelPrice", `coalesce(max(x."updatedAt")::text, '-')`),
    await one("PosRecipeChoiceLine", `coalesce(max(x."updatedAt")::text, '-')`),
    await one("PosReceiptCounter", `coalesce(sum(x.seq), 0)::text`),
  ].join(" · ");
}

// ═════════════════════════ 8. รัน ═════════════════════════
const fpBefore = await othersFingerprint();
let crashed = "";
const wipes: WipeReport[] = [];
try {
  await runStatic();
  await runFu1();
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
  } catch (e) {
    wipes.push({ tables: 0, left: {}, tenantLeft: 0, err: `cleanup: ${(e as Error).message.slice(0, 200)}` });
    console.log(`💥 cleanup: ${(e as Error).message.slice(0, 200)}`);
  } finally {
    removeFetchGuard();
  }
}
await sleep(200);
const tempLeft = wipes.flatMap((w) => Object.entries(w.left).map(([k, v]) => `${k}:${v}`));
const tenantLeft = sum(wipes.map((w) => w.tenantLeft));
const wipeErr = wipes.map((w) => w.err).filter(Boolean).join(" · ");
const mustTables = ["PosSale", "PosSaleLine", "PosPayment", "PosProductChannelPrice", "PosRecipeChoiceLine", "PosReceiptCounter", "PosDocCounter", "SalesChannel", "OutboxEvent", "AuditLog", "AppSystem", "InvMovement", "InvLocationStock", "AccountJournalEntry"];
let tenantTables: string[] = [];
try {
  tenantTables = ((await P.$queryRawUnsafe(`SELECT DISTINCT table_name AS t FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'tenantId'`)) as Any[]).map((r: Any) => String(r.t));
} catch {
  /* ข้อมูล */
}
const notCovered = mustTables.filter((t) => !tenantTables.includes(t));
chk(
  "Z1",
  tempLeft.length === 0 && tenantLeft === 0 && !wipeErr && notCovered.length === 0,
  "ร้านชั่วคราว 2 ร้าน 0 แถว · Tenant ถูกลบ",
  [tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipes.map((w) => w.tables).join("/")} ตาราง)`, tenantLeft ? "แถว Tenant ยังอยู่" : "", wipeErr, notCovered.length ? `ตารางไม่มี tenantId: ${notCovered.join(",")}` : ""].filter(Boolean).join(" · "),
);
const fpAfter = await othersFingerprint();
/** แถวของรอบนี้ที่หลุดออกนอกร้านชั่วคราว (ตัวตัดสิน Z2) */
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
  await n("posSale", () => P.posSale.count({ where: { idempotencyKey: { startsWith: KEY_PREFIX } } }));
  await n("posDevice", () => P.posDevice.count({ where: { deviceCode: { contains: `qc211${RAND}` } } }));
  await n("posProduct", () => P.posProduct.count({ where: { name: { contains: RAND } } }));
  await n("salesChannel", () => P.salesChannel.count({ where: { name: { contains: RAND } } }));
  await n("auditLog", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "createdAt" >= $1 AND (coalesce("after"::text,'') || coalesce("before"::text,'')) LIKE $2`, since, like)) as Any[])[0]?.n);
  await n("outboxEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "createdAt" >= $1 AND "payload"::text LIKE $2`, since, like)) as Any[])[0]?.n);
  await n("membership", () => P.membership.count({ where: { tenantId: { in: [T, T2].filter(Boolean) } } }));
  await n("tenant", () => P.tenant.count({ where: { slug: { startsWith: T_SLUG } } }));
  return out;
}
const leaks = await leaksOutside();
chk(
  "Z2",
  leaks.length === 0 && fpBefore === fpAfter,
  "ไม่มีแถวของรอบนี้นอกร้านชั่วคราว · ลายนิ้วมือร้านอื่นก่อน = หลัง",
  [leaks.length ? `หลุด ${leaks.join(", ")}` : "ไม่มีแถวของรอบนี้หลุด", `ร้านอื่น ${fpBefore} → ${fpAfter}`].join(" · "),
);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, guardHits: guardHits.length, residue: tempLeft.length + tenantLeft, leaks })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P2.11 (S): จอ 06/08/16/17A (P2.11U — ภาพของผู้คุมงาน) · โอนสองขั้น/ข้ามคลัง + สต็อกต่อที่เก็บในคลังร่วม (P2.12) ·
//   ใบกำกับเต็มรูป (AccountDocument) ใช้สาขาของสมุด (เจ้าของบัญชี) · ค่าบริการ/ท้ายใบต่อสาขา (Q5) · สูตรต่อสาขา (Q10) ·
//   qc-hf-pos-page-authz P-7 (ORACLE-EDIT ใน U) · ชุดเงิน/regression ตาม §7 รันโดยผู้สร้างก่อน/หลัง
