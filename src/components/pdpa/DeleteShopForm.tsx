"use client";

// ACC T4.5 ▸ ขอลบร้าน: คำเตือนหน้าที่เก็บเอกสาร (กล่องกลาง LegalWarnings) + ติ๊กรับทราบ → ส่งรหัสที่ยืนยันไปกับกล่องยืนยัน (ไม่บล็อก) ◂
import { useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import type { LegalWarning } from "@/lib/core/settings/legal/warnings";

export function DeleteShopForm({ warnings, detail, action }: { warnings: LegalWarning[]; detail: string; action: (formData: FormData) => void | Promise<void> }) {
  const [codes, setCodes] = useState<string[]>([]);
  const needAck = warnings.some((w) => w.ack);
  return (
    <div className="flex flex-col gap-3" data-testid="privacy-delete-form">
      {warnings.length > 0 && <LegalWarnings warnings={warnings} onAckChange={setCodes} testId="privacy-delete-warnings" />}
      {needAck && codes.length === 0 ? (
        <p className="text-xs text-[color:var(--color-muted)]" data-testid="privacy-delete-need-ack">
          ติ๊ก &quot;รับทราบคำเตือนและทำต่อ&quot; ก่อนขอลบร้าน
        </p>
      ) : (
        <ConfirmDialog
          triggerLabel="ขอลบร้านถาวร"
          triggerClassName="btn btn-ghost text-sm"
          danger
          title="ขอลบร้านนี้ถาวร?"
          detail={detail}
          confirmLabel="ยืนยัน ขอลบร้าน"
          action={action}
          fields={{ acks: [...new Set(codes)].join(",") }}
          testId="privacy-delete"
        />
      )}
    </div>
  );
}
