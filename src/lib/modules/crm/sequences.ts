// sequences.ts — ลำดับการติดตามอัตโนมัติ (sequence · ใบ C2.2 · พิมพ์เขียว §5.7 §11.5 · มติ C16 C25 · ภาพ 07 ล่าง)
//
// ── หน้าที่ ─────────────────────────────────────────────────────────────────────
//   จัดการลำดับ (สร้าง/แก้ + เวอร์ชัน) · ลงทะเบียนผู้ติดต่อ (เดี่ยว/กลุ่ม) · หยุด/พัก/เดินต่อ · สถิติต่อขั้น · ปฏิทินวันทำการ/วันหยุด
//   · `runDue(now)` = งานรายนาที "crm.sequences" (`./sequences-job`) ทำขั้นที่ถึงเวลา · `stopFor` = ทางเข้าเดียวของการหยุดอัตโนมัติ
//     (C2.4 แชทตอบกลับ · C2.5 อีเมลตอบกลับ/ตีกลับ/ยกเลิกรับ **เรียก** ตัวนี้ — RESOLUTIONS R-A) · ตัวรับ event อยู่ที่ crm-bridges/sequences.ts (R-D)
//
// ── กติกาที่ห้ามหัก ────────────────────────────────────────────────────────────
// 1) ขั้นที่ส่งถึงลูกค้า (อีเมล/LINE/SMS) ส่งผ่าน **ตัวรันกลาง** `@/lib/automation/action-runner` (มติ C18 — ไม่มีตัวส่งชุดที่สอง)
//    ความยินยอมถูกถาม **ตอนขั้นทำงาน** ผ่าน `consents.canContact` (AUDIT-CLASS X8) · ตัวส่งจริงถูกแทนได้ด้วย `deps` (ข้อสอบ)
// 2) runDue จองแถวด้วย **lease** (updateMany เงื่อนไข "ACTIVE + ถึงเวลา + lease ว่าง/หมด" → leaseUntil = now + 15 นาที) ไม่เคยจองด้วย
//    การเขียนสถานะปลายทาง · เลื่อนขั้นด้วยเงื่อนไข "lease เดิม + ขั้นเดิม" · เครื่องดับกลางทาง = รอบหลังหมด lease หยิบใหม่ (AUDIT-CLASS X5)
// 3) หนึ่งผู้ติดต่อมีได้หนึ่งแถว ACTIVE ต่อลำดับ — partial UNIQUE ของ C2.0 ตัดสินในฐาน (ผู้แพ้ได้ CONFLICT ไม่ใช่ 500) · แถว PAUSED
//    ก็กันการลงทะเบียนซ้ำ (กติกาของบริการ · replace ได้) · การเปลี่ยนสถานะทุกทางเป็น updateMany แบบมีเงื่อนไข (AUDIT-CLASS X3)
// 4) แก้ "ขั้น" ขณะมีผู้ลงทะเบียน = เวอร์ชันใหม่ (แถวขั้นของเวอร์ชันเก่าไม่ถูกแก้/ลบ) · ผู้ลงทะเบียนเดิมเดินจนจบบนเวอร์ชันของตัวเอง
// 5) `now` ที่ผู้เรียกส่งมาคือ "นาฬิกา" ของความถึงเวลา/ช่วงเวลาส่ง/lease (ไม่ใช่นาฬิกาเครื่องหรือ NOW() ของฐาน)
// 6) ทุกการเปลี่ยนแปลงเขียน AuditLog `crm.sequence.*` และ event (`crm.sequence.enrolled/finished`) ใน tx เดียวกับการเขียน (AUDIT-CLASS X9)
//    payload มีแต่ id/โค้ด (AUDIT-CLASS X8) · key `<type>#<enrollmentId>#<n>` (R-C.8)
// 7) uiVersion 1 (R-E.14): จัดการ/ลงทะเบียนถูกปฏิเสธ · runDue ข้ามทั้งระบบ (แถวคงเดิม — เดินต่อเมื่อกลับเป็น 2)

import { Prisma, type CrmContact, type CrmSequence, type CrmSequenceStep } from "@prisma/client";
import { emitOutbox, emitOutboxMany } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import type { MemberActor } from "@/lib/modules/member";
import { executeActions, WAIT_LEASE_MS, type RunnerChannel, type RunnerEnv, type RunnerSendCore, type RunnerSendResult, type StepOutcome, type SubjectAdapter } from "@/lib/automation/action-runner";
import { prisma } from "./db";
import { assertCanCrm, crmCan, CrmForbiddenError } from "./access";
import { assertCrmV2 } from "./ui-version";
import { canContact } from "./consents";
import { companyWhere, contactWhere, dealWhere } from "./where";
import { mergeCrmHolidays, removeCrmHoliday, setCrmBusinessDays } from "./settings";
import { CRM_DEFAULT_DEPS, crmLineAddressOf } from "./automation";
import * as activities from "./activities";
import {
  afterWait,
  clampIntoWindow,
  cleanSendWindow,
  cleanSteps,
  describeStep,
  parseCalendar,
  SEQ_BULK_MAX,
  SEQ_DESC_MAX,
  SEQ_NAME_MAX,
  SEQ_REASON_MAX,
  SEQ_REASON_MIN,
  SEQ_SEND_KINDS,
  thaiHolidayYear,
  THAI_HOLIDAY_YEARS,
  thaiPublicHolidays,
  windowOpen,
  type SeqCalendar,
  type SeqEnrollStatus,
  type SeqHoliday,
  type SeqOutcome,
  type SeqSendWindow,
  type SeqSequenceInput,
  type SeqSequencePatch,
  type SeqStepClean,
  type SeqStepKind,
} from "./sequences-shared";
import "./sequences-job";

// ───────────────────────── ชนิด · error ─────────────────────────

export type SequencesCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
export type SequenceErrorCode = "NOT_FOUND" | "FORBIDDEN" | "VALIDATION" | "CONFLICT";
export class SequenceError extends Error {
  readonly code: SequenceErrorCode;
  constructor(code: SequenceErrorCode, message: string) {
    super(message);
    this.name = "SequenceError";
    this.code = code;
  }
}
const fail = (code: SequenceErrorCode, message: string) => new SequenceError(code, message);

/** ตัวส่งที่ฉีดแทนได้ — ส่งมา = ใช้เฉพาะตัวที่ส่งมาเท่านั้น (ข้อสอบไม่มีวันถึงตัวส่งจริง) */
export type SequenceSendRequest = { tenantId: string; systemId: string; contactId: string; enrollmentId: string; channel: string; to: string; subject?: string; body: string };
export type SequenceSendFn = (req: SequenceSendRequest) => Promise<{ ok: boolean; skipped?: boolean; error?: string }>;
export type SequenceDeps = { email?: SequenceSendFn; line?: SequenceSendFn; sms?: SequenceSendFn };
export type RunDueOptions = { deps?: SequenceDeps; tenantIds?: string[]; batchSize?: number; deadline?: number; signal?: AbortSignal };
export type RunDueSummary = { claimed: number; executed: number; deferred: number; finished: number; failed: number; batches: number; cutOff: boolean };

const SYSTEM_NOT_FOUND = "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const SEQ_NOT_FOUND = "ไม่พบลำดับการติดตามนี้ในระบบ CRM นี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่";
const CONTACT_NOT_FOUND = "ไม่พบผู้ติดต่อนี้ในระบบ CRM นี้ หรือบัญชีนี้ยังมองไม่เห็นผู้ติดต่อนี้ — รีเฟรชหน้าแล้วลองใหม่";
const DEAL_NOT_FOUND = "ไม่พบดีลนี้ในระบบ CRM นี้ หรือบัญชีนี้ยังมองไม่เห็นดีลนี้ — เลือกดีลใหม่แล้วลองอีกครั้ง";
const ENR_NOT_FOUND = "ไม่พบการลงทะเบียนนี้ในระบบ CRM นี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่";
const ALREADY_IN = "ผู้ติดต่อนี้อยู่ในลำดับการติดตามนี้อยู่แล้ว — ถ้าต้องการเริ่มใหม่ตั้งแต่ขั้นแรก เลือก \"ลงทะเบียนใหม่แทนของเดิม\"";
const OPTED_OUT = "ผู้ติดต่อนี้ขอไม่รับข่าวสารไว้ — ระบบจึงไม่ใส่เข้าลำดับการติดตาม";
const SMS_NOT_READY = "ร้านนี้ยังไม่มีผู้ให้บริการส่ง SMS — ขั้นนี้จึงถูกข้าม";
const MANAGE_KEY = "crm.sequence.manage";
const ENROLL_KEY = "crm.sequence.enroll";
const EVT = { enrolled: "crm.sequence.enrolled", finished: "crm.sequence.finished" } as const;
const ACTIVE_OR_PAUSED: ("ACTIVE" | "PAUSED")[] = ["ACTIVE", "PAUSED"];
/** AUDIT-CLASS X5: อายุการจอง = ค่ากลางของตัวรัน (15 นาที · ที่เดียวของทั้งระบบ) */
const LEASE_MS = WAIT_LEASE_MS;

type Tx = Prisma.TransactionClient;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const errText = (e: unknown, fallback = "ทำไม่สำเร็จ"): string => (e instanceof Error && e.message ? e.message : fallback).slice(0, 200);

/** ฐานปฏิเสธแถวซ้ำ (partial UNIQUE) — P2002 ของ Prisma หรือ 23505 ที่ driver adapter ห่อมา (มติ C2.1-X4.4) */
function isUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const x = e as { code?: unknown; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown; code?: unknown } } }; message?: unknown };
  if (x.code === "P2002") return true;
  const c = x.meta?.driverAdapterError?.cause;
  if (c && (c.originalCode === "23505" || c.code === "23505")) return true;
  return typeof x.message === "string" && /23505|Unique constraint failed/i.test(x.message);
}

// ───────────────────────── ทางเข้า (ระบบ → uiVersion → สิทธิ์) ─────────────────────────

// AUDIT-CLASS X1: ctx.systemId ต้องเป็นระบบ CRM ของร้านนี้จริง — ไม่พบ = NOT_FOUND (ไม่เชื่อ id จากผู้เรียก)
async function resolveSystem(ctx: SequencesCtx): Promise<{ settings: Prisma.JsonValue }> {
  const sys =
    typeof ctx?.tenantId === "string" && typeof ctx?.systemId === "string" && ctx.tenantId && ctx.systemId
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { settings: true } })
      : null;
  if (!sys) throw fail("NOT_FOUND", SYSTEM_NOT_FOUND);
  return sys;
}

/** ลำดับตายตัว: ระบบ (NOT_FOUND) → uiVersion 2 (CrmV2DisabledError) → คีย์ (FORBIDDEN) */
async function enter(ctx: SequencesCtx, actor: MemberActor | null | undefined, keys: string[]): Promise<MemberActor> {
  await resolveSystem(ctx);
  await assertCrmV2(ctx);
  if (!actor) throw new CrmForbiddenError(keys[0] ?? ENROLL_KEY);
  if (keys.length === 1) assertCanCrm(actor, keys[0]!);
  else if (!keys.some((k) => crmCan(actor, k))) throw new CrmForbiddenError(keys[0]!);
  return actor;
}

/** ด่านของ server action (ระบบ → uiVersion 2 → คีย์) — หน้า/ปุ่มเรียกก่อนทุกอย่าง */
export async function assertSequenceAccess(ctx: SequencesCtx, actor: MemberActor | null | undefined, mode: "manage" | "enroll" | "read" = "read"): Promise<MemberActor> {
  return enter(ctx, actor, mode === "manage" ? [MANAGE_KEY] : mode === "enroll" ? [ENROLL_KEY] : [ENROLL_KEY, MANAGE_KEY]);
}

/**
 * โหลดลำดับของระบบนี้ — ปริยาย "เฉพาะที่ยังไม่ถูกเก็บ"
 * 🔴 `includeArchived` (มติผู้คุมงานรอบสอง ข้อ 1): หน้าตัวแก้ไขต้องเปิดลำดับที่ถูกเก็บแล้วได้แบบ "อ่านอย่างเดียว" —
 *    ไม่งั้นการเก็บที่ชนเพดานเวลา (remaining > 0) ทำให้หน้าจอ 404 และปุ่ม "ทำการเก็บต่อ" ไปไม่ถึง = คนที่เหลือค้าง ACTIVE ตลอดกาล
 */
async function loadSequence(ctx: SequencesCtx, id: unknown, db: Tx | typeof prisma = prisma, opts: { includeArchived?: boolean } = {}): Promise<CrmSequence> {
  const sid = str(id);
  const row = sid ? await db.crmSequence.findFirst({ where: { id: sid, tenantId: ctx.tenantId, systemId: ctx.systemId, ...(opts.includeArchived === true ? {} : { archivedAt: null }) } }) : null;
  if (!row) throw fail("NOT_FOUND", SEQ_NOT_FOUND);
  return row;
}

/** AUDIT-CLASS X1: ผู้ติดต่อที่ actor มองเห็น (visibleWhere CONTACT) ในระบบของ ctx — มองไม่เห็น/ระบบอื่น/ร้านอื่น = NOT_FOUND (ไม่สะท้อนชื่อ) */
async function loadVisibleContact(ctx: SequencesCtx, actor: MemberActor, id: unknown): Promise<CrmContact> {
  const cid = str(id);
  const row = cid ? await prisma.crmContact.findFirst({ where: { AND: [await contactWhere(ctx, actor), { id: cid, archivedAt: null, mergedIntoId: null }] } }) : null;
  if (!row) throw fail("NOT_FOUND", CONTACT_NOT_FOUND);
  return row;
}

