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

// CRM C1.2b ▸ วัตถุกำหนดเอง (`objects.ts`) — namespace เดียว: create/update/archive/restore/reorder/list/get/warnings ·
//   records.{create,update,archive,get,list,move,bulk,import,export} · tabsFor · timelineFor · onRecordCreated (ตัวรับ event)
//   ผู้ใช้ถัดไป: C1.3/C1.4 (แท็บใน 360) · C1.9 (หน้า UI) · C1.10 (REST/tool) · outbox-consumers (ไทม์ไลน์สมาชิก)
//   ค่าคงที่/ชนิด/เทมเพลตสำหรับหน้า 'use client' อยู่ที่ `./objects-shared` (ไม่ลากกราฟ prisma)
export * as objects from "./objects";
// ◂ CRM C1.2b
// CRM C1.3 ▸ บริษัท (`companies.ts`) — namespace เดียว: createCompany/updateCompany/archiveCompany/setOwner/setParent · getCompany360 ·
//   listCompanies/exportCompanies · addContact/removeContact/setPrimary/setRole · findDuplicates/mergeCompanies ·
//   importCompanies/importFromAccount · recomputeCaches · onCompanyCreated (ตัวรับ event)
//   ผู้ใช้ถัดไป: C1.4 (บริษัทของผู้ติดต่อ) · C1.5 (recomputeCaches หลัง event ดีล) · C1.8 · C1.10 (REST/tool crm_company_360/crm_create_company)
//   ค่าคงที่/ชนิด/ตัวตรวจสำหรับหน้า 'use client' อยู่ที่ `./companies-shared` · ขอบเขตการอ่าน `./where` (companyWhere)
export * as companies from "./companies";
export { companyWhere } from "./where";
// ◂ CRM C1.3
