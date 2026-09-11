// POST /m/[slug]/auth/line — เข้าสู่ระบบลูกค้าด้วย LINE (LIFF)
//
// 🔴 id_token ที่หน้าจอส่งมา **ต้องถูกตรวจกับ LINE ก่อนเสมอ** (https://api.line.me/oauth2/v2.1/verify)
//    ห้ามถอด payload เองแล้วเชื่อ `sub` — ใครก็ปลอม JWT ส่งมาได้ = ยึดบัญชีสมาชิกคนอื่นได้ทันที
//    endpoint `verify` ของ LINE ตรวจลายเซ็น + หมดอายุ + ว่า token นี้ออกให้ช่องทางของเราจริง (aud)
// 🔴 ไม่มี `LINE_CHANNEL_ID` ในระบบ = ปิดสนิท (400) ไม่ใช่ "ปล่อยผ่านชั่วคราว"
// 🔴 ไม่เคยผูก LINE กับสมาชิกไหน → ไม่ออก session แต่ส่ง `next` ไปหน้าสมัคร/ผูกบัญชี
import { cookies } from "next/headers";
import { loginWithLine } from "@/lib/modules/member/customer-session";

const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const SESSION_DAYS = 30;

type Body = { idToken?: string };

function fail(reason: string, status = 400): Response {
  return Response.json({ ok: false, reason }, { status });
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
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
    { userAgent: req.headers.get("user-agent") ?? "liff", ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0] ?? null },
  );
  if ("needsJoin" in result) {
    return Response.json({ ok: true, needsJoin: true, next: result.joinUrl });
  }

  const jar = await cookies();
  jar.set(result.cookieName, result.token, {
    httpOnly: true,
    secure: result.cookieName.startsWith("__Host-"),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return Response.json({ ok: true, next: `/m/${slug}/card` });
}
