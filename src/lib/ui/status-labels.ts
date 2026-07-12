// ป้ายสถานะภาษาไทยกลาง ต่อโดเมน — ใช้กับ <StatusChip map={...} />
// (บัญชีมี STATUS_LABEL/DOC_LABEL ใน account/service.ts อยู่แล้ว — ใช้ต่อ)

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  PENDING: "รอยืนยัน",
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

// ห้องแชทภายในองค์กร (Meeting channel kind)
export const CHANNEL_KIND_LABEL: Record<string, string> = {
  PUBLIC: "สาธารณะ",
  PRIVATE: "ส่วนตัว",
};

export const POS_SALE_STATUS_LABEL: Record<string, string> = {
  PAID: "ชำระแล้ว",
  VOIDED: "ยกเลิกแล้ว",
};

export const COUPON_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ใช้งาน",
  INACTIVE: "ปิด",
};

export const COUPON_TYPE_LABEL: Record<string, string> = {
  PERCENT: "ลดเป็น %",
  FIXED: "ลดเป็นบาท",
};

export const MEMBER_TIER_LABEL: Record<string, string> = {
  MEMBER: "สมาชิก",
  SILVER: "เงิน",
  GOLD: "ทอง",
  PLATINUM: "แพลทินัม",
};

// การแลกรางวัล (RewardRedemption.status)
export const REWARD_REDEMPTION_LABEL: Record<string, string> = {
  PENDING: "รอรับ",
  FULFILLED: "รับแล้ว",
  CANCELLED: "ยกเลิก",
};

// ─── ร้านอาหาร (Restaurant) ───
export const REST_ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "รอรับออเดอร์",
  CONFIRMED: "เข้าครัวแล้ว",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
};

export const KDS_ITEM_STATUS_LABEL: Record<string, string> = {
  NEW: "เข้าคิว",
  COOKING: "กำลังทำ",
  READY: "พร้อมเสิร์ฟ",
  SERVED: "เสิร์ฟแล้ว",
  CANCELLED: "ยกเลิก",
};

export const TABLE_SESSION_STATUS_LABEL: Record<string, string> = {
  OPEN: "เปิดอยู่",
  CLOSED: "ปิดแล้ว",
  MERGED: "ถูกรวมโต๊ะ",
  CANCELLED: "ยกเลิก",
};

export const TABLE_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ใช้งาน",
  INACTIVE: "ปิดชั่วคราว",
};

export const SERVICE_REQUEST_STATUS_LABEL: Record<string, string> = {
  PENDING: "รอรับเรื่อง",
  ACKED: "รับเรื่องแล้ว",
  DONE: "เสร็จแล้ว",
};

export const MENU_ITEM_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ขายอยู่",
  HIDDEN: "ซ่อน",
  ARCHIVED: "เก็บถาวร",
};

export const PICKUP_STATUS_LABEL: Record<string, string> = {
  AWAITING_CONFIRM: "รอยืนยัน",
  ACCEPTED: "รับออเดอร์",
  READY: "พร้อมรับ",
  PICKED_UP: "รับแล้ว",
  NO_SHOW: "ไม่มารับ",
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
