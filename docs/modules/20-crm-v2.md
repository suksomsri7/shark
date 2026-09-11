# โมดูล 20 v2: CRM (Lead · ผู้ติดต่อ · บริษัท · ดีล · ทีมขาย · Portal) — พิมพ์เขียว

> เอกสารพิมพ์เขียว · 11 กันยายน 2569 · ผู้เขียน: Fable · สถานะ: **ออกแบบครบ · เจ้าของสั่ง "ยังไม่ RUN ออกแบบให้ลึกและเรียบร้อยก่อน ต้องทำงานร่วมกับทุกระบบได้"** (ยังไม่แตะโค้ด)
> ต่อยอดจาก `06-member-v2.md` §14 (แกน 70% ของ CRM = Party · ฟิลด์ปรับได้ · ไทม์ไลน์ · segment · journey · PDPA · API/AI) + โมดูล `crm` v1 (4 ตาราง) · ยึด `_CONVENTIONS.md` (tenant-scoped · POS/บัญชีเป็นจุดตัดเงิน · outbox ทุกผลข้างเคียง · facade ต่อโมดูล)
> คู่มือแบบ: `ledger/DESIGN-CRM.md` (§9 มติ) · ภาพ 17 ใบ: `ledger/design-crm/` · API: `docs/api/CRM-API.md` · แผนงาน: `ledger/CRM-RUN.md`
> เครื่องมือเทียบ QC: ทุกหน้าใน §3 มีภาพอ้างอิง · ทุกฟังก์ชันใน §5/§7 มี op ใน API doc · ทุกใบงานใน CRM-RUN มีเกณฑ์ตรวจรับ §13 · **§9 = ตารางเชื่อมทุกระบบ 24 ระบบ** (ข้อกำหนดของเจ้าของ)

---

## 0. การตัดสินใจ (ปิดแล้ว — จากเจ้าของ 11 ก.ย. 2569 + ข้อสรุปของ Fable)

### 0.1 มติ C1–C14

| # | เรื่อง | มติ | ผลต่อโค้ด |
|---|---|---|---|
| **C1** | Lead | **ผู้ติดต่อคนเดียวมี lifecycle** (แบบ HubSpot): `CrmContact.lifecycleStage` LEAD → PROSPECT → CUSTOMER → LOST/CHURNED + `leadStatus` NEW/CONTACTED/QUALIFIED/UNQUALIFIED/NURTURE · ไม่แยกโมดูล Lead · "แปลง" = ปุ่มเดียวสร้าง/ผูก สมาชิก+บริษัท+ดีล ใน tx เดียว | §4.1 §5.2 |
| **C2** | Team | **`Team` เป็นของกลางทั้งแอป** (core.prisma · tenant-scoped) ใช้กับ CRM · มุมมองบันทึก TEAM ของสมาชิก · บอร์ดงาน/HR ใช้ต่อได้ · ตั้งค่าที่ `/app/settings/teams` (นอกโมดูล CRM) | §4.2 §6 |
| **C3** | คอมมิชชัน | **คิดเมื่อรับเงินแล้ว** (ฐาน PAID จาก `account.invoice.paid` / `pos.sale.paid` ที่ผูกดีล) · กฎ WON มีให้เลือกแต่ค่าเริ่มต้น PAID · อนุมัติ → `HrPayAdjustment kind=COMMISSION` (payroll) · void/คืนเงิน → REVERSED | §4.3 §7.1 §9 HR/บัญชี |
| **C4** | อีเมล | **ร้านตั้งได้ว่าอีเมลส่งไปที่ไหน/มาจากไหน** — ตั้งค่า 3 ชั้น: (1) กล่องอีเมลของร้านใน SHARK `crm+{key}@shark.in.th` (ค่าเริ่มต้น · รับผ่าน route K3.9) (2) **อีเมลของพนักงาน/ร้านเอง** = ส่งออกแสดงชื่อ/ที่อยู่ของพนักงาน (Reply-To ตั้งได้: กล่อง SHARK หรืออีเมลพนักงาน) + **ส่งสำเนาเข้า/ออกไปยังอีเมลที่ระบุ** (forward) + ที่อยู่ BCC สำหรับดึงอีเมลจากกล่องส่วนตัวเข้า CRM (3) 🔜 provider adapter (`CrmMailProvider` Gmail/Outlook OAuth) — โครงรองรับ ไม่อยู่ใน RUN แรก · ตั้งค่าได้ทั้งระดับร้านและทับต่อผู้ใช้ (ภาพ 15) | §4.3 §5.6 §7.5 |
| **C5** | โทร | **บันทึกมือ + แนบไฟล์เสียง + AI ถอดเสียง/สรุป/เสนอ next step** · click-to-call `tel:` เปิดโมดัลบันทึก · แอปเด้งบันทึกหลังวางสาย · `CrmCallProvider` adapter สำหรับ VoIP/PBX ในอนาคต (webhook สายเข้า/ออก → กิจกรรมอัตโนมัติ) | §5.5 §3 ภาพ 08 · 13 |
| **C6** | ติดตามเว็บ | **ทำเลย เป็นการตั้งค่า** — สวิตช์ต่อร้าน `tracking.web.enabled` (ค่าเริ่มต้นปิด) + สคริปต์ `shark.js` (page view · เวลาบนหน้า · UTM · referrer) + **แถบ cookie consent** (บังคับเมื่อเปิด · เก็บเวอร์ชันความยินยอม) + ผูก visitor → ผู้ติดต่อเมื่อกรอกฟอร์ม/คลิกจากอีเมล/ล็อกอิน portal · ตาราง `CrmWebSession/CrmWebEvent` · เก็บ 180 วัน (ตั้งได้) · ไม่เก็บ IP เต็ม | §4.3 §5.7 §11.7 ภาพ 16 |
| **C7** | Portal B2B | เจ้าของยังไม่เข้าใจ → **อธิบายใน DESIGN-CRM §9 + คงไว้ในแบบ (เฟส C3) รอยืนยัน** · นิยาม: หน้าเว็บที่ *ลูกค้าบริษัท* เข้าเอง (ลิงก์อีเมล+OTP หรือ LINE) เพื่อดู/ตอบรับใบเสนอราคา · ดู/ชำระใบแจ้งหนี้ · โหลดใบเสร็จ/สัญญา · แจ้งเรื่อง — แทนการส่ง PDF ไป-มาทางอีเมล/LINE · ไม่เห็นดีล/สถานะการขายภายใน | §3.8 §5.9 §6.5 |
| **C8** | Custom objects | **ผูกได้กับ สมาชิก / ผู้ติดต่อ / บริษัท / ดีล / ไม่ผูก** · **ไม่จำกัดจำนวนวัตถุ** (ไม่มีเพดาน · มีตัวเตือนประสิทธิภาพเมื่อ > 30 วัตถุ หรือ > 200,000 รายการ/วัตถุ) · ฟิลด์ 60/วัตถุ (เพดานฟิลด์ของสมาชิกคงเดิม) · engine เดียวกับฟิลด์สมาชิก (`objectKey`) | §4.1 §4.3 §5.8 §11.2 |
| **C9** | การมองเห็น | **STAFF = ทีม · MANAGER = ทั้งร้าน (ในสาขาที่มีสิทธิ์) · OWNER = ทั้งร้าน** ค่าเริ่มต้น · ตั้งทับต่อบทบาท/ทีม/pipeline ได้ (`CrmVisibilityPolicy`) · ใช้ตัวกรองเดียว `visibleWhere(actor, entity)` ทุก list/get/report/AI/REST | §6.2 |
| **C10** | ยังไม่ RUN | **ออกแบบให้ลึกและเรียบร้อยก่อน · ต้องทำงานร่วมกับทุกระบบได้** → §9 ตารางเชื่อม 24 ระบบ (ทุกระบบใน `systems.ts`) · ส่งมอบพิมพ์เขียว+API+RUN+ภาพครบ · เริ่ม RUN เมื่อสั่ง | เอกสารชุดนี้ |
| **C11** | ตัวตนกลาง | ทุกตัวตนของ CRM มี `partyId` บังคับ (ผู้ติดต่อ=PERSON · บริษัท=COMPANY) · `ShopOrder`/`Appointment`/`TicketOrder`/`RentalBooking`/`SchoolEnrollment`/`HotelBooking`/`ClinicVisit` ที่รู้เบอร์/อีเมล ต้องเขียน `partyId` (ใบ C1.1 ปิดช่องที่เหลือ) · ไทม์ไลน์ทุกหน้า 360 อ่านจาก `partyId` เดียว (`MemberActivity` + facade ของแต่ละโมดูล) | §4.1 §9 |
| **C12** | เหตุการณ์ | CRM emit outbox 26 event (วันนี้ 0) · ทุกผลข้างเคียงเป็น consumer · event ใหม่ลง 3 ทะเบียน (consumer / AUTOMATION_EVENTS / WEBHOOK_EVENTS) ในใบเดียวกับที่ emit (บทเรียน [[reference_outbox_new_event_needs_consumer]]) | §7.1 |
| **C13** | engine reuse | ห้ามสร้าง engine ใหม่ 3 อย่าง: ฟิลด์ (`MemberSection/Field` + `objectKey`) · อัตโนมัติ (`AutomationRule scope=CRM` บน K2.9 · แอ็กชันสื่อสาร SEND_EMAIL/SEND_LINE/WAIT_THEN ใช้ชุดเดียวกับ journey M3.3) · ทะเบียน op (`defineCrmOp`) · ใบงานที่ต้องการ engine ใหม่ต้องแย้งพร้อมหลักฐาน | §5.1 §7.3 |
| **C14** | ไมเกรชัน | เพิ่มอย่างเดียว (nullable/default) · เปลี่ยน unique ของ `MemberSection/MemberField` เป็น `[systemId, objectKey, key]` (ค่าเดิม objectKey=customer ไม่ชน) · backfill idempotent ทีละร้าน: `CrmCompany` จากข้อความ `CrmContact.company` · `CrmDealStageHistory` แถวแรก · partyId ของตารางที่ยังว่าง | §4.6 |

### 0.2 v2 เปลี่ยนอะไรจาก v1 (`crm.prisma` + `crm/service.ts` วันนี้)

| เรื่อง | v1 (มีอยู่จริง) | v2 |
|---|---|---|
| ผู้ติดต่อ | ชื่อ/โทร/อีเมล/บริษัท(ข้อความ)/lifecycle 4 ค่า/source ข้อความ/ผู้ดูแล | + บริษัทเป็นตัวตน+บทบาท · leadStatus · คะแนน+เหตุผล · ทีม · ที่มา D10 + UTM · ฟิลด์กำหนดเอง · consent/opt-out · แปลงปุ่มเดียว · ตัวซ้ำ/รวม · นำเข้า/ส่งออก |
| บริษัท | ไม่มี | `CrmCompany` ↔ Party COMPANY · ผู้ติดต่อหลายคน · ดีล/เอกสาร/สัญญา/portal · บริษัทแม่-ลูก |
| ดีล | ชื่อ/มูลค่า/ขั้น/WON-LOST/วันปิดคาด/ผู้ดูแล/เหตุผลแพ้ข้อความ/quotationDocId | + รายการสินค้า → ใบเสนอราคาจริง · ประวัติขั้น+วันต่อขั้น · หมวด forecast · เหตุผลแพ้ทะเบียน · ที่มา · ผู้ร่วม · ทีม · นิ่ง · ใบแจ้งหนี้/มูลค่าจริง · ฟิลด์กำหนดเอง · ลากได้ · หลาย pipeline+สิทธิ์ต่อ pipeline · เงื่อนไขก่อนเข้าขั้น |
| กิจกรรม | 6 ชนิด · หัวข้อ/กำหนด/เสร็จ | + ทิศทาง/เวลา/ระยะ/ผลสาย/โน้ต/ไฟล์เสียง/ถอดเสียง/AI สรุป/ผู้เข้าร่วม/สถานที่ · CHAT/SMS/WHATSAPP/VISIT · ปฏิทิน · ลงไทม์ไลน์กลาง |
| อีเมล | `sendEmail(to,subject,text)` ไม่เก็บ | กล่องอีเมลผูกผู้ติดต่อ IN/OUT · thread · เทมเพลต · เปิด/คลิก/bounce · routing ตั้งได้ (C4) |
| อัตโนมัติ | ไม่มี · event 0 | กฎ scope CRM · sequence · มอบหมายอัตโนมัติ · ดีลนิ่ง · scoring · event 26 |
| รายงาน | forecast ตัวเลขเดียว | 8 แท็บ · forecast เดือน×หมวด · funnel · โควตา · คอมมิชชัน · ROI ที่มา · ส่งออก/ตั้งเวลา |
| ทีม/สิทธิ์ | 6 คีย์ · ทุกคนเห็นทุกดีล | Team กลาง · OWN/TEAM/ALL · 40 คีย์ · เพดานตัวเลข · pipeline ต่อทีม |
| ลูกค้าเห็นเอง | ไม่มี | portal `/p/*` (C7 รอยืนยัน) |
| ติดตามเว็บ | ไม่มี | pixel/คลิก/ฟอร์ม UTM/ลิงก์ติดตาม/`shark.js` + cookie consent (C6) |
| REST/AI | ไม่มี REST · AI tool 2 | op ~96 · REST · AI tool ~32 · skill `crm` · webhook 26 event |

---

## 1. ขอบเขต · persona · user stories

### 1.1 ทำอะไร
CRM ระดับ SME ที่ (1) เก็บ lead/ผู้ติดต่อ/บริษัท พร้อมฟิลด์และวัตถุที่กิจการกำหนดเอง (2) ขับดีลผ่าน pipeline ที่มีรายการสินค้า → ใบเสนอราคา → ใบแจ้งหนี้ → รับเงิน ในบ้านเดียว (3) บันทึกทุกการติดต่อ (โทร/อีเมล/LINE/แชท/นัด/เว็บ) ในไทม์ไลน์เดียวกับสมาชิก (4) ทำงานแทนพนักงานขาย: มอบหมาย · sequence · ดีลนิ่ง · คะแนน (5) ให้เจ้าของเห็น forecast/โควตา/คอมมิชชัน/ROI (6) ให้ลูกค้าบริษัทตอบรับ/ชำระเองผ่าน portal (7) เปิดทุกอย่างเป็น REST/AI/webhook

### 1.2 ไม่ทำ (ตัดสินแล้ว)
- Gmail/Outlook OAuth sync (โครง adapter ไว้ · 🔜) · VoIP/PBX (adapter ไว้) · Google Calendar sync · AI forecast แบบ black box · แผนที่พื้นที่ · หลายสกุลเงิน (เก็บ `currency` แต่ THB) · marketing automation สำหรับผู้ติดต่อที่ไม่ใช่สมาชิก (ใช้แคมเปญสมาชิกหลังแปลง) · e-signature (สัญญาเป็น custom object + ไฟล์)

### 1.3 Persona
| ใคร | ต้องการ |
|---|---|
| เจ้าของร้าน (OWNER) | เห็น pipeline/forecast/ใครทำได้ตามโควตา · ตั้งกฎครั้งเดียว · ข้อมูลลูกค้าไม่หลุดข้ามทีม · คอมมิชชันตรง |
| หัวหน้าทีมขาย (MANAGER/TEAM LEAD) | ดีลของทีม · ดีลนิ่ง · โอนดีล · อนุมัติส่วนลด/คอมมิชชัน · รายงานทีม |
| พนักงานขาย (STAFF) | ดีลของฉัน · งานวันนี้ · โทร/อีเมล/LINE จากหน้าเดียว · ออกใบเสนอราคาจากรายการสินค้า · มือถือ |
| การตลาด (STAFF+`marketing.*`) | lead จากฟอร์ม/เว็บ/แคมเปญ · ROI ต่อที่มา · sequence |
| บัญชี/HR | ใบเสนอราคา→ใบแจ้งหนี้เชื่อมดีล · คอมมิชชันเข้า payroll ผ่านอนุมัติ |
| ลูกค้าบริษัท (portal) | ดู/ตอบรับใบเสนอราคา · ชำระ · เอกสาร · แจ้งเรื่อง · จัดการผู้ติดต่อของบริษัทตน |
| ระบบภายนอก/AI agent | อ่าน/เขียนผ่าน REST + webhook + skill manifest |

### 1.4 User stories ที่ต้องผ่านตอนตรวจรับ (ตัวอย่างสำคัญ · ครบใน §13)
- US1 ลูกค้ากรอกฟอร์มบนเว็บร้าน (มี utm) → lead ใหม่ใน CRM ระบบที่ฟอร์มตั้ง · มอบหมาย round-robin ให้ทีมภูเก็ต · พนักงานได้ LINE · คะแนน +10 · ที่มา first touch = WEB_FORM/utm ครบ
- US2 พนักงานเปิด lead → กด "แปลง" ติ๊ก บริษัท+ดีล → บริษัท (Party COMPANY · เลขภาษี) ผู้ติดต่อเป็น "ผู้ตัดสินใจ" ดีลอยู่ขั้นแรก · ต่อมา ดีลชนะ → สมาชิกถูกสร้าง (source CRM) อัตโนมัติ
- US3 ดีลมีรายการสินค้า 3 บรรทัด → "ออกใบเสนอราคา" → เอกสารบัญชีจริง QT พร้อมบรรทัด/ภาษี · ลูกค้ากดตอบรับใน portal → ดีลเลื่อนขั้น "ตกลง" อัตโนมัติ + กิจกรรม + แจ้งผู้ดูแล
- US4 ดีลไม่มีกิจกรรม 14 วัน → cron ติดป้ายนิ่ง · กฎสร้างงานติดตาม + แจ้งหัวหน้าทีม · พนักงานโทร (บันทึกสาย + ไฟล์เสียง → AI สรุป) → ป้ายนิ่งหาย
- US5 ส่งอีเมลใบเสนอราคาจาก CRM (ชื่อผู้ส่ง = พนักงาน · Reply-To ตามตั้งค่า C4) · ลูกค้าเปิด 2 ครั้ง คลิก 1 · ตอบกลับ → เข้ากล่องอีเมลร้าน → thread เดียวกัน · sequence หยุดเอง
- US6 พนักงาน STAFF ทีมกระบี่ เปิด `/deals/{id}` ของทีมภูเก็ต → 404 · หัวหน้าทีมภูเก็ตโอนดีลให้ทีมกระบี่ (`crm.deal.reassign`) → เห็นได้ + event
- US7 ใบแจ้งหนี้ของดีลถูกชำระ → คอมมิชชัน 5% เข้ารายการรออนุมัติ → อนุมัติ → `HrPayAdjustment` งวดเดือนนี้ · void ใบแจ้งหนี้ → REVERSED
- US8 เจ้าของสร้างวัตถุ "สัญญา" ผูกบริษัท 1–n · ฟิลด์ เลขที่/เริ่ม/สิ้นสุด/มูลค่า/ต่ออายุอัตโนมัติ · แท็บโผล่ในบริษัท 360 · กฎ "สัญญาหมดใน 30 วัน → สร้างดีลต่ออายุ" ทำงาน · REST `/objects/contract/records`
- US9 เปิด `tracking.web.enabled` → เว็บร้านโหลด `shark.js` → แถบ cookie consent · ผู้เยี่ยมชมกด "ยอมรับ" · เปิด 3 หน้า · กรอกฟอร์ม → 3 page view ผูกผู้ติดต่อย้อนหลัง · ไม่ยอมรับ → ไม่บันทึกอะไร
- US10 AI agent ภายนอก `GET /deals?stale=true` แล้ว `POST /activities` ด้วย Idempotency-Key · webhook `crm.deal.stale` ยิงถึงระบบร้าน · เจ้าของถาม AI ในแอป "ดีลไหนเสี่ยงเดือนนี้" ได้ 3 ดีล + ข้อเสนอสร้างงาน (อนุมัติก่อนทำ)

---

## 2. IA + การนำทาง

### 2.1 ลำดับชั้น
```
ร้าน (Tenant)
├─ Team / TeamMember (ของกลาง C2 · ตั้งค่าที่ /app/settings/teams)
└─ ระบบ CRM (AppSystem type=CRM — 1 ร้านมีได้หลายระบบ · Party ร่วมกัน · ฟอร์ม/แชทเลือกระบบปลายทาง)
   ├─ ผู้ติดต่อ (CrmContact ↔ Party PERSON) ── ฟิลด์ objectKey=contact ── CrmCompanyContact (บทบาท)
   ├─ บริษัท (CrmCompany ↔ Party COMPANY) ── ฟิลด์ objectKey=company ── บริษัทแม่/ลูก
   ├─ ดีล (CrmDeal ↔ CrmPipeline/CrmStage) ── CrmDealLine · CrmDealContact · CrmDealStageHistory ── ฟิลด์ objectKey=deal
   ├─ กิจกรรม (CrmActivity) · อีเมล (CrmEmailMessage/Event) · ปฏิทิน (มุมมองของกิจกรรม)
   ├─ อัตโนมัติ: AutomationRule scope=CRM · CrmSequence/Step/Enrollment · CrmAssignmentRule · CrmScoreRule/Log · CrmLostReason
   ├─ ทีมขาย: CrmVisibilityPolicy · CrmQuota · CrmCommissionRule/Commission
   ├─ วัตถุกำหนดเอง: CustomObject · CustomRecord · CustomRecordValue (ฟิลด์จาก MemberSection/Field objectKey=<key>)
   ├─ ติดตาม: CrmTrackedLink · CrmWebSession/Event · CrmEmailEvent
   ├─ portal: CrmPortalAccess · CrmPortalRequest
   └─ ตั้งค่า: pipeline · ขั้น · เหตุผลแพ้ · คะแนน · มอบหมาย · อีเมล(C4) · ติดตามเว็บ(C6) · โควตา · คอมมิชชัน · การมองเห็น · วัตถุ · portal · แจ้งเตือน · API
```

