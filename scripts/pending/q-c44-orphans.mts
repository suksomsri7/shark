// read-only: are the ids in c44-orphan-delete.mts really journey (qc-jrn-) rows? (controller probe)
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const q = async (m: string, ids: string[], sel: any) => (await P[m].findMany({ where: { id: { in: ids } }, select: { id: true, createdAt: true, ...sel } })).map((r: any) => ({ m, ...r }));
const rows = [
 ...(await q("crmDeal", ["cmukhqlfs000cxqkz8v3hl3o5","cmukhrkht001cxqkzvf756ncx"], { title: true })),
 ...(await q("crmContact", ["cmukhql2v0005xqkzrgezifk3","cmukhr6ly000mxqkzvbbarys6","cmukhrjy60015xqkze0pcl3p9"], { firstName: true, lastName: true, email: true, tags: true })),
 ...(await q("crmCompany", ["cmukf282l001ee3kz2v2fhg4a","cmuk7h9ef0007hgkz6dw00ey8","cmukhqkum0001xqkzixo917p1","cmukhrjr10011xqkzivvt1skv"], { name: true })),
 ...(await q("formDef", ["cmuk23qb90002pgkzoa4z06ur","cmuk2rp5b0002xwkzo3h3qnco"], { name: true })),
 ...(await q("crmAssignmentRule", ["cmuk23ph50000pgkzx0ou16e4","cmuk2rov40000xwkzcevhq0oe"], { name: true })),
 ...(await q("crmSequence", ["cmukhr6q0000qxqkzzp59mlic"], { name: true })),
];
for (const r of rows) console.log(JSON.stringify(r));
console.log("found", rows.length, "of 14");
process.exit(0);
