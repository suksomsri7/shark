"use client";

// QrCart.tsx — ตะกร้าของแขก (โต๊ะ / สั่งล่วงหน้า) · POS P2.7U
//   บรรทัด = ชื่อ + ตัวเลือก + หมายเหตุ + จำนวน (−/+) · ราคาบรรทัด/รวม/ค่าบริการ = quote ของเซิร์ฟเวอร์ (quoteTableCartAction / quotePreorderCartAction)
//   ระหว่างรอ quote = "…" · คำปฏิเสธที่มี lineIndex = บรรทัดนั้นขอบแดง + ข้อความ · ปุ่มท้าย (ส่งครัว / ไปกรอกข้อมูล) มาจากผู้เรียก
//   🔴 ไม่มีข้อความไทยนอก t() · ไม่มีการคิดเงิน

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { QR_MAX_QTY, type QrQuoteResult } from "@/lib/modules/pos/qr-order-shared";
import { QrQtyStepper } from "./QrMenu";
import { qrBaht, type QrCartItem } from "./qr-ui";

export type QrQuoteOk = Extract<QrQuoteResult, { ok: true }>;

export function QrCartBody(p: {
  cart: readonly QrCartItem[];
  quote: QrQuoteOk | null;
  quoting: boolean;
  errorIndex: number | null;
  error: string | null;
  serviceNote?: string | null;
  onQty: (key: string, qty: number) => void;
  footer: ReactNode;
}) {
  const t = useTranslations("pos.qr");
  const fresh = !!p.quote && p.quote.lines.length === p.cart.length;
  if (!p.cart.length)
    return (
      <div data-testid="pos-qr-cart" data-empty="1" className="flex flex-col gap-2 px-4 py-6 text-center text-[14px] text-[color:var(--color-muted)]">
        <p>{t("cart.empty")}</p>
      </div>
    );
  return (
    <div data-testid="pos-qr-cart" className="flex min-w-0 flex-col">
      <ul className="flex flex-col divide-y">
        {p.cart.map((c, i) => {
          const q = fresh ? p.quote!.lines[i] : undefined;
          return (
            <li key={c.key} data-testid="pos-qr-cart-line" data-bad={p.errorIndex === i ? "1" : "0"} className={`flex items-start gap-3 px-4 py-3 ${p.errorIndex === i ? "bg-[color:var(--color-surface-2)] outline outline-1 outline-[color:var(--color-danger)]" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[14.5px] font-semibold">{c.name}</p>
                {c.options.length ? <p className="break-words text-[12.5px] text-[color:var(--color-muted)]">{c.options.join(" · ")}</p> : null}
                {c.note ? <p className="break-words text-[12.5px] text-[color:var(--color-muted)]">{t("cart.noteLine", { note: c.note })}</p> : null}
                <p className="mt-1 text-[13.5px] tabular-nums text-[color:var(--color-ink-soft)]">{q ? qrBaht(q.lineTotalSatang) : "…"}</p>
              </div>
              <QrQtyStepper value={c.qty} min={0} onValue={(n) => p.onQty(c.key, Math.min(QR_MAX_QTY, n))} testid={`pos-qr-cart-qty-${i}`} />
            </li>
          );
        })}
      </ul>
      {p.error ? (
        <p data-testid="pos-qr-cart-error" role="alert" className="mx-4 mt-2 rounded-[10px] border border-[color:var(--color-danger)] px-3 py-2 text-[13px] text-[color:var(--color-danger)]">
          {p.error}
        </p>
      ) : null}
      <dl className="mx-4 mt-3 flex flex-col gap-1 border-t pt-3 text-[13.5px] tabular-nums">
        {fresh && p.quote!.serviceChargeSatang ? (
          <>
            <div className="flex justify-between text-[color:var(--color-ink-soft)]">
              <dt>{t("common.subtotal")}</dt>
              <dd>{qrBaht(p.quote!.subtotalSatang)}</dd>
            </div>
            <div className="flex justify-between text-[color:var(--color-ink-soft)]">
              <dt>{t("common.serviceCharge")}</dt>
              <dd>{qrBaht(p.quote!.serviceChargeSatang ?? 0)}</dd>
            </div>
          </>
        ) : null}
        <div data-testid="pos-qr-cart-total" className="flex justify-between pt-1 text-[17px] font-bold">
          <dt>{t("common.total")}</dt>
          <dd>{fresh ? qrBaht(p.quote!.totalSatang) : p.quoting ? "…" : "–"}</dd>
        </div>
        {p.serviceNote ? <p className="text-[11.5px] text-[color:var(--color-muted)]">{p.serviceNote}</p> : null}
      </dl>
      <div className="px-4 pb-4 pt-3">{p.footer}</div>
    </div>
  );
}

/** แผ่นล่าง (มือถือ/iPad แนวตั้ง) — ปิดด้วยฉากหลัง/Esc/ปุ่ม × */
export function QrBottomPanel(p: { testid: string; title: string; onClose: () => void; children: ReactNode }) {
  const t = useTranslations("pos.qr");
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div aria-hidden="true" data-testid="pos-qr-sheet-backdrop" className="absolute inset-0 bg-black/40" onClick={p.onClose} />
      <div role="dialog" aria-modal="true" aria-label={p.title} data-testid={p.testid} className="relative flex max-h-[88dvh] w-full max-w-[480px] flex-col rounded-t-[20px] bg-[color:var(--color-surface)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <h2 className="text-[16px] font-bold">{p.title}</h2>
          <button type="button" data-testid="pos-qr-sheet-close" aria-label={t("common.close")} className="grid size-11 place-items-center rounded-full border text-[18px]" onClick={p.onClose}>
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{p.children}</div>
      </div>
    </div>
  );
}

/** แถบตะกร้าลอยท้ายจอ (มีของในตะกร้า) */
export function QrCartBar(p: { count: number; total: string; label: string; onOpen: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      <button type="button" data-testid="pos-qr-cart-bar" className="pointer-events-auto flex h-14 w-full max-w-[448px] items-center gap-3 rounded-[16px] bg-[color:var(--color-ink)] px-5 text-[15px] font-bold text-[color:var(--color-surface)] shadow-xl" onClick={p.onOpen}>
        <span className="grid h-7 min-w-7 place-items-center rounded-full bg-[color:var(--color-surface)] px-1.5 text-[13px] text-[color:var(--color-ink)]">{p.count}</span>
        <span className="min-w-0 flex-1 truncate text-left">{p.label}</span>
        <span className="tabular-nums">{p.total}</span>
      </button>
    </div>
  );
}