### 2.2 เมนูโมดูล (เมนูซ้าย 9 หมวด · ภาพ 01)
| เมนู | URL (ใต้ `/app/sys/{sysId}/crm`) | สิทธิ์ขั้นต่ำ |
|---|---|---|
| หน้าแรก | `/` | `crm.contact.read` |
| ดีล | `/deals` (board/table/forecast) · `/deals/{id}` · `/deals/new` · `/pipelines` | `crm.deal.read` |
| ผู้ติดต่อ | `/contacts` · `/contacts/{id}` · `/contacts/new` · `/contacts/import` · `/contacts/duplicates` | `crm.contact.read` |
| บริษัท | `/companies` · `/companies/{id}` · `/companies/new` · `/companies/import` | `crm.company.read` |
| กิจกรรม | `/activities` (ของฉัน/ทีม · ค้าง/วันนี้/สัปดาห์) | `crm.activity.read` |
| ปฏิทิน | `/calendar?view=week&team=` | `crm.activity.read` |
| อีเมล | `/emails` (กล่องรวม IN/OUT ที่ผูกผู้ติดต่อ · ยังไม่จับคู่) · `/emails/{threadKey}` | `crm.email.read` |
| รายงาน | `/reports/{overview,forecast,funnel,reps,activities,lost,sources,scores}` | `crm.report.view` |
| ตั้งค่า | `/settings/{pipelines,stages,lost-reasons,scoring,assignment,automation,sequences,email,tracking,objects,quotas,commissions,visibility,portal,notifications,api}` | `crm.settings.manage` (บางหน้าคีย์เฉพาะ §6) |
| นอก sys | `/app/settings/teams` (Team กลาง) · `/app/party/{partyId}` (ทางเข้า 360 รวม) · `/p/*` portal ลูกค้า · `/objects/{key}` (รายการวัตถุ ใต้ crm) · `/t/o/{token}.gif` `/t/c/{token}` `/l/{code}` (tracking · public) · `/f/{token}` ฟอร์ม (มีแล้ว) | — |

### 2.3 URL state (แบบบอร์ดงาน)
`/deals?pipeline=&view=board|table|forecast&owner=&team=&stage=&closeFrom=&closeTo=&stale=&tag=&f.{fieldKey}=&q=&saved={viewId}&sort=&page=` · `/contacts?q=&stage=&leadStatus=&owner=&team=&score=hot|warm|cold&source=&company=&f.{key}=&saved=` · หน้า 360 `?tab=overview|lines|activities|emails|docs|history|{objectKey}` · ปฏิทิน `?view=day|week|month&from=&team=&mine=1`

---

## 3. หน้าจอทั้งหมด (17 ภาพ · 24 surface · ภาพใน `ledger/design-crm/`)

| # | หน้า | URL | ภาพ | สิ่งที่ต้องมี (เกณฑ์ parity) |
|---|---|---|---|---|
| 3.1 | หน้าแรก CRM | `/` | 01 | เมนู 9 · KPI 6 (pipeline เปิด · ถ่วงน้ำหนัก · ชนะเดือนนี้ vs โควตา · อัตราชนะ · ดีลนิ่ง · lead ร้อน) · งานวันนี้ · ดีลที่ต้องดู · leaderboard ทีม · ผู้ช่วย AI 3 ปุ่ม · ที่มา lead เดือนนี้ · ตัวกรอง pipeline/ผู้ดูแล/ช่วง + มุมมองบันทึก |
| 3.2 | กระดานดีล | `/deals?view=board` | 02 | คอลัมน์ต่อขั้น + จำนวน/ยอด/ถ่วงน้ำหนัก · การ์ด 8 องค์ประกอบ (ชื่อ·บริษัท·มูลค่า·ผู้ดูแล·วันปิด·ป้ายนิ่ง·คะแนน·กิจกรรมถัดไป) · ลากได้ (dnd เดียวกับบอร์ดงาน) · เงื่อนไขก่อนเข้าขั้น (`requireFields`) → โมดัลกรอก · ตัวกรอง 6 + ฟิลด์กำหนดเอง · มุมมองบันทึก · สลับ board/table/forecast · bulk (โอน · แท็ก · ย้ายขั้น · ส่งออก) · คอลัมน์ WON/LOST พับได้ |
| 3.3 | ดีล 360 | `/deals/{id}` | 03 | หัว (ชื่อ·บริษัท·ผู้ติดต่อหลัก·stepper ขั้นคลิกได้·มูลค่า·วันปิด·ผู้ดูแล·หมวด forecast·ที่มา) · แท็บ 6 (ภาพรวม/รายการสินค้า/กิจกรรม/อีเมล/เอกสาร/ประวัติขั้น) + แท็บวัตถุกำหนดเองที่ผูกดีล · รายการสินค้า → ออกใบเสนอราคา · ประวัติขั้น (จาก→ไป·ใคร·กี่วัน) · ไทม์ไลน์ · แถบขวา (AI สรุป/เสี่ยง/next step · ผู้ติดต่อร่วม · sequence · เอกสารบัญชี · การ์ดบอร์ดงาน) · ปุ่ม โทร/ส่งอีเมล/LINE/นัด/แพ้(เหตุผลบังคับ) |
| 3.4 | บริษัท 360 | `/companies/{id}` | 04 | หัว (ชื่อ·เลขภาษี·อุตสาหกรรม·ขนาด·ผู้ดูแล·ทีม·lifecycle·คะแนน) · ตัวเลข 5 · แท็บ ภาพรวม/ผู้ติดต่อ/ดีล/เอกสารบัญชี/{วัตถุ}/ไทม์ไลน์ · ผู้ติดต่อพร้อมบทบาท+หลัก (เพิ่ม/ย้าย/ตั้งหลัก) · ดีล · เอกสาร QT/INV/RC + ค้างชำระ · custom object tab · ไทม์ไลน์รวมทุกผู้ติดต่อ (Party) · แถบขวา AI/portal ใครเข้าได้/บริษัทในเครือ/ค้างชำระ |
| 3.5 | ผู้ติดต่อ 360 + แปลง | `/contacts/{id}` | 05 | หัว (lifecycle·leadStatus·คะแนน ร้อน/อุ่น/เย็น + เหตุผล 3 ล่าสุด·บริษัท+ตำแหน่ง·ผู้ดูแล·ที่มา first/last) · ป้าย "เป็นสมาชิก {ระดับ}" · ส่วนฟิลด์ระบบ+กำหนดเอง (objectKey=contact) · ไทม์ไลน์ (แชท/อีเมล/โทร/นัด/ฟอร์ม/เว็บ/ซื้อ/จอง) · แถบขวา AI/การเชื่อมต่อ (สมาชิก·บริษัท·ดีล·แชท·บัญชี) · โมดัลแปลง 3 ติ๊ก (สมาชิก/บริษัท/ดีล) · consent/opt-out |
| 3.6 | วัตถุกำหนดเอง | `/settings/objects` · `/objects/{key}` · `/objects/{key}/{recordId}` | 06 | รายการวัตถุ (ผูกกับ·จำนวน·ฟิลด์) · เพิ่มวัตถุ (ชื่อเอกพจน์/พหูพจน์·ผูกกับ 5 แบบ·1–n·ชื่อรายการ·แท็บ 360·portal) · เทมเพลต 8 · ตัวออกแบบฟิลด์ (ภาพ 03 สมาชิก) สลับ "วัตถุ:" · หน้ารายการวัตถุ (ตาราง/ตัวกรอง/มุมมองบันทึก/นำเข้า) · หน้ารายการเดี่ยว (เลย์เอาต์·ไทม์ไลน์·ไฟล์·โน้ต) · แท็บในแม่ · REST/AI/webhook ปรากฏอัตโนมัติ |
| 3.7 | กฎอัตโนมัติ + sequence + มอบหมาย + นิ่ง | `/settings/automation` · `/settings/sequences/{id}` · `/settings/assignment` · `/settings/stages` | 07 | ตัวสร้างกฎประโยค (trigger crm.* / เงื่อนไข / แอ็กชัน 12 · dry-run) · รายการกฎ+สถิติ · sequence editor (ขั้น EMAIL/LINE/TASK/WAIT · หยุดเมื่อ · เวลาส่ง · วันทำการ) · ลงทะเบียน (ขั้นปัจจุบัน·หยุด) · กฎมอบหมาย (ลำดับ·เงื่อนไข·โหมด·คิว round-robin) · ดีลนิ่งต่อขั้น |
| 3.8 | บันทึกโทร · กล่องอีเมล · ปฏิทิน | `/activities` · `/contacts/{id}?tab=emails` · `/calendar` · `/emails` | 08 | โมดัลบันทึกสาย (ผล·ระยะ·ทิศทาง·โน้ต·งานถัดไป·ไฟล์เสียง·AI ถอด/สรุป/next step → สร้างดีล+งาน) · thread อีเมล IN/OUT (เปิด/คลิก · ตอบจากหน้านี้ · เทมเพลต · แนบ · กำหนดเวลาส่ง) · ปฏิทินวัน/สัปดาห์/เดือน (ของฉัน/ทีม · นัดจากโมดูลจอง/คลินิก/โรงเรียน อ่านอย่างเดียว) · กล่องรวม `/emails` (ยังไม่จับคู่ → ผูกมือ/สร้าง lead) |
| 3.9 | รายงาน 8 แท็บ | `/reports/*` | 09 | ภาพรวม · forecast เดือน×หมวด (+โควตา · ต่อคน/ทีม) · funnel ต่อขั้น (จำนวน/อัตรา/วัน) · ยอดต่อคน/ทีม vs โควตา + คอมมิชชัน · กิจกรรมต่อคน · เหตุผลแพ้ · ที่มา/ROI · lead score · ตัวกรองช่วง/ทีม/pipeline · ส่งออก CSV · ตั้งเวลาส่งอีเมล |
| 3.10 | ทีม · การมองเห็น · โควตา · คอมมิชชัน | `/app/settings/teams` · `/settings/visibility` · `/settings/quotas` · `/settings/commissions` | 10 | ทีม (ชื่อ·หัวหน้า·สมาชิก·สาขา) · ตารางการมองเห็น บทบาท×เอนทิตี OWN/TEAM/ALL · กฎมอบหมายพื้นที่ · โควตารายเดือน/ไตรมาส ต่อคน/ทีม (มูลค่า·ดีล·กิจกรรม) · กฎคอมมิชชัน (ฐาน PAID/WON · %/คงที่/ขั้นบันได · ขอบเขต · แบ่งผู้ร่วม) · รายการรออนุมัติ → payroll |
| 3.11 | ติดตามเว็บ/อีเมล + ฟอร์ม lead + ลิงก์ | `/settings/tracking` · `/settings/forms` | 11 · 16 | สวิตช์ pixel/คลิก · สถิติเปิด/คลิก/bounce · โค้ดฝังฟอร์ม + UTM + ระบบ CRM ปลายทาง + honeypot + แจ้ง LINE · ลิงก์ติดตาม (สร้าง/QR/คลิก) · **สคริปต์เว็บ (C6): สวิตช์ · โค้ดฝัง `shark.js` · แถบ cookie consent (ข้อความ/สี/เวอร์ชัน) · การเก็บ (วัน) · ตัวอย่างไทม์ไลน์เว็บของผู้ติดต่อ** (ภาพ 16) |
| 3.12 | อีเมล — การตั้งค่าเส้นทาง (C4) | `/settings/email` | 15 | กล่องอีเมลร้าน `crm+{key}@` (คัดลอก/หมุน key) · ส่งออก: ชื่อ/ที่อยู่ผู้ส่ง (โดเมนร้านที่ยืนยันแล้ว หรือ `@shark.in.th`) · Reply-To (กล่อง SHARK / อีเมลพนักงาน / กำหนดเอง) · **ส่งสำเนาไปที่** (อีเมลภายนอก · เข้า/ออก/ทั้งคู่) · BCC เข้า CRM · "อีเมลแปลกหน้าเป็น lead" · ทับต่อผู้ใช้ (ตารางพนักงาน: อีเมลตัวเอง · Reply-To · สำเนา) · provider 🔜 Gmail/Outlook (ปุ่มปิด) · ทดสอบส่ง |
| 3.13 | Portal ลูกค้า B2B (C7 รอยืนยัน) | `/p/*` | 12 | เข้าสู่ระบบ OTP อีเมล/LINE · หน้าแรกบริษัท (ค้างชำระ·ใบเสนอราคารอตอบ·กิจกรรม) · ใบเสนอราคา ดู PDF/ตอบรับ/ปฏิเสธ+เหตุผล · ใบแจ้งหนี้ + ชำระ PromptPay + แนบสลิป · ใบเสร็จ/ใบกำกับ (ขอเต็มรูป) · เอกสาร/สัญญา (วัตถุ `portalVisible`) · แจ้งเรื่อง → การ์ดบอร์ดงาน+สถานะ · ผู้ติดต่อของบริษัท (ขอเพิ่ม/เปลี่ยน → อนุมัติ) · โปรไฟล์บริษัท |
| 3.14 | แอปพนักงานขาย | (แอป SHARK) | 13 | ดีลของฉัน (การ์ด·ป้ายนิ่ง·ตัวกรองขั้น·ปุ่มโทร) · เด้งบันทึกสายหลังวางสาย · งานวันนี้ · สแกนนามบัตร (AI อ่าน → lead) · ค้นผู้ติดต่อ/บริษัท · push แจ้งเตือน |
| 3.15 | AI + API | `/settings/api` + ผู้ช่วยทุกหน้า | 14 | proposal flow (อนุมัติ/แก้/ยกเลิก · ระบุ tool ที่ใช้) · คีย์ 3 bundle · curl · skill manifest · webhook 26 event + ล็อกส่ง · ตัวอย่างคำถาม 6 |
| 3.16 | เชื่อมทุกระบบ (แผนที่) | (เอกสาร/ตั้งค่า `/settings/integrations`) | 17 | แผนผัง CRM กลาง ↔ 23 ระบบ: ลูกศร event เข้า/ออก + สิ่งที่แลกเปลี่ยน (ตาม §9) · สถานะเชื่อมต่อต่อระบบ (เปิดใช้/ไม่ได้เปิด) · หน้าตั้งค่าเลือก "ระบบ MEMBER/ACCOUNT/KANBAN/CHAT ปลายทาง" เมื่อร้านมีหลายระบบ |
| 3.17 | สมัคร/นำเข้า/ตัวซ้ำ | `/contacts/new` `/companies/new` `/contacts/import` `/contacts/duplicates` | (ใช้แบบภาพ 10 · 11 · 12 ของสมาชิก) | โมดัลเพิ่ม (ที่มา·ฟิลด์ที่ตั้ง·บริษัท lookup/สร้างใหม่·มอบหมาย) · นำเข้า CSV จับคู่คอลัมน์ (ผู้ติดต่อ+บริษัทในไฟล์เดียว · ซ้ำ: update/skip/candidate) · ตัวซ้ำ (เบอร์/อีเมล/เลขภาษี/โดเมน) · รวม (เลือกค่าต่อฟิลด์ · ย้ายดีล/กิจกรรม/อีเมล/portal) |
| 3.18 | แชท + CRM (แผงข้าง) | (ในโมดูลแชท) | (ภาพ 26 สมาชิก + ปุ่ม) | แผงข้างห้อง: ผู้ติดต่อ/บริษัท/ดีลเปิด/คะแนน · ปุ่ม เปิดดีล · บันทึกกิจกรรม · สร้าง lead จากแชท · แชทลง CrmActivity CHAT อัตโนมัติ (สรุป AI ต่อห้อง) |

**มือถือ (พนักงาน)**: ทุกหน้า 3.1–3.9 responsive ≤ 390px (กระดาน = swipe ต่อขั้น · ตารางเป็นการ์ด · แถบขวาเป็น sheet) — ภาพ 13 เป็นแบบอ้างอิง · portal 3.13 mobile-first (ใช้ใน LINE)

---

## 4. Data Model v2 (Prisma · additive ทั้งหมด · scope = sys(CRM) ยกเว้นระบุ)

### 4.1 แก้ตารางเดิม (เพิ่มคอลัมน์ล้วน — nullable/default)

