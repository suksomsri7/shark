# P3.12 oracle — `scripts/qc-pos-p3.12.mts` (22 static checks) · notes

Oracle + HANDOVER writer (controller B lane · tree f · `wip/pos-p3.12`) · 22 Oct 2026 10:30–10:5xZ (`date -u`) · base `origin/session/pos` **137aa93a** (≥ 554a74d3 = P3-close tip) · commits: oracle + manifest **c0b52128** · HANDOVER draft **55b7ab91** · these notes (next commit) · scripts/ + ledger/ only · no DB · no build/serve · every node command through `scripts/iso.sh`.

Run: `bash scripts/iso.sh pnpm exec tsx scripts/qc-pos-p3.12.mts [--list | --no-db | --self-test]` (gate runner: unforced row after `qc-pos-p3-skel` in `scripts/pos-gates.json`). Pins: `PIN = P312_PIN || 554a74d3` (P3-close tip) · `LANE_PIN = P312_LANE_PIN || PIN` (lane-pin freeze target, O4). No byte-diff against a pin anywhere (no O5/O6 exposure).

## Check ↔ brief map
| id | brief §4 / source | what | green by design? |
|---|---|---|---|
| G1 | G1 · §4(a) | manifest ⊇ every `scripts/qc-pos-*.mts`/`qc-hf-*.mts` + 20 Tier-1 suites | yes (self-test) |
| G2 | G2 · §10.4 | no `accepted.checks` id of the form `ST<n>` (lane pins are fixed, not accepted) | yes (self-test) |
| G3 | G3 · HF-FU2 runner (b) | every accepted: reason ≥ 10 · owner · opRef in OP · checks non-empty · CRASH/*-ERR ⇒ match | yes (self-test) |
| G4 | §4(a) · prep §(e) ruling 2 | `qc-crm-c2.7` in `$pending` (state `pending-triage` · reason · triage F-P3-xx · opRef in OP) and not in `suites` | no (added in c0b52128) |
| X1 | X1 · §4(a) 1–5 | `wo-notes/pos-P3.12.md` `## §qcall` contract (CD-P312-O3) | no |
| X2 | X2 | §qcall has the line "ลบ QC7" | no |
| V1 | V1 | sweep.json real th+en rows for `p3.6u`, `p3-skel-u` (CD-P312-O12) | yes (self-test) |
| V2 | V2 · §4(b) 5 | `wo-notes/pos-P3.12-parity.md`: status table · rows · OPEN 0 · every DEVIATION cites W-id/CD-*/มติ/ruling | no |
| V3 | V3 · prep §(c) | an OP `\| W<n> \|` row names every P3 U card with derived screens (P3.4U P3.5U P3.6U P3.7U P3.8U P3.9U P3-SKEL U) | no |
| H1 | H1 · §4(c) | `HANDOVER-2026-10-xx-POS-P3.md` has `## §0`…`## §8` · 15 P3 rows in §1 with SHAs, all ancestors of HEAD | no (green after 55b7ab91) |
| H2 | H2 (= p2.14 H2) | POS-CONTRACTS `## Event` ⊇ 17 `pos.*` keys of outbox-consumers.ts | yes (self-test) |
| H3 | H3 | HANDOVER §4: one bucket per row ∈ {P3.12 P4 P5 P6 OP S follow-up card} · OP rows' anchor (W-id / §header) exists in OP | no (green after 55b7ab91) |
| H4 | §4(c) (controller part) | no `⟨controller⟩` slot left in HANDOVER-P3 | no (red by design until filled) |
| K1 | K1 · §10.6 | no `pos-integrations.ts` fact `false` labelled `P3` / `P3.x` / `P3.<n>` | no |
| K2 | K2 · ⚠️4 · prep §(e) 6–7 | OP `## แจ้งเจ้าของโมดูล X` with a `- (P3` bullet **and** inline `§"แจ้งเจ้าของ… X"` for Chat · CRM · platform/payment · app-shell · settings/staff + `- (P3.4 …)` lines naming core/permissions.ts · api-keys/scopes.ts · kds.ts | no |
| K3 | K3 | `docs/modules/14-pos.md` head `>` line points at HANDOVER-P3 | no |
| O1 | O1 · CD-P312-O1 | `qc-pos-p1.6` R2 has `walk("src/lib").filter(/…/)` and its regex covers every real `src/lib/pos-*actions*.ts` (3) | yes (self-test) |
| O2 | O2 | `pos-oracle-check.sh <tree> <suite> --base <HEAD sha8>` VERDICT ≠ red for every `qc-pos-p3*` | no |
| O3 | O3 | every `qc-pos-p3*` has `const LANE_PIN\|LANE_REV = process.env.X \|\| …` | no |
| O4 | O4 · §10.10 | every LANE_PIN/LANE_REV literal in qc-pos-*/qc-hf-* = LANE_PIN, or a commit in (LANE_PIN, HEAD] | no |
| T1 | §4(d) · prep §(b) · ruling (e)4 | HANDOVER §4 ids unique ⊇ the 65 prep ids · every row a bucket · ≥ 1 row sourced from P3-SKEL-U | no (green after 55b7ab91) |
| Z1 | Z1 | git status before = after · the suite imports no DB client and reads no DB env | yes (self-test) |

