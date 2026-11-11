// guard-keys.ts — คีย์สิทธิ์ของโมดูลแชทที่ด่านต่าง ๆ ใช้ร่วมกัน (pure · ไม่มี import · re-export จาก `guard.ts`)
//
// 🔴 แยกจาก guard.ts เพราะ guard.ts import `@/lib/core/context` (session/env) — ไฟล์ที่รันนอก Next
//    (routing.ts · งานรายนาที · ข้อสอบ) ต้องใช้คีย์ได้โดยไม่ลากกราฟนั้นมา · ผู้เรียกในแอปเว็บ/route import จาก guard.ts
// ค่า = คีย์ในทะเบียนกลาง `src/lib/core/permissions.ts` (โมดูล chat) — ห้ามพิมพ์สตริงเหล่านี้ซ้ำที่อื่น (R-K13 · R-S1.21i)

/** อ่านกล่องแชท */
export const CHAT_READ_ACTION = "chat.conversation.read";
/** ตอบลูกค้า (R-K14 — ใช้ตัดสิน "ตอบได้" ของผู้ดูแล/ผู้ช่วย/เวรด้วย) */
export const CHAT_REPLY_ACTION = "chat.message.send";
/** มอบหมาย/เปลี่ยนผู้ดูแลห้อง */
export const CHAT_ASSIGN_ACTION = "chat.conversation.assign";
/** ปิด/เปิดห้อง */
export const CHAT_SET_STATUS_ACTION = "chat.conversation.setStatus";
/** ทำเครื่องหมายว่าอ่านแล้ว */
export const CHAT_MARK_READ_ACTION = "chat.conversation.markRead";
/** ผูกผู้ติดต่อเข้ากับสมาชิก */
export const CHAT_CUSTOMER_LINK_ACTION = "chat.customer.link";
