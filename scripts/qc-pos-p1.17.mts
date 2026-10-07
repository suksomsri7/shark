// QC — POS RUN ใบ P1.17 S: รายงานพื้นฐาน 7 ชุด + การ์ดภาพรวม + CSV (ฝั่งเซิร์ฟเวอร์) · เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ
// requires: pos-seed
//
// สัญญา: ledger/pos-briefs/pos-brief-P1.17.md (มติร่าง R1–R16 · คำถามเจ้าของ Q17.1–Q17.4 ใช้ค่าปริยายในไฟล์นี้) · pos-brief-COMMON · pos-brief-LANE-RULES
//        pos-brief-P1.6 §7–§9 (VAT เก็บที่บิล · ทิปอยู่นอก grandTotal · ค่าบริการอยู่ใน grandTotal) · pos-brief-P1.9 (Z แช่แข็ง)
//        โน้ต: ledger/wo-notes/pos-P1.17-oracle.md (รายการข้อ · ผลที่คาดบนฐาน · ชื่อที่ตั้งใหม่ · ความคลาดเคลื่อน)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้ และลงทะเบียนในโน้ต — ผู้คุมงานต้องรับรองก่อนผู้สร้างเริ่ม · ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P1.17 S ต้องส่ง (ย่อจาก brief §2):
//   src/lib/modules/pos/reports.ts (อ่านอย่างเดียว · คืนคำปฏิเสธ {ok:false, code, message} ไม่ throw · (ctx, actor, input, client?)):
//     reportDailySales · reportProducts · reportStaff · reportPayments · reportMargin · reportShifts · reportTax · reportCsv · posDashboardCard
//     ctx = { tenantId, systemId, unitId? } · actor = RegisterActor · input = { from, to } (YYYY-MM-DD วันธุรกิจเวลาไทย · รวมปลายทั้งสอง · ≤ 92 วัน)
//   src/lib/modules/pos/report-actions.ts ("use server"): posReportAction · posReportCsvAction · posDashboardCardAction
//   สิทธิ์ pos.report.view (การ์ดใช้ pos.sale.create ตามหน้าภาพรวมเดิม) · PosSale.soldByUserId String? (เพิ่มล้วน · หน้าขายเขียน actor.userId)
//
// ข้อมูลทดสอบ: ข้อสอบ "เขียนแถวเอง" (PosSale/Line/Payment/PosShift/InvItem/InvMovement) ในสาขา sandbox แล้วคำนวณคำตอบเองจากสเปกของแถว
//   ⇒ ตัวเลขทุกตัวที่เทียบมาจากการคำนวณของข้อสอบ ไม่ใช่จากโค้ดที่ถูกสอบ · ตัวเลขในหัวข้อ (เช่น 55,450) = ค่าที่ข้อสอบคำนวณได้ (F1 ยืนยัน)
//   วัน D1 = 2026-09-14 · D2 = 2026-09-15 (เวลาไทย) · บิลข้ามเที่ยงคืนไทย 23:59:30 / 00:00:30 · บิล 06:30 ไทย (= วันก่อนตาม UTC)
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p1.9): SKIP เมื่อของ P1.17 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (ต้องแดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id โดยไม่แตะ DB · --no-db = รันเฉพาะข้อสถิต (ST1–ST6) ไม่โหลด env/prisma (exit 1 ถ้าแดง)
//    ตาราง/คอลัมน์ตรวจจาก Prisma DMMF + information_schema · ก่อนเขียนแถวแรกต้องเป็น host ep-frosty-lab (QC4) เท่านั้น
//    แถวชั่วคราวติดป้าย `qc-p1.17-<rand>` ในร้าน QC กาแฟ (สาขา sandbox 3 · ระบบ POS 2 + คลัง 1) · ลบทั้งหมดใน finally · Z1/Z2 ตรวจคืนสภาพ
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SUITE = "qc-pos-p1.17";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: "-" = เชิงหน้าที่ล้วน · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน (POS-MASTER-PLAN §3)
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P1.17-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต (ไม่แตะ DB) ──
  D("ST1", "-", "[static · R1] src/lib/modules/pos/reports.ts export ครบ 9: reportDailySales reportProducts reportStaff reportPayments reportMargin reportShifts reportTax reportCsv posDashboardCard"),
  D("ST2", "-", "[static · R14] report-actions.ts \"use server\" บรรทัดแรก · export async function ล้วน · posReportAction / posReportCsvAction / posDashboardCardAction เรียกบริการ + catch · ไม่มี throw"),
  D("ST3", "X3", "[static · R12] core/permissions.ts โมดูล pos มี pos.report.view"),
  D("ST4", "-", "[static · R6] PosSale.soldByUserId String? · migration ADD COLUMN \"soldByUserId\" nullable (ไม่มี DROP/RENAME/SET NOT NULL) · CreateSaleInput.soldByUserId?: string · submitRegisterSale ส่ง soldByUserId: actor.userId"),
  D("ST5", "-", "[static · R15] ทุกคิวรี PosSale ใน reports.ts (prisma หรือ SQL ดิบ) กรองทั้ง unitId และ createdAt ⇒ ใช้ดัชนี (tenantId, unitId, createdAt)"),
  D("ST7", "-", "[static · P1.17U R6] report-actions.ts มี posReportOverviewAction เรียก reportOverview + catch · src/lib/modules/pos/report-overview.ts export reportOverview · อ่านอย่างเดียว (ไม่มี create/update/delete/$executeRaw) · ไม่คำนวณ VAT เอง"),
  D("ST6", "X4", "[static · R3 R4] reports.ts อ่านอย่างเดียว (ไม่มี create/update/upsert/delete/$executeRaw) · ไม่คำนวณ VAT เอง (ไม่ import splitIncludedVat/posVatRateBp) · ไม่เรียก forceCloseStaleShifts"),
  // ── F ข้อมูลทดสอบ ──
  D("F1", "X4", "ข้อมูลทดสอบถูกเขียนครบ + ข้อสอบตรวจตัวเอง: ทุกบิล Σจ่าย = grandTotal + ทิป · grand = subtotal − ส่วนลด + ค่าบริการ · ค่าที่ข้อสอบคำนวณ = ตัวเลขใน brief (D1 55,450/4 บิล/VAT 3,431 · D2 9,000/2 · ต้นทุน 13,600 · กำไรสุทธิ 46,831)"),
  // ── D ยอดขายรายวัน ──
  D("D1", "X4", "รายวัน D1–D2: แถว D1 = 4 บิล · ก่อนส่วนลด 54,000 · ส่วนลด 1,000 · ค่าบริการ 2,450 (อยู่ในยอด) · สุทธิ 55,450 · VAT 3,431 (จากคอลัมน์) · ก่อน VAT 52,019 · ทิป 1,000 (ไม่อยู่ในยอด) · ยกเลิก 1/18,000 · เฉลี่ย 13,862 · แถว D2 9,000/2 · รวม = Σ แถว"),
  D("D2", "X4", "ตัดวันเวลาไทย: บิล 23:59:30 อยู่ D1 · 00:00:30 และ 06:30 (วันก่อนตาม UTC) อยู่ D2 · ช่วง 09-12..09-16 ได้ 5 แถวเรียงวัน วันไม่มีขาย = แถวศูนย์ · บิล 09-13 23:59:59 / 09-16 00:00:00 อยู่วันของมันเท่านั้น"),
  D("D3", "-", "ตรงกับหน้าปิดวันเดิม: closeDaySummary(D1/D2) netSales · billCount · voidCount · voidTotal = แถวรายวันของวันนั้น"),
  D("D4", "X2", "กรองสาขา: ctx.unitId = u2 → D1 3,000/1 บิล (บิลไม่มี VAT) · D2 4,500/1 บิล · ไม่มีบิลของ u1"),
  // ── PR สินค้า ──
  D("PR1", "X4", "สินค้าขายดี: 4 แถวเรียงยอดขาย ลาเต้ 22,500 (5 ชิ้น 4 บิล) · บริการ 20,000 · เค้ก 17,500 (ยอดเต็ม 18,000 ส่วนลดบรรทัด 500) · พิมพ์เอง 3,000 (3) · คีย์ p:/s:/n: · บิล void ไม่นับ"),
  D("PR2", "X4", "เอกลักษณ์: Σ ยอดขายสินค้า = Σ subtotal ของบิล PAID (63,000) = Σ grossSatang รายวัน · totals.salesSatang ตรง"),
  // ── SF พนักงาน ──
  D("SF1", "X4", "พนักงาน: B 3 บิล 43,450 ทิป 1,000 ยกเลิก 1/18,000 · A 2 บิล 16,500 ส่วนลด 1,000 · ไม่ระบุ (userId null) 1 บิล 4,500 · ชื่อจาก User · Σ สุทธิ = ยอดรวม"),
  D("SF2", "-", "ผู้ขาย = soldByUserId ?? ผู้เปิดกะของบิล ?? null: บิล 06:30 (soldBy ว่าง ผูกกะของ B) นับให้ B · บิล 00:00:30 (ไม่มีทั้งคู่) อยู่แถว null · บิล void นับยกเลิกให้ผู้ขายของมัน"),
  // ── PM วิธีชำระ ──
  D("PM1", "X4", "วิธีชำระเรียง CASH PROMPTPAY TRANSFER CARD: เงินสด 4 รายการ 35,950 (รับ 42,500 ทอน 6,550) · พร้อมเพย์ 2/5,000 · โอน 1/4,500 · บัตร 1/20,000 · billCount ต่อวิธี (บิลแบ่งจ่ายนับทุกวิธี)"),
  D("PM2", "X4", "เอกลักษณ์: Σ รับ 65,450 = ยอดขาย 64,450 + ทิป 1,000 · totals มี totalPaidSatang/salesSatang/tipSatang ตรง"),
  // ── MG กำไรขั้นต้น ──
  D("MG1", "X4", "กำไรต่อสินค้า: ลาเต้ ต้นทุน 6,100 จาก InvMovement ที่เก็บไว้ (ไม่ใช่ต้นทุนวันนี้ 1,500×5) กำไร 16,400 · 72.88% · เค้ก ต้นทุนประมาณ 7,500 (ไม่มี movement → ต้นทุนเฉลี่ยปัจจุบัน) · บริการ/พิมพ์เอง ต้นทุน null"),
  D("MG2", "X4", "รวมกำไร: ยอด 63,000 · ยอดที่มีต้นทุน 40,000 · ต้นทุน 13,600 (ประมาณ 7,500) · กำไรขั้นต้น 26,400 · ไม่มีต้นทุน 23,000/2 บรรทัด · ก่อน VAT 60,431 · กำไรสุทธิ 46,831 · movement ของบิล void ไม่นับ"),
  // ── SH กะ ──
  D("SH1", "X4", "กะในช่วง (วันเปิดกะเวลาไทย): กะปิดของ B = ค่าจาก Z แช่แข็ง (3 บิล 43,450 ทิป 1,000) + คอลัมน์ (ควรมี 72,450 นับ 72,000 ขาด −450 Z#1) · กะเปิดของ A คำนวณสด (0 บิล ควรมี 100,000 นับ null) · กะ 09-16 ไม่อยู่ · รวม ขาด −450 shortCount 1 openCount 1"),
  D("SH2", "X4", "Z แช่แข็งในรายงาน: เปลี่ยนบิล 06:30 ในกะที่ปิดแล้วเป็น VOIDED ใน DB → แถวกะเดิมไม่เปลี่ยน (3/43,450) แต่รายวัน D2 เหลือ 1 บิล 4,500"),
  // ── TX ภาษีขาย ──
  D("TX1", "X4", "ภาษีขายรายวันต่อสาขา 4 แถว: D1/u1 3 บิล 52,450 VAT 3,431 ฐาน 49,019 เลขที่แรก/สุดท้าย + เลขยกเลิก 1 · D1/u2 3,000 ไม่มี VAT · D2/u1 4,500 VAT 294 · D2/u2 4,500 VAT 294"),
  D("TX2", "X4", "VAT จากคอลัมน์ที่เก็บ: บิล VAT 0 อยู่ nonVatGross ไม่ถูกคิดใหม่ (ไม่ใช่ 196) · Σ VAT = 4,019 = Σ vatSatang ใน DB · ยอดภาษีไม่รวมทิป · base = gross − vat"),
  // ── CSV ──
  D("CSV1", "X4", "CSV รายวัน: ขึ้นต้น BOM U+FEFF · หัวตารางตรงตัว · 2 แถววัน + แถว \"รวม\" · เงินเป็นบาท 2 ตำแหน่ง (55450 → 554.50) ตรงกับรายงาน · filename pos-daily-2026-09-14_2026-09-15.csv · contentType text/csv; charset=utf-8"),
  D("CSV2", "-", "CSV ครบ 7 ชนิด: BOM + หัวตารางของชนิดนั้นตรงตัว + จำนวนแถว = แถวรายงาน + 1 (รวม) · ชื่อมีจุลภาค/อัญประกาศถูก escape (\"พิมพ์เอง, \"\"พิเศษ\"\"\")"),
  // ── CD การ์ดภาพรวม ──
  D("CD1", "X4", "การ์ด (now = D2 10:00 ไทย): businessDate D2 · 9,000/2 บิล · เฉลี่ย 4,500 · เมื่อวาน 55,450 · deltaBp −8,377 · กะเปิด 1 · สินค้าขายดี ลาเต้ 2 ชิ้น 9,000"),
  // ── V/A/I ข้อมูลเข้า · สิทธิ์ · ข้ามขอบเขต ──
  D("V1", "-", "ตรวจช่วงวัน: from > to · 2026-9-14 · 2026-02-30 · ตัวเลข · ไม่ส่ง · 93 วัน → VALIDATION (ทุกรายงาน + CSV) · 92 วัน ok · CSV kind ไม่รู้จัก → VALIDATION"),
  D("A1", "X3", "สิทธิ์: STAFF มีแค่ pos.sale.create → PERMISSION_DENIED ทั้ง 7 รายงาน + CSV (การ์ด ok) · STAFF ไม่มีสิทธิ์ POS → การ์ด PERMISSION_DENIED"),
  D("A2", "X3", "สาขาจำกัด: STAFF pos.report.view unitAccess [u1] ไม่ส่ง unitId → เห็นแค่ u1 (D1 52,450/3 · D2 4,500/1) · ส่ง unitId u2 → NOT_FOUND · การ์ดเห็น u1 (4,500/1 · กะเปิด 0)"),
  D("I1", "X2", "ข้ามระบบ: บิลของ POS อีกตัว (u3) ไม่อยู่ในรายงานของ POS นี้ และกลับกัน · systemId ที่เป็นระบบคลัง / ไม่มีจริง / unitId ร้านอื่น → NOT_FOUND"),
  D("I2", "X2", "ข้ามร้าน: เจ้าของร้าน QC อาหาร (ctx ร้านตัวเอง) กับ systemId ร้านกาแฟ → NOT_FOUND ทั้งรายวัน/ภาษี/CSV/การ์ด"),
  // ── OV ภาพรวมในคำขอเดียว (P1.17U R6 · ผู้คุมงานสั่งเพิ่ม) ──
  D("OV1", "X4", "ภาพรวม (เจ้าของ · ทุกสาขา · D1–D2): ทุกส่วน ok และตรงกับรายงานเดิมทีละตัว — daily/prev(09-12..09-13)/margin(5 แถวแรก = 5 แถวแรกของสินค้า: คีย์ ชื่อ จำนวน ยอด)/payments/staff · กราฟ = 14 วันจบที่ to (09-02..09-15) · สาขา u1/u2 = รายวัน/กำไรต่อสาขา · แถวรวม = ทุกสาขา"),
  D("OV2", "X3", "ภาพรวม สิทธิ์: แคชเชียร์ (pos.sale.create อย่างเดียว / ไม่มีสิทธิ์) → ทุกส่วน PERMISSION_DENIED (ไม่ throw · ok:true ทั้งก้อน) · สาขาจำกัด u1 → daily = u1 · การ์ดสาขาว่าง (เห็น 1 สาขา) · ส่ง unitId u2 → ทุกส่วน NOT_FOUND · เจ้าของเลือก u2 → daily = u2 · สาขาเลือกขึ้นก่อน · แถวรวม = ทุกสาขา"),
  D("OV3", "-", "ภาพรวม ปฏิเสธต่อส่วน: ช่วง 93 วัน → daily/prev/margin/payments/staff VALIDATION แต่กราฟ 14 วัน ok · only:[payments] → มีแค่ payments · only ไม่รู้จัก / ช่วงผิดรูป / from > to → VALIDATION ทั้งก้อน"),
  D("SB1", "-", "ทางเขียนผู้ขาย: createSale({…, soldByUserId}) → แถว PosSale.soldByUserId ตรง · ไม่ส่ง = null (ผู้เรียกเดิมไม่กระทบ)"),
  D("R1", "-", "คำปฏิเสธของ reports.ts (VALIDATION · NOT_FOUND · PERMISSION_DENIED) ≥ 12 รายการ = คืน {ok:false, code, message} ไม่ throw"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: จำนวนแถวของร้าน QC POS ทั้งสอง (ทุกตารางที่ข้อสอบแตะ · รวม InvItem/InvMovement/PosShift) ก่อน = หลัง · ผลรวมตัวนับใบเสร็จไม่ขยับ"),
  D("Z2", "-", "QC4 ลายนิ้วมือ: แถวเดิมของร้าน QC POS (PosProduct · PosCategory · AppSystem · AppSystemUnit · BusinessUnit · Membership · PosReceiptCounter · PosShift · InvItem) ทุกคอลัมน์ ก่อน = หลัง"),
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
  if (!TITLE.has(id)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${id}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(id, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${id}] ${TITLE.get(id)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const skippedChecks = new Map<string, string>();
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
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : "UNKNOWN");
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1];
  return typeof o?.code === "string" && o.code ? o.code : "THROW";
}
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `ยังไม่มีฟังก์ชัน ${name}`, missing: true };
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
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 120)})`);
    return null;
  }
};

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
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const stripPrismaComments = (s: string) => s.replace(/\/\/.*$/gm, "");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b`).test(src);
function prismaBlock(src: string, kind: "model" | "enum", name: string): string {
  const m = new RegExp(`\\b${kind}\\s+${name}\\s*\\{`).exec(src);
  if (!m) return "";
  const end = src.indexOf("\n}", m.index);
  return end < 0 ? "" : src.slice(m.index, end + 2);
}
const fieldLine = (block: string, f: string): string => (new RegExp(`^\\s*${f}\\s+[^\\n]*$`, "m").exec(block)?.[0] ?? "").trim();
/** ตัวเรียกที่วงเล็บสมดุล: คืนข้อความตั้งแต่ `(` ตัวแรกหลัง at จนถึง `)` ที่ปิดมัน ("" = ไม่พบ) */
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

