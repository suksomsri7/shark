// attachment-shared.ts — ส่วนบริสุทธิ์ของคลังเอกสาร V2 (WO 7.1) ที่ทั้งฝั่ง client (dropzone/modal) และ
// ฝั่ง server (attachment.ts) ต้องใช้ร่วมกัน — ไฟล์นี้ห้าม import prisma/next (ตามบทเรียน WO 1.8 §
// import-shared.ts / WO 6.2 journal-v2.ts): ไฟล์ "use client" import ตรงจาก attachment.ts ไม่ได้ เพราะ
// attachment.ts ลาก @/lib/core/db (prisma) เข้าฝั่งเบราว์เซอร์ทันที → build พัง module-not-found

export type AttachmentStatus = "UNLINKED" | "LINKED" | "NOT_ACCOUNTING" | "ARCHIVED";
/** ไฟล์เข้ามาทางไหน — `API` = แอปภายนอกแนบผ่าน REST `/api/v1/account/*` (WO C1) */
export type AttachmentSource = "UPLOAD" | "EMAIL" | "CHAT" | "APP" | "API";

/** เพดานไฟล์คลังเอกสาร — ใหญ่กว่าค่าเริ่มต้นระบบ (5MB) เพราะไฟล์บิล/ใบกำกับสแกนมาหนักกว่ารูปทั่วไป */
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

/** ชนิดไฟล์ที่คลังเอกสารรับ (pdf/jpg/png/heic/webp) — แคบกว่า ALLOWED_UPLOAD_TYPES ของ storage/service.ts
 *  โดยตั้งใจ (คลังเอกสารไม่รับ .docx/.xlsx — เอกสารบัญชีเป็นภาพ/PDF เท่านั้น) */
export const ATTACHMENT_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

/** ค่า `accept` ของ `<input type="file">` — บอกเบราว์เซอร์กรองเบื้องต้น (ไม่ใช่ด่านความปลอดภัย เซิร์ฟเวอร์ตรวจซ้ำเสมอ) */
export const ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp";

export function validateAttachmentUpload(
  mimeType: string,
  sizeBytes: number,
): { ok: true } | { ok: false; reason: string } {
  const m = mimeType.trim().toLowerCase();
  if (!ATTACHMENT_ALLOWED_MIME.has(m)) {
    return { ok: false, reason: "ชนิดไฟล์นี้เข้าคลังเอกสารไม่ได้ — รองรับเฉพาะ PDF/JPG/PNG/HEIC/WEBP" };
  }
  if (sizeBytes <= 0) return { ok: false, reason: "ไฟล์ว่างเปล่า — กรุณาเลือกไฟล์ใหม่" };
  if (sizeBytes > ATTACHMENT_MAX_BYTES) {
    return { ok: false, reason: `ไฟล์ใหญ่เกิน ${Math.round(ATTACHMENT_MAX_BYTES / 1024 / 1024)}MB` };
  }
  return { ok: true };
}

/** ตัวเลือกป้ายประเภท — ค่ากว้าง (REVENUE_ANY/EXPENSE_ANY/GENERAL) + รหัส AccountDocType ที่พบบ่อย
 *  (ตั้งชื่อ *_ANY กันชนกับรหัส AccountDocType จริง เช่น "EXPENSE" ที่หมายถึงบันทึกค่าใช้จ่ายโดยเฉพาะ) */
export const DOC_TYPE_HINT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "GENERAL", label: "เอกสารทั่วไป" },
  { value: "REVENUE_ANY", label: "รายรับ" },
  { value: "EXPENSE_ANY", label: "รายจ่าย" },
  { value: "EXPENSE", label: "รายจ่าย › บันทึกค่าใช้จ่าย" },
  { value: "PURCHASE_TAX_INVOICE", label: "รายจ่าย › ใบกำกับภาษีซื้อ" },
  { value: "PURCHASE", label: "รายจ่าย › บันทึกซื้อสินค้า" },
  { value: "INVOICE", label: "รายรับ › ใบแจ้งหนี้" },
  { value: "RECEIPT", label: "รายรับ › ใบเสร็จรับเงิน" },
];

export function humanFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── ช่วงวันที่อัปโหลด (แถบตัวกรอง f9) — พฤติกรรมเดียวกับ journalRangeOf ของ WO 6.2 (journal-v2.ts)
//    แต่คัดลอกเป็นก้อนบริสุทธิ์แยกไว้ที่นี่ เพราะไฟล์นั้นก็แตะ prisma เช่นกัน ห้าม import ข้ามไปฝั่ง client ──
export type DateRangeKey = "this_year" | "this_month" | "last_month" | "all" | "custom";
export const DOCUMENTS_RANGE_PRESETS: ReadonlyArray<{ key: DateRangeKey; label: string }> = [
  { key: "this_year", label: "ปีนี้ถึงวันนี้" },
  { key: "this_month", label: "เดือนนี้" },
  { key: "last_month", label: "เดือนก่อน" },
  { key: "all", label: "ทั้งหมด" },
  { key: "custom", label: "กำหนดเอง" },
];

