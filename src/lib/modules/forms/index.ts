// forms/index.ts — facade ของโมดูลฟอร์มสำหรับโมดูลอื่น (fitness F2 · เส้น crm→forms อนุญาตแล้วใน ALLOWED_EDGES)
// CRM C1.8 ▸ ผู้เรียก: บริการผู้ติดต่อของ CRM (`crm/contacts.ts#leadFromBridge`) — ธง "คำตอบนี้เข้า CRM แล้ว" อ่าน/เขียนใน tx เดียวกับ lead ◂
export { submissionCrmContactId, linkSubmissionCrmContact } from "./service";
