"use client";

// SlipSettingsCard.tsx — POS P3-SKEL U ▸ CD-SKELU-5: การ์ด "สลิปโอน" ในแท็บวิธีรับเงิน (ภาพ 10 แถว "โอนธนาคาร แนบสลิป · ตรวจสลิปอัตโนมัติ") — ต่อท้ายการ์ด Beam
//   แถว 1 "แนบสลิปโอน" ใช้งานได้ (จอชำระ โอนเงิน + พร้อมเพย์แบบคงที่ · ลิ้นชักบิล) · แถว 2 อายุเก็บ = ค่าที่อ่านจาก slipRetentionDaysOf (หน้าเพจส่ง · อ่านอย่างเดียว · W19)
//   แถว 3 "ตรวจสลิปอัตโนมัติ · รอผู้ให้บริการ" + ปุ่มตั้งค่า (ผู้ถือ pos.settings.payment) → แผ่นเลือกผู้ให้บริการ (SlipOK / EasySlip · ไม่เลือกให้ — W20) + การ์ด credentials SLIP_VERIFY
// 🔴 ไม่มีตัวเขียนอายุเก็บ (ลดค่า = ไฟล์สลิปเดิมถูกลบภายในชั่วโมง — fix1 H4 · รอ W19) · ไม่แสดง purgeAfter รายใบ · การ์ด Beam ไม่เปลี่ยน
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RegisterDialog, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { CardHead, Chip, SettingsCard } from "./settings-ui";
import { IntegrationCredsCard } from "./IntegrationCredsCard";

export type ProviderOption = { code: string; label: string };

type Props = {
  systemId: string;
  unitId: string;
  /** อายุเก็บสลิปที่มีผล (slipRetentionDaysOf ฝั่งหน้า · ค่าปริยาย 1,825) */
  retentionDays: number;
  /** ผู้ถือ pos.settings.payment ที่สาขานี้ (อ่าน/ตั้ง credentials ตรวจสลิป — เซิร์ฟเวอร์ตรวจซ้ำ) */
  canVerify: boolean;
  isOwner: boolean;
  /** ผู้ให้บริการตรวจสลิปจากทะเบียน (ชื่อแบรนด์) */
  providers: ProviderOption[];
};

export function SlipSettingsCard({ systemId, unitId, retentionDays, canVerify, isOwner, providers }: Props) {
  const t = useTranslations("pos.platform");
  const [open, setOpen] = useState(false);
  const row = "flex items-start gap-4 border-t py-[14px] text-[15px] first:border-t-0";
  return (
    <SettingsCard testid="pos-settings-slip-card">
      <CardHead icon="bank" title={t("slip.card")} />
      <div className="flex flex-col">
        <div className={row}>
          <div className="min-w-0 flex-1">
            <b className="block font-semibold">{t("slip.attachLive")}</b>
            <small className="block text-[12.5px] text-[color:var(--color-muted)]">{t("slip.attachLiveHelp")}</small>
          </div>
          <Chip tone="accent">{t("slip.live")}</Chip>
        </div>
        <div className={row}>
          <div className="min-w-0 flex-1">
            <b className="block font-semibold">{t("slip.retentionLabel")}</b>
            <small className="block text-[12.5px] text-[color:var(--color-muted)]">{t("slip.retentionHelp")}</small>
          </div>
          <span data-testid="pos-settings-slip-retention" className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-[9px] border px-3 text-[13px] font-semibold tabular-nums">
            {t("slip.retention", { days: retentionDays.toLocaleString("en-US") })}
          </span>
        </div>
        <div className={row}>
          <div className="min-w-0 flex-1">
            <b className="block font-semibold">{t("slip.autoVerifyPending")}</b>
            <small className="block text-[12.5px] text-[color:var(--color-muted)]">{canVerify ? t("slip.verifyHelp") : t("slip.verifyNoRight")}</small>
          </div>
          {canVerify ? (
            <button data-testid="pos-settings-slip-verify-open" type="button" className="btn btn-ghost min-h-11 shrink-0 rounded-[11px] px-4 text-[14px]" onClick={() => setOpen(true)}>
              {t("slip.verifyOpen")}
            </button>
          ) : null}
        </div>
      </div>
      {open && <SlipVerifyPane systemId={systemId} unitId={unitId} isOwner={isOwner} providers={providers} onClose={() => setOpen(false)} />}
    </SettingsCard>
  );
}

/** แผ่นตรวจสลิปอัตโนมัติ: เลือกผู้ให้บริการ (ไม่เลือกให้) → การ์ด credentials SLIP_VERIFY */
function SlipVerifyPane({ systemId, unitId, isOwner, providers, onClose }: { systemId: string; unitId: string; isOwner: boolean; providers: ProviderOption[]; onClose: () => void }) {
  const t = useTranslations("pos.platform");
  const [provider, setProvider] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <RegisterDialog onDismiss={onClose}>
      <aside
        data-testid="pos-settings-slip-verify-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("slip.verifyTitle")}
        className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-[color:var(--color-surface)] shadow-xl md:fixed md:inset-y-0 md:right-0 md:max-h-none md:w-[474px] md:max-w-full md:rounded-none"
      >
        <div className="px-5 pt-2 md:hidden">
          <SheetGrab />
        </div>
        <header className="flex shrink-0 items-center gap-3 border-b px-5 py-3 md:px-7 md:py-[18px]">
          <RegisterIcon name="bank" size={20} />
          <h2 className="min-w-0 flex-1 truncate text-[19px] font-bold">{t("slip.verifyTitle")}</h2>
          <button data-testid="pos-settings-slip-verify-close" type="button" className="grid size-11 shrink-0 place-items-center rounded-[11px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]" aria-label={t("creds.close")} onClick={onClose}>
            <RegisterIcon name="x" size={18} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5 md:px-7">
          <p className="text-[13px] text-[color:var(--color-ink-soft)]">{t("slip.verifyHelp")}</p>
          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{t("creds.provider")}</span>
            <select data-testid="pos-settings-slip-verify-provider" className="input h-12 rounded-[13px] px-3 text-[15px]" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="">{t("creds.providerPick")}</option>
              {providers.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
            {!provider && <small className="text-[12.5px] text-[color:var(--color-muted)]">{t("creds.providerHelp")}</small>}
          </label>
          {provider ? <IntegrationCredsCard key={provider} systemId={systemId} unitId={unitId} kind="SLIP_VERIFY" provider={provider} isOwner={isOwner} /> : null}
        </div>
      </aside>
    </RegisterDialog>
  );
}