```prisma
model CrmContact {                      // crm.prisma — เดิม: id tenantId systemId name phone email company lifecycleStage source ownerUserId memberCustomerId note archivedAt partyId
  firstName        String?              // แยกจาก name (name คงไว้เป็น display · backfill split ช่องว่างแรก)
  lastName         String?
  titleTh          String?
  companyId        String?              // บริษัทหลัก (cache จาก CrmCompanyContact.isPrimary) · index
  jobTitle         String?
  department       String?
  leadStatus       CrmLeadStatus @default(NEW)
  lifecycleStage   CrmLifecycleStage    // enum += CHURNED · PROSPECT ใช้เป็น MQL/SQL (ป้ายตั้งได้ใน settings)
  score            Int      @default(0)
  scoreUpdatedAt   DateTime?
  scoreBand        CrmScoreBand?        // HOT/WARM/COLD cache (คำนวณจาก settings.scoring)
  teamId           String?
  lastActivityAt   DateTime?
  nextActivityAt   DateTime?
  emailOptOut      Boolean  @default(false)
  emailBouncedAt   DateTime?
  marketingOptOut  Boolean  @default(false)
  convertedAt      DateTime?
  assignedAt       DateTime?
  assignedBy       String?              // "USER:{id}" | "RULE:{id}" | "API" | "IMPORT"
  sourceKind       MemberSource?        // D10 enum (WALK_IN…API) · `source` String เดิมคงไว้เป็นรายละเอียด
  sourceChannel    String?              // key จาก channels.ts
  sourceDetail     Json?                // { utm{source,medium,campaign,term,content}, formId?, linkId?, pageUrl?, referrer?, chatContactId?, staffUserId?, importJobId?, campaignId? }
  attributionId    String?              // MemberAttribution (เมื่อกลายเป็นสมาชิก) — อ่านอย่างเดียว
  locale           String?  @default("th")
  tags             String[] @default([])
  lineUserId       String?              // ผ่าน MemberChannelIdentity เมื่อเป็นสมาชิก · ที่นี่ cache สำหรับ lead ที่ยังไม่เป็นสมาชิก
  portalAccessAt   DateTime?
  mergedIntoId     String?
  @@index([systemId, ownerUserId]) @@index([systemId, teamId]) @@index([systemId, score]) @@index([systemId, companyId])
  @@index([systemId, leadStatus]) @@index([systemId, lastActivityAt]) @@index([tenantId, email]) @@index([systemId, mergedIntoId])
}
model CrmDeal {                         // เดิม: id tenantId systemId contactId pipelineId stageId title valueSatang kind expectedCloseAt closedAt ownerUserId lostReason quotationDocId
  companyId          String?
  teamId             String?
  stageEnteredAt     DateTime @default(now())
  stalledAt          DateTime?
  lastActivityAt     DateTime?
  nextActivityAt     DateTime?
  nextStep           String?
  forecastCategory   CrmForecastCategory @default(PIPELINE)
  lostReasonId       String?            // CrmLostReason · `lostReason` ข้อความเดิม = โน้ตเพิ่มเติม
  sourceKind         MemberSource?
  sourceDetail       Json?
  invoiceDocId       String?            // ใบแจ้งหนี้ที่ออกจากดีล (ล่าสุด)
  wonValueSatang     Int?               // มูลค่าจริงจากใบแจ้งหนี้/บิล (อัปเดตโดย consumer)
  paidSatang         Int      @default(0)
  collaboratorUserIds String[] @default([])
  currency           String   @default("THB")
  discountBp         Int      @default(0)   // ส่วนลดท้ายบิลของดีล (ตรวจเพดาน crm._maxDealDiscountBp)
  tags               String[] @default([])
  probabilityOverride Int?              // ทับ % ของขั้น (MANAGER+)
  reopenedCount      Int      @default(0)
  kanbanCardId       String?            // การ์ดบอร์ดงานหลักของดีล
  @@index([systemId, ownerUserId, kind]) @@index([systemId, teamId, kind]) @@index([systemId, expectedCloseAt]) @@index([systemId, stalledAt]) @@index([systemId, companyId]) @@index([systemId, forecastCategory, expectedCloseAt])
}
model CrmActivity {                     // เดิม: id tenantId systemId contactId dealId type title dueAt doneAt ownerUserId
  companyId        String?
  direction        CrmDirection?        // IN/OUT
  channel          String?              // key จาก channels.ts (PHONE/EMAIL/LINE/WHATSAPP/…)
  startAt          DateTime?
  endAt            DateTime?
  durationSec      Int?
  outcome          String?              // key จาก settings.activityOutcomes[type]
  body             String?              // โน้ต (≤ 8,000)
  recordingFileId  String?
  transcript       String?
  aiSummary        String?
  aiNextStep       String?
  attendees        Json?                // { userIds[], contactIds[] }
  location         String?
  meetingUrl       String?
  remindAt         DateTime?
  source           CrmActivitySource @default(MANUAL)   // MANUAL/AUTO/EMAIL/CHAT/CALENDAR/PORTAL/WEB/API
  sourceRef        String?              // messageId / conversationId / appointmentId / webSessionId
  completedById    String?
  kanbanCardId     String?
  customRecordId   String?              // กิจกรรมผูกวัตถุกำหนดเอง (เช่น "เช็กระยะรถคันนี้")
  priority         CrmPriority @default(NORMAL)
  @@index([systemId, ownerUserId, startAt]) @@index([systemId, dueAt, doneAt]) @@index([companyId]) @@index([systemId, type, startAt]) @@index([customRecordId])
}
model CrmStage    { staleDays Int? ; requireFields String[] @default([]) ; requireLines Boolean @default(false) ; requireQuotation Boolean @default(false) ; color String? ; description String? }
model CrmPipeline { teamIds String[] @default([]) ; autoInvoiceOnWon Boolean @default(false) ; currency String @default("THB") ; kind CrmPipelineKind @default(SALES) /* SALES/RENEWAL/SERVICE */ ; archivedAt DateTime? }
model MemberSection   { objectKey String @default("customer") ; @@unique([systemId, objectKey, key]) }   // แทน @@unique([systemId,key])
model MemberField     { objectKey String @default("customer") ; @@unique([systemId, objectKey, key]) ; portalVisible Boolean @default(false) ; portalEditable Boolean @default(false) }
model MemberSavedView { objectKey String @default("customer") ; teamId String? }
model MemberAddress   { ownerType MemberAddressOwner @default(CUSTOMER) ; ownerId String? }   // CUSTOMER/CONTACT/COMPANY
model MemberActivity  { crmContactId String? ; crmCompanyId String? ; dealId String? }           // ไทม์ไลน์กลางรู้จัก CRM (อ่านผ่าน partyId เป็นหลัก)
model KanbanCardLink  { linkType += DEAL | COMPANY | CRM_CONTACT | CUSTOM_RECORD }
model AutomationRule  { scope += CRM ; pipelineId String? ; crmSystemId String? }
model Appointment { partyId String? }  model ShopOrder { partyId String? }  model TicketOrder { partyId (มีแล้ว · เขียนจริง) }
model RentalBooking { partyId String? }  model SchoolEnrollment { partyId String? }  model HotelBooking { partyId String? }  model ClinicPatient { partyId String? }  model QueueTicket { partyId String? }   // C11 — ชื่อตารางจริงตรวจตอน C1.1 (ดู §9)
model FormDef       { crmSystemId String? ; utmCapture Boolean @default(true) ; assignRuleId String? ; scoreOnSubmit Int? ; createCompanyFromField String? }
model FormSubmission{ utm Json? ; pageUrl String? ; referrer String? ; webSessionId String? }
model MktRecipient  { emailMessageId String? }                                   // แคมเปญใช้ tracking เดียวกัน
model HrPayAdjustment { crmCommissionId String? }
model ApiKey        { bundle String? }                                           // "crm.readonly" ฯลฯ (ถ้ายังไม่มีจาก member)
model AppSystem.settings.crm (Json) — ดู §4.5
```

### 4.2 Enum ใหม่
```
CrmLeadStatus        NEW CONTACTED QUALIFIED UNQUALIFIED NURTURE
CrmLifecycleStage    LEAD PROSPECT CUSTOMER LOST CHURNED         (+CHURNED)
CrmScoreBand         HOT WARM COLD
CrmContactRole       DECISION_MAKER INFLUENCER COORDINATOR BILLING TECHNICAL END_USER OTHER
CrmForecastCategory  PIPELINE BEST_CASE COMMIT OMITTED
CrmDirection         IN OUT
CrmActivityType      CALL MEETING EMAIL LINE TASK NOTE CHAT SMS WHATSAPP VISIT WEB PORTAL   (+6)
CrmActivitySource    MANUAL AUTO EMAIL CHAT CALENDAR PORTAL WEB API RULE
CrmPriority          LOW NORMAL HIGH
CrmCompanySize       MICRO SMALL MEDIUM LARGE ENTERPRISE
CrmPipelineKind      SALES RENEWAL SERVICE
CrmAssignMode        FIXED ROUND_ROBIN TEAM_LEAD LEAST_OPEN
CrmSeqStepKind       EMAIL LINE TASK WAIT SMS
CrmEnrollStatus      ACTIVE PAUSED DONE STOPPED
CrmEmailStatus       QUEUED SENT DELIVERED OPENED BOUNCED FAILED RECEIVED
CrmEmailEventKind    OPEN CLICK BOUNCE COMPLAINT REPLY UNSUBSCRIBE
CrmCommissionBasis   PAID WON
CrmCommissionKind    PCT FIXED TIERED
CrmCommissionStatus  PENDING APPROVED PAID REVERSED REJECTED
CrmQuotaOwner        USER TEAM
CrmVisibility        OWN TEAM ALL
CrmPortalRole        VIEW APPROVE PAY ADMIN
CrmPortalRequestKind ISSUE CONTACT_CHANGE PROFILE_CHANGE DOCUMENT_REQUEST
CrmWebEventKind      PAGEVIEW CLICK FORM_VIEW FORM_SUBMIT IDENTIFY CONSENT
CustomParent         CUSTOMER CONTACT COMPANY DEAL NONE
CustomRecordType     CONTACT COMPANY DEAL CUSTOM
MemberAddressOwner   CUSTOMER CONTACT COMPANY
TeamRole             LEAD MEMBER
AutomationScope      += CRM
MemberLookupTarget   += CONTACT COMPANY DEAL CUSTOM     (LOOKUP ไปวัตถุกำหนดเองใช้ options.objectKey)
MemberSource         (เดิม 15 ค่า · ใช้ร่วม)
```

### 4.3 ตารางใหม่ (25 + core 2)

```prisma
// ── core (ของกลางทั้งแอป · tenant) — C2
model Team        { id tenantId name leadUserId? unitIds String[] color? description? archivedAt? createdAt updatedAt ; @@unique([tenantId, name]) @@index([tenantId, archivedAt]) }
model TeamMember  { id teamId userId role TeamRole @default(MEMBER) joinedAt ; @@unique([teamId, userId]) @@index([userId]) }

// ── ตัวตน
model CrmCompany {
  id tenantId systemId ; partyId String (บังคับ · Party kind=COMPANY) ; name ; legalName? ; taxId? ; branchCode? @default("00000") ; industry? ; size CrmCompanySize? ; website? ; emailDomain? (lowercase · จับคู่อีเมลเข้า) ; phone? ; email? ; lineOaId? ;
  lifecycleStage CrmLifecycleStage @default(LEAD) ; score Int @default(0) ; ownerUserId? ; teamId? ; parentCompanyId? ; accountContactId? (บัญชี) ; memberCustomerId? ; tags String[] ; note? ; logoFileId? ; annualRevenueSatang BigInt? ; employeeCount Int? ; foundedYear Int? ;
  lastActivityAt? ; openDealCount Int @default(0) ; wonValueSatang BigInt @default(0) ; outstandingSatang BigInt @default(0) (cache รายวัน) ; mergedIntoId? ; archivedAt? ; createdAt updatedAt ;
  @@unique([systemId, partyId]) @@index([systemId, taxId]) @@index([systemId, emailDomain]) @@index([systemId, ownerUserId]) @@index([systemId, teamId]) @@index([systemId, lifecycleStage]) @@index([systemId, name])
}
model CrmCompanyContact { id companyId contactId role CrmContactRole @default(OTHER) jobTitle? isPrimary Boolean @default(false) startedAt? endedAt? note? ; @@unique([companyId, contactId]) @@index([contactId]) }
model CrmDealContact    { id dealId contactId role CrmContactRole @default(OTHER) ; @@unique([dealId, contactId]) @@index([contactId]) }
model CrmDealLine       { id dealId productId? (InvItem) name qty Decimal(12,3) unitPriceSatang Int discountBp Int @default(0) vatRateBp Int? sortOrder note? ; @@index([dealId, sortOrder]) }
model CrmDealStageHistory { id dealId fromStageId? toStageId byUserId? bySource CrmActivitySource enteredAt leftAt? durationSec? note? ; @@index([dealId, enteredAt]) @@index([toStageId, enteredAt]) }
model CrmLostReason     { id tenantId systemId key label sortOrder active Boolean @default(true) isSystem Boolean @default(false) ; @@unique([systemId, key]) }

// ── คะแนน · มอบหมาย · อัตโนมัติ
model CrmScoreRule      { id tenantId systemId name event String (key จาก AUTOMATION_EVENTS) conditions Json? points Int expiresDays Int? maxPerDay Int? active Boolean @default(true) isSystem Boolean @default(false) sortOrder ; @@index([systemId, event]) }
model CrmScoreLog       { id tenantId contactId ruleId? points Int reason String refType? refId? expiresAt? expired Boolean @default(false) createdAt ; @@index([contactId, createdAt]) @@index([expiresAt, expired]) }
model CrmAssignmentRule { id tenantId systemId name conditions Json mode CrmAssignMode userIds String[] teamId? rrCursor Int @default(0) maxOpenPerUser Int? sortOrder active Boolean @default(true) stats Json? ; @@index([systemId, sortOrder]) }
model CrmSequence       { id tenantId systemId name description? stopOnReply Boolean @default(true) stopOnWon Boolean @default(true) stopOnLost Boolean @default(true) businessDaysOnly Boolean @default(true) sendWindow Json? ({from:"09:00",to:"18:00"}) maxActive Int? active Boolean @default(true) stats Json? createdById archivedAt? ; @@index([systemId, active]) }
model CrmSequenceStep   { id sequenceId index Int kind CrmSeqStepKind templateId? subject? body? (ตัวแปร {{contact.firstName}} …) waitDays Int? waitHours Int? taskTitle? taskType CrmActivityType? channel String? ; @@unique([sequenceId, index]) }
model CrmSequenceEnrollment { id tenantId sequenceId contactId dealId? enrolledById? enrolledBy String ("USER:"/"RULE:") stepIndex Int @default(0) nextAt? status CrmEnrollStatus @default(ACTIVE) stoppedReason? stoppedAt? stats Json? ; @@unique([sequenceId, contactId]) @@index([status, nextAt]) @@index([contactId]) }

// ── อีเมล (C4)
model CrmEmailMessage {
  id tenantId systemId ; contactId? ; companyId? ; dealId? ; direction CrmDirection ; messageId String @unique (RFC · ขาออก gen เอง) ; inReplyTo? ; references String[] ; threadKey String ;
  fromAddr fromName? toAddrs String[] ccAddrs String[] bccAddrs String[] subject bodyHtml? bodyText? snippet? (200) attachments Json? ({fileId,name,size,mime}[]) ;
  sentById? ; sentAt? ; receivedAt? ; scheduledAt? ; status CrmEmailStatus ; providerId? (Resend id) ; providerError? ;
  sequenceStepId? ; campaignId? ; templateId? ; trackToken String @unique ; openCount Int @default(0) clickCount Int @default(0) firstOpenedAt? lastOpenedAt? repliedAt? ;
  routing Json? ({replyTo, copyTo[], via:"SHARK"|"STAFF"|"PROVIDER"}) ; matchedBy String? ("EMAIL"|"DOMAIN"|"MANUAL"|"NONE") ; purgedAt? (PDPA retention) ;
  @@index([contactId, sentAt]) @@index([threadKey, sentAt]) @@index([systemId, direction, sentAt]) @@index([systemId, matchedBy]) @@index([scheduledAt, status])
}
model CrmEmailEvent    { id emailId kind CrmEmailEventKind url? userAgent? (ตัดสั้น) at ; @@index([emailId, at]) @@index([kind, at]) }
model CrmEmailTemplate { id tenantId systemId name subject bodyHtml category? (FOLLOW_UP/QUOTE/INTRO/RENEWAL) variables String[] active isSystem sortOrder ; @@unique([systemId, name]) }
model CrmEmailUserSetting { id tenantId systemId userId fromName? fromAddr? replyToMode String ("SHARK"|"SELF"|"CUSTOM") replyToAddr? copyToAddr? copyMode String ("NONE"|"IN"|"OUT"|"BOTH") signatureHtml? providerId? ; @@unique([systemId, userId]) }   // C4 ทับต่อผู้ใช้
model CrmMailProvider  { id tenantId systemId userId? kind String ("GMAIL"|"OUTLOOK"|"IMAP") status String tokenRef? lastSyncAt? ; @@unique([systemId, userId, kind]) }   // 🔜 โครงเท่านั้น

// ── ทีมขาย (C2/C3/C9)
model CrmVisibilityPolicy { id tenantId systemId role Role? teamId? pipelineId? entity String ("CONTACT"|"COMPANY"|"DEAL"|"ACTIVITY"|"REPORT") visibility CrmVisibility ; @@unique([systemId, role, teamId, pipelineId, entity]) }
model CrmQuota          { id tenantId systemId ownerType CrmQuotaOwner ownerId periodKey String (2569-10 · 2569-Q4 · 2569) targetSatang BigInt targetDeals Int? targetActivities Int? note? ; @@unique([systemId, ownerType, ownerId, periodKey]) }
model CrmCommissionRule { id tenantId systemId name basis CrmCommissionBasis @default(PAID) kind CrmCommissionKind config Json ({pctBp} | {fixedSatang} | {tiers:[{uptoSatang,pctBp}]}) pipelineId? teamId? productIds String[] minDealSatang? splitCollaboratorsBp Int @default(0) payoutDelayDays Int @default(0) active Boolean @default(true) sortOrder ; @@index([systemId, active]) }
model CrmCommission     { id tenantId systemId dealId ruleId userId amountSatang basisSatang basis CrmCommissionBasis status CrmCommissionStatus @default(PENDING) periodKey approvalRequestId? hrPayAdjustmentId? refType? ("INVOICE"|"POS_SALE") refId? reversedOfId? note? createdAt decidedAt? ; @@unique([dealId, ruleId, userId, refId]) @@index([userId, periodKey]) @@index([systemId, status]) }

// ── portal (C7)
model CrmPortalAccess   { id tenantId systemId companyId contactId role CrmPortalRole @default(VIEW) invitedById invitedAt acceptedAt? lastLoginAt? revokedAt? loginMethods String[] ; @@unique([companyId, contactId]) @@index([contactId]) }
model CrmPortalRequest  { id tenantId systemId companyId contactId kind CrmPortalRequestKind payload Json status String (PENDING/APPROVED/REJECTED) kanbanCardId? approvalRequestId? decidedById? decidedAt? createdAt ; @@index([companyId, status]) }

// ── ติดตาม (C6 + อีเมล)
model CrmTrackedLink    { id tenantId systemId code String @unique url name? campaignId? linkId? (AcquisitionLink) channel? clicks Int @default(0) uniqueClicks Int @default(0) active Boolean @default(true) expiresAt? createdById ; @@index([systemId, createdAt]) }
model CrmTrackedClick   { id linkId contactId? emailId? webSessionId? userAgent? at ; @@index([linkId, at]) }
model CrmWebSession     { id tenantId systemId visitorId String (cookie · uuid) contactId? consentVersion? consentAt? firstUrl? referrer? utm Json? userAgent? (ตัดสั้น) ipHash? (sha256+salt · ไม่เก็บ IP) startedAt lastSeenAt pageViews Int @default(0) identifiedBy? ("FORM"|"EMAIL_CLICK"|"PORTAL"|"LINK") purgedAt? ; @@index([systemId, visitorId]) @@index([contactId, startedAt]) @@index([lastSeenAt]) }
model CrmWebEvent       { id sessionId kind CrmWebEventKind url? title? durationSec? meta Json? at ; @@index([sessionId, at]) }

// ── วัตถุกำหนดเอง (C8)
model CustomObject      { id tenantId systemId key label labelPlural icon? parentType CustomParent @default(NONE) relation String @default("ONE_TO_MANY") titleFieldKey String showAsTab Boolean @default(true) portalVisible Boolean @default(false) allowAttachments Boolean @default(true) allowActivities Boolean @default(true) unitScoped Boolean @default(false) sortOrder templateKey? recordCount Int @default(0) archivedAt? createdAt ; @@unique([systemId, key]) }
model CustomRecord      { id tenantId systemId objectId parentType CustomParent parentId? partyId? title unitId? ownerUserId? createdById? status? (ค่าจากฟิลด์ SELECT ที่ตั้งเป็น "สถานะ") archivedAt? createdAt updatedAt ; @@index([objectId, parentId]) @@index([objectId, title]) @@index([partyId]) @@index([objectId, updatedAt]) }
model CustomRecordValue { id recordType CustomRecordType recordId fieldId valueText? valueNumber Decimal?(18,4) valueDate? valueBool? valueOptions String[] valueRef? valueFileId? updatedById? updatedAt ; @@unique([recordId, fieldId]) @@index([fieldId, valueText]) @@index([fieldId, valueNumber]) @@index([fieldId, valueDate]) @@index([fieldId, valueRef]) }
model CustomRecordValueHistory { id recordId fieldId oldValue Json? newValue Json? changedById? createdAt ; @@index([recordId, fieldId, createdAt]) }
```
- `CustomRecordValue` ใช้กับ ผู้ติดต่อ/บริษัท/ดีล (recordType) ด้วย → ฟิลด์กำหนดเองของ 3 ตัวตนมาตรฐานเก็บที่เดียว · ของสมาชิกยังอยู่ `MemberFieldValue`
- ทุกตารางลงทะเบียน `scope.ts` (F1): `Team/TeamMember` tenant · CRM ทั้งหมด sys · `CustomRecordValue/History` `CrmEmailEvent` `CrmTrackedClick` `CrmWebEvent` `CrmScoreLog` ผ่านแม่ (tenant)

### 4.4 ความสัมพันธ์สำคัญ (ห้ามเดินผิดทาง)
- `CrmContact.companyId` = cache ของ `CrmCompanyContact where isPrimary` — เขียนผ่าน `companies.setPrimary` เท่านั้น
- `CrmDeal.contactId` (เดิม) = ผู้ติดต่อหลัก · ผู้ติดต่อร่วมใน `CrmDealContact` · `companyId` ต้องเป็นบริษัทที่ผู้ติดต่อหลักสังกัด (หรือ null) — ตรวจตอนสร้าง/แก้
- `CrmDeal.kind` ยังคัดลอกจาก `stage.kind` (กติกาเดิม `dealStateForStage`) · ห้ามเซ็ตตรง
- `Party`: ผู้ติดต่อ → `safeFindOrCreate(kind PERSON)` · บริษัท → `findOrCreate(kind COMPANY, {taxId, name, email})` (จับคู่เลขภาษี → ชื่อ+โดเมน) · รวมบริษัท = party merge + ย้าย FK
- ไทม์ไลน์: ทุก consumer เขียน `MemberActivity` ด้วย `partyId` (+ crmContactId/companyId/dealId) → หน้า 360 ทุกชนิดอ่านจาก partyId · บริษัท 360 อ่าน union ของ partyId ผู้ติดต่อทุกคน + ของบริษัท

