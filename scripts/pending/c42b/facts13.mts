// READ-ONLY (c42b it5 · RV-4 fixture design): commission approve side effects + caps · persona HR payroll mapping · seed counts
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const hr = (await import("@/lib/modules/hr" as string)) as any;
const sys = await P.appSystem.findUnique({ where: { id: E.systemId }, select: { settings: true } });
console.log("crm.commission settings", JSON.stringify(sys?.settings?.crm?.commission ?? null));
for (const u of ["owner", "manager", "nok", "thana"]) {
  const uid = E.users[u].userId;
  const m = await P.membership.findFirst({ where: { tenantId: E.tenantId, userId: uid }, select: { role: true, permissions: true } });
  const emp = await hr.payrollEmployeeOfUser(E.tenantId, uid).catch((e: any) => `ERR ${String(e).slice(0, 80)}`);
  console.log(u, m?.role, "cap", (m?.permissions as any)?.["crm._maxCommissionApproveSatang"], "payrollEmployee", JSON.stringify(emp)?.slice(0, 80));
}
for (const m of ["crmCommissionRule", "crmCommission", "crmPortalRequest", "crmSequence", "crmSequenceEnrollment", "crmAssignmentRule"]) console.log(m, await P[m].count({ where: { tenantId: E.tenantId } }));
const unowned = await P.crmDeal.count({ where: { systemId: E.systemId, ownerUserId: null, kind: "OPEN", archivedAt: null } });
console.log("open unowned deals", unowned, "· unowned contacts", await P.crmContact.count({ where: { systemId: E.systemId, ownerUserId: null, archivedAt: null } }));
await prisma.$disconnect();
