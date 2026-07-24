try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const { sha256, randomToken } = await import("@/lib/core/hash");
const ts = Date.now();
const u = await prisma.user.create({ data: { email: `qc-perf-${ts}@qc.local` } });
const t = await prisma.tenant.create({ data: { name: "QC Perf", slug: `qc-perf-${ts}` } });
await prisma.membership.create({ data: { userId: u.id, tenantId: t.id, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
const token = randomToken();
await prisma.session.create({ data: { userId: u.id, tokenHash: sha256(token), idleExpiresAt: new Date(Date.now() + 3600e3), expiresAt: new Date(Date.now() + 3600e3) } });
console.log(`TOKEN=${token} UID=${u.id} TID=${t.id}`);
await prisma.$disconnect();
