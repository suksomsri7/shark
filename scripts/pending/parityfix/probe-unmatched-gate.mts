// @ts-nocheck — temporary lane probe (Job C2): who passes the "ยังไม่จับคู่" (unmatched inbound mail) gate. READ-ONLY on QC1.
import { readFileSync } from "node:fs";
const env = await import("../../acc-v2-env.mts");
const { host } = env.loadQcEnv();
if (!host.includes("ep-plain-art")) throw new Error("not QC1");
const { prisma } = await import("@/lib/core/db");
const emails = await import("@/lib/modules/crm/emails");
const { toMemberActor } = await import("@/lib/modules/member");
const { crmCan } = await import("@/lib/modules/crm/access");
const E = JSON.parse(readFileSync("scripts/crm-expected.json", "utf8"));
const out = [];
for (const key of ["owner", "manager", "nok", "thana"]) {
  const userId = E.users[key].userId;
  const m = await prisma.membership.findFirst({ where: { userId, tenantId: E.tenantId }, select: { role: true, unitAccess: true, permissions: true } });
  const ctx = { tenantId: E.tenantId, systemId: E.systemId, actorUserId: userId };
  const actor = toMemberActor(userId, m);
  const perms = Object.keys(m.permissions ?? {}).filter((k) => k.startsWith("crm.")).length;
  const row = async (label, a) => out.push({ who: label, role: a.role, unitAccess: a.unitAccess.length === 0 ? "[] (whole shop)" : a.unitAccess.includes("*") ? "[*] (whole shop)" : `${a.unitAccess.length} unit(s)`, crmPermKeys: Object.keys(a.permissions ?? {}).filter((k) => k.startsWith("crm.")).length, emailRead: crmCan(a, "crm.email.read"), unmatchedGate: await emails.canUseUnmatchedInbox(ctx, a).catch((e) => `ERR ${e.message}`) });
  await row(`QC ${key} (as seeded)`, actor);
  if (key === "manager") {
    await row("QC manager · unitAccess [] (whole shop), same permissions", { ...actor, unitAccess: [] });
    await row("QC manager · unitAccess [*], same permissions", { ...actor, unitAccess: ["*"] });
    await row("default MANAGER (whole shop, permissions {}) — the prod shape", { ...actor, unitAccess: [], permissions: {} });
  }
  void perms;
}
console.table(out);
console.log("JSON " + JSON.stringify(out));
await prisma.$disconnect();
