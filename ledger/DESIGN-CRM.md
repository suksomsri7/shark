# ออกแบบใหม่: CRM v2 — จากระบบสมาชิก (แกน 70%) สู่ CRM เต็มรูปแบบ

> เอกสารออกแบบ · 10 กันยายน 2569 · ผู้เขียน: Fable (ทีมออกแบบ SHARK)
> โจทย์: `docs/modules/06-member-v2.md` §14 "ระบบนี้ต่อยอดเป็น CRM เต็มรูปแบบได้ไหม — ได้ และนี่คือทางไป" (ช่องว่าง 8 ข้อ · ประมาณ 25–30 ใบงาน) — เจ้าของสั่ง 10 ก.ย. "ออกแบบ CRM v2 ตาม §14 (ออกแบบก่อน ไม่ coding)"
> ภาพประกอบ: `ledger/design-crm/` (17 ภาพ — ดู `README.md` ในโฟลเดอร์นั้น · UI ชุดเดียวกับระบบสมาชิก/บอร์ดงาน/บัญชี)
> ⚠️ เอกสารนี้เป็น **แบบ** ยังไม่ได้แตะโค้ดจริง — สร้างจากการอ่านโค้ด/สคีมาที่มีอยู่จริงทั้งหมดก่อนวาด (crm · party · forms · chat · ecommerce · booking · kanban email-in · automation K2.9 · op registry · outbox · permissions/scope · hr/payroll · account v2 · marketing · member v2 ที่ลงแล้วใน M1.1)
> ✅ เจ้าของเคาะแล้ว 11 ก.ย. (§9) → ชุดเต็มส่งแล้ว: พิมพ์เขียว `docs/modules/20-crm-v2.md` + `docs/api/CRM-API.md` + `ledger/CRM-RUN.md` · **สถานะ = ยังไม่ RUN (มติ C10) · มติครบ 10/10 (portal B2B = ทำ)**

---

## 1. สรุปสำหรับเจ้าของ (อ่านหน้าเดียวจบ)

### สถานะวันนี้ พูดตรง ๆ
โมดูล CRM ที่มีอยู่คือ **"กระดานดีลขนาดเล็ก"** ไม่ใช่ CRM:
- ตาราง 4 ใบ: ผู้ติดต่อ (`CrmContact`) · pipeline · ขั้น (`CrmStage` มีความน่าจะเป็น %) · ดีล (`CrmDeal` มูลค่า · ขั้น · WON/LOST) · กิจกรรม (`CrmActivity` 6 ชนิด: โทร/ประชุม/อีเมล/LINE/งาน/โน้ต แต่เก็บได้แค่หัวข้อ+กำหนด+เสร็จ)
- **"บริษัท" เป็นแค่ข้อความ** ในช่อง `company` ของผู้ติดต่อ — ไม่มีตัวตนบริษัท ไม่มี "ใครเป็นใครในบริษัทนี้" ไม่มีดีลของบริษัท (ทั้งที่ `Party kind=COMPANY` มีแล้ว)
- หน้าจอ: ดีลเป็นคอลัมน์ต่อขั้นแต่ **ย้ายด้วยปุ่ม ◀ ▶** (ไม่ลาก) · ผู้ติดต่อ/งานติดตามเป็นรายการแบน **ไม่มีค้นหา ไม่มีตัวกรอง ไม่มีหน้า 360**
- **CRM ไม่ส่ง event สักตัว** (grep `emitOutbox` ใน `src/lib/modules/crm` = 0) → ไม่มีอัตโนมัติ · ไม่มี webhook · ดีลชนะแล้วไม่มีใครรู้ (ยกเว้น lifecycle ของผู้ติดต่อเปลี่ยนเป็น CUSTOMER)
- สิทธิ์มี 6 คีย์ (create/move/quote/…) **ไม่มี read · ไม่มี "เห็นเฉพาะดีลของตัวเอง/ทีม"** — พนักงานขายทุกคนเห็นทุกดีล
- ไม่มี: lead scoring · sequence · เตือนดีลนิ่ง · บันทึกโทร (ไม่มีตารางโทรที่ไหนในระบบ · `AUDIO` ในแชทคือคลิปเสียง ไม่ใช่สายโทร) · อีเมลผูกผู้ติดต่อ (ส่งออกได้ผ่าน Resend `sendEmail(to,subject,text)` แต่ไม่เก็บ ไม่มี thread ไม่รู้ว่าเปิดหรือยัง) · ปฏิทินนัด (โมดูล `meeting` เป็นแชทภายในแบบ Slack ไม่ใช่นัดลูกค้า) · forecast รายเดือน (มีแค่ตัวเลขถ่วงน้ำหนักตัวเดียว) · ทีม/พื้นที่ (ไม่มี `Team` ที่ไหนในสคีมา) · โควตา/คอมมิชชัน (payroll มี `HrPayAdjustment kind=COMMISSION` แต่ไม่มีอะไรสร้างให้) · portal ลูกค้า B2B · REST/AI (AI มีแค่ `crm_create_lead` + `recent_leads`)
- ฟอร์มเว็บ → CRM ทำได้ (`FormDef.crmEnabled` → สร้าง lead source=FORM + event `forms.submission.received`) แต่ยิงเข้า CRM **ระบบแรกที่เจอ** และไม่เก็บ UTM/ที่มา
- `ShopOrder` และ `Appointment` **ไม่มี `partyId`** และไม่ส่ง event → CRM/สมาชิก มองไม่เห็นคำสั่งซื้อออนไลน์และการจอง

**ของดีที่มีแล้วและจะไม่สร้างซ้ำ** (นี่คือเหตุผลที่ "CRM เต็มรูปแบบ" ใช้ ~30 ใบไม่ใช่ 100):
`Party` ตัวตนกลาง + จับคู่ + รวมตัวซ้ำ · **engine ฟิลด์กำหนดเอง** ของสมาชิก (M1.1 ลงแล้ว: `MemberSection/MemberField/MemberFieldValue` คอลัมน์แยกชนิด 11 ชนิด · sensitive policy · access log) · **engine กฎอัตโนมัติ K2.9** (เงื่อนไข/แอ็กชัน/dry-run/โควตา/loop-guard · `AutomationScope` มี MEMBER_TIER/MEMBER_JOURNEY รอไว้แล้ว) · **ทะเบียน op → REST → AI tool → skill → คู่มือ** (บอร์ดงาน 16 ไฟล์ op · บัญชี 199 op · fitness F13.x บังคับข้อสอบ/คู่มือ/skill) · outbox + consumer registry + webhook HMAC · สิทธิ์ 3 บทบาท + unit scope + `PERMISSION_PARAMS` (เพดานตัวเลข) · โมดูลอนุมัติ · บัญชี v2 (ใบเสนอราคา→ใบแจ้งหนี้→ใบเสร็จ · ลิงก์ชำระ PromptPay · หน้า public แบบ capability token `pay/[token]` `r/[token]` `vendor/[token]`) · อีเมลเข้าบอร์ดงาน K3.9 (`งาน+key@shark.in.th` · secret · dedupe messageId · แนบไฟล์) · ทะเบียนช่องทางกลาง `channels.ts` 15 key · แชท omnichannel + `ChatContact.partyId` · HR (`HrEmployee.linkedUserId` · payroll COMMISSION) · ฟอร์ม public · `AcquisitionLink` + `MemberAttribution` (first/last touch · utm)

### เปลี่ยนอะไร (แก่นของแบบนี้ · ตรงกับ 8 ข้อใน §14)
1. **วัตถุกำหนดเอง (Custom objects)** — เจ้าของสร้าง "ตาราง" ใหม่ได้เอง (สัตว์เลี้ยง · รถ · ทรัพย์สิน · สัญญา · เครื่องจักร · กรมธรรม์) ผูกกับ สมาชิก/ผู้ติดต่อ/บริษัท/ดีล แบบ 1–n หรือลอย ๆ · มีฟิลด์/เลย์เอาต์/สิทธิ์/ไทม์ไลน์/REST/AI เอง — **ไม่สร้าง engine ใหม่**: ต่อยอด `MemberSection/MemberField` ด้วยคอลัมน์ `objectKey` + ตาราง `CustomObject/CustomRecord/CustomRecordValue` (ตัวออกแบบฟิลด์หน้าเดิม ภาพ 03 ของสมาชิก ใช้กับทุกวัตถุ)
2. **Lead → ผู้ติดต่อ → บริษัท → ดีล ครบวงจร** — เพิ่มตัวตน **บริษัท** (`CrmCompany` ↔ `Party kind=COMPANY`) · ผู้ติดต่อสังกัดบริษัทได้หลายแห่งพร้อมตำแหน่ง/บทบาท (ผู้ตัดสินใจ/ผู้ประสานงาน/ฝ่ายบัญชี) · ดีลผูกบริษัท+ผู้ติดต่อหลัก+รายการสินค้า (`CrmDealLine` → ใบเสนอราคาอัตโนมัติ) · **ประวัติขั้นของดีล** (รู้ว่าอยู่ขั้นไหนกี่วัน) · เหตุผลแพ้เป็นทะเบียน · **lead scoring** จากพฤติกรรมจริง (แชทเข้า · เปิดอีเมล · กรอกฟอร์ม · ซื้อ · เข้าเว็บ) ตั้งกฎคะแนน/ลดตามเวลา · **แปลง lead** ปุ่มเดียว → สมาชิก (source CRM) + บริษัท + ดีล — เลือกแบบ HubSpot (ผู้ติดต่อคนเดียวมี lifecycle LEAD→PROSPECT→CUSTOMER ไม่แยกโมดูล Lead แบบ Zoho — คำถาม §8 ข้อ 1)
3. **Sales automation** — กฎอัตโนมัติ `AutomationRule scope=CRM` (trigger `crm.*` + เงื่อนไขทุกฟิลด์ดีล/ผู้ติดต่อ/บริษัท + แอ็กชัน 12 ตัว) · **Sequence** หลายขั้น (อีเมล/LINE/งาน/รอ N วัน · หยุดเมื่อตอบกลับ/ดีลชนะ) · **มอบหมายอัตโนมัติ** (round-robin/ตามพื้นที่/ตามสินค้า) · **ดีลนิ่ง** (cron รายวัน `crm.deal.stale {days}` → ป้ายเน่าบนการ์ด + เตือน + งานติดตาม) · task อัตโนมัติเข้าบอร์ดงาน (bridge K3.3 มีแล้ว)
4. **Activity capture** — บันทึกโทร (click-to-call `tel:` → โมดัลบันทึกหลังวางสาย · แนบไฟล์เสียง · **AI ถอดเสียง+สรุป+งานถัดไป**) · **อีเมลผูกผู้ติดต่อ** (ส่งจาก CRM ผ่าน Resend + เก็บ thread · เข้า: กล่องอีเมลร้าน `crm+key@shark.in.th` + ที่อยู่ BCC — reuse route K3.9 · จับคู่ผู้ส่ง→ผู้ติดต่อ · threading ด้วย In-Reply-To/References · **เปิด/คลิก** ผ่าน pixel+ลิงก์ติดตาม) · **ปฏิทิน** นัดลูกค้า (CrmActivity MEETING มีเวลาเริ่ม-จบ · มุมมองสัปดาห์ · เตือน · ส่ง .ics) · แชท/จอง/ซื้อ/เอกสาร มาเองผ่าน Party (ไทม์ไลน์เดียวกับสมาชิก 360)
5. **รายงาน/forecast** — forecast รายเดือนตามวันปิดคาด × ความน่าจะเป็น (+ หมวด commit/best case ที่พนักงานตั้งเอง) · **funnel** อัตราแปลงต่อขั้น + เวลาเฉลี่ยต่อขั้น (จากประวัติขั้น) · ยอดขายต่อคน/ทีม เทียบโควตา · กิจกรรมต่อคน · เหตุผลแพ้ · **ROI ต่อช่องทางที่มา** (AcquisitionLink/attribution) · อายุดีล · ส่งออก/ตั้งเวลา — ใช้โครงรายงานสมาชิก (ภาพ 25 ของสมาชิก) เป็นฐาน
6. **ทีม/พื้นที่/โควตา/คอมมิชชัน** — **`Team` เป็นของกลางทั้งแอป** (ใหม่ · ไม่มีในสคีมา) ผูกสมาชิกทีม+หัวหน้า+สาขา · **การมองเห็น 3 ระดับ**: ของตัวเอง / ทีม / ทั้งร้าน (ตั้งต่อบทบาทแบบ Zoho data sharing) · พื้นที่ = กฎมอบหมาย (จังหวัด/ช่องทาง/สินค้า → คน/ทีม) · โควตาต่อคน/ทีม/เดือน · **คอมมิชชัน** กฎ % ตามชนะ/รับเงิน → สร้างรายการ `HrPayAdjustment kind=COMMISSION` (payroll มีแล้ว) ผ่านอนุมัติ
7. **Web/email tracking** — pixel เปิดอีเมล + ลิงก์คลิก (`/t/o/{token}` `/t/c/{token}`) ใช้ทั้ง CRM email/sequence และแคมเปญสมาชิก (เติม `MktRecipient.openedAt` ที่มีคอลัมน์แต่ยังไม่มีใครเขียน) · **ฟอร์ม lead บนเว็บร้าน** = ฟอร์ม public เดิม + โค้ดฝัง + UTM/`?src=` → `CrmContact.sourceDetail` + attribution · สคริปต์ติดตามหน้าเว็บ (page view ผูกผู้ติดต่อหลังกรอกฟอร์ม/คลิกอีเมล) เป็นตัวเลือกพร้อม cookie consent — แนะนำ 🔜 (คำถาม §8 ข้อ 6)
8. **Portal ลูกค้า B2B** — ลูกค้าบริษัทเข้า `/p/*` ด้วย OTP อีเมล/LINE (platform_auth เดิม) เห็น **ใบเสนอราคา (ตอบรับ/ปฏิเสธ = `account.quotation.responded` มีแล้ว) · ใบแจ้งหนี้ · ชำระ (ลิงก์ PromptPay มีแล้ว) · ใบเสร็จ · เอกสาร · ผู้ติดต่อของบริษัท · แจ้งเรื่อง (→ การ์ดบอร์ดงาน)** — ต่อจากหน้า `/m/*` ของสมาชิก (ชุด UI เดียว)
9. **ทุกอย่างเปิดเป็น REST + AI tool + webhook** — ทะเบียน op `crm` ~90 op · AI tool ~30 · skill `crm` ขยายจาก 4 tool · event `crm.*` 24 ตัว — เหมือนบอร์ดงาน/บัญชี/สมาชิก

