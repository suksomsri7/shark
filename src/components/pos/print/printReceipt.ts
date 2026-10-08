// printReceipt.ts — จุดเดียวที่จอ POS ใช้พิมพ์ใบเสร็จ (POS P1.10 U · brief §4)
//   printReceipt(payload, cfg, { copy?, locale, deviceCode? }) → { ok:true, via } | { ok:false, code, message } — ไม่โยนเด็ดขาด
//   วิธีพิมพ์ตาม printerConfig.mode: browser = iframe + print() · escpos-usb = WebUSB · escpos-bt = Web Bluetooth
//   ESC/POS: ข้อมูลจับคู่ของ "รหัสเครื่องนี้" (localStorage) ต้องตรงชนิด ไม่งั้น NO_DEVICE · เบราว์เซอร์ไม่มี API = UNSUPPORTED
//     (จอเสนอ "พิมพ์ผ่านระบบแทน" = เรียกซ้ำด้วย mode browser) · copies 2 = ใบที่ 2 ประทับ "สำเนา" ไม่เปิดลิ้นชักซ้ำ
//   copy:true = ประทับ "สำเนา" (ปกติจอใช้ค่าจาก payload.copy ที่เซิร์ฟเวอร์ตัดสิน — กฎ 30 นาที)
// 🔴 browser พิมพ์ใบเดียวเสมอ (หน้าต่างพิมพ์ของระบบเลือกจำนวนเองได้) · ลิ้นชักเปิดได้เฉพาะ ESC/POS (เบราว์เซอร์สั่งลิ้นชักไม่ได้)
import type { PosPrinterConfig } from "@/lib/modules/pos/device-shared";
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import type { ReceiptPayload } from "@/lib/modules/pos/receipt-render";
import { bluetoothSupported, writeBluetooth } from "./bluetooth";
import { printViaBrowser } from "./browser";
import { DRAWER_PULSE, buildEscPos } from "./escpos";
import { pairingMatches, readPairing } from "./pairing";
import { refusePrint, type PrintResult, type PrintTransport } from "./types";
import { usbSupported, writeUsb } from "./usb";

export type PrintOptions = { copy?: boolean; locale: "th" | "en"; deviceCode?: string };

export const transportOf = (mode: PosPrinterConfig["mode"]): PrintTransport => (mode === "escpos-usb" ? "usb" : mode === "escpos-bt" ? "bluetooth" : "browser");

/** เบราว์เซอร์นี้มี API ของวิธีพิมพ์นี้ไหม (browser = มีเสมอ) */
export function transportSupported(mode: PosPrinterConfig["mode"]): boolean {
  return mode === "escpos-usb" ? usbSupported() : mode === "escpos-bt" ? bluetoothSupported() : true;
}

/** จับคู่เครื่องพิมพ์ที่ตรงกับวิธีพิมพ์นี้ไว้แล้วในเบราว์เซอร์นี้ไหม (browser = ไม่ต้องจับคู่ → false) */
export function printerPaired(mode: PosPrinterConfig["mode"], deviceCode?: string): boolean {
  return mode !== "browser" && pairingMatches(readPairing(deviceCode ?? getPosDeviceId()), mode);
}

async function send(cfg: PosPrinterConfig, deviceCode: string | undefined, bytes: Uint8Array): Promise<PrintResult> {
  const via = transportOf(cfg.mode);
  const p = readPairing(deviceCode ?? getPosDeviceId());
  if (!pairingMatches(p, cfg.mode) || !p) return refusePrint("NO_DEVICE", via);
  return p.transport === "usb" ? writeUsb(p, bytes) : writeBluetooth(p, bytes);
}

export async function printReceipt(payload: ReceiptPayload, cfg: PosPrinterConfig, opts: PrintOptions): Promise<PrintResult> {
  const via = transportOf(cfg?.mode);
  try {
    const locale = opts?.locale === "en" ? "en" : "th";
    const first: ReceiptPayload = opts?.copy ? { ...payload, copy: true } : payload;
    if (via === "browser") return await printViaBrowser(first, cfg.paper, locale);
    if (!transportSupported(cfg.mode)) return refusePrint("UNSUPPORTED", via);
    let bytes: Uint8Array;
    try {
      bytes = buildEscPos(first, cfg, locale);
      if (cfg.copies === 2) {
        const second = buildEscPos({ ...payload, copy: true }, cfg, locale, false);
        const both = new Uint8Array(bytes.length + second.length);
        both.set(bytes, 0);
        both.set(second, bytes.length);
        bytes = both;
      }
    } catch {
      return refusePrint("UNSUPPORTED", via); // ไม่มี canvas วาดภาษาไทย
    }
    return await send(cfg, opts?.deviceCode, bytes);
  } catch {
    return refusePrint("WRITE_FAILED", via);
  }
}

/** เปิดลิ้นชักอย่างเดียวผ่านเครื่องพิมพ์ที่จับคู่ (หน้ากะ · มติ CD4 — ไม่ลง audit เพราะเป็นคำสั่งฮาร์ดแวร์) */
export async function kickDrawer(cfg: PosPrinterConfig, deviceCode?: string): Promise<PrintResult> {
  const via = transportOf(cfg?.mode);
  try {
    if (via === "browser") return refusePrint("UNSUPPORTED", via);
    if (!transportSupported(cfg.mode)) return refusePrint("UNSUPPORTED", via);
    return await send(cfg, deviceCode, DRAWER_PULSE);
  } catch {
    return refusePrint("WRITE_FAILED", via);
  }
}
