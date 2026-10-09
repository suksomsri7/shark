"use client";

// LocaleChooser.tsx — ตัวสลับภาษาแอป TH | EN (POS P1.18U · มติ 8 · เจ้าของ O10 (ก)) — วางที่แถบบนของหน้าขาย (ข้างชิปออนไลน์/กะ) และการ์ด "ภาษาของแอป" ในแท็บทั่วไป
//   กด = setUiLocaleAction (คุกกี้ LOCALE + lang · CD5) แล้ว router.refresh() ⇒ ทั้งจอวาดใหม่ด้วย messages ของภาษาใหม่
//   compact = แถบบน (สูง 56) — ข้อความล้มเป็น sr-only + ขอบแดง (ไม่ดันความสูงแถบ) · ปุ่มละ ≥ 44px · ป้าย "TH"/"EN" เป็นรหัสภาษาสากล (ไม่แปล) · ชื่อเต็มอยู่ใน aria-label (ผ่าน t)
// 🔴 ไม่เขียน DB · ล้ม = ข้อความใต้ปุ่ม (คีย์ pos.settings.locale.failed) ไม่โยน

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setUiLocaleAction } from "@/i18n/locale-actions";

export function LocaleChooser({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("pos.settings.locale");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = async (next: "th" | "en") => {
    if (next === locale || busy || pending) return;
    setBusy(true);
    setFailed(false);
    try {
      const r = await setUiLocaleAction({ locale: next });
      if (r.ok) startTransition(() => router.refresh());
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const seg = (on: boolean) =>
    `grid min-h-11 min-w-11 place-items-center rounded-[8px] px-2.5 font-semibold transition-colors disabled:opacity-60 ${compact ? "text-[12.5px]" : "text-[14px]"} ${
      on ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
    }`;
  return (
    <span className="inline-flex shrink-0 flex-col items-start gap-1">
      <span data-testid="pos-locale-switch" role="group" aria-label={t("label")} aria-busy={busy || pending} className={`inline-flex shrink-0 items-center gap-0.5 rounded-[10px] border bg-[color:var(--color-surface)] p-0.5 ${failed ? "border-[color:var(--color-danger)]" : ""}`}>
        <button data-testid="pos-locale-switch-th" type="button" aria-pressed={locale === "th"} aria-label={t("th")} disabled={busy || pending} className={seg(locale === "th")} onClick={() => void set("th")}>
          TH
        </button>
        <button data-testid="pos-locale-switch-en" type="button" aria-pressed={locale === "en"} aria-label={t("en")} disabled={busy || pending} className={seg(locale === "en")} onClick={() => void set("en")}>
          EN
        </button>
      </span>
      {failed && (
        <span data-testid="pos-locale-switch-error" role="alert" className={compact ? "sr-only" : "text-[12px] text-[color:var(--color-danger)]"}>
          {t("failed")}
        </span>
      )}
    </span>
  );
}
