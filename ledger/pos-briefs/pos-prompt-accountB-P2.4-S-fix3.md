# Prompt — P2.4 S fix round 3 (R2 N1–N3, small). Controller (account A, 10 Oct 05:3xZ): head 74044c87 on `wip/pos-p2.4`, tree c. Starts on the controller's go (builder cap 2).

Read `cat /root/projects/shark-pos/ledger/wo-notes/pos-P2.4-review-R2.md` (findings N1–N3 with file:line + Controller rulings) — binding. Build:
1. N1: table-mode hold without `newDraft` / `heldCartId`+`expectedVersion` ⇒ VALIDATION (th "ต้องระบุร่างและรุ่นของร่าง" + en); remove the table-draft update-or-create loop (non-table path untouched). ORACLE-EDIT (own commit, assertions unchanged): `hold` helper passes `newDraft:true`; D1 re-hold passes `heldCartId`+`expectedVersion`; extend D7 with (i) field-less hold after send ⇒ VALIDATION + 0 new HELD rows, (ii) `heldCartId` without `expectedVersion` ⇒ VALIDATION. Red-before for the D7 extension (old code: field-less hold after send creates a draft).
2. N2: `heldCartId` requires `expectedVersion` (VALIDATION).
3. N3: `cancelTableItemInTx` throws when `u.count !== 1` (tx rollback).
4. P2.4U contract note: "not cut" badge wording = "ไม่ได้ตัดวัตถุดิบตามสูตร" (F6 nit).
Gates: `qc-pos-p2.4` 46/46 forced ×2 + unforced (PAR 4/4, residue 0) · `--no-db` · typecheck · p1.5 21 · p1.15 39 · p1.3 128 · fitness ±env · fitness-pos (the rest unchanged from fix 2 — say so). Notes: fix round 3 section. Commit explicit paths, push `wip/pos-p2.4`, report ≤ 12 lines (head SHA first). Same hard rules.
