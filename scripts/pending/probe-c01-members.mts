// controller probe — หาสมาชิกที่โผล่เกินเฉลยในร้าน QC (ใครสร้าง · เมื่อไร · ที่มา)
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const t = await prisma.tenant.findFirst({ where: { slug: "siam-dive-member-qc" }, select: { id: true } });
if (!t) { console.log("no tenant"); process.exit(0); }
const rows = await prisma.customer.findMany({
  where: { tenantId: t.id },
  select: { id: true, name: true, phone: true, source: true, sourceDetail: true, createdAt: true },
  orderBy: { createdAt: "desc" }, take: 15,
});
console.log("latest 15 customers:");
for (const r of rows) console.log(r.createdAt.toISOString(), r.source, (r.name ?? "").slice(0, 24), r.phone, JSON.stringify(r.sourceDetail ?? {}).slice(0, 80));
const bySource = await prisma.customer.groupBy({ by: ["source"], where: { tenantId: t.id }, _count: true });
console.log("by source:", JSON.stringify(bySource));
console.log("total:", await prisma.customer.count({ where: { tenantId: t.id } }));
await prisma.$disconnect();
