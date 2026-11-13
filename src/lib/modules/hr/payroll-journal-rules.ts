// HR H3.7 ▸ payroll accounting v2 — pure rules (no db · no clock · no random · type-only imports)
//   brief ledger/hr-briefs/hr-brief-H3.7.md §3 · design ledger/wo-notes/hr-H3.7-design.md §2 (template) §4 (worked examples)
//   Amounts come from STORED figures only (run items + the adjustment rows bound to the run, written by H3.4) — nothing is recomputed.
import type { PayrollAccrualAmounts } from "@/lib/modules/account";

export type ClaimClass = "ADVANCE" | "DAMAGES" | "OVERPAY";

/** Class of a bound adjustment row — the H3.4 planCarryRows rule (one rule): ADVANCE · LATE/ABSENT = reduced wage (null) ·
 *  carry-forward = the class in the sourceRef suffix · commission/POS/OT clawbacks = OVERPAY · anything else = DAMAGES */
export function claimClassOf(a: { kind: string; sourceType: string | null; sourceRef: string | null }): ClaimClass | null {
  if (a.kind === "ADVANCE") return "ADVANCE";
  if (a.sourceType === "LATE_RULE" || a.sourceType === "ABSENT_RULE") return null;
  if (a.sourceType === "CARRY_FORWARD") return (/:(DAMAGES|OVERPAY)$/.exec(String(a.sourceRef ?? ""))?.[1] as ClaimClass | undefined) ?? "DAMAGES";
  if (a.sourceType && ["CRM_COMMISSION", "POS_SALE_LINE", "OT_REQUEST"].includes(a.sourceType)) return "OVERPAY";
  return "DAMAGES";
}

export type AccrualItem = {
  employeeId: string;
  grossSatang: number;
  ssoEmployeeSatang: number;
  ssoEmployerSatang: number;
  whtSatang: number;
  netSatang: number;
  snapshotJson: unknown;
};
export type AccrualBound = { id: string; employeeId: string; kind: string; sourceType: string | null; sourceRef: string | null; amountSatang: number };
export type AccrualResult = { ok: true; amounts: PayrollAccrualAmounts; flags: string[] } | { ok: false; code: "INCONSISTENT"; employeeId: string | null };
/** fix r1 F5 — a REFUND row names the claim it gives back by `sourceRef = "refund:<claim adjustment id>"`; the caller passes those claim rows
 *  with `booked` = the claim was recovered in a run posted by the two-step accrual (false = a v1 / H3.4-era one-step run: the deduction then
 *  reduced the wage posted to salary expense, so its refund goes back to salary expense) */
export type RefundClaim = { id: string; kind: string; sourceType: string | null; sourceRef: string | null; /** null = the claim was never recovered by a run */ booked: boolean | null };
export const REFUND_OF_PREFIX = "refund:";
export const REFUND_CLASS_UNKNOWN = "REFUND_CLASS_UNKNOWN";
/** fix r2 (b): `refund:<claimId>` or `refund:<claimId>#<refund id>` (HrPayAdjustment is unique per (tenant, sourceType, sourceRef) ⇒ each partial refund carries its own suffix) */
export function refundClaimIdOf(sourceRef: string | null | undefined): string | null {
  const r = String(sourceRef ?? "");
  if (!r.startsWith(REFUND_OF_PREFIX)) return null;
  const id = r.slice(REFUND_OF_PREFIX.length).split("#")[0] ?? "";
  return id || null;
}
/** class of the debit of a refund: DAMAGES → damages recovery (4900) · OVERPAY → overpay recovery (6000) · WAGE → salary expense (old run) ·
 *  unknown (no reference / claim not found / advance) → damages recovery + flag for the accountant */
export function refundClassOf(refundRow: { sourceRef: string | null } | undefined, claims: readonly RefundClaim[]): "DAMAGES" | "OVERPAY" | "WAGE" | "UNKNOWN" {
  const ref = String(refundRow?.sourceRef ?? "");
  if (!ref.startsWith(REFUND_OF_PREFIX)) return "UNKNOWN";
  const c = claims.find((x) => x.id === refundClaimIdOf(ref));
  if (!c || c.kind !== "DEDUCTION" || c.booked === null) return "UNKNOWN";
  if (!c.booked) return "WAGE";
  const cls = claimClassOf(c);
  return cls === "DAMAGES" || cls === "OVERPAY" ? cls : "UNKNOWN";
}

