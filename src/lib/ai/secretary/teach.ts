// teach.ts — ตีกลับพร้อมเหตุผล + สอน + แก้ก่อนอนุมัติ (ใบ S1.10 · แบบ C4 + B6 · สัญญา docs/modules/31-secretary.md §5.10 ·
//   RESOLUTIONS R-K3 · §C Q9 · R-S1.6a/b · R-S1.12e)
//
// - `rejectWithNote` — ข้อเสนอ PENDING ในบทสนทนาที่ผู้ตีกลับเห็น (room-aware) → REJECTED + resultNote "ตีกลับ: <note>" +
//   ข้อความระบบในห้อง "🔁 <ชื่อ> ตีกลับ: <note>" (ASSISTANT · authorUserId = "system" — R-S1.6b: ไม่นับ unread · ไม่เข้าประวัติโมเดล) ·
//   remember JOB = จบแค่งานนี้ (ไม่จดความจำ/บทเรียน) · RULE = ข้อเท็จจริงของร้าน (OWNER ยืนยันทันที · คนอื่น = PENDING รอ OWNER)
//   + บทเรียน (`learn.noteLesson`) · ทุกการตีกลับ ⇒ `learn.recordOutcome("REJECTED")`
// - `editProposal` (Q9) — เฉพาะ kind ของทะเบียน op (`account.*` `kanban.*` `member.*` `crm.*` `pos.*` · ตรวจด้วย zod ของ op) ·
//   kind เขียนมือ (รวม `chat.send` — R-S1.12e) = not_editable · บันทึก `payload._edited = { at, byUserId, before }` (before = input ก่อนแก้ครั้งแรก)
//   ⇒ ตอนอนุมัติ `learn.recordExecutedProposal` ติดป้าย EDITED
// - ความจำ PENDING: `pendingMemories` / `confirmMemory` / `rejectMemory` — OWNER เท่านั้น (คนอื่น = [] / false)
//
// 🔴 ไม่ import `../service` · `../proposals` (proposals → learn แบบ dynamic · teach ใช้แค่ตัวอ่านบทสนทนา) · ข้อความถึงผู้ใช้เป็นไทย

import type { ApiOp } from "@/lib/api/op";
import { prisma, tenantDb } from "@/lib/core/db";
import { isPhonePlaceholderEmail } from "@/lib/core/phone-auth";
import { logOps } from "@/lib/core/ops";
import * as crmSvc from "@/lib/modules/crm";
import { memberToolOps } from "@/lib/modules/member/api/tools";
import { posToolOps } from "@/lib/modules/pos/api/tools";
import { accountToolOps } from "../account-ops";
import { actorProblem, type AiMemberActor } from "../actor";
import { contactDataRefusal, findContactData } from "../contact-data";
import { canForgetMemory, canSeeMemory, memoryAuthorOf, memorySightOf, type ConvCtx } from "../conversation-owner";
import { canSeeConversationById } from "../conversations";
import { kanbanToolOps } from "../kanban-ops";
import { MEMORY_PENDING, rememberFact } from "../memory";
import { noteLesson, recordOutcome } from "./learn";
import { SYSTEM_AUTHOR, visibleSinceFor, withinSight } from "./members";

const NOTE_MAX = 500;
const SUMMARY_MAX = 1000;

const MSG = {
  not_found: "ไม่พบข้อเสนอนี้ (อาจถูกลบไปแล้ว)",
  not_pending: "ข้อเสนอนี้ถูกดำเนินการหรือปิดไปแล้ว",
  empty: "บอกเหตุผลที่ตีกลับสั้น ๆ ก่อน เลขาจะได้แก้ให้ถูก",
  not_editable: "แก้ก่อนอนุมัติได้เฉพาะงานของระบบบัญชี บอร์ดงาน สมาชิก CRM และขายหน้าร้าน — งานนี้ให้ตีกลับแล้วสั่งใหม่",
  invalid: "ข้อมูลที่แก้ไม่ถูกต้อง",
  forbidden: "บัญชีนี้ยกเลิกข้อเสนอนี้ไม่ได้ — ต้องเป็นผู้ที่มีสิทธิ์ยืนยันรายการนี้",
} as const;

