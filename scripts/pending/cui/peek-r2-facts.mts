// CRM C4.2-fix r2 ▸ read-only facts for the round-2 UI probe (booleans/counts only) ◂
/* eslint-disable @typescript-eslint/no-explicit-any */
const accEnv = (await import("../../acc-v2-env.mts" as string)) as any;
accEnv.loadQcEnv();
const { prisma } = (await import("@/lib/core/db" as string)) as any;
const lib = (await import("../../crm-journeys/lib.mts" as string)) as any;
const env = await lib.resolveEnv(prisma);
const m = await prisma.membership.findFirst({ where: { tenantId: env.tenantId, userId: env.users.thana.userId }, select: { permissions: true, unitAccess: true } });
const memberKeys = Object.keys(m.permissions ?? {}).filter((k) => k.startsWith("member.") || k.startsWith("crm."));
const linked = await prisma.crmContact.count({ where: { systemId: env.SYS, ownerUserId: env.users.thana.userId, memberCustomerId: { not: null }, archivedAt: null, mergedIntoId: null } });
const linkedAny = await prisma.crmContact.count({ where: { systemId: env.SYS, memberCustomerId: { not: null } } });
const phuket = await prisma.teamMember.findMany({ where: { teamId: env.teams.phuket }, select: { userId: true } });
const names = phuket.map((p: any) => Object.entries(env.users).find(([, u]: any) => u.userId === p.userId)?.[0] ?? "other");
console.log(JSON.stringify({ thanaMemberKeys: memberKeys, thanaUnits: m.unitAccess, thanaLinkedContacts: linked, linkedAny, phuketMembers: names }));
await prisma.$disconnect();
