// read-only: how deep is the PENDING queue ahead of the stuck member.created (controller probe)
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const now = new Date();
const ahead = await P.outboxEvent.count({ where: { status: "PENDING", availableAt: { lte: now }, createdAt: { lt: new Date("2026-09-27T14:13:18.060Z") } } });
const all = await P.outboxEvent.count({ where: { status: "PENDING" } });
const byType = await P.outboxEvent.groupBy({ by: ["type"], where: { status: "PENDING" }, _count: true, orderBy: { _count: { type: "desc" } }, take: 8 });
const withErr = await P.outboxEvent.count({ where: { status: "PENDING", lastError: { not: null } } });
console.log(JSON.stringify({ ahead, all, withErr, byType: byType.map((x: any) => [x.type, x._count]) }));
process.exit(0);
