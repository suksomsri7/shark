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
  if (!mem || !rooms || !hasTables) { for (const id of ["A-1", "A-2", "A-3", "A-4", "A-5", "H-1", "H-2", "H-3", "X-1", "X-2", "R-1", "R-2", "R-3", "R-4"]) skip(id, "members", !mem ? "ไม่มี members.ts" : !rooms ? "ไม่มี rooms.ts" : "ไม่มีตาราง"); }
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
    // ORACLE-EDIT (B27-FAB 17 พ.ย. · เจ้าของอนุมัติแบบ fab6): ปิดการชวนคนเข้าห้องงานเลขา (members.ts ADD_MEMBER_DISABLED) — งานของใครของมัน
    //   ทุกคนที่ผ่านด่านมองเห็น+จัดการ ⇒ forbidden + ข้อความไทย · ไม่มีแถว/ข้อความระบบเกิด · OWNER มองไม่เห็นห้องของคนอื่นแล้ว ⇒ not_found
    //   แถวสมาชิกเดิม (ข้อมูลก่อนปิด) ยังใช้ได้ ⇒ ส่วน H/X/R สร้างแถวตรงด้วย prisma (addRow) แทน addMember
    const aSelf = await mem.addMember(ctxOf(STAFF), roomId, { userId: U.staff });
    const aOut = await mem.addMember(ctxOf(STAFF), roomId, { userId: U.out });
    const aNo = await mem.addMember(ctxOf(STAFF), roomId, { userId: "qcs16-nobody" });
    chk("A-2", "ปิดการเพิ่ม: ผู้เปิดเพิ่มตัวเอง/คนนอกร้าน/user ไม่มี ⇒ forbidden ทั้งหมด · ข้อความไทย · ไม่มีแถว", [aSelf, aOut, aNo].every((x) => x.ok === false && x.error === "forbidden" && thai(x.message)) && (await prisma.aiRoomMember.count({ where: { roomId } })) === 0, JSON.stringify({ aSelf, aOut, aNo }).slice(0, 200));
    const a1 = await mem.addMember(ctxOf(STAFF), roomId, { userId: U.s2, seeHistory: true });
    chk("A-3", "ผู้เปิด (STAFF) เพิ่ม s2 ⇒ forbidden · ไม่มีแถว · ไม่มีข้อความระบบเพิ่ม", a1.ok === false && a1.error === "forbidden" && (await prisma.aiRoomMember.count({ where: { roomId } })) === 0 && (await prisma.aiMessage.count({ where: { conversationId: convId } })) === beforeCount, JSON.stringify(a1).slice(0, 200));
    const aOwn = await mem.addMember(ctxOf(OWNER), roomId, { userId: U.s3, seeHistory: true });
    const aMem = await mem.addMember(ctxOf(S2), roomId, { userId: U.mgr });
    const listM = await mem.listMembers(ctxOf(MGR), roomId);
    const listO = await mem.listMembers(ctxOf(OWNER), roomId);
    chk("A-4", "OWNER (มองไม่เห็นห้องของ staff แล้ว) ⇒ not_found · คนนอกห้อง ⇒ not_found · listMembers: MANAGER/OWNER ⇒ null", aOwn.ok === false && aOwn.error === "not_found" && aMem.ok === false && aMem.error === "not_found" && listM === null && listO === null, JSON.stringify({ aOwn, aMem, listM, listO }).slice(0, 200));
    await prisma.aiRoom.update({ where: { id: roomId }, data: { closedAt: new Date() } });
    const aClosed = await mem.addMember(ctxOf(STAFF), roomId, { userId: U.mgr });
    await prisma.aiRoom.update({ where: { id: roomId }, data: { closedAt: null } });
    chk("A-5", "ห้องปิด ⇒ ยังเป็น forbidden (ปิดการเพิ่มก่อนตรวจอื่น) · ADD_MEMBER_DISABLED = true", aClosed.ok === false && aClosed.error === "forbidden" && mem.ADD_MEMBER_DISABLED === true, JSON.stringify(aClosed).slice(0, 160));
    // แถวสมาชิกเดิม: s2 (seeHistory=false) เข้าห้องตอนนี้ · s3 (seeHistory=true)
    const addRow = async (userId: string, seeHistory: boolean) => prisma.aiRoomMember.create({ data: { tenantId: tid, roomId, userId, addedById: U.staff, seeHistory } });
    await new Promise((r) => setTimeout(r, 20));
    await addRow(U.s2, false);
    await addRow(U.s3, true);
    await new Promise((r) => setTimeout(r, 20));

    console.log("── H: seeHistory ──");
    const p1 = new Scripted("คำตอบหลังเพิ่ม");
    await service.sendMessage(ctxOf(STAFF), { conversationId: convId, text: "ข้อความหลังเพิ่มสมาชิก" }, { provider: p1 });
    const all = await service.listMessages(ctxOf(STAFF), convId);
    const m2 = await service.listMessages(ctxOf(S2), convId);
    const m3 = await service.listMessages(ctxOf(S3), convId);
    const mO = await service.listMessages(ctxOf(OWNER), convId);
    const firstS2 = m2[0];
    // ORACLE-EDIT (B27-FAB): แถวสมาชิกสร้างตรง (ไม่มีข้อความระบบ 🔔) · OWNER มองไม่เห็นห้องของ staff ⇒ ว่าง
    chk("H-1", "listMessages: ผู้เปิดเห็นทั้งหมด (≥5) · s2 (seeHistory=false) ไม่เห็นข้อความก่อนเข้าห้อง แต่เห็นหลังเข้า · s3 (seeHistory=true) เห็นทั้งหมด · OWNER ว่าง", all.length >= 5 && m2.length < all.length && !m2.some((m) => m.content === "ข้อความแรกก่อนเพิ่มสมาชิก" || m.content === "ข้อความที่สองก่อนเพิ่ม") && m2.some((m) => m.content === "ข้อความหลังเพิ่มสมาชิก") && m3.length === all.length && mO.length === 0, `all=${all.length} s2=${m2.length} s3=${m3.length} o=${mO.length} first=${firstS2?.content?.slice(0, 40)}`);
    const pH = new Scripted("ตอบ s2");
    await service.sendMessage(ctxOf(S2), { conversationId: convId, text: "s2 ถามต่อ" }, { provider: pH });
    const hist = pH.captured[0]?.messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => m.content) ?? [];
    chk("H-2", "ประวัติที่ป้อนโมเดลสำหรับ s2 ไม่มีข้อความก่อน addedAt (seeHistory=false)", !hist.includes("ข้อความแรกก่อนเพิ่มสมาชิก") && !hist.includes("ข้อความที่สองก่อนเพิ่ม") && hist.includes("ข้อความหลังเพิ่มสมาชิก"), hist.join(" | ").slice(0, 200), "MAJOR");

    // ORACLE-EDIT รอบ 2 (รีวิว E1/F2): ข้อเสนอ/แผน PENDING ที่เกิดก่อน addedAt ต้องไม่ถึงสมาชิก seeHistory=false
    const rowS2 = await prisma.aiRoomMember.findUnique({ where: { roomId_userId: { roomId, userId: U.s2 } } });
    const before = new Date(rowS2!.addedAt.getTime() - 60_000), after = new Date(rowS2!.addedAt.getTime() + 60_000);
    const pOld = await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: convId, kind: "kanban_create_card", summary: "ข้อเสนอก่อนเข้าห้อง", payload: { title: "เก่า" } as never, expiresAt: new Date(Date.now() + 3_600_000), createdAt: before } });
    const pNew = await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: convId, kind: "kanban_create_card", summary: "ข้อเสนอหลังเข้าห้อง", payload: { title: "ใหม่" } as never, expiresAt: new Date(Date.now() + 3_600_000), createdAt: after } });
    const plOld = await prisma.aiPlan.create({ data: { tenantId: tid, conversationId: convId, title: "แผนก่อนเข้าห้อง", stepsJson: [] as never, expiresAt: new Date(Date.now() + 3_600_000), createdAt: before } });
    const proposalsMod = await import("@/lib/ai/proposals"); const plansMod = await import("@/lib/ai/plans");
    const lp2 = await proposalsMod.listPendingProposals(ctxOf(S2), convId), lp3 = await proposalsMod.listPendingProposals(ctxOf(S3), convId), lpO = await proposalsMod.listPendingProposals(ctxOf(OWNER), convId);
    const pl2 = await plansMod.listPendingPlans(ctxOf(S2), convId), plO = await plansMod.listPendingPlans(ctxOf(OWNER), convId);
    const rj = await proposalsMod.rejectProposal(ctxOf(S2), pOld.id);
    // ORACLE-EDIT (B27-FAB): OWNER อ่านห้องของ staff ไม่ได้แล้ว ⇒ 0/0 (อนุมัติผ่านกล่องอนุมัติ — qc-sec-s1.7)
    chk("H-3", "seeHistory=false (s2): เห็นเฉพาะข้อเสนอหลังเข้าห้อง (1) · ไม่เห็นแผนก่อนเข้า (0) · ปฏิเสธข้อเสนอเก่า ⇒ false · s3 (seeHistory=true) เห็น 2 · OWNER 0/0", lp2.length === 1 && lp2[0].id === pNew.id && pl2.length === 0 && rj === false && lp3.length === 2 && lpO.length === 0 && plO.length === 0, `s2=${lp2.length} pl2=${pl2.length} rj=${rj} s3=${lp3.length} o=${lpO.length}/${plO.length}`);
    await prisma.aiProposal.deleteMany({ where: { id: { in: [pOld.id, pNew.id] } } }); await prisma.aiPlan.delete({ where: { id: plOld.id } });

    console.log("── X: X2 actor ของผู้เขียน ──");
    const lastUser = await prisma.aiMessage.findFirst({ where: { conversationId: convId, role: "USER" }, orderBy: { createdAt: "desc" } });
    const offered = (pH.captured[0]?.tools ?? []).map((t) => t.name);
    const pO = new Scripted("ตอบ owner");
    await service.sendMessage(ctxOf(OWNER), { conversationId: convId, text: "owner ถาม" }, { provider: pO });
    const offeredO = (pO.captured[0]?.tools ?? []).map((t) => t.name);
    // ORACLE-EDIT (B27-FAB 17 พ.ย.): OWNER มองไม่เห็นห้องของ staff แล้ว ⇒ "owner ถาม" ไปลงห้องใหม่ของ OWNER เอง (ชุดเครื่องมือของห้องใหม่เทียบจำนวนกับห้องร่วมไม่ได้) — ตรวจแค่ว่าข้อความไม่ลงห้องนี้และ OWNER ได้เครื่องมือ
    const ownerInRoom = await prisma.aiMessage.count({ where: { conversationId: convId, content: "owner ถาม" } });
    chk("X-1", "USER ของ s2 มี authorUserId=s2 · เครื่องมือที่ยื่นให้ s2 (STAFF ไม่มีคีย์ pos) ไม่มี sales_summary/load_skill ของ sales · OWNER ส่งเข้าห้องนี้ไม่ได้ (ไปห้องตัวเอง) และยังได้เครื่องมือ", (lastUser as AnyMod)?.authorUserId === U.s2 && !offered.includes("sales_summary") && ownerInRoom === 0 && offeredO.length > 0, `author=${(lastUser as AnyMod)?.authorUserId} s2=${offered.length} owner=${offeredO.length}`);
    const sysPrompt = pH.captured[0]?.messages.find((m) => m.role === "system")?.content ?? "";
    chk("X-2", "system prompt ของ s2 ไม่มีตัวตนเลขาของ owner (ใช้ของผู้เขียนเอง — ไม่มีแถว = ค่าเดิม)", sysPrompt.startsWith("คุณคือผู้ช่วย AI ประจำกิจการ") || sysPrompt.startsWith('คุณคือ "Shark"'), sysPrompt.slice(0, 60), "MAJOR");

    console.log("── R: removeMember ──");
    const rm1 = await mem.removeMember(ctxOf(S2), roomId, U.s3);
    const rm2 = await mem.removeMember(ctxOf(STAFF), roomId, U.s3);
    const sysRm = await prisma.aiMessage.findFirst({ where: { conversationId: convId }, orderBy: { createdAt: "desc" } });
    chk("R-1", "สมาชิก (s2) เอา s3 ออก ⇒ forbidden · ผู้เปิดเอา s3 ออก ⇒ ok · แถวหาย · ข้อความระบบ 🔔 มีชื่อ s3", rm1.ok === false && rm1.error === "forbidden" && rm2.ok === true && (await prisma.aiRoomMember.count({ where: { roomId, userId: U.s3 } })) === 0 && !!sysRm && sysRm.content.includes("🔔") && sysRm.content.includes("คุณs3"), JSON.stringify({ rm1, rm2, sys: sysRm?.content }).slice(0, 160));
    const rm3 = await mem.removeMember(ctxOf(S2), roomId, U.s2);
    const vis = await rooms.getRoom(ctxOf(S2), roomId);
    const rm4 = await mem.removeMember(ctxOf(STAFF), roomId, U.s2); // ORACLE-EDIT (B27-FAB): OWNER มองไม่เห็นห้องแล้ว ⇒ ผู้เปิดเอาออกซ้ำแทน
    const rm5 = await mem.removeMember(ctxOf(MGR), roomId, U.staff);
    chk("R-2", "s2 ออกเอง ⇒ ok · หลังออกมองไม่เห็นห้อง (getRoom null) · เอาออกซ้ำ ⇒ not_a_member · MANAGER (มองไม่เห็น) ⇒ not_found", rm3.ok === true && vis === null && rm4.ok === false && rm4.error === "not_a_member" && rm5.ok === false && rm5.error === "not_found", JSON.stringify({ rm3, vis, rm4, rm5 }).slice(0, 160));
    // ORACLE-EDIT รอบ 2 (รีวิว E2/F3): สมาชิกที่ถูกถอนสิทธิ์ร้าน (acceptedAt null) ต้องไม่ได้ push และไม่โผล่ใน listMembers/ไม่นับ cap
    await addRow(U.s2, false); // ORACLE-EDIT (B27-FAB): addMember ปิดแล้ว ⇒ แถวตรง
    await prisma.membership.updateMany({ where: { tenantId: tid, userId: U.s2 }, data: { acceptedAt: null } });
    const lmRev = await mem.listMembers(ctxOf(STAFF), roomId);
    const recips = typeof mem.roomPushRecipients === "function" ? await mem.roomPushRecipients(tid, roomId) : null;
    await prisma.membership.updateMany({ where: { tenantId: tid, userId: U.s2 }, data: { acceptedAt: new Date() } });
    chk("R-4", "สมาชิกที่ถูกถอนสิทธิ์: listMembers ไม่แสดง · roomPushRecipients (ผู้เปิด ∪ สมาชิกที่ยัง accepted) ไม่มี s2 แต่มี staff", Array.isArray(lmRev) && !lmRev.some((m: AnyMod) => m.userId === U.s2) && Array.isArray(recips) && !recips.includes(U.s2) && recips.includes(U.staff), `lm=${JSON.stringify(lmRev?.map((m: AnyMod) => m.userId))} recips=${JSON.stringify(recips)}`);
    await mem.removeMember(ctxOf(STAFF), roomId, U.s2);
    const g = await rooms.getRoom(ctxOf(STAFF), roomId); // ORACLE-EDIT (B27-FAB): OWNER มองไม่เห็นห้องของ staff แล้ว
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
