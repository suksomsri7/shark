// dto.ts — รูปข้อมูลที่ส่งถึงแอป/เว็บของเลขา (ใบ S1.14 · pure · ไม่อ่านฐาน · ไม่ import อะไรนอกจากชนิด + ตัวช่วย pure)
//
// 🔴 X10 (COMMON §C.6 · docs/api/SECRETARY-API.md กติกาข้อ 5): ไม่มี token/คีย์/codeHash/เบอร์เต็มของคนอื่น/ต้นทุน/micro-dollar · ไม่มี payload ดิบของข้อเสนอ
//    (ยกเว้น `input` ของ kind ที่แก้ก่อนอนุมัติได้ — ข้อมูลที่ผู้อนุมัติต้องเห็นเพื่อแก้) · เวลาเป็น ISO (Response.json แปลง Date เอง) · เงินเป็นสตางค์
// route (`src/app/api/mobile/secretary/**`) และ server actions (`./server-actions.ts`) ใช้ตัวเดียวกัน — รูปเดียวทั้งแอปและเว็บ
import type { AiActionLog, AiLesson, AiMessage, AiPlan, AiProposal, AiScheduledTask } from "@prisma/client";
import { classOfKind } from "./kind-class";
import { FREE_PACK } from "./pack";
import type { RoomCard, RoomStatus } from "./rooms";
import type { RoomMemberRow } from "./members";
import type { InboxItem } from "./inbox";
import type { QuotaStatus } from "./quota";
import type { SecretaryIdentity } from "./identity";

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function secretaryDto(identity: SecretaryIdentity, sample: string, saved: boolean) {
  return { name: identity.name, suffix: identity.suffix, tone: identity.tone, languages: identity.languages, sample, saved };
}

export function roomCardDto(r: RoomCard) {
  return {
    id: r.id,
    conversationId: r.conversationId,
    title: r.title,
    status: r.status,
    systems: r.systems,
    startedById: r.startedById,
    startedByName: r.startedByName,
    memberIds: r.memberIds,
    unread: r.unread,
    updatedAt: r.updatedAt,
    closedAt: r.closedAt,
  };
}

export function memberDto(m: RoomMemberRow) {
  return { userId: m.userId, name: m.name, role: m.role, addedById: m.addedById, addedAt: m.addedAt, seeHistory: m.seeHistory };
}

/** ห้องเดียว — contextJson ส่งเฉพาะรหัสห้องลูกค้า/ผู้ติดต่อ (ids) */
export function roomDto(
  r: { id: string; conversationId: string; title: string; startedById: string; systems: string[]; contextJson: unknown; closedAt: Date | null; createdAt: Date; updatedAt: Date; status: RoomStatus; members: RoomMemberRow[] },
  viewer: { userId: string; role: string },
) {
  const c = obj(r.contextJson);
  const context =
    typeof c.chatConversationId === "string"
      ? { chatConversationId: c.chatConversationId, ...(typeof c.contactId === "string" ? { contactId: c.contactId } : {}) }
      : null;
  const manage = viewer.role === "OWNER" || viewer.userId === r.startedById;
  return {
    id: r.id,
    conversationId: r.conversationId,
    title: r.title,
    status: r.status,
    systems: r.systems,
    startedById: r.startedById,
    context,
    members: r.members.map(memberDto),
    canManage: manage,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    closedAt: r.closedAt,
  };
}

/** ข้อความในห้อง — ไม่มีจำนวน token (ต้นทุน) · ข้อความระบบ (`authorUserId = "system"`) ติดธง `system` */
export function messageDto(m: Pick<AiMessage, "id" | "role" | "content" | "authorUserId" | "createdAt">) {
  return { id: m.id, role: m.role, content: m.content, authorUserId: m.authorUserId ?? null, system: m.authorUserId === "system", createdAt: m.createdAt };
}

