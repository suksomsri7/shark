# ทบทวนแบบ CRM v2 ก่อนเริ่ม RUN (Fable · 18 ก.ย. 2569)

> ตรวจ: `docs/modules/20-crm-v2.md` (798 บรรทัด · มติ C1–C14) · `docs/api/CRM-API.md` (96 op) · `ledger/CRM-RUN.md` (32 ใบ) · `ledger/CODEX-HANDOFF-CRM.md` · ภาพ 17 ใบใน `ledger/design-crm/`
> เทียบกับ: โค้ดจริงบน main `6fff98d` (สำรวจ 18 ก.ย. — ทุกแถวในตาราง §3 มี file:line จากการเปิดโค้ด) + บทเรียนจากผลตรวจระบบสมาชิก `ledger/AUDIT-2026-09-16-MEMBER.md` (37 ข้อ)
> สถานะงาน: **ยังไม่มีโค้ด CRM v2 แม้แต่บรรทัดเดียว** — branch `session/crm-codex` ไม่มี commit ของ Codex · มีแค่ข้อสอบ C1.1 + seed ที่ Fable เขียนไว้ (ยัง SKIPPED)
> แผนงานที่ออกจากเอกสารนี้: `ledger/CRM-MASTER-PLAN.md`

---

## 1. คำตัดสิน

| คำถามของเจ้าของ | คำตอบ |
|---|---|
| แบบครบถ้วนไหม | **ครบในระดับฟังก์ชันธุรกิจ** (เทียบ HubSpot/Pipedrive ระดับ SME: ผู้ติดต่อ · บริษัท · ดีล+รายการสินค้า · กิจกรรม · อีเมล · sequence · มอบหมาย · คะแนน · วัตถุกำหนดเอง · ทีม/การมองเห็น · โควตา · คอมมิชชัน · รายงาน · portal · REST/AI/webhook) · **ขาด 9 เรื่อง** (§4) ส่วนใหญ่เป็นของเล็กที่ผู้ใช้จะถามหาในวันแรก |
| เชื่อมกับระบบอื่นได้ไหม | **แบบเชื่อมครบ 24 ระบบ** (§9 ของพิมพ์เขียว) และแนวทางถูก (Party กลาง + outbox + facade) · **แต่ข้อสมมติเรื่อง "ของที่มีอยู่แล้ว" ผิด 21 จุด** (§3) — facade หลายตัวไม่มีจริง · event ของระบบธุรกิจ 6 ตัวไม่มีจริง · ของกลาง 5 อย่างต้องสร้างใหม่ ⇒ ถ้าสั่งทำตามแผนเดิม builder จะติดตั้งแต่ใบ C1.3 |
| ฟังก์ชัน/โมดูลครบไหม | โมดูลบริการ 17 ไฟล์ครบ · เพิ่ม 3 (ไฟล์แนบ/โน้ต · ความยินยอมของผู้ติดต่อ · ตัวสลับ v1→v2) |
| แผนงาน/QC พอไหม | แผน 32 ใบดี แต่ **ขัดกันเอง 5 จุด** (§5) และ **QC ยังไม่ครอบ 4 ชั้นที่ทำให้ระบบสมาชิกหลุด 37 ข้อ**: ยิงพร้อมกัน · ส่งซ้ำ · ขอบเขตสิทธิ์ของคีย์/ผู้ช่วย AI · PDPA — และยังไม่มีขั้น "ทุกปุ่มทำงาน" ⇒ แผนใหม่เพิ่ม 3 เฟส (C0 ปรับฐาน · C4 ทุกปุ่ม · C5 ล่าบั๊ก/ช่องโหว่) + กลุ่มข้อสอบ "X" บังคับทุกใบ |

**สรุป**: แบบใช้ได้ ไม่ต้องออกแบบใหม่ · ต้อง "ปรับฐาน" (เฟส C0) ก่อนลงมือ แล้วทำตาม `ledger/CRM-MASTER-PLAN.md`

