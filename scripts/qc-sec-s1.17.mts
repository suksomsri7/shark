// QC — SECRETARY S1.17 + S1.23 · Support ต่อแอป (openCaseFromApp · listCasesForUser · platform reply ไม่แทรกห้อง AI · push ผู้แจ้ง) · แจ้งเตือน (prefs · badge · กันสแปม · chat staff ตาม pref) · oracle ของผู้คุม
// สัญญา: ledger/secretary-briefs/sec-brief-S1.17.md · RESOLUTIONS R-K12 R-K20 · ต้องการ S1.4/S1.5
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.17.mts
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.17";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const NOTIFY = join(ROOT, "src/lib/ai/secretary/notify.ts");
if (!FORCED && !existsSync(NOTIFY)) { console.log(`⏭️  ${LABEL}: ยังไม่มี notify.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`); console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" })); process.exit(0); }
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

const { prisma } = await import("@/lib/core/db");
const support = (await import("@/lib/support/service")) as AnyMod;
const platform = (await import("@/lib/platform/support")) as AnyMod;
const push = (await import("@/lib/core/push")) as AnyMod;
const rooms = (await import("@/lib/ai/secretary/rooms").catch(() => null)) as AnyMod | null;
const notify = existsSync(NOTIFY) ? ((await import("@/lib/ai/secretary/notify").catch((e) => { console.log("  ⚠️ notify: " + errMsg(e)); return null; })) as AnyMod | null) : null;
const U = { owner: "qcs117-owner", staff: "qcs117-staff", s2: "qcs117-s2", pu: "qcs117-platform" };
let tid = "";
const cleanup = async () => {
  if (tid) { for (const m of ["supportMessage", "supportCase", "aiFeedback", "aiNotifyPref", "aiRoomMember", "aiRoomJob", "aiRoom", "aiProposal", "aiMessage", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "chatReadState", "chatConversationPref", "chatConversation", "chatContact", "appSystem", "membership"]) { try { await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }); } catch { /* */ } } try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); } }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s117-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await (prisma as AnyMod).aiNotifyPref?.deleteMany({ where: { userId: { startsWith: "qcs117-" } } }); } catch { /* */ }
  try { await prisma.pushDevice.deleteMany({ where: { expoToken: { startsWith: "ExponentPushToken[qcs117-" } } }); } catch { /* */ }
  try { await prisma.platformUser.deleteMany({ where: { id: U.pu } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs117-" } } }); } catch { /* */ }
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.17", slug: `qc-sec-s117-${Date.now().toString(36)}` } });
  tid = t.id;
  for (const id of [U.owner, U.staff, U.s2]) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: id } });
  const perms = { "ai.chat.send": true, "chat.conversation.read": true };
  await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], permissions: {} as never, acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.staff, role: "STAFF", unitAccess: ["*"], permissions: perms as never, acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.s2, role: "STAFF", unitAccess: ["*"], permissions: perms as never, acceptedAt: new Date() } });
  for (const uid of [U.owner, U.staff, U.s2]) await prisma.pushDevice.create({ data: { userId: uid, tenantId: tid, expoToken: `ExponentPushToken[qcs117-${uid}]`, platform: "ios" } });
  const pu = await prisma.platformUser.create({ data: { id: U.pu, email: `${U.pu}@example.com`, name: "ทีมงาน", role: "SUPPORT" } as never }).catch(async (e) => { console.log("  ⚠️ platformUser: " + errMsg(e)); return { id: U.pu } as AnyMod; });
  const actor = (userId: string, role: "OWNER" | "STAFF") => ({ kind: "member" as const, tenantId: tid, userId, membership: { role, unitAccess: ["*"], permissions: role === "STAFF" ? perms : {} } });
  const ctx = { tenantId: tid };
  const posts: AnyMod[] = []; const post = async (msgs: AnyMod[]) => { posts.push(...msgs); return { ok: true, tickets: msgs.map(() => ({ status: "ok" })) }; };
  if (!notify || !rooms || typeof support.openCaseFromApp !== "function") { for (const id of ["H-1", "H-2", "H-3", "H-4", "N-1", "N-2", "N-3", "N-4"]) skip(id, "support/notify", !notify ? "ไม่มี notify.ts" : !rooms ? "ไม่มี rooms.ts" : "ไม่มี openCaseFromApp"); }
  else {
    console.log("── H: Support ต่อแอป ──");
    const r = await rooms.startRoom({ tenantId: tid, actor: actor(U.staff, "STAFF") }, { instruction: "งานที่เลขาทำพลาด" });
    const c1 = await support.openCaseFromApp(ctx, { userId: U.staff, subject: "เลขาทำผิด", body: "ร่างใบเสนอราคาผิดราคา โทร 0812345678", category: "secretary_wrong", roomId: r.roomId });
    const row1 = await prisma.supportCase.findUnique({ where: { id: c1.id } });
    const c2 = await support.openCaseFromApp(ctx, { userId: U.s2, subject: "ถามการใช้งาน", body: "x", category: "nonsense", roomId: r.roomId });
    const row2 = await prisma.supportCase.findUnique({ where: { id: c2.id } });
    chk("H-1", "openCaseFromApp: source APP · category · roomId (ผู้แจ้งเห็นห้อง) · conversationId null · caseNo running · category ไม่รู้จัก ⇒ other · ห้องที่มองไม่เห็น (s2) ⇒ roomId null · AiFeedback DOWN สำหรับ secretary_wrong", row1?.source === "APP" && row1?.category === "secretary_wrong" && row1?.roomId === r.roomId && row1?.conversationId === null && row1?.caseNo === 1 && row2?.caseNo === 2 && row2?.category === "other" && row2?.roomId === null && (await prisma.aiFeedback.count({ where: { tenantId: tid, rating: "DOWN" } })) >= 1, JSON.stringify({ row1: { s: row1?.source, c: row1?.category, r: !!row1?.roomId, n: row1?.caseNo }, row2: { c: row2?.category, r: row2?.roomId } }).slice(0, 200));
    const lS = await support.listCasesForUser(ctx, U.staff, "STAFF"), lS2 = await support.listCasesForUser(ctx, U.s2, "STAFF"), lO = await support.listCasesForUser(ctx, U.owner, "OWNER");
    chk("H-2", "listCasesForUser: ผู้แจ้งเห็นเฉพาะของตัวเอง (1) · OWNER เห็นทั้งหมด (2) · meta มี caseNo/status/unreadCount", lS.length === 1 && lS[0].id === c1.id && lS2.length === 1 && lS2[0].id === c2.id && lO.length === 2 && typeof lO[0].unreadCount === "number" && typeof lO[0].caseNo === "number", `s=${lS.length} s2=${lS2.length} o=${lO.length}`);
    const okReply = await platform.addPlatformMessage(pu, c1.id, "เราตรวจแล้ว แก้ให้แล้วครับ", { post });
    const roomMsgs = await prisma.aiMessage.count({ where: { conversationId: r.conversationId, content: { startsWith: "🛟" } } });
    const helpPush = posts.filter((p) => String(p.data?.link ?? "").includes(`/help/${c1.id}`));
    const unreadS = await support.unreadCaseTotalForUser(ctx, U.staff, "STAFF"), unreadS2 = await support.unreadCaseTotalForUser(ctx, U.s2, "STAFF");
    chk("H-3", "ทีมงานตอบเคส APP: ไม่แทรกข้อความลงห้องเลขา · push ถึงผู้แจ้ง (staff) link /help/<id> ไม่ถึง s2/owner · unread ของผู้แจ้ง 1 · ของ s2 0 · status PENDING + assignee", okReply === true && roomMsgs === 0 && helpPush.length >= 1 && helpPush.every((p) => String(p.to).includes(U.staff)) && !posts.some((p) => String(p.to).includes(U.s2) || String(p.to).includes(U.owner)) && unreadS === 1 && unreadS2 === 0 && (await prisma.supportCase.findUnique({ where: { id: c1.id } }))?.status === "PENDING", JSON.stringify({ okReply, roomMsgs, helpPush: helpPush.length, unreadS, unreadS2 }).slice(0, 160));
    const resS2 = await support.setResolvedByShop(ctx, U.s2, "STAFF", c1.id);
    const resS = await support.setResolvedByShop(ctx, U.staff, "STAFF", c1.id);
    const asg = await platform.assignCase(pu, c2.id);
    const all = await platform.listAllCases({ source: "APP", category: "other" });
    const allAsg = await platform.listAllCases({ assigneePlatformUserId: pu.id });
    chk("H-4", "setResolvedByShop: คนอื่น false · ผู้แจ้ง true ⇒ RESOLVED · assignCase ⇒ assignee · listAllCases กรอง source/category/assignee", resS2 === false && resS === true && (await prisma.supportCase.findUnique({ where: { id: c1.id } }))?.status === "RESOLVED" && asg === true && all.length === 1 && all[0].id === c2.id && allAsg.some((c: AnyMod) => c.id === c2.id), JSON.stringify({ resS2, resS, asg, all: all.length, allAsg: allAsg.length }).slice(0, 160));

    console.log("── N: แจ้งเตือน ──");
    const p0 = await notify.getNotifyPrefs(U.staff, tid);
    const eK = await throws(() => notify.setNotifyPref(U.staff, { tenantId: tid, kind: "nope", mode: "ALL" }));
    const eM = await throws(() => notify.setNotifyPref(U.staff, { tenantId: tid, kind: "room", mode: "SOMETIMES" }));
    const p1 = await notify.setNotifyPref(U.staff, { tenantId: tid, kind: "room", mode: "OFF" });
    const pGlobal = await notify.setNotifyPref(U.s2, { tenantId: null, kind: "inbox", mode: "ASSIGNED" });
    chk("N-1", "prefs ปริยาย ALL ทั้ง 4 kind · kind/mode ผิด ⇒ throw ไทย · ตั้ง room OFF ต่อร้าน · ตั้ง inbox ASSIGNED แบบทุกร้าน (tenantId null) อ่านได้จากร้านนี้", ["inbox", "approval", "room", "help"].every((k) => p0[k] === "ALL") && thai(eK) && thai(eM) && p1.room === "OFF" && (await notify.getNotifyPrefs(U.s2, tid)).inbox === "ASSIGNED" && pGlobal.inbox === "ASSIGNED", JSON.stringify({ p0, eK, eM, p1 }).slice(0, 200));
    posts.length = 0;
    const NOW = new Date();
    const n1 = await notify.notifyUser(U.staff, tid, "room", { title: "ห้อง", body: "เสร็จแล้ว", data: { link: `/secretary/room/${r.roomId}` } }, { post, now: NOW });
    const n2 = await notify.notifyUser(U.owner, tid, "room", { title: "ห้อง", body: "เสร็จแล้ว", data: { link: `/secretary/room/${r.roomId}` } }, { post, now: NOW });
    const n3 = await notify.notifyUser(U.owner, tid, "room", { title: "ห้อง", body: "ซ้ำ", data: { link: `/secretary/room/${r.roomId}` } }, { post, now: new Date(NOW.getTime() + 30_000) });
    const n4 = await notify.notifyUser(U.owner, tid, "room", { title: "ห้อง", body: "หลัง 61 วิ", data: { link: `/secretary/room/${r.roomId}` } }, { post, now: new Date(NOW.getTime() + 61_000) });
    const a1 = await notify.notifyUser(U.s2, tid, "inbox", { title: "แชท", body: "ลูกค้าทัก", data: { link: "/inbox/x" } }, { post, now: NOW, assigneeUserId: U.staff });
    const a2 = await notify.notifyUser(U.s2, tid, "inbox", { title: "แชท", body: "ลูกค้าทัก", data: { link: "/inbox/y" } }, { post, now: NOW, assigneeUserId: U.s2 });
    chk("N-2", "notifyUser: staff room OFF ⇒ skipped pref · owner ⇒ sent 1 · ซ้ำ link ใน 60 วิ ⇒ skipped spam · หลัง 61 วิ ⇒ ส่ง · s2 inbox ASSIGNED: ไม่ใช่ผู้ดูแล ⇒ pref · เป็นผู้ดูแล ⇒ ส่ง · payload มี badge (number)", n1.skipped === "pref" && n1.sent === 0 && n2.sent === 1 && n3.skipped === "spam" && n4.sent === 1 && a1.skipped === "pref" && a2.sent === 1 && posts.length === 3 && posts.every((p) => typeof p.badge === "number"), JSON.stringify({ n1, n2, n3, n4, a1, a2, posts: posts.length, badge: posts[0]?.badge }).slice(0, 220));
    // badge: ห้องของ staff มี ASSISTANT ใหม่ + เคสที่ยังไม่อ่าน 1 (RESOLVED ยังนับ? — นับเฉพาะ PLATFORM ใหม่กว่า shopLastReadAt)
    await prisma.aiMessage.create({ data: { tenantId: tid, conversationId: r.conversationId, role: "ASSISTANT", content: "ตอบแล้ว" } });
    const bS = await notify.badgeTotalFor(U.staff, tid), bS2 = await notify.badgeTotalFor(U.s2, tid);
    await support.markCaseRead(ctx, c1.id);
    const bS_after = await notify.badgeTotalFor(U.staff, tid);
    chk("N-3", "badgeTotalFor: staff = ห้องเลขาที่ยังไม่อ่าน 1 + เคสที่ทีมตอบยังไม่อ่าน 1 = 2 · s2 = 0 · หลัง markCaseRead = 1", bS === 2 && bS2 === 0 && bS_after === 1, `bS=${bS} bS2=${bS2} after=${bS_after}`);
    // sendPushToChatStaff ตาม pref inbox
    const chatSys = await prisma.appSystem.create({ data: { tenantId: tid, type: "CHAT", name: "แชท QC" } as never });
    const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "WEBCHAT", externalUserId: `qcs117-guest-${Date.now().toString(36)}`, displayName: "ลูกค้า QC" } as never });
    const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "WEBCHAT", contactId: contact.id, status: "OPEN", assigneeUserId: U.staff } as never }).catch(async (e) => { console.log("  ⚠️ chatConversation: " + errMsg(e)); return null; });
    if (!conv) skip("N-4", "sendPushToChatStaff ตาม pref", "สร้าง chatConversation ไม่ได้ (ฟิลด์บังคับ) — ตรวจมือ");
    else {
      await notify.setNotifyPref(U.owner, { tenantId: tid, kind: "inbox", mode: "OFF" });
      posts.length = 0;
      const rsp = await push.sendPushToChatStaff({ tenantId: tid, systemId: chatSys.id, conversationId: conv.id, assigneeUserId: U.staff, title: "ลูกค้าทัก", body: "สวัสดี", data: { conversationId: conv.id } }, { post });
      const tos = posts.map((p) => String(p.to));
      chk("N-4", "sendPushToChatStaff: owner inbox OFF ⇒ ไม่ได้รับ · s2 ASSIGNED ไม่ใช่ผู้ดูแล ⇒ ไม่ได้รับ · staff (ผู้ดูแล · ALL) ⇒ ได้รับ · data.link /customers/<id> (R-S2.13j) + conversationId เดิม", rsp.sent === 1 && tos.some((t) => t.includes(U.staff)) && !tos.some((t) => t.includes(U.owner) || t.includes(U.s2)) && posts[0]?.data?.link === `/customers/${conv.id}` && posts[0]?.data?.conversationId === conv.id, JSON.stringify({ rsp, tos, data: posts[0]?.data }).slice(0, 200));
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
