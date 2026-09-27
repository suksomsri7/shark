# WO C4.1 — ทะเบียนปุ่มครบ (builder · 27 ก.ย. 2569 · worktree `shark-crm-c23` @ a9d4d146)

> ยังไม่ commit · ไม่ได้ build · ไม่ได้แตะ `scripts/qc-crm-buttons.mts` · ไม่ได้แตะข้อสอบ (fitness ไม่ต้องแก้ — baseline ว่างอยู่แล้ว)
> log ทั้งหมด: `.qc-shots/c41/` · ผลไล่ DOM: `.qc-shots/crm/inventory/crawl.json` (สำเนา `.qc-shots/c41/crawl-final.json`)

## §1 ตัวไล่ DOM — `scripts/visual-crm.mts --inventory`

- ใช้: `bash scripts/iso.sh env CRM_EXPECTED_PATH=<เฉลยของฐานที่เซิร์ฟเวอร์ใช้> pnpm exec tsx scripts/visual-crm.mts --inventory [--user owner|manager|nok|thana|customer|anon] [--page <ค่า page ตรงตัว หรือ regex>] [--dry]`
  - ไม่ใส่ `--user` = ไล่ทุกบทบาท (owner · manager · nok · thana · customer ถ้าฐานมี `CrmPortalAccess` ที่ตอบรับแล้ว · anon สำหรับหน้าสาธารณะ) · แต่ละรอบรวมผลเข้า `crawl.json` เดิม (คีย์ `<หน้า>|<บทบาท>`) จึงแบ่งรอบให้จบใน 10 นาทีได้
  - `CRM_EXPECTED_PATH` (บรรทัด 46–49): เซิร์ฟเวอร์ QC ของ tree หลักอ่าน **QC1** แต่เฉลยของ worktree นี้เป็นของ QC3 ⇒ รอบนี้รันด้วย `.env.qc` (QC1) + `/root/projects/shark-crm/scripts/crm-expected.json`
- โค้ด: บล็อก `INVENTORY` บรรทัด 1775–2074 · `mintSession(key)` รับบทบาทได้ (1720–1722) · ข้ามด่าน ping/สเปคเดิมเมื่อเป็นโหมดนี้ (1073, 1079)
- รายการหน้า 72 หน้า: หน้าใต้ `src/app/app/sys/[id]/crm/**` ทั้งหมด (+ มุมมอง `/deals?view=table|forecast` + `/reports/<แท็บ>` 7 แท็บ) · `/app/settings/teams` · แผง CRM ในแชท (`/app/sys/[id]?c=` ขอบเขต `crm-chat-panel`) · `/app/party/[partyId]` (ขอบเขต `party-crm`) · หน้าโฮสต์ POS/MEMBER/HR · `/p/[slug]` · portal `/b/[slug]/**` · `/u/[token]` · หน้ารายละเอียดหา id จาก **ลิงก์ที่ผู้ใช้คนนั้นเห็นจริงบนหน้ารายการ** (สิทธิ์การมองเห็นถูกต้องเอง)
- ต่อหน้า × 1440/390: testid ทั้งหมด (กดได้ไหม · มองเห็นไหม) · คอนโทรลที่ **ไม่มี testid** (tag + ข้อความ + selector path + handler ที่อ่านจาก `__reactProps$` ของ React — จับ `div onClick` ที่ไม่มี role ได้) · แถวทะเบียนที่ไม่เห็น · แถว hiddenFor ที่โผล่
- ห้ามเขียนฐาน (ออกแบบ 3 ชั้น): (1) ทุกคำขอที่ไม่ใช่ GET/HEAD/OPTIONS ถูก **abort ในเบราว์เซอร์** (server action ไม่ถึงเซิร์ฟเวอร์ — จดไว้ใน `aborted[]`) (2) กดเฉพาะ "ตัวเปิด" ที่แถวบอกว่าเป็น modal/ui/tab/menu และชื่อไม่เข้าข่ายเขียน/ลบ/ส่ง (regex `DESTRUCTIVE`) แล้ว Escape/โหลดใหม่ (3) ไม่เปิด `/t/*` `/l/*` (route ที่ GET = บันทึกการเปิด/คลิก · ไม่มี UI) · ของที่เขียนมีแค่ session ของรอบ (ลบใน finally — ทุกรอบพิมพ์ "ลบ session ของรอบนี้ 1") · โปรไฟล์ chromium ลบทุกรอบ (บรรทัด 2052–2055)
- ขอบเขตที่ไล่ไม่ได้บน QC1 (seed ไม่มีของ): portal ลูกค้า (`settings.crm.portal.enabled=false` + ไม่มี `CrmPortalAccess` ⇒ `/b/*` 404 ทั้งหมด) · แผง CRM ในแชท (ไม่มีห้องแชทของผู้ติดต่อ CRM) · `/p/[slug]` (ไม่มี Page ที่วาง widget CRM) · `/emails/[threadKey]` · `/settings/sequences/[sequenceId]` · account doc · meeting ⇒ หน้าพวกนี้ตรวจด้วยตัวสแกนโค้ดแบบ static (`.qc-shots/c41/static_scan.py` — หา JSX ที่กดได้แต่ไม่มี data-testid ในทุกโฟลเดอร์ CRM) แทน · **ไม่ได้สร้าง fixture เอง** (สั่งไว้ว่าห้ามเขียนฐาน) — ถ้าต้องการรอบลูกค้าจริง ต้องให้ผู้คุมงานตัดสิน fixture portal (ดู §6 D2)

## §2 ผลไล่ (4 บทบาท + anon · 1440 + 390 · 243 รายการหน้า×บทบาท)

