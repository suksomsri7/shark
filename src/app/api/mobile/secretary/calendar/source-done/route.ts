// POST /api/mobile/secretary/calendar/source-done — ติ๊กเสร็จการ์ดบอร์ด/งาน CRM จากปฏิทิน (จอ 3) · CAL1.6 · สัญญา §8
//   ตัวทำงาน = agenda.completeSourceItem (CAL1.3 เลน b) — ผ่านกติกาของระบบต้นทาง
import { z } from "zod";
import { completeSourceItem } from "@/lib/modules/calendar/agenda";
import { fail, notFound, ok, readBody, withErrors } from "../../_shared";
import { calGate, calThrown } from "../_cal";

const body = z.object({ source: z.enum(["kanban", "crm"]), id: z.string().min(1).max(80) }).strict();

async function POST_(req: Request) {
  const g = await calGate(req, "source-done", 30);
  if (!g.ok) return g.res;
  const b = await readBody(req, body);
  if (!b.ok) return b.res;
  try {
    const r = await completeSourceItem(g.actor, b.v);
    if (r.ok) return ok({ ok: true });
    if (r.code === "FORBIDDEN") return fail(403, "forbidden", r.message ?? "บอร์ดนี้คุณดูได้อย่างเดียว");
    if (r.code === "NO_DONE_COLUMN") return fail(409, "no_done_column", "บอร์ดนี้ยังไม่มีคอลัมน์ 'เสร็จ' — ย้ายการ์ดในบอร์ดแทน");
    // CAL1.3 ▸ D-B2: คอลัมน์ "เสร็จ" เต็มเพดาน WIP — ข้อความไทยของบอร์ดเอง ◂
    if (r.code === "BLOCKED") return fail(409, "blocked", r.message ?? "ย้ายการ์ดไม่ได้ตอนนี้ — เปิดบอร์ดเพื่อจัดการ");
    return notFound();
  } catch (e) {
    return calThrown(e, "calendar/source-done POST");
  }
}

export const POST = withErrors("secretary/calendar/source-done POST", POST_);