### ทำไปแล้วได้อะไร
- **ขายแบบ B2B ได้จริง** (บริษัท · หลายผู้ติดต่อ · ใบเสนอราคาจากรายการสินค้า · portal ให้ลูกค้ากดตอบรับ/จ่าย) — วันนี้ทำได้แค่ B2C แบบง่าย
- **พนักงานขายไม่ลืมตาม** — sequence/ดีลนิ่ง/งานอัตโนมัติ/มอบหมายเอง · เจ้าของเห็น forecast รายเดือนและใครทำได้ตามโควตา
- **บันทึกการติดต่อครบทุกช่อง** (โทร/อีเมล/LINE/แชท/นัด) ในไทม์ไลน์เดียวกับสมาชิก 360 — ไม่ต้องถามว่า "คุยกับลูกค้ารายนี้ล่าสุดว่าอะไร"
- **เก็บข้อมูลอะไรก็ได้** ด้วย custom objects (คลินิกสัตว์: สัตว์เลี้ยง · อู่: รถ · ประกัน: กรมธรรม์ · B2B: สัญญา/เครื่องจักรที่ติดตั้ง) โดยไม่รอเราเขียนโค้ด
- **ต่างจาก Zoho/HubSpot**: อยู่บ้านเดียวกับ POS/จอง/แชท LINE/บัญชี/บอร์ดงาน/HR/อนุมัติ/AI · คอมมิชชันไหลเข้า payroll · ใบเสนอราคาเป็นเอกสารบัญชีจริงไม่ใช่ PDF ลอย ๆ

### แรงที่ต้องใช้ (ประมาณการหยาบ · วิธีเดียวกับ RUN สมาชิก)
| ระยะ | ได้อะไร | WO | ขนาด |
|---|---|---|---|
| **C1 — โครง: บริษัท · ผู้ติดต่อ/ดีล v2 · custom objects · event · REST ชุดแรก** | บริษัท 360 · ดีล 360 ลากได้ · ประวัติขั้น · รายการสินค้า→ใบเสนอราคา · แปลง lead · custom objects · event 24 ตัว · REST/AI ชุดแรก · การมองเห็น own/team/all | 11 | ~2 สัปดาห์ |
| **C2 — เครื่องยนต์ขาย: automation · sequence · activity · อีเมล · tracking · scoring** | กฎ scope CRM · sequence · มอบหมายอัตโนมัติ · ดีลนิ่ง · บันทึกโทร+AI · กล่องอีเมลผู้ติดต่อ · pixel/คลิก · lead score · ปฏิทิน | 10 | ~2 สัปดาห์ |
| **C3 — ทีม/รายงาน/portal: team · โควตา · คอมมิชชัน · รายงาน 8 แท็บ · portal B2B · มือถือ · AI/REST ชุดสอง** | Team กลาง · โควตา · คอมมิชชัน→payroll · forecast/funnel/ROI · portal `/p/*` · แอปพนักงาน · webhook/skill ครบ | 9 | ~1.5–2 สัปดาห์ |
| รวม | | **30** | ~5–6 สัปดาห์ (จังหวะเดียวกับสมาชิก 34 ใบ) |

**ข้อพึ่งพา RUN สมาชิก** (กำลังทำ · `ledger/MEMBER-RUN.md`): C1 ต้องรอ **M1.2 fields engine** + **M1.4 profile/360** (ไทม์ไลน์รวม + ตัวตน) + **M1.11 REST ชุดแรก** (โครง registry ของสมาชิก) · C2 ต้องรอ **M3.3 journey** (แอ็กชัน SEND_LINE/SEND_EMAIL/WAIT_THEN ของ engine) · ถ้าเริ่ม CRM ก่อน M3.3 ต้องสร้างแอ็กชันเหล่านั้นใน CRM แล้วให้สมาชิกใช้ต่อ (ห้ามทำสองชุด) — ดู §8 ข้อ 10

---

## 2. หลักการออกแบบ (บังคับใช้ทุกส่วน · สืบทอดจาก DESIGN-MEMBER §2)

1. **Party = ตัวตน · CrmContact = ผู้ติดต่อของ CRM · CrmCompany = บริษัทของ CRM · Customer = สมาชิก** — ไม่รวมตาราง · ทุกตัวมี `partyId` บังคับตอนสร้าง (ผู้ติดต่อมีแล้ว · บริษัทใหม่ = `Party kind=COMPANY` · ปิดช่องโหว่ `ShopOrder`/`Appointment` ไม่มี partyId) · หน้า 360 ของทุกตัวตนดึงไทม์ไลน์จาก `partyId` เดียวกัน (สมาชิก 360 กับผู้ติดต่อ 360 คือ **หน้าเดียวกันคนละหมวก**: แท็บ "การขาย" โผล่เมื่อมี CrmContact · แท็บ "สมาชิก" โผล่เมื่อมี Customer)
2. **engine เดิม 3 ตัว ห้ามสร้างซ้ำ**: ฟิลด์ (`MemberSection/Field` + `objectKey`) · อัตโนมัติ (`AutomationRule scope=CRM` บน K2.9 · แอ็กชันสื่อสารใช้ชุดเดียวกับ journey สมาชิก) · ทะเบียน op (`defineCrmOp` แบบ `defineKanbanOp`) — ใบงานไหนอยากสร้าง engine ใหม่ต้องแย้งพร้อมหลักฐาน
3. **เหตุการณ์ก่อน ผลตามหลัง** — CRM emit outbox ทุกการเปลี่ยนแปลงสำคัญ (วันนี้ 0 → 24 ตัว) · ผลข้างเคียงทั้งหมด (score · sequence · คอมมิชชัน · แจ้งเตือน · สมาชิก · บอร์ดงาน · webhook) เป็น consumer · event ใหม่ลง 3 ทะเบียน (consumer/AUTOMATION_EVENTS/WEBHOOK_EVENTS) ในใบเดียวกับที่ emit
4. **สมุดบัญชีที่แก้ย้อนไม่ได้**: ประวัติขั้นดีล · คะแนน lead (`CrmScoreLog`) · คอมมิชชัน · อีเมล/การเปิด · การมอบหมาย — แก้ = เขียนรายการใหม่
5. **การมองเห็นเป็นกฎ ไม่ใช่โค้ด**: `crm.visibility` ต่อบทบาท = OWN / TEAM / ALL · ทุก list/get/report ผ่านตัวกรองเดียว `visibleDealsWhere(actor)` · 404-not-403 · unit scope เดิมยังใช้ (ทีมผูกสาขาได้)
6. **PDPA/ความยินยอมใช้ของสมาชิก** — อีเมล/LINE ที่ CRM ส่งเคารพ `MemberConsent` ของ Party เดียวกัน · ผู้ติดต่อที่ยังไม่เป็นสมาชิกมี `CrmContact.emailOptOut/marketingOptOut` + ลิงก์ยกเลิกรับในทุกอีเมล · pixel/tracking ปิดได้ต่อร้าน · portal ลูกค้าเห็นเฉพาะเอกสารของบริษัทตน
7. **UI ชุดเดียวกับทั้งแอป** — จานสี/คอมโพเนนต์เดิม · pipeline ลากได้แบบบอร์ดงาน (dnd เดียวกับ K1.x) · มือถือครบเท่าเดสก์ท็อป · ทุกหน้าใน §6 มีภาพอ้างอิงเพื่อ parity

---

## 3. ช่องว่าง 8 ข้อของ §14 — ออกแบบละเอียด