type RejectError = "not_found" | "not_pending" | "empty" | "pii" | "forbidden";
type EditError = "not_found" | "not_pending" | "not_editable" | "invalid";

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const oneLine = (s: string, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function memberActorOf(ctx: ConvCtx): AiMemberActor | null {
  if (actorProblem(ctx)) return null;
  return ctx.actor.kind === "member" ? ctx.actor : null;
}
const isOwner = (a: AiMemberActor | null) => a?.membership.role === "OWNER";

async function displayNameOf(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }).catch(() => null);
  return u?.name?.trim() || (isPhonePlaceholderEmail(u?.email) ? "" : u?.email?.split("@")[0]) || "สมาชิก"; // R-Z26 ◂
}

/** ข้อเสนอที่ผู้ดูนี้เห็น (ห้องตัวเอง · ห้องเลขาร่วม · R-S1.6a seeHistory) — ประตู CRM (ยกเลิกได้จากประตูของ CRM เท่านั้น) = มองไม่เห็น */
async function visibleProposal(ctx: ConvCtx, id: string) {
  const pid = typeof id === "string" ? id.trim() : "";
  if (!pid || !memberActorOf(ctx)) return null;
  const row = await tenantDb({ tenantId: ctx.tenantId }).aiProposal.findFirst({
    where: { id: pid },
    select: { id: true, kind: true, summary: true, payload: true, status: true, conversationId: true, createdAt: true },
  });
  if (!row) return null;
  if (await isDoorRow(ctx.tenantId, row)) return null; // CRM C3.4 — เหมือน rejectProposal · SEC S3a.1-S2 R-Z13: ห้องเลขา = ทางทั่วไป ◂
  if (!(await canSeeConversationById(ctx, row.conversationId))) return null; // S1.4 R-K1
  if (!withinSight(await visibleSinceFor(ctx, row.conversationId), row.createdAt)) return null; // S1.6 R-S1.6a
  return row;
}

// SEC S3a.1-S2 ▸ R-Z13/R-Z20: ข้อเสนอของ "ประตู CRM" = ชนิด CRM ที่ **ไม่ได้** อยู่ในห้องเลขา (ห้องเลขาเดินทางทั่วไป · R-Z13) ◂
async function isDoorRow(tenantId: string, row: { kind: string; payload: unknown; conversationId: string }): Promise<boolean> {
  if (!crmSvc.aiBridges.isCrmDoorKind(row.kind, row.payload)) return false;
  return !(await tenantDb({ tenantId }).aiRoom.findFirst({ where: { conversationId: row.conversationId }, select: { id: true } }));
}

/**
 * SEC S3a.1-S2 ▸ R-Z20: ตีกลับ/ยกเลิกข้อเสนอแบบเดียวทั้งแอปและเว็บ (มีหรือไม่มีเหตุผล) — ข้อผิดพลาดแยกได้:
 *   ไม่พบ/มองไม่เห็น ⇒ not_found · ไม่ PENDING ⇒ not_pending · ประตู CRM ไม่ให้ยกเลิก (ไม่มีสิทธิ์) ⇒ forbidden
 *   ข้อเสนอประตู CRM: ยกเลิกผ่าน `cancelProposalById` ด้วยสิทธิ์ของคนกด แล้วจึงบันทึกเหตุผล (ถ้ามี) ลงแถว ◂
 */
