// summary.ts — บรรทัดสรุปของการ์ด "วันนี้" + สรุปเช้า/เย็น (สัญญา §4.6 · R-CAL-30) — **บริสุทธิ์ล้วน**
//   ใช้ร่วม: route `GET calendar/today` (CAL1.6) · job `calendar.brief` (CAL1.5) — กติกาเดียว ข้อความเดียว
import type { AgendaItem, ColorKey } from "./agenda";
import { bkkDayNo, ymdToDayNo } from "./next-fire";
import { hhmm, satang } from "./push-msg";

export type BriefLine = {
  colorKey: ColorKey;
  text: string;
  rightText: string;
  /** รูปประโยคในข้อความ push (§7.2: "นัดลูกค้า 4 คิว (คิวแรก 09:30)") */
  pushText: string;
};
export const BRIEF_MAX_LINES = 4;

const dayOf = (iso: string) => bkkDayNo(new Date(iso));
const timeOrAllDay = (i: AgendaItem) => (i.allDay ? "ทั้งวัน" : hhmm(new Date(i.startAt)));

/**
 * บรรทัดสรุปของวัน `day` ("YYYY-MM-DD" ไทย) · ตัด done · google เฉพาะเมื่อ includeGoogle (R-CAL-31 · ค่าเริ่ม true)
 * ลำดับ: บัตรคิว → บัญชี → เตือน/นัดส่วนตัว (รายตัว) → บอร์ดงาน → CRM → HR/หอพัก/ตั๋ว (รายตัว) → กำหนดยื่น (≤ 7 วัน) → Google
 * `count` = จำนวนรายการจริงทั้งหมด (แถวสรุปนับตาม summary.count) · ไม่มีบรรทัด = การ์ดไม่แสดง/ไม่ส่งสรุป
 */
export function briefLines(
  items: AgendaItem[],
  day: string,
  now: Date,
  opts: BriefOpts = {},
): { lines: BriefLine[]; count: number; more: boolean } {
  void now;
  const r = allLines(items, day, opts);
  return { lines: r.lines.slice(0, BRIEF_MAX_LINES), count: r.count, more: r.lines.length > BRIEF_MAX_LINES };
}
export type BriefOpts = { upcomingTax?: AgendaItem[]; includeGoogle?: boolean };

function allLines(items: AgendaItem[], day: string, opts: BriefOpts): { lines: BriefLine[]; count: number } {
  const d = ymdToDayNo(day);
  const live = items.filter((i) => !i.done && (d === null || dayOf(i.startAt) === d) && (opts.includeGoogle !== false || i.source !== "google"));
  const by = (s: AgendaItem["source"]) => live.filter((i) => i.source === s);
  const lines: BriefLine[] = [];
  let count = 0;

  const booking = by("booking");
  if (booking.length) {
    const first = booking.filter((b) => !b.allDay).sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
    const right = first ? `คิวแรก ${hhmm(new Date(first.startAt))}` : "";
    lines.push({ colorKey: "booking", text: `นัดลูกค้า ${booking.length} คิว`, rightText: right, pushText: `นัดลูกค้า ${booking.length} คิว${first ? ` (${right})` : ""}` });
    count += booking.length;
  }
  const account = by("account");
  const due = account.filter((a) => a.id.startsWith("account:due:"));
  if (due.length) {
    const n = due.reduce((s, a) => s + (a.summary?.count ?? 1), 0);
    const amt = due.reduce((s, a) => s + (a.summary?.amountSatang ?? 0), 0);
    lines.push({ colorKey: "account", text: `ใบแจ้งหนี้ครบกำหนด ${n} ใบ`, rightText: amt ? satang(amt) : "", pushText: `ใบแจ้งหนี้ครบกำหนด ${n} ใบ${amt ? ` รวม ${satang(amt)}` : ""}` });
    count += n;
  }
  for (const a of account.filter((x) => !x.id.startsWith("account:due:"))) {
    const amt = a.summary?.amountSatang ?? 0;
    lines.push({ colorKey: "account", text: a.title, rightText: amt ? satang(amt) : "", pushText: a.title });
    count += a.summary?.count ?? 1;
  }
  const mineItems = live.filter((i) => i.source === "reminder" || i.source === "event").sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startAt.localeCompare(b.startAt));
  for (const r of mineItems) {
    lines.push({ colorKey: r.colorKey, text: r.title, rightText: timeOrAllDay(r), pushText: r.title });
    count += 1;
  }
  const kanban = by("kanban");
  if (kanban.length) {
    lines.push({ colorKey: "kanban", text: `การ์ดงานครบกำหนด ${kanban.length} ใบ`, rightText: "", pushText: `การ์ดงานครบกำหนด ${kanban.length} ใบ` });
    count += kanban.length;
  }
  const crm = by("crm");
  if (crm.length) {
    lines.push({ colorKey: "crm", text: `งาน CRM ${crm.length} รายการ`, rightText: "", pushText: `งาน CRM ${crm.length} รายการ` });
    count += crm.length;
  }
  for (const s of ["hr", "dorm", "ticket"] as const) {
    for (const i of by(s)) {
      lines.push({ colorKey: i.colorKey, text: i.title, rightText: timeOrAllDay(i), pushText: i.title });
      count += i.summary?.count ?? 1;
    }
  }
  if (d !== null) {
    const seen = new Set<string>();
    for (const t of (opts.upcomingTax ?? []).filter((x) => x.source === "tax" && !x.done).sort((a, b) => a.startAt.localeCompare(b.startAt))) {
      const left = dayOf(t.startAt) - d;
      if (left < 0 || left > 7 || seen.has(t.id)) continue;
      seen.add(t.id);
      lines.push({ colorKey: t.colorKey, text: t.title, rightText: left === 0 ? "วันนี้" : `อีก ${left} วัน`, pushText: left === 0 ? `วันนี้${t.title}` : `อีก ${left} วัน${t.title}` });
      count += 1;
    }
  }
  const google = by("google");
  if (google.length) {
    lines.push({ colorKey: "google", text: `นัดในปฏิทินส่วนตัว ${google.length} นัด`, rightText: "", pushText: `นัดในปฏิทินส่วนตัว ${google.length} นัด` });
    count += google.length;
  }
  return { lines, count };
}

/** ส่วนของข้อความ push สรุป (§7.2 · ภาพจอ 1): ทุกบรรทัด (ไม่ตัด 4 — ความยาวคุมด้วยเพดาน 178 ตัวของ briefMessage) ·
 *  เตือน/นัดส่วนตัวรวมเป็น "เตือนของคุณ N รายการ" ไว้ท้าย */
export function briefPushParts(items: AgendaItem[], day: string, opts: BriefOpts = {}): string[] {
  const isMine = (i: AgendaItem) => i.source === "reminder" || i.source === "event";
  const parts = allLines(items.filter((i) => !isMine(i)), day, opts).lines.map((l) => l.pushText);
  const mine = allLines(items.filter(isMine), day, {}).count;
  if (mine) parts.push(`เตือนของคุณ ${mine} รายการ`);
  return parts;
}

/** ป้ายวันสั้น "จ. 16 พ.ย." (การ์ดวันนี้ · ปฏิทินไทย) */
export function dateLabel(day: string): string {
  const d = ymdToDayNo(day);
  if (d === null) return day;
  const t = new Date(d * 86_400_000);
  const wd = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."][(((d + 4) % 7) + 7) % 7];
  const mo = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][t.getUTCMonth()];
  return `${wd} ${t.getUTCDate()} ${mo}`;
}
