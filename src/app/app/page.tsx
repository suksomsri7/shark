import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";

const TYPE_LABEL: Record<string, string> = {
  HOTEL: "โรงแรม",
  RESTAURANT: "ร้านอาหาร",
  BOOKING: "จองคิว/นัดหมาย",
  QUEUE: "บัตรคิว",
  TICKET: "ตั๋ว/อีเวนต์",
  SHOP: "ร้านค้า",
};

// Overview "ทุกกิจการ" — การ์ด KPI ต่อ unit (KPI จริงมาเมื่อ getUnitKpi พร้อม)
export default async function OverviewPage() {
  const auth = await requireTenant();
  const units = await prisma.businessUnit.findMany({
    where: { tenantId: auth.active.tenantId, status: { not: "ARCHIVED" } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ทุกกิจการ</h1>
        <Link href="/app/settings/units/new" className="btn btn-ghost text-sm">
          + เพิ่มกิจการ
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {units.map((u) => (
          <Link
            key={u.id}
            href={`/app/u/${u.slug}`}
            className="card hover:bg-[color:var(--color-surface-2)]"
          >
            <div className="text-sm text-[color:var(--color-muted)]">{TYPE_LABEL[u.type]}</div>
            <div className="mt-1 text-lg font-medium">{u.name}</div>
            <div className="mt-4 text-sm text-[color:var(--color-muted)]">ยอดวันนี้ —</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
