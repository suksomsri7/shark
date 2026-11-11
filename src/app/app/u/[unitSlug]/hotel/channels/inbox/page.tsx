import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { listInbox } from "@/lib/modules/hotel";
import NeedsRoomQueue from "@/components/hotel/channel/NeedsRoomQueue";
import InboxList from "@/components/hotel/channel/InboxList";

// SVC H.10 ▸ การจองจากช่องทาง /hotel/channels/inbox (ใบสั่ง h.10 §4) — คิว "ต้องจัดห้อง" แถวบน (ลองอีกครั้ง/ปฏิเสธ · ลิงก์ปฏิทินห้อง) + inbox ทุกสถานะ (อ่านอย่างเดียว)
//   หน่วย "HOTEL" · hotel.channel.manage (ไม่มี ⇒ notFound) · ไม่มีอีเมล/เบอร์/ข้อมูลดิบจากช่องทาง
export default async function HotelChannelInboxPage({ params }: { params: Promise<{ unitSlug: string }> }) {
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
  const r = await listInbox(actor, ctx, { unitId: unit.id });
  if (!r.ok) notFound();
  const need = r.items.filter((x) => x.status === "NEEDS_ROOM");
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-1">
        <Link href={`/app/u/${unitSlug}/hotel/channels`} className="text-sm text-[color:var(--color-muted)]">
          ‹ ช่องทางขายห้อง (OTA)
        </Link>
        <h1 className="text-xl font-bold text-[color:var(--color-ink)]">การจองจากช่องทาง</h1>
      </header>
      <NeedsRoomQueue unitSlug={unitSlug} items={need.map(({ reservationId: _r, ...x }) => x)} />
      <InboxList unitSlug={unitSlug} items={r.items} />
    </div>
  );
}
