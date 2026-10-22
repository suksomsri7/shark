"use client";

// QrOrderStatusApp.tsx — หน้าสถานะออเดอร์สั่งล่วงหน้า /q/o/<orderToken> (POS P2.7U · §1 c · S2 S3 S5 · มติ 3 4 11 · 19ค) — เกาะ client ของหน้า server
//   รอจ่าย (PENDING_PAYMENT): ยอด + QR ของใบขอรับเงินเดียวกัน (ยอด/หมดเวลาเดียว) + นับถอยหลังถึง payBy · QR นิ่ง = ปุ่ม "โอนแล้ว" (บันทึกอย่างเดียว ไม่มีผลเงิน) ·
//   Beam = ยืนยันอัตโนมัติ · แจ้งแล้ว (claimed) · ได้รับเงิน (PREPAID) · ร้านรับ/กำลังเตรียม (+ พร้อมรับประมาณ hh:mm) · พร้อมรับ · รับแล้ว ·
//   หมดเวลา (19ค: PromptPay ยังไม่ได้รับเงิน · ลองใหม่ · เลือกวิธีอื่น · ยืนยันเอง) · ร้านปฏิเสธ / ยกเลิก (+ คืนเงินภายหลัง) · ลิงก์ใบเสร็จเมื่อบิลเกิดแล้ว
//   โพล orderStatus ทุก 5 วิ ด้วย sinceVer (อ่านอย่างเดียว · เลยเวลาจ่าย = ปิดครั้งเดียวที่เซิร์ฟเวอร์) · แท็บซ่อน = หยุด · ปิดแล้ว = หยุดโพล
//   🔴 ไม่มีข้อความไทยนอก t() (ST7) · actions มาทาง props · เวลา/ตัวนับวาดหลัง mount (HF-418) · เบอร์แบบปิดบังเท่านั้น

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { QR_STATUS_POLL_MS, type QrOkResult, type QrOrderStatusResult, type QrOrderStatusView } from "@/lib/modules/pos/qr-order-shared";
import { QrCodeImage } from "./QrCodeImage";
import { useServerNow, useToast, useVisiblePoll } from "./use-qr"; // POS P2.7U fix1 ▸ F3: useServerNow แทน useNow ◂
import { bkkHm, mmss, qrBaht, secondsLeft, type QrLocale } from "./qr-ui";

export type QrOrderStatusActions = {
  status: (orderToken: string, sinceVer?: string) => Promise<QrOrderStatusResult>;
  claim: (orderToken: string) => Promise<QrOkResult>;
};

/** สถานะที่หน้าแสดง (ลำดับตัดสินเดียวกับหน้า S) */
export type QrOrderPhase = "pay" | "claimed" | "paid" | "accepted" | "preparing" | "ready" | "handed" | "expired" | "rejected" | "cancelled";
export function orderPhaseOf(v: QrOrderStatusView): QrOrderPhase {
  if (v.closedReason === "PAYMENT_EXPIRED") return "expired";
  if (v.status === "REJECTED") return "rejected";
  if (v.status === "CANCELLED") return "cancelled";
  if (v.status === "HANDED") return "handed";
  if (v.status === "READY") return "ready";
  if (v.status === "PREPARING") return "preparing";
  if (v.status === "ACCEPTED") return "accepted";
  if (v.paymentState === "PENDING_PAYMENT") return v.claimedAt ? "claimed" : "pay";
  return "paid";
}
const TERMINAL: ReadonlySet<QrOrderPhase> = new Set(["handed", "expired", "rejected", "cancelled"]);
const STEPS = ["pay", "accept", "prepare", "ready"] as const;
const stepOf = (ph: QrOrderPhase): number => (ph === "pay" || ph === "claimed" ? 0 : ph === "paid" ? 1 : ph === "accepted" || ph === "preparing" ? 2 : ph === "ready" || ph === "handed" ? 3 : -1);

