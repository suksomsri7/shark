# POS P5.2 — oracle extension 2 (hunter L1 findings → red-before checks)

Oracle writer · account B · 23 Oct 2026 04:44Z–05:4xZ (`date -u`) · tree `/root/projects/shark-pos-f` · branch `wip/pos-p5.2-oracle2` from `origin/session/pos` **c067c628**.
Prompt: `ledger/pos-briefs/pos-prompt-accountB-P5.2-ORACLE2.md`. Input: `ledger/wo-notes/pos-P5.2-hunt-L1.md` (F1–F11, matrix diff, 9 blind spots), brief P5 §4 P5.2 + §10 (+ addenda), controller rulings 23 Oct.
No product edits: nothing under `src/` was touched. Files: `scripts/qc-pos-p5.2.mts` · `scripts/pos-authz-matrix-gen.mts` · `scripts/pos-authz-matrix.json` (+ this note).
Scratch and logs: `/tmp/claude-0/-root/9878a238-0754-5958-805a-a0391fccc617/scratchpad/p52-oracle2/` (`redbefore-run1.log`, `redbefore-run2.log`, `s1-db.log`, `final-nodb.log`).

## Commits
| sha | step |
|---|---|
| f15c3d47 | step 1: matrix scan + rows (approval / inventory / restaurant actions · AI tools/skills routes · developers/pos.md · `/app/approvals`), flips per rulings, `judgeDenied` for module throwers, call style `unit` |
| 8d5312da | step 2: new checks, fixtures, personas, pending-owner gate, N5–N8, `--self-test` |
| (this commit) | PIN default → c067c628 (print only) · this note |

## 1. Confirm in code (every finding was confirmed; none skipped)
| finding | confirmed at (tree f @ c067c628) | check |
|---|---|---|
| F1 HIGH cross-branch approvals | `approval/service.ts:236-241` canDecideStep has no `req.unitId` test · `:403-416` listPending no unit filter · `approval/actions.ts:159,181` shop-level gate · consumer `pos-approval-consumer.ts:93` voids with the decider, no re-check | **X4** |
| F2 PIN rank | `staff-pin.ts:165-170` setStaffPin and `:557-570` unlockStaffPin: pos.staff.manage at the unit, no `canAssignRole` (`rbac.ts:94`) | **X5** |
| F3 general key × POS AI tools | `pos/api/tools.ts:129` SCOPELESS_LEGACY → `:328` pos.report.view for every unit | **K3** |
| F4 inventory → POS rows | `inventory/actions.ts:97-120` shop-level `assertInventoryCan` → `catalog-legacy.ts:453-458` resyncRows | **F4** (pending owner W37) |
| F5 / D11 legacy writers | `actions/restaurant.ts` 15 writers listed by the hunter, no `posLinkedUnit` (only createItem/duplicateItem/setTableStatus/rotateQr have it) | **D11** |
| F6 H6 class | writers 1–6 are already all-linked-units or OWNER-only in the module (`settings-general.ts:306,341,563,668` · `pos-integrations.ts:269` · `receipt-settings.ts:95`); **saveCreditAccount** shop-level (`credit-actions.ts:51`, `credit.ts:90`); tip ledger shop-level `pos.settings.payment` (`tip-ledger-actions.ts:19`) | **H6b** |
| F7 cross-branch cancel | `register.ts:3287` held-cart lookup is unit-scoped, but `:3338` `cancelOpenPosRequest(heldCartId)` uses tenant only (`pos-approval.ts:121-125`) | **F7** |
| F8 legacy QR door | `(store)/s/…/restaurant/t/[qrToken]/page.tsx:24-29` · `qr-order.ts:804-813` lookup before redirect | **F8** |
| F9 unitPriceMatrix | `catalog-price-actions.ts:133` `sessionCtx(args, true)` has no POS key | **F9** |
| F10 AI paths | `ai/analyst.ts:165` appNotification with no `recipientUserId` · `ai-insights.ts:49` linkedItems with no unit filter when `ctx.unitId` is empty | **F10a** (static) · **F10b** |
| F11 | X report trusts the client deviceId (`shift.ts:609`) · commission writer behind `canViewPayroll` (`settings-general.ts:613`) | **D3** · **F11** (pending owner W38) |
| D1c (§10.4) | `shift-actions.ts:77-79` deviceId from the client; no device cookie anywhere | **D1 · D2 · D3** |
| blind spots 1–5 | fixtures and personas below | **X3** (+ all of the above) |

