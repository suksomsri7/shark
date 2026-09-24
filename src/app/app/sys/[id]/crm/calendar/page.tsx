import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { toMemberActor } from "@/lib/modules/member";
import { calendar } from "@/lib/modules/crm/activities";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { ActivitiesError, DAY_MS, thaiDateLabel, thaiDayFromKey, thaiDayKey, thaiMonthLabel } from "@/lib/modules/crm/activities-shared";
import { crmNavItems } from "@/lib/modules/crm/nav";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";
import { CALENDAR_VIEWS, CALENDAR_VIEW_LABEL, CalendarBody, calendarWindow, shiftAnchor, type CalendarView } from "./_components/CalendarViews";

// ปฏิทินกิจกรรม CRM (ใบ C1.6 · พิมพ์เขียว §3.8 · ภาพ 08 ขวา) — `/app/sys/{id}/crm/calendar`
// URL state: ?view=day|week|month · ?date=YYYY-MM-DD (วันไทย) · ?scope=mine|team
// CRM C2.4 ▸ รวม "นัดของ Party เดียวกัน" จากโมดูลจอง · คลินิก · โรงเรียน เข้ามาด้วย (อ่านอย่างเดียว — แก้ที่โมดูลต้นทาง) ◂
// 🔴 404-not-403 (COMMON page guard): ระบบไม่ใช่ CRM ของร้านนี้ = notFound() · ข้อมูลมาจาก `activities.calendar` (activityWhere) · หน้า GET ไม่เขียนอะไร

export default async function CrmCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" } });
  if (!sys) notFound();
  // uiVersion gate: ปฏิทินเป็นหน้า v2 ล้วน — ระบบที่ยังไม่เปิด v2 = 404 (ui-version.ts)
  await requireCrmV2Page({ tenantId, systemId: id });
  const def = systemDef(sys.type);
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const view: CalendarView = (CALENDAR_VIEWS as readonly string[]).includes(one("view")) ? (one("view") as CalendarView) : "week";
  const scope = one("scope") === "team" ? "team" : "mine";
  // วันที่จาก URL นอกช่วงที่รองรับ (ค.ศ. 2001–2099) = กลับมาวันนี้ + แจ้งเตือนภาษาไทย (ไม่ใช่หน้า error)
  const asked = thaiDayFromKey(one("date"));
  const askedYear = asked === null ? null : Number(thaiDayKey(asked).slice(0, 4));
  const outOfRange = askedYear !== null && (askedYear < 2001 || askedYear > 2099);
  const anchor = asked !== null && !outOfRange ? asked : Date.now();
  const { start, days } = calendarWindow(view, anchor);
  const notice = { text: outOfRange ? "วันที่ที่เลือกอยู่นอกช่วงที่ปฏิทินรองรับ — แสดงช่วงของวันนี้แทน" : (null as string | null) };
  const res = await calendar(ctx, actor, { from: new Date(start), to: new Date(start + days * DAY_MS), mine: scope === "mine", team: scope === "team" }).catch((e: unknown) => {
    if (e instanceof ActivitiesError && e.code === "VALIDATION") {
      notice.text = e.message;
      return { items: [], appointments: [], appointmentsTruncated: false };
    }
    throw e;
  });

  const base = `/app/sys/${id}/crm/calendar`;
  const href = (patch: { view?: CalendarView; date?: string; scope?: string }) => {
    const q = new URLSearchParams({ view, date: thaiDayKey(anchor), scope, ...patch });
    return `${base}?${q.toString()}`;
  };
  const title =
    view === "month"
      ? thaiMonthLabel(anchor)
      : view === "week"
        ? `${thaiDateLabel(start)} – ${thaiDateLabel(start + 6 * DAY_MS, true)}`
        : thaiDateLabel(start, true);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="crm-calendar-page">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc="ปฏิทินกิจกรรม — นัด โทร งาน ของฉันและของทีม" />
      <ModuleTabs items={crmNavItems(id)} />
      <section className="card flex min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <Link href={href({ date: thaiDayKey(shiftAnchor(view, anchor, -1)) })} className="btn btn-ghost text-sm" aria-label="ช่วงก่อนหน้า" data-testid="calendar-prev">
              ‹
            </Link>
            <Link href={href({ date: thaiDayKey(Date.now()) })} className="btn btn-ghost text-sm" data-testid="calendar-today">
              วันนี้
            </Link>
            <Link href={href({ date: thaiDayKey(shiftAnchor(view, anchor, 1)) })} className="btn btn-ghost text-sm" aria-label="ช่วงถัดไป" data-testid="calendar-next">
              ›
            </Link>
            <h1 className="min-w-0 truncate font-semibold">ปฏิทิน{CALENDAR_VIEW_LABEL[view]} · {title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="มุมมอง">
              {CALENDAR_VIEWS.map((v, n) => (
                <Link key={v} href={href({ view: v })} className={`px-3 py-1.5 ${n > 0 ? "border-l" : ""}`} style={view === v ? { fontWeight: 700, color: "var(--color-accent)" } : undefined} aria-current={view === v ? "page" : undefined} data-testid={`calendar-view-${v}`}>
                  {CALENDAR_VIEW_LABEL[v]}
                </Link>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="ของใคร">
              <Link href={href({ scope: "mine" })} className="px-3 py-1.5" style={scope === "mine" ? { fontWeight: 700, color: "var(--color-accent)" } : undefined} data-testid="calendar-scope-mine">
                ของฉัน
              </Link>
              <Link href={href({ scope: "team" })} className="border-l px-3 py-1.5" style={scope === "team" ? { fontWeight: 700, color: "var(--color-accent)" } : undefined} data-testid="calendar-scope-team">
                ทีม
              </Link>
            </div>
            <Link href={`/app/sys/${id}/crm/activities`} className="btn btn-ghost text-sm" data-testid="calendar-activities-link">
              รายการกิจกรรม
            </Link>
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-muted)]">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--color-fg, #111)" }} /> นัด/โทร/งาน (CRM)
          <span>· {res.items.length.toLocaleString("th-TH")} รายการ</span>
          {/* CRM C2.4 ▸ ป้ายอธิบายชิปเส้นประ: นัดจากระบบอื่นของร้าน (จอง · คลินิก · โรงเรียน) — อ่านอย่างเดียว ◂ */}
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed" style={{ borderColor: "var(--color-muted)" }} /> นัดจากระบบอื่น (จอง · คลินิก · โรงเรียน) — อ่านอย่างเดียว
          <span>· {res.appointments.length.toLocaleString("th-TH")} รายการ</span>
          {/* ชนเพดานแถวนัด (F5) — บอกตรง ๆ ว่ายังมีต่อ ดีกว่าโชว์ครึ่งเดียวเงียบ ๆ */}
          {res.appointmentsTruncated && <span data-testid="calendar-appointments-truncated">· แสดงเท่าที่พอดีกับหน้าจอ — เลือกช่วงวันที่สั้นลงเพื่อดูครบ</span>}
        </p>
        {notice.text && (
          <p className="rounded-lg border px-3 py-2 text-sm" role="status" data-testid="calendar-notice">
            {notice.text}
          </p>
        )}
        <CalendarBody systemId={id} view={view} anchorMs={anchor} items={res.items} appointments={res.appointments} />
      </section>
    </div>
  );
}
