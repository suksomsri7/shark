// POST /api/mobile/inbox/attachments — อัปไฟล์แนบของแชทลูกค้าจากแอป (Bearer · ≤ 10 MB · R-K13 · R-S1.21e)
//
// ห่อชุดเดียวกับ `api/v1/chat/attachments` (`uploadFile` kind ATTACHMENT · `CHAT_ATTACHMENT_MAX_BYTES` · ชนิดไฟล์ตามทะเบียนของ storage)
//   ต่างกันแค่ด่าน: v1 = คีย์ API ของร้าน · ที่นี่ = Bearer + x-tenant-id + สิทธิ์ตอบลูกค้า
// คืน `{ url, name, mimeType, size, width?, height?, durationMs? }` → แอปเอา url ไปแนบใน `…/reply` (ไฟล์กับข้อความแยกคำขอ = retry ข้อความได้ไม่ต้องอัปซ้ำ)
// SEC S3a.1-S2 ▸ R-Z19 (L4 MAJOR-2): ไม่รับ svg (สคริปต์ในไฟล์) · ตรวจ magic bytes ของไฟล์จริงแบบ support/upload — รูป · PDF · เสียง ·
//   เอกสาร Office (zip/OLE) · ชนิดที่ประกาศต้องตระกูลเดียวกับที่ตรวจได้ · contentType ที่เก็บ = ชนิดที่ตรวจได้ (ไม่เชื่อหัวของผู้ส่ง) ⇒ ไม่ผ่าน 415 ◂
import { imageSize } from "@/lib/storage/image-size";
import { CHAT_ATTACHMENT_MAX_BYTES, uploadFile } from "@/lib/storage/service";
import { fail, gate, limited, REPLY, withErrors } from "../_shared";

const OFFICE_ZIP = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const AUDIO_MP4 = new Set(["audio/mp4", "audio/x-m4a"]);
const AUDIO_WAV = new Set(["audio/wav", "audio/x-wav"]);

/** ชนิดจริงจาก magic bytes (null = ไม่รับ) — ตัดสินร่วมกับชนิดที่ประกาศ (บางตระกูลแยกด้วย magic ไม่ได้ เช่น docx/xlsx · m4a/x-m4a) */
function sniff(b: Uint8Array, declared: string): string | null {
  const at = (i: number, ...xs: number[]) => b.length >= i + xs.length && xs.every((x, k) => b[i + k] === x);
  const ascii = (i: number, n: number) => (b.length >= i + n ? String.fromCharCode(...b.slice(i, i + n)) : "");
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return AUDIO_WAV.has(declared) ? declared : "audio/wav";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    if (["heic", "heix", "heim", "heis", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heif"].includes(brand)) return "image/heif";
    if (AUDIO_MP4.has(declared)) return declared; // m4a (M4A /isom/mp42 …) — คอนเทนเนอร์ MP4 ตัดสินด้วยชนิดที่ประกาศว่าเป็นเสียง
    return null;
  }
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return declared === "audio/webm" ? "audio/webm" : null; // EBML (webm)
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 3) === "ID3" || at(0, 0xff, 0xfb) || at(0, 0xff, 0xf3) || at(0, 0xff, 0xf2)) return declared === "audio/aac" ? null : "audio/mpeg";
  if (at(0, 0xff, 0xf1) || at(0, 0xff, 0xf9)) return "audio/aac"; // ADTS
  if (at(0, 0x50, 0x4b, 0x03, 0x04)) return OFFICE_ZIP.has(declared) ? declared : null; // docx/xlsx (zip)
  if (at(0, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return declared === "application/msword" ? declared : null; // doc (OLE)
  return null;
}
/** ตระกูลเดียวกัน (ประกาศ heic ได้ heif · ประกาศ x-wav ได้ wav ฯลฯ) */
const family = (t: string) => (t === "image/heif" ? "image/heic" : t === "audio/x-wav" ? "audio/wav" : t === "audio/x-m4a" ? "audio/mp4" : t);

async function POST_(req: Request) {
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
  const declaredType = (file.type || "application/octet-stream").split(";")[0]!.trim().toLowerCase();
  const real = declaredType === "image/svg+xml" ? null : sniff(data, declaredType);
  if (!real || family(real) !== family(declaredType)) {
    return fail(415, "unsupported", "แนบได้เฉพาะรูป (JPG · PNG · WEBP · HEIC · GIF) · PDF · ไฟล์เสียง · เอกสาร Word/Excel — ไฟล์นี้ไม่ตรงกับชนิดที่รองรับ");
  }
  const contentType = real;
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

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("inbox/attachments POST", POST_);
