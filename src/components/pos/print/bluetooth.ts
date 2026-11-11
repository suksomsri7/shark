// bluetooth.ts — ส่งไบต์ ESC/POS ผ่าน Web Bluetooth (POS P1.10 U · brief §4) · Chrome บนคอมพิวเตอร์/Android (iOS Safari ไม่มี)
//   บริการ GATT ที่เครื่องพิมพ์ใบเสร็จใช้บ่อย: 000018f0-… (มาตรฐานจีนทั่วไป) · 49535343-fe7d-… (ISSC/Microchip) · ffe0 / ff00 (โมดูล BLE ราคาประหยัด)
//   จับคู่ = requestDevice (การกดของผู้ใช้) → เก็บ id ใน localStorage (มติ CD2) + จำออบเจกต์ในหน่วยความจำของแท็บนี้
//   พิมพ์ = ออบเจกต์ในหน่วยความจำ หรือ bluetooth.getDevices() (Chrome ที่เปิดสิทธิ์ถาวร) → gatt.connect → characteristic ที่เขียนได้ →
//   เขียนครั้งละ ≤ 20 ไบต์ (writeValueWithoutResponse เมื่อรองรับ)
// 🔴 ไม่โยน — คำปฏิเสธเป็นข้อมูล
import { BT_CHUNK, chunkBytes } from "./chunk";
import { refusePrint, type PrinterPairing, type PrintResult } from "./types";

type BtCharacteristic = {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithoutResponse?(v: Uint8Array): Promise<void>;
  writeValueWithResponse?(v: Uint8Array): Promise<void>;
  writeValue?(v: Uint8Array): Promise<void>;
};
type BtService = { getCharacteristics(): Promise<BtCharacteristic[]> };
type BtServer = { connected: boolean; connect(): Promise<BtServer>; getPrimaryService(uuid: string): Promise<BtService> };
type BtDevice = { id: string; name?: string | null; gatt?: BtServer };
type BtApi = {
  requestDevice(o: { acceptAllDevices?: boolean; filters?: { services: string[] }[]; optionalServices?: string[] }): Promise<BtDevice>;
  getDevices?(): Promise<BtDevice[]>;
};

export const BT_SERVICES: readonly string[] = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
];

const btApi = (): BtApi | null => {
  if (typeof navigator === "undefined") return null;
  const b = (navigator as unknown as { bluetooth?: BtApi }).bluetooth;
  return b && typeof b.requestDevice === "function" ? b : null;
};
export const bluetoothSupported = (): boolean => btApi() !== null;

/** ออบเจกต์เครื่องที่จับคู่ในแท็บนี้ (Web Bluetooth คืนออบเจกต์เดิมให้ใหม่ไม่ได้ถ้า getDevices ไม่เปิด) */
const cache = new Map<string, BtDevice>();
const errName = (e: unknown) => (e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "");

export async function pairBluetooth(): Promise<{ ok: true; pairing: PrinterPairing } | Extract<PrintResult, { ok: false }>> {
  const api = btApi();
  if (!api) return refusePrint("UNSUPPORTED", "bluetooth");
  try {
    const d = await api.requestDevice({ acceptAllDevices: true, optionalServices: [...BT_SERVICES] });
    cache.set(d.id, d);
    return { ok: true, pairing: { transport: "bluetooth", id: d.id, productName: d.name?.trim() || "Bluetooth", pairedAt: new Date().toISOString() } };
  } catch (e) {
    const n = errName(e);
    return refusePrint(n === "SecurityError" || n === "NotAllowedError" ? "PERMISSION" : "NO_DEVICE", "bluetooth");
  }
}

async function writableCharacteristic(server: BtServer): Promise<BtCharacteristic | null> {
  for (const uuid of BT_SERVICES) {
    try {
      const svc = await server.getPrimaryService(uuid);
      const chars = await svc.getCharacteristics();
      const c = chars.find((x) => x.properties.writeWithoutResponse) ?? chars.find((x) => x.properties.write);
      if (c) return c;
    } catch {
      /* เครื่องนี้ไม่มีบริการนี้ — ลองตัวถัดไป */
    }
  }
  return null;
}

export async function writeBluetooth(p: Extract<PrinterPairing, { transport: "bluetooth" }>, bytes: Uint8Array): Promise<PrintResult> {
  const api = btApi();
  if (!api) return refusePrint("UNSUPPORTED", "bluetooth");
  let dev = cache.get(p.id);
  if (!dev && typeof api.getDevices === "function") {
    try {
      dev = (await api.getDevices()).find((d) => d.id === p.id);
    } catch {
      dev = undefined;
    }
  }
  if (!dev?.gatt) return refusePrint("NO_DEVICE", "bluetooth");
  try {
    const server = dev.gatt.connected ? dev.gatt : await dev.gatt.connect();
    const ch = await writableCharacteristic(server);
    if (!ch) return refusePrint("NO_DEVICE", "bluetooth");
    const noResp = ch.properties.writeWithoutResponse && typeof ch.writeValueWithoutResponse === "function";
    for (const part of chunkBytes(bytes, BT_CHUNK)) {
      if (noResp) await ch.writeValueWithoutResponse!(part);
      else if (typeof ch.writeValueWithResponse === "function") await ch.writeValueWithResponse(part);
      else if (typeof ch.writeValue === "function") await ch.writeValue(part);
      else return refusePrint("WRITE_FAILED", "bluetooth");
    }
    return { ok: true, via: "bluetooth" };
  } catch (e) {
    const n = errName(e);
    return refusePrint(n === "SecurityError" || n === "NotAllowedError" ? "PERMISSION" : n === "NotFoundError" ? "NO_DEVICE" : "WRITE_FAILED", "bluetooth");
  }
}
