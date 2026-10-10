# POS P1.18 R15 — P1 phase-close parity sheet (draft for the controller)

Drafter: account B · read-only · 9 Oct 2026 ~23:5xZ. Build56 = `session/pos` b694aea0 (tree d, port 3228). Shots: `/root/projects/shark-pos-d/.qc-shots/pos/p1close/` (th · owner + cashier · 1440×900 / 1024×768 / 390×844) and `…/p1close-en/` (en · owner · 1440 only). Run logs: `/root/pos-runs/vis56-all-20261009T223547Z/` (SUMMARY: every page rc 0 except `shifts-owner-th` / `shifts-owner-en` rc 1 = the 9 + 3 owner shifts states). Mockups: `ledger/design-pos/NN-*.png` + `.body.html`.

Method: every shot named in the rows was opened (1440 th, 390 th, 1440 en for every frame with a shot; 1024 th for each frame family; cashier variants where the page differs). Paths in the table are relative to `/root/projects/shark-pos-d/.qc-shots/pos/`. Statuses: **MATCH** = no unexplained difference · **DEVIATION** = every difference has a prior ruling (ref given) · **OPEN** = an unruled difference or a missing shot (→ item O# at the end). Rows: 6 per frame (3 sizes × th/en); phone frames 05ก/ข/ค and 21A have 390 rows only, 20A is the iPad frame (1024 rows), 20B is the English frame (en rows only). 19 = P1 states ก ค ง จ ฉ (ข online orders is P2). Data-only differences (QC shop/staff/device names, Thai product names in en, ฿ amounts, only one category) are not deviations.

Global facts checked on the shots: ฿ with thousands separators and `.00` only where the page shows decimals (reports avg ฿200.07, bills ฿199.92); th dates Buddhist era (10 ต.ค. 2569), en dates "10 Oct 2026"; no `pos.*` key and no Thai *POS* string in any en shot (Thai left in en = app shell + data, see O3); no overflow / console error in any POS page except the cashier `products` page (see Other screens).

## Summary

| frame | MATCH | DEVIATION | OPEN | rows |
|---|---|---|---|---|
| 01 | 0 | 2 | 4 | 6 |
| 02 | 0 | 6 | 0 | 6 |
| 02b | 0 | 4 | 2 | 6 |
| 05ก | 0 | 2 | 0 | 2 |
| 05ข | 0 | 2 | 0 | 2 |
| 05ค | 0 | 2 | 0 | 2 |
| 07 | 0 | 2 | 4 | 6 |
| 08 | 0 | 6 | 0 | 6 |
| 10 | 0 | 5 | 1 | 6 |
| 11B | 0 | 6 | 0 | 6 |
| 11C | 0 | 0 | 6 | 6 |
| 12 | 0 | 6 | 0 | 6 |
| 13A | 0 | 6 | 0 | 6 |
| 13B | 0 | 5 | 1 | 6 |
| 14A | 0 | 6 | 0 | 6 |
| 14B | 0 | 0 | 6 | 6 |
| 15A | 0 | 6 | 0 | 6 |
| 16 | 0 | 6 | 0 | 6 |
| 17A | 0 | 2 | 4 | 6 |
| 17B | 0 | 2 | 4 | 6 |
| 17C | 0 | 6 | 0 | 6 |
| 19ก | 0 | 2 | 4 | 6 |
| 19ค | 0 | 0 | 6 | 6 |
| 19ง | 0 | 6 | 0 | 6 |
| 19จ | 0 | 6 | 0 | 6 |
| 19ฉ | 4 | 2 | 0 | 6 |
| 20A | 0 | 0 | 2 | 2 |
| 20B | 0 | 1 | 2 | 3 |
| 21A | 0 | 0 | 2 | 2 |
| 21B | 0 | 6 | 0 | 6 |
| **total** | **4** | **105** | **48** | **157** |
## Rows

| frame | state/shot path | size | locale | status | note |
|---|---|---|---|---|---|
| 01 | p1close/register-cart4-01-owner-1440x900.png (+ default, cart3, options-popover, line-editor, bill-discount, custom-item, search-empty, weigh) | 1440 | th | OPEN → O1, O2 | Layout, cart density, popover (anchored, 44 px chips = P1.2U R2-1), line editor, totals, ฿ format match 01. Differs: mode tab "รายงาน" still "เร็ว ๆ นี้" though /pos/reports is live (O1); bill-discount dialog coupon row "โค้ดคูปอง · เร็ว ๆ นี้" while coupons work (WELCOME50 on member-attached) (O2). Categories only "ทั้งหมด" = QC seed data. Cashier = same screen, no differences besides caps. |
| 01 | p1close/register-cart4-01-owner-1024x768.png (+ states) | 1024 | th | OPEN → O1, O2 | Tablet layout = 20A grammar (icon tabs). Same O1/O2. |
| 01 | p1close/register-default-owner-390x844.png · register-mobile-sheet-owner-390x844.png · register-bill-discount-cashier-390x844.png | 390 | th | OPEN → O2 | Phone = 05ก (rows below). Picker = bottom sheet at 390 (P1.2U R2-1). Bill-discount sheet shows the stale "เร็ว ๆ นี้" coupon chip (O2). |
| 01 | p1close-en/register-cart4-01-owner-1440x900-en.png (+ options-popover, bill-discount, line-editor -en) | 1440 | en | OPEN → O1, O3 | Real English in POS strings; no `pos.xxx` keys. "Reports · Soon" tab (O1). App-shell sidebar/header Thai (หน้าหลัก, ระบบทั้งหมด, แจ้งปัญหาการใช้งาน) (O3). Product/unit/staff names = data. |
| 01 | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 01 | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 02 | p1close/register-paydlg-member-points-owner-1440x900.png (+ paydlg-cash, -promptpay-qr, -promptpay-paid, -card-edc, -member-capped) | 1440 | th | DEVIATION (ref pos-P1.12U.md Deviations 8 · pos-P1.6U.md V5 · pos-P1.13U.md Deviations 4 · pos-P1.7U.md Deviations 8) | Amount ฿ big, breakdown line, points card "10 แต้ม = ฿1" / ✓ ใช้แล้ว, ใส่คูปอง row, 4 live tiles + 4 greyed "เร็ว ๆ นี้", numpad, QR panel compact (P1.7U addendum), tax-invoice + tip rows. Receipt-channel footer of 02 absent (ruled V5/13U-4). |
| 02 | p1close/register-paydlg-promptpay-qr-owner-1024x768.png · register-paydlg-member-points-owner-1024x768.png | 1024 | th | DEVIATION (ref pos-P1.12U.md Deviations 8 · pos-P1.6U.md V5 · pos-P1.13U.md Deviations 4 · pos-P1.7U.md Deviations 8) | Fits 768 height; keys ≥ 44 px; no clipping. |
| 02 | p1close/register-paydlg-cash-owner-390x844.png (+ member-points, promptpay-qr/paid, member-capped 390) | 390 | th | DEVIATION (ref pos-P1.12U.md Deviations 8 · pos-P1.6U.md V5 · pos-P1.13U.md Deviations 4 · pos-P1.7U.md Deviations 8) | Phone = 05ข; full-screen sheet, numpad reachable. |
| 02 | p1close-en/register-paydlg-member-points-owner-1440x900-en.png (+ promptpay-qr, member-capped -en) | 1440 | en | DEVIATION (ref pos-P1.12U.md Deviations 8 · pos-P1.6U.md V5 · pos-P1.13U.md Deviations 4 · pos-P1.7U.md Deviations 8) | English throughout ("Use points as a discount", "Coming soon"); capped note in English; no keys leaking. |
| 02 | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 02 | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 02b | p1close/register-sale-done-owner-1440x900.png · register-sale-done-member-owner-1440x900.png · settings-paydone-print-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.6U.md R3 V7 · pos-brief-P1.18.md Q9 "out: 02/02b parity" · pos-P1.10U.md Deviations 16 · pos-P1.11U.md Round 2 · pos-P1.6U.md Q2) | Check mark, "ชำระแล้ว ฿190", cells เงินทอน · (แต้มที่ได้รับ) · เลขใบเสร็จ · วิธีชำระ; buttons พิมพ์ใบเสร็จ · พิมพ์สำเนา · ส่งทาง LINE (disabled w/o member) · ส่งอีเมล · ขายต่อ (auto 5 s only when change 0). ABB no. / accounting status / receipt QR not shown (ruled). |
| 02b | no shot — harness shoots sale-done / paydone-print at 1440 only | 1024 | th | OPEN → O9 | Missing shot (P1.12U §Visual / P1.10U plan: 1440 only). |
| 02b | no shot — as above | 390 | th | OPEN → O9 | Missing shot. |
| 02b | p1close-en/register-sale-done-member-owner-1440x900-en.png · register-sale-done-owner-1440x900-en.png | 1440 | en | DEVIATION (as 1440 th) | English cells ("Points earned", "Receipt no."); no Thai UI text. |
| 02b | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 02b | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 05ก | p1close/register-default-owner-390x844.png · register-mobile-sheet-owner-390x844.png · register-cart3-owner-390x844.png | 390 | th | DEVIATION (ref pos-P1.18U.md Deviations 1 · pos-P1.2U.md R2-1) | Header chips (unit · shift · camera · lock), search + "+", 3-col grid, sticky cart bar "N รายการ ฿x · ชำระ ›", cart as bottom sheet = 05ก. No TH/EN switch at 390 (ruled). |
| 05ก | p1close/register-register-en-owner-390x844.png | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 1) | English UI ("Search name / SKU or scan", "No items yet", "Pay ฿0"). Owner unit chip renders as a bare "⌄" (name truncated to nothing) — cosmetic, noted under O1 batch. |
| 05ข | p1close/register-paydlg-cash-owner-390x844.png · register-paydlg-member-points-owner-390x844.png · register-paydlg-promptpay-qr-owner-390x844.png | 390 | th | DEVIATION (ref pos-P1.12U.md Deviations 8 · pos-P1.6U.md V5 · pos-P1.13U.md Deviations 4 · pos-P1.7U.md Deviations 8) | Full-screen pay sheet as 05ข; numpad + confirm reachable; QR panel fits. |
| 05ข | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en 1440 only. |
| 05ค | p1close/stock-count-open-owner-390x844.png · stock-count-confirm-owner-390x844.png | 390 | th | DEVIATION (ref pos-P1.14U.md Deviations 6, 8, R2 R3) | Count screen: progress pill, scan field, chips ทั้งหมด/ยังไม่นับ/มีผลต่าง, rows with system qty + −/+ , sticky bar with add-back note (R3). App shell kept above (dev 8). Cashier = refusal card (expected). |
| 05ค | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en 1440 only. |
| 07 | p1close/shifts-current/close/z-owner-1440x900.png | 1440 | th | DEVIATION (vis58b @711b6d5e on QC5 · controller eyeballed 10 Oct 01:1xZ) — structure = 07: shift card + X summary (5 KPIs) · by-payment table with money status · cash-should-be formula strip + cash-in rows · close/count grid ฿1000–฿10 + coins · expected/counted/difference (red) · reason (required > ฿100) · "ปิดกะและออกรายงาน Z" + X report + blind toggle · right column Z list (diff −฿15 + "มีเหตุผล" chip as 07 Z#9) · off-shift cash alert ฿390 + bill times · this-device card. Z state = "รายงาน Z (ปิดกะ)" table + "เปิดกะใหม่/ปิดรายงาน" (07 has no Z state frame). Deviations: (1) app shell/top bar instead of 07 shell (O3/O10 accepted); (2) no "เปิดลิ้นชัก" header button (drawer kick lives in device/print settings — P1.9U); (3) "ส่งสรุปกะ" card = text "ส่งสรุปกะทาง LINE จะมาในรอบถัดไป" (P2/P3); (4) "ดู X report" vs 07 "พิมพ์ X report" (print via print page). 1024 = single column (close card below Z/device cards) · 390 = stacked, denominations one per row. en complete. Cashier shifts-* = refusal card for all states (P1.9U conflict 1 — expected). |
| 07 | p1close/shifts-current/close/z-owner-1024x768.png | 1024 | th | DEVIATION (vis58b) | As above — single column, close card after the Z/device cards. |
| 07 | p1close/shifts-current/close/z-owner-390x844.png | 390 | th | DEVIATION (vis58b) | As above — stacked; denominations one per row; KPIs 2 per row. |
| 07 | p1close-en/shifts-current/close/z-owner-1440x900-en.png | 1440 | en | DEVIATION (vis58b) | As above — en strings complete ("Shifts & cash drawer", "Mid-shift summary (X)", "Close shift and issue Z report", "Off-shift cash today", "Has reason"). |
| 07 | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 07 | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 08 | p1close/reports-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-brief-P1.17U-R4-PARITY.md §3 · pos-P1.17U-R4.md R5/R6/R7 + Follow-ups F1/F2) | Header (title · range · branch · info line · ส่งออก CSV), kind pills, 5 KPI (ยอดขายสุทธิ ▼43% · บิล · เฉลี่ยต่อบิล · กำไรขั้นต้น · บิลยกเลิก), 14-day chart (last bar black, values on max/last), เปรียบเทียบสาขา (selected highlight, รวมทุกสาขา), สินค้าขายดี, วิธีชำระ bars, พนักงาน. Hourly / channels / members KPI / AI / PDF left out (ruled). Cashier = refusal line "บัญชีนี้ยังไม่มีสิทธิ์ดูรายงาน". |
| 08 | p1close/reports-owner-1024x768.png | 1024 | th | DEVIATION (ref pos-brief-P1.17U-R4-PARITY.md §3 · pos-P1.17U-R4.md R5/R6/R7 + Follow-ups F1/F2) | KPI 3+2, branch table below chart; no overflow. |
| 08 | p1close/reports-owner-390x844.png | 390 | th | DEVIATION (ref pos-brief-P1.17U-R4-PARITY.md §3 · pos-P1.17U-R4.md R5/R6/R7 + Follow-ups F1/F2) | KPI 1 col, pills scroll, chart labels first/middle/last. |
| 08 | p1close-en/reports-owner-1440x900-en.png | 1440 | en | DEVIATION (ref pos-brief-P1.17U-R4-PARITY.md §3 · pos-P1.17U-R4.md R5/R6/R7 + Follow-ups F1/F2) | "Sales overview", "Net sales ▼43% vs yesterday", "Last 14 days to Sat 10 Oct"; dates en format; status text truncates by design (R6 V4). Branch names = data. |
| 08 | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 08 | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 10 | p1close/settings-shark-owner-1440x900.png (+ settings-shark-account-off, settings-channels, settings-payments, settings-offline, settings-history) | 1440 | th | DEVIATION (ref pos-P1.18U.md Deviations 10–12 · pos-brief-P1.18.md CD3 · pos-P1.18U-review-R2.md rulings N1) | Title + "เชื่อมอยู่ 5 จาก 13 ระบบ" (truthful, LINKED only) + ประวัติการเปลี่ยน; 13 cards 3-col, planned bullets muted with phase, NO_SYSTEM footers "ยังไม่มีระบบนี้ในร้าน · เปิดใช้", AI card chip, receipt + offline cards, channels + payments panels side by side (xl). Account-off confirm dialog "ปิดการลงบัญชี?" OK. Cashier: same cards read-only, no unit select. |
| 10 | p1close/settings-shark-owner-1024x768.png | 1024 | th | OPEN → O4 | Header row squeezes the title: "การเชื่อมต่อระบบ SHARK" + subtitle wrap one word per line in a ~60 px column next to the count chip + history button (also on settings-shark-account-off / -cashier 1024). |
| 10 | p1close/settings-shark-owner-390x844.png | 390 | th | DEVIATION (ref pos-P1.18U.md Deviations 10–12 · pos-brief-P1.18.md CD3 · pos-P1.18U-review-R2.md rulings N1) | Settings menu becomes chip row; cards 1 col; header wraps cleanly. |
| 10 | p1close-en/settings-shark-owner-1440x900-en.png (+ account-off, history -en) | 1440 | en | DEVIATION (ref pos-P1.18U.md Deviations 10–12 · pos-brief-P1.18.md CD3 · pos-P1.18U-review-R2.md rulings N1) | "SHARK connections · 5 of 13 systems connected", English facts with phases, "Turn on"/"Manage →"; history drawer English sentences ("Edited device …", "Set a staff PIN"). Unit/device names = data. |
| 10 | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 10 | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 11B | p1close/settings-receipt-owner-1440x900.png (preview iframe) | 1440 | th | DEVIATION (ref pos-P1.10U.md Deviations 18, 4→P1.11U Round 2, 5, 8) | 80 mm preview: shop/unit/device header, "ใบเสร็จรับเงิน" (book has no taxId ⇒ not ABB — data), no/date/cashier, lines, รวม/ยอดสุทธิ, พร้อมเพย์, member points, footer. Renderer HTML = P1.10 accepted; no QR in preview. |
| 11B | p1close/settings-receipt-owner-1024x768.png | 1024 | th | DEVIATION (ref pos-P1.10U.md Deviations 18, 4→P1.11U Round 2, 5, 8) | Preview stacked below the cards (dev 8). |
| 11B | p1close/settings-receipt-owner-390x844.png | 390 | th | DEVIATION (ref pos-P1.10U.md Deviations 18, 4→P1.11U Round 2, 5, 8) | Stacked; preview readable. |
| 11B | p1close-en/settings-receipt-owner-1440x900-en.png | 1440 | en | DEVIATION (ref pos-P1.10U.md Deviations 18, 4→P1.11U Round 2, 5, 8) · pos-P1.18.md Deviations 5 | Settings chrome English; receipt body follows the receipt-language setting (ไทย) by design. |
| 11B | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 11B | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 11C | no shot — receipt-public is not in the vis56 page set (register·settings·sales·shifts·reports·stock·products·close) | 1440 | th | OPEN → O8 | Missing shot. Last controller check: P1.11U Round 2 "screenshots on 2d545ea4 matched 11C". |
| 11C | no shot — receipt-public is not in the vis56 page set (register·settings·sales·shifts·reports·stock·products·close) | 1024 | th | OPEN → O8 | Missing shot. Last controller check: P1.11U Round 2 "screenshots on 2d545ea4 matched 11C". |
| 11C | no shot — receipt-public is not in the vis56 page set (register·settings·sales·shifts·reports·stock·products·close) | 390 | th | OPEN → O8 | Missing shot. Last controller check: P1.11U Round 2 "screenshots on 2d545ea4 matched 11C". |
| 11C | no shot — receipt-public is not in the vis56 page set (register·settings·sales·shifts·reports·stock·products·close) | 1440 | en | OPEN → O8 | Missing shot. Last controller check: P1.11U Round 2 "screenshots on 2d545ea4 matched 11C". |
| 11C | no shot — receipt-public is not in the vis56 page set (register·settings·sales·shifts·reports·stock·products·close) | 1024 | en | OPEN → O8 | Missing shot. Last controller check: P1.11U Round 2 "screenshots on 2d545ea4 matched 11C". |
| 11C | no shot — receipt-public is not in the vis56 page set (register·settings·sales·shifts·reports·stock·products·close) | 390 | en | OPEN → O8 | Missing shot. Last controller check: P1.11U Round 2 "screenshots on 2d545ea4 matched 11C". |
| 12 | p1close/sales-list-owner-1440x900.png (+ sales-drawer, -refund, -void, -empty) | 1440 | th | DEVIATION (ref pos-P1.16.md "Deviations from mockup 12" · pos-P1.11U.md Deviations 12 · pos-P1.15U.md Deviations 8) | Date pager, search, unit/channel/staff filters, ส่งออก (หน้านี้), status chips incl. เงินสดนอกกะ, 3 KPI, table, drawer (lines · ยอดสุทธิ/VAT · การชำระ · ลงบัญชีแล้ว link · ใบกำกับอย่างย่อ · ประวัติบิล · พิมพ์ซ้ำ/ส่ง LINE/ส่งอีเมล/คัดลอกลิงก์ · ยกเลิกบิล/คืนเงิน). Refund modal: qty steppers, เหตุผล, เงินสด / เครดิตร้าน (disabled), summary ticks "ออกใบลดหนี้ (เลขรันอัตโนมัติ)". Empty: "ไม่มีบิลในวันที่ …". Cashier drawer: no ยกเลิก/คืน actions, note "ยกเลิกบิล: ต้องมีสิทธิ์ผู้จัดการ". |
| 12 | p1close/sales-list-owner-1024x768.png | 1024 | th | DEVIATION (ref pos-P1.16.md "Deviations from mockup 12" · pos-P1.11U.md Deviations 12 · pos-P1.15U.md Deviations 8) | Table + drawer; no overflow. |
| 12 | p1close/sales-drawer-owner-390x844.png | 390 | th | DEVIATION (ref pos-P1.16.md "Deviations from mockup 12" · pos-P1.11U.md Deviations 12 · pos-P1.15U.md Deviations 8) | Drawer above, list as cards below. |
| 12 | p1close-en/sales-list/drawer/refund/void/empty-owner-1440x900-en.png | 1440 | en | DEVIATION (ref pos-P1.16.md "Deviations from mockup 12" · pos-P1.11U.md Deviations 12 · pos-P1.15U.md Deviations 8) | English ("Today's bills", "Off-shift cash", "Walk-in customer", "Shift closed — use a refund instead"); dates "10 Oct 2026". |
| 12 | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 12 | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 13A | p1close/shifts-noshift-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.9U.md Deviations D10–D14 · R2 Q3) | Dialog เปิดกะ + date chip, device card ✓, staff = signed-in user, 6 note tiles + เหรียญ, total box, ย้อนกลับ/เปิดกะ. Off-shift card "เงินสดนอกกะ วันนี้ ฿130" + เครื่องนี้ card. Cashier = refusal card. |
| 13A | p1close/shifts-noshift-owner-1024x768.png | 1024 | th | DEVIATION (ref pos-P1.9U.md Deviations D10–D14 · R2 Q3) | 4-col tiles, fits. |
| 13A | p1close/shifts-noshift-owner-390x844.png | 390 | th | DEVIATION (ref pos-P1.9U.md Deviations D10–D14 · R2 Q3) | Bottom sheet, 2-col tiles. |
| 13A | p1close-en/shifts-noshift-owner-1440x900-en.png | 1440 | en | DEVIATION (ref pos-P1.9U.md Deviations D10–D14 · R2 Q3) | English dialog ("Open shift", "Float in the drawer"). |
| 13A | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 13A | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 13B | p1close/register-lock-screen-owner-1440x900.png · register-staff-switch-owner-1440x900.png · register-lock-pin-locked-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.15U.md Deviations 3, 4, 5) | Top strip (shop · unit · device, shift chip, online, clock, date), "ใส่ PIN เพื่อปลดล็อก", user line, 6 dots, keypad with ลืม PIN/⌫, rule line; right: staff cards (ใช้งานอยู่ chip), สลับพนักงาน, บิลที่พักไว้ 1 ใบ ฿180, auto-lock note. Locked state: red "ล็อกชั่วคราว 15 นาที" + ผู้จัดการปลดล็อก, greyed keypad. HR hours / ลาวันนี้ omitted (dev 5). |
| 13B | p1close/register-lock-screen-owner-1024x768.png | 1024 | th | DEVIATION (ref pos-P1.15U.md Deviations 3, 4, 5) | Two columns kept. |
| 13B | p1close/register-lock-screen-cashier-390x844.png (+ owner 390) | 390 | th | OPEN → O5 | Stacked: pad then "ใครกำลังใช้เครื่องนี้"; the full-page capture shows the register grid right under the staff heading — the staff cards / สลับพนักงาน / held card are cut at the 844 px fold. Need to confirm the overlay scrolls on a phone. |
| 13B | p1close-en/register-lock-screen-owner-1440x900-en.png (+ lock-pin-locked, staff-switch -en) | 1440 | en | DEVIATION (ref pos-P1.15U.md Deviations 3, 4, 5) | English lock texts. |
| 13B | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 13B | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 14A | p1close/register-member-panel-owner-1440x900.png · register-member-register-owner-1440x900.png · register-member-attached-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.12U.md Deviations 1, 5 · review "Deviations 1–6, 8–10 accepted") | Right drawer: "สมาชิก ผูกกับบิลนี้" ✕, search "089 · พบ 1 รายชื่อ", สแกน QR สมาชิก, row (avatar, name, 089-xxx-0001 masked, tier chip, 1,338 แต้ม), divider "ไม่พบ? สมัครใหม่ใช้เวลา 20 วินาที", form (เบอร์ · ชื่อ · วันเกิด วว/ดด/ปปปป · PDPA · ที่มา chips), primary, footnote. Attached chip in cart "ใช้แต้ม · ถอด", coupon WELCOME50 row. |
| 14A | p1close/register-member-panel-owner-1024x768.png | 1024 | th | DEVIATION (ref pos-P1.12U.md Deviations 1, 5 · review "Deviations 1–6, 8–10 accepted") | Drawer fits. |
| 14A | p1close/register-member-panel-owner-390x844.png | 390 | th | DEVIATION (ref pos-P1.12U.md Deviations 1, 5 · review "Deviations 1–6, 8–10 accepted") | Bottom sheet with scrolling body (fix-round 390 wrapper). |
| 14A | p1close-en/register-member-panel/register/attached-owner-1440x900-en.png | 1440 | en | DEVIATION (ref pos-P1.12U.md Deviations 1, 5 · review "Deviations 1–6, 8–10 accepted") | English ("Member · linked to this bill", "Not found? Sign up in 20 seconds"). |
| 14A | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 14A | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 14B | no shot — no held-bills-drawer state in visual-pos | 1440 | th | OPEN → O6 | Missing shot; held bills only visible as the "บิลที่พัก 1" button and the 13B held card. |
| 14B | no shot — no held-bills-drawer state in visual-pos | 1024 | th | OPEN → O6 | Missing shot; held bills only visible as the "บิลที่พัก 1" button and the 13B held card. |
| 14B | no shot — no held-bills-drawer state in visual-pos | 390 | th | OPEN → O6 | Missing shot; held bills only visible as the "บิลที่พัก 1" button and the 13B held card. |
| 14B | no shot — no held-bills-drawer state in visual-pos | 1440 | en | OPEN → O6 | Missing shot; held bills only visible as the "บิลที่พัก 1" button and the 13B held card. |
| 14B | no shot — no held-bills-drawer state in visual-pos | 1024 | en | OPEN → O6 | Missing shot; held bills only visible as the "บิลที่พัก 1" button and the 13B held card. |
| 14B | no shot — no held-bills-drawer state in visual-pos | 390 | en | OPEN → O6 | Missing shot; held bills only visible as the "บิลที่พัก 1" button and the 13B held card. |
| 15A | p1close/register-taxinvoice-dialog-owner-1440x900.png · register-taxinvoice-set-owner-1440x900.png · sales-bill-taxinvoice-requested/issued-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.13U.md Deviations 1–4 · V1) | Dialog "ออกใบกำกับภาษีเต็มรูป ฿235", บุคคลธรรมดา/นิติบุคคล, tax id ✓ + ค้นจากกรมพัฒน์ (DBD), name/address, สาขา radios, e-Tax email, info line (no doc no.), ยกเลิก/บันทึกและกลับไปชำระ. Set: pay footer "ออกใบกำกับภาษีเต็มรูป — บริษัท ทะเลใส … · แก้", cart button ✓ ใบกำกับ. Drawer: request row ปฏิเสธ/ออกใบกำกับ; issued TX-2026-10-0002. Cashier drawer: no issue button. |
| 15A | p1close/register-taxinvoice-dialog-owner-1024x768.png (+ sales-bill-taxinvoice-* 1024) | 1024 | th | DEVIATION (ref pos-P1.13U.md Deviations 1–4 · V1) | Fits. |
| 15A | p1close/register-taxinvoice-dialog-owner-390x844.png (+ sales 390) | 390 | th | DEVIATION (ref pos-P1.13U.md Deviations 1–4 · V1) | Full-screen sheet. |
| 15A | p1close-en/register-taxinvoice-dialog-owner-1440x900-en.png · sales-bill-taxinvoice-requested-owner-1440x900-en.png | 1440 | en | DEVIATION (ref pos-P1.13U.md Deviations 1–4 · V1) | English ("Full tax invoice", "Look up in DBD", "Issue invoice"). |
| 15A | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 15A | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 16 | p1close/stock-receive-owner-1440x900.png · stock-adjust-owner-1440x900.png · stock-default-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.14U.md Deviations 1–9 · R2 rulings · R4) | Header unit/location, tab strip ตรวจนับ·รับของ·โอน·ปรับ·ประวัติ, receive card (free receive, 2 rows, grid table, รวม/มูลค่า), compact transfer/adjust cards, history with scope note. No PO / supplier (owner Q1). Cashier = refusal card. |
| 16 | p1close/stock-receive-owner-1024x768.png | 1024 | th | DEVIATION (ref pos-P1.14U.md Deviations 1–9 · R2 rulings · R4) | Grid table active (≥ 608 px container, R4). |
| 16 | p1close/stock-receive-owner-390x844.png | 390 | th | DEVIATION (ref pos-P1.14U.md Deviations 1–9 · R2 rulings · R4) | Stacked fields. |
| 16 | p1close-en/stock-receive-owner-1440x900-en.png (+ adjust, default, count -en) | 1440 | en | DEVIATION (ref pos-P1.14U.md Deviations 1–9 · R2 rulings · R4) | English; expiry date input follows browser locale (P1.14U follow-up). |
| 16 | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 16 | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 17A | p1close/settings-receipt-owner-1440x900.png | 1440 | th | OPEN → O7 | Cards + live preview match 17A with ruled deviations (P1.10U 1, 2, 5–8; P1.11U R2 QR toggle live). Differs: "เลขเครื่อง POS ต่อเครื่อง" lists every device incl. ~50 revoked QC devices — page 10,220 px tall. |
| 17A | p1close/settings-receipt-owner-1024x768.png | 1024 | th | OPEN → O7 | Same list; page 12,600 px. |
| 17A | p1close/settings-receipt-owner-390x844.png | 390 | th | OPEN → O7 | Same list; 13,348 px. Cashier = read-only (no Save). |
| 17A | p1close-en/settings-receipt-owner-1440x900-en.png | 1440 | en | OPEN → O7 | English labels; same list. |
| 17A | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 17A | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 17B | p1close/settings-devices-owner-1440x900.png · settings-device-revoke-owner-1440x900.png · settings-print-pair-owner-1440x900.png | 1440 | th | OPEN → O7 | Right panel matches 17B with ruled deviations (P1.10U 9–15): name/POS no., 58/80 มม., Bluetooth/USB/เบราว์เซอร์, เลือกเครื่องพิมพ์, Thai-raster select, 3 switches, ทดสอบพิมพ์/เพิกถอนเครื่อง, "เครื่องนี้ลงทะเบียนแล้ว". Differs: left list = ~50 revoked QC devices ("เพิกถอนแล้ว") before the active ones — page 17,088 px. |
| 17B | p1close/settings-devices-owner-1024x768.png | 1024 | th | OPEN → O7 | Same; 26,552 px. |
| 17B | p1close/settings-devices-owner-390x844.png | 390 | th | OPEN → O7 | Same; 19,154 px. |
| 17B | p1close-en/settings-devices-owner-1440x900-en.png | 1440 | en | OPEN → O7 | English ("Devices & printers", "Revoked", "No open shift"); same list. |
| 17B | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 17B | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 17C | p1close/settings-staff-owner-1440x900.png · settings-staff-pin-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.18U.md Deviations 2–5 · Fix round 2 V1 · review "deviations 1–17 accepted") | Matrix 12 rows (ทำได้ / ต้องอนุมัติ legend, ไม่จำกัด · 100 % · 10 %, รับ/ปฏิเสธออเดอร์ "เร็ว ๆ นี้ · P2.8"), นโยบายอนุมัติ empty + จัดการนโยบาย →, พนักงานและ PIN rows with เปลี่ยน PIN, HR row disabled "เร็ว ๆ นี้ · P3.5". Cashier = SettingsRefusal card. |
| 17C | p1close/settings-staff-owner-1024x768.png | 1024 | th | DEVIATION (ref pos-P1.18U.md Deviations 2–5 · Fix round 2 V1 · review "deviations 1–17 accepted") | Table-fixed, labels wrap, no clipping (V1). |
| 17C | p1close/settings-staff-owner-390x844.png | 390 | th | DEVIATION (ref pos-P1.18U.md Deviations 2–5 · Fix round 2 V1 · review "deviations 1–17 accepted") | Matrix scrolls horizontally inside its card (accepted safety net). |
| 17C | p1close-en/settings-staff-owner-1440x900-en.png | 1440 | en | DEVIATION (ref pos-P1.18U.md Deviations 2–5 · Fix round 2 V1 · review "deviations 1–17 accepted") | "Staff and permissions", "Discount (limit) · Unlimited", "Coming soon · P2.8". |
| 17C | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 17C | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 19ก | p1close/register-register-empty-catalogue-owner-1440x900.png | 1440 | th | OPEN → O10 | Box icon, "ยังไม่มีสินค้าให้ขาย", "เพิ่มสินค้าแรกของคุณที่หน้าสินค้า แล้วกลับมาขายที่นี่", + เพิ่มสินค้า; cart "ยังไม่มีรายการ"; ชำระเงิน ฿0 disabled. Mockup also has "นำเข้า CSV" and "ชุดตัวอย่างกาแฟ" — not built, no ruling. Cashier variant not shot (P1.18U dev 14, accepted). |
| 19ก | p1close/register-register-empty-catalogue-owner-1024x768.png | 1024 | th | OPEN → O10 | As 1440. |
| 19ก | p1close/register-register-empty-catalogue-owner-390x844.png | 390 | th | OPEN → O10 | As 1440; "ยังไม่เปิดกะ" chip (fixture unit has no shift). |
| 19ก | p1close-en/register-register-empty-catalogue-owner-1440x900-en.png | 1440 | en | OPEN → O10 | English empty-state text. |
| 19ก | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 19ก | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 19ค | no shot of the two error cards (PromptPay not received; printer failed). settings-print-pair = pairing dialog, not the error | 1440 | th | OPEN → O11 | Missing shot. |
| 19ค | no shot of the two error cards (PromptPay not received; printer failed). settings-print-pair = pairing dialog, not the error | 1024 | th | OPEN → O11 | Missing shot. |
| 19ค | no shot of the two error cards (PromptPay not received; printer failed). settings-print-pair = pairing dialog, not the error | 390 | th | OPEN → O11 | Missing shot. |
| 19ค | no shot of the two error cards (PromptPay not received; printer failed). settings-print-pair = pairing dialog, not the error | 1440 | en | OPEN → O11 | Missing shot. |
| 19ค | no shot of the two error cards (PromptPay not received; printer failed). settings-print-pair = pairing dialog, not the error | 1024 | en | OPEN → O11 | Missing shot. |
| 19ค | no shot of the two error cards (PromptPay not received; printer failed). settings-print-pair = pairing dialog, not the error | 390 | en | OPEN → O11 | Missing shot. |
| 19ง | p1close/register-offline-owner-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.18U.md Deviations 12 — offline queue P3.4) | Black banner "ออฟไลน์ตั้งแต่ 05:39 — ขายต่อได้เมื่อกลับมาออนไลน์", status chip ออฟไลน์, red line "ออฟไลน์อยู่ — ชำระเงินได้เมื่อกลับมาออนไลน์", pay disabled. Mockup sells cash/transfer offline with OFF-… temp numbers (P3.4). |
| 19ง | p1close/register-offline-cashier-1024x768.png (+ owner 1024) | 1024 | th | DEVIATION (ref pos-P1.18U.md Deviations 12 — offline queue P3.4) | Same. |
| 19ง | p1close/register-offline-owner-390x844.png | 390 | th | DEVIATION (ref pos-P1.18U.md Deviations 12 — offline queue P3.4) | Banner under header; same. |
| 19ง | p1close-en/register-offline-owner-1440x900-en.png | 1440 | en | DEVIATION (ref pos-P1.18U.md Deviations 12 — offline queue P3.4) | English banner. |
| 19ง | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 19ง | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 19จ | p1close/shifts-noshift-owner-1440x900.png (register no-shift banner not shot — harness opens a shift before every register state) | 1440 | th | DEVIATION (ref pos-P1.9U.md Deviations D14) | Open-shift dialog lives on /pos/shifts; register shows "ยังไม่เปิดกะ" chip (seen on empty-catalogue shots) + banner link. |
| 19จ | p1close/shifts-noshift-owner-1024x768.png | 1024 | th | DEVIATION (ref pos-P1.9U.md Deviations D14) | — |
| 19จ | p1close/shifts-noshift-owner-390x844.png | 390 | th | DEVIATION (ref pos-P1.9U.md Deviations D14) | — |
| 19จ | p1close-en/shifts-noshift-owner-1440x900-en.png | 1440 | en | DEVIATION (ref pos-P1.9U.md Deviations D14) | English. |
| 19จ | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 19จ | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 19ฉ | p1close/register-stock-warn-owner-1440x900.png | 1440 | th | MATCH | Red left bar on the line, "สต็อก −23 → −24", warning "สต็อกมี 0 — สินค้าในสต็อกไม่พอสำหรับจำนวนนี้" + ขายต่อ; sold-out cards greyed "· หมด". |
| 19ฉ | p1close/register-stock-warn-owner-1024x768.png | 1024 | th | MATCH | — |
| 19ฉ | p1close/register-stock-warn-owner-390x844.png | 390 | th | MATCH | "สต็อกมี 2" + ขายต่อ / ลดเหลือ 2 as mockup. |
| 19ฉ | p1close-en/register-stock-warn-owner-1440x900-en.png | 1440 | en | MATCH | "Only 0 in stock — not enough stock for this quantity", "Keep selling". |
| 19ฉ | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 19ฉ | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 20A | p1close/register-cart4-01-owner-1024x768.png (+ default, member-attached 1024) | 1024 | th | OPEN → O1 | Icon tab row (ขาย·โต๊ะ·ออนไลน์·บิล·กะ·สินค้า·รายงาน·ตั้งค่า), 3-col grid, cart column, no page scroll. "รายงาน" muted soon (O1). |
| 20A | p1close/register-register-en-owner-1024x768.png | 1024 | en | OPEN → O1, O3 | English iPad register; "Reports" muted soon; app-shell Thai. |
| 20B | p1close-en/register-register-en-owner-1440x900-en.png · p1close-en/register-default-owner-1440x900-en.png | 1440 | en | OPEN → O1, O3 | Full English register: tabs (Sale · Tables Soon · Online orders Soon · Today's bills · Shift · Products · Reports Soon · Settings), search, Custom item, Scan with camera, Hold/Held bills, "+ Add member", "No items yet", shortcuts bar. Reports still Soon (O1); sidebar/header app shell Thai (O3). Thai product names = data. |
| 20B | p1close/register-register-en-owner-1024x768.png | 1024 | en | OPEN → O1, O3 | Same as 20A en. |
| 20B | p1close/register-register-en-owner-390x844.png | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 1) | English phone register; switch via cookie (no 390 switcher). |
| 21A | no shot — /app/approvals is outside POS_PAGES | 390 | th | OPEN → O12 | Missing shot (P1.15U Deviations 10 notes the skip; no explicit ruling). |
| 21A | no shot | 390 | en | OPEN → O12 | Missing shot. |
| 21B | p1close/register-approval-wait-owner-1440x900.png · register-discount-over-sheet-cashier-1440x900.png | 1440 | th | DEVIATION (ref pos-P1.15U.md Deviations 6, 7, 8 · Fix round 1 F8) | "รอผู้จัดการอนุมัติ": request line (ยกเลิกบิล 202610-0203 · ฿190 · เหตุผล), approver card "ผู้อนุมัติ: ผู้จัดการ · ส่งแล้ว", spinner + 4:56, หรือ, manager PIN pad, ยกเลิกคำขอ. Void wait opens from Bills (dev 8). Discount-over sheet: "ส่วนลดเกินสิทธิ์ · เพดานของคุณ 10% · บิลนี้ 23.27%", manager chip, PIN pad, ใช้ส่วนลดด้วย PIN ผู้จัดการ, ส่งขออนุมัติ, ยกเลิก. |
| 21B | p1close/register-approval-wait-owner-1024x768.png · register-discount-over-sheet-*-1024x768.png | 1024 | th | DEVIATION (ref pos-P1.15U.md Deviations 6, 7, 8 · Fix round 1 F8) | Fits. |
| 21B | p1close/register-approval-wait-owner-390x844.png · register-discount-over-sheet-*-390x844.png | 390 | th | DEVIATION (ref pos-P1.15U.md Deviations 6, 7, 8 · Fix round 1 F8) | Sheet. |
| 21B | p1close-en/register-approval-wait-owner-1440x900-en.png · register-discount-over-sheet-owner-1440x900-en.png | 1440 | en | DEVIATION (ref pos-P1.15U.md Deviations 6, 7, 8 · Fix round 1 F8) | English. |
| 21B | — | 1024 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
| 21B | — | 390 | en | DEVIATION (ref pos-P1.18U.md Deviations 15 · review "15 accept") | LOCALE=en runs shoot 1440 only |
## Other P1 screens (no mockup frame in the R15 list)
- `products-*` (owner th/en 1440/1024/390): services/products price list, English OK. **Cashier `products-cashier-*` = HTTP 404 + 1 console error** (harness expected "record"; log `products-cashier-th.log`). Either the page should render a refusal card like stock/shifts/reports (200) or the harness expectation is 404 — controller to rule (O13).
- `close-*` (owner + cashier, all sizes; en): close-day summary, by type, by method, cash reconciliation helper, Download CSV, bill list (77 rows ⇒ 8,006 px page). English OK. No mockup; no finding.

