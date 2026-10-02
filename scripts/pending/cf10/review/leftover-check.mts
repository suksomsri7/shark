// QC2 leftover check for the C5.5-fix7 review — counts throwaway tenants/users tagged qc-cf10- / qc-cf7- (read-only)
const { prisma } = await import("@/lib/core/db");
if (!/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log("QC2 only"); process.exit(1); }
const out: string[] = [];
for (const p of ["qc-cf10-", "qc-cf7-"]) {
  const t = await prisma.tenant.count({ where: { slug: { startsWith: p } } });
  const u = await prisma.user.count({ where: { email: { startsWith: p } } });
  out.push(`${p} tenants=${t} users=${u}`);
}
console.log(`LEFTOVER ${out.join(" · ")}`);
await prisma.$disconnect();
