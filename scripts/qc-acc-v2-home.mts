// QC WO 2.2 — "หน้าหลัก V2" (src/lib/modules/account/dashboard-home.ts + dashboard-format.ts + UI)
//
// requires: acc-v2-seed
// ↑ marker (WO 0.7) — `qc-all.mts` เห็นบรรทัดนี้แล้ว seed ชุดข้อมูล QC ให้ก่อนรัน
//
// รัน (บังคับ DB QC branch):  QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-home.mts
//
// ครอบคลุม (อ้าง BLUEPRINT §3 WO 2.2 · DESIGN-SPEC-V2 §4 · ledger/wo-notes/2.2.md):
//   P0  สายไฟ: "data function" (loadDashboardHome) เรียก dashboardSnapshot ครั้งเดียว + งบ ≤ 12 query จริง
//   P1  พารามิเตอร์หน้าหลัก: ปี/เดือนโดนัท/ชนิดเอกสาร/side/checklist force ผ่าน query string (parse + fallback)
//   P2  เดือนของโดนัทที่ไม่ตรง periodKey ของ snapshot ต้องคำนวณจาก glRows เดิม (0 query เพิ่ม) และตรงกับ
//       การเรียก categoryBreakdownFromRows ตรง ๆ (regression กันคำนวณเพี้ยน)
//   P3  เช็กลิสต์เริ่มต้น 5 ขั้น: ตารางอนุพัทธ์บริสุทธิ์ (computeChecklist) + ของจริงจาก DB ของ tenant QC
//   P4  เมนู "+ สร้างเอกสาร" 2 คอลัมน์: ⊂ nav ready doc items · href ใช้ได้ · ป้ายไทยล้วน
//   P5  ปักหมุดบัญชี (การเงิน+ผังบัญชี): เพดาน 4 · กันข้ามระบบ (IDOR) · คืนสภาพเดิมหลังเทส
//   P6  เรขาคณิตกราฟ/โดนัท (dashboard-format.ts — ฟังก์ชันบริสุทธิ์ ไม่มี DB)
//   P7  จานสี: อยู่ในโทเคนที่อนุญาตเท่านั้น (positive + negative control)
//   P8  ความปลอดภัย (อ่านซอร์สจริง): dashboard-actions.ts มีด่านสิทธิ์ครบ 2 action

try {
  process.loadEnvFile?.(process.env.QC_ENV_FILE ?? ".env");
} catch {
  /* CI: ไม่มีไฟล์ env */
}

import { readFileSync } from "node:fs";
import type { ChartPoint } from "@/lib/modules/account/dashboard-format";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string; tenantName: string };
  resolveAccV2Scope: (p: unknown) => Promise<{ tenantId: string; systemId: string } | null>;
};
const { loadQcEnv, QC, resolveAccV2Scope } = accEnv;
const { host } = loadQcEnv();

const { prisma } = await import("@/lib/core/db");
const home = await import("@/lib/modules/account/dashboard-home");
const fmt = await import("@/lib/modules/account/dashboard-format");
const dash = await import("@/lib/modules/account/dashboard");
const nav = await import("@/lib/modules/account/nav");
const financeMod = await import("@/lib/modules/account/finance");
const coaMod = await import("@/lib/modules/account/coa");
const { formatBaht } = await import("@/lib/ui/money");

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
if (!E.dashboard) {
  console.error(`❌ เฉลยยังไม่มีคีย์ "dashboard" — รัน scripts/acc-v2-expected-dashboard.mts ก่อน`);
  process.exit(1);
}

const ctx = { tenantId: E.tenantId as string, systemId: E.systemId as string };
const base = `/app/sys/${ctx.systemId}/account`;

// 🔴 ด่านกัน "เฉลยคนละ DB" (เหมือน qc-acc-v2-dashboard.mts)
const qcScope = await resolveAccV2Scope(prisma);
if (!qcScope || qcScope.tenantId !== ctx.tenantId || qcScope.systemId !== ctx.systemId) {
  console.error(
    `❌ เฉลย ${QC.expectedPath} ไม่ตรงกับ DB ก้อนนี้ (${host}) — รัน seed-acc-v2-qc.mts แล้วตามด้วย acc-v2-expected-dashboard.mts ใหม่`,
  );
  process.exit(1);
}

