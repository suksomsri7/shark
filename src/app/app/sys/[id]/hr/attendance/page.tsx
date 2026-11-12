import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { HrAttendanceSection, hrTabs } from "@/lib/modules/hr/ui";
import { hrViewerOf } from "@/lib/modules/hr/privacy";
// HR H2.5 ▸ ตัวกันของหน้า (F16.3) = ขอบเขตสาขาจาก hr/scope + ตัวโหลดที่คืน null ให้คนที่ไม่ใช่ผู้อ่านตารางกะ ◂
import { hrScopeOf, unitWhere } from "@/lib/modules/hr/scope";
import { canReadRoster } from "@/lib/modules/hr/roster-board";
import { canManageHrSettings } from "@/lib/modules/hr/settings";
import { attendanceNeedsRecompute, JUDGE_TEXT, loadAttendanceBoard, loadAttendanceMonth, myAttendanceMonth } from "@/lib/modules/hr/judge";
import { recomputeAttendanceDayAction } from "@/lib/modules/hr/attendance-actions";
import { AttendanceDayView, AttendanceFlash, AttendanceMonthView, AttendanceViewTabs } from "@/lib/modules/hr/attendance-ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

// HR H2.5 ▸ หน้าย่อย "ลงเวลา" (mockup 04) — ?view=day (ทีมรายวัน 04A · ?day= · ?unit=) | ?view=month (ปฏิทินรายคน 04B · ?employee= · ?month=)
//   ผู้อ่าน = ผู้อ่านตารางกะ (OWNER · MANAGER · hr.employee.create) · พนักงานที่ผูกบัญชี (ไม่ใช่ผู้อ่าน) ⇒ ปฏิทินของตัวเอง (Q11) · อื่น ๆ = 404 ·
//   ผลการกดส่งทาง URL เป็นรหัสสั้น (allowlist) · หน้าไม่ส่งเวลา (now) เข้าตัวโหลด (R13) ◂
const MSG_TEXTS: Record<string, string> = Object.fromEntries(Object.entries(JUDGE_TEXT).map(([k, v]) => [`j.${k}`, v]));
const MSG_CODE_OF = new Map(Object.entries(MSG_TEXTS).map(([k, v]) => [v, k]));

export default async function HrAttendancePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; day?: string; unit?: string; employee?: string; month?: string; msg?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  const def = systemDef(sys.type);
  const t = await getTranslations("hr.attendance");
  const viewer = hrViewerOf(auth);
  const scope = hrScopeOf(viewer);
  const ctx = { tenantId: auth.active.tenantId, systemId: id };
  const base = `/app/sys/${id}/hr/attendance`;
  const reader = canReadRoster(viewer);
  const view = sp.view === "month" ? "month" : "day";
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const keep = [view === "day" && str(sp.day) ? `day=${encodeURIComponent(sp.day!)}` : "", view === "day" && str(sp.unit) ? `unit=${encodeURIComponent(sp.unit!)}` : "", view === "month" && str(sp.employee) ? `employee=${encodeURIComponent(sp.employee!)}` : "", view === "month" && str(sp.month) ? `month=${encodeURIComponent(sp.month!)}` : ""].filter(Boolean).join("&");
  const back = `${base}?view=${view}${keep ? `&${keep}` : ""}`;
  const code = str(sp.msg) ?? "";
  const flash = code === "ok" ? t("recomputed") : code === "same" ? t("recomputeSame") : code === "fail" ? t("failed") : (MSG_TEXTS[code] ?? "");

  const canRecompute = canManageHrSettings(viewer);
  const onRecompute = async (fd: FormData) => {
    "use server";
    const r = await recomputeAttendanceDayAction(fd);
    redirect(`${back}&msg=${r.ok ? (r.changed ? "ok" : "same") : encodeURIComponent(MSG_CODE_OF.get(r.reason) ?? "fail")}`);
  };


  const header = (title: string) => (
    <>
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={title} />
      <ModuleTabs items={hrTabs(id)} />
    </>
  );

  // ── ไม่ใช่ผู้อ่าน: ปฏิทินของตัวเอง (พนักงานที่ผูกบัญชีในระบบนี้) ไม่งั้น 404 ──
  if (!reader) {
    const mine = await myAttendanceMonth({ tenantId: auth.active.tenantId, userId: auth.user.id }, { month: str(sp.month) });
    if (!mine.ok || mine.systemId !== id) notFound();
    return (
      <div data-testid="hr-att-page" className="flex flex-col gap-5">
        {header(t("selfTitle"))}
        <AttendanceMonthView month={mine} base={base} systemId={id} people={[]} onRecompute={null} self />
      </div>
    );
  }
  if (scope.unitIds !== "*" && scope.unitIds.length === 0) notFound();
  const people = (await prisma.hrEmployee.findMany({ where: { tenantId: auth.active.tenantId, systemId: id, active: true, ...unitWhere(scope) }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 500 })).map((p) => ({ id: p.id, name: p.name }));

  if (view === "month") {
    const employeeId = str(sp.employee) ?? people[0]?.id ?? "";
    const month = employeeId ? await loadAttendanceMonth(ctx, viewer, { employeeId, month: str(sp.month) }) : null;
    return (
      <div data-testid="hr-att-page" className="flex flex-col gap-5">
        {header(t("desc"))}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <AttendanceViewTabs base={base} view="month" employeeId={month?.employee.id ?? null} />
        </div>
        <AttendanceFlash text={flash} ok={code === "ok" || code === "same"} />
        {month ? <AttendanceMonthView month={month} base={base} systemId={id} people={people} onRecompute={canRecompute ? onRecompute : null} self={false} /> : <p className="text-sm text-[color:var(--color-muted)]">{t("empty")}</p>}
      </div>
    );
  }

  const board = await loadAttendanceBoard(ctx, viewer, { day: str(sp.day), unit: str(sp.unit) });
  if (!board) notFound();
  const needs = await attendanceNeedsRecompute(ctx, viewer); // HR H2.5 r3 ▸ วันที่ต้องคิดผลใหม่ (แถวกำพร้า) ◂
  return (
    <div data-testid="hr-att-page" className="flex flex-col gap-5">
      {header(t("desc"))}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <AttendanceViewTabs base={base} view="day" />
      </div>
      <AttendanceFlash text={flash} ok={code === "ok" || code === "same"} />
      <AttendanceDayView board={board} base={base} systemId={id} onRecompute={canRecompute ? onRecompute : null} clockForPanel={board.canClockFor ? <HrAttendanceSection systemId={id} /> : null} needs={needs} />
    </div>
  );
}
