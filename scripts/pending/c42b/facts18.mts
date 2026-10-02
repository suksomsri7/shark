// READ-ONLY (c42b it7 pre-flight): the tenant's ENABLED automation rules — scope, event, action types (no params printed)
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const rows = await P.automationRule.findMany({ where: { tenantId: E.tenantId, enabled: true } });
for (const r of rows) {
  const acts = Array.isArray(r.actions) ? r.actions.map((a: any) => a?.type) : [];
  console.log(r.id, "scope", r.scope ?? "-", "system", r.systemId ?? "-", "board", r.boardId ?? "-", "event", r.event, "action(legacy)", r.action ?? "-", "actions", JSON.stringify(acts), "name", String(r.name ?? "").slice(0, 40), "created", r.createdAt?.toISOString?.().slice(0, 10));
}
console.log("cols:", Object.keys(rows[0] ?? {}).join(","));
await prisma.$disconnect();
