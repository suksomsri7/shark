// C5.4-N REVIEW round 2 — read-only: `_prisma_migrations` rows of this card + function config on QC2 (QC2 only)
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
try {
  console.log(`rows: ${j(await P.$queryRawUnsafe(`SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, logs IS NOT NULL AS has_logs FROM "_prisma_migrations" WHERE migration_name LIKE '202611%' ORDER BY migration_name`))}`);
  console.log(`unfinished/rolled back (any): ${j(await P.$queryRawUnsafe(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`))}`);
  console.log(`functions: ${j(await P.$queryRawUnsafe(`SELECT p.proname, p.proconfig::text AS cfg, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'account_jno%' OR p.proname LIKE 'account_%journal_no') ORDER BY 1`))}`);
  console.log(`acc_jno sequences: ${j(await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relkind='S' AND relname LIKE 'acc_jno_%'`))}`);
} finally { await prisma.$disconnect(); }
