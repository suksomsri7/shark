# CRM-RUN — แผนงาน RUN "CRM v2" (32 ใบ · 3 เฟส) — สถานะ: **ยังไม่ RUN (เจ้าของสั่ง 11 ก.ย. 2569: ออกแบบให้ลึกและเรียบร้อยก่อน · ต้องทำงานร่วมกับทุกระบบได้)**

> เขียน 11 ก.ย. 2569 · พิมพ์เขียว `docs/modules/20-crm-v2.md` · API `docs/api/CRM-API.md` · แบบ `ledger/DESIGN-CRM.md` + ภาพ 17 ใบ `ledger/design-crm/`
> ใช้เอกสารนี้ **เทียบ QC**: ทุกใบมี (1) สัญญาไฟล์/ฟังก์ชัน (2) รายการข้อสอบ (oracle) ที่ Fable จะเขียนเป็น `scripts/qc-crm-<wo>.mts` ก่อน spawn builder (3) ภาพที่ต้องตรงกับ mockup (4) regressions
> วิธีทำงาน = `ledger/MEMBER-RUN.md` §0–§0.1 ทั้งหมด (oracle ก่อน · builder ห้าม build/commit · Fable build+ภาพ+commit+push+ตรวจ prod · งานหนักทีละ 1 · fitness 2 โหมด · event ลง 3 ทะเบียนในใบเดียว · ทุก push ตรวจ Vercel + `_prisma_migrations`)
> เมื่อสั่งเริ่ม: **เปิด session ใหม่** → worktree `/root/projects/shark-crm` (มีอยู่แล้ว branch `session/crm` · `pnpm install` แล้ว) → `git pull --rebase origin main` → เขียน `scripts/seed-crm-qc.mts` + oracle C1.1 → spawn builder → ทำตาม §0.1 ของ MEMBER-RUN ทุกใบ

