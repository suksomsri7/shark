"use client";

// TablePreBillDialog.tsx — "ใบรายการ" (pre-bill) ของโต๊ะ/ของใบแยกบิล (POS P2.5U · มติ 9) — ตัวอย่าง 80 มม. + พิมพ์ + พิมพ์สำเนา
//   payload = registerTablePreBillAction({tableSessionId | tableSplitPartId, locale, copy?}) → renderPreBillHtml (กรอบตัวอย่างแบบเดียวกับตัวอย่างใบเสร็จ P1.10:
//   ReceiptSettings.tsx — พื้น stage + iframe srcDoc sandbox กว้าง 336) · "พิมพ์" = เครื่องพิมพ์ใบเสร็จของเครื่อง (renderPreBillEscPos · ทางเดียวกับใบเสร็จ)
//   เมื่อมีและจับคู่แล้ว ไม่งั้นหน้าต่างพิมพ์ของเบราว์เซอร์ · "พิมพ์สำเนา" = copy:true ("สำเนา") · ใบแยกบิลมีหัว "บิล n จาก N" จาก payload
// 🔴 1 ครั้งที่เรียก action = พิมพ์ได้ 1 ครั้ง (S บันทึก audit pos.table.preBill ต่อครั้ง): ตัวอย่างตอนเปิด = ครั้งแรก · กด "พิมพ์" ครั้งแรกพิมพ์ payload นั้น ·
//    พิมพ์ซ้ำ/สำเนา = เรียกใหม่ทุกครั้ง · ไม่มีการเรียกเงียบ ๆ (ตัวกันซ้ำตอน mount)
// 🔴 ไม่ใช่ใบเสร็จ — ไม่มีเลขเอกสาร (payload ไม่มีคีย์) · ยอดทุกตัวมาจาก payload ของเซิร์ฟเวอร์

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { refusalMessageKey } from "@/lib/modules/pos/register-shared";
import type { PosPrinterConfig } from "@/lib/modules/pos/device-shared";
import { renderPreBillHtml, type PreBillPayload } from "@/lib/modules/pos/pre-bill-render";
import { registerTablePreBillAction } from "@/lib/modules/pos/table-split-actions";
import { RegisterDialog, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import type { TableToast } from "./TableCheckout";
import { preBillDevicePrinter, printPreBill } from "./pre-bill-print";

type Props = {
  systemId: string;
  unitId: string;
  deviceId?: string;
  target: { tableSessionId: string } | { tableSplitPartId: string };
  printer: { config: PosPrinterConfig; deviceCode: string | undefined };
  locale: "th" | "en";
  onToast: (m: TableToast) => void;
  onClose: () => void;
};

export function TablePreBillDialog(p: Props) {
  const t = useTranslations("pos.tables");
  const tr = useTranslations("pos.register");
  const [payload, setPayload] = useState<PreBillPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** payload ตัวอย่างยังไม่ถูกพิมพ์ (พิมพ์ครั้งแรกใช้ตัวนี้ได้โดยไม่เรียกซ้ำ) */
  const fresh = useRef(false);
  const started = useRef(false);
  const device = preBillDevicePrinter(p.printer.config, p.printer.deviceCode);

  const fetchOne = async (copy: boolean): Promise<PreBillPayload | null> => {
    try {
      const r = await registerTablePreBillAction({ systemId: p.systemId, unitId: p.unitId, ...(p.deviceId ? { deviceId: p.deviceId } : {}), ...p.target, locale: p.locale, ...(copy ? { copy: true } : {}) });
      if (!r.ok) {
        setErr(refusalMessageKey(r.code));
        return null;
      }
      setErr(null);
      return r.payload;
    } catch {
      setErr("errors.unknown");
      return null;
    }
  };
  useEffect(() => {
    if (started.current) return; // กันเรียกซ้ำ (StrictMode / remount ของ effect)
    started.current = true;
    void (async () => {
      const pl = await fetchOne(false);
      if (pl) {
        setPayload(pl);
        fresh.current = true;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวตอนเปิด
  }, []);

  const print = async (copy: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      let pl: PreBillPayload | null;
      if (!copy && fresh.current && payload) {
        pl = payload;
        fresh.current = false;
      } else pl = await fetchOne(copy);
      if (!pl) return;
      const r = await printPreBill(pl, p.printer.config, p.locale, p.printer.deviceCode);
      p.onToast(r.ok ? { key: "preBill.printed", ns: "tables" } : { key: "preBill.failed", ns: "tables" });
    } finally {
      setBusy(false);
    }
  };

  const html = useMemo(() => (payload ? renderPreBillHtml(payload, { paper: "80", locale: p.locale }) : ""), [payload, p.locale]);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [frameH, setFrameH] = useState(520);
  const fitFrame = () => {
    try {
      const h = frameRef.current?.contentDocument?.documentElement?.scrollHeight;
      if (h && h > 100) setFrameH(Math.min(h + 8, 1600));
    } catch {
      /* อ่านไม่ได้ = คงความสูงเดิม */
    }
  };
  const title = payload?.part ? `${t("preBill.preview")} · ${t("preBill.part", { no: payload.part.no, of: payload.part.of })}` : t("preBill.preview");

  return (
    <RegisterDialog onDismiss={() => (!busy ? p.onClose() : undefined)} locked={busy}>
      <div
        data-testid="pos-tbl-prebill-preview"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[100dvh] w-full flex-col gap-3 overflow-hidden rounded-t-[16px] bg-[color:var(--color-surface)] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 shadow-xl md:max-h-[calc(100dvh-32px)] md:w-[480px] md:rounded-[22px] md:p-6"
      >
        <SheetGrab />
        <div className="flex items-center gap-2">
          <RegisterIcon name="doc" size={16} />
          <h2 className="min-w-0 flex-1 truncate text-[18px] font-bold">{title}</h2>
          <button data-testid="pos-tbl-prebill-close" type="button" aria-label={t("preBill.close")} disabled={busy} className="grid size-11 place-items-center rounded-[12px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]" onClick={p.onClose}>
            <RegisterIcon name="x" size={18} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-y-auto rounded-[18px] bg-[color:var(--color-stage)] p-4">
          {payload ? (
            <iframe ref={frameRef} data-testid="pos-tbl-prebill-frame" title={t("preBill.frame")} sandbox="allow-same-origin" className="w-full max-w-[336px] shrink-0 rounded-[4px] border bg-[color:var(--color-surface)]" style={{ height: frameH }} srcDoc={html} onLoad={fitFrame} />
          ) : (
            <p className="self-center py-10 text-center text-[13.5px] text-[color:var(--color-muted)]">{err ? tr(err) : t("preBill.loading")}</p>
          )}
        </div>
        {err && payload && (
          <p role="alert" className="text-[13px] text-[color:var(--color-danger)]">
            {tr(err)}
          </p>
        )}
        {!device && <p className="text-[12.5px] text-[color:var(--color-muted)]">{t("preBill.noPrinter")}</p>}
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <button data-testid="pos-tbl-prebill-copy" type="button" disabled={busy || !payload} className="btn btn-ghost h-12 rounded-[14px] text-[14px]" onClick={() => void print(true)}>
            {t("preBill.printCopy")}
          </button>
          <button data-testid="pos-tbl-prebill-print" type="button" disabled={busy || !payload} className="btn btn-primary h-12 rounded-[14px] text-[15px] font-bold" onClick={() => void print(false)}>
            <RegisterIcon name="print" size={14} />
            {t("preBill.print")}
          </button>
        </div>
      </div>
    </RegisterDialog>
  );
}
