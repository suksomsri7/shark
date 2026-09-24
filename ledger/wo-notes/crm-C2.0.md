# WO C2.0 — migration `crm_v2_b` (ตารางทั้งหมดของเฟส C2) + ช่องเครดิต `CRM_ASSIST`

> RUN "CRM v2" · 23 ก.ย. 2569 · ผู้คุมงาน Opus 5 · ข้อสอบ `qc-crm-c2.0` 73 ข้อ · builder บน QC2 (worktree `shark-crm-c20`) · ผู้คุมงานตรวจเองบน QC1 (`.qc-shots/crm/c20-verify.log` + `c20-verify2.log`)
> ใบนี้เป็น 1 ใน 3 ใบของ RUN ที่แตะ `prisma/schema/*` ได้ (C1.1 · C2.0 · C3.0)

## 1. สิ่งที่ส่งมอบ
- **`prisma/migrations/20261101000000_crm_v2_b/migration.sql`** (604 บรรทัด · sha256 `33e25d71…`) — ตารางของเฟส C2 ทั้งเฟส: คะแนน (`CrmScoreRule`/`CrmScoreLog`) · มอบหมาย (`CrmAssignmentRule`) · ลำดับติดตาม (`CrmSequence`/`Step`/`Enrollment` + `version`/`sequenceVersion`/`leaseUntil`) · อีเมล (`CrmEmailMessage`+`leaseUntil` · `CrmEmailEvent` · `CrmEmailTemplate` · `CrmEmailUserSetting` · `CrmMailProvider` · `EmailDomain`) · ติดตามเว็บ (`CrmTrackedLink`/`CrmTrackedClick`/`CrmWebSession`/`CrmWebEvent`) · `CrmDealPayment` (ทั้งสายโยง POS↔ดีล และธงกันซ้ำของ `recordPayment` — มติ C29 ไม่เพิ่มคอลัมน์บน `PosSale`) · `CrmUserPref` (มติ C22) · `CrmImportJob`
- คอลัมน์บนตารางเดิม: `FormDef` += `crmSystemId`/`assignRuleId`/`utmCapture`/`scoreOnSubmit`/`createCompanyFromField`/`spamGuard` · `FormSubmission` += `utm`/`pageUrl`/`referrer`/`webSessionId` · `CrmContact.trackingOptOut` · `AutomationRun.crmContactId` (+ partial unique)
- **`prisma/migrations/20261101000001_ai_credit_crm_assist/migration.sql`** (9 บรรทัด · sha256 `2e86c0fa…`) — `ALTER TYPE "AiCreditSource" ADD VALUE 'CRM_ASSIST'` แยกโฟลเดอร์เพราะ QC2 apply `crm_v2_b` ไปแล้ว (แก้ไฟล์เดิม = checksum ไม่ตรง) · ชื่อโฟลเดอร์ห้ามมี `_crm_v2_` (ข้อสอบ S1.1 นับเป็นความผิด)
- `src/lib/core/scope.ts` — ลงทะเบียน scope (ด่าน F1) ครบทุกโมเดลใหม่ 19 ตัว (`sys()` = มี systemId ของระบบ CRM · `tenant` = ตารางลูก)
- `src/app/app/settings/credit/page.tsx` — ป้ายไทยของช่องเครดิต: `CRM_ASSIST` ใหม่ + 4 ช่องที่เคยโชว์เป็นรหัสดิบให้เจ้าของร้าน (`CHAT_TRANSLATE`/`CHAT_SUGGEST`/`ACCOUNT_INBOX`/`MEMBER_ASSIST`)
- `scripts/crm-backfill-companies-from-text.mts` — ตั้ง primary ให้เฉพาะผู้ติดต่อคนแรกของบริษัทที่ยังไม่มี primary (กันซ้ำ เพื่อให้ unique "หนึ่ง primary" ของ C6.1 ลงได้ภายหลัง)