## 0. กติกาเพิ่มของ RUN นี้
1. **ข้อมูล QC**: seed ใหม่ `seed-crm-qc.mts` (แผน · scripts/) ต่อยอดร้าน QC ของสมาชิก ("SIAM DIVE MEMBER QC" · ใช้ `member-qc-env.mts` เดิม) เพิ่มระบบ CRM/HR/INVENTORY/ACCOUNT ถ้ายังไม่มี · ทีม 2 (ภูเก็ต/กระบี่) · ผู้ใช้: owner · manager · thana (STAFF ทีมภูเก็ต) · nok (STAFF ทีมกระบี่ · หัวหน้าทีม) · บริษัท 20 · ผู้ติดต่อ 80 (ซ้ำตั้งใจ 4 คู่) · ดีล 60 ใน 2 pipeline (นิ่ง 6 · WON 10 · LOST 5) · กิจกรรม 200 · อีเมล 40 (thread 10) · วัตถุ "สัญญา" 12 รายการ · โควตา/กฎคอมมิชชัน · เฉลย `crm-expected.json` (แผน · scripts/) · idempotent · oracle มาร์ก `// requires: crm-seed`
2. **ห้ามแตะ tx ของ POS/บัญชี** โดยไม่มีข้อสอบ regressions ของโมดูลนั้นเขียว (C2.7 เป็นใบเดียวที่แตะ `pos/service.ts` (เพิ่ม `dealId`) และ `account` facade — ต้องรัน `qc-acc-v2-*` + `qc-kanban-k3.3` + `qc-member-m2.8` ทั้งชุด)
3. **ทุก op ใหม่ต้องมี `test: "C<x>-S…"`** (F13.4 ขยายเป็น F13.7–F13.9 สำหรับ crm) · generator `gen-crm-api-docs.mts` + F13.8 ตั้งแต่ C1.10
4. **ฟิลด์กำหนดเอง**: ห้ามเขียน engine ใหม่ — C1.2 ขยาย `member/fields.ts` ด้วย `objectKey` และ adapter `CustomRecordValue` · ข้อสอบสมาชิก M1.2 ต้องยังเขียว
5. **automation**: C2.1 ขยาย `kanban/automation.ts` เป็น scope CRM (หรือย้าย engine เป็น `src/lib/automation/engine-v2.ts` กลาง — builder เสนอพร้อมหลักฐาน · ข้อสอบ K2.9 + M3.3 ต้องยังเขียว) · แอ็กชัน SEND_EMAIL/SEND_LINE/WAIT_THEN: ถ้าสมาชิก M3.3 ทำแล้วใช้ต่อ ถ้ายัง CRM ทำแล้วสมาชิกใช้ต่อ (ห้ามสองชุด)
6. ภาพ parity: ทุกใบระบุภาพ `ledger/design-crm/NN-*.png` · Fable ดูภาพจริงคู่ mockup ทั้ง owner · thana (STAFF ทีมภูเก็ต — ต้องไม่เห็นดีลกระบี่) · nok (หัวหน้าทีมกระบี่) · ลูกค้า portal (customer session)
7. เพดาน/สิทธิ์/ข้อความ ตาม §6 §11 ของพิมพ์เขียว · 404-not-403 ตาม visibility ทุก list/get
8. **partyId ทุกระบบ (C11)**: C1.1 ตรวจชื่อตารางจริงของ hotel/rental/school/clinic/queue/ticket ก่อนเพิ่มคอลัมน์ (ห้ามเดา — เปิด prisma/schema/*.prisma) · backfill dry-run ก่อนทุกครั้ง
9. ไม่มีข้อสอบภาพสำหรับ `shark.js` — ใช้ headless chromium โหลดหน้า HTML ทดสอบ (`scripts/qc-crm-c2.6-web.mts`) ตรวจ cookie/consent/POST จริง

## 0.1 บทบาทและขั้นตอนต่อใบ
= `ledger/MEMBER-RUN.md` §0.1 ทุกข้อ (Fable 9 ขั้น · builder ขั้น 3 · เจ้าของรับรายงาน/ตอบมติธุรกิจ) · เปลี่ยนชื่อไฟล์เป็น `qc-crm-<wo>.mts` · `visual-crm.mts` · `wo-notes/crm-Cx.y.md` · `.qc-shots/crm/<wo>/` · Telegram ทุกใบ

## 1. ตาราง WO

| WO | ชื่อ | builder | ขึ้นกับ | migration | oracle (ข้อ) | ภาพ |
|---|---|---|---|---|---|---|
| **C1.1** | schema `crm_v2_a` (คอลัมน์ Contact/Deal/Activity/Stage/Pipeline · Team/TeamMember core · Company/CompanyContact/DealContact/DealLine/StageHistory/LostReason · MemberSection/Field `objectKey`+unique · CustomObject/Record/Value/History · partyId ทุกระบบ C11 · enum) + `core/teams.ts` + backfill 6 สคริปต์ + seed QC + scope.ts | Opus | — | `crm_v2_a` | 26 | — |
| **C1.2** | fields engine `objectKey` (validate/layout/filterWhere/applyTemplate รับ objectKey · adapter `CustomRecordValue`) + `objects.ts` service (CRUD วัตถุ/รายการ · tabsFor · timelineFor · เทมเพลตวัตถุ 8) | Opus | C1.1 | — | 28 | — |
| **C1.3** | `companies.ts` (create/update/360/list/contacts roles/primary/duplicates/merge/importFromAccount/caches) + บัญชี facade `ensureAccountContact` + หน้าบริษัท (รายการ + 360) | Opus | C1.2 | — | 26 | 04 |
| **C1.4** | `contacts.ts` v2 (create+duplicate+assign stub · update · 360 · list ทุกตัวกรอง · convert · lifecycle/leadStatus · tags/optOut · duplicates/merge · import/export · briefFor/byParty) + หน้าผู้ติดต่อ (รายการ · 360 · โมดัลแปลง · เพิ่ม) | Opus | C1.3 | — | 30 | 05 |
| **C1.5** | `deals.ts` v2 (create · move+requirements+history · lines+valueSatang+เพดานส่วนลด→approval · quote จาก lines · invoice · forecast · board · reassign · stale field) + กระดานลากได้ + ดีล 360 + ตั้งค่า pipeline/ขั้น/เหตุผลแพ้ | Opus | C1.4 | — | 32 | 02 · 03 |
| **C1.6** | `activities.ts` v2 (log/complete/reschedule/list/calendar · outcome registry · nextTask · lastActivityAt) + หน้ากิจกรรม + ปฏิทิน + `KanbanCardLink` DEAL/COMPANY/CRM_CONTACT/CUSTOM_RECORD + การ์ดในดีล 360 | Sonnet | C1.5 | — | 20 | 08 (ปฏิทิน) |
| **C1.7** | สิทธิ์ 40 คีย์ + alias เดิม + `PERMISSION_PARAMS` 3 + `visibility.ts` (resolve/visibleWhere/canSee/policies) ใส่ทุก list/get ของ C1.3–C1.6 + ตั้งค่าการมองเห็น UI + Team UI `/app/settings/teams` | Opus | C1.6 | — | 26 | 10 (ซ้าย) |
| **C1.8** | event 26 + consumer + `crm-bridges.ts`/`crm-outbound.ts` (สมาชิก create/link · บัญชี ensureContact · แชท briefFor+lead · ฟอร์ม consumer แทน import ตรง · บอร์ดงาน · MemberActivity ทุก event · AUTOMATION_EVENTS/WEBHOOK_EVENTS) | Opus | C1.7 | — | 28 | — |
| **C1.9** | custom objects UI: ตัวออกแบบฟิลด์สลับวัตถุ (ต่อยอดหน้า M1.3) · รายการวัตถุ/เพิ่ม/เทมเพลต · หน้ารายการ+รายการเดี่ยว · แท็บใน 360 ทุกชนิด (รวมสมาชิก 360) | Sonnet | C1.2 · C1.4 | — | 18 | 06 |
| **C1.10** | REST/AI ชุดแรก: `crm/api/` registry + op contacts/companies/deals/activities/objects/teams/settings (~50) + dispatch `/api/v1/crm/*` + generator docs + skill `crm` (14 tool) + webhook events C1 + bundle 3 | Opus | C1.8 | — | 24 | 14 (ขวา) |
| **C1.11** | มือถือ responsive ทุกหน้า C1 + แผงข้างห้องแชท (ผู้ติดต่อ/ดีล/ปุ่ม 3) + เทมเพลตกิจการ 16 (ข้อมูล + apply) + นำเข้า/ตัวซ้ำ/รวม UI (ผู้ติดต่อ+บริษัท) + regression `qc-crm-v1` (หน้าเดิม 3 หน้าใช้ต่อได้) | Sonnet | C1.10 | — | 18 | 13 (ก) · 18 · 17(บางส่วน) |
| **C2.1** | automation scope CRM: trigger crm.*+cron 3 · condition prefix c./co./d./o. + AND/OR · action 14 (รวม SEND_EMAIL/LINE/WAIT_THEN ร่วมสมาชิก) · กฎเริ่มต้น 6 · dry-run · โควตา scope · UI ตัวสร้างกฎ (ต่อยอด K2.9 UI) | Opus | C1.8 (+M3.3 ถ้ามี) | — | 30 | 07 (บน) |
| **C2.2** | sequences: schema `crm_v2_b` (Sequence/Step/Enrollment) · engine runDue · หยุด 5 เหตุ · วันทำการ/sendWindow · เวอร์ชัน · UI editor + ลงทะเบียน + ปุ่มบนผู้ติดต่อ/bulk | Opus | C2.1 | `crm_v2_b` | 28 | 07 (ล่าง) |
| **C2.3** | assignment: rules/pick (FIXED/ROUND_ROBIN atomic/TEAM_LEAD/LEAST_OPEN) · maxOpenPerUser · acceptingLeads · HR leave skip · fallback · simulate · UI | Opus | C1.7 | (ใน b) | 22 | 07 (ขวา) |
| **C2.4** | activity capture: โมดัลบันทึกสาย (click-to-call · outcome · ไฟล์เสียง) · AI ถอดเสียง/สรุป/next step (proposal · AI credit) · แชท RESOLVED → กิจกรรม CHAT + สรุป · ปฏิทินรวมนัดจอง/คลินิก/โรงเรียน (facade อ่าน) · `CrmCallProvider` interface (stub) | Opus | C1.6 · C1.8 | — | 24 | 08 (ซ้าย/ขวา) |
| **C2.5** | อีเมล engine (C4): `emails.ts` routing (ร้าน/ผู้ใช้) · `core/email` ขยาย (html/attachments/headers/from/replyTo) · send+pixel/ลิงก์+unsubscribe · inbound `crm+` ผ่าน route K3.9 (จับคู่ 6 กรณี · thread 3 ชั้น · BCC capture · stranger→lead · auto-reply skip) · provider webhook (bounce) · templates · UI กล่องรวม/thread/ส่ง/ตั้งค่าเส้นทาง/ทับต่อผู้ใช้/โดเมน DNS/ทดสอบ | Opus | C1.8 | (ใน b: Email*) | 34 | 08 (กลาง) · 15 |
| **C2.6** | tracking (C6): `CrmTrackedLink/Click` + `/l/{code}` · `/t/o` `/t/c` · `shark.js` + consent banner + `/t/e` `/t/consent` + `CrmWebSession/Event` + identify (ฟอร์ม/อีเมล/portal) + purge cron + ฟอร์ม: `FormDef.crmSystemId/utm/assignRuleId` + โค้ดฝัง + honeypot · UI ตั้งค่า tracking + ไทม์ไลน์เว็บ | Opus | C2.5 | (ใน b: Tracked*/Web*) | 30 | 11 · 16 |
| **C2.7** | บัญชี/POS bridges: `account.createExternalQuotation` รับ lines · `createInvoiceFromLines`/convert · `account.quotation.responded/invoice.paid/document.voided` consumers → move/recordPayment/reverse · `PosSale.dealId` + เลือกดีลที่ POS + `pos.sale.paid` consumer · `pipeline.autoInvoiceOnWon` · ป้าย "ต่างจากใบเสนอราคา" · หน้าเอกสารบัญชีลิงก์ดีล | Opus | C1.5 · C1.8 | `crm_v2_c` (PosSale.dealId) | 28 | 03 (เอกสาร) · 06 สมาชิก (POS) |
| **C2.8** | scoring: rules seed 8 · onEvent consumer ทุก event ที่กฎอ้าง · log/expire/decay/band/threshold · explain · recompute dry-run · UI กฎ+เหตุผลบนการ์ด/360 | Sonnet | C1.8 | — | 20 | 05 (คะแนน) |
| **C2.9** | event ระบบธุรกิจ (C11): `shop.order.paid` · `booking.completed/no_show` (ถ้าสมาชิกยังไม่ทำ) · `ticket.order.paid` · `rental.returned` · `school.enrolled/completed` · `hotel.checked_out` · `clinic.visit.done` · `queue.served` — emit ในโมดูลนั้น (ลง 3 ทะเบียน) + partyId เขียนจริง + consumer CRM (กิจกรรม/lifecycle/score/ดีล RENEWAL ตามกฎ) | Opus | C1.1 · C1.8 | — | 26 | 17 |
| **C2.10** | ดีลนิ่ง cron + สรุปรายวัน · แจ้งเตือนพนักงาน 10 เทมเพลต × ช่องทาง (push/LINE/อีเมล/ในแอป · quiet hours) · cron ทั้งชุด (`/api/cron/crm/*` + vercel.json) · หน้าตั้งค่าแจ้งเตือน | Sonnet | C2.1–C2.8 | — | 18 | 01 (ดีลที่ต้องดู) |
| **C2.11** | REST/AI ชุดสอง: op emails/sequences/assignment/scoring/tracking (~30) + tool 10 + webhook events C2 + docs regen | Opus | C2.5 · C2.6 | — | 22 | 14 |
| **C3.1** | reports 8 แท็บ (`reports.ts` จาก ledger: StageHistory/Activity/Commission/Source) + ROI แคมเปญ (`sourceDetail.campaignId` + ต้นทุนแคมเปญ) + ส่งออก CSV + ตั้งเวลา (ReportDef+cron) + UI | Opus | C2.7 · C2.8 | — | 26 | 09 |
| **C3.2** | quotas (set/progress/reached) + หน้าแรก KPI 6 + งานวันนี้ + ดีลที่ต้องดู + leaderboard + ที่มา lead + มุมมองบันทึก objectKey (contact/company/deal) | Sonnet | C3.1 | — | 20 | 01 · 10 (โควตา) |
| **C3.3** | commissions: schema `crm_v2_d` (Quota/Commission*/Visibility/Portal*) · rules · onPaid/onWon (idempotent) · split · approval (entityType CRM_COMMISSION) · HR `createPayAdjustment` + `HrPayAdjustment.crmCommissionId` + `hr.payroll.paid` event (ในโมดูล HR) · reverse · report · UI กฎ/รออนุมัติ/ของฉัน | Opus | C2.7 | `crm_v2_d` | 30 | 10 (ขวา) |
| **C3.4** | MEETING bridge (แจ้งห้องทีม · unfurl ดีล) · KB ใน AI ร่างอีเมล · AI ในหน้า (ดีลเสี่ยง/สรุปดีล/สรุปบริษัท/ร่างอีเมล/นามบัตร → proposal) + tool ที่เหลือ 8 | Opus | C2.11 | — | 22 | 14 (ซ้าย) · 13 (ค) |
| **C3.5** | portal B2B (C7 ✅ ยืนยัน 11 ก.ย.): `/p/*` shell (ธีมร้าน · LIFF) · auth EMAIL_OTP/LINE ผ่าน platform_auth · invite/access/revoke · quotations respond → บัญชี · invoices + payLink + slip · receipts · documents (ไฟล์+วัตถุ portalVisible) · requests (→ การ์ด/approval) · contacts · UI พนักงาน (เชิญ/ดู) | Opus | C2.7 · C1.9 | (ใน d) | 30 | 12 · 04 (portal) |
| **C3.6** | integrations: หน้า `/settings/integrations` (ภาพ 17 · สถานะ 24 ระบบ · targets เลือกระบบปลายทาง) + `settings.integrations.status` + PAGES widgets (ดีลของฉัน/งานวันนี้/portal) + Team ใช้ใน `MemberSavedView.teamId` | Sonnet | C2.9 · C3.2 | — | 16 | 17 |
| **C3.7** | มือถือครบ (C2–C3 responsive) + แอปพนักงาน (`apps/mobile`: ดีลของฉัน · บันทึกสายหลังวางสาย · งานวันนี้ · สแกนนามบัตร · push) ผ่าน REST เดียวกัน | Sonnet | C3.4 | — | 18 | 13 |
| **C3.8** | REST/AI ชุดสาม: op reports/quotas/commissions/portal/records dynamic/integrations (~16) + manifest ครบ 32 tool + webhook ครบ + `docs/api/CRM-API.md` จาก generator (F13.8) + skill `crm` สมบูรณ์ | Opus | C3.5 · C3.6 | — | 20 | 14 |
| **C3.9** | PDPA/ความปลอดภัย: erase/export ครอบ CRM (ต่อ flow สมาชิก) · purge อีเมล/เสียง/เว็บ · signed URL ไฟล์เสียง · rate limit public endpoints · audit ครบ · เพดาน `limits.ts` + แจ้งก่อนถึง · ข้อสอบเจาะ (thana ข้ามทีม · portal ข้ามบริษัท · tracking ไม่มี consent) | Opus | C3.8 | — | 24 | — |
| **C3.10** | ปิดเฟส: qc:all เต็ม (ทั้งระบบ · CRM v1 regressions · สมาชิก/บัญชี/บอร์ดงาน/POS ยังเขียว) · backfill prod (dry-run → จริง) · prod verify ทุกหน้า (owner/thana/nok/portal) · HANDOVER-CRM.md · Telegram · memory | Fable | ทั้งหมด | — | — | ทุกภาพ |

