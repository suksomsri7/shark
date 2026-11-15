// vat-threshold.ts — ยอดขายเทียบเกณฑ์จดทะเบียน VAT 1.8 ล้าน (ACC T5.3 · เลน 2 · ปิด A9)
//
//   เกณฑ์/จำนวนวัน/ระดับ "ใกล้" จากตาราง "สมุดบัญชี" (VAT_REG_THRESHOLD [V] · VAT_REG_WITHIN_DAYS [V] · VAT_REG_NEAR_RATIO [S]) ร้านทับได้
//   ปี = รอบบัญชี (นิติบุคคล) / ปีปฏิทิน (บุคคลธรรมดา · ห้างสามัญ · ยังไม่ระบุ) — skill common-vat-invoice §1
//   ยอดที่นับ = ค่าเริ่มต้นของระบบ [S]: บัญชีรายได้ใน GL (เครดิต − เดบิต) ไม่รวมบัญชีที่ map เป็นดอกเบี้ยรับ/กำไรจากการจำหน่ายสินทรัพย์
//   🔴 คำเตือนเท่านั้น ไม่บล็อกการขาย · เฉพาะสมุดที่ยังไม่จด VAT
// design note: ledger/wo-notes/T5.3.md
import { tenantDb } from "@/lib/core/db";
import { isJuristicPayer, legalWarning, type LegalWarning } from "@/lib/core/settings/legal/th-tax-2569";
import { accountNow } from "./clock";
import { bkkYmd, bookRuleFrom, loadBookLegal, type BookCtx, type BookLegal } from "./legal-values";
import { fiscalYearOf, getPolicy } from "./policy";
import { ymdAddDays, ymdTh } from "./tax-calendar";

export type VatThresholdStatus = "REGISTERED" | "BELOW" | "NEAR" | "EXCEEDED";

export type VatThresholdView = {
  asOf: string;
  vatRegistered: boolean;
  status: VatThresholdStatus;
  yearBasis: "FISCAL" | "CALENDAR";
  yearLabel: string;
  from: string;
  to: string;
  /** สตางค์ */
  sales: number;
  threshold: number | null;
  nearRatioBp: number | null;
  withinDays: number | null;
  /** ยอด/เกณฑ์ เป็น basis point */
  ratioBp: number | null;
  crossedOn: string | null;
  registerBy: string | null;
  byMonth: { month: string; sales: number; cumulative: number }[];
  warnings: LegalWarning[];
};

const baht = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const EXCLUDED_KEYS = ["INTEREST_INCOME", "ASSET_DISPOSAL_GAIN"];

/** pure: ยอดรายวัน (YYYY-MM-DD → สตางค์) + กฎ → สถานะ · วันที่เกิน · กำหนดจด */
export function vatThresholdFrom(
  daily: readonly { ymd: string; amount: number }[],
  o: { asOf: string; vatRegistered: boolean; threshold: number | null; nearRatioBp: number | null; withinDays: number | null },
): Pick<VatThresholdView, "status" | "sales" | "ratioBp" | "crossedOn" | "registerBy" | "byMonth"> {
  const sorted = [...daily].filter((d) => d.ymd <= o.asOf).sort((a, b) => a.ymd.localeCompare(b.ymd));
  let cum = 0;
  let crossedOn: string | null = null;
  const months = new Map<string, number>();
  for (const d of sorted) {
    cum += d.amount;
    months.set(d.ymd.slice(0, 7), (months.get(d.ymd.slice(0, 7)) ?? 0) + d.amount);
    if (crossedOn === null && o.threshold !== null && cum > o.threshold) crossedOn = d.ymd;
  }
  // ยอดติดลบภายหลัง (ใบลดหนี้) ทำให้กลับต่ำกว่าเกณฑ์ได้ ⇒ วันที่เกินนับเฉพาะเมื่อ ณ วันนี้ยังเกินอยู่
  if (o.threshold !== null && cum <= o.threshold) crossedOn = null;
  let run = 0;
  const byMonth = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, sales]) => ({ month, sales, cumulative: (run += sales) }));
  const ratioBp = o.threshold ? Math.floor((cum * 10_000) / o.threshold) : null;
  const status: VatThresholdStatus = o.vatRegistered
    ? "REGISTERED"
    : crossedOn
      ? "EXCEEDED"
      : ratioBp !== null && o.nearRatioBp !== null && ratioBp >= o.nearRatioBp
        ? "NEAR"
        : "BELOW";
  return { status, sales: cum, ratioBp, crossedOn, registerBy: crossedOn && o.withinDays !== null ? ymdAddDays(crossedOn, o.withinDays) : null, byMonth };
}

