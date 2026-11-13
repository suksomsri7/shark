# H2.12 visual batch (VIS-1 re-shoot + specs 2.4 2.5 2.6 2.7 2.9 2.10 2.11 3.1 3.3 4.1 4.4 4.6)

Build: `wip/hr-h2.12` @c85f5180e (app code = session/hr 7dcdcb3c7), `next build --webpack` inside `scripts/iso.sh` (ISO_MEM 16G, heap 14336 — 8192 OOMs) with lane env `.env.qc-hr` (DB `wo-hr-qc-l2`, seed 34/34 of 21:34Z). Server = own unit `hr-qc-serve-3226v` on :3226, stopped by name after the run.
**Build note for the controller:** `next build` fails at its own type-check step on main code: `src/app/api/mobile/inbox/conversations/[id]/reply/route.ts` exports `REPLY_RATE` ("not a valid Route export field") — identical on origin/main 6b991f34d (from SEC S1.14b/S3a.1). `pnpm typecheck` does not see it, and Vercel skips it via `SHARK_TSC_PREBUILD_OK=1`. This QC build used `SHARK_TSC_PREBUILD_OK=1` (route-type check skipped); report to the main/SEC owner, not an HR defect.

Run: every spec × every user it lists (`scripts/visual-hr.mts <wo> --user <u> --base http://127.0.0.1:3226`) — **55 runs, 330 shots, all passed** (HTTP status = the spec's `expect` per role, no horizontal overflow, no console errors). Shots: `/root/projects/shark-hr-b/.qc-shots/hr/<wo>/` (+ `summary-<user>.json`).
Shot time 23:36–23:51Z = 06:36–06:51 Bangkok, 13 Nov: today's shifts had not started, so live phases/banners on "today" views are not exercised.

Method: I opened the shots below at full or reduced size (desktop 1440, iPad 1024 and mobile 390 for the pages that had VIS-1 defects) next to mockups `ledger/design-hr/01 04 05 07 08-*.png`. Pages marked *summary only* were not opened; their verdict rests on the summary JSON (status/overflow/errors) and is not a visual verdict.
Note on fullPage shots: sticky elements (mobile header, bottom tab bar, desktop sidebar, sticky action bars) are painted at the first-viewport position, so they appear mid-page. That alone is not counted as a defect, except where the bar itself is transparent (2.11).

| page (spec key) | sizes opened | mockup | verdict | differences |
|---|---|---|---|---|
| 2.5 att-day-yesterday (VIS-1) | owner 1024 · 390 | 04A | MINOR | 390 cards now labelled (กะ / เข้า·วิธี / ออก / พัก / สถานะ / ชม.จริง / ชม.OT) — VIS-1 MAJOR closed. 1024: columns after สถานะ sit in a horizontal scroll with a "เลื่อนตาราง" hint (mockup shows all columns); tab strip cut at "ตาราง…" (known H5.1); method still missing under เข้า |
| 2.5 att-day-today (VIS-1) | owner 1440 | 04A | MINOR | seed roster for today present (9 rows) — VIS-1 seed MAJOR closed; all "ยังไม่ถึงเวลา" at 06:4x, so late/absent banner not visible in this run |
| 2.5 att-month-namfon (VIS-1) | owner 1024 · 390 | 04B | MINOR | buttons no longer spill (day list moved below the calendar) — VIS-1 MAJOR closed; today (13) highlighted. "ยังไม่ถึงเวลา" wraps to 2 lines at 390; no payroll summary strip (mockup "หักสาย ฿150 · OT ฿600 → ดูรอบจ่าย") |
| 2.5 att-self | staff 390 | 07ก/04B | MATCH | own calendar + ขอแก้เวลา / คำขอแก้เวลา, no recompute |
| 2.4 clock-kiosk (VIS-1) | kiosk 1440 · member/staff/payrollSelf summary | 04A kiosk | MINOR | member/staff/payrollSelf get 404 — VIS-1 MAJOR closed. ปุ้ย still both in the grid and under "ยังไม่มี PIN" |
| 2.4 clock-kiosk-pin | kiosk 390 | 07ก | MATCH | PIN pad keys ≥ 56 px, ลงเวลา + เริ่มพัก, เปลี่ยนชื่อ |
| 2.4 clock-settings (VIS-1) | owner 1440 · manager-branch 390 | 08 | MINOR | manager-branch now sees shifts/leave types/holidays (branch) — VIS-1 MAJOR closed. Page is one long narrow column (≈650 px of 1440) of stacked forms, no settings side menu as in 08; holiday year input "2026" Gregorian; native date inputs |
| 2.6 corr-list | owner 1440 | 05 (แก้เวลา card) | MATCH | card with requested time, reason, "ไม่มีหลักฐานจาก POS ในวันนั้น", ปฏิเสธ/อนุมัติ |
| **2.6 corr-day-form** | owner 1440 | 04A/05 | **MAJOR** | the correction form opens **inside the การกระทำ cell** (≈140 px wide): the first row grows to ≈3× height, selects/date/reason fields ≈120 px wide, labels wrap per word |
| 2.6 corr-self-form | staff 390 | 07 | MINOR | native datetime "11/13/2026, 05:00 PM" (Gregorian, English) |
| 2.6 corr-self-daylist / corr-self-list / corr-day | staff 390 · owner 1440 | 04B | MATCH | day rows open with ขอแก้เวลา; list of own requests |
| 2.7 leave (VIS-1) | owner 390 · manager-branch 1440 | 05 | MINOR | 390 pending cards wrap fully (balance + reason visible) — VIS-1 MAJOR closed; team quota table now lives in the 2.11 inbox (closed there). Remaining: no per-card อนุมัติ/ปฏิเสธ (only batch buttons), native mm/dd/yyyy inputs, page uses ≈45 % of 1440 |
| 4.1 leave-impact (VIS-1) | owner 1440 | 05 | MATCH | impact on each card with shift name "กะปิดร้าน 15:00–23:00 · ขาด 1 คน → ระบบเสนอ น้ำฝน (32 → 40 ชม.)" / "ยังมี 4 คน · ไม่ต้องหาคนแทน" |
| 2.7 leave-settings | owner 1440 | 08 | MINOR | same narrow settings column as 2.4 |
| 2.9 ot-leave | owner 1440 | 05 (OT card) | MINOR | request form + pending card (date, 2:00 ชม., วันทำงาน, reason, อนุมัติ/ไม่อนุมัติ); no ฿ estimate on the pending card (mockup ฿175 with formula) — inbox says rate is computed at pay time, so possibly by design |
| 2.9 ot-settings | owner 1440 | 08 | MATCH | OT rounding / alerts block at the end of settings |
| 2.9 ot-salary-rate | owner 1440 | 06 | MATCH | OT rate column per employee on the payroll page |
| 2.10 self-today | staff 390 | 07ก | MINOR | structure matches (date·branch, greeting, shift card, ลงเวลาเข้า, week strip, action grid, balances). Balances are stacked cards, not the 3-number strip; "เพื่อนร่วมกะ" lists people on other shifts too; no GPS line |
| 2.10 self-leave-form | staff 390 | 07ข | MINOR | type chips with balance ✓; no half-day toggle or attachment field visible; date fields show "—" |
| 2.10 self-pay | staff 390 | 07ค | MINOR | slip list + เบิกล่วงหน้า + หนังสือรับรอง; the slip detail of 07ค is one tap away (not in this shot) |
| 2.10 self-requests · self-week · self-own-profile | staff 390 | 07 | MATCH | own requests with cancel; week list; own profile now 200 (VIS-1 debt closed) |
| 2.10 self-hr-tabs | staff 390 | 07 | MINOR | staff on /hr/leave sees "เลือกพนักงาน" picker and the team-style form |
| **2.11 hub-overview** | owner 1440 | 01 | **MAJOR** | pending-request cards show only type + name + filed date with live อนุมัติ/ไม่อนุมัติ buttons — **no what/when/amount** (mockup 01: "แพร · 10–11 ต.ค. (2 วัน)", "โบว์ · 30 ก.ย. · 2 ชม.", amounts). Owner can approve blind. Content uses ≈45 % of width; timeline/labour/month blocks absent (declared later WOs) |
| **2.11 inbox** | owner 1440 · 390 | 05 | **MAJOR** | (1) the sticky batch bar ("เลือกทั้งหมดที่ตัดสินได้ · ไม่อนุมัติที่เลือก (0) · อนุมัติที่เลือก (0)") has a **transparent background** — card text and the card's อนุมัติ button show through and collide with the bar's text (1440 and 390); mockup 05 puts the batch bar at the top of the list. (2) **raw enum codes** shown to users: รายการ `OT` / `DEDUCTION` / `ADVANCE`, ประเภท `PERSONAL`. Minor: period "2026-11" in ISO; quota table last column cut at 390 (scrolls) |
| 2.11 inbox-adj · inbox-ot | summary only | 05 | (MAJOR by inference) | same card component as inbox → same raw codes and bar |
| 2.11 inbox-batch-result | owner 390 | 05 | MINOR | shot shows filter "สลับกะ 0" with "ไม่มีคำขอตามตัวกรองนี้"; no batch-result message visible — the spec's click did not produce a visible result |
| 2.11 inbox-refused | staff/kiosk/member | — | MATCH | 404 |
| 3.1 we-panel | owner 1440 | 06 | MINOR | "ชั่วโมงทำงานของงวด" table on the payroll page (rows 0:00 — no snapshot in the seed, as the spec says); payroll page is now ≈6,000 px long |
| 3.1 we-month | owner 1440 | 04B | MATCH | calendar + per-day recompute |
| 3.3 law | owner 1440 | 08 | MINOR | read-only tables, DRAFT badges, warning. Single column, no settings side menu / AI panel (08); top-level tab (known) |
| 4.4 life-due (VIS-1) | manager-branch 1440 | 02 | MATCH | ต้องจัดการ panel (4 boxes) now visible to manager-branch — VIS-1 MAJOR closed |
| 4.4 life-probation (VIS-1) | owner 1440 · manager-branch 390 | 02 | MATCH | probation banner at the top of the profile — VIS-1 MAJOR closed; native Gregorian date inputs remain (known minor) |
| 4.6 stock-owner | owner 1440 | 06 | MINOR | stock-charge form + list at the end of the payroll page; works but sits after ≈4,500 px of other sections |
| 4.6 stock-staff | staff 390 | — | MATCH | staff sees only the restricted-payroll note |
| 2.4 clock-settings-refused · 2.5 att-refused · 2.6 corr-refused · 3.3 law-refused | summary | — | MATCH | 404 for the refused roles |
| summary only (not opened) | 2.5 settings-attendance · 2.10 self-advance-form · self-profile · 3.1 we-settings · 4.4 life-contract · life-ended-kept · life-notes · life-offboard-open · life-settings · 4.6 stock-manager · stock-payroll | — | — | HTTP as expected, no overflow, no console errors |

**Counts (pages opened):** MATCH 21 · MINOR 17 · MAJOR 3 (+2 inferred: inbox-adj, inbox-ot) · summary-only 11.
**VIS-1:** of the 11 batch-1 MAJORs, 10 are closed in these shots (attendance 1024/390, month 390, today seed, kiosk member 404, manager-branch lifecycle panel, probation banner position, staff own profile 200, leave 390 wrap, team quota table → inbox, manager-branch settings sections). Not verified: the manager-branch GPS site card in clock settings (seen only the top of the 390 shot).

## Fix list for the controller (MAJOR — not fixed in H2.12)
1. **2.11 inbox sticky batch bar transparent** — give the bar an opaque background + shadow (or move it to the top of the list as in mockup 05). `.qc-shots/hr/2.11/inbox-owner-1440x900.png` (y≈830), `.qc-shots/hr/2.11/inbox-owner-390x844.png` (y≈720).
2. **2.11 raw enum codes in inbox cards** — map kind/type to the existing Thai labels (เพิ่ม/หักเงิน kinds, leave categories). `.qc-shots/hr/2.11/inbox-owner-1440x900.png`, `inbox-adj-*`, `inbox-ot-*`.
3. **2.11 hub pending cards approve blind** — show the one-line summary (dates/days, hours, amount) the inbox already computes, or link to the inbox instead of approving inline. `.qc-shots/hr/2.11/hub-overview-owner-1440x900.png`.
4. **2.6 correction form inside the action cell** — open it as a row-spanning panel / dialog under the row. `.qc-shots/hr/2.6/corr-day-form-owner-1440x900.png`.

## VIS-2 re-shoot (13 Nov · fix commit 2227c6828)
Build: `next build --webpack` in `scripts/iso.sh` (ISO_MEM 16G · heap 14336 · `SHARK_TSC_PREBUILD_OK=1` — same main route-type issue as above) · lane env `.env.qc-hr` · seed 34/34 · own unit `hr-qc-serve-3226v` :3226, stopped by name · re-seeded after (inbox-batch-result approves a swap). Runs: 2.11 × manager-branch/manager/payroll/owner · 2.6 owner · 2.7 owner · 2.4 manager-branch — all passed (status = expect · no overflow · no console errors). Opened the PNGs below next to mockups 01/05/08.

| page | size | verdict | differences |
|---|---|---|---|
| 2.11 inbox (`2.11/inbox-owner-1440x900.png`, `-390x844.png`) | 1440 · 390 | MATCH (bar) | batch bar is now at the top of the list as in 05, opaque (surface under the accent tint — the shop's `--color-accent-soft` is rgba 8 %, which was the cause), sticky under the topbar (top-14 · z-20); at 390 it wraps to label + 2 buttons, no overlap. Cards: `ค่าล่วงเวลา (OT)` / `หักเงิน` / `หักเบิกล่วงหน้า`, ประเภท `ลากิจ`, งวด `พ.ย. 2569` — no raw codes left. Remaining (known MINOR): no per-row avatar/position, quota column cut at 390 (scrolls) |
| 2.11 inbox-adj / inbox-ot | 1440 · 390 | MATCH | same card component — labels, period month |
| 2.11 hub-overview owner (`2.11/hub-overview-owner-1440x900.png`) | 1440 | MATCH (VIS-2 item) | each card has a summary line: `ค่าล่วงเวลา (OT) · ฿117.00 · งวด พ.ย. 2569` (money items: **no inline approve**, link "เปิดดูก่อนตัดสิน" → inbox focus), `ลากิจ · 20 พ.ย. 69 · 1.0 วัน`, `18 พ.ย. 69 · 15:00–17:00 · 2 ชม.`. Width ≈45 % and missing timeline/labour blocks = known, later WOs |
| 2.11 hub-overview manager (`2.11/hub-overview-manager-1440x900.png`) | 1440 | MATCH | no ฿ anywhere (no pay items reach managers); OT/swap summaries + read-only reasons |
| 2.6 corr-day-form (`2.6/corr-day-form-owner-1440x900.png`, `-390x844.png`) | 1440 · 390 | MATCH | 1440: centred dialog (28 rem) over a dimmed backdrop, full-width fields; 390: bottom sheet, full width, 44 px controls, submit visible. fullPage capture paints the backdrop over the first viewport only (capture artefact). Remaining MINOR: native datetime is Gregorian/English |
| 2.7 leave-law-presets (`2.7/leave-law-presets-owner-1440x900.png`) | 1440 · 390 | MATCH (no mockup row; 08 style) | 9 presets: values, section ref for V/V2, neutral wording for ลาไม่รับค่าจ้าง, per-event note on maternity/paternity, "มีแล้ว: …" for the seed's 4 types, child-care = disabled "ยังไม่รองรับ (จ่าย 50%)" + note. Settings page still one narrow column (known) |
| 2.4 clock-settings manager-branch GPS card (`2.4/clock-settings-manager-branch-390x844.png`) | 390 | MATCH (by rule) | the GPS/site card is not rendered for manager-branch: `canManageClockSettings` = OWNER or explicit `hr.employee.create`, and HQC manager-branch has no keys (H2.4 rule "ผู้จัดการที่ไม่มีคีย์ไม่เห็นส่วนนี้"). Not a defect; VIS-1 item closed |

F5 warnings are not visible in the seed (all seed types ≥ law) — covered by qc-hr-h2.7 H212.4 only.
