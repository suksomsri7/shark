// QC1 hygiene (C5.5-fix14 r3 · review RV14-5): ONE leftover Party row from the round-2 run of qc-acc-v2-contacts P7
//   (insertPopularVendors → party.safeFindOrCreate; the oracle deletes the contact, not the Party).
// Default = read-only verification. `--delete` deletes EXACTLY that one row, only if every check holds, in one transaction; prints before/after counts.
// Run (QC1 = default QC env, the seed tenant cmuk7wtu…): bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf19/qc1-party-leftover.mts [--find] [--delete] [--id=<partyId>] [--created=<ISO prefix>]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!/ep-plain-art/.test(host) || !/ep-plain-art/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC1 only — got ${host}`); process.exit(2); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const ID = process.argv.find((a) => a.startsWith("--id="))?.slice(5) ?? "cmuqunmlh0002rpkzymtt7vfz";
const SEED_TENANT = "cmuk7wtu20000b5kznw08vv7o";
const TAX = "0091000000001";
const DEL = process.argv.includes("--delete");
// creation-time prefix the row must carry (default = the round-2 leftover; a later re-run of the suite passes its own minute)
const CREATED = process.argv.find((a) => a.startsWith("--created="))?.slice(10) ?? "2026-10-02T10:58:11";
// --find: list Party rows of the seed tenant with that tax id (to get the id of a fresh leftover) — read only
if (process.argv.includes("--find")) {
  const rows = await P.party.findMany({ where: { tenantId: SEED_TENANT, taxId: TAX }, select: { id: true, createdAt: true } });
  console.log(JSON.stringify(rows.map((r: Any) => ({ id: r.id, createdAt: new Date(r.createdAt).toISOString() }))));
  await prisma.$disconnect();
  process.exit(0);
}

const row = await P.party.findFirst({ where: { id: ID } });
// every column that can point at a Party: *partyId* columns of any table + PartyMergeCandidate pair + Party.mergedIntoId
const cols = (await P.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND (column_name ILIKE '%party%id' OR (table_name='Party' AND column_name='mergedIntoId'))`)) as { table_name: string; column_name: string }[];
const refs: Record<string, number> = {};
for (const c of cols) {
  if (!/^[A-Za-z_]+$/.test(c.table_name) || !/^[A-Za-z_]+$/.test(c.column_name)) continue;
  const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${c.table_name}" WHERE "${c.column_name}" = $1`, ID)) as Any[])[0]?.n ?? 0);
  refs[`${c.table_name}.${c.column_name}`] = n;
}
const totalRefs = Object.values(refs).reduce((a, b) => a + b, 0);
const partiesInSeed = await P.party.count({ where: { tenantId: SEED_TENANT } });
const created = row?.createdAt ? new Date(row.createdAt).toISOString() : null;
const ok = !!row && row.tenantId === SEED_TENANT && row.taxId === TAX && created?.startsWith(CREATED) === true && totalRefs === 0;
console.log(JSON.stringify({ host: host.split("-pooler")[0], id: ID, found: !!row, tenantId: row?.tenantId ?? null, taxId: row?.taxId ?? null, name: row?.name ?? null, createdAt: created, updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null, mergedIntoId: row?.mergedIntoId ?? null, refs, totalRefs, partiesInSeedTenant: partiesInSeed, deletable: ok }, null, 1));
if (DEL) {
  if (!ok) { console.log("NOT DELETED — a check failed (see above)"); process.exit(3); }
  const n = await prisma.$transaction(async (tx: Any) => {
    const r = await tx.party.deleteMany({ where: { id: ID, tenantId: SEED_TENANT, taxId: TAX } });
    if (r.count !== 1) throw new Error(`expected exactly 1 row, got ${r.count}`);
    return r.count;
  });
  const after = await P.party.count({ where: { tenantId: SEED_TENANT } });
  console.log(JSON.stringify({ deleted: n, partiesInSeedTenantBefore: partiesInSeed, partiesInSeedTenantAfter: after, stillThere: (await P.party.count({ where: { id: ID } })) }));
}
await prisma.$disconnect();
