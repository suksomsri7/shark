// GET /api/mobile/secretary/calendar/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD — รายการวัน (จอ 3 · 4 · 10) · CAL1.6 · สัญญา §8 · §4.1
//   ช่วง ≤ 42 วัน (`to` ไม่ส่ง = from) · ตัวรวม = modules/calendar/agenda.ts (CAL1.3 เลน b)
import { agendaFor } from "@/lib/modules/calendar/agenda";
import { dayNoToYmd } from "@/lib/modules/calendar/next-fire";
import { travelForItems } from "@/lib/modules/calendar/travel-svc";
import { fail, ok, withErrors } from "../../_shared";
import { calGate, calThrown, dayNo } from "../_cal";

async function GET_(req: Request) {
  const g = await calGate(req, "agenda", 60);
  if (!g.ok) return g.res;
  const q = new URL(req.url).searchParams;
  const f = dayNo(q.get("from"));
  const t = q.get("to") ? dayNo(q.get("to")) : f;
  if (f === null || t === null || t < f || t - f > 41) return fail(400, "invalid", "ช่วงวันไม่ถูกต้อง (ไม่เกิน 42 วัน)");
  try {
    const now = new Date();
    const r = await agendaFor(g.actor, { from: dayNoToYmd(f), to: dayNoToYmd(t) }, { now });
    // Q8 (สัญญา §16.5): ข้อเสนอเผื่อเวลาเดินทางแทน "เตือนออกตอน" แบบ TIGHT เดิม · OVERLAP + conflictWith (ทับจริง) คงเดิม
    const span = new Map(r.items.map((i) => [i.id, [Date.parse(i.startAt), Date.parse(i.endAt ?? i.startAt)] as const]));
    const overlap = (a: string, b: string) => {
      const x = span.get(a), y = span.get(b);
      return !!x && !!y && Math.min(x[1], y[1]) - Math.max(x[0], y[0]) >= 60_000;
    };
    const items = r.items.map((i) => {
      if (!i.conflictWith) return i;
      const keep = i.conflictWith.filter((o) => overlap(i.id, o));
      const { conflictWith: _c, ...rest } = i;
      void _c;
      return keep.length ? { ...rest, conflictWith: keep } : rest;
    });
    let travel: Awaited<ReturnType<typeof travelForItems>>["suggestions"] = [];
    try {
      travel = (await travelForItems(g.actor, r.items, now)).suggestions;
    } catch {
      travel = []; // ส่วนเสริม — ล้มไม่พา agenda ล้ม
    }
    return ok({ ...r, items, conflicts: r.conflicts.filter((c) => c.kind === "OVERLAP"), travel });
  } catch (e) {
    return calThrown(e, "calendar/agenda GET");
  }
}

export const GET = withErrors("secretary/calendar/agenda GET", GET_);
