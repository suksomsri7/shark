// QC — CAL1.2 next-fire.ts (บริสุทธิ์ · ครอบทุกกิ่ง) + items.ts (CRUD ของส่วนตัว · M3)
//   P1–P8 ฟังก์ชันบริสุทธิ์ (occurrences/nextFire/schedule/fireReason/afterFire/snoozeTarget/validateWhen/ตัวช่วยวัน) — ไม่แตะฐาน
//   D1–D9 items.ts บนฐาน QC: สร้าง/ตรวจ/แก้/เสร็จ/เลื่อน/ยกเลิก/ยืนยัน DRAFT · ของคนอื่น = 404 · link ตามสิทธิ์ · เพดาน 500 · แท็บ+cursor
//   S1 ข้อสอบโครงสร้าง M3: ทุก query ของตาราง CAL ใน items.ts มี userId ตรงตัวใน where · ฟังก์ชัน export ไม่มีพารามิเตอร์ userId
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-cal-1.2.mts
//   (PURE_ONLY=1 = เฉพาะส่วน P ไม่ต้องมีฐาน)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chk, errMsg, finish, guard, makeFixture, thai, type AnyMod } from "./qc-cal-lib.mjs";

const LABEL = "qc-cal-1.2";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PURE_ONLY = process.env.PURE_ONLY === "1";
if (!PURE_ONLY) guard(LABEL);
const nf = (await import("@/lib/modules/calendar/next-fire")) as AnyMod;

// เวลาไทย → Date
const T = (s: string) => new Date(`${s}+07:00`);
const eq = (a: Date | null | undefined, b: Date | null | undefined) => (a == null && b == null) || (!!a && !!b && +a === +b);
const isoL = (ds: Date[]) => ds.map((d) => d.toISOString()).join(",");
const MIN = 60_000;

