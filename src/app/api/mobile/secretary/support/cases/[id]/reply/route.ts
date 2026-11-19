// POST /api/mobile/secretary/support/cases/[id]/reply {body, attachments?} — ร้านตอบในเคส (`addShopMessage` · เคสปิดแล้วเปิดใหม่) · ไม่เห็น = 404
import { z } from "zod";
import { addShopMessage } from "@/lib/support/service";
import { gate, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx, withErrors } from "../../../../_shared";
import { AttachmentsSchema, FilesSchema, resolveCaseFiles, visibleCase } from "../../../_case";

// help-cases: `files` = ไฟล์ส่วนตัวจาก support/attachments · ขั้นของเคสเลื่อนตาม shopReplyStage (ใน addShopMessage)
const Body = z.object({ body: z.string().trim().min(1).max(4000), attachments: AttachmentsSchema.optional(), files: FilesSchema.optional() }).strict();

async function POST_(req: Request, ctx: RouteCtx) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "support");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  const c = id ? await visibleCase(a.c, id) : null;
  if (!c) return notFound("ไม่พบเรื่องนี้");
  const f = await resolveCaseFiles(a.c.tenantId, b.v.files, b.v.attachments?.length ?? 0);
  if (!f.ok) return f.res;
  if (!(await addShopMessage({ tenantId: a.c.tenantId }, c.id, a.c.userId, b.v.body, b.v.attachments, f.files))) return notFound("ไม่พบเรื่องนี้");
  return ok({ ok: true });
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("secretary/support/cases/[id]/reply POST", POST_);
