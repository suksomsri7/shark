// GET /api/mobile/member/summary?id=<customerId> — การ์ดสรุปสมาชิก (แอปพนักงาน จอ ข · ภาพ 28) · M3.11
// หัวการ์ด (ชื่อ · รหัส · ระดับ) · ตัวเลข 3 (แต้ม/voucher/สแตมป์) · ประวัติ 3 รายการ · ลิงก์หน้าเว็บของปุ่มลัด
// สิทธิ์: อ่านสมาชิก · มองไม่เห็นคนนี้ (ข้ามร้าน/นอกสาขา) = 404
import { assertCan } from "@/lib/core/rbac";
import { requireMobile } from "@/lib/mobile/auth";
import { mobileMemberAuthError, mobileMemberError, mobileMemberScope } from "@/lib/mobile/member-routes";
import { canReadMember, staffSummary } from "@/lib/modules/member";

export async function GET(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileMemberAuthError(g);
  try {
    const { mc, actor, ctx } = await mobileMemberScope(g);
    if (!canReadMember(actor)) assertCan(mc, { module: "member", action: "member.customer.read" });
    const id = new URL(req.url).searchParams.get("id") ?? "";
    return Response.json(await staffSummary(ctx, actor, id));
  } catch (e) {
    return mobileMemberError(e);
  }
}
