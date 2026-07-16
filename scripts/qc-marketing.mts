// QC — Marketing: แคมเปญ + เซกเมนต์ + audience · Fable oracle, Builder ห้ามแตะ
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const rules = await import("@/lib/modules/marketing/rules");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const now = new Date("2026-08-01T00:00:00Z");
// RULES
chk("MK-R.1", "tier PLATINUM match", rules.matchesSegment({ tier: "PLATINUM", totalSpentSatang: 0, lastVisitAt: null }, { tier: "PLATINUM" }, now), "true", "?");
chk("MK-R.2", "minSpent 100k: จ่าย 50k ไม่ผ่าน", !rules.matchesSegment({ tier: "MEMBER", totalSpentSatang: 5000000, lastVisitAt: null }, { minSpentSatang: 10000000 }, now), "false", "?");
chk("MK-R.3", "inactive 30 วัน: มาเมื่อวาน ไม่ผ่าน · ไม่เคยมา ผ่าน", !rules.matchesSegment({ tier: "M", totalSpentSatang: 0, lastVisitAt: new Date("2026-07-31") }, { inactiveDays: 30 }, now) && rules.matchesSegment({ tier: "M", totalSpentSatang: 0, lastVisitAt: null }, { inactiveDays: 30 }, now), "false/true", "?");
let tid = "";
try {
  const svc = await import("@/lib/modules/marketing/service" as string).catch(() => null);
  const t = await prisma.tenant.create({ data: { name: "QC MKT", slug: `qc-mkt-${Date.now()}` } }); tid = t.id;
  const memSys = await sys.createSystem(tid, "MEMBER", "สมาชิก");
  const s = await sys.createSystem(tid, "MARKETING", "การตลาด"); const ctx = { tenantId: tid, systemId: s.id };
  // seed ลูกค้า 3 คน (2 PLATINUM)
  await prisma.customer.createMany({ data: [
    { tenantId: tid, memberSystemId: memSys.id, name: "A", tier: "PLATINUM", totalSpentSatang: 20000000 },
    { tenantId: tid, memberSystemId: memSys.id, name: "B", tier: "PLATINUM", totalSpentSatang: 15000000 },
    { tenantId: tid, memberSystemId: memSys.id, name: "C", tier: "MEMBER", totalSpentSatang: 100000 },
  ] });
  if (!svc) { chk("MK-0", "มี marketing/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const c = await svc.createCampaign(ctx, { name: "โปร PLATINUM", channel: "LINE", message: "ส่วนลด 20%", segment: { tier: "PLATINUM" }, memberSystemId: memSys.id });
    const campId = (c as { id?: string }).id ?? "";
    chk("MK-1.1", "สร้างแคมเปญ DRAFT", (await prisma.mktCampaign.findUnique({ where: { id: campId } }))?.status === "DRAFT", "DRAFT", "?");
    const prev = await svc.previewAudience(ctx, campId);
    chk("MK-2.1", "preview audience = 2 (PLATINUM เท่านั้น)", (prev as { count?: number }).count === 2 || prev === 2, "2", JSON.stringify(prev).slice(0, 30));
    const sent = await svc.sendCampaign(ctx, campId);
    chk("MK-3.1", "ส่งแคมเปญ → SENT + audienceCount 2", (await prisma.mktCampaign.findUnique({ where: { id: campId } }))?.status === "SENT", "SENT", "?");
    chk("MK-3.2", "เกิด MktRecipient 2 ราย (freeze contact)", (await prisma.mktRecipient.count({ where: { campaignId: campId } })) === 2, "2", String(await prisma.mktRecipient.count({ where: { campaignId: campId } })));
    await svc.sendCampaign(ctx, campId).catch(() => {});
    chk("MK-3.3", "ส่งซ้ำไม่เพิ่มผู้รับ (idempotent)", (await prisma.mktRecipient.count({ where: { campaignId: campId } })) === 2, "2", String(await prisma.mktRecipient.count({ where: { campaignId: campId } })));
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 120) : String(e)); }
finally { if (tid) { const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const m of ["mktRecipient", "mktCampaign", "customer", "memberActivity", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
  await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect(); }
const f = cks.filter((c) => !c.ok); console.log(`\n===== QC Marketing =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) }));
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
