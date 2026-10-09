"use client";

// PaymentSettings.tsx — POS P1.7U แท็บ "วิธีรับเงิน" (ภาพ 17A เมนูซ้าย · มติผู้คุมงาน P1.7U ข้อ 6) — โครงการ์ดแบบ ReceiptSettings
//   การ์ด "พร้อมเพย์": PromptPay ID จากช่องรับเงินของร้าน (PaymentProfile · อ่านอย่างเดียว + ลิงก์ไปตั้ง) · อายุ QR 5–60 นาที
//   การ์ด "Beam": สวิตช์รับเงินผ่าน Beam + คำใบ้ "ต้องมีคีย์ Beam ในระบบ" + ชิปสถานะคีย์ (หน้าเพจส่ง boolean มา — ไม่เคยเห็นคีย์)
//   การ์ด "การยืนยันเอง": สวิตช์ manualConfirmRequiresManager
// 🔴 ค่าเริ่ม/สิทธิ์มาจากหน้าเพจ (parsePosIntentSettings · pos.device.manage) · บันทึก = updatePosIntentSettingsAction (ส่งเฉพาะคีย์ที่แก้)
// 🔴 คำปฏิเสธแสดงผ่านคีย์ pos.settings.* (ไม่แสดงข้อความไทยของเซิร์ฟเวอร์) · ผู้อ่านอย่างเดียว = ช่องปิด + "เฉพาะผู้จัดการแก้ได้"

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { updatePosIntentSettingsAction } from "@/lib/modules/pos/payment-intent-actions";
import { POS_QR_EXPIRY_MAX, POS_QR_EXPIRY_MIN, type PosIntentSettings, type PosIntentSettingsPatch } from "@/lib/modules/pos/payment-intent-shared";
import { CardHead, Chip, InlineNote, SettingsCard, SwitchKnob, TabHead } from "./settings-ui";

type Props = {
  systemId: string;
  canEdit: boolean;
  initial: PosIntentSettings;
  /** แพลตฟอร์มมีคีย์ Beam ครบ (beamEnabled() ฝั่งเซิร์ฟเวอร์ · boolean เท่านั้น) */
  beamConfigured: boolean;
  /** PromptPay ID ของร้าน (ผู้อ่านอย่างเดียวเห็นแบบปิดบัง) · null = ยังไม่ตั้ง */
  promptpayId: string | null;
  promptpayLink: string;
};
const ERROR_KEY: Record<string, string> = {
  NOT_FOUND: "errors.notFound",
  PERMISSION_DENIED: "payments.permissionDenied",
  VALIDATION: "errors.validation",
  UNKNOWN: "errors.unknown",
};

