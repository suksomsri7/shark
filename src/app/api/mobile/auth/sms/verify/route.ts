// POST /api/mobile/auth/sms/verify {phone, code, signup?:{email,name}} (S1.19 · R-K9 · R8)
//   ไม่ผ่าน ⇒ 401 {error: reason, message}
//   ผ่าน + เบอร์มีบัญชี ⇒ consume + Bearer ⇒ 200 {token, expiresAt, user:{id,email,name,phone}, isNew:false}
//   ผ่าน + ไม่มีบัญชี + ไม่มี signup ⇒ 200 {needSignup:true} — **ไม่ consume** (แอปขอชื่อ/อีเมลแล้วยิงซ้ำด้วยรหัสเดิม)
//   ผ่าน + signup ⇒ signupWithPhone (ล้ม ⇒ 409 {error, message}) + consume + Bearer ⇒ 200 {…, isNew:true}
import { prisma } from "@/lib/core/db";
import { verifyPhoneOtp, consumePhoneOtp, signupWithPhone } from "@/lib/core/phone-auth";
import { issueMobileToken } from "@/lib/mobile/auth";

const REASON_TH: Record<string, string> = {
  bad_phone: "เบอร์โทรไม่ถูกต้อง",
  not_found: "ไม่พบรหัสของเบอร์นี้ กรุณาขอรหัสใหม่",
  expired: "รหัสหมดอายุแล้ว ขอรหัสใหม่ได้",
  locked: "ใส่รหัสผิดหลายครั้ง กรุณาขอรหัสใหม่",
  invalid: "รหัสไม่ถูกต้อง",
};
const fail = (reason: string) => Response.json({ error: reason, message: REASON_TH[reason] ?? REASON_TH.invalid }, { status: 401 });

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
    return Response.json(
      { token, expiresAt, user: { id: user.id, email: user.email, name: user.name, phone: v.phone }, isNew: false },
      { status: 200 },
    );
  }

  const signup = body.signup && typeof body.signup === "object" ? (body.signup as { email?: unknown; name?: unknown }) : null;
  if (!signup) return Response.json({ needSignup: true }, { status: 200 });

  const s = await signupWithPhone({
    phone: v.phone,
    email: typeof signup.email === "string" ? signup.email : "",
    name: typeof signup.name === "string" ? signup.name : "",
  });
  if (!s.ok) return Response.json({ error: s.reason, message: s.message }, { status: 409 });
  // ใช้รหัสพร้อมกันอีกทาง (หายากมาก) ⇒ บัญชีสร้างแล้วแต่ไม่ออก token ให้คำขอนี้ — ผู้ใช้เข้าใหม่ด้วยเบอร์ได้
  if (!(await consumePhoneOtp(v.otpId))) return fail("invalid");
  const { token, expiresAt } = await issueMobileToken(s.user.id, meta);
  return Response.json(
    { token, expiresAt, user: { id: s.user.id, email: s.user.email, name: s.user.name, phone: v.phone }, isNew: true },
    { status: 200 },
  );
}
