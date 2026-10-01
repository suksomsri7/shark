// C5.4-N round 2 builder check (QC2 only, read-only except a rolled-back measurement transaction)
//   F  the account_jno_* / account_*_journal_no functions on QC2 equal the bodies + search_path of the migration files (byte-equal prosrc;
//      000001 + 000002 + 000003, later file wins — ORACLE-EDIT C5.5-fix3a r2)
//   R  _prisma_migrations rows of both folder names (round-1 name = orphan on QC2 only)
//   E  re-measure of review R2-E on the NEW SQL: lock-table entries + subtransactions per system for the migration's create path
//      (account_jno_create, 500 fake systems × 5 books, one transaction, rolled back) and, for comparison, the ensure path (100 systems)
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { readFileSync } from "node:fs";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host)) { console.log(`QC2 only — got ${host}`); process.exit(1); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
let bad = 0;
// ORACLE-EDIT C5.5-fix3a r2: the functions in force = 000001, then 000002 and 000003 (each re-defines account_alloc_journal_no; the later file wins)
const want = new Map<string, string>();
for (const f of ["20261104000001_account_journal_no_sequence", "20261104000002_account_journal_no_alloc_lock", "20261104000003_account_journal_no_alloc_lock_v2"]) {
  const sql = readFileSync(`prisma/migrations/${f}/migration.sql`, "utf8");
  for (const m of sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([^)]*\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)) want.set(m[1]!, m[2]!);
}
const have = (await P.$queryRawUnsafe(`SELECT p.proname, p.prosrc, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND (p.proname LIKE 'account_jno_%' OR p.proname LIKE 'account_%journal_no')`)) as Any[];
for (const [name, body] of want) {
  const rows = have.filter((h) => h.proname === name);
  const same = rows.length === 1 && rows[0].prosrc === body && JSON.stringify(rows[0].proconfig) === JSON.stringify(["search_path=pg_catalog, public"]);
  if (!same) bad += 1;
  console.log(`F ${same ? "✅" : "❌"} ${name}: overloads ${rows.length} · prosrc ${rows[0]?.prosrc === body ? "equal" : "DIFFERENT"} · config ${JSON.stringify(rows[0]?.proconfig)}`);
}
const extra = have.filter((h) => !want.has(h.proname)).map((h) => h.proname);
console.log(`F functions in the file ${want.size} · on QC2 ${have.length} · not in the file ${JSON.stringify(extra)}`);
if (extra.length) bad += 1;
const mig = (await P.$queryRawUnsafe(`SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count FROM "_prisma_migrations" WHERE migration_name LIKE '2026110400000%'  ORDER BY 1`)) as Any[];
for (const r of mig) console.log(`R ${r.migration_name} · checksum ${String(r.checksum).slice(0, 12)}… · finished ${r.finished_at?.toISOString?.() ?? r.finished_at} · rolled_back ${r.rolled_back_at ?? "-"} · steps ${r.applied_steps_count}`);
const seqs = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relkind='S' AND c.relname LIKE 'acc_jno_%'`)) as Any[];
console.log(`R acc_jno_* sequences on QC2: ${seqs[0].n}`);
const pre = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM (SELECT e."systemId" FROM "AccountJournalEntry" e WHERE e."createdAt" > now() - interval '90 days' GROUP BY 1) s`)) as Any[];
console.log(`R systems with a journal entry in the last 90 days (the bounded block's candidates, cap 500): ${pre[0].n}`);
const tag = `zzc54ne${Date.now().toString(36)}`;
for (const [fn, N] of [["account_jno_create", 500], ["account_jno_ensure", 100]] as const) {
  let base = 0, locks = 0, sub = "", ms = 0;
  const t0 = Date.now();
  await P.$transaction(async (tx: Any) => {
    base = Number(((await tx.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_locks WHERE pid = pg_backend_pid()`)) as Any[])[0].n);
    await tx.$executeRawUnsafe(`DO $$ DECLARE i int; b text; BEGIN FOR i IN 1..${N} LOOP FOREACH b IN ARRAY ARRAY['SALES','PURCHASES','RECEIPTS','PAYMENTS','GENERAL'] LOOP PERFORM public.${fn}('${tag}${fn.slice(-6)}' || i, b, 0); END LOOP; END LOOP; END $$`);
    locks = Number(((await tx.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_locks WHERE pid = pg_backend_pid()`)) as Any[])[0].n);
    sub = JSON.stringify(((await tx.$queryRawUnsafe(`SELECT s.subxact_count::int AS c, s.subxact_overflowed AS o FROM pg_stat_get_backend_idset() AS b(id), LATERAL pg_stat_get_backend_subxact(b.id) s WHERE pg_stat_get_backend_pid(b.id) = pg_backend_pid()`)) as Any[])[0]);
    ms = Date.now() - t0;
    throw new Error("QC-ROLLBACK");
  }, { maxWait: 20_000, timeout: 120_000 }).catch((e: Any) => { if (!/QC-ROLLBACK/.test(String(e?.message))) { bad += 1; console.log(`E ❌ ${fn}: ${String(e?.message).slice(0, 300)}`); } });
  const left = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM pg_class WHERE relkind='S' AND relname LIKE $1`, `acc_jno_${tag}%`)) as Any[];
  console.log(`E ${fn}: ${N} systems → ${locks - base} extra locks (${((locks - base) / N).toFixed(2)} per system) · subtransactions ${sub} · ${ms} ms · rolled back, left ${left[0].n}`);
}
const cfg = (await P.$queryRawUnsafe(`SELECT current_setting('max_locks_per_transaction')::int AS a, current_setting('max_connections')::int AS b, current_setting('max_prepared_transactions')::int AS c`)) as Any[];
console.log(`E lock table QC2 = ${cfg[0].a} × (${cfg[0].b} + ${cfg[0].c}) = ${cfg[0].a * (cfg[0].b + cfg[0].c)} · smallest Neon compute (0.25 CU, 112 conns) = ${cfg[0].a * 112}`);
console.log(`CHECK ${bad === 0 ? "OK" : `FAIL ${bad}`}`);
await prisma.$disconnect();