const REPORTS_FILE = "src/lib/modules/pos/reports.ts";
const REPORT_ACT_FILE = "src/lib/modules/pos/report-actions.ts";
const OVERVIEW_FILE = "src/lib/modules/pos/report-overview.ts"; // P1.17U R6
const SERVICE_FILE = "src/lib/modules/pos/service.ts";
const REGISTER_FILE = "src/lib/modules/pos/register.ts";
const REPORT_FNS = ["reportDailySales", "reportProducts", "reportStaff", "reportPayments", "reportMargin", "reportShifts", "reportTax", "reportCsv", "posDashboardCard"] as const;
const KIND_FN: Record<string, string> = {
  daily: "reportDailySales",
  products: "reportProducts",
  staff: "reportStaff",
  payments: "reportPayments",
  margin: "reportMargin",
  shifts: "reportShifts",
  tax: "reportTax",
};
const KINDS = Object.keys(KIND_FN);
const REPORT_ACTIONS: [string, string[]][] = [
  ["posReportAction", ["reportDailySales", "reportProducts", "reportStaff", "reportPayments", "reportMargin", "reportShifts", "reportTax"]],
  ["posReportCsvAction", ["reportCsv"]],
  ["posDashboardCardAction", ["posDashboardCard"]],
];
/** หัวตาราง CSV ต่อชนิด (R11 · ชื่อที่ตั้งใหม่ — ผู้คุมงานรับรอง) */
const CSV_HEADERS: Record<string, string[]> = {
  daily: ["วันที่", "จำนวนบิล", "ยอดก่อนส่วนลด", "ส่วนลด", "ค่าบริการ", "ยอดขายสุทธิ", "VAT", "ยอดก่อน VAT", "ทิป", "บิลยกเลิก", "ยอดบิลยกเลิก", "เฉลี่ยต่อบิล"],
  products: ["รหัส", "ชื่อ", "จำนวน", "น้ำหนัก (กรัม)", "จำนวนบิล", "ยอดเต็ม", "ส่วนลดรายการ", "ยอดขาย"],
  staff: ["รหัสผู้ใช้", "ชื่อ", "จำนวนบิล", "ยอดขายสุทธิ", "ส่วนลด", "ทิป", "บิลยกเลิก", "ยอดบิลยกเลิก", "เฉลี่ยต่อบิล"],
  payments: ["วิธีชำระ", "รหัส", "จำนวนรายการ", "จำนวนบิล", "ยอดรับ"],
  margin: ["รหัส", "ชื่อ", "จำนวน", "ยอดขาย", "ต้นทุน", "ต้นทุนประมาณการ", "กำไรขั้นต้น", "อัตรากำไร (%)"],
  shifts: ["กะที่", "Z ที่", "สาขา", "เครื่อง", "สถานะ", "เปิดโดย", "เวลาเปิด", "เวลาปิด", "จำนวนบิล", "ยอดขาย", "เงินที่ควรมี", "เงินที่นับได้", "ขาด/เกิน"],
  tax: ["วันที่", "สาขา", "เลขที่เริ่ม", "เลขที่สุดท้าย", "จำนวนบิล", "ยอดรวม VAT", "ฐานภาษี", "VAT", "ยอดไม่มี VAT", "บิลยกเลิก", "เลขที่ยกเลิก"],
};

