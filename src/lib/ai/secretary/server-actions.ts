"use server";
// server-actions.ts — ประตูเว็บ (RSC server actions) ของเลขา AI (ใบ S1.14) · คู่กับ route แอป `src/app/api/mobile/secretary/**`
//
// 🔴 ตรรกะอยู่ใน lib ทั้งหมด — ไฟล์นี้ = session (`requireTenant`) + คีย์สิทธิ์ (`ai.chat.send` เหมือน lib/ai/actions.ts) + เพดานอัตรา + lib ตัวเดียวกับ route + DTO/มุมมองตัวเดียวกัน (`./dto` · `./views`)
// 🔴 "use server": export เฉพาะ async function (ห้าม export type/ค่าคงที่ — reference_next_use_server_no_type_export) · ตัวตน/ร้าน/เวลา มาจาก session เท่านั้น
// 🔴 R-S1.14b: ทุก action ผ่าน `checkRateLimitDb` คีย์เดียวกับ route (`sec:<route>:<tenantId>:<userId>`) — เขียน 30/นาที · ส่งข้อความห้อง 10/นาที · อ่าน 60/นาที
// ชื่อ `sec<Verb><Entity>Action` · ผลล้มเหลว = `{ ok:false, error, message, retryAfterSec? }` (ไทย · code เดียวกับ route)
// (ชื่อไฟล์ไม่ใช่ `actions.ts` ตามใบ เพราะ `./actions.ts` = บันทึก/ย้อนของ S1.8 อยู่แล้ว — ดู wo-notes sec-s1.14)
import { after } from "next/server";
import { requireTenant } from "@/lib/core/context";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { assertCan, ForbiddenError, type MembershipCtx } from "@/lib/core/rbac";
import { aiMemberActor } from "../actor";
import { executeProposal, rejectProposal } from "../proposals";
import { executePlan, rejectPlan } from "../plans";
import { listMessages } from "../service";
import { createTask, describeFrequency, listTasks, deleteTask, updateTask, type Channel, type Frequency, type TaskPatch } from "../scheduled";
import { aiBridges, wakeOutbox } from "@/lib/modules/crm";
import { identityOf, normalizeIdentityPatch, sampleSpeech, secretaryOf, updateSecretary, SECRETARY_DEFAULT, type SecretaryIdentity } from "./secretary";
import { getAccess, setAccess } from "./access";
import { closeRoom, getRoom, listRooms, renameRoom, startRoom, type RoomStatus } from "./rooms";
import { runRoomJobs, sendRoomMessage } from "./worker";
import { logOps } from "@/lib/core/ops";
import { claimNewRoom } from "@/app/api/mobile/secretary/_shared"; // SEC S3a.1-S1 R-Z11: กุญแจกันเปิดห้องซ้ำตัวเดียวกับ route
import { addMember, listMembers, removeMember } from "./members";
import { listRules, setRule } from "./approval-gate";
import { listLog, undoAction } from "./actions";
import { editProposal, pendingMemories, confirmMemory, rejectMemory, rejectWithNote } from "./teach";
import { confirmLesson, listLessons, rejectLesson } from "./learn";
import { frequentInstructions, suggestions } from "./suggest";
import { inboxCount, inboxForUser } from "./inbox";
import { quotaStatus } from "./quota";
import { computeDigest, digestForViewer } from "./digest";
import { getNotifyPrefs, setNotifyPref } from "./notify";
import * as dto from "./dto";
import { accessItemsFor, logItemsFor, pendingItemsFor, proposalApprovableBy, roomCardsFor, roomPlansFor } from "./views";

type Fail = { ok: false; error: string; message: string; retryAfterSec?: number };
type Web = Awaited<ReturnType<typeof web>>;
const THAI = /[฀-๿]/;

