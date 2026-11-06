// worker.ts — คิวเบื้องหลังของห้องเลขา (ใบ S1.5 · สัญญา docs/modules/31-secretary.md §5.5 + §6 · RESOLUTIONS R-K2 R-K8 R-K8b R-K20)
//
// 1 ข้อความสั่งงานในห้อง = 1 แถว `AiRoomJob` (messageId @unique) — `sendRoomMessage` เขียนข้อความ + job ใน tx เดียว (ไม่เรียกโมเดล)
// `runRoomJobs` หยิบงานที่ QUEUED หรือ RUNNING ที่ lease หมดแล้ว → claim ทีละตัวด้วย conditional `updateMany` คำสั่งเดียว
//   (X5 · สองรอบซ้อนกัน = ทำครั้งเดียว) → โหลด Membership สดของผู้สั่ง → `service.sendMessage` ด้วยสิทธิ์ของผู้สั่ง
//   (`userMessageId` = ไม่สร้างแถว USER ซ้ำ) → DONE / FAILED / กลับคิว → push ถึงผู้เปิดห้อง ∪ สมาชิกห้อง
// ทางที่เรียก (R-K8/R-K8b): route ส่งข้อความ (S1.14) รันทันทีใน `after()` · ตัวเก็บตก = งานรายนาที "secretary.roomJobs"
//   (`./room-jobs-job.ts` · ตัวรัน VPS `scripts/crm-cron.mts minute` + hook ใน `/api/cron/outbox`) · ไม่มี cron รายนาทีบน Vercel
//
// 🔴 `runRoomJobs` ไม่ throw เด็ดขาด · push ล้มไม่ทำให้งานล้ม · ข้อความถึงผู้ใช้เป็นไทย (ไม่ใส่ข้อความ error ดิบของผู้ให้บริการ)
// 🔴 rooms.ts ห้าม import ไฟล์นี้ (วงกลม: worker → service → conversations …) · ไฟล์นี้ import rooms ได้ (ตอนนี้ไม่ต้องใช้)
// 🔴 ข้อความในห้องเดิมไม่นับงาน (R-K6 — ตัวนับอยู่ที่ `startRoom` เท่านั้น)
//
// SEC S3a.1-S1 (RESOLUTIONS §Z.1) ▸
//   R-Z1 lease คิดจากเวลา claim จริง (ไม่ใช่ `now` ต้นรอบ) · claim = conditional updateMany ที่ `attempts` เดิม ⇒ `attempts+1` คือ fence
//        (ไม่อ่านแถวซ้ำหลัง claim) · heartbeat ต่ออายุ lease ทุก 30 วิ ระหว่างโมเดลคิด · คำตอบ ASSISTANT + DONE เขียนใน tx เดียวกับการตรวจ fence
//        (`persistGuard` ของ sendMessage) ⇒ รอบที่หลุด lease ไม่เขียนคำตอบซ้ำ
//   R-Z2 reaper: RUNNING ∧ lease หมด ∧ attempts ≥ 3 ⇒ FAILED + push · processJob ครอบ try ทั้งตัว (throw = กลับคิว/ล้มผ่าน fence)
//   R-Z4 ไม่มีผู้ให้บริการ ⇒ ไม่ claim / ai_disabled ⇒ กลับคิว (attempts ไม่เพิ่ม) · ตัวเก็บตกรายนาทีหยิบ QUEUED ที่อายุ ≥ 45 วิ
//   R-Z9 ห้องปิดแล้ว ⇒ FAILED ไม่เรียกโมเดล · ต้นทุนของทาง worker ติดป้าย `note = room-worker:<jobId>` (เพดาน assist ไม่นับ)
//   R-Z10 job แรกของห้อง FAILED ก่อนมีคำตอบ ⇒ คืนโควตางาน (ครั้งเดียว) · R-Z12 ห้องละ 1 งานที่ RUNNING · กุญแจกันสแปม push รวม jobId ◂

