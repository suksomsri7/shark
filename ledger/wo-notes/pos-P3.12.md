# P3.12 — ปิดเฟส 3 · builder S notes (`wip/pos-p3.12` · tree f)

Builder S (account B lane · prompt `ledger/pos-briefs/pos-prompt-accountB-P3.12-S-BUILD.md`, controller tree) · 22 Oct 2026 10:59–11:5xZ (`date -u`) · base `origin/session/pos` **137aa93a** (merge-base unchanged after fetch) · start HEAD 98026b66 · only `src/lib/pos-integrations.ts` (labels) touched in product code · no DB seed · no build/serve · every node command through `scripts/iso.sh` (ISO_MEM=3G) + `qc4.sh` + POS gate lock, one at a time (tree-d build running on the machine).

## Task → commit
| task | what | commit |
|---|---|---|
| T1 | K1 facts relabel (7 facts) — product | `36a3b565` |
| T1 | ORACLE-EDIT CD-P312-K1 (p2.14 K1 · p1.18 FACTS/PLANNED_PHASE/I8 · p3-skel PROMPTPAY_FACT · p2.4 ST4) | `6f9a828f` |
| T2 | K2 OP lines P3.4 (new §core/api-keys ×2 · §Restaurant kds.ts ×1) | `1d43f3a9` |
| T3 | V3 OP W36 (P3.9U) + HANDOVER §3 bundle row + triage F-P3-14 DONE (HANDOVER + prep) | `c2e2a519` |
| T4 | K3 `docs/modules/14-pos.md` head pointer → HANDOVER-P3 | `5cfe7128` |
| T5 | ORACLE-EDIT CD-P312-W21 (p3.4 · p3.5 · p3.7 · p3.8) | `679851de` |
| T5 | OP W21 row: default applied + revert recipe | `030492ab` |
| T6 | `scripts/pos-repin-lane.sh` + LANE-RULES pointer | `a0fdfe2d` |
| T8 | these notes + HANDOVER slots (§5 K1/W21 · §8 2(c)/(d) · triage F-P3-02…06) | (this commit) |

## CD-P312-K1 as applied (brief §10.6)
| where | old | new |
|---|---|---|
| `src/lib/pos-integrations.ts` FACTS | voucherPayment · lowStockReorder · couponAfterPurchase · callQueueFromTable · advanceBookingBill `"P3"` · bigBillDeal `"P3.x"` · promptpayReconcile `"P3.10"` | `"P4+"` ×6 · promptpayReconcile `"W4"` (+ `// POS P3.12 ▸ CD-P312-K1 … ◂` on the const) |
| `qc-pos-p2.14.mts` FACTS_WANT (:399–401) + K1 title | `[false, "P3"]` ×3 | `[false, "P4+"]` ×3 |
| other K1 hits (grep of every exam for the 7 keys) | `qc-pos-p1.18.mts:312–321` FACTS (DB I12 compare, `:1529`) · `:324` PLANNED_PHASE.BOOKING `"P3"` + `:1478` I8 tuple `"P3"` (I8 requires a BOOKING fact whose phase = PLANNED_PHASE — would go red after the relabel) · `qc-pos-p3-skel.mts:462` PROMPTPAY_FACT `'["promptpayReconcile", false, "P3.10"]'` (+ RC3 title :90) · `qc-pos-p2.4.mts:642` regex `"P3"` (+ ST4 title :56) | same relabel, one ORACLE-EDIT comment each |
Not hits (checked): `qc-pos-p3.6.mts:461` (bigBillDeal false, label-free) · i18n `pos.json` keys (text only) · `ReconcileView.tsx` / `payment-reconcile.ts` comments. UI: `SharkSettings.tsx:213` takes the first fact phase as-is (chip "เร็ว ๆ นี้ · P4+"). Revert = restore the literals in the product file and the 4 exams together (`git revert 6f9a828f 36a3b565`). `ProductPanel.tsx` "P2.3" literal (F-P3-06 second half) not touched — outside this prompt.

