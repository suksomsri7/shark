// GET /logout — ออกจากระบบแบบ navigation ธรรมดา (ใช้ได้ทั้ง browser และใน WebView ของแอป)
// เหตุ: server action POST จาก WKWebView พังเป็น error 500 ค้างหน้า (เจ้าของเจอ 2 รอบ) — GET เส้นนี้ไม่พึ่งกลไก action
// ความเสี่ยง CSRF ของ GET logout = แค่ถูกบังคับออกจากระบบ (ไม่เสียข้อมูล) — ยอมรับได้ แลกกับความทนทาน
import { redirect } from "next/navigation";
import { destroySession } from "@/lib/core/session";

export async function GET(req: Request): Promise<Response> {
  await destroySession();
  // ?to=/p/<slug> — ออกจากหน้า Page (kiosk/LIFF) แล้วกลับไปจอ login ของ Page เดิม
  // รับเฉพาะ path ภายในที่ขึ้นต้น /p/ (กัน open redirect)
  const to = new URL(req.url).searchParams.get("to");
  if (to && /^\/p\/[a-z0-9-]+$/i.test(to)) redirect(to);
  redirect("/login"); // ฝั่งแอป native intercept /login → signOut ต่อเอง
}