รวม 32 ใบ · oracle ≈ 780 ข้อ · migration 4 (`crm_v2_a`–`d`) · Opus 21 · Sonnet 10 · Fable 1

## 2. สัญญารายใบ (สรุปที่ QC ใช้ — รายละเอียดเต็มดูพิมพ์เขียว §4–§9)

### C1.1 — schema + Team core + partyId ทุกระบบ + backfill + seed (Opus · 26 ข้อ)
- prisma: ทุกอย่างใน §4.1/§4.2/§4.3 กลุ่ม core+ตัวตน+วัตถุ (Score/Sequence/Email/Tracking/Quota/Commission/Portal ไปใบของตัวเอง) · `MemberSection/Field` unique ใหม่ · partyId บน Appointment/ShopOrder/RentalBooking/SchoolEnrollment/HotelBooking/ClinicPatient/QueueTicket (ชื่อจริงตรวจก่อน) · `core/teams.ts` · scope.ts ครบ (F1) · backfill: companies-from-text · stage-history-seed · party-links · contact-name-split · lost-reasons-seed · visibility-default · seed QC ตาม §0.1
- oracle: S1 migration apply บน QC + ทุก model ใน scope registry (4) · S2 unique objectKey ไม่ชนข้อมูลสมาชิกเดิม + M1.2 ข้อสอบยังเขียว (3) · S3 backfill idempotent รัน 2 รอบผลเท่ากัน + dry-run ไม่เขียน (6) · S4 companies-from-text: "บริษัท ไทยทัวร์เอเชีย" 3 ผู้ติดต่อ → 1 CrmCompany 1 Party COMPANY (3) · S5 party-links ครอบ 7 ตาราง (นับแถวที่มีเบอร์ → partyId ไม่ null) (4) · S6 teams CRUD + teamsOf + unique name (4) · S7 seed ครบตามเฉลย (2)

