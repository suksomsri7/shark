"use client";
// TRIPS T1.3 ▸ จอการจองฝั่งร้าน (ภาพ 18): แถบส่วน · ค้น/กรอง · ชิป · การ์ดเงินสดหน้าร้าน · ตารางการจอง (หรือคิวเอกสารเงินรอออก) · ลิ้นชักรายละเอียดทับขวา
//   ข้อมูลทั้งหมดจากตัวโหลด (loadBookingListVM / loadBookingDetailVM / loadBookingDocsVM / loadCashDayVM)
//   URL: ?q= &p= &when= &date= &ch= &chip= &dep= &b= &view= &day= — ตัวกรองทุกตัวเป็นลิงก์/ฟอร์ม GET จริง (ใช้ได้แม้สคริปต์ยังไม่ทำงาน)
//   🔴 แสดงผลเท่านั้น — ไม่มีตรรกะธุรกิจ (ป้าย · ต้องทำ · ปุ่ม · ยอด มาจากตัวโหลด) · ส่วนที่ยังไม่เปิดใช้ = ปุ่มกดไม่ได้ + ข้อความบอกตรง ๆ
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BookingDetailVM, BookingDocsVM, BookingListVM, CashDayVM } from "@/lib/modules/trips";
import { BTN, ErrorLine, INPUT } from "./ProductsScreenParts";
import { SEG_OFF, SEG_ON, SEG_WRAP } from "./DepartureParts";
import { NotYetButton, bkHref, useBkText, type BkQuery, type BkView } from "./BookingParts";
import BookingsTable from "./BookingsTable";
import BookingDocs from "./BookingDocs";
import BookingDrawer from "./BookingDrawer";
import { CashDialog } from "./BookingDialogs";
import { formatBaht } from "./trips-shared";

const WHENS = ["upcoming", "today", "tomorrow", "next7", "past30", "all"] as const;
const CHIP = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm";
const CHIP_ON = `${CHIP} border-2 border-[color:var(--color-ink)] font-bold text-[color:var(--color-ink)]`;
const CHIP_OFF = `${CHIP} border border-[color:var(--color-line)] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]`;
const CHIP_ALERT = `${CHIP} border-2 border-[color:var(--color-danger)] font-bold text-[color:var(--color-danger)]`;

