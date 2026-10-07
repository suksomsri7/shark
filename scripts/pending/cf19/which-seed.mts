// read-only: which acc-v2 seed tenants (from worktree expected files) exist on this QC DB · prints host + ids only
const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const ids = process.argv.slice(2);
const rows = await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
const acc = await prisma.appSystem.findMany({ where: { tenantId: { in: ids }, type: "ACCOUNT" }, select: { id: true, tenantId: true } });
const piya = await prisma.accountContact.findMany({ where: { tenantId: { in: ids }, name: "ปิยธิดา อินสุ่ม" }, select: { tenantId: true, systemId: true } });
console.log(JSON.stringify({ host: host.split("-pooler")[0], tenants: rows, accountSystems: acc, piya }));
await prisma.$disconnect();