### C1.2 — fields engine objectKey + objects service (Opus · 28 ข้อ)
- `member/fields.ts` รับ `objectKey` ทุกฟังก์ชัน (default customer) · เขียน/อ่านค่า: customer → MemberFieldValue · อื่น → CustomRecordValue(recordType) · `filterWhere(objectKey)` คืน where ของตารางที่ถูก · `applyTemplate(objectKey, template)` · เพดาน 60/วัตถุ · `objects.ts` ตาม §5.8 · เทมเพลตวัตถุ 8 (ข้อมูล)
- oracle: S1 สร้างวัตถุ "รถ" parent CONTACT + ฟิลด์ 6 ชนิดต่างกัน → layout ถูก (5) · S2 records CRUD + title จาก titleFieldKey + parent ผิดชนิด → VALIDATION (6) · S3 filterWhere ทุกชนิด (TEXT/NUMBER/DATE/SELECT/LOOKUP) บน records + contact (6) · S4 history เมื่อ trackHistory (2) · S5 tabsFor(CONTACT, id) คืนวัตถุที่ showAsTab + count (3) · S6 archive วัตถุมีรายการ → ต้องยืนยัน · กู้ (3) · S7 M1.2 regressions เขียว (1) · S8 ไม่มีเพดานจำนวนวัตถุ (สร้าง 35 → เตือน OpsEvent ไม่ error) (2)