export default function BookingsScreen({
  unitSlug,
  list,
  detail,
  detailFailed,
  docs,
  cash,
  view,
  day,
  channels,
}: {
  unitSlug: string;
  list: BookingListVM;
  detail: BookingDetailVM | null;
  detailFailed: boolean;
  docs: BookingDocsVM | null;
  cash: CashDayVM | null;
  view: BkView;
  day: string | null;
  channels: readonly string[];
}) {
  const X = useBkText();
  const { t, D, T } = X;
  const router = useRouter();
  const base = `/app/u/${unitSlug}/trips/bookings`;
  const lq = list.query;
  const q: BkQuery = { q: lq.q, product: lq.product, when: lq.when, date: lq.date, channel: lq.channel, chip: lq.chip, dep: lq.dep, b: detail?.row.bookingId ?? null, view: docs ? view : "list", day };
  const [cashOpen, setCashOpen] = useState(day !== null && cash !== null);
  const go = (patch: Partial<BkQuery>) => router.push(bkHref(base, q, { b: null, ...patch }), { scroll: false });
  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const raw = new FormData(e.currentTarget).get("q");
    const text = typeof raw === "string" ? raw.trim() : "";
    go({ q: text === "" ? null : text, chip: "all", view: "list" });
  };
  const closeCash = () => {
    setCashOpen(false);
    if (q.day) router.push(bkHref(base, q, { day: null }), { scroll: false });
  };
  const chips = list.chips;
  const chipCls = (key: string) => (q.chip === key ? CHIP_ON : CHIP_OFF);
  const showDocs = q.view === "docs" && docs !== null;

  return (
    <div data-testid="trips-bk" className="flex min-w-0 flex-col gap-4">
      {/* ── แถบหัว: ส่วนของจอ + จองหน้าร้าน (ยังไม่เปิดใช้) ── */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="w-full text-sm font-medium text-[color:var(--color-muted)]">{t("bookings.title")}</h1>
        <nav aria-label={t("bookings.segment.aria")} className={SEG_WRAP}>
          <Link data-testid="trips-bk-seg-all" href={bkHref(base, q, { view: "list", b: null })} scroll={false} aria-current={showDocs ? undefined : "page"} className={showDocs ? SEG_OFF : SEG_ON}>
            {t("bookings.segment.all")}
          </Link>
          {list.flags.canSeeMoney && list.segments.docsWaiting !== null ? (
            <Link data-testid="trips-bk-seg-docs" href={bkHref(base, q, { view: "docs", b: null })} scroll={false} aria-current={showDocs ? "page" : undefined} className={showDocs ? SEG_ON : SEG_OFF}>
              {t("bookings.segment.docs", { n: list.segments.docsWaiting })}
            </Link>
          ) : null}
        </nav>
        <NotYetButton data-testid="trips-bk-seg-refunds" label={t("bookings.segment.refunds", { n: list.segments.refundsOpen })} hint={t("bookings.notYet.refunds")} />
        <span className="hidden flex-1 md:block" />
        <NotYetButton data-testid="trips-bk-new" label={t("bookings.actions.new")} hint={t("bookings.notYet.newBooking")} />
      </div>

      {/* ── เงินสดหน้าร้าน (เฉพาะผู้รับเงิน) — เก็บแยกจากลิ้นชักเครื่องขาย ── */}
      {cash ? (
        <section data-testid="trips-cash" aria-label={t("bookings.cash.title")} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-5 py-3">
          <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
            <b className="text-sm text-[color:var(--color-ink)]">{t("bookings.cash.title")}</b>
            <span className="text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">{t("bookings.cash.separate")}</span>
          </div>
          <div className="flex min-w-0 flex-col items-start gap-0.5">
            <span className="text-sm text-[color:var(--color-ink-soft)]">{t("bookings.cash.expected", { date: D.short(cash.businessDate) })}</span>
            <b data-testid="trips-cash-expected" className="text-xl tabular-nums text-[color:var(--color-ink)]">
              ฿{formatBaht(cash.expectedSatang)}
            </b>
          </div>
          <button type="button" data-testid="trips-cash-open" className={BTN} onClick={() => setCashOpen(true)}>
            {t("bookings.cash.open")}
          </button>
        </section>
      ) : null}

      {detailFailed ? <ErrorLine text={t("bookings.detail.loadFailed")} /> : null}

      {showDocs && docs ? (
        <BookingDocs vm={docs} base={base} q={q} />
      ) : (
        <>
          {/* ── ค้น + ตัวกรอง (ฟอร์ม GET จริง) ── */}
          <form action={base} method="get" role="search" onSubmit={onSearch} className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              key={q.q ?? ""}
              data-testid="trips-bk-search"
              type="search"
              name="q"
              defaultValue={q.q ?? ""}
              maxLength={100}
              aria-label={t("bookings.search.label")}
              placeholder={t("bookings.search.placeholder")}
              className={`${INPUT} flex-[1_1_280px]`}
            />
            <button type="submit" className={BTN}>
              {t("bookings.search.submit")}
            </button>
            <select
              data-testid="trips-bk-filter-product"
              name="p"
              aria-label={t("bookings.filter.product")}
              value={q.product ?? ""}
              onChange={(e) => go({ product: e.target.value === "" ? null : e.target.value, chip: "all" })}
              className={`${INPUT} max-w-full flex-[1_1_180px]`}
            >
              <option value="">{t("bookings.filter.allProducts")}</option>
              {list.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {T(p.titleTh, p.titleEn)}
                </option>
              ))}
            </select>
            <select
              data-testid="trips-bk-filter-when"
              name="when"
              aria-label={t("bookings.filter.when")}
              value={q.date ? "" : q.when}
              onChange={(e) => (e.target.value === "" ? undefined : go({ when: e.target.value, date: null, chip: "all" }))}
              className={`${INPUT} max-w-full flex-[1_1_160px]`}
            >
              {q.date ? <option value="">{t("bookings.filter.onDate", { date: D.short(q.date) })}</option> : null}
              {WHENS.map((w) => (
                <option key={w} value={w}>
                  {t(`bookings.when.${w}`)}
                </option>
              ))}
            </select>
            {q.date ? <input type="hidden" name="date" value={q.date} /> : null}
            <select
              data-testid="trips-bk-filter-channel"
              name="ch"
              aria-label={t("bookings.filter.channel")}
              value={q.channel}
              onChange={(e) => go({ channel: e.target.value, chip: "all" })}
              className={`${INPUT} max-w-full flex-[1_1_160px]`}
            >
              <option value="all">{t("bookings.filter.allChannels")}</option>
              <option value="direct">{t("bookings.filter.direct")}</option>
              <option value="agent">{t("bookings.filter.agent")}</option>
              {channels.map((c) => (
                <option key={c} value={c}>
                  {t(`departures.channel.${c}`)}
                </option>
              ))}
            </select>
            {q.dep ? <input type="hidden" name="dep" value={q.dep} /> : null}
          </form>

          {q.q || q.dep ? (
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[color:var(--color-ink-soft)]">
              {q.q ? (
                <>
                  <span>{t("bookings.search.allDates")}</span>
                  <Link href={bkHref(base, q, { q: null, b: null, chip: "all" })} scroll={false} className="inline-flex min-h-11 items-center font-medium text-[color:var(--color-ink)] underline underline-offset-2">
                    {t("bookings.search.clear")}
                  </Link>
                </>
              ) : null}
              {q.dep ? (
                <>
                  <span>{t("bookings.filter.departure")}</span>
                  <Link href={bkHref(base, q, { dep: null, b: null, chip: "all" })} scroll={false} className="inline-flex min-h-11 items-center font-medium text-[color:var(--color-ink)] underline underline-offset-2">
                    {t("bookings.filter.clearDeparture")}
                  </Link>
                </>
              ) : null}
            </div>
          ) : null}
          {list.search.nameCapped ? (
            <p data-testid="trips-bk-name-capped" role="status" className="text-sm font-medium text-[color:var(--color-ink)]">
              {t("bookings.search.nameCapped")}
            </p>
          ) : null}

          {/* ── ชิป (จำนวนนับจากทั้งชุดที่กรอง ไม่ใช่แถวที่แสดง) ── */}
          <nav aria-label={t("bookings.chip.aria")} className="flex min-w-0 flex-wrap items-center gap-2">
            <Link data-testid="trips-bk-chip-all" href={bkHref(base, q, { chip: "all", b: null })} scroll={false} aria-current={q.chip === "all" ? "true" : undefined} className={chipCls("all")}>
              {t("bookings.chip.all", { n: chips.all })}
            </Link>
            {chips.day ? (
              <Link data-testid="trips-bk-chip-day" href={bkHref(base, q, { chip: "day", b: null })} scroll={false} aria-current={q.chip === "day" ? "true" : undefined} className={chipCls("day")}>
                {t("bookings.chip.day", { date: D.short(chips.day.date), n: chips.day.n })}
              </Link>
            ) : (
              <span data-testid="trips-bk-chip-day" aria-disabled="true" className={`${CHIP} border border-dashed border-[color:var(--color-line)] text-[color:var(--color-muted)]`}>
                {t("bookings.chip.noDay")}
              </span>
            )}
            <Link data-testid="trips-bk-chip-hold" href={bkHref(base, q, { chip: "hold", b: null })} scroll={false} aria-current={q.chip === "hold" ? "true" : undefined} className={`${chipCls("hold")} ${q.chip === "hold" ? "" : "border-dashed"}`}>
              {t("bookings.chip.hold", { n: chips.hold })}
            </Link>
            <Link data-testid="trips-bk-chip-attention" href={bkHref(base, q, { chip: "attention", b: null })} scroll={false} aria-current={q.chip === "attention" ? "true" : undefined} className={`${CHIP_ALERT} ${q.chip === "attention" ? "outline outline-2 outline-offset-2 outline-[color:var(--color-ink)]" : ""}`}>
              <span aria-hidden="true">⚠</span>
              {t("bookings.chip.attention", { n: chips.attention })}
            </Link>
          </nav>

          <BookingsTable vm={list} base={base} q={q} channels={channels} />
        </>
      )}

      {detail ? <BookingDrawer key={detail.row.bookingId} unitSlug={unitSlug} vm={detail} base={base} q={q} channels={channels} /> : null}
      {cashOpen && cash ? <CashDialog cash={cash} base={base} q={q} onClose={closeCash} /> : null}
    </div>
  );
}
