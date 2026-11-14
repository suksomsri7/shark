# H4.9 — phase H4 close (controller checklist)

> DRAFT r0 · 14 Nov 2026 · brief drafter. MASTER §4: "Phase close: cross-module oracle (POS PIN ↔ HR, booking, CRM, account), parity all screens · `qc:all`". RUN-PLAN N1: SYNC with main at every phase close. Model = H2.12 (`wo-notes/hr-H2.12.md`, `hr-H2-close-qcall.txt`, `HANDOVER-2026-11-13-HR-H2.md`).
> **Preconditions:** H4.3, H4.5, H4.8 merged (H4.7 is cut by default) · H3.10 docs (`wip/hr-h3.10` 290414bc2) merged · HF-SSO-2569 merged or explicitly parked · `HR-DEBTS.md` ruled.

## 1. SYNC with origin/main
- Measure: `git fetch origin && git rev-list --count session/hr..origin/main` + `git log --oneline session/hr..origin/main -- src prisma package.json`. Dry merge: `git merge-tree --write-tree session/hr origin/main` lists conflicts without touching a tree. Also list main's new migration folders that sort **before** HR's applied ones (`ls prisma/migrations` diff).
- Precedent: SYNC 1 (11 Nov, `wip/hr-sync-main`, lane 2): conflicts in `hr/payroll.ts` and `hr/service.ts` were resolved **by the controller** (HR path ⊇ main's rule). Reds were triaged in `wo-notes/hr-SYNC.md`: (A) static "unchanged vs base" checks → ORACLE-EDIT with in-base guards · (A') POS static pins → classified, not edited · (B) behaviour → one marked product hunk `// HR SYNC ▸ … ◂`. Then ctl FULL + typecheck → reviewer of the conflicted files only → FF. SYNC 2 (12 Nov, `wip/hr-sync-h2`, 334 commits): no conflicts; main's `20261227000000_svc_h` applied out of order on QC DBs (fine; prod unaffected).
- After landing: every lane merges session/hr and runs `migrate deploy` on its own DB. QC4 `migrate deploy` by the controller.

## 2. Cross-module checks (suite = proof)
| seam | suites |
|---|---|
| POS: `hr.verifyPin`, `onShiftToday`, commission intake, offboard → PIN revoked, labour % reader | `qc-pos-p1.15` `qc-pos-p1.9` `qc-pos-p1.17` `qc-pos-p1.18` `qc-pos-p3.5` `qc-pos-p3.6` · `qc-hr-h0.5` `qc-hr-h2.1` `qc-hr-h2.4` `qc-hr-h4.2` `qc-hr-h4.4`. **POS suites run on QC4 only** (they refuse lane DBs, RESUME 14 Nov). Known stale static pins red before H4: p2.11 ST1/ST4 · p2.12 ST1 · p3.5 ST1/ST2 · p3.6 ST2/ST3. Any **new** red is triaged |
| Booking (leave → slots) | `qc-hr-h4.1` `qc-hr-leave-booking` `qc-booking-hours-hr` · SVC side (X-HR.1b, `qc-svc-b.1` H-2) on an SVC DB |
| CRM (commission, reversal, readers) | `qc-crm-c3.3` `qc-crm-c0.3` `qc-hr-h0.6` |
| Chat/LINE glue | `qc-hr-h4.5` `qc-hr-h2.10` · `qc-svc-b.0…b.17` (import LINE/chat code; **could not run on the lane DB at H4.5** → SVC DB) |
| AI tools registry | `qc-hr-h4.3` `qc-ai-tools` `qc-ai-tools2` `qc-ai-proposals` `qc-ai-plan` `qc-ai-skills` `qc-ai-actions` |
| REST API + skill | `qc-hr-h4.8` · `pnpm exec tsx scripts/gen-hr-api-docs.mts --check` · skill `shark-hr-api` installed by the controller (`sync-skills.sh`) · recipe replay inside h4.8 A16 |
| Accounting journals | `qc-hr-h3.7` `qc-account-cpa` `qc-audit-trail` `qc-hr-h1.1` + payroll regression set (`qc-payroll` `qc-payroll-reverse` `qc-hr-payadjust` `qc-crm-c3.3` `qc-hf-hr-privacy` `qc-account-cpa`) |
| Secretary digest (Daily Brief HR line) | `qc-hr-h4.3` (R10) · `qc-sec-s3a1-s2` `qc-sec-s1.11` (import `ai/secretary/digest`) → **sec family DB** |
| Settings writers | `qc-hr-set-1` (rule: any ticket writing HR settings) |
| Repo-wide statics | `qc-hr-h1.3` `qc-hr-h2.4` (lesson 14 Nov) + fitness ×2 (`pnpm fitness`, `fitness-hr` with/without env) |
Plus all `qc-hr-*.mts` (pm-full on QC4) + clean typecheck (`.next/types` + `tsconfig.tsbuildinfo` deleted).

