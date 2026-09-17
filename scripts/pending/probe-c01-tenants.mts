// controller probe C0.1 — นับร้าน QC ของชุดข้อมูลสมาชิก/CRM (ดูว่า seed สร้างร้านใหม่ทุกรอบหรือไม่)
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const rows = await prisma.tenant.findMany({ where: { slug: { contains: "member-qc" } }, select: { id: true, slug: true, createdAt: true }, orderBy: { createdAt: "asc" } });
console.log("tenants:", rows.length);
for (const r of rows) console.log(r.id, r.slug, r.createdAt.toISOString());
await prisma.$disconnect();
