"use client";

// TipSettingsCard.tsx — POS P2.9U ▸ การ์ด "ทิป" ในแท็บวิธีรับเงิน (มติผู้คุม P2.9U ข้อ 6 · P2.9 R9 ทิปลงบัญชีพักทิป) ◂
//   สวิตช์รับทิป + ตัวเลือกบัญชีพักทิป = บัญชีหมวดหนี้สิน (LIABILITY) ของสมุดที่เชื่อมกับ POS นี้เท่านั้น (กรองที่จอ · เซิร์ฟเวอร์ตรวจซ้ำ) ·
//   อ่าน = posPaymentSettingsAction + posTipLedgersAction · บันทึก = updatePosPaymentSettingsAction (patch.tip เท่านั้น) — ปุ่มบันทึกของการ์ดเอง
//   (ปุ่มบันทึกของแท็บบันทึกค่า QR/Beam/ยืนยันเอง ซึ่งเป็นคนละตัวเก็บ)
// 🔴 สิทธิ์ตั้งค่าทิป = เจ้าของร้าน (pos.settings.payment · updatePosPaymentSettings ยอมเฉพาะ OWNER) — อื่น = การ์ดอ่านอย่างเดียวพร้อมเหตุผล
// 🔴 คำปฏิเสธ (TIP_ACCOUNT_REQUIRED · VALIDATION) แสดงที่ช่องบัญชี · ไม่แสดงข้อความไทยของเซิร์ฟเวอร์

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { posPaymentSettingsAction, updatePosPaymentSettingsAction } from "@/lib/modules/pos/payment-settings-actions";
import { posTipLedgersAction } from "@/lib/modules/pos/tip-ledger-actions";
import { isTipLedgerType, type PosTipLedger } from "@/lib/modules/pos/tip-ledger-shared";
import { CardHead, InlineNote, SettingsCard, SwitchKnob } from "./settings-ui";

type Load = { state: "loading" } | { state: "denied" } | { state: "error" } | { state: "ready"; linked: boolean; ledgers: PosTipLedger[] };

