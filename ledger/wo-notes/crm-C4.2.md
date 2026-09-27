# WO C4.2 — กดทุกปุ่ม · รอบแก้ที่ 1 หลังรันจริงครั้งแรก (builder · 27 ก.ย. 2569 · worktree `shark-crm-c23` @ f03206d8)

> ⏸️ **หยุดกลางทาง 27 ก.ย. ~13:20 UTC ตามคำสั่งผู้คุมงาน** (เจ้าของจะอัปเกรด VPS/รีบูต + สลับบัญชี Claude)
> ยังไม่ commit · ไม่ได้ build · ไม่ได้แตะโค้ด product · ไม่ได้แตะข้อสอบ · เซิร์ฟเวอร์ QC ปิดแล้ว (`acc-v2-serve.sh stop`)
> ทะเบียน `scripts/crm-ui-inventory.json` **ยังไม่ได้แก้** (parse ได้ ตรวจแล้ว) · ตัวกด `scripts/qc-crm-buttons.mts` เขียนใหม่แล้ว (syntax ผ่าน esbuild · typecheck ผ่านรุ่นก่อนแก้รอบสุดท้าย)

## §1 ทำอะไร

รันนำร่องของเจ้าของ (`summary-pilot-owner-1.json`: 510/1962 · dead 1327 · wrongExpect 125) — อ่านผลรายหน้าแล้วต้นเหตุหลัก **อยู่ที่ตัวกด ไม่ใช่ปุ่ม**:
1. **ไม่รีเซ็ตสถานะระหว่างแถว** — โหลดหน้าเดียวต่อหน้า×จอ แล้วกดทุกแถวต่อกัน: แถวแรกที่เป็นลิงก์ (เช่น `companies-new-btn`) พาไป `/companies/new` ⇒ ทุกแถวที่เหลือของหน้านั้น "หาไม่พบ" (เห็นชัดใน `companies.json` ของนำร่อง: มือถือแถวแรกผ่าน แล้วที่เหลือ missing ทั้งหมด) · `crm-report-tab-*` ได้ url `/app/sys/<id>` เพราะแถวก่อนหน้า (`crm-report-back`) พากลับหน้าแรกไปแล้ว
2. **ไม่มีตัวเปิด (opener)** — แถวในชีต/โมดัล/เมนู/แท็บ/แถบเลือกหลายรายการ ไม่เคยถูกเปิด (C4.1 §7 ข้อ 4 เสนอไว้)
3. **เลือก element ผิดตัว** — `document.querySelector` = ตัวแรกในเอกสาร ซึ่งมักเป็น "ฝาแฝดที่ซ่อน" (desktop/mobile ใช้ testid เดียวกัน)
4. **ตรวจเร็วเกินไป** — `navigate` เช็ก URL ทันทีที่มี DOM mutation (Next client-nav ยังไม่เสร็จ ⇒ `companies-new-btn` "URL ไม่เปลี่ยน") · `mutation` เช็ก network ก่อน server action ตอบ ⇒ "ไม่มี network request" · นับแถว `Model +1` **หลัง** กดทั้งสองครั้ง (before/after ห่าง 250 ms หลังกด = ไม่มีทางเห็น +1)
5. ช่องกรอก/select ที่ไม่มีผลข้างเคียงบน DOM ถูกนับเป็น dead (`contact-new-sourceKind`, `deals-filter-stage`, `visibility-override-*`) — ค่าของช่องเปลี่ยนแล้วแต่ตัวกดดูแค่ MutationObserver
6. ปุ่ม submit ถูกกดบนฟอร์มว่าง (แถว cancel มาก่อน submit ตามลำดับทะเบียน) ⇒ ปุ่ม disabled/ถูกปฏิเสธ ⇒ "ไม่มี request"
7. `ui`/`changes` เทียบ outerHTML ซึ่งไม่มี `checked`/`value` ⇒ checkbox ที่ถูกติ๊ก "ไม่เปลี่ยน" (`teams-create-unit`, `team-unit-toggle`)
8. ตัวกดไม่อ่าน `CRM_EXPECTED_PATH` (visual-crm อ่าน) ⇒ รันจาก worktree ได้เฉลยผิดฐาน

