// QC — HR V2 · H3.8 payslip / yearly history / salary certificate — vectors + helpers for scripts/qc-hr-h3.8.mts
// 🔴 Every expected number below is hand arithmetic (ledger/wo-notes/hr-H3.8-oracle.md §2) — never produced by the code under test.
//    Slip vectors are snapshots as H3.4 (v2) / the v1 engine store them; the slip only READS them (no pay/tax/SSO formula anywhere here).
import { type Any, errText, sleep } from "./qc-hr-lib.mjs";

// ═════════════ item builders (stored shapes) ═════════════
export type Line = { code: string; ref: string; day: string | null; minutes: number | null; amountSatang: number; requestedSatang?: number };
const L = (code: string, amountSatang: number, ref = code.toLowerCase(), minutes: number | null = null): Line => ({ code, ref, day: null, minutes, amountSatang });
export type ItemIn = { grossSatang: number; netSatang: number; ssoBaseSatang: number; ssoEmployeeSatang: number; ssoEmployerSatang: number; whtSatang: number; addSatang: number; deductSatang: number; snapshotJson: Any };
/** v2 item: gross = Σ lines (H3.4 identity) · net = gross − SSO − WHT · whtIncome/oneOff/ssoWage = what H3.4 stores (read by H3.6 figures) */
export function v2Item(lines: Line[], o: { ssoBase: number; ee: number; wht: number; whtIncome: number; oneOff?: number; ssoWage?: number; add?: number; deduct?: number }): ItemIn {
  const gross = lines.reduce((a, l) => a + l.amountSatang, 0);
  return {
    grossSatang: gross, netSatang: gross - o.ee - o.wht, ssoBaseSatang: o.ssoBase, ssoEmployeeSatang: o.ee, ssoEmployerSatang: o.ee, whtSatang: o.wht, addSatang: o.add ?? 0, deductSatang: o.deduct ?? 0,
    snapshotJson: {
      engineVersion: 2, payType: "MONTHLY", baseSalarySatang: lines.find((l) => l.code === "BASE")?.amountSatang ?? 0, normalDayMin: 480, lines, flags: [], carry: [], receivable: [], availableSatang: gross - o.ee - o.wht,
      whtIncomeSatang: o.whtIncome, whtOneOffSatang: o.oneOff ?? 0, ssoWageSatang: o.ssoWage ?? o.whtIncome, workDays: [], holidayWork: {},
    },
  };
}
/** v1 item exactly as computeItem stores it (payroll.ts:487) */
export function v1Item(base: number, adjustments: { kind: string; amountSatang: number; note: string | null }[], o: { add: number; deduct: number; gross: number; ssoBase: number; ee: number; wht: number }): ItemIn {
  return {
    grossSatang: o.gross, netSatang: o.gross - o.ee - o.wht, ssoBaseSatang: o.ssoBase, ssoEmployeeSatang: o.ee, ssoEmployerSatang: o.ee, whtSatang: o.wht, addSatang: o.add, deductSatang: o.deduct,
    snapshotJson: { baseSalarySatang: base, addSatang: o.add, deductSatang: o.deduct, adjustments, ssoEligible: o.ee > 0, ssoEmployeeYearSatang: o.ee * 12, deductions: { spouse: false, children: 0 }, computedAt: "2031-01-25T00:00:00.000Z" },
  };
}
type ExpLine = { code: string; amountSatang: number; count: number; qty: number | null };
const E = (code: string, amountSatang: number, count = 1, qty: number | null = null): ExpLine => ({ code, amountSatang, count, qty });
export type Vec = { id: string; title: string; engineVersion: 1 | 2; item: ItemIn; exp: { earnings: ExpLine[]; deductions: ExpLine[]; earningsSatang: number; deductionsSatang: number; netSatang: number; ssoBaseSatang: number; employerSsoSatang: number; flags: string[] }; income: number };

