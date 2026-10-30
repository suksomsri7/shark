// SVC B.7 — ตัวช่วยแสดงผลของหน้าจองออนไลน์/หน้าจัดการนัด (pure · ไม่ใช้นาฬิกาเครื่อง · Intl + Asia/Bangkok)
//   th = th-TH (ปี พ.ศ. · ฿) · en = en-GB (ไม่มีอักษรไทย — ใช้ "THB" แทน ฿ เพราะ ฿ อยู่ในช่วงอักษรไทย)
export type Loc = "th" | "en";
const TZ = "Asia/Bangkok";
const tag = (l: Loc) => (l === "en" ? "en-GB" : "th-TH");

/** "15:30" เวลาไทยของ epoch ms */
export function hhmm(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(new Date(ms));
}

/** ฿1,500 · THB 1,500 */
export function money(satang: number, l: Loc): string {
  const n = Math.round(satang / 100).toLocaleString("en-US");
  return l === "en" ? `THB ${n}` : `฿${n}`;
}

const utcOf = (dayStr: string): Date | null => {
  const [y, m, d] = dayStr.split("-").map(Number);
  return y && m && d ? new Date(Date.UTC(y, m - 1, d)) : null;
};

/** ชิปวัน: { wd: "ส." | "Sat", day: "31", mon: "ต.ค." | "Oct" } */
export function dayChip(dayStr: string, l: Loc): { wd: string; day: string; mon: string } {
  const d = utcOf(dayStr);
  if (!d) return { wd: "", day: dayStr, mon: "" };
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag(l), { ...o, timeZone: "UTC" }).format(d);
  return { wd: f({ weekday: "short" }), day: f({ day: "numeric" }), mon: f({ month: "short" }) };
}

/** "ส. 31 ต.ค." · "Sat 31 Oct" จาก YYYY-MM-DD */
export function dayLabel(dayStr: string, l: Loc): string {
  const d = utcOf(dayStr);
  if (!d) return dayStr;
  return new Intl.DateTimeFormat(tag(l), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

/** "ส. 31 ต.ค. 2569" · "Sat 31 Oct 2026" จาก epoch ms (เวลาไทย) */
export function dateLong(ms: number, l: Loc): string {
  return new Intl.DateTimeFormat(tag(l), { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(new Date(ms));
}

/** "ส. 31 ต.ค." จาก epoch ms (เวลาไทย) */
export function dateShort(ms: number, l: Loc): string {
  return new Intl.DateTimeFormat(tag(l), { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(new Date(ms));
}

/** ความยาว: 45 นาที · 2 ชั่วโมง · 1 ชม. 30 นาที (en: 45 min · 2 hr · 1 hr 30 min) */
export function duration(min: number, l: Loc): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (l === "en") return h === 0 ? `${m} min` : m === 0 ? `${h} hr` : `${h} hr ${m} min`;
  return h === 0 ? `${m} นาที` : m === 0 ? `${h} ชั่วโมง` : `${h} ชม. ${m} นาที`;
}

/** อักษรย่อโลโก้ร้าน (2 ตัวแรกที่ไม่ใช่ช่องว่าง) */
export function initials(name: string): string {
  return [...name.replace(/\s+/g, "")].slice(0, 2).join("") || "•";
}

const wdName = (wd: number, l: Loc, style: "short" | "long") =>
  new Intl.DateTimeFormat(tag(l), { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + wd))); // 7 ม.ค. 2024 = อาทิตย์
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** บรรทัดเวลาเปิดร้าน (ภาพ 03ก): { open: "อ.–อา. 10:00–20:00", closed: "จันทร์" } · ไม่มีวันเปิด ⇒ null */
export function hoursLine(rows: readonly { weekday: number; openMin: number; closeMin: number; closed: boolean }[], l: Loc): { days: string; time: string; closed: string | null } | null {
  const byWd = new Map(rows.map((r) => [r.weekday, r]));
  const firstClosed = [1, 2, 3, 4, 5, 6, 0].find((w) => byWd.get(w)?.closed);
  const start = firstClosed === undefined ? 1 : (firstClosed + 1) % 7;
  const order = Array.from({ length: 7 }, (_, i) => (start + i) % 7);
  const open = order.filter((w) => byWd.get(w) && !byWd.get(w)!.closed);
  if (!open.length) return null;
  const count = new Map<string, number>();
  for (const w of open) { const r = byWd.get(w)!; const k = `${r.openMin}-${r.closeMin}`; count.set(k, (count.get(k) ?? 0) + 1); }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const [o, c] = top.split("-").map(Number);
  const same = open.filter((w) => { const r = byWd.get(w)!; return `${r.openMin}-${r.closeMin}` === top; });
  const contiguous = same.every((w, i) => i === 0 || order.indexOf(w) === order.indexOf(same[i - 1]) + 1);
  const days = same.length === 7 ? (l === "en" ? "daily" : "ทุกวัน")
    : contiguous && same.length >= 3 ? `${wdName(same[0], l, "short")}–${wdName(same[same.length - 1], l, "short")}`
      : same.map((w) => wdName(w, l, "short")).join(", ");
  const closed = order.filter((w) => byWd.get(w)?.closed).map((w) => wdName(w, l, "long"));
  return { days, time: `${hm(o)}–${hm(c)}`, closed: closed.length ? closed.join(l === "en" ? ", " : "/") : null };
}
