// QC2 leftover check for the C5.5-fix6 review — counts throwaway tenants/users with the qc-cf7- tag (read-only)
const { prisma } = await import("@/lib/core/db");
if (!/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log("QC2 only"); process.exit(1); }
const t = await prisma.tenant.count({ where: { slug: { startsWith: "qc-cf7-" } } });
const u = await prisma.user.count({ where: { email: { startsWith: "qc-cf7-" } } });
console.log(`LEFTOVER tenants=${t} users=${u}`);
await prisma.$disconnect();
