# POS P2.1U — builder U notes (`wip/pos-p2.1u`)

Builder U · account B · 9 Oct 2026 · tree `/root/projects/shark-pos-b` (lane b) · base `348c6d47` (`tmp/p118u-merge` = session/pos 167a75fe + trial merge of P1.18U e749b28e) · `origin/session/pos` merged twice (step 3: ledger only · step 4: real P1.18U merge 5b74f1f4 + HF-418 — clean).
Contract: `ledger/pos-briefs/pos-prompt-accountB-P2.1U.md` (rulings 1–9) · `pos-brief-P2.1.md` §6/§9 · `wo-notes/pos-P2.1.md` "Contract for P2.1U". No server change (no `src/lib/modules/pos/*` writer/reader touched except the pure client cart plumbing in `register-shared.ts`, ruling 6). No ORACLE-EDIT.

## Checkpoint
- DONE: steps 1–2 (`3eeec8f8`) · step 3 (`378179d0`) · step 4 (`1935a9d1`) · merges `10fa494d`, `0bd43c4f` · gates (below) · NEXT: controller visual run + review (builder does not merge).

## Components
| what | file | notes |
|---|---|---|
| `ChannelsPanel` (`pos-channels-panel`) | `src/app/app/sys/[id]/pos/settings/ChannelsPanel.tsx` | one component, compact in the shark tab (`SharkSettings`), `wide` on `?tab=channels` (`ChannelsPane` in `shark-ui.tsx`, phase banner removed for channels; offline keeps its banner). Rows = `listChannelsAction({includeArchived:true})` in server order; archived filtered client-side behind "แสดงที่เก็บแล้ว (n)". |
| `ChannelDrawer` (`pos-channel-drawer`) | `.../settings/ChannelDrawer.tsx` | HeldBillsDrawer shell (right 474 px md+, bottom sheet < md) · Esc/scrim/✕ close · fields per ruling 2 · live example via `channelCommission(42000, …)` · inline archive confirm · `parseChannelInput` before the action · refusals per field/banner. |
| text helpers | `src/components/pos/settings/channel-text.ts` (pure) | preset brand names + initials, `channelDisplayName` (builtin default names translated via `channel.builtin.*`, renamed = data), `channelRateText`, `channelSummary`. |
| bills | `.../sales/BillsClient.tsx`, `bills-ui.tsx` | `BillChannelPill`, `billChannelText`, column/filter/summary/customer/pay, drawer header + `pos-bill-commission`. |
| tender labels | `shifts/ShiftsClient.tsx`, `reports/ReportsClient.tsx`, `reports/ReportsOverview.tsx`, `close/page.tsx` | label mapping only (rows come from the P2.1 S readers: `PAY_TYPE_ORDER` ends with PLATFORM). |
| register | `components/pos/register/InterimPayDialog.tsx`, `RegisterScreen.tsx`, `lib/modules/pos/register-shared.ts` | PLATFORM tile + `RegisterCart.channelId` round-trip (held carts). |
| settings page | `.../settings/page.tsx` | `canManageChannels = evaluate(pos.channel.manage, unitId)` → panel/drawer read-only otherwise. |

## Keys (th values of existing keys unchanged · en real English · F15.4 2067 keys)
`pos.channel.summary.{full,noneWith}` · `pos.channel.row.{open,toggle,notCreated,connecting,showArchived,hideArchived,limit,readOnly,loading,retry}` · `pos.channel.badge.label` ·
`pos.channel.drawer.{titleCreate,titleView,close,cancel,save,saving,codeHint,payoutHint.{PLATFORM,DIRECT,NONE},sort,sortAuto,exampleTitle,exampleVat,archiveNote,archiveConfirm,archivedNote,lockedStore,lockedBuiltin,readOnly,denied,notFound,invalid.{generic,name,code,commissionBp,commissionFixedSatang,commissionVatBp,sortOrder}}` ·
`pos.channel.commissionBlock.{channel,commissionRate,vat,noteDirect}` · `pos.bills.channel.{platformPay,allSources}` · `pos.bills.summary.channel` · `pos.register.pay.{platformHint,platformVia}`.
Existing keys reused: `channel.{title,subtitle,perUnitNote,add,connect,edit,archive,archived,locked,status.*,kind.*,builtin.*,field.*,payout.*,summary.*,example,commissionBlock.{gross,commission,net,note},empty,error,saved}`, `shift.method.PLATFORM`, `report.closeDay.method.PLATFORM`, `register.pay.platform`, `register.errors.channel*`. Now unused (left in place): `settings.channels.{title,sub,lineman,grab,shopee,foodpanda,storefront.*,note,banner}`, `bills.sum.billsSub`.

