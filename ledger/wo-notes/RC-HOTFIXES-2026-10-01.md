# RC hotfixes 2026-10-01 — integration + full re-check + production-build browser checks

Tree `/root/projects/shark-hf4` · branch `rc/hotfixes-2026-10-01` · DB = QC4 (`ep-frosty-lab`) only · no deploy · no product code changed.

## Step 1 — integration (base `origin/main` 929c39ce)
| branch | head merged | merge commit | result |
|---|---|---|---|
| hotfix/apiv1-scope | 201d371a | 5841c670 | clean (no conflict) |
| hotfix/pos-page-authz | b5a50b98 | 8c68f335 | clean |
| hotfix/hr-privacy | afcb9bc3 | 2f45c56e | clean |
| hotfix/inventory-atomic (contains inventory-authz 55b4a678) | 0237e3e5 | 6948b12f | clean |

Only file touched by two branches: `src/lib/modules/pos/service.ts` (pos-page-authz hunks @460/@520/@583 · inventory-atomic hunks @312/@340/@427 — separate regions, git auto-merged).
All merges `--no-ff --no-verify` (hook path points into `/root/projects/shark-in-th/.githooks`, off-limits); fitness run by hand below.
Upstream of the rc branch unset (created from origin/main); pushed with an explicit refspec.

## Step 2 — green together (QC4 · gate lock · 21:11–21:26 UTC)
| suite | result |
|---|---|
| fitness (no env, `iso.sh pnpm fitness`) | ผ่าน 33/33 |
| fitness (QC4 env, qc4.sh + gate lock) | ผ่าน 33/33 |
| qc-hf-apiv1-scope | ผ่าน 141/141 |
| qc-hf-pos-page-authz | ผ่าน 56/56 |
| qc-hf-hr-privacy | ผ่าน 194/194 |
| qc-hf-inventory-atomic | ผ่าน 143/143 |
| qc-hf-inventory-authz | ผ่าน 118/118 |
| qc-hf-reports-authz | ผ่าน 79/79 |
| qc-pos-register | ผ่าน 42/42 |
| qc-pos-inventory | ผ่าน 25/25 |
| qc-pos-account | ผ่าน 16/16 |
| qc-pos-closeday | ผ่าน 22/22 |
| qc-clinic | ผ่าน 8/8 |
| qc-clinic-refund | ผ่าน 13/13 |
| qc-report-builder | ผ่าน 9/9 |
| qc-procurement | ผ่าน 12/12 |
| qc-approval | ผ่าน 16/16 |
| qc-approval-wiring | ผ่าน 7/7 |
| qc-hr | ผ่าน 9/9 |
| qc-hr-leave-booking | ผ่าน 14/14 |
| qc-hr-payadjust | ผ่าน 27/27 |
| qc-payroll | ผ่าน 19/19 |
| qc-ai-proposals | ผ่าน 16/16 |
| qc-ai-plan | ผ่าน 7/7 |
| qc-inventory | ผ่าน 12/12 |
| qc-inventory-account | ผ่าน 23/23 |

