import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { listStations, ensureDefaultStations } from "@/lib/modules/restaurant/menu";
import { PageHeader } from "@/components/ui/PageHeader";

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
      <PageHeader title="จอครัว (KDS)" back={{ href: `/app/u/${unitSlug}/restaurant`, label: "ร้านอาหาร · หน้างาน" }} />
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
