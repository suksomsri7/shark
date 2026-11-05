// GET /api/mobile/secretary/invites/[code] — หน้าดูคำเชิญก่อนรับ (สาธารณะ · `previewInvite` · ชื่อร้าน + ชื่อผู้ถูกเชิญ + เบอร์ปิดเลขกลาง)
//   ไม่ต้องล็อกอิน ⇒ เพดานต่อ IP 30/นาที (กันเดารหัส · หนี้ O-9)
import { previewInvite } from "@/lib/staff/invite";
import { clientIp, fail, idParam, ok, withRateLimit, type RouteCtx } from "../../_shared";

const STATUS = { not_found: 404, expired: 410, accepted: 409 } as const;

export async function GET(req: Request, ctx: RouteCtx<"code">) {
  const rl = await withRateLimit(clientIp(req), "invite-preview", 30);
  if (rl) return rl;
  const code = await idParam(ctx, "code");
  const r = code ? await previewInvite(code) : ({ ok: false, reason: "not_found" } as const);
  if (r.ok) return ok({ tenantName: r.tenantName, name: r.name, role: r.role, phoneMasked: r.phoneMasked, expiresAt: r.expiresAt });
  return fail(STATUS[r.reason], r.reason, r.reason === "expired" ? "คำเชิญนี้หมดอายุแล้ว" : r.reason === "accepted" ? "คำเชิญนี้ถูกใช้ไปแล้ว" : "ไม่พบคำเชิญนี้");
}
