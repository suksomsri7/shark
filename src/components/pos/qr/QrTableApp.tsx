"use client";

// QrTableApp.tsx — หน้าโต๊ะของแขก /q/t/<qrToken> (POS P2.7U · มติ 6 11 15) — เกาะ client ของหน้า server
//   เมนู (ราคา QR_TABLE · 86 = หมด) · ตะกร้า (quote ของเซิร์ฟเวอร์ + ค่าบริการ POS) · ส่งเข้าครัว (placeTableRound · session ที่หน้าเห็น + guestToken ต่อเครื่อง) ·
//   รายการที่สั่งแล้ว + สถานะครัวต่อรายการ · เรียกพนักงาน / ขอเช็คบิล (มี session เท่านั้น) · บิลของโต๊ะ = บิลของหน้าขาย + พร้อมเพย์ยอดนั้น + แจ้งชำระ ·
//   แยกบิลเปิดอยู่ = ซ่อนการจ่าย · ประตูปิด = แบนเนอร์ตามเหตุ + เมนูอ่านอย่างเดียว
//   โพล tablePoll ทุก 8 วิ ด้วย sinceVer (0 เขียน) · แท็บซ่อน = หยุด · เปลี่ยน = ภาพใหม่ + อ่านบิลใหม่
//   จอ < 1024 = แท็บ เมนู/สั่งแล้ว/บิล + แถบตะกร้าลอย · ≥ 1024 = เมนูซ้าย + คอลัมน์ขวา (ตะกร้า · สั่งแล้ว · บิล)
//   🔴 ไม่มีข้อความไทยนอก t() (ST7) · import ค่าได้แค่ *-shared (actions มาทาง props) · ไม่มีการคิดเงิน · ไม่แสดงข้อมูลสมาชิก/พนักงาน/โต๊ะอื่น

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  QR_MAX_QTY,
  QR_TABLE_POLL_MS,
  type QrOkResult,
  type QrPlaceRoundResult,
  type QrQuoteResult,
  type QrTableBill,
  type QrTableBillResult,
  type QrTablePollResult,
  type QrTableRoundInput,
  type QrTableView,
} from "@/lib/modules/pos/qr-order-shared";
import type { QrRefusal } from "@/lib/modules/pos/qr-order-shared"; // POS P5.2 ▸ fix3 A2 ◂
import { QrMenuBoard, type QrPick } from "./QrMenu";
import { QrCartBar, QrCartBody, QrBottomPanel } from "./QrCart";
import { QrCodeImage } from "./QrCodeImage";
import { useNow, useQrQuote, useToast, useVisiblePoll } from "./use-qr";
import { bkkHm, cartAdd, cartCount, cartLines, cartSetQty, guestTokenOfDevice, qrBaht, type QrCartItem, type QrLocale } from "./qr-ui";

export type QrTableActions = {
  poll: (qrToken: string, sinceVer?: string) => Promise<QrTablePollResult>;
  quote: (qrToken: string, lines: unknown) => Promise<QrQuoteResult>;
  place: (qrToken: string, input: QrTableRoundInput) => Promise<QrPlaceRoundResult>;
  request: (qrToken: string, kind: "CALL_STAFF" | "REQUEST_BILL") => Promise<QrOkResult>;
  notifyPaid: (qrToken: string) => Promise<QrOkResult>;
  bill: (qrToken: string) => Promise<QrTableBillResult>;
};
type Tab = "menu" | "rounds" | "bill";
const STATUS_TONE: Record<string, string> = {
  NEW: "border-[color:var(--color-line)] text-[color:var(--color-ink-soft)]",
  COOKING: "border-[color:var(--color-accent)] text-[color:var(--color-accent)]",
  READY: "border-[color:var(--color-ink)] font-bold text-[color:var(--color-ink)]",
  SERVED: "border-transparent text-[color:var(--color-muted)]",
  CANCELLED: "border-transparent text-[color:var(--color-danger)] line-through",
};

