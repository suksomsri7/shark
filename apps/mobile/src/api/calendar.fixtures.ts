// ข้อมูลตัวอย่างของปฏิทินเลขา (CAL2.x · ก่อนเส้น CAL1.6 ขึ้น) — ใช้เฉพาะ dev/QC (ดู CAL_FIXTURE_ALLOWED ใน calendar.ts)
// เนื้อหาตามภาพแบบที่อนุมัติ /root/mockups/secretary-calendar/cal-{1,2,3}.png (จอ 2/3/4/8/9/10) · วันยึด = "วันนี้" ของเครื่อง
//   (QC ปักนาฬิกาที่ 16 พ.ย. 2569 08:05 ⇒ ตรงภาพ) · แก้ไข/ติ๊ก/ลบ/เพิ่ม ได้ในหน่วยความจำ (หายเมื่อเปิดแอปใหม่)
// ไม่มีข้อมูลจริงของลูกค้า · ชื่อทั้งหมดเป็นตัวอย่างในภาพแบบ
import type { AgendaItem, AgendaResult, CalItemBody, CalItemDto, CalItemPatch, ColorKey, ConflictNote, GoogleLinkDto, MonthRes, PrefsPut, PrefsRes, TodayRes } from "./calendar";
import { ApiError } from "./client";
import { addDays, dayOfIso, dayOfMs, dayStartMs, daysInMonth, isoAt, shortDate, weekdayOf, ymOf } from "@/src/lib/cal-date";

type Q = Record<string, string | number | undefined> | undefined;

const LABEL: Record<ColorKey, string> = {
  booking: "บัตรคิว", account: "บัญชี", kanban: "บอร์ดงาน", crm: "CRM", hr: "HR", dorm: "หอพัก", ticket: "ตั๋ว", trips: "ทริป",
  remind: "เตือนฉัน", personal: "นัดส่วนตัว", google: "Google", device: "iPhone",
};

/** จุดของภาพจอ 4 (วันที่ของเดือน → สีระบบ) — วันนี้/พรุ่งนี้คำนวณจากรายการจริงของ fixture */
const MONTH_DOTS: Record<number, ColorKey[]> = {
  3: ["booking"], 5: ["account"], 7: ["booking", "crm"], 10: ["booking"], 11: ["kanban"], 13: ["booking", "remind"],
  14: ["crm"], 15: ["kanban"], 18: ["account"], 20: ["booking"], 23: ["account"], 25: ["hr"], 28: ["booking"], 30: ["hr", "account"],
};
const GENERIC: Record<ColorKey, { title: string; sub: string; hour: number; allDay?: boolean }> = {
  booking: { title: "Fun Dive · คุณจอห์น", sub: "ครูนิว · เรือ", hour: 9 },
  account: { title: "ใบแจ้งหนี้ครบกำหนด 1 ใบ", sub: "Ocean Tour ฿4,500", hour: 0, allDay: true },
  kanban: { title: "เตรียมอุปกรณ์ทริป", sub: "การ์ดในบอร์ด \"ทริปสิมิลัน\"", hour: 17 },
  crm: { title: "โทรติดตามคุณมาลี", sub: "โทร · ดีลคอร์ส Advanced", hour: 14 },
  hr: { title: "จ่ายเงินเดือนงวด พ.ย.", sub: "", hour: 0, allDay: true },
  remind: { title: "ต่อประกันเรือ", sub: "เตือนฉัน", hour: 10 },
  dorm: { title: "ค่าห้องครบกำหนด", sub: "", hour: 0, allDay: true },
  ticket: { title: "รอบโชว์", sub: "", hour: 19 },
  trips: { title: "รอบออกเรือ", sub: "", hour: 7 },
  personal: { title: "นัดส่วนตัว", sub: "", hour: 12 },
  google: { title: "นัดจาก Google", sub: "", hour: 12 },
  device: { title: "นัดในเครื่อง", sub: "", hour: 12 },
};

type Store = { base: string; items: CalItemDto[]; doneShop: Set<string>; prefs: PrefsRes; google: GoogleLinkDto; seq: number };
let S: Store | null = null;

function item(p: Partial<CalItemDto> & Pick<CalItemDto, "id" | "kind" | "title" | "startAt">): CalItemDto {
  const now = new Date().toISOString();
  return {
    note: null, endAt: null, allDay: false, repeat: "NONE", repeatDays: [], leadMinutes: 0, link: null, status: "OPEN", doneAt: null,
    occursAt: p.startAt, nextFireAt: p.startAt, snoozeUntil: null, source: "APP", roomId: null, exported: false, createdAt: now, updatedAt: now,
    ...p,
  };
}

