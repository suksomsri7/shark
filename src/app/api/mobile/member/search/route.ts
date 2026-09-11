// GET /api/mobile/member/search?q= — ค้นสมาชิก (แอปพนักงาน จอ ก · ภาพ 28) · M3.11
// Bearer (mobile session ของพนักงาน) + X-Tenant-Id → membership ร้านนี้ต้อง active (requireMobile)
// สิทธิ์: อ่านสมาชิก (`member.customer.read` · STAFF ที่มีคีย์ member.* ใดก็ได้ = อ่านได้โดยนัย เหมือนหน้าเว็บ)
// ผล: ≤ 20 คน · ชื่อ · เบอร์ปิดบัง · ระดับ · แต้ม — ขอบเขตสาขาของพนักงานคนนั้น (facade สมาชิกตัดสิน)
import { assertCan } from "@/lib/core/rbac";
import { requireMobile } from "@/lib/mobile/auth";
import { mobileMemberAuthError, mobileMemberError, mobileMemberScope } from "@/lib/mobile/member-routes";
import { canReadMember, staffSearch } from "@/lib/modules/member";

export async function GET(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileMemberAuthError(g);
  try {
    const { mc, actor, ctx } = await mobileMemberScope(g);
    if (!canReadMember(actor)) assertCan(mc, { module: "member", action: "member.customer.read" });
    const q = new URL(req.url).searchParams.get("q") ?? "";
    const items = await staffSearch(ctx, actor, q);
    return Response.json({ items });
  } catch (e) {
    return mobileMemberError(e);
  }
}
