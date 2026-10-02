// READ-ONLY (c42b it6 · run5 outbox triage): crm.email.sent / crm.contact.created / crm.contact.assigned events of the run5 window —
// created vs processed (delay), attempts, lastError — to tell "no wake" from "consumer failing"
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const from = new Date(process.argv[2] ?? "2026-10-02T13:59:00Z"), to = new Date(process.argv[3] ?? "2026-10-02T18:52:00Z");
const rows = await P.outboxEvent.findMany({ where: { tenantId: E.tenantId, createdAt: { gte: from, lte: to }, type: { in: ["crm.email.sent", "crm.contact.created", "crm.contact.assigned"] } }, orderBy: { createdAt: "asc" }, select: { type: true, createdAt: true, processedAt: true, attempts: true, lastError: true, status: true, idempotencyKey: true } });
for (const r of rows) console.log(r.type, r.createdAt.toISOString().slice(11, 19), "→", r.processedAt?.toISOString().slice(11, 19) ?? "-", `${r.processedAt ? Math.round((r.processedAt - r.createdAt) / 1000) : "?"}s`, r.status, `att=${r.attempts}`, (r.lastError ?? "").slice(0, 80));
await prisma.$disconnect();
