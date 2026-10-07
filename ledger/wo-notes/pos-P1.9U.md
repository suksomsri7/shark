# POS P1.9 U — builder notes (shifts & cash drawer page = mockup 07 + open-shift dialog 13A + recount + "กะ" tab + visual-pos `shifts`)

Branch `wip/pos-p1.9u` from `origin/session/pos` cce3fd97 · tree `/root/projects/shark-pos-b` · account B · started 2026-10-07 ~21:00 UTC. Brief: `ledger/pos-briefs/pos-brief-P1.9U.md`. Server P1.9 + P1.9b unchanged except the one additive composed read.

## Status
- [x] Composed read `shiftsPageData` (shift.ts, additive) + thin action `shiftsPageDataAction`
- [x] Module tab "กะ" → `/pos/shifts` after "ประวัติบิล" in `posTabs` and `childrenFor("POS")` (identical)
- [x] Page = 07: header · current shift card (X) · close card (denominations) · Z panel · closed list (Z) · off-shift cash · this device · LINE one-liner
- [x] Open-shift dialog (13A part A) · cash in/out dialog · recount button + dialog (P1.9b) kept
- [x] Keys `pos.shift.*` th + en · testids `pos-shift-*` · UI inventory rows
- [x] visual-pos page `shifts` + `--states` (dry-run only — controller shoots)
- [x] Gates — table at the end

## Commits
1. `ca9118ae` composed read + action + tab in both lists
2. `c777b8a3` page/client/ui helpers, keys, inventory, pos-qc-env `shifts`, visual-pos states + helper update
3. final commit — container-query layout (1024 with full menu), float total shown as ฿ when counted by denomination, these notes (head in the gate table)

## Files
| file | what |
|---|---|
| `src/lib/modules/pos/shift.ts` | **additive only** (appended block): `shiftsPageData(ctx, actor, {deviceId?})` + types `ShiftsPageData/ShiftsPageShift/ShiftsPageMovement/ShiftsPageItem`. Order: `scopeOf` → no operate and no manage = `PERMISSION_DENIED` (whole page) → `currentShift` first (it may force-close a stale shift, S12) → `Promise.all(xReport(open shift, ctx.deviceId), listShifts(limit 50), offShiftCash (manage only, else PERMISSION_DENIED section))` → `Promise.all(cash movements of the open shift (only when X is ok), frozen Z fields billCount/salesTotalSatang + closeNote of listed shifts, recount authors)` → one `user.findMany` for names (`name || email || "-"`, same fallback as `registerShiftStatus`). Returns per-section results/refusals + `settings {blindClose, overShortReasonSatang}` + `operate/manage` + `at`. No existing function or `viewOf` touched; no write. |
| `src/lib/modules/pos/shift-actions.ts` | `shiftsPageDataAction(args: Target)` — session → scopeOf (coarse gate as the others) → `shiftsPageData` → catch → `unexpected`. |
| `src/lib/modules/pos/tabs.ts` · `src/app/app/layout.tsx` | `{ href: …/pos/shifts, label: "กะ" }` after "ประวัติบิล" in both. |
| `src/app/app/sys/[id]/pos/shifts/page.tsx` | unit selector as before, `canManage` via `evaluate`, `meName` (signed-in user), desc via `t("desc")`, width `max-w-7xl` like stock/reports. |
| `src/app/app/sys/[id]/pos/shifts/ShiftsClient.tsx` | rewritten: one `shiftsPageDataAction` per load (mount + after each successful mutation), the screens below, dialogs, keys in state rotated only after success (close/move/recount — R2 F6), refusals through `refusalMessageKey`. Keeps every static contract of `qc-pos-p1.9` S.R2.2/4/5 and `qc-pos-p1.9b` ST7. |
| `src/app/app/sys/[id]/pos/shifts/shifts-ui.tsx` (new) | presentational helpers: icons (lock/swap/warn/device/zdoc/clock/check), `Pill`, `Kpi`, `FigureBox`, `bahtToSatang`, `denomTotal` (notes + coins → total + countDetail), Bangkok-time formatters. No controls. |
| `src/messages/{th,en}/pos.json` | `pos.shift.*`: +desc, pageTitle, pageSubtitle, shiftHash, zHash, pillOpen, openedBy, floatShort, elapsed, xHeading, dataAt, kpi.*, byMethodTitle, col.*, cashStatus, noSales, drawerTitle, drawer.*, noMoves, movesTitle, blindHint, noShiftHint, forcedNotice, invalidAmount, moveInvalid, countInvalid, move.*, openDlg.*, closeCard.*, closed.*, off.*, source.*, deviceCard.*, lineSoon, z.* · `noShift` text → "ยังไม่เปิดกะบนเครื่องนี้" / "No shift open on this device". en has no Thai (F15.4 729 keys green). |
| `scripts/pos-ui-inventory.json` | 17 new rows (interactive `pos-shift-*`), 12 existing rows updated (targets moved into dialogs; roles `owner`, hiddenFor `cashier` because the QC cashier now gets the refusal card), `pos-shift-close-counted` row removed (it is now the "นับได้" display box, not an input). ModuleTabs baseline debt row unchanged. |
| `scripts/pos-qc-env.mts` | `POS_PAGES` + `"shifts"`. |
| `scripts/visual-pos.mts` | `PAGE_EXPECT.shifts = {owner:200, cashier:200}`, `pathOf` adds `?unit=`, `SHIFTS_STATE_PLAN` + `runShiftsState`, separate device `posqc-vis-shdev-<pid>`, cleanup in finally/signal (`closeShiftsStateShift` → shared `closeShiftAsOwner`, counted = expected). Register helper `openShiftAsOwner` updated in the same commit: card `pos-shift-open` → click `pos-shift-open-start` → dialog `pos-shift-open-dialog` → type `pos-shift-open-float` → `pos-shift-open-submit` → wait `pos-shift-current` (ids kept). |

