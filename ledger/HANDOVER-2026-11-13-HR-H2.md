# HANDOVER — HR V2 RUN · phase H2 (Time, attendance, leave, OT, self-service) · 13 Nov 2026

> Ticket H2.12 (phase close), remaining parts: whole-system `qc:all` + this handover. Count: **29/44 (66 %)** on
> `session/hr` (H2.1–H2.12 all merged; H3.1–H3.3, H3.5, H4.1, H4.4, H4.6 also merged in the same window).
> Written on `wip/hr-h2-close` from 1b0898377 (= session/hr, last sync with origin/main = **4d6ef6ee7**, verified
> `git merge-base --is-ancestor origin/main HEAD`). Controller log: `ledger/HR-RESUME.md` · metrics: `ledger/HR-METRICS.md` ·
> plan: `ledger/HR-V2-MASTER-PLAN.md` rows 68–79 · run plan: `ledger/HR-RUN-PLAN-2026-11.md`.
> Every line below cites its source. `[unverified]` = could not be confirmed from a ledger line or a file.

## 0. Status at phase close

| item | value | source |
|---|---|---|
| session/hr head | 1b0898377 (H2.12 merge = ff007b847 · ORACLE-EDIT qc-hr-h2.7 H212.5 = b2c4a8ea8) | `git log`; RESUME:535 |
| QC4 (controller gate) | every migration up to `20270107000000_hr_bank_files` | RESUME:535 |
| lane 2 DB `wo-hr-qc-l2` (ep-orange-dust-aotwbyc7) | `migrate deploy`: 219 migrations, none pending (13 Nov 04:5xZ) · seed-hr-qc 34/34 | `wo-notes/hr-H2-close-qcall.txt` |
| last postmerge (QC4) | 31 lines green + clean typecheck 0 errors | RESUME:535 |
| whole-system qc:all | **PARTIAL** (276/465 reached · 208 pass · 1 HR-caused static red, from H0) — §9 | `wo-notes/hr-H2-close-qcall.txt` |
| ETA given to owner | code complete 15–16 Nov | RESUME:538 |
| **not done in H2.12** | plan row H2.12 also lists "docs `docs/modules/18-hr.md` V2 section" — `git diff fb245484 HEAD -- docs/modules/18-hr.md` is empty | master plan :79 |

## 1. What phase H2 delivered (ticket by ticket)