function store(): Store {
  if (S) return S;
  const d0 = dayOfMs(Date.now());
  const d1 = addDays(d0, 1);
  // วันจันทร์ถัดไป (เตือนประจำ "ทุกวันจันทร์ 09:00" · จอ 5)
  let mon = addDays(d0, 1);
  while (weekdayOf(mon) !== 1) mon = addDays(mon, 1);
  S = {
    base: d0,
    seq: 1,
    doneShop: new Set(),
    items: [
      item({
        id: "fx-call-ek", kind: "REMINDER", title: "โทรหาคุณเอก เรื่องมัดจำเรือ", startAt: isoAt(d0, 15), source: "CHAT", roomId: "fx-room",
        createdAt: isoAt(addDays(d0, -1), 18, 42),
        link: { type: "CRM_DEAL", id: "fx-deal-ek", systemId: "fx-crm", label: "คุณเอก (CRM) · ดีลเช่าเรือ ธ.ค." },
      }),
      item({ id: "fx-stock", kind: "REMINDER", title: "เช็กสต็อกอุปกรณ์", startAt: isoAt(mon, 9), repeat: "WEEKLY", repeatDays: [1], status: "DRAFT", source: "CHAT", roomId: "fx-room" }),
      item({ id: "fx-bank", kind: "EVENT", title: "ประชุมธนาคาร (สินเชื่อเรือ)", startAt: isoAt(d1, 13), endAt: isoAt(d1, 14), leadMinutes: 15, exported: true }),
      item({ id: "fx-call-ek2", kind: "REMINDER", title: "โทรหาคุณเอก เรื่องมัดจำเรือ", startAt: isoAt(d1, 15) }),
      item({ id: "fx-insure", kind: "REMINDER", title: "ต่อประกันเรือ", startAt: isoAt(addDays(d0, 4), 10), note: "ประกันหมดสิ้นเดือน" }),
      item({ id: "fx-quote", kind: "REMINDER", title: "ส่งใบเสนอราคา Ocean Tour", startAt: isoAt(addDays(d0, -1), 11), status: "DONE", doneAt: isoAt(addDays(d0, -1), 11, 20) }),
    ],
    prefs: {
      tenantName: "SIAM DIVE CENTER",
      morning: { on: true, minute: 480 },
      evening: { on: false, minute: 1140 },
      travelMinutes: 45,
      sources: [
        { key: "booking", label: "บัตรคิว", sub: "นัดลูกค้า", on: true },
        { key: "account", label: "บัญชี", sub: "ครบกำหนด · ภาษี", on: true },
        { key: "kanban", label: "บอร์ดงาน", sub: "การ์ดของฉัน", on: true },
        { key: "crm", label: "CRM", sub: "งาน/นัด", on: true },
        { key: "hr", label: "HR", sub: "เงินเดือน · ลา", on: false },
      ],
      google: { status: "ACTIVE", email: "somchai@gmail.com" },
    },
    google: {
      status: "ACTIVE",
      email: "somchai@gmail.com",
      calendars: [
        { id: "primary", name: "ส่วนตัว", color: "#4285F4", primary: true, import: true, sub: "ของฉัน" },
        { id: "home", name: "งานบ้าน", color: "#0B8043", primary: false, import: true, sub: "แชร์จากแฟน" },
        { id: "holiday", name: "วันหยุดไทย", color: "#7986CB", primary: false, import: false, sub: null },
      ],
      exportKinds: ["EVENT"],
      exportCalendarId: "primary",
      exportCalendarName: "ส่วนตัว",
      lastSyncAt: null,
      lastError: null,
    },
  };
  return S;
}

function row(p: Partial<AgendaItem> & Pick<AgendaItem, "id" | "source" | "title" | "colorKey" | "startAt">): AgendaItem {
  return { sub: null, label: LABEL[p.colorKey], allDay: false, timeHint: null, deepLink: null, checkable: false, done: false, mine: true, ...p };
}

