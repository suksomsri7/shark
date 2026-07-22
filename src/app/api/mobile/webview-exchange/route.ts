// GET /api/mobile/webview-exchange?code= → แลก one-time code เป็น cookie session แล้ว redirect เข้า /app
// เปิดจาก browser ใน WebView โดยตรง → ไฟล์นี้ไฟล์เดียวที่ได้ใช้ cookie จริง (createSession/setActiveTenant)
// code ผิด/หมดอายุ/ใช้ซ้ำ → เด้งกลับ /login?err=code (ห้ามส่ง Bearer token ผ่าน URL)
import { NextResponse } from "next/server";
import { consumeWebviewCode } from "@/lib/mobile/auth";
import { createSession } from "@/lib/core/session";
import { setActiveTenant } from "@/lib/core/context";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const result = code ? await consumeWebviewCode(code) : null;
  if (!result) return NextResponse.redirect(new URL("/login?err=code", url.origin));
  // ออก cookie session เดิม (httpOnly) + ตั้งกิจการ active ให้ตรงกับตอนขอ code
  await createSession(result.userId, { userAgent: req.headers.get("user-agent") ?? "webview" });
  await setActiveTenant(result.tenantId);
  return NextResponse.redirect(new URL("/app", url.origin));
}
