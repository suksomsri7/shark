// POST /b/[slug]/auth/line — เข้าพอร์ทัลลูกค้าองค์กรด้วย LINE (LIFF) · ใบ C3.5 (+ มติผู้คุมงานรอบ 3 ข้อ S5)
//
// ลำดับด่าน (ก่อนแตะ LINE ทุกด่าน):
//   1) เพดานต่อ IP บนฐานข้อมูล (ถังของพอร์ทัล)
//   2) ร้านต้องเปิดพอร์ทัลจริง (`portalShopBySlug` — slug ไม่มี/ปิด/CRM รุ่น 1 = 404 ไม่ยิงไป LINE เลย)
//   3) `content-type: application/json` เท่านั้น (ฟอร์ม text/plain ข้ามเว็บ = 415) + ต้นทางเดียวกัน (`Origin` host ตรง หรือ
//      `Sec-Fetch-Site: same-origin` · ไม่มีทั้งคู่/ไม่ตรง = 403)
//   4) nonce ใช้ครั้งเดียว: คุกกี้ httpOnly (`__Host-` ตามกติกา APP_ENV) ที่ `portalLineNonceAction` ตั้ง เก็บ HMAC(nonce|slug|exp) —
//      ผูก slug · หมดอายุฝั่งเซิร์ฟเวอร์ 10 นาที · ลบทันทีที่ใช้ (`portal.lineNonceVerify`)
//   5) ตรวจ id_token กับ LINE (https://api.line.me/oauth2/v2.1/verify) — `aud` ต้องเท่ากับ LINE_CHANNEL_ID · `iss` ต้องเป็น
//      https://access.line.me · ถ้า token มี claim `nonce` (LINE Login ปกติ) จะส่ง nonce ให้ LINE ตรวจและเทียบซ้ำ
//      (LIFF ไม่ให้ใส่ nonce เองใน id_token — nonce ข้อ 4 จึงเป็นตัวผูกคำขอกับเบราว์เซอร์ · ดู wo-notes)
// 🔴 ห้ามถอด JWT เองแล้วเชื่อ `sub`/`email` — การถอดข้อ 5 ใช้แค่ดูว่ามี claim nonce ไหม ความจริงมาจาก LINE เท่านั้น
// 🔴 ตัวตน LINE ต้องตรงกับอีเมล/เบอร์ของผู้ติดต่อ (บริการตัดสิน) · คุกกี้ตั้งผ่าน `customerCookieOptions` ชุดเดียวกับลูกค้า (X10.2)
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { portal, portalPath } from "@/lib/modules/crm";
import { customerCookieOptions } from "@/lib/modules/member/session-facade";

const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const LINE_ISSUER = "https://access.line.me";

type Body = { idToken?: string; nonce?: string };

function fail(reason: string, status = 400, headers?: Record<string, string>): Response {
  return Response.json({ ok: false, reason }, { status, headers: { "cache-control": "no-store", ...(headers ?? {}) } });
}

function clientIp(req: Request): string {
  const xff = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  return xff || req.headers.get("x-real-ip")?.trim() || "";
}

/** คำขอมาจากหน้าของเราเอง — Origin host ตรงกับ host ของคำขอ หรือเบราว์เซอร์บอก same-origin */
function sameOrigin(req: Request): boolean {
  const site = (req.headers.get("sec-fetch-site") ?? "").trim().toLowerCase();
  if (site && site !== "same-origin") return false;
  const origin = (req.headers.get("origin") ?? "").trim();
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  if (origin) {
    try {
      return !!host && new URL(origin).host.toLowerCase() === host;
    } catch {
      return false;
    }
  }
  return site === "same-origin";
}

