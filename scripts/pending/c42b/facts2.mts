// READ-ONLY: member link of the persona contacts (c42b consent triage)
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
for (const id of ["cmuk7vevb001tuokz0se1pove", "cmuk7vltw007duokzk5d76asy"]) {
  const c = await P.crmContact.findUnique({ where: { id }, select: { name: true, memberCustomerId: true, partyId: true, convertedAt: true, ownerUserId: true } });
  const cu = c?.memberCustomerId ? await P.customer.findUnique({ where: { id: c.memberCustomerId }, select: { id: true, systemId: true, tenantId: true, partyId: true } }).catch((e: any) => String(e).slice(0, 80)) : null;
  const byParty = c?.partyId ? await P.customer.findMany({ where: { partyId: c.partyId }, select: { id: true, systemId: true } }).catch(() => []) : [];
  console.log(id, JSON.stringify(c), "customer:", JSON.stringify(cu), "customersByParty:", JSON.stringify(byParty));
}
console.log("CrmContactConsent", await P.crmContactConsent.count({ where: { tenantId: E.tenantId } }));
await prisma.$disconnect();
