// QC WO 2.1 — "query หน้าหลัก + ภาพรวม" (src/lib/modules/account/dashboard.ts)
//
// รัน (บังคับ DB QC branch):  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-dashboard.mts
//   (ต้องมีเฉลยก่อน: QC_ENV_FILE=.env.qc pnpm tsx scripts/acc-v2-expected-dashboard.mts)
//
// ชุดนี้เทียบ **สองการคำนวณที่เขียนแยกกัน**: dashboard.ts (Prisma + aggregate ต่อบัญชี รวมฝั่ง JS)
// กับเฉลยใน acc-v2-expected.json (SQL ดิบ SUM(CASE WHEN …) — scripts/acc-v2-expected-dashboard.mts)
// ตรงกันถึงระดับ "สตางค์" เท่านั้นจึงผ่าน · ไม่มีการอ่านค่าจาก log ของ agent
//
// ครอบคลุม:
//   P0 สายไฟ/ความปลอดภัย (อ่านซอร์สจริง: ไม่มี raw prisma · raw SQL ผูก tenantId+systemId ครบ)
//   P1 series 12 เดือน + YoY   P2 donut หมวด   P3 เงินคุณอยู่ไหน   P4 ค้างรับ/ค้างจ่าย + อายุหนี้
//   P5 เอกสารที่ออก            P6 อันดับลูกค้า/ผู้ขาย/สินค้า/หมวด   P7 งานที่รอคุณ (เทียบของ WO 1.9)
//   P8 เอกสารล่าสุด            P9 ปฏิทินเงินเข้า-ออก              P10 budget ≤ 12 query + เวลา < 1.5 วิ
//   P11 สโคปข้ามระบบ/ข้ามร้าน   P12 เงินเป็น integer สตางค์ทุกช่อง
//
// 🔴 นับ query จริงจาก prisma log: ยัด PrismaClient ที่เปิด event `query` ลง globalThis **ก่อน**
//    import @/lib/core/db (singleton ของแพลตฟอร์มอ่าน globalThis.prisma) — ไม่ได้เชื่อตัวนับของโค้ดเอง

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string; tenantName: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

// ── ตัวนับ SQL จริง ──
let sqlLog: string[] = [];
let counting = false;
const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: [{ emit: "event", level: "query" }],
});
(client as unknown as { $on: (e: string, cb: (ev: { query: string }) => void) => void }).$on(
  "query",
  (ev) => {
    if (counting) sqlLog.push(ev.query);
  },
);
(globalThis as unknown as { prisma?: PrismaClient }).prisma = client;

const { prisma } = await import("@/lib/core/db");
const dash = await import("@/lib/modules/account/dashboard");
const svc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const reports = await import("@/lib/modules/account/reports");

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
const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const E = JSON.parse(readFileSync(QC.expectedPath, "utf8"));
if (!E.dashboard) {
  console.error(
    `❌ เฉลยยังไม่มีคีย์ "dashboard" — รัน QC_ENV_FILE=.env.qc pnpm tsx scripts/acc-v2-expected-dashboard.mts ก่อน`,
  );
  process.exit(1);
}
const X = E.dashboard;
const ctx = { tenantId: E.tenantId as string, systemId: E.systemId as string };
const NOW = new Date(X.now as string);
const YEAR = X.year as number;
const MONTH = X.periodKey as string;
const yearRange = { from: dash.monthStart(`${YEAR}-01`), to: dash.monthEndExclusive(`${YEAR}-12`) };

console.log("\n===== QC WO 2.1 · query หน้าหลัก + ภาพรวม =====");
console.log(`[env] .env.qc · DB ${host} · ร้าน ${QC.tenantName} · ณ ${X.now}\n`);

