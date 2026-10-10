// QC2 leftover check for the C5.5-fix12 review — throwaway tenants/users tagged qc-cf16- / qc-cf13- / qc-cf10- / qc-cf7- and
//   phone/e-mail rate buckets (`crm:contact:ident:<tenantId>:<userId>`) whose tenant no longer exists (probe artefacts — the
//   bucket table has no tenantId column, so tenant sweeps do not remove them). `--clean` deletes those orphan buckets only.
const { prisma } = await import("@/lib/core/db");
if (!/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log("QC2 only"); process.exit(1); }
const out: string[] = [];
for (const p of ["qc-cf16-", "qc-cf13-", "qc-cf10-", "qc-cf7-"]) {
  const t = await prisma.tenant.count({ where: { slug: { startsWith: p } } });
  const u = await prisma.user.count({ where: { email: { startsWith: p } } });
  out.push(`${p} tenants=${t} users=${u}`);
}
const buckets = await prisma.chatRateBucket.findMany({ where: { key: { startsWith: "crm:contact:ident:" } }, select: { key: true } });
const tids = [...new Set(buckets.map((b) => b.key.split(":")[3] ?? ""))];
const alive = new Set((await prisma.tenant.findMany({ where: { id: { in: tids } }, select: { id: true } })).map((t) => t.id));
const orphans = buckets.filter((b) => !alive.has(b.key.split(":")[3] ?? "")).map((b) => b.key);
let deleted = 0;
if (process.argv.includes("--clean") && orphans.length) deleted = (await prisma.chatRateBucket.deleteMany({ where: { key: { in: orphans } } })).count;
console.log(`LEFTOVER ${out.join(" · ")} · ident buckets ${buckets.length} (orphans ${orphans.length}${process.argv.includes("--clean") ? `, deleted ${deleted}` : ""})`);
await prisma.$disconnect();