/** ของร้านตามวัน (ภาพจอ 3 วันนี้ · จอ 10 พรุ่งนี้ · วันอื่นตามจุดจอ 4) */
function shopRows(day: string, st: Store): AgendaItem[] {
  const off = Math.round((dayStartMs(day) - dayStartMs(st.base)) / 86_400_000);
  const out: AgendaItem[] = [];
  if (off === 0) {
    out.push(
      row({ id: `account:due:fx-acc:${day}`, source: "account", colorKey: "account", title: "ใบแจ้งหนี้ครบกำหนด 2 ใบ", sub: "Ocean Tour ฿12,000 · คุณมาลี ฿6,400", startAt: isoAt(day, 0), allDay: true, summary: { count: 2, amountSatang: 1_840_000 }, deepLink: { kind: "web", path: "/app/sys/fx-acc/account/documents" }, mine: false }),
      row({ id: "booking:fx-b1", source: "booking", colorKey: "booking", title: "Discover Scuba · คุณแพร", sub: "ครูนิว · สระ 1", startAt: isoAt(day, 9, 30), endAt: isoAt(day, 10, 30), timeHint: "DURATION", deepLink: { kind: "web", path: `/app/u/siam/booking/day?date=${day}` }, mine: false }),
      row({ id: "booking:fx-b2", source: "booking", colorKey: "booking", title: "Open Water ภาคทฤษฎี (3 คน)", sub: "ครูบอส · ห้องเรียน", startAt: isoAt(day, 11), endAt: isoAt(day, 13), timeHint: "DURATION", deepLink: { kind: "web", path: `/app/u/siam/booking/day?date=${day}` }, mine: false }),
      row({ id: "kanban:fx-c1", source: "kanban", colorKey: "kanban", title: "เช็กถังอากาศก่อนทริปพรุ่งนี้", sub: "การ์ดในบอร์ด \"ทริปสิมิลัน\"", startAt: isoAt(day, 17), timeHint: "DUE", checkable: true, deepLink: { kind: "web", path: "/app/sys/fx-kb/kanban/b/fx-board?card=fx-c1" }, ref: { cardId: "fx-c1", systemId: "fx-kb" } }),
    );
  } else if (off === 1) {
    out.push(
      row({ id: "google:fx-g1", source: "google", colorKey: "google", title: "ส่งลูกไปโรงเรียน", sub: "จากปฏิทิน Google · งานบ้าน", startAt: isoAt(day, 8, 30), endAt: isoAt(day, 9, 30), timeHint: "DURATION" }),
      row({ id: "booking:fx-b3", source: "booking", colorKey: "booking", title: "Discover Scuba · คุณบี", sub: "ครูนิว · สระ 1", startAt: isoAt(day, 10), endAt: isoAt(day, 12), timeHint: "DURATION", deepLink: { kind: "web", path: `/app/u/siam/booking/mine` } }),
    );
  } else {
    const ym = ymOf(day);
    if (ym === ymOf(st.base)) {
      const keys = MONTH_DOTS[Number(day.slice(8, 10))] ?? [];
      keys.forEach((k, i) => {
        const g = GENERIC[k];
        const src = k === "remind" ? "reminder" : k === "personal" ? "event" : (k as AgendaItem["source"]);
        out.push(row({ id: `${src}:fx-${day}-${i}`, source: src, colorKey: k, title: g.title, sub: g.sub || null, startAt: isoAt(day, g.hour), allDay: !!g.allDay, endAt: g.allDay ? undefined : isoAt(day, g.hour + 1), timeHint: g.allDay ? null : "DURATION", mine: k !== "account" && k !== "hr" }));
      });
    }
  }
  return out.map((r) => (st.doneShop.has(r.id) ? { ...r, done: true } : r));
}

/** ครั้งของ CalItem ในวันนั้น (ทำซ้ำรายสัปดาห์/วัน/เดือนแบบง่าย) */
function occOn(it: CalItemDto, day: string): string | null {
  const start = it.startAt;
  const sday = dayOfIso(start);
  if (day < sday) return null;
  const iso = new Date(dayStartMs(day) + (Date.parse(start) - dayStartMs(sday))).toISOString();
  if (it.repeat === "NONE") return sday === day ? start : null;
  if (it.repeat === "DAILY") return iso;
  if (it.repeat === "WEEKLY") return (it.repeatDays.length ? it.repeatDays : [weekdayOf(sday)]).includes(weekdayOf(day)) ? iso : null;
  return Number(day.slice(8, 10)) === Math.min(Number(sday.slice(8, 10)), daysInMonth(ymOf(day))) ? iso : null;
}

