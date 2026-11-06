// GET/POST /api/mobile/secretary/rooms — รายการห้องงาน (cursor คู่ `before=<iso>|<id>` · `pendingProposals` ต่อการ์ด) · เปิดห้องใหม่ (นับงาน 1 · R-K6)
//   POST = (clientMessageId ⇒ claim กันซ้ำ R-S1.14a) → `startRoom` (ตัวนับงาน + job ใน tx เดียว · S3a.1-S1 R-Z3) → worker ของงานนี้ใน `after()`
//   (R-K8 · R-Z5: `jobIds:[jobId]` + deadline 240 วิ จากต้นคำขอ · ที่ไม่ทัน = ตัวเก็บตกรายนาที)
import { z } from "zod";
import { listRooms, recentDuplicateRoom, startRoom, type RoomStatus } from "@/lib/ai/secretary/rooms";
import { tenantDb } from "@/lib/core/db";
import { runRoomJobs } from "@/lib/ai/secretary/worker";
import { roomCardsFor } from "@/lib/ai/secretary/views";
import { claimFailed, claimNewRoom, rememberFailed, cursorOf, fail, gate, ID_MAX, ok, pairCursor, readBody, runAfter, takeOf, thrown, withRateLimit, withErrors } from "../_shared";

/** SEC S3a.1-S1 R-Z5: route นี้รัน worker (โมเดล) ใน `after()` — เพดานของแพลตฟอร์ม · worker หยุดหยิบงานที่ 240 วิ */
export const maxDuration = 300;
const WORKER_DEADLINE_MS = 240_000;

const STATUSES: readonly RoomStatus[] = ["OPEN", "RUNNING", "WAITING", "DONE"];
const Id = z.string().trim().min(1).max(ID_MAX);
const PostBody = z
  .object({
    instruction: z.string().max(4000),
    title: z.string().max(200).optional(),
    systems: z.array(z.string().max(40)).max(20).optional(),
    context: z.object({ chatConversationId: Id.optional(), contactId: Id.optional() }).strict().optional(),
    clientMessageId: Id.refine((v) => !v.includes(":"), "clientMessageId ห้ามมี :").optional(),
  })
  .strict();

async function GET_(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const q = new URL(req.url).searchParams;
  const status = q.get("status");
  if (status && !STATUSES.includes(status as RoomStatus)) return fail(400, "invalid", "สถานะห้องไม่ถูกต้อง", { field: "status" });
  const before = pairCursor(q.get("before"));
  if (before === null) return fail(400, "invalid", "cursor ต้องเป็น <iso>|<id>", { field: "before" });
  const take = takeOf(q.get("take"), 50, 100);
  const rows = await listRooms(a.c.conv, {
    scope: q.get("scope") === "tenant" ? "tenant" : "mine",
    ...(status ? { status: status as RoomStatus } : {}),
    ...(q.get("q") ? { q: q.get("q")! } : {}),
    take,
    ...(before ? { before } : {}),
  });
  const last = rows[rows.length - 1];
  return ok({ items: await roomCardsFor(a.c.tenantId, rows), nextBefore: rows.length === take && last ? cursorOf(last.updatedAt, last.id) : null });
}

async function POST_(req: Request) {
  const start = Date.now();
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "rooms");
  if (rl) return rl;
  const b = await readBody(req, PostBody);
  if (!b.ok) return b.res;
  const { clientMessageId, ...input } = b.v;
  let claim: Awaited<ReturnType<typeof claimNewRoom>> | null;
  try {
    claim = clientMessageId ? await claimNewRoom(a.c.tenantId, a.c.userId, clientMessageId) : null;
  } catch (e) {
    return thrown(e, "rooms.post.claim");
  }
  if (claim && !claim.first) {
    // ส่งซ้ำ: คืนห้องเดิม (ไม่นับงานซ้ำ) · ห้องแรกยังสร้างไม่เสร็จ = 409 pending ให้แอปลองใหม่ครู่เดียว
    const roomId = await claim.existingRoomId();
    const room = roomId ? await tenantDb({ tenantId: a.c.tenantId }).aiRoom.findFirst({ where: { id: roomId, startedById: a.c.userId }, select: { id: true, conversationId: true } }) : null;
    if (!room) return fail(409, "pending", "กำลังเปิดห้องงานนี้อยู่ ลองใหม่อีกครั้ง");
    return ok({ duplicate: true, roomId: room.id, conversationId: room.conversationId });
  }
  // SEC S3a.1-S2 ▸ R-Z32: กุญแจถูกคืนหลังห้องเกิด (rememberFailed) ⇒ ครั้งถัดไปได้ first:true — ห้องเดิมที่คำสั่งแรกเท่ากันภายใน 10 นาที = duplicate ◂
  if (claim?.first) {
    try {
      const dup = await recentDuplicateRoom(a.c.tenantId, a.c.userId, input.instruction);
      if (dup) {
        await claim.remember(dup.roomId).catch((e: unknown) => rememberFailed(e, claim, "rooms.post.dup"));
        return ok({ duplicate: true, roomId: dup.roomId, conversationId: dup.conversationId });
      }
    } catch (e) {
      await claim.release().catch(() => undefined);
      return thrown(e, "rooms.post.dup");
    }
  }
  let created = false; // N1: ห้องเกิดแล้ว ⇒ ห้ามคืน claim (retry ต้องได้ห้องเดิม ไม่ใช่ห้องที่สอง)
  try {
    const r = await startRoom(a.c.conv, input);
    if (!r.ok) {
      try {
        await claim?.release();
      } catch (e) {
        return claimFailed(e, "rooms.post"); // R-Z11: ไม่กลืน
      }
      if (r.error === "quota") return fail(409, "quota", r.message, { resetAt: r.resetAt ?? null, jobsUsed: r.jobsUsed ?? null, jobsLimit: r.jobsLimit ?? null });
      if (r.error === "actor") return fail(403, "forbidden", r.message);
      if (r.error === "ai_disabled") return fail(503, "ai_disabled", r.message);
      return fail(400, r.error === "empty" ? "empty" : "invalid", r.message);
    }
    created = true;
    try {
      await claim?.remember(r.roomId);
    } catch (e) {
      // §Z.4 Q3: ห้อง+งานเกิดแล้วจริง แต่จดกุญแจไม่ได้ ⇒ คืน claim (ไม่ค้าง 409 pending 24 ชม.) + logOps WARN แล้วตอบ 200 ปกติด้านล่าง
      await rememberFailed(e, claim, "rooms.post");
    }
    // R-Z3/R-Z5: job เกิดใน tx ของ startRoom แล้ว ⇒ รันเฉพาะงานนี้หลังตอบ
    await runAfter(() => runRoomJobs({ jobIds: [r.jobId], limit: 1, deadline: start + WORKER_DEADLINE_MS }));
    return ok({ roomId: r.roomId, conversationId: r.conversationId, messageId: r.messageId, jobId: r.jobId, jobsUsed: r.jobsUsed, jobsLimit: r.jobsLimit });
  } catch (e) {
    if (!created && claim) {
      try {
        await claim.release();
      } catch (re) {
        await claimFailed(re, "rooms.post");
      }
    }
    return thrown(e, "rooms.post");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/rooms GET", GET_);
export const POST = withErrors("secretary/rooms POST", POST_);