Not carried from the brief as separate ids: none dropped — brief's ≈24 became 22 (G1–G3 + G4 · X1–X2 · V1–V3 · H1–H3 + H4 · K1–K3 · O1–O4 · T1 · Z1).

## Red-before
| check | base 137aa93a (+ oracle file only) | after c0b52128 (manifest) | after 55b7ab91 (HANDOVER draft) | why red / what turns it green |
|---|---|---|---|---|
| G1 | 🔴 | ✅ | ✅ | only `qc-pos-p3.12` itself unregistered (POS half + Tier 1 already green) |
| G2 | ✅ | ✅ | ✅ | |
| G3 | ✅ | ✅ | ✅ | |
| G4 | 🔴 | ✅ | ✅ | no `$pending` → added |
| X1 | 🔴 | 🔴 | 🔴 | no `wo-notes/pos-P3.12.md` §qcall (qc:all QC7 not run) |
| X2 | 🔴 | 🔴 | 🔴 | same |
| V1 | ✅ | ✅ | ✅ | both U rows real (merged 06:06Z / 10:28Z) |
| V2 | 🔴 | 🔴 | 🔴 | parity sheet not written (sweep queued) |
| V3 | 🔴 | 🔴 | 🔴 | P3.9U has no W-row (F-P3-14) |
| H1 | 🔴 | 🔴 | ✅ | no HANDOVER-P3 → draft |
| H2 | ✅ | ✅ | ✅ | |
| H3 | 🔴 | 🔴 | ✅ | no HANDOVER §4 → draft (all 23 OP rows resolve) |
| H4 | 🔴 | 🔴 | 🔴 | 39 `⟨controller⟩` slots |
| K1 | 🔴 | 🔴 | 🔴 | 7 facts: voucherPayment P3 · promptpayReconcile P3.10 · lowStockReorder P3 · bigBillDeal P3.x · couponAfterPurchase P3 · callQueueFromTable P3 · advanceBookingBill P3 (builder S relabel + p2.14 K1 ORACLE-EDIT) |
| K2 | 🔴 | 🔴 | 🔴 | the 5 module headers + anchors are present; only the 3 `(P3.4 …)` lines are missing (ruling (e)6) |
| K3 | 🔴 | 🔴 | 🔴 | head line still "P2 as-built: see HANDOVER-P2" |
| O1 | ✅ | ✅ | ✅ | done ahead (950656e6) |
| O2 | 🔴 | 🔴 | 🔴 | p3.5 red O3 · p3.7 red O5 · p3.8 red O5 (W21 class) |
| O3 | 🔴 | 🔴 | 🔴 | p3.5 (LANE_PIN literal, no env) · p3.7 · p3.8 (no lane pin) |
| O4 | 🔴 | 🔴 | 🔴 | all 12 literal lane pins predate 554a74d3 (freeze batch not run) |
| T1 | 🔴 | 🔴 | ✅ | no HANDOVER §4 → draft (71 rows · 6 SKEL-U/post-prep rows) |
| Z1 | ✅ | ✅ | ✅ | |
| **red** | **16/22** | **14/22** | **11/22** | brief estimate ≈ 18/24 |

Positive control (`--self-test`, 13 flips, all red ✅): G1 ×3 (drop qc-pos-p3.6 · drop Tier-1 qc-ai-plan · ghost qc-hf file) · G2 (accepted `P3.7-ST3`) · G3 ×2 (CRASH without match · opRef not in OP) · V1 ×2 (drop p3-skel-u-th · placeholder p3.6u-th) · H2 (ghost `pos.ghost.event`) · O1 ×2 (walk over modules/pos only · ghost `src/lib/pos-ghost.actions.ts`) · Z1 ×2 (DB import · git status drift). JSON_SUMMARY self-test 13/13.