## Testids
Inventory rows (wo `P2.1U`, 21 added, 1 retired — corrected in fix round 1 · +1 in fix round 1 = 22) + addendum "P2.1U" in `pos-spec-P1.3-register-ui.md`: settings `pos-channel-{open,toggle,connect}-*`, `pos-channel-{add,show-archived,retry}`, drawer `pos-channel-drawer-{close,cancel,name,code,payout-*,commission,fixed,vat-*,sort,save,archive,archive-cancel,archive-confirm}`; bills `pos-bills-channel-filter`; register `pos-reg-paydlg-method-platform`. Retired `pos-settings-channel-storefront-state`. Display ids listed in the addendum.

## Deviations from 10/12/09 and the rulings (rule touched)
1. Steps 1 and 2 are one commit (`3eeec8f8`) — the panel's row tap and "+ เพิ่มช่องทางอื่น" open the drawer; a panel-only commit would have shipped dead buttons (build order).
2. Toggle/edit send `name` with `id` (+ changed keys): `parseChannelInput` requires `name` on every save, so `{id, active}` alone is VALIDATION. The name sent is the stored one (no change) (ruling 1/2).
3. Payout "ไม่มีค่าคอมฯ" (NONE) = `payout DIRECT` + commission/fixed/VAT 0 — the server has only PLATFORM|DIRECT; a DIRECT channel with all-zero commission is shown as NONE (ruling 2).
4. Code field: client caps at 20 characters (ruling 2) while the server regex allows 24; `parseChannelInput` still decides.
5. Built-ins QR_TABLE/WEB/CHAT: drawer edits the name only (ruling 1); the row switch (`active`) stays live for them (server allows it, mockup 10 shows the switch on the web row). STORE: switch disabled + lock icon + `channel.locked` tooltip; drawer read-only.
6. Icons: STORE `shop`, WEB `link` (no globe in the design sprite), QR_TABLE `qr`, CHAT `mail` (mockup 09 uses mail for แชท), presets = initials (LM/G/S/fp), custom = first letter (ruling 1).
7. Connect rows = the four delivery presets of mockup 10 (LINEMAN GRAB SHOPEE FOODPANDA); LAZADA/TIKTOK are offered in the create drawer's datalist instead. Connect sends `{code, name: brand}` → server defaults (EXTERNAL/PLATFORM/MANUAL, commission 0 ⇒ sub-line "ไม่มีค่าคอมฯ · แพลตฟอร์มโอนให้" until edited).
8. WEB row sub-line = commission summary + ` · <storefront path>` when the shop has a live storefront (keeps P1.18U R11's fact in the row that replaced it; mockup 10 shows the shop URL there).
9. Bills column reuses the existing "ช่องทาง" column (it already sat after เวลา, showing sourceModule): non-POS/ECOM bills whose channel is the default STORE keep the source pill (ระบบจอง with a calendar icon, HOTEL/RESTAURANT/TICKET by name) — they are STORE only because their modules don't pass `channelId` yet (Q6); every other bill shows the sales channel. All non-platform pills are muted gray (mockup 12); the bold black pill = bills paid by PLATFORM (R5: PLATFORM tender ⇔ payout-PLATFORM channel — `BillRow` carries no payout) (ruling 3).
10. The old source filter stays (`pos-bills-channel`, sourceModule) but its empty option reads "ทุกระบบ" (`bills.channel.allSources`) so the two selects aren't both labelled "ทุกช่องทาง" (ruling 3).
11. Summary "หน้าร้าน N · ออนไลน์ M" replaces the bill-count card's sub-line (mockup 12 puts exactly this text there; N + M = the card's bill count). Counts come from two extra `billsPageDataAction` calls per day/unit (`salesChannelId = STORE` with status ALL and VOIDED) — no server change; a unit whose channel rows don't exist yet (legacy bills only) falls back to the server's sourceModule split (ruling 3).
12. Commission block: the channel line shows for every non-STORE channel; the number rows show when `commissionSatang` is present **and** (payout PLATFORM or commission > 0) — a DIRECT zero-commission channel (WEB) shows the channel line only. Rate text `{bp%}{ + ฿fixed}`: the bill snapshots amounts, not rates, so the drawer reads the channel's current rates (`listChannelsAction`) and shows them only when `channelCommission(grandTotal, rates)` reproduces the snapshot exactly; otherwise the label has no rate (ruling 4).
13. Close-day: the per-method summary rows use `shift.method.PLATFORM` ("แพลตฟอร์ม · รอแพลตฟอร์มโอน"); the per-bill method cells keep the close-day short path (`report.closeDay.method.PLATFORM` = "แพลตฟอร์ม"). Payments report (table + overview) = "แพลตฟอร์ม" through the same report key (ruling 5).
14. Register PLATFORM tile: rendered first in a 5-column row with the 4 tiles disabled; keypad/quick/exact/amount input and the tip switch are disabled while PLATFORM is selected (R5: single row, no tip/cash) (ruling 6).
15. `register-shared.ts` (pure, client-safe) gained `RegisterCart.channelId` + `quoteInputToCart`/`cartToQuoteInput` pass-through — the only way a held cart's channel reaches the quote (ruling 6). Carts without `channelId` produce byte-identical inputs.

