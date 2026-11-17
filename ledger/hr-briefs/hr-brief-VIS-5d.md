# HR VIS-5d — หน้าตั้งค่า HR + หน้าตารางกฎหมาย ให้ตรงภาพ 08 (จัดวางใหม่เท่านั้น)

> DRAFT r0 · 17 พ.ย. 2026 · ผู้ร่าง (อ่านอย่างเดียว · ไม่ได้ build · ไม่ได้เปิดเบราว์เซอร์). ฐาน `session/hr` 7d532038e (มี VIS-5a + VIS-5b · ยังไม่มี VIS-5c) · สาขา `wip/hr-vis-5d` · ทุก hunk มีบรรทัด `HR VIS-5d` + `◂` · ค่าเริ่มของคำถามท้ายใบใช้ได้จนกว่าผู้คุมตัดสิน.
> อินพุต: `ledger/wo-notes/hr-H5.1-visual-review-r1.md:104-109` (14-settings DIFFERENT · 15-law MINOR) · `ledger/design-hr/08-settings-ai.body.html` (+ `.png`) · `/root/qc/hr-h5.1/{14-settings,15-law,cov-14-settings,cov-15-law,x7-todo-h4.8-apikeys}` (ถ่าย 14 พ.ย. · ก่อน VIS-5a/5b) · `scripts/hr-ui-inventory.json` (145 แถวของ `/hr/settings` + 6 แถวของ `/hr/settings/law`).

## 1. กติกา
ย้ายและแต่งหน้าตาเท่านั้น: ไม่เปลี่ยนตรรกะ · I/O ของ action · ด่านสิทธิ์ · รูปร่างตัวโหลด · ข้อความปฏิเสธ. ผู้ดูแต่ละคนต้องเห็น "ชุดส่วน" เท่ากับที่เห็นวันนี้ทุกประการ กระจายไปตามแท็บย่อย (กติกาเดียวกับ VIS-5a r2). องค์ประกอบของภาพ 08 ที่ไม่มีหลังบ้าน = ไม่สร้าง (ท้ายใบ "NOT IN THIS TICKET").

## 2. วันนี้ (ตรวจกับโค้ดแล้ว)
### 2.1 `src/app/app/sys/[id]/hr/settings/page.tsx` (666 บรรทัด)
- ด่านเปิดหน้า `:101` `canManageHrSettings(viewer)` (`hr/settings.ts:91` = OWNER หรือ `evaluate(hr.employee.create)`) ไม่ผ่าน = 404 · ผลเดิน: P/PS = 404 (`cov-14-settings`), O/M/MB = 200.
- กรอบ `:242` `max-w-2xl` คอลัมน์เดียว (ผู้ตรวจวัด 9,722 px ที่ 1440 — r1:105) · `:243` PageHeader · `:245` `<ModuleTabs>` **ไม่ส่ง `wrap`** · `:247` การ์ดลิงก์ไปหน้ากฎหมาย · `:251` `hr-settings-stub-note` ("หน้านี้เป็นหน้าตั้งค่าแบบย่อ…" `hr.settings.stubNote`) · `:254` `hr-settings-message`.
- ผลการกด = รหัสสั้นใน URL จาก allowlist: `?msg=` (`MSG_TEXTS :67-80`, `back()` ระดับโมดูล `:85`) · `?run2=` `:93-96` · `?pacct=` `:657` · `?fmsg ?fflds ?fdoc` `:661` · `?life=` `:644` · `?year=` (ปีวันหยุด `:109`).
- **inline `"use server"` 22 ตัว `:127-228`** — ทุกตัวจับเฉพาะ `path` (สตริง) + `year` (ตัวเลข) แล้วเรียก action ที่ import มา 1 ตัว; `back` เป็นฟังก์ชันระดับโมดูล (ไม่ใช่ตัวแปรที่ถูกจับ) ⇒ ผ่าน A1/A2 วันนี้:

| # | ตัวห่อในหน้า | action ที่ผูก (ไฟล์) | ส่วน · บรรทัดที่วาด | ใครเห็นปุ่ม (เงื่อนไขในโค้ด) |
|---|---|---|---|---|
| 1-2 | `onCreateShift` `onArchiveShift` | `createShiftAction` `archiveShiftAction` (`settings-actions`) | กะ `:260-314` | ฟอร์มเพิ่ม: ทุกคนที่เปิดหน้าได้ (ตัวเลือกสาขาตามขอบเขต `:230`) · ปุ่มเก็บ: `all ∨ row.unitId` `:271` |
| 3-5 | `onCreatePolicy` `onArchivePolicy` `onAddLeavePreset` | `createLeavePolicyAction` `archiveLeavePolicyAction` (`settings-actions`) · `addLeavePresetAction` (`leave-presets-actions`) | ประเภทลา `:316-415` + `LeavePresetSection` (`leave-presets-ui.tsx:12`) | เพิ่ม: ทุกคน · เก็บ: `all ∨ unitId` `:334` · ชุดตามกฎหมาย: `canAdd={all}` `:414` |
| 6-8 | `onAddHoliday` `onDeleteHoliday` `onApplyPreset` | `upsertHolidayAction` `deleteHolidayAction` `applyHolidayPresetAction` (`settings-actions`) | วันหยุด `:417-492` | เพิ่ม: ทุกคน · ลบ: `all ∨ unitId` `:451` · ชุดวันหยุดราชการ: `all` `:428` |
| 9-11 | `onSaveClockPolicy` `onSaveClockSite` `onSaveAttendancePolicy` | `saveClockPolicyAction` `saveClockSiteAction` (`settings-actions`) · `saveAttendancePolicyAction` (`attendance-actions`) | ลงเวลา `:495-610` | ทั้งส่วน: `clockOk` = `canManageClockSettings` (`clock-settings.ts:56` · OWNER หรือคีย์ `hr.employee.create`/`hr.*` **ตรง ๆ**) · นโยบาย 2 ฟอร์ม: `all` `:498,:515` · จุดลงเวลา: ต่อสาขาในขอบเขต `:559` |
| 12 | `onSaveOtPolicy` | `saveOtPolicyAction` (`ot-actions`) | นโยบาย OT `:612-642` | `all` |
| 13 | `onSaveNormalMinutes` | `saveNormalMinutesAction` (`work-entries-actions`) | `WorkSettingsCard` (`work-entries-ui.tsx:189`) | ส่ง `null` ถ้าไม่ใช่ OWNER `:649` ⇒ คนอื่นเห็นค่าอย่างเดียว |
| 14 | `onSaveLabor` | `saveLaborSettingsAction` (`labor-actions`) | `LaborSettingsCard` (`labor-ui.tsx:188`) | `all` `:651` (การ์ดคืน `null` ถ้า `getLaborSettings` ไม่ ok) |
| 15 | `onSaveAttPay` | `saveAttendancePayPolicyAction` (`attendance-pay-actions`) | `AttendancePayPolicyCard` (`attendance-pay-ui.tsx:26`) | OWNER `:653` |
| 16 | `onSaveEngine` | `setPayrollEngineAction` (`payroll-actions`) | `PayrollEngineCard` (`payroll-run-ui.tsx:642`) | OWNER `:655` |
| 17-19 | `onSavePayBook` `onSavePosting` `onSavePayAccount` | `setPayrollBookAction` `setPayrollPostingAction` `setPayrollPayAccountAction` (`payroll-actions`) | `PayrollAccountingCard` (`payroll-accounting-ui.tsx:18`) | OWNER `:657` · การ์ดวาดให้ทุกคนที่เปิดหน้าได้ (หนี้ H3.10-F3 `HR-DEBTS.md:85` — ดู Q6) |
| 20-22 | `onSaveBankProfile` `onSaveBankPreset` `onDeleteBankPreset` | `saveBankProfileAction` `saveBankPresetAction` `deleteBankPresetAction` (`bank-files/actions`) | `BankSettingsCard` (`bank-files/ui.tsx:350`) | การ์ด: `canUseBankFiles` · บัญชีต้นทาง: OWNER `:659` · ชุดคอลัมน์: ผู้ผ่านด่านการ์ด |

