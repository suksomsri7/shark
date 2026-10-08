// escpos.ts — ใบเสร็จ → ไบต์ ESC/POS พร้อมส่ง (POS P1.10 U · brief §4) · client เท่านั้น (raster ใช้ canvas)
//   encodeEscPos(payload, { paper, drawerKick, thaiText, cut: true, locale }) แล้ว (thaiText = raster) วาดทุกช่อง + แทนที่จากช่องสุดท้ายย้อนขึ้นมา
//   ภาษาไทยปริยาย = raster (มติ CD3 · ฟอนต์ในเครื่องพิมพ์ต่างยี่ห้อต่างกัน) · tis620 เมื่อค่าตั้งเครื่องเลือกเอง
import { encodeEscPos, type ReceiptPayload } from "@/lib/modules/pos/receipt-render";
import type { PosPrinterConfig } from "@/lib/modules/pos/device-shared";
import { rasterizeSlot } from "./canvas-raster";
import { spliceRaster } from "./raster";

/**
 * แก้รอบ 1 F1: ลิ้นชักเปิดเฉพาะเมื่อผู้เรียกขอ (kickDrawer — PayDone ใบต้นฉบับใบแรกของบิล) และใบนี้ไม่ใช่สำเนา ·
 * ค่าตั้งเครื่อง drawerKick อย่างเดียวไม่พอ (พิมพ์ซ้ำ/สำเนา/ตัวอย่าง/ทดสอบ ต้องไม่เปิดลิ้นชัก)
 */
export const drawerKickFor = (payload: Pick<ReceiptPayload, "copy">, cfg: Pick<PosPrinterConfig, "drawerKick">, kickDrawer: boolean): boolean => kickDrawer === true && cfg.drawerKick === true && payload.copy !== true;

/** ใบเสร็จ → ไบต์ ESC/POS · kickDrawer ปริยาย false (ดู drawerKickFor) */
export function buildEscPos(payload: ReceiptPayload, cfg: Pick<PosPrinterConfig, "paper" | "drawerKick" | "thaiText">, locale: "th" | "en", kickDrawer = false): Uint8Array {
  const thaiText = cfg.thaiText === "tis620" ? "tis620" : "raster";
  const r = encodeEscPos(payload, { paper: cfg.paper, drawerKick: drawerKickFor(payload, cfg, kickDrawer), thaiText, cut: true, locale });
  if (thaiText !== "raster" || r.rasterSlots.length === 0) return r.bytes;
  return spliceRaster(r.bytes, r.rasterSlots, r.rasterSlots.map((s) => rasterizeSlot(s)));
}

/** เปิดลิ้นชักอย่างเดียว: ESC p 0 25 250 ล้วน (หน้ากะ · มติ CD4) */
export const DRAWER_PULSE: Uint8Array = Uint8Array.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);
