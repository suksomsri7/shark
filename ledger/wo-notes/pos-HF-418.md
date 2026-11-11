# POS HF-418 — React #418 (hydration text mismatch) on the register

Branch `wip/pos-hf-418` from `348c6d47` (tmp/p118u-merge) · tree p11 · builder account B · 9 Oct 2026.

## Symptom
Controller visual runs (`visual-pos.mts --page register --states`) report `Minified React error #418 … args[]=text` on a
different register state each run: vis48 `stock-warn` cashier 1024 · vis49 `staff-switch` cashier 1024 ·
vis52 `paydlg-member-capped` owner 1440 and `discount-over-sheet` owner 1440 (en).

## Root cause (one)
`src/components/pos/register/LockScreen.tsx:68` (base 348c6d47) `const [now, setNow] = useState(() => new Date())`
rendered at `:324` `formatThaiTime(now)` ("HH:MM") and `:325` `formatThaiDate(now)`.

Why it is server-rendered: `RegisterScreen.tsx:504` keeps `staff === undefined` until the mount effect reads
sessionStorage (`:513-519`), and `deviceKnown` is false, so `locked = lockFlag || (!staff && !noPinMode)` (`:574`) is
**true during SSR and the first client render** ⇒ `<LockScreen>` (`:2601`) is part of the hydrated tree on every register load.
The server evaluates `new Date()` at SSR time, the browser evaluates it again at hydration time. When a minute boundary
falls between the two (SSR → HTML → JS download → hydrate, ~1-5 s on the loaded VPS), the text differs ⇒ #418 "text".
Per-load probability ≈ latency/60 s, which matches "1-2 random states out of ~80-86 shots per run" and is independent
of the state's own steps (the error fires on the initial goto, before `runState`).

Evidence: the three failing screenshots that still exist (not overwritten by a later run) in
`/root/projects/shark-pos-d/.qc-shots/pos/` were written at 21:08:**07**, 20:54:**06**, 15:40:**04** UTC — all within 8 s
after a minute boundary; base rate for all 360 register shots of the same runs is 38/360 (10.5 %) ⇒ p ≈ 0.001 by chance.
(The 4th, vis48 stock-warn, was overwritten by vis49.) Midnight would also flip `formatThaiDate`.

## Candidates checked and ruled out (server = client by construction)
- `RegisterTopContext.tsx:131` shift chip `formatThaiTime(openedAt)` — fixed server timestamp, `Asia/Bangkok`, `th-TH` both sides.
- `RegisterTopContext.tsx:200` "ซิงก์ล่าสุด HH:MM" — `lastSyncAt` is `null` until an effect (`RegisterScreen.tsx:312/314`).
- `RegisterScreen.tsx:2468` offline banner `offlineSince ?? new Date()` — only when `!online`; `online` starts `true` (`:310`), set in effect.
- `RegisterStatusBar.tsx:45/49` counts `toLocaleString("th-TH")` of server props (deterministic); device/printer block only after `device` leaves `undefined` (`RegisterScreen.tsx:741`, effect).
- `LockScreen.tsx:293` "locked at" — `lockedAt` is `null` at SSR (`RegisterScreen.tsx:510`); `:265/:317/:504` are server timestamps.
- `ApprovalWaitDialog.tsx:41`, `PayIntentPanel.tsx:82` `Date.now()` state; `MemberPanel.tsx:157` `memberAgo()`; HeldBillsDrawer — client-only dialogs (never in the SSR tree).
- `RegisterScreen.tsx:214` `newKey` (Date.now+Math.random) — used as keys/idempotency, not text.
- `useInApp`, `useMedia`, `getPosDeviceId`, `readStaffSession`, `LocaleChooser` (`useLocale` from the same request) — all effect-based or server-provided.
- Node vs Chromium ICU for `th-TH`/`Asia/Bangkok`: a format difference would fail on **every** load (shift chip is in every SSR), not randomly ⇒ not the cause.
- Harness: `injectStaff` uses `evaluateOnNewDocument` to set sessionStorage only (read in an effect) — it does not inject DOM text ⇒ not a harness bug.

## Fix
`src/components/pos/register/LockScreen.tsx` only:
- `now` starts `null` (`useState<Date | null>(null)`); the existing interval effect first does `setNow(new Date())`.
- Header: `now` ⇒ the same two spans as before (time + date, classes unchanged, time span gets `data-testid="pos-lock-clock"`);
  `null` (SSR/first frame) ⇒ one `invisible aria-hidden` "00:00" placeholder with the time's classes so the header does not shift.
- No `suppressHydrationWarning`, no new Thai literal, th/en strings untouched.

## Expected after a controller build + visual run
0 × #418 on all register states (owner/cashier, th/en, 390/1024/1440), because no SSR text in the register tree depends
on the render-time clock any more. States previously hit (stock-warn, staff-switch, paydlg-member-capped,
discount-over-sheet) were victims of timing, not of their own steps.

Remaining flakiness: none known for #418. Unrelated pre-existing failures in the same logs (`member-attached`/
`paydlg-member-*` 390 "แตะแถวสมาชิกแล้วแผงไม่ปิด", `sale-done` 1440 in p1.11u-r2) are not hydration and not touched here.

## Gates (p11, 9 Oct ~21:40-22:00Z)
| gate | result |
|---|---|
| typecheck (iso + /tmp/pos-gate.lock) | rc 0 |
| qc-pos-p1.3 | run 1: 127/128 (S1.9 — another lane's temp product `PQC-VIS-163163-OUT` matched the search) · run 2: 125/128 (S1.9 + S9.1/S9.2 drift from a concurrent lane) · run 3: **128/128 rc 0** |
| qc-pos-p1.12 | **72/72 rc 0** |
| qc-pos-p1.15 | runs 1-2: 38/39 (Z2 fingerprint drift: approvalPolicy/approvalRequest/PosStaffPin removed by another lane's visual cleanup, posSale +1) · run 3: **39/39 rc 0** |
| qc-pos-p1.18 (U phase auto) | **81/81 rc 0**, ST7 = 0 ✅ |
| `pnpm fitness` (env -i) | **41/41 rc 0** |
| visual `--page register --states --dry` | owner rc 0 (86 shots) · cashier rc 0 (83 shots) |
| lint | not run (`eslint` not installed in shared node_modules) |

The red runs were shared-DB interference (other lanes on `posqc-coffee`); this change is a client component with no server/DB effect.
