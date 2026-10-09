// types.ts — ชนิดข้อมูลของโมดูลพิมพ์ใบเสร็จฝั่ง client (POS P1.10 U · brief §4)
// 🔴 บริสุทธิ์ · คำปฏิเสธเป็นข้อมูลเสมอ (printReceipt ไม่โยน) · ข้อความบนจอ = คีย์ pos.print.errors.<code> ตามภาษา
// POS P1.18U ▸ แก้รอบ 1 F5: message ของคำปฏิเสธ = รหัสเอง (ใช้ใน log เท่านั้น · ไม่มีจอไหนแสดง) — ไม่ดึงไฟล์ข้อความภาษาไทยของ POS ทั้งไฟล์เข้า client chunk ◂

export type PrintTransport = "usb" | "bluetooth" | "browser";
export type PrintRefusalCode = "NO_DEVICE" | "PERMISSION" | "UNSUPPORTED" | "WRITE_FAILED";
export type PrintOk = { ok: true; via: PrintTransport };
export type PrintRefusal = { ok: false; code: PrintRefusalCode; message: string; via: PrintTransport };
export type PrintResult = PrintOk | PrintRefusal;

export const refusePrint = (code: PrintRefusalCode, via: PrintTransport): PrintRefusal => ({ ok: false, code, message: code, via });

/** คีย์ข้อความใต้ pos.print ของคำปฏิเสธ */
export const printErrorKey = (code: PrintRefusalCode): string => `errors.${code}`;

/** ข้อมูลจับคู่เครื่องพิมพ์ที่เก็บในเบราว์เซอร์ (มติ CD2 — ไม่ส่งเซิร์ฟเวอร์) */
export type PrinterPairing =
  | { transport: "usb"; vendorId: number; productId: number; serialNumber?: string; productName: string; pairedAt: string }
  | { transport: "bluetooth"; id: string; productName: string; pairedAt: string };