## 2. Fixtures (blind spots 1–5)
- **A2 objects of every kind** (setup2): sales ×3 (one with a non-round total, so the A2 net is 3271.43), table + zone, order (customer-name sentinel), OPEN shift, held carts ×3, device, intent, slip, approval policies at A2 (POS_VOID / POS_REFUND / POS_DISCOUNT_OVER, MANAGER step) and 6 PENDING requests made with `submitPosApproval`.
- **Unit A1 + A2 object** (X3 variant 1) · **unitId left out** (variant 2) · STAFF with every `pos.*` key at A1 (variant 3; 24 keys from `permissions.ts`).
- **Inputs that are not empty**: open cart line, sale with tender and key, refund on an A2 line id, shift / close / movement / recount bodies, patch, real product id. Outcome mix in run 1: NOT_FOUND 175 · OK 130 · VALIDATION 65 · PERMISSION_DENIED 48 · ForbiddenError 35 · Error 35.
- **Aggregate sentinel**: A2 net and A1+A2 net in 3 formats (`327143` · `3271.43` · `3,271.43`), only when the amount has satang (`aggSentinels`, N6). The A1 total is read again after every ok call. Positive control: the MANAGER[A2] daily report contains the A2 net.
- **Personas**: MANAGER_A2 · MANAGER_ALL [A1,A2] · CASHIER_A2 · LEAD (STAFF + pos.staff.manage) · KEYS · SELLER (+priceOverride, +shift.operate) · OPERATOR (+pos.shift.operate) · PAYROLL (hr.payroll.read only) · a general API key and a pos-read key. Unit **A3** (not linked to POS) for the D11 positive control. The tenant device limit is raised to 50.
- Everything lives in `posqc-p52-<rand>` and is dropped in `finally` (Z1 green, residue 0 ×2; Z2 green ×2).

## 3. Red-before (QC4 · `qc4.sh` + POS gate lock · iso 3G · run 1 05:25:42–05:32:07Z · run 2 05:32:07–05:36:01Z)
Both runs give the same result: **gated 39/52 · the 34 old checks green ×2 · 13 new checks red ×2 · F4/F11 pending-owner red ×2** · guardHits 0 · residue 0.

