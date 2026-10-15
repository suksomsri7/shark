"use client";

// DepositSettingsCard.tsx — POS P2.9bU ▸ การ์ด "มัดจำ" ในแท็บวิธีรับเงิน (มติผู้คุม P2.9bU ข้อ 8 · S มติ 14) ◂
//   สวิตช์ "รับเงินมัดจำ" = settings.pos.deposit.enabled · บันทึกทันทีที่สลับ (updatePosPaymentSettingsAction patch.deposit — ตัวห่อส่ง patch ทั้งก้อน ไม่ต้องแก้) ·
//   บรรทัดช่วย "มัดจำที่รับไว้แล้วยังใช้และคืนได้แม้ปิด" (S มติ 14: ปิด = รับใหม่ไม่ได้ · ใช้/คืนมัดจำเดิมได้)
// 🔴 สิทธิ์ = เจ้าของร้าน (pos.settings.payment · updatePosPaymentSettings ยอมเฉพาะ OWNER) — อื่น = ข้อความ "เฉพาะเจ้าของร้าน" (ไม่มีสวิตช์)
// 🔴 ไม่แสดงข้อความไทยของเซิร์ฟเวอร์ · ไม่มีข้อความไทยนอกคอมเมนต์ (ST7)

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { posPaymentSettingsAction, updatePosPaymentSettingsAction } from "@/lib/modules/pos/payment-settings-actions";
import { CardHead, InlineNote, SettingsCard, SwitchKnob } from "./settings-ui";

type Load = { state: "loading" } | { state: "denied" } | { state: "error" } | { state: "ready" };

export function DepositSettingsCard({ systemId }: { systemId: string }) {
  const tp = useTranslations("pos.settings.payments");
  const t = useTranslations("pos.settings");
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let live = true;
    posPaymentSettingsAction({ systemId })
      .then((s) => {
        if (!live) return;
        if (!s.ok) return setLoad({ state: s.code === "PERMISSION_DENIED" ? "denied" : "error" });
        setOn(s.deposit.enabled);
        setLoad({ state: "ready" });
      })
      .catch(() => live && setLoad({ state: "error" }));
    return () => {
      live = false;
    };
  }, [systemId]);

  const toggle = async () => {
    if (load.state !== "ready" || busy) return;
    const next = !on;
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      const r = await updatePosPaymentSettingsAction({ systemId, patch: { deposit: { enabled: next } } });
      if (r.ok) {
        setOn(r.deposit.enabled);
        setOk(true);
      } else setErr(r.code === "PERMISSION_DENIED" ? "payments.depositOwnerOnly" : "errors.unknown");
    } catch {
      setErr("errors.unknown");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard testid="pos-settings-deposit-card">
      <CardHead icon="cheque" title={tp("depositCard")} />
      {load.state === "loading" ? (
        <p className="text-[13px] text-[color:var(--color-muted)]">{t("loading")}</p>
      ) : load.state === "denied" ? (
        <InlineNote tone="ok" testid="pos-settings-deposit-owner-only">
          {tp("depositOwnerOnly")}
        </InlineNote>
      ) : load.state === "error" ? (
        <InlineNote tone="error" testid="pos-settings-deposit-load-error">
          {t("errors.unknown")}
        </InlineNote>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4 text-[15px]">
            <div className="min-w-0 flex-1">
              <b className="block font-semibold">{tp("depositEnabled")}</b>
              <small data-testid="pos-settings-deposit-hint" className="block text-[12.5px] text-[color:var(--color-muted)]">
                {tp("depositHint")}
              </small>
            </div>
            <button
              data-testid="pos-settings-deposit-enabled"
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={tp("depositEnabled")}
              disabled={busy}
              className="grid min-h-11 min-w-11 place-items-center"
              onClick={() => void toggle()}
            >
              <SwitchKnob on={on} disabled={busy} />
            </button>
          </div>
          {ok && (
            <span data-testid="pos-settings-deposit-saved" role="status" className="text-[13px] text-[color:var(--color-ink-soft)]">
              {tp("depositSaved")}
            </span>
          )}
          {err && (
            <span role="alert" className="text-[13px] text-[color:var(--color-danger)]">
              {t(err)}
            </span>
          )}
        </div>
      )}
    </SettingsCard>
  );
}