import { Prisma, type AiRoomJob } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { sendPushToUser } from "@/lib/core/push";
import { registerMinuteJob, SECRETARY_ROOM_JOBS_BUDGET_MS, type MinuteJobControl } from "@/lib/platform/minute-jobs";
import { actorProblem, aiMemberActor, type AiMemberActor } from "../actor";
import { findVisibleConversation } from "../conversations";
import { ROOM_WORKER_NOTE_PREFIX } from "../credit";
import { resolveProvider, type AiProvider } from "../provider";
import { sendMessage, type SendResult } from "../service";
import { quotaMessage } from "../usage";
import { NOT_SYSTEM_MESSAGE, roomPushRecipients } from "./members";
import { notifyUser } from "./notify";
import { monthKeyBangkok } from "./pack";

export const ROOM_JOB_LEASE_MS = 120_000; // 2 นาที (ต่ออายุด้วย heartbeat ระหว่างทำงาน)
export const ROOM_JOB_HEARTBEAT_MS = 30_000;
export const ROOM_JOB_MAX_ATTEMPTS = 3;
/** R-Z4: ตัวเก็บตกรายนาทีหยิบ QUEUED ที่อายุ ≥ 45 วิ เท่านั้น (ทางหลักคือ route/after ที่รันทันที — ไม่แย่งกัน) */
export const ROOM_JOB_MIN_QUEUED_AGE_MS = 45_000;
export const ROOM_JOBS_MINUTE_JOB = "secretary.roomJobs";
const RUN_LIMIT_DEFAULT = 5;
const RUN_LIMIT_MAX = 50;
const PUSH_BODY_MAX = 120;
const ERROR_MAX = 500;

type PushPost = NonNullable<NonNullable<Parameters<typeof sendPushToUser>[2]>["post"]>;
/**
 * `deadline` = เวลาจริง (ms) ที่หยุดหยิบงานใหม่ · `jobIds` = ทำเฉพาะงานเหล่านี้ (route/งานประจำรันงานของตัวเอง — R-Z5) ·
 * `minAgeMs` = QUEUED ต้องอายุอย่างน้อยเท่านี้ (ตัวเก็บตกรายนาที — R-Z4)
 */
export type RoomJobDeps = { provider?: AiProvider; post?: PushPost; now?: Date; limit?: number; deadline?: number; jobIds?: string[]; minAgeMs?: number };

export type SendRoomMessageResult =
  | { ok: true; messageId: string; jobId: string }
  | { ok: false; error: "not_found" | "closed" | "empty"; message: string };

export type RunRoomJobsResult = { claimed: number; done: number; failed: number; requeued: number };

const MSG_NOT_FOUND = "ไม่พบห้องงานนี้ หรือคุณไม่ได้อยู่ในห้องนี้";
const MSG_CLOSED = "ห้องงานนี้ปิดแล้ว — เปิดห้องใหม่เพื่อสั่งงานต่อได้เลย";
const MSG_EMPTY = "พิมพ์สิ่งที่อยากให้เลขาช่วยก่อนนะ";
const ERR_NOT_MEMBER = "ผู้สั่งไม่ได้เป็นสมาชิกของกิจการแล้ว";
const ERR_NOT_IN_ROOM = "ผู้สั่งไม่ได้อยู่ในห้องนี้แล้ว";
const ERR_MISSING = "ไม่พบข้อความหรือห้องของงานนี้แล้ว";
const ERR_CLOSED = "ห้องงานนี้ปิดไปแล้ว เลขาจึงไม่ได้ทำงานนี้ต่อ";
const ERR_AI_DISABLED = "ผู้ช่วย AI ยังไม่เปิดใช้งานในตอนนี้ ระบบจะลองใหม่ให้เมื่อพร้อม";
const ERR_EMPTY = "ข้อความว่าง ไม่มีงานให้ทำ";
const ERR_RETRY = "เลขาติดขัดชั่วคราว ระบบจะลองใหม่ให้อัตโนมัติ";
const ERR_GAVE_UP = `เลขาทำงานนี้ไม่สำเร็จหลังลอง ${ROOM_JOB_MAX_ATTEMPTS} ครั้ง — ลองสั่งใหม่อีกครั้ง`;
const PUSH_FAILED_PREFIX = "ทำไม่ได้: ";

/** fence หลุด (อีกรอบหยิบงานนี้ไปแล้ว) — โยนจาก `persistGuard` ใน tx ของ sendMessage ⇒ ทั้ง tx ย้อน (ไม่มีคำตอบซ้ำ) */
class RoomJobLostError extends Error {
  constructor() {
    super("room job lease lost");
    this.name = "RoomJobLostError";
  }
}

