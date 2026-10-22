"use client";

// CreditOverSheet.tsx — แผ่น "เกินวงเงินวางบิล" (POS P3.6U ▸ CD-P36U-6 · แบบ 13b ของ P3.5U: RegisterDialog + ManagerPinPad ◂)
//   เปิดเมื่อ submit ถูกปฏิเสธ CREDIT_LIMIT_EXCEEDED · บรรทัดตัวเลข (วงเงิน · ค้างอยู่) เฉพาะเมื่อคำปฏิเสธพกตัวเลขมา (ผู้ถือ pos.credit.manage — CD-4)
//   ใส่ PIN ผู้จัดการ ⇒ onPin(managerUserId, pin) — หน้าขายส่งตะกร้าเดิม (คีย์บิลเดิม) พร้อม creditOverride {managerUserId, managerPin}
//   PIN_INVALID = ข้อความเดิมของแป้น · PERMISSION_DENIED = credit.overLimitSelf (ผู้อนุญาต OWNER/MANAGER และไม่ใช่ผู้ขาย — ไม่กรองรายชื่อฝั่งจอ · H4)
// 🔴 PIN ไม่ถูกเก็บ (แป้นล้างทันทีที่ส่ง · หน้าขายตัด creditOverride ออกจากคำขอค้าง/ที่เก็บ) · ไม่มีทางส่งขออนุมัติ (POS_CREDIT_OVER = ใบหลัง)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px

import { useTranslations } from "next-intl";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { ManagerPinPad, type ManagerPinResult } from "./ManagerPinPad";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

export function CreditOverSheet(p: {
  systemId: string;
  unitId: string;
  deviceId?: string;
  limitSatang?: number;
  exposureSatang?: number;
  busy: boolean;
  /** คีย์ข้อความใต้ pos.register ของคำปฏิเสธที่ไม่ใช่เรื่อง PIN (แสดงใต้แป้น) */
  error?: string | null;
  onPin: (managerUserId: string, pin: string) => Promise<ManagerPinResult>;
  onClose: () => void;
}) {
  const t = useTranslations("pos.register");
  const tc = useTranslations("common");
  return (
    <RegisterDialog onDismiss={p.onClose} locked={p.busy}>
      <div data-testid="pos-reg-credit-over" className={`${REG_DIALOG_PANEL} md:w-[620px]`} role="dialog" aria-modal="true" aria-label={t("credit.overLimitTitle")}>
        <SheetGrab />
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[10px] border text-[color:var(--color-danger)]">
            <RegisterIcon name="warn" size={16} />
          </span>
          <h2 className="flex-1 text-[19px] font-bold">{t("credit.overLimitTitle")}</h2>
        </div>
        <p className="text-[14px] text-[color:var(--color-ink-soft)]">{t("credit.overLimitBody")}</p>
        {p.limitSatang !== undefined && (
          <p data-testid="pos-reg-credit-over-figures" className="text-[13.5px] font-semibold tabular-nums">
            {t("credit.overLimitFigures", { limit: moneyText(p.limitSatang), exposure: moneyText(p.exposureSatang ?? 0) })}
          </p>
        )}
        <section className="rounded-[14px] border p-4">
          <ManagerPinPad
            systemId={p.systemId}
            unitId={p.unitId}
            {...(p.deviceId ? { deviceId: p.deviceId } : {})}
            disabled={p.busy}
            onPinEntered={p.onPin}
            messageKeyOf={(code) => (code === "PERMISSION_DENIED" ? "credit.overLimitSelf" : null)}
          />
        </section>
        {p.error && (
          <p data-testid="pos-reg-credit-over-error" role="alert" className="text-[13.5px] font-semibold text-[color:var(--color-danger)]">
            {t(p.error)}
          </p>
        )}
        <button data-testid="pos-reg-credit-over-cancel" type="button" disabled={p.busy} className="btn btn-ghost h-11 rounded-[13px] text-[14px]" onClick={p.onClose}>
          {tc("cancel")}
        </button>
      </div>
    </RegisterDialog>
  );
}
