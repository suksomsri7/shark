# HR visual review, batch 1 (H2.5 · H4.4 · H2.4 · H3.3 · H2.7+H2.8 · H4.1)

Reviewed 12 Nov 2026 against session/hr 6e57e0d00. Server: 3226 (hr-qc-serve-3226v), DB wo-hr-qc-l1, seed unchanged. Mockups: `ledger/design-hr/0{2,4,5,7,8}-*.png`. Shots are under `.qc-shots/hr/<wo>/`. Every run gave HTTP 200 for allowed users and 404 for refused users, with no horizontal overflow and no console errors (other than the 404 resource itself).
**141 shots taken. I opened 44 of them plus 13 crops** (desktop, iPad and mobile of every page type). For the rest I relied on the summary JSON (status, overflow, errors).

## H2.5 attendance: DEFECTS
- **MAJOR** day view, owner/manager-branch, 1024: `2.5/att-day-yesterday-owner-1024x768.png`. The table is clipped on the right after "สถานะ": the badge shows "สาย 1", and the columns ชม.จริง, OT and การกระทำ are invisible. The header "เข้า · วิธี" wraps onto 3 lines.
- **MAJOR** day view, 390: `att-day-yesterday-owner-390x844.png`, `att-day-today-owner-390x844.png`. Cards drop every column label. The clock-out time ("15:00") sits under the shift range and reads like part of it, followed by a bare "—" and "8:08". On today's view each card is only unlabelled dashes.
- **MAJOR** month, 390: `att-month-namfon-owner-390x844.png`. The "คิดผลใหม่" buttons wrap as "คิด/ผล/ใหม่" and spill over the cell borders. Times are hidden and "ยังไม่ถึ…" is cut mid-word. At 1024 times are also cut ("06:56 – 15:…").
- **MAJOR (seed/coverage)** today view, owner: `att-day-today-owner-1440x900.png`. All 9 rows show "หยุด" because the seed has no roster for today. So phases, the banner and clock-for cannot be checked.
- MINOR: the "เข้า · วิธี" column shows no method (mockup: "kiosk PIN" / "มือถือ GPS"). The side card says "สรุปวันนี้" while showing yesterday. Today's date is not highlighted on the calendar. Rows show ชม.จริง 8:08 for 06:52–15:00 while the footer says "(หักพัก)"; please confirm the shift break. Mobile/iPad checkboxes are about 16 px.
- OK: น้ำฝน is late +18 on 11 พ.ย. No ฿ anywhere. Staff self-calendar has no recompute button. member/payroll/kiosk get 404.

## H4.4 lifecycle: DEFECTS
- **MAJOR** manager-branch, all widths: `4.4/life-due-manager-branch-1440x900.png`, `life-probation-manager-branch-*`, `life-settings-manager-branch-*`. There is no "ต้องจัดการ" panel, no probation banner, no checklist 5/7, no notes, and no lifecycle settings card. Yet the "สิ้นสุดการจ้าง" dialog works (`life-offboard-open-manager-branch-390x844.png`). Cause: `canSeeLifecycle` needs an explicit key while `canOffboard` does not. A manager can end employment while seeing none of the records.
- **MAJOR** owner, probation profile: `life-probation-owner-1440x900.png`. The banner sits about 1,950 px down, below the whole edit form. Mockup 02 puts it at the top of the profile.
- **MAJOR (spec)** staff own profile returns 404 at all widths (`life-staff-self-staff-*.png`), so r2-2 cannot be checked visually.
- MINOR: the ended banner (ฝ้าย) uses the same blue info style as probation. "รายการรับพนักงานใหม่" shows as an empty heading (`life-ended-kept-owner-1440x900.png`). The contract banner has no "อีก n วัน". The settings templates are raw `id_card | บัตร ปชช. | 0` text with English codes. Eras are mixed: "26 พ.ย. 2026" here vs "พ.ย. 2569" in attendance. Note titles are cut at 390.
- OK: owner panel 4 boxes (โบว์ 26 พ.ย. · เจ 30 พ.ย. · onboarding 2 ข้อ · offboarding 5 ข้อ ฝ้าย), checklist 5/7 with overdue dates in red, นัท verbal warning, "เก็บสิทธิ์บัญชี…ไว้" message, revoke switch locked for the manager, no panel for staff.

