// READ-ONLY (c42b it4 phase B · run4 restore proof): the newest Customer / Party / MemberConsent rows of the QC1 tenant with their
// creation time — run4 counts after − before = +1 each (run4 window 2026-10-01T22:17Z … 2026-10-02T03:24Z); attribute them.
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const T = E.tenantId;
const since = new Date("2026-10-01T02:00:00Z");
const cus = await P.customer.findMany({ where: { tenantId: T, createdAt: { gt: since } }, orderBy: { createdAt: "asc" } });
for (const c of cus) console.log("Customer", c.id, c.createdAt.toISOString(), JSON.stringify({ name: c.name ?? c.displayName ?? c.firstName, email: c.email, phone: c.phone, partyId: c.partyId, systemId: c.systemId, source: c.source ?? c.acquisitionSource }));
const par = await P.party.findMany({ where: { tenantId: T, createdAt: { gt: since } }, orderBy: { createdAt: "asc" } });
for (const p of par) console.log("Party", p.id, p.createdAt.toISOString(), p.kind, p.name);
const mc = await P.memberConsent.findMany({ where: { tenantId: T, createdAt: { gt: since } }, orderBy: { createdAt: "asc" } }).catch(async () => P.memberConsent.findMany({ where: { tenantId: T }, orderBy: { id: "desc" }, take: 5 }));
for (const m of mc) console.log("MemberConsent", m.id, m.createdAt?.toISOString?.(), JSON.stringify({ customerId: m.customerId, channel: m.channel, purpose: m.purpose, granted: m.granted ?? m.status, source: m.source }));
for (const c of cus) {
  const links = await P.crmContact.findMany({ where: { OR: [{ memberCustomerId: c.id }, { partyId: c.partyId ?? "-" }] }, select: { id: true, name: true, createdAt: true, memberCustomerId: true } }).catch(() => []);
  console.log("  linked CRM contacts of", c.id, JSON.stringify(links));
  const au = await P.auditLog.findMany({ where: { tenantId: T, OR: [{ targetId: c.id }, { targetId: c.partyId ?? "-" }] }, orderBy: { createdAt: "asc" }, select: { action: true, actorId: true, createdAt: true, targetType: true } }).catch(() => []);
  for (const a of au) console.log("  audit", a.createdAt.toISOString(), a.action, a.targetType, a.actorId);
}
await prisma.$disconnect();