// ═══════════════ P0 สายไฟ / ความปลอดภัยของ query ═══════════════
console.log("P0 สายไฟ + ความปลอดภัยของ query (อ่านซอร์สจริง):");
{
  const src = readFileSync("src/lib/modules/account/dashboard.ts", "utf8");
  assert(
    "P0.1 dashboard.ts ไม่ import raw prisma (fitness F5 เต็มโควตา 45 ไฟล์)",
    !/import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s+["']@\/lib\/core\/db["']/.test(src),
  );
  assert("P0.2 ใช้ tenantDb (inject tenantId+systemId ทุก query)", /tenantDb\(\{\s*tenantId/.test(src));
  const raws = src.split("$queryRaw<").slice(1);
  assert("P0.3 มี raw query ตามที่ออกแบบ (GL รายงวด 1 + ปฏิทิน 3)", raws.length === 4, `พบ ${raws.length}`);
  let scoped = 0;
  let tzSafe = 0;
  for (const r of raws) {
    const body = r.slice(0, 1800);
    if (body.includes('"tenantId" = ${ctx.tenantId}') && body.includes('"systemId" = ${ctx.systemId}')) scoped++;
    if (!/AT TIME ZONE/.test(body) || /AT TIME ZONE 'UTC'\) AT TIME ZONE 'Asia\/Bangkok'/.test(body)) tzSafe++;
  }
  eq("P0.4 raw query ทุกก้อนผูก tenantId + systemId เอง", scoped, raws.length);
  eq("P0.4b แปลงวันไทยถูกทาง (คอลัมน์เก็บ UTC ไม่มีโซน → ต้อง AT TIME ZONE 'UTC' ก่อน)", tzSafe, raws.length);
  assert("P0.5 ไม่มีการต่อสตริงเข้า SQL (parameterized ล้วน)", !/\$queryRawUnsafe/.test(src));
  assert("P0.6 ไม่มี `any` ใหม่ในไฟล์", !/: any\b/.test(src));
  assert("P0.7 ป้ายหมวดมาจากชื่อบัญชี ไม่ตั้งเองในโค้ด", /l\."name"/.test(src));
}

// ═══════════════ P1 series 12 เดือน + YoY ═══════════════
console.log("\nP1 กราฟ 12 เดือน (รายได้/ค่าใช้จ่าย/กำไร) + YoY:");
const series = await dash.monthlySeries(ctx, YEAR);
eq("P1.1 มี 12 เดือนเสมอ", series.months.length, 12);
for (const [i, m] of series.months.entries()) {
  const want = X.series.months[i];
  eq(`P1.2.${i + 1} ${m.periodKey} รายได้/ค่าใช้จ่าย/กำไร`, [m.revenue, m.expense, m.profit], [
    want.revenue,
    want.expense,
    want.profit,
  ]);
}
eq("P1.3 รวมทั้งปี", series.total, X.series.total);
eq("P1.4 ยอดปีก่อน (ฐาน YoY)", series.prevYear, X.series.prevYear);
eq("P1.5 %YoY เป็น basis point", series.yoyBp, X.series.yoyBp);
assert(
  "P1.6 กำไร = รายได้ − ค่าใช้จ่าย ทุกเดือน",
  series.months.every((m) => m.profit === m.revenue - m.expense),
);
eq(
  "P1.7 ผลรวม 12 เดือน = ยอดทั้งปี",
  series.months.reduce((s, m) => s + m.revenue, 0),
  series.total.revenue,
);
eq("P1.8 YoY เทียบไม่ได้เมื่อปีก่อนเป็น 0 → null", series.yoyBp.revenue, X.series.yoyBp.revenue);
{
  const bp = dash.changeBp(150, 100);
  eq("P1.9 สูตร %เทียบงวดก่อน: 100 → 150 = +5000 bp (+50%)", bp, 5000);
  eq("P1.10 ฐาน 0 = null (ไม่หารศูนย์)", dash.changeBp(150, 0), null);
  eq("P1.11 ฐานติดลบใช้ค่าสัมบูรณ์", dash.changeBp(0, -100), 10000);
}

// ═══════════════ P2 donut หมวดรายได้/ค่าใช้จ่าย ═══════════════
console.log("\nP2 หมวดรายได้/ค่าใช้จ่ายของเดือนนี้ (donut §4 บล็อก 5):");
for (const kind of ["income", "expense"] as const) {
  const got = await dash.categoryBreakdown(ctx, MONTH, kind, 5);
  const want = X.categories[kind];
  eq(`P2.1.${kind} ยอดรวมหมวด`, got.total, want.total);
  eq(
    `P2.2.${kind} Σ ทุกแถว (รวม "อื่น ๆ") = ยอดรวม`,
    got.rows.reduce((s, r) => s + r.amount, 0),
    got.total,
  );
  const top = want.rows[0];
  if (top) {
    eq(`P2.3.${kind} หมวดอันดับ 1 = ${top.name}`, [got.rows[0].accountCode, got.rows[0].amount], [
      top.accountCode,
      top.amount,
    ]);
  }
  assert(
    `P2.4.${kind} เรียงจากมากไปน้อย`,
    got.rows
      .filter((r) => r.name !== dash.OTHER_LABEL)
      .every((r, i, a) => i === 0 || a[i - 1].amount >= r.amount),
  );
  const extra = want.rows.length > 5;
  assert(
    `P2.5.${kind} มีแถว "อื่น ๆ" ก็ต่อเมื่อหมวดเกิน 5 (${want.rows.length} หมวด)`,
    got.rows.some((r) => r.name === dash.OTHER_LABEL) === extra,
  );
  assert(
    `P2.6.${kind} ชื่อหมวดเป็นภาษาไทยจากผังบัญชี`,
    got.rows.every((r) => r.name.length > 0 && !/^[A-Z_]+$/.test(r.name)),
  );
}

// ═══════════════ P3 เงินคุณอยู่ไหน ═══════════════
console.log("\nP3 เงินคุณอยู่ไหน (ยอดคงเหลือ + เคลื่อนไหวเดือนนี้):");
const cash = await dash.cashPosition(ctx, { now: NOW });
eq("P3.1 ยอดรวมทุกช่องทาง = 1,284,560.00", cash.total, X.cash.total);
eq("P3.2 ยอดรวมตรงกับเฉลย seed (finance.total)", cash.total, E.finance.total);
eq("P3.3 จำนวนช่องทาง", cash.accounts.length, X.cash.accounts.length);
for (const want of X.cash.accounts) {
  const got = cash.accounts.find((a) => a.id === want.id);
  if (!got) {
    bad(`P3.4 ${want.name}`, "ไม่พบช่องทางนี้ในผลลัพธ์");
    continue;
  }
  eq(`P3.4 ${want.name} (${want.code}) ยอดคงเหลือ/เคลื่อนไหวเดือนนี้/ปักหมุด`, [
    got.balance,
    got.monthDelta,
    got.pinned,
  ], [want.balance, want.monthDelta, want.pinned]);
}
eq(
  "P3.5 Σ ยอดแต่ละช่องทาง = ยอดรวม",
  cash.accounts.reduce((s, a) => s + a.balance, 0),
  cash.total,
);
assert("P3.6 มีชื่อ+ชนิดช่องทางครบทุกใบ", cash.accounts.every((a) => !!a.name && !!a.type));

// ═══════════════ P4 ค้างรับ/ค้างจ่าย + อายุหนี้ ═══════════════
console.log("\nP4 ค้างรับ/ค้างจ่าย + อายุหนี้ 5 ช่วง:");
const arap = await dash.receivablePayableSummary(ctx, { now: NOW });
for (const [key, want] of [
  ["receivable", X.arap.receivable],
  ["payable", X.arap.payable],
] as const) {
  const got = arap[key];
  eq(`P4.1.${key} จำนวนใบ/ยอด`, [got.count, got.amount], [want.count, want.amount]);
  eq(`P4.2.${key} พ้นกำหนด จำนวน/ยอด`, [got.overdueCount, got.overdueAmount], [
    want.overdueCount,
    want.overdueAmount,
  ]);
  eq(`P4.3.${key} จำนวนคู่ค้า`, got.contactCount, want.contactCount);
  eq(`P4.4.${key} อายุหนี้ 5 ช่วง`, got.aging, want.aging);
  eq(
    `P4.5.${key} Σ 5 ช่วง = ยอดรวมอายุหนี้`,
    got.aging.notDueSatang +
      got.aging.d1_30Satang +
      got.aging.d31_60Satang +
      got.aging.d61_90Satang +
      got.aging.d90plusSatang,
    got.aging.totalSatang,
  );
}
eq("P4.6 ค้างรับ = 486,300.00 (เฉลย seed)", arap.receivable.amount, E.receivable);
eq("P4.7 ใบค้างรับ = 18 ใบ", arap.receivable.count, E.receivableDocs);
eq("P4.8 ลูกค้าที่ค้างชำระ = 14 ราย", arap.receivable.contactCount, E.receivableCustomers);
eq("P4.9 พ้นกำหนด 128,400.00 · 4 ใบ", [arap.receivable.overdueAmount, arap.receivable.overdueCount], [
  E.overdueAmount,
  E.overdueDocs,
]);
eq("P4.10 ค้างจ่าย = 212,750.00 · 9 ใบ", [arap.payable.amount, arap.payable.count], [E.payable, E.payableDocs]);
eq("P4.11 ผู้ขายที่ค้างจ่าย = 7 ราย", arap.payable.contactCount, E.payableVendors);
// เทียบกับ "ของเดิม" ที่หน้าอื่นใช้อยู่ — กันนิยามแตกกันเงียบ ๆ
{
  const legacy = await svc.overviewStats(ctx.tenantId, ctx.systemId);
  const legacyPay = await exp.payableStats(ctx.tenantId, ctx.systemId);
  const agingOut = await reports.agingReport(ctx, { direction: "OUT", asOf: NOW });
  const agingIn = await reports.agingReport(ctx, { direction: "IN", asOf: NOW });
  eq("P4.12 ค้างรับ = overviewStats.receivable (ของเดิม)", arap.receivable.amount, legacy.receivable);
  eq("P4.13 พ้นกำหนดรับ = overviewStats (จำนวน+ยอด)", [arap.receivable.overdueCount, arap.receivable.overdueAmount], [
    legacy.overdueCount,
    legacy.overdueAmount,
  ]);
  eq("P4.14 ค้างจ่าย = payableStats.payable (ของเดิม)", arap.payable.amount, legacyPay.payable);
  eq("P4.15 ใบค้างจ่าย = payableStats.openCount", arap.payable.count, legacyPay.openCount);
  eq("P4.16 พ้นกำหนดจ่าย = payableStats", [arap.payable.overdueCount, arap.payable.overdueAmount], [
    legacyPay.overdueCount,
    legacyPay.overdueAmount,
  ]);
  eq("P4.17 อายุหนี้ลูกหนี้ = agingReport(OUT).grand (ของเดิม)", arap.receivable.aging, agingOut.grand);
  eq("P4.18 อายุหนี้เจ้าหนี้ = agingReport(IN).grand (ของเดิม)", arap.payable.aging, agingIn.grand);
}

// ═══════════════ P5 เอกสารที่ออก ═══════════════
console.log("\nP5 การ์ด 'เอกสารที่ออก' (§4 ข้อ 6):");
{
  const iv = await dash.documentsIssued(ctx, "INVOICE", yearRange);
  const want = X.issued.INVOICE;
  eq("P5.1 ใบแจ้งหนี้ที่ออกปีนี้ จำนวน/ยอด", [iv.total.count, iv.total.amount], [want.total.count, want.total.amount]);
  eq("P5.2 มี 4 แถวตามแบบ", iv.rows.length, 4);
  eq("P5.3 แถวแรก = ที่ออกทั้งหมด", [iv.rows[0].count, iv.rows[0].amount], [want.total.count, want.total.amount]);
  for (const [i, key] of ["AWAITING_PAYMENT", "PARTIAL", "PAID"].entries()) {
    const w = want.byStatus[key] ?? { count: 0, amount: 0 };
    eq(`P5.4.${i + 1} แถว ${iv.rows[i + 1].label} จำนวน/ยอด`, [iv.rows[i + 1].count, iv.rows[i + 1].amount], [
      w.count,
      w.amount,
    ]);
  }
  assert("P5.5 ป้ายทุกแถวเป็นภาษาไทย", iv.rows.every((r) => !/^[A-Z_]+$/.test(r.label)));
  eq("P5.6 สัดส่วนแถวแรก = 10000 bp (100%)", iv.rows[0].shareBp, 10000);
  assert(
    "P5.7 Σ สัดส่วน 3 แถวย่อย ≤ 10000 bp",
    iv.rows.slice(1).reduce((s, r) => s + r.shareBp, 0) <= 10000,
  );
  const qt = await dash.documentsIssued(ctx, "QUOTATION", yearRange);
  eq("P5.8 ใบเสนอราคา (ร้าน QC ยังไม่มี) = 0 ใบ 0 บาท", [qt.total.count, qt.total.amount], [
    X.issued.QUOTATION.total.count,
    X.issued.QUOTATION.total.amount,
  ]);
  eq("P5.9 ป้ายชนิดเอกสารไทย", qt.label, "ใบเสนอราคา");
}

// ═══════════════ P6 อันดับลูกค้า/ผู้ขาย/สินค้า/หมวด ═══════════════
console.log("\nP6 ขายใครได้มากที่สุด / ขายอะไรดีสุด / จ่ายค่าอะไร:");
{
  const tc = await dash.topCustomers(ctx, yearRange, 5);
  const tv = await dash.topVendors(ctx, yearRange, 5);
  const tp = await dash.topProducts(ctx, yearRange, 5);
  const te = await dash.topExpenseCategories(ctx, { fromKey: MONTH, toKey: MONTH }, 5);
  eq("P6.1 ลูกค้าอันดับ 1 (ชื่อ/ยอด/จำนวนใบ)", [tc[0].name, tc[0].amount, tc[0].docCount], [
    X.topCustomers[0].name,
    X.topCustomers[0].amount,
    X.topCustomers[0].docCount,
  ]);
  eq("P6.2 ลูกค้า 5 อันดับ (ยอด)", tc.map((r) => r.amount), X.topCustomers.slice(0, 5).map((r: { amount: number }) => r.amount));
  eq("P6.3 ผู้ขายอันดับ 1", [tv[0].name, tv[0].amount], [X.topVendors[0].name, X.topVendors[0].amount]);
  eq("P6.4 ผู้ขาย 5 อันดับ (ยอด)", tv.map((r) => r.amount), X.topVendors.slice(0, 5).map((r: { amount: number }) => r.amount));
  eq("P6.5 สินค้า/บริการอันดับ 1", [tp[0].name, tp[0].amount], [X.topProducts[0].name, X.topProducts[0].amount]);
  eq("P6.6 สินค้า 5 อันดับ (ยอด)", tp.map((r) => r.amount), X.topProducts.slice(0, 5).map((r: { amount: number }) => r.amount));
  eq("P6.7 หมวดค่าใช้จ่ายเดือนนี้ ยอดรวม", te.total, X.topExpenseCategories.total);
  eq(
    "P6.8 หมวดค่าใช้จ่าย 5 อันดับ (รหัส+ยอด)",
    te.rows.map((r) => [r.accountCode, r.amount]),
    X.topExpenseCategories.rows.slice(0, 5).map((r: { accountCode: string; amount: number }) => [r.accountCode, r.amount]),
  );
  assert("P6.9 อันดับเรียงจากมากไปน้อย", tc.every((r, i, a) => i === 0 || a[i - 1].amount >= r.amount));
  assert("P6.10 n จำกัดจำนวนแถวจริง", (await dash.topCustomers(ctx, yearRange, 2)).length === 2);
  eq(
    "P6.11 หมวดค่าใช้จ่ายเดือนนี้ = ยอดค่าใช้จ่ายของเดือนใน series",
    te.total,
    series.months[Number(MONTH.slice(5, 7)) - 1].expense,
  );
}

// ═══════════════ P7 งานที่รอคุณ ═══════════════
console.log("\nP7 งานที่รอคุณ (§4 บล็อก 7):");
{
  const got = await dash.pendingTasks(ctx);
  const legacy = await svc.pendingTasks(ctx.tenantId, ctx.systemId);
  eq("P7.1 ทุกช่องตรงเฉลย SQL", got, { ...X.pending });
  eq("P7.2 ทุกช่องตรงกับ service.pendingTasks ของ WO 1.9 (2 query แทน 6)", got, legacy);
  eq(
    "P7.3 total = ผลรวมทุกช่อง",
    got.total,
    got.quotationAwaitingAccept +
      got.poAwaitingApproval +
      got.depositAwaitingDeduct +
      got.needsReview +
      got.purchaseTaxAwaiting +
      got.recurringDraftsAwaiting,
  );
  eq("P7.4 ร้าน QC ไม่มี JV ค้างตรวจ (needsReview = 0)", got.needsReview, E.journal.needsReview);
}

// ═══════════════ P8 เอกสารล่าสุด ═══════════════
console.log("\nP8 เอกสารล่าสุด:");
{
  const recent = await dash.recentDocuments(ctx, 6);
  eq("P8.1 คืน 6 แถว", recent.length, 6);
  assert(
    "P8.2 เรียงตามการแก้ไขล่าสุด (ใหม่ → เก่า)",
    recent.every((r, i, a) => i === 0 || a[i - 1].updatedAt >= r.updatedAt),
  );
  const newest = (X.recent as Array<{ updatedAt: string }>).slice(0, 6);
  const boundary = newest[newest.length - 1].updatedAt;
  assert(
    "P8.3 ทุกใบอยู่ในชุด 6 ใบล่าสุดจริง (เทียบ SQL)",
    recent.every((r) => r.updatedAt >= boundary),
    `ขอบ ${boundary} · ได้ ${recent.map((r) => r.updatedAt).join(",")}`,
  );
  assert("P8.4 ป้ายชนิดเอกสารเป็นไทยทุกแถว", recent.every((r) => !/^[A-Z_]+$/.test(r.docTypeLabel)));
  assert("P8.5 ป้ายสถานะเป็นไทยทุกแถว", recent.every((r) => !/^[A-Z_]+$/.test(r.statusLabel)));
  assert("P8.6 มีชื่อผู้ติดต่อทุกแถว (ไม่มี id ดิบโผล่)", recent.every((r) => r.contactName.length > 0));
  assert("P8.7 รวมเอกสารทั้ง 2 ฝั่งในชุดเดียว", recent.every((r) => r.direction === "IN" || r.direction === "OUT"));
  assert("P8.8 วันที่ออกเป็น YYYY-MM-DD (เวลาไทย)", recent.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.issueDate)));
}

