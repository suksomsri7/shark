import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { requireCrmV2Page } from "@/lib/modules/crm/ui-version";
import { activities, forecast, funnel, listSchedules, lostReasons, overview, reps, scores, sources } from "@/lib/modules/crm/reports";
import {
  REPORT_SCHEDULE_FREQUENCIES,
  REPORT_SCHEDULE_FREQUENCY_LABEL,
  REPORT_TABS,
  REPORT_TAB_LABEL,
  REPORT_TAB_SHORT,
  REPORT_WEEKDAY_LABEL,
  ReportsError,
  addDaysYmd,
  isReportTab,
  isThaiYmd,
  periodLabel,
  thaiMonthLabel,
  thaiYmdOf,
  type ReportFilters,
  type ReportTab,
} from "@/lib/modules/crm/reports-shared";
import { ReportsView } from "@/components/crm/reports/ReportsView";
import type { RvData, RvOption, RvSchedulePanel } from "@/components/crm/reports/types";

// รายงาน CRM 8 แท็บ (ใบ C3.1 · พิมพ์เขียว §2.2 `/reports/{overview,forecast,funnel,reps,activities,lost,sources,scores}` · ภาพ 09)
// `/app/sys/{id}/crm/reports/{tab}` — หน้า `/crm/reports` (ภาพรวม) ใช้ตัวนี้ด้วย tab = overview
// 🔴 404-not-403: ระบบไม่ใช่ CRM ของร้านนี้ · ระบบยังไม่เปิด CRM v2 · ไม่มีคีย์ `crm.report.view` · แท็บที่ไม่รู้จัก = notFound()
// 🔴 หน้า GET ไม่เขียนอะไร · ตัวเลขทุกตัวมาจากบริการ (ขอบเขตรายงานของผู้ดู · รวมในฐานข้อมูล) · ด่าน F2.3: แปลงเป็น props ที่นี่
// 🔴 ค่าในลิงก์ (?from=&to=&team=&pipeline=) ไม่ถูกเชื่อ — บริการตรวจซ้ำ (ทีม/pipeline ต้องเป็นของร้าน/ระบบนี้) ·
//    ผิด = แสดงข้อความไทยแล้วคำนวณแบบไม่มีตัวกรองแทน (ไม่ใช่หน้า 500)

type Search = { from?: string; to?: string; range?: string; team?: string; pipeline?: string };

const pad = (n: number) => String(n).padStart(2, "0");
/** วันสุดท้ายของเดือน "YYYY-MM" (ปฏิทินไทย) */
function monthEnd(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return addDaysYmd(next, -1);
}
function shiftMonth(ym: string, n: number): string {
  const idx = Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(5, 7)) - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

/** ตัวเลือกช่วงเวลา (วันไทยของวันนี้) — ค่า "from|to" · "all" = ทุกช่วงเวลา · ค่าปริยาย = ไตรมาสนี้ (ภาพ 09 "ไตรมาส 4/2569") */
function periodOptions(today: string): { options: RvOption[]; quarter: string } {
  const ym = today.slice(0, 7);
  const y = Number(ym.slice(0, 4));
  const q = Math.floor((Number(ym.slice(5, 7)) - 1) / 3);
  const qStart = `${y}-${pad(q * 3 + 1)}`;
  const lqStart = shiftMonth(qStart, -3);
  const lm = shiftMonth(ym, -1);
  const quarter = `${qStart}-01|${monthEnd(shiftMonth(qStart, 2))}`;
  const options: RvOption[] = [
    { value: quarter, label: `ไตรมาส ${q + 1}/${y + 543}` },
    { value: `${lqStart}-01|${monthEnd(shiftMonth(lqStart, 2))}`, label: `ไตรมาส ${((q + 3) % 4) + 1}/${Number(lqStart.slice(0, 4)) + 543}` },
    { value: `${ym}-01|${monthEnd(ym)}`, label: `เดือนนี้ (${thaiMonthLabel(ym)})` },
    { value: `${lm}-01|${monthEnd(lm)}`, label: `เดือนที่แล้ว (${thaiMonthLabel(lm)})` },
    { value: `${addDaysYmd(today, -29)}|${today}`, label: "30 วันล่าสุด" },
    { value: `${y}-01-01|${y}-12-31`, label: `ปี ${y + 543}` },
    { value: "all", label: "ทุกช่วงเวลา" },
  ];
  return { options, quarter };
}