const NOW = new Date(E.dashboard.now as string);

console.log(`\n[env] DB host=${host} · tenant=${QC.tenantName} · asOf=${QC.today}\n`);

// ═══════════════ P0 สายไฟ: dashboardSnapshot ครั้งเดียว + งบ ≤ 12 query ═══════════════
console.log("P0 การเรียก dashboardSnapshot + งบ query:");
{
  const src = readFileSync("src/lib/modules/account/dashboard-home.ts", "utf8");
  const calls = (src.match(/dashboardSnapshot\(/g) ?? []).length;
  assert("P0.1 loadDashboardHome เรียก dashboardSnapshot ในซอร์สครั้งเดียว", calls === 1, `เจอ ${calls} ครั้ง`);

  const h = await home.loadDashboardHome(ctx, {}, { now: NOW, base });
  assert(
    "P0.2 งบ query ของ dashboardSnapshot ≤ 12 (ของจริงจาก meter)",
    h.snapshotQueryCount > 0 && h.snapshotQueryCount <= 12,
    `ได้ ${h.snapshotQueryCount}`,
  );
  eq("P0.3 งบ query เท่ากับ 12 เป๊ะ (เท่า WO 2.1 — ไม่ได้แอบเพิ่ม)", h.snapshotQueryCount, 12);
  assert("P0.4 JSON-serialisable ทั้งก้อน (ไม่มี circular/Date หลุด)", typeof JSON.stringify(h) === "string");
}

// ═══════════════ P1 พารามิเตอร์หน้าหลัก ═══════════════
console.log("\nP1 พารามิเตอร์ (query string → ค่าเริ่มต้น/parse):");
{
  const h = await home.loadDashboardHome(ctx, {}, { now: NOW, base });
  eq("P1.1 ค่าเริ่มต้น: ปี = ปีของ now", h.params.year, E.dashboard.year);
  eq("P1.2 ค่าเริ่มต้น: chartPeriod = month", h.params.chartPeriod, "month");
  eq("P1.3 ค่าเริ่มต้น: side = receivable", h.params.side, "receivable");
  eq("P1.4 ค่าเริ่มต้น: incomeMonth = periodKey ของ snapshot", h.params.incomeMonth, h.snapshot.periodKey);
  eq("P1.5 ค่าเริ่มต้น: expenseMonth = periodKey ของ snapshot", h.params.expenseMonth, h.snapshot.periodKey);
  eq("P1.6 ค่าเริ่มต้น: issuedDocType = INVOICE (มีข้อมูลจริง)", h.params.issuedDocType, "INVOICE");
  eq("P1.7 ค่าเริ่มต้น: forceChecklist = false", h.params.forceChecklist, false);

  const h2 = await home.loadDashboardHome(ctx, { year: "2025", chartPeriod: "quarter", side: "payable", checklist: "1" }, { now: NOW, base });
  eq("P1.8 year=2025 → params.year = 2025", h2.params.year, 2025);
  eq("P1.9 chartPeriod=quarter → ผ่าน validation", h2.params.chartPeriod, "quarter");
  eq("P1.10 side=payable → ผ่าน validation", h2.params.side, "payable");
  eq("P1.11 checklist=1 → forceChecklist = true", h2.params.forceChecklist, true);

  const hBad = await home.loadDashboardHome(ctx, { year: "not-a-year", dt: "NOT_A_DOCTYPE", im: "banana" }, { now: NOW, base });
  eq("P1.12 year พังรูปแบบ → fallback เป็นปีปัจจุบัน", hBad.params.year, E.dashboard.year);
  eq("P1.13 dt ไม่รู้จัก → fallback เป็น INVOICE", hBad.params.issuedDocType, "INVOICE");
  eq("P1.14 im พังรูปแบบ → fallback เป็น periodKey ของ snapshot", hBad.params.incomeMonth, hBad.snapshot.periodKey);
}

// ═══════════════ P2 โดนัทเดือนอื่น (derive จาก glRows เดิม ไม่ query เพิ่ม) ═══════════════
console.log("\nP2 เลือกเดือนอื่นของโดนัท (0 query เพิ่ม):");
{
  const prevMonth = `${E.dashboard.year}-08`;
  const h = await home.loadDashboardHome(ctx, { im: prevMonth, em: prevMonth }, { now: NOW, base });
  assert("P2.1 เลือกเดือนอื่น ไม่กระทบงบ query (ยังคง 12)", h.snapshotQueryCount === 12, `ได้ ${h.snapshotQueryCount}`);
  const direct = dash.categoryBreakdownFromRows(h.snapshot.glRows, prevMonth, "income", 5);
  eq("P2.2 income เดือนอื่น = ผลจาก categoryBreakdownFromRows ตรง ๆ", h.income, direct);
  const directExp = dash.categoryBreakdownFromRows(h.snapshot.glRows, prevMonth, "expense", 5);
  eq("P2.3 expense เดือนอื่น = ผลจาก categoryBreakdownFromRows ตรง ๆ", h.expense, directExp);

  const hSame = await home.loadDashboardHome(ctx, {}, { now: NOW, base });
  assert("P2.4 เดือนตรงกับ periodKey → ใช้ snapshot.income อ้างอิงเดิม (ไม่คำนวณซ้ำ)", hSame.income === hSame.snapshot.income);
}

// ═══════════════ P3 เช็กลิสต์เริ่มต้น 5 ขั้น ═══════════════
console.log("\nP3 เช็กลิสต์เริ่มต้น (computeChecklist บริสุทธิ์ + ของจริง):");
{
  const allTrue = home.computeChecklist(
    { hasOrgName: true, hasFinance: true, hasContactOrProduct: true, hasIssuedDoc: true, hasSystemLink: true },
    base,
  );
  eq("P3.1 ครบทุกข้อ → allDone = true", allTrue.allDone, true);
  assert("P3.2 ครบทุกข้อ → ทุก step.done = true", allTrue.steps.every((s) => s.done));

  const allFalse = home.computeChecklist(
    { hasOrgName: false, hasFinance: false, hasContactOrProduct: false, hasIssuedDoc: false, hasSystemLink: false },
    base,
  );
  eq("P3.3 ไม่ครบเลย → allDone = false", allFalse.allDone, false);
  eq("P3.4 5 ขั้นตามลำดับ (org·finance·contact·doc·link)", allFalse.steps.map((s) => s.key), ["org", "finance", "contact", "doc", "link"]);

  const onlyOrg = home.computeChecklist(
    { hasOrgName: true, hasFinance: false, hasContactOrProduct: false, hasIssuedDoc: false, hasSystemLink: false },
    base,
  );
  eq("P3.5 ครบแค่ข้อ 1 → allDone ยังเป็น false", onlyOrg.allDone, false);
  eq("P3.6 ครบแค่ข้อ 1 → step org.done = true ข้อที่เหลือ false", onlyOrg.steps.map((s) => s.done), [true, false, false, false, false]);
  eq("P3.7 href ของทุกขั้นขึ้นต้นด้วย base", onlyOrg.steps.every((s) => s.href.startsWith(base)), true);

  const h = await home.loadDashboardHome(ctx, {}, { now: NOW, base });
  assert(
    "P3.8 tenant QC (seed ครบทุกอย่างแล้ว) → checklist.allDone = true จริง",
    h.checklist.allDone === true,
    `steps: ${JSON.stringify(h.checklist.steps)}`,
  );
  const h2 = await home.loadDashboardHome(ctx, { checklist: "1" }, { now: NOW, base });
  eq("P3.9 ?checklist=1 → forceChecklist true แม้ allDone (สำหรับถ่ายภาพ QC)", h2.params.forceChecklist, true);
}

// ═══════════════ P4 เมนู "+ สร้างเอกสาร" ═══════════════
console.log("\nP4 เมนูสร้างด่วน (createDocMenuItems ⊂ nav):");
{
  const groups = nav.ACCOUNT_NAV(base, true);
  const revenueReady = new Set(
    groups.find((g) => g.key === "revenue")!.items.filter((it) => it.status === "ready" && it.kind === "doc").map((it) => it.testId),
  );
  const expenseReady = new Set(
    groups.find((g) => g.key === "expense")!.items.filter((it) => it.status === "ready" && it.kind === "doc").map((it) => it.testId),
  );
  const menu = home.createDocMenuItems(base, true);
  assert(
    "P4.1 ทุกรายการรายรับในเมนูสร้าง ⊂ nav.ready doc items",
    menu.revenue.every((it) => revenueReady.has(it.testId) || it.testId.endsWith("_IMPORT")),
    JSON.stringify(menu.revenue.map((i) => i.testId)),
  );
  assert(
    "P4.2 ทุกรายการรายจ่ายในเมนูสร้าง ⊂ nav.ready doc items",
    menu.expense.every((it) => expenseReady.has(it.testId) || it.testId.endsWith("_IMPORT")),
    JSON.stringify(menu.expense.map((i) => i.testId)),
  );
  assert("P4.3 ไม่มีรายการ 'ดูภาพรวม'/'เอกสารประจำ'/'ลิงก์ QR' ปนอยู่ (ยังไม่มีฟอร์ม)", ![...menu.revenue, ...menu.expense].some((it) => /_OVERVIEW$|_RECURRING$|_QR_LINK$/.test(it.testId)));
  assert("P4.4 ทุก href ขึ้นต้นด้วย base", [...menu.revenue, ...menu.expense].every((it) => it.href.startsWith(base)));
  assert("P4.5 ป้ายทุกรายการเป็นภาษาไทย (มีอักษรไทยอย่างน้อย 1 ตัว)", [...menu.revenue, ...menu.expense].every((it) => /[ก-๙]/.test(it.label)));
  assert("P4.6 รายรับมีอย่างน้อยใบแจ้งหนี้", menu.revenue.some((it) => it.testId === "INVOICE"));
  assert("P4.7 รายจ่ายมีอย่างน้อยบันทึกค่าใช้จ่าย", menu.expense.some((it) => it.testId === "EXPENSE"));

  const docTypes = home.issuableDocTypes(base, true);
  assert("P4.8 issuableDocTypes ไม่ว่าง และทุกตัวมีป้ายไทย", docTypes.length > 0 && docTypes.every((d) => /[ก-๙]/.test(d.label)));
}

// ═══════════════ P5 ปักหมุดบัญชี (finance + ledger) ═══════════════
console.log("\nP5 ปักหมุดบัญชีเงิน/ผังบัญชี (เพดาน 4 · กันข้ามระบบ · คืนสภาพเดิม):");
{
  const finances = await prisma.accountFinance.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null }, select: { id: true } });
  const ledgers = await prisma.accountLedger.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null }, select: { id: true }, take: 3 });
  // 🔴 seed-acc-v2-qc.mts ปักหมุดไว้แล้วจริง (กสิกรไทย/เงินสด/พร้อมเพย์ + 4000/5000) — ต้องจำสภาพเดิมไว้คืน
  // ไม่ใช่รีเซ็ตเป็น [] เฉย ๆ (เคยทำแบบนั้นแล้วลบหมุดของ seed ทิ้งจริง ทำให้ WO 2.1 regression แดง P3.4)
  const finPinnedBefore = (
    await prisma.accountFinance.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, pinned: true }, select: { id: true } })
  ).map((f) => f.id);
  const ledgerPinnedBefore = (
    await prisma.accountLedger.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, pinned: true }, select: { id: true } })
  ).map((l) => l.id);

  // เพดาน 4 — ทดสอบด้วย id สมมติ 5 ตัว (ด่านความยาวทำงานก่อนแตะ DB — ไม่ต้องมีบัญชีจริง 5 ใบ)
  const overCap = await financeMod.setPinnedFinanceAccounts(ctx.tenantId, ctx.systemId, ["a", "b", "c", "d", "e"]);
  eq("P5.1 ปักหมุด 5 รายการ → ok:false (เกินเพดาน 4)", overCap.ok, false);

  const overCapLedger = await coaMod.setPinnedLedgerAccounts({ tenantId: ctx.tenantId, systemId: ctx.systemId }, ["a", "b", "c", "d", "e"]);
  eq("P5.2 ผังบัญชี: ปักหมุด 5 รายการ → ok:false (เกินเพดาน 4)", overCapLedger.ok, false);

  // ข้ามระบบ (IDOR) — สร้าง tenant/system/บัญชีปลอมทิ้ง ๆ แล้วลองปักหมุดข้ามเข้า tenant QC
  const foreign = await prisma.tenant.create({ data: { name: "QC-2.2-foreign", slug: `qc22-foreign-${Date.now()}` } });
  const foreignSys = await prisma.appSystem.create({ data: { tenantId: foreign.id, type: "ACCOUNT", name: "QC foreign" } });
  const foreignFinance = await prisma.accountFinance.create({
    data: { tenantId: foreign.id, systemId: foreignSys.id, type: "CASH", name: "QC foreign cash" },
  });
  try {
    const cross = await financeMod.setPinnedFinanceAccounts(ctx.tenantId, ctx.systemId, [foreignFinance.id]);
    eq("P5.3 ปักหมุดบัญชีของ tenant อื่น → ok:false (กัน IDOR)", cross.ok, false);

    if (finances.length >= 2) {
      const pickIds = finances.slice(0, 2).map((f) => f.id);
      const res = await financeMod.setPinnedFinanceAccounts(ctx.tenantId, ctx.systemId, pickIds);
      eq("P5.4 ปักหมุด 2 บัญชีจริงของ tenant ตัวเอง → ok:true", res.ok, true);
      const after = await prisma.accountFinance.findMany({ where: { id: { in: pickIds } }, select: { id: true, pinned: true } });
      assert("P5.5 หลังปักหมุด: ทั้ง 2 บัญชีมี pinned=true จริงใน DB", after.every((a) => a.pinned === true));
      const others = await prisma.accountFinance.findMany({
        where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { notIn: pickIds } },
        select: { pinned: true },
      });
      assert("P5.6 บัญชีอื่นที่ไม่ได้เลือก → pinned=false (แทนที่ทั้งชุด ไม่ใช่ toggle สะสม)", others.every((a) => a.pinned === false));
      // คืนสภาพเดิม = ชุดที่ seed ปักหมุดไว้จริง (ไม่ใช่ [] — QC tenant มีบัญชีปักหมุดจริงตาม f1)
      await financeMod.setPinnedFinanceAccounts(ctx.tenantId, ctx.systemId, finPinnedBefore);
      const restored = await prisma.accountFinance.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, pinned: true } });
      assert(
        "P5.7 คืนสภาพเดิม: ชุดปักหมุดกลับเหมือนก่อนเทสเป๊ะ",
        new Set(restored.filter((a) => a.pinned).map((a) => a.id)).size === finPinnedBefore.length &&
          restored.filter((a) => a.pinned).every((a) => finPinnedBefore.includes(a.id)),
        `ก่อนเทส ${JSON.stringify(finPinnedBefore)} · หลังคืน ${JSON.stringify(restored.filter((a) => a.pinned).map((a) => a.id))}`,
      );
    } else {
      bad("P5.4-P5.7", `tenant QC มีบัญชีเงินไม่พอทดสอบ (${finances.length} < 2)`);
    }

    if (ledgers.length >= 2) {
      const pickIds = ledgers.slice(0, 2).map((l) => l.id);
      const res = await coaMod.setPinnedLedgerAccounts({ tenantId: ctx.tenantId, systemId: ctx.systemId }, pickIds);
      eq("P5.8 ผังบัญชี: ปักหมุด 2 บัญชีจริง → ok:true", res.ok, true);
      const after = await prisma.accountLedger.findMany({ where: { id: { in: pickIds } }, select: { pinned: true } });
      assert("P5.9 ผังบัญชี: หลังปักหมุด pinned=true จริงใน DB", after.every((a) => a.pinned === true));
      // คืนสภาพเดิม = ชุดที่ seed ปักหมุดไว้จริง (4000/5000 — ไม่ใช่ [])
      await coaMod.setPinnedLedgerAccounts({ tenantId: ctx.tenantId, systemId: ctx.systemId }, ledgerPinnedBefore);
      const restored = await prisma.accountLedger.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, pinned: true }, select: { id: true } });
      assert(
        "P5.10 ผังบัญชี: คืนสภาพเดิม ชุดปักหมุดกลับเหมือนก่อนเทสเป๊ะ",
        new Set(restored.map((a) => a.id)).size === ledgerPinnedBefore.length && restored.every((a) => ledgerPinnedBefore.includes(a.id)),
        `ก่อนเทส ${JSON.stringify(ledgerPinnedBefore)} · หลังคืน ${JSON.stringify(restored.map((a) => a.id))}`,
      );
    } else {
      bad("P5.8-P5.10", `tenant QC มีผังบัญชีไม่พอทดสอบ (${ledgers.length} < 2)`);
    }
  } finally {
    await prisma.accountFinance.delete({ where: { id: foreignFinance.id } });
    await prisma.appSystem.delete({ where: { id: foreignSys.id } });
    await prisma.tenant.delete({ where: { id: foreign.id } });
  }
}

