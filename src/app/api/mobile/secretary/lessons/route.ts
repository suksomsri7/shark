// GET /api/mobile/secretary/lessons?status — บทเรียนของเลขา (S1.15 `listLessons` · OWNER ทุกแถว · คนอื่นเฉพาะที่ตัวเองสอน)
import { listLessons } from "@/lib/ai/secretary/learn";
import { lessonDto } from "@/lib/ai/secretary/dto";
import { fail, gate, ok } from "../_shared";

const STATUSES = ["PENDING", "CONFIRMED", "REJECTED"] as const;

export async function GET(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const status = new URL(req.url).searchParams.get("status");
  if (status && !(STATUSES as readonly string[]).includes(status)) return fail(400, "invalid", "สถานะบทเรียนไม่ถูกต้อง", { field: "status" });
  const rows = await listLessons(a.c.conv, status ? { status: status as (typeof STATUSES)[number] } : undefined);
  return ok({ items: rows.map(lessonDto) });
}
