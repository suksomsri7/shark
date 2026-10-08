// C3.10 env workaround (NOT product/oracle code): shift the JS wall clock of ONE seed process to C310_FAKE_NOW.
// Reason: scripts/seed-acc-v2-qc.mts pins every date to QC.today 2026-09-30 but its own self-check
// (overviewStats → isOverdue reads Date.now()) counts the two invoices due 2026-09-30 20:00/21:00 +07 as overdue
// once the real day is past 30 Sep ⇒ the seed aborts (13,640,000 ≠ 12,840,000) from 1 Oct onwards.
// Only Date/Date.now are shifted; DB-side now() and TLS validation keep the real clock.
"use strict";
const target = Date.parse(process.env.C310_FAKE_NOW || "");
if (!Number.isFinite(target)) throw new Error("shift-clock: C310_FAKE_NOW missing/invalid");
const RealDate = Date;
const OFFSET = target - RealDate.now();
class ShiftedDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(RealDate.now() + OFFSET); else super(...a); }
  static now() { return RealDate.now() + OFFSET; }
}
globalThis.Date = ShiftedDate;
process.stderr.write(`[shift-clock] JS clock shifted by ${(OFFSET / 3600000).toFixed(2)} h → ${new RealDate(RealDate.now() + OFFSET).toISOString()}\n`);
