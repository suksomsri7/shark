import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { orderingMenu, ensureDefaultStations } from "@/lib/modules/restaurant/menu";
import { openSessionsList } from "@/lib/modules/restaurant/table";
import { RestaurantOrderEntry } from "@/components/restaurant-order-entry";

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">คีย์ออเดอร์</h1>
        <Link href={`/app/u/${unitSlug}/restaurant`} className="btn btn-ghost text-sm">
          ← หน้างาน
        </Link>
      </div>
      {menu.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">
          ยังไม่มีเมนู — เพิ่มเมนูที่{" "}
          <Link href={`/app/u/${unitSlug}/restaurant/menu`} className="underline">
            จัดการเมนู
          </Link>
        </p>
      ) : (
        <RestaurantOrderEntry unitSlug={unitSlug} menu={menu} sessions={sessions} initialSessionId={sessionId} />
      )}
    </div>
  );
}
