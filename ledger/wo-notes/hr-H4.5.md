# WO H4.5 — LINE notices for employees (link · notices · menu) + in-app fallback

> RUN "HR V2" · worktree `/root/projects/shark-hr` · branch `wip/hr-h4.5` cut from `session/hr` 1725eb106 (oracle 0b938bb8a, rulings bfd151421) · 14 Nov 2026 · builder: Claude Opus 5.5
> Brief `ledger/hr-briefs/hr-brief-H4.5.md` (+ CONTROLLER RULINGS 1+2) · oracle `scripts/qc-hr-h4.5.mts` + `-lib` (69 checks, unchanged) · green `hr-H4.5-green.txt`
> DB = lane DB through `scripts/qc-hr.sh` only.

## 0. Checkpoint
- done: all code · migration applied to lane DB · oracle 69/69 (forced ×3 + unforced ×1, residue 0) · regression below · typecheck clean (533 s)
- next: controller full regression · reviewer + hunter (privacy)

## 0b. Runs (lane DB via qc-hr.sh, final code)
seed-hr-qc 34/34 · qc-hr-h4.5 69/69 ×4 · qc-hr-h2.11 70/70 · qc-hr-h2.10 57/57 (after ORACLE-EDIT) · qc-hr-h2.3 79/79 · qc-hr-h2.7 94/94 · qc-hr-h2.9 58/58 ·
qc-hr-h3.8 78/78 · qc-hr-set-1 25/25 · qc-hr-h1.1 81/81 · qc-hr-h0.1 67/67 · qc-hf-hr-privacy 194/194 · qc-audit-trail 21/21 ·
fitness 53/53 + fitness-hr 9/9 (with env and `env -u DATABASE_URL -u DIRECT_URL`) · 26 qc-chat-* suites all green (incl. security 38/38 · security-scope 20/20) · qc-svc-b.2 93/93.
Refused on the lane DB (host check `qc-svc` ep-mute-scene, exit 4 — not run): qc-svc-b.0 b.1 b.3–b.11 b.13–b.17 · qc-svc-r0.7 · qc-svc-d.9 → controller.
Picker: `# FULL (mode=lean · 20 changed files)`.

## 0c. ORACLE-EDITs (HR suites only)
- qc-hr-h2.10 S1.5: allowed imports of /app/me/hr pages + `hr/line-(link|actions|ui)` + `@/lib/platform/hr-line-actions` (before: self/self-actions/self-ui/filings only) — the self LINE card lives on /app/me/hr/profile (R11).
- qc-hr-h2.10 S8.2: rows filter `testid startsWith "hr-self-"` → `… && wo !== "H4.5"` (hr-self-line-* testids are pinned by the H4.5 oracle).
- No AppNotification-count edits were needed (Q8). qc-hf-hr-privacy S-2 not edited: the employee chip is rendered server-side in the page instead.

## 1. Files
| file | new/edited | what |
|---|---|---|
| `prisma/migrations/20270111000000_hr_line_link/migration.sql` | new | 2 tables, CHECKs, 3 partial unique, dedupe unique, due index, FK HrEmployee RESTRICT |
| `prisma/schema/hr.prisma` | hunk `HR H4.5` | models HrLineLink / HrNotice (no Prisma relation — FK only in SQL, see D2) |
| `src/lib/core/scope.ts` · `scripts/hr-qc-env.mts` | hunk | `sys()` ×2 · tables + delete order |
| `src/lib/modules/hr/line-rules.ts` | new | pure: texts th/en (= oracle MSG) · noticeMessage · hrefOf · dedupeKeyOf · nextAttemptAt · lineNotifyPolicyOf · monthKeyBkk |
| `src/lib/modules/hr/line-link.ts` | new | myLineStatus · beginLineLink · completeLineLink · unlinkMyLine · adminUnlinkLine · employeeLineStatus · endLineLinks · cancelExpiredLineLinks · activeLinkOfContact |
| `src/lib/modules/hr/line-notify.ts` | new | planHrNotices · claimLineNotices (+precheck) · finishLineNotice · reserveLineCap · buildLineDigests · skipPendingNotices · saveLineNotifyPolicy · audits once/day·month |
| `src/lib/modules/hr/line-actions.ts` · `line-ui.tsx` | new | server actions (requireTenant + requireMembership) · client cards |
| `src/lib/platform/hr-line.ts` · `hr-line-actions.ts` | new | glue: issueHrLineCode · onHrLinked · onHrPostback · sendHrLineNotices · runHrLineJobs · onHrEventForLine |
| `src/lib/modules/chat/link-code.ts` | 1 marked line | `LINK_PURPOSES` += `"HR_EMPLOYEE"` |
| `src/lib/platform/postback-routes.ts` | marked hunks | domain/prefix `hr` · DATA_RE · LINK_PURPOSE_PREFIX · route `hr.` |
| `src/lib/outbox-consumers.ts` | marked hunks | 7 events wrapped `compose(current, onHrEventForLine)` · no new types/labels |
| `src/lib/platform/minute-jobs.ts` | marked hunk | job `hr.line` every 5 min |
| `src/lib/modules/hr/index.ts` | marked hunk | re-exports for the glue |
| 3 pages (profile · HR settings · employee profile) | marked hunks | self card · settings card · chip |
| `src/messages/{th,en}/common.json` · `scripts/hr-ui-inventory.json` · `scripts/visual-hr.mts` | added | `hr.line.*` · 17 rows H4.5 · SPECS "4.5" |

