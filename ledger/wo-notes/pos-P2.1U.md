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
Inventory rows (wo `P2.1U`, 20 added, 1 retired) + addendum "P2.1U" in `pos-spec-P1.3-register-ui.md`: settings `pos-channel-{open,toggle,connect}-*`, `pos-channel-{add,show-archived,retry}`, drawer `pos-channel-drawer-{close,cancel,name,code,payout-*,commission,fixed,vat-*,sort,save,archive,archive-cancel,archive-confirm}`; bills `pos-bills-channel-filter`; register `pos-reg-paydlg-method-platform`. Retired `pos-settings-channel-storefront-state`. Display ids listed in the addendum.

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
