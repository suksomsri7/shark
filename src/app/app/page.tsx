import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { PageHeader } from "@/components/ui/PageHeader";
import { activeAnnouncements } from "@/lib/announce/service";
import { dismissAnnouncementAction } from "@/lib/announce/actions";
import { onboardingChecklist } from "@/lib/platform/onboarding-drip";
import { WIDGETS, getDashboardLayout, runWidgets } from "@/lib/dashboard/widgets";
import { DashboardCustomizer } from "./DashboardCustomizer";

// ลิงก์ช่วยทำต่อของแต่ละข้อในเช็กลิสต์เริ่มต้นร้าน
const ONBOARDING_HREF: Record<string, string> = {
  hasSystem: "/app/settings/systems",
  hasUnit: "/app/settings/units/new",
  hasProduct: "/app/settings/systems",
  hasPromptpay: "/app/settings/payment",
  hasTeam: "/app/settings/systems",
  triedAi: "/app/dna",
};

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

  const layout = await getDashboardLayout({ tenantId });
  const [units, appSystems, links, appointmentsToday, widgetResults, announcements, checklist] =
    await Promise.all([
      prisma.businessUnit.findMany({
        where: { tenantId, status: { not: "ARCHIVED" } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.appSystem.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
      prisma.appSystemUnit.findMany({ where: { tenantId } }),
      prisma.appointment.count({
        where: { tenantId, startAt: { gte: todayStart, lt: todayEnd }, status: { not: "CANCELLED" } },
      }),
      runWidgets({ tenantId }, layout),
      activeAnnouncements({ tenantId }),
      onboardingChecklist({ tenantId }),
    ]);

  // ค่า widget สำหรับการ์ด layout ปัจจุบัน (เงินยังเป็นสตางค์ — client ค่อยแปลงบาท)
  const widgetValues: Record<string, number> = {};
  for (const r of widgetResults) widgetValues[r.key] = r.value;
  const widgetMetas = Object.entries(WIDGETS).map(([key, def]) => ({ key, ...def }));

  // เช็กลิสต์เริ่มต้นร้าน — ซ่อนการ์ดทั้งใบเมื่อทำครบทุกข้อ
  const onboardingDone = checklist.filter((c) => c.done).length;
  const showOnboarding = onboardingDone < checklist.length;

  // ประกาศจากแพลตฟอร์ม — แสดงฉบับล่าสุด 1 ฉบับเหนือ "ภาพรวมวันนี้" (ไม่มี = ไม่แสดง)
  const announcement = announcements[0] ?? null;
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

      {/* เริ่มต้นร้านให้ครบ — เช็กลิสต์ติ๊กอัตโนมัติ ซ่อนเมื่อครบทุกข้อ */}
      {showOnboarding && (
        <div className="flex flex-col gap-3 rounded-lg border bg-[color:var(--color-surface-2)] p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">เริ่มต้นร้านให้ครบ</div>
            <div className="text-xs text-[color:var(--color-muted)]">
              {onboardingDone}/{checklist.length} เสร็จแล้ว
            </div>
          </div>
          <ul className="flex flex-col gap-1.5">
            {checklist.map((c) => (
              <li key={c.key}>
                {c.done ? (
                  <div className="flex items-center gap-2 text-sm text-[color:var(--color-muted)]">
                    <span aria-hidden>✅</span>
                    <span className="line-through">{c.label}</span>
                  </div>
                ) : (
                  <Link
                    href={ONBOARDING_HREF[c.key] ?? "/app/settings/systems"}
                    className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-[color:var(--color-surface)]"
                  >
                    <span aria-hidden>⬜</span>
                    <span>{c.label}</span>
                    <span className="ml-auto text-xs text-[color:var(--color-accent)]">ทำต่อ →</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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

      {/* ภาพรวมวันนี้ — การ์ด widget ตาม layout ของร้าน + โหมดปรับแต่ง (เลือก/เรียง) */}
      <DashboardCustomizer widgets={widgetMetas} layout={layout} values={widgetValues} />

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