// ═════════════ the 8 slip vectors (notes §2) ═════════════
// V1 plain monthly: 16,000 base · SSO 750 on a 15,000 base · WHT 0 → net 15,250
const V1 = v2Item([L("BASE", 1_600_000, "profile")], { ssoBase: 1_500_000, ee: 75_000, wht: 0, whtIncome: 1_600_000 });
// V2 = mockup 07c: base 16,000 · OT 600 · commission 700 + 500 (2 rows) · late 3 × 50 · SSO 750 · WHT 0 → 17,800 − 900 = 16,900
const V2 = v2Item(
  [L("BASE", 1_600_000, "profile"), L("OT", 60_000, "adj-ot"), L("COMMISSION", 70_000, "adj-c1"), L("COMMISSION", 50_000, "adj-c2"), L("LATE_RULE", -5_000, "att-1"), L("LATE_RULE", -5_000, "att-2"), L("LATE_RULE", -5_000, "att-3")],
  { ssoBase: 1_500_000, ee: 75_000, wht: 0, whtIncome: 1_765_000, add: 180_000, deduct: 15_000 },
);
// V3 mid-month starter: base 30,000 · starts 16th of a 31-day month · ÷30 ⇒ 30,000 × 16 / 30 = 16,000 ⇒ PRORATION −14,000 (minutes field = 16 days)
const V3 = v2Item([L("BASE", 3_000_000, "profile"), L("PRORATION", -1_400_000, "employment", 16)], { ssoBase: 1_500_000, ee: 75_000, wht: 0, whtIncome: 1_600_000 });
// V4 refund + advance: base 20,000 · REFUND 500 (not 40(1)) · ADVANCE −3,000 · SSO 750 → gross 17,500 · net 16,750 · 40(1) income 20,000
const V4 = v2Item([L("BASE", 2_000_000, "profile"), L("REFUND", 50_000, "adj-rf"), L("ADVANCE", -300_000, "adj-adv")], { ssoBase: 1_500_000, ee: 75_000, wht: 0, whtIncome: 2_000_000, ssoWage: 2_000_000, add: 50_000, deduct: 300_000 });
// V5 SSO cap + WHT: base 50,000 · stored SSO base 17,500 (QC law row) ⇒ 875 · stored WHT 2,708.33 → net 46,416.67
const V5 = v2Item([L("BASE", 5_000_000, "profile")], { ssoBase: 1_750_000, ee: 87_500, wht: 270_833, whtIncome: 5_000_000 });
// V6 bonus (one-off WHT): base 30,000 · BONUS 10,000 · SSO 875 · WHT 1,250 (of which 750 one-off) → net 37,875
const V6 = v2Item([L("BASE", 3_000_000, "profile"), L("BONUS", 1_000_000, "adj-bonus")], { ssoBase: 1_750_000, ee: 87_500, wht: 125_000, whtIncome: 4_000_000, oneOff: 75_000, ssoWage: 3_000_000, add: 1_000_000 });
// V7 legacy v1 with adjustments: base 15,000 · OT 600 · DEDUCTION 200 · SSO 750 → gross 15,400 · net 14,650 (adjustment notes never shown)
const V7 = v1Item(1_500_000, [{ kind: "OT", amountSatang: 60_000, note: "ทำงานวันเสาร์" }, { kind: "DEDUCTION", amountSatang: 20_000, note: "แก้วแตก" }], { add: 60_000, deduct: 20_000, gross: 1_540_000, ssoBase: 1_500_000, ee: 75_000, wht: 0 });
// V8 legacy v1 whose adjustment detail is missing: base 10,000 · addSatang 500 but adjustments [] ⇒ balancing line V1_OTHER 500 + flag
const V8 = v1Item(1_000_000, [], { add: 50_000, deduct: 0, gross: 1_050_000, ssoBase: 1_000_000, ee: 50_000, wht: 0 });
// V9 daily payer (no BASE line) — used only for the salary-certificate refusal certNoBase
export const V9 = v2Item([L("DAY_WAGE", 250_000, "wd1", 2400), L("DAY_WAGE", 250_000, "wd2", 2400)], { ssoBase: 500_000, ee: 25_000, wht: 0, whtIncome: 500_000 });
// V10 plain monthly 18,000 (e1's run paid in January of the next tax year)
export const V10 = v2Item([L("BASE", 1_800_000, "profile")], { ssoBase: 1_500_000, ee: 75_000, wht: 0, whtIncome: 1_800_000 });