export function PaymentSettings({ systemId, canEdit, initial, beamConfigured, promptpayId, promptpayLink }: Props) {
  const t = useTranslations("pos.settings");
  const tp = useTranslations("pos.settings.payments");
  const [saved, setSaved] = useState<PosIntentSettings>(initial);
  const [beamOn, setBeamOn] = useState(initial.beam.enabled);
  const [expiry, setExpiry] = useState(String(initial.qrExpiryMinutes));
  const [manual, setManual] = useState(initial.manualConfirmRequiresManager);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const ro = !canEdit;
  const expiryNum = /^\d{1,2}$/.test(expiry.trim()) ? Number(expiry.trim()) : NaN;
  const expiryOk = Number.isInteger(expiryNum) && expiryNum >= POS_QR_EXPIRY_MIN && expiryNum <= POS_QR_EXPIRY_MAX;
  // Beam: ยังไม่มีคีย์ = เปิดไม่ได้ (ปิดได้เสมอถ้าเคยเปิดไว้)
  const beamLocked = ro || (!beamConfigured && !beamOn);
  const touched = () => {
    setOk(false);
    setErr(null);
  };

  const save = async () => {
    if (ro || saving) return;
    if (!expiryOk) {
      setErr("payments.expiryInvalid");
      return;
    }
    const patch: PosIntentSettingsPatch = {};
    if (beamOn !== saved.beam.enabled) patch.beam = { enabled: beamOn };
    if (expiryNum !== saved.qrExpiryMinutes) patch.qrExpiryMinutes = expiryNum;
    if (manual !== saved.manualConfirmRequiresManager) patch.manualConfirmRequiresManager = manual;
    setSaving(true);
    setErr(null);
    setOk(false);
    try {
      const r = await updatePosIntentSettingsAction({ systemId, patch });
      if (r.ok) {
        setSaved(r.settings);
        setBeamOn(r.settings.beam.enabled);
        setExpiry(String(r.settings.qrExpiryMinutes));
        setManual(r.settings.manualConfirmRequiresManager);
        setOk(true);
      } else setErr(r.code === "VALIDATION" && r.field === "qrExpiryMinutes" ? "payments.expiryInvalid" : (ERROR_KEY[r.code] ?? "errors.unknown"));
    } catch {
      setErr("errors.unknown");
    } finally {
      setSaving(false);
    }
  };

  const toggleRow = (label: string, hint: string | null, node: ReactNode) => (
    <div className="flex items-center gap-4 border-t py-[14px] text-[15px] first:border-t-0">
      <div className="min-w-0 flex-1">
        <b className="block font-semibold">{label}</b>
        {hint && <small className="block text-[12.5px] text-[color:var(--color-muted)]">{hint}</small>}
      </div>
      {node}
    </div>
  );

  return (
    <div data-testid="pos-settings-payments" className="flex min-w-0 flex-col gap-6 md:gap-8">
      <TabHead title={tp("title")} desc={tp("subtitle")}>
        <button
          data-testid="pos-settings-pay-save"
          type="button"
          className="btn btn-primary h-11 rounded-[11px] px-5 text-[14px] font-semibold disabled:opacity-50"
          disabled={ro || saving}
          title={ro ? t("readOnly") : undefined}
          onClick={() => void save()}
        >
          {saving ? t("saving") : t("save")}
        </button>
      </TabHead>
      {ro && (
        <InlineNote tone="ok" testid="pos-settings-readonly">
          {t("readOnly")}
        </InlineNote>
      )}
      {err && (
        <InlineNote tone="error" testid="pos-settings-pay-error">
          {t(err)}
        </InlineNote>
      )}
      {ok && (
        <InlineNote tone="ok" testid="pos-settings-saved">
          {t("saved")}
        </InlineNote>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start xl:gap-7">
        <SettingsCard testid="pos-settings-pay-promptpay-card">
          <CardHead icon="qr" title={tp("promptpayCard")} />
          <div className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tp("promptpayId")}</span>
              <span
                data-testid="pos-settings-pay-promptpay"
                className={`flex h-12 items-center rounded-[13px] border bg-[color:var(--color-surface-2)] px-4 text-[15px] ${promptpayId ? "font-mono font-semibold tabular-nums" : "text-[color:var(--color-danger)]"}`}
              >
                {promptpayId ?? tp("promptpayNone")}
              </span>
              <small className="text-[12.5px] text-[color:var(--color-muted)]">{tp("promptpayHint")}</small>
              <Link data-testid="pos-settings-pay-link" href={promptpayLink} className="flex min-h-11 items-center self-start text-[14px] font-semibold text-[color:var(--color-accent)]">
                {tp("promptpayLink")}
              </Link>
            </div>
            <label className="flex flex-col gap-2 border-t pt-4">
              <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tp("qrExpiry")}</span>
              <input
                data-testid="pos-settings-pay-expiry"
                className="input h-12 w-[140px] rounded-[13px] px-4 text-right text-[15px] font-semibold tabular-nums disabled:opacity-70"
                inputMode="numeric"
                autoComplete="off"
                value={expiry}
                disabled={ro}
                aria-invalid={!expiryOk}
                onChange={(e) => {
                  setExpiry(e.target.value);
                  touched();
                }}
              />
              <small className="text-[12.5px] text-[color:var(--color-muted)]">{tp("qrExpiryHint")}</small>
            </label>
          </div>
        </SettingsCard>

        <div className="flex min-w-0 flex-col gap-6 xl:gap-7">
          <SettingsCard testid="pos-settings-pay-beam-card">
            <CardHead
              icon="card"
              title={tp("beamCard")}
              right={
                <Chip tone={beamConfigured ? "accent" : "muted"} testid="pos-settings-pay-beam-chip">
                  {beamConfigured ? tp("beamConfigured") : tp("beamNotConfigured")}
                </Chip>
              }
            />
            {toggleRow(
              tp("beamEnabled"),
              tp("beamHint"),
              <button
                data-testid="pos-settings-pay-beam"
                type="button"
                role="switch"
                aria-checked={beamOn}
                aria-label={tp("beamEnabled")}
                disabled={beamLocked}
                className="grid min-h-11 min-w-11 place-items-center"
                onClick={() => {
                  setBeamOn((v) => !v);
                  touched();
                }}
              >
                <SwitchKnob on={beamOn} disabled={beamLocked} />
              </button>,
            )}
          </SettingsCard>

          <SettingsCard testid="pos-settings-pay-manual-card">
            <CardHead icon="users" title={tp("manualCard")} />
            {toggleRow(
              tp("manualRequiresManager"),
              tp("manualHint"),
              <button
                data-testid="pos-settings-pay-manual"
                type="button"
                role="switch"
                aria-checked={manual}
                aria-label={tp("manualRequiresManager")}
                disabled={ro}
                className="grid min-h-11 min-w-11 place-items-center"
                onClick={() => {
                  setManual((v) => !v);
                  touched();
                }}
              >
                <SwitchKnob on={manual} disabled={ro} />
              </button>,
            )}
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}
