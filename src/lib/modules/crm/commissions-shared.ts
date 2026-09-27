// commissions-shared.ts — ค่าคงที่ · ชนิด · สูตรเงินบริสุทธิ์ของ "คอมมิชชัน → เงินเดือน" (ใบ C3.3 · พิมพ์เขียว §5.9 · §11.6 · มติ C3)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่ import prisma / next / server-only / ไฟล์อื่นของโมดูล ⇒ client component · ข้อสอบ · ตัวตรวจไร้ env ใช้ได้
// 🔴 เงิน = สตางค์ BigInt ทั้งหมด (target ของโปรเจกต์ต่ำกว่า ES2020 ⇒ เขียนลิเทอรัล `0n` ไม่ได้ ใช้ `BigInt(0)`)
// 🔴 สูตรทั้งหมดตรงกับ addendum ของใบ C3.3 ข้อ 4 (มติผู้คุมงาน 26 ก.ย. 2569 — CONFIRMED):
//    • PCT    = ⌊T·bp/10⁴⌋
//    • FIXED  = fixedSatang + ⌊T·pctBp/10⁴⌋
//    • TIERED = ขั้นบันได **ส่วนเพิ่ม** (marginal) · ปัดลง **ครั้งเดียว** ⌊Σ ชิ้น·bp / 10⁴⌋
//    • จ่ายบางส่วน = ผลรวมสะสม: ส่วนแบ่ง = F(ก่อน + p) − F(ก่อน) · F(x) = ⌊full·min(x,T)/T⌋ ⇒ Σ ส่วนแบ่ง = full ไม่มีสตางค์หาย
//    • แบ่งผู้ร่วม: กอง = ⌊A·bp/10⁴⌋ · ต่อคน ⌊กอง/N⌋ · เจ้าของ = A − N·ต่อคน (เศษเป็นของเจ้าของ)
// 🔴 งวด (periodKey) = เดือนไทย (+07:00) แบบ ค.ศ. "2026-09" — ห้าม getMonth()/getDate() ดิบ (กับดักวันที่ไทย)

export const COMMISSION_WAITING_LABEL = "รอผูกพนักงาน";
/** ป้ายของแถวฐาน WON ที่ถูกถอนคืนแล้วดีลกลับมาชนะอีก (มติผู้คุมงาน ข้อ ค — ไม่สร้างแถวใหม่อัตโนมัติ) */
export const COMMISSION_REWON_LABEL = "เคยจ่ายแล้ว";

export const COMMISSION_BASES = ["PAID", "WON"] as const;
export type CommissionBasis = (typeof COMMISSION_BASES)[number];
export const COMMISSION_KINDS = ["PCT", "FIXED", "TIERED"] as const;
export type CommissionKind = (typeof COMMISSION_KINDS)[number];
export const COMMISSION_STATUSES = ["PENDING", "APPROVED", "PAID", "REVERSED", "REJECTED"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];
/** สถานะฝั่งเงินเดือนที่หน้าจอบอก: รอผูกพนักงาน · ส่งเข้างวดแล้ว (HR ยังตัดสิน/รอรอบจ่าย) · จ่ายแล้ว */
export type CommissionPayroll = "WAITING_EMPLOYEE" | "REQUESTED" | "PAID" | null;

export const COMMISSION_BASIS_LABELS: Readonly<Record<CommissionBasis, string>> = Object.freeze({ PAID: "เมื่อรับเงิน", WON: "เมื่อปิดการขาย" });
export const COMMISSION_KIND_LABELS: Readonly<Record<CommissionKind, string>> = Object.freeze({ PCT: "เปอร์เซ็นต์", FIXED: "คงที่ต่อดีล", TIERED: "ขั้นบันได" });
export const COMMISSION_STATUS_LABELS: Readonly<Record<CommissionStatus, string>> = Object.freeze({
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  PAID: "จ่ายแล้ว",
  REVERSED: "ถอนคืน",
  REJECTED: "ไม่อนุมัติ",
});
export const COMMISSION_PAYROLL_LABELS: Readonly<Record<Exclude<CommissionPayroll, null>, string>> = Object.freeze({
  WAITING_EMPLOYEE: COMMISSION_WAITING_LABEL,
  REQUESTED: "ส่งเข้างวดเงินเดือนแล้ว",
  PAID: "จ่ายกับเงินเดือนแล้ว",
});

