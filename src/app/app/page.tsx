import type { ReactNode } from "react";
import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { PageHeader } from "@/components/ui/PageHeader";
import { MoneyText } from "@/components/ui/MoneyText";
import { dashboardSummary } from "@/lib/dashboard/service";
import { activeAnnouncements } from "@/lib/announce/service";
import { dismissAnnouncementAction } from "@/lib/announce/actions";

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

  const [units, appSystems, links, appointmentsToday, summary, announcements] = await Promise.all([
    prisma.businessUnit.findMany({
      where: { tenantId, status: { not: "ARCHIVED" } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.appSystem.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
    prisma.appSystemUnit.findMany({ where: { tenantId } }),
    prisma.appointment.count({
      where: { tenantId, startAt: { gte: todayStart, lt: todayEnd }, status: { not: "CANCELLED" } },
    }),
    dashboardSummary({ tenantId }),
    activeAnnouncements({ tenantId }),
  ]);

  // ประกาศจากแพลตฟอร์ม — แสดงฉบับล่าสุด 1 ฉบับเหนือ "ภาพรวมวันนี้" (ไม่มี = ไม่แสดง)
  const announcement = announcements[0] ?? null;
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? "";

  // ภาพรวมวันนี้ — โชว์เฉพาะการ์ดของระบบที่เปิดใช้ (ยอดขาย+แจ้งเตือนโชว์เสมอ)
  const sysTypes = new Set(appSystems.map((s) => s.type));
  const kpis: { key: string; label: string; value: ReactNode; sub?: string; href?: string }[] = [
    {
      key: "sales",
      label: "ยอดขายวันนี้",
      value: <MoneyText satang={summary.salesTodaySatang} />,
      sub: `${summary.salesTodayCount} บิล`,
    },
    ...(sysTypes.has("MEMBER")
      ? [{ key: "members", label: "สมาชิกใหม่ 7 วัน", value: String(summary.newCustomers7d) }]
      : []),
    ...(sysTypes.has("INVENTORY")
      ? [{ key: "stock", label: "สต็อกใกล้หมด", value: String(summary.lowStockCount) }]
      : []),
    ...(sysTypes.has("HR")
      ? [{ key: "leaves", label: "ใบลารออนุมัติ", value: String(summary.pendingLeaves) }]
      : []),
    {
      key: "notif",
      label: "แจ้งเตือนยังไม่อ่าน",
      value: String(summary.unreadNotifications),
      href: "/app/notifications",
    },
  ];

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

      {/* ประกาศจากแพลตฟอร์ม — โทนเรียบ พื้น surface-2 ขอบ hairline ไม่มีสีสด */}
      {announcement && (
        <div className="flex flex-col gap-3 rounded-lg border bg-[color:var(--color-surface-2)] p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="font-semibold">{announcement.title}</div>
            <div className="mt-1 text-sm whitespace-pre-line text-[color:var(--color-muted)]">
              {announcement.body}
            </div>
          </div>
          <form action={dismissAnnouncementAction.bind(null, announcement.id)} className="shrink-0">
            <button type="submit" className="btn-sm">
              รับทราบ
            </button>
          </form>
        </div>
      )}

      {/* ภาพรวมวันนี้ — KPI ของระบบที่เปิดใช้ */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">ภาพรวมวันนี้</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {kpis.map((k) => {
            const body = (
              <>
                <div className="text-xs text-[color:var(--color-muted)]">{k.label}</div>
                <div className="mt-1 text-2xl font-semibold">{k.value}</div>
                {k.sub && <div className="mt-0.5 text-xs text-[color:var(--color-muted)]">{k.sub}</div>}
              </>
            );
            return k.href ? (
              <Link key={k.key} href={k.href} className="card p-3 hover:bg-[color:var(--color-surface-2)]">
                {body}
              </Link>
            ) : (
              <div key={k.key} className="card p-3">
                {body}
              </div>
            );
          })}
        </div>
      </div>

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
