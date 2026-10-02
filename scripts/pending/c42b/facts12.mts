// READ-ONLY (c42b it5 · RV-9): chat rows left by the runner's N9 fixture (createExtraFixtures: ChatContact externalUserId
// `qc-btn-<rand>-<n>` · displayName `qc-btn-chat-…` · channel WEBCHAT · one ChatConversation each). Lists them with every row
// that references them, so the cleanup can be proven to touch only runner-made rows.
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
const cc = await P.chatContact.findMany({ where: { tenantId: E.tenantId, OR: [{ externalUserId: { startsWith: "qc-btn-" } }, { displayName: { startsWith: "qc-btn-chat-" } }] }, orderBy: { createdAt: "asc" } });
let tot = { cc: 0, cv: 0, msg: 0, rs: 0, pref: 0, ev: 0 };
for (const c of cc) {
  const cvs = await P.chatConversation.findMany({ where: { contactId: c.id }, select: { id: true, createdAt: true, channel: true } });
  tot.cc++;
  console.log("ChatContact", c.id, c.createdAt.toISOString(), c.channel, c.externalUserId, JSON.stringify(c.displayName), "party", c.partyId);
  for (const v of cvs) {
    const [msg, rs, pref, ev] = await Promise.all([P.chatMessage.count({ where: { conversationId: v.id } }), P.chatReadState.count({ where: { conversationId: v.id } }), P.chatConversationPref.count({ where: { conversationId: v.id } }), P.chatConversationEvent.count({ where: { conversationId: v.id } })]);
    tot.cv++; tot.msg += msg; tot.rs += rs; tot.pref += pref; tot.ev += ev;
    console.log("  ChatConversation", v.id, v.createdAt.toISOString(), v.channel, `messages=${msg} readStates=${rs} prefs=${pref} events=${ev}`);
  }
}
console.log("TOTAL", JSON.stringify(tot));
await prisma.$disconnect();