async function web() {
  const auth = await requireTenant();
  const m: MembershipCtx = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  const tenantId = auth.active.tenantId;
  const userId = auth.user.id;
  return { userId, tenantId, m, conv: { tenantId, actor: aiMemberActor(tenantId, userId, m) } };
}
/** ประตูเว็บของเลขา = คีย์เดียวกับแชท AI เดิม (OWNER/MANAGER ผ่าน · STAFF ต้องมี ai.chat.send) */
async function webAi() {
  const w = await web();
  assertCan(w.m, { module: "ai", action: "ai.chat.send" });
  return w;
}
/** เพดานอัตราคีย์เดียวกับ route — เกิน = Fail `rate_limited` + retryAfterSec · ผ่าน = null */
async function limited(w: Web, route: string, perMinute = 30): Promise<Fail | null> {
  const r = await checkRateLimitDb(`sec:${route}:${w.tenantId}:${w.userId}`, { limit: perMinute, windowMs: 60_000 });
  return r.ok ? null : { ok: false, error: "rate_limited", message: "ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่", retryAfterSec: r.retryAfterSec ?? 60 };
}
const READ = 60;
/** เส้นระดับผู้ใช้ (ไม่ผูกร้าน) — คีย์ `sec:<route>:<userId>` เดียวกับ route (secretary · inbox) ⇒ ถังเดียวกัน (N2) */
async function limitedUser(w: Web, route: string, perMinute = 30): Promise<Fail | null> {
  const r = await checkRateLimitDb(`sec:${route}:${w.userId}`, { limit: perMinute, windowMs: 60_000 });
  return r.ok ? null : { ok: false, error: "rate_limited", message: "ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่", retryAfterSec: r.retryAfterSec ?? 60 };
}
function failOf(e: unknown): Fail {
  if (e instanceof ForbiddenError) return { ok: false, error: "forbidden", message: "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของกิจการ" };
  if (e instanceof Error && THAI.test(e.message) && !/prisma/i.test(e.message)) return { ok: false, error: "invalid", message: e.message.slice(0, 300) };
  return { ok: false, error: "server_error", message: "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง" };
}
const nf = (message: string): Fail => ({ ok: false, error: "not_found", message });
/**
 * worker หลังตอบ — `after()` คืน promise ให้ waitUntil (ห้าม promise ลอย: ถูกแช่แข็งกลางทาง N9) · นอกคำขอ = รอจนจบ · ตัวเก็บตกรายนาทีมีอยู่แล้ว (R-K8b)
 *   SEC S3a.1-S1 R-Z5: รันเฉพาะงานของคำขอนี้ (`jobIds`) ภายใน deadline 240 วิ
 */
async function workAfter(jobId: string): Promise<void> {
  const deadline = Date.now() + 240_000;
  try {
    after(() => runRoomJobs({ jobIds: [jobId], limit: 1, deadline }));
  } catch {
    await runRoomJobs({ jobIds: [jobId], limit: 1, deadline }).catch(() => {});
  }
}
const CMID_MAX = 80;

// ── ตัวตนเลขา ──
export async function secGetSecretaryAction() {
  const w = await web();
  const lim = await limited(w, "secretary-read", READ);
  if (lim) return lim;
  const row = await secretaryOf(w.userId);
  const identity: SecretaryIdentity = row ? identityOf(row) : { ...SECRETARY_DEFAULT, languages: [...SECRETARY_DEFAULT.languages] };
  return dto.secretaryDto(identity, sampleSpeech(identity), !!row);
}
export async function secUpdateSecretaryAction(patch: Record<string, unknown>) {
  const w = await web();
  const lim = await limitedUser(w, "secretary");
  if (lim) return lim;
  try {
    const clean = normalizeIdentityPatch(patch ?? {});
    const identity = identityOf(await updateSecretary(w.userId, clean));
    return { ok: true as const, secretary: dto.secretaryDto(identity, sampleSpeech(identity), true) };
  } catch (e) {
    return failOf(e);
  }
}

// ── ห้องงาน ──
export async function secListRoomsAction(opts?: { status?: RoomStatus; q?: string; take?: number; scope?: "mine" | "tenant" }) {
  const w = await webAi();
  const lim = await limited(w, "rooms-read", READ);
  if (lim) return lim;
  const rows = await listRooms(w.conv, opts);
  return roomCardsFor(w.tenantId, rows);
}
/**
 * เปิดห้องงาน (เว็บ) — SEC S3a.1-S1 R-Z11: รับ `clientMessageId` (≤ 80 · ห้ามมี ":") กันกดซ้ำด้วยกุญแจเดียวกับ route (`claimNewRoom`)
 *   ซ้ำ ⇒ `{ ok:true, duplicate:true, roomId }` ห้องเดิม (ไม่นับงานซ้ำ) · ครั้งแรกยังไม่จบ ⇒ `pending` · job เกิดใน tx ของ startRoom (R-Z3)
 */
