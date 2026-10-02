// READ-ONLY (C4.2 re-review after run5): for EVERY Prisma model with tenantId + createdAt, the rows of the CRM QC tenant created
// inside a window that still exist now (= not restored) — the restore proof (counts.mts) only covers its 66 tables.
// Usage: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c42b/review/window-leftovers.mts [fromISO] [toISO]
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const { Prisma } = (await import("@prisma/client")) as any;
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const T = E.tenantId;
const from = new Date(process.argv[2] ?? "2026-10-02T13:57:00Z"), to = new Date(process.argv[3] ?? "2026-10-02T18:52:00Z");
const models = (Prisma.dmmf.datamodel.models as any[]).filter((m) => m.fields.some((f: any) => f.name === "tenantId") && m.fields.some((f: any) => f.name === "createdAt"));
console.log(`window ${from.toISOString()} → ${to.toISOString()} · ${models.length} models with tenantId+createdAt`);
for (const m of models) {
  const d = P[m.name.charAt(0).toLowerCase() + m.name.slice(1)];
  if (!d) continue;
  const n = await d.count({ where: { tenantId: T, createdAt: { gte: from, lte: to } } }).catch((e: any) => `ERR ${String(e).slice(0, 60)}`);
  if (n !== 0) console.log(`  ${m.name}: ${n}`);
}
// AuditLog actions in the window (restored? the runner says audit rows are never deleted)
const al = await P.auditLog.groupBy({ by: ["action"], where: { tenantId: T, createdAt: { gte: from, lte: to } }, _count: { _all: true } }).catch(() => []);
console.log(`AuditLog actions in window: ${al.length} kinds`);
for (const g of al.sort((a: any, b: any) => b._count._all - a._count._all).slice(0, 80)) console.log(`  ${g.action} ×${g._count._all}`);
await prisma.$disconnect();
