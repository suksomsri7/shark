// QC — CAL1.9 conflicts.ts นัดชน (สัญญา §11 · R-CAL-35) — บริสุทธิ์ล้วน (ไม่แตะฐาน) · fixture ชุดนี้ใช้ซ้ำฝั่งแอป (CAL2.12)
// รัน: pnpm exec tsx scripts/qc-cal-1.9.mts  (ครอบคลุม: node --import tsx --test --experimental-test-coverage scripts/qc-cal-1.9.mts)
import { createHash } from "node:crypto";
import { chk, finish, type AnyMod } from "./qc-cal-lib.mjs";

const LABEL = "qc-cal-1.9";
const cf = (await import("@/lib/modules/calendar/conflicts")) as AnyMod;
const T = (hm: string, day = "2026-11-17") => new Date(`${day}T${hm}:00+07:00`).toISOString();
const it = (id: string, source: string, s: string, e: string | null, o: AnyMod = {}) => ({ id, source, title: o.title ?? id, sub: o.sub ?? null, label: "", startAt: T(s), ...(e ? { endAt: T(e) } : {}), allDay: !!o.allDay, timeHint: null, deepLink: null, checkable: false, done: !!o.done, mine: o.mine ?? true, colorKey: "personal" });
const NOW = new Date(T("08:00"));

