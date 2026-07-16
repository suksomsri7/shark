// QC — CRM: Lead→Prospect→Customer + Pipeline/Deal + Follow-up + forecast
// ⚠️ Oracle ของ Fable — Builder (WO-0009) ห้ามแตะ
// ส่วน RULES (สมอง) = Fable เขียน → เขียวตั้งแต่ต้น · ส่วน SVC (service) = Builder → fail-before แดง
try { process.loadEnvFile(".env"); } catch { /* CI */ }
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const rules = await import("@/lib/modules/crm/rules");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const checks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, name: string, ok: boolean, exp: string, act: string, sev: Sev = "CRITICAL") => {
  checks.push({ id, ok, exp, act, sev }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — exp ${exp} | act ${act}`}`);
};

// ── ส่วนที่ 1: RULES (สมอง — pure, เขียวตั้งแต่ต้น) ──
console.log("── RULES: กติกา CRM (pure) ──");
chk("CR-R.1", "default pipeline 5 ขั้น + มี WON/LOST", rules.DEFAULT_PIPELINE.stages.length === 5 && rules.DEFAULT_PIPELINE.stages.some((s) => s.kind === "WON") && rules.DEFAULT_PIPELINE.stages.some((s) => s.kind === "LOST"), "5+WON+LOST", String(rules.DEFAULT_PIPELINE.stages.length));
const now = new Date("2026-07-16T00:00:00Z");
chk("CR-R.2", "ย้ายเข้า OPEN → closedAt null", rules.dealStateForStage("OPEN", now).closedAt === null, "null", String(rules.dealStateForStage("OPEN", now).closedAt));
chk("CR-R.3", "ย้ายเข้า WON → closedAt ตั้งเวลา", rules.dealStateForStage("WON", now).closedAt?.getTime() === now.getTime(), "ตั้งเวลา", String(rules.dealStateForStage("WON", now).closedAt));
chk("CR-R.4", "lifecycle เดินหน้า LEAD→PROSPECT ได้", rules.canAdvanceLifecycle("LEAD", "PROSPECT"), "true", "false");
chk("CR-R.5", "lifecycle ถอย CUSTOMER→LEAD ไม่ได้", !rules.canAdvanceLifecycle("CUSTOMER", "LEAD"), "false", "true");
chk("CR-R.6", "forecast ถ่วงน้ำหนัก (100k×60% + 50k×30% = 75k)", rules.weightedForecast([{ valueSatang: 10000000, kind: "OPEN", probability: 60 }, { valueSatang: 5000000, kind: "OPEN", probability: 30 }, { valueSatang: 9900000, kind: "WON", probability: 100 }]) === 7500000, "7500000", String(rules.weightedForecast([{ valueSatang: 10000000, kind: "OPEN", probability: 60 }, { valueSatang: 5000000, kind: "OPEN", probability: 30 }, { valueSatang: 9900000, kind: "WON", probability: 100 }])));

