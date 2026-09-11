// /m/[slug]/wallet — กระเป๋าสิทธิ์ของลูกค้า (ภาพ 09 ข)
import { getWallet } from "@/lib/modules/member";
import { requireCustomer } from "@/lib/modules/member/customer-session";
import { MWallet } from "@/components/member/MWallet";

export const dynamic = "force-dynamic";

export default async function MemberWalletPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await requireCustomer(slug);
  const wallet = await getWallet(s.ctx, s.actor, s.customerId, {});
  return <MWallet slug={slug} wallet={wallet} />;
}
