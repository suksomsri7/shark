// POST /api/mobile/secretary/invites/accept {code} | {inviteId} — รับคำเชิญ (S1.25 R-S1.25b) · Bearer อย่างเดียว (ยังไม่เป็นสมาชิกร้านนั้น)
//   `code` = จากลิงก์ /i/<code> (`acceptInviteByCode`) · `inviteId` = การ์ดคำเชิญของผู้ใช้เดิม (`acceptInvite`) · เบอร์ที่ยืนยันแล้วต้องตรงใบ (lib ตรวจ)
import { z } from "zod";
import { acceptInvite, acceptInviteByCode } from "@/lib/staff/invite";
import { fail, ID_MAX, ok, readBody, thrown, userGate, withRateLimit, withErrors } from "../../_shared";

const Body = z.object({ code: z.string().trim().min(1).max(40).optional(), inviteId: z.string().trim().min(1).max(ID_MAX).optional() }).strict();
const STATUS = { not_found: 404, expired: 410, accepted: 409, phone_mismatch: 403 } as const;
const MSG = {
  not_found: "ไม่พบคำเชิญนี้ ตรวจลิงก์อีกครั้ง",
  expired: "คำเชิญนี้หมดอายุแล้ว ขอให้ร้านส่งใหม่",
  accepted: "คำเชิญนี้ถูกใช้ไปแล้ว",
  phone_mismatch: "คำเชิญนี้เป็นของเบอร์อื่น — เข้าด้วยเบอร์ที่ได้รับคำเชิญ",
} as const;

async function POST_(req: Request) {
  const a = await userGate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.userId, "invite-accept", 10);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  if (!b.v.code === !b.v.inviteId) return fail(400, "invalid", "ส่งรหัสเชิญหรือรหัสใบเชิญอย่างใดอย่างหนึ่ง");
  try {
    const r = b.v.code ? await acceptInviteByCode(a.userId, b.v.code) : await acceptInvite(a.userId, b.v.inviteId!);
    if (r.ok) return ok({ ok: true, tenantId: r.tenantId });
    return fail(STATUS[r.reason], r.reason, MSG[r.reason]);
  } catch (e) {
    return thrown(e, "invites.accept");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("secretary/invites/accept POST", POST_);