export async function secStartRoomAction(input: { instruction: string; systems?: string[]; context?: { chatConversationId?: string; contactId?: string }; clientMessageId?: string }) {
  const w = await webAi();
  const lim = await limited(w, "rooms");
  if (lim) return lim;
  const cmid = typeof input?.clientMessageId === "string" ? input.clientMessageId.trim() : "";
  if (cmid && (cmid.length > CMID_MAX || cmid.includes(":"))) return { ok: false as const, error: "invalid", message: "รหัสกันส่งซ้ำไม่ถูกต้อง" };
  let created = false;
  let claim: Awaited<ReturnType<typeof claimNewRoom>> | null = null;
  try {
    claim = cmid ? await claimNewRoom(w.tenantId, w.userId, cmid) : null;
    if (claim && !claim.first) {
      const roomId = await claim.existingRoomId();
      const room = roomId ? await getRoom(w.conv, roomId) : null;
      if (!room || room.startedById !== w.userId) return { ok: false as const, error: "pending", message: "กำลังเปิดห้องงานนี้อยู่ ลองใหม่อีกครั้ง" };
      return { ok: true as const, duplicate: true as const, roomId: room.id, conversationId: room.conversationId };
    }
    const r = await startRoom(w.conv, { instruction: String(input?.instruction ?? ""), systems: input?.systems, context: input?.context });
    if (!r.ok) {
      await claim?.release();
      return { ok: false as const, error: r.error, message: r.message, resetAt: r.resetAt ?? null };
    }
    created = true;
    await workAfter(r.jobId);
    await claim?.remember(r.roomId);
    return { ok: true as const, roomId: r.roomId, conversationId: r.conversationId, jobsUsed: r.jobsUsed, jobsLimit: r.jobsLimit };
  } catch (e) {
    if (!created && claim) await claim.release().catch((re: unknown) => logOps("WARN", "secretary-web", "secStartRoomAction: คืนกุญแจกันส่งซ้ำไม่สำเร็จ", { detail: String(re) }).catch(() => undefined));
    if (created) await logOps("WARN", "secretary-web", "secStartRoomAction: จดกุญแจกันส่งซ้ำไม่สำเร็จ", { detail: e instanceof Error ? e.message : String(e) }).catch(() => undefined);
    return failOf(e);
  }
}
export async function secGetRoomAction(roomId: string) {
  const w = await webAi();
  const lim = await limited(w, "rooms-read", READ);
  if (lim) return lim;
  const room = await getRoom(w.conv, roomId);
  return room ? { ...dto.roomDto(room, { userId: w.userId, role: w.m.role }), plans: await roomPlansFor(w.conv, room.conversationId) } : null;
}
export async function secListRoomMessagesAction(roomId: string, opts?: { before?: { at: string; id: string }; take?: number }) {
  const w = await webAi();
  const lim = await limited(w, "rooms-read", READ);
  if (lim) return lim;
  const room = await getRoom(w.conv, roomId);
  if (!room) return null;
  const at = opts?.before ? new Date(opts.before.at) : null;
  const before = at && !Number.isNaN(at.getTime()) && typeof opts?.before?.id === "string" ? { at, id: opts.before.id } : null;
  const rows = await listMessages(w.conv, room.conversationId, { before, take: Math.min(Math.max(1, Math.floor(Number(opts?.take)) || 50), 100) });
  return rows.map(dto.messageDto);
}
export async function secSendRoomMessageAction(roomId: string, text: string) {
  const w = await webAi();
  const lim = await limited(w, "send", 10);
  if (lim) return lim;
  const r = await sendRoomMessage(w.conv, roomId, { text: String(text ?? "") });
  if (!r.ok) return { ok: false as const, error: r.error, message: r.message };
  await workAfter(r.jobId);
  return { ok: true as const, messageId: r.messageId, jobId: r.jobId };
}
export async function secCloseRoomAction(roomId: string) {
  const w = await webAi();
  const lim = await limited(w, "room-close");
  if (lim) return lim;
  return { ok: await closeRoom(w.conv, roomId) };
}
export async function secRenameRoomAction(roomId: string, title: string) {
  const w = await webAi();
  const lim = await limited(w, "room-title");
  if (lim) return lim;
  return { ok: await renameRoom(w.conv, roomId, String(title ?? "")) };
}
export async function secListRoomMembersAction(roomId: string) {
  const w = await webAi();
  const lim = await limited(w, "rooms-read", READ);
  if (lim) return lim;
  const rows = await listMembers(w.conv, roomId);
  return rows ? rows.map(dto.memberDto) : null;
}
export async function secAddRoomMemberAction(roomId: string, input: { userId: string; seeHistory?: boolean }) {
  const w = await webAi();
  const lim = await limited(w, "room-members");
  if (lim) return lim;
  const r = await addMember(w.conv, roomId, { userId: String(input?.userId ?? ""), seeHistory: input?.seeHistory === true });
  return r.ok ? { ok: true as const, member: dto.memberDto(r.member) } : r;
}
export async function secRemoveRoomMemberAction(roomId: string, memberUserId: string) {
  const w = await webAi();
  const lim = await limited(w, "room-members");
  if (lim) return lim;
  return removeMember(w.conv, roomId, String(memberUserId ?? ""));
}

