// READ-ONLY (c42b it6): the still-PENDING events (availableAt = claimed by a drain or not) + the last DONE events before them
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const pend = await P.outboxEvent.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { type: true, createdAt: true, availableAt: true, attempts: true, systemId: true } });
for (const r of pend) console.log("PENDING", r.type, "created", r.createdAt.toISOString().slice(11, 23), "availableAt", r.availableAt.toISOString().slice(11, 23), `att=${r.attempts}`);
const last = await P.outboxEvent.findMany({ where: { status: "DONE" }, orderBy: { processedAt: "desc" }, take: 8, select: { type: true, createdAt: true, processedAt: true } });
for (const r of last) console.log("DONE", r.type, "created", r.createdAt.toISOString().slice(11, 19), "processed", r.processedAt?.toISOString().slice(11, 19));
console.log("now", new Date().toISOString().slice(11, 19));
await prisma.$disconnect();
