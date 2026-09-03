// QC WO 2.3 — "ดูภาพรวม" รายรับ/รายจ่าย (src/lib/modules/account/overview.ts + overview-ui.tsx + dashboard.ts §6b)
//
// requires: acc-v2-seed
// ↑ marker (WO 0.7) — `qc-all.mts` เห็นบรรทัดนี้แล้ว seed ชุดข้อมูล QC + สร้างเฉลย dashboard/overview ให้ก่อนรัน
//
// รัน (บังคับ DB QC branch):  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-overview.mts
//   (ต้องมีเฉลยก่อน: QC_ENV_FILE=.env.qc pnpm tsx scripts/acc-v2-expected-dashboard.mts)
//
// เทียบ **สองการคำนวณที่เขียนแยกกัน**: dashboard.ts (Prisma groupBy/findMany + bucket ฝั่ง JS)
// กับเฉลยใน acc-v2-expected.json คีย์ "overview" (SQL ดิบคนละสำนวน — scripts/acc-v2-expected-dashboard.mts)
//
// ครอบคลุม (BLUEPRINT §3 WO 2.3 · DESIGN-SPEC-V2 §6):
//   P0  สายไฟ: overview.ts ไม่ import raw prisma · loadOverview ผูก tenantId+systemId ทุก query
//   P1  monthlyStatusSeries: ตรงเฉลย SQL ทั้ง 12 เดือน + รวม ทั้ง 2 ฝั่ง
//   P2  ชำระแล้ว+รอชำระ+พ้นกำหนด = ยอดที่ออกทั้งเดือน (ทุกเดือน ทั้ง 2 ฝั่ง)
//   P3  พ้นกำหนด = เอกสารเกินกำหนดชำระ+ยังไม่จ่าย กฎเดียวกับ isOverdue()/หน้ารายการ (regression ตรง ๆ)
//   P4  issuedByType: ตรงเฉลย SQL (เดือนนี้) ทั้ง 2 ฝั่ง + เรียงยอดมากไปน้อย + Σ shareBp ≈ 10000
//   P5  topTrackedContacts: ตรงเฉลย SQL top-5 ตามยอดค้าง ทั้ง 2 ฝั่ง (ไม่มี pinned — ตามที่ WO สั่ง)
//   P6  topIncomeCategories: คู่กับ topExpenseCategories เดิม (regression ผ่าน categoryBreakdown)
//   P7  loadOverview: งบ query ≤ 8 ทั้ง 2 ฝั่ง (นับจริงจาก prisma log)
//   P8  top lists ของหน้าภาพรวม = ฟังก์ชันเดียวกับหน้าหลัก/WO 2.1 เป๊ะ (topCustomers/topProducts/topVendors/topExpenseCategories)
//   P9  พารามิเตอร์ (query string → ค่าเริ่มต้น/parse) ผ่าน loadOverview
//   P10 ป้ายภาษาไทยล้วน (ไม่มี enum ดิบหลุด) ทั้งชื่อชนิดเอกสาร/หมวดบัญชี/ผู้ติดต่อ
//   P11 nav.ts: REVENUE_OVERVIEW/EXPENSE_OVERVIEW status="ready" href ถูกต้อง + guard.ts ทะเบียนครบ
//   P12 ความปลอดภัย: สโคปข้ามระบบ/ข้ามร้าน = 0 ทุกก้อน
//   P13 เงินเป็น integer สตางค์ทุกช่อง

import { readFileSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string; tenantName: string };
  resolveAccV2Scope: (p: unknown) => Promise<{ tenantId: string; systemId: string } | null>;
};
const { loadQcEnv, QC, resolveAccV2Scope } = accEnv;
const { host } = loadQcEnv();

// ── ตัวนับ SQL จริง (แบบเดียวกับ qc-acc-v2-dashboard.mts) ──
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
let sqlLog: string[] = [];
let counting = false;
const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: [{ emit: "event", level: "query" }],
});
(client as unknown as { $on: (e: string, cb: (ev: { query: string }) => void) => void }).$on("query", (ev) => {
  if (counting) sqlLog.push(ev.query);
});
(globalThis as unknown as { prisma?: PrismaClient }).prisma = client;

const { prisma } = await import("@/lib/core/db");
const dash = await import("@/lib/modules/account/dashboard");
const ov = await import("@/lib/modules/account/overview");
const nav = await import("@/lib/modules/account/nav");
const guard = await import("@/lib/modules/account/guard");

