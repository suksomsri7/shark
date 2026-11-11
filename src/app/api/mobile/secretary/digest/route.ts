// GET /api/mobile/secretary/digest — ข้อมูลกิจการสด (S1.16 `computeDigest` · ไม่ใช่ block ข้อความ) ตัดส่วนที่ผู้ดูอ่านไม่ได้/ระดับเลขา OFF · นับต่อผู้ดู (`viewerDigest` · R-Z14)
import { viewerDigest } from "@/lib/ai/secretary/digest";
import { getAccess } from "@/lib/ai/secretary/access";
import { gate, ok, withRateLimit, withErrors } from "../_shared";

async function GET_(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "digest", 60); // GET หนัก (R-S1.14b)
  if (rl) return rl;
  const access = await getAccess(a.c.tenantId);
  return ok({ digest: await viewerDigest(a.c.tenantId, a.c.m, a.c.userId, access, new Date()) }); // R-Z14: นับต่อผู้ดู (สาขา · การมองเห็น CRM)
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/digest GET", GET_);
