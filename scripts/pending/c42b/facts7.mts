// READ-ONLY: persona membership role/unitAccess (c42b it4-A — emails "unmatched" gate triage)
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
for (const u of ["owner", "manager", "nok", "thana"]) {
  const m = await P.membership.findFirst({ where: { userId: E.users[u].userId, tenantId: E.tenantId }, select: { role: true, unitAccess: true } });
  console.log(u, JSON.stringify(m));
}
await prisma.$disconnect();
