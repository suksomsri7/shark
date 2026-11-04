// GET/POST /api/mobile/secretary/rooms — รายการห้องงาน (cursor คู่ `before=<iso>|<id>` · `pendingProposals` ต่อการ์ด) · เปิดห้องใหม่ (นับงาน 1 · R-K6)
//   POST = (clientMessageId ⇒ claim กันซ้ำ R-S1.14a) → `startRoom` (ตัวนับงานใน tx เดียว) → `enqueueRoomJob` → worker ใน `after()` (R-K8)
import { z } from "zod";
import { listRooms, startRoom, type RoomStatus } from "@/lib/ai/secretary/rooms";
import { tenantDb } from "@/lib/core/db";
import { enqueueRoomJob, runRoomJobs } from "@/lib/ai/secretary/worker";
import { roomCardsFor } from "@/lib/ai/secretary/views";
import { claimNewRoom, cursorOf, fail, gate, ID_MAX, ok, pairCursor, readBody, runAfter, takeOf, thrown, withRateLimit } from "../_shared";

const STATUSES: readonly RoomStatus[] = ["OPEN", "RUNNING", "WAITING", "DONE"];
const Id = z.string().trim().min(1).max(ID_MAX);
const PostBody = z
  .object({
    instruction: z.string().max(4000),
    title: z.string().max(200).optional(),
    systems: z.array(z.string().max(40)).max(20).optional(),
    context: z.object({ chatConversationId: Id.optional(), contactId: Id.optional() }).strict().optional(),
    clientMessageId: Id.optional(),
  })
  .strict();

export async function GET(req: Request) {
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

export async function POST(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "rooms");
  if (rl) return rl;
  const b = await readBody(req, PostBody);
  if (!b.ok) return b.res;
  const { clientMessageId, ...input } = b.v;
  const claim = clientMessageId ? await claimNewRoom(a.c.tenantId, a.c.userId, clientMessageId) : null;
  if (claim && !claim.first) {
    // ส่งซ้ำ: คืนห้องเดิม (ไม่นับงานซ้ำ) · ห้องแรกยังสร้างไม่เสร็จ = 409 pending ให้แอปลองใหม่ครู่เดียว
    const roomId = await claim.existingRoomId();
    const room = roomId ? await tenantDb({ tenantId: a.c.tenantId }).aiRoom.findFirst({ where: { id: roomId, startedById: a.c.userId }, select: { id: true, conversationId: true } }) : null;
    if (!room) return fail(409, "pending", "กำลังเปิดห้องงานนี้อยู่ ลองใหม่อีกครั้ง");
    return ok({ duplicate: true, roomId: room.id, conversationId: room.conversationId });
  }
  try {
    const r = await startRoom(a.c.conv, input);
    if (!r.ok) {
      await claim?.release();
      if (r.error === "quota") return fail(409, "quota", r.message, { resetAt: r.resetAt ?? null, jobsUsed: r.jobsUsed ?? null, jobsLimit: r.jobsLimit ?? null });
      if (r.error === "actor") return fail(403, "forbidden", r.message);
      return fail(400, r.error === "empty" ? "empty" : "invalid", r.message);
    }
    await claim?.remember(r.roomId);
    const job = await enqueueRoomJob(a.c.tenantId, r.roomId, r.messageId, a.c.userId);
    await runAfter(() => runRoomJobs());
    return ok({ roomId: r.roomId, conversationId: r.conversationId, messageId: r.messageId, jobId: job.id, jobsUsed: r.jobsUsed, jobsLimit: r.jobsLimit });
  } catch (e) {
    await claim?.release();
    return thrown(e, "rooms.post");
  }
}