// ═══════════════ P6 เรขาคณิตกราฟ/โดนัท (ฟังก์ชันบริสุทธิ์) ═══════════════
console.log("\nP6 เรขาคณิตกราฟ/โดนัท/ไตรมาส (dashboard-format.ts):");
{
  const pts: ChartPoint[] = [
    { key: "a", label: "A", revenue: 100, expense: 40, profit: 60 },
    { key: "b", label: "B", revenue: 200, expense: 80, profit: 120 },
  ];
  const geo = fmt.chartGeometry(pts);
  eq("P6.1 จำนวนแท่ง = จำนวนจุดข้อมูล", geo.bars.length, 2);
  const ratio = geo.bars[0].revenue.h / geo.bars[1].revenue.h;
  assert("P6.2 ความสูงแท่งรายได้เป็นสัดส่วนกับค่าเงิน (100:200 ≈ h1:h2)", Math.abs(ratio - 0.5) < 0.01, `ได้อัตราส่วน ${ratio}`);
  assert("P6.3 แท่งค่าใช้จ่ายเตี้ยกว่าแท่งรายได้เสมอเมื่อ expense<revenue (จุดที่ 1)", geo.bars[0].expense.h < geo.bars[0].revenue.h);
  assert("P6.4 เส้นกำไรมีจุดครบเท่าจำนวนแท่ง (polyline มี 2 คู่พิกัด)", geo.profitPolyline.split(" ").length === 2);

  const ptsLoss: ChartPoint[] = [
    { key: "a", label: "A", revenue: 100, expense: 150, profit: -50 },
  ];
  const geoLoss = fmt.chartGeometry(ptsLoss);
  assert("P6.5 กำไรติดลบ → จุดเส้นกำไรอยู่ต่ำกว่าเส้นศูนย์ (y มากกว่า baselineY)", geoLoss.bars[0].profitPoint.y > geoLoss.baselineY);

  const slices = [
    { name: "A", amount: 30, color: "#1d4ed8" },
    { name: "B", amount: 20, color: "#404040" },
    { name: "C", amount: 50, color: "#737373" },
  ];
  const arcs = fmt.donutArcs(slices);
  const sumDeg = arcs.reduce((s, a) => s + a.deg, 0);
  assert("P6.6 Σ มุมโดนัท ≈ 360 องศา", Math.abs(sumDeg - 360) < 0.1, `ได้ ${sumDeg}`);
  const arcsEmpty = fmt.donutArcs([]);
  eq("P6.7 โดนัทไม่มีข้อมูล → arcs ว่าง (ไม่ throw)", arcsEmpty.length, 0);
  const arcsZero = fmt.donutArcs([{ name: "Z", amount: 0, color: "#000" }]);
  assert("P6.8 slice ยอด 0 → deg = 0 ไม่ใช่ NaN", arcsZero[0].deg === 0 && Number.isFinite(arcsZero[0].deg));

  const months = Array.from({ length: 12 }, (_, i) => ({ periodKey: `2026-${String(i + 1).padStart(2, "0")}`, revenue: i + 1, expense: 0, profit: i + 1 }));
  const quarters = fmt.monthsToQuarters(months);
  eq("P6.9 12 เดือน → 4 ไตรมาส", quarters.length, 4);
  eq("P6.10 ไตรมาส 1 = ผลรวมเดือน 1+2+3 (1+2+3=6)", quarters[0].revenue, 6);
  eq("P6.11 ไตรมาส 4 = ผลรวมเดือน 10+11+12 (10+11+12=33)", quarters[3].revenue, 33);

  eq("P6.12 bpToPercent(10000) = 100", fmt.bpToPercent(10000), 100);
  eq("P6.13 bpToPercent(0) = 0", fmt.bpToPercent(0), 0);
  eq("P6.14 bpToPercent เกิน 100 ถูก clamp", fmt.bpToPercent(99999), 100);

  // 🔴 Fable QC ภาพจริงรอบ 2: ป้ายแกน y เคยเป็น "฿39323k" (ลืมแปลงสตางค์→บาทก่อนหาร 1000) — กันไม่ให้กลับมาอีก
  // ใช้ตัวเลขจริงของ ก.ย. 2026 (สตางค์จาก dashboardSnapshot) ยิงผ่าน chartGeometry ตรง ๆ
  const bigPts: ChartPoint[] = [{ key: "2026-09", label: "ก.ย.", revenue: 52430842, expense: 12640186, profit: 39790656 }];
  const geoBig = fmt.chartGeometry(bigPts);
  assert(
    "P6.15 ป้ายแกน y เป็นเลขกลม รูปแบบ ฿<n>k/M เท่านั้น (ไม่ใช่ '฿39323k')",
    geoBig.gridLines.every((g) => /^฿\d+(\.\d+)?[kM]?$/.test(g.label)) && !geoBig.gridLines.some((g) => g.label.includes("39323")),
    JSON.stringify(geoBig.gridLines.map((g) => g.label)),
  );
  eq("P6.16 มีเส้นกริด 3 เส้น", geoBig.gridLines.length, 3);
  assert(
    "P6.17 เส้นกริดเรียงจากน้อยไปมาก (1/3, 2/3, 3/3 ของเพดานกลม)",
    (() => {
      const nums = geoBig.gridLines.map((g) => Number(g.label.replace(/[฿kM]/g, "")) * (g.label.includes("M") ? 1_000_000 : g.label.includes("k") ? 1000 : 1));
      return nums[0] < nums[1] && nums[1] < nums[2] && Math.abs(nums[0] * 3 - nums[2]) < 1;
    })(),
    JSON.stringify(geoBig.gridLines.map((g) => g.label)),
  );
  eq("P6.18 formatBahtShort(200000) = '฿200k'", fmt.formatBahtShort(200000), "฿200k");
  eq("P6.19 formatBahtShort(1500000) = '฿1.5M'", fmt.formatBahtShort(1500000), "฿1.5M");
  eq("P6.20 formatBahtShort(0) = '฿0'", fmt.formatBahtShort(0), "฿0");
}

