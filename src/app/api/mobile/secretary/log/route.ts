// GET /api/mobile/secretary/log?module&day&roomId&take — บันทึกการกระทำของเลขา (B5 · `listLog`)
//   OWNER ทุกแถว · คนอื่น = ห้องที่ตัวเองเปิด/เป็นสมาชิก + แถวที่ตัวเองสั่ง/อนุมัติ · day = YYYY-MM-DD เวลาไทย
import { listLog } from "@/lib/ai/secretary/actions";
import { logDto } from "@/lib/ai/secretary/dto";
import { fail, gate, ok, optId, takeOf } from "../_shared";

export async function GET(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const q = new URL(req.url).searchParams;
  const day = q.get("day") ?? undefined;
  if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail(400, "invalid", "วันที่ต้องเป็นรูปแบบ YYYY-MM-DD", { field: "day" });
  const roomId = optId(q.get("roomId"));
  const module = optId(q.get("module"));
  if (roomId === null || module === null) return fail(400, "invalid", "ตัวกรองไม่ถูกต้อง");
  const rows = await listLog(a.c.conv, { ...(day ? { day } : {}), ...(module ? { module } : {}), ...(roomId ? { roomId } : {}), take: takeOf(q.get("take"), 50, 200) });
  const now = new Date();
  return ok({ items: rows.map((r) => logDto(r, now)) });
}
