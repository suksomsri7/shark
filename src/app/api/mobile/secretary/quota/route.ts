// GET /api/mobile/secretary/quota — โควตางานเลขาของเดือนไทย (S1.13 `quotaStatus`) · 🔴 อ่านอย่างเดียว (§B.6): ไม่เปิดกระเป๋า · ไม่แจก GRANT · ไม่สร้างแถวตัวนับ
//   wire shape (R-S1.13i): `{ jobs:{used,limit,left,pct,level,text,resetAt,month}, assist:{usedMicro,capMicro,pct}, credit:{blocked}, pack }` · ไม่มียอดเงิน (balanceMicro ไม่ออก)
import { quotaStatus } from "@/lib/ai/secretary/quota";
import { quotaDto } from "@/lib/ai/secretary/dto";
import { gate, ok } from "../_shared";

export async function GET(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  return ok(quotaDto(await quotaStatus(a.c.tenantId)));
}
