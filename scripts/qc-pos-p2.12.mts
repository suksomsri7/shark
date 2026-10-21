// QC — POS RUN ใบ P2.12 (S): รายงานช่องทาง (ตัดมัดจำ) · สาขา · รายชั่วโมง · จุดผิดปกติ A1–A10 + ค่าตั้ง · แบบพิมพ์ A4 (print model) ·
//   บิลทุกสาขา (billsPageData unitId "*") · ช่องทางในลิ้นชักบิลแบบหักคืนเงิน · จำนวนบิลต่อช่องทางในสรุป
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ (ฐาน origin/session/pos e6546359 · โค้ด HF-FU 84ffb48b)
// requires: pos-seed (userId ของร้าน QC กาแฟ/อาหาร = ผู้กระทำจริง · ชื่อแสดงผลของรายงาน · สมาชิกภาพในร้านชั่วคราว)
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.12.md §0–§6 · §10 มติผู้คุมงาน 1–10 (ผูกมัด)
//        ต่อยอด: qc-pos-p1.17 (ตัวอ้างอิงอิสระ · ตัวจับคิวรี ST5/ST6 · CSV · session ปลอม OV2) · qc-pos-p2.11 (RP · PAR · หมุดเลน) ·
//                qc-pos-p2.9b (มัดจำ) · qc-pos-p1.16 (บิลวันนี้) · qc-pos-p1.18 (ตัวเขียนค่าตั้งทั่วไป) · qc-pos-p2.8 (ออเดอร์)
//        โน้ต: ledger/wo-notes/pos-P2.12-oracle.md (ตารางชื่อ = สัญญาของผู้สร้าง S · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ขอบเขต: ST สถิต · CH ช่องทาง · BR สาขา · HR รายชั่วโมง · AN ผิดปกติ · PD แบบพิมพ์ · BL บิลทุกสาขา · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ: SKIP เมื่อของ P2.12 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ST1–ST3 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p212-<rand>` + `-t2` (ลบทั้งร้านใน finally · แถวค้าง = 0)
//    ข้อมูลทดสอบผ่านฟังก์ชันของโมดูล · SQL ดิบเฉพาะ: ธงเก็บถาวรของสาขา · เลื่อนเวลา createdAt/paidAt ของบิลของรอบนี้ (วัน D0/DH) · ลบร้าน
//    audit ของ A5 (pos.discount.override / pos.approval.pin_override) เขียนผ่าน writeAudit ของ core ด้วยรูปเดียวกับ register/bills/refund (โน้ต D4)
//    ไม่มีเครือข่าย: globalThis.fetch = ตัวกั้น (503 + นับ) ตลอดช่วง DB
//    โมดูล/ฟังก์ชันที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + catch) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.12";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 เล่นซ้ำ · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน · X5 ไม่เขียนอะไร/ผลข้างเคียงครบ · PAR เท่าพฤติกรรม/รายงานเดิม · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.12-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[§10 มติ 1 9] ไม่มี migration: prisma/ เท่า หมุดของเลน c5fc223b (หรือ e6546359) · ไม่มีไฟล์ใหม่ใต้ prisma/ · ไฟล์เลน A ไม่ถูกแตะ: RegisterScreen.tsx · InterimPayDialog.tsx · DeviceSettings.tsx · display* · pos/receipt*.ts · register*.ts(x) · tender* · refund* · service.ts · account-bridge.ts · outbox-consumers.ts · modules/account|giftcard|member/**"),  // ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin): คำอธิบายฐาน = หมุดของเลน (K3)
  D("ST2", "S", "[§2 §4 มติ 2 9] reports.ts อ่านอย่างเดียว · ทุกคิวรี posSale กรอง unitId + createdAt (ตัวจับ p1.17 ST5) · คิวรี AuditLog/PosOrder/PosHeldCart มี tenantId + เวลา · PosShift/Recount มี tenantId + (เวลา | id/shiftId IN | status OPEN) · billsPageData/billDetail อ่านอย่างเดียว · report-print-shared.ts มีอยู่ ไม่ import prisma/db ไม่มี new Date( / Date.now / performance.now / Math.random / process.env · settings-shared.ts ยังบริสุทธิ์"),
  D("ST3", "S", "[ตารางชื่อ] REPORT_KINDS + CSV_HEADERS มี branches hourly anomalies · export reportBranches reportHourly reportAnomalies + ANOMALY_PERMISSION = \"pos.report.anomaly\" · OVERVIEW_SECTIONS มี hourly · settings-shared export posAnomalyThresholds POS_ANOMALY_RULES · GENERAL_KEYS มี anomaly · permissions.ts บล็อก pos มี pos.report.anomaly ป้ายไทย · report-print-shared export buildReportPrint renderReportPrintHtml · report-actions export posReportPrintAction · bills-shared channelCounts/unitName/commissionNetSatang · ข้อความ th (ไทย) / en (ไม่มีอักษรไทย) ครบชุด"),
  // ── CH ช่องทาง ──
  D("CH1", "X4", "[⚠️2 มติ 1] reportChannels วัน D0 (ทุกสาขา + สาขา A): ใบรับมัดจำ ฿500 ไม่นับ · บิลที่ใช้มัดจำนับครั้งเดียว (STORE 4 บิล ฿700) · LINEMAN 2 บิล คืน ฿200 ค่าคอมฯ สุทธิ ฿30 VAT ฿2.10 · sharePct 91.2/8.8 · Σ net ช่องทาง = net รายวัน − ค่าคอมฯ − VAT ค่าคอมฯ (฿767.90)"),
  D("CH2", "X4", "[P2.1U F5] billDetail.channel หักคืนเงิน: LINEMAN คืนบางส่วน → refundSatang 10000 commissionNetSatang 3000 commissionVatNetSatang 210 netSatang 6790 (6000/420 เดิมคงอยู่) · คืนครบ → 10000/0/0/0 · STORE ไม่คืน → 0/0/0/ยอดบิล · ไม่มี pos.report.view → ไม่มีคีย์ตัวเลขทั้ง 6"),
  D("CH3", "PAR", "[P2.1U :55] billsPageData summary.channelCounts {รหัส: บิล PAID+REFUNDED} = อ่านแบบเดิม 2 ครั้งต่อช่องทาง (salesChannelId ทุกสถานะ − VOIDED) · Σ = summary.billCount · A = {STORE 3, LINEMAN 1} · B = {STORE 1, LINEMAN 1}"),
  // ── BR สาขา ──
  D("BR1", "PAR", "[§1 มติ 5] reportBranches แถวต่อสาขา 14 คีย์ = reportDailySales/reportPayments(CASH,PLATFORM)/reportChannels/reportShifts ของสาขานั้น (D0: A B C · วันนี้: A B มีกะขาด) · D0 ตรงตัวเลขอิสระ (A 3 บิล ฿400 เงินสด ฿600 · B 2 บิล ฿300 · C 1 บิล ฿100)"),
  D("BR2", "X4", "[§1 มติ 5 R13] totals = รายงานทุกสาขา (รวม C ที่เก็บถาวร) = Σ แถว · เรียง net มาก→น้อย · CSV kind branches: หัว = CSV_HEADERS.branches · แถวสาขา + แถว \"รวม\""),
  D("BR3", "X3", "[R12 R13] ผู้จัดการ A เห็นแถว A เท่านั้น (totals = A) · ผู้จัดการ A+B = A,B · พนักงานมี pos.report.view = A · ครึ่งปฏิเสธ: 93 วัน VALIDATION · ไม่มีสิทธิ์ PERMISSION_DENIED · ผู้จัดการ A ระบุสาขา B NOT_FOUND · ร้าน T2 NOT_FOUND"),
  // ── HR รายชั่วโมง ──
  D("HR1", "X4", "[§1 มติ 5] reportHourly สาขา A วัน DH: 24 แถว {hour label billCount netSalesSatang forecastSatang} · cutoff 0 = ชั่วโมง 0–23: 09 = 2 บิล ฿250 · 13 = ฿200 · 14 = −฿100 (ใบคืน) · มัดจำ/บิลยกเลิกไม่นับ · cutoff 240 = ชั่วโมง 4–27: บิล 02:30 ของวันถัดไป = hour 26 label \"02\" · Σ = reportDailySales (ทั้งสอง cutoff) · ทุกสาขา 09 รวมบิล B"),
  D("HR2", "-", "[§1 มติ 5] forecastSatang = ครึ่งขึ้นของ Σ(ชั่วโมงเดียวกันของ 4 สัปดาห์ก่อน วันเดียวกัน) / 4 (สัปดาห์ไม่มีขาย = 0): 09 = 5001 · 13 = 5000 · cutoff 240 ชั่วโมง 26 = 2000 · cutoff 0 ชั่วโมง 2 = 0 · totals.forecastSatang = Σ · 31 วัน ok · 32 วัน VALIDATION · ภาพรวมส่วน hourly = reportHourly · 32 วัน: hourly VALIDATION กราฟ ok · CSV kind hourly 24 แถว + รวม"),
  // ── AN ผิดปกติ ──
  D("AN1", "-", "[§3 A1] ยกเลิกบิลบ่อย (≥ 3 ใบ หรือ ≥ ฿1,000 ต่อผู้ยกเลิก/สาขา/วัน): M 3 ใบ → แถว (3 · ฿30) · K 1 ใบ ฿1,000 ที่ B → แถว · C ยกเลิกเอง 2 + ขอผ่าน PIN 1 → แถว 3 ใบ (ผู้ขอนับด้วย) · O 2 ใบ ฿999.99 (อนุมัติ PIN 1 + ยกเลิกเอง 1) → ไม่มี · ผู้ขาย (K ที่ A) ไม่ถูกนับ"),
  D("AN2", "-", "[§3 A2] คืนเงินบ่อย (≥ 3 ใบ หรือ ≥ ฿1,000 ต่อผู้คืน/สาขา/วัน · ผู้คืน = soldByUserId ของใบคืน): M 3 ใบ → แถว · O ฿1,000 ที่ B → แถว · K 2 ใบ ฿999.99 → ไม่มี · ผู้ขายเดิม (C) ไม่ถูกนับ"),
  D("AN3", "-", "[§3 A3 มติ 3] ส่วนลดสูงต่อพนักงาน (Σ ส่วนลด × 10000 > ยอดสุทธิ × 1500 · ต่อสาขา+ผู้ขาย ทั้งช่วง · ตัวเลขแบบรายงานพนักงาน): K ที่ B 15.01% → แถว value 1501 · O ที่ B 15.00% พอดี → ไม่มี · M ที่ A → แถว · ชุดแถวตรงตัวอ้างอิงอิสระจากแถว PosSale"),
  D("AN4", "-", "[§3 A4] ส่วนลดบิลเดียว ≥ 50% ของ subtotal: บิล ฿200 ลด ฿100 → แถว refType PosSale refId บิล value 5000 · ลด ฿99.99 → ไม่มี (เทียบจำนวนเต็ม ไม่ปัด bp)"),
  D("AN5", "-", "[§3 A5] ใช้สิทธิ์เกินเพดานต่อผู้อนุมัติ/สาขา/วัน ≥ 3 (pos.discount.override ∪ pos.approval.pin_override · ส่วนลดผ่าน PIN สองแถวของบิลเดียว = 1 ครั้ง · สาขาจาก PosSale ของ targetId): M 3 ครั้ง (4 แถว) → แถว · K 2 ครั้ง (3 แถว รวม PIN คืนเงินบนใบคืน) → ไม่มี"),
  D("AN6", "-", "[§3 A6] รายการ priceSource CUSTOM ต่อผู้ขาย/สาขา/วัน ≥ 5 (บิลขายไม่ยกเลิก ไม่ใช่มัดจำ): O 3+2 บรรทัด → แถว 5 · K 4 → ไม่มี · M 5 บรรทัดในบิลที่ยกเลิก → ไม่มี"),
  D("AN7", "-", "[§3 A7] พิมพ์สำเนาซ้ำต่อบิล ≥ 2 (pos.receipt.reprint ในช่วง): บิล C6a 2 ครั้ง (O + M) → แถว refType PosSale userId null · บิลที่ B 1 ครั้ง → ไม่มี"),
  D("AN8", "-", "[§3 A8] เงินขาด/เกินต่อกะ ≥ ฿100 (|overShort| หรือ |ผลต่างการนับย้อนหลัง|): กะ M ขาด ฿100 → แถว · ขาด ฿99.99 / ฿50 → ไม่มี · กะที่ระบบปิด + นับย้อนหลังเกิน ฿100 → แถว (userId ผู้เปิด) · กะที่ระบบปิดไม่มีการนับ → ไม่มี"),
  D("AN9", "-", "[§3 A9] ผู้เปิดกะคนเดิมเงินขาด ≥ 2 กะในช่วง (ต่อสาขา): M 2 กะ (฿100 + ฿99.99) → แถว count 2 value 19999 · K 1 กะ → ไม่มี"),
  D("AN10", "-", "[§3 A10] ออเดอร์ REJECTED|CANCELLED ต่อสาขา/วัน (receivedAt) ≥ 3: A = ปฏิเสธ 2 + ยกเลิก 1 → แถว count 3 · B = ปฏิเสธ 1 + ยกเลิก 1 → ไม่มี"),
  D("AN11", "X5", "[§3 มติ 3] settings.pos.reports.anomaly: posAnomalyThresholds ค่าปริยาย + ตัดช่วง (นอกช่วง = ขอบ · ไม่ใช่จำนวนเต็ม = ค่าปริยาย · คีย์แปลกไม่สน) · updatePosGeneralSettings {anomaly} รวมทับบางส่วน + audit pos.settings.updated · ค่าเดิม = ไม่ลง audit · ผิดช่วง/คีย์แปลก → VALIDATION field ไม่เขียนอะไร · ผู้จัดการ A → PERMISSION_DENIED · dayCutoffMinutes กับ anomaly ไม่ทับกัน · A3 1400 → O ที่ B ขึ้นแถว · 1600 → K หาย · enabled false → rows []"),
  D("AN12", "X3", "[§3 มติ 4 PDPA] พนักงานมี pos.report.view ไม่มี pos.report.anomaly → PERMISSION_DENIED ทั้งตัวอ่าน · CSV · print action · มี anomaly ไม่มี view → PERMISSION_DENIED · พนักงาน A มีทั้งสอง → แถว A เท่านั้น · ผู้จัดการ A → แถว A เท่านั้น · ร้าน T2 NOT_FOUND · แถวมีแค่คีย์ในสัญญา (ไม่มี email/phone) · userName = ชื่อแสดงผล · เรียง กฎ→สาขา→วัน→ผู้ใช้→ref · totals.rowCount/byRule"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.12 fix 1) ▸ AN13 (hunter H1) · AN14 (hunter H2) ◂
  D("AN13", "X4", "[fix1 H1] A3/A4 วัดส่วนลดที่พนักงานคุมได้ (Σ ส่วนลดบรรทัด + ท้ายบิล − คูปอง − สมาชิก) · ฐาน A4 = ยอดก่อนส่วนลดบรรทัด: วัน DA สาขา B บิล L1 (2 บรรทัด · บรรทัดแรกลด 100%) → แถว A4 value 5000 · บิล Q1 (คูปอง ฿60 อย่างเดียว) → ไม่มีแถว A4 · A3 ของ O ที่ B นับส่วนลดบรรทัด (value 7143 · 2 บิล) · [P2.14 RPT-4] บิล M1 ส่วนลดสมาชิกล้วน (วัน DM) ไม่ขึ้น A4 และไม่ทำให้ O/B ขึ้น A3"), // ORACLE-ADD ผู้คุม 16 ต.ค. (P2.14 RPT-4)
  D("AN14", "X4", "[fix1 H2] ตัดแถวต่อกฎ: ช่วง DA–วันนี้ แถว A4 > limit (= จำนวนกฎที่มีแถว) → ทุกกฎยังอยู่ (A8 ไม่หาย) · แต่ละกฎ ≤ ⌈limit/กฎ⌉ · ≤ limit แถว · ลำดับเดิม · totals = ไม่ตัด · แถว CSV ท้าย = \"แสดง N จาก M แถว\" · แบบพิมพ์ notice เดียวกัน (ไม่อยู่ในแถว) · ไม่ตัด = ไม่มีบรรทัดแจ้ง"),
  // ── PD แบบพิมพ์ ──
  // ORACLE-EDIT ผู้คุม 16 ต.ค. (P3.5 R11): REPORT_KINDS ต่อท้าย "commission" (12 ชนิด) — เดิม "(11)"
  D("PD1", "PAR", "[§4 มติ 2] buildReportPrint ทุกชนิดใน REPORT_KINDS (12 · + commission P3.5): kind/from/to/locale/generatedAt/shopName/unitLabel ตามอินพุต · headers = CSV_HEADERS[kind] · rows = แถว CSV ของ reportCsv ช่วงเดียวกันทีละช่อง · title th มีอักษรไทย · en: title ไม่มีอักษรไทย ≠ th · จำนวนหัว/แถวเท่า th"),
  D("PD2", "P", "[§4 มติ 2 ⚠️7] renderReportPrintHtml: สร้างสองครั้ง sha256 เท่ากัน · เปลี่ยน report.generatedAt (envelope) → sha เดิม · เปลี่ยน opts.generatedAt → sha เปลี่ยน · ชื่อร้าน <b>&\"' ถูก escape (ไม่มี <b> ดิบ) · มี @page + A4 · ไม่มี <script · มีหัวตาราง + \"รวม\""),
  D("PD3", "X3", "[§4 มติ 2 4 · OV2] posReportPrintAction ผ่าน session ปลอม: พนักงานไม่มีสิทธิ์รายงาน → PERMISSION_DENIED · พนักงานมี view: daily ok (html มีหัวตาราง ไม่มี <script) · anomalies PERMISSION_DENIED · เจ้าของ anomalies ok · kind แปลก → VALIDATION"),
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.12 fix 1) ▸ PD4 (hunter H3 H4) ◂
  D("PD4", "X3", "[fix1 H3 H4] posReportPrintAction ผู้จัดการ A ไม่ส่ง unitId (anomalies + daily) → หัวแบบพิมพ์ สาขา = ชื่อสาขา A (ไม่ใช่ \"ทุกสาขา\") · เจ้าของ = ทุกสาขา (ตัวควบคุม) · ช่องค่า A8 ใน CSV/แบบพิมพ์มีเครื่องหมาย: sh1 \"ขาด −100.00\" · sh4 (นับย้อนหลังเกิน) \"เกิน +100.00\""),
  // ── BL บิลทุกสาขา ──
  D("BL1", "X2", "[§1 มติ 6] billsPageData unitId \"*\" (เจ้าของ วัน D0): แถวทุกสาขาที่อ่านได้ (A B C เก็บถาวร) เรียงเวลาใหม่→เก่า · ทุกแถวมี unitId + unitName ถูกต้อง · counts/summary/total = Σ หน้าเดี่ยวของแต่ละสาขา"),
  D("BL2", "PAR", "[§1 มติ 6] ผู้จัดการ A / พนักงาน A ส่ง \"*\" → แถว A เท่านั้น · ไม่มีสิทธิ์อ่าน → NO_PERMISSION · หน้าเดี่ยว A: คีย์แถว = ชุดเดิม (ไม่มี unitId/unitName) · counts/summary เดิม + ลำดับตรงตัวอ้างอิง · ผู้จัดการ A ขอสาขา B = หน้าว่าง"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราวทั้งสองเหลือ 0 แถวทุกตารางที่มี tenantId (บิล · กะ · ออเดอร์ · มัดจำ · ช่องทาง · audit · outbox · ค่าตั้ง …) + แถว Tenant ถูกลบ"),
  D("Z2", "-", "ไม่มีแถวของรอบนี้นอกร้านชั่วคราว (บิล/เครื่อง/สินค้า/ออเดอร์/audit/outbox/membership) · ลายนิ้วมือ PosSale + PosShift + PosOrder + AppSystem(POS).settings ของร้านอื่นก่อน = หลัง"),
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
  const full = id.startsWith("P2.12-") ? id : `P2.12-${id}`;
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
const codeIs = (r: Any, code: string) => r?.ok === false && String(r.code) === code && !r.missing;
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1]!;
  return "THROW";
}
const MISSING = "ยังไม่มีโมดูล/ฟังก์ชัน";
/** เรียกฟังก์ชันของโมดูล — throw = คำปฏิเสธที่พก code + field ของ error */
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} — ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    const o = e as { field?: unknown; message?: unknown } | null;
    return { ok: false, code: errCode(e), message: String(o?.message ?? e).slice(0, 200), threw: true, ...(typeof o?.field === "string" ? { field: o.field } : {}) };
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
const P8 = (p: string[]) => p.slice(0, 8).join(" · ") + (p.length > 8 ? ` …(+${p.length - 8})` : "");
const J = (v: unknown) => JSON.stringify(v);
/** JSON เรียงคีย์ (เทียบออบเจกต์ไม่สนลำดับคีย์) */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (isRecord(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
/** ครึ่งขึ้นของ a×b/c (จำนวนเต็มไม่ติดลบ) — ตัวอ้างอิงของข้อสอบเอง */
const halfUp = (a: number, b: number, c: number) => (c > 0 ? Math.floor((2 * a * b + c) / (2 * c)) : 0);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

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
/** วงเล็บกลมคู่แรกตั้งแต่ตำแหน่ง at (อาร์กิวเมนต์ของคำสั่ง) — แบบ qc-pos-p1.17 */
function balancedFrom(src: string, at: number): string {
  const open = src.indexOf("(", at);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return src.slice(open, i + 1);
  }
  return "";
}
/** ข้อความของฟังก์ชัน `name` (ตั้งแต่คำว่า function ถึงวงเล็บปีกกาปิดของตัวฟังก์ชัน) — ไม่พบ = "" (แบบ qc-pos-p2.11) */
function fnText(src: string, name: string): string {
  const m = new RegExp(`(export\\s+)?(async\\s+)?function\\s+${name}\\s*[(<]`).exec(src);
  if (!m) return "";
  let i = src.indexOf("(", m.index);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) break;
  }
  let angle = 0;
  let j = i + 1;
  for (; j < src.length; j++) {
    const ch = src[j]!;
    if (ch === "<") angle++;
    else if (ch === ">" && src[j - 1] !== "=") angle = Math.max(0, angle - 1);
    else if (ch === "{" && angle === 0) {
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
/** import แบบค่า (ไม่ใช่ type-only) + re-export + dynamic import ของไฟล์ */
const valueImportsOf = (s: string): string[] => [
  ...[...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!),
  ...[...s.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => m[1]!),
  ...[...s.matchAll(/^\s*export\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!),
  ...[...s.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!),
];
/** ไฟล์ไม่ import prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (ค่า) — ไฟล์ "shared" ที่จอ/--no-db โหลดได้ (แบบ qc-pos-p2.11) */
const purePath = (f: string): boolean => {
  const s = stripComments(rd(f));
  if (!s) return false;
  return !valueImportsOf(s).some((p) => /@prisma\/client|\/db$|^\.\/db$|@\/lib\/core\/db|@\/lib\/core\/(rbac|context|audit)|@\/lib\/modules\/(?!pos\/[a-z-]+-shared)|^\.\/(?![a-z-]+-shared$)[a-z-]+$/.test(p));
};

// ── git (ฐาน = หมุดของเลน c5fc223b · สำรอง e6546359) ──
const BASE_REV = "e6546359";
function git(args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }).toString("utf8");
  } catch {
    return null;
  }
}
const LANE_PIN = "02b67f91"; // ORACLE-EDIT ผู้คุม 17.10 (CD-RP5 · product tip after P3.7 merge · re-pin a2c9a4c7 → 02b67f91) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP4 · product tip after P3.8 merge · re-pin 8bded5a7 → a2c9a4c7) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP1b · settings-general re-resolution · re-pin 0617d17b → 8bded5a7) · ORACLE-EDIT ผู้คุม 17.10 (CD-RP1 lane-pin · re-pin 3b8a228d → 0617d17b) · ORACLE-EDIT ผู้คุม 16.10 (HF-FU2 lane-pin · re-pin c5fc223b → 3b8a228d) · ORACLE-EDIT ผู้คุม 16 ต.ค. (P2.14 lane-pin · มติ 3 · TL-1 · CD-B1 re-pin → merge 05975437 · CD-B1c gates111 → U3 merge c5fc223b: ปลาย P2-close หลังรอบ U2/U2b/U3 ที่แตะ RegisterScreen (CD-U2b) · use-display-publish (H1b) · visual-pos (H5) ตามมติผู้คุม): หมุดคงที่ 05975437 (ฐานของ P2.14 = first parent ของ merge) แทนฐานร่วมกับสาขาต้นทาง
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
  reports: `${POS_DIR}/reports.ts`,
  overview: `${POS_DIR}/report-overview.ts`,
  actions: `${POS_DIR}/report-actions.ts`,
  print: `${POS_DIR}/report-print-shared.ts`,
  setShared: `${POS_DIR}/settings-shared.ts`,
  setGeneral: `${POS_DIR}/settings-general.ts`,
  bills: `${POS_DIR}/bills.ts`,
  billsShared: `${POS_DIR}/bills-shared.ts`,
  perms: "src/lib/core/permissions.ts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
};
const NEW_KINDS = ["branches", "hourly", "anomalies"] as const;
const ALL_KINDS = ["daily", "products", "staff", "payments", "margin", "shifts", "tax", "channels", ...NEW_KINDS, "commission"] as const; // ORACLE-EDIT ผู้คุม 16 ต.ค. (P3.5 R11): + "commission" — เดิม 11 ชนิด
const KIND_FN: Record<string, string> = {
  daily: "reportDailySales",
  products: "reportProducts",
  staff: "reportStaff",
  payments: "reportPayments",
  margin: "reportMargin",
  shifts: "reportShifts",
  tax: "reportTax",
  channels: "reportChannels",
  branches: "reportBranches",
  hourly: "reportHourly",
  anomalies: "reportAnomalies",
  commission: "reportStaffCommission", // ORACLE-EDIT ผู้คุม 16 ต.ค. (P3.5 R11)
};
const NEW_READERS = ["reportBranches", "reportHourly", "reportAnomalies"] as const;
const ANOMALY_KEY = "pos.report.anomaly";
const RULES = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11"] as const; // ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.9 R11): + A11 ข้ามตารางงานบ่อย (เดิม A1–A10)
type RuleId = (typeof RULES)[number];
/** §3 มติ 3 — ค่าปริยายของเกณฑ์ (count = ครั้ง/ใบ/บรรทัด · satang = สตางค์ · bp = 1/100 %) */
const AN_DEFAULTS: Record<RuleId, Record<string, number>> = {
  A1: { count: 3, satang: 100_000 },
  A2: { count: 3, satang: 100_000 },
  A3: { bp: 1500 },
  A4: { bp: 5000 },
  A5: { count: 3 },
  A6: { count: 5 },
  A7: { count: 2 },
  A8: { satang: 10_000 },
  A9: { count: 2 },
  A10: { count: 3 },
  A11: { count: 3 }, // ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.9 R11): ค่าปริยาย A11 (W14)
};
/** ช่วงของตัวอ่าน/ตัวเขียน (ตัวอ่านตัดเข้าขอบ · ตัวเขียนปฏิเสธ) */
const AN_LIMITS: Record<string, [number, number]> = { count: [1, 1000], satang: [1, 100_000_000], bp: [1, 10_000] };
const AN_ROW_KEYS = ["rule", "unitId", "businessDate", "userId", "userName", "refType", "refId", "value", "threshold", "count"] as const;
const BR_NUM_KEYS = ["billCount", "netSalesSatang", "avgBillSatang", "refundCount", "refundTotalSatang", "voidCount", "voidTotalSatang", "cashSatang", "platformSatang", "commissionSatang", "commissionVatSatang", "overShortSatang"] as const;
const HR_ROW_KEYS = ["hour", "label", "billCount", "netSalesSatang", "forecastSatang"] as const;
const CH_NEW_KEYS = ["refundSatang", "commissionNetSatang", "commissionVatNetSatang", "netSatang"] as const;
/** คีย์ของแถว BillRow ที่ e6546359 (หน้าเดี่ยวต้องไม่เปลี่ยน · voidApprovedBy มีเมื่อมี audit) */
const BILLROW_BASE_KEYS = ["id", "receiptNo", "time", "sourceModule", "customer", "payMethods", "staffName", "grandTotalSatang", "refundedSatang", "status", "offShiftCash", "refunds", "salesChannel", "channelRef"] as const;
const SUMMARY_BASE_KEYS = ["netSatang", "billCount", "storeCount", "onlineCount", "avgSatang", "yesterdayAvgSatang"] as const;
/** ข้อความที่ต้องมี (ใต้ namespace pos · th ไทย · en ไม่มีอักษรไทย) — namespace รายงานเดิม = "report" (เอกพจน์ · โน้ต drift 1) */
const MSG_KEYS = [
  ...NEW_KINDS.map((k) => `report.kinds.${k}`),
  "report.hourly.title",
  "report.hourly.forecast",
  "report.branches.title",
  "report.branches.total",
  "report.anomaly.title",
  "report.anomaly.empty",
  ...RULES.map((r) => `report.anomaly.rules.${r}`),
  "report.print.button",
  "report.print.generatedAt",
  "settings.general.anomaly.title",
  "settings.general.anomaly.enabled",
  "sales.branch.chipLabel",
];
/** ไฟล์เลน A (P2.10 ถืออยู่ + ชุด §3 ของ P2.11 · มติ 9) */
const LANE_A_FIXED = [
  `${POS_DIR}/service.ts`,
  `${POS_DIR}/account-bridge.ts`,
  "src/lib/outbox-consumers.ts",
  "src/components/pos/register/RegisterScreen.tsx",
  "src/components/pos/register/InterimPayDialog.tsx",
  "src/app/app/sys/[id]/pos/settings/DeviceSettings.tsx",
];
const LANE_A_RE = [
  /^src\/lib\/modules\/pos\/(register|tender|refund|receipt|display)[^/]*\.(ts|tsx)$/,
  /^src\/lib\/modules\/(account|giftcard|member)\//,
  /^src\/(components|app)\/.*\/display[^/]*\.(ts|tsx)$/,
  /^src\/(components|app)\/.*\/display\//,
];
const isLaneA = (f: string) => LANE_A_FIXED.includes(f) || LANE_A_RE.some((re) => re.test(f));

