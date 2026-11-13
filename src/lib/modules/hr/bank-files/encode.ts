// HR H3.5 ▸ การเข้ารหัส + ช่องความกว้างคงที่ (pure) — brief R7
//   ASCII = 0x20–0x7E · TIS-620 = ASCII + U+0E01–U+0E3A / U+0E3F–U+0E5B → 0xA1–0xDA / 0xDF–0xFB (1 อักขระ = 1 ไบต์)
//   อักขระนอกชุด (รวม tab/CR/LF) ⇒ ผู้เรียกปฏิเสธ — ไม่แทนที่เงียบ ๆ · UTF-8 ไม่ใช้กับไฟล์ความกว้างคงที่ ◂

export type FixedEncoding = "ASCII" | "TIS620";

const isAscii = (c: number) => c >= 0x20 && c <= 0x7e;
const isThai = (c: number) => (c >= 0x0e01 && c <= 0x0e3a) || (c >= 0x0e3f && c <= 0x0e5b);

/** ทุกอักขระอยู่ในชุดของการเข้ารหัส */
export function encodable(s: string, enc: FixedEncoding): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (isAscii(c)) continue;
    if (enc === "TIS620" && isThai(c)) continue;
    return false;
  }
  return true;
}

/** ASCII พิมพ์ได้ล้วน (ชื่อบริษัท · รหัสบริษัท · ค่าคงที่) */
export const printableAscii = (s: string) => encodable(s, "ASCII");

/** สตริงที่ผ่าน encodable แล้ว → ไบต์ (ASCII ⊂ TIS-620 ⇒ ใช้ตัวเดียวกัน) */
export function singleByte(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i] = c < 0x80 ? c : c - 0x0e00 + 0xa0;
  }
  return out;
}

/** UTF-8 (ตัวเข้ารหัสมาตรฐานของ runtime — ไม่มีสถานะ) */
export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** ชิดซ้าย เติมช่องว่าง · ยาวเกิน = ตัด (ผู้เรียกเตือน NAME_CUT เอง) */
export const left = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
/** ตัวเลขชิดขวา เติม 0 (ผู้เรียกรับประกันว่าไม่เกินช่อง) */
export const zero = (v: number | string, n: number) => String(v).padStart(n, "0");
export const spaces = (n: number) => " ".repeat(n);

/** รวมไบต์หลายก้อน */
export function concat(parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// HR H3.5 fix r1 ▸ F3: ตัดชื่อไทยที่ขอบกลุ่มอักษร — ไม่ทิ้งพยัญชนะที่ถูกตัดสระ/วรรณยุกต์ และไม่ทิ้งสระ/วรรณยุกต์ลอย ◂
/** สระบน/ล่าง · วรรณยุกต์ · ไม้ไต่คู้ · การันต์ ฯลฯ (เกาะกับพยัญชนะตัวหน้า) + สระอำ (ำ ออกเสียงร่วมพยัญชนะตัวหน้า) */
export const isThaiMark = (c: number) => c === 0x0e31 || c === 0x0e33 || (c >= 0x0e34 && c <= 0x0e3a) || (c >= 0x0e47 && c <= 0x0e4e);
/** สระหน้า เ แ โ ใ ไ (เกาะกับพยัญชนะตัวหลัง) */
export const isThaiLeadVowel = (c: number) => c >= 0x0e40 && c <= 0x0e44;
/**
 * ตัด s ให้ยาวไม่เกิน n อักขระ ที่จุดเริ่มของกลุ่มอักษรสุดท้ายที่ครบ (พยัญชนะ + สระ/วรรณยุกต์ของมัน · สระหน้าไปกับพยัญชนะตัวหลัง) —
 * สั้นกว่า n = คืนตามเดิม · ผู้เรียกเติมช่องว่างเอง (left)
 */
export function cutAtCluster(s: string, n: number): string {
  if (s.length <= n) return s;
  let cut = n;
  // จุดตัดผ่ากลางกลุ่ม (ตัวถัดไปเป็นเครื่องหมายที่เกาะตัวหน้า) ⇒ ถอยไปที่ตัวฐานของกลุ่มนั้น แล้วตัดก่อนตัวฐาน
  if (isThaiMark(s.charCodeAt(cut))) {
    while (cut > 0 && isThaiMark(s.charCodeAt(cut - 1))) cut--;
    if (cut > 0) cut--;
  }
  // ตัวท้ายเป็นสระหน้า (พยัญชนะของมันอยู่นอกช่อง) ⇒ ตัดสระหน้าทิ้งด้วย
  while (cut > 0 && isThaiLeadVowel(s.charCodeAt(cut - 1))) cut--;
  // ไม่ทิ้งเครื่องหมายลอยที่ต้นสตริง (กรณีชื่อขึ้นต้นด้วยเครื่องหมาย)
  return s.slice(0, cut);
}

// HR H3.6 ▸ หนี้ H3.5 (ชื่อว่างหลังทำความสะอาด): มีอักขระฐานอย่างน้อย 1 ตัว — ไม่นับช่องว่าง · อักขระควบคุม/ทิศทาง/ไม่มีความกว้าง ·
//   เครื่องหมายกำกับ (สระบน/ล่าง วรรณยุกต์ ฯลฯ ของไทย + \p{M}) — ชื่อที่มีแต่สิ่งเหล่านี้ = ไม่มีชื่อ (ไฟล์โอน/แบบยื่นปฏิเสธ ไม่เขียนชื่อว่าง) ◂
const INVISIBLE = /[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/; // HR H3.6 ▸ fix r1 F5 ◂
export function hasBaseChar(s: string): boolean {
  for (const ch of s) {
    if (INVISIBLE.test(ch) || isThaiMark(ch.codePointAt(0)!) || /\p{M}/u.test(ch)) continue;
    return true;
  }
  return false;
}