### C1.3 — companies (Opus · 26 ข้อ) · ภาพ 04
- §5.3 ครบ · party COMPANY จับคู่ taxId → ชื่อ+โดเมน · `account.ensureAccountContact` (facade ใหม่ในบัญชี · idempotent) · caches · หน้า `/companies` + `/companies/[id]`
- oracle: S1 create: เลขภาษีซ้ำ → duplicate (party เดิม) · ไม่มีเลขภาษี ชื่อคล้าย → candidate (5) · S2 contacts add/primary/role/remove + cache contact.companyId (6) · S3 360 DTO ครบ 5 ตัวเลข (ค้างชำระจากบัญชี seed) (4) · S4 merge ย้ายผู้ติดต่อ/ดีล/เอกสาร (4) · S5 importFromAccount 3 บริษัท → 3 CrmCompany ผูก accountContactId (2) · S6 ภาพ owner/thana (3) · S7 events created/updated (2)

### C1.4 — contacts v2 + 360 + แปลง (Opus · 30 ข้อ) · ภาพ 05
- §5.2 ครบ (assign ใช้ stub FIXED จน C2.3) · convert tx เดียว (สมาชิกผ่าน `member.createMember` source CRM) · `canAdvanceLifecycle` เดิม + CHURNED · import/export async · UI รายการ/360/แปลง/เพิ่ม
- oracle: S1 create ซ้ำเบอร์ → duplicate · partyId · sourceDetail utm เก็บครบ (6) · S2 convert 3 ติ๊ก → customerId+companyId+dealId ใน tx · ล้มกลางทาง = ไม่มีอะไรถูกสร้าง (5) · S3 lifecycle ถอย CUSTOMER→LEAD ปฏิเสธ (2) · S4 list ตัวกรองทุกตัว + f.{key} + saved view (6) · S5 merge ย้ายทุก FK (4) · S6 import mapping + onDuplicate 3 โหมด (4) · S7 ภาพ+events (3)

### C1.5 — deals v2 + กระดาน + 360 (Opus · 32 ข้อ) · ภาพ 02 · 03
- §5.4 ครบ · `dealStateForStage` เดิมคงใช้ · requirements → `STAGE_REQUIREMENTS` · lines → valueSatang · ส่วนลด > เพดาน → approval (entityType CRM_DISCOUNT) · quote จาก lines (facade บัญชีรับ lines — ถ้าบัญชียังไม่รับ → ใบนี้เพิ่ม param ใน `createExternalQuotation` แบบ additive) · board DTO · forecast aggregate · dnd reuse บอร์ดงาน
- oracle: S1 create/move/history durationSec ถูก (6) · S2 requireFields ขาด → error + missing[] · ครบ → ผ่าน (4) · S3 LOST ไม่มี reason → VALIDATION (2) · S4 lines: ผลรวม/ส่วนลด/เพดาน→APPROVAL_REQUIRED (5) · S5 quote → AccountDocument QUOTATION มีบรรทัดตรง lines (3) · S6 forecast weighted ตรงเฉลย · override (4) · S7 board sum/weighted ต่อคอลัมน์ (3) · S8 ภาพ owner/thana + dnd testid (5)

### C1.6 — activities v2 + ปฏิทิน + บอร์ดงาน link (Sonnet · 20 ข้อ)
- §5.5 (ยกเว้น AI/fromChat → C2.4) · outcome registry · nextTask · lastActivityAt ล้าง stalledAt · calendar (ยังไม่รวมนัดจอง → C2.4) · `KanbanCardLink` 4 ชนิด + `createCardFromExternal(link DEAL)`
- oracle: S1 log ทุกชนิด + outcome ผิดชนิด → VALIDATION (5) · S2 nextTask สร้าง TASK ผูก (2) · S3 lastActivityAt/stalledAt (3) · S4 list status 5 โหมด (5) · S5 การ์ดบอร์ดงานผูกดีล + completed → กิจกรรมเสร็จ (3) · S6 ภาพ (2)

### C1.7 — สิทธิ์ + visibility + Team UI (Opus · 26 ข้อ) · ภาพ 10 ซ้าย
- permissions.ts กลุ่ม crm 40 คีย์ + alias + params · `visibility.ts` §5.9 · ใส่ `visibleWhere` ทุก list/get/board/forecast ของ C1.3–C1.6 · UI `/app/settings/teams` + `/settings/visibility`
- oracle: S1 thana (STAFF ภูเก็ต) list ดีล → เฉพาะทีม · get ดีลกระบี่ → 404 (6) · S2 nok (LEAD กระบี่) เห็นทีมตน · reassign ออกจากทีม → เห็นไม่ได้แล้ว (4) · S3 policy ต่อ pipeline ทับค่าเริ่มต้น (3) · S4 OWNER ALL · MANAGER unit scope (3) · S5 read-โดยนัยจากคีย์ใดก็ได้ (2) · S6 คีย์เดิม 6 ตัวยังใช้ได้ (2) · S7 Team UI CRUD + ภาพ (6)

