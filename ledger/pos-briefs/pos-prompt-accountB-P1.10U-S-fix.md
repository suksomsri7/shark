# P1.10U — fix round 1 (controller rulings on reviewer findings, head reviewed 56e80a44)

Reviewer verdict: MERGEABLE-AFTER-FIXES. Do these on `wip/pos-p1.10u` **after** your gates2 run finishes (do not edit files while a suite is running in the tree). Then typecheck, `qc-pos-p1.10u-print`, `qc-pos-p1.10` forced ×1, visual `--dry` owner+cashier for settings/register, push, report the head SHA.

| # | Ruling | What to do |
|---|--------|------------|
| F1 MAJOR | ▶ fix | Drawer pulse only on the **first original print of a sale from PayDone** (auto or manual). `printReceipt` gets explicit `opts.kickDrawer` (default false); PayDone passes `cfg.drawerKick && !payload.copy && firstPrintOfThisSale`; "พิมพ์สำเนา", bills reprint (`BillsClient.tsx`) and settings "พิมพ์ตัวอย่าง"/"ทดสอบพิมพ์" always pass false. Add a check to `qc-pos-p1.10u-print.mts`: encode with `copy:true` ⇒ no `1B 70` bytes even with drawerKick. |
| F2 | ▶ fix | After a successful original print for a `saleId` (client-side set, same one as the autoPrint guard), the PayDone button becomes "พิมพ์ซ้ำ" and goes through `reprintReceiptAction` (copy + audit). "พิมพ์ใบเสร็จ" (original) only while nothing has printed for that sale. |
| F3 | ▶ notes | Complete `ledger/wo-notes/pos-P1.10U.md`: steps 5–6, gates table with exit codes, deviation list vs 17A/17B/02 with the ruling each, browser support matrix, omitted footer note (§1), CD4 "not audited", BillsClient change, open questions. |
| F4 | ▶ fix | Pin expected fnv hashes + byte lengths for raster/80 and tis620/58 in U1 (real determinism, not self-equality). |
| F5 | ▶ fix | Show the real credit-note pattern: prefix from `settings.pos.receipt.refundPrefix` (default `CN`) as `refund.ts` formats it. |
| F6 | ▶ fix | Register status bar: REVOKED ⇒ chip state "เพิกถอนแล้ว" (red), not the "ยังไม่ลงทะเบียน" link. |
| F7 | ▶ keep edit, fix staleness | P1.16 is already in `session/pos` (base 611f54c7) so there is no lane conflict — keep the BillsClient change. Re-read the printer config on each print instead of caching it for the page lifetime (cheap action call or re-read on `visibilitychange`). |
| FU-a | ▶ fix | `sandbox="allow-same-origin"` on the preview iframe; hidden print iframe gets what `print()` needs (`allow-same-origin allow-modals`) — verify browser print still works headless-dry. |
| FU-b | ▶ fix | Align the splice-failure code: `raster.ts` comment vs `printReceipt.ts` mapping — pick `WRITE_FAILED` for a splice failure (it is a build error of the bytes, not an unsupported browser). |
| FU-c | note only | `canEditReceipt` tenant-level vs server F9 per-unit rule → write as follow-up; BT raster speed → follow-up (measure on hardware); visual seed 3-device limit → follow-up. P1.10 F7 "ส่วนลดท้ายบิล" label → stays a controller follow-up. |

Rules unchanged: no server changes (CD5), no `prisma/**`, no oracle edits, explicit-path commits, push `wip/pos-p1.10u` only.