// ═══════════════ P9 ปฏิทินเงินเข้า-ออก ═══════════════
console.log("\nP9 ปฏิทินเงินเข้า-ออก + คาดการณ์ (§10.2):");
{
  const cal = await dash.cashCalendar(ctx, MONTH, { now: NOW });
  const w = X.calendar.tiles;
  eq("P9.1 ไทล์ เงินเข้าเดือนนี้", cal.tiles.inflow, w.inflow);
  eq("P9.2 ไทล์ เงินออกเดือนนี้", cal.tiles.outflow, w.outflow);
  eq("P9.3 ไทล์ คาดว่าจะเข้า", cal.tiles.expectedIn, w.expectedIn);
  eq("P9.4 ไทล์ คาดว่าจะออก", cal.tiles.expectedOut, w.expectedOut);
  eq("P9.5 ไทล์ ลูกหนี้พ้นกำหนด", cal.tiles.overdueReceivable, w.overdueReceivable);
  eq("P9.6 ไทล์ เจ้าหนี้พ้นกำหนด", cal.tiles.overduePayable, w.overduePayable);
  eq("P9.7 ครบทุกวันของเดือน", cal.days.length, new Date(Date.UTC(YEAR, Number(MONTH.slice(5, 7)), 0)).getUTCDate());
  eq(
    "P9.8 Σ เงินเข้ารายวัน = ไทล์เงินเข้า",
    cal.days.reduce((s, d) => s + d.inflow, 0),
    cal.tiles.inflow.amount,
  );
  eq(
    "P9.9 Σ เงินออกรายวัน = ไทล์เงินออก",
    cal.days.reduce((s, d) => s + d.outflow, 0),
    cal.tiles.outflow.amount,
  );
  eq(
    "P9.10 Σ คาดว่าจะเข้ารายวัน = ไทล์",
    cal.days.reduce((s, d) => s + d.expectedIn, 0),
    cal.tiles.expectedIn.amount,
  );
  for (const d of X.calendar.days as Array<{ date: string; dir: string; amount: number }>) {
    const day = cal.days.find((x) => x.date === d.date);
    eq(`P9.11 วัน ${d.date} ${d.dir === "IN" ? "เงินออก" : "เงินเข้า"}`, d.dir === "IN" ? day?.outflow : day?.inflow, d.amount);
  }
  eq("P9.12 ลูกหนี้พ้นกำหนดในปฏิทิน = KPI พ้นกำหนดฝั่งรับ", cal.tiles.overdueReceivable.amount, arap.receivable.overdueAmount);
  assert("P9.13 ทุกวันเป็นคีย์ YYYY-MM-DD ของเดือนนี้", cal.days.every((d) => d.date.startsWith(MONTH)));
}