- action ที่ผูก **ตรง** (ไม่มีตัวห่อ): `saveLinePolicyAction` → `LineSettingsCard` (`line-ui.tsx:103` · client · `useActionState`) `:647` · `saveLifecyclePolicyAction` ใน `LifecycleSettings` (`lifecycle-ui.tsx:434,451`) · `saveFilingProfileAction` ใน `FilingSettingsCard` (`filings/ui.tsx:405,432`) · `ApiKeysCard.tsx` (client) เรียก `listHrApiKeysAction` `issueHrApiKeyAction` `revokeHrApiKeyAction` (`api-key-actions`) เฉพาะ OWNER `:663`.
- ด่านของการ์ดเอง: `LifecycleSettings` = `canSeeLifecycle` (`lifecycle.ts:94` · OWNER/คีย์ตรง) แก้ได้ = ทั้งร้าน · `FilingSettingsCard` = `canUseFilings` (บันทึก = OWNER) · `LineSettingsCard` ทุกคนเห็น `canSave = isAllBranches(scope)`.
- จุดที่ขัดกับกติกา "ไม่แสดงปุ่มที่กดแล้วถูกปฏิเสธ" วันนี้ (ผลเดิน `summary.json` DISABLED-NO-REASON ของ 14-settings): `hr-line-settings-enabled|mode|digest|cap|unit` ปิดอยู่สำหรับ MB (`line-ui.tsx:135-167` `disabled={!canSave}`) · `LifecycleSettings` ปุ่มบันทึกอยู่ใน `<fieldset disabled={!editable}>` (`lifecycle-ui.tsx:453,509`) · ช่องของ `FilingSettingsCard` `disabled={!owner}` (`filings/ui.tsx:421-482`) · `hr-settings-law-preset-off-childcare` ปุ่มปิดถาวร (`leave-presets-ui.tsx:42`) · `hr-apikeys-issue` ปิดจนกรอกชื่อ (`ApiKeysCard.tsx:174`).
- แม่แบบรายการรับเข้า/ออกจากงาน = textarea ข้อความดิบ `key | title | dueDays` (`lifecycle-ui.tsx:431,502,506`; ตัวอ่าน `templateOf` `lifecycle-actions.ts:126`) — r1:106 จัดเป็น A.
- ช่องวัน/เวลาแบบ native: `type="time"` `:292,:296` · `type="date"` `:468` · `line-ui.tsx:159` (ไม่แก้ในใบนี้ → VIS-5e กลุ่ม 2).
- ข้อความ: ทุกป้ายของหน้าใช้ `hr.settings.*` / `hr.ot.*` / บล็อกของแต่ละการ์ดแล้ว; EN-THAI ของ 14/15 มีเฉพาะแถบแท็บ HR (ผลเดิน) — ข้อความคงที่ไทยใน `MSG_TEXTS` (`SETTINGS_TEXT` ฯลฯ) ยังไทยบนหน้าอังกฤษ (ไม่ถูกเดินเพราะต้องกดก่อน · → VIS-5e คำถามเจ้าของ).

### 2.2 `src/app/app/sys/[id]/hr/settings/law/page.tsx` (62 บรรทัด) + `src/lib/modules/hr/law-ui.tsx` (180)
- ด่านเดียวกับหน้าตั้งค่า `:25` · อ่านอย่างเดียว: `loadLawView(today)` (`hr/law.ts:131` — ทุกแถวทุกสถานะ · `inForce` · `pendingSignOff` · `approvedByName/approvedAt`) · ไม่มีฟอร์ม/action. ตาราง `HrLawTable` เป็นตารางกลาง เขียนได้เฉพาะฝั่งแพลตฟอร์ม (fitness F16.9 · `qc-hr-h3.3` S1.4 และข้อ readOnly `:214` ห้ามมี `"use server"` · `<form` · `action=` · `onSubmit` ในหน้า + law-ui).
- กรอบ `max-w-3xl` `:34` (ผู้ตรวจ: คอลัมน์ ~460 px ครึ่งขวาว่าง สูง 3,535 px — r1:109) · `LawTableView` วาดทีละชนิด เป็นบล็อก key-value ต่อวันมีผล (`SsoValues :41` `TaxValues :67` `DeductionValues :101` `OtValues :123`) · testids `hr-law-page|back|warn|pending|table|row-*`.

## 3. โครงเป้าหมาย — หน้าเดียว + `?tab=` (ไม่แตก route)
เหตุผล: `ModuleTabs` จับ pathname ตรงตัว (เหมือน VIS-5a §3) และข้อสอบเก่าอ่าน `settings/page.tsx` ตรง ๆ (§8). แบบ: เมนูย่อยซ้ายของภาพ 08 (`.snav` 250 px) = ลิงก์ `?tab=` + `aria-current` สูง ≥ 44 px (แบบเดียวกับ `AttendanceViewTabs` `attendance-ui.tsx:93`).

