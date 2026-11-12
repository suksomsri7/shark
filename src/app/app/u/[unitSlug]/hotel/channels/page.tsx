import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { listChannelConnections, listNeedsRoom } from "@/lib/modules/hotel";
import ChannelCard from "@/components/hotel/channel/ChannelCard";

// SVC H.10 ▸ ช่องทางขายห้อง (OTA) ของหน่วย /hotel/channels (ใบสั่ง h.10 §4) — รายการตัวต่อ · ARI ล่าสุด · การจองเข้า 7 วัน · คิวต้องจัดห้อง
//   หน่วย "HOTEL" เท่านั้น · ด่าน hotel.channel.manage จาก session (ไม่มี ⇒ notFound) · เชื่อม/ถอดตัวต่อ = ศูนย์เชื่อมต่อ (/app/settings/integrations)
export default async function HotelChannelsPage({ params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  if (!evaluate(actor, { module: "hotel", action: "hotel.channel.manage", unitId: unit.id })) notFound();
  const ctx = { tenantId: auth.active.tenantId };
  const [list, need] = await Promise.all([listChannelConnections(actor, ctx, { unitId: unit.id }), listNeedsRoom(actor, ctx, { unitId: unit.id })]);
  if (!list.ok) notFound();
  const needCount = need.ok ? need.items.length : 0;
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-[color:var(--color-ink)]">ช่องทางขายห้อง (OTA)</h1>
          <p className="text-sm text-[color:var(--color-muted)]">ส่งราคา/ห้องว่างให้ช่องทางอัตโนมัติ · รับการจองเข้าปฏิทินห้อง · กันขายซ้อนที่แกนห้อง</p>
        </div>
        <Link href={`/app/u/${unitSlug}/hotel/channels/inbox`} className="inline-flex min-h-11 items-center rounded-lg border border-[color:var(--color-line)] px-4 py-2 text-sm">
          การจองจากช่องทาง{needCount > 0 ? ` · ต้องจัดห้อง ${needCount}` : ""} ›
        </Link>
      </header>
      {needCount > 0 && (
        <p role="status" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          มีการจองจากช่องทาง {needCount} รายการที่ต้องจัดห้อง — <Link className="underline" href={`/app/u/${unitSlug}/hotel/channels/inbox`}>ไปที่คิว</Link>
        </p>
      )}
      {list.connections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--color-line)] p-6 text-sm text-[color:var(--color-muted)]">
          ยังไม่เชื่อมช่องทางขายห้อง — เชื่อม channel manager ที่ <Link className="underline" href="/app/settings/integrations">ศูนย์เชื่อมต่อ</Link> (ตัวต่อเจ้าแรก เฟส H2)
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.connections.map((c) => (
            <ChannelCard key={c.id} unitSlug={unitSlug} connection={c} />
          ))}
        </div>
      )}
    </div>
  );
}