const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
const repRaw = rd(REPORTS_FILE);
const repSrc = stripComments(repRaw);
const actRaw = rd(REPORT_ACT_FILE);
const actSrc = stripComments(actRaw);

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB · ST1–ST6) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  // ST1
  const s1 = repRaw ? REPORT_FNS.filter((f) => !exportsFn(repSrc, f)).map((f) => `ไม่มี export ${f}`) : [`ไม่มี ${REPORTS_FILE}`];
  chk("P1.17-ST1", s1.length === 0, "9 export", s1.join(" · ") || "ครบ");

  // ST2 actions
  const s2: string[] = [];
  if (!actRaw) s2.push(`ไม่มี ${REPORT_ACT_FILE}`);
  else {
    if (!/^\s*["']use server["']/.test(actRaw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, ""))) s2.push("ไม่มี \"use server\" บรรทัดแรก");
    const exps = [...actSrc.matchAll(/^\s*export\b[^\n]*/gm)].map((m) => m[0].trim());
    const nonFn = exps.filter((x) => !/^export\s+async\s+function\s+\w+/.test(x));
    if (nonFn.length) s2.push(`export ไม่ใช่ async function (${nonFn.slice(0, 2).join(" | ")})`);
    if (/\bthrow\b/.test(actSrc)) s2.push("มี throw");
    const names = exps.map((x) => /^export\s+async\s+function\s+(\w+)/.exec(x)?.[1]).filter((x): x is string => !!x);
    for (const [a, fns] of REPORT_ACTIONS) {
      if (!names.includes(a)) {
        s2.push(`ไม่มี ${a}`);
        continue;
      }
      const at = actSrc.search(new RegExp(`export\\s+async\\s+function\\s+${a}\\b`));
      const body = actSrc.slice(at).split(/\n\s*export\s+/)[0] ?? "";
      // posReportAction อาจเลือกฟังก์ชันผ่านตาราง (map ชนิด → ฟังก์ชัน) ⇒ ยอมให้ชื่อฟังก์ชันอยู่ที่ใดก็ได้ในไฟล์
      const where = a === "posReportAction" ? actSrc : body;
      const miss = fns.filter((f) => !new RegExp(`\\b${f}\\b`).test(where));
      if (miss.length) s2.push(`${a} ไม่อ้าง ${miss.join(",")}`);
      if (!/\bcatch\b/.test(body)) s2.push(`${a} ไม่มี catch`);
    }
  }
  chk("P1.17-ST2", s2.length === 0, "use server · 3 action · catch · ไม่ throw", s2.slice(0, 6).join(" · ") || "ครบ");

  // ST3 permission
  const permSrc = stripComments(rd("src/lib/core/permissions.ts"));
  const posAt = permSrc.search(/module:\s*["']pos["']/);
  const posBlock = posAt < 0 ? "" : permSrc.slice(posAt, permSrc.indexOf("}", permSrc.indexOf("actions", posAt)) + 1);
  chk("P1.17-ST3", posBlock.includes(`"pos.report.view"`), "pos.report.view ในโมดูล pos", posBlock ? (posBlock.includes(`"pos.report.view"`) ? "มี" : "ไม่มี") : "หาโมดูล pos ไม่เจอ");

  // ST4 soldByUserId
  const s4: string[] = [];
  const saleB = prismaBlock(schemaSrc, "model", "PosSale");
  const sb = fieldLine(saleB, "soldByUserId");
  if (!sb) s4.push("PosSale ไม่มี soldByUserId");
  else if (!/^soldByUserId\s+String\?/.test(sb)) s4.push(`PosSale.soldByUserId ไม่ใช่ String? (${sb.slice(0, 40)})`);
  const migFiles = walk("prisma/migrations", [], /\.sql$/).filter((f) => /soldByUserId/.test(rd(f)));
  if (!migFiles.length) s4.push("ไม่มี migration ที่เพิ่ม soldByUserId");
  for (const f of migFiles) {
    const t = rd(f).replace(/--.*$/gm, "");
    const add = /ALTER\s+TABLE\s+"PosSale"[^;]*ADD\s+COLUMN\s+"soldByUserId"[^;,]*/i.exec(t)?.[0] ?? "";
    if (!add) s4.push(`${f.split("/").slice(-2, -1)[0]}: ไม่มี ADD COLUMN "soldByUserId" ของ PosSale`);
    else if (/NOT\s+NULL/i.test(add)) s4.push("soldByUserId NOT NULL");
    if (/\bDROP\s+(TABLE|COLUMN)\b|\bRENAME\b|SET\s+NOT\s+NULL/i.test(t)) s4.push(`${f.split("/").slice(-2, -1)[0]}: มี DROP/RENAME/SET NOT NULL`);
  }
  const svcSrc = stripComments(rd(SERVICE_FILE));
  const csInput = /export\s+type\s+CreateSaleInput\s*=\s*\{[\s\S]*?\n\};/.exec(svcSrc)?.[0] ?? "";
  if (!/\bsoldByUserId\s*\?\s*:\s*string/.test(csInput)) s4.push("CreateSaleInput ไม่มี soldByUserId?: string");
  const csBody = svcSrc.slice(Math.max(0, svcSrc.search(/export\s+async\s+function\s+createSale\b/)));
  if (!/soldByUserId/.test(csBody.split(/\nexport\s+async\s+function\s+/)[0] ?? "")) s4.push("createSale ไม่เขียน soldByUserId");
  const regSrc = stripComments(rd(REGISTER_FILE));
  if (!/soldByUserId\s*:\s*actor\.userId/.test(regSrc)) s4.push("register.ts ไม่ส่ง soldByUserId: actor.userId");
  chk("P1.17-ST4", s4.length === 0, "soldByUserId String? · migration additive · input · createSale · register", s4.join(" · ") || "ครบ");

  // ST5 ดัชนี
  const s5: string[] = [];
  if (!repRaw) s5.push(`ไม่มี ${REPORTS_FILE}`);
  else {
    let n = 0;
    for (const m of repSrc.matchAll(/\bposSale\s*\.\s*(findMany|findFirst|aggregate|groupBy|count)\s*\(/g)) {
      n++;
      const args = balancedFrom(repSrc, m.index ?? 0);
      if (!/\bcreatedAt\b/.test(args) || !/\bunitId\b/.test(args)) s5.push(`posSale.${m[1]} ไม่กรอง ${!/\bcreatedAt\b/.test(args) ? "createdAt" : "unitId"}`);
    }
    for (const m of repSrc.matchAll(/\$queryRaw(Unsafe)?\s*(<[^>]*>)?\s*(`[^`]*`|\()/g)) {
      const at = m.index ?? 0;
      const text = m[3] === "(" ? balancedFrom(repSrc, at) : m[3];
      if (!/"PosSale"/.test(text)) continue;
      n++;
      if (!/"createdAt"/.test(text) || !/"unitId"/.test(text)) s5.push("SQL ดิบบน PosSale ไม่กรอง createdAt/unitId");
    }
    if (n === 0) s5.push("ไม่พบคิวรี PosSale ใน reports.ts");
  }
  chk("P1.17-ST5", s5.length === 0, "ทุกคิวรี PosSale กรอง unitId + createdAt", s5.slice(0, 5).join(" · ") || "ครบ");

  // ST6 อ่านอย่างเดียว + VAT จากคอลัมน์
  const s6: string[] = [];
  if (!repRaw) s6.push(`ไม่มี ${REPORTS_FILE}`);
  else {
    const w = /\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw/.exec(repSrc);
    if (w) s6.push(`มีการเขียน (${w[0].slice(0, 30)})`);
    if (/\bsplitIncludedVat\b|\bposVatRateBp\b/.test(repSrc)) s6.push("คำนวณ VAT เอง (splitIncludedVat/posVatRateBp)");
    if (/\bforceCloseStaleShifts\b/.test(repSrc)) s6.push("เรียก forceCloseStaleShifts");
  }
  chk("P1.17-ST6", s6.length === 0, "อ่านอย่างเดียว · VAT จากคอลัมน์", s6.join(" · ") || "ครบ");

  // ST7 ภาพรวมในคำขอเดียว (P1.17U R6)
  const s7: string[] = [];
  const ovRaw = rd(OVERVIEW_FILE);
  const ovSrc = stripComments(ovRaw);
  if (!ovRaw) s7.push(`ไม่มี ${OVERVIEW_FILE}`);
  else {
    if (!exportsFn(ovSrc, "reportOverview")) s7.push("ไม่มี export reportOverview");
    const w = /\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw/.exec(ovSrc);
    if (w) s7.push(`มีการเขียน (${w[0].slice(0, 30)})`);
    if (/\bsplitIncludedVat\b|\bposVatRateBp\b/.test(ovSrc)) s7.push("คำนวณ VAT เอง");
  }
  const at7 = actSrc.search(/export\s+async\s+function\s+posReportOverviewAction\b/);
  if (at7 < 0) s7.push("report-actions.ts ไม่มี posReportOverviewAction");
  else {
    const body7 = actSrc.slice(at7).split(/\n\s*export\s+/)[0] ?? "";
    if (!/\breportOverview\b/.test(body7)) s7.push("posReportOverviewAction ไม่เรียก reportOverview");
    if (!/\bcatch\b/.test(body7)) s7.push("posReportOverviewAction ไม่มี catch");
    if (!/\bREPORT_PERMISSION\b/.test(body7)) s7.push("posReportOverviewAction ไม่ผ่านด่านสิทธิ์ REPORT_PERMISSION");
  }
  chk("P1.17-ST7", s7.length === 0, "action + reportOverview อ่านอย่างเดียว", s7.join(" · ") || "ครบ");
}
const STATIC_IDS = ["P1.17-ST1", "P1.17-ST2", "P1.17-ST3", "P1.17-ST4", "P1.17-ST5", "P1.17-ST6", "P1.17-ST7"];

const skipReasons: string[] = [];
for (const f of REPORT_FNS) if (!exportsFn(repSrc, f)) skipReasons.push(`${REPORTS_FILE} ยังไม่มี export ${f}`);

// ═════════════════════════ 1b. --no-db ═════════════════════════
if (NODB) {
  console.log(`[${SUITE}] --no-db: รัน ${STATIC_IDS.length} ข้อสถิต (ไม่ผ่านด่าน SKIP · ข้ออื่นต้องใช้ DB)`);
  if (skipReasons.length) console.log(`   (ของ P1.17 ที่ยังขาด: ${skipReasons.length} ฟังก์ชันใน ${REPORTS_FILE})`);
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
const TIDS = envMod.PQC_TENANT_IDS as string[];
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// ═════════════════════════ 3. ด่าน SKIP (ตาราง/คอลัมน์ + ของ P1.17) ═════════════════════════
const { prisma } = (await import("@/lib/core/db")) as Any;
const P = prisma as Any;
const prismaPkg = (await import("@prisma/client")) as Any;
const DMMF = ((prismaPkg?.Prisma ?? prismaPkg?.default?.Prisma)?.dmmf?.datamodel ?? { models: [], enums: [] }) as { models: { name: string; fields: { name: string }[] }[]; enums: { name: string; values: { name: string }[] }[] };
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosShift','PosSale','PosPayment','InvMovement','InvItem')`,
  )) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const clientHas = (model: string, field: string) => (DMMF.models.length ? !!DMMF.models.find((m) => m.name === model)?.fields.some((f) => f.name === field) : dbCols.has(`${model}.${field}`));
const hasField = (model: string, field: string) => clientHas(model, field) && dbCols.has(`${model}.${field}`);
const HAS_SOLDBY = hasField("PosSale", "soldByUserId");
const PS: Any = typeof P.posShift?.findMany === "function" ? P.posShift : null;
if (!HAS_SOLDBY) skipReasons.push("PosSale.soldByUserId ยังไม่มี (client/DB · R6)");
// ของที่ใบก่อนต้องมีแล้ว (P1.6 + P1.9) — ไม่มี = ฐานผิด (ข้อ DB แดงตามเหตุผล ไม่ crash)
const PREREQ: string[] = [];
for (const [m, f] of [["PosSale", "shiftId"], ["PosSale", "tipSatang"], ["PosSale", "serviceChargeSatang"], ["PosPayment", "tenderedSatang"], ["PosPayment", "changeSatang"], ["PosShift", "zReport"]] as const) {
  if (!hasField(m, f)) PREREQ.push(`${m}.${f}`);
}
if (!PS) PREREQ.push("delegate posShift");
if (PREREQ.length) skipReasons.push(`ฐานยังไม่มีของ P1.6/P1.9: ${PREREQ.join(",")}`);

let scope: Any = null;
let restoScope: Any = null;
try {
  scope = await envMod.resolvePosScope(prisma, "coffee");
  restoScope = await envMod.resolvePosScope(prisma, "resto");
} catch (e) {
  console.log(`  (resolvePosScope ล้ม: ${(e as Error).message.slice(0, 120)})`);
}
if (!scope) skipReasons.push("ชุดข้อมูล QC POS (ร้านกาแฟ) ยังไม่ถูก seed บน DB นี้ — รัน scripts/seed-pos-qc.mts ก่อน");
if (!restoScope) skipReasons.push("ชุดข้อมูล QC POS (ร้านอาหาร) ยังไม่ถูก seed — ข้อ I2 ต้องใช้");

const COUNT_MODELS = [
  "posSale", "posSaleLine", "posPayment", "posReceiptCounter", "outboxEvent", "appSystem", "appSystemUnit", "businessUnit", "auditLog",
  "posShift", "posCashMovement", "posShiftCounter", "invItem", "invMovement", "couponRedemption", "pointLedger",
] as const;
const FP_MODELS = ["posProduct", "posCategory", "appSystem", "appSystemUnit", "businessUnit", "membership", "posReceiptCounter", "posShift", "invItem"] as const;
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const m of FP_MODELS) {
    const d = P[m];
    if (typeof d?.findMany !== "function") {
      out[m] = "absent";
      continue;
    }
    try {
      const rows = (await d.findMany({ where: { tenantId: { in: TIDS } }, orderBy: { id: "asc" } })) as Any[];
      out[m] = `${rows.length}:${createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16)}`;
    } catch (e) {
      out[m] = `err:${(e as Error).message.slice(0, 40)}`;
    }
  }
  return out;
}
async function snapshotCounts(): Promise<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const tid of TIDS) {
    for (const m of COUNT_MODELS) {
      const d = P[m];
      if (typeof d?.count !== "function") {
        out[`${tid}.${m}`] = "absent";
        continue;
      }
      try {
        out[`${tid}.${m}`] = await d.count({ where: { tenantId: tid } });
      } catch (e) {
        out[`${tid}.${m}`] = `err:${(e as Error).message.slice(0, 40)}`;
      }
    }
    try {
      const rows = (await P.posReceiptCounter.findMany({ where: { tenantId: tid }, select: { seq: true } })) as Any[];
      out[`${tid}.receiptSeqSum`] = rows.reduce((s, r) => s + Number(r.seq), 0);
    } catch {
      out[`${tid}.receiptSeqSum`] = "err";
    }
  }
  return out;
}
const countsBefore = await snapshotCounts();

if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P1.17 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง)`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อมูล: seed ร้านกาแฟ ${scope ? "มี" : "ไม่มี"} · seed ร้านอาหาร ${restoScope ? "มี" : "ไม่มี"} · ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล)`);
  console.log(`   A5 (อ่านอย่างเดียว) จำนวนแถวร้าน QC POS: ${JSON.stringify(countsBefore)}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length, seed: { coffee: !!scope, resto: !!restoScope }, a5: countsBefore })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const rep = existsSync(join(ROOT, REPORTS_FILE)) ? await tryImport("@/lib/modules/pos/reports") : null;
const ovMod = existsSync(join(ROOT, OVERVIEW_FILE)) ? await tryImport("@/lib/modules/pos/report-overview") : null; // P1.17U R6
const svc = await tryImport("@/lib/modules/pos/service");
const sysSvc = await tryImport("@/lib/modules/system/service");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p1.17-${RAND}`;
const runStart = new Date();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═════════════════════════ 5. สเปกข้อมูลทดสอบ + ตัวคำนวณคำตอบของข้อสอบเอง ═════════════════════════
const BKK_MS = 7 * 3_600_000;
const bkkDate = (d: Date) => new Date(d.getTime() + BKK_MS).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** VAT แบบรวมในราคา (สูตรเดียวกับ splitIncludedVat — ข้อสอบเขียนเอง ไม่ import) */
const vatOf = (g: number, bp: number) => {
  const den = 10_000 + bp;
  return g - Math.floor((2 * g * 10_000 + den) / (2 * den));
};
const VAT_BP = 700;
const D1 = "2026-09-14";
const D2 = "2026-09-15";
const PAY_ORDER = ["CASH", "PROMPTPAY", "TRANSFER", "CARD", "DEPOSIT", "ROOM_CHARGE"];
const PAY_LABEL: Record<string, string> = { CASH: "เงินสด", PROMPTPAY: "พร้อมเพย์", TRANSFER: "โอน", CARD: "บัตร", DEPOSIT: "มัดจำ", ROOM_CHARGE: "ลงบิลห้องพัก" };
const CUSTOM_NAME = `พิมพ์เอง, "พิเศษ"`;

type FxLine = { pk: "pA" | "pB" | "sC" | "custom"; qty: number; unit: number; disc?: number; move?: { qty: number; cost: number } };
type FxPay = { type: string; amount: number; tendered?: number; change?: number };
type FxBill = {
  k: string; unit: "u1" | "u2" | "u3"; sys: "S" | "S2"; at: string; status: "PAID" | "VOIDED"; soldBy: "A" | "B" | null; shift: "SH" | null;
  lines: FxLine[]; billDisc: number; svc: number; tip: number; vat: boolean; pays: FxPay[]; rno: string;
};
const BILLS: FxBill[] = [
  { k: "B0", unit: "u1", sys: "S", at: "2026-09-13T16:59:59Z", status: "PAID", soldBy: "A", shift: null, lines: [{ pk: "pA", qty: 1, unit: 4500 }], billDisc: 0, svc: 0, tip: 0, vat: true, pays: [{ type: "CASH", amount: 4500 }], rno: "0000" },
  { k: "B1", unit: "u1", sys: "S", at: "2026-09-14T03:00:00Z", status: "PAID", soldBy: "A", shift: null, lines: [{ pk: "pA", qty: 2, unit: 4500, move: { qty: 2, cost: 1200 } }, { pk: "pB", qty: 1, unit: 6000, disc: 500 }], billDisc: 1000, svc: 0, tip: 0, vat: true, pays: [{ type: "CASH", amount: 13500, tendered: 20000, change: 6500 }], rno: "0001" },
  { k: "B2", unit: "u1", sys: "S", at: "2026-09-14T05:00:00Z", status: "PAID", soldBy: "B", shift: "SH", lines: [{ pk: "pA", qty: 1, unit: 4500, move: { qty: 1, cost: 1200 } }, { pk: "sC", qty: 1, unit: 20000 }], billDisc: 0, svc: 2450, tip: 1000, vat: true, pays: [{ type: "CARD", amount: 20000 }, { type: "CASH", amount: 7950, tendered: 8000, change: 50 }], rno: "0002" },
  { k: "B3", unit: "u2", sys: "S", at: "2026-09-14T08:00:00Z", status: "PAID", soldBy: "A", shift: null, lines: [{ pk: "custom", qty: 3, unit: 1000 }], billDisc: 0, svc: 0, tip: 0, vat: false, pays: [{ type: "PROMPTPAY", amount: 3000 }], rno: "0001" },
  { k: "B4", unit: "u1", sys: "S", at: "2026-09-14T09:00:00Z", status: "VOIDED", soldBy: "B", shift: "SH", lines: [{ pk: "pA", qty: 4, unit: 4500, move: { qty: 4, cost: 1200 } }], billDisc: 0, svc: 0, tip: 0, vat: true, pays: [{ type: "CASH", amount: 18000 }], rno: "0003" },
  { k: "B5", unit: "u1", sys: "S", at: "2026-09-14T16:59:30Z", status: "PAID", soldBy: "B", shift: "SH", lines: [{ pk: "pB", qty: 2, unit: 6000 }], billDisc: 0, svc: 0, tip: 0, vat: true, pays: [{ type: "CASH", amount: 12000 }], rno: "0004" },
  { k: "B6", unit: "u2", sys: "S", at: "2026-09-14T17:00:30Z", status: "PAID", soldBy: null, shift: null, lines: [{ pk: "pA", qty: 1, unit: 4500, move: { qty: 1, cost: 1300 } }], billDisc: 0, svc: 0, tip: 0, vat: true, pays: [{ type: "TRANSFER", amount: 4500 }], rno: "0002" },
  { k: "B7", unit: "u1", sys: "S", at: "2026-09-14T23:30:00Z", status: "PAID", soldBy: null, shift: "SH", lines: [{ pk: "pA", qty: 1, unit: 4500, move: { qty: 1, cost: 1200 } }], billDisc: 0, svc: 0, tip: 0, vat: true, pays: [{ type: "CASH", amount: 2500 }, { type: "PROMPTPAY", amount: 2000 }], rno: "0005" },
  { k: "B8", unit: "u1", sys: "S", at: "2026-09-15T17:00:00Z", status: "PAID", soldBy: "A", shift: null, lines: [{ pk: "pB", qty: 1, unit: 6000 }], billDisc: 0, svc: 0, tip: 0, vat: true, pays: [{ type: "CASH", amount: 6000 }], rno: "0006" },
  { k: "B9", unit: "u3", sys: "S2", at: "2026-09-14T04:00:00Z", status: "PAID", soldBy: "A", shift: null, lines: [{ pk: "pA", qty: 1, unit: 4500 }], billDisc: 0, svc: 0, tip: 0, vat: true, pays: [{ type: "CASH", amount: 4500 }], rno: "0001" },
];
/** ต้นทุนเฉลี่ย "ปัจจุบัน" ของ InvItem (ต่างจากต้นทุนที่เก็บใน movement โดยตั้งใจ) */
const ITEM_COST: Record<string, number> = { pA: 1500, pB: 2500 };
const PNAME: Record<string, string> = { pA: "ลาเต้ P1.17", pB: "เค้ก P1.17", sC: "จัดดอกไม้ P1.17", custom: CUSTOM_NAME };

type Calc = FxBill & { atD: Date; date: string; subtotal: number; grand: number; vatS: number; lineTotals: number[] };
const calc = (b: FxBill): Calc => {
  const lineTotals = b.lines.map((l) => l.unit * l.qty - (l.disc ?? 0));
  const subtotal = lineTotals.reduce((s, x) => s + x, 0);
  const grand = subtotal - b.billDisc + b.svc;
  const atD = new Date(b.at);
  return { ...b, atD, date: bkkDate(atD), subtotal, grand, vatS: b.vat ? vatOf(grand, VAT_BP) : 0, lineTotals };
};
const CB = BILLS.map(calc);

// ── id จริงของ sandbox (เติมตอนสร้าง) ──
const ID = {
  u: {} as Record<string, string>, unitName: {} as Record<string, string>, S: "", S2: "", INV: "",
  item: {} as Record<string, string>, product: {} as Record<string, string>, service: "",
  user: { A: "", B: "" } as Record<string, string>, userName: {} as Record<string, string | null>,
  sale: {} as Record<string, string>, line: {} as Record<string, string[]>, shift: { SH: "", SH2: "", SH0: "" } as Record<string, string>,
};
const pkKey = (pk: string): string => (pk === "custom" ? `n:${CUSTOM_NAME}` : pk === "sC" ? `s:${ID.service}` : `p:${ID.product[pk]}`);
type Filter = { units: string[]; from: string; to: string };
const sel = (f: Filter, statuses: string[]) => CB.filter((b) => b.sys === "S" && f.units.includes(b.unit) && b.date >= f.from && b.date <= f.to && statuses.includes(b.status));
const ALL_UNITS = ["u1", "u2"];

function expDaily(f: Filter): Any {
  const rows: Any[] = [];
  for (let d = f.from; d <= f.to; d = addDays(d, 1)) {
    const paid = sel({ ...f, from: d, to: d }, ["PAID"]);
    const vd = sel({ ...f, from: d, to: d }, ["VOIDED"]);
    const net = paid.reduce((s, b) => s + b.grand, 0);
    const vat = paid.reduce((s, b) => s + b.vatS, 0);
    rows.push({
      businessDate: d, billCount: paid.length, grossSatang: paid.reduce((s, b) => s + b.subtotal, 0), discountSatang: paid.reduce((s, b) => s + b.billDisc, 0),
      serviceChargeSatang: paid.reduce((s, b) => s + b.svc, 0), netSalesSatang: net, vatSatang: vat, netExVatSatang: net - vat, tipSatang: paid.reduce((s, b) => s + b.tip, 0),
      voidCount: vd.length, voidTotalSatang: vd.reduce((s, b) => s + b.grand, 0), refundCount: 0, refundTotalSatang: 0, avgBillSatang: paid.length ? Math.floor(net / paid.length) : 0,
    });
  }
  const sum = (k: string) => rows.reduce((s, r) => s + r[k], 0);
  const totals: Any = {};
  for (const k of ["billCount", "grossSatang", "discountSatang", "serviceChargeSatang", "netSalesSatang", "vatSatang", "netExVatSatang", "tipSatang", "voidCount", "voidTotalSatang", "refundCount", "refundTotalSatang"]) totals[k] = sum(k);
  totals.avgBillSatang = totals.billCount ? Math.floor(totals.netSalesSatang / totals.billCount) : 0;
  return { rows, totals };
}
const DAILY_FIELDS = ["businessDate", "billCount", "grossSatang", "discountSatang", "serviceChargeSatang", "netSalesSatang", "vatSatang", "netExVatSatang", "tipSatang", "voidCount", "voidTotalSatang", "refundCount", "refundTotalSatang", "avgBillSatang"];

function expProducts(f: Filter): Any {
  const m = new Map<string, Any>();
  for (const b of sel(f, ["PAID"])) {
    b.lines.forEach((l, i) => {
      const key = pkKey(l.pk);
      const r = m.get(key) ?? { key, name: PNAME[l.pk], qty: 0, weightGrams: 0, lineCount: 0, bills: new Set<string>(), grossSatang: 0, lineDiscountSatang: 0, salesSatang: 0 };
      r.qty += l.qty;
      r.lineCount += 1;
      r.bills.add(b.k);
      r.grossSatang += l.unit * l.qty;
      r.lineDiscountSatang += l.disc ?? 0;
      r.salesSatang += b.lineTotals[i];
      m.set(key, r);
    });
  }
  const rows = [...m.values()].map((r) => ({ ...r, billCount: r.bills.size, bills: undefined })).sort((a, b) => b.salesSatang - a.salesSatang || (a.key < b.key ? -1 : 1));
  const totals = { qty: rows.reduce((s, r) => s + r.qty, 0), lineCount: rows.reduce((s, r) => s + r.lineCount, 0), grossSatang: rows.reduce((s, r) => s + r.grossSatang, 0), lineDiscountSatang: rows.reduce((s, r) => s + r.lineDiscountSatang, 0), salesSatang: rows.reduce((s, r) => s + r.salesSatang, 0) };
  return { rows, totals };
}
const PRODUCT_FIELDS = ["key", "name", "qty", "lineCount", "billCount", "grossSatang", "lineDiscountSatang", "salesSatang"];

const SHIFT_OPENER: Record<string, "A" | "B"> = { SH: "B" };
const sellerOf = (b: FxBill): "A" | "B" | null => b.soldBy ?? (b.shift ? SHIFT_OPENER[b.shift] : null);
function expStaff(f: Filter): Any {
  const m = new Map<string, Any>();
  const row = (who: "A" | "B" | null) => {
    const uid = who ? ID.user[who] : null;
    const k = uid ?? "∅";
    const r = m.get(k) ?? { userId: uid, name: who ? ID.userName[who] : null, billCount: 0, netSalesSatang: 0, discountSatang: 0, tipSatang: 0, voidCount: 0, voidTotalSatang: 0 };
    m.set(k, r);
    return r;
  };
  for (const b of sel(f, ["PAID"])) {
    const r = row(sellerOf(b));
    r.billCount++;
    r.netSalesSatang += b.grand;
    r.discountSatang += b.billDisc;
    r.tipSatang += b.tip;
  }
  for (const b of sel(f, ["VOIDED"])) {
    const r = row(sellerOf(b));
    r.voidCount++;
    r.voidTotalSatang += b.grand;
  }
  const rows = [...m.values()]
    .map((r) => ({ ...r, avgBillSatang: r.billCount ? Math.floor(r.netSalesSatang / r.billCount) : 0 }))
    .sort((a, b) => b.netSalesSatang - a.netSalesSatang || (a.userId === null ? 1 : b.userId === null ? -1 : a.userId < b.userId ? -1 : 1));
  return { rows, totals: { billCount: rows.reduce((s, r) => s + r.billCount, 0), netSalesSatang: rows.reduce((s, r) => s + r.netSalesSatang, 0), voidCount: rows.reduce((s, r) => s + r.voidCount, 0) } };
}
const STAFF_FIELDS = ["userId", "billCount", "netSalesSatang", "discountSatang", "tipSatang", "voidCount", "voidTotalSatang", "avgBillSatang"];

function expPayments(f: Filter): Any {
  const m = new Map<string, Any>();
  const paid = sel(f, ["PAID"]);
  for (const b of paid) {
    for (const p of b.pays) {
      const r = m.get(p.type) ?? { type: p.type, label: PAY_LABEL[p.type], count: 0, bills: new Set<string>(), amountSatang: 0, cashTenderedSatang: 0, changeSatang: 0 };
      r.count++;
      r.bills.add(b.k);
      r.amountSatang += p.amount;
      r.cashTenderedSatang += p.tendered ?? p.amount;
      r.changeSatang += p.change ?? 0;
      m.set(p.type, r);
    }
  }
  const rows = PAY_ORDER.filter((t) => m.has(t)).map((t) => {
    const r = m.get(t);
    return { ...r, billCount: r.bills.size, bills: undefined };
  });
  const totals = { totalPaidSatang: rows.reduce((s, r) => s + r.amountSatang, 0), salesSatang: paid.reduce((s, b) => s + b.grand, 0), tipSatang: paid.reduce((s, b) => s + b.tip, 0), billCount: paid.length };
  return { rows, totals };
}

function expMargin(f: Filter): Any {
  const m = new Map<string, Any>();
  for (const b of sel(f, ["PAID"])) {
    b.lines.forEach((l, i) => {
      const key = pkKey(l.pk);
      const r = m.get(key) ?? { key, name: PNAME[l.pk], qty: 0, revenueSatang: 0, costedRevenueSatang: 0, cost: 0, costed: 0, estimatedCostSatang: 0, uncostedLineCount: 0 };
      r.qty += l.qty;
      r.revenueSatang += b.lineTotals[i];
      if (l.move) {
        r.cost += l.move.qty * l.move.cost;
        r.costed++;
        r.costedRevenueSatang += b.lineTotals[i];
      } else if (l.pk === "pA" || l.pk === "pB") {
        const est = ITEM_COST[l.pk] * l.qty;
        r.cost += est;
        r.estimatedCostSatang += est;
        r.costed++;
        r.costedRevenueSatang += b.lineTotals[i];
      } else r.uncostedLineCount++;
      m.set(key, r);
    });
  }
  const rows = [...m.values()]
    .map((r) => {
      const costSatang = r.costed ? r.cost : null;
      const marginSatang = costSatang === null ? null : r.costedRevenueSatang - costSatang;
      const marginBp = marginSatang === null || r.costedRevenueSatang <= 0 ? null : Math.floor((marginSatang * 10_000) / r.costedRevenueSatang);
      return { key: r.key, name: r.name, qty: r.qty, revenueSatang: r.revenueSatang, costSatang, estimatedCostSatang: r.estimatedCostSatang, uncostedLineCount: r.uncostedLineCount, marginSatang, marginBp };
    })
    .sort((a, b) => b.revenueSatang - a.revenueSatang || (a.key < b.key ? -1 : 1));
  const all = [...m.values()];
  const paid = sel(f, ["PAID"]);
  const cost = all.reduce((s, r) => s + r.cost, 0);
  const costedRev = all.reduce((s, r) => s + r.costedRevenueSatang, 0);
  const rev = all.reduce((s, r) => s + r.revenueSatang, 0);
  const netExVat = paid.reduce((s, b) => s + b.grand - b.vatS, 0);
  const totals = {
    revenueSatang: rev, costedRevenueSatang: costedRev, costSatang: cost, estimatedCostSatang: all.reduce((s, r) => s + r.estimatedCostSatang, 0),
    grossMarginSatang: costedRev - cost, uncostedRevenueSatang: rev - costedRev, uncostedLineCount: all.reduce((s, r) => s + r.uncostedLineCount, 0),
    netExVatSatang: netExVat, netMarginSatang: netExVat - cost,
  };
  return { rows, totals };
}
const MARGIN_FIELDS = ["key", "name", "qty", "revenueSatang", "costSatang", "estimatedCostSatang", "uncostedLineCount", "marginSatang", "marginBp"];

function expTax(f: Filter): Any {
  const groups = new Map<string, Calc[]>();
  for (const b of sel(f, ["PAID", "VOIDED"])) {
    const k = `${b.date}|${b.unit}`;
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const rows = [...groups.entries()]
    .map(([k, bs]) => {
      const [date, unit] = k.split("|");
      const byTime = [...bs].sort((a, b) => a.atD.getTime() - b.atD.getTime());
      const paid = bs.filter((b) => b.status === "PAID");
      const vd = byTime.filter((b) => b.status === "VOIDED");
      const gross = paid.reduce((s, b) => s + b.grand, 0);
      const vat = paid.reduce((s, b) => s + b.vatS, 0);
      return {
        businessDate: date, unitId: ID.u[unit], unitName: ID.unitName[unit], firstReceiptNo: rnoOf(byTime[0]), lastReceiptNo: rnoOf(byTime[byTime.length - 1]),
        billCount: paid.length, grossSatang: gross, vatSatang: vat, baseSatang: gross - vat,
        vatableGrossSatang: paid.filter((b) => b.vatS > 0).reduce((s, b) => s + b.grand, 0), nonVatGrossSatang: paid.filter((b) => b.vatS === 0).reduce((s, b) => s + b.grand, 0),
        voidCount: vd.length, voidReceiptNos: vd.map(rnoOf),
      };
    })
    .sort((a, b) => (a.businessDate !== b.businessDate ? (a.businessDate < b.businessDate ? -1 : 1) : a.unitName < b.unitName ? -1 : a.unitName > b.unitName ? 1 : a.unitId < b.unitId ? -1 : 1));
  const totals = { billCount: rows.reduce((s, r) => s + r.billCount, 0), grossSatang: rows.reduce((s, r) => s + r.grossSatang, 0), vatSatang: rows.reduce((s, r) => s + r.vatSatang, 0), baseSatang: rows.reduce((s, r) => s + r.baseSatang, 0), nonVatGrossSatang: rows.reduce((s, r) => s + r.nonVatGrossSatang, 0), voidCount: rows.reduce((s, r) => s + r.voidCount, 0) };
  return { rows, totals };
}
const TAX_FIELDS = ["businessDate", "unitId", "firstReceiptNo", "lastReceiptNo", "billCount", "grossSatang", "vatSatang", "baseSatang", "vatableGrossSatang", "nonVatGrossSatang", "voidCount"];
const rnoOf = (b: FxBill) => `${RNO_PREFIX}-${b.unit}-${b.rno}`;
const RNO_PREFIX = `Q17${RAND}`;

// กะ: SH (u1 · B · ปิดแล้ว · Z แช่แข็ง) · SH2 (u2 · A · เปิด) · SH0 (u1 · เปิด 09-16 · อยู่นอกช่วง)
const SH_SPEC = {
  SH: { unit: "u1", opener: "B" as const, openedAt: "2026-09-14T02:00:00Z", closedAt: "2026-09-15T00:00:00Z", float: 50_000, counted: 72_000, shiftNo: 1, zNumber: 1, status: "CLOSED" },
  SH2: { unit: "u2", opener: "A" as const, openedAt: "2026-09-15T01:00:00Z", closedAt: null, float: 100_000, counted: null, shiftNo: 1, zNumber: null, status: "OPEN" },
  SH0: { unit: "u1", opener: "A" as const, openedAt: "2026-09-16T01:00:00Z", closedAt: "2026-09-16T02:00:00Z", float: 0, counted: 0, shiftNo: 2, zNumber: 2, status: "CLOSED" },
};
function shiftLive(key: "SH" | "SH2" | "SH0"): Any {
  const sp = SH_SPEC[key];
  const bound = CB.filter((b) => b.shift === key);
  const paid = bound.filter((b) => b.status === "PAID");
  const vd = bound.filter((b) => b.status === "VOIDED");
  const cash = paid.flatMap((b) => b.pays.filter((p) => p.type === "CASH"));
  const cashSales = cash.reduce((s, p) => s + p.amount, 0);
  const byMethod = PAY_ORDER.map((t) => {
    const ps = paid.flatMap((b) => b.pays.filter((p) => p.type === t));
    return { type: t, count: ps.length, amountSatang: ps.reduce((s, p) => s + p.amount, 0) };
  }).filter((x) => x.count > 0);
  return {
    billCount: paid.length, salesTotalSatang: paid.reduce((s, b) => s + b.grand, 0), voidCount: vd.length, voidTotalSatang: vd.reduce((s, b) => s + b.grand, 0), byMethod,
    cashSalesSatang: cashSales, cashTenderedSatang: cash.reduce((s, p) => s + (p.tendered ?? p.amount), 0), changeSatang: cash.reduce((s, p) => s + (p.change ?? 0), 0),
    tipSatang: paid.reduce((s, b) => s + b.tip, 0), cashInSatang: 0, cashOutSatang: 0, cashRefundsSatang: 0, expectedCashSatang: sp.float + cashSales,
  };
}
function expShifts(f: Filter): Any {
  const rows = (Object.keys(SH_SPEC) as ("SH" | "SH2" | "SH0")[])
    .filter((k) => f.units.includes(SH_SPEC[k].unit) && bkkDate(new Date(SH_SPEC[k].openedAt)) >= f.from && bkkDate(new Date(SH_SPEC[k].openedAt)) <= f.to)
    .map((k) => {
      const sp = SH_SPEC[k];
      const live = shiftLive(k);
      const expected = live.expectedCashSatang;
      return {
        shiftId: ID.shift[k], shiftNo: sp.shiftNo, zNumber: sp.zNumber, unitId: ID.u[sp.unit], status: sp.status, openedByUserId: ID.user[sp.opener],
        billCount: live.billCount, salesTotalSatang: live.salesTotalSatang, tipSatang: live.tipSatang, expectedCashSatang: expected,
        countedCashSatang: sp.counted, overShortSatang: sp.counted === null ? null : sp.counted - expected, forced: false, openedAt: sp.openedAt,
      };
    })
    .sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt));
  const closed = rows.filter((r) => r.overShortSatang !== null);
  const totals = {
    shiftCount: rows.length, billCount: rows.reduce((s, r) => s + r.billCount, 0), salesTotalSatang: rows.reduce((s, r) => s + r.salesTotalSatang, 0),
    overShortSatang: closed.reduce((s, r) => s + (r.overShortSatang ?? 0), 0), shortCount: closed.filter((r) => (r.overShortSatang ?? 0) < 0).length,
    overCount: closed.filter((r) => (r.overShortSatang ?? 0) > 0).length, forcedCount: 0, openCount: rows.filter((r) => r.status === "OPEN").length,
  };
  return { rows, totals };
}
const SHIFT_FIELDS = ["shiftId", "shiftNo", "zNumber", "unitId", "status", "openedByUserId", "billCount", "salesTotalSatang", "tipSatang", "expectedCashSatang", "countedCashSatang", "overShortSatang", "forced"];

