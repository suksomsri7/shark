# P1.18U re-check, fix rounds 1+2: wip/pos-p1.18u d71947c4 (tree c, read-only)

**VERDICT: MERGEABLE.** F1–F8 and V1–V4 are fixed as ruled. The four notes below are Low or controller decisions. None blocks the merge.

## Findings (all Low)
- **N1 (Low, a side effect of F4; controller decision).** `SharkSettings.tsx:236` gates "เปิดใช้" on `c.manage?.canManage`. NO_SYSTEM cards always have `manage: null` (oracle I8), so MARKETING and CHAT now show no enable link to anyone, owner included. This follows the F4 ruling to the letter, but the original §4 "เปิดใช้" entry point for NO_SYSTEM is gone. Options: accept, or show `ADD_SYSTEM_HREF` behind a page-level owner flag.
- **N2 (Low, F1 edge).** `summaryOf` compares values after masking (`settings-general.ts:393,400,406`). The receipt writer already stores masked phones (`receipt-settings.ts:120`). A phone edit that changes only the hidden middle digits (`maskPhone` = `081-xxx-1234`) therefore produces no `header.phone` part. Rare; the drawer falls back to the generic sentence. Accept, or have the writer record a `phoneChanged` flag.
- **N3 (Low, log provenance).** The round-2 `typecheck.log` is headed `head=82bf9b9f+wip`. It ran at 21:06:29 on the dirty tree; a5059a7f was committed 6 s later. The other round-2 logs are headed a5059a7f. Re-run typecheck at d71947c4 in the merge gate.
- **N4 (note).** The F2/F7 code was only exercised by `--dry` runs. `--dry` exits at `visual-pos.mts:404`, before `seedEmptyCatalogueOnce` (`:3178`), so no DB path has run yet. The controller's next live register run should log the 19ก cleanup line with `AuditLog ≥ 2` and leave 0 `posqc-vis-empty-*` units.

## Verified OK
1. **F1.**
   - `settings-general.ts:391-412`: a nested `k.k2` is skipped when `canon(prev[k][k2]) === canon(v2)`. Top-level scalars and `.count` are unchanged. The reader passes `r.before` (`:469`), and it is already selected (`:457`).
   - Receipt rows store `header` as one sub-tree, so a shop-name-only edit no longer lists phone/address/logo.
   - H2b is its own commit (d1c48cf9), made before the fix commit ad1feb8f. It checks both halves (`qc-pos-p1.18.mts:123` and `:1774-1807`) and restores X afterwards. Count 80 → 81, recorded in `pos-P1.18-oracle.md`.
   - Red-before log is real (`p118u-fix/runs/red-before-H2b.log`): 80/81, only H2b failing, with 5 shift keys and `weighedBarcode.enabled` in the summary. Residue 0.
2. **F2/F7.**
   - The signal handler awaits `cleanupEmptyCatalogue()` before `cleanupSettingsState()` (`visual-pos.mts:638-644`).
   - Unit id and device code are `posqc-vis-empty-<pid>`. The system is resolved through its link to this run's unit (`:2767-2769`), not by name.
   - `deleteEmptyCatalogueSet` (`:2810-2822`) deletes only systems that are linked to that unit and carry the fixture name. It also deletes AuditLog rows by targetId (system, device row, unit), which matches the targetIds in `device.ts:229` and `settings-general.ts:257`. AuditLog has no delete trigger.
   - The sweep (`:2824-2832`) excludes the current pid. It does not match the legacy id `posqc-coffee-unit-empty-vis`, because the prefix differs.
   - Two concurrent pids get different units and systems, so neither can delete the other's rows. The fixture lives only across the last 3 contiguous jobs (dry plan rows 86-88), so it exists for minutes. That keeps it well inside the 1 h sweep threshold.