// ═══════════════ P10 ก้อนเดียวจบ: budget + เวลา ═══════════════
console.log("\nP10 dashboardSnapshot — budget ≤ 12 query + เวลา:");
let snap: Awaited<ReturnType<typeof dash.dashboardSnapshot>>;
{
  // warm-up (เชื่อมต่อ + plan cache) แล้วค่อยวัดของจริง
  await dash.dashboardSnapshot(ctx, { now: NOW, year: YEAR, issuedDocType: "INVOICE" });
  const meter = { count: 0 };
  sqlLog = [];
  counting = true;
  const t0 = Date.now();
  snap = await dash.dashboardSnapshot(ctx, { now: NOW, year: YEAR, issuedDocType: "INVOICE", meter });
  const ms = Date.now() - t0;
  counting = false;
  const sqlCount = sqlLog.filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(q)).length;
  console.log(`     ⏱  ${ms} ms · SQL จริง ${sqlCount} คำสั่ง · ตัวนับในโค้ด ${meter.count}`);
  assert(`P10.1 SQL ต่อหน้าหลัก ≤ 12 (นับจาก prisma log) — ได้ ${sqlCount}`, sqlCount <= 12);
  eq("P10.2 ตัวนับในโค้ดตรงกับ SQL จริง", meter.count, sqlCount);
  eq("P10.3 snapshot รายงาน queryCount ของตัวเอง", snap.queryCount, sqlCount);
  assert(`P10.4 เวลา < 1,500 ms บน DB QC — ได้ ${ms} ms`, ms < 1500);
  // ทุกบล็อกต้องมาจากก้อนเดียวกัน = ตรงกับที่เรียกทีละตัว
  eq("P10.5 series ในก้อน = monthlySeries", snap.series, series);
  eq("P10.6 ค้างรับ/ค้างจ่ายในก้อน = receivablePayableSummary", snap.arap, arap);
  eq("P10.7 เงินคงเหลือในก้อน = cashPosition", snap.cash, cash);
  eq("P10.8 KPI ค้างรับ", [snap.kpi.receivable.count, snap.kpi.receivable.amount], [E.receivableDocs, E.receivable]);
  eq("P10.9 KPI ค้างจ่าย", [snap.kpi.payable.count, snap.kpi.payable.amount], [E.payableDocs, E.payable]);
  eq(
    "P10.10 KPI พ้นกำหนด = รับ + จ่าย",
    [snap.kpi.overdue.count, snap.kpi.overdue.amount],
    [
      X.arap.receivable.overdueCount + X.arap.payable.overdueCount,
      X.arap.receivable.overdueAmount + X.arap.payable.overdueAmount,
    ],
  );
  eq("P10.11 KPI เงินคงเหลือรวม = 1,284,560.00", snap.kpi.cashTotal, E.finance.total);
  eq("P10.12 donut รายได้ในก้อน", snap.income.total, X.categories.income.total);
  eq("P10.13 donut ค่าใช้จ่ายในก้อน", snap.expense.total, X.categories.expense.total);
  eq("P10.14 งานที่รอคุณในก้อน", snap.pending, { ...X.pending });
  eq("P10.15 เอกสารล่าสุด 6 แถว", snap.recent.length, 6);
  eq("P10.16 อันดับลูกค้าในก้อน", snap.topCustomers.map((r) => r.amount), X.topCustomers.slice(0, 5).map((r: { amount: number }) => r.amount));
  eq("P10.17 ปฏิทินปิดไว้เป็นค่าเริ่มต้น (ไม่ใช่บล็อกหน้าหลัก)", snap.calendar, null);
  assert("P10.18 ผลลัพธ์ JSON-serialisable ทั้งก้อน", typeof JSON.stringify(snap) === "string");
  eq("P10.19 asOf/periodKey ตามเวลาไทยของ now ที่ส่งเข้าไป", [snap.asOf, snap.periodKey], [QC.today, MONTH]);
}

