// READ-ONLY (C4.2 re-review after run5): external side-effect evidence for the run5 window of the CRM QC tenant.
// Prints only aggregates + URL HOSTS (never secrets, bodies or addresses). Usage:
//   bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c42b/review/safety-window.mts [fromISO] [toISO]
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const T = E.tenantId;
const from = new Date(process.argv[2] ?? "2026-10-02T13:57:00Z"), to = new Date(process.argv[3] ?? "2026-10-02T18:52:00Z");
const win = { gte: from, lte: to };
const host = (u: string) => { try { return new URL(u).host; } catch { return `<unparsable:${u.slice(0, 20)}>`; } };
console.log(`window ${from.toISOString()} → ${to.toISOString()} tenant ${T}`);
// 1) webhook endpoints of the tenant (now) + deliveries in the window (deliveries of endpoints deleted by the restore cascade away)
const eps = await P.webhookEndpoint.findMany({ where: { tenantId: T }, select: { id: true, url: true, active: true, createdAt: true, updatedAt: true } });
console.log(`\n[WebhookEndpoint] ${eps.length}`);
for (const e of eps) console.log(`  ${e.id} host=${host(e.url)} active=${e.active} created=${e.createdAt.toISOString()} updated=${e.updatedAt.toISOString()}`);
const dels = await P.webhookDelivery.groupBy({ by: ["endpointId", "status"], where: { tenantId: T, createdAt: win }, _count: { _all: true } });
console.log(`[WebhookDelivery in window] groups ${dels.length}`);
for (const d of dels) console.log(`  endpoint=${d.endpointId} host=${host(eps.find((e: any) => e.id === d.endpointId)?.url ?? "")} status=${d.status} n=${d._count._all}`);
const delAll = await P.webhookDelivery.count({ where: { tenantId: T } });
console.log(`  (all-time deliveries of tenant: ${delAll})`);
// 2) outbox events in the window by type/status
const ob = await P.outboxEvent.groupBy({ by: ["type", "status"], where: { tenantId: T, createdAt: win }, _count: { _all: true } });
console.log(`\n[OutboxEvent in window] ${ob.reduce((a: number, g: any) => a + g._count._all, 0)} rows`);
for (const g of ob.sort((a: any, b: any) => b._count._all - a._count._all)) console.log(`  ${g.type} ${g.status} ${g._count._all}`);
const obErr = await P.outboxEvent.findMany({ where: { tenantId: T, createdAt: win, lastError: { not: null } }, select: { type: true, lastError: true }, take: 20 });
for (const r of obErr) console.log(`  lastError ${r.type}: ${String(r.lastError).slice(0, 100)}`);
// 3) member notifications (LINE / push / SMS / e-mail to CUSTOMERS) in the window
const mn = await P.memberNotification.groupBy({ by: ["channel", "status", "event"], where: { tenantId: T, createdAt: win }, _count: { _all: true } });
console.log(`\n[MemberNotification in window] groups ${mn.length}`);
for (const g of mn) console.log(`  ${g.channel} ${g.status} ${g.event} ${g._count._all}`);
// 4) app notifications (in-app; emailedAt = also e-mailed)
const an = await P.appNotification.count({ where: { tenantId: T, createdAt: win } });
const ane = await P.appNotification.count({ where: { tenantId: T, createdAt: win, emailedAt: { not: null } } });
console.log(`\n[AppNotification in window] ${an} (emailed ${ane})`);
// 5) ops events (transport failures: email / push / line / sms / webhook) in the window — tenant or global
const ops = await P.opsEvent.groupBy({ by: ["source", "level", "message"], where: { createdAt: win, OR: [{ tenantId: T }, { tenantId: null }] }, _count: { _all: true } });
console.log(`\n[OpsEvent in window, tenant or global] groups ${ops.length}`);
for (const g of ops) console.log(`  ${g.level} ${g.source} ${String(g.message).replace(/\S+@\S+/g, "<addr>").slice(0, 110)} ×${g._count._all}`);
// 6) push devices of the QC personas (Expo push would leave the machine)
const uids = Object.values(E.users ?? {}).map((u: any) => u?.userId).filter(Boolean);
const pd = await P.pushDevice.count({ where: { userId: { in: uids } } }).catch((e: any) => `ERR ${String(e).slice(0, 80)}`);
console.log(`\n[PushDevice of QC personas] ${pd}`);
const mpd = await P.memberPushDevice.count({ where: { tenantId: T } }).catch((e: any) => `ERR ${String(e).slice(0, 80)}`);
console.log(`[MemberPushDevice of tenant] ${mpd}`);
// 7) mail providers connected for the tenant (a connected provider = sending through the user's own mailbox)
const mp = await P.crmMailProvider.findMany({ where: { tenantId: T }, select: { id: true, kind: true, status: true, userId: true } }).catch((e: any) => `ERR ${String(e).slice(0, 120)}`);
console.log(`\n[CrmMailProvider of tenant]`, JSON.stringify(mp));
const ed = await P.emailDomain.findMany({ where: { tenantId: T }, select: { id: true, status: true } }).catch((e: any) => `ERR ${String(e).slice(0, 120)}`);
console.log(`[EmailDomain of tenant]`, JSON.stringify(ed));
await prisma.$disconnect();
