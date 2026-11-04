// POST /api/mobile/auth/sms/verify {phone, code, signup?:{email,name}} (S1.19 · R-K9 · R8 · §H)
//   code = สตริงใดก็ได้ ตัดเหลือตัวเลขก่อนเทียบ ("123 456" ใช้ได้)
//   ไม่ผ่าน ⇒ 401 {error: reason, message}
//   ผ่าน + เบอร์มีบัญชี ⇒ consume + Bearer ⇒ 200 {token, expiresAt, user, isNew:false} (signup ที่แนบมาถูกเมิน)
//   ผ่าน + ไม่มีบัญชี + ไม่มี signup ⇒ 200 {needSignup:true} — **ไม่ consume** (แอปขอชื่อ/อีเมลแล้วยิงซ้ำด้วยรหัสเดิม)
//   ผ่าน + signup ⇒ signupWithPhone (consume + สร้างบัญชีใน $transaction เดียว · ล้ม ⇒ 409 {error, message}) + Bearer ⇒ 200 {…, isNew:true}
//   user = {id, email (null = บัญชี placeholder), pendingEmail (อีเมลที่พิมพ์ตอนสมัคร ยังไม่ยืนยัน), name, phone}
import { prisma } from "@/lib/core/db";
import { verifyPhoneOtp, consumePhoneOtp, signupWithPhone, publicEmailOf } from "@/lib/core/phone-auth";
import { issueMobileToken } from "@/lib/mobile/auth";
import type { User } from "@prisma/client";

const REASON_TH: Record<string, string> = {
  bad_phone: "เบอร์มือถือไม่ถูกต้อง",
  not_found: "ไม่พบรหัสของเบอร์นี้ กรุณาขอรหัสใหม่",
  expired: "รหัสหมดอายุแล้ว ขอรหัสใหม่ได้",
  locked: "ใส่รหัสผิดหลายครั้ง กรุณาขอรหัสใหม่",
  invalid: "รหัสไม่ถูกต้อง",
};
const fail = (reason: string) => Response.json({ error: reason, message: REASON_TH[reason] ?? REASON_TH.invalid }, { status: 401 });
const userDto = (u: User, phone: string) => ({ id: u.id, ...publicEmailOf(u), name: u.name, phone });

export async function POST(req: Request): Promise<Response> {
  let body: { phone?: unknown; code?: unknown; signup?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const phone = typeof body?.phone === "string" ? body.phone : "";
  const code = typeof body?.code === "string" ? body.code : "";
  if (!phone || !code) return Response.json({ error: "bad_request" }, { status: 400 });

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

  const signup = body.signup && typeof body.signup === "object" ? (body.signup as { email?: unknown; name?: unknown }) : null;
  if (!signup) return Response.json({ needSignup: true }, { status: 200 });

  const s = await signupWithPhone(
    {
      phone: v.phone,
      email: typeof signup.email === "string" ? signup.email : "",
      name: typeof signup.name === "string" ? signup.name : "",
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
