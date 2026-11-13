# H2.12 — close phase H2 (parts B–D) · notes

Tree `shark-hr-b` · branch `wip/hr-h2.12` (cut from origin/session/hr 7dcdcb3c7, which already holds part A, the SYNC of origin/main 6b991f34d) · lane DB `wo-hr-qc-l2` via `scripts/qc-hr.sh`.
Lane DB prep: `prisma generate` 0 · `migrate deploy` applied main's `20261227000000_svc_h` (out of order, as expected) · seed-hr-qc 34/34.

## Part B — oracle hygiene sweep

Rule applied: a static check that compares the tree with a base ("diff vs base empty", "only my hunks", "my migration is the newest", "labels/tabs = base") describes the ticket's own diff. It needs (1) base = `baseRef()` / merge-base with origin/session/hr (iso.sh drops env) and (2) an in-base guard (`pathInBase(<file the ticket created>, base)` ⇒ diff part n/a). SHA pins and literal pins that a later ticket must re-take by ORACLE-EDIT stay pins.

| suite | check | problem | fix / status |
|---|---|---|---|
| qc-hr-h0.1 | S4.2 S4.3 | sha pins (rules · payroll.prisma · computeItem · CRM block · markPaid block) | pins, left (re-taken by ORACLE-EDIT when a WO legitimately moves them, e.g. H3.1) |
| qc-hr-h0.2 | — | no base-relative statics | n/a |
| qc-hr-h0.3 | S6.1 | judge slice sha pin | pin, left |
| qc-hr-h0.5 | S8.6 | fitness-hr F16.5 baseline (ratchet) | ratchet, left |
| qc-hr-h0.6 | S8.5 | diff vs legacy pin `QC_H06_BASE`/103fde95 | already guarded (57e94fec2 in merge-base ⇒ n/a) |
| qc-hr-h0.7 | S7.4 S7.5 | rules sha · reader signature sha | pins, left |
| qc-hr-h1.1 | S6.6 | rules sha | pin, left |
| qc-hr-h1.2 | S5.8 | payroll.ts unchanged vs merge-base | already guarded (c77537315 in base) · S7.x seed counts = data, not diff |
| qc-hr-h1.3 | S5.5 S5.7 S6.5 S6.6 | diff vs merge-base | already guarded (`h13InBase`) |
| qc-hr-h1.3 | S6.1 | token-count ratchet vs base (privacy-sensitive fields) | deliberate cross-ticket ratchet with per-WO allowances, left |
| qc-hr-h1.3 | S1.1 | migration sorts after H1.2 | absolute order, not "newest" — fine |
| qc-hr-h2.1 | S6.10 S8.7 | diff vs merge-base | already guarded (`h21InBase`) |
| qc-hr-h2.2 | S7.1 | frozen files + roster hunks | already guarded (`H22_IN_BASE`) |
| qc-hr-h2.3 | S8.2 S8.3 | frozen + marked hunks | already guarded (`h23InBase`) |
| qc-hr-h2.4 | — | helpers defined, no base-diff check uses them | n/a |
| qc-hr-h2.5 | S9.5 frozen / payroll hunks | diff vs base | already guarded (`IN_BASE`) |
| qc-hr-h2.5 | S9.5 `nav` | **literal** list of 9 HR tab labels (only "คำขอ" excluded) — any later WO that adds a tab turns it red | literal pin, **left as a pin** per rule; flagged for the controller: the next tab-adding WO needs an ORACLE-EDIT (as H2.11 did) or a ruling to make it base-relative + in-base guard |
| qc-hr-h2.6 | S1.1 `only` S1.7 S1.8 | migrations / frozen / hunks vs base | already guarded (`atBase(correction.ts)`) · S1.7 sha pins left |
| qc-hr-h2.7 | S11.2 S11.3 | frozen + hunks | already guarded (`h27InBase`) |
| qc-hr-h2.9 | S1.3 S1.4 S1.7 | hunks vs base | already guarded (`H29_IN_BASE`) |
| **qc-hr-h2.10** | **S7.2 `labels`** | HR nav labels = base labels (H2.11 lines filtered) — a later WO adding a nav item goes red | **fixed**: `IN_BASE \|\| labels equal` (non-empty still checked) |
| **qc-hr-h2.10** | **S7.3 `same`** | hrTabs block byte-identical to base | **fixed**: `IN_BASE \|\| same` (non-empty, hrTabsFor, pages, hub still checked) |
| qc-hr-h2.10 | S9.1 S9.2 | frozen / prisma / seed vs base | already guarded |
| qc-hr-h2.11 | S13.1 | frozen + prisma vs base | already guarded (ORACLE-EDIT at SYNC) |
| **qc-hr-h2.11** | **S13.2** | leave/payroll add-only + correction/ui/layout marked-only hunks vs base — an unmarked main-sync hunk or a later WO modifying a line goes red | **fixed**: n/a once `inbox.ts` in base |
| qc-hr-h3.1 | S1.1 `last` S1.5 S1.6 S11.1 | newest migration / hunks / frozen | already guarded (`IN_BASE`) |
| qc-hr-h3.3 | S1.1 | payroll unchanged vs base | already guarded (`H33_IN_BASE`) |
| qc-hr-h4.1 | S1.4 S1.6 | frozen / consumer hunks | already guarded (ORACLE-EDIT 12 Nov) |
| qc-hr-h4.4 | S1.1 `last` S14.1 S15.1 | newest migration / hunks / frozen | already guarded |
| **qc-hr-h4.4** | **S13.5** | layout hunks must carry H2.10/H2.11 marks · hrTabs = base — any later tab/nav WO goes red | **fixed**: `IN_BASE \|\| …` for both (non-empty hrTabs still checked) |
| qc-hr-h4.6 | S12.2 S12.3 S14.1 | hunks / frozen | already guarded |
| qc-hf-hr-privacy | — | `git ls-files` only (whole-tree scan, behavioural) | n/a |
| fitness-hr | F16.5 F16.7 | baselines / later migrations must not DROP the H0.7 index | ratchet / invariant, left |