export function QrOrderStatusApp(p: { token: string; locale: QrLocale; initial: QrOrderStatusView; ver: string; notice: string | null; actions: QrOrderStatusActions }) {
  const t = useTranslations("pos.qr");
  const tk = useTranslations();
  const [v, setV] = useState<QrOrderStatusView>(p.initial);
  const ver = useRef(p.ver);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();
  const now = useServerNow(v.serverNow, 1000); // POS P2.7U fix1 ▸ F3 ◂
  const phase = orderPhaseOf(v);
  const [gone, setGone] = useState(false); // POS P5.2 ▸ fix3 A2: TOKEN_INVALID = stop polling (stale tab must not fill the per-IP miss budget) ◂
  const poll = useVisiblePoll(
    async () => {
      const r = await p.actions.status(p.token, ver.current);
      if (!r.ok && r.code === "TOKEN_INVALID") return setGone(true); // POS P5.2 ▸ fix3 A2 ◂
      if (r.ok) {
        ver.current = r.ver;
        if (r.changed) setV(r.view);
      }
    },
    QR_STATUS_POLL_MS,
    !TERMINAL.has(phase) && !gone, // POS P5.2 ▸ fix3 A2 ◂
  );
  useEffect(() => {
    if (p.notice) show(tk(`pos.${p.notice}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวตอน mount
  }, []);
  const left = v.pay && (phase === "pay" || phase === "claimed") && now !== null ? secondsLeft(v.pay.expiresAt, now) : null;
  // หมดเวลาบนเครื่อง = อ่านทันที (เซิร์ฟเวอร์ปิดออเดอร์ครั้งเดียว)
  const askedAtZero = useRef(false);
  useEffect(() => {
    if (left === 0 && !askedAtZero.current) {
      askedAtZero.current = true;
      void poll();
    }
  }, [left, poll]);
  const claim = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await p.actions.claim(p.token);
      if (r.ok) {
        show(t("status.claimed"));
        await poll();
      } else {
        show(tk(`pos.${r.messageKey}`), "danger");
        await poll();
      }
    } catch {
      show(tk("pos.qr.errors.internal"), "danger");
    } finally {
      setBusy(false);
    }
  }, [busy, p.actions, p.token, poll, show, t, tk]);

  const step = stepOf(phase);
  const head = t(`status.phase.${phase}`);
  const bad = phase === "expired" || phase === "rejected" || phase === "cancelled";
  return (
    <div data-testid="pos-qr-order" data-phase={phase} data-status={v.status} data-payment={v.paymentState} className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-4 md:px-6">
      <section className="flex flex-col gap-1">
        <p className="text-[12.5px] text-[color:var(--color-muted)]">{t("status.title", { code: v.code })}</p>
        <h2 data-testid="pos-qr-order-headline" className={`text-[20px] font-bold leading-snug ${bad ? "text-[color:var(--color-danger)]" : ""}`}>
          {head}
        </h2>
        {phase === "paid" ? <p className="text-[13.5px] text-[color:var(--color-ink-soft)]">{t("status.paidChip", { amount: qrBaht(v.totalSatang) })}</p> : null}
      </section>

      {step >= 0 ? (
        <ol data-testid="pos-qr-order-steps" className="grid grid-cols-4 gap-1.5" aria-label={t("status.stepsLabel")}>
          {STEPS.map((s, i) => (
            <li key={s} data-done={i <= step ? "1" : "0"} className="flex flex-col gap-1">
              <span className={`h-1.5 rounded-full ${i <= step ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]"}`} />
              <span className={`text-[11.5px] leading-tight ${i === step ? "font-bold text-[color:var(--color-ink)]" : "text-[color:var(--color-muted)]"}`}>{t(`status.step.${s}`)}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {(phase === "pay" || phase === "claimed") && v.pay ? (
        <section data-testid="pos-qr-order-pay" className="flex flex-col items-center gap-2 rounded-[16px] border px-4 py-4">
          <p className="text-[13.5px] text-[color:var(--color-ink-soft)]">{t("status.payAmount")}</p>
          <p data-testid="pos-qr-order-amount" className="text-[28px] font-bold tabular-nums">
            {qrBaht(v.pay.amountSatang)}
          </p>
          {v.pay.qrPayload ? (
            <QrCodeImage value={v.pay.qrPayload} size={220} alt={t("status.pay")} fallback={t("common.qrFailed")} testid="pos-qr-order-qr" />
          ) : (
            <p className="text-[13px] text-[color:var(--color-muted)]">{t("status.payNoQr")}</p>
          )}
          <p data-testid="pos-qr-order-countdown" className={`text-[14px] tabular-nums ${left !== null && left < 60 ? "font-bold text-[color:var(--color-danger)]" : "text-[color:var(--color-ink-soft)]"}`}>
            {left !== null ? t("status.payWithin", { time: mmss(left), at: bkkHm(v.pay.expiresAt) }) : ""}
          </p>
          {v.pay.kind === "PROMPTPAY_STATIC" ? (
            phase === "claimed" ? (
              <p data-testid="pos-qr-order-claimed" role="status" className="text-center text-[13.5px] font-semibold">
                {t("status.claimed")}
              </p>
            ) : (
              <button type="button" data-testid="pos-qr-claim" disabled={busy} className="h-12 w-full rounded-[14px] bg-[color:var(--color-ink)] text-[15px] font-bold text-[color:var(--color-surface)] disabled:opacity-50" onClick={() => void claim()}>
                {t("status.claim")}
              </button>
            )
          ) : (
            <p data-testid="pos-qr-order-auto" className="text-center text-[13px] text-[color:var(--color-ink-soft)]">
              {t("status.autoConfirm")}
            </p>
          )}
          <p className="text-center text-[11.5px] text-[color:var(--color-muted)]">{v.pay.kind === "PROMPTPAY_STATIC" ? t("status.claimHint") : t("status.keepOpen")}</p>
        </section>
      ) : null}

      {(phase === "accepted" || phase === "preparing") && v.readyEta ? (
        <p data-testid="pos-qr-order-eta" className="rounded-[14px] bg-[color:var(--color-surface-2)] px-4 py-3 text-[15px]">
          {t("status.readyEtaAt", { time: now !== null ? bkkHm(v.readyEta) : "" })}
        </p>
      ) : null}
      {phase === "ready" ? (
        <p data-testid="pos-qr-order-ready" className="rounded-[14px] border-2 border-[color:var(--color-ink)] px-4 py-4 text-center text-[15px]">
          {t("status.showCode")}
          <span className="mt-1 block text-[30px] font-bold tracking-wider">{v.code}</span>
        </p>
      ) : null}

      {phase === "expired" ? (
        <section data-testid="pos-qr-order-expired" className="flex flex-col gap-2 rounded-[16px] border border-[color:var(--color-danger)] px-4 py-4">
          <p className="text-[14px] text-[color:var(--color-ink-soft)]">{t("status.expiredBody")}</p>
          <ul className="flex flex-col gap-2 text-[14px]">
            <li>
              {v.orderAgainToken ? (
                <a href={`/q/${encodeURIComponent(v.orderAgainToken)}?lang=${p.locale}`} data-testid="pos-qr-order-again" className="flex h-12 items-center justify-center rounded-[14px] bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]">
                  {t("status.expiredRetry")}
                </a>
              ) : (
                // POS P2.7U fix1 ▸ F7: ไม่มีลิงก์เดิมแล้ว (ร้านเปลี่ยน/ปิดลิงก์) = ให้สแกน QR ใหม่ของร้าน · ไม่มีโทเคนในหน้า ◂
                <span data-testid="pos-qr-order-rescan" className="block rounded-[12px] bg-[color:var(--color-surface-2)] px-3 py-2.5">
                  <b>{t("status.expiredRetry")}</b> · {t("status.rescan")}
                </span>
              )}
            </li>
            <li className="rounded-[12px] bg-[color:var(--color-surface-2)] px-3 py-2.5">
              <b>{t("status.expiredOther")}</b> · {t("status.expiredOtherBody")}
            </li>
            <li className="rounded-[12px] bg-[color:var(--color-surface-2)] px-3 py-2.5">
              <b>{t("status.expiredManual")}</b> · {t("status.expiredManualBody", { code: v.code })}
            </li>
          </ul>
        </section>
      ) : null}
      {phase === "rejected" || phase === "cancelled" ? (
        <p data-testid="pos-qr-order-closed" className="rounded-[14px] bg-[color:var(--color-surface-2)] px-4 py-3 text-[14px]">
          {t(phase === "rejected" ? "status.rejectedBody" : "status.cancelledBody")}
        </p>
      ) : null}
      {v.refundPending ? (
        <p data-testid="pos-qr-order-refund" className="rounded-[14px] border px-4 py-3 text-[14px] font-semibold">
          {t("status.refund")}
        </p>
      ) : null}
      {v.receiptToken ? (
        <a href={`/r/${encodeURIComponent(v.receiptToken)}?lang=${p.locale}`} data-testid="pos-qr-order-receipt" className="flex h-12 items-center justify-center rounded-[14px] border text-[14.5px] font-semibold">
          {t("status.receipt")}
        </a>
      ) : null}

      <section data-testid="pos-qr-order-lines" aria-label={t("status.items")} className="rounded-[16px] border px-4 py-3 text-[13.5px]">
        <h3 className="pb-1.5 text-[13px] font-bold text-[color:var(--color-muted)]">{t("status.items")}</h3>
        <ul className="flex flex-col gap-0.5">
          {v.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 tabular-nums text-[color:var(--color-ink-soft)]">
              <span className="min-w-0 break-words">
                {l.qty} × {l.name}
                {l.options.length ? <span className="block text-[12px] text-[color:var(--color-muted)]">{l.options.join(" · ")}</span> : null}
              </span>
              <span className="shrink-0">{qrBaht(l.lineTotalSatang)}</span>
            </li>
          ))}
        </ul>
        <div className="my-2 h-px bg-[color:var(--color-line)]" />
        <div className="flex justify-between text-[17px] font-bold tabular-nums">
          <span>{t("common.total")}</span>
          <span>{qrBaht(v.totalSatang)}</span>
        </div>
        <p className="mt-2 text-[12px] text-[color:var(--color-muted)]">
          {t("status.pickupFor", { name: v.customerName })}
          {v.phoneMasked ? ` · ${v.phoneMasked}` : ""}
        </p>
      </section>
      {toast ? (
        <div data-testid="pos-qr-toast" role="status" aria-live="polite" className={`pointer-events-none fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-[440px] rounded-[14px] px-4 py-3 text-[14px] shadow-xl ${toast.tone === "danger" ? "bg-[color:var(--color-danger)] text-[color:var(--color-surface)]" : "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"}`}>
          {/* POS P2.7U fix1 ▸ IMG-4: ข้อความลอยอยู่ล่าง (เหนือแถบตะกร้า) — ไม่ทับหัวร้าน/ป้ายโต๊ะ ◂ */}
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
