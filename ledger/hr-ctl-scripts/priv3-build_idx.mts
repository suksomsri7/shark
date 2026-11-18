const { prisma } = (await import("@/lib/core/db")) as any;
const r = await prisma.$queryRawUnsafe(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename IN ('HrPayrollRun','HrSalaryProfile') ORDER BY 1,2`);
for (const x of r as any[]) console.log(`${x.indexname} :: ${x.indexdef}`);
process.exit(0);
