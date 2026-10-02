// READ-ONLY (c42b it5 · RV-9 outbox): PENDING OutboxEvent rows of the QC1 tenant — type, age, attempts, availableAt, lastError
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const rows = await P.outboxEvent.findMany({ where: { tenantId: E.tenantId, status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { id: true, type: true, createdAt: true, availableAt: true, attempts: true, lastError: true } });
console.log("PENDING", rows.length);
const by = new Map<string, any[]>(); for (const r of rows) by.set(r.type, [...(by.get(r.type) ?? []), r]);
for (const [t, rs] of by) console.log(t, rs.length, "oldest", rs[0].createdAt.toISOString(), "newest", rs[rs.length - 1].createdAt.toISOString(), "attempts", [...new Set(rs.map((x: any) => x.attempts))].join(","), "availableAt≤now", rs.filter((x: any) => x.availableAt <= new Date()).length, "err", String(rs[0].lastError ?? "").slice(0, 80));
const st = await P.outboxEvent.groupBy({ by: ["status"], where: { tenantId: E.tenantId, createdAt: { gte: new Date(Date.now() - 6 * 3600_000) } }, _count: true });
console.log("last 6h by status", JSON.stringify(st));
await prisma.$disconnect();