let passed = 0;
const findings: string[] = [];
function ok(name: string) {
  passed++;
  console.log("  ✅ " + name);
}
function bad(name: string, detail: string) {
  findings.push(name + " — " + detail);
  console.log("  ❌ " + name + " — " + detail);
}
function assert(name: string, cond: boolean, detail = "") {
  if (cond) ok(name);
  else bad(name, detail);
}
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  assert(name, a === b, `ได้ ${a} · ควรได้ ${b}`);
}

if (!(await import("node:fs")).existsSync(QC.expectedPath)) {
  console.error(`❌ ไม่พบเฉลย ${QC.expectedPath} — รัน seed ก่อน`);
  process.exit(2);
}
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8"));
if (!E.overview) {
  console.error(
    `❌ เฉลยยังไม่มีคีย์ "overview" — รัน QC_ENV_FILE=.env.qc pnpm tsx scripts/acc-v2-expected-dashboard.mts ก่อน`,
  );
  process.exit(1);
}
const X = E.overview;
const ctx = { tenantId: E.tenantId as string, systemId: E.systemId as string };
const base = `/app/sys/${ctx.systemId}/account`;

const qcScope = await resolveAccV2Scope(prisma);
if (!qcScope || qcScope.tenantId !== ctx.tenantId || qcScope.systemId !== ctx.systemId) {
  console.error(
    `❌ เฉลย ${QC.expectedPath} ไม่ตรงกับ DB ก้อนนี้ (${host})\n` +
      `   แก้: pnpm exec tsx scripts/seed-acc-v2-qc.mts แล้วตามด้วย scripts/acc-v2-expected-dashboard.mts`,
  );
  process.exit(1);
}

const YEAR = E.dashboard.year as number;
const MONTH = X.monthKey as string;
console.log("\n===== QC WO 2.3 · ดูภาพรวม รายรับ/รายจ่าย =====");
console.log(`[env] .env.qc · DB ${host} · ร้าน ${QC.tenantName} · ปี ${YEAR} · เดือน ${MONTH}\n`);

// ═══════════════ P0 สายไฟ ═══════════════
console.log("P0 สายไฟ (อ่านซอร์สจริง):");
{
  const src = readFileSync("src/lib/modules/account/overview.ts", "utf8");
  assert(
    "P0.1 overview.ts ไม่ import raw prisma โดยตรง",
    !/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(src),
  );
  assert("P0.2 overview.ts ไม่มี `any` ใหม่", !/: any\b/.test(src));
  const dsrc = readFileSync("src/lib/modules/account/dashboard.ts", "utf8");
  assert("P0.3 monthlyStatusSeries ผูก dbOf(ctx, meter) (inject tenant/system อัตโนมัติ)", /monthlyStatusSeries[\s\S]{0,200}dbOf\(ctx, meter\)/.test(dsrc));
  assert("P0.4 issuedByType ผูก dbOf(ctx, meter)", /export async function issuedByType[\s\S]{0,200}dbOf\(ctx, meter\)/.test(dsrc));
}

// ═══════════════ P1/P2/P3 monthlyStatusSeries ═══════════════
console.log("\nP1-P3 กราฟแท่งซ้อน (monthlyStatusSeries) ทั้ง 2 ฝั่ง:");
for (const side of ["revenue", "expense"] as const) {
  const got = await dash.monthlyStatusSeries(ctx, side, YEAR);
  const want = X[side].series;
  eq(`P1.1.${side} 12 เดือนตรงเฉลย SQL (paid/awaiting/overdue)`, got.months, want.months);
  eq(`P1.2.${side} รวมทั้งปีตรงเฉลย`, got.total, want.total);
  assert(
    `P2.1.${side} ชำระแล้ว+รอชำระ+พ้นกำหนด = ยอดที่ออกทั้งเดือน (ทุกเดือน — เทียบเฉลย SQL)`,
    got.months.every((m: { paid: number; awaiting: number; overdue: number }, i: number) => {
      const w = want.months[i] as { paid: number; awaiting: number; overdue: number };
      return m.paid + m.awaiting + m.overdue === w.paid + w.awaiting + w.overdue;
    }),
  );
  eq(`P2.2.${side} รวม = ชำระแล้ว+รอชำระ+พ้นกำหนด`, got.total.grand, got.total.paid + got.total.awaiting + got.total.overdue);
  eq(`P2.3.${side} จำนวนใบรวม = ชำระแล้ว+รอชำระ+พ้นกำหนด (จำนวน)`, got.total.grandCount, got.total.paidCount + got.total.awaitingCount + got.total.overdueCount);

  // P3: overdue กฎเดียวกับ isOverdue()/หน้ารายการ — regression ตรง ๆ ผ่าน service.isOverdue
  const svc = await import("@/lib/modules/account/service");
  const scopeWhere =
    side === "revenue"
      ? { direction: "OUT" as const, OR: [{ docType: "INVOICE" as const }, { docType: "RECEIPT" as const, sourceDocId: null }] }
      : { direction: "IN" as const, docType: { in: ["PURCHASE", "EXPENSE"] as ("PURCHASE" | "EXPENSE")[] } };
  const docs = await prisma.accountDocument.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, status: { notIn: ["DRAFT", "CANCELLED", "VOIDED"] }, ...scopeWhere },
    select: { status: true, dueDate: true, validUntil: true, grandTotal: true },
  });
  const expectOverdue = docs.reduce((s, d) => (d.status !== "PAID" && svc.isOverdue({ status: d.status, dueDate: d.dueDate, validUntil: d.validUntil }) ? s + d.grandTotal : s), 0);
  eq(`P3.1.${side} พ้นกำหนดรวม = Σ isOverdue() ตัวเดียวกับหน้ารายการ`, got.total.overdue, expectOverdue);
}