const int = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Accrual amounts of one run (Σ over items) — refuses INCONSISTENT instead of guessing (design §2 · brief §3) */
export function accrualAmountsV2(items: readonly AccrualItem[], bound: readonly AccrualBound[], refundClaims: readonly RefundClaim[] = []): AccrualResult {
  const flags = new Set<string>();
  const a: Required<PayrollAccrualAmounts> = {
    salaryExpenseSatang: 0, ssoEmployerSatang: 0, refundSatang: 0, refundOverpaySatang: 0, receivableDamagesSatang: 0, receivableOverpaySatang: 0,
    netSatang: 0, ssoPayableSatang: 0, whtSatang: 0, advanceRecoveredSatang: 0, damagesRecoveredSatang: 0, overpayRecoveredSatang: 0,
  };
  const byId = new Map(bound.map((b) => [b.id, b]));
  for (const it of items) {
    const bad = { ok: false as const, code: "INCONSISTENT" as const, employeeId: typeof it?.employeeId === "string" ? it.employeeId : null };
    const snap = rec(it?.snapshotJson);
    const lines = snap?.lines;
    if (!Array.isArray(lines)) return bad;
    if (![it.grossSatang, it.ssoEmployeeSatang, it.ssoEmployerSatang, it.whtSatang, it.netSatang].every(int)) return bad;
    let sum = 0;
    let adv = 0;
    let dmg = 0;
    let ovp = 0;
    let refund = 0;
    let refundOvp = 0;
    let refundWage = 0;
    for (const raw of lines) {
      const l = rec(raw);
      if (!l || !int(l.amountSatang)) return bad;
      const amt = l.amountSatang;
      sum += amt;
      if (l.code === "ADVANCE" || l.code === "DEDUCTION") {
        const b = byId.get(String(l.ref));
        if (!b || b.employeeId !== it.employeeId) return bad;
        const c = l.code === "ADVANCE" ? "ADVANCE" : claimClassOf(b);
        if (c === "ADVANCE") adv -= amt;
        else if (c === "DAMAGES") dmg -= amt;
        else if (c === "OVERPAY") ovp -= amt;
        else return bad;
      } else if (l.code === "REFUND") {
        const rc = refundClassOf(byId.get(String(l.ref)), refundClaims);
        if (rc === "OVERPAY") refundOvp += amt;
        else if (rc === "WAGE") refundWage += amt;
        else {
          refund += amt;
          if (rc === "UNKNOWN") flags.add(REFUND_CLASS_UNKNOWN);
        }
      }
    }
    if (!Number.isSafeInteger(sum) || sum !== it.grossSatang) return bad;
    if (it.grossSatang !== it.netSatang + it.ssoEmployeeSatang + it.whtSatang) return bad;
    const exp = sum + adv + dmg + ovp - refund - refundOvp; // a WAGE refund (claim of an old one-step run) stays in salary expense
    if (exp < 0 || adv < 0 || dmg < 0 || ovp < 0 || refund < 0 || refundOvp < 0 || refundWage < 0 || it.netSatang < 0 || it.ssoEmployeeSatang < 0 || it.ssoEmployerSatang < 0 || it.whtSatang < 0) return bad;
    let rD = 0;
    let rO = 0;
    const recv = snap?.receivable;
    if (recv !== undefined && recv !== null && !Array.isArray(recv)) return bad;
    for (const raw of (recv ?? []) as unknown[]) {
      const r = rec(raw);
      if (!r || !int(r.amountSatang) || r.amountSatang < 0) return bad;
      if (r.cls === "DAMAGES") rD += r.amountSatang;
      else if (r.cls === "OVERPAY") rO += r.amountSatang;
      // ADVANCE receivable: not booked (the advance already sits in the employee receivable account — design §2 / Q8)
    }
    a.salaryExpenseSatang += exp;
    a.ssoEmployerSatang += it.ssoEmployerSatang;
    a.refundSatang += refund;
    a.refundOverpaySatang += refundOvp;
    a.netSatang += it.netSatang;
    a.ssoPayableSatang += it.ssoEmployeeSatang + it.ssoEmployerSatang;
    a.whtSatang += it.whtSatang;
    a.advanceRecoveredSatang += adv;
    a.damagesRecoveredSatang += dmg;
    a.overpayRecoveredSatang += ovp;
    a.receivableDamagesSatang += rD;
    a.receivableOverpaySatang += rO;
  }
  if (!Object.values(a).every((v) => Number.isSafeInteger(v) && v >= 0)) return { ok: false, code: "INCONSISTENT", employeeId: null };
  return { ok: true, amounts: a, flags: [...flags] };
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const PK = /^(\d{4})-(\d{2})$/;
function lastDayOf(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function validDay(s: unknown): { y: number; m: number; d: number } | null {
  const x = typeof s === "string" ? YMD.exec(s) : null;
  if (!x) return null;
  const y = Number(x[1]);
  const m = Number(x[2]);
  const d = Number(x[3]);
  if (m < 1 || m > 12 || d < 1 || d > lastDayOf(y, m)) return null;
  return { y, m, d };
}
function validPeriod(p: unknown): { y: number; m: number } | null {
  const x = typeof p === "string" ? PK.exec(p) : null;
  if (!x) return null;
  const y = Number(x[1]);
  const m = Number(x[2]);
  return m >= 1 && m <= 12 ? { y, m } : null;
}
const pad = (n: number) => String(n).padStart(2, "0");

/** Accrual day = clamp(pay day, first day of P, last day of P) — the expense belongs to the wage month (AC1 · fix r1 F4) · malformed ⇒ null */
export function payrollAccrualDay(periodKey: string, payDay: string): string | null {
  const p = validPeriod(periodKey);
  const d = validDay(payDay);
  if (!p || !d) return null;
  const first = `${p.y}-${pad(p.m)}-01`;
  const last = `${p.y}-${pad(p.m)}-${pad(lastDayOf(p.y, p.m))}`;
  return payDay < first ? first : payDay < last ? payDay : last;
}

/** Pay date allowed: a real date, first day of P ≤ paidOn ≤ today (Q6) */
export function paidOnOk(periodKey: string, paidOn: string, today: string): boolean {
  const p = validPeriod(periodKey);
  if (!p || !validDay(paidOn) || !validDay(today)) return false;
  return paidOn >= `${p.y}-${pad(p.m)}-01` && paidOn <= today;
}