## §2 ไฟล์

| ไฟล์ | สถานะ |
|---|---|
| `scripts/qc-crm-buttons.mts` | **เขียนใหม่** (888 → ~1,320 บรรทัด) · ของเดิมสำรองที่ `.qc-shots/c42/qc-crm-buttons.orig.mts` |
| `scripts/crm-ui-inventory.json` | ยังไม่แก้ (ตั้งใจเพิ่ม `$fields.opener/needs/viewport` + เติมค่า — §6) |
| `ledger/wo-notes/crm-C4.2.md` | ไฟล์นี้ |
| `.qc-shots/c42/` | สคริปต์ช่วย: `run-chunks.sh` (ตัวรันแบ่งช่วงหน้า ผ่าน systemd-run + gate lock) · `merge_openers.py` (รวมผล `--discover` → ข้อเสนอ opener) · `merge_summary.py` (รวม summary รายช่วง) · `models.mts`/`pk*.mts`/`q*.mts` (สำรวจฐาน อ่านอย่างเดียว) · `typecheck-1.log` (exit 0) · `smoke1.log` |

## §3 ตัดสินใจเรื่องสคีมา/ตัวกด (เขียนไว้ใน CONTRACT หัวไฟล์ตัวกดแล้ว)

**ฟิลด์ใหม่ในทะเบียน (ตัวกดรองรับแล้ว · ทะเบียนยังไม่ได้เติม):**
- `opener`: `string | string[]` — testid ในทะเบียนของหน้าเดียวกัน (แพตเทิร์นได้) ที่ต้องกดก่อนตามลำดับ · ขั้น `"<testid>=<ค่า>"` = เลือก option/พิมพ์ค่านั้น (ตัวสร้างกฎอัตโนมัติเปิดช่องตามชนิดเหตุการณ์/การกระทำ เช่น `["crm-auto-new","crm-auto-trigger=crm.deal.close_due"]` → `crm-auto-param-days-before`) · ตัวเปิดถูกกด **เฉพาะเมื่อยังมองไม่เห็น** ตัวถัดไปในลำดับหรือตัวแถวเอง (ช่องเดียวกันมักอยู่ในหน้าบนจอ 1440 แต่อยู่ในชีตบนจอ 390) · `--dry` ตรวจว่าทุก opener ชี้แถวที่มีจริงบนหน้าเดียวกัน (exit 1 ถ้าผิด)
- `needs`: ข้อความเงื่อนไขข้อมูลที่ซีดอาจไม่มี · มี control ⇒ กดตามปกติ · ไม่มี ⇒ `skippedNeeds[]` (ไม่นับ total ไม่ใช่ dead) · แถวที่มี `needs` **ถูกกดท้ายสุดของกลุ่มหน้า** (แถวก่อนหน้าอาจสร้างข้อมูลที่ต้องใช้ เช่น `crm-score-seed-btn` สร้างกฎ 8 ข้อ)
- `viewport`: `"desktop" | "mobile"` (เพิ่มเอง — จำเป็น) — คอนโทรลที่มีในเลย์เอาต์เดียว (`companies-card-link`/`contacts-card-*` = `md:hidden` · `deal-stage-tab-*` = `sm:hidden` · ปฏิทิน) ⇒ ไม่วางแผนกดอีกจอ

