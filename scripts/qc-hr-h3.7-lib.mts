// QC lib — HR H3.7 payroll accounting v2: the oracle's OWN journal arithmetic (spec formulae, independent of the code under test) +
//   deterministic fuzz generator + fixture-vector self-checks.
// ⚠️ Oracle under change control (same as qc-hr-h3.7.mts) — builder: ask for an ORACLE-EDIT, never edit.
// 🔴 Nothing here imports the code under test.
import { type Any, jsonOf } from "./qc-hr-lib.mjs";

export const FIX = "scripts/fixtures/";
export const VEC = jsonOf(`${FIX}hr-h3.7-vectors.json`) as Any;
export const TX = jsonOf(`${FIX}hr-h3.7-texts.json`) as Any;
export const T: Record<string, string> = TX?.th ?? {};

export const AMOUNT_KEYS = [
  "salaryExpenseSatang", "ssoEmployerSatang", "refundSatang", "receivableDamagesSatang", "receivableOverpaySatang",
  "netSatang", "ssoPayableSatang", "whtSatang", "advanceRecoveredSatang", "damagesRecoveredSatang", "overpayRecoveredSatang",
] as const;
export type Amounts = Record<(typeof AMOUNT_KEYS)[number], number>;
export type Row = [string, "DR" | "CR", number];
export type VItem = { emp: string; grossSatang: number; ssoEmployeeSatang: number; ssoEmployerSatang: number; whtSatang: number; netSatang: number; addSatang?: number; deductSatang?: number; ssoEligible?: boolean; endDate?: string; snapshot: Any };
export type VBound = { id: string; emp: string; kind: string; sourceType: string | null; sourceRef: string | null; amountSatang: number };

/** brief §3 R3 — class of a bound adjustment row (H3.4 planCarryRows rule, hoisted) */
export function oracleClass(a: { kind: string; sourceType: string | null; sourceRef: string | null }): "ADVANCE" | "DAMAGES" | "OVERPAY" | null {
  if (a.kind === "ADVANCE") return "ADVANCE";
  if (a.sourceType === "LATE_RULE" || a.sourceType === "ABSENT_RULE") return null;
  if (a.sourceType === "CARRY_FORWARD") return (/:(DAMAGES|OVERPAY)$/.exec(String(a.sourceRef ?? ""))?.[1] as "DAMAGES" | "OVERPAY" | undefined) ?? "DAMAGES";
  if (a.sourceType && ["CRM_COMMISSION", "POS_SALE_LINE", "OT_REQUEST"].includes(a.sourceType)) return "OVERPAY";
  return "DAMAGES";
}

const int = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);

/** brief §3 R3 — accrual amounts from STORED figures only (never recomputed pay) */
export function oracleAmounts(items: VItem[], bound: VBound[]): { ok: true; amounts: Amounts } | { ok: false; why: string } {
  const a = Object.fromEntries(AMOUNT_KEYS.map((k) => [k, 0])) as Amounts;
  const byId = new Map(bound.map((b) => [b.id, b]));
  for (const it of items) {
    const lines = it.snapshot?.lines;
    if (!Array.isArray(lines)) return { ok: false, why: `${it.emp}: no lines` };
    if (![it.grossSatang, it.ssoEmployeeSatang, it.ssoEmployerSatang, it.whtSatang, it.netSatang].every(int)) return { ok: false, why: `${it.emp}: not integer` };
    let sum = 0;
    let adv = 0;
    let dmg = 0;
    let ovp = 0;
    let refund = 0;
    for (const l of lines) {
      if (!int(l.amountSatang)) return { ok: false, why: `${it.emp}: line not integer` };
      sum += l.amountSatang;
      if (l.code === "ADVANCE" || l.code === "DEDUCTION") {
        const b = byId.get(l.ref);
        if (!b || b.emp !== it.emp) return { ok: false, why: `${it.emp}: ${l.code} ${l.ref} not bound` };
        const c = l.code === "ADVANCE" ? "ADVANCE" : oracleClass(b);
        if (c === "ADVANCE") adv -= l.amountSatang;
        else if (c === "DAMAGES") dmg -= l.amountSatang;
        else if (c === "OVERPAY") ovp -= l.amountSatang;
        else return { ok: false, why: `${it.emp}: DEDUCTION ${l.ref} class null` };
      } else if (l.code === "REFUND") refund += l.amountSatang;
    }
    if (sum !== it.grossSatang) return { ok: false, why: `${it.emp}: Σ lines ${sum} ≠ gross ${it.grossSatang}` };
    if (it.grossSatang !== it.netSatang + it.ssoEmployeeSatang + it.whtSatang) return { ok: false, why: `${it.emp}: gross ≠ net+sso+wht` };
    const exp = sum + adv + dmg + ovp - refund;
    if (exp < 0 || adv < 0 || dmg < 0 || ovp < 0 || refund < 0 || it.netSatang < 0) return { ok: false, why: `${it.emp}: negative part` };
    a.salaryExpenseSatang += exp;
    a.ssoEmployerSatang += it.ssoEmployerSatang;
    a.refundSatang += refund;
    a.netSatang += it.netSatang;
    a.ssoPayableSatang += it.ssoEmployeeSatang + it.ssoEmployerSatang;
    a.whtSatang += it.whtSatang;
    a.advanceRecoveredSatang += adv;
    a.damagesRecoveredSatang += dmg;
    a.overpayRecoveredSatang += ovp;
    for (const r of (it.snapshot.receivable ?? []) as { cls: string; amountSatang: number }[]) {
      if (r.cls === "DAMAGES") a.receivableDamagesSatang += r.amountSatang;
      else if (r.cls === "OVERPAY") a.receivableOverpaySatang += r.amountSatang;
    }
  }
  return { ok: true, amounts: a };
}

