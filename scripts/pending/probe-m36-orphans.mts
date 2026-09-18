// Controller probe: QUEUED MemberNotification rows whose customer is not a member of that system (m3.6 ERR, 18 Sep)
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
console.log("host", accEnv.loadQcEnv().host);
const { prisma } = await import("@/lib/core/db");
const rows = await prisma.$queryRawUnsafe<{ id: string; systemId: string; customerId: string; event: string; createdAt: Date; cust_system: string | null; cust_tenant: string | null; status: string | null }[]>(`
  SELECT n.id, n."systemId", n."customerId", n.event, n."createdAt", c."memberSystemId" AS cust_system, c."tenantId" AS cust_tenant, c.status::text AS status
  FROM "MemberNotification" n LEFT JOIN "Customer" c ON c.id = n."customerId"
  WHERE n.status = 'QUEUED' AND (c.id IS NULL OR c."memberSystemId" IS DISTINCT FROM n."systemId")
  ORDER BY n."createdAt" DESC LIMIT 20`);
console.log(JSON.stringify(rows, null, 1));
await prisma.$disconnect();
