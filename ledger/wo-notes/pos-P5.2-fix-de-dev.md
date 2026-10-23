# POS P5.2 — fix batch D + E + device (authz core · lane security ⇒ R1 after)

Builder · account B · 23 Oct 2026 09:52Z– (`date -u`) · tree `/root/projects/shark-pos-f` · branch `wip/pos-p5.2-fix-de-dev` from `origin/session/pos` **9e2a219c** (≥ 5edbfc39).
Prompt: `ledger/pos-briefs/pos-prompt-accountB-P5.2-FIX-DE-DEV-BUILD.md` · rulings CD-P52-O2-3 (D1) · D2 · D3 · D11 (ruling 4) · H6b (มติ H6/F6). No oracle check edited (`qc-pos-p5.2.mts` untouched); generator OVERRIDES edited for notes/rows of the touched surfaces only, `pos-authz-matrix.json` regenerated with `--write` (398 → 400 rows).
Scratch/logs: `/tmp/claude-0/-root/9878a238-0754-5958-805a-a0391fccc617/scratchpad/p52-fix-dedev/` (one `<label>.log` per run).

## Commits (check ↔ commit ↔ red-before / green-after)
| check | commit | red-before | green-after |
|---|---|---|---|
| D11 | abbd7d1a | base 9e2a219c (= fix-abcf R1 head 7940c779 record, 48/53): 15/15 not POS_LINKED · A1 rows changed | @abbd7d1a `p52-after-d11.log` 49/53: "ไม่ POS_LINKED 0/15 · แถว A1 เปลี่ยน 0 · บวก A3 เขียนได้ 13/15" (archiveCategory/resetDailyStock refused/EMPTY on A3 = fixture, threshold ≥ 12) |
| H6b | 75dec657 | @abbd7d1a: "saveCreditAccountAction ✗ ok · posTipLedgersAction ✗ ok · บัญชีเครดิต 0→1" (the other 6 refused) | @0de07d33 `p52-after-dev.log`: MANAGER[A1] 8/8 refused · values unchanged · MANAGER_ALL ×4 ok · OWNER tip ok |
| D1 | 0de07d33 | @abbd7d1a: "OWNER จับคู่ P2/P3 ok แต่ ไม่มีคุกกี้เครื่อง" | QC4 (no key): OWNER P2/P3 = DEVICE_KEY_UNSET, no row · cashier PERMISSION_DENIED · no creds key in device/shift files |
| D2 | 0de07d33 | @abbd7d1a: "อ้างเครื่อง Y จาก client → เปิดกะได้" | QC4: claim Y → DEVICE_NOT_PAIRED · positive skipped (key unset) |
| D3 | 0de07d33 | @abbd7d1a: "อ้างเครื่องของกะ Z จาก client → อ่าน X ได้" | QC4: claim Z → PERMISSION_DENIED · positive skipped (key unset) |

D1/D2/D3 are one commit: one ruling (CD-P52-O2-3) and D2/D3's positive controls replay the D1 cookie.

Follow-up **87d0bdbf** (side suites at 0de07d33 found it): `qc-pos-p2.13` ST6 wanted REST rows for the 2 new codes (`http-errors.ts`: DEVICE_KEY_UNSET 503 upstream_unavailable · DEVICE_NOT_PAIRED 409 state_conflict; `docs/api/POS-API.md` regenerated) · `qc-pos-p3.6` ST4 (shift.ts byte-equal to its pin) and `qc-pos-p3.9` ST4 (register-shared.ts forbidden) went red because 0de07d33 had added DEVICE_NOT_PAIRED there ⇒ the code moved into `PosDeviceRefusalCode` (device-shared.ts + device.ts MSG), shift-actions returns a local `NotPaired` shape, `ShiftsClient` maps it to `pos.register.errors.deviceNotPaired`; shift.ts and register-shared.ts are byte-equal to base again.

