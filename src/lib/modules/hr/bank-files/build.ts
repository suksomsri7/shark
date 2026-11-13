// HR H3.5 ▸ ตัวสร้างไฟล์โอนเงินเดือน — ทางเข้าเดียวของชั้น pure (brief R2–R8)
//   buildBankFile({run, payees, profile, options, now}) → ไบต์ + ยอด หรือคำปฏิเสธที่มีข้อความคงที่ · ไม่แตะฐาน/นาฬิกา/สุ่ม (now มาจากผู้เรียก)
//   ลำดับตรวจ (R3): STATUS → NEGATIVE → MISMATCH → OPTIONS → PROFILE → คัดคน (R4) → ENCODING/FORMULA (ทุกคน · ตามลำดับไฟล์) → EMPTY
//   เงิน = สตางค์จำนวนเต็มตลอดทาง (จัดรูปที่ขอบ) · Σ ในไฟล์ + Σ ไม่อยู่ในไฟล์ = totalNetSatang ของรอบเสมอ
//   ลำดับในไฟล์ = ลำดับ payees ที่ส่งเข้ามา (ผู้เรียกเรียงเอง) · ไม่แก้อินพุต ◂
import { BANK_TEXT, resolveBankCode, type BankCause, type BankWarning } from "./codes";
import { concat, cutAtCluster, encodable, hasBaseChar, printableAscii, singleByte, type FixedEncoding } from "./encode"; // HR H3.6 ▸ hasBaseChar ◂
import { PCT_DETAIL_LEN, PCT_HEADER_LEN, PCT_ITEM_LIMIT_SATANG, PCT_NAME_LEN, pctDetail, pctHeader } from "./kbank";
import { KTB_LINE_LEN, KTB_NAME_LEN, KTB_REF_LEN, ktbDetail, ktbHeader } from "./ktb";
import { BANK_PRESETS, cellWritable, cellsOf, csvBytes, formulaLike, genericSpecOf, tableOf, type GenericRow, type GenericSpec } from "./generic";
import { XLSX_CONTENT_TYPE, xlsxBytes } from "./xlsx";

export { BANK_TEXT, resolveBankCode, BANK_PRESETS };
export { BANK_TEXT_EN, bankTextFor } from "./codes"; // HR H3.5 fix r1 ▸ F7 ◂
export type { BankCause, BankWarning, GenericSpec };

export const BANK_FORMATS = ["KBANK_PCT", "KTB_IPAY", "CSV", "XLSX"] as const;
export type BankFormat = (typeof BANK_FORMATS)[number];
/** รูปแบบความกว้างคงที่ของธนาคาร — ปิดเป็นค่าตั้งต้น · ป้าย "ยังไม่ทดสอบกับธนาคารจริง" ทุกจุด */
export const FIXED_FORMATS = ["KBANK_PCT", "KTB_IPAY"] as const;
export type FixedFormat = (typeof FIXED_FORMATS)[number];
export const isFixedFormat = (f: unknown): f is FixedFormat => f === "KBANK_PCT" || f === "KTB_IPAY";

