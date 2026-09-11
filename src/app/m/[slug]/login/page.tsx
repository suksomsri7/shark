// /m/[slug]/login — เข้าสู่ระบบของลูกค้า (OTP เบอร์/อีเมล · ปุ่ม LINE)
//
// 🔴 ไม่ใช้ session พนักงาน: cookie `shark_session` ที่ติดมาในเบราว์เซอร์เดียวกันไม่มีผลกับหน้านี้
import { notFound } from "next/navigation";
import { prisma } from "@/lib/core/db";
import { MLoginForm } from "@/components/member/MLoginForm";

export const dynamic = "force-dynamic";

export default async function MemberLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { name: true } });
  if (!tenant) notFound();
  return <MLoginForm slug={slug} shopName={tenant.name} liffId={process.env.LINE_LIFF_ID ?? ""} />;
}
