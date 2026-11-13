"use client";
// TRIPS T1.3 ▸ ลิ้นชักรายละเอียดการจอง (ทับด้านขวา กว้าง min(100vw, 600px) — ไม่ใช่คอลัมน์ที่สองที่บีบตาราง): หัวตรึง · เนื้อหาเลื่อน · แถบปุ่มตรึงล่าง 2 คอลัมน์
//   ลูกค้า → ทริป → รายการ → เงิน → งวด → การรับเงิน → เอกสารเงินรอออก → ผู้เดินทาง → คำขอคืนเงิน → ปุ่ม
//   🔴 แสดงผลเท่านั้น — ปุ่มไหนแสดง = actions.* จากตัวโหลด · ตัวเลขทุกตัวจาก VM (สรุปเงินของบริการ) · ไม่มีเลขเอกสาร (ร้านออกเองในระบบบัญชี)
//   Escape ปิดลิ้นชักเฉพาะเมื่อไม่มีกล่องโต้ตอบอื่นเปิดทับ · เปิดแล้วโฟกัสปุ่มปิด · ปิดแล้วคืนโฟกัส · ปิด = ลบ b ออกจาก URL
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BookingDetailVM } from "@/lib/modules/trips";
import { BTN, BTN_PRIMARY, Pill } from "./ProductsScreenParts";
import { BTN_DANGER } from "./DepartureParts";
import { BookingBadge, KV, NotYetButton, bkHref, useBkText, type BkQuery, type PayTender } from "./BookingParts";
import { ApproveDialog, CancelBookingDialog, PayDialog } from "./BookingDialogs";
import { formatBaht } from "./trips-shared";

type Open = { kind: "pay"; tender: PayTender } | { kind: "cancel" } | { kind: "decide"; decision: "APPROVE" | "REJECT" } | null;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const SECTION = "flex min-w-0 flex-col gap-2 border-b border-[color:var(--color-line)] px-5 py-4 last:border-b-0";
const H3 = "text-sm font-bold text-[color:var(--color-ink)]";
const ROW = "flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm";

function Section({ "data-testid": testid, title, children }: { "data-testid"?: string; title: string; children: ReactNode }) {
  return (
    <section data-testid={testid} className={SECTION}>
      <h3 className={H3}>{title}</h3>
      {children}
    </section>
  );
}

