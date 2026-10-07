// READ-ONLY QC1 check for the cf19 round-3 re-check: the two P7 leftover Party rows the builder deleted are gone, nothing points at them
//   (every *party*id column, Party.mergedIntoId, KanbanCardLink PARTY linkId, AuditLog/OutboxEvent mentions), the seed tenant has no Party with
//   the P7 tax id, 63 account contacts, 0 QC-TMP rows. No writes.
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf19/review/qc1-r3-check.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
const env = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!/ep-plain-art/.test(host)) { console.log(`QC1 only — got ${host}`); process.exit(2); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const SEED = "cmuk7wtu20000b5kznw08vv7o";
const IDS = ["cmuqunmlh0002rpkzymtt7vfz", "cmuqwx1pu0002arkzk6t1l31x"];
const cols = (await P.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND (column_name ILIKE '%party%id' OR (table_name='Party' AND column_name='mergedIntoId'))`)) as { table_name: string; column_name: string }[];
const out: Record<string, unknown> = { host: host.split("-pooler")[0] };
for (const id of IDS) {
  let refs = 0;
  for (const c of cols) {
    if (!/^[A-Za-z_]+$/.test(c.table_name) || !/^[A-Za-z_]+$/.test(c.column_name)) continue;
    refs += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${c.table_name}" WHERE "${c.column_name}" = $1`, id)) as any[])[0]?.n ?? 0);
  }
  const kanban = await P.kanbanCardLink.count({ where: { linkType: "PARTY", linkId: id } });
  const audit = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "targetId" = $1 OR "before"::text LIKE $2 OR "after"::text LIKE $2`, id, `%${id}%`)) as any[])[0]?.n ?? 0);
  const outbox = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "payload"::text LIKE $1`, `%${id}%`)) as any[])[0]?.n ?? 0);
  out[id] = { exists: (await P.party.count({ where: { id } })) > 0, partyColumnRefs: refs, kanbanPartyLinks: kanban, auditMentions: audit, outboxMentions: outbox };
}
out.seedPartyWithP7TaxId = await P.party.count({ where: { tenantId: SEED, taxId: "0091000000001" } });
out.seedParties = await P.party.count({ where: { tenantId: SEED } });
out.seedContacts = await P.accountContact.count({ where: { tenantId: SEED } });
out.seedQcTmp = await P.accountContact.count({ where: { tenantId: SEED, name: { startsWith: "QC-TMP-" } } });
console.log(`R3CHECK ${JSON.stringify(out)}`);
await prisma.$disconnect();
