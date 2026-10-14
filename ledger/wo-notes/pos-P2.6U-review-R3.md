# P2.6U review R3: fix round 2, `wip/pos-p2.6u` d3396aab (code 8db5cda5)
**Verdict: MERGEABLE.** One Low note, N1's false alarm (item 5).

1. **Variant-link stamp.** The rule is effective station (own ?? parent), old vs new; it stamps `stationSetAt` only on change (`catalog.ts:1480-1488`).
   - The builder's claim holds. `adoptVariantRow` refuses a row that already has a parent (`catalog.ts:1459` `if (row.parentId) throw conflict(…)`).
   - The only other `parentId` writes in `modules/pos` are row creation (`catalog.ts:1504`, `:1602`, covered by `createdAt`). `updateProduct` has no `parentId` key.
   - So no re-link path exists, the old parent's station is always null, and K12c cannot be red-before. That is acceptable.
2. **Checks.**
   - K12c is a regression guard. V is linked to the cookie, sold, and its round deleted. A link to parent B on the same station is refused, `stationSetAt` is unchanged, and the next board read heals exactly one round.
   - K12b still stamps on the first link: own station null, old parent null, new parent routed, so the station changed.
   - red2 = 67/67 at da5f7115 on the fix1 code, explained by the unreachable path.
3. **G1.** The guard now includes `P26U.shiftId` and `P26U.sale && !P26U.saleVoided` (`visual-pos.mts` `cleanupP26u`).
   - The void step returns early once `saleVoided` is set and reuses its stamp key.
   - The close step clears `shiftId` only on success.
   - A second pass therefore retries only what failed. Retry-safe.
4. **G3a.** `userInitial` = the first code point that matches `\p{L}` and is not U+0E40–U+0E44 (เ แ โ ใ ไ); `"?"` if none (`kds-ui.ts:79-83`). Digits, punctuation and emoji are skipped.
5. **N1 (accept, with a Low note).** After 3 polls with no round, the device shows `done.kitchenNoTicket` while it is set to `after-sale` (`PayDone.tsx:106-107`). It never blocks, and `kitchenPrintFailed` now wraps its own reason.
   - th/en keys are present ("ใบครัวไม่ออก — พิมพ์จากจอครัว" / "No kitchen ticket printed — …"); p1.18 81.
   - Low: a sale with no kitchen lines (drinks or retail only) on an after-sale device also shows this line, as a false alarm.
   - Fix (P2.11, or now in 1 line): skip it when none of the sale's lines map to a station. Or soften the copy: "ไม่มีใบครัวสำหรับบิลนี้ / ถ้ามีรายการครัว พิมพ์จากจอครัว".
6. **Server diff** a14dcb61..8db5cda5 = `catalog.ts` only (the stamp rule above). The remaining files are UI (`kds-ui.ts`, `PayDone.tsx`), messages th/en, and scripts (`qc-pos-p2.6.mts` K12c with a dated `ORACLE-ADD ผู้คุม`; `visual-pos.mts`). 8db5cda5..f74ca51d adds red2 only.
7. **Gates** (all headers `head=f74ca51d dirty=0`): typecheck rc 0 · fitness 50/50 ±env · fitness-pos 8 · p2.6 67/67 ×3 residue 0 · p1.18 81 · p1.1 180 · products 24.
   - Visual `--dry`: th + en for every page × owner/cashier.
   - kds en now plans all 3 sizes: owner 24 shots with 9 at 390, cashier 18 with 7 at 390. Other pages run en at 1440 only, the earlier scope.
