// POST /api/mobile/secretary/support/upload (multipart `file`) — รูปแนบเรื่องช่วยเหลือ ≤ 5 MB · ภาพเท่านั้น
//   เก็บด้วย `uploadFile` (ที่เก็บไฟล์กลาง · kind ATTACHMENT · ชนิดตามทะเบียน storage) → คืน `{url, name, kind:"image"}` ไปแนบใน cases/reply
//   (url https ผ่าน `isSafeAttachmentUrl` ของ support/service.ts · รูปแบบ data URL เดิมของเว็บยังส่งตรงใน attachments ได้)
import { uploadFile } from "@/lib/storage/service";
import { fail, gate, ok, withRateLimit } from "../../_shared";

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.c.userId, "support-upload", 10);
  if (rl) return rl;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return fail(413, "too_large", "รูปใหญ่เกิน 5 MB");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad_request", "ต้องส่งเป็น multipart/form-data พร้อมรูปในช่อง file");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "bad_request", "ไม่พบรูปในช่อง file");
  if (file.size > MAX_BYTES) return fail(413, "too_large", "รูปใหญ่เกิน 5 MB");
  const contentType = (file.type || "").split(";")[0]!.trim().toLowerCase();
  if (!contentType.startsWith("image/")) return fail(415, "unsupported", "แนบได้เฉพาะรูปภาพ");
  const up = await uploadFile({ tenantId: a.c.tenantId }, { kind: "ATTACHMENT", filename: file.name || "image", contentType, data: new Uint8Array(await file.arrayBuffer()), maxBytes: MAX_BYTES });
  if (!up.ok) return fail(415, "unsupported", up.error);
  return ok({ url: up.cdnUrl, name: file.name || "image", kind: "image", mimeType: contentType, size: file.size });
}
