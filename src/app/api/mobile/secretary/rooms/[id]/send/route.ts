// POST /api/mobile/secretary/rooms/[id]/send {text, clientMessageId?} — สั่งเพิ่มในห้องเดิม (ไม่นับงาน · R-K6) · 10/นาที
//   `sendRoomMessage` (ข้อความ USER + job ใน tx เดียว) → worker ของงานนี้ใน `after()` (R-K8 · S3a.1-S1 R-Z5: `jobIds:[jobId]` + deadline)
//   ส่งซ้ำ clientMessageId เดิม (กุญแจต่อผู้ใช้ · id ห้ามมี ":" — R-Z11) = 200 `{duplicate:true, messageId, jobId}` ไม่สร้างซ้ำ ·
//   ครั้งแรกยังไม่จบ = 409 `pending` (แอปรอแล้วลองใหม่ · เหมือน POST rooms)
import { z } from "zod";
import { tenantDb } from "@/lib/core/db";
import { runRoomJobs, sendRoomMessage } from "@/lib/ai/secretary/worker";
import { recentDuplicateMessage } from "@/lib/ai/secretary/rooms";
import { claimClientMessageId, claimFailed, fail, rememberFailed, gate, ID_MAX, idParam, notFound, ok, readBody, runAfter, thrown, withRateLimit, type RouteCtx, withErrors } from "../../../_shared";

/** SEC S3a.1-S1 R-Z5: route นี้รัน worker (โมเดล) ใน `after()` — เพดานของแพลตฟอร์ม · worker หยุดหยิบงานที่ 240 วิ */
export const maxDuration = 300;
const WORKER_DEADLINE_MS = 240_000;

const Body = z
  .object({
    text: z.string().max(4000),
    clientMessageId: z.string().trim().min(1).max(ID_MAX).refine((v) => !v.includes(":"), "clientMessageId ห้ามมี :").optional(),
  })
  .strict();

async function POST_(req: Request, ctx: RouteCtx) {
  const start = Date.now();
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "send", 10);
  if (rl) return rl;
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบห้องงานนี้");
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  let claim: Awaited<ReturnType<typeof claimClientMessageId>> | null;
  try {
    claim = b.v.clientMessageId ? await claimClientMessageId(a.c.tenantId, id, a.c.userId, b.v.clientMessageId) : null;
  } catch (e) {
    return thrown(e, "rooms.send.claim");
  }
  if (claim && !claim.first) {
    // R-Z11: ส่งซ้ำ ⇒ ข้อความ/งานของครั้งแรก · ครั้งแรกยังไม่จด (กำลังส่ง) ⇒ 409 pending
    try {
      const messageId = await claim.existingMessageId();
      if (!messageId) return fail(409, "pending", "กำลังส่งข้อความนี้อยู่ ลองใหม่อีกครั้ง");
      const job = await tenantDb({ tenantId: a.c.tenantId }).aiRoomJob.findFirst({ where: { messageId, roomId: id }, select: { id: true } });
      return ok({ ok: true, duplicate: true, messageId, jobId: job?.id ?? null });
    } catch (e) {
      return thrown(e, "rooms.send.duplicate");
    }
  }
  // SEC S3a.1-S2 ▸ R-Z32: ข้อความ USER เดียวกันในห้องนี้ภายใน 10 นาที (กุญแจถูกคืนหลังข้อความเกิด) = duplicate ของครั้งแรก ◂
  if (claim?.first) {
    try {
      const dup = await recentDuplicateMessage(a.c.tenantId, id, a.c.userId, b.v.text);
      if (dup) {
        await claim.remember(dup.messageId).catch((e: unknown) => rememberFailed(e, claim, "rooms.send.dup"));
        return ok({ ok: true, duplicate: true, messageId: dup.messageId, jobId: dup.jobId });
      }
    } catch (e) {
      await claim.release().catch(() => undefined);
      return thrown(e, "rooms.send.dup");
    }
  }
  let created = false;
  try {
    const r = await sendRoomMessage(a.c.conv, id, { text: b.v.text });
    if (!r.ok) {
      try {
        await claim?.release();
      } catch (e) {
        return claimFailed(e, "rooms.send"); // R-Z11: ไม่กลืน
      }
      if (r.error === "not_found") return notFound(r.message);
      if (r.error === "closed") return fail(409, "closed", r.message);
      return fail(400, "empty", r.message);
    }
    created = true;
    const runJob = () => runAfter(() => runRoomJobs({ jobIds: [r.jobId], limit: 1, deadline: start + WORKER_DEADLINE_MS }));
    try {
      await claim?.remember(r.messageId);
    } catch (e) {
      // §Z.4 Q3 (แบบเดียวกับ POST rooms): ข้อความ+งานเกิดแล้วจริง ⇒ คืน claim + logOps WARN แล้วตอบ 200 ปกติด้านล่าง
      await rememberFailed(e, claim, "rooms.send");
    }
    await runJob();
    return ok({ ok: true, messageId: r.messageId, jobId: r.jobId });
  } catch (e) {
    if (!created && claim) {
      try {
        await claim.release();
      } catch (re) {
        await claimFailed(re, "rooms.send");
      }
    }
    return thrown(e, "rooms.send");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("secretary/rooms/[id]/send POST", POST_);
