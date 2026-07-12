import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { getSession } from "@/lib/modules/restaurant/table";
import { billPreview } from "@/lib/modules/restaurant/order";
import { RestaurantCheckout } from "@/components/restaurant-checkout";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ unitSlug: string; sessionId: string }>;
}) {
  const { unitSlug, sessionId } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
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
