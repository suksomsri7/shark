"use client";

// PrintStatus.tsx — ผลการพิมพ์ในบรรทัด (POS P1.10 U): ส่งพิมพ์แล้ว · คำปฏิเสธ (คีย์ pos.print.errors.<code>) + "พิมพ์ซ้ำ" + "พิมพ์ผ่านระบบแทน"
//   (ทางสำรองเบราว์เซอร์เมื่อพิมพ์ตรงไม่ได้ — UNSUPPORTED บน iOS Safari / ยังไม่จับคู่) · ใช้ร่วม: ตั้งค่า 17A/17B · PayDone · หน้ากะ

import { useTranslations } from "next-intl";
import { printErrorKey, type PrintResult } from "./types";

type Props = { result: PrintResult | null; onRetry?: () => void; onBrowser?: () => void; title?: string };

export function PrintStatus({ result, onRetry, onBrowser, title }: Props) {
  const t = useTranslations("pos.print");
  if (!result) return null;
  if (result.ok)
    return (
      <p data-testid="pos-print-sent" role="status" className="text-[13.5px] text-[color:var(--color-ink-soft)]">
        {t("sent")}
      </p>
    );
  const fallback = result.via !== "browser" && (result.code === "UNSUPPORTED" || result.code === "NO_DEVICE") && onBrowser;
  return (
    <div data-testid="pos-print-error" role="alert" className="flex flex-wrap items-center gap-2 rounded-[13px] border-[1.5px] border-[color:var(--color-danger)] px-4 py-2 text-left text-[13.5px]">
      <span className="min-w-0 flex-1">
        {title ? <b className="mr-1">{title}</b> : null}
        {t(printErrorKey(result.code))}
      </span>
      {onRetry && (
        <button data-testid="pos-print-retry" type="button" className="btn btn-ghost h-11 rounded-[11px] px-4 text-[14px]" onClick={onRetry}>
          {t("retry")}
        </button>
      )}
      {fallback && (
        <button data-testid="pos-print-browser" type="button" className="btn btn-ghost h-11 rounded-[11px] px-4 text-[14px]" onClick={onBrowser}>
          {t("useBrowser")}
        </button>
      )}
    </div>
  );
}
