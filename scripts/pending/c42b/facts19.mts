// READ-ONLY (c42b it7 RVR-1/2): e-mailed AppNotifications of the CRM QC tenant — when, title, recipient kind (no addresses)
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const { emailEnabled } = (await import("@/lib/env" as string)) as { emailEnabled: boolean };
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
console.log("emailEnabled in a QC-env process:", emailEnabled);
const rows = await P.appNotification.findMany({ where: { tenantId: E.tenantId, emailedAt: { not: null } }, select: { createdAt: true, emailedAt: true, title: true, recipientUserId: true }, orderBy: { createdAt: "asc" } });
const by = new Map<string, number>();
for (const r of rows) { const k = `${r.createdAt.toISOString().slice(0, 13)}h · ${r.title.slice(0, 30)} · ${r.recipientUserId ? "user" : "all"}`; by.set(k, (by.get(k) ?? 0) + 1); }
console.log(`AppNotification emailed (all time): ${rows.length}`);
for (const [k, n] of by) console.log(`  ${n}× ${k}`);
await prisma.$disconnect();
// recipients of those e-mailed notifications: e-mail DOMAIN only
{
  const { prisma: p2 } = await import("@/lib/core/db");
  const Q = p2 as any;
  const ids = [...new Set((await Q.appNotification.findMany({ where: { tenantId: E.tenantId, emailedAt: { not: null } }, select: { recipientUserId: true } })).map((r: any) => r.recipientUserId).filter(Boolean))];
  const us = await Q.user.findMany({ where: { id: { in: ids } }, select: { email: true } });
  console.log("recipient domains:", JSON.stringify(us.map((u: any) => String(u.email ?? "").split("@")[1] ?? "<none>")));
  await p2.$disconnect();
}
