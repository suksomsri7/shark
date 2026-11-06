// POST /api/mobile/inbox/conversations/[id]/task — เปิดการ์ดงานจากห้องแชทลูกค้า (ห่อ `createTaskFromChat` · S1.14b · ตั๋ว R-S2.17)
//   ด่าน = ตอบลูกค้าได้ (`chat.message.send`) · ห้องที่มองไม่เห็น = 404 · 30/นาที/ร้าน+ผู้ใช้
//   บอร์ดปลายทาง = ค่าตั้ง "สร้างงานจากแชท" ของร้าน (`chatTaskButtonConfig`) เท่านั้น — แอปเลือกบอร์ดเองไม่ได้ · ยังไม่ตั้ง ⇒ 404 not_configured
//   สิทธิ์บอร์ด (EDITOR ของบอร์ดปลายทาง) = ประตูของบอร์ดงานใน lib ด้วยสิทธิ์ของผู้กด · ผูกห้อง+ผู้ติดต่อ · ไม่คัดลอกไฟล์แนบ
//   error ของ lib: status 403/404 ⇒ 403 forbidden / 404 not_found (R-S1.14b-h) · ข้อความไทยอื่น ⇒ 422 task_failed · ระบบ ⇒ 500
import { z } from "zod";
import { errDetail, logOps } from "@/lib/core/ops";
import { createTaskFromChat } from "@/lib/modules/chat/task-from-chat";
import { chatTaskButtonConfig } from "@/lib/modules/kanban/integrations";
import { fail, gate, limited, notFound, readBody, REPLY, systemOf, visibleConv, type RouteCtx, withErrors } from "../../../_shared";

const Body = z
  .object({
    systemId: z.string().max(64).optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional(),
    dueAt: z.string().max(40).optional(),
  })
  .strict();

const THAI = /[฀-๿]/;

async function POST_(req: Request, ctx: RouteCtx) {
  const a = await gate(req, [REPLY]);
  if (!a.ok) return a.res;
  const { c } = a;
  const { id } = await ctx.params;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const dueAt = b.v.dueAt ? new Date(b.v.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) return fail(422, "invalid", "วันกำหนดเสร็จไม่ถูกต้อง");
  const sid = await systemOf(c.tenantId, b.v.systemId);
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  if (!(await visibleConv(c, sid, id))) return notFound();
  const rl = await limited(c, "task", 30);
  if (rl) return rl;
  const cfg = await chatTaskButtonConfig(c.tenantId);
  if (!cfg) return fail(404, "not_configured", "ร้านยังไม่ได้เปิด “สร้างงานจากแชท” — ให้เจ้าของร้านเปิดที่ บอร์ดงาน › ตั้งค่า › การเชื่อมต่อ");
  try {
    const r = await createTaskFromChat(
      { tenantId: c.tenantId, systemId: sid, actorUserId: c.userId },
      { userId: c.userId, role: c.m.role, unitAccess: c.ua, permissions: c.m.permissions },
      {
        conversationId: id,
        title: b.v.title,
        description: b.v.description ?? null,
        boardId: cfg.boardId,
        columnId: cfg.columnId,
        dueAt,
        link: { conversation: true, party: true, copyAttachments: false },
      },
    );
    return Response.json({ cardId: r.cardId, cardNo: r.cardNo, cardHref: r.cardHref, created: r.created });
  } catch (e) {
    // R-S1.14b-h: error ของ lib ที่มี status 403/404 (KanbanForbiddenError/KanbanNotFoundError) ⇒ status นั้น
    // กติกาของ lib (ไทย · บอกทำอะไรต่อ) ⇒ 422 · ข้อผิดพลาดระบบ ⇒ 500 ไม่ส่งรายละเอียดดิบ
    const thaiMsg = e instanceof Error && THAI.test(e.message) && !/prisma|invalid `|\bat \w+ \(/i.test(e.message) ? e.message.slice(0, 300) : null;
    const status = e && typeof e === "object" ? (e as { status?: unknown }).status : undefined;
    if (status === 403) return fail(403, "forbidden", thaiMsg ?? "บัญชีนี้ยังไม่มีสิทธิ์เพิ่มงานในบอร์ดปลายทาง — ขอสิทธิ์จากเจ้าของร้าน");
    if (status === 404) return fail(404, "not_found", thaiMsg ?? "ไม่พบบอร์ดหรือคอลัมน์ปลายทาง — ให้เจ้าของร้านตรวจค่าตั้ง “สร้างงานจากแชท”");
    if (thaiMsg) return fail(422, "task_failed", thaiMsg);
    await logOps("WARN", "mobile-inbox", "task: ล้ม", { detail: errDetail(e), tenantId: c.tenantId }).catch(() => {});
    return fail(500, "server_error", "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("inbox/conversations/[id]/task POST", POST_);
