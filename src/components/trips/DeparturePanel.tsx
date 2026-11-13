"use client";
// TRIPS T1.2 ▸ แผงรอบ (ภาพ 11 :47–:58) + การ์ด "ต้องตัดสินใจ" (:60–:63)
//   จอ ≥ md: การ์ดข้างตาราง · มือถือ: แผ่นเต็มจอ (Escape / ปุ่มปิด ⇒ กลับปฏิทิน)
//   🔴 ปุ่มไหนแสดง = actions.* จากตัวโหลด (ไม่ตัดสินที่นี่) · ปุ่มเป็นตาราง 2 คอลัมน์ ไม่กองแนวตั้ง · ใบรายชื่อ/จองให้ลูกค้า = ปุ่มปิด "ยังไม่เปิดใช้"
//   🔴 ยอดจองแยกช่องทาง/ผู้ใหญ่-เด็ก/เงิน = ยังไม่มีข้อมูล (T1.3/T1.7) — แสดงข้อความ ไม่แต่งตัวเลข
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { DepartureCalendarVM, DeparturePanelVM, DepartureSchedulesVM } from "@/lib/modules/trips";
import { setDepartureStatusAction } from "@/lib/modules/trips/departure-actions";
import { BTN, BTN_PRIMARY, ErrorLine, useRunner } from "./ProductsScreenParts";
import { BTN_DANGER, CANCEL_STRIPES, UsedBar, calHref, useDepDates, useReasonText, useTitle, type CalQuery } from "./DepartureParts";
import { CancelDialog, CapacityDialog, DecideDialog, PriceDialog, ResourceDialog, StopSellDialog, UnguaranteeDialog } from "./DepartureDialogs";

type Open = "decide" | "cancel" | "capacity" | "resources" | "price" | "stopsell" | "unguarantee" | null;
/**
 * ป้ายสถานะ — รูปทรงตรงกับช่องและคำอธิบายสัญลักษณ์ 1:1: เส้นประแดง = ต่ำกว่าขั้นต่ำ · กรอบหนา = เต็ม · ลายขีด = ยกเลิก · พื้นเทา = ผ่านแล้ว
 * สถานะอื่น (เปิดขาย · เหลือน้อย · ยืนยันออก · ปิดรับ) = กรอบบางปกติ แยกด้วยคำ (ไม่ใช้รูปทรงของคำอธิบายสัญลักษณ์)
 */
const PILL = {
  plain: "border border-[color:var(--color-ink)] text-[color:var(--color-ink)]",
  thick: "border-[3px] border-[color:var(--color-ink)] font-bold text-[color:var(--color-ink)]",
  dashed: "border-2 border-dashed border-[color:var(--color-danger)] font-bold text-[color:var(--color-danger)]",
  stripes: "border border-[color:var(--color-line)] text-[color:var(--color-danger)]",
  muted: "border border-transparent bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)]",
} as const;
const CARD = "flex min-w-0 flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";

