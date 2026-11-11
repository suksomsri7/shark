# HR SYNC — post-merge reds (wip/hr-sync-main · from a4feddc38)

Verification run: `ledger/wo-notes/hr-H2.1-sync.txt` (unit hr-sync-1, XDONE 17:27Z, red 19). Logs /tmp/hr-ctl/h2.1-sync/.
Merge parents: HR 85c6527be · main a242405dd · merge ee483dc75.

## A. Static "not touched vs base" checks → ORACLE-EDIT n/a (controller ruling, pattern = qc-hr-h1.3 `h13InBase()`)
| red | cause | edit | kept |
|---|---|---|---|
| H2.1-S6.10 | index.ts now carries main's POS P3.5 seam block (onShiftToday + consts) → `noLogic`/`noOnShiftToday` false | `h21InBase()` (562d06deb ancestor of merge-base HEAD/origin/session/hr or QC_H21_BASE) ⇒ those 2 keys n/a | block exists · rosterOnDay + rosterAt re-exported from ./roster |
| H2.1-S8.7 | payroll.ts + service.ts changed by merge vs base 574f9179 | diff half n/a when `h21InBase(base)` | payroll-rules.ts sha 75a66c0c… |
| H0.6-S8.5 | outbox-consumers.ts 23/25, webhooks/labels.ts 3/4 hunks unmarked vs d350c26 (main's hunks) | n/a when 57e94fec2 (H0.6 merge) is ancestor of merge-base HEAD/origin/session/hr | (S8.4 hashes untouched) |
| H1.2-S5.8 | payroll.ts changed vs 574f9179 | diff half n/a when c77537315 (H1.2 merge) ⊂ base | sha 75a66c0c… |
| H1.3-S5.5 | same | diff half n/a when `h13InBase()` (existing fn) | sha 75a66c0c… |

## A'. POS static reds (not edited — classified)
- P3.5-ST1 — static pin vs POS base, expected after merge: "hr/index.ts: ส่วนเดิมถูกแก้" — HR H0.x–H2.1 blocks precede POS's appended block.
- P3.5-ST2 — static pin vs POS base, expected: schema line `pinCode String?` changed by HR H0.5 (hash) + HR/SEC migrations 20261201…–20261227100000 not of P3.5.
- P3.6-ST2 — static pin vs POS base, expected: same `pinCode` schema line (HR H0.5).
- P3.7-ST1 — red on main's own content (not HR): `chat/after-hours.ts`, `chat/service.ts` write ChatMessage; `git diff a242405dd HEAD -- src/lib/modules/chat/` = empty.
- P3.7-ST3 — static pin vs POS base, expected: HR migrations under prisma/ + chat/service.ts (main SEC) differ from pin 72669941.
- P3.9-ST4 — static pin vs POS base, expected: HR migrations 20261201…–20261206… under prisma/.

## B. Behavioural reds
### B1 self-decision shape (H0.7-S2.4 · privacy SC-1b/SC-2/SC-5/SC-6 · also SC-7/AD-3)
- Cause: main POS P1.18 K4 added a core self-approval gate in `approval.decide` *before* HR's R5.1 check, returning
  `{ok:false, code:"SELF_APPROVAL", message:<Thai>}` without `reason`. HR's contract (HF-HR-0 round 5) is `reason` = Thai refusal.
- Callers: `bulkDecide` (→ approvals page `decideAction`/`bulkDecideAction`) already reads `message` for SELF_APPROVAL → UI fine.
  **AI `approval_decide` (`ai/proposals.ts:1239`) reads only `res.reason`** → user saw the generic
  "ตัดสินคำขอไม่สำเร็จ — คำขออาจถูกปิดไปแล้วหรือคุณไม่มีสิทธิ์ในขั้นนี้" (SC-7, AD-3) = real product regression (also present on main itself).
- Fix (product, one marked hunk `// HR SYNC ▸ … ◂` in `src/lib/modules/approval/service.ts`): the SELF_APPROVAL return also carries
  `reason: SELF_DECIDE_REFUSED` (same bytes as `message`). Restores the HR contract for every caller; no oracle edit needed.
  Refusal still before any write: stays PENDING, 0 decision rows (asserted by the same checks).
### B2 AI name masking (privacy L-5 · H1.1-S10.5)
- Cause: main SEC S3a.1 R-Z24 `maskToolOutput` (ai/tools.ts) masks every run of ≥ 9 digits in every tool's output, for every viewer
  (keys `id/รหัส*/…` exempt). Fixture names contain `Date.now()` stamps → "เพื่อนร่วมงาน •••45". Real names are not affected. Intended SEC behaviour.
- HR branch scope intact: `upcoming_schedule` still filters with `leaveBranch` (`scopedLeaveWhere(hrScopeOf(m))`); `pending_leaves` with `leaveListScopeOf`.
- ORACLE-EDIT (pre-approved): L-5 identifies the row by `lvR.id` (รหัสใบลา, unmasked) + "เพื่อนร่วมงาน " + SICK + date;
  S10.5 compares against names masked the same way (prefixes พนง-เหนือ/ใต้/ไร้สาขา keep rows distinct; tool output has no leave id). Scope asserts unchanged.
### B3 qc-nav-functions S5 — classified, not fixed
- Missing: `BOOKING: /booking/calendar, /booking/day`. Both from main SVC B.14 (calendar tab replaced the /day link in booking/layout.tsx;
  IN_PAGE_ENTRIES regex for /day no longer matches). `git diff a242405dd HEAD -- 'src/app/app/u/[unitSlug]/booking/' scripts/qc-nav-functions.mts` = empty
  → red on main's own content. HR 7/7 routes complete.
### B4 qc-pos-p3.5 HC4 (C1 warnings ["NO_CLOCK_IN"]) — classified: time-of-day, not merge
- `shiftHoursForOwner` asks `onShiftToday(at = openedAt + 15 min)`, whose `firstInAt` window is [00:00 BKK of *that* day, at].
  The run hit HC4 at ~16:50Z = 23:50 BKK; openedAt+15 min crossed Bangkok midnight → window started 2026-11-12 00:00 BKK and missed the
  IN made at 23:4x. Merged clock()/attendance code is not involved (IN row written, HC1/HC2 green, workedMin matched; attendanceMarks/hr-link unchanged vs main).
- Evidence: re-run after midnight (see below). Latent POS edge (shift opened in the last 15 min before midnight) — POS/main code, not touched.
### B5 later suites
- qc-pos-p2.5 49/49 · p2.14 60/60 · p1.1 180/180 · qc-push 7/7 — green.
- qc-svc-b.1, qc-sec-s1.3b/s1.9/s1.17/s1.21 exit=4 — cannot run on QC4 (guards refuse ep-frosty-lab: SVC → qc-svc, SEC → qc-sec.sh). Classified, not chased.

## Re-run (forced ×1, unit hr-syncfix-1, 17:30–17:43Z, QC4 via iso/qc4/gate-lock)
- qc-hr-h2.1 exit=0 90/90 RESIDUE none · qc-hr-h0.6 exit=0 55/55 residue 0 · qc-hr-h1.2 exit=0 73/73 none · qc-hr-h1.3 exit=0 63/63 none
- qc-hr-h0.7 exit=0 74/74 none · qc-hr-h1.1 exit=0 81/81 none · qc-hf-hr-privacy exit=0 194/194
- qc-pos-p3.5 exit=1 53/55 — only ST1/ST2 (static pins above); **HC4 green** (run after BKK midnight)
- qc-hr-h0.3 exit=0 37/37 none · qc-hr-attendance exit=0 31/31 · qc-approval 16/16 · qc-approval-wiring 7/7 · qc-ai-proposals 16/16
- fitness noenv exit=0 53/53 · fitness-hr noenv exit=0 8/8 · typecheck (12 GB heap) exit=0 errors=0
- Not run: full regression; fitness env mode; qc-nav-functions (nothing changed for it); svc/sec suites (need their own DBs).