---

## 2. ความครบของฟังก์ชัน (เทียบ CRM ระดับ SME)

| หมวด | มีในแบบ | หมายเหตุ |
|---|---|---|
| Lead/ผู้ติดต่อ · lifecycle · แปลง · ตัวซ้ำ/รวม · นำเข้า/ส่งออก | ✅ | C1 (HubSpot-style) |
| บริษัท · บทบาทผู้ติดต่อ · แม่-ลูก · ผูกบัญชี | ✅ | |
| ดีล · หลาย pipeline · ขั้น+เงื่อนไข · รายการสินค้า · ส่วนลด+อนุมัติ · ใบเสนอราคา/ใบแจ้งหนี้จริง · forecast · ดีลนิ่ง | ✅ | |
| กิจกรรม · ปฏิทิน · บันทึกโทร+AI · แชท→กิจกรรม | ✅ | ถอดเสียง = ของใหม่ทั้งหมด (§3 ข้อ 17) |
| อีเมล 2 ทาง · thread · เทมเพลต · ติดตามเปิด/คลิก · routing ตั้งได้ | ✅ | ฐานส่งอีเมลของ SHARK วันนี้เป็น text ล้วน (§3 ข้อ 13) |
| sequence · มอบหมายอัตโนมัติ · คะแนน · กฎอัตโนมัติ | ✅ | |
| วัตถุกำหนดเอง ไม่จำกัด · ฟิลด์กำหนดเอง 3 ตัวตน | ✅ | engine ฟิลด์วันนี้ผูกตาย `Customer` (§3 ข้อ 2) |
| ทีม · การมองเห็น OWN/TEAM/ALL · โควตา · คอมมิชชัน→payroll | ✅ | |
| รายงาน 8 แท็บ · ส่งออก · ตั้งเวลา | ✅ | ไม่มีตัวสร้างรายงานเอง (backlog) |
| ติดตามเว็บ + cookie consent · ลิงก์ติดตาม · ฟอร์ม lead | ✅ | |
| Portal B2B | ✅ | เส้นทาง `/p/*` ชนกับโมดูล PAGES (§3 ข้อ 11) |
| REST 96 op · AI 32 tool · webhook 26 event · skill | ✅ | |
| มือถือ + แอปพนักงาน | ✅ | |
| PDPA erase/export/purge | ✅ (C3.9) | ไม่มี event `member.erased` ให้เกาะ (§3 ข้อ 20) |
| **ไฟล์แนบ/โน้ตปักหมุด/คอมเมนต์ภายใน บนผู้ติดต่อ-บริษัท-ดีล** | ❌ | A1 |
| **ความยินยอมรายช่องทางของผู้ติดต่อที่ยังไม่เป็นสมาชิก** | ❌ (มีแค่ optOut) | A2 |
| **อายุการเก็บ lead ที่ไม่แปลง (PDPA)** | ❌ | A3 |
| **ตั้งค่าแจ้งเตือนรายคน** | ❌ (มีแค่ระดับร้าน) | A4 |
| **ตัวสลับ v1→v2 ต่อระบบ + ทางถอย** | ❌ | A5 |
| **กันสแปมฟอร์ม lead (เกิน honeypot)** | ❌ | A6 |
| **วันหยุดร้านสำหรับ sequence/วันทำการ** | กำกวม | A7 |
| **ข้อมูลทดสอบขนาดจริงสำหรับเกณฑ์ความเร็ว §12** | ❌ (seed 60 ดีล vs เกณฑ์ 20,000) | A8 |
| Facebook/IG Lead Ads · ตัวสร้างรายงานเอง · Gmail/Outlook · VoIP · ปฏิทิน sync · e-signature · หลายสกุลเงิน | ไม่ทำ (ตัดสินแล้ว §1.2/§14) | คงไว้นอก RUN |

---

## 3. ข้อสมมติในพิมพ์เขียวที่ไม่ตรงโค้ดจริง (main `6fff98d`)