Totals: **4 checks fixed in 3 suites** (h2.10 S7.2 + S7.3 · h2.11 S13.2 · h4.4 S13.5), **36 base-relative checks already guarded (17 suites)**, 1 literal pin flagged (h2.5 S9.5 nav), the rest are sha pins/ratchets (left). Commit 0fa0cc5b3.

**Positive control** (temp branch, deleted, never pushed): (1) narrow — a marked `HR H3.4` tab in layout + an unmarked tab in hrTabs + a modified line in leave.ts: old oracles red exactly on h2.10 S7.2/S7.3 (55/57), h2.11 S13.2 (65/66), h4.4 S13.5 (85/86); new oracles 57/57 · 66/66 · 86/86. (2) broad — an `HR H3.4` comment hunk appended to 27 HR/approval/consumer/CRM files, one unmarked hunk in correction.ts and a dummy later `_hr_` migration: all 24 qc-hr-h* forced green except h0.5 S6.x (known lane-DB non-defect) and **h2.5 S9.5 nav** (the literal pin above).

## Part C — leave defaults vs law (LPA, amendment No. 9 in force 7 Dec 2568)

Source: `shark-thai-law/references/domain-labour-payroll.md` §ค (checked 13 Nov 2569). Not legal advice.

**What the product actually ships.** H1.2/H2.7/H2.8 ship **no leave types**: a new shop starts with an empty "ประเภทการลา" list and creates its own (settings page form). The engine has 4 categories (`HrLeaveType` SICK · PERSONAL · VACATION · OTHER), `paid` is all-or-nothing, `quotaDays` per leave year (null = unlimited; balance short ⇒ request refused). The only "default set" is the **HQ12 recommended set** used by the QC seed (`scripts/hr-qc-env.mts` TL.policies, marked "รอเจ้าของยืนยัน"): ลาป่วย SICK paid 30 (certificate from 3 days) · ลากิจ PERSONAL paid 3 · ลาพักร้อน VACATION paid 6 after 365 days, carry 6 to 03-31 · ลาไม่รับค่าจ้าง OTHER unpaid unlimited. Form defaults: category ลากิจ · paid yes · quota blank (= unlimited) · half-day yes · min service 0 · year starts Jan · no first-year pro-rata.

