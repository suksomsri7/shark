// QC — SECRETARY S1.4 · ห้อง = งาน (rooms.ts) · การมองเห็นห้องร่วม (R-K1) · ตัวนับงานใน tx เดียว (X3) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.4.md · RESOLUTIONS R-K1 R-K6 · ต้องการตาราง S1.1 + pack.ts (S0.4)
//
// กลุ่มข้อ:
//   V  conversation-owner pure: withRoomSight · canSeeConversationId + memberOf · canSeeConversation + tenantRooms · visibleConversationWhere · ห้อง u~ ของคนอื่นที่ไม่มี AiRoom ยังมองไม่เห็น
//   S  startRoom: สร้าง conv(u~user~)+AiRoom+USER message(authorUserId) ใน tx · title ≤60 · startedById = creator · ตัวนับเดือน BKK · ว่าง/actor ผิด · โควตาเต็ม = ไม่สร้างอะไร · 10 ทางพร้อมกันที่เหลือ 5 ⇒ สำเร็จ 5 พอดี
//   L  listRooms: OWNER scope tenant เห็นห้องพนักงาน · STAFF mine เห็นของตัวเอง+ห้องที่เป็นสมาชิก · scope tenant ของ MANAGER/STAFF = mine · สถานะ WAITING/RUNNING/DONE · q · take
//   G  ด่านจริง: findVisibleConversation/listMessages/sendMessage/listPendingProposals/executeProposal/runPlan เคารพสมาชิกห้อง + OWNER · ห้องเดิมไม่มี AiRoom = เดิม · closeRoom/renameRoom สิทธิ์
//   D  fitness ×2 · conversation-owner.ts ยัง pure
// ทุกแถวทดสอบใต้ tenant ชั่วคราว slug `qc-sec-s14-*` · ผู้ใช้ `qcs14-*` · ลบใน finally
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.4.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.4";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const ROOMS_FILE = join(ROOT, "src/lib/ai/secretary/rooms.ts");
if (!FORCED && !existsSync(ROOMS_FILE)) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/lib/ai/secretary/rooms.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
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
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
import type { AiChatMessage, AiProvider, AiReply, AiToolDef } from "@/lib/ai/provider";
class Scripted implements AiProvider { captured: { messages: AiChatMessage[]; tools?: AiToolDef[] }[] = []; constructor(private replies: Partial<AiReply>[]) {} async chat(messages: AiChatMessage[], opts?: { tools?: AiToolDef[] }): Promise<AiReply> { this.captured.push({ messages, tools: opts?.tools }); const r = this.replies.shift() ?? {}; return { text: r.text ?? "รับทราบ", toolCalls: r.toolCalls, tokensIn: 1, tokensOut: 1, model: "scripted" }; } }

const { prisma } = await import("@/lib/core/db");
const owner = (await import("@/lib/ai/conversation-owner")) as AnyMod;
const convs = (await import("@/lib/ai/conversations")) as AnyMod;
const service = await import("@/lib/ai/service");
const proposals = await import("@/lib/ai/proposals");
const plans = await import("@/lib/ai/plans");
const pack = (await import("@/lib/ai/secretary/pack").catch(() => null)) as AnyMod | null;
const rooms = existsSync(ROOMS_FILE) ? ((await import("@/lib/ai/secretary/rooms").catch((e) => { console.log("  ⚠️ import rooms.ts: " + errMsg(e)); return null; })) as AnyMod | null) : null;
const hasTables = "aiRoom" in prisma && "aiRoomMember" in prisma && "aiJobCounter" in prisma;

