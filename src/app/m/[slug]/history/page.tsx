// /m/[slug]/history — ไทม์ไลน์ของฉัน (MemberActivity ของตัวเอง)
import { requireCustomer } from "@/lib/modules/member/customer-session";
import { listActivity } from "@/lib/modules/member/activity";
import { MHistory } from "@/components/member/MHistory";

export const dynamic = "force-dynamic";

export default async function MemberHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await requireCustomer(slug);
  const { items } = await listActivity(s.ctx, s.actor, s.customerId, { take: 30 });
  return <MHistory items={items} />;
}
