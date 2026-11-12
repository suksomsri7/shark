import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { HrAttendanceSection, hrTabsFor } from "@/lib/modules/hr/ui"; // HR H2.10 ▸ hrTabsFor ◂
import { hrViewerOf } from "@/lib/modules/hr/privacy";
// HR H2.5 ▸ ตัวกันของหน้า (F16.3) = ขอบเขตสาขาจาก hr/scope + ตัวโหลดที่คืน null ให้คนที่ไม่ใช่ผู้อ่านตารางกะ ◂
import { hrScopeOf, unitWhere } from "@/lib/modules/hr/scope";
import { canReadRoster } from "@/lib/modules/hr/roster-board";
import { canManageHrSettings } from "@/lib/modules/hr/settings";
import { attendanceNeedsRecompute, JUDGE_TEXT, loadAttendanceBoard, loadAttendanceMonth, myAttendanceMonth } from "@/lib/modules/hr/judge";
import { recomputeAttendanceDayAction } from "@/lib/modules/hr/attendance-actions";
import { AttendanceDayView, AttendanceFlash, AttendanceMonthView, AttendanceViewTabs } from "@/lib/modules/hr/attendance-ui";
import { thaiDateKey } from "@/lib/ui/date";
import { WorkEntriesMonth } from "@/lib/modules/hr/work-entries-ui"; // HR H3.1 ▸ สรุป + รายวันที่ดึงเข้าเงินเดือน (ภาพ 04B) ◂
import { PageHeader } from "@/components/ui/PageHeader";
// HR H2.6 ▸ คำขอแก้เวลา: ฟอร์มยื่น (04A แถว · 04B) + ?view=corrections การ์ด mockup 05 · ผลส่งทาง URL เป็นรหัสสั้น (allowlist) ◂
import { addDays as addDaysKey } from "@/lib/modules/hr/time-rules";
import { correctablePunches, listCorrections, myCorrections, type CorrectablePunch } from "@/lib/modules/hr/correction";
import { CORRECTION_TEXT } from "@/lib/modules/hr/correction-rules";
import { cancelCorrectionAction, decideCorrectionAction, requestCorrectionForAction, requestMyCorrectionAction } from "@/lib/modules/hr/correction-actions";
import { CorrectionForm, CorrectionList } from "@/lib/modules/hr/correction-ui";
import { CLOCK_TEXT } from "@/lib/modules/hr/clock";
import { SELF_DECIDE_REFUSED } from "@/lib/modules/approval/service";
import { HR_OTHER_BRANCH_TEXT, HR_UNASSIGNED_TEXT } from "@/lib/modules/hr/scope";
import { ModuleTabs } from "@/components/module-tabs";

// HR H2.5 ▸ หน้าย่อย "ลงเวลา" (mockup 04) — ?view=day (ทีมรายวัน 04A · ?day= · ?unit=) | ?view=month (ปฏิทินรายคน 04B · ?employee= · ?month=)
//   ผู้อ่าน = ผู้อ่านตารางกะ (OWNER · MANAGER · hr.employee.create) · พนักงานที่ผูกบัญชี (ไม่ใช่ผู้อ่าน) ⇒ ปฏิทินของตัวเอง (Q11) · อื่น ๆ = 404 ·
//   ผลการกดส่งทาง URL เป็นรหัสสั้น (allowlist) · หน้าไม่ส่งเวลา (now) เข้าตัวโหลด (R13) ◂
const MSG_TEXTS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(JUDGE_TEXT).map(([k, v]) => [`j.${k}`, v])),
  // HR H2.6 ▸ ข้อความปฏิเสธของคำขอแก้เวลา (รหัส c.* · x.*) ◂
  ...Object.fromEntries(Object.entries(CORRECTION_TEXT).map(([k, v]) => [`c.${k}`, v])),
  "x.mNoEmp": CLOCK_TEXT.mNoEmp,
  "x.mInactive": CLOCK_TEXT.mInactive,
  "x.self": SELF_DECIDE_REFUSED,
  "x.otherBranch": HR_OTHER_BRANCH_TEXT,
  "x.unassigned": HR_UNASSIGNED_TEXT,
};
const MSG_CODE_OF = new Map(Object.entries(MSG_TEXTS).map(([k, v]) => [v, k]));