type EnrollmentRow = Prisma.CrmSequenceEnrollmentGetPayload<{ include: { sequence: true } }>;
async function loadEnrollment(ctx: SequencesCtx, actor: MemberActor, id: unknown): Promise<EnrollmentRow> {
  const eid = str(id);
  const row = eid
    ? await prisma.crmSequenceEnrollment.findFirst({
        where: { id: eid, tenantId: ctx.tenantId, sequence: { systemId: ctx.systemId }, contact: await contactWhere(ctx, actor) },
        include: { sequence: true },
      })
    : null;
  if (!row) throw fail("NOT_FOUND", ENR_NOT_FOUND);
  return row;
}

// ───────────────────────── audit · event (ใน tx ของการเขียน) ─────────────────────────

// AUDIT-CLASS X9: ทุกการเปลี่ยนแปลงมีแถว audit พร้อมผู้ทำ (ระบบ = SYSTEM) — เก็บแค่ id/โค้ด/เหตุผลที่ผู้ใช้พิมพ์ ไม่เก็บเนื้อข้อความถึงลูกค้า
async function auditTx(db: Tx | typeof prisma, ctx: { tenantId: string }, actorUserId: string | null, action: string, targetType: string, targetId: string, body: { before?: unknown; after?: unknown }): Promise<void> {
  await db.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      actorType: actorUserId ? "USER" : "SYSTEM",
      actorId: actorUserId,
      action,
      targetType,
      targetId,
      before: (body.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (body.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

// AUDIT-CLASS X4 · X8: key `<type>#<enrollmentId>#1` — หนึ่งแถวลงทะเบียนเริ่ม 1 ครั้ง จบ 1 ครั้ง ⇒ ส่งซ้ำ/พร้อมกัน = event เดิม · payload id ล้วน
async function emitEnrolled(tx: Tx, systemId: string, row: { id: string; tenantId: string; sequenceId: string; contactId: string; dealId: string | null; sequenceVersion: number }): Promise<void> {
  await emitOutbox(tx, {
    tenantId: row.tenantId,
    systemId,
    type: EVT.enrolled,
    idempotencyKey: `${EVT.enrolled}#${row.id}#1`,
    payload: { enrollmentId: row.id, sequenceId: row.sequenceId, contactId: row.contactId, dealId: row.dealId, sequenceVersion: row.sequenceVersion },
  });
}
async function emitFinished(tx: Tx, systemId: string, row: { id: string; tenantId: string; sequenceId: string; contactId: string }, status: "DONE" | "STOPPED", reason?: string): Promise<void> {
  await emitOutbox(tx, {
    tenantId: row.tenantId,
    systemId,
    type: EVT.finished,
    idempotencyKey: `${EVT.finished}#${row.id}#1`,
    payload: { enrollmentId: row.id, sequenceId: row.sequenceId, contactId: row.contactId, status, ...(reason ? { reason } : {}) },
  });
}

/**
 * AUDIT-CLASS X3: หยุดแถวเดียวด้วยเงื่อนไข (ยังเดิน/พักอยู่เท่านั้น) — คนชนะคนเดียวได้ count 1 และเป็นคนเดียวที่ยิง finished
 * ล้าง lease ด้วย (แถวที่จบแล้วไม่มี lease ค้าง — ตัวรันที่ทำขั้นค้างอยู่จะเลื่อนขั้นไม่ได้เพราะ lease ไม่ตรงแล้ว)
 */
async function stopOneTx(tx: Tx, systemId: string, row: { id: string; tenantId: string; sequenceId: string; contactId: string }, code: string, at: Date): Promise<boolean> {
  const n = await tx.crmSequenceEnrollment.updateMany({
    where: { id: row.id, status: { in: ACTIVE_OR_PAUSED } },
    data: { status: "STOPPED", stoppedReason: code, stoppedAt: at, nextAt: null, leaseUntil: null },
  });
  if (n.count !== 1) return false;
  await emitFinished(tx, systemId, row, "STOPPED", code);
  return true;
}

/**
 * หยุดผู้ลงทะเบียนของ "ลำดับหนึ่ง" เป็นชุด (≤ `limit` แถว) ใน **ธุรกรรมเดียว 3 คำสั่ง** — ใช้ตอนเก็บลำดับ
 * 🔴 ทำไมไม่วน stopOneTx ทีละแถว (มติผู้คุมงานรอบสอง ข้อ 1): หนึ่งธุรกรรมต่อคน = ~58 มิลลิวินาที/คน ⇒ 600 คนใช้ ~35 วินาที
 *    ซึ่งเกินเพดานเวลาของคำขอเดียว ⇒ ลำดับใหญ่จะเหลือคนค้าง ACTIVE ทั้งที่ลำดับถูกเก็บแล้ว (runDue ข้ามลำดับที่เก็บ = ซอมบี้)
 * AUDIT-CLASS X3: `UPDATE … WHERE status IN ('ACTIVE','PAUSED') … RETURNING` = ฐานเป็นผู้ตัดสินว่าใคร "ถูกเปลี่ยนสถานะโดยคำสั่งนี้"
 *    (FOR UPDATE SKIP LOCKED ⇒ สองคนกดพร้อมกันไม่ทำงานทับกันและไม่รอกัน) · คืนมาเท่าไร = event/แถวประวัติเท่านั้น ไม่มากไม่น้อย
 * AUDIT-CLASS X9: ประวัติ (`crm.sequence.stop`) + event (`crm.sequence.finished` · key ต่อแถว ⇒ กดซ้ำไม่เพิ่ม) อยู่ใน tx เดียวกับการเขียน
 */
async function stopBatchTx(
  tx: Tx,
  ctx: SequencesCtx,
  actorUserId: string | null,
  sequenceId: string,
  code: SeqStopCode,
  at: Date,
  limit: number,
  via: string,
): Promise<number> {
  const ts = at.toISOString();
  const rows = await tx.$queryRaw<{ id: string; contactId: string }[]>`
    UPDATE "CrmSequenceEnrollment" SET "status" = 'STOPPED'::"CrmEnrollStatus", "stoppedReason" = ${code},
           "stoppedAt" = (${ts}::timestamptz AT TIME ZONE 'UTC'), "nextAt" = NULL, "leaseUntil" = NULL,
           "updatedAt" = (${ts}::timestamptz AT TIME ZONE 'UTC')
     WHERE "id" IN (
       SELECT "id" FROM "CrmSequenceEnrollment"
        WHERE "sequenceId" = ${sequenceId} AND "tenantId" = ${ctx.tenantId} AND "status" IN ('ACTIVE'::"CrmEnrollStatus", 'PAUSED'::"CrmEnrollStatus")
        ORDER BY "id" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
       AND "status" IN ('ACTIVE'::"CrmEnrollStatus", 'PAUSED'::"CrmEnrollStatus")
    RETURNING "id", "contactId"`;
  if (rows.length === 0) return 0;
  await emitOutboxMany(
    tx,
    rows.map((r) => ({
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      type: EVT.finished,
      idempotencyKey: `${EVT.finished}#${r.id}#1`,
      payload: { enrollmentId: r.id, sequenceId, contactId: r.contactId, status: "STOPPED", reason: code },
    })),
  );
  await tx.auditLog.createMany({
    data: rows.map((r) => ({
      tenantId: ctx.tenantId,
      actorType: actorUserId ? "USER" : "SYSTEM",
      actorId: actorUserId,
      action: "crm.sequence.stop",
      targetType: "CrmSequenceEnrollment",
      targetId: r.id,
      after: { status: "STOPPED", reason: code, via } as Prisma.InputJsonValue,
    })),
  });
  return rows.length;
}

// ───────────────────────── DTO ─────────────────────────

export type SequenceStepDto = SeqStepClean & { index: number; label: string };
export type SequenceDto = {
  id: string;
  name: string;
  description: string | null;
  version: number;
  active: boolean;
  stopOnReply: boolean;
  stopOnWon: boolean;
  stopOnLost: boolean;
  businessDaysOnly: boolean;
  sendWindow: SeqSendWindow | null;
  maxActive: number | null;
  /** ถูกเก็บแล้วเมื่อไร (null = ยังใช้งาน) — หน้าจอใช้ค่านี้เข้าโหมดอ่านอย่างเดียว */
  archivedAt: string | null;
  steps: SequenceStepDto[];
  createdAt: string;
  updatedAt: string;
};

const windowOf = (v: Prisma.JsonValue | null): SeqSendWindow | null => {
  const r = cleanSendWindow(v);
  return r.ok ? r.value : null;
};
const stepDto = (s: Pick<CrmSequenceStep, "index" | "kind" | "subject" | "body" | "templateId" | "waitDays" | "waitHours" | "taskTitle" | "taskType" | "channel">): SequenceStepDto => {
  const clean: SeqStepClean = {
    kind: s.kind as SeqStepKind,
    subject: s.subject,
    body: s.body,
    templateId: s.templateId,
    waitDays: s.waitDays,
    waitHours: s.waitHours,
    taskTitle: s.taskTitle,
    taskType: s.taskType,
    channel: s.channel,
  };
  return { ...clean, index: s.index, label: describeStep(clean) };
};
function sequenceDto(row: CrmSequence, steps: CrmSequenceStep[]): SequenceDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    active: row.active,
    stopOnReply: row.stopOnReply,
    stopOnWon: row.stopOnWon,
    stopOnLost: row.stopOnLost,
    businessDaysOnly: row.businessDaysOnly,
    sendWindow: windowOf(row.sendWindow),
    maxActive: row.maxActive,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    steps: steps.filter((s) => s.version === row.version).sort((a, b) => a.index - b.index).map(stepDto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ───────────────────────── ตรวจค่าลำดับ ─────────────────────────

type CleanHead = {
  name?: string;
  description?: string | null;
  stopOnReply?: boolean;
  stopOnWon?: boolean;
  stopOnLost?: boolean;
  businessDaysOnly?: boolean;
  sendWindow?: SeqSendWindow | null;
  maxActive?: number | null;
  active?: boolean;
};

// AUDIT-CLASS X6: ชื่อ/คำอธิบายยาวจำกัด · ช่วงเวลา HH:MM ตรวจรูปแบบ + ลำดับ · maxActive จำนวนเต็มบวก
function cleanHead(input: SeqSequencePatch, creating: boolean): CleanHead {
  const out: CleanHead = {};
  if (creating || input.name !== undefined) {
    const name = str(input.name);
    if (!name) throw fail("VALIDATION", "ตั้งชื่อลำดับการติดตามก่อนบันทึก");
    if (name.length > SEQ_NAME_MAX || /[\r\n]/.test(name)) throw fail("VALIDATION", `ชื่อลำดับการติดตามยาวได้ไม่เกิน ${SEQ_NAME_MAX} ตัวอักษรในบรรทัดเดียว`);
    out.name = name;
  }
  if (input.description !== undefined) {
    const d = str(input.description);
    if (d.length > SEQ_DESC_MAX) throw fail("VALIDATION", `คำอธิบายยาวได้ไม่เกิน ${SEQ_DESC_MAX} ตัวอักษร`);
    out.description = d || null;
  }
  for (const k of ["stopOnReply", "stopOnWon", "stopOnLost", "businessDaysOnly", "active"] as const) {
    const v = input[k];
    if (v === undefined) continue;
    if (typeof v !== "boolean") throw fail("VALIDATION", "ค่าเปิด/ปิดของลำดับการติดตามไม่ถูกต้อง — ลองเลือกใหม่อีกครั้ง");
    out[k] = v;
  }
  if (creating && out.businessDaysOnly === undefined) out.businessDaysOnly = true;
  if (input.sendWindow !== undefined) {
    const w = cleanSendWindow(input.sendWindow);
    if (!w.ok) throw fail("VALIDATION", w.error);
    out.sendWindow = w.value;
  }
  if (input.maxActive !== undefined) {
    if (input.maxActive === null) out.maxActive = null;
    else if (!Number.isInteger(input.maxActive) || input.maxActive < 1 || input.maxActive > 100_000) throw fail("VALIDATION", "จำนวนผู้ลงทะเบียนสูงสุดต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป (เว้นว่าง = ไม่จำกัด)");
    else out.maxActive = input.maxActive;
  }
  return out;
}

const stepRows = (tenantId: string, sequenceId: string, version: number, steps: SeqStepClean[]): Prisma.CrmSequenceStepCreateManyInput[] =>
  steps.map((s, index) => ({
    tenantId,
    sequenceId,
    version,
    index,
    kind: s.kind,
    subject: s.subject,
    body: s.body,
    templateId: s.templateId,
    waitDays: s.waitDays,
    waitHours: s.waitHours,
    taskTitle: s.taskTitle,
    taskType: s.taskType as Prisma.CrmSequenceStepCreateManyInput["taskType"],
    channel: s.channel,
  }));

// ───────────────────────── จัดการลำดับ ─────────────────────────

export async function createSequence(ctx: SequencesCtx, actor: MemberActor, input: SeqSequenceInput): Promise<SequenceDto> {
  const a = await enter(ctx, actor, [MANAGE_KEY]);
  const head = cleanHead(input ?? ({} as SeqSequenceInput), true);
  const st = cleanSteps(input?.steps);
  if (!st.ok) throw fail("VALIDATION", st.error);
  const out = await prisma.$transaction(async (tx) => {
    const row = await tx.crmSequence.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        name: head.name!,
        description: head.description ?? null,
        stopOnReply: head.stopOnReply ?? true,
        stopOnWon: head.stopOnWon ?? true,
        stopOnLost: head.stopOnLost ?? true,
        businessDaysOnly: head.businessDaysOnly ?? true,
        sendWindow: head.sendWindow ? (head.sendWindow as Prisma.InputJsonValue) : Prisma.DbNull,
        maxActive: head.maxActive ?? null,
        active: head.active ?? true,
        createdById: a.userId,
        version: 1,
      },
    });
    await tx.crmSequenceStep.createMany({ data: stepRows(ctx.tenantId, row.id, 1, st.value) });
    await auditTx(tx, ctx, a.userId, "crm.sequence.create", "CrmSequence", row.id, { after: { name: row.name, version: 1, steps: st.value.map((s) => s.kind) } });
    const steps = await tx.crmSequenceStep.findMany({ where: { sequenceId: row.id } });
    return sequenceDto(row, steps);
  });
  return out;
}

/**
 * แก้ลำดับ — `patch.steps` ขณะมีผู้ลงทะเบียนในเวอร์ชันปัจจุบัน (สถานะใดก็ตาม) ⇒ เวอร์ชัน +1 (แถวขั้นใหม่ · ของเก่าไม่ถูกแตะ)
 * ไม่มีใครลงทะเบียนเวอร์ชันนี้เลย ⇒ แทนขั้นของเวอร์ชันเดิม · patch ที่ไม่มี steps ไม่เพิ่มเวอร์ชัน
 * AUDIT-CLASS X3: ถือล็อกแถวลำดับ (FOR UPDATE) ตลอด tx — การลงทะเบียน (FOR SHARE) รอจนแก้เสร็จ จึงไม่มีใครได้ขั้นครึ่ง ๆ กลาง ๆ
 */
export async function updateSequence(ctx: SequencesCtx, actor: MemberActor, id: string, patch: SeqSequencePatch): Promise<SequenceDto & { versionBumped: boolean }> {
  const a = await enter(ctx, actor, [MANAGE_KEY]);
  await loadSequence(ctx, id);
  const head = cleanHead(patch ?? {}, false);
  const st = patch?.steps !== undefined ? cleanSteps(patch.steps) : null;
  if (st && !st.ok) throw fail("VALIDATION", st.error);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CrmSequence" WHERE "id" = ${str(id)} FOR UPDATE`;
    const cur = await loadSequence(ctx, id, tx);
    let version = cur.version;
    let bumped = false;
    if (st && st.ok) {
      const used = await tx.crmSequenceEnrollment.count({ where: { sequenceId: cur.id, sequenceVersion: cur.version } });
      if (used > 0) {
        version = cur.version + 1;
        bumped = true;
        await tx.crmSequenceStep.createMany({ data: stepRows(ctx.tenantId, cur.id, version, st.value) });
      } else {
        await tx.crmSequenceStep.deleteMany({ where: { sequenceId: cur.id, version: cur.version } });
        await tx.crmSequenceStep.createMany({ data: stepRows(ctx.tenantId, cur.id, version, st.value) });
      }
    }
    const row = await tx.crmSequence.update({
      where: { id: cur.id },
      data: {
        ...(head.name !== undefined ? { name: head.name } : {}),
        ...(head.description !== undefined ? { description: head.description } : {}),
        ...(head.stopOnReply !== undefined ? { stopOnReply: head.stopOnReply } : {}),
        ...(head.stopOnWon !== undefined ? { stopOnWon: head.stopOnWon } : {}),
        ...(head.stopOnLost !== undefined ? { stopOnLost: head.stopOnLost } : {}),
        ...(head.businessDaysOnly !== undefined ? { businessDaysOnly: head.businessDaysOnly } : {}),
        ...(head.active !== undefined ? { active: head.active } : {}),
        ...(head.sendWindow !== undefined ? { sendWindow: head.sendWindow ? (head.sendWindow as Prisma.InputJsonValue) : Prisma.DbNull } : {}),
        ...(head.maxActive !== undefined ? { maxActive: head.maxActive } : {}),
        ...(bumped ? { version } : {}),
      },
    });
    await auditTx(tx, ctx, a.userId, "crm.sequence.update", "CrmSequence", row.id, {
      before: { version: cur.version, name: cur.name, active: cur.active },
      after: { version, name: row.name, active: row.active, changed: Object.keys(head), steps: st && st.ok ? st.value.map((s) => s.kind) : undefined, versionBumped: bumped },
    });
    const steps = await tx.crmSequenceStep.findMany({ where: { sequenceId: row.id, version } });
    return { ...sequenceDto(row, steps), versionBumped: bumped };
  });
}