| leave | law | tag | product / HQ12 default | verdict |
|---|---|---|---|---|
| sick — pay | paid ≤ 30 working days/yr (s.57) | [V] | SICK paid 30 | match |
| sick — right to leave | "as actually sick" (s.32), certificate may be asked from 3 working days | [V2] | quota 30 = **refuses day 31+** instead of making it unpaid · certificate from 3 | gap (V2 → not fixed; follow-up F3) |
| sterilisation | per doctor, paid (s.33, 57) | [V] | no type in the set; shop can add OTHER paid unlimited | missing from recommended set (F1) |
| personal business | ≥ 3 working days/yr paid (s.34, 57/1) | [V2] | PERSONAL paid 3 | match |
| annual | ≥ 6 working days after 1 year; pro-rata optional (s.30) | [V2] | VACATION 6 after 365, no first-year pro-rata | match |
| military | per summons, paid ≤ 60 days/yr (s.35, 58) | [V] | no type in the set; shop can add OTHER paid 60 | missing from recommended set (F1) |
| training | per ministerial rule, no pay section (s.36) | [V2] | none; OTHER unpaid possible | ok (F1 optional) |
| **maternity** | ≤ 120 days per pregnancy, employer pays ≤ 60 (s.41, 59 as amended by No. 9) | [V] | no type; today only as two OTHER types (paid 60 + unpaid 60) and the quota is per **year**, not per pregnancy | missing (F1) + mechanics gap (F4) |
| **child-care continuation** | + ≤ 15 days (sick/at-risk/disabled child, certificate), pay **50 %** (s.41 ¶4, 59/1) | [V] | not representable: `paid` has no percentage | mechanics gap (F2) |
| **spouse birth (paternity)** | ≤ 15 days within 90 days of birth, full pay ≤ 15 (s.41/1, 59/2) | [V] | no type; shop can add OTHER paid 15 (90-day window not enforced) | missing (F1) |
| days counted | working days (holidays/days off out) | [V] (s.57 wording) | engine counts working days (H2.7 Q5) | match |
| hourly/day/monthly employees | s.57/57/1/59 apply to all employees | [V] | categories independent of pay type | match |

**Fixed in this ticket: nothing.** Every product default that exists (form defaults, HQ12 seed values) is at or above the [V] minimums. The [V] gaps are *missing leave types* and *missing mechanics*, not wrong default values: adding them means either a new preset feature or changing the QC seed set (seed counts 4 policies are pinned by seed-hr-qc and qc-hr-h1.2 S7.2/S7.4 — an owner-question default, HQ12, not a product default) or a migration (per-pregnancy quota, pay percentage). Per the brief these are written up instead of built.

**Proposed follow-up tickets**
- **F1 — Law preset leave types (S, no migration, ~0.5 d + oracle).** Settings button "เพิ่มประเภทการลาตามกฎหมาย" that creates the missing rows only (idempotent by name, shop-adjustable afterwards, never blocks): ลาคลอด (ได้ค่าจ้าง) OTHER paid 60 · ลาคลอด (ส่วนที่ไม่ได้ค่าจ้าง) OTHER unpaid 60 · ลาช่วยภริยาคลอด OTHER paid 15 · ลารับราชการทหาร OTHER paid 60 · ลาทำหมัน OTHER paid unlimited · ลาฝึกอบรม OTHER unpaid. Same texts in th/en; extend HQ12 seed only by controller ruling (seed count pins move).
- **F5 — Soft warnings on policy save (S, no migration, ~0.5 d).** Settings shows a warning (not a refusal) when a SICK policy is paid < 30 or quota < 30, PERSONAL paid < 3, VACATION < 6 or min service > 365, maternity-named policy paid > 60/total < 120. Oracle in qc-hr-h2.7.
- **F3 — Paid cap separate from quota (M, migration `paidQuotaDays`, ~1.5 d + payroll seam).** SICK: unlimited leave, paid up to 30 days, rest unpaid automatically (s.32 + s.57). Needs the payroll engine (H3.4) to read paid vs unpaid days.
- **F4 — Per-event quota (M, migration, ~1.5 d).** Maternity 120 per pregnancy and spouse leave 15 within 90 days of the birth date (event date on the request), instead of per leave year.
- **F2 — Partial-pay leave (M/L, migration `paidPercent` + H3.4 engine, ~2–3 d).** Child-care continuation 15 days at 50 %. Depends on H3.4 adopting leave pay; do not start before H3.4's engine lands.

