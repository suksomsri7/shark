// diag (controller): ทำไม manager เปิดเรคคอร์ด contract ล่าสุดไม่ได้ — อ่านอย่างเดียว บน QC1
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
console.log("host", accEnv.loadQcEnv().host);
const { prisma } = await import("@/lib/core/db");
const OBJ = (await import("@/lib/modules/crm/objects" as string)) as Any;
const MEM = (await import("@/lib/modules/member" as string)) as Any;
const CQC = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const P = prisma as Any;
const sys = await P.appSystem.findFirst({ where: { type: "CRM", settings: { path: ["crm", "uiVersion"], equals: 2 } }, orderBy: { createdAt: "asc" } });
const recs = await P.customRecord.findMany({ where: { systemId: sys.id, object: { key: "contract" } }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, parentType: true, parentId: true, archivedAt: true, createdAt: true, createdById: true } });
console.log("sys", sys.id, "recs", recs);
const mgrEmail = CQC.users?.manager?.email;
const u = await P.user.findFirst({ where: mgrEmail ? { email: mgrEmail } : { memberships: { some: { tenantId: sys.tenantId, role: "MANAGER" } } } });
const m = await P.membership.findFirst({ where: { userId: u.id, tenantId: sys.tenantId } });
console.log("mgr", u.email, m.role);
const actor = MEM.toMemberActor(u.id, { tenantId: sys.tenantId, role: m.role, permissions: m.permissions, unitAccess: m.unitAccess, membershipId: m.id });
const ctx = { tenantId: sys.tenantId, systemId: sys.id, actorUserId: u.id };
for (const r of recs) {
  try { const x = await OBJ.records.get(ctx, actor, "contract", r.id); console.log("OK", r.id, x?.parentType); }
  catch (e: Any) { console.log("ERR", r.id, e?.code, e?.message); }
  if (r.parentType === "COMPANY" && r.parentId) console.log(" parent", await P.crmCompany.findUnique({ where: { id: r.parentId }, select: { name: true, ownerUserId: true, archivedAt: true, systemId: true, tenantId: true } }).catch((e: Any) => String(e)));
}
const P2 = (await import("@/lib/core/db")).prisma as Any;
const who = await P2.user.findUnique({ where: { id: "cmu7xtd2b000042kz5x7hxg8q" }, select: { email: true, memberships: { select: { tenantId: true, role: true, unitAccess: true } } } });
console.log("owner-of-11/12", JSON.stringify(who));
console.log("mgr unitAccess", JSON.stringify(m.unitAccess), "perms", JSON.stringify(m.permissions));
const VIS = (await import("@/lib/modules/crm/visibility" as string)) as Any;
console.log("mgr company level", await VIS.resolve(ctx, actor, "company"));
const pols = await P2.crmVisibilityPolicy?.findMany?.({ where: { tenantId: sys.tenantId } }).catch(() => "n/a");
console.log("policies", JSON.stringify(pols));
await P2.$disconnect();