// ═══════════════ P7 จานสี (positive + negative control) ═══════════════
console.log("\nP7 จานสี (ห้ามมีสีนอกโทเคน):");
{
  assert("P7.1 accent #1d4ed8 อยู่ในโทเคน", fmt.isPaletteColor("#1d4ed8"));
  assert("P7.2 ink #0a0a0a อยู่ในโทเคน", fmt.isPaletteColor("#0a0a0a"));
  assert("P7.3 danger #b91c1c อยู่ในโทเคน", fmt.isPaletteColor("#b91c1c"));
  assert("P7.4 rgb(29,78,216) (= #1d4ed8) แปลงแล้วอยู่ในโทเคน", fmt.isPaletteColor("rgb(29, 78, 216)"));
  // negative control — บทเรียน feedback_negative_result_needs_positive_control: ต้องพิสูจน์ว่าฟังก์ชันจับสีนอกโทเคนได้จริง
  assert("P7.5 เขียว #16a34a ไม่อยู่ในโทเคน (negative control)", !fmt.isPaletteColor("#16a34a"));
  assert("P7.6 ส้ม #f97316 ไม่อยู่ในโทเคน (negative control)", !fmt.isPaletteColor("#f97316"));
  assert("P7.7 none/transparent ผ่าน (fill ไม่มีสี)", fmt.isPaletteColor("none") && fmt.isPaletteColor("transparent"));
}

