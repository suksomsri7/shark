// QC — OT · คอมมิชชั่น · หักเงิน + สายอนุมัติ (เจ้าของสั่งข้อ 5+7 · 13 ส.ค. 2026)
// ⚠️ Oracle ภายใต้ change control — Fable (Auditor) เป็นเจ้าของ
//
// สัญญาที่ต้องจริงเสมอ:
// [1] สูตร OT: เงินเดือน ÷30 ÷8 ×1.5 (ร้านตั้งอัตราเองได้) · เงิน = ชั่วโมง × อัตรา ปัดสตางค์
// [2] 🔴 ยื่นแล้วต้องรออนุมัติ — รายการ PENDING ห้ามมีผลกับเงินเดือน
// [3] 🔴 คนยื่น ≠ คนอนุมัติ (คนที่ไม่ใช่เจ้าของ อนุมัติของตัวเองไม่ได้)
// [4] อนุมัติแล้วเข้ารอบจ่าย: gross = เงินเดือน + เพิ่ม − หัก · ปสส./ภงด.1 ยังคิดจากเงินเดือนประจำ
// [5] เข้ารอบจ่ายแล้วนับซ้ำไม่ได้ (runId ผูกไว้) และแก้/ลบไม่ได้
// [6] หักมากกว่าเงินเดือน → จ่าย 0 ไม่ติดลบ
// [7] ไม่รั่วข้ามร้าน
//
// รัน: pnpm exec tsx scripts/qc-hr-payadjust.mts
try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const hr = await import("@/lib/modules/hr/service");
const pay = await import("@/lib/modules/hr/payroll");
const rules = await import("@/lib/modules/hr/payroll-rules");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

