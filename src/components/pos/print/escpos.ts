// escpos.ts — ใบเสร็จ → ไบต์ ESC/POS พร้อมส่ง (POS P1.10 U · brief §4) · client เท่านั้น (raster ใช้ canvas)
//   encodeEscPos(payload, { paper, drawerKick, thaiText, cut: true, locale }) แล้ว (thaiText = raster) วาดทุกช่อง + แทนที่จากช่องสุดท้ายย้อนขึ้นมา
//   ภาษาไทยปริยาย = raster (มติ CD3 · ฟอนต์ในเครื่องพิมพ์ต่างยี่ห้อต่างกัน) · tis620 เมื่อค่าตั้งเครื่องเลือกเอง
import { encodeEscPos, type ReceiptPayload } from "@/lib/modules/pos/receipt-render";
import type { PosPrinterConfig } from "@/lib/modules/pos/device-shared";
import { rasterizeSlot } from "./canvas-raster";
import { spliceRaster } from "./raster";

export function buildEscPos(payload: ReceiptPayload, cfg: Pick<PosPrinterConfig, "paper" | "drawerKick" | "thaiText">, locale: "th" | "en", drawerKick = cfg.drawerKick): Uint8Array {
  const thaiText = cfg.thaiText === "tis620" ? "tis620" : "raster";
  const r = encodeEscPos(payload, { paper: cfg.paper, drawerKick, thaiText, cut: true, locale });
  if (thaiText !== "raster" || r.rasterSlots.length === 0) return r.bytes;
  return spliceRaster(r.bytes, r.rasterSlots, r.rasterSlots.map((s) => rasterizeSlot(s)));
}

/** เปิดลิ้นชักอย่างเดียว: ESC p 0 25 250 ล้วน (หน้ากะ · มติ CD4) */
export const DRAWER_PULSE: Uint8Array = Uint8Array.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