## CD-P312-W21 as applied (prep §(e) 1 · brief §10 ruling 4) — `BASE8` = 137aa93a
| suite | old | new | revert |
|---|---|---|---|
| qc-pos-p3.4 | `LANE_REV = P34_LANE \|\| "9cfa81bb"` · register/service ST2 compared `onlyMarked(showAt(rv,f), head)` for every rv | default `"137aa93a"` · `laneView()`: a rev that already carries `POS P3.4 ▸` blocks drops them from the base before the subsequence test **and** the block text must equal that rev's (pre-P3.4 revs 72669941/688fc3ed unchanged) | `env P34_LANE=9cfa81bb` + `git revert 679851de` for laneView |
| qc-pos-p3.5 | `const LANE_PIN = "9cfa81bb"` | `process.env.P35_LANE_PIN \|\| "9cfa81bb"` (lint O3 only) | restore the literal |
| qc-pos-p3.7 | no LANE_PIN · nearBase = last of bases() | `LANE_PIN = P37_LANE_PIN \|\| "137aa93a"` added last to bases() · nearBase = LANE_PIN › P37_PIN › BASE_REV · ST3 message names it | `env P37_LANE_PIN=42b823e9` (= P37_PIN → old behaviour) |
| qc-pos-p3.8 | ST2/ST3 vs BASE 42b823e9 only | `LANE_PIN = P38_LANE_PIN \|\| "137aa93a"` · ST2/ST3 = functions; firstOk BASE › LANE_PIN; at a rev that already carries the P3.8 `pos.shift.closed` line the outbox diff must be **+0/−0** (vs +1/−1 at BASE); passing base kept in `stNotes["STn.base"]` (detail text) | `env P38_LANE_PIN=42b823e9` (= BASE → firstOk skips) |
Deviation from the prompt (why): item 4 said only "LANE_REV default → BASE8"; with that alone p3.4 ST2 stays red (`dropped` = this card's own 99/21 marked lines at any post-P3.4 rev) — `laneView` is the ownHunks part of ruling 4. p3.8 ST2 re-evaluated literally at LANE_PIN gives +0/−0 ≠ +1/−1, hence the `carried` rule. Nothing deleted; every assertion still runs.

### §probe (negative controls · tree f · restored with `git checkout --` · porcelain 0 after)
| probe | suite | result |
|---|---|---|
| A unmarked `export const __probeUnmarked` appended to register.ts + 1 char in a P3.4 block of service.ts | p3.4 --no-db | ST2 ❌ |
| A2 only the P3.4-block edit in service.ts | p3.4 --no-db | ST2 ❌ |
| B unmarked comment appended to outbox-consumers.ts | p3.8 / p3.7 --no-db | p3.8 ST2 ❌ (+29/−10) · p3.7 ST3 ❌ |
| C comment appended to prisma/schema/pos.prisma | p3.8 / p3.7 --no-db | p3.8 ST3 ❌ · p3.7 ST3 ❌ "prisma/ เปลี่ยน" |

### Lint `pos-oracle-check.sh <tree f> <suite> --base <HEAD8>` after T5
p3-skel warn (O3) · p3.12 warn (O3) · p3.4 **green** · p3.5 warn (O6 O10) · p3.6 warn (O3) · p3.7 warn (O6) · p3.8 warn (O3) · p3.9 warn (O3 O10) — no red (before: p3.5 red O3 · p3.7 red O5 · p3.8 red O5).

## T6 — `scripts/pos-repin-lane.sh` test output
```
$ pos-repin-lane.sh --dry-run <f> 554a74d3 "P3 close freeze" qc-hf-fu qc-pos-p3.5 qc-pos-p3.6 qc-pos-p3.4:LANE_REV qc-pos-p3.7 qc-pos-p3.8:LANE_PIN qc-pos-p2.10
qc-hf-fu: LANE_PIN 50019b25 → 554a74d3 (line 233) · dry-run
qc-pos-p3.5: LANE_PIN 9cfa81bb → 554a74d3 (line 54) · dry-run
qc-pos-p3.6: LANE_PIN f6ae3054 → 554a74d3 (line 53) · dry-run
qc-pos-p3.4: LANE_REV 137aa93a → 554a74d3 (line 238) · dry-run
qc-pos-p3.7: LANE_PIN 137aa93a → 554a74d3 (line 267) · dry-run
qc-pos-p3.8: LANE_PIN 137aa93a → 554a74d3 (line 196) · dry-run
qc-pos-p2.10: LANE_PIN 55d19818 → 554a74d3 (line 221) · dry-run
rc=0
$ … --dry-run qc-pos-p3.12 (alias LANE_PIN = … || PIN) + qc-pos-p3.4 (LANE_PIN absent, default falls to LANE_REV)
🔴 qc-pos-p3.12: ไม่พบ `const LANE_PIN|LANE_REV = "<sha>"` หรือ `= process.env.X || "<sha>"`
rc=1
$ … bad sha
🔴 SHA ไม่พบใน /root/projects/shark-pos-f: deadbeef
rc=1
$ pos-repin-lane.sh <f> 554a74d3 "P3 close freeze test" qc-pos-p3.4:LANE_REV   (real run, then git checkout --)
qc-pos-p3.4: LANE_REV 137aa93a → 554a74d3 (line 238)
 scripts/qc-pos-p3.4.mts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
rc=0
-const LANE_REV = process.env.P34_LANE || "137aa93a"; // ORACLE-EDIT ผู้คุม B 22.10 (CD-P312-W21 · W21 default re-base · old 9cfa81bb · revert: env P34_LANE=9cfa81bb or restore the literal) · ORACLE-EDIT ผู้คุม 21.10 (CD
+const LANE_REV = process.env.P34_LANE || "554a74d3"; // ORACLE-EDIT ผู้คุม 22.10 (P3 close freeze test · re-pin 137aa93a → 554a74d3) · ORACLE-EDIT ผู้คุม B 22.10 (CD-P312-W21 · W21 default re-base · old 9cfa81bb · rever
$ (real run 2) qc-hf-fu
qc-hf-fu: LANE_PIN 50019b25 → 554a74d3 (line 233)
 scripts/qc-hf-fu.mts    | 2 +-
 scripts/qc-pos-p3.4.mts | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)
rc=0
-const LANE_PIN = "50019b25"; // ORACLE-EDIT ผู้คุม 22.10 (CD-RP17 P3-SKEL U merge · re-pin 359f6537 → 50019b25) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP16 harness type fix · re-pin 8b6b66e4 → 359f6537) · ORACLE-EDIT ผู้คุม
+const LANE_PIN = "554a74d3"; // ORACLE-EDIT ผู้คุม 22.10 (P3 close freeze test · re-pin 50019b25 → 554a74d3) · ORACLE-EDIT ผู้คุม 22.10 (CD-RP17 P3-SKEL U merge · re-pin 359f6537 → 50019b25) · ORACLE-EDIT ผู้คุม 22.
```
(both real runs undone with `git checkout -- scripts/qc-pos-p3.4.mts scripts/qc-hf-fu.mts`). Freeze note for the controller: p3.4/p3.7/p3.8 now default to 137aa93a, which is newer than 554a74d3 (O4 accepts it); re-pin them to the P3.12 merge SHA, never back to 554a74d3.

## Exam runs (all via iso · UTC)
| suite · mode | result | UTC |
|---|---|---|
| qc-pos-p3.12 (static) before | 11/22 (red X1 X2 V2 V3 H4 K1 K2 K3 O2 O3 O4) | 10:59 |
| qc-pos-p2.14 --no-db (after T1) | 15/15 (K1 ✅) | 11:00 |
| qc-pos-p3.12 after T1 · after T2–T4 · after T5 | K1 ✅ · 15/22 (V3 K2 K3 ✅) · 17/22 (O2 O3 ✅) | 11:00 · 11:05 · 11:13 |
| qc-pos-p3.4 / p3.7 / p3.8 --no-db before T5 | 14/15 (ST2 ❌) · 3/4 (ST3 ❌) · 1/3 (ST2 ST3 ❌) | 11:07 |
| qc-pos-p3.4 --no-db with `P34_LANE=137aa93a` only (no laneView) | 14/15 (ST2 ❌ — why laneView) | 11:08 |
| qc-pos-p3.4 / p3.7 / p3.8 --no-db after T5 | 15/15 · 4/4 · 3/3 | 11:10 |
| qc-pos-p3.5 --list | rc 0 (57 lines) | 11:10 |
| strict single-file tsc: p2.14 · p1.18 · p3-skel · p2.4 · p3.4 · p3.5 · p3.7 · p3.8 | exit 0 ×8 (p3.7/p3.8 re-run after the probe comments 11:19) | 11:00–11:19 |
| fitness (no env) · fitness (QC4) · fitness-pos | 53/53 · 53/53 · 8/8 | 11:18–11:19 |
| qc-pos-p2.14 full | 59/60 (Z2 PosSale 532→519 in the seed shop = another QC4 writer, F-P3-71 class) → re-run **60/60** | 11:19 · 11:33 |
| qc-pos-p3.12 full · --self-test | 17/22 (red X1 X2 V2 H4 O4 only) · 13/13 | 11:21 · 11:22 |
| qc-pos-p2.10 --no-db | 1/2 — ST2 lane pin 55d19818 flags every edited exam file ("CONTROLLER-DECISION" · expected; clears with the freeze re-pin, p2.10 last) | 11:23 |
| qc-hf-fu --no-db · qc-hf-fu2 --no-db | 4/4 · 22/23 — HF-FU2-ST1 = `pos-integrations.ts` hunks vs lane pin 50019b25 (the K1 relabel · expected lane-pin red, clears with the freeze re-pin) | 11:24 · 11:25 |
| qc-pos-p3-skel · p2.4 · p1.18 · p3.4 · p3.5 · p3.7 · p3.8 --no-db | 6/6 · 7/7 · 16/16 · 15/15 · 11/11 · 4/4 · 3/3 | 11:26–11:32 |
| `pos-pre-submit.sh --wo qc-pos-p3.12 --set core --also qc-pos-p2.4,qc-pos-p3-skel` (`/root/pos-runs/presubmit-shark-pos-f-20261022T113431Z`) | p3.12 17/22 ×3 (by design) · p1.1 180/180 · p1.3 128/128 · p1.6 48/48 · **p1.18 81/81** (DB I8/I12 with the new labels) · p2.4 50/50 · p3-skel 41/41 · hf-fu 29/29 · hf-tx 22/22 · hf-fu2 30/31 (ST1 lane pin, expected) · fitness 53/53 ×2 · fitness-pos 8/8 · gen-check 0 | 11:34–11:56 |
`git status --porcelain` empty after every run (Z1).

## `qc-pos-p3.12` per check (before 98026b66 → after)
red before 11/22 (X1 X2 V2 V3 H4 K1 K2 K3 O2 O3 O4) → after **5/22** (X1 X2 V2 H4 O4 — controller slots / QC7 / parity / freeze batch, by design). Green now: G1–G4 V1 V3 H1 H2 H3 K1 K2 K3 O1 O2 O3 T1 Z1. `--self-test` 13/13.

## Other
- P3.9U W36 text source: `wo-notes/pos-P3.9U.md:39–41` (R1 title · CD-P39U-2 seed · R4 owner-only card) · `:45` + `:122–126` (CD-P39U-B1 final, fix2/fix3); images tree d `.qc-shots/pos/p3.9u/` (32) + `p3.9u-en/` (12).
- K2 P3.4 sources: `pos-P3.4.md:19 :22 :40` + diffs `566eb646` (permissions.ts +1 · scopes.ts +1) · `bc974982` (kds.ts +1) · `1be86fee` (p2.13 BUNDLE_SPEC).
- Not done (not in this prompt): F-P3-69 SKEL-U §OP lines · F-P3-70/71 ORACLE-EDITs · ProductPanel "P2.3".

## §qcall
⟨controller⟩ เติมหลังรัน QC7