function expCard(now: Date, units: string[]): Any {
  const today = bkkDate(now);
  const yest = addDays(today, -1);
  const t = expDaily({ units, from: today, to: today }).totals;
  const y = expDaily({ units, from: yest, to: yest }).totals;
  const top = expProducts({ units, from: today, to: today }).rows[0] ?? null;
  return {
    businessDate: today, netSalesSatang: t.netSalesSatang, billCount: t.billCount, avgBillSatang: t.avgBillSatang, voidCount: t.voidCount, tipSatang: t.tipSatang,
    yesterdayNetSalesSatang: y.netSalesSatang, deltaBp: y.netSalesSatang > 0 ? Math.round(((t.netSalesSatang - y.netSalesSatang) * 10_000) / y.netSalesSatang) : null,
    openShiftCount: (Object.keys(SH_SPEC) as ("SH" | "SH2" | "SH0")[]).filter((k) => SH_SPEC[k].status === "OPEN" && units.includes(SH_SPEC[k].unit)).length,
    topProduct: top ? { key: top.key, name: top.name, qty: top.qty, salesSatang: top.salesSatang } : null,
  };
}
const CARD_FIELDS = ["businessDate", "netSalesSatang", "billCount", "avgBillSatang", "voidCount", "tipSatang", "yesterdayNetSalesSatang", "deltaBp", "openShiftCount"];