export async function rejectFor(
  ctx: ConvCtx,
  proposalId: string,
  input?: { note?: string; remember?: "JOB" | "RULE" },
): Promise<{ ok: true; memoryId?: string } | { ok: false; error: RejectError; message: string }> {
  const actor = memberActorOf(ctx);
  const pid = typeof proposalId === "string" ? proposalId.trim() : "";
  if (!actor || !pid) return { ok: false, error: "not_found", message: MSG.not_found };
  const raw = await tenantDb({ tenantId: ctx.tenantId }).aiProposal.findFirst({ where: { id: pid }, select: { id: true, kind: true, payload: true, conversationId: true, status: true } });
  if (!raw) return { ok: false, error: "not_found", message: MSG.not_found };
  const note = oneLine(input?.note ?? "", NOTE_MAX);
  if (!(await isDoorRow(ctx.tenantId, raw))) {
    if (note) return rejectWithNote(ctx, pid, { note, remember: input?.remember === "RULE" ? "RULE" : "JOB" });
    const row = await visibleProposal(ctx, pid);
    if (!row) return { ok: false, error: "not_found", message: MSG.not_found };
    if (row.status !== "PENDING") return { ok: false, error: "not_pending", message: MSG.not_pending };
    const res = await tenantDb({ tenantId: ctx.tenantId }).aiProposal.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "REJECTED" } });
    if (res.count !== 1) return { ok: false, error: "not_pending", message: MSG.not_pending };
    return { ok: true };
  }
  // ประตู CRM
  if (note && input?.remember === "RULE") {
    const kinds = findContactData(note);
    if (kinds.length > 0) return { ok: false, error: "pii", message: contactDataRefusal(kinds, "เป็นกติกาของร้าน") };
  }
  const m = actor.membership;
  const r = await crmSvc.aiBridges.cancelProposalById(ctx.tenantId, { userId: actor.userId, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions }, pid);
  if (!r.handled) return { ok: false, error: "not_found", message: MSG.not_found };
  if (!r.ok) {
    const now = await tenantDb({ tenantId: ctx.tenantId }).aiProposal.findFirst({ where: { id: pid }, select: { status: true } });
    if (now?.status === "PENDING") return { ok: false, error: "forbidden", message: r.note || MSG.forbidden };
    return { ok: false, error: "not_pending", message: r.note || MSG.not_pending };
  }
  if (!note) return { ok: true };
  // SEC S3a.1-S2 ▸ R-Z34 (RC1 L3): ทาง CRM+note = ผลเดียวกับทางทั่วไป — บันทึกเหตุผล · ข้อความ "🔁 ตีกลับ" ในบทสนทนา (ถ้าเป็นบทสนทนาของผู้ช่วย) ·
  //   recordOutcome · กติกา (RULE) + noteLesson ◂
  const name = await displayNameOf(actor.userId);
  await tenantDb({ tenantId: ctx.tenantId }).aiProposal.updateMany({ where: { id: pid, status: "REJECTED" }, data: { resultNote: `ตีกลับ: ${note}` } });
  const conv = await tenantDb({ tenantId: ctx.tenantId }).aiConversation.findFirst({ where: { id: raw.conversationId }, select: { id: true } });
  if (conv) {
    await prisma.aiMessage
      .create({ data: { tenantId: ctx.tenantId, conversationId: conv.id, role: "ASSISTANT", content: `🔁 ${name} ตีกลับ: ${note}`, tokensIn: 0, tokensOut: 0, authorUserId: SYSTEM_AUTHOR } })
      .catch((e: unknown) => logOps("WARN", "ai", "secretary.teach: เขียนข้อความตีกลับไม่สำเร็จ", { tenantId: ctx.tenantId, detail: String(e).slice(0, 300) }).catch(() => {}));
  }
  await recordOutcome(ctx.tenantId, { proposalId: pid, conversationId: raw.conversationId, kind: raw.kind, outcome: "REJECTED", note, before: isRec(raw.payload) ? raw.payload.input : undefined });
  if (input?.remember !== "RULE") return { ok: true };
  let memoryId: string | undefined;
  try {
    memoryId = (await rememberFact(ctx, note, { pending: !isOwner(actor) })).id;
  } catch (e) {
    await logOps("WARN", "ai", "secretary.teach: จดกติกาจากการตีกลับไม่สำเร็จ", { tenantId: ctx.tenantId, detail: String(e).slice(0, 300) }).catch(() => {});
  }
  try {
    const summary = (await tenantDb({ tenantId: ctx.tenantId }).aiProposal.findFirst({ where: { id: pid }, select: { summary: true } }))?.summary ?? "";
    await noteLesson(ctx.tenantId, { kind: raw.kind, pattern: note, example: summary, sourceRoomId: null, sourceUserId: actor.userId });
  } catch (e) {
    await logOps("WARN", "ai", "secretary.teach: บันทึกบทเรียนไม่สำเร็จ", { tenantId: ctx.tenantId, detail: String(e).slice(0, 300) }).catch(() => {});
  }
  return memoryId ? { ok: true, memoryId } : { ok: true };
}

// ─────────────────────────────── ตีกลับพร้อมเหตุผล ───────────────────────────────

