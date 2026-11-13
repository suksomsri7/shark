"use client";
// TRIPS T1.3 ▸ ตารางการจอง 6 คอลัมน์ (ภาพ 18 :44–:55) + การ์ดต่อการจองบนมือถือ + ท้ายตาราง
//   จอ ≥ md: ตารางเต็มความกว้าง (ขั้นต่ำ 900px ในกล่องเลื่อนของตัวเอง) · มือถือ: การ์ด ไม่มีตาราง
//   🔴 แสดงผลเท่านั้น — แถว/ป้าย/ยอด/จำนวน มาจาก loadBookingListVM · กดแถว = ลิงก์จริง ?b=<การจอง> (เปิดลิ้นชักรายละเอียด)
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BookingListVM, BookingRowVM } from "@/lib/modules/trips";
import { TD, TH } from "./ProductsScreenParts";
import { BookingBadge, bkHref, useBkText, type BkQuery } from "./BookingParts";
import { formatBaht } from "./trips-shared";

export default function BookingsTable({ vm, base, q, channels }: { vm: BookingListVM; base: string; q: BkQuery; channels: readonly string[] }) {
  const X = useBkText();
  const { t, D, T } = X;
  const router = useRouter();
  const today = vm.unit.today;
  const hrefOf = (row: BookingRowVM) => bkHref(base, q, { b: row.bookingId });
  const tripLine = (row: BookingRowVM) => `${T(row.productTitleTh, row.productTitleEn)} · ${D.short(row.travelDate)}`;
  const subLine = (row: BookingRowVM) => [X.paxLine(row), X.departureCancelled(row)].filter(Boolean).join(" · ");
  const customerOf = (row: BookingRowVM) => (row.bookerPurged ? t("bookings.row.purged") : (row.bookerName ?? t("bookings.row.noBooker")));

  if (vm.rows.length === 0) {
    return (
      <div className="flex min-w-0 flex-col gap-3">
        <p data-testid="trips-bk-empty" role="status" className="rounded-2xl border border-dashed border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-5 py-8 text-center text-sm text-[color:var(--color-ink-soft)]">
          {t("bookings.empty")}
        </p>
        <Footer vm={vm} />
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* ── จอกว้าง: ตาราง 128 + 176 + 200 + 112 + 136 + 148 = 900 ── */}
      <div data-testid="trips-bk-table" className="relative min-w-0 overflow-x-auto max-md:hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
        <table aria-label={t("bookings.row.tableAria")} className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b border-[color:var(--color-line)]">
              <th scope="col" className={`${TH} min-w-[128px] pl-4`}>
                {t("bookings.col.code")}
              </th>
              <th scope="col" className={`${TH} min-w-[176px]`}>
                {t("bookings.col.customer")}
              </th>
              <th scope="col" className={`${TH} min-w-[200px]`}>
                {t("bookings.col.trip")}
              </th>
              <th scope="col" className={`${TH} min-w-[112px] text-right`}>
                {t("bookings.col.total")}
              </th>
              <th scope="col" className={`${TH} min-w-[136px]`}>
                {t("bookings.col.money")}
              </th>
              <th scope="col" className={`${TH} min-w-[148px] pr-4`}>
                {t("bookings.col.status")}
              </th>
            </tr>
          </thead>
          <tbody>
            {vm.rows.map((row) => {
              const selected = q.b === row.bookingId;
              return (
                <tr
                  key={row.bookingId}
                  data-testid={`trips-bk-row-${row.bookingId}`}
                  data-status={row.status}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => router.push(hrefOf(row), { scroll: false })}
                  className={`cursor-pointer border-b border-[color:var(--color-line)] last:border-b-0 hover:bg-[color:var(--color-surface-2)] ${selected ? "bg-[color:var(--color-surface-2)]" : ""}`}
                >
                  <td className={`${TD} pl-4`}>
                    <Link href={hrefOf(row)} scroll={false} onClick={(e) => e.stopPropagation()} aria-label={t("bookings.row.open", { code: row.code })} className="inline-flex min-h-11 items-center whitespace-nowrap font-bold text-[color:var(--color-ink)] underline-offset-2 hover:underline">
                      {row.code}
                    </Link>
                    <div className="whitespace-nowrap text-sm text-[color:var(--color-muted)]">{t("bookings.row.booked", { date: D.short(row.createdLocal) })}</div>
                  </td>
                  <td className={TD}>
                    <div className="[overflow-wrap:anywhere]">{customerOf(row)}</div>
                    <div className="text-sm text-[color:var(--color-muted)] [overflow-wrap:anywhere]">{X.channel(row, channels)}</div>
                  </td>
                  <td className={TD}>
                    <div className="[overflow-wrap:anywhere]">{tripLine(row)}</div>
                    <div className="text-sm text-[color:var(--color-muted)] [overflow-wrap:anywhere]">{subLine(row)}</div>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>{formatBaht(row.payableSatang)}</td>
                  <td className={TD}>
                    {X.moneyLines(row).map((line, i) => (
                      <div key={line} className={i === 0 ? "[overflow-wrap:anywhere]" : "text-sm text-[color:var(--color-muted)] [overflow-wrap:anywhere]"}>
                        {line}
                      </div>
                    ))}
                  </td>
                  <td className={`${TD} pr-4`}>
                    <BookingBadge row={row} today={today} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── มือถือ: การ์ดต่อการจอง (ไม่มีตาราง) ── */}
      <ul data-testid="trips-bk-cards" className="flex min-w-0 flex-col gap-2 md:hidden">
        {vm.rows.map((row) => (
          <li key={row.bookingId} className="min-w-0">
            <Link
              data-testid={`trips-bk-card-${row.bookingId}`}
              href={hrefOf(row)}
              scroll={false}
              aria-label={t("bookings.row.open", { code: row.code })}
              className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4 text-sm text-[color:var(--color-ink)]"
            >
              <span className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <b className="whitespace-nowrap">{row.code}</b>
                <BookingBadge row={row} today={today} />
              </span>
              <span className="[overflow-wrap:anywhere]">
                {customerOf(row)} · <span className="text-[color:var(--color-muted)]">{X.channel(row, channels)}</span>
              </span>
              <span className="[overflow-wrap:anywhere]">{tripLine(row)}</span>
              {subLine(row) ? <span className="text-[color:var(--color-muted)] [overflow-wrap:anywhere]">{subLine(row)}</span> : null}
              <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <b className="whitespace-nowrap tabular-nums">{X.money(row.payableSatang)}</b>
                <span className="min-w-0 text-right text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">{X.moneyLines(row).join(" · ")}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Footer vm={vm} />
    </div>
  );
}

function Footer({ vm }: { vm: BookingListVM }) {
  const { t } = useBkText();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p data-testid="trips-bk-footer" className="text-sm text-[color:var(--color-ink-soft)]">
        {t("bookings.footer", { total: vm.total, sum: formatBaht(vm.sumPayableSatang) })}
      </p>
      {vm.truncated ? (
        <p data-testid="trips-bk-truncated" role="status" className="text-sm font-medium text-[color:var(--color-ink)]">
          {t("bookings.truncated", { shown: vm.shown, total: vm.total })}
        </p>
      ) : null}
    </div>
  );
}