/** มี claim `nonce` ใน payload ของ id_token ไหม (ถอดเพื่อ "ตัดสินว่าจะส่ง nonce ให้ LINE ตรวจ" เท่านั้น — ไม่เชื่อค่าใด ๆ ในนี้) */
function tokenCarriesNonce(idToken: string): boolean {
  try {
    const part = idToken.split(".")[1] ?? "";
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { nonce?: unknown };
    return typeof json?.nonce === "string" && json.nonce.length > 0;
  } catch {
    return false;
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const ip = clientIp(req);
  const rl = await checkRateLimitDb(`crm:portal:line:${ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : "anon"}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) {
    const retryAfter = rl.retryAfterSec ?? 60;
    return fail(`มีการเข้าสู่ระบบจากเครือข่ายนี้ถี่เกินไป — รออีก ${retryAfter} วินาทีแล้วลองใหม่อีกครั้ง`, 429, { "Retry-After": String(retryAfter) });
  }

  const { slug } = await ctx.params;
  const shop = await portal.portalShopBySlug(slug);
  if (!shop) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return fail("รูปแบบคำขอไม่ถูกต้อง — กดเข้าสู่ระบบด้วย LINE จากหน้าพอร์ทัลอีกครั้ง", 415);
  if (!sameOrigin(req)) return fail("คำขอนี้ไม่ได้มาจากหน้าพอร์ทัลของร้าน — เปิดหน้าเข้าสู่ระบบแล้วกดใหม่อีกครั้ง", 403);

  const clientId = process.env.LINE_CHANNEL_ID ?? "";
  if (!clientId) return fail("ร้านนี้ยังไม่ได้เปิดการเข้าสู่ระบบด้วย LINE — ใช้อีเมลแทนได้");

  let idToken = "";
  let nonce = "";
  try {
    const body = (await req.json()) as Body;
    idToken = String(body?.idToken ?? "").trim();
    nonce = String(body?.nonce ?? "").trim();
  } catch {
    return fail("ข้อมูลที่ส่งมาไม่ครบ — ลองกดเข้าสู่ระบบด้วย LINE อีกครั้ง");
  }
  const jar = await cookies();
  const nonceCookie = portal.lineNonceCookieName();
  const sealed = jar.get(nonceCookie)?.value ?? "";
  // ลบคุกกี้ด้วยตัวเลือกชุดเดียวกับตอนตั้ง (`__Host-` ต้องมี Secure — `jar.delete` เปล่า ๆ ถูกเบราว์เซอร์ปฏิเสธ) · ด่านจริง = `lineNonceConsume`
  jar.set(nonceCookie, "", { ...customerCookieOptions(req.headers), maxAge: 0 });
  if (!idToken) return fail("ยังไม่ได้รับข้อมูลจาก LINE — ลองกดอีกครั้ง หรือใช้อีเมลแทน");
  // คุกกี้เก็บ `<exp>.<HMAC(nonce|slug|exp)>` — ผูก slug · หมดอายุฝั่งเซิร์ฟเวอร์ 10 นาที (มติผู้คุมงานรอบ 4)
  if (!(await portal.lineNonceConsume(slug, nonce, sealed))) return fail("หมดเวลาของการเข้าสู่ระบบรอบนี้ — กดเข้าสู่ระบบด้วย LINE อีกครั้ง", 401);

  let lineUserId = "";
  let email: string | null = null;
  try {
    const withNonce = tokenCarriesNonce(idToken);
    const res = await fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId, ...(withNonce ? { nonce } : {}) }),
      cache: "no-store",
    });
    if (!res.ok) return fail("ยืนยันตัวตนกับ LINE ไม่สำเร็จ — ลองอีกครั้ง หรือใช้อีเมลแทน", 401);
    const data = (await res.json()) as { sub?: string; aud?: string; iss?: string; email?: string; nonce?: string };
    if (!data?.sub || data.aud !== clientId || data.iss !== LINE_ISSUER || (withNonce && data.nonce !== nonce)) {
      return fail("ยืนยันตัวตนกับ LINE ไม่สำเร็จ — ลองอีกครั้ง หรือใช้อีเมลแทน", 401);
    }
    lineUserId = data.sub;
    email = typeof data.email === "string" ? data.email : null;
  } catch {
    return fail("ติดต่อ LINE ไม่สำเร็จในตอนนี้ — ลองใหม่อีกครั้ง หรือใช้อีเมลแทน", 502);
  }

  try {
    const result = await portal.loginWithLine(slug, { lineUserId, email }, { userAgent: req.headers.get("user-agent") ?? "liff", ip: ip || null });
    if ("pendingApproval" in result) {
      return Response.json({ ok: true, pendingApproval: true, message: "ข้อมูลบัญชี LINE ไม่ตรงกับที่ร้านมี — ส่งคำขอให้ร้านตรวจสอบแล้ว ร้านจะเปิดสิทธิ์ให้หลังยืนยัน" });
    }
    jar.set(result.cookieName, result.token, customerCookieOptions(req.headers));
    return Response.json({ ok: true, next: portalPath(slug) });
  } catch (e) {
    const msg = e instanceof Error && /[ก-๙]/.test(e.message) ? e.message : "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ — ลองอีกครั้ง หรือใช้อีเมลแทน";
    return fail(msg, 401);
  }
}
