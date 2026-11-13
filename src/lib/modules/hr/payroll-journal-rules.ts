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
export type AccrualResult = { ok: true; amounts: PayrollAccrualAmounts } | { ok: false; code: "INCONSISTENT"; employeeId: string | null };

const int = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);
const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Accrual amounts of one run (Σ over items) — refuses INCONSISTENT instead of guessing (design §2 · brief §3) */
export function accrualAmountsV2(items: readonly AccrualItem[], bound: readonly AccrualBound[]): AccrualResult {
  const a: PayrollAccrualAmounts = {
    salaryExpenseSatang: 0, ssoEmployerSatang: 0, refundSatang: 0, receivableDamagesSatang: 0, receivableOverpaySatang: 0,
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
      } else if (l.code === "REFUND") refund += amt;
    }
    if (!Number.isSafeInteger(sum) || sum !== it.grossSatang) return bad;
    if (it.grossSatang !== it.netSatang + it.ssoEmployeeSatang + it.whtSatang) return bad;
    const exp = sum + adv + dmg + ovp - refund;
    if (exp < 0 || adv < 0 || dmg < 0 || ovp < 0 || refund < 0 || it.netSatang < 0 || it.ssoEmployeeSatang < 0 || it.ssoEmployerSatang < 0 || it.whtSatang < 0) return bad;
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
  return { ok: true, amounts: a };
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

/** Accrual day = min(pay day, last day of the wage month P) — "YYYY-MM-DD" · malformed ⇒ null (design §1 · Q7) */
export function payrollAccrualDay(periodKey: string, payDay: string): string | null {
  const p = validPeriod(periodKey);
  const d = validDay(payDay);
  if (!p || !d) return null;
  const last = `${p.y}-${pad(p.m)}-${pad(lastDayOf(p.y, p.m))}`;
  return payDay < last ? payDay : last;
}

/** Pay date allowed: a real date, first day of P ≤ paidOn ≤ today (Q6) */
export function paidOnOk(periodKey: string, paidOn: string, today: string): boolean {
  const p = validPeriod(periodKey);
  if (!p || !validDay(paidOn) || !validDay(today)) return false;
  return paidOn >= `${p.y}-${pad(p.m)}-01` && paidOn <= today;
}