/** เพดาน/ขอบเขตของค่าที่กรอกได้ (ตัวตรวจเดียวกันทั้งหน้าจอและบริการ) */
export const COMMISSION_LIMITS = Object.freeze({
  nameMax: 120,
  bpMax: 10_000,
  delayDaysMax: 366,
  tiersMax: 10,
  productIdsMax: 100,
  reasonMin: 5,
  reasonMax: 500,
  /** เงินต่อแถวที่ระบบเงินเดือนรับได้ (คอลัมน์ Int ของ HrPayAdjustment) */
  hrMaxSatang: 2_147_483_647,
  listMax: 500,
});

export type TierDef = { uptoSatang: number | null; pctBp: number };
export type RuleConfig = { pctBp?: number; fixedSatang?: number; tiers?: TierDef[] };

const ZERO = BigInt(0);
const TENK = BigInt(10_000);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

/**
 * คอมมิชชันเต็มของกฎหนึ่งกฎ บนฐาน T (สตางค์ BigInt) — ค่าที่ติดลบ/ไม่ใช่ตัวเลขถือเป็น 0 (ตัวตรวจตอนบันทึกกันไว้แล้ว)
 * TIERED = ขั้นบันไดส่วนเพิ่ม: ชิ้นแรก [0, upto₁] ได้ bp₁ · ชิ้นถัดไป (upto₁, upto₂] ได้ bp₂ … · ปัดลงครั้งเดียวที่ผลรวมเศษ
 */
export function commissionOf(kind: string, config: unknown, totalSatang: bigint): bigint {
  const total = totalSatang > ZERO ? totalSatang : ZERO;
  const cfg = (config && typeof config === "object" ? config : {}) as RuleConfig;
  const bp = (v: unknown) => BigInt(isInt(v) && v > 0 ? v : 0);
  if (kind === "PCT") return (total * bp(cfg.pctBp)) / TENK;
  if (kind === "FIXED") return BigInt(isInt(cfg.fixedSatang) && cfg.fixedSatang > 0 ? cfg.fixedSatang : 0) + (total * bp(cfg.pctBp)) / TENK;
  if (kind === "TIERED") {
    let prev = ZERO;
    let num = ZERO;
    for (const t of Array.isArray(cfg.tiers) ? cfg.tiers : []) {
      const cap = t.uptoSatang === null ? total : BigInt(isInt(t.uptoSatang) ? t.uptoSatang : 0);
      const upper = cap < total ? cap : total;
      if (upper > prev) num += (upper - prev) * bp(t.pctBp);
      prev = cap;
      if (prev >= total) break;
    }
    return num / TENK;
  }
  return ZERO;
}

/** F(x) = ⌊full·min(x,T)/T⌋ — ยอดคอมมิชชันสะสมเมื่อเงินเข้ามาแล้ว x สตางค์ */
export function cumulativeOf(full: bigint, totalSatang: bigint, paidSatang: bigint): bigint {
  if (totalSatang <= ZERO || full <= ZERO || paidSatang <= ZERO) return ZERO;
  return paidSatang >= totalSatang ? full : (full * paidSatang) / totalSatang;
}

/** ส่วนแบ่งของการรับเงินงวดนี้ = F(ก่อน + p) − F(ก่อน) (ผลรวมสะสม — ไม่มีสตางค์หายไม่ว่าจ่ายกี่งวด) */
export function shareOf(full: bigint, totalSatang: bigint, beforeSatang: bigint, paidSatang: bigint): bigint {
  const before = beforeSatang > ZERO ? beforeSatang : ZERO;
  const s = cumulativeOf(full, totalSatang, before + (paidSatang > ZERO ? paidSatang : ZERO)) - cumulativeOf(full, totalSatang, before);
  return s > ZERO ? s : ZERO;
}

/**
 * แบ่งส่วนแบ่ง A ให้เจ้าของ + ผู้ร่วม (§11.6): กอง = ⌊A·bp/10⁴⌋ · ต่อคน ⌊กอง/N⌋ · เจ้าของ = A − N·ต่อคน
 * เจ้าของที่ถูกใส่ชื่อเป็นผู้ร่วมด้วยไม่นับซ้ำ · ชื่อซ้ำนับครั้งเดียว · คืนเฉพาะคนที่ได้ > 0
 */
