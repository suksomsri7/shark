# POS P3-SKEL S — builder notes (tree b · branch `wip/pos-p3-skel`)

Builder · account B (controller B) · 21 Oct 2026 · base `session/pos` product tip **71c49221** · oracle `origin/wip/pos-p3-skel-oracle` **5d3a84af** merged clean (no conflicts).
Contract = `ledger/wo-notes/pos-P3-SKEL-oracle.md` names table · brief `pos-brief-P3-SKEL.md` §10 rulings 1–11 + CD-SKa · prompt `pos-prompt-accountA-P3-SKEL-BUILD.md`.

## Progress (restart from here)
- [x] 1. branch + oracle merge · ORACLE-EDIT `pos-gates.json` (+`qc-pos-p3-skel` forced, after `qc-pos-p3.6`) commit 9e93b8f0 · red-before forced QC4 (PSK_PIN=71c49221) **3/41** (ST3 Z1 Z2) · 0 guard hits · residue 0
- [x] 2. migration `20261218100000_pos_p3skel` (CREATE TABLE ×4 + indexes · `SET lock_timeout`) · schema `pos.prisma` (added lines only) · `core/scope.ts` 4 × `sys()` · `POS_MODELS` ×4 · `prisma generate` (tree b, iso) · QC4 `_prisma_migrations` before deploy: pos_p35 / pos_p34 / pos_p36_credit_enum / pos_p36_credit finished, **no p3skel row** · `migrate deploy` 18:01Z → `20261218100000_pos_p3skel` finished, applied_steps 1
- [ ] 3. secret box + creds
- [ ] 4. adapters + dispatch + inbound route
- [ ] 5. slips + reconcile
- [ ] 6. e-Tax seam
- [ ] 7. print relay
- [ ] 8. docs + texts
- [ ] 9. gates
