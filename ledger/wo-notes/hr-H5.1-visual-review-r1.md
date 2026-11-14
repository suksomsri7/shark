# notes
## 01-hub (mock 01) DIFFERENT
- A: missing "กะวันนี้" timeline board (people x hours, status col) - KPI says "ไม่มีตารางกะของวันนี้" (walk at 00:19 -> possibly data) but board component absent entirely
- A: 5 KPI tiles (อยู่กะ/มาแล้ว/สาย/ยังไม่มา/ลา) -> 4 tiles (วันนี้ในกะ 9/คำขอ 10/วันที่ต้องคิดผลใหม่ 0/ใกล้ครบกำหนด 4)+ "รายงาน" tile; tile "วันนี้ในกะ 9" + subtitle "ไม่มีตารางกะของวันนี้" contradictory
- B: month summary card (สาย/ขาด/OT/ลา + ควรคุยรายคน) missing
- B: "ใกล้ครบกำหนด" strip with 3 dated cards missing -> only number tile 4
- B: single ~680px column, ~450px empty right at 1440 (mock 2-col: board | approvals)
- B: approvals list no checkboxes / batch "อนุมัติทั้งหมดที่เลือก"; adjustments only "เปิดดูก่อนตัดสิน"; cards very tall
- labor card: big "—", empty chart area (sales ฿0 at 00:19 possibly data); mobile leaves ~200px blank; "labor % ทั้งเดือน 137.2%" (possibly data) ; per-shift labor tiles + AI suggestion strip missing
- C: tab strip clipped "ตาร" at right 1440/1024 (HSCROLL-EL 757>680)
- en: header พนักงาน/ระบบพนักงาน HR/tabs all Thai; dates "15 พ.ย. 69", "Period พ.ย. 2569" in en
- 1024 same as 1440; 390 single column OK no page hscroll
## 02-employees (mock 02) DIFFERENT
- A: register table (cols ชื่อ/รหัส, ตำแหน่ง/แผนก, สาขา, ประเภทจ้าง, เริ่มงาน, สถานะ badge, PIN, บัญชี SHARK, ⋯ + pagination) missing -> list of collapsible "▶ name · branch · badge · ทำงาน 7 วัน/สัปดาห์" rows; no emp code, position, start date, PIN, account status
- B: no search box, no status tabs (ทั้งหมด14/ประจำ/พาร์ทไทม์/ทดลองงาน/สิ้นสุด) -> only branch chips; no "แสดงที่สิ้นสุด" toggle; no "นำเข้า CSV"; primary "+ พนักงาน" not top-right -> inline add form at page bottom
- A(1440/1024): add form "ชื่อพนักงาน" input squeezed ~56px, placeholder clipped "เช่น ส" (owner-1440x900-th y~1388 x~205-260)
- B: right profile side panel (tabs, probation banner, personal data, onboarding checklist, connections) not on list page (lives on 03 page)
- B: ต้องจัดการ block moved to top (mock bottom) - ok-ish; 4 cards present
- layout narrow 680px column, ~450px empty at 1440
## 03-employee-namfon (mock 02 right panel) DIFFERENT
- B: profile is one long edit form (3015px at 1440); mock = read view with tabs ทั่วไป/เอกสาร/ตารางงาน/ลา/เงินเดือน/ประวัติ + แก้ไข link; no tabs
- B: probation banner (ทดลองงาน ครบ ... + ประเมิน) missing (น้ำฝน is permanent -> possibly data)
- B: onboarding checklist with progress 5/7 -> only "เริ่มรายการรับพนักงานใหม่" button; connections table (บัญชี SHARK/PIN POS/ระบบจอง/CRM) -> only LINE chip + one PIN text line
- A/B: ID card / SSO numbers shown in clear in inputs "1100000000021" (mock masks x-xxxx-xxxxx-62-1 + eye) [owner viewer; may be intended for owner]
- B: date inputs browser format "11/14/1998", "03/20/2023", "mm/dd/yyyy" on Thai page (mock 12 มี.ค. 2546)
- B: no sticky footer บันทึก/ยกเลิก/สิ้นสุดการจ้าง; "สิ้นสุดการจ้าง" is a card mid-page
- en: tabs/labels Thai (EN-THAI)
## 04-roster (mock 03) MINOR
- grid rows=people cols=days, 3 shift styles, leave dashed, unpublished bar, copy/template/publish, demand chart, rules panel: all present; full width at 1440 good
- B: AI เสนอ card missing (H4.3?) ; swap-request card missing (possibly data)
- C: footer text duplicated "รวม 378 ชม.   รวม 378 ชม. · ค่าแรง..." (1440 bottom-left of grid, also 390)
- C: day header shows "7 คน" + some "5/1" chips instead of mock "5/5" need/has per day; labor % คาด 201.6% (possibly data)
- C: names truncated "บาริสต้า · ทด...", "ธุรการ/บุคคล ..." at 1440
- C 1024: "+" add buttons overlap bottom-right corner of shift chips
- 390: day-chip picker + list per day; works; demand chart below
## 05-attendance-day (mock 04A) MINOR
- table columns match (พนักงาน/กะ/เข้า·วิธี/ออก/พัก/สถานะ/ชม.จริง/OT/การกระทำ) full width
- B: "วิธี" (kiosk PIN / มือถือ GPS) never shown under เข้า time (header says เข้า·วิธี)
- B: two stacked buttons คิดผลใหม่+แก้เวลา per row -> rows ~117px vs mock ~65px; 9 people need 1640px; 390: each card ~310px, page 3505px
- B: right-side Kiosk status + มือถือพนักงาน (GPS radius) cards missing; ส่งออก CSV missing
- late banner "ยังไม่ลงเวลาหลังกะเริ่ม 10 นาที" absent (viewing past day 13 พ.ย. -> possibly data)
- C: summary card bottom only ปกติ 8 / สาย 1 , empty half row
## 06-attendance-month (mock 04B) MINOR
- calendar month grid + summary strip + payroll handoff present
- B: "คิดผลใหม่" button inside every past day cell (1440) -> clutter; mock cells show status+times only
- C: legend text-only no swatches; no ส่งออก CSV; payroll callout lacks "ดูรอบจ่าย" link; leading empty week row (Nov starts Sat) fine
- 390: compact calendar + per-day list; OK
## 07-corrections (mock 05 แก้เวลา card) MINOR
- card matches mock pattern (badge, name, request, evidence box, ปฏิเสธ/อนุมัติ). no checkbox/batch. Evidence "ไม่มีหลักฐานจาก POS" (possibly data). Large empty page below (1 item) fine.
## 09-leave (mock 05) DIFFERENT-ish -> MINOR/B
- narrow 680px column; legacy page duplicates 10-requests
- B: batch buttons "อนุมัติที่เลือก (0)" grey and "ไม่อนุมัติที่เลือก (0)" pink-filled when disabled -> look like coloured actions (y~507)
- B: date inputs mm/dd/yyyy and --:-- -- (US/12h) on Thai page (leave form, OT form)
- B: no shift-impact callout with replacement suggestion / money; impact one grey text line
- quota table, holidays, OT rules cards absent on this page
## 10-requests (mock 05) MINOR
- inbox with type chips + counts, branch/age filters, select-all batch bar, cards with impact boxes, quota table on right: close to mock
- B: quota table clipped at right edge at 1440 (columns after ลาพักร้อน cut "ลาไม่รั", hint "เลื่อนตารางไปทางขวา") owner-1440 x~1060-1110 y~330
- B: holidays card + OT/late rules card (mock right column) missing
- B: cards tall (2 per screen); OT card shows "อัตรา คิดตอนจ่าย" not ฿ amount (mock ฿175 with formula)
- C: adjustment cards' checkbox greyed (cannot batch money) w/o reason
- 390: type chip nav overflows 705>358 (scroll strip)
## 08-kiosk / 08-kiosk-pin (mock 04 kiosk card / 07) MINOR
- name grid 2-col + PIN pad 3x4 + ลงเวลา/เริ่มพัก ; no mockup of kiosk screen itself
- B: kiosk account sees HR tab strip (ภาพรวม/จอลงเวลา/ใบลา/พนักงาน/เงินเดือน) above pad at all sizes -> staff at shared device can leave kiosk (kiosk-1440x900-th y~137; 390 y~165)
- C: PIN dots ~10px light grey circles (kiosk-pin 1440 y~260) barely visible; kiosk confined to ~560px column at 1440 with empty right half; no clock/date/branch header; name tiles do not show today's shift/clocked-in state
## 17-me-today (mock 07ก) MINOR
- greeting, shift card, big ลงเวลาเข้า, colleagues, week strip, 6 action tiles, leave balance, bottom nav 5 tabs: all present
- B: "ลงเวลาเข้า" black primary shown while text says "ยังลงเวลาด้วยมือถือไม่ได้" and "วันนี้ไม่มีกะที่ประกาศแล้ว" (staff-390x844-th y~200-330) -> misleading
- B: leave balance = 4 tall stacked cards (~360px) vs mock compact 1-row strip 26/2/3
- C: no GPS line, no notification bell, no "คำขอ OT อนุมัติแล้ว" status strip (possibly data)
## 18-me-week MATCH (simple list, prev/this/next)
## 19a-me-requests MATCH-MINOR (chips + my requests with ยกเลิก)
## 19b-me-form-leave (mock 07ข) MINOR
- B: date fields render as "—" boxes (no date shown/picker affordance); no half-day toggle, no attach-file box; submit not sticky; impact box placeholder grey; form embedded in requests page (not separate screen w/ back)
## 19c-me-form-advance MINOR: disabled grey submit; fine
## 20-me-pay MINOR
- B: two cards both titled "หนังสือรับรองเงินเดือน" stacked (staff-1440 y~405 and ~490; 390 same)
## 21-me-slip (mock 07ค) MATCH: black net card, income/deduction, PDF + หนังสือรับรอง, history
## 22-me-profile MATCH-ish (no mockup screen; consistent)
## 11a-payroll-open (mock 06) BROKEN/DIFFERENT
- A: page 15,920px at 1440 (21,502 at 390): stacked sections in order: 14 salary-profile edit cards (~1900px), work-hours summary, OT/commission/adjust form + pending list, old "รอบจ่ายเงินเดือน (5)" list, per-period chip lists, work-hours table, then "รอบจ่ายเงินเดือน (เครื่องรุ่นใหม่)" run detail starting ~y 6100, then YTD opening forms for each of 14 employees, bank file, filings. Mock = one run screen (stepper, 8 KPI tiles, table, action bar, side drawer)
- A: run detail starts ~6,100px down (owner-1440x900-th) under unrelated editors
- B: internal label "(เครื่องรุ่นใหม่)" in section title; periods shown ISO "งวด 2026-06", "รอบจ่ายงวด 2026-09" instead of มิ.ย. 2569
- B: run table lacks ทำงาน/OT columns, status badge (พร้อม/ต้องตรวจ), totals row; name baseline lower than numbers; side drawer "ที่มาทุกบรรทัด" not visible (rows are ▶ expanders)
- B: action bar (ส่งอนุมัติ · สลิป PDF · ไฟล์ KBank · ภงด.1 · สปส.1-10) not adjacent to table; JV callout missing
- B: KPI tiles 7 (no ค่าจ้างรวม/OT/คอมฯ split)
- A(390): run table shows only ค่าจ้าง/เพิ่ม/หัก, ปสส/ภงด1/สุทธิ off-screen right (overflow-x 560>324); work-hours table status col clipped and "0 ครั้ง · 0 นาที" wraps 4 lines; en 390 page hscroll 394>390
- C: warnings list "ต้องตรวจ 10 รายการ" 10 near-identical long lines
- date inputs mm/dd/yyyy
## 11b-payroll-bank MINOR within same giant page: bank file block clear (not-in-file list, file row with red "ยังไม่ทดสอบกับธนาคารจริง", ดาวน์โหลด); followed by 14 YTD forms
## x1 approved / x2 paid
- B: under run of 2026-08 (approved) the create button "สร้างรอบจ่ายงวด 2026-08" still shown (x1-1440 ~y 6250); x2 shows "สร้างรอบจ่ายงวด 2026-09" for a PAID period -> misleading
- stepper shows 4/5 correctly
## x3 reversed: new-engine panel for งวด 2026-07 shows list + create button only; no run detail, no REVERSED banner; only small chip "กลับรายการแล้ว"
## x4 v1 paid: panel header "งวด 2026-10" but list has 09/08/07/06 only; no detail; v1 run only visible in old list higher up
## 12-slip-admin MATCH (mock 07ค) centered slip card, history
## 13a/13b/13c reports (mock 01 month card) DIFFERENT vs mock, OK as reports
- B: raw "PAID" in สถานะรอบ column (13b) ; column "รุ่นเครื่องคิด 2" internal
- B: ISO Gregorian dates in tables/titles "2022-11-15", "ทะเบียนลูกจ้าง · 2026-11-15", "2026-09"; pickers "11/15/2026", "September 2026" English on Thai page
- A: 13b at 1440 net column cut at right edge ("สุ" / "฿3") owner-1440x900-th x~1430 y~370-720; 390 declared scroller 1148>324
- C: report chip strip clipped "เอกสารภา" at 1440; 390 nav 1304>358; time report minutes raw "3374"
- no month summary tiles/chart like mock 01 month card
## 14-settings (mock 08) DIFFERENT
- A: single 680px column 9,722px tall of forms; mock = left sub-nav (กะ, ประเภทลา, วันหยุด, กฎสาย/OT, รอบจ่าย, ตารางกฎหมาย, สิทธิ์, การเชื่อมต่อ) + AI panel + connections card: none present
- A: onboarding/offboarding templates edited as raw text "id_card | บัตร ปชช. | 0", "pin_revoked | ปิด PIN | 0" (owner-1440 y~3650-3970)
- B: AI assistant panel and connections summary (POS/บัญชี/จอง/อนุมัติ/LINE/คลัง ticks) missing
## 15-law (mock 08 centre) MINOR
- content present (SSO, tax brackets, deductions, OT, min wage) with effective dates + status chips; B: SSO/deduction shown as stacked vertical key-value blocks per date (3,535px) vs mock compact table rows per effective date; narrow column ~460px at 1440 with right half empty; "เพิ่มช่วงมีผลใหม่" action not visible
## 16-approvals (no mock) MINOR
- clean empty states; B: owner sees "คำขอรอตัดสิน (0)" while HR inbox shows 10 pending (possibly by design); en 390: whole page Thai
## x5-me-unlinked (no mock) MATCH: clear card "ยังใช้หน้า ของฉัน ไม่ได้"; C no CTA/back
## en: tabs/headers Thai on all owner pages (EN-THAI on every state); me pages only "พ.ย." month; 16 all Thai
