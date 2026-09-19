// Snapshot for the intermittent qc-member-m1.4 S3.5/S5.x red — captured BEFORE any reseed (controller rule, 19 Sep)
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const { readFileSync } = await import("node:fs");
const E = JSON.parse(readFileSync("scripts/member-expected.json", "utf8"));
const P = prisma as any; // eslint-disable-line
const SYS = E.systemId ?? E.system?.id ?? E.memberSystemId; const units = E.units;
console.log("sys", SYS, "units", JSON.stringify(units));
const kOnly = await P.customer.findFirst({ where: { memberSystemId: SYS, homeUnitId: units.kata, status: "ACTIVE", activities: { none: { unitId: units.patong } } }, orderBy: { memberCode: "desc" } });
console.log("kOnly", kOnly?.id, kOnly?.memberCode, "home", kOnly?.homeUnitId);
const acts = await P.memberActivity.findMany({ where: { customerId: kOnly?.id }, select: { module: true, type: true, unitId: true, createdAt: true, crmContactId: true, dealId: true }, orderBy: { createdAt: "desc" }, take: 20 });
console.log("activities", JSON.stringify(acts));
const allActsNoUnit = await P.memberActivity.groupBy({ by: ["module", "unitId"], where: { customerId: kOnly?.id }, _count: true });
console.log("groups", JSON.stringify(allActsNoUnit));
const cust = await P.customer.findUnique({ where: { id: kOnly?.id } });
console.log("customer fields", JSON.stringify({ unitIds: cust?.unitIds, visitUnits: cust?.visitUnitIds, source: cust?.source, partyId: cust?.partyId }));
const crm = await P.crmContact.findMany({ where: { memberCustomerId: kOnly?.id }, select: { id: true, systemId: true, teamId: true, ownerUserId: true } });
console.log("crm links", JSON.stringify(crm));
await prisma.$disconnect();
