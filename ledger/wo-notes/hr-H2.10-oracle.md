# H2.10 oracle notes — `scripts/qc-hr-h2.10.mts` (49 checks · 46 RED-by-design · 3 GREEN controls)

Brief `ledger/hr-briefs/hr-brief-H2.10.md` · base b40c53138 · lane DB wo-hr-qc-l3 (`scripts/qc-hr.sh`) · SKIP while `hr/self.ts` is absent · `QC_FORCE=1` runs anyway.
Base for statics: `baseRef("QC_H210_BASE")` (merge-base HEAD origin/session/hr); once `self.ts` is in the base (`pathInBase`) the hunk/frozen diffs read "n/a in base" (no "newest migration" assertion anywhere).

## Contract readings the oracle relies on (ORACLE-EDIT if the builder needs another reading)
- Every facade export: `fn(actor, …, opts?)`, actor = `{tenantId, userId, role, unitAccess, permissions}` (oracle passes `{tenantId, ...vOf(user)}`, sometimes with junk `employeeId/systemId` keys). Inputs are objects; write paths name the input parameter `input` (S1.3 scans `input|args|params|body|form*|fd|req` . `employeeId|userId|systemId|tenantId|linkedUserId`).
- "Own object" per action: cancel leave/OT/correction/advance = row of the resolved employee (leave/OT/correction also by the user who filed it, as the services allow) · `selfCancelSwap` = requester is the resolved employee · `selfRespondSwap` = target is the resolved employee · `selfAcknowledgeNote` = own **visible** note. Anything else ⇒ `SELF_TEXT.notFound` before the service is called (S4.2–S4.5 also assert foreign rows are byte-unchanged).
- Unlinked actor / linked user in a tenant where they have no row ⇒ `{ok:false, reason: noEmployee}` from all 23 exports (S4.7/S4.8), never a throw.
- ENDED actor ⇒ writers `CLOCK_TEXT.mInactive` (S4.6), `mySelf.active === false`.
- `myToday.clock` must deep-equal `clock.myClockState({tenantId,userId}, {now})` (S2.2). `myBalances(actor,{year})` must deep-equal `leave.myLeaveBalances(ctx, viewer, {year})` (S2.5).
- Leave balance refusal text = `leaveRefusalText(e) ?? HrLeaveRequestError.message` of a direct `requestLeave` call (today: "วันลาคงเหลือไม่พอสำหรับใบลานี้ — ดูยอดคงเหลือก่อนยื่น").
- OT/correction/clock/peer-punch refusals = the direct service result for the same input (verified on base: OT "ยื่นคำขอ OT ล่วงหน้าได้ไม่เกิน 31 วัน" · correction future / 35 days / reason · clock "เปิดตำแหน่ง (GPS)…" · peer punch "ไม่พบการลงเวลานี้…").
- Advance: period = first Bangkok month from `now` without a live run (fixture: DRAFT 2031-06 ⇒ 2031-07); system B with runs 2031-06 + 2031-07 ⇒ `advClosed`. Audit `hr.payadjust.request` must not carry `amount`/`"note"`/the note text; `hr.payadjust.delete` +1 on cancel.
- Nav: `hrNavFilter(items, viewer, {linked})` returns the filtered array (items `{href,label}`), expected per viewer from the page gates `canReadRoster` / `canRunKiosk` / `canManageHrSettings` (+ attendance for linked) and `"/app/me/hr"` appended when linked (S7.1, 6 viewers × linked).
- Static S7.2: layout `case "HR":` block still holds the base's literal labels and calls `hrNavFilter(`; layout diff hunks carry `HR H2.10 ▸` (other marked hunks tolerated). S7.3: `hrTabs` text identical to base, `hrTabsFor` exported, no `hrTabs(` call left under `src/app/app/sys/[id]/hr/**` nor `<ModuleTabs items={hrTabs(` in `ui.tsx`.
- S9.1 frozen: each listed file may only differ by hunks carrying a `▸` marker of another WO, never `HR H2.10`.

