// /m/[slug] — ทางเข้าหลักของหน้าลูกค้า (ลิงก์ LIFF / QR ของร้านชี้มาที่นี่)
// ล็อกอินแล้ว → บัตรสมาชิก · ยังไม่ล็อกอิน → `requireCustomer` พาไปหน้าเข้าสู่ระบบเอง
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/modules/member/customer-session";

export const dynamic = "force-dynamic";

export default async function MemberHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireCustomer(slug);
  redirect(`/m/${slug}/card`);
}
