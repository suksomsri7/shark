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

// CRM C1.8 ▸ ผูก ChatContact → Party (ครั้งเดียว · มี audit) — ผู้เรียก: สะพาน CRM `platform/crm-bridges/chat.ts` ◂
export { linkChatContactParty } from "./party-bridge";

// POS P3.7 ▸ รอยต่อข้อความอัตโนมัติจากจุดขาย (ใบเสร็จ · สถานะออเดอร์ · ลิงก์จ่าย · บอทตามกฎ) — ผู้เรียก: composition root `src/lib/pos-chat-bridges.ts`
//   (POS ไม่ import แชท) · ส่งไม่เกินครั้งเดียวต่อคีย์ · ข้อความขึ้นในห้อง (senderUserId null) · ไม่มีตรรกะความยินยอม (ผู้เรียกตัดสิน)
export type { NotifyCustomerDeps, NotifyCustomerInput, NotifyCustomerResult, PosBotContext, PosNotifyCode, PosNotifyTarget, PosSeamSend } from "./pos-seam";
export { botContext, notifyCustomer, setBotPaused } from "./pos-seam";
// ◂ POS P3.7

// SVC R0.7 ▸ LINE ของร้าน: Flex · rich menu · รหัสผูกครั้งเดียว — ผู้เรียก: `platform/postback-routes.ts` · `platform/notify-customer.ts` · โดเมน (B.9/D.9)
//   ไม่ throw · ผู้รับต้องเป็นผู้ติดต่อของร้านนี้บน OA ที่ระบุ · ไม่มีตรรกะความยินยอม (ผู้เรียก/ประตู notifyCustomer ตัดสิน)
export type {
  FlexFail,
  FlexFailCode,
  FlexContents,
  LineMessage,
  PushFlexToPartyInput,
  PushFlexResult,
  ReplyFlexInput,
  ReplyFlexResult,
} from "./line-flex";
export {
  /** push Flex ถึง Party (OA ที่ระบุเท่านั้น · ไม่ระบุ = OA ของผู้ติดต่อล่าสุด) */
  pushFlexToParty,
  /** reply Flex ด้วย replyToken ของ event */
  replyFlex,
  /** ส่งข้อความ (text/flex) ถึงผู้ติดต่อคนหนึ่งบน OA ที่ระบุ — ประตูส่งข้อความบริการ (notifyCustomer) ใช้ */
  pushLineMessagesToContact,
  /** ตอบกลับด้วยข้อความ (text/flex) ด้วย replyToken — ตัวแจก postback/รหัสผูกใช้ตอบ */
  replyLineMessages,
} from "./line-flex";
export type { RichMenuArea, RichMenuSpec, SyncRichMenuResult } from "./line-richmenu";
export { syncRichMenu } from "./line-richmenu";
export type { IssueLinkCodeInput, IssueLinkCodeResult, ConsumeLinkCodeInput, ConsumeLinkCodeResult, LinkPurpose } from "./link-code";
export { LINK_CODE_ALPHABET, issueLinkCode, consumeLinkCode, normalizeLinkCode } from "./link-code";
// ◂ SVC R0.7
export { fetchLineMessageContent } from "./line-content"; // SVC D.9 ▸ รูปที่ลูกค้าส่งในแชท LINE (แนบสลิปอัตโนมัติ · มติผู้คุม Q1) ◂