/** ข้อเสนอรออนุมัติ — ไม่มี payload ดิบ · `input` เฉพาะ kind ของทะเบียน op (แก้ก่อนอนุมัติได้ · Q9) · ชั้นความเสี่ยงจาก `classOfKind` */
export function proposalDto(p: Pick<AiProposal, "id" | "kind" | "risk" | "summary" | "payload" | "createdAt" | "expiresAt">, why?: string) {
  const payload = obj(p.payload);
  const input = typeof payload.opId === "string" && payload.opId ? obj(payload.input) : null;
  const k = classOfKind(p.kind);
  return {
    id: p.id,
    type: "proposal" as const,
    kind: p.kind,
    risk: p.risk === "DESTRUCTIVE" ? "DESTRUCTIVE" : "NORMAL",
    summary: p.summary,
    class: { destructive: k.destructive, money: k.money, customerFacing: k.customerFacing, piiExport: k.piiExport },
    /** สัญญาจอ A3/A4 (ผู้คุม S2.4) — ชั้นที่การ์ดแสดงป้าย */
    classes: { money: k.money, customerFacing: k.customerFacing, destructive: k.destructive },
    /** เหตุผลไทยว่าทำไมต้องอนุมัติ (`whyApproval` + กฎของร้าน — ข้อความเดียวกับกล่องรวม) · ไม่ส่ง = ไม่มี */
    ...(why ? { why } : {}),
    /** แก้ก่อนอนุมัติได้ = kind ของทะเบียน op เท่านั้น (Q9) · chat.send / kind เขียนมือ = false */
    editable: input !== null,
    ...(input !== null ? { input } : {}),
    edited: !!payload._edited,
    createdAt: p.createdAt,
    expiresAt: p.expiresAt,
  };
}

/** แผนหลายขั้นรออนุมัติ — ขั้นแสดงแค่ kind + summary (payload ของขั้นไม่ออก) */
export function planDto(p: Pick<AiPlan, "id" | "title" | "hasDestructive" | "stepsJson" | "createdAt" | "expiresAt">) {
  const steps = (Array.isArray(p.stepsJson) ? p.stepsJson : [])
    .map((s) => obj(s))
    .filter((s) => typeof s.kind === "string" && typeof s.summary === "string")
    .map((s) => ({ kind: s.kind as string, summary: s.summary as string }));
  return { id: p.id, type: "plan" as const, title: p.title, hasDestructive: p.hasDestructive, steps, createdAt: p.createdAt, expiresAt: p.expiresAt };
}

export type PlanStepStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
/**
 * แผนสำหรับการ์ดขั้น (A3) — สถานะขั้นจาก stepsJson (PENDING/DONE/FAILED ที่ executePlan เขียน) +
 *   แผน RUNNING: ขั้น PENDING แรก = RUNNING · ขั้น PENDING หลังขั้นที่ FAILED = SKIPPED (executePlan หยุดที่ขั้นล้ม)
 */
export function planCardDto(p: Pick<AiPlan, "id" | "title" | "status" | "stepsJson">) {
  let failed = false;
  let runningSet = false;
  const steps = (Array.isArray(p.stepsJson) ? p.stepsJson : [])
    .map((x) => obj(x))
    .filter((x) => typeof x.kind === "string" && typeof x.summary === "string")
    .map((x) => {
      const raw = x.status === "DONE" || x.status === "FAILED" ? (x.status as PlanStepStatus) : "PENDING";
      let status: PlanStepStatus = raw;
      if (raw === "FAILED") failed = true;
      else if (raw === "PENDING" && failed) status = "SKIPPED";
      else if (raw === "PENDING" && p.status === "RUNNING" && !runningSet) {
        status = "RUNNING";
        runningSet = true;
      }
      return { kind: x.kind as string, summary: x.summary as string, status };
    });
  return { id: p.id, title: p.title, status: p.status, steps };
}