const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2", "ST3"].map((x) => `P2.12-${x}`);
const skipReasons: string[] = [];
for (const n of NEW_READERS) if (!exportsFn(srcOf(F.reports), n)) skipReasons.push(`ยังไม่มี export ${n} (reports.ts)`);
if (!exportsFn(srcOf(F.print), "buildReportPrint")) skipReasons.push("ยังไม่มี report-print-shared.ts buildReportPrint");
if (!exportsFn(srcOf(F.setShared), "posAnomalyThresholds")) skipReasons.push("ยังไม่มี export posAnomalyThresholds (settings-shared.ts)");
if (!exportsFn(srcOf(F.actions), "posReportPrintAction")) skipReasons.push("ยังไม่มี export posReportPrintAction (report-actions.ts)");

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
const WRITE_RE = /\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw|\baudit\s*\(|writeAudit\s*\(/;
/** คิวรีของ delegate ที่ระบุใน src (ชื่อ · เมธอด · อาร์กิวเมนต์) */
function queriesOf(src: string, delegates: string, methods = "findMany|findFirst|aggregate|groupBy|count"): { d: string; m: string; args: string }[] {
  const out: { d: string; m: string; args: string }[] = [];
  for (const m of src.matchAll(new RegExp(`\\b(${delegates})\\s*\\.\\s*(${methods})\\s*\\(`, "g"))) out.push({ d: m[1]!, m: m[2]!, args: balancedFrom(src, m.index ?? 0) });
  return out;
}
/** SQL ดิบใน src ที่แตะตาราง (ข้อความของ template/อาร์กิวเมนต์) */
function rawSqlOf(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\$queryRaw(Unsafe)?\s*(<[^>]*>)?\s*(`[^`]*`|\()/g)) out.push(m[3] === "(" ? balancedFrom(src, m.index ?? 0) : m[3]!);
  return out;
}

async function runStatic(): Promise<void> {
  console.log(`\n── ST ข้อสถิต (ไม่แตะ DB · ฐาน ${BASES.map((b) => b.slice(0, 8)).join(" / ") || "ไม่มี"}) ──`);
  // ST1 ไม่มี migration + ไฟล์เลน A ไม่ถูกแตะ
  {
    const p: string[] = [];
    if (!BASES.length) p.push("หา merge-base / e6546359 ไม่ได้ (git fetch origin session/pos ก่อน)");
    const changed = BASES.map((b) => (git(["diff", "--name-only", b, "--", "prisma"]) ?? "?").split("\n").filter(Boolean));
    const untracked = (git(["ls-files", "--others", "--exclude-standard", "--", "prisma"]) ?? "").split("\n").filter(Boolean);
    const best = changed.length ? changed.reduce((a, b) => (a.length <= b.length ? a : b)) : ["?"];
    if (best.length) p.push(`prisma/ ต่างจากฐาน: ${best.slice(0, 5).join(", ")}`);
    if (untracked.length) p.push(`ไฟล์ใหม่ใต้ prisma/: ${untracked.slice(0, 5).join(", ")}`);
    const dirs = [POS_DIR, "src/lib/modules/account", "src/lib/modules/giftcard", "src/lib/modules/member", "src/components/pos", "src/app"];
    const now = dirs.flatMap((d) => walk(d)).filter(isLaneA);
    const before = BASES.length ? dirs.flatMap((d) => lsAt(BASES[0]!, d)).filter(isLaneA) : [];
    const files = [...new Set([...LANE_A_FIXED, ...now, ...before])];
    const touched = files.filter((f) => !untouched(f));
    if (touched.length) p.push(`ไฟล์เลน A ถูกแตะ: ${touched.map((f) => f.split("/").slice(-2).join("/")).join(", ")}`);
    chk("ST1", p.length === 0, "prisma/ เท่าฐาน · ไฟล์เลน A เท่าฐาน", P8(p) || `ไม่มี migration · ไฟล์เลน A ${files.length} ไฟล์ไม่ถูกแตะ`);
  }
  // ST2 อ่านอย่างเดียว · ตัวจับคิวรี · แบบพิมพ์บริสุทธิ์
  {
    const p: string[] = [];
    const rep = srcOf(F.reports);
    if (!rep) p.push(`ไม่มี ${F.reports}`);
    else {
      const w = /\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw/.exec(rep);
      if (w) p.push(`reports.ts มีการเขียน (${w[0].slice(0, 30)})`);
      for (const q of queriesOf(rep, "posSale")) if (!/\bcreatedAt\b/.test(q.args) || !/\bunitId\b/.test(q.args)) p.push(`posSale.${q.m} ไม่กรอง ${!/\bcreatedAt\b/.test(q.args) ? "createdAt" : "unitId"}`);
      for (const q of queriesOf(rep, "auditLog|posOrder|posHeldCart", "findMany|findFirst|findUnique|aggregate|groupBy|count")) {
        const time = q.d === "auditLog" ? /\bcreatedAt\b/ : q.d === "posOrder" ? /\b(receivedAt|createdAt|closedAt|updatedAt)\b/ : /\b(createdAt|updatedAt|discardedAt|expiresAt)\b/;
        if (!/\btenantId\b/.test(q.args) || !time.test(q.args)) p.push(`${q.d}.${q.m} ไม่กรอง tenantId + เวลา`);
      }
      for (const q of queriesOf(rep, "posShift|posShiftRecount", "findMany|findFirst|findUnique|aggregate|groupBy|count")) {
        if (!/\btenantId\b/.test(q.args) || !/\b(openedAt|closedAt|createdAt)\b|\b(id|shiftId)\s*:\s*\{\s*in\b|status\s*:\s*["']OPEN["']/.test(q.args)) p.push(`${q.d}.${q.m} ไม่กรอง tenantId + (เวลา | id IN | OPEN)`);
      }
      for (const sql of rawSqlOf(rep)) {
        if (/"PosSale"/.test(sql) && (!/"createdAt"/.test(sql) || !/"unitId"/.test(sql))) p.push("SQL ดิบบน PosSale ไม่กรอง createdAt/unitId");
        if (/"AuditLog"/.test(sql) && (!/"createdAt"/.test(sql) || !/"tenantId"/.test(sql))) p.push("SQL ดิบบน AuditLog ไม่กรอง tenantId/createdAt");
      }
    }
    const bills = srcOf(F.bills);
    for (const fn of ["billsPageData", "billDetail"]) {
      const t = fnText(bills, fn);
      if (!t) p.push(`bills.ts ไม่มี ${fn}`);
      else if (WRITE_RE.test(t)) p.push(`${fn} มีคำสั่งเขียน (ต้องอ่านอย่างเดียว)`);
    }
    const pr = srcOf(F.print);
    if (!pr) p.push(`ไม่มี ${F.print}`);
    else {
      const bad = valueImportsOf(pr).filter((x) => /@prisma\/client|(^|\/)db$|@\/lib\/core\/(db|rbac|context|audit)/.test(x));
      if (bad.length) p.push(`report-print-shared.ts import ${bad.join(",")} (ห้าม prisma/db)`);
      const clock = /\bnew\s+Date\s*\(|\bDate\.now\s*\(|\bperformance\.now\b|\bMath\.random\b|\bprocess\.env\b/.exec(pr);
      if (clock) p.push(`report-print-shared.ts มี ${clock[0].trim()} (นาฬิกา/สุ่ม/env ห้าม — generatedAt มาจากอินพุต)`);
    }
    if (!purePath(F.setShared)) p.push("settings-shared.ts import prisma/db/โมดูลเซิร์ฟเวอร์ (ต้องบริสุทธิ์)");
    chk("ST2", p.length === 0, "อ่านอย่างเดียว · คิวรีมีขอบเขต+เวลา · แบบพิมพ์ไม่มีนาฬิกา/prisma", P8(p) || "ครบ");
  }
  // ST3 ชื่อ + ข้อความ
  {
    const p: string[] = [];
    const rep = srcOf(F.reports);
    const kinds = constBody(rep, "export const REPORT_KINDS");
    const heads = constBody(rep, "export const CSV_HEADERS");
    for (const k of NEW_KINDS) {
      if (!new RegExp(`["']${k}["']`).test(kinds)) p.push(`REPORT_KINDS ไม่มี "${k}"`);
      if (!new RegExp(`\\b${k}\\s*:`).test(heads)) p.push(`CSV_HEADERS ไม่มี ${k}`);
    }
    for (const n of NEW_READERS) if (!exportsFn(rep, n)) p.push(`reports.ts ไม่ export ${n}`);
    if (!/export\s+const\s+ANOMALY_PERMISSION\b[^;]*["']pos\.report\.anomaly["']/.test(rep)) p.push('reports.ts ไม่มี export const ANOMALY_PERMISSION = "pos.report.anomaly"');
    if (!/["']hourly["']/.test(constBody(srcOf(F.overview), "export const OVERVIEW_SECTIONS"))) p.push('OVERVIEW_SECTIONS ไม่มี "hourly"');
    const ss = srcOf(F.setShared);
    for (const n of ["posAnomalyThresholds", "POS_ANOMALY_RULES"]) if (!exportsFn(ss, n)) p.push(`settings-shared.ts ไม่ export ${n}`);
    if (!/["']anomaly["']/.test(constBody(srcOf(F.setGeneral), "const GENERAL_KEYS"))) p.push('settings-general.ts GENERAL_KEYS ไม่มี "anomaly"');
    const permSrc = stripComments(rd(F.perms));
    const posAt = permSrc.search(/module:\s*["']pos["']/);
    const posBlock = posAt < 0 ? "" : permSrc.slice(posAt, permSrc.indexOf("}", permSrc.indexOf("actions", posAt)) + 1);
    const lbl = /["']pos\.report\.anomaly["']\s*:\s*["']([^"']+)["']/.exec(posBlock)?.[1] ?? "";
    if (!lbl) p.push("permissions.ts บล็อก pos ไม่มี pos.report.anomaly");
    else if (!THAI.test(lbl)) p.push("ป้าย pos.report.anomaly ไม่ใช่ไทย");
    const pr = srcOf(F.print);
    for (const n of ["buildReportPrint", "renderReportPrintHtml"]) if (!exportsFn(pr, n)) p.push(`report-print-shared.ts ไม่ export ${n}`);
    if (!/export\s+async\s+function\s+posReportPrintAction\b/.test(srcOf(F.actions))) p.push("report-actions.ts ไม่ export async function posReportPrintAction");
    const bs = srcOf(F.billsShared);
    const summaryT = /export\s+type\s+BillsSummary\s*=\s*\{[^;]*\}/.exec(bs)?.[0] ?? "";
    if (!/\bchannelCounts\b/.test(summaryT)) p.push("BillsSummary ไม่มี channelCounts");
    const rowT = /export\s+type\s+BillRow\s*=\s*\{[\s\S]*?\n\};/.exec(bs)?.[0] ?? "";
    if (!/\bunitName\b/.test(rowT) || !/\bunitId\b/.test(rowT)) p.push("BillRow ไม่มี unitId?/unitName?");
    const detailT = /export\s+type\s+BillDetail\s*=\s*\{[\s\S]*?\n\};/.exec(bs)?.[0] ?? "";
    for (const k of CH_NEW_KEYS) if (!new RegExp(`\\b${k}\\b`).test(detailT)) p.push(`BillDetail.channel ไม่มี ${k}`);
    const th = readJson(F.msgTh, p);
    const en = readJson(F.msgEn, p);
    for (const k of MSG_KEYS) {
      const a = dig(th, k);
      const b = dig(en, k);
      if (typeof a !== "string" || !a.trim()) p.push(`th: ไม่มี ${k}`);
      else if (!THAI.test(a)) p.push(`th: ${k} ไม่ใช่ไทย`);
      if (typeof b !== "string" || !b.trim()) p.push(`en: ไม่มี ${k}`);
      else if (THAI.test(b)) p.push(`en: ${k} มีอักษรไทย`);
    }
    chk("ST3", p.length === 0, "ชื่อตามตารางชื่อครบ · ข้อความ th/en", P8(p) || `ครบ (${MSG_KEYS.length} ข้อความ)`);
  }
}

// ═════════════════════════ 1b. --no-db ═════════════════════════
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
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.12 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ${seedOk ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: seedOk })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const catalogMod = await tryImport("@/lib/modules/pos/catalog");
const register = await tryImport("@/lib/modules/pos/register");
const chMod = await tryImport("@/lib/modules/pos/channel");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const svc = await tryImport("@/lib/modules/pos/service");
const depMod = await tryImport("@/lib/modules/pos/deposit");
const paySet = await tryImport("@/lib/modules/pos/payment-settings");
const receiptMod = await tryImport("@/lib/modules/pos/receipt");
const orderMod = await tryImport("@/lib/modules/pos/order");
const billsMod = await tryImport("@/lib/modules/pos/bills");
const repMod = await tryImport("@/lib/modules/pos/reports");
const ovMod = await tryImport("@/lib/modules/pos/report-overview");
const genMod = await tryImport("@/lib/modules/pos/settings-general");
const setShared = await tryImport("@/lib/modules/pos/settings-shared");
const printMod = existsSync(join(ROOT, F.print)) ? await tryImport("@/lib/modules/pos/report-print-shared") : null;
const auditMod = await tryImport("@/lib/core/audit");
const couponSvc = await tryImport("@/lib/modules/coupon/service"); // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.12 fix 1) ▸ AN13 ◂
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const consMod = await tryImport("@/lib/outbox-consumers");

// ── P1.17U R7 / OV2 ▸ เรียก server action จริงโดยแทน context.ts (requireTenant) ด้วย session ปลอม (แบบ qc-pos-p1.17) ──
type QcSession = { userId: string; tenantId: string; role: string; unitAccess: unknown; permissions: unknown };
let QC_SESSION: QcSession | null = null;
let actionsMod: Any = undefined;
async function loadActionsWithFakeSession(): Promise<Any> {
  if (actionsMod !== undefined) return actionsMod;
  const { createRequire } = await import("node:module");
  const req = createRequire(join(ROOT, "package.json"));
  const ctxFile = join(ROOT, "src/lib/core/context.ts");
  const saved = req.cache[ctxFile];
  const fake = {
    requireTenant: async () => {
      if (!QC_SESSION) throw new Error("[qc] ไม่มี session ปลอม");
      return {
        user: { id: QC_SESSION.userId, email: `${QC_SESSION.userId}@qc.local`, name: null },
        memberships: [],
        active: { tenantId: QC_SESSION.tenantId, tenant: { id: QC_SESSION.tenantId, status: "ACTIVE" }, role: QC_SESSION.role, unitAccess: QC_SESSION.unitAccess, permissions: QC_SESSION.permissions },
      };
    },
    requireAuth: async () => ({ user: { id: QC_SESSION?.userId ?? "" }, memberships: [], active: null }),
    requireMembership: async () => ({}),
  };
  req.cache[ctxFile] = { id: ctxFile, filename: ctxFile, path: join(ROOT, "src/lib/core"), loaded: true, exports: fake, children: [], paths: [] } as never;
  try {
    actionsMod = await tryImport("@/lib/modules/pos/report-actions");
  } finally {
    if (saved) req.cache[ctxFile] = saved;
    else delete req.cache[ctxFile];
  }
  return actionsMod;
}

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p2.12-${RAND}`;
const T_SLUG = `posqc-p212-${RAND}`;
const T2_SLUG = `posqc-p212-${RAND}-t2`;
const KEY_PREFIX = `qc212-${RAND}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";
const RUN_START = Date.now();
const MIN = 60_000;
const BKK_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
/** วันธุรกิจเวลาไทย (cutoff นาทีหลังเที่ยงคืน) */
const bizDate = (t: Date, cutoffMin = 0) => new Date(t.getTime() + BKK_MS - cutoffMin * MIN).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** เวลาไทย date + "HH:MM" → Date (UTC) */
const bkk = (date: string, hm: string) => new Date(Date.parse(`${date}T${hm}:00+07:00`));

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

// ── CSV (ตัวแกะของข้อสอบเอง · BOM · อัญประกาศ · กันสูตรด้วย ' ) ──
function parseCsv(body: string): string[][] {
  const s = body.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((x) => (x.startsWith("'") && /^[=+\-@\t\r]/.test(x.slice(1)) ? x.slice(1) : x)));
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
async function runDb() {
  const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && id !== "P2.12-Z1" && id !== "P2.12-Z2");
  if (!seedOk) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed (scripts/seed-pos-qc.mts) — ข้อ DB ตรวจไม่ได้");
    return;
  }
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} ──`);
  console.log("   POS ผูกสมุด VAT 7% · สาขา A B C (C เก็บถาวรหลังขาย) · ช่องทาง LINEMAN A 30% / B 25% (VAT 7%) · มัดจำเปิด · ร้าน T2 สาขา X");
  let fx = "";
  const notes: string[] = [];
  const S: Record<string, string> = {};
  const U: Record<string, string> = {};
  const O: string = PQC.coffee.users.owner.userId;
  const M: string = PQC.coffee.users.cashier.userId;
  const K: string = PQC.resto.users.owner.userId;
  const C: string = PQC.resto.users.cashier.userId;
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
  const BOOK = { orgName: "ร้านรายงานคิวซี จำกัด", taxId: "0105561177639", branchCode: "00000", address: "1 ถ.รายงาน กรุงเทพฯ", phone: "021110000" };
  try {
    T = (await P.tenant.create({ data: { name: `QC P2.12 รายงาน ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P2.12 ร้านที่สอง ${RAND}`, slug: T2_SLUG } })).id;
    for (const k of ["A", "B", "C"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "SHOP", name: `${TAG} สาขาX`, slug: `${T2_SLUG}-x` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", "POS QC P2.12")).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", "บัญชี VAT QC P2.12")).id;
    S.POSX = (await sysSvc.createSystem(T2, "POS", "POS ร้าน T2")).id;
    await accSvc.saveSettings(T, S.ACC, { ...BOOK, vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    for (const k of ["A", "B", "C"]) await sysSvc.linkUnit(T, S.POS, U[k]);
    await sysSvc.linkUnit(T2, S.POSX, U.X);
    await P.membership.create({ data: { userId: O, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    await P.membership.create({ data: { userId: M, tenantId: T, role: "MANAGER", unitAccess: [U.A], permissions: {}, acceptedAt: new Date() } });
    await P.membership.create({ data: { userId: K, tenantId: T, role: "MANAGER", unitAccess: [U.A, U.B], permissions: {}, acceptedAt: new Date() } });
    await P.membership.create({ data: { userId: C, tenantId: T, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.create": true, "pos.report.view": true }, acceptedAt: new Date() } });
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NOTE = () => (notes.length ? `fixture(${notes.length}): ${short(notes[0], 80)} · ` : "");

  // ─── ผู้กระทำ (ออบเจกต์แบบ session) ───
  const owner = { userId: O, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const mgrA = { userId: M, role: "MANAGER", unitAccess: [U.A], permissions: {} };
  const mgrAB = { userId: K, role: "MANAGER", unitAccess: [U.A, U.B], permissions: {} };
  const cashSell = { userId: C, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.create": true } };
  const cashView = { userId: C, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.create": true, "pos.report.view": true } };
  const cashAn = { userId: C, role: "STAFF", unitAccess: [U.A], permissions: { "pos.sale.create": true, "pos.report.view": true, [ANOMALY_KEY]: true } };
  const anOnly = { userId: C, role: "STAFF", unitAccess: [U.A], permissions: { [ANOMALY_KEY]: true } };
  const noPerm = { userId: C, role: "STAFF", unitAccess: [U.A], permissions: {} };
  const SYSTEM_ACTOR: unknown = catalogMod?.CATALOG_SYSTEM_ACTOR ?? O;
  const cctxSys: Any = { tenantId: T, systemId: S.POS, actorUserId: SYSTEM_ACTOR };
  const ctxOf = (k: string, deviceId?: string): Any => ({ tenantId: T, systemId: S.POS, unitId: U[k], ...(deviceId ? { deviceId } : {}) });
  const posCtx: Any = { tenantId: T, systemId: S.POS };
  const rctx = (k?: string): Any => ({ tenantId: T, systemId: S.POS, ...(k ? { unitId: U[k] } : {}) });
  const uk = (id: string | null | undefined) => (id === null || id === undefined ? "*" : (Object.entries(U).find(([, v]) => v === id)?.[0] ?? `?${String(id).slice(-4)}`));
  const who = (id: string | null | undefined) => (id === O ? "O" : id === M ? "M" : id === K ? "K" : id === C ? "C" : id === null || id === undefined ? "∅" : `?${String(id).slice(-4)}`);
  const NAME: Record<string, string | null> = {};
  for (const u of ((await P.user.findMany({ where: { id: { in: [O, M, K, C] } }, select: { id: true, name: true, email: true } }).catch(() => [])) as Any[])) NAME[u.id] = u.name || u.email || null;

  // ─── เครื่อง + กะของเจ้าของ (A B C) · เครื่องกะทดสอบ S1 S2 ที่ A ───
  const DEV: Record<string, string> = { A: `qc212${RAND}a`, B: `qc212${RAND}b`, C: `qc212${RAND}c`, S1: `qc212${RAND}s1`, S2: `qc212${RAND}s2` };
  const devUnit = (d: string) => (d === "B" ? "B" : d === "C" ? "C" : "A");
  if (!fx)
    for (const d of ["A", "B", "C", "S1", "S2"]) {
      const rg = await call(devMod, "registerDevice", ctxOf(devUnit(d)), owner, { name: `เคาน์เตอร์ ${d} QC P2.12`, deviceCode: DEV[d] });
      if (rg?.ok !== true) notes.push(`registerDevice ${d}: ${codeOf(rg)} ${short(rg?.message ?? "", 60)}`);
      if (d === "S1" || d === "S2") continue;
      const o = await call(shiftMod, "openShift", ctxOf(d, DEV[d]), owner, { deviceId: DEV[d], deviceLabel: `เคาน์เตอร์ ${d} QC P2.12`, floatSatang: 0 });
      if (o?.ok !== true) fx = `เปิดกะ ${d}: ${codeOf(o)} ${short(o?.message ?? "", 80)}`;
    }

  // ─── ช่องทาง LINEMAN (A 30% · B 25% · VAT 7%) + STORE ───
  const CH: Record<string, Any> = {};
  if (!fx) {
    for (const k of ["A", "B"] as const) {
      const r = await call(chMod, "saveChannel", ctxOf(k), owner, { code: "LINEMAN", name: `LINE MAN ${k} ${RAND}`, commissionBp: k === "A" ? 3000 : 2500, commissionVatBp: 700 });
      CH[`LM_${k}`] = r?.channel ?? null;
      if (!r?.channel?.id) notes.push(`saveChannel LINEMAN ${k}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
      const l = await call(chMod, "listChannels", ctxOf(k), owner, {});
      CH[`STORE_${k}`] = (l?.items ?? []).find((i: Any) => i?.code === "STORE") ?? null;
      CH[`CHAT_${k}`] = (l?.items ?? []).find((i: Any) => i?.code === "CHAT") ?? null;
      if (!CH[`STORE_${k}`]?.id) notes.push(`STORE ${k} ไม่มีแถวช่องทาง`);
    }
  }

  // ─── แคตตาล็อก (ราคาเป็นสตางค์ · VAT รวมในราคา ⇒ ยอดบิล = ราคา − ส่วนลด) ───
  const PR: Record<string, string> = {};
  if (!fx) {
    for (const [k, v] of [["P", 10_000], ["X1000", 1000], ["X49999", 49_999], ["X50000", 50_000], ["X100000", 100_000], ["Y11500", 11_500], ["Y11501", 11_501], ["Y20000", 20_000]] as const) {
      const r = await step(`สินค้า ${k}`, () => catalogMod.createProduct(cctxSys, { name: `${k} ${TAG}`, basePriceSatang: v }));
      if (typeof r?.id === "string") PR[k] = r.id;
    }
    const miss = ["P", "X1000", "X49999", "X50000", "X100000", "Y11500", "Y11501", "Y20000"].filter((k) => !PR[k]);
    if (miss.length) notes.push(`แคตตาล็อกขาด ${miss.join(",")}`);
    const ds = await call(paySet, "updatePosPaymentSettings", posCtx, owner, { deposit: { enabled: true } });
    if (ds?.ok !== true) notes.push(`เปิดมัดจำ: ${codeOf(ds)} ${short(ds?.message ?? "", 60)}`);
  }

  // ─── ขาย (quote → submit) · คืนเงิน · ยกเลิก · มัดจำ ───
  let keyN = 0;
  const newKey = (pfx = "k") => `${KEY_PREFIX}-${pfx}-${++keyN}`;
  type Sold = { saleId: string; grand: number };
  const NONE: Sold = { saleId: "", grand: 0 };
  const sell = async (label: string, k: string, actor: Any, lines: Any[], o: { channel?: Any; billDiscount?: Any; pays?: (g: number) => Any[]; couponCode?: string } = {}): Promise<Sold> => {
    if (fx) return NONE;
    const cart = { lines, ...(o.channel?.id ? { channelId: o.channel.id } : {}), ...(o.billDiscount ? { billDiscount: o.billDiscount } : {}), ...(o.couponCode ? { couponCode: o.couponCode } : {}) }; // ORACLE-ADD fix 1: + couponCode ◂
    const q = await call(register, "quoteRegisterCart", ctxOf(k), actor, cart);
    const g = q?.ok === true ? Number(q.grandTotalSatang) : NaN;
    if (!Number.isFinite(g)) {
      notes.push(`quote ${label}: ${codeOf(q)} ${short(q?.message ?? "", 60)}`);
      return NONE;
    }
    const platform = o.channel?.payout === "PLATFORM";
    const pays = o.pays ? o.pays(g) : [{ type: platform ? "PLATFORM" : "CASH", amountSatang: g }];
    const cash = sum(pays.filter((x: Any) => x.type === "CASH").map((x: Any) => Number(x.amountSatang)));
    const input = { ...cart, idempotencyKey: newKey("reg"), expectedGrandTotalSatang: g, payMethods: pays, ...(cash > 0 ? { cashReceivedSatang: cash } : {}) };
    const r = await call(register, "submitRegisterSale", ctxOf(k, DEV[k]), actor, input);
    const saleId = r?.ok === true ? String(r.saleId ?? "") : "";
    if (!saleId) notes.push(`submit ${label}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    return { saleId, grand: g };
  };
  const refund = async (label: string, k: string, actor: Any, s: Sold, qty: number, amount: number, type = "CASH"): Promise<string> => {
    if (!s.saleId) return "";
    const line = await P.posSaleLine.findFirst({ where: { saleId: s.saleId }, select: { id: true } }).catch(() => null);
    const r = await call(refundMod, "refundSale", ctxOf(k, DEV[k]), actor, {
      saleId: s.saleId,
      lines: [{ lineId: String(line?.id ?? ""), qty }],
      payMethods: [{ type, amountSatang: amount }],
      reasonCode: "CHANGED_MIND",
      reason: `ลูกค้าเปลี่ยนใจ ${RAND}`,
      idempotencyKey: newKey("rf"),
    });
    const id = r?.ok === true ? String(r.refund?.id ?? "") : "";
    if (!id) notes.push(`refund ${label}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    return id;
  };
  const voidIt = async (label: string, k: string, saleId: string, audit?: Any): Promise<void> => {
    if (!saleId) return;
    await step(`void ${label}`, () => svc.voidSale(T, U[k], saleId, audit));
  };
  const take = async (label: string, k: string, amount: number): Promise<{ depositId: string; receiptSaleId: string }> => {
    if (fx) return { depositId: "", receiptSaleId: "" };
    const r = await call(depMod, "registerTakeDeposit", ctxOf(k, DEV[k]), owner, { amountSatang: amount, payMethods: [{ type: "CASH", amountSatang: amount }], cashReceivedSatang: amount, customerName: `ลูกค้ามัดจำ ${RAND}`, idempotencyKey: newKey("dep") });
    const depositId = String(r?.deposit?.id ?? "");
    const receiptSaleId = String(r?.deposit?.receiptSaleId ?? "");
    if (!depositId || !receiptSaleId) notes.push(`มัดจำ ${label}: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    return { depositId, receiptSaleId };
  };
  const pl = (key: string, qty = 1) => ({ productId: PR[key] ?? `none-${key}`, qty });
  const cl = (name: string, unitPriceSatang: number, qty = 1) => ({ name: `${name} ${RAND}`, unitPriceSatang, qty });
  const moves: [string, Date][] = [];
  const moveAll = async () => {
    for (const [id, d] of moves) if (id) await step("เลื่อนเวลาบิล", () => P.$executeRawUnsafe(`UPDATE "PosSale" SET "createdAt" = $1, "paidAt" = $1 WHERE id = $2 AND "tenantId" = $3`, d, id, T));
    moves.length = 0;
  };

  // ════════ ชุด 1 · วัน D0 (ช่องทาง · สาขา · บิลทุกสาขา) ════════
  const D0 = "2026-09-16";
  const a1 = await sell("a1", "A", owner, [pl("P")]);
  const a2 = await sell("a2", "A", owner, [pl("P", 2)], { channel: CH.LM_A });
  const a4 = await sell("a4", "A", owner, [pl("P")]);
  await voidIt("a4", "A", a4.saleId);
  const dep0 = await take("dep0", "A", 50_000);
  const a6 = await sell("a6", "A", owner, [pl("P", 2)], { pays: (g) => [{ type: "DEPOSIT", amountSatang: g, depositId: dep0.depositId || "qc-missing" }] });
  const ra2 = await refund("a2", "A", owner, a2, 1, 10_000, "PLATFORM");
  const b1 = await sell("b1", "B", owner, [pl("P", 3)]);
  const b2 = await sell("b2", "B", owner, [pl("P")], { channel: CH.LM_B });
  const rb2 = await refund("b2", "B", owner, b2, 1, 10_000, "PLATFORM");
  const c1 = await sell("c1", "C", owner, [pl("P")]);
  if (!fx) await step("เก็บถาวรสาขา C", () => P.$executeRawUnsafe(`UPDATE "BusinessUnit" SET status = 'ARCHIVED'::"UnitStatus" WHERE id = $1 AND "tenantId" = $2`, U.C, T));
  const A0 = (m: number) => new Date(Date.parse(`${D0}T03:00:00Z`) + m * MIN);
  const B0 = (m: number) => new Date(Date.parse(`${D0}T04:00:00Z`) + m * MIN);
  moves.push([a1.saleId, A0(0)], [a2.saleId, A0(1)], [a4.saleId, A0(2)], [dep0.receiptSaleId, A0(3)], [a6.saleId, A0(4)], [ra2, A0(5)], [b1.saleId, B0(0)], [b2.saleId, B0(1)], [rb2, B0(2)], [c1.saleId, new Date(Date.parse(`${D0}T05:00:00Z`))]);
  await moveAll();

  // ════════ ชุด 2 · วัน DH (รายชั่วโมง + คาดการณ์ 4 สัปดาห์) ════════
  const DH = "2026-09-24";
  const h1 = await sell("h1", "A", owner, [cl("HR-09a", 10_000)]);
  const h2 = await sell("h2", "A", owner, [cl("HR-09b", 15_000)]);
  const dep1 = await take("dep1", "A", 30_000);
  const h4 = await sell("h4", "A", owner, [cl("HR-11v", 12_345)]);
  await voidIt("h4", "A", h4.saleId);
  const h5 = await sell("h5", "A", owner, [pl("P", 2)]);
  const h5r = await refund("h5", "A", owner, h5, 1, 10_000);
  const h6 = await sell("h6", "A", owner, [cl("HR-26", 10_000)]);
  const hB = await sell("hB", "B", owner, [cl("HR-B09", 7000)]);
  const w1a = await sell("w1a", "A", owner, [cl("HR-w1a", 10_001)]);
  const w1b = await sell("w1b", "A", owner, [cl("HR-w1b", 10_000)]);
  const w2a = await sell("w2a", "A", owner, [cl("HR-w2a", 10_001)]);
  const w2c = await sell("w2c", "A", owner, [cl("HR-w2c", 8000)]);
  const w3b = await sell("w3b", "A", owner, [cl("HR-w3b", 10_001)]);
  moves.push(
    [h1.saleId, bkk(DH, "09:15")],
    [h2.saleId, bkk(DH, "09:40")],
    [dep1.receiptSaleId, bkk(DH, "10:05")],
    [h4.saleId, bkk(DH, "11:10")],
    [h5.saleId, bkk(DH, "13:40")],
    [h5r, bkk(DH, "14:10")],
    [h6.saleId, bkk(addDays(DH, 1), "02:30")],
    [hB.saleId, bkk(DH, "09:20")],
    [w1a.saleId, bkk(addDays(DH, -7), "09:30")],
    [w1b.saleId, bkk(addDays(DH, -7), "13:20")],
    [w2a.saleId, bkk(addDays(DH, -14), "09:10")],
    [w2c.saleId, bkk(addDays(DH, -13), "02:10")],
    [w3b.saleId, bkk(addDays(DH, -21), "13:05")],
  );
  await moveAll();

  // ════════ ชุด 3 · วันนี้ (จุดผิดปกติ A1–A10) ════════
  // ด่านเที่ยงคืน: เหตุการณ์ทั้งหมดต้องอยู่วันธุรกิจเดียวกัน (cutoff 0) ⇒ ใกล้เที่ยงคืนไทย < 25 นาที = รอข้ามวัน
  {
    const bkkMin = ((Date.now() + BKK_MS) % DAY_MS) / MIN;
    if (bkkMin > 1440 - 25) {
      const waitMs = Math.ceil((1440 - bkkMin) * MIN) + 30_000;
      console.log(`   ⏳ ใกล้เที่ยงคืนเวลาไทย — รอ ${Math.round(waitMs / 1000)} วินาทีให้ข้ามวันก่อนสร้างชุดวันนี้`);
      await sleep(waitMs);
    }
  }
  const TD = bizDate(new Date());
  const vAud = (actorUserId: string, extra: Any = {}) => ({ actorUserId, reason: `QC A1 ${RAND}`, idempotencyKey: newKey("void"), ...extra });
  // A1 — ผู้ขาย K ที่ A (ไม่ถูกนับ) · ผู้ยกเลิก M ×3 · C ×2 + ขอผ่าน PIN ×1 (ผู้อนุมัติ O) · O ×1 · K ที่ B ฿1,000
  const V1 = await sell("V1", "A", mgrAB, [pl("X1000")]);
  const V2 = await sell("V2", "A", mgrAB, [pl("X1000")]);
  const V3 = await sell("V3", "A", mgrAB, [pl("X1000")]);
  const VC1 = await sell("VC1", "A", mgrAB, [pl("X1000")]);
  const VC2 = await sell("VC2", "A", mgrAB, [pl("X1000")]);
  const VP = await sell("VP", "A", mgrAB, [pl("X50000")]);
  const VO = await sell("VO", "A", mgrAB, [pl("X49999")]);
  const VK = await sell("VK", "B", owner, [pl("X100000")]);
  for (const s of [V1, V2, V3]) await voidIt("A1-M", "A", s.saleId, vAud(M));
  for (const s of [VC1, VC2]) await voidIt("A1-C", "A", s.saleId, vAud(C));
  await voidIt("A1-PIN", "A", VP.saleId, vAud(O, { via: "pin_override", requestId: null, requestedByUserId: C }));
  await voidIt("A1-O", "A", VO.saleId, vAud(O));
  await voidIt("A1-K", "B", VK.saleId, vAud(K));
  // A2 — ผู้ขาย C ที่ A (ไม่ถูกนับ) · ผู้คืน M ×3 · K ×2 (฿999.99) · O ที่ B ฿1,000
  const R1 = await sell("R1", "A", cashSell, [pl("X1000")]);
  const R2 = await sell("R2", "A", cashSell, [pl("X1000")]);
  const R3 = await sell("R3", "A", cashSell, [pl("X1000")]);
  const R4 = await sell("R4", "A", cashSell, [pl("X49999")]);
  const R5 = await sell("R5", "A", cashSell, [pl("X50000")]);
  const R6 = await sell("R6", "B", owner, [pl("X100000")]);
  for (const s of [R1, R2, R3]) await refund("A2-M", "A", mgrA, s, 1, s.grand);
  const R4r = await refund("A2-K", "A", mgrAB, R4, 1, R4.grand);
  await refund("A2-K", "A", mgrAB, R5, 1, R5.grand);
  await refund("A2-O", "B", owner, R6, 1, R6.grand);
  // A3/A4 — ส่วนลดท้ายบิล
  const DK = await sell("DK", "B", mgrAB, [pl("Y11501")], { billDiscount: { type: "AMOUNT", value: 1501 } });
  const DO = await sell("DO", "B", owner, [pl("Y11500")], { billDiscount: { type: "AMOUNT", value: 1500 } });
  const DM1 = await sell("DM1", "A", mgrA, [pl("Y20000")], { billDiscount: { type: "AMOUNT", value: 10_000 } });
  const DM2 = await sell("DM2", "A", mgrA, [pl("Y20000")], { billDiscount: { type: "AMOUNT", value: 9999 } });
  // A6 — บรรทัดราคากำหนดเอง
  const C6a = await sell("C6a", "A", owner, [cl("c6-1", 100), cl("c6-2", 100), cl("c6-3", 100)]);
  const C6b = await sell("C6b", "A", owner, [cl("c6-4", 100), cl("c6-5", 100)]);
  await sell("C6k", "A", mgrAB, [cl("c6-k1", 100), cl("c6-k2", 100), cl("c6-k3", 100), cl("c6-k4", 100)]);
  const C6m = await sell("C6m", "A", mgrA, [cl("c6-m1", 100), cl("c6-m2", 100), cl("c6-m3", 100), cl("c6-m4", 100), cl("c6-m5", 100)]);
  await voidIt("C6m", "A", C6m.saleId);
  // A7 — พิมพ์สำเนา (receiptPayload copy:true ⇒ audit pos.receipt.reprint)
  if (!fx) {
    for (const [sid, actor] of [[C6a.saleId, owner], [C6a.saleId, mgrA], [DK.saleId, owner]] as const) {
      const r = sid ? await call(receiptMod, "receiptPayload", posCtx, actor, { saleId: sid, copy: true }) : null;
      if (r?.ok !== true) notes.push(`reprint: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    }
  }
  // A5 — audit ของการใช้สิทธิ์เกินเพดาน (รูปเดียวกับ register.ts:2713 · pos-approval.ts auditPinOverride)
  const aud = async (actorId: string, action: string, targetId: string, after: Any) => {
    if (fx || !targetId) return void notes.push(`audit ${action}: ไม่มีเป้าหมาย`);
    await step(`audit ${action}`, () => auditMod.writeAudit({ tenantId: T, actorId, action, targetType: "PosSale", targetId, after }));
  };
  await aud(M, "pos.discount.override", DM1.saleId, { saleId: DM1.saleId, byUserId: M, forUserId: C, discountBp: 5000, via: "pin" });
  await aud(M, "pos.approval.pin_override", DM1.saleId, { requestId: null, action: "POS_DISCOUNT_OVER", byUserId: M, forUserId: C, saleId: DM1.saleId });
  await aud(M, "pos.discount.override", DM2.saleId, { saleId: DM2.saleId, byUserId: M, forUserId: C, discountBp: 4999, requestId: `${KEY_PREFIX}-req`, via: "approval" });
  await aud(M, "pos.approval.pin_override", V1.saleId, { requestId: null, action: "POS_VOID", byUserId: M, forUserId: K, saleId: V1.saleId });
  await aud(K, "pos.discount.override", C6a.saleId, { saleId: C6a.saleId, byUserId: K, forUserId: O, discountBp: 2000, via: "pin" });
  await aud(K, "pos.approval.pin_override", C6a.saleId, { requestId: null, action: "POS_DISCOUNT_OVER", byUserId: K, forUserId: O, saleId: C6a.saleId });
  await aud(K, "pos.approval.pin_override", R4r, { requestId: null, action: "POS_REFUND", byUserId: K, forUserId: C, saleId: R4.saleId });
  // A10 — ออเดอร์ปิดไม่สำเร็จ: LINEMAN เริ่ม NEW → ปฏิเสธ (REJECTED) · CHAT startStatus ACCEPTED (DIRECT ยังไม่มีบิล) → ยกเลิก (CANCELLED) · A 3 ใบ · B 2 ใบ
  const ORD: { k: string; id: string; want: string }[] = [];
  if (!fx)
    for (const [k, how] of [["A", "rej"], ["A", "rej"], ["A", "can"], ["B", "rej"], ["B", "can"]] as const) {
      const i = ORD.length;
      const chId = how === "rej" ? CH[`LM_${k}`]?.id : CH[`CHAT_${k}`]?.id;
      const r = await call(orderMod, "ingestOrder", ctxOf(k), owner, {
        channelId: chId ?? "none",
        externalRef: `qc212${RAND}${k}${i}`,
        idempotencyKey: newKey("ord"),
        lines: [{ productId: PR.P ?? "none", qty: 1 }],
        customer: { name: `ลูกค้า QC ${RAND}`, phone: "0812341234" },
        fulfilment: "DELIVERY",
        address: "คอนโด QC",
        startStatus: how === "rej" ? "NEW" : "ACCEPTED",
      });
      const id = r?.ok === true ? String(r.orderId ?? "") : "";
      if (!id) {
        notes.push(`ingestOrder ${k}${i}: ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
        continue;
      }
      const done =
        how === "rej"
          ? await call(orderMod, "rejectOrder", ctxOf(k), owner, { id, reasonCode: "TOO_BUSY" })
          : await call(orderMod, "cancelOrder", ctxOf(k), owner, { id, reason: `ลูกค้ายกเลิก ${RAND}`, idempotencyKey: newKey("oc") });
      if (done?.ok !== true) notes.push(`${how === "rej" ? "rejectOrder" : "cancelOrder"} ${k}${i}: ${codeOf(done)} ${short(done?.message ?? "", 60)}`);
      ORD.push({ k, id, want: how === "rej" ? "REJECTED" : "CANCELLED" });
    }
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.12 fix 1) ▸ AN13/AN14 — บิลของเจ้าของที่สาขา B (กะเจ้าของยังเปิด) แล้วเลื่อนไปวัน DA = วันนี้−7 / DB = วันนี้−6 (นอกทุกช่วงของข้อเดิม: D0 · DH−59…DH+1 · วันนี้)
  //   ระบบคูปองผูกสาขา B (คูปอง FIXED ฿60) · L1 = P ลด 100% + P เต็มราคา · Q1 = P + คูปองอย่างเดียว · X1–X10 = P ลดท้ายบิล ฿50 (A4 × 10 ที่ DB) ◂
  const DA = addDays(TD, -7);
  const DB = addDays(TD, -6);
  const CPN_CODE = `QC212${RAND}`.toUpperCase();
  if (!fx)
    await step("ระบบคูปอง AN13", async () => {
      S.CPN = (await sysSvc.createSystem(T, "COUPON", "คูปอง QC P2.12")).id;
      await sysSvc.linkUnit(T, S.CPN, U.B);
      const cp = await couponSvc.createCoupon({ tenantId: T, systemId: S.CPN, code: CPN_CODE, name: `ลด 60 บาท ${RAND}`, type: "FIXED", valueSatang: 6000 });
      if (!cp?.ok) throw new Error(`คูปอง ${short(cp, 60)}`);
    });
  const L1 = await sell("L1", "B", owner, [{ ...pl("P"), discount: { type: "PERCENT", value: 10_000 } }, pl("P")]);
  const Q1 = await sell("Q1", "B", owner, [pl("P")], { couponCode: CPN_CODE });
  const XS: Sold[] = [];
  for (let i = 0; i < 10; i++) XS.push(await sell(`X${i + 1}`, "B", owner, [pl("P")], { billDiscount: { type: "AMOUNT", value: 5000 } }));
  moves.push([L1.saleId, bkk(DA, "12:00")], [Q1.saleId, bkk(DA, "12:05")], ...XS.map((x, i): [string, Date] => [x.saleId, bkk(DB, `12:${String(i).padStart(2, "0")}`)]));
  // ORACLE-ADD ผู้คุม 16 ต.ค. (P2.14 RPT-4) ▸ AN13 ครึ่งสมาชิก: M1 = P ลดท้ายบิล ฿30 ที่เป็นสิทธิ์สมาชิกล้วน (memberBenefits TIER 3000) วัน DM = วันนี้−8 (นอกทุกช่วงของข้อเดิม เหมือน DA/DB) ◂
  const DM = addDays(TD, -8);
  const M1 = await sell("M1", "B", owner, [pl("P")], { billDiscount: { type: "AMOUNT", value: 3000 } });
  if (M1.saleId) await step("สิทธิ์สมาชิกของ M1", () => P.$executeRawUnsafe(`UPDATE "PosSale" SET "memberBenefits" = $2::jsonb WHERE id = $1 AND "tenantId" = $3`, M1.saleId, JSON.stringify({ lines: [{ kind: "TIER", ref: `qc212-${RAND}`, label: "Gold", discountSatang: 3000 }], pointsBurned: 0 }), T));
  moves.push([M1.saleId, bkk(DM, "12:00")]);
  // ◂ ORACLE-ADD
  await moveAll();
  // A8/A9 — กะทดสอบที่เครื่อง S1 (M ขาด ฿100 · M ขาด ฿99.99 · K ขาด ฿50) · S2 (O · ระบบปิด + นับย้อนหลังเกิน ฿100)
  const SH: Record<string, string> = {};
  const runShift = async (label: string, dev: string, actor: Any, float: number, counted: number): Promise<void> => {
    if (fx) return;
    const o = await call(shiftMod, "openShift", ctxOf("A", DEV[dev]), actor, { deviceId: DEV[dev], deviceLabel: `QC ${dev}`, floatSatang: float });
    const id = o?.ok === true ? String(o.shift?.id ?? "") : "";
    if (!id) return void notes.push(`openShift ${label}: ${codeOf(o)} ${short(o?.message ?? "", 60)}`);
    SH[label] = id;
    if (counted < 0) return;
    const c = await call(shiftMod, "closeShift", ctxOf("A", DEV[dev]), actor, { shiftId: id, countedCashSatang: counted, note: `QC เงินขาด ${RAND}`, idempotencyKey: newKey("cls") });
    if (c?.ok !== true) notes.push(`closeShift ${label}: ${codeOf(c)} ${short(c?.message ?? "", 60)}`);
  };
  await runShift("sh1", "S1", mgrA, 20_000, 10_000);
  await runShift("sh2", "S1", mgrA, 20_000, 10_001);
  await runShift("sh3", "S1", mgrAB, 20_000, 15_000);
  await runShift("sh4", "S2", owner, 0, -1);
  if (!fx) {
    // กะค้างทุกกะของร้านชั่วคราว (รวมกะขายของเจ้าของ) ถูกระบบปิด ⇒ ไม่มีการขาย/ยกเลิกหลังจากนี้
    const fc = await step("forceCloseStaleShifts", () => shiftMod.forceCloseStaleShifts({ now: new Date(Date.now() + 48 * 3_600_000), tenantId: T }));
    if (!SH.sh4 || !(fc?.closed ?? []).includes(SH.sh4)) notes.push(`forceClose ไม่ปิด sh4 (${short(fc, 80)})`);
    const rc = SH.sh4 ? await call(shiftMod, "recountShift", ctxOf("A", DEV.S2), owner, { shiftId: SH.sh4, countedCashSatang: 10_000, note: `นับย้อนหลัง QC ${RAND}`, idempotencyKey: newKey("rc") }) : null;
    if (rc?.ok !== true) notes.push(`recountShift sh4: ${codeOf(rc)} ${short(rc?.message ?? "", 60)}`);
  }
  await drain();

  // ─── แถว PosSale ดิบของร้าน (ตัวอ้างอิงอิสระ + ตรวจ fixture) ───
  type Raw = { id: string; unitId: string; status: string; docType: string; channelCode: string | null; sourceModule: string; grandTotalSatang: number; subtotalSatang: number; discountSatang: number; channelCommissionSatang: number; channelCommissionVatSatang: number; createdAt: Date; soldByUserId: string | null; refSaleId: string | null; refundedSatang: number };
  const RAW = (await P.posSale.findMany({
    where: { tenantId: T || "-" },
    select: { id: true, unitId: true, status: true, docType: true, channelCode: true, sourceModule: true, grandTotalSatang: true, subtotalSatang: true, discountSatang: true, channelCommissionSatang: true, channelCommissionVatSatang: true, createdAt: true, soldByUserId: true, refSaleId: true, refundedSatang: true },
  }).catch(() => [])) as Raw[];
  const raw = (id: string) => RAW.find((x) => x.id === id);
  const fxSelf: string[] = [];
  const ordSelf: string[] = [];
  {
    const want: [string, string, Partial<Raw>][] = [
      ["a1", a1.saleId, { grandTotalSatang: 10_000, status: "PAID" }],
      ["a2", a2.saleId, { grandTotalSatang: 20_000, channelCode: "LINEMAN", channelCommissionSatang: halfUp(20_000, 3000, 10_000), channelCommissionVatSatang: halfUp(6000, 700, 10_000), refundedSatang: 10_000, status: "PAID" }],
      ["ใบคืน a2", ra2, { docType: "REFUND", grandTotalSatang: 10_000, channelCommissionSatang: 3000, channelCommissionVatSatang: 210 }],
      ["a4", a4.saleId, { status: "VOIDED" }],
      ["ใบรับมัดจำ", dep0.receiptSaleId, { sourceModule: "POS_DEPOSIT", grandTotalSatang: 50_000, status: "PAID" }],
      ["a6", a6.saleId, { grandTotalSatang: 20_000, status: "PAID" }],
      ["b2", b2.saleId, { status: "REFUNDED", channelCommissionSatang: 2500, channelCommissionVatSatang: 175 }],
      ["ใบคืน b2", rb2, { channelCommissionSatang: 2500, channelCommissionVatSatang: 175 }],
      ["VO", VO.saleId, { grandTotalSatang: 49_999, status: "VOIDED" }],
      ["DK", DK.saleId, { grandTotalSatang: 10_000, discountSatang: 1501, subtotalSatang: 11_501 }],
      ["DM2", DM2.saleId, { grandTotalSatang: 10_001, discountSatang: 9999, subtotalSatang: 20_000 }],
      ["R4 ผู้คืน K", R4r, { soldByUserId: K, docType: "REFUND", grandTotalSatang: 49_999 }],
      ["w1a", w1a.saleId, { grandTotalSatang: 10_001 }],
    ];
    for (const [lbl, id, w] of want) {
      const r = id ? raw(id) : undefined;
      if (!r) {
        fxSelf.push(`${lbl} ไม่มีแถว`);
        continue;
      }
      for (const [k, v] of Object.entries(w)) if ((r as Any)[k] !== v) fxSelf.push(`${lbl}.${k} = ${(r as Any)[k]} (คาด ${v})`);
    }
    if (bizDate(raw(h6.saleId)?.createdAt ?? new Date(0)) !== addDays(DH, 1)) fxSelf.push("h6 ไม่อยู่ DH+1");
    const ords = (await P.posOrder.findMany({ where: { tenantId: T || "-" }, select: { id: true, status: true, saleId: true, receivedAt: true } }).catch(() => [])) as Any[];
    for (const o of ORD) {
      const r = ords.find((x) => x.id === o.id);
      if (!r || r.status !== o.want || r.saleId || bizDate(r.receivedAt) !== TD) ordSelf.push(`ออเดอร์ ${o.k} ${short(r ? [r.status, r.saleId] : "ไม่มี", 40)} (คาด ${o.want} ไม่มีบิล)`);
    }
    if (ORD.length !== 5 || ords.length !== 5) ordSelf.push(`ออเดอร์ ${ORD.length}/${ords.length} (คาด 5)`);
  }
  // ตรวจแหล่งข้อมูลของ A1–A10 ที่ fixture สร้าง (ตัวควบคุมบวกของคำตอบที่ข้อสอบตั้งจากสเปก)
  const anSelf: Record<string, string[]> = Object.fromEntries(RULES.map((r) => [r, [] as string[]]));
  {
    const auds = (await P.auditLog.findMany({ where: { tenantId: T || "-", action: { in: ["pos.sale.void", "pos.discount.override", "pos.approval.pin_override", "pos.receipt.reprint"] } }, select: { action: true, actorId: true, targetId: true, after: true, before: true, createdAt: true } }).catch(() => [])) as Any[];
    const by = (action: string) => auds.filter((a) => a.action === action);
    const tally = (xs: Any[], f: (a: Any) => string) => canon(xs.reduce((m: Record<string, number>, a) => ({ ...m, [f(a)]: (m[f(a)] ?? 0) + 1 }), {}));
    if (auds.some((a) => bizDate(a.createdAt) !== TD)) anSelf.A1!.push("audit ไม่อยู่วันนี้");
    const voids = by("pos.sale.void");
    if (tally(voids, (a) => who(a.actorId)) !== canon({ M: 3, C: 2, O: 2, K: 1 })) anSelf.A1!.push(`ผู้ยกเลิก ${tally(voids, (a) => who(a.actorId))}`);
    if (who(voids.find((a) => a.targetId === VP.saleId)?.after?.requestedByUserId) !== "C") anSelf.A1!.push("void PIN ไม่มี requestedByUserId = C");
    const refunds = RAW.filter((x) => x.docType === "REFUND" && bizDate(x.createdAt) === TD);
    const rsum = (u: string) => sum(refunds.filter((x) => x.soldByUserId === u).map((x) => x.grandTotalSatang));
    if (tally(refunds, (x) => who(x.soldByUserId)) !== canon({ M: 3, K: 2, O: 1 }) || rsum(M) !== 3000 || rsum(K) !== 99_999 || rsum(O) !== 100_000) anSelf.A2!.push(`ใบคืนวันนี้ ${tally(refunds, (x) => who(x.soldByUserId))} ฿ M ${rsum(M)} K ${rsum(K)} O ${rsum(O)}`);
    if (tally(by("pos.discount.override"), (a) => who(a.actorId)) !== canon({ M: 2, K: 1 }) || tally(by("pos.approval.pin_override"), (a) => who(a.actorId)) !== canon({ M: 2, K: 2 })) anSelf.A5!.push(`audit A5 ${tally(by("pos.discount.override"), (a) => who(a.actorId))} / ${tally(by("pos.approval.pin_override"), (a) => who(a.actorId))}`);
    const rp = by("pos.receipt.reprint");
    if (rp.filter((a) => a.targetId === C6a.saleId).length !== 2 || rp.filter((a) => a.targetId === DK.saleId).length !== 1 || rp.length !== 3) anSelf.A7!.push(`reprint ${rp.length} แถว`);
    const custom = (await P.posSaleLine.findMany({ where: { tenantId: T || "-", priceSource: "CUSTOM", sale: { createdAt: { gte: new Date(Date.parse(`${TD}T00:00:00+07:00`)) } } }, select: { saleId: true } }).catch(() => [])) as Any[];
    const cAt = (id: string) => custom.filter((l) => l.saleId === id).length;
    if (cAt(C6a.saleId) !== 3 || cAt(C6b.saleId) !== 2 || custom.length !== 3 + 2 + 4 + 5 || cAt(C6m.saleId) !== 5) anSelf.A6!.push(`บรรทัด CUSTOM วันนี้ ${custom.length} (C6a ${cAt(C6a.saleId)} · C6b ${cAt(C6b.saleId)} · C6m ${cAt(C6m.saleId)})`);
    const shifts = (await P.posShift.findMany({ where: { tenantId: T || "-", id: { in: Object.values(SH) } }, select: { id: true, status: true, overShortSatang: true, openedByUserId: true, openedAt: true } }).catch(() => [])) as Any[];
    const sh = (k: string) => shifts.find((x) => x.id === SH[k]);
    const want8: [string, string, number | null, string][] = [["sh1", "CLOSED", -10_000, M], ["sh2", "CLOSED", -9999, M], ["sh3", "CLOSED", -5000, K], ["sh4", "FORCE_CLOSED", null, O]];
    for (const [k, st, os, u] of want8) {
      const x = sh(k);
      if (!x || x.status !== st || x.overShortSatang !== os || x.openedByUserId !== u || bizDate(x.openedAt) !== TD) anSelf.A8!.push(`${k} ${short(x ? [x.status, x.overShortSatang, who(x.openedByUserId)] : "ไม่มี", 50)}`);
    }
    const rc = SH.sh4 ? ((await P.posShiftRecount.findMany({ where: { tenantId: T || "-", shiftId: SH.sh4 }, select: { varianceSatang: true } }).catch(() => [])) as Any[]) : [];
    if (rc.length !== 1 || rc[0]?.varianceSatang !== 10_000) anSelf.A8!.push(`นับย้อนหลัง sh4 ${short(rc, 40)}`);
    anSelf.A9 = [...anSelf.A8!];
    for (const [r, xs] of Object.entries(anSelf)) if (xs.length) console.log(`  ⚠️  fixture ${r}: ${P8(xs)}`);
  }
  if (fxSelf.length) console.log(`  ⚠️  fixture self-check: ${P8(fxSelf)}`);
  const FXS = () => (fxSelf.length ? `fixture self-check: ${P8(fxSelf)} · ` : "");
  console.log(`   บิล ${RAW.length} แถว · D0 ${D0} · DH ${DH} · วันนี้ ${TD}${notes.length ? ` · ⚠️ ${notes.length} รายการ fixture` : ""}`);
  const rep = (fn: string, k: string | undefined, actor: Any, from: string, to: string, extra: Any = {}) => call(repMod, fn, rctx(k), actor, { from, to, ...extra });
  const noGen = (x: Any) => J(isRecord(x) ? { ...x, generatedAt: undefined } : x);

  // ════════ CH1 ช่องทาง ตัดมัดจำ ════════
  {
    const p: string[] = [];
    type ChExp = { channelCode: string; billCount: number; grossSatang: number; refundSatang: number; commissionSatang: number; commissionVatSatang: number; netSatang: number; sharePct: number };
    const cmp = (lbl: string, r: Any, exp: ChExp[]) => {
      if (r?.ok !== true) return void p.push(`${lbl}: ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
      const rows: Any[] = r.report?.rows ?? [];
      if (rows.map((x) => x?.channelCode).join(",") !== exp.map((x) => x.channelCode).join(",")) p.push(`${lbl}: รหัส ${rows.map((x) => x?.channelCode).join(",")} (คาด ${exp.map((x) => x.channelCode).join(",")})`);
      for (const e of exp) {
        const g = rows.find((x) => x?.channelCode === e.channelCode);
        if (!g) continue;
        for (const k of Object.keys(e) as (keyof ChExp)[]) if (g[k] !== e[k]) p.push(`${lbl} ${e.channelCode}.${k} ${g[k]} (คาด ${e[k]})`);
      }
      const t = r.report?.totals ?? {};
      for (const k of ["billCount", "grossSatang", "refundSatang", "commissionSatang", "commissionVatSatang", "netSatang"] as const) {
        const w = sum(exp.map((x) => x[k]));
        if (t[k] !== w) p.push(`${lbl} totals.${k} ${t[k]} (คาด ${w})`);
      }
    };
    cmp("ทุกสาขา", await rep("reportChannels", undefined, owner, D0, D0), [
      { channelCode: "STORE", billCount: 4, grossSatang: 70_000, refundSatang: 0, commissionSatang: 0, commissionVatSatang: 0, netSatang: 70_000, sharePct: 91.2 },
      { channelCode: "LINEMAN", billCount: 2, grossSatang: 30_000, refundSatang: 20_000, commissionSatang: 3000, commissionVatSatang: 210, netSatang: 6790, sharePct: 8.8 },
    ]);
    cmp("สาขา A", await rep("reportChannels", "A", owner, D0, D0), [
      { channelCode: "STORE", billCount: 2, grossSatang: 30_000, refundSatang: 0, commissionSatang: 0, commissionVatSatang: 0, netSatang: 30_000, sharePct: 81.5 },
      { channelCode: "LINEMAN", billCount: 1, grossSatang: 20_000, refundSatang: 10_000, commissionSatang: 3000, commissionVatSatang: 210, netSatang: 6790, sharePct: 18.5 },
    ]);
    const daily = await rep("reportDailySales", undefined, owner, D0, D0);
    const ch = await rep("reportChannels", undefined, owner, D0, D0);
    if (daily?.ok !== true || daily.report?.totals?.netSalesSatang !== 80_000) fxSelf.push(`reportDailySales D0 net ${daily?.report?.totals?.netSalesSatang} (คาด 80000)`);
    if (ch?.ok === true && daily?.ok === true) {
      const want = daily.report.totals.netSalesSatang - ch.report.totals.commissionSatang - ch.report.totals.commissionVatSatang;
      if (ch.report.totals.netSatang !== want) p.push(`Σ net ช่องทาง ${ch.report.totals.netSatang} ≠ net รายวัน − ค่าคอมฯ − VAT ${want}`);
    }
    chk("CH1", !fx && fxSelf.length === 0 && p.length === 0, "STORE 4 บิล ฿700 (มัดจำไม่นับ) · LINEMAN สุทธิ ฿67.90 · Σ = รายวัน − ค่าคอมฯ", FX(NOTE() + FXS() + (P8(p) || "ครบ")));
  }

  // ════════ CH2 ลิ้นชักบิล หักคืนเงิน ════════
  {
    const p: string[] = [];
    const noView = { userId: C, role: "STAFF", unitAccess: [U.A, U.B], permissions: { "pos.sale.create": true } };
    const det = async (k: string, saleId: string, actor: Any) => (saleId ? call(billsMod, "billDetail", posCtx, actor, { unitId: U[k], saleId }) : { ok: false, code: "FIXTURE" });
    const want = async (lbl: string, k: string, saleId: string, w: Record<string, number>) => {
      const r = await det(k, saleId, owner);
      const ch = r?.bill?.channel;
      if (r?.ok !== true || !isRecord(ch)) return void p.push(`${lbl}: ${codeOf(r)} channel ${short(ch, 40)}`);
      for (const [key, v] of Object.entries(w)) if (ch[key] !== v) p.push(`${lbl} ${key} ${ch[key]} (คาด ${v})`);
    };
    await want("LINEMAN คืนบางส่วน", "A", a2.saleId, { commissionSatang: 6000, commissionVatSatang: 420, refundSatang: 10_000, commissionNetSatang: 3000, commissionVatNetSatang: 210, netSatang: 6790 });
    await want("LINEMAN คืนครบ", "B", b2.saleId, { commissionSatang: 2500, commissionVatSatang: 175, refundSatang: 10_000, commissionNetSatang: 0, commissionVatNetSatang: 0, netSatang: 0 });
    await want("STORE", "A", a1.saleId, { commissionSatang: 0, commissionVatSatang: 0, refundSatang: 0, commissionNetSatang: 0, commissionVatNetSatang: 0, netSatang: 10_000 });
    const nv = await det("A", a2.saleId, noView);
    const nch = nv?.bill?.channel;
    if (nv?.ok !== true || !isRecord(nch)) p.push(`ไม่มีสิทธิ์รายงาน → ${codeOf(nv)}`);
    else {
      const leak = ["commissionSatang", "commissionVatSatang", ...CH_NEW_KEYS].filter((k) => k in nch);
      if (leak.length) p.push(`ไม่มีสิทธิ์รายงานเห็น ${leak.join(",")}`);
      if (nch.code !== "LINEMAN") p.push(`ไม่มีสิทธิ์รายงาน code ${nch.code}`);
    }
    chk("CH2", !fx && fxSelf.length === 0 && p.length === 0, "ตัวเลขหลังคืนเงินจากใบคืนที่เก็บ · ไม่มีสิทธิ์ = ไม่มีตัวเลข", FX(NOTE() + FXS() + (P8(p) || "ครบ")));
  }

  // ════════ CH3 จำนวนบิลต่อช่องทางในสรุป ════════
  const page = (actor: Any, unitId: string, date: string, extra: Any = {}) => call(billsMod, "billsPageData", posCtx, actor, { unitId, date, pageSize: 50, ...extra });
  {
    const p: string[] = [];
    for (const [k, want] of [["A", { STORE: 3, LINEMAN: 1 }], ["B", { STORE: 1, LINEMAN: 1 }]] as const) {
      const r = await page(owner, U[k]!, D0);
      const cc = r?.summary?.channelCounts;
      if (r?.ok !== true || !isRecord(cc)) {
        p.push(`${k}: ${codeOf(r)} channelCounts ${short(cc, 40)}`);
        continue;
      }
      if (canon(cc) !== canon(want)) p.push(`${k} channelCounts ${J(cc)} (คาด ${J(want)})`);
      if (sum(Object.values(cc).map(Number)) !== r.summary.billCount) p.push(`${k} Σ ${sum(Object.values(cc).map(Number))} ≠ billCount ${r.summary.billCount}`);
      for (const [code, chKey] of [["STORE", `STORE_${k}`], ["LINEMAN", `LM_${k}`]] as const) {
        const id = CH[chKey]?.id;
        if (!id) {
          p.push(`${k} ${code}: ไม่มี id ช่องทาง`);
          continue;
        }
        const all = await page(owner, U[k]!, D0, { salesChannelId: id });
        const vo = await page(owner, U[k]!, D0, { salesChannelId: id, status: "VOIDED" });
        const old = Number(all?.total) - Number(vo?.total);
        if (Number(cc[code] ?? 0) !== old) p.push(`${k} ${code} ${cc[code]} ≠ อ่านแบบเดิม ${old}`);
      }
    }
    chk("CH3", !fx && p.length === 0, "channelCounts = อ่านแบบเดิม 2 ครั้ง · Σ = billCount", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ════════ BR สาขา ════════
  const unitName = (k: string) => `${TAG} สาขา${k}`;
  /** แถวสาขาที่ประกอบจากรายงานเดิมของสาขานั้น (PAR) */
  const brFromReaders = async (k: string | undefined, from: string, to: string, actor: Any = owner): Promise<Record<string, number> | string> => {
    const [d, pay, ch, sh] = await Promise.all([rep("reportDailySales", k, actor, from, to), rep("reportPayments", k, actor, from, to), rep("reportChannels", k, actor, from, to), rep("reportShifts", k, actor, from, to)]);
    if ([d, pay, ch, sh].some((x) => x?.ok !== true)) return `รายงานเดิม ${[d, pay, ch, sh].map(codeOf).join("/")}`;
    const t = d.report.totals;
    const amt = (type: string) => Number((pay.report.rows as Any[]).find((x) => x.type === type)?.amountSatang ?? 0);
    return {
      billCount: t.billCount,
      netSalesSatang: t.netSalesSatang,
      avgBillSatang: t.avgBillSatang,
      refundCount: t.refundCount,
      refundTotalSatang: t.refundTotalSatang,
      voidCount: t.voidCount,
      voidTotalSatang: t.voidTotalSatang,
      cashSatang: amt("CASH"),
      platformSatang: amt("PLATFORM"),
      commissionSatang: ch.report.totals.commissionSatang,
      commissionVatSatang: ch.report.totals.commissionVatSatang,
      overShortSatang: sh.report.totals.overShortSatang,
    };
  };
  const cmpNums = (lbl: string, got: Any, want: Record<string, number> | string, p: string[]) => {
    if (typeof want === "string") return void p.push(`${lbl}: ${want}`);
    if (!isRecord(got)) return void p.push(`${lbl}: ไม่มี`);
    for (const k of BR_NUM_KEYS) if (got[k] !== want[k]) p.push(`${lbl}.${k} ${got[k]} (คาด ${want[k]})`);
  };
  const brD0 = await rep("reportBranches", undefined, owner, D0, D0);
  const brTD = await rep("reportBranches", undefined, owner, TD, TD);
  {
    const p: string[] = [];
    for (const [lbl, r, units] of [["D0", brD0, ["A", "B", "C"]], ["วันนี้", brTD, ["A", "B"]]] as const) {
      if (r?.ok !== true) {
        p.push(`${lbl}: ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
        continue;
      }
      const rows: Any[] = r.report?.rows ?? [];
      const ids = rows.map((x) => uk(x?.unitId)).sort().join(",");
      if (ids !== [...units].sort().join(",")) p.push(`${lbl} แถวสาขา ${ids} (คาด ${[...units].join(",")})`);
      for (const k of units) {
        const row = rows.find((x) => x?.unitId === U[k]);
        if (row && row.name !== unitName(k)) p.push(`${lbl} ${k} name ${short(row.name, 30)}`);
        cmpNums(`${lbl} ${k}`, row, await brFromReaders(k, lbl === "D0" ? D0 : TD, lbl === "D0" ? D0 : TD), p);
      }
    }
    // ตัวเลขอิสระ D0 (จากสเปกของชุด 1)
    const indep: Record<string, Record<string, number>> = {
      A: { billCount: 3, netSalesSatang: 40_000, avgBillSatang: 13_333, refundCount: 1, refundTotalSatang: 10_000, voidCount: 1, voidTotalSatang: 10_000, cashSatang: 60_000, platformSatang: 10_000, commissionSatang: 3000, commissionVatSatang: 210, overShortSatang: 0 },
      B: { billCount: 2, netSalesSatang: 30_000, avgBillSatang: 15_000, refundCount: 1, refundTotalSatang: 10_000, voidCount: 0, voidTotalSatang: 0, cashSatang: 30_000, platformSatang: 0, commissionSatang: 0, commissionVatSatang: 0, overShortSatang: 0 },
      C: { billCount: 1, netSalesSatang: 10_000, avgBillSatang: 10_000, refundCount: 0, refundTotalSatang: 0, voidCount: 0, voidTotalSatang: 0, cashSatang: 10_000, platformSatang: 0, commissionSatang: 0, commissionVatSatang: 0, overShortSatang: 0 },
    };
    if (brD0?.ok === true) for (const k of ["A", "B", "C"]) cmpNums(`D0 อิสระ ${k}`, (brD0.report.rows as Any[]).find((x) => x?.unitId === U[k]), indep[k]!, p);
    // ตัวควบคุมบวกของตัวเลขอิสระ: ต้องเท่ารายงานเดิมของสาขา (ไม่ขึ้นกับโค้ดใหม่ — แดง = ข้อสอบ/fixture ผิด)
    for (const k of ["A", "B", "C"]) {
      const q: string[] = [];
      cmpNums(`ตัวอ้างอิง ${k}`, indep[k], await brFromReaders(k, D0, D0), q);
      if (q.length) p.push(...q.map((x) => `fixture ${x}`));
    }
    const sh = brTD?.ok === true ? (brTD.report.rows as Any[]).find((x) => x?.unitId === U.A)?.overShortSatang : undefined;
    if (brTD?.ok === true && sh !== -24_999) p.push(`วันนี้ A overShortSatang ${sh} (คาด −24999 จาก sh1+sh2+sh3)`);
    chk("BR1", !fx && fxSelf.length === 0 && p.length === 0, "แถวสาขา = รายงานเดิมของสาขา · D0 ตรงตัวเลขอิสระ", FX(NOTE() + FXS() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    for (const [lbl, r, from] of [["D0", brD0, D0], ["วันนี้", brTD, TD]] as const) {
      if (r?.ok !== true) {
        p.push(`${lbl}: ${codeOf(r)}`);
        continue;
      }
      const rows: Any[] = r.report.rows ?? [];
      cmpNums(`${lbl} totals`, r.report.totals, await brFromReaders(undefined, from, from), p);
      for (const k of BR_NUM_KEYS) {
        if (k === "avgBillSatang") continue;
        const s = sum(rows.map((x) => Number(x?.[k] ?? 0)));
        if (r.report.totals?.[k] !== s) p.push(`${lbl} totals.${k} ${r.report.totals?.[k]} ≠ Σ แถว ${s}`);
      }
      const t = r.report.totals ?? {};
      if (t.avgBillSatang !== (t.billCount > 0 ? Math.floor(t.netSalesSatang / t.billCount) : 0)) p.push(`${lbl} totals.avgBillSatang ${t.avgBillSatang}`);
      const order = rows.map((x) => Number(x?.netSalesSatang));
      if (order.some((v, i) => i > 0 && v > order[i - 1]!)) p.push(`${lbl} ไม่เรียง net มาก→น้อย ${order.join(",")}`);
    }
    if (brD0?.ok === true) {
      const t = brD0.report.totals ?? {};
      if (t.billCount !== 6 || t.netSalesSatang !== 80_000 || t.cashSatang !== 100_000 || t.commissionSatang !== 3000) p.push(`D0 totals อิสระ ${short(t, 120)} (คาด บิล 6 · ฿800 · เงินสด ฿1,000 · ค่าคอมฯ ฿30 รวม C)`);
    }
    const csv = await call(repMod, "reportCsv", rctx(), owner, { kind: "branches", from: D0, to: D0 });
    if (csv?.ok !== true) p.push(`CSV branches → ${codeOf(csv)} ${short(csv?.message ?? "", 40)}`);
    else {
      const lines = parseCsv(String(csv.body ?? "")).filter((r) => r.join("") !== "");
      const head = repMod?.CSV_HEADERS?.branches;
      if (!Array.isArray(head) || J(lines[0]) !== J(head)) p.push(`CSV หัว ${short(lines[0], 60)} (คาด CSV_HEADERS.branches ${short(head, 60)})`);
      const n = brD0?.ok === true ? brD0.report.rows.length : -1;
      if (lines.length !== n + 2 || lines[lines.length - 1]?.[0] !== "รวม") p.push(`CSV ${lines.length} บรรทัด (คาด หัว + ${n} + รวม) ท้าย ${short(lines[lines.length - 1]?.[0], 20)}`);
      if (!/branches/.test(String(csv.filename ?? ""))) p.push(`CSV filename ${csv.filename}`);
    }
    chk("BR2", !fx && fxSelf.length === 0 && p.length === 0, "totals = ทุกสาขา (รวม C) = Σ แถว · เรียง · CSV", FX(NOTE() + FXS() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    const fromN = (n: number) => addDays(D0, -n);
    const mA = await rep("reportBranches", undefined, mgrA, D0, D0);
    if (mA?.ok !== true || (mA.report.rows as Any[]).map((x) => uk(x?.unitId)).join(",") !== "A") p.push(`ผู้จัดการ A → ${codeOf(mA)} ${short(mA?.report?.rows?.map?.((x: Any) => uk(x?.unitId)), 40)}`);
    else cmpNums("ผู้จัดการ A totals", mA.report.totals, await brFromReaders("A", D0, D0), p);
    const mAB = await rep("reportBranches", undefined, mgrAB, D0, D0);
    if (mAB?.ok !== true || (mAB.report.rows as Any[]).map((x) => uk(x?.unitId)).sort().join(",") !== "A,B") p.push(`ผู้จัดการ A+B → ${codeOf(mAB)} ${short(mAB?.report?.rows?.map?.((x: Any) => uk(x?.unitId)), 40)}`);
    const cv = await rep("reportBranches", undefined, cashView, D0, D0);
    if (cv?.ok !== true || (cv.report.rows as Any[]).map((x) => uk(x?.unitId)).join(",") !== "A") p.push(`พนักงาน view → ${codeOf(cv)}`);
    const long = await rep("reportBranches", undefined, owner, fromN(92), D0);
    if (!codeIs(long, "VALIDATION")) p.push(`93 วัน → ${codeOf(long)}`);
    const np = await rep("reportBranches", undefined, cashSell, D0, D0);
    if (!codeIs(np, "PERMISSION_DENIED")) p.push(`ไม่มีสิทธิ์ → ${codeOf(np)}`);
    const nb = await rep("reportBranches", "B", mgrA, D0, D0);
    if (!codeIs(nb, "NOT_FOUND")) p.push(`ผู้จัดการ A ระบุ B → ${codeOf(nb)}`);
    const t2 = await call(repMod, "reportBranches", { tenantId: T, systemId: S.POSX }, owner, { from: D0, to: D0 });
    if (!codeIs(t2, "NOT_FOUND")) p.push(`ระบบร้าน T2 → ${codeOf(t2)}`);
    chk("BR3", !fx && p.length === 0, "ขอบเขตตามสิทธิ์ · ปฏิเสธ VALIDATION/PERMISSION_DENIED/NOT_FOUND", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ════════ BL บิลทุกสาขา ════════
  {
    const p: string[] = [];
    const all = await page(owner, "*", D0);
    const per: Record<string, Any> = {};
    for (const k of ["A", "B", "C"]) per[k] = await page(owner, U[k]!, D0);
    const wantOrder = [c1, b2, b1, a6, { saleId: dep0.receiptSaleId }, a4, a2, a1].map((s) => s.saleId);
    if (all?.ok !== true) p.push(`"*" → ${codeOf(all)} ${short(all?.message ?? "", 40)}`);
    else {
      const items: Any[] = all.items ?? [];
      const got = items.map((x) => x?.id);
      if (J(got) !== J(wantOrder)) p.push(`"*" แถว ${got.length} ลำดับ ${got.map((id) => uk(raw(id)?.unitId)).join("")} (คาด 8 แถว CBBAAAAA ใหม่→เก่า)`);
      for (const it of items) {
        const r = raw(it?.id);
        if (!r) continue;
        if (it.unitId !== r.unitId || it.unitName !== unitName(uk(r.unitId))) p.push(`แถว ${uk(r.unitId)} unitId/unitName ${short([uk(it.unitId), it.unitName], 50)}`);
      }
      for (const k of ["all", "paid", "voided", "refunded", "offShiftCash"]) {
        const s = sum(["A", "B", "C"].map((u) => Number(per[u]?.counts?.[k] ?? NaN)));
        if (all.counts?.[k] !== s) p.push(`counts.${k} ${all.counts?.[k]} ≠ Σ ${s}`);
      }
      for (const k of ["netSatang", "billCount", "storeCount", "onlineCount"]) {
        const s = sum(["A", "B", "C"].map((u) => Number(per[u]?.summary?.[k] ?? NaN)));
        if (all.summary?.[k] !== s) p.push(`summary.${k} ${all.summary?.[k]} ≠ Σ ${s}`);
      }
      if (all.total !== sum(["A", "B", "C"].map((u) => Number(per[u]?.total ?? NaN)))) p.push(`total ${all.total}`);
      if (all.counts?.all !== 8 || all.counts?.voided !== 1 || all.counts?.refunded !== 1 || all.summary?.netSatang !== 130_000) p.push(`ตัวเลขอิสระ counts ${short(all.counts, 60)} net ${all.summary?.netSatang} (คาด 8/1/1 · 130000)`);
    }
    chk("BL1", !fx && fxSelf.length === 0 && p.length === 0, "\"*\" = ทุกสาขาที่อ่านได้ + unitId/unitName · Σ ต่อสาขา", FX(NOTE() + FXS() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    const aIds = [a6, { saleId: dep0.receiptSaleId }, a4, a2, a1].map((s) => s.saleId);
    for (const [lbl, actor] of [["ผู้จัดการ A", mgrA], ["พนักงาน A", cashSell]] as const) {
      const r = await page(actor, "*", D0);
      if (r?.ok !== true || J((r.items ?? []).map((x: Any) => x?.id)) !== J(aIds) || r.counts?.all !== 5) p.push(`${lbl} "*" → ${codeOf(r)} ${(r?.items ?? []).map((x: Any) => uk(raw(x?.id)?.unitId)).join("")} (คาด AAAAA)`);
    }
    const np = await page(noPerm, "*", D0);
    if (!codeIs(np, "NO_PERMISSION")) p.push(`ไม่มีสิทธิ์อ่าน → ${codeOf(np)}`);
    // PAR หน้าเดี่ยว (พฤติกรรม e6546359)
    const one = await page(owner, U.A!, D0);
    if (one?.ok !== true) p.push(`หน้าเดี่ยว A → ${codeOf(one)}`);
    else {
      const items: Any[] = one.items ?? [];
      if (J(items.map((x) => x?.id)) !== J(aIds)) p.push(`หน้าเดี่ยว A ลำดับ ${items.length} แถว`);
      for (const it of items) {
        const keys = Object.keys(it ?? {}).filter((k) => k !== "voidApprovedBy").sort();
        if (J(keys) !== J([...BILLROW_BASE_KEYS].sort())) {
          p.push(`หน้าเดี่ยว คีย์แถว ${keys.filter((k) => !(BILLROW_BASE_KEYS as readonly string[]).includes(k)).join(",") || "ขาด " + BILLROW_BASE_KEYS.filter((k) => !keys.includes(k)).join(",")}`);
          break;
        }
      }
      const wantCounts = { all: 5, paid: 4, voided: 1, refunded: 0, offShiftCash: 0 };
      if (canon(one.counts) !== canon(wantCounts)) p.push(`counts ${J(one.counts)} (คาด ${J(wantCounts)})`);
      const wantSum = { netSatang: 90_000, billCount: 4, storeCount: 3, onlineCount: 1, avgSatang: 22_500, yesterdayAvgSatang: 0 };
      for (const k of SUMMARY_BASE_KEYS) if (one.summary?.[k] !== wantSum[k]) p.push(`summary.${k} ${one.summary?.[k]} (คาด ${wantSum[k]})`);
      if (one.total !== 5 || one.page !== 1 || one.pageSize !== 50 || one.date !== D0) p.push(`total/page ${short([one.total, one.page, one.pageSize, one.date], 50)}`);
    }
    const mb = await page(mgrA, U.B!, D0);
    if (mb?.ok !== true || (mb.items ?? []).length !== 0 || mb.total !== 0) p.push(`ผู้จัดการ A ขอ B → ${codeOf(mb)} ${mb?.total} แถว (คาด หน้าว่าง)`);
    chk("BL2", !fx && fxSelf.length === 0 && p.length === 0, "\"*\" ตามขอบเขต · หน้าเดี่ยวคงเดิม", FX(NOTE() + FXS() + (P8(p) || "ครบ")));
  }

  // ════════ AN จุดผิดปกติ (วันนี้) ════════
  type AnExp = { rule: RuleId; unit: string; businessDate: string | null; userId: string | null; refType: string; refId: string | null; value: number; count: number };
  const anKey = (rule: string, unitId: string, bd: string | null | undefined, userId: string | null | undefined, refId: string | null | undefined) => `${rule}|${unitId}|${bd ?? "-"}|${userId ?? "-"}|${refId ?? "-"}`;
  const anLbl = (e: { unit?: string; unitId?: string; userId?: string | null; refId?: string | null }) => `${e.unit ?? uk(e.unitId)}/${who(e.userId)}${e.refId ? `/${String(e.refId).slice(-4)}` : ""}`;
  const anAll = await rep("reportAnomalies", undefined, owner, TD, TD);
  const anRows: Any[] = anAll?.ok === true && Array.isArray(anAll.report?.rows) ? anAll.report.rows : [];
  const cmpRule = (rule: RuleId, exp: AnExp[], thresholds: Record<string, number> = AN_DEFAULTS[rule]): string[] => {
    const p: string[] = [];
    if (anAll?.ok !== true) return [`reportAnomalies → ${codeOf(anAll)} ${short(anAll?.message ?? "", 50)}`];
    const rows = anRows.filter((r) => r?.rule === rule);
    const want = new Map(exp.map((e) => [anKey(rule, U[e.unit]!, e.businessDate, e.userId, e.refId), e]));
    for (const r of rows) {
      const k = anKey(rule, r.unitId, r.businessDate ?? null, r.userId ?? null, r.refId ?? null);
      const e = want.get(k);
      if (!e) {
        p.push(`แถวเกิน ${anLbl(r)} value ${r.value} count ${r.count}`);
        continue;
      }
      want.delete(k);
      if (r.refType !== e.refType) p.push(`${anLbl(r)} refType ${r.refType} (คาด ${e.refType})`);
      if (r.value !== e.value) p.push(`${anLbl(r)} value ${r.value} (คาด ${e.value})`);
      if (r.count !== e.count) p.push(`${anLbl(r)} count ${r.count} (คาด ${e.count})`);
      if (canon(r.threshold) !== canon(thresholds)) p.push(`${anLbl(r)} threshold ${J(r.threshold)} (คาด ${J(thresholds)})`);
      if (e.userId && r.userName !== NAME[e.userId]) p.push(`${anLbl(r)} userName ${short(r.userName, 30)}`);
    }
    for (const e of want.values()) p.push(`ขาดแถว ${anLbl(e)} (value ${e.value} count ${e.count})`);
    return p;
  };
  const anCheck = (id: string, rule: RuleId, exp: AnExp[], missLabel: string, fixture: string[] = []) => {
    const p = [...[...fixture, ...(anSelf[rule] ?? [])].map((x) => `fixture ${x}`), ...cmpRule(rule, exp)];
    chk(id, !fx && p.length === 0, `${exp.length} แถวตามสเปก · ${missLabel} ไม่มี`, FX(NOTE() + (P8(p) || `ครบ (${exp.map(anLbl).join(" · ")})`)));
  };
  anCheck("AN1", "A1", [
    { rule: "A1", unit: "A", businessDate: TD, userId: M, refType: "USER", refId: null, value: 3000, count: 3 },
    { rule: "A1", unit: "A", businessDate: TD, userId: C, refType: "USER", refId: null, value: 52_000, count: 3 },
    { rule: "A1", unit: "B", businessDate: TD, userId: K, refType: "USER", refId: null, value: 100_000, count: 1 },
  ], "O (2 ใบ ฿999.99) · ผู้ขาย K ที่ A");
  anCheck("AN2", "A2", [
    { rule: "A2", unit: "A", businessDate: TD, userId: M, refType: "USER", refId: null, value: 3000, count: 3 },
    { rule: "A2", unit: "B", businessDate: TD, userId: O, refType: "USER", refId: null, value: 100_000, count: 1 },
  ], "K (2 ใบ ฿999.99) · ผู้ขาย C");
  {
    // ตัวอ้างอิงอิสระของ A3: แบบรายงานพนักงาน ต่อ (สาขา, ผู้ขาย) จากแถว PosSale ของวันนี้
    const today = RAW.filter((x) => bizDate(x.createdAt) === TD && x.sourceModule !== "POS_DEPOSIT");
    const agg = new Map<string, { unitId: string; userId: string; bills: number; disc: number; net: number }>();
    const rowOf = (unitId: string, userId: string | null) => {
      const k = `${unitId}|${userId ?? ""}`;
      const v = agg.get(k) ?? { unitId, userId: userId ?? "", bills: 0, disc: 0, net: 0 };
      agg.set(k, v);
      return v;
    };
    for (const x of today) {
      if (x.docType === "SALE" && x.status !== "VOIDED") {
        const r = rowOf(x.unitId, x.soldByUserId);
        r.bills += 1;
        r.disc += x.discountSatang;
        r.net += x.grandTotalSatang;
      } else if (x.docType === "REFUND") {
        const o = x.refSaleId ? raw(x.refSaleId) : undefined;
        rowOf(x.unitId, o?.soldByUserId ?? null).net -= x.grandTotalSatang;
      }
    }
    const exp: AnExp[] = [...agg.values()]
      .filter((r) => r.userId && r.net > 0 && r.disc * 10_000 > r.net * AN_DEFAULTS.A3.bp!)
      .map((r) => ({ rule: "A3" as const, unit: uk(r.unitId), businessDate: null, userId: r.userId, refType: "USER", refId: null, value: Math.round((r.disc * 10_000) / r.net), count: r.bills }));
    const p = cmpRule("A3", exp);
    const keys = exp.map((e) => `${e.unit}/${who(e.userId)}`).sort().join(",");
    if (keys !== "A/M,B/K") p.push(`ตัวอ้างอิง A3 = ${keys} (คาด A/M,B/K — fixture)`);
    if (exp.find((e) => e.unit === "B" && e.userId === K)?.value !== 1501) p.push("ตัวอ้างอิง K ที่ B ≠ 1501");
    chk("AN3", !fx && p.length === 0, "A/M + B/K (15.01%) · B/O 15.00% ไม่มี", FX(NOTE() + (P8(p) || `ครบ (${keys})`)));
  }
  anCheck("AN4", "A4", [{ rule: "A4", unit: "A", businessDate: TD, userId: M, refType: "PosSale", refId: DM1.saleId || null, value: 5000, count: 1 }], "บิลลด ฿99.99 (DM2)");
  anCheck("AN5", "A5", [{ rule: "A5", unit: "A", businessDate: TD, userId: M, refType: "USER", refId: null, value: 3, count: 3 }], "K (2 ครั้ง · 3 แถว)");
  anCheck("AN6", "A6", [{ rule: "A6", unit: "A", businessDate: TD, userId: O, refType: "USER", refId: null, value: 5, count: 5 }], "K (4) · M (บิลยกเลิก)");
  anCheck("AN7", "A7", [{ rule: "A7", unit: "A", businessDate: null, userId: null, refType: "PosSale", refId: C6a.saleId || null, value: 2, count: 2 }], "บิล DK (1 ครั้ง)");
  anCheck("AN8", "A8", [
    { rule: "A8", unit: "A", businessDate: TD, userId: M, refType: "PosShift", refId: SH.sh1 ?? null, value: 10_000, count: 1 },
    { rule: "A8", unit: "A", businessDate: TD, userId: O, refType: "PosShift", refId: SH.sh4 ?? null, value: 10_000, count: 1 },
  ], "sh2 (฿99.99) · sh3 (฿50) · กะระบบปิดไม่มีการนับ");
  anCheck("AN9", "A9", [{ rule: "A9", unit: "A", businessDate: null, userId: M, refType: "USER", refId: null, value: 19_999, count: 2 }], "K (1 กะ)");
  anCheck("AN10", "A10", [{ rule: "A10", unit: "A", businessDate: TD, userId: null, refType: "UNIT", refId: null, value: 3, count: 3 }], "B (2 ใบ)", ordSelf);

  // ════════ AN12 สิทธิ์ / PDPA / รูปแถว ════════
  const act = await loadActionsWithFakeSession();
  const sess = (a: { userId: string; role: string; unitAccess: string[]; permissions: Record<string, boolean> }) => {
    QC_SESSION = { userId: a.userId, tenantId: T, role: a.role, unitAccess: a.unitAccess, permissions: a.permissions };
  };
  const printAct = async (a: Any, input: Any) => {
    sess(a);
    const r = await call(act, "posReportPrintAction", { systemId: S.POS, ...input });
    QC_SESSION = null;
    return r;
  };
  {
    const p: string[] = [];
    const cv = await rep("reportAnomalies", undefined, cashView, TD, TD);
    if (!codeIs(cv, "PERMISSION_DENIED")) p.push(`พนักงาน view ไม่มี anomaly → ${codeOf(cv)}`);
    const cvA = await rep("reportAnomalies", "A", cashView, TD, TD);
    if (!codeIs(cvA, "PERMISSION_DENIED")) p.push(`พนักงาน view ระบุ A → ${codeOf(cvA)}`);
    const csv = await call(repMod, "reportCsv", rctx(), cashView, { kind: "anomalies", from: TD, to: TD });
    if (!codeIs(csv, "PERMISSION_DENIED")) p.push(`CSV พนักงาน view → ${codeOf(csv)}`);
    const pr = await printAct(cashView, { kind: "anomalies", from: TD, to: TD });
    if (!codeIs(pr, "PERMISSION_DENIED")) p.push(`print พนักงาน view → ${codeOf(pr)}`);
    const ao = await rep("reportAnomalies", undefined, anOnly, TD, TD);
    if (!codeIs(ao, "PERMISSION_DENIED")) p.push(`มี anomaly ไม่มี view → ${codeOf(ao)}`);
    for (const [lbl, a] of [["พนักงาน A (ทั้งสองคีย์)", cashAn], ["ผู้จัดการ A", mgrA]] as const) {
      const r = await rep("reportAnomalies", undefined, a, TD, TD);
      const rows: Any[] = r?.report?.rows ?? [];
      const wantN = anRows.filter((x) => x?.unitId === U.A).length;
      if (r?.ok !== true || rows.some((x) => x?.unitId !== U.A) || rows.length !== wantN || wantN === 0) p.push(`${lbl} → ${codeOf(r)} ${rows.length} แถว สาขา ${[...new Set(rows.map((x) => uk(x?.unitId)))].join(",")} (คาด A ${wantN})`);
    }
    const t2 = await call(repMod, "reportAnomalies", { tenantId: T, systemId: S.POSX }, owner, { from: TD, to: TD });
    if (!codeIs(t2, "NOT_FOUND")) p.push(`ระบบร้าน T2 → ${codeOf(t2)}`);
    const csvO = await call(repMod, "reportCsv", rctx(), owner, { kind: "anomalies", from: TD, to: TD });
    if (csvO?.ok !== true) p.push(`CSV เจ้าของ → ${codeOf(csvO)}`);
    else {
      const lines = parseCsv(String(csvO.body ?? "")).filter((r) => r.join("") !== "");
      if (J(lines[0]) !== J(repMod?.CSV_HEADERS?.anomalies) || lines.length !== anRows.length + 1) p.push(`CSV เจ้าของ ${lines.length - 1} แถว (คาด ${anRows.length}) หัว ${short(lines[0], 40)}`);
    }
    if (anAll?.ok === true) {
      const extra = [...new Set(anRows.flatMap((r) => Object.keys(r ?? {}).filter((k) => !(AN_ROW_KEYS as readonly string[]).includes(k))))];
      if (extra.length) p.push(`แถวมีคีย์นอกสัญญา ${extra.join(",")}`);
      if (anRows.some((r) => /@|\b0\d{8,9}\b/.test(J(r)))) p.push("แถวมีอีเมล/เบอร์โทร");
      const ord: string[][] = anRows.map((r) => [String(RULES.indexOf(r.rule)).padStart(2, "0"), String(r.unitId), String(r.businessDate ?? ""), String(r.userId ?? ""), String(r.refId ?? "")]);
      const bad = ord.findIndex((x, i) => {
        if (i === 0) return false;
        const y = ord[i - 1]!;
        for (let j = 0; j < 5; j++) {
          if (x[j]! > y[j]!) return false;
          if (x[j]! < y[j]!) return true;
        }
        return false;
      });
      if (bad >= 0) p.push(`ลำดับแถวผิดที่ ${bad} (${anRows[bad]?.rule} หลัง ${anRows[bad - 1]?.rule})`);
      const t = anAll.report.totals ?? {};
      const by: Record<string, number> = {};
      for (const r of RULES) by[r] = anRows.filter((x) => x?.rule === r).length;
      if (t.rowCount !== anRows.length || canon(t.byRule) !== canon(by)) p.push(`totals ${short(t, 120)} (คาด rowCount ${anRows.length} byRule ${J(by)})`);
      // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.12 fix 1) ▸ R1 F1: totals.unitNames = ชื่อสาขาของทุกหน่วยที่อยู่ในแถว (CSV/แบบพิมพ์ใช้แทนรหัส) ◂
      const wantNames = Object.fromEntries([...new Set(anRows.map((x) => String(x?.unitId)))].map((u) => [u, `${TAG} สาขา${uk(u)}`]));
      if (canon(t.unitNames) !== canon(wantNames)) p.push(`totals.unitNames ${short(t.unitNames, 100)} (คาด ${short(wantNames, 100)})`);
    }
    chk("AN12", !fx && p.length === 0, "สองคีย์ · ขอบเขตสาขา · คีย์แถวตามสัญญา · ลำดับ · totals", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.12 fix 1) ▸ AN13 (H1) ส่วนลดที่พนักงานคุมได้ ◂
  {
    const p: string[] = [];
    const rL = L1.saleId ? raw(L1.saleId) : undefined;
    const rQ = Q1.saleId ? raw(Q1.saleId) : undefined;
    const fxv = (x: Raw | undefined) => (x ? [x.subtotalSatang, x.discountSatang, x.grandTotalSatang, bizDate(x.createdAt)] : "ไม่มี");
    if (!rL || rL.subtotalSatang !== 10_000 || rL.discountSatang !== 0 || rL.grandTotalSatang !== 10_000 || bizDate(rL.createdAt) !== DA) p.push(`fixture L1 ${short(fxv(rL), 60)}`);
    if (!rQ || rQ.subtotalSatang !== 10_000 || rQ.discountSatang !== 6000 || rQ.grandTotalSatang !== 4000 || bizDate(rQ.createdAt) !== DA) p.push(`fixture Q1 ${short(fxv(rQ), 60)}`);
    const ld = L1.saleId ? ((await P.posSaleLine.aggregate({ where: { tenantId: T, saleId: L1.saleId }, _sum: { discountSatang: true } }).catch(() => null)) as Any) : null;
    if (ld?._sum?.discountSatang !== 10_000) p.push(`fixture L1 ส่วนลดบรรทัด ${ld?._sum?.discountSatang}`);
    const cr = Q1.saleId ? ((await P.couponRedemption.findMany({ where: { tenantId: T, status: { not: "RELEASED" }, OR: [{ saleId: Q1.saleId }, { refType: "PosSale", refId: Q1.saleId }] }, select: { discountSatang: true } }).catch(() => [])) as Any[]) : [];
    if (sum(cr.map((x) => Number(x.discountSatang))) !== 6000) p.push(`fixture Q1 คูปอง ${short(cr, 40)}`);
    const r = await rep("reportAnomalies", undefined, owner, DA, DA);
    if (r?.ok !== true) p.push(`reportAnomalies DA → ${codeOf(r)} ${short(r?.message ?? "", 50)}`);
    const rows: Any[] = r?.report?.rows ?? [];
    const a4 = rows.filter((x) => x?.rule === "A4");
    const l4 = a4.find((x) => x?.refId === L1.saleId);
    if (!l4 || l4.unitId !== U.B || l4.businessDate !== DA || l4.userId !== O || l4.refType !== "PosSale" || l4.value !== 5000 || l4.count !== 1) p.push(`A4 บิลลดบรรทัด 100% → ${short(l4 ?? "ไม่มีแถว", 90)} (คาด B/O/DA value 5000)`);
    if (a4.some((x) => x?.refId === Q1.saleId)) p.push("A4 บิลคูปองอย่างเดียว (Q1) ขึ้นแถว");
    if (a4.length !== 1) p.push(`A4 ${a4.length} แถว (คาด 1)`);
    const a3 = rows.filter((x) => x?.rule === "A3");
    const o3 = a3.find((x) => x?.unitId === U.B && x?.userId === O);
    // ตัวอ้างอิงอิสระ: ส่วนลดพนักงาน = 10000 (บรรทัด L1) + 0 (Q1 คูปองไม่นับ) · net แบบรายงานพนักงาน = 10000 + 4000
    const want3 = Math.round((10_000 * 10_000) / 14_000);
    if (!o3 || o3.value !== want3 || o3.count !== 2 || a3.length !== 1) p.push(`A3 O ที่ B → ${short(o3 ? { value: o3.value, count: o3.count } : "ไม่มีแถว", 60)} (คาด value ${want3} count 2) · A3 ${a3.length} แถว`);
    const other = rows.filter((x) => x?.rule !== "A3" && x?.rule !== "A4");
    if (other.length) p.push(`แถวกฎอื่นในวัน DA ${other.map((x) => x?.rule).join(",")}`);
    // ORACLE-ADD ผู้คุม 16 ต.ค. (P2.14 RPT-4) ▸ ครึ่งสมาชิก: บิลที่ส่วนลดเป็นสิทธิ์สมาชิกล้วน (M1 · วัน DM) ไม่ขึ้นแถว A4 และไม่ทำให้ O ที่ B ขึ้น A3 (ส่วนลดพนักงาน 0) ◂
    const rM = M1.saleId ? raw(M1.saleId) : undefined;
    if (!rM || rM.subtotalSatang !== 10_000 || rM.discountSatang !== 3000 || bizDate(rM.createdAt) !== DM) p.push(`fixture M1 ${short(fxv(rM), 60)}`);
    const rm = await rep("reportAnomalies", undefined, owner, DM, DM);
    const mRows: Any[] = rm?.ok === true ? (rm.report?.rows ?? []) : [];
    if (rm?.ok !== true) p.push(`reportAnomalies DM → ${codeOf(rm)}`);
    if (mRows.some((x) => x?.rule === "A4" && x?.refId === M1.saleId)) p.push("A4 บิลสิทธิ์สมาชิกล้วน (M1) ขึ้นแถว");
    if (mRows.some((x) => x?.rule === "A3" && x?.unitId === U.B && x?.userId === O)) p.push("A3 O ที่ B ขึ้นแถวจากส่วนลดสมาชิกล้วน (M1)");
    // ◂ ORACLE-ADD
    chk("AN13", !fx && p.length === 0, "A4 = L1 (ลดบรรทัด 100% · 5000) · Q1 คูปองอย่างเดียวไม่มี · A3 O/B 7143 × 2 บิล · M1 สมาชิกล้วนไม่ขึ้น A3/A4", FX(NOTE() + (P8(p) || "ครบ")));
  }
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.12 fix 1) ▸ AN14 (H2) ตัดแถวต่อกฎ + บรรทัดแจ้ง ◂
  {
    const p: string[] = [];
    const full = await rep("reportAnomalies", undefined, owner, DA, TD, { limit: 1000 });
    const fr: Any[] = full?.ok === true ? (full.report?.rows ?? []) : [];
    const ruleSet = RULES.filter((x) => fr.some((r) => r?.rule === x));
    const L = ruleSet.length;
    const a4n = fr.filter((r) => r?.rule === "A4").length;
    if (full?.ok !== true || L < 2 || !ruleSet.includes("A8") || a4n <= L) p.push(`fixture: ${codeOf(full)} กฎ ${ruleSet.join(",")} · A4 ${a4n} แถว (ต้อง > ${L}) · ${fr.length} แถว`);
    const lim = await rep("reportAnomalies", undefined, owner, DA, TD, { limit: Math.max(L, 1) });
    const lr: Any[] = lim?.ok === true ? (lim.report?.rows ?? []) : [];
    if (lim?.ok !== true) p.push(`limit ${L} → ${codeOf(lim)}`);
    if (lr.length > L) p.push(`${lr.length} แถว > limit ${L}`);
    const q = Math.ceil(L / Math.max(ruleSet.length, 1));
    for (const x of ruleSet) {
      const n = lr.filter((r) => r?.rule === x).length;
      if (n < 1 || n > q) p.push(`${x} ${n} แถว (คาด 1–${q})`);
    }
    if (!lr.some((r) => r?.rule === "A8")) p.push("A8 หายจากรายงานที่ตัดแถว");
    const keyOf = (r: Any) => anKey(String(r?.rule), String(r?.unitId), r?.businessDate ?? null, r?.userId ?? null, r?.refId ?? null);
    const idx = lr.map((r) => fr.findIndex((f) => keyOf(f) === keyOf(r)));
    if (idx.some((i, j) => i < 0 || (j > 0 && i <= idx[j - 1]!))) p.push(`แถวที่ตัดไม่ใช่ลำดับย่อยของรายงานเต็ม (${idx.join(",")})`);
    const lt = lim?.report?.totals ?? {};
    if (lt.rowCount !== fr.length || canon(lt.byRule) !== canon(full?.report?.totals?.byRule)) p.push(`totals ที่ตัด ${short({ rowCount: lt.rowCount, byRule: lt.byRule }, 100)} ≠ เต็ม ${fr.length}`);
    const notice = `แสดง ${lr.length} จาก ${fr.length} แถว`;
    const cr = callSync(repMod, "reportCsvRows", lim?.report);
    if (!Array.isArray(cr) || cr.length !== lr.length + 1 || J(cr[cr.length - 1]) !== J([notice])) p.push(`แถว CSV ท้าย ${short(Array.isArray(cr) ? cr[cr.length - 1] : cr, 60)} (คาด ["${notice}"])`);
    const cf = callSync(repMod, "reportCsvRows", full?.report);
    if (!Array.isArray(cf) || cf.length !== fr.length) p.push(`รายงานไม่ตัดมี ${Array.isArray(cf) ? cf.length : codeOf(cf)} แถว CSV (คาด ${fr.length} ไม่มีบรรทัดแจ้ง)`);
    const m = lim?.ok === true ? callSync(printMod, "buildReportPrint", lim.report, { locale: "th", generatedAt: "2026-10-01T05:06:07.000Z", shopName: "QC", unitLabel: "ทุกสาขา" }) : null;
    if (!isRecord(m) || m.notice !== notice || !Array.isArray(m.rows) || m.rows.length !== lr.length) p.push(`แบบพิมพ์ notice ${short(m?.notice, 40)} แถว ${Array.isArray(m?.rows) ? m.rows.length : "?"}`);
    else {
      const html = callSync(printMod, "renderReportPrintHtml", m);
      if (typeof html !== "string" || !html.includes(notice)) p.push("HTML แบบพิมพ์ไม่มีบรรทัดแจ้ง");
    }
    chk("AN14", !fx && p.length === 0, "ทุกกฎยังอยู่ (A8) · ≤ limit · ต่อกฎ ≤ ⌈limit/กฎ⌉ · บรรทัดแจ้ง CSV + แบบพิมพ์", FX(NOTE() + (P8(p) || `ครบ (limit ${L} · ${lr.length}/${fr.length})`)));
  }

  // ════════ AN11 ค่าตั้งเกณฑ์ ════════
  {
    const p: string[] = [];
    const TH = (s: Any) => callSync(setShared, "posAnomalyThresholds", s);
    const def = { enabled: true, rules: AN_DEFAULTS };
    if (canon(TH(undefined)) !== canon(def)) p.push(`ค่าปริยาย ${short(TH(undefined), 120)}`);
    if (J(setShared?.POS_ANOMALY_RULES) !== J(RULES)) p.push(`POS_ANOMALY_RULES ${short(setShared?.POS_ANOMALY_RULES, 60)}`);
    const clamp = TH({ pos: { reports: { anomaly: { enabled: false, rules: { A1: { count: 0, satang: 200_000_000 }, A3: { bp: 99_999 }, A4: { bp: -5 }, A6: { count: "7" }, A7: { count: 2.5 }, A9: { count: 7, extra: 1 }, AX: { count: 1 } } } } } });
    const wantClamp = { enabled: false, rules: { ...AN_DEFAULTS, A1: { count: AN_LIMITS.count![0], satang: AN_LIMITS.satang![1] }, A3: { bp: AN_LIMITS.bp![1] }, A4: { bp: AN_LIMITS.bp![0] }, A9: { count: 7 } } };
    if (canon(clamp) !== canon(wantClamp)) p.push(`ตัดช่วง ${short(clamp, 160)}`);
    if (TH({ pos: { reports: { anomaly: { enabled: "no" } } } })?.enabled !== true) p.push("enabled ไม่ใช่ boolean ≠ true");
    const settingsNow = async (): Promise<Any> => (await P.appSystem.findUnique({ where: { id: S.POS || "-" }, select: { settings: true } }).catch(() => null))?.settings ?? null;
    const audits = async () => Number(await P.auditLog.count({ where: { tenantId: T || "-", action: "pos.settings.updated" } }).catch(() => -1));
    const upd = (actor: Any, patch: Any) => (fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(genMod, "updatePosGeneralSettings", posCtx, actor, patch));
    const a0 = await audits();
    const w1 = await upd(owner, { anomaly: { rules: { A3: { bp: 1400 } } } });
    if (w1?.ok !== true || canon(w1.general?.anomaly) !== canon({ enabled: true, rules: { ...AN_DEFAULTS, A3: { bp: 1400 } } })) p.push(`A3 1400 → ${codeOf(w1)} general.anomaly ${short(w1?.general?.anomaly, 80)}`);
    const s1 = await settingsNow();
    if (s1?.pos?.reports?.anomaly?.rules?.A3?.bp !== 1400) p.push(`เก็บที่ settings.pos.reports.anomaly ${short(s1?.pos?.reports, 80)}`);
    const a1n = await audits();
    if (a1n !== a0 + 1) p.push(`audit ${a0} → ${a1n} (คาด +1)`);
    const last = ((await P.auditLog.findMany({ where: { tenantId: T || "-", action: "pos.settings.updated" }, orderBy: { createdAt: "desc" }, take: 1 }).catch(() => [])) as Any[])[0];
    if (last?.after?.section !== "general" || last?.after?.anomaly?.rules?.A3?.bp !== 1400 || last?.targetId !== S.POS) p.push(`audit after ${short(last?.after, 80)}`);
    const flip = await rep("reportAnomalies", undefined, owner, TD, TD);
    const a3 = ((flip?.report?.rows ?? []) as Any[]).filter((r) => r?.rule === "A3").map((r) => `${uk(r.unitId)}/${who(r.userId)}`).sort().join(",");
    if (a3 !== "A/M,B/K,B/O") p.push(`A3 1400 → แถว ${a3 || "—"} (คาด A/M,B/K,B/O)`);
    const oRow = ((flip?.report?.rows ?? []) as Any[]).find((r) => r?.rule === "A3" && r.userId === O);
    if (oRow && (oRow.value !== 1500 || canon(oRow.threshold) !== canon({ bp: 1400 }))) p.push(`B/O value ${oRow.value} threshold ${J(oRow.threshold)}`);
    const same = await upd(owner, { anomaly: { rules: { A3: { bp: 1400 } } } });
    if (same?.ok !== true || (await audits()) !== a1n) p.push(`ค่าเดิม → ${codeOf(same)} audit ${await audits()} (คาด ${a1n})`);
    const fp = canon((await settingsNow())?.pos);
    const bad: [Any, string][] = [
      [{ anomaly: { rules: { A3: { bp: 0 } } } }, "anomaly.rules.A3.bp"],
      [{ anomaly: { rules: { A1: { count: 1001 } } } }, "anomaly.rules.A1.count"],
      [{ anomaly: { rules: { A1: { count: 2.5 } } } }, "anomaly.rules.A1.count"],
      [{ anomaly: { rules: { A8: { satang: 0 } } } }, "anomaly.rules.A8.satang"],
      [{ anomaly: { rules: { A3: { count: 3 } } } }, "anomaly.rules.A3.count"],
      [{ anomaly: { rules: { A12: { count: 3 } } } }, "anomaly.rules.A12"], // ORACLE-EDIT ผู้คุม POS 17 ต.ค. (P3.9 R11): กฎที่ไม่รู้จัก = A12 (A11 เป็นกฎจริงแล้ว) — เดิม A11
      [{ anomaly: { enabled: "yes" } }, "anomaly.enabled"],
      [{ anomaly: { foo: 1 } }, "anomaly.foo"],
      [{ anomaly: [] }, "anomaly"],
    ];
    for (const [patch, field] of bad) {
      const r = await upd(owner, patch);
      if (!codeIs(r, "VALIDATION") || r.field !== field) p.push(`${J(patch).slice(0, 50)} → ${codeOf(r)}@${r?.field} (คาด VALIDATION@${field})`);
    }
    if (canon((await settingsNow())?.pos) !== fp || (await audits()) !== a1n) p.push("คำปฏิเสธเขียน settings/audit");
    const den = await upd(mgrA, { anomaly: { rules: { A3: { bp: 1500 } } } });
    if (!codeIs(den, "PERMISSION_DENIED")) p.push(`ผู้จัดการ A → ${codeOf(den)}`);
    const w2 = await upd(owner, { anomaly: { rules: { A3: { bp: 1600 } } } });
    const r2 = await rep("reportAnomalies", undefined, owner, TD, TD);
    const a3b = ((r2?.report?.rows ?? []) as Any[]).filter((r) => r?.rule === "A3").map((r) => `${uk(r.unitId)}/${who(r.userId)}`).sort().join(",");
    if (w2?.ok !== true || a3b !== "A/M") p.push(`A3 1600 → ${codeOf(w2)} แถว ${a3b || "—"} (คาด A/M)`);
    const cut = await upd(owner, { dayCutoffMinutes: 30 });
    const s2 = await settingsNow();
    if (cut?.ok !== true || s2?.pos?.reports?.dayCutoffMinutes !== 30 || s2?.pos?.reports?.anomaly?.rules?.A3?.bp !== 1600) p.push(`ตั้ง cutoff 30 ทับ anomaly ${short(s2?.pos?.reports, 80)}`);
    const back = await upd(owner, { anomaly: { rules: { A3: { bp: 1500 } } }, dayCutoffMinutes: 0 });
    const s3 = await settingsNow();
    if (back?.ok !== true || s3?.pos?.reports?.dayCutoffMinutes !== 0 || s3?.pos?.reports?.anomaly?.rules?.A3?.bp !== 1500) p.push(`คืนค่า ${codeOf(back)} ${short(s3?.pos?.reports, 80)}`);
    const off = await upd(owner, { anomaly: { enabled: false } });
    const r3 = await rep("reportAnomalies", undefined, owner, TD, TD);
    if (off?.ok !== true || r3?.ok !== true || (r3.report?.rows ?? [1]).length !== 0) p.push(`enabled false → ${codeOf(off)} / ${codeOf(r3)} ${(r3?.report?.rows ?? []).length} แถว (คาด 0)`);
    const on = await upd(owner, { anomaly: { enabled: true } });
    if (on?.ok !== true || canon(on.general?.anomaly) !== canon(def)) p.push(`เปิดคืน ${codeOf(on)} ${short(on?.general?.anomaly, 60)}`);
    chk("AN11", !fx && p.length === 0, "ตัวอ่านตัดช่วง · ตัวเขียนรวมทับ + audit · ปฏิเสธไม่เขียน · เกณฑ์มีผลกับแถว", FX(NOTE() + (P8(p) || "ครบ")));
  }

  // ════════ HR รายชั่วโมง ════════
  type HrW = { hour: number; billCount: number; netSalesSatang: number; forecastSatang: number };
  const hrRows = (start: number, spec: HrW[]): HrW[] => Array.from({ length: 24 }, (_, i) => spec.find((x) => x.hour === start + i) ?? { hour: start + i, billCount: 0, netSalesSatang: 0, forecastSatang: 0 });
  const H0 = hrRows(0, [
    { hour: 9, billCount: 2, netSalesSatang: 25_000, forecastSatang: 5001 },
    { hour: 13, billCount: 1, netSalesSatang: 20_000, forecastSatang: 5000 },
    { hour: 14, billCount: 0, netSalesSatang: -10_000, forecastSatang: 0 },
  ]);
  const H240 = hrRows(4, [
    { hour: 9, billCount: 2, netSalesSatang: 25_000, forecastSatang: 5001 },
    { hour: 13, billCount: 1, netSalesSatang: 20_000, forecastSatang: 5000 },
    { hour: 14, billCount: 0, netSalesSatang: -10_000, forecastSatang: 0 },
    { hour: 26, billCount: 1, netSalesSatang: 10_000, forecastSatang: 2000 },
  ]);
  const setCut = (m: number) => (fx ? Promise.resolve({ ok: false, code: "FIXTURE" }) : call(genMod, "updatePosGeneralSettings", posCtx, owner, { dayCutoffMinutes: m }));
  const hr0 = await rep("reportHourly", "A", owner, DH, DH);
  const hrAll0 = await rep("reportHourly", undefined, owner, DH, DH);
  const d0 = await rep("reportDailySales", "A", owner, DH, DH);
  const c240 = await setCut(240);
  const hr240 = await rep("reportHourly", "A", owner, DH, DH);
  const d240 = await rep("reportDailySales", "A", owner, DH, DH);
  const c0 = await setCut(0);
  {
    const p: string[] = [];
    if (c240?.ok !== true || c0?.ok !== true) p.push(`ตั้ง cutoff → ${codeOf(c240)}/${codeOf(c0)}`);
    const cmpH = (lbl: string, r: Any, want: HrW[], keys: readonly string[]) => {
      if (r?.ok !== true) return void p.push(`${lbl}: ${codeOf(r)} ${short(r?.message ?? "", 40)}`);
      const rows: Any[] = r.report?.rows ?? [];
      if (rows.length !== 24) return void p.push(`${lbl}: ${rows.length} แถว (คาด 24)`);
      rows.forEach((g, i) => {
        const w = want[i]!;
        const lab = String(w.hour % 24).padStart(2, "0");
        if (g?.hour !== w.hour || g?.label !== lab) p.push(`${lbl} แถว ${i} hour ${g?.hour} label ${g?.label} (คาด ${w.hour}/${lab})`);
        for (const k of keys) if (g?.[k] !== (w as Any)[k]) p.push(`${lbl} ${lab}.${k} ${g?.[k]} (คาด ${(w as Any)[k]})`);
      });
      const miss = HR_ROW_KEYS.filter((k) => !(k in (rows[0] ?? {})));
      if (miss.length) p.push(`${lbl} ไม่มีคีย์ ${miss.join(",")}`);
    };
    cmpH("cutoff 0", hr0, H0, ["billCount", "netSalesSatang"]);
    cmpH("cutoff 240", hr240, H240, ["billCount", "netSalesSatang"]);
    for (const [lbl, h, d, want] of [["cutoff 0", hr0, d0, 35_000], ["cutoff 240", hr240, d240, 45_000]] as const) {
      const net = h?.report?.totals?.netSalesSatang;
      if (h?.ok === true && (net !== d?.report?.totals?.netSalesSatang || net !== want || h.report.totals.billCount !== d?.report?.totals?.billCount)) p.push(`${lbl} totals ${net}/${h.report.totals.billCount} ≠ รายวัน ${d?.report?.totals?.netSalesSatang}/${d?.report?.totals?.billCount} (คาด ${want})`);
    }
    const h9 = (hrAll0?.report?.rows ?? []).find((x: Any) => x?.hour === 9);
    if (hrAll0?.ok !== true || h9?.billCount !== 3 || h9?.netSalesSatang !== 32_000) p.push(`ทุกสาขา 09 → ${codeOf(hrAll0)} ${short(h9, 80)} (คาด 3 บิล ฿320)`);
    chk("HR1", !fx && fxSelf.length === 0 && p.length === 0, "24 ชั่วโมงธุรกิจ · cutoff เลื่อนชั่วโมง · Σ = รายวัน", FX(NOTE() + FXS() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    const fc = (lbl: string, r: Any, want: HrW[]) => {
      if (r?.ok !== true) return void p.push(`${lbl}: ${codeOf(r)}`);
      const rows: Any[] = r.report?.rows ?? [];
      want.forEach((w, i) => {
        if (rows[i]?.forecastSatang !== w.forecastSatang) p.push(`${lbl} ${String(w.hour % 24).padStart(2, "0")} forecast ${rows[i]?.forecastSatang} (คาด ${w.forecastSatang})`);
      });
      const s = sum(want.map((w) => w.forecastSatang));
      if (r.report?.totals?.forecastSatang !== s) p.push(`${lbl} totals.forecastSatang ${r.report?.totals?.forecastSatang} (คาด ${s})`);
    };
    fc("cutoff 0", hr0, H0);
    fc("cutoff 240", hr240, H240);
    // ตัวควบคุมบวกของคำตอบคาดการณ์/ยอดรายชั่วโมง: คิดเองจากแถว PosSale ดิบของสาขา A
    const netAt = (day: string, cutoff: number) => {
      const m = new Map<number, { bills: number; net: number }>();
      for (const x of RAW) {
        if (x.unitId !== U.A || x.sourceModule === "POS_DEPOSIT" || bizDate(x.createdAt, cutoff) !== day) continue;
        if (x.docType === "SALE" && x.status === "VOIDED") continue;
        const h = Math.floor((x.createdAt.getTime() + BKK_MS - Date.parse(`${day}T00:00:00Z`)) / 3_600_000);
        const v = m.get(h) ?? { bills: 0, net: 0 };
        if (x.docType === "REFUND") v.net -= x.grandTotalSatang;
        else {
          v.bills += 1;
          v.net += x.grandTotalSatang;
        }
        m.set(h, v);
      }
      return m;
    };
    for (const [cut, want] of [[0, H0], [240, H240]] as const) {
      const today = netAt(DH, cut);
      const weeks = [1, 2, 3, 4].map((k) => netAt(addDays(DH, -7 * k), cut));
      for (const w of want) {
        const f = Math.round(sum(weeks.map((m) => m.get(w.hour)?.net ?? 0)) / 4);
        const t = today.get(w.hour) ?? { bills: 0, net: 0 };
        if (f !== w.forecastSatang || t.net !== w.netSalesSatang || t.bills !== w.billCount) p.push(`fixture ตัวอ้างอิง cutoff ${cut} ชั่วโมง ${w.hour}: แถวดิบ ${t.bills}/${t.net}/${f} ≠ สเปก ${w.billCount}/${w.netSalesSatang}/${w.forecastSatang}`);
      }
    }
    const ok31 = await rep("reportHourly", "A", owner, addDays(DH, -30), DH);
    const v32 = await rep("reportHourly", "A", owner, addDays(DH, -31), DH);
    if (ok31?.ok !== true || !codeIs(v32, "VALIDATION")) p.push(`31 วัน ${codeOf(ok31)} · 32 วัน ${codeOf(v32)} (คาด OK / VALIDATION)`);
    const ov = await call(ovMod, "reportOverview", rctx("A"), owner, { from: DH, to: DH });
    if (ov?.ok !== true || ov.overview?.hourly?.ok !== true || noGen(ov.overview.hourly.data) !== noGen(hr0?.report)) p.push(`ภาพรวม hourly → ${codeOf(ov)} ${codeOf(ov?.overview?.hourly)}`);
    const ovL = await call(ovMod, "reportOverview", rctx("A"), owner, { from: addDays(DH, -31), to: DH });
    if (ovL?.ok !== true || !codeIs(ovL.overview?.hourly, "VALIDATION") || ovL.overview?.chart?.ok !== true) p.push(`ภาพรวม 32 วัน hourly ${codeOf(ovL?.overview?.hourly)} chart ${codeOf(ovL?.overview?.chart)}`);
    const csv = await call(repMod, "reportCsv", rctx("A"), owner, { kind: "hourly", from: DH, to: DH });
    if (csv?.ok !== true) p.push(`CSV hourly → ${codeOf(csv)}`);
    else {
      const lines = parseCsv(String(csv.body ?? "")).filter((r) => r.join("") !== "");
      if (J(lines[0]) !== J(repMod?.CSV_HEADERS?.hourly) || lines.length !== 26 || lines[25]?.[0] !== "รวม") p.push(`CSV hourly ${lines.length} บรรทัด (คาด หัว + 24 + รวม)`);
    }
    chk("HR2", !fx && fxSelf.length === 0 && p.length === 0, "คาดการณ์ 4 สัปดาห์ ครึ่งขึ้น · 31/32 วัน · ภาพรวม · CSV", FX(NOTE() + FXS() + (P8(p) || "ครบ")));
  }

  // ════════ PD แบบพิมพ์ ════════
  const GEN = "2026-10-01T05:06:07.000Z";
  const SHOP = `ร้าน <b>&"QC'`;
  const OPTS = (locale: string, generatedAt = GEN) => ({ locale, generatedAt, shopName: SHOP, unitLabel: "ทุกสาขา" });
  const rangeOf = (k: string) => (k === "anomalies" || k === "shifts" ? [TD, TD] : k === "hourly" ? [DH, DH] : [D0, D0]);
  const kindsNow: string[] = Array.isArray(repMod?.REPORT_KINDS) ? [...repMod.REPORT_KINDS] : [...ALL_KINDS];
  const reports: Record<string, Any> = {};
  {
    const p: string[] = [];
    if (J([...kindsNow].sort()) !== J([...ALL_KINDS].sort())) p.push(`REPORT_KINDS ${kindsNow.join(",")} (คาด 12 ชนิด)`); // ORACLE-EDIT ผู้คุม 16 ต.ค. (P3.5 R11): เดิม "คาด 11 ชนิด"
    for (const k of ALL_KINDS) {
      const [from, to] = rangeOf(k);
      const r = await rep(KIND_FN[k]!, undefined, owner, from!, to!, { limit: 1000 });
      if (r?.ok !== true) {
        p.push(`${k}: ${codeOf(r)}`);
        continue;
      }
      reports[k] = r.report;
      const m = callSync(printMod, "buildReportPrint", r.report, OPTS("th"));
      if (!isRecord(m) || m.ok === false) {
        p.push(`${k}: buildReportPrint ${codeOf(m)} ${short(m?.message ?? "", 40)}`);
        continue;
      }
      for (const [key, v] of [["kind", k], ["from", from], ["to", to], ["locale", "th"], ["generatedAt", GEN], ["shopName", SHOP], ["unitLabel", "ทุกสาขา"]] as const) if (m[key] !== v) p.push(`${k}.${key} ${short(m[key], 30)}`);
      if (typeof m.title !== "string" || !THAI.test(m.title)) p.push(`${k}.title th ${short(m.title, 30)}`);
      const heads = repMod?.CSV_HEADERS?.[k];
      if (J(m.headers) !== J(heads)) p.push(`${k}.headers ≠ CSV_HEADERS`);
      const csv = await call(repMod, "reportCsv", rctx(), owner, { kind: k, from, to });
      if (csv?.ok !== true) p.push(`${k}: CSV ${codeOf(csv)}`);
      else {
        const lines = parseCsv(String(csv.body ?? "")).filter((x) => x.join("") !== "");
        const mrows: Any[] = Array.isArray(m.rows) ? m.rows : [];
        const body = lines.slice(1);
        if (mrows.length !== body.length) p.push(`${k}: model ${mrows.length} แถว ≠ CSV ${body.length}`);
        else {
          const bad = mrows.findIndex((row, i) => !Array.isArray(row) || J(row.map((c: unknown) => String(c))) !== J(body[i]));
          if (bad >= 0) p.push(`${k}: แถว ${bad} ${short(mrows[bad], 60)} ≠ CSV ${short(body[bad], 60)}`);
        }
      }
      const e = callSync(printMod, "buildReportPrint", r.report, OPTS("en"));
      if (!isRecord(e) || typeof e.title !== "string" || !e.title.trim() || THAI.test(e.title) || e.title === m.title) p.push(`${k}: en title ${short(e?.title, 30)}`);
      else if (!Array.isArray(e.headers) || e.headers.length !== (Array.isArray(m.headers) ? m.headers.length : -1) || !Array.isArray(e.rows) || e.rows.length !== (Array.isArray(m.rows) ? m.rows.length : -1)) p.push(`${k}: en หัว/แถวไม่เท่า th`);
    }
    chk("PD1", !fx && p.length === 0, "12 ชนิด: model = CSV_HEADERS + แถว CSV · th/en", FX(NOTE() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    for (const k of ["daily", "anomalies", "branches"]) {
      const r = reports[k];
      if (!r) {
        p.push(`${k}: ไม่มีรายงาน`);
        continue;
      }
      const h = (rr: Any, o: Any) => {
        const m = callSync(printMod, "buildReportPrint", rr, o);
        const x = callSync(printMod, "renderReportPrintHtml", m);
        return typeof x === "string" ? x : "";
      };
      const h1 = h(r, OPTS("th"));
      if (!h1) {
        p.push(`${k}: renderReportPrintHtml ไม่คืนข้อความ (${codeOf(callSync(printMod, "renderReportPrintHtml", {}))})`);
        continue;
      }
      if (sha(h(r, OPTS("th"))) !== sha(h1)) p.push(`${k}: สร้างสองครั้ง sha ต่างกัน`);
      if (sha(h({ ...r, generatedAt: "2000-01-01T00:00:00.000Z" }, OPTS("th"))) !== sha(h1)) p.push(`${k}: report.generatedAt เปลี่ยน → sha เปลี่ยน (ต้องใช้ opts.generatedAt)`);
      if (sha(h(r, OPTS("th", "2026-10-02T00:00:00.000Z"))) === sha(h1)) p.push(`${k}: opts.generatedAt เปลี่ยน → sha เดิม`);
      if (h1.includes("<b>") || !h1.includes("&lt;b&gt;") || !h1.includes("&amp;")) p.push(`${k}: ชื่อร้านไม่ถูก escape`);
      if (!/@page/.test(h1) || !/A4/.test(h1)) p.push(`${k}: ไม่มี @page/A4`);
      if (/<script/i.test(h1)) p.push(`${k}: มี <script`);
      const heads: string[] = repMod?.CSV_HEADERS?.[k] ?? [];
      const missH = heads.filter((x) => !h1.includes(x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")));
      if (!heads.length || missH.length) p.push(`${k}: ไม่มีหัว ${missH.slice(0, 3).join(",")}`);
      if (k !== "anomalies" && !h1.includes("รวม")) p.push(`${k}: ไม่มีแถว "รวม"`);
    }
    chk("PD2", !fx && p.length === 0, "HTML กำหนดได้ (sha) · generatedAt จาก opts · escape · A4 · ไม่มีสคริปต์", FX(NOTE() + (P8(p) || "ครบ")));
  }
  {
    const p: string[] = [];
    if (typeof act?.posReportPrintAction !== "function") p.push("โหลด posReportPrintAction ไม่ได้ (report-actions + session ปลอม)");
    const np = await printAct(cashSell, { kind: "daily", from: D0, to: D0 });
    if (!codeIs(np, "PERMISSION_DENIED")) p.push(`พนักงานไม่มีสิทธิ์รายงาน → ${codeOf(np)}`);
    const dv = await printAct(cashView, { kind: "daily", from: D0, to: D0, locale: "th" });
    const heads: string[] = repMod?.CSV_HEADERS?.daily ?? [];
    if (dv?.ok !== true || typeof dv.html !== "string" || !heads.length || heads.some((x) => !dv.html.includes(x)) || /<script/i.test(dv.html)) p.push(`พนักงาน view daily → ${codeOf(dv)} ${typeof dv?.html}`);
    const ao = await printAct(owner, { kind: "anomalies", from: TD, to: TD, locale: "th" });
    if (ao?.ok !== true || typeof ao.html !== "string" || !ao.html.length) p.push(`เจ้าของ anomalies → ${codeOf(ao)}`);
    const bk = await printAct(owner, { kind: "nope", from: D0, to: D0 });
    if (!codeIs(bk, "VALIDATION")) p.push(`kind แปลก → ${codeOf(bk)}`);
    chk("PD3", !fx && p.length === 0, "action ตัดสินสิทธิ์จาก session · anomalies สองคีย์ · kind แปลก VALIDATION", FX(NOTE() + (P8(p) || "ครบ")));
  }
  // ORACLE-ADD ผู้คุม 15 ต.ค. (P2.12 fix 1) ▸ PD4 (H3 หัวสาขาของผู้มีขอบเขต · H4 เครื่องหมาย A8) ◂
  {
    const p: string[] = [];
    const nameA = `${TAG} สาขาA`;
    const metaOf = (html: unknown) => /<div class="meta">([\s\S]*?)<\/div>/.exec(typeof html === "string" ? html : "")?.[1] ?? "";
    for (const [kind, from, to] of [["anomalies", TD, TD], ["daily", D0, D0]] as const) {
      const r = await printAct(mgrA, { kind, from, to, locale: "th" });
      const mt = metaOf(r?.html);
      if (r?.ok !== true || !mt.includes(`สาขา ${nameA}`) || mt.includes("ทุกสาขา")) p.push(`ผู้จัดการ A ${kind} → ${codeOf(r)} หัว "${short(mt, 90)}" (คาด สาขา ${nameA})`);
    }
    const ow = await printAct(owner, { kind: "daily", from: D0, to: D0, locale: "th" });
    if (ow?.ok !== true || !metaOf(ow.html).includes("สาขา ทุกสาขา")) p.push(`เจ้าของ daily → ${codeOf(ow)} หัว "${short(metaOf(ow?.html), 60)}" (คาด ทุกสาขา)`);
    const csv = await call(repMod, "reportCsv", rctx(), owner, { kind: "anomalies", from: TD, to: TD });
    const lines = csv?.ok === true ? parseCsv(String(csv.body ?? "")).filter((r) => r.join("") !== "") : [];
    const cell = (refId: string | undefined) => lines.find((l) => l[0] === "A8" && !!refId && l[6] === refId)?.[7];
    if (cell(SH.sh1) !== "ขาด −100.00") p.push(`CSV A8 sh1 "${cell(SH.sh1)}" (คาด "ขาด −100.00")`);
    if (cell(SH.sh4) !== "เกิน +100.00") p.push(`CSV A8 sh4 "${cell(SH.sh4)}" (คาด "เกิน +100.00")`);
    const pa = await printAct(owner, { kind: "anomalies", from: TD, to: TD, locale: "th" });
    if (pa?.ok !== true || !String(pa.html).includes("ขาด −100.00") || !String(pa.html).includes("เกิน +100.00")) p.push(`แบบพิมพ์ anomalies ไม่มีเครื่องหมาย A8 (${codeOf(pa)})`);
    chk("PD4", !fx && p.length === 0, "หัวสาขา = ขอบเขตของผู้จัดการ A · เจ้าของ ทุกสาขา · A8 ขาด −/เกิน +", FX(NOTE() + (P8(p) || "ครบ")));
  }
  await drain();
  if (notes.length) console.log(`  ℹ️  fixture ${notes.length} รายการ: ${notes.slice(0, 6).join(" | ")}`);
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งร้าน ═════════════════════════
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
/** ลายนิ้วมือของตารางที่ P2.12 แตะ ของร้านที่ไม่ใช่ร้านชั่วคราว P2.12 (ทุกรอบ) */
async function othersFingerprint(): Promise<string> {
  const notTemp = `NOT EXISTS (SELECT 1 FROM "Tenant" t WHERE t.id = x."tenantId" AND t.slug LIKE 'posqc-p212-%')`;
  const one = async (tb: string, agg: string, extra = "") => {
    try {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n, ${agg} AS m FROM "${tb}" x WHERE ${notTemp}${extra}`)) as Any[];
      return `${tb}:${r[0]?.n ?? "?"}@${r[0]?.m ?? "?"}`;
    } catch (e) {
      return `${tb}:err ${(e as Error).message.slice(0, 40)}`;
    }
  };
  return [
    await one("PosSale", `coalesce(sum(x."grandTotalSatang"), 0)::text`),
    await one("PosShift", `coalesce(max(x."openedAt")::text, '-')`),
    await one("PosOrder", `coalesce(max(x."updatedAt")::text, '-')`),
    await one("AppSystem", `coalesce(md5(string_agg(x.settings::text, '|' ORDER BY x.id)), '-')`, ` AND x.type = 'POS'`),
  ].join(" · ");
}

// ═════════════════════════ 7. รัน ═════════════════════════
const fpBefore = await othersFingerprint();
let crashed = "";
const wipes: WipeReport[] = [];
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
const mustTables = ["PosSale", "PosSaleLine", "PosPayment", "PosShift", "PosShiftRecount", "PosOrder", "PosDeposit", "PosDepositTxn", "PosReceiptCounter", "SalesChannel", "OutboxEvent", "AuditLog", "AppSystem", "AccountJournalEntry"];
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
  await n("posSale", () => P.posSale.count({ where: { idempotencyKey: { contains: RAND } } }));
  await n("posDevice", () => P.posDevice.count({ where: { deviceCode: { contains: `qc212${RAND}` } } }));
  await n("posProduct", () => P.posProduct.count({ where: { name: { contains: RAND } } }));
  await n("salesChannel", () => P.salesChannel.count({ where: { name: { contains: RAND } } }));
  await n("posOrder", () => P.posOrder.count({ where: { externalRef: { contains: `qc212${RAND}` } } }));
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
// นอกขอบเขต P2.12 (S): จอ 08/12 + ปุ่ม PDF + หน้า pos/reports/print (P2.12U — ภาพของผู้คุมงาน · หน้า print เรียก posReportPrintAction) ·
//   PDF จริง (page.pdf → pdftotext/pdfinfo = CONTROLLER-RUN ที่จุด merge) · โอนสองขั้น/สต็อกต่อ location (การ์ด P2.12T) ·
//   ลิ้นชักเปิดโดยไม่ขาย (ไม่มีบันทึก — HF-FU2 ถ้าเจ้าของต้องการ) · API รายงาน (P2.13) · qc-hf-pos-page-authz แถวหน้า print (ORACLE-EDIT ใน U)