// ═══════════════ P11 สโคป: ระบบอื่น / ร้านอื่น ═══════════════
console.log("\nP11 สโคป tenant + system:");
{
  const otherSystem = { tenantId: E.tenantId as string, systemId: E.systems.POS as string };
  const otherTenant = { tenantId: "cl00000000000000000000000", systemId: E.systemId as string };
  for (const [label, c] of [
    ["ระบบอื่นของร้านเดียวกัน (POS)", otherSystem],
    ["ร้านอื่น (tenantId มั่ว)", otherTenant],
  ] as const) {
    const s = await dash.dashboardSnapshot(c, { now: NOW, year: YEAR });
    eq(`P11.1 ${label}: ค้างรับ 0`, [s.kpi.receivable.count, s.kpi.receivable.amount], [0, 0]);
    eq(`P11.2 ${label}: ค้างจ่าย 0`, [s.kpi.payable.count, s.kpi.payable.amount], [0, 0]);
    eq(`P11.3 ${label}: เงินคงเหลือ 0`, s.kpi.cashTotal, 0);
    eq(`P11.4 ${label}: รายได้ทั้งปี 0`, s.series.total.revenue, 0);
    eq(`P11.5 ${label}: งานที่รอคุณ 0`, s.pending.total, 0);
    eq(`P11.6 ${label}: เอกสารล่าสุดว่าง`, s.recent.length, 0);
  }
  const calOther = await dash.cashCalendar(otherSystem, MONTH, { now: NOW });
  eq("P11.7 ปฏิทินของระบบอื่น = 0 ทุกไทล์", [calOther.tiles.inflow.amount, calOther.tiles.outflow.amount], [0, 0]);
}