// ── เปรียบเทียบ ──
function cmp(label: string, actual: Any, expected: Any, fields: string[], out: string[]): void {
  if (!actual || typeof actual !== "object") {
    out.push(`${label}: ไม่มีแถว (${short(actual, 80)})`);
    return;
  }
  for (const f of fields) {
    const a = actual[f];
    const e = expected[f];
    const same = Array.isArray(e) ? JSON.stringify(a) === JSON.stringify(e) : a === e;
    if (!same) out.push(`${label}.${f}: ${short(a, 40)} ≠ ${short(e, 40)}`);
  }
}
function cmpRows(label: string, rep: Any, exp: Any, fields: string[], out: string[], totalFields?: string[]): void {
  if (!rep || rep.ok !== true) {
    out.push(`${label}: ${codeOf(rep)} ${short(rep?.message ?? "", 80)}`);
    return;
  }
  const rows = rep.report?.rows;
  if (!Array.isArray(rows)) {
    out.push(`${label}: report.rows ไม่ใช่ array`);
    return;
  }
  if (rows.length !== exp.rows.length) out.push(`${label}: ${rows.length} แถว ≠ ${exp.rows.length}`);
  exp.rows.forEach((e: Any, i: number) => cmp(`${label}[${i}]`, rows[i], e, fields, out));
  if (totalFields) cmp(`${label}.totals`, rep.report?.totals, exp.totals, totalFields, out);
}
const lim = (p: string[]) => p.slice(0, 6).join(" · ") + (p.length > 6 ? ` …(+${p.length - 6})` : "") || "ครบ";

