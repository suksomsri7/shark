# Prompt — P4.3 walker fix round 1 (R registry · H harness/fixtures · scripts only · no product code). Controller (account A, 23 Oct 23:1xZ). Tree = **/root/projects/shark-pos-b** on branch `wip/pos-p4.3-walker` (already = session/pos tip + merge of `wip/pos-p4.2-walker`; head 77de6002; status clean — verify, do not re-create).

## Read first
`ledger/wo-notes/pos-P4.3-triage.md` (the whole file — §7 is the exact fix text you apply as-is; §1/§2 give the evidence) · `ledger/wo-notes/pos-P4.2-walker.md` (rules CD-P42-R1…R13) · `scripts/qc-pos-buttons.mts` · `scripts/pos-buttons-fixtures.mts` · `scripts/pos-ui-inventory.json` · `scripts/qc-pos-p4.2.mts` · `pos-brief-COMMON.md` + `pos-brief-LANE-RULES.md` (iso.sh · qc4.sh + `/tmp/shark-gate-pos.lock` + with-gate-lock · no cd / pkill -f / export CI / `.env*` · `date -u`).

## Scope (controller rulings CD-P43-W1…)
1. **Registry** R1–R9 exactly as §7 (R10: `pos-print-drawer-open` → oracle `P1.10-E2`; `pos-tbl-qr-sheet-print` → oracle id `P4.3-S5` which the P4.3 oracle lane is adding in parallel — cite it as `P4.3-S5` and note it in your report). Do NOT apply the "after P2 is fixed" rows (accounting links) — that belongs to the product fix round.
2. **Walker** H1 H2 H3 H4 H5 H7 H9 H10 H12 H13 H15 H16 exactly as §7 (H16 = replace the weak `writtenSince` AppSystem check by the `settings.pos.<k>` before/after compare).
3. **Fixtures** H6 H8 H11 H14 as §7.
4. Keep the registry hash discipline of `qc-pos-p4.1` (run `qc-pos-p4.1 --no-db` — it must stay green or the registry change must be explained; R1/R2 anyOf, state: selected, opener steps are allowed by CD-P42 rules — cite the rule per row in the commit body).
5. **Self-verification without a server** (no build/serve/QC5 — the controller reruns the cells on tree d): `qc-pos-buttons.mts --dry --user manager --device desktop --page all` (plan still parses: every touched row appears with its new opener/expect; count rows) · `--list` per touched page · `qc-pos-p4.2 --self-test` green · `qc-pos-p4.1 --no-db` · strict single-file tsc on the 3 scripts exit 0 · `bash scripts/pos-oracle-check.sh /root/projects/shark-pos-b qc-pos-p4.2 --base 77de6002` green. Fixture pre-flight read-only on QC4 only (`pos-buttons-fixtures.mts --preflight` through `qc4.sh` + lock) — it must not write.
6. Write `ledger/wo-notes/pos-P4.3-walker-fix1.md`: per id (R1–R10, H1–H16) the line changed (w:/fx:/registry row), the probe you used, and anything in §7 that did not apply verbatim (explain why, with the actual code).

## Rules
scripts/ + ledger/ only · commit per group (registry · walker · fixtures · notes) with trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` · push `wip/pos-p4.3-walker` · every node command through `bash /root/projects/shark-pos-b/scripts/iso.sh` (ISO_MEM ≤ 3G) · QC4 read-only via `qc4.sh` + `GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh` · no QC5 · no builds/servers · no `pnpm install`/`prisma generate`/reseed · absolute paths · never `cd` · `date -u`.
Report ≤ 20 lines: head SHA (verified with `git -C … rev-parse`) · per-id done/deviation · the self-verification outputs (counts) · anything the controller must decide.
