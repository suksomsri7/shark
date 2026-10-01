// C4.2 it4 (c42b) — READ-ONLY facts about QC1 for the registry sweep + persona fixtures. Never writes.
// run: pnpm exec tsx scripts/pending/c42b/facts.mts   (loads .env.qc through acc-v2-env — never .env)
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const h = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync(process.env.CRM_EXPECTED_PATH ?? "scripts/crm-expected.json", "utf8"));
const S = E.systemId, T = E.tenantId;
console.log("host", h.host, "tenant", T, "sys", S);
const users: Record<string, string> = Object.fromEntries(Object.entries(E.users ?? {}).map(([k, v]: any) => [k, v.userId]));
console.log("users", JSON.stringify(users));
for (const [k, uid] of Object.entries(users)) {
  const m = await P.membership.findFirst({ where: { userId: uid, tenantId: T }, select: { role: true, permissions: true, unitAccess: true } });
  const crmKeys = m ? Object.entries(m.permissions ?? {}).filter(([kk, v]) => kk.startsWith("crm.") && v === true).map(([kk]) => kk) : null;
  const tm = await P.teamMember.findMany({ where: { userId: uid, tenantId: T }, select: { teamId: true, role: true, team: { select: { name: true, archivedAt: true } } } });
  console.log("member", k, m?.role, JSON.stringify(crmKeys), "teams", JSON.stringify(tm.map((x: any) => [x.team.name, x.role, !!x.team.archivedAt])));
}
console.log("policies", JSON.stringify(await P.crmVisibilityPolicy.findMany({ where: { tenantId: T, systemId: S }, select: { role: true, teamId: true, pipelineId: true, entity: true, visibility: true } })));
const sys = await P.appSystem.findUnique({ where: { id: S }, select: { settings: true } });
console.log("settings.crm.visibility", JSON.stringify(sys?.settings?.crm?.visibility ?? null), "portal", JSON.stringify(sys?.settings?.crm?.portal ?? null));
for (const [k, uid] of Object.entries(users)) {
  const deals = await P.crmDeal.groupBy({ by: ["kind"], where: { systemId: S, ownerUserId: uid, archivedAt: null }, _count: true }).catch((e: any) => String(e).slice(0, 80));
  const cts = await P.crmContact.count({ where: { systemId: S, ownerUserId: uid, archivedAt: null } });
  const cos = await P.crmCompany.count({ where: { systemId: S, ownerUserId: uid, archivedAt: null } });
  console.log("owned", k, "deals", JSON.stringify(deals), "contacts", cts, "companies", cos);
}
const withLines = await P.crmDealLine.groupBy({ by: ["dealId"], where: { tenantId: T }, _count: true });
console.log("deals with lines", withLines.length, JSON.stringify(withLines.slice(0, 5)));
const firstDeal = await P.crmDeal.findUnique({ where: { id: E.dealIds[0] }, select: { ownerUserId: true, kind: true, teamId: true } });
console.log("dealIds[0]", JSON.stringify(firstDeal));
const firstContact = await P.crmContact.findUnique({ where: { id: E.contactIds[0] }, select: { ownerUserId: true, teamId: true } }).catch(() => null);
console.log("contactIds[0]", JSON.stringify(firstContact));
const rec = await P.customRecord.findMany({ where: { tenantId: T, archivedAt: null }, select: { id: true, objectId: true, ownerUserId: true, parentId: true }, take: 50 });
console.log("records", rec.length, JSON.stringify(rec.slice(0, 6)));
const objs = await P.customObject.findMany({ where: { tenantId: T }, select: { id: true, key: true, parentEntity: true, archivedAt: true } }).catch((e: any) => String(e).slice(0, 120));
console.log("objects", JSON.stringify(objs));
console.log("sequences", await P.crmSequence.count({ where: { systemId: S } }), "emailMsgs", await P.crmEmailMessage.count({ where: { systemId: S } }));
await prisma.$disconnect();
