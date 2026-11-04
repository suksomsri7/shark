// QC — SECRETARY S1.10 + S1.15 · ตีกลับ+สอน (teach.ts) · แก้ก่อนอนุมัติ · ความจำ PENDING · วงจรเรียนรู้ (learn.ts) · oracle ของผู้คุม
// สัญญา: ledger/secretary-briefs/sec-brief-S1.10.md · RESOLUTIONS R-K3 §C Q9 §B.4 · ต้องการ S1.4 + S1.7
//
// กลุ่มข้อ: T rejectWithNote/pending memory · E editProposal · L recordOutcome/noteLesson/lessonBlock/prompt · D fitness + persona snapshot
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SHARK_AI_MOCK=1 pnpm exec tsx scripts/qc-sec-s1.10.mts
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.10";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const TEACH = join(ROOT, "src/lib/ai/secretary/teach.ts");
if (!FORCED && !existsSync(TEACH)) { console.log(`⏭️  ${LABEL}: ยังไม่มี teach.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`); console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" })); process.exit(0); }
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
process.env.SHARK_AI_MOCK = "1"; delete process.env.SHARK_AI_COLLECT;
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
import type { AiChatMessage, AiProvider, AiReply, AiToolDef } from "@/lib/ai/provider";
class Scripted implements AiProvider { captured: AiChatMessage[][] = []; async chat(m: AiChatMessage[], _o?: { tools?: AiToolDef[] }): Promise<AiReply> { this.captured.push(m); return { text: "รับทราบ", tokensIn: 1, tokensOut: 1, model: "scripted" }; } }

const { prisma } = await import("@/lib/core/db");
const persona = (await import("@/lib/ai/persona")) as AnyMod;
const memory = (await import("@/lib/ai/memory")) as AnyMod;
const service = await import("@/lib/ai/service");
const proposals = await import("@/lib/ai/proposals");
const sys = await import("@/lib/modules/system/service");
const kanbanSvc = await import("@/lib/modules/kanban/service");
const rooms = (await import("@/lib/ai/secretary/rooms").catch(() => null)) as AnyMod | null;
const teach = existsSync(TEACH) ? ((await import("@/lib/ai/secretary/teach").catch((e) => { console.log("  ⚠️ teach: " + errMsg(e)); return null; })) as AnyMod | null) : null;
const learn = (await import("@/lib/ai/secretary/learn").catch(() => null)) as AnyMod | null;
const { ForbiddenError } = await import("@/lib/core/rbac");

console.log("── D0: persona snapshot ──");
{
  const ctxA = { tenantName: "QC Sec Café", systems: [{ type: "POS", name: "ขายหน้าร้าน" }, { type: "ACCOUNT", name: "บัญชี" }], dna: "- เปิด 9 โมง", memories: "- ลูกค้าประจำชื่อสมชาย", promptTweaks: "- ตอบสั้น" };
  chk("D-0", "persona ไม่มี lessons ⇒ prompt เดิมทุกไบต์ (snapshot 5973db2e) · มี lessons ⇒ มีบล็อก 'บทเรียน'", sha(persona.buildSystemPrompt(ctxA)) === "da1e5f6986e5f850fe1ec73d48dec1fb159275b0b6c67c6e87433cc01d94de49" && /บทเรียน/.test(persona.buildSystemPrompt({ ...ctxA, lessons: "- [kanban_create_card] ใส่กำหนดส่งเสมอ" })) && !/บทเรียน/.test(persona.buildSystemPrompt({ ...ctxA, lessons: "" })), "snapshot/บล็อก");
}
const U = { owner: "qcs110-owner", staff: "qcs110-staff", s2: "qcs110-s2" };
let tid = "";
const cleanup = async () => {
  if (tid) { for (const m of ["aiLesson", "aiTrainingSample", "aiActionLog", "aiMemory", "aiRoomMember", "aiRoomJob", "aiRoom", "aiProposal", "aiPlan", "aiMessage", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "kanbanCard", "kanbanColumn", "kanbanBoard", "appSystem", "membership"]) { try { await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }); } catch { /* */ } } try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); } }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-s110-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await (prisma as AnyMod).aiSecretary?.deleteMany({ where: { userId: { startsWith: "qcs110-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcs110-" } } }); } catch { /* */ }
};
try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC S1.10", slug: `qc-sec-s110-${Date.now().toString(36)}` } });
  tid = t.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `คุณ${k}` } });
  const kperm = { "kanban.card.create": true, "kanban.card.read": true, "ai.chat.send": true };
  await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], permissions: {} as never, acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.staff, role: "STAFF", unitAccess: ["*"], permissions: kperm as never, acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.s2, role: "STAFF", unitAccess: ["*"], permissions: kperm as never, acceptedAt: new Date() } });
  const actor = (userId: string, role: "OWNER" | "STAFF") => ({ kind: "member" as const, tenantId: tid, userId, membership: { role, unitAccess: ["*"], permissions: role === "STAFF" ? kperm : {} } });
  const OWNER = actor(U.owner, "OWNER"), STAFF = actor(U.staff, "STAFF"), S2 = actor(U.s2, "STAFF");
  const ctxOf = (a: ReturnType<typeof actor>) => ({ tenantId: tid, actor: a });
  const kb = await sys.createSystem(tid, "KANBAN", "บอร์ดงาน");
  const board = await kanbanSvc.createBoard({ tenantId: tid, systemId: kb.id, name: "บอร์ด QC", visibility: "TENANT" as never });
  const mkProp = (convId: string, kind: string, payload: Record<string, unknown>) => prisma.aiProposal.create({ data: { tenantId: tid, conversationId: convId, kind, summary: `qc ${kind}`, payload: payload as never, expiresAt: new Date(Date.now() + 3_600_000) } });
  if (!teach || !learn || !rooms) { for (const id of ["T-1", "T-2", "T-3", "T-4", "E-1", "E-2", "L-1", "L-2", "L-3", "L-4"]) skip(id, "teach/learn", !teach ? "ไม่มี teach.ts" : !learn ? "ไม่มี learn.ts" : "ไม่มี rooms.ts"); }
  else {
    console.log("── T: rejectWithNote · ความจำ PENDING ──");
    const r = await rooms.startRoom(ctxOf(STAFF), { instruction: "สร้างการ์ดงาน" });
    const convId = r.conversationId as string;
    const p1 = await mkProp(convId, "kanban_create_card", { title: "การ์ด A" });
    const tS2 = await teach.rejectWithNote(ctxOf(S2), p1.id, { note: "ใส่กำหนดส่งด้วย", remember: "JOB" });
    const tE = await teach.rejectWithNote(ctxOf(STAFF), p1.id, { note: "   ", remember: "JOB" });
    const tJ = await teach.rejectWithNote(ctxOf(STAFF), p1.id, { note: "ใส่กำหนดส่งด้วย", remember: "JOB" });
    const p1After = await prisma.aiProposal.findUnique({ where: { id: p1.id } });
    const sysMsg = await prisma.aiMessage.findFirst({ where: { conversationId: convId }, orderBy: { createdAt: "desc" } });
    const tAgain = await teach.rejectWithNote(ctxOf(STAFF), p1.id, { note: "อีกครั้ง", remember: "JOB" });
    chk("T-1", "มองไม่เห็น ⇒ not_found · note ว่าง ⇒ empty · JOB ⇒ ok REJECTED resultNote มี note · ข้อความระบบ 🔁 มีชื่อ+note · ไม่มีความจำ · ซ้ำ ⇒ not_pending", tS2.ok === false && tS2.error === "not_found" && tE.ok === false && tE.error === "empty" && tJ.ok === true && !tJ.memoryId && p1After?.status === "REJECTED" && (p1After?.resultNote ?? "").includes("ใส่กำหนดส่งด้วย") && !!sysMsg && sysMsg.content.includes("🔁") && sysMsg.content.includes("ใส่กำหนดส่งด้วย") && (sysMsg as AnyMod).authorUserId === null && (await prisma.aiMemory.count({ where: { tenantId: tid } })) === 0 && tAgain.ok === false && tAgain.error === "not_pending", JSON.stringify({ tS2, tE, tJ, st: p1After?.status, tAgain }).slice(0, 220));
    const p2 = await mkProp(convId, "kanban_create_card", { title: "การ์ด B" });
    const tR = await teach.rejectWithNote(ctxOf(STAFF), p2.id, { note: "การ์ดทุกใบต้องมีผู้รับผิดชอบ", remember: "RULE" });
    const memR = tR.ok && tR.memoryId ? await prisma.aiMemory.findUnique({ where: { id: tR.memoryId } }) : null;
    const p3 = await mkProp(convId, "kanban_create_card", { title: "การ์ด C" });
    const tP = await teach.rejectWithNote(ctxOf(STAFF), p3.id, { note: "โทรหาคุณสมชาย 0812345678 ก่อน", remember: "RULE" });
    chk("T-2", "STAFF RULE ⇒ AiMemory id o~<staff>~ status PENDING · ไม่เข้า memoryBlock · PII ใน RULE ⇒ pii (ข้อเสนอคง PENDING · ไม่จด)", tR.ok === true && !!memR && memR.id.startsWith(`o~${U.staff}~`) && memR.status === "PENDING" && !(await memory.memoryBlock(ctxOf(OWNER))).includes("ผู้รับผิดชอบ") && tP.ok === false && tP.error === "pii" && (await prisma.aiProposal.findUnique({ where: { id: p3.id } }))?.status === "PENDING" && (await prisma.aiMemory.count({ where: { tenantId: tid } })) === 1, JSON.stringify({ tR, mem: memR?.id?.slice(0, 20), st: memR?.status, tP }).slice(0, 200));
    const pend = await teach.pendingMemories(ctxOf(OWNER)), pendS = await teach.pendingMemories(ctxOf(STAFF));
    const cS = await teach.confirmMemory(ctxOf(STAFF), memR!.id);
    const cO = await teach.confirmMemory(ctxOf(OWNER), memR!.id);
    const blockAfter = await memory.memoryBlock(ctxOf(OWNER));
    const blockStaff = await memory.memoryBlock(ctxOf(S2));
    chk("T-3", "pendingMemories: OWNER เห็น 1 · STAFF ว่าง · STAFF ยืนยันไม่ได้ (false) · OWNER ยืนยัน ⇒ status null · เข้า memoryBlock ของทุกคน (ข้อเท็จจริงของร้าน)", pend.length === 1 && pend[0].id === memR!.id && pendS.length === 0 && cS === false && cO === true && (await prisma.aiMemory.findUnique({ where: { id: memR!.id } }))?.status === null && blockAfter.includes("ผู้รับผิดชอบ") && blockStaff.includes("ผู้รับผิดชอบ"), `pend=${pend.length} cS=${cS} cO=${cO}`);
    const p4 = await mkProp(convId, "kanban_create_card", { title: "การ์ด D" });
    const tO = await teach.rejectWithNote(ctxOf(OWNER), p4.id, { note: "ใช้ป้าย urgent เมื่อด่วน", remember: "RULE" });
    const memO = tO.ok && tO.memoryId ? await prisma.aiMemory.findUnique({ where: { id: tO.memoryId } }) : null;
    const p5 = await mkProp(convId, "kanban_create_card", { title: "การ์ด E" });
    const rj = await teach.rejectMemory(ctxOf(OWNER), memO!.id);
    chk("T-4", "OWNER RULE ⇒ ความจำยืนยันทันที (status null · เข้า block) · rejectMemory ลบได้", tO.ok === true && memO?.status === null && (await memory.memoryBlock(ctxOf(STAFF))).includes("urgent") && rj === true && (await prisma.aiMemory.count({ where: { id: memO!.id } })) === 0, JSON.stringify({ tO, st: memO?.status, rj }).slice(0, 160));

    console.log("── E: editProposal ──");
    const col = await prisma.kanbanColumn.findFirst({ where: { boardId: board.id }, orderBy: { position: "asc" } as never });
    const pK = await mkProp(convId, "kanban.cards.create", { opId: "cards.create", input: { columnId: col?.id, title: "ชื่อเดิม" } });
    const e1 = await teach.editProposal(ctxOf(STAFF), pK.id, { title: "ชื่อใหม่", dueAt: "ไม่ใช่วันที่" });
    const e2 = await teach.editProposal(ctxOf(STAFF), pK.id, { title: "ชื่อใหม่" });
    const pKAfter = await prisma.aiProposal.findUnique({ where: { id: pK.id } });
    const payloadK = pKAfter?.payload as AnyMod;
    const e3 = await teach.editProposal(ctxOf(STAFF), p5.id, { title: "x" });
    const e4 = await teach.editProposal(ctxOf(S2), pK.id, { title: "y" });
    chk("E-1", "kind ทะเบียน: patch ผิด schema ⇒ invalid ไทย (ไม่เขียน) · patch ถูก ⇒ ok payload.input.title ใหม่ + _edited{before, byUserId} · kind เขียนมือ ⇒ not_editable · มองไม่เห็น ⇒ not_found", e1.ok === false && e1.error === "invalid" && thai(e1.message) && e2.ok === true && payloadK?.input?.title === "ชื่อใหม่" && payloadK?._edited?.byUserId === U.staff && payloadK?._edited?.before?.title === "ชื่อเดิม" && e3.ok === false && e3.error === "not_editable" && e4.ok === false && e4.error === "not_found", JSON.stringify({ e1, e2: e2.ok, input: payloadK?.input, e3, e4 }).slice(0, 220));
    const exK = await proposals.executeProposal({ role: "OWNER", unitAccess: ["*"], permissions: {} } as never, { tenantId: tid } as never, pK.id, { userId: U.owner });
    const card = await prisma.kanbanCard.findFirst({ where: { tenantId: tid, title: "ชื่อใหม่" } });
    chk("E-2", "อนุมัติข้อเสนอที่แก้แล้ว ⇒ การ์ดชื่อใหม่ถูกสร้าง", exK.ok === true && !!card, JSON.stringify(exK).slice(0, 120));

    console.log("── L: learn ──");
    const samples = await prisma.aiTrainingSample.findMany({ where: { tenantId: tid }, orderBy: { createdAt: "asc" } });
    const rej = samples.filter((s) => s.outcome === "REJECTED"), ed = samples.filter((s) => s.outcome === "EDITED");
    const room = await prisma.aiRoom.findUnique({ where: { conversationId: convId } });
    chk("L-1", "recordOutcome: REJECTED ≥3 แถว (proposalId · roomId · editedReply = note · ไม่เปิด SHARK_AI_COLLECT ก็เก็บ) · EDITED 1 แถว (stepsJson มี before/after · proposalId) · PII ใน note ถูก anonymize", rej.length >= 3 && rej.every((s) => s.proposalId && s.roomId === room?.id) && rej.some((s) => (s.editedReply ?? "").includes("ใส่กำหนดส่งด้วย")) && ed.length === 1 && ed[0].proposalId === pK.id && JSON.stringify(ed[0].stepsJson).includes("ชื่อเดิม") && !samples.some((s) => JSON.stringify(s).includes("0812345678")), `rej=${rej.length} ed=${ed.length} room=${room?.id}`);
    const n1 = await learn.noteLesson(tid, { kind: "kanban_create_card", pattern: "ใส่กำหนดส่ง ด้วย", example: "การ์ด A", sourceUserId: U.staff, sourceRoomId: room?.id });
    const n2 = await learn.noteLesson(tid, { kind: "kanban_create_card", pattern: "  ใส่กำหนดส่งด้วย ", example: "การ์ด B", sourceUserId: U.staff, sourceRoomId: room?.id });
    const lessons = await prisma.aiLesson.findMany({ where: { tenantId: tid, kind: "kanban_create_card" } });
    chk("L-2", "noteLesson: pattern เดิม (normalize ช่องว่าง) ⇒ แถวเดียว occurrences 2 · suggest true ครั้งที่ 2 · status PENDING · แถวจาก rejectWithNote ก่อนหน้า (3 รายการ) มีอยู่", n1.suggest === false && n2.suggest === true && n2.id === n1.id && n2.occurrences >= 2 && lessons.some((l) => l.id === n1.id && l.status === "PENDING") && lessons.length >= 2, JSON.stringify({ n1, n2, n: lessons.length }).slice(0, 200));
    let fe = false; try { await learn.confirmLesson(ctxOf(STAFF), n1.id); } catch (e) { fe = e instanceof ForbiddenError; }
    const cL = await learn.confirmLesson(ctxOf(OWNER), n1.id);
    const lO = await learn.listLessons(ctxOf(OWNER)), lS = await learn.listLessons(ctxOf(S2));
    const block = await learn.lessonBlock(tid);
    chk("L-3", "confirmLesson: STAFF ⇒ ForbiddenError · OWNER ⇒ CONFIRMED confirmedById · listLessons OWNER ทั้งหมด · s2 (ไม่ใช่ source) ว่าง · lessonBlock มี '[kanban_create_card]' + pattern", fe && cL === true && (await prisma.aiLesson.findUnique({ where: { id: n1.id } }))?.confirmedById === U.owner && lO.length >= 2 && lS.length === 0 && block.includes("[kanban_create_card]") && block.includes("ใส่กำหนดส่ง"), `fe=${fe} cL=${cL} lO=${lO.length} lS=${lS.length} block=${block.slice(0, 60)}`);
    const pv = new Scripted();
    await service.sendMessage(ctxOf(OWNER), { conversationId: convId, text: "สร้างการ์ดอีกใบ" }, { provider: pv });
    const sysPrompt = pv.captured[0]?.find((m) => m.role === "system")?.content ?? "";
    chk("L-4", "system prompt ตอนคุย มีบล็อกบทเรียนที่ยืนยันแล้ว (pattern) · ไม่มีความจำ PENDING", sysPrompt.includes("บทเรียน") && sysPrompt.includes("ใส่กำหนดส่ง") && !sysPrompt.includes("โทรหาคุณสมชาย"), sysPrompt.slice(0, 80));
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
