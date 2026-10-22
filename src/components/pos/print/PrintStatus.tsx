"use client";

// PrintStatus.tsx — ผลการพิมพ์ในบรรทัด (POS P1.10 U): ส่งพิมพ์แล้ว · คำปฏิเสธ (คีย์ pos.print.errors.<code>) + "พิมพ์ซ้ำ" + "พิมพ์ผ่านระบบแทน"
//   (ทางสำรองเบราว์เซอร์เมื่อพิมพ์ตรงไม่ได้ — UNSUPPORTED บน iOS Safari / ยังไม่จับคู่) · ใช้ร่วม: ตั้งค่า 17A/17B · PayDone · หน้ากะ

import { useTranslations } from "next-intl";
import { printErrorKey, type PrintResult } from "./types";
import { lanMessageKey } from "./lan"; // POS P3-SKEL U ▸ CD-SKELU-9 ◂

type Props = {
  result: PrintResult | null;
  onRetry?: () => void;
  onBrowser?: () => void;
  title?: string;
  /** POS P2.14 ▸ UI-1 (19ค): "toast" = พิมพ์ไม่สำเร็จเป็นแถบดำลอยล่างกลาง (ปุ่มลองใหม่/พิมพ์ผ่านเบราว์เซอร์ในแถบ) · ปริยาย "card" = การ์ดในบรรทัด (เดิม) ◂ */
  variant?: "card" | "toast";
};

export function PrintStatus({ result, onRetry, onBrowser, title, variant = "card" /* POS P2.14 ▸ UI-1 ◂ */ }: Props) {
  const t = useTranslations("pos.print");
  const tpl = useTranslations("pos.platform"); // POS P3-SKEL U ▸ CD-SKELU-9 ◂
  if (!result) return null;
  // POS P3-SKEL U ▸ CD-SKELU-9: ทาง LAN สำเร็จ = "ส่งเข้าคิวแล้ว" (ไม่ใช่ "ส่งพิมพ์แล้ว" — W5) ◂
  if (result.ok && result.via === "lan")
    return (
      <p data-testid="pos-print-queued" role="status" className="text-[13.5px] text-[color:var(--color-ink-soft)]">
        {tpl("print.queued")}
      </p>
    );
  if (result.ok)
    return (
      <p data-testid="pos-print-sent" role="status" className="text-[13.5px] text-[color:var(--color-ink-soft)]">
        {t("sent")}
      </p>
    );
  const fallback = result.via !== "browser" && (result.code === "UNSUPPORTED" || result.code === "NO_DEVICE") && onBrowser;
  const reason = result.via === "lan" && result.lanCode ? tpl(lanMessageKey(result.lanCode)) : t(printErrorKey(result.code)); // POS P3-SKEL U ▸ CD-SKELU-9 ◂
  // POS P2.14 ▸ UI-1 (19ค): แถบดำล่างกลาง (พื้นหมึก · ตัวพื้นผิว 14 · มุม 16 · ระยะ 14/18) — testid เดิม ◂
  if (variant === "toast")
    return (
      <div
        data-testid="pos-print-error"
        data-variant="toast"
        role="alert"
        className="fixed inset-x-0 bottom-4 z-[70] mx-auto flex w-[min(560px,calc(100%-24px))] flex-wrap items-center gap-2 rounded-[16px] bg-[color:var(--color-ink)] px-[18px] py-[14px] text-left text-[14px] text-[color:var(--color-surface)] shadow-lg"
      >
        <span className="min-w-0 flex-1">
          {title ? <b className="mr-1">{title}</b> : null}
          {t("failedToast")} — {reason /* POS P3-SKEL U ◂ */}
        </span>
        {onRetry && (
          <button data-testid="pos-print-retry" type="button" className="h-11 rounded-[11px] px-3 text-[14px] font-bold underline-offset-2 hover:underline" onClick={onRetry}>
            {t("retry")}
          </button>
        )}
        {fallback && (
          <button data-testid="pos-print-browser" type="button" className="h-11 rounded-[11px] px-3 text-[14px] font-bold underline-offset-2 hover:underline" onClick={onBrowser}>
            {t("useBrowser")}
          </button>
        )}
      </div>
    );
  return (
    <div data-testid="pos-print-error" role="alert" className="flex flex-wrap items-center gap-2 rounded-[13px] border-[1.5px] border-[color:var(--color-danger)] px-4 py-2 text-left text-[13.5px]">
      <span className="min-w-0 flex-1">
        {title ? <b className="mr-1">{title}</b> : null}
        {reason /* POS P3-SKEL U ◂ */}
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
