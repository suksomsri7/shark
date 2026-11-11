# P2.2U R2: fix round 1 `d95ea560...1207ae4d` (code 6e55ba60), read-only
**Verdict: MERGEABLE.** Every R1 finding (F1–F7) and the ORACLE-EDIT are fixed as the rulings say. No Medium or higher issue remains. N1 is a 1-line fix worth doing now or in P2.11; N2 to N4 are notes.
## Findings
- **N1 (Low) F1 can show the load-failed toast every 15 s.** The timer always bumps `seq` (`RegisterScreen.tsx:830-833`). Once the edge has passed, `wait` drops to the 15 s floor. A page-1 reload that keeps failing (offline, or `!r.ok`) then toasts `errors.loadFailed`/the refusal (`:799-800`, `:813`) every 15 s until a load succeeds. Before the fix it fired only once. Fix: in the callback, skip `loadCatalog` when `!online` (still bump `seq`), or pass a "silent" flag so timer reloads do not toast.
- **N2 (Low, brittle) The F5 mapping matches a substring of the Thai service message.** `BulkMarkupDialog.tsx:69` looks for `"500"`, the only category-scope VALIDATION text with that number (`catalog.ts:2099`); the bp message reads "0.01%–200%". It is correct today but breaks silently if the text or a constant changes. Fix later (P2.11/S): give the refusal a `field: "categoryId"` or its own code. Also a wording nit: th `bulk.tooMany` "เลือกได้ไม่เกิน {max} รายการ" says "select" even for a category.
- **N3 (Note) F4 per the ruling.**
  - The action never passes `field` (`catalog-price-actions.ts:20`), so every VALIDATION reaches `errors.serverValidation` and the row-error branch (`ProductPanel.tsx:101`) stays dead.
  - The en UI shows the Thai service text inside "Could not save — {message}". Accepted by the ruling.
- **N4 (Note) F7 now also badges server `BRANCH` lines "ราคาสาขา" in the register** (`:1136-1143`); before, they had no badge. This matches the bills note and the builder's notes.
## Verified OK
- **F1:** state is `{iso, seq}` (`:277`). Each page-1 load makes a new object (`:810`). The effect key is `priceEdge` (`:835`). The callback always reschedules (`:832`). Clamp is 15 s min / 1 h cap (`:829`), with `clearTimeout` on cleanup (`:834`). Clock text is untouched by the diff.
- **F2:** `endDateText` = `endsAt − 1 ms`, Bangkok (`price-ui.tsx:93-96`). `ruleWindowText` (`:102`) is the only display of `endsAt`. A grep of `src/components/pos` and `pos/**` finds no other display; the editor's `bkkDate(…, true)` (`PriceRulesClient.tsx:63`) agrees.
- **F3:**
  - `local` returns null for price-layer carts (`RegisterScreen.tsx:868`, `quote` dep). `totalsPending` (`:1071-1072`) and line `pending` (`:1129`) cover them, and `payAmount` shows PENDING, so STORE totals never flash.
  - `payEnabled` still needs `quoteFresh` (`:1088`); Pay/submit is untouched.
- **F4:** `priceRefusalText` (`price-ui.tsx:144`) is used at `ProductPanel.tsx:99-101`. `errors.serverValidation` is in th and en. The P2.11 line is in `POS-MASTER-PLAN.md` (P2.11 row) and the `pos-P2.2U.md` follow-ups.
- **F5:**
  - `bulk.tooMany` mapping is at `BulkMarkupDialog.tsx:69`; other VALIDATION goes to `:70`.
  - The `previewCategory` label (`:139`) is in th and en with the exact ruled text.
- **F7:**
  - `shownPriceSource` (`price-ui.tsx:59`) is pure and UI-only; there is no server or lib change.
  - CHANNEL on STORE or no channel → BRANCH or BASE, never "ราคาตามช่องทาง". It is used by the register (`:1136`, which compares the price without options to the list price; weighed lines are WEIGHED) and by bills (`BillsClient.tsx:269-271`).
  - The `badge.branch` key already existed in th and en.
  - The split-by-price deviation, the no-note option lines and the P2.11 line are recorded in the notes, as the ruling accepts.
- **ORACLE-EDIT 6e55ba60:**
  - Changes only `:475` (regex `true, null` plus push text `(P2.2U Q8)`) and the `:477` label, with 40 `chk(` before and after.
  - Red-before log is rc 1, 41/42, ST3 only. It ran at d95ea560, which is equivalent because `pos-integrations.ts` is unchanged in this round. After: rc 0, 42/42.
- **Logs:** all 24 in `p22u/runs/fix1/` carry `tree=/root/projects/shark-pos-p11 head=6e55ba60` (red-before: d95ea560) and `rc=0`. Summary: p2.2 42 · p2.1 55 · p1.18 81 (ST7 ✅ 0) · p1.3 128 · p1.16 28 · products 24 · authz 56 · typecheck · fitness 41/41 ×2 · fitness-pos 8/8 · dry ×12.
- **Scope:** `diff --stat` has 11 files, all fix scope plus ledger. The new strings are 2 keys, both in th and en, with no Thai literal outside comments, so ST7 stays 0.

## Controller rulings (10 Oct 02:5xZ)
- N1 → fix round 2 now (silent timer reloads + skip when offline) before merge; screenshots from 6e55ba60 remain valid (no visual change).
- N2 → P2.11 (refusal `field`/code for the category > 500 case); th wording nit with it.
- N3/N4 accepted as noted.