### 4.5 `AppSystem.settings.crm` (Json · ค่าเริ่มต้น)
```jsonc
{
  "lifecycleLabels": { "PROSPECT": "ผู้สนใจ (SQL)" },
  "visibility": { "STAFF": "TEAM", "MANAGER": "ALL" },                        // C9 (ทับต่อทีม/pipeline ที่ CrmVisibilityPolicy)
  "stale": { "defaultDays": 14, "warnDays": 7 },
  "scoring": { "hot": 50, "warm": 20, "decayDays": 30, "bandRecalcCron": "daily" },
  "assignment": { "fallbackUserId": null, "notifyChannel": "LINE" },
  "email": {                                                                    // C4
    "inboundKey": "a7k2m9xq", "inboundEnabled": true,
    "fromMode": "SHARK" | "DOMAIN",  "fromDomain": null, "fromName": "SIAM DIVE CENTER",
    "replyToMode": "SHARK" | "STAFF" | "CUSTOM", "replyToAddr": null,
    "copyToAddr": null, "copyMode": "NONE" | "IN" | "OUT" | "BOTH",
    "bccCaptureEnabled": true, "strangerToLead": true, "trackOpens": true, "trackClicks": true,
    "retentionDays": 730, "allowUserOverride": true
  },
  "tracking": { "web": { "enabled": false, "consentText": "...", "consentVersion": 1, "retentionDays": 180, "domains": [] }, "links": { "domain": "shark.in.th" } },   // C6
  "commission": { "basis": "PAID", "approvalRequired": true, "payrollLink": true },  // C3
  "portal": { "enabled": false, "loginMethods": ["EMAIL_OTP", "LINE"], "showDeals": false, "allowIssue": true, "issueBoardId": null },   // C7
  "activityOutcomes": { "CALL": ["สนใจ","รับสาย","ไม่รับ","ฝากข้อความ","เบอร์ผิด","ไม่สนใจ"], "MEETING": ["สำเร็จ","เลื่อน","ยกเลิก","ไม่มา"] },
  "targets": { "memberSystemId": null, "accountSystemId": null, "kanbanSystemId": null, "chatSystemId": null, "inventorySystemId": null },   // เลือกระบบปลายทางเมื่อร้านมีหลายระบบ (ภาพ 17)
  "ai": { "callTranscribe": true, "dealRisk": true, "emailDraft": true },
  "limits": { "objectsWarnAt": 30, "recordsWarnAt": 200000 }
}
```

### 4.6 ไมเกรชัน + backfill (C14)
1. `crm_v2_a` — enum/คอลัมน์ CrmContact/Deal/Activity/Stage/Pipeline · Team/TeamMember · CrmCompany/CompanyContact/DealContact/DealLine/StageHistory/LostReason · MemberSection/Field `objectKey` + unique ใหม่ · CustomObject/Record/Value/History · partyId ที่ยังขาด (C11) · index ทั้งหมด
2. `crm_v2_b` — Score/Assignment/Sequence/Email*/Tracked*/Web* · `crm_v2_c` — Visibility/Quota/Commission/Portal* (ตามเฟส)
3. backfill (`scripts/crm-backfill-*.mts` (แผน) · idempotent · ทีละร้าน · `--dry-run` ก่อน · prod ต้อง `ALLOW_PROD_BACKFILL=1`): `companies-from-text` (CrmContact.company → CrmCompany ผ่าน party COMPANY · จับคู่ชื่อ normalize · เก็บ mapping) · `stage-history-seed` · `party-links` (Appointment/ShopOrder/… ที่มีเบอร์/อีเมล) · `contact-name-split` · `lost-reasons-seed` (5 ค่าระบบ) · `score-rules-seed` (8) · `visibility-default`
4. Vercel build รัน `prisma migrate deploy` เอง · migration additive ล้วน · ตรวจ `_prisma_migrations` prod หลัง push

---

## 5. Service API (ไฟล์ · ฟังก์ชัน · กติกา)

### 5.1 กติกาโครงไฟล์
- `src/lib/modules/crm/` เป็นเจ้าของ: contacts · companies · deals (+lines · stage history · forecast) · activities (+calendar) · emails (+routing · inbound match · tracking) · sequences · assignment · scoring · lost reasons · quotas · commissions · visibility · portal · tracking (links · web) · objects (custom) · reports · templates · settings
- **ของกลางย้ายไป core**: `teams.ts` (แผน · src/lib/core/) (Team CRUD · `teamsOf(userId)` · `unitIdsOf(team)`) — CRM/สมาชิก/บอร์ดงานเรียกได้
- ฟิลด์กำหนดเองของ contact/company/deal/custom: เรียก engine สมาชิก `member/fields.ts` (มีแล้ว M1.2) ผ่าน facade `member/index.ts` (`fields.layout(objectKey)` · `fields.validate(objectKey, values)` · `fields.filterWhere(objectKey, filters)` — เพิ่ม param `objectKey` และ adapter เขียนค่าไป `CustomRecordValue` เมื่อ objectKey ≠ customer) — ใบ C1.2
- **ห้าม import ข้ามโมดูลตรง** — facade เท่านั้น · F2 `ALLOWED_EDGES` เพิ่ม: `crm→party` · `crm→member(fields, briefFor, linkIdentity, createMember)` · `crm→account(createExternalQuotation, createInvoiceFromLines, listDocsByParty, paymentLinkFor)` · `crm→kanban(createCardFromExternal)` · `crm→chat(sendLine, listConversationsByParty)` · `crm→hr(employeeOf, createPayAdjustment)` · `crm→approval` · `crm→forms(read)` · `crm→inventory(items)` · `crm→storage` · `crm→ai` · `member→crm(briefFor)` · `forms→crm(ผ่าน event เท่านั้น — ตัด import ตรงเดิม)` · `chat→crm(briefFor, quickActions)` · `account→crm(dealFor)` · `kanban→crm(dealFor)`
- consumer ข้ามหลายโมดูลอยู่ composition root `crm-bridges.ts` (แผน · src/lib/platform/) (เข้า) · `crm-outbound.ts` (ออก: แจ้งเตือน/LINE/อีเมล/push)
- ทุก mutation: `ctx {tenantId, systemId, actorUserId|null}` + `actor` (สิทธิ์ + ทีม + การมองเห็น) + `idempotencyKey` เมื่อสร้างมูลค่า (คอมมิชชัน · อีเมล · คะแนน) · รับ `tx?` · emit outbox ใน tx · `visibleWhere(actor, entity)` ทุก read
- ไม่มี `any` · zod v4 · error ไทยไม่โทษผู้ใช้ · วันไทย +07:00 · เงินสตางค์

### 5.2 `contacts.ts` (แผน · crm/)
| ฟังก์ชัน | ทำอะไร | สิทธิ์ | event |
|---|---|---|---|
| `createContact(ctx, actor, input{firstName,lastName?,phone?,email?,companyId?|companyNew?,jobTitle?,role?,sourceKind,sourceDetail,fields{},tags,ownerUserId?|auto,consents?})` | ตรวจซ้ำ (เบอร์/อีเมล ผ่าน party + `CrmContact` ในระบบ) → `duplicate?` · party PERSON · บริษัท (lookup/สร้าง) + `CrmCompanyContact` · ฟิลด์ (engine objectKey=contact) · มอบหมาย (`assignment.pick`) · คะแนนเริ่มต้น (`scoring.onEvent crm.contact.created`) | `crm.contact.create` | `crm.contact.created` (+ `.assigned`) |
| `updateContact(ctx, actor, id, patch)` | ฟิลด์ระบบ+กำหนดเอง · history · sync ชื่อ/อีเมล → Party (`party.updateContactInfo`) · เปลี่ยนบริษัทหลัก → `companies.setPrimary` | `crm.contact.update` | `crm.contact.updated` |
| `getContact360(ctx, actor, id)` | DTO: หัว · คะแนน+เหตุผล 3 ล่าสุด · บริษัท/บทบาท · ฟิลด์ตามเลย์เอาต์ · การเชื่อมต่อ (สมาชิก brief · แชท · บัญชี · ดีลเปิด) · ไทม์ไลน์ (partyId) · sequence · consent | read | — |
| `listContacts(ctx, actor, {q, stage, leadStatus, owner, team, scoreBand, source, companyId, f.{key}, savedViewId, sort, page})` | `visibleWhere` + ฟิลด์กำหนดเอง (`fields.filterWhere("contact")`) · cursor | read | — |
| `convertContact(ctx, actor, id, {member?:{systemId, welcome?}, company?:{id|new}, deal?:{pipelineId, stageId?, title, valueSatang?}})` | tx เดียว: สมาชิก (`member.createMember` source CRM · ผูก memberCustomerId) · บริษัท · ดีล · lifecycle → PROSPECT/CUSTOMER ตามตั้งค่า · `convertedAt` | `crm.contact.convert` | `crm.contact.converted` (+ deal.created) |
| `assignContact(ctx, actor, id, {userId|teamId|rule})` · `bulkAssign` | บันทึก assignedBy · ตรวจ visibility ผู้รับ | `crm.contact.update` (`reassign` ถ้าข้ามทีม) | `crm.contact.assigned` |
| `setLeadStatus` · `setLifecycle` (`canAdvanceLifecycle` เดิม + CHURNED) · `setTags` · `setOptOut` · `archive` | — | update | `crm.contact.updated` |
| `findDuplicates(ctx, actor)` · `mergeContacts(ctx, actor, {keepId, mergeId, fieldChoices})` | เบอร์/อีเมล/ชื่อคล้าย (party) · ย้าย ดีล/กิจกรรม/อีเมล/บทบาทบริษัท/portal/score log · `mergedIntoId` · party merge | `crm.contact.merge` | `crm.contact.merged` |
| `importContacts(ctx, actor, {rows, mapping, options{onDuplicate, source, assignRuleId, companyColumn}})` (async job) | จับคู่คอลัมน์ → ฟิลด์ (รวมกำหนดเอง) · บริษัทจากคอลัมน์ (สร้าง/ผูก) · ซ้ำ update/skip/candidate | `crm.contact.import` | `crm.contact.created` ต่อแถว (batched) |
| `exportContacts` · `briefFor(ctx, {partyId|contactId})` (facade ให้แชท/สมาชิก/บัญชี) | — | read/export | — |

### 5.3 `companies.ts` (แผน · crm/)
| ฟังก์ชัน | ทำอะไร | สิทธิ์ | event |
|---|---|---|---|
| `createCompany(ctx, actor, {name, taxId?, branchCode?, emailDomain?, industry?, size?, website?, phone?, email?, address?, ownerUserId?, teamId?, parentCompanyId?, fields{}})` | party COMPANY (จับคู่เลขภาษี → ชื่อ+โดเมน · ถ้าพบ Party ที่มี AccountContact อยู่แล้ว → ผูก `accountContactId`) · ฟิลด์ objectKey=company | `crm.company.create` | `crm.company.created` |
| `updateCompany` · `archiveCompany` · `setOwner` · `setParent` | sync ชื่อ/เลขภาษี → Party + AccountContact (ผ่าน facade บัญชี `syncContactFromParty`) | `crm.company.update` | `crm.company.updated` |
| `getCompany360(ctx, actor, id)` | ตัวเลข 5 (ดีลเปิด · ชนะสะสม · มูลค่ารวม · ค้างชำระ (บัญชี `outstandingByContact`) · กิจกรรมล่าสุด) · ผู้ติดต่อ+บทบาท · ดีล · เอกสารบัญชี · วัตถุ · ไทม์ไลน์ union · portal · บริษัทในเครือ | read | — |
| `listCompanies(ctx, actor, {q, stage, owner, team, industry, size, f.{key}, hasOpenDeals, outstanding, sort, page})` | visibleWhere | read | — |
| `addContact(ctx, actor, companyId, {contactId|contactNew, role, jobTitle, isPrimary})` · `removeContact` · `setPrimary` · `setRole` | primary 1 คน · endedAt เมื่อถอด · cache contact.companyId | `crm.company.update` | `crm.company.updated` |
| `findDuplicates` (เลขภาษี/โดเมน/ชื่อคล้าย) · `mergeCompanies` | ย้ายผู้ติดต่อ/ดีล/เอกสาร/portal/วัตถุ · party merge | `crm.company.merge` | `crm.company.merged` |
| `importCompanies` · `importFromAccount(ctx, actor, {accountContactIds[]})` (นำเข้าจากบัญชี legalType=COMPANY) | — | import | created |
| `recomputeCaches(ctx, companyId)` (cron รายวัน + หลัง event) | openDealCount/wonValue/outstanding | ระบบ | — |

### 5.4 `deals.ts` (แผน · crm/)
| ฟังก์ชัน | ทำอะไร | สิทธิ์ | event |
|---|---|---|---|
| `createDeal(ctx, actor, {pipelineId, stageId?, title, contactId, companyId?, valueSatang?|lines[], expectedCloseAt?, ownerUserId?, collaboratorUserIds?, forecastCategory?, sourceKind?, sourceDetail?, fields{}, tags})` | ตรวจ contact↔company · ขั้นแรกของ pipeline ถ้าไม่ระบุ · `CrmDealStageHistory` แถวแรก · มูลค่าจากบรรทัดถ้ามี · ทีม = ทีมของผู้ดูแล | `crm.deal.create` | `crm.deal.created` |
| `moveDeal(ctx, actor, id, {stageId, note?, lostReasonId?, requireFieldsValues?})` | ตรวจ `requireFields/requireLines/requireQuotation` ของขั้นปลายทาง → `STAGE_REQUIREMENTS` (คืนรายการที่ขาด) · LOST ต้องมี lostReasonId · WON → `closedAt` · ปิด history แถวเดิม (leftAt/durationSec) เปิดแถวใหม่ · `stageEnteredAt` · ล้าง `stalledAt` · `kind` จาก stage (กติกาเดิม) · lifecycle ผู้ติดต่อ (เดิม `lifecycleAfterDealWon`) | `crm.deal.move` | `crm.deal.stage.changed` (+ `.won` / `.lost`) |
| `reopenDeal` · `reassignDeal(ctx, actor, id, {ownerUserId, teamId?})` · `setForecastCategory` · `setNextStep` · `setCollaborators` · `updateDeal` (ฟิลด์ระบบ+กำหนดเอง) · `archive` | reassign ข้ามทีมต้อง `crm.deal.reassign` | ตามคีย์ | `crm.deal.reopened` / `.reassigned` / `.updated` |
| `lines.set(ctx, actor, dealId, lines[])` · `lines.fromQuotation(docId)` | คำนวณ valueSatang = Σ(qty×unit×(1−discount)) (+VAT ตามตั้งค่าแสดง) · ส่วนลดรวม > `crm._maxDealDiscountBp` → approval | `crm.deal.lines` | `crm.deal.updated` |
| `issueQuotation(ctx, actor, dealId, {validDays?, note?})` (ขยายของเดิม) | ส่ง lines → `account.createExternalQuotation({partyId, contactId(บัญชี), lines[], ...})` · เก็บ `quotationDocId` · กิจกรรม AUTO · ถ้าไม่มี lines → ใบว่างแบบเดิม | `crm.deal.quote` | `crm.deal.updated` |
| `issueInvoice(ctx, actor, dealId)` · auto เมื่อ `pipeline.autoInvoiceOnWon` | `account.createInvoiceFromLines` / `convertQuotation` · เก็บ `invoiceDocId` | `crm.deal.quote` | — |
| `getDeal360` · `listDeals({pipeline, view, owner, team, stage, close range, stale, tag, f.{key}, q, saved, sort, page})` · `getBoard(pipelineId)` (ต่อคอลัมน์: count/sum/weighted · การ์ด DTO) · `forecast({period, groupBy: month|owner|team, category})` (ถ่วงน้ำหนัก = Σ value × (probabilityOverride ?? stage.probability) · ต่อหมวด) | visibleWhere ทุกตัว | read | — |
| `markStale(ctx)` (cron 06:00 ไทย) | ดีล OPEN ที่ `lastActivityAt < now − stage.staleDays ?? settings.stale.defaultDays` → `stalledAt` + emit (ครั้งเดียวจนกว่าจะมีกิจกรรม) | ระบบ | `crm.deal.stale` |
| `recordPayment(ctx, {dealId, refType, refId, satang})` (consumer) | `paidSatang` · `wonValueSatang` · lifecycle CUSTOMER · คอมมิชชัน (ฐาน PAID) | ระบบ | — |

### 5.5 `activities.ts` (แผน · crm/) + ปฏิทิน
| ฟังก์ชัน | ทำอะไร | สิทธิ์ | event |
|---|---|---|---|
| `logActivity(ctx, actor, {type, direction?, channel?, contactId?, companyId?, dealId?, customRecordId?, title, body?, startAt?, endAt?, durationSec?, outcome?, recordingFileId?, attendees?, location?, dueAt?, remindAt?, done?, nextTask?:{type,title,dueAt}})` | ตรวจ outcome ตามชนิด · `lastActivityAt` ของ contact/deal/company (ล้าง stale) · งานถัดไปสร้างเป็นกิจกรรม TASK ผูกเดียวกัน · ไฟล์เสียง → คิว AI (`ai.transcribeAndSummarize` → proposal เติม transcript/aiSummary/aiNextStep) | `crm.activity.create` | `crm.activity.logged` |
| `completeActivity` (เดิม) · `rescheduleActivity` · `deleteActivity` (MANAGER+/เจ้าของ) · `updateActivity` | — | `crm.activity.complete/delete` | `crm.activity.completed` |
| `listActivities({owner|team|mine, status: pending|today|week|overdue|done, type, contactId, dealId, companyId, from, to})` · `calendar({from, to, team?, mine?})` (รวมนัดจากโมดูลจอง/คลินิก/โรงเรียน ผ่าน facade `appointmentsByParty` อ่านอย่างเดียว) | visibleWhere | read | — |
| `markOverdue(ctx)` (cron รายชั่วโมง) · `remind(ctx)` (cron 5 นาที · push/LINE ตาม remindAt) | — | ระบบ | `crm.activity.overdue` |
| `fromChat(ctx, {conversationId, summary})` (consumer `chat.conversation.status` RESOLVED + สรุป AI) · `fromEmail` · `fromWeb` · `fromPortal` | กิจกรรม AUTO ตามแหล่ง · dedupe ด้วย `sourceRef` | ระบบ | `crm.activity.logged` |
| `callProvider.webhook(payload)` (🔜 adapter) | สายเข้า/ออกจาก PBX → กิจกรรม CALL AUTO | — | — |

### 5.6 `emails.ts` (แผน · crm/) (C4)
| ฟังก์ชัน | ทำอะไร | สิทธิ์ | event |
|---|---|---|---|
| `resolveRouting(ctx, actor)` | รวม settings.email + `CrmEmailUserSetting` ของผู้ส่ง → `{fromName, fromAddr, replyTo, copyTo[], via}` · fromAddr = `{slug}@shark.in.th` หรือโดเมนร้านที่ยืนยันกับ Resend แล้ว (ตรวจ `EmailDomain` (แผน) status VERIFIED) · Reply-To SHARK = `crm+{key}@shark.in.th` (เพิ่ม `+t{contactShort}` ใน local part สำหรับ threading fallback) | read | — |
| `sendEmail(ctx, actor, {contactId, dealId?, to[], cc[], subject, bodyHtml|templateId+vars, attachments[], scheduledAt?, sequenceStepId?})` | ตรวจ optOut/bounced → `EMAIL_BLOCKED` · แทรก pixel + แทนลิงก์เป็น `/t/c/{token}` (ตามสวิตช์) · ใส่ `List-Unsubscribe` + ลิงก์ยกเลิกรับ · headers `Message-ID` (gen) `In-Reply-To/References` ถ้าตอบ thread · ส่งผ่าน `core/email.sendEmail` ขยาย (html · attachments · headers · replyTo · from) · สำเนาไป `copyTo` (OUT) · เก็บ `CrmEmailMessage` OUT + กิจกรรม EMAIL OUT · scheduledAt → คิว cron | `crm.email.send` | `crm.email.sent` |
| `ingestInbound(payload)` (route K3.9 `/api/email/inbound` แยก prefix `crm+`) | gate: secret → prefix → ระบบ CRM จาก key → dedupe messageId · **จับคู่**: `From`/`Reply-To` → ผู้ติดต่อ (อีเมล → Party → CrmContact ในระบบ) → โดเมน → `CrmCompany.emailDomain` (matchedBy) → ไม่พบ + `strangerToLead` → lead ใหม่ (source EMAIL) · ผู้ส่งเป็นพนักงาน (User.email/`CrmEmailUserSetting.fromAddr`) = OUT (BCC capture) · thread: `In-Reply-To/References` → threadKey · fallback: `+t…` ใน To · fallback: subject normalize + ผู้ติดต่อเดียวกันใน 30 วัน · แนบไฟล์ผ่าน storage (≤20 · ≤10MB) · สำเนาไป `copyTo` (IN) · หยุด sequence (`stopOnReply`) · กิจกรรม EMAIL IN · ตอบ 200 เสมอหลัง gate 1–3 | ระบบ | `crm.email.received` (+ `.replied` ถ้า thread มี OUT) |
| `track.open(token)` → gif 1×1 · `track.click(token)` → 302 | เขียน `CrmEmailEvent` · นับ · `firstOpenedAt` · bot filter (UA · เปิดใน 2 วิหลังส่ง = ไม่นับ) · แคมเปญสมาชิก (`MktRecipient.emailMessageId`) อัปเดต openedAt | public | `crm.email.opened` / `.clicked` |
| `providerWebhook(resend payload)` | delivered/bounced/complained → status · `emailBouncedAt` บนผู้ติดต่อ · หยุด sequence | public (ลายเซ็น) | `crm.email.bounced` |
| `listThreads({contactId|companyId|dealId|unmatched, q, page})` · `getThread(threadKey)` · `attachToContact(emailId, contactId)` (จับคู่มือ) · `templates.*` · `userSetting.get/set` · `settings.rotateInboundKey` · `sendTest` | — | `crm.email.read` / settings | — |

