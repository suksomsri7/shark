// link-labels.ts — ป้ายภาษาไทย + ไอคอนของ "ชนิดการเชื่อม" 20 ชนิด (K3.1 · §9.1)
//
// 🔴 ทำไมแยกไฟล์: ตารางนี้ถูกอ่านจากทั้ง 3 ฝั่ง — ตัวแปลผลฝั่ง server (`link-resolvers.ts` ที่แตะ prisma)
//    · ประโยคประวัติกิจกรรม (`activity-text.ts` ที่ฝั่ง client ก็เรียก) · คอมโพเนนต์หลังการ์ด
//    ⇒ ต้องเป็นไฟล์ที่ **ไม่แตะ prisma/DB เลย** ไม่งั้น bundle ของ client จะลากทั้งโมดูลไปด้วย
//    (แพตเทิร์นเดียวกับ `access.ts` ที่จงใจให้บริสุทธิ์เพื่อให้ `KanbanTabs.tsx` เรียกได้)
// 🔴 คำไทยตามพิมพ์เขียว §9.1/§12.3 — ห้ามใช้คำอื่นสลับไปมาในจอคนละที่

import type { KanbanLinkKind } from "./types";

export const LINK_TYPE_META: Record<KanbanLinkKind, { label: string; icon: string }> = {
  PARTY: { label: "ผู้ติดต่อ (CRM / Party)", icon: "users" },
  CRM_CONTACT: { label: "ผู้ติดต่อในระบบขาย (CRM)", icon: "users" },
  CHAT_CONVERSATION: { label: "แชทลูกค้า", icon: "chat" },
  ACCOUNT_DOC: { label: "เอกสารในระบบบัญชี", icon: "doc" },
  APPROVAL_REQUEST: { label: "คำขออนุมัติ", icon: "check" },
  HR_LEAVE: { label: "ใบลา", icon: "cal" },
  HR_EMPLOYEE: { label: "พนักงาน", icon: "users" },
  APPOINTMENT: { label: "นัดหมาย", icon: "cal" },
  HOTEL_RESERVATION: { label: "การจองห้องพัก", icon: "home" },
  RENTAL_BOOKING: { label: "รายการเช่า", icon: "box" },
  SCHOOL_CLASS: { label: "คาบเรียน", icon: "book" },
  INV_ITEM: { label: "สินค้า/อุปกรณ์ในคลัง", icon: "box" },
  QUEUE_TICKET: { label: "บัตรคิว", icon: "list" },
  TICKET_EVENT: { label: "อีเวนต์", icon: "flag" },
  FORM_SUBMISSION: { label: "คำตอบจากฟอร์ม", icon: "list" },
  KB_ARTICLE: { label: "บทความคลังความรู้", icon: "book" },
  POS_SALE: { label: "บิลขายหน้าร้าน", icon: "shop" },
  SHOP_ORDER: { label: "คำสั่งซื้อร้านออนไลน์", icon: "shop" },
  RESTAURANT_ORDER: { label: "ออร์เดอร์ร้านอาหาร", icon: "list" },
  URL: { label: "ลิงก์ภายนอก", icon: "link" },
};

/** ป้ายชนิดจากค่าดิบ (ประวัติกิจกรรมเก็บ `data.linkType` เป็นสตริง) — ชนิดที่ไม่รู้จัก = คำกลาง ๆ */
export function linkTypeTh(kind: unknown): string {
  const meta = typeof kind === "string" ? LINK_TYPE_META[kind as KanbanLinkKind] : undefined;
  return meta?.label ?? "ข้อมูลในระบบ";
}