## H2.4 clock v2: DEFECTS
- **MAJOR** kiosk page, member (no HR keys): `2.4/clock-kiosk-member-1440x900.png`. Member sees the whole staff list with positions and can open the PIN pad, while the same user gets 404 on attendance.
- **MAJOR (same root as H4.4)** manager-branch: `clock-settings-manager-branch-1440x900.png` has no GPS card even for สาขาหัวหิน. The code comment says this is intentional; it needs a ruling.
- MINOR: ปุ้ย (no PIN) appears both in the grid and under "ยังไม่มี PIN". The PIN dots are about 10 px. The kiosk keeps the sidebar and the full HR tabs on a tablet. The GPS checkboxes are about 16 px. There is no "use this location" control for lat/lng.
- OK: PIN pad keys ≥ 56 px, "ลงเวลา" + "เริ่มพัก" (`clock-kiosk-pin-kiosk-390x844.png`), 3 site cards (ทั้งร้าน/หัวหิน/สวนผึ้ง), staff and kiosk get 404 on settings.

## H3.3 law page: OK (minor)
- MINOR: "ข้อมูล ณ 12 พ.ย. 2026" uses the Gregorian year. "ตารางกฎหมาย" is a top-level tab, which overflows the tab strip at 1440 (cut to "ตารางกฎหมา…" on other HR pages); mockup 08 puts it in the settings sidebar.
- OK: read-only, "ร่าง · รอนักบัญชียืนยัน" badges, warning note, nothing clipped at 390. staff/payroll/member get 404.

## H2.7+H2.8 leave/holidays: DEFECTS
- **MAJOR** pending card at 390: `2.7/leave-owner-390x844.png`. แพร's line cuts off at "คงเหลือ 6.0 วัน (+1.0 ร…", so the balance and reason are lost.
- **MAJOR** there is no team quota table for managers (mockup 05). Staff get "วันลาคงเหลือของฉัน" (`leave-staff-390x844.png`), but managers only see one inline balance on แพร's card, and none on มิ้นท์'s.
- MINOR: two type selects ("ประเภท" + "ประเภทการลา ตามหมวด"). Date inputs show mm/dd/yyyy. Holidays are listed as ISO "2026-04-13" and the preset button says "ปี 2026". The policy list does not show the half-day flag. member sees the request form with an employee picker (`leave-member-1440x900.png`).
- OK: the half-day select is present, the hourly field is absent (ruling Q6), and there are no raw keys.

## H4.1 leave impact: DEFECTS
- MINOR: the shift name is missing; the line reads "กระทบ: กะ 19 พ.ย. 69 (15:00–23:00)", and `ui.tsx:294` passes no shift. Impacts sit in a separate "ผลกระทบต่อกะ" block, not on each card as R12 says.
- OK: uncovered → "ขาด 1 คน → ระบบเสนอ เจ (18 → 26 ชม.)", covered → "ยังมี 4 คน · ไม่ต้องหาคนแทน", shown to owner and manager-branch, hidden from staff (`4.1/leave-impact-staff-390x844.png`).

## Cross-cutting
- MINOR: refused users get Next's English "This page could not be found."; it leaks nothing. Staff/kiosk/member see tabs (ตั้งค่า, ตารางกฎหมาย, เงินเดือน) that lead to 404. Outside this batch: the add-employee "ชื่อพนักงาน" field squeezes to about 50 px at 1440 (`4.4/life-due-owner-1440x900.png`).

## Specs added
In `scripts/visual-hr.mts`: "2.4" (kiosk NAME, kiosk PIN after a click, settings, refused), "3.3", "2.7", "4.1".