// ═══════════════ P12 เงินเป็น integer สตางค์ ═══════════════
console.log("\nP12 เงินเป็นจำนวนเต็มสตางค์:");
{
  const nums: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "number") nums.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(snap);
  assert(`P12.1 ทุกตัวเลขใน snapshot เป็น integer (${nums.length} ค่า)`, nums.every((x) => Number.isInteger(x)));
  const cal = await dash.cashCalendar(ctx, MONTH, { now: NOW });
  const calNums: number[] = [];
  walk2(cal, calNums);
  assert(`P12.2 ทุกตัวเลขในปฏิทินเป็น integer (${calNums.length} ค่า)`, calNums.every((x) => Number.isInteger(x)));
  assert("P12.3 ไม่มีค่าเงินเป็น NaN/Infinity", nums.every((x) => Number.isFinite(x)));
}
function walk2(v: unknown, out: number[]) {
  if (typeof v === "number") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => walk2(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => walk2(x, out));
}

// ═══════════════ สรุป ═══════════════
console.log(`\n📊 ตัวเลขที่ seed สร้างจริง (ให้ Fable เทียบกับภาพ f1):`);
const sep = series.months[Number(MONTH.slice(5, 7)) - 1];
console.log(`   ${MONTH}: รายได้ ฿${baht(sep.revenue)} · ค่าใช้จ่าย ฿${baht(sep.expense)} · กำไร ฿${baht(sep.profit)}`);
console.log(`   ปี ${YEAR}: รายได้ ฿${baht(series.total.revenue)} · ค่าใช้จ่าย ฿${baht(series.total.expense)} · กำไร ฿${baht(series.total.profit)}`);

console.log(`\n===== สรุป WO 2.1: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length > 0) console.log(findings.map((f) => "  • " + f).join("\n"));
console.log(findings.length === 0 ? "🎉 WO 2.1 ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