/** สถานะที่ claim ได้ ณ เวลา now — QUEUED (อายุ ≥ minAgeMs ถ้าระบุ) หรือ RUNNING ที่ lease หมดแล้ว · ยังไม่ครบจำนวนครั้ง */
function claimableWhere(now: Date, minAgeMs?: number): Prisma.AiRoomJobWhereInput {
  const age = typeof minAgeMs === "number" && minAgeMs > 0 ? minAgeMs : 0;
  return {
    OR: [{ status: "QUEUED", ...(age > 0 ? { createdAt: { lt: new Date(now.getTime() - age) } } : {}) }, { status: "RUNNING", leaseUntil: { lt: now } }],
    attempts: { lt: ROOM_JOB_MAX_ATTEMPTS },
  };
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function cleanIds(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 191))].slice(0, RUN_LIMIT_MAX);
}

/** ข้อความสั้นสำหรับ push — ยุบช่องว่าง/ขึ้นบรรทัด · ≤ 120 ตัวอักษร (นับเป็นตัวอักษร ไม่ตัดกลาง surrogate pair) */
function pushBody(text: string): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  if (chars.length <= PUSH_BODY_MAX) return flat || "เลขาตอบแล้ว";
  return `${chars.slice(0, PUSH_BODY_MAX - 1).join("").trimEnd()}…`;
}

/** ผลไม่ ok ของ sendMessage → ข้อความไทยที่เก็บใน job.error (ไม่ retry) */
function failMessageOf(res: Exclude<SendResult, { ok: true }>): string {
  if (res.error === "over_budget") return quotaMessage(res.scope ?? null, res.resetAt ?? null);
  if (res.error === "ai_disabled") return ERR_AI_DISABLED;
  return ERR_EMPTY;
}

/**
 * ต่อคิวงานของข้อความสั่งงาน 1 ข้อความ — idempotent บน `messageId` (มีแล้ว = คืนแถวเดิม ไม่สร้างซ้ำ)
 *   ห้องต้องเป็นของร้านนี้ และข้อความต้องอยู่ในบทสนทนาของห้องนั้น (ไม่งั้น throw — ผู้เรียกประกอบผิด)
 */
export async function enqueueRoomJob(tenantId: string, roomId: string, messageId: string, authorUserId: string): Promise<AiRoomJob> {
  const db = tenantDb({ tenantId });
  const existing = await db.aiRoomJob.findFirst({ where: { messageId } });
  if (existing) return existing;
  const room = await db.aiRoom.findFirst({ where: { id: roomId }, select: { id: true, conversationId: true } });
  if (!room) throw new Error("enqueueRoomJob: room not found in this tenant");
  const msg = await db.aiMessage.findFirst({ where: { id: messageId, conversationId: room.conversationId }, select: { id: true } });
  if (!msg) throw new Error("enqueueRoomJob: message does not belong to this room");
  try {
    return await prisma.aiRoomJob.create({ data: { tenantId, roomId: room.id, messageId, authorUserId } });
  } catch (e) {
    // ยิงพร้อมกัน 2 ทาง = ทางที่สองชน unique → คืนแถวของทางแรก
    if (!isUniqueViolation(e)) throw e;
    const row = await db.aiRoomJob.findFirst({ where: { messageId } });
    if (!row) throw e;
    return row;
  }
}

/**
 * ส่งข้อความในห้องเดิม (ไม่นับงาน · ไม่เรียกโมเดล) — ข้อความ USER (`authorUserId` = ผู้ส่ง) + job QUEUED ใน tx เดียว
 *   ข้อความว่าง ⇒ empty · มองไม่เห็นห้อง/ไม่มี/ร้านอื่น ⇒ not_found (404-not-403) · ห้องปิดแล้ว ⇒ closed
 *   route (S1.14) เป็นคนเรียก `runRoomJobs` ต่อใน `after()`
 */