let tid = "";
let otherTid = "";
try {
  // ── [1] สูตร pure ──
  console.log("── สูตร OT ──");
  // เงินเดือน 30,000 บาท → ต่อชั่วโมง 30000/30/8 = 125 บาท → ×1.5 = 187.50 บาท = 18,750 สตางค์
  chk("OT-1", "เงินเดือน 30,000 → OT ชั่วโมงละ 187.50 บาท", rules.otHourlyRateSatang(3_000_000) === 18_750, "18750", String(rules.otHourlyRateSatang(3_000_000)));
  chk("OT-2", "OT 6 ชั่วโมง = 1,125 บาท", rules.otAmountSatang(6, 18_750) === 112_500, "112500", String(rules.otAmountSatang(6, 18_750)));
  chk("OT-3", "อัตราที่ร้านตั้งเอง (multiplier 3 วันหยุด) คิดตามที่ส่งมา",
    rules.otHourlyRateSatang(3_000_000, { multiplier: 3 }) === 37_500, "37500", String(rules.otHourlyRateSatang(3_000_000, { multiplier: 3 })));
  chk("OT-4", "รวมรายการ: ทิศทางมาจาก kind (บวก/หัก ไม่สลับกัน)",
    JSON.stringify(rules.sumAdjustments([
      { kind: "OT", amountSatang: 100 },
      { kind: "COMMISSION", amountSatang: 200 },
      { kind: "DEDUCTION", amountSatang: 50 },
      { kind: "ADVANCE", amountSatang: 25 },
    ])) === JSON.stringify({ addSatang: 300, deductSatang: 75 }),
    "add 300/deduct 75", JSON.stringify(rules.sumAdjustments([
      { kind: "OT", amountSatang: 100 }, { kind: "COMMISSION", amountSatang: 200 },
      { kind: "DEDUCTION", amountSatang: 50 }, { kind: "ADVANCE", amountSatang: 25 }])));
  chk("OT-5", "🔴 หักมากกว่าเงินเดือน → 0 ไม่ติดลบ",
    rules.payableGrossSatang({ baseSalarySatang: 1000, addSatang: 0, deductSatang: 5000 }) === 0, "0",
    String(rules.payableGrossSatang({ baseSalarySatang: 1000, addSatang: 0, deductSatang: 5000 })));

  // ── setup ร้าน ──
  const t = await prisma.tenant.create({ data: { name: "QC OT/หักเงิน", slug: `qc-adj-${Date.now()}` } });
  tid = t.id;
  const hrSys = await sys.createSystem(tid, "HR", "พนักงาน HR");
  const ctx = { tenantId: tid, systemId: hrSys.id };
  const emp = await hr.createEmployee(ctx, { name: "ช่างโอที" });
  await pay.setSalaryProfile(ctx, { employeeId: emp.id, baseSalarySatang: 3_000_000, ssoEligible: true });
  const period = "2026-08";

  chk("RQ-0", "อัตรา OT ของพนักงานคนนี้ = 187.50 บาท/ชม.", (await pay.otRateFor(ctx, emp.id)) === 18_750, "18750", String(await pay.otRateFor(ctx, emp.id)));

  // ── [2] ยื่นแล้วต้องรออนุมัติ ──
  console.log("── ยื่น/อนุมัติ ──");
  const ot = await pay.requestAdjustment(ctx, { employeeId: emp.id, periodKey: period, kind: "OT", hours: 6, requestedById: "user-staff" });
  chk("RQ-1", "ยื่น OT 6 ชม. → คิดเงินให้ 1,125 บาท และสถานะรออนุมัติ",
    ot.ok === true && ot.amountSatang === 112_500 &&
      (await prisma.hrPayAdjustment.findUnique({ where: { id: ot.id! } }))?.status === "PENDING",
    "112500/PENDING", JSON.stringify(ot));
  const badPeriod = await pay.requestAdjustment(ctx, { employeeId: emp.id, periodKey: "2026/08", kind: "BONUS", amountSatang: 100 });
  chk("RQ-2", "งวดรูปแบบผิด → ปฏิเสธ", badPeriod.ok === false, "false", JSON.stringify(badPeriod));
  const zero = await pay.requestAdjustment(ctx, { employeeId: emp.id, periodKey: period, kind: "BONUS", amountSatang: 0 });
  chk("RQ-3", "ยอด 0 → ปฏิเสธ", zero.ok === false, "false", JSON.stringify(zero));

  const runPending = await pay.createPayrollRun(ctx, { periodKey: period, payDate: new Date("2026-08-31") });
  const itemPending = await prisma.hrPayrollItem.findFirst({ where: { runId: runPending.id, employeeId: emp.id } });
  chk("AP-1", "🔴 รายการที่ยังไม่อนุมัติ ไม่มีผลกับเงินเดือน (gross = เงินเดือนเปล่า)",
    itemPending?.grossSatang === 3_000_000 && itemPending?.addSatang === 0, "3000000/0",
    JSON.stringify({ gross: itemPending?.grossSatang, add: itemPending?.addSatang }));
  await prisma.hrPayrollItem.deleteMany({ where: { runId: runPending.id } });
  await prisma.hrPayrollRun.delete({ where: { id: runPending.id } });

  // ── [3] คนยื่น ≠ คนอนุมัติ ──
  const selfApprove = await pay.decideAdjustment(ctx, ot.id!, "APPROVED", { userId: "user-staff", isOwner: false });
  chk("AP-2", "🔴 คนที่ไม่ใช่เจ้าของ อนุมัติรายการที่ตัวเองยื่นไม่ได้",
    selfApprove.ok === false && /ตัวเอง/.test(selfApprove.reason ?? ""), "false + เหตุผลชัด", JSON.stringify(selfApprove));
  const otherApprove = await pay.decideAdjustment(ctx, ot.id!, "APPROVED", { userId: "user-manager", isOwner: false });
  chk("AP-3", "คนอื่นอนุมัติได้", otherApprove.ok === true, "ok", JSON.stringify(otherApprove));
  const twice = await pay.decideAdjustment(ctx, ot.id!, "REJECTED", { userId: "user-owner", isOwner: true });
  chk("AP-4", "อนุมัติแล้วตัดสินซ้ำไม่ได้", twice.ok === false, "false", JSON.stringify(twice));

  // เพิ่มรายการหักเงิน + คอมมิชชั่น แล้วอนุมัติ (เจ้าของอนุมัติของตัวเองได้)
  const ded = await pay.requestAdjustment(ctx, { employeeId: emp.id, periodKey: period, kind: "DEDUCTION", amountSatang: 50_000, note: "มาสาย 3 ครั้ง", requestedById: "user-owner" });
  await pay.decideAdjustment(ctx, ded.id!, "APPROVED", { userId: "user-owner", isOwner: true });
  const com = await pay.requestAdjustment(ctx, { employeeId: emp.id, periodKey: period, kind: "COMMISSION", amountSatang: 200_000, requestedById: "user-owner" });
  await pay.decideAdjustment(ctx, com.id!, "APPROVED", { userId: "user-owner", isOwner: true });
  chk("AP-5", "เจ้าของอนุมัติรายการที่ตัวเองยื่นได้ (ร้านเล็กมีคนเดียว)",
    (await prisma.hrPayAdjustment.count({ where: { tenantId: tid, status: "APPROVED" } })) === 3, "3", "-");

  // ── [4] เข้ารอบจ่าย ──
  console.log("── เข้ารอบจ่าย ──");
  const run = await pay.createPayrollRun(ctx, { periodKey: period, payDate: new Date("2026-08-31") });
  const item = await prisma.hrPayrollItem.findFirst({ where: { runId: run.id, employeeId: emp.id } });
  const runRow = await prisma.hrPayrollRun.findUnique({ where: { id: run.id } });
  // gross = 30,000 + (1,125 OT + 2,000 คอม) − 500 หัก = 32,625 บาท
  chk("RN-1", "gross = เงินเดือน + เพิ่ม − หัก (32,625 บาท)", item?.grossSatang === 3_262_500, "3262500", String(item?.grossSatang));
  chk("RN-2", "แยกยอดเพิ่ม/หักไว้ในรายการ (3,125 / 500)",
    item?.addSatang === 312_500 && item?.deductSatang === 50_000, "312500/50000",
    JSON.stringify({ add: item?.addSatang, deduct: item?.deductSatang }));
  chk("RN-3", "🔴 ฐานประกันสังคมยังคิดจากเงินเดือนประจำ (15,000 เพดาน) ไม่ใช่ยอดรวม OT",
    item?.ssoBaseSatang === 1_500_000, "1500000", String(item?.ssoBaseSatang));
  const expectedNet = (item?.grossSatang ?? 0) - (item?.ssoEmployeeSatang ?? 0) - (item?.whtSatang ?? 0);
  chk("RN-4", "สุทธิ = gross − ปสส. − ภาษี (ตรงทุกสตางค์)", item?.netSatang === expectedNet, String(expectedNet), String(item?.netSatang));
  chk("RN-5", "ยอดรวมของรอบเก็บยอดเพิ่ม/หักไว้ด้วย",
    runRow?.totalAddSatang === 312_500 && runRow?.totalDeductSatang === 50_000, "312500/50000",
    JSON.stringify({ add: runRow?.totalAddSatang, deduct: runRow?.totalDeductSatang }));
  const snap = (item?.snapshotJson ?? {}) as { adjustments?: unknown[] };
  chk("RN-6", "สลิปมีรายละเอียดรายการ (freeze ใน snapshot 3 บรรทัด)", (snap.adjustments ?? []).length === 3, "3", String((snap.adjustments ?? []).length));

  // ── [5] เข้ารอบแล้วนับซ้ำ/แก้ไม่ได้ ──
  chk("RN-7", "🔴 รายการถูกผูกกับรอบจ่ายแล้ว (runId ไม่ว่าง)",
    (await prisma.hrPayAdjustment.count({ where: { tenantId: tid, runId: run.id } })) === 3, "3", "-");
  const cancelAfter = await pay.cancelAdjustment(ctx, ot.id!);
  chk("RN-8", "เข้ารอบจ่ายแล้วลบรายการไม่ได้", cancelAfter.ok === false, "false", JSON.stringify(cancelAfter));
  // งวดถัดไปต้องไม่ดึงรายการเดิมมาซ้ำ
  const run2 = await pay.createPayrollRun(ctx, { periodKey: "2026-09", payDate: new Date("2026-09-30") });
  const item2 = await prisma.hrPayrollItem.findFirst({ where: { runId: run2.id, employeeId: emp.id } });
  chk("RN-9", "🔴 งวดถัดไปไม่นับรายการเดิมซ้ำ (gross = เงินเดือนเปล่า)",
    item2?.grossSatang === 3_000_000 && item2?.addSatang === 0, "3000000/0",
    JSON.stringify({ gross: item2?.grossSatang, add: item2?.addSatang }));

  // ── [6] หักมากกว่าเงินเดือน ──
  const emp2 = await hr.createEmployee(ctx, { name: "ช่างหักหนัก" });
  await pay.setSalaryProfile(ctx, { employeeId: emp2.id, baseSalarySatang: 100_000, ssoEligible: false });
  const big = await pay.requestAdjustment(ctx, { employeeId: emp2.id, periodKey: "2026-10", kind: "ADVANCE", amountSatang: 500_000 });
  await pay.decideAdjustment(ctx, big.id!, "APPROVED", { userId: "user-owner", isOwner: true });
  const run3 = await pay.createPayrollRun(ctx, { periodKey: "2026-10", payDate: new Date("2026-10-31") });
  const item3 = await prisma.hrPayrollItem.findFirst({ where: { runId: run3.id, employeeId: emp2.id } });
  chk("RN-10", "🔴 หักมากกว่าเงินเดือน → จ่าย 0 (ไม่ติดลบ)", item3?.grossSatang === 0 && item3?.netSatang === 0, "0/0",
    JSON.stringify({ gross: item3?.grossSatang, net: item3?.netSatang }));

  // ── [7] ข้ามร้าน ──
  const t2 = await prisma.tenant.create({ data: { name: "QC ร้านอื่น", slug: `qc-adj2-${Date.now()}` } });
  otherTid = t2.id;
  const sys2 = await sys.createSystem(otherTid, "HR", "พนักงาน HR");
  const crossCtx = { tenantId: otherTid, systemId: sys2.id };
  const crossDecide = await pay.decideAdjustment(crossCtx, big.id!, "REJECTED", { userId: "u", isOwner: true });
  chk("XT-1", "🔴 ร้านอื่นตัดสินรายการของเราไม่ได้", crossDecide.ok === false, "false", JSON.stringify(crossDecide));
  chk("XT-2", "ร้านอื่นอ่านรายการของเราไม่เห็น", (await pay.listAdjustments(crossCtx)).length === 0, "0", String((await pay.listAdjustments(crossCtx)).length));
  const crossReq = await pay.requestAdjustment(crossCtx, { employeeId: emp.id, periodKey: "2026-08", kind: "BONUS", amountSatang: 100 });
  chk("XT-3", "ร้านอื่นยื่นรายการให้พนักงานของเราไม่ได้", crossReq.ok === false, "false", JSON.stringify(crossReq));
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e));
} finally {
  for (const id of [tid, otherTid].filter(Boolean)) {
    const del = async (n: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.log(`  ⚠ cleanup ${n}: ${err instanceof Error ? err.message.slice(0, 60) : err}`); }
    };
    for (const [n, fn] of [
      ["payrollItem", () => prisma.hrPayrollItem.deleteMany({ where: { tenantId: id } })],
      ["payrollRun", () => prisma.hrPayrollRun.deleteMany({ where: { tenantId: id } })],
      ["payAdjust", () => prisma.hrPayAdjustment.deleteMany({ where: { tenantId: id } })],
      ["salaryProfile", () => prisma.hrSalaryProfile.deleteMany({ where: { tenantId: id } })],
      ["hrEmployee", () => prisma.hrEmployee.deleteMany({ where: { tenantId: id } })],
      ["appSystem", () => prisma.appSystem.deleteMany({ where: { tenantId: id } })],
      ["auditLog", () => prisma.auditLog.deleteMany({ where: { tenantId: id } })],
      ["tenant", () => prisma.tenant.delete({ where: { id } })],
    ] as [string, () => Promise<unknown>][]) await del(n, fn);
  }
  console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: OT · คอมมิชชั่น · หักเงิน + สายอนุมัติ =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
