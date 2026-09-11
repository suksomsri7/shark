// /m/[slug]/join/done — สมัครสำเร็จ (M3.11 · ภาพ 29 ค)
//
// 🔴 ต้องมี session ลูกค้า (`requireCustomer` — ไม่มี = พาไป `/m/<slug>/login` เอง): หน้านี้โชว์บัตร + QR ของคนนั้น
//    ใครเปิดลิงก์นี้โดยไม่ได้สมัคร/ล็อกอินจะไม่เห็นบัตรของใครทั้งนั้น
// 🔴 แต้มต้อนรับ = ผลรวมรายการที่ `join.completeJoin` ลงสมุดแต้มจริง (`refType MemberJoin` ของคนนี้)
//    ไม่รับตัวเลขจาก URL (แก้ query เองแล้วขึ้น "ได้ 9,999 แต้ม" = ข้อมูลปลอม)
import * as point from "@/lib/modules/point";
import { requireCustomer } from "@/lib/modules/member/customer-session";
import { meCard, meGet } from "@/lib/modules/member/me";
import { JoinDone } from "@/components/member/JoinDone";

export const dynamic = "force-dynamic";

export default async function MemberJoinDonePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await requireCustomer(slug);
  const [card, me, ledger] = await Promise.all([
    meCard(s.ctx, s.actor, s.customerId),
    meGet(s.ctx, s.actor, s.customerId),
    point.listCustomerLedger(s.tenantId, s.systemId, s.customerId, 200).catch(() => []),
  ]);
  const welcomePoints = ledger
    .filter((r) => r.refType === "MemberJoin" && r.refId === s.customerId && r.delta > 0)
    .reduce((sum, r) => sum + r.delta, 0);

  return (
    <JoinDone
      slug={s.slug}
      shopName={s.tenantName}
      card={card}
      memberSince={me.member.memberSince}
      welcomePoints={welcomePoints}
      pointsBalance={card.points}
    />
  );
}