/**
 * เก็บลำดับ (ลบแบบย้อนได้ไม่ได้ในใบนี้) — DANGER: ยืนยัน + เหตุผล · ผู้ลงทะเบียนที่ยังเดินอยู่ถูกหยุด "MANUAL"
 * 🔴 ลำดับการทำงานสำคัญ (มติรีวิว C2.2 ข้อ 8): **ปักเวลาเก็บก่อน** แล้วค่อยไล่หยุดเป็นชุด ชุดละไม่เกิน `ARCHIVE_STOP_BATCH`
 *   เดิมไล่หยุดทีละธุรกรรมโดยไม่มีเพดาน (maxActive ยอมได้ถึง 100,000) ⇒ ลำดับใหญ่ = คำขอหมดเวลากลางทาง โดยที่คนถูกหยุดไปแล้ว
 *   แต่ `archivedAt` ไม่เคยถูกตั้ง ⇒ ลำดับยัง "รับคนใหม่" ต่อไป · ตอนนี้ปักธงก่อน (คำสั่งเดียว) จึงหยุดรับคนใหม่ทันทีเสมอ
 * 🔴 **วนชุดจนหมดในคำขอเดียว** (มติผู้คุมงานรอบสอง ข้อ 1): รอบก่อนหยุดแค่ชุดแรก (≤500) แล้วคืน `remaining` ให้ผู้ใช้กดซ้ำ —
 *   แต่หน้าจอของลำดับที่ถูกเก็บ 404 (loadSequence กรอง archivedAt) ⇒ ปุ่มกดซ้ำไปไม่ถึง ⇒ คนที่เหลือค้าง ACTIVE ตลอดกาล
 *   และ `runDue` ก็ข้ามลำดับที่ถูกเก็บ = ซอมบี้ที่ไม่มีใครเดินและไม่มีใครหยุด · ตอนนี้วนจนเหลือ 0 หรือจนชนเพดานเวลา
 *   `ARCHIVE_DEADLINE_MS` (เหลือ > 0 ได้เฉพาะกรณีชนเพดาน) และหน้าจอของลำดับที่ถูกเก็บ "โหลดได้แบบอ่านอย่างเดียว" เพื่อกดทำต่อ
 * 🔴 เรียกซ้ำได้ (idempotent): โหลดลำดับโดยไม่สนใจ `archivedAt` ⇒ กดอีกครั้งคือ "ทำงานที่เหลือต่อ"
 *   · NOTE รีวิวรอบสอง ข้อ N4: เขียนประวัติ `crm.sequence.archive` **เฉพาะครั้งที่ปักธงได้จริง** (กดซ้ำตอนไม่มีอะไรเปลี่ยน = ไม่มีแถวใหม่)
 */
const ARCHIVE_STOP_BATCH = 500;
/** เพดานเวลาของการไล่หยุดในคำขอเดียว (นาฬิกาจริง) — ชนเพดาน = คืน `remaining` > 0 + `cutOff` ให้หน้าจอชวนกด "ทำการเก็บต่อ" */
const ARCHIVE_DEADLINE_MS = 20_000;

export async function archiveSequence(
  ctx: SequencesCtx,
  actor: MemberActor,
  id: string,
  opts: { confirm?: boolean | null; reason?: string | null; deadlineMs?: number } = {},
): Promise<{ stopped: number; remaining: number; cutOff: boolean }> {
  const a = await enter(ctx, actor, [MANAGE_KEY]);
  const reason = reasonOf(opts, "การลบลำดับการติดตาม");
  const sid = str(id);
  const seq = sid ? await prisma.crmSequence.findFirst({ where: { id: sid, tenantId: ctx.tenantId, systemId: ctx.systemId } }) : null;
  if (!seq) throw fail("NOT_FOUND", SEQ_NOT_FOUND);
  const at = new Date();
  const budget = Number.isFinite(opts.deadlineMs) && (opts.deadlineMs as number) > 0 ? Math.min(opts.deadlineMs as number, 120_000) : ARCHIVE_DEADLINE_MS;
  const until = Date.now() + budget;
  // 1) ปักธงก่อน (คำสั่งเดียว · ซ้ำได้) — ตั้งแต่วินาทีนี้ไม่มีใครถูกใส่เข้าลำดับนี้ได้อีก
  await prisma.$transaction(async (tx) => {
    const n = await tx.crmSequence.updateMany({ where: { id: seq.id, archivedAt: null }, data: { archivedAt: at, active: false } });
    if (n.count === 1) await auditTx(tx, ctx, a.userId, "crm.sequence.archive", "CrmSequence", seq.id, { after: { reason } });
  });
  // 2) ไล่หยุดผู้ที่ยังเดินอยู่เป็นชุด ๆ จนหมด (ชุดละ 3 คำสั่ง) — ชนเพดานเวลาจึงหยุดพักแล้วบอกจำนวนที่เหลือ
  let stopped = 0;
  let cutOff = false;
  for (;;) {
    const n = await prisma.$transaction((tx) => stopBatchTx(tx, ctx, a.userId, seq.id, "MANUAL", at, ARCHIVE_STOP_BATCH, "archive"), { maxWait: 15_000, timeout: 60_000 });
    stopped += n;
    if (n === 0) break;
    if (Date.now() >= until) {
      cutOff = true;
      break;
    }
  }
  const remaining = await prisma.crmSequenceEnrollment.count({ where: { sequenceId: seq.id, status: { in: ACTIVE_OR_PAUSED } } });
  return { stopped, remaining, cutOff };
}

export type SequenceListItem = { id: string; name: string; version: number; active: boolean; stepCount: number; steps: { kind: string; label: string }[]; counts: Record<SeqEnrollStatus, number>; updatedAt: string };

export async function listSequences(ctx: SequencesCtx, actor: MemberActor): Promise<SequenceListItem[]> {
  await enter(ctx, actor, [ENROLL_KEY, MANAGE_KEY]);
  const rows = await prisma.crmSequence.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null }, orderBy: { createdAt: "asc" }, take: 200 });
  if (rows.length === 0) return [];
  const [steps, counts] = await Promise.all([
    prisma.crmSequenceStep.findMany({ where: { sequenceId: { in: rows.map((r) => r.id) } }, orderBy: { index: "asc" } }),
    prisma.crmSequenceEnrollment.groupBy({ by: ["sequenceId", "status"], where: { sequenceId: { in: rows.map((r) => r.id) } }, _count: { _all: true } }),
  ]);
  return rows.map((r) => {
    const mine = steps.filter((s) => s.sequenceId === r.id && s.version === r.version);
    const c: Record<SeqEnrollStatus, number> = { ACTIVE: 0, PAUSED: 0, DONE: 0, STOPPED: 0 };
    for (const g of counts) if (g.sequenceId === r.id) c[g.status as SeqEnrollStatus] = g._count._all;
    return { id: r.id, name: r.name, version: r.version, active: r.active, stepCount: mine.length, steps: mine.map((s) => ({ kind: s.kind, label: stepDto(s).label })), counts: c, updatedAt: r.updatedAt.toISOString() };
  });
}

/** อ่านลำดับหนึ่งใบ · `includeArchived` = หน้าตัวแก้ไขเปิดลำดับที่ถูกเก็บแล้วได้ (อ่านอย่างเดียว · `archivedAt` บอกสถานะ) */
export async function getSequence(ctx: SequencesCtx, actor: MemberActor, id: string, opts: { includeArchived?: boolean } = {}): Promise<SequenceDto> {
  await enter(ctx, actor, [ENROLL_KEY, MANAGE_KEY]);
  const row = await loadSequence(ctx, id, prisma, opts);
  const steps = await prisma.crmSequenceStep.findMany({ where: { sequenceId: row.id, version: row.version } });
  return sequenceDto(row, steps);
}

/** ตัวเลือกลำดับที่ลงทะเบียนได้ (ปุ่มบนผู้ติดต่อ/ลงทะเบียนกลุ่ม) — ไม่มีคีย์ลงทะเบียน = [] (ปุ่มไม่แสดง) */
export async function sequenceOptions(ctx: SequencesCtx, actor: MemberActor): Promise<{ id: string; name: string; stepCount: number }[]> {
  await resolveSystem(ctx);
  await assertCrmV2(ctx);
  if (!crmCan(actor, ENROLL_KEY)) return [];
  const rows = await prisma.crmSequence.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null, active: true }, orderBy: { name: "asc" }, take: 200, select: { id: true, name: true, version: true } });
  const steps = rows.length ? await prisma.crmSequenceStep.groupBy({ by: ["sequenceId", "version"], where: { sequenceId: { in: rows.map((r) => r.id) } }, _count: { _all: true } }) : [];
  return rows.map((r) => ({ id: r.id, name: r.name, stepCount: steps.find((s) => s.sequenceId === r.id && s.version === r.version)?._count._all ?? 0 }));
}

// ───────────────────────── ลงทะเบียน ─────────────────────────

export type EnrollInput = { sequenceId: string; contactId: string; dealId?: string | null; replace?: boolean };
export type EnrollResult = { enrollmentId: string; id: string; status: "ENROLLED" | "REPLACED" } | { skipped: true; reason: string };

type NewEnrollment = { id: string; tenantId: string; sequenceId: string; contactId: string; dealId: string | null; sequenceVersion: number };

/**
 * เขียนแถวลงทะเบียนใหม่ — **เพดาน `maxActive` ถูกตัดสินในคำสั่ง SQL เดียวกับการเขียน** (มติผู้คุมงานรีวิว C2.2 ข้อ 5)
 * AUDIT-CLASS X3: เดิมเป็น "นับแล้วค่อยเขียน" (count ⇒ create) ⇒ ผู้ติดต่อ **คนละคน** N รายที่ยิงพร้อมกันผ่านด่านนับพร้อมกันหมด
 *   (partial UNIQUE คุมแค่ (ลำดับ, ผู้ติดต่อ) ไม่ได้คุมจำนวนประชากร) เพดานจึงทะลุได้ถึง N-1 คน — รูปที่ MASTER-PLAN §4 X3 ห้ามตรง ๆ
 *   ตอนนี้: `INSERT … SELECT … WHERE (SELECT count(*) …) < cap` = ฐานเป็นคนตัดสิน · 0 แถวกลับมา = เต็มแล้ว
 *   + advisory lock ต่อ "ลำดับ" ในธุรกรรมเดียวกันเมื่อมีเพดาน (ตัดหน้าต่าง snapshot ของ READ COMMITTED ที่ทำให้สองธุรกรรม
 *   นับเห็นเท่ากันแล้วเขียนทั้งคู่) ⇒ เพดานทะลุไม่ได้เลย · ลำดับที่ไม่มีเพดาน (ส่วนใหญ่) ไม่เสียค่าใช้จ่ายนี้
 */
