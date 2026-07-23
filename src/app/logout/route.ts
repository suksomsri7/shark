// GET /logout — ออกจากระบบแบบ navigation ธรรมดา (ใช้ได้ทั้ง browser และใน WebView ของแอป)
// เหตุ: server action POST จาก WKWebView พังเป็น error 500 ค้างหน้า (เจ้าของเจอ 2 รอบ) — GET เส้นนี้ไม่พึ่งกลไก action
// ความเสี่ยง CSRF ของ GET logout = แค่ถูกบังคับออกจากระบบ (ไม่เสียข้อมูล) — ยอมรับได้ แลกกับความทนทาน
import { redirect } from "next/navigation";
import { destroySession } from "@/lib/core/session";

export async function GET(): Promise<Response> {
  await destroySession();
  redirect("/login"); // ฝั่งแอป native intercept /login → signOut ต่อเอง
}
