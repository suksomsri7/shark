// raster.ts — ภาพบรรทัดภาษาไทยสำหรับ ESC/POS (POS P1.10 U · brief §4 · มติ CD3) · บริสุทธิ์ ไม่แตะ DOM (qc-pos-p1.10u-print ตรวจ)
//   encodeEscPos (receipt-render.ts) เว้นที่ 8 ไบต์ `GS v 0 0 0 0 0 0` ต่อบรรทัดไทย + rasterSlots[{offset,…}] — offset นับในไบต์ "ก่อนแทนที่"
//   ⇒ แทนที่จากช่องสุดท้ายย้อนขึ้นมา (ช่องก่อนหน้ายังอยู่ที่ offset เดิม) · ภาพจริง = GS v 0 m xL xH yL yH + บิตแมป 1 บิต/จุด (1 = ดำ)
//   ความกว้างภาพ = คอลัมน์ × 12 จุด (203 dpi: 80 มม. 48 คอลัมน์ = 576 จุด · 58 มม. 32 = 384) · ตัวใหญ่ (GS ! 0x11) = cols ครึ่งหนึ่ง × 24 จุด
import type { EscPosRasterSlot } from "@/lib/modules/pos/receipt-render";

export const DOTS_PER_COL = 12;
export const RASTER_PLACEHOLDER: readonly number[] = [0x1d, 0x76, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00];

/** ความกว้างภาพของช่อง (จุด · หาร 8 ลงตัวเสมอ) */
export function slotWidthDots(slot: Pick<EscPosRasterSlot, "cols" | "big">): number {
  const w = slot.cols * DOTS_PER_COL * (slot.big ? 2 : 1);
  return Math.ceil(w / 8) * 8;
}

/**
 * RGBA (แบบ ImageData.data) → บิตแมป 1 บิต/จุด เรียงแถว MSB ก่อน · จุดดำ = ไม่โปร่งใส (alpha ≥ 128) และความสว่าง < threshold
 * แถวเติมให้ครบไบต์ (bytesPerRow = ceil(width/8))
 */
export function packMono(rgba: ArrayLike<number>, width: number, height: number, threshold = 160): Uint8Array {
  const bpr = Math.ceil(width / 8);
  const out = new Uint8Array(bpr * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3] ?? 0;
      const lum = 0.299 * (rgba[i] ?? 255) + 0.587 * (rgba[i + 1] ?? 255) + 0.114 * (rgba[i + 2] ?? 255);
      if (a >= 128 && lum < threshold) out[y * bpr + (x >> 3)]! |= 0x80 >> (x & 7);
    }
  }
  return out;
}

/** คำสั่งภาพ GS v 0 (m = 0 ปกติ) — ความกว้างเป็นไบต์ต่อแถว · สูงเป็นจุด · ข้อมูลต้องยาว bpr × height */
export function gsv0(widthDots: number, height: number, packed: Uint8Array): Uint8Array {
  const bpr = Math.ceil(widthDots / 8);
  if (packed.length !== bpr * height) throw new Error(`raster: data ${packed.length} ≠ ${bpr}×${height}`);
  const out = new Uint8Array(8 + packed.length);
  out.set([0x1d, 0x76, 0x30, 0x00, bpr & 0xff, (bpr >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff]);
  out.set(packed, 8);
  return out;
}

/**
 * แทนที่ช่อง raster ด้วยภาพจริง — จากช่องสุดท้ายย้อนขึ้นมา (offset เป็นของไบต์ก่อนแทนที่) · images[i] คู่กับ slots[i]
 * ตรวจว่าที่ offset เป็นที่ว่าง 8 ไบต์จริง (ไม่ใช่ = โยน — ผู้เรียกแปลงเป็น WRITE_FAILED) · ความยาวผล = เดิม − 8n + Σ ภาพ
 */
export function spliceRaster(bytes: Uint8Array, slots: readonly Pick<EscPosRasterSlot, "offset" | "length">[], images: readonly Uint8Array[]): Uint8Array {
  if (slots.length !== images.length) throw new Error("raster: slots/images length mismatch");
  let cur = bytes;
  for (let i = slots.length - 1; i >= 0; i--) {
    const s = slots[i]!;
    const img = images[i]!;
    for (let k = 0; k < s.length; k++) if (cur[s.offset + k] !== RASTER_PLACEHOLDER[k]) throw new Error(`raster: no placeholder at ${s.offset}`);
    const next = new Uint8Array(cur.length - s.length + img.length);
    next.set(cur.subarray(0, s.offset), 0);
    next.set(img, s.offset);
    next.set(cur.subarray(s.offset + s.length), s.offset + img.length);
    cur = next;
  }
  return cur;
}
