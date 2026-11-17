# H5.1 visual review — round 4 (VIS-5a payroll run · VIS-5b HR hub)

Build `tmp/walk-vis5b` 594b109a4 (walk 2026-11-17 16:56–18:02Z, served on :3226, QC4). Reviewer read 298 fresh PNGs + live pages. No code changed.
Own evidence: `/tmp/claude-0/-root/59156a1f-9c0e-594d-9643-d1896f46b191/scratchpad/vis-r4/` (`shots/`, `crops/`, `cols/`, scripts `c1–c5 h1 h2 p1 p2 q1–q3 e1 .mjs`, `p1.out`, `hub-dom.json`).
Live login: 9 temporary QC sessions minted the walker's way (`scripts/qc4.sh`, user-agent `qc-walk-hr-r4review`), all 9 deleted at the end. Every non-GET request was blocked in the browser; buttons were pressed only with the page offline.

## Verdicts
- **VIS-5a payroll run page: FIX REQUIRED** — A1 (every run button crashes the page; older than VIS-5a but it is this screen), B1 (status column still cut with the drawer open at every width except 1440 Thai).
- **VIS-5b HR hub: ACCEPT WITH SMALL ITEMS** — cards = board, permissions fix correct, no dead link, requests entry present for every entitled viewer. One B (tab strip still clipped at 1024 on the payroll/report pages).

## A — blockers
**A1. Every button of the pay-run screen kills the page ("This page couldn't load · A server error occurred · Reload", English, on a Thai page).**
- Buttons proven: `hr-run2-approve` อนุมัติรอบนี้ (1440 + 390) · `hr-run2-rebuild` ดึงข้อมูลใหม่ · `hr-run2-sync` ดึงชั่วโมงทำงาน → … · `hr-run2-branch-*` ยืนยันชั่วโมง สาขา (owner, payroll-branch, manager-branch) · `hr-run2-pay` บันทึกว่าจ่ายแล้ว · `hr-run2-reverse` กลับรายการ · `hr-run2-create` สร้างรอบจ่าย. Pictures: `shots/c4-owner-approve-crash.png`, `shots/c4-owner-approve-crash-390.png`, `shots/c2-owner-ytdlink.png`.
- The crash happens in the browser before any request leaves (reproduced offline; no POST attempted; the error code shown = the digest in the server log). "Reload" then lands on the current month, not the run.
- Cause seen in `/root/projects/shark-hr-c/.qc-shots/acc-v2/server.log` on every render of the page: `Functions cannot be passed directly to Client Components … [function ag]` at `payroll/page.js`. In `src/app/app/sys/[id]/hr/payroll/page.tsx:76` the helper `back2` (a local function) is captured by all seven inline `"use server"` actions `run2Actions.*` (:78–:121). Control: `hr-we-build` (no `back2`) does send its request.
- Origin: commit 2af03994b9 (H3.4, 12 Nov) — on `session/hr`, not on `main`. Not introduced by VIS-5a, and VIS-5a's "layout only" rule did not allow fixing it. The seeds and qc suites call the actions directly, so nothing pressed these buttons through the screen before.
- Not verified: a POST was never let through, so I did not see what the server would answer; only this build (webpack flag) was tested.

## B — fix before accept
**B1 (5a). Status column is still cut off with the drawer open — fixed only at exactly 1440 px Thai.** Table wrapper is `overflow-hidden`; measured table vs wrapper: 1280 → 667 > 528 (status column gone) · 1366 → 667 > 614 ("ต้องตร") · 1536 → 850 > 784 ("ต้องต") · 1440 English → 717 > 688 (totals cell "Ready 2 · review 10" cut). Pictures `shots/p2-drawer-owner-1366-th.png`, `-1536-th.png`, `-1280-th.png`, `-1440-en.png`. The walker only shoots 1440/1024/390, which is why `11d-payroll-drawer/owner-1440x900-th.png` looks fine.
**B2 (5a). "กรอกยอดยกมา" link for the branch-limited payroll viewer opens an empty page** (`?view=ytd`, a view that viewer does not have: only the tab rows, no text) — `shots/q1-pb-ytd-deadend.png`. Owner/payroll: the link works (`shots/c4-owner-1440-ytd-real.png`).
**B3 (5b). HR tab strip still clipped at 1024 on every page except the hub** ("ตาราง" for ตารางกฎหมาย): `11a-payroll-open/owner-1024x768-th.png`, same on 11b, 11v-*, 13b, x1–x4 (walker HSCROLL-EL 757>696). The hub itself wraps correctly (`01-hub-rostered/owner-1024x768-th.png`). The brief gave the strip clipping to VIS-5b.

