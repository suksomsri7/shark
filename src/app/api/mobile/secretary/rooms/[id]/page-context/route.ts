// POST /api/mobile/secretary/rooms/[id]/page-context {answer:"yes"|"no"} — คำตอบของการ์ด CONTEXT_CONFIRM (Lekaa FAB · แบบ fab4 จอ 3)
//   เลขาถามว่า "หมายถึง <ป้าย> ที่เปิดอยู่ใช่ไหม" (AiRoom.pageContext.state = ASKED) → ผู้ใช้กด "ใช่ <ป้าย>" / "ไม่ใช่"
//   ลำดับ: ด่านเลขา → เพดาน 10/นาที → ห้องที่มองเห็น (ไม่เห็น 404) → ห้องปิด 409 `closed` → สถานะต้องเป็น ASKED (ไม่ใช่ 409 `not_asked`)
//   → เขียนสถานะแบบมีเงื่อนไข (state = ASKED · กดซ้ำ/พร้อมกัน = ครั้งเดียว) → ข้อความ USER "ใช่ …"/"ไม่ใช่" + job (`sendRoomMessage`) → worker ใน `after()`
//   ส่งข้อความล้ม ⇒ คืนสถานะเป็น ASKED (กดใหม่ได้) · งานที่แก้ข้อมูลยังผ่านด่านอนุมัติเดิม (ที่นี่แค่บอกเลขาว่าผู้ใช้หมายถึงหน้านี้ไหม)
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { getRoom } from "@/lib/ai/secretary/rooms";
import { runRoomJobs, sendRoomMessage } from "@/lib/ai/secretary/worker";
import { answerPageContext, toJson } from "@/lib/ai/secretary/page-context";
import { fail, gate, idParam, notFound, ok, readBody, runAfter, withRateLimit, type RouteCtx, withErrors } from "../../../_shared";

export const maxDuration = 300;
const WORKER_DEADLINE_MS = 240_000;

const Body = z.object({ answer: z.enum(["yes", "no"]) }).strict();

async function POST_(req: Request, ctx: RouteCtx) {
  const start = Date.now();
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "send", 10);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  const room = id ? await getRoom(a.c.conv, id) : null;
  if (!room) return notFound("ไม่พบห้องงานนี้");
  if (room.closedAt) return fail(409, "closed", "ห้องนี้ปิดงานแล้ว");
  const yes = b.v.answer === "yes";
  const r = answerPageContext(room.pageContext, yes);
  if (!r.ok) return fail(409, r.error, r.message);
  const db = tenantDb({ tenantId: a.c.tenantId });
  const set = await db.aiRoom.updateMany({
    where: { id: room.id, tenantId: a.c.tenantId, pageContext: { path: ["state"], equals: "ASKED" } },
    data: { pageContext: toJson(r.next) },
  });
  if (set.count === 0) return fail(409, "not_asked", "ตอบคำถามนี้ไปแล้ว");
  const text = yes ? `ใช่ ${r.label}` : "ไม่ใช่";
  const sent = await sendRoomMessage(a.c.conv, room.id, { text }).catch(() => null);
  if (!sent || !sent.ok) {
    // คืนสถานะ (ผู้ใช้กดใหม่ได้) — เขียนกลับเฉพาะถ้ายังเป็นค่าที่เราตั้ง
    await db.aiRoom.updateMany({ where: { id: room.id, tenantId: a.c.tenantId }, data: { pageContext: toJson({ ...r.next, state: "ASKED" }) } }).catch(() => undefined);
    if (sent && !sent.ok && sent.error === "closed") return fail(409, "closed", sent.message);
    return fail(503, "unavailable", "ส่งคำตอบไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
  await runAfter(() => runRoomJobs({ jobIds: [sent.jobId], limit: 1, deadline: start + WORKER_DEADLINE_MS }));
  return ok({ ok: true, state: r.next.state, messageId: sent.messageId, jobId: sent.jobId });
}

export const POST = withErrors("secretary/rooms/[id]/page-context POST", POST_);
