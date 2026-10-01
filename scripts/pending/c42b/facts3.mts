// READ-ONLY: audit trail of the owner pick contact during dbg1 (c42b consent triage)
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const from = new Date(process.argv[2] ?? "2026-10-01T04:00:00Z"), to = new Date(process.argv[3] ?? "2026-10-01T04:12:00Z");
const rows = await P.auditLog.findMany({ where: { createdAt: { gte: from, lte: to }, OR: [{ targetId: "cmuk7vevb001tuokz0se1pove" }, { action: { startsWith: "member." } }, { action: { contains: "consent" } }] }, orderBy: { createdAt: "asc" }, select: { createdAt: true, action: true, targetType: true, targetId: true, after: true } });
for (const r of rows) console.log(r.createdAt.toISOString().slice(11, 19), r.action, r.targetType, r.targetId?.slice(-8), JSON.stringify(r.after ?? null).slice(0, 160));
await prisma.$disconnect();
