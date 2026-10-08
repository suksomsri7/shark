// AI TEAM RUN · T0.0 — นับแถวต่อร้านบน QC4 (อ่านอย่างเดียว) เพื่อให้ใบถัดไปพิสูจน์ได้ว่าไม่ได้แตะร้าน seed ของ RUN อื่น
// ใช้: bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/ai-team-qc4-census.mts
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
try {
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true }, orderBy: { slug: "asc" } });
  const conv = await prisma.aiConversation.groupBy({ by: ["tenantId"], _count: { _all: true } });
  const prop = await prisma.aiProposal.groupBy({ by: ["tenantId"], _count: { _all: true } });
  const c = new Map(conv.map((r) => [r.tenantId, r._count._all]));
  const p = new Map(prop.map((r) => [r.tenantId, r._count._all]));
  // ร้านชั่วคราวของข้อสอบ (slug ลงท้ายตัวเลข/สุ่ม) มีจำนวนมาก — พิมพ์เฉพาะร้านที่มีข้อมูล AI + ยอดรวม
  console.log(`tenants=${tenants.length} aiConversation=${conv.reduce((s, r) => s + r._count._all, 0)} aiProposal=${prop.reduce((s, r) => s + r._count._all, 0)}`);
  for (const t of tenants) {
    const a = c.get(t.id) ?? 0;
    const b = p.get(t.id) ?? 0;
    if (a || b || /seed|qc-(crm|pos|hr|acc|member|kanban)-?[a-z]*$/.test(t.slug)) console.log(`${t.slug}\tconv=${a}\tprop=${b}`);
  }
} finally {
  await prisma.$disconnect();
}
