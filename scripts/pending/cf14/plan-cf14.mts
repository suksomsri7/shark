// C5.5-G2 storage decision — query plans on QC3 (read-only: EXPLAIN ANALYZE of SELECTs only).
//   A = chosen: creator embedded in AiConversation.id → the mobile list / web "latest" = one query on the existing (tenantId, updatedAt) index
//   B = rejected alternative: AuditLog row `ai.conversation.created` per conversation → creator lookup has no index on (action, actorId) or targetId
// Run: bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf14/plan-cf14.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-weathered-river/.test(host) || !/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.log(`QC3 only — got ${host}`);
  process.exit(1);
}
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const one = async (sql: string) => ((await P.$queryRawUnsafe(sql)) as Any[])[0];
// QC3 is tiny (seq scans win) — each query is also explained with seq scans disabled (SET LOCAL, inside one read-only
//   transaction) to show which index a production-sized table would use and what it has to walk.
const plan = async (label: string, sql: string, ...args: unknown[]) => {
  const rows = (await P.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`, ...args)) as Any[];
  console.log(`\n── ${label}\n${rows.map((r) => r["QUERY PLAN"]).join("\n")}`);
  const forced = (await P.$transaction(async (tx: Any) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
    return tx.$queryRawUnsafe(`EXPLAIN (FORMAT TEXT) ${sql}`, ...args);
  })) as Any[];
  console.log(`   [index plan, seqscan off]\n   ${forced.map((r) => r["QUERY PLAN"]).join("\n   ")}`);
};
try {
  console.log("rows:", JSON.stringify({
    AiConversation: (await one(`SELECT count(*)::int n FROM "AiConversation"`)).n,
    AuditLog: (await one(`SELECT count(*)::int n FROM "AuditLog"`)).n,
  }));
  const top = await one(`SELECT "tenantId", count(*)::int n FROM "AiConversation" GROUP BY 1 ORDER BY 2 DESC LIMIT 1`);
  const topAudit = await one(`SELECT "tenantId", count(*)::int n FROM "AuditLog" WHERE "tenantId" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1`);
  console.log("busiest tenant (conversations):", JSON.stringify(top), " busiest tenant (audit rows):", JSON.stringify(topAudit));
  const idx = (await P.$queryRawUnsafe(`SELECT tablename, indexdef FROM pg_indexes WHERE tablename IN ('AiConversation','AuditLog') ORDER BY 1`)) as Any[];
  for (const i of idx) console.log(`index ${i.tablename}: ${i.indexdef}`);
  const T = String(top?.tenantId ?? "none");
  const TA = String(topAudit?.tenantId ?? "none");
  // A — chosen (the SQL Prisma emits for listConversations of a STAFF / of an OWNER)
  await plan("A1 mobile list, member (own rooms)", `SELECT "id","title","updatedAt","lastReadAt" FROM "AiConversation" WHERE "tenantId" = $1 AND "deletedAt" IS NULL AND "id" LIKE $2 ORDER BY "updatedAt" DESC LIMIT 100`, T, "u~cqcuserxxxxxxxxxxxxxxxxx~%");
  await plan("A2 mobile list, OWNER (own + not created by a member)", `SELECT "id","title","updatedAt","lastReadAt" FROM "AiConversation" WHERE "tenantId" = $1 AND "deletedAt" IS NULL AND ("id" LIKE $2 OR NOT "id" LIKE 'u~%') ORDER BY "updatedAt" DESC LIMIT 100`, T, "u~cqcuserxxxxxxxxxxxxxxxxx~%");
  await plan("A3 open by id (any door)", `SELECT * FROM "AiConversation" WHERE "tenantId" = $1 AND "id" = $2 LIMIT 1`, T, "u~cqcuserxxxxxxxxxxxxxxxxx~0123456789abcdef01234567");
  // B — rejected: creator from AuditLog (one lookup per list, batch by actor)
  await plan("B1 AuditLog: conversations created by a member (list page)", `SELECT "targetId" FROM "AuditLog" WHERE "tenantId" = $1 AND "action" = 'ai.conversation.created' AND "actorId" = $2`, TA, "cqcuserxxxxxxxxxxxxxxxxx");
  await plan("B2 AuditLog: creator of one conversation (every open/continue)", `SELECT "actorId" FROM "AuditLog" WHERE "action" = 'ai.conversation.created' AND "targetId" = $1 LIMIT 1`, "cqcconvxxxxxxxxxxxxxxxxx");
} finally {
  await prisma.$disconnect();
}
