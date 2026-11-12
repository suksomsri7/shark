// HR H3.2 ▸ กฎหักสาย/ออกก่อน/ขาดงาน (pure — ไม่มี DB/นาฬิกา/สุ่ม · import ได้เฉพาะ node:crypto) · brief hr-brief-H3.2 R2 R3 R6
//   เงิน = สตางค์จำนวนเต็ม · นาที = จำนวนเต็ม · ทุกยอดคิดมือได้: amt(m) = floor(ฐาน × m / (30 × N)) ต่อวันต่อกฎ (ปัดลง = เป็นคุณกับพนักงาน)
//   หักเฉพาะเวลาที่ไม่ได้ทำงานจริงตามสัดส่วน — ไม่มีค่าปรับ ไม่มีตัวคูณ ไม่มี "สาย N ครั้ง = 1 วัน" ไม่มีปัดขึ้น (ม.76)
//   วันหนึ่ง ≤ ค่าจ้าง 1 วัน (÷30): a = min(ขาด, N) · le = min(สาย + ออกก่อน, N − a) ◂
import { createHash } from "node:crypto";

/** ข้อความคงที่ (ไทยทุกไบต์ — ห้ามต่อชื่อ/id/ยอด) */
export const ATT_TEXT = {
  no: "ไม่พบข้อมูลรายการหักสาย/ขาดนี้ หรือคุณไม่มีสิทธิ์ดู",
  syncNo: "คุณไม่มีสิทธิ์คำนวณรายการหักสาย/ขาด",
  policyNo: "เฉพาะเจ้าของร้านเท่านั้นที่ตั้งกฎหักสาย/ขาดได้",
  off: "ยังไม่ได้เปิดกฎหักสาย/ขาด — เจ้าของร้านเปิดได้ที่หน้าตั้งค่า HR",
  period: "งวดต้องเป็นรูปแบบ YYYY-MM",
  frozen: "งวดนี้อนุมัติเงินเดือนแล้ว — คำนวณรายการหักใหม่ไม่ได้",
  stale: "ข้อมูลเวลาทำงานของรายการนี้เปลี่ยนแล้ว — กด 'คำนวณรายการหักสาย/ขาด' ใหม่ก่อนอนุมัติ",
  attRow: "รายการนี้มาจากกฎหักสาย/ขาด — ลบหรือย้ายไม่ได้ ให้ปฏิเสธ หรือแก้ข้อมูลเวลาแล้วคำนวณใหม่",
  noEmp: "บัญชีของคุณยังไม่ได้ผูกกับพนักงาน — ติดต่อผู้จัดการ",
  sFree: "นาทีที่ไม่หักต้องอยู่ระหว่าง 0 ถึง 60",
  sStep: "ปัดนาทีได้เฉพาะ 1, 5, 10 หรือ 15 นาที",
  warn: "ระบบหักเฉพาะเวลาที่ไม่ได้ทำงานจริงตามสัดส่วน — ไม่มีค่าปรับ (ม.76 พ.ร.บ.คุ้มครองแรงงาน) · ทุกรายการต้องมีผู้อนุมัติ",
  adjLate: "หักเวลามาสาย/ออกก่อน {n} นาที ({m})",
  adjAbsent: "หักเวลาขาดงาน {n} นาที ({m})",
  refund: "คืนเงินหักสาย/ขาด ({m})",
  // มติผู้คุม (ปิดช่องโหว่ D1): รายการหักที่อนุมัติแล้วแต่ข้อมูลเวลาเปลี่ยน ไม่ถูกดึงเข้ารอบจ่าย/อนุมัติรอบไม่ได้จนคำนวณใหม่
  runStale: "มีรายการหักสาย/ขาดที่ข้อมูลเวลาเปลี่ยนแล้ว — กด 'คำนวณรายการหักสาย/ขาด' แล้วกด 'คำนวณใหม่' ที่รอบจ่ายก่อนอนุมัติ",
  needSync: "ต้องคำนวณใหม่",
  saved: "บันทึกกฎหักสาย/ขาดแล้ว",
  failed: "บันทึกไม่สำเร็จ — กรุณาลองใหม่",
  synced: "คำนวณรายการหักสาย/ขาดแล้ว — รายการใหม่รออนุมัติที่หน้าเงินเดือน",
} as const;