export type BankRun = { runId: string; periodKey: string; payDate: string; status: string; totalNetSatang: number };
export type BankPayee = { employeeId: string; name: string; code: string | null; bankName: string | null; accountNo: string | null; accountName: string | null; netSatang: number; paymentRef?: string | null };
export type BankProfileInput = { debitBankCode: string | null; debitAccountNo: string | null; debitBranchCode: string | null; companyNameEn: string | null; ktbCompanyId: string | null } | null;
export type BankOptions = {
  format: string;
  effectiveDate?: string;
  encoding?: string;
  batchRef?: string;
  ktbMode?: string;
  ktbDateEra?: string;
  ktbReceivingBranch?: string;
  generic?: unknown;
};
export type BuildInput = { run: BankRun; payees: BankPayee[]; profile: BankProfileInput; options: BankOptions; now: Date };
export type NotIncluded = { employeeId: string; cause: BankCause; netSatang: number };
export type BuildWarning = { employeeId: string | null; code: BankWarning };
export type IncludedRow = { seq: number; employeeId: string; bankCode: string | null; accountNo: string; amountSatang: number };
// HR H3.5 fix r1 ▸ F1/F2: AMOUNT = ยอด/ยอดรวมเกินช่องของไฟล์ · LAYOUT = ด่านสุดท้าย บรรทัดยาวไม่ตรงรูปแบบ (ไม่ควรเกิด — ไม่บันทึกอะไร) ◂
export type RefusalCode = "STATUS" | "NEGATIVE" | "MISMATCH" | "OPTIONS" | "PROFILE" | "ENCODING" | "FORMULA" | "AMOUNT" | "LAYOUT" | "EMPTY";
export type BuildOk = {
  ok: true;
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  itemCount: number;
  totalSatang: number;
  notIncluded: NotIncluded[];
  warnings: BuildWarning[];
  /** แถวที่อยู่ในไฟล์ (ให้ service ทำตัวอย่างแบบปิดเลขบัญชี) — มีเลขบัญชีเต็ม: ห้ามส่งถึงเบราว์เซอร์ */
  rows: IncludedRow[];
};
export type BuildFail = { ok: false; code: RefusalCode; text: string; employees: { employeeId: string; name: string }[]; notIncluded?: NotIncluded[] };
export type BuildResult = BuildOk | BuildFail;

