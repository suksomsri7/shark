"use client";

// DisplayScreen.tsx — จอลูกค้า (จอที่ 2 · POS P2.10 · ภาพ 11 แผง A 1280×800 · 1024×768) — หน้า /d เท่านั้น
//
// 🔴 import ได้แค่ display-shared (บริสุทธิ์) — action ของหน้า /d ส่งเข้ามาทาง props (pairAction/readAction · S5.17)
// 🔴 สองโหมด: ฟอร์มรหัสจับคู่ ↔ จอ · โพลตาม nextPollMs ของเซิร์ฟเวอร์ (1 วิ ระหว่างขาย/จ่าย/ขอบคุณ · 3 วิ หน้าพัก) · แท็บถูกซ่อน = หยุดโพล ·
//    DISPLAY_NOT_PAIRED = กลับฟอร์ม · ขอให้จอไม่ดับ (Wake Lock · ถ้าเบราว์เซอร์มี) · ปุ่มเต็มจอ
// 🔴 ข้อความทุกคำมาจาก pos.display.screen (ภาษา = settings.locale ของจอ · ยังไม่จับคู่ = ?lang / คุกกี้ lang)
// 🔴 ไม่มีวันที่/เวลา/locale ของเครื่องใน render (HF-418) · เงิน = displayBaht · แต้ม = displayGroup

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createTranslator } from "next-intl";
import QRCode from "qrcode";
import {
  displayBaht,
  displayErrorKey,
  displayGroup,
  normalizePairCode,
  DISPLAY_PAIR_CODE_LEN,
  DISPLAY_POLL_IDLE_MS,
  type DisplayLocale,
  type DisplayRefusal,
  type DisplayView,
  type ReadCustomerDisplayResult,
} from "@/lib/modules/pos/display-shared";

export type DisplayInitial = { ver: string; view: DisplayView; nextPollMs: number };
type T = (key: string, values?: Record<string, string | number>) => string;
type Props = {
  initial: DisplayInitial | null;
  prefillCode: string;
  fallbackLocale: DisplayLocale;
  /** pos.display ของสองภาษา (หน้า /d ส่งมา — คอมโพเนนต์ไม่โหลดไฟล์ข้อความเอง) */
  messages: { th: Record<string, unknown>; en: Record<string, unknown> };
  pairAction: (code: string) => Promise<{ ok: true } | DisplayRefusal>;
  readAction: (args: { sinceVer?: string }) => Promise<ReadCustomerDisplayResult>;
};

function useT(messages: Props["messages"], locale: DisplayLocale): T {
  return useMemo(
    () => createTranslator({ locale, messages: { pos: { display: messages[locale] } }, namespace: "pos.display" } as never) as unknown as T,
    [messages, locale],
  );
}

// ═══════════ QR (วาดในเครื่อง · ไม่มีข้อความ) ═══════════
function Qr({ value, size, alt, testid }: { value: string; size: number; alt: string; testid: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: "M" })
      .then((u: string) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [value, size]);
  return (
    <div data-testid={testid} className="grid place-items-center rounded-[14px] border bg-[color:var(--color-surface)] p-2" style={{ width: size + 18, height: size + 18 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={alt} width={size} height={size} /> : <span className="size-full rounded-[8px] bg-[color:var(--color-surface-2)]" />}
    </div>
  );
}

function CheckBadge({ size = 64 }: { size?: number }) {
  return (
    <span aria-hidden className="grid place-items-center rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}
function CardIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 9.5h19M6 15h4" />
    </svg>
  );
}

// ═══════════ หัวร้าน ═══════════
function ShopHead({ view, compact }: { view: DisplayView; compact?: boolean }) {
  const h = view.header;
  const sub = [h.branch, h.counter].filter(Boolean).join(" · ");
  const box = compact ? 46 : 72;
  return (
    <div data-testid="pos-display-shop" className={`flex items-center ${compact ? "gap-5" : "flex-col gap-4 text-center"}`}>
      {h.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={h.logoUrl} alt="" width={box} height={box} className="shrink-0 rounded-[12px] object-cover" style={{ width: box, height: box }} />
      ) : (
        <span aria-hidden className="grid shrink-0 place-items-center rounded-[12px] bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" style={{ width: box, height: box, fontSize: box * 0.42 }}>
          {[...h.shopName][0] ?? ""}
        </span>
      )}
      <div className="min-w-0">
        <b className={`block truncate leading-tight ${compact ? "text-[19px] xl:text-[21px]" : "text-[26px] xl:text-[30px]"}`}>{h.shopName}</b>
        {sub && <span className={`block truncate text-[color:var(--color-muted)] ${compact ? "text-[13px]" : "text-[16px]"}`}>{sub}</span>}
      </div>
    </div>
  );
}