## 3. qc:all remainder + svc/sec families
- Remainder = the **190 NOT RUN** suites of `hr-H2-close-qcall.txt` (POS 60 + member 38 + rest), re-planned at H3.10 and not yet run. Use the resume command recorded there: `scripts/iso.sh` → `qc-hr.sh` → `with-gate-lock.sh` → `qc-all.mts <list>`, systemd unit, lane DB, `QC_H06_BASE=d350c26c…`, `QC_FORCE=1`. Re-seed first. Pace ≈100 suites/h → 2.5–4 h [estimate from that note]. Better: re-run **all 465** on the new head (the head moved a lot since 13 Nov). Q1.
- Classes kept from H2.12: acc-v2 + account-api-read-* blocked by the date-rotted `seed-acc-v2-qc.mts` (R1, accounting owner) · CRM c5.3/c51fix/perf need `qc2.sh` (CRM QC2) · hf-fu/fu2/o23/tx need `qc4.sh` · audit-trail A-5.0 ORACLE-EDIT is done (13 Nov).
- **svc family (60):** `bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-<wo>.mts`. Needs `.env.qc-svc`, which is **absent in HR trees** (present in `shark-svc*` trees; allowlist `scripts/svc-qc-hosts.mts`, own lock `/tmp/shark-gate-svc.lock`).
- **sec family (38):** `… qc-sec.sh … env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-<wo>.mts`. Needs `.env.qc-sec`, **absent in HR trees** (present in `shark-sec*` trees).
- Which SVC/SEC DB HR may use, and who deploys HR migrations onto it: **unknown — controller to determine** (it is another RUN's DB; never copy env files without that RUN's OK).
- Reds: triage table like H2.12 (a known / b red on main too / e environment / c caused by HR → STOP, ruling).

## 4. Drift
`pnpm drift` (in `hr-ctl/pm-full.sh` since 14 Nov) on QC4 at the H4.9 head. The only accepted diff is the `DormUtilityRate` unique index (main SVC, not HR). Any HR table diff = STOP. Also check that each HR migration folder ≥ `20261201000000` is in `_prisma_migrations` on QC4.

## 5. Parity of all H4 screens
Handed to **H5.1** (one build, one walk). H4.9 only records which H4 screens were never shot: 4.2 labour card/roster/settings (spec exists, not shot), 4.3 AI/brief, 4.5 LINE, 4.8 API keys card, plus H3.4/3.5/3.6/3.7/3.8/3.9/3.4-YTD. These go into H5.1's matrix.

## 6. HANDOVER-H4 (`ledger/HANDOVER-2026-11-xx-HR-H4.md`)
Shape of HANDOVER-H2: what shipped per WO (H4.1–H4.6, H4.8; H4.7 cut) · seams added (events, facades, AI tools, REST ops, settings keys, migrations with timestamps) · what is OFF by default (LINE, bank formats, v2 engine until law rows ACTIVE) · owner list additions (O1 H4.3, O1 H4.8, H4.5 O1–O3) · accountant list additions · debts with owner ticket (H5.1/H5.2/H5.3/after-RUN) · qc:all result table + triage · SYNC sha · drift result · counts (x/44, %).

## 7. Exit criteria
1. session/hr contains origin/main at a recorded sha; conflicts list + rulings in `wo-notes/hr-H4.9.md`.
2. Every suite in §2 green, or red with class a/b/e plus evidence. 0 class c.
3. qc:all: every planned suite has a result (pass / classified fail / NOT RUN with reason). svc/sec either run or ruled.
4. Drift: no HR diff.
5. Postmerge FULL on QC4 + clean typecheck 0 errors.
6. HANDOVER-H4 merged; RESUME + MEMORY checkpoint; tg `📊 HR V2 · N% (x/44)`.
7. H5.1 brief has the H4 screens in its matrix.

## QUESTIONS FOR THE CONTROLLER
- Q1 Re-run all 465 instead of the stale 190? **Default all 465 on the new head**: the 13 Nov results are 30+ merges old.
- Q2 svc/sec families: borrow an SVC/SEC lane DB, or rule "not run by HR"? **Default ask those RUNs for one lane DB each, read-only use except the HR migrations**: they import HR-touched code (LINE, digest).
- Q3 SYNC by a builder or by the controller? **Default controller, as before**: conflicts are few and need rulings.
- Q4 Is H3.10 a precondition of H4.9? **Default yes**: HANDOVER-H4 needs the ruled `HR-DEBTS.md`.
- Q5 Park HF-SSO-2569 if not merged? **Default merge into session/hr before the close if its review is done (prod stays gated by owner/accountant)**: live v1 caps SSO at 15,000.