const TEXT_KEY: Record<RefusalCode, keyof typeof BANK_TEXT> = { STATUS: "status", NEGATIVE: "negative", MISMATCH: "mismatch", OPTIONS: "options", PROFILE: "profile", ENCODING: "encoding", FORMULA: "formula", AMOUNT: "amount", LAYOUT: "layout", EMPTY: "empty" };
/** ข้อความคงที่ของคำปฏิเสธ ({names} = ชื่อที่แสดงของพนักงาน คั่นด้วย ", ") */
export const refusalText = (code: RefusalCode, names: string[] = [], texts: { [k: string]: unknown } = BANK_TEXT) => String(texts[TEXT_KEY[code]]).replace("{names}", names.join(", "));
/** รหัสคำปฏิเสธ → คีย์ข้อความ (ให้หน้าจอเลือกภาษาเอง) */
export const refusalKey = (code: string): keyof typeof BANK_TEXT | null => (Object.prototype.hasOwnProperty.call(TEXT_KEY, code) ? TEXT_KEY[code as RefusalCode] : null);
const fail = (code: RefusalCode, who: BankPayee[] = [], notIncluded?: NotIncluded[]): BuildFail => ({
  ok: false,
  code,
  text: refusalText(code, who.map((p) => p.name)),
  employees: who.map((p) => ({ employeeId: p.employeeId, name: p.name })),
  ...(notIncluded ? { notIncluded } : {}),
});

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** วันที่ "YYYY-MM-DD" ที่มีอยู่จริง */
/** HR H3.5 fix r1 ▸ F1: ปี ค.ศ. ของวันที่ในไฟล์ต้องอยู่ 2000–2400 (พ.ศ. 2543–2943 = 4 หลักเสมอ · yy ของ PCT ไม่ซ้ำกันในช่วงนี้ไม่ได้ถูกอ้าง) ◂ */
export const FILE_YEAR_MIN = 2000;
export const FILE_YEAR_MAX = 2400;
const inYearRange = (day: string) => {
  const y = Number(day.slice(0, 4));
  return y >= FILE_YEAR_MIN && y <= FILE_YEAR_MAX && String(y).length === 4 && String(y + 543).length === 4;
};
export function validDay(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DAY_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}
/** เวลาไทย (UTC+7 ไม่มีเวลาออมแสง) ของ now: วัน "YYYY-MM-DD" + ตราเวลา yyMMddHHmmss */
export function bangkokParts(now: Date): { day: string; stamp: string } {
  const b = new Date(now.getTime() + 7 * 3_600_000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const y = b.getUTCFullYear();
  const day = `${y}-${p2(b.getUTCMonth() + 1)}-${p2(b.getUTCDate())}`;
  return { day, stamp: `${String(y).slice(-2)}${p2(b.getUTCMonth() + 1)}${p2(b.getUTCDate())}${p2(b.getUTCHours())}${p2(b.getUTCMinutes())}${p2(b.getUTCSeconds())}` };
}
const yymmdd = (day: string) => day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
const ddmmyyyy = (day: string, era: "CE" | "BE") => day.slice(8, 10) + day.slice(5, 7) + String(Number(day.slice(0, 4)) + (era === "BE" ? 543 : 0));
const digitsOf = (acct: string) => acct.replace(/[\s-]/g, "");
const one = <T extends string>(v: unknown, allowed: readonly T[], dflt: T): T | null => (v === undefined || v === null ? dflt : (allowed as readonly unknown[]).includes(v) ? (v as T) : null);

type Resolved =
  | { format: "KBANK_PCT"; eff: string; encoding: FixedEncoding; batchRef: string }
  | { format: "KTB_IPAY"; eff: string; encoding: FixedEncoding; mode: "STANDARD" | "DIRECT"; era: "CE" | "BE"; branch: "SPACES" | "ZEROS" }
  | { format: "CSV" | "XLSX"; eff: string; spec: GenericSpec };

function resolveOptions(run: BankRun, payees: BankPayee[], o: BankOptions | null | undefined): Resolved | null {
  if (!o || typeof o !== "object") return null;
  const eff = o.effectiveDate === undefined || o.effectiveDate === null ? run.payDate : o.effectiveDate;
  if (!validDay(eff) || !inYearRange(eff)) return null;
  if (o.format === "KBANK_PCT" || o.format === "KTB_IPAY") {
    const encoding = one(o.encoding, ["ASCII", "TIS620"] as const, "TIS620");
    if (!encoding) return null;
    if (o.format === "KBANK_PCT") {
      const batchRef = o.batchRef === undefined || o.batchRef === null ? `HR${run.periodKey.replace("-", "")}` : o.batchRef;
      if (typeof batchRef !== "string" || !/^[A-Za-z0-9]{1,16}$/.test(batchRef)) return null;
      return { format: "KBANK_PCT", eff, encoding, batchRef };
    }
    const mode = one(o.ktbMode, ["STANDARD", "DIRECT"] as const, "STANDARD");
    const era = one(o.ktbDateEra, ["CE", "BE"] as const, "CE");
    const branch = one(o.ktbReceivingBranch, ["SPACES", "ZEROS"] as const, "SPACES");
    if (!mode || !era || !branch) return null;
    if (payees.some((p) => p.paymentRef !== undefined && p.paymentRef !== null && (typeof p.paymentRef !== "string" || p.paymentRef.length < 1 || p.paymentRef.length > KTB_REF_LEN || !printableAscii(p.paymentRef)))) return null;
    return { format: "KTB_IPAY", eff, encoding, mode, era, branch };
  }
  if (o.format === "CSV" || o.format === "XLSX") {
    const spec = genericSpecOf(o.generic);
    if (!spec) return null;
    if (payees.some((p) => p.paymentRef !== undefined && p.paymentRef !== null && typeof p.paymentRef !== "string")) return null;
    return { format: o.format, eff, spec };
  }
  return null;
}

function profileOk(r: Resolved, p: BankProfileInput): boolean {
  if (r.format === "CSV" || r.format === "XLSX") return true;
  if (!p) return false;
  const acct = typeof p.debitAccountNo === "string" && /^\d{10}$/.test(p.debitAccountNo);
  const company = typeof p.companyNameEn === "string" && p.companyNameEn.trim() === p.companyNameEn && p.companyNameEn.length >= 1 && printableAscii(p.companyNameEn);
  if (r.format === "KBANK_PCT") return p.debitBankCode === "004" && acct && company && p.companyNameEn!.length <= 50;
  return (
    p.debitBankCode === "006" &&
    acct &&
    company &&
    p.companyNameEn!.length <= 100 &&
    typeof p.debitBranchCode === "string" &&
    /^\d{4}$/.test(p.debitBranchCode) &&
    typeof p.ktbCompanyId === "string" &&
    p.ktbCompanyId.length >= 1 &&
    p.ktbCompanyId.length <= 16 &&
    printableAscii(p.ktbCompanyId)
  );
}

/** HR H3.5 fix r1 ▸ F1: ความยาวทุกบรรทัดของไฟล์ความกว้างคงที่ = รูปแบบ (header แล้ว detail) — 1 อักขระ = 1 ไบต์ในชุดที่ใช้ ◂ */
export function fixedLinesOk(format: FixedFormat, lines: string[]): boolean {
  if (lines.length < 2) return false;
  const [h, ...d] = lines;
  return format === "KBANK_PCT" ? h!.length === PCT_HEADER_LEN && d.every((l) => l.length === PCT_DETAIL_LEN) : h!.length === KTB_LINE_LEN && d.every((l) => l.length === KTB_LINE_LEN);
}

type Picked = { p: BankPayee; digits: string; bankCode: string | null; payeeName: string; seq: number };

/** ไฟล์โอนเงินเดือน 1 ไฟล์ (R2) */
export function buildBankFile(input: BuildInput): BuildResult {
  const { run, payees, profile, options, now } = input;
  if (run.status !== "APPROVED" && run.status !== "PAID") return fail("STATUS");
  if (payees.some((p) => typeof p.netSatang === "number" && p.netSatang < 0)) return fail("NEGATIVE");
  if (!payees.every((p) => Number.isSafeInteger(p.netSatang)) || !Number.isSafeInteger(run.totalNetSatang) || payees.reduce((a, p) => a + p.netSatang, 0) !== run.totalNetSatang) return fail("MISMATCH");
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || typeof run.periodKey !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(run.periodKey)) return fail("OPTIONS");
  const r = resolveOptions(run, payees, options);
  if (!r) return fail("OPTIONS");
  if (!inYearRange(bangkokParts(now).day)) return fail("OPTIONS"); // HR H3.5 fix r1 ▸ F1: วันที่สร้างไฟล์ (yyMMdd · ชื่อไฟล์) ก็อยู่ในช่วงเดียวกัน ◂
  if (!profileOk(r, profile)) return fail("PROFILE");

  const fixed = r.format === "KBANK_PCT" || r.format === "KTB_IPAY";
  const notIncluded: NotIncluded[] = [];
  const warnings: BuildWarning[] = [];
  const picked: Picked[] = [];
  const { day: today, stamp } = bangkokParts(now);
  if (r.eff < today) warnings.push({ employeeId: null, code: "EFFECTIVE_PAST" });

  // ── คัดคน (R4 · เจอข้อแรกจบ) ──
  for (const p of payees) {
    const out = (cause: BankCause) => void notIncluded.push({ employeeId: p.employeeId, cause, netSatang: p.netSatang });
    if (p.netSatang === 0) {
      out("NET_ZERO");
      continue;
    }
    const raw = typeof p.accountNo === "string" ? p.accountNo.trim() : "";
    if (!raw) {
      out("NO_ACCOUNT");
      continue;
    }
    const digits = digitsOf(raw);
    if (!(fixed ? /^\d{10}$/ : /^\d{10,15}$/).test(digits)) {
      out("ACCOUNT_FORMAT");
      continue;
    }
    const bankCode = resolveBankCode(p.bankName);
    if (fixed) {
      if (!bankCode) {
        out("BANK_UNKNOWN");
        continue;
      }
      if (r.format === "KBANK_PCT" && bankCode !== "004") {
        out("NOT_THIS_BANK");
        continue;
      }
      if (r.format === "KTB_IPAY" && r.mode === "DIRECT" && bankCode !== "006") {
        out("NOT_THIS_BANK");
        continue;
      }
      if (r.format === "KTB_IPAY" && r.mode === "STANDARD" && bankCode === "006") {
        out("SAME_BANK");
        continue;
      }
    }
    const acctName = typeof p.accountName === "string" ? p.accountName.trim() : "";
    const payeeName = acctName || (typeof p.name === "string" ? p.name.trim() : "");
    picked.push({ p, digits, bankCode, payeeName, seq: picked.length + 1 });
  }
  // ── คำเตือนรายคน (ไม่ปิดกั้น) ──
  const byAcct = new Map<string, number>();
  for (const k of picked) byAcct.set(k.digits, (byAcct.get(k.digits) ?? 0) + 1);
  const nameLen = r.format === "KBANK_PCT" ? PCT_NAME_LEN : r.format === "KTB_IPAY" ? KTB_NAME_LEN : Infinity;
  for (const k of picked) {
    const w = (code: BankWarning) => void warnings.push({ employeeId: k.p.employeeId, code });
    if (!fixed && !k.bankCode) w("BANK_UNKNOWN");
    if (!(typeof k.p.accountName === "string" && k.p.accountName.trim())) w("NAME_FROM_PROFILE");
    if (k.payeeName.length > nameLen) w("NAME_CUT");
    if (r.format === "KBANK_PCT" && k.p.netSatang > PCT_ITEM_LIMIT_SATANG) w("OVER_LIMIT");
    if ((byAcct.get(k.digits) ?? 0) > 1) w("DUP_ACCOUNT");
  }

  const yyyymm = run.periodKey.replace("-", "");
  const refOf = (k: Picked) => (typeof k.p.paymentRef === "string" && k.p.paymentRef ? k.p.paymentRef : `HR${yyyymm}-${String(k.seq).padStart(4, "0")}`);
  const totalSatang = picked.reduce((a, k) => a + k.p.netSatang, 0);
  const rows: IncludedRow[] = picked.map((k) => ({ seq: k.seq, employeeId: k.p.employeeId, bankCode: k.bankCode, accountNo: k.digits, amountSatang: k.p.netSatang }));
  const done = (bytes: Uint8Array, fileName: string, contentType: string): BuildOk => ({ ok: true, bytes, fileName, contentType, itemCount: picked.length, totalSatang, notIncluded, warnings, rows });

  if (r.format === "KBANK_PCT" || r.format === "KTB_IPAY") {
    // ── อักขระ (R7) — ชื่อทั้งชื่อ (ก่อนตัด) ต้องอยู่ในชุด · ไม่แทนที่ ──
    const bad = picked.filter((k) => !encodable(k.payeeName, r.encoding) || !hasBaseChar(k.payeeName)); // HR H3.6 ▸ หนี้ H3.5: ชื่อที่ไม่มีตัวอักษรฐาน = ปฏิเสธ (ไม่เขียนชื่อว่าง) ◂
    if (bad.length) return fail("ENCODING", bad.map((k) => k.p));
    // HR H3.5 fix r1 ▸ F2: ยอดต้องพอดีช่อง (PCT รายการ 15 · รวม 15 · KTB รายการ 17 · รวม 19 หลัก) — ไม่สร้างบรรทัดที่ยาวเกิน ◂
    const lim = r.format === "KBANK_PCT" ? { item: 10 ** 15, total: 10 ** 15 } : { item: 10 ** 17, total: 10 ** 19 };
    const tooBig = picked.filter((k) => k.p.netSatang >= lim.item);
    if (tooBig.length) return fail("AMOUNT", tooBig.map((k) => k.p));
    if (totalSatang >= lim.total) return { ok: false, code: "AMOUNT", text: refusalText("AMOUNT", [BANK_TEXT.amountTotal]), employees: [] };
    if (!picked.length) return fail("EMPTY", [], notIncluded);
    const lines: string[] = [];
    let fileName: string;
    if (r.format === "KBANK_PCT") {
      const h = { batchRef: r.batchRef, debitAccountNo: profile!.debitAccountNo!, totalSatang, fileDate: yymmdd(today), companyName: profile!.companyNameEn!, effectiveDate: yymmdd(r.eff), count: picked.length };
      lines.push(pctHeader(h));
      for (const k of picked) lines.push(pctDetail({ seq: k.seq, accountNo: k.digits, amountSatang: k.p.netSatang, name: cutAtCluster(k.payeeName, PCT_NAME_LEN) }, h)); // HR H3.5 fix r1 ▸ F3 ◂
      fileName = `PCT${stamp}.txt`;
    } else {
      const eff = ddmmyyyy(r.eff, r.era);
      lines.push(ktbHeader({ count: picked.length, totalSatang, effectiveDate: eff, companyId: profile!.ktbCompanyId! }));
      const c = { effectiveDate: eff, debitBranchCode: profile!.debitBranchCode!, debitAccountNo: profile!.debitAccountNo!, senderName: profile!.companyNameEn!, service: r.mode === "DIRECT" ? ("02" as const) : ("01" as const), receivingBranch: r.branch };
      for (const k of picked) lines.push(ktbDetail({ bankCode: k.bankCode!, accountNo: k.digits, amountSatang: k.p.netSatang, name: cutAtCluster(k.payeeName, KTB_NAME_LEN), ref: refOf(k), running: k.seq }, c)); // HR H3.5 fix r1 ▸ F3 ◂
      fileName = `KTB_IPAY_${yyyymm}_${stamp}.txt`;
    }
    // HR H3.5 fix r1 ▸ F1: ด่านสุดท้าย — ทุกบรรทัดต้องยาวเท่ารูปแบบ (ไม่ผ่าน = ปฏิเสธ ไม่มีไบต์ ผู้เรียกไม่บันทึกอะไร) ◂
    if (!fixedLinesOk(r.format, lines)) return fail("LAYOUT");
    const bytes = concat(lines.map((l) => singleByte(`${l}\r\n`)));
    return done(bytes, fileName, r.encoding === "ASCII" ? "text/plain; charset=us-ascii" : "text/plain; charset=windows-874");
  }

  // ── ไฟล์ทั่วไป (R8) ──
  const body = picked.map((k) => {
    const g: GenericRow = { seq: k.seq, employeeCode: (k.p.code ?? "").trim(), employeeName: (k.p.name ?? "").trim(), // HR H3.5 fix r1 ▸ F4: ตัดช่องว่างหัวท้ายแบบเดียวกับชื่อบัญชี ◂
      payeeName: k.payeeName, bankName: (k.p.bankName ?? "").trim(), bankCode: k.bankCode ?? "", accountNo: k.digits, amountSatang: k.p.netSatang, paymentRef: refOf(k) };
    return cellsOf(r.spec, g, r.eff);
  });
  const target = r.format === "XLSX" ? "XLSX" : r.spec.encoding;
  // HR H3.6 ▸ หนี้ H3.5 (fix r1 F8): ชื่อที่ไม่มีตัวอักษรฐาน = ปฏิเสธ — เฉพาะเมื่อชุดคอลัมน์มีคอลัมน์ชื่อนั้นจริง (payeeName / employeeName) ◂
  const nameCols = new Set(r.spec.columns.map(([f]) => f));
  const blankName = (k: Picked) => (nameCols.has("payeeName") && !hasBaseChar(k.payeeName)) || (nameCols.has("employeeName") && !hasBaseChar((k.p.name ?? "").trim())); // HR H3.6 ◂
  const badEnc = picked.filter((k, i) => body[i]!.some((c) => !cellWritable(c, target)) || blankName(k)); // HR H3.6 ◂
  if (badEnc.length) return fail("ENCODING", badEnc.map((k) => k.p));
  const badF = picked.filter((_, i) => body[i]!.some(formulaLike));
  if (badF.length) return fail("FORMULA", badF.map((k) => k.p));
  if (!picked.length) return fail("EMPTY", [], notIncluded);
  const table = tableOf(r.spec, body, picked.length, totalSatang);
  if (r.format === "XLSX") return done(xlsxBytes(table), `HR_${yyyymm}_${stamp}.xlsx`, XLSX_CONTENT_TYPE);
  return done(csvBytes(table, r.spec.encoding), `HR_${yyyymm}_${stamp}.csv`, r.spec.encoding === "TIS620" ? "text/csv; charset=windows-874" : "text/csv; charset=utf-8");
}