function ymd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** ช่วงวันที่ (จันทร์–อาทิตย์เป็นชื่อ key) ตามโซนไทย — คืน null=ไม่จำกัดฝั่งนั้น ("all"/"custom" ไม่คำนวณเอง) */
export function documentsRangeOf(key: DateRangeKey, now: Date): { from: string | null; to: string | null } {
  const todayStr = ymd(now);
  if (key === "all") return { from: null, to: null };
  if (key === "this_year") return { from: `${todayStr.slice(0, 4)}-01-01`, to: todayStr };
  if (key === "this_month") return { from: `${todayStr.slice(0, 7)}-01`, to: todayStr };
  if (key === "last_month") {
    const [y, m] = todayStr.split("-").map(Number) as [number, number];
    const lm = m === 1 ? 12 : m - 1;
    const ly = m === 1 ? y - 1 : y;
    const lastDay = new Date(Date.UTC(ly, lm, 0)).getUTCDate();
    const mm = String(lm).padStart(2, "0");
    return { from: `${ly}-${mm}-01`, to: `${ly}-${mm}-${String(lastDay).padStart(2, "0")}` };
  }
  return { from: null, to: null }; // custom — ผู้เรียกอ่านจาก query เอง
}

// ─────────────────── ตรวจ "เนื้อไฟล์จริง" จากไบต์หัวไฟล์ (WO 9.2 ข้อ 8) ───────────────────
//
// 🔴 ทำไมต้องมี: ด่านเดิมเชื่อ `File.type` ที่ **เบราว์เซอร์ส่งมา** อย่างเดียว ⇒ ใครก็เปลี่ยนชื่อ
//    `payload.html` เป็น `bill.jpg` แล้วประกาศ `Content-Type: image/jpeg` ผ่านฉลุย
//    ไฟล์นั้นถูกเก็บเป็น `.jpg` บน CDN → ไม่มีใครเปิดดูได้ (คลังเอกสารเต็มไปด้วยขยะ)
//    และถ้าวันหนึ่งเราเพิ่มชนิดที่เบราว์เซอร์เรนเดอร์ได้ (svg/html) ช่องนี้จะกลายเป็น XSS ทันที
//    ⇒ ตัดสินจาก **ไบต์จริง** ไม่ใช่คำประกาศ
//
// ตารางลายเซ็น (magic bytes) เท่าที่ allowlist ของคลังเอกสารรับ:
//   PDF  `%PDF`           · JPEG `FF D8 FF`        · PNG `89 50 4E 47 0D 0A 1A 0A`
//   WEBP `RIFF….WEBP`     · HEIC/HEIF `….ftyp<brand>` (heic/heix/hevc/heim/heis/hevm/mif1/msf1)

const MAGIC_ERR =
  "เนื้อไฟล์ไม่ตรงกับชนิดที่แจ้ง — ไฟล์นี้เข้าคลังเอกสารไม่ได้ (รองรับเฉพาะ PDF/JPG/PNG/HEIC/WEBP จริง ๆ)";

function ascii(b: Uint8Array, at: number, len: number): string {
  let s = "";
  for (let i = at; i < at + len && i < b.length; i++) s += String.fromCharCode(b[i]!);
  return s;
}

/** ชนิดจริงจากไบต์หัวไฟล์ — `null` = ไม่ใช่ชนิดที่คลังเอกสารรับ */
export function sniffAttachmentMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (ascii(bytes, 0, 4) === "%PDF") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  )
    return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (["heic", "heix", "hevc", "heim", "heis", "hevm", "mif1", "msf1"].includes(brand))
      return brand === "mif1" || brand === "msf1" ? "image/heif" : "image/heic";
  }
  return null;
}

/**
 * ด่านอัปโหลดฉบับเต็ม (ฝั่งเซิร์ฟเวอร์เท่านั้น — ต้องมีไบต์จริงในมือ)
 * ลำดับ: ชนิดที่แจ้ง → ขนาด → **เนื้อไฟล์จริง** · คืน `mimeType` ที่ควรใช้เก็บ = ชนิดที่ sniff ได้
 * 🔴 HEIC/HEIF สลับกันได้ (ทั้งคู่อยู่ใน allowlist) — ยึดตามไบต์ ไม่ใช่ตามที่เบราว์เซอร์แจ้ง
 */
export function validateAttachmentBytes(
  declaredMime: string,
  bytes: Uint8Array,
): { ok: true; mimeType: string } | { ok: false; reason: string } {
  const pre = validateAttachmentUpload(declaredMime, bytes.length);
  if (!pre.ok) return pre;
  const real = sniffAttachmentMime(bytes);
  if (!real) return { ok: false, reason: MAGIC_ERR };
  if (!ATTACHMENT_ALLOWED_MIME.has(real)) return { ok: false, reason: MAGIC_ERR };
  return { ok: true, mimeType: real };
}
