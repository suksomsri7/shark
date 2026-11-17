// GET /api/mobile/secretary/team/threads/[id]/files/[fileId] — ไบต์ของไฟล์แนบ/รูปกลุ่มในแชททีม (B27 · แบบ rooms/[id]/files/[fileId])
//   สิทธิ์ = สมาชิกห้อง **และ** ไฟล์อยู่ในข้อความที่ผู้ดูเห็น (หลัง joinedAt · ยังไม่ลบ) หรือเป็นรูปกลุ่ม · ไม่ผ่าน = 404 · 120/นาที · no-store
import { CSV_MIME } from "@/lib/ai/secretary/attachments-shared";
import { prisma } from "@/lib/core/db";
import { visibleFile } from "@/lib/team-chat/service";
import { FILE_ASSET_ID_RE, isPrivateStoragePath, openStoredFile } from "@/lib/storage/service";
import { gate, idParam, withRateLimit, type RouteCtx, withErrors } from "../../../../../_shared";
import { rlKey, teamCtx } from "../../../../_team";

const NO_STORE = { "cache-control": "private, no-store" };
const gone = () => new Response(null, { status: 404, headers: NO_STORE });

async function GET_(req: Request, ctx: RouteCtx<"id" | "fileId">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-files", 120);
  if (rl) return rl;
  const id = await idParam(ctx, "id");
  const fileId = await idParam(ctx, "fileId");
  if (!id || !fileId || !FILE_ASSET_ID_RE.test(fileId)) return gone();
  const att = await visibleFile(teamCtx(a.c), id, fileId);
  if (!att) return gone();
  const asset = await prisma.fileAsset.findFirst({ where: { id: fileId, tenantId: a.c.tenantId, kind: "ATTACHMENT" }, select: { path: true, contentType: true } });
  if (!asset || !isPrivateStoragePath(asset.path)) return gone();
  const opened = await openStoredFile(asset.path, a.c.tenantId);
  if (!opened.ok) return new Response(null, { status: opened.status === 503 ? 503 : 404, headers: NO_STORE });
  const type = att.mimeType === CSV_MIME ? "text/csv; charset=utf-8" : att.mimeType || asset.contentType;
  const inline = att.kind === "image" || att.kind === "pdf";
  return new Response((opened.body ?? opened.bytes) as BodyInit, {
    status: 200,
    headers: { ...NO_STORE, "content-type": type, "x-content-type-options": "nosniff", "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.name)}` },
  });
}

export const GET = withErrors("secretary/team/threads/[id]/files/[fileId] GET", GET_);
