# H3.3 oracle — check list, counts, vector sources (oracle writer, 11 Nov 2026)

Oracle `scripts/qc-hr-h3.3.mts` (49 KB) · fixture `scripts/fixtures/hr-h3.3-vectors.json` (56 KB) · brief `ledger/hr-briefs/hr-brief-H3.3.md` (DRAFT) · base `session/hr` 1d17382f8 · branch `wip/hr-h3.3`.
Run: `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h3.3.mts` (`--list` prints the registry).

## Checks (46 = 31 RED-by-design · 5 GREEN controls · 10 NEEDS-ACCOUNTANT)
| group | ids | base | what |
|---|---|---|---|
| statics | S1.1 (GREEN) · S1.2–S1.5 (RED) · S1.6 (GREEN) | | frozen sha + payroll.ts untouched · v2 purity · law.ts sole reader · platform-only writes · read-only page · seed digest = fixture law json |
| SSO | S2.1–S2.3 | RED | 17 literals · parity ≥ 2,700 wages · LAW_SHAPE/BAD_SATANG |
| tax | S3.1–S3.3 | RED | 18 literals · parity grid (seed's) · LAW_SHAPE |
| WHT annualised | S4.1–S4.2 | RED | 24 literals · parity 960 |
| WHT YTD | S5.1–S5.5 | RED | 8 single-call literals · 6 year scenarios (66 months) · Σ = December annual tax · month-1 parity 160 · refusals/never negative |
| effective dating | S6.1–S6.4 | RED | 13 pick cases · 120 permutations + Date form · pickLawSet refusal/ids · Bangkok pay day 4 |
| items | S7.1–S7.6 | RED | classify 5 + refusals 4 · computeItemV2 6 · identities on 72 items + totals · ytdPrior 4 · runtime purity |
| DB | S8.1 (GREEN) · S8.2–S8.5 (RED) | | v1 rows + digest · loadLawSet on rolled-back 2190 fixtures · tenantDb write guard (7 ops) · platform lifecycle (forged/SUPPORT/no approver/slot/float/retire/audit) · law view DTO |
| accountant | NA.1–NA.10 | GREEN (skip) | pass as "⏭ SKIP · NEEDS ACCOUNTANT: <q>" while want = null; a supplied value turns RED until an ORACLE-EDIT makes it a vector |
| X/Z | X12.1 · Z1 | GREEN | fitness both files without env · residue (HrLawTable/PlatformUser/PlatformAuditLog `qc-h33-*`) |

## Vector sources
| fixture key | n | cites | expected value source |
|---|---|---|---|
| sso | 17 | v1:SSO@1970-01-01 | reference + equal to frozen v1 |
| tax | 18 | v1:TAX_BRACKET@1970-01-01 | reference + v1 |
| whtAnnualised | 24 | TAX_BRACKET + DEDUCTION | reference + v1 |
| whtYtd | 8 | TAX_BRACKET + DEDUCTION | reference (Q4 formula); YTD-01 also = v1 |
| years | 6 (66 months) | SSO + TAX + DEDUCTION | reference (Q4/Q5) |
| classify / classifyRefused | 5 / 4 | brief Q5 | reference; add/deduct/gross also = v1 sumAdjustments/payableGross |
| items | 6 | SSO + TAX + DEDUCTION | reference |
| ytdPrior | 4 | brief Q6 | reference |
| pick (+tie) | 13 | synthetic ids/dates, json = v1 row | selection only |
| payDay | 4 | brief Q1 | Bangkok UTC+7 |
| needsAccountant | 10 | — | want null (skipped) |
Literal vectors 169: 59 v1-domain (+6 partly: YTD-01, CLS-01..05) cross-checked against frozen `payroll-rules.ts` = 65 equal, 0 off; 110 v2-only. Generated parity inputs ≈ 4,400 (vs frozen v1 at run time). Reference = exact-fraction Python outside the repo (not committed; not the code under test).

## Proof the oracle can go green
A throw-away reference implementation (scratchpad, not committed, product tree untouched) run through a copy of the oracle on lane DB l1: every behavioural check S2–S8 passed except S8.3 (needs the db.ts guard) and S1.2–S1.5 (files not in the tree); Z1 residue 0. So the vectors are mutually consistent and achievable.

## Red run (base) — `hr-H3.3-red.txt`
Unforced: SKIPPED exit 0. Forced: 15/46, BASE-EXPECTATION 46/46; RED for "module absent" except S8.3 = tenantDb wrote all 7 operations (H1.3 F1 reproduced, rows swept). Law rows on l1: 4 × DRAFT, 0 ACTIVE. Residue 0.

## Done / next
Done: brief, oracle, fixture, red run, typecheck. Next: controller rules Q1–Q15 (esp. Q3 activation, Q4 formula, Q10 db.ts hunk) → builder.