### 5.7 `sequences.ts` · `assignment.ts` · `scoring.ts` · `tracking.ts` (แผน · crm/)
| ไฟล์ | ฟังก์ชันหลัก |
|---|---|
| `sequences.ts` | `create/update/archive` · `enroll(ctx, actor, {sequenceId, contactId, dealId?})` (1 คน 1 sequence ACTIVE · ข้าม optOut) · `stop(enrollmentId, reason)` · `pause/resume` · `runDue(ctx)` (cron 5 นาที: หยิบ `nextAt ≤ now` ACTIVE → ทำขั้น: EMAIL→`emails.sendEmail` · LINE→`chat.sendLine` (ต้องมี identity+consent) · TASK→`activities.logActivity(TASK)` · WAIT→คำนวณ nextAt (วันทำการ+sendWindow) · SMS→provider ถ้ามี) → ขั้นถัดไป/DONE · สถิติต่อขั้น) · หยุดอัตโนมัติจาก consumer (`crm.email.replied` · `chat.message.received` ของ Party · `crm.deal.won/lost` · optOut) |
| `assignment.ts` | `pick(ctx, {contactDraft}) → {userId, teamId, ruleId}` (ไล่กฎตามลำดับ · เงื่อนไข: sourceKind/sourceChannel/จังหวัด (Party address)/สินค้าที่สนใจ (field)/ขนาดบริษัท/ภาษา/ฟิลด์กำหนดเอง · โหมด FIXED/ROUND_ROBIN (rrCursor atomic UPDATE … RETURNING)/TEAM_LEAD/LEAST_OPEN (นับดีล OPEN ต่อคน)) · `maxOpenPerUser` ข้ามคนเต็ม · fallback settings · `rules.*` CRUD · `simulate(rows)` |
| `scoring.ts` | `onEvent(ctx, eventType, payload)` (consumer ของทุก event ที่ CrmScoreRule อ้าง · เงื่อนไข · `maxPerDay` · เขียน `CrmScoreLog` · อัปเดต `score/scoreBand` · ข้าม threshold → emit) · `decay(ctx)` (cron รายวัน: ล็อกที่ `expiresAt < now` → expired · คำนวณใหม่) · `explain(contactId)` (เหตุผล 3 ล่าสุด) · `rules.*` CRUD + seed 8 ระบบ · `recompute(contactId)` |
| `tracking.ts` | `links.create/list/stats` · `links.click(code, ctx)` → 302 + `CrmTrackedClick` (+ผูก visitor/contact ถ้ามี) · **web (C6)**: `script.js` (serve `/t/s/{systemKey}.js` · โหลด consent banner ถ้ายังไม่ยินยอม · `sd('page')`/`sd('identify')`/`sd('event')`) · `collect(payload)` (`POST /t/e` · ตรวจโดเมนอนุญาต · ไม่มี consent = 204 ไม่บันทึก · visitorId cookie 1st-party 180 วัน) · `identify(visitorId, contactId, by)` (จากฟอร์ม/คลิกอีเมล/portal login → ผูกย้อนหลัง session ทั้งหมดของ visitor + กิจกรรม WEB สรุปต่อวัน + คะแนน) · `purge(ctx)` (cron รายวัน · retentionDays) · `consent.record(visitorId, version)` · `stats` |

### 5.8 `objects.ts` (แผน · crm/) (C8)
| ฟังก์ชัน | ทำอะไร |
|---|---|
| `create(ctx, actor, {key, label, labelPlural, icon, parentType, titleFieldKey, showAsTab, portalVisible, templateKey?})` | สร้าง `CustomObject` + ส่วน/ฟิลด์เริ่มต้นผ่าน engine สมาชิก (`fields.applyTemplate(objectKey=key, template)`) · ไม่มีเพดานจำนวน (เตือนที่ 30) · key unique · ลงทะเบียน op/tool แบบ dynamic (`objects.{key}.records.*` resolve ตอน dispatch) |
| `update` · `archive` (ต้องไม่มีรายการ หรือยืนยันชื่อ → เก็บถาวรทั้งหมด) · `reorder` · `list` |
| `records.create(ctx, actor, objectKey, {parentId?, title?, values{}, unitId?, ownerUserId?})` · `update` · `archive` · `get` · `list({parentId?, q, f.{key}, saved, sort, page})` · `move(recordId, newParentId)` · `bulk` · `import/export` | ตรวจ parentType ตรง · title จาก `titleFieldKey` ถ้าไม่ส่ง · ค่าใน `CustomRecordValue` (engine) · history · partyId = ของแม่ · unit scope ถ้า `unitScoped` · `recordCount` cache |
| `tabsFor(parentType, parentId)` (ให้หน้า 360 ทุกชนิด) · `timelineFor(recordId)` · `attachments` · `activitiesFor` |
| ใช้ในกฎ/segment: `conditions` รองรับ `o.{objectKey}.{fieldKey}` + `exists/count` (join ผ่าน parentId) · trigger `custom.record.*` |

### 5.9 `teams` (core) · `visibility.ts` · `quotas.ts` · `commissions.ts` · `portal.ts` · `reports.ts` (แผน · crm/)
| ไฟล์ | ฟังก์ชันหลัก |
|---|---|
| `teams.ts` (core) | `create/update/archive` · `addMember/removeMember/setLead` · `teamsOf(userId)` · `membersOf(teamId)` · `unitIdsOf(teamId)` · `list` — event `team.updated` · ใช้ที่ `/app/settings/teams` (ภาพ 10 ซ้ายบน) · สมาชิก `MemberSavedView.scope=TEAM` อ่าน `teamId` |
| `visibility.ts` | `resolve(actor, entity) → OWN|TEAM|ALL` (ลำดับ: policy ต่อ pipeline+ทีม → ต่อทีม → ต่อบทบาท → settings → ค่าเริ่มต้น C9 · OWNER=ALL เสมอ) · `visibleWhere(actor, entity, {pipelineId?})` (OWN: owner=me OR collaborators has me · TEAM: teamId ∈ teamsOf(me) OR owner ∈ membersOf · ALL: unit scope เดิม) · `canSee(actor, row)` → 404-not-403 · `policies.*` CRUD |
| `quotas.ts` | `set/list` · `progress({ownerType, ownerId, periodKey}) → {won, paid, deals, activities, pct}` (คำนวณจาก ledger: StageHistory WON + CrmCommission basis + Activity) · `checkReached(ctx)` (consumer หลัง won/paid) → `crm.quota.reached` ครั้งเดียว/งวด |
| `commissions.ts` | `rules.*` · `onPaid(ctx, {dealId, refType, refId, satang})` / `onWon` (consumer ตาม basis) → ไล่กฎที่ตรง (pipeline/team/product) → คำนวณ (PCT/FIXED/TIERED) → แบ่งผู้ร่วม `splitCollaboratorsBp` → `CrmCommission` PENDING (idempotent unique) → ถ้า `approvalRequired` → `approval.submit(entityType CRM_COMMISSION)` · `approve/reject` (consumer `approval.request.*` หรือมือ `crm.commission.approve` ≤ `crm._maxCommissionApproveSatang`) → APPROVED → `hr.createPayAdjustment(kind COMMISSION, userId→HrEmployee.linkedUserId, periodKey, amount)` → PAID เมื่อ payroll run PAID (consumer `hr.payroll.paid` (ใหม่ในโมดูล HR · ใบ C3.3)) · `reverse(ctx, {refId})` (consumer `account.document.voided`/`pos.sale.voided`) → แถว REVERSED ติดลบ + ถ้า APPROVED แล้วสร้าง adjustment ติดลบงวดถัดไป · `report({period, user|team})` |
| `portal.ts` (C7) | `invite(ctx, actor, {companyId, contactId, role})` → อีเมล/LINE ลิงก์ · `login` ผ่าน `platform_auth` (EMAIL_OTP / LINE) → session ลูกค้า (แยกจากพนักงาน) · `me()` · `quotations.list/get/respond({accept|reject, reason})` → `account.respondQuotation` (มีแล้ว → `account.quotation.responded`) · `invoices.list/get` · `payLink(docId)` → `account.paymentLinkFor` · `uploadSlip` · `receipts.list` · `documents.list` (ไฟล์แชร์ + `CustomRecord` ของวัตถุ `portalVisible` ผูกบริษัท) · `requests.create({kind, payload})` → `CrmPortalRequest` + การ์ดบอร์ดงาน (`settings.portal.issueBoardId`) หรือ approval (CONTACT_CHANGE/PROFILE_CHANGE) · `contacts.list` · `access.list/revoke` · ทุก op ตรวจ `CrmPortalAccess` + `company ∈ ของฉัน` + เอกสาร `contactId ∈ AccountContact ของบริษัท` |
| `reports.ts` | `overview` · `forecast({period, groupBy, category, pipeline, team})` · `funnel({pipeline, from, to})` (จาก StageHistory: เข้า/ออกต่อขั้น · conversion = ไปขั้นถัดไป/เข้า · วันเฉลี่ย) · `reps({period, team})` (won/value/quota/commission/activities) · `activities({period, team})` · `lostReasons` · `sources({period})` (lead→deal→won→value ต่อ sourceKind/linkId/campaignId + ต้นทุนแคมเปญถ้ามี → ROI) · `scores` · `export(tab, filters)` (CSV async) · `schedule(tab, cron, emails[])` (ใช้ `ReportDef` + cron รายงานของบัญชี) |

---

## 6. สิทธิ์ v2

### 6.1 คีย์สิทธิ์ (เพิ่มใน `src/lib/core/permissions.ts` กลุ่ม crm — แทน 6 คีย์เดิม · คีย์เดิมคงไว้เป็น alias)
```
crm.contact.read · crm.contact.create · crm.contact.update · crm.contact.delete · crm.contact.convert · crm.contact.import · crm.contact.export · crm.contact.merge
crm.company.read · crm.company.create · crm.company.update · crm.company.delete · crm.company.merge
crm.deal.read · crm.deal.create · crm.deal.update · crm.deal.move · crm.deal.delete · crm.deal.quote · crm.deal.reassign · crm.deal.lines · crm.deal.forecast (ตั้ง commit/best case ของตัวเอง)
crm.activity.read · crm.activity.create · crm.activity.complete · crm.activity.delete
crm.email.read · crm.email.send · crm.email.settings
crm.sequence.manage · crm.sequence.enroll · crm.automation.manage · crm.score.manage · crm.assignment.manage
crm.object.manage · crm.record.read · crm.record.create · crm.record.update · crm.record.delete
crm.team.manage (= core `team.manage`) · crm.visibility.manage · crm.quota.manage · crm.commission.view · crm.commission.approve
crm.report.view · crm.report.team (เห็นรายงานทั้งทีม) · crm.report.all
crm.tracking.manage · crm.portal.manage · crm.settings.manage · crm.api.manage
PERMISSION_PARAMS: crm._maxDealDiscountBp (ค่าเริ่มต้น 1000 = 10%) · crm._maxCommissionApproveSatang · crm._maxReassignPerDay
```
- read-โดยนัย: มีคีย์ `crm.*` ใดก็ได้ = `crm.contact.read` + `crm.deal.read` + `crm.activity.read` (บทเรียน K3.1)
- OWNER ทุกคีย์ · MANAGER ค่าเริ่มต้น: ทุกคีย์ยกเว้น settings/api/object.manage/visibility.manage/team.manage/commission.approve เกินเพดาน · STAFF ค่าเริ่มต้น: contact/company/deal read+create+update (ในขอบเขต TEAM) · deal.move · deal.lines (≤ เพดานส่วนลด) · deal.quote · activity.* · email.send/read · sequence.enroll · record.read/create/update · report.view (ของตัวเอง)
- คีย์เดิม `crm.contact.create` `crm.deal.create` `crm.deal.move` `crm.deal.quote` `crm.activity.create` `crm.activity.complete` = ชื่อเดียวกัน ใช้ต่อได้ทันที

### 6.2 การมองเห็น (C9 — ซ้อนบนคีย์)
| บทบาท | ผู้ติดต่อ/บริษัท | ดีล | กิจกรรม | รายงาน |
|---|---|---|---|---|
| STAFF (ค่าเริ่มต้น) | TEAM | TEAM | OWN (+ทีมอ่านได้ถ้า policy) | ของตัวเอง |
| หัวหน้าทีม (TeamMember.role=LEAD) | TEAM | TEAM | TEAM | ทีม |
| MANAGER | ALL (สาขาที่มีสิทธิ์) | ALL | TEAM/ALL | ALL |
| OWNER | ALL | ALL | ALL | ALL |
| API key | ตาม bundle + ตัวกรอง `ownerUserId`/`teamId` ของคีย์ (ตั้งได้) | | | |
| portal | เฉพาะบริษัทตน (เอกสาร/คำขอ) · ไม่เห็นดีล (`settings.portal.showDeals=false`) | | | |
- ตั้งทับได้ต่อ บทบาท × ทีม × pipeline × เอนทิตี (`CrmVisibilityPolicy`) — เช่น pipeline "ลูกค้าองค์กร" ให้ทีมกรุงเทพ ALL
- `visibleWhere` ใช้ทั้ง UI/REST/AI/รายงาน/แจ้งเตือน (ไม่แจ้งเรื่องดีลที่มองไม่เห็น) · มองไม่เห็น = 404 · เห็นแต่ไม่มีคีย์ = 403 พร้อมข้อความไทย
- โอนดีล/ผู้ติดต่อข้ามทีม: `crm.deal.reassign` · เกิน `_maxReassignPerDay` → approval · บันทึก `crm.deal.reassigned`

### 6.3 ตาราง action × role (ตัวอย่างสำคัญ)
| action | STAFF | หัวหน้าทีม | MANAGER | OWNER | portal | API |
|---|---|---|---|---|---|---|
| สร้าง lead/บริษัท/ดีล | ✓ | ✓ | ✓ | ✓ | ✗ (แจ้งเรื่องได้) | operate |
| ย้ายขั้น | ของตัวเอง/ทีม | ทีม | ✓ | ✓ | ✗ (ตอบรับใบเสนอราคา → กฎย้ายให้) | operate |
| ส่วนลดในรายการสินค้า | ≤ 10% | ≤ 20% (ตั้งได้) | ✓ | ✓ | ✗ | operate (≤ เพดาน) |
| ออกใบเสนอราคา/ใบแจ้งหนี้ | ✓ (บัญชีตรวจสิทธิ์ `account.doc.create` ด้วย) | ✓ | ✓ | ✓ | ✗ | operate |
| โอนดีลข้ามทีม | ✗ | ✓ (ออกจากทีมตน) | ✓ | ✓ | ✗ | admin |
| ส่งอีเมล/LINE จาก CRM | ✓ (ตาม routing ของตน) | ✓ | ✓ | ✓ | ✗ | operate |
| ลงทะเบียน sequence · แก้ sequence/กฎ | ลงทะเบียน | ลงทะเบียน | ✓ | ✓ | ✗ | operate / admin |
| อนุมัติคอมมิชชัน | ✗ | ✗ | ≤ เพดาน | ✓ | ✗ | ✗ |
| ตั้งค่า: pipeline/ขั้น/คะแนน/มอบหมาย/อีเมล/tracking/วัตถุ/portal/การมองเห็น | ✗ | ✗ | บางส่วน (pipeline/ขั้น/เหตุผลแพ้) | ✓ | ✗ | admin |
| ลบ/รวม/ส่งออก | ✗ | ✗ | รวม/ส่งออก | ✓ | ✗ | admin |
| ดูข้อมูลอ่อนไหวของสมาชิกในหน้า 360 | ตาม policy สมาชิก (D8/D17) | | | | ✗ | ✗ |

### 6.4 กติกา 404-not-403 · AuditLog · portal
- ทุก mutation `writeAudit()` แบบบัญชี (action `crm.<entity>.<verb>` · before/after ย่อ) · REST เพิ่ม `crm.api.<opId>`
- portal: session ลูกค้า (`platform_auth`) แยก · ทุก op `/p/*` ตรวจ `CrmPortalAccess` (ไม่ revoked) + บริษัทตรง + เอกสารของบริษัท · rate limit OTP · ลิงก์เชิญหมดอายุ 7 วัน · การดูเอกสาร → `crm.portal.viewed` (ไม่ spam: ครั้งแรก/วัน)
- tracking public endpoints ไม่มี auth แต่ตรวจ token/โดเมน · ไม่คืนข้อมูลใด ๆ นอกจาก gif/302/204

---

## 7. เหตุการณ์ · กฎอัตโนมัติ · แจ้งเตือน · cron

### 7.1 Outbox events (ใหม่ 26 · ลง consumer + AUTOMATION_EVENTS + WEBHOOK_EVENTS พร้อมกันทุกตัว · composition root `crm-bridges.ts` / `crm-outbound.ts`)
| event | payload | emit จาก | consumer (ผลข้างเคียง) |
|---|---|---|---|
| `crm.contact.created` | {contactId, partyId, sourceKind, sourceChannel, sourceDetail, ownerUserId, teamId, companyId?} | contacts.create/import/inbound email/chat/form | scoring · แจ้งผู้ดูแล (LINE/push) · sequence ตามกฎ · ผูก ChatContact/AccountContact ด้วย partyId · MemberActivity · webhook |
| `crm.contact.updated` | {contactId, changedKeys[]} | contacts.update | sync Party/สมาชิก/แชท (ชื่อ อีเมล) · scoring (ฟิลด์เปลี่ยน) |
| `crm.contact.assigned` | {contactId, fromUserId?, toUserId, teamId, by} | assignment/bulk | แจ้งผู้รับ · MemberActivity |
| `crm.contact.converted` | {contactId, customerId?, companyId?, dealId?} | contacts.convert | สมาชิก (source CRM · แต้มต้อนรับตามกฎสมาชิก) · attribution · MemberActivity |
| `crm.contact.merged` · `crm.company.merged` | {keptId, mergedId} | merge | ย้าย FK ทุกตาราง (ทำใน tx) · party merge · sequence/portal ของตัวที่ถูกรวม |
| `crm.company.created` / `.updated` | {companyId, partyId, taxId?, changedKeys?} | companies | บัญชี: `ensureAccountContact(partyId, COMPANY)` (สร้าง/ผูก `accountContactId`) · scoring · MemberActivity |
| `crm.deal.created` | {dealId, contactId, companyId?, pipelineId, stageId, valueSatang, ownerUserId, teamId} | deals.create/convert | MemberActivity · แจ้งทีม (ถ้าตั้ง) · กฎ · webhook |
| `crm.deal.stage.changed` | {dealId, fromStageId, toStageId, daysInStage, by, bySource} | deals.move | history (ใน tx เดิม) · กฎ · sequence (หยุด/เริ่มตามขั้น) · portal (แจ้งลูกค้าเมื่อตั้ง) · MemberActivity |
| `crm.deal.won` | {dealId, contactId, companyId?, valueSatang, lines[], ownerUserId, collaboratorUserIds} | deals.move → WON | สมาชิก (สร้าง/ผูก source CRM — ตามแผนสมาชิก §7.1) · คอมมิชชัน (เฉพาะกฎ basis WON) · โควตา · บัญชี (`autoInvoiceOnWon` → ใบแจ้งหนี้) · หยุด sequence · แจ้งทีม · webhook · บอร์ดงาน (การ์ด "ส่งมอบ" ถ้ากฎตั้ง) |
| `crm.deal.lost` | {dealId, lostReasonId, note} | deals.move → LOST | รายงาน · หยุด sequence · กฎ (เช่น sequence ดึงกลับ 90 วัน) |
| `crm.deal.reopened` · `crm.deal.reassigned` · `crm.deal.updated` | {dealId, …} | deals | MemberActivity · แจ้ง · cache บริษัท |
| `crm.deal.stale` | {dealId, days, stageId, ownerUserId, teamId} | cron markStale | ป้ายนิ่ง (UI อ่าน stalledAt) · กฎ "ดีลนิ่ง" · แจ้งหัวหน้าทีม (สรุปรายวัน ไม่ทีละใบ) |
| `crm.activity.logged` | {activityId, type, direction, channel, contactId?, dealId?, companyId?, outcome?, source} | activities | **MemberActivity (ไทม์ไลน์กลาง)** · scoring · ล้าง stale · sequence (IN = ตอบกลับ → หยุด) · AI ถอดเสียง (ถ้ามีไฟล์) |
| `crm.activity.completed` · `crm.activity.overdue` | {activityId, ownerUserId} | complete / cron | กฎ · แจ้ง (overdue สรุปเช้า) |
| `crm.email.sent` / `.received` / `.opened` / `.clicked` / `.replied` / `.bounced` | {emailId, contactId?, dealId?, threadKey, sequenceStepId?, campaignId?, url?} | emails · track · provider webhook | scoring · sequence (replied/bounced → หยุด) · MemberActivity (sent/received) · แคมเปญสมาชิก (opened/clicked → MktRecipient) · ผู้ติดต่อ `emailBouncedAt` · แจ้งผู้ดูแลเมื่อ replied |
| `crm.sequence.enrolled` / `.finished` | {enrollmentId, sequenceId, contactId, reason?} | sequences | MemberActivity · สถิติ |
| `crm.score.changed` / `crm.score.threshold` | {contactId, from, to, band, ruleId} / {contactId, band} | scoring | แจ้ง "lead ร้อน" ผู้ดูแล · กฎ · segment สมาชิก (ถ้าเป็นสมาชิก: ฟิลด์ `crmScore` ให้ segment ใช้) |
| `crm.quota.reached` | {ownerType, ownerId, periodKey, pct} | quotas | แจ้ง · ป้าย |
| `crm.commission.created` / `.approved` / `.reversed` | {commissionId, userId, amountSatang, dealId, periodKey} | commissions | อนุมัติ (approval) · HR `createPayAdjustment` · แจ้งพนักงาน · รายงาน |
| `crm.portal.viewed` / `crm.portal.quote.responded` / `crm.portal.request.created` | {companyId, contactId, docId?, action?, requestId?} | portal | scoring · ดีลเลื่อนขั้น (ตอบรับ → ขั้นที่ตั้ง `stageOnQuoteAccepted`) · กิจกรรม PORTAL · บอร์ดงาน (แจ้งเรื่อง) · แจ้งผู้ดูแล |
| `crm.web.identified` | {contactId, sessionCount, pageViews, firstUrl} | tracking.identify | กิจกรรม WEB (สรุป) · scoring (+ต่อหน้า จำกัด/วัน) · MemberActivity |
| `custom.record.created` / `.updated` / `.archived` | {objectKey, recordId, parentType, parentId?, partyId?} | objects | MemberActivity ของแม่ · กฎ · webhook · portal (ถ้า `portalVisible`) |
| `team.updated` (core) | {teamId, changedKeys} | core/teams | cache การมองเห็น · มุมมอง TEAM สมาชิก/CRM |
- **ทุก event มี `systemId` (ระบบ CRM) · `unitId?` · idempotencyKey = `crm.<type>.<id>.<seq>`** · payload ไม่มีข้อมูลอ่อนไหว (ไม่มีอีเมล/เบอร์เต็ม ยกเว้น `crm.contact.created` ที่ส่ง masked)

