// READ-ONLY QC1 fingerprint for the cf19 review (before/after the two acc-v2 oracle runs): row count of every tenant-scoped table for the
//   acc-v2 seed tenant + global Tenant/User/Session/Membership/ApiKey counts + max(updatedAt) of AccountContact/Party of that tenant.
//   Prints one JSON line; no writes. Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf19/review/qc1-snapshot.mts <tenantId>
/* eslint-disable @typescript-eslint/no-explicit-any */
const env = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const T = process.argv[2]!;
const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId' order by table_name`)) as any[])
  .map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
const per: Record<string, number> = {};
for (const t of tbs) {
  const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T)) as any[])[0]?.n ?? 0);
  if (n) per[t] = n;
}
const global = {
  Tenant: await P.tenant.count(),
  User: await P.user.count(),
  Session: await P.session.count(),
  Membership: await P.membership.count(),
  ApiKey: await P.apiKey.count(),
};
const maxUpd = {
  AccountContact: (await P.accountContact.aggregate({ where: { tenantId: T }, _max: { updatedAt: true } }))._max.updatedAt,
  Party: (await P.party.aggregate({ where: { tenantId: T }, _max: { updatedAt: true } }))._max.updatedAt,
};
// the Party that qc-acc-v2-contacts P7 (insertPopularVendors → party.safeFindOrCreate) creates/reuses — the oracle deletes the contact, not the Party
const popularParty = await P.party.findMany({ where: { tenantId: T, taxId: "0091000000001" }, select: { id: true, createdAt: true, updatedAt: true, mergedIntoId: true } });
console.log(`SNAP ${JSON.stringify({ host: host.split("-pooler")[0], tenant: T, tables: Object.keys(per).length, per, global, maxUpd, popularParty })}`);
await prisma.$disconnect();