export async function vatThreshold(ctx: BookCtx, asOfDate: Date = accountNow(), legalIn?: BookLegal): Promise<VatThresholdView> {
  const db = tenantDb(ctx);
  const [legal, policy] = await Promise.all([legalIn ? Promise.resolve(legalIn) : loadBookLegal(ctx), getPolicy(ctx)]);
  const asOf = bkkYmd(asOfDate);
  const juristic = isJuristicPayer(legal.entityKind) === true;
  const fy = juristic ? fiscalYearOf(asOf, policy.fiscalYearStartMonth) : null;
  const from = fy ? fy.startYmd : `${asOf.slice(0, 4)}-01-01`;
  const to = fy ? fy.endYmd : `${asOf.slice(0, 4)}-12-31`;
  const rule = (r: "VAT_REG_THRESHOLD" | "VAT_REG_WITHIN_DAYS" | "VAT_REG_NEAR_RATIO") => bookRuleFrom(legal, r, asOfDate);
  const th = rule("VAT_REG_THRESHOLD");
  const wd = rule("VAT_REG_WITHIN_DAYS");
  const nr = rule("VAT_REG_NEAR_RATIO");
  // คำเตือนของตาราง: เฉพาะร้านทับ/ไม่มีแถว (ป้าย [S] ของ "ใกล้แค่ไหน" ครอบด้วย VAT_REG_MEASURE_DEFAULT แล้ว)
  const tableWarnings = [...th.warnings, ...wd.warnings, ...nr.warnings].filter((w) => w.code !== "UNVERIFIED_DEFAULT");

  const base = {
    asOf,
    vatRegistered: policy.vatRegistered,
    yearBasis: (juristic ? "FISCAL" : "CALENDAR") as "FISCAL" | "CALENDAR",
    yearLabel: fy ? fy.label : `ปีปฏิทิน ${asOf.slice(0, 4)}`,
    from,
    to,
    threshold: th.value,
    nearRatioBp: nr.value,
    withinDays: wd.value,
  };
  if (policy.vatRegistered) {
    return { ...base, status: "REGISTERED", sales: 0, ratioBp: null, crossedOn: null, registerBy: null, byMonth: [], warnings: [] };
  }

  const [incomes, excluded] = await Promise.all([
    db.accountLedger.findMany({ where: { systemId: ctx.systemId, type: "INCOME" }, select: { id: true } }),
    db.accountMapping.findMany({ where: { systemId: ctx.systemId, key: { in: EXCLUDED_KEYS } }, select: { accountId: true } }),
  ]);
  const skip = new Set(excluded.map((m) => m.accountId));
  const ids = incomes.map((l) => l.id).filter((id) => !skip.has(id));
  const lines = ids.length
    ? await db.accountJournalLine.findMany({
        where: { systemId: ctx.systemId, accountId: { in: ids }, entry: { date: { gte: new Date(`${from}T00:00:00+07:00`), lt: new Date(`${ymdAddDays(to, 1)}T00:00:00+07:00`) } } },
        select: { debit: true, credit: true, entry: { select: { date: true } } },
      })
    : [];
  const daily = new Map<string, number>();
  for (const l of lines) {
    const k = bkkYmd(l.entry.date);
    daily.set(k, (daily.get(k) ?? 0) + l.credit - l.debit);
  }
  const r = vatThresholdFrom([...daily.entries()].map(([ymd, amount]) => ({ ymd, amount })), { asOf, vatRegistered: false, threshold: th.value, nearRatioBp: nr.value, withinDays: wd.value });

  const warnings: LegalWarning[] = [...tableWarnings];
  if (legal.entityKind === "UNSET" || legal.entityKind === "OTHER") warnings.push(legalWarning("ENTITY_KIND_UNSET", { context: "calendar" }));
  const period = fy ? `รอบบัญชีนี้ (${ymdTh(from)} – ${ymdTh(to)})` : `ปี ${asOf.slice(0, 4)}`;
  const pct = r.ratioBp === null ? "-" : `${(r.ratioBp / 100).toFixed(2)}%`;
  if (r.status === "NEAR")
    warnings.push(legalWarning("VAT_REG_THRESHOLD_NEAR", { period, amount: baht(r.sales), pct, threshold: baht(th.value ?? 0), days: wd.value ?? "-" }));
  if (r.status === "EXCEEDED")
    warnings.push(legalWarning("VAT_REG_THRESHOLD_EXCEEDED", { period, amount: baht(r.sales), threshold: baht(th.value ?? 0), crossed: ymdTh(r.crossedOn!), days: wd.value ?? "-", deadline: r.registerBy ? ymdTh(r.registerBy) : "-" }));
  if (r.status !== "BELOW")
    warnings.push(legalWarning("VAT_REG_MEASURE_DEFAULT", { what: "รายได้ทุกบัญชีในหมวดรายได้ (ไม่รวมดอกเบี้ยรับและกำไรจากการจำหน่ายสินทรัพย์) ตามวันที่ลงบัญชี รวมรายได้ที่ยกเว้น VAT", year: fy ? "บัญชี" : "ปีปฏิทิน" }));
  return { ...base, ...r, warnings };
}
