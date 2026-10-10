// read-only: CRM API keys without createdById (Q16 guard cannot judge them) — count per tenant
const { prisma } = await import("@/lib/core/db");
const rows = (await prisma.$queryRawUnsafe(`
  SELECT k."tenantId", t."slug", count(*)::int AS n
    FROM "ApiKey" k JOIN "Tenant" t ON t."id" = k."tenantId"
   WHERE k."createdById" IS NULL AND k."revokedAt" IS NULL
     AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(k."scopesJson") = 'array' THEN k."scopesJson" ELSE '[]'::jsonb END) s WHERE s LIKE 'crm.%')
   GROUP BY 1, 2 ORDER BY 3 DESC`)) as { tenantId: string; slug: string; n: number }[];
console.log(`host=${new URL(String(process.env.DATABASE_URL)).host}`);
console.log(JSON.stringify(rows));
await prisma.$disconnect();
