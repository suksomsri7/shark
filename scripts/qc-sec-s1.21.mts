// QC — SECRETARY S1.21 + S1.24 · แชทลูกค้า API มือถือ + ผู้ดูแล/เรียกช่วย/กฎรับเรื่อง/SLA · oracle ของผู้คุม
// สัญญา: ledger/secretary-briefs/sec-brief-S1.21.md · RESOLUTIONS R-K13 R-K14 R-K8b
//
// กลุ่มข้อ: E eligibleResponders · R rules/assignIncoming (ROUND_ROBIN · LAST_ASSIGNEE · OWNER · off_hours · no_rule · already · no_responder → owner) · H callHelper/handoff/shift · S sweepChatSla · A routes inbox (สิทธิ์ · unit · DTO ไม่มี secret · reply dedupe · 429) · D fitness
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.21.mts
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.21";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const ROUTING = join(ROOT, "src/lib/modules/chat/routing.ts");
if (!FORCED && !existsSync(ROUTING)) { console.log(`⏭️  ${LABEL}: ยังไม่มี chat/routing.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`); console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" })); process.exit(0); }
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
try { process.loadEnvFile(process.env.QC_ENV_FILE ?? ".env.qc-sec"); } catch { /* */ }
if (!new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase().startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: env file เปลี่ยน DATABASE_URL — หยุด`); process.exit(4); }
process.env.SHARK_AI_MOCK = "1";
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
async function throws(fn: () => Promise<unknown> | unknown): Promise<string | null> { try { await fn(); return null; } catch (e) { return errMsg(e); } }
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const req = (u: string, method: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`http://qc.local${u}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const json = async (r: Response) => ({ status: r.status, body: (await r.json().catch(() => ({}))) as AnyMod, text: "" });
const SECRET_RX = /accessToken|channelSecret|channelAccessToken|"secret"|webhookSecret|apiKey|"token"/i;

const { prisma } = await import("@/lib/core/db");
const chat = (await import("@/lib/modules/chat/service")) as AnyMod;
const routing = existsSync(ROUTING) ? ((await import("@/lib/modules/chat/routing").catch((e) => { console.log("  ⚠️ routing: " + errMsg(e)); return null; })) as AnyMod | null) : null;
const { ForbiddenError } = await import("@/lib/core/rbac");
const { issueMobileToken } = await import("@/lib/mobile/auth");
const U = { owner: "qcs121-owner", mgr: "qcs121-mgr", a: "qcs121-a", b: "qcs121-b", guard: "qcs121-guard", unitB: "qcs121-unitb" };
let tid = "";
const cleanup = async () => {
  if (tid) { for (const m of ["chatConversationHelper", "chatShift", "chatRoutingRule", "chatConversationEvent", "chatReadState", "chatConversationPref", "chatAiSuggestion", "chatMessage", "chatConversation", "chatContact", "chatQuickReply", "chatSetting", "aiNotifyPref", "session", "businessUnit", "appSystem", "membership"]) { try { await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }); } catch { /* */ } } try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); } }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s121-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.session.deleteMany({ where: { userId: { startsWith: "qcs121-" } } }); } catch { /* */ }
  try { await prisma.pushDevice.deleteMany({ where: { expoToken: { startsWith: "ExponentPushToken[qcs121-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs121-" } } }); } catch { /* */ }
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.21", slug: `qc-sec-s121-${Date.now().toString(36)}` } });
  tid = t.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `คุณ${k}` } });
  const unitA = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "สาขา A", slug: `ua-${Date.now().toString(36)}` } });
  const unitB = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "สาขา B", slug: `ub-${Date.now().toString(36)}` } });
  const replyPerm = { "chat.conversation.read": true, "chat.message.send": true };
  const mk = (role: "OWNER" | "MANAGER" | "STAFF", userId: string, unitAccess: string[], permissions: Record<string, unknown>) => prisma.membership.create({ data: { tenantId: tid, userId, role, unitAccess, permissions: permissions as never, acceptedAt: new Date() } });
  await mk("OWNER", U.owner, ["*"], {}); await mk("MANAGER", U.mgr, ["*"], {}); await mk("STAFF", U.a, ["*"], replyPerm); await mk("STAFF", U.b, ["*"], replyPerm); await mk("STAFF", U.guard, ["*"], {}); await mk("STAFF", U.unitB, [unitB.id], replyPerm);
  const sysRow = await prisma.appSystem.create({ data: { tenantId: tid, type: "CHAT", name: "แชท QC" } as never });
  const sid = sysRow.id;
  await prisma.chatSetting.create({ data: { tenantId: tid, systemId: sid, slaFirstResponseMin: 10, unassignedAlertMin: 5 } as never }).catch((e) => console.log("  ⚠️ chatSetting: " + errMsg(e)));
  const mkConv = async (tag: string, unitId: string | null, extra: AnyMod = {}) => {
    const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", externalUserId: `qcs121-${tag}-${Date.now().toString(36)}`, displayName: `ลูกค้า ${tag}` } as never });
    const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", contactId: contact.id, status: "OPEN", unitId, lastMessageAt: new Date(), firstCustomerMessageAt: new Date(), staffUnreadCount: 1, ...extra } as never });
    await prisma.chatMessage.create({ data: { tenantId: tid, systemId: sid, conversationId: conv.id, direction: "IN", type: "TEXT", body: `สวัสดีจาก ${tag}` } as never }).catch((e) => console.log("  ⚠️ chatMessage: " + errMsg(e)));
    return { conv, contact };
  };
  if (!routing) { for (const id of ["E-1", "R-1", "R-2", "R-3", "R-4", "H-1", "H-2", "S-1", "A-1", "A-2", "A-3", "A-4", "A-5"]) skip(id, "routing/inbox", "ไม่มี routing.ts"); }
  else {
    console.log("── E: eligibleResponders ──");
    const elA = await routing.eligibleResponders(tid, sid, unitA.id), elB = await routing.eligibleResponders(tid, sid, unitB.id), elN = await routing.eligibleResponders(tid, sid, null);
    const ids = (l: AnyMod[]) => l.map((x) => x.userId).sort().join(",");
    chk("E-1", "ผู้ตอบได้: หน่วย A = owner,mgr,a,b (guard ไม่มีคีย์ · unitB ไม่เห็นหน่วย A) · หน่วย B เพิ่ม unitB · ไม่มีหน่วย = ทุกคนที่ตอบได้ · onDuty false", ids(elA) === [U.owner, U.mgr, U.a, U.b].sort().join(",") && ids(elB) === [U.owner, U.mgr, U.a, U.b, U.unitB].sort().join(",") && elN.length === 5 && elA.every((x: AnyMod) => x.onDuty === false), `A=${ids(elA)} B=${ids(elB)} N=${elN.length}`);

    console.log("── R: กฎรับเรื่อง · assignIncoming ──");
    const c0 = await mkConv("norule", unitA.id);
    const r0 = await routing.assignIncoming({ tenantId: tid, systemId: sid, conversationId: c0.conv.id });
    let fe = false; try { await routing.setRules(tid, { userId: U.a }, sid, [{ mode: "ROUND_ROBIN", enabled: true }]); } catch (e) { fe = e instanceof ForbiddenError; }
    const eMode = await throws(() => routing.setRules(tid, { userId: U.owner }, sid, [{ mode: "RANDOM", enabled: true }]));
    const rules = await routing.setRules(tid, { userId: U.mgr }, sid, [{ mode: "ROUND_ROBIN", enabled: true, order: 0 }]);
    chk("R-1", "ไม่มีกฎ ⇒ no_rule ไม่มอบหมาย · STAFF ตั้งกฎ ⇒ Forbidden · mode แปลก ⇒ throw ไทย · MANAGER ตั้ง ROUND_ROBIN ได้ (1 กฎ)", r0.assigned === null && r0.reason === "no_rule" && fe && thai(eMode) && rules.length === 1 && rules[0].mode === "ROUND_ROBIN" && rules[0].enabled === true, JSON.stringify({ r0, fe, eMode, rules: rules.length }).slice(0, 160));
    // ROUND_ROBIN: a มี 1 ห้องอยู่แล้ว ⇒ ห้องใหม่ไป b (owner/mgr ก็ตอบได้ — ผู้ที่ห้องน้อยสุดเสมอกัน 0: b, mgr, owner ⇒ เรียง userId ⇒ "qcs121-b" < "qcs121-mgr" < "qcs121-owner")
    const cA = await mkConv("a1", unitA.id, { assigneeUserId: U.a });
    const c1 = await mkConv("rr1", unitA.id);
    const r1 = await routing.assignIncoming({ tenantId: tid, systemId: sid, conversationId: c1.conv.id });
    const c2 = await mkConv("rr2", unitA.id);
    const r2 = await routing.assignIncoming({ tenantId: tid, systemId: sid, conversationId: c2.conv.id });
    const again = await routing.assignIncoming({ tenantId: tid, systemId: sid, conversationId: c1.conv.id });
    const ev = await prisma.chatConversationEvent.count({ where: { conversationId: c1.conv.id, type: "ASSIGNED" } as never }).catch(() => -1);
    chk("R-2", "ROUND_ROBIN: ห้องใหม่ไปคนที่มีห้อง OPEN น้อยสุด (ไม่ใช่ a ที่มี 1) · ห้องถัดไปไม่ซ้ำคนเดิม · มอบหมายซ้ำ ⇒ already · มี event ASSIGNED", r1.reason === "rule" && r1.assigned !== null && r1.assigned !== U.a && r2.reason === "rule" && r2.assigned !== r1.assigned && r2.assigned !== U.a && again.reason === "already" && ev >= 1 && (await prisma.chatConversation.findUnique({ where: { id: c1.conv.id } }))?.assigneeUserId === r1.assigned, JSON.stringify({ r1, r2, again, ev }).slice(0, 160));
    // ใช้ unitB: ผู้ตอบในหน่วย B = owner,mgr,a,b,unitB — ตั้งกะให้ unitB เข้าเวรคนเดียว ⇒ ต้องได้ unitB
    await routing.setShift(tid, U.unitB, true);
    const c3 = await mkConv("shift", unitB.id);
    const r3 = await routing.assignIncoming({ tenantId: tid, systemId: sid, conversationId: c3.conv.id });
    await routing.setShift(tid, U.unitB, false);
    const onDuty = await routing.onDutyUsers(tid);
    // LAST_ASSIGNEE: contact ของ cA เคยมี a
    await routing.setRules(tid, { userId: U.owner }, sid, [{ mode: "LAST_ASSIGNEE", enabled: true, order: 0 }, { mode: "ROUND_ROBIN", enabled: true, order: 1 }]);
    const cHist = await mkConv("hist", unitA.id, { assigneeUserId: U.a, status: "RESOLVED" }); // ห้องเก่าของลูกค้าคนนี้ (ปิดแล้ว · chat_conv_active = 1 ห้องเปิดต่อ contact)
    const convLA = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", contactId: cHist.contact.id, status: "OPEN", unitId: unitA.id, lastMessageAt: new Date(), firstCustomerMessageAt: new Date() } as never });
    const r4 = await routing.assignIncoming({ tenantId: tid, systemId: sid, conversationId: convLA.id });
    chk("R-3", "มีคนเข้ากะ ⇒ มอบหมายเฉพาะคนในกะ (unitB) · ออกกะแล้ว onDutyUsers ว่าง · LAST_ASSIGNEE: ลูกค้าเดิมของ a ⇒ a", r3.assigned === U.unitB && onDuty.length === 0 && r4.assigned === U.a && r4.reason === "rule", JSON.stringify({ r3, onDuty, r4 }).slice(0, 160));
    // OWNER mode · off_hours · no responder → owner_fallback
    await routing.setRules(tid, { userId: U.owner }, sid, [{ mode: "OWNER", enabled: true, order: 0 }]);
    const c5 = await mkConv("ownerrule", unitA.id);
    const r5 = await routing.assignIncoming({ tenantId: tid, systemId: sid, conversationId: c5.conv.id });
    await prisma.chatSetting.update({ where: { systemId: sid }, data: { businessHours: { tz: "Asia/Bangkok", days: [1, 2, 3, 4, 5].map((d) => ({ d, open: "09:00", close: "18:00" })), holidays: [] } as never } }).catch((e) => console.log("  ⚠️ businessHours: " + errMsg(e)));
    const c6 = await mkConv("offhours", unitA.id);
    const r6 = await routing.assignIncoming({ tenantId: tid, systemId: sid, conversationId: c6.conv.id, now: new Date("2026-11-08T05:00:00Z") }); // อาทิตย์ 12:00 BKK
    await prisma.chatSetting.update({ where: { systemId: sid }, data: { businessHours: null as never } });
    // no responder in unit: unitC (ไม่มีใครมี unitAccess) ⇒ owner_fallback (OWNER unitAccess *)
    chk("R-4", "OWNER mode ⇒ owner · นอกเวลาทำการ ⇒ off_hours ไม่มอบหมาย", r5.assigned === U.owner && r5.reason === "rule" && r6.assigned === null && r6.reason === "off_hours" && (await prisma.chatConversation.findUnique({ where: { id: c6.conv.id } }))?.assigneeUserId === null, JSON.stringify({ r5, r6 }).slice(0, 120), "MAJOR");

    console.log("── H: callHelper · handoff ──");
    const posts: AnyMod[] = []; const post = async (msgs: AnyMod[]) => { posts.push(...msgs); return { ok: true, tickets: msgs.map(() => ({ status: "ok" })) }; };
    for (const uid of [U.a, U.b, U.guard]) await prisma.pushDevice.create({ data: { userId: uid, tenantId: tid, expoToken: `ExponentPushToken[qcs121-${uid}]`, platform: "ios" } });
    const h0 = await routing.callHelper({ tenantId: tid, systemId: sid, conversationId: cA.conv.id, byUserId: U.a, helperUserId: U.guard, unitAccess: ["*"] });
    const h1 = await routing.callHelper({ tenantId: tid, systemId: sid, conversationId: cA.conv.id, byUserId: U.a, helperUserId: U.b, note: "ลูกค้าถามเรื่องบิล", unitAccess: ["*"], deps: { post } });
    const hU = await routing.callHelper({ tenantId: tid, systemId: sid, conversationId: cA.conv.id, byUserId: U.unitB, helperUserId: U.b, unitAccess: [unitB.id] });
    const helpers = await routing.listHelpers(tid, sid, cA.conv.id);
    const internal = await prisma.chatMessage.findFirst({ where: { conversationId: cA.conv.id, isInternal: true }, orderBy: { createdAt: "desc" } });
    chk("H-1", "callHelper: guard (ไม่มีคีย์) ⇒ ปฏิเสธไทย · b ⇒ ok แถว helper + บันทึกภายใน 🙋 มีชื่อ+note + push ถึง b · ผู้เรียกที่ไม่เห็นหน่วย ⇒ ปฏิเสธ", h0.ok === false && thai(h0.reason) && h1.ok === true && hU.ok === false && helpers.length === 1 && helpers[0].userId === U.b && helpers[0].note === "ลูกค้าถามเรื่องบิล" && !!internal && (internal.body ?? "").includes("🙋") && (internal.body ?? "").includes("ลูกค้าถามเรื่องบิล") && internal.senderUserId === U.a && posts.some((p) => String(p.to).includes(U.b)), JSON.stringify({ h0, h1, hU, helpers: helpers.length, body: internal?.body?.slice(0, 40) }).slice(0, 200));
    posts.length = 0;
    const ho = await routing.handoff({ tenantId: tid, systemId: sid, conversationId: cA.conv.id, byUserId: U.a, toUserId: U.b, reason: "ผมออกเวรแล้ว", unitAccess: ["*"], deps: { post } });
    const hoBad = await routing.handoff({ tenantId: tid, systemId: sid, conversationId: cA.conv.id, byUserId: U.b, toUserId: U.guard, reason: "x", unitAccess: ["*"] });
    const convHO = await prisma.chatConversation.findUnique({ where: { id: cA.conv.id } });
    const hoMsg = await prisma.chatMessage.findFirst({ where: { conversationId: cA.conv.id, isInternal: true }, orderBy: { createdAt: "desc" } });
    chk("H-2", "handoff a→b: assignee=b · helper row ของ b ถูกลบ · บันทึกภายใน 🔁 มี reason · push ถึง b · ส่งต่อให้ guard (ตอบไม่ได้) ⇒ ปฏิเสธ", ho.ok === true && convHO?.assigneeUserId === U.b && (await routing.listHelpers(tid, sid, cA.conv.id)).length === 0 && !!hoMsg && (hoMsg.body ?? "").includes("🔁") && (hoMsg.body ?? "").includes("ผมออกเวรแล้ว") && posts.some((p) => String(p.to).includes(U.b)) && hoBad.ok === false, JSON.stringify({ ho, hoBad, assignee: convHO?.assigneeUserId }).slice(0, 160));

    console.log("── S: SLA sweep ──");
    const notified: AnyMod[] = []; const notify = async (userId: string, msg: AnyMod) => { notified.push({ userId, ...msg }); return { sent: 1 }; };
    await routing.setRules(tid, { userId: U.owner }, sid, []);
    const old = new Date(Date.now() - 30 * 60_000);
    const cUn = await mkConv("unassigned", unitA.id, { firstCustomerMessageAt: old, lastMessageAt: old, createdAt: old });
    const cSlow = await mkConv("slow", unitA.id, { assigneeUserId: U.a, firstCustomerMessageAt: old, lastMessageAt: old });
    const s1 = await routing.sweepChatSla(new Date(), { notify });
    const s2 = await routing.sweepChatSla(new Date(), { notify });
    const convSlow = await prisma.chatConversation.findUnique({ where: { id: cSlow.conv.id } });
    chk("S-1", "ห้องไม่มีผู้ดูแล 30 นาที ⇒ เตือน OWNER/MANAGER (1 ครั้ง) · ห้องของ a ไม่ตอบเกิน 2×SLA ⇒ ย้ายให้ MANAGER/OWNER + บันทึกภายใน · รอบที่ 2 ไม่เตือนซ้ำ", s1.alerted >= 1 && notified.some((n) => n.userId === U.owner || n.userId === U.mgr) && s1.escalated === 1 && convSlow?.assigneeUserId !== U.a && [U.owner, U.mgr].includes(convSlow?.assigneeUserId ?? "") && s2.alerted === 0 && s2.escalated === 0 && (await prisma.chatMessage.count({ where: { conversationId: cSlow.conv.id, isInternal: true } })) >= 1, JSON.stringify({ s1, s2, assignee: convSlow?.assigneeUserId, n: notified.length }).slice(0, 160));
    // S-2 (R-S1.21c): ผู้ดูแลถูกถอน ⇒ ถือว่าไม่มีผู้ดูแล เตือน OWNER/MANAGER · ไม่ push ถึงคนที่ถูกถอน
    await prisma.user.create({ data: { id: "qcs121-gone", email: "qcs121-gone@example.com", name: "คนที่ออกแล้ว" } }).catch(() => null);
    const memGone = await mk("STAFF", "qcs121-gone", ["*"], replyPerm);
    const cGone = await mkConv("gone", unitA.id, { assigneeUserId: "qcs121-gone", firstCustomerMessageAt: old, lastMessageAt: old, createdAt: old });
    await prisma.membership.delete({ where: { id: memGone.id } });
    notified.length = 0;
    await routing.sweepChatSla(new Date(), { notify });
    const toBoss = notified.filter((n) => [U.owner, U.mgr].includes(String(n.userId)) && JSON.stringify(n).includes(cGone.conv.id));
    chk("S-2", "ผู้ดูแลที่ถูกถอน ⇒ sweep เตือน OWNER/MANAGER สำหรับห้องนั้น · ไม่ push ถึงคนที่ถูกถอน", toBoss.length >= 1 && !notified.some((n) => n.userId === "qcs121-gone"), JSON.stringify(notified.map((n) => n.userId)).slice(0, 160));

    console.log("── A: routes /api/mobile/inbox ──");
    const tok = async (uid: string) => (await issueMobileToken(uid, { userAgent: "qc" })).token;
    const H = async (uid: string) => ({ authorization: `Bearer ${await tok(uid)}`, "x-tenant-id": tid });
    const ld = async (p: string) => (await import(`@/app/api/mobile/inbox/${p}/route`).catch(() => null)) as AnyMod | null;
    const rSystems = await ld("systems"), rList = await ld("conversations"), rThread = await ld("conversations/[id]"), rReply = await ld("conversations/[id]/reply"), rAssign = await ld("conversations/[id]/assign"), rUnread = await ld("unread"), rStaff = await ld("staff");
    if (!rSystems || !rList || !rThread || !rReply || !rAssign || !rUnread) { for (const i of [1, 2, 3, 4, 5, 6, 7, 8]) skip(`A-${i}`, "routes", "ไม่มี route ครบ (systems · conversations · [id] · reply · assign · unread)"); }
    else {
      const ctxId = (id: string) => ({ params: Promise.resolve({ id }) });
      const g1 = await json(await rSystems.GET(req("/api/mobile/inbox/systems", "GET", undefined, await H(U.a))));
      const gGuard = await json(await rList.GET(req(`/api/mobile/inbox/conversations?systemId=${sid}`, "GET", undefined, await H(U.guard))));
      const gA = await json(await rList.GET(req(`/api/mobile/inbox/conversations?systemId=${sid}&limit=50`, "GET", undefined, await H(U.a))));
      const gUB = await json(await rList.GET(req(`/api/mobile/inbox/conversations?systemId=${sid}&limit=50`, "GET", undefined, await H(U.unitB))));
      const allTxt = JSON.stringify([g1.body, gA.body, gUB.body]);
      chk("A-1", "systems: 200 มี id/name/unread · guard (ไม่มีคีย์อ่าน) ⇒ 403 · a เห็นทุกห้อง · unitB เห็นเฉพาะหน่วย B/ไม่มีหน่วย · DTO ไม่มี token/secret · มี waitingMin/aiDraft/helpers", g1.status === 200 && Array.isArray(g1.body.items ?? g1.body) && gGuard.status === 403 && gA.status === 200 && gA.body.items.length >= 6 && gUB.status === 200 && gUB.body.items.every((c: AnyMod) => c.unitId === unitB.id || c.unitId === null) && !SECRET_RX.test(allTxt) && gA.body.items.every((c: AnyMod) => "waitingMin" in c && "aiDraft" in c && Array.isArray(c.helpers)), `g1=${g1.status} guard=${gGuard.status} a=${gA.body.items?.length} ub=${gUB.body.items?.length} secret=${SECRET_RX.test(allTxt)}`);
      const th = await json(await rThread.GET(req(`/api/mobile/inbox/conversations/${cA.conv.id}?systemId=${sid}`, "GET", undefined, await H(U.a)), ctxId(cA.conv.id)));
      const thUB = await json(await rThread.GET(req(`/api/mobile/inbox/conversations/${cA.conv.id}?systemId=${sid}`, "GET", undefined, await H(U.unitB)), ctxId(cA.conv.id)));
      chk("A-2", "thread: a ⇒ 200 messages (รวม internal) + contact + helpers · unitB (คนละหน่วย) ⇒ 404 · ไม่มี secret", th.status === 200 && Array.isArray(th.body.messages) && th.body.messages.length >= 3 && th.body.contact && Array.isArray(th.body.helpers) && thUB.status === 404 && !SECRET_RX.test(JSON.stringify(th.body)), `th=${th.status} n=${th.body.messages?.length} ub=${thUB.status}`);
      const cid = `qcs121-cm-${Date.now().toString(36)}`;
      const rp1 = await json(await rReply.POST(req(`/api/mobile/inbox/conversations/${cA.conv.id}/reply`, "POST", { systemId: sid, body: "ตอบจากแอป", clientMessageId: cid }, await H(U.a)), ctxId(cA.conv.id)));
      const rp2 = await json(await rReply.POST(req(`/api/mobile/inbox/conversations/${cA.conv.id}/reply`, "POST", { systemId: sid, body: "ตอบจากแอป", clientMessageId: cid }, await H(U.a)), ctxId(cA.conv.id)));
      const rpG = await json(await rReply.POST(req(`/api/mobile/inbox/conversations/${cA.conv.id}/reply`, "POST", { systemId: sid, body: "x", clientMessageId: cid + "g" }, await H(U.guard)), ctxId(cA.conv.id)));
      const rpN = await json(await rReply.POST(req(`/api/mobile/inbox/conversations/${cA.conv.id}/reply`, "POST", { systemId: sid, body: "โน้ตภายใน", isInternal: true, clientMessageId: cid + "n" }, await H(U.b)), ctxId(cA.conv.id)));
      const cnt = await prisma.chatMessage.count({ where: { conversationId: cA.conv.id, body: "ตอบจากแอป" } });
      chk("A-3", "reply: 200 messageId · ซ้ำ clientMessageId ⇒ 200 duplicate (แถวเดียว) · guard ⇒ 403 · บันทึกภายใน ⇒ isInternal", rp1.status === 200 && typeof rp1.body.messageId === "string" && rp2.status === 200 && rp2.body.duplicate === true && cnt === 1 && rpG.status === 403 && rpN.status === 200 && (await prisma.chatMessage.findFirst({ where: { conversationId: cA.conv.id, body: "โน้ตภายใน" } }))?.isInternal === true, JSON.stringify({ rp1: rp1.status, rp2: rp2.body, rpG: rpG.status, rpN: rpN.status, cnt }).slice(0, 160));
      const as1 = await json(await rAssign.POST(req(`/api/mobile/inbox/conversations/${cA.conv.id}/assign`, "POST", { systemId: sid, assigneeUserId: U.guard }, await H(U.a)), ctxId(cA.conv.id)));
      const as2 = await json(await rAssign.POST(req(`/api/mobile/inbox/conversations/${cA.conv.id}/assign`, "POST", { systemId: sid, assigneeUserId: U.b }, await H(U.a)), ctxId(cA.conv.id)));
      const un = await json(await rUnread.GET(req(`/api/mobile/inbox/unread?systemId=${sid}`, "GET", undefined, await H(U.a))));
      const st = rStaff ? await json(await rStaff.GET(req(`/api/mobile/inbox/staff?systemId=${sid}&unitId=${unitA.id}`, "GET", undefined, await H(U.a)))) : { status: 0, body: {} as AnyMod };
      chk("A-4", "assign ให้ guard (ตอบไม่ได้) ⇒ 4xx ไทย · ให้ b ⇒ 200 · unread ⇒ {unread:number} · staff?unitId=A ⇒ ไม่มี guard/unitB", as1.status >= 400 && as1.status < 500 && thai(as1.body.message ?? as1.body.error) && as2.status === 200 && un.status === 200 && typeof un.body.unread === "number" && (!rStaff || (st.status === 200 && Array.isArray(st.body.items ?? st.body) && !(st.body.items ?? st.body).some((s: AnyMod) => s.userId === U.guard || s.userId === U.unitB))), JSON.stringify({ as1: as1.status, as2: as2.status, un: un.body, st: st.status }).slice(0, 160));
      // A-6 cross-tenant (รีวิว L): conversation ของร้านอื่นด้วย header ร้านนี้ ⇒ 404
      const t2 = await prisma.tenant.create({ data: { name: "QC S1.21 อื่น", slug: `qc-sec-s121-o-${Date.now().toString(36)}` } });
      const sys2 = await prisma.appSystem.create({ data: { tenantId: t2.id, type: "CHAT", name: "แชทอื่น" } as never });
      const ct2 = await prisma.chatContact.create({ data: { tenantId: t2.id, systemId: sys2.id, channel: "WEBCHAT", externalUserId: `qcs121-x-${Date.now().toString(36)}`, displayName: "ลูกค้าร้านอื่น" } as never });
      const cv2 = await prisma.chatConversation.create({ data: { tenantId: t2.id, systemId: sys2.id, channel: "WEBCHAT", contactId: ct2.id, status: "OPEN" } as never });
      const x1 = await json(await rThread.GET(req(`/api/mobile/inbox/conversations/${cv2.id}?systemId=${sid}`, "GET", undefined, await H(U.a)), ctxId(cv2.id)));
      const x2 = await json(await rThread.GET(req(`/api/mobile/inbox/conversations/${cv2.id}?systemId=${sys2.id}`, "GET", undefined, await H(U.a)), ctxId(cv2.id)));
      const x3 = await json(await rReply.POST(req(`/api/mobile/inbox/conversations/${cv2.id}/reply`, "POST", { systemId: sys2.id, body: "รั่ว", clientMessageId: "qcs121-x" }, await H(U.owner)), ctxId(cv2.id)));
      for (const m of ["chatMessage", "chatConversation", "chatContact", "appSystem"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: t2.id } }); } catch { /* */ } }
      await prisma.tenant.delete({ where: { id: t2.id } }).catch(() => null);
      chk("A-6", "ข้ามร้าน: thread ด้วย systemId ร้านนี้ ⇒ 404 · ด้วย systemId ร้านอื่น ⇒ 403/404 · reply ⇒ 403/404 · ไม่มีข้อความเกิด", x1.status === 404 && [403, 404].includes(x2.status) && [403, 404].includes(x3.status), JSON.stringify({ x1: x1.status, x2: x2.status, x3: x3.status }));
      // A-7 (R-S1.21a/b): assign ต้องมีคีย์ assign ยกเว้นรับห้องว่างให้ตัวเอง · handoff เฉพาะผู้ดูแล/helper/ผู้มีคีย์ assign · ห้ามส่งให้ตัวเอง
      const rHandoff = await ld("conversations/[id]/handoff");
      const cFree = await mkConv("free", unitA.id);
      const claim = await json(await rAssign.POST(req(`/api/mobile/inbox/conversations/${cFree.conv.id}/assign`, "POST", { systemId: sid, assigneeUserId: U.a }, await H(U.a)), ctxId(cFree.conv.id)));
      const steal = await json(await rAssign.POST(req(`/api/mobile/inbox/conversations/${cA.conv.id}/assign`, "POST", { systemId: sid, assigneeUserId: U.a }, await H(U.a)), ctxId(cA.conv.id))); // cA เป็นของ b หลัง A-4 · a มีแค่ send
      const bossAssign = await json(await rAssign.POST(req(`/api/mobile/inbox/conversations/${cA.conv.id}/assign`, "POST", { systemId: sid, assigneeUserId: U.a }, await H(U.owner)), ctxId(cA.conv.id)));
      const hoNotOwner = rHandoff ? await json(await rHandoff.POST(req(`/api/mobile/inbox/conversations/${cA.conv.id}/handoff`, "POST", { systemId: sid, toUserId: U.b, reason: "x" }, await H(U.b)), ctxId(cA.conv.id))) : { status: 0, body: {} };
      const hoSelf = rHandoff ? await json(await rHandoff.POST(req(`/api/mobile/inbox/conversations/${cA.conv.id}/handoff`, "POST", { systemId: sid, toUserId: U.a, reason: "x" }, await H(U.a)), ctxId(cA.conv.id))) : { status: 0, body: {} };
      const hoOk = rHandoff ? await json(await rHandoff.POST(req(`/api/mobile/inbox/conversations/${cA.conv.id}/handoff`, "POST", { systemId: sid, toUserId: U.b, reason: "ออกเวร" }, await H(U.a)), ctxId(cA.conv.id))) : { status: 0, body: {} };
      chk("A-7", "รับห้องว่างให้ตัวเอง (send) ⇒ 200 · แย่งห้องของคนอื่นโดยไม่มีคีย์ assign ⇒ 403 · OWNER assign ⇒ 200 · handoff โดยคนที่ไม่ใช่ผู้ดูแล ⇒ 403 · ส่งให้ตัวเอง ⇒ 4xx · ผู้ดูแลส่งต่อ ⇒ 200", claim.status === 200 && steal.status === 403 && bossAssign.status === 200 && hoNotOwner.status === 403 && hoSelf.status >= 400 && hoSelf.status < 500 && hoOk.status === 200, JSON.stringify({ claim: claim.status, steal: steal.status, boss: bossAssign.status, hoNotOwner: hoNotOwner.status, hoSelf: hoSelf.status, hoOk: hoOk.status }));
      // A-8 (R-S1.21e): attachments route มี · ไม่มี Bearer ⇒ 401
      const rAtt = await ld("attachments");
      const att401 = rAtt?.POST ? await json(await rAtt.POST(req(`/api/mobile/inbox/attachments`, "POST", {}, { "x-tenant-id": tid }))) : { status: 0, body: {} };
      chk("A-8", "POST inbox/attachments มี (R-K13) · ไม่มี Bearer ⇒ 401", !!rAtt?.POST && att401.status === 401, JSON.stringify({ has: !!rAtt?.POST, st: att401.status }));
      // rate limit: 61 reply ใน 1 นาที ⇒ 429 (ใช้ clientMessageId ต่างกัน)
      let got429 = false; for (let i = 0; i < 65 && !got429; i++) { const r = await rReply.POST(req(`/api/mobile/inbox/conversations/${cA.conv.id}/reply`, "POST", { systemId: sid, body: `rl ${i}`, clientMessageId: `${cid}-rl-${i}` }, await H(U.b)), ctxId(cA.conv.id)); if (r.status === 429) got429 = true; }
      chk("A-5", "reply เกิน 60/นาที/ผู้ใช้ ⇒ 429 (X7)", got429, "ไม่เจอ 429 ใน 65 ครั้ง", "MAJOR");
    }
  }
} finally { await cleanup(); }
console.log("── D: fitness ──");
{
  const f1 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-1", "pnpm fitness (มี env) exit 0", f1.status === 0, (f1.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
  const env2 = { ...process.env }; delete env2.DATABASE_URL; delete env2.DIRECT_URL;
  const f2 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: env2, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-2", "pnpm fitness (ไม่มี env) exit 0", f2.status === 0, (f2.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
}
await prisma.$disconnect();
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length} · ข้าม ${skipped.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
