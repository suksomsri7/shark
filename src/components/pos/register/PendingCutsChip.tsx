"use client";

// PendingCutsChip.tsx — ชิปหัวจอ "ตัดสต็อกค้าง N บิล · ลองอีกครั้ง" (POS P2.3U ▸ มติ 5 · สัญญา P2.3 S fix รอบ 1 F2)
//   แสดงเมื่อ registerStatus().pendingStockCount > 0 (บิลวันนี้ของสาขาที่ตัดสต็อกไม่สำเร็จ) · ปุ่ม "ลองอีกครั้ง" เฉพาะผู้มี pos.settings.manage
//   (เจ้าของ/ผู้จัดการ) — แคชเชียร์เห็นจำนวนอย่างเดียว · กด = retryPendingStockCutsAction (ผู้เรียก RegisterScreen แจ้งผล/คำปฏิเสธ)
// 🔴 HF-418: ไม่มีข้อความเวลา (ไม่ต้องรอ mount) · ไม่มีข้อความไทยนอกคอมเมนต์ · ปุ่ม ≥ 44px · testid ตัวอักษรตรงบนแท็กและตามด้วย className ทันที

import { useTranslations } from "next-intl";
import { RegisterIcon } from "./RegisterIcon";

export function PendingCutsChip({ count, canRetry, busy, onRetry }: { count: number; canRetry: boolean; busy: boolean; onRetry: () => void }) {
  const t = useTranslations("pos.recipe");
  return (
    <div className="flex shrink-0 items-center border-b px-5 py-1.5">
      <span data-testid="pos-reg-pending-cuts" className="inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[13px] text-[color:var(--color-ink-soft)]" role="status">
        <RegisterIcon name="warn" size={14} />
        <span className="tabular-nums">{t("pendingStockCuts", { n: count })}</span>
        {canRetry ? (
          <>
            <span aria-hidden className="text-[color:var(--color-muted)]">
              ·
            </span>
            <button data-testid="pos-reg-pending-cuts-retry" className="-my-1 inline-flex h-11 items-center px-1 font-semibold text-[color:var(--color-accent)] disabled:opacity-50" type="button" disabled={busy} onClick={onRetry}>
              {t("retryStockCuts")}
            </button>
          </>
        ) : null}
      </span>
    </div>
  );
}
