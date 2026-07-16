// QC — Payroll ไทย (WO-0036) · Fable oracle, Builder ห้ามแตะ · สเปคเต็ม: docs/sds/modules/future-payroll-tax.md
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา:
// src/lib/modules/hr/payroll-rules.ts (pure — oracle ยิงตรง · ตัวเลขทั้งหมดเป็นสตางค์):
//   ssoContribution(monthlySalarySatang, cfg?: {rateBp?=500, minBaseSatang?=165000, maxBaseSatang?=1500000})
//     : { baseSatang, employeeSatang, employerSatang }   // ฐาน clamp แล้วคูณอัตรา round เป็นสตางค์เต็มบาท? — ปัดเป็น "บาทเต็ม" ตามแนวสปส. (round ไปสตางค์=บาท×100)
//     ✱ กติกา oracle: employee = Math.round(clamp(base)×rate/10000 / 100) × 100 (ปัดเป็นบาทเต็ม)
//   annualTaxSatang(netIncomeSatang): number — ขั้นบันได 0-150k:0 · -300k:5% · -500k:10% · -750k:15% · -1M:20% · -2M:25% · -5M:30% · >5M:35% (ช่วงเป็นบาท — คูณ 100 เป็นสตางค์)
//   monthlyWhtSatang(input: { monthlySalarySatang, ssoEmployeeYearSatang, deductions?: { spouse?: boolean; children?: number } })
//     : number — วิธีทำให้เต็มปี: ปี=เดือน×12 → หักค่าใช้จ่าย 50% เพดาน 100,000 บาท → ลดหย่อนส่วนตัว 60,000 + คู่สมรส 60,000 + บุตร 30,000/คน + ปสส.จ่ายจริงทั้งปี (เพดาน 9,000) → annualTax ÷ 12 ปัดเป็นสตางค์ (Math.round) · ติดลบ = 0
// src/lib/modules/hr/payroll.ts (service — ctx {tenantId, systemId} ระบบ HR):
//   setSalaryProfile(ctx, { employeeId, baseSalarySatang, ssoEligible?, taxId?, deductions? }) — find→update/create (ห้าม upsert)
//   createPayrollRun(ctx, { periodKey, payDate }): Promise<{id}> — คำนวณทุก employee ที่มี profile → HrPayrollItem + ยอดรวมบน run (DRAFT)
//     · periodKey ซ้ำ → throw ไทย · ไม่มี profile เลย → throw ไทย
//   approveRun(ctx, runId): Promise<{ ok: boolean; note: string }>
//     — DRAFT→APPROVED (updateMany เงื่อนไขสถานะ — กันซ้ำ) · ถ้า tenant มีระบบ ACCOUNT: ลงบัญชีผ่าน gl.postManualJV
//       (debit: เงินเดือน gross + ปสส.นายจ้าง · credit: เงินสด/ธนาคาร net + ปสส.ค้างจ่าย(ลูกจ้าง+นายจ้าง) + ภาษีค้างจ่าย wht)
//       → เก็บ journalEntryId · ledger code ใช้ resolve จากผังบัญชี (Builder เลือก code เหมาะสมจาก coa.ts เช่น 5xxx เงินเดือน, 2xxx ค้างจ่าย — เขียน mapping ใน comment)
//     — ไม่มีระบบ ACCOUNT → APPROVED เฉย ๆ journalEntryId null + note บอก
//   markPaid(ctx, runId) — APPROVED→PAID · payslipData(ctx, runId, employeeId) — ข้อมูลใบสลิป (run+item+ชื่อพนักงาน)
// UI: หน้า Payroll ใน HrContent (หรือหน้าใหม่ /app/sys/[id]/payroll): ตาราง run + สร้างรอบ + อนุมัติ (ConfirmDialog) + จ่ายแล้ว + ลิงก์สลิปต่อคน (พิมพ์ได้แบบ WHT cert)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const B = (baht: number) => Math.round(baht * 100);

