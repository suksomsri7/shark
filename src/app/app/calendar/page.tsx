import { PageHeader } from "@/components/ui/PageHeader";
import { getCalendarEventsAction } from "@/lib/modules/calendar/actions";
import { CalendarMonth, type CalEventDTO } from "@/components/calendar/CalendarMonth";

// หน้าปฏิทินกลางรวม (WO-0057) — READ-ONLY: นัดหมาย + การเข้าพัก + วันลา ในมุมมองเดือน
// นำทางเดือนผ่าน ?ym=YYYY-MM (server-rendered) · แตะวันเพื่อดูรายการ (client)

const pad = (n: number) => String(n).padStart(2, "0");

// เดือนปัจจุบันตามเวลาไทย
function currentYm(): string {
  const bkk = new Date(Date.now() + 7 * 3_600_000);
  return `${bkk.getUTCFullYear()}-${pad(bkk.getUTCMonth() + 1)}`;
}
function todayStr(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}
function parseYm(ym: string | undefined): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(ym ?? "");
  if (!m) return parseYm(currentYm());
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return parseYm(currentYm());
  return { year, month };
}
function shiftYm(year: number, month: number, delta: number): string {
  const total = year * 12 + (month - 1) + delta;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const { ym } = await searchParams;
  const { year, month } = parseYm(ym);

  // ช่วงเวลาของเดือน (BKK) แบบ half-open [from, to)
  const from = new Date(`${year}-${pad(month)}-01T00:00:00+07:00`);
  const nextYm = shiftYm(year, month, 1);
  const to = new Date(`${nextYm}-01T00:00:00+07:00`);

  const events = await getCalendarEventsAction({ from: from.toISOString(), to: to.toISOString() });
  const dtos: CalEventDTO[] = events.map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.title,
    start: new Date(e.startAt).toISOString(),
    end: new Date(e.endAt).toISOString(),
    status: e.status,
  }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="ปฏิทิน"
        desc="รวมนัดหมาย การเข้าพัก และวันลาของทั้งร้านในที่เดียว"
      />
      <CalendarMonth
        year={year}
        month={month}
        events={dtos}
        todayStr={todayStr()}
      />
    </div>
  );
}
