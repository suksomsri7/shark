// POST /api/mobile/inbox/attachments — อัปไฟล์แนบของแชทลูกค้าจากแอป (Bearer · ≤ 10 MB · R-K13 · R-S1.21e)
//
// ห่อชุดเดียวกับ `api/v1/chat/attachments` (`uploadFile` kind ATTACHMENT · `CHAT_ATTACHMENT_MAX_BYTES` · ชนิดไฟล์ตามทะเบียนของ storage)
//   ต่างกันแค่ด่าน: v1 = คีย์ API ของร้าน · ที่นี่ = Bearer + x-tenant-id + สิทธิ์ตอบลูกค้า
// คืน `{ url, name, mimeType, size, width?, height?, durationMs? }` → แอปเอา url ไปแนบใน `…/reply` (ไฟล์กับข้อความแยกคำขอ = retry ข้อความได้ไม่ต้องอัปซ้ำ)
import { imageSize } from "@/lib/storage/image-size";
import { CHAT_ATTACHMENT_MAX_BYTES, uploadFile } from "@/lib/storage/service";
import { fail, gate, limited, REPLY } from "../_shared";

export async function POST(req: Request) {
  const a = await gate(req, [REPLY]);
  if (!a.ok) return a.res;
  const { c } = a;
  const rl = await limited(c, "attachments", 20);
  if (rl) return rl;
  // ตัดก่อนอ่านเข้าหน่วยความจำเมื่อหัวบอกขนาดมา (เผื่อ boundary ของ multipart 64 KB)
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > CHAT_ATTACHMENT_MAX_BYTES + 64 * 1024) return fail(413, "too_large", `ไฟล์ใหญ่เกิน ${Math.round(CHAT_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB`);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad_request", "ต้องส่งเป็น multipart/form-data พร้อมไฟล์ในช่อง file");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "bad_request", "ไม่พบไฟล์ในช่อง file");
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) return fail(413, "too_large", `ไฟล์ใหญ่เกิน ${Math.round(CHAT_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB`);
  const data = new Uint8Array(await file.arrayBuffer());
  const contentType = (file.type || "application/octet-stream").split(";")[0]!.trim().toLowerCase();
  const up = await uploadFile(
    { tenantId: c.tenantId },
    { kind: "ATTACHMENT", filename: file.name || "attachment", contentType, data, maxBytes: CHAT_ATTACHMENT_MAX_BYTES },
  );
  if (!up.ok) return fail(415, "unsupported", up.error);
  const size = imageSize(data, contentType);
  // ความยาวคลิปเสียง = เจตนาของผู้ส่ง (ข้อความเสียง) — ส่งกลับให้แอปแนบต่อ · ตัวตรวจเพดานจริงอยู่ที่ sendReply
  const dRaw = Number(form.get("durationMs"));
  const durationMs = Number.isInteger(dRaw) && dRaw > 0 ? dRaw : undefined;
  return Response.json({
    url: up.cdnUrl,
    name: file.name || "attachment",
    mimeType: contentType,
    size: data.length,
    width: size?.width ?? null,
    height: size?.height ?? null,
    ...(durationMs ? { durationMs } : {}),
  });
}
