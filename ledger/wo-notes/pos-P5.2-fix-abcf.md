# POS P5.2 — fix batch A+B+C+F (authz core)

Builder · account B · 23 Oct 2026 05:39Z– (`date -u`) · tree `/root/projects/shark-pos-f` · branch `wip/pos-p5.2-fix-abcf` from `origin/wip/pos-p5.2-oracle2` ec8623bf + merge `origin/session/pos` 71d03495 (ledger/pins only).
Prompt: `ledger/pos-briefs/pos-prompt-accountB-P5.2-FIX-ABCF-BUILD.md` · rulings CD-P52-O2-1…3. No oracle file edited (suite, generator overrides untouched; `pos-authz-matrix.json` regenerated with `--write`).
Scratch/logs: `/tmp/claude-0/-root/9878a238-0754-5958-805a-a0391fccc617/scratchpad/p52-fix-abcf/` (`presubmit/`, `final/`, side suites).

## Commits
| sha | batch | change |
|---|---|---|
| 9fb4f97b | A | `approval/service.ts` canDecideStep(m, step, req): `req.unitId && !canAccessUnit(m, req.unitId)` ⇒ false — used by listPending / decide / bulkDecide (so `/app/approvals`, posApprovalCards ids, AI approvals_pending, AI approval_decide). `pos-approval-consumer.ts` re-checks the decider (fresh accepted Membership via posMemberActor) with evaluate(pos.sale.void / pos.sale.refund / pos.sale.manage, unitId) before void/refund/arm; refused = WARN + outcome `FAILED:PERMISSION_DENIED` (no throw). `ai/proposals.ts` approval_decide summary lookup uses listPending of the confirmer (the "many matches" message no longer lists other branches' requests). `approval/actions.ts` needed no change (goes through bulkDecide→decide). |
| a70f4e25 | B | `staff-pin.ts` setStaffPin / unlockStaffPin, target ≠ self: `canAssignRole(actor, target)` and OWNER target only by OWNER ⇒ PERMISSION_DENIED; unlock of a non-member target = NOT_FOUND (fail closed). Rank check sits before the duplicate-PIN scan (no PIN oracle for higher ranks). |
| 71e9294c, fedbacc1 | C | `general-key-gate.ts`: POS registry tools (`posToolScope ≠ null`) added to isModuleScopedTool (O2-2); generalToolGate for a POS tool = key holds a real `pos.*` scope; `posToolNeedsPosKey` = POS tool × general key. `tools/[name]/route.ts`: general key × POS tool ⇒ 403 `pos_scope_required` (+ hint scope); other module keys keep 403 key_not_general. pos-read key × sales_summary = 200 (was 403 key_not_general). `pos/api/tools.ts` SCOPELESS_LEGACY left as is (module level; pinned by qc-pos-p3.9 TL9) — the door closes it for every external key path. |
| e28d230a, c9b9c350 | F | F9 `catalog-price-actions.ts` new helper `priceReadCtx` (pos.sale.read / sale.create / product.manage / product.setPrice at role level) for unitPriceMatrixAction only, so the writers keep `pos.product.setPrice` in the matrix · F7 `register.ts` PIN override cancels the held-cart request only when the held cart is in this tenant/system/unit · F8 legacy QR page: `posLinkedLegacyDoor(write)` ⇒ `redirect(legacyQrDoor(token))` before any lookup (inside the P2.7 block, legacyTableQrRedirect kept) · F10a `ai/analyst.ts` weekly report = one notification per accepted OWNER (recipientUserId) · F10b `ai-insights.ts` linkedItems: no unitId and not an all-branch actor ⇒ branch-only rows limited to linked units where the actor has pos.report.view. Matrix regenerated (398 rows: unitPriceMatrix CASHIER=allow with the 4 keys; evidence lines). |

## Verification (QC4 · qc4.sh + POS gate lock · iso; head c9b9c350 = pre-submit, fedbacc1 = re-run of the C refinement)
| suite | result |
|---|---|
| qc-pos-p5.2 (forced) | **47/52 ×4** (pre-submit ×2 @c9b9c350 · rerun ×2 @fedbacc1) — **X4 X5 K3 F7 F8 F9 F10a F10b green** · 34 old green (M1–M5 green after regen) · red = H6b D1 D2 D3 D11 only (other batches, as intended) · F4/F11 🟡 pendingOwner · guardHits 0 · residue 0 · K3 info: pos-read sales_summary 200 |
| qc-pos-p5.2 --no-db | 22/22 |
| qc-pos-p1.6 · p1.1 · p1.3 · p1.7 (HF-PP R4b) · p1.15 · p1.18 · p2.4 (HF-PP P9) | 48/48 · 180/180 · 128/128 · 33/33 · 40/40 · 81/81 · 50/50 |
| qc-pos-p2.8 (HF-PP2 P10) | 60/61 — only P2.8-ST6 (lane pin, register.ts) |
| qc-pos-p2.13 | 54/54 (×2: c9b9c350, fedbacc1) |
| qc-pos-p3.9 | 47/48 ×2 — only P3.9-ST4 (lane pin, register.ts); TL7/TL9 green |
| qc-approval | 16/16 |
| qc-hf-apiv1-scope | 139/143 @fedbacc1 — red = HF-12.2/12.3 ×2 (old CD-7 contract, see open item 1) · HF-12.6.1–4 green after fedbacc1 (were red at c9b9c350) |
| qc-ai-skills · qc-ai-proposals · qc-hf-tx | 23/23 (×2) · 16/16 · 22/22 |
| qc-pos-p2.7 · p2.11 · hf-fu · hf-fu2 | 41/42 · 33/34 · 28/29 · 30/31 — only lane-pin ST (P2.7-ST3 · P2.11-ST4 · HF-FU-ST1 · HF-FU2-ST1) |
| qc-pos-p2.10 --no-db | 1/2 — P2.10-ST2 lane pin (register.ts hunk + oracle2's qc-pos-p5.2.mts) |
| qc-ai-analyst (not in manifest) | 7/9 — AN-2.1 AN-3.3 (fixture without OWNER, open item 2) |
| fitness noenv / qc4 / pos · gen-check · matrix --check | 53/53 · 53/53 · 8/8 · ✅ · ✅ |
| pos-pre-submit `--wo qc-pos-p5.2 --set core` (+ also list) @c9b9c350 | VERDICT red: expected-lane-pin 6 · "unexpected" = p5.2 run1/run2 (the 5 out-of-batch reds) + qc-hf-apiv1-scope (fixed in part by fedbacc1; rest = open item 1) |

## Open items for the controller
1. **qc-hf-apiv1-scope HF-12.2 / HF-12.3 (legacy + rotated general key)** expect `/skills/sales` to list sales_summary/sales_by_day and `tools/sales_summary` = 200 — the old CD-7 contract. Ruling O2-2 (K3) overturns it ⇒ needs an ORACLE-EDIT (expected: 403 pos_scope_required · manifest without POS registry tools). Not edited here.
2. **qc-ai-analyst AN-2.1 / AN-3.3** (not in the manifest) red: its fixture tenant has no OWNER membership, so F10a creates no notification. Fixture needs an OWNER (ORACLE-EDIT) or a ruling on the recipient set (today: accepted OWNERs only).
3. Lane-pin ST reds from the F7 hunk in `register.ts` (P2.7-ST3 · P2.8-ST6 · P2.11-ST4 · P3.9-ST4 · P2.10-ST2 `--no-db`) and HF-FU-ST1 / HF-FU2-ST1 — re-pin at merge.
4. Strict typecheck: `tsc` on the touched files OOMs at the 3G cap (the program pulls ~700 src files); full `pnpm typecheck` (ISO_MEM 10500M) = CONTROLLER-RUN. Fitness ✅ (pre-commit ×6, noenv/qc4/pos in pre-submit).
5. Stale notes in generator OVERRIDES (oracle file): unitPriceMatrix "🔴 F9 … ไม่ตรวจคีย์ POS" and tools route "วันนี้ SCOPELESS_LEGACY…" still describe the old code.
6. TL9 of qc-pos-p3.9 still pins module-level CD-7 (`posToolAllowedForScopes(sales_summary, [])` = true, runTool with a general-key actor reads); only the HTTP door is closed. If the controller wants it closed in `pos/api/tools.ts` too, TL9 needs an ORACLE-EDIT first.