export type AttendancePayPolicy = { enabled: boolean; late: boolean; earlyOut: boolean; absent: boolean; freeMin: number; stepMin: number };
export const ATT_PAY_POLICY_DEFAULT: AttendancePayPolicy = Object.freeze({ enabled: false, late: true, earlyOut: true, absent: true, freeMin: 0, stepMin: 1 }) as AttendancePayPolicy;
export const ATT_STEP_OPTIONS = [1, 5, 10, 15] as const;
export const ATT_FREE_MAX = 60;
export type AttRule = "LATE_RULE" | "ABSENT_RULE";
export const ATT_RULES: readonly AttRule[] = ["ABSENT_RULE", "LATE_RULE"];
/** รายการต้องตรวจที่ "แจ้งให้รู้" (ไม่บล็อก) — ธงอื่นทุกตัว (รวมที่ไม่รู้จัก) = บล็อก (ปิดไว้ก่อน) · ตรงกับ work-entries-rules WE_INFO */
export const ATT_INFO_FLAGS: readonly string[] = ["HOLIDAY_LEAVE", "HOURLY_LEAVE_UNUSED", "LEGACY_LEAVE", "OT_VIA_ADJUSTMENT", "WORKED_ON_LEAVE"];
const INT_MAX = 2_147_483_647;

const obj = (raw: unknown): Record<string, unknown> => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** ตัวอ่านแบบผ่อน (ค่าที่เก็บไว้): เปิดเฉพาะ true จริง ๆ · ค่านอกช่วง/ผิดชนิด = ค่าตั้งต้นของช่องนั้น */
export function attendancePayPolicyOf(raw: unknown): AttendancePayPolicy {
  const o = obj(raw);
  const D = ATT_PAY_POLICY_DEFAULT;
  return {
    enabled: o.enabled === true,
    late: typeof o.late === "boolean" ? o.late : D.late,
    earlyOut: typeof o.earlyOut === "boolean" ? o.earlyOut : D.earlyOut,
    absent: typeof o.absent === "boolean" ? o.absent : D.absent,
    freeMin: isInt(o.freeMin) && o.freeMin >= 0 && o.freeMin <= ATT_FREE_MAX ? o.freeMin : D.freeMin,
    stepMin: isInt(o.stepMin) && (ATT_STEP_OPTIONS as readonly number[]).includes(o.stepMin) ? o.stepMin : D.stepMin,
  };
}

export type AttDayInput = { workDayId: string; version: number; day: string; dayClass: string; lateMin: number; earlyOutMin: number; absentMin: number; review: readonly string[] };
export type AttInput = { policy: unknown; payType: string; baseSalarySatang: number; normalDayMin: number; days: readonly AttDayInput[] };
export type AttLine = { workDayId: string; version: number; day: string; rule: AttRule; minutes: number; amountSatang: number };
export type AttTotal = { days: number; minutes: number; amountSatang: number };
export type AttCode = "OFF" | "PAY_TYPE" | "NO_BASE" | "BAD_INPUT" | "BLOCKED";
export type AttOut = { ok: true; lines: AttLine[]; late: AttTotal; absent: AttTotal } | { ok: false; code: AttCode };

const floorStep = (m: number, step: number) => Math.floor(m / step) * step;
const minuteOk = (v: unknown) => isInt(v) && v >= 0 && v <= 1440;
/** สตางค์ของ m นาที = floor(ฐาน × m / (30 × N)) — BigInt (ฐานสูงสุด 2³¹−1 × 1440 ไม่ล้น) */
export function attendanceAmountOf(baseSalarySatang: number, minutes: number, normalDayMin: number): number {
  return Number((BigInt(baseSalarySatang) * BigInt(minutes)) / BigInt(30 * normalDayMin));
}