// ═══════════════ V. pure ═══════════════
console.log("── V: conversation-owner pure ──");
{
  const mem = (userId: string, role: "OWNER" | "MANAGER" | "STAFF") => ({ tenantId: "t", actor: { kind: "member" as const, tenantId: "t", userId, membership: { role, unitAccess: ["*"], permissions: {} } } });
  const sOwner = owner.sightOf(mem("o1", "OWNER")), sStaff = owner.sightOf(mem("s1", "STAFF"));
  const otherRoom = "u~s2~abc", myRoom = "u~s1~abc", legacy = "cuidonly", keyRoom = "k~key1~abc";
  chk("V-1", "เดิมคงอยู่: STAFF เห็นห้องตัวเอง ไม่เห็นของคนอื่น · OWNER เห็น legacy/k~ แต่ไม่เห็น u~ ของคนอื่น", owner.canSeeConversationId(sStaff, myRoom) && !owner.canSeeConversationId(sStaff, otherRoom) && owner.canSeeConversationId(sOwner, legacy) && owner.canSeeConversationId(sOwner, keyRoom) && !owner.canSeeConversationId(sOwner, otherRoom), "ดู canSeeConversationId");
  if (typeof owner.withRoomSight !== "function" || typeof owner.canSeeConversation !== "function") { chk("V-2", "มี withRoomSight + canSeeConversation", false, "ไม่มี export"); skip("V-3", "memberOf/tenantRooms", "ไม่มีฟังก์ชัน"); skip("V-4", "visibleConversationWhere", "ไม่มีฟังก์ชัน"); }
  else {
    const sMem = owner.withRoomSight(sStaff, { memberOf: [otherRoom] });
    const sOwnAll = owner.withRoomSight(sOwner, { tenantRooms: true });
    chk("V-2", "withRoomSight(memberOf) ⇒ STAFF เห็นห้องที่เป็นสมาชิก (string) · ห้องอื่นยังไม่เห็น · sight เดิมไม่ถูกแก้ (pure)", owner.canSeeConversationId(sMem, otherRoom) && !owner.canSeeConversationId(sMem, "u~s3~x") && !owner.canSeeConversationId(sStaff, otherRoom), "ดู memberOf");
    chk("V-3", "tenantRooms: canSeeConversation(row มี room) = true · row ไม่มี room (u~ คนอื่น) = false · string-only ไม่นับ tenantRooms", owner.canSeeConversation(sOwnAll, { id: otherRoom, room: { id: "r" } }) && !owner.canSeeConversation(sOwnAll, { id: otherRoom, room: null }) && !owner.canSeeConversationId(sOwnAll, otherRoom) && owner.canSeeConversation(sOwnAll, { id: legacy, room: null }), "ดู canSeeConversation");
    const w1 = JSON.stringify(owner.visibleConversationWhere(sMem)), w2 = JSON.stringify(owner.visibleConversationWhere(sOwnAll)), w0 = JSON.stringify(owner.visibleConversationWhere(sStaff));
    chk("V-4", "visibleConversationWhere: memberOf ⇒ มี id in [...] · tenantRooms ⇒ มี room isNot null · sight เดิม ⇒ รูปเดิม (startsWith อย่างเดียว)", w1.includes(otherRoom) && /"in"/.test(w1) && /"room"/.test(w2) && /isNot/.test(w2) && !/"in"|"room"/.test(w0), `w0=${w0.slice(0, 60)} w1=${w1.slice(0, 80)} w2=${w2.slice(0, 100)}`);
  }
}