## 2. ผู้คุมงานอ่าน SQL ทุกบรรทัด (กติกาเหล็ก)
`crm_v2_b` 604 บรรทัด — **additive ล้วน**: CREATE TYPE 6 · ADD VALUE 1 (ค่า `KANBAN` ไม่ถูกใช้ในไฟล์เดียวกัน) · ADD COLUMN 13 บนตารางเดิม 5 ตาราง (nullable หรือ default คงที่ทั้งหมด) · CREATE TABLE 19 · index 31 + unique 14 (บนตารางเดิมมีตัวเดียว = partial บน `AutomationRun.crmContactId` ที่เพิ่งเพิ่ม ⇒ แถวเดิมไม่เข้าดัชนี สแกนตารางครั้งเดียวตอนสร้าง) · FK 8 เฉพาะตารางใหม่
**ไม่มี** DROP / RENAME / ALTER COLUMN / UPDATE-DELETE / NOT NULL หรือ UNIQUE ที่ล้มได้กับแถว prod เดิม · unique "หนึ่ง primary" ของ `CrmCompanyContact` **ไม่อยู่ในใบนี้** (→ C6.1 หลัง backfill)
`ai_credit_crm_assist` — `ADD VALUE` ค่าเดียว ไม่มีคอลัมน์ไหนใช้เป็น default/cast/เงื่อนไขในไฟล์เดียวกัน (ข้อห้าม ADD VALUE ใน tx เดียวของ Postgres)
ลงฐานแล้ว: **QC1 + QC2 + QC3** (`qc-prisma.sh migrate deploy` · ผู้คุมงานเป็นคนสั่ง builder ไม่ deploy) · prod จะรันเองตอน `vercel-build`

## 3. ด่าน
| # | ผล | หลักฐาน |
|---|---|---|
| D2 | ✅ | `qc-crm-c2.0` **73/73** บน QC1 seed ใหม่ (`c20-verify.log`) |
| D4 | ✅ | ถอยหลังเขียวทั้งชุดบน seed เดียวกัน: `qc-form` · `qc-forms-notify` · `qc-marketing` · `qc-member-m1.2` (27/27) · C1.1 (50) · C1.2a (91) · C1.2b (93) · C1.3 (89) · C1.4 (110) · C1.5 (103) · C1.6 (79) · C1.7 (57) · C1.8 (81) · C1.9 (45) · C1.10 (66) · C1.11 (66) · `qc-crm-v1` (17) · `qc-acc-v2-inbox` (128) · `qc-chat-ai-suggest` (44) · `qc-chat-translate` (34) · `qc-automation` (13) · `qc-account-api-keys` (51) · `qc-crm-c0.2` (27) |
| D7 | ✅ | `probe-uiversion-gate` **14/14** แบบไม่ตั้ง env (ร้าน uiVersion 1 = หน้า v1 เหมือนเดิม · ใบนี้ไม่มี UI ใหม่นอกจากป้ายช่องเครดิตในหน้าตั้งค่าเครดิตของแอป ซึ่งไม่ใช่หน้า CRM) |
| D5/D6 | ✅ | `migrate diff` จากฐาน QC1 = ว่าง (สคีมาตรงกับ migration) · typecheck ผ่าน · fitness **32/32** และ **32/32 แบบไม่มี env DB** · build + serve + `qc-member-m3.10` + `qc-member-m1.9` |

## 4. เหตุการณ์
- unit ตรวจรอบแรก (`crm-c20-verify`) ถูกตัดกลางคันตอนเครื่องรีสตาร์ต 19 ก.ย. — ทุกขั้นก่อนหน้า build เขียวหมด · ผู้คุมงาน 23 ก.ย. รันส่วนที่เหลือใหม่เป็น unit `crm-c20-verify2` (build+serve → m3.10 → m1.9)
- ไม่มี ORACLE-EDIT ในใบนี้

## 5. D12 — push/deploy
✅ push `965c0bbd` → session/crm + main · deploy **`dpl_FFKFzGFgLd1Kyg9gV3XRt5ZMGs9m`** ขึ้นหลัง **444 วิ** · `/api/health` = `{ok:true, db:true}` ⇒ `prisma migrate deploy` ในขั้น `vercel-build` ผ่าน (ถ้า migration ล้ม deployment จะไม่ถูกโปรโมท) · ร้านจริงไม่เห็นความเปลี่ยนแปลงใด ๆ (ใบนี้เพิ่มแต่ตารางเปล่า + ป้ายไทยในหน้าเครดิตของแอป)
⚠️ `outboxPending = 1` ยังเป็นค่าเดิมที่ค้างมาตั้งแต่ C1.8 (19 ก.ย.) — ไม่ได้เกิดจากใบนี้ · แจ้งเจ้าของแล้ว (ผู้คุมงานอ่าน DB prod ไม่ได้ตามกติกา จึงดูได้แค่ตัวนับ)