console.log("── P1: occurrences ──");
{
  const none = { startAt: T("2026-11-17T15:00:30"), repeat: "NONE" };
  chk("P1-1", "NONE = [startAt] ตรงตัว (รวมวินาที)", isoL(nf.occurrences(none, T("2026-11-01T00:00"), T("2026-12-01T00:00"))) === T("2026-11-17T15:00:30").toISOString());
  chk("P1-2", "NONE นอกช่วง = [] · to<from = [] · cap 0 = []", nf.occurrences(none, T("2026-11-18T00:00"), T("2026-11-19T00:00")).length === 0 && nf.occurrences(none, T("2026-11-19T00:00"), T("2026-11-18T00:00")).length === 0 && nf.occurrences(none, T("2026-11-01T00:00"), T("2026-12-01T00:00"), 0).length === 0);
  const ad = { startAt: T("2026-11-17T00:00"), allDay: true, repeat: "NONE" };
  chk("P1-3", "all-day NONE ยิง 09:00 ไทยของวันนั้น", isoL(nf.occurrences(ad, T("2026-11-17T00:00"), T("2026-11-18T00:00"))) === T("2026-11-17T09:00").toISOString());
  const daily = { startAt: T("2026-11-16T23:30"), repeat: "DAILY" };
  const dd = nf.occurrences(daily, T("2026-11-10T00:00"), T("2026-11-19T00:00"));
  chk("P1-4", "DAILY 23:30 ไทย: เริ่มวันของ startAt · ไม่มีครั้งก่อนหน้า · ขอบวันไทย (16:30Z)", isoL(dd) === [T("2026-11-16T23:30"), T("2026-11-17T23:30"), T("2026-11-18T23:30")].map((d) => d.toISOString()).join(","), isoL(dd));
  const wk = { startAt: T("2026-11-16T09:00"), repeat: "WEEKLY", repeatDays: [1] };
  const ww = nf.occurrences(wk, T("2026-11-20T00:00"), T("2026-12-15T00:00"));
  chk("P1-5", "WEEKLY จันทร์ 09:00 ข้ามเดือน: 23,30 พ.ย. · 7,14 ธ.ค.", isoL(ww) === ["2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14"].map((d) => T(`${d}T09:00`).toISOString()).join(","), isoL(ww));
  const wkMulti = { startAt: T("2026-11-16T09:00"), repeat: "WEEKLY", repeatDays: [3, 1, 3] };
  chk("P1-6", "WEEKLY หลายวัน (ซ้ำ/ไม่เรียง) → จ.+พ.", isoL(nf.occurrences(wkMulti, T("2026-11-16T00:00"), T("2026-11-22T23:59"))) === [T("2026-11-16T09:00"), T("2026-11-18T09:00")].map((d) => d.toISOString()).join(","));
  const wkEarly = { startAt: T("2026-11-16T00:30"), repeat: "WEEKLY", repeatDays: [] };
  chk("P1-7", "WEEKLY ว่าง = วันไทยของ startAt (จ. 00:30 ไทย = อา. 17:30Z → ยังเป็นจันทร์)", nf.weeklyDays(wkEarly).join() === "1" && isoL(nf.occurrences(wkEarly, T("2026-11-17T00:00"), T("2026-11-24T00:00"))) === T("2026-11-23T00:30").toISOString());
  const mo31 = { startAt: T("2027-01-31T10:00"), repeat: "MONTHLY" };
  const mm = nf.occurrences(mo31, T("2027-01-01T00:00"), T("2027-05-31T23:59"));
  chk("P1-8", "MONTHLY 31: ม.ค.31 → ก.พ.28 → มี.ค.31 → เม.ย.30 → พ.ค.31 (ยึด D เดิม)", isoL(mm) === ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"].map((d) => T(`${d}T10:00`).toISOString()).join(","), isoL(mm));
  const leap = { startAt: T("2028-01-30T08:00"), repeat: "MONTHLY" };
  chk("P1-9", "MONTHLY 30 ปีอธิกสุรทิน → 29 ก.พ. 2028 · ข้ามปี ธ.ค.→ม.ค.", isoL(nf.occurrences(leap, T("2028-02-01T00:00"), T("2028-03-01T00:00"))) === T("2028-02-29T08:00").toISOString() && nf.occurrences({ startAt: T("2026-12-05T09:00"), repeat: "MONTHLY" }, T("2026-12-01T00:00"), T("2027-02-28T00:00")).length === 3);
  chk("P1-10", "cap ตัดจำนวน (DAILY 1 ปี cap 62 = 62)", nf.occurrences(daily, T("2026-11-01T00:00"), T("2027-11-01T00:00")).length === 62 && nf.occurrences(daily, T("2026-11-01T00:00"), T("2027-11-01T00:00"), 3).length === 3);
  chk("P1-11", "MONTHLY cap หยุดกลางทาง", nf.occurrences(mo31, T("2027-01-01T00:00"), T("2028-01-01T00:00"), 2).length === 2);
}

console.log("── P2: nextFire ──");
{
  const now = T("2026-11-16T10:00");
  const r = nf.nextFire({ startAt: T("2026-11-16T15:00"), repeat: "NONE", leadMinutes: 15 }, now);
  chk("P2-1", "NONE อนาคต: occursAt = startAt · fireAt = startAt−lead", eq(r?.occursAt, T("2026-11-16T15:00")) && eq(r?.fireAt, T("2026-11-16T14:45")));
  const r2 = nf.nextFire({ startAt: T("2026-11-16T10:10"), repeat: "NONE", leadMinutes: 15 }, now);
  chk("P2-2", "ล่วงหน้าเลยมาแล้วแต่ยังไม่ถึงนัด → fireAt = now", eq(r2?.fireAt, now) && eq(r2?.occursAt, T("2026-11-16T10:10")));
  chk("P2-3", "NONE ผ่านแล้ว/เท่ากับ now = null", nf.nextFire({ startAt: T("2026-11-16T09:00"), repeat: "NONE" }, now) === null && nf.nextFire({ startAt: now, repeat: "NONE" }, now) === null);
  chk("P2-4", "NONE ยิงแล้ว (firedOccAt = startAt) = null", nf.nextFire({ startAt: T("2026-11-16T15:00"), repeat: "NONE", firedOccAt: T("2026-11-16T15:00") }, now) === null);
  const d = nf.nextFire({ startAt: T("2026-11-10T09:00"), repeat: "DAILY", firedOccAt: T("2026-11-17T09:00"), leadMinutes: 0 }, T("2026-11-17T08:50"));
  chk("P2-5", "DAILY ข้าม firedOccAt (ยิงล่วงหน้าแล้ว) → วันถัดไป", eq(d?.occursAt, T("2026-11-18T09:00")));
  const w = nf.nextFire({ startAt: T("2026-11-16T09:00"), repeat: "WEEKLY", repeatDays: [1] }, T("2026-11-30T09:00"));
  chk("P2-6", "WEEKLY ตรงเวลาพอดี (o = now) → สัปดาห์ถัดไปข้ามเดือน 7 ธ.ค.", eq(w?.occursAt, T("2026-12-07T09:00")));
  const m = nf.nextFire({ startAt: T("2027-01-31T10:00"), repeat: "MONTHLY", leadMinutes: 1440 }, T("2027-02-01T00:00"));
  chk("P2-7", "MONTHLY 31 → 28 ก.พ. · lead 1 วัน → 27 ก.พ.", eq(m?.occursAt, T("2027-02-28T10:00")) && eq(m?.fireAt, T("2027-02-27T10:00")));
  const ad = nf.nextFire({ startAt: T("2026-11-17T00:00"), allDay: true, repeat: "DAILY" }, T("2026-11-17T09:30"));
  chk("P2-8", "all-day DAILY หลัง 09:00 → พรุ่งนี้ 09:00", eq(ad?.occursAt, T("2026-11-18T09:00")));
}

console.log("── P3: schedule ──");
{
  const now = T("2026-11-16T10:00");
  const base = { startAt: T("2026-11-16T15:00"), repeat: "NONE", leadMinutes: 0, status: "OPEN", occursAt: T("2026-11-16T15:00"), firedOccAt: null, snoozeUntil: null, nagAt: null };
  chk("P3-1", "OPEN NONE อนาคต → nextFireAt = startAt", eq(nf.schedule(base, now).nextFireAt, T("2026-11-16T15:00")));
  chk("P3-2", "ไม่ OPEN (DRAFT/DONE) → nextFireAt null", nf.schedule({ ...base, status: "DRAFT" }, now).nextFireAt === null && nf.schedule({ ...base, status: "DONE" }, now).nextFireAt === null);
  chk("P3-3", "min(ปกติ, snoozeUntil, nagAt)", eq(nf.schedule({ ...base, snoozeUntil: T("2026-11-16T11:00"), nagAt: T("2026-11-16T12:00") }, now).nextFireAt, T("2026-11-16T11:00")) && eq(nf.schedule({ ...base, nagAt: T("2026-11-16T10:30") }, now).nextFireAt, T("2026-11-16T10:30")));
  const past = { ...base, startAt: T("2026-11-16T08:00"), occursAt: T("2026-11-16T08:00") };
  chk("P3-4", "NONE ผ่านแล้ว (นัดย้อนหลัง) → null · occursAt = startAt", nf.schedule(past, now).nextFireAt === null && eq(nf.schedule(past, now).occursAt, T("2026-11-16T08:00")));
  const rep = { ...base, startAt: T("2026-11-09T09:00"), repeat: "WEEKLY", repeatDays: [1], occursAt: T("2026-11-09T09:00") };
  const s = nf.schedule(rep, now);
  chk("P3-5", "ทำซ้ำ → occursAt = ครั้งถัดไป (23 พ.ย.)", eq(s.occursAt, T("2026-11-23T09:00")) && eq(s.nextFireAt, T("2026-11-23T09:00")));
  const adNone = { ...base, startAt: T("2026-11-17T00:00"), allDay: true, occursAt: T("2026-11-17T00:00") };
  chk("P3-6", "all-day NONE → occursAt 09:00 ของวัน", eq(nf.schedule(adNone, now).occursAt, T("2026-11-17T09:00")));
}

console.log("── P4: fireReason ──");
{
  const now = T("2026-11-16T10:00");
  const s = { startAt: T("2026-11-16T10:00"), repeat: "NONE", leadMinutes: 0, status: "OPEN", occursAt: T("2026-11-16T10:00"), firedOccAt: null, snoozeUntil: null, nagAt: null };
  chk("P4-1", "ถึงเวลา → DUE", nf.fireReason(s, now) === "DUE");
  chk("P4-2", "snooze ถึงด้วย → SNOOZE มาก่อน", nf.fireReason({ ...s, snoozeUntil: T("2026-11-16T09:59") }, now) === "SNOOZE");
  chk("P4-3", "ยิงแล้ว + nagAt ถึง → NAG", nf.fireReason({ ...s, firedOccAt: s.occursAt, nagAt: T("2026-11-16T09:59") }, now) === "NAG");
  chk("P4-4", "ไม่ถึงอะไร → null · ไม่ OPEN → null", nf.fireReason({ ...s, firedOccAt: s.occursAt, nagAt: T("2026-11-16T10:30") }, now) === null && nf.fireReason({ ...s, status: "DONE" }, now) === null && nf.fireReason({ ...s, occursAt: T("2026-11-16T11:00"), startAt: T("2026-11-16T11:00") }, now) === null);
  chk("P4-5", "lead 15: ถึงเวลาล่วงหน้า = DUE", nf.fireReason({ ...s, occursAt: T("2026-11-16T10:15"), startAt: T("2026-11-16T10:15"), leadMinutes: 15 }, now) === "DUE");
}

console.log("── P5: afterFire ──");
{
  const now = T("2026-11-16T10:00");
  const s = { startAt: T("2026-11-16T10:00"), repeat: "NONE", leadMinutes: 0, status: "OPEN", occursAt: T("2026-11-16T10:00"), firedOccAt: null, snoozeUntil: null, nagAt: null };
  const p = nf.afterFire(s, "DUE", now);
  chk("P5-1", "DUE NONE: firedOccAt=occ · nagAt=+30น. · nextFireAt=nag · attempts 0", eq(p.firedOccAt, s.occursAt) && eq(p.nagAt, T("2026-11-16T10:30")) && eq(p.nextFireAt, T("2026-11-16T10:30")) && p.fireAttempts === 0 && eq(p.lastFiredAt, now));
  const p2 = nf.afterFire({ ...s, ...p }, "NAG", T("2026-11-16T10:30"));
  chk("P5-2", "NAG: nagAt=null · nextFireAt=null (ย้ำครั้งเดียว)", p2.nagAt === null && p2.nextFireAt === null && nf.fireReason({ ...s, ...p, ...p2 }, T("2026-11-16T12:00")) === null);
  const rep = { ...s, startAt: T("2026-11-16T10:00"), repeat: "WEEKLY", repeatDays: [1] };
  const p3 = nf.afterFire(rep, "DUE", now);
  chk("P5-3", "DUE ทำซ้ำ: occursAt → สัปดาห์หน้า · ไม่ย้ำ · nextFireAt = ครั้งหน้า", eq(p3.occursAt, T("2026-11-23T10:00")) && p3.nagAt === null && eq(p3.nextFireAt, T("2026-11-23T10:00")) && eq(p3.firedOccAt, T("2026-11-16T10:00")));
  const sn = { ...s, firedOccAt: s.occursAt, snoozeUntil: T("2026-11-16T11:00") };
  const p4 = nf.afterFire(sn, "SNOOZE", T("2026-11-16T11:00"));
  chk("P5-4", "SNOOZE NONE: snoozeUntil=null · nagAt=+30น.", p4.snoozeUntil === null && eq(p4.nagAt, T("2026-11-16T11:30")) && eq(p4.nextFireAt, T("2026-11-16T11:30")));
  const p5 = nf.afterFire({ ...rep, firedOccAt: T("2026-11-16T10:00"), occursAt: T("2026-11-23T10:00"), snoozeUntil: T("2026-11-16T11:00") }, "SNOOZE", T("2026-11-16T11:00"));
  chk("P5-5", "SNOOZE ทำซ้ำ: ไม่ย้ำ · nextFireAt = ครั้งหน้า", p5.nagAt === null && eq(p5.nextFireAt, T("2026-11-23T10:00")) && eq(p5.occursAt, T("2026-11-23T10:00")));
  const out = nf.afterFire({ ...s, snoozeUntil: T("2026-11-16T09:00") }, "SNOOZE", now);
  chk("P5-6", "ระบบล่มแล้วกลับ: SNOOZE+DUE ถึงพร้อมกัน = 1 ครั้งครอบทั้งคู่", eq(out.firedOccAt, s.occursAt) && out.snoozeUntil === null && eq(out.nagAt, T("2026-11-16T10:30")));
  const early = nf.afterFire({ ...s, startAt: T("2026-11-16T15:00"), occursAt: T("2026-11-16T15:00"), snoozeUntil: now }, "SNOOZE", now);
  chk("P5-7", "เลื่อนก่อนถึงเวลาจริง: หลังส่ง SNOOZE ยังคงยิงครั้งปกติ 15:00", early.firedOccAt === null && eq(early.nextFireAt, T("2026-11-16T10:30")) && eq(early.occursAt, T("2026-11-16T15:00")));
}

console.log("── P6: snoozeTarget ──");
{
  const now = new Date(T("2026-11-16T10:20").getTime() + 37_000);
  chk("P6-1", "1h = now+60น. ตัดวินาที", eq(nf.snoozeTarget({ preset: "1h" }, now), T("2026-11-16T11:20")));
  chk("P6-2", "tomorrow9 ตอน 23:50 และ 00:10 ไทย → 09:00 ของวันไทยถัดไป", eq(nf.snoozeTarget({ preset: "tomorrow9" }, T("2026-11-16T23:50")), T("2026-11-17T09:00")) && eq(nf.snoozeTarget({ preset: "tomorrow9" }, T("2026-11-17T00:10")), T("2026-11-18T09:00")));
  chk("P6-3", "until: ≤ now+60วิ / > 1 ปี / NaN = null · ปกติ = ค่าเดิม", nf.snoozeTarget({ until: new Date(+now + 30_000) }, now) === null && nf.snoozeTarget({ until: new Date(+now + 366 * 86_400_000) }, now) === null && nf.snoozeTarget({ until: new Date("x") }, now) === null && eq(nf.snoozeTarget({ until: T("2026-11-20T09:00") }, now), T("2026-11-20T09:00")));
}

console.log("── P7: validateWhen (§5.3 ข้อความไทยตรงตัว) ──");
{
  const now = T("2026-11-16T10:00");
  const ok = { kind: "REMINDER", title: "โทรหาคุณเอก", startAt: T("2026-11-16T15:00"), repeat: "NONE", repeatDays: [], leadMinutes: 0 };
  const v = (o: AnyMod) => nf.validateWhen({ ...ok, ...o }, now);
  chk("P7-1", "ปกติ = null", v({}) === null);
  const past = v({ startAt: T("2026-11-16T09:59") });
  chk("P7-2", "REMINDER ผ่านแล้ว = 400 past_time + ข้อความ", past?.status === 400 && past?.code === "past_time" && past?.message === "เวลานี้ผ่านไปแล้ว — เลือกเวลาในอนาคต");
  chk("P7-3", "เผื่อ 30 วิ (เพิ่งผ่าน 20 วิ = ยอม)", v({ startAt: new Date(+now - 20_000) }) === null);
  chk("P7-4", "EVENT ผ่านแล้ว = ยอม (ย้อนหลัง)", v({ kind: "EVENT", startAt: T("2026-11-10T10:00"), endAt: T("2026-11-10T11:00") }) === null);
  chk("P7-5", "endAt ≤ startAt", v({ kind: "EVENT", endAt: T("2026-11-16T15:00") })?.message === "เวลาสิ้นสุดต้องหลังเวลาเริ่ม");
  chk("P7-6", "EVENT > 14 วัน / ไกล > 2 ปี", v({ kind: "EVENT", endAt: T("2026-12-01T15:01") })?.message === "ช่วงเวลานานเกินไป" && v({ startAt: T("2028-11-20T10:00") })?.message === "ตั้งล่วงหน้าได้ไม่เกิน 2 ปี");
  chk("P7-7", "title ว่าง/ยาว 201 · note > 2000", v({ title: "  " })?.message === "ใส่เรื่องที่จะเตือน (ไม่เกิน 200 ตัวอักษร)" && v({ title: "ก".repeat(201) })?.code === "invalid" && v({ title: "ก".repeat(200) }) === null && thai(v({ note: "x".repeat(2001) })?.message));
  chk("P7-8", "repeatDays นอก 0..6 / repeat ≠ WEEKLY / ซ้ำ", v({ repeat: "WEEKLY", repeatDays: [7] })?.message === "วันที่ทำซ้ำไม่ถูกต้อง" && v({ repeat: "DAILY", repeatDays: [1] })?.message === "วันที่ทำซ้ำไม่ถูกต้อง" && v({ repeat: "WEEKLY", repeatDays: [1, 1] })?.message === "วันที่ทำซ้ำไม่ถูกต้อง" && v({ repeat: "WEEKLY", repeatDays: [1.5] }) !== null && v({ repeat: "WEEKLY", repeatDays: [0, 6] }) === null);
  chk("P7-9", "leadMinutes นอกชุด", v({ leadMinutes: 7 })?.message === "เวลาเตือนล่วงหน้าไม่ถูกต้อง" && v({ leadMinutes: 1440 }) === null);
  chk("P7-10", "REMINDER มี endAt = 400 · วันเวลาเสีย = 400", thai(v({ endAt: T("2026-11-16T16:00") })?.message) && thai(v({ startAt: new Date("x") })?.message) && thai(v({ kind: "EVENT", endAt: new Date("x") })?.message));
  chk("P7-11", "REMINDER ทำซ้ำที่ startAt ผ่านแล้ว = ยอม (มีครั้งถัดไป)", v({ startAt: T("2026-11-09T09:00"), repeat: "WEEKLY", repeatDays: [1] }) === null);
}

console.log("── P8: ตัวช่วยวัน ──");
{
  chk("P8-1", "ymdToDayNo ↔ dayNoToYmd · วันไม่มีจริง/รูปผิด = null", nf.dayNoToYmd(nf.ymdToDayNo("2026-11-16")) === "2026-11-16" && nf.ymdToDayNo("2026-02-30") === null && nf.ymdToDayNo("2026-1-1") === null);
  chk("P8-2", "weekdayOf(16 พ.ย. 2569) = 1 (จันทร์) · bkkDayNo ใช้วันไทย", nf.weekdayOf(nf.ymdToDayNo("2026-11-16")) === 1 && nf.bkkDayNo(T("2026-11-16T00:30")) === nf.ymdToDayNo("2026-11-16"));
}

console.log("── P9: กิ่งขอบ (ค่าที่ไม่ส่ง/ข้อมูลเพี้ยน) ──");
{
  const now = T("2026-11-16T10:00");
  const junk = { startAt: T("2026-11-09T09:00"), repeat: "WEEKLY", repeatDays: [9], status: "OPEN", occursAt: T("2026-11-09T09:00") };
  chk("P9-1", "WEEKLY repeatDays เพี้ยน (ไม่มีวันตรง) → nextFire null · schedule คง occursAt เดิม", nf.nextFire(junk, now) === null && eq(nf.schedule(junk, now).occursAt, T("2026-11-09T09:00")) && nf.schedule(junk, now).nextFireAt === null);
  const noLead = { startAt: T("2026-11-16T10:00"), repeat: "DAILY", status: "OPEN", occursAt: T("2026-11-16T10:00") };
  chk("P9-2", "ไม่ส่ง leadMinutes = 0 (fireReason/afterFire)", nf.fireReason(noLead, now) === "DUE" && eq(nf.afterFire(noLead, "DUE", now).nextFireAt, T("2026-11-17T10:00")));
  const fut = nf.afterFire({ ...noLead, repeat: "NONE", snoozeUntil: T("2026-11-16T12:00") }, "DUE", now);
  chk("P9-3", "DUE ขณะมีเลื่อนในอนาคต: คง snoozeUntil · nextFireAt = min(nag, snooze)", eq(fut.snoozeUntil, T("2026-11-16T12:00")) && eq(fut.nextFireAt, T("2026-11-16T10:30")));
  chk("P9-4", "validateWhen ไม่ส่ง title/repeatDays", nf.validateWhen({ kind: "REMINDER", startAt: T("2026-11-16T11:00"), repeat: "NONE", leadMinutes: 0 }, now)?.message === "ใส่เรื่องที่จะเตือน (ไม่เกิน 200 ตัวอักษร)" && nf.validateWhen({ kind: "REMINDER", title: "x", startAt: T("2026-11-16T11:00"), repeat: "NONE", leadMinutes: 0 }, now) === null);
}

if (PURE_ONLY) finish(LABEL, { pureOnly: true });

// ═══════════ D: items.ts บนฐาน QC ═══════════
const { prisma } = (await import("@/lib/core/db")) as AnyMod;
const items = (await import("@/lib/modules/calendar/items")) as AnyMod;
const OWNER_M = { role: "OWNER", unitAccess: ["*"], permissions: {} };
const STAFF_M = { role: "STAFF", unitAccess: ["*"], permissions: {} };
const fx = await makeFixture(prisma, "qccal12", { a: { role: "OWNER" }, b: { role: "STAFF" } }, 2);
const [t1, t2] = fx.tids;
const A = { userId: fx.U.a, tenantId: t1, membership: OWNER_M };
const A2 = { userId: fx.U.a, tenantId: t2, membership: OWNER_M };
const B = { userId: fx.U.b, tenantId: t1, membership: STAFF_M };
const seedMade: string[] = [];
const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as AnyMod; } };
const now = new Date();
const H = 3_600_000;
let residue = -1;
try {
  console.log("── D1: สร้าง ──");
  const r1 = await items.createItem(A, { kind: "REMINDER", title: "  โทรหาคุณเอก  ", startAt: new Date(+now + 2 * H) }, { now });
  const row1 = await prisma.calItem.findUnique({ where: { id: r1.id } });
  chk("D1-1", "สร้าง REMINDER: OPEN · ตัดช่องว่าง · occursAt=startAt · nextFireAt=startAt · lead 0 · source APP · version 0", r1.status === "OPEN" && r1.title === "โทรหาคุณเอก" && eq(row1.nextFireAt, new Date(+now + 2 * H)) && eq(row1.occursAt, row1.startAt) && row1.leadMinutes === 0 && row1.source === "APP" && row1.version === 0 && row1.userId === fx.U.a && row1.tenantId === t1);
  chk("D1-2", "DTO ไม่มี lease/version/externalId/etag · exported=false", !("version" in r1) && !("leaseToken" in r1) && !("externalId" in r1) && r1.exported === false);
  const ev = await items.createItem(A, { kind: "EVENT", title: "ประชุมธนาคาร", startAt: new Date(+now + 26 * H), endAt: new Date(+now + 27 * H) }, { now });
  chk("D1-3", "EVENT ค่าเริ่ม lead 15 → nextFireAt = start−15น.", ev.leadMinutes === 15 && eq(new Date(ev.nextFireAt), new Date(+now + 26 * H - 15 * MIN)));
  const back = await items.createItem(A, { kind: "EVENT", title: "นัดย้อนหลัง", startAt: new Date(+now - 5 * H), endAt: new Date(+now - 4 * H) }, { now });
  chk("D1-4", "EVENT ย้อนหลัง = ยอม · nextFireAt null", back.status === "OPEN" && back.nextFireAt === null);
  const ep = await err(items.createItem(A, { kind: "REMINDER", title: "x", startAt: new Date(+now - H) }, { now }));
  chk("D1-5", "REMINDER อดีต = CalError 400 past_time ไทย", ep?.name === "CalError" && ep.status === 400 && ep.code === "past_time" && ep.message === "เวลานี้ผ่านไปแล้ว — เลือกเวลาในอนาคต");
  const chat = await items.createItem(A, { kind: "REMINDER", title: "จากแชท", startAt: new Date(+now + H) }, { now, source: "CHAT", roomId: "room-1" });
  const app = await items.createItem(A, { kind: "REMINDER", title: "จากแอป", startAt: new Date(+now + H) }, { now, roomId: "room-1" });
  chk("D1-6", "roomId เก็บเฉพาะ source CHAT", chat.roomId === "room-1" && chat.source === "CHAT" && app.roomId === null);

  console.log("── D2: M3 ของคนอื่น = 404 ──");
  const ops = [
    () => items.getItem(B, r1.id), () => items.updateItem(B, r1.id, { title: "แฮก" }, now), () => items.cancelItem(B, r1.id, now),
    () => items.markDone(B, r1.id, { now }), () => items.snooze(B, r1.id, { preset: "1h" }, now), () => items.reopen(B, r1.id, now),
    () => items.confirmItem(B, r1.id, now), () => items.getItem(A2, r1.id),
  ];
  const codes = [] as string[];
  for (const op of ops) { const e = await err(op()); codes.push(`${e?.status}:${e?.code}`); }
  chk("D2-1", "ผู้ใช้ B (ร้านเดียวกัน) ทุกคำสั่งกับของ A = 404 not_found · A คนเดิมต่างร้าน = 404", codes.every((c) => c === "404:not_found"), codes.join(","));
  chk("D2-2", "ของ A ไม่เปลี่ยน (B แก้ไม่ได้)", (await prisma.calItem.findUnique({ where: { id: r1.id } })).title === "โทรหาคุณเอก");
  const lb = await items.listItems(B, { tab: "today" }, now);
  const la2 = await items.listItems(A2, { tab: "today" }, now);
  chk("D2-3", "รายการของ B / ของ A ในร้านอื่น ไม่เห็นของ A ร้านนี้", lb.items.length === 0 && la2.items.length === 0);
  chk("D2-4", "roomReminders เฉพาะของผู้เรียก", (await items.roomReminders(A, "room-1")).length === 1 && (await items.roomReminders(B, "room-1")).length === 0);

  console.log("── D3: แก้ ──");
  const u1 = await items.updateItem(A, r1.id, { title: "โทรหาคุณเอก (แก้)" }, now);
  const row1b = await prisma.calItem.findUnique({ where: { id: r1.id } });
  chk("D3-1", "แก้ชื่อ: version+1 · ตารางยิงเดิม", u1.title === "โทรหาคุณเอก (แก้)" && row1b.version === 1 && eq(row1b.nextFireAt, row1.nextFireAt));
  const u2 = await items.updateItem(A, r1.id, { startAt: new Date(+now + 3 * H), leadMinutes: 30 }, now);
  chk("D3-2", "แก้เวลา: คำนวณใหม่ (start−30น.)", eq(new Date(u2.nextFireAt), new Date(+now + 3 * H - 30 * MIN)) && eq(new Date(u2.occursAt), new Date(+now + 3 * H)));
  const e3 = await err(items.updateItem(A, r1.id, { startAt: new Date(+now - H) }, now));
  chk("D3-3", "แก้เป็นเวลาที่ผ่านแล้ว = 400 past_time", e3?.status === 400 && e3?.code === "past_time");
  const e4 = await err(items.updateItem(A, r1.id, { title: "" }, now));
  chk("D3-4", "แก้ชื่อว่าง = 400 ไทย", e4?.status === 400 && thai(e4?.message));
  // ยิงแล้วรอย้ำ (occursAt ผ่าน) → แก้ชื่อได้ ไม่ติด past_time
  await prisma.calItem.update({ where: { id: chat.id }, data: { startAt: new Date(+now - 5 * MIN), occursAt: new Date(+now - 5 * MIN), firedOccAt: new Date(+now - 5 * MIN), nagAt: new Date(+now + 25 * MIN), nextFireAt: new Date(+now + 25 * MIN) } });
  const u5 = await items.updateItem(A, chat.id, { title: "จากแชท (แก้)" }, now);
  chk("D3-5", "แก้ชื่อของเตือนที่ยิงแล้ว (รอย้ำ) ไม่ติด past_time · nagAt คง", u5.title === "จากแชท (แก้)" && eq(new Date(u5.nextFireAt), new Date(+now + 25 * MIN)));
  const evToRem = await items.updateItem(A, ev.id, { kind: "REMINDER", leadMinutes: 0 }, now);
  chk("D3-6", "EVENT → REMINDER: endAt ล้างเอง", evToRem.kind === "REMINDER" && evToRem.endAt === null);

  console.log("── D4: เสร็จ/เปิดใหม่ ──");
  const d1 = await items.markDone(A, r1.id, { now });
  const d1b = await items.markDone(A, r1.id, { now });
  chk("D4-1", "markDone NONE → DONE · nextFireAt null · ซ้ำ = ค่าเดิม", d1.status === "DONE" && d1.nextFireAt === null && d1b.status === "DONE" && d1b.updatedAt === d1.updatedAt);
  const ro = await items.reopen(A, r1.id, now);
  chk("D4-2", "reopen → OPEN + nextFireAt คำนวณใหม่", ro.status === "OPEN" && ro.doneAt === null && !!ro.nextFireAt);
  const wk = await items.createItem(A, { kind: "REMINDER", title: "เช็กสต็อก", startAt: new Date(+now + H), repeat: "WEEKLY" }, { now });
  const e5 = await err(items.reopen(A, wk.id, now));
  chk("D4-3", "reopen ของทำซ้ำ = 409 ไทย", e5?.status === 409 && e5?.message === "รายการทำซ้ำติ๊กออกไม่ได้");
  const wd = await items.markDone(A, wk.id, { occ: new Date(wk.occursAt), now });
  chk("D4-4", "ทำซ้ำ: ติ๊กครั้งที่ยังไม่ยิง → occursAt +7 วัน · ยัง OPEN", wd.status === "OPEN" && +new Date(wd.occursAt) - +new Date(wk.occursAt) === 7 * 24 * H);
  const wd2 = await items.markDone(A, wk.id, { occ: new Date(wk.occursAt), now });
  chk("D4-5", "ติ๊กซ้ำ occ เดิม = ค่าเดิม (idempotent)", wd2.occursAt === wd.occursAt && wd2.updatedAt === wd.updatedAt);
  const e6 = await err(items.markDone(A, wk.id, { occ: new Date(+new Date(wd.occursAt) + 7 * 24 * H), now }));
  chk("D4-6", "ติ๊กครั้งที่ไกลกว่าครั้งถัดไป = 400 ไทย", e6?.status === 400 && thai(e6?.message));
  await prisma.calItem.update({ where: { id: wk.id }, data: { nagAt: new Date(+now + 10 * MIN), snoozeUntil: new Date(+now + 20 * MIN) } });
  const wd3 = await items.markDone(A, wk.id, { occ: new Date(wk.occursAt), now });
  chk("D4-7", "ติ๊กครั้งที่ยิงแล้ว (occ < occursAt) → ล้าง snooze/nag เท่านั้น", wd3.snoozeUntil === null && wd3.occursAt === wd.occursAt && eq(new Date(wd3.nextFireAt), new Date(wd.occursAt)));

  console.log("── D5: เลื่อน ──");
  const sn = await items.snooze(A, r1.id, { preset: "1h" }, now);
  chk("D5-1", "snooze 1h → snoozeUntil · nextFireAt = min(snooze, ปกติ)", eq(new Date(sn.snoozeUntil), new Date(Math.floor((+now + H) / MIN) * MIN)) && eq(new Date(sn.nextFireAt), new Date(Math.floor((+now + H) / MIN) * MIN)));
  const e7 = await err(items.snooze(A, r1.id, { until: new Date(+now + 10_000) }, now));
  chk("D5-2", "snooze until ใกล้เกิน = 400 ข้อความ §5.4", e7?.status === 400 && e7?.message === "เลือกเวลาเลื่อนในอนาคต (ไม่เกิน 1 ปี)");

  console.log("── D6: ยกเลิก ──");
  const c1 = await items.cancelItem(A, r1.id, now);
  const c2 = await items.cancelItem(A, r1.id, now);
  const rowc = await prisma.calItem.findUnique({ where: { id: r1.id } });
  chk("D6-1", "cancel → CANCELLED · nextFireAt null · ซ้ำได้", c1.ok && c2.ok && rowc.status === "CANCELLED" && rowc.nextFireAt === null && !!rowc.cancelledAt);
  const e8 = await err(items.updateItem(A, r1.id, { title: "x" }, now));
  const e9 = await err(items.snooze(A, r1.id, { preset: "1h" }, now));
  const e10 = await err(items.markDone(A, r1.id, { now }));
  chk("D6-2", "ปิดแล้ว: แก้/เลื่อน/เสร็จ = 409 closed ไทย", [e8, e9, e10].every((e) => e?.status === 409 && e?.code === "closed" && e?.message === "รายการนี้ปิดไปแล้ว"));

  console.log("── D7: DRAFT (R-CAL-28) ──");
  const dr = await items.createItem(A, { kind: "REMINDER", title: "จ่ายค่าเช่าท่าเรือ", startAt: new Date(+now + 48 * H), repeat: "MONTHLY" }, { now, draft: true, source: "CHAT", roomId: "room-2" });
  chk("D7-1", "DRAFT: nextFireAt null", dr.status === "DRAFT" && dr.nextFireAt === null);
  const cf = await items.confirmItem(A, dr.id, now);
  const cf2 = await items.confirmItem(A, dr.id, now);
  chk("D7-2", "confirm → OPEN + nextFireAt · ซ้ำ = 200", cf.status === "OPEN" && !!cf.nextFireAt && cf2.status === "OPEN");
  const dr2 = await items.createItem(A, { kind: "REMINDER", title: "เก่า", startAt: new Date(+now + 48 * H), repeat: "DAILY" }, { now, draft: true });
  await prisma.calItem.update({ where: { id: dr2.id }, data: { createdAt: new Date(+now - 25 * H) } });
  const e11 = await err(items.confirmItem(A, dr2.id, now));
  chk("D7-3", "DRAFT > 24 ชม. = 410 expired ไทย", e11?.status === 410 && e11?.code === "expired" && e11?.message === "ข้อเสนอนี้หมดอายุแล้ว — สั่งเลขาใหม่");
  const e12 = await err(items.markDone(A, dr2.id, { now }));
  chk("D7-4", "DRAFT ติ๊กเสร็จ = 409", e12?.status === 409);

  console.log("── D8: link ตามสิทธิ์ (seed calqc) ──");
  const SEED_OWNER = { userId: "calqc-owner", tenantId: "calqc-tenant", membership: OWNER_M };
  const SEED_NEW_M = await prisma.membership.findFirst({ where: { userId: "calqc-staff-new", tenantId: "calqc-tenant" } });
  if (!SEED_NEW_M) chk("D8-0", "มี seed calqc (รัน seed-calendar-qc ก่อน)", false);
  else {
    const NEW = { userId: "calqc-staff-new", tenantId: "calqc-tenant", membership: { role: SEED_NEW_M.role, unitAccess: SEED_NEW_M.unitAccess, permissions: SEED_NEW_M.permissions } };
    const l1 = await items.createItem(SEED_OWNER, { kind: "REMINDER", title: "qc-cal-1.2 link", startAt: new Date(+now + H), link: { type: "ACCOUNT_DOC", id: "calqc-inv-ocean" } }, { now });
    seedMade.push(l1.id);
    chk("D8-1", "เจ้าของผูกใบแจ้งหนี้ได้ · link.label/systemId", l1.link?.type === "ACCOUNT_DOC" && !!l1.link?.systemId && /Ocean Tour/.test(l1.link?.label ?? ""), JSON.stringify(l1.link));
    const l2 = await items.createItem(SEED_OWNER, { kind: "REMINDER", title: "qc-cal-1.2 card", startAt: new Date(+now + H), link: { type: "KANBAN_CARD", id: "calqc-card-boat" } }, { now });
    seedMade.push(l2.id);
    const l3 = await items.createItem(SEED_OWNER, { kind: "REMINDER", title: "qc-cal-1.2 contact", startAt: new Date(+now + H), link: { type: "CRM_CONTACT", id: "calqc-crm-contact-ek" } }, { now });
    seedMade.push(l3.id);
    const det = await items.getItem(SEED_OWNER, l3.id);
    chk("D8-2", "ผูกการ์ด/ผู้ติดต่อ CRM ได้ · getItem คืน phone ของลูกค้าที่ผูก", l2.link?.label?.includes("(การ์ด)") && l3.link?.label?.includes("(CRM)") && typeof det.phone === "string" && det.phone.length > 5, JSON.stringify({ l2: l2.link, l3: l3.link, phone: det.phone }));
    const e13 = await err(items.createItem(NEW, { kind: "REMINDER", title: "x", startAt: new Date(+now + H), link: { type: "ACCOUNT_DOC", id: "calqc-inv-ocean" } }, { now }));
    chk("D8-3", "ครูนิว (ไม่มีสิทธิ์บัญชี) ผูกใบแจ้งหนี้ = 404 link_not_found ไทย", e13?.status === 404 && e13?.code === "link_not_found" && e13?.message === "ไม่พบรายการที่จะผูก หรือคุณยังไม่มีสิทธิ์เห็น");
    const e14 = await err(items.createItem(SEED_OWNER, { kind: "REMINDER", title: "x", startAt: new Date(+now + H), link: { type: "CRM_DEAL", id: "no-such-deal" } }, { now }));
    chk("D8-4", "id ที่ไม่มีจริง = 404 link_not_found", e14?.code === "link_not_found");
    const un = await items.updateItem(SEED_OWNER, l1.id, { link: null }, now);
    chk("D8-5", "ถอดผูก (link:null)", un.link === null);
  }

  console.log("── D9: เพดาน + แท็บ + cursor ──");
  const many = Array.from({ length: 498 }, (_, i) => ({ userId: fx.U.b, tenantId: t1, title: `x${i}`, startAt: new Date(+now + 30 * 24 * H), occursAt: new Date(+now + 30 * 24 * H + i * MIN) }));
  await prisma.calItem.createMany({ data: many });
  await items.createItem(B, { kind: "REMINDER", title: "499", startAt: new Date(+now + H) }, { now });
  await items.createItem(B, { kind: "REMINDER", title: "500", startAt: new Date(+now + H) }, { now });
  const e15 = await err(items.createItem(B, { kind: "REMINDER", title: "501", startAt: new Date(+now + H) }, { now }));
  chk("D9-1", "OPEN ครบ 500 → 409 limit ไทย", e15?.status === 409 && e15?.code === "limit" && thai(e15?.message));
  const all: AnyMod[] = [];
  let cursor: string | undefined = undefined;
  let pages = 0;
  do {
    const pg: AnyMod = await items.listItems(B, { tab: "upcoming", take: 100, before: cursor }, now);
    all.push(...pg.items); cursor = pg.nextBefore; pages++;
  } while (cursor && pages < 20);
  const tomorrowStart = new Date((Math.floor((+now + 7 * H) / (24 * H)) + 1) * 24 * H - 7 * H);
  const expect = await prisma.calItem.count({ where: { userId: fx.U.b, tenantId: t1, status: { in: ["OPEN", "DRAFT"] }, occursAt: { gte: tomorrowStart } } });
  const ids = new Set(all.map((i) => i.id));
  chk("D9-2", "upcoming แบ่งหน้า (take ≤100): ครบไม่ซ้ำ · เรียง occursAt", ids.size === all.length && all.length === expect && expect >= 498 && pages >= 5 && all.every((x, i, a) => i === 0 || x.occursAt >= a[i - 1].occursAt), `${all.length}/${expect} pages=${pages}`);
  const td = await items.listItems(A, { tab: "today" }, now);
  const dn = await items.listItems(A, { tab: "done" }, now);
  chk("D9-3", "today = OPEN ก่อนพรุ่งนี้ (รวมเลยเวลา) · done = DONE", td.items.every((x: AnyMod) => x.status === "OPEN") && dn.items.every((x: AnyMod) => x.status === "DONE"), `${td.items.length}/${dn.items.length}`);
  const e16 = await err(items.listItems(A, { tab: "done", before: "bad" }, now));
  chk("D9-4", "cursor เสีย = 400 ไทย", e16?.status === 400 && thai(e16?.message));

  console.log("── D10: ออกจากร้าน ──");
  await items.purgeMemberCalendar({ userId: fx.U.b, tenantId: t1 });
  chk("D10-1", "purgeMemberCalendar ลบเฉพาะ (ผู้ใช้,ร้าน) นั้น", (await prisma.calItem.count({ where: { userId: fx.U.b } })) === 0 && (await prisma.calItem.count({ where: { userId: fx.U.a, tenantId: t1 } })) > 0);
  const lv = readFileSync(join(ROOT, "src/lib/staff/levels.ts"), "utf8");
  chk("D10-2", "removeStaff เรียก purgeMemberCalendar", /export async function removeStaff[\s\S]*?purgeMemberCalendar\(\{ userId, tenantId: ctx\.tenantId \}\)/.test(lv));
} catch (e) {
  chk("CRASH", "ข้อสอบรันจบ", false, errMsg(e));
} finally {
  try { await prisma.calItem.deleteMany({ where: { id: { in: seedMade }, userId: "calqc-owner" } }); } catch { /* */ }
  residue = await fx.cleanup();
}

