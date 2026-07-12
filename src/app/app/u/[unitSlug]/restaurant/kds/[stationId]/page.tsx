import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { getSetting, listStations } from "@/lib/modules/restaurant/menu";
import { stationQueue, expoQueue } from "@/lib/modules/restaurant/kds";
import { RestaurantKdsBoard, type KdsItemLite } from "@/components/restaurant-kds-board";

type QueueItem = Awaited<ReturnType<typeof stationQueue>>[number];

function toLite(items: QueueItem[]): KdsItemLite[] {
  const now = Date.now();
  return items.map((it) => ({
    id: it.id,
    name: it.nameSnapshot,
    qty: it.qty,
    options: it.options.map((o) => o.choiceSnapshot),
    note: it.note,
    kdsStatus: it.kdsStatus,
    isRush: it.isRush,
    tableName: it.order.session?.table?.name ?? null,
    dailyNo: it.order.dailyNo,
    waitMins: Math.floor((now - it.createdAt.getTime()) / 60000),
  }));
}

export default async function KdsStationPage({
  params,
}: {
  params: Promise<{ unitSlug: string; stationId: string }>;
}) {
  const { unitSlug, stationId } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const { tenantId } = auth.active;
  const setting = await getSetting(tenantId, unit.id);
  const isExpo = stationId === "expo";

  let title = "Expo";
  let items: QueueItem[];
  if (isExpo) {
    items = (await expoQueue(tenantId, unit.id)) as QueueItem[];
  } else {
    const stations = await listStations(tenantId, unit.id);
    const st = stations.find((s) => s.id === stationId);
    if (!st) notFound();
    title = st.name;
    items = await stationQueue(tenantId, unit.id, stationId);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <Link href={`/app/u/${unitSlug}/restaurant/kds`} className="btn btn-ghost text-sm">
          ← สถานี
        </Link>
      </div>
      <RestaurantKdsBoard
        unitSlug={unitSlug}
        items={toLite(items)}
        warnMins={setting.kdsWarnMins}
        criticalMins={setting.kdsCriticalMins}
      />
    </div>
  );
}
