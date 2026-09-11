// /m/[slug]/card — บัตรสมาชิก QR (ภาพ 09 ก)
import { getWallet } from "@/lib/modules/member";
import { requireCustomer } from "@/lib/modules/member/customer-session";
import { meCard, meGet } from "@/lib/modules/member/me";
import { MCard } from "@/components/member/MCard";

export const dynamic = "force-dynamic";

export default async function MemberCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await requireCustomer(slug);
  // 3 แหล่งไม่ขึ้นแก่กัน → ยิงพร้อมกัน (หน้านี้เปิดในไลน์ ต้องขึ้นไว)
  const [card, me, wallet] = await Promise.all([
    meCard(s.ctx, s.actor, s.customerId),
    meGet(s.ctx, s.actor, s.customerId),
    getWallet(s.ctx, s.actor, s.customerId, {}),
  ]);
  return <MCard slug={slug} shopName={s.tenantName} card={card} me={me} wallet={wallet} />;
}
