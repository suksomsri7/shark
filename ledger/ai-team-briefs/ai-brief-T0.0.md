# T0.0 — Code survey + baseline regression (controller / survey agent)
Read `ai-brief-COMMON.md` first. Contract: AI-TEAM-RUN §2 T0.0. No oracle; this WO produces the facts every other brief relies on.

## Status (8 Oct 2026)
- `ledger/REVIEW-AI-TEAM-DESIGN-2026-10-08.md` **exists** (527 lines, base `main` 7411dfde = origin/main f132ce21 + 1 ledger commit). Rulings on its §8 are in `ai-brief-RESOLUTIONS.md` R-E.
- Still to do when the run starts: the **baseline regression file** and a **freshness check** of the review.

## Deliverables (controller, in `/root/projects/shark-ai` on `session/ai-team`)
1. Freshness: `git log --oneline 7411dfde..origin/main -- src/lib/ai src/lib/core/permissions.ts src/lib/core/scope.ts src/lib/outbox-consumers.ts apps/mobile prisma/schema src/app/api/mobile src/lib/mobile`. If non-empty, spawn the survey agent again **only for the changed paths** (prompt in AI-TEAM-RUN §4 first line) and append a dated "delta" section to the review; do not rewrite the review.
2. Baseline file `ledger/wo-notes/ai-baseline-<session/ai-team hash>.txt`: run every suite of COMMON §E + REVIEW §10 list through the QC4 wrapper, one at a time under the gate lock, and paste each `JSON_SUMMARY` + exit code. Red suites at baseline are listed by name with the reason (pre-existing debt), never fixed in this WO.
3. QC4 sanity: `seed` tenants of CRM/POS/HR counted (`Tenant`, `AiConversation`, `AiProposal` rows per tenant) and recorded, so later WOs can prove they left them untouched.
4. Append the hash, the suite list and the red list to `AI-TEAM-RESUME.md` and MASTER-PLAN §12 (T0.0 ✅).

## Commands (reference)
```
bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-ai-proposals.mts
```
(older suites use `loadLegacyQcEnv`; QC_FORCE is harmless for them.)

## Acceptance
- Review freshness verified against today's main (or delta appended).
- Baseline file complete; every suite has a summary line; no QC4 residue.
- No product code touched.
