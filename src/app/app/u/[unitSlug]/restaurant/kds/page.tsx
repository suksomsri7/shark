import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { listStations, ensureDefaultStations } from "@/lib/modules/restaurant/menu";

export default async function KdsIndexPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  await ensureDefaultStations(auth.active.tenantId, unit.id);
  const stations = await listStations(auth.active.tenantId, unit.id);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">จอครัว (KDS)</h1>
        <Link href={`/app/u/${unitSlug}/restaurant`} className="btn btn-ghost text-sm">
          ← หน้างาน
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stations.map((s) => (
          <Link key={s.id} href={`/app/u/${unitSlug}/restaurant/kds/${s.id}`} className="card text-center hover:bg-[color:var(--color-surface-2)]">
            <div className="font-medium">{s.name}</div>
            <div className="text-xs text-[color:var(--color-muted)]">เปิดจอสถานี</div>
          </Link>
        ))}
        <Link href={`/app/u/${unitSlug}/restaurant/kds/expo`} className="card text-center hover:bg-[color:var(--color-surface-2)]">
          <div className="font-medium">Expo</div>
          <div className="text-xs text-[color:var(--color-muted)]">รายการเสร็จ รอเสิร์ฟ</div>
        </Link>
      </div>
    </div>
  );
}
