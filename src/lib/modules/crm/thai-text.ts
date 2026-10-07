// thai-text.ts — ข้อความภาษาไทยที่ต้องเทียบ/ค้น/เรียงให้ตรงกับที่คนไทยเห็น (CRM C5.4-E ▸ L6-m3) — ฟังก์ชันล้วน ใช้ได้ทั้งเซิร์ฟเวอร์และหน้าจอ
//
// สระอำ พิมพ์ได้สองแบบที่ตาเห็นเหมือนกัน: "ำ" ตัวเดียว (U+0E33) กับ "ํ" + "า" (U+0E4D U+0E32 — บางแป้น/ข้อความที่คัดลอกมา)
//   วรรณยุกต์อยู่ได้ทั้งก่อนและหลัง "ํ" (น + ้ + ํ + า · น + ํ + ้ + า) ⇒ เดิมค้น "น้ำ" ไม่เจอชื่อที่เก็บแบบแยก
// การเรียงชื่อ: collation ของฐานข้อมูลเป็น C ⇒ ชื่อขึ้นต้นด้วย เ แ โ ใ ไ ไปอยู่หลัง ฮ · เรียงด้วย ICU ภาษาไทยแทน (ชื่อ collation ด้านล่าง)

/** collation ICU ภาษาไทยของ Postgres (มีมากับ Postgres ที่สร้างด้วย ICU — Neon ทุก branch) · ใช้ใน ORDER BY ของชื่อเท่านั้น */
export const THAI_COLLATION = "th-TH-x-icu";

const TONE = "[่-๋]";
const SPLIT_AM_TONE_FIRST = new RegExp(`(${TONE})ํา`, "g"); // ้ + ํ + า
const SPLIT_AM_TONE_AFTER = new RegExp(`ํ(${TONE})า`, "g"); // ํ + ้ + า
const SPLIT_AM = /ํา/g; // ํ + า

/** รูปมาตรฐานสำหรับเก็บ/ค้น: NFC + สระอำแบบแยก → "ำ" ตัวเดียว (วรรณยุกต์อยู่ก่อนสระอำ แบบที่แป้นไทยพิมพ์) */
export function normalizeThaiText(s: string): string {
  return s.normalize("NFC").replace(SPLIT_AM_TONE_FIRST, "$1ำ").replace(SPLIT_AM_TONE_AFTER, "$1ำ").replace(SPLIT_AM, "ำ");
}

/** คำค้นทุกรูปที่ต้องลอง: รูปมาตรฐาน + รูป "ํ + า" (ชื่อเก่าที่เก็บแบบแยกก่อน C5.4-E) — ไม่ซ้ำกัน */
export function thaiSearchVariants(q: string): string[] {
  const norm = normalizeThaiText(q);
  const split = norm.replace(/ำ/g, "ํา");
  return [...new Set([q, norm, split])];
}
