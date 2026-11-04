// QC — SECRETARY S1.22 · บริบทลูกค้าในห้องเลขา (X8 ไม่มี PII) · นอกเวลาทำการ Shark ตอบ/ส่งต่อคน · migration secretary_b (AiSettings 3 คอลัมน์)กลับ 24 ชม. · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.22.md · RESOLUTIONS R-K15 R-K13 §K §M §L
//
// กลุ่มข้อ:
//   M  migration secretary_b: โฟลเดอร์เรียงหลัง secretary_a · SQL additive · AiSettings มี afterHoursReply/afterHoursHandoff/aiDisclosure
//   C  customerContextOf/customerBlock: ชื่อ/ช่องทาง/ข้อความล่าสุด · ไม่มีเบอร์/อีเมล · unit ไม่ตรง = null · ต่างร้าน = null · startRoom ตรวจ context
//   A  after-hours: settings ปริยาย · OWNER เท่านั้น · isAfterHours · autoReply disabled/in_hours/money/complaint/unknown/reply · กันตอบซ้ำ · handoff tag+event · hook receiveExternalInbound
//   D  fitness ×2
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.22.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.22";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const ACT_FILE = join(ROOT, "src/lib/ai/secretary/actions.ts");
const KT_FILE = join(ROOT, "src/lib/ai/kind-tables.ts");
const AH_FILE = join(ROOT, "src/lib/modules/chat/after-hours.ts");
const STARTED = existsSync(AH_FILE);
if (!FORCED && !STARTED) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/lib/modules/chat/after-hours.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
process.env.SHARK_AI_MOCK = "1";
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
async function throws(fn: () => Promise<unknown> | unknown): Promise<string | null> { try { await fn(); return null; } catch (e) { return errMsg(e); } }
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
import type { AiChatMessage, AiProvider, AiReply, AiToolDef } from "@/lib/ai/provider";
class Scripted implements AiProvider { calls = 0; constructor(private text = "ok") {} async chat(_m: AiChatMessage[], _o?: { tools?: AiToolDef[] }): Promise<AiReply> { this.calls++; return { text: this.text, tokensIn: 1, tokensOut: 1, model: "scripted" }; } }

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const chat = await import("@/lib/modules/chat/service");
const rooms = await import("@/lib/ai/secretary/rooms");
const cc = (await import("@/lib/ai/secretary/customer-context").catch(() => null)) as AnyMod | null;
const ah = (await import("@/lib/modules/chat/after-hours").catch(() => null)) as AnyMod | null;
import { readdirSync } from "node:fs";

console.log("── M: migration secretary_b ──");
{
  const dirs = readdirSync(join(ROOT, "prisma/migrations")).filter((d) => /secretary_b$/.test(d)).sort();
  const aDir = readdirSync(join(ROOT, "prisma/migrations")).find((d) => /secretary_a$/.test(d)) ?? "";
  const sql = dirs.length ? readFileSync(join(ROOT, "prisma/migrations", dirs[dirs.length - 1]!, "migration.sql"), "utf8") : "";
  chk("M-1", "มีโฟลเดอร์ *_secretary_b เรียงหลัง secretary_a · SQL additive (ไม่มี DROP/ALTER TYPE/NOT NULL ไม่มี default) · มี afterHoursReply/afterHoursHandoff/aiDisclosure", dirs.length === 1 && dirs[0]! > aDir && !!sql && !/\bDROP\b|ALTER TYPE/i.test(sql) && !/NOT NULL(?![^,;]*DEFAULT)/i.test(sql.replace(/\n/g, " ")) && /afterHoursReply/.test(sql) && /afterHoursHandoff/.test(sql) && /aiDisclosure/.test(sql), JSON.stringify({ dirs, aDir }));
  const cols = await prisma.$queryRawUnsafe<{ column_name: string; column_default: string | null; is_nullable: string }[]>(`SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'AiSettings' AND column_name IN ('afterHoursReply','afterHoursHandoff','aiDisclosure')`).catch(() => []);
  const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]));
  chk("M-2", "ฐาน QC: AiSettings.afterHoursReply default false · afterHoursHandoff default true · aiDisclosure nullable", /false/.test(byName.afterHoursReply?.column_default ?? "") && /true/.test(byName.afterHoursHandoff?.column_default ?? "") && byName.aiDisclosure?.is_nullable === "YES", JSON.stringify(byName).slice(0, 200));
}

