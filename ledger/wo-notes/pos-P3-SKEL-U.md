# POS P3-SKEL U — builder notes (tree p11 · branch `wip/pos-p3-skel-u`)

Builder · account B · 22 Oct 2026 · base `origin/session/pos` **e0fb57cf** (checked out 06:07Z) · merged `origin/session/pos` 6e32c1e2 at step 9 (ledger/test only: p1.6 R2 scan set · p2.10 ST2 pin · gates Tier-1 · chat-security summary) · `PSK_LANE_PIN=e0fb57cf`.
Prompt `ledger/pos-briefs/pos-prompt-accountB-P3-SKEL-U-BUILD.md` (CD-SKELU-1…12 confirmed + controller additions) · spec `ledger/pos-briefs/pos-spec-P3-SKEL-ui.md`.

## Progress (restart from here)
- [x] 1 messages th/en — 75212c17
- [x] 2 `slip-targets.ts` + `platform-ui-actions.ts` — 0975c1d4
- [x] 3 creds card + channel drawer/panel + page statuses — 5a345eb2
- [x] 4 slip card + e-Tax sheet — 32a52c91
- [x] 5 LAN card + radios + transport — f4f5a12f
- [x] 6 slip attach (intent · PayDone · bills) + slip sheet + 15A line — 576f4a0c
- [x] 7 reconcile tab — 00fdbbe6
- [x] 8 harness 9b18068b (+ ece710c2 data attrs) · sweep placeholder cd5ae321 · inventory (in each step) · authz matrix 21371319 · spec 15cfcc9c
- [x] 9 merge origin/session/pos a377a30a → gates (below) · fixes a7c7f9e4 (th key) · 3f2e7e72 (harness cast)

## Components (all `'use client'` unless noted)
`settings/IntegrationCredsCard.tsx` (PLATFORM · SLIP_VERIFY · ETAX) · `settings/SlipSettingsCard.tsx` (+ verify sheet `SlipVerifyPane`) · `settings/EtaxProviderSheet.tsx` (used as `EtaxProviderView`) · `settings/LanAgentsCard.tsx` · `register/SlipAttach.tsx` (`SlipAttachPanel` · `SlipIntentAttach` · `SlipDoneBlock`) · `sales/BillSlips.tsx` · `sales/SlipSheet.tsx` (portal · used as `SlipSheetView`) · `reports/ReconcileView.tsx` · `components/pos/print/lan.ts` (transport + pure `lanStateOf`/`lanPrinterFor`/`lanMessageKey`, not a client file).
Marked hunks (`// POS P3-SKEL U ▸ … ◂`): `settings/{page,ChannelDrawer,ChannelsPanel,shark-ui,SharkSettings,PaymentSettings,DeviceSettings}.tsx` · `register/{PayIntentPanel,PayDone,TaxInvoiceDialog}.tsx` · `sales/{BillsClient,page}.tsx` · `reports/{ReportsClient,page}.tsx` · `print/{printReceipt,types}.ts` · `print/PrintStatus.tsx` · `kds/kds-print.ts` · messages th/en · `scripts/visual-pos.mts` · inventory · sweep · authz matrix.
Untouched (forbidden list): every S file (`integration-creds*`, `payment-slip*`, `print-relay`, `payment-reconcile`, `slip-verify`, `platform/**`, `src/lib/platform/**`) · `device-shared` · `channel*` · `register*` · `bills*` · `settings-tabs` · `pos-integrations` · `prisma/` · `src/app/api/**` · every `qc-*.mts`.

## Keys
`pos.platform.fields.{client_id,client_secret,merchant_id,restaurant_id,partner_id,partner_key,shop_id,app_key,app_secret,seller_id,webhookSecret,api_key,branch_id,api_user}` · `pos.platform.creds.*` (card/sheet texts) · `pos.platform.ownerOnly` · `pos.platform.status.{switchPending,webhookPending,keyMissingShort}` · `pos.platform.slip.{retention,retentionHelp,amount,transRef,amountMismatch,imageUnavailable,view,reasonLabel,…form/sheet keys}` · `pos.platform.print.{agentMany,agentNoPrinter,agentHowto,queued,register,revoke,…card/form/token/radio keys}` · `pos.report.kinds.reconcile` · `pos.report.reconcile.*`. th = en key sets · th values all contain Thai · en none (F15.4 green). No new refusal code (ST6 unchanged).

