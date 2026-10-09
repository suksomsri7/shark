# POS P1.12U — builder notes (01 member chip · 14A member panel · 02 benefit rows · disabled P2 tiles · 02b points cell · visual)

Builder U · VPS account B · 9 Oct 2026 · tree `/root/projects/shark-pos-d` (lane 4) · branch `wip/pos-p1.12u` from `tmp/p112-merge` a2d2848d
(= session/pos f1d8ee4c + P1.12 S 80d86f6b). Contract: `ledger/pos-briefs/pos-prompt-accountB-P1.12U.md` rulings 1–11 ·
`ledger/wo-notes/pos-P1.12.md` "P1.12U contract". Scratch/logs: `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p112u/`.

## Checkpoint
- Done: step 1 (ruling 2 server hunk + ORACLE-EDIT U1 · cart state/quote guards · MemberChip + totals rows) · step 2 (MemberPanel 14A +
  QuickRegisterForm + SHARK-MC scan routing: camera from panel, wedge with panel on top, wedge/camera outside the panel).
  Step 3 (PayBenefits 02 + disabled P2 tiles + CouponDialog real entry + PayDone 02b cell + keys/inventory + spec addendum).
- Next: step 4 (visual states + fixture · merge origin/session/pos · final gates · notes).
- Commands: typecheck `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck` ·
  keys `python3 <scratch>/add_keys.py <tree>` · inventory `python3 <scratch>/inv.py <tree> [testid-to-remove…]`.

## Server hunks
- Ruling 2 (`01ef0c77`, +5 lines): `register.ts registerStatus` → `memberEnabled = !!systemForUnit(unitId, "MEMBER")` (read error ⇒ false) (+3) ·
  `register-shared.ts RegisterStatus.memberEnabled: boolean` (+2).
- ORACLE-EDIT U1 (`9a98d6d3`): `qc-pos-p1.12` U1 — unit A true / unit B false · count 64 → 65 · `pos-P1.12-oracle.md` updated.