| หน้า (page@system) | แถวหลัง C4.1 | แถวที่เห็นใน DOM (ผู้ใช้ใดก็ได้) | HTTP ต่อผู้ใช้ (desktop) | คอนโทรลไม่มี testid ที่เป็นของ CRM |
|---|---:|---:|---|---:|
| `/activities` | 47 | 27 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/app/party/[partyId]` | 2 | 1 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/app/settings/teams` | 22 | 14 | owner:200 manager:404 nok:404 thana:404 | 0 |
| `/app/sys/[id]` | 49 | 32 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/app/sys/[id]/account/docs/[docType]/[docId]@ACCOUNT` | 1 | - | - | - |
| `/app/sys/[id]/meeting@MEETING` | 1 | - | - | - |
| `/app/sys/[id]/member/members@MEMBER` | 1 | 0 | owner:200 manager:200 nok:404 thana:200 | 0 |
| `/app/sys/[id]/pos/register@POS` | 1 | 0 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/app/sys/[id]@CHAT` | 9 | 0 | owner:skip manager:skip nok:skip thana:skip | 0 |
| `/app/sys/[id]@HR` | 1 | 1 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/b/[slug]` | 12 | - | - | - |
| `/b/[slug]/documents` | 1 | - | - | - |
| `/b/[slug]/documents/[id]` | 4 | - | - | - |
| `/b/[slug]/invite/[token]` | 1 | 0 | anon:404 | 0 |
| `/b/[slug]/invoices` | 3 | - | - | - |
| `/b/[slug]/login` | 7 | 0 | anon:404 | 0 |
| `/b/[slug]/quotations` | 1 | - | - | - |
| `/b/[slug]/requests` | 5 | - | - | - |
| `/calendar` | 9 | 8 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/commissions` | 3 | 2 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/companies` | 23 | 15 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/companies/[companyId]` | 63 | 28 | owner:200 manager:200 nok:skip thana:skip | 8 |
| `/companies/duplicates` | 2 | 2 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/companies/new` | 17 | 7 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/contacts` | 56 | 21 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/contacts/[contactId]` | 88 | 27 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/contacts/duplicates` | 12 | 3 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/contacts/import` | 6 | 3 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/contacts/new` | 11 | 8 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/deals` | 53 | 34 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/deals/[dealId]` | 45 | 27 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/deals/new` | 15 | 14 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/emails` | 12 | 6 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/emails/[threadKey]` | 14 | 0 | owner:skip manager:skip nok:skip thana:skip | 0 |
| `/objects` | 2 | 1 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/objects/[key]` | 32 | 8 | owner:200 manager:200 nok:skip thana:skip | 0 |
| `/objects/[key]/[recordId]` | 3 | 3 | owner:200 manager:200 nok:skip thana:skip | 0 |
| `/p/[slug]` | 5 | 0 | owner:skip manager:skip nok:skip thana:skip | 0 |
| `/pipelines` | 4 | 4 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/reports` | 15 | 13 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/reports/[tab]` | 0 | 0 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/settings` | 16 | 8 | owner:200 manager:404 nok:404 thana:404 | 0 |
| `/settings/api` | 14 | 11 | owner:200 manager:404 nok:404 thana:404 | 0 |
| `/settings/assignment` | 32 | 9 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/settings/automation` | 49 | 16 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/settings/commissions` | 30 | 18 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/settings/email` | 39 | 21 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/settings/forms` | 8 | 0 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/settings/holidays` | 9 | 8 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/settings/integrations` | 9 | 9 | owner:200 manager:404 nok:404 thana:404 | 0 |
| `/settings/lost-reasons` | 6 | 6 | owner:200 manager:404 nok:404 thana:404 | 0 |
| `/settings/notifications` | 14 | 11 | owner:200 manager:200 nok:200 thana:200 | 0 |
| `/settings/objects` | 31 | 24 | owner:200 manager:404 nok:404 thana:404 | 0 |
| `/settings/pipelines` | 14 | 9 | owner:200 manager:404 nok:404 thana:404 | 0 |
| `/settings/portal` | 7 | 7 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/settings/quotas` | 6 | 6 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/settings/scoring` | 23 | 15 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/settings/sequences` | 7 | 6 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/settings/sequences/[sequenceId]` | 32 | 0 | owner:skip manager:skip nok:skip thana:skip | 0 |
| `/settings/stages` | 18 | 17 | owner:200 manager:404 nok:404 thana:404 | 0 |
| `/settings/tracking` | 22 | 13 | owner:200 manager:200 nok:404 thana:404 | 0 |
| `/settings/visibility` | 10 | 9 | owner:200 manager:404 nok:404 thana:404 | 0 |
| `/u/[token]` | 1 | 1 | anon:200 | 0 |

(ตัวเลข "แถวที่เห็น" = แถวที่ testid โผล่ในสถานะเริ่มต้นของหน้า หรือหลังกดตัวเปิดที่ไม่ทำลาย — แถวที่เหลืออยู่ในโมดัลที่เปิดด้วยปุ่มเขียน · ขึ้นกับข้อมูล (รายการว่าง) · หรือหน้าที่ข้าม ⇒ ไม่ใช่แถวผี: testid ทุกแถวมีอยู่จริงในโค้ด (F14.2) · `crawl.json` มี `rowsNotSeen` ต่อหน้า×บทบาท คำนวณใหม่กับทะเบียนหลังแก้แล้ว)

**คอนโทรลไม่มี testid ที่เจอ** (DOM 1,386 จุดก่อนรวม = 281 กลุ่ม ตามหน้า×selector): 234 = `ModuleTabs` (แท็บ CRM ของแพลตฟอร์ม) · 29 = ลิงก์ย้อนกลับของ `PageHeader` (แพลตฟอร์ม) · 1 = ลิงก์ "จัดการการเชื่อมระบบ" ของหน้า hub กลาง · 14 = ตัวออกแบบฟิลด์ `src/components/member/FieldDesigner.tsx` (โมดูลสมาชิก — เครื่องยนต์ custom field ตัวเดียว) · **2 = พื้นหลังโมดัลของ CRM (แตะนอกหน้าต่าง = ปิด)** ⇒ แก้แล้ว (§4) · ตัวสแกน static เจอเพิ่ม 3 จุดพื้นหลังแบบเดียวกัน (แก้แล้ว) + UI v1 `src/lib/modules/crm/ui.tsx` 28 จุด (§4 ข้อยกเว้น) · ที่เหลือของสแกน static เป็นการเรียกคอมโพเนนต์ที่มี testid ข้างในแล้ว
**testid ที่กดได้แต่ไม่มีแถว**: 0 ของ CRM (ที่เห็นคือ `report-issue` · `ai-orb` · `nav-collapse` ของแพลตฟอร์ม) · **hiddenFor ที่โผล่**: ก่อนแก้ 4 (`crm-card-scan*` ให้ nok — ทะเบียนผิด · `crm-notify-page` กล่องที่ถูกลบแถว) → หลังแก้ 0

## §3 แก้ทะเบียน (`scripts/crm-ui-inventory.json` · 1,144 → 1,055 แถว · หลังรีวิว 1,052 — §8)

- **แถวผี (ไม่มี testid ในโค้ด)**: 0 ก่อนและหลัง (F14.2) · **แถวที่ไม่ใช่คอนโทรล ลบ 94 แถว** — ทั้งหมดเป็น `kind:"form"`/อื่น ๆ ที่ชี้กล่อง/ข้อความ/แถวรายการ/ตาราง/`audio` ที่ไม่มีตัวกด (ตัวกด C4.2 จะกดแล้วได้ "dead" ฟรี) — ยังใช้เป็น `expect.target` ได้ตามเดิม:
- `/settings`: `crm-uiversion-toggle` (div)
- `/settings/sequences`: `crm-sequences-page` (div) · `crm-sequences-timer-stale` (p) · `crm-seq-list` (div) · `crm-seq-empty` (div) · `crm-seq-msg` (p) · `crm-seq-row-*` (li)
- `/settings/sequences/[sequenceId]`: `crm-sequence-editor-page` (div) · `crm-seq-editor` (div) · `crm-seq-editor-msg` (p) · `crm-seq-step-fields-*` (div/li) · `crm-seq-stats` (section) · `crm-seq-stats-row-*` (tr) · `crm-seq-enrollments` (section) · `crm-seq-enr-row-*` (tr) · `crm-seq-archive-box` (section) · `crm-seq-stats-other-version` (p) · `crm-seq-overview` (section)
- `/settings/holidays`: `crm-holidays-page` (div) · `crm-seq-calendar` (div) · `crm-seq-holiday-empty` (p) · `crm-seq-holiday-row-*` (li) · `crm-seq-calendar-msg` (p)
- `/contacts/[contactId]`: `contact-360-sequences` (section) · `contact-360-seq-*` (li) · `crm-seq-enroll-box` (div) · `crm-seq-enroll-msg` (p) · `crm-call-log-modal` (div) · `crm-call-recording-player` (audio) · `crm-call-error` (p) · `crm-call-saved` (p) · `crm-call-ai-unavailable` (p) · `crm-call-ai-error` (p) · `crm-call-ai-working` (p) · `crm-call-ai-card` (div) · `crm-call-recording-audio` (audio) · `crm-call-recording-error` (p) · `crm-call-recording-done` (p) · `crm-web-timeline` (section) · `crm-web-session-*` (div) · `contact-score-badge` (span) · `contact-score-reason-*` (span)
- `/contacts`: `crm-seq-bulk-box` (div) · `crm-seq-bulk-msg` (p) · `crm-card-scan-block` (section) · `crm-card-scan-draft` (div) · `crm-card-scan-error` (p) · `crm-card-scan-done` (p)
- `/settings/assignment`: `crm-assign-page` (div) · `crm-assign-error` (p) · `crm-assign-rule-list` (table) · `crm-assign-rule-row-*` (tr) · `crm-assign-next-*` (span) · `crm-assign-editor` (section) · `crm-assign-delete-box` (section) · `crm-assign-leave-note` (p) · `crm-assign-simulate-result` (ol)
- `/emails`: `crm-emails-page` (div) · `crm-emails-inbox` (ul) · `crm-email-my-sending` (section) · `crm-email-my-msg` (p)
- `/emails/[threadKey]`: `crm-email-thread-page` (div) · `crm-email-thread-msg` (p) · `crm-email-composer-msg` (p)
- `/settings/email`: `crm-email-settings` (div) · `crm-email-settings-msg` (p) · `crm-email-domain-records` (table) · `crm-email-user-overrides` (table) · `crm-email-templates` (ul)
- `/settings/tracking`: `crm-tracking-page` (div) · `crm-track-preview-box` (div) · `crm-track-error` (p) · `crm-track-stats` (section) · `crm-link-error` (p) · `crm-link-row-*` (div)
- `/settings/forms`: `crm-forms-page` (div) · `crm-forms-row-*` (section) · `crm-forms-error-*` (p)
- `/app/sys/[id]/pos/register`: `pos-deal-hint` (span)
- `/settings/scoring`: `crm-score-msg` (p) · `crm-score-recompute-summary` (span) · `crm-score-rule-list` (section) · `crm-score-rule-row-*` (tr) · `crm-score-delete-panel` (section) · `crm-score-preview-row-*` (span)
- `/settings/notifications`: `crm-notify-page` (div) · `crm-notify-msg` (p) · `crm-notify-template-row-*` (li)
- `/app/sys/[id]`: `crm-home-stale-list` (p/ul) · `crm-home-leaderboard` (section) · `crm-home-sources` (section) · `crm-home-unowned` (section) · `crm-ai-at-risk-table` (table)
- `/settings/quotas`: `crm-quota-table` (section)
- **เพิ่ม 5 แถว**: พื้นหลังโมดัล (§4) · `expect {type:"ui", target:<โมดัล>, state:"disappears"}`
- **page ตามพารามิเตอร์ route จริง (87 แถว)**: `/companies/[id]`→`/companies/[companyId]` (11) · `/contacts/[id]`→`/contacts/[contactId]` (8) · `/` (45) และ `/app/sys/[id]` (9) = หน้าเดียวกัน (hub ของ CRM) → `/app/sys/[id]` · `/app/sys/[id] (HR hub)`→`/app/sys/[id]` + `system:"HR"` · `/app/sys/[chatId]?c=[conversationId]`→`/app/sys/[id]` + `system:"CHAT"` + `query:"c=[conversationId]"` · POS/MEMBER/ACCOUNT/MEETING ได้ `system` · `/contacts · /companies · /deals`→`/contacts` + `alsoOn:["/companies","/deals"]` (F14.2 ห้าม testid ซ้ำ ⇒ 1 แถว + alsoOn)
- **query ของมุมมอง (17)**: แถวที่ DOM เห็นเฉพาะมุมมองตาราง/forecast — `deals-filter-stage`→view=table, `deals-filter-sort`→view=table, `deals-forecast-group-*`→view=forecast, `deals-forecast-category-all`→view=forecast, `deals-forecast-category-*`→view=forecast, `deal-export-btn`→view=table, `deal-bulk-stage`→view=table, `deal-bulk-owner`→view=table, `deal-bulk-reason`→view=table, `deal-bulk-confirm`→view=table, `deal-bulk-move`→view=table, `deal-bulk-reassign`→view=table, `deal-bulk-tag-input`→view=table, `deal-bulk-tag`→view=table, `deal-check-all`→view=table, `deal-row-check-*`→view=table, `deal-row-link-*`→view=table
- **alsoOn จาก DOM จริง (29 แถว · testid ตรงตัวเท่านั้น)**: `activity-row-complete` (+/contacts/[contactId]); `activity-row-reschedule` (+/contacts/[contactId]); `activity-row-delete` (+/contacts/[contactId]); `crm-activity-add` (+/companies/[companyId], /objects/[key]/[recordId]); `crm-activity-add-note` (+/companies/[companyId], /objects/[key]/[recordId]); `crm-files-input` (+/companies/[companyId], /deals/[dealId], /objects/[key]/[recordId]); `crm-activity-all` (+/companies/[companyId], /objects/[key]/[recordId]); `object-record-parent-link` (+/objects/[key]/[recordId]); `object-record-form` (+/objects/[key]/[recordId]); `object-record-cancel` (+/objects/[key]/[recordId]); `object-record-save` (+/objects/[key]/[recordId]); `crm-dup-merge-open` (+/companies/duplicates); `crm-call-outcome` (+/deals/[dealId]); `crm-call-duration` (+/deals/[dealId]); `crm-call-direction` (+/deals/[dealId]); `crm-call-start` (+/deals/[dealId]); `crm-call-note` (+/deals/[dealId]); `crm-call-next-task` (+/deals/[dealId]); `crm-call-next-task-due` (+/deals/[dealId]); `crm-call-recording-input` (+/deals/[dealId]); `crm-call-save` (+/deals/[dealId]); `crm-call-cancel` (+/deals/[dealId]); `crm-report-back` (+/reports/[tab]); `crm-report-filter-period` (+/reports/[tab]); `crm-report-filter-team` (+/reports/[tab]); `crm-report-filter-pipeline` (+/reports/[tab]); `crm-report-export` (+/reports/[tab]); `crm-report-schedule` (+/reports/[tab]); `crm-view-save-open` (+/companies, /deals)
- **expect (347 แถว)**: target เป็นข้อมูลให้เครื่องอ่านล้วน — คำอธิบายย้ายไป `note` · path ทุกตัวเป็น route เต็ม (`/app/sys/[id]/crm/…` — ตัวเทียบ URL ของ C4.2 anchor path ที่ขึ้นต้น `/` เป็น absolute อยู่แล้ว ⇒ path แบบย่อเดิมไม่มีวันตรง) · `<id>`/`[hot]`/`…` → `*` · ทางเลือกหลายปลายทาง → `target` + `anyOf[]` · op/action ที่มีคำอธิบาย → op ล้วน + `note` · แถว mutation 8 แถวที่ target เป็น testid ผลลัพธ์ → `target: action:<ชื่อจริง>` + `resultTarget` · **ชนิดใหม่ `ui`** (เปลี่ยนเฉพาะหน้าจอ ไม่เขียนฐาน: ปิดโมดัล/ยกเลิก/สลับแท็บ/ช่องในร่าง) พร้อม `state: appears|disappears|changes` แทน `inline-error`+ร้อยแก้ว · ช่องกรอกที่เคยเขียน "(ช่องกรอก/ตัวเลือก — ตรวจค่าแบบ inline)" ชี้ testid ข้อความผิดพลาดจริงของฟอร์มนั้น (`deal-fields-msg` · `deal-lines-msg` · `deal-new-error` · `pl-msg` · `lr-msg` · `activity-log-error` · `st-msg-*` ฯลฯ) · `deal-new-cancel` → `navigate history:back` (โค้ดเป็น `router.back()`) · **ร้อยแก้วใน target เหลือ 0** (`.qc-shots/c41/validate.py` → bad 0)
- **kind (67)**: `form` = `<form>` ที่เขียนข้อมูลเท่านั้น · **`filter`** = `<form method=get>` ตัวกรอง (companies/contacts/deals/objects/activities/emails/home/quotas) · แถว `form` ที่จริงเป็น `<select>/<input>` เปลี่ยนเป็นชนิดจริง · `textarea` + `filter` + ฟิลด์ใหม่ `system/query/alsoOn/anyOf/note/state/resultTarget/dropTarget` บันทึกใน `$fields` · drag `deal-card-*` ได้ `dropTarget:"deal-column-*"`
- **roles/hiddenFor**: หน้าที่ตอบ 404 ให้บทบาทนั้น (สิทธิ์ระดับหน้า · แบบ 404-not-403) → ย้ายบทบาทไป hiddenFor (88 แถว):
- `/companies/duplicates` thana: 2 แถว
- `/contacts/duplicates` thana: 11 แถว
- `/contacts/import` thana: 6 แถว
- `/emails` nok: 5 แถว
- `/emails` thana: 5 แถว
- `/objects` nok: 1 แถว
- `/objects` thana: 1 แถว
- `/reports` nok: 6 แถว
- `/reports` thana: 6 แถว
- `/settings` manager: 5 แถว
- `/settings/lost-reasons` manager: 6 แถว
- `/settings/pipelines` manager: 14 แถว
- `/settings/sequences` nok: 1 แถว
- `/settings/sequences` thana: 1 แถว
- `/settings/stages` manager: 18 แถว
  - สิทธิ์ระดับส่วนที่ยืนยันในโค้ดแล้ว (60 รายการ): - owner-only (canSettings · /pipelines): pipelines-edit-stages-*, pipelines-settings-link → hiddenFor manager/nok/thana
- owner-only (canManageShop · /settings/notifications): crm-notify-channel-*, crm-notify-digest-hour, crm-notify-quiet-enabled, crm-notify-quiet-from, crm-notify-quiet-to, crm-notify-save, crm-notify-tab-shop → hiddenFor manager
- crm.report.view (home.tsx loadReport): crm-ai-at-risk-deal-*, crm-ai-home-at-risk, crm-home-ai-draft, crm-home-ai-risk, crm-home-ai-summary, crm-home-filter-apply, crm-home-filter-form, crm-home-filter-owner, crm-home-filter-pipeline, crm-home-filter-range, crm-home-filter-reset, crm-home-kpi-hot, crm-home-kpi-open, crm-home-kpi-stale, crm-home-kpi-weighted, crm-home-kpi-winrate, crm-home-kpi-won, crm-home-leaderboard-link-*, crm-home-saved-view, crm-home-saved-view-item-*, crm-home-search, crm-home-search-form, crm-home-source-row-*, crm-home-stale-banner → hiddenFor nok/thana
  - `crm-card-scan*`: nok เห็นจริง (มีคีย์ `crm.contact.create`) → ย้ายจาก hiddenFor เข้า roles
  - **ไม่แตะ** (ขึ้นกับข้อมูล ไม่ใช่สิทธิ์ · ต้องตัดสินด้วยข้อมูลที่ตั้งใจ): ช่องแก้บนดีล 360 ที่ thana/nok ไม่เห็นบนดีลที่ไม่ใช่ของตัวเอง · แถวรายการกิจกรรม/บริษัท/ปฏิทินที่บางคนไม่มีข้อมูล

## §4 โค้ด product ที่เพิ่ม data-testid (ไม่เปลี่ยนพฤติกรรม · **ยังไม่ build — ผู้คุมงานต้อง build รอบหน้าแล้วไล่ซ้ำ**)

| testid | ไฟล์:บรรทัด | ชนิด | แถวทะเบียน |
|---|---|---|---|
| `company-360-sheet-backdrop` | `src/app/app/sys/[id]/crm/companies/_components/Company360Actions.tsx:47` | พื้นหลังโมดัล (แตะ = ปิด) | เพิ่มแล้ว |
| `companies-import-backdrop` | `…/companies/_components/CompanyListTools.tsx:86` | 〃 | เพิ่มแล้ว |
| `contact-360-sheet-backdrop` | `…/contacts/_components/Contact360Actions.tsx:50` | 〃 | เพิ่มแล้ว |
| `contacts-sheet-backdrop` | `…/contacts/_components/ContactListTools.tsx:53` | 〃 | เพิ่มแล้ว |
| `crm-merge-sheet-backdrop` | `…/crm/_components/MergePairSheet.tsx:69` | 〃 (ใช้ทั้ง /contacts/duplicates และ /companies/duplicates) | เพิ่มแล้ว |
| `deal-lost-error` · `deal-reopen-error` · `deal-req-error` | `…/deals/_components/DealMoveDialogs.tsx:175 · 203 · 239` | ข้อความผิดพลาด (role=alert) — ไม่ใช่ตัวกด ไม่ต้องมีแถว | เป็น target ของ `deal-lost-*` `deal-reopen-*` `deal-req-*` |
| `activity-row-error` | `…/activities/_components/ActivityItems.tsx:202` | 〃 | target ของ `activity-row-*` |
| `st-msg-${s.id}` · `st-new-msg` | `…/settings/stages/_components/StageSettings.tsx:147 · 192` | ข้อความสถานะ | target ของ `st-*` |

**ข้อยกเว้นที่ไม่ได้ลงทะเบียน (ต้องให้ผู้คุมงานรับรู้/ตัดสิน):**
1. **คอนโทรลของแพลตฟอร์มที่แสดงบนหน้า CRM** — `src/components/module-tabs.tsx` (แท็บ ภาพรวม/ดีล/…/รายงาน บนทุกหน้า CRM) · `src/components/ui/PageHeader.tsx` (ลิงก์ "← …") · ลิงก์ hub "จัดการการเชื่อมระบบ" (`src/app/app/sys/[id]/page.tsx:84`) · Topbar/NavDrawer/`ai-orb`/`report-issue`: ไฟล์อยู่นอกโฟลเดอร์ CRM ⇒ F14 ไม่สแกน และถ้าลงแถวจะกลายเป็นแถวผี (F14.2) — ลงทะเบียนได้ก็ต่อเมื่อเพิ่ม `CRM_HOSTED_CONTROLS` ใน fitness (= แก้ข้อสอบ ⇒ ORACLE-EDIT §6 D3) · **ความจริงเรื่องการคุม (แก้ตามรีวิว)**: แท็บ CRM มาจาก `crmTabs()` (`src/lib/modules/crm/ui.tsx:70`) และ `crmNavItems()` (`src/lib/modules/crm/nav.ts:129`) แล้ววาดด้วย `ModuleTabs` · `scripts/qc-nav-functions.mts` เป็นการตรวจ href แบบ static ของ `childrenFor` ในเมนู accordion เท่านั้น — **วันนี้ไม่มีชุดข้อสอบไหนตรวจลิงก์ของแท็บ CRM เลย** · ผลต่อเจ้าของ: ถ้าแท็บชี้หน้าที่ไม่มี จะไม่มีใครจับได้จนกว่ามีคนกด ⇒ บันทึกเป็นหนี้: ตรวจแบบ static ว่า href ทุกตัวของ `crmTabs()`/`crmNavItems()` มี `page.tsx` จริง (แบบเดียวกับ qc-nav-functions)
2. **ตัวออกแบบฟิลด์ของโมดูลสมาชิก** บนหน้า `/settings/objects` (`FieldDesigner.tsx` — ปุ่ม เพิ่มฟิลด์/เพิ่มส่วน/เปลี่ยนชื่อส่วน/ที่จับลาก ไม่มี testid) — เป็นเครื่องยนต์ custom field ตัวเดียวตาม COMMON (ห้ามทำตัวที่สอง) · เจ้าของคือโมดูลสมาชิก ⇒ ไม่ได้แก้ไฟล์นั้น · ไฟล์นี้มี data-testid อยู่แล้ว 15 จุด (ที่ไม่มีคือปุ่มเพิ่มฟิลด์/เพิ่มส่วน/เปลี่ยนชื่อส่วน/ที่จับลาก) และโหมดวัตถุ (prop object) ถูกคุมโดย `scripts/qc-crm-c1.9.mts` (ข้อสอบของ C1.9 ยิง action ของตัวออกแบบฟิลด์ตรง) · ผลต่อเจ้าของ: ปุ่มพวกนั้นไม่ถูก "กดจาก DOM" โดย C4.2 แต่ผลของมันถูกตรวจในระดับ action (§6 D3)
3. **UI ของ CRM v1** `src/lib/modules/crm/ui.tsx` (28 จุด: ฟอร์มสร้างดีล/ผู้ติดต่อ/งาน · ปุ่มเลื่อนขั้น) — แสดงเฉพาะร้าน `uiVersion 1` · ฐาน QC ทั้งสองเป็น v2 จึงไม่ปรากฏใน DOM · baseline ของ C0.1 ว่างมาตั้งแต่ต้น (v1 ไม่มี testid เลย จึงไม่มีหนี้ "testid ไม่มีแถว") ⇒ **baseline ว่าง ไม่มีอะไรต้องถอด** · ผลต่อเจ้าของ: **ร้านบน production ทุกวันนี้ยังใช้ v1** — ปุ่ม v1 ไม่มี testid เลย F14 จึงมองไม่เห็นและไม่ได้กันอะไร และ C4.2 ไม่ได้กด จนกว่าจะย้ายร้านเป็น v2 ในใบ C6.3 (§6 D4)
4. **ปุ่มบนเว็บลูกค้า** (แถบยินยอมที่สคริปต์ `/t/s/<siteKey>.js` วาด — `data-sd`) ไม่อยู่ใน DOM ของ SHARK

## §5 เทียบภาพ mockup 17 ใบ

วิธีนับ: คอนโทรลในภาพ = element คลาส `btn · tab · inp · sw · cbx · fchip · kadd · mb3-radio` + `v` เฉพาะที่เป็นตัวเลือกมุมมอง (ภาพ 02) และช่องแก้ในที่ (ภาพ 03) · ไม่นับค่าที่แสดงผล/ตัวนับ (`v` ในภาพ 04/05/06/12/13) และแถบเมนูแพลตฟอร์ม (`ri`, topbar) · สคริปต์ `.qc-shots/c41/mockmap.py` ตรวจว่าทุก testid ที่อ้างมีแถวจริง (errs = [])

| ภาพ | คอนโทรลในภาพ | มีแถวในทะเบียน | ไม่ได้ทำ (เหตุผลด้านล่าง) |
|---|---:|---:|---:|
| 01-crm-home | 17 | 13 | 4 |
| 02-pipeline-board | 15 | 14 | 1 |
| 03-deal-360 | 17 | 14 | 3 |
| 04-company-360 | 12 | 12 | 0 |
| 05-contact-360-convert | 15 | 15 | 0 |
| 06-custom-objects | 14 | 10 | 4 |
| 07-automation-sequence | 11 | 11 | 0 |
| 08-activity-call-email-calendar | 18 | 18 | 0 |
| 09-reports-forecast | 13 | 13 | 0 |
| 10-teams-quota-commission | 4 | 4 | 0 |
| 11-web-email-tracking | 11 | 8 | 3 |
| 12-portal-b2b | 14 | 14 | 0 |
| 13-mobile-staff-crm | 18 | 10 | 8 |
| 14-ai-api-webhook | 7 | 5 | 2 |
| 15-email-routing-settings | 17 | 15 | 2 |
| 16-web-tracking-consent | 7 | 3 | 4 |
| 17-integration-map | 5 | 5 | 0 |
| **รวม** | **215** | **184** | **31** |

ต่อภาพ (→ testid ในทะเบียน · ✗ = ไม่ได้ทำ · P = ทำต่างจากภาพ):
- **01-crm-home**: นำเข้า lead→`crm-home-import` · เพิ่มดีล→`crm-home-new-deal` · ค้น (ช่องค้นหา)→`crm-home-search` · ตัวกรอง pipeline→`crm-home-filter-pipeline` · ตัวกรอง ผู้ดูแล→`crm-home-filter-owner` · ตัวกรอง ช่วง→`crm-home-filter-range` · **งานวันนี้: โทร→✗ N1** · **งานวันนี้: เปิด→✗ N1** · **งานวันนี้: เข้าร่วม→✗ N1** · **งานวันนี้: ส่งข้อความ→✗ N1** · ดีลที่ต้องดู: ดู ×4 (แถวที่ 1)→`crm-home-stale-row-view-*` · ดู (แถวที่ 2)→`crm-home-stale-row-view-*` · ดู (แถวที่ 3)→`crm-home-stale-row-view-*` · ดู (แถวที่ 4)→`crm-home-stale-row-view-*` · AI: ดีลไหนเสี่ยง — ดู→`crm-ai-home-at-risk` · AI: ร่าง→`crm-home-ai-draft` · AI: สรุป→`crm-home-ai-summary`
- **02-pipeline-board**: มุมมอง บอร์ด→`deals-view-*` · มุมมอง ตาราง→`deals-view-*` · มุมมอง forecast→`deals-view-*` · เลือกหลายรายการ→`deal-check-all` (P1) · เพิ่มดีล→`deals-new-btn` · ชิป pipeline→`deals-filter-pipeline` · ชิป ผู้ดูแล→`deals-filter-owner` · **ชิป ทีม→✗ N2** · ชิป ช่วงปิดคาด→`deals-filter-close-from` · ชิป แท็ก→`deals-filter-tag` · ชิป ฟิลด์กำหนดเอง→`deals-filter-f-*` · + เพิ่มดีล คอลัมน์ 1→`deal-column-add-*` · + เพิ่มดีล คอลัมน์ 2→`deal-column-add-*` · + เพิ่มดีล คอลัมน์ 3→`deal-column-add-*` · + เพิ่มดีล คอลัมน์ 4→`deal-column-add-*`
- **03-deal-360**: ← กลับ→`deal-back-link` · โทร→`crm-call-log-open` · **ส่งอีเมล→✗ N3** · ออกใบเสนอราคา→`deal-quote-btn` · มูลค่า (แก้ในที่)→`deal-value-input` · วันปิดคาด→`deal-close-input` · ผู้ดูแล→`deal-owner-select` · หมวดพยากรณ์ COMMIT→`deal-forecast-select` · **ที่มา (งานอีเวนต์/บูธ)→✗ N4** · แท็บ ภาพรวม→`deal-tab-*` · แท็บ รายการสินค้า→`deal-tab-*` · แท็บ กิจกรรม→`deal-tab-*` · **แท็บ อีเมล→✗ N3** · แท็บ เอกสาร→`deal-tab-*` · แท็บ ประวัติขั้น→`deal-tab-*` · ออกใบเสนอราคา จากรายการนี้→`deal-quote-btn` (P2) · AI: ร่างอีเมล→`crm-ai-deal-draft-email`
- **04-company-360**: ← กลับ→`company-back-link` · เพิ่มผู้ติดต่อ→`company-add-contact-btn` · เปิดดีลใหม่→`company-new-deal-btn` · แท็บ ภาพรวม→`company-360-tab-*` · แท็บ ผู้ติดต่อ→`company-360-tab-*` · แท็บ ดีล→`company-360-tab-*` · แท็บ เอกสารบัญชี→`company-360-tab-*` · แท็บ สัญญา (กำหนดเอง)→`company-360-tab-*` · แท็บ ไทม์ไลน์→`company-360-tab-*` · เพิ่มสัญญา→`object-record-new-btn` · AI: สรุป→`crm-ai-company-summary` · AI: โอกาสต่อยอด — ดู→`crm-ai-company-upsell`
- **05-contact-360-convert**: ← กลับ→`contact-back-link` · โทร→`crm-call-tel` · ส่งอีเมล→`contact-email-link` (P3) · แปลง lead→`contact-convert-btn` · AI: ทำไมถึงร้อน — ดู→`crm-ai-contact-why-hot` · AI: ร่างข้อความปิดการขาย→`crm-ai-contact-closing` · ☐ สมาชิก→`contact-convert-member` · ☐ บริษัท→`contact-convert-company` · ค้นด้วยเลขภาษี/ชื่อ→`contact-pick-*-q` · ☐ ดีล→`contact-convert-deal` · pipeline→`contact-convert-deal-pipeline` · ขั้นเริ่มต้น→`contact-convert-deal-stage` · มูลค่าโดยประมาณ→`contact-convert-deal-value` · ยกเลิก→`contact-convert-cancel` · แปลง→`contact-convert-submit`
- **06-custom-objects**: **ตัวอย่างมือถือ→✗ N5** · บันทึก→`object-edit-save` · ชื่อ (เอกพจน์)→`object-add-singular` · ชื่อ (พหูพจน์)→`object-add-plural` · ฟิลด์ชื่อเรื่อง→`object-add-title-field` · สวิตช์ แสดงเป็นแท็บ→`object-add-show-as-tab` · สวิตช์ ให้ลูกค้าเห็นใน portal→`object-add-portal` · ยกเลิก→`object-add-cancel` · สร้างวัตถุ→`object-add-create` · วัตถุ: รถ (เลือก)→`object-select-*` · **แท็บ ภาพรวม (หน้า 360 สมาชิก)→✗ N6** · **แท็บ กิจกรรม (หน้า 360 สมาชิก)→✗ N6** · **แท็บ เอกสาร (หน้า 360 สมาชิก)→✗ N6** · แท็บ รถ (2)→`crm-object-tab-obj-*` (P4)
- **07-automation-sequence**: สร้าง sequence→`crm-seq-new` · สร้างกฎใหม่→`crm-auto-new` · ชื่อกฎ→`crm-auto-name` · ทดลองรัน→`crm-auto-dry-run` · ยกเลิก→`crm-auto-cancel` · บันทึกกฎ→`crm-auto-save` · สวิตช์กฎ 1→`crm-auto-rule-toggle` · สวิตช์กฎ 2→`crm-auto-rule-toggle` · สวิตช์กฎ 3→`crm-auto-rule-toggle` · สวิตช์กฎ 4→`crm-auto-rule-toggle` · สวิตช์กฎ 5→`crm-auto-rule-toggle`
- **08-activity-call-email-calendar**: บันทึกกิจกรรม (หัวหน้า)→`activities-new` · ระยะเวลา→`crm-call-duration` · ทิศทาง→`crm-call-direction` · บันทึกย่อ→`crm-call-note` · ☐ สร้างงานถัดไป→`crm-call-next-task` · งานถัดไป + วันที่→`crm-call-next-task-due` · ไฟล์เสียง→`crm-call-recording-input` · AI: สร้างดีล + งาน→`crm-call-ai-accept` · AI: แก้ไข→`crm-call-ai-summary` (P5) · ยกเลิก→`crm-call-cancel` · บันทึกกิจกรรม→`crm-call-save` · เทมเพลต→`crm-email-template` · เนื้อความตอบกลับ→`crm-email-body` · ใช้เทมเพลต→`crm-email-template` (P6) · แนบไฟล์→`crm-email-attach` · ส่งตอบกลับ→`crm-email-send` · ปฏิทิน: ของฉัน→`calendar-scope-mine` · ปฏิทิน: ทีม→`calendar-scope-team`
- **09-reports-forecast**: ส่งออก CSV→`crm-report-export` · ตั้งเวลาส่งอีเมล→`crm-report-schedule` · แท็บ ภาพรวม→`crm-report-tab-*` · แท็บ Forecast→`crm-report-tab-*` · แท็บ Funnel→`crm-report-tab-*` · แท็บ ยอดต่อคน/ทีม→`crm-report-tab-*` · แท็บ กิจกรรม→`crm-report-tab-*` · แท็บ เหตุผลแพ้→`crm-report-tab-*` · แท็บ ที่มา/ROI→`crm-report-tab-*` · แท็บ Lead score→`crm-report-tab-*` · ช่วง→`crm-report-filter-period` · ทีม→`crm-report-filter-team` · Pipeline→`crm-report-filter-pipeline`
- **10-teams-quota-commission**: สร้างทีม→`teams-create-open` · เพิ่มกฎ (ค่าคอม)→`crm-commission-rule-add` · อนุมัติที่เลือก→`crm-commission-approve-selected` · ส่ง payroll→`crm-commission-send-payroll`
- **11-web-email-tracking**: สวิตช์ ติดตามการเปิด→`crm-email-track-opens` · สวิตช์ ติดตามการคลิก→`crm-email-track-clicks` · ที่อยู่ BCC/รับเข้า→`crm-email-inbound-address` · สวิตช์ อีเมลแปลกหน้าเป็น lead→`crm-email-stranger-lead` · **สวิตช์ บันทึก page view→✗ N7** · **สวิตช์ ผูก visitor cookie → ผู้ติดต่อ→✗ N7** · สวิตช์ แถบ cookie consent→`crm-track-web-enabled` (P7) · **สร้างฟอร์ม→✗ N8** · สวิตช์ ป้องกันสแปม→`crm-forms-spam-*` · สวิตช์ แจ้ง LINE ผู้ดูแล→`crm-forms-assign-*` (P8) · สร้างลิงก์→`crm-link-create`
- **12-portal-b2b**: อีเมลที่ลงทะเบียน→`portal-login-email` · OTP หลัก 1→`portal-otp-code` (P9) · OTP หลัก 2→`portal-otp-code` (P9) · OTP หลัก 3→`portal-otp-code` (P9) · OTP หลัก 4→`portal-otp-code` (P9) · OTP หลัก 5→`portal-otp-code` (P9) · OTP หลัก 6→`portal-otp-code` (P9) · ยืนยันรหัส→`portal-otp-submit` · เข้าสู่ระบบด้วย LINE→`portal-line-login` · ตอบรับ→`portal-quote-accept` · ปฏิเสธ→`portal-quote-reject` · ชำระ PromptPay→`portal-pay-promptpay` · แนบสลิป→`portal-slip-upload` · แจ้งใหม่→`portal-request-new`
- **13-mobile-staff-crm**: **การ์ดดีล: โทร 1→✗ N9** · **การ์ดดีล: โทร 2→✗ N9** · **การ์ดดีล: โทร 3→✗ N9** · **การ์ดดีล: โทร 4→✗ N9** · ระยะเวลา→`crm-call-duration` · ทิศทาง→`crm-call-direction` · บันทึกย่อ→`crm-call-note` · ☐ งานถัดไป→`crm-call-next-task` · งานถัดไป + วันที่→`crm-call-next-task-due` · ไฟล์เสียง→`crm-call-recording-input` · ยกเลิก→`crm-call-cancel` · บันทึก→`crm-call-save` · **งานวันนี้ ☐ 1→✗ N10** · **งานวันนี้ ☐ 2→✗ N10** · **งานวันนี้ ☐ 3→✗ N10** · **งานวันนี้ ☐ 4→✗ N10** · แชท: สร้าง lead→`crm-panel-create-lead` · แชท: แก้ไข→`crm-panel-contact` (P10)
- **14-ai-api-webhook**: อนุมัติ→`crm-ai-proposal-confirm` · แก้ไข→`crm-ai-proposal-edit` · ยกเลิก→`crm-ai-proposal-cancel` · **ถามผู้ช่วย AI→✗ N11** · **ส่ง→✗ N11** · สร้างคีย์→`crm-api-new` · เพิ่ม URL→`crm-api-hook-new`
- **15-email-routing-settings**: ส่งอีเมลทดสอบ→`crm-email-test-send` · ที่อยู่รับเข้า→`crm-email-inbound-address` · หมุน key→`crm-email-rotate-key` · สวิตช์ เปิดรับอีเมลเข้า→`crm-email-inbound-enabled` · ผู้ส่ง: ตัวเลือก 1→`crm-email-from-mode` · ผู้ส่ง: ตัวเลือก 2→`crm-email-from-mode` · ชื่อผู้ส่ง→`crm-email-from-name` · ตอบกลับ: กล่อง SHARK→`crm-email-replyto-mode` · ตอบกลับ: อีเมลพนักงาน→`crm-email-replyto-mode` · ตอบกลับ: กำหนดเอง→`crm-email-replyto-mode` · สำเนาถึง→`crm-email-copy-to` · ที่อยู่ BCC เก็บเข้า CRM→`crm-email-bcc-capture` · สวิตช์ อีเมลแปลกหน้าเป็น lead→`crm-email-stranger-lead` · สวิตช์ ติดตามการเปิด→`crm-email-track-opens` · สวิตช์ ติดตามการคลิก→`crm-email-track-clicks` · **เชื่อมต่อ Gmail→✗ N12** · **เชื่อมต่อ Outlook→✗ N12**
- **16-web-tracking-consent**: **คู่มือฝังโค้ด→✗ N13** · สวิตช์ ติดตามเว็บ→`crm-track-web-enabled` · เพิ่มโดเมน→`crm-track-domain-add` · ข้อความแถบยินยอม→`crm-track-consent-text` · **ตัวอย่างแถบ: ปฏิเสธ→✗ N14** · **ตัวอย่างแถบ: ยอมรับ→✗ N14** · **สวิตช์ ไม่เก็บ IP เต็ม→✗ N15**
- **17-integration-map**: ปลายทาง สมาชิก→`crm-integrations-target-member` · ปลายทาง บัญชี→`crm-integrations-target-account` · ปลายทาง บอร์ดงาน→`crm-integrations-target-kanban` · ปลายทาง แชท→`crm-integrations-target-chat` · ปลายทาง สินค้า→`crm-integrations-target-inventory`

เหตุผล + ผลต่อเจ้าของ (✗):
- **N1** — เหตุผล: งานในการ์ด "งานของฉันวันนี้" บนหน้าแรกเป็นรายการอ่านอย่างเดียว (C1.11/C3.2 ทำแค่ชื่อ+เวลา) — ไม่มีปุ่มลัด โทร/เปิด/เข้าร่วม/ส่งข้อความ ต่อแถว · ผลต่อเจ้าของ: เจ้าของ/พนักงานต้องกด "งานทั้งหมด →" ไปหน้า งานติดตาม แล้วค่อยกดทำงานนั้น (เพิ่ม 1 แตะต่องาน)
- **N2** — เหตุผล: ตัวกรองกระดานดีลไม่มี "ทีม" (มี pipeline · ผู้ดูแล · ขั้น · ช่วงปิดคาด · แท็ก · ฟิลด์กำหนดเอง · มุมมองบันทึก · ดีลนิ่ง) · ผลต่อเจ้าของ: หัวหน้าทีมดูดีลทั้งทีมบนกระดานเดียวไม่ได้ในคลิกเดียว — ต้องกรองทีละผู้ดูแล หรือใช้รายงาน "ยอดต่อคน/ทีม" (หน้า รายงาน มีตัวกรองทีม)
- **N3** — เหตุผล: หน้า 360 ของดีลไม่มีปุ่ม/แท็บ "อีเมล" — อีเมลของ CRM อยู่ที่กล่องจดหมาย /emails และเธรดของผู้ติดต่อ (C2.5) · บนดีลมีเฉพาะ AI "ร่างอีเมล" ที่คัดลอกข้อความได้ · ผลต่อเจ้าของ: ส่งอีเมลจากหน้าดีลตรง ๆ ไม่ได้ ต้องไปที่ อีเมล → เธรด หรือคัดลอกร่างจาก AI ไปส่งเอง
- **N4** — เหตุผล: หน้า 360 ของดีลไม่แสดงและไม่มีช่องแก้ "ที่มา" ของดีล (ภาพ 03 มีช่อง ที่มา: งานอีเวนต์/บูธ) · ผลต่อเจ้าของ: ถ้าบันทึกที่มาผิด ต้องแก้ผ่าน API/ผู้ช่วย AI — บนหน้าจอแก้ไม่ได้
- **N5** — เหตุผล: ปุ่ม "ตัวอย่างมือถือ" ในตัวออกแบบวัตถุไม่ได้ทำ (C1.9 ใช้ตัวออกแบบฟิลด์ของโมดูลสมาชิกซึ่งไม่มีตัวอย่างมือถือ) · ผลต่อเจ้าของ: เจ้าของต้องเปิดหน้ารายการ/เรคคอร์ดบนมือถือจริงเพื่อดูผล
- **N6** — เหตุผล: แท็บ ภาพรวม/กิจกรรม/เอกสาร ในภาพ 06 เป็นแท็บของหน้า 360 "สมาชิก" (โมดูล MEMBER เป็นเจ้าของ ไม่ใช่ CRM) — ทะเบียน CRM คุมเฉพาะแท็บวัตถุที่ CRM ใส่ (crm-object-tab-obj-*) · ผลต่อเจ้าของ: ไม่มีผลต่อเจ้าของ — แท็บของสมาชิกทดสอบโดยชุดของโมดูลสมาชิก
- **N7** — เหตุผล: การติดตามเว็บเปิด/ปิดด้วยสวิตช์เดียว (crm-track-web-enabled) — page view + เวลาบนหน้า และการผูก visitor → ผู้ติดต่อ เป็นส่วนหนึ่งของการติดตามเสมอ ไม่มีสวิตช์แยก · ผลต่อเจ้าของ: เจ้าของเลือกเก็บ "เฉพาะบางอย่าง" ไม่ได้ ต้องเปิดทั้งชุดหรือปิดทั้งชุด
- **N8** — เหตุผล: ปุ่ม "สร้างฟอร์ม" ไม่อยู่ใน CRM — ฟอร์มสร้างที่โมดูลฟอร์ม (/app/forms) · หน้า ตั้งค่า → ฟอร์ม ของ CRM แค่ผูกฟอร์มที่มีอยู่เข้ากับ CRM (crm-forms-*) · ผลต่อเจ้าของ: เจ้าของต้องไปสร้างฟอร์มที่เมนู ฟอร์ม ก่อน แล้วกลับมาผูกใน CRM (2 หน้า)
- **N9** — เหตุผล: การ์ด "ดีลของฉัน" บนหน้าแรก (มือถือ) เป็นลิงก์ทั้งใบ (crm-home-deal-card) — ไม่มีปุ่ม "โทร" บนการ์ด · ผลต่อเจ้าของ: พนักงานต้องแตะเข้าไปในดีล/ผู้ติดต่อก่อนแล้วค่อยกดโทร (crm-call-tel) — เพิ่ม 1 แตะ
- **N10** — เหตุผล: งานในการ์ด "งานของฉันวันนี้" ไม่มีช่องติ๊กเสร็จ (ติ๊กได้ที่หน้า งานติดตาม: activity-row-complete) · ผลต่อเจ้าของ: ปิดงานจากหน้าแรกไม่ได้ ต้องไปหน้า งานติดตาม
- **N11** — เหตุผล: ช่อง "ถามผู้ช่วย AI" + ส่ง เป็นของผู้ช่วย AI ส่วนกลางของแพลตฟอร์ม (ปุ่มลอย ai-orb) ไม่ใช่ของหน้า CRM — CRM ส่งเครื่องมือ/สกิลให้ผู้ช่วย (C3.4) ไม่ได้วาดช่องแชทเอง · ผลต่อเจ้าของ: ไม่มีผล — เจ้าของถาม AI ผ่านปุ่มลอยได้ทุกหน้า (ไม่อยู่ในทะเบียน CRM)
- **N12** — เหตุผล: ปุ่ม "เชื่อมต่อ" Gmail/Outlook ในภาพ 15 เป็นสถานะ "เร็ว ๆ นี้" (สีเทา) — ไม่ได้ทำ (ต้องใช้ OAuth ของผู้ให้บริการ · อยู่นอกขอบเขต C2.5) · ผลต่อเจ้าของ: ร้านยังเชื่อมกล่องจดหมายส่วนตัวไม่ได้ ใช้ที่อยู่ BCC/รับเข้าของ SHARK แทน
- **N13** — เหตุผล: ปุ่ม "คู่มือฝังโค้ด" ไม่ได้ทำ — หน้า ติดตามเว็บ แสดงโค้ดฝังพร้อมคัดลอกในหน้าเลย (crm-track-embed-code) · ผลต่อเจ้าของ: ไม่มีหน้าคู่มือแยก — คนทำเว็บของร้านต้องอ่านคำอธิบายสั้นข้างโค้ดฝัง
- **N14** — เหตุผล: ปุ่ม ปฏิเสธ/ยอมรับ ของแถบยินยอมถูกวาดโดยสคริปต์ติดตาม (/t/s/<siteKey>.js) บนเว็บของร้าน — เป็นปุ่ม data-sd ใน DOM ของเว็บลูกค้า ไม่ใช่หน้าจอ SHARK จึงไม่อยู่ในทะเบียน (ตัวอย่างในหน้าตั้งค่าเป็นภาพตัวอย่าง crm-track-preview) · ผลต่อเจ้าของ: ไม่มีผลต่อหน้าจอ SHARK — ต้องทดสอบบนเว็บที่ฝังสคริปต์จริง (C4.4/C5)
- **N15** — เหตุผล: ไม่มีสวิตช์ "ไม่เก็บ IP เต็ม" — ระบบเก็บ IP แบบ hash เสมอ (บังคับในโค้ด ไม่ให้ปิด) · ผลต่อเจ้าของ: เจ้าของปิดการ hash ไม่ได้ (ตั้งใจ — ด้าน PDPA ปลอดภัยกว่า)
- **ภาพ 06 แถวลิงก์ "ใช้ในกฎ/segment แล้ว"** (ไม่นับในตาราง — เป็นแถวรายการ `li` ไม่ใช่ปุ่มคลาสที่นับ) — ไม่ได้ทำ: หน้าออกแบบวัตถุไม่แสดงว่าฟิลด์ถูกใช้ในกฎอัตโนมัติ/segment ที่ไหน · ผลต่อเจ้าของ: ลบ/เปลี่ยนฟิลด์โดยไม่รู้ว่ากฎไหนพึ่งมันอยู่
- **ภาพ 13 แถบล่างมือถือ `mn` ×8** (ไม่นับในตาราง) — เป็นแถบนำทางของแพลตฟอร์ม (ไม่ใช่ของ CRM) เหมือน `ri` บนเดสก์ท็อป · ผลต่อเจ้าของ: ไม่มี (ทดสอบโดยชุดของแพลตฟอร์ม)

ทำต่างจากภาพ (P — มีแถวแล้ว):
- **P1** — บอร์ดไม่มีโหมด "เลือกหลายรายการ" — เลือกหลายดีลทำในมุมมองตาราง (deal-check-all/deal-row-check-*) แล้วใช้แถบ bulk
- **P2** — ปุ่มเดียวกับหัวหน้า (deal-quote-btn) — ออกใบเสนอราคาจากรายการสินค้าของดีลเสมอ
- **P3** — เป็นลิงก์ mailto: (เปิดแอปอีเมลของเครื่อง) ไม่ใช่ตัวเขียนอีเมลในแอป
- **P4** — บนหน้า 360 ผู้ติดต่อ/บริษัทของ CRM · บนหน้า 360 สมาชิกเป็นของโมดูลสมาชิก
- **P5** — สรุปจาก AI แก้ได้ในช่องข้อความก่อนกดยอมรับ (ไม่มีปุ่ม "แก้ไข" แยก)
- **P6** — ตัวเลือกแม่แบบตัวเดียว (เลือก = ใช้) ไม่มีปุ่ม "ใช้เทมเพลต" แยก
- **P7** — แถบยินยอมแสดงอัตโนมัติเมื่อเปิดการติดตามเว็บ (ไม่มีสวิตช์แยก)
- **P8** — แจ้งผู้ดูแลที่ถูกมอบหมายผ่านการตั้งผู้ดูแลของฟอร์ม (crm-forms-assign-*) — ช่องทางแจ้งตามค่าตั้งแจ้งเตือนของ CRM
- **P9** — ช่อง OTP เดียว 6 หลัก (portal-otp-code) แทนกล่องแยก 6 ช่อง
- **P10** — แผง CRM ในแชทไม่มีฟอร์มแก้ผู้ติดต่อ — ลิงก์ชื่อผู้ติดต่อพาไปหน้า 360 เพื่อแก้

## §6 ด่านที่รัน · สิ่งที่ผู้คุมงานต้องตัดสิน

**ด่าน** (log ใน `.qc-shots/c41/`):
- `fitness.mts` (static): ก่อน `fitness-before.log` ผ่าน 33/33 · หลัง `fitness-after.log` **ผ่าน 33/33 · F14.1 ✅ (1,052 testid กดได้ · 359 ไฟล์) · F14.2 ✅ (1,055 แถว) · baseline `CRM_TESTID_BASELINE` = ว่าง** (ไม่มีรายการให้ถอด/อธิบาย)
- `pnpm typecheck` (iso 6G + gate lock): exit 0 (`typecheck.log`)
- `qc-crm-buttons.mts --dry` บน QC3 (อ่านอย่างเดียว): ทะเบียนใหม่ parse ได้ · 7,142 การกด · ข้าม 336 (`buttons-dry.log`)
- ตัวไล่ DOM: 10 รอบ (`--user` × ช่วงหน้า) + รอบตรวจซ้ำ 2 รอบหลังแก้ทะเบียน · ทุกรอบลบ session ของตัวเอง · เซิร์ฟเวอร์ QC1 ของ tree หลักปิดแล้ว (`acc-v2-serve.sh stop`)
- eslint ไม่มีในเครื่อง (`pnpm exec eslint` ไม่พบคำสั่ง) — ไม่ได้รัน

**ตัวกด C4.2 ต้องแก้ตาม (ไม่ได้แตะ `scripts/qc-crm-buttons.mts` ตามคำสั่ง):**
1. `pageUrl()` อ่าน `system` แทนการเดาจากข้อความ: `/app/sys/[id]` + `system:"HR"` (เดิมจับ "HR hub" ในสตริง — **ตอนนี้ 1 แถว `hr-link-sales-teams` จะไปเปิด hub ของ CRM แทน**) · `system:"CHAT"` + `query` (เดิมจับ `/app/sys/[chatId]`) · `MEETING` ไม่มีในซีด → ข้าม
2. ต่อ `query` ท้าย URL (17 แถวของ `/deals` อยู่ในมุมมองตาราง/forecast — ถ้าไม่ต่อ จะ "มองไม่เห็น" ทั้งที่ถูก) · ลบ `PAGE_ALIAS` และ `COMBINED_PAGE` ได้แล้ว
3. `expect.type:"ui"`: ตอนนี้ตกทุกกิ่ง ⇒ ผ่านแบบนุ่ม (ปลอดภัย) — ควรตรวจ `target` ตาม `state` (appears/disappears/changes) · `anyOf` สำหรับ navigate/mutation · `resultTarget` สำหรับ mutation · `history:back` · `mailto:*`
4. `looksLikeTestid` ยอม `*` เฉพาะท้าย — target แบบ `contact-*-modal` · `contacts-*-error` · `st-msg-*` ต้องยอม `*` กลางชื่อ (selector `[data-testid^=…][data-testid$=…]`)
5. `kind:"filter"` = `requestSubmit()` แบบ GET แล้วเทียบ URL · `drag` ใช้ `expect.dropTarget`
6. `navMatches` ถูกต้องแล้วกับ path เต็ม (ก่อน C4.1 path แบบย่อไม่มีทางตรงเพราะ anchor เป็น absolute)

**ผู้คุมงานต้องตัดสิน:**
- **D1** ยอมรับ vocabulary ใหม่ใน `$fields` (`ui` · `filter` · `system` · `query` · `alsoOn` · `anyOf` · `note` · `state` · `resultTarget` · `dropTarget` · `only` · `not`) เป็นส่วนขยายของ MASTER-PLAN §7 หรือไม่ · query string ใน `expect.target` ของ navigate (`?view=*` · `?stale=1` …) **เป็นข้อมูลให้คนอ่านเท่านั้น** — ตัวกดเทียบแค่ pathname · อนาคตอาจเพิ่มฟิลด์ `opener` (testid ของปุ่มที่ต้องกดก่อนจึงเห็นคอนโทรลในโมดัล) — ยังไม่เพิ่มในใบนี้
- **D2** fixture portal สำหรับรอบสายตาลูกค้า (QC1 ปิด portal และไม่มี access ⇒ ตัวไล่/ตัวกดทำรอบ customer ไม่ได้) — seed ถาวรใน `seed-crm-qc.mts` หรือให้ตัวกดสร้าง/ลบเอง (ตามที่ addendum C4.2 §5 ถาม)
- **D3** ORACLE-EDIT (ถ้าต้องการให้ทะเบียนคลุมคอนโทรลของแพลตฟอร์ม/สมาชิกที่อยู่บนหน้า CRM): เพิ่มใน `CRM_HOSTED_CONTROLS` (`scripts/fitness.mts` ~บรรทัด 1066) — ต้องเพิ่ม testid ในไฟล์เจ้าของก่อน (`module-tabs.tsx` · `PageHeader.tsx` · `FieldDesigner.tsx`) · **ผู้คุมงานตัดสิน: ไม่ทำใน C4** · เหตุผลที่ถูกต้อง (แก้ตามรีวิว): qc-nav-functions ตรวจ href แบบ static ของเมนู accordion เท่านั้น ไม่มีชุดไหนตรวจลิงก์แท็บ CRM (`crmTabs()` `ui.tsx:70` / `crmNavItems()` `nav.ts:129`) ⇒ **หนี้**: เพิ่มการตรวจ static ว่า href ของแท็บ CRM มีหน้าอยู่จริง · FieldDesigner มี testid 15 จุด และโหมดวัตถุถูกคุมโดย qc-crm-c1.9
- **D4** UI v1 (`crm/ui.tsx`) อยู่นอกทะเบียน (ข้อยกเว้น 3) — ยอมรับหรือให้เติม testid + แถวแบบ `uiVersion:1` · ผลที่ต้องรู้: ร้าน production ยังรัน v1 อยู่ และ F14 มองไม่เห็นคอนโทรล v1 ที่ไม่มี testid จนถึง C6.3
- **D5** roles ที่ปรับตาม DOM (§3) สะท้อน "สิทธิ์ที่ seed ให้" — ถ้าเจตนาคือ nok (หัวหน้าทีม) ต้องเห็นรายงาน/อีเมล/วัตถุ นั่นคือบั๊กสิทธิ์ ไม่ใช่ทะเบียน (ทะเบียนตามของจริงตอนนี้)
- **D6** ผู้คุมงาน build รอบหน้าแล้วรัน `visual-crm.mts --inventory --page '^/(companies|contacts)'` (owner) เพื่อยืนยัน testid พื้นหลังโมดัล 5 ตัว (ตอนนี้ทะเบียนมีแถวแล้ว · DOM ยังเป็น build เก่า)

**ข้อมูลชั่วคราวที่ค้าง**: ไม่มี (session ของทุกรอบถูกลบ · ไม่มีการเขียนอื่น) · **ข้อสังเกต**: ระหว่างทำงาน (10:24–10:26 UTC) มีคนอื่น seed QC3 ใหม่จาก worktree นี้ ⇒ `scripts/crm-expected.json` · `scripts/member-expected.json` · `scripts/acc-v2-expected.json` เปลี่ยน (tenant ใหม่) — **ไม่ใช่ของใบนี้ ไม่ได้แตะ/ไม่ได้คืน**

## §7 ข้อกำหนดเพิ่มสำหรับ C4.2 (จากรีวิว C4.1 · ไม่ได้แตะ `scripts/qc-crm-buttons.mts`)
1. แถวแพตเทิร์นต้องกด **"ตัวแรกที่กดได้จริง"** ไม่ใช่ element แรกที่ `[data-testid^=…]` เจอ — ใช้ `only` (รายชื่อตรงตัว) ถ้ามี และข้ามทุกชื่อใน `not` · แถวที่ปรับแล้ว: `company-new-*` (only 8 ช่อง · not `company-new-page/-form/-custom/-error/-candidates/-duplicate/-restore`) · `contact-new-*` (only 6 ช่อง · not `contact-new-page/-form/-error/-duplicates/contact-new-*-error`) · `crm-integrations-node-*` (not `crm-integrations-node-CRM` ซึ่งเป็น `<div>`)
2. `navMatches` ต้องรับ `*` ใน path (ไม่ใช่แค่ `[x]`) — แถว `portal-menu-*` · `portal-nav-*` (`/b/[slug]/*`) · `crm-book-via-booking` (`/app/u/*/booking`)
3. แถวพื้นหลังโมดัล (`*-backdrop` 5 แถว) ต้องกดที่ **มุมของ overlay** (นอกกล่อง dialog) — โค้ดปิดเมื่อ `e.target === e.currentTarget` เท่านั้น การกดกลาง element จะโดนกล่อง dialog แล้ว "dead"
4. (ข้อเสนอ D1) ฟิลด์ `opener` ในอนาคต: testid ของปุ่มที่ต้องกดก่อนจึงเห็นคอนโทรลในโมดัล — วันนี้ตัวกดต้องเดาจาก `expect.target` ของแถวตัวเปิด

## §8 แก้ตามรีวิวผู้คุมงาน (MERGEABLE AFTER SHOULD-FIX)
- S1 `companies-import-backdrop` · `company-360-sheet-backdrop` · `contacts-sheet-backdrop` → roles [owner, manager] · hiddenFor [nok, thana] (ตามปุ่มเปิด)
- S2 ลบแถวที่ไม่ใช่ตัวกด 3 แถว: `crm-seq-step-*` · `crm-link-qr-box` · `crm-link-delete-confirm-*` (ยังใช้เป็น expect.target ได้) ⇒ ทะเบียน 1,055 → **1,052 แถว**
- S3 `crm-card-scan-accept` · `crm-card-scan-reject` → ย้าย nok จาก hiddenFor เข้า roles
- S4 `company-new-*` · `contact-new-*` · `crm-integrations-node-*` ได้ `only`/`not` (§7 ข้อ 1) · `$fields.only/not` เพิ่มแล้ว
- S5 เหตุผล D3 เขียนใหม่ตามจริง (§4 ข้อยกเว้น 1–2 · §6 D3) + หนี้ตรวจ href แท็บ CRM
- หมายเหตุ: §5 เพิ่มภาพ 06 (ลิงก์ "ใช้ในกฎ/segment แล้ว") และภาพ 13 (`mn` ×8) · `$rules[2]` เขียนใหม่ (F14.2 ตรวจซ้ำด้วย testid อย่างเดียว) · D1 (query ใน target เป็นข้อมูล) · D4 (prod ยังรัน v1 จนถึง C6.3)
- ด่านหลังแก้: `pnpm fitness` ผ่าน 33/33 ทั้งแบบมี DATABASE_URL (`fitness-review-a.log`) และ `env -u DATABASE_URL` (`fitness-review-b.log`) · F14.1 ✅ (1,052 testid) · F14.2 ✅ (1,052 แถว) · `validate.py` bad 0