// ── ข้อเสนอ · แผน ──
export async function secListRoomProposalsAction(roomId: string) {
  const w = await webAi();
  const lim = await limited(w, "rooms-read", READ);
  if (lim) return lim;
  const room = await getRoom(w.conv, roomId);
  if (!room) return null;
  return pendingItemsFor(w, room.conversationId);
}
export async function secApproveProposalAction(proposalId: string, opts?: { confirm2x?: boolean }) {
  const w = await webAi();
  const lim = await limited(w, "approve");
  if (lim) return lim;
  try {
    const res = await executeProposal(w.m, { tenantId: w.tenantId }, proposalId, { confirm2x: opts?.confirm2x === true, userId: w.userId });
    if (res.ok) wakeOutbox();
    return res;
  } catch {
    return { ok: false, note: "ทำรายการไม่สำเร็จชั่วคราว ลองใหม่อีกครั้ง" };
  }
}
export async function secRejectProposalAction(proposalId: string, input?: { note?: string; remember?: boolean }) {
  const w = await webAi();
  const lim = await limited(w, "reject");
  if (lim) return lim;
  const note = String(input?.note ?? "").trim();
  if (note) return rejectWithNote(w.conv, proposalId, { note, remember: input?.remember === true ? "RULE" : "JOB" });
  const crm = await aiBridges.cancelProposalById(w.tenantId, { userId: w.userId, ...w.m }, proposalId);
  if (crm.handled) return crm.ok ? { ok: true as const } : { ok: false as const, error: "not_pending", message: crm.note };
  return (await rejectProposal(w.conv, proposalId)) ? { ok: true as const } : nf("ไม่พบข้อเสนอนี้ หรือถูกดำเนินการไปแล้ว");
}
export async function secEditProposalAction(proposalId: string, patch: Record<string, unknown>) {
  const w = await webAi();
  const lim = await limited(w, "edit");
  if (lim) return lim;
  const can = await proposalApprovableBy(w, proposalId); // R-S1.14i: แก้ได้เฉพาะผู้ที่อนุมัติได้
  if (can === null) return nf("ไม่พบข้อเสนอนี้ หรือถูกดำเนินการไปแล้ว");
  if (!can) return { ok: false as const, error: "forbidden", message: "แก้ก่อนอนุมัติได้เฉพาะผู้ที่อนุมัติรายการนี้ได้ (เจ้าของหรือผู้จัดการที่มีสิทธิ์)" };
  return editProposal(w.conv, proposalId, patch ?? {});
}
export async function secApprovePlanAction(planId: string, opts?: { confirm2x?: boolean }) {
  const w = await webAi();
  const lim = await limited(w, "approve");
  if (lim) return lim;
  try {
    const res = await executePlan(w.m, { tenantId: w.tenantId }, planId, { confirm2x: opts?.confirm2x === true, userId: w.userId });
    if (res.doneCount > 0) wakeOutbox();
    return res;
  } catch {
    return { ok: false, results: [], doneCount: 0, note: "ทำแผนไม่สำเร็จชั่วคราว ลองใหม่อีกครั้ง" };
  }
}
export async function secRejectPlanAction(planId: string) {
  const w = await webAi();
  const lim = await limited(w, "reject");
  if (lim) return lim;
  return { ok: await rejectPlan(w.conv, planId) };
}

