import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { getSession } from "@/lib/modules/restaurant/table";
import { billPreview } from "@/lib/modules/restaurant/order";
import { RestaurantCheckout } from "@/components/restaurant-checkout";
import { PageHeader } from "@/components/ui/PageHeader";
import { redirect } from "next/navigation"; // POS P2.14 ▸ LEG-2/4 ◂
import { posLinkedLegacyPage } from "@/lib/modules/pos/legacy-door"; // POS P2.14 ▸ LEG-2/4 มติ 1: สาขาที่ผูก POS = หน้าเดิมปิด → หน้า POS ◂

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ unitSlug: string; sessionId: string }>;
}) {
  const { unitSlug, sessionId } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  // POS P2.14 ▸ LEG-2/4 มติ 1: สาขาที่ผูก POS ⇒ หน้าเดิมปิด — ไปหน้าโต๊ะของ POS (from=legacy = แถบแจ้งที่หน้า POS) ·
  //   หน้าขายแบบเดิม (ไม่เปิด registerV2) ยังไม่มีหน้าโต๊ะ/ครัว ⇒ ไปหน้าขาย · ไม่ผูก POS = หน้าเดิมตามเดิม
  const posDoor = await posLinkedLegacyPage(auth.active.tenantId, unit.id);
  if (posDoor) redirect(`/app/sys/${posDoor.systemId}/pos/${posDoor.v2 ? "tables" : "register"}?unit=${encodeURIComponent(unit.id)}&from=legacy`);
  // ◂
  const { tenantId } = auth.active;
  const session = await getSession(tenantId, unit.id, sessionId);
  if (!session) notFound();
  const bill = await billPreview(tenantId, unit.id, sessionId);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <PageHeader
        title={`เช็คบิล · โต๊ะ ${session.table.name}`}
        back={{ href: `/app/u/${unitSlug}/restaurant`, label: "ร้านอาหาร · หน้างาน" }}
      />
      <RestaurantCheckout
        unitSlug={unitSlug}
        sessionId={sessionId}
        lines={bill.lines.map((l) => ({ itemId: l.itemId, name: l.name, qty: l.qty, lineTotalSatang: l.lineTotalSatang }))}
        serviceChargeBps={bill.serviceChargeBps}
      />
    </div>
  );
}
