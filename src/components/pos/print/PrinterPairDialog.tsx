"use client";

// PrinterPairDialog.tsx — กล่อง "เลือกเครื่องพิมพ์" (POS P1.10 U · brief §4): ค้นหา (requestDevice — ต้องมาจากการกด) → เก็บรหัสใน localStorage →
//   "จับคู่แล้ว · <ชื่อเครื่อง>" · เลิกจับคู่ · เบราว์เซอร์ไม่มี WebUSB/Web Bluetooth (iOS Safari · headless) = ข้อความ "ไม่รองรับ" แทนปุ่มค้นหา
// 🔴 รหัสฮาร์ดแวร์ไม่ส่งเซิร์ฟเวอร์ (มติ CD2) · คำปฏิเสธแสดงผ่านคีย์ pos.print.errors.*

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { PosPrinterConfig } from "@/lib/modules/pos/device-shared";
import { pairBluetooth } from "./bluetooth";
import { clearPairing, pairingMatches, readPairing, writePairing } from "./pairing";
import { transportSupported } from "./printReceipt";
import { printErrorKey, type PrinterPairing, type PrintRefusalCode } from "./types";
import { pairUsb } from "./usb";

type Props = { mode: PosPrinterConfig["mode"]; deviceCode: string | undefined; onClose: () => void; onPaired: (p: PrinterPairing | null) => void };

export function PrinterPairDialog({ mode, deviceCode, onClose, onPaired }: Props) {
  const t = useTranslations("pos.print");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [current, setCurrent] = useState<PrinterPairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<PrintRefusalCode | null>(null);

  useEffect(() => {
    setSupported(mode !== "browser" && transportSupported(mode));
    const p = readPairing(deviceCode);
    setCurrent(pairingMatches(p, mode) ? p : null);
  }, [mode, deviceCode]);

  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const find = async () => {
    if (busy || mode === "browser") return;
    setBusy(true);
    setErr(null);
    const r = mode === "escpos-usb" ? await pairUsb() : await pairBluetooth();
    setBusy(false);
    if (!r.ok) return setErr(r.code);
    writePairing(deviceCode, r.pairing);
    setCurrent(r.pairing);
    onPaired(r.pairing);
  };
  const unpair = () => {
    clearPairing(deviceCode);
    setCurrent(null);
    onPaired(null);
  };
  const transport = mode === "escpos-bt" ? "Bluetooth" : "USB";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" role="presentation">
      <div
        data-testid="pos-print-pair"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-print-pair-title"
        className="flex w-full flex-col gap-4 rounded-t-[18px] bg-[color:var(--color-surface)] px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 shadow-xl md:w-[460px] md:rounded-[18px] md:px-7 md:py-6"
      >
        <h2 id="pos-print-pair-title" className="text-[18px] font-bold">
          {t("pair.title")} · {transport}
        </h2>
        {mode === "browser" ? (
          <p data-testid="pos-print-pair-browser" className="text-[14.5px] text-[color:var(--color-ink-soft)]">
            {t("pair.browserMode")}
          </p>
        ) : supported === false ? (
          <p data-testid="pos-print-pair-unsupported" role="alert" className="rounded-[13px] border-[1.5px] border-[color:var(--color-danger)] px-4 py-3 text-[14.5px] text-[color:var(--color-ink-soft)]">
            {t("pair.unsupported", { transport })}
          </p>
        ) : (
          <>
            <p className="text-[14px] text-[color:var(--color-muted)]">{t("pair.intro")}</p>
            {current && (
              <p data-testid="pos-print-pair-current" className="rounded-[13px] border bg-[color:var(--color-surface-2)] px-4 py-3 text-[15px] font-semibold">
                {t("pair.paired", { name: current.productName })}
              </p>
            )}
            {err && (
              <p data-testid="pos-print-pair-error" role="alert" className="text-[13.5px] text-[color:var(--color-danger)]">
                {err === "NO_DEVICE" ? t("pair.cancelled") : t(printErrorKey(err))}
              </p>
            )}
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {current && mode !== "browser" && (
            <button data-testid="pos-print-pair-unpair" type="button" className="btn btn-ghost h-11 rounded-[11px] px-4 text-[color:var(--color-danger)]" onClick={unpair}>
              {t("pair.unpair")}
            </button>
          )}
          <span className="flex-1" />
          <button data-testid="pos-print-pair-close" type="button" className="btn btn-ghost h-11 rounded-[11px] px-5" onClick={close}>
            {t("pair.close")}
          </button>
          {mode !== "browser" && supported && (
            <button data-testid="pos-print-pair-find" type="button" className="btn btn-primary h-11 rounded-[11px] px-5 font-semibold" disabled={busy} onClick={() => void find()}>
              {busy ? t("pair.finding") : t("pair.find")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
