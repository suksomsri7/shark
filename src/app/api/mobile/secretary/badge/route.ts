// GET /api/mobile/secretary/badge — ตัวเลขบนไอคอนแอปในกิจการนี้ (S1.23 `badgeTotalFor`: ห้องเลขาที่ยังไม่อ่าน + แชทลูกค้าที่ยังไม่อ่าน (มีสิทธิ์) + เรื่องช่วยเหลือ)
import { badgeTotalFor } from "@/lib/ai/secretary/notify";
import { gate, ok, thrown } from "../_shared";

export async function GET(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  try {
    return ok({ badge: await badgeTotalFor(a.c.userId, a.c.tenantId) });
  } catch (e) {
    return thrown(e, "badge");
  }
}