// ── CSV ──
const baht = (s: number) => (s / 100).toFixed(2);
function parseCsv(body: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (q) {
      if (c === '"' && body[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && body[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

// ═════════════════════════ 6. ข้อที่ต้องมี DB (sandbox) ═════════════════════════
const DB_IDS = CHECKS.map(([id]) => id).filter((id) => !STATIC_IDS.includes(id) && id !== "P1.17-Z1" && id !== "P1.17-Z2");
const sb = { unitIds: [] as string[], systemIds: [] as string[], itemIds: [] as string[], shiftIds: [] as string[], saleIds: [] as string[] };
const refusals: [string, Any][] = [];

async function runDb() {
  if (!scope) {
    for (const id of DB_IDS) chk(id, false, "seed ร้าน QC POS", "ยังไม่ได้ seed (scripts/seed-pos-qc.mts) — ข้อ DB ตรวจไม่ได้");
    return;
  }
  const tid: string = scope.tenantId;
  const restoTid: string = PQC.resto.tenantId;
  const mOwner = await P.membership.findFirst({ where: { tenantId: tid, userId: PQC.coffee.users.owner.userId } });
  const mCash = await P.membership.findFirst({ where: { tenantId: tid, userId: PQC.coffee.users.cashier.userId } });
  const mROwner = await P.membership.findFirst({ where: { tenantId: restoTid, userId: PQC.resto.users.owner.userId } });
  const actor = (m: Any, userId: string, fallbackRole: string, over: Partial<Any> = {}) => ({
    userId,
    role: m?.role ?? fallbackRole,
    unitAccess: Array.isArray(m?.unitAccess) ? m.unitAccess : [],
    permissions: (m?.permissions ?? {}) as Record<string, unknown>,
    ...over,
  });
  const owner = actor(mOwner, PQC.coffee.users.owner.userId, "OWNER");
  const restoOwner = actor(mROwner, PQC.resto.users.owner.userId, "OWNER");
  ID.user.A = PQC.coffee.users.owner.userId;
  ID.user.B = PQC.coffee.users.cashier.userId;
  for (const k of ["A", "B"]) {
    const u = await P.user.findUnique({ where: { id: ID.user[k] }, select: { name: true, email: true } }).catch(() => null);
    ID.userName[k] = u ? (u.name || u.email || null) : null;
  }

  // ─── sandbox (เขียนแถวแรก ⇒ ด่าน host QC4 ก่อน) ───
  assertQc4BeforeWrite();
  console.log(`\n── sandbox ${TAG} (3 สาขา + POS 2 + คลัง 1 ชั่วคราวในร้าน QC กาแฟ · บิล ${BILLS.length} · กะ 3) ──`);
  let fx = "";
  try {
    for (const label of ["u1", "u2", "u3"]) {
      const u = await P.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: `${TAG} ${label}`, slug: `${TAG}-${label}` } });
      sb.unitIds.push(u.id);
      ID.u[label] = u.id;
      ID.unitName[label] = u.name;
    }
    for (const [k, type] of [["S", "POS"], ["S2", "POS"], ["INV", "INVENTORY"]] as const) {
      const s = await P.appSystem.create({ data: { tenantId: tid, type, name: `${TAG} ${k}`, settings: {} } });
      sb.systemIds.push(s.id);
      ID[k] = s.id;
    }
    await sysSvc.linkUnit(tid, ID.S, ID.u.u1);
    await sysSvc.linkUnit(tid, ID.S, ID.u.u2);
    await sysSvc.linkUnit(tid, ID.S2, ID.u.u3);
    for (const pk of ["pA", "pB"]) {
      const it = await P.invItem.create({ data: { tenantId: tid, systemId: ID.INV, sku: `${TAG}-${pk}`, name: PNAME[pk], costSatang: ITEM_COST[pk] } });
      sb.itemIds.push(it.id);
      ID.item[pk] = it.id;
      ID.product[pk] = `${TAG}-prod-${pk}`; // PosProduct.id หลวม (ไม่มี FK) — รายงานจัดกลุ่มตาม productId ของบรรทัด
    }
    ID.service = `${TAG}-svc-sC`;
    // กะ (ก่อนบิล — บิลอ้าง shiftId)
    for (const k of ["SH", "SH2", "SH0"] as const) {
      const sp = SH_SPEC[k];
      const live = shiftLive(k);
      const closed = sp.status !== "OPEN";
      const row = await PS.create({
        data: {
          tenantId: tid, unitId: ID.u[sp.unit], systemId: ID.S, deviceId: `qc117-${RAND}-${k}`, deviceLabel: `${TAG} ${k}`, shiftNo: sp.shiftNo, status: sp.status,
          openedByUserId: ID.user[sp.opener], openedAt: new Date(sp.openedAt), floatSatang: sp.float,
          ...(closed
            ? {
                closedByUserId: ID.user[sp.opener], closedAt: new Date(sp.closedAt as string), expectedCashSatang: live.expectedCashSatang, countedCashSatang: sp.counted,
                overShortSatang: (sp.counted as number) - live.expectedCashSatang, zNumber: sp.zNumber, closeKey: `${TAG}-close-${k}`, closeNote: "QC P1.17",
              }
            : {}),
        },
      });
      ID.shift[k] = row.id;
      sb.shiftIds.push(row.id);
    }
    // บิล
    for (const b of CB) {
      const sale = await P.posSale.create({
        data: {
          tenantId: tid, unitId: ID.u[b.unit], systemId: ID[b.sys], idempotencyKey: `${TAG}-${b.k}`, receiptNo: rnoOf(b), status: b.status,
          subtotalSatang: b.subtotal, discountSatang: b.billDisc, vatSatang: b.vatS, grandTotalSatang: b.grand, serviceChargeSatang: b.svc, tipSatang: b.tip,
          shiftId: b.shift ? ID.shift[b.shift] : null, paidAt: b.atD, createdAt: b.atD,
          ...(HAS_SOLDBY ? { soldByUserId: b.soldBy ? ID.user[b.soldBy] : null } : {}),
        },
      });
      ID.sale[b.k] = sale.id;
      sb.saleIds.push(sale.id);
      ID.line[b.k] = [];
      for (const [i, l] of b.lines.entries()) {
        const line = await P.posSaleLine.create({
          data: {
            tenantId: tid, unitId: ID.u[b.unit], saleId: sale.id, name: PNAME[l.pk], qty: l.qty, unitPriceSatang: l.unit, discountSatang: l.disc ?? 0, lineTotalSatang: b.lineTotals[i],
            itemId: l.pk === "pA" || l.pk === "pB" ? ID.item[l.pk] : null, productId: l.pk === "pA" || l.pk === "pB" ? ID.product[l.pk] : null, serviceId: l.pk === "sC" ? ID.service : null,
          },
        });
        ID.line[b.k].push(line.id);
        if (l.move) {
          await P.invMovement.create({
            data: {
              tenantId: tid, systemId: ID.INV, itemId: ID.item[l.pk], type: "OUT", qtyDelta: -l.move.qty, balanceAfter: -l.move.qty, costSatang: l.move.cost,
              sourceModule: "POS", refType: "PosSale", refId: sale.id, idempotencyKey: `pos-consume-${sale.id}-${line.id}`, createdAt: b.atD,
            },
          });
        }
      }
      for (const p of b.pays) {
        await P.posPayment.create({
          data: { tenantId: tid, unitId: ID.u[b.unit], saleId: sale.id, type: p.type, amountSatang: p.amount, ...(p.type === "CASH" ? { tenderedSatang: p.tendered ?? null, changeSatang: p.change ?? null } : {}) },
        });
      }
    }
    // Z แช่แข็งของกะที่ปิด (ทรง ShiftReport ของ P1.9 · ค่าจากการคำนวณของข้อสอบ)
    for (const k of ["SH", "SH0"] as const) {
      const sp = SH_SPEC[k];
      const live = shiftLive(k);
      await PS.update({
        where: { id: ID.shift[k] },
        data: {
          zReport: {
            shiftId: ID.shift[k], shiftNo: sp.shiftNo, zNumber: sp.zNumber, status: "CLOSED", unitId: ID.u[sp.unit], deviceId: `qc117-${RAND}-${k}`, deviceLabel: `${TAG} ${k}`,
            openedByUserId: ID.user[sp.opener], openedAt: sp.openedAt, floatSatang: sp.float, ...live, countedCashSatang: sp.counted,
            overShortSatang: (sp.counted as number) - live.expectedCashSatang, countDetail: null, countedByMethod: null, note: "QC P1.17", closedByUserId: ID.user[sp.opener], closedAt: sp.closedAt, forced: false,
          },
        },
      });
    }
  } catch (e) {
    fx = `sandbox:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;

  const ctx = (over: Any = {}): Any => ({ tenantId: tid, systemId: ID.S, ...over });
  const RANGE = { from: D1, to: D2 };
  const F12: Filter = { units: ALL_UNITS, from: D1, to: D2 };
  const R = async (fn: string, c: Any, a: Any, input: Any): Promise<Any> => {
    const r = await call(rep, fn, c, a, input);
    if (r?.ok === false && !r?.missing) refusals.push([fn, r]);
    return r;
  };

  // ─── F1 ข้อมูลทดสอบ + ข้อสอบตรวจตัวเอง ───
  {
    const p: string[] = [];
    if (fx) p.push(fx);
    for (const b of CB) {
      const paid = b.pays.reduce((s, x) => s + x.amount, 0);
      if (paid !== b.grand + b.tip) p.push(`${b.k}: Σจ่าย ${paid} ≠ ${b.grand}+${b.tip}`);
    }
    const d = expDaily(F12);
    const lit: [string, number, number][] = [
      ["D1 net", d.rows[0]?.netSalesSatang, 55_450], ["D1 bills", d.rows[0]?.billCount, 4], ["D1 vat", d.rows[0]?.vatSatang, 3_431], ["D1 svc", d.rows[0]?.serviceChargeSatang, 2_450],
      ["D1 tip", d.rows[0]?.tipSatang, 1_000], ["D1 void", d.rows[0]?.voidTotalSatang, 18_000], ["D2 net", d.rows[1]?.netSalesSatang, 9_000], ["D2 bills", d.rows[1]?.billCount, 2], ["D2 vat", d.rows[1]?.vatSatang, 588],
      ["products Σ", expProducts(F12).totals.salesSatang, 63_000], ["pay Σ", expPayments(F12).totals.totalPaidSatang, 65_450],
      ["margin cost", expMargin(F12).totals.costSatang, 13_600], ["margin net", expMargin(F12).totals.netMarginSatang, 46_831], ["SH expected", shiftLive("SH").expectedCashSatang, 72_450],
      ["card deltaBp", expCard(new Date("2026-09-15T03:00:00Z"), ALL_UNITS).deltaBp, -8_377],
    ];
    for (const [n, a, e] of lit) if (a !== e) p.push(`ข้อสอบคำนวณ ${n} = ${a} ≠ brief ${e}`);
    if (!fx) {
      const n = await P.posSale.count({ where: { id: { in: sb.saleIds } } }).catch(() => -1);
      if (n !== BILLS.length) p.push(`บิลใน DB ${n} ≠ ${BILLS.length}`);
      const dbVat = ((await P.posSale.findMany({ where: { id: { in: sb.saleIds } }, select: { idempotencyKey: true, vatSatang: true, grandTotalSatang: true } }).catch(() => [])) as Any[]);
      for (const r of dbVat) {
        const b = CB.find((x) => `${TAG}-${x.k}` === r.idempotencyKey);
        if (b && (b.vatS !== r.vatSatang || b.grand !== r.grandTotalSatang)) p.push(`${b.k}: DB ไม่ตรงสเปก`);
      }
    }
    if (!HAS_SOLDBY) console.log("  ⚠️  PosSale.soldByUserId ยังไม่มี — บิลไม่มีผู้ขาย (SF1/SF2/SB1 จะแดงตามเหตุผลนี้)");
    chk("P1.17-F1", p.length === 0, "ข้อมูลครบ · เอกลักษณ์ · ค่าตรง brief", lim(p));
  }

  // ─── D รายวัน ───
  const daily = await R("reportDailySales", ctx(), owner, RANGE);
  {
    const p: string[] = [];
    if (daily?.ok === true && (daily.report?.from !== D1 || daily.report?.to !== D2)) p.push(`report.from/to ${daily.report?.from}/${daily.report?.to}`);
    cmpRows("daily", daily, expDaily(F12), DAILY_FIELDS, p, DAILY_FIELDS.filter((f) => f !== "businessDate"));
    const t = daily?.report?.totals;
    if (t && t.netSalesSatang !== t.grossSatang - t.discountSatang + t.serviceChargeSatang) p.push("net ≠ gross − discount + service");
    if (t && t.netExVatSatang !== t.netSalesSatang - t.vatSatang) p.push("netExVat ≠ net − vat");
    chk("P1.17-D1", p.length === 0, "D1/D2/รวม ตรงข้อสอบ", FX(lim(p)));
  }
  {
    const p: string[] = [];
    const wide = await R("reportDailySales", ctx(), owner, { from: "2026-09-12", to: "2026-09-16" });
    cmpRows("09-12..16", wide, expDaily({ units: ALL_UNITS, from: "2026-09-12", to: "2026-09-16" }), ["businessDate", "billCount", "netSalesSatang", "vatSatang", "tipSatang", "voidCount"], p, ["billCount", "netSalesSatang"]);
    const one = await R("reportDailySales", ctx(), owner, { from: D1, to: D1 });
    cmpRows("D1 เดี่ยว", one, expDaily({ units: ALL_UNITS, from: D1, to: D1 }), ["businessDate", "billCount", "netSalesSatang"], p);
    if (CB.find((b) => b.k === "B5")?.date !== D1 || CB.find((b) => b.k === "B6")?.date !== D2 || CB.find((b) => b.k === "B7")?.date !== D2) p.push("สเปกข้อสอบเรื่องเวลาไทยผิด");
    chk("P1.17-D2", p.length === 0, "ตัดวันเวลาไทย · แถวศูนย์ · ขอบช่วง", FX(lim(p)));
  }
  {
    const p: string[] = [];
    for (const d of [D1, D2]) {
      const leg = await call(svc, "closeDaySummary", { tenantId: tid, systemId: ID.S }, d);
      const row = daily?.report?.rows?.find?.((r: Any) => r?.businessDate === d);
      if (!row) p.push(`${d}: ไม่มีแถวรายงาน (${codeOf(daily)})`);
      else if (!leg || leg.ok === false) p.push(`${d}: closeDaySummary ${codeOf(leg)}`);
      else
        for (const [a, b] of [["netSalesSatang", "netSalesSatang"], ["billCount", "billCount"], ["voidCount", "voidCount"], ["voidTotalSatang", "voidTotalSatang"]])
          if (row[a] !== leg[b]) p.push(`${d}.${a} ${row[a]} ≠ ปิดวัน ${leg[b]}`);
    }
    chk("P1.17-D3", p.length === 0, "เท่าหน้าปิดวันเดิม", FX(lim(p)));
  }
  {
    const p: string[] = [];
    const u2 = await R("reportDailySales", ctx({ unitId: ID.u.u2 }), owner, RANGE);
    cmpRows("u2", u2, expDaily({ units: ["u2"], from: D1, to: D2 }), ["businessDate", "billCount", "netSalesSatang", "vatSatang"], p, ["billCount", "netSalesSatang"]);
    chk("P1.17-D4", p.length === 0, "D1 3,000/1 · D2 4,500/1", FX(lim(p)));
  }

  // ─── PR สินค้า ───
  const prod = await R("reportProducts", ctx(), owner, RANGE);
  {
    const p: string[] = [];
    cmpRows("products", prod, expProducts(F12), PRODUCT_FIELDS, p);
    chk("P1.17-PR1", p.length === 0, "4 แถว ลาเต้/บริการ/เค้ก/พิมพ์เอง", FX(lim(p)));
  }
  {
    const p: string[] = [];
    const e = expProducts(F12).totals.salesSatang;
    const sumRows = Array.isArray(prod?.report?.rows) ? prod.report.rows.reduce((s: number, r: Any) => s + (Number(r?.salesSatang) || 0), 0) : NaN;
    if (sumRows !== e) p.push(`Σ แถว ${sumRows} ≠ ${e}`);
    if (prod?.report?.totals?.salesSatang !== e) p.push(`totals.salesSatang ${prod?.report?.totals?.salesSatang} ≠ ${e}`);
    if (daily?.report?.totals?.grossSatang !== e) p.push(`daily.totals.grossSatang ${daily?.report?.totals?.grossSatang} ≠ ${e}`);
    if (prod?.ok !== true) p.push(`products ${codeOf(prod)}`);
    chk("P1.17-PR2", p.length === 0, "Σ = 63,000 ทั้งสามทาง", FX(lim(p)));
  }

  // ─── SF พนักงาน ───
  const staff = await R("reportStaff", ctx(), owner, RANGE);
  {
    const p: string[] = [];
    if (!HAS_SOLDBY) p.push("PosSale.soldByUserId ยังไม่มี");
    const e = expStaff(F12);
    cmpRows("staff", staff, e, STAFF_FIELDS, p, ["billCount", "netSalesSatang", "voidCount"]);
    for (const [i, r] of e.rows.entries()) if (r.userId && (staff?.report?.rows?.[i]?.name ?? null) !== r.name) p.push(`ชื่อแถว ${i} ${short(staff?.report?.rows?.[i]?.name, 30)} ≠ ${r.name}`);
    chk("P1.17-SF1", p.length === 0, "B 43,450 · A 16,500 · null 4,500", FX(lim(p)));
  }
  {
    const p: string[] = [];
    if (!HAS_SOLDBY) p.push("PosSale.soldByUserId ยังไม่มี");
    const rows: Any[] = Array.isArray(staff?.report?.rows) ? staff.report.rows : [];
    const rb = rows.find((r) => r?.userId === ID.user.B);
    const rn = rows.find((r) => r?.userId === null);
    if (!rb || rb.billCount !== 3 || rb.voidCount !== 1) p.push(`B: ${short(rb, 80)} (ต้อง 3 บิลรวมบิล 06:30 ผ่านกะ · ยกเลิก 1)`);
    if (!rn || rn.billCount !== 1 || rn.netSalesSatang !== 4500) p.push(`null: ${short(rn, 80)}`);
    if (staff?.ok !== true) p.push(`staff ${codeOf(staff)}`);
    chk("P1.17-SF2", p.length === 0, "soldBy ?? ผู้เปิดกะ ?? null", FX(lim(p)));
  }

  // ─── PM วิธีชำระ ───
  const pay = await R("reportPayments", ctx(), owner, RANGE);
  {
    const p: string[] = [];
    const e = expPayments(F12);
    cmpRows("payments", pay, e, ["type", "label", "count", "billCount", "amountSatang"], p);
    const cash = (pay?.report?.rows ?? []).find?.((r: Any) => r?.type === "CASH");
    const ec = e.rows.find((r: Any) => r.type === "CASH");
    if (cash && (cash.cashTenderedSatang !== ec.cashTenderedSatang || cash.changeSatang !== ec.changeSatang)) p.push(`CASH รับ/ทอน ${cash.cashTenderedSatang}/${cash.changeSatang} ≠ ${ec.cashTenderedSatang}/${ec.changeSatang}`);
    chk("P1.17-PM1", p.length === 0, "CASH 35,950 · PROMPTPAY 5,000 · TRANSFER 4,500 · CARD 20,000", FX(lim(p)));
  }
  {
    const p: string[] = [];
    if (pay?.ok !== true) p.push(`payments ${codeOf(pay)}`);
    else cmp("payments.totals", pay.report?.totals, expPayments(F12).totals, ["totalPaidSatang", "salesSatang", "tipSatang", "billCount"], p);
    chk("P1.17-PM2", p.length === 0, "65,450 = 64,450 + 1,000", FX(lim(p)));
  }

  // ─── MG กำไร ───
  const mg = await R("reportMargin", ctx(), owner, RANGE);
  {
    const p: string[] = [];
    cmpRows("margin", mg, expMargin(F12), MARGIN_FIELDS, p);
    chk("P1.17-MG1", p.length === 0, "ลาเต้ 6,100/16,400/7288bp · เค้ก 7,500 ประมาณ · บริการ/พิมพ์เอง null", FX(lim(p)));
  }
  {
    const p: string[] = [];
    if (mg?.ok !== true) p.push(`margin ${codeOf(mg)}`);
    else cmp("margin.totals", mg.report?.totals, expMargin(F12).totals, ["revenueSatang", "costedRevenueSatang", "costSatang", "estimatedCostSatang", "grossMarginSatang", "uncostedRevenueSatang", "uncostedLineCount", "netExVatSatang", "netMarginSatang"], p);
    chk("P1.17-MG2", p.length === 0, "13,600 · 26,400 · 60,431 · 46,831", FX(lim(p)));
  }

  // ─── TX ภาษี ───
  const tax = await R("reportTax", ctx(), owner, RANGE);
  {
    const p: string[] = [];
    const e = expTax(F12);
    cmpRows("tax", tax, e, TAX_FIELDS, p);
    (tax?.report?.rows ?? []).forEach?.((r: Any, i: number) => {
      if (e.rows[i] && JSON.stringify(r?.voidReceiptNos ?? null) !== JSON.stringify(e.rows[i].voidReceiptNos)) p.push(`tax[${i}].voidReceiptNos ${short(r?.voidReceiptNos, 60)}`);
    });
    chk("P1.17-TX1", p.length === 0, "4 แถว (วัน × สาขา)", FX(lim(p)));
  }
  {
    const p: string[] = [];
    if (tax?.ok !== true) p.push(`tax ${codeOf(tax)}`);
    else {
      cmp("tax.totals", tax.report?.totals, expTax(F12).totals, ["billCount", "grossSatang", "vatSatang", "baseSatang", "nonVatGrossSatang", "voidCount"], p);
      const dbVat = ((await P.posSale.findMany({ where: { id: { in: sb.saleIds }, systemId: ID.S, status: "PAID", createdAt: { gte: new Date("2026-09-13T17:00:00Z"), lt: new Date("2026-09-15T17:00:00Z") } }, select: { vatSatang: true } }).catch(() => [])) as Any[]).reduce((s, r) => s + r.vatSatang, 0);
      if (tax.report?.totals?.vatSatang !== dbVat) p.push(`Σ VAT ${tax.report?.totals?.vatSatang} ≠ DB ${dbVat}`);
      const u2d1 = (tax.report?.rows ?? []).find?.((r: Any) => r?.businessDate === D1 && r?.unitId === ID.u.u2);
      if (!u2d1 || u2d1.vatSatang !== 0 || u2d1.nonVatGrossSatang !== 3000) p.push(`D1/u2 ${short(u2d1, 80)} (ต้อง VAT 0 · nonVat 3,000)`);
    }
    chk("P1.17-TX2", p.length === 0, "VAT จากคอลัมน์ 4,019", FX(lim(p)));
  }

  // ─── CSV ───
  const csvOf = (kind: string, c: Any = ctx(), a: Any = owner, range: Any = RANGE) => R("reportCsv", c, a, { kind, ...range });
  {
    const p: string[] = [];
    const r = await csvOf("daily");
    if (r?.ok !== true) p.push(`csv ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      if (r.filename !== `pos-daily-${D1}_${D2}.csv`) p.push(`filename ${short(r.filename, 60)}`);
      if (!/^text\/csv;\s*charset=utf-8$/i.test(String(r.contentType ?? ""))) p.push(`contentType ${short(r.contentType, 40)}`);
      const body = String(r.body ?? "");
      if (!body.startsWith("\uFEFF")) p.push("ไม่ขึ้นต้น BOM");
      const rows = parseCsv(body.replace(/^\uFEFF/, ""));
      if (JSON.stringify(rows[0]) !== JSON.stringify(CSV_HEADERS.daily)) p.push(`หัวตาราง ${short(rows[0], 80)}`);
      const e = expDaily(F12);
      const toCells = (x: Any, first: string) => [first, String(x.billCount), baht(x.grossSatang), baht(x.discountSatang), baht(x.serviceChargeSatang), baht(x.netSalesSatang), baht(x.vatSatang), baht(x.netExVatSatang), baht(x.tipSatang), String(x.voidCount), baht(x.voidTotalSatang), baht(x.avgBillSatang)];
      const want = [...e.rows.map((x: Any) => toCells(x, x.businessDate)), toCells(e.totals, "รวม")];
      if (rows.length - 1 !== want.length) p.push(`แถวข้อมูล ${rows.length - 1} ≠ ${want.length}`);
      want.forEach((w, i) => {
        if (JSON.stringify(rows[i + 1]) !== JSON.stringify(w)) p.push(`แถว ${i + 1}: ${short(rows[i + 1], 90)} ≠ ${short(w, 90)}`);
      });
    }
    chk("P1.17-CSV1", p.length === 0, "BOM · หัว · 2+รวม · บาท 2 ตำแหน่ง · filename", FX(lim(p)));
  }
  {
    const p: string[] = [];
    const reps: Record<string, Any> = { daily, products: prod, staff, payments: pay, margin: mg, tax };
    reps.shifts = await R("reportShifts", ctx(), owner, RANGE);
    for (const k of KINDS) {
      const r = await csvOf(k);
      if (r?.ok !== true) {
        p.push(`${k}: ${codeOf(r)}`);
        continue;
      }
      const body = String(r.body ?? "");
      if (!body.startsWith("\uFEFF")) p.push(`${k}: ไม่มี BOM`);
      if (r.filename !== `pos-${k}-${D1}_${D2}.csv`) p.push(`${k}: filename ${short(r.filename, 50)}`);
      const rows = parseCsv(body.replace(/^\uFEFF/, ""));
      if (JSON.stringify(rows[0]) !== JSON.stringify(CSV_HEADERS[k])) p.push(`${k}: หัว ${short(rows[0], 80)}`);
      const n = Array.isArray(reps[k]?.report?.rows) ? reps[k].report.rows.length : NaN;
      if (rows.length !== n + 2) p.push(`${k}: ${rows.length} บรรทัด ≠ หัว+${n}+รวม`);
      if (rows.length && rows[rows.length - 1][0] !== "รวม") p.push(`${k}: แถวท้ายไม่ใช่ "รวม"`);
      if (k === "products") {
        if (!body.includes(`"พิมพ์เอง, ""พิเศษ"""`)) p.push("products: ชื่อมี , \" ไม่ถูก escape");
        if (!rows.some((x) => x[1] === CUSTOM_NAME)) p.push("products: อ่านชื่อกลับไม่ได้");
      }
    }
    chk("P1.17-CSV2", p.length === 0, "7 ชนิด BOM + หัว + แถว + escape", FX(lim(p)));
  }

  // ─── CD การ์ด ───
  const NOW = new Date("2026-09-15T03:00:00Z");
  {
    const p: string[] = [];
    const r = await R("posDashboardCard", ctx(), owner, { now: NOW });
    if (r?.ok !== true) p.push(`card ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      const e = expCard(NOW, ALL_UNITS);
      cmp("card", r.card, e, CARD_FIELDS, p);
      const tp = r.card?.topProduct;
      if (!tp || tp.key !== e.topProduct.key || tp.qty !== e.topProduct.qty || tp.salesSatang !== e.topProduct.salesSatang) p.push(`topProduct ${short(tp, 80)}`);
    }
    chk("P1.17-CD1", p.length === 0, "9,000/2 · เมื่อวาน 55,450 · −8,377bp · กะเปิด 1 · ลาเต้", FX(lim(p)));
  }

  // ─── V ช่วงวัน ───
  {
    const p: string[] = [];
    const bad: [string, Any][] = [
      ["from>to", { from: D2, to: D1 }], ["2026-9-14", { from: "2026-9-14", to: D2 }], ["02-30", { from: "2026-02-30", to: "2026-03-01" }],
      ["ตัวเลข", { from: 20260914, to: 20260915 }], ["ไม่ส่ง", {}], ["93 วัน", { from: "2026-01-01", to: "2026-04-03" }],
    ];
    for (const [n, input] of bad) {
      for (const fn of [...KINDS.map((k) => KIND_FN[k])]) {
        const r = await R(fn, ctx(), owner, input);
        if (!(r?.ok === false && r.code === "VALIDATION")) p.push(`${fn} ${n} → ${codeOf(r)}`);
      }
      const c = await R("reportCsv", ctx(), owner, { kind: "daily", ...input });
      if (!(c?.ok === false && c.code === "VALIDATION")) p.push(`csv ${n} → ${codeOf(c)}`);
    }
    const ok92 = await R("reportDailySales", ctx(), owner, { from: "2026-01-01", to: "2026-04-02" });
    if (ok92?.ok !== true || ok92.report?.rows?.length !== 92) p.push(`92 วัน → ${codeOf(ok92)} แถว ${ok92?.report?.rows?.length}`);
    const kind = await R("reportCsv", ctx(), owner, { kind: "bogus", ...RANGE });
    if (!(kind?.ok === false && kind.code === "VALIDATION")) p.push(`kind bogus → ${codeOf(kind)}`);
    chk("P1.17-V1", p.length === 0, "VALIDATION ทุกกรณี · 92 วัน ok", FX(lim(p)));
  }

  // ─── A สิทธิ์ ───
  const units = [ID.u.u1, ID.u.u2, ID.u.u3].filter(Boolean);
  {
    const p: string[] = [];
    const sellOnly = actor(mCash, ID.user.B, "STAFF", { role: "STAFF", unitAccess: units, permissions: { "pos.sale.create": true } });
    const none = actor(mCash, ID.user.B, "STAFF", { role: "STAFF", unitAccess: units, permissions: {} });
    for (const k of KINDS) {
      const r = await R(KIND_FN[k], ctx(), sellOnly, RANGE);
      if (!(r?.ok === false && r.code === "PERMISSION_DENIED")) p.push(`${k} → ${codeOf(r)}`);
    }
    const c = await R("reportCsv", ctx(), sellOnly, { kind: "daily", ...RANGE });
    if (!(c?.ok === false && c.code === "PERMISSION_DENIED")) p.push(`csv → ${codeOf(c)}`);
    const card = await R("posDashboardCard", ctx(), sellOnly, { now: NOW });
    if (card?.ok !== true) p.push(`การ์ด (sale.create) → ${codeOf(card)}`);
    const card0 = await R("posDashboardCard", ctx(), none, { now: NOW });
    if (!(card0?.ok === false && card0.code === "PERMISSION_DENIED")) p.push(`การ์ด (ไม่มีสิทธิ์) → ${codeOf(card0)}`);
    chk("P1.17-A1", p.length === 0, "7 + CSV = PERMISSION_DENIED · การ์ด ok / DENIED", FX(lim(p)));
  }
  {
    const p: string[] = [];
    const u1Only = actor(mCash, ID.user.B, "STAFF", { role: "STAFF", unitAccess: [ID.u.u1], permissions: { "pos.report.view": true, "pos.sale.create": true } });
    const r = await R("reportDailySales", ctx(), u1Only, RANGE);
    cmpRows("u1-only", r, expDaily({ units: ["u1"], from: D1, to: D2 }), ["businessDate", "billCount", "netSalesSatang"], p, ["billCount", "netSalesSatang"]);
    const x = await R("reportDailySales", ctx({ unitId: ID.u.u2 }), u1Only, RANGE);
    if (!(x?.ok === false && x.code === "NOT_FOUND")) p.push(`unitId u2 → ${codeOf(x)}`);
    const card = await R("posDashboardCard", ctx(), u1Only, { now: NOW });
    if (card?.ok !== true) p.push(`การ์ด ${codeOf(card)}`);
    else cmp("card(u1)", card.card, expCard(NOW, ["u1"]), ["netSalesSatang", "billCount", "openShiftCount", "yesterdayNetSalesSatang"], p);
    chk("P1.17-A2", p.length === 0, "u1 เท่านั้น · u2 NOT_FOUND · การ์ด u1", FX(lim(p)));
  }

  // ─── OV ภาพรวมในคำขอเดียว (P1.17U R6) ───
  {
    const OV = (c: Any, a: Any, input: Any) => call(ovMod, "reportOverview", c, a, input);
    const J = (v: Any) => JSON.stringify(v);
    /** ส่วนของภาพรวม (data) = รายงานเดิม (report) — เทียบทั้งก้อนยกเว้น generatedAt */
    const same = (label: string, part: Any, direct: Any, out: string[], pick: (x: Any) => Any = (x) => ({ ...x, generatedAt: undefined })) => {
      if (part?.ok !== true) return void out.push(`${label} ส่วน → ${codeOf(part)}`);
      if (direct?.ok !== true) return void out.push(`${label} รายงานเดิม → ${codeOf(direct)}`);
      if (J(pick(part.data)) !== J(pick(direct.report))) out.push(`${label} ไม่ตรง ${short(pick(part.data), 80)} ≠ ${short(pick(direct.report), 80)}`);
    };
    const tot = (x: Any) => x?.totals ?? x;
    const p: string[] = [];
    const o = await OV(ctx(), owner, RANGE);
    if (o?.ok !== true) p.push(`ภาพรวม → ${codeOf(o)} ${short(o, 80)}`);
    else {
      const v = o.overview;
      if (J(v.prevRange) !== J({ from: "2026-09-12", to: "2026-09-13" })) p.push(`prevRange ${J(v.prevRange)}`);
      if (J(v.chartRange) !== J({ from: "2026-09-02", to: D2 })) p.push(`chartRange ${J(v.chartRange)}`);
      same("daily", v.daily, await call(rep, "reportDailySales", ctx(), owner, RANGE), p);
      same("prev", v.prev, await call(rep, "reportDailySales", ctx(), owner, v.prevRange), p);
      same("payments", v.payments, await call(rep, "reportPayments", ctx(), owner, RANGE), p);
      same("staff", v.staff, await call(rep, "reportStaff", ctx(), owner, RANGE), p);
      same("chart", v.chart, await call(rep, "reportDailySales", ctx(), owner, { from: "2026-09-02", to: D2 }), p);
      const mg = await call(rep, "reportMargin", ctx(), owner, RANGE);
      same("margin.totals", v.margin, mg, p, tot);
      const pr = await call(rep, "reportProducts", ctx(), owner, { ...RANGE, limit: 5 });
      const top = (v.margin?.data?.rows ?? []).map((r: Any) => [r.key, r.name, r.qty, r.revenueSatang]);
      const topP = (pr?.report?.rows ?? []).map((r: Any) => [r.key, r.name, r.qty, r.salesSatang]);
      if (top.length === 0 || J(top) !== J(topP)) p.push(`สินค้าขายดีจาก margin ${short(top, 90)} ≠ สินค้า ${short(topP, 90)}`);
      const b = v.branches?.data;
      if (v.branches?.ok !== true) p.push(`branches → ${codeOf(v.branches)}`);
      else {
        const ids = (b.rows ?? []).map((r: Any) => r.unitId);
        if (J([...ids].sort()) !== J([ID.u.u1, ID.u.u2].sort())) p.push(`สาขา ${J(ids)} (ต้อง u1,u2)`);
        for (const r of b.rows ?? []) {
          const d = await call(rep, "reportDailySales", ctx({ unitId: r.unitId }), owner, RANGE);
          if (r.daily?.ok !== true || J(r.daily.data) !== J(d?.report?.totals)) p.push(`สาขา ${r.unitId} daily ไม่ตรง`);
          const m = await call(rep, "reportMargin", ctx({ unitId: r.unitId }), owner, RANGE);
          if (r.margin?.ok !== true || J(r.margin.data) !== J(m?.report?.totals)) p.push(`สาขา ${r.unitId} margin ไม่ตรง`);
        }
        const all = await call(rep, "reportDailySales", ctx(), owner, RANGE);
        if (b.all?.daily?.ok !== true || J(b.all.daily.data) !== J(all?.report?.totals)) p.push("แถวรวม daily ไม่ตรง");
        if (b.all?.margin?.ok !== true || J(b.all.margin.data) !== J(mg?.report?.totals)) p.push("แถวรวม margin ไม่ตรง");
      }
    }
    chk("P1.17-OV1", p.length === 0, "ทุกส่วน = รายงานเดิม", FX(lim(p)));
  }
  {
    const p: string[] = [];
    const OV = (c: Any, a: Any, input: Any) => call(ovMod, "reportOverview", c, a, input);
    const SECS = ["daily", "prev", "margin", "payments", "staff", "chart"];
    const sellOnly = actor(mCash, ID.user.B, "STAFF", { role: "STAFF", unitAccess: units, permissions: { "pos.sale.create": true } });
    const none = actor(mCash, ID.user.B, "STAFF", { role: "STAFF", unitAccess: units, permissions: {} });
    const cashier = actor(mCash, ID.user.B, "STAFF"); // สิทธิ์จริงของแคชเชียร์ QC (ไม่มี pos.report.view)
    for (const [n, a] of [["ขายอย่างเดียว", sellOnly], ["ไม่มีสิทธิ์", none], ["แคชเชียร์ QC", cashier]] as [string, Any][]) {
      const o = await OV(ctx(), a, RANGE);
      if (o?.ok !== true) p.push(`${n} → ทั้งก้อน ${codeOf(o)} (ต้อง ok:true + ปฏิเสธต่อส่วน)`);
      else {
        for (const k of SECS) if (!(o.overview[k]?.ok === false && o.overview[k].code === "PERMISSION_DENIED")) p.push(`${n} ${k} → ${codeOf(o.overview[k])}`);
        const br = o.overview.branches;
        if (!(br?.ok === true && br.data.rows.length === 0)) p.push(`${n} สาขา → ${short(br, 60)} (ต้องว่าง)`);
      }
    }
    const u1Only = actor(mCash, ID.user.B, "STAFF", { role: "STAFF", unitAccess: [ID.u.u1], permissions: { "pos.report.view": true, "pos.sale.create": true } });
    const o1 = await OV(ctx(), u1Only, RANGE);
    const d1 = await call(rep, "reportDailySales", ctx({ unitId: ID.u.u1 }), owner, RANGE);
    if (o1?.ok !== true || o1.overview.daily?.ok !== true || JSON.stringify(o1.overview.daily.data.totals) !== JSON.stringify(d1?.report?.totals)) p.push(`u1 เท่านั้น daily → ${short(o1?.overview?.daily, 80)}`);
    else if (!(o1.overview.branches?.ok === true && o1.overview.branches.data.rows.length === 0 && o1.overview.branches.data.totalUnits === 1)) p.push(`u1 เท่านั้น สาขา ${short(o1.overview.branches, 60)}`);
    const o2 = await OV(ctx({ unitId: ID.u.u2 }), u1Only, RANGE);
    if (o2?.ok !== true) p.push(`u1 เท่านั้น ส่ง u2 → ทั้งก้อน ${codeOf(o2)}`);
    else for (const k of SECS) if (!(o2.overview[k]?.ok === false && o2.overview[k].code === "NOT_FOUND")) p.push(`ส่ง u2 ${k} → ${codeOf(o2.overview[k])}`);
    const ow = await OV(ctx({ unitId: ID.u.u2 }), owner, RANGE);
    const d2 = await call(rep, "reportDailySales", ctx({ unitId: ID.u.u2 }), owner, RANGE);
    const all = await call(rep, "reportDailySales", ctx(), owner, RANGE);
    if (ow?.ok !== true || ow.overview.daily?.ok !== true || JSON.stringify(ow.overview.daily.data.totals) !== JSON.stringify(d2?.report?.totals)) p.push(`เจ้าของเลือก u2 daily → ${short(ow?.overview?.daily, 80)}`);
    else {
      const b = ow.overview.branches?.data;
      if (b?.rows?.[0]?.unitId !== ID.u.u2) p.push(`สาขาที่เลือกไม่ขึ้นก่อน ${short(b?.rows?.map?.((r: Any) => r.unitId), 60)}`);
      if (b?.all?.daily?.ok !== true || JSON.stringify(b.all.daily.data) !== JSON.stringify(all?.report?.totals)) p.push("เลือก u2 แถวรวม ≠ ทุกสาขา");
    }
    chk("P1.17-OV2", p.length === 0, "แคชเชียร์ DENIED ต่อส่วน · สาขาจำกัด · NOT_FOUND · เจ้าของ ok", FX(lim(p)));
  }
  {
    const p: string[] = [];
    const OV = (c: Any, a: Any, input: Any) => call(ovMod, "reportOverview", c, a, input);
    const long = await OV(ctx(), owner, { from: "2026-01-01", to: "2026-04-03" });
    if (long?.ok !== true) p.push(`93 วัน → ทั้งก้อน ${codeOf(long)}`);
    else {
      for (const k of ["daily", "prev", "margin", "payments", "staff"]) if (!(long.overview[k]?.ok === false && long.overview[k].code === "VALIDATION")) p.push(`93 วัน ${k} → ${codeOf(long.overview[k])}`);
      if (long.overview.chart?.ok !== true || long.overview.chart.data.rows.length !== 14) p.push(`93 วัน กราฟ → ${codeOf(long.overview.chart)} (ต้อง ok 14 แถว)`);
    }
    const only = await OV(ctx(), owner, { ...RANGE, only: ["payments"] });
    const keys = only?.ok === true ? ["daily", "prev", "margin", "payments", "staff", "chart", "branches"].filter((k) => only.overview[k] !== undefined) : null;
    if (JSON.stringify(keys) !== JSON.stringify(["payments"])) p.push(`only:[payments] → ${codeOf(only)} ${JSON.stringify(keys)}`);
    for (const [n, input] of [["only ไม่รู้จัก", { ...RANGE, only: ["bogus"] }], ["only ว่าง", { ...RANGE, only: [] }], ["ช่วงผิดรูป", { from: "2026-9-14", to: D2 }], ["from > to", { from: D2, to: D1 }]] as [string, Any][]) {
      const r = await OV(ctx(), owner, input);
      if (!(r?.ok === false && r.code === "VALIDATION")) p.push(`${n} → ${codeOf(r)}`);
    }
    chk("P1.17-OV3", p.length === 0, "93 วัน: 5 ส่วน VALIDATION + กราฟ ok · only · VALIDATION ทั้งก้อน", FX(lim(p)));
  }

  // ─── I ข้ามขอบเขต ───
  {
    const p: string[] = [];
    const s2 = await R("reportDailySales", ctx({ systemId: ID.S2 }), owner, { from: D1, to: D1 });
    if (s2?.ok !== true || s2.report?.totals?.billCount !== 1 || s2.report?.totals?.netSalesSatang !== 4500) p.push(`POS S2 → ${codeOf(s2)} ${short(s2?.report?.totals, 60)} (ต้อง 1/4,500)`);
    const pA = (prod?.report?.rows ?? []).find?.((r: Any) => r?.key === pkKey("pA"));
    if (pA && pA.qty !== 5) p.push(`ลาเต้ของ S ${pA.qty} ชิ้น (บิลของ S2 รั่ว?)`);
    for (const [n, c] of [["ระบบคลัง", ctx({ systemId: ID.INV })], ["ไม่มีจริง", ctx({ systemId: `${TAG}-nope` })], ["สาขาร้านอื่น", ctx({ unitId: PQC.resto.units.main.id })]] as [string, Any][]) {
      const r = await R("reportDailySales", c, owner, RANGE);
      if (!(r?.ok === false && r.code === "NOT_FOUND")) p.push(`${n} → ${codeOf(r)}`);
    }
    chk("P1.17-I1", p.length === 0, "S/S2 แยกกัน · NOT_FOUND ×3", FX(lim(p)));
  }
  {
    const p: string[] = [];
    const rc = { tenantId: restoTid, systemId: ID.S };
    for (const fn of ["reportDailySales", "reportTax"]) {
      const r = await R(fn, rc, restoOwner, RANGE);
      if (!(r?.ok === false && r.code === "NOT_FOUND")) p.push(`${fn} → ${codeOf(r)}`);
    }
    const c = await R("reportCsv", rc, restoOwner, { kind: "daily", ...RANGE });
    if (!(c?.ok === false && c.code === "NOT_FOUND")) p.push(`csv → ${codeOf(c)}`);
    const card = await R("posDashboardCard", rc, restoOwner, { now: NOW });
    if (!(card?.ok === false && card.code === "NOT_FOUND")) p.push(`card → ${codeOf(card)}`);
    chk("P1.17-I2", p.length === 0, "NOT_FOUND ×4", FX(lim(p)));
  }

  // ─── SH กะ (SH1 ก่อน · SH2 แก้ DB แล้วตรวจ — ต้องอยู่ท้าย) ───
  const shBefore = await R("reportShifts", ctx(), owner, RANGE);
  {
    const p: string[] = [];
    cmpRows("shifts", shBefore, expShifts(F12), SHIFT_FIELDS, p, ["shiftCount", "billCount", "salesTotalSatang", "overShortSatang", "shortCount", "overCount", "forcedCount", "openCount"]);
    const r0 = (shBefore?.report?.rows ?? [])[0];
    if (r0 && ID.userName.B && r0.openedByName !== ID.userName.B) p.push(`openedByName ${short(r0.openedByName, 30)}`);
    chk("P1.17-SH1", p.length === 0, "SH (Z) + SH2 (สด) · ไม่มี SH0 · −450", FX(lim(p)));
  }

  // ─── SB1 ทางเขียนผู้ขาย (POS S2 / u3 — ไม่กระทบตัวเลขข้างบน) ───
  {
    const p: string[] = [];
    if (!HAS_SOLDBY) p.push("PosSale.soldByUserId ยังไม่มี");
    const mk = async (k: string, soldBy?: string) => {
      const r = await call(svc, "createSale", {
        tenantId: tid, unitId: ID.u.u3, systemId: ID.S2, idempotencyKey: `${TAG}-sb-${k}`, lines: [{ name: `SB1 ${k}`, qty: 1, unitPriceSatang: 1000 }],
        payMethods: [{ type: "CASH", amountSatang: 1000 }], ...(soldBy ? { soldByUserId: soldBy } : {}),
      });
      if (typeof r?.saleId === "string") sb.saleIds.push(r.saleId);
      return r;
    };
    const a = await mk("a", ID.user.B);
    const b = await mk("b");
    const ra = typeof a?.saleId === "string" ? await P.posSale.findUnique({ where: { id: a.saleId } }).catch(() => null) : null;
    const rb = typeof b?.saleId === "string" ? await P.posSale.findUnique({ where: { id: b.saleId } }).catch(() => null) : null;
    if (!ra) p.push(`createSale(soldBy) → ${codeOf(a)} ${short(a?.message ?? "", 60)}`);
    else if (ra.soldByUserId !== ID.user.B) p.push(`soldByUserId ${short(ra.soldByUserId, 30)}`);
    if (!rb) p.push(`createSale() → ${codeOf(b)}`);
    else if (rb.soldByUserId !== null && rb.soldByUserId !== undefined) p.push(`ไม่ส่ง → ${short(rb.soldByUserId, 30)}`);
    else if (HAS_SOLDBY && rb.soldByUserId === undefined) p.push("แถวไม่มีคอลัมน์ soldByUserId");
    chk("P1.17-SB1", p.length === 0, "เขียน soldByUserId · ไม่ส่ง = null", FX(lim(p)));
  }

  // ─── SH2 Z แช่แข็ง: เปลี่ยน B7 (กะ SH ปิดแล้ว) เป็น VOIDED ตรง ๆ ───
  {
    const p: string[] = [];
    let tampered = false;
    if (ID.sale.B7) {
      try {
        await P.posSale.update({ where: { id: ID.sale.B7 }, data: { status: "VOIDED" } });
        tampered = true;
      } catch (e) {
        p.push(`แก้บิล B7 ไม่ได้: ${(e as Error).message.slice(0, 60)}`);
      }
    } else p.push("ไม่มีบิล B7");
    const after = await R("reportShifts", ctx(), owner, RANGE);
    const rowB = (shBefore?.report?.rows ?? []).find?.((r: Any) => r?.shiftId === ID.shift.SH);
    const rowA = (after?.report?.rows ?? []).find?.((r: Any) => r?.shiftId === ID.shift.SH);
    if (!rowA) p.push(`ไม่มีแถว SH หลังแก้ (${codeOf(after)})`);
    else if (rowA.billCount !== 3 || rowA.salesTotalSatang !== 43_450) p.push(`SH หลังแก้ ${rowA.billCount}/${rowA.salesTotalSatang} (ต้องเท่า Z 3/43,450)`);
    if (rowB && rowA && JSON.stringify(rowA) !== JSON.stringify(rowB)) p.push("แถว SH เปลี่ยนหลังแก้บิล");
    if (tampered) {
      const d2 = await R("reportDailySales", ctx(), owner, { from: D2, to: D2 });
      const r = d2?.report?.rows?.[0];
      if (!r || r.billCount !== 1 || r.netSalesSatang !== 4500 || r.voidCount !== 1) p.push(`รายวัน D2 หลังแก้ ${short(r, 80)} (ต้อง 1/4,500 · ยกเลิก 1)`);
    }
    chk("P1.17-SH2", p.length === 0, "แถวกะ = Z เดิม · รายวันเปลี่ยน", FX(lim(p)));
  }

  // ─── R1 ปฏิเสธเป็นข้อมูล ───
  {
    const p: string[] = [];
    if (refusals.length < 12) p.push(`เก็บได้ ${refusals.length} รายการ (ต้อง ≥ 12)`);
    for (const [fn, r] of refusals) {
      if (r?.threw) p.push(`${fn} throw ${r.code}`);
      else if (typeof r?.code !== "string" || typeof r?.message !== "string" || !r.message) p.push(`${fn} รูปผิด ${short(r, 60)}`);
    }
    chk("P1.17-R1", p.length === 0, "≥ 12 · {ok:false, code, message} · ไม่ throw", FX(lim([...new Set(p)])));
  }
}

// ═════════════════════════ 7. คืนสภาพ ═════════════════════════
async function del(model: string, where: Any): Promise<number> {
  const d = P[model];
  if (typeof d?.deleteMany !== "function") return 0;
  try {
    return (await d.deleteMany({ where })).count as number;
  } catch (e) {
    console.log(`  (ลบ ${model} ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
    return -1;
  }
}
async function cleanup() {
  const units = sb.unitIds;
  const systems = sb.systemIds;
  const counts: Record<string, number> = {};
  if (!units.length && !systems.length) return;
  const unitOr = [...(units.length ? [{ unitId: { in: units } }] : []), ...(systems.length ? [{ systemId: { in: systems } }] : [])];
  const sales = [...new Set([...sb.saleIds, ...((await P.posSale.findMany({ where: { tenantId: { in: TIDS }, OR: unitOr }, select: { id: true } }).catch(() => [])) as Any[]).map((s) => s.id)])];
  const evWhere = { tenantId: { in: TIDS }, OR: [...unitOr, ...(sales.length ? [{ idempotencyKey: { in: sales.flatMap((s) => [`PosSale#${s}#PAID`, `PosSale#${s}#VOIDED`]) } }] : [])] };
  for (let i = 0; i < 20; i++) {
    const pend = await P.outboxEvent.count({ where: { ...evWhere, status: "PENDING" } }).catch(() => 0);
    if (pend === 0) break;
    await sleep(500);
  }
  counts.outbox = await del("outboxEvent", evWhere);
  counts.audit = await del("auditLog", { tenantId: { in: TIDS }, createdAt: { gte: runStart }, OR: [...(units.length ? [{ unitId: { in: units } }] : []), { targetId: { in: [...sb.shiftIds, ...sb.itemIds, ...systems, ...units, ...sales] } }] });
  if (sales.length) {
    await del("couponRedemption", { tenantId: { in: TIDS }, refType: "PosSale", refId: { in: sales } });
    await del("pointLedger", { tenantId: { in: TIDS }, refType: "PosSale", refId: { in: sales } });
    counts.movementBySale = await del("invMovement", { tenantId: { in: TIDS }, refType: "PosSale", refId: { in: sales } });
    await del("posSaleLineOption", { saleId: { in: sales } });
    counts.payment = await del("posPayment", { saleId: { in: sales } });
    counts.line = await del("posSaleLine", { saleId: { in: sales } });
    counts.sale = await del("posSale", { id: { in: sales } });
  }
  if (sb.itemIds.length) {
    counts.movement = await del("invMovement", { itemId: { in: sb.itemIds } });
    await del("invLocationStock", { itemId: { in: sb.itemIds } });
    counts.item = await del("invItem", { id: { in: sb.itemIds } });
  }
  if (units.length) {
    await del("posCashMovement", { tenantId: { in: TIDS }, unitId: { in: units } });
    counts.shift = await del("posShift", { tenantId: { in: TIDS }, unitId: { in: units } });
    await del("posShiftCounter", { tenantId: { in: TIDS }, unitId: { in: units } });
    await del("posReceiptCounter", { tenantId: { in: TIDS }, unitId: { in: units } });
    await del("appSystemUnit", { unitId: { in: units } });
  }
  if (systems.length) {
    await del("invItem", { tenantId: { in: TIDS }, systemId: { in: systems } });
    await del("posProduct", { tenantId: { in: TIDS }, systemId: { in: systems } });
    await del("posCategory", { tenantId: { in: TIDS }, systemId: { in: systems } });
    await del("appSystemUnit", { systemId: { in: systems } });
    await del("appSystem", { id: { in: systems } });
  }
  if (units.length) await del("businessUnit", { id: { in: units } });
  console.log(`  ลบแล้ว: ${JSON.stringify(counts)} · บิล ${sales.length} · กะ ${sb.shiftIds.length} · สาขา ${units.length} · ระบบ ${systems.length}`);
}

// ═════════════════════════ 8. รัน ═════════════════════════
let crashed = "";
try {
  await runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await cleanup();
  } catch (e) {
    console.log(`💥 cleanup: ${(e as Error).message.slice(0, 200)}`);
  }
}
const countsAfter = await snapshotCounts();
const drift = Object.keys(countsBefore).filter((k) => countsBefore[k] !== countsAfter[k]).map((k) => `${k}:${countsBefore[k]}→${countsAfter[k]}`);
chk("P1.17-Z1", drift.length === 0, "ก่อน = หลัง", drift.length ? drift.join(", ") : "เท่ากันทุกตาราง");
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("P1.17-Z2", fpDrift.length === 0 && !Object.values(fpBefore).some((v) => v.startsWith("err")), "ลายนิ้วมือเท่าเดิมทุกตาราง", fpDrift.length ? fpDrift.join(", ") : `เท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id) && !skippedChecks.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}${skippedChecks.size ? ` · ข้าม ${skippedChecks.size}` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, skippedChecks: Object.fromEntries(skippedChecks), missing: skipReasons, a5: { drift } })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P1.17 S: จอรายงาน/การ์ดบนหน้า (builder U · mockup 08) · ใบคืนเงิน (P1.8 — refundCount/refundTotalSatang = 0 จนกว่าจะมี) ·
// รายงานช่องทาง/สาขารวม/PDF (P2.11/P2.12) · กำไรก่อน VAT ต่อสินค้า (ต้องแบ่ง VAT ลงบรรทัด — P2) · ตัดวันตามเวลาเปิดร้าน (Q17.2)
