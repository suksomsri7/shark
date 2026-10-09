// usb.ts — ส่งไบต์ ESC/POS ผ่าน WebUSB (POS P1.10 U · brief §4) · Chrome บนคอมพิวเตอร์/Android เท่านั้น (iOS Safari ไม่มี WebUSB)
//   จับคู่ = navigator.usb.requestDevice (ต้องมาจากการกดของผู้ใช้) → เก็บ vendorId/productId/serial ใน localStorage (มติ CD2)
//   พิมพ์ = getDevices() หาเครื่องที่เคยอนุญาต (ไม่ถามซ้ำ) → open → configuration 1 → claim interface ที่มี bulk OUT → transferOut ≤ 16 KB
// 🔴 ไม่โยน — คำปฏิเสธเป็นข้อมูล (UNSUPPORTED · NO_DEVICE · PERMISSION · WRITE_FAILED)
import { USB_CHUNK, chunkBytes } from "./chunk";
import { refusePrint, type PrinterPairing, type PrintResult } from "./types";

// ── ชนิดข้อมูล WebUSB ขั้นต่ำที่ใช้ (lib.dom ของ TypeScript ไม่มี WebUSB) ──
type UsbEndpoint = { endpointNumber: number; direction: "in" | "out"; type: "bulk" | "interrupt" | "isochronous" };
type UsbAlternate = { alternateSetting: number; interfaceClass: number; endpoints: UsbEndpoint[] };
type UsbInterface = { interfaceNumber: number; alternate: UsbAlternate | null; alternates: UsbAlternate[]; claimed: boolean };
type UsbConfiguration = { configurationValue: number; interfaces: UsbInterface[] };
type UsbDevice = {
  vendorId: number;
  productId: number;
  serialNumber?: string | null;
  productName?: string | null;
  manufacturerName?: string | null;
  opened: boolean;
  configuration: UsbConfiguration | null;
  open(): Promise<void>;
  selectConfiguration(v: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  selectAlternateInterface(n: number, alt: number): Promise<void>;
  transferOut(ep: number, data: Uint8Array): Promise<{ status: "ok" | "stall" | "babble"; bytesWritten: number }>;
};
type UsbApi = { getDevices(): Promise<UsbDevice[]>; requestDevice(o: { filters: Record<string, number>[] }): Promise<UsbDevice> };

const usbApi = (): UsbApi | null => {
  if (typeof navigator === "undefined") return null;
  const u = (navigator as unknown as { usb?: UsbApi }).usb;
  return u && typeof u.getDevices === "function" && typeof u.requestDevice === "function" ? u : null;
};
export const usbSupported = (): boolean => usbApi() !== null;

/** ตัวกรองตอนเลือกเครื่อง: คลาสเครื่องพิมพ์ (7) + ผู้ผลิตเครื่องพิมพ์ใบเสร็จที่พบบ่อย (หลายรุ่นประกาศคลาส 0xFF ของผู้ผลิตเอง) */
const PRINTER_FILTERS: Record<string, number>[] = [
  { classCode: 7 },
  { vendorId: 0x04b8 }, // Epson
  { vendorId: 0x0519 }, // Star
  { vendorId: 0x0483 }, // STMicro (Xprinter / เครื่องจีนหลายรุ่น)
  { vendorId: 0x0416 }, // Winbond (POS-58 / POS-80)
  { vendorId: 0x28e9 }, // GigaDevice (Xprinter รุ่นใหม่)
  { vendorId: 0x1fc9 }, // NXP
  { vendorId: 0x0fe6 }, // ICS (เครื่องจีนราคาประหยัด)
  { vendorId: 0x1504 }, // Bixolon
  { vendorId: 0x154f }, // SNBC
  { vendorId: 0x0dd4 }, // Custom
];

const errName = (e: unknown) => (e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "");

/** จับคู่ (ต้องเรียกจากการกดของผู้ใช้) — ผู้ใช้ปิดหน้าต่างเลือก = NO_DEVICE */
export async function pairUsb(): Promise<{ ok: true; pairing: PrinterPairing } | Extract<PrintResult, { ok: false }>> {
  const api = usbApi();
  if (!api) return refusePrint("UNSUPPORTED", "usb");
  try {
    const d = await api.requestDevice({ filters: PRINTER_FILTERS });
    const name = [d.manufacturerName, d.productName].filter((x) => typeof x === "string" && x.trim()).join(" ").trim() || `USB ${d.vendorId.toString(16)}:${d.productId.toString(16)}`;
    return {
      ok: true,
      pairing: { transport: "usb", vendorId: d.vendorId, productId: d.productId, ...(d.serialNumber ? { serialNumber: d.serialNumber } : {}), productName: name, pairedAt: new Date().toISOString() },
    };
  } catch (e) {
    const n = errName(e);
    return refusePrint(n === "SecurityError" || n === "NotAllowedError" ? "PERMISSION" : "NO_DEVICE", "usb");
  }
}

/** หา bulk OUT ของ interface คลาสเครื่องพิมพ์ก่อน · ไม่มี = interface แรกที่มี bulk OUT */
function outEndpoint(cfg: UsbConfiguration): { iface: UsbInterface; alt: UsbAlternate; ep: UsbEndpoint } | null {
  const cands: { iface: UsbInterface; alt: UsbAlternate; ep: UsbEndpoint }[] = [];
  for (const iface of cfg.interfaces) {
    for (const alt of iface.alternates) {
      const ep = alt.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
      if (ep) cands.push({ iface, alt, ep });
    }
  }
  return cands.find((c) => c.alt.interfaceClass === 7) ?? cands[0] ?? null;
}

/** ส่งไบต์ไปเครื่องที่จับคู่ไว้ */
export async function writeUsb(p: Extract<PrinterPairing, { transport: "usb" }>, bytes: Uint8Array): Promise<PrintResult> {
  const api = usbApi();
  if (!api) return refusePrint("UNSUPPORTED", "usb");
  let dev: UsbDevice | undefined;
  try {
    const list = await api.getDevices();
    dev = list.find((d) => d.vendorId === p.vendorId && d.productId === p.productId && (!p.serialNumber || d.serialNumber === p.serialNumber)) ?? list.find((d) => d.vendorId === p.vendorId && d.productId === p.productId);
  } catch (e) {
    return refusePrint(errName(e) === "SecurityError" ? "PERMISSION" : "NO_DEVICE", "usb");
  }
  if (!dev) return refusePrint("NO_DEVICE", "usb");
  try {
    if (!dev.opened) await dev.open();
    if (dev.configuration === null) await dev.selectConfiguration(1);
    const cfg = dev.configuration as UsbConfiguration | null;
    const hit = cfg ? outEndpoint(cfg) : null;
    if (!hit) return refusePrint("NO_DEVICE", "usb");
    if (!hit.iface.claimed) await dev.claimInterface(hit.iface.interfaceNumber);
    if (hit.alt.alternateSetting !== 0) await dev.selectAlternateInterface(hit.iface.interfaceNumber, hit.alt.alternateSetting);
    for (const part of chunkBytes(bytes, USB_CHUNK)) {
      const r = await dev.transferOut(hit.ep.endpointNumber, part);
      if (r.status !== "ok") return refusePrint("WRITE_FAILED", "usb");
    }
    return { ok: true, via: "usb" };
  } catch (e) {
    const n = errName(e);
    return refusePrint(n === "SecurityError" || n === "NotAllowedError" ? "PERMISSION" : n === "NotFoundError" ? "NO_DEVICE" : "WRITE_FAILED", "usb");
  }
}
