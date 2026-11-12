"use client";
// SVC H.3 ▸ รายการการจอง (ใบสั่ง h.3 §4) — ตัวกรอง สถานะ/แหล่ง/ช่วงวัน/ค้นหา (ชื่อ · เบอร์ · รหัส) · แถว = รหัส · แขก · ประเภท/ห้อง · วันเข้า–ออก · แหล่ง · สถานะ (นับถอยหลัง HOLD) · ยอด/มัดจำ · กลุ่ม
//   • ปุ่ม «จองใหม่» เฉพาะผู้มีสิทธิ์สร้าง (canCreate) — อ่านอย่างเดียวไม่เห็นปุ่ม · ข้อมูลทั้งหมดมาจากเซิร์ฟเวอร์ (listBookings)
//   • มือถือ 390: ตารางอยู่ในกรอบเลื่อนแนวนอน + data-scroll-hint
import { useEffect, useState } from "react";
import {
  SOURCE_FILTERS,
  SOURCE_TH,
  STATUS_FILTERS,
  STATUS_TH,
  countdownTh,
  dateTh,
  groupTh,
  moneyTh,
  statusToneClass,
  type BookingListRow,
} from "./booking-shared";

type Filters = { status: string; source: string; from: string; to: string; q: string };
type Props = { unitSlug: string; rows: BookingListRow[]; total: number; page: number; pageSize: number; filters: Filters; canCreate: boolean; nowMs: number };

const INPUT = "min-h-11 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-sm";
const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm";
const BTN_PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-bold text-white";

function pageHref(base: string, f: Filters, page: number): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export default function BookingList({ unitSlug, rows, total, page, pageSize, filters, canCreate, nowMs }: Props) {
  const [now, setNow] = useState(nowMs);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const base = `/app/u/${unitSlug}/hotel/reservations`;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div data-booking-list="" className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold text-[color:var(--color-ink)]">การจอง</h1>
          <p className="text-sm text-[color:var(--color-muted)]">ทั้งหมด {total} รายการ</p>
        </div>
        {canCreate && (
          <a href={`${base}/new`} data-new-booking="" className={BTN_PRIMARY}>
            จองใหม่
          </a>
        )}
      </header>

      <form method="get" action={base} className="grid grid-cols-2 gap-2 sm:grid-cols-6" aria-label="ตัวกรองการจอง">
        <select name="status" defaultValue={filters.status} className={INPUT} aria-label="สถานะ">
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.labelTh}
            </option>
          ))}
        </select>
        <select name="source" defaultValue={filters.source} className={INPUT} aria-label="แหล่งที่มา">
          {SOURCE_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.labelTh}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={filters.from} className={INPUT} aria-label="พักตั้งแต่วันที่" />
        <input type="date" name="to" defaultValue={filters.to} className={INPUT} aria-label="พักถึงวันที่" />
        <input type="search" name="q" defaultValue={filters.q} placeholder="ค้นหาชื่อ เบอร์ หรือรหัส" className={`${INPUT} col-span-2 sm:col-span-1`} />
        <button type="submit" className={BTN}>
          กรอง
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[color:var(--color-line)] p-6 text-center text-sm text-[color:var(--color-muted)]">ยังไม่มีการจองตามตัวกรองนี้</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[color:var(--color-line)]" data-scroll-hint="เลื่อนซ้ายขวาเพื่อดูทั้งตาราง">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-[color:var(--color-surface-2)] text-left text-xs text-[color:var(--color-muted)]">
              <tr>
                <th className="px-3 py-2">รหัส</th>
                <th className="px-3 py-2">แขก</th>
                <th className="px-3 py-2">ประเภท / ห้อง</th>
                <th className="px-3 py-2">เข้า – ออก</th>
                <th className="px-3 py-2">แหล่ง</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2 text-right">ยอด / มัดจำ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-booking-row={r.status} className="border-t border-[color:var(--color-line)] align-top">
                  <td className="px-3 py-2 font-mono">
                    <a href={`${base}/${r.id}`} className="text-[color:var(--color-accent)] underline-offset-2 hover:underline">
                      {r.code}
                    </a>
                    {r.groupSize > 1 ? <div className="text-xs text-[color:var(--color-muted)]">{groupTh(r.groupSize)}</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.guestName}</div>
                    {r.guestPhone ? <div className="text-xs text-[color:var(--color-muted)]">{r.guestPhone}</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    <div>{r.roomTypeName}</div>
                    <div className="text-xs text-[color:var(--color-muted)]">{r.roomNumber ? `ห้อง ${r.roomNumber}` : "ยังไม่กำหนดห้อง"}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {dateTh(r.checkIn)} – {dateTh(r.checkOut)}
                    <div className="text-xs text-[color:var(--color-muted)]">{r.nights} คืน</div>
                  </td>
                  <td className="px-3 py-2">{SOURCE_TH[r.source] ?? r.source}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${statusToneClass(r.status)}`}>{STATUS_TH[r.status] ?? r.status}</span>
                    {r.status === "HOLD" ? (
                      <div data-hold-countdown="" className="mt-1 text-xs text-amber-700">
                        {countdownTh(r.holdExpiresAt, now, r.holdKind)}
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <div>฿{moneyTh(r.totalSatang)}</div>
                    {r.depositSatang > 0 ? (
                      <div className="text-xs text-[color:var(--color-muted)]">
                        มัดจำ ฿{moneyTh(r.depositSatang)} {r.depositPaid ? "· รับแล้ว" : "· ยังไม่รับ"}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav aria-label="หน้า" className="flex items-center justify-center gap-2 text-sm">
          {page > 1 ? (
            <a className={BTN} href={pageHref(base, filters, page - 1)}>
              ก่อนหน้า
            </a>
          ) : null}
          <span>
            หน้า {page} จาก {pages}
          </span>
          {page < pages ? (
            <a className={BTN} href={pageHref(base, filters, page + 1)}>
              ถัดไป
            </a>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
