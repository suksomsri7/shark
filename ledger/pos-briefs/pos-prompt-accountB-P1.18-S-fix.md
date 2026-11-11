# Prompt — P1.18 S fix round 1 (reviewer F1–F10). Controller (account A, 9 Oct 15:1xZ): head = `wip/pos-p1.18` ffea3435 · review `ledger/wo-notes/pos-P1.18-review-S.md` (MERGEABLE-AFTER-FIXES; all five ORACLE-EDITs accepted) · tree **c** (free: gates49 done).

---

You are the BUILDER for the **P1.18 S fix round 1**. Same card, same rulings as `ledger/pos-briefs/pos-prompt-accountB-P1.18-S.md` (1–13 + drift, binding). English reports, Thai code comments. Read `ledger/wo-notes/pos-P1.18-review-S.md` first (findings + "Verified OK" — keep everything verified OK unchanged), then your notes `ledger/wo-notes/pos-P1.18.md`.

## Rulings per finding
1. **F1 (Medium) → fix**: `pos/settings/page.tsx` `canEditReceipt` = `evaluate(m, {module:"pos", action:"pos.device.manage"}) && canManageAllLinkedUnits(...)` — the same rule `posSettingsOverview.canEdit.receipt` uses; the unmasked PromptPay id must never reach a user without that permission.
2. **F2 (Medium, K1 bypass) → fix**: keep the per-device rule and add, in the same 15-min window and from the same AuditLog rows: (a) a **per-unit cap** on anonymous failures `STAFF_PIN_UNIT_THROTTLE_AFTER = 30` (exported from `register-shared.ts` next to the device constants) ⇒ `PIN_THROTTLED` for every anonymous attempt at that unit; (b) all **unregistered device codes count in one bucket** per unit (`deviceId: "unregistered"` in the row, or an equivalent single key) so a fresh code per attempt gains nothing; (c) serialise count → verify → insert with `pg_advisory_xact_lock(hashtext(tenantId || unitId))` inside one transaction so a parallel burst cannot all read < N. Named attempts (`userId`) stay untouched. **ORACLE-EDIT** `qc-pos-p1.18` in its own `test(pos P1.18): ORACLE-EDIT K1b K1c — unit cap + unregistered bucket (reviewer F2)` commit: K1b = 30 anonymous failures from 30 different unregistered device codes at unit A ⇒ the 31st is `PIN_THROTTLED`, unit B unaffected; K1c = 10 failures with rotating unregistered codes ⇒ throttled (bucket). Count 77 → 79; record in `pos-P1.18-oracle.md`.
3. **F3 (K4) → drop the OWNER exemption**; keep the exemption for the `crm.commission` entity set only (narrowest that keeps `qc-crm-c3.3` S4.8 green). Update the notes' deviation 1 and the `POS-OWNER-PENDING.md` line for the approval owner (commission-only exemption; multi-owner tenants are protected).
4. **F4 (Low-Med) → fix**: `settings-actions.ts` passes `args?.promptpayId` through unchanged; the writer's `VALIDATION` handles non-strings; only an explicit `null` removes.
5. **F5 (Low) → fix**: receipt audit diff masks `header.phone` (same masking as elsewhere) — or drops it from the diff; `posSettingsHistory.summaryOf` must never return a raw phone.
6. **F6 → P1.18U contract**: add "register static QR must use the branch PromptPay id first" to the U contract section of your notes (no code now).
7. **F7 (Low) → fix**: the ACCOUNT card and toggle act on **every** `AccountSystemLink` of the POS (state LINKED if any active; disable/enable loops over all links inside one transaction; facts report the count when > 1). No new refusal code.
8. **F8 (Low) → fix**: CHAT `lastActivityAt` scoped to this POS (`targetId`/systemId filter). Empty values for COUPON/REWARD/CRM/KANBAN stay.
9. **F9 (Low) → fix**: `held-cart.ts` P2002 fallback selects only `status: "HELD"` (and not expired); otherwise refuse the way a missing cart is refused.
10. **F10 → fix**: append one line to `ledger/POS-OWNER-PENDING.md` under a heading for the HR module owner about the `qc-hr-roster` NM-2 edit (what changed, why, commit).
11. **F11** → note only (follow-up in the notes).
Everything in "Verified OK" stays as it is; no other behaviour changes.

## Tree / commands
`/root/projects/shark-pos-c` (own node_modules; currently detached at ffea3435 after gates49) — `git -C /root/projects/shark-pos-c status --short` must be clean, then `git -C /root/projects/shark-pos-c fetch origin wip/pos-p1.18 && git -C /root/projects/shark-pos-c checkout wip/pos-p1.18 && git -C /root/projects/shark-pos-c reset --hard origin/wip/pos-p1.18`. No schema change ⇒ no `prisma generate` needed. Always `git -C /root/projects/shark-pos-c …` / absolute paths; run pnpm/tsx inside the tree. DB: `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh <cmd>`. Typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh flock -w 3600 /tmp/pos-gate.lock pnpm typecheck`. No build/server/deploy/.env/Telegram/seeds/wipes. Scratch only under `/tmp/claude-0/-root/ed31d917-ff51-51e8-bfad-e5b8bfa6fa15/scratchpad/p118-fix/`. Other lanes (p11, b) run suites on `posqc-coffee` — re-run once before calling a suite red.

## Gates before "done"
`qc-pos-p1.18` forced ×2 + unforced **79/79** (ST7 SKIP-until-U pass) residue 0, with K1b/K1c red before your K1 change (keep that log) · `qc-pos-p1.15` 39 · `qc-pos-p1.3` 128 · `qc-pos-p1.10` · `qc-pos-p1.7` · `qc-approval` · `qc-approval-wiring` · `qc-bulk-ops` · `qc-crm-c3.3` · `qc-hf-pos-page-authz` 56 · `qc-pos-account` 16 / `qc-account-cpa` 107 · `pnpm fitness` with/without env · `scripts/fitness-pos.mts` · typecheck 0. Logs with `tree=/root/projects/shark-pos-c head=<sha>` headers under `scratchpad/p118-fix/runs/`.

## Done =
"## Fix round 1" in `ledger/wo-notes/pos-P1.18.md` (per-finding change with file:line, K1b/K1c, deviation 1 rewritten, U-contract additions F6, follow-ups F11, gate exit codes) · push `wip/pos-p1.18` · report ≤20 lines with the head SHA. Do not merge, do not touch `session/pos`/`main`/other trees.
Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
