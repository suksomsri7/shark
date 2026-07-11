import { requireUnit } from "@/lib/core/context";

const TYPE_LABEL: Record<string, string> = {
  HOTEL: "โรงแรม",
  RESTAURANT: "ร้านอาหาร",
  BOOKING: "จองคิว/นัดหมาย",
  QUEUE: "บัตรคิว",
  TICKET: "ตั๋ว/อีเวนต์",
  SHOP: "ร้านค้า",
};

// หน้าแรกของกิจการ (unit home) — โมดูลของ unit จะมาต่อที่ /app/u/[slug]/<module>/...
export default async function UnitHomePage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { unit } = await requireUnit(unitSlug);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-sm text-[color:var(--color-muted)]">{TYPE_LABEL[unit.type]}</div>
        <h1 className="text-2xl font-semibold">{unit.name}</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="text-sm text-[color:var(--color-muted)]">ยอดวันนี้</div>
          <div className="mt-1 text-2xl font-semibold">—</div>
        </div>
        <div className="card">
          <div className="text-sm text-[color:var(--color-muted)]">ธุรกรรม</div>
          <div className="mt-1 text-2xl font-semibold">—</div>
        </div>
        <div className="card">
          <div className="text-sm text-[color:var(--color-muted)]">สมาชิกใหม่</div>
          <div className="mt-1 text-2xl font-semibold">—</div>
        </div>
      </div>
      <p className="text-sm text-[color:var(--color-muted)]">
        โมดูลของกิจการนี้จะปรากฏที่นี่ (Stage C) — {TYPE_LABEL[unit.type]}
      </p>
    </div>
  );
}