async function insertEnrollment(
  tx: Tx,
  a: { tenantId: string; sequenceId: string; contactId: string; dealId: string | null; actorUserId: string; version: number; now: Date; maxActive: number | null },
): Promise<NewEnrollment> {
  const at = a.now.toISOString();
  const base = { tenantId: a.tenantId, sequenceId: a.sequenceId, contactId: a.contactId, dealId: a.dealId, sequenceVersion: a.version };
  if (!a.maxActive) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "CrmSequenceEnrollment" ("id","tenantId","sequenceId","contactId","dealId","enrolledById","enrolledBy","sequenceVersion","stepIndex","nextAt","status","createdAt","updatedAt")
      VALUES (gen_random_uuid()::text, ${a.tenantId}, ${a.sequenceId}, ${a.contactId}, ${a.dealId}, ${a.actorUserId}, ${`USER:${a.actorUserId}`}, ${a.version}, 0,
              (${at}::timestamptz AT TIME ZONE 'UTC'), 'ACTIVE'::"CrmEnrollStatus", (${at}::timestamptz AT TIME ZONE 'UTC'), (${at}::timestamptz AT TIME ZONE 'UTC'))
      RETURNING "id"`;
    return { id: String(rows[0]?.id ?? ""), ...base };
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm.seq.cap:${a.sequenceId}`}, 0))`;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "CrmSequenceEnrollment" ("id","tenantId","sequenceId","contactId","dealId","enrolledById","enrolledBy","sequenceVersion","stepIndex","nextAt","status","createdAt","updatedAt")
    SELECT gen_random_uuid()::text, ${a.tenantId}, ${a.sequenceId}, ${a.contactId}, ${a.dealId}, ${a.actorUserId}, ${`USER:${a.actorUserId}`}, ${a.version}, 0,
           (${at}::timestamptz AT TIME ZONE 'UTC'), 'ACTIVE'::"CrmEnrollStatus", (${at}::timestamptz AT TIME ZONE 'UTC'), (${at}::timestamptz AT TIME ZONE 'UTC')
     WHERE (SELECT count(*) FROM "CrmSequenceEnrollment" e WHERE e."sequenceId" = ${a.sequenceId} AND e."status" = 'ACTIVE'::"CrmEnrollStatus") < ${a.maxActive}
    RETURNING "id"`;
  const id = String(rows[0]?.id ?? "");
  if (!id) {
    throw fail("CONFLICT", `ลำดับนี้มีผู้ติดต่อกำลังเดินครบ ${a.maxActive.toLocaleString("th-TH")} คนแล้ว — รอให้บางคนจบก่อน หรือเพิ่มจำนวนสูงสุดในหน้าตั้งค่าลำดับ`);
  }
  return { id, ...base };
}

/**
 * ลงทะเบียน 1 คนใน tx เดียว (ผู้เรียกตรวจการมองเห็น/opt-out แล้ว)
 * AUDIT-CLASS X3: FOR SHARE บนแถวลำดับ (รอการแก้ขั้นที่ถือ FOR UPDATE) · แถว ACTIVE/PAUSED เดิม = CONFLICT (replace ⇒ หยุด "REPLACED"
 *   แบบมีเงื่อนไข) · แถวใหม่ถูกตัดสินโดย partial UNIQUE ของฐาน — ผู้แพ้ได้ CONFLICT ภาษาไทย ไม่ใช่ 500
 */
