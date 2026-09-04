"use client";

// LedgerActiveToggle — สวิตช์ "เปิดใช้งาน" ของบัญชีในผังบัญชี (WO 6.1 · SPEC §11.1 · มุมขวาบนของ f8)
// ปิดได้เฉพาะบัญชีที่ยังไม่ถูกใช้และไม่ใช่บัญชีระบบ — ปิดไม่ได้ = สวิตช์จาง + บอกเหตุผลเป็นภาษาคน
// (กติกาเดียวกับฝั่ง server `setLedgerActive` — ที่นี่แค่กันคลิกเปล่า ไม่ใช่ด่านความปลอดภัย)

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLedgerActiveAction } from "@/app/app/sys/[id]/account/accounts/actions";

export function LedgerActiveToggle({
  systemId,
  ledgerId,
  active,
  blockReason,
}: {
  systemId: string;
  ledgerId: string;
  active: boolean;
  /** null = ปิดใช้งานได้ · ไม่ null = ปิดไม่ได้ พร้อมเหตุผลไทย */
  blockReason: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const disabled = active && !!blockReason;

  function onClick() {
    if (pending) return;
    if (disabled) {
      setError(blockReason ?? "");
      return;
    }
    setError("");
    start(async () => {
      const res = await setLedgerActiveAction(systemId, ledgerId, !active);
      if (!res.ok) setError(res.reason);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-sm text-[color:var(--color-muted)]">เปิดใช้งาน</span>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label="เปิดใช้งานบัญชีนี้"
          onClick={onClick}
          disabled={pending}
          data-testid="coa-active-toggle"
          className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
            disabled ? "opacity-50" : ""
          }`}
          style={{
            borderColor: "var(--color-line)",
            background: active ? "var(--color-ink)" : "var(--color-surface-2)",
          }}
        >
          <span
            className="absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all"
            style={{
              background: "var(--color-surface)",
              height: "1.125rem",
              width: "1.125rem",
              left: active ? "calc(100% - 1.375rem)" : "0.25rem",
              boxShadow: "0 1px 2px rgba(10,10,10,.3)",
            }}
          />
        </button>
      </div>
      {error && (
        <p className="max-w-xs text-right text-xs text-[color:var(--color-danger)]" data-testid="coa-active-error">
          {error}
        </p>
      )}
    </div>
  );
}

export default LedgerActiveToggle;
