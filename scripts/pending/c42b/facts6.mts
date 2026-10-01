// READ-ONLY: chat conversations whose ChatContact.partyId is a CRM contact's party (c42b crm-panel triage)
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const chatSys = E.systems?.CHAT;
const convs = await P.chatConversation.findMany({ where: { systemId: chatSys }, select: { id: true, createdAt: true, contact: { select: { id: true, partyId: true, displayName: true, phone: true } } }, orderBy: { createdAt: "asc" } });
console.log("convs", convs.length);
const uid = (u: string) => E.users?.[u]?.userId;
const names = Object.fromEntries(Object.entries(E.users ?? {}).map(([k, v]: any) => [v.userId, k]));
for (const c of convs) {
  const pid = c.contact?.partyId;
  const crm = pid ? await P.crmContact.findMany({ where: { systemId: E.systemId, partyId: pid }, select: { id: true, name: true, ownerUserId: true, teamId: true } }) : [];
  console.log(c.id, c.contact?.displayName, "party", pid?.slice(-6), "crm:", JSON.stringify(crm.map((x: any) => [x.id.slice(-8), x.name, names[x.ownerUserId] ?? x.ownerUserId?.slice(-6)])));
}
await prisma.$disconnect();