## Lint per `qc-pos-p3*` suite (`pos-oracle-check.sh <tree f> <suite> --base <HEAD>` through iso · 10:3x–10:49Z)
| suite | VERDICT | red | warn |
|---|---|---|---|
| qc-pos-p3-skel | warn | – | O3 default PIN 959b257a ≠ base |
| qc-pos-p3.4 | warn | – | O10 (23 ORACLE-EDIT, no probe word in file) |
| qc-pos-p3.5 | **red** | O3 (no env-override PIN) | O6 W21-class · O10 |
| qc-pos-p3.6 | warn | – | O3 default PIN 54913c60 ≠ base |
| qc-pos-p3.7 | **red** | O5 (diff vs pin, no LANE_PIN) | O6 W21-class · O10 |
| qc-pos-p3.8 | **red** | O5 (diff vs pin, no LANE_PIN) | O3 default BASE 42b823e9 ≠ base · O10 |
| qc-pos-p3.9 | warn | – | O3 default PIN 8bded5a7 ≠ base · O10 |
| qc-pos-p3.12 | warn | – | O3 default PIN 554a74d3 ≠ HEAD (ledger commits on top — expected) |

## Lane-pin table (read from the files at 55b7ab91 · target LANE_PIN = 554a74d3)
| suite | const | env | value | status |
|---|---|---|---|---|
| qc-hf-fu | LANE_PIN | – | 50019b25 | before LANE_PIN (not frozen) |
| qc-hf-fu2 | LANE_PIN | – | 50019b25 | before |
| qc-pos-p2.8 | LANE_PIN | – | bafdf89f | before |
| qc-pos-p2.10 | LANE_PIN | – | 55d19818 | before (re-pin commit CD-RP17) |
| qc-pos-p2.11 | LANE_PIN | – | 9cfa81bb | before |
| qc-pos-p2.12 | LANE_PIN | – | 50019b25 | before |
| qc-pos-p2.13 | LANE_PIN | – | 9cfa81bb | before |
| qc-pos-p3-skel | LANE_PIN | PSK_LANE_PIN | 50019b25 | before |
| qc-pos-p3.4 | LANE_REV | P34_LANE | 9cfa81bb | before |
| qc-pos-p3.5 | LANE_PIN | – (literal) | 9cfa81bb | before · no env (O3) |
| qc-pos-p3.6 | LANE_PIN | P36_LANE_PIN | f6ae3054 | before |
| qc-pos-p3.9 | LANE_PIN | P39_LANE_PIN | 9cfa81bb | before |
| qc-pos-p3.7 | (none) | – | – | no lane pin (W21 re-base adds `P37_LANE_PIN`) |
| qc-pos-p3.8 | (none) | – | – | no lane pin (W21 re-base adds `P38_LANE_PIN`) |
| qc-pos-p5.2 | LANE_PIN | P52_LANE_PIN | alias PIN | not counted |
| qc-pos-p3.12 | LANE_PIN | P312_LANE_PIN | alias PIN | not counted |

Summary: 12 literal lane pins, 0 frozen (0/12 = LANE_PIN or later) · 2 suites without any lane pin (p3.7, p3.8) · 1 without env override (p3.5) · not counted: sibling revs `qc-pos-p3.4` SIB_REV 688fc3ed · `qc-pos-p3.5` SIB_REVS · `qc-pos-p2.7` extra rev `bafdf89f` (`:362`, an `add(...)` call, not a LANE constant).

## Regression after the commits (iso)
`qc-pos-p2.14 --no-db` 15/15 (G1–G4 green with `$pending` + the new row) · `qc-pos-p2.10 --no-db` 2/2 · `qc-hf-fu --no-db` 4/4 · `qc-hf-fu2 --no-db` 23/23 · `qc-pos-p2.12 --no-db` 3/3 (no re-pin needed after the scripts commit) · `fitness` 53/53 (no env) · `fitness-pos` 8/8 · `pos-gates-all.sh --dry` 135 PLAN lines (127 suites + 8 commands) · `tsc --noEmit --strict` single file 0 (positive control: a one-line TS2322 file → exit 2) · pre-commit fitness ✅ ×2.

