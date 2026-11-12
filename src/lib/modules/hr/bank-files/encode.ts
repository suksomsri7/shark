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
