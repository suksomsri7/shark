// QC — SECRETARY S3a.1-S2 · แก้ผลนักล่า L1/L4/L5/L6: ประตู CRM · ด่านพนักงาน · log seeHistory · approvalGate kind ใหม่ · OTP rate-limit · attachments sniff · API shape · step-up ลบบัญชี · tools ในห้องบริบทลูกค้า · PII mask · deleteAccount cleanup · ความลับ
// สัญญา: ledger/secretary-briefs/sec-brief-S3a.1-S2.md · RESOLUTIONS §Z.2 R-Z13…R-Z27
//
// กลุ่มข้อ:
//   P1 ประตู CRM ปฏิเสธห้องเลขา · P2 ด่านพนักงานใน lib + wildcard PUT · P3 log seeHistory · P4 approvalGate kind ใหม่นอกห้อง · A1 OTP verify rate-limit/เหตุผลยุบ · A2 attachments sniff
//   A3 rate-limit read/apply/routing/me · 429 shape invite · rules max · reply bounds · error shape/message · A4 step-up ลบบัญชี · T1 tools ในห้องบริบทลูกค้า = ข้อเสนอ/PENDING · T2 addMember forbidden_chat · T3 PII mask ใน tool · T4 kanban_card_from_chat ข้ามสาขา
//   S1 deleteAccount cleanup · S2 static (e.message · opsEvent · sweep · gitignore · HMAC · SMS text · VERCEL_ENV · digest ต่อผู้ดู) · D fitness
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s3a1-s2.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s3a1-s2";
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
loadLegacyQcEnv("qc-sec-s3a1-s2"); // route ของ inbox import lib/env ตอนโหลด (SESSION_SECRET ฯลฯ) — โหลดจาก QC_ENV_FILE (.env.qc-sec) ไม่พิมพ์ค่า
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





