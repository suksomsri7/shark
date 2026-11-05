// _staff.ts — รูปตอบของเส้นพนักงาน/คำเชิญ (ไม่ใช่ route) · S1.25 lib ตัดสินสิทธิ์จากฐานเอง (OWNER/MANAGER · MANAGER แตะได้เฉพาะ STAFF)
import type { InviteResult } from "@/lib/staff/invite";
import type { StaffResult } from "@/lib/staff/service";
import { fail, forbidden, notFound, ok } from "../_shared";

const STATUS: Record<string, number> = {
  forbidden: 403,
  not_found: 404,
  accepted: 409,
  already_member: 409,
  already_invited: 409,
  pending_cap: 409,
  throttled: 429,
  rate_limited: 429,
  sms_unavailable: 503,
};

/** ผลเชิญ/ส่งซ้ำ — ลิงก์ (มีรหัสเชิญ) คืนเฉพาะเมื่อ SMS ไม่ได้ส่งจริง (ให้ผู้เชิญส่งต่อเอง) · รหัสใช้ได้กับเบอร์ในใบเท่านั้น (acceptInviteByCode ตรวจเบอร์) */
export function inviteResponse(r: InviteResult): Response {
  if (r.ok) return ok({ ok: true, inviteId: r.inviteId, sms: r.sms, expiresAt: r.expiresAt, link: r.sms === "sent" ? null : r.link });
  return fail(STATUS[r.reason] ?? 400, r.reason, r.message);
}

/** ผลตั้งสิทธิ์/ระงับ/เอาออก — lib คืนเหตุผลไทยอย่างเดียว ⇒ 400 `refused` + ข้อความ (สิทธิ์ไม่พอก็อยู่ในข้อความ) */
export function staffResponse(r: StaffResult): Response {
  return r.ok ? ok({ ok: true }) : fail(400, "refused", r.reason);
}

export { forbidden, notFound };
