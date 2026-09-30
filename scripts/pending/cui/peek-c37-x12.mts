// CRM C4.2-fix ▸ read-only: why does c3.7 X1.2's "Krabi contact" open for thana? (contact of the first Krabi deal) ◂
/* eslint-disable @typescript-eslint/no-explicit-any */
const accEnv = (await import("../../acc-v2-env.mts" as string)) as any;
accEnv.loadQcEnv();
const { prisma } = (await import("@/lib/core/db" as string)) as any;
const lib = (await import("../../crm-journeys/lib.mts" as string)) as any;
const env = await lib.resolveEnv(prisma);
const kata = await prisma.user.findFirst({ where: { email: { startsWith: "mb-kata" } }, select: { id: true } });
const all = await prisma.crmDeal.findMany({ where: { tenantId: env.tenantId, systemId: env.SYS, OR: [{ teamId: env.teams.krabi }, { ownerUserId: { in: [env.users.nok.userId, kata?.id].filter(Boolean) } }] }, select: { id: true, title: true, teamId: true, ownerUserId: true, contactId: true, createdAt: true } });
const d = all.find((k: any) => k.contactId);
const c = d ? await prisma.crmContact.findFirst({ where: { id: d.contactId }, select: { ownerUserId: true, teamId: true, name: true, createdAt: true } }) : null;
const who = (id: string | null) => Object.entries(env.users).find(([, u]: any) => u.userId === id)?.[0] ?? id;
const team = (id: string | null) => (id === env.teams.krabi ? "krabi" : id === env.teams.phuket ? "phuket" : id);
console.log(JSON.stringify({ deal: d && { title: d.title, team: team(d.teamId), owner: who(d.ownerUserId), created: d.createdAt }, contact: c && { name: c.name, team: team(c.teamId), owner: who(c.ownerUserId), created: c.createdAt } }));
await prisma.$disconnect();
