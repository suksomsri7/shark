// C5.4-N review R1 — read-only facts on QC2 (settings that bound the migration, privileges, sequence vs table drift, odd docNo shapes)
// Run: env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c54n/review/r1-db-facts.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const q = async (sql: string, ...a: Any[]) => (await P.$queryRawUnsafe(sql, ...a)) as Any[];
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
try {
  for (const s of ["server_version", "max_locks_per_transaction", "max_connections", "max_prepared_transactions", "lock_timeout", "statement_timeout", "search_path"])
    console.log(`${s} = ${(await q(`SELECT current_setting($1) AS v`, s))[0].v}`);
  console.log(`current_user = ${j(await q(`SELECT current_user AS u, session_user AS s`))}`);
  console.log(`CREATE on schema public = ${j(await q(`SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS c`))}`);
  console.log(`function owners/secdef/proconfig = ${j(await q(`SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig::text AS cfg, p.provolatile::text AS vol FROM pg_proc p WHERE p.proname LIKE 'account_jno%' OR p.proname LIKE 'account_%journal_no' ORDER BY 1`))}`);
  console.log(`sequence owners = ${j(await q(`SELECT pg_get_userbyid(c.relowner) AS owner, count(*)::int AS n FROM pg_class c WHERE c.relkind='S' AND c.relname LIKE 'acc_jno_%' GROUP BY 1`))}`);
  const sys = (await q(`SELECT count(DISTINCT "systemId")::int AS n FROM "AccountLedger"`))[0].n;
  const seqs = (await q(`SELECT count(*)::int AS n FROM pg_class WHERE relkind='S' AND relname LIKE 'acc_jno_%'`))[0].n;
  const allRel = (await q(`SELECT count(*)::int AS n FROM pg_class`))[0].n;
  console.log(`systems with a chart = ${sys} · acc_jno sequences = ${seqs} · pg_class rows total = ${allRel}`);
  console.log(`AccountJournalEntry rows = ${(await q(`SELECT count(*)::int AS n FROM "AccountJournalEntry"`))[0].n}`);
  // docNo shapes that are NOT the gl.ts display format
  const odd = await q(`SELECT "book", count(*)::int AS n, min("docNo") AS a, max("docNo") AS b FROM "AccountJournalEntry" WHERE "docNo" !~ '^(SV|PV|RV|PY|JV)-\\d{4}-\\d{2}-\\d{4,}$' GROUP BY 1`);
  console.log(`docNo not in display format: ${j(odd)}`);
  const cross = await q(`SELECT "book", substring("docNo" from '^[A-Z]+') AS pfx, count(*)::int AS n FROM "AccountJournalEntry" WHERE "docNo" ~ '^(SV|PV|RV|PY|JV)-' GROUP BY 1,2 HAVING substring("docNo" from '^[A-Z]+') <> CASE "book" WHEN 'SALES' THEN 'SV' WHEN 'PURCHASES' THEN 'PV' WHEN 'RECEIPTS' THEN 'RV' WHEN 'PAYMENTS' THEN 'PY' ELSE 'JV' END`);
  console.log(`entries whose prefix belongs to another book: ${j(cross)}`);
  const bigTail = await q(`SELECT "systemId", "book", "docNo" FROM "AccountJournalEntry" WHERE "docNo" ~ '\\d{7,}$' LIMIT 5`);
  console.log(`docNo with a ≥7-digit tail (floor would jump): ${j(bigTail)}`);
  // sequence behind the table: next nextval would collide (or reuse a suffix) — per (system, book) that has a sequence
  const t0 = Date.now();
  const rows = await q(`
    WITH f AS (
      SELECT "systemId" AS s, "book"::text AS b, MAX((substring("docNo" FROM '(\\d+)$'))::bigint) AS mx, count(*)::int AS n
      FROM "AccountJournalEntry" WHERE "docNo" ~ '\\d+$' GROUP BY 1,2)
    SELECT f.s, f.b, f.mx, f.n, to_regclass(quote_ident(account_jno_seq_name(f.s, f.b))) IS NOT NULL AS has_seq FROM f`);
  let behind = 0, nseq = 0, noseq = 0; const ex: Any[] = [];
  for (const r of rows) {
    if (!r.has_seq) { noseq += 1; continue; }
    nseq += 1;
    const name = (await q(`SELECT account_jno_seq_name($1,$2) AS n`, r.s, r.b))[0].n;
    const v = (await q(`SELECT last_value, is_called FROM "${name}"`))[0];
    const next = BigInt(v.is_called ? BigInt(v.last_value) + BigInt(1) : BigInt(v.last_value)); // ORACLE-EDIT C5.4-N: `1n` → BigInt(1) only (TS2737 broke pnpm typecheck) — logic unchanged
    if (next <= BigInt(r.mx)) { behind += 1; if (ex.length < 8) ex.push({ s: r.s, b: r.b, tableMax: r.mx, seqNext: next, rows: r.n }); }
  }
  console.log(`(system, book) with entries: ${rows.length} · with sequence ${nseq} · without ${noseq} · sequence BEHIND table max (next nextval ≤ max suffix): ${behind} · ${Date.now() - t0} ms`);
  console.log(`  examples: ${j(ex)}`);
} finally {
  await prisma.$disconnect();
}
