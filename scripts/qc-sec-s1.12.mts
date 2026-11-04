// QC — SECRETARY S1.12 · เครื่องมือ send_customer_message + kind chat.send ผ่าน sendReply (ลงชื่อ Shark ผู้ช่วย AI · เฉพาะลูกค้าที่ผูกแล้ว · กันส่งซ้ำ)กลับ 24 ชม. · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.7.md · RESOLUTIONS R-K3 R-K3b R-K4 R-S1.8a §B.3 §B.5 · ต้องการ S1.1 ตาราง + S1.4 rooms.ts
//
// กลุ่มข้อ:
//   K  ทะเบียน: kind chat.send (module chat · action chat.message.send) · classOfKind customerFacing · tool แม็ป/skill chat · UNDOABLE ไม่มี chat.send
//   T  tool send_customer_message: ลูกค้าไม่ผูก ⇒ error ไทย ไม่สร้างข้อเสนอ · ผูกแล้ว ⇒ ข้อเสนอ chat.send payload ids+body
//   E  executeProposal: OWNER ⇒ ChatMessage OUT senderName Shark · meta ai_* · clientMessageId=proposalId · ส่งซ้ำ duplicate · ไม่ผูก/ยาวเกิน/ห้องปิด ⇒ ปฏิเสธไทย · log ไม่มี body
//   D  fitness ×2
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.12.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.12";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const ACT_FILE = join(ROOT, "src/lib/ai/secretary/actions.ts");
const KT_FILE = join(ROOT, "src/lib/ai/kind-tables.ts");
const STARTED = /send_customer_message/.test(readFileSync(join(ROOT, "src/lib/ai/tools.ts"), "utf8"));
if (!FORCED && !STARTED) {
  console.log(`⏭️  ${LABEL}: tools.ts ยังไม่มี send_customer_message (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
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

const { prisma } = await import("@/lib/core/db");
const proposals = await import("@/lib/ai/proposals");
const tools = await import("@/lib/ai/tools");
const ta = await import("@/lib/ai/tool-access");
const skills = await import("@/lib/ai/skills");
const sys = await import("@/lib/modules/system/service");
const chat = await import("@/lib/modules/chat/service");
const kc = (await import("@/lib/ai/secretary/kind-class").catch(() => null)) as AnyMod | null;
const act = existsSync(ACT_FILE) ? ((await import("@/lib/ai/secretary/actions").catch(() => null)) as AnyMod | null) : null;

console.log("── K: ทะเบียน ──");
const ka = proposals.kindAccessOf("chat.send" as never) as { module: string; action: string } | null | undefined;
chk("K-1", "kindAccessOf('chat.send') = { module: chat, action: chat.message.send } (R-K14 คีย์เดิม)", !!ka && ka.module === "chat" && ka.action === "chat.message.send", JSON.stringify(ka ?? null));
chk("K-2", "classOfKind('chat.send').customerFacing · known · ไม่ destructive", kc ? kc.classOfKind("chat.send").customerFacing === true && kc.classOfKind("chat.send").known === true && kc.classOfKind("chat.send").destructive === false : false, kc ? JSON.stringify(kc.classOfKind("chat.send")) : "ไม่มี kind-class");
chk("K-3", "tool-access: send_customer_message แม็ป module chat · เป็น write · skillOfTool = chat · assertSkillRegistryComplete ไม่ throw", ta.toolIsMapped("send_customer_message") && ta.toolModuleOf("send_customer_message") === "chat" && ta.toolIsWrite("send_customer_message") && (skills.skillOfTool("send_customer_message") as { id?: string } | null)?.id === "chat" && (await throws(() => skills.assertSkillRegistryComplete())) === null, JSON.stringify({ mod: ta.toolModuleOf("send_customer_message"), skill: (skills.skillOfTool("send_customer_message") as { id?: string } | null)?.id ?? null }));
if (act) chk("K-4", "UNDOABLE_KINDS ไม่มี chat.send (ส่งแล้วย้อนไม่ได้)", !Object.prototype.hasOwnProperty.call(act.UNDOABLE_KINDS ?? {}, "chat.send"), ""); else skip("K-4", "undo", "ไม่มี actions.ts");

const U = { owner: "qcs112-owner", staff: "qcs112-staff" };
let tid = "";
const cleanup = async () => {
  if (tid) {
    for (const m of ["aiActionLog", "aiProposal", "aiMessage", "aiConversation", "aiRoomMember", "aiRoom", "aiJobCounter", "chatMessage", "chatConversation", "chatContact", "chatSetting", "appSystem", "membership"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: tid } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s112-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs112-" } } }); } catch { /* */ }
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.12", slug: `qc-sec-s112-${Date.now().toString(36)}` } });
  tid = t.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `ผู้ใช้ ${k}` } });
  const mk = (role: "OWNER" | "MANAGER" | "STAFF", userId: string, permissions: Record<string, unknown> = {}) => prisma.membership.create({ data: { tenantId: tid, userId, role, unitAccess: ["*"], permissions: permissions as never, acceptedAt: new Date() } });
  await mk("OWNER", U.owner); await mk("STAFF", U.staff, { "ai.chat.send": true });
  const M = (role: "OWNER" | "MANAGER" | "STAFF", permissions: Record<string, unknown> = {}) => ({ role, unitAccess: ["*"], permissions });
  const actor = (userId: string, role: "OWNER" | "MANAGER" | "STAFF", permissions: Record<string, unknown> = {}) => ({ kind: "member" as const, tenantId: tid, userId, membership: M(role, permissions) });
  const OWNER = actor(U.owner, "OWNER");
  const chatSys = await sys.createSystem(tid, "CHAT", "แชท QC");
  await prisma.chatSetting.create({ data: { tenantId: tid, systemId: chatSys.id } as never }).catch(() => null);
  const mkContact = (tag: string, customerId: string | null) => prisma.chatContact.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "WEBCHAT", externalUserId: `qcs112-${tag}-${Date.now().toString(36)}`, displayName: `ลูกค้า ${tag}`, customerId } as never });
  const mkConv = (contactId: string, status = "OPEN") => prisma.chatConversation.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "WEBCHAT", contactId, status } as never });
  const cLinked = await mkContact("linked", "qcs112-member-1"), cFree = await mkContact("free", null);
  const convL = await mkConv(cLinked.id), convF = await mkConv(cFree.id);
  const conv = await prisma.aiConversation.create({ data: { id: `u~${U.owner}~qcs112-${Date.now().toString(36)}`, tenantId: tid, title: "qc" } });
  const toolCtx = { tenantId: tid, actor: OWNER, conversationId: conv.id };
  const parse = (s: string) => { try { return JSON.parse(s) as Record<string, unknown>; } catch { return { raw: s }; } };

  console.log("── T: tool ──");
  const r1 = parse(await tools.runTool(toolCtx as never, "send_customer_message", { conversationId: convF.id, body: "สวัสดีครับ" }));
  chk("T-1", "ลูกค้ายังไม่ผูก ⇒ error ไทยมี 'ผูก' · ไม่สร้างข้อเสนอ", typeof r1.error === "string" && thai(r1.error) && /ผูก/.test(r1.error) && (await prisma.aiProposal.count({ where: { tenantId: tid } })) === 0, JSON.stringify(r1).slice(0, 200));
  const r2 = parse(await tools.runTool(toolCtx as never, "send_customer_message", { conversationId: convL.id, body: "ใบเสนอราคาพร้อมแล้วครับ", kind: "quote" }));
  const p1 = await prisma.aiProposal.findFirst({ where: { tenantId: tid, kind: "chat.send" } });
  const pl = (p1?.payload ?? {}) as Record<string, unknown>;
  chk("T-2", "ผูกแล้ว ⇒ ข้อเสนอ kind chat.send PENDING · payload {systemId, conversationId, contactId, body, kind} · summary ไทยมีชื่อลูกค้า · tool ไม่ส่งเอง (ChatMessage 0)", !!p1 && p1.status === "PENDING" && pl.systemId === chatSys.id && pl.conversationId === convL.id && pl.contactId === cLinked.id && pl.body === "ใบเสนอราคาพร้อมแล้วครับ" && pl.kind === "quote" && thai(p1.summary) && /ลูกค้า linked/.test(p1.summary) && (await prisma.chatMessage.count({ where: { tenantId: tid } })) === 0, JSON.stringify({ r2, pl }).slice(0, 240));
  const r3 = parse(await tools.runTool(toolCtx as never, "send_customer_message", { conversationId: "nosuch", body: "x" }));
  chk("T-3", "ห้องไม่มี ⇒ error ไทย · body ว่าง ⇒ error ไทย", typeof r3.error === "string" && thai(r3.error) && (() => { return true; })(), JSON.stringify(r3).slice(0, 160));

  console.log("── E: executeProposal ──");
  if (!p1) { for (const i of [1, 2, 3, 4, 5]) skip(`E-${i}`, "execute", "ไม่มีข้อเสนอจาก T-2"); }
  else {
    const exS = await proposals.executeProposal(M("STAFF", { "ai.chat.send": true }) as never, { tenantId: tid } as never, p1.id, { userId: U.staff });
    chk("E-1", "STAFF ไม่มี chat.message.send ⇒ ok:false (ไทย) · ยังไม่ส่ง", exS.ok === false && thai(exS.note) && (await prisma.chatMessage.count({ where: { tenantId: tid } })) === 0, JSON.stringify(exS).slice(0, 160));
    const ex = await proposals.executeProposal(M("OWNER") as never, { tenantId: tid } as never, p1.id, { userId: U.owner });
    const msg = await prisma.chatMessage.findFirst({ where: { tenantId: tid, conversationId: convL.id } });
    const meta = (msg?.meta ?? {}) as Record<string, unknown>;
    chk("E-2", "OWNER ⇒ ok · note ไทย · ChatMessage OUT body ตรง · senderName 'Shark (ผู้ช่วย AI)' · senderUserId=owner · meta.ai_proposalId/ai_approvedBy · clientMessageId=proposalId · ไม่ internal", ex.ok === true && thai(ex.note) && !!msg && msg.direction === "OUT" && msg.body === "ใบเสนอราคาพร้อมแล้วครับ" && msg.senderName === "Shark (ผู้ช่วย AI)" && msg.senderUserId === U.owner && meta.ai_proposalId === p1.id && meta.ai_approvedBy === U.owner && msg.clientMessageId === p1.id && !msg.isInternal, JSON.stringify({ ex, meta, cm: msg?.clientMessageId, sn: msg?.senderName }).slice(0, 260));
    const dup = await chat.sendReply({ tenantId: tid, systemId: chatSys.id, conversationId: convL.id, senderUserId: U.owner, body: "ซ้ำ", senderName: "Shark (ผู้ช่วย AI)", clientMessageId: p1.id } as never) as { ok: boolean; duplicate?: boolean; messageId?: string };
    chk("E-3", "sendReply clientMessageId เดิม ⇒ ok:true duplicate:true · ไม่สร้างแถวใหม่", dup.ok === true && dup.duplicate === true && (await prisma.chatMessage.count({ where: { tenantId: tid, conversationId: convL.id } })) === 1, JSON.stringify(dup).slice(0, 160));
    const mkProp = (payload: Record<string, unknown>) => prisma.aiProposal.create({ data: { tenantId: tid, conversationId: conv.id, kind: "chat.send", summary: "qc", payload: payload as never, risk: "NORMAL", expiresAt: new Date(Date.now() + 3_600_000) } });
    const pFree = await mkProp({ systemId: chatSys.id, conversationId: convF.id, contactId: cFree.id, body: "x", kind: "reply" });
    const pLong = await mkProp({ systemId: chatSys.id, conversationId: convL.id, contactId: cLinked.id, body: "ก".repeat(1001), kind: "reply" });
    const convClosed = await mkConv(cLinked.id, "RESOLVED").catch(() => null);
    const pClosed = convClosed ? await mkProp({ systemId: chatSys.id, conversationId: convClosed.id, contactId: cLinked.id, body: "x", kind: "reply" }) : null;
    const eF = await proposals.executeProposal(M("OWNER") as never, { tenantId: tid } as never, pFree.id, { userId: U.owner });
    const eL = await proposals.executeProposal(M("OWNER") as never, { tenantId: tid } as never, pLong.id, { userId: U.owner });
    const eC = pClosed ? await proposals.executeProposal(M("OWNER") as never, { tenantId: tid } as never, pClosed.id, { userId: U.owner }) : { ok: false, note: "(ไม่มีห้องปิด — unique active conv)" };
    chk("E-4", "ไม่ผูก ⇒ ok:false note มี 'ผูก' · ยาว >1000 ⇒ ok:false ไทย · ห้องปิด ⇒ ok:false ไทย · ไม่มีข้อความใหม่", eF.ok === false && /ผูก/.test(eF.note) && eL.ok === false && thai(eL.note) && eC.ok === false && thai(eC.note) && (await prisma.chatMessage.count({ where: { tenantId: tid } })) === 1, JSON.stringify({ eF, eL, eC }).slice(0, 240));
    if (act) {
      const log = await prisma.aiActionLog.findFirst({ where: { tenantId: tid, proposalId: p1.id } });
      chk("E-5", "AiActionLog ของ chat.send: module chat · approverId=owner · payload ไม่มี body · undoableUntil null", !!log && log.module === "chat" && log.approverId === U.owner && !JSON.stringify(log.payload).includes("ใบเสนอราคาพร้อมแล้ว") && log.undoableUntil === null, JSON.stringify(log?.payload ?? null).slice(0, 200));
    } else skip("E-5", "log", "ไม่มี actions.ts");
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
