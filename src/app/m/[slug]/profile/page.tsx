// /m/[slug]/profile — โปรไฟล์ที่ลูกค้าแก้เองได้ + ความยินยอม + ปุ่ม PDPA (ภาพ 09 ค)
import { requireCustomer } from "@/lib/modules/member/customer-session";
import { meGet } from "@/lib/modules/member/me";
import { MProfile } from "@/components/member/MProfile";

export const dynamic = "force-dynamic";

export default async function MemberProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await requireCustomer(slug);
  const me = await meGet(s.ctx, s.actor, s.customerId);
  return <MProfile slug={slug} me={me} />;
}