## Testids (inventory rows wo "P3-SKEL U" = 52 · F15.3 green each commit)
`pos-channel-creds{,-retry,-status,-key-missing,-owner-only,-field-*,-clear-*,-cancel-clear,-confirm-clear,-webhook,-webhook-copy,-save,-saved,-test,-result,-error}` · `pos-channel-conn-<code>` · `pos-settings-slip-{card,retention,verify-open,verify-sheet,verify-provider,verify-close}` · `pos-settings-etax-{sheet,provider,close}` · `pos-settings-card-etax-apply` (row: disabled → live for `pos.settings.manage`) · `pos-device-lan-{card,agent-<n>,add,register,name,printer-{name,host,port,target,remove}-<n>,printer-add,cancel,submit,error,reason,token,token-copy,token-close,revoke-<n>,revoke-cancel,revoke-confirm}` · `pos-device-mode-lan` · `pos-device-kitchen-lan` (new row: span → live alias button) · `pos-print-queued` · `pos-pay-intent-slip{,-chip}` · `pos-reg-done-slip` · `pos-slip-{form,target-<n>,file,amount,ref,cancel,send,error,sent}` · `pos-bills-slips` · `pos-bills-slip-{<n>,attach,sheet,sheet-status,image,amount,mismatch,confirm,reject,reason,reject-cancel,reject-send,error,decided,close}` · `pos-taxinv-etax-pending` · `pos-reports-tab-reconcile` · `pos-reports-reconcile{,-day-<date>,-row-<n>,-csv,-pdf,-settlement,-retry,-empty,-denied}`.

