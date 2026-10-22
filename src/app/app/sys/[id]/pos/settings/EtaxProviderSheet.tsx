"use client";

// EtaxProviderSheet.tsx — POS P3-SKEL U ▸ CD-SKELU-8: แผ่น "e-Tax Invoice ทางอีเมล" จากแถว e-Tax ของแท็บการเชื่อมต่อ SHARK (ปุ่ม "สมัคร")
//   เลือกผู้ให้บริการ (INET / Leceipt จากทะเบียน · ไม่เลือกให้ — W20) → การ์ด credentials ETAX (อ่าน = pos.settings.manage · บันทึก = เจ้าของร้าน)
// 🔴 ไม่มีตัวอย่าง/ส่ง e-Tax (OUT) · AccountDocument.etaxStatus ไม่ถูกแตะ · ชิป "รอผู้ให้บริการ" ของแถวคงเดิม
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px
// ชื่อที่ผู้เรียกใช้ควรลงท้าย View/Pane (ตัวสแกนทะเบียนปุ่ม F15.3 นับคอมโพเนนต์ชื่อ *Sheet เป็นปุ่ม)

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RegisterDialog, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { IntegrationCredsCard } from "./IntegrationCredsCard";

export type EtaxProviderOption = { code: string; label: string };

export function EtaxProviderSheet({ systemId, unitId, isOwner, providers, onClose }: { systemId: string; unitId: string; isOwner: boolean; providers: EtaxProviderOption[]; onClose: () => void }) {
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
        data-testid="pos-settings-etax-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("creds.etaxTitle")}
        className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-[color:var(--color-surface)] shadow-xl md:fixed md:inset-y-0 md:right-0 md:max-h-none md:w-[474px] md:max-w-full md:rounded-none"
      >
        <div className="px-5 pt-2 md:hidden">
          <SheetGrab />
        </div>
        <header className="flex shrink-0 items-center gap-3 border-b px-5 py-3 md:px-7 md:py-[18px]">
          <RegisterIcon name="doc" size={20} />
          <h2 className="min-w-0 flex-1 truncate text-[19px] font-bold">{t("creds.etaxTitle")}</h2>
          <button data-testid="pos-settings-etax-close" type="button" className="grid size-11 shrink-0 place-items-center rounded-[11px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]" aria-label={t("creds.close")} onClick={onClose}>
            <RegisterIcon name="x" size={18} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5 md:px-7">
          <p className="text-[13px] text-[color:var(--color-ink-soft)]">{t("creds.etaxHelp")}</p>
          <p className="inline-flex w-fit items-center rounded-[8px] border px-2.5 py-1 text-[12px] text-[color:var(--color-muted)]">{t("etax.pending")}</p>
          <label className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{t("creds.provider")}</span>
            <select data-testid="pos-settings-etax-provider" className="input h-12 rounded-[13px] px-3 text-[15px]" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="">{t("creds.providerPick")}</option>
              {providers.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
            {!provider && <small className="text-[12.5px] text-[color:var(--color-muted)]">{t("creds.providerHelp")}</small>}
          </label>
          {provider ? <IntegrationCredsCard key={provider} systemId={systemId} unitId={unitId} kind="ETAX" provider={provider} isOwner={isOwner} /> : null}
        </div>
      </aside>
    </RegisterDialog>
  );
}