export async function rejectWithNote(
  ctx: ConvCtx,
  proposalId: string,
  input: { note: string; remember: "JOB" | "RULE" },
): Promise<{ ok: true; memoryId?: string } | { ok: false; error: RejectError; message: string }> {
  const actor = memberActorOf(ctx);
  const row = await visibleProposal(ctx, proposalId);
  if (!actor || !row) return { ok: false, error: "not_found", message: MSG.not_found };
  if (row.status !== "PENDING") return { ok: false, error: "not_pending", message: MSG.not_pending };
  const note = oneLine(input?.note ?? "", NOTE_MAX);
  if (!note) return { ok: false, error: "empty", message: MSG.empty };
  const rule = input?.remember === "RULE";
  if (rule) {
    // กติกาเป็นข้อเท็จจริงของร้าน (ทุกคนเห็น) ⇒ ด่านข้อมูลติดต่อเดียวกับ remember_fact — ไม่ตีกลับ ไม่จด ให้แก้ข้อความก่อน
    const kinds = findContactData(note);
    if (kinds.length > 0) return { ok: false, error: "pii", message: contactDataRefusal(kinds, "เป็นกติกาของร้าน") };
  }

  const name = await displayNameOf(actor.userId);
  const done = await prisma.$transaction(async (tx) => {
    const res = await tx.aiProposal.updateMany({
      where: { id: row.id, tenantId: ctx.tenantId, status: "PENDING" },
      data: { status: "REJECTED", resultNote: `ตีกลับ: ${note}` },
    });
    if (res.count !== 1) return false;
    await tx.aiMessage.create({
      data: { tenantId: ctx.tenantId, conversationId: row.conversationId, role: "ASSISTANT", content: `🔁 ${name} ตีกลับ: ${note}`, tokensIn: 0, tokensOut: 0, authorUserId: SYSTEM_AUTHOR },
    });
    await tx.aiConversation.updateMany({ where: { id: row.conversationId, tenantId: ctx.tenantId }, data: { updatedAt: new Date() } });
    return true;
  });
  if (!done) return { ok: false, error: "not_pending", message: MSG.not_pending }; // แพ้การแข่ง (มีคนอนุมัติ/ปิดก่อน)

  await recordOutcome(ctx.tenantId, { proposalId: row.id, conversationId: row.conversationId, kind: row.kind, outcome: "REJECTED", note, before: isRec(row.payload) ? row.payload.input : undefined });
  if (!rule) return { ok: true };

  let memoryId: string | undefined;
  try {
    // OWNER ⇒ ข้อเท็จจริงของร้านยืนยันทันที · คนอื่น ⇒ `o~<ผู้ตีกลับ>~` status PENDING รอ OWNER (R-K3)
    memoryId = (await rememberFact(ctx, note, { pending: !isOwner(actor) })).id;
  } catch (e) {
    // ข้อเสนอถูกตีกลับแล้ว — จดไม่สำเร็จ (เช่น ความจำของร้านเต็ม 100) ไม่ย้อนการตีกลับ · ผู้เรียกเห็นว่าไม่มี memoryId
    await logOps("WARN", "ai", "secretary.teach: จดกติกาจากการตีกลับไม่สำเร็จ", { tenantId: ctx.tenantId, detail: String(e).slice(0, 300) }).catch(() => {});
  }
  try {
    const roomId = (await tenantDb({ tenantId: ctx.tenantId }).aiRoom.findFirst({ where: { conversationId: row.conversationId }, select: { id: true } }))?.id ?? null;
    await noteLesson(ctx.tenantId, { kind: row.kind, pattern: note, example: row.summary, sourceRoomId: roomId, sourceUserId: actor.userId });
  } catch (e) {
    await logOps("WARN", "ai", "secretary.teach: บันทึกบทเรียนไม่สำเร็จ", { tenantId: ctx.tenantId, detail: String(e).slice(0, 300) }).catch(() => {});
  }
  return memoryId ? { ok: true, memoryId } : { ok: true };
}

// ─────────────────────────────── แก้ก่อนอนุมัติ (Q9) ───────────────────────────────