const SSO = (a: number) => E("SSO", a);
const WHT = (a: number) => E("WHT", a);
export const VECS: Vec[] = [
  { id: "V1", title: "plain monthly", engineVersion: 2, item: V1, income: 1_600_000, exp: { earnings: [E("BASE", 1_600_000)], deductions: [SSO(75_000), WHT(0)], earningsSatang: 1_600_000, deductionsSatang: 75_000, netSatang: 1_525_000, ssoBaseSatang: 1_500_000, employerSsoSatang: 75_000, flags: [] } },
  { id: "V2", title: "mockup 07c: OT + commission ×2 + late ×3", engineVersion: 2, item: V2, income: 1_765_000, exp: { earnings: [E("BASE", 1_600_000), E("OT", 60_000), E("COMMISSION", 120_000, 2)], deductions: [E("LATE_RULE", 15_000, 3), SSO(75_000), WHT(0)], earningsSatang: 1_780_000, deductionsSatang: 90_000, netSatang: 1_690_000, ssoBaseSatang: 1_500_000, employerSsoSatang: 75_000, flags: [] } },
  { id: "V3", title: "mid-month starter (PRORATION inside earnings)", engineVersion: 2, item: V3, income: 1_600_000, exp: { earnings: [E("BASE", 3_000_000), E("PRORATION", -1_400_000, 1, 16)], deductions: [SSO(75_000), WHT(0)], earningsSatang: 1_600_000, deductionsSatang: 75_000, netSatang: 1_525_000, ssoBaseSatang: 1_500_000, employerSsoSatang: 75_000, flags: [] } },
  { id: "V4", title: "refund + advance", engineVersion: 2, item: V4, income: 2_000_000, exp: { earnings: [E("BASE", 2_000_000), E("REFUND", 50_000)], deductions: [E("ADVANCE", 300_000), SSO(75_000), WHT(0)], earningsSatang: 2_050_000, deductionsSatang: 375_000, netSatang: 1_675_000, ssoBaseSatang: 1_500_000, employerSsoSatang: 75_000, flags: [] } },
  { id: "V5", title: "SSO cap + WHT > 0", engineVersion: 2, item: V5, income: 5_000_000, exp: { earnings: [E("BASE", 5_000_000)], deductions: [SSO(87_500), WHT(270_833)], earningsSatang: 5_000_000, deductionsSatang: 358_333, netSatang: 4_641_667, ssoBaseSatang: 1_750_000, employerSsoSatang: 87_500, flags: [] } },
  { id: "V6", title: "bonus with one-off WHT", engineVersion: 2, item: V6, income: 4_000_000, exp: { earnings: [E("BASE", 3_000_000), E("BONUS", 1_000_000)], deductions: [SSO(87_500), WHT(125_000)], earningsSatang: 4_000_000, deductionsSatang: 212_500, netSatang: 3_787_500, ssoBaseSatang: 1_750_000, employerSsoSatang: 87_500, flags: [] } },
  { id: "V7", title: "legacy v1 with adjustments", engineVersion: 1, item: V7, income: 1_560_000, exp: { earnings: [E("BASE", 1_500_000), E("OT", 60_000)], deductions: [E("DEDUCTION", 20_000), SSO(75_000), WHT(0)], earningsSatang: 1_560_000, deductionsSatang: 95_000, netSatang: 1_465_000, ssoBaseSatang: 1_500_000, employerSsoSatang: 75_000, flags: [] } },
  { id: "V8", title: "legacy v1 without detail ⇒ V1_OTHER", engineVersion: 1, item: V8, income: 1_050_000, exp: { earnings: [E("BASE", 1_000_000), E("V1_OTHER", 50_000)], deductions: [SSO(50_000), WHT(0)], earningsSatang: 1_050_000, deductionsSatang: 50_000, netSatang: 1_000_000, ssoBaseSatang: 1_000_000, employerSsoSatang: 50_000, flags: ["V1_OTHER"] } },
];
export const VEC = Object.fromEntries(VECS.map((v) => [v.id, v])) as Record<string, Vec>;

