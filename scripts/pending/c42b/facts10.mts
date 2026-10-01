// READ-ONLY (c42b it4 phase B · run3 triage): (1) contact-only OPEN activities per owner/team — `activity-row-contact-link` renders only for an
// activity with NO deal (ActivityItems.tsx:101-108); (2) do nok/thana hold crm.company.read (the /contacts/new company picker searches via companyWhere).
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const { toMemberActor } = (await import("@/lib/modules/member/access" as string)) as any;
const { crmCan } = (await import("@/lib/modules/crm/access" as string)) as any;
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const S = E.systemId;
const users: Record<string, string> = {};
for (const u of ["owner", "manager", "nok", "thana"]) users[E.users[u].userId] = u;
const tm = await P.teamMember.findMany({ where: { userId: { in: Object.keys(users) } }, select: { userId: true, teamId: true } });
for (const u of ["owner", "manager", "nok", "thana"]) {
  const uid = E.users[u].userId;
  const m = await P.membership.findFirst({ where: { userId: uid, tenantId: E.tenantId }, select: { role: true, unitAccess: true, permissions: true } });
  const a = toMemberActor(uid, m);
  const keys = ["crm.company.read", "crm.contact.create", "crm.contact.update", "crm.contact.export", "crm.activity.read"].map((k) => `${k}=${(() => { try { return crmCan(a, k); } catch (e) { return "ERR"; } })()}`);
  console.log(u, m.role, "teams", tm.filter((t: any) => t.userId === uid).map((t: any) => t.teamId.slice(-6)).join(","), keys.join(" "));
}
const acts = await P.crmActivity.findMany({ where: { systemId: S, doneAt: null, dealId: null, contactId: { not: null } }, select: { id: true, ownerUserId: true, type: true, dueAt: true, contactId: true, title: true } });
console.log("open contact-only activities:", acts.length);
for (const x of acts.slice(0, 40)) {
  const c = await P.crmContact.findUnique({ where: { id: x.contactId }, select: { ownerUserId: true, teamId: true, archivedAt: true } }).catch(() => null);
  console.log(" ", x.id.slice(-8), x.type, x.dueAt?.toISOString?.() ?? "-", "actOwner", users[x.ownerUserId] ?? x.ownerUserId?.slice(-6), "contactOwner", users[c?.ownerUserId] ?? c?.ownerUserId?.slice(-6), "contactTeam", c?.teamId?.slice(-6), c?.archivedAt ? "archived" : "", (x.title ?? "").slice(0, 40));
}
const pend = await P.crmActivity.groupBy({ by: ["ownerUserId"], where: { systemId: S, doneAt: null }, _count: true });
console.log("open activities by owner:", pend.map((g: any) => `${users[g.ownerUserId] ?? g.ownerUserId?.slice(-6)}=${g._count}`).join(" "));
await prisma.$disconnect();