console.log("── S1: โครงสร้าง M3 ──");
{
  const src = readFileSync(join(ROOT, "src/lib/modules/calendar/items.ts"), "utf8");
  const calls = [...src.matchAll(/\.cal(Item|Pref|Link|ExternalEvent)\.(\w+)\(\{([\s\S]*?)\n?\s*\}\)/g)];
  const bad = calls.filter((m) => /where:/.test(m[3]!) && !/where:\s*\{[^}]*userId/.test(m[3]!)).map((m) => `${m[1]}.${m[2]}`);
  chk("S1-1", "ทุก query CAL ใน items.ts มี userId ตรงตัวใน where (ยกเว้น create ที่ใส่ userId จาก actor)", calls.length >= 8 && bad.length === 0, `${calls.length} calls · bad=${bad.join(",")}`);
  const sig = [...src.matchAll(/export async function (\w+)\(([^)]*)\)/g)];
  const withUser = sig.filter((m) => /\buserId\b/.test(m[2]!) && m[1] !== "purgeMemberCalendar").map((m) => m[1]);
  chk("S1-2", "ฟังก์ชัน export รับ actor ไม่รับ userId (ยกเว้น purgeMemberCalendar ที่ด่าน removeStaff เรียก)", sig.length >= 10 && withUser.length === 0, withUser.join(","));
  chk("S1-3", "items.ts ไม่ log title/note", !/logOps\([^)]*(title|note)/.test(src));
}
chk("Z-1", "residue 0", residue === 0, String(residue));
await prisma.$disconnect().catch(() => undefined);
finish(LABEL, { residue });
