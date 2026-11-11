// GET /api/mobile/secretary/log?module&day&roomId&take — บันทึกการกระทำของเลขา (B5 · `listLog`)
//   ต่อแถว `canUndo` (สิทธิ์จริงของผู้เรียก) + `link` (พาธ /app สำหรับ WebView `?open=` · ไม่รู้ = null) · OWNER ทุกแถว · คนอื่น = ห้องที่ตัวเองเปิด/เป็นสมาชิก + แถวที่ตัวเองสั่ง/อนุมัติ · day = YYYY-MM-DD เวลาไทย
import { listLog } from "@/lib/ai/secretary/actions";
import { logItemsFor } from "@/lib/ai/secretary/views";
import { fail, gate, ok, optId, takeOf, withRateLimit, withErrors } from "../_shared";

async function GET_(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "log", 60); // GET หนัก (R-S1.14b)
  if (rl) return rl;
  const q = new URL(req.url).searchParams;
  const day = q.get("day") ?? undefined;
  if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail(400, "invalid", "วันที่ต้องเป็นรูปแบบ YYYY-MM-DD", { field: "day" });
  const roomId = optId(q.get("roomId"));
  const module = optId(q.get("module"));
  if (roomId === null || module === null) return fail(400, "invalid", "ตัวกรองไม่ถูกต้อง");
  const rows = await listLog(a.c.conv, { ...(day ? { day } : {}), ...(module ? { module } : {}), ...(roomId ? { roomId } : {}), take: takeOf(q.get("take"), 50, 200) });
  return ok({ items: await logItemsFor(a.c, rows) }); // + canUndo (dry-run ของ undoAction · นาฬิกาเซิร์ฟเวอร์) + link ทางเปิดของจริง
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/log GET", GET_);