/** broken stored data ⇒ slipView must refuse SLIP_DATA (never repair, never recompute) */
export function brokenItems(): { id: string; engineVersion: number; item: Any }[] {
  const c = (x: ItemIn): Any => JSON.parse(JSON.stringify(x));
  const b1 = c(V2); b1.snapshotJson.lines[1].amountSatang = 60_001; // Σ lines ≠ gross
  const b2 = c(V1); b2.netSatang += 1; // net ≠ gross − SSO − WHT
  const b3 = c(V1); b3.whtSatang = -1;
  const b4 = c(V1); b4.snapshotJson.lines = "x";
  const b5 = c(V1); b5.snapshotJson.lines[0].code = "SALARY_X"; // unknown code
  const b6 = c(V1); b6.ssoEmployeeSatang = 750.5;
  const b7 = c(V7); b7.snapshotJson.baseSalarySatang = "15000";
  const b8 = c(V7); b8.snapshotJson.adjustments = [{ kind: "OT", amountSatang: -1, note: null }];
  return [
    { id: "B1 Σlines≠gross", engineVersion: 2, item: b1 }, { id: "B2 net≠gross−sso−wht", engineVersion: 2, item: b2 }, { id: "B3 negative wht", engineVersion: 2, item: b3 },
    { id: "B4 lines not array", engineVersion: 2, item: b4 }, { id: "B5 unknown code", engineVersion: 2, item: b5 }, { id: "B6 fractional satang", engineVersion: 2, item: b6 },
    { id: "B7 v1 base string", engineVersion: 1, item: b7 }, { id: "B8 v1 negative adjustment", engineVersion: 1, item: b8 }, { id: "B9 engine 3", engineVersion: 3, item: c(V1) },
    { id: "B10 null item", engineVersion: 2, item: null },
  ];
}

// ═════════════ slip state table (S2.11) — same predicate as H3.6 `counts` (stepsJson.finalized only) ═════════════
export const STATE_TABLE: { in: { status: string; engineVersion: number; finalized: boolean }; want: string }[] = [
  { in: { status: "DRAFT", engineVersion: 1, finalized: false }, want: "DRAFT" },
  { in: { status: "APPROVED", engineVersion: 1, finalized: false }, want: "ISSUED" },
  { in: { status: "PAID", engineVersion: 1, finalized: false }, want: "ISSUED" },
  { in: { status: "REVERSED", engineVersion: 1, finalized: false }, want: "WITHDRAWN" },
  { in: { status: "DRAFT", engineVersion: 2, finalized: false }, want: "DRAFT" },
  { in: { status: "APPROVED", engineVersion: 2, finalized: false }, want: "NOT_FINAL" },
  { in: { status: "APPROVED", engineVersion: 2, finalized: true }, want: "ISSUED" },
  { in: { status: "PAID", engineVersion: 2, finalized: true }, want: "ISSUED" },
  { in: { status: "PAID", engineVersion: 2, finalized: false }, want: "NOT_FINAL" },
  { in: { status: "REVERSED", engineVersion: 2, finalized: true }, want: "WITHDRAWN" },
];

