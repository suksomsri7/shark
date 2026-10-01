// READ-ONLY: e-mail messages of the CRM system (c42b /emails/[threadKey] triage)
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const rows = await P.crmEmailMessage.findMany({ where: { systemId: E.systemId }, select: { id: true, threadKey: true, direction: true, contactId: true, dealId: true, companyId: true, createdAt: true, status: true } });
console.log(JSON.stringify(rows, null, 0));
await prisma.$disconnect();
const P2 = (await import("@/lib/core/db")).prisma as any;
console.log("contact exists:", JSON.stringify(await P2.crmContact.findUnique({ where: { id: "cmukszrsq0000amkzbz8gremx" }, select: { id: true, name: true, systemId: true, archivedAt: true } })));
await P2.$disconnect();
