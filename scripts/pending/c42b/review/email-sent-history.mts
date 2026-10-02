// READ-ONLY (C4.2 re-review after run5): every crm.email.sent outbox event of the CRM QC tenant by hour — did earlier passes
// (run3/run4/dbg) also submit the composer? (OutboxEvent is append-only; the restore never deletes it)
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const rows = await P.outboxEvent.findMany({ where: { tenantId: E.tenantId, type: "crm.email.sent" }, select: { createdAt: true }, orderBy: { createdAt: "asc" } });
const by = new Map<string, number>();
for (const r of rows) { const k = r.createdAt.toISOString().slice(0, 13); by.set(k, (by.get(k) ?? 0) + 1); }
console.log(`crm.email.sent events of tenant: ${rows.length}`);
for (const [k, n] of by) console.log(`  ${k}h ×${n}`);
await prisma.$disconnect();
