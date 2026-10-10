// backfill-revoke-ended-portal.mts — CRM C5.4-B (L1-M2 · reviewer note g)
// Portal accesses whose company link already ENDED before the fix (CrmCompanyContact.endedAt set, CrmPortalAccess.revokedAt null)
// are revoked the same way `companies.removeContact` now does it: access.revokedAt + inviteTokenHash null · its live PortalSessions
// revoked · one AuditLog `crm.portal.revoke` (reason "ผู้ติดต่อออกจากบริษัทนี้แล้ว (backfill C5.4-B)") per access.
// The read gates already refuse such accesses since C5.4-B (portalAccessUsable / OTP lookup require endedAt null) — this only
// makes the rows say so (staff list shows REVOKED instead of ACTIVE).
// Default = DRY RUN (prints counts per tenant, writes nothing). `--apply` writes. `--tenant=<id>` limits to one tenant.
// 🔴 prod run = owner's decision (C6.2 list). Run: bash scripts/qc2.sh pnpm exec tsx scripts/pending/c54b/backfill-revoke-ended-portal.mts [--apply]
const APPLY = process.argv.includes("--apply");
const TENANT = (process.argv.find((a) => a.startsWith("--tenant=")) ?? "").slice("--tenant=".length) || null;
const { prisma } = await import("@/lib/core/db");
console.log(`[backfill-revoke-ended-portal] host=${new URL(String(process.env.DATABASE_URL)).host} mode=${APPLY ? "APPLY" : "DRY-RUN"}${TENANT ? ` tenant=${TENANT}` : ""}`);
type Row = { id: string; tenantId: string; companyId: string; contactId: string; sessions: number };
const rows = (await prisma.$queryRawUnsafe(
  `SELECT a."id", a."tenantId", a."companyId", a."contactId",
          (SELECT count(*)::int FROM "PortalSession" s WHERE s."portalAccessId" = a."id" AND s."revokedAt" IS NULL) AS "sessions"
     FROM "CrmPortalAccess" a
     JOIN "CrmCompanyContact" l ON l."companyId" = a."companyId" AND l."contactId" = a."contactId" AND l."tenantId" = a."tenantId"
    WHERE a."revokedAt" IS NULL AND l."endedAt" IS NOT NULL ${TENANT ? `AND a."tenantId" = $1` : ""}
    ORDER BY a."tenantId", a."id"`,
  ...(TENANT ? [TENANT] : []),
)) as Row[];
const perTenant = new Map<string, { accesses: number; sessions: number }>();
for (const r of rows) {
  const c = perTenant.get(r.tenantId) ?? { accesses: 0, sessions: 0 };
  c.accesses += 1;
  c.sessions += r.sessions;
  perTenant.set(r.tenantId, c);
}
console.log(`accesses=${rows.length} liveSessions=${rows.reduce((n, r) => n + r.sessions, 0)} tenants=${perTenant.size}`);
for (const [t, c] of perTenant) console.log(`  tenant ${t}: accesses=${c.accesses} sessions=${c.sessions}`);
if (APPLY) {
  let done = 0;
  for (const r of rows) {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      // re-check inside the tx (a concurrent re-add restores endedAt = null ⇒ leave that access alone)
      const link = await tx.crmCompanyContact.findFirst({ where: { tenantId: r.tenantId, companyId: r.companyId, contactId: r.contactId }, select: { endedAt: true } });
      if (!link?.endedAt) return;
      const up = await tx.crmPortalAccess.updateMany({ where: { id: r.id, revokedAt: null }, data: { revokedAt: now, inviteTokenHash: null } });
      if (up.count !== 1) return;
      const s = await tx.portalSession.updateMany({ where: { portalAccessId: r.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.auditLog.create({ data: { tenantId: r.tenantId, actorType: "SYSTEM", actorId: null, action: "crm.portal.revoke", targetType: "CrmPortalAccess", targetId: r.id, after: { sessionsRevoked: s.count, reason: "ผู้ติดต่อออกจากบริษัทนี้แล้ว (backfill C5.4-B)" } } });
      done += 1;
    });
  }
  console.log(`revoked=${done}`);
}
await prisma.$disconnect();