/** รายการหักต่อวันต่อกฎ (R3) — ลำดับคำปฏิเสธ OFF → PAY_TYPE → NO_BASE → BAD_INPUT → BLOCKED · คิดเฉพาะวัน WORKDAY */
export function attendanceDeductionOf(input: AttInput): AttOut {
  const policy = attendancePayPolicyOf(input?.policy);
  if (!policy.enabled) return { ok: false, code: "OFF" };
  if (input.payType !== "MONTHLY") return { ok: false, code: "PAY_TYPE" };
  if (input.baseSalarySatang === 0) return { ok: false, code: "NO_BASE" };
  const N = input.normalDayMin;
  const base = input.baseSalarySatang;
  const days: readonly AttDayInput[] | null = Array.isArray(input.days) ? (input.days as readonly AttDayInput[]) : null;
  if (!isInt(N) || N < 60 || N > 720 || !isInt(base) || base < 0 || base > INT_MAX || !days) return { ok: false, code: "BAD_INPUT" };
  for (const d of days) {
    if (!d || typeof d.day !== "string" || typeof d.workDayId !== "string" || !isInt(d.version) || !minuteOk(d.lateMin) || !minuteOk(d.earlyOutMin) || !minuteOk(d.absentMin) || !Array.isArray(d.review)) return { ok: false, code: "BAD_INPUT" };
  }
  if (days.some((d) => d.review.some((r) => !ATT_INFO_FLAGS.includes(r)))) return { ok: false, code: "BLOCKED" };
  const lines: AttLine[] = [];
  const sorted = [...days].sort((x, y) => (x.day < y.day ? -1 : x.day > y.day ? 1 : x.workDayId < y.workDayId ? -1 : 1));
  for (const d of sorted) {
    if (d.dayClass !== "WORKDAY") continue;
    const a = policy.absent ? Math.min(d.absentMin, N) : 0;
    const l = policy.late ? floorStep(Math.max(0, d.lateMin - policy.freeMin), policy.stepMin) : 0;
    const e = policy.earlyOut ? floorStep(Math.max(0, d.earlyOutMin - policy.freeMin), policy.stepMin) : 0;
    const le = Math.min(l + e, N - a);
    if (a > 0) lines.push({ workDayId: d.workDayId, version: d.version, day: d.day, rule: "ABSENT_RULE", minutes: a, amountSatang: attendanceAmountOf(base, a, N) });
    if (le > 0) lines.push({ workDayId: d.workDayId, version: d.version, day: d.day, rule: "LATE_RULE", minutes: le, amountSatang: attendanceAmountOf(base, le, N) });
  }
  const tot = (rule: AttRule): AttTotal => {
    const ls = lines.filter((x) => x.rule === rule);
    return { days: ls.length, minutes: ls.reduce((s, x) => s + x.minutes, 0), amountSatang: ls.reduce((s, x) => s + x.amountSatang, 0) };
  };
  return { ok: true, lines, late: tot("LATE_RULE"), absent: tot("ABSENT_RULE") };
}

/** JSON เรียงคีย์ (ลายนิ้วมือคงที่) */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
export type AttBasis = { base: number; N: number; policy: unknown };
/** ลายนิ้วมือ (sha256 hex) ของผลคำนวณ + ฐาน (ค่าจ้าง · N · นโยบาย) — `rule` = เฉพาะบรรทัดของกฎนั้น (หัวรายการ 1 แถวต่อกฎ) */
export function attendanceDigest(out: AttOut, basis: AttBasis, rule?: AttRule): string {
  const lines = out && out.ok ? out.lines.filter((l) => !rule || l.rule === rule).map((l) => [l.workDayId, l.version, l.day, l.rule, l.minutes, l.amountSatang]) : null;
  const body = { v: 1, base: basis?.base ?? null, N: basis?.N ?? null, policy: attendancePayPolicyOf(basis?.policy), rule: rule ?? null, code: out && !out.ok ? out.code : null, lines };
  return createHash("sha256").update(canonical(body)).digest("hex");
}

