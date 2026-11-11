import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { thaiDateKey } from "@/lib/ui/date";
import { ModuleTabs } from "@/components/module-tabs";
import { hrTabs } from "@/lib/modules/hr/ui";
import { hrViewerOf } from "@/lib/modules/hr/privacy";
// HR H2.2 ▸ ตัวกันของหน้า (F16.3) = ขอบเขตสาขาจาก hr/scope + ตัวโหลดบอร์ดที่คืน null ให้คนที่ไม่ใช่ผู้อ่านตารางกะ ◂
import { hrScopeOf } from "@/lib/modules/hr/scope";
import { loadRosterBoard } from "@/lib/modules/hr/roster-board";
import { RosterBoard } from "@/lib/modules/hr/roster-ui";

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
  return (
    <div data-testid="hr-roster-page" className="flex flex-col gap-6">
      <ModuleTabs items={hrTabs(id)} />
      <RosterBoard board={board} systemId={id} basePath={`/app/sys/${id}/hr/roster`} />
    </div>
  );
}
