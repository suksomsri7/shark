"use client";

// SequenceCalendarSettings.tsx — วันทำการและวันหยุดของร้าน (ใช้ตอนขั้น "รอ" นับวันทำการ · ใบ C2.2 · R-E.9)
// 🔴 client component — import เฉพาะ server actions ของหน้า (ห้าม import โมดูล CRM ที่แตะ prisma · fitness F2.3)
// 🔴 "นำเข้าวันหยุดราชการไทยของปี N" = รายการวันที่ตายตัวในโค้ด (เฉพาะวันหยุดวันที่คงที่) — ร้านแก้/ลบ/เพิ่มเองได้ทุกวัน
// 🔴 การเขียนทุกครั้งเป็นคำสั่ง SQL เดียว (jsonb_set) ในบริการ — คีย์อื่นของการตั้งค่า CRM ไม่ถูกแตะ

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addHolidayAction, importThaiHolidaysAction, removeHolidayAction, setBusinessDaysAction } from "@/app/app/sys/[id]/crm/settings/sequences/actions";
import { WEEKDAYS, type SeqCalendarData } from "./types";

const thaiDate = (d: string) => {
  const [y, m, dd] = d.split("-").map((x) => Number(x));
  if (!y || !m || !dd) return d;
  return `${dd.toLocaleString("th-TH")} ${["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][m]} ${(y + 543).toLocaleString("th-TH", { useGrouping: false })}`;
};

export function SequenceCalendarSettings({ data }: { data: SeqCalendarData }) {
  const router = useRouter();
  const { systemId } = data;
  const [days, setDays] = useState<number[]>(data.businessDays);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [year, setYear] = useState(String(data.importYears[0] ?? 2026));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (f: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) => {
    setBusy(true);
    const r = await f();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
    return r.ok;
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="crm-seq-calendar">
      <section className="card flex min-w-0 flex-col gap-3 p-4">
        <h2 className="font-semibold">วันทำการ</h2>
        <p className="text-xs text-[color:var(--color-muted)]">ขั้น “รอ” ของลำดับที่ตั้งว่า “นับเฉพาะวันทำการ” จะข้ามวันที่ไม่ได้ติ๊กไว้ และข้ามวันหยุดด้านล่าง</p>
        <div className="flex flex-wrap gap-3 text-sm">
          {WEEKDAYS.map((w) => (
            <label key={w.value} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={days.includes(w.value)}
                disabled={busy}
                onChange={(e) => setDays((list) => (e.target.checked ? [...new Set([...list, w.value])] : list.filter((d) => d !== w.value)))}
                data-testid={`crm-seq-bizday-${w.value}`}
              />
              {w.label}
            </label>
          ))}
        </div>
        <div>
          <button type="button" className="btn btn-primary text-sm" disabled={busy} onClick={() => void run(() => setBusinessDaysAction(systemId, days), "บันทึกวันทำการแล้ว")} data-testid="crm-seq-bizday-save">
            บันทึกวันทำการ
          </button>
        </div>
      </section>

      <section className="card flex min-w-0 flex-col gap-3 p-4">
        <h2 className="font-semibold">วันหยุดของร้าน ({data.holidays.length.toLocaleString("th-TH")} วัน)</h2>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => addHolidayAction(systemId, date, name), "เพิ่มวันหยุดแล้ว").then((ok) => {
              if (ok) {
                setDate("");
                setName("");
              }
            });
          }}
          data-testid="crm-seq-holiday-form"
        >
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>วันที่</span>
            <input type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} className="input text-sm" data-testid="crm-seq-holiday-date" />
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>ชื่อวันหยุด</span>
            <input value={name} maxLength={120} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder='เช่น "หยุดประจำปีของร้าน"' className="input text-sm" data-testid="crm-seq-holiday-name" />
          </label>
          <button type="submit" className="btn btn-ghost text-sm" disabled={busy} data-testid="crm-seq-holiday-add">
            เพิ่มวันหยุด
          </button>
        </form>

        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>นำเข้าวันหยุดราชการไทยของปี</span>
            <select value={year} disabled={busy} onChange={(e) => setYear(e.target.value)} className="input w-[160px] text-sm" data-testid="crm-seq-holiday-year">
              {data.importYears.map((y) => (
                <option key={y} value={String(y)}>
                  พ.ศ. {(y + 543).toLocaleString("th-TH", { useGrouping: false })} (ค.ศ. {y.toLocaleString("th-TH", { useGrouping: false })})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            disabled={busy}
            onClick={() => void run(() => importThaiHolidaysAction(systemId, Number(year)), "นำเข้าวันหยุดราชการแล้ว (แก้หรือลบรายวันได้)")}
            data-testid="crm-seq-holiday-import"
          >
            นำเข้าวันหยุดราชการ
          </button>
          <p className="w-full text-xs text-[color:var(--color-muted)]">รายการที่นำเข้ามีเฉพาะวันหยุดที่ “วันที่คงที่ทุกปี” — วันหยุดตามจันทรคติและวันหยุดชดเชยเพิ่มเองได้ด้านบน</p>
        </div>

        {data.holidays.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]" data-testid="crm-seq-holiday-empty">
            ยังไม่มีวันหยุด — ขั้น “รอ” จะนับทุกวันทำการที่ติ๊กไว้ข้างบน
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {data.holidays.map((h) => (
              <li key={h.date} className="flex flex-wrap items-center gap-2 py-2 text-sm" data-testid={`crm-seq-holiday-row-${h.date}`}>
                <span className="w-[140px] shrink-0">{thaiDate(h.date)}</span>
                <span className="min-w-0 flex-1 break-words text-[color:var(--color-muted)]">{h.name || "วันหยุด"}</span>
                <button type="button" className="btn btn-ghost text-xs" disabled={busy} onClick={() => void run(() => removeHolidayAction(systemId, h.date), "ลบวันหยุดแล้ว")} data-testid={`crm-seq-holiday-remove-${h.date}`}>
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {msg && (
        <p className="text-sm" style={{ color: msg.ok ? "var(--color-accent)" : "var(--color-danger)" }} role="status" data-testid="crm-seq-calendar-msg">
          {msg.text}
        </p>
      )}
    </div>
  );
}
