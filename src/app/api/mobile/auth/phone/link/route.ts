// POST /api/mobile/auth/phone/link + Bearer {phone, code} → 200 {ok:true, phone} (S1.19 · R8 บัญชีเดิมต้องผูกเบอร์ · §H)
//   ไม่มี Bearer ⇒ 401 · body ผิด ⇒ 400 · รหัสไม่ผ่าน ⇒ 401 {error, message}
//   เบอร์ของบัญชีอื่น ⇒ 409 phone_taken · บัญชีมีเบอร์อื่นอยู่แล้ว ⇒ 409 phone_change_locked (ติดต่อทีมงาน · R-S1.19e)
//   ตรวจทุกข้อก่อน consume · consume + ผูกเบอร์ใน $transaction เดียว (linkPhoneToUser opts.otpId)
import { mobileUser } from "@/lib/mobile/auth";
import { verifyPhoneOtp, linkPhoneToUser } from "@/lib/core/phone-auth";

const REASON_TH: Record<string, string> = {
  bad_phone: "เบอร์มือถือไม่ถูกต้อง",
  not_found: "ไม่พบรหัสของเบอร์นี้ กรุณาขอรหัสใหม่",
  expired: "รหัสหมดอายุแล้ว ขอรหัสใหม่ได้",
  locked: "ใส่รหัสผิดหลายครั้ง กรุณาขอรหัสใหม่",
  invalid: "รหัสไม่ถูกต้อง",
};
const fail = (reason: string) => Response.json({ error: reason, message: REASON_TH[reason] ?? REASON_TH.invalid }, { status: 401 });

export async function POST(req: Request): Promise<Response> {
  const user = await mobileUser(req);
  if (!user) return Response.json({ error: "unauthorized", message: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  let body: { phone?: unknown; code?: unknown };
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
