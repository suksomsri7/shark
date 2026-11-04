// QC — SECRETARY S1.6 · ห้องร่วม members.ts (add/remove/list · สิทธิ์ · seeHistory · ข้อความระบบ · X2 actor ของผู้เขียน) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.6.md · RESOLUTIONS R-K1 R-K2 · ต้องการ S1.4 rooms.ts
//
// กลุ่มข้อ:
//   A  addMember: สิทธิ์ (ผู้เปิด/OWNER ✓ · สมาชิก/MANAGER ✗ · มองไม่เห็น not_found) · not_member_of_tenant · self · already · limit 20 · closed · แถว + ข้อความระบบ · listMembers
//   H  seeHistory: false ⇒ เห็นเฉพาะข้อความหลัง addedAt · true ⇒ ทั้งหมด · ผู้เปิด/OWNER ทั้งหมด · ข้อความระบบนับเป็นหลัง addedAt
//   X  X2: sendMessage ของสมาชิกในห้อง ⇒ USER authorUserId=สมาชิก · เครื่องมือยื่นตามสิทธิ์ของสมาชิก (STAFF ไม่มีคีย์ pos ไม่เห็น sales_summary) · ผู้เปิดห้อง (OWNER) ยังเห็น
//   R  removeMember: ผู้เปิดเอาออก ✓ · สมาชิกเอาคนอื่นออก ✗ · ออกเอง ✓ · หลังออกมองไม่เห็นห้อง · not_a_member
//   D  fitness ×2
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.6.mts
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.6";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const MEM_FILE = join(ROOT, "src/lib/ai/secretary/members.ts");
if (!FORCED && !existsSync(MEM_FILE)) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/lib/ai/secretary/members.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
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
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
import type { AiChatMessage, AiProvider, AiReply, AiToolDef } from "@/lib/ai/provider";
class Scripted implements AiProvider { captured: { messages: AiChatMessage[]; tools?: AiToolDef[] }[] = []; constructor(private text = "รับทราบ") {} async chat(messages: AiChatMessage[], opts?: { tools?: AiToolDef[] }): Promise<AiReply> { this.captured.push({ messages, tools: opts?.tools }); return { text: this.text, tokensIn: 1, tokensOut: 1, model: "scripted" }; } }