export function TipSettingsCard({ systemId, isOwner = false }: { systemId: string; /** POS P2.14 ▸ UI-10 ◂ */ isOwner?: boolean }) {
  const tp = useTranslations("pos.settings.payments");
  const t = useTranslations("pos.settings");
  const [load, setLoad] = useState<Load>(isOwner ? { state: "loading" } : { state: "denied" }); // POS P2.14 ▸ UI-10 ◂
  const [savedTip, setSavedTip] = useState<{ enabled: boolean; ledgerAccountId: string | null }>({ enabled: false, ledgerAccountId: null });
  const [on, setOn] = useState(false);
  const [ledgerId, setLedgerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let live = true;
    // POS P2.14 ▸ UI-10: ไม่ใช่เจ้าของร้าน ⇒ ไม่โหลด · การ์ดแสดง "เฉพาะเจ้าของร้าน" (ไม่มีสวิตช์/ตัวเลือกบัญชี) ◂
    if (!isOwner) return;
    void (async () => {
      const [s, l] = await Promise.all([posPaymentSettingsAction({ systemId }).catch(() => null), posTipLedgersAction({ systemId }).catch(() => null)]);
      if (!live) return;
      if ((s && !s.ok && s.code === "PERMISSION_DENIED") || (l && !l.ok && l.code === "PERMISSION_DENIED")) return setLoad({ state: "denied" });
      if (!s || !s.ok || !l || !l.ok) return setLoad({ state: "error" });
      setSavedTip(s.tip);
      setOn(s.tip.enabled);
      setLedgerId(s.tip.ledgerAccountId ?? "");
      setLoad({ state: "ready", linked: l.linked, ledgers: l.ledgers });
    })();
    return () => {
      live = false;
    };
  }, [systemId, isOwner]); // POS P2.14 ▸ UI-10 ◂

  // มติ 6: แสดง/เลือกได้เฉพาะบัญชีหมวดหนี้สิน — ค่าที่บันทึกไว้แต่ไม่ใช่หนี้สิน (ข้อมูลเก่า) = ไม่อยู่ในรายการ ⇒ ต้องเลือกใหม่
  const liab = load.state === "ready" ? load.ledgers.filter((x) => isTipLedgerType(x.type)) : [];
  const chosenOk = liab.some((x) => x.id === ledgerId);
  const ro = load.state !== "ready";
  const dirty = on !== savedTip.enabled || (ledgerId || null) !== savedTip.ledgerAccountId;

  const save = async () => {
    if (ro || busy) return;
    setErr(null);
    setOk(false);
    if (on && !chosenOk) return setFieldErr("payments.tipAccountRequired");
    if (ledgerId && !chosenOk) return setFieldErr("payments.tipInvalid");
    setFieldErr(null);
    setBusy(true);
    try {
      const r = await updatePosPaymentSettingsAction({ systemId, patch: { tip: { enabled: on, ledgerAccountId: ledgerId || null } } });
      if (r.ok) {
        setSavedTip(r.tip);
        setOn(r.tip.enabled);
        setLedgerId(r.tip.ledgerAccountId ?? "");
        setOk(true);
      } else if (r.code === "TIP_ACCOUNT_REQUIRED") setFieldErr("payments.tipAccountRequired");
      else if (r.code === "VALIDATION") setFieldErr("payments.tipInvalid");
      else if (r.code === "PERMISSION_DENIED") setErr("payments.tipOwnerOnly");
      else setErr("errors.unknown");
    } catch {
      setErr("errors.unknown");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard testid="pos-settings-tip-card">
      <CardHead icon="coin" title={tp("tipCard")} />
      {load.state === "loading" ? (
        <p className="text-[13px] text-[color:var(--color-muted)]">{t("loading")}</p>
      ) : load.state === "denied" ? (
        <InlineNote tone="ok" testid="pos-settings-tip-owner-only">
          {tp("tipOwnerOnly")}
        </InlineNote>
      ) : load.state === "error" ? (
        <InlineNote tone="error" testid="pos-settings-tip-load-error">
          {t("errors.unknown")}
        </InlineNote>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4 text-[15px]">
            <div className="min-w-0 flex-1">
              <b className="block font-semibold">{tp("tipEnabled")}</b>
              <small className="block text-[12.5px] text-[color:var(--color-muted)]">{tp("tipHint")}</small>
            </div>
            <button
              data-testid="pos-settings-tip-enabled"
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={tp("tipEnabled")}
              disabled={busy || (!on && !load.linked)}
              className="grid min-h-11 min-w-11 place-items-center"
              onClick={() => {
                setOn((v) => !v);
                setOk(false);
                setFieldErr(null);
              }}
            >
              <SwitchKnob on={on} disabled={busy || (!on && !load.linked)} />
            </button>
          </div>
          <label className="flex flex-col gap-2 border-t pt-4">
            <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tp("tipLedger")}</span>
            <select
              data-testid="pos-settings-tip-ledger"
              className="input h-12 max-w-[420px] rounded-[13px] px-3 text-[15px] font-semibold disabled:opacity-70"
              value={chosenOk ? ledgerId : ""}
              disabled={busy || !load.linked || liab.length === 0}
              aria-invalid={!!fieldErr}
              onChange={(e) => {
                setLedgerId(e.target.value);
                setOk(false);
                setFieldErr(null);
              }}
            >
              <option value="">{tp("tipLedgerNone")}</option>
              {liab.map((x) => (
                <option key={x.id} value={x.id}>{`${x.code} · ${x.name}`}</option>
              ))}
            </select>
            <small className="text-[12.5px] text-[color:var(--color-muted)]">
              {!load.linked ? tp("tipNoBook") : liab.length === 0 ? tp("tipNoLiability") : tp("tipLedgerHint")}
            </small>
            {fieldErr && (
              <small data-testid="pos-settings-tip-ledger-error" role="alert" className="text-[12.5px] font-semibold text-[color:var(--color-danger)]">
                {t(fieldErr)}
              </small>
            )}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              data-testid="pos-settings-tip-save"
              type="button"
              className="btn btn-primary h-11 rounded-[11px] px-5 text-[14px] font-semibold disabled:opacity-50"
              disabled={busy || !dirty}
              onClick={() => void save()}
            >
              {busy ? t("saving") : tp("tipSave")}
            </button>
            {ok && (
              <span data-testid="pos-settings-tip-saved" role="status" className="text-[13px] text-[color:var(--color-ink-soft)]">
                {tp("tipSaved")}
              </span>
            )}
            {err && (
              <span role="alert" className="text-[13px] text-[color:var(--color-danger)]">
                {t(err)}
              </span>
            )}
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
