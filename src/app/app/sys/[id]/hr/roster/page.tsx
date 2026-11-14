import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { thaiDateKey } from "@/lib/ui/date";
import { ModuleTabs } from "@/components/module-tabs";
import { hrTabsFor } from "@/lib/modules/hr/ui"; // HR H2.10 ▸ hrTabsFor ◂
import { hrViewerOf } from "@/lib/modules/hr/privacy";
// HR H2.2 ▸ ตัวกันของหน้า (F16.3) = ขอบเขตสาขาจาก hr/scope + ตัวโหลดบอร์ดที่คืน null ให้คนที่ไม่ใช่ผู้อ่านตารางกะ ◂
import { hrScopeOf } from "@/lib/modules/hr/scope";
import { loadRosterBoard } from "@/lib/modules/hr/roster-board";
import { RosterBoard } from "@/lib/modules/hr/roster-ui";
import { getLocale } from "next-intl/server"; // HR H4.2 ◂
import { laborDay, laborWeek } from "@/lib/modules/hr/labor"; // HR H4.2 ▸ หัวคอลัมน์ จัด/ต้องการ · แถบท้ายค่าแรง · แผงความต้องการคน (นับร่างด้วย — Q13) ◂
import { dayLabel } from "@/lib/modules/hr/roster-board-shared"; // HR H4.2 ◂

// HR H2.2 ▸ หน้าจัดตารางกะรายสัปดาห์ (mockup 03) — แถว = คน × คอลัมน์ = จันทร์–อาทิตย์ (ปฏิทินไทย)
//   เปิดได้ = OWNER · MANAGER · hr.employee.create (Q1) · อื่น ๆ / ระบบไม่ใช่ HR / ข้ามร้าน = 404 ·
//   ?week=YYYY-MM-DD วันใดก็ได้ ⇒ จันทร์ของสัปดาห์ (ผิดรูป ⇒ สัปดาห์นี้) · ?unit=<สาขา>|all นอกขอบเขต ⇒ ค่าตั้งต้นเงียบ ๆ ·
//   "วันนี้" อ่านที่ server ครั้งเดียวแล้วส่งลงไป (client ไม่อ่านนาฬิกา) ◂
export default async function HrRosterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string; unit?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const auth = await requireTenant();
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId: auth.active.tenantId, type: "HR" } });
  if (!sys) notFound();
  const viewer = hrViewerOf(auth);
  const scope = hrScopeOf(viewer);
  if (scope.unitIds !== "*" && scope.unitIds.length === 0) notFound();
  const board = await loadRosterBoard({ tenantId: auth.active.tenantId, systemId: id }, viewer, {
    week: typeof sp.week === "string" ? sp.week : undefined,
    unit: typeof sp.unit === "string" ? sp.unit : undefined,
    todayKey: thaiDateKey(new Date()),
  });
  if (!board) notFound();
  // HR H4.2 ▸ ค่าแรง/ความต้องการคนของสัปดาห์ + สาขาที่บอร์ดเลือก ("all" = ทุกสาขาในขอบเขต) · แผง = วันที่ขาดคนมากสุด ไม่งั้นวันนี้ (ถ้าอยู่ในสัปดาห์) ไม่งั้นวันจันทร์ ◂
  const lctx = { tenantId: auth.active.tenantId, systemId: id }; // HR H4.2 ◂
  const lnow = new Date(); // HR H4.2 ◂
  const locale = await getLocale(); // HR H4.2 ◂
  const lunit = board.unitSel && board.unitSel !== "all" ? board.unitSel : undefined; // HR H4.2 ◂
  const lweek = await laborWeek(lctx, viewer, { unitId: lunit, week: board.monday }, { now: lnow, locale }); // HR H4.2 ◂
  const lgap = (d: { scheduledAtPeak: number | null; neededAtPeak: number | null }) => (d.neededAtPeak ?? 0) - (d.scheduledAtPeak ?? 0); // HR H4.2 ◂
  const lworst = lweek.ok ? [...lweek.days].sort((a, b) => lgap(b) - lgap(a))[0] : undefined; // HR H4.2 ◂
  const ltoday = thaiDateKey(lnow); // HR H4.2 ◂
  const lpanel = lweek.ok ? (lworst && lgap(lworst) > 0 ? lworst.day : lweek.days.some((d) => d.day === ltoday) ? ltoday : board.monday) : null; // HR H4.2 ◂
  const lday = lpanel ? await laborDay(lctx, viewer, { unitId: lunit, day: lpanel }, { now: lnow, locale, drafts: true }) : null; // HR H4.2 ◂
  const labor = lweek.ok && lpanel ? { week: lweek, day: lday?.ok ? { ...lday, money: null } : null /* แผงใช้หัวคนเท่านั้น — ไม่ส่งเงินลง client */, dayLabel: locale === "th" ? dayLabel(lpanel) : lpanel } : null; // HR H4.2 ◂
  return (
    <div data-testid="hr-roster-page" className="flex flex-col gap-6">
      {/* HR H2.10 ▸ แท็บตามผู้ดู (hrNavFilter) ◂ */}
      <ModuleTabs items={await hrTabsFor(id)} />
      <RosterBoard board={board} systemId={id} basePath={`/app/sys/${id}/hr/roster`} labor={labor} /* HR H4.2 ◂ */ />
    </div>
  );
}