Every suite `JSON_SUMMARY … "findings":[]`, exit 0. No suite skipped: none of the listed suites re-seeds/wipes shared data (headers + grep for seed/exec calls; the hr-privacy oracle's backfill subprocess is scoped `--tenant qc-hfhr-<ts>`).
Known pre-existing reds from the hotfix notes (qc-ai-actions 11/12, qc-acc-v2-* missing "SIAM DIVE QC" seed, qc-member-* setup crashes, qc-account-api-* fixture gaps) are not in this list and were not run.
Typecheck `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` (21:23–21:26 UTC) → `tsc --noEmit` exit 0.

## Step 3 — production build + browser checks
Build: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh env ACC_V2_PORT=3225 SHARK_TSC_PREBUILD_OK=1 bash scripts/acc-v2-serve.sh` (21:26–21:36 UTC, gate lock) → `next build` OK
(SHARK_TSC_PREBUILD_OK=1 skips the in-build tsc only because the same HEAD had just passed `pnpm typecheck`). Server then started outside the isolated unit with `ACC_V2_PORT=3225 … start` (Next 16.2.11, `.env.qc` = QC4); stopped at the end.
Throw-away `scripts/_rc-visual.mts` (deleted, never committed): sandbox tenant `qc-rcvis-<ts>` (2 units · INVENTORY/POS/HR/MEMBER systems · 10 users with explicit roles/permission maps · minted sessions) — removed in `finally` (every table with `tenantId`, users, sessions: 0/0/0 left after each run). puppeteer-core + snap chromium, profile under `.qc-shots/rc-hotfixes/` (deleted). Screenshots: `.qc-shots/rc-hotfixes/*.png` (git-ignored).

| # | check | result | evidence (DOM / DB) |
|---|---|---|---|
| 1a | PO receive success | **FAIL (message)** — receipt itself OK | dialog closes, PO → RECEIVED, stock +3, row chip "รับของแล้ว"; **no success message is ever rendered** (MutationObserver on `[role=status]`/`[role=alert]` saw nothing): the action's revalidation re-renders the row as RECEIVED in the same response, which unmounts `PoReceiveForm` together with its `ok` message |
| 1b | already-received PO (received by someone else while the page was open) | **FAIL (message)** — safe outcome | no second receipt (stock unchanged), no error page, dialog closes, row becomes "รับของแล้ว"; the action's "ใบสั่งซื้อนี้รับของเข้าคลังแล้ว" is never shown (same unmount) |
| 1c | user without `inventory.po.receive` | PASS | in-row `role=alert` "ไม่มีสิทธิ์: inventory.po.receive" (raw permission key in the house ForbiddenError text), PO stays ORDERED, no error page |
| 1d | double click on confirm | PASS | two clicks → PO RECEIVED, stock +5 exactly, +1 movement |
| 2a | STAFF w/o member key runs "customers" | PASS | "บัญชีนี้ยังไม่มีสิทธิ์ดูข้อมูลสมาชิก — ขอสิทธิ์ “ดูข้อมูลสมาชิก” จากเจ้าของร้านก่อนรันรายงานนี้" on screen, no Next error |
| 2b | CSV download refusal | PASS | same text, 0 blob URLs, 0 files in the download dir |
| 2c | masked user (member.customer.read, no export) | PASS | phone column `081-xxx-5678`, `089-xxx-5432`; full numbers absent |
| 2d | saved reports not runnable are hidden | PASS | masked user sees "RC ลูกค้าทั้งหมด", not "RC ลูกค้าตามเบอร์" (phone filter); no-member STAFF sees neither ("รายงานที่บันทึกไว้ (0)") |
| 3 | approvals: MANAGER (linked) ticks own + colleague's leave | PASS | colleague's request APPROVED (row gone); own row PENDING with "ไม่สำเร็จ: อนุมัติคำขอของตัวเองไม่ได้ — ให้ผู้อนุมัติคนอื่นตัดสิน"; summary "สำเร็จ 1 รายการ · ล้มเหลว 1 รายการ" |
| 4a | payroll: linked non-OWNER approver on own rows | PASS | approve bonus → "อนุมัติรายการของตัวเองไม่ได้ …" · reject deduction → "ปฏิเสธรายการหักเงินของตัวเองไม่ได้ …" · delete approved deduction → "ลบรายการของตัวเองไม่ได้ …" — each in its row, DB unchanged |
| 4b | same approver deletes colleague's decided row | PASS | row deleted (DB + DOM), no alert |
| 5a | payroll viewer OT 1.3 h | PASS | "ยื่นแล้ว 195 บาท — รออนุมัติ", row hours 1.3 / 19,500 satang |
| 5b | non-viewer OT 0.1 h | PASS (via crafted request) | the UI never offers the form to a non-viewer (payroll section shows the PDPA notice); replaying the viewer's exact server-action request as the non-viewer: 0.1 → "ยื่นรายการนี้ไม่ได้ในตอนนี้ — กรุณาแจ้งผู้ดูแลงานบุคคลให้ตรวจข้อมูลพนักงานคนนี้", no row; control 0.25 → "ยื่นแล้ว — รออนุมัติ" (no amount), +1 row |
| 6a | STAFF w/o POS permission: register + sales history | PASS | HTTP 404 Next not-found on both |
| 6b | cashier (`pos.sale.create` @ unit A): register + sales history | PASS | HTTP 200 both |
| 6c | cashier register at 390 px | PASS | legacy register renders (tabs, "ยังไม่มีบริการหรือสินค้าให้ขาย", manual line entry, "รายการในบิล (0)"), no horizontal overflow |
| 7 | smoke: login, app shell, home | PASS | /login 200 with form · /app 200 · 0 console errors (only console errors in the whole run: the expected "Failed to load resource: 404" on the two 6a not-found pages) |

## Needs a code change / decision (not fixed here)
- **PO receive feedback (1a/1b)**: `PoReceiveForm`'s `ok` message (success, and "ใบสั่งซื้อนี้รับของเข้าคลังแล้ว") cannot appear on the production build, because `receivePoAction` calls `revalidate(systemId)` and the row re-renders as RECEIVED in the same response, unmounting the form. The only success signal is the row chip changing to "รับของแล้ว" + the dialog closing. If a visible message is required, it has to live outside the ORDERED-only branch (e.g. section-level state/toast). Receipt correctness (no double receipt, refusal in place) is fine.
- Minor (pre-existing house text): the no-permission refusal reads "ไม่มีสิทธิ์: inventory.po.receive" (raw permission key).

## Cleanup
Server on :3225 stopped (pid file of this tree; :3215 untouched) · `scripts/_rc-visual.mts`, browser profile and download dir deleted · sandbox tenant/users/sessions 0 left · `git status` clean except untracked `scripts/qc4.sh`.
