// POST /api/mobile/member/scan {token} — สแกน QR บัตรสมาชิก (แอปพนักงาน จอ ก · ภาพ 28) · M3.11
// ค่าใน QR = `SHARK-MC:<token>` (token อายุ 24 ชม. ของหน้า /m/<slug>/card — ไม่ใช่รหัสสมาชิก)
// สิทธิ์: อ่านสมาชิก · หมดอายุ/คนละร้าน/นอกสาขาที่ดูแล = 404 เดียวกันหมด (ไม่บอกว่าเคยมีบัตรนี้จริงไหม)
import { assertCan } from "@/lib/core/rbac";
import { requireMobile } from "@/lib/mobile/auth";
import { mobileMemberAuthError, mobileMemberError, mobileMemberScope, readJson } from "@/lib/mobile/member-routes";
import { canReadMember, staffScan } from "@/lib/modules/member";

export async function POST(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileMemberAuthError(g);
  try {
    const { mc, actor, ctx } = await mobileMemberScope(g);
    if (!canReadMember(actor)) assertCan(mc, { module: "member", action: "member.customer.read" });
    const body = await readJson(req);
    const token = typeof body.token === "string" ? body.token : "";
    const member = await staffScan(ctx, actor, token);
    if (!member) {
      return Response.json(
        { error: "not_found", message: "อ่านบัตรนี้ไม่ได้ — ให้ลูกค้าเปิดหน้าบัตรสมาชิกใหม่แล้วสแกนอีกครั้ง หรือค้นด้วยชื่อ/เบอร์แทน" },
        { status: 404 },
      );
    }
    return Response.json({ member });
  } catch (e) {
    return mobileMemberError(e);
  }
}
