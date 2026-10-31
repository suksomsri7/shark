// SVC B.14 — ตัวช่วยร่วมของจอปฏิทินนัด (pure · ไม่มี I/O · ใช้ได้ทั้ง server/client/renderToStaticMarkup)
// 🔴 เวลาไทยจาก epoch + 7 ชม. / วันที่ปฏิทินล้วน (ไม่ใช้นาฬิกาเครื่อง)
import type { CalendarView } from "@/lib/modules/booking/calendar";

export type CalActions = Record<"move" | "book" | "start", (fd: FormData) => Promise<void>>;
export const ROW_PX = 84; // ความสูงต่อชั่วโมง (ภาพ 02)
export const SNAP_MIN = 15;

/** epoch ms ของ 00:00 ไทยของวัน */
export function dayStartMs(ds: string): number {
  const [y, m, d] = ds.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - 7 * 3_600_000;
}
/** นาทีจากเที่ยงคืนไทยของวัน ds */
export const minOf = (ms: number, ds: string) => Math.round((ms - dayStartMs(ds)) / 60_000);
export const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(((min % 60) + 60) % 60).padStart(2, "0")}`;

/** แกนเวลา (ชั่วโมงเต็ม) — ครอบเวลาร้าน + ทุกบล็อกของ view */
export function axisOf(view: CalendarView): { startMin: number; endMin: number } {
  let lo = view.openMin ?? 10 * 60;
  let hi = view.closeMin ?? 20 * 60;
  for (const c of view.columns) {
    for (const b of c.blocks) {
      lo = Math.min(lo, minOf(b.startMs, c.dateStr));
      hi = Math.max(hi, minOf(b.endMs, c.dateStr));
    }
  }
  lo = Math.max(0, Math.floor(lo / 60) * 60);
  hi = Math.min(24 * 60, Math.max(lo + 60, Math.ceil(hi / 60) * 60));
  return { startMin: lo, endMin: hi };
}

/** ลิงก์ของมุมมอง (ค่าเดิม + ทับด้วย patch) */
export function calHref(unitSlug: string, view: CalendarView, at: string | undefined, patch: Partial<{ date: string; range: "DAY" | "WEEK"; mode: "STAFF" | "RESOURCE"; who: string | null; appt: string | null }>): string {
  const q = new URLSearchParams();
  q.set("date", patch.date ?? view.dateStr);
  const range = patch.range ?? view.range;
  const mode = patch.mode ?? view.mode;
  q.set("range", range === "WEEK" ? "week" : "day");
  q.set("by", mode === "RESOURCE" ? "resource" : "staff");
  const who = patch.who === undefined ? (patch.mode && patch.mode !== view.mode ? null : view.focusId) : patch.who;
  if (who && range === "WEEK") q.set("who", who);
  const appt = patch.appt === undefined ? null : patch.appt;
  if (appt) q.set("appt", appt);
  if (at) q.set("at", at);
  return `/app/u/${unitSlug}/booking/calendar?${q.toString()}`;
}

/** input ซ่อนของทุกฟอร์ม: มุมมองปัจจุบัน (กลับมาที่เดิม) + at (โหมด QC) */
export function viewFields(view: CalendarView, at: string | undefined): Record<string, string> {
  return {
    viewDate: view.dateStr,
    viewRange: view.range === "WEEK" ? "week" : "day",
    viewBy: view.mode === "RESOURCE" ? "resource" : "staff",
    ...(view.range === "WEEK" && view.focusId ? { viewWho: view.focusId } : {}),
    ...(at ? { at } : {}),
  };
}

/** ช่องเวลาให้เลือก (ทุก 15 นาที ในช่วงร้าน · ร้านปิด = 08:00–22:00) */
export function timeOptions(view: CalendarView): number[] {
  const lo = view.openMin ?? 8 * 60;
  const hi = view.closeMin ?? 22 * 60;
  const out: number[] = [];
  for (let t = lo; t < hi; t += SNAP_MIN) out.push(t);
  return out;
}

/** ป้ายชื่อย่อของชิ้นในแถวเดียวกัน: ตัดคำนำร่วม ("ห้องน้ำมัน A","ห้องน้ำมัน B" ⇒ "A","B") */
export function shortNames(names: string[]): { prefix: string; short: string[] } {
  if (names.length < 2) return { prefix: "", short: names };
  let p = names[0];
  for (const n of names) while (p && !n.startsWith(p)) p = p.slice(0, -1);
  const cut = p.lastIndexOf(" ") >= 0 ? p.slice(0, p.lastIndexOf(" ") + 1) : p;
  if (!cut.trim() || names.some((n) => !n.slice(cut.length).trim())) return { prefix: "", short: names };
  return { prefix: cut.trim(), short: names.map((n) => n.slice(cut.length).trim()) };
}

export function baht(satang: number): string {
  return `฿${(satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
}

export function HiddenFields({ fields }: { fields: Record<string, string> }) {
  return (
    <>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}
