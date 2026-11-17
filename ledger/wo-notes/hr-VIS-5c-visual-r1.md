# HR VIS-5c — visual QC r1 (register 02-employees* · profile 03-employee-*)

Reviewer: read-only picture review, 17 Nov 2026. No code changed. Server was down; everything below is from the pictures, the mockup and a few source/message lookups.

**Verdict: FIX REQUIRED.** Privacy/role behaviour in the pictures is clean (no finding), but the screen does not yet match mockup 02 in its main state (list + side panel), the brief's own fold criteria fail at all three sizes, there are more Thai label renames than the four already ruled, and about half of what the brief asks to be judged has no picture at all.

## 0. Material and which round was judged
- Pictures: `/root/qc/hr-vis5c-r1/` (P = this prefix). `results.jsonl` holds 3 runs per cell (20:18Z → 21:08Z); every PNG has mtime 21:02–21:09Z = the last run = builder's r2 build (706b6181d "1024 en overflow"). Only that round is judged. r0/r1 pictures were overwritten and are not available.
- Mockup: `ledger/design-hr/02-employees.png` + `02-employees.body.html` (one 1500 px desktop frame: list on the left, 460 px profile drawer on the right). There is **no** tablet or phone mockup of this screen (`07-mobile` is the staff "me" app), and no mockup of the add form, the ⋯ menu, the edit form or the non-general tabs.
- Evidence contamination: every register picture contains a leftover press-test employee **"QCV5cPress mwl5ognb"** (15 people instead of 14, tab counts shifted, and the extra notice line "ยังไม่ระบุสาขาประจำ 1 คน — …" is caused by it). The header count line still says 9 + 5 = 14. See C1.

## 1. Register vs mockup

Pictures: `02-employees/{owner,manager,manager-branch,payroll,payroll-branch}-{1440x900,1024x768,390x844}-{th,en}.png`, `02-employees-panel/owner-*`, `02-employees-add/owner-*`, `press/1-add.png`, `press/4-pin.png`.

### Matches
Title row + black "+ พนักงาน" button; 5 status tabs with counts; search placeholder "ค้นชื่อ · รหัส · เบอร์"; "แสดงที่สิ้นสุด" switch; 9 columns at 1440 without the panel in the mockup's order; avatar + bold name + code; position/department two-liner; status chips (outlined "ทำงาน", blue "ทดลองงาน · N วัน"); "✓ ตั้งแล้ว"; ⋯ at row end; selected row tint + left bar; "ต้องจัดการ" 4-tile card at the bottom; no CSV button, no pay rate, no ยืมตัว tag (ruled).

