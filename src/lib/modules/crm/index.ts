// crm/index.ts — facade เดียวที่โค้ดนอกโมดูล CRM ได้รับอนุญาตให้ import (fitness F2.3 บังคับ)
// ใบงาน C0.2 — **re-export ล้วน ๆ ไม่มีตรรกะ** (ห้ามครอบ wrapper/ค่า default/ธงฟีเจอร์ที่นี่):
// ของที่เปิดออกไป = สิ่งที่โค้ดนอกโมดูลใช้อยู่จริงวันนี้เท่านั้น (ไล่จากโค้ด ไม่ใช่จากเอกสาร)
//   • createContact              ← src/lib/modules/forms/service.ts (lead จากฟอร์ม) · src/lib/ai/proposals.ts (crm_create_lead)
//   • listPartyIdsWithContact    ← src/lib/modules/account/contacts-list.ts (ป้าย "CRM" ในรายชื่อผู้ติดต่อ)
//   • findContactsForLink        ← src/lib/modules/account/contact-links.ts (บล็อก "คนเดียวกันไหม")
//   • setContactPartyId          ← src/lib/modules/account/contact-links.ts (ผูก CrmContact เข้า Party)
//   • findContactByPartyId       ← src/lib/modules/account/contact-profile.ts (การ์ด CRM ในโปรไฟล์)
//   • findLatestDealForContact   ← src/lib/modules/account/contact-profile.ts (ดีลล่าสุด)
// 🔴 CrmHub **ไม่อยู่ที่นี่** (มติผู้คุมงาน addendum 3): `index.ts` = ผิวฝั่งเซิร์ฟเวอร์ · `ui.tsx` = ทางเข้าคอมโพเนนต์
//    เหมือนอีกสิบโมดูลที่ `src/app/app/sys/[id]/page.tsx` import Hub จาก `<module>/ui` (coupon · meeting · kanban ·
//    chat · inventory · hr · marketing · member · point · reward) — ถ้าดึง ./ui เข้ามาที่นี่ ทุกคนที่ import facade
//    จะลาก ui.tsx → @/lib/core/context → @/lib/env เข้ากราฟด้วย ⇒ ทะเบียน AI/บัญชี พังในโหมดไร้ env (ด่าน D5)
// ชนิดข้อมูลที่แนบมาด้วย = พารามิเตอร์ของฟังก์ชันข้างบน (ถูกลบทิ้งตอนคอมไพล์ จึงไม่ขยายผิวโมดูลตอนรัน)
// ภายในโมดูล CRM เองยังคง import กันเองแบบ relative ตามเดิม
export {
  createContact,
  findContactByPartyId,
  findContactsForLink,
  findLatestDealForContact,
  listPartyIdsWithContact,
  setContactPartyId,
} from "./service";
export type { Ctx, CreateContactInput } from "./service";
