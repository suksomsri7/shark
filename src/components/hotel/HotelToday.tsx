// SVC H.2 ▸ KPI หน้าเคาน์เตอร์ (ภาพ 08 แถบบน · ใบสั่ง h.2 §2 มติ 5) — คอมโพเนนต์แสดงผล (ไม่มี directive · ไม่ import ฝั่งเซิร์ฟเวอร์)
//   ข้อมูลมาจาก hotelToday ของ facade (หน้าเรียกแล้วส่ง DTO มา) · ตัวเลขจัดรูปจุลภาค (toLocaleString)
import TapeKpis, { type KpiCard } from "./TapeKpis";
import type { TodayKpiDto } from "./tape-shared";

const n = (v: number): string => v.toLocaleString("th-TH");
const pctBps = (bps: number): string => `${Math.round(bps / 100).toLocaleString("th-TH")}%`;
const pair = (rooms: string[], names: string[]): string => names.map((nm, i) => `${rooms[i] ? `${rooms[i]} ` : ""}${nm}`).join(" · ");

export function todayCards(k: TodayKpiDto): KpiCard[] {
  const offFoot = [k.blockedRooms.length ? `${k.blockedRooms.join(", ")} ปิดซ่อม` : `ปิดซ่อม ${n(k.blocked)}`, k.leasedRooms.length ? `${k.leasedRooms.join(", ")} รายเดือน` : `รายเดือน ${n(k.leased)}`].join(" · ");
  return [
    { key: "arrivals", label: "เข้าวันนี้", value: n(k.arrivals), foot: k.arrivals ? pair(k.arrivalRooms, k.arrivalNames) : "ไม่มีแขกเข้าวันนี้" },
    { key: "departures", label: "ออกวันนี้", value: n(k.departures), foot: k.departures ? pair(k.departureRooms, k.departureNames) : "ไม่มีแขกออกวันนี้" },
    { key: "inHouse", label: "พักอยู่คืนนี้", value: n(k.inHouse), unit: `/ ${n(k.sellable)} ห้อง`, foot: offFoot },
    { key: "hk", label: "แม่บ้าน", value: n(k.hkDirty), unit: "รอทำ", foot: k.dirtyRooms.length ? `${k.dirtyRooms.slice(0, 4).join(", ")} รอทำความสะอาด` : "ทุกห้องพร้อมขาย" },
    { key: "week", label: "สัปดาห์นี้", value: pctBps(k.weekOccBps), foot: `ศ.–ส. ${pctBps(k.weekendOccBps)} · ADR ฿${Math.round(k.adrSatang / 100).toLocaleString("th-TH")}` },
  ];
}

export default function HotelToday({ kpi }: { kpi: TodayKpiDto }) {
  return <TapeKpis cards={todayCards(kpi)} />;
}
