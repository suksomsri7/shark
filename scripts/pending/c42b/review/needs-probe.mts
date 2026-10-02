// READ-ONLY (C4.2 re-review after run5): spot-check a few `needs` preconditions that run5 skipped for EVERY role —
// is the seed really missing the data, or is the control missing for another reason?
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const T = E.tenantId, S = E.systemId;
const boards = await P.kanbanBoard.groupBy({ by: ["status", "visibility"], where: { tenantId: T }, _count: { _all: true } }).catch((e: any) => `ERR ${String(e).slice(0, 80)}`);
console.log("KanbanBoard by status:", JSON.stringify(boards));
const req = await P.crmStage.count({ where: { tenantId: T, systemId: S, OR: [{ requireFields: { isEmpty: false } }, { requireLines: true }, { requireQuotation: true }] } }).catch((e: any) => `ERR ${String(e).slice(0, 80)}`);
console.log("CrmStage with requireFields ≠ []:", req);
const pipes = await P.crmPipeline.findMany({ where: { tenantId: T, systemId: S, archivedAt: null }, select: { id: true, name: true, isDefault: true } });
for (const p of pipes) console.log(`pipeline ${p.name} default=${p.isDefault} OPEN deals ${await P.crmDeal.count({ where: { tenantId: T, systemId: S, pipelineId: p.id, archivedAt: null } })}`);
const mf = await P.memberField.count({ where: { tenantId: T } }).catch((e: any) => `ERR ${String(e).slice(0, 80)}`);
console.log("MemberField rows of tenant:", mf);
await prisma.$disconnect();
