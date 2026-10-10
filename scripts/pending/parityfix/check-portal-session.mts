// @ts-nocheck — lane check (read-only)
const env = await import("../../acc-v2-env.mts"); const { host } = env.loadQcEnv(); if (!host.includes("ep-plain-art")) throw new Error("not QC1");
const { prisma } = await import("@/lib/core/db");
const rows = await prisma.portalSession.findMany({ take: 5 });
console.log("PS " + JSON.stringify(rows.map((r) => ({ createdAt: r.createdAt, expiresAt: r.expiresAt, userAgent: r.userAgent, accessId: r.accessId ?? r.portalAccessId ?? null, tenantId: r.tenantId ?? null }))));
await prisma.$disconnect();