### 3.1 Custom objects — วัตถุกำหนดเอง (ภาพ 06)
**สิ่งที่ผู้ใช้ทำได้**: ตั้งค่า → "วัตถุ" → เพิ่มวัตถุ (ชื่อเอกพจน์/พหูพจน์ · ไอคอน · ผูกกับ: สมาชิก / ผู้ติดต่อ / บริษัท / ดีล / ไม่ผูก · ความสัมพันธ์ 1–n · แสดงเป็นแท็บใน 360 ของแม่ · ฟิลด์ "ชื่อรายการ" คืออะไร) → เปิดตัวออกแบบฟิลด์ **หน้าเดิมของสมาชิก (ภาพ 03)** โดยสลับ "วัตถุ" มุมซ้ายบน → ได้ทันที: หน้ารายการ (ตาราง/ตัวกรองทุกฟิลด์ `filterable` · มุมมองบันทึก) · หน้ารายการเดี่ยว (เลย์เอาต์ส่วน/ฟิลด์ · ไทม์ไลน์ · ไฟล์ · โน้ต) · แท็บในหน้า 360 ของแม่ · REST `/objects/{key}/records` · AI tool `crm_records_*` · webhook `custom.record.*` · ใช้ในเงื่อนไขกฎอัตโนมัติ/segment (`o.{objectKey}.{fieldKey}` เช่น "มีรถที่ครบกำหนดเช็กระยะใน 30 วัน")
**เทมเพลตวัตถุ** (ข้อมูล JSON แบบเทมเพลตกิจการ D7): สัตว์เลี้ยง (ชนิด/พันธุ์/วันเกิด/น้ำหนัก/วัคซีน) · รถ (ทะเบียน/ยี่ห้อ/รุ่น/เลขไมล์/วันเช็กระยะ) · ทรัพย์สิน/เครื่องจักรที่ติดตั้ง (รุ่น/S/N/วันติดตั้ง/หมดประกัน) · สัญญา (เลขที่/เริ่ม-สิ้นสุด/มูลค่า/ต่ออายุอัตโนมัติ) · กรมธรรม์ · อสังหาฯ ที่สนใจ · โครงการ · เด็ก/ผู้เรียน (โรงเรียน) — เลือกแล้วแก้ต่อได้
**กติกา**: เพดาน 10 วัตถุ/ร้าน · 60 ฟิลด์/วัตถุ (เพดานเดิม) · วัตถุมีข้อมูลลบไม่ได้ (เก็บถาวรได้) · ฟิลด์ LOOKUP เพิ่มเป้าหมาย = วัตถุกำหนดเองอื่น (`MemberLookupTarget` + `CUSTOM:{objectKey}`) · sensitive/policy/access log ใช้ของสมาชิก (D8/D17) · unit scope ตาม `CustomRecord.unitId?`
**วิธีทำโดยไม่สร้าง engine ใหม่**: `MemberSection.objectKey` + `MemberField.objectKey` (ค่าเริ่มต้น `customer` = ของเดิมทั้งหมด ไม่ต้อง backfill) · วัตถุมาตรฐานของ CRM ก็ใช้ engine เดียวกัน: `objectKey ∈ {customer, contact, company, deal}` → **ผู้ติดต่อ/บริษัท/ดีล มีฟิลด์กำหนดเองด้วยฟรี ๆ** (ค่าเก็บใน `CustomRecordValue` โดย `recordType=CONTACT|COMPANY|DEAL|CUSTOM`, `recordId`) · `MemberFieldValue` ของสมาชิกคงเดิม

### 3.2 Lead → ผู้ติดต่อ → บริษัท → ดีล (ภาพ 02 · 03 · 04 · 05)
**โมเดลที่เลือก (HubSpot-style)**: ผู้ติดต่อ 1 ตาราง มี `lifecycleStage` LEAD → PROSPECT (MQL/SQL ตั้งชื่อได้) → CUSTOMER → LOST/CHURNED + `leadStatus` (NEW/CONTACTED/QUALIFIED/UNQUALIFIED/NURTURE) — ไม่แยกโมดูล Lead แบบ Zoho เพราะ SME ไทยไม่มีทีม SDR แยก และการ "แปลง" ที่ต้องย้ายข้อมูลข้ามตารางคือจุดที่ Zoho ทำผู้ใช้งง (คำถาม §8 ข้อ 1)
**บริษัท (`CrmCompany`)**: ชื่อ · เลขภาษี/สาขา (จับคู่ Party ด้วยเลขภาษี → ชื่อ+โดเมนอีเมล) · อุตสาหกรรม · ขนาด · เว็บไซต์ · โทร/อีเมลกลาง · ที่อยู่ (หลายที่ผ่าน `MemberAddress` แบบเดียวกับสมาชิก — `ownerType`) · ผู้ดูแล · ทีม · บริษัทแม่ · lifecycle · คะแนน · แท็ก · ฟิลด์กำหนดเอง (`objectKey=company`)
**ผู้ติดต่อ ↔ บริษัท**: ตาราง `CrmCompanyContact` (contactId · companyId · ตำแหน่ง · บทบาท: DECISION_MAKER/INFLUENCER/COORDINATOR/BILLING/TECHNICAL/OTHER · isPrimary · เริ่ม/สิ้นสุด) → คนเดียวอยู่ได้หลายบริษัท (ผู้รับเหมา/ตัวแทน) · บริษัทมีผู้ติดต่อหลัก 1 คน · ย้ายบริษัทเก็บประวัติ
**ดีล v2**: `companyId` · ผู้ติดต่อหลัก + ผู้ติดต่อร่วม (`CrmDealContact` บทบาท) · **รายการสินค้า `CrmDealLine`** (สินค้า/บริการจากคลัง · จำนวน · ราคา · ส่วนลด → มูลค่าดีลคำนวณเอง · ปุ่ม "ออกใบเสนอราคา" ส่งรายการเข้า `account.createExternalQuotation` แทนที่จะออกใบว่าง) · `stageEnteredAt` + **`CrmDealStageHistory`** (จาก→ไป · ใคร · เมื่อไร · อยู่ขั้นเดิมกี่วัน) · `forecastCategory` PIPELINE/BEST_CASE/COMMIT/OMITTED (พนักงานตั้ง) · `nextStep` ข้อความสั้น · `lostReasonId` → ทะเบียน `CrmLostReason` (ราคา/คู่แข่ง/ไม่ตอบ/เลื่อน/อื่น ตั้งเพิ่มได้ · บังคับกรอกเมื่อ LOST) · `source` + `attributionId` (ที่มาแบบ D10) · `invoiceDocId`/`wonValueSatang` (มูลค่าจริงหลังออกใบแจ้งหนี้) · `collaboratorUserIds[]` · `stalledAt` (cron) · หลาย pipeline ต่อระบบ (มีแล้ว) + สิทธิ์ต่อ pipeline (ทีมไหนเห็น)
**Lead scoring**: ทะเบียน `CrmScoreRule` {trigger event · เงื่อนไข · คะแนน ± · หมดอายุคะแนน N วัน} ค่าเริ่มต้น 8 กฎ (ฟอร์ม +10 · แชทเข้า +5 · เปิดอีเมล +3 · คลิกลิงก์ +5 · นัดสำเร็จ +15 · ซื้อ/จ่าย +20 · ไม่ตอบ 30 วัน −10 · ตำแหน่ง=ผู้ตัดสินใจ +10) · consumer ของ outbox เขียน `CrmScoreLog` + อัปเดต `CrmContact.score/scoreUpdatedAt` · เกณฑ์ "ร้อน/อุ่น/เย็น" ตั้งได้ · cron ลดคะแนนตามอายุ · กฎอัตโนมัติใช้ `score >= 50` เป็นเงื่อนไข/trigger `crm.score.threshold`
**แปลง lead** (โมดัลใน ภาพ 05): เลือก ✓ สร้างสมาชิก (ระบบ MEMBER · source=CRM · ให้แต้มต้อนรับตามกฎสมาชิก) ✓ สร้าง/ผูกบริษัท (ค้นด้วยเลขภาษี/ชื่อ) ✓ เปิดดีล (pipeline · ขั้น · มูลค่า) → 1 transaction + event `crm.contact.converted` · `crm.deal.won` → สมาชิกอัตโนมัติ (มีในแผนสมาชิก §7.1 แล้ว)
**ตัวซ้ำ**: ใช้ `PartyMergeCandidate` เดิม + หน้า "รวมผู้ติดต่อ" แบบภาพ 11 ของสมาชิก (เลือกค่าต่อฟิลด์ · ย้ายดีล/กิจกรรม/อีเมล) · บริษัทซ้ำจับด้วยเลขภาษี/โดเมน

### 3.3 Sales automation (ภาพ 07)
- **กฎอัตโนมัติ** `AutomationRule scope=CRM` (`pipelineId?` แทน boardId) — trigger: ทุก `crm.*` §4 + `crm.deal.stale{days}` + `crm.activity.overdue` + `crm.score.threshold{score}` + `forms.submission.received` + `chat.message.received` (ผูก Party) + `account.quotation.responded` + `account.invoice.paid` · เงื่อนไข: ทุกฟิลด์ดีล/ผู้ติดต่อ/บริษัท (ระบบ + `f.{key}`) · ขั้น · pipeline · มูลค่า · ผู้ดูแล/ทีม · ที่มา · คะแนน · lifecycle · วันนิ่ง · แอ็กชัน 12: `MOVE_STAGE` · `ASSIGN{userId|ROUND_ROBIN{teamId}|RULE}` · `CREATE_ACTIVITY{type,title,dueIn}` · `OPEN_KANBAN_CARD` (K3.3) · `SEND_EMAIL{templateId}` · `SEND_LINE{templateId}` · `ENROLL_SEQUENCE{sequenceId}` / `STOP_SEQUENCE` · `SET_FIELD{key,value}` · `ADD_TAG` · `NOTIFY_STAFF{owner|team|users}` · `WEBHOOK` · `WAIT_THEN{days, thenActions[]}` (ชุดเดียวกับ journey สมาชิก M3.3) · dry-run/โควตา/loop-guard/บันทึกการรัน ของ K2.9
- **Sequence** (`CrmSequence` + `CrmSequenceStep` + `CrmSequenceEnrollment`): ขั้น = EMAIL / LINE / TASK / WAIT{days, เฉพาะวันทำการ?} · เทมเพลตมีตัวแปร {ชื่อ} {บริษัท} {ดีล} {ลิงก์ใบเสนอราคา} · ส่งในเวลาทำการ (quiet hours ของสมาชิก §7.4) · **หยุดอัตโนมัติ** เมื่อ ตอบอีเมล/แชทกลับ · ดีลชนะ/แพ้ · ยกเลิกรับ · ถูกหยุดมือ · สถิติต่อขั้น (ส่ง/เปิด/ตอบ/นัด) · ลงทะเบียนได้จากกฎ/ปุ่มบนผู้ติดต่อ/bulk · 1 คนอยู่ได้ 1 sequence ต่อครั้ง
- **มอบหมายอัตโนมัติ** `CrmAssignmentRule` (ลำดับ · เงื่อนไข: ที่มา/จังหวัด/สินค้า/ขนาดบริษัท/ภาษา/ช่องทาง · โหมด FIXED{user} / ROUND_ROBIN{team, นับตามคนที่ว่างสุด} / TEAM_LEAD) · ใช้ตอน lead ใหม่ทุกทางเข้า (ฟอร์ม/แชท/API/นำเข้า) · บันทึก `assignedBy=RULE:{id}` · เปลี่ยนมือ → event `crm.contact.assigned`
- **ดีลนิ่ง**: ตั้งค่า "ถือว่านิ่งเมื่อไม่มีกิจกรรม N วัน" ต่อขั้น (ค่าเริ่มต้น 7/14/30) · cron รายวัน 06:00 ไทย เขียน `stalledAt` + emit `crm.deal.stale` → การ์ดขึ้นขอบเหลือง/แดง + ตัวนับ "นิ่ง 12 วัน" · รายการ "ดีลที่ต้องดู" บนหน้าแรก · กฎเริ่มต้น "นิ่ง 14 วัน → งานติดตาม + แจ้งหัวหน้าทีม"
- **task อัตโนมัติ**: กิจกรรม CRM (`CrmActivity`) เป็นงานเบา · ถ้าต้องมีเช็กลิสต์/หลายคน → `OPEN_KANBAN_CARD` ผูกดีล (`KanbanCardLink linkType=DEAL` — เพิ่มชนิดลิงก์) · การ์ดเสร็จ → กิจกรรมเสร็จ (consumer `kanban.card.completed`)