/** brief §3 R4 — template rows in order, zero rows omitted, never netted */
export function oracleRows(a: Amounts): Row[] {
  return (VEC.template as [string, "DR" | "CR", keyof Amounts, string][]).map(([k, s, f]) => [k, s, a[f]] as Row).filter((r) => r[2] !== 0);
}
export const codeOfKey = (key: string): string => (VEC.accounts as Any[]).find((x) => x.key === key)?.code ?? "?";
export const sumSide = (rows: Row[], s: "DR" | "CR") => rows.filter((r) => r[1] === s).reduce((t, r) => t + r[2], 0);

/** builder template output → Row[] (accepts {key, side, amountSatang}) */
export function rowsFrom(x: unknown): Row[] | null {
  if (!Array.isArray(x)) return null;
  return x.map((r: Any) => [String(r?.key), String(r?.side) as "DR" | "CR", Number(r?.amountSatang)] as Row);
}
export const rowsEq = (a: Row[] | null, b: Row[]) => !!a && a.length === b.length && a.every((r, i) => r[0] === b[i]![0] && r[1] === b[i]![1] && r[2] === b[i]![2]);

/** S2.0 control: every worked example self-consistent (hand numbers agree with the oracle's own formula) */
export function vectorsSelfCheck(): string[] {
  const bad: string[] = [];
  for (const [name, ex] of Object.entries(VEC.examples as Record<string, Any>)) {
    const r = oracleAmounts(ex.items, ex.bound);
    if (!r.ok) {
      bad.push(`${name}: ${r.why}`);
      continue;
    }
    for (const k of AMOUNT_KEYS) if (r.amounts[k] !== ex.amounts[k]) bad.push(`${name}.${k} ${r.amounts[k]}≠${ex.amounts[k]}`);
    const rows = oracleRows(r.amounts);
    if (!rowsEq(rows, ex.rows)) bad.push(`${name}: rows`);
    const byCode = rows.map(([k, s, n]) => [codeOfKey(k), s, n]);
    if (JSON.stringify(byCode) !== JSON.stringify(ex.byCode)) bad.push(`${name}: byCode`);
    if (sumSide(rows, "DR") !== ex.total || sumSide(rows, "CR") !== ex.total) bad.push(`${name}: total`);
    const net = ex.items.reduce((t: number, i: VItem) => t + i.netSatang, 0);
    if (ex.pay.length && (ex.pay[0][2] !== net || ex.pay[1][2] !== net)) bad.push(`${name}: pay`);
  }
  return bad;
}

