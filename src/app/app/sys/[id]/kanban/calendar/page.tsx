import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadKanban, listSystemCalendar, toActor } from "@/lib/modules/kanban/service";
import { KanbanTabs } from "@/components/kanban/KanbanTabs";
import { SystemCalendar } from "@/components/kanban/SystemCalendar";
import { PageHeader } from "@/components/ui/PageHeader";

// หน้า "ปฏิทินงาน" รวมทุกบอร์ดที่มองเห็น (K2.12 · ปิดหนี้ P2 · เมนูระบบ `nav.ts` key `calendar`)
//
// 🔴 อ่านอย่างเดียวเสมอ (ไม่มีถาดลาก — ต่างจากปฏิทินของบอร์ดใบเดียว K2.2) · ไม่มีสิทธิ์โมดูล = 404 (§6.3)
// 🔴 Asia/Bangkok = UTC+7 ตายตัว (ไม่มี DST) — คำนวณเดือน/ช่วงเองล้วน ห้าม toLocale*/Intl (บทเรียน K1.5)
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

function bkkYearMonth(ms: number): { year: number; month: number } {
  const d = new Date(ms + BKK_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

export default async function KanbanSystemCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; board?: string }>;
}) {
  const { id } = await params;
  const { month: monthParam, board: boardParam } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "KANBAN" } });
  if (!sys) notFound();

  const actor = toActor(auth.user.id, auth.active);
  if (!canReadKanban(actor)) notFound(); // ไม่มีสิทธิ์โมดูล = ไม่บอกด้วยซ้ำว่าระบบนี้มีปฏิทิน

  const ctx = { tenantId, systemId: id, actorUserId: auth.user.id };
  const now = new Date();
  const nowMs = now.getTime();

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(monthParam ?? "");
  const fallback = bkkYearMonth(nowMs);
  const year = monthMatch ? Number(monthMatch[1]) : fallback.year;
  const month = monthMatch ? Number(monthMatch[2]) - 1 : fallback.month; // 0-11 ภายใน
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  // ช่วง = เดือนที่เลือก ±6 วัน (แบบเดียวกับปฏิทินของบอร์ดใบเดียว K2.2) — พอครอบตารางเดือน 6 สัปดาห์เต็ม
  const monthStartMs = Date.UTC(year, month, 1) - BKK_OFFSET_MS;
  const monthEndMs = Date.UTC(year, month + 1, 1) - BKK_OFFSET_MS;
  const from = new Date(monthStartMs - 6 * DAY_MS);
  const to = new Date(monthEndMs + 6 * DAY_MS);

  const boardIds = (boardParam ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const data = await listSystemCalendar(ctx, actor, { from, to, now, ...(boardIds.length ? { boardIds } : {}) });

  return (
    <div className="flex flex-col gap-4">
      <div className="px-2">
        <PageHeader title={sys.name} back={{ href: `/app/sys/${id}`, label: sys.name }} desc="ปฏิทินงาน — รวมทุกบอร์ดที่มองเห็น อ่านอย่างเดียว" />
        <KanbanTabs systemId={id} actor={actor} />
      </div>
      <div className="rounded-2xl border" style={{ borderColor: "var(--color-line)", background: "var(--color-surface)" }}>
        <SystemCalendar systemId={id} data={data} month={monthKey} now={now.toISOString()} selectedBoardIds={boardIds} />
      </div>
    </div>
  );
}
