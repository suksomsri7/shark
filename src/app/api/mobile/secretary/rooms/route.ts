// GET/POST /api/mobile/secretary/rooms — รายการห้องงาน · เปิดห้องใหม่ (นับงาน 1 · R-K6)
//   POST = `startRoom` (ตัวนับงานใน tx เดียว) → `enqueueRoomJob` → worker ใน `after()` (R-K8 · ตอบทันที ไม่รอโมเดล)
import { z } from "zod";
import { listRooms, startRoom, type RoomStatus } from "@/lib/ai/secretary/rooms";
import { enqueueRoomJob, runRoomJobs } from "@/lib/ai/secretary/worker";
import { roomCardDto } from "@/lib/ai/secretary/dto";
import { dateOf, fail, gate, ID_MAX, ok, readBody, runAfter, takeOf, thrown, withRateLimit } from "../_shared";

const STATUSES: readonly RoomStatus[] = ["OPEN", "RUNNING", "WAITING", "DONE"];
const Id = z.string().trim().min(1).max(ID_MAX);
const PostBody = z
  .object({
    instruction: z.string().max(4000),
    title: z.string().max(200).optional(),
    systems: z.array(z.string().max(40)).max(20).optional(),
    context: z.object({ chatConversationId: Id.optional(), contactId: Id.optional() }).strict().optional(),
  })
  .strict();

export async function GET(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const q = new URL(req.url).searchParams;
  const status = q.get("status");
  if (status && !STATUSES.includes(status as RoomStatus)) return fail(400, "invalid", "สถานะห้องไม่ถูกต้อง", { field: "status" });
  const before = dateOf(q.get("before"));
  if (before === null) return fail(400, "invalid", "รูปแบบเวลาไม่ถูกต้อง", { field: "before" });
  const take = takeOf(q.get("take"), 50, 100);
  const rows = await listRooms(a.c.conv, {
    scope: q.get("scope") === "tenant" ? "tenant" : "mine",
    ...(status ? { status: status as RoomStatus } : {}),
    ...(q.get("q") ? { q: q.get("q")! } : {}),
    take,
    ...(before ? { before } : {}),
  });
  return ok({ items: rows.map(roomCardDto), nextBefore: rows.length === take ? rows[rows.length - 1]!.updatedAt.toISOString() : null });
}

export async function POST(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.c.userId, "rooms");
  if (rl) return rl;
  const b = await readBody(req, PostBody);
  if (!b.ok) return b.res;
  try {
    const r = await startRoom(a.c.conv, b.v);
    if (!r.ok) {
      if (r.error === "quota") return fail(409, "quota", r.message, { resetAt: r.resetAt ?? null, jobsUsed: r.jobsUsed ?? null, jobsLimit: r.jobsLimit ?? null });
      if (r.error === "actor") return fail(403, "forbidden", r.message);
      return fail(400, r.error === "empty" ? "empty" : "invalid", r.message);
    }
    const job = await enqueueRoomJob(a.c.tenantId, r.roomId, r.messageId, a.c.userId);
    await runAfter(() => runRoomJobs());
    return ok({ roomId: r.roomId, conversationId: r.conversationId, messageId: r.messageId, jobId: job.id, jobsUsed: r.jobsUsed, jobsLimit: r.jobsLimit });
  } catch (e) {
    return thrown(e, "rooms.post");
  }
}
