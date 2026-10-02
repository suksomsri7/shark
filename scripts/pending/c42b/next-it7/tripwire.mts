// READ-ONLY (c42b it7 · RVR-1b): the PASS-LEVEL tripwire of a button run window. Fails (exit 1) when, inside [from, to] for the CRM QC
// tenant: any crm.email.sent OutboxEvent · any WebhookDelivery (OK/FAILED = a delivery was attempted) · a LINE/PUSH/SMS member
// notification that left SKIPPED · a SENT member notification · an e-mailed AppNotification · a transport OpsEvent (email /
// email.rich / push / line / sms / webhook) · an HrPayAdjustment row; or when the QC server log grew by any "[email" or "⨯" line
// after byte <logOffset> (the run records `stat -c %s` of the log at its start).
// usage: bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c42b/next-it7/tripwire.mts <fromISO> <logOffset> [toISO]
// Positive control (it7 notes): the run5 window with offset 0 must report the 4 "[email:dev]" lines, the "⨯" lines and the 4
// crm.email.sent events of run5.
import { closeSync, openSync, readSync, statSync, readFileSync } from "node:fs";
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse(readFileSync(process.env.CRM_EXPECTED_PATH ?? "scripts/crm-expected.json", "utf8"));
const T = E.tenantId;
const from = new Date(process.argv[2] ?? "");
const off = Number(process.argv[3] ?? "0");
const to = process.argv[4] ? new Date(process.argv[4]) : new Date();
if (Number.isNaN(from.getTime())) { console.error("usage: tripwire.mts <fromISO> <logOffset> [toISO]"); process.exit(2); }
const LOG = process.env.QC_SERVER_LOG ?? "/root/projects/shark-crm/.qc-shots/acc-v2/server.log";
const win = { gte: from, lte: to };
const hits: string[] = [];
const q = async (label: string, f: () => Promise<number>) => {
  const n = await f().catch((e: unknown) => { hits.push(`${label}: read failed ${String(e).slice(0, 80)}`); return 0; });
  console.log(`  ${n ? "🚨" : "·"} ${label}: ${n}`);
  if (n) hits.push(`${label}: ${n}`);
};
console.log(`tripwire window ${from.toISOString()} → ${to.toISOString()} · tenant ${T} · log ${LOG} from byte ${off}`);
await q("OutboxEvent crm.email.sent", () => P.outboxEvent.count({ where: { tenantId: T, type: "crm.email.sent", createdAt: win } }));
await q("WebhookDelivery (attempted)", () => P.webhookDelivery.count({ where: { tenantId: T, createdAt: win } }));
await q("MemberNotification LINE/PUSH/SMS not SKIPPED", () => P.memberNotification.count({ where: { tenantId: T, createdAt: win, channel: { in: ["LINE", "PUSH", "SMS"] }, status: { not: "SKIPPED" } } }));
await q("MemberNotification SENT", () => P.memberNotification.count({ where: { tenantId: T, createdAt: win, status: "SENT" } }));
await q("AppNotification emailed", () => P.appNotification.count({ where: { tenantId: T, createdAt: win, emailedAt: { not: null } } }));
await q("OpsEvent transport", () => P.opsEvent.count({ where: { createdAt: win, OR: [{ tenantId: T }, { tenantId: null }], source: { in: ["email", "email.rich", "line", "push", "sms", "webhook", "webhooks"] } } }));
await q("HrPayAdjustment", () => P.hrPayAdjustment.count({ where: { tenantId: T, createdAt: win } }));
let lines: string[] = [];
try {
  const size = statSync(LOG).size;
  if (size > off) {
    const fd = openSync(LOG, "r"); const buf = Buffer.alloc(Math.min(size - off, 64_000_000)); readSync(fd, buf, 0, buf.length, off); closeSync(fd);
    lines = buf.toString("utf8").split("\n").filter((l) => /\[email|⨯/.test(l));
  }
  console.log(`  ${lines.length ? "🚨" : "·"} server log "[email" / "⨯" lines after byte ${off} (log size ${size}): ${lines.length}`);
} catch (e) { hits.push(`server log unreadable: ${String(e).slice(0, 80)}`); }
for (const l of lines.slice(0, 20)) console.log(`     ${l.replace(/\S+@\S+/g, "<addr>").slice(0, 200)}`);
if (lines.length) hits.push(`server log lines: ${lines.length}`);
console.log(hits.length ? `TRIPWIRE FAIL — ${hits.join(" · ")}` : "TRIPWIRE CLEAN");
await prisma.$disconnect();
process.exit(hits.length ? 1 : 0);