## OPEN items for the controller
| # | shot path | what differs | proposed ruling |
|---|---|---|---|
| O1 | `p1close/register-cart4-01-owner-1440x900.png`, `…-1024x768.png`, `p1close-en/register-register-en-owner-1440x900-en.png` | Register mode tab "รายงาน / Reports" still shows "เร็ว ๆ นี้ / Soon" with `href: null` (`RegisterModeTabs.tsx:27,30` at b694aea0) although `/pos/reports` is live since P1.17U. Listed as a parity candidate in `pos-brief-P1.18.md:32`, never ruled. (Same batch, cosmetic: owner unit chip at 390 en renders as a bare "⌄", `register-register-en-owner-390x844.png`.) | **fix-now** (one line: href to `/pos/reports`, drop from `soon`) |
| O2 | `p1close/register-bill-discount-owner-1440x900.png`, `register-bill-discount-cashier-390x844.png` | Bill-discount dialog coupon row "โค้ดคูปอง · เร็ว ๆ นี้" (`BillDiscountDialog.tsx:105–111`, `aria-disabled` + `soonChip`) while the coupon flow works (P1.12U ruling 8; WELCOME50 on member-attached / pay). Misleading label. | **fix-now** (remove chip/aria-disabled) |
| O3 | every `p1close-en/*` shot | App shell (left sidebar "หน้าหลัก · ระบบทั้งหมด · การจัดการ (Page)", "แจ้งปัญหาการใช้งาน", "+ เพิ่มระบบ", "ออกจากระบบ", "กิจการ") stays Thai in en; POS strings are English. Outside POS files (core layout). | **later-card** (core i18n of the app shell) — accept for P1 |
| O4 | `p1close/settings-shark-owner-1024x768.png` (+ `settings-shark-account-off-*-1024x768.png`, `settings-shark-cashier-1024x768.png`) | Header row: title "การเชื่อมต่อระบบ SHARK" and its subtitle squeezed into a ~60 px column, one word per line, beside the count chip + history button. 1440 and 390 fine. | **fix-now** (header wraps chip/button below title under xl, as the reports header V4) |
| O5 | `p1close/register-lock-screen-cashier-390x844.png` (+ owner 390, `register-staff-switch-*-390x844.png`) | 13B at 390: pad then "ใครกำลังใช้เครื่องนี้"; the capture cuts at the fold and shows the register grid right under the heading — staff cards / สลับพนักงาน / held card may be unreachable on a phone if the overlay does not scroll. | **fix-now if** the overlay is not scrollable (check `LockScreen` overflow at 390); else accept |
| O6 | — (no shot) | 14B held-bills drawer has no visual state, so it has never been compared. | **later-card**: add `held-drawer` state to visual-pos (vis58) |
| O7 | `p1close/settings-receipt-owner-*.png`, `settings-devices-owner-*.png` (+ en) | 17A "เลขเครื่อง POS ต่อเครื่อง" and 17B device list show every device incl. ~50 revoked QC devices (pages 10–27k px); 17B mockup lists only live devices. Part UI (no filter/collapse for REVOKED), part QC residue from visual runs. | **later-card**: hide/collapse REVOKED (17A list ACTIVE only; 17B "เพิกถอนแล้ว (n)" fold) + sweep old `posqc-vis-*` revoked devices in QC4 |
| O8 | — (no shot) | 11C public receipt not in the vis56 page set. Last checked by the controller on 2d545ea4 (P1.11U Round 2: matched 11C). | **accept** for close on that evidence; add `--page receipt-public` to vis58 |
| O9 | — (no shot) | 02b done screen shot at 1440 only (harness plan P1.10U/P1.12U), so 1024/390 never compared. | **accept** (same component; 1440 + en checked) or add 390 `sale-done` in vis58 |
| O10 | `p1close/register-register-empty-catalogue-owner-*.png` (+ en) | 19ก has only "+ เพิ่มสินค้า"; mockup also "นำเข้า CSV" and "ชุดตัวอย่างกาแฟ" (onboarding/import not built). Not ruled in P1.18U. | **accept** as deviation (import/sample set = onboarding card 18, later) |
| O11 | — (no shot) | 19ค human-language error cards (PromptPay not received; printer failed) have no visual state; `settings-print-pair` is the pairing dialog. | **later-card**: add `paydlg-promptpay-timeout` + `paydone-print-failed` states (vis58) |
| O12 | — (no shot) | 21A approvals on the manager's phone: `/app/approvals` is outside `POS_PAGES` (P1.15U Deviations 10, noted, never ruled). | **accept** for P1 (core approvals page; owner of approval module) or later-card for a core visual page |
| O13 | `p1close/products-cashier-*.png` | Cashier products page answers 404 + console error (harness expected "record"). | controller decision: expected 404 → set `PAGE_EXPECT.products.cashier = 404`; else **fix-now** refusal card (200) like stock/reports |
| 07 | `p1close/shifts-{current,close,z}-owner-*.png`, `p1close-en/shifts-*-owner-1440x900-en.png` | Owner shifts states not shot (HF-VIS-SHIFTS script fix pending). | **DEVIATION** — re-shot vis58b @711b6d5e on QC5, compared against 07 by the controller 10 Oct (rows above) |