| `tab` | ป้าย (ตามภาพ ทุกตัวอักษร) | เนื้อหา (ย้าย ไม่เขียนใหม่) | แสดงเมนูเมื่อ |
|---|---|---|---|
| `shifts` (ค่าเริ่ม) | กะและตารางงาน | ส่วนกะ `:260-314` · `WorkSettingsCard` · `LaborSettingsCard` (Q2) | เสมอ |
| `leave` | ประเภทลาและโควตา | ส่วนประเภทลา `:316-415` รวม `LeavePresetSection` | เสมอ |
| `holidays` | วันหยุด | ส่วนวันหยุด `:417-492` | เสมอ |
| `rules` | กฎสาย/OT | ส่วนลงเวลา `:495-610` · นโยบาย OT `:612-642` · `AttendancePayPolicyCard` | เสมอ (เนื้อในแต่ละส่วนใช้เงื่อนไขเดิม · ถ้าผู้ดูไม่มีส่วนใดเลยในแท็บนี้ = ไม่แสดงเมนู) |
| `pay` | รอบจ่าย | `PayrollEngineCard` · `PayrollAccountingCard` · `BankSettingsCard` · `FilingSettingsCard` | เสมอ (เครื่องคิด + ลงบัญชี วาดให้ทุกคนวันนี้) |
| — | ตารางกฎหมาย | ลิงก์ไป `/hr/settings/law` (หน้าเดิม · เมนูซ้ายชุดเดียวกัน ตัวนี้ `aria-current`) | เสมอ |
| — | สิทธิ์ผู้จัดการ | ไม่มีหลังบ้านในระบบ HR → Q3 | — |
| `connect` | การเชื่อมต่อระบบ | `LineSettingsCard` · `ApiKeysCard` (OWNER) · ลิงก์ `/app/settings/connections` | เสมอ (LINE วาดให้ทุกคนวันนี้) |
| `life` | (ไม่มีในภาพ — Q1) | `LifecycleMsg` + `LifecycleSettings` | `canSeeLifecycle` (ใช้ฟังก์ชันเดิม ไม่เพิ่มด่าน) |

