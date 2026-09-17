// POST /m/[slug]/auth/line — เข้าสู่ระบบลูกค้าด้วย LINE (LIFF)
//
// 🔴 id_token ที่หน้าจอส่งมา **ต้องถูกตรวจกับ LINE ก่อนเสมอ** (https://api.line.me/oauth2/v2.1/verify)
//    ห้ามถอด payload เองแล้วเชื่อ `sub` — ใครก็ปลอม JWT ส่งมาได้ = ยึดบัญชีสมาชิกคนอื่นได้ทันที
//    endpoint `verify` ของ LINE ตรวจลายเซ็น + หมดอายุ + ว่า token นี้ออกให้ช่องทางของเราจริง (aud)
// 🔴 ไม่มี `LINE_CHANNEL_ID` ในระบบ = ปิดสนิท (400) ไม่ใช่ "ปล่อยผ่านชั่วคราว"
// 🔴 ไม่เคยผูก LINE กับสมาชิกไหน → ไม่ออก session แต่ส่ง `next` ไปหน้าสมัคร/ผูกบัญชี
// 🔴 AUDIT L7: เส้นนี้เป็นหน้าสาธารณะที่ยิงออกไปหา LINE ทุกคำขอ แต่เดิม **ไม่มีเพดานเลย**
//    ⇒ ใส่ด่านเพดานบนฐานข้อมูล ถังเดียวกับ `join-actions.gate()`/เลนสาธารณะของ REST
//    (ยิงสลับสองทางก็ไม่ได้เพดานสองเท่า) และต้องเป็น **สิ่งแรกสุด** ก่อนอ่าน env/แกะ body
//    ไม่งั้นคำขอที่ไม่มี body ก็ยังใช้เป็นช่องยิงถล่มได้โดยไม่ถูกนับ
import { cookies } from "next/headers";
import { sha256 } from "@/lib/core/hash";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { JOIN_RATE_LIMITS } from "@/lib/modules/member/api/public-lane";
import { customerCookieOptions } from "@/lib/modules/member/customer-cookie";
import { loginWithLine } from "@/lib/modules/member/customer-session";

const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

type Body = { idToken?: string };

function fail(reason: string, status = 400, headers?: Record<string, string>): Response {
  return Response.json({ ok: false, reason }, { status, ...(headers ? { headers } : {}) });
}

/** IP ของผู้เรียก (หลัง proxy) — ไม่รู้ = ถังรวม "anon" เหมือนเลนสาธารณะของ REST */
function clientIp(req: Request): string {
  const xff = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  return xff || req.headers.get("x-real-ip")?.trim() || "";
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  // ── ด่านเพดานต่อ IP (AUDIT L7) — ก่อนอย่างอื่นทั้งหมด ──
  const ip = clientIp(req);
  const spec = JOIN_RATE_LIMITS.write;
  const rl = await checkRateLimitDb(`mbr:api:join:write:${ip ? sha256(ip).slice(0, 16) : "anon"}`, spec);
  if (!rl.ok) {
    const retryAfter = rl.retryAfterSec ?? Math.ceil(spec.windowMs / 1000);
    return fail(`มีการเข้าสู่ระบบจากเครือข่ายนี้ถี่เกินไป — รออีก ${retryAfter} วินาทีแล้วลองใหม่อีกครั้ง`, 429, {
      "Retry-After": String(retryAfter),
    });
  }

  const { slug } = await ctx.params;
  const clientId = process.env.LINE_CHANNEL_ID ?? "";
  if (!clientId) return fail("ร้านนี้ยังไม่ได้เปิดการเข้าสู่ระบบด้วยไลน์ — ใช้เบอร์หรืออีเมลแทนได้");

  let idToken = "";
  try {
    const body = (await req.json()) as Body;
    idToken = String(body?.idToken ?? "").trim();
  } catch {
    return fail("ข้อมูลที่ส่งมาไม่ครบ — ลองกดเข้าสู่ระบบด้วยไลน์อีกครั้ง");
  }
  if (!idToken) return fail("ยังไม่ได้รับข้อมูลจากไลน์ — ลองกดอีกครั้ง หรือใช้เบอร์/อีเมลแทน");

  let lineUserId = "";
  let displayName: string | null = null;
  try {
    const res = await fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
      cache: "no-store",
    });
    if (!res.ok) return fail("ยืนยันตัวตนกับไลน์ไม่สำเร็จ — ลองอีกครั้ง หรือใช้เบอร์/อีเมลแทน", 401);
    const data = (await res.json()) as { sub?: string; name?: string; aud?: string };
    if (!data?.sub || (data.aud && data.aud !== clientId)) {
      return fail("ยืนยันตัวตนกับไลน์ไม่สำเร็จ — ลองอีกครั้ง หรือใช้เบอร์/อีเมลแทน", 401);
    }
    lineUserId = data.sub;
    displayName = typeof data.name === "string" ? data.name : null;
  } catch {
    return fail("ติดต่อไลน์ไม่สำเร็จในตอนนี้ — ลองใหม่อีกครั้ง หรือใช้เบอร์/อีเมลแทน", 502);
  }

  const result = await loginWithLine(
    slug,
    { lineUserId, displayName },
    { userAgent: req.headers.get("user-agent") ?? "liff", ip: ip || null },
  );
  if ("needsJoin" in result) {
    return Response.json({ ok: true, needsJoin: true, next: result.joinUrl });
  }

  // 🔴 AUDIT L5: `Secure` ผูกกับโปรโตคอลของคำขอ/สภาพแวดล้อม ไม่ใช่ชื่อ cookie (customer-cookie.ts)
  const jar = await cookies();
  jar.set(result.cookieName, result.token, customerCookieOptions(req.headers));
  return Response.json({ ok: true, next: `/m/${slug}/card` });
}
