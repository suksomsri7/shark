import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { addDaysYmd, isYmd, listGuests } from "@/lib/modules/hotel";
import { TM30_LABEL, dateShortTh, maskLast4, nationalityText, tm30Badge } from "@/components/hotel/checkin-shared";

// SVC H.4 ▸ ทะเบียนผู้พัก (ร.ร.4 บนจอ · ใบสั่ง h.4 §4) — หน่วย "HOTEL" เท่านั้น · สิทธิ์จาก session (ทะเบียน/เลขเต็ม/เช็กอิน/เช็กเอาต์) ไม่ผ่าน ⇒ notFound
//   กรองช่วงวันเข้า (from/to · ค่าเริ่ม 7 วันล่าสุด) · ค้นชื่อหรือ 4 ตัวท้าย (q) · สถานะ ตม.30 · เลขเอกสาร = 4 ตัวท้ายเท่านั้น (เลขเต็มไม่เข้าการค้นหา)
//   พิมพ์ ร.ร.4 ของช่วงเดียวกัน · บัตร ร.ร.3 รายคน · มือถือ 390: ตารางเลื่อนแนวนอน (data-scroll-hint)
type PageParams = Promise<{ unitSlug: string }>;
type Search = { from?: string | string[]; to?: string | string[]; q?: string | string[]; tm30?: string | string[] };
type PageSearch = Promise<Search>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const TM30_FILTER = ["PENDING", "LATE", "FILED", "NOT_REQUIRED"];

export default async function HotelGuestsPage({ params, searchParams }: { params: PageParams; searchParams?: PageSearch }) {
  const { unitSlug } = await params;
  const sp = (await searchParams) ?? {};
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  const can = (action: string) => evaluate(actor, { module: "hotel", action, unitId: unit.id });
  if (!(can("hotel.guest.register") || can("hotel.guest.viewId") || can("hotel.reservation.checkIn") || can("hotel.reservation.checkOut"))) notFound();
  const today = bkkYmd(new Date());
  const to = isYmd(one(sp.to)) ? one(sp.to) : today;
  const from = isYmd(one(sp.from)) ? one(sp.from) : addDaysYmd(to, -7);
  const q = one(sp.q).trim().slice(0, 80);
  const tm30 = TM30_FILTER.includes(one(sp.tm30)) ? one(sp.tm30) : "";
  const r = await listGuests(actor, { tenantId: auth.active.tenantId }, { unitId: unit.id, from, to, ...(q ? { q } : {}), ...(tm30 ? { tm30 } : {}) });
  if (!r.ok) notFound();
  const base = `/app/u/${unitSlug}/hotel`;
  const rows = r.rows;
  const nowMs = Date.now(); // รอบ 6 ▸ ป้าย ตม.30 เลยกำหนดบนจอ ◂
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-bold">ทะเบียนผู้พัก</h1>
          <p className="text-sm text-[color:var(--color-muted)]">บัตรทะเบียนผู้พัก (ร.ร.3) ของทุกการเข้าพัก · เลขเอกสารแสดง 4 ตัวท้าย</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`${base}/tm30`} className="rounded-xl border border-[color:var(--color-line)] px-3 py-2 text-sm">
            คิวแจ้ง ตม.30
          </a>
          <a href={`${base}/guests/rr4/print?from=${from}&to=${to}`} className="rounded-xl bg-[color:var(--color-ink)] px-3 py-2 text-sm font-bold text-white">
            พิมพ์ทะเบียนผู้พัก (ร.ร.4)
          </a>
        </div>
      </header>
      <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          วันเข้าตั้งแต่
          <input type="date" name="from" defaultValue={from} className="min-h-11 rounded-lg border border-[color:var(--color-line)] px-3" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ถึง
          <input type="date" name="to" defaultValue={to} className="min-h-11 rounded-lg border border-[color:var(--color-line)] px-3" />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ค้นชื่อ หรือ 4 ตัวท้ายเอกสาร
          <input name="q" defaultValue={q} className="min-h-11 rounded-lg border border-[color:var(--color-line)] px-3" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ตม.30
          <select name="tm30" defaultValue={tm30} className="min-h-11 rounded-lg border border-[color:var(--color-line)] px-3">
            <option value="">ทั้งหมด</option>
            {TM30_FILTER.map((s) => (
              <option key={s} value={s}>
                {TM30_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="min-h-11 rounded-lg border border-[color:var(--color-line)] px-4">
          กรอง
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-[color:var(--color-line)] p-4 text-sm text-[color:var(--color-muted)]">ไม่มีผู้พักในช่วงนี้</p>
      ) : (
        <div data-scroll-hint="" className="-mx-1 overflow-x-auto px-1">
          <table data-guest-register="" className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--color-muted)]">
                <th className="py-2">ผู้พัก</th>
                <th className="py-2">สัญชาติ</th>
                <th className="py-2">เอกสาร</th>
                <th className="py-2">ห้อง · การจอง</th>
                <th className="py-2">เข้า – ออก</th>
                <th className="py-2">ร.ร.3</th>
                <th className="py-2">ตม.30</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id} className="border-t border-[color:var(--color-line)]">
                  <td className="py-2 font-medium">
                    <a href={`${base}/guests/${g.id}/rr3/print`} className="text-[color:var(--color-accent)]">
                      {g.fullName}
                    </a>
                  </td>
                  <td className="py-2">{nationalityText(g.nationality, g.nationalityTh)}</td>
                  <td className="py-2">{maskLast4(g.idNumberLast4)}</td>
                  <td className="py-2">
                    <a href={`${base}/reservations/${g.reservationId}?tab=guests`}>
                      {g.roomNumber ?? "—"} · {g.reservationCode}
                    </a>
                  </td>
                  <td className="py-2">
                    {dateShortTh(g.checkIn)} – {dateShortTh(g.checkOut)}
                  </td>
                  <td className="py-2">{g.signed ? "ลงชื่อแล้ว" : "ยังไม่ลงชื่อ"}</td>
                  <td className="py-2">
                    <Tm30Cell status={g.tm30Status} dueAt={g.tm30DueAt} nowMs={nowMs} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// รอบ 6 ▸ ป้าย ตม.30 ใช้ helper เดียวกับคิว/แผงเช็กอิน (PENDING ที่ครบกำหนดแล้ว = "เลยกำหนด ตม.30" + เลยมา N ชม.) ◂
function Tm30Cell({ status, dueAt, nowMs }: { status: string; dueAt: string | null; nowMs: number }) {
  const b = tm30Badge(status, dueAt, nowMs);
  return (
    <span className="flex flex-col gap-0.5">
      <span className={`inline-block self-start rounded-full border px-2 py-0.5 text-xs ${b.tone}`}>{b.label}</span>
      {b.overdue && b.note ? <span className="text-xs text-rose-700">{b.note}</span> : null}
    </span>
  );
}
