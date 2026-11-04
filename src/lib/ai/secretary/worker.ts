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

import { Prisma, type AiRoomJob } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { sendPushToUser } from "@/lib/core/push";
import { registerMinuteJob } from "@/lib/platform/minute-jobs";
import { actorProblem, aiMemberActor, type AiMemberActor } from "../actor";
import { findVisibleConversation } from "../conversations";
import type { AiProvider } from "../provider";
import { sendMessage, type SendResult } from "../service";
import { quotaMessage } from "../usage";
import { roomPushRecipients } from "./members";
import { notifyUser } from "./notify";

export const ROOM_JOB_LEASE_MS = 120_000; // 2 นาที
export const ROOM_JOB_MAX_ATTEMPTS = 3;
export const ROOM_JOBS_MINUTE_JOB = "secretary.roomJobs";
const RUN_LIMIT_DEFAULT = 5;
const RUN_LIMIT_MAX = 50;
const PUSH_BODY_MAX = 120;
const ERROR_MAX = 500;

type PushPost = NonNullable<NonNullable<Parameters<typeof sendPushToUser>[2]>["post"]>;
/** `deadline` (เพิ่มจากใบ · ไม่บังคับ) = เวลาจริง (ms) ที่หยุดหยิบงานใหม่ — งานรายนาทีส่ง `ctrl.deadline` ของรอบ */
export type RoomJobDeps = { provider?: AiProvider; post?: PushPost; now?: Date; limit?: number; deadline?: number };

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
const ERR_AI_DISABLED = "ผู้ช่วย AI ยังไม่เปิดใช้งานในตอนนี้ ลองใหม่ภายหลัง";
const ERR_EMPTY = "ข้อความว่าง ไม่มีงานให้ทำ";
const ERR_RETRY = "เลขาติดขัดชั่วคราว ระบบจะลองใหม่ให้อัตโนมัติ";
const ERR_GAVE_UP = `เลขาทำงานนี้ไม่สำเร็จหลังลอง ${ROOM_JOB_MAX_ATTEMPTS} ครั้ง — ลองสั่งใหม่อีกครั้ง`;
const PUSH_FAILED_PREFIX = "ทำไม่ได้: ";

/** สถานะที่ claim ได้ ณ เวลา now — QUEUED หรือ RUNNING ที่ lease หมดแล้ว · ยังไม่ครบจำนวนครั้ง */
function claimableWhere(now: Date): Prisma.AiRoomJobWhereInput {
  return {
    OR: [{ status: "QUEUED" }, { status: "RUNNING", leaseUntil: { lt: now } }],
    attempts: { lt: ROOM_JOB_MAX_ATTEMPTS },
  };
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
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

/** งาน 1 ตัวที่ claim แล้ว (attempts = ค่าหลัง claim · ใช้เป็น fencing token ตอนเขียนผล) */
async function processJob(job: AiRoomJob, attempt: number, deps: RoomJobDeps): Promise<Outcome> {
  const tenantId = job.tenantId;
  const db = tenantDb({ tenantId });
  // เขียนผล = เฉพาะถ้ายังเป็นรอบของเรา (lease ไม่ถูกตัวอื่นหยิบต่อ — attempts ยังเท่าเดิม)
  const finish = async (data: Prisma.AiRoomJobUpdateManyMutationInput): Promise<boolean> => {
    const r = await prisma.aiRoomJob.updateMany({ where: { id: job.id, tenantId, status: "RUNNING", attempts: attempt }, data });
    return r.count > 0;
  };
  const fail = async (error: string, push = true): Promise<Outcome> =>
    (await finish({ status: "FAILED", error: error.slice(0, ERROR_MAX), leaseUntil: null, finishedAt: new Date() })) ? { kind: "failed", error, push } : { kind: "lost" };

  const [room, message] = await Promise.all([
    db.aiRoom.findFirst({ where: { id: job.roomId }, select: { id: true, conversationId: true } }),
    db.aiMessage.findFirst({ where: { id: job.messageId }, select: { id: true, content: true, conversationId: true } }),
  ]);
  if (!room || !message || message.conversationId !== room.conversationId) return fail(ERR_MISSING, false);
  const authorUserId = job.authorUserId ?? "";
  // Membership สดทุกรอบ — ถูกถอน/ยังไม่รับคำเชิญ ⇒ FAILED ไม่เรียกโมเดล ไม่ retry
  const membership = authorUserId
    ? await prisma.membership.findFirst({
        where: { tenantId, userId: authorUserId, acceptedAt: { not: null } },
        select: { role: true, unitAccess: true, permissions: true },
      })
    : null;
  if (!membership) return fail(ERR_NOT_MEMBER);
  const actor = aiMemberActor(tenantId, authorUserId, membership);
  const ctx = { tenantId, actor };
  // ผู้สั่งยังต้องเห็นห้อง (ถูกเอาออกจากห้องระหว่างรอคิว) — ไม่งั้น sendMessage จะ throw ทุกรอบ
  if (!(await findVisibleConversation(ctx, room.conversationId))) return fail(ERR_NOT_IN_ROOM);

  let res: SendResult;
  try {
    res = await sendMessage(
      ctx,
      { conversationId: room.conversationId, text: message.content },
      { ...(deps.provider ? { provider: deps.provider } : {}), source: "CHAT", userMessageId: message.id },
    );
  } catch (e) {
    await logOps("WARN", "ai", `secretary.roomJobs: งาน ${job.id} ล้ม (ครั้งที่ ${attempt})`, {
      tenantId,
      detail: e instanceof Error ? (e.stack ?? e.message) : String(e),
    }).catch(() => {});
    if (attempt < ROOM_JOB_MAX_ATTEMPTS) {
      return (await finish({ status: "QUEUED", leaseUntil: null, error: ERR_RETRY })) ? { kind: "requeued" } : { kind: "lost" };
    }
    return fail(ERR_GAVE_UP);
  }
  if (!res.ok) return fail(failMessageOf(res));
  return (await finish({ status: "DONE", error: null, leaseUntil: null, finishedAt: new Date() })) ? { kind: "done", reply: res.reply } : { kind: "lost" };
}

/**
 * push ถึงผู้เปิดห้อง ∪ สมาชิกห้อง ที่ Membership ยังรับอยู่ (S1.6 R-S1.6c · `roomPushRecipients`) · ไม่กรองร้านของเครื่อง (R-K20) · ล้ม = log ไม่ throw
 *   S1.23 ▸ ผ่าน `notifyUser(uid, tenantId, "room", …)` = เคารพค่าตั้ง "ห้องเลขา" (OFF = ไม่ส่ง) + badge + กันสแปม (ห้องเดิมถึงคนเดิมใน 60 วิ) ◂
 */
async function pushRoom(job: AiRoomJob, text: string, deps: RoomJobDeps): Promise<void> {
  try {
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
        await notifyUser(uid, job.tenantId, "room", msg, deps.post ? { post: deps.post } : undefined);
      } catch (e) {
        await logOps("WARN", "push", `secretary.roomJobs: push ล้ม (ผู้ใช้ ${uid})`, { tenantId: job.tenantId, detail: String(e) }).catch(() => {});
      }
    }
  } catch (e) {
    await logOps("WARN", "push", "secretary.roomJobs: เตรียม push ล้ม", { tenantId: job.tenantId, detail: String(e) }).catch(() => {});
  }
}

