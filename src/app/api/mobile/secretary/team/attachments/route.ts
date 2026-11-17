// POST /api/mobile/secretary/team/attachments (multipart `file`) — ไฟล์แนบของแชททีม (B27 · ปุ่ม + หน้าช่องพิมพ์ · รูปกลุ่ม)
//   แบบเดียวกับ secretary/attachments (ชนิด/เพดาน/magic bytes/เก็บส่วนตัว) แต่ด่าน = สมาชิกร้าน (gate null — สมาชิก "คุยอย่างเดียว" แนบได้)
//   จดว่าใครอัป (`rememberUpload` 24 ชม.) — ตอนส่ง/ตั้งรูปกลุ่ม lib รับเฉพาะไฟล์ที่ผู้ส่งอัปเอง · 20 ไฟล์/นาที
import { cleanAttachName, classifyUpload, MSG_ATTACH_TOO_BIG, SEC_ATTACH_MAX_BYTES } from "@/lib/ai/secretary/attachments";
import { uploadFile } from "@/lib/storage/service";
import { rememberUpload } from "@/lib/team-chat/service";
import { fail, gate, ok, withRateLimit, withErrors } from "../../_shared";
import { rlKey, teamCtx } from "../_team";

const MULTIPART_SLACK = 64 * 1024;

async function POST_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-attachments", 20);
  if (rl) return rl;
  const lenHdr = req.headers.get("content-length");
  if (lenHdr === null || lenHdr.trim() === "" || !Number.isFinite(Number(lenHdr))) return fail(411, "length_required", "ต้องส่งขนาดไฟล์ (Content-Length) มาด้วย");
  if (Number(lenHdr) > SEC_ATTACH_MAX_BYTES + MULTIPART_SLACK) return fail(413, "too_large", MSG_ATTACH_TOO_BIG);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad_request", "ต้องส่งเป็น multipart/form-data พร้อมไฟล์ในช่อง file");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "bad_request", "ไม่พบไฟล์ในช่อง file");
  if (file.size > SEC_ATTACH_MAX_BYTES) return fail(413, "too_large", MSG_ATTACH_TOO_BIG);
  const data = new Uint8Array(await file.arrayBuffer());
  const name = cleanAttachName(file.name, "file");
  const t = classifyUpload(data, file.type || "", name);
  if (!t.ok) return fail(415, "unsupported", t.error);
  const up = await uploadFile({ tenantId: a.c.tenantId }, { kind: "ATTACHMENT", filename: name, contentType: t.storeType, data, maxBytes: SEC_ATTACH_MAX_BYTES, visibility: "private" });
  if (!up.ok) return fail(415, "unsupported", up.error);
  await rememberUpload(teamCtx(a.c), up.assetId);
  return ok({ id: up.assetId, name, mimeType: t.mimeType, size: data.length, kind: t.kind });
}

export const POST = withErrors("secretary/team/attachments POST", POST_);
