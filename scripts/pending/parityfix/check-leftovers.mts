// @ts-nocheck — lane check: QC1 rows this lane could have left behind (read-only)
import { readFileSync } from "node:fs";
const env = await import("../../acc-v2-env.mts"); const { host } = env.loadQcEnv(); if (!host.includes("ep-plain-art")) throw new Error("not QC1");
const { prisma } = await import("@/lib/core/db");
const E = JSON.parse(readFileSync("scripts/crm-expected.json", "utf8"));
const sys = await prisma.appSystem.findUnique({ where: { id: E.systemId }, select: { settings: true } });
console.log("LEFTOVERS " + JSON.stringify({
  sessionsParityfix: await prisma.session.count({ where: { userAgent: { contains: "parityfix" } } }),
  dealsTagged: await prisma.crmDeal.count({ where: { tenantId: E.tenantId, title: { startsWith: "qc-pf-c1" } } }),
  portalAccess: await prisma.crmPortalAccess.count({ where: { tenantId: E.tenantId } }),
  portalSessions: await prisma.portalSession.count({}).catch(() => "n/a"),
  portalEnabled: sys?.settings?.crm?.portal?.enabled ?? null,
  portalAudit: await prisma.auditLog.count({ where: { tenantId: E.tenantId, action: { startsWith: "crm.portal." }, createdAt: { gte: new Date("2026-10-08T01:30:00Z") } } }),
}));
await prisma.$disconnect();