### 7.2 event ของโมดูลอื่นที่ CRM ฟัง (consumer ใน `crm-bridges.ts`)
| event (มี/แผน) | CRM ทำอะไร |
|---|---|
| `forms.submission.received` (มี) | **ย้ายจากการเรียก `createContact` ตรงใน forms เป็น consumer**: lead ใหม่ในระบบ `FormDef.crmSystemId` (ไม่ใช่ "ระบบแรก") · UTM/pageUrl/referrer/webSessionId → sourceDetail · `identify` visitor · มอบหมาย `FormDef.assignRuleId` · คะแนน `scoreOnSubmit` · บริษัทจาก `createCompanyFromField` · ผู้ติดต่อเดิม (อีเมล/เบอร์ตรง) → กิจกรรม + score แทนสร้างซ้ำ |
| `chat.message.received` (มี) | ผูก Party (ผ่าน `member.linkIdentity` D18) → ผู้ติดต่อ CRM ของ Party (ถ้าไม่มีและ `settings.chatToLead` เปิด → lead source CHAT · ระบบจาก `targets.crmSystemId` ของระบบแชท) · หยุด sequence ที่รอตอบ · scoring · ไม่สร้างกิจกรรมทุกข้อความ (สร้างตอนห้องปิด) |
| `chat.conversation.status` RESOLVED (มี) | กิจกรรม CHAT AUTO 1 รายการ/ห้อง (สรุป AI ถ้าเปิด · sourceRef=conversationId) |
| `account.quotation.responded` (มี) | ดีลที่ `quotationDocId` ตรง → ย้ายขั้นตาม `pipeline.stageOnQuoteAccepted/Rejected` (ตั้งได้) · กิจกรรม · แจ้ง |
| `account.document.issued` (มี) | ถ้าเอกสารอ้าง `sourceDocId` = ใบเสนอราคาของดีล → `invoiceDocId` |
| `account.invoice.paid` / `account.payment.recorded` (มี) | ดีลที่ผูกใบแจ้งหนี้ → `recordPayment` → คอมมิชชัน (PAID) · โควตา · lifecycle CUSTOMER · บริษัท cache · ปิด sequence |
| `account.document.voided` · `pos.sale.voided` (มี) | คอมมิชชัน REVERSED · ดีลธง "เอกสารถูกยกเลิก" |
| `pos.sale.paid` (มี) | ถ้าบิลผูกดีล (`PosSale.dealId` ใหม่ · เลือกดีลตอนขาย) → `recordPayment` · ไม่ผูก → กิจกรรม PURCHASE ในไทม์ไลน์ (ผ่านสมาชิก) |
| `shop.order.paid` · `booking.completed` · `ticket.order.paid` · `rental.returned` · `school.enrolled` · `hotel.checked_out` · `clinic.visit.done` · `queue.served` (แผน C11 — ใบ C1.1 เพิ่มที่ยังไม่มี) | กิจกรรม/ไทม์ไลน์ผ่าน Party · scoring · lifecycle CUSTOMER · ดีล RENEWAL pipeline (ถ้ากฎตั้ง) |
| `member.created` · `member.tier.changed` · `member.merged` (แผนสมาชิก) | ผูก `memberCustomerId` · ป้ายระดับบนผู้ติดต่อ/บริษัท · segment |
| `kanban.card.completed` (มี) | กิจกรรมที่ผูก `kanbanCardId` เสร็จ · `CrmPortalRequest` ที่ผูกการ์ด → APPROVED/แจ้งลูกค้า |
| `approval.request.approved/rejected` (มี) | คอมมิชชัน · ส่วนลดเกินเพดาน · โอนเกินเพดาน · คำขอ portal |
| `hr.payroll.paid` (ใหม่ · ใบ C3.3 ในโมดูล HR) | คอมมิชชัน APPROVED → PAID |
| `inventory.item.updated` (ถ้ามี) | ชื่อ/ราคาสินค้าใน `CrmDealLine` ไม่เปลี่ยน (snapshot) — แสดงป้าย "ราคาเปลี่ยน" ในดีลเปิด |

### 7.3 กฎอัตโนมัติ (C13 · ต่อยอด K2.9 · `AutomationRule scope=CRM`)
- trigger ใน `AUTOMATION_EVENTS`: ทุก event §7.1 + §7.2 ที่เกี่ยว + `crm.deal.stale{days}` + `crm.activity.overdue` + `crm.score.threshold{band}` + `crm.deal.close_due{daysBefore}` (cron) + `custom.record.field_due{objectKey, fieldKey, daysBefore}` (cron รายวัน: ฟิลด์ DATE ของวัตถุถึงกำหนด — ใช้กับ "สัญญาหมด/เช็กระยะ/วัคซีน")
- condition: ฟิลด์ระบบ+กำหนดเอง ของ ผู้ติดต่อ/บริษัท/ดีล (`c.` `co.` `d.` prefix + `f.{key}`) · ขั้น · pipeline · มูลค่า (≥ ≤ ระหว่าง) · ผู้ดูแล/ทีม · ที่มา/ช่องทาง · คะแนน/band · lifecycle/leadStatus · วันนิ่ง · แท็ก · `o.{objectKey}.{fieldKey}` + `exists/count` · เป็นสมาชิก/ระดับ · AND/OR 1 ชั้น (ขยายจาก AND เดิม)
- action 14: `MOVE_STAGE{stageId}` · `ASSIGN{userId|ROUND_ROBIN{teamId}|RULE{ruleId}}` · `CREATE_ACTIVITY{type,title,dueIn,assignTo:owner|user}` · `OPEN_KANBAN_CARD{boardId,template,link:DEAL}` (K3.3) · `SEND_EMAIL{templateId,to:contact|owner}` · `SEND_LINE{templateId}` · `SEND_PUSH{to:owner|team}` · `ENROLL_SEQUENCE{sequenceId}` · `STOP_SEQUENCE` · `SET_FIELD{objectKey,key,value}` · `ADD_TAG/REMOVE_TAG` · `ADJUST_SCORE{points,reason}` · `NOTIFY_STAFF{owner|team|users,text}` · `WEBHOOK{url}` · `WAIT_THEN{days,thenActions[]}` (ชุดเดียวกับ journey สมาชิก M3.3 — ถ้าสมาชิกยังไม่ทำตอน RUN CRM ให้ CRM สร้างและสมาชิกใช้ต่อ) · `CREATE_DEAL{pipelineId,titleTpl,valueFrom:field}` (สำหรับต่ออายุ/วัตถุถึงกำหนด)
- กฎเริ่มต้น 6 ใบ (เปิดได้ตอนตั้งค่า): lead ใหม่ → มอบหมาย+LINE ต้อนรับผู้ดูแล · ดีลนิ่ง 14 วัน → งาน+แจ้งหัวหน้า · คะแนน ≥ ร้อน → แจ้ง · ใบเสนอราคาไม่ตอบ 5 วัน → sequence ติดตาม · ดีลแพ้ → sequence ดึงกลับ 90 วัน (ปิด) · ใบเสนอราคาตอบรับ → ขั้น "ตกลง" + งานออกใบแจ้งหนี้
- dry-run/โควตา (`automationRunsPerMonth` แยก scope CRM · ค่าเริ่มต้น 5,000)/loop-guard/บันทึกการรัน ของ K2.9 · engine เห็นเฉพาะ `scope=CRM` + `crmSystemId` ตรง (แบบเดียวกับ boardId)

### 7.4 แจ้งเตือนพนักงาน (เทมเพลต 10 × ช่องทาง push/LINE/อีเมล/ในแอป · ตั้งค่า `/settings/notifications` · เคารพ quiet hours)
| เหตุการณ์ | ค่าเริ่มต้น | ผู้รับ |
|---|---|---|
| lead ใหม่มอบหมายให้ฉัน | push + LINE ทันที | ผู้ดูแล |
| ลูกค้าตอบอีเมล/แชท/ตอบรับใบเสนอราคา | push ทันที | ผู้ดูแล (+ผู้ร่วม) |
| ดีลนิ่ง (สรุป) | LINE 08:30 รายวัน | ผู้ดูแล · หัวหน้าทีม |
| งานค้าง/งานวันนี้ (สรุป) | push 08:00 | เจ้าของงาน |
| ก่อนนัด | push 30 นาที (ตั้งได้) | ผู้เข้าร่วม |
| lead ร้อน | push ทันที | ผู้ดูแล |
| ดีลชนะ/แพ้ | ในแอป + LINE ทีม (ชนะ) | ทีม · หัวหน้า |
| คอมมิชชันรออนุมัติ/อนุมัติแล้ว | ในแอป · LINE | MANAGER · พนักงาน |
| โควตาถึง 80/100% | ในแอป | คน/หัวหน้าทีม |
| ใบแจ้งหนี้ของดีลชำระแล้ว · เอกสารถูกยกเลิก | ในแอป | ผู้ดูแล |
- ลูกค้า (portal/อีเมล): เชิญเข้า portal · ใบเสนอราคาใหม่ · ใบแจ้งหนี้ครบกำหนด (จากบัญชี — ไม่ซ้ำ) · ตอบคำขอ · ทั้งหมดเคารพ consent/optOut และ `List-Unsubscribe`

### 7.5 cron (ลง `vercel.json` + `/api/cron/crm/*` · secret เดิม)
| งาน | เวลา | ทำอะไร |
|---|---|---|
| `stale` | 06:00 ไทย รายวัน | `deals.markStale` + สรุปนิ่งรายวัน |
| `sequences` | ทุก 5 นาที | `sequences.runDue` (≤ 200/รอบ · วนจนเงียบ ≤ 20 วิ) |
| `email-scheduled` | ทุก 5 นาที | ส่งอีเมล `scheduledAt ≤ now` |
| `activities` | ทุกชั่วโมง / ทุก 5 นาที | overdue / remind |
| `score-decay` | 03:00 ไทย | `scoring.decay` + band recalc |
| `close-due` · `record-field-due` | 07:00 ไทย | trigger กฎ วันปิดคาด/ฟิลด์วันที่ของวัตถุ |
| `company-cache` | 04:00 ไทย | `companies.recomputeCaches` |
| `web-purge` · `email-purge` | 02:00 ไทย | retention (C6/PDPA) |
| `reports-scheduled` | ตามที่ตั้ง | ส่งรายงานอีเมล |
| `outbox` (เดิม) | ทุก 1 นาที | drainUntilQuiet |

---

## 8. ผู้ช่วย AI (D11 · แบบ K3.5 · proposal ก่อนทำเสมอสำหรับ write)

- **skill `crm`** (ขยายจาก 4 tool): tool read รันทันที (`crm_search` · `crm_pipeline_summary` · `crm_forecast` · `crm_stale_deals` · `crm_contact_360` · `crm_company_360` · `crm_deal_360` · `crm_activities_due` · `crm_email_thread` · `crm_records_query{objectKey}` · `crm_reports{tab}` · `crm_score_explain`) · tool write เป็น proposal (`crm_create_lead` · `crm_create_company` · `crm_create_deal` · `crm_move_deal` · `crm_log_activity` (รับข้อความ/เสียง) · `crm_draft_email` (ร่างเท่านั้น) · `crm_send_email` · `crm_enroll_sequence` · `crm_assign` · `crm_convert` · `crm_issue_quotation` · `crm_create_record{objectKey}` · `crm_set_next_step`) ≈ 32 tool · ทะเบียนจาก op ที่มี `tool` (F13.6)
- **ในหน้า**: ดีล 360 ("สรุปดีล · ทำไมเสี่ยง · เสนอ next step · ร่างอีเมลติดตาม") · ผู้ติดต่อ ("ทำไมคะแนนร้อน · ร่างข้อความปิดการขาย") · บริษัท ("สรุปบริษัท · โอกาสต่อยอดจากประวัติซื้อ") · หน้าแรก ("ดีลไหนเสี่ยงเดือนนี้" → ตาราง + proposal สร้างงาน) · บันทึกสาย (ถอดเสียง → สรุป → next step → proposal สร้างดีล/งาน) · นามบัตร (ภาพ → ฟิลด์ → proposal lead) · แชท (สรุปห้อง → กิจกรรม)
- **ข้อจำกัด**: AI เห็นตาม `visibleWhere` ของผู้ถาม · ไม่เห็นอ่อนไหวของสมาชิก · ค่าใช้จ่ายผ่าน AI credit เดิม (ถอดเสียง 1 นาที ≈ 1 ข้อความ · ตั้งเพดาน/เดือน) · proposal หมดอายุ 24 ชม. · ทุกอย่างที่ AI ทำมี `actor=AI` ใน audit และ `bySource=RULE/API`

---

## 9. เชื่อมกับทุกระบบ (สัญญา · ครบ 24 ระบบใน `systems.ts` — ข้อกำหนดของเจ้าของ C10 · ภาพ 17)

**หลักร่วม**: (1) ทุกระบบที่รู้เบอร์/อีเมล/LINE เขียน `partyId` (C11) → หน้า 360 ทุกชนิดเห็นกัน (2) ระบบธุรกิจ emit event เมื่อ "ลูกค้าทำธุรกรรมสำเร็จ" → CRM บันทึกกิจกรรม/คะแนน/lifecycle และเปิดดีลต่ออายุได้ (3) CRM emit event ที่ระบบอื่นใช้ (สมาชิก · บัญชี · บอร์ดงาน · HR · การตลาด) (4) ร้านที่มีหลายระบบชนิดเดียวกัน เลือกปลายทางใน `settings.crm.targets` (5) ทุกเส้นเชื่อมผ่าน facade/outbox ไม่ import ตรง