// ═════════════ deterministic fuzz (mulberry32) ═════════════
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const CLAIM_SRC = ["MANUAL", null, "INVENTORY_ISSUE", "CRM_COMMISSION", "POS_SALE_LINE", "OT_REQUEST"] as const;
/** one random consistent run (stored-figure shape) */
export function fuzzRun(r: () => number, n: number): { items: VItem[]; bound: VBound[] } {
  const ri = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const items: VItem[] = [];
  const bound: VBound[] = [];
  for (let e = 0; e < n; e++) {
    const emp = `f${n}_${e}`;
    const lines: Any[] = [{ code: "BASE", ref: "profile", amountSatang: ri(100_000, 9_000_000) }];
    let E = lines[0].amountSatang;
    if (r() < 0.2) {
      const p = -ri(1, Math.floor(E / 2));
      lines.push({ code: "PRORATION", ref: "employment", amountSatang: p });
      E += p;
    }
    if (r() < 0.3) {
      const late = -ri(1, Math.floor(E / 10));
      const id = `${emp}late`;
      bound.push({ id, emp, kind: "DEDUCTION", sourceType: r() < 0.5 ? "LATE_RULE" : "ABSENT_RULE", sourceRef: null, amountSatang: -late });
      lines.push({ code: r() < 0.5 ? "LATE_RULE" : "ABSENT_RULE", ref: id, amountSatang: late });
      E += late;
    }
    for (const code of ["OT", "COMMISSION", "BONUS", "ALLOWANCE", "REFUND"]) {
      if (r() < 0.25) {
        const v = ri(1, 3_000_000);
        const id = `${emp}${code}`;
        bound.push({ id, emp, kind: code, sourceType: "MANUAL", sourceRef: null, amountSatang: v });
        lines.push({ code, ref: id, amountSatang: v });
        E += v;
      }
    }
    const ssoE = r() < 0.15 ? 0 : ri(0, Math.min(87_500, Math.floor(E / 20)));
    const ssoR = ssoE === 0 ? 0 : ssoE;
    const wht = r() < 0.4 ? 0 : ri(0, Math.floor((E - ssoE) / 10));
    let left = E - ssoE - wht;
    for (let k = 0; k < ri(0, 3); k++) {
      if (left <= 0) break;
      const isAdv = r() < 0.4;
      const v = ri(1, Math.max(1, Math.floor(left / 3)));
      const id = `${emp}c${k}`;
      const carry = r() < 0.2;
      const src = isAdv ? (carry ? "CARRY_FORWARD" : "MANUAL") : carry ? "CARRY_FORWARD" : CLAIM_SRC[ri(0, CLAIM_SRC.length - 1)];
      const ref = carry ? `cf:prev:${emp}:${isAdv ? "ADVANCE" : r() < 0.5 ? "DAMAGES" : "OVERPAY"}` : null;
      bound.push({ id, emp, kind: isAdv ? "ADVANCE" : "DEDUCTION", sourceType: src, sourceRef: ref, amountSatang: v });
      lines.push({ code: isAdv ? "ADVANCE" : "DEDUCTION", ref: id, amountSatang: -v });
      left -= v;
    }
    const gross = lines.reduce((t, l) => t + l.amountSatang, 0);
    const receivable = r() < 0.15 ? [{ cls: "DAMAGES", amountSatang: ri(1, 50_000) }, { cls: "OVERPAY", amountSatang: ri(1, 50_000) }, { cls: "ADVANCE", amountSatang: ri(1, 50_000) }].filter(() => r() < 0.6) : [];
    items.push({ emp, grossSatang: gross, ssoEmployeeSatang: ssoE, ssoEmployerSatang: ssoR, whtSatang: wht, netSatang: gross - ssoE - wht, snapshot: { engineVersion: 2, lines, carry: [], receivable } });
  }
  return { items, bound };
}

/** builder's amounts → Amounts (missing key = NaN, so it never equals) */
export const amountsFrom = (x: Any): Amounts => Object.fromEntries(AMOUNT_KEYS.map((k) => [k, typeof x?.[k] === "number" ? x[k] : NaN])) as Amounts;
export const amountsEq = (a: Amounts, b: Amounts) => AMOUNT_KEYS.every((k) => a[k] === b[k]);
/** bkk calendar day "YYYY-MM-DD" of a Date */
export const bkkDay = (d: unknown): string => (d instanceof Date && Number.isFinite(d.getTime()) ? new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10) : "∅");
export const fill = (t: string, m: Record<string, string>) => Object.entries(m).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), t);