## Controller rulings (account A, 9 Oct 2026 23:5xZ)
| # | ruling |
|---|---|
| O1 | **fix-now** → hotfix card **HF-P1CLOSE** (register mode tab "รายงาน/Reports" links to `/pos/reports`, no "soon"; 390 en unit chip shows the unit name, not a bare "⌄"). |
| O2 | **fix-now** → HF-P1CLOSE (coupon row in the bill-discount dialog is live: drop `soonChip`/`aria-disabled`). |
| O3 | **accept for P1**; app-shell i18n is a core card → line for the core owner in `POS-OWNER-PENDING.md` (HF-P1CLOSE writes it). |
| O4 | **fix-now** → HF-P1CLOSE (SHARK-connections header wraps chip + history button under the title below xl, same grammar as the reports header). |
| O5 | **check in HF-P1CLOSE**: the 13B overlay at 390 must scroll to the staff cards / สลับพนักงาน / held card; fix if it does not, otherwise record "scrolls" with a 390 full-page shot. |
| O6 | **harness** → HF-P1CLOSE adds a `held-drawer` state (14B) to `visual-pos.mts`; shot in vis58. |
| O7 | **fix-now (UI only)** → HF-P1CLOSE: 17A lists ACTIVE devices only; 17B folds revoked devices under "เพิกถอนแล้ว (n)" collapsed by default. QC residue devices stay (no DB sweep in this card); the visual script must revoke what it registers (already the rule). |
| O8 | **accept on the P1.11U round-2 evidence**; HF-P1CLOSE adds `--page receipt-public` to the harness, shot in vis58. |
| O9 | **accept**; HF-P1CLOSE adds `sale-done` at 390 (th) to the harness, shot in vis58. |
| O10 | **accept as deviation** — CSV import / sample set belong to the onboarding card (18), later. Noted in the P1 handover. |
| O11 | **harness** → HF-P1CLOSE adds `paydlg-promptpay-timeout` + `paydone-print-failed` states (19ค) if the UI exposes them deterministically (mock the failure via the existing QC hooks); otherwise record why not. |
| O12 | **accept for P1** (core approvals page; owner of the approval module). Line in `POS-OWNER-PENDING.md`. |
| O13 | **fix-now** → HF-P1CLOSE: cashier `products` renders the same refusal card (HTTP 200) as stock/shifts/reports; harness expectation stays "record". |
| 07 | **re-shoot in vis58** on QC5 (HF-VIS-SHIFTS merged at 1768467c); compare to 07 before the handover. |
Sheet status: frozen as the R15 artefact at vis56 (b694aea0); vis58 adds the re-shot/new rows as an addendum, not a rewrite. P1 phase close = HF-P1CLOSE merged + vis58 addendum + HANDOVER-P1.