function ownRows(day: string, st: Store): AgendaItem[] {
  const out: AgendaItem[] = [];
  for (const it of st.items) {
    if (it.status !== "OPEN" && it.status !== "DONE") continue;
    const occ = occOn(it, day);
    if (!occ) continue;
    const ev = it.kind === "EVENT";
    const sub = ev
      ? `นัดส่วนตัว · สร้างในแอป${it.exported ? " → ส่งไป Google แล้ว" : ""}`
      : it.source === "CHAT" && dayOfIso(it.createdAt) === addDays(st.base, -1) && day === st.base
        ? `คุณสั่งเมื่อวาน ${it.createdAt ? new Date(Date.parse(it.createdAt) + 7 * 3600_000).toISOString().slice(11, 16) : ""}`
        : it.link
          ? `ผูกกับ ${it.link.label}`
          : it.note?.split("\n")[0] || "เตือนฉัน";
    out.push(
      row({
        id: it.repeat === "NONE" ? `${ev ? "event" : "reminder"}:${it.id}` : `reminder:${it.id}@${occ}`,
        source: ev ? "event" : "reminder",
        colorKey: ev ? "personal" : "remind",
        title: it.title,
        sub,
        startAt: occ,
        endAt: it.endAt ? new Date(Date.parse(occ) + (Date.parse(it.endAt) - Date.parse(it.startAt))).toISOString() : undefined,
        allDay: it.allDay,
        timeHint: ev ? "DURATION" : "REMIND",
        checkable: !ev,
        done: it.status === "DONE",
        deepLink: { kind: "app", path: `/secretary/calendar?day=${day}&item=${it.id}` },
        ref: { itemId: it.id, occ },
      }),
    );
  }
  return out;
}

function deviceRows(day: string, st: Store): AgendaItem[] {
  if (day !== addDays(st.base, 1)) return [];
  return [row({ id: "device:fx-d1", source: "device", colorKey: "device", title: "ทานข้าวกับลูกค้า Ocean Tour", sub: "จากปฏิทิน iPhone", startAt: isoAt(day, 19), endAt: isoAt(day, 21), timeHint: "DURATION" })];
}

function range(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}

function agenda(from: string, to: string): AgendaResult {
  const st = store();
  const items = range(from, to).flatMap((d) => [...shopRows(d, st), ...ownRows(d, st)]);
  const conflicts: ConflictNote[] = [];
  const d1 = addDays(st.base, 1);
  if (from <= d1 && d1 <= to && st.items.some((i) => i.id === "fx-bank" && i.status === "OPEN")) {
    conflicts.push({
      key: "fx-conflict-bank",
      kind: "TIGHT",
      earlierId: "booking:fx-b3",
      laterId: "event:fx-bank",
      text: "⚠️ 13:00 ประชุมธนาคาร ชนกับเวลาเดินทางจากสระ (เลิก 12:00) · อยากให้ผมเตือนออกตอน 12:15 ไหมครับ",
      suggestRemindAt: isoAt(d1, 12, 15),
    });
  }
  return { items, conflicts, notes: [] };
}

const PRIORITY: ColorKey[] = ["remind", "personal", "booking", "crm", "kanban", "account", "hr", "dorm", "ticket", "google", "device"];
function month(ym: string): MonthRes {
  const st = store();
  const days: Record<string, ColorKey[]> = {};
  const first = `${ym}-01`;
  for (const d of range(first, `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`)) {
    const keys = new Set<ColorKey>([...shopRows(d, st), ...ownRows(d, st)].map((r) => r.colorKey).filter((k) => k !== "google"));
    // ภาพจอ 4: วันนี้ = บัตรคิว · บัญชี · เตือนฉัน (ลำดับในภาพ)
    const list = d === st.base ? (["booking", "account", "remind"] as ColorKey[]).filter((k) => keys.has(k)) : PRIORITY.filter((k) => keys.has(k));
    if (list.length) days[d] = list.slice(0, 3);
  }
  return { ym, days };
}

function today(): TodayRes {
  const st = store();
  const call = st.items.find((i) => i.id === "fx-call-ek");
  const lines = [
    { colorKey: "booking" as ColorKey, text: "นัดลูกค้า 4 คิว", rightText: "คิวแรก 09:30" },
    { colorKey: "account" as ColorKey, text: "ใบแจ้งหนี้ครบกำหนด 2 ใบ", rightText: "฿18,400" },
    ...(call && call.status === "OPEN" ? [{ colorKey: "remind" as ColorKey, text: call.title, rightText: "15:00" }] : []),
    { colorKey: "account" as ColorKey, text: "ยื่น ภ.พ.30 เดือน ต.ค.", rightText: "อีก 3 วัน" },
  ];
  const count = call && call.status === "OPEN" ? 6 : 5;
  return { day: st.base, dateLabel: shortDate(st.base, "th"), count, greeting: `สวัสดีตอนเช้าครับ วันนี้มี ${count} เรื่อง`, lines, more: true };
}