// ═══════════════ P4 issuedByType ═══════════════
console.log("\nP4 การ์ด 'เอกสารที่ออก' ตามชนิด (issuedByType):");
for (const side of ["revenue", "expense"] as const) {
  const range = { from: dash.monthStart(MONTH), to: dash.monthEndExclusive(MONTH) };
  const got = await dash.issuedByType(ctx, side, range);
  const want = X[side].issuedThisMonth;
  eq(`P4.1.${side} รวมเดือนนี้ (จำนวน/ยอด) ตรงเฉลย SQL`, [got.total.count, got.total.amount], [want.count, want.amount]);
  const types = side === "revenue" ? dash.REVENUE_ISSUED_TYPES : dash.EXPENSE_ISSUED_TYPES;
  eq(`P4.2.${side} มี 4 แถวตามชนิดที่กำหนด`, got.rows.length, types.length);
  assert(`P4.3.${side} เรียงยอดมากไปน้อย`, got.rows.every((r, i, a) => i === 0 || a[i - 1].amount >= r.amount));
  const sumShare = got.rows.reduce((s, r) => s + r.shareBp, 0);
  assert(`P4.4.${side} Σ shareBp ≈ 10000 เมื่อมียอด (${sumShare})`, got.total.amount === 0 || Math.abs(sumShare - 10000) <= types.length);
  assert(`P4.5.${side} ป้ายทุกแถวเป็นภาษาไทย`, got.rows.every((r) => /[ก-๙]/.test(r.label)));
}

// ═══════════════ P5 topTrackedContacts ═══════════════
console.log("\nP5 ลูกหนี้/เจ้าหนี้ที่ติดตาม (top-5 ตามยอดค้าง):");
for (const side of ["revenue", "expense"] as const) {
  const got = await dash.topTrackedContacts(ctx, side, 5);
  const want = X[side].tracked as Array<{ contactId: string; name: string | null; outstanding: number; count: number }>;
  eq(`P5.1.${side} จำนวนแถว`, got.length, want.length);
  eq(
    `P5.2.${side} ยอดค้าง 5 อันดับ ตรงเฉลย SQL`,
    got.map((r) => r.outstanding),
    want.map((r) => r.outstanding),
  );
  assert(`P5.3.${side} เรียงยอดค้างมากไปน้อย`, got.every((r, i, a) => i === 0 || a[i - 1].outstanding >= r.outstanding));
  assert(`P5.4.${side} มีชื่อทุกแถว (ไม่มี id ดิบโผล่)`, got.every((r) => r.name.length > 0));
}

// ═══════════════ P6 topIncomeCategories คู่กับ topExpenseCategories เดิม ═══════════════
console.log("\nP6 topIncomeCategories (คู่กับ topExpenseCategories WO 2.1):");
{
  const range = { fromKey: MONTH, toKey: MONTH };
  const gotIncome = await dash.topIncomeCategories(ctx, range, 5);
  const direct = await dash.categoryBreakdown(ctx, MONTH, "income", 5);
  eq("P6.1 topIncomeCategories(เดือนเดียว) = categoryBreakdown(income) ตรง ๆ", gotIncome.total, direct.total);
  eq(
    "P6.2 รายการตรงกัน (รหัส+ยอด)",
    gotIncome.rows.map((r) => [r.accountCode, r.amount]),
    direct.rows.filter((r) => r.name !== dash.OTHER_LABEL).map((r) => [r.accountCode, r.amount]),
  );
  const gotExpense = await dash.topExpenseCategories(ctx, range, 5);
  assert("P6.3 topExpenseCategories (ของเดิม WO 2.1) ยังทำงานปกติ", gotExpense.total >= 0);
}