// ═══════════════ P8 ความปลอดภัย (อ่านซอร์สจริง) ═══════════════
console.log("\nP8 ด่านสิทธิ์ของ dashboard-actions.ts:");
{
  const src = readFileSync("src/lib/modules/account/dashboard-actions.ts", "utf8");
  assert("P8.1 pinFinanceAccountsAction ตรวจสิทธิ์ account.finance.manage", /pinFinanceAccountsAction[\s\S]*?account\.finance\.manage/.test(src));
  assert("P8.2 pinLedgerAccountsAction ตรวจสิทธิ์ account.chart.manage", /pinLedgerAccountsAction[\s\S]*?account\.chart\.manage/.test(src));
  assert("P8.3 ทั้งไฟล์เรียก assertAccountCan (ด่านสิทธิ์จริง ไม่ใช่แค่ comment)", /assertAccountCan\(/.test(src));
  assert("P8.4 revalidatePath ถูกเรียกหลัง pin สำเร็จ (หน้าไม่ค้างข้อมูลเก่า)", /revalidatePath\(/.test(src));
}

// ═══════════════ P9 formatBaht — ค่าเริ่มต้นของฟังก์ชัน + โหมด decimals:true ที่หน้าหลักใช้จริง ═══════════════
// 🔴 Fable QC ภาพจริงรอบ 2: f1 ใช้ 2 ตำแหน่งทศนิยมทุกจุด (KPI/อายุหนี้/เงินคุณอยู่ไหน/โดนัท/อันดับ) —
// ui.tsx เปลี่ยนทุกจุด (ยกเว้นป้ายแกนกราฟที่ใช้ formatBahtShort ย่อเป็น k/M) ให้เรียก `{ decimals: true }` แล้ว
console.log("\nP9 รูปแบบเงินบาท (ค่าเริ่มต้น + โหมด decimals:true ที่ ui.tsx ใช้จริงบนหน้าหลัก):");
{
  eq("P9.1 ค่าเริ่มต้น (ไม่ใส่ opts): ยอดลงตัว → ไม่มีทศนิยม", formatBaht(48630000), "฿486,300");
  eq("P9.2 ค่าเริ่มต้น: ยอดมีเศษสตางค์ → โชว์ทศนิยมอัตโนมัติ", formatBaht(52430842), "฿524,308.42");
  eq("P9.3 decimals:true (โหมดที่หน้าหลักใช้จริง): ค้างรับ → '฿486,300.00'", formatBaht(48630000, { decimals: true }), "฿486,300.00");
  eq("P9.4 decimals:true: เงินคงเหลือรวม → '฿1,284,560.00'", formatBaht(128456000, { decimals: true }), "฿1,284,560.00");
  eq("P9.5 decimals:true: พ้นกำหนดรวม 2 ฝั่ง → '฿205,900.00'", formatBaht(20590000, { decimals: true }), "฿205,900.00");
  eq("P9.6 decimals:true: ยอดที่เคยพลาด (5,887,850 สตางค์) → '฿58,878.50' ไม่ใช่ '฿58,878.5'", formatBaht(5887850, { decimals: true }), "฿58,878.50");
  eq("P9.7 decimals:true: ยอด 0 → '฿0.00'", formatBaht(0, { decimals: true }), "฿0.00");
}

console.log(`\n===== สรุป WO 2.2: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length > 0) console.log(findings.map((f) => "  • " + f).join("\n"));
console.log(findings.length === 0 ? "🎉 WO 2.2 ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
process.exit(findings.length === 0 ? 0 : 1);
