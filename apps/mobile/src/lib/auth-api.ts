// เรียก API เข้า/สมัครด้วยเบอร์ (SMS OTP) ของแอป — ห่อ api() เดิม (src/api/client.ts) · สัญญา ledger/secretary-briefs/sec-brief-S1.19.md + RESOLUTIONS §H
//   POST /api/mobile/auth/sms/request {phone}                 → 200 {ok, resendAfterSec} เสมอ · 503 sms_unavailable (ยังไม่ตั้งผู้ให้บริการ SMS)
//   POST /api/mobile/auth/sms/verify  {phone, code, signup?}  → {token,…} | {needSignup:true} · 401 {error: invalid|expired|locked|not_found|bad_phone} · 409 email_taken|phone_taken|bad_input
//   POST /api/mobile/auth/phone/link  {phone, code} + Bearer  → {ok, phone} · 401 · 409 phone_taken|phone_change_locked
// เบอร์ normalize เป็น +66… ก่อนส่งทุกครั้ง (server ตรวจซ้ำ) · ไม่เก็บรหัสไว้ที่ไหนนอกจาก state ของจอ
import { api, ApiError } from "@/src/api/client";
import { normalizeThaiMobile } from "@/src/lib/phone";

export type SmsRequestResult = { ok: true; resendAfterSec: number };
export type SignupInput = { name: string; email: string };
export type SmsUser = { id: string; email: string | null; pendingEmail?: string | null; name: string | null; phone: string };
export type SmsVerifyResult =
  | { token: string; expiresAt?: string; user?: SmsUser; isNew?: boolean; needSignup?: undefined }
  | { needSignup: true; token?: undefined };

/** เบอร์ที่ส่ง server — normalize แล้ว (ใช้ไม่ได้ ⇒ ส่งตามที่พิมพ์ ให้ server ตอบเหตุผลเอง) */
const wire = (phone: string) => normalizeThaiMobile(phone) ?? phone.trim();

export function smsRequest(phone: string): Promise<SmsRequestResult> {
  return api<SmsRequestResult>("/api/mobile/auth/sms/request", { body: { phone: wire(phone) }, auth: false, tenant: false });
}

export function smsVerify(phone: string, code: string, signup?: SignupInput): Promise<SmsVerifyResult> {
  const body = signup
    ? { phone: wire(phone), code, signup: { name: signup.name.trim(), email: signup.email.trim().toLowerCase() } }
    : { phone: wire(phone), code };
  return api<SmsVerifyResult>("/api/mobile/auth/sms/verify", { body, auth: false, tenant: false });
}

export function phoneLink(phone: string, code: string): Promise<{ ok: true; phone: string }> {
  return api<{ ok: true; phone: string }>("/api/mobile/auth/phone/link", { body: { phone: wire(phone), code }, tenant: false });
}

/** รหัสเหตุผลจาก error ของ 3 route นี้ (ไม่ใช่ ApiError = "network") */
export function authErrorCode(e: unknown): string {
  if (!(e instanceof ApiError)) return "network";
  if (e.status === 503) return "sms_unavailable";
  if (e.status === 404 && e.code === "no_account") return "no_account";
  return e.code || "error";
}

/** รหัสเหตุผล → คีย์ i18n (auth.*) ที่จอแสดง · ไม่รู้จัก ⇒ ข้อความกลาง */
export function authErrorKey(code: string): string {
  switch (code) {
    case "network":
      return "auth.common.network";
    case "sms_unavailable":
      return "auth.common.smsUnavailable";
    case "rate_limited":
      return "auth.common.rateLimited";
    case "bad_phone":
      return "auth.common.badPhone";
    case "invalid":
    case "bad_code":
      return "auth.otp.badCode";
    case "expired":
      return "auth.otp.expired";
    case "locked":
      return "auth.otp.locked";
    case "not_found":
      return "auth.otp.notFound";
    case "email_taken":
      return "auth.otp.emailTaken";
    case "phone_taken":
      return "auth.otp.phoneTaken";
    case "bad_input":
      return "auth.otp.badInput";
    case "phone_change_locked":
      return "auth.phone.locked";
    default:
      return "auth.common.generic";
  }
}

/** จำนวนครั้งที่เหลือ ถ้า server ส่งมาในข้อความ error (ปัจจุบัน S1.19 ไม่ส่ง ⇒ null) */
export function attemptsLeftOf(e: unknown): number | null {
  const v = (e as { attemptsLeft?: unknown } | null)?.attemptsLeft;
  return typeof v === "number" && v >= 0 ? v : null;
}
