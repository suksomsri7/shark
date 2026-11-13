"use client";
// TRIPS T1.3 ▸ คิว "เอกสารเงินรอออก" ของทั้งหน่วย (?view=docs): แถวเงินที่ยังไม่มีเอกสารบัญชี — ร้านออกเองในระบบบัญชีด้วยมือ (ระบบยังไม่ออกให้ · ไม่มีเลขเอกสารบนจอ)
//   จอ ≥ md: ตารางในกล่องเลื่อนของตัวเอง · มือถือ: การ์ด · 🔴 แสดงผลเท่านั้น — แถว/จำนวน/ตัวเลขจาก loadBookingDocsVM
import Link from "next/link";
import type { BookingDocsVM } from "@/lib/modules/trips";
import { TD, TH } from "./ProductsScreenParts";
import { bkHref, useBkText, type BkQuery } from "./BookingParts";
import { formatBaht } from "./trips-shared";

export default function BookingDocs({ vm, base, q }: { vm: BookingDocsVM; base: string; q: BkQuery }) {
  const X = useBkText();
  const { t } = X;
  const hrefOf = (bookingId: string) => bkHref(base, q, { b: bookingId });
  return (
    <section data-testid="trips-docs" aria-label={t("bookings.docs.title")} className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-dashed border-[color:var(--color-ink-soft)] bg-[color:var(--color-surface)] px-5 py-4">
        <p data-testid="trips-docs-note" className="text-sm text-[color:var(--color-ink)] [overflow-wrap:anywhere]">
          {t("bookings.docs.note")}
        </p>
        <span className="inline-flex items-center gap-1 self-start rounded-md border border-[color:var(--color-ink)] px-2 py-0.5 text-sm text-[color:var(--color-ink)]">{t("bookings.docs.accountant")}</span>
      </div>

      {vm.items.length === 0 ? (
        <p role="status" className="rounded-2xl border border-dashed border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-5 py-8 text-center text-sm text-[color:var(--color-ink-soft)]">
          {t("bookings.docs.empty")}
        </p>
      ) : (
        <>
          <div className="relative min-w-0 overflow-x-auto max-md:hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
            <table aria-label={t("bookings.docs.tableAria")} className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="border-b border-[color:var(--color-line)]">
                  <th scope="col" className={`${TH} pl-4`}>
                    {t("bookings.docs.colAt")}
                  </th>
                  <th scope="col" className={TH}>
                    {t("bookings.docs.colCode")}
                  </th>
                  <th scope="col" className={TH}>
                    {t("bookings.docs.colKind")}
                  </th>
                  <th scope="col" className={TH}>
                    {t("bookings.docs.colTender")}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {t("bookings.docs.colAmount")}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {t("bookings.docs.colVat")}
                  </th>
                  <th scope="col" className={`${TH} pr-4 text-right`}>
                    {t("bookings.docs.colPassThrough")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {vm.items.map((it) => (
                  <tr key={it.eventId} data-testid={`trips-docs-row-${it.eventId}`} className="border-b border-[color:var(--color-line)] last:border-b-0">
                    <td className={`${TD} whitespace-nowrap pl-4`}>{X.stamp(it.atLocal)}</td>
                    <td className={TD}>
                      <Link href={hrefOf(it.bookingId)} scroll={false} className="inline-flex min-h-11 items-center whitespace-nowrap font-bold underline underline-offset-2">
                        {it.code}
                      </Link>
                    </td>
                    <td className={TD}>{X.docKind(it.kind)}</td>
                    <td className={`${TD} whitespace-nowrap`}>{X.tender(it.tender)}</td>
                    <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>{formatBaht(it.amountSatang)}</td>
                    <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>{formatBaht(it.vatSatang)}</td>
                    <td className={`${TD} whitespace-nowrap pr-4 text-right tabular-nums`}>{formatBaht(it.passThroughSatang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex min-w-0 flex-col gap-2 md:hidden">
            {vm.items.map((it) => (
              <li key={it.eventId} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4 text-sm text-[color:var(--color-ink)]">
                <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                  <Link href={hrefOf(it.bookingId)} scroll={false} className="inline-flex min-h-11 items-center font-bold underline underline-offset-2">
                    {it.code}
                  </Link>
                  <b className="whitespace-nowrap tabular-nums">฿{formatBaht(it.amountSatang)}</b>
                </span>
                <span className="[overflow-wrap:anywhere]">{X.docKind(it.kind)}</span>
                <span className="text-[color:var(--color-muted)] [overflow-wrap:anywhere]">
                  {X.stamp(it.atLocal)} · {X.tender(it.tender)} · {t("bookings.detail.vat", { vat: formatBaht(it.vatSatang) })} · {t("bookings.detail.passThrough")} {formatBaht(it.passThroughSatang)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {vm.truncated ? (
        <p data-testid="trips-docs-truncated" role="status" className="text-sm font-medium text-[color:var(--color-ink)]">
          {t("bookings.docs.truncated", { shown: vm.shown, total: vm.count })}
        </p>
      ) : null}
    </section>
  );
}
