import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { PageHeader } from "@/components/ui/PageHeader";

// หน้าแรก /app = แดชบอร์ดของกิจการ (ไม่ใช่ "ระบบทั้งหมด" อีกต่อไป — ย้ายไปอยู่ใน drawer)
// แสดง: ชื่อกิจการ + ตัวเลขวันนี้ + การ์ดระบบที่เปิดใช้ + ลิงก์เพิ่มระบบ
export default async function DashboardPage() {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  // ช่วงเวลา "วันนี้" ตามโซนกรุงเทพ (UTC+7 คงที่) เพื่อนับนัดหมาย
  const now = new Date();
  const bkkNow = new Date(now.getTime() + 7 * 3600 * 1000);
  const bkkMidnight = new Date(Date.UTC(bkkNow.getUTCFullYear(), bkkNow.getUTCMonth(), bkkNow.getUTCDate()));
  const todayStart = new Date(bkkMidnight.getTime() - 7 * 3600 * 1000);
  const todayEnd = new Date(todayStart.getTime() + 24 * 3600 * 1000);

  const [units, appSystems, links, appointmentsToday] = await Promise.all([
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.appSystem.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
    prisma.appSystemUnit.findMany({ where: { tenantId } }),
    prisma.appointment.count({
      where: { tenantId, startAt: { gte: todayStart, lt: todayEnd }, status: { not: "CANCELLED" } },
    }),
  ]);
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? "";

  const cards = [
    ...units.map((u) => {
      const def = systemDef(u.type);
      const linked = links.filter((l) => l.unitId === u.id).length;
      return {
        key: `u-${u.id}`,
        href: `/app/u/${u.slug}`,
        icon: def?.icon ?? "•",
        typeLabel: `ระบบ${def?.label ?? u.type}`,
        name: u.name,
        detail: linked > 0 ? `เชื่อมต่อ ${linked} ระบบ` : "ยังไม่เชื่อมต่อระบบอื่น",
        createdAt: u.createdAt,
      };
    }),
    ...appSystems.map((s) => {
      const def = systemDef(s.type);
      const linkedUnits = links.filter((l) => l.systemId === s.id).map((l) => unitName(l.unitId));
      return {
        key: `s-${s.id}`,
        href: `/app/sys/${s.id}`,
        icon: def?.icon ?? "•",
        typeLabel: `ระบบ${def?.label ?? s.type}`,
        name: s.name,
        detail: linkedUnits.length > 0 ? `เชื่อมกับ ${linkedUnits.join(", ")}` : "ยังไม่เชื่อมต่อ",
        createdAt: s.createdAt,
      };
    }),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // มีระบบจองคิว/นัดหมายไหม — ถ้าไม่มี ตัวเลขนัดหมายแสดง "—" แทน
  const hasBooking = units.some((u) => u.type === "BOOKING");

  const stats = [
    { key: "appt", label: "นัดหมายวันนี้", value: hasBooking ? String(appointmentsToday) : "—" },
    { key: "systems", label: "ระบบที่เปิดใช้", value: String(cards.length) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={auth.active.tenant.name}
        desc="ภาพรวมกิจการวันนี้"
        actions={
          <Link href="/app/settings/systems" className="btn btn-primary text-sm">
            + เพิ่มระบบ
          </Link>
        }
      />

      {/* ตัวเลขวันนี้ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.key} className="card p-3">
            <div className="text-xs text-[color:var(--color-muted)]">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* การ์ดระบบที่เปิดใช้ */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">ระบบที่เปิดใช้</h2>
          <Link href="/app/settings/systems" className="text-xs underline">
            เพิ่มระบบ
          </Link>
        </div>

        {cards.length === 0 ? (
          <div className="card py-8 text-center text-sm text-[color:var(--color-muted)]">
            ยังไม่มีระบบ — กด &quot;เพิ่มระบบ&quot; เพื่อเริ่มต้นใช้งาน
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <Link key={c.key} href={c.href} className="card hover:bg-[color:var(--color-surface-2)]">
                <div className="flex items-center gap-2 text-sm text-[color:var(--color-muted)]">
                  <span aria-hidden>{c.icon}</span>
                  <span>{c.typeLabel}</span>
                </div>
                <div className="mt-1 text-lg font-medium">{c.name}</div>
                <div className="mt-3 text-xs text-[color:var(--color-muted)]">{c.detail}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
