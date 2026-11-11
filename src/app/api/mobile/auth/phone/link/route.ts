// POST /api/mobile/auth/phone/link + Bearer {phone, code} → 200 {ok:true, phone} (S1.19 · R8 บัญชีเดิมต้องผูกเบอร์ · §H)
//   ไม่มี Bearer ⇒ 401 · body ผิด ⇒ 400 · รหัสไม่ผ่าน ⇒ 401 {error, message} (error ∈ invalid/bad_phone/locked · R-Z18)
//   SEC S3a.1-S2 ▸ R-Z18: zod strict ≤ 4 KB · เพดาน sms-verify ต่อ ip/เบอร์ (ตัวเดียวกับ sms/verify) ⇒ 429 มาตรฐาน ◂
//   เบอร์ของบัญชีอื่น ⇒ 409 phone_taken · บัญชีมีเบอร์อื่นอยู่แล้ว ⇒ 409 phone_change_locked (ติดต่อทีมงาน · R-S1.19e)
//   ตรวจทุกข้อก่อน consume · consume + ผูกเบอร์ใน $transaction เดียว (linkPhoneToUser opts.otpId)
import { mobileUser } from "@/lib/mobile/auth";
import { verifyPhoneOtp, linkPhoneToUser } from "@/lib/core/phone-auth";
import { z } from "zod";
import { otpBody, otpFail, otpRateLimited } from "../../_otp";

const Body = z.object({ phone: z.string().min(1).max(40), code: z.string().min(1).max(20) }).strict();

const fail = otpFail;

export async function POST(req: Request): Promise<Response> {
  const user = await mobileUser(req);
  if (!user) return Response.json({ error: "unauthorized", message: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  const b = await otpBody(req, Body);
  if (!b.ok) return b.res;
  const { phone, code } = b.v;
  const limited = await otpRateLimited(req, phone);
  if (limited) return limited;

  const v = await verifyPhoneOtp(phone, code);
  if (!v.ok) return fail(v.reason);
  // เบอร์ของคนอื่น ⇒ ปฏิเสธก่อน consume (รหัสยังใช้เข้าบัญชีเจ้าของเบอร์ได้)
  if (v.userId && v.userId !== user.id)
    return Response.json({ error: "phone_taken", message: "เบอร์นี้ผูกกับบัญชีอื่นอยู่แล้ว" }, { status: 409 });
  const r = await linkPhoneToUser(user.id, v.phone, { otpId: v.otpId });
  if (!r.ok) {
    if (r.reason === "otp_used") return fail("invalid");
    return Response.json({ error: r.reason, message: r.message }, { status: 409 });
  }
  return Response.json({ ok: true, phone: v.phone }, { status: 200 });
}
