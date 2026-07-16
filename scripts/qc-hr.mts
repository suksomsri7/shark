// QC — HR: พนักงาน + ลงเวลา + ลา + availability (C-2) · Fable oracle, Builder ห้ามแตะ
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const rules = await import("@/lib/modules/hr/rules");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
// RULES
const lv = [{ fromDate: new Date("2026-08-01"), toDate: new Date("2026-08-03"), status: "APPROVED" }];
chk("HR-R.1", "ลา APPROVED 1-3 ส.ค. → วันที่ 2 ไม่ว่าง", !rules.isAvailable(lv, new Date("2026-08-02")), "false", "?");
chk("HR-R.2", "วันที่ 5 ส.ค. ว่าง", rules.isAvailable(lv, new Date("2026-08-05")), "true", "?");
chk("HR-R.3", "workedMinutes IN 09:00 OUT 17:00 = 480", rules.workedMinutes([{ kind: "IN", at: new Date("2026-08-01T09:00:00Z") }, { kind: "OUT", at: new Date("2026-08-01T17:00:00Z") }]) === 480, "480", String(rules.workedMinutes([{ kind: "IN", at: new Date("2026-08-01T09:00:00Z") }, { kind: "OUT", at: new Date("2026-08-01T17:00:00Z") }])));
let tid = "";
try {
  const svc = await import("@/lib/modules/hr/service" as string).catch(() => null);
  const t = await prisma.tenant.create({ data: { name: "QC HR", slug: `qc-hr-${Date.now()}` } }); tid = t.id;
  const s = await sys.createSystem(tid, "HR", "พนักงาน"); const ctx = { tenantId: tid, systemId: s.id };
  if (!svc) { chk("HR-0", "มี hr/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const e = await svc.createEmployee(ctx, { name: "สมชาย", position: "ช่าง" });
    const empId = (e as { id?: string }).id ?? "";
    chk("HR-1.1", "สร้างพนักงาน", !!empId, "id", "?");
    await svc.clock(ctx, { employeeId: empId, kind: "IN" });
    await svc.clock(ctx, { employeeId: empId, kind: "OUT" });
    chk("HR-2.1", "ลงเวลา 2 รายการ (IN/OUT)", (await prisma.hrAttendance.count({ where: { systemId: s.id, employeeId: empId } })) === 2, "2", String(await prisma.hrAttendance.count({ where: { systemId: s.id } })));
    const lreq = await svc.requestLeave(ctx, { employeeId: empId, type: "SICK", fromDate: "2026-08-01", toDate: "2026-08-03", reason: "ป่วย" });
    const leaveId = (lreq as { id?: string }).id ?? "";
    chk("HR-3.1", "ขอลา = PENDING", (await prisma.hrLeave.findUnique({ where: { id: leaveId } }))?.status === "PENDING", "PENDING", "?");
    chk("HR-3.2", "ยังไม่อนุมัติ → วันที่ 2 ยังว่าง (availability นับเฉพาะ APPROVED)", await svc.isAvailable(ctx, empId, new Date("2026-08-02")) === true, "true", "?");
    await svc.decideLeave(ctx, leaveId, "APPROVED");
    chk("HR-4.1", "อนุมัติลา → APPROVED", (await prisma.hrLeave.findUnique({ where: { id: leaveId } }))?.status === "APPROVED", "APPROVED", "?");
    chk("HR-4.2", "หลังอนุมัติ → วันที่ 2 ไม่ว่าง (C-2)", await svc.isAvailable(ctx, empId, new Date("2026-08-02")) === false, "false", "true");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 120) : String(e)); }
finally { if (tid) { const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const m of ["hrAttendance", "hrLeave", "hrEmployee", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
  await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect(); }
const f = cks.filter((c) => !c.ok); console.log(`\n===== QC HR =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) }));
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
