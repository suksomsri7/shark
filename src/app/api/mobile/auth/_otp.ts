// _otp.ts — ด่านร่วมของเส้นตรวจรหัส SMS (`auth/sms/verify` · `auth/phone/link`) — ไม่ใช่ route (SEC S3a.1-S2 · R-Z18 · L4 MAJOR-1)
//   body zod strict ≤ 4 KB · เพดานตรวจรหัสต่อ ip + ต่อเบอร์ (`verifyRateLimit`) · เหตุผลที่ส่งให้แอปยุบเหลือ invalid (ยกเว้น bad_phone/locked)
import type { z } from "zod";
import { verifyRateLimit } from "@/lib/core/phone-auth";

const BODY_MAX = 4 * 1024;

const REASON_TH: Record<string, string> = {
  bad_phone: "เบอร์มือถือไม่ถูกต้อง",
  locked: "ใส่รหัสผิดหลายครั้ง กรุณาขอรหัสใหม่",
  invalid: "รหัสไม่ถูกต้องหรือหมดอายุแล้ว — ตรวจรหัสอีกครั้ง หรือขอรหัสใหม่",
};

/** 401 ของรหัสไม่ผ่าน — not_found/expired/invalid ⇒ invalid (ไม่บอกว่าเบอร์นี้มีรหัสค้างไหม) */
export function otpFail(reason: string): Response {
  const error = reason === "bad_phone" || reason === "locked" ? reason : "invalid";
  return Response.json({ error, message: REASON_TH[error] }, { status: 401 });
}

const badRequest = () => Response.json({ error: "bad_request", message: "ข้อมูลที่ส่งมาไม่ครบหรือไม่ถูกต้อง" }, { status: 400 });

/** อ่าน body (≤ 4 KB · JSON · zod strict) — ผิด ⇒ 400 bad_request พร้อมข้อความไทย */
export async function otpBody<T extends z.ZodType>(req: Request, schema: T): Promise<{ ok: true; v: z.infer<T> } | { ok: false; res: Response }> {
  const raw = await req.text().catch(() => "");
  if (raw.length > BODY_MAX) return { ok: false, res: Response.json({ error: "too_large", message: "ข้อมูลที่ส่งมาใหญ่เกินไป" }, { status: 413 }) };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, res: badRequest() };
  }
  const r = schema.safeParse(json);
  return r.success ? { ok: true, v: r.data } : { ok: false, res: badRequest() };
}

/** เพดานการตรวจรหัส — เกิน ⇒ 429 {error:"rate_limited", message, retryAfterSec} + Retry-After · ผ่าน ⇒ null */
export async function otpRateLimited(req: Request, phone: string): Promise<Response | null> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || null;
  const retryAfterSec = await verifyRateLimit(ip, phone);
  if (retryAfterSec === null) return null;
  return Response.json(
    { error: "rate_limited", message: "ลองใส่รหัสบ่อยเกินไป รอสักครู่แล้วลองใหม่", retryAfterSec },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