| check | on base (run 1 = run 2) | goes green when |
|---|---|---|
| X3 | ✅ green: 216 rows × 3 variants = 648 calls, 0 leaks, 0 A2 rows changed, positive controls ✓ | already green. **Exception to "red-before"**: matches the hunter's "Verified OK" for ops lookups. The judge can still go red: N4/N6 + an in-DB aggregate positive control |
| X4 | ❌ MANAGER[A1] listPending sees 3/3 A2 requests · decide(APPROVED) ok · bulk REJECTED done 2 · VOID=APPROVED | A fixes |
| X5 | ❌ MANAGER sets/unlocks OWNER's PIN ok · LEAD sets/unlocks MANAGER's PIN ok | B fixes |
| K3 | ❌ general key sales_summary 200 · sales_by_day 200 (control list_systems 200) | C fixes |
| D1 | ❌ OWNER pairing ok, no device cookie (cashier refused ✓) | F-device fixes |
| D2 | ❌ OPERATOR opens a shift on device Y named by the client | F-device fixes |
| D3 | ❌ OPERATOR reads X of OWNER's shift by naming its device | F-device fixes |
| D11 | ❌ 15/15 not POS_LINKED · A1 menu/KDS/category rows changed · A3 control 13/15 written | D fixes |
| H6b | ❌ saveCreditAccount ok (credit account 0→1) · tip ledger ok · the other 6 refused · MANAGER_ALL control ok ×4 · OWNER tip ok | E fixes |
| F7 | ❌ A2 POS_DISCOUNT_OVER PENDING→CANCELLED by an A1 sale (PIN control ok) | F fixes |
| F8 | ❌ unknown token on a POS-linked unit renders the old page · real token redirects ✓ · TableSession 0→0 | F fixes |
| F9 | ❌ STAFF_NOPERM gets a 5-cell matrix · CASHIER ok | F fixes |
| F10a | ❌ 1 shop-wide `appNotification.create` (no recipient) | F fixes |
| F10b | ❌ MANAGER[A1] posStockRisks/purchaseSuggestions show the A2-only item · OWNER control sees it | F fixes |
| F4 🟡 | red: shared PosProduct renamed by MANAGER[A1] through inventory | owner W37, then a fix or ORACLE-EDIT |
| F11 🟡 | red: PAYROLL (read key) writes commission ok | owner W38 |

Other gates: `--no-db` 21/22 (F10a red, as intended) · `--self-test` 8/8 (N1–N8) · `pos-authz-matrix-gen --check` ✅ · strict single-file tsc exit 0 (suite and generator) · `pos-oracle-check.sh … --base c067c628` **VERDICT green** (red 0 · warn 0 after the PIN default bump) · pre-commit fitness ✅ ×2.

## 4. Matrix (333 → 398 rows · M1–M5 green)
- **Scan** (`EXTRA_*` in the generator): `approval/actions.ts` (6) · `inventory/actions.ts` (18) · `actions/restaurant.ts` (35, call style `unit`) · `api/v1/ai/tools/[name]` POST · `api/v1/ai/skills` GET ×2 · `developers/pos.md` GET (its old OVERRIDE now applies) · `app/approvals/page.tsx`. `$outOfScope` and `$scan` were updated. The other 333 rows are unchanged except the overrides below.
- **Flips (rulings)**: MANAGER=cond on the 6 H6 writers and saveCreditAccount · setStaffPin/unlockStaffPin MANAGER=cond (rank) · posTipLedgers MANAGER=deny · decide/bulkDecide MANAGER=cond · approvals page MANAGER=cond, OTHER_UNIT=deny · the 15 D11 writers OWNER/MANAGER=cond · notes on unitPriceMatrix (F9), the AI tools route (K3), inventory writers (F4/W37), commission (F11/W38) and the legacy QR page (F8).
- **ORACLE-EDITs to old checks** (only additions): `judgeDenied` accepts ForbiddenError / notFound throws from the 3 module files (as for LEGACY) · `invoke` call style `unit` (real unit slug + FormData) · M2 MARK + `assertInventory*(` / `authenticateApiRequest(` · generator evidence: + `authenticateApiRequest(` for routes, `requireTenant(` fallback for pages · PIN default 2fb1fe8e → c067c628 (print only). The old 34 checks are green ×2 on 398 rows (`s1-db.log` + both red-before runs).