// ── บันทึก · ย้อน ──
export async function secListLogAction(opts?: { module?: string; day?: string; roomId?: string; take?: number }) {
  const w = await webAi();
  const lim = await limited(w, "log", READ);
  if (lim) return lim;
  return logItemsFor(w, await listLog(w.conv, opts));
}
export async function secUndoLogAction(logId: string) {
  const w = await webAi();
  const lim = await limited(w, "undo");
  if (lim) return lim;
  const r = await undoAction(w.conv, logId); // 🔴 ไม่รับ now จากผู้เรียก (RESOLUTIONS §K)
  if (r.ok) wakeOutbox();
  return r;
}

// ── สิทธิ์ต่อระบบ · กฎอนุมัติ ──
export async function secGetAccessAction() {
  const w = await webAi();
  const lim = await limited(w, "access-read", READ);
  if (lim) return lim;
  return accessItemsFor(w.tenantId, await getAccess(w.tenantId));
}
export async function secSetAccessAction(module: string, level: string) {
  const w = await web();
  const lim = await limited(w, "access");
  if (lim) return lim;
  try {
    const levels = await setAccess(w.tenantId, { userId: w.userId, membership: w.m }, module, level);
    return { ok: true as const, items: await accessItemsFor(w.tenantId, levels) };
  } catch (e) {
    return failOf(e);
  }
}
export async function secGetRulesAction() {
  const w = await webAi();
  const lim = await limited(w, "rules-read", READ);
  if (lim) return lim;
  return listRules(w.tenantId);
}
export async function secSetRuleAction(key: string, patch: { enabled?: boolean; limitSatang?: number | null }) {
  const w = await web();
  const lim = await limited(w, "rules");
  if (lim) return lim;
  try {
    return { ok: true as const, rules: await setRule(w.tenantId, { userId: w.userId, membership: w.m, tenantId: w.tenantId }, key, patch ?? {}) };
  } catch (e) {
    return failOf(e);
  }
}

// ── งานประจำ ──
export async function secListScheduledAction() {
  const w = await webAi();
  const lim = await limited(w, "scheduled-read", READ);
  if (lim) return lim;
  const all = await listTasks({ tenantId: w.tenantId });
  return (w.m.role === "OWNER" ? all : all.filter((t) => t.ownerUserId === w.userId)).map((t) => dto.taskDto(t, w.userId, describeFrequency(t.frequency, t.days)));
}
export async function secCreateScheduledAction(input: { instruction: string; hourBkk: number; frequency?: Frequency; days?: number[]; channels?: Channel[] }) {
  const w = await webAi();
  const lim = await limited(w, "scheduled");
  if (lim) return lim;
  try {
    return { ok: true as const, id: (await createTask({ tenantId: w.tenantId }, { ...input, ownerUserId: w.userId })).id };
  } catch (e) {
    return failOf(e);
  }
}
export async function secUpdateScheduledAction(taskId: string, patch: TaskPatch) {
  const w = await webAi();
  const lim = await limited(w, "scheduled");
  if (lim) return lim;
  try {
    const r = await updateTask({ tenantId: w.tenantId, userId: w.userId }, taskId, patch ?? {});
    return r.ok ? { ok: true as const, task: dto.taskDto(r.task, w.userId, describeFrequency(r.task.frequency, r.task.days)) } : nf("ไม่พบงานประจำนี้");
  } catch (e) {
    return failOf(e);
  }
}
export async function secDeleteScheduledAction(taskId: string) {
  const w = await webAi();
  const lim = await limited(w, "scheduled");
  if (lim) return lim;
  const t = (await listTasks({ tenantId: w.tenantId })).find((x) => x.id === taskId);
  const mine = t && (w.m.role === "OWNER" || (t.ownerUserId !== null && t.ownerUserId === w.userId));
  return mine ? { ok: await deleteTask({ tenantId: w.tenantId }, t.id) } : nf("ไม่พบงานประจำนี้");
}

