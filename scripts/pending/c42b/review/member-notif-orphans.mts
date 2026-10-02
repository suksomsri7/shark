// READ-ONLY (C4.2 re-review after run5): MemberNotification rows of the CRM QC tenant created inside button-runner windows —
// do their customers still exist (the runner's restore deletes Customer rows it created), what status, recipient e-mail DOMAIN only.
// Usage: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c42b/review/member-notif-orphans.mts
const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const { emailEnabled } = (await import("@/lib/env" as string)) as { emailEnabled: boolean };
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const T = E.tenantId;
console.log(`emailEnabled in a process that loads the QC env file the runner/oracles use: ${emailEnabled}`);
const rows = await P.memberNotification.findMany({ where: { tenantId: T }, select: { id: true, customerId: true, channel: true, status: true, event: true, createdAt: true, sentAt: true }, orderBy: { createdAt: "asc" } });
const byKey = new Map<string, number>();
const missing = new Map<string, number>();
const domains = new Map<string, number>();
for (const r of rows) {
  const k = `${r.createdAt.toISOString().slice(0, 10)} ${r.channel} ${r.status} ${r.event}`;
  byKey.set(k, (byKey.get(k) ?? 0) + 1);
  const c = await P.customer.findFirst({ where: { id: r.customerId }, select: { id: true, email: true } }).catch(() => null);
  if (!c) missing.set(k, (missing.get(k) ?? 0) + 1);
  else if (r.channel === "EMAIL") { const d = String(c.email ?? "<none>").split("@")[1] ?? "<none>"; domains.set(`${r.status} ${d}`, (domains.get(`${r.status} ${d}`) ?? 0) + 1); }
}
console.log(`MemberNotification of tenant: ${rows.length}`);
for (const [k, n] of [...byKey].sort()) console.log(`  ${k} ×${n}${missing.get(k) ? ` · customer MISSING ×${missing.get(k)}` : ""}`);
console.log(`EMAIL rows with an existing customer — status + recipient domain:`);
for (const [k, n] of domains) console.log(`  ${k} ×${n}`);
await prisma.$disconnect();