| WO | title (master plan) | delivered | merge | source |
|---|---|---|---|---|
| H2.1 | Shift catalogue + daily roster engine | `hr/roster.ts`: template → roster entries, copy week, warn-only rules (600/660/1/2880 min in `roster-rules.ts`), publish → `hr.roster.published`; 90 checks | 562d06deb | RESUME:446 |
| H2.2 | Roster board UI | week grid (drag/drop, keyboard, tap), unpublished-changes bar, rule panel; grid parity with mockup 03 after visual round r3 | FF 11 Nov | RESUME:458 |
| H2.3 | Shift swap / change request | `hr/swap.ts`: peer accepts → manager approves through approval core; roster rewritten atomically; 79 checks | FF 11 Nov | RESUME:452 |
| H2.4 | Clock v2 | roster-aware next kind, mobile GPS per branch (`HrClockSite`), kiosk NAME + PIN with per-name lock and shop bucket 60/60 s, breaks; closed D-F4 | 0705a33e8 | RESUME:461 |
| H2.5 | Automatic judgement + boards + late alert | `hr/judge.ts` + `judge-rules.ts`, attendance UI/job, 16 h open-session cap, payroll period lock on both sides, paging 200/page | 4ca609352 | RESUME:481 |
| H2.6 | Time corrections | `hr/correction.ts` + `correction-rules.ts`; originals voided, never deleted (11 readers filter voided rows); POS evidence seam `src/lib/hr-pos-evidence.ts` | 1054c7468 | RESUME:488 |
| H2.7 + H2.8 | Leave policies + quota ledger · Holidays | `hr/leave.ts`, `leave-rules.ts`, `holidays.ts`; carry derived from leaves, policy row locks, approval refuses leaves outside employment window; 15 fixed-date holiday preset; no migration | 88d7997dc | RESUME:460, 468 |
| VIS-1 (fix WO, not one of the 44) | visual batch 1 | 141 shots, 10 MAJOR fixed (attendance 1024/390, kiosk gate, manager-by-role panels, leave page, impact line, seed has today's roster) | 87d976773 | RESUME:484 |
| H2.9 | OT requests → settlement | `hr/ot.ts` + `ot-rules.ts`: paid minutes = request ∩ time worked after shift end, pays max(own rate, legal floor), OT rows untouchable from generic payroll paths | b235e0b9f | RESUME:492 |
| H2.10 | "ของฉัน" self-service | `/app/me/hr` (today/week/requests/pay/profile), facade `hr/self.ts`; self advance atomic under `hr:advance:<tenant>:<emp>` | 295ce8add | RESUME:507 |
| H2.11 | Manager overview + unified inbox | `hr/inbox.ts`: batch approve, branch-scoped, "คำขอ" tab; seed 34 checks | c1dd9acab | RESUME:517 |
| H2.12 | Phase close | SYNC with main 6b991f34d (92da3ee78) + later 4d6ef6ee7; sweep of qc-hr-h*.mts base-diff checks (4 guarded, 36 already ok); VIS-2 fixes re-shot MATCH; statutory leave presets + below-minimum warnings (`hr/leave-presets*.ts`, no migration); this qc:all + handover | ff007b847 | RESUME:520, 523, 529, 535–536; `wo-notes/hr-H2.12.md` |

SYNC with main (11 Nov, d75e617c1, main a242405dd) also brought two product fixes: `rehomeStrandedSystemAdjustments` uses `liveRunWhere`; approval core returns `reason` beside `message` on SELF_APPROVAL (RESUME:448, `wo-notes/hr-SYNC.md` §B1).

## 2. Data model + migrations added in H2 (in order)

| migration | WO | content (from ledger) |
|---|---|---|
| `20261228000000_hr_clock_v2` | H2.4 | clock v2 (`HrClockSite`, `timesOverridden` = D-F4) |
| `20261228000001_hr_clock_break_kinds` | H2.4 | break kinds |
| `20261228000002_hr_clock_purge_idx` | H2.4 | purge indexes |
| `20261230000000_hr_judgement` | H2.5 | judgement tables |
| `20261230000001_hr_judgement_leave` | H2.5 | leave link on judgement |
| `20261230000002_hr_judgement_alert_idx` | H2.5 | alert index |
| `20270101000000_hr_time_correction` | H2.6 | corrections + voided originals |
| `20270101000001_hr_time_correction_idx` | H2.6 | index |
| `20270102000000_hr_ot_settlement` | H2.9 | OT settlement |

Sources: `git diff --name-only --diff-filter=A fb245484 HEAD -- prisma/migrations`; RESUME:461, 481, 488, 492. H2.1/H2.2/H2.3/H2.7/H2.8/H2.10/H2.11/H2.12 added no migration (RESUME:446–536; H2.7 "no migration" :468; H2.10 :507). Timestamp `20261229000000_hr_leave_policies` was reserved for H2.7 (RESUME:456) but never created.
Migrations of other phases that landed in the same window: `20261231000000_hr_lifecycle` (H4.4) · `20270103000000_hr_work_days` (H3.1) · `20270104000000_hr_stock_charge` (H4.6) · `20270105000000_hr_attendance_pay` (H3.2) · `20270107000000_hr_bank_files` (H3.5). Main migration `20261227000000_svc_h` sorts before the HR ones and is applied out of order on QC DBs (prod unaffected) (RESUME:520).

## 3. Settings keys (all in `AppSystem.settings.<block>` JSON — no columns except the clock-site row)

| key | range / default | WO | defined in |
|---|---|---|---|
| `hrClock.earlyInMin` | 0–240 · 120 | H2.4 (Q1 overruled → per-system, RESUME:460) | `src/lib/modules/hr/clock-rules.ts`; writer `clock-settings.ts` |
| `hrClock.closeGraceMin` | 30–720 · 240 | H2.4 | same |
| `HrClockSite` row: `mobileEnabled` · `gpsRequired` · `radiusM` · `minAccuracyM` · `photoRequired` · `noticeAccepted*` | false · true · 150 · 100 · false | H2.4 | `prisma/schema/hr.prisma` |
| `hrAttendance.notInAlertMin` | 0–240 · 10 | H2.5 | `hr/judge-rules.ts`; writer `clock-settings.ts` |
| `hrAttendance.absentAfterMin` | null or 30–720 · null | H2.5 | same |
| `hrAttendance.earlyOutGraceMin` | 0–60 · 0 | H2.5 | same |
| `hrAttendance.otStepMin` | {1,5,10,15,30} · 15 | H2.5 | same |
| `hrAttendance.flagEarlyOut` / `alertsOn` / `alertEmployee` | true / true / false | H2.5 | same |
| `hrOt.afterHours` | 0–72 · 24 | H2.9 | `hr/ot-rules.ts` |
| `hrOt.maxAheadDays` | 1–90 · 31 | H2.9 | same |
| `hrOt.otRoundMin` | {1,15,30} · 1, frozen in `basisJson` | H2.9 (ruling RESUME:483) | same |

Constants (not settings): `OPEN_SESSION_CAP_MIN` 960 · `CORRECTION_SESSION_CAP_MIN` 960 · `INBOX_BATCH_MAX`/`INBOX_PAGE_MAX` 50 · `OT_MIN_MINUTES` 15 / `OT_MAX_MINUTES` 960 · OT law defaults 1.5×/1×/2×/3×, ÷30÷8 (`ot-rules.ts`). Leave policies are `HrLeavePolicy` rows (H1.2 schema); H2.12 presets are an action (`leave-presets-service.ts addLeavePreset`), not a setting. Not H2: `normalMinutesPerDay` (H3.1), `hrAttendancePay*` (H3.2), `hrLifecycle` (H4.4). File line numbers: see the files; ranges read from source by the handover research pass, not re-run.

## 4. Permission keys

**No permission key was added in H2**: `git log fb245484..HEAD -- src/lib/core/permissions.ts` shows only SVC commits; the `hr.*` block dates from 8264d5748 (31 Aug). Existing keys the H2 modules use:

| key | used by |
|---|---|
| `hr.employee.create` (acts as the HR admin key) | roster, swap, clock settings, attendance actions, correction, leave presets, OT actions, inbox |
| `hr.attendance.clock` | kiosk page + action gate (VIS-1, qc-hr-h2.4 S14.x) |
| `hr.leave.read` / `hr.leave.decide` | leave.ts, inbox.ts |
| `hr.payadjust.request` / `hr.payadjust.approve` | ot.ts, ot actions, inbox.ts, leave.ts |
| `hr.payroll.read` | ot.ts, leave.ts |

Names that look like keys but are audit actions/outbox events: `hr.roster.publish`, `hr.swap.*`, `hr.correction.decide`, `hr.inbox.batch`, `hr.settings.clock-policy.update` (audit) · `hr.roster.published`, `hr.attendance.late|absent|corrected`, `hr.ot.decided`, `hr.leave.decided` (outbox). Pending outside H2: H3.4 R8 reject/reverse key split + custom-role backfill at H5.3 (RESUME:523).

## 5. Invariants enforced by oracles (who may write what)

| rule | check | file |
|---|---|---|
| only `hr/payroll.ts` writes `HrPayAdjustment` (incl. delete/deleteMany since H2.10); `decideAdjustment` only from `payroll-actions.ts` (+ H2.11 wrapper) | privacy S-20 | `scripts/qc-hf-hr-privacy.mts` |
| sensitive tokens (ytdJson, sourceRef, HrLawTable…) read no more often than on base, declared per-tag allowances + file exemptions | qc-hr-h1.3 S6.1 | `scripts/qc-hr-h1.3.mts`; RESUME:498 |
| `law.ts` is the only file naming `HrLawTable` | qc-hr-h3.3 S1.3 | RESUME:506 |
| no shop code writes `HrLawTable` | fitness-hr F16.9 | `scripts/fitness-hr.mts` |
| client files carry no sensitive fields · `payroll-rules.ts` frozen (sha) · every HR/payroll/kiosk page guarded, self-guard only under `/app/me/hr` · `hr.*` messages th = en · `pinCode` read only in `hr/pin.ts` · leave callers pass the actor · H0.7 partial unique kept · UI inventory ↔ data-testid | F16.1–F16.8 | `scripts/fitness-hr.mts` |
| publish flips only unpublished rows; roster warnings never block; `roster-rules.ts` pure | h2.1 S4.11, S5.2, S4.12 | `scripts/qc-hr-h2.1.mts` |
| roster.ts edited only in marked H2.2 hunks | h2.2 S7.1 | `scripts/qc-hr-h2.2.mts` |
| `clock-rules.ts` pure; client files carry no lat/lng/photoKey | h2.4 S1.6, S11.1 | `scripts/qc-hr-h2.4.mts` |
| judgement tables written only in `judge.ts` | h2.5 S9.4 | `scripts/qc-hr-h2.5.mts` |
| voided punches never deleted; every punch reader filters `voidedAt`; `correction.ts` sole writer | h2.6 S1.3 | `scripts/qc-hr-h2.6.mts` |
| leave ledger append-only, event in the same tx | h2.7 S1.5 | `scripts/qc-hr-h2.7.mts` |
| `ot.ts` via tenantDb with a fixed lock set, reads no punches; payroll.ts only in marked H2.9 hunks | h2.9 S1.2, S1.3 | `scripts/qc-hr-h2.9.mts` |
| `self.ts` is the only HR import of the me-pages; identity always from `resolveSelf` → `employeeOfUser`, never from input | h2.10 S1.1–S1.5, S10.4 | `scripts/qc-hr-h2.10.mts` |
| `inbox.ts` touches no prisma tables (auditLog only), never calls `decideLeave`/`decideAdjustment` directly | h2.11 S1.2, S1.3, R2.8 | `scripts/qc-hr-h2.11.mts` |

## 6. Known debts of phase H2 (one table)

| id | what | closes at |
|---|---|---|
| D-F4 | `timesOverridden` column | **closed** H2.4 (RESUME:461) |
| D-R3w/a/c/m | publish-counter minors | **closed** H2.2 (RESUME:458) |
| SYNC-POS | POS shiftHours "NO_CLOCK_IN" for shifts opened < 15 min before Bangkok midnight | POS owner (RESUME:448; hr-SYNC.md §B4) |
| SYNC-review | SYNC review MINORs | not assigned (`wo-notes/hr-SYNC-review.md`) |
| X-HR.1 | fill `hr.staffWindows()` from the roster | done via H4.1 `availability.ts` (RESUME:477) |
| SYNC-svcsec | qc-svc-b.1 · qc-sec-s1.3b/s1.9/s1.17/s1.21 "run on their own QC DBs before H2.12" | **still open** — this tree has no SVC/SEC wrapper env (§9) |
| QCALL-rest | qc:all stopped at 276/465 on owner order; 190 suites + svc/sec families not run | resume per `wo-notes/hr-H2-close-qcall.txt` (before H3.10) |
| QCALL-A50 | qc-audit-trail A-5.0 static grep stale since H0.6 (audit lives in payroll.ts) | controller ORACLE-EDIT ruling |
| H2.3-m1/m2 | closed-swap rendering | H2.10/H2.11 (RESUME:452) [unverified closed] |
| H2.3-race | leave approval ∥ swap apply | H2.7 (RESUME:452) [unverified closed] |
| H2.3-LIB | LIB-CANDIDATE blocks → qc-hr-lib import | controller (RESUME:452, 458) |
| D16–D17 | transient duplicate chip; header shows 4 shifts | H2.11 (`wo-notes/hr-H2.2.md`) |
| D18–D19 | zero-candidate marker via writeAudit; clock skew/AuditLog index | H5.1 |
| D20 | unused DTO title | H2.10 |
| H2.2-visual | unpublished dot overlaps label on dark chip; "ลาพักร้อน" wraps at 1024 | H5.1 (RESUME:458) |
| H2.2-touch | long-press drag untested on a real device | H5.1 (RESUME:458) |
| D-H24-pinonly | PIN-only kiosk only with ≥ 6-digit PINs | not assigned (RESUME:461) |
| D-H24-scope | kiosk list scope (loaned staff) | not assigned (RESUME:461) |
| D-H24-maxdur | no maxDuration on HR transactions | H5.3 (RESUME:461) |
| H2.4-photo | photo capture deferred | not assigned (RESUME:461) |
| D-H24-adopt/m1/m2/m3/m5/m6 | adopted sessions, split shifts, POS seam, settings writes | H2.5 / POS lane / H2.10 (`wo-notes/hr-H2.4.md`) [unverified closed] |
| D-H27-hourly | hourly leave not exposed (0.1-day precision) | Mig WO (RESUME:460) |
| D-H27-attach | attachments flag only | storage RUN (RESUME:460) |
| D-H27-closed-year | days returned after Y carry expired stay in closed Y−1 | not assigned (RESUME:469) |
| D-H27-topup-timing | top-up between expiry date and job run | not assigned (RESUME:469) |
| H2.7-straddle | straddling-endDate leave refused whole; requester text for chain cancel = D4 | H2.10 (RESUME:469) |
| H2.7-chain | approval-chain races not hunted | not assigned (RESUME:469) |
| D-H27-dead | dead old leave code + LIB-CANDIDATE blocks | not assigned (RESUME:469) |
| H2.5→H3 | planned roster break not subtracted · refuse/flag stale rows · leaveFraction once per day · hourly leave offset · OT measured ≠ approved · stray IN after OUT (F7) | H3.1/H3.4 (RESUME:472, 482) |
| VIS-1-a | tabs leading to 404 still render; tab strip overflow at 1440 | H5.1 (RESUME:486) |
| VIS-1-b | staff own profile 404 | **closed** (hr-H2.12-visual.md: self-own-profile 200) |
| VIS-1-c | approved-leave impact own section + 6 minors (method column, 16 px checkboxes, ปุ้ย twice on kiosk, raw settings template text, native date input, Gregorian holiday year) | not assigned (RESUME:486; ปุ้ย still present, hr-H2.12-visual.md) |
| D-H26-stale-neighbour | false refusals | not assigned (RESUME:487) |
| H2.6-PERIOD | PERIOD wording | not assigned (RESUME:487) |
| H2.6-D1 | device-logout evidence (no POS record) | not assigned (RESUME:489) |
| H2.6-D2 | payroll reads no attendance until H3 | H3.1 (RESUME:489) |
| H2.6-split | split-shift day with two missing OUTs needs two requests | not assigned (RESUME:489) |
| H2.6-trust | decide service trusts actor/tenant from the action layer | not assigned (RESUME:489) |
| H2.6-hunt | approval-chain / hourly+full-day leave cases not hunted | not assigned (RESUME:489) |
| D-H29-normal-hours | ÷30÷8 until `normalMinutesPerDay` adopted | H3.4 (RESUME:493) |
| D-H29-rate-inline | below-floor rate throws → error page | not assigned (RESUME:493) |
| D-H29-reason-ui | 0-settle reason stored, not shown | not assigned (RESUME:493) |
| H2.9-reversal | reversal of a PAID run after an OT revoke pays then deducts (net 0) | not assigned (RESUME:493) |
| H2.9-untested | no ACTIVE law row tested on a DB · overnight day-off split untested | not assigned (RESUME:493) |
| H2.9-daily | daily/hourly OT unpaid | H3.4 (RESUME:493) |
| H2.10-copies | cancel-open predicates copied beside frozen services | not assigned (RESUME:508) |
| H2.10-hunt | server actions end-to-end (cookies) and photo policy not hunted | not assigned (RESUME:508) |
| H2.10-visual | 390 not shot as linked owner (only staff) | not assigned (RESUME:508; hr-H2.12-visual.md) |
| D-H212-partial-pay-leave | child-care continuation 15 d at 50 % (shown disabled) | after H3.4 engine (hr-H2.12.md F2) |
| D-H212-per-event-quota | maternity per pregnancy / paternity within 90 d (created as yearly quota with a note) | not assigned (hr-H2.12.md F4) |
| D-H212-preset-race | two parallel preset adds of the same kind can both pass | not assigned (hr-H2.12.md :88) |
| H2.12-F3 | paid cap separate from quota (sick 30 paid, rest unpaid) | needs H3.4 (hr-H2.12.md F3) |
| H2.12-pin | qc-hr-h2.5 S9.5 nav tab list stays a literal pin | next tab-adding WO needs an ORACLE-EDIT (RESUME:536) |
| H2.12-visual | 11 pages judged from summaries only · live late/absent banners not exercised | not assigned (RESUME:536) |
| H2.12-docs | `docs/modules/18-hr.md` V2 section (plan row H2.12) not written | not assigned (master plan :79) |

Items routed to the owner (H2.6 MANAGER/self-apply, H2.9/H2.11 managers see no ฿, H2.10 route/own reason/own advance, H4.4 revoke) are in §7.

## 7. Owner decisions pending (OWNER LIST, asked at 100 %)

From RESUME:516: (1) route `/app/me/hr` (HQ30 default, never answered) · (2) managers see no ฿ (OT, inbox; mockups show ฿) · (3) MANAGER role alone cannot decide corrections · (4) owner self-apply of corrections / own advance · (5) STAFF account revoked shop-wide by the offboard key · (6) own leave reason hidden in "my requests" · (7) refund paths outside payroll (H4.6) · (8) accountant sign-off list · (9) official holiday dates 2569/2570 (also RESUME:460) · (10) Neon lane branches deletion · (11) prod GO.
Added later: H3.2 "enable mid-month = whole month in force" (RESUME:519, 525) · custom roles need backfill of the R8 keys at H5.3 (RESUME:523) · H4.7 recruiting CUT by default unless the owner objects (RESUME:444).

## 8. Accountant / legal items from H2

- **Accountant list** (RESUME:494), H2 items: multipliers s.61–63 · rounding/`otRoundMin` · s.68 divisor & normal hours · 1-satang v1/v2 drift · reversal DEDUCTION of overpaid OT (s.76) · NO_RATE staff · holiday on weekly day off for daily staff · late + stay-late = OT · re-settle at frozen rate (H3.1/H4.6 A1–A14 belong to other phases). No law row is ACTIVE on any DB until accountant sign-off HQ23 (RESUME:465).
- **Law follow-ups (LPA amendment No. 9, in force 7 Dec 2568)** — `wo-notes/hr-H2.12.md` Part C: F1 law preset leave types **built** · F5 soft warnings on policy save **built** · F3 paid cap separate from quota (s.32 + s.57) open · **D-H212-per-event-quota** (F4) · **D-H212-partial-pay-leave** (F2) · **D-H212-preset-race**. Part C gaps: sick quota 30 refuses day 31+ instead of making it unpaid [V2]; maternity per year not per pregnancy; child-care at 50 % not representable. Left open for the law follow-up; not legal advice (skill `shark-thai-law` labels).

## 9. Whole-system `qc:all` (this WO)

**PARTIAL — stopped on owner order at 07:42Z (machine needed).** Full log, per-suite table, triage and the resume command:
`ledger/wo-notes/hr-H2-close-qcall.txt`.

- Head 1b0898377 on lane 2 DB `wo-hr-qc-l2`. Before the run: migrate deploy found nothing pending, and seed-hr-qc passed 34/34.
- Planned 465 suites. That is every suite qc-all discovers (563) minus qc-svc-* and qc-sec-* (98).
- **Reached 276:**
  - ran 275: 208 pass, 67 fail
  - 1 interrupted at 0.1 s (kanban-k1.5)
- **Not run:** 190, listed as `NR` lines in the wo-note, with the resume command.

| family | ran | pass | fail | notes |
|---|---|---|---|---|
| hr (qc-hr-*) | 32 | 31 | 1 | hr-h0.5 S6.x, class a (QC4-only) |
| acc-v2 | 44 | 13 | 31 | 29 never executed (acc-v2 seed time-rot, R1) · schema drift (main svc_d index) · security S9 (seed + account code) |
| account / account-api | 7 / 19 | 7 / 10 | 0 / 9 | 5 seed-blocked · ai-skill/ai-external need the seed · docs/openapi generated files stale (main) |
| crm | 47 | 28 | 19 | 3 QC2-only guards · 8 crm-expected.json/seed mismatch on l2 · 4 member-regression children (seed) · 4 static checks on main content (pos-seam, sendEmail, crmDealId, pos.sale chain) |
| hf | 10 | 6 | 4 | QC4-only guards |
| kanban | 10 (+1 interrupted) | 9 | 1 | k1.15 generated docs stale (main) |
| audit-trail | 1 | 0 | 1 | **HR-caused, see below** |
| hardening | 1 | 0 | 1 | HD-5.2 Permissions-Policy, red on main (SECRETARY-RUN.md 7 Nov) |
| other families (ai 27, chat 26, approval, booking, hotel, branding, clinic, inventory, …) | 104 | 104 | 0 | — |
| pos 60 · member 38 · kanban 27 (incl. k1.5) · rest 65 | 0 | — | — | NOT RUN, stopped (resume list) |
| svc 60 · sec 38 | 0 | — | — | **not run here: needs scripts/qc-svc.sh / scripts/qc-sec.sh** (no `.env.qc-svc` / `.env.qc-sec` in this tree) |

Triage classes:
- **(a)** known non-defect
- **(b)** red on main's content. Shown from main's own ledger or from `git diff origin/main...HEAD` not touching the checked code. Not re-run on a main checkout, because the owner stop came first.
- **(e)** environment: the suite refuses this DB or needs another seed

**HR-caused (STOP, not fixed):** qc-audit-trail **A-5.0**.
- What fails: a static grep for `"hr.payroll.reverse"` in `hr/payroll-actions.ts`.
- Cause: H0.6 commit ea9c27a1a (merged in 57e94fec, 8 Oct, phase H0) moved that audit from the action into `reverseRun` (`hr/payroll.ts:1271`), per ruling OQ-5.
- Behaviour is intact: A-5.1, A-5.2 (reverse audit row exists) and A-5.3 are green, 20/21.
- Fix needed: an ORACLE-EDIT ruling. No HR H2 change caused a red in the part that ran.

## 10. Visual status

| status | pages | source |
|---|---|---|
| MATCH by looking at screenshots | H2.2 roster grid vs mockup 03 (after r3) · H2.12 batch (330 shots; 21 MATCH · 17 MINOR · 3 MAJOR + 2 inferred) · VIS-2 re-shoot all MATCH: 2.11 inbox 1440/390, inbox adj/ot, hub overview owner + manager, 2.6 correction day form 1440/390, 2.7 leave law presets, 2.4 clock settings manager-branch 390 — controller opened 3 PNGs, the builder the rest | RESUME:458, 536; `wo-notes/hr-H2.12-visual.md` |
| judged from summary JSON only (11) | 2.5 settings-attendance · 2.10 self-advance-form, self-profile · 3.1 we-settings · 4.4 life-contract, life-ended-kept, life-notes, life-offboard-open, life-settings · 4.6 stock-manager, stock-payroll | `wo-notes/hr-H2.12-visual.md`; RESUME:536 |
| not exercised | live late/absent banners on "today" (shots at 06:36–06:51 Bangkok) · touch long-press drag on a real device · kiosk photo capture (deferred) · F5 warnings on screen (seed at/above law) · inbox batch result screen · 390 self-service as a linked owner | same |

## 11. How to run the HR QC

| item | how | source |
|---|---|---|
| seed | `scripts/seed-hr-qc.mts` (34 checks) writes `scripts/hr-expected.json` (gitignored) — run first in every fresh tree | RESUME:446, 517 |
| lane DBs | `wo-hr-qc-l1` ep-nameless-sea-aokjm6d2 (shark-hr) · `l2` ep-orange-dust-aotwbyc7 (shark-hr-b) · `l3` ep-ancient-truth-ao56olit (shark-hr-l3); children of wo-pos-qc4; delete at RUN end (OWNER LIST 10) | RESUME:456; `scripts/hr-qc-hosts.mjs` |
| lane wrapper | `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/<suite>.mts` — qc-hr.sh reads `.env.qc-hr`, refuses non-lane hosts, lock `/tmp/shark-gate-hr-<host>.lock` | `scripts/qc-hr.sh` |
| controller gate | QC4 ep-frosty-lab via `scripts/qc4.sh` (ctl.sh + postmerge only); qc-hr-h0.5 is QC4-only (S6.x red on lanes) | RESUME:456, 463 |
| gate lock | build/serve exclusive; typecheck takes one of two slots (`/tmp/shark-heavy-{1,2}.lock`); suites flock `$GATE_LOCK_FILE` ≤ 30 min. HR must not edit this file | `scripts/with-gate-lock.sh`; RESUME:530, 535 |
| control scripts | `ledger/hr-ctl/ctl.sh` (QC4) · `ctl-lane.sh` (lane DB) · `postmerge.sh` · `pick-suites.sh` (ALWAYS list + oracles whose src paths changed; FULL when prisma/, src/lib/core/ or package.json change) · `json3way.py` for JSON merges | the files; RESUME:466, 470 |
| typecheck | `NODE_OPTIONS=--max-old-space-size=12288 ISO_MEM=14000M`, delete `.next/types` + `tsconfig.tsbuildinfo` first; < 2 min = suspect | RESUME:450, 501 |
| rules | postmerge always includes qc-hr-h3.3 + qc-hr-h1.2 · seed or qc-env change ⇒ MODE=full · migration/schema merge ⇒ clean typecheck on the merged base · oracles default base = `baseRef()` + in-base guards (iso.sh drops env) | RESUME:462, 490, 501, 506 |
| suites | `scripts/qc-hr-h0.1…h4.6.mts` (+ `qc-hr-lib.mts` library) · qc-hr · qc-hr-attendance · qc-hr-roster · qc-hr-leave-booking · qc-hr-payadjust · qc-hf-hr-privacy (194) · fitness-hr (9) · fitness (53) | `ls scripts`; RESUME:517 |
| qc:all | §9 — `scripts/qc-all.mts` runs every `qc-*.mts` sequentially (except qc-all, qc-member-m1.1) with acc-v2/kanban/member/CRM seeds | `scripts/qc-all.mts`, `scripts/qc-all-discovery.mts` |
