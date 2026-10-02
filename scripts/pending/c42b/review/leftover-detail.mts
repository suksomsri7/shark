// READ-ONLY (C4.2 re-review after run5): the non-restored rows of the run5 window outside counts.mts — do they point at
// rows that still exist? (AccountContact → Party · MemberAttribution/MemberTierHistory → Customer) + AiCreditTxn amounts.
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const T = E.tenantId;
const win = { gte: new Date(process.argv[2] ?? "2026-10-02T13:57:00Z"), lte: new Date(process.argv[3] ?? "2026-10-02T18:52:00Z") };
const ac = await P.accountContact.findMany({ where: { tenantId: T, createdAt: win }, select: { id: true, partyId: true, name: true, archivedAt: true, systemId: true } });
let partyGone = 0, qc = 0;
for (const r of ac) { if (r.partyId && !(await P.party.findFirst({ where: { id: r.partyId }, select: { id: true } }))) partyGone++; if (/qc-btn/.test(r.name)) qc++; }
console.log(`AccountContact in window: ${ac.length} · name qc-btn-*: ${qc} · partyId set: ${ac.filter((r: any) => r.partyId).length} · party now MISSING: ${partyGone} · archived: ${ac.filter((r: any) => r.archivedAt).length}`);
const allAcQc = await P.accountContact.count({ where: { tenantId: T, name: { contains: "qc-btn" } } });
console.log(`AccountContact of tenant named qc-btn-* (all time): ${allAcQc}`);
for (const [m, label] of [["memberAttribution", "MemberAttribution"], ["memberTierHistory", "MemberTierHistory"]] as const) {
  const rows = await P[m].findMany({ where: { tenantId: T, createdAt: win }, select: { customerId: true } });
  let gone = 0; for (const r of rows) if (!(await P.customer.findFirst({ where: { id: r.customerId }, select: { id: true } }))) gone++;
  console.log(`${label} in window: ${rows.length} · customer now MISSING: ${gone}`);
}
const tx = await P.aiCreditTxn.groupBy({ by: ["kind", "source"], where: { tenantId: T, createdAt: win }, _count: { _all: true }, _sum: { amountMicro: true } });
for (const g of tx) console.log(`AiCreditTxn ${g.kind} ${g.source} ×${g._count._all} Σ amountMicro ${g._sum.amountMicro}`);
const an = await P.appNotification.findMany({ where: { tenantId: T, createdAt: win }, select: { title: true } });
const at = new Map<string, number>(); for (const r of an) at.set(r.title.slice(0, 40), (at.get(r.title.slice(0, 40)) ?? 0) + 1);
console.log(`AppNotification titles: ${JSON.stringify([...at])}`);
await prisma.$disconnect();
