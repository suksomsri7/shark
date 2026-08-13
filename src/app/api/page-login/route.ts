// POST /api/page-login — พนักงาน login เข้า Page ด้วย PIN (ฟอร์ม HTML ธรรมดา — ทำงานใน LIFF/ทุก webview)
// ทำไมเป็น route ไม่ใช่ server action: หน้า /p เป็นหน้าสาธารณะ + มีบทเรียน server action พังใน WKWebView
// 🔴 PIN สั้นเดาง่าย → rate limit 2 ชั้น: ต่อสมาชิก 5 ครั้ง/นาที + ต่อ IP 20 ครั้ง/นาที (in-memory ต่อ instance
//    — ข้อจำกัดเดิมของ core/rate-limit ยอมรับไว้เหมือน endpoint สาธารณะอื่น)
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/core/rate-limit";
import { createSession } from "@/lib/core/session";
import { setActiveTenant } from "@/lib/core/context";
import { verifyPageLogin } from "@/lib/pages/service";

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const slug = String(form.get("slug") ?? "").trim();
  const memberId = String(form.get("memberId") ?? "").trim();
  const pin = String(form.get("pin") ?? "").trim();
  const back = `/p/${encodeURIComponent(slug)}`;
  if (!slug || !memberId || !/^\d{4,8}$/.test(pin)) redirect(`${back}?err=pin`);

  const ip = (req.headers.get("x-forwarded-for") ?? "?").split(",")[0]!.trim();
  const perMember = checkRateLimit(`page-login:${memberId}`, { limit: 5, windowMs: 60_000 });
  const perIp = checkRateLimit(`page-login-ip:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!perMember.ok || !perIp.ok) redirect(`${back}?err=rate`);

  const res = await verifyPageLogin(slug, memberId, pin);
  // ทุกกรณีผิดตอบ err=pin เหมือนกัน (ไม่บอกว่า id มี/ไม่มี — กัน enumerate) ยกเว้นยังไม่ตั้ง PIN
  if (!res.ok) redirect(`${back}?err=${res.reason === "no_pin" ? "nopin" : "pin"}`);

  await createSession(res.userId, { ip, userAgent: req.headers.get("user-agent") ?? undefined });
  await setActiveTenant(res.tenantId);
  redirect(back);
}