const { prisma } = await import("@/lib/core/db");
const service = await import("@/lib/ai/service");
const rooms = (await import("@/lib/ai/secretary/rooms").catch(() => null)) as AnyMod | null;
const mem = existsSync(MEM_FILE) ? ((await import("@/lib/ai/secretary/members").catch((e) => { console.log("  ⚠️ import members.ts: " + errMsg(e)); return null; })) as AnyMod | null) : null;
const hasTables = "aiRoom" in prisma && "aiRoomMember" in prisma;
const U = { owner: "qcs16-owner", mgr: "qcs16-mgr", staff: "qcs16-staff", s2: "qcs16-s2", s3: "qcs16-s3", out: "qcs16-outsider" };
let tid = "";
const cleanup = async () => {
  if (tid) { for (const m of ["aiRoomMember", "aiRoomJob", "aiRoom", "aiProposal", "aiPlan", "aiMessage", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "appSystem", "membership"]) { try { await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }); } catch { /* */ } } try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); } }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s16-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs16-" } } }); } catch { /* */ }
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.6", slug: `qc-sec-s16-${Date.now().toString(36)}` } });
  tid = t.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `คุณ${k}` } });
  const perms = { "ai.chat.send": true, "kanban.card.read": true };
  const mk = (role: "OWNER" | "MANAGER" | "STAFF", userId: string, permissions: Record<string, unknown> = role === "STAFF" ? perms : {}) => prisma.membership.create({ data: { tenantId: tid, userId, role, unitAccess: ["*"], permissions: permissions as never, acceptedAt: new Date() } });
  await mk("OWNER", U.owner); await mk("MANAGER", U.mgr); await mk("STAFF", U.staff); await mk("STAFF", U.s2); await mk("STAFF", U.s3);
  const actor = (userId: string, role: "OWNER" | "MANAGER" | "STAFF", permissions: Record<string, unknown> = role === "STAFF" ? perms : {}) => ({ kind: "member" as const, tenantId: tid, userId, membership: { role, unitAccess: ["*"], permissions } });
  const OWNER = actor(U.owner, "OWNER"), MGR = actor(U.mgr, "MANAGER"), STAFF = actor(U.staff, "STAFF"), S2 = actor(U.s2, "STAFF"), S3 = actor(U.s3, "STAFF");
  const ctxOf = (a: ReturnType<typeof actor>) => ({ tenantId: tid, actor: a });
  if (!mem || !rooms || !hasTables) { for (const id of ["A-1", "A-2", "A-3", "A-4", "A-5", "H-1", "H-2", "X-1", "X-2", "R-1", "R-2", "R-3"]) skip(id, "members", !mem ? "ไม่มี members.ts" : !rooms ? "ไม่มี rooms.ts" : "ไม่มีตาราง"); }
  else {
    console.log("── A: addMember ──");
    const r = await rooms.startRoom(ctxOf(STAFF), { instruction: "ข้อความแรกก่อนเพิ่มสมาชิก" });
    const roomId = r.roomId as string, convId = r.conversationId as string;
    const p0 = new Scripted("คำตอบแรก");
    await service.sendMessage(ctxOf(STAFF), { conversationId: convId, text: "ข้อความที่สองก่อนเพิ่ม" }, { provider: p0 });
    const beforeCount = await prisma.aiMessage.count({ where: { conversationId: convId } });
    const aM = await mem.addMember(ctxOf(MGR), roomId, { userId: U.s2 });
    const aO = await mem.addMember(ctxOf(S2), roomId, { userId: U.s3 });
    chk("A-1", "MANAGER (มองไม่เห็นห้อง) ⇒ not_found · คนนอกห้อง ⇒ not_found · ไม่มีแถว", aM.ok === false && aM.error === "not_found" && aO.ok === false && aO.error === "not_found" && (await prisma.aiRoomMember.count({ where: { roomId } })) === 0, JSON.stringify({ aM, aO }).slice(0, 160));
    const aSelf = await mem.addMember(ctxOf(STAFF), roomId, { userId: U.staff });
    const aOut = await mem.addMember(ctxOf(STAFF), roomId, { userId: U.out });
    const aNo = await mem.addMember(ctxOf(STAFF), roomId, { userId: "qcs16-nobody" });
    chk("A-2", "ผู้เปิดเพิ่มตัวเอง ⇒ self · คนที่ไม่ใช่สมาชิกกิจการ ⇒ not_member_of_tenant · user ไม่มี ⇒ not_member_of_tenant · ข้อความไทย", aSelf.ok === false && aSelf.error === "self" && aOut.ok === false && aOut.error === "not_member_of_tenant" && aNo.ok === false && aNo.error === "not_member_of_tenant" && thai(aOut.message), JSON.stringify({ aSelf, aOut, aNo }).slice(0, 200));
    const a1 = await mem.addMember(ctxOf(STAFF), roomId, { userId: U.s2 });
    const row1 = await prisma.aiRoomMember.findUnique({ where: { roomId_userId: { roomId, userId: U.s2 } } });
    const sysMsg = await prisma.aiMessage.findFirst({ where: { conversationId: convId }, orderBy: { createdAt: "desc" } });
    chk("A-3", "ผู้เปิด (STAFF) เพิ่ม s2 ⇒ ok · แถว (tenantId · addedById=staff · seeHistory false) · ข้อความระบบ 🔔 มีชื่อทั้งสอง authorUserId null · member.name มาจาก User", a1.ok === true && a1.member?.userId === U.s2 && a1.member?.name === "คุณs2" && a1.member?.seeHistory === false && row1?.tenantId === tid && row1?.addedById === U.staff && row1?.seeHistory === false && !!sysMsg && sysMsg.content.includes("🔔") && sysMsg.content.includes("คุณstaff") && sysMsg.content.includes("คุณs2") && (sysMsg as AnyMod).authorUserId === null && (await prisma.aiMessage.count({ where: { conversationId: convId } })) === beforeCount + 1, JSON.stringify({ a1, row1, sys: sysMsg?.content }).slice(0, 240));
    const aDup = await mem.addMember(ctxOf(OWNER), roomId, { userId: U.s2 });
    const a2 = await mem.addMember(ctxOf(OWNER), roomId, { userId: U.s3, seeHistory: true });
    const aMem = await mem.addMember(ctxOf(S2), roomId, { userId: U.mgr });
    const list = await mem.listMembers(ctxOf(S2), roomId);
    const listM = await mem.listMembers(ctxOf(MGR), roomId);
    chk("A-4", "ซ้ำ ⇒ already · OWNER เพิ่ม s3 (seeHistory true) ⇒ ok · สมาชิกธรรมดา (s2) เพิ่มคนอื่น ⇒ forbidden · listMembers: s2 เห็น 2 คน เรียง addedAt · MANAGER ⇒ null", aDup.ok === false && aDup.error === "already" && a2.ok === true && a2.member?.seeHistory === true && aMem.ok === false && aMem.error === "forbidden" && Array.isArray(list) && list.length === 2 && list[0].userId === U.s2 && list[1].userId === U.s3 && list[1].role === "STAFF" && listM === null, JSON.stringify({ aDup, a2: a2.ok, aMem, n: list?.length, listM }).slice(0, 200));
    // limit + closed
    const rL = await rooms.startRoom(ctxOf(OWNER), { instruction: "ห้องเต็ม" });
    const extraUsers: string[] = [];
    for (let i = 0; i < 20; i++) { const id = `qcs16-x${String(i).padStart(2, "0")}`; extraUsers.push(id); await prisma.user.create({ data: { id, email: `${id}@example.com`, name: id } }); await mk("STAFF", id); }
    let okN = 0; for (const id of extraUsers) { const a = await mem.addMember(ctxOf(OWNER), rL.roomId, { userId: id }); if (a.ok) okN++; }
    const aLimit = await mem.addMember(ctxOf(OWNER), rL.roomId, { userId: U.staff });
    await prisma.aiRoom.update({ where: { id: roomId }, data: { closedAt: new Date() } });
    const aClosed = await mem.addMember(ctxOf(STAFF), roomId, { userId: U.mgr });
    await prisma.aiRoom.update({ where: { id: roomId }, data: { closedAt: null } });
    chk("A-5", "เพิ่มได้ 20 คน · คนที่ 21 ⇒ limit · ห้องปิด ⇒ closed", okN === 20 && aLimit.ok === false && aLimit.error === "limit" && aClosed.ok === false && aClosed.error === "closed", `ok=${okN} ${JSON.stringify({ aLimit, aClosed }).slice(0, 120)}`);

    console.log("── H: seeHistory ──");
    const p1 = new Scripted("คำตอบหลังเพิ่ม");
    await service.sendMessage(ctxOf(STAFF), { conversationId: convId, text: "ข้อความหลังเพิ่มสมาชิก" }, { provider: p1 });
    const all = await service.listMessages(ctxOf(STAFF), convId);
    const m2 = await service.listMessages(ctxOf(S2), convId);
    const m3 = await service.listMessages(ctxOf(S3), convId);
    const mO = await service.listMessages(ctxOf(OWNER), convId);
    const firstS2 = m2[0];
    chk("H-1", "listMessages: ผู้เปิดเห็นทั้งหมด (≥7) · s2 (seeHistory=false) ไม่เห็นข้อความก่อนเพิ่ม — แถวแรก = ข้อความระบบ 🔔 ของตัวเอง · s3 (seeHistory=true) เห็นทั้งหมด · OWNER ทั้งหมด", all.length >= 7 && m2.length < all.length && !!firstS2 && firstS2.content.includes("🔔") && firstS2.content.includes("คุณs2") && !m2.some((m) => m.content === "ข้อความแรกก่อนเพิ่มสมาชิก" || m.content === "ข้อความที่สองก่อนเพิ่ม") && m2.some((m) => m.content === "ข้อความหลังเพิ่มสมาชิก") && m3.length === all.length && mO.length === all.length, `all=${all.length} s2=${m2.length} s3=${m3.length} o=${mO.length} first=${firstS2?.content?.slice(0, 40)}`);
    const pH = new Scripted("ตอบ s2");
    await service.sendMessage(ctxOf(S2), { conversationId: convId, text: "s2 ถามต่อ" }, { provider: pH });
    const hist = pH.captured[0]?.messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => m.content) ?? [];
    chk("H-2", "ประวัติที่ป้อนโมเดลสำหรับ s2 ไม่มีข้อความก่อน addedAt (seeHistory=false)", !hist.includes("ข้อความแรกก่อนเพิ่มสมาชิก") && !hist.includes("ข้อความที่สองก่อนเพิ่ม") && hist.includes("ข้อความหลังเพิ่มสมาชิก"), hist.join(" | ").slice(0, 200), "MAJOR");

    console.log("── X: X2 actor ของผู้เขียน ──");
    const lastUser = await prisma.aiMessage.findFirst({ where: { conversationId: convId, role: "USER" }, orderBy: { createdAt: "desc" } });
    const offered = (pH.captured[0]?.tools ?? []).map((t) => t.name);
    const pO = new Scripted("ตอบ owner");
    await service.sendMessage(ctxOf(OWNER), { conversationId: convId, text: "owner ถาม" }, { provider: pO });
    const offeredO = (pO.captured[0]?.tools ?? []).map((t) => t.name);
    chk("X-1", "USER ของ s2 มี authorUserId=s2 · เครื่องมือที่ยื่นให้ s2 (STAFF ไม่มีคีย์ pos) ไม่มี sales_summary/load_skill ของ sales · OWNER ในห้องเดียวกันได้ชุดเต็มกว่า", (lastUser as AnyMod)?.authorUserId === U.s2 && !offered.includes("sales_summary") && offeredO.length >= offered.length, `author=${(lastUser as AnyMod)?.authorUserId} s2=${offered.length} owner=${offeredO.length}`);
    const sysPrompt = pH.captured[0]?.messages.find((m) => m.role === "system")?.content ?? "";
    chk("X-2", "system prompt ของ s2 ไม่มีตัวตนเลขาของ owner (ใช้ของผู้เขียนเอง — ไม่มีแถว = ค่าเดิม)", sysPrompt.startsWith("คุณคือผู้ช่วย AI ประจำกิจการ") || sysPrompt.startsWith('คุณคือ "Shark"'), sysPrompt.slice(0, 60), "MAJOR");

    console.log("── R: removeMember ──");
    const rm1 = await mem.removeMember(ctxOf(S2), roomId, U.s3);
    const rm2 = await mem.removeMember(ctxOf(STAFF), roomId, U.s3);
    const sysRm = await prisma.aiMessage.findFirst({ where: { conversationId: convId }, orderBy: { createdAt: "desc" } });
    chk("R-1", "สมาชิก (s2) เอา s3 ออก ⇒ forbidden · ผู้เปิดเอา s3 ออก ⇒ ok · แถวหาย · ข้อความระบบ 🔔 มีชื่อ s3", rm1.ok === false && rm1.error === "forbidden" && rm2.ok === true && (await prisma.aiRoomMember.count({ where: { roomId, userId: U.s3 } })) === 0 && !!sysRm && sysRm.content.includes("🔔") && sysRm.content.includes("คุณs3"), JSON.stringify({ rm1, rm2, sys: sysRm?.content }).slice(0, 160));
    const rm3 = await mem.removeMember(ctxOf(S2), roomId, U.s2);
    const vis = await rooms.getRoom(ctxOf(S2), roomId);
    const rm4 = await mem.removeMember(ctxOf(OWNER), roomId, U.s2);
    const rm5 = await mem.removeMember(ctxOf(MGR), roomId, U.staff);
    chk("R-2", "s2 ออกเอง ⇒ ok · หลังออกมองไม่เห็นห้อง (getRoom null) · เอาออกซ้ำ ⇒ not_a_member · MANAGER (มองไม่เห็น) ⇒ not_found", rm3.ok === true && vis === null && rm4.ok === false && rm4.error === "not_a_member" && rm5.ok === false && rm5.error === "not_found", JSON.stringify({ rm3, vis, rm4, rm5 }).slice(0, 160));
    const g = await rooms.getRoom(ctxOf(OWNER), roomId);
    chk("R-3", "getRoom คืน members (ว่างหลังเอาออกหมด) · ห้องยังเปิด", Array.isArray(g?.members) && g.members.length === 0 && g?.closedAt === null, JSON.stringify(g).slice(0, 160), "MAJOR");
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