### 3.4 Activity capture — โทร · อีเมล · ปฏิทิน (ภาพ 08)
- **`CrmActivity` v2**: ชนิดเพิ่ม CHAT/SMS/WHATSAPP/VISIT (ช่องทางจากทะเบียน `channels.ts`) · `direction` IN/OUT · `startAt/endAt/durationSec` · `outcome` (ทะเบียนต่อชนิด: โทร=รับสาย/ไม่รับ/ฝากข้อความ/เบอร์ผิด/สนใจ/ไม่สนใจ) · `body` (โน้ต) · `recordingFileId` · `transcript` · `aiSummary` · `attendees` (userIds + contactIds) · `location/meetingUrl` · `remindAt` · `source` MANUAL/AUTO/EMAIL/CHAT/CALENDAR · `sourceRef` · `companyId` · `completedById` · เขียนลง `MemberActivity` (ไทม์ไลน์กลาง) ผ่าน consumer `crm.activity.logged`
- **บันทึกโทร**: ปุ่มโทรบนผู้ติดต่อ/ดีล = `tel:` + เปิดโมดัล "บันทึกสาย" ทันที (ผลสาย · ระยะเวลา · โน้ต · งานถัดไป · แนบไฟล์เสียง) · แอปพนักงาน: หลังกดโทรจากแอป กลับมาแอปแล้วเด้งโมดัลเดียวกัน (ภาพ 13) · แนบไฟล์เสียง → **AI ถอดเสียง+สรุป+เสนอ next step** (ผ่าน AI credit เดิม · เป็น proposal) · ไม่ต่อ VoIP/PBX ในรอบนี้ (คำถาม §8 ข้อ 5) แต่ออกแบบ `CrmCallProvider` adapter ไว้ (webhook สายเข้า/ออก → กิจกรรมอัตโนมัติ)
- **อีเมลผูกผู้ติดต่อ** (`CrmEmailMessage` + `CrmEmailEvent`): **ส่งออก** จากหน้า 360/ดีล (เทมเพลต · ตัวแปร · แนบไฟล์ · CC · กำหนดเวลาส่ง · ผ่าน Resend `sendEmail` ขยายรับ html+attachments+headers) เก็บ `messageId` · `threadKey` · pixel/ลิงก์ติดตาม · **เข้า**: (ก) กล่องอีเมลร้าน `crm+{key}@shark.in.th` — ลูกค้าตอบกลับมาที่นี่เพราะ Reply-To ตั้งไว้ · (ข) **BCC/forward** ที่อยู่เดียวกันจากอีเมลส่วนตัวพนักงาน · ทั้งสองผ่าน route K3.9 `/api/email/inbound` เดิม (แยกด้วย prefix `crm+`) · จับคู่ From → ผู้ติดต่อ (อีเมล → Party → สร้าง lead ใหม่ถ้าไม่พบและตั้ง "อีเมลแปลกหน้าเป็น lead" เปิด) · threading ด้วย `In-Reply-To`/`References` → `threadKey` · ผู้ส่งเป็นพนักงาน (User.email) = OUT · ไม่รู้จัก = IN · แนบไฟล์ผ่าน storage · **ไม่ทำ Gmail/Outlook OAuth sync** รอบนี้ (คำถาม §8 ข้อ 4)
- **ปฏิทิน**: มุมมองวัน/สัปดาห์/เดือน ของกิจกรรม MEETING/CALL ที่มีเวลา · ของฉัน/ทีม · ลากเปลี่ยนเวลา · เตือน push/LINE ล่วงหน้า · ส่ง .ics ให้ลูกค้า (อีเมล) · ผูกกับโมดูลจอง: นัดที่สร้างจาก `Appointment` (Party เดียวกัน) โผล่ในปฏิทินอ่านอย่างเดียว · Google Calendar sync = 🔜
- **แชท**: ห้องแชทของ Party เดียวกันแสดงในไทม์ไลน์ (มีใน 360 สมาชิกแล้ว) + ปุ่ม "เปิดดีล/บันทึกกิจกรรม" ในแผงข้างห้องแชท (ภาพ 26 ของสมาชิกเพิ่มปุ่ม)

### 3.5 รายงาน / forecast (ภาพ 09)
แท็บ 8: **ภาพรวม** (KPI: pipeline เปิด · ถ่วงน้ำหนัก · ชนะเดือนนี้ · อัตราชนะ · รอบขายเฉลี่ย · ดีลนิ่ง) · **Forecast** (ตารางเดือน × หมวด PIPELINE/BEST_CASE/COMMIT/CLOSED · ต่อคน/ทีม · เทียบโควตา · กราฟแท่งซ้อน) · **Funnel** (จำนวน/มูลค่า/อัตราแปลง/วันเฉลี่ยต่อขั้น จาก `CrmDealStageHistory` · เลือกช่วง/pipeline) · **ยอดขายต่อคน/ทีม** (ชนะ · มูลค่า · โควตา % · คอมมิชชัน) · **กิจกรรม** (โทร/อีเมล/นัด ต่อคนต่อสัปดาห์ · อัตราตอบ) · **เหตุผลแพ้** · **ที่มา/ROI** (ต่อ `source`/AcquisitionLink/แคมเปญ: lead → ดีล → ชนะ → มูลค่า) · **lead score** (การกระจาย · ร้อน/อุ่น/เย็น · แปลงตามช่วงคะแนน) — ทุกแท็บ: ตัวกรองช่วง/ทีม/pipeline · ส่งออก CSV · ตั้งเวลาส่งอีเมล (ใช้ `ReportDef.configJson` + cron รายงานของบัญชี) · ตัวเลขทั้งหมดคำนวณจาก ledger (stage history · activity · commission) ไม่ใช่ตัวนับ cache ยกเว้น KPI หน้าแรก (cache รายวัน)

### 3.6 ทีม · พื้นที่ · โควตา · คอมมิชชัน (ภาพ 10)
- **`Team` ของกลาง** (core.prisma · tenant-scoped): ชื่อ · หัวหน้า · สมาชิก (`TeamMember` userId · บทบาท LEAD/MEMBER) · สาขาที่รับผิดชอบ `unitIds[]` · ใช้ได้ทั้ง CRM · มุมมองบันทึก TEAM ของสมาชิก (`MemberSavedView.scope=TEAM` มีค่าอยู่แล้วแต่ไม่มีตาราง) · บอร์ดงาน (มอบหมายทีม 🔜) · HR (แผนกยังเป็นข้อความ — ไม่แตะ)
- **การมองเห็น** `CrmVisibilityPolicy` ต่อบทบาท/ทีม: OWN (เฉพาะที่ตัวเองเป็นผู้ดูแล/ผู้ร่วม) · TEAM (ของทีมตน) · ALL · ค่าเริ่มต้น STAFF=TEAM · MANAGER=ALL ในสาขาที่มีสิทธิ์ · OWNER=ALL · ใช้กับ ผู้ติดต่อ/บริษัท/ดีล/กิจกรรม/รายงาน · "โอนดีล" ต้องมี `crm.deal.reassign`
- **พื้นที่ (territory)** = `CrmAssignmentRule` (§3.3) — ไม่สร้างตารางพื้นที่แยก · เงื่อนไขจังหวัด/ภาค (จากที่อยู่ Party) · ช่องทาง · สินค้า · ภาษา
- **โควตา `CrmQuota`**: ต่อคน/ทีม · งวด (เดือน/ไตรมาส/ปี) · เป้ามูลค่า + เป้าจำนวนดีล + เป้ากิจกรรม · แสดงบนหน้าแรก (แถบความคืบหน้า) · รายงาน · event `crm.quota.reached`
- **คอมมิชชัน**: `CrmCommissionRule` (ชื่อ · ฐานคิด WON หรือ PAID (แนะนำ PAID — จ่ายเมื่อเงินเข้า · คำถาม §8 ข้อ 3) · % หรือคงที่ · ขั้นบันได · ขอบเขต pipeline/สินค้า/ทีม · แบ่งผู้ร่วม %) → consumer `crm.deal.won`/`account.invoice.paid` สร้าง `CrmCommission` (ดีล · คน · จำนวน · สถานะ PENDING/APPROVED/PAID/REVERSED) → เมื่ออนุมัติ (โมดูลอนุมัติ entityType=CrmCommission) สร้าง `HrPayAdjustment kind=COMMISSION` (payroll มีแล้ว · ต้องมี `HrEmployee.linkedUserId`) · void ใบแจ้งหนี้ → REVERSED

### 3.7 Web / email tracking (ภาพ 11)
- **อีเมล**: pixel `GET /t/o/{token}.gif` + ลิงก์ `GET /t/c/{token}` → `CrmEmailEvent` OPEN/CLICK (+ UA/เวลา · ไม่เก็บ IP เต็ม) · ใช้กับ CRM email · sequence · **แคมเปญสมาชิก** (เติม `MktRecipient.openedAt/usedAt`) · bounce/complaint จาก webhook Resend → `emailBounced` บนผู้ติดต่อ + หยุด sequence
- **ฟอร์ม lead บนเว็บร้าน**: ฟอร์ม public เดิม (`/f/{token}`) + **โค้ดฝัง iframe/script** + ช่องซ่อน utm_* + `?src=` (AcquisitionLink target=WEB_FORM) → `FormSubmission` → lead (เลือกระบบ CRM ปลายทางในฟอร์ม ไม่ใช่ "ระบบแรกที่เจอ") + `sourceDetail{utm, linkId, pageUrl, referrer}` + `MemberAttribution` เมื่อกลายเป็นสมาชิก · ป้องกันสแปม (honeypot + rate) · แจ้ง LINE ผู้ดูแลที่ถูกมอบหมาย
- **สคริปต์ติดตามเว็บ (`shark.js`)** — ตัวเลือก: page view/เวลาบนหน้า ผูก visitor cookie → ผูกผู้ติดต่อเมื่อกรอกฟอร์ม/คลิกจากอีเมล → กิจกรรม VISIT + คะแนน · ต้องมี cookie consent banner · **แนะนำ 🔜** (คำถาม §8 ข้อ 6) — ออกแบบตาราง `CrmWebSession/CrmWebEvent` ไว้แต่ไม่อยู่ใน 30 ใบ
- **ลิงก์ติดตามทั่วไป**: `CrmTrackedLink` (สร้างลิงก์สั้น `shark.in.th/l/{code}` ใส่ใน LINE/โพสต์ · นับคลิก · ผูกแคมเปญ/ที่มา) — ต่อยอด AcquisitionLink (`target=URL`)

