// POST /api/mobile/auth/otp {email} → 200 {ok:true} เสมอ (แม้อีเมลไม่มีจริง/rate limit) เพื่อกัน enumeration
// rate limit + ส่ง OTP/magic link อยู่ใน requestLogin เดิม — ห้ามคืน otp/link ใน response เด็ดขาด
import { requestLogin } from "@/lib/core/auth";

export async function POST(req: Request): Promise<Response> {
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email : "";
  if (!email) return Response.json({ error: "bad_request" }, { status: 400 });
  // จับ throw ของ rate limit/ส่งเมลพัง แล้วตอบ 200 เหมือนกันทุกกรณี — ไม่บอกสถานะให้คนสุ่มอีเมล
  // ส่ง IP ด้วย — ไม่งั้นด่านกันถล่ม "20 ครั้ง/10 นาที/IP" ใน requestLogin ไม่เคยทำงานบนเส้นทางแอป
  // (เหลือแค่ด่านต่ออีเมล → ยิงสุ่มอีเมลจาก IP เดียวได้ไม่จำกัด = ระเบิดเมล + ค่า Resend)
  // อ่านจาก req โดยตรง (ไม่ใช้ next/headers) — ข้อสอบเรียก handler ตรง ๆ นอก request scope ได้ด้วย
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  try {
    await requestLogin(email, ip);
  } catch {
    /* กลืน error ไว้ — always 200 กัน enumeration */
  }
  return Response.json({ ok: true }, { status: 200 });
}
