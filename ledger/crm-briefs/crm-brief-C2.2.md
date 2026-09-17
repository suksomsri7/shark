# C2.2 — Sequences
Read `crm-brief-COMMON.md` first. Contract: CRM-RUN §2 "C2.2". Spec: blueprint §5.7, §11.5, mockup 07 (bottom), decisions C16, C25.

## Deliverables
`sequences.ts`: CRUD (+ versioning: editing steps of a sequence with ACTIVE enrollments creates `version+1`; old enrollments finish on their version) · `enroll` (one ACTIVE per contact per sequence; CONFLICT with "replace" option; skips opted-out contacts) · `stop/pause/resume` · **`runDue(now)`** registered as a minute job (C0.5, every 5 min, ≤ 200 rows, loop until quiet ≤ 20 s): claim by LEASE (`leaseUntil = now+15m` conditional updateMany), execute the step through the shared action runner (EMAIL / LINE / TASK / WAIT / SMS if a provider exists), compute `nextAt` with business days (`settings.crm.businessDays`, `settings.crm.holidays`) and `sendWindow`, advance or finish; recover expired leases · auto-stop on 5 causes (reply, won, lost, opt-out, bounce) via consumers · per-step stats · holiday settings UI incl. "import Thai public holidays for year N" (static list in code) · editor UI `/settings/sequences/[id]`, enrollment list, enroll button on contact + bulk enroll.
Events `crm.sequence.enrolled/finished`.

## Acceptance (oracle `qc-crm-c2.2`)
CRM-RUN S1–S7 (28).
X3 two parallel enrolls of the same contact → one ACTIVE · X5 two overlapping `runDue` → each due step executed once (count fake sends); kill after claim → re-run after lease; never claims by writing a terminal state · X8 consent/opt-out/bounce checked WHEN THE STEP RUNS (withdraw between enroll and step → skipped + reason; never sent) · X9 bulk enroll = danger (confirm + reason, ≤ 500) · X1 enroll a contact the actor cannot see → 404.
Regressions: C2.1, C0.5, `qc-member-fix-s3`.
