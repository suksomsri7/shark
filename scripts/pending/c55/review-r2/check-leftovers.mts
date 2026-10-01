// C5.5-fix1 ROUND 2 review — leftover check after probe-review-r2 (QC3 only · read-only)
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-weathered-river/.test(host) || !/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.log(`QC3 only — got ${host}`);
  process.exit(1);
}
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const users = await prisma.user.count({ where: { email: { startsWith: "qc-c55-rv2-" } } });
const tenants = await prisma.tenant.count({ where: { slug: { startsWith: "qc-c55-rv2-" } } });
const sessions = await prisma.session.count({ where: { user: { email: { startsWith: "qc-c55-rv2-" } } } }).catch(() => -1);
console.log(`leftovers users=${users} tenants=${tenants} sessions=${sessions}`);
await prisma.$disconnect();
process.exit(users === 0 && tenants === 0 && sessions <= 0 ? 0 : 1);