export function QrTableApp(p: { token: string; locale: QrLocale; initial: QrTableView; initialBill: QrTableBill | null; notice: string | null; actions: QrTableActions }) {
  const t = useTranslations("pos.qr");
  const tk = useTranslations();
  const [view, setView] = useState<QrTableView>(p.initial);
  const [bill, setBill] = useState<QrTableBill | null>(p.initialBill);
  const [cart, setCart] = useState<QrCartItem[]>([]);
  const [tab, setTab] = useState<Tab>("menu");
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendErr, setSendErr] = useState<{ text: string; lineIndex: number | null } | null>(null);
  const [sent, setSent] = useState(false);
  const [notified, setNotified] = useState(false);
  const [requested, setRequested] = useState<string | null>(null);
  const { toast, show } = useToast();
  const now = useNow(30_000);
  const msg = useCallback((key: string) => tk(`pos.${key}`), [tk]);
  // POS P5.2 ▸ fix3 A2: TOKEN_INVALID (rotated/archived/unlinked table) = stop polling and quoting — a stale tab must not fill the per-IP miss budget ◂
  const dead = useRef<QrRefusal | null>(null);
  const [stopped, setStopped] = useState(false);
  const markDead = useCallback((r: QrRefusal) => {
    dead.current = r;
    setStopped(true);
  }, []);
  const quoteFn = useCallback(async (lines: unknown) => {
    if (dead.current) return dead.current;
    const r = await p.actions.quote(p.token, lines);
    if (!r.ok && r.code === "TOKEN_INVALID") markDead(r);
    return r;
  }, [p.actions, p.token, markDead]);
  const { quote, refusal, quoting } = useQrQuote(cart, quoteFn);

  const refreshBill = useCallback(async () => {
    const r = await p.actions.bill(p.token).catch(() => null);
    if (r && r.ok) setBill(r.bill);
  }, [p.actions, p.token]);
  const poll = useVisiblePoll(
    async () => {
      const r = await p.actions.poll(p.token, view.ver);
      if (!r.ok && r.code === "TOKEN_INVALID") return markDead(r); // POS P5.2 ▸ fix3 A2 ◂
      if (r.ok && r.changed) {
        setView(r.view);
        if (r.view.session) await refreshBill();
        else setBill(null);
      }
    },
    QR_TABLE_POLL_MS,
    !stopped, // POS P5.2 ▸ fix3 A2 ◂
  );
  useEffect(() => {
    if (p.notice) show(t(p.notice.replace(/^qr\./, "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวตอน mount (ข้อความจากฟอร์มสำรอง ?e=)
  }, []);

  const inCart = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of cart) m[c.productId] = (m[c.productId] ?? 0) + c.qty;
    return m;
  }, [cart]);
  const add = (pick: QrPick) => {
    setSendErr(null);
    setSent(false);
    setCart((c) => cartAdd(c, pick, QR_MAX_QTY));
  };
  const setQty = (key: string, qty: number) => {
    setSendErr(null);
    setCart((c) => cartSetQty(c, key, qty, QR_MAX_QTY));
  };
  const send = async () => {
    if (busy || !cart.length) return;
    setBusy(true);
    setSendErr(null);
    try {
      const r = await p.actions.place(p.token, { lines: cartLines(cart), expectedSessionId: view.session?.id ?? null, guestToken: guestTokenOfDevice() });
      if (r.ok) {
        setCart([]);
        setCartOpen(false);
        setSent(true);
        setTab("rounds");
        show(t("table.sent"));
        await poll();
        await refreshBill();
        return;
      }
      setSendErr({ text: msg(r.messageKey), lineIndex: r.lineIndex ?? null });
      if (r.code === "SESSION_CHANGED" || r.code === "QR_CLOSED") await poll();
    } catch {
      setSendErr({ text: msg("qr.errors.internal"), lineIndex: null });
    } finally {
      setBusy(false);
    }
  };
  const request = async (kind: "CALL_STAFF" | "REQUEST_BILL") => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await p.actions.request(p.token, kind);
      if (r.ok) {
        setRequested(kind);
        show(t("table.requested"));
      } else show(msg(r.messageKey), "danger");
    } catch {
      show(msg("qr.errors.internal"), "danger");
    } finally {
      setBusy(false);
    }
  };
  const notify = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await p.actions.notifyPaid(p.token);
      if (r.ok) {
        setNotified(true);
        show(t("table.notified"));
      } else show(msg(r.messageKey), "danger");
    } catch {
      show(msg("qr.errors.internal"), "danger");
    } finally {
      setBusy(false);
    }
  };

  const rounds = view.session?.rounds ?? [];
  const itemsAll = rounds.flatMap((r) => r.items.filter((it) => it.status !== "CANCELLED"));
  const doneN = itemsAll.filter((it) => it.status === "READY" || it.status === "SERVED").length;
  const count = cartCount(cart);
  const quoteErr = sendErr ?? (refusal ? { text: msg(refusal.messageKey), lineIndex: refusal.lineIndex ?? null } : null);
  const serviceNote = view.serviceChargeBp > 0 ? t("table.serviceChargeNote", { rate: view.serviceChargeBp / 100 }) : null;
  const sendBtn = (
    <button type="button" data-testid="pos-qr-send" disabled={busy || !cart.length || !view.open || !!refusal} className="h-12 w-full rounded-[14px] bg-[color:var(--color-ink)] text-[15px] font-bold text-[color:var(--color-surface)] disabled:opacity-40" onClick={() => void send()}>
      {busy ? t("common.sending") : t("table.send")}
    </button>
  );
  const cartBody = <QrCartBody cart={cart} quote={quote} quoting={quoting} errorIndex={quoteErr?.lineIndex ?? null} error={quoteErr?.text ?? null} serviceNote={serviceNote} onQty={setQty} footer={sendBtn} />;
  const hide = (k: Tab) => (tab === k ? "" : "hidden lg:block");

  const roundsNode = (
    <section data-testid="pos-qr-rounds" aria-label={t("table.rounds")} className={`flex flex-col gap-3 px-4 py-4 md:px-6 lg:px-0 ${hide("rounds")}`}>
      <h2 className="flex items-center justify-between text-[15px] font-bold">
        <span>{t("table.rounds")}</span>
        {itemsAll.length ? <span className="text-[12.5px] font-normal text-[color:var(--color-muted)]">{t("table.kitchenProgress", { done: doneN, total: itemsAll.length })}</span> : null}
      </h2>
      {rounds.length ? (
        <ul className="flex flex-col gap-2">
          {[...rounds].reverse().map((r) => (
            <li key={r.id} data-testid="pos-qr-round" className="rounded-[14px] border px-3 py-2.5">
              <p className="mb-1 flex justify-between text-[12.5px] text-[color:var(--color-muted)]">
                <span className="font-bold text-[color:var(--color-ink)]">{t("table.roundNo", { no: r.no })}</span>
                <span>{now !== null ? bkkHm(r.at) : ""}</span>
              </p>
              <ul className="flex flex-col gap-1">
                {r.items.map((it, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 text-[14px]">
                    <span className="min-w-0 break-words">
                      {it.qty} × {it.name}
                      {it.options.length ? <span className="block text-[12px] text-[color:var(--color-muted)]">{it.options.join(" · ")}</span> : null}
                    </span>
                    <span data-testid="pos-qr-round-status" data-status={it.status} className={`shrink-0 rounded-[8px] border px-2 py-0.5 text-[12px] ${STATUS_TONE[it.status] ?? ""}`}>
                      {t(`kitchen.${it.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-[color:var(--color-muted)]">{t("table.emptyRounds")}</p>
      )}
      {view.session ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" data-testid="pos-qr-call-staff" disabled={busy} className="h-12 rounded-[14px] border text-[14px] font-semibold disabled:opacity-50" onClick={() => void request("CALL_STAFF")}>
            {t("table.callStaff")}
          </button>
          <button type="button" data-testid="pos-qr-request-bill" disabled={busy} className="h-12 rounded-[14px] border text-[14px] font-semibold disabled:opacity-50" onClick={() => void request("REQUEST_BILL")}>
            {t("table.requestBill")}
          </button>
        </div>
      ) : null}
      {requested ? (
        <p data-testid="pos-qr-requested" role="status" className="text-[13px] text-[color:var(--color-ink-soft)]">
          {t("table.requested")}
        </p>
      ) : null}
    </section>
  );

  const billNode = view.session ? (
    <section data-testid="pos-qr-bill" aria-label={t("table.bill")} className={`flex flex-col gap-2 px-4 py-4 md:px-6 lg:px-0 ${hide("bill")}`}>
      <h2 className="text-[15px] font-bold">{t("table.bill")}</h2>
      {bill && bill.lines.length ? (
        <div className="rounded-[14px] border px-3 py-3 text-[13.5px]">
          <ul className="flex flex-col gap-0.5">
            {bill.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-3 tabular-nums text-[color:var(--color-ink-soft)]">
                <span className="min-w-0 break-words">
                  {l.qty} × {l.name}
                  {l.options.length ? <span className="block text-[12px] text-[color:var(--color-muted)]">{l.options.join(" · ")}</span> : null}
                </span>
                <span className="shrink-0">{qrBaht(l.amountSatang)}</span>
              </li>
            ))}
          </ul>
          <div className="my-2 h-px bg-[color:var(--color-line)]" />
          {bill.serviceChargeSatang ? (
            <div className="flex justify-between tabular-nums text-[color:var(--color-ink-soft)]">
              <span>{t("common.serviceCharge")}</span>
              <span>{qrBaht(bill.serviceChargeSatang)}</span>
            </div>
          ) : null}
          <div data-testid="pos-qr-bill-total" className="flex justify-between pt-1 text-[18px] font-bold tabular-nums">
            <span>{t("common.total")}</span>
            <span>{qrBaht(bill.totalSatang)}</span>
          </div>
        </div>
      ) : (
        <p className="text-[14px] text-[color:var(--color-muted)]">{t("table.billEmpty")}</p>
      )}
      {bill?.payHidden ? (
        <p data-testid="pos-qr-pay-hidden" className="rounded-[12px] bg-[color:var(--color-surface-2)] px-3 py-2.5 text-[13.5px]">
          {t("table.payHidden")}
        </p>
      ) : bill && bill.promptpayPayload && bill.totalSatang > 0 ? (
        <div data-testid="pos-qr-bill-pay" className="flex flex-col items-center gap-2 rounded-[14px] border px-3 py-4">
          <p className="text-[13.5px] font-semibold">{t("table.payPromptpay")}</p>
          <QrCodeImage value={bill.promptpayPayload} size={208} alt={t("table.payPromptpay")} fallback={t("common.qrFailed")} testid="pos-qr-bill-qr" />
          <p className="text-[20px] font-bold tabular-nums">{qrBaht(bill.totalSatang)}</p>
          {notified ? (
            <p data-testid="pos-qr-notified" role="status" className="text-center text-[13.5px] font-semibold">
              {t("table.notified")}
            </p>
          ) : (
            <button type="button" data-testid="pos-qr-notify-paid" disabled={busy} className="h-12 w-full rounded-[14px] bg-[color:var(--color-ink)] text-[15px] font-bold text-[color:var(--color-surface)] disabled:opacity-50" onClick={() => void notify()}>
              {t("table.notifyPaid")}
            </button>
          )}
          <p className="text-center text-[11.5px] text-[color:var(--color-muted)]">{t("table.payHint")}</p>
        </div>
      ) : bill && bill.totalSatang > 0 ? (
        <p className="text-[13px] text-[color:var(--color-muted)]">{t("table.payAtCashier")}</p>
      ) : null}
    </section>
  ) : null;

  return (
    <div data-testid="pos-qr-table" data-ver={view.ver} data-open={view.open ? "1" : "0"} data-session={view.session ? "1" : "0"} className="flex min-w-0 flex-1 flex-col pb-24 lg:pb-6">
      {!view.open ? (
        <div data-testid="pos-qr-closed" data-reason={view.closedReason ?? "CHANNEL_OFF"} role="status" className="mx-4 mt-3 rounded-[14px] border border-[color:var(--color-danger)] px-4 py-3 md:mx-6">
          <p className="text-[14px] font-bold text-[color:var(--color-danger)]">{t(`closed.${view.closedReason ?? "CHANNEL_OFF"}`)}</p>
          <p className="text-[13px] text-[color:var(--color-ink-soft)]">{t("closed.banner")}</p>
        </div>
      ) : null}
      {sent ? (
        <p data-testid="pos-qr-sent" role="status" className="mx-4 mt-3 rounded-[14px] bg-[color:var(--color-surface-2)] px-4 py-3 text-[14px] font-semibold md:mx-6">
          {t("table.sentBanner")}
        </p>
      ) : null}
      <div role="tablist" aria-label={t("table.tabs")} className="mx-4 mt-3 grid grid-cols-3 gap-1 rounded-[12px] bg-[color:var(--color-surface-2)] p-1 md:mx-6 lg:hidden">
        {(["menu", "rounds", "bill"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            data-testid={`pos-qr-tab-${k}`}
            disabled={k === "bill" && !view.session}
            className={`h-11 truncate rounded-[10px] px-1 text-[13.5px] disabled:opacity-40 ${tab === k ? "bg-[color:var(--color-surface)] font-bold shadow-sm" : "text-[color:var(--color-ink-soft)]"}`}
            onClick={() => setTab(k)}
          >
            {k === "menu" ? t("table.menu") : k === "rounds" ? `${t("table.roundsTab")}${itemsAll.length ? ` ${itemsAll.length}` : ""}` : t("table.billTab")}
          </button>
        ))}
      </div>
      <div className="min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:px-6 lg:pt-2">
        <div className={`min-w-0 ${hide("menu")}`}>
          <QrMenuBoard menu={view.menu} locale={p.locale} canOrder={view.open} inCart={inCart} onAdd={add} />
        </div>
        <aside className="flex min-w-0 flex-col lg:sticky lg:top-2 lg:self-start">
          {view.open ? (
            <section aria-label={t("table.cart")} className="hidden overflow-hidden rounded-[16px] border lg:mt-4 lg:block">
              <h2 className="border-b px-4 py-3 text-[15px] font-bold">{t("table.cart")}</h2>
              {cartBody}
            </section>
          ) : null}
          {roundsNode}
          {billNode}
        </aside>
      </div>
      {view.open && count > 0 && tab === "menu" ? (
        <div className="lg:hidden">
          <QrCartBar count={count} label={t("table.cart")} total={quote && quote.lines.length === cart.length ? qrBaht(quote.totalSatang) : "…"} onOpen={() => setCartOpen(true)} />
        </div>
      ) : null}
      {cartOpen ? (
        <div className="lg:hidden">
          <QrBottomPanel testid="pos-qr-cart-sheet" title={t("table.cart")} onClose={() => setCartOpen(false)}>
            {cartBody}
          </QrBottomPanel>
        </div>
      ) : null}
      {toast ? (
        <div data-testid="pos-qr-toast" role="status" aria-live="polite" className={`pointer-events-none fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-[440px] rounded-[14px] px-4 py-3 text-[14px] shadow-xl ${toast.tone === "danger" ? "bg-[color:var(--color-danger)] text-[color:var(--color-surface)]" : "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"}`}>
          {/* POS P2.7U fix1 ▸ IMG-4: ข้อความลอยอยู่ล่าง (เหนือแถบตะกร้า) — ไม่ทับหัวร้าน/ป้ายโต๊ะ ◂ */}
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
