// chat/index.ts — facade เดียวที่โมดูลอื่นได้รับอนุญาตให้ import (fitness F2)
//
// 🔴 ห่อบาง ๆ ล้วน: ห้ามมีตรรกะธุรกิจที่นี่ (ตรรกะอยู่ที่ `service.ts` / `push.ts`)
// 🔴 ผู้เรียกภายในโมดูลแชทเอง (หน้า/action/webhook) import ไฟล์ย่อยตรงได้ตามปกติ
// ผู้เรียกจริงวันนี้: การตลาด (M3.2 แคมเปญ — ส่ง LINE ถึงสมาชิกที่ผูกไลน์ไว้)
//
// ⚠️ ไฟล์เดิมของโมดูลอื่นที่ import `chat/service` ตรงอยู่แล้ว (booking/kanban bridges) ยังใช้ได้
//    เหมือนเดิม — ไฟล์นี้ **เพิ่มทางเข้าใหม่** ไม่ได้ปิดทางเก่า

export type { PushToContactInput, PushToContactResult } from "./push";
export {
  /** ส่งข้อความถึงลูกค้าคนหนึ่งผ่านช่องทางแชท โดยที่ร้านเป็นฝ่ายเริ่ม (ไม่ต้องมีห้องแชทมาก่อน) */
  pushToContact,
} from "./push";

// ── ทางเชื่อมกับ "ตัวตนกลาง" (Party) — ใบ CRM v2 · C0.3 ส่วน B ──
// ผู้เรียก: CRM (หน้า 360 องศาของผู้ติดต่อ/บริษัท · การส่งข้อความหาลูกค้าจากดีล)
export type {
  ChatPartyCtx,
  SendLineToPartyInput,
  SendLineToPartyResult,
  ConversationByPartyRow,
} from "./party-bridge";
export {
  /** ส่งไลน์ถึง Party รายหนึ่ง (ไม่มีตรรกะความยินยอม — ผู้เรียกตัดสิน) · ไม่ throw · เหตุผลปฏิเสธแยกกรณี */
  sendLineToParty,
  /**
   * ห้องแชทของ Party รายหนึ่ง **ทั่วทั้งร้าน** (ทุกระบบแชท) โดยยังเคารพด่าน unit ของกล่องแชท
   * 🔴 `opts.unitAccess` **บังคับ** — ผู้เรียก CRM ส่ง `auth.active.unitAccess as string[]` ของคนที่เปิดหน้า
   *    (ลืมส่ง = คอมไพล์ไม่ผ่าน · ไม่ใช่ "เห็นทั้งร้านโดยไม่มีด่านสาขา" เงียบ ๆ)
   */
  listConversationsByParty,
} from "./party-bridge";