/**
 * รันงานในคิว 1 รอบ — ไม่ throw (ทุกอย่างพลาด = log + นับเท่าที่ทำได้)
 *   (1) หางาน QUEUED / RUNNING ที่ lease หมด · attempts < 3 · เรียง createdAt · ≤ limit (ปริยาย 5)
 *   (2) claim ทีละตัวด้วย conditional `updateMany` (count 0 = ตัวอื่นได้ไป ข้าม — X5)
 *   (3)–(5) ผู้สั่งพ้นสมาชิก ⇒ FAILED · sendMessage ok ⇒ DONE · !ok ⇒ FAILED (ไม่ retry) · throw ⇒ กลับคิว / ครั้งที่ 3 = FAILED
 *   (6) DONE/FAILED ⇒ push · `now` ฉีดได้ (เกณฑ์ lease)
 */
export async function runRoomJobs(deps: RoomJobDeps = {}): Promise<RunRoomJobsResult> {
  const out: RunRoomJobsResult = { claimed: 0, done: 0, failed: 0, requeued: 0 };
  const now = deps.now instanceof Date && !Number.isNaN(deps.now.getTime()) ? deps.now : new Date();
  const limit = Math.min(Math.max(Math.floor(Number(deps.limit) || RUN_LIMIT_DEFAULT), 1), RUN_LIMIT_MAX);
  let candidates: { id: string }[];
  try {
    // คิวกลางข้ามร้าน (ตัวรันเบื้องหลัง) — ทุกการเขียนต่อจากนี้ผูก tenantId ของแถว
    candidates = await prisma.aiRoomJob.findMany({ where: claimableWhere(now), orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: limit, select: { id: true } });
  } catch (e) {
    await logOps("WARN", "ai", "secretary.roomJobs: อ่านคิวไม่ได้", { detail: String(e) }).catch(() => {});
    return out;
  }
  for (const c of candidates) {
    if (typeof deps.deadline === "number" && Date.now() >= deps.deadline) break; // หมดงบของรอบ — ที่เหลือรอบหน้า
    try {
      const got = await prisma.aiRoomJob.updateMany({
        where: { id: c.id, ...claimableWhere(now) },
        data: { status: "RUNNING", leaseUntil: new Date(now.getTime() + ROOM_JOB_LEASE_MS), attempts: { increment: 1 }, startedAt: now },
      });
      if (got.count === 0) continue; // อีกรอบหยิบไปแล้ว
      out.claimed++;
      const job = await prisma.aiRoomJob.findUnique({ where: { id: c.id } });
      if (!job) continue;
      const outcome = await processJob(job, job.attempts, deps);
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

/** ลงทะเบียนตัวเก็บตกรายนาที "secretary.roomJobs" (ทุก 1 นาที) — เรียกซ้ำได้ (ชื่อ+จังหวะเดิม = แทนที่ตัวเดิม) */
export function registerRoomJobsMinuteJob(): void {
  registerMinuteJob({
    name: ROOM_JOBS_MINUTE_JOB,
    everyMinutes: 1,
    run: async (now, budgetMs, ctrl) => {
      void budgetMs;
      // เผื่อ 8 วิ ให้งานที่หยิบไปแล้วรันจบภายในงบ (โมเดลตอบช้า = lease 2 นาทีเก็บตกอยู่แล้ว)
      await runRoomJobs({ now, limit: RUN_LIMIT_DEFAULT, deadline: ctrl.deadline - 8_000 });
    },
  });
}