export async function sendRoomMessage(
  ctx: { tenantId: string; actor: AiMemberActor },
  roomId: string,
  input: { text: string; imageUrls?: string[] },
): Promise<SendRoomMessageResult> {
  const text = typeof input?.text === "string" ? input.text.trim() : "";
  if (!text) return { ok: false, error: "empty", message: MSG_EMPTY };
  const id = typeof roomId === "string" ? roomId.trim() : "";
  if (!id || actorProblem(ctx) || ctx.actor.kind !== "member") return { ok: false, error: "not_found", message: MSG_NOT_FOUND };
  const tenantId = ctx.tenantId;
  const room = await tenantDb({ tenantId }).aiRoom.findFirst({ where: { id }, select: { id: true, conversationId: true, closedAt: true } });
  if (!room) return { ok: false, error: "not_found", message: MSG_NOT_FOUND };
  // การมองเห็น = กติกาเดียวกับทุกประตู (ผู้เปิด ∪ สมาชิก ∪ OWNER · roomSightFor ภายใน)
  if (!(await findVisibleConversation(ctx, room.conversationId))) return { ok: false, error: "not_found", message: MSG_NOT_FOUND };
  if (room.closedAt) return { ok: false, error: "closed", message: MSG_CLOSED };

  const userId = ctx.actor.userId;
  const res = await prisma.$transaction(async (tx) => {
    const msg = await tx.aiMessage.create({
      data: { tenantId, conversationId: room.conversationId, role: "USER", content: text, authorUserId: userId },
      select: { id: true },
    });
    const job = await tx.aiRoomJob.create({ data: { tenantId, roomId: room.id, messageId: msg.id, authorUserId: userId }, select: { id: true } });
    // ห้องที่มีข้อความใหม่ขึ้นบนสุดของรายการ (listRooms เรียง updatedAt)
    await tx.aiRoom.updateMany({ where: { id: room.id, tenantId }, data: { updatedAt: new Date() } });
    return { messageId: msg.id, jobId: job.id };
  });
  return { ok: true, ...res };
}

type Outcome = { kind: "done"; reply: string } | { kind: "failed"; error: string; push: boolean } | { kind: "requeued" } | { kind: "lost" };

/**
 * R-Z10 ▸ คืนโควตางานเมื่อ job **แรก** ของห้องล้มก่อนเลขาตอบสักครั้ง — คืนได้ครั้งเดียว (`jobsCounted 1→0` เป็นเงื่อนไขของคำสั่ง)
 *   ใน tx เดียว: ห้อง jobsCounted 1→0 (count 0 = คืนไปแล้ว/ไม่ได้นับ ⇒ ไม่แตะตัวนับ) + ตัวนับเดือนของห้อง `jobs > 0` ลด 1 · ล้ม = log ไม่ throw ◂
 */
async function refundIfFirstJob(job: Pick<AiRoomJob, "id" | "tenantId" | "roomId" | "createdAt">): Promise<void> {
  try {
    const tenantId = job.tenantId;
    const room = await prisma.aiRoom.findFirst({ where: { id: job.roomId, tenantId }, select: { id: true, conversationId: true, jobsCounted: true, createdAt: true } });
    if (!room || room.jobsCounted !== 1) return;
    const [older, replies] = await Promise.all([
      prisma.aiRoomJob.count({ where: { tenantId, roomId: room.id, OR: [{ createdAt: { lt: job.createdAt } }, { createdAt: job.createdAt, id: { lt: job.id } }] } }),
      prisma.aiMessage.count({ where: { tenantId, conversationId: room.conversationId, role: "ASSISTANT", ...NOT_SYSTEM_MESSAGE } }),
    ]);
    if (older > 0 || replies > 0) return;
    const month = monthKeyBangkok(room.createdAt);
    await prisma.$transaction(async (tx) => {
      const r = await tx.aiRoom.updateMany({ where: { id: room.id, tenantId, jobsCounted: 1 }, data: { jobsCounted: 0 } });
      if (r.count === 0) return;
      await tx.aiJobCounter.updateMany({ where: { tenantId, month, jobs: { gt: 0 } }, data: { jobs: { decrement: 1 } } });
    });
  } catch (e) {
    await logOps("WARN", "ai", `secretary.roomJobs: คืนโควตางาน ${job.id} ไม่สำเร็จ`, { tenantId: job.tenantId, detail: e instanceof Error ? e.message : String(e) }).catch(() => {});
  }
}

