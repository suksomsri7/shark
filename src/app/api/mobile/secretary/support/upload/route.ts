// POST /api/mobile/secretary/support/upload (multipart `file`) — รูปแนบเรื่องช่วยเหลือ (R-S1.14c)
//   ต้องมี Content-Length (ไม่มี = 411) · เพดาน 4 MB (คำขอของ Vercel ≤ 4.5 MB · แอป S2.15 บีบอัดก่อนส่ง) · ภาพเท่านั้น:
//   jpeg / png / webp / heic / heif / gif — ตรวจทั้งชนิดที่ประกาศ **และ** magic bytes ของไฟล์จริง (ไม่ตรง = 415) · ไม่รับ svg (สคริปต์ในภาพได้)
//   เก็บด้วย `uploadFile` (ที่เก็บไฟล์กลาง · kind ATTACHMENT) → คืน `{url, name, kind:"image"}` ไปแนบใน cases/reply
import { uploadFile } from "@/lib/storage/service";
import { fail, gate, ok, withRateLimit } from "../../_shared";

const MAX_BYTES = 4 * 1024 * 1024;
const MULTIPART_SLACK = 64 * 1024;
type Img = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif" | "image/gif";
const ALLOWED: readonly Img[] = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];

/** ชนิดจาก magic bytes (null = ไม่ใช่ภาพที่รับ) — HEIC/HEIF = กล่อง `ftyp` ที่ brand เป็นตระกูล heic/mif1 */
function sniff(b: Uint8Array): Img | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x);
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (b.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "image/gif";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (b.length >= 12 && ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    if (["heic", "heix", "heim", "heis", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heif"].includes(brand)) return "image/heif";
  }
  return null;
}

export async function POST(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "support-upload", 10);
  if (rl) return rl;
  const lenHdr = req.headers.get("content-length");
  if (lenHdr === null || lenHdr.trim() === "" || !Number.isFinite(Number(lenHdr))) return fail(411, "length_required", "ต้องส่งขนาดไฟล์ (Content-Length) มาด้วย");
  if (Number(lenHdr) > MAX_BYTES + MULTIPART_SLACK) return fail(413, "too_large", "รูปใหญ่เกิน 4 MB — ลดขนาดรูปก่อนส่ง");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad_request", "ต้องส่งเป็น multipart/form-data พร้อมรูปในช่อง file");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "bad_request", "ไม่พบรูปในช่อง file");
  if (file.size > MAX_BYTES) return fail(413, "too_large", "รูปใหญ่เกิน 4 MB — ลดขนาดรูปก่อนส่ง");
  const declared = (file.type || "").split(";")[0]!.trim().toLowerCase();
  const data = new Uint8Array(await file.arrayBuffer());
  const real = sniff(data);
  // ประกาศ heic แต่ brand เป็น mif1 (หรือกลับกัน) = ตระกูลเดียวกัน ยอมรับ
  const sameFamily = (x: string, y: string) => x === y || ((x === "image/heic" || x === "image/heif") && (y === "image/heic" || y === "image/heif"));
  if (!real || !(ALLOWED as readonly string[]).includes(declared) || !sameFamily(declared, real)) {
    return fail(415, "unsupported", "แนบได้เฉพาะรูป JPG · PNG · WEBP · HEIC · GIF");
  }
  const up = await uploadFile({ tenantId: a.c.tenantId }, { kind: "ATTACHMENT", filename: file.name || "image", contentType: real, data, maxBytes: MAX_BYTES });
  if (!up.ok) return fail(415, "unsupported", up.error);
  return ok({ url: up.cdnUrl, name: file.name || "image", kind: "image", mimeType: real, size: file.size });
}
