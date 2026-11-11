# POS P4.3 fix4 — device pairing for the walker + perf harness (after P5.2 D+E) · help rows

Builder S · tree `/root/projects/shark-pos-b` · branch `wip/pos-p4.3-fix4` from `66f4dede` · code commit `aaf4d89f` · written 2026-10-24T08:25Z.
Scripts and ledger only. No `src/`, `prisma/` or `.env*` change. No other oracle touched (only the fixture/pairing part of `qc-pos-p5.3.mts`). No product change needed.

## Why
Since P5.2 D+E (98f60761), server actions take the device from the signed cookie `shark_pos_device` only (`device-request.ts`). Both harnesses still set only localStorage, so on QC5 (a35fe494): open shift / manual order were refused "เครื่องนี้ยังไม่ได้จับคู่กับสาขา", `pos-reg-pay` stayed disabled, the paydlg chain and the lock-screen keys were dead, and perf B4 showed `pos-reg-shift-required` plus the lock screen.

## How pairing is done (`scripts/pos-device-pair.mts`, new, pure node: no `@/`, no DB, no env)
1. Open a separate page in the target browser context and set the OWNER session cookies on it. The caller mints the session and deletes it later.
2. `evaluateOnNewDocument` sets localStorage `shark.pos.deviceId` = the fixture device code. All browser code is passed as strings, so tsx keepNames cannot inject `__name` (CD-P53-O13).
3. Go to `/app/sys/<sys>/pos/settings?tab=devices&unit=<unit>`. Poll the DOM:
   - `pos-device-key-unset` → **key-unset**. The caller blocks.
   - `pos-device-load-error` → load-error.
   - `pos-device-pair-this` enabled → click it. This is the normal case: the fixture registered the code, and a fresh context has no cookie.
   - `pos-device-register` enabled for 2.5 s after the list loads → click it, set the name `ตัวกด P4.2`, confirm. The 2.5 s wait gives `devicePairingAction` time to show the key card first, so the walker never registers when the key is unset.
4. Wait for `pos-device-note`, or for `pos-device-error` / `pos-device-register-error`. An error that mentions กุญแจ is reported as key-unset.
5. Verify both of these, else the result is a named failure (`no-cookie` / `unverified`):
   - The page shows the `devicePairingAction` paired state: no pair-this button, no key card, and the register button is disabled ("ลงทะเบียนแล้ว").
   - The context really holds the httpOnly `shark_pos_device` cookie. `page.cookies` reads httpOnly; the value is never printed.
6. In `finally`, delete the owner session cookies (`shark_session` / `__Host-shark_session`) from the context and close the page. The device cookie is context-level, so it stays for the walker's page.

`inspectPairing` is the read-only variant used by the pre-flight: same page, never clicks. `--self-test` checks the pure decision functions, 14/14.

## Walker (`qc-pos-buttons.mts` + `pos-buttons-fixtures.mts`)
- **Every `runGroup` context of a staff cell** (owner / manager / cashier, every device and locale) pairs before the cell user's cookies are set: `pairCtx` → `pairBrowserDevice`. The owner session is minted once per run (`sessionCookies(T.users.owner.userId)`, kept in `SESSIONS`, deleted in cleanup).
  - Device code = `CTX.deviceCode`, still one per cell, so the shift opened through the module (`openShift … deviceId: c.deviceCode`) and the staff token (`issueStaffToken deviceId`) match the paired device. `verifyStaffPinAction` binds to the cookie device.
  - Public cells do not use a device and are skipped (`CTX.persona === null`).
- **Run pre-flight (writes, QC5):** after `ensureFixtures` has registered the device and the browser has started, pairing runs once in a throwaway context. It prints `PF ok|block device-pairing …`. A block throws `pre-flight มีข้อขวาง: device-pairing (<state>: …)`, which sets FATAL: no group runs, and every row is "ไม่ได้รัน (FATAL)".
- A pairing failure inside a group throws, so that group's rows become `error` with the reason. A key-unset failure mid-run sets FATAL and the loop stops (`if (FATAL) break`).
- The summary JSON gains `devicePairing {ok, fail, how, last}`.
- `--page` accepts a comma list (`register,shifts,orders`). The old regex rejected commas, so the brief's smoke command would have died. Nothing else changes: `--list` cell counts are the same as before (owner-desktop 1193 … 19 cells, 15700).
- **`pos-buttons-fixtures --preflight --base <loopback url>`** (QC5 only) adds:
  - `server-device-key`: ok, or **block** when the key card shows.
  - `server-pair-<u>`: `pos-device-pair-this` offered = ok · code not registered yet = would-create · anything else = block.
  It writes nothing except a temporary owner session, deleted in `finally`.
  - Without `--base`: a `warn` row says the key was not checked and that the real run checks and blocks.
  - With `--base` on QC4: block, because the session mint is QC5-only.
  Both cases were checked on QC4.