export default async function HrAttendancePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; day?: string; unit?: string; employee?: string; month?: string; msg?: string; status?: string }> }) {
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
  const view = sp.view === "month" ? "month" : sp.view === "corrections" ? "corrections" : "day"; // HR H2.6 ◂
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const keep = [view === "day" && str(sp.day) ? `day=${encodeURIComponent(sp.day!)}` : "", view === "day" && str(sp.unit) ? `unit=${encodeURIComponent(sp.unit!)}` : "", view === "month" && str(sp.employee) ? `employee=${encodeURIComponent(sp.employee!)}` : "", view === "month" && str(sp.month) ? `month=${encodeURIComponent(sp.month!)}` : ""].filter(Boolean).join("&");
  const back = `${base}?view=${view}${keep ? `&${keep}` : ""}`;
  const code = str(sp.msg) ?? "";
  const tc = await getTranslations("hr.correction"); // HR H2.6 ◂
  const CORR_OK: Record<string, string> = { "c.sent": tc("done.sent"), "c.applied": tc("done.applied"), "c.approved": tc("done.approved"), "c.rejected": tc("done.rejected"), "c.cancelled": tc("done.cancelled") }; // HR H2.6 ◂
  const flash = code === "ok" ? t("recomputed") : code === "same" ? t("recomputeSame") : code === "fail" ? t("failed") : (CORR_OK[code] ?? MSG_TEXTS[code] ?? "");
  const flashOk = code === "ok" || code === "same" || code in CORR_OK; // HR H2.6 ◂

  const canRecompute = canManageHrSettings(viewer);
  const onRecompute = async (fd: FormData) => {
    "use server";
    const r = await recomputeAttendanceDayAction(fd);
    redirect(`${back}&msg=${r.ok ? (r.changed ? "ok" : "same") : encodeURIComponent(MSG_CODE_OF.get(r.reason) ?? "fail")}`);
  };


  // HR H2.6 ▸ คำขอแก้เวลา — closure ของหน้า: เรียก action แล้ว redirect พร้อมรหัสผล (ไม่ส่งข้อความอิสระทาง URL) ◂
  const actor = { tenantId: auth.active.tenantId, userId: auth.user.id };
  const msgOf = (r: { ok: true; status: string } | { ok: false; reason: string }, okCode: string) => (r.ok ? (r.status === "APPROVED" && okCode === "c.sent" ? "c.applied" : okCode) : (MSG_CODE_OF.get(r.reason) ?? "fail"));
  const corrBack = (v: string) => `${base}?view=${v}${v === "corrections" ? "" : keep ? `&${keep}` : ""}`;
  const onRequestMine = async (fd: FormData) => {
    "use server";
    const r = await requestMyCorrectionAction(fd);
    redirect(`${corrBack(view)}&msg=${encodeURIComponent(msgOf(r, "c.sent"))}`);
  };
  const onRequestFor = async (fd: FormData) => {
    "use server";
    const r = await requestCorrectionForAction(fd);
    redirect(`${corrBack(view)}&msg=${encodeURIComponent(msgOf(r, "c.sent"))}`);
  };
  const onDecide = async (fd: FormData) => {
    "use server";
    const r = await decideCorrectionAction(fd);
    redirect(`${corrBack("corrections")}&msg=${encodeURIComponent(msgOf(r, r.ok && r.status === "REJECTED" ? "c.rejected" : "c.approved"))}`);
  };
  const onCancel = async (fd: FormData) => {
    "use server";
    const r = await cancelCorrectionAction(fd);
    redirect(`${corrBack("corrections")}&msg=${encodeURIComponent(msgOf(r, "c.cancelled"))}`);
  };
  const today = thaiDateKey(new Date());
  /** แถวการลงเวลาที่อยู่ในวันนั้น ± 1 วัน (รอบข้ามเที่ยงคืน) — ให้ฟอร์มของแต่ละวันเลือกแถวเดิมได้ */
  const near = (iso: string, day: string) => {
    const k = thaiDateKey(new Date(iso));
    return k >= addDaysKey(day, -1) && k <= addDaysKey(day, 1);
  };
  const corrLink = (
    <a href={`${base}?view=corrections`} data-testid="hr-att-view-corr-self" className="btn btn-ghost min-h-[44px] text-sm">
      {tc("tab")}
    </a>
  );
  // ◂ HR H2.6

  const hrTabItems = await hrTabsFor(id); // HR H2.10 ▸ แท็บตามผู้ดู (hrNavFilter) ◂
  const header = (title: string) => (
    <>
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={title} />
      {/* HR H2.10 ▸ แท็บตามผู้ดู ◂ */}
      <ModuleTabs items={hrTabItems} />
    </>
  );

  // ── ไม่ใช่ผู้อ่าน: ปฏิทินของตัวเอง (พนักงานที่ผูกบัญชีในระบบนี้) ไม่งั้น 404 ──
  if (!reader) {
    const mine = await myAttendanceMonth({ tenantId: auth.active.tenantId, userId: auth.user.id }, { month: str(sp.month) });
    if (!mine.ok || mine.systemId !== id) notFound();
    // HR H2.6 ▸ ของตัวเอง: ฟอร์ม "ขอแก้เวลา" บนปฏิทิน + รายการคำขอของฉัน (ยกเลิกได้เมื่อยังรอ) ◂
    if (view === "corrections") {
      const my = await myCorrections(ctx, viewer);
      const items = my.ok ? my.items : [];
      return (
        <div data-testid="hr-att-page" className="flex flex-col gap-5">
          {header(t("selfTitle"))}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{tc("mineTitle")}</h1>
            <a href={`${base}?view=month`} className="btn btn-ghost min-h-[44px] text-sm" data-testid="hr-corr-back">
              {t("view.month")}
            </a>
          </div>
          <AttendanceFlash text={flash} ok={flashOk} />
          <CorrectionList items={items} systemId={id} decideIds={new Set()} cancelIds={new Set(items.filter((x) => x.status === "PENDING").map((x) => x.id))} onDecide={null} onCancel={onCancel} />
        </div>
      );
    }
    const firstDay = mine.days[0]?.day ?? `${mine.month}-01`;
    const lastDay = mine.days[mine.days.length - 1]?.day ?? firstDay;
    const myPunches = await correctablePunches(ctx, viewer, { from: firstDay, to: lastDay });
    return (
      <div data-testid="hr-att-page" className="flex flex-col gap-5">
        {header(t("selfTitle"))}
        <AttendanceFlash text={flash} ok={flashOk} />
        <AttendanceMonthView
          month={mine}
          base={base}
          systemId={id}
          people={[]}
          onRecompute={null}
          self
          todayKey={thaiDateKey()}
          corrPanel={
            <div className="flex flex-wrap items-center gap-2">
              <CorrectionForm systemId={id} employeeId={null} day={today >= firstDay && today <= lastDay ? today : lastDay} punches={myPunches} onSubmit={onRequestMine} self />
              {corrLink}
            </div>
          }
          corrFor={(day: string) => <CorrectionForm systemId={id} employeeId={null} day={day} punches={myPunches.filter((p) => near(p.at, day))} onSubmit={onRequestMine} self />}
        />
        <WorkEntriesMonth systemId={id} employeeId={mine.employee.id} month={mine.month} self /> {/* HR H3.1 ◂ */}
      </div>
    );
  }
  if (scope.unitIds !== "*" && scope.unitIds.length === 0) notFound();
  const people = (await prisma.hrEmployee.findMany({ where: { tenantId: auth.active.tenantId, systemId: id, active: true, ...unitWhere(scope) }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 500 })).map((p) => ({ id: p.id, name: p.name }));

  // HR H2.6 ▸ ?view=corrections: การ์ดคำขอแก้เวลาในขอบเขตสาขา (ตัดสินได้ = เจ้าของ/คีย์ และไม่ใช่ของตัวเอง · ยกเลิกได้ = ที่ฉันยื่น/ของฉัน) ◂
  if (view === "corrections") {
    const list = await listCorrections(ctx, viewer, { status: str(sp.status) });
    const mine = await myCorrections(ctx, viewer);
    const items = list.ok ? list.items : [];
    const myIds = new Set(mine.ok ? mine.items.map((x) => x.id) : []);
    const canDecide = viewer.role === "OWNER" || (viewer.permissions as Record<string, unknown>)["hr.employee.create"] === true || (viewer.permissions as Record<string, unknown>)["hr.*"] === true;
    const pend = items.filter((x) => x.status === "PENDING");
    return (
      <div data-testid="hr-att-page" className="flex flex-col gap-5">
        {header(t("desc"))}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <AttendanceViewTabs base={base} view="corrections" />
        </div>
        <AttendanceFlash text={flash} ok={flashOk} />
        <CorrectionList
          items={items}
          systemId={id}
          decideIds={new Set(canDecide ? pend.filter((x) => !myIds.has(x.id)).map((x) => x.id) : [])}
          cancelIds={new Set(pend.filter((x) => myIds.has(x.id)).map((x) => x.id))}
          onDecide={canDecide ? onDecide : null}
          onCancel={onCancel}
        />
      </div>
    );
  }

  if (view === "month") {
    const employeeId = str(sp.employee) ?? people[0]?.id ?? "";
    const month = employeeId ? await loadAttendanceMonth(ctx, viewer, { employeeId, month: str(sp.month) }) : null;
    const mFirst = month?.days[0]?.day ?? "";
    const mLast = month?.days[month.days.length - 1]?.day ?? "";
    const mPunches: CorrectablePunch[] = month ? await correctablePunches(ctx, viewer, { employeeIds: [month.employee.id], from: mFirst, to: mLast }) : []; // HR H2.6 ◂
    return (
      <div data-testid="hr-att-page" className="flex flex-col gap-5">
        {header(t("desc"))}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <AttendanceViewTabs base={base} view="month" employeeId={month?.employee.id ?? null} />
        </div>
        <AttendanceFlash text={flash} ok={flashOk} />
        {month ? (
          <AttendanceMonthView
            month={month}
            base={base}
            systemId={id}
            people={people}
            onRecompute={canRecompute ? onRecompute : null}
            self={false}
            todayKey={thaiDateKey()}
            corrPanel={<CorrectionForm systemId={id} employeeId={month.employee.id} day={today >= mFirst && today <= mLast ? today : mLast} punches={mPunches} onSubmit={onRequestFor} self={false} /> /* HR H2.6 ◂ */}
            corrFor={(day: string) => <CorrectionForm systemId={id} employeeId={month.employee.id} day={day} punches={mPunches.filter((p) => near(p.at, day))} onSubmit={onRequestFor} self={false} />}
          />
        ) : (
          <p className="text-sm text-[color:var(--color-muted)]">{t("empty")}</p>
        )}
        {month && <WorkEntriesMonth systemId={id} employeeId={month.employee.id} month={month.month} self={false} />} {/* HR H3.1 ◂ */}
      </div>
    );
  }

  const board = await loadAttendanceBoard(ctx, viewer, { day: str(sp.day), unit: str(sp.unit) });
  if (!board) notFound();
  const needs = await attendanceNeedsRecompute(ctx, viewer); // HR H2.5 r3 ▸ วันที่ต้องคิดผลใหม่ (แถวกำพร้า) ◂
  // HR H2.6 ▸ ปุ่ม "แก้เวลา" ต่อแถวของทีมรายวัน — แถวการลงเวลาของวันที่ดู (± 1 วัน: รอบข้ามเที่ยงคืน) ◂
  const dayPunches = await correctablePunches(ctx, viewer, { employeeIds: board.rows.map((r) => r.employeeId), from: board.prevDay, to: board.nextDay });
  const corrSlot = (employeeId: string) => <CorrectionForm systemId={id} employeeId={employeeId} day={board.day} punches={dayPunches.filter((p) => p.employeeId === employeeId)} onSubmit={onRequestFor} self={false} />;
  return (
    <div data-testid="hr-att-page" className="flex flex-col gap-5">
      {header(t("desc"))}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <AttendanceViewTabs base={base} view="day" />
      </div>
      <AttendanceFlash text={flash} ok={flashOk} />
      <AttendanceDayView board={board} base={base} systemId={id} onRecompute={canRecompute ? onRecompute : null} clockForPanel={board.canClockFor ? <HrAttendanceSection systemId={id} /> : null} needs={needs} corrSlot={corrSlot} />
    </div>
  );
}
