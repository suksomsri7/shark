# R1 round 2 — POS P5.2 fix D+E+device @ c139bb41 (product c27ea9cc)

Read-only; tree clean. Logs `p52-r1-dedev/logs2/` (suites `<suite>.<n>.log` · `probe2.log` = untracked copy of qc-pos-p5.2 + R1 probes at the end of runDb2, copy removed, porcelain 0, deviceKey in-process, no 64-hex string in any log).

## VERDICT: MERGEABLE
Round-1 F1–F8 are fixed and verified. What is left is LOW/INFO and can be ticketed.

## Remaining findings
| id | sev | where | evidence | proposed fix |
|---|---|---|---|---|
| R2-1 | LOW | `src/app/api/pos/sync/snapshot/route.ts:55` | still takes `deviceId` from the body. Probe: no cookie + claim Z → **200 ok**, with Z's `offlineCode`/`offlineSeq`, and a snapshot row is written for Z (uses up Z's 1-per-60s slot, so Z can be held at RATE_LIMITED). No sale/shift binding: `/api/pos/sync` now refuses (409 DEVICE_NOT_PAIRED). Not in the builder's action table | same `deviceBinding` as `sync/route.ts:61-68` |
| R2-2 | INFO | `shift-actions.ts:103-115` boundScope | manager override = `pos.shift.manage` at the unit. A **STAFF holding the key** (KEYS persona) can also close without a cookie (probe ok); STAFF without the key → DEVICE_NOT_PAIRED. A manager standing at the **revoked** register (revoked cookie) → DEVICE_REVOKED, no override; from any unpaired browser the override works | accept (by key) · optional: allow the override when the code is DEVICE_REVOKED too |
| R2-3 | INFO | `device-actions.ts:129-133` heartbeatAction | still takes `deviceCode` from args (touches lastSeen, returns that device's printerConfig). Requires pos.sale.create, binds nothing. Was there before | optional: cookie device |

## Checks (probe evidence)
1. **device-request.ts** is the single source. Every POS action file in the builder's table builds ctx from `cookieDeviceId`/`bindCtxDevice`/`requestDevice` (grep: no remaining `args/a.deviceId` into ctx). Exceptions:
   - `staff-pin-actions.ts:85`: payload fallback only when bind passed with no device, i.e. a unit with no ACTIVE devices.
   - display-actions: a target id chosen under pos.device.manage (intended).
   - snapshot route: R2-1.
   Bind vs strip:
   - Bind: hold-cart without cookie → DEVICE_NOT_PAIRED. Oracle D4 groups: deposit, intent (intent row bound to P4), order, staff PIN.
   - Strip: tables never return NOT_PAIRED. A refund with no cookie that claims Z → SHIFT_REQUIRED, not shift Z.
2. **Cookie**:
   - 2000 cookies all verify. Every last-char padding variant (0/6000) is refused.
   - iat bounds work: 399 d ok, 401 d refused, +299 s ok, +400 s refused.
   - '=' padding refused; rotated key refused.
   - Replay of an A1 cookie at A2 (open / registerStatus) and in tenant B → DEVICE_NOT_PAIRED.
3. **Close override** (on the probe's own shifts):
   - OPERATOR (no cookie) → DEVICE_NOT_PAIRED · CASHIER → DEVICE_NOT_PAIRED.
   - MANAGER_A2 at A1 → NOT_FOUND, and at A2 with the A1 shift → NOT_FOUND.
   - Revoked cookie → DEVICE_REVOKED (MANAGER and OPERATOR).
   - MANAGER with no cookie → ok, audit `pos.shift.close.override` Δ1 {source manager-override, shiftId, unitId, userId}, actor = manager. Idempotent replay → duplicated, audit Δ0.
4. **F1 matrix**: oracle D4 at c139bb41 green ×2 (sale / staffToken Z / manager PIN without cookie are not bound to Z; P4 cookie binds P4; revoked P5 → DEVICE_REVOKED; cash without device → NOT_PAIRED). Plus my hold / refund / sync probes. Positive control: SELLER with cookie C, payload claims Z → the sale is bound to C.
5. **F2 rows**: kdsKitchenPause / kdsSetAutoAcceptMax CASHIER=deny with perm `restaurant.kitchen.pause` · intent settings MANAGER=cond. **F3**: re-pair of ACTIVE B → audit `pos.device.pair` Δ1 {deviceId, deviceCode, unitId, userId}. **F5**: tip and credit with an enumerated all-branch MANAGER → PERMISSION_DENIED (credit Δ0); MANAGER["*"] ok ×2; p3.6 CR4 green. **F6**: QC4 has no env key → `deviceKey:"in-process"`, positives run (0 "ข้าม"), D2 close sub-case runs.
6. **Regression**: SELLER + cookie C: open → sale (bound C) → refund with cookie (bound C) → close by the opener ok (expected 10000). Offline sync with cookie B passes the device gate (422 only on the empty batch). Matrix vs base: +2 rows. Changed: registerDevice / kdsSetAutoAcceptMax CASHIER allow→deny (tighter), intent MANAGER allow→cond (doc = code), posTipLedgers MANAGER deny→cond (ruling F5, `*` only). Nothing else changed.

## Suites (QC4 · iso 3G · POS lock · one at a time · c139bb41)
| suite | result |
|---|---|
| qc-pos-p5.2 ×2 | 54/54 ×2 · F4/F11 pendingOwner · deviceKey in-process · residue 0 |
| p3.6 · p1.6 · p2.4 · p2.8 | 52/52 · 48/48 · 50/50 · 61/61 |
| p1.9 · p1.10 · p1.11 · p1.12 · p1.15 | 53 · 40 · 38 · 72 · 40 — all green |
| p2.13 · p2.9b · p2.7 · p2.5 | 54 · 53 · 42 · 49 — all green |
| p1.7 · p1.5 · p1.8 | 33 · 21 · 49 — all green |
| p3.9 | 47/48 — **ST4 only** (lane pin: refund-actions.ts changed vs pin 8bded5a7; listed by the builder, re-pin at merge) |
| probe copy (54 + R1 probes) | 54/54 · probes as above |
| matrix --check | ✅ 400 rows |

Not verified: browser cookie attributes · UI · merged tree (base 9e2a219c vs session/pos; builder notes p5.1 10/15 until merge) · strict tsc (not allowed).