### Probe: server started **without** `POS_DEVICE_KEY` (from the code; the controller runs it)
- `posDeviceKeyConfigured()` is false, so `devicePairingAction` returns `keyConfigured:false`, so `DeviceSettings` renders `pos-device-key-unset`, and `needsPair` is false (no pair-this button).
- `pairDecision` returns `key-unset` (covered by the self-test cases "การ์ด" and "การ์ด + ปุ่มลงทะเบียนเปิด").
- The walker run then prints `PF block device-pairing … key-unset` and stops with FATAL `pre-flight มีข้อขวาง: device-pairing (key-unset: เซิร์ฟเวอร์ยังไม่ตั้ง POS_DEVICE_KEY …)` before any group.
- Even if the register button were clicked, `registerDeviceAction` returns `DEVICE_KEY_UNSET` before creating any row. The error text contains "กุญแจ", so the result is still key-unset.
- `--preflight --base` gives `PF block server-device-key`.

## Perf oracle (`qc-pos-p5.3.mts`, fixture/pairing part only — the `__name`, recorder and drain edits of CD-P53-O13a–d are untouched)
- `fixtures()` also mints an owner session (`OWNER_COOKIES`, inside `SESSIONS`, so Z1 still checks it is deleted).
- `warmCtx` is now created **before B1** and paired through the UI as OWNER with `DEV = CR.deviceCode` (registered by the seed, so the pair-this path is used). This happens whenever any browser item (B1/B2/B3U/B4*) is wanted. A failure throws, so `crashed` is set and every browser metric becomes "วัดไม่ได้" with the reason.
- **Cold B1 contexts get the cookie the UI flow issued** (`DEVICE_COOKIE`, added in `preparePage`). They do not re-run the settings page, because loading it in a cold context would warm that context's HTTP cache, and B1 would no longer measure a cold start. The cookie is not tied to a browser (claim = tenant, unit, device id, code, iat), so this is the same paired identity.
- The module-opened shift for DEV is unchanged.
- **B4 static re-check:**
  - The harness persona is the cashier; the sale is cash, exact amount, via `pos-reg-paydlg-quick-exact` → confirm.
  - On the submit path for a cash sale, the only refusals that can apply are:
    - `OFF_SCHEDULE`: staff schedule (P3.5). Only if the perf tenant has an HR schedule for the cashier.
    - The device binding itself: now satisfied.
  - `CREDIT_LIMIT_EXCEEDED` applies to credit bills only.
  - No amount limit or manager PIN for cash.
  - The staff token is bound to DEV, which equals the cookie device.
  - Not verified end-to-end (no server). Budgets unchanged.

## Help-page inventory rows (`scripts/pos-ui-inventory.json`)
- **`pos-help-link-*` / `pos-help-more-*`: kept, and the walker matcher now accepts them.** Removing them is not consistent with the rules:
  - `fitness-pos` F15.3a treats the source template `pos-help-link-${k}` as the pattern id `pos-help-link-*`. That id counts as registered only through a **pattern row**; concrete rows do not count (`registered()` checks `rowExact.has` or `rowPatterns`).
  - Probe on a scratch worktree of 66f4dede with both rows removed: F15.3a **CRITICAL red** "2 ตัวไม่มีแถว: pos-help-link-* · pos-help-more-*".
  - P4.1's `matchesAny` matches pattern ↔ concrete names both ways. So the walker now treats a pattern row whose visible members all have their own rows (non-empty `notList`) as an **umbrella**: it uses the first visible member to stand for the pattern. This applies to press and visible rows only, never to absent/hiddenFor rows. The row detail notes "แพตเทิร์นร่ม: … ตัวแทน <testid>". B10 has a case for this: link-* has 8 members, more-* has 4, and faq-* / product-* are not umbrellas.
- **`pos-help-faq-*`**: expect changed to `ui` · target `pos-help-faq` · state `changes`.
  - The `<summary>` toggles `details[open]`. The answer `<p>` is always in the DOM (Chrome lays out closed `<details>` content, so the walker saw it as already visible and judged "changes" on an unchanged answer).
  - The FAQ card's markup changes when `open` is added. The walker's mutation observer watches attributes, so the dead check sees it too.
  - The page is not changed.
- Registry hash is now `c286d8367a739add`. **Every existing cell summary is stale** (P4.2 W3) and must be re-run anyway, because the pairing changes results.

