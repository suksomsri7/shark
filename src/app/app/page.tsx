import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { activeAnnouncements } from "@/lib/announce/service";
import { dismissAnnouncementAction } from "@/lib/announce/actions";
import { onboardingChecklist } from "@/lib/platform/onboarding-drip";
import { WIDGETS, getDashboardLayout, runWidgets } from "@/lib/dashboard/widgets";
import { DashboardCustomizer } from "./DashboardCustomizer";
import { getCalendarEventsAction } from "@/lib/modules/calendar/actions";
import { CalendarMonth, type CalEventDTO } from "@/components/calendar/CalendarMonth";

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
  // ปฏิทินเดือนปัจจุบัน (เวลาไทย) สำหรับ section หน้าแรก
  const calNow = new Date(Date.now() + 7 * 3_600_000);
  const calYear = calNow.getUTCFullYear();
  const calMonth = calNow.getUTCMonth() + 1;
  const calToday = calNow.toISOString().slice(0, 10);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const calFrom = new Date(`${calYear}-${pad2(calMonth)}-01T00:00:00+07:00`);
  const calNext = calMonth === 12 ? `${calYear + 1}-01` : `${calYear}-${pad2(calMonth + 1)}`;
  const calPrev = calMonth === 1 ? `${calYear - 1}-12` : `${calYear}-${pad2(calMonth - 1)}`;
  const calTo = new Date(`${calNext}-01T00:00:00+07:00`);
  const calEvents: CalEventDTO[] = (await getCalendarEventsAction({ from: calFrom.toISOString(), to: calTo.toISOString() })).map((e) => ({
    id: e.id, kind: e.kind, title: e.title, start: new Date(e.startAt).toISOString(), end: new Date(e.endAt).toISOString(), status: e.status,
  }));

  const onboardingDone = checklist.filter((c) => c.done).length;
  const showOnboarding = onboardingDone < checklist.length;

  // ลิงก์ "ทำต่อ" ของแต่ละข้อ — deep-link ไปหน้าระบบจริงถ้าเปิดแล้ว ไม่งั้นเปิด modal เพิ่มระบบ (?add-system=1)
  // (เดิม hasProduct/hasTeam โยนไป /app/settings/systems ทั้งหมด → หลงไปหน้าเพิ่มระบบ)
  // hasProduct: ระบบไหนที่ "ใส่สินค้า/เมนู" ได้ก่อน (คลัง → ร้านอาหาร → ร้านออนไลน์) · ไม่มีเลย → modal เลือกคลังให้ล่วงหน้า
  const productSystem = ["INVENTORY", "RESTAURANT", "SHOP"]
    .map((t) => appSystems.find((s) => s.type === t))
    .find((s) => s !== undefined);
  const hrSystem = appSystems.find((s) => s.type === "HR");
  const onboardingHref: Record<string, string> = {
    hasSystem: "/app?add-system=1",
    hasUnit: "/app/settings/units/new",
    hasProduct: productSystem ? `/app/sys/${productSystem.id}` : "/app?add-system=INVENTORY",
    hasPromptpay: "/app/settings/payment",
    hasTeam: hrSystem ? `/app/sys/${hrSystem.id}` : "/app?add-system=HR",
    triedAi: "/app/dna",
  };

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
                    href={onboardingHref[c.key] ?? "/app?add-system=1"}
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


      {/* ปฏิทินรวมของเดือนนี้ (ย้ายจากเมนูมาหน้าแรก — คำสั่งเจ้าของ 24 ก.ค.) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">ปฏิทิน</h2>
          <Link href="/app/calendar" className="text-xs text-[color:var(--color-accent)] underline">
            ดูเต็มหน้า
          </Link>
        </div>
        <CalendarMonth year={calYear} month={calMonth} events={calEvents} prevYm={calPrev} nextYm={calNext.slice(0, 7)} todayStr={calToday} />
      </div>
    </div>
  );
}
