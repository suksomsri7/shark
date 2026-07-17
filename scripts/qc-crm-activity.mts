// QC — CRM งานติดตาม (WO Wave1-E): เพิ่ม/ดู/ปิดงานติดตาม (follow-up)
// persona: พนักงานขายสร้างงานติดตามในดีล แล้วปิดเมื่อทำเสร็จ (หัวใจ CRM)
// พิสูจน์: addActivity สร้างงานค้าง · listActivities แยก ค้าง/เสร็จ ถูก · completeActivity → เสร็จ (doneAt) · filter ตามดีล · cross-tenant scoping
// standalone-typesafe: dynamic import + wide cast

try { process.loadEnvFile(".env"); } catch { /* CI */ }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const svc = await import("@/lib/modules/crm/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; ok: boolean; exp: string; act: string; sev: Sev };
const checks: Check[] = [];
const chk = (id: string, name: string, ok: boolean, exp: string, act: string, sev: Sev = "CRITICAL") => {
  checks.push({ id, ok, exp, act, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — exp ${exp} | act ${act}`}`);
};

let tenantId = "";
let tenant2Id = "";
try {
  console.log("── setup: CRM 1 ระบบ + contact + deal ──");
  const t = await prisma.tenant.create({ data: { name: "QC CRM Act", slug: `qc-crmact-${Date.now()}` } });
  tenantId = t.id;
  const crmSys = await sys.createSystem(tenantId, "CRM", "CRM ทดสอบ");
  const ctx = { tenantId, systemId: crmSys.id };
  const pipeline = await svc.ensureCrm(ctx);
  const openStage = pipeline.stages.find((s) => s.kind === "OPEN")!;
  const c = await svc.createContact(ctx, { name: "คุณสมชาย", phone: "0810000001", source: "LINE" });
  const dealA = await svc.createDeal(ctx, { contactId: c.id, pipelineId: pipeline.id, stageId: openStage.id, title: "ดีล A", valueSatang: 5000000 });
  const dealB = await svc.createDeal(ctx, { contactId: c.id, pipelineId: pipeline.id, stageId: openStage.id, title: "ดีล B", valueSatang: 1000000 });

  console.log("\n── addActivity: สร้างงานติดตาม (ค้าง) ──");
  const a1 = await svc.addActivity(ctx, { contactId: c.id, dealId: dealA.id, type: "CALL", title: "โทรติดตาม A", dueAt: new Date(Date.now() + 86400000) });
  chk("CA-1.1", "addActivity คืน id", !!a1.id, "id", JSON.stringify(a1).slice(0, 40));
  const row1 = await prisma.crmActivity.findUnique({ where: { id: a1.id } });
  chk("CA-1.2", "งานใหม่ = ค้าง (doneAt null) + ผูกดีล A", row1?.doneAt === null && row1?.dealId === dealA.id, "null/dealA", `${row1?.doneAt}/${row1?.dealId === dealA.id}`);

  console.log("\n── listActivities: แยก ค้าง/เสร็จ ──");
  const l1 = await svc.listActivities(ctx, {});
  chk("CA-2.1", "listActivities: ค้าง 1 · เสร็จ 0", l1.pending.length === 1 && l1.done.length === 0, "1/0", `${l1.pending.length}/${l1.done.length}`);

  // เพิ่มงานที่ 2 (ดีล B) แล้วปิดงานที่ 1
  const a2 = await svc.addActivity(ctx, { contactId: c.id, dealId: dealB.id, type: "TASK", title: "ส่งใบเสนอราคา B", dueAt: null });
  console.log("\n── completeActivity: ปิดงานที่ 1 → เสร็จ ──");
  await svc.completeActivity(ctx, a1.id);
  const row1After = await prisma.crmActivity.findUnique({ where: { id: a1.id } });
  chk("CA-3.1", "completeActivity → doneAt ถูกตั้ง (เสร็จ)", row1After?.doneAt !== null, "ตั้งเวลา", String(row1After?.doneAt));

  const l2 = await svc.listActivities(ctx, {});
  chk("CA-3.2", "listActivities หลังปิด: ค้าง 1 (B) · เสร็จ 1 (A)", l2.pending.length === 1 && l2.done.length === 1 && l2.pending[0].id === a2.id && l2.done[0].id === a1.id, "1/1 (B ค้าง, A เสร็จ)", `${l2.pending.length}/${l2.done.length}`);

  console.log("\n── completeActivity idempotent: ปิดซ้ำไม่พัง ──");
  const doneAt1 = row1After?.doneAt?.getTime();
  await svc.completeActivity(ctx, a1.id);
  const row1Again = await prisma.crmActivity.findUnique({ where: { id: a1.id } });
  chk("CA-3.3", "ปิดซ้ำ ไม่เปลี่ยน doneAt เดิม (guard doneAt:null)", row1Again?.doneAt?.getTime() === doneAt1, "เท่าเดิม", `${row1Again?.doneAt?.getTime() === doneAt1}`);

  console.log("\n── filter ตามดีล ──");
  const lA = await svc.listActivities(ctx, { dealId: dealA.id });
  chk("CA-4.1", "filter dealId=A → เจอเฉพาะงานของ A (เสร็จ 1, ค้าง 0)", lA.pending.length === 0 && lA.done.length === 1 && lA.done[0].id === a1.id, "0/1 (A)", `${lA.pending.length}/${lA.done.length}`);
  const lB = await svc.listActivities(ctx, { dealId: dealB.id });
  chk("CA-4.2", "filter dealId=B → เจอเฉพาะงานของ B (ค้าง 1, เสร็จ 0)", lB.pending.length === 1 && lB.done.length === 0 && lB.pending[0].id === a2.id, "1/0 (B)", `${lB.pending.length}/${lB.done.length}`);

  console.log("\n── cross-tenant: ร้านอื่นมองไม่เห็น/ปิดไม่ได้ ──");
  const t2 = await prisma.tenant.create({ data: { name: "QC ร้านอื่น", slug: `qc-crmact2-${Date.now()}` } });
  tenant2Id = t2.id;
  const ctx2 = { tenantId: t2.id, systemId: crmSys.id }; // systemId เดียวกัน แต่ tenant คนละร้าน
  const lForeign = await svc.listActivities(ctx2, {});
  chk("CA-5.1", "ร้านอื่น listActivities ไม่เห็นงานร้านนี้", lForeign.pending.length === 0 && lForeign.done.length === 0, "0/0", `${lForeign.pending.length}/${lForeign.done.length}`);
  await svc.completeActivity(ctx2, a2.id); // พยายามปิดงานร้านอื่น
  const row2 = await prisma.crmActivity.findUnique({ where: { id: a2.id } });
  chk("CA-5.2", "ร้านอื่น completeActivity ไม่กระทบงานร้านนี้ (ยังค้าง)", row2?.doneAt === null, "null", String(row2?.doneAt));

  console.log("\n── assertCan gate: action ต้องเรียก assertCrmCan (crm.activity.*) ──");
  const { readFileSync } = await import("node:fs");
  const actSrc = readFileSync("src/lib/modules/crm/actions.ts", "utf8");
  chk("CA-6.1", "addActivityAction มี assertCrmCan crm.activity.create", /addActivityAction[\s\S]*?assertCrmCan\(auth, "crm\.activity\.create"\)/.test(actSrc), "มี", "ไม่พบ", "MAJOR");
  chk("CA-6.2", "completeActivityAction มี assertCrmCan crm.activity.complete", /completeActivityAction[\s\S]*?assertCrmCan\(auth, "crm\.activity\.complete"\)/.test(actSrc), "มี", "ไม่พบ", "MAJOR");
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? e.message.slice(0, 160) : String(e));
} finally {
  const del = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ข้าม */ } };
  for (const tid of [tenantId, tenant2Id]) {
    if (!tid) continue;
    for (const m of ["crmActivity", "crmDeal", "crmStage", "crmPipeline", "crmContact", "appSystemUnit", "appSystem"])
      await del(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  console.log("\n[cleanup] เรียบร้อย");
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
console.log("\n===== QC CRM Activity (งานติดตาม) =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${failed.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${failed.filter((c) => c.sev === "MAJOR").length} · MINOR ${failed.filter((c) => c.sev === "MINOR").length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => c.id) }));
process.exit(failed.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