| # | พิมพ์เขียวเขียนว่า | ของจริง | ผลต่อแผน |
|---|---|---|---|
| 1 | CRM วันนี้ emit 0 event | emit 1 ตัวแล้ว: `crm.deal.won` ใน tx ของ `moveDeal` (`src/lib/modules/crm/service.ts:163`) · payload มี **เบอร์/อีเมลเต็ม** ขัดกับกติกา §7.1 ของพิมพ์เขียวเอง · consumer `onCrmDealWon` อยู่ `src/lib/member-bridges.ts` | C1.8 ต้องย้าย payload เป็นแบบไม่มี PII โดยไม่ทำ consumer สมาชิกพัง |
| 2 | engine ฟิลด์รับ `objectKey` ได้ด้วยการเพิ่ม param | ไม่มี `objectKey` ที่ไหนเลย · `MemberFieldValue.customerId` เป็น FK จริง · `MemberField.systemKey` ชี้คอลัมน์ `Customer` · ชื่อฟังก์ชันจริง `checkFieldValue` `listLayout` `fieldFilterWhere` `getFieldValues` `setFieldValues` `applyTemplate` (ไม่มี `validate/layout/filterWhere`) · unique วันนี้ `[systemId, key]` | C1.2 หนักกว่าที่ประเมิน → แตกเป็น 2 ใบ (engine / objects) + regression สมาชิก 6 ชุด |
| 3 | CRM มี 4 ตาราง ไม่มี partyId | 5 ตาราง · `CrmContact.partyId` มีแล้ว · **ไม่มี `index.ts` facade** (forms import `crm/service` ตรง) | C1.1 ไม่ต้องเพิ่มคอลัมน์นี้ · C0 สร้าง facade ก่อน |
| 4 | ต้องเพิ่ม partyId 7 ตาราง (ชื่อเดา) | ชื่อจริง: `Appointment` ❌ · `ShopOrder` ❌ · `RentalBooking` ❌ · `QueueTicket` ❌ · `ClinicVisit` ❌ · `PosSale` ❌ (ไม่มีเบอร์ มีแค่ memberId) · **มีแล้วแต่ไม่มีโค้ดเขียนค่า**: `TicketOrder` `SchoolEnrollment` `HotelReservation` (ไม่ใช่ HotelBooking) `PatientRecord` (ไม่ใช่ ClinicPatient) | C1.1 เพิ่ม 5 คอลัมน์ + เขียนค่าจริง 9 จุด |
| 5 | party facade: `merge` `updateContactInfo` | `mergeParties` · **ไม่มี** `updateContactInfo` | C0 เพิ่ม facade |
| 6 | `AutomationScope` เพิ่ม CRM บน K2.9 · แอ็กชันสื่อสารร่วมกับ journey | scope วันนี้ `KANBAN · MEMBER_TIER · MEMBER_JOURNEY` · journey สมาชิก (M3.3) **เสร็จแล้ว** มีแอ็กชัน 12 ตัว (`ISSUE_VOUCHER GIVE_POINTS SEND_LINE SEND_EMAIL SEND_SMS SEND_PUSH ADD_TAG REMOVE_TAG WAIT_THEN OPEN_KANBAN_CARD NOTIFY_STAFF REQUEST_REVIEW`) อยู่ใน `src/lib/modules/member/journeys.ts` ผูกกับ `customerId` | C2.1 ต้อง **ถอดตัวรันแอ็กชัน+WAIT (lease) ของ journey ออกเป็นของกลาง** แล้วให้ทั้งสมาชิกและ CRM ใช้ — ห้ามลอกเป็นชุดที่สอง (มติ C13) · ขั้น WAIT ต้องใช้แบบ lease ที่แก้แล้วในรอบ audit (M7) |
| 7 | event ระบบธุรกิจ "มี/แผนสมาชิก" | **มี**: `pos.sale.paid/voided` `booking.completed/no_show` `shop.order.paid` `forms.submission.received` `chat.*` `account.*` `member.*` `kanban.card.completed` `approval.*` `campaign.sent` · **ไม่มีเลย**: `ticket.order.paid` `rental.returned` `school.enrolled` `hotel.checked_out` `clinic.visit.done` `queue.served` `hr.payroll.paid` `inventory.item.updated` | C2.9 ต้อง emit ใหม่ 6 ตัวในโมดูลเจ้าของ (แตะ tx ของโมดูลนั้น → regression ต่อโมดูล) |
| 8 | บัญชี: `createExternalQuotation` รับ lines · `createInvoiceFromLines` · `convertQuotation` · `respondQuotation` · `paymentLinkFor` · `outstandingByContact` · `ensureAccountContact` · `syncContactFromParty` | `createExternalQuotation` มีแต่รับ **ยอดเดียว** (สร้าง 1 บรรทัด) · `listDocsByParty` มี · ที่เหลือ **ไม่มี/ชื่อไม่ตรง/ไม่ได้ export จาก facade** (`setQuotationResponse` · `createPaymentRequest` · `outstandingByContacts` · `mergeContacts` อยู่นอก `index.ts`) | ใบใหม่ C0.3 "facade บัญชีสำหรับ CRM" (additive · regression บัญชี V2 ทั้งชุด) |
| 9 | `chat.sendLine` · `chat.listConversationsByParty` | facade แชท export แค่ `pushToContact` | C0.3 เพิ่ม facade แชท 2 ฟังก์ชัน |
| 10 | `hr.createPayAdjustment` | **HR ไม่มี `index.ts`** · ของจริง `requestAdjustment` ใน `hr/payroll.ts` · kind `COMMISSION` มีจริง · `HrEmployee.linkedUserId` มีจริง | C0.3 สร้าง facade HR |
| 11 | portal อยู่ที่ `/p/*` · login ผ่าน `platform_auth` | **`/p/[slug]` เป็นของโมดูล PAGES แล้ว** · `platform_auth` = ตาราง session ของ **พนักงานหลังบ้าน** ไม่ใช่ลูกค้า · ของที่ใช้ได้จริงคือ `customer-session.ts` (OTP/LINE/`cs_`/คุกกี้/จำกัดอัตราใน DB — ผ่านรอบ audit แล้ว) แต่ **ผูกกับแถว `Customer` ที่ ACTIVE** | มติใหม่ C15: portal ย้ายไป `/b/{slug}/*` (หรือชื่อที่เจ้าของเลือก) + ขยาย customer-session ให้รองรับผู้ถือสิทธิ์แบบ "ผู้ติดต่อ CRM" |
| 12 | approval entityType `CRM_*` ใช้ได้เลย | ทะเบียนมี 7 ค่า ไม่มี CRM · ต้องแก้ 3 ที่: `approval/labels.ts` · `approval/actions.ts` (allowlist ซ้ำ) · `src/lib/approval-effects.ts` | ระบุใน C1.5/C3.3/C3.5 |
| 13 | `core/email.sendEmail` "ขยาย" | วันนี้ `sendEmail(to, subject, text)` — **text ล้วน** ไม่มี html/แนบ/headers/from/replyTo/คืน message id · ไม่มี webhook bounce · ไม่มีตารางโดเมนที่ยืนยันแล้ว · ขาเข้า (`/api/email/inbound` + ตัวอย่าง prefix ของบอร์ดงาน) ดีมาก ลอกได้ | C2.5 ต้องสร้างชั้นส่งอีเมลใหม่ (additive · ของเดิมเรียกได้เหมือนเดิม) + ตาราง `EmailDomain` + route webhook ของ Resend |
| 14 | ไฟล์เสียง/แนบ "private · signed URL 15 นาที" | storage วันนี้ = Bunny CDN **URL สาธารณะถาวร** · ไม่มี signed URL ที่ไหนเลย | ใบใหม่ C0.4 "ไฟล์ส่วนตัว" (proxy ตรวจสิทธิ์ หรือ Bunny token auth) — ไฟล์เสียงสนทนา/สัญญา/สลิป **ห้ามขึ้น URL สาธารณะ** |
| 15 | cron ลง `vercel.json` 10 งาน | `vercel.json` มี 2 cron (`/api/cron/tick` รายวัน · `/api/cron/hourly`) และมีกติกาในโค้ด "ห้ามเพิ่ม entry ใหม่" · งาน "ทุก 5 นาที" (sequence · อีเมลตั้งเวลา · เตือนนัด) **ไม่มีที่ลง** | มติใหม่ C16: งานถี่ขี่ `/api/cron/outbox` (ตัวเดิมที่ถูกยิงทุกนาทีจากภายนอก) ผ่านตัวกระจายงานกลาง · ที่เหลือขี่ tick/hourly |
| 16 | แจ้งเตือนพนักงาน push/LINE/อีเมล/ในแอป + quiet hours | มี: `AppNotification` · push พนักงาน (Expo) · อีเมล (แบบ `kanban/notify.ts`) · **ไม่มี LINE ถึงพนักงาน · ไม่มี quiet hours ฝั่งพนักงาน** | C2.10 ตัด LINE ถึงพนักงานออกจากรอบแรก (เหลือ push/อีเมล/ในแอป) หรือทำผ่านบัญชี LINE ที่พนักงานผูกเอง — ต้องถามเจ้าของ (Q3) |
| 17 | AI ถอดเสียง | **ไม่มี STT ใด ๆ ในระบบ** (มีแค่ตัวแปลงไฟล์เสียงบน VPS) · vision มีแล้ว (สแกนนามบัตรทำได้เลย) | C2.4 ต้องเลือกผู้ให้บริการถอดเสียง + คิดเครดิต — ถามเจ้าของ (Q2) · ถ้ายังไม่เลือก ทำเป็น adapter + ปุ่มปิด |
| 18 | REST "ลอก defineKanbanOp" | มีชั้นกลาง `src/lib/api/*` แล้ว (op/dispatch/idempotency/respond/openapi) · โมดูลใหม่ ≈ 12 ไฟล์ + bundle ใน `api-keys/scopes.ts` + fitness F13.10–12 | C1.10 ง่ายกว่าที่ประเมิน |
| 19 | กระดานดีล "dnd เดียวกับบอร์ดงาน" | บอร์ดงานใช้ Pointer Events เขียนเอง (`src/components/kanban/BoardView.tsx`) ไม่ใช่ dnd-kit (dnd-kit ใช้แค่ตัวออกแบบฟิลด์) | C1.5 ให้ถอดส่วนลากเป็น hook ใช้ร่วม ไม่ลอกไฟล์ 1,126 บรรทัด |
| 20 | erase "ต่อ flow สมาชิก" | `eraseMember` emit `member.updated` + `changedKeys:["erased"]` — ไม่มี event `member.erased` · ผู้ติดต่อที่ไม่เป็นสมาชิกไม่มี flow erase เลย | C3.9 เพิ่ม event `member.erased` (3 ทะเบียน) + flow erase ของผู้ติดต่อ CRM ที่ไม่ใช่สมาชิก (ผ่าน Party) |
| 21 | AI tool CRM 2–4 ตัว | มี 1 ตัว (`crm_create_lead`) + skill `crm` แบบ stub | C1.10 |

