// sniff.ts — ตรวจชนิดไฟล์แนบของแชทจาก magic bytes (SEC S3a.1-S2 · R-Z19 · R-Z34) — ใช้ร่วม `api/mobile/inbox/attachments` + `api/v1/chat/attachments`
//   รับ: รูป jpeg/png/webp/gif/heic/heif · pdf · เสียง webm/ogg/m4a/aac/mp3/wav · docx/xlsx (zip) · doc (OLE) · **ไม่รับ svg / txt / อื่น ๆ**
//   ชนิดที่ประกาศต้องตระกูลเดียวกับที่ตรวจได้ · คืน = ชนิดที่ตรวจได้ (ผู้เรียกเก็บ/คืนค่านี้ ไม่เชื่อหัวของผู้ส่ง) · pure

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

/** ชนิดจริงของไฟล์แนบ (ตระกูลเดียวกับที่ประกาศ) — null = ไม่รับ (ผู้เรียกตอบ 415) */
export function sniffedAttachmentType(data: Uint8Array, declaredRaw: string): string | null {
  const declared = String(declaredRaw ?? "").split(";")[0]!.trim().toLowerCase();
  if (declared === "image/svg+xml") return null;
  const real = sniff(data, declared);
  return real && family(real) === family(declared) ? real : null;
}
