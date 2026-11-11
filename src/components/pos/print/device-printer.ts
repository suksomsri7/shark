// device-printer.ts — ค่าตั้งเครื่องพิมพ์ของ "เบราว์เซอร์นี้" (POS P1.10 U) · client เท่านั้น
//   รหัสเครื่อง = getPosDeviceId() (localStorage · P1.9) → heartbeatAction (ตัวเดียวกับหน้าขาย) → printerConfig ของแถว PosDevice
//   ยังไม่ลงทะเบียน / ถูกเพิกถอน / เรียกไม่สำเร็จ = ค่าปริยาย (พิมพ์ผ่านเบราว์เซอร์ 80 มม.) — พิมพ์ได้เสมอ
import { heartbeatAction } from "@/lib/modules/pos/device-actions";
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import { POS_PRINTER_DEFAULTS, parsePrinterConfig, type PosDeviceView, type PosPrinterConfig } from "@/lib/modules/pos/device-shared";

export type ThisDevicePrinter = { deviceCode: string | undefined; device: PosDeviceView | null; config: PosPrinterConfig };

export async function thisDevicePrinter(systemId: string, unitId: string): Promise<ThisDevicePrinter> {
  const deviceCode = getPosDeviceId();
  let device: PosDeviceView | null = null;
  if (deviceCode) {
    const hb = await heartbeatAction({ systemId, unitId, deviceCode }).catch(() => null);
    if (hb?.ok && hb.device) device = hb.device;
  }
  const parsed = device && device.status === "ACTIVE" ? parsePrinterConfig(device.printerConfig) : null;
  return { deviceCode, device, config: parsed?.ok ? parsed.config : { ...POS_PRINTER_DEFAULTS } };
}