### 3.8 Portal ลูกค้า B2B (ภาพ 12)
- เส้นทาง `/p/*` (ชุด UI เดียวกับ `/m/*` ของสมาชิก · responsive · ใช้ใน LINE ได้) · เข้าด้วย **ลิงก์อีเมล+OTP** หรือ **LINE login** (platform_auth เดิม) · สิทธิ์ต่อผู้ติดต่อ (`CrmPortalAccess`: contactId · companyId · บทบาท VIEW/APPROVE/PAY · เปิด/ปิดโดยพนักงาน · เชิญทางอีเมล)
- หน้า: **ใบเสนอราคา** (ดู PDF · **ตอบรับ/ปฏิเสธ+เหตุผล** → `account.quotation.responded` มีแล้ว → ดีลเลื่อนขั้นอัตโนมัติ) · **ใบแจ้งหนี้/ค้างชำระ** (ชำระผ่านลิงก์ PromptPay `AccountPaymentRequest` มีแล้ว · แนบสลิป) · **ใบเสร็จ/ใบกำกับ** (ขอใบกำกับเต็ม = flow `r/[token]` เดิม) · **เอกสาร/สัญญา** (ไฟล์ที่พนักงานแชร์ + custom object "สัญญา" ที่ตั้ง `portalVisible`) · **ผู้ติดต่อของบริษัท** (ขอเพิ่ม/เปลี่ยน → พนักงานอนุมัติ) · **แจ้งเรื่อง** (ฟอร์ม → การ์ดบอร์ดงาน linkType=DEAL/COMPANY + ดูสถานะ) · **โปรไฟล์บริษัท** (แก้ที่อยู่ออกใบกำกับ → ผ่านอนุมัติ)
- ทุกการดู/ตอบ = event `crm.portal.*` → ไทม์ไลน์ + คะแนน + แจ้งผู้ดูแล · หน้า public เดิม (`pay/[token]` ฯลฯ) ยังใช้ได้สำหรับลูกค้าที่ไม่เปิด portal

### 3.9 REST · AI · webhook (ภาพ 14)
- `src/lib/modules/crm/api/` (แผน): `op.ts` (`defineCrmOp` module=crm) · `registry.ts` · `ops/{contacts,companies,deals,activities,emails,sequences,automation,objects,teams,quotas,commissions,reports,portal,settings}.ts` ≈ 90 op (read ~40 · write ~44 · danger ~6: ลบ/รวม/โอนดีลข้ามทีม/อนุมัติคอมมิชชัน) · REST `/api/v1/crm/*` catch-all แบบบัญชี · bundle สิทธิ์ `crm.readonly / crm.operate / crm.admin` · Idempotency-Key ทุก write · ทุก op มี `test` (F13.4) · generator `gen-crm-api-docs.mts` → `docs/api/CRM-API.md` (F13.5) · skill `crm` ใน `skills.ts` ขยาย 4 → ~30 tool (F13.6)
- AI tool สำคัญ: `crm_search` · `crm_pipeline_summary` · `crm_forecast` · `crm_stale_deals` · `crm_create_lead/company/deal` (proposal) · `crm_log_call` (จากเสียง/ข้อความ) · `crm_draft_email` · `crm_next_step` · `crm_enroll_sequence` (proposal) · `crm_records_query{objectKey}` · ผู้ช่วยในหน้า 360: "สรุปดีลนี้ · ร่างอีเมลติดตาม · เสนอ next step · ทำไมดีลนี้เสี่ยง"
- webhook: ทุก event §4 · HMAC เดิม · retry 5

---

## 4. ทุกระบบเชื่อมโยงกัน — ตารางเหตุการณ์ (หัวใจของแบบ)

### 4.1 event ใหม่ที่ CRM ส่ง (24 · วันนี้ 0) — ลง consumer + AUTOMATION_EVENTS + WEBHOOK_EVENTS พร้อมกันทุกตัว
| event | payload หลัก | consumer (ผลข้างเคียง) |
|---|---|---|
| `crm.contact.created` | contactId · partyId · source · sourceDetail · assignedTo | มอบหมายอัตโนมัติ · score · แจ้งผู้ดูแล · sequence "lead ใหม่" (ถ้ากฎตั้ง) · เชื่อม ChatContact/AccountContact ด้วย partyId |
| `crm.contact.updated` | contactId · changedKeys[] | sync ชื่อ/อีเมล → Party/สมาชิก/แชท · กฎ |
| `crm.contact.assigned` | contactId · from · to · by (USER/RULE) | แจ้งผู้รับ · ไทม์ไลน์ |
| `crm.contact.converted` | contactId · customerId? · companyId? · dealId? | สมาชิก (source CRM · แต้มต้อนรับ) · attribution · ไทม์ไลน์ |
| `crm.contact.merged` | keptId · mergedId | ย้ายดีล/กิจกรรม/อีเมล/portal · Party merge |
| `crm.company.created` / `.updated` | companyId · partyId | บัญชี: สร้าง/ผูก `AccountContact kind=CUSTOMER legalType=COMPANY` · ตัวซ้ำ |
| `crm.deal.created` | dealId · contactId · companyId · pipelineId · stageId · valueSatang · ownerUserId | ไทม์ไลน์ · กฎ · แจ้งทีม |
| `crm.deal.stage.changed` | dealId · from · to · daysInStage · by | stage history (เขียนใน tx เดียวกัน) · กฎ · sequence หยุด/เริ่ม · portal |
| `crm.deal.won` | dealId · contactId · companyId · valueSatang · lines[] | สมาชิก (มีในแผน §7.1) · **คอมมิชชัน (ฐาน WON)** · โควตา · บัญชี (ถ้าตั้ง "ออกใบแจ้งหนี้อัตโนมัติ") · หยุด sequence · แจ้งทีม · webhook |
| `crm.deal.lost` | dealId · lostReasonId · note | รายงาน · กฎ (เช่น เข้า sequence ดึงกลับ 90 วัน) |
| `crm.deal.reopened` · `crm.deal.reassigned` | dealId · … | ไทม์ไลน์ · แจ้ง |
| `crm.deal.stale` (cron) | dealId · days · stageId | ป้ายเน่า · กฎ "ดีลนิ่ง" · แจ้งหัวหน้าทีม |
| `crm.activity.logged` | activityId · type · direction · contactId · dealId · outcome | `MemberActivity` (ไทม์ไลน์กลาง) · score · ดีล `lastActivityAt` (ล้าง stale) · sequence (ตอบกลับ = หยุด) |
| `crm.activity.completed` / `.overdue` (cron) | activityId | กฎ · แจ้ง |
| `crm.email.sent` / `.opened` / `.clicked` / `.replied` / `.bounced` | emailId · contactId · sequenceStepId? | score · sequence (replied → หยุด · bounced → หยุด+ธง) · ไทม์ไลน์ · แคมเปญสมาชิก (openedAt) |
| `crm.sequence.enrolled` / `.finished` | enrollmentId · contactId · reason | ไทม์ไลน์ · สถิติ |
| `crm.score.changed` | contactId · from · to · ruleId | trigger `crm.score.threshold` · แจ้ง "lead ร้อน" |
| `crm.quota.reached` | ownerType · ownerId · period · pct | แจ้ง · ป้าย |
| `crm.commission.created` / `.approved` | commissionId · userId · amount | อนุมัติ → `HrPayAdjustment` · แจ้ง |
| `crm.portal.viewed` / `crm.portal.quote.responded` | contactId · docId · action | score · ดีลเลื่อนขั้น (ตอบรับ → ขั้น "ตกลง") · แจ้งผู้ดูแล |
| `custom.record.created` / `.updated` / `.archived` | objectKey · recordId · parentType · parentId | ไทม์ไลน์ของแม่ · กฎ · webhook |
| `team.updated` | teamId | cache การมองเห็น · มุมมอง TEAM |

### 4.2 event ของโมดูลอื่นที่ CRM ฟัง
| event (มีอยู่/ในแผน) | CRM ทำอะไร |
|---|---|
| `forms.submission.received` (มี) | lead ใหม่ + UTM/ที่มา + มอบหมายอัตโนมัติ (แทนการเรียก `createContact` ตรงใน forms — ย้ายเป็น consumer) |
| `chat.message.received` (มี) | ผูก Party → กิจกรรม CHAT (IN) · score · sequence หยุดถ้ากำลังรอตอบ · lead ใหม่ถ้าไม่พบและตั้งค่าเปิด |
| `account.quotation.responded` (มี) | ดีลเลื่อนขั้น ACCEPTED/REJECTED · กิจกรรม |
| `account.invoice.paid` (มี) | **คอมมิชชัน (ฐาน PAID)** · `wonValueSatang` · โควตา · lifecycle CUSTOMER |
| `account.document.voided` (มี) | คอมมิชชัน REVERSED · ดีลธง |
| `kanban.card.completed` (มี) | กิจกรรมที่ผูกการ์ดเสร็จ |
| `pos.sale.paid` (มี) · `shop.order.paid` · `booking.completed` (แผนสมาชิก) | กิจกรรม PURCHASE/VISIT ในไทม์ไลน์ · score · lifecycle |
| `member.created` · `member.tier.changed` (แผนสมาชิก) | ผู้ติดต่อ ↔ สมาชิก sync · ป้ายระดับบนผู้ติดต่อ/บริษัท |
| `approval.request.approved` (มี) | คอมมิชชัน APPROVED · portal เปลี่ยนที่อยู่ |

### 4.3 ผูก partyId ที่ยังขาด (ต้องปิดใน C1 ถ้าสมาชิกยังไม่ปิด)
`Appointment.partyId` · `ShopOrder.partyId` + event `booking.completed` · `shop.order.paid` (แผนสมาชิก M2.8/M3.x) · `forms` เขียน partyId ผ่าน CRM · `ChatContact.partyId` เขียนจริง (M1.x) — CRM 360 ขึ้นกับสิ่งเหล่านี้ · ใบแรกของ C1 ตรวจว่าใบไหนลงแล้ว ที่เหลือทำในใบเดียวกัน

---

## 5. ข้อมูลและสัญญา (สำหรับตอนสั่งทำ · ทั้งหมด additive · nullable/default)

