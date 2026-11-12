"use client";
// SVC H.2 ▸ แถบ KPI 5 การ์ด (ภาพ 08 แถบบน) — แสดงผลอย่างเดียว · ข้อความมาจากผู้เรียก (HotelToday)
export type KpiCard = { key: string; label: string; value: string; unit?: string; foot: string };

export default function TapeKpis({ cards }: { cards: KpiCard[] }) {
  return (
    <section aria-label="สรุปวันนี้" data-tape-kpis="" className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div key={c.key} data-kpi={c.key} className="flex min-w-0 flex-col gap-1 border-b border-r border-[color:var(--color-line)] p-4 last:border-r-0">
          <div className="text-xs text-[color:var(--color-muted)]">{c.label}</div>
          <div className="text-2xl font-bold text-[color:var(--color-ink)]">
            {c.value}
            {c.unit ? <small className="ml-1 text-sm font-medium">{c.unit}</small> : null}
          </div>
          <div className="truncate text-xs text-[color:var(--color-muted)]" title={c.foot}>{c.foot}</div>
        </div>
      ))}
    </section>
  );
}