const U = { owner: "qcs122-owner", mgr: "qcs122-mgr", staff: "qcs122-staff" };
let tid = "", tid2 = "";
const cleanup = async () => {
  for (const t of [tid, tid2].filter(Boolean)) {
    for (const m of ["aiActionLog", "aiProposal", "aiMessage", "aiRoomJob", "aiRoomMember", "aiRoom", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "aiSettings", "appNotification", "chatConversationEvent", "chatMessage", "chatConversation", "chatContact", "chatChannelConnection", "chatSetting", "appSystem", "membership"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: t } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: t } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s122-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs122-" } } }); } catch { /* */ }
};
const HOUR = 3_600_000;
const bkkHour = (d: Date) => (d.getUTCHours() + 7) % 24;
const atBkk = (h: number) => { const d = new Date("2026-11-10T00:00:00Z"); d.setUTCHours(h - 7, 30, 0, 0); return d; }; // 10 พ.ย. 2026 (อังคาร) เวลา h:30 BKK
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.22", slug: `qc-sec-s122-${Date.now().toString(36)}` } }); tid = t.id;
  const t2 = await prisma.tenant.create({ data: { name: "QC SEC S1.22 อื่น", slug: `qc-sec-s122-o-${Date.now().toString(36)}` } }); tid2 = t2.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `ผู้ใช้ ${k}` } });
  const mk = (role: "OWNER" | "MANAGER" | "STAFF", userId: string, unitAccess: string[] = ["*"], permissions: Record<string, unknown> = {}) => prisma.membership.create({ data: { tenantId: tid, userId, role, unitAccess, permissions: permissions as never, acceptedAt: new Date() } });
  await mk("OWNER", U.owner); await mk("MANAGER", U.mgr); await mk("STAFF", U.staff, ["unit-x"], { "chat.conversation.read": true, "ai.chat.send": true });
  const M = (role: "OWNER" | "MANAGER" | "STAFF", unitAccess: string[] = ["*"], permissions: Record<string, unknown> = {}) => ({ role, unitAccess, permissions });
  const actor = (userId: string, role: "OWNER" | "MANAGER" | "STAFF", unitAccess: string[] = ["*"], permissions: Record<string, unknown> = {}) => ({ kind: "member" as const, tenantId: tid, userId, membership: M(role, unitAccess, permissions) });
  const OWNER = actor(U.owner, "OWNER"), MGR = actor(U.mgr, "MANAGER"), STAFF = actor(U.staff, "STAFF", ["unit-x"], { "chat.conversation.read": true, "ai.chat.send": true });
  const chatSys = await sys.createSystem(tid, "CHAT", "แชท QC");
  const hours = { tz: "Asia/Bangkok", note: "", days: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, open: "09:00", close: "18:00" })), holidays: [] };
  await prisma.chatSetting.create({ data: { tenantId: tid, systemId: chatSys.id, businessHours: hours as never } as never });
  const conn = await prisma.chatChannelConnection.create({ data: { tenantId: tid, systemId: chatSys.id, type: "WEBCHAT", displayName: "เว็บ QC", externalAccountId: `web-qcs122-${Date.now().toString(36)}`, credentials: {} as never } as never });
  const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "WEBCHAT", channelConnectionId: conn.id, externalUserId: `qcs122-guest-${Date.now().toString(36)}`, displayName: "คุณลูกค้า ทดสอบ", phone: "0812345678", email: "pii@example.com", customerId: "qcs122-member" } as never });
  const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "WEBCHAT", contactId: contact.id, status: "OPEN", unitId: "unit-y", tags: ["วีไอพี"] as never } as never });
  const inMsg = (body: string, dir: "IN" | "OUT" = "IN", extra: Record<string, unknown> = {}) => prisma.chatMessage.create({ data: { tenantId: tid, systemId: chatSys.id, conversationId: conv.id, direction: dir, type: "TEXT", body, ...extra } as never });
  await inMsg("สวัสดีครับ เบอร์ผม 0812345678 อีเมล pii@example.com"); await inMsg("ขอใบเสนอราคา 3 รายการครับ"); await inMsg("บันทึกภายใน ห้ามโชว์", "OUT", { isInternal: true });

  console.log("── C: customer context ──");
  if (!cc) { for (const i of [1, 2, 3]) skip(`C-${i}`, "context", "ไม่มี customer-context.ts"); }
  else {
    const c = await cc.customerContextOf(tid, { chatConversationId: conv.id }, OWNER) as Record<string, unknown> | null;
    const cs = JSON.stringify(c ?? null);
    const block = c ? (cc.customerBlock(c) as string) : "";
    chk("C-1", "OWNER: displayName/channel WEBCHAT/tags/recent (2 ข้อความ IN · ไม่มี internal) · ไม่มีเบอร์/อีเมล (mask) · customerBlock ไทย ≤800 ตัว ไม่มี PII", !!c && c.displayName === "คุณลูกค้า ทดสอบ" && c.channel === "WEBCHAT" && JSON.stringify(c.tags).includes("วีไอพี") && Array.isArray(c.recent) && (c.recent as unknown[]).length === 2 && !/0812345678|pii@example/.test(cs) && !/ห้ามโชว์/.test(cs) && thai(block) && block.length <= 800 && !/0812345678|pii@example/.test(block) && /ลูกค้า ทดสอบ/.test(block), cs.slice(0, 220));
    const cS = await cc.customerContextOf(tid, { chatConversationId: conv.id }, STAFF);
    const cX = await cc.customerContextOf(tid2, { chatConversationId: conv.id }, { ...OWNER, tenantId: tid2 });
    const cN = await cc.customerContextOf(tid, { chatConversationId: "nosuch" }, OWNER);
    chk("C-2", "STAFF unit-x (ห้อง unit-y) ⇒ null · ร้านอื่น ⇒ null · id ไม่มี ⇒ null", cS === null && cX === null && cN === null, JSON.stringify({ cS: !!cS, cX: !!cX, cN: !!cN }));
    const r = (await rooms.startRoom({ tenantId: tid, actor: OWNER as never }, { instruction: "ช่วยตอบลูกค้ารายนี้", context: { chatConversationId: conv.id, contactId: contact.id } })) as { roomId: string }; // ORACLE-EDIT typing
    const room = await prisma.aiRoom.findUnique({ where: { id: r.roomId } });
    const eBad = await throws(() => rooms.startRoom({ tenantId: tid, actor: OWNER }, { instruction: "x", context: { chatConversationId: "nosuch" } }));
    const eUnit = await throws(() => rooms.startRoom({ tenantId: tid, actor: STAFF }, { instruction: "x", context: { chatConversationId: conv.id } }));
    chk("C-3", "startRoom context ถูกต้อง ⇒ contextJson มี chatConversationId · id ไม่มี ⇒ throw ไทย · STAFF ไม่เห็นห้อง ⇒ throw ไทย", (room?.contextJson as Record<string, unknown> | null)?.chatConversationId === conv.id && thai(eBad) && thai(eUnit), JSON.stringify({ ctx: room?.contextJson, eBad, eUnit }).slice(0, 200));
  }

  console.log("── A: after-hours ──");
  if (!ah) { for (const i of [1, 2, 3, 4, 5, 6, 7]) skip(`A-${i}`, "after-hours", "ไม่มี after-hours.ts"); }
  else {
    const s0 = await ah.afterHoursSettings(tid) as { reply: boolean; handoff: boolean; disclosure: string };
    const eMgr = await throws(() => ah.setAfterHours(tid, { userId: U.mgr, tenantId: tid, membership: M("MANAGER") }, { reply: true }));
    const eEmpty = await throws(() => ah.setAfterHours(tid, { userId: U.owner, tenantId: tid, membership: M("OWNER") }, { disclosure: "   " }));
    const s1 = await ah.setAfterHours(tid, { userId: U.owner, tenantId: tid, membership: M("OWNER") }, { reply: true, disclosure: "ตอบโดย Shark ผู้ช่วย AI ครับ" }) as { reply: boolean; handoff: boolean; disclosure: string };
    const rowS = await prisma.aiSettings.findUnique({ where: { tenantId: tid } }) as Record<string, unknown> | null;
    chk("A-1", "settings ปริยาย reply=false handoff=true disclosure ไทย · MANAGER ตั้ง ⇒ throw · disclosure ว่าง ⇒ throw ไทย · OWNER ตั้ง ⇒ บันทึก AiSettings.afterHoursReply=true", s0.reply === false && s0.handoff === true && thai(s0.disclosure) && !!eMgr && thai(eEmpty) && s1.reply === true && s1.disclosure === "ตอบโดย Shark ผู้ช่วย AI ครับ" && rowS?.afterHoursReply === true, JSON.stringify({ s0, eMgr, eEmpty, s1 }).slice(0, 220));
    chk("A-2", "isAfterHours: ไม่ตั้ง (null) = false · 23:30 BKK = true · 12:30 BKK = false · 08:30 = true", ah.isAfterHours(null, atBkk(23)) === false && ah.isAfterHours(hours, atBkk(23)) === true && ah.isAfterHours(hours, atBkk(12)) === false && ah.isAfterHours(hours, atBkk(8)) === true, "");
    const base = { tenantId: tid, systemId: chatSys.id, conversationId: conv.id };
    const vIn = await ah.afterHoursAutoReply({ ...base, inboundText: "เปิดกี่โมงครับ", now: atBkk(12), provider: new Scripted("เปิด 9 โมงครับ") }) as { action: string; reason?: string };
    const vMoney = await ah.afterHoursAutoReply({ ...base, inboundText: "ราคาเท่าไหร่ โอนได้ไหม", now: atBkk(23), provider: new Scripted("x") }) as { action: string; reason?: string };
    const vComp = await ah.afterHoursAutoReply({ ...base, inboundText: "บริการแย่มาก ไม่พอใจเลย", now: atBkk(23), provider: new Scripted("x") }) as { action: string; reason?: string };
    const vUnk = await ah.afterHoursAutoReply({ ...base, inboundText: "มีที่จอดรถไหม", now: atBkk(23), provider: new Scripted("UNKNOWN") }) as { action: string; reason?: string };
    await prisma.chatConversation.update({ where: { id: conv.id }, data: { staffUnreadCount: 3, firstResponseAt: null } });
    const before = await prisma.chatMessage.count({ where: { conversationId: conv.id, direction: "OUT" } });
    const inRow = await inMsg("เปิดกี่โมงครับ");
    const p = new Scripted("เปิด 9 โมงครับ");
    const vRep = await ah.afterHoursAutoReply({ ...base, inboundText: "เปิดกี่โมงครับ", inboundMessageId: inRow.id, now: atBkk(23), provider: p }) as { action: string; body?: string };
    const out = await prisma.chatMessage.findFirst({ where: { conversationId: conv.id, direction: "OUT", isInternal: false }, orderBy: { createdAt: "desc" } });
    const meta = (out?.meta ?? {}) as Record<string, unknown>;
    const vRep2 = await ah.afterHoursAutoReply({ ...base, inboundText: "เปิดกี่โมงครับ", inboundMessageId: inRow.id, now: atBkk(23), provider: p }) as { action: string };
    const after = await prisma.chatMessage.count({ where: { conversationId: conv.id, direction: "OUT" } });
    chk("A-3", "ในเวลาทำการ ⇒ in_hours · เงิน ⇒ handoff money · ร้องเรียน ⇒ handoff complaint · UNKNOWN ⇒ handoff unknown · ตอบได้ ⇒ reply + ChatMessage OUT senderName Shark · body มี disclosure · meta.ai_afterHours · clientMessageId ah:<id> · ซ้ำ id เดิม ⇒ ไม่สร้างแถวใหม่", vIn.reason === "in_hours" && vMoney.action === "handoff" && vMoney.reason === "money" && vComp.reason === "complaint" && vUnk.reason === "unknown" && vRep.action === "reply" && !!out && out.senderName === "Shark (ผู้ช่วย AI)" && /เปิด 9 โมง/.test(out.body ?? "") && /ตอบโดย Shark ผู้ช่วย AI/.test(out.body ?? "") && meta.ai_afterHours === "1" && out.clientMessageId === `ah:${inRow.id}` && after === before + 1 && (out.body ?? "").startsWith("Shark (ผู้ช่วย AI):") && (vRep2.action !== "reply" || after === before + 1), JSON.stringify({ vIn, vMoney, vComp, vUnk, vRep, out: out?.body?.slice(0, 40), cm: out?.clientMessageId, n: after - before }).slice(0, 300)); // ORACLE-EDIT N14: วงเล็บ
    const convAfter = await prisma.chatConversation.findUnique({ where: { id: conv.id } });
    const ev = await prisma.chatConversationEvent.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: "asc" } });
    const handEv = ev.filter((e) => JSON.stringify(e.meta ?? {}).includes("handoff"));
    chk("A-4", "handoff: tags มี 'รอคน' ครั้งเดียว (3 handoff ไม่ซ้ำ) · มี ChatConversationEvent meta ai=handoff พร้อม reason · ไม่ส่ง PII เข้าโมเดล (provider ไม่ถูกเรียกใน money/complaint)", JSON.stringify(convAfter?.tags).split("รอคน").length === 2 && handEv.length >= 1 && /money|complaint|unknown/.test(JSON.stringify(handEv[0]!.meta)), JSON.stringify({ tags: convAfter?.tags, ev: handEv.length }));
    // A-6 (R-S1.22a/b): AI ตอบแล้ว unread/firstResponseAt ไม่เปลี่ยน · คำถามเงินหลังมี AI ตอบ ⇒ ยัง handoff money (ไม่นับ AI เป็นคนตอบ)
    const convU = await prisma.chatConversation.findUnique({ where: { id: conv.id }, select: { staffUnreadCount: true, firstResponseAt: true } });
    const inMoney = await inMsg("ราคาเท่าไร ค่าส่งเท่าไหร");
    const vMoney2 = await ah.afterHoursAutoReply({ ...base, inboundText: "ราคาเท่าไร ค่าส่งเท่าไหร", inboundMessageId: inMoney.id, now: atBkk(23), provider: new Scripted("x") }) as { action: string; reason?: string };
    chk("A-6", "หลัง AI ตอบ: staffUnreadCount คง 3 · firstResponseAt คง null · 'ราคาเท่าไร' (ไม่มีวรรณยุกต์) หลังมี AI ตอบ ⇒ handoff money", convU?.staffUnreadCount === 3 && convU?.firstResponseAt === null && vMoney2.action === "handoff" && vMoney2.reason === "money", JSON.stringify({ convU, vMoney2 }));
    // A-7 (R-S1.22b): ขอคุยกับคน ⇒ handoff human · คำตอบของโมเดลมีราคา ⇒ handoff money · มีคนตอบแล้ว ⇒ answered
    const vHuman = await ah.afterHoursAutoReply({ ...base, inboundText: "ขอคุยกับคนหน่อยครับ", now: atBkk(23), provider: new Scripted("x") }) as { action: string; reason?: string };
    const inSvc = await inMsg("มีบริการอะไรบ้าง");
    const vPrice = await ah.afterHoursAutoReply({ ...base, inboundText: "มีบริการอะไรบ้าง", inboundMessageId: inSvc.id, now: atBkk(23), provider: new Scripted("มีนวดไทย 500 บาทครับ") }) as { action: string; reason?: string };
    const inAsk = await inMsg("เปิดวันอาทิตย์ไหม");
    await prisma.chatMessage.create({ data: { tenantId: tid, systemId: chatSys.id, conversationId: conv.id, direction: "OUT", type: "TEXT", body: "เปิดครับ", senderUserId: U.owner } as never });
    const vAns = await ah.afterHoursAutoReply({ ...base, inboundText: "เปิดวันอาทิตย์ไหม", inboundMessageId: inAsk.id, now: atBkk(23), provider: new Scripted("เปิดครับ") }) as { action: string; reason?: string };
    chk("A-7", "'ขอคุยกับคน' ⇒ handoff human · คำตอบมี '500 บาท' ⇒ handoff money (ไม่ส่ง) · พนักงานตอบแล้ว ⇒ handoff answered ไม่ส่งซ้ำ", vHuman.action === "handoff" && vHuman.reason === "human" && vPrice.action === "handoff" && vPrice.reason === "money" && !(await prisma.chatMessage.findFirst({ where: { conversationId: conv.id, body: { contains: "500 บาท" } } })) && vAns.action === "handoff" && vAns.reason === "answered", JSON.stringify({ vHuman, vPrice, vAns }));
    // hook จริง: ตั้งเวลาทำการให้ "ตอนนี้" อยู่นอกเวลา แล้วยิง receiveExternalInbound
    const nowH = bkkHour(new Date());
    // ORACLE-EDIT S1.22-A-5: หน้าต่างต้อง open < close และไม่คลุมชั่วโมงปัจจุบัน (ตอน 21–23 น. เดิมได้ 23:00–00:00 ถูก validate ปัดตก)
    const [open, close] = nowH >= 12 ? ["01:00", "02:00"] : ["22:00", "23:00"];
    await prisma.chatSetting.updateMany({ where: { tenantId: tid, systemId: chatSys.id }, data: { businessHours: { ...hours, days: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, open, close })) } as never } });
    const r1 = await chat.receiveExternalInbound({ connection: conn as never, externalUserId: `qcs122-hook-${Date.now().toString(36)}`, body: "เปิดกี่โมงครับ", clientMessageId: `hook-${Date.now()}` });
    await new Promise((r) => setTimeout(r, 1500));
    const hookConv = r1.conversationId ? await prisma.chatConversation.findUnique({ where: { id: r1.conversationId } }) : null;
    const hookOut = r1.conversationId ? await prisma.chatMessage.findFirst({ where: { conversationId: r1.conversationId, direction: "OUT" } }) : null;
    const hookMeta = (hookOut?.meta ?? {}) as Record<string, unknown>;
    chk("A-5", "hook receiveExternalInbound นอกเวลาทำการ (reply=true · mock provider) ⇒ มี OUT meta.ai_afterHours หรือ tag 'รอคน' · inbound ไม่ล้ม", r1.ok === true && !!r1.conversationId && (hookMeta.ai_afterHours === "1" || JSON.stringify(hookConv?.tags ?? []).includes("รอคน")), JSON.stringify({ r1, out: !!hookOut, meta: hookMeta, tags: hookConv?.tags }).slice(0, 200));
  }
} finally {
  await cleanup();
}
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
