// READ-ONLY (c42b dbg2): may each persona read the CHAT inbox? (crm-panel-* rows live on the chat room page; the page shows
// the room only when canReadChat → rbac.evaluate({module:"chat", action:"chat.conversation.read"}) — src/app/app/sys/[id]/page.tsx:63)
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const { evaluate } = (await import("@/lib/core/rbac" as string)) as any;
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
for (const u of ["owner", "manager", "nok", "thana"]) {
  const m = await P.membership.findFirst({ where: { userId: E.users[u].userId, tenantId: E.tenantId }, select: { role: true, unitAccess: true, permissions: true } });
  const ok = evaluate({ role: m.role, unitAccess: m.unitAccess, permissions: m.permissions }, { module: "chat", action: "chat.conversation.read" });
  console.log(u, m.role, "chat.conversation.read =", ok);
}
await prisma.$disconnect();
