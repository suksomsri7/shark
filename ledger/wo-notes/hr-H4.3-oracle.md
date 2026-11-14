# H4.3 oracle — AI tools for HR (+ H4.2-FIX1)

Files: `scripts/qc-hr-h4.3.mts` (≈55 KB: registry, DB matrix, lifecycle, races) + `scripts/qc-hr-h4.3-lib.mts` (≈17 KB: statics, pure, scanners, net guard, tenant sweep).
FIX1 additions: `scripts/qc-hr-h4.2.mts` (3 checks S7.1–S7.3, every hunk marked `ORACLE-EDIT (H4.2-FIX1 via H4.3 · controller ruling)`).
37 checks in H4.3 (32 RED-by-design, 5 GREEN controls). Run output: `hr-H4.3-red.txt`.

## 1. Checks (id · what)
- **S1.1** new files exist · **S1.2** registry: exactly 6 new `hr_*` tools once; T1–T4 read, T5–T6 `action`; `toolIsMapped`; `HAND_TOOL_ACCESS` T1–T4 = `{needs:[], needsPerson:true, scopedData:true}`; `HAND_ACTION_KIND[T5|T6]` = own name; `toolModuleOf` = hr; `toolIsWrite`.
- **S1.3** `kindAccessOf` = `{hr, hr.employee.create}`; not DESTRUCTIVE; `isPlanHumanOnly`; skill `hr` lists the 6 + the 3 old tools; summary has "ข้อเสนอต้องมีคนยืนยัน"; `assertSkillRegistryComplete()`.
- **S1.4** adapter thin. `tools-hr.ts` has no prisma, core/db or env import and imports `@/lib/modules/hr/ai`. `hr/ai.ts`:
  - value import from core/db is only `{ tenantDb }`; no `prisma.`; no raw SQL;
  - no own query of pay, attendance, review notes, balances, POS or work days;
  - calls the §3 readers + `lockRosterKeysInTx`; reads `membership.findFirst`;
  - no import of the AI provider or service.
- **S1.5** `ai-rules.ts` pure; exports `fenceUntrusted`, `capHrToolResult`, `patternFacts`, `rosterFingerprint`, `briefLine`, `HR_AI_TEXT`.
- **S1.6** [control] frozen per brief §4. `labor-rules.ts` and `labor-actions.ts` stay frozen. `labor.ts` and `labor-ui.tsx` are judged in S1.7.
- **S1.7** every hunk vs base is marked:
  - `HR H4.3` in tools, tool-access, kind-tables, proposals, plans, skills, secretary/digest and hr/roster (each file ≥ 1 hunk);
  - `H4.2-FIX1` in `labor.ts` and `labor-ui.tsx`;
  - `ORACLE-EDIT (H4.2-FIX1 via H4.3` in `qc-hr-h4.2.mts` and its lib;
  - proposals.ts removes no line outside a marked hunk.
- **P1** `HR_AI_TEXT` th/en (no · bad · person · dataNotOrders · stale). **P2** `fenceUntrusted`. **P3** `capHrToolResult`.
- **F0** [control] fixture readers (board, month summaries, team balances, laborDay R1).
- **M1–M4** each tool × viewer = that viewer's UI reader (canon projection); everyone else gets NO. Q2 is in M3 and Q8 in M4.
- **M5** refusal bytes identical (26 cases). **M6** API keys, scheduled-task actor and forged system object are refused with no data and create no proposal row.
- **R1** H4.2 R1 inherited by T3: doubling the outsider's pay leaves the output byte-identical; owner output changes (positive control).
- **A1** sentinel/forbidden-key scan over every output and proposal row. **A2** branch scope. **I1** injection fence. **I2** reads write nothing.
- **L1–L9** proposal lifecycle (see §3) · **C1** caps · **V1** levels · **B1** Daily Brief · **N1** no network · **X1** fitness without env · **Z1** no residue.

## 2. Names/shapes pinned (brief left open)
- **Tool args:**
  - T1 `{day?: YYYY-MM-DD, unitId?, hrSystemId?}`
  - T2 `{period: YYYY-MM, unitId?}`
  - T3 `{day}` or `{periodKey}`, `+ unitId?`
  - T4 `{year?, employeeId?}`
  - T5 `{from, to, unitId?, entries:[{employeeId,date,shiftId}]}`
  - T6 `{employeeId, month}`
  - Extra caller keys (`__takeCap`, `opts`) must be ignored or rejected with `bad` (L9).
- **Refusals** = `{"error": HR_AI_TEXT.no | .bad | .person}`; this is the runTool convention.
- **HR_AI_TEXT** = `{th:{…}, en:{…}}` (a flat object is also read). It has a `stale` key, which is the confirm note for stale proposals (L6, L8).
- **T1 rows** = board rows, same order, with `slots[].{status, phase, lateMin, leave:{label,pending}}`, compared canonically. `name` = `fenceUntrusted(name)`, which may be cut at 60 characters with a trailing "…". `truncated:false` when not capped.
- **T2 rows**:
  - Numbers equal the report's `values` (commas stripped) for lateCount, lateMin, earlyOutCount, absentDays, missingOut.
  - Rows are sorted by lateCount, descending.
  - `period` is echoed.
