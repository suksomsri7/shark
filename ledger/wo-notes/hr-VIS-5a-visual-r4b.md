# VIS-5a payroll run page — visual check of the round-4 fixes (r4b)

17 Nov 2026 · read-only reviewer · no code changed, nothing committed.
Looked at: all 16 `drawer-*.png`, all 39 `press-*.png` (16 date-loop pictures as one contact sheet), `press.jsonl`, `server.log`, the walker's full-page shots under `/root/qc/hr-vis5a-r4/walk-11d-payroll-drawer*/`, mockup `/root/projects/shark-hr-l3/ledger/design-hr/06-payroll-run.png` (+ `.body.html`), review r4, builder note. Evidence folder = `/root/qc/hr-vis5a-r4/` unless a full path is given. Own crops/sheets: `/tmp/claude-0/-root/59156a1f-9c0e-594d-9643-d1896f46b191/scratchpad/r4b/` (`s1.png` `s2.png` `s3.png`, `o1280-*.png`, `o1366-bot.png`, `pb1440-bot.png`).
No live page was opened; everything below is from pictures, logs and two greps of `payroll-run-ui.tsx`.

## Verdict: ACCEPT WITH SMALL ITEMS
The three things round 4 asked for hold in the evidence: no clipped status column (B1), no crash on any button (A1), ytd link gated (B2 — by suite only, no picture). Open items are B-level and need a controller/owner ruling rather than a rebuild before merge: the open-drawer table is not the mockup's arrangement (B-1), the clip can come back with bigger numbers (B-2), B2 has no picture (B-3).

## 1. B1 — status column with the drawer open
**Pass on what was asked, 16/16 pictures.** Status column fully visible, no cell cut at the frame, no horizontal scroll, every money value on one line.

| width | owner th / en | payroll-branch th / en | columns |
|---|---|---|---|
| 1280 | ok / ok | ok / ok | 5: name · add · deduct · net · status |
| 1366 | ok / ok | ok / ok | 5 |
| 1440 | ok / ok | ok / ok | 7: + base pay · SSO |
| 1536 | ok / ok | ok / ok | 7 |

- Totals row seen complete in: all 8 payroll-branch pictures; owner 1440 th/en, 1536 th (`drawer-owner-1440-th.png`, `-1440-en.png`, `-1536-th.png`); owner 1280/1366 th only in the walker's full-page shots (`walk-11d-payroll-drawer-widths/11d-payroll-drawer-widths/owner-1280x800-th.png`, `owner-1366x768-th.png`). **Not seen:** owner totals row at 1280 en, 1366 en (below the fold in `drawer-owner-1280-en.png`, `-1366-en.png`), and 1536 en is half cut by the viewport (`drawer-owner-1536-en.png`). The builder's own measurement says 16/16; I could not confirm those three by eye.
- Wrapping that does occur (text, not money): totals label "รวม 12 คน" / "Total 12 people" on two lines and totals status "พร้อม 2 · ตรวจ 10" on two lines (owner 1280 th, 1440 th/en, 1536 en; payroll-branch 1440 en). Sub-label "ค่าล่วงเวลา (คำขอ OT)" on 2–3 lines in the add cell (1280 th, 1440 th/en, 1536 en). "เข้า/ออกกลางเดือน (÷30)" now 2 lines (was 5).

**Against the mockup (open-drawer state).** Mockup 06 shows the drawer open with all 10 columns: พนักงาน · ค่าจ้างฐาน · ทำงาน · OT · เพิ่ม · หัก · ปสส. · ภงด.1 · สุทธิ · สถานะ, sub-labels under cells, and the review reason under the status chip. The build shows 5 columns at 1280/1366 and 7 at 1440/1536; the 10-column set needs a table frame ≥ 940 px, i.e. a window of roughly 1,700 px or more — none of the four tested widths reaches it and there is no picture of it. Why it cannot match: the mockup has a 56 px icon rail and prints "16,000"; the app has a 288 px side menu and prints "฿16,000.00" (the latter two already declared in r4 C). Other differences in this state: drawer is a 400 px card that ends at about y 640 with white space under it (mockup: 430 px full-height panel with footer buttons pinned at the bottom); no per-line formula text (owner list, not built).

**Information lost while the drawer is open**
- OT vs other additions: still distinguishable on the น้ำฝน row — "฿600.00 · รวม OT · ค่าล่วงเวลา (คำขอ OT)" in every picture, and the drawer lists "ค่าล่วงเวลา (คำขอ OT) ฿600.00". A row with OT **and** another addition would show one sum with labels and no split; the walk data has no such row, so not seen.
- 5-column set (1280, 1366): base pay and SSO are gone, so a row no longer adds up on screen: น้ำฝน "เพิ่ม ฿600.00 · หัก ฿0.00 · สุทธิ ฿15,800.00"; พี่เก่ง "฿0.00 · ฿0.00 · ฿31,125.00"; totals "฿600.00 · ฿0.00 · ฿183,032.00". "หัก ฿0.00" beside a net that is ฿800 lower than pay reads as wrong unless the reader knows SSO is a separate hidden column. Ruling r3 says row arithmetic must hold; here it holds only for the selected person, in the drawer.
- All widths: worked days, OT column, ภงด.1 hidden. ภงด.1 is ฿0 for everyone in this data, so a non-zero tax row hidden from the table was not seen.
- Review reason under the status chip ("ยังไม่กรอกยอดยกมา", visible with the drawer closed — `press-sync.png`) disappears when the drawer opens; the 10 red chips give no reason unless each row is opened. The mockup keeps the reason with the drawer open.