## 5. Fix batches by owning file (one builder per batch · R1 each)
- **A approval** — `src/lib/modules/approval/service.ts` canDecideStep(m, step, req): `req.unitId && !canAccessUnit(m, req.unitId)` ⇒ false, used by listPending/decide/bulkDecide; `pos-approval-consumer.ts` re-checks `evaluate(decider, pos.sale.void|refund|manage, unitId)` before acting (defence in depth; not tested on its own) → **X4**.
- **B staff-pin** — `src/lib/modules/pos/staff-pin.ts` setStaffPin + unlockStaffPin: target ≠ self ⇒ `canAssignRole(actor.role, target.role)`, and an OWNER target only for an OWNER → **X5**.
- **C api/tools scopes** — `src/lib/modules/pos/api/tools.ts` (SCOPELESS_LEGACY) and/or `settings/api/actions.ts` → **K3**. ⚠️ **Controller note**: a pos-read key gets **403 key_not_general** on sales_summary today, because `general-key-gate.ts` lists only 4 modules. After K3 no API key can call the POS AI tools unless the fix also adds POS to `isModuleScopedTool`. That is outside K3, so the controller should rule on it.
- **D inventory/restaurant legacy** — `src/lib/actions/restaurant.ts`: `posLinkedUnit` → `redirect(?err=POS_LINKED)` on the 15 writers (LEG pattern) → **D11**. `inventory/actions.ts` waits for W37 (**F4**).
- **E settings/credit/tip H6** — `credit.ts`/`credit-actions.ts` saveCreditAccount: `canManageAllLinkedUnits` (`payment-settings.ts:217` pattern) · `tip-ledger-actions.ts` OWNER only → **H6b**. Commission waits for W38 (**F11**). The F6 readers (listCreditAccounts · posSettingsHistory · listPosApiKeys · readIntegrationCredentials) have no ruling, so they have no gated check (those rows are unitScoped=false and not in X3).
- **F register / QR door / AI** — `register.ts:3338` cancels only when the held cart was found in this unit (**F7**) · legacy QR page: when the unit is POS-linked, always `redirect(/q/t/<token>)` with no lookup (**F8**) · `catalog-price-actions.ts:126` needs pos.sale.read|create|product.manage (**F9**) · `ai/analyst.ts` notifies per recipient (**F10a**) · `ai-insights.ts` linkedItems: no unitId ⇒ only units the actor can report on (**F10b**).
- **F-device (own R1 + hunter, brief §6)** — signed device cookie at pairing (`registerDeviceAction`, MANAGER/OWNER). The key is a separate env key, never CHAT_/POS_CREDENTIALS_KEY; if it is unset, pairing is refused. openShift and xReport take the device from the cookie → **D1 D2 D3**.

## 6. CONTROLLER-DECISIONS (CD-P52-O2-…)
1. **CD-P52-O2-1 (X3 green on base)**: X3 is kept as a regression guard for blind spots 1–5. It is the one new check that is not red-before; the reason is in §3. Remove it from the "red-before" count, or rule otherwise.
2. **CD-P52-O2-2 (D1 contract)**: pairing = the existing `registerDeviceAction`. Pass = a new non-session cookie whose value is not the plain device code and is ≥ code+16 chars, **or** a refusal that is not PERMISSION/NOT_FOUND/VALIDATION/UNKNOWN/INTERNAL/DEVICE_LIMIT with no PosDevice row (key unset). D2/D3 replay that cookie as their positive control and also try a tampered value. If the builder adds a separate pair action, the oracle needs an ORACLE-EDIT.
3. **CD-P52-O2-3 (pending owner)**: F4 and F11 run and print 🟡 but stay out of `failed`/exit, and are listed in `pendingOwner` in JSON_SUMMARY (N8 probes this). When W37/W38 are answered, an ORACLE-EDIT either removes the id from `PENDING_OWNER` or flips the expected result.
4. **CD-P52-O2-4 (K3 positive control)**: the control is the general key × `list_systems` = 200. The pos-read result is printed as data only (see batch C note).
5. **CD-P52-O2-5 (F8 fixture)**: the old page serves only RESTAURANT units, so F8 switches A1's type to RESTAURANT for that check alone and switches it back in `finally`.
6. **CD-P52-O2-6 (not covered, LOW)**: F11 print agent on an unlinked unit (`print-relay.ts:119`) · COUNT_ALREADY_OPEN returns A2's countId (`stock-count.ts:299`) · F8 chat LINKED server rule (brief D3) · the AI `proposals.ts:1185` decide path (covered by fix A in service.ts). These are for the debt table or a later ORACLE-ADD.