export default async function CrmReportTabPage({ params, searchParams }: { params: Promise<{ id: string; tab: string }>; searchParams: Promise<Search> }) {
  const { id, tab: rawTab } = await params;
  const sp = (await searchParams) ?? {};
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "CRM" }, select: { id: true } });
  if (!sys) notFound();
  // CRM uiVersion gate ▸ route นี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด (settings.crm.uiVersion ≠ 2) = 404 ◂
  await requireCrmV2Page({ tenantId, systemId: id });
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!crmCan(actor, "crm.report.view")) notFound();
  if (!isReportTab(rawTab)) notFound();
  const tab: ReportTab = rawTab;
  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };

  // ── ตัวกรองจากลิงก์ ──
  const today = thaiYmdOf(new Date());
  const { options: periods, quarter } = periodOptions(today);
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 64) : "");
  let from = str(sp.from);
  let to = str(sp.to);
  const all = str(sp.range) === "all";
  if (!all && !from && !to) [from, to] = quarter.split("|") as [string, string];
  let period = all ? "all" : `${from}|${to}`;
  if (!periods.some((p) => p.value === period)) {
    const ok = (!from || isThaiYmd(from)) && (!to || isThaiYmd(to));
    periods.push({ value: period, label: ok ? periodLabel({ from: from || null, to: to || null }) : "ช่วงที่กำหนดเอง" });
  }
  const filters: ReportFilters = { ...(all ? {} : { from: from || null, to: to || null }), teamId: str(sp.team) || null, pipelineId: str(sp.pipeline) || null };

  // ── ข้อมูลของแท็บ (แท็บ forecast = แดชบอร์ดของภาพ 09) ──
  const load = async (f: ReportFilters): Promise<RvData> => {
    const d: RvData = {};
    if (tab === "overview") {
      d.overview = await overview(ctx, actor, f);
      d.reps = await reps(ctx, actor, f);
      d.lost = await lostReasons(ctx, actor, f);
    } else if (tab === "forecast") {
      d.forecast = await forecast(ctx, actor, { ...f, groupBy: "month" });
      d.funnel = await funnel(ctx, actor, f);
      d.reps = await reps(ctx, actor, f);
      d.lost = await lostReasons(ctx, actor, f);
      d.sources = await sources(ctx, actor, f);
    } else if (tab === "funnel") d.funnel = await funnel(ctx, actor, f);
    else if (tab === "reps") d.reps = await reps(ctx, actor, f);
    else if (tab === "activities") d.activities = await activities(ctx, actor, f);
    else if (tab === "lost") d.lost = await lostReasons(ctx, actor, f);
    else if (tab === "sources") d.sources = await sources(ctx, actor, f);
    else d.scores = await scores(ctx, actor, f);
    return d;
  };
  let error: string | null = null;
  let data: RvData;
  let used = filters;
  try {
    data = await load(filters);
  } catch (e) {
    if (e instanceof ReportsError && e.code === "VALIDATION") {
      error = `${e.message} — แสดงผลแบบไม่มีตัวกรองแทน`;
      used = {};
      period = "all";
      data = await load(used);
    } else if (e instanceof ReportsError && e.code === "NOT_FOUND") notFound();
    else throw e;
  }

  // ── ตัวเลือกของแถบตัวกรอง (ทีมของร้าน · pipeline ของระบบนี้) ──
  const [teams, pipes] = await Promise.all([
    prisma.team.findMany({ where: { tenantId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    prisma.crmPipeline.findMany({ where: { tenantId, systemId: id, archivedAt: null }, select: { id: true, name: true }, orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }], take: 100 }),
  ]);

  // ── หน้าต่างตั้งเวลา (คีย์ crm.report.all เท่านั้น) ──
  let schedule: RvSchedulePanel | null = null;
  if (crmCan(actor, "crm.report.all")) {
    const [list, staff] = await Promise.all([
      listSchedules(ctx, actor),
      prisma.membership.findMany({
        where: { tenantId, acceptedAt: { not: null } },
        select: { userId: true, role: true, unitAccess: true, permissions: true, user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
        take: 200,
      }),
    ]);
    schedule = {
      schedules: list.schedules.map((s) => ({
        id: s.id,
        tabLabel: REPORT_TAB_LABEL[s.tab],
        frequencyLabel: REPORT_SCHEDULE_FREQUENCY_LABEL[s.frequency],
        whenLabel: s.frequency === "WEEKLY" ? `ทุกวัน${REPORT_WEEKDAY_LABEL[s.weekday] ?? ""}` : s.frequency === "MONTHLY" ? `ทุกวันที่ ${s.dayOfMonth}` : "ทุกเช้า",
        recipients: s.recipientUserIds.length,
      })),
      tabs: REPORT_TABS.map((k) => ({ value: k, label: REPORT_TAB_LABEL[k] })),
      frequencies: REPORT_SCHEDULE_FREQUENCIES.map((f) => ({ value: f, label: REPORT_SCHEDULE_FREQUENCY_LABEL[f] })),
      weekdays: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: REPORT_WEEKDAY_LABEL[d] ?? String(d) })),
      // S5: เสนอเฉพาะพนักงานที่ "ดูรายงานได้" (คนอื่นรับไม่ได้ — บริการปฏิเสธซ้ำอีกชั้นตอนบันทึก)
      staff: staff
        .filter((m) => crmCan(toMemberActor(m.userId, m), "crm.report.view"))
        .map((m) => ({ value: m.userId, label: (m.user?.name ?? "").trim() || "พนักงาน (ยังไม่ตั้งชื่อ)" })),
    };
  }

  const q = new URLSearchParams();
  if (period === "all") q.set("range", "all");
  else {
    if (used.from) q.set("from", used.from);
    if (used.to) q.set("to", used.to);
  }
  if (used.teamId) q.set("team", used.teamId);
  if (used.pipelineId) q.set("pipeline", used.pipelineId);
  const plain: Record<string, string> = {};
  for (const k of ["from", "to", "teamId", "pipelineId"] as const) if (used[k]) plain[k] = used[k] as string;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ReportsView
        systemId={id}
        tab={tab}
        tabs={REPORT_TABS.map((k) => ({ key: k, label: REPORT_TAB_SHORT[k] }))}
        query={q.toString()}
        filters={plain}
        filterState={{ period, team: used.teamId ?? "", pipeline: used.pipelineId ?? "" }}
        periods={periods}
        teams={teams.map((t) => ({ value: t.id, label: t.name }))}
        pipelines={pipes.map((p) => ({ value: p.id, label: p.name }))}
        periodText={period === "all" ? "ทุกช่วงเวลา" : periodLabel(used)}
        data={data}
        error={error}
        schedule={schedule}
      />
    </div>
  );
}
