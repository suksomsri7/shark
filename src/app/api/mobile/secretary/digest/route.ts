// GET /api/mobile/secretary/digest — ข้อมูลกิจการสด (S1.16 `computeDigest` · ไม่ใช่ block ข้อความ) ตัดส่วนที่ผู้ดูอ่านไม่ได้/ระดับเลขา OFF (`digestForViewer`)
import { computeDigest, digestForViewer } from "@/lib/ai/secretary/digest";
import { getAccess } from "@/lib/ai/secretary/access";
import { gate, ok } from "../_shared";

export async function GET(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const [d, access] = await Promise.all([computeDigest(a.c.tenantId), getAccess(a.c.tenantId)]);
  return ok({ digest: digestForViewer(d, a.c.m, a.c.userId, access) });
}
