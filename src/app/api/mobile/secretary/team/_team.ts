// _team.ts — ส่วนร่วมของเส้นแชททีม `/api/mobile/secretary/team/**` (B27 · ไม่ใช่ route)
//   ด่าน = `gate(req, null)` (Bearer + x-tenant-id + สมาชิกร้านที่รับแล้ว — สมาชิก "คุยอย่างเดียว" ใช้ได้) · lib ตัดสินสิทธิ์ห้อง/ผู้ดูแลเอง
//   ไม่ใช่สมาชิกห้อง/ห้องร้านอื่น = 404 เสมอ (ไม่บอกว่ามีจริง)
import type { TeamCtx, TeamFail } from "@/lib/team-chat/service";
import { fail, type SecCtx } from "../_shared";

export const teamCtx = (c: SecCtx): TeamCtx => ({ tenantId: c.tenantId, userId: c.userId });
export const rlKey = (c: SecCtx) => `${c.tenantId}:${c.userId}`;

const STATUS: Record<TeamFail["reason"], number> = {
  forbidden: 403,
  not_found: 404,
  invalid: 400,
  rate_limited: 429,
  already_member: 409,
  already_invited: 409,
  not_lekaa: 404,
  conflict: 409,
};

export function teamFail(f: TeamFail): Response {
  if (f.reason === "rate_limited") {
    return Response.json({ error: "rate_limited", message: f.message, retryAfterSec: 3600 }, { status: 429, headers: { "Retry-After": "3600" } });
  }
  return fail(STATUS[f.reason] ?? 400, f.reason, f.message);
}