export function DeparturePanel({ unitSlug, vm, base, q, resources, openDecide }: { unitSlug: string; vm: DeparturePanelVM; base: string; q: CalQuery; resources: DepartureSchedulesVM["resources"] | null; openDecide: boolean }) {
  const t = useTranslations("trips");
  const D = useDepDates();
  const router = useRouter();
  const { busy, error, run } = useRunner(t("common.failed"));
  const [open, setOpen] = useState<Open>(openDecide && (vm.actions.run || vm.actions.merge) ? "decide" : null);
  const d = vm.departure;
  const closeHref = calHref(base, q, { dep: null, decide: false });
  const unit = t(`departures.unit.${d.productType === "LIVEABOARD" ? "BERTH" : "SEAT"}`);
  const a = vm.actions;
  const T = useTitle();
  const reasonText = useReasonText(vm.reasonTitles);
  const title = T(d.productTitle, d.productTitleEn);

  // กดรายการ "ต้องตัดสินใจ" ของรอบที่เปิดแผงอยู่แล้ว (URL ไม่เปลี่ยน) ⇒ เปิดกล่องตัดสิน
  useEffect(() => {
    const onDecide = (e: Event) => {
      if (e instanceof CustomEvent && e.detail === d.departureId && (vm.actions.run || vm.actions.merge)) setOpen("decide");
    };
    window.addEventListener("trips:open-decide", onDecide);
    return () => window.removeEventListener("trips:open-decide", onDecide);
  }, [d.departureId, vm.actions.run, vm.actions.merge]);

  // มือถือ (< md): แผงเป็นแผ่นเต็มจอ ⇒ ล็อกการเลื่อนหน้าหลัง + ย้ายโฟกัสไปปุ่มปิด · คืนค่าเมื่อปิด
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // กล่องโต้ตอบเปิดอยู่แล้ว (เช่น ?decide=1 เปิดกล่องตัดสินตอนเปิดแผง) ⇒ ไม่ย้ายโฟกัสออกจากกล่อง
    if (!document.querySelector('[role="dialog"]')) sheetRef.current?.querySelector<HTMLElement>('[data-testid="trips-dep-panel-close"]')?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape ปิดแผง (มือถือเป็นแผ่นเต็มจอ) — ไม่ทำเมื่อมีกล่องโต้ตอบเปิดอยู่
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"]')) return;
      router.push(closeHref, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, closeHref]);

  const resLine = [
    d.timeText,
    d.resourceSummary.boats.length ? d.resourceSummary.boats.join(", ") : null,
    d.resourceSummary.guides ? t("departures.panel.guides", { n: d.resourceSummary.guides }) : null,
    d.resourceSummary.vans ? t("departures.panel.vans", { n: d.resourceSummary.vans }) : null,
    d.resourceSummary.others.length ? d.resourceSummary.others.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const pillShape: keyof typeof PILL = d.state === "BELOW_MIN" ? "dashed" : d.state === "FULL" ? "thick" : d.state === "CANCELLED" ? "stripes" : d.state === "PAST" || d.state === "DEPARTED_TODAY" ? "muted" : "plain";
  const disabledSoon = `${BTN} w-full`;

  return (
    <aside
      ref={sheetRef}
      data-testid="trips-dep-panel"
      aria-label={t("departures.panel.aria", { date: D.short(d.localDate), title })}
      className="flex min-w-0 flex-col gap-3 bg-[color:var(--color-surface)] max-md:fixed max-md:inset-0 max-md:z-40 max-md:overflow-y-auto max-md:p-4 md:rounded-2xl md:border md:border-[color:var(--color-line)] md:p-4"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h2 className="min-w-0 text-base font-bold leading-snug text-[color:var(--color-ink)] [overflow-wrap:anywhere]">
          {D.short(d.localDate)} · {title}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <span data-testid="trips-dep-status" data-status={d.state} data-shape={pillShape} className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-sm ${PILL[pillShape]}`} style={pillShape === "stripes" ? CANCEL_STRIPES : undefined}>
            {t(`departures.state.${d.state}`)}
          </span>
          <Link data-testid="trips-dep-panel-close" href={closeHref} scroll={false} aria-label={t("common.close")} className={`${BTN} px-2.5`}>
            ✕
          </Link>
        </div>
      </div>
      <p className="text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
        {resLine}
        {d.optionName ? ` · ${d.optionName}` : ""}
      </p>
      {d.state === "CANCELLED" ? (
        <p className="rounded-lg border border-dashed border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)] [overflow-wrap:anywhere]">
          {t("departures.panel.cancelledReason", { text: reasonText(d.cancelReason) ?? "—" })}
        </p>
      ) : null}

      <div data-testid="trips-dep-counts" className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <b className="text-3xl leading-none text-[color:var(--color-ink)]">{vm.counts.used}</b>
          <span className="text-sm text-[color:var(--color-ink-soft)]">{t("departures.panel.of", { cap: vm.counts.capacity, unit, left: vm.counts.seatsLeft })}</span>
        </div>
        <UsedBar used={vm.counts.used} capacity={vm.counts.capacity} tall />
        <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
          <span className="text-[color:var(--color-ink-soft)]">{t("departures.panel.holdWait")}</span>
          <b className="text-[color:var(--color-ink)]">
            {vm.counts.held} / {vm.counts.waitlistWaiting + vm.counts.waitlistOffered}
          </b>
        </div>
        {vm.counts.reserved > 0 ? (
          <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
            <span className="text-[color:var(--color-ink-soft)]">{t("departures.panel.reserved")}</span>
            <b className="text-[color:var(--color-ink)]">{vm.counts.reserved}</b>
          </div>
        ) : null}
        {d.minPax !== null ? (
          <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
            <span className="text-[color:var(--color-ink-soft)]">{t("departures.panel.minPax")}</span>
            <b className={d.state === "BELOW_MIN" ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-ink)]"}>
              {d.state === "BELOW_MIN" ? t("departures.cell.shortBy", { n: d.shortBy ?? 0 }) : String(d.minPax)}
            </b>
          </div>
        ) : null}
      </div>

      {d.cutoffGroups.length && d.state !== "CANCELLED" && d.state !== "PAST" ? (
        <div className="flex min-w-0 flex-col gap-1 border-t border-[color:var(--color-line)] pt-2 text-sm">
          <span className="font-medium text-[color:var(--color-ink)]">{t("departures.panel.cutoff")}</span>
          {d.cutoffGroups.map((g) => (
            <p key={g.atIso} className="text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
              <b className="text-[color:var(--color-ink)]">
                {D.short(g.local.ymd)} {g.local.hm}
              </b>{" "}
              · {g.channels.map((c) => t(`departures.channel.${c}`)).join(", ")}
            </p>
          ))}
        </div>
      ) : null}
      {d.stopSellInfo ? (
        <p className="rounded-lg border border-dashed border-[color:var(--color-line)] px-3 py-2 text-sm text-[color:var(--color-ink)] [overflow-wrap:anywhere]">
          {t("departures.panel.stopSell", { channels: d.stopSellInfo.channels.map((c) => t(`departures.channel.${c}`)).join(", ") || t("departures.panel.allChannels"), reason: d.stopSellInfo.reason })}
          {d.stopSellInfo.untilLocal ? ` · ${t("departures.panel.until", { date: `${D.short(d.stopSellInfo.untilLocal.ymd)} ${d.stopSellInfo.untilLocal.hm}` })}` : ""}
        </p>
      ) : null}
      {vm.warnings.map((w) => (
        <p key={w.code} role="note" className="rounded-lg border border-dashed border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)] [overflow-wrap:anywhere]">
          {t("departures.panel.overSeats", { cap: d.capacity, name: w.resourceName, seats: w.seats })}
        </p>
      ))}

      <p data-testid="trips-dep-bookings-note" className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-muted)]">
        {t("departures.notYet.bookings")}
      </p>
      <p data-testid="trips-dep-money-note" className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-muted)]">
        {t("departures.notYet.money")}
      </p>

      <div data-testid="trips-dep-actions" className="grid grid-cols-2 gap-2.5">
        <button type="button" data-testid="trips-dep-manifest" className={disabledSoon} disabled title={t("departures.actions.notYet")}>
          <span className="flex flex-col leading-tight">
            {t("departures.actions.manifest")}
            <span className="text-sm text-[color:var(--color-muted)]">{t("departures.actions.notYet")}</span>
          </span>
        </button>
        <button type="button" data-testid="trips-dep-book" className={disabledSoon} disabled title={t("departures.actions.notYet")}>
          <span className="flex flex-col leading-tight">
            {t("departures.actions.book")}
            <span className="text-sm text-[color:var(--color-muted)]">{t("departures.actions.notYet")}</span>
          </span>
        </button>
        {a.run || a.merge ? (
          <button type="button" data-testid="trips-dep-decide" className={`${BTN_PRIMARY} w-full`} onClick={() => setOpen("decide")}>
            {t("departures.actions.decide")}
          </button>
        ) : null}
        {a.close || a.stopSell ? (
          <button type="button" data-testid="trips-dep-close" className={`${BTN} w-full`} onClick={() => setOpen("stopsell")}>
            {a.close ? t("departures.actions.close") : t("departures.actions.stopSell")}
          </button>
        ) : null}
        {a.reopen ? (
          <button type="button" data-testid="trips-dep-reopen" className={`${BTN} w-full`} disabled={busy} onClick={() => void run(() => setDepartureStatusAction(unitSlug, { departureId: d.departureId, status: "OPEN" }))}>
            {t("departures.actions.reopen")}
          </button>
        ) : null}
        {a.guarantee ? (
          <button type="button" data-testid="trips-dep-guarantee" className={`${BTN} w-full`} disabled={busy} onClick={() => void run(() => setDepartureStatusAction(unitSlug, { departureId: d.departureId, status: "GUARANTEED" }))}>
            {t("departures.actions.guarantee")}
          </button>
        ) : null}
        {a.unguarantee ? (
          <button type="button" data-testid="trips-dep-unguarantee" className={`${BTN} w-full`} onClick={() => setOpen("unguarantee")}>
            {t("departures.actions.unguarantee")}
          </button>
        ) : null}
        {a.capacity ? (
          <button type="button" data-testid="trips-dep-capacity" className={`${BTN} w-full`} onClick={() => setOpen("capacity")}>
            {t("departures.actions.capacity")}
          </button>
        ) : null}
        {a.resources && resources ? (
          <button type="button" data-testid="trips-dep-resources" className={`${BTN} w-full`} onClick={() => setOpen("resources")}>
            {t("departures.actions.resources")}
          </button>
        ) : null}
        {a.price && vm.price ? (
          <button type="button" data-testid="trips-dep-price" className={`${BTN} w-full`} onClick={() => setOpen("price")}>
            {t("departures.actions.price")}
          </button>
        ) : null}
        {a.cancel ? (
          <button type="button" data-testid="trips-dep-cancel" className={`${BTN_DANGER} w-full`} onClick={() => setOpen("cancel")}>
            {t("departures.actions.cancel")}
          </button>
        ) : null}
      </div>
      <ErrorLine text={error} />

      {open === "decide" ? <DecideDialog unitSlug={unitSlug} vm={vm} onClose={() => setOpen(null)} /> : null}
      {open === "cancel" ? <CancelDialog unitSlug={unitSlug} vm={vm} onClose={() => setOpen(null)} /> : null}
      {open === "capacity" ? <CapacityDialog unitSlug={unitSlug} vm={vm} onClose={() => setOpen(null)} /> : null}
      {open === "resources" && resources ? <ResourceDialog unitSlug={unitSlug} vm={vm} resources={resources} onClose={() => setOpen(null)} /> : null}
      {open === "price" ? <PriceDialog unitSlug={unitSlug} vm={vm} onClose={() => setOpen(null)} /> : null}
      {open === "stopsell" ? <StopSellDialog unitSlug={unitSlug} vm={vm} onClose={() => setOpen(null)} /> : null}
      {open === "unguarantee" ? <UnguaranteeDialog unitSlug={unitSlug} vm={vm} onClose={() => setOpen(null)} /> : null}
    </aside>
  );
}

/** การ์ด "ต้องตัดสินใจ" — รายการต่ำกว่าขั้นต่ำในช่วงที่ดู · กดรายการ ⇒ เปิดแผงรอบนั้น + กล่องตัดสิน */
export function DecisionsCard({ vm, base, q }: { vm: DepartureCalendarVM; base: string; q: CalQuery }) {
  const t = useTranslations("trips");
  const D = useDepDates();
  const T = useTitle();
  const titleOf = new Map(vm.products.map((p) => [p.id, T(p.titleTh, p.titleEn)]));
  // ชิปนับทั้งช่วง (counts.belowMin) ⇒ การ์ดแสดงเมื่อชิป > 0 เสมอ (ชิปไม่ชี้ไปที่ว่าง) · ถูกตัดที่เพดาน ⇒ บอกว่าแสดงกี่รายการถึงวันไหน
  const total = Math.max(vm.counts.belowMin, vm.decisions.length);
  if (total === 0) return null;
  const partial = vm.decisions.length < total;
  return (
    <section id="trips-decisions" data-testid="trips-decisions" className={CARD}>
      <h2 className="text-base font-bold text-[color:var(--color-ink)]">{t("departures.decisions.title", { n: total })}</h2>
      {partial ? (
        <p role="status" className="rounded-lg border border-dashed border-[color:var(--color-line)] px-3 py-2 text-sm text-[color:var(--color-ink-soft)]">
          {t("departures.decisions.partial", { shown: vm.decisions.length, total, date: vm.shownUntil ? D.full(vm.shownUntil) : "" })}
        </p>
      ) : null}
      <ul className="flex min-w-0 flex-col">
        {vm.decisions.map((x, i) => (
          <li key={x.departureId} className={i ? "border-t border-[color:var(--color-line)]" : ""}>
            <Link
              data-testid={`trips-decision-${x.departureId}`}
              href={calHref(base, q, { dep: x.departureId, decide: true })}
              scroll={false}
              onClick={() => {
                if (q.dep === x.departureId) window.dispatchEvent(new CustomEvent("trips:open-decide", { detail: x.departureId }));
              }}
              className="flex min-h-11 min-w-0 gap-2 py-2 text-sm hover:bg-[color:var(--color-surface-2)]"
            >
              <span aria-hidden="true" className={`mt-1 inline-block h-3 w-3 shrink-0 rounded-sm border-2 ${x.overdue ? "border-dashed" : ""} border-[color:var(--color-danger)]`} />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <b className="text-[color:var(--color-ink)]">{t("departures.decisions.item", { date: D.short(x.localDate), title: titleOf.get(x.productId) ?? x.titleTh, n: x.used })}</b>
                <span className={`block ${x.overdue ? "font-bold text-[color:var(--color-danger)]" : "text-[color:var(--color-muted)]"}`}>
                  {x.overdue ? t("departures.decisions.overdue") : x.decisionLocal ? t("departures.decisions.by", { when: `${D.short(x.decisionLocal.ymd)} ${x.decisionLocal.hm}` }) : t("departures.decisions.noTime")}
                  {" · "}
                  {x.hasPeople
                    ? t("departures.decisions.hasPeople", { run: t("departures.decide.run") })
                    : t("departures.decisions.propose", {
                        list: [x.firstTargetTitle ? t("departures.decisions.mergeWith", { title: T(x.firstTargetTitle, x.firstTargetTitleEn) }) : null, t("departures.decide.run"), t("departures.decide.cancel")].filter(Boolean).join(" / "),
                      })}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** แผงว่างเมื่อยังไม่เลือกรอบ (จอกว้าง) */
export function PanelHint() {
  const t = useTranslations("trips");
  return <p className={`${CARD} hidden text-sm text-[color:var(--color-muted)] md:flex`}>{t("departures.panel.empty")}</p>;
}
