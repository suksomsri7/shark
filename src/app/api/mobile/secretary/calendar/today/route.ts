// GET /api/mobile/secretary/calendar/today — การ์ด "วันนี้" บนหน้าเลขา (จอ 2) · CAL1.6 · สัญญา §8 · §4.6
//   count = 0 ⇒ แอปซ่อนการ์ด · กำหนดยื่นที่ครบภายใน 7 วันขึ้นเป็นบรรทัด "อีก N วัน"
import { agendaFor } from "@/lib/modules/calendar/agenda";
import { bkkDayNo, dayNoToYmd } from "@/lib/modules/calendar/next-fire";
import { briefLines, dateLabel } from "@/lib/modules/calendar/summary";
import { ok, withErrors } from "../../_shared";
import { calGate, calThrown } from "../_cal";

async function GET_(req: Request) {
  const g = await calGate(req, "today", 60);
  if (!g.ok) return g.res;
  try {
    const now = new Date();
    const d = bkkDayNo(now);
    const day = dayNoToYmd(d);
    const ag = await agendaFor(g.actor, { from: day, to: dayNoToYmd(d + 7) }, { now });
    const ofDay = ag.items.filter((i) => bkkDayNo(new Date(i.startAt)) === d);
    const r = briefLines(ofDay, day, now, { upcomingTax: ag.items.filter((i) => i.source === "tax") });
    return ok({
      day,
      dateLabel: dateLabel(day),
      count: r.count,
      greeting: r.count ? `สวัสดีครับ วันนี้มี ${r.count} เรื่อง` : "",
      lines: r.lines.map(({ colorKey, text, rightText }) => ({ colorKey, text, rightText })),
      more: r.more,
    });
  } catch (e) {
    return calThrown(e, "calendar/today GET");
  }
}

export const GET = withErrors("secretary/calendar/today GET", GET_);