// ═════════════ property generator (S2.10) — seeded, valid stored v2 items ═════════════
export function prng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const POS = ["BASE", "DAY_WAGE", "HOUR_WAGE", "HOLIDAY_PAY", "HOLIDAY_WORK", "OT", "COMMISSION", "BONUS", "ALLOWANCE", "REFUND"];
const NEG_EARN = ["PRORATION", "UNPAID_LEAVE"];
const NEG_DED = ["LATE_RULE", "ABSENT_RULE", "ADVANCE", "DEDUCTION"];
export function randomItem(r: () => number): ItemIn {
  const n = (max: number) => Math.floor(r() * max);
  const lines: Line[] = [L("BASE", 1_000_000 + n(5_000_000), "profile")];
  for (let i = 0, k = n(6); i < k; i++) lines.push(L(POS[1 + n(POS.length - 1)]!, 1 + n(300_000), `p${i}`, r() < 0.5 ? n(5000) : null));
  for (let i = 0, k = n(3); i < k; i++) lines.push(L(NEG_EARN[n(2)]!, -(1 + n(200_000)), `e${i}`, n(31)));
  for (let i = 0, k = n(4); i < k; i++) lines.push(L(NEG_DED[n(4)]!, -(1 + n(100_000)), `d${i}`));
  const gross = lines.reduce((a, l) => a + l.amountSatang, 0);
  const ee = n(Math.min(100_000, Math.max(1, gross)));
  const wht = n(Math.max(1, Math.floor((gross - ee) / 4)));
  return v2Item(lines, { ssoBase: ee * 20, ee, wht, whtIncome: Math.max(0, gross) });
}
export const EARN_CODES = new Set([...POS, ...NEG_EARN, "UNPAID_CAP", "V1_OTHER"]);
export const DEDUCT_CODES = new Set([...NEG_DED, "SSO", "WHT", "V1_OTHER"]);

// ═════════════ texts: neutral wording only (shark-thai-law [U] items) ═════════════
export const TEXT_KEYS = ["no", "notIssued", "notFinal", "withdrawn", "slipData", "certReqOpen", "certNoSlip", "certNoBase", "profile", "own", "certVoidOwner", "voidReason", "voided", "certChanged", "purpose", "notDecidable", "inactive", "slipNote", "certNote"];
/** words that state law as fact on a slip/certificate (mockup 07c used "5% เพดาน ฿15,000" and "ไม่ถึงเกณฑ์") */
export const LAW_CLAIM = /ตามกฎหมาย|กฎหมายกำหนด|ไม่ถึงเกณฑ์|เพดาน|บังคับ|required by law|statutory|below the threshold|\bcap\b|5\s?%/i;

// ═════════════ DTO key sets (brief §3 R10) ═════════════
const srt = (a: string[]) => [...a].sort().join(",");
export const K = {
  slip: srt(["ok", "runId", "periodKey", "payDate", "taxYear", "status", "state", "engineVersion", "employee", "earnings", "deductions", "earningsSatang", "deductionsSatang", "netSatang", "ssoBaseSatang", "employerSsoSatang", "bankMasked", "flags"]),
  emp: srt(["name", "position", "code"]),
  line: srt(["code", "amountSatang", "count", "qty"]),
  mine: srt(["ok", "years"]),
  year: srt(["taxYear", "count", "grossSatang", "incomeSatang", "taxSatang", "ssoSatang", "netSatang", "slips"]),
  row: srt(["runId", "periodKey", "payDate", "netSatang", "href"]),
  hist: srt(["ok", "employeeId", "name", "year"]),
  certRow: srt(["id", "employeeId", "name", "status", "purpose", "docNo", "issuedAt", "requestedAt", "voided", "downloads"]),
  myCert: srt(["id", "status", "purpose", "docNo", "issuedAt", "requestedAt", "canCancel"]),
  refusal: srt(["ok", "code", "reason"]),
  audDl: srt(["runId", "employeeId", "periodKey", "by"]),
  audIssue: srt(["certId", "docNo", "employeeId"]),
};

