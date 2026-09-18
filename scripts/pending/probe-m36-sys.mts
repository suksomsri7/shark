const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const r = await prisma.$queryRawUnsafe(`SELECT s.id, s.name, t.slug, (SELECT count(*) FROM "MemberNotification" n LEFT JOIN "Customer" c ON c.id=n."customerId" WHERE n."systemId"=s.id AND n.status='QUEUED' AND c.id IS NULL)::int AS orphans, (SELECT min(n."createdAt") FROM "MemberNotification" n LEFT JOIN "Customer" c ON c.id=n."customerId" WHERE n."systemId"=s.id AND n.status='QUEUED' AND c.id IS NULL) AS first FROM "AppSystem" s JOIN "Tenant" t ON t.id=s."tenantId" WHERE s.id IN (SELECT DISTINCT n."systemId" FROM "MemberNotification" n LEFT JOIN "Customer" c ON c.id=n."customerId" WHERE n.status='QUEUED' AND c.id IS NULL)`);
console.log(JSON.stringify(r, null, 1));
const ev = await prisma.$queryRawUnsafe(`SELECT type, count(*)::int n, min("createdAt") first FROM "OutboxEvent" WHERE "createdAt" > now() - interval '3 hours' AND type LIKE 'member.created%' GROUP BY type`);
console.log(JSON.stringify(ev));
await prisma.$disconnect();
