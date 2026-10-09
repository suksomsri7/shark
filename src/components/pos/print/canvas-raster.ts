// canvas-raster.ts — วาดบรรทัดภาษาไทยของช่อง raster ด้วย canvas แล้วแปลงเป็นคำสั่ง GS v 0 (POS P1.10 U · มติ CD3) · client เท่านั้น
//   ฟอนต์ = Sarabun / ฟอนต์ไทยของระบบ · ปกติ 24 จุด (ช่องตัวอักษร 12×24 ของเครื่องพิมพ์ความร้อน) · ตัวใหญ่ 48 · สูง = 1.45 เท่า (สระบน/ล่าง)
//   ข้อความยาวเกินภาพ = บีบแนวนอนให้พอดี (ไม่ตัดคำ — encodeEscPos ตัดบรรทัดตามคอลัมน์มาแล้ว)
import type { EscPosRasterSlot } from "@/lib/modules/pos/receipt-render";
import { gsv0, packMono, slotWidthDots } from "./raster";

/** ไม่มี canvas วาดภาษาไทย (เบราว์เซอร์/สภาพแวดล้อมไม่รองรับ) — printReceipt แปลงเป็น UNSUPPORTED · ความผิดพลาดอื่นของการประกอบไบต์ = WRITE_FAILED */
export class CanvasUnavailableError extends Error {}

const FONT = "Sarabun, 'Noto Sans Thai', 'Leelawadee UI', Tahoma, sans-serif";

/** ภาพของช่องเดียว → ไบต์ GS v 0 · ไม่มี canvas = โยน CanvasUnavailableError (ผู้เรียกแปลงเป็น UNSUPPORTED) */
export function rasterizeSlot(slot: EscPosRasterSlot): Uint8Array {
  if (typeof document === "undefined") throw new CanvasUnavailableError("canvas unavailable");
  const width = slotWidthDots(slot);
  const px = slot.big ? 48 : 24;
  const height = Math.ceil(px * 1.45);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new CanvasUnavailableError("canvas 2d unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "middle";
  ctx.font = `${slot.bold ? "700" : "400"} ${px}px ${FONT}`;
  const textW = ctx.measureText(slot.text).width;
  const scale = textW > width ? width / textW : 1;
  const drawW = textW * scale;
  const x = slot.align === "center" ? (width - drawW) / 2 : slot.align === "right" ? width - drawW : 0;
  ctx.save();
  ctx.translate(x, height / 2);
  ctx.scale(scale, 1);
  ctx.fillText(slot.text, 0, 0);
  ctx.restore();
  const data = ctx.getImageData(0, 0, width, height).data;
  return gsv0(width, height, packMono(data, width, height));
}
