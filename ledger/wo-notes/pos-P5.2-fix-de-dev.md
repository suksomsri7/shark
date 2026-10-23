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