## Deviations per CD (builder)
- **CD-SKELU-2**: `slipTargets` also returns the bill's slips `[{slipId, paymentId, amountSatang}]` (ids + typed amount only) — the slip sheet needs "typed amount vs row amount" and `bill.slips` carries neither. Still read-only, same perm, no names/refs/files.
- **CD-SKELU-4**: row chip testid = **`pos-channel-conn-<code>`** — `pos-channel-status-<code>` already exists on the same row (active/inactive chip, P2.1U). Chip sits under the row name (no 390 overflow). Shown only on the channels tab (shark-tab compact panel unchanged).
- **CD-SKELU-3**: chip precedence keyMissing ▸ complete ▸ awaitingCreds (+ "กรอกยังไม่ครบ" in the switch line for DRAFT) · extra testids retry/saved/key-missing/clear confirm/webhook-copy (F15.3 needs a testid on every control).
- **CD-SKELU-6**: slip form is **inline** (not a nested modal — the pay dialog/PayDone are RegisterDialogs with a focus trap and one Esc handler) · register screens have no page prop for `SLIP_MAX_BYTES` (RegisterScreen's `payIntent` type is closed; editing RegisterScreen avoided) ⇒ `SlipAttach` falls back to `SLIP_CLIENT_MAX_BYTES_FALLBACK` (5 MiB, same value) for the client pre-check; bills page passes `SLIP_MAX_BYTES` · slip key = `getRandomValues` (S5.21 forbids `randomUUID` under `components/pos/register`) · amount accepts up to 2 decimals (baht→satang by string, no float).
- **CD-SKELU-7**: reject = two steps (`pos-bills-slip-reject` → reason → `pos-bills-slip-reject-send`); a reason < 3 chars is refused client-side (no call) · sheet rendered through a portal (bills drawer is `fixed`).
- **CD-SKELU-9**: transport ctx = `PrintOptions.lan {systemId, unitId}` (PayDone receipt + kitchen, bills reprint, device test print); callers without it (KDS screen, offline, deposit, receipt settings) get `NO_DEVICE via lan` → the existing "พิมพ์ผ่านระบบแทน" fallback · agent chosen client-side with `lanStateOf` (exactly one live agent, printer by target/untargeted single — same rule as `printerFor`), enqueue per receipt/slip with a fresh key · no auto-print over LAN (`printerPaired` stays false for LAN) · mode radios became a 2×2 grid (4 options overflowed 400 px/390) · the LAN radio stays enabled while already selected.
- **CD-SKELU-10**: header CSV/PDF of the reports page are disabled on the reconcile tab (the view has its own CSV · PDF disabled with reason) · single-unit shops use their unit in all-units mode.
- **visual-pos.mts (foreign, one token)**: `ensureP36uFixture`'s `at<R,>` → `at<R = Any,>` — base e0fb57cf had 13 TS errors at :8046–8110 (P3.6U fix3/fix4 harness never went through tsc); marked `POS P3-SKEL U ▸ typecheck`.

## Fixtures + guard (harness `visual-pos.mts p3-skel-u`)
Guard `p3skuGuard`: `T.tenantId === PQC.coffee.tenantId` (posqc-coffee-tenant, never slug) + `SYS` is that tenant's POS · every write re-checks its target id (channel code/unit · sale unit · device row = `DEVICE_ID` of the unit · agent name prefix `posqc-vis-p3sku`) · every fixture StepError names step + value (`at()`).
Writes (QC5 only, by the controller's round): channels LINEMAN/GRAB find-or-create (`saveChannel`, kept) · creds via `saveIntegrationCredentials(..., {key: harness constant})` LINEMAN DRAFT / GRAB COMPLETE (fake `posqc-…`, kept) · TRANSFER bill (`createSale`, key per pid) + 1 slip (`attachSlip` + `deps.put` stub · synthetic 2×2 PNG with a per-run tEXt chunk) → `voidSale` in cleanup · PayDone TRANSFER bill (UI) → `voidSale` · static PromptPay intents of paydlg-intent-slip → `cancelPaymentIntent` · agent `posqc-vis-p3sku-agent` (+ token-state agents) → `revokePrintAgent` + delete harness rows · `DEVICE_ID` printerConfig LAN + after-sale with `_qcP3skuBefore` only for `-agents`, restored before the next state / last job / finally / signal · token text masked before the screenshot · never presses test print/enqueue · never uploads through the UI.
SKIP rules: `-keymissing` only when the card shows KEY_MISSING (QC5 has no key ⇒ runs) · `-complete` runs when the row is COMPLETE (fixture writer with injected key — controller addition) · `-none` SKIPs if a non-harness live agent exists · `paydlg-intent-slip` SKIPs when the intent is not static (Beam on) · `taxinv-etax-line` SKIPs on TAXINV book error · bills states SKIP when the bill/slip fixture failed.

## QC4 pre-flight probe (read-only · LANE-RULES 22 Oct 05:0xZ)
`bash scripts/iso.sh bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/visual-pos.mts p3-skel-u --probe` — 06:50:15–06:50:38Z rc 0:
```
PROBE ✅ guard.tenant                       {"tenantId":"posqc-coffee-tenant","want":"posqc-coffee-tenant","slug":"pos-qc-coffee"}
PROBE ✅ guard.posSystem                    {"SYS":"posqc-coffee-sys-pos","unitId":"posqc-coffee-unit-silom"}
PROBE ✅ owner.membership                   {"membershipId":"posqc-coffee-mb-owner","role":"OWNER"}
PROBE ✅ creds.fields.PLATFORM.LINEMAN      client_id*,client_secret*(ลับ),restaurant_id*,webhookSecret*(ลับ)
PROBE ✅ creds.fixture.LINEMAN              {"unknown":[],"expectStatus":"DRAFT","valueMaxOk":true}
PROBE ✅ creds.fields.PLATFORM.GRAB         client_id*,client_secret*(ลับ),merchant_id*,webhookSecret*(ลับ)
PROBE ✅ creds.fixture.GRAB                 {"unknown":[],"expectStatus":"COMPLETE","valueMaxOk":true}
PROBE ✅ creds.fields.SLIP_VERIFY.SLIPOK    api_key*(ลับ),branch_id*
PROBE ✅ creds.fields.ETAX.INET             api_user*,api_key*(ลับ),seller_id*
PROBE ✅ creds.harnessKey                   {"length":45,"roundtrip":true}
PROBE ✅ creds.serverEnvKey(probe process)  {"POS_CREDENTIALS_KEY":"unset"}
PROBE ✅ channels.platform                  {"LINEMAN":"cmv1llm76000gcqkzljuyy0fr MANUAL","GRAB":"cmv1llm91000icqkziar5u2m6 MANUAL","count":7,"limit":30}
PROBE ✅ creds.rows(existing)               []
PROBE ✅ slip.file                          {"bytes":129,"max":5242880,"type":"image/png","shaUnique":true}
PROBE ✅ slip.input                         {"transRef":"QCP3SKU131204038377","amountSatang":8000,"perTarget":3,"windowH":24}
PROBE ✅ slip.retentionDays                 1825
PROBE ✅ slip.targets(read)                 ไม่มีบิลโอนในสาขา QC (fixture สร้างเองตอนถ่าย)
PROBE ✅ print.printers                     [{"name":"เครื่องพิมพ์ครัว","host":"192.168.1.50","port":9100,"target":"kitchen"},{"name":"เครื่องพิมพ์ใบเสร็จ","host":"192.168.1.51","port":9100,"target":"receipt"}]
PROBE ✅ print.ports                        [9100,9101,9102,515]
PROBE ✅ print.agentName                    {"agent":"posqc-vis-p3sku-agent","token":"posqc-vis-p3sku-token-1312040-1"}
PROBE ✅ print.agents(unit)                 {"live":0,"harness":0,"nonHarnessLive":0}
PROBE ✅ reconcile.read                     {"from":"2026-09-23","to":"2026-10-22","rows":45,"days":2,"maxDays":92}
PROBE ✅ intent.promptpay                   {"unit":"unset","shop":"set"}
PROBE ✅ device.printerConfig               {"paper":"80","mode":"escpos-lan","autoPrint":false,"drawerKick":false,"thaiText":"raster","copies":1,"kitchenSlip":"after-sale"}
JSON_SUMMARY {"wo":"p3-skel-u","probe":true,"readOnly":true,"checks":24,"failed":0}
```

## `--state` list for the controller's QC5 round (one pass at a time: owner th → cashier th → owner en → cashier en)
owner (17): settings-channel-creds-draft,settings-channel-creds-complete,settings-channel-creds-keymissing,settings-channels-platform-chips,settings-slip-card,settings-slip-verify-sheet,settings-etax-sheet,settings-devices-lan-none,settings-devices-lan-agents,settings-devices-lan-token,paydlg-intent-slip,paydone-transfer-slip,taxinv-etax-line,bills-drawer-slips,bills-slip-sheet,bills-slip-reject-invalid,reports-reconcile-owner
cashier (5): settings-channels-platform-chips,settings-slip-card,paydlg-intent-slip,bills-drawer-slips,reports-reconcile-denied
`--dry` (CI=1 · iso.sh): th owner 49 · th cashier 15 · en owner 22 · en cashier 7 — all rc 0. Money screens 02/12 (paydlg-intent-slip · paydone-transfer-slip · bills-*) = controller full view at merge.

## Gates
Pre-submit ×2 (≤ 2). **#2 (final code) — head a7c7f9e4 · 07:44–08:4xZ · logs `/root/pos-runs/presubmit-shark-pos-p11-20261022T074421Z`:**
```
PRESUBMIT-TABLE head=a7c7f9e4 tree=/root/projects/shark-pos-p11
suite                        exit pass/total     s  failed
wo-qc-pos-p3-skel-run1       0    41/41         35  
wo-qc-pos-p3-skel-run2       0    41/41         42  
wo-qc-pos-p3-skel-nodb       0    6/6           12  
qc-pos-p1.1                  0    180/180      173  
qc-pos-p1.3                  0    128/128      158  
qc-pos-p1.6                  0    48/48         50  
qc-pos-p1.7                  0    33/33         33  
qc-pos-p1.10                 0    40/40         19  
qc-pos-p1.10u-print          0    8/8            3  
qc-pos-p1.13                 0    33/33         34  
qc-pos-p1.16                 0    28/28         32  
qc-pos-p1.18                 0    81/81         47  
qc-pos-p2.6                  0    67/67        114  
qc-pos-p2.7                  0    42/42         96  
qc-pos-p2.8                  0    61/61        102  
qc-pos-p2.10                 0    13/13         47  
qc-pos-p2.12                 1    32/33         66  P2.12-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-pos-p2.13                 0    54/54         99  
qc-pos-p2.14                 0    60/60        252  
qc-pos-p3.6                  0    52/52         95  
qc-hf-fu                     1    28/29        261  HF-FU-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-hf-pos-page-authz         0    87/87         15  
qc-pos-p5.2                  0    34/34         97  
qc-hf-reports-authz          0    79/79         50  
qc-hf-tx                     0    22/22         57  
qc-hf-fu2                    1    30/31         98  HF-FU2-ST1  ⟵ หมุดเลน (คาดไว้ระหว่างเลน · ผู้คุม re-pin ตอน merge)
qc-restaurant-money          0    6/6           29  
qc-shop-refund               0    12/12         30  
qc-hotel-money               0    5/5           24  
qc-ticket-money              0    6/6            5  
qc-subscription-money        0    14/14         45  
qc-account-cpa               0    107/107      102  
qc-acc-v2-pos-lines          1    65/79         44  PL1.1,PL1.2,PL1.3,PL1.4,PL1.6,PL1.7 … [accepted]
                                  ↳ ❌ PL1.1 เอกสารบิลขายหน้าร้าน 2 ใบ — ได้ 0 · ควรได้ 2
                                  ↳ ❌ PL1.2 บรรทัดรวม 3 บรรทัด — ได้ 0 · ควรได้ 3
                                  ↳ ❌ PL1.3 ทุกบรรทัดผูกทะเบียนสินค้า (productId) — ได้ 0 · ควรได้ 3
fitness-noenv                0    53/53         18  
fitness-qc4                  0    53/53         18  
fitness-pos                  0    8/8           10  
gen-check                    0    -              1  
typecheck                    2    -             58  
                                  ↳ scripts/visual-pos.mts(8190,113): error TS2322: Type '{ mode: string; kitchenSlip: string; _qcP3skuBefore: Record<string, unknown>; }' is not assignab
PRESUBMIT head=a7c7f9e4 green=33 red=5 expected-lane-pin=3 unexpected-red=qc-acc-v2-pos-lines,typecheck · wo: qc-pos-p3-skel-run1=41/41 · qc-pos-p3-skel-run2=41/41 · qc-pos-p3-skel-nodb=6/6 · VERDICT red (4: qc-pos-p2.12 qc-hf-fu qc-hf-fu2 typecheck)
```
- #1 at 15cfcc9c (logs `…-20261022T065440Z`): `PRESUBMIT head=15cfcc9c green=33 red=4 expected-lane-pin=3 unexpected-red=qc-acc-v2-pos-lines · wo: qc-pos-p3-skel-run1=41/41 · qc-pos-p3-skel-run2=41/41 · qc-pos-p3-skel-nodb=6/6 · VERDICT red (3: qc-pos-p2.12 qc-hf-fu qc-hf-fu2)` — its HF-FU2-ST2 was real (th `platform.slip.targetLine` without Thai) → fixed a7c7f9e4 → #2 ST2 green.
- **typecheck** (≤ 2): #1 mid-way 06:38Z at 00fdbbe6 = 13 errors, all base (`visual-pos.mts:8046–8110`, P3.6U fix3/4 `at<R,>` inference) → fixed `at<R = Any,>` (9b18068b) · #2 (= pre-submit `--tc`) at a7c7f9e4 = **1 error, own harness** `visual-pos.mts:8190` TS2322 (printerConfig jsonb literal) → fixed `as never` in **3f2e7e72** (same cast the restore path uses, which compiled). Budget used — **no 3rd run; controller please confirm typecheck 0 at the pushed head.** Product code (src/**) had 0 errors in both runs.
- Expected lane pins (file:line): `qc-pos-p2.12` ST1 → `settings/DeviceSettings.tsx` (LAN radio/kitchen alias/card hunks) · `qc-hf-fu` ST1 → `scripts/visual-pos.mts`, `register/PayDone.tsx` (:37, :115, :169, :213–214, :409–410), `sales/BillsClient.tsx` (:65, :87–88, :150, :588, :1622–1635) · `qc-hf-fu2` ST1 → marker rule (new files `ReconcileView.tsx` etc. + `ReportsClient.tsx` hunks without HF-FU2). `qc-pos-p2.10` ST2 now green (pin moved to 950656e6 on the merged base).
- `qc-acc-v2-pos-lines` 65/79 [accepted] — PL1.* accounting-module reds, same as earlier POS cards (no account file touched).
- `qc-pos-p3-skel` forced ×2 **41/41** + `--no-db` **6/6** (ST3 green — only `*-shared`/`*-actions` client value imports) · p1.6 **48** (R2 covers `platform-ui-actions.ts`) · p1.18 **81** (ST7 0 Thai outside t()) · p1.3 **128** (S5.17/S5.21) · p2.8 **61** (A8 unchanged) · p2.13 **54** = base · p2.14 **60** · p3.6 **52** · p5.2 **34/34** (matrix regenerated 333 rows) · page/report authz = base.
- `--dry` at 3f2e7e72: th owner 49 · th cashier 15 · en owner 22 · en cashier 7 — rc 0 ×4.

## CONTROLLER-DECISION
- **CD-SKELU-2 extension**: accept `slipTargets` returning the bill's slip ids + typed amounts (needed for the mismatch line) — or move the typed amount onto `bill.slips` in an S follow-up.
- **CD-SKELU-4 testid**: accept `pos-channel-conn-<code>` (the prompt's `pos-channel-status-<code>` is already the active/inactive chip on the same row).
- **CD-SKELU-6 size prop**: register screens use the client fallback 5 MiB (RegisterScreen's closed `payIntent` type not edited) — accept, or a later card threads `SLIP_MAX_BYTES` through RegisterScreen.
- **`-complete` state** runs on QC5 without a key (row COMPLETE via the injected-key writer; test → ADAPTER_PENDING; chip shows "ยังไม่ตั้งกุญแจ") per the controller addition, not the CD-SKELU-12 "only when the page shows a key" wording.
- **Foreign hunk**: `visual-pos.mts` P3.6U `at<R = Any,>` (base had 13 TS errors) — accept or re-do in P3.6U's block.
- **Slip key**: `getRandomValues` in `components/pos/register/SlipAttach.tsx` (S5.21 bans `randomUUID` there; the rule targets the bill key) — accept or move key generation out of `register/`.

## OP lines
- §W4: set env **`POS_CREDENTIALS_KEY`** (≥ 32 chars, e.g. `openssl rand -hex 32`, never `CHAT_CREDENTIALS_KEY`/`SESSION_SECRET`) on production **before** any credentials are pasted; until then every creds card shows "ยังไม่ตั้งกุญแจ" and saving is refused. QC5 runs without it (the `-keymissing` state is real there; harness rows sealed with a harness-only key).
- §W19: slip retention is **read-only** in the UI (default 1,825 d · min 90 · file purged, row kept); the writer + legal hold + PDPA-erase precedence are still the owner/accountant's decision · a REJECTED slip's image sha still blocks re-attaching the same picture (S `SLIP_DUPLICATE`; UI shows the existing text).
- §W20: provider shortlists only (SlipOK / EasySlip · INET / Leceipt) — nothing pre-selected or chosen for the owner · Beam webhook signature format to be verified on the first sandbox call (S OP line, `lib/payment/beam.ts`).
- §W5: LAN print result is "ส่งเข้าคิวแล้ว" (queued in the relay) — not proven on a real printer/drawer; no job-status reader; agent packaging/install is the owner/admin's.
- Plan rows at merge: P3.1 · P3.2 · P3.3 · P3.10 · P3.11 = "โครง ✅ · สวิตช์รอ W4/W5" (+5).

## Owner-ack (derived frames)
creds card + chips · webhook-pending line · slip card + retention read-only · slip attach form + slip sheet · e-Tax sheet · LAN agents card + LAN radio (2×2 mode grid) + kitchen alias (two radios → one stored `kitchenSlip`) · reconcile tab · "ส่งเข้าคิวแล้ว" label.
