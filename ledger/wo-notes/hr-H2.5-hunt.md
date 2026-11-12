# H2.5 bug hunt — wip/hr-h2.5 @ 51b11fe93 · lane DB wo-hr-qc-l1 (qc-hr.sh) · 12 Nov 2026

Probe tenants were `qc-hr-h25hunt-*` (2 per run, 2 runs) with dates in 2032–2033. Each run ended with `RESIDUE none` and 0 rows left in HrAttendanceDay/Alert. The seeded tenant was not touched, so no reseed was needed. Probe scripts are deleted; this file is the only one added.

## FAIL

**F1 HIGH — Unrostered overnight work is split across two days, so the first day becomes missingOut with 0 minutes.** This breaks the Q3 calendar rule and R3 ("unattributed ⇒ DAY slot of IN's day").
- Repro: no roster and no schedule. IN D 22:00, OUT D+1 06:00. Run loadAttendanceMonth at D+19.
- Got: D = `NO_SCHEDULE W0 missingOut`, and D+1 = `NO_SCHEDULE W0` holding only the OUT. Wanted: D = `NO_SCHEDULE W480`, and nothing on D+1.
- The finaliser stores it the same way. At year end, IN 2032-12-31 23:58 / OUT 2033-01-01 00:02 is stored as `NO_SCHEDULE/W0/MO`.
- Cause: in `judge.ts slotsOf`, `restByDay` keys each rest event by its own `bkkDayKey(e.at)` and not by the IN that opened its session. In `attributeSessions`, the rows that follow an unattributed IN all land in `rest`.

**F2 HIGH — The same split hits anyone on an overnight HrWorkSchedule.** Every such day ends as missingOut.
- Repro: schedule 22:00–06:00 on all 7 weekdays. IN D 21:58, OUT D+1 06:01.
- Got: D = `ON_TIME W0 missingOut`. Wanted: `ON_TIME W483`.

**F3 MAJOR — Unpublishing a roster entry after it was finalised double-counts the day.**
- Repro: entry 07:00–15:00, IN/OUT linked, finalised. Then set publishedAt=null.
- Board: two slots, `DAY:NO_SCHEDULE W480` and stored `E:ON_TIME W480 STALE`, and the totals add both.
- Recompute of the stored row returns rNotFound, so it can never be fixed.
- The next job run writes a second HrAttendanceDay row (slotKey DAY, W480). That is 960 minutes for one day, and H3.1 will read it.

**F4 MAJOR (spec gap, R2 only checks dates) — Employees with `active=false` or `employmentStatus=ENDED` still get alerted and marked absent.**
- Repro: leftover published entry, no IN.
- Got: NOT_IN and ABSENT alerts plus events to managers, and the finaliser writes ABSENT rows.
- `roster-board.ts isEnded` and `clock.ts` both treat these people as gone. An employee whose endDate is in the past is handled correctly (no slot).

**F5 MINOR (spec literal) — With an AM half-day leave and absentAfterMin=60, the live board shows ABSENT/NOT_IN at 08:30 although the person is only due at 11:00.**
- Cause: absentAt is measured from shift start, not from the due start.
- The final result is still right if they show up. Alerts are correctly suppressed.

**F6 MINOR — An IN row with no roster link from 23:58 for a 00:30 shift the next day is not attributed.**
- Effect: D gets a DAY_OFF slot with missingOut, D+1 is ABSENT, and a false ABSENT alert fires.
- Live clock-ins are not affected: `clock.ts` links them within earlyInMin across midnight, and the linked case passes. Only rows written without a roster link hit this (corrections, imports).

**F7 MINOR (spec literal) — A stray IN after OUT makes the whole day missingOut with 0 minutes (pure judgeEntry).**
- Repro: IN 07:00, OUT 15:00, IN 15:02 → W0, missingOut.
- In the DB the 15:02 IN is unlinked, so it lands in a separate DAY slot instead.

## PASS (got = wanted)
- **Pure fuzz:** 3 000 random inputs gave no negative minutes and nothing over 1 440 for a shift slot. A 36-hour session with no shift gives W2160 in pure judgeEntry, but the DB path cannot produce it (see F1).
- **Day boundaries:**
  - A linked IN at 23:58 for a 00:30 shift gives ON_TIME W512.
  - A shift ending at 24:00 with OUT at exactly 00:00 gives W480.
  - A year-end overnight rostered shift gives ON_TIME W487 and finalises correctly on Jan 1.
- **Clock rows:**
  - Split 08–12 / 13–17 (IN with no OUT, then IN 12:58): shift A = missingOut, shift B = W242.
  - OUT with no IN gives ABSENT in one slot.
  - Duplicate IN/OUT rows give W480.
  - BREAK_START with no END, then OUT, gives W240.
- **Leave:**
  - Full-day leave on a shift = LEAVE; on a day off = DAY_OFF; on a holiday = DAY_OFF.
  - Full-day leave over two shifts gives 2 LEAVE rows.
  - AM half-day leave, not worked, gives ABSENT with leaveFraction 0.5 and leaveHalf AM.
- **Arriving after the absent alert:** alerts are NOT_IN + ABSENT, nothing re-fires, final is LATE 70.
- **Jobs:**
  - Alert job run 3× in a row then 3× in parallel: NOT_IN once per employee, later runs return 0.
  - Finaliser run 3× in parallel then 3× in a row: the rows added match Σfinalized, later runs write 0 and emit no events.
  - The other tenant is never touched.
- **Grace changed after finalise:** the stored row shows LATE + STALE, and recompute gives ON_TIME with grace 30, version 2.
- **Recompute refusals:**
  - Staff on own row → rNoPerm.
  - Manager outside branch → rNotFound.
  - Manager on own row → rOwn.
  - Key-holding writer on own row → rOwn.
  - Short reason → rReason.
  - Owner of another tenant → rNotFound.
- **Recompute after payroll:** APPROVED → rPaid, PAID → rPaid, REVERSED → ok.
- **Recompute races:**
  - Recompute while another tx holds `hr:clock` and corrects OUT 15→17: it waits about 2.2 s, then W600 O120.
  - 3 recomputes in parallel: exactly one changed.
- **Scoping:**
  - Another tenant's month → null.
  - Branch manager's board has no rows from the other branch; their month view of another branch's employee → null.
  - Staff board → null; myAttendanceMonth returns only their own employee.

## Not tested
- Notification consumer recipients and texts.
- Kiosk and mobile clock paths end to end.
- Unpublished-roster weeks in combination with HrWorkSchedule.
- Budget and deadline caps (200 / 2 000).
- Settings-save validation.
- An `/hr/attendance` page render.
