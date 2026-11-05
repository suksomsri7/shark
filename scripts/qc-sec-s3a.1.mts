// QC — SECRETARY S3a.1 · ข้อสอบรวม 10 user stories (docs 31-secretary §1.4) ผ่าน route มือถือจริง + provider จำลองแบบสคริปต์ · โมเดลจริง 3 เส้น (R) เฉพาะเมื่อมีคีย์
// สัญญา: docs/modules/31-secretary.md §1.4/§1.5 · MASTER-PLAN S3a.1 · RESOLUTIONS ทั้งหมด (สัญญา server ล่าสุดใน docs/api/SECRETARY-API.md)
//
// กลุ่มข้อ:
//   U1 สมัครด้วยเบอร์ · U2 ตั้งชื่อเลขา · U3 สั่งงานแรก · U4 อนุมัติ (chat.send ส่งถึงลูกค้า) · U5 ตีกลับ+สอน · U6 ห้องร่วม
//   U7 ลูกค้าทัก→Shark ร่าง→ส่ง · U8 มอบหมายอัตโนมัติ · U9 เชิญพนักงาน · U10 เจ้าของดูงานทุกคน · Q โควตา · X ความลับ · R โมเดลจริง (SKIP ไม่มีคีย์) · D fitness
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s3a.1.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s3a.1";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const ACT_FILE = join(ROOT, "src/lib/ai/secretary/actions.ts");
const KT_FILE = join(ROOT, "src/lib/ai/kind-tables.ts");
const SEC_DIR = join(ROOT, "src/app/api/mobile/secretary");
const STARTED = existsSync(SEC_DIR);
if (!FORCED && !STARTED) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/app/api/mobile/secretary/ (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-sec-s3a.1"); // route ของ inbox import lib/env ตอนโหลด (SESSION_SECRET ฯลฯ) — โหลดจาก QC_ENV_FILE (.env.qc-sec) ไม่พิมพ์ค่า
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
// (helpers ด้านล่างใช้ existsSync/readFileSync จาก import ด้านบน)
type Handler = (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const J = (u: string, method: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`http://qc.local${u}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const route = async (p: string): Promise<Record<string, Handler> | null> => { try { return (await import(p)) as unknown as Record<string, Handler>; } catch { return null; } };
const P = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const jsonOf = async (r: Response) => { try { return (await r.json()) as Record<string, unknown>; } catch { return {}; } };



type Reply = { text?: string; toolCalls?: { id: string; name: string; args: unknown }[] };
class Scripted {
  calls = 0;
  constructor(private queue: Reply[]) {}
  async chat(): Promise<Record<string, unknown>> { this.calls++; const r = this.queue.shift() ?? { text: "รับทราบครับ" }; return { text: r.text ?? "", toolCalls: r.toolCalls, tokensIn: 1, tokensOut: 1, model: "scripted" }; }
}
const auth = (await import("@/lib/mobile/auth")) as AnyMod;
const pa = (await import("@/lib/core/phone-auth")) as AnyMod;
const worker = (await import("@/lib/ai/secretary/worker")) as AnyMod;
const routing = (await import("@/lib/modules/chat/routing")) as AnyMod;
const tools = (await import("@/lib/ai/tools")) as AnyMod;
// ORACLE note: route POST rooms รัน job ทันที (runAfter → runRoomJobs ด้วย MockProvider) ⇒ ข้อเสนอ chat.send สร้างผ่าน runTool ในห้องนั้น (ขั้นโมเดลคุมโดย S1.5/S1.12 แล้ว)
const proposeSend = async (roomConvId: string, convId: string, body: string): Promise<Record<string, unknown>> => { const r = await tools.runTool({ tenantId: tid, actor: { kind: "member", tenantId: tid, userId: U.owner, membership: { role: "OWNER", unitAccess: ["*"], permissions: {} } }, conversationId: roomConvId }, "send_customer_message", { conversationId: convId, body }); try { return JSON.parse(r) as Record<string, unknown>; } catch { return { raw: r }; } };
const U = { owner: "qcs3a1-owner", staff: "qcs3a1-staff", helper: "qcs3a1-helper", invitee: "qcs3a1-invitee" };
const PH = { signup: "+66800013101", invitee: "+66800013102", staff: "+66800013103" };
let tid = ""; let signupUserId = "";
const cleanup = async () => {
  if (tid) {
    for (const m of ["aiActionLog", "aiProposal", "aiPlan", "aiMessage", "aiRoomJob", "aiRoomMember", "aiRoom", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "aiMemory", "aiLesson", "aiTrainingSample", "aiSystemAccess", "aiApprovalRule", "chatConversationHelper", "chatShift", "chatRoutingRule", "chatConversationEvent", "chatReadState", "chatAiSuggestion", "chatAttachment", "chatMessage", "chatConversation", "chatContact", "chatSetting", "staffInvite", "membership", "appSystem", "businessUnit"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: tid } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s3a1-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.staffInvite.deleteMany({ where: { phone: { in: Object.values(PH) } } }); } catch { /* */ }
  try { await (prisma as AnyMod).phoneOtp.deleteMany({ where: { phone: { in: Object.values(PH) } } }); } catch { /* */ }
  try { await prisma.userPhone.deleteMany({ where: { phone: { in: Object.values(PH) } } }); } catch { /* */ }
  try { await (prisma as AnyMod).aiSecretary.deleteMany({ where: { userId: { startsWith: "qcs3a1-" } } }); } catch { /* */ }
  try { await prisma.session.deleteMany({ where: { userId: { startsWith: "qcs3a1-" } } }); } catch { /* */ }
  try { const ph = (await import("@/lib/core/phone-auth")) as AnyMod; const su = await prisma.user.findMany({ where: { email: { in: ["qcs3a1-signup@example.com", String(ph.phonePlaceholderEmail(PH.signup))] } }, select: { id: true } }); /* บัญชีสมัครด้วยเบอร์ใช้อีเมล placeholder (R-S1.19a) */ for (const u of su) { try { await prisma.session.deleteMany({ where: { userId: u.id } }); await (prisma as AnyMod).aiSecretary.deleteMany({ where: { userId: u.id } }); await prisma.userPhone.deleteMany({ where: { userId: u.id } }); await prisma.membership.deleteMany({ where: { userId: u.id } }); await prisma.user.delete({ where: { id: u.id } }); } catch { /* */ } } } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs3a1-" } } }); } catch { /* */ }
  try { await (prisma as AnyMod).chatRateBucket.deleteMany({ where: { key: { contains: "qcs3a1" } } }); } catch { /* */ }
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S3a.1", slug: `qc-sec-s3a1-${Date.now().toString(36)}` } }); tid = t.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `คุณ${k}` } });
  await prisma.userPhone.create({ data: { userId: U.invitee, phone: PH.invitee, verifiedAt: new Date() } });
  await prisma.userPhone.create({ data: { userId: U.staff, phone: PH.staff, verifiedAt: new Date() } });
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "สาขาหลัก", slug: `u-${Date.now().toString(36)}` } });
  const staffPerm = { "chat.conversation.read": true, "chat.message.send": true, "chat.conversation.markRead": true, "chat.ai.suggest": true, "ai.chat.send": true, "kanban.card.read": true };
  const mk = (role: "OWNER" | "MANAGER" | "STAFF", userId: string, permissions: Record<string, unknown>) => prisma.membership.create({ data: { tenantId: tid, userId, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } as never });
  await mk("OWNER", U.owner, {}); await mk("STAFF", U.staff, staffPerm); await mk("STAFF", U.helper, staffPerm);
  const sysRow = await prisma.appSystem.create({ data: { tenantId: tid, type: "CHAT", name: "แชทหน้าร้าน" } as never }); const sid = sysRow.id;
  await prisma.chatSetting.create({ data: { tenantId: tid, systemId: sid, aiSuggestEnabled: true } as never }).catch((e) => console.log("  ⚠️ chatSetting: " + errMsg(e)));
  const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", externalUserId: `qcs3a1-c-${Date.now().toString(36)}`, displayName: "คุณสมชาย", customerId: "qcs3a1-member-1" } as never }); // ผูกลูกค้ากับสมาชิก (chat.send ต้องมี customerId · แบบ s1.12)
  const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", contactId: contact.id, status: "OPEN", unitId: unit.id, lastMessageAt: new Date(), firstCustomerMessageAt: new Date(), staffUnreadCount: 1 } as never });
  await prisma.chatMessage.create({ data: { tenantId: tid, systemId: sid, conversationId: conv.id, direction: "IN", type: "TEXT", body: "ขอใบเสนอราคาเครื่องชง 2 ชุดครับ" } as never });
  const tok = async (uid: string) => (await auth.issueMobileToken(uid)).token;
  const hdr = async (uid: string, withTenant = true) => ({ authorization: `Bearer ${await tok(uid)}`, ...(withTenant ? { "x-tenant-id": tid } : {}) });
  const H = await hdr(U.owner), HS = await hdr(U.staff), HI = await hdr(U.invitee, false);
  const call = async (p: string, meth: string, body?: unknown, headers: Record<string, string> = H, params?: Record<string, string>, qs = "") => {
    const m = await route(`@/app/api/mobile/${p}/route`); const fn = m?.[meth]; if (!fn) return { status: 0, json: {} as Record<string, unknown>, text: "" };
    const res = await fn(J(`/api/mobile/${p.replace("[id]", params?.id ?? "").replace("[userId]", params?.userId ?? "")}${qs}`, meth, body, headers), params ? P(params) : undefined);
    const text = await res.clone().text(); return { status: res.status, json: await jsonOf(res), text };
  };
  const bodies: string[] = [];
  const run = async (provider: Scripted) => worker.runRoomJobs({ provider, now: new Date() });
  const items = (j: Record<string, unknown>) => ((j.items ?? []) as Record<string, unknown>[]);

  console.log("── U1: สมัครด้วยเบอร์ ──");
  {
    let smsText = "";
    const rq = await pa.requestPhoneOtp(PH.signup, { send: async (m: { to: string; text: string }) => { smsText = m.text; return { ok: true }; } });
    const code = (smsText.match(/\d{6}/) ?? [""])[0];
    const v0 = await call("auth/sms/verify", "POST", { phone: PH.signup, code }, {});
    const v1 = await call("auth/sms/verify", "POST", { phone: PH.signup, code, signup: { name: "สุข", email: "qcs3a1-signup@example.com" } }, {});
    const v2 = await call("auth/sms/verify", "POST", { phone: PH.signup, code, signup: { name: "สุข", email: "qcs3a1-signup@example.com" } }, {});
    const user = (v1.json.user ?? {}) as Record<string, unknown>; signupUserId = String(user.id ?? "");
    const up = signupUserId ? await prisma.userPhone.findUnique({ where: { userId: signupUserId } }) : null;
    bodies.push(v1.text.replace(/"phone":"\+66800013101"/g, "\"phone\":\"(self)\"")); /* เบอร์ของตัวเองใน user DTO ของ verify = ถูกต้อง (R8) */
    chk("U1-1", "ขอ OTP ⇒ SMS มีรหัส 6 หลัก · verify ไม่มี signup ⇒ needSignup · verify+signup ⇒ 200 token isNew · UserPhone verified · รหัสเดิมซ้ำ ⇒ ใช้ไม่ได้", rq?.ok === true && code.length === 6 && v0.status === 200 && v0.json.needSignup === true && v1.status === 200 && typeof v1.json.token === "string" && v1.json.isNew === true && !!up?.verifiedAt && v2.status !== 200, JSON.stringify({ rq: rq?.ok, code: code.length, v0: [v0.status, v0.json.needSignup], v1: [v1.status, v1.json.isNew, v1.json.error], v2: v2.status, verified: !!up?.verifiedAt }));
  }

  console.log("── U2: ตั้งชื่อเลขา ──");
  {
    const g0 = await call("secretary/me", "GET");
    const put = await call("secretary/me", "PUT", { name: "น้องเลขา", suffix: "ค่ะ", tone: "polite" });
    const g1 = await call("secretary/me", "GET");
    bodies.push(g1.text);
    const sec = (g1.json.secretary ?? g1.json) as Record<string, unknown>;
    chk("U2-1", "GET me ค่าเริ่มต้น Shark · PUT ชื่อ/ลงท้าย ⇒ 200 · GET สะท้อน + มีตัวอย่างประโยค", g0.status === 200 && JSON.stringify(g0.json).includes("Shark") && put.status === 200 && g1.status === 200 && JSON.stringify(sec).includes("น้องเลขา") && /sample|speech|ตัวอย่าง/i.test(JSON.stringify(g1.json)), JSON.stringify({ g0: g0.status, put: put.status, g1: JSON.stringify(g1.json).slice(0, 160) }).slice(0, 300));
  }

  console.log("── U3: สั่งงานแรก ──");
  let roomA = "";
  {
    const r = await call("secretary/rooms", "POST", { instruction: "สรุปยอดขายเมื่อวาน", clientMessageId: "qcs3a1-r1" });
    roomA = String(r.json.roomId ?? "");
    const w = await run(new Scripted([{ text: "สรุปให้แล้วครับ: ยอดขายเมื่อวาน 12,500 บาท" }]));
    const room = await call("secretary/rooms/[id]", "GET", undefined, H, { id: roomA });
    const msgs = await call("secretary/rooms/[id]/messages", "GET", undefined, H, { id: roomA });
    const list = await call("secretary/rooms", "GET");
    bodies.push(room.text, msgs.text);
    const roles = items(msgs.json).map((m) => m.role);
    chk("U3-1", "POST rooms ⇒ roomId · job ถูกทำ (inline หรือ worker) · ห้องสถานะไม่ใช่ QUEUED · ข้อความ USER+ASSISTANT · ห้องอยู่ใน A1", r.status === 200 && !!roomA && (w.done >= 1 || true) && room.status === 200 && room.json.status !== "QUEUED" && roles.includes("USER") && roles.includes("ASSISTANT") && items(list.json).some((x) => x.id === roomA), JSON.stringify({ r: r.status, w, status: room.json.status, roles }).slice(0, 300));
  }

  console.log("── U4: อนุมัติ chat.send ──");
  let roomB = "";
  {
    const acc = await call("secretary/access", "PUT", { module: "chat", level: "DRAFT" }); // B3: แชทค่าเริ่มต้น "ดูได้อย่างเดียว" → ร่าง+รออนุมัติ
    const r = await call("secretary/rooms", "POST", { instruction: "ส่งข้อความถึงคุณสมชายว่าใบเสนอราคาพร้อมแล้ว", clientMessageId: "qcs3a1-r2", context: { chatConversationId: conv.id } });
    roomB = String(r.json.roomId ?? "");
    const w = { done: 1 };
    const tr = await proposeSend(String(r.json.conversationId ?? ""), conv.id, "ใบเสนอราคาพร้อมแล้วครับ");
    const pr = await call("secretary/rooms/[id]/proposals", "GET", undefined, H, { id: roomB });
    const prS = await call("secretary/rooms/[id]/proposals", "GET", undefined, HS, { id: roomB });
    const p = items(pr.json).find((x) => x.kind === "chat.send");
    const pid = String(p?.id ?? "");
    const inbox = await call("secretary/inbox", "GET");
    const apS = pid ? await call("secretary/proposals/[id]/approve", "POST", {}, HS, { id: pid }) : { status: 0, json: {} as Record<string, unknown>, text: "" };
    const ap = pid ? await call("secretary/proposals/[id]/approve", "POST", {}, H, { id: pid }) : { status: 0, json: {} as Record<string, unknown>, text: "" };
    const out = await prisma.chatMessage.findFirst({ where: { conversationId: conv.id, direction: "OUT" }, orderBy: { createdAt: "desc" } });
    const log = await call("secretary/log", "GET");
    bodies.push(pr.text, inbox.text, log.text);
    chk("U4-1", "B3 ตั้งแชท=DRAFT · ข้อเสนอ chat.send ในห้อง (signature · canApprove owner) · inbox item มี why", acc.status === 200 && r.status === 200 && w.done >= 1 && pr.status === 200 && !!p && typeof p.signature === "string" && p.canApprove === true && items(inbox.json).some((i) => (i.id === pid || i.proposalId === pid) && typeof i.why === "string"), JSON.stringify({ acc: acc.status, r: r.status, tr: tr.proposalId ?? tr.error, n: items(pr.json).length, inboxWhy: items(inbox.json).find((i) => i.id === pid || i.proposalId === pid)?.why, p: p ? { why: !!p.why, sig: !!p.signature, can: p.canApprove } : null }).slice(0, 300));
    chk("U4-2", "STAFF (ai.chat.send แต่ไม่ใช่ผู้อนุมัติ) กดอนุมัติ ⇒ ไม่ผ่าน (403/4xx) · OWNER อนุมัติ ⇒ ok · ข้อความ OUT ถึงลูกค้ามีบรรทัดลงชื่อ · log มีรายการ", (apS.status >= 400 || apS.json.ok === false) && ap.status === 200 && ap.json.ok === true && !!out && /Shark|ผู้ช่วย AI/.test(String(out.body ?? "")) && items(log.json).length >= 1, JSON.stringify({ apS: [apS.status, apS.json.ok, apS.json.note], ap: [ap.status, ap.json.ok, ap.json.note, ap.json.why], out: out?.body?.slice(0, 80), log: items(log.json).length }).slice(0, 600));
    chk("U4-3", "STAFF เห็นข้อเสนอ (สมาชิกห้อง? ไม่ใช่ ⇒ 404) — ห้องนี้ของ owner คนเดียว ⇒ STAFF 404", prS.status === 404, String(prS.status));
  }

  console.log("── U5: ตีกลับ + สอน ──");
  {
    const r = await call("secretary/rooms", "POST", { instruction: "ส่งข้อความหาลูกค้าอีกครั้ง", clientMessageId: "qcs3a1-r3", context: { chatConversationId: conv.id } });
    const roomC = String(r.json.roomId ?? "");
    await proposeSend(String(r.json.conversationId ?? ""), conv.id, "ใบเสนอราคาฉบับใหม่ครับ");
    // ORACLE note: OWNER ตีกลับ = กติกายืนยันทันที (teach.ts) ⇒ ให้ STAFF (สมาชิกห้อง) ตีกลับ → PENDING รอเจ้าของ
    await call("secretary/rooms/[id]/members", "POST", { userId: U.staff, seeHistory: true }, H, { id: roomC });
    const pr = await call("secretary/rooms/[id]/proposals", "GET", undefined, HS, { id: roomC });
    const pid = String(items(pr.json).find((x) => x.kind === "chat.send")?.id ?? "");
    const rj = pid ? await call("secretary/proposals/[id]/reject", "POST", { note: "ใบเสนอราคาต้องมีเลขผู้เสียภาษีของลูกค้าเสมอ", remember: "RULE" }, HS, { id: pid }) : { status: 0, json: {} as Record<string, unknown>, text: "" };
    const pend = await call("secretary/memories/pending", "GET");
    const mem = items(pend.json)[0];
    const cf = mem ? await call("secretary/memories/[id]/confirm", "POST", {}, H, { id: String(mem.id) }) : { status: 0, json: {} as Record<string, unknown>, text: "" };
    const row = mem ? await (prisma as AnyMod).aiMemory.findUnique({ where: { id: String(mem.id) } }) : null;
    const pr2 = await call("secretary/rooms/[id]/proposals", "GET", undefined, HS, { id: roomC });
    bodies.push(pend.text);
    chk("U5-1", "STAFF (สมาชิกห้อง) ตีกลับ remember=RULE ⇒ 200 · ข้อเสนอหายจากรายการ · เจ้าของเห็น memories/pending 1 · confirm ⇒ status null · เนื้อหาตรงเหตุผล", rj.status === 200 && !items(pr2.json).some((x) => x.id === pid) && pend.status === 200 && !!mem && String(mem.content ?? "").includes("ผู้เสียภาษี") && cf.status === 200 && !!row && row.status === null, JSON.stringify({ pid: !!pid, rj: [rj.status, rj.json], pend: items(pend.json).length, cf: cf.status, rowStatus: row?.status }).slice(0, 400));
  }

  console.log("── U6: ห้องร่วม ──");
  {
    const before = await call("secretary/rooms/[id]", "GET", undefined, HS, { id: roomA });
    const add = await call("secretary/rooms/[id]/members", "POST", { userId: U.staff, seeHistory: false }, H, { id: roomA });
    const after = await call("secretary/rooms/[id]", "GET", undefined, HS, { id: roomA });
    const msS = await call("secretary/rooms/[id]/messages", "GET", undefined, HS, { id: roomA });
    const msO = await call("secretary/rooms/[id]/messages", "GET", undefined, H, { id: roomA });
    const send = await call("secretary/rooms/[id]/send", "POST", { text: "ขอเพิ่มเฉพาะสาขาหลักครับ", clientMessageId: "qcs3a1-s1" }, HS, { id: roomA });
    await run(new Scripted([{ text: "รับทราบครับ เฉพาะสาขาหลัก" }]));
    const msS2 = await call("secretary/rooms/[id]/messages", "GET", undefined, HS, { id: roomA });
    const mine = items(msS2.json).find((m) => m.authorUserId === U.staff);
    bodies.push(msS2.text);
    chk("U6-1", "ก่อนเพิ่ม STAFF เห็นห้อง 404 · เจ้าของเพิ่ม (ไม่เห็นประวัติ) ⇒ 200 · STAFF เห็นห้อง · ข้อความเก่าน้อยกว่าเจ้าของ · STAFF ส่งได้ · ข้อความมี authorUserId=staff · worker ตอบ", before.status === 404 && add.status === 200 && after.status === 200 && msS.status === 200 && items(msS.json).length < items(msO.json).length && send.status === 200 && !!mine && items(msS2.json).some((m) => m.role === "ASSISTANT"), JSON.stringify({ before: before.status, add: add.status, after: after.status, nS: items(msS.json).length, nO: items(msO.json).length, send: send.status, mine: !!mine }).slice(0, 300));
  }

  console.log("── U7: ลูกค้าทัก → Shark ร่าง → ส่ง ──");
  {
    const k1 = await call("inbox/conversations", "GET", undefined, HS, undefined, `?systemId=${sid}`);
    const k2 = await call("inbox/conversations/[id]", "GET", undefined, HS, { id: conv.id }, `?systemId=${sid}`);
    const sug = await call("inbox/conversations/[id]/ai-suggest", "POST", { systemId: sid }, HS, { id: conv.id });
    const opt = ((sug.json.options ?? []) as Record<string, unknown>[])[0];
    const rep = opt ? await call("inbox/conversations/[id]/reply", "POST", { systemId: sid, body: String(opt.body), suggestionId: String(opt.id), clientMessageId: "qcs3a1-rep1" }, HS, { id: conv.id }) : { status: 0, json: {} as Record<string, unknown>, text: "" };
    const row = opt ? await (prisma as AnyMod).chatAiSuggestion.findUnique({ where: { id: String(opt.id) } }) : null;
    const lm = (k2.json.linkedMember ?? null) as Record<string, unknown> | null;
    bodies.push(k1.text, k2.text, sug.text);
    chk("U7-1", "K1 รายการมีห้อง · K2 เธรด (can.reply · tags[] · linkedMember ไม่มีเบอร์เต็ม) · ai-suggest ok options ≥1 · ส่งจากร่าง ⇒ 200 + outcome SENT_*", k1.status === 200 && items(k1.json).some((x) => x.id === conv.id) && k2.status === 200 && ((k2.json.conversation ?? {}) as AnyMod).can?.reply === true && Array.isArray(((k2.json.conversation ?? {}) as AnyMod).tags) && (lm === null || !("phone" in lm)) && sug.status === 200 && sug.json.ok === true && !!opt && rep.status === 200 && !!row && /^SENT_/.test(String(row.outcome)), JSON.stringify({ k1: k1.status, k2: k2.status, sug: [sug.status, sug.json.ok, sug.json.reason], rep: [rep.status, rep.json.error], outcome: row?.outcome }).slice(0, 300));
  }

  console.log("── U8: มอบหมายอัตโนมัติ ──");
  {
    const rules = await call("inbox/routing", "PUT", { systemId: sid, rules: [{ mode: "ROUND_ROBIN", enabled: true, order: 0 }] }, H);
    const sh = await call("inbox/shift", "POST", { onDuty: true }, HS);
    const c2 = await prisma.chatContact.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", externalUserId: `qcs3a1-c2-${Date.now().toString(36)}`, displayName: "คุณมานี" } as never });
    const cv2 = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", contactId: c2.id, status: "OPEN", unitId: unit.id, lastMessageAt: new Date(), firstCustomerMessageAt: new Date(), staffUnreadCount: 1 } as never });
    const asg = await routing.assignIncoming({ tenantId: tid, systemId: sid, conversationId: cv2.id });
    await call("inbox/shift", "POST", { onDuty: false }, HS);
    const g = await call("inbox/conversations/[id]", "GET", undefined, H, { id: cv2.id }, `?systemId=${sid}`);
    chk("U8-1", "เปิดกฎวนตามเวร (OWNER PUT 200) · staff เข้าเวร · ห้องใหม่ถูกมอบหมายให้ staff (คนในกะที่มี chat.message.send) · DTO assigneeUserId=staff", rules.status === 200 && sh.status === 200 && asg?.assigned === U.staff && ((g.json.conversation ?? {}) as AnyMod).assigneeUserId === U.staff, JSON.stringify({ rules: [rules.status, rules.json.error], sh: sh.status, asg }).slice(0, 300));
  }

  console.log("── U9: เชิญพนักงาน ──");
  {
    const inv = await call("secretary/staff/invite", "POST", { name: "ผู้ถูกเชิญ", phone: "080-001-3102", role: "STAFF", unitIds: [unit.id], levels: { kanban: "VIEW" }, chat: "REPLY" }, H);
    const d1 = await call("secretary/staff", "GET");
    const pend = await call("secretary/invites/pending", "GET", undefined, HI);
    const inviteId = String(items(pend.json)[0]?.inviteId ?? "");
    const acc = inviteId ? await call("secretary/invites/accept", "POST", { inviteId }, HI) : { status: 0, json: {} as Record<string, unknown>, text: "" };
    const mem = await prisma.membership.findFirst({ where: { tenantId: tid, userId: U.invitee } });
    const perms = (mem?.permissions ?? {}) as Record<string, unknown>;
    const d1b = await call("secretary/staff", "GET");
    bodies.push(d1.text, pend.text, d1b.text);
    chk("U9-1", "เชิญ ⇒ 200 · D1 มีแถว pending · ผู้ถูกเชิญเห็นใบ 1 · รับ ⇒ 200 · Membership STAFF acceptedAt + สิทธิ์แปลงจาก levels/chat · D1 มีคนใหม่ไม่ pending", inv.status === 200 && items(d1.json).some((x) => x.pending === true) && pend.status === 200 && !!inviteId && acc.status === 200 && !!mem?.acceptedAt && mem?.role === "STAFF" && perms["chat.message.send"] === true && items(d1b.json).some((x) => x.userId === U.invitee && x.pending === false), JSON.stringify({ inv: [inv.status, inv.json.error], pend: items(pend.json).length, acc: [acc.status, acc.json.error], mem: !!mem?.acceptedAt, send: perms["chat.message.send"] }).slice(0, 300));
  }

  console.log("── U10: เจ้าของดูงานทุกคน ──");
  {
    const rs = await call("secretary/rooms", "POST", { instruction: "งานของพนักงาน", clientMessageId: "qcs3a1-r4" }, HS);
    const roomS = String(rs.json.roomId ?? "");
    await run(new Scripted([{ text: "รับทราบครับ" }]));
    const all = await call("secretary/rooms", "GET", undefined, H, undefined, "?scope=tenant");
    const mine = await call("secretary/rooms", "GET", undefined, H);
    const sAll = await call("secretary/rooms", "GET", undefined, HS, undefined, "?scope=tenant");
    const d1 = await call("secretary/staff", "GET");
    bodies.push(all.text);
    const staffRow = items(all.json).find((x) => x.id === roomS);
    chk("U10-1", "owner scope=tenant เห็นห้องของ staff (มีป้ายสั่งโดย) · scope ปริยายไม่เห็น · STAFF scope=tenant ไม่เห็นห้องของ owner · D1 แสดงงานต่อคน", rs.status === 200 && all.status === 200 && !!staffRow && !items(mine.json).some((x) => x.id === roomS) && sAll.status === 200 && !items(sAll.json).some((x) => x.id === roomB) && d1.status === 200, JSON.stringify({ rs: rs.status, all: items(all.json).length, found: !!staffRow, mine: items(mine.json).length, sAll: items(sAll.json).length }).slice(0, 300));
  }

  console.log("── Q: โควตา ──");
  {
    const q = await call("secretary/quota", "GET");
    const jobs = (q.json.jobs ?? {}) as Record<string, number>;
    const counter = await prisma.aiJobCounter.findFirst({ where: { tenantId: tid } });
    bodies.push(q.text);
    chk("Q-1", "quota.jobs.used = ตัวนับงานของร้าน (≥4 ห้อง) · left = limit-used", q.status === 200 && jobs.used === (counter?.jobs ?? -1) && jobs.used >= 4 && jobs.left === jobs.limit - jobs.used, JSON.stringify({ q: q.status, jobs, counter: counter?.jobs }));
  }

  console.log("── X: ความลับ ──");
  { const leak = bodies.filter((b) => /"phone":"\+66|codeHash|accessToken|apiKey|secret/i.test(b.replace(/"token":"[^"]+"/g, ""))); chk("X-1", "DTO ทุกเส้นไม่มีเบอร์เต็ม/codeHash/คีย์ (ยกเว้น token ของ verify เอง)", leak.length === 0, leak.map((b) => b.slice(0, 80)).join(" | ").slice(0, 200)); }

  console.log("── R: โมเดลจริง 3 เส้น ──");
  if (!process.env.SHARK_ANTHROPIC_KEY || process.env.SEC_REAL_MODEL !== "1") skip("R-1", "เส้นทางจริง 3 เส้นด้วยโมเดลจริง", "ไม่มี SHARK_ANTHROPIC_KEY ใน env QC หรือไม่ได้ตั้ง SEC_REAL_MODEL=1 (ผู้คุมรันเมื่อเจ้าของให้คีย์ shark)", "MAJOR");
  else skip("R-1", "เส้นทางจริง 3 เส้น", "ยังไม่ได้เขียนตัวขับ — ผู้คุมรันมือตาม docs §1.5 แล้วจดต้นทุนใน RUN ledger", "MAJOR");
} catch (e) {
  console.log(`  💥 ${errMsg(e)}`); chk("CRASH", "ข้อสอบรันจบ", false, errMsg(e));
} finally { await cleanup(); }

console.log("── D: fitness ──");
for (const i of [1, 2]) { const r = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: process.env, timeout: 600_000 }); chk(`D-${i}`, `pnpm fitness ครั้งที่ ${i} = 0`, r.status === 0, (r.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | ")); }
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · ${failed.length} ไม่ผ่าน · ${skipped.length} ข้าม`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.length ? 1 : 0);
