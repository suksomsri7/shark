// GET /api/mobile/secretary/badge — ตัวเลขบนไอคอนแอปในกิจการนี้ (S1.23 `badgeTotalFor`: ห้องเลขาที่ยังไม่อ่าน + แชทลูกค้าที่ยังไม่อ่าน (มีสิทธิ์) + เรื่องช่วยเหลือ)
import { badgeTotalFor } from "@/lib/ai/secretary/notify";
import { gate, ok, thrown, withErrors } from "../_shared";

async function GET_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  try {
    return ok({ badge: await badgeTotalFor(a.c.userId, a.c.tenantId) });
  } catch (e) {
    return thrown(e, "badge");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/badge GET", GET_);