// ═════════════ deterministic "is it really waiting" helper (S4.1) ═════════════
/**
 * Holder tx takes `SELECT … FOR UPDATE` on one HrPayrollRun row, then `fn()` starts. We poll pg_stat_activity until a backend other than
 * the holder waits on a Lock while running a statement on "HrPayrollRun" (condition, not a timer; bounded 15 s), then run `during(tx)`
 * inside the holder (e.g. flip the run to REVERSED) and commit. The reader must then see the committed state.
 */
export async function holdRunRow<R>(P: Any, runId: string, during: (tx: Any) => Promise<unknown>, fn: () => Promise<R>): Promise<{ res: R; waited: boolean; holderErr: string }> {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let held: () => void = () => {};
  const heldP = new Promise<void>((r) => (held = r));
  let holderErr = "";
  let holderPid = -1;
  const holder = P.$transaction(async (tx: Any) => {
    holderPid = Number(((await tx.$queryRawUnsafe(`SELECT pg_backend_pid() AS p`)) as Any[])[0]?.p ?? -1);
    await tx.$queryRawUnsafe(`SELECT "id" FROM "HrPayrollRun" WHERE "id" = $1 FOR UPDATE`, runId);
    held();
    await gate;
    await during(tx);
  }, { maxWait: 10_000, timeout: 60_000 }).catch((e: unknown) => ((holderErr = errText(e)), held()));
  await heldP;
  const p = fn();
  let seen = 0;
  for (let i = 0; i < 150 && !seen; i++) {
    await sleep(100);
    const w = (await P.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> $1 AND wait_event_type = 'Lock' AND query ILIKE '%HrPayrollRun%'`,
      holderPid,
    ).catch(() => null)) as Any[] | null;
    seen = Number(w?.[0]?.n ?? 0);
  }
  release();
  await holder;
  return { res: await p, waited: seen > 0, holderErr };
}

// ORACLE-EDIT (H3.8 fix round 2 · controller ruling M): row holder for the new race checks — the holder tx runs `lockSql` (FOR UPDATE), then `fn()` starts.
//   Blocking is read from pg_blocking_pids (a backend whose blockers include the holder pid), never from a sleep. until "blocked": wait for that
//   (bounded 15 s), then run `during(tx)` in the holder and commit · until "settled": stop as soon as fn() settled or a blocked backend is seen. ◂
export async function holdRows<R>(P: Any, lockSql: string, params: unknown[], fn: () => Promise<R>, o: { until: "blocked" | "settled"; during?: (tx: Any) => Promise<unknown> }): Promise<{ res: R; blocked: boolean; settledWhileHeld: boolean; holderErr: string }> {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let held: () => void = () => {};
  const heldP = new Promise<void>((r) => (held = r));
  let holderErr = "";
  let holderPid = -1;
  const holder = P.$transaction(async (tx: Any) => {
    holderPid = Number(((await tx.$queryRawUnsafe(`SELECT pg_backend_pid() AS p`)) as Any[])[0]?.p ?? -1);
    await tx.$queryRawUnsafe(lockSql, ...params);
    held();
    await gate;
    if (o.during) await o.during(tx);
  }, { maxWait: 10_000, timeout: 60_000 }).catch((e: unknown) => ((holderErr = errText(e)), held()));
  await heldP;
  let settled = false;
  const p = fn().finally(() => void (settled = true));
  let blocked = false;
  for (let i = 0; i < 150; i++) {
    const w = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))`, holderPid).catch(() => null)) as Any[] | null;
    if (Number(w?.[0]?.n ?? 0) > 0) blocked = true;
    if (o.until === "blocked" ? blocked : settled || blocked) break;
    await sleep(100);
  }
  const settledWhileHeld = settled;
  release();
  await holder;
  return { res: await p, blocked, settledWhileHeld, holderErr };
}
