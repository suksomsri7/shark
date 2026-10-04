"use client";

// HeldBillsDrawer.tsx — ลิ้นชัก "บิลที่พัก" (POS P1.5 · ภาพ 14B) · จอ ≥ md = แผงขวา 474 px เต็มสูง · จอ < md = แผ่นล่าง
//   การ์ดต่อบิล: ป้าย (ไม่มี = "บิล HH:MM") · ยอดตอนพัก · N รายการ · เวลาพัก · ผู้พัก · ชื่อรายการย่อ · [เรียกคืน] [ทิ้ง]
//   ทิ้ง = แตะสองครั้ง (ครั้งแรกเปลี่ยนเป็น "ยืนยันทิ้ง" — UI_STANDARD §0.7 ทำลายข้อมูลต้องยืนยัน)
//   ยอดในลิ้นชัก = ยอดตอนพัก (ไว้จำบิล) — ราคาจริงคิดใหม่ตอนเรียกคืนเสมอ (H3)
// 🔴 ปุ่มแถว ≥ 44px (h-12) · testid ตัวอักษรตรงบนแท็ก และ className มาก่อน onClick (ข้อสอบ S3 อ่านแท็กถึง '>' ตัวแรก)

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatThaiTime } from "@/lib/ui/date";
import { moneyText, type HeldCartSummary } from "@/lib/modules/pos/register-shared";
import { RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

export function HeldBillsDialog(p: {
  items: HeldCartSummary[] | null;
  expireDays: number;
  busy: boolean;
  onRecall: (h: HeldCartSummary) => void;
  onDiscard: (h: HeldCartSummary) => void;
  onClose: () => void;
}) {
  const t = useTranslations("pos.register");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const items = p.items ?? [];
  return (
    <RegisterDialog onDismiss={p.onClose}>
      <aside
        data-testid="pos-reg-held-drawer"
        className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-[color:var(--color-surface)] shadow-xl md:fixed md:inset-y-0 md:right-0 md:max-h-none md:w-[474px] md:max-w-full md:rounded-none"
        role="dialog"
        aria-modal="true"
        aria-label={t("held.title")}
      >
        <div className="px-5 pt-2 md:hidden">
          <SheetGrab />
        </div>
        <header className="flex shrink-0 items-center gap-3 border-b px-5 py-3 md:px-7 md:py-[18px]">
          <RegisterIcon name="clock" size={20} />
          <h2 className="text-[19px] font-bold">{t("held.titleCount", { count: items.length })}</h2>
          <span className="text-[13px] text-[color:var(--color-muted)]">{t("held.scope")}</span>
          <span className="flex-1" />
          <button
            data-testid="pos-reg-held-close"
            className="grid size-11 place-items-center rounded-[11px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
            type="button"
            aria-label={t("cart.close")}
            onClick={p.onClose}
          >
            <RegisterIcon name="x" size={18} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5 md:px-7">
          {p.items === null ? (
            <p className="py-10 text-center text-[14.5px] text-[color:var(--color-muted)]">{t("held.loading")}</p>
          ) : items.length === 0 ? (
            <p data-testid="pos-reg-held-empty" className="whitespace-pre-line py-10 text-center text-[14.5px] text-[color:var(--color-muted)]">
              {t("held.empty")}
            </p>
          ) : (
            items.map((h, i) => {
              const time = formatThaiTime(h.createdAt);
              const confirming = confirmId === h.id;
              return (
                <article
                  key={h.id}
                  className={`flex flex-col gap-3 rounded-[18px] bg-[color:var(--color-surface)] p-5 ${i === 0 ? "border-2 border-[color:var(--color-ink)]" : "border"}`}
                >
                  <div className="flex items-start gap-3">
                    <h3 className="min-w-0 flex-1 break-words text-[18px] font-bold">{h.label ?? t("held.untitled", { time })}</h3>
                    <span className="whitespace-nowrap text-[22px] font-bold tabular-nums">{moneyText(h.approxTotalSatang)}</span>
                  </div>
                  <p className="text-[13.5px] text-[color:var(--color-muted)]">
                    {t("held.meta", { count: h.lineCount, time })}
                    {h.heldByName ? ` · ${h.heldByName}` : ""}
                  </p>
                  {h.preview && <p className="rounded-[12px] bg-[color:var(--color-surface-2)] px-3.5 py-3 text-[14px] text-[color:var(--color-ink-soft)]">{h.preview}</p>}
                  <div className="flex gap-2.5">
                    <button
                      data-testid={`pos-reg-held-recall-${h.id}`}
                      className="btn btn-primary h-12 flex-1 gap-2 rounded-[13px] text-[15px]"
                      type="button"
                      disabled={p.busy}
                      onClick={() => p.onRecall(h)}
                    >
                      <RegisterIcon name="arrow" size={14} className="rotate-180" />
                      {t("held.recall")}
                    </button>
                    <button
                      data-testid={`pos-reg-held-discard-${h.id}`}
                      className={`btn btn-ghost h-12 shrink-0 rounded-[13px] px-4 text-[15px] ${confirming ? "text-[color:var(--color-danger)]" : ""}`}
                      type="button"
                      disabled={p.busy}
                      onClick={() => {
                        if (!confirming) return setConfirmId(h.id);
                        setConfirmId(null);
                        p.onDiscard(h);
                      }}
                    >
                      {confirming ? t("held.discardConfirm") : t("held.discard")}
                    </button>
                  </div>
                </article>
              );
            })
          )}
          <p className="flex items-center gap-2 rounded-[12px] border border-dashed px-4 py-3 text-[13px] text-[color:var(--color-muted)]">
            <RegisterIcon name="warn" size={14} />
            {t("held.expiryNote", { days: p.expireDays })}
          </p>
        </div>
      </aside>
    </RegisterDialog>
  );
}