async function enrollOne(
  ctx: SequencesCtx,
  actorUserId: string,
  sequenceId: string,
  contactId: string,
  dealId: string | null,
  replace: boolean,
  opts: { audit: boolean },
): Promise<{ id: string; replaced: boolean }> {
  const now = new Date();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "CrmSequence" WHERE "id" = ${sequenceId} FOR SHARE`;
      const seq = await loadSequence(ctx, sequenceId, tx);
      // สวิตช์ "เปิดรับคนใหม่" = ด่านนี้ที่เดียว (คนที่เดินอยู่แล้วไม่ถูกแตะ — มติรีวิว C2.2 ข้อ 2 ทางเลือก (ก))
      if (!seq.active) throw fail("CONFLICT", "ลำดับการติดตามนี้ปิดรับคนใหม่อยู่ — เปิด “เปิดรับคนใหม่” ในหน้าลำดับก่อนแล้วค่อยลงทะเบียน");
      const live = await tx.crmSequenceEnrollment.findMany({ where: { sequenceId: seq.id, contactId, status: { in: ACTIVE_OR_PAUSED } }, select: { id: true, tenantId: true, sequenceId: true, contactId: true } });
      if (live.length > 0 && !replace) throw fail("CONFLICT", ALREADY_IN);
      let replaced = false;
      for (const r of live) if (await stopOneTx(tx, ctx.systemId, r, "REPLACED", now)) replaced = true;
      const row = await insertEnrollment(tx, {
        tenantId: ctx.tenantId,
        sequenceId: seq.id,
        contactId,
        dealId,
        actorUserId,
        version: seq.version,
        now,
        maxActive: seq.maxActive,
      });
      await emitEnrolled(tx, ctx.systemId, row);
      if (opts.audit) await auditTx(tx, ctx, actorUserId, "crm.sequence.enroll", "CrmSequenceEnrollment", row.id, { after: { sequenceId: seq.id, contactId, dealId, version: seq.version, replaced } });
      return { id: row.id, replaced };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw fail("CONFLICT", ALREADY_IN);
    throw e;
  }
}

export async function enroll(ctx: SequencesCtx, actor: MemberActor, input: EnrollInput): Promise<EnrollResult> {
  const a = await enter(ctx, actor, [ENROLL_KEY]);
  const seq = await loadSequence(ctx, input?.sequenceId);
  const contact = await loadVisibleContact(ctx, a, input?.contactId);
  let dealId: string | null = null;
  if (str(input?.dealId)) {
    const deal = await prisma.crmDeal.findFirst({ where: { AND: [await dealWhere(ctx, a), { id: str(input.dealId) }] }, select: { id: true } });
    if (!deal) throw fail("NOT_FOUND", DEAL_NOT_FOUND);
    dealId = deal.id;
  }
  // AUDIT-CLASS X8: ผู้ติดต่อที่ขอไม่รับข่าวสาร = ไม่มีแถว (ขั้นส่งจะถูกกันซ้ำอีกชั้นตอนทำงานจริง)
  if (contact.marketingOptOut) return { skipped: true, reason: OPTED_OUT };
  const r = await enrollOne(ctx, a.userId, seq.id, contact.id, dealId, input?.replace === true, { audit: true });
  return { enrollmentId: r.id, id: r.id, status: r.replaced ? "REPLACED" : "ENROLLED" };
}

function reasonOf(opts: { confirm?: boolean | null; reason?: string | null } | null | undefined, what: string): string {
  if (opts?.confirm !== true) throw fail("VALIDATION", `${what}ต้องกดยืนยันก่อน — ติ๊กช่องยืนยันแล้วลองอีกครั้ง`);
  const reason = str(opts.reason);
  if (reason.length < SEQ_REASON_MIN) throw fail("VALIDATION", `${what}ต้องใส่เหตุผลอย่างน้อย ${SEQ_REASON_MIN} ตัวอักษร (เก็บไว้ในประวัติการแก้ไข)`);
  return reason.slice(0, SEQ_REASON_MAX);
}

export type BulkEnrollInput = { sequenceId: string; contactIds: string[]; confirm?: boolean | null; reason?: string | null; replace?: boolean };
export type BulkEnrollResult = { enrolled: number; replaced: number; conflicts: number; skipped: { contactId: string; reason: string }[] };

/**
 * AUDIT-CLASS X9: ลงทะเบียนเป็นกลุ่ม = การกระทำอันตราย — ยืนยัน + เหตุผล ≥ 5 ตัวอักษร · ≤ 500 คน ตรวจก่อนแตะอะไรทั้งหมด (ไม่ผ่าน = ไม่เขียนเลย)
 * ผู้ติดต่อที่มองไม่เห็น/ขอไม่รับข่าวสาร = ข้าม (บอกเหตุผล) · ที่อยู่ในลำดับแล้ว = นับเป็น conflicts (replace ⇒ เริ่มใหม่)
 * 🔴 ประวัติ **สองแถว: ก่อนเริ่ม (`started`) และเมื่อจบ (`done`)** (มติผู้คุมงานรอบสอง ข้อ 3)
 *   เดิมเขียนแถวเดียวหลังวนจบและอยู่นอกธุรกรรม ⇒ เครื่องดับกลางทาง (หลักฐาน: SIGKILL ตอนคนที่ 21 จาก 500) = มีคนถูกใส่เข้าลำดับ
 *   21 คน + event ครบ แต่สมุดตรวจ "ว่างเปล่า" และ **เหตุผลที่ผู้ใช้พิมพ์หายไปทั้งหมด** ⇒ ตอบไม่ได้ว่าใครสั่งและสั่งเพราะอะไร
 *   แถวแรกจึงเขียนก่อนแตะแถวลงทะเบียนแถวแรก (เหตุผล + รายการ id + ผู้ทำ) · แถวหลังเก็บผลรวมไว้เทียบกัน
 */
export async function bulkEnroll(ctx: SequencesCtx, actor: MemberActor, input: BulkEnrollInput): Promise<BulkEnrollResult> {
  const a = await enter(ctx, actor, [ENROLL_KEY]);
  const reason = reasonOf(input, "การใส่ผู้ติดต่อเข้าลำดับการติดตามเป็นกลุ่ม");
  const raw = Array.isArray(input?.contactIds) ? input.contactIds : [];
  const ids = [...new Set(raw.map(str).filter(Boolean))];
  if (ids.length === 0) throw fail("VALIDATION", "เลือกผู้ติดต่ออย่างน้อย 1 คนก่อนลงทะเบียน");
  if (raw.length > SEQ_BULK_MAX || ids.length > SEQ_BULK_MAX) throw fail("VALIDATION", `ลงทะเบียนเป็นกลุ่มได้ครั้งละไม่เกิน ${SEQ_BULK_MAX} คน — แบ่งเป็นหลายรอบแล้วลองอีกครั้ง`);
  const seq = await loadSequence(ctx, input.sequenceId);
  // X9 · ข้อ 3: "เริ่มแล้ว" ถูกบันทึกก่อนการเขียนครั้งแรก — เครื่องดับกลางทางก็ยังตอบได้ว่าใครสั่ง สั่งกับใคร และเพราะอะไร
  await auditTx(prisma, ctx, a.userId, "crm.sequence.bulk_enroll", "CrmSequence", seq.id, {
    after: { phase: "started", reason, requested: ids.length, replace: input.replace === true, contactIds: ids },
  });
  const visible = await prisma.crmContact.findMany({ where: { AND: [await contactWhere(ctx, a), { id: { in: ids }, archivedAt: null, mergedIntoId: null }] }, select: { id: true, marketingOptOut: true } });
  const byId = new Map(visible.map((c) => [c.id, c]));
  const out: BulkEnrollResult = { enrolled: 0, replaced: 0, conflicts: 0, skipped: [] };
  const enrolledIds: string[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) {
      out.skipped.push({ contactId: id, reason: "ไม่พบผู้ติดต่อนี้ หรือบัญชีนี้ยังมองไม่เห็น" });
      continue;
    }
    if (c.marketingOptOut) {
      out.skipped.push({ contactId: id, reason: OPTED_OUT });
      continue;
    }
    try {
      const r = await enrollOne(ctx, a.userId, seq.id, id, null, input.replace === true, { audit: false });
      out.enrolled += 1;
      if (r.replaced) out.replaced += 1;
      enrolledIds.push(r.id);
    } catch (e) {
      if (e instanceof SequenceError && e.code === "CONFLICT") out.conflicts += 1;
      else out.skipped.push({ contactId: id, reason: errText(e, "ลงทะเบียนไม่สำเร็จ") });
    }
  }
  await auditTx(prisma, ctx, a.userId, "crm.sequence.bulk_enroll", "CrmSequence", seq.id, {
    after: { phase: "done", reason, requested: ids.length, enrolled: out.enrolled, replaced: out.replaced, conflicts: out.conflicts, skipped: out.skipped.length, enrollmentIds: enrolledIds },
  });
  return out;
}

// ───────────────────────── หยุด · พัก · เดินต่อ ─────────────────────────

export async function stop(ctx: SequencesCtx, actor: MemberActor, enrollmentId: string, opts: { reason?: string | null } = {}): Promise<{ stopped: boolean; status: string }> {
  const a = await enter(ctx, actor, [ENROLL_KEY]);
  const row = await loadEnrollment(ctx, a, enrollmentId);
  const note = str(opts?.reason).slice(0, SEQ_REASON_MAX);
  const done = await prisma.$transaction(async (tx) => {
    const ok = await stopOneTx(tx, ctx.systemId, row, "MANUAL", new Date());
    if (ok) await auditTx(tx, ctx, a.userId, "crm.sequence.stop", "CrmSequenceEnrollment", row.id, { before: { status: row.status, stepIndex: row.stepIndex }, after: { status: "STOPPED", reason: "MANUAL", note: note || undefined } });
    return ok;
  });
  return { stopped: done, status: done ? "STOPPED" : row.status };
}

export async function pause(ctx: SequencesCtx, actor: MemberActor, enrollmentId: string): Promise<{ status: "PAUSED" }> {
  const a = await enter(ctx, actor, [ENROLL_KEY]);
  const row = await loadEnrollment(ctx, a, enrollmentId);
  const n = await prisma.$transaction(async (tx) => {
    // lease คงไว้ (ขั้นที่กำลังทำอยู่เลื่อนขั้นได้ตามปกติ แล้วแถวคงสถานะพัก)
    const r = await tx.crmSequenceEnrollment.updateMany({ where: { id: row.id, status: "ACTIVE" }, data: { status: "PAUSED" } });
    if (r.count === 1) await auditTx(tx, ctx, a.userId, "crm.sequence.pause", "CrmSequenceEnrollment", row.id, { before: { status: "ACTIVE" }, after: { status: "PAUSED" } });
    return r.count;
  });
  if (n === 1) return { status: "PAUSED" };
  const now = await prisma.crmSequenceEnrollment.findUnique({ where: { id: row.id }, select: { status: true } });
  if (now?.status === "PAUSED") return { status: "PAUSED" };
  throw fail("CONFLICT", "การลงทะเบียนนี้จบไปแล้ว — พักไม่ได้");
}

export async function resume(ctx: SequencesCtx, actor: MemberActor, enrollmentId: string): Promise<{ status: "ACTIVE" }> {
  const a = await enter(ctx, actor, [ENROLL_KEY]);
  const row = await loadEnrollment(ctx, a, enrollmentId);
  try {
    const n = await prisma.$transaction(async (tx) => {
      const r = await tx.crmSequenceEnrollment.updateMany({ where: { id: row.id, status: "PAUSED" }, data: { status: "ACTIVE", ...(row.nextAt ? {} : { nextAt: new Date() }) } });
      if (r.count === 1) await auditTx(tx, ctx, a.userId, "crm.sequence.resume", "CrmSequenceEnrollment", row.id, { before: { status: "PAUSED" }, after: { status: "ACTIVE" } });
      return r.count;
    });
    if (n === 1) return { status: "ACTIVE" };
  } catch (e) {
    if (isUniqueViolation(e)) throw fail("CONFLICT", "ผู้ติดต่อนี้มีการลงทะเบียนที่กำลังเดินอยู่ในลำดับเดียวกันแล้ว — หยุดอันนั้นก่อนแล้วค่อยเดินต่ออันนี้");
    throw e;
  }
  const now = await prisma.crmSequenceEnrollment.findUnique({ where: { id: row.id }, select: { status: true } });
  if (now?.status === "ACTIVE") return { status: "ACTIVE" };
  throw fail("CONFLICT", "การลงทะเบียนนี้จบไปแล้ว — เดินต่อไม่ได้ (ลงทะเบียนใหม่แทนได้)");
}

/**
 * เหตุหยุดที่รับได้ — **รายการปิด** (มติผู้คุมงานรีวิว C2.2 ข้อ 7)
 * AUDIT-CLASS X8: เดิมตัวนี้แปลงสตริงอะไรก็ได้เป็นโค้ด ⇒ ผู้เรียก (C2.4/C2.5) ที่เผลอส่ง "เหตุผล" จริงเข้ามา เช่น
 *   อีเมลที่ตีกลับ `customer@shop.co.th` จะกลายเป็น `CUSTOMER_SHOP_CO_TH` แล้วไหลเข้า payload ของ `crm.sequence.finished`
 *   ซึ่ง `withWebhooks` ส่งออกไปยังปลายทางของร้าน — ข้อมูลส่วนบุคคลหลุดโดยที่ตัวกรอง X8.5 มองไม่เห็น
 * ⇒ รับเฉพาะโค้ดที่เอกสารประกาศไว้ · นอกรายการ = VALIDATION (ผู้เรียกรู้ทันที ไม่ใช่เงียบ ๆ แล้วเขียนโค้ดประหลาดลงฐาน)
 */
export const SEQ_STOP_CODES = ["REPLY", "WON", "LOST", "OPT_OUT", "BOUNCE", "MANUAL", "REPLACED", "CONTACT_GONE"] as const;
export type SeqStopCode = (typeof SEQ_STOP_CODES)[number];
const STOP_CODE_SET: ReadonlySet<string> = new Set(SEQ_STOP_CODES);
const stopCode = (reason: unknown): SeqStopCode => {
  const s = String(reason ?? "").trim().toUpperCase();
  if (!STOP_CODE_SET.has(s)) {
    throw fail("VALIDATION", `เหตุที่หยุดลำดับการติดตามต้องเป็นหนึ่งใน ${SEQ_STOP_CODES.join(" · ")} — ค่าอื่นระบบไม่รับเพื่อไม่ให้ข้อมูลของลูกค้าหลุดออกไปกับเหตุการณ์`);
  }
  return s as SeqStopCode;
};

/**
 * ทางเข้าเดียวของการหยุดอัตโนมัติ (R-A) — C2.4 (แชทตอบกลับ) · C2.5 (อีเมลตอบกลับ/ตีกลับ/ยกเลิกรับ) · ตัวรับ event ของใบนี้ (ชนะ/แพ้/opt-out)
 * AUDIT-CLASS X1: ขอบเขต = ร้านของ ctx (+ ระบบถ้าให้มา) — id ของร้านอื่นไม่มีวันถูกหยุด
 * REPLY/WON/LOST เคารพธง stopOnReply/stopOnWon/stopOnLost ของลำดับ · `opts.dealId` = เฉพาะแถวที่ผูกดีลนั้น (ไม่ดูผู้ติดต่อ)
 * AUDIT-CLASS X3 · X4: หยุดทีละแถวแบบมีเงื่อนไข ⇒ เรียกซ้ำ/พร้อมกันกี่ครั้ง = เปลี่ยนสถานะครั้งเดียว · finished ครั้งเดียว
 */
export async function stopFor(ctx: { tenantId: string; systemId?: string | null }, contactId: string, reason: SeqStopCode | string, opts: { dealId?: string | null } = {}): Promise<number> {
  const tenantId = str(ctx?.tenantId);
  const dealId = str(opts?.dealId);
  const cid = str(contactId);
  if (!tenantId || (!dealId && !cid)) return 0;
  const code = stopCode(reason);
  const flag: Prisma.CrmSequenceWhereInput = code === "REPLY" ? { stopOnReply: true } : code === "WON" ? { stopOnWon: true } : code === "LOST" ? { stopOnLost: true } : {};
  const rows = await prisma.crmSequenceEnrollment.findMany({
    where: {
      tenantId,
      status: { in: ACTIVE_OR_PAUSED },
      ...(dealId ? { dealId } : { contactId: cid }),
      sequence: { tenantId, ...(str(ctx.systemId) ? { systemId: str(ctx.systemId) } : {}), ...flag },
    },
    select: { id: true, tenantId: true, sequenceId: true, contactId: true, status: true, stepIndex: true, sequence: { select: { systemId: true } } },
    take: 500,
  });
  let stopped = 0;
  const at = new Date();
  for (const r of rows) {
    const ok = await prisma.$transaction(async (tx) => {
      const done = await stopOneTx(tx, r.sequence.systemId, r, code, at);
      if (done) await auditTx(tx, { tenantId }, null, "crm.sequence.auto_stop", "CrmSequenceEnrollment", r.id, { before: { status: r.status, stepIndex: r.stepIndex }, after: { status: "STOPPED", reason: code } });
      return done;
    });
    if (ok) stopped += 1;
  }
  return stopped;
}

// ───────────────────────── อ่าน: การลงทะเบียน · สถิติ ─────────────────────────

type LogEntry = { v: number; index: number; kind: string; outcome: SeqOutcome; reason: string | null; at: string };
const logOf = (stats: Prisma.JsonValue | null): LogEntry[] => {
  const s = stats && typeof stats === "object" && !Array.isArray(stats) ? (stats as Record<string, unknown>) : {};
  return Array.isArray(s.log) ? (s.log.filter((x) => x && typeof x === "object") as unknown as LogEntry[]) : [];
};

export type EnrollmentDto = {
  id: string;
  sequenceId: string;
  sequenceName: string;
  contactId: string;
  contactName: string;
  dealId: string | null;
  status: SeqEnrollStatus;
  stepIndex: number;
  sequenceVersion: number;
  nextAt: string | null;
  stoppedReason: string | null;
  stoppedAt: string | null;
  enrolledBy: string;
  createdAt: string;
  steps: { index: number; kind: string; label: string; outcome: SeqOutcome | null; reason: string | null; at: string | null }[];
};

export async function getEnrollment(ctx: SequencesCtx, actor: MemberActor, id: string): Promise<EnrollmentDto> {
  const a = await enter(ctx, actor, [ENROLL_KEY, MANAGE_KEY]);
  const row = await loadEnrollment(ctx, a, id);
  const [steps, contact] = await Promise.all([
    prisma.crmSequenceStep.findMany({ where: { sequenceId: row.sequenceId, version: row.sequenceVersion }, orderBy: { index: "asc" } }),
    prisma.crmContact.findUnique({ where: { id: row.contactId }, select: { name: true, firstName: true, lastName: true } }),
  ]);
  const log = logOf(row.stats).filter((l) => Number(l.v) === row.sequenceVersion);
  return {
    ...enrollmentHead(row, row.sequence.name, contactNameOf(contact)),
    steps: steps.map((s) => {
      const last = [...log].reverse().find((l) => Number(l.index) === s.index);
      return { index: s.index, kind: s.kind, label: stepDto(s).label, outcome: last?.outcome ?? null, reason: last?.reason ?? null, at: last?.at ?? null };
    }),
  };
}

const contactNameOf = (c: { name: string | null; firstName: string | null; lastName: string | null } | null): string =>
  c ? c.name || [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "ผู้ติดต่อ" : "ผู้ติดต่อ";

function enrollmentHead(row: { id: string; sequenceId: string; contactId: string; dealId: string | null; status: string; stepIndex: number; sequenceVersion: number; nextAt: Date | null; stoppedReason: string | null; stoppedAt: Date | null; enrolledBy: string; createdAt: Date }, sequenceName: string, contactName: string): Omit<EnrollmentDto, "steps"> {
  return {
    id: row.id,
    sequenceId: row.sequenceId,
    sequenceName,
    contactId: row.contactId,
    contactName,
    dealId: row.dealId,
    status: row.status as SeqEnrollStatus,
    stepIndex: row.stepIndex,
    sequenceVersion: row.sequenceVersion,
    nextAt: row.nextAt?.toISOString() ?? null,
    stoppedReason: row.stoppedReason,
    stoppedAt: row.stoppedAt?.toISOString() ?? null,
    enrolledBy: row.enrolledBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** แถวในตาราง "ลงทะเบียนอยู่" ของหน้าตัวแก้ไข (ภาพ 07 ล่าง: ผู้ติดต่อ · บริษัท · ขั้นปัจจุบัน · เข้าเมื่อ) */
export type EnrollmentListItem = Omit<EnrollmentDto, "steps"> & { stepCount: number; currentStep: string | null; companyName: string | null };

/** AUDIT-CLASS X1: เฉพาะแถวของระบบนี้ที่ผู้ติดต่อ "มองเห็นได้" (visibleWhere CONTACT) */
export async function listEnrollments(ctx: SequencesCtx, actor: MemberActor, opts: { sequenceId?: string | null; contactId?: string | null; status?: string | null; take?: number } = {}): Promise<{ items: EnrollmentListItem[] }> {
  const a = await enter(ctx, actor, [ENROLL_KEY, MANAGE_KEY]);
  const status = str(opts.status).toUpperCase();
  const rows = await prisma.crmSequenceEnrollment.findMany({
    where: {
      tenantId: ctx.tenantId,
      sequence: { systemId: ctx.systemId },
      contact: await contactWhere(ctx, a),
      ...(str(opts.sequenceId) ? { sequenceId: str(opts.sequenceId) } : {}),
      ...(str(opts.contactId) ? { contactId: str(opts.contactId) } : {}),
      ...(["ACTIVE", "PAUSED", "DONE", "STOPPED"].includes(status) ? { status: status as SeqEnrollStatus } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(opts.take ?? 200, 1), 500),
    include: { sequence: { select: { name: true } }, contact: { select: { name: true, firstName: true, lastName: true, company: true, companyId: true } } },
  });
  const keys = [...new Set(rows.map((r) => `${r.sequenceId}:${r.sequenceVersion}`))];
  // ชื่อบริษัทของผู้ติดต่อ (คอลัมน์ "บริษัท" ของภาพ 07 ล่าง) — แคช `companyId` ก่อน แล้วค่อยตกไปที่ชื่อที่พิมพ์เอง
  // AUDIT-CLASS X1: บริษัทผ่าน `companyWhere` เหมือนทุกที่ (บริษัทที่ actor มองไม่เห็น = ไม่มีชื่อ ไม่ใช่ชื่อหลุด)
  const coIds = [...new Set(rows.map((r) => r.contact?.companyId).filter((x): x is string => !!x))];
  const [steps, cos] = await Promise.all([
    keys.length
      ? prisma.crmSequenceStep.findMany({ where: { OR: keys.map((k) => ({ sequenceId: k.split(":")[0]!, version: Number(k.split(":")[1]) })) }, orderBy: { index: "asc" } })
      : Promise.resolve([]),
    coIds.length
      ? prisma.crmCompany.findMany({ where: { AND: [await companyWhere(ctx, a), { id: { in: coIds }, archivedAt: null, mergedIntoId: null }] }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const coName = new Map(cos.map((c) => [c.id, c.name]));
  return {
    items: rows.map((r) => {
      const mine = steps.filter((s) => s.sequenceId === r.sequenceId && s.version === r.sequenceVersion);
      const cur = mine.find((s) => s.index === r.stepIndex);
      return {
        ...enrollmentHead(r, r.sequence.name, contactNameOf(r.contact)),
        stepCount: mine.length,
        currentStep: cur ? stepDto(cur).label : null,
        companyName: (r.contact?.companyId ? (coName.get(r.contact.companyId) ?? null) : null) ?? (str(r.contact?.company) || null),
      };
    }),
  };
}

export type SequenceStats = {
  version: number;
  versions: number[];
  totals: Record<SeqEnrollStatus, number>;
  steps: { index: number; kind: string; label: string; sent: number; skipped: number; failed: number; active: number }[];
};

/**
 * สถิติต่อขั้น — AUDIT-CLASS X3: นับจาก "บันทึกของแต่ละแถวลงทะเบียน" (แต่ละแถวมีตัวรันถือ lease ได้ทีละตัว) รวมด้วย SQL คำสั่งเดียว
 * ไม่มีตัวนับกลาง/แผนที่ JSON ที่อ่าน-แก้-เขียน ⇒ ส่งพร้อมกันกี่ทางก็ไม่หาย · sent = ส่งสำเร็จ/สร้างงานแล้ว/ผ่านขั้นรอ
 */
export async function stats(ctx: SequencesCtx, actor: MemberActor, sequenceId: string, opts: { version?: number | null; includeArchived?: boolean } = {}): Promise<SequenceStats> {
  await enter(ctx, actor, [ENROLL_KEY, MANAGE_KEY]);
  const seq = await loadSequence(ctx, sequenceId, prisma, { includeArchived: opts.includeArchived === true });
  const version = Number.isInteger(opts.version) && (opts.version as number) >= 1 && (opts.version as number) <= seq.version ? (opts.version as number) : seq.version;
  const [steps, agg, active, totals] = await Promise.all([
    prisma.crmSequenceStep.findMany({ where: { sequenceId: seq.id, version }, orderBy: { index: "asc" } }),
    prisma.$queryRaw<{ idx: number; outcome: string; n: number }[]>`
      SELECT (x->>'index')::int AS idx, x->>'outcome' AS outcome, count(*)::int AS n
        FROM "CrmSequenceEnrollment" e
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e."stats"->'log') = 'array' THEN e."stats"->'log' ELSE '[]'::jsonb END) x
       WHERE e."sequenceId" = ${seq.id} AND e."tenantId" = ${ctx.tenantId} AND (x->>'v')::int = ${version}
       GROUP BY 1, 2`,
    prisma.crmSequenceEnrollment.groupBy({ by: ["stepIndex"], where: { sequenceId: seq.id, sequenceVersion: version, status: "ACTIVE" }, _count: { _all: true } }),
    prisma.crmSequenceEnrollment.groupBy({ by: ["status"], where: { sequenceId: seq.id, sequenceVersion: version }, _count: { _all: true } }),
  ]);
  const t: Record<SeqEnrollStatus, number> = { ACTIVE: 0, PAUSED: 0, DONE: 0, STOPPED: 0 };
  for (const g of totals) t[g.status as SeqEnrollStatus] = g._count._all;
  const count = (idx: number, ...o: string[]) => agg.filter((r) => Number(r.idx) === idx && o.includes(r.outcome)).reduce((s, r) => s + Number(r.n), 0);
  return {
    version,
    versions: Array.from({ length: seq.version }, (_, i) => i + 1),
    totals: t,
    steps: steps.map((s) => ({
      index: s.index,
      kind: s.kind,
      label: stepDto(s).label,
      sent: count(s.index, "SENT", "DONE"),
      skipped: count(s.index, "SKIPPED"),
      failed: count(s.index, "FAILED"),
      active: active.find((g) => g.stepIndex === s.index)?._count._all ?? 0,
    })),
  };
}

export type SequenceVersionCount = { version: number; live: number; total: number };

/**
 * จำนวนคนต่อเวอร์ชันของลำดับ (ที่มาของป้าย "ยังมีคนเดินอยู่บนเวอร์ชันอื่น" และตัวเลขในตัวเลือกเวอร์ชัน)
 * 🔴 มติผู้คุมงานรอบสอง ข้อ 2: **ห้ามนับจากรายการที่แบ่งหน้า** — เดิมหน้าจอนับจาก `listEnrollments(take: 500)` ⇒ ร้านที่มีคนเกิน 500
 *   เห็น "เวอร์ชันเก่า 0 คน" เงียบ ๆ (หลักฐาน: 600 คนบนเวอร์ชัน 1 + 500 คนบนเวอร์ชัน 2 ⇒ ป้ายอ่านได้ 0 ทั้งที่ความจริงคือ 600)
 *   ตอนนี้นับด้วย groupBy(["sequenceVersion","status"]) = ฐานนับให้ทั้งตาราง · ขอบเขตการมองเห็นเดียวกับรายการ (visibleWhere CONTACT)
 * AUDIT-CLASS X1: กรองด้วยร้าน + ระบบของ ctx + ผู้ติดต่อที่ actor มองเห็นเท่านั้น
 */
export async function versionCounts(
  ctx: SequencesCtx,
  actor: MemberActor,
  sequenceId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<SequenceVersionCount[]> {
  const a = await enter(ctx, actor, [ENROLL_KEY, MANAGE_KEY]);
  const seq = await loadSequence(ctx, sequenceId, prisma, { includeArchived: opts.includeArchived === true });
  const groups = await prisma.crmSequenceEnrollment.groupBy({
    by: ["sequenceVersion", "status"],
    where: { tenantId: ctx.tenantId, sequenceId: seq.id, sequence: { systemId: ctx.systemId }, contact: await contactWhere(ctx, a) },
    _count: { _all: true },
  });
  const top = groups.reduce((m, g) => Math.max(m, g.sequenceVersion), seq.version);
  return Array.from({ length: Math.max(top, 1) }, (_, i) => i + 1).map((version) => {
    const mine = groups.filter((g) => g.sequenceVersion === version);
    return {
      version,
      live: mine.filter((g) => g.status === "ACTIVE" || g.status === "PAUSED").reduce((n, g) => n + g._count._all, 0),
      total: mine.reduce((n, g) => n + g._count._all, 0),
    };
  });
}

// ───────────────────────── ปฏิทินวันทำการ · วันหยุด ─────────────────────────
// 🔴 NOTE รีวิวรอบสอง ข้อ N6: ปฏิทิน/วันหยุดของลำดับใช้คีย์ `crm.sequence.manage` **ตัวเดียว** ให้ตรงกับทุกทางเข้า
//    (หน้า `/crm/settings/holidays` และ server action ตรวจคีย์นี้เท่านั้น) — ทางเลือก `crm.settings.manage` เดิมไม่มีใครใช้
//    และทำให้ "สิทธิ์ที่บริการยอม" ต่างจาก "สิทธิ์ที่หน้าจอยอม" = คนอ่านโค้ดสองคนสรุปไม่เหมือนกัน

export type CalendarSettings = { businessDays: number[]; holidays: SeqHoliday[]; importYears: number[] };

export async function calendarSettings(ctx: SequencesCtx, actor: MemberActor): Promise<CalendarSettings> {
  await enter(ctx, actor, [MANAGE_KEY]);
  const sys = await resolveSystem(ctx);
  const crm = sys.settings && typeof sys.settings === "object" && !Array.isArray(sys.settings) ? (sys.settings as Record<string, unknown>).crm : null;
  // 🔴 ปีที่นำเข้าได้มาจากทะเบียนเดียว `THAI_HOLIDAY_YEARS` (sequences-shared) — เคยฮาร์ดโค้ด [2026, 2027] ไว้ที่นี่
  //    ⇒ วันที่เติมปีใหม่ในทะเบียน หน้าจอจะยังเสนอปีเก่าเงียบ ๆ (ข้อสอบเน่าตามเวลา — feedback_oracle_rots_over_time)
  return { ...parseCalendar(crm), importYears: [...THAI_HOLIDAY_YEARS] };
}

/** AUDIT-CLASS X9 (NOTE รีวิว C2.2): เปลี่ยนค่า + เขียนประวัติ "ในธุรกรรมเดียวกัน" — ไม่มีช่องที่ค่าเปลี่ยนแล้วประวัติหาย */
async function writeCalendar(ctx: SequencesCtx, actorUserId: string | null, write: (tx: Tx) => Promise<number>, after: Record<string, unknown>): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if ((await write(tx)) === 0) throw fail("NOT_FOUND", SYSTEM_NOT_FOUND);
    await auditTx(tx, ctx, actorUserId, "crm.sequence.calendar", "AppSystem", ctx.systemId, { after });
  });
}

export async function setBusinessDays(ctx: SequencesCtx, actor: MemberActor, days: number[]): Promise<CalendarSettings> {
  const a = await enter(ctx, actor, [MANAGE_KEY]);
  const clean = Array.isArray(days) ? [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
  if (clean.length === 0) throw fail("VALIDATION", "เลือกวันทำการอย่างน้อย 1 วัน");
  await writeCalendar(ctx, a.userId, (tx) => setCrmBusinessDays(ctx, clean, tx), { businessDays: [...clean].sort() });
  return calendarSettings(ctx, a);
}

export async function addHoliday(ctx: SequencesCtx, actor: MemberActor, input: { date: string; name?: string | null }): Promise<CalendarSettings> {
  const a = await enter(ctx, actor, [MANAGE_KEY]);
  const date = str(input?.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw fail("VALIDATION", "เลือกวันที่ของวันหยุด (ปี-เดือน-วัน)");
  const name = str(input?.name).slice(0, 120);
  await writeCalendar(ctx, a.userId, (tx) => mergeCrmHolidays(ctx, [{ date, name }], tx), { holidayAdded: date });
  return calendarSettings(ctx, a);
}

export async function removeHoliday(ctx: SequencesCtx, actor: MemberActor, date: string): Promise<CalendarSettings> {
  const a = await enter(ctx, actor, [MANAGE_KEY]);
  const d = str(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw fail("VALIDATION", "วันที่ของวันหยุดไม่ถูกต้อง — รีเฟรชหน้าแล้วลองใหม่");
  await writeCalendar(ctx, a.userId, (tx) => removeCrmHoliday(ctx, d, tx), { holidayRemoved: d });
  return calendarSettings(ctx, a);
}

/**
 * นำเข้าวันหยุดราชการไทยของปี N (ค.ศ. 2026–2027 หรือ พ.ศ. 2569–2570 · รายการตายตัวในโค้ด — R-E.9)
 * รวมเข้ารายการเดิมด้วยคำสั่ง jsonb_set เดียว (วันที่ซ้ำไม่เพิ่ม · คีย์อื่นของ settings.crm ไม่ถูกแตะ)
 */
export async function importThaiHolidays(ctx: SequencesCtx, actor: MemberActor, year: number): Promise<{ added: number; total: number; year: number }> {
  const a = await enter(ctx, actor, [MANAGE_KEY]);
  const ce = thaiHolidayYear(year);
  if (ce === null) throw fail("VALIDATION", "มีรายการวันหยุดราชการให้นำเข้าเฉพาะปี 2569 และ 2570 (ค.ศ. 2026–2027) — ปีอื่นเพิ่มวันหยุดเองได้ทีละวัน");
  const before = (await calendarSettings(ctx, a)).holidays.length;
  await writeCalendar(ctx, a.userId, (tx) => mergeCrmHolidays(ctx, thaiPublicHolidays(ce), tx), { importedYear: ce });
  const after = (await calendarSettings(ctx, a)).holidays.length;
  return { added: after - before, total: after, year: ce };
}

// ───────────────────────── runDue: ขั้นที่ถึงเวลา ─────────────────────────

// CRM C2.5 ▸ `stepId` = แถวขั้นที่กำลังทำ — ตัวส่งอีเมลปริยาย (emails.sendAsSystem) เก็บลง
//   `CrmEmailMessage.sequenceStepId` เพื่อให้สถิติต่อขั้นและไทม์ไลน์ชี้กลับมาที่ขั้นนี้ได้ ◂
type SeqSubject = { tenantId: string; systemId: string; contact: CrmContact; dealId: string | null; enrollmentId: string; sequenceId: string; version: number; stepId: string | null };
type SeqEnv = RunnerEnv<SeqSubject> & { deps: SequenceDeps | null };

const CHANNEL_LABEL: Record<RunnerChannel, string> = { LINE: "LINE", EMAIL: "อีเมล", SMS: "SMS", PUSH: "แจ้งเตือน" };
const NO_ADDRESS: Record<RunnerChannel, string> = {
  EMAIL: "ไม่ได้ส่ง — ผู้ติดต่อนี้ยังไม่มีอีเมล จึงข้ามไปขั้นถัดไป",
  LINE: "ไม่ได้ส่ง — ผู้ติดต่อนี้ยังไม่มีบัญชี LINE ที่ผูกไว้ จึงข้ามไปขั้นถัดไป",
  SMS: "ไม่ได้ส่ง — ผู้ติดต่อนี้ยังไม่มีเบอร์มือถือ จึงข้ามไปขั้นถัดไป",
  PUSH: "ไม่ได้ส่ง — ไม่มีผู้รับแจ้งเตือน",
};

/** แทนค่า `{{contact.firstName}}` … **รอบเดียว** (ค่าที่แทนเข้าไปไม่ถูกสแกนซ้ำ) · ตัวแปรที่ไม่รู้จัก = ว่าง (ไม่มี {{ หลุดถึงลูกค้า) */
function renderVars(template: string, vars: Record<string, string | undefined>): string {
  return String(template ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_w, key: string) => vars[key] ?? "");
}

async function tenantOwnerId(tenantId: string): Promise<string | null> {
  const m = await prisma.membership.findFirst({ where: { tenantId, role: "OWNER" }, orderBy: { createdAt: "asc" }, select: { userId: true } });
  return m?.userId ?? null;
}

/**
 * ผู้ส่งปริยายเมื่อไม่ได้ฉีด deps — LINE: ตัวส่งของกฎ CRM (แชท) · SMS: ข้าม
 * CRM C2.5 ▸ อีเมล: `emails.sendAsSystem` (R-E.5 — ตัวยึด "ยังไม่เปิด" ของ C2.2 ถูกแทนแล้ว)
 *   🔴 import ตอนใช้: `crm/emails.ts` เรียก `sequences.stopFor` กลับมาที่ไฟล์นี้ ⇒ import แบบ static สองทาง = วงจร
 *   🔴 ความยินยอมถูกถามสองชั้นโดยเจตนา (ตัวรันกลางถามก่อนเรียกตัวส่ง · `sendAsSystem` ถามอีกครั้งตอนส่งจริง)
 *      — ชั้นที่สองคือชั้นที่ผูกกับ "การส่งจริง" ตาม AUDIT-CLASS X8 ◂
 */
async function defaultSender(channel: RunnerChannel, env: SeqEnv, core: RunnerSendCore): Promise<RunnerSendResult> {
  if (channel === "EMAIL") {
    try {
      const emails = await import("./emails");
      const body = String(core.body ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
      const r = await emails.sendAsSystem(
        { tenantId: env.subject.tenantId, systemId: env.subject.systemId },
        {
          contactId: env.subject.contact.id,
          dealId: env.subject.dealId,
          to: [core.to],
          subject: core.subject ?? "",
          bodyHtml: `<p>${body}</p>`,
          ...(env.subject.stepId ? { sequenceStepId: env.subject.stepId } : {}),
        },
      );
      if (r.status === "FAILED") return { ok: false, error: "ส่งอีเมลไม่สำเร็จ — ระบบจะลองขั้นนี้อีกครั้งในรอบถัดไป" };
      return { ok: true };
    } catch (e) {
      const code = (e as { code?: unknown })?.code;
      const msg = errText(e, "ส่งอีเมลไม่สำเร็จ");
      // ถูกกติกาความยินยอม/ข้อมูลปฏิเสธ = ข้ามขั้น (ไม่ใช่ความล้มเหลวที่ต้องลองใหม่)
      if (code === "EMAIL_BLOCKED" || code === "VALIDATION" || code === "NOT_FOUND") return { ok: false, skipped: true, error: msg };
      return { ok: false, error: msg };
    }
  }
  if (channel === "LINE")
    return CRM_DEFAULT_DEPS.line({
      tenantId: env.subject.tenantId,
      systemId: env.subject.systemId,
      ruleId: env.subject.sequenceId,
      runId: env.subject.enrollmentId,
      contactId: env.subject.contact.id,
      partyId: env.subject.contact.partyId ?? null,
      ...core,
    });
  return Promise.resolve({ ok: false, skipped: true, error: SMS_NOT_READY });
}

// AUDIT-CLASS X8: adapter "sequence" ของตัวรันกลาง — ที่อยู่/ความยินยอมอ่านจากฐาน **ตอนขั้นทำงาน** · ตัวส่ง = deps ที่ฉีดมา (ถ้ามี) เท่านั้น
const SEQ_ADAPTER: SubjectAdapter<SeqSubject, SeqEnv> = {
  scope: "CRM_SEQUENCE",
  resolveSubject: async () => null,
  addressOf: async (s, channel) => {
    if (channel === "EMAIL") return s.contact.email?.trim() ?? "";
    if (channel === "SMS") return s.contact.phone?.trim() ?? "";
    if (channel === "LINE") return crmLineAddressOf(s.contact);
    return "";
  },
  consentOf: async (s, channel) => ((await canContact(s.contact, channel)) ? "GRANTED" : "REVOKED"),
  runDomainAction: async (kind, params, env, at) => {
    if (kind !== "SEQ_TASK") return { i: at.index, type: kind, ok: false, skipped: true, note: "ขั้นชนิดนี้ใช้ในลำดับการติดตามไม่ได้" };
    const s = env.subject;
    const deal = s.dealId ? await prisma.crmDeal.findFirst({ where: { id: s.dealId, tenantId: s.tenantId, systemId: s.systemId }, select: { id: true, ownerUserId: true } }) : null;
    const owner = deal?.ownerUserId ?? s.contact.ownerUserId ?? (await tenantOwnerId(s.tenantId));
    const vars = await SEQ_ADAPTER.messageVars(env, `${str(params.title)} ${str(params.body)}`);
    const r = await activities.createSequenceTaskOnce(
      { tenantId: s.tenantId, systemId: s.systemId },
      {
        // AUDIT-CLASS X4: กันซ้ำต่อ (แถวลงทะเบียน, เวอร์ชัน, ขั้น)
        sourceRef: `seq:${s.enrollmentId}:v${s.version}:${at.index}`,
        type: str(params.taskType) || "TASK",
        title: renderVars(str(params.title), vars) || "งานติดตามจากลำดับการติดตาม",
        body: str(params.body) ? renderVars(str(params.body), vars) : null,
        contactId: s.contact.id,
        dealId: deal?.id ?? null,
        ownerUserId: owner,
        dueAt: env.now,
      },
    );
    return { i: at.index, type: kind, ok: true, note: r.created ? "สร้างงานติดตามแล้ว" : "มีงานของขั้นนี้อยู่แล้ว (ไม่สร้างซ้ำ)" };
  },
  channelLabel: (c) => CHANNEL_LABEL[c],
  consentBlockedNote: (_c, label) => `ไม่ได้ส่ง — ณ เวลาส่ง ผู้ติดต่อไม่ได้ให้ความยินยอม ขอไม่รับข่าวสาร หรืออีเมลตีกลับ ทาง${label} จึงข้ามไปขั้นถัดไป`,
  messageVars: async (env) => {
    const c = env.subject.contact;
    const first = c.firstName?.trim() || c.name?.trim() || "ลูกค้า";
    return {
      "contact.firstName": first,
      "contact.lastName": c.lastName?.trim() ?? "",
      "contact.name": c.name?.trim() || first,
      "contact.companyName": c.company?.trim() ?? "",
    };
  },
  render: renderVars,
  send: async (env, core) => {
    if (!core.to) return { ok: false, skipped: true, error: NO_ADDRESS[core.channel] };
    const key = core.channel.toLowerCase() as "email" | "line" | "sms";
    if (env.deps) {
      const fn = env.deps[key];
      if (!fn) return { ok: false, skipped: true, error: `ยังไม่มีตัวส่งทาง${CHANNEL_LABEL[core.channel]} — ขั้นนี้จึงถูกข้าม` };
      return fn({ tenantId: env.subject.tenantId, systemId: env.subject.systemId, contactId: env.subject.contact.id, enrollmentId: env.subject.enrollmentId, channel: core.channel, to: core.to, ...(core.subject !== undefined ? { subject: core.subject } : {}), body: core.body });
    }
    return defaultSender(core.channel, env, core);
  },
  waitColumns: () => ({}),
};

type SeqCache = {
  seq: Map<string, CrmSequence | null>;
  steps: Map<string, CrmSequenceStep[]>;
  cal: Map<string, SeqCalendar>;
};

async function calendarOf(cache: SeqCache, systemId: string): Promise<SeqCalendar> {
  const hit = cache.cal.get(systemId);
  if (hit) return hit;
  const sys = await prisma.appSystem.findUnique({ where: { id: systemId }, select: { settings: true } });
  const crm = sys?.settings && typeof sys.settings === "object" && !Array.isArray(sys.settings) ? (sys.settings as Record<string, unknown>).crm : null;
  const p = parseCalendar(crm);
  const cal: SeqCalendar = { businessDays: p.businessDays, holidays: new Set(p.holidays.map((h) => h.date)) };
  cache.cal.set(systemId, cal);
  return cal;
}

type Claimed = { id: string; stepIndex: number; lease: Date };
type StepResult = "executed" | "deferred" | "finished" | "failed";

/** บันทึกผลของขั้นลงในแถวลงทะเบียน (คำสั่งเดียว · แถวนี้มีตัวรันถือ lease ได้ทีละตัว — ไม่ชนกับใคร) */
async function appendLog(tx: Tx, id: string, entry: LogEntry): Promise<void> {
  const add = JSON.stringify([entry]);
  await tx.$executeRaw`
    UPDATE "CrmSequenceEnrollment"
       SET "stats" = jsonb_set(CASE WHEN jsonb_typeof("stats") = 'object' THEN "stats" ELSE '{}'::jsonb END, '{log}',
             (CASE WHEN jsonb_typeof("stats"->'log') = 'array' THEN "stats"->'log' ELSE '[]'::jsonb END) || ${add}::jsonb, true)
     WHERE "id" = ${id}`;
}

/**
 * เลื่อนขั้นหลังทำเสร็จ — AUDIT-CLASS X5: เงื่อนไข "lease ของฉัน + ขั้นเดิม + ยังเดิน/พัก" (แถวที่ถูกหยุดระหว่างทำ = ไม่แตะ)
 * ขั้นสุดท้าย ⇒ DONE + finished ครั้งเดียว · บันทึกผลของขั้นเสมอ (ขั้นทำไปแล้วจริง แม้เลื่อนไม่ได้)
 */
async function advance(
  e: { id: string; tenantId: string; sequenceId: string; contactId: string },
  systemId: string,
  c: Claimed,
  isLast: boolean,
  nextAt: Date | null,
  entry: LogEntry | null,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const n = await tx.crmSequenceEnrollment.updateMany({
      where: { id: e.id, leaseUntil: c.lease, stepIndex: c.stepIndex, status: { in: ACTIVE_OR_PAUSED } },
      data: isLast ? { stepIndex: c.stepIndex + 1, status: "DONE", nextAt: null, leaseUntil: null } : { stepIndex: c.stepIndex + 1, nextAt, leaseUntil: null },
    });
    if (entry) await appendLog(tx, e.id, entry);
    if (n.count === 1 && isLast) await emitFinished(tx, systemId, e, "DONE");
    return n.count === 1;
  });
}

/**
 * AUDIT-CLASS X5 (NOTE รีวิว C2.2): ขั้นที่ "โยน exception" นับครั้งไว้ต่อ (เวอร์ชัน, ขั้น) ด้วยคำสั่งเดียว
 *   ครบ `MAX_STEP_ATTEMPTS` ⇒ หยุดการลงทะเบียนนั้น (STOPPED "FAILED" · ล้าง lease · ยิง finished · เขียนประวัติ) —
 *   ไม่ปล่อยให้แถวเดียวที่พังวนลองใหม่ทุก 15 นาทีไปเรื่อย ๆ · ยังไม่ครบ = คง lease ไว้ (รอบหน้าหลังหมด lease ลองใหม่)
 *   คืน true เมื่อ "ปิดจ๊อบ" แถวนี้แล้ว
 */
const MAX_STEP_ATTEMPTS = 5;

async function failAttempt(enrollmentId: string, stepIndex: number, now: Date): Promise<boolean> {
  const e = await prisma.crmSequenceEnrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, tenantId: true, sequenceId: true, contactId: true, sequenceVersion: true, sequence: { select: { systemId: true } } },
  });
  if (!e) return false;
  const key = `v${e.sequenceVersion}:${stepIndex}`;
  // ตัวนับจบในคำสั่งเดียว (reference_atomic_counter_single_statement) — สองตัวรันชนกันก็ไม่นับพลาด
  // 🔴 `${key}::text` ทิ้งไม่ได้ (บั๊กจริงที่ผู้ตรวจรอบสองเจอ · ข้อสอบ C2.2-X9.5): `jsonb_build_object` เป็น VARIADIC "any"
  //    พารามิเตอร์ที่ไม่บอกชนิดจึงทำให้ฐานตอบ 42P18 "could not determine data type of parameter $1" ⇒ คำสั่งนี้ล้ม **ทุกครั้ง**
  //    ⇒ ตัวนับไม่เคยถูกเขียน ⇒ ขั้นที่พังถูกลองใหม่ทุก 15 นาทีตลอดไป (ไม่มีวันถึง FAILED · ไม่มีแถวในสมุดตรวจ)
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    UPDATE "CrmSequenceEnrollment"
       SET "stats" = jsonb_set(
             CASE WHEN jsonb_typeof("stats") = 'object' THEN "stats" ELSE '{}'::jsonb END, '{attempts}',
             (CASE WHEN jsonb_typeof("stats"->'attempts') = 'object' THEN "stats"->'attempts' ELSE '{}'::jsonb END)
               || jsonb_build_object(${key}::text, COALESCE(("stats"->'attempts'->>${key})::int, 0) + 1), true)
     WHERE "id" = ${enrollmentId}
     RETURNING ("stats"->'attempts'->>${key})::int AS n`;
  const n = Number(rows[0]?.n ?? 0);
  if (n < MAX_STEP_ATTEMPTS) return false;
  return prisma.$transaction(async (tx) => {
    const r = await tx.crmSequenceEnrollment.updateMany({
      where: { id: e.id, status: { in: ACTIVE_OR_PAUSED } },
      data: { status: "STOPPED", stoppedReason: "FAILED", stoppedAt: now, nextAt: null, leaseUntil: null },
    });
    if (r.count !== 1) return false;
    await emitFinished(tx, e.sequence.systemId, e, "STOPPED", "FAILED");
    await auditTx(tx, { tenantId: e.tenantId }, null, "crm.sequence.auto_stop", "CrmSequenceEnrollment", e.id, {
      before: { status: "ACTIVE", stepIndex },
      after: { status: "STOPPED", reason: "FAILED", attempts: n, by: "engine" },
    });
    return true;
  });
}