## Fixtures (visual · `scripts/visual-pos.mts`)
- `ensureChannelFixture`: LINEMAN (PLATFORM 30 %) + GRAB (PLATFORM 25 % + ฿2 · VAT 7 %) on the shot unit (coffee `silom`), found by code; missing = `saveChannel` create (owner actor), differing = `saveChannel` update, equal = no write. Never deleted (bills reference the ids). SHOPEE/FOODPANDA existing on the unit are reported, not deleted (their "เชื่อมต่อ" rows would then be absent).
- `seedChannelBillsOnce`: WEB (PROMPTPAY ฿235) + LINE MAN (PLATFORM ฿420 · `LM-48152` · commission ฿126 · net ฿294) via `createSale` with fixed keys `posqc-vis-p21u-<BKK date>-web|lineman` (rerun/cashier = same sales, no writes), created after the P1.16 bill set (newest rows on page 1). Not deleted (real QC4 bills like the P1.16 set).
- `paydlg-platform`: one `holdRegisterCart` (LINEMAN `channelId`) per shot, recalled through the UI; leftovers discarded with `discardHeldCart` in finally/signal (`cleanupP21u`).
- States: settings `settings-channels` (both) · `settings-channel-drawer` (both; cashier read-only) · `settings-channel-create` (owner only) · `settings-channels-readonly` (cashier only); sales `bills-channels` · `bills-drawer-commission` (owner numbers / cashier channel line only); register `paydlg-platform` (desktop + iPad). Real screenshots = controller (CONTROLLER-RUN).

## Follow-ups
- Connection states ("เชื่อมแล้ว"/"รอยืนยันบัญชี") and adapters → P2.8/P3; channel picker / header chip and manual order entry → P2.8 (Q3); channel prices → P2.2.
- `BillDetail.channel` could carry the snapshot rate (bp/fixed) so the drawer never needs the live-rate match (server, P2.12).
- A bills summary field for channel counts would save the two extra calls (server, P2.12).
- Reviewer N1 (healing check for `posSalePaid` on a REFUNDED sale) — controller follow-up, untouched here.

## Gate exit codes (code head `0bd43c4f` · logs `scratchpad/p21u/runs/final/` with `tree=/root/projects/shark-pos-b head=0bd43c4f dirty=0` headers)
- typecheck **0** before every push (`runs/typecheck-step12.log` · `-step3.log` · `-step4.log` at 0bd43c4f).
- QC4 (iso → QC_FORCE qc4 → POS gate lock), first pass, no re-run needed: `qc-pos-p2.1` **0 · 55/55** (55 = 54 + the R8 ORACLE-EDIT already in the base) · `qc-pos-p1.16` **0 · 28/28** · `qc-pos-p1.18` (`QC_P118_PHASE=U`) **0 · 81/81, ST7 = 0** (81 registered at this base) · `qc-pos-p1.3` **0 · 128/128** · `qc-pos-p1.5` **0 · 21/21** · `qc-pos-p1.9` **0 · 53/53** · `qc-pos-p1.10` **0 · 40/40** · `qc-pos-p1.13` **0 · 33/33** · `qc-pos-p1.17` **0 · 40/40** · `qc-hf-pos-page-authz` **0 · 56/56**.
- `pnpm fitness` no env **0 · 41/41** · QC4 env **0 · 41/41** · `scripts/fitness-pos.mts` **0 · 8/8** (F15.3a/b inventory 542 rows · F15.4 keys).
- Visual `--dry` (`runs/dry-<page>-<user>-<th|en>.log`): settings owner/cashier th 46/46 shots · en 16/16 · sales th 27 · en 9 · register owner th 88 / en 32 · cashier th 85 / en 31 — all **rc 0**. Real screenshots = controller.