---

## 4. ส่วนที่ต้องเพิ่มในแบบ (มติเสนอ C15–C27 · รายละเอียดลงพิมพ์เขียว §15)

| มติ | เรื่อง | เหตุผล |
|---|---|---|
| **C15** | Portal ย้ายจาก `/p/*` ไป `/b/{slug}/*` · ใช้ `customer-session` ตัวเดิม ขยายให้ session ชี้ได้ 2 แบบ (สมาชิก / ผู้ติดต่อ CRM ผ่าน `CrmPortalAccess`) · ห้ามสร้างระบบ login ชุดที่สาม | §3 ข้อ 11 |
| **C16** | cron: ไม่เพิ่ม entry ใน `vercel.json` · งานถี่ (sequence · อีเมลตั้งเวลา · เตือนนัด · ยิงซ้ำ) เข้าตัวกระจายงานที่ถูกเรียกทุกนาทีจาก `/api/cron/outbox` · ทุกงาน **จองแถวแบบ lease** ก่อนทำ (บทเรียน M7/H6) | §3 ข้อ 15 |
| **C17** | ไฟล์ส่วนตัว (C0.4): ไฟล์เสียงสนทนา · ไฟล์แนบอีเมล · สัญญา/สลิปใน portal เสิร์ฟผ่าน route ที่ตรวจสิทธิ์+หมดอายุ ไม่ใช่ URL CDN ถาวร | §3 ข้อ 14 |
| **C18** | ตัวรันแอ็กชันสื่อสาร + WAIT ของ journey ถอดเป็นของกลาง (ย้าย ไม่ลอก) ให้สมาชิกและ CRM ใช้ร่วม · ข้อสอบ M3.3 + fix-s3 ต้องเขียวเท่าเดิม | §3 ข้อ 6 |
| **C19 (A1)** | ไฟล์แนบ + โน้ตปักหมุด + คอมเมนต์ภายใน (@mention) บนผู้ติดต่อ/บริษัท/ดีล — ตาราง `CrmFileLink` (entityType, entityId, fileId, uploadedById) · โน้ต/คอมเมนต์ = `CrmActivity type NOTE` + `pinned` + `mentions[]` | ผู้ใช้ทุกคนจะถามหาในวันแรก |
| **C20 (A2)** | ความยินยอมรายช่องทางของผู้ติดต่อที่ไม่ใช่สมาชิก: ตาราง `CrmContactConsent` (contactId · channel · granted · source · policyVersion · at) · เป็นสมาชิกแล้ว = อ่านจาก `MemberConsent` ตัวเดียว ไม่เก็บสองที่ · ทุกการส่ง (อีเมล/LINE/sequence) ตรวจ **ตอนส่งจริง** ไม่ใช่ตอนเข้าคิว (บทเรียน H7) | PDPA |
| **C21 (A3)** | อายุการเก็บ lead: `settings.crm.retention.leadMonths` (ค่าเริ่มต้น 24 · ปิดได้) → cron ลบข้อมูลระบุตัวตนของ lead ที่ไม่แปลง/ไม่มีกิจกรรมเกินกำหนด · แจ้งก่อน 30 วัน | PDPA |
| **C22 (A4)** | ตั้งค่าแจ้งเตือนรายคน (ทับค่าร้าน · เปิด/ปิดต่อเหตุการณ์ × ช่องทาง · quiet hours ของตัวเอง) | ลดการปิดแจ้งเตือนทั้งแอป |
| **C23 (A5)** | ตัวสลับ v1→v2 **ต่อระบบ CRM**: `settings.crm.uiVersion = 1\|2` (ค่าเริ่มต้น 1 จนเจ้าของเปิด) · หน้า v1 3 หน้าคงอยู่จนปิด C3 · ข้อมูลตารางเดียวกัน (additive) จึงสลับกลับได้ทันที · REST/AI v2 เปิดเมื่อสลับ | ทางถอยบน prod |
| **C24 (A6)** | ฟอร์ม lead: honeypot + จำกัดอัตราใน DB ต่อ IP/ฟอร์ม + เวลากรอกขั้นต่ำ + ตัวเลือก Cloudflare Turnstile (ปิดเป็นค่าเริ่มต้น) | ฟอร์มสาธารณะโดนบอททุกร้าน |
| **C25 (A7)** | วันทำการ/วันหยุด: `settings.crm.businessDays[]` + `settings.crm.holidays[]` (วันที่) + ปุ่มนำเข้าวันหยุดราชการไทยของปี | sequence/sendWindow |
| **C26 (A8)** | ข้อมูลทดสอบขนาดจริง `seed-crm-perf` (20,000 ดีล · 200,000 ผู้ติดต่อ · ร้านแยก) + ข้อสอบวัดจำนวน query/เวลา ตามเกณฑ์ §12 | เกณฑ์ §12 วัดไม่ได้ด้วย seed 60 ดีล |
| **C28** | คอลัมน์เงินใหม่ของดีลเป็น BigInt (`paidSatang` `wonValueSatang` · คอมมิชชัน) · `CrmDeal.valueSatang` เดิมเป็น Int เปลี่ยนชนิดไม่ได้โดยไม่เสี่ยงช่วง deploy → เพดาน ฿20 ล้าน/ดีล + หนี้ | บทเรียน L15 ของสมาชิก (ยอดสะสมชนเพดาน Int) |
| **C29** | ไม่เพิ่ม `PosSale.dealId` — บิลผูกดีลด้วยแถว `CrmDealPayment (dealId, refType, refId)` ซึ่งเป็นธงกันนับซ้ำของ `recordPayment` ด้วย | `PosSale` เป็นตารางร้อน · ได้ idempotency ฟรี |
| **C27** | กติกาความปลอดภัยบังคับทุกใบ (ได้จาก audit สมาชิก) — ดู `ledger/CRM-MASTER-PLAN.md` §4 "กลุ่มข้อสอบ X" | 37 ข้อของสมาชิกหลุดเพราะข้อสอบไม่มีชั้นนี้ |

