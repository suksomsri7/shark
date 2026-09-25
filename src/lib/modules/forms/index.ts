// forms/index.ts — facade ของโมดูลฟอร์มสำหรับโมดูลอื่น (fitness F2 · เส้น crm→forms อนุญาตแล้วใน ALLOWED_EDGES)
// CRM C1.8 ▸ ผู้เรียก: บริการผู้ติดต่อของ CRM (`crm/contacts.ts#leadFromBridge`) — ธง "คำตอบนี้เข้า CRM แล้ว" อ่าน/เขียนใน tx เดียวกับ lead ◂
export { submissionCrmContactId, linkSubmissionCrmContact } from "./service";
// CRM C2.6 ▸ ผู้เรียก: `crm/tracking.ts` (หน้า `/crm/settings/forms` — ระบบ CRM ปลายทาง · กฎมอบหมาย · คะแนน · กันสแปม · โค้ดฝัง)
//   🔴 ตัวตรวจ id ของร้าน (ระบบ/กฎเป็นของร้านนี้จริงไหม) อยู่ฝั่ง CRM ก่อนเรียก `updateCrmFormTarget` เสมอ ◂
export { listCrmFormTargets, getCrmFormTarget, updateCrmFormTarget, formEmbedCode, submitPublicFormGuarded } from "./service";
export type { CrmFormTarget, GuardedFormResult } from "./service";
// 🔴 (รีวิวรอบ 2 · B1) ชื่อช่องที่ด่านกันสแปมสงวนไว้ — ผู้เรียกฝั่ง CRM ต้องปฏิเสธ **ด้วย code ของตัวเอง**
//    (CONTRACT A: error ของ tracking ทุกใบมี code) จึงต้องรู้กติกาชื่อสงวนผ่าน facade นี้ ไม่ใช่ import ไฟล์ในโมดูล
export { isReservedFormFieldKey, FORM_RESERVED_KEY_MSG, FORM_RESERVED_PREFIX } from "./spam-guard";
// ◂ CRM C2.6
