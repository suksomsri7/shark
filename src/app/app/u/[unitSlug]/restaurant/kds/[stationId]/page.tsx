import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { getSetting, listStations } from "@/lib/modules/restaurant/menu";
import { stationQueue, expoQueue } from "@/lib/modules/restaurant/kds";
import { RestaurantKdsBoard, type KdsItemLite } from "@/components/restaurant-kds-board";
import { PageHeader } from "@/components/ui/PageHeader";
import { redirect } from "next/navigation"; // POS P2.14 ▸ LEG-2/4 ◂
import { posLinkedLegacyPage } from "@/lib/modules/pos/legacy-door"; // POS P2.14 ▸ LEG-2/4 มติ 1: สาขาที่ผูก POS = หน้าเดิมปิด → หน้า POS ◂

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
  // POS P2.14 ▸ LEG-2/4 มติ 1: สาขาที่ผูก POS ⇒ หน้าเดิมปิด — ไปหน้าจอครัวของ POS (from=legacy = แถบแจ้งที่หน้า POS) ·
  //   หน้าขายแบบเดิม (ไม่เปิด registerV2) ยังไม่มีหน้าโต๊ะ/ครัว ⇒ ไปหน้าขาย · ไม่ผูก POS = หน้าเดิมตามเดิม
  const posDoor = await posLinkedLegacyPage(auth.active.tenantId, unit.id);
  if (posDoor) redirect(`/app/sys/${posDoor.systemId}/pos/${posDoor.v2 ? "kds" : "register"}?unit=${encodeURIComponent(unit.id)}&from=legacy`);
  // ◂
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
      <PageHeader title={title} back={{ href: `/app/u/${unitSlug}/restaurant/kds`, label: "จอครัว (KDS)" }} />
      <RestaurantKdsBoard
        unitSlug={unitSlug}
        items={toLite(items)}
        warnMins={setting.kdsWarnMins}
        criticalMins={setting.kdsCriticalMins}
      />
    </div>
  );
}