## Fixtures (tenant `qc-hr-h210-*` + `-other`, June 2031, now = Tue 10 Jun 08:52 BKK)
A (u1, linked plain STAFF, morning 09–17 published today, 11 Jun unpublished, 13 Jun published, 21 Jun future, APPROVED leave 14 Jun, IN/OUT 9 Jun) · B (u1 same shift today, 22 Jun entry, swap → A) · C (u1 evening, no overlap) · D (u2) · X (ENDED) · L (u1 on APPROVED leave today) · Up (u1, unpublished, unlinked) · W (owner-linked) · S (2nd HR system, both months closed) · O (other tenant). Holiday 15 Jun · GPS site u1 (r 150 m) · PERSONAL quota 3 · PAID 2031-05 slip for A (net 1,712,345) + B · DRAFT 2031-06 · visible + hidden note for A. Foreign objects (leave/OT/correction/swap/advance/note) raw for B, D, O, X.
Cleanup: `HrReviewNote HrOnboardingTask HrClockSite HrAttendanceDay HrHoliday` by tenant, then `cleanupFx`; Z1 counts both.

## Check list
| id | group | sev | base | title |
|---|---|---|---|---|
| H2.10-S1.1 | R2 | CRITICAL | RED | [static] self.ts: server module (no "use server") · exports resolveSelf + SELF_TEXT + 10 readers + 13 writers |
| H2.10-S1.2 | R2 | CRITICAL | RED | [static] every exported self function calls resolveSelf · resolveSelf calls employeeOfUser |
| H2.10-S1.3 | R2 | CRITICAL | RED | [static] self.ts never reads employeeId/userId/systemId/tenantId/linkedUserId from input (targetEmployeeId only) |
| H2.10-S1.4 | R3 | CRITICAL | RED | [static] self-actions: use server · wrappers only · requireTenant · no id form fields · no DB · no now: |
| H2.10-S1.5 | R3 | CRITICAL | RED | [static] me/hr pages exist · import only the self facade/actions/ui + shell/ui libs · no now: |
| H2.10-S1.6 | §5 | CRITICAL | RED | [static] "use client" files of the feature reach no prisma module |
| H2.10-S1.7 | §3 | MAJOR | RED | SELF_TEXT byte-exact (7 texts) |
| H2.10-S2.1 | R4 | MAJOR | RED | mySelf: keys · name/position/unit of the linked row |
| H2.10-S2.2 | R4 | CRITICAL | RED | myToday: own published shift · clock = myClockState verbatim · keys |
| H2.10-S2.3 | R4 | MAJOR | RED | myWeek: Mon–Sun · published only · own leave · holiday · week normalised |
| H2.10-S2.4 | R4 | CRITICAL | RED | myRequests: own items only · exact keys per kind |
| H2.10-S2.5 | R4 | MAJOR | RED | myBalances = myLeaveBalances of the linked row |
| H2.10-S2.6 | R4 | CRITICAL | RED | myDocuments: own APPROVED/PAID slips only · visible notes only · slots null · keys |
| H2.10-S2.7 | R4 | MAJOR | RED | myLeaveForm/myLeavePreview: policies · own shifts in range only |
| H2.10-S3.1 | R4/Q6 | CRITICAL | RED | colleagues = same day · unit · overlap · published · active · not on leave · keys exact |
| H2.10-S3.2 | R8 | CRITICAL | RED | reader outputs: no forbidden keys · no employee/user ids · no other person's name beyond colleague/peer |
| H2.10-S3.3 | R9 | CRITICAL | RED | mySwapTargets: same unit/day active peers · foreign fromEntryId ⇒ notFound |
| H2.10-S4.1 | R2 | CRITICAL | RED | [idor] injected ids in input/actor ⇒ rows for the linked employee in its own system only (leave · OT · correction · advance) |
| H2.10-S4.2 | R2 | CRITICAL | RED | [idor] same-branch peer's objects: 7 actions ⇒ notFound bytes · nothing changed |
| H2.10-S4.3 | R2 | CRITICAL | RED | [idor] other-branch objects ⇒ notFound bytes · nothing changed |
| H2.10-S4.4 | R2 | CRITICAL | RED | [idor] other-tenant objects ⇒ notFound bytes · nothing changed |
| H2.10-S4.5 | R2 | CRITICAL | RED | [idor] ENDED employee's objects + unknown ids ⇒ notFound bytes · nothing changed |
| H2.10-S4.6 | R11 | CRITICAL | RED | [idor] ENDED actor: writers ⇒ inactive · no row · mySelf.active=false |
| H2.10-S4.7 | R2 | CRITICAL | RED | [idor] unlinked actor: all 23 exports ⇒ noEmployee · no throw · no row |
| H2.10-S4.8 | R2 | CRITICAL | RED | [idor] linked user acting in another tenant ⇒ noEmployee everywhere |
| H2.10-S4.9 | R2/R9 | CRITICAL | RED | [idor] correction on a peer's punch · swap from a peer's entry · swap to an out-of-list target ⇒ refused · no row |
| H2.10-S5.1 | R5 | CRITICAL | RED | leave via facade: plain STAFF files without key · balance refusal = service text · nothing written |
| H2.10-S5.2 | R10 | MAJOR | RED | owner who is an employee: own leave auto-APPROVED through the facade |
| H2.10-S5.3 | R5 | MAJOR | RED | OT via facade: window refusal = service text · PENDING · cancel |
| H2.10-S5.4 | R5 | MAJOR | RED | correction via facade: future/too-old/reason = service texts · PENDING · cancel |
| H2.10-S5.5 | R5 | MAJOR | RED | swap via facade: give-away → peer accepts (facade) → PENDING · cancel |
| H2.10-S5.6 | R5 | CRITICAL | RED | clock via facade: no GPS = service text · in radius ⇒ MOBILE row · no coordinates in result |
| H2.10-S5.7 | R5 | MAJOR | RED | notes via facade: ack own visible once (first wins) · hidden ⇒ notFound |
| H2.10-S6.1 | R6 | MAJOR | RED | advance validation texts (0 · 1.5 · 50,001 · note 201) |
| H2.10-S6.2 | R6 | CRITICAL | RED | advance ok ⇒ PENDING ADVANCE · first open period · requestedById · audit without amount/note |
| H2.10-S6.3 | R6 | MAJOR | RED | advance: second ⇒ advOpen · cancel own ⇒ deleted + audit · again ⇒ notFound |
| H2.10-S6.4 | R6 | MAJOR | RED | advance: both months closed ⇒ advClosed · nothing written |
| H2.10-S6.5 | R6 | CRITICAL | RED | [race] advance ×2 ⇒ exactly 1 row · 1 advOpen |
| H2.10-S7.1 | R7 | CRITICAL | RED | hrNavFilter: owner/manager/key holder/kiosk/payroll/plain staff/member × linked |
| H2.10-S7.2 | R7 | MAJOR | RED | [static] layout case HR wraps hrNavFilter · literal labels as base · marked hunk · drawer item |
| H2.10-S7.3 | R7 | MAJOR | RED | [static] hrTabs byte-identical · hrTabsFor exists · HR pages use hrTabsFor |
| H2.10-S7.4 | R7 | MAJOR | RED | [static] own profile ⇒ redirect /app/me/hr/profile (marked hunk) |
| H2.10-S8.1 | §5 | MAJOR | RED | [static] testids + tokens only + 44 px |
| H2.10-S8.2 | §5 | MAJOR | RED | [static] inventory rows ⇄ testids (wo H2.10) |
| H2.10-S8.3 | §5 | MAJOR | RED | [static] hr.self th = en |
| H2.10-S8.4 | §5 | MAJOR | RED | [static] visual SPECS["2.10"] (staff · member · owner on /app/me/hr) |
| H2.10-S9.1 | frozen | CRITICAL | GREEN | [static] payroll-rules sha · frozen files without H2.10 hunks (other WOs' marked hunks tolerated) |
| H2.10-S9.2 | frozen | MAJOR | GREEN | [static] no migration vs base · seed/env unchanged |
| H2.10-Z1 | house | CRITICAL | GREEN | no residue |

## RED run (base, oracle only) — `ledger/wo-notes/hr-H2.10-red.txt`
Forced: passed 3/49 · BASE-EXPECTATION 49/49 as registered · every RED reads "∅<fn> (∅ src/lib/modules/hr/self.ts)" / missing file / missing testid (no crash) · RESIDUE none. Unforced: SKIPPED, exit 0.
