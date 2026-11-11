// GET /api/mobile/secretary/inbox/count — ตัวเลขบนแถบ "รออนุมัติ" (S1.11 `inboxCount` · ทุกกิจการ · เพดาน 100) · ไม่ต้องมี x-tenant-id
import { inboxCount } from "@/lib/ai/secretary/inbox";
import { ok, userGate, withErrors } from "../../_shared";

async function GET_(req: Request) {
  const a = await userGate(req);
  if (!a.ok) return a.res;
  return ok(await inboxCount(a.userId));
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/inbox/count GET", GET_);
