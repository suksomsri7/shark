// prints which QC branch the loaders resolve to (host prefix only) + a live row count, never the URL
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const h = accEnv.loadQcEnv().host;
const { prisma } = await import("@/lib/core/db");
const r = await prisma.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int n from "Tenant"`);
console.log(`host=${h.split(".")[0]} tenants=${r[0]?.n}`);
await prisma.$disconnect();