**5 → 7 columns between 1366 and 1440.** Mechanically sound: frame 614 px at 1366 vs 629 px needed for 7 columns (owner th). The result is a 1366 table with wide empty gaps (about 150 px between เพิ่ม and หัก in `drawer-owner-1366-th.png`) while missing the two columns that make the row add up; the payroll-branch table would fit 7 columns at 1366 (524 px needed) but uses the same threshold. 1366 is the most common laptop width, so most owners get the 5-column version.

## 2. A1 — buttons really pressed
No error page in any of the 39 pictures; `server.log` has no "Functions cannot be passed" and no digest line.

| picture | lands on | message shown | read |
|---|---|---|---|
| `press-rebuild.png` | Jun draft | บันทึกแล้ว | ok |
| `press-sync.png` | Jun draft | red "ยังไม่ได้เปิดกฎหักสาย/ขาด — เจ้าของร้านเปิดได้ที่หน้าตั้งค่า HR" | expected refusal (rule off in the shop). The success path "synced" was never pressed |
| `press-confirm-branch.png` | Jun draft | บันทึกแล้ว | ok |
| `press-approve.png` | Jun, step 4 จ่าย, chips อนุมัติแล้ว | อนุมัติแล้ว | ok |
| `press-pay2.png` | Aug, step 5, "จ่ายแล้ว · กำหนดจ่าย 31 ส.ค. 2569" | บันทึกแล้ว | ok |
| `press-reverse.png` | Jun approved | red "มีรอบจ่ายงวดหลังที่อนุมัติหรือจ่ายแล้ว — กลับรายการรอบงวดหลังสุดก่อน…" | expected refusal |
| `press-reverse-latest.png` | Sep, red banner "กลับรายการแล้ว — รอบนี้ดูได้อย่างเดียว…" | บันทึกแล้ว | ok |
| `press-create2.png` | new Jul draft | สร้างรอบจ่ายแล้ว | ok |
| `press-corr-decide.png`, `press-corr-decide3.png` | corrections list | อนุมัติคำขอแก้เวลาแล้ว | ok |
| `press-corr-request-2026-11-09-IN.png`, `press-corr-for-2026-11-08.png` | calendar | ส่งคำขอแก้เวลาแล้ว | ok |
| `press-corr-cancel.png` | corrections list, chip ยกเลิก | ยกเลิกคำขอแก้เวลาแล้ว | ok |
| `press-corr-request.png` | calendar | red "เวลาที่ขอต้องไม่เกินเวลาปัจจุบัน" | refusal, normal page |
| `press-corr-request2.png` + 15 of the 16 dated pictures (`…-2026-11-09-OUT` … `…-11-16-OUT`) | calendar | red "ลำดับเข้า–พัก–ออกงานไม่ถูกต้องหลังแก้ — ตรวจชนิดและเวลาอีกครั้ง" | refusal, normal page (sheet `s3.png`) |

**Pictures with ERR in the name — both are probe problems, not product defects, as far as the evidence goes:**
- `press-pay-ERR.png` — `press.jsonl`: `"error":"Node is either not clickable or not an Element"`, no request, no landing URL. The picture is the untouched Aug approved run at the top of the page (no message). The click never happened. The same selector worked on the second try (`pay2` → `r2=done`, `press-pay2.png`). Why the first click failed (button off-screen / not yet laid out) is not recorded.
- `press-corr-decide2-ERR.png` — `"error":"button not found [data-testid^=\"hr-corr-approve-\"]"`. The picture is the corrections list with one request already "อนุมัติแล้ว" and nothing pending: the request meant to feed this step (`corr-request2`) had just been refused (`c.order`), so there was no approve button to press. Sequencing of the probe.

**One more that is not named ERR but did not succeed:** `press-create.png` — `press.jsonl`: `"navErr":"Navigation timeout of 180000 ms exceeded","posted":null,"flash":null`. The picture shows the reversed Jul run's table, no message. No request left the browser in 3 minutes. Most likely the required pay-date field was empty and the browser held the form (the walker reports the same button as "inconclusive, empty required payDate"; `create2` then succeeded with "กำหนดจ่าย 28 ก.ค. 2569"), but the picture does not show the form, so this is an inference.