### C1.8 — events 26 + consumers + bridges (Opus · 28 ข้อ)
- emit ทุกจุดตาม §7.1 · `crm-bridges.ts`/`crm-outbound.ts` · consumers §7.2 ที่มี event อยู่แล้ว (forms/chat/account/kanban/approval/member) · forms เลิกเรียก `crm.createContact` ตรง (consumer + `FormDef.crmSystemId`) · MemberActivity ทุก event · 3 ทะเบียน
- oracle: S1 ทุก event ใน §7.1 มี consumer+AUTOMATION+WEBHOOK (fitness-style 26) · S2 forms submit → lead ในระบบที่ตั้ง (ไม่ใช่ระบบแรก) + utm (4) · S3 chat received ของ Party ที่มีผู้ติดต่อ → ไม่สร้างซ้ำ · ไม่มี+เปิด → lead (3) · S4 quotation.responded → ดีลย้ายขั้น (2) · S5 deal.won → สมาชิกถูกสร้าง source CRM (2) · S6 MemberActivity แถวต่อ event (3) · S7 drain until quiet ไม่ค้าง (1)

### C1.9 — custom objects UI (Sonnet · 18 ข้อ) · ภาพ 06
- ตัวออกแบบฟิลด์ (หน้า M1.3) เพิ่ม dropdown วัตถุ · `/settings/objects` + โมดัลเพิ่ม + เทมเพลต 8 · `/objects/{key}` รายการ (FilterBar/saved view reuse) · `/objects/{key}/{id}` · แท็บใน contact/company/deal/สมาชิก 360
- oracle: S1 สร้างวัตถุจาก UI → ฟิลด์ 5 → รายการ 2 → แท็บโผล่ในบริษัท 360 (5) · S2 ตัวกรอง f.{key} ในรายการ (3) · S3 archive/กู้ (2) · S4 ภาพ 06 parity owner + สมาชิก 360 มีแท็บ "รถ" (4) · S5 testid/static (4)

### C1.10 — REST/AI ชุดแรก (Opus · 24 ข้อ) · ภาพ 14 ขวา
- `crm/api/op.ts` `registry.ts` `dispatch.ts` `ops/{contacts,companies,deals,activities,objects,teams,settings}.ts` ~50 op · route `/api/v1/crm/[...path]` + `/api/v1/teams/*` · bundle 3 + `asUserId/teamId` · generator + F13.7–F13.9 · skill `crm` 14 tool (read ทันที · write proposal) · webhook events C1
- oracle: S1 ทุก op มี test id จริง (1 fitness) · S2 auth/bundle/visibility ผ่านคีย์ (6) · S3 Idempotency-Key ซ้ำ → ผลเดิม (2) · S4 STAGE_REQUIREMENTS/APPROVAL_REQUIRED/CONFLICT shapes (4) · S5 objects dynamic op `/objects/car/records` (3) · S6 AI tool read/write proposal (4) · S7 webhook ส่ง+ลายเซ็น (2) · S8 docs = generator (1) · S9 ภาพ (1)

### C1.11 — มือถือ + แผงแชท + เทมเพลต 16 + นำเข้า/ซ้ำ UI + regression v1 (Sonnet · 18 ข้อ)
- oracle: S1 responsive ≤390 ทุกหน้า C1 (ภาพ 6) · S2 แผงข้างแชท: brief + ปุ่ม 3 → สร้าง lead จากห้อง (3) · S3 apply เทมเพลต "ดำน้ำ" → pipeline/เหตุผล/กฎคะแนน/วัตถุ ตามเฉลย (3) · S4 นำเข้า/ซ้ำ/รวม UI (3) · S5 `qc-crm-v1`: 3 หน้าเดิม + 6 action เดิม ยังทำงาน (3)

### C2.1 — automation scope CRM (Opus · 30 ข้อ) · ภาพ 07 บน
- oracle: S1 engine เห็นเฉพาะ scope CRM + crmSystemId (3) · S2 trigger 6 ตัวอย่าง + cron 3 (6) · S3 condition prefix/AND-OR/o.{key} (6) · S4 action 14 ทำงาน (dry-run ไม่เขียน) (8) · S5 กฎเริ่มต้น 6 apply + ทำงานจริงบน seed (3) · S6 K2.9 + M3.3 regressions เขียว (2) · S7 โควตา/loop-guard scope แยก (2)

### C2.2 — sequences (Opus · 28 ข้อ) · ภาพ 07 ล่าง
- oracle: S1 enroll/CONFLICT/replace (3) · S2 runDue: EMAIL→ส่ง · WAIT→nextAt วันทำการ+window · LINE ไม่มี consent → ข้าม · TASK → กิจกรรม (8) · S3 หยุด 5 เหตุ (5) · S4 เวอร์ชันเมื่อแก้ขั้น (2) · S5 สถิติต่อขั้น (2) · S6 UI editor/ลงทะเบียน/ภาพ (5) · S7 cron วนจนเงียบ (3)

### C2.3 — assignment (Opus · 22 ข้อ) · ภาพ 07 ขวา
- oracle: S1 ลำดับกฎ/เงื่อนไข 6 ชนิด (6) · S2 round-robin atomic ยิงพร้อมกัน 20 → กระจายเท่ากัน (บทเรียน [[reference_atomic_counter_single_statement]]) (3) · S3 LEAST_OPEN/TEAM_LEAD (2) · S4 maxOpen/acceptingLeads/ลา HR ข้าม (4) · S5 fallback/ไม่มีใคร → แจ้ง (2) · S6 simulate + UI (5)