/**
 * งาน 1 ตัวที่ claim แล้ว — `fence` = attempts หลัง claim (ทุกการเขียนผลต้องเจอ RUNNING + attempts = fence)
 *   ครอบ try ทั้งตัว (R-Z2): โหลดห้อง/Membership/โมเดลพลาด ⇒ กลับคิว (ครั้งที่ 3 = FAILED) ผ่าน fence เดียวกัน
 */
async function processJob(job: AiRoomJob, fence: number, deps: RoomJobDeps): Promise<Outcome> {
  const tenantId = job.tenantId;
  const db = tenantDb({ tenantId });
  const mine: Prisma.AiRoomJobWhereInput = { id: job.id, tenantId, status: "RUNNING", attempts: fence };
  // เขียนผล = เฉพาะถ้ายังเป็นรอบของเรา (fence ตรง) — ไม่ตรง = อีกรอบหยิบไปแล้ว ⇒ "lost" (ไม่เขียนอะไร)
  const finish = async (data: Prisma.AiRoomJobUpdateManyMutationInput): Promise<boolean> => (await prisma.aiRoomJob.updateMany({ where: mine, data })).count > 0;
  const fail = async (error: string, push = true): Promise<Outcome> => {
    if (!(await finish({ status: "FAILED", error: error.slice(0, ERROR_MAX), leaseUntil: null, finishedAt: new Date() }))) return { kind: "lost" };
    await refundIfFirstJob(job);
    return { kind: "failed", error, push };
  };
  // R-Z1 heartbeat: ต่ออายุ lease ระหว่างรอโมเดล (fence เดียวกัน — หลุดแล้วไม่ต่อให้ใคร)
  const beat = setInterval(() => {
    void prisma.aiRoomJob.updateMany({ where: mine, data: { leaseUntil: new Date(Date.now() + ROOM_JOB_LEASE_MS) } }).catch(() => undefined);
  }, ROOM_JOB_HEARTBEAT_MS);
  (beat as { unref?: () => void }).unref?.();
  try {
    const [room, message] = await Promise.all([
      db.aiRoom.findFirst({ where: { id: job.roomId }, select: { id: true, conversationId: true, closedAt: true } }),
      db.aiMessage.findFirst({ where: { id: job.messageId }, select: { id: true, content: true, conversationId: true } }),
    ]);
    if (!room || !message || message.conversationId !== room.conversationId) return await fail(ERR_MISSING, false);
    // R-Z9: ห้องปิดแล้ว ⇒ ไม่เรียกโมเดล
    if (room.closedAt) return await fail(ERR_CLOSED, false);
    const authorUserId = job.authorUserId ?? "";
    // Membership สดทุกรอบ — ถูกถอน/ยังไม่รับคำเชิญ ⇒ FAILED ไม่เรียกโมเดล ไม่ retry
    const membership = authorUserId
      ? await prisma.membership.findFirst({
          where: { tenantId, userId: authorUserId, acceptedAt: { not: null } },
          select: { role: true, unitAccess: true, permissions: true },
        })
      : null;
    if (!membership) return await fail(ERR_NOT_MEMBER);
    const actor = aiMemberActor(tenantId, authorUserId, membership);
    const ctx = { tenantId, actor };
    // ผู้สั่งยังต้องเห็นห้อง (ถูกเอาออกจากห้องระหว่างรอคิว) — ไม่งั้น sendMessage จะ throw ทุกรอบ
    if (!(await findVisibleConversation(ctx, room.conversationId))) return await fail(ERR_NOT_IN_ROOM);

    const res = await sendMessage(
      ctx,
      { conversationId: room.conversationId, text: message.content },
      {
        ...(deps.provider ? { provider: deps.provider } : {}),
        source: "CHAT",
        userMessageId: message.id,
        usageNote: `${ROOM_WORKER_NOTE_PREFIX}${job.id}`,
        // R-Z1: คำตอบ + DONE ใน tx เดียวกับการตรวจ fence (แถว job ถูกล็อกจน commit — อีกรอบ claim ซ้อนไม่ได้)
        persistGuard: async (tx) => {
          const got = await tx.aiRoomJob.updateMany({ where: mine, data: { status: "DONE", error: null, leaseUntil: null, finishedAt: new Date() } });
          if (got.count === 0) throw new RoomJobLostError();
        },
      },
    );
    if (!res.ok) {
      // R-Z4: ai_disabled (ไม่มีผู้ให้บริการ) = ไม่ใช่ความผิดของงาน ⇒ requeue กลับ QUEUED (attempts คืน 1 — ไม่เผาจำนวนครั้ง)
      if (res.error === "ai_disabled") {
        return (await finish({ status: "QUEUED", leaseUntil: null, attempts: { decrement: 1 }, error: ERR_AI_DISABLED })) ? { kind: "requeued" } : { kind: "lost" };
      }
      return await fail(failMessageOf(res));
    }
    return { kind: "done", reply: res.reply }; // DONE เขียนแล้วใน persistGuard
  } catch (e) {
    if (e instanceof RoomJobLostError) return { kind: "lost" };
    await logOps("WARN", "ai", `secretary.roomJobs: งาน ${job.id} ล้ม (ครั้งที่ ${fence})`, {
      tenantId,
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    }).catch(() => {});
    if (fence < ROOM_JOB_MAX_ATTEMPTS) {
      return (await finish({ status: "QUEUED", leaseUntil: null, error: ERR_RETRY }).catch(() => false)) ? { kind: "requeued" } : { kind: "lost" };
    }
    return await fail(ERR_GAVE_UP).catch(() => ({ kind: "lost" }) as Outcome);
  } finally {
    clearInterval(beat);
  }
}