export function splitParts(amount: bigint, splitBp: number, ownerUserId: string, collaboratorUserIds: readonly string[]): { userId: string; amount: bigint }[] {
  const coll = [...new Set((collaboratorUserIds ?? []).filter((u) => typeof u === "string" && u && u !== ownerUserId))];
  const bp = isInt(splitBp) && splitBp > 0 ? Math.min(splitBp, 10_000) : 0;
  if (coll.length === 0 || bp === 0) return amount > ZERO ? [{ userId: ownerUserId, amount }] : [];
  const pool = (amount * BigInt(bp)) / TENK;
  const each = pool / BigInt(coll.length);
  const owner = amount - each * BigInt(coll.length);
  const out: { userId: string; amount: bigint }[] = [];
  if (owner > ZERO) out.push({ userId: ownerUserId, amount: owner });
  if (each > ZERO) for (const u of coll) out.push({ userId: u, amount: each });
  return out;
}

// ───────────────────────── งวด (เดือนไทย · ค.ศ.) ─────────────────────────

const OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** เดือนไทยของเวลา + เลื่อนวันจ่าย → "YYYY-MM" (กับดักเที่ยงคืนไทย: 30 ก.ย. 17:30Z = 1 ต.ค. 00:30 ไทย ⇒ "…-10") */
export function commissionPeriodOf(at: Date, delayDays = 0): string {
  const shift = isInt(delayDays) && delayDays > 0 ? delayDays : 0;
  const t = new Date(at.getTime() + OFFSET_MS + shift * DAY_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const PERIOD_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function nextPeriodKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * เดือนแรก ≥ base (strict = false) หรือ > base (strict = true) ที่ยังไม่มีรอบจ่ายเงินเดือนในระบบ HR นั้น
 * ไม่พบภายใน 240 เดือน = null (ผู้เรียกตอบ VALIDATION — N11 ของรีวิวเงิน: ห้ามคืนงวดที่มีรอบแล้วแบบเงียบ ๆ)
 */
export function firstFreePeriod(base: string, taken: ReadonlySet<string>, strict: boolean): string | null {
  let k = strict ? nextPeriodKey(base) : base;
  for (let i = 0; i < 240; i += 1) {
    if (!taken.has(k)) return k;
    k = nextPeriodKey(k);
  }
  return null;
}

/** รอบ 6: ป้ายใน `note` ของแถวร่างใหม่ของงวดที่ร่างเก่าเคยถูกคนไม่อนุมัติ — ไม่อนุมัติเอง รอคนตัดสิน */
export const COMMISSION_WAS_REJECTED_NOTE = "เคยถูกปฏิเสธ: งวดนี้เคยถูกไม่อนุมัติมาก่อน รายการนี้จึงรอผู้มีสิทธิ์อนุมัติด้วยตนเอง";
/** ป้ายใน `note` ของแถวถอนคืนที่ "ปิดเรื่องแล้วโดยไม่ต้องหักเงินเดือน" (ต้นทางไม่เคยถูกจ่าย — มติผู้คุมงาน B3) */
export const COMMISSION_REVERSAL_SETTLED_NOTE = "ปิดเรื่องแล้ว: ต้นทางยังไม่เคยถูกจ่าย ไม่ต้องหักคืนในเงินเดือน";

// ───────────────────────── ตัวตรวจค่าของกฎ (บริสุทธิ์ — หน้าจอใช้ตัวเดียวกัน) ─────────────────────────

export type RuleConfigCheck = { ok: true; config: RuleConfig } | { ok: false; message: string };

/** ตรวจ + ทำให้เป็นรูปมาตรฐาน: PCT {pctBp} · FIXED {fixedSatang, pctBp?} · TIERED {tiers:[{uptoSatang|null, pctBp}]} เรียงขึ้น ปิดท้ายด้วย null */
export function checkRuleConfig(kind: unknown, raw: unknown): RuleConfigCheck {
  const c = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null) as Record<string, unknown> | null;
  if (!c) return { ok: false, message: "ยังไม่ได้ระบุอัตราคอมมิชชันของกฎนี้ — กรอกเปอร์เซ็นต์หรือจำนวนเงินก่อนบันทึก" };
  const bpOk = (v: unknown) => isInt(v) && v >= 0 && v <= COMMISSION_LIMITS.bpMax;
  if (kind === "PCT") {
    if (!bpOk(c.pctBp)) return { ok: false, message: "เปอร์เซ็นต์คอมมิชชันต้องอยู่ระหว่าง 0–100% (ทศนิยมได้ 2 ตำแหน่ง)" };
    return { ok: true, config: { pctBp: c.pctBp as number } };
  }
  if (kind === "FIXED") {
    if (!isInt(c.fixedSatang) || (c.fixedSatang as number) < 0) return { ok: false, message: "จำนวนเงินคงที่ต่อดีลต้องเป็น 0 บาทขึ้นไป" };
    if (c.pctBp !== undefined && c.pctBp !== null && !bpOk(c.pctBp)) return { ok: false, message: "เปอร์เซ็นต์ที่บวกเพิ่มต้องอยู่ระหว่าง 0–100%" };
    return { ok: true, config: { fixedSatang: c.fixedSatang as number, ...(isInt(c.pctBp) ? { pctBp: c.pctBp } : {}) } };
  }
  if (kind === "TIERED") {
    const tiers = Array.isArray(c.tiers) ? c.tiers : null;
    if (!tiers || tiers.length === 0) return { ok: false, message: "กฎแบบขั้นบันไดต้องมีอย่างน้อย 1 ขั้น" };
    if (tiers.length > COMMISSION_LIMITS.tiersMax) return { ok: false, message: `กฎแบบขั้นบันไดมีได้ไม่เกิน ${COMMISSION_LIMITS.tiersMax} ขั้น` };
    const out: TierDef[] = [];
    let prev = 0;
    for (let i = 0; i < tiers.length; i += 1) {
      const t = (tiers[i] && typeof tiers[i] === "object" ? tiers[i] : {}) as Record<string, unknown>;
      const last = i === tiers.length - 1;
      if (!bpOk(t.pctBp)) return { ok: false, message: `ขั้นที่ ${i + 1}: เปอร์เซ็นต์ต้องอยู่ระหว่าง 0–100%` };
      if (last) {
        if (t.uptoSatang !== null) return { ok: false, message: "ขั้นสุดท้ายต้องเป็น \"ส่วนที่เกิน\" (ไม่มีเพดาน) — ลบเพดานของขั้นสุดท้ายออก" };
        out.push({ uptoSatang: null, pctBp: t.pctBp as number });
      } else {
        if (!isInt(t.uptoSatang) || (t.uptoSatang as number) <= prev) {
          return { ok: false, message: `ขั้นที่ ${i + 1}: เพดานต้องมากกว่าขั้นก่อนหน้า (เรียงจากน้อยไปมาก)` };
        }
        prev = t.uptoSatang as number;
        out.push({ uptoSatang: prev, pctBp: t.pctBp as number });
      }
    }
    return { ok: true, config: { tiers: out } };
  }
  return { ok: false, message: "ชนิดของกฎต้องเป็น เปอร์เซ็นต์ · คงที่ต่อดีล · หรือขั้นบันได" };
}

// ───────────────────────── ค่าตั้งของร้าน `settings.crm.commission` ─────────────────────────

export type CommissionSettings = {
  /** ค่าเริ่มต้นของ basis ในหน้าเพิ่มกฎ */
  basis: CommissionBasis;
  /** true (ค่าเริ่มต้น) = คอมมิชชันใหม่ทุกแถวต้องผ่านการอนุมัติ (สายอนุมัติ `crm.commission` หรือผู้มีสิทธิ์กดเอง) */
  approvalRequired: boolean;
  /** true (ค่าเริ่มต้น) = อนุมัติแล้วส่งเข้างวดเงินเดือนของพนักงานที่ผูกไว้ */
  payrollLink: boolean;
};

export function commissionSettingsOf(raw: unknown): CommissionSettings {
  const root = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const crm = root.crm && typeof root.crm === "object" && !Array.isArray(root.crm) ? (root.crm as Record<string, unknown>) : {};
  const c = crm.commission && typeof crm.commission === "object" && !Array.isArray(crm.commission) ? (crm.commission as Record<string, unknown>) : {};
  return {
    basis: c.basis === "WON" ? "WON" : "PAID",
    approvalRequired: c.approvalRequired !== false,
    payrollLink: c.payrollLink !== false,
  };
}

// ───────────────────────── ข้อความของกฎ (ภาพ 10 ขวา) ─────────────────────────

const bahtOf = (satang: number) => `฿${(satang / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const pctOf = (bp: number) => `${(bp / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** "5% แรก ฿0–500,000 · 8% ส่วนเกิน" · "คงที่ ฿150 ต่อดีล + 3% ของมูลค่า" · "5% ของมูลค่า" */
export function describeRule(kind: string, config: unknown, splitBp = 0): string {
  const cfg = (config && typeof config === "object" ? config : {}) as RuleConfig;
  let text = "";
  if (kind === "PCT") text = `${pctOf(cfg.pctBp ?? 0)} ของมูลค่า`;
  else if (kind === "FIXED") text = `คงที่ ${bahtOf(cfg.fixedSatang ?? 0)} ต่อดีล${cfg.pctBp ? ` + ${pctOf(cfg.pctBp)} ของมูลค่า` : ""}`;
  else if (kind === "TIERED") {
    let prev = 0;
    text = (cfg.tiers ?? [])
      .map((t, i) => {
        const s = t.uptoSatang === null ? `${pctOf(t.pctBp)} ส่วนเกิน` : `${pctOf(t.pctBp)} ${i === 0 ? "แรก " : ""}${bahtOf(prev)}–${bahtOf(t.uptoSatang).replace("฿", "")}`;
        if (t.uptoSatang !== null) prev = t.uptoSatang;
        return s;
      })
      .join(" · ");
  }
  if (splitBp > 0) text += ` · แบ่งผู้ร่วม ${Math.round((10_000 - splitBp) / 100)}/${Math.round(splitBp / 100)}`;
  return text;
}

// ───────────────────────── ชนิดของผลลัพธ์ (DTO) ─────────────────────────

export type CommissionRuleDto = {
  id: string;
  name: string;
  basis: CommissionBasis;
  kind: CommissionKind;
  config: RuleConfig;
  description: string;
  pipelineId: string | null;
  teamId: string | null;
  productIds: string[];
  minDealSatang: number | null;
  splitCollaboratorsBp: number;
  payoutDelayDays: number;
  active: boolean;
  sortOrder: number;
};

export type CommissionDto = {
  id: string;
  dealId: string;
  dealTitle: string | null;
  ruleId: string;
  ruleName: string | null;
  userId: string;
  userName: string | null;
  amountSatang: number;
  basisSatang: number;
  basis: CommissionBasis;
  status: CommissionStatus;
  periodKey: string;
  refType: string | null;
  refId: string;
  reversedOfId: string | null;
  approvalRequestId: string | null;
  hrPayAdjustmentId: string | null;
  payroll: CommissionPayroll;
  /** แถวฐาน WON ที่ถอนคืนแล้วดีลกลับมาชนะอีก — หน้าจอแสดง "เคยจ่ายแล้ว" (ระบบไม่สร้างแถวใหม่ให้เอง) */
  rewon: boolean;
  createdAt: string;
  decidedAt: string | null;
};

export type CommissionReportRow = {
  userId: string;
  userName: string | null;
  pendingSatang: number;
  approvedSatang: number;
  paidSatang: number;
  /** ติดลบ (แถวถอนคืน) */
  reversedSatang: number;
  netSatang: number;
  /** ไม่นับแถวที่ไม่อนุมัติ */
  count: number;
};
export type CommissionReport = {
  periodKey: string;
  rows: CommissionReportRow[];
  totals: Omit<CommissionReportRow, "userId" | "userName">;
};

/** ป้าย/สถานะฝั่งเงินเดือนของแถว (หน้าจอกับบริการใช้ตัวเดียวกัน) */
export function payrollStateOf(row: { status: string; hrPayAdjustmentId: string | null; reversedOfId: string | null }, reversed: boolean): CommissionPayroll {
  if (row.status === "PAID") return "PAID";
  if (row.hrPayAdjustmentId) return "REQUESTED";
  if (row.status === "APPROVED" && !row.reversedOfId && !reversed) return "WAITING_EMPLOYEE";
  return null;
}