export default function BookingDrawer({ unitSlug, vm, base, q, channels }: { unitSlug: string; vm: BookingDetailVM; base: string; q: BkQuery; channels: readonly string[] }) {
  const X = useBkText();
  const { t, D, T } = X;
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const boxRef = useRef<HTMLElement>(null);
  const row = vm.row;
  const a = vm.actions;
  const closeHref = bkHref(base, q, { b: null });
  const today = vm.unit.today;

  // เปิด: ล็อกการเลื่อนหน้าหลัง + โฟกัสปุ่มปิด · ปิด: คืนค่า + คืนโฟกัสให้สิ่งที่เปิด
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    boxRef.current?.querySelector<HTMLElement>('[data-testid="trips-bk-detail-close"]')?.focus();
    return () => {
      document.body.style.overflow = prev;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);
  // Escape ปิดลิ้นชัก (ไม่ทำเมื่อมีกล่องโต้ตอบอื่นเปิดทับ — กล่องนั้นจัดการเอง) · Tab วนอยู่ในลิ้นชัก
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      if (e.key === "Escape") {
        e.preventDefault();
        router.push(closeHref, { scroll: false });
        return;
      }
      if (e.key !== "Tab") return;
      const list = boxRef.current ? Array.from(boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, closeHref]);

  const cancelled = X.departureCancelled(row);
  const doc = vm.document;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <Link href={closeHref} scroll={false} tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/40" />
      <aside ref={boxRef} data-testid="trips-bk-detail" role="dialog" aria-modal="true" aria-label={t("bookings.detail.aria", { code: row.code })} className="relative flex h-full w-[min(100vw,600px)] min-w-0 flex-col bg-[color:var(--color-surface)] shadow-xl">
        {/* ── หัวตรึง ── */}
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--color-line)] px-5 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-lg font-bold leading-snug text-[color:var(--color-ink)] [overflow-wrap:anywhere]">{row.code}</h2>
            <span className="text-sm text-[color:var(--color-muted)]">{t("bookings.row.booked", { date: D.short(row.createdLocal) })}</span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <BookingBadge row={row} today={today} data-testid="trips-bk-status" />
            <Link data-testid="trips-bk-detail-close" href={closeHref} scroll={false} aria-label={t("bookings.detail.close")} className={`${BTN} px-3`}>
              ✕
            </Link>
          </div>
        </header>

        {/* ── เนื้อหาเลื่อน ── */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Section data-testid="trips-bk-customer" title={t("bookings.detail.customer")}>
            {vm.customer.purged ? (
              <p className="text-sm text-[color:var(--color-ink-soft)]">{t("bookings.detail.purged")}</p>
            ) : (
              <div className={ROW}>
                <span className="min-w-0 text-base text-[color:var(--color-ink)] [overflow-wrap:anywhere]">{vm.customer.name ?? t("bookings.row.noBooker")}</span>
                <span className="shrink-0 tabular-nums text-[color:var(--color-ink-soft)]">{vm.customer.phoneMasked ?? t("bookings.detail.noPhone")}</span>
              </div>
            )}
          </Section>

          <Section title={t("bookings.detail.trip")}>
            <p className="text-base text-[color:var(--color-ink)] [overflow-wrap:anywhere]">{T(row.productTitleTh, row.productTitleEn)}</p>
            <p className="text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
              {D.short(row.travelDate)}
              {row.timeText ? ` · ${row.timeText}` : ""} · {X.channel(row, channels)}
            </p>
            {cancelled ? <p className="text-sm font-medium text-[color:var(--color-danger)] [overflow-wrap:anywhere]">{cancelled}</p> : null}
          </Section>

          <Section data-testid="trips-bk-items" title={t("bookings.detail.items")}>
            <ul className="flex min-w-0 flex-col gap-1.5">
              {vm.lines.map((l) => (
                <li key={l.itemRef} className={ROW}>
                  <span className="min-w-0 text-[color:var(--color-ink)] [overflow-wrap:anywhere]">
                    {T(l.labelTh, l.labelEn)} <span className="text-[color:var(--color-muted)]">{t("bookings.detail.qty", { qty: l.qty })}</span>
                    {l.passThrough ? <span className="text-[color:var(--color-muted)]"> · {t("bookings.detail.passThrough")}</span> : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-[color:var(--color-ink)]">{formatBaht(l.amountSatang)}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section data-testid="trips-bk-money" title={t("bookings.detail.money")}>
            <KV label={t("bookings.detail.total")} value={formatBaht(vm.payableSatang)} strong />
            <KV label={t("bookings.detail.paid")} value={formatBaht(vm.paidSatang)} />
            <KV label={t("bookings.detail.outstanding")} value={formatBaht(vm.outstandingSatang)} strong />
            {vm.refundedSatang > 0 ? <KV label={t("bookings.detail.refunded")} value={formatBaht(vm.refundedSatang)} /> : null}
            <p className="text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
              {t("bookings.detail.inThisTotal", { preVat: formatBaht(doc.preVatSatang), vat: formatBaht(doc.vatSatang), passThrough: formatBaht(doc.passThroughSatang) })}
            </p>
          </Section>

          <Section data-testid="trips-bk-dues" title={t("bookings.detail.dues")}>
            {vm.dues.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink-soft)]">{t("bookings.detail.noDues")}</p>
            ) : (
              <ul className="flex min-w-0 flex-col gap-2">
                {vm.dues.map((d) => (
                  <li key={d.seq} data-testid={`trips-bk-due-${d.seq}`} className="flex min-w-0 flex-col gap-0.5">
                    <div className={ROW}>
                      <span className="min-w-0 text-[color:var(--color-ink)] [overflow-wrap:anywhere]">{t("bookings.detail.dueLine", { seq: d.seq, kind: X.dueKind(d.kind) })}</span>
                      <span className="shrink-0 tabular-nums text-[color:var(--color-ink)]">{formatBaht(d.amountSatang)}</span>
                    </div>
                    <div className={ROW}>
                      <span className="min-w-0 text-[color:var(--color-muted)] [overflow-wrap:anywhere]">
                        {t("bookings.detail.dueOn", { date: D.short(d.dueLocal) })}
                        {d.paidSatang > 0 ? ` · ${t("bookings.detail.duePaid", { paid: formatBaht(d.paidSatang), amount: formatBaht(d.amountSatang) })}` : ""}
                      </span>
                      <Pill shape={d.status === "PAID" ? "solid" : d.status === "OVERDUE" ? "thick" : d.status === "CANCELLED" || d.status === "WAIVED" ? "muted" : "dashed"}>{X.dueStatus(d.status)}</Pill>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section data-testid="trips-bk-payments" title={t("bookings.detail.payments")}>
            {vm.events.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink-soft)]">{t("bookings.detail.noPayments")}</p>
            ) : (
              <ul className="flex min-w-0 flex-col gap-2">
                {vm.events.map((e) => (
                  <li key={e.id} data-testid={`trips-bk-event-${e.id}`} className="flex min-w-0 flex-col gap-0.5">
                    <div className={ROW}>
                      <span className="min-w-0 text-[color:var(--color-ink)] [overflow-wrap:anywhere]">
                        {X.eventKind(e.kind)} · {X.tender(e.tender)}
                      </span>
                      <span className="shrink-0 tabular-nums text-[color:var(--color-ink)]">{formatBaht(e.amountSatang)}</span>
                    </div>
                    <div className={ROW}>
                      <span className="min-w-0 text-[color:var(--color-muted)] [overflow-wrap:anywhere]">
                        {X.stamp(e.atLocal)}
                        {e.reference ? ` · ${t("bookings.detail.reference", { ref: e.reference })}` : ""}
                      </span>
                      <Pill shape={e.postingStatus === "POSTED" ? "solid" : e.postingStatus === "UNPOSTED" ? "dashed" : "thick"}>{X.posting(e.postingStatus)}</Pill>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section data-testid="trips-bk-docs" title={t("bookings.detail.docs")}>
            {vm.docs.waiting.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink-soft)]">{t("bookings.docs.empty")}</p>
            ) : (
              <>
                <ul className="flex min-w-0 flex-col gap-2">
                  {vm.docs.waiting.map((w) => (
                    <li key={w.eventId} className="flex min-w-0 flex-col gap-0.5 text-sm">
                      <div className={ROW}>
                        <span className="min-w-0 text-[color:var(--color-ink)] [overflow-wrap:anywhere]">{X.docKind(w.kind)}</span>
                        <span className="shrink-0 tabular-nums text-[color:var(--color-ink)]">{formatBaht(w.amountSatang)}</span>
                      </div>
                      <span className="text-[color:var(--color-muted)] [overflow-wrap:anywhere]">
                        {X.stamp(w.atLocal)} · {X.tender(w.tender)}
                        {w.reference ? ` · ${t("bookings.detail.reference", { ref: w.reference })}` : ""} · {t("bookings.detail.vat", { vat: formatBaht(w.vatSatang) })} · {t("bookings.detail.passThrough")} {formatBaht(w.passThroughSatang)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="rounded-lg border border-dashed border-[color:var(--color-ink-soft)] px-3 py-2 text-sm text-[color:var(--color-ink)]">{t("bookings.docs.manual")}</p>
                {vm.docs.vatDiffSatang !== 0 ? (
                  <p className="text-sm text-[color:var(--color-ink)] [overflow-wrap:anywhere]">
                    <b className="text-[color:var(--color-danger)]">
                      <span aria-hidden="true">⚠ </span>
                      {t("bookings.docs.accountant")}
                    </b>{" "}
                    — {t("bookings.docs.vatDiff", { diff: formatBaht(vm.docs.vatDiffSatang) })}
                  </p>
                ) : null}
              </>
            )}
          </Section>

          <Section data-testid="trips-bk-travellers" title={t("bookings.detail.travellers")}>
            <p className="text-sm text-[color:var(--color-ink)]">{t("bookings.detail.travellersCount", { named: vm.travellers.names.length, seats: vm.travellers.seats })}</p>
            <p className="text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">{X.paxLine(row)}</p>
            {vm.travellers.names.length > 0 ? (
              <ul className="flex min-w-0 flex-col gap-0.5 text-sm text-[color:var(--color-ink)]">
                {vm.travellers.names.map((name, i) => (
                  <li key={`${i}-${name}`} className="[overflow-wrap:anywhere]">
                    {name}
                  </li>
                ))}
              </ul>
            ) : null}
            <p data-testid="trips-bk-travellers-note" className="text-sm text-[color:var(--color-muted)]">
              {t("bookings.notYet.travellers")}
            </p>
          </Section>

          {vm.refunds.length > 0 ? (
            <Section data-testid="trips-bk-refund-open" title={t("bookings.detail.refunds")}>
              <ul className="flex min-w-0 flex-col gap-1.5">
                {vm.refunds.map((r) => (
                  <li key={r.requestId} className={ROW}>
                    <span className="min-w-0 text-[color:var(--color-ink)] [overflow-wrap:anywhere]">{t("bookings.detail.refundLine", { date: D.short(r.createdLocal), amount: formatBaht(r.amountSatang) })}</span>
                    <Pill shape={r.status === "DONE" ? "solid" : r.status === "REJECTED" || r.status === "WITHDRAWN" ? "muted" : "dashed"}>{X.refundStatus(r.status)}</Pill>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-[color:var(--color-muted)]">{t("bookings.notYet.refunds")}</p>
            </Section>
          ) : null}
        </div>

        {/* ── แถบปุ่มตรึงล่าง (ตาราง 2 คอลัมน์) ── */}
        <footer data-testid="trips-bk-actions" aria-label={t("bookings.actions.aria")} className="grid shrink-0 grid-cols-2 gap-2.5 border-t border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-5 py-3">
          {a.pay ? (
            <button type="button" data-testid="trips-bk-pay" className={`${BTN_PRIMARY} w-full`} onClick={() => setOpen({ kind: "pay", tender: "CASH" })}>
              {t("bookings.actions.pay")}
            </button>
          ) : null}
          {a.qr ? (
            <button type="button" data-testid="trips-bk-qr" className={`${BTN} w-full`} onClick={() => setOpen({ kind: "pay", tender: "PROMPTPAY" })}>
              {t("bookings.actions.qr")}
            </button>
          ) : null}
          {a.approve ? (
            <button type="button" data-testid="trips-bk-approve" className={`${BTN_PRIMARY} w-full`} onClick={() => setOpen({ kind: "decide", decision: "APPROVE" })}>
              {t("bookings.actions.approve")}
            </button>
          ) : null}
          {a.reject ? (
            <button type="button" data-testid="trips-bk-reject" className={`${BTN_DANGER} w-full`} onClick={() => setOpen({ kind: "decide", decision: "REJECT" })}>
              {t("bookings.actions.reject")}
            </button>
          ) : null}
          {a.cancel ? (
            <button type="button" data-testid="trips-bk-cancel" className={`${BTN_DANGER} w-full`} onClick={() => setOpen({ kind: "cancel" })}>
              {t("bookings.actions.cancel")}
            </button>
          ) : null}
          <NotYetButton data-testid="trips-bk-change" label={t("bookings.actions.change")} hint={t("bookings.notYet.change")} className="w-full" />
          <NotYetButton data-testid="trips-bk-refund" label={t("bookings.actions.refund")} hint={t("bookings.notYet.refund")} className="w-full" />
        </footer>
      </aside>

      {open?.kind === "pay" ? <PayDialog unitSlug={unitSlug} vm={vm} initialTender={open.tender} onClose={() => setOpen(null)} /> : null}
      {open?.kind === "cancel" ? <CancelBookingDialog unitSlug={unitSlug} vm={vm} onClose={() => setOpen(null)} /> : null}
      {open?.kind === "decide" ? <ApproveDialog unitSlug={unitSlug} vm={vm} decision={open.decision} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