/**
 * push ถึงผู้เปิดห้อง ∪ สมาชิกห้อง ที่ Membership ยังรับอยู่ (S1.6 R-S1.6c · `roomPushRecipients`) · ไม่กรองร้านของเครื่อง (R-K20) · ล้ม = log ไม่ throw
 *   S1.23 ▸ ผ่าน `notifyUser(uid, tenantId, "room", …)` = เคารพค่าตั้ง "ห้องเลขา" (OFF = ไม่ส่ง) + badge + กันสแปม ◂
 *   R-Z12 ▸ กุญแจกันสแปมรวม jobId (คำตอบของงานถัดไปในห้องเดิมภายใน 60 วิ ไม่หาย · งานเดิมซ้ำ = ใบเดียว) ◂
 */
async function pushRoom(job: AiRoomJob, text: string, deps: RoomJobDeps): Promise<void> {
  try {
    const jobId = job.id;
    const room = await tenantDb({ tenantId: job.tenantId }).aiRoom.findFirst({
      where: { id: job.roomId },
      select: { id: true, title: true, conversationId: true },
    });
    if (!room) return;
    const to = await roomPushRecipients(job.tenantId, room.id);
    const msg = {
      title: room.title || "เลขา",
      body: pushBody(text),
      data: { link: `/secretary/room/${room.id}`, conversationId: room.conversationId, roomId: room.id, kind: "room" },
    };
    for (const uid of to) {
      try {
        await notifyUser(uid, job.tenantId, "room", msg, { ...(deps.post ? { post: deps.post } : {}), dedupeKey: `job:${jobId}` });
      } catch (e) {
        await logOps("WARN", "push", `secretary.roomJobs: push ล้ม (ผู้ใช้ ${uid})`, { tenantId: job.tenantId, detail: String(e) }).catch(() => {});
      }
    }
  } catch (e) {
    await logOps("WARN", "push", "secretary.roomJobs: เตรียม push ล้ม", { tenantId: job.tenantId, detail: String(e) }).catch(() => {});
  }
}

/**
 * R-Z2 ▸ reaper: งานที่ RUNNING แต่ lease หมดและลองครบ 3 ครั้งแล้ว (โพรเซสตายกลางครั้งที่ 3) ⇒ FAILED + push + คืนโควตา (ถ้าเป็นงานแรก)
 *   conditional updateMany ที่ attempts/lease เดิม (สองรอบพร้อมกัน = ปิดครั้งเดียว) · คืนจำนวนที่ปิด ◂
 */