---

## 5. จุดที่แผน 32 ใบเดิมขัดกันเอง (แก้ในแผนใหม่แล้ว)

1. **ตาราง `CrmVisibilityPolicy`** ถูกใช้ในใบ C1.7 แต่ migration ไปอยู่ `crm_v2_d` ของใบ C3.3 → ย้ายเข้า `crm_v2_a`
2. **ตาราง `CrmQuota`** ถูกใช้ใน C3.2 แต่สร้างใน C3.3 ซึ่งวางให้ทำขนานกับ C3.2 → migration ของเฟสแยกเป็นใบแรกของเฟส (C2.0 · C3.0) ไม่มีใบไหนแก้ schema ขนานกันอีก
3. **C2.2 ∥ C2.3** ทั้งคู่ต้องการตารางใน `crm_v2_b` → เหตุเดียวกับข้อ 2
4. **ชื่อ migration ไม่ตรงกัน**: พิมพ์เขียว §4.6 ให้ `c` = Visibility/Quota/Commission/Portal แต่ CRM-RUN ให้ `c` = `PosSale.dealId` และ `d` = ชุดนั้น → ยึดชุดใหม่: `a` (C1) · `b` (C2 ทั้งเฟส) · `c` (C3 ทั้งเฟส) และไม่มี `PosSale.dealId` อีกต่อไป (มติ C29)
5. **`TeamMember.acceptingLeads`** ถูกอ้างใน §11.5 แต่ไม่อยู่ในโมเดล §4.3 · **`EmailDomain`** ถูกอ้างใน §5.6 แต่ไม่อยู่ในรายการตาราง → เพิ่มทั้งคู่

