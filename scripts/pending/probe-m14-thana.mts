const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const { readFileSync } = await import("node:fs");
const E = JSON.parse(readFileSync("scripts/member-expected.json", "utf8"));
const P = prisma as any; // eslint-disable-line
const ms = await P.membership.findMany({ where: { tenantId: E.tenantId }, select: { role: true, unitAccess: true, permissions: true, user: { select: { email: true } } } });
for (const m of ms) if (/thana|kata/.test(m.user.email)) console.log(m.user.email, m.role, JSON.stringify(m.unitAccess), JSON.stringify(m.permissions));
const tm = await P.teamMember.findMany({ where: { tenantId: E.tenantId }, select: { userId: true, team: { select: { name: true, unitIds: true } } } });
console.log("teams", JSON.stringify(tm).slice(0, 600));
await prisma.$disconnect();