/** ทำขั้นของ 1 แถวที่จองแล้ว */
async function runClaimed(c: Claimed, now: Date, deps: SequenceDeps | null, cache: SeqCache): Promise<StepResult> {
  const e = await prisma.crmSequenceEnrollment.findUnique({ where: { id: c.id } });
  if (!e) return "failed";
  let seq = cache.seq.get(e.sequenceId);
  if (seq === undefined) {
    seq = await prisma.crmSequence.findUnique({ where: { id: e.sequenceId } });
    cache.seq.set(e.sequenceId, seq);
  }
  if (!seq) return "failed";
  const sk = `${seq.id}:${e.sequenceVersion}`;
  let steps = cache.steps.get(sk);
  if (!steps) {
    steps = await prisma.crmSequenceStep.findMany({ where: { sequenceId: seq.id, version: e.sequenceVersion }, orderBy: { index: "asc" } });
    cache.steps.set(sk, steps);
  }
  const step = steps.find((s) => s.index === c.stepIndex);
  const isLast = c.stepIndex + 1 >= steps.length;
  const base = { v: e.sequenceVersion, index: c.stepIndex, kind: step?.kind ?? "", at: now.toISOString() };
  if (!step) {
    // เลยขั้นสุดท้ายแล้ว (เช่น เวอร์ชันถูกแก้นอกระบบ) — จบให้เรียบร้อย
    return (await advance(e, seq.systemId, { ...c, stepIndex: c.stepIndex }, true, null, null)) ? "finished" : "failed";
  }
  const contact = await prisma.crmContact.findFirst({ where: { id: e.contactId, tenantId: e.tenantId } });
  if (!contact || contact.archivedAt || contact.mergedIntoId) {
    const ok = await prisma.$transaction(async (tx) => {
      const n = await tx.crmSequenceEnrollment.updateMany({
        where: { id: e.id, leaseUntil: c.lease, status: { in: ACTIVE_OR_PAUSED } },
        data: { status: "STOPPED", stoppedReason: "CONTACT_GONE", stoppedAt: now, nextAt: null, leaseUntil: null },
      });
      // AUDIT-CLASS X9 (มติรีวิว C2.2 ข้อ 4): การหยุดที่ "เครื่องเป็นคนตัดสิน" ต้องตอบได้จากประวัติการแก้ไข ไม่ใช่จาก event อย่างเดียว
      if (n.count === 1) {
        await emitFinished(tx, seq!.systemId, e, "STOPPED", "CONTACT_GONE");
        await auditTx(tx, { tenantId: e.tenantId }, null, "crm.sequence.auto_stop", "CrmSequenceEnrollment", e.id, {
          before: { status: "ACTIVE", stepIndex: c.stepIndex },
          after: { status: "STOPPED", reason: "CONTACT_GONE", by: "engine" },
        });
      }
      return n.count === 1;
    });
    return ok ? "finished" : "failed";
  }
  const rules = { businessDaysOnly: seq.businessDaysOnly, sendWindow: windowOf(seq.sendWindow) };
  const cal = await calendarOf(cache, seq.systemId);
  const kind = step.kind as SeqStepKind;

  if (kind === "WAIT") {
    const next = afterWait(now, step.waitDays ?? 0, step.waitHours ?? 0, rules, cal);
    const moved = await advance(e, seq.systemId, c, isLast, next, { ...base, outcome: "DONE", reason: null });
    return moved ? (isLast ? "finished" : "executed") : "failed";
  }

  if (SEQ_SEND_KINDS.has(kind)) {
    // AUDIT-CLASS X8: ขอไม่รับข่าวสาร ณ เวลาขั้นทำงาน ⇒ หยุดทั้งลำดับ (ไม่ส่งอะไรอีก) — ไม่ต้องรอตัวรับ event
    if (contact.marketingOptOut) {
      const ok = await prisma.$transaction(async (tx) => {
        const n = await tx.crmSequenceEnrollment.updateMany({
          where: { id: e.id, leaseUntil: c.lease, stepIndex: c.stepIndex, status: { in: ACTIVE_OR_PAUSED } },
          data: { status: "STOPPED", stoppedReason: "OPT_OUT", stoppedAt: now, nextAt: null, leaseUntil: null },
        });
        await appendLog(tx, e.id, { ...base, outcome: "SKIPPED", reason: "ไม่ได้ส่ง — ผู้ติดต่อขอไม่รับข่าวสารแล้ว ระบบหยุดลำดับนี้ให้" });
        // AUDIT-CLASS X9 (มติรีวิว C2.2 ข้อ 4): OPT_OUT เกี่ยวกับ PDPA — "ทำไมลำดับของลูกค้าคนนี้หยุด" ต้องตอบได้จากประวัติการแก้ไข
        if (n.count === 1) {
          await emitFinished(tx, seq!.systemId, e, "STOPPED", "OPT_OUT");
          await auditTx(tx, { tenantId: e.tenantId }, null, "crm.sequence.auto_stop", "CrmSequenceEnrollment", e.id, {
            before: { status: "ACTIVE", stepIndex: c.stepIndex },
            after: { status: "STOPPED", reason: "OPT_OUT", by: "engine" },
          });
        }
        return n.count === 1;
      });
      return ok ? "finished" : "failed";
    }
    // ช่วงเวลาส่งปิด ⇒ ไม่ส่ง · คงขั้นเดิม · nextAt = เวลาเปิดครั้งถัดไป (ปล่อย lease)
    if (!windowOpen(now, rules, cal)) {
      const next = clampIntoWindow(now, rules, cal);
      const n = await prisma.crmSequenceEnrollment.updateMany({ where: { id: e.id, leaseUntil: c.lease, stepIndex: c.stepIndex }, data: { nextAt: next, leaseUntil: null } });
      return n.count === 1 ? "deferred" : "failed";
    }
  }

  const action =
    kind === "TASK"
      ? { type: "SEQ_TASK", params: { title: step.taskTitle ?? "", taskType: step.taskType ?? "TASK", body: step.body ?? "" } }
      : { type: kind === "EMAIL" ? "SEND_EMAIL" : kind === "LINE" ? "SEND_LINE" : "SEND_SMS", params: { template: step.body ?? "", subject: step.subject ?? "" } };
  const env: SeqEnv = {
    rule: { id: seq.id, tenantId: seq.tenantId, name: seq.name },
    subject: { tenantId: e.tenantId, systemId: seq.systemId, contact, dealId: e.dealId, enrollmentId: e.id, sequenceId: seq.id, version: e.sequenceVersion, stepId: step.id },
    runId: e.id,
    event: { type: "crm.sequence.step", payload: { enrollmentId: e.id, index: c.stepIndex } },
    now,
    deps,
  };
  let o: StepOutcome;
  try {
    o = (await executeActions(env, [action], c.stepIndex, 0, SEQ_ADAPTER)).steps[0] ?? { i: c.stepIndex, type: action.type, ok: false, note: "ไม่มีผลของขั้น" };
  } catch (err) {
    o = { i: c.stepIndex, type: action.type, ok: false, note: `ทำขั้นนี้ไม่สำเร็จ — ${errText(err)}` };
  }
  const outcome: SeqOutcome = o.ok ? (kind === "TASK" ? "DONE" : "SENT") : o.skipped ? "SKIPPED" : "FAILED";
  const moved = await advance(e, seq.systemId, c, isLast, now, { ...base, outcome, reason: o.ok ? null : o.note || "ทำขั้นนี้ไม่สำเร็จ" });
  if (!moved) return "failed";
  return isLast ? "finished" : outcome === "FAILED" ? "failed" : "executed";
}

