// read-only: does the QC1 acc-v2 seed hold a contact with POPULAR_VENDORS[0].taxId (qc-acc-v2-contacts P7 deletes every such row)?
const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const sys = process.argv[2]!;
const n = await prisma.accountContact.count({ where: { systemId: sys, taxId: "0091000000001" } });
const all = await prisma.accountContact.count({ where: { systemId: sys } });
const tmp = await prisma.accountContact.count({ where: { systemId: sys, name: { startsWith: "QC-TMP-" } } });
console.log(JSON.stringify({ host: host.split("-pooler")[0], popular0: n, contacts: all, qcTmpLeftovers: tmp }));
await prisma.$disconnect();
