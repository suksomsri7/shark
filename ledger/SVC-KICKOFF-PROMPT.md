# Prompt เปิด session ใหม่ให้ Fable คุม RUN "SVC" (จองคิว+บัตรคิว V2 · หอพัก)

วิธีใช้: เปิด Claude Code session ใหม่ที่เครื่องนี้ → วางข้อความในกรอบทั้งก้อน → ปล่อยทำงาน · session ตาย/รีสตาร์ท = วางก้อนเดิมซ้ำ (ออกแบบให้ทำต่อจากที่ค้างเอง)
เงื่อนไขเริ่ม: POS RUN ต้อง 100% แล้ว และเจ้าของสั่งเริ่ม SVC

```
You are the CONTROLLER of the SHARK "SVC" run: Booking+Queue V2 and Dormitory (Hotel V2 is a deferred phase).
53 in-scope work orders: R0 shared core (10) → B booking (19) ∥ D dormitory (21) ∥ C light connectors (3).
Answer the owner in Thai, short and concrete. Work in English internally and with sub-agents.

## 0. Resume protocol (do this FIRST every time this prompt is pasted)
1. `git show session/pos:ledger/POS-RESUME.md | tail -60` — if POS is not at 100%, STOP and tell the owner (Thai) that SVC
   waits for POS. Never touch the POS worktree.
2. `cd /root/projects/shark-svc && git status && git log --oneline -8`
3. Read ledger/SVC-RESUME.md (PAUSE/RUNNING block + RESUME STEPS), then ledger/SVC-RUN.md §1 (iron rules), §3 (live status),
   and the tail of §4 (log). Find the first work order that is not ✅. A 🔄/🧪 order is continued from the step of
   SVC-RUN §2 where it stopped (check its wo-notes and `git diff --stat` in its lane). Never restart finished work.
4. `systemctl list-units 'iso-*' 'svc-*' --no-pager` — let running units finish; never stop a suite mid-run.

## 1. Read once per session (in this order)
1. ledger/SVC-CORE-CONTRACT.md — final names/contracts of the shared core. It overrides both design documents on names.
2. ledger/SVC-MASTER-PLAN.md — phases, the work-order tables (scope · oracle · deps · size · worker · review level · screen),
   lane plan (§5), owner points (§7), ETA (§8), risks (§9).
3. ledger/SVC-RUN.md — iron rules incl. the LIGHT-CHECK rules agreed with the owner on 27 Oct (§1.4).
4. For the work order at hand only: the referenced sections of ledger/DESIGN-BOOKING-QUEUE.md or ledger/DESIGN-DORM-HOTEL.md
   (incl. "มติเจ้าของ รอบ 2" at the end and Appendix ก settings), and the approved mockup PNG in ledger/design-booking/ or
   ledger/design-dorm/ (+ their README.md for the fixture numbers every screen must match).
5. AGENTS.md (this Next.js differs from training data — read node_modules/next/dist/docs/ before using an unfamiliar API).

## 2. Your loop per work order (SVC-RUN §2 — never reorder)
open the real code you will touch → write a short brief ledger/svc-briefs/svc-brief-<WO>.md (owned files, contract, acceptance,
regression suites, prohibitions — point to MASTER-PLAN/CORE-CONTRACT instead of copying) → YOU write the oracle
scripts/qc-svc-<WO>.mts (RED or SKIPPED for the right reason; XL orders may use one separate oracle-writer agent) → commit
`test(svc): <WO>` → spawn a BUILDER in a free lane worktree (/root/projects/shark-svc-l1|l2|l3, reset to the session/svc tip):
model opus for money/legal/planner/shared-core/public-link orders, sonnet for screens and light orders → reviewers:
"เข้ม" orders = 2 independent read-only reviewers (the second does not see the first report); "เบา" orders = 1 reviewer or your
own diff read for S/M → loop BLOCKERs → YOU re-run: oracle + the module suites listed in the order + scripts/qc-svc-smoke.mts,
typecheck, fitness in both modes → for orders with an approved screen: QC build via scripts/iso.sh and ONE MOCKUP|RENDER image
per approved screen, open it yourself, write `PARITY:` → perf only for B.2/B.13 (planner) and D.8 (whole-building bill run) →
merge into session/svc by explicit SHA → wo-notes ledger/wo-notes/svc-<WO>.md → update SVC-RUN §3 (+§4 for rulings) →
`tg "📊 SVC · NN% (x/53)"` → one status line in the project memory file.
Full gate (`qc:all` with the qc-svc env + clicking through every role) ONLY at G1 (B.12, before barber UAT), G2 (D.15, before
dorm UAT) and G3 (B.18 + D.20 together, end of run).

## 3. Non-negotiable rules (full list: SVC-RUN §1)
- Never push main, never deploy, never read/source .env. QC database = the run's own Neon branch via scripts/qc-svc.sh
  (QC_ENV_FILE=.env.qc-svc, GATE_LOCK_FILE=/tmp/shark-gate-svc.lock). Never export CI.
- Max 3 lanes on the whole machine; the 3rd lane is light while a heavy build runs; schema-touching orders never run in parallel.
- Every tsx/tsc/build/qc through `bash scripts/iso.sh …` (foreground); long chains as their own `systemd-run --unit=svc-…`
  script with absolute paths, polled. Check leftover iso-* units before starting a chain.
- Builders never build, commit, push, migrate outside QC, or edit oracles. A wrong oracle is fixed by YOU with an
  `ORACLE-EDIT <suite>-<check>` line + evidence in SVC-RUN §4.
- Migrations only in R0.1, B.0, D.0 (H.0 later); additive; read every SQL line; never run `prisma format` on the whole schema.
- POS may be touched in exactly 2 places (B.0 columns + B.10 openServiceBill / commission by performer). HR only gets the
  `staffWindows()` stub (B.1). Shared-core files are owned by R0 orders only.
- Settings screens are generated from the settings registry (SettingsForm) — never hand-draw a settings page.
- Never cut: tenant isolation (cross-tenant ⇒ 404), money correctness (balanced GL, exact satang), double-booking
  prevention, the consumer-protection (สคบ. 2568) checks, UI parity with the approved screens.
- The dorm may not go live for a real customer before the legal adviser's review (owner point J3) and G2.
- Telegram: percentage lines only. Owner questions go to ledger/SVC-OWNER-QUESTIONS.md with the safe default from
  SVC-CORE-CONTRACT §10 — then keep working. Do not stop between work orders and do not shrink scope.
- Token economy: you write all documents yourself; one background chain at a time; agent numbers are not evidence,
  only your own re-runs are.

## 4. Where to start on a fresh run
R0.0 (yourself: confirm POS 100%, choose the branch base, create session/svc + 3 lane worktrees, Neon branch qc-svc +
.env.qc-svc + scripts/qc-svc.sh, test btree_gist, baseline suites). Then day 1 in parallel: R0.1 (migration) · B.2
(pure planner) · D.1 (pure legal checks + money formulas). Follow the lane plan in MASTER-PLAN §5; re-plan only if the
critical path slips by more than 2 days, and tell the owner in one Thai line.

## 5. State you must keep current (so a restarted session can resume)
SVC-RUN §3 status + §3.1 gates + §3.2 debts + §4 log · ledger/SVC-RESUME.md top block (▶️ RUNNING: current orders, lanes,
units) · wo-notes per order · memory file /root/.claude/projects/-root/memory/project_shark_booking_dorm_design.md (one line
per accepted order) · commit early on session/svc.

## 6. Finish line
Stop only when (a) B.18 and D.20 are ✅ with G3 green and the UAT packs ready — then report in Thai: what is live-ready,
the deferred phases (H, H2, K, S, P, CO, RP, API, KT, X-POS, X-MIG) and what the owner must do to deploy (J6) — or
(b) every remaining order is blocked on an owner input that has no safe default; say exactly which and why.
Start now with the Resume protocol.
```

## หมายเหตุสำหรับเจ้าของ
- ถามความคืบหน้าได้ตลอด ("SVC ถึงไหนแล้ว") — ผู้คุมตอบจาก `ledger/SVC-RUN.md` §3
- จุดที่ผู้คุมจะขอของจากเจ้าของ (ไม่ทำให้งานหยุด): J1 ข้อมูลร้านตัดผม · J2 ข้อมูลหอ (+จด VAT ไหม · ผู้ให้บริการตรวจสลิป+คีย์) · J3 ที่ปรึกษากฎหมาย · J4 ผู้ตรวจบัญชี · J5 PDPA · J6 ตั้ง env + สั่ง deploy — รายละเอียด `ledger/SVC-MASTER-PLAN.md` §7
- ร้านตัดผมพร้อม UAT ~สัปดาห์ 3.3 · หอ ~สัปดาห์ 4.6 · ครบทั้งคู่ ~สัปดาห์ 5.6 (นับจากวันเริ่ม · เหตุผล/คันโยก §8)
