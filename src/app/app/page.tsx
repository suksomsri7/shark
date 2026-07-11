import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { listSystems } from "@/lib/modules/system/service";

const TYPE_LABEL: Record<string, string> = {
  HOTEL: "โรงแรม",
  RESTAURANT: "ร้านอาหาร",
  BOOKING: "จองคิว/นัดหมาย",
  QUEUE: "บัตรคิว",
  TICKET: "ตั๋ว/อีเวนต์",
  SHOP: "ร้านค้า",
};
const SYS_LABEL: Record<string, string> = {
  MEMBER: "สมาชิก",
  POINT: "แต้ม",
  POS: "ขายหน้าร้าน",
  REWARD: "รางวัล",
};
const SYS_ICON: Record<string, string> = { MEMBER: "👥", POINT: "⭐", POS: "🧾", REWARD: "🎁" };
const SYS_ORDER = ["MEMBER", "POINT", "POS", "REWARD"];

export default async function OverviewPage() {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const [units, systems] = await Promise.all([
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    listSystems(tenantId),
  ]);
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? "—";
  const byType = (t: string) => systems.filter((s) => s.type === t);

  return (
    <div className="flex flex-col gap-8">
      {/* กิจการ */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">ทุกกิจการ</h1>
          <Link href="/app/settings/units/new" className="btn btn-ghost text-sm">
            + เพิ่มกิจการ
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((u) => (
            <Link key={u.id} href={`/app/u/${u.slug}`} className="card hover:bg-[color:var(--color-surface-2)]">
              <div className="text-sm text-[color:var(--color-muted)]">{TYPE_LABEL[u.type]}</div>
              <div className="mt-1 text-lg font-medium">{u.name}</div>
              <div className="mt-4 text-sm text-[color:var(--color-muted)]">ยอดวันนี้ —</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ระบบ */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">ระบบของคุณ</h2>
          <Link href="/app/settings/systems" className="btn btn-ghost text-sm">
            จัดการระบบ
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SYS_ORDER.map((type) => {
            const list = byType(type);
            return (
              <Link
                key={type}
                href="/app/settings/systems"
                className="card flex flex-col gap-2 hover:bg-[color:var(--color-surface-2)]"
              >
                <div className="flex items-center gap-2">
                  <span>{SYS_ICON[type]}</span>
                  <span className="font-medium">ระบบ{SYS_LABEL[type]}</span>
                  <span className="ml-auto text-xs text-[color:var(--color-muted)]">
                    {list.length} ชุด
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.flatMap((s) =>
                    s.units.map((u) => (
                      <span key={u.id} className="rounded-full border px-2 py-0.5 text-xs">
                        {unitName(u.unitId)}
                      </span>
                    )),
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
