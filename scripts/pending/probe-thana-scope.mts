const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const { readFileSync } = await import("node:fs");
const E = JSON.parse(readFileSync("scripts/member-expected.json", "utf8"));
const tid = E.tenantId ?? E.tenant?.id;
const ms = await prisma.membership.findMany({ where: { tenantId: tid }, select: { role: true, unitAccess: true, permissions: true, user: { select: { email: true } } } });
for (const m of ms) console.log(m.user.email, m.role, JSON.stringify(m.unitAccess), Object.keys((m.permissions ?? {}) as object).length);
await prisma.$disconnect();
