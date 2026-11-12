// SVC H.7 ▸ การ์ด KPI 4 ใบของหน้ารายงานโรงแรม (ใบสั่ง h.7 §4) — แสดงผลล้วน (ไม่มี directive · import เฉพาะตัวช่วย pure)
//   อัตราเข้าพักวันนี้ (จองแล้ว) · ADR · RevPAR (ของช่วงที่เลือก) · รายได้ห้องเมื่อวาน
import { fmtBaht, fmtPct } from "./reports-shared";

export type KpiCardsProps = { occupancyTodayBps: number; adrSatang: number; revparSatang: number; roomRevenueYesterdaySatang: number; arrivalsToday: number; rangeLabel: string };

const CARD = "flex min-w-0 flex-col gap-1 p-5";
const SOFT = "text-[color:var(--color-ink-soft)]";

export default function KpiCards(p: KpiCardsProps) {
  const cards = [
    { key: "occ", label: "อัตราเข้าพักวันนี้", value: fmtPct(p.occupancyTodayBps), foot: `เข้าพักวันนี้ ${p.arrivalsToday} ราย · นับห้องที่จองแล้ว` },
    { key: "adr", label: "ADR (ราคาเฉลี่ยต่อห้อง)", value: fmtBaht(p.adrSatang), foot: p.rangeLabel },
    { key: "revpar", label: "RevPAR (รายได้ต่อห้องขายได้)", value: fmtBaht(p.revparSatang), foot: p.rangeLabel },
    { key: "rev", label: "รายได้ห้องเมื่อวาน", value: fmtBaht(p.roomRevenueYesterdaySatang), foot: "วันที่ปิดแล้วใช้ตัวเลขจากการปิดวัน" },
  ];
  return (
    <div data-hotel-kpis="" className="grid grid-cols-1 divide-y divide-[color:var(--color-line)] rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.key} data-report-kpi={c.key} className={CARD}>
          <span className={`text-sm ${SOFT}`}>{c.label}</span>
          <span className="text-2xl font-bold tabular-nums">{c.value}</span>
          <span className={`text-xs ${SOFT}`}>{c.foot}</span>
        </div>
      ))}
    </div>
  );
}