/** ระบบ CRM ที่เปิด uiVersion 2 (R-E.14 — ระบบรุ่น 1 ไม่ถูกดึงเลย: ไม่จอง ไม่แตะ) */
async function v2SystemIds(tenantIds?: string[]): Promise<string[]> {
  const rows = await prisma.appSystem.findMany({
    where: { type: "CRM", ...(tenantIds ? { tenantId: { in: tenantIds } } : {}), settings: { path: ["crm", "uiVersion"], equals: 2 } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * ทำขั้นของลำดับการติดตามที่ถึงเวลา (งานรายนาที "crm.sequences" · ข้อสอบเรียกตรงพร้อม deps/tenantIds)
 * AUDIT-CLASS X5: หยิบ ACTIVE + nextAt ≤ now + lease ว่าง/หมด → จองทีละแถวด้วย updateMany มีเงื่อนไข (leaseUntil = now + 15 นาที)
 *   ไม่เคยจองด้วยการเขียนสถานะปลายทาง/เลื่อนขั้นก่อน · ทำ → เลื่อนขั้น + ล้าง lease · วนทีละชุดจนเงียบ หรือหมดงบเวลา/ถูกยกเลิก
 *   ขั้นที่ไม่ใช่ "รอ" ตั้ง nextAt = now ⇒ รอบเดียวกันทำขั้นต่อไปได้เลย
 */
export async function runDue(now: Date, opts: RunDueOptions = {}): Promise<RunDueSummary> {
  const summary: RunDueSummary = { claimed: 0, executed: 0, deferred: 0, finished: 0, failed: 0, batches: 0, cutOff: false };
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const batch = Math.min(Math.max(Math.floor(opts.batchSize ?? 200), 1), 500);
  const deps = opts.deps ?? null;
  const stopNow = () => !!opts.signal?.aborted || (typeof opts.deadline === "number" && Date.now() > opts.deadline - 500);
  const tenantIds = Array.isArray(opts.tenantIds) ? opts.tenantIds.filter((t) => typeof t === "string" && t) : undefined;
  if (tenantIds && tenantIds.length === 0) return summary;
  const systems = await v2SystemIds(tenantIds);
  if (systems.length === 0) return summary;
  const cache: SeqCache = { seq: new Map(), steps: new Map(), cal: new Map() };
  const leaseFree: Prisma.CrmSequenceEnrollmentWhereInput = { OR: [{ leaseUntil: null }, { leaseUntil: { lte: at } }] };
  for (let round = 0; round < 10_000; round += 1) {
    if (stopNow()) {
      summary.cutOff = true;
      break;
    }
    const due = await prisma.crmSequenceEnrollment.findMany({
      where: {
        status: "ACTIVE",
        nextAt: { lte: at },
        ...leaseFree,
        ...(tenantIds ? { tenantId: { in: tenantIds } } : {}),
        // 🔴 ไม่กรอง `active` โดยตั้งใจ (มติผู้คุมงานรีวิว C2.2 ข้อ 2 · ทางเลือก (ก)): สวิตช์ "เปิดรับคนใหม่" = หยุดรับคนใหม่เท่านั้น
        //    (ด่านอยู่ที่ `enrollOne`) — คนที่เดินอยู่แล้วเดินต่อจนจบ · เดิมกรองที่นี่ด้วย ⇒ ปิดสวิตช์แล้วทุกแถวค้างเงียบ ๆ
        //    (ไม่เปลี่ยนสถานะ ไม่มี event ไม่มีใครรู้) แล้วพอเปิดกลับ ขั้นที่เลยกำหนดทั้งกองก็ยิงพร้อมกัน
        //    ลำดับที่ถูก "เก็บ" (archivedAt) ยังถูกตัดออก — ตอนเก็บ ระบบหยุดผู้ลงทะเบียนที่ยังเดินอยู่ให้ครบแล้ว
        sequence: { systemId: { in: systems }, archivedAt: null },
      },
      orderBy: { nextAt: "asc" },
      take: batch,
      select: { id: true, stepIndex: true },
    });
    if (due.length === 0) break;
    summary.batches += 1;
    let claimedHere = 0;
    const lease = new Date(at.getTime() + LEASE_MS);
    // ทำพร้อมกันทีละไม่กี่แถว (แต่ละแถวจองของตัวเอง — ไม่มีแถวไหนถูกทำสองทาง)
    const queue = [...due];
    const worker = async () => {
      for (let d = queue.shift(); d; d = queue.shift()) {
        if (stopNow()) {
          summary.cutOff = true;
          return;
        }
        const claim = await prisma.crmSequenceEnrollment.updateMany({
          where: { id: d.id, status: "ACTIVE", stepIndex: d.stepIndex, nextAt: { lte: at }, ...leaseFree },
          data: { leaseUntil: lease },
        });
        if (claim.count !== 1) continue;
        claimedHere += 1;
        summary.claimed += 1;
        try {
          const r = await runClaimed({ id: d.id, stepIndex: d.stepIndex, lease }, at, deps, cache);
          if (r === "executed") summary.executed += 1;
          else if (r === "deferred") summary.deferred += 1;
          else if (r === "finished") {
            summary.executed += 1;
            summary.finished += 1;
          } else summary.failed += 1;
        } catch (err) {
          // lease คงไว้ ⇒ แถวนี้ไม่ถูกหยิบซ้ำในรอบนี้ · หมด lease แล้วรอบหน้าลองใหม่ (ไม่มีข้อมูลบุคคลใน log — X8)
          //   🔴 มีตัวนับครั้ง + ปลายทาง (NOTE รีวิว C2.2): เดิมลองใหม่ทุก 15 นาที **ตลอดไป** แถวเดียวที่พังจึง WARN ไม่รู้จบ
          summary.failed += 1;
          // 🔴 ตัวนับล้มเองต้อง "ดังพอให้เห็น": เดิม `.catch(() => false)` กลืนทุกอย่าง ⇒ คำสั่งตัวนับที่ผิด (42P18) ทำให้ปลายทาง
          //    ของแถวที่พังหายไปเงียบ ๆ เป็นเดือน โดยสมุด ops บอกแค่ "จะลองใหม่" ทุกรอบ (feedback_verify_the_command_actually_ran)
          const dead = await failAttempt(d.id, d.stepIndex, at).catch(async (e2: unknown) => {
            await logOps("ERROR", "crm.sequences", "ตัวนับจำนวนครั้งที่ลองทำขั้นไม่สำเร็จ เขียนไม่ได้ — แถวนี้จะถูกลองใหม่เกินจำนวนครั้งที่ตั้งไว้", {
              detail: `enrollment=${d.id} step=${d.stepIndex} ${errText(e2)}`,
            }).catch(() => {});
            return false;
          });
          await logOps(
            "WARN",
            "crm.sequences",
            dead ? "ทำขั้นของลำดับการติดตามไม่สำเร็จครบจำนวนครั้งที่กำหนด — หยุดการลงทะเบียนนี้ไว้" : "ทำขั้นของลำดับการติดตามไม่สำเร็จ — จะลองใหม่เมื่อหมดเวลาจอง",
            { detail: `enrollment=${d.id} ${errText(err).replace(/\S+@\S+/g, "***")}` },
          ).catch(() => {});
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, due.length) }, () => worker()));
    if (claimedHere === 0 || summary.cutOff) break;
  }
  return summary;
}