// ── หน้าแรก ──
export async function secListSuggestionsAction() {
  const w = await webAi();
  const lim = await limited(w, "home-read", READ);
  if (lim) return lim;
  return suggestions(w.conv);
}
export async function secListFrequentAction(take = 5) {
  const w = await webAi();
  const lim = await limited(w, "home-read", READ);
  if (lim) return lim;
  return frequentInstructions(w.conv, Math.min(Math.max(1, Math.floor(take) || 5), 20));
}
export async function secListInboxAction(opts?: { tenantId?: string; kind?: "proposal" | "plan" }) {
  const w = await web();
  const lim = await limitedUser(w, "inbox", READ);
  if (lim) return lim;
  return (await inboxForUser(w.userId, opts)).map(dto.inboxItemDto);
}
export async function secGetInboxCountAction() {
  const w = await web();
  const lim = await limited(w, "home-read", READ);
  if (lim) return lim;
  return inboxCount(w.userId);
}
export async function secGetQuotaAction() {
  const w = await webAi();
  const lim = await limited(w, "home-read", READ);
  if (lim) return lim;
  return dto.quotaDto(await quotaStatus(w.tenantId));
}
export async function secGetDigestAction() {
  const w = await webAi();
  const lim = await limited(w, "digest", READ);
  if (lim) return lim;
  const [d, access] = await Promise.all([computeDigest(w.tenantId), getAccess(w.tenantId)]);
  return digestForViewer(d, w.m, w.userId, access);
}

// ── บทเรียน · ความจำ ──
export async function secListLessonsAction(status?: "PENDING" | "CONFIRMED" | "REJECTED") {
  const w = await webAi();
  const lim = await limited(w, "lessons-read", READ);
  if (lim) return lim;
  return (await listLessons(w.conv, status ? { status } : undefined)).map(dto.lessonDto);
}
export async function secConfirmLessonAction(lessonId: string) {
  const w = await webAi();
  const lim = await limited(w, "lessons");
  if (lim) return lim;
  try {
    return { ok: await confirmLesson(w.conv, lessonId) };
  } catch (e) {
    return failOf(e);
  }
}
export async function secRejectLessonAction(lessonId: string) {
  const w = await webAi();
  const lim = await limited(w, "lessons");
  if (lim) return lim;
  try {
    return { ok: await rejectLesson(w.conv, lessonId) };
  } catch (e) {
    return failOf(e);
  }
}
export async function secListPendingMemoriesAction() {
  const w = await webAi();
  const lim = await limited(w, "memories-read", READ);
  if (lim) return lim;
  return pendingMemories(w.conv);
}
export async function secConfirmMemoryAction(memoryId: string) {
  const w = await webAi();
  const lim = await limited(w, "memories");
  if (lim) return lim;
  return { ok: await confirmMemory(w.conv, memoryId) };
}
export async function secRejectMemoryAction(memoryId: string) {
  const w = await webAi();
  const lim = await limited(w, "memories");
  if (lim) return lim;
  return { ok: await rejectMemory(w.conv, memoryId) };
}

// ── แจ้งเตือน ──
export async function secGetNotifyAction() {
  const w = await web();
  const lim = await limited(w, "notify-read", READ);
  if (lim) return lim;
  return getNotifyPrefs(w.userId, w.tenantId);
}
export async function secSetNotifyAction(kind: string, mode: string, allTenants = false) {
  const w = await web();
  const lim = await limited(w, "notify");
  if (lim) return lim;
  try {
    return { ok: true as const, prefs: await setNotifyPref(w.userId, { tenantId: allTenants ? null : w.tenantId, kind, mode }) };
  } catch (e) {
    return failOf(e);
  }
}