| # | ระบบ | CRM ← ระบบ (รับ) | CRM → ระบบ (ให้) | หมายเหตุ/ใบงาน |
|---|---|---|---|---|
| 1 | **HOTEL** โรงแรม | `hotel.booking.confirmed/checked_out` (ใหม่) + `HotelBooking.partyId` → กิจกรรม VISIT · lifecycle · คะแนน · ยอดเข้าบริษัท (B2B corporate rate) | บริษัท 360 เห็นการเข้าพัก · ดีล "สัญญา corporate rate" (pipeline RENEWAL) · ใบเสนอราคาห้องพักกลุ่มจากรายการสินค้า (สินค้า=ประเภทห้อง) | C1.1 partyId · C2.9 event |
| 2 | **RESTAURANT** ร้านอาหาร | `pos.sale.paid` (บิลผูกโต๊ะ) ผ่านสมาชิก → ไทม์ไลน์ · จองโต๊ะกลุ่ม (ถ้ามี) → กิจกรรม | ดีลจัดเลี้ยง/catering (pipeline "จัดเลี้ยง") → ใบเสนอราคา · บริษัทลูกค้าประจำ | ผ่านสมาชิก/POS · ไม่มีใบเฉพาะ |
| 3 | **BOOKING** จองคิว/นัด | `Appointment.partyId` (C11) + `booking.completed/no_show` (แผนสมาชิก M3.x — ถ้ายังไม่มี ใบ C1.1 เพิ่ม) → กิจกรรม MEETING/VISIT AUTO · no-show → คะแนนลบ/กฎ | ปฏิทิน CRM แสดงนัดจากจอง (อ่านอย่างเดียว · facade `appointmentsByParty`) · ปุ่ม "นัดผ่านระบบจอง" จากดีล/ผู้ติดต่อ (prefill customer) | C1.1 · C2.4 |
| 4 | **QUEUE** บัตรคิว | `QueueTicket.partyId?` (ถ้ารู้เบอร์) + `queue.served` → กิจกรรม VISIT (เบา) | — (ไม่มีดีลจากคิว) | C1.1 optional |
| 5 | **TICKET** ตั๋ว/อีเวนต์ | `TicketOrder.partyId` (คอลัมน์มีแล้ว · เขียนจริง) + `ticket.order.paid` → กิจกรรม PURCHASE · lifecycle · ดีล B2B ตั๋วกลุ่ม | ดีล "ตั๋วกลุ่ม/สปอนเซอร์" → ใบเสนอราคา · บริษัท 360 เห็นคำสั่งซื้อตั๋ว | C1.1 |
| 6 | **MEMBER** สมาชิก | `member.created/updated/tier.changed/merged` → ผูก `memberCustomerId` · ป้ายระดับ · sync ชื่อ · segment สมาชิกใช้ `crmScore/lifecycle/openDeals` (ฟิลด์ระบบใหม่ที่ segment builder เห็น) | `crm.contact.converted/deal.won` → สร้าง/ผูกสมาชิก (source CRM) · ไทม์ไลน์กลาง `MemberActivity` รับกิจกรรม/อีเมล/ดีล/เว็บ · **engine ฟิลด์ร่วม** (objectKey) · Team ให้มุมมอง TEAM · wallet/แต้มแสดงในผู้ติดต่อ 360 (`briefFor`) · voucher จากดีล (แอ็กชัน `ISSUE_VOUCHER` ของสมาชิกใช้ในกฎ CRM ได้) | C1.2 · C1.4 · C3.x |
| 7 | **REWARD** รางวัล | `reward.redeemed` → ไทม์ไลน์ (ผ่านสมาชิก) | รางวัล B2B (ของขวัญลูกค้าองค์กร) = กิจกรรม + วัตถุ "ของขวัญ" (เทมเพลต) | ผ่านสมาชิก |
| 8 | **COUPON** คูปอง/voucher | `voucher.used` → ไทม์ไลน์ · คูปองที่ออกจากแคมเปญ CRM (ดึงกลับ) | กฎ CRM แอ็กชัน `ISSUE_VOUCHER` (ของสมาชิก) · sequence แนบโค้ดคูปอง | ผ่านสมาชิก M2.5 |
| 9 | **POINT** แต้ม | `point.earned/expired` → ไทม์ไลน์ | ผู้ติดต่อ 360 แสดงแต้ม (brief) · แอ็กชัน `GIVE_POINTS` ใช้ในกฎ CRM (ดีลชนะครั้งแรก → แต้มต้อนรับ B2B) | ผ่านสมาชิก |
| 10 | **CHAT** แชท | `chat.message.received` → ผูก Party → lead/หยุด sequence/คะแนน · `chat.conversation.status` RESOLVED → กิจกรรม CHAT + สรุป AI · แผงข้างห้องเรียก `crm.briefFor(partyId)` | ปุ่มในแชท: เปิดดีล · บันทึกกิจกรรม · สร้าง lead · ดูดีลเปิด · ส่ง LINE จาก CRM/sequence ผ่าน `chat.sendLine(identity)` (ต้อง consent) · ห้องแชทโผล่ในไทม์ไลน์ผู้ติดต่อ/บริษัท/ดีล | C1.1 (แผง) · C2.3 (sequence LINE) · C2.4 |
| 11 | **MEETING** แชทภายใน | — | แจ้งทีมขาย (ดีลชนะ/lead ร้อน/สรุปนิ่ง) เข้าห้องทีม (channel ต่อ Team · ตั้งได้) · แชร์ลิงก์ดีลในห้อง (unfurl การ์ด) | C3.4 |
| 12 | **ACCOUNT** บัญชี | `account.quotation.responded` → ย้ายขั้น · `account.document.issued` → invoiceDocId · `account.invoice.paid/payment.recorded` → recordPayment/คอมมิชชัน/lifecycle · `account.document.voided` → reverse · `account.contact.created/merged` → ผูกบริษัท/ผู้ติดต่อ (partyId) | `crm.company.created` → `ensureAccountContact` · ดีล lines → `createExternalQuotation`/`createInvoiceFromLines` (เอกสารจริง) · ผู้ติดต่อบัญชีแสดงป้าย "CRM" (มีแล้ว WO 3.2) · portal ใช้ `respondQuotation` · `paymentLinkFor` · `listDocsByParty` · `outstandingByContact` · หน้าเอกสารบัญชีมีลิงก์ "ดีล" (`dealFor(docId)`) · รายงานยอดขายต่อคนใช้ตัวเลขบัญชี | C1.5 · C2.7 · C3.1 |
| 13 | **KANBAN** บอร์ดงาน | `kanban.card.completed` → กิจกรรมเสร็จ/คำขอ portal · `kanban.inbox.requested` (งานส่วนตัว) | `OPEN_KANBAN_CARD` จากกฎ/ดีล (`KanbanCardLink linkType=DEAL/COMPANY/CRM_CONTACT/CUSTOM_RECORD`) · การ์ดที่ผูกดีลโผล่ในดีล 360 · แจ้งเรื่องจาก portal → การ์ดในบอร์ดที่ตั้ง · engine automation ร่วม (K2.9) · อีเมลเข้า: prefix `งาน+`/`tasks+` = บอร์ด · `crm+` = CRM (route เดียว) | C1.6 · C2.5 |
| 14 | **POS** ขายหน้าร้าน | `pos.sale.paid` (ผูกดีลผ่าน `PosSale.dealId` ใหม่ หรือผ่านสมาชิก) → recordPayment/กิจกรรม PURCHASE · `pos.sale.voided` → reverse | หน้าขาย: เลือกดีลของลูกค้าที่มีดีลเปิด (ค้นจาก partyId) → บิลผูกดีล · ปิดดีล WON อัตโนมัติเมื่อบิลจ่ายครบมูลค่า (ตั้งได้) | C2.7 (แตะ `pos/service.ts` เฉพาะเพิ่ม dealId · ต้องผ่าน regressions POS ทั้งชุด) |
| 15 | **CRM** (ตัวเอง · หลายระบบ) | ร้านมี CRM หลายระบบ (เช่น ขาย B2B / ขายปลีก) → Party ร่วม · ผู้ติดต่อคนละแถว · ฟอร์ม/แชทเลือกระบบปลายทาง | — | §2.1 |
| 16 | **KB** คลังความรู้ | — | AI ผู้ช่วย CRM ใช้ KB ตอบคำถามสินค้า/เงื่อนไขตอนร่างอีเมล/สรุปดีล (skill ร่วม) · เทมเพลตอีเมลอ้าง KB article ได้ (`{{kb:slug}}`) | C3.4 |
| 17 | **HR** พนักงาน | `HrEmployee.linkedUserId` (มี) → คอมมิชชันจ่ายให้พนักงานที่ผูก · ตำแหน่ง/แผนกใช้ในกฎมอบหมาย (เงื่อนไข "ตำแหน่ง=Sales") · `hr.leave.submitted/approved` → ผู้ดูแลลา = round-robin ข้าม + แจ้งหัวหน้า (ตั้งได้) · `hr.payroll.paid` (ใหม่) → คอมมิชชัน PAID | `crm.commission.approved` → `HrPayAdjustment kind=COMMISSION` (payroll) · รายงานยอด/คอมมิชชันต่อพนักงาน · Team (core) ≠ แผนก HR (ข้อความ) — ไม่บังคับตรงกัน · ปุ่มใน HR "ทีมขาย" ลิงก์มา Team | C3.2 · C3.3 |
| 18 | **INVENTORY** สินค้า/บริการ | `InvItem` เป็นแหล่ง `CrmDealLine.productId` (ชื่อ/ราคา snapshot) · สต๊อกไม่จอง (ดีลไม่ตัดสต๊อก · ใบเสนอราคาก็ไม่ตัด — บัญชี/POS จัดการ) · `inventory.item.updated` → ป้าย "ราคาเปลี่ยน" | รายงาน "สินค้าที่อยู่ในดีลเปิด" (pipeline ต่อสินค้า) · ฟิลด์ LOOKUP PRODUCT ในวัตถุ/ผู้ติดต่อ ("สินค้าที่สนใจ") · กฎมอบหมายตามสินค้า | C1.5 |
| 19 | **MARKETING** การตลาด | แคมเปญ (LINE/อีเมล) → `MktRecipient.emailMessageId` ใช้ tracking CRM (เปิด/คลิก) · `campaign.sent` → กิจกรรม EMAIL/LINE OUT (สรุปต่อคน · เฉพาะที่เป็นผู้ติดต่อ CRM) · segment สมาชิกเห็นฟิลด์ CRM · lead ที่คลิกจากแคมเปญ → sourceDetail.campaignId (ROI) | รายงาน ROI ต่อแคมเปญ (lead→ดีล→ชนะ→มูลค่า) · `sourceDetail.campaignId` ทุกทางเข้า · `AcquisitionLink`/`CrmTrackedLink` ใช้ร่วม · แอ็กชัน `SEND_EMAIL` ใช้ engine ส่ง/ติดตามเดียวกัน | C2.6 · C3.1 |
| 20 | **SHOP** ร้านค้าออนไลน์ | `ShopOrder.partyId` (C11) + `shop.order.paid` (ใหม่ · ลง 3 ทะเบียน) → กิจกรรม PURCHASE · lifecycle · lead จากคำสั่งซื้อครั้งแรก (ถ้าตั้ง) | บริษัท/ผู้ติดต่อ 360 เห็นคำสั่งซื้อออนไลน์ · ดีล B2B → "สร้างคำสั่งซื้อ/ลิงก์ชำระ" (ผ่านบัญชี) · marketplace (Shopee/Lazada ผ่าน ecommerce D19) เข้าทางเดียวกัน | C1.1 · C2.9 |
| 21 | **RENTAL** เช่าสินทรัพย์ | `RentalBooking.partyId` + `rental.returned/overdue` → กิจกรรม · lifecycle · ค่าปรับ → ไทม์ไลน์ | ดีลเช่าระยะยาว/องค์กร → ใบเสนอราคา · วัตถุ "สินทรัพย์ที่ลูกค้าเช่าประจำ" (เทมเพลต) · กฎ "เช่าครบ 3 ครั้ง → เสนอสัญญารายปี" | C1.1 · C2.9 |
| 22 | **SCHOOL** โรงเรียน/คอร์ส | `SchoolEnrollment.partyId` (ผู้เรียน/ผู้ปกครอง) + `school.enrolled/completed` → กิจกรรม · lifecycle · ดีลกลุ่ม (บริษัท/โรงเรียนซื้อคอร์สให้พนักงาน/นักเรียน) | pipeline "ขายคอร์สองค์กร" → ใบเสนอราคา (สินค้า=คอร์ส) · วัตถุ "ผู้เรียน" (เทมเพลต · ผูกบริษัท) · จบคอร์ส → กฎ "เสนอคอร์สถัดไป" (pipeline RENEWAL) | C1.1 · C2.9 |
| 23 | **CLINIC** คลินิก | `ClinicPatient.partyId` + `clinic.visit.done` → กิจกรรม VISIT (ไม่ส่งข้อมูลการรักษาเข้า CRM — เฉพาะ "มีการเข้ารับบริการ") · นัดคลินิกโผล่ในปฏิทิน CRM (อ่านอย่างเดียว) | ดีล B2B ตรวจสุขภาพองค์กร → ใบเสนอราคา · ข้อมูลอ่อนไหวอยู่ฝั่งคลินิก/สมาชิก (policy D8) CRM ไม่เก็บ | C1.1 · C2.9 |
| 24 | **PAGES** หน้า/LIFF | หน้า LIFF/เว็บที่สร้างจาก PAGES ฝัง `shark.js` + ฟอร์ม lead + ลิงก์ติดตาม (widget "ฟอร์มติดต่อ" ผูก FormDef.crmSystemId) | widget สำหรับพนักงาน: "ดีลของฉัน" · "งานวันนี้" · ปุ่มบันทึกสาย · widget ลูกค้า: "portal" (เข้าจาก LIFF) | C2.6 · C3.5 |
| — | **PARTY / platform_auth / storage / AI / approval / API keys / webhook / outbox / permissions / scope / branding** (ของกลาง) | ใช้ทั้งหมดตามแบบ · portal ใช้ธีมร้าน (branding tokens) · ไฟล์เสียง/แนบผ่าน storage (private · signed URL) · approval entityType `CRM_COMMISSION` `CRM_DISCOUNT` `CRM_REASSIGN` `CRM_PORTAL_REQUEST` | | ทุกใบ |

**ระบบภายนอก (นอก SHARK)**: Resend (ส่ง/webhook bounce · โดเมนร้าน) · LINE (ผ่านโมดูลแชท) · 🔜 Gmail/Outlook (adapter `CrmMailProvider`) · 🔜 VoIP (`CrmCallProvider`) · n8n/Zapier ผ่าน REST+webhook · เว็บร้านผ่าน `shark.js`/ฟอร์ม/ลิงก์

---

## 10. เทมเพลต CRM ตามประเภทกิจการ (16 ชุด · ข้อมูล JSON ใน `(templates)` (แผน · crm/templates/) · เลือกตอนเปิดใช้ · แก้ต่อได้ · ซ้อนกับเทมเพลตสมาชิก D7)

ทุกชุดมี 6 ส่วน: **pipeline+ขั้น (พร้อม % · staleDays · requireFields)** · **เหตุผลแพ้** · **กฎคะแนน** · **sequence เริ่มต้น 1–2 ชุด** · **วัตถุกำหนดเอง** (ผูกกับใคร) · **ฟิลด์เพิ่มของผู้ติดต่อ/บริษัท/ดีล** — ค่าที่ไม่ระบุใช้ค่ากลาง (pipeline 5 ขั้นเดิม `DEFAULT_PIPELINE` · เหตุผลแพ้ 5 · กฎคะแนน 8 · sequence "ติดตามใบเสนอราคา")

| # | กิจการ | pipeline (ขั้น) | วัตถุกำหนดเอง | ฟิลด์เด่น | sequence/กฎเด่น |
|---|---|---|---|---|---|
| 1 | ดำน้ำ/ทัวร์ (B2B กลุ่ม) | ผู้สนใจ → คุยความต้องการ → เสนอราคา → เจรจา → มัดจำ → ชนะ | ทริป/กรุ๊ปที่จอง (ผูกบริษัท) | ดีล: จำนวนคน · วันที่เดินทาง · ระดับใบรับรอง | ก่อนเดินทาง 30 วัน → เตือนมัดจำ · หลังทริป → sequence ขอรีวิว+ทริปถัดไป |
| 2 | คลินิก/ความงาม | สอบถาม → ปรึกษา → เสนอคอร์ส → ตัดสินใจ → ชนะ | คอร์ส/แพ็กเกจที่ซื้อ (ผูกผู้ติดต่อ) — ไม่มีข้อมูลรักษา | ผู้ติดต่อ: ความสนใจ (SELECT) · งบ | ปรึกษาแล้วไม่ซื้อ 7 วัน → sequence · ตรวจสุขภาพองค์กร pipeline B2B |
| 3 | ร้านอาหาร/จัดเลี้ยง | สอบถาม → เสนอเมนู → ชิม/เจรจา → มัดจำ → จัดงาน | งานจัดเลี้ยง (วันที่ · จำนวน · สถานที่) | ดีล: วันงาน · จำนวนโต๊ะ | ก่อนงาน 7 วัน → งานยืนยัน · หลังงาน → ขอรีวิว |
| 4 | ฟิตเนส/สตูดิโอ | ทดลอง → เสนอแพ็กเกจ → ตัดสินใจ → สมัคร | แพ็กเกจองค์กร (ผูกบริษัท) | ผู้ติดต่อ: เป้าหมาย · เวลาที่สะดวก | ทดลองแล้วไม่สมัคร 3 วัน → sequence · สัญญาองค์กรหมด 30 วัน → ดีลต่ออายุ |
| 5 | โรงแรม (corporate/agent) | ติดต่อ → เสนอ rate → เจรจา → เซ็นสัญญา | สัญญา corporate rate (ผูกบริษัท · เริ่ม/สิ้นสุด/rate) | บริษัท: ประเภท (corporate/agent/OTA) · โควตาห้อง | สัญญาหมด 60 วัน → ดีลต่ออายุ · เข้าพัก 10 ครั้ง/ปี → เสนอ corporate |
| 6 | ร้านค้า/ค้าส่ง | สอบถาม → ส่งแคตตาล็อก → เสนอราคา → เจรจา → สั่งซื้อ | สินค้าที่ซื้อประจำ (ผูกบริษัท) | บริษัท: เครดิตเทอม · ยอดสั่งขั้นต่ำ | สั่งซื้อครบ 3 ครั้ง → เสนอเทอม · ไม่สั่ง 60 วัน → sequence ดึงกลับ |
| 7 | อสังหาฯ/นายหน้า | ผู้สนใจ → นัดชม → เสนอ → จอง → โอน | ทรัพย์ที่สนใจ (ผูกผู้ติดต่อ · ทรัพย์/งบ/ทำเล) | ดีล: ทรัพย์ · งบ · สินเชื่อ | นัดชมแล้ว 2 วัน → โทร · ทรัพย์ใหม่ตรงงบ → แจ้ง |
| 8 | รถ/อู่/เช่ารถ | สอบถาม → เสนอ → ทดลอง → เจรจา → ปิด | รถของลูกค้า (ทะเบียน/รุ่น/ไมล์/เช็กระยะ) | — | เช็กระยะถึงกำหนด 30 วัน → กฎสร้างงาน+LINE · เช่าครบ 3 ครั้ง → เสนอรายปี |
| 9 | โรงเรียน/สถาบัน | สอบถาม → ทดลองเรียน → เสนอคอร์ส → สมัคร | ผู้เรียน (ผูกผู้ติดต่อ/บริษัท · ชื่อ/อายุ/ระดับ) | ดีล: คอร์ส · รอบ | จบคอร์ส → เสนอคอร์สถัดไป · ทดลองแล้ว 3 วัน → โทร |
| 10 | บริการ/ช่าง/ติดตั้ง | แจ้งความต้องการ → สำรวจหน้างาน → เสนอราคา → เจรจา → ติดตั้ง | เครื่อง/ทรัพย์สินที่ติดตั้ง (S/N · วันติดตั้ง · หมดประกัน) | ดีล: สถานที่ · วันสำรวจ | ประกันหมด 60 วัน → ดีลต่อประกัน · สำรวจแล้วไม่เสนอ 3 วัน → เตือน |
| 11 | ประกัน/การเงิน | ผู้สนใจ → เสนอแผน → เอกสาร → อนุมัติ → ชนะ | กรมธรรม์ (เลขที่ · เริ่ม/หมด · เบี้ย · ผู้เอาประกัน) | ผู้ติดต่อ: อาชีพ · ความคุ้มครองที่สนใจ | กรมธรรม์หมด 45 วัน → ดีลต่ออายุ + sequence |
| 12 | สัตว์เลี้ยง/โรงพยาบาลสัตว์ | สอบถาม → นัด → เสนอแพ็กเกจ → ซื้อ | สัตว์เลี้ยง (ชื่อ/ชนิด/พันธุ์/วันเกิด/วัคซีนครั้งถัดไป) | — | วัคซีนถึงกำหนด 14 วัน → LINE+งาน · วันเกิดสัตว์ → ข้อความ |
| 13 | ซอฟต์แวร์/บริการรายเดือน | lead → demo → trial → เสนอ → ปิด · pipeline RENEWAL | สัญญา/แผนที่ใช้ (เริ่ม/ต่ออายุ/MRR) | บริษัท: จำนวนผู้ใช้ · MRR | trial หมด 3 วัน → sequence · ต่ออายุ 30 วัน → ดีล RENEWAL |
| 14 | อีเวนต์/สถานที่จัดงาน | สอบถาม → ดูสถานที่ → เสนอ → มัดจำ → จัดงาน | งาน/บูธ (วันที่ · พื้นที่ · สปอนเซอร์) | ดีล: วันงาน · จำนวนคน | ก่อนงาน → งานเตรียม · หลังงาน → ขอรีวิว+จองปีหน้า |
| 15 | ตัวแทน/ผู้ผลิต (B2B ทั่วไป) | lead → qualify → เสนอ → เจรจา → ปิด · staleDays 7/14/21 | สัญญา · สินค้าที่จำหน่าย | บริษัท: ขนาด · อุตสาหกรรม · เครดิต | มาตรฐาน 6 กฎ · sequence 2 ชุด |
| 16 | ทั่วไป (ค่ากลาง) | `DEFAULT_PIPELINE` 5 ขั้น | ไม่มี (เพิ่มเองจากเทมเพลตวัตถุ 8) | — | กฎเริ่มต้น 6 · sequence "ติดตามใบเสนอราคา" |

**เทมเพลตวัตถุ 8** (เลือกได้ทุกกิจการ): สัตว์เลี้ยง · รถ · ทรัพย์สิน/เครื่องจักร · สัญญา · กรมธรรม์ · อสังหาฯ ที่สนใจ · โครงการ · ผู้เรียน/เด็ก — แต่ละชุด = ส่วน+ฟิลด์ (5–8) + titleFieldKey + parentType แนะนำ + กฎวันที่ถึงกำหนด 1 ใบ (ปิดไว้)

---

## 11. Edge cases & กติกา

### 11.1 ตัวตน/ซ้ำ/หลายระบบ
- ผู้ติดต่อซ้ำในระบบเดียว (เบอร์/อีเมล) → `duplicate` ตอนสร้าง (เลือก ใช้เดิม/สร้างใหม่แบบ candidate) · ข้ามระบบ CRM = คนละแถว Party เดียว · บริษัทซ้ำจับด้วยเลขภาษี (แน่นอน) → โดเมนอีเมล → ชื่อคล้าย (candidate)
- รวมผู้ติดต่อ: ไม่ลบแถว · `mergedIntoId` · ย้าย ดีล/กิจกรรม/อีเมล/บทบาทบริษัท/portal/score log/sequence (คง 1 ACTIVE) · Party merge · สมาชิกที่ผูก (ถ้าทั้งคู่เป็นสมาชิกคนละคน → ไม่รวมอัตโนมัติ เสนอไปหน้ารวมสมาชิก)
- รวมบริษัท: ย้ายผู้ติดต่อ (บทบาทซ้ำ → เก็บของ keep) · ดีล · เอกสารบัญชี (`account.mergeContacts` มีแล้ว) · วัตถุ · portal access
- ผู้ติดต่อเปลี่ยนบริษัท: `endedAt` แถวเดิม · แถวใหม่ · ดีลเปิดที่ผูกบริษัทเดิมถาม "ย้ายดีลไปด้วยไหม"
- ลูกค้าเปลี่ยนอีเมล → อีเมลเก่าใน thread ยังจับคู่ได้ (`CrmContact` เก็บ `emailHistory[]` ใน sourceDetail? → ใช้ `Party` email history ของสมาชิก M1.x ถ้ามี · ไม่มี = จับคู่โดเมน/มือ)

### 11.2 วัตถุกำหนดเอง (C8)
- ฟิลด์ระบบของ contact/company/deal (`isSystem` · systemKey) ซ่อน/เปลี่ยนป้าย/เรียงได้ ลบ/เปลี่ยนชนิดไม่ได้ (กติกา D14) · ฟิลด์ระบบ contact 14 · company 12 · deal 12
- วัตถุ: key เปลี่ยนไม่ได้หลังมีรายการ · เปลี่ยน parentType ไม่ได้หลังมีรายการ · archive วัตถุ = ซ่อนทั้งแท็บ/รายการ/op (กู้ได้) · ลบถาวรต้อง OWNER + ยืนยัน key + ไม่มีรายการ
- ไม่มีเพดานจำนวนวัตถุ · เตือน (banner ตั้งค่า + OpsEvent) เมื่อ > 30 วัตถุ หรือ > 200,000 รายการ/วัตถุ · ฟิลด์ 60/วัตถุ · `filterable` ≤ 20/วัตถุ · LOOKUP ไปวัตถุอื่นได้ (ห้ามวนตัวเอง)
- รายการที่แม่ถูก archive/merge → ย้ายตามแม่ · parentType NONE ผูก partyId ได้ผ่านฟิลด์ LOOKUP CUSTOMER/CONTACT/COMPANY (ไทม์ไลน์ใช้ตัวนั้น)
- portalVisible: ลูกค้าเห็นเฉพาะรายการที่ parent = บริษัทตน และฟิลด์ `portalVisible` · แก้ได้เฉพาะ `portalEditable` → ผ่านคำขอ