---

## 6. ความเสี่ยงหลักของ RUN นี้ (เรียงตามโอกาส × ความเสียหาย)

| # | ความเสี่ยง | ตัวกัน |
|---|---|---|
| R1 | migration เปลี่ยน unique ของ `MemberSection/MemberField` บน prod ที่มีข้อมูลสมาชิกจริง | ตรวจแล้ว: ไม่มีโค้ดใช้ selector `systemId_key` ของสองตารางนี้ และโค้ดเก่าไม่พึ่งตัว index ⇒ สลับใน migration เดียวได้ (ADD COLUMN default → CREATE UNIQUE ใหม่ → DROP unique เก่า ตามลำดับนี้) · ซ้อม migrate บนสำเนา prod (Neon branch) ถ้าเจ้าของอนุญาต (Q5) |
| R2 | แตะ tx ของ POS/บัญชี/โมดูลธุรกิจ 6 ตัว (C2.7 · C2.9) | ทุกใบที่แตะโมดูลอื่นต้องรัน regression ของโมดูลนั้นทั้งชุด + ขั้น "ของแถมล้มไม่พาหลักล้ม" ตามสัญญา `compose` |
| R3 | ยอดเงิน/คอมมิชชันเพี้ยนเมื่อคิวส่งซ้ำหรือยิงพร้อมกัน (บั๊กชนิดเดียวกับ H5 ของสมาชิก) | กติกา "ปักธงก่อน แล้วค่อยบวก · บวกด้วย increment" + ข้อสอบ X-ยิงพร้อมกัน ทุกจุดที่มีตัวเลขสะสม |
| R4 | ข้อมูลรั่วข้ามทีม/ข้ามบริษัท/ข้ามระบบ CRM ในร้านเดียวกัน | `visibleWhere` จุดเดียว + ข้อสอบเจาะ 4 บทบาททุก list/get/REST/AI/export |
| R5 | endpoint สาธารณะ 7 ตัว (pixel · คลิก · ลิงก์ · shark.js · collect · unsubscribe · portal) | จำกัดอัตราใน DB · redirect เฉพาะ URL ที่เก็บไว้ · token เดาไม่ได้ · ไม่คืนข้อมูล |
| R6 | อีเมลขาเข้าเป็นช่องทาง XSS/ไฟล์อันตราย | sanitize + แสดงใน iframe sandbox + บล็อกรูประยะไกล + ไฟล์แนบบังคับดาวน์โหลด |
| R7 | เครื่อง build ฆ่า session (cgroup 5 GB) | ทุกคำสั่งหนักผ่าน `scripts/iso.sh` · ฐาน QC ใช้ร่วม → ข้อสอบที่เขียน DB รันทีละชุด |
| R8 | ผู้ทำงานรายงาน "ผ่าน" จากข้อสอบที่ตัวเองเขียน | ข้อสอบเขียนโดยตัวแทนแยก · ต้องแดงก่อน · ผู้คุมงานรันซ้ำบน seed ใหม่ · Fable ตรวจรอบสุดท้าย |