**ตัวกด (ข้อ 1–8 ใน §1 แก้ครบในโค้ดแล้ว):** โหลดหน้าใหม่ (networkidle2) ทุกครั้งที่แถวก่อนหน้าทำให้สถานะ "สกปรก" / URL ไม่ตรง / ต้องการ opener คนละชุด · การกรอกช่องและ opener ที่ผ่านไม่ทำให้สกปรก (แถวในโมดัลเดียวกันใช้โมดัลที่เปิดค้างต่อได้) · element = ตัวแรกที่ **มองเห็น** (แพตเทิร์น = ตัวแรกที่มองเห็นและกดได้จริง + เคารพ `only`/`not`) · คลิกผ่าน pointer ถ้าโดนบัง fallback DOM `.click()` · `navigate` รอ 8 วิ (รวมแท็บใหม่) · `modal` ต้อง **มองเห็น** ภายใน 6 วิ · `mutation` รอ network นิ่ง ≤ 8 วิ แล้วต้องมี request ที่ไม่ใช่ GET และไม่มี ≥400 · นับ `Model ±1` ก่อน/หลังจริง (poll 4 วิ) · `Model.col=ค่า` เช็กเฉพาะหน้า detail และค่าตัวอักษรจริง (ข้าม `<ขั้น>`) · ช่องกรอกตัดสิน dead จาก "ค่าเปลี่ยนไหม" (date/time/number ใช้ native setter) · `ui/changes` รวม value/checked ของลูกทุกตัว และ poll 4 วิ (ค้นหาแบบ debounce) · **PREFILL**: ก่อนแถว mutation/form เติมช่องก่อนหน้าในฟอร์ม/dialog เดียวกันที่ยังว่าง · console error/overflow ผูกกับแถวที่กด (overflow ต่อ URL) · `CRM_EXPECTED_PATH` · `--device`, `--page re:<regex>`, `--discover`

**ความปลอดภัย (ขยายจากเดิม):**
- `DIRECT_SEND_GUARD` เดิม 3 ตัว (อีเมล/OTP จริง) + `crm-portal-invite-email` คงปิด
- ใหม่ `CROSS_MODULE_GUARD` (14 แถว ไม่กด ลง `skippedSafety[]` พร้อมเหตุผล): ออกใบเสนอราคา/ใบแจ้งหนี้ (เลขเอกสารรันต่อเนื่อง) · ส่งค่าคอมเข้าเงินเดือน · ผูกบิล POS · อัปโหลดไฟล์ขึ้นที่เก็บจริง (ไฟล์แนบ/เสียง/สลิป/นามบัตร) · เรียก AI จริง (5 ปุ่ม) · `input[type=file]` อื่นนอกจาก 4 ช่องนำเข้า CSV (ใช้ไฟล์ fixture `qc-btn-…` ในรีโป — snap chromium อ่าน /tmp ไม่ได้)
- ใหม่ **SNAPSHOT/RESTORE** แทนการกวาดแท็กอย่างเดียว: ก่อนกดครั้งแรก ถ่ายทุกแถวของ 59 ตาราง (CRM ทั้งหมด + AppSystem/Team/TeamMember/Party/Customer/MemberConsent/MemberField/MemberSavedView/ApiKey/WebhookEndpoint/AutomationRule/Run/FormDef/KanbanCard/FileAsset/AiProposal) ของ tenant นี้ (QC1 ≈ 1,039 แถว · ทุกตารางมี `id` + `tenantId` — ตรวจด้วย DMMF) · จบกลุ่มหน้า×จอที่มี request เขียน ⇒ คืนฐานเป๊ะ (ลบแถวใหม่ลูกก่อนแม่ · เขียนค่าเดิมกลับ · สร้างแถวที่ถูกลบคืน · วนสูงสุด 4 รอบกัน FK/unique) · หลังแถวทำลายล้าง (archive/delete/merge/erase/convert/uiversion/template/bulk/…) ⇒ ซ่อมเฉพาะแถวซีด (`keepNew`) ให้แถวต่อไปเห็นซีดเดิม · CLEAN = คืนฐานเต็ม + กวาดแท็ก + ลบ session/portal fixture · log ทุกการคืนใน `summary.restores[]` · ตาราง log (AuditLog/OutboxEvent/AppNotification) ไม่คืน (ประวัติ) · ทั้งรอบถือ gate lock (ช่วงละ ≤ ~15 นาที เพื่อไม่ให้งานเลนอื่นรอเกิน 30 นาทีของ flock)
- portal fixture ของบทบาท customer สร้าง **ก่อน** snapshot และถูกกันไม่ให้ restore กลางรอบลบ (`PROTECT`)

