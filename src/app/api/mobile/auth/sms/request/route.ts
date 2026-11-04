// POST /api/mobile/auth/sms/request {phone} → 200 {ok:true, resendAfterSec} เสมอ (S1.19 · กัน enumeration)
// เบอร์ผิด/ขอถี่เกิน/ส่ง SMS ล้ม = ตอบเหมือนกันหมด — ไม่บอกสถานะให้คนสุ่มเบอร์ · ห้ามคืนรหัสใน response เด็ดขาด
// อ่าน ip จาก req โดยตรง (ไม่ใช้ next/headers) เหมือน auth/otp — ด่าน 20 ครั้ง/10 นาที/IP ต้องได้ ip จริง
import { requestPhoneOtp, PHONE_RESEND_SEC } from "@/lib/core/phone-auth";
import { logOps } from "@/lib/core/ops";

export async function POST(req: Request): Promise<Response> {
  let body: { phone?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const phone = typeof body?.phone === "string" ? body.phone : "";
  if (!phone) return Response.json({ error: "bad_request" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  try {
    const r = await requestPhoneOtp(phone, { ip });
    // บันทึกเฉพาะเกตเวย์ล้ม (ไม่มีเบอร์/รหัสใน log) — ให้ ops เห็นว่า SMS ส่งไม่ออก
    if (!r.ok && r.reason === "sms_failed") await logOps("WARN", "sms-otp", "ส่ง SMS OTP ไม่สำเร็จ");
  } catch {
    /* กลืน error — always 200 กัน enumeration */
  }
  return Response.json({ ok: true, resendAfterSec: PHONE_RESEND_SEC }, { status: 200 });
}
