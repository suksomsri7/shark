// pre-bill-print.ts — POS P2.5U พิมพ์ "ใบรายการ" (pre-bill) ที่เครื่องนี้ (มติ 9) — ทางพิมพ์เดียวกับใบเสร็จ P1.10 / ใบครัว P2.6U (kds-print.ts)
//   เครื่องตั้งเป็นเครื่องพิมพ์ใบเสร็จ (escpos-usb / escpos-bt) และจับคู่ไว้แล้วในเบราว์เซอร์นี้ → renderPreBillEscPos (ช่อง raster วาดด้วย canvas เดียวกัน) →
//     writeUsb / writeBluetooth (ข้อมูลจับคู่ของรหัสเครื่องนี้ · pairing.ts) · ไม่มีเครื่องพิมพ์/ไม่จับคู่/โหมด browser → renderPreBillHtml → printHtml (หน้าต่างพิมพ์ของระบบ)
//   🔴 client เท่านั้น · ไม่โยน · ไม่เรียกเซิร์ฟเวอร์ (payload มาจาก registerTablePreBillAction ของผู้เรียก — 1 ครั้งต่อการพิมพ์ 1 ครั้ง · S บันทึก audit ต่อครั้ง)
import type { PosPrinterConfig } from "@/lib/modules/pos/device-shared";
import { renderPreBillEscPos, renderPreBillHtml, type PreBillPayload } from "@/lib/modules/pos/pre-bill-render";
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import { printHtml } from "@/components/pos/print/browser";
import { pairingMatches, readPairing } from "@/components/pos/print/pairing";
import { writeUsb } from "@/components/pos/print/usb";
import { writeBluetooth } from "@/components/pos/print/bluetooth";
import { spliceRaster } from "@/components/pos/print/raster";
import { CanvasUnavailableError, rasterizeSlot } from "@/components/pos/print/canvas-raster";
import { transportOf, transportSupported } from "@/components/pos/print/printReceipt";
import { refusePrint, type PrintResult } from "@/components/pos/print/types";

/** เครื่องนี้มีเครื่องพิมพ์ใบเสร็จที่ใช้ได้ (ESC/POS + API ของเบราว์เซอร์ + จับคู่แล้ว) ไหม — ไม่มี = หน้าต่างพิมพ์ของเบราว์เซอร์ */
export function preBillDevicePrinter(cfg: Pick<PosPrinterConfig, "mode"> | null, deviceCode?: string): boolean {
  if (!cfg || cfg.mode === "browser" || !transportSupported(cfg.mode)) return false;
  return pairingMatches(readPairing(deviceCode ?? getPosDeviceId()), cfg.mode);
}

/** พิมพ์ใบรายการหนึ่งใบ (ไม่โยน) — เครื่องพิมพ์ของเครื่องเมื่อพร้อม ไม่งั้นเบราว์เซอร์ */
export async function printPreBill(payload: PreBillPayload, cfg: Pick<PosPrinterConfig, "mode" | "paper" | "thaiText"> | null, locale: "th" | "en", deviceCode?: string): Promise<PrintResult> {
  const paper = cfg?.paper ?? "80";
  try {
    if (!cfg || !preBillDevicePrinter(cfg, deviceCode)) return await printHtml(renderPreBillHtml(payload, { paper, locale }));
    const via = transportOf(cfg.mode);
    const p = readPairing(deviceCode ?? getPosDeviceId());
    if (!p || !pairingMatches(p, cfg.mode)) return refusePrint("NO_DEVICE", via);
    let bytes: Uint8Array;
    try {
      const r = renderPreBillEscPos(payload, { paper, thaiText: cfg.thaiText === "tis620" ? "tis620" : "raster", cut: true, locale });
      bytes = cfg.thaiText !== "tis620" && r.rasterSlots.length ? spliceRaster(r.bytes, r.rasterSlots, r.rasterSlots.map((x) => rasterizeSlot(x))) : r.bytes;
    } catch (e) {
      return refusePrint(e instanceof CanvasUnavailableError ? "UNSUPPORTED" : "WRITE_FAILED", via);
    }
    return p.transport === "usb" ? await writeUsb(p, bytes) : await writeBluetooth(p, bytes);
  } catch {
    return refusePrint("WRITE_FAILED", transportOf(cfg?.mode ?? "browser"));
  }
}
