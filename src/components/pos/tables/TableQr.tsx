"use client";

// TableQr.tsx — QR ของโต๊ะบนจอโต๊ะ (POS P2.7U · บรีฟ P2.7 §5 · มติ 15): กล่อง "QR ของโต๊ะ" (ภาพ QR + ลิงก์ · คัดลอก · พิมพ์ · เปลี่ยน QR พร้อมยืนยัน) +
//   แผ่น "พิมพ์ QR ทุกโต๊ะ" (ตาราง A4 3 คอลัมน์ · CSS สำหรับพิมพ์ · ชื่อร้าน + ชื่อโต๊ะ + QR ต่อช่อง)
//   ลิงก์ = <origin ของเครื่อง>/q/t/<qrToken> (โทเคนเดิมของ RestaurantTable — สติกเกอร์ที่พิมพ์ไว้ใช้ต่อได้) · ข้อมูล = qrTablesAction · เปลี่ยน = rotateTableQrAction
//   เปลี่ยน QR ได้เฉพาะผู้มี restaurant.table.rotateQr (ไม่มี = ปุ่มปิด + คำอธิบาย) · QR เดิมใช้ไม่ได้ทันที (หน้าแขกตอบ "QR นี้ใช้ไม่ได้แล้ว")
//   🔴 ไม่มีข้อความไทยนอก t() · origin อ่านหลัง mount

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { qrTablePath, type QrTableTokenRow } from "@/lib/modules/pos/qr-staff-shared";
import { RegisterDialog, REG_DIALOG_PANEL, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { QrCodeImage } from "@/components/pos/qr/QrCodeImage";

/** origin ของเครื่อง (หลัง mount · ก่อน mount = "") */
export function useOrigin(): string {
  const [o, setO] = useState("");
  useEffect(() => setO(window.location.origin), []);
  return o;
}

export function TableQrDialog(p: {
  tableName: string;
  row: QrTableTokenRow | null;
  loading: boolean;
  error: string | null;
  canRotate: boolean;
  busy: boolean;
  onRotate: () => Promise<boolean>;
  onPrint: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("pos.tables");
  const origin = useOrigin();
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = p.row && origin ? `${origin}${qrTablePath(p.row.qrToken)}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <RegisterDialog onDismiss={p.onClose} locked={p.busy}>
      <div data-testid="pos-tbl-qr-dialog" role="dialog" aria-modal="true" aria-label={t("qr.title", { name: p.tableName })} className={REG_DIALOG_PANEL}>
        <SheetGrab />
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-[19px] font-bold">{t("qr.title", { name: p.tableName })}</h2>
          <button data-testid="pos-tbl-qr-close" type="button" aria-label={t("panel.close")} className="grid size-11 place-items-center rounded-[12px] text-[color:var(--color-ink-soft)]" onClick={p.onClose}>
            <RegisterIcon name="x" size={18} />
          </button>
        </div>
        {p.loading ? (
          <p className="py-8 text-center text-[14px] text-[color:var(--color-muted)]">{t("qr.loading")}</p>
        ) : !p.row ? (
          <p role="alert" className="py-6 text-center text-[14px] text-[color:var(--color-danger)]">
            {p.error ?? t("qr.notFound")}
          </p>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-[16px] border p-3">
                <QrCodeImage value={url || null} size={208} alt={t("qr.title", { name: p.tableName })} fallback={t("qr.loading")} testid="pos-tbl-qr-image" />
              </div>
              <p className="text-center text-[12.5px] text-[color:var(--color-ink-soft)]">{t("qr.hint")}</p>
              <p data-testid="pos-tbl-qr-url" className="w-full break-all rounded-[10px] bg-[color:var(--color-surface-2)] px-3 py-2 text-center text-[12px] text-[color:var(--color-ink-soft)]">
                {url}
              </p>
              {!p.row.active ? <p className="text-[12.5px] font-bold text-[color:var(--color-danger)]">{t("qr.inactive")}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button data-testid="pos-tbl-qr-copy" type="button" disabled={!url} className="btn btn-ghost h-12 rounded-[14px] text-[14px]" onClick={() => void copy()}>
                {copied ? t("qr.copied") : t("qr.copy")}
              </button>
              <button data-testid="pos-tbl-qr-print" type="button" disabled={!url} className="btn btn-ghost h-12 rounded-[14px] text-[14px]" onClick={p.onPrint}>
                <RegisterIcon name="print" size={14} />
                {t("qr.print")}
              </button>
            </div>
            {confirm ? (
              <div data-testid="pos-tbl-qr-rotate-box" role="alertdialog" className="flex flex-col gap-2 rounded-[14px] border border-[color:var(--color-danger)] p-3">
                <p className="text-[13.5px] font-bold text-[color:var(--color-danger)]">{t("qr.rotateTitle")}</p>
                <p className="text-[13px] text-[color:var(--color-ink-soft)]">{t("qr.rotateBody")}</p>
                {p.error ? (
                  <p role="alert" className="text-[13px] text-[color:var(--color-danger)]">
                    {p.error}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <button data-testid="pos-tbl-qr-rotate-cancel" type="button" disabled={p.busy} className="btn btn-ghost h-12 rounded-[14px] text-[14px]" onClick={() => setConfirm(false)}>
                    {t("panel.back")}
                  </button>
                  <button
                    data-testid="pos-tbl-qr-rotate-confirm"
                    type="button"
                    disabled={p.busy}
                    className="btn h-12 rounded-[14px] bg-[color:var(--color-danger)] text-[14px] font-bold text-[color:var(--color-surface)]"
                    onClick={() => void p.onRotate().then((ok) => ok && setConfirm(false))}
                  >
                    {t("qr.rotateConfirm")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                data-testid="pos-tbl-qr-rotate"
                type="button"
                disabled={p.busy || !p.canRotate}
                title={!p.canRotate ? t("qr.rotateNoPerm") : undefined}
                className="btn btn-ghost h-12 rounded-[14px] text-[14px] text-[color:var(--color-danger)] disabled:opacity-50"
                onClick={() => setConfirm(true)}
              >
                {t("qr.rotate")}
              </button>
            )}
            {!p.canRotate ? <p className="text-[12px] text-[color:var(--color-muted)]">{t("qr.rotateNoPerm")}</p> : null}
          </>
        )}
      </div>
    </RegisterDialog>
  );
}

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 10mm; }
  body * { visibility: hidden !important; }
  #pos-tbl-qr-print, #pos-tbl-qr-print * { visibility: visible !important; }
  #pos-tbl-qr-print { position: absolute !important; left: 0; top: 0; width: 190mm !important; margin: 0 !important; box-shadow: none !important; border: 0 !important; padding: 0 !important; }
  .pos-qr-noprint { display: none !important; }
  .pos-qr-cell { break-inside: avoid; page-break-inside: avoid; }
}`;

/** แผ่นพิมพ์ QR (ทุกโต๊ะ หรือโต๊ะเดียว) — ตาราง A4 3 คอลัมน์ · ปุ่มพิมพ์ = window.print() */
export function TableQrPrintPage(p: { shopName: string; unitName: string; rows: readonly QrTableTokenRow[]; loading: boolean; error: string | null; onClose: () => void }) {
  const t = useTranslations("pos.tables");
  const origin = useOrigin();
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[color:var(--color-surface-2)]">
      <style>{PRINT_CSS}</style>
      <div className="pos-qr-noprint flex flex-wrap items-center gap-2 border-b bg-[color:var(--color-surface)] px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-bold">{t("qr.sheetTitle", { count: p.rows.length })}</h2>
        <button data-testid="pos-tbl-qr-sheet-print" type="button" disabled={!p.rows.length || !origin} className="btn btn-primary h-11 rounded-[12px] px-4 text-[14px] font-bold" onClick={() => window.print()}>
          <RegisterIcon name="print" size={14} />
          {t("qr.printNow")}
        </button>
        <button data-testid="pos-tbl-qr-sheet-close" type="button" className="btn btn-ghost h-11 rounded-[12px] px-4 text-[14px]" onClick={p.onClose}>
          {t("panel.close")}
        </button>
      </div>
      <p className="pos-qr-noprint px-4 pt-2 text-[12.5px] text-[color:var(--color-muted)]">{t("qr.sheetHint")}</p>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {p.loading ? (
          <p className="py-10 text-center text-[14px] text-[color:var(--color-muted)]">{t("qr.loading")}</p>
        ) : p.error ? (
          <p role="alert" className="py-10 text-center text-[14px] text-[color:var(--color-danger)]">
            {p.error}
          </p>
        ) : !p.rows.length ? (
          <p className="py-10 text-center text-[14px] text-[color:var(--color-muted)]">{t("qr.sheetEmpty")}</p>
        ) : (
          <div id="pos-tbl-qr-print" data-testid="pos-tbl-qr-sheet" data-count={p.rows.length} className="mx-auto grid w-full max-w-[794px] grid-cols-2 gap-0 bg-white text-black shadow-lg sm:grid-cols-3">
            {p.rows.map((r) => (
              <div key={r.tableId} data-testid="pos-tbl-qr-cell" className="pos-qr-cell flex flex-col items-center gap-1 border border-dashed border-neutral-300 px-2 pb-3 pt-3 text-center" style={{ minHeight: "88mm" }}>
                <p className="w-full truncate text-[11px] tracking-wide">{p.shopName}</p>
                <p className="text-[22px] font-bold leading-tight">{t("qr.cellTable", { name: r.name })}</p>
                <QrCodeImage value={origin ? `${origin}${qrTablePath(r.qrToken)}` : null} size={168} alt={t("qr.cellTable", { name: r.name })} fallback="" />
                <p className="text-[11.5px]">{t("qr.cellHint")}</p>
                <p className="w-full truncate text-[9px] text-neutral-500">{p.unitName}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