/** บันทึกการกระทำ (B5) — ไม่มี payload (ids ภายใน) · `canUndo` = ยังอยู่ในกรอบ 24 ชม. และยังไม่ย้อน (สิทธิ์จริงตรวจตอนกด) */
export function logDto(l: AiActionLog, now: Date, link: string | null = null) {
  return {
    id: l.id,
    kind: l.kind,
    module: l.module,
    summary: l.summary,
    roomId: l.roomId,
    proposalId: l.proposalId,
    userId: l.userId,
    approverId: l.approverId,
    entity: l.entityType && l.entityId ? { type: l.entityType, id: l.entityId } : null,
    /** ทางเปิดของจริงในแอป (WebView `?open=` · พาธใต้ /app) — ไม่รู้ = null */
    link,
    undoableUntil: l.undoableUntil,
    undoneAt: l.undoneAt,
    canUndo: !l.undoneAt && !!l.undoableUntil && l.undoableUntil.getTime() >= now.getTime(),
    createdAt: l.createdAt,
  };
}

export function taskDto(t: AiScheduledTask, viewerId: string, describe: string) {
  return {
    id: t.id,
    instruction: t.instruction,
    hourBkk: t.hourBkk,
    frequency: t.frequency ?? "DAILY",
    days: t.days,
    channels: t.channels,
    describe,
    active: t.active,
    ownerUserId: t.ownerUserId,
    mine: t.ownerUserId === viewerId,
    lastRunDay: t.lastRunDay,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export function lessonDto(l: AiLesson) {
  return { id: l.id, kind: l.kind, pattern: l.pattern, example: l.example, status: l.status, occurrences: l.occurrences, sourceRoomId: l.sourceRoomId, sourceUserId: l.sourceUserId, createdAt: l.createdAt, updatedAt: l.updatedAt };
}

export function inboxItemDto(i: InboxItem) {
  return {
    tenantId: i.tenantId,
    tenantName: i.tenantName,
    type: i.type,
    id: i.id,
    roomId: i.roomId,
    conversationId: i.conversationId,
    summary: i.summary,
    ...(i.kind ? { kind: i.kind } : {}),
    ...(i.risk ? { risk: i.risk } : {}),
    canApprove: i.canApprove,
    ...(i.why ? { why: i.why } : {}),
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
  };
}

/**
 * โควตา (R-S1.13i wire shape) — อ่านอย่างเดียว · ตัวเลขผู้ใช้ = งาน/%/วันรีเซ็ต · `credit` ไม่มียอดเงิน (บอกแค่ว่าใช้ต่อได้ไหมเมื่องานหมด)
 *   `assist` = ต้นทุนผู้ช่วยแบบเดิมของวันนี้เทียบเพดานแพ็กฟรี (หน่วยไมโคร — แอปแสดงเป็น % เท่านั้น · ตามมติ R-S1.13i)
 */
export function quotaDto(q: QuotaStatus) {
  return {
    jobs: { used: q.jobsUsed, limit: q.jobsLimit, left: q.jobsLeft, pct: q.pct, level: q.level, text: q.text, resetAt: q.resetAt, month: q.month },
    assist: { usedMicro: q.assist.usedMicro, capMicro: q.assist.capMicro, pct: q.assist.capMicro > 0 ? Math.min(100, Math.round((q.assist.usedMicro / q.assist.capMicro) * 100)) : 0 },
    credit: { blocked: q.blocked },
    pack: { enabled: FREE_PACK.enabled, jobsPerMonth: FREE_PACK.jobsPerMonth, scheduledMax: FREE_PACK.scheduledMax, approversMax: FREE_PACK.approversMax },
  };
}

type Att = { name?: unknown; url?: unknown; kind?: unknown };
/** ไฟล์แนบของเรื่องช่วยเหลือ — รูปที่เก็บเป็น data URL ยาวมาก ⇒ ส่งได้ (เป็นของผู้แจ้งเอง) แต่ตัดเฉพาะฟิลด์ที่รู้จัก */
export function attachmentsDto(v: unknown): { name: string; url: string; kind: string }[] {
  return (Array.isArray(v) ? (v as Att[]) : [])
    .filter((a) => a && typeof a.url === "string")
    .map((a) => ({ name: typeof a.name === "string" ? a.name : "ไฟล์แนบ", url: a.url as string, kind: a.kind === "image" ? "image" : "file" }));
}
