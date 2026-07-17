// QC — Payroll reversal (WO Wave2-K) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา:
// src/lib/modules/hr/payroll.ts:
//   reverseRun(ctx, runId, reason?): Promise<{ ok: boolean; note: string }>
//     — guard: run ต้อง APPROVED/PAID + มี journalEntryId · DRAFT/ไม่มี JV → ok:false
//     — claim อะตอมมิก status → REVERSED (กันกลับซ้ำ) · กลับ JV ผ่าน account facade reverseEntry(journalEntryId)
//     — reason default "กลับรายการเงินเดือนงวด <period>"
//     — idempotent: กลับซ้ำ → ok:false ไม่สร้าง reversal เบิ้ล
// src/lib/modules/account (facade) → gl.reverseEntry(ctx, entryId, reason, tx?):
//     — สร้าง entry ตรงข้าม (สลับ dr/cr) journal=REVERSAL + mark entry เดิม REVERSED (immutable)
//     — idempotent ต่อ entry (reversalOfId @unique) · งวดปิด → เลื่อนลงงวดเปิดถัดไป
// วิธี reverse ที่เลือก = reverseEntry(byId) (ใช้ HrPayrollRun.journalEntryId ตรง ๆ)
//   เหตุผล: ไม่แตะ postPayrollJV/postManualJV → cpa 107 ปลอดภัยโดยโครงสร้าง · run มี JV เดียว → byId พอดี

try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const B = (baht: number) => Math.round(baht * 100);

