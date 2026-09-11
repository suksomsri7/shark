// /api/mobile/member/stamp — ประทับสแตมป์ด้วย PIN (แอปพนักงาน จอ ค · ภาพ 28) · M3.11
//   GET  ?customerId=  → { cards[] } ใบที่ประทับให้คนนี้ได้ (+ ต้อง PIN ไหม · รางวัลเมื่อครบ) — สิทธิ์อ่านสมาชิก
//   POST { customerId, cardId, pin?, note?, requestId } → { card, completed, banner } — สิทธิ์ `member.loyalty.stamp`
// 🔴 ประทับผ่าน facade stamp (`addStamp` — ทางเข้าเดียวของทั้งระบบ) ที่ `member.staffStamp` ห่อไว้
//    ใบที่ร้านตั้ง PIN ต้อง PIN ตรง · `requestId` จากแอป = รหัสกันซ้ำ (กดซ้ำ/ส่งซ้ำ = ได้ตราเดียว)
import { assertCan } from "@/lib/core/rbac";
import { requireMobile } from "@/lib/mobile/auth";
import { mobileMemberAuthError, mobileMemberError, mobileMemberScope, readJson } from "@/lib/mobile/member-routes";
import { canReadMember, staffStamp, staffStampCards } from "@/lib/modules/member";

export async function GET(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileMemberAuthError(g);
  try {
    const { mc, actor, ctx } = await mobileMemberScope(g);
    if (!canReadMember(actor)) assertCan(mc, { module: "member", action: "member.customer.read" });
    const customerId = new URL(req.url).searchParams.get("customerId") ?? "";
    return Response.json({ cards: await staffStampCards(ctx, actor, customerId) });
  } catch (e) {
    return mobileMemberError(e);
  }
}

export async function POST(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileMemberAuthError(g);
  try {
    const { mc, actor, ctx } = await mobileMemberScope(g);
    assertCan(mc, { module: "member", action: "member.loyalty.stamp" });
    const body = await readJson(req);
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    const result = await staffStamp(ctx, actor, {
      customerId: str(body.customerId),
      cardId: str(body.cardId),
      pin: str(body.pin) || null,
      note: str(body.note) || null,
      requestId: str(body.requestId),
    });
    return Response.json(result);
  } catch (e) {
    return mobileMemberError(e);
  }
}
