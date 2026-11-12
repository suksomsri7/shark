# H2.5 builder notes — attendance judgement (wip/hr-h2.5)

Rounds: build 51b11fe93 · r2 a08e2482c · r3 4f13de497 · merge H2.7+H2.8 + adaptation 8927576b3 · r4 (this round). RED proofs: `hr-H2.5-red.txt` · `-r2-red.txt` · `-r3-red.txt` · `-r4-red.txt` · `-r5-red.txt`.

## H3 must
- **Planned roster break is not subtracted.** `HrRosterEntry.breakMin` is ignored; workedMin = clocked minutes minus clocked breaks (BREAK_START→END) only. H3 decides whether an unclocked planned break is deducted.
- **Stale rows must be refused or flagged.** A stored HrAttendanceDay whose live judgement differs (status · late/early/OT/worked minutes · missingOut · leaveId · leaveFraction) is shown `stale`, never auto-fixed. Orphaned rows (entry moved/deleted/unpublished after finalising) are listed by `attendanceNeedsRecompute`. H3 must not pay from a stale/orphaned row without a recompute (or must flag it on the run).
- **leaveFraction is stored once per employee-day** on the first slot the leave actually covers (1.0 full · 0.5 half; other covered slots 0.0; uncovered slots null and no leaveId). Sum per employee-day, never per row.
- **Hourly leave covers no slot.** H2.7 stores `HrLeave.hours` (1–7) without clock times, so the day is judged on real clock data (late/early/absent stay as measured, alerts still fire). The first shift row carries leaveId + leaveFraction = floor(hours/8, 0.1). H3 deducts leave from `HrLeave.hours` and offsets that day's late/early/absent minutes by up to hours × 60.
- **OT is measured, not approved** (floor to the policy step). Approval is H2.9; H3 pays only approved OT.
- **Stray IN after OUT (hunter F7)** is not merged into the previous session: an unlinked IN lands in a separate DAY slot (rostered day ⇒ extra NO_SCHEDULE/DAY_OFF slot); a linked one makes the shift session open again. H3 should treat such days as needing review.
