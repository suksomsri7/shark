// read-only: PENDING member.* outbox rows on the active QC DB (controller probe)
const { prisma } = await import("@/lib/core/db");
const rows = await (prisma as any).outboxEvent.findMany({
  where: { status: { not: "DONE" }, type: { startsWith: "member." } },
  select: { id: true, type: true, status: true, attempts: true, lastError: true, createdAt: true, availableAt: true, tenantId: true },
  orderBy: { createdAt: "desc" }, take: 20,
});
console.log(JSON.stringify(rows, null, 1));
process.exit(0);
