// READ-ONLY (C4.2 it7 check): provenance of the cleanup-it7 [B] candidates (member rows whose Customer is gone, created in a runner
// window). The tenant is shared with the member suites (qc-member-* create AND delete customers here) — can the AuditLog trail prove
// that each customer was created by a button-runner press (a QC persona's crm.contact.convert / member link), not by another lane?
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const T = E.tenantId;
const W: [string, string, string][] = [["run2", "2026-10-01T03:30:00Z", "2026-10-01T06:25:00Z"], ["dbg2", "2026-10-01T06:40:00Z", "2026-10-01T09:35:00Z"], ["dbg3", "2026-10-01T09:35:00Z", "2026-10-01T11:15:00Z"], ["run3", "2026-10-01T11:45:00Z", "2026-10-01T17:46:00Z"], ["dbg4-7", "2026-10-01T18:40:00Z", "2026-10-01T19:30:00Z"], ["run4", "2026-10-01T22:15:00Z", "2026-10-02T03:26:00Z"], ["dbg8", "2026-10-02T03:50:00Z", "2026-10-02T04:27:00Z"], ["dbg9-14", "2026-10-02T06:20:00Z", "2026-10-02T10:20:00Z"], ["run5", "2026-10-02T13:55:00Z", "2026-10-02T18:53:00Z"], ["dbg15-18", "2026-10-02T18:58:00Z", "2026-10-02T19:30:00Z"]];
const anyWin = { OR: W.map(([, a, b]) => ({ createdAt: { gte: new Date(a), lte: new Date(b) } })) };
const personas = new Map(Object.entries(E.users ?? {}).map(([k, v]: any) => [v?.userId, k]));
const ids = new Set<string>();
for (const m of ["memberNotification", "memberAttribution", "memberTierHistory"]) for (const r of await P[m].findMany({ where: { tenantId: T, ...anyWin }, select: { customerId: true } })) ids.add(r.customerId);
const gone: string[] = [];
for (const id of ids) if (!(await P.customer.findFirst({ where: { id }, select: { id: true } }))) gone.push(id);
console.log(`customers referenced by member rows in runner windows: ${ids.size} · gone: ${gone.length}`);
const cls = new Map<string, number>();
const ex: string[] = [];
for (const id of gone) {
  const a = await P.auditLog.findMany({ where: { tenantId: T, OR: [{ targetId: id }] }, select: { action: true, actorId: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 5 });
  const ob = await P.outboxEvent.findFirst({ where: { tenantId: T, type: "member.created", payload: { path: ["customerId"], equals: id } }, select: { createdAt: true } }).catch(() => null);
  const first = a[0];
  const key = first ? `${first.action} by ${personas.get(first.actorId) ?? (first.actorId ? "non-persona" : "null")}` : ob ? "no audit · member.created outbox only" : "no audit · no outbox";
  cls.set(key, (cls.get(key) ?? 0) + 1);
  if (ex.length < 6 && !(first && personas.has(first.actorId))) ex.push(`${id} ${key} ${first?.createdAt?.toISOString?.() ?? ob?.createdAt?.toISOString?.() ?? ""}`);
}
for (const [k, n] of [...cls].sort((x, y) => y[1] - x[1])) console.log(`  ${n} × first audit = ${k}`);
for (const x of ex) console.log(`  e.g. ${x}`);
await prisma.$disconnect();
