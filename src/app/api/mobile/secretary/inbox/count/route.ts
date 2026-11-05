// GET /api/mobile/secretary/inbox/count — ตัวเลขบนแถบ "รออนุมัติ" (S1.11 `inboxCount` · ทุกกิจการ · เพดาน 100) · ไม่ต้องมี x-tenant-id
import { inboxCount } from "@/lib/ai/secretary/inbox";
import { ok, userGate } from "../../_shared";

export async function GET(req: Request) {
  const a = await userGate(req);
  if (!a.ok) return a.res;
  return ok(await inboxCount(a.userId));
}