## C — defer (VIS-5e / later)
5a
- ISO labels remain in the files this ticket may not touch: 11v-adjust stock card "งวด 2026-11", "ลงนาม 2026-11-14" (`11v-payroll-view-adjust/owner-1440x900-th.png`, bottom) · 11v-hours "งวด 2026-06" · 11v-docs "งวด 2026-10 · จ่าย 2026-10-31" · 11v-ytd "ถึง 2026-05-31". Already listed for VIS-5e in HR-RESUME.
- "ทำงาน 0 วัน" on every row of every v2 run and "รายเดือน · 0 วัน" in the drawer (walk data has no work days in Jun–Oct 2026) — reads as "paid in full for 0 days".
- Native pickers in English on Thai pages: "November 2026", "September 2026" (13b), "mm/dd/yyyy" (x3 create block, adjust consent date).
- 1024: net tile "฿183,477.00" touches the tile edge; title wraps to two lines beside three header buttons; stepper sub-label ends in "…" (`11a-payroll-open/owner-1024x768-th.png`).
- Reason "เข้า/ออกกลางเดือน (÷30)" breaks one word per line (5 lines) in the narrow หัก cell with the drawer open.
- Banner says "ต้องตรวจ 10 รายการก่อนอนุมัติ" while the item is "เตือนเท่านั้น" and approve is enabled; the link that fixes it sits inside the collapsed box at the bottom.
- Owner sees "คุณไม่มีสิทธิ์ดูคลังสินค้า" in the stock card; มิ้นท์ −฿150 listed in both cards (as round 3).
- 390 run view is 3,036 px (brief target ≤ 3,000) — `11a-payroll-open/owner-390x844-th.png`.
- All-branch manager sees only "รายละเอียดของรอบนี้ไม่เปิดให้บัญชีของคุณ", branch manager sees the minutes table + confirm button (unchanged rule; looks odd side by side).
- vs mockup, not built by ruling: every amount has "฿" + ".00"; three header buttons instead of two; no per-line source in the drawer.
5b
- Round-3 leftovers unchanged: shift-bar text clipped "…· เข้" · due titles truncated · select-all label "ยังไม่ได้เลือก" · "ลงเวลาจาก —" · labour card is "today" (ขายแล้ว 00:19) on the 13 Nov page.
- Blank left column under the labour card is now on three viewers: payroll-branch ~700 px, payroll ~800 px, payrollSelf ~900 px (`01-hub/payroll-1440x900-th.png`, `cov-01-hub/payrollSelf-1440x900-th.png`).
- Board legend: red outline is labelled "ยังไม่มา" but is used for the late row (น้ำฝน).
- Limited note printed twice in the payroll-branch labour card.
- Plain member: page with one tab "ภาพรวม" and nothing else (`cov-01-hub/member-1440x900-th.png`).

## A. VIS-5a — round 3 items
| Item | Result | Evidence |
|---|---|---|
| "ต้องตรวจ" box + pull-hours button only on drafts | fixed — x1 none; x3 none in header, pull button inside the "สร้างรอบจ่ายใหม่" block | `x1-payroll-approved/owner-1440x900-th.png`, `x3-payroll-reversed/owner-1440x900-th.png` (+1024/390) |
| Status column at 1024 | fixed | `11a-payroll-open/owner-1024x768-th.png` |
| Status column with drawer open | fixed at 1440 Thai only → B1 | above |
| No ISO in 11v-adjust | partly — adjust list Thai ("งวด มิ.ย. 2569"); stock card still ISO (deferred file) | `11v-payroll-view-adjust/owner-1440x900-th.png` |
| Thai signing date | fixed in the adjust list chip ("ลงนาม 14 พ.ย. 2569"); stock card still "2026-11-14" | same |
| No empty gap for payroll-branch | fixed | `x2-payroll-paid/payroll-branch-1440x900-th.png` |
| เพิ่ม/OT rule | visible and correct. 1440: ล่วงเวลา ฿600.00, เพิ่ม ฿0.00, 16,000 + 600 − 800 = 15,800. 1024 / drawer open (OT column hidden): เพิ่ม ฿600.00 + "รวม OT". Totals 191,344 + 600 − 8,467 = 183,477; branch viewer 145,600 + 600 − 6,530 = 139,670 (9 rows) | `11a-payroll-open/owner-1440x900-th.png`, `owner-1024x768-th.png`, `payroll-branch-1440x900-th.png`, `11d-payroll-drawer/owner-1440x900-th.png` |
- Money wrapping: none. Page horizontal scroll: none. Checked live on 103 cells (11a five viewers × 1440/1280/1024/390 × th/en, 11d, x1–x4, six sub-views, 13b) — `p1.out`. Clipping: only B1 and B3.
- Roles: payroll-branch sees 9 in-scope rows + "ไม่รวมพนักงานที่คุณไม่มีสิทธิ์ดูค่าจ้าง 3 คน" on every run; เจ/ปุ้ย/ก้อย appear in no run, sub-view or 13b; drawer for an out-of-scope id does not open. Managers: no ฿ on any payroll view, no drawer, 13b shows no money. One remark: the stock-card employee picker for payroll-branch lists เจ (borrowed to the branch, name only).
- 13b: status in Thai, engine column hidden (`13b-report-payroll/owner-1440x900-th.png`). x4: blue older-engine banner, arithmetic holds.