### 11.3 ดีล/ขั้น/forecast
- ย้ายขั้นถอยหลังได้ (บันทึก history · `reopenedCount` เมื่อจาก WON/LOST) · WON → LOST ต้องเหตุผล · LOST/WON กลับ OPEN ต้อง MANAGER+ และ void คอมมิชชันที่ยัง PENDING (APPROVED แล้ว = reverse)
- `requireFields` ไม่ครบ → `STAGE_REQUIREMENTS` (UI เปิดโมดัลกรอกแล้วย้ายต่อ) · `requireQuotation` = ต้องมี quotationDocId · ลากบนกระดานย้อนกลับถ้าไม่ผ่าน
- มูลค่า: มี lines → valueSatang คำนวณจาก lines (แก้มือไม่ได้ · แก้ที่ lines) · ไม่มี lines → กรอกมือ · ใบเสนอราคาออกแล้วแก้ lines → ป้าย "ต่างจากใบเสนอราคา" + ปุ่มออกใบใหม่ (ใบเดิม void/replaced ตามกติกาบัญชี)
- forecast: weighted = value × (override ?? stage.probability) เฉพาะ OPEN · หมวด COMMIT/BEST_CASE ตั้งได้เฉพาะ owner/collab/MANAGER · OMITTED ไม่นับ · เดือน = `expectedCloseAt` (ไม่มี = "ไม่ระบุ") · `wonValueSatang` ใช้ในรายงาน "ชนะ" ถ้ามี ไม่มีใช้ valueSatang
- นิ่ง: นับจาก `lastActivityAt` (กิจกรรม/อีเมล/แชท/ย้ายขั้น/แก้ lines ทั้งหมดอัปเดต) · WON/LOST ไม่นับ · ขั้นที่ `staleDays=0` ไม่นับ · emit ครั้งเดียวจนกว่า stalledAt ถูกล้าง
- pipeline หลายอัน: ดีลย้ายข้าม pipeline ได้ (MANAGER+ · history บันทึก · ขั้นแรกของปลายทาง) · pipeline archive ต้องไม่มีดีล OPEN

### 11.4 อีเมล (C4)
- ส่งจากโดเมนร้าน: ต้องยืนยัน DNS กับ Resend (หน้า `/settings/email` แสดง DKIM/SPF ที่ต้องเพิ่ม · สถานะ) · ยังไม่ยืนยัน = ส่งจาก `{slug}@shark.in.th` ชื่อแสดง = พนักงาน
- Reply-To=STAFF: ลูกค้าตอบเข้ากล่องพนักงานโดยตรง → CRM รับได้เฉพาะเมื่อพนักงาน BCC/forward มาที่ `crm+{key}@` (หน้าตั้งค่าเตือนชัด) · copyMode IN/OUT/BOTH ส่งสำเนาไป `copyToAddr` (ร้าน) และ `CrmEmailUserSetting.copyToAddr` (พนักงาน)
- inbound: อีเมลที่ไม่จับคู่และ `strangerToLead=false` → กล่อง "ยังไม่จับคู่" (ผูกมือ/สร้าง lead/ละทิ้ง) · อีเมลจาก no-reply/bounce/auto-reply (header `Auto-Submitted`/`Precedence: bulk`) ไม่สร้าง lead ไม่หยุด sequence · ผู้ส่งเป็นพนักงานแต่ To ไม่ใช่ผู้ติดต่อที่รู้จัก → เก็บเป็น OUT ไม่ผูก
- threading: `In-Reply-To/References` → `Message-ID` ของเรา → threadKey · ไม่มี → `+t{token}` ใน Reply-To local part → subject normalize (ตัด RE:/FW:/ตอบ:) + ผู้ติดต่อเดียวกัน 30 วัน → ใหม่
- tracking: pixel ไม่ใส่เมื่อผู้รับ optOut tracking (ฟิลด์ผู้ติดต่อ `trackingOptOut`) · bot/prefetch: เปิดใน 2 วิ หรือ UA ตรงรายการ → ไม่นับ · ลิงก์ `mailto:`/`tel:`/unsubscribe ไม่ห่อ · ลิงก์หมดอายุ 1 ปี → 302 ไป url เดิม
- optOut: ลิงก์ยกเลิกรับในทุกอีเมล (ไม่ต้องล็อกอิน · token) → `emailOptOut` + หยุด sequence · อีเมลธุรกรรม (ใบเสนอราคา/ใบแจ้งหนี้จากบัญชี) ไม่ถูกบล็อก · bounce hard → `emailBouncedAt` + บล็อกจนแก้อีเมล
- ขนาด: body ≤ 500 KB · แนบ ≤ 10 MB/ไฟล์ · 20 ไฟล์ · เก็บ `retentionDays` (ค่าเริ่มต้น 2 ปี) → purge body/แนบ คงหัว (PDPA)

### 11.5 sequence/มอบหมาย/คะแนน
- sequence: 1 คน 1 ACTIVE (ลงทะเบียนซ้ำ → CONFLICT · เลือก "แทนที่") · ขั้น EMAIL ข้ามเมื่อไม่มีอีเมล/optOut (ไป WAIT ถัดไป) · LINE ข้ามเมื่อไม่มี identity/consent · TASK สร้างให้ owner · WAIT นับวันทำการ (ตาราง `BookingHours`? ไม่ — ใช้ `settings.businessDays[]` + วันหยุดร้าน) · sendWindow นอกเวลา → เลื่อนไปเวลาเปิดถัดไป · หยุดอัตโนมัติ 5 เหตุ (ตอบ/ชนะ/แพ้/optOut/bounce) · เปลี่ยนขั้นของ sequence ที่มีคนลงทะเบียน = สร้างเวอร์ชันใหม่ (คนเดิมจบตามเวอร์ชันเดิม)
- มอบหมาย: round-robin atomic (`UPDATE … SET rrCursor = (rrCursor+1) % n RETURNING`) · คนลา (HR) / ปิดรับ (`CrmEmailUserSetting`? ไม่ — ฟิลด์ `TeamMember.acceptingLeads`) ข้าม · `maxOpenPerUser` เต็ม → คนถัดไป → ไม่มี → fallback → ไม่มี = ไม่มอบหมาย + แจ้ง MANAGER
- คะแนน: `maxPerDay` ต่อกฎต่อคน (กันเปิดอีเมลรัว) · ล็อกหมดอายุตาม `expiresDays` → คะแนนลด (ไม่ต่ำกว่า 0) · เปลี่ยนกฎไม่ย้อนหลัง (ปุ่ม "คำนวณใหม่ทั้งร้าน" dry-run) · band ตาม settings · แสดงเหตุผล 3 ล่าสุด + ปุ่มดูทั้งหมด

### 11.6 ทีม/การมองเห็น/คอมมิชชัน/โควตา
- คนอยู่หลายทีมได้ · หัวหน้าทีมเห็นทีมที่ตน LEAD · ย้ายคนออกจากทีม → ดีลของเขายัง OWN ของเขา ทีมเดิมไม่เห็น (ยกเว้น MANAGER/OWNER) → หน้าตั้งค่าเตือน "โอนดีลก่อนไหม"
- ลบ/ระงับผู้ใช้ (Membership) → ดีล/ผู้ติดต่อค้าง owner → รายการ "ไม่มีผู้ดูแล" บนหน้าแรก MANAGER + bulk โอน · round-robin ข้ามอัตโนมัติ
- คอมมิชชัน: ฐาน PAID นับต่อการรับเงิน (ชำระบางส่วน = คอมมิชชันบางส่วน ตามสัดส่วน) · unique (deal, rule, user, refId) กันซ้ำ · ผู้ร่วม split ตาม `splitCollaboratorsBp` เท่ากันทุกคน · ผู้ดูแลเปลี่ยนหลังชนะ → คนที่เป็น owner ตอน "รับเงิน" (ตั้งได้: ตอนชนะ) · พนักงานไม่ผูก HrEmployee → APPROVED ค้าง "รอผูกพนักงาน" · reverse หลัง PAID → adjustment ติดลบงวดถัดไป (ไม่แก้ payroll เดิม) · `payoutDelayDays` เลื่อน periodKey
- โควตา: periodKey เดือน/ไตรมาส/ปี · ทีม = Σ ของสมาชิก หรือกำหนดเอง (ตั้งได้) · เปลี่ยนโควตาย้อนหลังต้อง MANAGER+ · รายงานใช้ค่าที่ตั้ง ณ ตอนนั้น (history ใน audit)

### 11.7 ติดตามเว็บ (C6) / PDPA
- ไม่มี consent = สคริปต์ไม่เก็บอะไรนอกจากแสดงแถบ (ไม่ตั้ง cookie) · ปฏิเสธ = จำ 180 วันไม่ถามซ้ำ (cookie ฟังก์ชันจำเป็นตัวเดียว) · ถอนได้จากลิงก์ท้ายเว็บ (`sd('revoke')`)
- visitor → ผู้ติดต่อ: ผูกเมื่อ (1) กรอกฟอร์มที่มี visitorId (2) คลิกลิงก์จากอีเมลที่มี token (3) ล็อกอิน portal · ผูกแล้ว session ย้อนหลังของ visitorId นั้นผูกด้วย (สูงสุด 180 วัน) · อุปกรณ์ร่วม (คอมสาธารณะ) → ผู้ติดต่อคนที่ 2 ผูกทับเฉพาะ session หลังจากนั้น
- เก็บ: url (ตัด query ที่ไม่ใช่ utm) · title · เวลาบนหน้า · referrer · UA ตัดสั้น · ipHash (salt หมุนรายเดือน) · ไม่เก็บ form values จากสคริปต์ (ฟอร์มเข้าผ่าน FormSubmission เท่านั้น) · โดเมนอนุญาตเท่านั้น (`tracking.web.domains`)
- retention → purge event/session · `CrmWebSession` ที่ผูกผู้ติดต่อคงสรุป (pageViews/first/last) เป็นกิจกรรม WEB
- ลบ PDPA (erase) ของสมาชิก/ผู้ติดต่อ: anonymize CrmContact (ชื่อ/เบอร์/อีเมล) · ลบ body อีเมล/ไฟล์เสียง/transcript · ลบ web session · คง ดีล/ประวัติขั้น/คอมมิชชัน (ตัวเลข) แบบไม่ระบุตัวตน · ส่งออกข้อมูล = รวมทุกตาราง CRM ของ Party

### 11.8 portal (C7)
- 1 ผู้ติดต่อเข้าได้หลายบริษัท (สลับ) · ถอดสิทธิ์ = session หมดทันที · ลิงก์เชิญใช้ครั้งเดียว · OTP 6 หลัก 10 นาที 5 ครั้ง · LINE login ต้องอีเมล/เบอร์ตรงกับผู้ติดต่อ (ไม่ตรง → คำขอให้พนักงานอนุมัติ)
- ตอบรับใบเสนอราคา = ลายเซ็นดิจิทัลอย่างง่าย (ชื่อ · เวลา · IP hash · UA) เก็บที่บัญชี (`account.quotation.responded` payload) · ใบเสนอราคาหมดอายุ → ตอบไม่ได้
- ชำระ: ลิงก์ PromptPay ของบัญชี · แนบสลิป → บัญชีตรวจ (flow เดิม) · ไม่มี card gateway (Beam 🔜)
- แจ้งเรื่อง → การ์ดบอร์ดงาน (ถ้าตั้ง `issueBoardId`) หรือ `CrmPortalRequest` อย่างเดียว · ลูกค้าเห็นสถานะ (เปิด/กำลังทำ/เสร็จ) จากคอลัมน์การ์ด (map)
- ไม่มี portal สำหรับผู้ติดต่อที่ไม่มีบริษัท (B2C ใช้ `/m/*` ของสมาชิก)

### 11.9 เพดาน (`Tenant.limits.crm.*` · ค่าเริ่มต้นใน `limits.ts` (แผน · crm/))
ผู้ติดต่อ 200,000/ระบบ · บริษัท 50,000 · ดีลเปิด 20,000 · pipeline 10 · ขั้น 12/pipeline · lines 100/ดีล · กิจกรรม ไม่จำกัด · อีเมล 2,000/วัน/ระบบ (Resend) · sequence 50 · ขั้น 20/sequence · ลงทะเบียน ACTIVE 5,000 · กฎมอบหมาย 30 · กฎคะแนน 50 · เทมเพลตอีเมล 100 · วัตถุ ไม่จำกัด (เตือน 30) · ฟิลด์ 60/วัตถุ · ลิงก์ติดตาม 1,000 · web event 5,000,000/เดือน (แจ้งก่อนถึง) · webhook 20 endpoint · automation 5,000 รัน/เดือน

---

## 12. Non-functional
- ประสิทธิภาพ: กระดานดีล 5 ขั้น × 50 ใบ ≤ 8 query ≤ 400 ms p95 บน 20,000 ดีล · หน้ารวมผู้ติดต่อ 50 แถว + ตัวกรอง 5 (กำหนดเอง 2) ≤ 12 query · forecast 12 เดือน × 4 หมวด ≤ 2 query (aggregate) · funnel จาก StageHistory ≤ 1 query/ขั้น · inbound email ≤ 1.5 วิ · tracking endpoints ≤ 50 ms (ไม่ query หนัก · เขียนอย่างเดียว)
- index ที่ต้องมี: ทุก `@@index` ใน §4 + composite `(systemId, ownerUserId, kind, expectedCloseAt)` สำหรับ forecast · `CrmEmailMessage(threadKey, sentAt)` · `CrmWebSession(visitorId)` · `CustomRecordValue(fieldId, valueDate)` สำหรับ field_due
- ความทน: sequence/scoring/commission ทุก consumer idempotent (unique key) · cron วนจนเงียบ ≤ 20 วิ · tracking ไม่ล้มถ้า DB ช้า (คิว outbox สำหรับ web events — batch insert)
- ความปลอดภัย: tracking/portal/email endpoints public → rate limit ต่อ IP+token · HMAC สำหรับ provider webhook · signed URL ไฟล์เสียง (15 นาที) · ไม่ log body อีเมล/transcript
- การเข้าถึง/i18n/ภาษาออกแบบ: เหมือน 06-member-v2 §12 · คำ: "ผู้ติดต่อ" (contact) · "บริษัท" (company) · "ดีล" (deal) · "ขั้น" (stage) · "pipeline" คงคำอังกฤษ · "lead" คงคำอังกฤษ (ป้าย "ผู้สนใจ" ในบางที่)
- มือถือ: ทุกหน้า ≤ 390px · portal mobile-first · แอปพนักงาน (ภาพ 13) ใช้ REST เดียวกัน

---

## 13. เกณฑ์ตรวจรับรายใบงาน (QC) — สรุป · รายละเอียดข้อสอบใน `ledger/CRM-RUN.md`

| เฟส | ใบ | เกณฑ์ผ่าน (นอกเหนือจาก oracle/tsc/fitness/regressions/ภาพ) |
|---|---|---|
| C1 โครง (11 ใบ) | C1.1 schema+Team+partyId ทุกระบบ+backfill+seed · C1.2 fields engine objectKey + custom objects service · C1.3 companies service+UI 360 · C1.4 contacts v2 (lifecycle/score field/convert/duplicates/import) + 360 UI · C1.5 deals v2 (lines/history/forecast/requirements) + กระดานลากได้ + ดีล 360 · C1.6 activities v2 + ปฏิทิน + บอร์ดงาน link · C1.7 visibility OWN/TEAM/ALL + สิทธิ์ 40 คีย์ + ตั้งค่า pipeline/ขั้น/เหตุผลแพ้ · C1.8 event 26 + consumer + bridges (สมาชิก/บัญชี/แชท/ฟอร์ม/บอร์ดงาน) · C1.9 custom objects UI (designer สลับวัตถุ · รายการ · แท็บ 360 · เทมเพลต 8) · C1.10 REST/AI ชุดแรก (~50 op · skill crm · webhook) · C1.11 มือถือ + แผงข้างแชท + เทมเพลตกิจการ 16 | US2/US3/US6/US8 ผ่าน · CRM v1 ใช้ต่อได้ทุกหน้า (regression `qc-crm-v1`) · ทุก event ลง 3 ทะเบียน · visibleWhere ในทุก list (ข้อสอบ thana/ทีม) |
| C2 เครื่องยนต์ขาย (11 ใบ) | C2.1 automation scope CRM + แอ็กชัน 14 + กฎเริ่มต้น 6 + dry-run · C2.2 sequences (engine+cron+UI) · C2.3 assignment (rules/round-robin/LEAST_OPEN/HR leave) · C2.4 activities capture: บันทึกโทร+AI ถอด/สรุป · แชท→กิจกรรม · นัดจากจอง/คลินิก/โรงเรียนในปฏิทิน · C2.5 อีเมล engine (routing C4 · send · inbound `crm+` · thread · templates · user settings · UI กล่อง/thread) · C2.6 tracking (pixel/คลิก/ลิงก์/ฟอร์ม UTM/`shark.js`+consent C6 + purge) · C2.7 บัญชี/POS bridges (quotation จาก lines · invoice · paid → recordPayment · PosSale.dealId) · C2.8 scoring (rules/log/decay/band/explain/threshold) · C2.9 event ระบบธุรกิจ (hotel/ticket/rental/school/clinic/shop/queue → partyId+event+consumer) · C2.10 ดีลนิ่ง + แจ้งเตือน 10 เทมเพลต + cron ทั้งชุด · C2.11 REST/AI ชุดสอง (~30 op) | US1/US4/US5/US9 ผ่าน · sequence หยุดครบ 5 เหตุ · inbound จับคู่ 6 กรณี · consent ไม่ยอมรับ = 0 แถว |
| C3 ทีม/รายงาน/portal (10 ใบ) | C3.1 reports 8 แท็บ + ส่งออก/ตั้งเวลา · C3.2 quotas + leaderboard + หน้าแรก KPI · C3.3 commissions (rules/calc PAID+WON/approval/HR adjustment/reverse/`hr.payroll.paid`) · C3.4 MEETING/KB bridges + AI ในหน้า (ดีลเสี่ยง/สรุป/ร่างอีเมล/นามบัตร) · C3.5 portal B2B (auth/quotes/invoices/pay/docs/requests/contacts · ธีมร้าน · LIFF) — **รอยืนยัน C7** · C3.6 ทีม core UI `/app/settings/teams` + visibility policies UI + integrations map (ภาพ 17) · C3.7 นำเข้า/ส่งออก/ตัวซ้ำ/รวม UI (ผู้ติดต่อ+บริษัท) · C3.8 REST/AI ชุดสาม (~16 op · portal op · objects dynamic op) + docs generator + skill manifest ครบ · C3.9 มือถือครบ + แอปพนักงาน (ดีลของฉัน/บันทึกสาย/งานวันนี้/สแกนนามบัตร) · C3.10 ปิดเฟส: qc:all เต็ม · backfill prod · handover | US7/US10 ผ่าน · คอมมิชชัน reverse ครบ · portal 404 ข้ามบริษัท · รายงานตรง ledger (ข้อสอบเทียบ SQL ตรง) |

---

## 14. หลังจากนี้ (นอก RUN นี้ · เรียงตามความคุ้ม)
1. **Gmail/Outlook sync** (`CrmMailProvider` · OAuth · Google verification · sync ขาเข้า-ออกทั้งกล่องของพนักงานที่เลือก) — ~3 ใบ
2. **VoIP/PBX** (`CrmCallProvider` · click-to-call ผ่านผู้ให้บริการ · บันทึกเสียงอัตโนมัติ · สายเข้าเด้งผู้ติดต่อ) — ~2 ใบ + เลือกผู้ให้บริการ
3. **Google/Microsoft Calendar sync** สองทาง — ~2 ใบ
4. **e-signature** สำหรับใบเสนอราคา/สัญญา (ต่อจาก portal) — ~2 ใบ
5. **AI forecast/next-best-action** จากประวัติชนะ/แพ้ของร้านเอง (ต้องมีข้อมูล ≥ 6 เดือน) — ~2 ใบ
6. **หลายสกุลเงิน** (ดีล/ใบเสนอราคา FX) — ผูกกับบัญชี
7. **Team ในบอร์ดงาน/HR** (มอบหมายทีม · แผนก HR ↔ Team) — ของโมดูลนั้น
8. **แผนที่พื้นที่/route ขาย** (พนักงานลงพื้นที่ · check-in VISIT ด้วย GPS) — ~2 ใบ
