// POST /api/mobile/auth/sms/verify {phone, code, signup?:{email,name}} (S1.19 · R-K9 · R8 · §H)
//   code = สตริงใดก็ได้ ตัดเหลือตัวเลขก่อนเทียบ ("123 456" ใช้ได้)
//   SEC S3a.1-S2 ▸ R-Z18: body = zod strict (≤ 4 KB) ผิด ⇒ 400 {error:"bad_request", message} · เพดาน `sms-verify:<ip>` 30/10 นาที +
//     `sms-verify:<เบอร์>` 10/10 นาที ⇒ 429 {error:"rate_limited", message, retryAfterSec} + Retry-After ·
//     ไม่ผ่าน ⇒ 401 {error, message} โดย error ∈ {invalid, bad_phone, locked} (not_found/expired ยุบเป็น invalid — ไม่บอกว่าเบอร์ไหนเพิ่งขอรหัส) ◂
//   ผ่าน + เบอร์มีบัญชี ⇒ consume + Bearer ⇒ 200 {token, expiresAt, user, isNew:false} (signup ที่แนบมาถูกเมิน)
//   ผ่าน + ไม่มีบัญชี + ไม่มี signup ⇒ 200 {needSignup:true} — **ไม่ consume** (แอปขอชื่อ/อีเมลแล้วยิงซ้ำด้วยรหัสเดิม)
//   ผ่าน + signup ⇒ signupWithPhone (consume + สร้างบัญชีใน $transaction เดียว · ล้ม ⇒ 409 {error, message}) + Bearer ⇒ 200 {…, isNew:true}
//   user = {id, email (null = บัญชี placeholder), pendingEmail (อีเมลที่พิมพ์ตอนสมัคร ยังไม่ยืนยัน), name, phone}
import { prisma } from "@/lib/core/db";
import { verifyPhoneOtp, consumePhoneOtp, signupWithPhone, publicEmailOf } from "@/lib/core/phone-auth";
import { issueMobileToken } from "@/lib/mobile/auth";
import type { User } from "@prisma/client";
import { z } from "zod";
import { otpBody, otpFail, otpRateLimited } from "../../_otp";

const Body = z
  .object({
    phone: z.string().min(1).max(40),
    code: z.string().min(1).max(20),
    signup: z.object({ email: z.string().max(254), name: z.string().max(120) }).strict().optional(),
  })
  .strict();

const fail = otpFail;
const userDto = (u: User, phone: string) => ({ id: u.id, ...publicEmailOf(u), name: u.name, phone });

export async function POST(req: Request): Promise<Response> {
  const b = await otpBody(req, Body);
  if (!b.ok) return b.res;
  const { phone, code } = b.v;
  const limited = await otpRateLimited(req, phone);
  if (limited) return limited;

  const v = await verifyPhoneOtp(phone, code);
  if (!v.ok) return fail(v.reason);

  const meta = {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    userAgent: req.headers.get("user-agent") ?? "mobile",
  };

  // เบอร์นี้มีบัญชีแล้ว ⇒ เข้าใช้ (signup ที่แนบมาถูกเมิน)
  if (v.userId) {
    const user = await prisma.user.findUnique({ where: { id: v.userId } });
    if (!user) return fail("invalid");
    if (!(await consumePhoneOtp(v.otpId))) return fail("invalid");
    const { token, expiresAt } = await issueMobileToken(user.id, meta);
    return Response.json({ token, expiresAt, user: userDto(user, v.phone), isNew: false }, { status: 200 });
  }

  const signup = b.v.signup ?? null;
  if (!signup) return Response.json({ needSignup: true }, { status: 200 });

  const s = await signupWithPhone(
    {
      phone: v.phone,
      email: signup.email,
      name: signup.name,
    },
    { otpId: v.otpId },
  );
  if (!s.ok) {
    if (s.reason === "otp_used") return fail("invalid");
    return Response.json({ error: s.reason, message: s.message }, { status: 409 });
  }
  const { token, expiresAt } = await issueMobileToken(s.user.id, meta);
  return Response.json({ token, expiresAt, user: userDto(s.user, v.phone), isNew: true }, { status: 200 });
}