- **T3 outputs:**
  - Day keys {day, unitId, basis, sales, costSatang, salesSatang, pctTenths, targetTenths, excludedHeadcount, partial, truncated, demandPeak} equal laborDay. The money values come from `money.*`, `truncated` from `flags.truncated`, and `demandPeak` from `demand.peak`.
  - Month keys plus `prev.{periodKey,pctTenths}` equal laborMonth.
  - No `hours`, `shifts`, `employeeId`, `name` or `rows` keys.
- **T4:**
  - team rows `[employeeId, items(name, category, unlimited, granted, used, balance)]` equal `teamLeaveBalances({year})`;
  - self = 1 row with no `employeeId`, equal to `myBalances`;
  - `year` is echoed.
- **Untrusted fence (ruling "delimited"):**
  - Every output with user text carries `untrusted:[keys]`, containing at least `name`, plus the exact `HR_AI_TEXT.dataNotOrders` string.
  - Injected text may appear only as the value of a key listed in `untrusted`. Here that means `name` and `position`.
  - No control or bidi characters and no `\n` anywhere in the output.
- **T5:**
  - Output `{proposalId, summary (= row.summary), waiting:"user_confirm", skipped:[{employeeId,date,code}], warnings}`.
  - Payload strings match `[A-Za-z0-9_:.-]{1,128}`, with `systemId` and `basis` present.
  - Confirmed rows have `source AI` and `published false`.
- **T6:**
  - Below the threshold ⇒ `{result:"NO_PATTERN"}` with no `proposalId`.
  - `facts.{lateCount,lateMin,absentDays}` equal the `loadAttendanceMonth` summary of the proposer; `topWeekday` and `teamAvgLate` are present.
  - The note is kind NOTE, `visibleToEmployee:false`, `authorUserId` = confirmer, with a Thai title. The body contains the late count and no user text, sentinel or "SYSTEM".
- **Audit:**
  - `hr.ai.proposal.confirm`: targetId = proposal id, actorType USER, actorId = confirmer, `after.via:"AI"`, `after.kind`.
  - `hr.ai.proposal.refused` on the Q3 refusal, with data-free `after`.
- **Daily Brief:**
  - Return shape: `hrTodayLine(tenantId, {role, unitAccess, permissions, userId}, now)` → `{line, counts:{onLeave, lateOrNotIn, absent, short}} | null`.
  - Counts are per board row: `LEAVE` · `LATE` or (`NOT_IN` and not LEAVE) · `ABSENT`. At D0 10:00 the owner gets 1/2/0 (verified from the reader in F0). `short` is not checked.
  - Digest: `viewerDigest(...).hrToday` contains the line, and `digestBlock(d)` prints it. It is null for a member and when hr is OFF.
- **Levels:** `ctx.access` (AccessMap) for tools and `toolsOfferedTo`. Confirm under READ = an `AiSystemAccess` row (hr, READ); the proposal stays PENDING.
- **Caps:**
  - Separate tenant, 60 people on shift: T1 ≤ 50 rows, T2 ≤ 50, T4 ≤ 30, each with `truncated:true`.
  - Every output in the run ≤ 8,192 bytes.
  - 41 entries ⇒ `bad`, as do an 8-day span and `from < today`.

## 3. Readings of the brief (ambiguities)
1. **Ruling Q3 vs §7.6** ("branch-A staff confirming branch-B entries ⇒ FAILED, 0 rows"). The ruling wins: the proposal stays PENDING. Under the existing room rule only the proposer can see a plain conversation, so "a confirmer who may not see the branch" is tested as the same user after their DB `unitAccess` narrowed `[*]→[A]`. Restoring it lets the same proposal execute (L3).
2. **"MANAGER-only confirmer ⇒ refused, PENDING kept"** (§7.6). Role MANAGER passes `canManageHrSettings`, so it is a valid T5 confirmer. The case is therefore tested on T6 (`canSeeLifecycle` needs OWNER or a key):
   - the proposer's DB row is switched to MANAGER with no keys ⇒ refused and still PENDING;
   - switched back ⇒ the proposal executes (L8).
3. **Stale** = FAILED with `HR_AI_TEXT.stale` and no rows (R7). This applies to a human entry on a drafted slot, an approved leave on a drafted slot, and changed T6 facts.
4. **Keys/system actors:** the brief's "byte-identical incl. keys" cannot hold for every tool. `toolVerdict` answers T1–T4 with its own fixed texts (DENY_KEY / needsPerson), and for T5/T6 a general key passes `toolVerdict` and gets `HR_AI_TEXT.person`. M6 therefore requires refused + data-free + no proposal row. M5 requires byte-identity among member-kind refusals.
5. **T1 day arg:** "today" is the default, but a fixed past day is used so that tool and reader outputs are deterministic.
6. **A2:** borrowing makes a branch-B employee working at A visible on A's board (same as the UI). The check is on a B-only employee and on the B unit id.
7. **T5 dates** are relative to real today + 30..39 days, because `addEntry` refuses past days. Results do not depend on the date.
8. **labor.ts / labor-ui.tsx** are frozen by the brief, but H4.2-FIX1 is folded into this ticket. They may change only through hunks marked `H4.2-FIX1` (S1.7).

