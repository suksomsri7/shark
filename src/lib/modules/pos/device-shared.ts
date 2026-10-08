// device-shared.ts — ชนิดข้อมูล + ตัวตรวจบริสุทธิ์ของทะเบียนเครื่องขาย / ค่าตั้งเครื่องพิมพ์ (POS P1.10 · มติ R1–R3)
//
// 🔴 ไฟล์นี้ client import ได้ (หน้า 17B ของ P1.10U ใช้ parsePrinterConfig ตรวจฟอร์มก่อนส่ง) — ห้าม import prisma/server/next
// 🔴 ชนิดข้อมูลของ device-actions.ts อยู่ที่นี่ (ไฟล์ "use server" export ได้เฉพาะ async function)

/** รหัสเครื่อง = รหัสของ P1.9 (localStorage) — ชุดอักษรเดียวกับ shift.ts DEVICE_RE */
export const POS_DEVICE_CODE_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const POS_DEVICE_NAME_MAX = 60;
export const POS_REG_NO_MAX = 40;
/** เพดานเครื่อง ACTIVE ต่อสาขา เมื่อ Tenant.limits.posDevices ไม่ตั้ง/ผิดรูป (R2) */
export const POS_DEVICE_DEFAULT_LIMIT = 3;
/** online = เห็นล่าสุดภายใน 120 วินาที (R2) */
export const POS_DEVICE_ONLINE_MS = 120_000;
/** heartbeat เขียน lastSeenAt ไม่ถี่กว่าทุก 30 วินาที (R2) */
export const POS_DEVICE_HEARTBEAT_THROTTLE_MS = 30_000;

export type PosDeviceStatus = "ACTIVE" | "REVOKED";

// ═══════════ ค่าตั้งเครื่องพิมพ์ (R3) ═══════════
export type PosPrinterPaper = "58" | "80";
export type PosPrinterMode = "browser" | "escpos-usb" | "escpos-bt";
export type PosPrinterThaiText = "raster" | "tis620";
export type PosPrinterConfig = {
  paper: PosPrinterPaper;
  mode: PosPrinterMode;
  autoPrint: boolean;
  drawerKick: boolean;
  thaiText: PosPrinterThaiText;
  copies: 1 | 2;
};
export const POS_PRINTER_DEFAULTS: Readonly<PosPrinterConfig> = Object.freeze({
  paper: "80",
  mode: "browser",
  autoPrint: false,
  drawerKick: false,
  thaiText: "raster",
  copies: 1,
});

/** คำปฏิเสธของตัวตรวจบริสุทธิ์ — field = ชื่อฟิลด์ที่ผิด (หน้าตั้งค่าชี้ช่องได้) */
export type PosFieldRefusal = { ok: false; code: "VALIDATION"; message: string; field?: string };
export type ParsePrinterConfigResult = { ok: true; config: PosPrinterConfig } | PosFieldRefusal;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const bad = (field: string | undefined, message: string): PosFieldRefusal => (field ? { ok: false, code: "VALIDATION", message, field } : { ok: false, code: "VALIDATION", message });

const PAPERS: readonly string[] = ["58", "80"];
const MODES: readonly string[] = ["browser", "escpos-usb", "escpos-bt"];
const THAI_TEXT: readonly string[] = ["raster", "tis620"];

/**
 * ค่าตั้งเครื่องพิมพ์จาก JSON (R3) — undefined/null = ค่าปริยายทั้งหมด · คีย์ที่ไม่รู้จักถูกทิ้ง ·
 * ค่าผิดชนิด/นอกชุด = VALIDATION พร้อมชื่อฟิลด์ (ไม่เดา ไม่แปลง "58" ↔ 58)
 */
export function parsePrinterConfig(json: unknown): ParsePrinterConfigResult {
  if (json === undefined || json === null) return { ok: true, config: { ...POS_PRINTER_DEFAULTS } };
  if (!isRecord(json)) return bad(undefined, "ค่าตั้งเครื่องพิมพ์ต้องเป็นออบเจกต์");
  const out: PosPrinterConfig = { ...POS_PRINTER_DEFAULTS };
  const v = json;
  if (v.paper !== undefined) {
    if (typeof v.paper !== "string" || !PAPERS.includes(v.paper)) return bad("paper", "paper: ขนาดกระดาษต้องเป็น \"58\" หรือ \"80\"");
    out.paper = v.paper as PosPrinterPaper;
  }
  if (v.mode !== undefined) {
    if (typeof v.mode !== "string" || !MODES.includes(v.mode)) return bad("mode", "mode: วิธีพิมพ์ต้องเป็น browser · escpos-usb · escpos-bt");
    out.mode = v.mode as PosPrinterMode;
  }
  if (v.autoPrint !== undefined) {
    if (typeof v.autoPrint !== "boolean") return bad("autoPrint", "autoPrint: ต้องเป็นจริง/เท็จ");
    out.autoPrint = v.autoPrint;
  }
  if (v.drawerKick !== undefined) {
    if (typeof v.drawerKick !== "boolean") return bad("drawerKick", "drawerKick: ต้องเป็นจริง/เท็จ");
    out.drawerKick = v.drawerKick;
  }
  if (v.thaiText !== undefined) {
    if (typeof v.thaiText !== "string" || !THAI_TEXT.includes(v.thaiText)) return bad("thaiText", "thaiText: ต้องเป็น raster หรือ tis620");
    out.thaiText = v.thaiText as PosPrinterThaiText;
  }
  if (v.copies !== undefined) {
    if (v.copies !== 1 && v.copies !== 2) return bad("copies", "copies: จำนวนสำเนาต้องเป็น 1 หรือ 2");
    out.copies = v.copies;
  }
  return { ok: true, config: out };
}

// ═══════════ ทะเบียนเครื่อง (R2) — รูปผลลัพธ์ ═══════════
export type PosDeviceRefusalCode = "NOT_FOUND" | "PERMISSION_DENIED" | "VALIDATION" | "DEVICE_REVOKED" | "DEVICE_LIMIT" | "DEVICE_NOT_FOUND" | "INTERNAL";
export type PosDeviceRefusal = { ok: false; code: PosDeviceRefusalCode; message: string; field?: string };

export type PosDeviceView = {
  id: string;
  unitId: string;
  systemId: string;
  name: string;
  deviceCode: string;
  status: PosDeviceStatus;
  posRegNo: string | null;
  printerConfig: PosPrinterConfig;
  registeredByUserId: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};
export type PosDeviceListItem = PosDeviceView & {
  online: boolean;
  /** กะ OPEN ของเครื่องนี้ที่สาขานี้ (null = ไม่มี) */
  openShift: { id: string; shiftNo: number; openedAt: string } | null;
};

export type RegisterDeviceInput = { name: string; deviceCode: string };
export type UpdateDeviceInput = { id: string; name?: string; posRegNo?: string | null; printerConfig?: unknown };
export type PosDeviceResult = { ok: true; device: PosDeviceView } | PosDeviceRefusal;
export type ListDevicesResult = { ok: true; items: PosDeviceListItem[]; limit: number; activeCount: number } | PosDeviceRefusal;
/** heartbeat: device = แถวของรหัสนี้ที่สาขานี้ (null = ยังไม่ลงทะเบียน — ขายต่อได้ ไม่สร้างแถว) · หน้าขายใช้ printerConfig จากที่นี่ */
export type HeartbeatResult = { ok: true; registered: boolean; written: boolean; device: PosDeviceView | null } | PosDeviceRefusal;
