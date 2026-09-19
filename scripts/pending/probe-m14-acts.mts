// read-only: detail of member-module activity rows on m41
type Any = any; // eslint-disable-line
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const rows = await (prisma as Any).memberActivity.findMany({ where: { id: { in: ["cmu7ufs3z006kktkzzdr16cpe", "cmu7vg3fg003xb2kzy62kqnu0"] } } });
for (const r of rows) console.log(JSON.stringify(r).slice(0, 600));
const left = await (prisma as Any).memberActivity.count({ where: { summary: { contains: "QC sameUnit" } } });
console.log("leftover QC sameUnit rows anywhere:", left);
await prisma.$disconnect();