## 4. RED on base (62a1f457b + oracle files), forced
| group | ids | reason |
|---|---|---|
| statics | S1.1 S1.4 S1.5 S1.7 | new files absent; shared files have no H4.3 hunk; labor.ts / labor-ui.tsx have no FIX1 hunk |
| pure | P1–P3 | `ai-rules.ts` absent |
| registry | S1.2 S1.3 | no hr_* tools, kinds, plan entries or skill entries |
| matrix/privacy | M1–M6 R1 A2 I1 | runTool answers "ไม่รู้จักเครื่องมือ …"; for M6 the tools are not in the registry |
| I2 · A1 | I2 A1 | no successful read outputs (I2 needs ≥ 30) and no proposal rows (A1 needs ≥ 8). Nothing leaks on base. |
| lifecycle | L1–L9 | no proposal is created (`∅proposal`) |
| caps · levels · brief | C1 V1 B1 | tools absent; `hrTodayLine` absent |

GREEN on base, and why that is correct:
- **S1.6**: nothing frozen has changed.
- **F0**: the fixture readers already exist and return the hand-checked values.
- **N1**: no request leaves the process.
- **X1**: fitness passes with and without env.
- **Z1**: the generic sweep leaves no row in any `tenantId` table, and no users or sessions.

Unforced run on base: SKIPPED exit 0 (`hr/ai.ts` absent).

## H4.2-FIX1 (controller ruling, folded into H4.3) — checks in `qc-hr-h4.2.mts`
Fixture additions:
- U6 is linked to HR + POS A.
- R is MONTHLY 3,000,000 from 2027-06-01, home U6.
- A finalized APPROVED run for 2027-06: R gross 3,000,000 + ssoEr 75,000.
- Sales of 1,000,000 satang per day, 06-01..06-28 (06-28 at 09:00).

**S7.1 (FIX1-a m1), open month with a finalized run:**
- Daily estimate: June has 30 days ⇒ monthlyShare 100,000 per day. SSO = halfUp(1,750,000 × 5% ÷ 30) = 2,917 per day (the same vector as S4.14) ⇒ 102,917 per day.
- `now` 2027-06-28 10:00 BKK ⇒ completed days 06-01..06-27 = 27:
  - cost 27 × 102,917 = 2,778,759
  - sales 27 × 1,000,000 = 27,000,000
  - pct = 2,778,759 × 1000 ÷ 27,000,000 = 102.917 ⇒ 103
  - throughDay 2027-06-27, basis not ACTUAL
- Base gives ACTUAL instead: 3,075,000 ÷ 28,000,000 = 109.8 ⇒ 110.
- `now` 2027-07-05 ⇒ ACTUAL 3,075,000 · sales 28,000,000 · pct 110 · throughDay null.
- RED on base: open month = ACTUAL/3,075,000/28,000,000/110.

**S7.2 (FIX1-b m2):**
- Reader part, already green on base: `laborMonth([U2], U2, 2027-02)` has excludedHeadcount 1 + partial, and `prev` (2027-01) has excludedHeadcount 1 + partial.
- UI part, RED on base: `labor-ui.tsx` must read `month.partial`/`month.excludedHeadcount` and `prev.partial`/`prev.excludedHeadcount`, so the "ไม่รวมพนักงานที่คุณไม่มีสิทธิ์ดูค่าจ้าง N คน" note shows per figure. Base uses only the day's `m.partial`.

**S7.3 (FIX1-c), RED on all three parts on base:**
- Day 1 (U5, now 04-01): month `costSatang` must be null (base: 0), with null %.
- 201 HrEmployeeUnit rows on K (2030 dates, so they have no effect on the figures) ⇒ `laborDay(owner, U2, 01-19)` keeps cost 36,750 and must set `truncated` (base: nested `units take 200` is silent).
- The MTD label passes its `day` through `formatThaiDate`/`formatShortDate` imported from `@/lib/ui/date`. This is checked statically on the `t("monthToDate", {… day: helper(…)})` call. Base passes the raw `throughDay`.

**H4.3 side:**
- L9: `hr_labor_percent` never passes `__takeCap`/`opts` through to the reader.
- S1.7 allows exactly the FIX1-marked hunks in `qc-hr-h4.2(.mts|-lib.mts)`, `labor.ts` and `labor-ui.tsx`.

Base run of `qc-hr-h4.2.mts` with the additions (unforced, H4.2 in base):
- 53/56 pass; only S7.1, S7.2 and S7.3 are RED, for the reasons above;
- the 53 old checks stay green; no residue.
