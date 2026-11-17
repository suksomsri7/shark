# HR VIS-5a — P7 controller ruling + walk-seed OT row (17 Nov 2026 · oracle writer · lane 3)

Branch `wip/hr-vis-5a`, base head e64e15b88. No src/ edits. No pin or golden changed.

## A. qc-hr-priv-3 P7 (controller ruling)
- `scripts/qc-hr-priv-3.mts`: for each entitled payroll viewer (O M MB P PB PR), the oracle renders the default page and reads the `hr-pay-view-*` sub-nav (same enumeration as vis-5a W2). It then renders every offered `?view=` and compares the **union** of fixture names and testids with the existing `GOLD.pages["payroll.*"]`.
  - The sub-nav ids themselves are not counted, because they were not on the base page.
  - Each view must render ok.
  - Other pages (register, leave) keep the single-render cell.
- Markers: each hunk carries `ORACLE-EDIT (HR VIS-5a · controller) P7 of HR PRIV-3`. That one line is accepted by both allowlists that check this file:
  - **priv-2 S4 / h4.3 S1.6:** `p3Ok` (every hunk contains "HR PRIV-3").
  - **vis-5a S2:** `oracleEditOk`.
- Debug: `QC_PRIV3_P7_IDS=1` prints the views and the union ids for each viewer.
- **Result: P7 GREEN. The union reproduces all six goldens exactly, so there is no diff to list.**

| viewer | views offered |
|---|---|
| O | adjust, docs, hours, profiles, run, ytd |
| P | adjust, docs, hours, profiles, run, ytd |
| M | adjust, hours, run |
| MB | adjust, hours, run |
| PB | adjust, hours, profiles, run |
| PR | adjust, run |

  (The priv-3 fixture is engine 1, so history is not in the nav.)
- S4 and S6 are still red, as expected, and were not touched. S4's "outside/unmarked" list now also names `seed-hr-walk.mts`, which is ticket-scoped and resolves at merge like the rest.

## B. Walk seed: one APPROVED OT row for น้ำฝน in {period.DRAFT}
- `scripts/seed-hr-walk.mts`, before `run.DRAFT.create`:
  - `pay.requestAdjustment`: emp.namfon, period DRAFT, kind OT, 6 h, requested by payroll.
  - Then `pay.decideAdjustment(APPROVED)` as owner. The step fails if the approval moves the row to another period.
  - The id is stored in the manifest as `ids.otNamfon`.
- New step `run.DRAFT.otNamfon` reads the stored rows and checks:
  - the adjustment is APPROVED and bound to the draft run;
  - น้ำฝน's item has OT snapshot lines whose sum equals the adjustment amount;
  - `addSatang` ≥ that amount.
- `--down` is unchanged. The row is not in the baseline ids, so the generic delete removes it, and the walk-run `runId` is released first as before.
- `qc-hr-vis-5a` S2: + `TOOL = ["scripts/seed-hr-walk.mts"]`, accepted only when every hunk adds "HR VIS-5a" + ◂ (marked ORACLE-EDIT (HR VIS-5a · controller)).

### Verification (lane DB ep-ancient-truth only)
- Prerequisite: `seed-hr-walk` refused at first because no seed-hr-qc tenant matched `hr-expected.json`. I re-ran `seed-hr-qc.mts`, which passed 34/34 and left other tenants unchanged (O1).
- Seed up passed with exit 0. Period DRAFT = 2026-06.
  - `ot.namfon.request`: 60000 satang (฿600 = 6 h at the ฿16,000 rate).
  - `ot.namfon.approve`: ok.
  - `run.DRAFT.otNamfon`: "OT 60000 สต. · APPROVED/ผูกรอบร่าง · แถว add 60000 · บรรทัด OT 1=60000".
  - `ytdWarning` is still ok.
- `--down`: residue [] (0), and the manifest was removed. **Final state: the lane DB has the walk seed down. The seed-hr-qc base tenant stays.**

## Results (lane DB, QC_FORCE, through iso.sh + qc-hr.sh + with-gate-lock)
| run | result |
|---|---|
| qc-hr-priv-3 | 26/28 · P7 ✅ · S4/S6 ❌ (expected) · Z1 no residue |
| qc-hr-vis-5a | 39/39 |
| qc-hr-priv-2 | 47/47 |
| qc-hr-h4.3 | 45/45 |
| qc-hr-h3.6 | 62/62 |
| qc-hr-h3.9 | 60/60 |
| fitness / fitness-hr | 54/54 · 9/9 |
| typecheck (ISO_MEM=14000M, heap 12288) | exit 0, 0 errors |

There is no h5.1 walk-tooling oracle: no `qc-*` file covers `seed-hr-walk.mts` apart from vis-5a S2 (above).