// ═══════════════ P7 loadOverview — งบ query ≤ 8 ═══════════════
console.log("\nP7 loadOverview — งบ query ≤ 8 ทั้ง 2 ฝั่ง:");
for (const side of ["revenue", "expense"] as const) {
  const data = await ov.loadOverview(ctx, side, {}, { base });
  assert(`P7.1.${side} queryCount > 0 และ ≤ 8`, data.queryCount > 0 && data.queryCount <= 8, `ได้ ${data.queryCount}`);
  // นับ SQL จริงจาก prisma log อีกรอบ (อิสระจากตัวนับในโค้ด)
  sqlLog = [];
  counting = true;
  await ov.loadOverview(ctx, side, {}, { base });
  counting = false;
  const sqlCount = sqlLog.filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(q)).length;
  assert(`P7.2.${side} SQL จริงจาก prisma log ≤ 8 (ได้ ${sqlCount})`, sqlCount <= 8);
  assert("P7.3 JSON-serialisable", typeof JSON.stringify(data) === "string");
}

// ═══════════════ P8 top lists ของหน้าภาพรวม = ฟังก์ชันเดียวกับหน้าหลัก/WO 2.1 ═══════════════
console.log("\nP8 top lists ของหน้าภาพรวม = ฟังก์ชันเดียวกับ WO 2.1 (topCustomers/topProducts/topVendors/topExpenseCategories):");
{
  const yearRange = { from: dash.monthStart(`${YEAR}-01`), to: dash.monthEndExclusive(`${YEAR}-12`) };
  const revenueData = await ov.loadOverview(ctx, "revenue", { year: String(YEAR) }, { base });
  const directCustomers = await dash.topCustomers(ctx, yearRange, 5);
  const directProducts = await dash.topProducts(ctx, yearRange, 5);
  eq("P8.1 หน้าภาพรวมรายรับ: topCustomers = dash.topCustomers ตรง ๆ", revenueData.topCustomers, directCustomers);
  eq("P8.2 หน้าภาพรวมรายรับ: topProducts = dash.topProducts ตรง ๆ", revenueData.topProducts, directProducts);

  const expenseData = await ov.loadOverview(ctx, "expense", { year: String(YEAR) }, { base });
  const directVendors = await dash.topVendors(ctx, yearRange, 5);
  const directExpenseCat = await dash.topExpenseCategories(ctx, { fromKey: `${YEAR}-01`, toKey: `${YEAR}-12` }, 5);
  eq("P8.3 หน้าภาพรวมรายจ่าย: topVendors = dash.topVendors ตรง ๆ", expenseData.topVendors, directVendors);
  eq("P8.4 หน้าภาพรวมรายจ่าย: topExpenseCategories(ทั้งปี) = dash.topExpenseCategories ตรง ๆ", expenseData.topExpenseCategories, directExpenseCat);
}

// ═══════════════ P9 พารามิเตอร์ ═══════════════
console.log("\nP9 พารามิเตอร์ (query string → ค่าเริ่มต้น/parse):");
{
  const d0 = await ov.loadOverview(ctx, "expense", {}, { base, now: new Date(E.dashboard.now as string) });
  eq("P9.1 ค่าเริ่มต้น: chartPeriod = month", d0.params.chartPeriod, "month");
  eq("P9.2 ค่าเริ่มต้น: issuedRange = this-month", d0.params.issuedRange, "this-month");
  eq("P9.3 ค่าเริ่มต้น: year = ปีของ now", d0.params.year, YEAR);

  const d1 = await ov.loadOverview(ctx, "expense", { year: "2024", chartPeriod: "quarter", dr: "this-year" }, { base });
  eq("P9.4 year=2024 → params.year = 2024", d1.params.year, 2024);
  eq("P9.5 chartPeriod=quarter → ผ่าน validation", d1.params.chartPeriod, "quarter");
  eq("P9.6 dr=this-year → ผ่าน validation", d1.params.issuedRange, "this-year");

  const dBad = await ov.loadOverview(ctx, "expense", { year: "banana", dr: "not-a-range" }, { base, now: new Date(E.dashboard.now as string) });
  eq("P9.7 year พังรูปแบบ → fallback เป็นปีปัจจุบัน", dBad.params.year, YEAR);
  eq("P9.8 dr ไม่รู้จัก → fallback เป็น this-month", dBad.params.issuedRange, "this-month");
}

