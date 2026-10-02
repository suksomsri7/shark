// c42b it5 · RV-9 — ONE-OFF cleanup of the chat fixtures the runner's N9 fixture leaked into QC1 (ChatReadState FK RESTRICT made
// deleteExtraFixtures fail every run). Selection = exactly the facts12.mts selection (externalUserId `qc-btn-<rand>-<n>` AND
// displayName `qc-btn-chat-…`, channel WEBCHAT) AND every referencing row must be a runner-made read state (userId of a QC persona)
// with 0 messages — anything else aborts without writing. Run under scripts/with-gate-lock.sh (QC1 write).
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const h = accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const P = prisma as any;
const E = JSON.parse((await import("node:fs")).readFileSync("scripts/crm-expected.json", "utf8"));
if (process.env.SHARK_GATE_LOCK_MARKER !== "1") { console.error("not under the gate lock — stop"); process.exit(1); }
const personas = new Set(Object.values(E.users ?? {}).map((u: any) => u?.userId).filter(Boolean));
const cc = await P.chatContact.findMany({ where: { tenantId: E.tenantId, channel: "WEBCHAT", externalUserId: { startsWith: "qc-btn-" }, displayName: { startsWith: "qc-btn-chat-" } }, select: { id: true } });
const ccIds = cc.map((c: any) => c.id);
const cvIds = (await P.chatConversation.findMany({ where: { contactId: { in: ccIds } }, select: { id: true } })).map((c: any) => c.id);
const msgs = await P.chatMessage.count({ where: { conversationId: { in: cvIds } } });
const rs = await P.chatReadState.findMany({ where: { conversationId: { in: cvIds } }, select: { id: true, userId: true } });
const foreign = rs.filter((r: any) => !personas.has(r.userId));
console.log(`host ${h.host.split(".")[0]} · contacts ${ccIds.length} · conversations ${cvIds.length} · messages ${msgs} · readStates ${rs.length} (non-persona ${foreign.length})`);
if (msgs || foreign.length) { console.error("unexpected referencing rows — abort, nothing deleted"); process.exit(1); }
const out = await P.$transaction([
  P.chatConversationEvent.deleteMany({ where: { conversationId: { in: cvIds } } }),
  P.chatConversationPref.deleteMany({ where: { conversationId: { in: cvIds } } }),
  P.chatReadState.deleteMany({ where: { conversationId: { in: cvIds } } }),
  P.chatConversation.deleteMany({ where: { id: { in: cvIds } } }),
  P.chatContact.deleteMany({ where: { id: { in: ccIds } } }),
]);
console.log("deleted", JSON.stringify(out.map((x: any) => x.count)), "ids", JSON.stringify({ contacts: ccIds, conversations: cvIds }));
await prisma.$disconnect();