### 5.1 แก้ตารางเดิม
```prisma
model CrmContact  { companyId? (บริษัทหลัก · cache จาก CrmCompanyContact isPrimary) ; jobTitle? ; department? ; leadStatus CrmLeadStatus @default(NEW) ; score Int @default(0) ; scoreUpdatedAt? ; teamId? ; lastActivityAt? ; nextActivityAt? ; emailOptOut Boolean @default(false) ; emailBouncedAt? ; convertedAt? ; assignedAt? ; assignedBy? ; sourceDetail Json? ; attributionId? ; locale? ; @@index([systemId, ownerUserId]) @@index([systemId, teamId]) @@index([systemId, score]) @@index([systemId, companyId]) }
model CrmDeal     { companyId? ; primaryContactId? (= contactId เดิม) ; teamId? ; stageEnteredAt DateTime @default(now()) ; stalledAt? ; lastActivityAt? ; nextStep? ; forecastCategory CrmForecastCategory @default(PIPELINE) ; lostReasonId? ; source MemberSource? ; attributionId? ; invoiceDocId? ; wonValueSatang Int? ; collaboratorUserIds String[] @default([]) ; currency String @default("THB") ; @@index([systemId, ownerUserId, kind]) @@index([systemId, expectedCloseAt]) @@index([systemId, stalledAt]) }
model CrmActivity { companyId? ; direction CrmDirection? ; startAt? ; endAt? ; durationSec Int? ; outcome? ; body? ; recordingFileId? ; transcript? ; aiSummary? ; attendees Json? ; location? ; meetingUrl? ; remindAt? ; source CrmActivitySource @default(MANUAL) ; sourceRef? ; completedById? ; kanbanCardId? ; channel String? (key จาก channels.ts) ; @@index([systemId, ownerUserId, startAt]) @@index([systemId, dueAt]) }
model CrmStage    { staleDays Int? ; requireFields String[] @default([]) (ฟิลด์ที่ต้องกรอกก่อนเข้าขั้น) ; rotDaysWarn Int? }
model CrmPipeline { teamIds String[] @default([]) ; autoInvoiceOnWon Boolean @default(false) ; currency String @default("THB") }
model MemberSection { objectKey String @default("customer") ; @@unique([systemId, objectKey, key]) }   // แทน @@unique([systemId,key])
model MemberField   { objectKey String @default("customer") ; @@unique([systemId, objectKey, key]) }
model MemberSavedView { objectKey String @default("customer") }   // มุมมองบันทึกของทุกวัตถุ
model MemberAddress   { ownerType MemberAddressOwner @default(CUSTOMER) ; ownerId String? }   // ที่อยู่บริษัท/ผู้ติดต่อ
model KanbanCardLink  { linkType += DEAL | COMPANY | CRM_CONTACT | CUSTOM_RECORD }
model AutomationRule  { scope += CRM ; pipelineId? ; crmSystemId? }
model Appointment { partyId? }   model ShopOrder { partyId? }   // ถ้าสมาชิกยังไม่เพิ่ม
model FormDef { crmSystemId? ; utmCapture Boolean @default(true) ; assignRuleId? }
model MktRecipient { emailMessageId? }   // แคมเปญใช้ tracking เดียวกัน
model AppSystem.settings.crm (Json) { visibility:{STAFF:"TEAM",MANAGER:"ALL"} · stale:{defaultDays:14} · email:{inboundKey, replyTo, trackOpens, trackClicks, strangerToLead} · scoring:{hot:50,warm:20,decayDays:30} · commission:{basis:"PAID"} · portal:{enabled, loginMethods:["EMAIL_OTP","LINE"]} }
```

### 5.2 ตารางใหม่ (17 + 2 core)
```prisma
// core (ของกลางทั้งแอป)
model Team        { tenantId ; name ; leadUserId? ; unitIds String[] ; color? ; archivedAt? ; @@unique([tenantId, name]) }
model TeamMember  { teamId ; userId ; role TeamRole @default(MEMBER) ; @@unique([teamId, userId]) }

// CRM (systemId = ระบบ CRM)
model CrmCompany         { tenantId ; systemId ; partyId (บังคับ · Party kind=COMPANY) ; name ; taxId? ; branchCode? ; industry? ; size CrmCompanySize? ; website? ; emailDomain? ; phone? ; email? ; lifecycleStage CrmLifecycleStage ; score Int ; ownerUserId? ; teamId? ; parentCompanyId? ; accountContactId? (บัญชี) ; memberCustomerId? ; tags String[] ; note? ; archivedAt? ; @@unique([systemId, partyId]) @@index([systemId, taxId]) @@index([systemId, emailDomain]) @@index([systemId, ownerUserId]) }
model CrmCompanyContact  { companyId ; contactId ; role CrmContactRole @default(OTHER) ; jobTitle? ; isPrimary Boolean ; startedAt? ; endedAt? ; @@unique([companyId, contactId]) }
model CrmDealContact     { dealId ; contactId ; role CrmContactRole ; @@unique([dealId, contactId]) }
model CrmDealLine        { dealId ; productId? (InvItem) ; name ; qty Decimal ; unitPriceSatang Int ; discountSatang Int @default(0) ; sortOrder ; @@index([dealId]) }
model CrmDealStageHistory{ dealId ; fromStageId? ; toStageId ; byUserId? ; bySource (USER/RULE/PORTAL/API) ; enteredAt ; leftAt? ; durationSec? ; @@index([dealId, enteredAt]) @@index([toStageId, enteredAt]) }
model CrmLostReason      { systemId ; key ; label ; sortOrder ; active ; @@unique([systemId, key]) }
model CrmScoreRule       { systemId ; event ; conditions Json? ; points Int ; expiresDays Int? ; active ; @@index([systemId, event]) }
model CrmScoreLog        { contactId ; ruleId? ; points ; reason ; refType? ; refId? ; expiresAt? ; @@index([contactId, createdAt]) }
model CrmAssignmentRule  { systemId ; name ; conditions Json ; mode CrmAssignMode ; userIds String[] ; teamId? ; rrCursor Int @default(0) ; sortOrder ; active }
model CrmSequence        { systemId ; name ; stopOnReply Boolean @default(true) ; stopOnWon Boolean @default(true) ; businessDaysOnly Boolean ; sendWindow Json? ; active ; stats Json? }
model CrmSequenceStep    { sequenceId ; index ; kind CrmSeqStepKind (EMAIL/LINE/TASK/WAIT) ; templateId? ; subject? ; body? ; waitDays Int? ; taskTitle? ; @@unique([sequenceId, index]) }
model CrmSequenceEnrollment { sequenceId ; contactId ; dealId? ; enrolledById? ; stepIndex Int ; nextAt? ; status CrmEnrollStatus (ACTIVE/DONE/STOPPED) ; stoppedReason? ; @@unique([sequenceId, contactId]) @@index([status, nextAt]) }
model CrmEmailMessage    { tenantId ; systemId ; contactId? ; companyId? ; dealId? ; direction CrmDirection ; messageId @unique ; inReplyTo? ; threadKey ; fromAddr ; toAddrs String[] ; ccAddrs String[] ; subject ; bodyHtml? ; bodyText? ; attachments Json? ; sentById? ; sentAt? ; receivedAt? ; status (QUEUED/SENT/DELIVERED/BOUNCED/FAILED/RECEIVED) ; providerId? ; sequenceStepId? ; campaignId? ; openCount Int ; clickCount Int ; firstOpenedAt? ; trackToken @unique ; @@index([contactId, sentAt]) @@index([threadKey]) @@index([systemId, direction, sentAt]) }
model CrmEmailEvent      { emailId ; kind (OPEN/CLICK/BOUNCE/COMPLAINT/REPLY) ; url? ; userAgent? ; at ; @@index([emailId, at]) }
model CrmQuota           { systemId ; ownerType (USER/TEAM) ; ownerId ; periodKey (2569-10 / 2569-Q4 / 2569) ; targetSatang BigInt ; targetDeals Int? ; targetActivities Int? ; @@unique([systemId, ownerType, ownerId, periodKey]) }
model CrmCommissionRule  { systemId ; name ; basis (WON/PAID) ; kind (PCT/FIXED/TIERED) ; config Json ; pipelineId? ; teamId? ; productIds String[] ; splitCollaboratorsBp Int @default(0) ; active }
model CrmCommission      { dealId ; ruleId ; userId ; amountSatang ; basisSatang ; status (PENDING/APPROVED/PAID/REVERSED) ; approvalRequestId? ; hrPayAdjustmentId? ; periodKey ; @@unique([dealId, ruleId, userId]) @@index([userId, periodKey]) }
model CrmPortalAccess    { companyId ; contactId ; role (VIEW/APPROVE/PAY) ; invitedById ; invitedAt ; lastLoginAt? ; revokedAt? ; @@unique([companyId, contactId]) }
model CrmTrackedLink     { tenantId ; systemId ; code @unique ; url ; name? ; campaignId? ; linkId? (AcquisitionLink) ; clicks Int ; active }
model CustomObject       { tenantId ; systemId ; key ; label ; labelPlural ; icon? ; parentType CustomParent (CUSTOMER/CONTACT/COMPANY/DEAL/NONE) ; titleFieldKey ; showAsTab Boolean ; portalVisible Boolean @default(false) ; sortOrder ; archivedAt? ; @@unique([systemId, key]) }
model CustomRecord       { tenantId ; systemId ; objectId ; parentType ; parentId? ; partyId? ; title ; unitId? ; ownerUserId? ; createdById? ; archivedAt? ; @@index([objectId, parentId]) @@index([objectId, title]) @@index([partyId]) }
model CustomRecordValue  { recordType (CONTACT/COMPANY/DEAL/CUSTOM) ; recordId ; fieldId ; valueText? ; valueNumber? ; valueDate? ; valueBool? ; valueOptions String[] ; valueRef? ; valueFileId? ; @@unique([recordId, fieldId]) @@index([fieldId, valueText]) @@index([fieldId, valueNumber]) @@index([fieldId, valueDate]) }
```
- enum ใหม่: `CrmLeadStatus` NEW CONTACTED QUALIFIED UNQUALIFIED NURTURE · `CrmLifecycleStage` += CHURNED · `CrmContactRole` DECISION_MAKER INFLUENCER COORDINATOR BILLING TECHNICAL OTHER · `CrmForecastCategory` PIPELINE BEST_CASE COMMIT OMITTED · `CrmDirection` IN OUT · `CrmActivityType` += CHAT SMS WHATSAPP VISIT · `CrmCompanySize` MICRO SMALL MEDIUM LARGE ENTERPRISE · `TeamRole` LEAD MEMBER · `AutomationScope` += CRM
- ทุกตารางลงทะเบียน `scope.ts` (F1) · `Team/TeamMember` = tenant · CRM = sys · `CustomRecordValue` = ผ่าน recordId (tenant)
- ไมเกรชัน additive ล้วน · `MemberSection/MemberField` unique เปลี่ยนเป็น 3 คอลัมน์ (ค่าเดิม objectKey=customer ไม่ชน) · backfill: `CrmCompany` จาก `CrmContact.company` ข้อความ (จับคู่ชื่อ → Party COMPANY · idempotent ทีละร้าน) · `CrmDealStageHistory` แถวแรกจาก `createdAt/stageId` ปัจจุบัน · `AccountContact legalType=COMPANY` ที่มี partyId → เสนอเป็น CrmCompany (ไม่สร้างอัตโนมัติ · หน้า "นำเข้าจากบัญชี")