## Checks (tree b · `iso.sh` ISO_MEM 3G · 2026-10-24 08:0x–08:25Z)
| check | result |
|---|---|
| `pos-device-pair.mts --self-test` | 14/14 |
| `qc-pos-buttons.mts` (gate mode) | 10/10 (B10 + umbrella + pairing decision) |
| `qc-pos-buttons.mts --list` | 19 cells · 15700 items · owner-desktop 1193 (unchanged) · `--page register,shifts,orders` lists owner-desktop 429 |
| `qc-pos-p4.1 --no-db` | 15/16 — **R8 red, already red at base 66f4dede** (same run on a scratch worktree of 66f4dede): "ghost" testids `pos-reg-banner*` · `pos-reg-lock*` · `pos-reg-limit*` · `pos-reg-quote*` come from the CD-P53-O13d page-state diagnostics in `qc-pos-p5.3.mts`, which I must not touch. Not caused by fix4. Controller ruling needed (ORACLE-EDIT of those selectors, or registry/foreign rows). |
| `qc-pos-p4.2 --self-test` | 12/12 |
| `qc-pos-p5.3` static gate | 9/9 (N1–N5 self-tests are part of the gate; there is no separate `--self-test`) |
| fitness (no env) | 53/53 · fitness-pos 8/8 (F15.3a/b green) · pre-commit fitness green |
| `pos-authz-matrix-gen --check` | matches (untouched) |
| tsc on the 4 changed scripts (scoped tsconfig in /tmp, extends repo) | 0 errors |
| `pos-buttons-fixtures --preflight` (QC4, qc4.sh + POS lock) | 0 blocks · new `server-device-key` warn row |
| `… --preflight --base http://127.0.0.1:3299 --user owner` (QC4) | block `server-device-key` "QC5 only" (negative probe) |

## Controller commands (QC5 · tree d after build · server started with an ephemeral key per CD-P43-10)
Server (controller's chain; the key is never printed or stored):
`bash scripts/qc5.sh env PORT=<port> POS_DEVICE_KEY="$(openssl rand -hex 32)" bash scripts/acc-v2-serve.sh start`. Use the POS port and env the controller's chain already uses; `acc-v2-serve.sh` inherits the caller's environment.

Optional server pre-flight:
`bash scripts/iso.sh bash scripts/qc5.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pos-buttons-fixtures.mts --preflight --user owner --base http://127.0.0.1:<port>`

1. **Smoke walker cell** (owner desktop, 3 pages):
   `bash scripts/iso.sh bash scripts/qc5.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-buttons.mts --user owner --device desktop --page register,shifts,orders --base http://127.0.0.1:<port>`
   - Expect `PF ok device-pairing posqc-btn-dev-owner … pair-this ✓`.
   - Expect `summary.devicePairing.fail = 0`.
   - The `pos-shift-open-submit` / `pos-ord-man-submit` refusals, the paydlg-* chain and the lock-key rows are no longer dead or not-paired.
   - This overwrites `summary-owner-desktop.json` with `page: "register,shifts,orders"`. Re-run the full cell (`--page all`) before P4.2.
2. **Perf B4A:**
   `bash scripts/iso.sh bash scripts/qc5.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p5.3.mts --base http://127.0.0.1:<port> --tenant <posqc-perf-tenant> --only B4A --bills 2`
   - **`--bills 1` is not accepted:** `intArg("--bills", 2, 10, 5)` silently falls back to 5. 2 is the minimum, and the bound is outside the fixture part I may edit.
   - B4A runs in the same loop as B4Q/B4P, so it also confirms 2 cash bills in the perf tenant.
   - Expect the line `── จับคู่เครื่อง <DEV> … pair-this ✓ ──`, and no `pos-reg-shift-required` / lock in the page-state file.

## Risks / open items for the controller
1. **Secure cookie over http://127.0.0.1:** `registerDeviceAction` sets `secure: secureCookies` (`APP_ENV !== "development"`). Chromium treats loopback as a secure context and should accept it. If it does not, pairing ends as `no-cookie` with that reason; it does not silently pass.
2. Audit volume: each paired context writes one `AuditLog pos.device.pair` row on QC5 (one per page-group context, plus the pre-flight). Expected and harmless, but visible.
3. Rows on the devices page see a paired browser now: `pos-device-pair-this` and the register rows take their `needs` skips (the button is gone / disabled "ลงทะเบียนแล้ว"). The rest is unchanged.
4. P4.1-R8 red from the CD-P53-O13d diagnostics (see table) needs a ruling.
5. The umbrella rule also lets a pattern row whose only visible members are concrete rows use one of them (none in the current summaries besides the help rows; checked across every summary on tree d).