## B. VIS-5b
- Rostered day (13 Nov): อยู่กะ 9 · มาแล้ว 9 · สาย 1 (น้ำฝน 18 นาที · เข้า 07:18) · ยังไม่มา 0 · ลา 0; board 9 rows, one red "สาย 18 นาที" — `01-hub-rostered/owner-1440x900-th.png`, `owner-1024x768-th.png`, `owner-390x844-th.png`; branch manager identical for สาขาหัวหิน (`01-hub-rostered-branch/manager-branch-1440x900-th.png`). Layout follows mockup 01 within the rulings.
- Permissions: payroll and payroll-branch have no "ลงเวลา" tab and no "ลงเวลา" card; both keep "สรุปเดือนนี้" with numbers (สาย 1 · ขาด 1 · OT 0 ชม. รอ 1 · ลา 2 วัน); its only link is "รายงาน" — `01-hub/payroll-1440x900-th.png`, `01-hub-rostered-branch/payroll-branch-1440x900-th.png`. Owner / manager / branch manager / staff / payrollSelf keep the card. Every link on every viewer's hub answers 200 (`h2.mjs`).
- **Requests link.** The pinned "before" set is the hub before the redesign (base ea2b41ea1): tab "คำขอ" + tile `hr-overview-inbox` + text link "ดูทั้งหมด" under the preview. The redesign merged the tile and the text link into one header link `hr-overview-inbox` "ดูทั้งหมด" on the approvals card. Now every viewer who can open `/hr/requests` (owner, manager, manager-branch, payroll, payroll-branch, payrollSelf — all 200) has two entries: the tab and that header link, plus "เปิดดูก่อนตัดสิน" on pay-item cards. Staff, kiosk, member get 404 on the page and have no link. Nothing is lost.

## C. Walker failures
- **5 × CLICK-ERROR (`hr-run2-ytd-link`)** — one cause for all five (11a O / P / PB, 11d O, 11d-pb PB, 1440 th). The link now sits inside the collapsed "ต้องตรวจ N รายการ" box; the walker clicks its hidden position and actually presses "ยืนยันชั่วโมง สาขา…", which crashes (A1). So: walker/selector problem for the link (the link itself works when the box is open), and a real defect in what it hit. At 390 the same click lands on the accounting note, hence no error there. Walker should open the box first.
- **110 × EN-THAI** — same kind as round 3 (hard-coded Thai, shift names, Thai dates). Worst three on these screens: (1) the whole HR tab strip + page title on every English page ("ภาพรวม · ลงเวลา · … · ตารางกฎหมาย", "ระบบพนักงาน HR"); (2) hub bottom link cards fully Thai ("เข้า/ออกงาน + ประวัติ", "2 รออนุมัติ", "14 คน") and "Period พ.ย. 2569" / "Filed 14 พ.ย. 69" / shift names; (3) payroll adjust view almost entirely Thai ("OT · คอมมิชชั่น · หักเงิน", "+ ยื่นรายการ", อนุมัติ / ไม่อนุมัติ). The English run view itself is clean apart from the strip, names and branch names.

## Not verified
- What the server does when a run button's request is actually sent (never sent); whether a non-webpack build behaves the same.
- "ทำงาน" (worked days) column with a real number — every run shows 0.
- Month-card "ควรคุยรายคน" rows as plain text for payroll viewers / as calendar links for owner: no one meets the threshold in the walk data ("ยังไม่มีใครเข้าเกณฑ์"); only the code condition was read.
- Whether the month card is narrowed to the branch for branch-limited viewers: all events in the data belong to สาขาหัวหิน, so the numbers equal the owner's either way.
- 11b / docs / ytd / history / profiles / hours were checked at reduced size for layout only, not line by line.