async function reapExhausted(now: Date, deps: RoomJobDeps, ids: string[] | null): Promise<number> {
  const dead = await prisma.aiRoomJob.findMany({
    where: { status: "RUNNING", leaseUntil: { lt: now }, attempts: { gte: ROOM_JOB_MAX_ATTEMPTS }, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: RUN_LIMIT_MAX,
  });
  let n = 0;
  for (const j of dead) {
    const got = await prisma.aiRoomJob.updateMany({
      where: { id: j.id, tenantId: j.tenantId, status: "RUNNING", attempts: j.attempts, leaseUntil: { lt: now } },
      data: { status: "FAILED", error: ERR_GAVE_UP, leaseUntil: null, finishedAt: new Date() },
    });
    if (got.count === 0) continue;
    n++;
    await refundIfFirstJob(j);
    await pushRoom(j, `${PUSH_FAILED_PREFIX}${ERR_GAVE_UP}`, deps);
  }
  return n;
}

/**
 * รันงานในคิว 1 รอบ — ไม่ throw (ทุกอย่างพลาด = log + นับเท่าที่ทำได้)
 *   (0) reaper (R-Z2) · ไม่มีผู้ให้บริการ = ไม่ claim อะไร (R-Z4)
 *   (1) หางาน QUEUED / RUNNING ที่ lease หมด · attempts < 3 · เรียง createdAt · ≤ limit · `jobIds` = เฉพาะงานเหล่านี้
 *   (2) ห้องที่มีงาน RUNNING ที่ lease ยังไม่หมด = ข้าม (ห้องละงานเดียว · R-Z12) · claim ด้วย conditional `updateMany` ที่ attempts เดิม
 *       (count 0 = ตัวอื่นได้ไป — X5) · lease = เวลา claim จริง + 2 นาที (R-Z1)
 *   (3)–(5) ผู้สั่งพ้นสมาชิก/ห้องปิด ⇒ FAILED · sendMessage ok ⇒ DONE (ใน tx ของคำตอบ) · !ok ⇒ FAILED · throw ⇒ กลับคิว / ครั้งที่ 3 = FAILED
 *   (6) DONE/FAILED ⇒ push · `now` ฉีดได้ (เกณฑ์ lease/อายุคิว)
 */
export async function runRoomJobs(deps: RoomJobDeps = {}): Promise<RunRoomJobsResult> {
  const out: RunRoomJobsResult = { claimed: 0, done: 0, failed: 0, requeued: 0 };
  const now = deps.now instanceof Date && !Number.isNaN(deps.now.getTime()) ? deps.now : new Date();
  const limit = Math.min(Math.max(Math.floor(Number(deps.limit) || RUN_LIMIT_DEFAULT), 1), RUN_LIMIT_MAX);
  const ids = deps.jobIds === undefined ? null : cleanIds(deps.jobIds) ?? [];
  if (ids && ids.length === 0) return out;
  try {
    out.failed += await reapExhausted(now, deps, ids);
  } catch (e) {
    await logOps("WARN", "ai", "secretary.roomJobs: reaper สะดุด", { detail: String(e) }).catch(() => {});
  }
  // R-Z4: ไม่มีผู้ให้บริการ (ยังไม่ตั้งคีย์) ⇒ ไม่ claim (งานคง QUEUED · attempts ไม่ถูกเผา) — ตัวเก็บตกรายนาทีหยิบเองเมื่อพร้อม
  if (!deps.provider && resolveProvider() === null) return out;
  let candidates: AiRoomJob[];
  try {
    // คิวกลางข้ามร้าน (ตัวรันเบื้องหลัง) — ทุกการเขียนต่อจากนี้ผูก tenantId ของแถว
    candidates = await prisma.aiRoomJob.findMany({
      where: { ...claimableWhere(now, deps.minAgeMs), ...(ids ? { id: { in: ids } } : {}) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
    });
  } catch (e) {
    await logOps("WARN", "ai", "secretary.roomJobs: อ่านคิวไม่ได้", { detail: String(e) }).catch(() => {});
    return out;
  }
  for (const c of candidates) {
    if (typeof deps.deadline === "number" && Date.now() >= deps.deadline) break; // หมดงบของรอบ — ที่เหลือรอบหน้า
    try {
      // R-Z12: ห้องเดียวกันทำทีละงาน — มีงาน RUNNING ที่ lease ยังไม่หมด (ไม่ใช่ตัวนี้) ⇒ ข้าม (รอบหน้าหยิบตามลำดับ)
      const busy = await prisma.aiRoomJob.findFirst({
        where: { status: "RUNNING", tenantId: c.tenantId, roomId: c.roomId, id: { not: c.id }, leaseUntil: { gte: now } },
        select: { id: true },
      });
      if (busy) continue;
      // R-Z1: claim ที่ attempts เดิม (fence = attempts + 1 · ไม่อ่านแถวซ้ำ) · lease จากนาฬิกาตอน claim จริง
      const fence = c.attempts + 1;
      const got = await prisma.aiRoomJob.updateMany({
        where: { AND: [claimableWhere(now, deps.minAgeMs), { id: c.id, tenantId: c.tenantId, attempts: c.attempts }] },
        data: { status: "RUNNING", leaseUntil: new Date(Date.now() + ROOM_JOB_LEASE_MS), attempts: fence, startedAt: new Date() },
      });
      if (got.count === 0) continue; // อีกรอบหยิบไปแล้ว
      out.claimed++;
      const job: AiRoomJob = { ...c, status: "RUNNING", attempts: fence };
      const outcome = await processJob(job, fence, deps);
      if (outcome.kind === "done") {
        out.done++;
        await pushRoom(job, outcome.reply, deps);
      } else if (outcome.kind === "failed") {
        out.failed++;
        if (outcome.push) await pushRoom(job, `${PUSH_FAILED_PREFIX}${outcome.error}`, deps);
      } else if (outcome.kind === "requeued") {
        out.requeued++;
      }
    } catch (e) {
      // พลาดนอกเหนือที่คาด (ฐานสะดุด) — lease จะหมดเองแล้วรอบหน้าหยิบใหม่
      await logOps("WARN", "ai", `secretary.roomJobs: งาน ${c.id} สะดุด`, { detail: e instanceof Error ? (e.stack ?? e.message) : String(e) }).catch(() => {});
    }
  }
  return out;
}

/** รอบของตัวเก็บตกรายนาที (R-Z4/R-Z8) — QUEUED ที่อายุ ≥ 45 วิ + RUNNING ที่ lease หมด · หยุดหยิบเมื่อหมดงบของตัวเอง (8 วิ) */
export async function runRoomJobsTick(now: Date, ctrl: MinuteJobControl): Promise<RunRoomJobsResult> {
  return runRoomJobs({ now, limit: RUN_LIMIT_DEFAULT, deadline: ctrl.deadline, minAgeMs: ROOM_JOB_MIN_QUEUED_AGE_MS });
}

/**
 * ภาพรวมสุขภาพคิว (R-Z4 · ops/runbook S3a.2) — QUEUED ค้างเกิน 5 นาที · RUNNING ที่ lease หมด · FAILED ใน 24 ชม. (ข้ามร้าน · อ่านอย่างเดียว)
 *   ค้างผิดปกติ = ตัวรันรายนาทีบน VPS ไม่เดิน (ทรีเก่า/ไม่มี env/ไม่ได้ generate) หรือยังไม่ตั้งผู้ให้บริการ
 */
export async function roomJobsHealth(now: Date = new Date()): Promise<{ queuedStale: number; runningExpired: number; failed24h: number; aiEnabled: boolean }> {
  const [queuedStale, runningExpired, failed24h] = await Promise.all([
    prisma.aiRoomJob.count({ where: { status: "QUEUED", createdAt: { lt: new Date(now.getTime() - 5 * 60_000) } } }),
    prisma.aiRoomJob.count({ where: { status: "RUNNING", leaseUntil: { lt: now } } }),
    prisma.aiRoomJob.count({ where: { status: "FAILED", updatedAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
  ]);
  return { queuedStale, runningExpired, failed24h, aiEnabled: resolveProvider() !== null };
}

/** ลงทะเบียนตัวเก็บตกรายนาที "secretary.roomJobs" (ทุก 1 นาที · งบของตัวเอง 8 วิ) — ค่าเดียวกับที่ minute-jobs.ts ลงไว้เป็นงานแรก (แทนที่ในตำแหน่งเดิม) */
export function registerRoomJobsMinuteJob(): void {
  registerMinuteJob({
    name: ROOM_JOBS_MINUTE_JOB,
    everyMinutes: 1,
    ownBudgetMs: SECRETARY_ROOM_JOBS_BUDGET_MS,
    quietCutOff: true, // §Z.4 Q5 — ค่าเดียวกับ minute-jobs.ts
    run: async (now, _budgetMs, ctrl) => {
      await runRoomJobsTick(now, ctrl);
    },
  });
}