## 3. B2 — "กรอกยอดยกมา" link rule
**Not shown in any picture.** In every drawer and press picture the "ต้องตรวจ N รายการ" box is collapsed, and the link lives inside it. What the pictures do show: the same plain-text hint in the drawer for both viewers (`drawer-owner-1440-th.png` and `drawer-payroll-branch-1440-th.png`: "ยังไม่กรอกยอดยกมาต้นปี (เตือนเท่านั้น — กรอกหรือกด "ไม่มีรายได้ก่อนใช้ระบบ")"), with no link for either.
Non-picture evidence: suite check Y1 green in `vis5a-3.txt` (owner + all-branch payroll get the link to a non-empty view; branch payroll gets text, no link); code line `payroll-run-ui.tsx:466` renders the link only when `filingOk`. No before/after browser picture of the opened box exists for either viewer.

## 4. Findings

### A — blockers
None.

### B — rule or fix before the owner sees it
- **B-1. Open-drawer table is not the mockup's table at any tested width, and at 1280/1366 the rows do not add up on screen.** Mockup: 10 columns with the drawer open. Build: 5 (1280, 1366) or 7 (1440, 1536). In the 5-column set "หัก ฿0.00" sits beside a net reduced by hidden SSO. Evidence: `drawer-owner-1280-th.png`, `drawer-owner-1366-th.png`, `drawer-payroll-branch-1366-en.png` vs `design-hr/06-payroll-run.png`. Needs a ruling: accept as a declared exception, or change the narrow set (e.g. keep ปสส. or fold it into หัก with a hint, as "รวม OT" does for additions).
- **B-2. The clip can return with larger amounts.** The frame is still `overflow-hidden` with no scroll fallback (`payroll-run-ui.tsx:160`, `:304`), and the 680/940 thresholds were taken from this walk data (largest value ฿190,876.00; 7 columns need 654 px en inside a 688 px frame at 1440 — 34 px spare). A shop with six-figure salaries or a seven-figure total widens three or four columns at once. Not tested with such data; derived from the code and the builder's own numbers.
- **B-3. B2 has no picture.** See section 3. One pair of shots with the review box open (owner: link; payroll-branch: text) would close it.
- **B-4. Review reason vanishes when the drawer opens.** Closed: chip + "ยังไม่กรอกยอดยกมา" (`press-sync.png`). Open: chip only, 10 red chips with no reason (`drawer-owner-1440-th.png`); the mockup keeps the reason line.

### C — small / later
- Drawer hint tells the branch payroll viewer to "กรอกหรือกด "ไม่มีรายได้ก่อนใช้ระบบ"" — an action that viewer has no page for (`drawer-payroll-branch-1280-th.png`). Same sentence for the owner, without a link.
- After a button press the page jumps to the run block: the title "รอบจ่าย …" is scrolled under the top bar and the success message is one line of small grey text with no box ("อนุมัติแล้ว", "บันทึกแล้ว" — `press-approve.png`, `press-pay2.png`); refusals are red and clear. The attendance page puts the same kind of message in a bordered box (`press-corr-decide.png`). Easy to miss after approving a payroll.
- Pay and reverse both answer the generic "บันทึกแล้ว" (`press-pay2.png`, `press-reverse-latest.png`).
- New run: "ร่าง · ต้องตรวจ 0 รายการก่อนอนุมัติ" and stepper "ต้องตรวจ 0" (`press-create2.png`).
- English drawer title wraps to two lines at every width ("น้ำฝน · where every line comes / from" — `drawer-owner-1536-en.png`).
- Drawer card ends mid-page with empty space below while the table continues (`drawer-owner-1366-th.png`); mockup is a full-height panel.
- Closed-drawer 10-column table at 1440: uneven spacing, a wide empty band between เพิ่ม and หัก (`press-approve.png`).
- Still there from r4: "รายเดือน · 0 วัน" in the drawer and "0 วัน" in every row; "฿" + ".00" everywhere.
- Sep reversed run shows satang fractions "฿196,622.33" (`press-reverse-latest.png`) — data, noted only.

## Not verified
- B2 in a browser (no picture of the open review box for any viewer).
- The 10-column open-drawer layout (frame ≥ 940 px): no picture at a width that reaches it.
- Owner totals row at 1280 en and 1366 en; 1536 en only half visible.
- Behaviour with large amounts, a non-zero ภงด.1, a commission row, or OT plus another addition on one row.
- Success path of "ดึงชั่วโมงทำงาน" (`synced`) — only the refusal was pressed.
- Why the first `pay` click failed and why the first `create` never submitted — inferred, not shown.
- Whether the 15 "ลำดับเข้า–พัก–ออกงานไม่ถูกต้อง" refusals are the right answer for those dates; they are normal pages, the rule itself was not checked.
- 1024 and 390 with the drawer open were not part of this evidence set and not reviewed.
- The lane tip is now `ae198cc77` (a merge after the builder's `18dd3f30e`); the pictures were taken 19:51–20:04, I did not check which commit the served build was.
