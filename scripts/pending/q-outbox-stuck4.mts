// read-only: replicate drainOnce candidate query and look at the stuck row raw (controller probe)
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const now = new Date();
const c = await P.outboxEvent.findMany({ where: { status: "PENDING", availableAt: { lte: now } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 200, select: { id: true } });
const raw = await P.$queryRawUnsafe(`select id, type, status, "availableAt", "createdAt", attempts, "idempotencyKey", now() as dbnow from "OutboxEvent" where id = 'cmujvp4l10001qakzv1mn6u5k' or ("tenantId"='cmujvozhj0000qakz0k7x805t' and status <> 'DONE')`);
console.log(JSON.stringify({ n: c.length, first: c.slice(0, 3).map((x: any) => x.id), nodeNow: now, raw }, (k, v) => typeof v === "bigint" ? String(v) : v));
process.exit(0);
