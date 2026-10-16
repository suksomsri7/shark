"use client";

// QrPreorderApp.tsx — สั่งล่วงหน้าจ่ายก่อน /q/<linkToken> (POS P2.7U · §1 b · มติ 3 4 7 11 15) — เกาะ client ของหน้า server
//   เมนู (ราคา QR_ORDER · 86 = หมด) → ตะกร้า (quote ของเซิร์ฟเวอร์ · ไม่มีค่าบริการ) → ข้อมูลผู้รับ (ชื่อ + เบอร์ไทย + หมายเหตุ · บรรทัด PDPA) →
//   สั่งและจ่าย (placePreorder · คีย์ 1 ต่อตะกร้า+ผู้รับ ⇒ ส่งซ้ำ = ออเดอร์เดิม) → หน้าสถานะ /q/o/<orderToken> (QR พร้อมเพย์ + นับถอยหลัง)
//   รับเองที่ร้านเท่านั้น (ASAP · "เตรียมประมาณ N นาที" · มติ 7) · ประตูปิด = แบนเนอร์ตามเหตุ + เมนูอ่านอย่างเดียว
//   จอ < 1024 = ขั้นเมนู → แผ่นตะกร้า → ขั้นกรอกข้อมูล · ≥ 1024 = เมนูซ้าย + คอลัมน์ขวา (ตะกร้า + ข้อมูลผู้รับ)
//   🔴 ไม่มีข้อความไทยนอก t() (ST7) · import ค่าได้แค่ *-shared (actions มาทาง props) · ไม่มีการคิดเงิน · เบอร์ใช้ติดต่อเรื่องออเดอร์นี้เท่านั้น

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { normalizeThaiPhone, QR_MAX_QTY, QR_NAME_MAX, QR_NOTE_MAX, type QrLinkView, type QrPlacePreorderResult, type QrPreorderInput, type QrQuoteResult } from "@/lib/modules/pos/qr-order-shared";
import { QrMenuBoard, type QrPick } from "./QrMenu";
import { QrCartBar, QrCartBody, QrBottomPanel } from "./QrCart";
import { useQrQuote, useToast } from "./use-qr";
import { cartAdd, cartCount, cartLines, cartSetQty, newPreorderKey, qrBaht, type QrCartItem, type QrLocale } from "./qr-ui";

export type QrPreorderActions = {
  quote: (linkToken: string, lines: unknown) => Promise<QrQuoteResult>;
  place: (linkToken: string, input: QrPreorderInput) => Promise<QrPlacePreorderResult>;
};