## §4 ผลรันแต่ละรอบ

| รอบ | ขอบเขต | ผล | หมายเหตุ |
|---|---|---|---|
| นำร่องเจ้าของ (ผู้คุมงาน) | owner ทุกหน้า × 2 จอ | 510/1962 · dead 1327 · wrongExpect 125 · overflow 1 · console 2 | ตัวกดรุ่นเดิม — ต้นเหตุ §1 |
| smoke1 (13:10–13:14) | owner · `/companies` · desktop | 0/23 dead-missing ทั้งหมด (หน้า 200) · snapshot 1,039 แถว · คืนฐาน 0 · CLEAN สะอาด | **บั๊กตัวกดใหม่ พบแล้ว แก้แล้ว ยังไม่ได้รันยืนยัน**: tsx/esbuild ห่อฟังก์ชันใน `page.evaluate*` ด้วย `__name(...)` ซึ่งไม่มีในเบราว์เซอร์ ⇒ `findVisible()` คืน null ทุกแถว · แก้ด้วย `NAME_SHIM` ผ่าน `evaluateOnNewDocument` ทั้งโหมดกดและ `--discover` |

ข้อสังเกตระหว่างทาง: QC1 ถูก reseed โดยเลน c39fix (13:07 · tenant ใหม่ `cmujtz7su…` · CRM `cmuju2ctr…`) — เฉลยใน `/root/projects/shark-crm/scripts/crm-expected.json` เป็นของใหม่แล้ว · ซีดใหม่ไม่มี `CrmSequence`/`CrmEmailMessage`/ห้องแชท ⇒ `/settings/sequences/[sequenceId]` (31 แถว) · `/emails/[threadKey]` (14) · แผง CRM ในแชท (9) ถูกข้ามระดับแผน · รอบนี้ `partyId` resolve ได้

## §5 ข้อค้นพบสำหรับใบอื่น (ยังไม่ครบ — รอรันจริง)

ยืนยันไม่ได้จนกว่าจะรันรอบใหม่ (ผลนำร่องปนเปื้อนจาก §1) — ที่รู้ตอนนี้:
- (รอยืนยัน) `/deals/new` ล้นแนวนอนที่ 390 (นำร่อง: scrollWidth > 390)
- (รอยืนยัน) `/p/[slug]` โหลด resource 404 (console "Failed to load resource … 404")
- ไม่มีการแก้ data-testid ใน product รอบนี้

## §6 ส่งต่อ — ทำต่อจากตรงนี้ (ลำดับ)