3. **F3–F6.**
   - F3: the denied text shows when `accDenied || (accountLive && accountLocked)` (`SharkSettings.tsx:227`).
   - F4: as described in N1.
   - F5: `print/types.ts` gives `message: code`. `grep messages/th/pos.json` finds 0 hits in `src/components` and `sys/[id]/pos`. No `.message` reader remains, and `PRINT_MESSAGES_TH` has 0 references. The two remaining importers, `tabs.ts` (used only from server `page.tsx` files) and `PosPublicReceipt.tsx` (server), were already there.
   - F6: `settings/page.tsx:72-79` is one tenant-bound EXISTS query. It returns the same row and order, and uses `@@index([tenantId, unitId, active])`. Table and column names match the schema (no `@@map`).
4. **V1–V4.**
   - **V1:** `StaffSettings.tsx:223-228` uses `table-fixed` with col 88×3 = 264. The task column takes the remainder: about 159 px at 1440 and about 140 px at 1024. Role-cell content is at most 76 px (`px-1.5`): input 56 + `%` ≈ 68, "Unlimited" 67. `max-md:overflow-x-auto` with `min-w-[360px] md:min-w-0` means horizontal scroll only below md (Tailwind v4).
   - **V2:** `kv` (`:264`) puts the label (`nowrap`, `shrink-0`) on the left and the value on the right (`inline-flex`, icon inline, no truncate). When the value does not fit, it wraps as a whole under the label. The e-Tax row (`:301`) keeps chip + button together as one `nowrap` group. The accepted deviation (the group drops under the label at 1440/1024) is noted.
   - **V3/V4:** `shark-ui.tsx:22-26` (`CARD_HEAD items-start`, `HEAD_SWITCH -my-[9px]`). Knob centre = 13 px = title first-line centre (pt 3 + 10) = icon centre. The chip is on its own row (`SOON_ROW` `pl-39`, offline `pl-43` = 30 + 13). AI has a read-only off knob (`:176-179`). Panels sit side by side only from `xl` (`:341`).
   - No new Thai literal: every added line with Thai is a comment. ST7 = 0 in the round-1 unforced log and the round-2 `qc-p118-U.log`. No message keys changed. The `soon`/`accountDenied` keys exist in both th and en.
5. **Gates.**
   - Round-1 `SUMMARY.txt` and every log are headed `tree=…shark-pos-c head=85b47b2f dirty=0`. Results: typecheck 0, fitness 41/41 both ways, fitness-pos 8/8, p1.18 81/81 ×3 (residue 0), p1.10 40, p1.16 28, closeday 22, p1.6 48, p1.9 53, authz 56. Dry shots are 40/14/40/14/86/31/83/30, the same as the notes.
   - p1.3 127/128 (S1.9 = a tree-d `PQC-VIS-106324` fixture) is plausibly external; the controller still has to re-run it.
   - Round 2: 81/81 unforced, fitness 41/41, fitness-pos 8/8, dry th 40 / en 14.
   - Spot-check of earlier "Verified OK" items, none regressed: (1) tabs untouched; (2) GeneralSettings untouched; (3) 17C cap-input testids and edit rules (`canCaps && isOwner`) unchanged; (4) the ACCOUNT confirm-off path is unchanged (same `onClick`); (10) register files untouched, and the print refusal codes and `printErrorKey` are unchanged.
   - The inventory/addendum lists `card-soon-*`, `card-etax` and `state-*` on PLANNED cards. No oracle asserts their absence.

## Follow-ups
- p1.3 re-run on a quiet tenant (controller).
- Typecheck at d71947c4 in the merge gate (N3).
- First live 19ก run: check the cleanup line (N4).
- Decide N1.
- Earlier phase-close items still stand: move the 19ก fixture into `seed-pos-qc`, history scope per unit, the service-charge editor.

---
**Controller rulings (account A, 9 Oct 21:15Z):** MERGEABLE accepted. N1 → fix round 3 (owner-gated "เปิดใช้" on NO_SYSTEM cards) before merge. N2 → accept (phoneChanged flag = follow-up). N3 → typecheck in the merge gate. N4 → checked on the vis53 live register run (19ก cleanup line). Phase-close items carried.