export function QrPreorderApp(p: { token: string; locale: QrLocale; view: QrLinkView; notice: string | null; actions: QrPreorderActions }) {
  const t = useTranslations("pos.qr");
  const tk = useTranslations();
  const router = useRouter();
  const v = p.view;
  const [cart, setCart] = useState<QrCartItem[]>([]);
  const [step, setStep] = useState<"menu" | "checkout">("menu");
  const [cartOpen, setCartOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; lineIndex: number | null } | null>(p.notice ? { text: tk(`pos.${p.notice}`), lineIndex: null } : null);
  const { toast, show } = useToast();
  const quoteFn = useCallback((lines: unknown) => p.actions.quote(p.token, lines), [p.actions, p.token]);
  const { quote, refusal, quoting } = useQrQuote(cart, quoteFn);
  const sig = JSON.stringify(cartLines(cart));
  // คีย์กันซ้ำ: ใหม่เมื่อตะกร้า/ผู้รับเปลี่ยน · กดซ้ำ/เน็ตหลุดแล้วกดใหม่ = คีย์เดิม = ออเดอร์เดิม (S6)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- คีย์ผูกกับลายนิ้วมือของตะกร้า + ผู้รับ
  const key = useMemo(() => newPreorderKey(), [sig, name.trim(), phone.trim()]);
  const inCart = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of cart) m[c.productId] = (m[c.productId] ?? 0) + c.qty;
    return m;
  }, [cart]);
  const add = (pick: QrPick) => {
    setErr(null);
    setCart((c) => cartAdd(c, pick, QR_MAX_QTY));
  };
  const setQty = (k: string, qty: number) => {
    setErr(null);
    setCart((c) => {
      const n = cartSetQty(c, k, qty, QR_MAX_QTY);
      if (!n.length) setStep("menu");
      return n;
    });
  };
  const phoneOk = normalizeThaiPhone(phone) !== null;
  const nameOk = name.trim().length > 0 && name.trim().length <= QR_NAME_MAX;
  const fresh = !!quote && quote.lines.length === cart.length;
  const place = async () => {
    setTouched(true);
    if (busy || !cart.length || !nameOk || !phoneOk || !v.open) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await p.actions.place(p.token, { lines: cartLines(cart), customer: { name: name.trim(), phone: phone.trim() }, idempotencyKey: key, ...(note.trim() ? { note: note.trim() } : {}) });
      if (r.ok) {
        router.push(`/q/o/${encodeURIComponent(r.orderToken)}?lang=${p.locale}`);
        return;
      }
      setErr({ text: tk(`pos.${r.messageKey}`), lineIndex: r.lineIndex ?? null });
      if (r.lineIndex !== undefined) setStep("menu");
      show(tk(`pos.${r.messageKey}`), "danger");
    } catch {
      setErr({ text: tk("pos.qr.errors.internal"), lineIndex: null });
    } finally {
      setBusy(false);
    }
  };

  const count = cartCount(cart);
  const quoteErr = err ?? (refusal ? { text: tk(`pos.${refusal.messageKey}`), lineIndex: refusal.lineIndex ?? null } : null);
  const toCheckout = (
    <button type="button" data-testid="pos-qr-to-checkout" disabled={!cart.length || !!refusal || !v.open} className="h-12 w-full rounded-[14px] bg-[color:var(--color-ink)] text-[15px] font-bold text-[color:var(--color-surface)] disabled:opacity-40 lg:hidden" onClick={() => (setCartOpen(false), setStep("checkout"))}>
      {t("preorder.next")}
    </button>
  );
  const cartBody = <QrCartBody cart={cart} quote={quote} quoting={quoting} errorIndex={quoteErr?.lineIndex ?? null} error={quoteErr?.text ?? null} onQty={setQty} footer={toCheckout} />;
  const checkout = (
    <section data-testid="pos-qr-checkout" aria-label={t("preorder.checkout")} className="flex flex-col gap-3 px-4 py-4 md:px-6 lg:px-4">
      <h2 className="text-[15px] font-bold">{t("preorder.checkout")}</h2>
      <label className="flex flex-col gap-1 text-[13px] text-[color:var(--color-ink-soft)]">
        {t("preorder.name")}
        <input data-testid="pos-qr-co-name" value={name} maxLength={QR_NAME_MAX} autoComplete="name" onChange={(e) => setName(e.target.value)} className="input h-12 rounded-[12px] text-[15px]" />
        {touched && !nameOk ? <span className="text-[12px] text-[color:var(--color-danger)]">{t("preorder.nameRequired")}</span> : null}
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-[color:var(--color-ink-soft)]">
        {t("preorder.phone")}
        <input data-testid="pos-qr-co-phone" value={phone} inputMode="tel" autoComplete="tel" placeholder="08x-xxx-xxxx" onChange={(e) => setPhone(e.target.value)} className="input h-12 rounded-[12px] text-[15px]" />
        {touched && !phoneOk ? (
          <span data-testid="pos-qr-co-phone-error" className="text-[12px] text-[color:var(--color-danger)]">
            {t("preorder.phoneInvalid")}
          </span>
        ) : null}
      </label>
      <p data-testid="pos-qr-pdpa" className="text-[12px] text-[color:var(--color-muted)]">
        {t("preorder.pdpa")}
      </p>
      <label className="flex flex-col gap-1 text-[13px] text-[color:var(--color-ink-soft)]">
        {t("common.note")}
        <textarea data-testid="pos-qr-co-note" value={note} maxLength={QR_NOTE_MAX} rows={2} onChange={(e) => setNote(e.target.value)} className="input rounded-[12px] py-2 text-[14px]" />
      </label>
      <div className="flex items-center justify-between rounded-[12px] bg-[color:var(--color-surface-2)] px-3 py-2.5 text-[14px]">
        <span>{t("preorder.payTotal")}</span>
        <span data-testid="pos-qr-co-total" className="text-[18px] font-bold tabular-nums">
          {fresh ? qrBaht(quote!.totalSatang) : quoting ? "…" : "–"}
        </span>
      </div>
      <p className="text-[12px] text-[color:var(--color-muted)]">{t("preorder.payNote")}</p>
      {err && step === "checkout" ? (
        <p data-testid="pos-qr-co-error" role="alert" className="rounded-[10px] border border-[color:var(--color-danger)] px-3 py-2 text-[13px] text-[color:var(--color-danger)]">
          {err.text}
        </p>
      ) : null}
      <button type="button" data-testid="pos-qr-place" disabled={busy || !cart.length || !v.open || !fresh} className="h-12 w-full rounded-[14px] bg-[color:var(--color-ink)] text-[15px] font-bold text-[color:var(--color-surface)] disabled:opacity-40" onClick={() => void place()}>
        {busy ? t("common.sending") : t("preorder.place")}
      </button>
      <button type="button" data-testid="pos-qr-co-back" className="h-11 w-full rounded-[14px] text-[14px] text-[color:var(--color-ink-soft)] lg:hidden" onClick={() => setStep("menu")}>
        {t("preorder.backToMenu")}
      </button>
    </section>
  );

  return (
    <div data-testid="pos-qr-preorder" data-open={v.open ? "1" : "0"} data-step={step} className="flex min-w-0 flex-1 flex-col pb-24 lg:pb-6">
      {!v.open ? (
        <div data-testid="pos-qr-closed" data-reason={v.closedReason ?? "CHANNEL_OFF"} role="status" className="mx-4 mt-3 rounded-[14px] border border-[color:var(--color-danger)] px-4 py-3 md:mx-6">
          <p className="text-[14px] font-bold text-[color:var(--color-danger)]">{t(`closed.${v.closedReason ?? "CHANNEL_OFF"}`)}</p>
          <p className="text-[13px] text-[color:var(--color-ink-soft)]">{t("closed.banner")}</p>
        </div>
      ) : null}
      <p className="mx-4 mt-3 flex flex-wrap gap-x-2 text-[13px] text-[color:var(--color-ink-soft)] md:mx-6">
        <span className="font-semibold">{t("preorder.pickupOnly")}</span>
        <span>· {t("preorder.prepNote", { min: v.prepMinutes })}</span>
      </p>
      <div className="min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 lg:px-6 lg:pt-2">
        <div className={`min-w-0 ${step === "menu" ? "" : "hidden lg:block"}`}>
          <QrMenuBoard menu={v.menu} locale={p.locale} canOrder={v.open} inCart={inCart} onAdd={add} />
        </div>
        {v.open ? (
          <aside className={`flex min-w-0 flex-col lg:sticky lg:top-2 lg:mt-4 lg:self-start lg:overflow-hidden lg:rounded-[16px] lg:border ${step === "checkout" ? "" : "hidden lg:flex"}`}>
            <section aria-label={t("preorder.cart")} className="hidden lg:block">
              <h2 className="border-b px-4 py-3 text-[15px] font-bold">{t("preorder.cart")}</h2>
              {cartBody}
            </section>
            {cart.length ? checkout : null}
          </aside>
        ) : null}
      </div>
      {v.open && count > 0 && step === "menu" ? (
        <div className="lg:hidden">
          <QrCartBar count={count} label={t("preorder.cart")} total={fresh ? qrBaht(quote!.totalSatang) : "…"} onOpen={() => setCartOpen(true)} />
        </div>
      ) : null}
      {cartOpen ? (
        <div className="lg:hidden">
          <QrBottomPanel testid="pos-qr-cart-sheet" title={t("preorder.cart")} onClose={() => setCartOpen(false)}>
            {cartBody}
          </QrBottomPanel>
        </div>
      ) : null}
      {toast ? (
        <div data-testid="pos-qr-toast" role="status" aria-live="polite" className={`pointer-events-none fixed inset-x-4 top-4 z-[60] mx-auto max-w-[440px] rounded-[14px] px-4 py-3 text-[14px] shadow-xl ${toast.tone === "danger" ? "bg-[color:var(--color-danger)] text-[color:var(--color-surface)]" : "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"}`}>
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
