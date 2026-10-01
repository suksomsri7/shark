// READ-ONLY (c42b it4-A): C5.4-E company-lifecycle-correct rows — lifecycle + WON deals of the company each persona opens,
// and the QC1 companies that are CUSTOMER with no WON deal (candidates).
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const S = E.systemId;
const cos = await P.crmCompany.findMany({ where: { systemId: S }, select: { id: true, name: true, lifecycleStage: true, ownerUserId: true } }).catch(async () =>
  P.crmCompany.findMany({ where: { systemId: S }, select: { id: true, name: true, lifecycleStage: true, ownerUserId: true } }));
for (const c of cos) {
  const won = await P.crmDeal.count({ where: { systemId: S, companyId: c.id, kind: "WON" } }).catch((e: any) => `ERR ${String(e).slice(0, 80)}`);
  console.log(c.id, c.lifecycleStage, `won=${won}`, c.deletedAt ? "deleted" : "", c.archivedAt ? "archived" : "", c.name);
}
await prisma.$disconnect();