// ═══════════════ fixture ═══════════════
const U = { owner: "qcs14-owner", mgr: "qcs14-mgr", staff: "qcs14-staff", staff2: "qcs14-staff2" };
let tid = "";
const cleanup = async () => {
  if (tid) {
    for (const m of ["aiRoomMember", "aiRoomJob", "aiRoom", "aiProposal", "aiPlan", "aiMessage", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "appSystem", "membership"]) {
      try { await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }); } catch { /* */ }
    }
    try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s14-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs14-" } } }); } catch { /* */ }
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.4", slug: `qc-sec-s14-${Date.now().toString(36)}` } });
  tid = t.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `ผู้ใช้ ${k}` } });
  const perms = { "kanban.card.create": true, "kanban.card.read": true, "ai.chat.send": true };
  const mk = (role: "OWNER" | "MANAGER" | "STAFF", userId: string) => prisma.membership.create({ data: { tenantId: tid, userId, role, unitAccess: ["*"], permissions: role === "STAFF" ? perms : {} as never, acceptedAt: new Date() } });
  await mk("OWNER", U.owner); await mk("MANAGER", U.mgr); await mk("STAFF", U.staff); await mk("STAFF", U.staff2);
  const actor = (userId: string, role: "OWNER" | "MANAGER" | "STAFF") => ({ kind: "member" as const, tenantId: tid, userId, membership: { role, unitAccess: ["*"], permissions: role === "STAFF" ? perms : {} } });
  const OWNER = actor(U.owner, "OWNER"), MGR = actor(U.mgr, "MANAGER"), STAFF = actor(U.staff, "STAFF"), STAFF2 = actor(U.staff2, "STAFF");
  const ctxOf = (a: ReturnType<typeof actor>) => ({ tenantId: tid, actor: a });
  const NOW = new Date("2026-11-10T03:00:00Z");

  console.log("── S: startRoom ──");
  if (!rooms || !hasTables || !pack) { for (const i of [1, 2, 3, 4, 5, 6, 7]) skip(`S-${i}`, "startRoom", !rooms ? "ไม่มี rooms.ts" : !hasTables ? "ไม่มีตาราง S1.1" : "ไม่มี pack.ts"); for (const i of [1, 2, 3, 4, 5, 6]) skip(`L-${i}`, "listRooms", "ไม่มี rooms.ts/ตาราง"); for (const i of [1, 2, 3, 4, 5, 6, 7]) skip(`G-${i}`, "ด่านจริง", "ไม่มี rooms.ts/ตาราง"); }
  else {
    const month = pack.monthKeyBangkok(NOW);
    const limit = pack.FREE_PACK.jobsPerMonth as number;
    chk("S-0", "roomTitleFrom: ≤60 ตัว + … · ว่าง = 'งานใหม่' · roomStatusOf ลำดับ DONE>RUNNING>WAITING>OPEN", rooms.roomTitleFrom("x".repeat(80)).length <= 61 && rooms.roomTitleFrom("x".repeat(80)).endsWith("…") && rooms.roomTitleFrom("  สรุปยอด\nบรรทัดสอง") === "สรุปยอด" && rooms.roomTitleFrom("   ") === "งานใหม่" && rooms.roomStatusOf({ closedAt: new Date(), queuedJobs: 1, pendingProposals: 1, pendingPlans: 0 }) === "DONE" && rooms.roomStatusOf({ closedAt: null, queuedJobs: 1, pendingProposals: 1, pendingPlans: 0 }) === "RUNNING" && rooms.roomStatusOf({ closedAt: null, queuedJobs: 0, pendingProposals: 0, pendingPlans: 1 }) === "WAITING" && rooms.roomStatusOf({ closedAt: null, queuedJobs: 0, pendingProposals: 0, pendingPlans: 0 }) === "OPEN", "ดู pure");
    const r1 = await rooms.startRoom(ctxOf(STAFF), { instruction: "สรุปยอดขายเมื่อวาน แล้วหาของใกล้หมด", systems: ["pos"] }, NOW);
    const room1 = r1.ok ? await prisma.aiRoom.findUnique({ where: { id: r1.roomId } }) : null;
    const conv1 = r1.ok ? await prisma.aiConversation.findUnique({ where: { id: r1.conversationId }, include: { messages: true } }) : null;
    chk("S-1", "startRoom (STAFF): ok · conv id u~staff~ · AiRoom(startedById=staff · title จากคำสั่ง · systems) · 1 ข้อความ USER authorUserId=staff · ไม่เรียกโมเดล", r1.ok === true && typeof r1.conversationId === "string" && r1.conversationId.startsWith(`u~${U.staff}~`) && room1?.startedById === U.staff && room1?.conversationId === r1.conversationId && room1?.title === "สรุปยอดขายเมื่อวาน แล้วหาของใกล้หมด" && JSON.stringify(room1?.systems) === '["pos"]' && conv1?.messages.length === 1 && conv1.messages[0].role === "USER" && (conv1.messages[0] as AnyMod).authorUserId === U.staff && conv1.title === room1?.title, JSON.stringify(r1).slice(0, 200));
    chk("S-2", "startedById = conversationCreatorOf(conversationId).id · jobsCounted 1 · ตัวนับเดือน BKK = 1 · jobsUsed/jobsLimit ในผล", r1.ok === true && owner.conversationCreatorOf(r1.conversationId)?.id === room1?.startedById && room1?.jobsCounted === 1 && (await prisma.aiJobCounter.findUnique({ where: { tenantId_month: { tenantId: tid, month } } }))?.jobs === 1 && r1.jobsUsed === 1 && r1.jobsLimit === limit, `counter=${JSON.stringify(await prisma.aiJobCounter.findMany({ where: { tenantId: tid } }))}`);
    const r2 = await rooms.startRoom(ctxOf(OWNER), { instruction: "ลูกค้าคนไหนไม่ได้ซื้อนานเกิน 1 เดือน" }, NOW);
    const rE = await rooms.startRoom(ctxOf(OWNER), { instruction: "   " }, NOW);
    const rA = await rooms.startRoom({ tenantId: tid, actor: { kind: "system", tenantId: tid, job: "scheduled-task" } } as never, { instruction: "x" }, NOW);
    const rX = await rooms.startRoom({ tenantId: tid, actor: { ...OWNER, tenantId: "other-tenant" } } as never, { instruction: "x" }, NOW);
    chk("S-3", "OWNER เปิดห้องที่ 2 ⇒ ตัวนับ 2 · คำสั่งว่าง ⇒ error empty ไม่นับ · actor system/คนละร้าน ⇒ error actor ไม่นับ", r2.ok === true && rE.ok === false && rE.error === "empty" && rA.ok === false && rA.error === "actor" && rX.ok === false && rX.error === "actor" && (await prisma.aiJobCounter.findUnique({ where: { tenantId_month: { tenantId: tid, month } } }))?.jobs === 2 && (await prisma.aiRoom.count({ where: { tenantId: tid } })) === 2, JSON.stringify({ r2: r2.ok, rE, rA, rX }).slice(0, 200));
    // โควตาเต็ม
    await prisma.aiJobCounter.update({ where: { tenantId_month: { tenantId: tid, month } }, data: { jobs: limit } });
    const roomsBefore = await prisma.aiRoom.count({ where: { tenantId: tid } }), convBefore = await prisma.aiConversation.count({ where: { tenantId: tid } }), msgBefore = await prisma.aiMessage.count({ where: { tenantId: tid } });
    const rQ = await rooms.startRoom(ctxOf(OWNER), { instruction: "งานเกินโควตา" }, NOW);
    chk("S-4", "โควตาเต็ม (100/100): error quota · ข้อความไทยมี 'หมด' · resetAt = 1 ธ.ค. 00:00 BKK · ไม่สร้าง conv/room/message · ตัวนับไม่เกิน limit", rQ.ok === false && rQ.error === "quota" && /หมด/.test(rQ.message ?? "") && new Date(rQ.resetAt).toISOString() === "2026-11-30T17:00:00.000Z" && (await prisma.aiRoom.count({ where: { tenantId: tid } })) === roomsBefore && (await prisma.aiConversation.count({ where: { tenantId: tid } })) === convBefore && (await prisma.aiMessage.count({ where: { tenantId: tid } })) === msgBefore && (await prisma.aiJobCounter.findUnique({ where: { tenantId_month: { tenantId: tid, month } } }))?.jobs === limit, JSON.stringify(rQ).slice(0, 200));
    // เดือนใหม่ = ตัวนับใหม่
    const NEXT = new Date("2026-12-01T01:00:00Z");
    const rN = await rooms.startRoom(ctxOf(OWNER), { instruction: "งานเดือนหน้า" }, NEXT);
    chk("S-5", "เดือนถัดไป (BKK) ⇒ ตัวนับแถวใหม่ 2026-12 = 1 · เปิดได้", rN.ok === true && (await prisma.aiJobCounter.findUnique({ where: { tenantId_month: { tenantId: tid, month: pack.monthKeyBangkok(NEXT) } } }))?.jobs === 1, JSON.stringify(rN).slice(0, 120));
    // X3: 10 ทางพร้อมกัน เหลือ 5
    await prisma.aiJobCounter.update({ where: { tenantId_month: { tenantId: tid, month } }, data: { jobs: limit - 5 } });
    const beforeRooms = await prisma.aiRoom.count({ where: { tenantId: tid } });
    const par = await Promise.all(Array.from({ length: 10 }, (_, i) => rooms.startRoom(ctxOf(OWNER), { instruction: `งานขนาน ${i}` }, NOW).catch((e: unknown) => ({ ok: false, error: "throw", message: errMsg(e) }))));
    const okN = par.filter((r: AnyMod) => r.ok).length, quotaN = par.filter((r: AnyMod) => !r.ok && r.error === "quota").length, thrown = par.filter((r: AnyMod) => r.error === "throw");
    chk("S-6", "X3: 10 ทางพร้อมกันเมื่อเหลือ 5 ⇒ สำเร็จ 5 · quota 5 · ไม่มี throw · ห้องเพิ่ม 5 · ตัวนับ = limit พอดี", okN === 5 && quotaN === 5 && thrown.length === 0 && (await prisma.aiRoom.count({ where: { tenantId: tid } })) === beforeRooms + 5 && (await prisma.aiJobCounter.findUnique({ where: { tenantId_month: { tenantId: tid, month } } }))?.jobs === limit, `ok=${okN} quota=${quotaN} throw=${thrown.length} ${thrown[0] ? (thrown[0] as AnyMod).message : ""}`);
    await prisma.aiJobCounter.update({ where: { tenantId_month: { tenantId: tid, month } }, data: { jobs: 10 } });
    const rS2 = await rooms.startRoom(ctxOf(STAFF2), { instruction: "ห้องของ staff2" }, NOW);
    chk("S-7", "เปิดห้องต่อได้หลังตัวนับลด (staff2)", rS2.ok === true, JSON.stringify(rS2).slice(0, 100));

    // ═══════════════ L. listRooms ═══════════════
    console.log("── L: listRooms ──");
    const staffConv = r1.conversationId as string, staffRoomId = r1.roomId as string;
    // staff2 เป็นสมาชิกห้องของ staff (แถวตรง — S1.6 ค่อยมี addMember)
    await prisma.aiRoomMember.create({ data: { tenantId: tid, roomId: staffRoomId, userId: U.staff2, addedById: U.staff } }); // ORACLE-EDIT R-S1.1c
    const lo = await rooms.listRooms(ctxOf(OWNER), { scope: "tenant" });
    const lm = await rooms.listRooms(ctxOf(OWNER), { scope: "mine" });
    chk("L-1", "OWNER scope tenant เห็นทุกห้อง (รวมของ staff/staff2) · scope mine เห็นเฉพาะที่ตัวเองเปิด · การ์ดมี startedByName/memberIds/status", lo.some((c: AnyMod) => c.conversationId === staffConv) && lo.some((c: AnyMod) => c.startedById === U.staff2) && lm.every((c: AnyMod) => c.startedById === U.owner) && lm.length >= 2 && lo.find((c: AnyMod) => c.conversationId === staffConv)?.memberIds?.includes(U.staff2) && typeof lo[0]?.startedByName === "string" && ["OPEN", "RUNNING", "WAITING", "DONE"].includes(lo[0]?.status), `tenant=${lo.length} mine=${lm.length}`);
    const ls = await rooms.listRooms(ctxOf(STAFF), { scope: "tenant" });
    const ls2 = await rooms.listRooms(ctxOf(STAFF2), { scope: "mine" });
    const lmg = await rooms.listRooms(ctxOf(MGR), { scope: "tenant" });
    chk("L-2", "STAFF ขอ tenant ⇒ ได้แค่ของตัวเอง · staff2 mine = ห้องตัวเอง + ห้องที่เป็นสมาชิก (ของ staff) · MANAGER ขอ tenant ⇒ ของตัวเอง (ว่าง)", ls.length === 1 && ls[0].conversationId === staffConv && ls2.length === 2 && ls2.some((c: AnyMod) => c.conversationId === staffConv) && ls2.some((c: AnyMod) => c.startedById === U.staff2) && lmg.length === 0, `staff=${ls.length} staff2=${ls2.length} mgr=${lmg.length}`);
    // สถานะ
    await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: staffConv, kind: "kanban_create_card", summary: "qc", payload: { title: "x" }, expiresAt: new Date(Date.now() + 3_600_000) } });
    const ownerConv = r2.conversationId as string, ownerRoomId = r2.roomId as string;
    await prisma.aiRoomJob.create({ data: { tenantId: tid, roomId: ownerRoomId, messageId: `qcs14-msg-${Date.now()}`, status: "QUEUED" } }); // ORACLE-EDIT R-S1.1c
    const rN2 = rN.roomId as string;
    await prisma.aiRoom.update({ where: { id: rN2 }, data: { closedAt: new Date() } });
    const st = async (convId: string) => (await rooms.listRooms(ctxOf(OWNER), { scope: "tenant", take: 100 })).find((c: AnyMod) => c.conversationId === convId)?.status;
    chk("L-3", "สถานะ: ห้อง staff มี proposal PENDING = WAITING · ห้อง owner มี job QUEUED = RUNNING · ห้องที่ปิด = DONE · ห้องอื่น = OPEN · roomStatus(db) ตรงกัน", (await st(staffConv)) === "WAITING" && (await st(ownerConv)) === "RUNNING" && (await st(rN.conversationId)) === "DONE" && (await st(rS2.conversationId)) === "OPEN" && (await rooms.roomStatus(tid, staffConv)) === "WAITING" && (await rooms.roomStatus(tid, ownerConv)) === "RUNNING", `${await st(staffConv)} ${await st(ownerConv)} ${await st(rN.conversationId)} ${await st(rS2.conversationId)}`);
    const lw = await rooms.listRooms(ctxOf(OWNER), { scope: "tenant", status: "WAITING" });
    const lq = await rooms.listRooms(ctxOf(OWNER), { scope: "tenant", q: "ยอดขาย" });
    const lt = await rooms.listRooms(ctxOf(OWNER), { scope: "tenant", take: 2 });
    chk("L-4", "ตัวกรอง status=WAITING · q='ยอดขาย' · take=2 · เรียง updatedAt desc", lw.length === 1 && lw[0].conversationId === staffConv && lq.length === 1 && lq[0].conversationId === staffConv && lt.length === 2 && lt[0].updatedAt >= lt[1].updatedAt, `w=${lw.length} q=${lq.length} t=${lt.length}`);
    const gr = await rooms.getRoom(ctxOf(STAFF2), staffRoomId), gr2 = await rooms.getRoom(ctxOf(MGR), staffRoomId), gr3 = await rooms.getRoom(ctxOf(OWNER), staffRoomId);
    chk("L-5", "getRoom: สมาชิก (staff2) เห็น · MANAGER ไม่เห็น (null) · OWNER เห็น · มี status", gr?.id === staffRoomId && gr?.status === "WAITING" && gr2 === null && gr3?.id === staffRoomId, `gr=${!!gr} gr2=${gr2} gr3=${!!gr3}`);
    const c1 = await rooms.closeRoom(ctxOf(STAFF2), staffRoomId), c2 = await rooms.closeRoom(ctxOf(STAFF), staffRoomId), c3 = await rooms.closeRoom(ctxOf(STAFF), staffRoomId);
    const rn1 = await rooms.renameRoom(ctxOf(MGR), ownerRoomId, "x"), rn2 = await rooms.renameRoom(ctxOf(OWNER), ownerRoomId, "ชื่อใหม่");
    const rowO = await prisma.aiRoom.findUnique({ where: { id: ownerRoomId } }), convO = await prisma.aiConversation.findUnique({ where: { id: ownerConv } });
    chk("L-6", "closeRoom: สมาชิกธรรมดาปิดไม่ได้ · ผู้เปิดปิดได้ · ปิดซ้ำ false · renameRoom: MANAGER ไม่ได้ · OWNER ได้ (AiRoom+AiConversation title)", c1 === false && c2 === true && c3 === false && rn1 === false && rn2 === true && rowO?.title === "ชื่อใหม่" && convO?.title === "ชื่อใหม่" && (await prisma.aiRoom.findUnique({ where: { id: staffRoomId } }))?.closedAt !== null, `${c1} ${c2} ${c3} ${rn1} ${rn2}`);
    await prisma.aiRoom.update({ where: { id: staffRoomId }, data: { closedAt: null } });

    // ═══════════════ G. ด่านจริง ═══════════════
    console.log("── G: ด่านจริง ──");
    const fv = async (a: ReturnType<typeof actor>, id: string) => (await convs.findVisibleConversation(ctxOf(a), id)) !== null;
    chk("G-1", "findVisibleConversation: ห้อง staff — staff ✓ staff2(สมาชิก) ✓ OWNER ✓ MANAGER ✗ · ห้อง owner — staff ✗", (await fv(STAFF, staffConv)) && (await fv(STAFF2, staffConv)) && (await fv(OWNER, staffConv)) && !(await fv(MGR, staffConv)) && !(await fv(STAFF, ownerConv)), "ดู findVisibleConversation");
    // ห้อง u~ เดิมของ staff ที่ไม่มี AiRoom ⇒ OWNER ยังมองไม่เห็น (baseline)
    const legacyStaff = await prisma.aiConversation.create({ data: { id: owner.newConversationId(ctxOf(STAFF)), tenantId: tid, title: "ห้องเดิม" } });
    chk("G-2", "ห้อง u~staff เดิม (ไม่มี AiRoom): OWNER ไม่เห็น · staff เห็น · listRooms ไม่รวม (ไม่ใช่ห้องงาน)", !(await fv(OWNER, legacyStaff.id)) && (await fv(STAFF, legacyStaff.id)) && !(await rooms.listRooms(ctxOf(OWNER), { scope: "tenant", take: 100 })).some((c: AnyMod) => c.conversationId === legacyStaff.id), "ดู baseline");
    const m2 = await service.listMessages(ctxOf(STAFF2), staffConv), mM = await service.listMessages(ctxOf(MGR), staffConv), mO = await service.listMessages(ctxOf(OWNER), staffConv);
    chk("G-3", "listMessages: สมาชิก staff2 เห็นข้อความห้อง staff · OWNER เห็น · MANAGER ว่าง", m2.length >= 1 && mO.length >= 1 && mM.length === 0, `${m2.length} ${mO.length} ${mM.length}`);
    const p = new Scripted([{ text: "โอเคครับ" }]);
    const sm = await service.sendMessage(ctxOf(STAFF2), { conversationId: staffConv, text: "ช่วยดูด้วย" }, { provider: p });
    const msgs = await prisma.aiMessage.findMany({ where: { conversationId: staffConv }, orderBy: { createdAt: "asc" } });
    const pM = new Scripted([{ text: "โอเค" }]);
    const smM = await service.sendMessage(ctxOf(MGR), { conversationId: staffConv, text: "แอบส่ง" }, { provider: pM });
    chk("G-4", "sendMessage: staff2 (สมาชิก) ต่อห้อง staff ได้ — ข้อความลงห้องเดิม · USER ใหม่มี authorUserId=staff2 · MANAGER ส่งเข้าห้องนั้น ⇒ ไปห้องใหม่ของตัวเอง (ไม่ลงห้อง staff)", sm.ok === true && (sm as AnyMod).conversationId === staffConv && msgs.length >= 3 && msgs.some((m) => m.role === "USER" && m.content === "ช่วยดูด้วย" && (m as AnyMod).authorUserId === U.staff2) && smM.ok === true && (smM as AnyMod).conversationId !== staffConv && !(await prisma.aiMessage.findFirst({ where: { conversationId: staffConv, content: "แอบส่ง" } })), `sm=${JSON.stringify(sm).slice(0, 80)} smM=${(smM as AnyMod).conversationId}`);
    const lp2 = await proposals.listPendingProposals(ctxOf(STAFF2), staffConv), lpM = await proposals.listPendingProposals(ctxOf(MGR), staffConv), lpO = await proposals.listPendingProposals(ctxOf(OWNER), staffConv);
    chk("G-5", "listPendingProposals: สมาชิก/OWNER เห็น 1 · MANAGER ว่าง", lp2.length === 1 && lpO.length === 1 && lpM.length === 0, `${lp2.length} ${lpO.length} ${lpM.length}`);
    const prop = lp2[0];
    const exM = await proposals.executeProposal(MGR.membership as never, { tenantId: tid } as never, prop.id, { userId: U.mgr });
    const exO = await proposals.executeProposal(OWNER.membership as never, { tenantId: tid } as never, prop.id, { userId: U.owner });
    chk("G-6", "executeProposal ในห้อง staff: MANAGER ⇒ 'ไม่พบข้อเสนอนี้' (มองไม่เห็น) · OWNER ⇒ ผ่านด่านมองเห็น (note ≠ ไม่พบ)", exM.ok === false && /ไม่พบข้อเสนอ/.test(exM.note) && !/ไม่พบข้อเสนอ/.test(exO.note), `M=${exM.note.slice(0, 60)} O=${exO.note.slice(0, 80)}`);
    const plan = await prisma.aiPlan.create({ data: { tenantId: tid, conversationId: staffConv, title: "qc", stepsJson: [], expiresAt: new Date(Date.now() + 3_600_000) } as never });
    const rpM = await plans.executePlan(MGR.membership as never, { tenantId: tid } as never, plan.id, { userId: U.mgr }).catch((e: unknown) => ({ ok: false, results: [], doneCount: 0, err: errMsg(e) }));
    const rp2 = await plans.executePlan(STAFF2.membership as never, { tenantId: tid } as never, plan.id, { userId: U.staff2 }).catch((e: unknown) => ({ ok: false, results: [], doneCount: 0, err: errMsg(e) }));
    chk("G-7", "executePlan ในห้อง staff: MANAGER ⇒ ok:false (มองไม่เห็น) · staff2 (สมาชิก) ⇒ ผ่านด่านมองเห็น (แผนว่าง ⇒ ok:true หรือ done 0 โดยไม่ใช่เหตุผลมองไม่เห็น)", (rpM as AnyMod).ok === false && ((rp2 as AnyMod).ok === true || (rp2 as AnyMod).doneCount === 0) && (await prisma.aiPlan.findUnique({ where: { id: plan.id } }))?.status !== "PENDING" === ((rp2 as AnyMod).ok === true), `M=${JSON.stringify(rpM).slice(0, 80)} S2=${JSON.stringify(rp2).slice(0, 80)}`, "MAJOR");
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
  const co = rd(join(ROOT, "src/lib/ai/conversation-owner.ts"));
  chk("D-3", "conversation-owner.ts ยัง pure (ไม่ import prisma/core/db/conversations)", !/@\/lib\/core\/db|from "@prisma\/client"(?!.*type)|\.\/conversations"/.test(co.replace(/import type[^\n]*\n/g, "")), "พบ import ฐานข้อมูล", "MAJOR");
}
await prisma.$disconnect();
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length} · ข้าม ${skipped.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