## Fix round 1 (review `wo-notes/pos-P2.1U-review.md` · controller rulings 9 Oct 22:3xZ · code commit `7e2869b6` on top of merge `7f77b1d0` = origin/session/pos 8b2795b2, ledger/oracle only)
Everything under the review's "Verified OK" is unchanged. Server behaviour is unchanged: the only `src/lib` change is the pure `channelNet` helper (ruling 5).
- **F1 (fixed): `scripts/visual-pos.mts`.**
  - `createP21uPair` (:3069) creates the WEB + LINE MAN pair with **per-run** keys `posqc-vis-p21u-<pid>-<n>-web|lineman`, like the P1.16 set.
  - In `seedChannelBillsOnce` (:3112), owner runs always create a new pair, so it is newer than this run's P1.16 set.
  - Cashier runs use `newestP21uPair` (:3099), which finds today's newest LINE MAN sale by `channelId` LINEMAN + `channelRef` "LM-48152" + BILL_TAG, and the newest WEB bill not newer than it. The pair is reused only if both are on page 1. Otherwise, or when none exists, a new pair is created.
  - `p21uPageOnePos` (:3057) asserts the position with the screen's own reader: `billsPageData`, page 1, 10 rows, no filter. A pair not on page 1 is a fixture error. The setup log prints "หน้าแรก: เว็บร้าน #a · LINE MAN #b จาก N".
  - `runP21uBillsState` (:3158) now calls `ensureP21uOnPageOne` (:3135) before its UI checks. That function re-checks page 1, because sale states or other lanes may have sold after the seed. If the pair has been pushed off page 1, it creates a fresh pair and reloads the page. It logs the position, so the state no longer fails on page position.
  - Bills are never deleted, as before.
- **F2 (no code change):** follow-up for P2.12, listed below.
- **F3 (fixed):** `BillsClient.tsx:313-314`. `commissionRate` returns no rate when gross ≤ 0 or `commissionSatang === grandTotal` (capped). Other cases are unchanged.
- **F4 (fixed, client only, 14 lines marked `POS P2.1U ▸ F4`):** `BillsClient.tsx` :677 (`rfMethod` + `"PLATFORM"`), :729 (preselect when any original payment is PLATFORM), :768 (`payTypeOf` → `PLATFORM`), :1882-1890/:1946 (PLATFORM-paid bill → a single option, "แพลตฟอร์ม" `pos-bills-refund-method-platform`, preselected; cash/original/card/credit are not rendered; the other bills are unchanged).
  - `refund.ts:417-424` (R9) confirms the server rule. It counts PLATFORM payments on the sale. If there are any, every refund pay row must be PLATFORM. An empty payMethods list (a ฿0 refund) also passes.
  - Keys `bills.refund.m.platform` "แพลตฟอร์ม"/"Platform" and `bills.refund.m.platformSub` "แพลตฟอร์มคืนเงินลูกค้าเอง"/"The platform refunds the customer" were added in th and en. **Deviation:** the controller suggested `bills.refund.method.PLATFORM`, but `bills.refund.method` is already a string ("คืนเงินด้วย"), so the key cannot nest there. The new keys follow the existing `refund.m.*` method keys instead. `shift.method.PLATFORM` ("แพลตฟอร์ม · รอแพลตฟอร์มโอน") reads wrong for a refund.
  - Inventory gets row 543 for `pos-bills-refund-method-platform` (wo P2.1U, owner, toggle). The addendum line is at `pos-spec-P1.3-register-ui.md:685`.
- **F5 (partial, per ruling):** `channel-shared.ts:118` adds pure `channelNet(gross, commission, vat)` = gross − commission − VAT, in integer satang. Inputs that are not positive integers count as 0. The result is not clamped, the same as the old JSX. It is used at `BillsClient.tsx:1381`. The drawer example (`ChannelDrawer.tsx:115`, verified OK) still uses inline arithmetic and can switch to the helper in P2.12.
- **F6 (nits):**
  - Every fix-round log starts with a `tree=/root/projects/shark-pos-b head=<sha> dirty=<n>` header and ends with `EXIT=`. This includes `runs/dry-*.log`.
  - Inventory count corrected: 21 rows with wo `P2.1U` at the review (the "20 added" in §Testids was wrong), plus 1 in this round, for **22**. There are 543 rows in total.
  - The filter-on-date-change behaviour stays as it is, per the ruling.

### Follow-ups recorded for P2.12
- F2: make `name` optional on channel update and write it only when it is provided. Then the panel/drawer toggle and edit can drop the stored name, and a concurrent rename is no longer reverted.
- F3: store a snapshot of the rate (bp/fixed/VAT bp) on the sale, so the drawer does not need the live-rate match.
- F5: refund-aware commission block. The reader should return the net-of-refunds gross, commission and VAT (refund shares from `channelRefundShare`). REFUNDED and partly refunded LINE MAN bills then show the real figures. Also switch the drawer example to `channelNet`.
- P2.8 still has the channel picker, header chip and connection states. The F4 refund option is now in place.