**Success path (extra run, not the oracle's gate)** — `p52-keyset-ephemeral.log`: the same suite with a throwaway `POS_DEVICE_KEY` generated per run (`openssl rand -hex 32` on the command line, never printed or stored; `.env.qc4` untouched) = 53/53: D1 "P2 ok คุกกี้ shark_pos_device(241) · P3 ok" · D2 "อ้าง Y → DEVICE_NOT_PAIRED · บวก ok ผูก P2" (tampered cookie refused) · D3 "อ้าง Z → PERMISSION_DENIED · บวก ok". The oracle needs no key from the environment to go green.

## D11 — the 15 legacy writers (`src/lib/actions/restaurant.ts` @0de07d33)
Gate for all 15: `ctx()` → `requireUnit(unitSlug)` + `assertCan(…, { module: "restaurant", action, unitId: unit.id })` (`:36–42`, `rbac.evaluate` with the unit = the V2 branch gate) → then `posLinkedUnit(tenantId, unitId)` ⇒ `redirect(<base>?err=POS_LINKED)` (LEG pattern, marker `// POS P5.2 ▸ D11 … ◂`). The unit of every id (category/option group/choice/item/zone/table) is the slug's unit: the module functions take `(tenantId, unitId, id)`.

| # | writer | key (ctx line) | POS_LINKED gate line |
|---|---|---|---|
| 1 | updateSettingAction | restaurant.setting.update (:49) | :50 |
| 2 | kitchenPauseAction | restaurant.kitchen.pause (:75) | :76 |
| 3 | createStationAction | restaurant.station.create (:87) | :88 |
| 4 | createCategoryAction | restaurant.category.create (:96) | :97 |
| 5 | archiveCategoryAction | restaurant.category.archive (:106) | :107 |
| 6 | createOptionGroupAction | restaurant.optionGroup.create (:114) | :115 |
| 7 | archiveOptionGroupAction | restaurant.optionGroup.archive (:137) | :138 |
| 8 | setChoiceStockAction | restaurant.choice.setStock (:144) | :145 |
| 9 | setItemStockAction | restaurant.item.setStock (:193) | :194 |
| 10 | archiveItemAction | restaurant.item.archive (:223) | :224 |
| 11 | resetDailyStockAction | restaurant.item.resetStock (:236) | :237 |
| 12 | createZoneAction | restaurant.zone.create (:244) | :245 |
| 13 | archiveZoneAction | restaurant.zone.archive (:252) | :253 |
| 14 | createTableAction | restaurant.table.create (:259) | :260 |
| 15 | archiveTableAction | restaurant.table.archive (:269) | :270 |

**Deviation (needs R1 eyes)**: the POS KDS screen paused the kitchen through the legacy `kitchenPauseAction` (P2.6U มติ 3). With writer 2 closed on linked units that button would break, so the KDS now uses a new POS action: `kds-actions.ts#kdsKitchenPauseAction` (sessionScope "pause" = restaurant.kitchen.pause at the unit) → `kds.ts#kdsSetKitchenPause` (kscope re-check, audit `pos.kds.kitchenPause`, `releaseHeldOrders` on resume like HF-FU a) → facade `restaurant/index.ts#kitchenSetPauseInTx` (new, `restaurant/kitchen.ts`, upserts the two pause columns). `KdsScreen.tsx` switched (refusal shown with `kdsRefusalMessageKey`). The legacy `kitchenPauseAction` body is unchanged (qc-hf-fu static check). New matrix row (CASHIER=allow copied from the sibling `kdsSetAutoAcceptMaxAction` inference).

## E — H6b
- `credit.ts#saveCreditAccount`: after the shop-level `pos.credit.manage`, `canOnAllLinkedUnits(prisma, ctx, actor, pos.credit.manage)` (OWNER / `"*"` / key on every linked unit) ⇒ single-branch MANAGER = PERMISSION_DENIED.
- `tip-ledger.ts#posTipLedgersFor(ctx, m)`: `canOnAllLinkedUnits(…, pos.settings.payment)` then the reader; `tip-ledger-actions.ts` calls it (the action file still has no prisma — P2.9U fix1 L1). The tip setting writer `updatePosPaymentSettings` is OWNER-only already.
- The 6 system-wide settings rows were already all-linked-units / OWNER-only (oracle2 §1 F6) — untouched.
- Matrix: `posTipLedgersAction` MANAGER deny → **cond** (ruling: OWNER or MANAGER with every unit) · credit row note. F4/F11 untouched (W37/W38).

## Device (CD-P52-O2-3 · D1 D2 D3)
- `device-cookie.ts` (new, node:crypto only): `v1.<b64url claim {v,t,u,d,c,iat}>.<b64url HMAC-SHA256>`; HMAC key = SHA-256("pos-device-cookie:v1:" + `POS_DEVICE_KEY`); key < 32 chars = unset; no fallback key; verify never throws, timing-safe.
- `registerDeviceAction`: sessionScope `pos.device.manage` (cashier = PERMISSION_DENIED) → key unset = `DEVICE_KEY_UNSET` before any row → `registerDevice` → cookie `shark_pos_device` (httpOnly · secure = `secureCookies` · sameSite strict · path / · 400 days). Registering an ACTIVE code again re-pairs this browser. Revoked device = cookie dead (row must be ACTIVE).
- `device.ts#pairedDevice(scope, cookie)`: claim tenant + unit must match, and `PosDevice {id, deviceCode, status ACTIVE}` must exist.
- `devicePairingAction` (new, pos.device.manage): `{keyConfigured, pairedDeviceId}` for `DeviceSettings.tsx` — key-unset card `pos-device-key-unset` + button `pos-device-pair-this` (registered code without this browser's cookie; inventory row added).
- `shift-actions.ts#pairedScope`: openShift / currentShift / xReport / shiftsPageData take the device from the cookie only. openShift: no cookie or payload deviceId ≠ cookie = `DEVICE_NOT_PAIRED` (D2). xReport: the "device of the shift" exception for STAFF without manage = cookie only (D3); shiftsPageData uses the same (else the page would be a second X door). closeShift / Z / cash movement / recount keep the client deviceId, which can only refuse (revoked device), never grant.
- New codes (after 87d0bdbf): `PosDeviceRefusalCode` + `DEVICE_KEY_UNSET` + `DEVICE_NOT_PAIRED` (shift actions return it; shift.ts unchanged) · REST rows in `http-errors.ts` · i18n th/en: `pos.device.errors.deviceKeyUnset`, `pos.device.keyUnset`, `pos.device.pairThis`, `pos.device.pairedHere`, `pos.register.errors.deviceNotPaired`.

### Env key note
`POS_DEVICE_KEY` added to `src/lib/env.ts` as `z.string().optional()` and one line in `.env.example` (`POS_DEVICE_KEY=""`). No machine `.env*` file was edited or read for values (`.env.qc4` checked for the line's presence only: absent). **Until the key is set on an environment, no browser can be paired and no shift can be opened from the shifts page there** (ruling: unset ⇒ pairing refused; D2: open-shift binds from the cookie only). Prod deploy must set it first (P6 runbook / W-device), then a manager pairs every register once (Settings › Devices › "Pair this browser").

### Residuals for R1 / hunter (not in this batch)
1. The register's sale path still takes `deviceId` from the client to find the device's shift (`register-actions.ts`), so a cashier can still ring a sale into another paired device's open shift. Not in D1–D3; same class as D1c.
2. One cookie per browser: pairing the same browser in another unit replaces the cookie (a laptop that moves between branches re-pairs).
3. `currentShiftAction` now refuses without a cookie (no UI caller today).
4. No key rotation story: changing `POS_DEVICE_KEY` invalidates every cookie (managers re-pair).

## Verification (QC4 · qc4.sh + POS gate lock · iso 3G · one DB suite at a time · temp tenants only · product head 87d0bdbf, 10:48–11:40Z)
pos-pre-submit hardcodes ISO_MEM 5G (as before); strict tsc ran at heap 8192 / ISO_MEM 10500M under `flock /tmp/pos-gate.lock` with ≥ 9 GB free.

| suite | result @87d0bdbf |
|---|---|
| qc-pos-p5.2 (pre-submit run1 / run2) | **53/53 ×2** · F4/F11 pendingOwner · guardHits 0 · residue 0 |
| qc-pos-p5.2 `--no-db` | 22/22 (M1–M5 green, 400 rows) |
| qc-pos-p5.2 with a throwaway POS_DEVICE_KEY (success path) | 53/53 (×2: @0de07d33 and @87d0bdbf) — D1 cookie 241 chars · D2 positive bound P2 · D3 positive ok |
| qc-pos-p1.6 · p1.1 · p1.3 · p1.18 · hf-tx (pre-submit) | 48/48 · 180/180 · 128/128 · 81/81 · 22/22 |
| qc-pos-p2.4 (HF-PP P9) · p2.8 (HF-PP2 P10) · p1.7 (HF-PP R4b) | 50/50 · 61/61 · 33/33 |
| qc-pos-p1.15 · p2.13 · p3.9 (TL7) | 40/40 · 54/54 · 48/48 |
| shift/device: qc-pos-p1.9 · p1.9b · p1.10 · p1.11 · p1.12 | 53/53 · 22/22 · 40/40 · 38/38 · 72/72 |
| touched modules: qc-pos-p2.6 (KDS) · p3.6 (credit) · p2.9 (tips) · p4.1 (static) | 67/67 · 52/52 (pumpErrors 1: `pos.sale.refunded` P2002, intermittent — 1 of 8 earlier runs in /root/pos-runs had it too; no refund code touched) · 62/62 · 16/16 |
| qc-pos-p2.10 `--no-db` | 2/2 |
| pos-authz-matrix-gen `--check` | ✅ (400 rows) |
| fitness noenv / qc4 / pos · gen-check | 53/53 · 53/53 · 8/8 · ✅ |
| strict tsc | 0 errors (@87d0bdbf, 11:09Z; also 0 at the pre-follow-up working tree) |
| pos-pre-submit `--wo qc-pos-p5.2 --set core` | green 12 · red 2 = expected lane pins HF-FU-ST1 (src/lib/modules/restaurant changed vs c3c52ef1 — already red at base from eec1d20f; this batch adds kitchen.ts + index.ts) · HF-FU2-ST1 (hunks without an HF-FU2 marker vs 72669941, + DeviceSettings.tsx) · unexpected red: none |

Side suites at 0de07d33 (before the follow-up) found P2.13-ST6 · P3.6-ST4 · P3.9-ST4 — all green at 87d0bdbf.

## Open items for the controller
1. **Deploy order (W-device)**: set `POS_DEVICE_KEY` on prod before this ships; without it the shifts page cannot open a shift anywhere (by ruling). After deploy, a manager pairs each register once. P6 runbook should carry this.
2. Residuals 1–4 above (sale path still trusts the client deviceId; one cookie per browser; currentShiftAction refuses without a cookie; no key rotation) — for R1/hunter to rule.
3. KDS pause moved to a new POS action (deviation above) — R1 to confirm.
4. Lane-pin re-pin at merge: HF-FU-ST1 · HF-FU2-ST1 (plus the ones listed in pos-P5.2-fix-abcf.md item C if still open).

## R1 round 1 (controller ruling CD-P52-O4 · 23 Oct 12:0xZ–) — R1 report `scratchpad/p52-r1-dedev/REPORT.md` (MERGEABLE-AFTER-FIXES)
Base a786a9df (product 87d0bdbf). Same rules (QC4 · qc4.sh · POS gate lock · iso 3G · one DB suite at a time · temp tenants only). Red-before = oracle edit dc3405aa on product 87d0bdbf (`o4-redbefore.log` 51/54); green-after = `o4-green1.log` @e52bcd1a 54/54.

| item | commit | red-before (dc3405aa + product 87d0bdbf) | green-after |
|---|---|---|---|
| ORACLE-EDIT (D4 · F6 · F3 · F5 · F7 cookie) | dc3405aa | — (`--no-db` 22/22 · `--self-test` 8/8 · registered 56) | — |
| F1 D4 sale path | b4c05ec9 | no cookie + claim Z: sale / staffToken Z / manager PIN → ok **bound to shift Z** (bills on Z 0→3) · status returns shift Z · cookie P4 + claim Z → bound to Z · staffToken P4 on cookie P4 → STAFF_TOKEN_INVALID · staffToken Z on cookie P4 → ok · sale with a revoked device's cookie → ok · cash movement without deviceId/cookie → ok | no cookie: sale / staffToken Z / PIN / status → DEVICE_NOT_PAIRED · cookie P4: sale bound to P4 · token P4 ok · token Z STAFF_TOKEN_INVALID · PIN ok (bound P4) · revoked cookie: sale + cash DEVICE_REVOKED · cash without device → DEVICE_NOT_PAIRED |
| F2 matrix | e52bcd1a | rows CASHIER=allow (kdsKitchenPause · kdsSetAutoAcceptMax) · intent MANAGER=allow | CASHIER=deny, perm restaurant.kitchen.pause (now probed by R1/R2) · intent MANAGER=cond · `--check` ✅ 400 rows · M1–M5 green |
| F3 pairing audit | b4c05ec9 | D1: audit pos.device.pair Δ0 for P2, P3 and re-pair | Δ+1 each (re-pair of ACTIVE P2: new cookie, +1 audit, no new row) |
| F4 refund device | b4c05ec9 | refund took `refund.deviceId` from localStorage while the label used currentShiftAction | refund-actions drops the client deviceId; refund and label both use the cookie device (strip mode: no cookie = refund outside a shift, as before when no device was sent) · p1.8 49/49 |
| F5 credit/tip "*" | 549c0964 | H6b: MANAGER_ALL (A1+A2 enumerated) saveCreditAccount ok (account changed) · tip ledger ok | MANAGER_ALL denied ×2 (no change) · MANAGER("*") ok ×2 · settings writers keep all-linked-units (MANAGER_ALL ok ×3) |
| F6 in-process key | dc3405aa | QC4 runs skipped every positive control ("ข้าม (กุญแจไม่ตั้ง)") | `deviceKey: in-process` in JSON_SUMMARY · D1 cookie 241 chars · D2/D3/D4 positives run · key-unset sub-case → DEVICE_KEY_UNSET, no row, no cookie |
| F7 iat max age · F8 citations | 350bae83 | iat unchecked | verify rejects iat older than 400 days or > 5 min ahead · no `__Host-` (http QC/dev) · comments cite CD-P52-O2-2 + CD-P52-O2-3 |

### Binding rules after F1 (device-request.ts)
- `bind`: cookie ACTIVE = that device · cookie of a revoked device = DEVICE_REVOKED · no/invalid cookie + the unit has ACTIVE devices = DEVICE_NOT_PAIRED · unit with no devices at all = legacy no-device path.
- `strip`: same, except no cookie = no device (no refusal).
- register-actions: the client deviceId never enters ctx. quote override, submit, status, hold, recall and discard use `bind`. Catalog, scan and member lookups never had a device.
- shift-actions: open = bind + device required (D2) · cash movement = bind · close = bind, unpaired allowed only with pos.shift.manage (managers close a revoked device's shift from the shifts page) · X / current / page data = strip.
- refund-actions: strip, client `refund.deviceId` dropped.
- shift.ts, register.ts, register-ui.tsx not touched. New codes go back through `RegDeviceRefusal` / `NotPaired` shapes; REFUSAL_KEY DEVICE_NOT_PAIRED → errors.deviceNotPaired.

### Open items (round 1)
1. **qc-pos-p3.6 CR4 red (F5 consequence, needs an ORACLE-EDIT ruling)**: CR4 expects "ผู้จัดการ (ปริยาย pos.credit.manage) → ok" for its MGR fixture `unitAccess [U.A]`. That manager covered every linked unit, so it passed the all-linked-units gate; under F5 only OWNER / MANAGER "*" pass ⇒ PERMISSION_DENIED. Not edited (not my oracle). Proposed edit: MGR fixture `["*"]`, or expect PERMISSION_DENIED + add a "*" control.
2. Lane-pin reds caused by F1 touching `register-actions.ts` / `refund-actions.ts` / `register-shared.ts`: P3.9-ST4 · P2.10-ST2 (`--no-db`) · HF-FU-ST1 · HF-FU2-ST1 — re-pin at merge.
3. Still open (not in F1's list): `table-actions` · `deposit-actions` · `payment-intent-actions` · `order-actions` · `staff-pin-actions` (staff token issue) still read a client deviceId; the offline sync route was not reviewed. Same class as F1 — for the hunter/controller.

### Verification @e52bcd1a (12:36–13:2xZ)
| suite | result |
|---|---|
| qc-pos-p5.2 (pre-submit run1 / run2 · + o4-green1) | **54/54 ×3** (D4 green) · F4/F11 pendingOwner · deviceKey in-process · guardHits 0 · residue 0 · `--no-db` 22/22 |
| p1.6 · p1.1 · p1.3 · p1.18 · hf-tx (pre-submit) | 48 · 180 · 128 · 81 · 22 — all green |
| p2.4 · p2.8 · p1.7 (hf-pp/pp2) | 50 · 61 · 33 — green |
| p1.9 · p1.9b · p1.10 · p1.11 · p1.12 | 53 · 22 · 40 · 38 · 72 — green |
| p1.15 · p2.13 · p1.8 (refund) · p1.5 (held carts) · p2.6 · p2.9 · p4.1 | 40 · 54 · 49 · 21 · 67 · 62 · 16 — green |
| p3.9 | 47/48 — ST4 lane pin (register-actions / refund-actions / register-shared) |
| p3.6 | 51/52 — **CR4** (open item 1, F5 consequence) |
| p2.10 `--no-db` | 1/2 — ST2 lane pin |
| matrix `--check` | ✅ 400 rows |
| fitness noenv / qc4 / pos · gen-check | 53 · 53 · 8 · ✅ |
| strict tsc | 0 errors @e52bcd1a |
| pre-submit `--wo qc-pos-p5.2 --set core` | green 12 · red 2 = expected lane pins HF-FU-ST1 · HF-FU2-ST1 · unexpected none |

## R1 round 1b (controller ruling CD-P52-O4b · 23 Oct 13:1xZ–) — final round
Base fcf5eecf (product e52bcd1a). Commits: **af57b311** ORACLE-EDIT (qc-pos-p5.2 D4 groups + D2 close-shift override · qc-pos-p3.6 CR4) · **1ab99b10** item 2 · **c81988ad** item 1 · **c27ea9cc** cookie verify: canonical base64url only (pre-submit run1 at c81988ad had a flaky D2 "tampered cookie → opened": the tamper flips the last char, and 115/2000 random MACs decode to the same bytes when only padding bits change; 0/2000 pass the new canonical check). Red-before = af57b311's oracle run on product e52bcd1a (files checked out from e52bcd1a into the tree, then restored; `o4b-redbefore.log` 52/54, `o4b-redbefore-p36.log`).

| item | red-before | green-after |
|---|---|---|
| 1 device scope everywhere (D4 groups) | no cookie + claim Z: deposit → VALIDATION · payment intent → PROMPTPAY_NOT_CONFIGURED · order key-in → VALIDATION · staff PIN → **ok** (token for Z) — none stopped at the device | all four bind groups → DEVICE_NOT_PAIRED without a cookie, pass the device gate with cookie P4 (staff PIN ok, token bound to P4) · tables (strip) never DEVICE_NOT_PAIRED |
| 2 close shift without cookie (D2) | STAFF → DEVICE_NOT_PAIRED · MANAGER ok but **audit Δ0** | STAFF → DEVICE_NOT_PAIRED · MANAGER ok + `pos.shift.close.override` Δ1, `source: "manager-override"`, actor = manager (skipped on an idempotent replay) |
| 3 p3.6 CR4 | @e52bcd1a with the old oracle: 51/52 (single-unit manager save → PERMISSION_DENIED) | 52/52: manager `["*"]` save ok · manager with every unit enumerated → PERMISSION_DENIED, account unchanged |

### Action table (every action that read a client deviceId · after c81988ad)
| file · action | client deviceId was used for | now |
|---|---|---|
| deposit-actions · registerTakeDepositAction | shift of the deposit (resolveRegisterShift) + revoke check | **bind** |
| deposit-actions · registerDepositLookupAction · registerRefundDepositAction | (lookup: none) · refund: shift of the cash-out | strip (refund outside a shift without a cookie, as for sale refunds) |
| payment-intent-actions · createPaymentIntentAction | intent.deviceId (input must equal ctx) + revoke check | **bind** · input.deviceId replaced by the cookie device (unit without devices: input code as before) |
| payment-intent-actions · confirmPaymentIntentManualAction | device of the confirmer (revoke) | **bind** |
| payment-intent-actions · cancel / status / updatePosIntentSettings | not used | strip |
| order-actions · ingestOrderAction · acceptOrderAction · payOrderAction | shift of the order bill (deviceShift) | **bind** (+ DEVICE_NOT_PAIRED in OrderRefusalCode) |
| order-actions · reject / preparing / ready / handOver / cancel / prep / settings / list / get | void/cancel actor ctx only | strip |
| staff-pin-actions · verifyStaffPinAction | device the staff token is bound to | **bind** · token bound to the cookie device (unit without devices: payload code) |
| staff-pin-actions · set / setOwn / unlock / listStaffForDevice | revoke check · staff list for the device | strip |
| table-actions (16) · table-split-actions (6) · table-ui-actions (2) | priced rounds / manager PIN revoke check / bill preview | strip |
| qr-staff-actions (7) · kds-actions (17) | ctx only | strip |
| bills-actions · voidSaleAction | void ctx (drawer of the device) | strip |
| pos-approval-actions · cancelPosApprovalAction | staff token device | strip (cookie device) |
| chat-link-actions · requestChatPaymentAction | payment request ctx | strip |
| hr-link-actions · posClockAction | clock by staff token at the device | strip (cookie device; no cookie = token refused) |
| shift-actions · zReport / recount / list / offShift | not used (scopeOf) | client deviceId dropped |
| shift-actions · close | — | bind; unpaired only with pos.shift.manage at the unit + override audit (item 2) |
| `/api/pos/sync` (route) | device of the offline bills (token, shift, revokedAt) | cookie device ACTIVE **or revoked** (facade keeps the revokedAt ≤ soldAt rule, P3.4 CD-12) · no cookie + registered devices = 409 DEVICE_NOT_PAIRED · unit without devices = body code |
| display-actions · enable / revoke / update customer display | **target** PosDevice id chosen by a manager (pos.device.manage), not "this device" | unchanged (object id, not identity) |

Unit with no registered devices: nothing to impersonate and no shift can be opened (D2), so the payload code is only accepted for intents, staff PIN and offline sync there.

### Verification (product c81988ad 13:4xZ–14:2xZ · final c27ea9cc 14:3xZ)
| suite | result |
|---|---|
| qc-pos-p5.2 @c27ea9cc ×2 | **54/54 ×2** · F4/F11 pendingOwner · deviceKey in-process · residue 0 (pre-submit @c81988ad: run1 53/54 D2 flake above · run2 54/54 · `--no-db` 22/22) |
| p3.6 | **52/52** (CR4 green) |
| p1.6 · p1.1 · p1.3 · p1.18 · hf-tx (pre-submit) | 48 · 180 · 128 · 81 · 22 |
| p2.4 · p2.8 · p1.7 · p2.9b · p2.7 · p2.5 · p1.5 · p1.8 | 50 · 61 · 33 · 53 · 42 · 49 · 21 · 49 — green (tables · orders · intents · deposits) |
| p1.9 · p1.10 (also ×1 @c27ea9cc) · p1.11 · p1.12 · p1.15 · p2.13 · p2.6 · p2.9 · p2.14 · p4.1 | 53 · 40 · 38 · 72 · 40 · 54 · 67 · 62 · 60 · 16 — green |
| lane-pin reds (files of this branch vs other cards' pins — re-pin at merge) | p3.9 ST4 · p2.10 ST2 (`--no-db`) · p2.11 ST4 · p2.12 ST1 · p3.7 ST3 (refund-actions + older held-cart/refund hunks) · p3.4 ST2 (staff-pin.ts/register.ts hunks of P3.5 / fix B, not this round) · HF-FU-ST1 · HF-FU2-ST1 |
| qc-pos-p5.1 | 10/15 — MA2 MA4 MA5 MA6 MA7: P5.1 fix batches B/C are not in this branch's base (9e2a219c; merged later in session/pos 6b1f84a5); no POS money-core file of those checks touched here — re-run after merge |
| matrix `--check` | ✅ 400 rows (@c27ea9cc) |
| fitness noenv / qc4 / pos · gen-check | 53 · 53 · 8 · ✅ |
| strict tsc | 0 errors @c81988ad and @c27ea9cc |
| pos-pre-submit `--wo qc-pos-p5.2 --set core` @c81988ad | green 11 · lane pins 2 · run1 D2 flake → fixed by c27ea9cc (p5.2 ×2 re-run green there) |

Rule note: one helper command this round started with a no-op `cd /dev/null` (it failed; no directory change). No other `cd`.
