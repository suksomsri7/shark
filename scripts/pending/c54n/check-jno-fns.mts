// C5.4-N builder sanity probe (QC2 only): sequences created by the migration + the SQL functions on a throwaway system id (no rows written)
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host)) { console.log(`QC2 only — got ${host}`); process.exit(1); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const t0 = Date.now();
const seqs = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relkind='S' AND relname LIKE 'acc_jno_%'`)) as Any[];
const sys = (await P.$queryRawUnsafe(`SELECT count(DISTINCT "systemId")::int AS n FROM "AccountLedger"`)) as Any[];
console.log(`sequences acc_jno_* = ${seqs[0].n} · systems with a chart = ${sys[0].n} (×5 = ${sys[0].n * 5})`);
const fake = `zzc54ncheck${Date.now().toString(36)}`;
const peek0 = (await P.$queryRawUnsafe(`SELECT account_peek_journal_no($1,'GENERAL') AS n`, fake)) as Any[];
const a = (await P.$queryRawUnsafe(`SELECT account_next_journal_no($1,'GENERAL') AS n`, fake)) as Any[];
const b = (await P.$queryRawUnsafe(`SELECT account_next_journal_no($1,'GENERAL') AS n`, fake)) as Any[];
const peek1 = (await P.$queryRawUnsafe(`SELECT account_peek_journal_no($1,'GENERAL') AS n`, fake)) as Any[];
const peek2 = (await P.$queryRawUnsafe(`SELECT account_peek_journal_no($1,'GENERAL') AS n`, fake)) as Any[];
await P.$executeRawUnsafe(`SELECT account_jno_drop($1)`, fake);
const left = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relkind='S' AND relname LIKE $1`, `%${fake}%`)) as Any[];
console.log(`fake system: peek before ${peek0[0].n} · next ${a[0].n}, ${b[0].n} · peek after ${peek1[0].n}/${peek2[0].n} · left after drop ${left[0].n} · ${Date.now() - t0} ms`);
await prisma.$disconnect();