## Part B — suite run on the lane DB (head 0fa0cc5b3, all forced, 21:34–22:06Z)
seed-hr-qc 34/34 · h0.1 67/67 · h0.2 58/58 · h0.3 37/37 · **h0.5 67/71** (S6.2/S6.4/S6.5/S6.7 = known lane-DB non-defect) · h0.6 55/55 · h0.7 74/74 · h1.1 81/81 · h1.2 73/73 · h1.3 63/63 · h2.1 90/90 · h2.2 60/60 · h2.3 79/79 · h2.4 68/68 · h2.5 79/79 · h2.6 55/55 · h2.7 89/89 · **h2.9 57/58 → re-run 58/58** (S7.1 "list keys" failed once; green on the synthetic run before and on the re-run → intermittent, debt: find the flaky conjunct) · h2.10 57/57 · h2.11 66/66 · h3.1 58/58 · h3.3 51/51 · h4.1 47/47 · h4.4 86/86 · h4.6 69/69 · qc-payroll 19/19 · qc-payroll-reverse 14/14 · qc-hr-payadjust 27/27 · qc-bulk-ops 13/13 · qc-hf-hr-privacy 194/194 · fitness noenv 53/53 · env 53/53 · fitness-hr noenv 9/9 · env 9/9. qc-nav-functions not in this list (its S5 red is main's, known). Typecheck not run in this ticket.

## Part D — visual
See `hr-H2.12-visual.md`. 330 shots in `.qc-shots/hr/<wo>/` · 3 MAJOR → fix list for the controller. Build needed `SHARK_TSC_PREBUILD_OK=1` because main's `api/mobile/inbox/conversations/[id]/reply/route.ts` exports `REPLY_RATE` (Next route-type error; same on origin/main).

## Fix part (VIS-2 + F1/F5) — 13 Nov
Commit 2227c6828 (+ notes). VIS-2 items 1–4 fixed (see `hr-H2.12-visual.md` "VIS-2 re-shoot"). F1: `hr/leave-presets.ts` (pure table + match + warnings) · `leave-presets-service.ts` `addLeavePreset` · `leave-presets-actions.ts` `addLeavePresetAction` · `leave-presets-ui.tsx` (settings section + warning lines). Permission = leave types today (OWNER or hr.employee.create; shop-wide ⇒ all-branch admin), not "owner only". F5: warnings under each leave type, never block.
Debts: **D-H212-partial-pay-leave** (child-care 15 d at 50 % — shown disabled) · **D-H212-per-event-quota** (maternity per pregnancy / paternity within 90 d — created as yearly quota with a note) · D-H212-preset-race (two parallel adds with different names of the same kind can both pass; same name is caught by the unique index).
Suites (lane DB, forced): h2.11 70/70 · h2.6 56/56 · h2.7 94/94 (incl. X12.1 fitness ×4) · h2.10 57/57 · h2.5 79/79 · h2.4 68/68 · h3.2 64/64 · h1.2 73/73 · h1.3 63/63 · qc-hf-hr-privacy 194/194 · fitness 53/53 ×2 · fitness-hr 9/9 ×2 · clean typecheck exit 0.