let tid = "";
let tid2 = "";
try {
  const svc = (await import("@/lib/modules/hr/payroll" as string)) as unknown as
    Record<string, (...a: unknown[]) => Promise<Record<string, unknown>>>;
  const hrSvc = (await import("@/lib/modules/hr/service")) as unknown as
    { createEmployee: (c: unknown, i: unknown) => Promise<{ id: string }> };

  // ── setup tenant A: HR + ACCOUNT ──
  const t = await prisma.tenant.create({ data: { name: "QC PR-REV", slug: `qc-prrev-${Date.now()}` } });
  tid = t.id;
  const hr = await sys.createSystem(tid, "HR", "คน");
  const acct = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
  const ctx = { tenantId: tid, systemId: hr.id };
  const e1 = await hrSvc.createEmployee(ctx, { name: "สมชาย" });
  const e2 = await hrSvc.createEmployee(ctx, { name: "สมหญิง" });
  await svc.setSalaryProfile(ctx, { employeeId: e1.id, baseSalarySatang: B(30000) });
  await svc.setSalaryProfile(ctx, { employeeId: e2.id, baseSalarySatang: B(15000) });

  const run = await svc.createPayrollRun(ctx, { periodKey: "2026-07", payDate: new Date("2026-07-25") });
  const runId = run.id as string;
  const ap = await svc.approveRun(ctx, runId);
  const approved = await prisma.hrPayrollRun.findUnique({ where: { id: runId } });
  const jeId = approved?.journalEntryId ?? "";
  chk("RV-0", "setup: approve → APPROVED + มี journalEntryId + Dr=Cr", (ap.ok as boolean) === true && approved?.status === "APPROVED" && !!jeId, "APPROVED+JV", JSON.stringify({ s: approved?.status, j: !!jeId }));

  // ยอด JV เดิม (Dr=Cr) ก่อนกลับ
  const jl0 = await prisma.accountJournalLine.findMany({ where: { entryId: jeId } });
  const dr0 = jl0.reduce((s, l) => s + l.debit, 0);
  const cr0 = jl0.reduce((s, l) => s + l.credit, 0);
  chk("RV-0.1", "JV เดิมสมดุล Dr=Cr>0", dr0 === cr0 && dr0 > 0, "สมดุล", `${dr0}/${cr0}`);

  // ── HAPPY: reverseRun ──
  const rev = await svc.reverseRun(ctx, runId);
  const afterRun = await prisma.hrPayrollRun.findUnique({ where: { id: runId } });
  chk("RV-1.1", "reverseRun → ok:true + run REVERSED", (rev.ok as boolean) === true && afterRun?.status === "REVERSED", "ok+REVERSED", JSON.stringify({ ok: rev.ok, s: afterRun?.status }));

  const origEntry = await prisma.accountJournalEntry.findUnique({ where: { id: jeId } });
  chk("RV-1.2", "entry เดิมถูก mark REVERSED (ไม่ลบ — immutable)", origEntry?.status === "REVERSED", "REVERSED", String(origEntry?.status));

  const revEntries = await prisma.accountJournalEntry.findMany({ where: { systemId: acct.id, reversalOfId: jeId } });
  chk("RV-1.3", "มี reversal entry 1 ใบ (journal=REVERSAL, reversalOfId=เดิม)", revEntries.length === 1 && revEntries[0]?.journal === "REVERSAL", "1×REVERSAL", JSON.stringify({ n: revEntries.length, j: revEntries[0]?.journal }));

  const revLines = revEntries[0] ? await prisma.accountJournalLine.findMany({ where: { entryId: revEntries[0].id } }) : [];
  const rdr = revLines.reduce((s, l) => s + l.debit, 0);
  const rcr = revLines.reduce((s, l) => s + l.credit, 0);
  chk("RV-1.4", "reversal สลับ dr/cr → Dr=cr0, Cr=dr0 (สมดุล)", rdr === cr0 && rcr === dr0 && rdr === rcr, "สลับ", JSON.stringify({ rdr, rcr, dr0, cr0 }));

  // ── TRIAL BALANCE: ทุกบัญชี net = 0 หลังกลับรายการ (เดิม+reversal หักกัน) ──
  const allLines = await prisma.accountJournalLine.findMany({ where: { systemId: acct.id }, select: { accountId: true, debit: true, credit: true } });
  const netByAcct = new Map<string, number>();
  for (const l of allLines) netByAcct.set(l.accountId, (netByAcct.get(l.accountId) ?? 0) + l.debit - l.credit);
  const allZero = [...netByAcct.values()].every((v) => v === 0);
  const totDr = allLines.reduce((s, l) => s + l.debit, 0);
  const totCr = allLines.reduce((s, l) => s + l.credit, 0);
  chk("RV-2.1", "trial balance: ทุกบัญชี net = 0 หลังกลับรายการ", allZero, "ทุกบัญชี=0", JSON.stringify([...netByAcct.values()]));
  chk("RV-2.2", "งบทดลองรวม Σdebit = Σcredit", totDr === totCr, `${totDr}`, `${totCr}`);

  // ── IDEMPOTENCY: กลับซ้ำ → ok:false ไม่เบิ้ล ──
  const rev2 = await svc.reverseRun(ctx, runId);
  const revEntries2 = await prisma.accountJournalEntry.findMany({ where: { systemId: acct.id, reversalOfId: jeId } });
  chk("RV-3.1", "reverseRun ซ้ำ → ok:false", (rev2.ok as boolean) === false, "false", String(rev2.ok));
  chk("RV-3.2", "ไม่สร้าง reversal เบิ้ล (ยัง 1 ใบ)", revEntries2.length === 1, "1", String(revEntries2.length));

  // ── GUARD: reverse run DRAFT (ยังไม่ลง JV) → ok:false ──
  const draft = await svc.createPayrollRun(ctx, { periodKey: "2026-08", payDate: new Date("2026-08-25") });
  const draftId = draft.id as string;
  const revDraft = await svc.reverseRun(ctx, draftId);
  const draftRow = await prisma.hrPayrollRun.findUnique({ where: { id: draftId } });
  chk("RV-4.1", "reverse run DRAFT (ไม่มี JV) → ok:false", (revDraft.ok as boolean) === false, "false", String(revDraft.ok));
  chk("RV-4.2", "run DRAFT คงสถานะ DRAFT (ไม่ถูกแตะ)", draftRow?.status === "DRAFT", "DRAFT", String(draftRow?.status));

  // ── CROSS-TENANT: ctx อีก tenant เรียก reverseRun ของ runId เดิม → ไม่พบ (ok:false) ──
  // หมายเหตุ: สิทธิ์ canViewPayroll บังคับที่ชั้น action (assertHrCan) ไม่ใช่ service —
  //   จึงทดสอบ service-level = tenant isolation (systemId scoping) แทน
  const t2 = await prisma.tenant.create({ data: { name: "QC PR-REV2", slug: `qc-prrev2-${Date.now()}` } });
  tid2 = t2.id;
  const hr2 = await sys.createSystem(tid2, "HR", "คน");
  const ctx2 = { tenantId: tid2, systemId: hr2.id };
  const revXt = await svc.reverseRun(ctx2, runId);
  chk("RV-5.1", "ต่าง tenant/system เรียก reverse runId เดิม → ไม่พบ (ok:false)", (revXt.ok as boolean) === false, "false", String(revXt.ok));
  const origStill = await prisma.hrPayrollRun.findUnique({ where: { id: runId } });
  chk("RV-5.2", "run เดิมไม่ถูกแตะจาก tenant อื่น (ยัง REVERSED)", origStill?.status === "REVERSED", "REVERSED", String(origStill?.status));

} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message}\n${e.stack?.slice(0, 300)}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  const tables = ["hrPayrollItem", "hrPayrollRun", "hrSalaryProfile", "accountJournalLine", "accountJournalEntry", "accountLedger", "accountMapping", "accountSettings", "accountDocSequence", "accountPeriod", "hrLeave", "hrAttendance", "hrEmployee", "appSystemUnit", "appSystem"];
  for (const id of [tid, tid2]) {
    if (!id) continue;
    for (const m of tables) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();

  const fail = cks.filter((c) => !c.ok);
  console.log(`\n${fail.length === 0 ? "✅ PASS" : "❌ FAIL"} — ${cks.length - fail.length}/${cks.length}`);
  if (fail.length) { console.log("ตก:", fail.map((c) => c.id).join(", ")); process.exit(1); }
}
