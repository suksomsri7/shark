// ป้ายสถานะภาษาไทยกลาง ต่อโดเมน — ใช้กับ <StatusChip map={...} />
// (บัญชีมี STATUS_LABEL/DOC_LABEL ใน account/service.ts อยู่แล้ว — ใช้ต่อ)

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  BOOKED: "จองแล้ว",
  CONFIRMED: "ยืนยันแล้ว",
  ARRIVED: "มาถึงแล้ว",
  DONE: "เสร็จแล้ว",
  NO_SHOW: "ไม่มา",
  CANCELLED: "ยกเลิก",
};

export const QUEUE_STATUS_LABEL: Record<string, string> = {
  WAITING: "รอเรียก",
  CALLED: "กำลังเรียก",
  SERVING: "กำลังให้บริการ",
  DONE: "เสร็จแล้ว",
  SKIPPED: "ข้าม",
};

export const HOTEL_RESV_STATUS_LABEL: Record<string, string> = {
  BOOKED: "จองแล้ว",
  CHECKED_IN: "เช็คอินแล้ว",
  CHECKED_OUT: "เช็คเอาท์แล้ว",
  CANCELLED: "ยกเลิก",
};

export const HOTEL_ROOM_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "ว่าง",
  OCCUPIED: "มีผู้พัก",
  CLEANING: "ทำความสะอาด",
  OOO: "ปิดปรับปรุง",
};

export const TICKET_STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  PUBLISHED: "เปิดขาย",
  ENDED: "จบแล้ว",
  CANCELLED: "ยกเลิก",
  PENDING: "รอชำระ",
  PAID: "ชำระแล้ว",
  VALID: "ใช้ได้",
  CHECKED_IN: "เช็คอินแล้ว",
  VOID: "ยกเลิก",
};

export const PAY_CHANNEL_LABEL: Record<string, string> = {
  CASH: "เงินสด",
  TRANSFER: "โอน",
  PROMPTPAY: "พร้อมเพย์",
  CARD: "บัตร",
  E_WALLET: "อีวอลเล็ต",
  CHEQUE: "เช็ค",
  DEPOSIT_APPLY: "หักมัดจำ",
  CREDIT_APPLY: "หักเครดิต",
  OTHER: "อื่นๆ",
};
