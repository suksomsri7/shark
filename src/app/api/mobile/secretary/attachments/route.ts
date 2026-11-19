// POST /api/mobile/secretary/attachments (multipart `file`) — ไฟล์แนบของคำสั่งในห้องเลขา (ปุ่ม + : รูปภาพ · ถ่ายรูป · ไฟล์ · 14 พ.ย. 2026)
//   ด่าน = เส้นเลขาปกติ (Bearer + x-tenant-id + `ai.chat.send`) · 20 ไฟล์/นาที · ต้องมี Content-Length (ไม่มี = 411)
//   เพดาน 4 MB ต่อไฟล์ (คำขอของ Vercel ≤ 4.5 MB · แอปบีบอัดรูปก่อนส่ง) · ชนิด: รูป JPG/PNG/WEBP/GIF · PDF · Excel .xlsx · CSV
//   ตรวจ magic bytes ของไฟล์จริง (`classifyUpload` — ไม่ตรง = 415) · ไม่รับ svg/heic/xls
//   เก็บด้วย `uploadFile` ตัวกลาง (kind ATTACHMENT · **private** — ไม่มี URL CDN ถาวร · สลิป/ใบเสร็จ AUDIT-CLASS X10)
//   คืน `{id, name, mimeType, size, kind}` → แอปส่ง `attachments:[{id,name}]` ไปกับ POST rooms / rooms/[id]/send (ไฟล์กับข้อความแยกคำขอ)
import { cleanAttachName, classifyUpload, MSG_ATTACH_TOO_BIG, SEC_ATTACH_MAX_BYTES } from "@/lib/ai/secretary/attachments";
import { uploadFile } from "@/lib/storage/service";
import { fail, gate, ok, withRateLimit, withErrors } from "../_shared";

const MULTIPART_SLACK = 64 * 1024;

async function POST_(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "attachments", 20);
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
  return ok({ id: up.assetId, name, mimeType: t.mimeType, size: data.length, kind: t.kind });
}

export const POST = withErrors("secretary/attachments POST", POST_);
