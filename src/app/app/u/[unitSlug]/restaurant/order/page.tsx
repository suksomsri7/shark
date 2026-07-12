import { requireUnit } from "@/lib/core/context";
import { orderingMenu, ensureDefaultStations } from "@/lib/modules/restaurant/menu";
import { openSessionsList } from "@/lib/modules/restaurant/table";
import { RestaurantOrderEntry } from "@/components/restaurant-order-entry";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function OrderEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams: Promise<{ sessionId?: string }>;
}) {
  const { unitSlug } = await params;
  const { sessionId } = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  const { tenantId } = auth.active;
  await ensureDefaultStations(tenantId, unit.id);
  const [menu, sessions] = await Promise.all([
    orderingMenu(tenantId, unit.id),
    openSessionsList(tenantId, unit.id),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="คีย์ออเดอร์" back={{ href: `/app/u/${unitSlug}/restaurant`, label: "ร้านอาหาร · หน้างาน" }} />
      {menu.length === 0 ? (
        <EmptyState
          text="ยังไม่มีเมนู — เพิ่มเมนูก่อนจึงคีย์ออเดอร์ได้"
          action={{ href: `/app/u/${unitSlug}/restaurant/menu`, label: "จัดการเมนู" }}
        />
      ) : (
        <RestaurantOrderEntry unitSlug={unitSlug} menu={menu} sessions={sessions} initialSessionId={sessionId} />
      )}
    </div>
  );
}