1. เปิดเซิร์ฟเวอร์: `cd /root/projects/shark-crm && bash scripts/acc-v2-serve.sh start` (ใช้ .next เดิม ห้าม build)
2. **smoke ซ้ำ** ยืนยันแก้ `__name`: `CHUNKS_OVERRIDE='/companies' systemd-run --unit=crm-c42-smoke2 --collect -p MemoryMax=6G --setenv=PATH="$PATH" --setenv=HOME=/root --setenv=CHUNKS_OVERRIDE='/companies' bash /root/projects/shark-crm-c23/.qc-shots/c42/run-chunks.sh smoke2 --user owner --device desktop` → ดู `.qc-shots/c42/smoke2.log` + `.qc-shots/crm/buttons/companies.json` (คาด: `companies-new-btn`/`companies-import-btn`/filter ผ่าน · แถวในโมดัล import ยัง missing จนกว่าจะเติม opener)
3. **ค้นหา opener อัตโนมัติ**: `systemd-run --unit=crm-c42-disc1 … run-chunks.sh disc1 --user owner --discover` (แบ่ง 4 ช่วงหน้าเอง · อ่านอย่างเดียว + snapshot/restore กันไว้) → `python3 .qc-shots/c42/merge_openers.py disc1` ได้ `disc1-proposals.json` + รายการ U (หาไม่เจอ)
4. เติมทะเบียนด้วยสคริปต์ (roundtrip `json.dumps(indent=2, ensure_ascii=False)+"\n"` ตรงไฟล์เดิมทุกไบต์ — ตรวจแล้ว): `$fields.opener/needs/viewport` + ค่า opener จากข้อ 3 + ที่ต้องใส่มือ (รู้แล้ว):
   - ตัวสร้างกฎอัตโนมัติ: `crm-auto-new` → `crm-auto-trigger=<ค่า>` (`crm.deal.stale`→days · `crm.score.threshold`→band · `custom.record.field_due`→object/field · `crm.deal.close_due`→days-before) · `crm-auto-add-condition` → cond-* (`crm-auto-cond-mode` ต้องกด add-condition 2 ครั้ง) · `crm-auto-add-action` → `crm-auto-action-type=<MOVE_STAGE|ASSIGN|CREATE_ACTIVITY|CREATE_DEAL|OPEN_KANBAN_CARD|SEND_EMAIL|SET_FIELD|ADD_TAG|ADJUST_SCORE|ISSUE_VOUCHER|NOTIFY_STAFF|WEBHOOK|WAIT_THEN>` (ค่าจาก `src/components/crm/automation/CrmAutomationBuilder.tsx` 100–222 และ `src/lib/modules/crm/automation-shared.ts`)
   - `query` ต่อแถว: `companies-filter-clear` + `companies-empty-new` → `q=qc-btn-none` · `contacts-filter-clear` + `contacts-empty-new` → `q=qc-btn-none` · `deals-filter-clear` → `q=qc-btn-none`
   - opener ที่นำทาง: `contacts-page-first` ← `contacts-page-next` · `deals-first-page` ← `deals-next-page` (ตัวกดรองรับ opener ที่เปลี่ยน URL แล้ว)
   - `deal-lost-*` (หน้า `/deals` เปิดได้แค่ด้วยการลาก) → ย้าย `page` เป็น `/deals/[dealId]` + `alsoOn:["/deals"]` + `opener:"deal-lost-btn"` · `deal-reopen-*`/`deal-req-*`/`deal-move-toast-close` → `needs` (ดีลปิดแล้ว / ขั้นที่บังคับช่อง / หลังย้ายขั้น)
   - `viewport`: `companies-card-link`, `contacts-card-link`, `contacts-card-select` = mobile · `deal-stage-tab-*` = mobile · ตรวจ `calendar-*` (CalendarViews.tsx:210–213)
   - `needs` (ซีดไม่มี): `companies-page-prev/next` (บริษัท >1 หน้า) · `*-filter-view`/`deals-filter-saved` (มุมมองที่บันทึก) · `deals-filter-f-*` (ฟิลด์กำหนดเองของดีล) · `deals-empty-create-pipeline` (ระบบไม่มี pipeline) · `company-merged-link`/`contact-merged-link` · `company-parent-link`/`subsidiary` · `company-outstanding-alert`/`company-doc-link` · `pl-restore-*` (pipeline ที่เก็บแล้ว) · แถวกฎ assignment/scoring/commission/tracked link/form/sequence/email template/portal request/call recording/file/AI proposal ที่ซีดมี 0 แถว (ดูจำนวนต่อตารางใน §4 ของ `models.mts` output: CrmScoreRule 0 · CrmAssignmentRule 0 · CrmSequence 0 · CrmTrackedLink 0 · FormDef 0 · CrmCommissionRule 0 · CrmEmailTemplate 0 · CrmPortalRequest 0 · CrmFileLink 0)
5. `--dry` ต้อง exit 0 (ไม่มีปัญหา opener) → รันเจ้าของเต็ม `run-chunks.sh it1 --user owner` → `python3 .qc-shots/c42/merge_summary.py it1` → วนแก้จน dead เหลือแต่ของจริง/needs
6. ด่านปิด: typecheck (`env NODE_OPTIONS=--max-old-space-size=5120 ISO_MEM=6G bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck`) · fitness สองโหมด (F14.2 ไม่ตรวจฟิลด์เสริม — ต้องยังเขียวหลังเติม) · เขียน §4/§5 ให้ครบ + ยืนยัน 2 ข้อค้นพบเดิม
