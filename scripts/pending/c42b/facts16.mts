// READ-ONLY (c42b it6 · dbg16 o-newcontact-nok reproduced 4 PENDING > 60 s in isolation): every OutboxEvent created in the window
// (all tenants, all types) with created→processed delay + status, and the queue state now (PENDING/FAILED by type, oldest)
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const from = new Date(process.argv[2] ?? "2026-10-02T19:15:00Z"), to = new Date(process.argv[3] ?? "2026-10-02T19:18:00Z");
const rows = await P.outboxEvent.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: "asc" }, select: { tenantId: true, type: true, createdAt: true, processedAt: true, attempts: true, lastError: true, status: true } });
for (const r of rows) console.log(r.tenantId.slice(-6), r.type, r.createdAt.toISOString().slice(11, 19), "→", r.processedAt?.toISOString().slice(11, 19) ?? "-", `${r.processedAt ? Math.round((r.processedAt - r.createdAt) / 1000) : "?"}s`, r.status, `att=${r.attempts}`, (r.lastError ?? "").slice(0, 80));
const g = await P.outboxEvent.groupBy({ by: ["status"], _count: { _all: true }, _min: { createdAt: true } });
console.log("queue by status:", JSON.stringify(g));
const pend = await P.outboxEvent.groupBy({ by: ["type"], where: { status: { not: "DONE" } }, _count: { _all: true }, _min: { createdAt: true } });
console.log("not DONE by type:", JSON.stringify(pend));
await prisma.$disconnect();