### C2.4 — activity capture + AI + ปฏิทินรวม (Opus · 24 ข้อ) · ภาพ 08 ซ้าย/ขวา
- oracle: S1 โมดัลบันทึกสาย static/testid + tel: (3) · S2 transcribe job → proposal เติม 3 ฟิลด์ (mock AI ใน QC) (4) · S3 chat RESOLVED → 1 กิจกรรม/ห้อง dedupe sourceRef (3) · S4 calendar รวมนัดจาก Appointment ของ Party (อ่านอย่างเดียว) (4) · S5 remind cron (2) · S6 provider interface stub + webhook shape (2) · S7 ภาพ (6)

### C2.5 — อีเมล engine (Opus · 34 ข้อ) · ภาพ 08 กลาง · 15
- oracle: S1 routing 3 โหมด × ทับผู้ใช้ → from/replyTo/copyTo ตรงเฉลย (8) · S2 send: pixel/ลิงก์ห่อ/unsubscribe/optOut→EMAIL_BLOCKED/scheduled (6) · S3 inbound จับคู่ 6 กรณี (อีเมลตรง · โดเมน · stranger→lead · พนักงาน BCC=OUT · auto-reply skip · ไม่จับคู่→กล่อง) (6) · S4 thread 3 ชั้น (3) · S5 bounce webhook → ธง+หยุด sequence (2) · S6 copyMode IN/OUT/BOTH ส่งสำเนา (mock provider) (3) · S7 DNS status shape (1) · S8 UI ภาพ 08/15 (5)

### C2.6 — tracking + shark.js + ฟอร์ม (Opus · 30 ข้อ) · ภาพ 11 · 16
- oracle: S1 links create/click 302/นับ/QR (4) · S2 pixel/คลิก → events + bot filter (4) · S3 shark.js บน headless: ไม่ยินยอม = 0 แถว · ยอมรับ → page view 3 + consent version · ปฏิเสธ = cookie เดียว (6) · S4 identify จากฟอร์ม → session ย้อนหลังผูก + กิจกรรม WEB + score (4) · S5 purge retention (2) · S6 ฟอร์ม: crmSystemId/utm/honeypot/assignRule (5) · S7 โดเมนไม่อนุญาต → 204 (1) · S8 ภาพ (4)

### C2.7 — บัญชี/POS bridges (Opus · 28 ข้อ)
- oracle: S1 quote จาก lines → เอกสารบรรทัด/ภาษี/ยอดตรง (4) · S2 responded ACCEPT/REJECT → ขั้นตามตั้งค่า + กิจกรรม (3) · S3 invoice.paid → paidSatang/wonValue/lifecycle (4) · S4 voided → reverse ธง (2) · S5 PosSale.dealId + pos.sale.paid → recordPayment (4) · S6 autoInvoiceOnWon (2) · S7 regressions POS/บัญชี/บอร์ดงาน/สมาชิก M2.8 ทั้งชุดเขียว (6) · S8 ป้ายต่างจากใบเสนอราคา (3)

### C2.8 — scoring (Sonnet · 20 ข้อ) · ภาพ 05
- oracle: S1 seed 8 กฎ + onEvent 5 event → log/score ตรง (6) · S2 maxPerDay (2) · S3 decay/expire → คะแนนลด ไม่ต่ำกว่า 0 (3) · S4 band/threshold event (3) · S5 explain 3 ล่าสุด (2) · S6 recompute dry-run (2) · S7 ภาพ (2)

### C2.9 — event ระบบธุรกิจ (Opus · 26 ข้อ) · ภาพ 17
- oracle: ต่อระบบ (8 ระบบ × 3: emit ใน tx · ลง 3 ทะเบียน · consumer CRM สร้างกิจกรรม+lifecycle) (24) · partyId เขียนจริงตอนสร้างธุรกรรมใหม่ (2)

### C2.10 — ดีลนิ่ง + แจ้งเตือน + cron (Sonnet · 18 ข้อ) · ภาพ 01
- oracle: S1 markStale ตาม staleDays ต่อขั้น/ค่าเริ่มต้น · emit ครั้งเดียว · กิจกรรมล้าง (5) · S2 สรุปรายวันรวม ไม่ทีละใบ (2) · S3 เทมเพลต 10 × ช่องทาง + quiet hours (6) · S4 cron endpoints ทั้งชุด + secret (3) · S5 ภาพหน้าแรก (2)

### C2.11 — REST/AI ชุดสอง (Opus · 22 ข้อ)
- oracle: op ~30 มี test (1) · emails/sequences/assignment/scoring/tracking ผ่านคีย์ (12) · tool 10 (4) · webhook events C2 (3) · docs regen (1) · ภาพ (1)

### C3.1 — reports (Opus · 26 ข้อ) · ภาพ 09
- oracle: ทุกแท็บเทียบ SQL ตรงบน seed (funnel/forecast/reps/lost/sources/scores) (16) · ตัวกรองทีม/pipeline/ช่วง (4) · export CSV job (2) · schedule cron ส่งอีเมล (2) · ภาพ (2)

### C3.2 — quotas + หน้าแรก (Sonnet · 20 ข้อ) · ภาพ 01 · 10
- oracle: progress ตรง ledger (5) · reached ครั้งเดียว/งวด (2) · KPI 6 ตรงเฉลย (6) · saved views objectKey 3 ชนิด (3) · ภาพ owner/thana (4)

### C3.3 — commissions (Opus · 30 ข้อ) · ภาพ 10 ขวา
- oracle: S1 PAID: ชำระบางส่วน 2 ครั้ง → 2 แถวสัดส่วน · unique กันซ้ำ (5) · S2 WON กฎ (2) · S3 TIERED/split (4) · S4 approval → HrPayAdjustment (ผูก linkedUserId · ไม่ผูก → รอ) (5) · S5 reverse ก่อน/หลัง PAID (4) · S6 `hr.payroll.paid` → PAID (2) · S7 เพดานอนุมัติ → APPROVAL_REQUIRED (2) · S8 report/UI/ภาพ (6)

