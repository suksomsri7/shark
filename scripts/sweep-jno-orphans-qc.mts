// QC tooling — CRM C5.4-N: drop journal-number sequences (acc_jno_<systemId>_<book>, migration 20261104000000) whose system no
//   longer exists. QC teardowns delete tenants/systems with raw SQL and never call account_jno_drop(), so every throwaway ACCOUNT
//   system that posted leaves up to 5 empty sequences behind. Harmless (no rows, no locks) but they pile up on shared QC branches.
// QC databases ONLY (acc-v2-env refuses the production host) · read-only unless `--apply` · prints what it would drop.
// Run: bash scripts/iso.sh bash scripts/qc2.sh pnpm exec tsx scripts/sweep-jno-orphans-qc.mts [--apply]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const APPLY = process.argv.includes("--apply");
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
try {
  // a sequence is an orphan when no AppSystem id (raw, or md5 for non-[a-z0-9] ids — account_jno_seq_name) matches its middle part
  const rows = (await P.$queryRawUnsafe(`
    SELECT c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S' AND n.nspname = current_schema() AND c.relname ~ '^acc_jno_[a-z0-9]+_(sales|purchases|receipts|payments|general)$'
      AND NOT EXISTS (
        SELECT 1 FROM "AppSystem" s
        WHERE c.relname IN (account_jno_seq_name(s.id, 'SALES'), account_jno_seq_name(s.id, 'PURCHASES'), account_jno_seq_name(s.id, 'RECEIPTS'),
                            account_jno_seq_name(s.id, 'PAYMENTS'), account_jno_seq_name(s.id, 'GENERAL'))
      )
    ORDER BY 1`)) as { name: string }[];
  console.log(`host ${host} · orphan journal-number sequences: ${rows.length}${APPLY ? " · dropping" : " · dry run (pass --apply to drop)"}`);
  for (const r of rows.slice(0, 20)) console.log(`  ${r.name}`);
  if (rows.length > 20) console.log(`  … ${rows.length - 20} more`);
  if (APPLY) {
    let dropped = 0;
    for (const r of rows) {
      if (!/^acc_jno_[a-z0-9]+_[a-z]+$/.test(r.name)) continue;
      await P.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS "${r.name}"`);
      dropped += 1;
    }
    console.log(`dropped ${dropped}`);
  }
} finally {
  await prisma.$disconnect();
}