let tid = "";
try {
  const rules = (await import("@/lib/modules/hr/payroll-rules" as string).catch(() => null)) as {
    ssoContribution: (m: number, c?: Record<string, number>) => { baseSatang: number; employeeSatang: number; employerSatang: number };
    annualTaxSatang: (n: number) => number;
    monthlyWhtSatang: (i: Record<string, unknown>) => number;
  } | null;
  const svc = (await import("@/lib/modules/hr/payroll" as string).catch(() => null)) as Record<string, (...a: never[]) => Promise<never>> | null;
  if (!rules || !svc) { chk("PR-0", "มี payroll-rules.ts + payroll.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    // ── RULES: ปสส. (vector คำนวณมือ) ──
    const s1 = rules.ssoContribution(B(20000));
    chk("PR-1.1", "ปสส. เงินเดือน 20,000 → ฐาน 15,000 · หัก 750/750", s1.baseSatang === B(15000) && s1.employeeSatang === B(750) && s1.employerSatang === B(750), "750", JSON.stringify(s1));
    chk("PR-1.2", "ปสส. 10,000 → 500", rules.ssoContribution(B(10000)).employeeSatang === B(500), "500", "?");
    chk("PR-1.3", "ปสส. 1,000 → clamp ฐาน 1,650 → 83 (ปัดบาทเต็ม)", rules.ssoContribution(B(1000)).employeeSatang === B(83), "83", String(rules.ssoContribution(B(1000)).employeeSatang / 100));
    chk("PR-1.4", "config อัตราลดได้ (3%) → 15,000 → 450", rules.ssoContribution(B(20000), { rateBp: 300 }).employeeSatang === B(450), "450", "?");

    // ── RULES: ขั้นบันไดภาษีปี (vector คำนวณมือ) ──
    chk("PR-2.1", "สุทธิ 150,000 → ภาษี 0", rules.annualTaxSatang(B(150000)) === 0, "0", "?");
    chk("PR-2.2", "สุทธิ 191,000 → 2,050 (5% ส่วนเกิน 150k)", rules.annualTaxSatang(B(191000)) === B(2050), "2050", String(rules.annualTaxSatang(B(191000)) / 100));
    chk("PR-2.3", "สุทธิ 1,031,000 → 122,750 (ครบ 5 ขั้น)", rules.annualTaxSatang(B(1031000)) === B(122750), "122750", String(rules.annualTaxSatang(B(1031000)) / 100));

    // ── RULES: ภงด.1 ต่อเดือน (annualize เต็มสาย) ──
    // เงินเดือน 30,000: ปี 360,000 − ค่าใช้จ่าย 100,000 − ส่วนตัว 60,000 − ปสส. 9,000 = สุทธิ 191,000 → ภาษีปี 2,050 → เดือน 170.83
    const w1 = rules.monthlyWhtSatang({ monthlySalarySatang: B(30000), ssoEmployeeYearSatang: B(9000) });
    chk("PR-3.1", "ภงด.1 เดือนละ 30,000 → หัก 170.83/เดือน", w1 === Math.round(B(2050) / 12), "17083", String(w1));
    chk("PR-3.2", "เงินเดือน 15,000 → ภาษี 0 (สุทธิใต้ 150k)", rules.monthlyWhtSatang({ monthlySalarySatang: B(15000), ssoEmployeeYearSatang: B(9000) }) === 0, "0", "?");
    // มีบุตร 2 → ลดหย่อนเพิ่ม 60,000: เงินเดือน 30,000 → สุทธิ 131,000 → 0
    chk("PR-3.3", "บุตร 2 คน → ลดหย่อนจนภาษี 0", rules.monthlyWhtSatang({ monthlySalarySatang: B(30000), ssoEmployeeYearSatang: B(9000), deductions: { children: 2 } }) === 0, "0", "?");

    // ── SERVICE: run lifecycle ──
    const t = await prisma.tenant.create({ data: { name: "QC PAYROLL", slug: `qc-pr-${Date.now()}` } }); tid = t.id;
    const hr = await sys.createSystem(tid, "HR", "คน");
    await sys.createSystem(tid, "ACCOUNT", "บัญชี"); // ให้ posting ทำงาน
    const hrSvc = (await import("@/lib/modules/hr/service")) as unknown as { createEmployee: (c: unknown, i: unknown) => Promise<{ id: string }> };
    const ctx = { tenantId: tid, systemId: hr.id };
    const e1 = await hrSvc.createEmployee(ctx, { name: "สมชาย" });
    const e2 = await hrSvc.createEmployee(ctx, { name: "สมหญิง" });
    const svcW = svc as unknown as Record<string, (...a: unknown[]) => Promise<Record<string, unknown>>>;
    await svcW.setSalaryProfile(ctx, { employeeId: e1.id, baseSalarySatang: B(30000) });
    await svcW.setSalaryProfile(ctx, { employeeId: e2.id, baseSalarySatang: B(15000) });
    const run = await svcW.createPayrollRun(ctx, { periodKey: "2026-07", payDate: new Date("2026-07-25") });
    const items = await prisma.hrPayrollItem.findMany({ where: { runId: run.id as string } });
    const it1 = items.find((i) => i.employeeId === e1.id);
    chk("PR-4.1", "run สร้าง item ครบ 2 คน", items.length === 2, "2", String(items.length));
    chk("PR-4.2", "สมชาย 30,000: ปสส. 750 · ภงด.1 170.83 · สุทธิ 29,079.17", it1?.ssoEmployeeSatang === B(750) && it1?.whtSatang === 17083 && it1?.netSatang === B(30000) - B(750) - 17083, "ตรง", JSON.stringify({ s: it1?.ssoEmployeeSatang, w: it1?.whtSatang, n: it1?.netSatang }));
    const runRow = await prisma.hrPayrollRun.findUnique({ where: { id: run.id as string } });
    chk("PR-4.3", "ยอดรวม run = ผลรวม items", runRow?.totalNetSatang === items.reduce((s, i) => s + i.netSatang, 0) && runRow?.totalGrossSatang === B(45000), "ตรง", "?");
    let threw = false; try { await svcW.createPayrollRun(ctx, { periodKey: "2026-07", payDate: new Date() }); } catch { threw = true; }
    chk("PR-4.4", "periodKey ซ้ำ → throw ไทย", threw, "throw", "?");

    const ap = await svcW.approveRun(ctx, run.id);
    const runAfter = await prisma.hrPayrollRun.findUnique({ where: { id: run.id as string } });
    chk("PR-5.1", "approve → APPROVED + ลงบัญชี (journalEntryId มี)", (ap.ok as boolean) === true && runAfter?.status === "APPROVED" && !!runAfter?.journalEntryId, "APPROVED+JV", JSON.stringify({ s: runAfter?.status, j: !!runAfter?.journalEntryId }));
    if (runAfter?.journalEntryId) {
      const jl = await prisma.accountJournalLine.findMany({ where: { entryId: runAfter.journalEntryId } });
      const dr = jl.reduce((s, l) => s + l.debit, 0); const cr = jl.reduce((s, l) => s + l.credit, 0);
      chk("PR-5.2", "JV สมดุล + debit = gross+ปสส.นายจ้าง", dr === cr && dr === B(45000) + (runRow?.totalSsoEmployerSatang ?? 0), "สมดุล", `${dr}/${cr}`);
    }
    chk("PR-5.3", "approve ซ้ำ → ok:false ไม่เบิ้ล JV", ((await svcW.approveRun(ctx, run.id)).ok as boolean) === false, "false", "?");
    chk("PR-5.4", "markPaid → PAID", ((await svcW.markPaid(ctx, run.id)) as { ok?: boolean }).ok !== false && (await prisma.hrPayrollRun.findUnique({ where: { id: run.id as string } }))?.status === "PAID", "PAID", "?");
    const slip = await svcW.payslipData(ctx, run.id, e1.id);
    chk("PR-6.1", "payslipData มีชื่อพนักงาน+ตัวเลขครบ", JSON.stringify(slip).includes("สมชาย"), "มี", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["hrPayrollItem", "hrPayrollRun", "hrSalaryProfile", "accountJournalLine", "accountJournalEntry", "accountLedger", "accountMapping", "accountSettings", "accountDocSequence", "hrLeave", "hrAttendance", "hrEmployee", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Payroll ไทย =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
