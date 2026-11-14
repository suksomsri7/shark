// GET /api/mobile/secretary/rooms/[id]/files/[fileId] — ไบต์ของไฟล์แนบในห้องเลขา (รูปย่อในฟอง · 14 พ.ย. 2026)
//   ไฟล์แนบของเลขาเก็บแบบส่วนตัว (ไม่มี URL CDN) ⇒ เส้นนี้คือทางออกทางเดียวของแอป (Bearer · `/api/files` ใช้คุกกี้เว็บ)
//   สิทธิ์ = เห็นห้อง (`getRoom` · ผู้เปิด ∪ สมาชิก ∪ OWNER) **และ** ไฟล์ผูกกับข้อความในห้องนี้ที่ผู้ดูเห็น (seeHistory=false ⇒ หลัง addedAt)
//   ไม่ผ่าน/ไม่มี = 404 (ไม่บอกว่ารหัสมีจริง) · 120 ครั้ง/นาที · ทุกคำตอบ `Cache-Control: private, no-store` · สตรีมจากที่เก็บด้วยกุญแจฝั่งเซิร์ฟเวอร์
import { tenantDb } from "@/lib/core/db";
import { getRoom } from "@/lib/ai/secretary/rooms";
import { visibleMessagesWhere } from "@/lib/ai/secretary/members";
import { attachmentsOf, CSV_MIME } from "@/lib/ai/secretary/attachments";
import { FILE_ASSET_ID_RE, isPrivateStoragePath, openStoredFile } from "@/lib/storage/service";
import { gate, idParam, withRateLimit, type RouteCtx, withErrors } from "../../../../_shared";

const NO_STORE = { "cache-control": "private, no-store" };
const gone = () => new Response(null, { status: 404, headers: NO_STORE });

async function GET_(req: Request, ctx: RouteCtx<"id" | "fileId">) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "room-files", 120);
  if (rl) return rl;
  const id = await idParam(ctx, "id");
  const fileId = await idParam(ctx, "fileId");
  if (!id || !fileId || !FILE_ASSET_ID_RE.test(fileId)) return gone();
  const room = await getRoom(a.c.conv, id);
  if (!room) return gone();
  const db = tenantDb({ tenantId: a.c.tenantId });
  const since = await visibleMessagesWhere(a.c.conv, room.conversationId);
  const msg = await db.aiMessage.findFirst({
    where: { conversationId: room.conversationId, ...since, attachments: { array_contains: [{ fileId }] } },
    select: { attachments: true },
  });
  const att = msg ? attachmentsOf(msg.attachments).find((x) => x.fileId === fileId) : undefined;
  if (!att) return gone();
  const asset = await db.fileAsset.findFirst({ where: { id: fileId, kind: "ATTACHMENT" }, select: { path: true, contentType: true } });
  if (!asset || !isPrivateStoragePath(asset.path)) return gone();
  const opened = await openStoredFile(asset.path, a.c.tenantId);
  if (!opened.ok) return new Response(null, { status: opened.status === 503 ? 503 : 404, headers: NO_STORE });
  const type = att.mimeType === CSV_MIME ? "text/csv; charset=utf-8" : att.mimeType || asset.contentType;
  const inline = att.kind === "image" || att.kind === "pdf";
  const headers = {
    ...NO_STORE,
    "content-type": type,
    "x-content-type-options": "nosniff",
    "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.name)}`,
  };
  return new Response((opened.body ?? opened.bytes) as BodyInit, { status: 200, headers });
}

export const GET = withErrors("secretary/rooms/[id]/files/[fileId] GET", GET_);