### 5.3 สิทธิ์ (เพิ่มกลุ่ม crm ใน `permissions.ts`)
```
crm.contact.read/create/update/delete/convert/import/export/merge · crm.company.read/create/update/delete
crm.deal.read/create/update/move/delete/quote/reassign/lines · crm.activity.read/create/complete/delete · crm.email.send/read
crm.sequence.manage/enroll · crm.automation.manage · crm.score.manage · crm.object.manage · crm.record.read/create/update/delete
crm.team.manage · crm.quota.manage · crm.commission.view/approve · crm.report.view · crm.forecast.edit(ตั้ง commit/best case ของตัวเอง)
crm.portal.manage · crm.settings.manage · crm.api.manage · PERMISSION_PARAMS: crm._maxDealDiscountBp · crm._maxCommissionApproveSatang
```
- read-โดยนัยจากคีย์ `crm.*` ใดก็ได้ (บทเรียน K3.1) · การมองเห็น OWN/TEAM/ALL ซ้อนบนคีย์ (§3.6) · STAFF ค่าเริ่มต้น: contact/deal/activity read+create+update (TEAM) · email.send · sequence.enroll · MANAGER: + move/reassign/quote/report/commission.view/forecast (ALL ในสาขา) · OWNER: ทุกคีย์
- ฝั่ง portal: session ลูกค้า (`platform_auth`) ตรวจ `CrmPortalAccess` ทุก op `/p/*` · เห็นเฉพาะเอกสาร `AccountDocument.contactId ∈ บริษัทตน`

---

## 6. หน้าจอ (ภาพประกอบ · `ledger/design-crm/`)
| # | ภาพ | หน้า | URL (ใต้ `/app/sys/{sysId}/crm`) | สิ่งที่ต้องมี (เกณฑ์ parity) |
|---|---|---|---|---|
| 01 | `01-crm-home.png` | หน้าแรก CRM | `/` | เมนูซ้าย 9 หมวด (หน้าแรก/ดีล/ผู้ติดต่อ/บริษัท/กิจกรรม/ปฏิทิน/อีเมล/รายงาน/ตั้งค่า) · KPI 6 (pipeline · ถ่วงน้ำหนัก · ชนะเดือนนี้ vs โควตา · อัตราชนะ · ดีลนิ่ง · lead ร้อน) · งานวันนี้ · ดีลที่ต้องดู · leaderboard ทีม · ผู้ช่วย AI |
| 02 | `02-pipeline-board.png` | กระดานดีล | `/deals?pipeline=&view=board` | คอลัมน์ต่อขั้น + ยอดรวม/ถ่วงน้ำหนักต่อคอลัมน์ · การ์ด (ชื่อ·บริษัท·มูลค่า·ผู้ดูแล·วันปิดคาด·ป้ายนิ่ง·คะแนน·กิจกรรมถัดไป) · ลากได้ · ตัวกรอง (pipeline/ผู้ดูแล/ทีม/ช่วง/แท็ก/ฟิลด์กำหนดเอง) · สลับตาราง/forecast · bulk · มุมมองบันทึก |
| 03 | `03-deal-360.png` | ดีล 360 | `/deals/{id}` | หัว (ชื่อ·บริษัท·ผู้ติดต่อหลัก·ขั้นแบบ stepper คลิกได้·มูลค่า·วันปิด·ผู้ดูแล·หมวด forecast) · แท็บ ภาพรวม/รายการสินค้า/กิจกรรม/อีเมล/เอกสาร/ประวัติขั้น · รายการสินค้า → ปุ่มออกใบเสนอราคา · ไทม์ไลน์ · แถบขวา AI (สรุป·เสี่ยง·next step) + ผู้ติดต่อร่วม + sequence ที่กำลังรัน + เอกสารบัญชี + การ์ดบอร์ดงาน |
| 04 | `04-company-360.png` | บริษัท 360 | `/companies/{id}` | หัว (ชื่อ·เลขภาษี·อุตสาหกรรม·ขนาด·ผู้ดูแล·ทีม·lifecycle·คะแนน) · ตัวเลข 5 (ดีลเปิด/ชนะ/มูลค่ารวม/ค้างชำระ/กิจกรรมล่าสุด) · ผู้ติดต่อพร้อมบทบาท+หลัก · ดีล · เอกสารบัญชี · แท็บ custom object "สัญญา" · ไทม์ไลน์รวม Party · portal (ใครเข้าได้) |
| 05 | `05-contact-360-convert.png` | ผู้ติดต่อ 360 + แปลง lead | `/contacts/{id}` | หัว (lifecycle·leadStatus·คะแนนร้อน/อุ่น/เย็น+เหตุผลคะแนน·บริษัท+ตำแหน่ง·ผู้ดูแล·ที่มา first/last) · ส่วนฟิลด์ (ระบบ+กำหนดเอง objectKey=contact) · ไทม์ไลน์ · โมดัล "แปลง" 3 ติ๊ก (สมาชิก/บริษัท/ดีล) · ป้าย "เป็นสมาชิก Gold" เมื่อผูกแล้ว |
| 06 | `06-custom-objects.png` | วัตถุกำหนดเอง | `/settings/objects` · `/objects/{key}` | รายการวัตถุ (ไอคอน·ผูกกับ·จำนวนรายการ·ฟิลด์) · โมดัลเพิ่มวัตถุ (ชื่อ/ผูกกับ/ความสัมพันธ์/แท็บ/portal) · เทมเพลต 8 · ตัวออกแบบฟิลด์ (สลับวัตถุ) · ตัวอย่างแท็บ "รถ" ใน 360 + หน้ารายการวัตถุ |
| 07 | `07-automation-sequence.png` | กฎอัตโนมัติ + sequence | `/settings/automation` · `/sequences/{id}` | ตัวสร้างกฎประโยค scope CRM (trigger/เงื่อนไข/แอ็กชัน 12) · dry-run · รายการกฎ+สถิติ · sequence editor (ขั้น EMAIL/LINE/TASK/WAIT · หยุดเมื่อ) · รายชื่อที่ลงทะเบียน+สถานะขั้น · กฎมอบหมาย round-robin · ตั้งค่าดีลนิ่งต่อขั้น |
| 08 | `08-activity-call-email-calendar.png` | บันทึกโทร · กล่องอีเมล · ปฏิทิน | `/activities` · `/contacts/{id}?tab=email` · `/calendar` | โมดัลบันทึกสาย (ผล·ระยะ·โน้ต·งานถัดไป·แนบเสียง·AI ถอด/สรุป) · thread อีเมล (IN/OUT·เปิด 2 ครั้ง·คลิก·ตอบจากหน้านี้·เทมเพลต) · ปฏิทินสัปดาห์ (ของฉัน/ทีม·นัดจากโมดูลจอง) |
| 09 | `09-reports-forecast.png` | รายงาน | `/reports/{tab}` | แท็บ 8 · forecast ตารางเดือน×หมวด + แท่งซ้อน · funnel ต่อขั้น (อัตรา/วัน) · ยอดต่อคน vs โควตา · เหตุผลแพ้ · ROI ต่อที่มา · ส่งออก/ตั้งเวลา |
| 10 | `10-teams-quota-commission.png` | ทีม · การมองเห็น · โควตา · คอมมิชชัน | `/settings/teams` · `/settings/quotas` · `/settings/commissions` | ทีม (สมาชิก·หัวหน้า·สาขา) · ตารางการมองเห็น บทบาท×OWN/TEAM/ALL · กฎมอบหมายพื้นที่ · ตารางโควตารายเดือน · กฎคอมมิชชัน (ฐาน/%/ขั้นบันได/แบ่ง) · รายการคอมมิชชันรออนุมัติ → payroll |
| 11 | `11-web-email-tracking.png` | ติดตามเว็บ/อีเมล + ฟอร์ม lead | `/settings/tracking` · `/settings/forms` | สวิตช์ pixel/คลิก · สถิติเปิด/คลิก/bounce · โค้ดฝังฟอร์ม + UTM · ลิงก์ติดตาม (สร้าง/คลิก) · สคริปต์เว็บ 🔜 + cookie consent · กล่องอีเมลร้าน `crm+key@` + BCC + "อีเมลแปลกหน้าเป็น lead" |
| 12 | `12-portal-b2b.png` | Portal ลูกค้า B2B (มือถือ+เดสก์ท็อป) | `/p/*` | เข้าสู่ระบบ OTP/LINE · หน้าแรกบริษัท (ค้างชำระ·ใบเสนอราคารอตอบ) · ใบเสนอราคา ตอบรับ/ปฏิเสธ · ใบแจ้งหนี้+ปุ่มชำระ · เอกสาร/สัญญา · แจ้งเรื่อง · ผู้ติดต่อ |
| 13 | `13-mobile-staff-crm.png` | แอปพนักงานขาย (390px) | (แอป SHARK) | รายการดีลของฉัน (การ์ด·ป้ายนิ่ง) · หน้าโทร → โมดัลบันทึกสายหลังวางสาย · งานวันนี้ · ค้นผู้ติดต่อ/สแกนนามบัตร (AI อ่านนามบัตร → lead) |
| 14 | `14-ai-api-webhook.png` | AI + API | `/settings/api` + ผู้ช่วย | proposal flow ("สร้างดีลจากแชทนี้") · คีย์ 3 bundle · curl · skill manifest · webhook 24 event · ตัวอย่างการตอบ "ดีลไหนเสี่ยงเดือนนี้" |

**มือถือ**: ทุกหน้า 01–11 ต้อง responsive ≤ 390px (กระดานเป็น swipe ต่อขั้น · ตารางเป็นการ์ด · แถบขวาเป็น sheet) — ภาพ 13 เป็นแบบอ้างอิง

---

## 7. ข้อเสนอแนะที่ดีที่สุด (จาก Fable — เรียงตามความคุ้ม)