/** ทะเบียน op ที่แก้ก่อนอนุมัติได้ — prefix ของ kind → op ที่เปิดเป็นเครื่องมือ (แหล่งเดียวกับ dispatch ของแต่ละโมดูล) */
const EDITABLE_REGISTRIES: { prefix: string; ops: () => ApiOp[] }[] = [
  { prefix: "account.", ops: accountToolOps },
  { prefix: "kanban.", ops: kanbanToolOps },
  { prefix: "member.", ops: memberToolOps },
  { prefix: "crm.", ops: () => crmSvc.crmApi.CRM_OPS.filter((o) => o.tool) },
  { prefix: "pos.", ops: posToolOps },
];

/** op ของทะเบียนที่ตรงกับ kind (`<prefix><op id>` · ไม่ใช่ read · มี schema) — ไม่ตรง = null */
function editableOpOf(kind: string): ApiOp | null {
  const reg = EDITABLE_REGISTRIES.find((r) => kind.startsWith(r.prefix));
  if (!reg) return null;
  const opId = kind.slice(reg.prefix.length);
  const op = reg.ops().find((o) => o.id === opId);
  return op && op.kind !== "read" && op.input ? op : null;
}

/** ข้อความไทยของ issue แรก ๆ ของ zod */
function issuesTh(issues: { path: PropertyKey[]; message: string }[]): string {
  const head = issues.slice(0, 3).map((i) => (i.path.length > 0 ? `${i.path.map(String).join(".")}: ${i.message}` : i.message));
  return `${MSG.invalid} — ${head.join(" · ")}`;
}

/** ตรวจ input ของข้อเสนอด้วย zod ของ op ในทะเบียน (`op.input.safeParse`) — kind เขียนมือ = not_editable */
export function validateProposalInput(kind: string, input: unknown): { ok: true; input: unknown } | { ok: false; error: "not_editable" | "invalid"; message: string } {
  const op = editableOpOf(String(kind ?? ""));
  if (!op?.input) return { ok: false, error: "not_editable", message: MSG.not_editable };
  const parsed = op.input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", message: issuesTh(parsed.error.issues) };
  return { ok: true, input: parsed.data };
}

const RESERVED_TOP = new Set(["opId", "input", "params", "systemId", "_edited", "requestedByUserId"]);

export async function editProposal(
  ctx: ConvCtx,
  proposalId: string,
  patch: Record<string, unknown>,
): Promise<{ ok: true; payload: unknown; summary: string } | { ok: false; error: EditError; message: string }> {
  const actor = memberActorOf(ctx);
  const row = await visibleProposal(ctx, proposalId);
  if (!actor || !row) return { ok: false, error: "not_found", message: MSG.not_found };
  if (row.status !== "PENDING") return { ok: false, error: "not_pending", message: MSG.not_pending };
  const payload = isRec(row.payload) ? row.payload : {};
  // kind เขียนมือ (รวม chat.send · R-S1.12e) หรือ payload ที่ opId ไม่ตรง kind = แก้ไม่ได้
  const op = editableOpOf(row.kind);
  if (!op || (typeof payload.opId === "string" && !row.kind.endsWith(`.${payload.opId}`)) || !isRec(payload.input)) {
    return { ok: false, error: "not_editable", message: MSG.not_editable };
  }
  if (!isRec(patch) || Object.keys(patch).length === 0) return { ok: false, error: "invalid", message: `${MSG.invalid} — ไม่มีช่องที่แก้` };

  const before = payload.input;
  const merged: Record<string, unknown> = { ...before, ...patch };
  const checked = validateProposalInput(row.kind, merged);
  if (!checked.ok) return { ok: false, error: checked.error, message: checked.message };

  const prevEdited = isRec(payload._edited) ? payload._edited : null;
  const next: Record<string, unknown> = { ...payload, input: merged };
  // ช่องที่ทะเบียนแตกไว้ชั้นบนของ payload (การ์ดแสดงผล) ให้ตรงกับ input ใหม่
  for (const k of Object.keys(patch)) if (k in payload && !RESERVED_TOP.has(k)) next[k] = merged[k];
  next._edited = { at: new Date().toISOString(), byUserId: actor.userId, before: prevEdited && "before" in prevEdited ? prevEdited.before : before };

  // สรุปบนการ์ด: patch เปลี่ยน title/name ⇒ แทนค่าเดิมในสรุป (ไม่พบค่าเดิม = ต่อท้าย "แก้เป็น")
  const field = typeof patch.title === "string" ? "title" : typeof patch.name === "string" ? "name" : null;
  let summary: string | null = null;
  if (field) {
    const oldVal = typeof before[field] === "string" ? (before[field] as string) : "";
    const newVal = oneLine(patch[field] as string, 300);
    summary = (oldVal && row.summary.includes(oldVal) ? row.summary.split(oldVal).join(newVal) : `${row.summary} · แก้เป็น: ${newVal}`).slice(0, SUMMARY_MAX);
  }
  // S1.14 R-S1.14i ▸ ผู้อนุมัติเห็นว่าแก้อะไร: ต่อท้าย "(แก้แล้ว: <ช่อง>=<ค่า> …)" ของช่องที่ค่าเปลี่ยนจากต้นฉบับ (แทนวงเล็บเดิมของการแก้ครั้งก่อน) ◂
  const original = isRec(next._edited) && isRec((next._edited as Record<string, unknown>).before) ? ((next._edited as Record<string, unknown>).before as Record<string, unknown>) : before;
  const changed = Object.keys(merged).filter((k) => JSON.stringify(merged[k]) !== JSON.stringify(original[k]));
  if (changed.length > 0) {
    const show = (v: unknown) => oneLine(typeof v === "string" ? v : JSON.stringify(v) ?? "", 40);
    const note = ` (แก้แล้ว: ${changed.slice(0, 5).map((k) => `${k}=${show(merged[k])}`).join(" · ")}${changed.length > 5 ? " …" : ""})`;
    const cur = summary ?? row.summary;
    const cut = cur.lastIndexOf(" (แก้แล้ว: ");
    const base = cut >= 0 ? cur.slice(0, cut) : cur; // N3: ตัดวงเล็บของการแก้ครั้งก่อนทิ้งเสมอ (แก้ซ้ำ = ไม่ซ้อน)
    summary = `${base.slice(0, Math.max(0, SUMMARY_MAX - note.length))}${note}`;
  }
  const res = await tenantDb({ tenantId: ctx.tenantId }).aiProposal.updateMany({
    where: { id: row.id, status: "PENDING" },
    data: { payload: next as never, ...(summary ? { summary } : {}) },
  });
  if (res.count !== 1) return { ok: false, error: "not_pending", message: MSG.not_pending };
  return { ok: true, payload: next, summary: summary ?? row.summary };
}

