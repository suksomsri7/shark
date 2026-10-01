// READ-ONLY: run2 owner triage — pipelines/stages with deals, sequences + versions, saved views, conversations, teams (c42b)
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const SYS = E.systemId, T = E.tenantId;
const pls = await P.crmPipeline.findMany({ where: { systemId: SYS }, select: { id: true, name: true, archivedAt: true, isDefault: true, createdAt: true }, orderBy: { createdAt: "asc" } });
for (const p of pls) {
  const open = await P.crmDeal.count({ where: { pipelineId: p.id, kind: "OPEN", archivedAt: null } });
  const st = await P.crmStage.findMany({ where: { pipelineId: p.id }, select: { id: true, name: true, kind: true, sortOrder: true } , orderBy: { sortOrder: "asc" } });
  const per = [];
  for (const s of st) per.push(`${s.name}/${s.kind}=${await P.crmDeal.count({ where: { stageId: s.id } })}`);
  console.log("PIPE", p.name, p.isDefault, p.archivedAt, "open", open, "|", per.join(" · "));
}
const seqs = await P.crmSequence.findMany({ where: { systemId: SYS }, select: { id: true, name: true, version: true, archivedAt: true, createdAt: true }, orderBy: { createdAt: "asc" } });
for (const s of seqs) console.log("SEQ", s.id, s.name, "v", s.version, s.archivedAt, s.createdAt.toISOString(), "enr", await P.crmSequenceEnrollment.count({ where: { sequenceId: s.id } }));
console.log("SAVEDVIEW deal", await P.memberSavedView.count({ where: { tenantId: T } }).catch((e: any) => String(e).slice(0, 80)));
await prisma.$disconnect();
