// GET /tenant/rename?to=<tenantId>&name=<ชื่อใหม่> — แก้ชื่อกิจการ (OWNER เท่านั้น)
// ใช้ GET navigation ตาม pattern drawer (server action พังใน WKWebView — กติกา HA-4.7)
// CSRF ของ GET นี้ = เปลี่ยนชื่อกิจการตัวเองที่เป็น OWNER — ความเสี่ยงต่ำ ยอมรับได้ (แลกกับทำงานได้จริงในแอป)
import { redirect } from "next/navigation";
import { requireMembership } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const to = url.searchParams.get("to") ?? "";
  const name = (url.searchParams.get("name") ?? "").trim();
  if (!to) redirect("/app");
  const member = await requireMembership(to); // ไม่ใช่สมาชิก = throw
  // เปลี่ยนชื่อได้เฉพาะเจ้าของกิจการ · ชื่อ 2-80 ตัวอักษรตามกติกา onboarding เดิม
  if (member.role !== "OWNER" || name.length < 2 || name.length > 80) redirect("/app");
  await prisma.tenant.update({ where: { id: to }, data: { name } });
  redirect("/app");
}
