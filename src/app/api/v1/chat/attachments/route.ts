// POST /api/v1/chat/attachments — อัปไฟล์แนบของแชท (WO-C5 · §3.2)
//
// ห่อ `uploadFile()` เดิม (Bunny SG) เป็น REST · ตอบตามสัญญา:
//   { url, name, mimeType, sizeBytes, width?, height? }
// แล้วผู้เรียกเอา url ที่ได้ไปแนบกับ POST /messages อีกที (ไฟล์กับข้อความแยกคำขอกัน
// เพื่อให้ retry ข้อความได้โดยไม่ต้องอัปไฟล์ซ้ำ)
//
// ⚠️ เพดาน 10MB (ของเดิมทั้งระบบ 5MB) — SiamDive ใช้ 10MB อยู่แล้ว ลดลง = ผู้ใช้เดิมส่งไม่ผ่าน
// ⚠️ ชนิดไฟล์ครอบ heic/heif/doc/docx/xlsx เพิ่มจากของเดิม · SEC S3a.1-S2 R-Z34: ตรวจ magic bytes (`storage/sniff.ts`) — ไม่รับ svg/txt
import {
  authenticateChatRequest,
  chatJson,
  chatPreflight,
} from "@/lib/modules/chat/public-auth";
import { imageSize } from "@/lib/storage/image-size";
import { sniffedAttachmentType } from "@/lib/storage/sniff";
import { CHAT_ATTACHMENT_MAX_BYTES, uploadFile } from "@/lib/storage/service";

export async function OPTIONS(req: Request): Promise<Response> {
  return chatPreflight(req);
}

export async function POST(req: Request): Promise<Response> {
  const auth = await authenticateChatRequest(req);
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return chatJson(auth, { error: "ต้องส่งเป็น multipart/form-data พร้อมไฟล์ในช่อง file" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return chatJson(auth, { error: "ไม่พบไฟล์ในช่อง file" }, 400);
  }
  // ตัดตั้งแต่ยังไม่อ่านเข้าหน่วยความจำ — ไฟล์ 500MB ไม่ควรถูก buffer เพื่อไปตอบ 413 ทีหลัง
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
    return chatJson(
      auth,
      { error: `ไฟล์ใหญ่เกิน ${Math.round(CHAT_ATTACHMENT_MAX_BYTES / (1024 * 1024))}MB — กรุณาย่อขนาดก่อนอัปโหลด` },
      413,
    );
  }

  const data = new Uint8Array(await file.arrayBuffer());
  // SEC S3a.1-S2 ▸ R-Z34 (RC1 M2): ตรวจ magic bytes ตัวเดียวกับแอป — svg/txt/ไฟล์ปลอมชนิด = 415 · เก็บชนิดที่ตรวจได้ ◂
  const contentType = sniffedAttachmentType(data, file.type || "application/octet-stream");
  if (!contentType) return chatJson(auth, { error: "แนบได้เฉพาะรูป (JPG · PNG · WEBP · HEIC · GIF) · PDF · ไฟล์เสียง · เอกสาร Word/Excel — ไฟล์นี้ไม่ตรงกับชนิดที่รองรับ" }, 415);
  const up = await uploadFile(
    { tenantId: auth.tenantId },
    {
      kind: "ATTACHMENT",
      filename: file.name || "attachment",
      contentType,
      data,
      maxBytes: CHAT_ATTACHMENT_MAX_BYTES,
    },
  );
  if (!up.ok) return chatJson(auth, { error: up.error }, 415);

  const size = imageSize(data, contentType);
  return chatJson(auth, {
    url: up.cdnUrl,
    name: file.name || "attachment",
    mimeType: contentType,
    sizeBytes: data.length,
    width: size?.width ?? null,
    height: size?.height ?? null,
  });
}
