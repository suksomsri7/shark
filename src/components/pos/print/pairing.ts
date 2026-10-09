// pairing.ts — ข้อมูลจับคู่เครื่องพิมพ์ต่อ "รหัสเครื่อง" เก็บใน localStorage ของเบราว์เซอร์นี้ (POS P1.10 U · มติ CD2)
// 🔴 รหัสฮาร์ดแวร์ (USB vendor/product · Bluetooth device id) ไม่ส่งเซิร์ฟเวอร์ — printerConfig บนเซิร์ฟเวอร์มีแค่วิธีพิมพ์/กระดาษ/สวิตช์
// 🔴 client เท่านั้น · อ่าน/เขียนพังได้ (โหมดส่วนตัว/บล็อกที่เก็บ) ⇒ ครอบ try/catch เสมอ — พังแล้ว = ยังไม่จับคู่
import type { PrinterPairing } from "./types";

const KEY = (deviceCode: string) => `shark.pos.printer.${deviceCode}`;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** ข้อมูลจับคู่ที่เก็บไว้ (รูปไม่ถูก = null) */
export function readPairing(deviceCode: string | undefined): PrinterPairing | null {
  if (!deviceCode || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY(deviceCode));
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!isRecord(v) || typeof v.productName !== "string" || typeof v.pairedAt !== "string") return null;
    if (v.transport === "usb" && Number.isInteger(v.vendorId) && Number.isInteger(v.productId)) {
      return {
        transport: "usb",
        vendorId: v.vendorId as number,
        productId: v.productId as number,
        ...(typeof v.serialNumber === "string" && v.serialNumber ? { serialNumber: v.serialNumber } : {}),
        productName: v.productName,
        pairedAt: v.pairedAt,
      };
    }
    if (v.transport === "bluetooth" && typeof v.id === "string" && v.id) return { transport: "bluetooth", id: v.id, productName: v.productName, pairedAt: v.pairedAt };
    return null;
  } catch {
    return null;
  }
}

export function writePairing(deviceCode: string | undefined, p: PrinterPairing): boolean {
  if (!deviceCode || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(KEY(deviceCode), JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function clearPairing(deviceCode: string | undefined): void {
  if (!deviceCode || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(deviceCode));
  } catch {
    /* ไม่มีที่เก็บ = ไม่มีอะไรให้ลบ */
  }
}

/** จับคู่ตรงกับวิธีพิมพ์ของค่าตั้งไหม (usb ↔ escpos-usb · bluetooth ↔ escpos-bt) */
export function pairingMatches(p: PrinterPairing | null, mode: "browser" | "escpos-usb" | "escpos-bt"): boolean {
  return !!p && ((mode === "escpos-usb" && p.transport === "usb") || (mode === "escpos-bt" && p.transport === "bluetooth"));
}