// ── ส่วนที่ 2: SERVICE (Builder — fail-before แดง จนกว่า crm/service.ts เสร็จ) ──
let tenantId = "";
try {
  console.log("\n── SERVICE: ประกอบระบบ CRM จริง ──");
  const svc = await import("@/lib/modules/crm/service" as string).catch(() => null);
  const t = await prisma.tenant.create({ data: { name: "QC CRM", slug: `qc-crm-${Date.now()}` } }); tenantId = t.id;
  const crmSys = await sys.createSystem(tenantId, "CRM", "CRM ทดสอบ");
  const ctx = { tenantId, systemId: crmSys.id };
  if (!svc) { chk("SVC-0", "มี src/lib/modules/crm/service.ts", false, "มี", "ยังไม่สร้าง (fail-before)", "CRITICAL"); }
  else {
    await svc.ensureCrm(ctx);
    const pls = await prisma.crmPipeline.findMany({ where: { systemId: crmSys.id }, include: { stages: true } });
    chk("SVC-1.1", "ensureCrm seed default pipeline (5 stage)", pls.length === 1 && pls[0].stages.length === 5, "1 pipe/5 stage", `${pls.length}/${pls[0]?.stages.length}`);
    chk("SVC-1.2", "ensureCrm idempotent (เรียกซ้ำไม่งอก)", (await svc.ensureCrm(ctx), (await prisma.crmPipeline.count({ where: { systemId: crmSys.id } })) === 1), "1", String(await prisma.crmPipeline.count({ where: { systemId: crmSys.id } })));

    const c = await svc.createContact(ctx, { name: "คุณสมชาย", phone: "0810000000", source: "LINE" });
    const contactId = (c as { id?: string; contactId?: string }).id ?? (c as { contactId?: string }).contactId ?? "";
    chk("SVC-2.1", "สร้าง contact = LEAD เริ่มต้น", !!contactId, "id", JSON.stringify(c).slice(0, 50));
    const c0 = await prisma.crmContact.findUnique({ where: { id: contactId } });
    chk("SVC-2.2", "contact ใหม่ lifecycle = LEAD", c0?.lifecycleStage === "LEAD", "LEAD", String(c0?.lifecycleStage));

    const stages = pls[0].stages.sort((a, b) => a.sortOrder - b.sortOrder);
    const openStage = stages.find((s) => s.kind === "OPEN")!;
    const wonStage = stages.find((s) => s.kind === "WON")!;
    const d = await svc.createDeal(ctx, { contactId, pipelineId: pls[0].id, stageId: openStage.id, title: "ขายแพ็กเกจ", valueSatang: 5000000 });
    const dealId = (d as { id?: string; dealId?: string }).id ?? (d as { dealId?: string }).dealId ?? "";
    chk("SVC-3.1", "สร้าง deal (kind = OPEN ตาม stage)", !!dealId, "id", JSON.stringify(d).slice(0, 50));
    const d0 = await prisma.crmDeal.findUnique({ where: { id: dealId } });
    chk("SVC-3.2", "deal.kind = OPEN (สำเนา stage) · closedAt null", d0?.kind === "OPEN" && d0?.closedAt === null, "OPEN/null", `${d0?.kind}/${d0?.closedAt}`);

    // ย้าย deal → WON
    await svc.moveDeal(ctx, dealId, wonStage.id);
    const d1 = await prisma.crmDeal.findUnique({ where: { id: dealId } });
    chk("SVC-4.1", "ย้ายเข้า WON → deal.kind WON + closedAt ตั้ง", d1?.kind === "WON" && d1?.closedAt !== null, "WON/ตั้ง", `${d1?.kind}/${d1?.closedAt}`);
    const c1 = await prisma.crmContact.findUnique({ where: { id: contactId } });
    chk("SVC-4.2", "deal WON → contact เลื่อนเป็น CUSTOMER", c1?.lifecycleStage === "CUSTOMER", "CUSTOMER", String(c1?.lifecycleStage));

    // follow-up
    const a = await svc.addActivity(ctx, { contactId, dealId, type: "CALL", title: "โทรติดตาม", dueAt: new Date(Date.now() + 86400000) });
    chk("SVC-5.1", "สร้าง follow-up (activity ค้าง doneAt null)", !!a, "ok", JSON.stringify(a).slice(0, 40));
    const pending = await prisma.crmActivity.count({ where: { systemId: crmSys.id, doneAt: null } });
    chk("SVC-5.2", "งานค้าง 1 รายการ", pending === 1, "1", String(pending));
    const actId = (a as { id?: string; activityId?: string }).id ?? (a as { activityId?: string }).activityId ?? "";
    await svc.completeActivity(ctx, actId);
    chk("SVC-5.3", "ปิด follow-up → ไม่มีงานค้าง", (await prisma.crmActivity.count({ where: { systemId: crmSys.id, doneAt: null } })) === 0, "0", String(await prisma.crmActivity.count({ where: { systemId: crmSys.id, doneAt: null } })));

    // forecast จาก service
    const c2 = await svc.createContact(ctx, { name: "คุณสมหญิง" });
    const cid2 = (c2 as { id?: string; contactId?: string }).id ?? (c2 as { contactId?: string }).contactId ?? "";
    await svc.createDeal(ctx, { contactId: cid2, pipelineId: pls[0].id, stageId: stages[2].id, title: "ดีล2", valueSatang: 10000000 }); // เสนอราคา 60%
    const fc = await svc.forecast(ctx);
    chk("SVC-6.1", "forecast ถ่วงน้ำหนัก = ดีล OPEN เท่านั้น (ดีล WON ไม่นับ)", typeof fc === "number" && fc === Math.round(10000000 * (stages[2].probability / 100)), String(Math.round(10000000 * (stages[2].probability / 100))), String(fc));

    // isolation: อีก tenant มองไม่เห็น
    const cross = await prisma.crmContact.count({ where: { systemId: crmSys.id, tenantId: { not: tenantId } } });
    chk("SVC-7.1", "ไม่มี contact ข้าม tenant", cross === 0, "0", String(cross));
  }
} catch (e) { chk("CRASH", "harness จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 130) : String(e)); }
finally {
  if (tenantId) { const del = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
    for (const m of ["crmActivity","crmDeal","crmStage","crmPipeline","crmContact","appSystemUnit","appSystem"])
      await del(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId } }));
    await del(() => prisma.businessUnit.deleteMany({ where: { tenantId } })); await del(() => prisma.tenant.delete({ where: { id: tenantId } }));
    console.log("[cleanup] ok"); }
  await prisma.$disconnect();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n===== QC CRM =====\nผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => c.id) }));
process.exit(failed.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
