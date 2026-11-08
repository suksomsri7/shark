// SVC H.8 ▸ แถบค้นหา (ภาพ 16 ก) — ฟอร์ม GET ธรรมดา (ไม่ต้องใช้ JS) · ช่องวันเข้า/ออก · ผู้ใหญ่ · จำนวนห้อง
import { addDays } from "./format";

export type SearchBarLabels = { checkIn: string; checkOut: string; guests: string; rooms: string; search: string; adultsN: (n: number) => string; roomsN: (n: number) => string };

export function SearchBar(props: {
  action: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  rooms: number;
  today: string;
  maxRooms: number;
  lang: string | null;
  labels: SearchBarLabels;
}) {
  const { labels: L } = props;
  const tile = "flex flex-col gap-0.5 rounded-2xl border border-[color:var(--color-line)] px-3 py-2";
  const cap = "text-xs text-[color:var(--color-muted)]";
  const input = "w-full bg-transparent text-[15px] font-semibold outline-none";
  return (
    <form method="get" action={props.action} className="flex flex-col gap-2" data-hotel-search="">
      {props.lang ? <input type="hidden" name="lang" value={props.lang} /> : null}
      <div className="grid grid-cols-2 gap-2">
        <label className={tile}>
          <span className={cap}>{L.checkIn}</span>
          <input type="date" name="checkIn" defaultValue={props.checkIn} min={props.today} className={input} required />
        </label>
        <label className={tile}>
          <span className={cap}>{L.checkOut}</span>
          <input type="date" name="checkOut" defaultValue={props.checkOut} min={addDays(props.today, 1)} className={input} required />
        </label>
        <label className={tile}>
          <span className={cap}>{L.guests}</span>
          <select name="adults" defaultValue={String(props.adults)} className={input}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {L.adultsN(n)}
              </option>
            ))}
          </select>
        </label>
        <label className={tile}>
          <span className={cap}>{L.rooms}</span>
          <select name="rooms" defaultValue={String(props.rooms)} className={input}>
            {Array.from({ length: Math.max(1, props.maxRooms) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {L.roomsN(n)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="btn btn-primary min-h-[44px] text-base">{L.search}</button>
    </form>
  );
}