const auth = (await import("@/lib/mobile/auth")) as AnyMod;
const rooms = (await import("@/lib/ai/secretary/rooms")) as AnyMod;
const tools = (await import("@/lib/ai/tools")) as AnyMod;
const staffSvc = (await import("@/lib/staff/service")) as AnyMod;
const bridges = (await import("@/lib/modules/crm/ai-bridges")) as AnyMod;
const proposals = (await import("@/lib/ai/proposals")) as AnyMod;
const pa = (await import("@/lib/core/phone-auth")) as AnyMod;
const accountDel = (await import("@/lib/platform/account-deletion")) as AnyMod;
const U = { owner: "qcs3s2-owner", mgr: "qcs3s2-mgr", mgr2: "qcs3s2-mgr2", staff: "qcs3s2-staff", staffB: "qcs3s2-staffb", guard: "qcs3s2-guard", writer: "qcs3s2-writer", del: "qcs3s2-del" };
const PH = { del: "+66800013201", vict: "+66800013202" };
let tid = "";
const cleanup = async () => {
  if (tid) {
    for (const m of ["kanbanCard", "kanbanColumn", "kanbanBoard", "aiActionLog", "aiProposal", "aiPlan", "aiMessage", "aiRoomJob", "aiRoomMember", "aiRoom", "aiConversation", "aiJobCounter", "aiCreditTxn", "aiCreditWallet", "aiMemory", "aiSystemAccess", "aiApprovalRule", "aiNotifyPref", "chatConversationHelper", "chatShift", "chatAiSuggestion", "chatAttachment", "chatMessage", "chatConversation", "chatContact", "chatSetting", "chatRoutingRule", "customer", "staffInvite", "membership", "appSystem", "businessUnit"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: tid } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s3s2-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await (prisma as AnyMod).phoneOtp.deleteMany({ where: { phone: { in: Object.values(PH) } } }); } catch { /* */ }
  try { await prisma.userPhone.deleteMany({ where: { phone: { in: Object.values(PH) } } }); } catch { /* */ }
  for (const m of ["aiSecretary", "pushDevice", "aiNotifyPref", "session"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { userId: { startsWith: "qcs3s2-" } } }); } catch { /* */ } }
  try { await (prisma as AnyMod).aiMemory.deleteMany({ where: { id: { startsWith: "u~qcs3s2-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs3s2-" } } }); } catch { /* */ }
  try { await (prisma as AnyMod).chatRateBucket.deleteMany({ where: { OR: [{ key: { contains: "qcs3s2" } }, { key: { contains: "sms-verify" } }] } }); } catch { /* */ }
};
const actorOf = (userId: string, role: "OWNER" | "MANAGER" | "STAFF", permissions: Record<string, unknown> = {}, unitAccess: string[] = ["*"]) => ({ kind: "member" as const, tenantId: tid, userId, membership: { role, unitAccess, permissions } });
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const src = (p: string) => rd(join(ROOT, p));
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S3a1-S2", slug: `qc-sec-s3s2-${Date.now().toString(36)}` } }); tid = t.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `คุณ${k}` } });
  await prisma.userPhone.create({ data: { userId: U.del, phone: PH.del, verifiedAt: new Date() } });
  const unitA = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "สาขา A", slug: `ua-${Date.now().toString(36)}` } });
  const unitB = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "สาขา B", slug: `ub-${Date.now().toString(36)}` } });
  const chatPerm = { "chat.conversation.read": true, "chat.message.send": true, "chat.conversation.markRead": true, "chat.ai.suggest": true, "ai.chat.send": true, "crm.deal.move": true, "crm.contact.read": true, "kanban.card.create": true, "kanban.card.read": true };
  const mk = (role: "OWNER" | "MANAGER" | "STAFF", userId: string, permissions: Record<string, unknown>, unitAccess: string[] = ["*"]) => prisma.membership.create({ data: { tenantId: tid, userId, role, unitAccess, permissions, acceptedAt: new Date() } as never });
  await mk("OWNER", U.owner, {}); await mk("MANAGER", U.mgr, {}); await mk("MANAGER", U.mgr2, {});
  const mStaff = await mk("STAFF", U.staff, chatPerm, [unitA.id]); await mk("STAFF", U.staffB, chatPerm, [unitB.id]); await mk("STAFF", U.guard, {}); await mk("STAFF", U.writer, { "settings.staff.write": true }); await mk("STAFF", U.del, {});
  const chatSys = await prisma.appSystem.create({ data: { tenantId: tid, type: "CHAT", name: "แชท" } as never }); const sid = chatSys.id;
  await prisma.chatSetting.create({ data: { tenantId: tid, systemId: sid, aiSuggestEnabled: true } as never }).catch(() => null);
  const mkConv = async (tag: string, unitId: string) => { const c = await prisma.chatContact.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", externalUserId: `qcs3s2-${tag}-${Date.now().toString(36)}`, displayName: `ลูกค้า ${tag}`, customerId: "qcs3s2-member-1" } as never }); const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", contactId: c.id, status: "OPEN", unitId, lastMessageAt: new Date(), firstCustomerMessageAt: new Date(), staffUnreadCount: 1 } as never }); await prisma.chatMessage.create({ data: { tenantId: tid, systemId: sid, conversationId: conv.id, direction: "IN", type: "TEXT", body: `ลูกค้า ${tag} ถาม` } as never }); return conv; };
  const convA = await mkConv("A", unitA.id), convB = await mkConv("B", unitB.id);
  await (prisma as AnyMod).aiSystemAccess.upsert({ where: { tenantId_module: { tenantId: tid, module: "chat" } }, create: { tenantId: tid, module: "chat", level: "DRAFT", setById: U.owner }, update: { level: "DRAFT" } }).catch(() => null);
  const tok = async (uid: string) => (await auth.issueMobileToken(uid)).token;
  const hdr = async (uid: string, withTenant = true) => ({ authorization: `Bearer ${await tok(uid)}`, ...(withTenant ? { "x-tenant-id": tid } : {}) });
  const H = await hdr(U.owner), HM = await hdr(U.mgr), HS = await hdr(U.staff), HG = await hdr(U.guard), HD = await hdr(U.del);
  const call = async (p: string, meth: string, body?: unknown, headers: Record<string, string> = H, params?: Record<string, string>, qs = "") => {
    const m = await route(`@/app/api/mobile/${p}/route`); const fn = m?.[meth]; if (!fn) return { status: 0, json: {} as Record<string, unknown>, text: "" };
    let res: Response;
    try { res = await fn(J(`/api/mobile/${p.replace("[id]", params?.id ?? "").replace("[membershipId]", params?.membershipId ?? "")}${qs}`, meth, body, headers), params ? P(params) : undefined); }
    catch (e) { return { status: 500, json: { error: "thrown", message: errMsg(e) } as Record<string, unknown>, text: "" }; } // route โยน exception = 500 ที่ไม่ใช่ JSON (ผิดกติกา)
    const text = await res.clone().text(); return { status: res.status, json: await jsonOf(res), text };
  };
  const OWNER = { tenantId: tid, actor: actorOf(U.owner, "OWNER") };
  const toolCtx = (userId: string, role: "OWNER" | "MANAGER" | "STAFF", perms: Record<string, unknown>, conversationId: string, unitAccess: string[] = ["*"]) => ({ tenantId: tid, actor: actorOf(userId, role, perms, unitAccess), conversationId });
  const parse = (s: string) => { try { return JSON.parse(s) as Record<string, unknown>; } catch { return { raw: s }; } };

  console.log("── P1: ประตู CRM ปฏิเสธห้องเลขา ──");
  {
    const r = await rooms.startRoom(OWNER, { instruction: "ย้ายดีล" });
    const p = await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: r.conversationId, kind: "crm.deals.move", risk: "NORMAL", summary: "ย้ายดีล X", payload: { dealId: "nosuch", stageId: "nosuch" }, status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000) } as never });
    const res = await bridges.confirmProposalById(tid, actorOf(U.staff, "STAFF", chatPerm), p.id).catch((e: unknown) => ({ handled: true, ok: false, note: errMsg(e) }));
    const row = await prisma.aiProposal.findUnique({ where: { id: p.id } });
    chk("P1-1", "confirmProposalById (ประตู CRM เว็บ) กับข้อเสนอในห้องเลขา ⇒ ไม่ทำ (ok:false/ไม่พบ) · ข้อเสนอคง PENDING", res?.ok !== true && row?.status === "PENDING", JSON.stringify({ res, status: row?.status }).slice(0, 200));
  }

  console.log("── P2: ด่านพนักงานใน lib ──");
  {
    const a = await staffSvc.updateStaffAccess({ tenantId: tid, actorUserId: U.mgr, membershipId: mStaff.id, role: "MANAGER" });
    const mgr2Row = await prisma.membership.findFirst({ where: { tenantId: tid, userId: U.mgr2 } });
    const b = await staffSvc.revokeStaffAccess({ tenantId: tid, actorUserId: U.mgr, membershipId: String(mgr2Row?.id) });
    const c = await staffSvc.revokeStaffAccess({ tenantId: tid, actorUserId: U.writer, membershipId: String(mgr2Row?.id) });
    const still = await prisma.membership.findFirst({ where: { tenantId: tid, userId: U.mgr2 } });
    chk("P2-1", "MANAGER เลื่อน STAFF เป็น MANAGER ⇒ ปฏิเสธ · MANAGER ระงับ MANAGER ⇒ ปฏิเสธ · STAFF+settings.staff.write ระงับ MANAGER ⇒ ปฏิเสธ (lib ตรง)", a?.ok === false && b?.ok === false && c?.ok === false && !!still && !(still as AnyMod).revokedAt && still.acceptedAt !== null, JSON.stringify({ a: a?.ok, b: b?.ok, c: c?.ok }));
    const w = await call("secretary/staff/[membershipId]", "PUT", { extraPermissions: { "account.*": true } }, HM, { membershipId: mStaff.id });
    chk("P2-2", "PUT staff/[id] extraPermissions wildcard ⇒ 4xx (ไม่รับ)", w.status >= 400 && w.status < 500, String(w.status));
  }

  console.log("── P3: log seeHistory ──");
  {
    const r = await rooms.startRoom(OWNER, { instruction: "ห้อง log" });
    const old = await prisma.aiActionLog.create({ data: { tenantId: tid, roomId: r.roomId, userId: U.owner, module: "kanban", kind: "kanban.card.create", summary: "การ์ดเก่า", payload: {}, createdAt: new Date(Date.now() - 120_000) } as never });
    await call("secretary/rooms/[id]/members", "POST", { userId: U.staff, seeHistory: false }, H, { id: r.roomId });
    const lg = await call("secretary/log", "GET", undefined, HS, undefined, `?roomId=${r.roomId}`);
    const items = (lg.json.items ?? []) as Record<string, unknown>[];
    chk("P3-1", "สมาชิก seeHistory=false ไม่เห็น log ของห้องก่อน addedAt", lg.status === 200 && !items.some((i) => i.id === old.id), JSON.stringify({ s: lg.status, n: items.length, hasOld: items.some((i) => i.id === old.id) }));
  }

  console.log("── P4: approvalGate กับ kind ใหม่นอกห้องเลขา ──");
  {
    const conv = await (prisma as AnyMod).aiConversation.create({ data: { tenantId: tid, title: "แชท AI เดิม", channel: "APP", userId: U.staff } as never }).catch(async () => (prisma as AnyMod).aiConversation.create({ data: { tenantId: tid, title: "แชท AI เดิม" } as never }));
    const p = await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: conv.id, kind: "chat.send", risk: "NORMAL", summary: "ส่งข้อความถึงลูกค้า", payload: { conversationId: convA.id, body: "สวัสดี" }, status: "PENDING", expiresAt: new Date(Date.now() + 3_600_000) } as never });
    const ex = await proposals.executeProposal({ role: "STAFF", unitAccess: ["*"], permissions: chatPerm }, { tenantId: tid }, p.id, { userId: U.staff });
    const row = await prisma.aiProposal.findUnique({ where: { id: p.id } });
    chk("P4-1", "STAFF (มี chat.message.send + ai.chat.send) อนุมัติ chat.send ในแชท AI เดิม (ไม่มี AiRoom) ⇒ ok:false (approvalGate ใช้กับ kind ใหม่ทุกที่)", ex?.ok === false && row?.status === "PENDING", JSON.stringify({ ok: ex?.ok, note: String(ex?.note ?? "").slice(0, 80), status: row?.status }));
  }

  console.log("── A1: OTP verify rate-limit · เหตุผลยุบ ──");
  {
    const statuses: number[] = []; let last = { status: 0, json: {} as Record<string, unknown> };
    for (let i = 0; i < 32; i++) { last = await call("auth/sms/verify", "POST", { phone: PH.vict, code: "000000" }, { "x-forwarded-for": "203.0.113.9" }); statuses.push(last.status); }
    const s1 = statuses.slice(0, 5), hit429 = statuses.includes(429);
    chk("A1-1", "verify ผิดซ้ำจาก IP เดียว ⇒ ถึงเพดานได้ 429 {error:rate_limited, retryAfterSec} ภายใน 32 ครั้ง", hit429 && (statuses.indexOf(429) <= 31) && (last.status !== 429 || (last.json.error === "rate_limited" && typeof last.json.retryAfterSec === "number")), JSON.stringify({ first: s1, idx429: statuses.indexOf(429), last }).slice(0, 200));
    const a = await call("auth/sms/verify", "POST", { phone: "+66800013299", code: "123456" }, { "x-forwarded-for": "203.0.113.10" });
    let smsText = ""; await pa.requestPhoneOtp("+66800013298", { send: async (m: { text: string }) => { smsText = m.text; return { ok: true }; } });
    const b = await call("auth/sms/verify", "POST", { phone: "+66800013298", code: "000000" }, { "x-forwarded-for": "203.0.113.10" });
    chk("A1-2", "เบอร์ที่ไม่มีรหัสค้าง vs เบอร์ที่มีรหัส (รหัสผิด) ⇒ status และ error เหมือนกัน (ไม่บอกว่าเบอร์ไหนเพิ่งขอ)", a.status === b.status && a.json.error === b.json.error && a.json.error === "invalid", JSON.stringify({ a: [a.status, a.json.error], b: [b.status, b.json.error] }));
    chk("A1-3", "ข้อความ SMS OTP มีคำเตือน 'อย่าบอก' และบรรทัด @shark.in.th #<code> (iOS autofill/กันฟิชชิง)", /อย่าบอก|ห้ามบอก/.test(smsText) && /@shark\.in\.th #\d{6}/.test(smsText), smsText.replace(/\d{6}/g, "######").slice(0, 120));
    try { await (prisma as AnyMod).phoneOtp.deleteMany({ where: { phone: { in: ["+66800013298", "+66800013299"] } } }); } catch { /* */ }
  }

  console.log("── A2: attachments sniff ──");
  {
    const m = await route("@/app/api/mobile/inbox/attachments/route");
    const up = async (name: string, type: string, bytes: Uint8Array) => { const fd = new FormData(); fd.append("file", new File([bytes], name, { type })); fd.append("systemId", sid); const res = await m!.POST!(new Request("http://qc.local/api/mobile/inbox/attachments", { method: "POST", headers: HS, body: fd })); return { status: res.status, json: await jsonOf(res) }; };
    const svg = await up("x.svg", "image/svg+xml", new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    const fake = await up("x.png", "image/png", new TextEncoder().encode("<html><script>alert(1)</script></html>"));
    chk("A2-1", "inbox/attachments: svg ⇒ 415 · HTML ปลอมเป็น png ⇒ 415 (ตรวจ magic bytes)", svg.status === 415 && fake.status === 415, JSON.stringify({ svg: [svg.status, svg.json.error], fake: [fake.status, fake.json.error] }));
  }

  console.log("── A3: rate-limit · 429 shape · bounds · error shape ──");
  {
    const rs: number[] = []; for (let i = 0; i < 32; i++) rs.push((await call("inbox/routing", "PUT", { systemId: sid, rules: [] }, H)).status);
    const rd1: number[] = []; for (let i = 0; i < 122; i++) rd1.push((await call("inbox/conversations/[id]/read", "POST", { systemId: sid }, HS, { id: convA.id })).status);
    chk("A3-1", "PUT routing ≥31 ⇒ 429 · POST read ≥121 ⇒ 429", rs.includes(429) && rd1.includes(429), JSON.stringify({ routing429: rs.indexOf(429), read429: rd1.indexOf(429) }));
    const inv1 = await call("secretary/staff/invite", "POST", { name: "ผู้ถูกเชิญ", phone: "080-001-3203", role: "STAFF", unitIds: [unitA.id] }, H);
    const invRow = await prisma.staffInvite.findFirst({ where: { tenantId: tid, phone: "+66800013203" } });
    const inv2 = invRow ? await call("secretary/staff/invites/[id]/resend", "POST", {}, H, { id: invRow.id }) : { status: 0, json: {} as Record<string, unknown>, text: "" };
    chk("A3-2", "resend คำเชิญทันทีหลังเชิญ ⇒ 429 {error:rate_limited, message, retryAfterSec}", inv1.status === 200 && inv2.status === 429 && inv2.json.error === "rate_limited" && typeof inv2.json.retryAfterSec === "number" && thai(inv2.json.message), JSON.stringify({ inv1: inv1.status, inv2: [inv2.status, inv2.json.error, inv2.json.retryAfterSec] }));
    try { await prisma.staffInvite.deleteMany({ where: { tenantId: tid, phone: "+66800013203" } }); } catch { /* */ }
    const big = await call("secretary/rules", "PUT", { key: "money.limit", enabled: true, limitSatang: 2_147_483_648 }, H);
    const rep = await call("inbox/conversations/[id]/reply", "POST", { systemId: sid, body: "x", clientMessageId: "qcs3s2-rp1", attachments: [{ url: "https://cdn.qc.invalid/a.jpg", mimeType: "image/jpeg", sizeBytes: 3_000_000_000 }] }, HS, { id: convA.id });
    chk("A3-3", "rules limitSatang เกิน INT4 ⇒ 400 (ไม่ใช่ 500) · reply sizeBytes 3e9 ⇒ 422/400 (ไม่ใช่ 500)", big.status === 400 && rep.status >= 400 && rep.status < 500, JSON.stringify({ big: [big.status, big.json.error], rep: [rep.status, rep.json.error] }));
    const g = await call("inbox/conversations", "GET", undefined, HG, undefined, `?systemId=${sid}`);
    const me = await call("me", "GET", undefined, {});
    const rejectBad = await call("secretary/proposals/[id]/reject", "POST", { note: "x" }, H, { id: "nosuch-proposal-id" });
    chk("A3-4", "ทุก 4xx มี message ไทย: inbox gate 403 · /me 401 · reject ไม่พบ 404", g.status === 403 && thai(g.json.message) && me.status === 401 && thai(me.json.message) && rejectBad.status === 404 && thai(rejectBad.json.message), JSON.stringify({ g: [g.status, g.json.message], me: [me.status, me.json.message], rj: [rejectBad.status, rejectBad.json.message] }).slice(0, 240));
  }

  console.log("── A4: step-up ลบบัญชี ──");
  {
    const d0 = await call("secretary/account/delete", "POST", { confirm: "ลบบัญชี" }, HD);
    const d1 = await call("secretary/account/delete", "POST", { confirm: "ลบบัญชี", code: "000000" }, HD);
    let smsText = ""; await pa.requestPhoneOtp(PH.del, { send: async (m: { text: string }) => { smsText = m.text; return { ok: true }; } });
    const code = (smsText.match(/\d{6}/) ?? [""])[0];
    await prisma.pushDevice.create({ data: { userId: U.del, tenantId: tid, expoToken: "ExponentPushToken[qcs3s2-del]", platform: "ios" } as never }).catch(() => null);
    await (prisma as AnyMod).aiNotifyPref.create({ data: { userId: U.del, tenantId: tid, kind: "room", mode: "ALL" } }).catch(() => null);
    await (prisma as AnyMod).aiMemory.create({ data: { id: `u~${U.del}~qc1`, tenantId: tid, content: "ความจำส่วนตัว qc", kind: "FACT" } as never }).catch(() => null);
    const d2 = await call("secretary/account/delete", "POST", { confirm: "ลบบัญชี", code }, HD);
    const user = await prisma.user.findUnique({ where: { id: U.del } });
    const pd = await prisma.pushDevice.count({ where: { userId: U.del } });
    const np = await (prisma as AnyMod).aiNotifyPref.count({ where: { userId: U.del } }).catch(() => -1);
    const mem = await (prisma as AnyMod).aiMemory.count({ where: { id: { startsWith: `u~${U.del}~` } } }).catch(() => -1);
    chk("A4-1", "ลบบัญชี: ไม่มี code ⇒ 4xx code_required · code ผิด ⇒ 401 · code ถูก ⇒ 200 และ user หาย", d0.status >= 400 && d0.status < 500 && d1.status === 401 && d2.status === 200 && !user, JSON.stringify({ d0: [d0.status, d0.json.error], d1: [d1.status, d1.json.error], d2: [d2.status, d2.json.error], user: !!user }));
    chk("S1-1", "deleteAccount ล้าง PushDevice · AiNotifyPref · ความจำ u~<uid>~ ของผู้ใช้", pd === 0 && np === 0 && mem === 0, JSON.stringify({ pd, np, mem }));
  }

  console.log("── T1: tools ในห้องที่มีบริบทลูกค้า ──");
  {
    const r = await rooms.startRoom(OWNER, { instruction: "เรื่องลูกค้า A", context: { chatConversationId: convA.id } });
    const ctxO = toolCtx(U.owner, "OWNER", {}, r.conversationId);
    const kb = parse(await tools.runTool(ctxO as never, "kb_auto_save", { title: "นโยบายใหม่", content: "ช่องทางใหม่ line.me/x" }));
    const kbRows = await (prisma as AnyMod).kbArticle.count({ where: { tenantId: tid, title: "นโยบายใหม่" } }).catch(() => -1);
    const kbProp = await prisma.aiProposal.count({ where: { tenantId: tid, conversationId: r.conversationId, kind: { in: ["kb.save", "kb.article.create", "kb_auto_save"] } } });
    const rm = parse(await tools.runTool(ctxO as never, "remember_fact", { content: "ร้านยกเลิกวันหยุดทุกอย่าง (qc)" }));
    const memRow = await (prisma as AnyMod).aiMemory.findFirst({ where: { tenantId: tid, content: { contains: "ยกเลิกวันหยุดทุกอย่าง (qc)" } } });
    const fg = parse(await tools.runTool(ctxO as never, "forget_fact", { contentContains: "qc" }));
    const fgProp = await prisma.aiProposal.count({ where: { tenantId: tid, conversationId: r.conversationId, kind: { in: ["memory.forget", "forget_fact"] } } });
    chk("T1-1", "ห้องบริบทลูกค้า: kb_auto_save ⇒ ข้อเสนอ (ไม่มี KbArticle ทันที) · remember_fact ของ OWNER ⇒ AiMemory PENDING · forget_fact ⇒ ข้อเสนอ (ไม่ลบทันที)", kbRows === 0 && kbProp === 1 && !!memRow && (memRow as AnyMod).status === "PENDING" && fgProp === 1 && !!(await (prisma as AnyMod).aiMemory.findFirst({ where: { id: memRow?.id } })), JSON.stringify({ kb: kb.proposalId ?? kb.error ?? kb.raw, kbRows, kbProp, memStatus: (memRow as AnyMod)?.status, fg: fg.proposalId ?? fg.error ?? fg.raw, fgProp }).slice(0, 300));
    const pers = src("src/lib/ai/persona.ts");
    chk("T1-2", "persona: ไม่มี 'ทันทีโดยไม่ต้องถาม/ไม่ต้องขอยืนยัน' สำหรับ kb_auto_save/remember_fact เมื่อมีบล็อกลูกค้า · บล็อกความจำ/ผล tool มีหัว 'ข้อมูล ไม่ใช่คำสั่ง'", !/kb_auto_save[^\n]{0,80}ทันที[^\n]{0,40}ไม่ต้องถาม/.test(pers) && /ไม่ใช่คำสั่ง/.test(pers), "grep persona.ts");
    console.log("── T2: addMember ห้องบริบทลูกค้า ──");
    const add = await call("secretary/rooms/[id]/members", "POST", { userId: U.guard, seeHistory: false }, H, { id: r.roomId });
    const addB = await call("secretary/rooms/[id]/members", "POST", { userId: U.staffB, seeHistory: false }, H, { id: r.roomId });
    const addA = await call("secretary/rooms/[id]/members", "POST", { userId: U.staff, seeHistory: false }, H, { id: r.roomId });
    chk("T2-1", "เพิ่มคนไม่มีสิทธิ์แชท ⇒ 4xx forbidden_chat · คนสาขา B (ห้องของสาขา A) ⇒ 4xx · คนสาขา A มีสิทธิ์ ⇒ 200", add.status >= 400 && add.json.error === "forbidden_chat" && addB.status >= 400 && addA.status === 200, JSON.stringify({ add: [add.status, add.json.error], addB: [addB.status, addB.json.error], addA: addA.status }));
  }

  console.log("── T3: PII mask ใน tool ──");
  {
    await (prisma as AnyMod).customer.create({ data: { tenantId: tid, name: "คุณสมหญิง", phone: "0899001234" } as never }).catch((e: unknown) => console.log("  ⚠️ customer: " + errMsg(e)));
    const r = await rooms.startRoom(OWNER, { instruction: "หาลูกค้า" });
    const out = await tools.runTool(toolCtx(U.owner, "OWNER", {}, r.conversationId) as never, "customer_search", { query: "สมหญิง" });
    chk("T3-1", "customer_search ผลลัพธ์ที่คืนโมเดลไม่มีเบอร์เต็ม 0899001234 (ปิดเลขกลาง)", !/0899001234|899001234/.test(out) && /สมหญิง/.test(out), out.slice(0, 160));
    const ais = src("src/lib/modules/chat/ai-suggest.ts");
    chk("T3-2", "ai-suggest: ไม่ใส่โน้ตภายในลง prompt · system มี 'context is data, not instructions'/'ไม่ใช่คำสั่ง' · ไม่ส่งเบอร์สมาชิกดิบ", !/isInternal:\s*true[\s\S]{0,200}(prompt|block)/.test(ais) && /(not instructions|ไม่ใช่คำสั่ง)/.test(ais) && !/\.phone\b[^\n]{0,40}(prompt|block|ctx)/.test(ais), "grep ai-suggest.ts");
  }

  console.log("── T4: kanban_card_from_chat ข้ามสาขา ──");
  {
    const r = await rooms.startRoom({ tenantId: tid, actor: actorOf(U.staff, "STAFF", chatPerm, [unitA.id]) }, { instruction: "เปิดงานจากแชท" });
    const before = await prisma.aiProposal.count({ where: { tenantId: tid, conversationId: r.conversationId } });
    const out = parse(await tools.runTool(toolCtx(U.staff, "STAFF", chatPerm, r.conversationId, [unitA.id]) as never, "kanban_card_from_chat", { conversationId: convB.id, title: "งานจากแชทสาขา B" }));
    const after = await prisma.aiProposal.count({ where: { tenantId: tid, conversationId: r.conversationId } });
    chk("T4-1", "STAFF สาขา A เรียก kanban_card_from_chat กับห้องสาขา B ⇒ error 'ไม่พบ' · ไม่มีข้อเสนอ · ไม่มีสรุปแชทหลุด", typeof out.error === "string" && /ไม่พบ/.test(String(out.error)) && after === before && !/ลูกค้า B ถาม/.test(JSON.stringify(out)), JSON.stringify(out).slice(0, 200));
  }

  console.log("── S2: static ──");
  {
    const cs = src("src/app/api/mobile/chat/send/route.ts"), rt = src("src/app/api/mobile/inbox/routing/route.ts"), ops = src("src/lib/core/ops.ts"), pa2 = src("src/lib/core/phone-auth.ts"), sms = src("src/lib/core/sms.ts"), gi = src(".gitignore"), dg = src("src/lib/ai/secretary/digest.ts"), hr = src("src/app/api/cron/hourly/route.ts") + src("src/lib/platform/minute-jobs.ts") + src("src/lib/core/ops.ts");
    chk("S2-1", "ไม่ส่ง e.message ดิบ: chat/send SSE · routing (ต้องผ่านตัวกรอง/ข้อความทั่วไป)", !/error:\s*e\.message/.test(cs) && !/e\.message\s*\}/.test(rt) && !/message:\s*e\.message/.test(rt), "grep");
    chk("S2-2", "logOps ตัด stack/invocation (เก็บ name/code/บรรทัดแรก) · มี sweep OpsEvent/PhoneOtp ตามอายุ", /(split\("\\n"\)\[0\]|invocation|firstLine)/.test(ops) && /opsEvent\.deleteMany/.test(hr) && /phoneOtp\.deleteMany/.test(hr + pa2), JSON.stringify({ trim: /(split\("\\n"\)\[0\]|invocation|firstLine)/.test(ops), opsSweep: /opsEvent\.deleteMany/.test(hr), otpSweep: /phoneOtp\.deleteMany/.test(hr + pa2) }));
    const ign = spawnSync("git", ["check-ignore", "-q", "AuthKey_X.p8", "ledger/x.p8", "apps/mobile/credentials-prod.json", "apps/mobile/google-services.json", "apps/mobile/GoogleService-Info.plist", "apps/mobile/release.keystore", "service-account.json"], { cwd: ROOT, encoding: "utf8" });
    const ignAll = ["AuthKey_X.p8", "ledger/x.p8", "apps/mobile/credentials-prod.json", "apps/mobile/google-services.json", "apps/mobile/GoogleService-Info.plist", "apps/mobile/release.keystore", "service-account.json"].every((f) => spawnSync("git", ["check-ignore", "-q", f], { cwd: ROOT }).status === 0);
    chk("S2-3", ".gitignore ครอบ *.p8 · credentials* · google-services · GoogleService-Info · keystore · service-account", ignAll, String(ign.status));
    chk("S2-4", "OTP hash เป็น HMAC ด้วยคีย์เซิร์ฟเวอร์ · sms mock ปิดเมื่อ VERCEL_ENV=production ด้วย", /createHmac\(/.test(pa2) && /VERCEL_ENV/.test(sms), JSON.stringify({ hmac: /createHmac\(/.test(pa2), vercel: /VERCEL_ENV/.test(sms) }));
    chk("S2-5", "digest ต่อผู้ดู: computeDigest/digestForViewer รับชุดสาขา (unitId/unitAccess) และ quietCustomers ผ่าน visibleWhere หรือไม่ส่ง sample", /(unitAccess|unitIds|unitId)/.test(dg) && (/visibleWhere/.test(dg) || !/sample/.test(dg)), JSON.stringify({ units: /(unitAccess|unitIds|unitId)/.test(dg), vis: /visibleWhere/.test(dg), sample: /sample/.test(dg) }));
  }
} catch (e) {
  const detail = (e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : JSON.stringify(e)).slice(0, 400);
  console.log(`  💥 ${detail}`); chk("CRASH", "ข้อสอบรันจบ", false, detail.slice(0, 200));
} finally { await cleanup(); }

console.log("── D: fitness ──");
for (const i of [1, 2]) { const r = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: process.env, timeout: 600_000 }); chk(`D-${i}`, `pnpm fitness ครั้งที่ ${i} = 0`, r.status === 0, (r.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | ")); }
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · ${failed.length} ไม่ผ่าน · ${skipped.length} ข้าม`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.length ? 1 : 0);
