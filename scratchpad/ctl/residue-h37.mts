import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const P = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any) as any;
const ts = await P.tenant.findMany({ where: { slug: { startsWith: "qc-hr-h37-" } }, select: { id: true, slug: true, createdAt: true } });
console.log("tenants", ts.map((t: any) => `${t.slug} ${t.createdAt.toISOString()}`));
for (const t of ts) {
  try { await P.$transaction(async (tx: any) => { await tx.tenant.delete({ where: { id: t.id } }); throw new Error("ROLLBACK-OK"); }); }
  catch (e: any) { console.log(t.slug, String(e?.message ?? e).replace(/\s+/g, " ").slice(0, 400)); }
}
await P.$disconnect();
