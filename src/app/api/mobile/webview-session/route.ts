// POST /api/mobile/webview-session + Bearer + X-Tenant-Id → {code} (one-time 60 วิ) แลกเป็น cookie ใน WebView
// requireMobile คุมสิทธิ์ → issueWebviewCode ผูก user+กิจการ active (ห้ามส่ง Bearer token เข้า WebView URL)
import { requireMobile, mobileError, issueWebviewCode } from "@/lib/mobile/auth";

export async function POST(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileError(g);
  const code = await issueWebviewCode(g.user.id, g.ctx.tenantId);
  return Response.json({ code }, { status: 200 });
}