## 2. Decisions (for the controller)
- D1 Identity: self functions call H2.10 `resolveSelf`; it is loaded lazily inside line-link (`await import("./self")`) because `self.ts` re-exports the payslip UI (→ core/context → env at load) and the HR facade must load without env (fitness F10.1 without env went red with a static import). Not an import-rule dodge (hr→hr); flagged for review.
- D2 HrLineLink has no Prisma relation field (oracle S1.2 pins the field list to the R1 columns); FK `ON DELETE RESTRICT` lives in the migration only. A `prisma migrate diff --exit-code` would report it as drift.
- D3 `myLineStatus.displayName` = raw read of `ChatContact.displayName` (own link only, same tenant) — HR imports no chat code; admins never get it.
- D4 Admin gate and settings gate read the Membership row from the DB (`acceptedAt` not null) — viewer only supplies `userId`. Admin = OWNER or `hr.employee.create` (MANAGER passes `evaluate`, as H1.1) + branch scope; settings save also needs all-branch scope (like saveOtPolicy).
- D5 Lease: claim sets `SENDING` + `nextAttemptAt = now+2 min`; stale SENDING = `nextAttemptAt <= now`. Claim = `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)`.
- D6 Cap: reservation under advisory `hr:linecap:<sys>` counts SENT/SENDING rows with `sentAt` in the Bangkok month (digest members excluded); the reserved row gets `sentAt = now`, reset on non-SENT finish.
- D7 Digest: DIGEST-mode plan ⇒ `HELD` with `nextAttemptAt NULL`; at `digestAt` the job inserts `hr:DIGEST:<day>:<emp>` and tags members `digestOf`; members follow the digest's final state. HELD-null rows of a shop switched back to IMMEDIATE are sent individually by the job.
- D8 Retry = 1 + 3 (ruling 2) · 429 ⇒ QUOTA final + `hr.line.quota {connectionId}` once/day/OA · cap ⇒ `hr.line.cap_reached {monthKey}` once/month/system (dedupe by targetId `<id>:<period>` under advisory lock).
- D9 In-app text = the Thai LINE sentence (title) + fixed body; OT adds no in-app (H2.9 note stays). Leave decided by the employee's own user ⇒ no notice.
- D10 Offboard: consumer ends ACTIVE (OFFBOARD) and cancels PENDING links, then SKIPs PENDING/HELD/FAILED notices. Precheck end reasons: inactive ⇒ OFFBOARD · linkedUserId/membership changed ⇒ ACCOUNT · blocked contact ⇒ BLOCKED.

## 3. §F self-check
1 ☑ no new page/route (cards on existing pages) · 2 ☑ every tx body uses the tx client (grep: no `tenantDb(`/`prisma.` inside $transaction bodies of line-*.ts) · 3 ☑ `[]` unit list = all branches (hrScopeOf) · explicit list refused with one fixed Thai text, no ids (S8.1/S8.2) · 4 ☑ Thai refusals, identical bytes for forbidden/unknown/other-tenant · 5 ☑ tx timeouts 20–30 s (consumers/actions/job have no shorter maxDuration) · 6 ☑ runbook in the migration header: migrate first, pre-check SQL in the comment · 7 ☑ link completion guarded in one tx under hrline:<sys>:<emp>, no second connection inside · 8 ☑ issue rate count-first via checkRateLimitDb, refund on write failure, key `hr-line-issue:<tenant>:<employee>` server-derived · 9 ☑ no new outbox event; 7 consumers wrapped with compose · 10 ☑ files ⊆ brief list + oracle edit + notes (hot files: one marked hunk each where possible; consumers = 8 small marked hunks).

## 4. Owner list
- O1 real pilot OA + webhook URL for UAT (feature OFF; settings card shows "ยังไม่ได้ทดสอบกับ LINE OA จริง")
- O2 may HR spend OA push quota; cap value (default 200/month, OFF per shop)
- O3 PDPA wording for employees (fixed sentence on the self card; lawyer later)
- H4.5b AI/KB leave intake from LINE (free text, health data) — follow-up ticket

## 5. Debts
D1 H4.5b · D2 approver LINE · D3 follow/unfollow → link state · D4 employee rich menu · D5 tenant switch in links · D6 cert/correction/advance notices · D7 e-mail · D8 lazy `./self` import until self.ts stops re-exporting UI · D9 Prisma relation for HrLineLink FK (oracle field list) · D10 menu/notLinked reply language follows contact lang (th/en).