## CONTROLLER-DECISION (proposed · CD-P312-O3…)
- **CD-P312-O3 — §qcall contract (X1/X2)**: `ledger/wo-notes/pos-P3.12.md` gets `## §qcall` with `- head: \`<sha>\`` (PIN ≤ head ≤ HEAD) · `- branch: \`<neon branch>\`` · `- result: <passed>/<total>` · a table `| class | count | ref |` whose class is one of `QC4-ONLY ACCV2-SEED SCHEMA-DRIFT CRM-RAWSQL-S9 SEED-EMPTY NEEDS-SERVER ACCEPTED` (= HANDOVER-P2 §2 :55) or carries a `CD-*` id · Σcount = total − passed · and a line containing "ลบ QC7". HANDOVER-P3 §2 has the same table to copy.
- **CD-P312-O4 — ids**: brief ids kept; added G4 (`$pending`), H4 (no `⟨controller⟩` left — keeps H1 about structure/SHAs only), T1 (triage completeness, the prompt's T1). 22 checks.
- **CD-P312-O5 — K1 reading**: the prompt line "K1 docs head line" is read as brief K1 (facts labels); the docs head line is K3. Facts check counts only `false` facts whose label is `P3`/`P3.x`/`P3.<n>`; ProductPanel "P2.3" literal (F-P3-06) is left to the builder S (not in K1, as in the brief).
- **CD-P312-O6 — O2 base**: `--base` is the resolved `git rev-parse --short=8 HEAD` instead of the literal `HEAD` (the lint compares sha prefixes); VERDICT `warn` passes, only `red` fails.
- **CD-P312-O7 — O4 rule**: a lane pin passes when it equals LANE_PIN or is any commit in (LANE_PIN, HEAD] (descendant of LANE_PIN, ancestor of HEAD) — not only commits whose subject says re-pin — so the routine CD-RP re-pins after P4 merges keep O4 green; pins that alias PIN (p5.2, p3.12) are not counted; LANE_REV (p3.4 naming) counts as a lane pin (also for O3).
- **CD-P312-O8 — Z1 static**: no DB is opened, so "residue" = git status before/after + no DB client import / DB env read in the suite source (patterns built from string pieces so the source does not match itself).
- **CD-P312-O9 — `$pending` schema**: `[{suite, state: "pending-triage", reason, triage: "F-P3-09 · F-P3-38", opRef, trial}]`; runners read only `suites`/`commands` (checked: gates-all --dry · p2.14 G1–G4 · pre-submit list builder). Admitting `qc-crm-c2.7` later = move the row into `suites` (G4 then needs the `$pending` row removed and the suite green on QC4).
- **CD-P312-O10 — H1 sections**: HANDOVER-P3 uses the controller's outline §0–§8 (state · cards · cross-system · owner-ack · triage · oracle edits · lessons · P4–P6 start · resume steps), so H1 requires `## §0`…`## §8` (brief said §0–§7 with a different order); the P3.12 row is not required to carry a SHA (H4 covers the slot).
- **CD-P312-O11 — V1 "real row"**: th row has `states: true`, pages, no "placeholder", a `vis-…-qc5-<UTC>` run id and an `N/N` count; en row = `wo <x>-en`, locales `[en]`, no "placeholder".
- **CD-P312-O12 — V2 statuses**: MATCH · DEVIATION · OPEN · CTRL accepted as cells (CTRL = controller-judged, P2.14 folded it); DEVIATION must cite `W<n>` · `CD-*` · `มติ …` · `ruling …`.
- **CD-P312-O13 — self-test outside the gate run**: `--self-test` is a separate mode (13 flips over the 7 green-by-design checks) so the gate row stays one plain static run.

## Notes for the controller
- The HANDOVER §4 table copies the 65 prep rows verbatim (F-P3-60…62 get an "after SKEL-U merge: unchanged" note) and adds F-P3-66…71 (SKEL-U F2 QC5 creds rows → OP W4 · seller reader host:port → S follow-up · CD-SKELU-6 SLIP_MAX_BYTES → P4 · SKEL-U §OP lines not yet in OP → P3.12 · p2.13 SA8 flake → P3.12 · Z2-fingerprint noise class → P3.12). Totals 71: P3.12 18 · P4 8 · P5 13 · P6 2 · OP 23 · S follow-up 7.
- O2/O3 turn green only with the W21 re-base (p3.7/p3.8 `Pxx_LANE_PIN` + ownHunks) and an env-override PIN/LANE_PIN in p3.5; O4 turns green with the freeze batch (`repin-lane.sh` handles `^const LANE_PIN = "` literals only — p3-skel/p3.6/p3.9/p3.4 env-default pins need a manual edit of the default).
- K1 and `qc-pos-p2.14` K1 (`:399–401`, expects "P3") conflict until the relabel + its ORACLE-EDIT land together.
