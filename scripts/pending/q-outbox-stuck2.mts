// read-only: non-DONE member.* outbox rows grouped by tenant + latest ones (controller probe)
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const g = await P.outboxEvent.groupBy({ by: ["tenantId", "type", "status"], where: { status: { not: "DONE" }, type: { startsWith: "member." } }, _count: true, _max: { createdAt: true } });
console.log(JSON.stringify(g.map((x: any) => [x.tenantId, x.type, x.status, x._count, x._max.createdAt]), null, 0));
const recent = await P.outboxEvent.findMany({ where: { status: { not: "DONE" }, type: { startsWith: "member." }, createdAt: { gt: new Date(Date.now() - 3 * 3600e3) } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, type: true, tenantId: true, createdAt: true, availableAt: true, lockedAt: true, payload: true } }).catch((e: any) => String(e));
console.log(JSON.stringify(recent, null, 0).slice(0, 2500));
const t = await P.tenant.findMany({ where: { id: { in: [...new Set(g.map((x: any) => x.tenantId))] } }, select: { id: true, slug: true, createdAt: true } });
console.log(JSON.stringify(t));
process.exit(0);