chk("C1", "ว่าง = ไม่มีอะไร", JSON.stringify(cf.conflicts([], 0, NOW)) === JSON.stringify({ byId: {}, notes: [] }));
{
  const base = it("x", "event", "12:00", "13:00");
  const ex = [
    it("notmine", "booking", "12:10", "12:50", { mine: false }),
    it("allday", "event", "12:10", "12:50", { allDay: true }),
    it("done", "crm", "12:10", "12:50", { done: true }),
    it("noend", "event", "12:10", null),
    it("backwards", "event", "12:50", "12:10"),
    it("rem", "reminder", "12:10", "12:50"),
    it("kan", "kanban", "12:10", "12:50"),
    it("tax", "tax", "12:10", "12:50"),
    it("acc", "account", "12:10", "12:50"),
    { ...it("bad", "event", "12:10", "12:50"), startAt: "not-a-date" },
  ];
  const r = cf.conflicts([base, ...ex], 0, NOW);
  chk("C2", "ไม่นับ: ไม่ใช่ของฉัน/ทั้งวัน/เสร็จ/ไม่มี endAt/end≤start/reminder/kanban/tax/บัญชี/วันที่เสีย", r.notes.length === 0 && Object.keys(r.byId).length === 0, JSON.stringify(r));
}
{
  // seed จอ 10: นัดลูกค้าครูนิว 12:00–14:00 ทับนัดส่วนตัว 12:30–13:30
  const a = it("booking:appt-1", "booking", "12:00", "14:00", { title: "ดำน้ำลองเรียน · คุณมาลี" });
  const b = it("event:den", "event", "12:30", "13:30", { title: "ไปหาหมอฟัน" });
  const r = cf.conflicts([b, a], 0, NOW);
  const n = r.notes[0];
  chk("C3-1", "OVERLAP: byId ทั้งสองทิศ · earlier = เริ่มก่อน", JSON.stringify(r.byId) === JSON.stringify({ "booking:appt-1": ["event:den"], "event:den": ["booking:appt-1"] }) && r.notes.length === 1 && n.kind === "OVERLAP" && n.earlierId === "booking:appt-1" && n.laterId === "event:den");
  chk("C3-2", "ข้อความ + เสนอเตือน 12:15 (12:30 − 15 นาที)", n.text === "⚠️ 12:30 ไปหาหมอฟัน ชนกับ ดำน้ำลองเรียน · คุณมาลี (12:00–14:00) · อยากให้ผมเตือนตอน 12:15 ไหมครับ" && n.suggestRemindAt === T("12:15"), n.text);
  chk("C3-3", "key = sha1(earlierId|laterId)", n.key === createHash("sha1").update("booking:appt-1|event:den").digest("hex") && cf.conflictKey("a", "b") !== cf.conflictKey("b", "a"));
}
{
  const a = it("a", "crm", "11:00", "12:00", { sub: "ออฟฟิศลูกค้า" });
  const b = it("b", "google", "12:00", "13:00", { title: "ประชุมธนาคาร" });
  chk("C4-1", "ต่อกันพอดี + travel 0 = ไม่ชน", cf.conflicts([a, b], 0, NOW).notes.length === 0);
  const r = cf.conflicts([a, b], 45, NOW);
  chk("C4-2", "ต่อกันพอดี + travel 45 = TIGHT · ข้อความเวลาเดินทางจาก<sub> · เตือนออก 11:15", r.notes[0]?.kind === "TIGHT" && r.notes[0].text === "⚠️ 12:00 ประชุมธนาคาร ชนกับเวลาเดินทางจากออฟฟิศลูกค้า (เลิก 12:00) · อยากให้ผมเตือนออกตอน 11:15 ไหมครับ" && r.notes[0].suggestRemindAt === T("11:15"), r.notes[0]?.text);
  const ov = cf.conflicts([it("p", "event", "12:00", "12:30"), { ...it("q", "event", "12:29", "13:00"), startAt: new Date(Date.parse(T("12:29")) + 30_000).toISOString() }], 0, NOW);
  chk("C5", "ทับกัน 30 วิ (< 1 นาที) = ไม่ชน", ov.notes.length === 0 && Object.keys(ov.byId).length === 0);
}
{
  const a = it("a", "event", "10:00", "12:30", { title: "ประชุมที่สีลม" });
  const b = it("b", "event", "13:00", "14:00", { title: "ประชุมธนาคาร" });
  const r = cf.conflicts([a, b], 45, NOW);
  chk("C6-1", "ห่าง 30 < เดินทาง 45 = TIGHT · sub ว่าง → ใช้ชื่อ · เสนอ 12:15 (13:00 − 45)", r.notes[0]?.kind === "TIGHT" && r.notes[0].text.includes("ชนกับเวลาเดินทางจากประชุมที่สีลม (เลิก 12:30)") && r.notes[0].suggestRemindAt === T("12:15"), r.notes[0]?.text);
  chk("C6-2", "ห่าง 30 = เดินทาง 30 พอดี = ไม่ชน", cf.conflicts([a, b], 30, NOW).notes.length === 0);
  chk("C6-3", "เดินทางติดลบ = 0", cf.conflicts([a, b], -10, NOW).notes.length === 0);
}
{
  const a = it("a", "event", "07:00", "09:00", { title: "A" });
  const b = it("b", "event", "07:30", "08:30", { title: "B" });
  const r = cf.conflicts([a, b], 0, NOW);
  chk("C7", "คู่ที่เริ่มแล้ว (b.start ≤ now) = ไม่เสนอเตือน · ไม่มีประโยคถาม", r.notes[0]?.suggestRemindAt === null && r.notes[0]?.text === "⚠️ 07:30 B ชนกับ A (07:00–09:00)");
  const soon = cf.conflicts([it("c", "event", "08:00", "09:00"), it("d", "event", "08:05", "08:30")], 0, new Date(Date.parse(T("07:59")) + 20_000));
  chk("C8", "เสนอเตือนไม่ก่อน now+1 นาที (ปัดขึ้นนาที)", soon.notes[0]?.suggestRemindAt === T("08:01"), soon.notes[0]?.suggestRemindAt);
  chk("C8-2", "suggestRemindAt: เดินทาง > 15 ใช้เดินทาง · ปัดลง 5 นาที", cf.suggestRemindAt(Date.parse(T("13:07")), 0, NOW) === T("12:50") && cf.suggestRemindAt(Date.parse(T("13:07")), 40, NOW) === T("12:25"));
}
{
  // a ยาวครอบ b และ c · b กับ c ไม่ชนกัน → byId a:[b,c] · note เฉพาะคู่ติดกัน (a,b)
  const a = it("a", "event", "10:00", "14:00");
  const b = it("b", "booking", "11:00", "12:00");
  const c = it("c", "crm", "13:00", "15:00");
  const r = cf.conflicts([c, a, b], 0, NOW);
  chk("C9", "หลายคู่: byId ครบทุกคู่ · notes 1 ต่อคู่ติดกันตามเวลา", JSON.stringify(r.byId.a) === JSON.stringify(["b", "c"]) && JSON.stringify(r.byId.b) === JSON.stringify(["a"]) && JSON.stringify(r.byId.c) === JSON.stringify(["a"]) && r.notes.length === 1 && r.notes[0].earlierId === "a" && r.notes[0].laterId === "b");
  const same = cf.conflicts([it("z", "event", "10:00", "11:00"), it("y", "device", "10:00", "11:00")], 0, NOW);
  chk("C10", "เริ่มพร้อมกัน → เรียงตาม id (y ก่อน z)", same.notes[0]?.earlierId === "y" && same.notes[0]?.laterId === "z");
  const tie = cf.conflicts([it("m", "event", "10:00", "11:00"), it("m2", "event", "10:00", "11:00"), it("m", "google", "10:00", "11:00")], 0, NOW);
  chk("C11", "id ซ้ำไม่ใส่ซ้ำใน byId · เรียงคงที่", (tie.byId.m ?? []).filter((x: string) => x === "m2").length === 1);
}
finish(LABEL);