- `settingsTabOf(sp)` (pure · ไฟล์ใหม่ `src/lib/modules/hr/settings-view.ts`): `tab` ที่ระบุชนะ · `run2|pacct|fmsg|fflds|fdoc` → `pay` · `life` → `life` · อื่น ๆ → `shifts`. `tab` ที่ผู้ดูไม่มี = วาดเฉพาะเมนู + ข้อความว่างของ `hr.setview.empty` (บทเรียน r4 B2: ห้ามมีหน้าเปล่า).
- ตัวห่อ 22 ตัว: ตัวเรียก action + อาร์กิวเมนต์คงเดิมทุกตัวอักษร; แก้ได้เฉพาะปลายทาง redirect ให้เติม `&tab=<สตริงคงที่>` (เช่น `back(path, year, r, "leave")` โดย `back` ยังอยู่ระดับโมดูล) + `#anchor` เดิม. ห้ามให้ closure จับค่าใหม่ที่ไม่ใช่สตริง/ตัวเลข.
- ข้อความผล `hr-settings-message` วาดในแท็บที่กลับมา (บนสุดของเนื้อหา · กรอบ `role="alert"` เดิม).
- `:251` `hr-settings-stub-note`: ถอดออกเมื่อหน้านี้เป็นหน้าเต็ม — ต้องแก้แถว inventory + คีย์ `hr.settings.stubNote`/`desc` (ข้อความ "หน้าชั่วคราว") → Q4.
- การ์ดลิงก์ `hr-settings-law-link` `:247`: testid ย้ายไปอยู่บนรายการเมนูซ้าย "ตารางกฎหมาย" (แถว inventory `kind: link` เดิม).
- ทุกหน้าในใบนี้ส่ง `wrap` ให้ `<ModuleTabs>` (prop เลือกใช้ของ VIS-5b `module-tabs.tsx:13`) — ปิด r4 B3 สำหรับ 2 หน้านี้ (หน้าอื่น = VIS-5e).
- ความกว้าง: กรอบ `max-w-7xl` · ≥ 1280 `grid-cols-[250px_minmax(0,1fr)_380px]` (ขวา = การ์ดการเชื่อมต่อย่อ §4 #22) · 1024 `grid-cols-[220px_minmax(0,1fr)]` (การ์ดขวาลงใต้เนื้อหา) · 390 เมนูเป็นแถวเลื่อน `data-scroll="x"` เหนือเนื้อหา คอลัมน์เดียว ไม่มี h-scroll ระดับหน้า.

## 4. เทียบองค์ประกอบภาพ 08
EX มีแล้ว (จัดวาง/แต่ง) · DE ตัวโหลดคืนอยู่แล้ว ทำ markup ใหม่ · ND ต้องอ่านเพิ่ม (ฟังก์ชันอ่านที่มีอยู่) · NF ไม่มีหลังบ้าน → ท้ายใบ "NOT IN THIS TICKET".

| # | องค์ประกอบ | ชั้น | ที่มา |
|---|---|---|---|
| 1 | แถบเมนู HR บน ไม่ถูกตัด | EX | `ModuleTabs wrap` |
| 2 | หัวเมนูซ้าย "ตั้งค่าพนักงาน" + 8 รายการ | EX 6 · NF 1 (สิทธิ์ผู้จัดการ) · ลิงก์ 1 | §3 |
| 3 | บรรทัดท้ายเมนู "ตารางกฎหมายใช้ร่วมทุกสาขา · กะ/วันหยุด/กฎสาย ตั้งแยกรายสาขาได้" | EX | `hr.law.sharedAll` / `sharedBranch` (มีคำว่า "ที่หน้าตั้งค่า" ต่อท้าย — คงข้อความเดิม · Q5) |
| 4 | หัว "ตารางกฎหมาย" + วงเล็บ "(มีวันที่มีผล · แก้ได้โดยไม่ต้องอัปเดตโปรแกรม)" | EX บางส่วน | `hr.law.title` · **ไม่ใช้คำ "แก้ได้…"** — ร้านแก้ไม่ได้ (F16.9 · h3.3) ใช้ `hr.law.readOnly` เดิมแทน |
| 5 | บรรทัดรอง "ระบบเลือกแถวที่มีผล ณ วันจ่าย…" | EX | `hr.law.howPicked` |
| 6 | "…ทุกการแก้ไขเก็บประวัติ ผู้แก้ และเหตุผล" | NF | ไม่มีตัวอ่านประวัติ |
| 7 | แถบเตือนแดง "⚠ ตัวเลขทุกตารางต้องให้นักบัญชี/ที่ปรึกษาตรวจก่อนใช้จริง" | EX | `hr-law-warn` `hr.law.warn` (คำตรงภาพแล้ว) |
| 8 | การ์ดประกันสังคม: ตาราง 1 แถวต่อวันมีผล — มีผลตั้งแต่ · ลูกจ้าง · นายจ้าง · ฐานต่ำสุด · ฐานสูงสุด · สมทบสูงสุด/เดือน · สถานะ | DE | `view.groups[SSO].rows` + `parseSsoJson`/`ssoV2` ที่ `SsoValues` ใช้อยู่ · ป้ายคอลัมน์ `hr.law.sso.*` · สถานะ `statusText` |
| 9 | ป้ายสถานะ "ใช้อยู่" / "ร่าง · ยังไม่มีผล" | DE | `hr.law.status.inForce|draft|activeLater|activeOld|retired` (คำปัจจุบันยังไม่ได้เทียบกับภาพทีละคำ — ผู้สร้างเทียบแล้วรายงานส่วนต่าง ไม่แก้เอง) |
| 10 | ปุ่ม "เพิ่มช่วงมีผลใหม่" | NF | เขียนตารางกฎหมายจากฝั่งร้านไม่ได้ (F16.9) |
| 11 | ท้ายการ์ด "ชุดตั้งต้นจาก SHARK 2 ม.ค. 2569 · ร้านยืนยัน 5 ม.ค. โดยพี่เก่ง" | DE บางส่วน | `r.approvedByName` + `r.approvedAt` → `hr.law.approvedBy` (รับรองฝั่งแพลตฟอร์ม) · "ร้านยืนยัน" = NF |
| 12 | ลิงก์ "ประวัติ" | NF | — |
| 13 | การ์ดภาษีขั้นบันได: ช่วงเงินได้ · อัตรา · ภาษีสะสมเมื่อเต็มขั้น + ป้าย "มีผล <วัน>" | EX | `TaxValues` (ตารางมีอยู่แล้ว) · ป้ายวันจาก `effectiveFrom` |
| 14 | คอลัมน์ "ในร้านตอนนี้ (ก.ย.)" (จำนวนคน/ภาษีต่อขั้น · ชื่อพนักงาน + เงินได้) | NF | ไม่มีตัวอ่าน และเป็นข้อมูลค่าจ้างรายคนบนหน้าที่ผู้ไม่มีสิทธิ์เงินเดือนเปิดได้ |
| 15 | ลิงก์ "ตามตารางกฎหมาย" บนหัวการ์ดภาษี | NF | ไม่มีปลายทาง |
| 16 | ท้ายการ์ดภาษี "ภงด.1 รายเดือน = ภาษีทั้งปี… ÷ 12 · ปรับทุกเดือน…" | EX | `hr.law.whtMethod` (ข้อความจริงของเครื่องคิดต่างจากภาพ: "หักส่วนที่หักไปแล้ว แล้วเฉลี่ยตามเดือนที่เหลือ" — คงของจริง ห้ามใช้ "÷ 12") |
| 17 | การ์ดค่าลดหย่อนพื้นฐาน (5 แถว key-value) + ป้ายมีผล | EX | `DeductionValues` `hr.law.ded.*` |
| 18 | การ์ด OT และค่าแรงขั้นต่ำ (×1.5 · ×2 · ×3 + ป้าย "ตามประกาศ · ตรวจสอบ") | EX | `OtValues` · `hr.law.minWageEmpty` (ค่าแรงขั้นต่ำรายจังหวัดไม่มีตาราง — แสดงข้อความเดิม) |
| 19 | สองการ์ดล่างวางคู่ (`.g28`) | EX | layout ≥ 1024 |
| 20 | การ์ด "ผู้ช่วย AI ของ SHARK (HR)" (ข้อสังเกต 3 ข้อ · ใช้ข้อเสนอจัดกะ · สร้างงานในบอร์ด · ถามต่อ) | NF | ไม่มี UI/ตัวอ่าน `hr-ai-*` ใน src (grep แล้ว 0) |
| 21 | การ์ด "การเชื่อมต่อ (ย่อ)" + ลิงก์ "ทั้งหมด" | EX (ลิงก์) | `/app/settings/connections` (ลิงก์เดียวกับ `sys/[id]/page.tsx:96`) |
| 22 | แถวเชื่อมต่อ: บัญชี · แชท LINE พนักงาน | DE | `getPayrollAccounting().link` (`payroll-accounting-ui.tsx:21` อ่านอยู่แล้ว) · `linePolicyOf().enabled` (`page.tsx:117`) → ติ๊ก/ไม่ติ๊ก + ลิงก์ไปแท็บ `pay#hr-pay-accounting` / `connect#hr-line-settings` · แสดงตามเงื่อนไขเดิมของการ์ดต้นทางเท่านั้น |
| 23 | แถวเชื่อมต่อ: POS · จอง · อนุมัติ · คลัง (+ "เปิดใช้") | ND → Q7 | ยังไม่พบตัวอ่านสถานะรวมฝั่ง HR (POS: `getLaborSettings`; คลัง: `stock-charge`; จอง/อนุมัติ: ไม่ได้ยืนยัน) |
| 24 | เนื้อหาแท็บ กะ/ลา/วันหยุด/กฎสาย-OT/รอบจ่าย | EX | ภาพ 08 ไม่ได้วาดแท็บเหล่านี้ — ใช้รูปแบบการ์ด `.lt` เดียวกับตารางกฎหมาย (หัวการ์ด + ตาราง/รายการ + ฟอร์มเพิ่มในแถวท้าย) |

นับ 24 ข้อ: EX 13 · DE 4 · ND 1 · NF 6 (ข้อ 2, 4, 11 นับตามส่วนหลัก — ส่วนย่อยที่ไม่มีหลังบ้านของสามข้อนี้อยู่ในรายการท้ายใบด้วย).
แม่แบบรับเข้า/ออกจากงาน (r1:106 A): Q8.

## 5. ตารางบทบาท (อ่านจากโค้ด · inventory `roles/hiddenFor` เป็นตัวตัดสินตอนสอบ)
O เจ้าของ · M ผู้จัดการทุกสาขา (ผ่าน `evaluate` ด้วยบทบาท ไม่มีคีย์ตรง) · MK ผู้จัดการ/พนักงานที่ถือคีย์ `hr.employee.create` ตรง ทุกสาขา · MB ถือคีย์ จำกัดสาขา · P/PS/S/K/N.

| ส่วน | O | M | MK | MB | P · PS · S · K · N |
|---|---|---|---|---|---|
| เปิด `/hr/settings` และ `/hr/settings/law` | ✔ | ✔ | ✔ | ✔ | 404 |
| กะ · ประเภทลา · วันหยุด: ดู + เพิ่ม | ✔ | ✔ | ✔ | ✔ เฉพาะสาขาในขอบเขต (ไม่มีตัวเลือก "ทั้งร้าน") | — |
| ปุ่มเก็บ/ลบแถว | ✔ | ✔ | ✔ | เฉพาะแถวที่มี `unitId` | — |
| ชุดลาตามกฎหมาย · ชุดวันหยุดราชการ · นโยบาย OT | ✔ | ✔ | ✔ | ไม่แสดงปุ่ม | — |
| ส่วนลงเวลา (จุดลงเวลา) | ✔ | ไม่เห็นทั้งส่วน | ✔ | ✔ เฉพาะสาขา · ไม่มีฟอร์มนโยบาย 2 ตัว | — |
| ชั่วโมงทำงานปกติ · กฎหักสาย/ขาด · รุ่นเครื่องคิด · ลงบัญชีเงินเดือน | แก้ | ดู | ดู | ดู | — |
| ค่าแรงต่อยอดขาย | แก้ | แก้ | แก้ | ดู | — |
| วงจรพนักงาน | แก้ | ไม่เห็น | แก้ | เห็น แก้ไม่ได้ | — |
| LINE | แก้ | แก้ | แก้ | เห็น แก้ไม่ได้ | — |
| ไฟล์โอน · แบบยื่น | แก้ | ตามด่าน `canUseBankFiles` / `canUseFilings` (ต้องมีคีย์เงินเดือน — ผู้ร่างไม่ได้ไล่เงื่อนไขจนสุด) | ← | ← | — |
| คีย์ API | ✔ | — | — | — | — |

"เห็น แก้ไม่ได้" = แสดงค่าเป็นข้อความอ่าน + บรรทัดเหตุผล 1 บรรทัด (`hr.setview.readOnly*`), **ไม่แสดงช่องกรอก/ปุ่มที่ปิดอยู่** (กติกา §7.3). เฉพาะ MB/M เท่านั้นที่ผลเดินมีภาพ; MK ไม่มีในตารางเดิน (ไม่ได้ยืนยันด้วยภาพ — ข้อสอบ W2 ครอบ).

## 6. 390 / 1024
- 390: เมนูย่อย = แถวเลื่อน `data-scroll="x"` (รายการสูง 44) · การ์ดตารางกฎหมาย: ปสส. เป็นการ์ดต่อวันมีผล (ป้าย–ค่า 2 คอลัมน์) ไม่ใช้ตาราง 7 คอลัมน์ · ตารางภาษี 3 คอลัมน์พอดีจอ (ห้าม `min-w-[`) · ฟอร์มเพิ่ม: ช่องเรียงแนวตั้ง ปุ่มเต็มกว้าง · checkbox ใช้ `h-5 w-5` ใน label สูง 44 (ปิด TAP-44 ของ `hr-settings-shift-overnight` `policy-half-day` `policy-prorata` `clock-site-*`).
- 1024: เมนูซ้าย 220 + เนื้อหา · สองการ์ดล่างของกฎหมายยังวางคู่ · การ์ดเชื่อมต่อย่อลงล่าง · ไม่มีข้อความถูกตัด.

## 7. กติกาผู้สร้าง (บทเรียนของ RUN นี้ — ผิดข้อใด = ไม่รับ)
1. **inline `"use server"` ห้ามจับตัวแปรที่เป็นฟังก์ชัน** (เหตุ r4 A1: ปุ่มรอบจ่าย 7 + แก้เวลา 4 ตัวพังทั้งหน้าตั้งแต่ H3.4/H2.6). `qc-hr-vis-5a` A1 (TS compiler API ทุกหน้าใต้ `src/app/app/sys/[id]/hr`) + A2 (ขั้นคอมไพล์ server action ของ Next) ต้องเขียวบนหัวสุดท้าย. ห้ามเพิ่ม inline action ตัวใหม่; ถ้าจำเป็น = ถามผู้คุมก่อน.
2. **ผูก action เดิมตรง ๆ** — ฟอร์มใหม่ใช้ตัวห่อ `on*` เดิมหรือ action ที่ export อยู่แล้ว; ห้ามสร้างตัวห่อ/ไฟล์ action/ตัวช่วยฝั่ง server ใหม่; ชื่อฟิลด์ของฟอร์มไม่เปลี่ยน.
3. **ปุ่มหรือช่องที่ action จะปฏิเสธผู้ดูคนนั้น = ไม่แสดง** (แทนด้วยค่าที่อ่านได้ + เหตุผล). ใช้เงื่อนไขที่หน้าคำนวณอยู่แล้ว (`all`, `clockOk`, `owner`, `canSave`, `editable`) — ไม่เพิ่มด่าน ไม่เปลี่ยนผลของด่าน.
4. **คำไทยตรงภาพทุกตัวอักษร** เว้นแต่กติกา fitness/ข้อสอบห้าม (รายการยกเว้นของใบนี้มี 3 ข้อ: §4 #4 #16 และ Q5) — ห้ามเปลี่ยนคำเพื่อหลบตัวตรวจ (บทเรียน VIS-5c: ไม่รับ 2 จุด `HR-RESUME.md:840`); ชนตัวตรวจ = หยุด รายงาน ขอ ORACLE-EDIT.
5. **กดทุกปุ่มในเบราว์เซอร์จริงก่อนรายงาน** — ผู้สร้างขอให้ผู้คุม build + serve แล้วกดเอง (หรือผู้คุมรัน press probe ของ walker): ตัวห่อทั้ง 22 + ปุ่มของ LINE / วงจรพนักงาน / แบบยื่น / คีย์ API (ออก + เพิกถอน) ทุกปุ่มต้องได้ผลบนหน้าปกติ (ข้อความสำเร็จหรือคำปฏิเสธไทย) ไม่ใช่หน้า error. แนบ `press.jsonl` + ภาพต่อปุ่ม ใน `/root/qc/hr-vis5d-r<n>/`.
6. **ถ่ายภาพบน seed สะอาด** — `seed-hr-walk --down` → `--up` ใหม่ก่อนถ่าย; แถวที่ press probe สร้าง (กะ/ประเภทลา/วันหยุด/ชุดคอลัมน์/คีย์ API) ต้องลบก่อนถ่าย (บทเรียน VIS-5c C1: พนักงาน "QCV5cPress" ค้างในทุกภาพ).
7. testid ที่เขียนอยู่ใน `page.tsx` วันนี้ต้อง **ยังเขียนอยู่ใน `page.tsx`** (ข้อสอบ h2.5 :337 · h2.9 :258 · h3.5 :247 · h3.6 :268 อ่านไฟล์นี้) และ `page.tsx` ยัง import/อ้าง `attendance-pay-ui` · `lifecycle-ui` · `<LeavePresetSection` · `<LeavePolicyWarningLines` · `addLeavePresetAction(` · `lp.${k}` (h3.2 :219 · h4.4 :285 · h2.7 :1633).
8. หน้ากฎหมาย + `law-ui.tsx` ต้องไม่มี `"use server"`, `<form`, `action=`, `formAction`, `onSubmit`, `@/lib/platform` และยังมี `hr-law-table` + `hr-law-row-` + `loadLawView` (h3.3 :212-216).
9. ไม่มีไฟล์ `"use client"` ใหม่ ยกเว้นตัวแก้แม่แบบ (ถ้า Q8 = ใช่) · tokens เท่านั้น (ไม่มี hex/rgba/`bg-blue-`/emoji ใหม่) · ไม่มีการคำนวณเงินในไฟล์ใหม่ · วันที่ผ่าน `src/lib/ui/date.ts` / `period-label.ts`.
10. ห้ามแตะ: `settings.ts` · `settings-actions.ts` · `clock-settings.ts` · `law.ts` · `lifecycle.ts` · `lifecycle-actions.ts` · `line-*.ts` · `labor*.ts` · `payroll*.ts` · `bank-files/**` ยกเว้น `ui.tsx` · `filings/**` ยกเว้น `ui.tsx` · `privacy*.ts` · `scope.ts` · `nav.ts` · `api/**` · `api-key-actions.ts` · `prisma/**` · `src/lib/core/**` · `scripts/fitness-hr.mts`.

## 8. ขอบเขตไฟล์
- แก้ได้ (ทุก hunk มี `HR VIS-5d`): `src/app/app/sys/[id]/hr/settings/page.tsx` · `settings/law/page.tsx` · `settings/ApiKeysCard.tsx` (เฉพาะ className/โครง ไม่แตะ handler) · `src/lib/modules/hr/law-ui.tsx` · เฉพาะฟังก์ชันการ์ดตั้งค่าใน: `lifecycle-ui.tsx` (`SettingsForm :445-516`) · `line-ui.tsx` (`LineSettingsCard :103-191`) · `work-entries-ui.tsx` (`WorkSettingsCard :189-216`) · `labor-ui.tsx` (`LaborSettingsCard :188-243`) · `attendance-pay-ui.tsx` (`AttendancePayPolicyCard :26-90`) · `payroll-run-ui.tsx` (`PayrollEngineCard :642-690`) · `payroll-accounting-ui.tsx` · `bank-files/ui.tsx` (`BankSettingsCard :350-531`) · `filings/ui.tsx` (`FilingSettingsCard :405-492`) · `leave-presets-ui.tsx`.
- ไฟล์ใหม่ (ป้ายใน 3 บรรทัดแรก): `src/lib/modules/hr/settings-view.ts` (pure: `settingsTabOf`, รายการแท็บ) · `src/lib/modules/hr/settings-ui.tsx` (server: `SettingsNav`, `SettingsFrame`, `ConnectionsMini`) · `scripts/qc-hr-vis-5d.mts` (ผู้เขียนข้อสอบ).
- ข้อความ: บล็อกใหม่ `hr.setview` ใน `src/messages/{th,en}/common.json` (แทรกต่อจาก `hr.settings` · th/en คีย์ตรงกัน F16.4) · คีย์เดิมของ `hr.settings` / `hr.law` แก้ได้เฉพาะที่ §3/§4 ระบุ.
- `scripts/hr-ui-inventory.json`: แถวใหม่ `wo: "VIS-5d"` — `hr-set-nav` · `hr-set-nav-<tab>` · `hr-set-panel-<tab>` · `hr-set-empty` · `hr-set-connections` · `hr-set-conn-<name>` · `hr-set-readonly-*`; แก้ `conditional` ของแถวที่ย้าย/ถอด (`hr-settings-stub-note` · `hr-settings-law-link`).
- ผู้คุม: `scripts/walk-hr-matrix.json` (§9) · ORACLE-EDIT ของข้อสอบเก่า.
- ข้อสอบเก่าที่อ่านไฟล์เหล่านี้ (ผู้สร้างรันทุกตัว · ผู้ร่างยืนยันเฉพาะ regex ที่อ้างบรรทัดไว้ใน §7 ข้อ 7–8 ที่เหลือ **ยังไม่ได้ไล่**): `qc-hr-h1.2` · `h2.4` · `h2.5` · `h2.7` · `h2.9` · `h2.12` (ถ้ามี) · `h3.1` · `h3.2` · `h3.3` · `h3.4(-lib)` · `h3.5` · `h3.6` · `h3.7(-lib)` · `h4.2-lib` · `h4.4` · `h4.5-lib` (MARKED รวม `pSettings` :186) · `h4.8` (MARKED รวม `settings` :41) · `qc-hr-set-1` · `priv-2` S4/S5 · `h4.3-lib` S1.6 · `vis-5a` A1/A2 · `vis-5b` S1/S5. ที่จะแดงแน่: ตัวตรึงไฟล์แบบ MARKED/frozen → ผู้คุมเพิ่ม allowlist `VIS5D_ALLOW` (แบบ `VIS5A_ALLOW`): รับเฉพาะไฟล์ในรายการข้างบน และเฉพาะ hunk ที่มี `HR VIS-5d`; hunk ของข้อสอบมี `ORACLE-EDIT (HR VIS-5d · controller)`. แดงนอกรายการ = หยุด รายงาน.

## 9. การรับงาน (ผู้คุม build + เดิน · ผู้สร้างไม่ build เอง)
(a) สถานะเดิน: `14-settings` (O M MB) + ใหม่ `14v-settings-<leave|holidays|rules|pay|connect|life>` (O M MB) + `15-law` (O MB · `cov-15-law` M) × 1440×900 / 1024×768 / 390×844 × th/en = 7 สถานะ × 3 ผู้ดู × 6 + กฎหมาย 2 × 6 ≈ 138 ภาพ; `x7-todo-h4.8-apikeys` ชี้ไป `?tab=connect`; `cov-14-settings` P/PS ยัง 404. ผู้คุมดูคู่ MOCKUP|RENDER ของ `15-law` (O 1440) และ `14-settings` เทียบโครงภาพ 08.
(b) เหนือขอบพับ — 1440 `15-law`: แถบ HR ครบ · เมนูซ้าย 8 รายการ · หัว + แถบเตือน · การ์ดปสส. ทั้งใบ · หัวตารางภาษี; `14-settings`: เมนูซ้าย + การ์ดแรกพร้อมแถว ≥ 3 + ฟอร์มเพิ่ม. 1024: เมนูซ้าย + หัว + การ์ดแรก. 390: หัว + แถวเมนู + การ์ดแรกเริ่มเห็น.
(c) ความสูงหน้า: ทุกแท็บที่ 1440 ≤ 2,400 px (วันนี้ 9,722) · `15-law` 1440 ≤ 1,800 px (วันนี้ 3,535) · 390 ทุกแท็บ ≤ 4,500 px.
(d) walker: HSCROLL-PAGE 0 · HSCROLL-EL FAIL 0 (ประกาศได้เฉพาะแถวเมนู 390) · แถบ HR ไม่ถูกตัดที่ 1024 · EN-THAI จาก `hr.setview` 0 · I18N-MISSING/KEY 0 · RAW-ERROR 0 · PAGE-CRASH 0 · CLICK-ERROR 0 · DISABLED-NO-REASON ของสองหน้านี้ 0 (วันนี้ 54 ใน `14-settings` = law-preset-off 18 + LINE 30 + apikeys-issue 6 · `15-law` 0 — `/root/qc/hr-h5.1/results.jsonl` แถวล่าสุดต่อเซลล์) · TAP-44 ใหม่ 0 และ checkbox 13×13 ของหน้าตั้งค่าหมด · INV-LEAK 0 · ผู้จัดการไม่เห็น ฿ นอก `configMoneyOk`.
(e) ข้อสอบใหม่ `qc-hr-vis-5d.mts` (static + pure · ≤ 60 KB): `settingsTabOf` เวกเตอร์ (รวมพารามิเตอร์ผลการกดทุกตัว) · **W2 (GREEN control วัดบนฐานก่อนสร้าง): ชุด testid ต่อผู้ดู O/M/MB ของหน้าเดิม = union ทุกแท็บหลังสร้าง** (ยกเว้นแถวที่ §3 ระบุถอด/ย้าย และช่องที่ §7.3 เปลี่ยนเป็นข้อความอ่าน — ระบุชื่อทีละตัว) · ตัวห่อ 22 ตัว: ชื่อ action ที่เรียกในแต่ละตัว = ตารางใน §2.1 (AST) · ไม่มี inline action เพิ่ม · หน้ากฎหมายไม่มีฟอร์ม · ไม่มี `disabled` ที่ไม่มี `aria-describedby`/ข้อความเหตุผลในการ์ดตั้งค่า · `hr.setview` th/en ตรงกัน · testid ↔ inventory · ไม่มี `min-w-[` ในตารางกฎหมาย · กติกา `VIS5D_ALLOW`.
(f) เขียว: ชุดใน §8 · `qc-hf-hr-privacy` · `qc-nav-functions` · `fitness` + `fitness-hr` ผ่าน iso.sh ทั้งสองโหมด · typecheck ครั้งเดียวตอนจบ (`NODE_OPTIONS=--max-old-space-size=12288 ISO_MEM=14000M` — 8192 ไม่พอ `HR-RESUME.md:820`).
(g) หลักฐานการกดจริง §7.5 ครบทุกปุ่ม + ภาพบน seed สะอาด §7.6.

## 10. ขั้นทำ (ทุกขั้นหน้าใช้งานได้)
1. โครง + เมนู: `settings-view.ts` · `settings-ui.tsx` · `page.tsx` (กรอบ · `wrap` · เมนู · แบ่งส่วนตาม `tab` · redirect เติม `&tab=`) · `law/page.tsx` (กรอบ + เมนูเดียวกัน) · ข้อความ · inventory.
2. ตารางกฎหมาย: `law-ui.tsx` (ปสส. เป็นตาราง · ป้ายมีผล · การ์ดคู่ · 390) · `law/page.tsx` หัว/บรรทัดรอง.
3. การ์ดตั้งค่าเป็นแบบ `.lt` + ปุ่ม/ช่องตาม §7.3 + การ์ดเชื่อมต่อย่อ + แม่แบบ (ตาม Q8) + ถอด stub note (ตาม Q4).

## QUESTIONS FOR THE CONTROLLER
- Q1 `LifecycleSettings` (เตือนทดลองงาน/สัญญา · บอร์ดงาน · แม่แบบ) ไม่มีที่ในเมนู 8 รายการของภาพ. **ค่าเริ่ม: เพิ่มรายการที่ 9 "วงจรพนักงาน" ใช้คำจาก `hr.life.settings.title` เดิม** — ทุกส่วนเดิมต้องยังเปิดถึง; ทางเลือก = ใส่ใต้ "การเชื่อมต่อระบบ".
- Q2 `LaborSettingsCard` (เป้า % · ยอดขายต่อคนต่อชั่วโมง · คนขั้นต่ำ) อยู่แท็บไหน. **ค่าเริ่ม: กะและตารางงาน** — ค่าพวกนี้ป้อนกราฟความต้องการคนของตารางกะ.
- Q3 "สิทธิ์ผู้จัดการ": ไม่มีหลังบ้านใน HR. **ค่าเริ่ม: แสดงรายการเมนูเป็นลิงก์ไป `/app/settings/staff` เฉพาะ OWNER** (หน้าผู้ใช้งานของร้าน — ผู้ร่างเห็นเพียงว่ามีโฟลเดอร์ route นี้ ไม่ได้เปิดดูเนื้อหา/ด่าน; ถ้าหน้าไม่ใช่ที่ตั้งสิทธิ์ = ไม่แสดงรายการ แล้วเข้ารายการเจ้าของ).
- Q4 ถอด `hr-settings-stub-note` + แก้ `hr.settings.desc` ("หน้าชั่วคราว…")? **ค่าเริ่ม: ถอด + desc ใหม่ไม่มีคำว่าชั่วคราว** — ต้อง ORACLE-EDIT ถ้า `qc-hr-h1.2` ตรึง testid นี้ (ยังไม่ได้ตรวจ).
- Q5 บรรทัดท้ายเมนู: ภาพไม่มี "ที่หน้าตั้งค่า" ต่อท้าย. **ค่าเริ่ม: คีย์ใหม่ใน `hr.setview` ตรงภาพสำหรับเมนู · `hr.law.sharedAll/sharedBranch` เดิมคงไว้บนหน้ากฎหมายสำหรับผู้ดูจำกัดสาขา**.
- Q6 หนี้ H3.10-F3 (ผู้จัดการไม่มีคีย์เงินเดือนเห็นชื่อสมุดบัญชี/บัญชีเงินในการ์ดลงบัญชี). **ค่าเริ่ม: ไม่แตะ (ใบนี้ห้ามเปลี่ยนสิทธิ์)** — แต่การ์ดจะเด่นขึ้นในแท็บ "รอบจ่าย"; ผู้คุมตัดสินว่าจะเปิดใบ PRIV แยกก่อนหรือไม่.
- Q7 แถวการเชื่อมต่อ POS/จอง/อนุมัติ/คลัง. **ค่าเริ่ม: ไม่แสดง 4 แถวนี้ (แสดงเฉพาะ บัญชี + LINE + ลิงก์ "ทั้งหมด")** — ไม่มีตัวอ่านสถานะที่ยืนยันได้ และห้ามเพิ่มการอ่านที่ข้ามด่าน.
- Q8 แม่แบบรับเข้า/ออกจากงานเป็นข้อความดิบ (r1:106 A). **ค่าเริ่ม: client component เล็ก `TemplateRowsEditor` (แถว: ชื่อรายการ + จำนวนวัน · เพิ่ม/ลบ/เลื่อน) ที่เขียนค่าลง textarea ซ่อนชื่อฟิลด์เดิมในรูปแบบ `key | title | dueDays` เดิม** — action และตัวอ่านไม่เปลี่ยน; ไม่มี JS = textarea เดิมยังใช้ได้. ทางเลือก = คง textarea + รายการอ่านด้านบน.
- Q9 ผู้สร้างเพิ่มสถานะเดินของแท็บใหม่ใน walk matrix เอง? **ค่าเริ่ม: ใช่** (เหมือน VIS-5a Q7).
- Q10 ผู้ดู MK (คีย์ตรง ทุกสาขา) ไม่มีในตารางเดิน. **ค่าเริ่ม: ไม่เพิ่มผู้ดู — W2 ครอบด้วยข้อสอบ**.

## NOT IN THIS TICKET (รายการเจ้าของ → ย้ายเข้า `ledger/HR-OWNER-LIST.md`)
การ์ดผู้ช่วย AI บนหน้าตั้งค่า (ข้อสังเกต 3 ข้อ · "ใช้ข้อเสนอจัดกะ (ร่าง)" · "สร้างงานในบอร์ด" · "ถามต่อ") · ร้านเพิ่ม/แก้ช่วงมีผลของตารางกฎหมาย ("เพิ่มช่วงมีผลใหม่") · ประวัติการแก้ตารางกฎหมาย + ผู้แก้ + เหตุผล · "ร้านยืนยัน <วัน> โดย <ชื่อ>" · คอลัมน์ "ในร้านตอนนี้" (จำนวนคน/ภาษีต่อขั้น · ประมาณการรายคน) · ตารางค่าแรงขั้นต่ำรายจังหวัด · หน้าสิทธิ์ผู้จัดการภายใน HR · สถานะการเชื่อมต่อ POS/จอง/อนุมัติ/คลัง + ปุ่ม "เปิดใช้".

## ยังไม่ได้ยืนยัน (ผู้ร่างบอกตรง ๆ)
- regex ของข้อสอบเก่าทุกตัวใน §8 นอกเหนือจากที่อ้างบรรทัด · ว่า `qc-hr-h1.2` ตรึง `hr-settings-stub-note` หรือไม่.
- เงื่อนไขเต็มของ `canUseBankFiles` / `canUseFilings` สำหรับ M/MB (inventory ระบุ "OWNER หรือ hr.payroll.read + hr.payroll.pay ทุกสาขา").
- เนื้อหาและด่านของ `/app/settings/staff` และ `/app/settings/connections`.
- คำของ `hr.law.status.*` เทียบภาพ · ภาพของ MB ในส่วนลงเวลา (อ่านจากโค้ดเท่านั้น).
- ภาพ `/root/qc/hr-h5.1/14-settings` ถ่ายก่อน VIS-5a/5b; ตัวเลข 9,722 / 3,535 px มาจากบันทึกผู้ตรวจ ไม่ได้วัดซ้ำ.

## CONTROLLER RULINGS (18 พ.ย. 2026)
- Q1–Q5, Q7–Q10: **รับค่าเริ่มทุกข้อ** (Q1 รายการที่ 9 "วงจรพนักงาน" · Q2 แท็บกะและตารางงาน · Q3 ลิงก์เฉพาะ OWNER — ถ้าหน้านั้นไม่ใช่ที่ตั้งสิทธิ์ = ไม่แสดง + รายการเจ้าของ · Q4 ถอด stub note + desc ใหม่ (ORACLE-EDIT ถ้ามีข้อสอบตรึง) · Q5 คีย์ใหม่ตรงภาพ · Q7 ไม่แสดง 4 แถว · Q8 `TemplateRowsEditor` (ไม่มี JS = textarea เดิมใช้ได้) · Q9 ผู้เขียนข้อสอบเพิ่มสถานะเดิน ไม่ใช่ผู้สร้าง · Q10 ไม่เพิ่มผู้ดู)
- Q6: ไม่แตะในใบนี้ → หนี้ H3.10-F3 คงอยู่ในทะเบียนหนี้ (ใบ PRIV แยกหลัง RUN)
- §9 แก้: **ผู้สร้าง build + serve + กดจริง + เดินเองบนฐานเลน** (เหมือน VIS-5a r4 / VIS-5c) แล้วผู้ตรวจภาพอิสระดู · ผู้คุมเดินซ้ำทั้งระบบตอน H5.1
- ลำดับบทบาท: ผู้เขียนข้อสอบ (`qc-hr-vis-5d` + สถานะเดิน + `VIS5D_ALLOW` ในชุดเก่า) → ผู้สร้าง → ผู้ตรวจภาพ → merge
