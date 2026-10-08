// types.ts — ชนิดข้อมูลของโมดูลพิมพ์ใบเสร็จฝั่ง client (POS P1.10 U · brief §4)
// 🔴 บริสุทธิ์ · คำปฏิเสธเป็นข้อมูลเสมอ (printReceipt ไม่โยน) · ข้อความไทยของแต่ละรหัสอยู่ที่ PRINT_MESSAGES_TH + คีย์ pos.print.errors.<code>

export type PrintTransport = "usb" | "bluetooth" | "browser";
export type PrintRefusalCode = "NO_DEVICE" | "PERMISSION" | "UNSUPPORTED" | "WRITE_FAILED";
export type PrintOk = { ok: true; via: PrintTransport };
export type PrintRefusal = { ok: false; code: PrintRefusalCode; message: string; via: PrintTransport };
export type PrintResult = PrintOk | PrintRefusal;

/** ข้อความไทยของคำปฏิเสธ (จอใช้คีย์ pos.print.errors.<code> ตามภาษา — ข้อความนี้สำหรับ log/ผู้เรียกที่ไม่มี i18n) */
export const PRINT_MESSAGES_TH: Readonly<Record<PrintRefusalCode, string>> = {
  NO_DEVICE: "ยังไม่ได้จับคู่เครื่องพิมพ์ หรือหาเครื่องพิมพ์ไม่พบ — จับคู่ใหม่ที่หน้าตั้งค่าเครื่อง",
  PERMISSION: "เบราว์เซอร์ไม่อนุญาตให้ใช้เครื่องพิมพ์ — อนุญาตแล้วลองอีกครั้ง",
  UNSUPPORTED: "เบราว์เซอร์นี้พิมพ์ตรงไม่ได้ ใช้พิมพ์ผ่านระบบแทน",
  WRITE_FAILED: "ส่งข้อมูลไปเครื่องพิมพ์ไม่สำเร็จ — ตรวจสายหรือการเชื่อมต่อแล้วลองอีกครั้ง",
};

export const refusePrint = (code: PrintRefusalCode, via: PrintTransport): PrintRefusal => ({ ok: false, code, message: PRINT_MESSAGES_TH[code], via });

/** คีย์ข้อความใต้ pos.print ของคำปฏิเสธ */
export const printErrorKey = (code: PrintRefusalCode): string => `errors.${code}`;

/** ข้อมูลจับคู่เครื่องพิมพ์ที่เก็บในเบราว์เซอร์ (มติ CD2 — ไม่ส่งเซิร์ฟเวอร์) */
export type PrinterPairing =
  | { transport: "usb"; vendorId: number; productId: number; serialNumber?: string; productName: string; pairedAt: string }
  | { transport: "bluetooth"; id: string; productName: string; pairedAt: string };