---

## 7. เรื่องที่ต้องให้เจ้าของตัดสิน (ไม่บล็อกเฟส C0–C1)

| # | คำถาม | ค่าที่แผนใช้ถ้าไม่ตอบ |
|---|---|---|
| Q1 | ชื่อเส้นทาง portal แทน `/p/*` | `/b/{slug}` |
| Q2 | ผู้ให้บริการถอดเสียงสนทนา (ต้นทุนต่อชั่วโมงเสียง) | ทำ adapter + ปุ่มปิดไว้ · ยังไม่ผูกผู้ให้บริการ |
| Q3 | แจ้งเตือนพนักงานทาง LINE เอาไหม (ต้องให้พนักงานผูก LINE ส่วนตัวกับ OA ของร้าน) | รอบแรก push + อีเมล + ในแอป |
| Q4 | ใครเป็นคนทำ: Opus 5 (ใน Claude Code · ใช้ sub-agent ได้) หรือ Codex | แผนเขียนให้ใช้ได้ทั้งคู่ · แนะนำ Opus 5 เป็นผู้คุมงานเพราะต้องแตก builder/ผู้เขียนข้อสอบ/ผู้ตรวจ เป็นตัวแทนแยกกัน |
| Q5 | ซ้อม migration บนสำเนา prod (Neon branch) ได้ไหม | ได้ = ทำทุก migration · ไม่ได้ = ใช้วิธี 2 จังหวะ + ตรวจ SQL ด้วยตา |