### Differences (not ruled absences)
| # | Where | Mockup | Build | Evidence |
|---|---|---|---|---|
| R1 | Panel state at 1440 (the mockup's own state) | 9 columns stay visible beside the drawer; every cell one line | Table drops to 7 columns (type folded under the name, account folded under PIN). Chip "ทดลองงาน · 11 วัน" wraps to **3 lines**, "หัวหน้าบาริสต้า" breaks mid-word ("หัวหน้าบาริ/สต้า"), the press name wraps, row heights become uneven | `02-employees-panel/owner-1440x900-th.png` (โบว์ row, ปุ้ย row) |
| R2 | Panel container | Full-height drawer flush right with left border + shadow, 460 px, sticky footer | A 420 px rounded card that ends at ~y 1290 while the list runs on to ~y 1950; empty column below it | same |
| R3 | Panel header | One line "โบว์ · EMP-009 · บาริสต้า", only × on the right; "แก้ไข" sits in the "ข้อมูลส่วนตัว" heading | "แก้ไข" button + × in the header squeeze the title, which breaks **mid-word**: "โบว์ · EMP-009 · บาริ / สต้า" (th and en). No "แก้ไข" link on the section heading | `02-employees-panel/owner-1440x900-{th,en}.png` |
| R4 | Panel probation strip | "⚑ ทดลองงาน · ครบ 15 ต.ค. (อีก 14 วัน)" + "เริ่ม 17 ก.ค. 2569 · 90 วัน · สาย 0 · ขาด 0 · OT 6 ชม." | "ทดลองงาน · 11 วัน" + "29 พ.ย. 2569" only. No flag icon, no "ครบ <date> (อีก N วัน)" wording, no start date / length / late-absent-OT line. (The full profile banner does have the "ครบ … (อีก N วัน)" wording, so panel and profile disagree with each other too.) | same vs `03-employee-bow/owner-1440x900-th.png` |
| R5 | Panel footer | บันทึก · ยกเลิก · สิ้นสุดการจ้าง | One button "เปิดโปรไฟล์เต็ม →". Explained by oracle A1 (the register binds no profile action) but it is not in the builder's deviation list and needs an explicit ruling | same |
| R6 | Panel checklist | Square checkboxes; footnote "2 ข้อที่เหลือเป็นการ์ดในบอร์ดงาน "รับพนักงานใหม่" · ผู้รับผิดชอบ พี่เก่ง" | Round ticks; footnote replaced by link "จัดการรายการ →" | same |
| R7 | Panel connections | PIN row has "เปลี่ยน PIN" link | No link in the panel (it exists on the full profile) | same |
| R8 | Status chip | เจ (contract ending): "สัญญาถึง 31 ต.ค." | เจ shows plain "ทำงาน" although the ต้องจัดการ card on the same page says "สัญญาใกล้หมด 1 · เจ · 30 พ.ย.". No contract-end chip exists in the build (`hr.people.status.*` has none). Not a ruled absence; the data (contractEndAt) exists | `02-employees/owner-1440x900-th.png` |
| R9 | Header sub-line | "… — ทะเบียนลูกจ้างตามกฎหมายแรงงานออกจากหน้านี้" | Tail sentence missing (separate from the ruled count-line wording) | same |
| R10 | Filter row | search · branch · department · switch; no button | search · department (native browser select "ทุกแผนก") · extra "ค้นหา" button · branch · switch. Order declared by the builder; the extra button and the native-looking select are not | same |
| R11 | Type column | Two lines: "ประจำ / รายเดือน" | One line; the pay-type sub-line is gone for every row (only the ฿ rate was ruled out) | same |
| R12 | Table footer | "แสดง 9 คน · หัวหิน 8 + ยืมตัวมา 1 · สิ้นสุด 1" + pager ‹ 1 2 › | "แสดง 1–15 จาก 15 คน", no branch breakdown. Pager not visible because there is one page (pager never pictured) | same |
| R13 | Account column | role "STAFF" / "— ใช้ kiosk" | "✓ มีบัญชี" / "—" (yes/no is ruled 5c-5; the "ใช้ kiosk" hint is simply gone) | same |
| R14 | ต้องจัดการ card | flag icon; "สร้างการ์ดในบอร์ดงานให้อัตโนมัติ"; tiles "Onboarding ค้าง" / "Offboarding" | no icon; "เปิดสร้างการ์ดในบอร์ดงานได้ที่หน้าตั้งค่า"; tiles "รับพนักงานใหม่ค้าง" / "ออกจากงานค้าง" (base LifecycleDuePanel, outside builder scope — listed for the owner) | same |
| R15 | Page chrome | One title "พนักงาน" | Shell title "🧑‍💼 พนักงาน" + module tab "พนักงาน" + h1. Once the h1 is reverted to "พนักงาน" the word appears three times stacked | all register pictures |
| R16 | Leave badge | "ลาป่วยวันนี้" on ต้น | **No row in any picture carries a leave badge** (ต้น = "ทำงาน"). The ruled generic "ลาวันนี้" is therefore not visually verified at all | all register pictures |

### Per size
- **1440 (no panel)**: closest to the mockup. Fold: first row starts at y≈467, rows 69 px → **6 full rows** above 900 (brief §9 asks ≥ 8). `02-employees/owner-1440x900-th.png`.
- **1024**: 7 columns as the brief planned. Module tabs wrap to a second line, filters take two rows → first row at y≈565, rows 77 px → **2 full rows** above 768 (brief asks ≥ 6). Chip wraps to 2 lines ("ทดลองงาน · / 11 วัน", "Probation · / 11 days"), "หัวหน้าบาริ/สต้า" mid-word break (th), en branch names wrap to 2 lines in every row ("สาขา / หัวหิน"). `02-employees/owner-1024x768-{th,en}.png`.
- **390**: stacked cards (name, code, position, dept, branch, status, ⋯) as the brief planned; no mockup exists. Cards start at y≈645 and are 141 px tall → **1 full card** above 844 (brief asks header + tabs + 3 cards). Cards show no start date, type or PIN; lots of white space per card. Search / dept / "ค้นหา" each take a full row. Owner's active module tab "พนักงาน" is scrolled out of view in the tab strip (base). `02-employees/owner-390x844-{th,en}.png`.

### Side panel only ≥ 1280 — does the mockup agree?
The mockup neither agrees nor disagrees: it only draws the 1500 px desktop frame. Hiding the panel below 1280 is the brief's own layout (§4) and reasonable. Consequences seen in the pictures: at 1024 `?emp=` leaves a highlighted row and nothing else (`02-employees-panel/owner-1024x768-th.png`); at 390 nothing at all changes (`…-390x844-th.png`). Source confirms the name link goes to the full profile below xl (ui.tsx:708), so this dead state is only reachable by URL/resize. The real problem is the opposite end: at 1440 the app's 288 px sidebar leaves too little room for list + panel (R1–R3); the mockup assumed a 56 px rail.

### Add flow
`02-employees-add/owner-1440x900-th.png`, `…-390x844-th.png`, `press/1-add.png`. A floating card under the button: name (full row), home branch, position, phone, hint, "+ เพิ่มพนักงาน". The 56 px name input is fixed. No mockup to compare. At 1440/1024 it floats **over** the filter row and the first two table rows; at 390 it pushes the content down. Not pictured: validation error, any non-owner viewer with `?add=1`.

### ⋯ menu
Only one incidental picture: `press/4-pin.png` (owner, 1440, th). It is a tall popover holding the whole schedule editor (each weekday takes two lines: day + times, then "วันหยุดประจำ" on its own line), the PIN field and the delete button; it runs **past the bottom of the 900 px viewport** ("ลบพนักงานคนนี้" is cut) and covers the ต้องจัดการ card. Time inputs read "09:00 AM / 06:00 PM" on a Thai page (browser-locale native input). No walker picture of the open menu at any size or language, none at 390, none of the delete confirm, none of restore on a removed row.

### Ended tab / switch
**Not pictured.** No picture of `?tab=ended` or `?ended=1`, so grey ended rows, "สิ้นสุด <date>" / "ลบแล้ว" chips, "ปิดแล้ว" PIN/account cells and the restore control are unverified.

## 2. Profile vs mockup

Pictures: `03-employee-namfon/{owner,manager,manager-branch,payroll,payroll-branch,staff}-*`, `03-employee-bow/{owner,manager,manager-branch}-*`, `03-employee-namfon-edit/{owner,manager,payroll}-*`, `press/2-edit-save.png`, `press/3-schedule.png`.

### Matches
Header card (avatar, "name · code · position", muted sub-line); six tabs in mockup order and wording (ทั่วไป เอกสาร ตารางงาน ลา เงินเดือน ประวัติ); "ข้อมูลส่วนตัว" key/value rows with the mockup's labels (เบอร์ อีเมล บัตร ปชช. ปสส. ธนาคาร วันเกิด ที่อยู่); mask formats exactly as the brief (`x-xxxx-xxxxx-62-1`, `xxx-xxx-xx21`, `KBank xxx-x-x4321`); eye icons on ID and SSO only; "15 พ.ย. 2546 (23 ปี)"; checklist 5/7 with bar and two bold open items; "เชื่อมระบบ" list. Layout 2 columns at 1440, 1 column at 1024/390 as the brief says.

### Differences
| # | Where | Mockup | Build | Evidence |
|---|---|---|---|---|
| P1 | Probation banner position | Below the tabs, first item of the general tab | Inside the header card, **above** the tabs | `03-employee-bow/owner-1440x900-th.png` |
| P2 | Banner content | "ประเมิน ›" button; stats line "… 90 วัน · สาย 0 · ขาด 0 · OT 6 ชม." | Button "ผ่านทดลองงาน" (the panel says "ประเมิน ›" — two names for the same step); sub-line only "เริ่มงาน 31 ส.ค. 69" | same vs `02-employees-panel/owner-1440x900-th.png` |
| P3 | "แก้ไข" | Link at the right of the "ข้อมูลส่วนตัว" heading | Button in the header card | same |
| P4 | Personal rows | 7 rows starting with เบอร์ | Extra first row "ชื่อเล่น" | same |
| P5 | SSO row | "xxx-xxx-xx21 · รพ.หัวหิน" | No hospital (no such field as far as I can see — needs a ruling or the owner list) | same |
| P6 | Address | Two lines incl. อำเภอ/จังหวัด/รหัสไปรษณีย์ | One line "88/12 ถ.เพชรเกษม ต.หัวหิน". Probably seed data (district/province empty in the edit picture for น้ำฝน); the multi-part address is **unverified** | same, `03-employee-namfon-edit/owner-1440x900-th.png` |
| P7 | Checklist title | "Onboarding checklist" (also on the Thai mockup) | th "รายการรับพนักงานใหม่" (en "Onboarding checklist") — a rename beyond the four | `03-employee-bow/owner-1440x900-th.png` |
| P8 | Checklist | Tickable squares + board footnote | Read-only round ticks + "จัดการรายการ →" (declared by the builder; ticking is on the history tab, which has no picture) | same |
| P9 | Connections labels | "PIN POS" · "เปลี่ยน PIN" | "PIN ลงเวลา" · "ตั้ง/เปลี่ยน PIN" — renames beyond the four | same |
| P10 | Connections rows | SHARK role + "เห็นหน้า ของฉัน" | "ผูกบัญชีแล้ว / ยังไม่มีบัญชี" (ruled yes/no) + an extra "บัญชี LINE" row (declared) whose chip text wraps to two lines inside a pill shape | `03-employee-namfon/owner-1440x900-th.png` |
| P11 | Sticky footer | Always: บันทึก · ยกเลิก · สิ้นสุดการจ้าง | Only in edit mode (brief §4); default view has no "สิ้นสุดการจ้าง" at all — it lives on the unpictured history tab | all default 03 pictures |
| P12 | Save button | "บันทึก" | "บันทึกข้อมูล" — a rename beyond the four | `03-employee-namfon-edit/owner-1440x900-th.png` |
| P13 | Extra block | — | "การจ้างงาน" section (position, dept, branch, type, start, status, probation end) + "บันทึกเพิ่มเติม" under an unlabelled gap. Sensible, but not in the mockup or the deviation list | `03-employee-bow/owner-1440x900-th.png` |
| P14 | Module tab | "พนักงาน" tab active | On every profile picture **no module tab is highlighted** (on the register it is). Probably base tab matching, but it shows on this screen | any `03-*` 1440 picture vs `02-employees/owner-1440x900-th.png` |
| P15 | Right column | Dense single drawer | At 1440 the right column (checklist + connections) ends at y≈990 while the left runs to 1270; for น้ำฝน the right column is one small card. Acceptable, noted | `03-employee-namfon/owner-1440x900-th.png` |

### Tabs other than general
- **Schedule**: one press picture only (`press/3-schedule.png`, owner, th, 1440): 7 weekday rows, time pair, "วันหยุดประจำ", grace minutes, "บันทึกตาราง". Looks orderly. 12-hour "09:00 AM" inputs on a Thai page. No read-only (non-editor) picture, no 390, no en.
- **Documents, leave, pay, history**: **no picture for any viewer.** Cannot be judged.

### Edit mode (`03-employee-namfon-edit/*`)
- Header card loses tabs and the edit button; "แก้ไขข้อมูลพนักงาน" card with สาขาประจำ select, then the old form, then the lifecycle card. Footer บันทึกข้อมูล · ยกเลิก · สิ้นสุดการจ้าง(red). In the full-page captures the sticky footer is drawn across the middle of the form at y≈770–830 — that is a full-page-screenshot artefact of `sticky bottom-0`, not a layout bug, but it means **the real bottom-of-viewport look is only confirmed by `press/2-edit-save.png`** (correct there, with "บันทึกแล้ว").
- "ข้อมูลส่วนตัว" legend has no divider line and sits tight under the branch select; every other legend has a line. Small inconsistency.
- Dates are native `mm/dd/yyyy` (ruled → VIS-5e).
- Manager's edit form has no sensitive block (correct); its last card is an empty box containing only "สิ้นสุดการจ้าง" with blank space above. `03-employee-namfon-edit/manager-1440x900-en.png`.
- en: see Q3 — the whole form body is Thai.

## 3. Masking and roles

| Viewer | Picture(s) | ID / SSO / bank | Eye | Editor controls | Pay figure |
|---|---|---|---|---|---|
| Owner, default | `03-employee-namfon/owner-{1440,1024,390}-{th,en}`, `03-employee-bow/owner-*`, `02-employees-panel/owner-1440x900-*` | masked `x-xxxx-xxxxx-02-1` / `xxx-xxx-xx21` / `KBank xxx-x-x4321` — no full number | on ID and SSO only (bank has none, as in the mockup) | แก้ไข, ตั้ง/เปลี่ยน PIN, LINE unlink; register: +, ⋯ | none |
| Owner, `?edit=1` | `03-employee-namfon-edit/owner-*` | **full** 1100000000021 ×2, 0000004321 in inputs — as ruled (5c-1) | — | form | none |
| Manager (all branches) | `03-employee-namfon/manager-*`, `03-employee-bow/manager-*` | "ซ่อน — เฉพาะผู้ดูเงินเดือน" ×3 | none | แก้ไข, PIN link, LINE; no pay tab | none |
| Manager, `?edit=1` | `03-employee-namfon-edit/manager-*` | sensitive block absent | — | form without sensitive block | none |
| Manager-branch | `03-employee-namfon/manager-branch-*`, `03-employee-bow/manager-branch-*`, `02-employees/manager-branch-*` | "ซ่อน" ×3 | none | แก้ไข, PIN link; bow banner has no "ผ่านทดลองงาน" button; register lists 10 people, เจ shown as "สาขาอื่น" | none |
| Payroll (all) | `03-employee-namfon/payroll-*`, `03-employee-namfon-edit/payroll-*`, `02-employees/payroll-*` | masked only | **none** | **zero**: no แก้ไข, no PIN link, no LINE row, no checklist; register has no "+ พนักงาน", rows end in "→" not ⋯, no ต้องจัดการ. `?edit=1` is pixel-equivalent to the default view | none (tab "เงินเดือน" exists, content unpictured) |
| Payroll-branch | `03-employee-namfon/payroll-branch-*`, `02-employees/payroll-branch-*` | masked only | none | zero, as above | none |
| Staff | `03-employee-namfon/staff-*` | redirected to `/app/me/hr/profile` (own page, other ticket); no number on it | — | — | none |

Conclusions from the pictures: masking formats are exactly the brief's; no full number is visible to any viewer outside the owner's explicitly opened edit form; the eye exists only for the owner; payroll viewers show no editor control in any pictured state; no pay figure appears on any pictured profile state.

**No picture exists for** (so the claim rests on the oracle suite, not on eyes):
- the leave-read viewer (LR) — register and profile, every size;
- payroll / payroll-branch on bow (probation banner + checklist states) and on a borrowed-in employee;
- the side panel for anyone but the owner (payroll / manager `?emp=`), and `?add=1` for non-owners;
- `?edit=1` for manager-branch and payroll-branch;
- tabs documents / schedule / leave / pay / history for every viewer except the owner's schedule press shot — so "no pay figure on the pay tab", "no document forms for payroll", "no schedule editor for payroll" are **not visually verified**;
- staff on the register (expected 404).
The walker's "no full ID/SSO/bank in HTML/RSC" check is reported green in `summary.json` (blockers 0) but I only read its findings list, not the HTML.

## 4. Quality

Clipped / wrapped / colliding
- Q1 **390 en profile tabs collide**: with six tabs the labels touch with no gap — "GeneralDocumentsSchedule Time off Pay History". `03-employee-namfon/owner-390x844-en.png`, `03-employee-bow/owner-390x844-en.png`, `03-employee-namfon/payroll-390x844-en.png`. Thai (six tabs) just fits with ~8 px gaps; manager's five tabs are fine.
- Q2 Mid-word title break "บาริ/สต้า": panel header at 1440 (th, en) and profile header at 390 (`03-employee-bow/owner-390x844-th.png`). Thai text is being broken by character, not at a word boundary.
- Chip wraps: 3 lines with the panel open at 1440, 2 lines at 1024 (R1, per-size notes).
- Probation banner title at 390 wraps to two lines beside the button, with mixed date styles in one card ("29 พ.ย. 69" in the banner, "29 พ.ย. 2569" below). `03-employee-bow/owner-390x844-th.png`.
- LINE chip text wraps inside a pill ("ผูก LINE แล้ว · ผูกเมื่อ 18 / พ.ย. 2569") at every size. `03-employee-namfon/owner-1440x900-th.png`.
- No wrapped money (no money on these screens). No page-level horizontal scroll (walker HSCROLL-PAGE 0); the only scrollers are the declared tab strips at 390.

Gaps / alignment
- Unlabelled gap between "วันครบทดลองงาน" and "บันทึกเพิ่มเติม" (P13). Empty lifecycle card for the manager in edit mode. Panel card much shorter than the list (R2).
- Add card overlays filters and rows at ≥ 1024.

Touch targets at 390 (walker TAP-44, last run)
- "← พนักงานทั้งหมด" back link 358×20; edit-form inputs 158×41; schedule checkboxes 20×20 (label is the target, per builder); module tabs 36–38 px high (base). ⋯, → and the eye were not flagged. The walker's list looks capped per cell, so absence of a flag is weak evidence.
- The payroll viewer's row-end "→" is a faint 10 px glyph; easy to miss as the only way into a profile on a card. `02-employees/payroll-390x844-th.png`.

Thai on English pages
- Q3 **Edit form body is entirely Thai on en**: legends and every field label (ข้อมูลส่วนตัว, ชื่อ-นามสกุล, รหัสพนักงาน, เพศ, วันเกิด, การจ้างงาน, ที่อยู่ปัจจุบัน, ผู้ติดต่อกรณีฉุกเฉิน, 🔒 ข้อมูลอ่อนไหว + its help text, บันทึกเพิ่มเติม), select options (ไม่ระบุ, ประจำ (เต็มเวลา)). Only "Edit employee", "Home branch" and the footer are English. `03-employee-namfon-edit/{owner,manager}-1440x900-en.png`. Source: `EmployeeProfileForm.tsx:44-196` are hard-coded literals from base; the builder translated only the footer (`hr.people.form`). The file is in this ticket's scope and the edit view is this ticket's state; the walker did not surface it because its EN-THAI detail is cut after 8 tokens (all taken by the base module tabs).
- From base components shown on these screens: Thai month dates in the en probation banner ("Probation · ends 29 พ.ย. 69", "Started 31 ส.ค. 69"), in the en LINE chip ("Linked on 18 พ.ย. 2569") and in the en "To handle" tiles ("โบว์ · 29 พ.ย."). `03-employee-bow/owner-1024x768-en.png`, `03-employee-namfon/manager-branch-1440x900-en.png`, `02-employees/owner-1024x768-en.png`.
- Not this ticket: module tabs, sidebar, shell title "พนักงาน", unit names, names, departments, checklist item names (data).
- From `hr.people` itself: none seen in en.

Raw keys / raw errors: none in any picture. The only error text is the expected inline "PIN นี้ใช้ไม่ได้ กรุณาเลือก PIN อื่น" in `press/4-pin.png`.

## 5. Thai label renames vs the mockup (beyond the four already ruled)
Already ruled to revert: title "ทะเบียนพนักงาน", the count line, "สาขาประจำ", "เลือกสาขา". Others found (th `hr.people` + pictures):
1. Column "รหัส PIN" — mockup "PIN" (builder declared it, F16.4 reason).
2. Connections "PIN ลงเวลา" — mockup "PIN POS".
3. Connections link "ตั้ง/เปลี่ยน PIN" — mockup "เปลี่ยน PIN".
4. Footer "บันทึกข้อมูล" — mockup "บันทึก" (builder mentions the collision but does not list this rename).
5. Checklist title "รายการรับพนักงานใหม่" — mockup "Onboarding checklist" (comes from the lifecycle strings).
6. Department filter "ทุกแผนก" — mockup "แผนก".
7. ต้องจัดการ tiles "รับพนักงานใหม่ค้าง" / "ออกจากงานค้าง" and its sub-title — mockup "Onboarding ค้าง" / "Offboarding" / "สร้างการ์ดในบอร์ดงานให้อัตโนมัติ" (base component).
8. Banner button "ผ่านทดลองงาน" — mockup "ประเมิน" (base LifecycleBanner; the panel uses "ประเมิน").
9. Pager aria "หน้าที่ N" (builder declared; not visible).
New labels with no mockup counterpart (for information): "บัญชี LINE", "มีบัญชี", "ผูกบัญชีแล้ว", "ยังไม่มีบัญชี", "ค้นหา", "ชื่อพนักงาน", "ตำแหน่งงาน".
Reason given for 1 and 4 (and the four ruled ones) is an oracle text-collision rule (V9) and F16.4, i.e. the labels were bent to fit the checker.

## 6. Other things a careful owner would object to
- C1 The pictures were taken on a database still holding a press-test employee from an earlier round; the builder's note says press rows were removed. Counts on the page disagree with each other (header 9 + 5, tab 15).
- C2 Brief §9 fold criteria fail at every size (6 / 2 / 1 rows against 8 / 6 / 3) and the builder's notes do not mention it.
- C3 Brief §9 asked for `cov-02-*` / `cov-03-*` pictures; none exist in this folder. Walker ran with `--clicks none --no-refusals`.
- C4 The register shows the legal name in bold where the mockup shows the nickname (seed has name = nickname, so only the press row reveals it: `press/4-pin.png` shows "QCV5cPress mwl6q6aj" in the list while the profile header says "เพรส"). Unverified which the owner wants.
- C5 ก้อง's chip is "ทดลองงาน" with no day count while โบว์'s has one; presumably no probation end date, but it reads as inconsistent. `02-employees/owner-1440x900-th.png`.
- C6 On ≥ 1280 a name click opens the panel and the way to the full profile is the panel's bottom button or the ⋯ menu — two clicks to reach tabs. Matches the mockup's idea, mentioned for awareness.
- C7 Payroll viewers now have no route to the full numbers (oracle ruling 1→2 consequence) — already on the owner list; the pictures confirm it.

## 7. Findings ranked

**A — blocker**
- A1 Side-panel state at 1440 does not match the mockup and is visibly broken: 7 columns instead of 9, 3-line status chip, mid-word breaks in table and panel title, panel is a short card not a drawer, probation strip lacks the mockup's content, footer replaced (R1–R5). `02-employees-panel/owner-1440x900-{th,en}.png`.
- A2 Evidence gap: no picture of the ended tab/switch, the leave badge, the open ⋯ menu (walker), tabs documents / leave / pay / history, or any LR-viewer state. Acceptance on "pictures verified" cannot be given for those parts. (List in §3 and §1.)

**B — fix before accept**
- B1 Fold criteria of brief §9 fail at 1440 / 1024 / 390 (C2).
- B2 390 en profile tabs collide (Q1).
- B3 en edit form body is Thai (Q3).
- B4 Label renames beyond the four (§5 items 1–6; 7–8 need a ruling since they are base components).
- B5 Missing contract-end chip "สัญญาถึง <date>" (R8).
- B6 Probation banner: position above the tabs, button name differs between panel and profile, stats line missing (P1, P2, R4).
- B7 "แก้ไข" placement and the mid-word title breaks it causes (R3, P3, Q2).
- B8 1024: 2-line chips, mid-word break, en branch names on two lines (per-size notes).
- B9 ⋯ menu taller than the viewport with the delete button cut off (`press/4-pin.png`) — needs a proper picture set before judging further.
- B10 Re-shoot on a clean seed (C1).
- B11 Filter row: extra "ค้นหา" button, native department select, order (R10); header tail sentence (R9); type sub-line (R11); footer summary (R12).

**C — defer / rule**
- Panel footer and read-only checklist + missing board footnote (R5, R6, P8) — need an explicit ruling, then owner list.
- SSO hospital, account role / "ใช้ kiosk", multi-line address (P5, R13, P6).
- Module tab not highlighted on the profile (P14); title shown three times (R15).
- Thai dates on en pages from base components; LINE pill wrap; 12-hour time inputs; back-link 20 px target; edit-form 41 px inputs.
- Add card overlaying the filters; empty lifecycle card for the manager in edit mode; legend divider inconsistency; unlabelled note gap; faint "→" for payroll rows.
- ต้องจัดการ card wording/icon (R14); nickname vs legal name in the list (C4); ก้อง chip (C5).

## 8. Could not verify
- Anything interactive: hover, focus, the switch, pager, search results, department/branch filtering, delete confirm, restore, PIN success, document add/remove, checklist ticking, offboarding.
- States without pictures listed under A2 and §3.
- Whether sticky footer covers the last form fields at the true page bottom (full-page captures distort sticky elements).
- Whether the walker's PII scan of HTML/RSC is sound — I relied on its summary.
- r0/r1 pictures (overwritten); whether r2 regressed anything r1 had right.
- Real-data cases: long names, long position/department, employee with phone/e-mail/emergency contact/full address, more than 20 employees (pager), a person on leave today, an ended or removed person, a contract employee.