// ═══════════════ P10 ป้ายภาษาไทยล้วน ═══════════════
console.log("\nP10 ป้ายภาษาไทย (ไม่มี enum ดิบหลุด):");
{
  const revenueData = await ov.loadOverview(ctx, "revenue", {}, { base });
  const expenseData = await ov.loadOverview(ctx, "expense", {}, { base });
  assert("P10.1 issued.rows label ฝั่งรายรับเป็นไทยล้วน", revenueData.issued.rows.every((r) => !/^[A-Z_]+$/.test(r.label)));
  assert("P10.2 issued.rows label ฝั่งรายจ่ายเป็นไทยล้วน", expenseData.issued.rows.every((r) => !/^[A-Z_]+$/.test(r.label)));
  assert(
    "P10.3 topExpenseCategories ชื่อหมวดเป็นไทย",
    expenseData.topExpenseCategories.rows.every((r) => r.name.length > 0 && !/^[A-Z_]+$/.test(r.name)),
  );
  assert(
    "P10.4 topIncomeCategories ชื่อหมวดเป็นไทย",
    revenueData.topIncomeCategories.rows.every((r) => r.name.length > 0 && !/^[A-Z_]+$/.test(r.name)),
  );
}

// ═══════════════ P11 nav.ts + guard.ts ═══════════════
console.log("\nP11 nav.ts (ready) + guard.ts (ทะเบียนสิทธิ์):");
{
  const groups = nav.ACCOUNT_NAV(base, true);
  const revenueOv = groups.find((g) => g.key === "revenue")!.items.find((it) => it.testId === "REVENUE_OVERVIEW");
  const expenseOv = groups.find((g) => g.key === "expense")!.items.find((it) => it.testId === "EXPENSE_OVERVIEW");
  assert("P11.1 REVENUE_OVERVIEW status=ready", revenueOv?.status === "ready");
  eq("P11.2 REVENUE_OVERVIEW href", revenueOv?.href, `${base}/overview/revenue`);
  assert("P11.3 EXPENSE_OVERVIEW status=ready", expenseOv?.status === "ready");
  eq("P11.4 EXPENSE_OVERVIEW href", expenseOv?.href, `${base}/overview/expense`);
  eq("P11.5 guard.ts: overview/revenue/page.tsx → account.doc.view", guard.ACCOUNT_PAGE_PERMISSIONS["overview/revenue/page.tsx"], "account.doc.view");
  eq("P11.6 guard.ts: overview/expense/page.tsx → account.doc.view", guard.ACCOUNT_PAGE_PERMISSIONS["overview/expense/page.tsx"], "account.doc.view");
}

// ═══════════════ P12 สโคป: ระบบอื่น / ร้านอื่น ═══════════════
console.log("\nP12 สโคป tenant + system (IDOR):");
{
  const otherSystem = { tenantId: E.tenantId as string, systemId: E.systems.POS as string };
  const otherTenant = { tenantId: "cl00000000000000000000000", systemId: E.systemId as string };
  for (const [label, c] of [
    ["ระบบอื่นของร้านเดียวกัน (POS)", otherSystem],
    ["ร้านอื่น (tenantId มั่ว)", otherTenant],
  ] as const) {
    const series = await dash.monthlyStatusSeries(c, "expense", YEAR);
    eq(`P12.1 ${label}: monthlyStatusSeries รวม = 0`, series.total.grand, 0);
    const issued = await dash.issuedByType(c, "expense", { from: dash.monthStart(MONTH), to: dash.monthEndExclusive(MONTH) });
    eq(`P12.2 ${label}: issuedByType รวม = 0`, issued.total.amount, 0);
    const tracked = await dash.topTrackedContacts(c, "expense", 5);
    eq(`P12.3 ${label}: topTrackedContacts ว่าง`, tracked.length, 0);
  }
}

// ═══════════════ P13 เงินเป็น integer สตางค์ ═══════════════
console.log("\nP13 เงินเป็นจำนวนเต็มสตางค์:");
{
  const revenueData = await ov.loadOverview(ctx, "revenue", {}, { base });
  const nums: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "number") nums.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(revenueData);
  assert(`P13.1 ทุกตัวเลขเป็น integer (${nums.length} ค่า)`, nums.every((x) => Number.isInteger(x)));
  assert("P13.2 ไม่มีค่าเงินเป็น NaN/Infinity", nums.every((x) => Number.isFinite(x)));
}

console.log(`\n===== สรุป WO 2.3: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length > 0) console.log(findings.map((f) => "  • " + f).join("\n"));
console.log(findings.length === 0 ? "🎉 WO 2.3 ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