// ═══════════ แผงซ้าย: ทักทาย · รายการ · ยอด · สแตมป์ ═══════════
function BillPane({ view, t }: { view: DisplayView; t: T }) {
  const m = view.member;
  const tt = view.totals;
  const st = view.stamp;
  const sumRow = (label: string, satang: number, testid: string, minus = false) => (
    <div data-testid={testid} className="flex justify-between gap-4 py-1 text-[14px] text-[color:var(--color-ink-soft)] xl:text-[15px]">
      <span className="min-w-0 truncate">{label}</span>
      <span className={`shrink-0 tabular-nums ${minus ? "text-[color:var(--color-danger)]" : ""}`}>{minus ? displayBaht(-satang) : displayBaht(satang)}</span>
    </div>
  );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col px-8 pt-7 xl:px-10 xl:pt-[34px]">
      <ShopHead view={view} compact />
      {m && (
        <div data-testid="pos-display-greeting" className="mt-6 xl:mt-[31px]">
          <div className="text-[23px] font-bold tracking-[-0.01em] xl:text-[26px]">{t("screen.hello", { name: m.firstName })}</div>
          {(m.tier || m.points !== undefined) && (
            <small className="mt-0.5 block text-[13px] text-[color:var(--color-muted)] xl:text-[14px]">
              {m.tier && m.points !== undefined ? t("screen.tierPoints", { tier: m.tier, points: displayGroup(m.points) }) : m.tier ? m.tier : t("screen.points", { points: displayGroup(m.points ?? 0) })}
            </small>
          )}
        </div>
      )}
      <div data-testid="pos-display-lines" className="mt-5 min-h-0 flex-1 overflow-hidden xl:mt-[31px]">
        {view.lines.map((l, i) => {
          const note = l.discountSatang > 0 ? [t("screen.lineDiscountNote", { amount: displayBaht(l.discountSatang) }), l.discountLabel].filter(Boolean).join(" · ") : null;
          const sub = [l.detail, note].filter(Boolean).join(" · ");
          return (
            <div key={i} data-testid="pos-display-line" className={`flex items-baseline gap-5 py-2.5 text-[17px] xl:gap-[26px] xl:py-[13px] xl:text-[19px] ${i ? "border-t" : ""}`}>
              <span className="w-9 shrink-0 tabular-nums text-[color:var(--color-muted)]">{`${displayGroup(l.qty)}×`}</span>
              <div className="min-w-0 flex-1">
                <span className="block truncate">{l.name}</span>
                {sub && <small className="block truncate text-[12.5px] text-[color:var(--color-muted)] xl:text-[13.5px]">{sub}</small>}
              </div>
              <span className="shrink-0 text-right font-bold tabular-nums">
                {displayBaht(l.grossSatang)}
                {l.discountSatang > 0 && <small className="block text-[12.5px] font-semibold text-[color:var(--color-danger)] xl:text-[13.5px]">{displayBaht(-l.discountSatang)}</small>}
              </span>
            </div>
          );
        })}
        {view.moreCount > 0 && (
          <div data-testid="pos-display-more" className="border-t py-2 text-[14px] text-[color:var(--color-muted)]">
            {t("screen.more", { count: view.moreCount })}
          </div>
        )}
        {tt && (
          <div data-testid="pos-display-totals" className="mt-0.5 border-t pt-2.5">
            {sumRow(t("screen.subtotal"), tt.subtotalSatang, "pos-display-subtotal")}
            {tt.lineDiscountSatang > 0 && sumRow(t("screen.lineDiscount"), tt.lineDiscountSatang, "pos-display-line-discount", true)}
            {tt.billDiscountSatang > 0 && sumRow(t("screen.billDiscount"), tt.billDiscountSatang, "pos-display-bill-discount", true)}
            {tt.coupon && tt.coupon.satang > 0 && sumRow(t("screen.coupon", { code: tt.coupon.code }), tt.coupon.satang, "pos-display-coupon", true)}
            {(tt.member ?? []).map((ml, i) => (ml.satang > 0 ? <div key={i}>{sumRow(ml.label, ml.satang, "pos-display-member-discount", true)}</div> : null))}
            {tt.serviceChargeSatang > 0 && sumRow(t("screen.serviceCharge"), tt.serviceChargeSatang, "pos-display-service")}
          </div>
        )}
      </div>
      {st && (
        <div data-testid="pos-display-stamp" className="-mx-8 flex items-center gap-6 border-t bg-[color:var(--color-surface)] px-8 py-4 xl:-mx-10 xl:gap-[31px] xl:px-10 xl:py-[18px]">
          <div className="min-w-0 flex-1 text-[13px] text-[color:var(--color-ink-soft)] xl:text-[14px]">
            <b className="block truncate text-[15px] text-[color:var(--color-ink)] xl:text-[15.5px]">{st.name}</b>
            <span data-near={st.near ? "1" : "0"} className={st.near && st.filled < st.slots ? "font-semibold text-[color:var(--color-accent)]" : ""}>
              {st.filled >= st.slots
                ? t("screen.stampFull")
                : t(st.near ? "screen.stampNear" : "screen.stampProgress", { filled: st.filled, slots: st.slots, left: st.slots - st.filled })}
            </span>
          </div>
          {st.slots <= 12 && (
            <div aria-hidden className="flex shrink-0 gap-2.5 xl:gap-[13px]">
              {Array.from({ length: st.slots }, (_, i) => (
                <i
                  key={i}
                  className={`block size-[18px] rounded-full border-[1.5px] xl:size-[22px] ${i < st.filled ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)]" : "border-[color:var(--color-line)]"}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════ แผงขวา: ยอด · ช่องจ่าย · ขอบคุณ ═══════════
function PayPane({ view, t }: { view: DisplayView; t: T }) {
  const pay = view.pay;
  const done = view.done;
  if (view.phase === "done" && done) {
    const name = view.member?.firstName;
    return (
      <div data-testid="pos-display-done" className="flex w-full flex-col items-center gap-5 rounded-[18px] border bg-[color:var(--color-surface)] px-6 py-7 text-center">
        <CheckBadge />
        <div className="text-[24px] font-bold xl:text-[28px]">{name ? t("screen.thanksName", { name }) : t("screen.thanks")}</div>
        {done.changeSatang > 0 && (
          <div data-testid="pos-display-done-change" className="text-[20px] font-semibold tabular-nums">
            {t("screen.changeDone", { amount: displayBaht(done.changeSatang) })}
          </div>
        )}
        {done.pointsEarned !== undefined && done.pointsEarned > 0 && (
          <div data-testid="pos-display-done-points" className="text-[16px] text-[color:var(--color-ink-soft)]">
            {t("screen.earned", { points: displayGroup(done.pointsEarned) })}
          </div>
        )}
        {done.receiptUrl && (
          <>
            <Qr value={done.receiptUrl} size={168} alt={t("screen.qrAlt")} testid="pos-display-receipt-qr" />
            <div className="text-[15px] font-semibold">{t("screen.receiptQr")}</div>
          </>
        )}
        {done.receiptNo && <div className="text-[12.5px] text-[color:var(--color-muted)]">{t("screen.receiptNo", { no: done.receiptNo })}</div>}
      </div>
    );
  }
  const due = pay ? pay.dueSatang : (view.totals?.grandTotalSatang ?? 0);
  const qr = pay?.qr ?? null;
  const qrPaid = !!qr && (qr.status === "PAID" || qr.status === "CONSUMED");
  return (
    <div data-testid="pos-display-paycard" className="flex w-full flex-col items-center gap-5 rounded-[18px] border bg-[color:var(--color-surface)] px-6 py-7 xl:gap-[23px]">
      <div className="text-[15px] text-[color:var(--color-muted)]">{t("screen.due")}</div>
      <div data-testid="pos-display-due" className="text-[52px] font-bold leading-[1.05] tabular-nums xl:text-[64px]">
        {displayBaht(due)}
      </div>
      {pay && pay.paidSatang > 0 && (
        <div data-testid="pos-display-paid" className="text-[15px] tabular-nums text-[color:var(--color-ink-soft)]">
          {t("screen.paid", { amount: displayBaht(pay.paidSatang) })} · {t("screen.remaining")} <b className="text-[color:var(--color-accent)]">{displayBaht(Math.max(pay.remainingSatang, 0))}</b>
        </div>
      )}
      {pay && qrPaid && (
        <div data-testid="pos-display-qr-paid" className="flex flex-col items-center gap-3">
          <CheckBadge size={72} />
          <div className="text-[18px] font-bold">{t("screen.paidOk")}</div>
        </div>
      )}
      {pay && !qrPaid && (pay.method === "PROMPTPAY" || (pay.method === "CARD" && qr)) && (
        <>
          {qr?.payload ? <Qr value={qr.payload} size={200} alt={t("screen.qrAlt")} testid="pos-display-pay-qr" /> : qr ? <div className="text-[14px] text-[color:var(--color-muted)]">{t("screen.qrClosed")}</div> : null}
          <div className="text-[17px] font-bold">{pay.method === "CARD" ? t("screen.scanCard") : t("screen.scanPromptpay")}</div>
          {pay.method === "PROMPTPAY" && <div className="text-[12.5px] text-[color:var(--color-muted)]">{t("screen.tapCard")}</div>}
        </>
      )}
      {pay && !qrPaid && pay.method === "CARD" && !qr && (
        <div data-testid="pos-display-card" className="flex flex-col items-center gap-3 text-center">
          <CardIcon />
          <div className="text-[18px] font-bold">{t("screen.cardTitle")}</div>
          <div className="text-[14px] text-[color:var(--color-muted)]">{t("screen.cardHint")}</div>
        </div>
      )}
      {pay && pay.method === "CASH" && (
        <div data-testid="pos-display-cash" className="flex w-full flex-col gap-2">
          <div className="text-center text-[17px] font-bold">{t("screen.cashTitle")}</div>
          {pay.cashReceivedSatang !== undefined && (
            <div className="flex justify-between border-t pt-3 text-[20px] tabular-nums">
              <span className="text-[color:var(--color-ink-soft)]">{t("screen.cashReceived")}</span>
              <b>{displayBaht(pay.cashReceivedSatang)}</b>
            </div>
          )}
          {pay.changeSatang !== undefined && pay.changeSatang > 0 && (
            <div data-testid="pos-display-cash-change" className="flex justify-between text-[26px] tabular-nums">
              <span className="text-[color:var(--color-ink-soft)]">{t("screen.change")}</span>
              <b>{displayBaht(pay.changeSatang)}</b>
            </div>
          )}
        </div>
      )}
      {pay && pay.method === "OTHER" && <div className="text-[17px] font-bold">{t("screen.otherTitle")}</div>}
    </div>
  );
}

function IdlePane({ view, t }: { view: DisplayView; t: T }) {
  return (
    <div data-testid="pos-display-idle" className="flex flex-1 flex-col items-center justify-center gap-10 px-10 text-center">
      <ShopHead view={view} />
      <div className="max-w-[900px] text-[40px] font-bold leading-tight tracking-[-0.01em] xl:text-[52px]">{view.settings.idleText ?? t("screen.welcome")}</div>
    </div>
  );
}

// ═══════════ ฟอร์มจับคู่ ═══════════
function PairPanel({ t, prefill, submitCode }: { t: T; prefill: string; submitCode: (code: string) => Promise<string | null> }) {
  const [code, setCode] = useState(prefill);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = normalizePairCode(code) !== null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setErr(null);
    const m = await submitCode(code);
    setBusy(false);
    if (m) setErr(m);
  };
  return (
    <div className="flex flex-1 items-center justify-center bg-[color:var(--color-surface-2)] p-6">
      <form data-testid="pos-display-pair" onSubmit={(e) => void submit(e)} className="flex w-full max-w-[520px] flex-col gap-5 rounded-[18px] border bg-[color:var(--color-surface)] p-8">
        <h1 className="text-[26px] font-bold">{t("screen.pairTitle")}</h1>
        <p className="text-[15px] text-[color:var(--color-ink-soft)]">{t("screen.pairHint")}</p>
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{t("screen.pairCode")}</span>
          <input
            data-testid="pos-display-pair-code"
            className="input h-16 rounded-[13px] px-4 text-center font-mono text-[32px] uppercase tracking-[0.3em]"
            value={code}
            maxLength={DISPLAY_PAIR_CODE_LEN + 2}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        {err && (
          <p data-testid="pos-display-pair-error" role="alert" className="text-[14px] text-[color:var(--color-danger)]">
            {err}
          </p>
        )}
        <button data-testid="pos-display-pair-submit" type="submit" disabled={!ok || busy} className="btn btn-primary h-14 rounded-[13px] text-[17px] font-semibold disabled:opacity-50">
          {busy ? t("screen.pairBusy") : t("screen.pairSubmit")}
        </button>
      </form>
    </div>
  );
}

// ═══════════ จอ ═══════════
export function DisplayScreen({ initial, prefillCode, fallbackLocale, messages, pairAction, readAction }: Props) {
  const [view, setView] = useState<DisplayView | null>(initial?.view ?? null);
  const [paired, setPaired] = useState(!!initial);
  const [offline, setOffline] = useState(false);
  const [fs, setFs] = useState(true); // ปุ่มเต็มจอโผล่หลัง mount (SSR ไม่รู้สถานะเต็มจอ)
  const verRef = useRef<string | undefined>(initial?.ver);
  const firstDelay = useRef(initial?.nextPollMs ?? 0);
  const t = useT(messages, view?.settings.locale ?? fallbackLocale);

  // โพล (มติ 1): ตามช่วงที่เซิร์ฟเวอร์บอก · ซ่อนแท็บ = หยุด · กลับมา = อ่านทันที
  useEffect(() => {
    if (!paired) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      timer = undefined;
      if (!alive || document.visibilityState === "hidden") return;
      let next = DISPLAY_POLL_IDLE_MS;
      try {
        const r = await readAction(verRef.current ? { sinceVer: verRef.current } : {});
        if (!alive) return;
        if (r.ok) {
          setOffline(false);
          verRef.current = r.ver;
          if (r.changed) setView(r.view);
          next = r.nextPollMs;
        } else if (r.code === "DISPLAY_NOT_PAIRED") {
          verRef.current = undefined;
          setView(null);
          setPaired(false);
          return;
        } else setOffline(true);
      } catch {
        if (alive) setOffline(true);
      }
      if (alive && !timer) timer = setTimeout(() => void tick(), next);
    };
    const onVis = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    timer = setTimeout(() => void tick(), firstDelay.current);
    firstDelay.current = 0;
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [paired, readAction]);

  // จอไม่ดับระหว่างจับคู่อยู่ (Wake Lock — ไม่มี/ถูกปฏิเสธ = เงียบ)
  useEffect(() => {
    if (!paired) return;
    type Lock = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (k: "screen") => Promise<Lock> } };
    let lock: Lock | null = null;
    const req = () => {
      if (document.visibilityState !== "visible" || !nav.wakeLock) return;
      nav.wakeLock
        .request("screen")
        .then((l) => {
          lock = l;
        })
        .catch(() => {});
    };
    req();
    document.addEventListener("visibilitychange", req);
    return () => {
      document.removeEventListener("visibilitychange", req);
      lock?.release().catch(() => {});
    };
  }, [paired]);

  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement || typeof document.documentElement.requestFullscreen !== "function");
    on();
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const pairWith = useCallback(
    async (code: string): Promise<string | null> => {
      const r = await pairAction(code).catch(() => null);
      if (!r) return t(displayErrorKey("INTERNAL"));
      if (!r.ok) return t(displayErrorKey(r.code));
      const first = await readAction({}).catch(() => null);
      if (first && first.ok && first.changed) {
        verRef.current = first.ver;
        setView(first.view);
        firstDelay.current = first.nextPollMs;
      }
      setPaired(true);
      return null;
    },
    [pairAction, readAction, t],
  );

  const fullBtn = !fs && (
    <button
      data-testid="pos-display-fullscreen"
      type="button"
      className="btn btn-ghost absolute right-3 top-3 z-10 h-11 rounded-[11px] px-4 text-[13px] text-[color:var(--color-muted)]"
      onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}
    >
      {t("screen.fullscreen")}
    </button>
  );

  return (
    <div
      id="pos-display-app"
      data-testid="pos-display"
      data-phase={paired ? (view?.phase ?? "idle") : "pair"}
      className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[color:var(--color-surface)] text-[color:var(--color-ink)]"
    >
      {fullBtn}
      {offline && (
        <div data-testid="pos-display-offline" role="status" className="absolute left-3 top-3 z-10 rounded-[8px] border bg-[color:var(--color-surface)] px-3 py-1.5 text-[12.5px] text-[color:var(--color-danger)]">
          {t("screen.offline")}
        </div>
      )}
      {!paired ? (
        <PairPanel t={t} prefill={prefillCode} submitCode={pairWith} />
      ) : !view || view.phase === "idle" ? (
        view ? <IdlePane view={view} t={t} /> : <div className="flex-1" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex min-h-0 flex-col border-[color:var(--color-line)] md:w-[60%] md:border-r">
            <BillPane view={view} t={t} />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-[color:var(--color-surface-2)] px-7 py-7 xl:px-9 xl:py-[34px]">
            <PayPane view={view} t={t} />
          </div>
        </div>
      )}
    </div>
  );
}
