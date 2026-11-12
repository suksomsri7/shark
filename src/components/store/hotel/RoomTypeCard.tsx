// SVC H.8 ▸ การ์ดประเภทห้อง (ภาพ 16 ก) — รูป · ชื่อ · เหลือ N ห้อง · ราคารวมตามคืนจริง + แยกคืน · แผนราคา (ลิงก์ไปหน้ายืนยัน) · ห้องเต็มบอกคืนที่เต็ม
import { baht, dayLabel, weekdayShort, type WebLocale } from "./format";

export type CardPlan = { id: string; name: string; totalSatang: number; nights: { date: string; priceSatang: number }[]; cancelSummary: string };
export type CardRoomType = { id: string; name: string; images: string[]; remaining: number; lowStock: boolean; soldOutDates: string[]; plans: CardPlan[] };
export type RoomTypeCardLabels = { photo: string; left: (n: number) => string; soldOutOn: (dates: string) => string; tryOtherDates: string; perNights: (price: string, n: number) => string };

export function RoomTypeCard(props: { rt: CardRoomType; rooms: number; locale: WebLocale; bookHref: (planId: string) => string; labels: RoomTypeCardLabels }) {
  const { rt, locale, labels: L } = props;
  const soldOut = rt.soldOutDates.length > 0 || rt.remaining < props.rooms;
  const plans = rt.plans;
  const best = plans[0] ?? null;
  const same = best ? best.nights.every((n) => n.priceSatang === best.nights[0]?.priceSatang) : false;
  const breakdown = best
    ? same && best.nights.length > 1
      ? L.perNights(baht(best.nights[0]?.priceSatang ?? 0, locale), best.nights.length)
      : best.nights.map((n) => `${weekdayShort(n.date, locale)} ฿${baht(n.priceSatang, locale)}`).join(" + ")
    : "";
  if (soldOut || !best) {
    return (
      <div className="overflow-hidden rounded-[18px] border border-[color:var(--color-line)] opacity-60" data-room-type={rt.id} data-sold-out="">
        <div className="flex flex-col gap-1 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <b className="text-base">{rt.name}</b>
            <span className="flex-1" />
            {rt.soldOutDates.length ? <span className="text-sm font-semibold text-[color:var(--color-danger)]">{L.soldOutOn(rt.soldOutDates.map((d) => dayLabel(d, locale)).join(", "))}</span> : null}
          </div>
          <div className="text-xs text-[color:var(--color-muted)]">{L.tryOtherDates}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-[18px] border border-[color:var(--color-line)]" data-room-type={rt.id}>
      {rt.images[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={rt.images[0]} alt={rt.name} className="h-[120px] w-full object-cover" />
      ) : (
        <div className="grid h-[92px] place-items-center bg-[color:var(--color-surface-2,#f4f4f5)] text-xs text-[color:var(--color-muted)]">{L.photo}</div>
      )}
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <b className="text-base">{rt.name}</b>
          {rt.lowStock ? <span className="text-xs text-[color:var(--color-muted)]">{L.left(rt.remaining)}</span> : null}
          <span className="flex-1" />
          <span className="text-[17px] font-bold tabular-nums">฿{baht(best.totalSatang * props.rooms, locale)}</span>
        </div>
        <div className="text-xs text-[color:var(--color-muted)]">
          {breakdown}
          {best.cancelSummary ? ` · ${best.cancelSummary}` : ""}
        </div>
        {plans.length > 1 || props.rooms > 1
          ? plans.map((p, i) => (
              <a
                key={p.id}
                href={props.bookHref(p.id)}
                className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-[13.5px] ${i === 0 ? "border-[color:var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : "border-[color:var(--color-line)]"}`}
                data-plan={p.id}
              >
                <span>{p.name}</span>
                <span className="flex-1" />
                <b className="tabular-nums">฿{baht(p.totalSatang * props.rooms, locale)}</b>
              </a>
            ))
          : (
              <a href={props.bookHref(best.id)} className="flex min-h-[44px] items-center gap-2 rounded-xl border border-[color:var(--color-ink)] px-3 text-[13.5px] shadow-[inset_0_0_0_1px_var(--color-ink)]" data-plan={best.id}>
                <span>{best.name}</span>
                <span className="flex-1" />
                <b className="tabular-nums">฿{baht(best.totalSatang * props.rooms, locale)}</b>
              </a>
            )}
      </div>
    </div>
  );
}