### Gates (code head `7e2869b6` · logs `scratchpad/p21u-fix/runs/` · header `tree=/root/projects/shark-pos-b head=7e2869b6 dirty=0`)
- typecheck **0** (`runs/typecheck.log` at 7e2869b6; also `typecheck-pre.log` on the uncommitted tree, 0).
- QC4 (iso → QC_FORCE qc4 → POS gate lock): `qc-pos-p1.18` (`QC_P118_PHASE=U`) **0 · 81/81, ST7 ✅** · `qc-pos-p1.16` **0 · 28/28** on the re-run. The first run was 27/28: only Z1 failed, on fingerprint drift in `posqc-coffee-tenant.outboxEvent 423→424 / auditLog 326→334`, which came from another lane on posqc-coffee during the run. That log is kept as `qc-pos-p1.16-run1.log`. `qc-pos-p1.8` **0 · 49/49** · `qc-pos-p1.5` **0 · 21/21** · `qc-pos-p2.1` **0 · 55/55**.
- `pnpm fitness` no env **0 · 41/41** · QC4 env **0 · 41/41** · `scripts/fitness-pos.mts` **0 · 8/8**. F15.3a/b covers 543 inventory rows and F15.4 the keys.
- Visual `--dry` (`runs/dry-<page>-<user>-<th|en>.log`, with header + EXIT): sales owner/cashier th 27 · en 9 · settings owner/cashier th 46 · en 16, all **rc 0**. Real screenshots are the controller's job. The F1 page-1 lines appear only in a real run, in the setup log and before each bills-channel state.

## Fix round 2 (V1 — 1024 `register/approval-wait` html overflow · base `83797c84`)
- **Root cause (not the chip itself):** the bills table already sat in an `overflow-x-auto` wrapper, so the table body was clipped. What escaped was the `sr-only` label in the menu column header (`<th className="w-12"><span className="sr-only">`, `position:absolute`). Neither the header `tr`/`th` nor the wrapper is positioned, so its containing block lay outside the scroller and the scroller did not clip it. When the table is ≤ the list column + viewport slack (vis56; `sales/bills-drawer` 1024 in vis57, table = 720), that 1 px box stays inside 1024. In the approval-wait data, the new channel pills/customer refs push the table's min-content to ~775 px (table right=1088), so the sr-only box landed at ~x 1044 and widened `html` (the shot is 2088 px = 1044 css; `sales-drawer` is 2048). The reported `table right=1088` is just the checker's "rightmost element", and the table itself was clipped.
- **Fix (1 class):** `BillsClient.tsx:1117` — the md+ table wrapper is now `relative hidden overflow-x-auto md:block` (Thai comment at :1115-1116). The scroller is now the containing block of every absolute descendant, so nothing in the table can widen the page at any table width. The table scrolls inside the card (20A grammar, the same as vis56 at 1024).
- **Why not truncate/hide the chip:** that would only lower the table width for today's data, and a long customer ref or staff name would re-open the leak. It would also risk changing the mockup 12 pill at 1440. The chosen fix changes no box geometry.
- **Why 1440/390 are unchanged:** `relative` with no offset/z-index moves nothing. The only absolutely positioned descendants are the visually-hidden `sr-only` span and the row menu, whose containing block was already `td.relative`. 390 renders the card list (`md:hidden`), not this wrapper. No server change.
- **Repro (positive/negative control, headless chromium 1024×768, static HTML of the same structure: flex row, list `min-w-0` + `overflow-hidden` card + `overflow-x-auto` wrapper + 775 px table + absolute sr-only in the last `th` + 360 px sticky drawer):** without `relative` html scrollWidth/clientWidth = **1064/1024**, and with `relative` = **1024/1024** (`scratchpad/p21u-fix2/repro*.html`).
- **Gates** (logs `scratchpad/p21u-fix2/runs/`, header `tree=/root/projects/shark-pos-b head=83797c84 dirty=1`, with EXIT): typecheck (iso + `/tmp/pos-gate.lock`) **0** · `scripts/fitness-pos.mts` **0 · 8/8** · ST7 Thai-literal scan (same strip as `qc-pos-p1.18`) on `BillsClient.tsx` = **0** lines (the comment is a JSX comment and is stripped). `pnpm exec eslint` is **N/A**: tree b has no eslint binary or config (`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`, `runs/eslint.log`).
- Re-shoot is the controller's (vis58: `approval-wait` + the p21u set on QC5).
