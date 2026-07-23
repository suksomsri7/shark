// GET /tenant/switch?to=<tenantId> — สลับกิจการแบบ navigation ธรรมดา (แทน server action ที่พังใน WebView)
// authz: requireMembership — ต้องเป็นสมาชิก (acceptedAt) ของกิจการปลายทางจริงเท่านั้น
// CSRF ของ GET นี้ = สลับไปกิจการที่ตัวเองเป็นสมาชิกอยู่แล้ว (ไม่มีความเสียหาย) — ยอมรับได้
import { redirect } from "next/navigation";
import { requireMembership, setActiveTenant } from "@/lib/core/context";

export async function GET(req: Request): Promise<Response> {
  const to = new URL(req.url).searchParams.get("to") ?? "";
  if (!to) redirect("/app");
  await requireMembership(to); // ไม่ใช่สมาชิก = throw (Next แปลงเป็น error page — ไม่หลุดสิทธิ์แน่นอน)
  await setActiveTenant(to);
  redirect("/app?switched=" + to); // query นี้ฝั่งแอป native ใช้ sync กิจการ (ห้ามเปลี่ยนรูปแบบ)
}
