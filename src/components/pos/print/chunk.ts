// chunk.ts — ตัดไบต์เป็นก้อนสำหรับส่งเครื่องพิมพ์ (POS P1.10 U · brief §4) · บริสุทธิ์ (qc-pos-p1.10u-print ตรวจ)
//   WebUSB transferOut ≤ 16 KB ต่อครั้ง · Web Bluetooth เขียนได้ ≤ 20 ไบต์ต่อครั้ง (ATT MTU ปริยาย 23 − 3 · เว็บอ่าน MTU จริงไม่ได้)

export const USB_CHUNK = 16 * 1024;
export const BT_CHUNK = 20;

/** ก้อนต่อเนื่อง ขนาด ≤ size · ต่อกลับ = เดิมทุกไบต์ · size < 1 ถือเป็น 1 */
export function chunkBytes(bytes: Uint8Array, size: number): Uint8Array[] {
  const n = Math.max(1, Math.floor(size));
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += n) out.push(bytes.subarray(i, Math.min(i + n, bytes.length)));
  return out;
}