## Screens built (07 / 13A)
- **Header**: "กะและลิ้นชักเงิน" + subtitle · unit select (only when >1 unit) · "นำเงินเข้า/ออกลิ้นชัก" (only when this device has an OPEN shift → dialog: kind radio IN/OUT `pos-shift-cash-in/-out`, amount, reason → `recordCashMovement`).
- **Current shift card** `pos-shift-current`: "กะ #N · <deviceLabel>" + pill "กำลังเปิด" · "เปิดโดย <name> · HH:MM · เงินตั้งต้น ฿x · เปิดมาแล้ว N ชม. M นาที" · "สรุประหว่างกะ (X)" + "ข้อมูลถึง HH:MM · ไม่ปิดกะ ดูซ้ำได้ไม่จำกัด" (that text is the refresh button `pos-shift-refresh`) · KPI row ยอดขาย · บิล · เฉลี่ยต่อบิล · ยกเลิก (count + ฿) · คืนเงิน · table "แยกตามวิธีชำระ" (วิธีชำระ · บิล · ยอด · สถานะเงิน; CASH = "อยู่ในลิ้นชัก — นับตอนปิดกะ", others "—"; 390 = status under the name) · strip "เงินสดที่ควรมีในลิ้นชัก" ตั้งต้น + รับเงินสด − เงินทอน − คืนเงินสด (+ นำเข้า − นำออก when ≠ 0) = ควรมี · note "ไม่มีการนำเงินเข้า/ออกระหว่างกะ" or the movement list (kind · reason · amount · name · time). Blind (expected null from the server): "—" + "นับแบบไม่เห็นยอดระบบ (blind)".
- **No OPEN shift** `pos-shift-open`: "ยังไม่เปิดกะบนเครื่องนี้" + "เปิดกะ" `pos-shift-open-start` → **open dialog 13A** `pos-shift-open-dialog`: title + date chip · "เครื่องที่ใช้ขาย · 1 กะต่อ 1 เครื่อง": this device card with the label input (prefilled from the last shift of this device) + locked cards for other devices with an OPEN shift · "พนักงานที่เปิดกะ": the signed-in user · "เงินตั้งต้นในลิ้นชัก · นับแยกแบงก์ (ไม่บังคับ)": total box `pos-shift-open-float` (editable; read-only showing the sum once any denomination is entered) + tiles ฿1000/500/100/50/20/10 × count + เหรียญ amount (`pos-shift-open-denom-*`) → `floatSatang` + `floatDetail` · hint with last float of this device · strip "กะก่อนหน้า Z#n · ปิด … · ผลต่าง …" + "ดูรายงาน Z#n" · ย้อนกลับ / เปิดกะ. `SHIFT_ALREADY_OPEN` → reload (adopt).
- **Close card** `pos-shift-close` "ปิดกะ · นับเงินจริง": two columns ฿1000/500/100 | ฿50/20/10 (× count = amount) + เหรียญ amount + "รวมยอดเหรียญ" · boxes ควรมี (ตามระบบ) · นับได้ · ผลต่าง (red border/text when ≠ 0, "—" under blind) · เหตุผล + "บังคับเมื่อเกิน ฿<settings>" · `REASON_REQUIRED` under the field `pos-shift-close-reason-error` · "ปิดกะและออกรายงาน Z" (black; `countDetail` + `countedCashSatang` + note + key kept until success) · "ดู X report" toggles the X panel `pos-shift-x` · read-only switch "นับแบบไม่เห็นยอดระบบ (blind) · เปิดโดยผู้จัดการ" from `settings.blindClose`.
- **Z panel** `pos-shift-z` (after close, or from a list row): restyled `<Report>` + recount block (name of the recounter, not an id) + "เปิดกะใหม่" (when no OPEN shift) + close.
- **Right column**: "กะที่ปิดแล้ว (Z)" last 4 (row = button → Z: Z#n · date · closer · device · N บิล · chips มีเหตุผล / บังคับปิด · total · ผลต่าง ±฿ red when short, or recount variance, or "ยังไม่นับ") + "ดูทั้งหมด" → full list in the card with "ดู Z#n" + P1.9b "นับย้อนหลัง" (FORCE_CLOSED + manage, testids `pos-shift-recount*` kept) · "เงินสดนอกกะ วันนี้ ฿x" red card (manage; hidden when 0 and no bills) + "ดูบิล" list (time · source · receipt · amount) · "เครื่องนี้" (name or "ยังไม่ตั้งชื่อ", online pill from `navigator.onLine`, other OPEN shifts "<device> · กะ #N · <opener>") · muted "ส่งสรุปกะทาง LINE จะมาในรอบถัดไป".
- **Layout** (container queries, not viewport — the 1024 viewport with the full 18rem menu leaves ~690 px of content, too narrow for two columns): content ≥ 56rem (`@4xl`) = two columns `minmax(0,1fr)` + 340 px (400 px at `@6xl`, i.e. 1440 in rail mode = mockup) · narrower = one column in the order current → Z → closed → off-shift → device → close card last (`display: contents` + `order`). Inside each card (`@container`) the KPI row (2/3/5 cols), the method table status column, the denomination grid (1/2 cols), figure boxes and button rows switch on the card width. So 1024 in rail mode = two columns narrower; 1024 with the full menu and 390 = one column.
- **No shift permission** (QC cashier: only `pos.sale.create`): page 200 + refusal card `pos-shift-refusal` (`errors.*` text of `PERMISSION_DENIED`).

## Keys / testids
New interactive ids (inventory rows): `pos-shift-move-open/-submit/-cancel`, `pos-shift-open-start/-close/-cancel/-denom-*/-prev-z`, `pos-shift-close-denom-*/-coins/-x/-blind`, `pos-shift-z-new/-dismiss`, `pos-shift-closed-*/-closed-all`, `pos-shift-offshift-toggle`. Kept: `pos-shift-unit`, `pos-shift-open`, `-open-label`, `-open-float`, `-open-submit`, `-current`, `-refresh`, `-move-amount/-reason`, `-cash-in/-out` (now the kind radios), `-close-note`, `-close-submit`, `-close-counted` (display box), `-z`, `-z-view-*`, `-recount*`. Display ids: `pos-shifts`, `-kpis`, `-kpi-*`, `-methods`, `-method-*`, `-drawer`, `-drawer-expected`, `-moves`, `-close`, `-close-expected`, `-close-diff`, `-closed`, `-history`, `-offshift`, `-offshift-bills`, `-device`, `-device-online`, `-line-soon`, `-notice`, `-error`, `-load-error`, `-refusal`, `-x`, `-x-refusal`, `-open-dialog`, `-move-dialog`, `-open-prev`.

## Deviations from 07 / 13A (ruling for each)
| # | mockup | built | ruling |
|---|---|---|---|
| D1 | 07 header "เปิดลิ้นชัก" | not rendered | brief §2 (hardware drawer = P1.10, no dead button) |
| D2 | 07 "พิมพ์ X report" | "ดู X report" toggles the X panel | brief §2 (print = P1.10) |
| D3 | 07 KPI sub-texts "อนุมัติโดย พี่เก่ง" / "คืนเข้า PromptPay" | void sub = ฿ only; refunds = "0" + ฿0 | server has no approver (P1.15) or refund count (P1.8); brief: no fake text |
| D4 | 07 fixed rows PromptPay "ยืนยันเงินเข้าแล้ว 33/33", บัตร "Beam", แพลตฟอร์ม, วอยเชอร์ | only methods present in `byMethod`; status CASH text, others "—"; empty = "ยังไม่มีการขายในกะนี้" | brief §2 (P1.7; platform types do not exist) |
| D5 | 07 "ส่งสรุปกะ" card with toggles | muted one-liner | brief §2.6 (P3) |
| D6 | 07 device card rows เครื่องพิมพ์ / ลิ้นชักเงิน | omitted; pill = real online state | brief §2.5 (P1.10) |
| D7 | 07 no refresh control | "ข้อมูลถึง HH:MM …" text is a button that reloads | keeps existing `pos-shift-refresh` with no extra visual element |
| D8 | 07 closed list rows not interactive, no history UI | rows open the Z panel; "ดูทั้งหมด" expands the full list (ดู Z + นับย้อนหลัง) inside the same card | brief §2.3 (history restyled, recount kept) |
| D9 | 07 reason hint "บังคับเมื่อเกิน ฿10" | "฿<settings.overShortReasonSatang>" = ฿100 default | O22/Q9.1 ruling (฿100, configurable) |
| D10 | 13A header chip "กะ #12" | date chip only | the number comes from the counter inside `openShift`; showing a guess would be wrong |
| D11 | 13A staff from HR roster (3 people, times) | the signed-in user only | HR roster / PIN = P1.15 / P3.5 |
| D12 | 13A 4 tiles (1000/500/100/20) | 6 note tiles + เหรียญ, total box editable when no tile used | brief §2.1 (฿1000/500/100/50/20/10 × count + เหรียญ) |
| D13 | 13A "ค่าตั้งต้นของเครื่องนี้ ฿2,000" | float prefilled from the last shift of this device + hint "เงินตั้งต้นกะก่อนของเครื่องนี้ ฿x" | no per-device default float setting exists |
| D14 | 13A "พิมพ์ใบเปิดกะ" checkbox, button "เปิดกะและเริ่มขาย" | no checkbox; button "เปิดกะ"; the user stays on /pos/shifts | print = P1.10; the dialog lives on the shifts page, not the register |
| D15 | 13A other device card "แพร เปิดอยู่" | shown from the page read, display only (locked) | — |

## Server-as-built conflicts / choices (followed the server)
1. **Whole-page refusal**: with neither `pos.shift.operate` nor `pos.shift.manage`, `shiftsPageData` returns `PERMISSION_DENIED` (every section would refuse anyway: open/close/move/X/list all need operate or manage). The QC cashier sees the refusal card.
2. **"เครื่องอื่น" / locked device cards** come from `listShifts` (status OPEN, other device) ⇒ manage sees all units' open shifts, operate-only sees only its own (server rule "operate only own"). No extra query.
3. **Refund count**: `ShiftReport` has `cashRefundsSatang` but no count ⇒ KPI value "0" while the amount is 0, "—" otherwise.
4. **`byMethod.count` is a payment count**, labelled "บิล" as in 07/brief; a split-tender bill counts once per method.
5. **Coins in `countDetail`/`floatDetail`**: `SHIFT_DENOMS` has no "coins" key, so the coin amount is stored as ฿1 × n + 25 สต. × m; a remainder that is not a multiple of 25 satang ⇒ no detail, total only (server accepts either).
6. **Off-shift text**: bills carry their own `sourceModule`, so the text is "บิล N ใบรับเงินสดตอนไม่มีกะเปิด — เจ้าของควรตรวจ" and each bill shows its source label (POS/BOOKING/HOTEL/RESTAURANT/TICKET/other) instead of "บิลจากระบบจอง N ใบ".
7. **Movement list / frozen Z fields / recount author** are read inside the composed read (no existing function returns them); additive, read-only.

## Open questions
- Q1 Should operate-only staff see other devices' OPEN shifts (device card + locked cards in 13A)? Today: no (follows `listShifts`).
- Q2 X "คืนเงิน" needs a refund count in `ShiftReport` when P1.8 lands.
- Q3 Coin decomposition in `countDetail` (D-5 above) — OK, or add a "coins" key to the server contract later?
- Q4 Should the 07 "บิล" column count bills rather than payments (needs a server field)?

## Gates (code head `ef7ba422`; the last commit adds only this notes file) · 21:44–21:50 UTC
| gate | result |
|---|---|
| typecheck (`env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`) | rc 0 |
| `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | rc 0 · 41/41 |
| `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm fitness` | rc 0 · 41/41 |
| `fitness-pos` (no env) | rc 0 · 8/8 (F15.3a/b green · F15.4 729 keys) |
| `qc-pos-p1.9` forced ×2 + unforced (`bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p1.9.mts`) | rc 0 · 53/53 · 53/53 · 53/53 · a5 drift none |
| `qc-pos-p1.9b` forced + unforced | rc 0 · 22/22 · 22/22 · a5 drift none |
| `qc-pos-p1.3` forced | rc 0 · 128/128 |
| `qc-pos-p1.6` forced | rc 0 · 48/48 |
| `qc-pos-p1.17` forced | rc 0 · 40/40 |
| `qc-hf-pos-page-authz` forced | rc 0 · 56/56 |
| `qc-nav-functions` | rc 0 · 11/11 · **S5 green** (on base `cce3fd97` S5 was red: `/pos/shifts` was an orphan page) |
| visual-pos `p1.9u --page shifts --states --dry` | owner rc 0 (12 shots) · cashier rc 0 (12 shots) |
| visual-pos `p1.9u --page register --states --dry` | owner rc 0 (37) · cashier rc 0 (37) |
| static `qc-pos-p1.9 --no-db` / `qc-pos-p1.9b --no-db` | 13/13 · 8/8 |

Also run once (not a gate): a throw-away read-only probe of `shiftsPageData` on QC4 (deleted, not committed) — owner: ok, manage+operate, settings `{blindClose:false, overShortReasonSatang:10000}`, history 5 items with names/billCount/sales from Z, off-shift 0; cashier: `PERMISSION_DENIED`.

No build, no screenshots, no deploy (controller: build on p11, shoot 1440/1024/390 + EN, `--page shifts --states` owner + cashier, and `--page register --states` to re-check the updated `openShiftAsOwner` helper).
