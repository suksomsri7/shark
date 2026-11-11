# P1.17U R4 — PARITY with mockup 08 (reports overview = dashboard) · controller · 7 Oct 2026 · lane 2

> Owner (7 Oct): the UI must match the approved mockups. The accepted P1.17U (session/pos 5a3bf592) built a table-only reports page; mockup `ledger/design-pos/08-reports.png` (+ `08-reports.body.html` = exact layout, labels, spacing; `_airy.part`/`_airy2.part` tokens) is a dashboard. This round rebuilds the reports page's default view as that dashboard, using ONLY data the server already returns. No fabricated numbers: blocks whose data does not exist yet are left out (listed in §3), not faked.
> Read first: `pos-brief-P1.17U.md`, `pos-brief-P1.17.md` R5–R10/R16 (fields), `ledger/wo-notes/pos-P1.17U.md`, `docs/UI_STANDARD.md`, existing `src/app/app/sys/[id]/pos/reports/{page.tsx,ReportsClient.tsx}` (keep its data layer: actions, URL state, validation, refusal cards, CSV, kind tables).

## 1. Tree / branch
`/root/projects/shark-pos-c` (clean). `git fetch origin session/pos && git checkout -b wip/pos-p1.17u-r4 origin/session/pos`. Same rules as the P1.17U brief §1 (ro node_modules, QC4 via wrappers, explicit-path commits, push only `wip/pos-p1.17u-r4`, no build/server/deploy, never touch register files or `reports.ts` numbers).

## 2. What to build (mockup 08, top to bottom)
Default view `kind=overview` (new; URL `?kind=overview` or no kind). Header row like the mockup: title "ภาพรวมการขาย", date-range control (from/to as today, default = today), branch select, "ส่งออก CSV" (keeps a kind chooser or exports `daily`), no PDF button (P2). Info line "ข้อมูลถึง HH:mm · เทียบกับ <วันก่อนหน้าช่วง>".
1. **KPI row (5 cards, `g5` → 2 cols at 1024, 1 col at 390)** from `reportDailySales` totals of the range + the same range shifted back by its length (second call) for the deltas:
   - ยอดขายสุทธิ `netSalesSatang` + ▲/▼ x% เทียบช่วงก่อน (null → "—")
   - บิล `billCount` + ▲/▼ n บิล เทียบช่วงก่อน
   - เฉลี่ยต่อบิล `avgBillSatang` + "ช่วงก่อน ฿x"
   - กำไรขั้นต้น `grossMarginBp/100`% from `reportMargin` totals + sub-line "มีต้นทุน x% ของยอด" = costedRevenue/revenue (null/no cost → "— ยังไม่มีต้นทุน")
   - บิลยกเลิก `voidCount` + ยอด (replaces the mockup's "ลูกค้าสมาชิก", whose data is P1.12)
2. **Chart card "ยอดขายรายวัน"** (replaces the mockup's hourly chart — hourly needs P2.12): same visual grammar as the mockup: y-axis labels (0 / ½ / max, baht), dashed horizontal grid, grey bars, the last day (today) black, value label on top of the max and the last bar, x labels per day (≤14 days: every day; else first/middle/last), legend "ยอดจริง · วันนี้". Bars ≤64px wide, centered when few.
3. **"เปรียบเทียบสาขา"** card (only when the actor sees ≥2 units): one `reportDailySales` call per unit (cap 8 units, parallel), columns สาขา · ยอด · บิล · เฉลี่ย · กำไร (กำไร needs `reportMargin` per unit — cap the same 8; show "—" when no cost). Highlight the selected unit; last row "รวมทุกสาขา" from the all-units totals. 1 unit → omit the card (do not render an empty box).
4. **"สินค้าขายดี"** card: top 5 from `reportProducts` rows (rank · name · qty · ยอด · กำไร% from the matching `reportMargin` row by `key`, "—" when uncosted). Footer link "ดูทั้งหมด" → `?kind=products`.
5. **"วิธีชำระ"** card: from `reportPayments`: label, bar = amount/totalPaid, %, amount (mockup right column). Sub-line "ทิป ฿x" only when > 0.
6. **"พนักงาน"** card: from `reportStaff` rows: ชื่อ (unknown → `unknownSeller`) · บิล · ยอด · ส่วนลดที่ให้ · ยกเลิก · หมายเหตุ (empty; the "ส่วนลดสูงผิดปกติ" badge only if discount > 15% of net, as in the mockup — computed on screen from the row, labelled as a hint). Link "ดูทั้งหมด" → `?kind=staff`.
7. The 7 detail kinds stay reachable: kind tabs row keeps `overview` first, then the 7 (tables unchanged from R3).
- Mobile 390: cards stack, KPI 1 column, chart scrolls horizontally if >14 bars, tables scroll inside their cards. ≥44px controls. Tokens only. `data-testid` on every new control/card (`pos-report-ov-*`); add rows to `scripts/pos-ui-inventory.json`.
- Keys: `pos.report.overview.*` th+en (title, compare, vsPrev, costed, noCost, branches, topProducts, payMethods, staff, seeAll, legendActual, legendToday, highDiscount, upToDate). No hard-coded Thai.
- Performance: at most 2 + 2 + (2 × units≤8) action calls per overview load, all in parallel; show per-card loading; a refused card shows its refusal text inside the card, never blanks the page.

## 3. Left out on purpose (no data yet — do not fake): รายชั่วโมง (P2.12) · ช่องทางการขาย LINE MAN/Grab/เว็บ/QR (P2.11) · ลูกค้าสมาชิก (P1.12) · ผู้ช่วย AI (P3) · PDF (P2). Put a one-line muted note under the KPI row: "รายชั่วโมง · ช่องทาง · สมาชิก จะมาในรอบถัดไป" (key `overview.comingSoon`).

## 4. Gates
typecheck 0 · fitness (both modes) 0 · fitness-pos 0 · `qc-pos-p1.17` 35/35 · `qc-hf-pos-page-authz` · `qc-pos-p1.9` · `qc-pos-p1.3` unchanged (forced + unforced) · `git diff --stat origin/session/pos` shows no register/reports.ts changes · notes `ledger/wo-notes/pos-P1.17U-R4.md` (commands + exit codes, open questions) · push and stop. Controller builds, shoots overview at 1440/1024/390 + EN with the QC range that has data (`REPORT_QUERY=kind=overview&from=2026-10-04&to=2026-10-04`) and compares against mockup 08 side by side before accepting.

Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