### C3.4 — MEETING/KB/AI ในหน้า (Opus · 22 ข้อ) · ภาพ 14 ซ้าย · 13 ค
- oracle: แจ้งห้องทีม (3) · unfurl (1) · ดีลเสี่ยง tool + proposal (4) · สรุป/ร่างอีเมล (mock AI) (4) · นามบัตร → proposal lead (3) · KB ใน prompt (2) · visibility ใน AI (2) · ภาพ (3)

### C3.5 — portal B2B (Opus · 30 ข้อ) · ภาพ 12
- oracle: S1 invite/OTP/LINE login (mock) → session ลูกค้า (5) · S2 quotations respond → account.quotation.responded + ดีลย้ายขั้น (4) · S3 invoices/payLink/slip (4) · S4 documents รวมวัตถุ portalVisible ของบริษัทตน · ข้ามบริษัท → 404 (5) · S5 requests → การ์ด/approval (4) · S6 revoke → session หมด (2) · S7 ธีมร้าน + LIFF + ภาพ customer (6)

### C3.6 — integrations + PAGES + Team ในสมาชิก (Sonnet · 16 ข้อ) · ภาพ 17
- oracle: status 24 ระบบ (enabled/lastEventAt) (4) · targets set/ใช้จริงใน bridges (4) · widgets PAGES 3 (3) · MemberSavedView.teamId (2) · ภาพ (3)

### C3.7 — มือถือครบ + แอปพนักงาน (Sonnet · 18 ข้อ) · ภาพ 13
- oracle: responsive C2–C3 (6) · แอป 3 จอ QC เรนเดอร์ (`apps/mobile/qc/` แบบ [[reference_qc_render_rn_app]]) (6) · เด้งบันทึกสายหลัง tel: (2) · push (2) · สแกนนามบัตร flow (2)

### C3.8 — REST/AI ชุดสาม + manifest (Opus · 20 ข้อ)
- oracle: op ครบ 96 มี test (1) · portal op session (4) · records dynamic ทุกวัตถุ (3) · manifest 32 tool (2) · docs = generator (1) · webhook ครบ (2) · skill F13.9 (1) · smoke ทุก op (6)

### C3.9 — PDPA/ความปลอดภัย/เพดาน (Opus · 24 ข้อ)
- oracle: erase ผู้ติดต่อ → anonymize + ลบ body/เสียง/เว็บ + คงดีล/คอมมิชชันตัวเลข (6) · export รวม CRM (2) · purge cron (2) · signed URL หมดอายุ (2) · rate limit public (3) · เพดานทุกตัว + แจ้งก่อนถึง (5) · เจาะ: thana ข้ามทีม/portal ข้ามบริษัท/tracking ไม่ยินยอม/API readonly ไม่เห็น body (4)

### C3.10 — ปิดเฟส (Fable)
- qc:all เต็ม · backfill prod dry-run → จริง · prod verify (owner/thana/nok/portal ทุกหน้า §3) · `HANDOVER-…-CRM.md` · Telegram · memory

## 3. ลำดับ · ข้อพึ่งพา RUN สมาชิก
- ลำดับ: C1.1 → C1.2 → C1.3 → C1.4 → C1.5 → C1.6 ∥ C1.7 → C1.8 → C1.9 ∥ C1.10 → C1.11 → **ปิด C1** (qc:all) → C2.1 → C2.2 ∥ C2.3 → C2.4 ∥ C2.5 → C2.6 ∥ C2.7 → C2.8 ∥ C2.9 → C2.10 → C2.11 → **ปิด C2** → C3.1 → C3.2 ∥ C3.3 → C3.4 ∥ C3.5 → C3.6 ∥ C3.7 → C3.8 → C3.9 → C3.10
- สมาชิก (สถานะ 11 ก.ย.: M1 ครบ · M2 ครบ · M3.1 ✅ · M3.2 กำลังทำ): C1 เริ่มได้ทันทีเมื่อสั่ง (M1.2 fields · M1.4 360 · M1.11 REST ลงแล้ว) · C2.1 ควรรอ **M3.3 journey** (แอ็กชัน SEND_EMAIL/LINE/WAIT_THEN) — ถ้าสั่ง CRM ก่อน M3.3 ปิด ให้ C2.1 ทำแอ็กชันเหล่านั้นแล้วสมาชิกใช้ต่อ · C2.9 ตรวจก่อนว่า `booking.completed`/`shop.order.paid` สมาชิกทำแล้วหรือยัง (M2.8/M3.x)
- ขนาน 2 ใบได้เมื่อไม่แตะไฟล์เดียวกัน (∥ ในลำดับ) · เครื่องรวมกันไม่เกิน 2 builder

### 3.1 ตารางสถานะสด
| WO | สถานะ | commit | หมายเหตุ |
|---|---|---|---|
| (ทั้งหมด) | ⏸️ ยังไม่เริ่ม | — | รอเจ้าของสั่ง "เริ่ม RUN CRM v2" |

## 4. บันทึกเหตุการณ์ / มติเทคนิค
- 11 ก.ย. 2569 — เขียนแผน 32 ใบจากพิมพ์เขียว 20-crm-v2 หลังมติเจ้าของ 10 ข้อ (DESIGN-CRM §9) · C7 portal เจ้าของยืนยัน "เอา" 11 ก.ย. → C3.5 อยู่ในแผนเต็ม
