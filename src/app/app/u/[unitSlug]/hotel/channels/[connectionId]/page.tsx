import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { channelDetail } from "@/lib/modules/hotel";
import RoomMapEditor from "@/components/hotel/channel/RoomMapEditor";
import RateMapEditor from "@/components/hotel/channel/RateMapEditor";
import BufferEditor from "@/components/hotel/channel/BufferEditor";
import AriPreview from "@/components/hotel/channel/AriPreview";
import { CARD, JOB_STATUS_TH, thDay, thTime } from "@/components/hotel/channel/channel-shared";

// SVC H.10 ▸ ตั้งค่าตัวต่อช่องทาง /hotel/channels/[connectionId] (ใบสั่ง h.10 §2 ข้อ 7 · §4) — แม็ปห้อง · แผน+markup · กันห้อง · ทดสอบส่ง ARI · ประวัติงาน
//   หน่วย "HOTEL" · hotel.channel.manage (ไม่มี ⇒ notFound) · ตัวต่อของร้านอื่น/ไม่ครอบหน่วย ⇒ notFound
export default async function HotelChannelPage({ params }: { params: Promise<{ unitSlug: string; connectionId: string }> }) {
  const { unitSlug, connectionId } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  if (!evaluate(actor, { module: "hotel", action: "hotel.channel.manage", unitId: unit.id })) notFound();
  const r = await channelDetail(actor, { tenantId: auth.active.tenantId }, { unitId: unit.id, connectionId });
  if (!r.ok) notFound();
  const d = r.detail;
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-1">
        <Link href={`/app/u/${unitSlug}/hotel/channels`} className="text-sm text-[color:var(--color-muted)]">
          ‹ ช่องทางขายห้อง (OTA)
        </Link>
        <h1 className="text-xl font-bold text-[color:var(--color-ink)]">{d.connection.label}</h1>
        <p className="text-sm text-[color:var(--color-muted)]">แม็ปประเภทห้องและแผนราคากับรหัสของช่องทาง · ราคาส่ง = ราคาแผน + markup · กันห้องไว้ขายหน้าร้านได้</p>
      </header>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RoomMapEditor unitSlug={unitSlug} connectionId={d.connection.id} roomTypes={d.roomTypes} />
        <RateMapEditor unitSlug={unitSlug} connectionId={d.connection.id} ratePlans={d.ratePlans} />
        <BufferEditor unitSlug={unitSlug} connectionId={d.connection.id} roomTypes={d.roomTypes} />
        <section className={CARD} aria-label="ประวัติการส่ง ARI">
          <h2 className="text-base font-bold">ประวัติการส่งราคา/ห้องว่าง</h2>
          {d.jobs.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีงานส่ง</p>
          ) : (
            <div className="overflow-x-auto" data-scroll-hint="เลื่อนซ้ายขวาเพื่อดูทั้งตาราง">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[color:var(--color-muted)]">
                    <th className="px-2 py-1">ช่วงวัน</th>
                    <th className="px-2 py-1">สถานะ</th>
                    <th className="px-2 py-1">ครั้งที่ลอง</th>
                    <th className="px-2 py-1">ส่งเมื่อ</th>
                  </tr>
                </thead>
                <tbody>
                  {d.jobs.map((j) => (
                    <tr key={j.id} className="border-t border-[color:var(--color-line)]">
                      <td className="px-2 py-1 whitespace-nowrap">
                        {thDay(j.dateFrom)} – {thDay(j.dateTo)}
                      </td>
                      <td className="px-2 py-1">
                        {JOB_STATUS_TH[j.status] ?? j.status}
                        {j.lastError && <div className="text-xs text-red-700">{j.lastError}</div>}
                      </td>
                      <td className="px-2 py-1">{j.attempts}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{thTime(j.sentAt ?? j.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <AriPreview unitSlug={unitSlug} connectionId={d.connection.id} />
    </div>
  );
}