export type AttPlanRow = { id: string; kind: string; status: string; amountSatang: number; bound: boolean; digest: string | null };
export type AttPlan = { reject: string[]; create: null | { kind: "DEDUCTION" | "ALLOWANCE"; amountSatang: number; status: "PENDING" | "APPROVED" } };
/**
 * แผนส่วนต่าง (R6) — signed: DEDUCTION + / ALLOWANCE − · B = Σ APPROVED ที่เข้ารอบแล้ว (ไม่แตะเด็ดขาด) · A = Σ APPROVED ยังไม่เข้ารอบ · pend = PENDING ยังไม่เข้ารอบ
 *   E = B + A ⇒ ปฏิเสธ pend · E > B + A ⇒ คง pend เดียวที่ตรงยอด+ลายนิ้วมือ ไม่งั้นปฏิเสธ pend + DEDUCTION ส่วนเพิ่ม PENDING ·
 *   E < B + A ⇒ ปฏิเสธ pend + APPROVED ที่ยังไม่เข้ารอบทั้งหมด · d = E − B: > 0 DEDUCTION PENDING · < 0 ALLOWANCE (คืนเงินหักเกิน) APPROVED · 0 ไม่มี
 *   มติผู้คุม (ปิด D1): DEDUCTION ที่ APPROVED ยังไม่เข้ารอบ แต่ลายนิ้วมือไม่ตรงข้อมูลปัจจุบัน = "ต้องคำนวณใหม่" ⇒ ใช้ทางเดียวกับ E < B + A
 *   (ปฏิเสธแล้วเริ่มใหม่จาก B — ไม่มีรายการหักที่อนุมัติบนข้อมูลเก่าค้างอยู่) ⇒ หลังทำตามแผน Σ signed APPROVED + PENDING ใหม่ = E เสมอ
 */
export function attendanceDeltaPlan(input: { entitledSatang: number; digest: string; rows: readonly AttPlanRow[] }): AttPlan {
  const E = input.entitledSatang;
  const rows = (input.rows ?? []).filter((r) => r.status !== "REJECTED");
  const signed = (r: AttPlanRow) => (r.kind === "ALLOWANCE" ? -r.amountSatang : r.amountSatang);
  const approved = rows.filter((r) => r.status === "APPROVED");
  const B = approved.filter((r) => r.bound).reduce((s, r) => s + signed(r), 0);
  const freeA = approved.filter((r) => !r.bound);
  const A = freeA.reduce((s, r) => s + signed(r), 0);
  const pend = rows.filter((r) => r.status === "PENDING" && !r.bound);
  const staleA = freeA.some((r) => r.kind === "DEDUCTION" && r.digest !== input.digest);
  const ids = (xs: AttPlanRow[]) => xs.map((r) => r.id).sort();
  if (!staleA && E === B + A) return { reject: ids(pend), create: null };
  if (!staleA && E > B + A) {
    const want = E - B - A;
    const keep = pend.length === 1 && pend[0]!.kind === "DEDUCTION" && pend[0]!.amountSatang === want && pend[0]!.digest === input.digest;
    return keep ? { reject: [], create: null } : { reject: ids(pend), create: { kind: "DEDUCTION", amountSatang: want, status: "PENDING" } };
  }
  const d = E - B;
  return {
    reject: ids([...pend, ...freeA]),
    create: d > 0 ? { kind: "DEDUCTION", amountSatang: d, status: "PENDING" } : d < 0 ? { kind: "ALLOWANCE", amountSatang: -d, status: "APPROVED" } : null,
  };
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2031-08" → "ส.ค. 2574" (พ.ศ. — สตริงล้วน ไม่ใช้นาฬิกา) */
export function thaiPeriodLabel(periodKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!m) return periodKey;
  return `${TH_MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[1]) + 543}`;
}
/** แทน {n} {m} ในข้อความคงที่ */
export function attText(t: string, v: { n?: number; m?: string }): string {
  return t.replace("{n}", String(v.n ?? "")).replace("{m}", v.m ?? "");
}