// ─────────────────────────────── ความจำที่รอเจ้าของยืนยัน ───────────────────────────────

/** ความจำ PENDING ของร้าน (เก่า→ใหม่) — OWNER เท่านั้น (คนอื่น = []) */
export async function pendingMemories(ctx: ConvCtx): Promise<{ id: string; content: string; createdAt: Date; byUserId: string | null }[]> {
  if (!isOwner(memberActorOf(ctx))) return [];
  const sight = memorySightOf(ctx);
  const rows = await tenantDb({ tenantId: ctx.tenantId }).aiMemory.findMany({
    where: { status: MEMORY_PENDING },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, content: true, createdAt: true },
  });
  return rows.filter((r) => canSeeMemory(sight, r)).map((r) => ({ id: r.id, content: r.content, createdAt: r.createdAt, byUserId: memoryAuthorOf(r.id) }));
}

/** OWNER · PENDING → null (ยืนยันแล้ว — เข้า prompt ของทุกคนในร้าน) · อื่น/ไม่พบ = false */
export async function confirmMemory(ctx: ConvCtx, id: string): Promise<boolean> {
  if (!isOwner(memberActorOf(ctx))) return false;
  const res = await tenantDb({ tenantId: ctx.tenantId }).aiMemory.updateMany({ where: { id: String(id ?? ""), status: MEMORY_PENDING }, data: { status: null } });
  return res.count > 0;
}

/** OWNER · ลบความจำของร้าน (รอยืนยันหรือยืนยันแล้ว — ไม่รวมความจำส่วนตัวของคนอื่น) · อื่น/ไม่พบ = false */
export async function rejectMemory(ctx: ConvCtx, id: string): Promise<boolean> {
  if (!isOwner(memberActorOf(ctx))) return false;
  const memId = String(id ?? "").trim();
  if (!memId || !canForgetMemory(memorySightOf(ctx), memId)) return false;
  const res = await tenantDb({ tenantId: ctx.tenantId }).aiMemory.deleteMany({ where: { id: memId } });
  return res.count > 0;
}