1. **ทำสมาชิก RUN ให้ผ่าน M1 ก่อน แล้วค่อยเริ่ม C1** — CRM v2 ยืน 3 engine ของสมาชิก (ฟิลด์ · ไทม์ไลน์/Party · REST โครง) · เริ่มก่อน = ทำสองชุดแล้วต้องรวม · ถ้าอยากขนาน ให้เริ่ม C1 หลัง M1.4 ปิด และ C2 หลัง M3.3
2. **บริษัท + รายการสินค้าในดีล + ประวัติขั้น คือ 3 อย่างที่เปลี่ยน "กระดานดีล" เป็น "CRM" ทันที** — ทำใน C1 ใบแรก ๆ · ใบเสนอราคาที่ออกจากรายการสินค้าจริง = จุดขายที่ Zoho ต้องซื้อ Books เพิ่ม
3. **Team ต้องเป็นของกลาง ไม่ใช่ตาราง CRM** — สมาชิกมี `scope=TEAM` รออยู่ · บอร์ดงาน/HR ใช้ต่อได้ · ถ้าทำเป็นของ CRM จะต้องย้ายภายหลัง
4. **การมองเห็น OWN/TEAM/ALL ตั้งแต่ C1** — ใส่ทีหลัง = ทุก list/report ต้องรื้อ · พนักงานขายเห็นดีลกันหมดคือเหตุผลที่ร้านไม่กล้าใช้ CRM ร่วมกัน
5. **อีเมล: กล่องร้าน + BCC ก่อน Gmail OAuth** — ครอบ 80% (ลูกค้าตอบกลับที่ Reply-To · พนักงาน BCC) ด้วยโค้ด K3.9 ที่มีแล้ว · OAuth sync ต้อง Google verification + เก็บ token + sync ทั้งกล่อง = ใบงานใหญ่และเสี่ยง PDPA · ทำเป็น 🔜 หลังเห็นการใช้จริง
6. **โทร: บันทึกมือ + AI ถอดเสียง ก่อน VoIP** — SME ไทยโทรจากมือถือ · click-to-call + โมดัลหลังวางสาย + AI สรุป ให้ 90% ของประโยชน์ · PBX/VoIP ต้องเลือกผู้ให้บริการ (มี adapter ไว้)
7. **คอมมิชชันคิดจาก "รับเงินแล้ว" (PAID) ไม่ใช่ "ชนะ"** — ชนะแล้วไม่จ่าย = คอมมิชชันค้างต้องหักคืน · ผูกกับ `account.invoice.paid` ที่มีแล้ว · จ่ายผ่าน payroll ให้บัญชีตรง
8. **Lead scoring เริ่มจากกฎ 8 ข้อที่มองเห็นได้ ไม่ใช่ AI ดำ ๆ** — ผู้ใช้ต้องอธิบายได้ว่า "ทำไมร้อน" (แสดงเหตุผลคะแนน 3 ข้อล่าสุดบนการ์ด) · AI เสนอปรับกฎจากผลจริงได้ภายหลัง
9. **Web tracking script เลื่อนเป็น 🔜** — ต้อง cookie consent + PDPA + เว็บร้านต้องติดสคริปต์ · เอา email tracking + ฟอร์ม/UTM + ลิงก์ติดตาม ไปก่อน (ไม่ต้องแตะเว็บลูกค้า)
10. **Portal B2B ทำหลังบัญชี/สมาชิก `/m/*` เสร็จ (C3)** — 70% ของ portal คือหน้าเอกสารบัญชีที่มีแล้ว (public token) + login ของ `/m/*` · เขียนใหม่แค่ shell + สิทธิ์ต่อผู้ติดต่อ
11. **อย่าทำ (รอบนี้)**: Gmail/Outlook/Google Calendar sync · VoIP · web tracking script · AI forecast · แผนที่พื้นที่ · หลายสกุลเงิน (เก็บ `currency` ไว้แต่ THB อย่างเดียว) · การตลาดอัตโนมัติสำหรับผู้ติดต่อที่ไม่ใช่สมาชิก (ใช้แคมเปญสมาชิกผ่านการแปลง)
12. **เปิด REST/AI ทุก op ตั้งแต่ใบแรก + event ทุกใบ** — CRM วันนี้ 0 event คือรากของ "ไม่มีอัตโนมัติ" · F13.4 บังคับข้อสอบ

---

## 8. คำถามให้เจ้าของเคาะ (ตอบสั้น ๆ ได้)

1. **Lead**: ผู้ติดต่อคนเดียวมี lifecycle LEAD→ลูกค้า (แบบ HubSpot · แนะนำ) หรือแยกโมดูล "Lead" แล้วกดแปลงย้ายข้อมูล (แบบ Zoho)
2. **Team**: เป็นของกลางทั้งแอป (ใช้กับสมาชิก/บอร์ดงาน/HR ได้ · แนะนำ) หรือเฉพาะ CRM
3. **คอมมิชชัน**: คิดเมื่อ **รับเงินแล้ว** (แนะนำ) หรือเมื่อ **ดีลชนะ** · จ่ายผ่าน payroll HR (แนะนำ) หรือแค่รายงาน
4. **อีเมล**: กล่องอีเมลร้าน `crm+key@shark.in.th` + BCC (แนะนำ · ใช้โค้ดที่มี) หรือต้องเชื่อม Gmail/Outlook ของพนักงานด้วย (ใหญ่กว่า ~3 ใบ · ต้อง Google verification)
5. **โทร**: บันทึกมือ + แนบเสียง + AI ถอด/สรุป (แนะนำ) หรือเชื่อม VoIP/PBX (ต้องเลือกผู้ให้บริการ)
6. **ติดตามเว็บ**: ทำ email tracking + ฟอร์ม/UTM + ลิงก์ติดตาม ก่อน · สคริปต์ติดตามหน้าเว็บ (cookie consent) เป็น 🔜 (แนะนำ) หรือทำเลย
7. **Portal B2B**: เข้าด้วย OTP อีเมล + LINE login (แนะนำ) หรืออีเมลอย่างเดียว · ให้ลูกค้าเห็น "ดีล/สถานะการขาย" ด้วยไหม (แนะนำ: ไม่ · เห็นแค่เอกสาร/ชำระ/แจ้งเรื่อง)
8. **Custom objects**: ผูกได้กับ สมาชิก/ผู้ติดต่อ/บริษัท/ดีล/ลอย (แนะนำ) หรือแค่สมาชิกกับบริษัท · เพดาน 10 วัตถุ/ร้าน พอไหม
9. **การมองเห็นค่าเริ่มต้น**: STAFF=ทีม · MANAGER=ทั้งร้าน (แนะนำ) หรือ STAFF=ของตัวเอง
10. **เวลาเริ่ม**: รอสมาชิก RUN จบ M1 แล้วเริ่ม C1 (แนะนำ · session ใหม่ worktree `shark-crm`) หรือรอสมาชิกจบทั้ง 34 ใบ · ทำต่อเนื่องแบบเดิม (Fable คุม · builder ทำ · รายงาน Telegram ทุกใบ) ใช่ไหม

---

## เรนเดอร์ภาพใหม่
```bash
cd /root/projects/shark-crm/ledger/design-crm && ./render.sh 02-pipeline-board "SHARK · CRM กระดานดีล" 1500,1000
# render.sh = mk.sh (header + _base/_kb/_mb*.part + body) + chromium headless screenshot
```

---

## 9. มติเจ้าของ (11 ก.ย. 2569) + สิ่งที่เติมตามคำขอ

| ข้อ | มติ | ผล |
|---|---|---|
| 1 Lead | แบบ HubSpot (ผู้ติดต่อคนเดียว + lifecycle) | พิมพ์เขียว C1 |
| 2 Team | ของกลางทั้งแอป | C2 · `Team/TeamMember` ใน core · ตั้งค่าที่ `/app/settings/teams` |
| 3 คอมมิชชัน | คิดเมื่อรับเงินแล้ว (PAID) | C3 · จ่ายผ่าน payroll HR (ตามที่แนะนำ · ไม่ได้คัดค้าน) |
| 4 อีเมล | **ต้องตั้งได้ว่าจะให้ส่งไปที่ไหน** | C4 · หน้าตั้งค่าเส้นทางอีเมล 3 ชั้น (กล่อง SHARK / อีเมลพนักงาน-ร้าน + Reply-To + ส่งสำเนาไปที่ / provider 🔜) ทับต่อผู้ใช้ได้ · ภาพ 15 |
| 5 โทร | ตามแนะนำ (บันทึกมือ + เสียง + AI) | C5 |
| 6 ติดตามเว็บ | **ทำเลย ให้เป็นการตั้งค่า** | C6 · สวิตช์ต่อร้าน + `shark.js` + cookie consent + retention · ใบ C2.6 · ภาพ 16 |
| 7 Portal B2B | ยังไม่เข้าใจ → อ่านคำอธิบายแล้วตอบ **"เอาครับ"** (11 ก.ย.) | C7 · ทำในเฟส C3 (ใบ C3.5) |
| 8 Custom objects | ตามแนะนำ · **เพดานไม่จำกัด** | C8 · ไม่มีเพดานจำนวนวัตถุ (เตือนที่ 30/200,000 รายการ) |
| 9 การมองเห็น | ตามแนะนำ | C9 · STAFF=ทีม · MANAGER=ทั้งร้าน |
| 10 เวลาเริ่ม | **ยังไม่ RUN · ออกแบบให้ลึกและเรียบร้อยก่อน · ต้องทำงานร่วมกับทุกระบบได้** | C10 · พิมพ์เขียว §9 ตารางเชื่อม 24 ระบบครบ (รับ/ให้/ใบงาน) · ภาพ 17 แผนที่ · หน้าตั้งค่า `/settings/integrations` + ระบบปลายทาง |

### Portal B2B คืออะไร (อธิบายสำหรับข้อ 7)
- **ปัญหาที่แก้**: วันนี้ขายให้บริษัท ต้องส่ง PDF ใบเสนอราคาไปทางอีเมล/LINE รอเขาตอบ ส่งใบแจ้งหนี้อีกรอบ รอสลิป ส่งใบเสร็จอีกรอบ — ทุกอย่างไป-มาผ่านแชท ไม่มีที่เดียวให้ลูกค้าดู
- **Portal = หน้าเว็บของลูกค้าบริษัท** (`/p/*` · เปิดใน LINE ได้) ลูกค้าเข้าด้วยลิงก์ที่เราเชิญ + OTP อีเมล หรือ LINE login แล้วเห็นเฉพาะของบริษัทตัวเอง: **ใบเสนอราคาที่รอตอบ → กด "ตอบรับ" ได้เลย** (ระบบย้ายดีลให้อัตโนมัติ) · **ใบแจ้งหนี้ค้าง → กดชำระ PromptPay/แนบสลิป** · ใบเสร็จ/ใบกำกับ · สัญญา/เอกสารที่เราแชร์ · **แจ้งเรื่อง** (กลายเป็นการ์ดในบอร์ดงานของเรา · เขาเห็นสถานะ) · จัดการว่าใครในบริษัทเขาเข้าได้บ้าง
- **ไม่เห็น**: ดีล/ขั้นการขาย/โน้ตภายใน/คะแนน (ของเราอย่างเดียว)
- **เทียบ**: เหมือน "หน้าบัญชีลูกค้า" ของบริษัทซัพพลายเออร์ใหญ่ ๆ หรือ portal ของ Zoho/HubSpot ที่ลูกค้าเข้าดูใบแจ้งหนี้เอง — สำหรับลูกค้าทั่วไป (B2C) เรามี `/m/*` ของสมาชิกอยู่แล้ว portal นี้คือเวอร์ชันสำหรับ "บริษัทลูกค้า"
- **ต้นทุน**: ~70% ใช้ของที่มี (หน้าเอกสารบัญชี public token · ลิงก์ชำระ · login ของ `/m/*`) เหลือ shell + สิทธิ์ต่อผู้ติดต่อ = 1 ใบ (C3.5) · **ถ้าไม่เอา ตัดใบเดียวได้ ไม่กระทบใบอื่น** · ภาพ 12 คือหน้าตา
- **คำถามเดียวที่ต้องตอบ**: เอา (ทำใน C3) / ไม่เอา (ตัด) / เอาแต่เลื่อนไปหลัง RUN

**ชุดเอกสารส่งมอบ (ใช้เทียบ QC ตอน RUN)**
1. `docs/modules/20-crm-v2.md` — พิมพ์เขียว 14 หัวข้อ (มติ C1–C14 · ขอบเขต · IA · 24 surface/17 ภาพ · data model 25+2 ตาราง · service API · สิทธิ์ 40 คีย์+การมองเห็น · events 26/automation 14 แอ็กชัน/แจ้งเตือน 10/cron 10 · AI 32 tool · **เชื่อม 24 ระบบ** · เทมเพลต 16+วัตถุ 8 · edge cases · non-functional · QC · หลังจากนี้)
2. `docs/api/CRM-API.md` — สัญญา API 96 op · shapes · AI tools · webhook · curl
3. `ledger/CRM-RUN.md` — แผนงาน 32 ใบ + สัญญาย่อ + ข้อสอบ ≈ 780 ข้อ + ลำดับ + ข้อพึ่งพาสมาชิก
4. `ledger/design-crm/` — ภาพ 17 ใบ (README มีตาราง)
