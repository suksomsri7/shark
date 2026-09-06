// logo.ts — ตรวจไฟล์โลโก้ก่อนอัปโหลด (pure ล้วน · ไม่แตะ DB/storage/เครือข่าย)
// สัญญา: ledger/BRANDING-RUN.md §สัญญา B2 · เรียกจาก
// src/app/app/settings/branding/actions.ts ก่อนส่งต่อ uploadFile(kind LOGO)
//
// 🔴 หลักการ: **ไม่เชื่อชื่อไฟล์/mime ที่เบราว์เซอร์อ้าง** — สนิฟ magic bytes ของเนื้อไฟล์จริงเสมอ
//    ไฟล์ที่เปลี่ยนนามสกุลจาก .exe เป็น .png (พร้อม type ปลอม `image/png`) ต้องโดนจับที่นี่
//    ก่อนจะมีสิทธิ์ไปแตะ storage — ไม่ใช่ปล่อยผ่านแล้วให้ CDN เก็บไฟล์อันตรายไว้

export type LogoExt = "png" | "jpg" | "svg" | "webp";
export type ValidateLogoResult = { ok: true; ext: LogoExt } | { ok: false; error: string };

/** จำกัดไว้ที่ 2MB ตามแบบ (ledger/DESIGN-BRANDING.md §4 · T5 ไม่มี sharp resize ฝั่งเซิร์ฟเวอร์) */
const MAX_BYTES = 2 * 1024 * 1024;

function hasMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPG_MAGIC = [0xff, 0xd8, 0xff] as const;
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46] as const; // "RIFF"

function isPng(bytes: Uint8Array): boolean {
  return hasMagic(bytes, PNG_MAGIC);
}
function isJpg(bytes: Uint8Array): boolean {
  return hasMagic(bytes, JPG_MAGIC);
}
function isWebp(bytes: Uint8Array): boolean {
  // RIFF <4 bytes size> WEBP — ไบต์ 8-11 ต้องเป็น "WEBP"
  return (
    hasMagic(bytes, RIFF_MAGIC) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  );
}

// ห้ามมีสคริปต์/เหตุการณ์/โปรโตคอลอันตรายฝังใน SVG (SVG เป็น XML ที่รันจาวาสคริปต์ได้ถ้าเปิดตรง ๆ)
const SVG_UNSAFE_PATTERNS = [/<script/i, /on[a-z]+\s*=/i, /javascript:/i];

/** SVG เป็นข้อความล้วน — สนิฟจากเนื้อหาที่ decode แล้วขึ้นต้นด้วย `<?xml` หรือ `<svg` เท่านั้น */
function sniffSvgText(bytes: Uint8Array): string | null {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
  } catch {
    return null;
  }
  return /^(<\?xml|<svg)/i.test(text) ? text : null;
}

/**
 * ตรวจไฟล์โลโก้ที่จะอัป — ห้าม throw ทุกทาง คืน union เสมอ
 * ไม่สนใจ `name`/`type` ที่ผู้เรียกอ้างมา (ชื่อไฟล์ไม่เชื่อ) — ตัดสินจาก `bytes` เท่านั้น
 */
export function validateLogoFile(file: {
  name: string;
  type: string;
  bytes: Uint8Array;
}): ValidateLogoResult {
  void file.name;
  void file.type;

  // เช็คขนาดก่อนเสมอ — ไฟล์ใหญ่เกินไม่ต้องเสียเวลาสนิฟ magic bytes ต่อ
  if (file.bytes.length > MAX_BYTES) {
    return { ok: false, error: "ไฟล์ใหญ่เกิน 2 MB — กรุณาย่อขนาดหรือเลือกไฟล์ใหม่" };
  }

  if (isPng(file.bytes)) return { ok: true, ext: "png" };
  if (isJpg(file.bytes)) return { ok: true, ext: "jpg" };
  if (isWebp(file.bytes)) return { ok: true, ext: "webp" };

  const svgText = sniffSvgText(file.bytes);
  if (svgText) {
    if (SVG_UNSAFE_PATTERNS.some((re) => re.test(svgText))) {
      return {
        ok: false,
        error:
          "ไฟล์ SVG นี้มีโค้ดที่ไม่ปลอดภัย (script/เหตุการณ์ onXXX/javascript:) — กรุณาใช้ไฟล์ PNG/JPG/WEBP แทน",
      };
    }
    return { ok: true, ext: "svg" };
  }

  return {
    ok: false,
    error: "ไฟล์นี้ไม่ใช่รูปภาพที่รองรับ — รองรับเฉพาะ PNG/JPG/WEBP/SVG เท่านั้น (ตรวจจากเนื้อไฟล์จริง ไม่ใช่ชื่อไฟล์)",
  };
}