function listItems(tab: string): { items: CalItemDto[] } {
  const st = store();
  const d0 = dayOfMs(Date.now());
  const all = st.items;
  if (tab === "done") return { items: all.filter((i) => i.status === "DONE").sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")) };
  if (tab === "today") return { items: all.filter((i) => i.status === "OPEN" && dayOfIso(i.occursAt) === d0).sort((a, b) => a.occursAt.localeCompare(b.occursAt)) };
  return { items: all.filter((i) => (i.status === "OPEN" || i.status === "DRAFT") && dayOfIso(i.occursAt) > d0).sort((a, b) => a.occursAt.localeCompare(b.occursAt)) };
}

class FixtureError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

function find(id: string): CalItemDto {
  const it = store().items.find((i) => i.id === id);
  if (!it) throw new FixtureError(404, "ไม่พบรายการนี้ หรือคุณยังไม่มีสิทธิ์เห็น");
  return it;
}
function touch(it: CalItemDto, p: Partial<CalItemDto>): CalItemDto {
  Object.assign(it, p, { updatedAt: new Date().toISOString() });
  return it;
}

function create(b: CalItemBody): CalItemDto {
  const st = store();
  if (!b.title?.trim() || b.title.length > 200) throw new FixtureError(400, "ใส่เรื่องที่จะเตือน (ไม่เกิน 200 ตัวอักษร)");
  if (b.kind === "REMINDER" && Date.parse(b.startAt) < Date.now() - 30_000 && (b.repeat ?? "NONE") === "NONE") throw new FixtureError(400, "เวลานี้ผ่านไปแล้ว — เลือกเวลาในอนาคต");
  const it = item({
    id: `fx-new-${st.seq++}`,
    kind: b.kind,
    title: b.title.trim(),
    note: b.note ?? null,
    startAt: b.startAt,
    endAt: b.endAt ?? null,
    allDay: !!b.allDay,
    repeat: b.repeat ?? "NONE",
    repeatDays: b.repeatDays ?? [],
    leadMinutes: b.leadMinutes ?? (b.kind === "EVENT" ? 15 : 0),
    link: b.link ? { type: b.link.type, id: b.link.id, systemId: null, label: linkLabel(b.link.id) } : null,
    source: b.origin === "conflict" ? "SUGGEST" : "APP",
  });
  st.items.push(it);
  return it;
}
function linkLabel(id: string): string {
  return FIXTURE_LINKS.find((l) => l.id === id)?.label ?? id;
}

/** ตัวเลือก "ผูกกับ" ตัวอย่าง (CAL2.6 · การค้นจริงใช้ API ค้นของแต่ละระบบ) */
export const FIXTURE_LINKS: { type: "CRM_CONTACT" | "CRM_DEAL" | "ACCOUNT_DOC" | "KANBAN_CARD"; id: string; label: string }[] = [
  { type: "ACCOUNT_DOC", id: "fx-inv-0312", label: "Ocean Tour · ใบแจ้งหนี้ INV-0312" },
  { type: "CRM_DEAL", id: "fx-deal-ek", label: "คุณเอก (CRM) · ดีลเช่าเรือ ธ.ค." },
  { type: "CRM_CONTACT", id: "fx-c-malee", label: "คุณมาลี (CRM)" },
  { type: "KANBAN_CARD", id: "fx-c1", label: "เช็กถังอากาศก่อนทริปพรุ่งนี้ (บอร์ดงาน)" },
];

/** ตัวกลาง: เส้น + วิธี → ผลแบบเดียวกับเซิร์ฟเวอร์ · ผิด = โยน Error ที่มี status + ข้อความไทย (calendar.ts แปลงเป็น ApiError) */
export async function fixtureCall<T>(method: string, sub: string, q: Q, body: unknown): Promise<T> {
  try {
    return (await Promise.resolve(route(method, sub, q, body))) as T;
  } catch (e) {
    if (e instanceof FixtureError) {
      throw new ApiError(e.status, e.status === 404 ? "not_found" : "invalid", e.message);
    }
    throw e;
  }
}

function route(method: string, sub: string, q: Q, body: unknown): unknown {
  const st = store();
  const qs = (k: string) => (q && q[k] !== undefined ? String(q[k]) : "");
  const b = (body ?? {}) as Record<string, unknown>;
  const m = sub.match(/^items\/([^/]+)(?:\/(\w+))?$/);
  if (method === "GET" && sub === "agenda") return agenda(qs("from"), qs("to") || qs("from"));
  if (method === "GET" && sub === "_device") return range(qs("from"), qs("to") || qs("from")).flatMap((d) => deviceRows(d, st));
  if (method === "GET" && sub === "month") return month(qs("ym"));
  if (method === "GET" && sub === "today") return today();
  if (method === "GET" && sub === "items") return listItems(qs("tab") || "upcoming");
  if (method === "POST" && sub === "items") return { item: create(b as unknown as CalItemBody) };
  if (method === "POST" && sub === "source-done") {
    st.doneShop.add(`${String(b.source)}:${String(b.id)}`);
    return { ok: true };
  }
  if (m) {
    const id = decodeURIComponent(m[1]);
    const act = m[2];
    const it = find(id);
    if (!act && method === "GET") return { item: it, phone: it.link?.type === "CRM_DEAL" ? "+66812344421" : null };
    if (!act && method === "DELETE") {
      touch(it, { status: "CANCELLED", nextFireAt: null });
      return { ok: true };
    }
    if (!act && method === "PATCH") {
      const p = b as CalItemPatch;
      if (it.status === "CANCELLED" || it.status === "DONE") throw new FixtureError(409, "รายการนี้ปิดไปแล้ว");
      const link = p.link === null ? null : p.link ? { type: p.link.type, id: p.link.id, systemId: null, label: linkLabel(p.link.id) } : it.link;
      const startAt = p.startAt ?? it.startAt;
      return { item: touch(it, { ...p, link, startAt, occursAt: startAt, endAt: p.endAt ?? it.endAt } as Partial<CalItemDto>) };
    }
    if (act === "done") {
      if (it.status === "CANCELLED") throw new FixtureError(409, "รายการนี้ปิดไปแล้ว");
      if (it.repeat === "NONE") touch(it, { status: "DONE", doneAt: new Date().toISOString(), nextFireAt: null });
      return { item: it };
    }
    if (act === "reopen") {
      if (it.repeat !== "NONE") throw new FixtureError(409, "รายการทำซ้ำติ๊กออกไม่ได้");
      return { item: touch(it, { status: "OPEN", doneAt: null }) };
    }
    if (act === "snooze") {
      const until = b.preset === "1h" ? new Date(Date.now() + 3600_000).toISOString() : b.preset === "tomorrow9" ? isoAt(addDays(dayOfMs(Date.now()), 1), 9) : String(b.until ?? "");
      return { item: touch(it, { snoozeUntil: until, nextFireAt: until }) };
    }
    if (act === "confirm") {
      if (it.status === "DRAFT") touch(it, { status: "OPEN" });
      return { item: it };
    }
  }
  if (method === "GET" && sub === "prefs") return st.prefs;
  if (method === "PUT" && sub === "prefs") {
    const p = b as PrefsPut;
    if (p.morning) st.prefs.morning = { ...st.prefs.morning, ...p.morning } as PrefsRes["morning"];
    if (p.evening) st.prefs.evening = { ...st.prefs.evening, ...p.evening } as PrefsRes["evening"];
    if (typeof p.travelMinutes === "number") st.prefs.travelMinutes = p.travelMinutes;
    if (p.sources) st.prefs.sources = st.prefs.sources.map((s) => (p.sources && s.key in p.sources ? { ...s, on: !!p.sources[s.key] } : s));
    return st.prefs;
  }
  if (method === "GET" && sub === "google") return st.google;
  if (method === "PUT" && sub === "google") {
    const p = b as { calendars?: { id: string; import: boolean }[]; exportKinds?: GoogleLinkDto["exportKinds"]; exportCalendarId?: string | null };
    if (p.calendars) st.google.calendars = (st.google.calendars ?? []).map((c) => ({ ...c, import: p.calendars?.find((x) => x.id === c.id)?.import ?? c.import }));
    if (p.exportKinds) st.google.exportKinds = p.exportKinds;
    if (p.exportCalendarId !== undefined) st.google.exportCalendarId = p.exportCalendarId;
    return st.google;
  }
  if (method === "POST" && sub === "google/sync") return { ok: true, changed: 0 };
  if (method === "DELETE" && sub === "google") {
    st.google = { status: "NONE" };
    st.prefs.google = { status: "NONE", email: null };
    return { ok: true };
  }
  throw new FixtureError(404, "not_found");
}
