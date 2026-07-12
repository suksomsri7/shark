import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { getSession } from "@/lib/modules/restaurant/table";
import { billPreview } from "@/lib/modules/restaurant/order";
import { RestaurantCheckout } from "@/components/restaurant-checkout";

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">เช็คบิล · โต๊ะ {session.table.name}</h1>
        <Link href={`/app/u/${unitSlug}/restaurant`} className="btn btn-ghost text-sm">
          ← หน้างาน
        </Link>
      </div>
      <RestaurantCheckout
        unitSlug={unitSlug}
        sessionId={sessionId}
        lines={bill.lines.map((l) => ({ itemId: l.itemId, name: l.name, qty: l.qty, lineTotalSatang: l.lineTotalSatang }))}
        serviceChargeBps={bill.serviceChargeBps}
      />
    </div>
  );
}
