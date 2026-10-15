"use client";

// BranchCopyDialog.tsx — กล่อง "คัดลอกราคาจากสาขา" ของจอ 06 (POS P2.11U · มติ 4 · ภาพ 06)
//   จากสาขา · ไปสาขา (ค่าเริ่ม = สาขาที่กรองอยู่ · ต้นทาง ≠ ปลายทาง) · สวิตช์ "เขียนทับราคาที่มีอยู่" (overwrite · ค่าเริ่มปิด) ·
//   สวิตช์ "เฉพาะสินค้าที่กรองอยู่" (เปิด = ส่ง productIds ของรายการที่เห็น · ปิด = ทั้งแคตตาล็อก ไม่ส่ง productIds) ·
//   สรุป "จะคัดลอกราคาของ N สินค้า" · คัดลอก = copyUnitPricesAction → toast "คัดลอกแล้ว {written} · ข้าม {skipped}" แล้วหน้าอ่านใหม่
//   คำปฏิเสธ: field fromUnitId/toUnitId (+ reason PRICE_ROW_DEAD = "สาขานี้เลิกใช้แล้ว") ใต้ช่องนั้น · reason อื่น/รหัส = แถบแดง ·
//   PERMISSION_DENIED = toast ของหน้า (กล่องไม่ปิด)
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · ปุ่ม ≥ 44px · ไม่คิดเงินเอง (เซิร์ฟเวอร์คัดลอกแถวตามกติกา copyUnitPrices)

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { copyUnitPricesAction } from "@/lib/modules/pos/catalog-price-actions";
import { PriceIcon, priceReasonText, priceRefusalText, type PT } from "@/components/pos/products/price-ui";

type Props = {
  systemId: string;
  /** สาขาที่ผู้ใช้เข้าได้ (โหมดสาขา = เฉพาะสาขาของตัวเอง) */
  units: { id: string; name: string }[];
  /** สาขาที่ตัวกรองของหน้าเลือกอยู่ (null = ทุกสาขา) */
  initialTo: string | null;
  /** สินค้าที่เห็นอยู่ในรายการ (หลังตัวกรอง) */
  visibleIds: string[];
  onClose: () => void;
  onToast: (text: string) => void;
  onDone: (text: string) => void;
};

export function BranchCopyDialog({ systemId, units, initialTo, visibleIds, onClose, onToast, onDone }: Props) {
  const t = useTranslations("pos.products.branch.copy") as PT;
  const tp = useTranslations("pos.price") as PT;
  const treg = useTranslations("pos.register") as PT;
  const to0 = initialTo && units.some((u) => u.id === initialTo) ? initialTo : (units[1]?.id ?? units[0]?.id ?? "");
  const [to, setTo] = useState(to0);
  const [from, setFrom] = useState(units.find((u) => u.id !== to0)?.id ?? "");
  const [overwrite, setOverwrite] = useState(false);
  const [onlyFiltered, setOnlyFiltered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ field: "fromUnitId" | "toUnitId"; text: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const same = !!from && from === to;
  const canRun = !!from && !!to && !same && !busy && (!onlyFiltered || visibleIds.length > 0);

  const run = async () => {
    if (!canRun) return;
    setBusy(true);
    setErr(null);
    setFieldErr(null);
    try {
      const r = await copyUnitPricesAction({ systemId, fromUnitId: from, toUnitId: to, overwrite, ...(onlyFiltered ? { productIds: visibleIds } : {}) });
      if (r.ok) {
        onDone(t("done", { written: r.written, skipped: r.skipped }));
        return;
      }
      if (r.code === "PERMISSION_DENIED") {
        onToast(priceRefusalText(r, false, tp, treg));
        return;
      }
      if (r.field === "fromUnitId" || r.field === "toUnitId") {
        setFieldErr({ field: r.field, text: r.reason === "PRICE_ROW_DEAD" ? t("unitDead") : r.field === "toUnitId" && same ? t("same") : (priceReasonText(r, tp) ?? priceRefusalText(r, false, tp, treg)) });
        return;
      }
      setErr(priceReasonText(r, tp) ?? priceRefusalText(r, false, tp, treg));
    } catch {
      setErr(tp("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  const switchCls = (on: boolean) => `relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${on ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)]" : "bg-[color:var(--color-surface-2)]"}`;
  const knob = (on: boolean) => <span aria-hidden className={`absolute size-5 rounded-full bg-[color:var(--color-surface)] shadow transition-[left] ${on ? "left-[24px]" : "left-[3px]"}`} />;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-start sm:p-4 sm:pt-[8vh]">
      <div role="dialog" aria-modal="true" aria-labelledby="pos-prod-copy-title" data-testid="pos-prod-copy-dialog" className="flex max-h-full w-full flex-col overflow-y-auto bg-[color:var(--color-surface)] shadow-lg sm:max-h-[86vh] sm:max-w-[480px] sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b px-5 pb-3 pt-4">
          <PriceIcon name="copy" />
          <h2 id="pos-prod-copy-title" className="min-w-0 flex-1 text-[16px] font-bold">
            {t("title")}
          </h2>
          <button type="button" data-testid="pos-prod-copy-close" aria-label={tp("cancel")} disabled={busy} className="-mr-2 grid h-11 w-11 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={onClose}>
            <PriceIcon name="x" />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4 text-[13px]">
          <p className="text-[12px] text-[color:var(--color-muted)]">{t("hint")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-[color:var(--color-muted)]">{t("from")}</span>
              <select
                data-testid="pos-prod-copy-from"
                className={`input h-11 ${fieldErr?.field === "fromUnitId" ? "border-[color:var(--color-danger)]" : ""}`}
                value={from}
                disabled={busy}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setFieldErr(null);
                }}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              {fieldErr?.field === "fromUnitId" ? <span data-testid="pos-prod-copy-from-error" className="text-[11.5px] text-[color:var(--color-danger)]">{fieldErr.text}</span> : null}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-[color:var(--color-muted)]">{t("to")}</span>
              <select
                data-testid="pos-prod-copy-to"
                className={`input h-11 ${fieldErr?.field === "toUnitId" || same ? "border-[color:var(--color-danger)]" : ""}`}
                value={to}
                disabled={busy}
                onChange={(e) => {
                  setTo(e.target.value);
                  setFieldErr(null);
                }}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              {fieldErr?.field === "toUnitId" ? <span data-testid="pos-prod-copy-to-error" className="text-[11.5px] text-[color:var(--color-danger)]">{fieldErr.text}</span> : same ? <span className="text-[11.5px] text-[color:var(--color-danger)]">{t("same")}</span> : null}
            </label>
          </div>
          <div className="flex items-center gap-3 border-t pt-3">
            <span className="min-w-0 flex-1">
              <b className="block text-[13px] font-semibold">{t("overwrite")}</b>
              <small className="block text-[11.5px] text-[color:var(--color-muted)]">{t("overwriteHint")}</small>
            </span>
            <button type="button" role="switch" aria-checked={overwrite} aria-label={t("overwrite")} data-testid="pos-prod-copy-overwrite" disabled={busy} className="grid min-h-11 min-w-11 place-items-center" onClick={() => setOverwrite((v) => !v)}>
              <span className={switchCls(overwrite)}>{knob(overwrite)}</span>
            </button>
          </div>
          <div className="flex items-center gap-3 border-t pt-3">
            <span className="min-w-0 flex-1">
              <b className="block text-[13px] font-semibold">{t("onlyFiltered")}</b>
              <small className="block text-[11.5px] text-[color:var(--color-muted)]">{t("onlyFilteredHint")}</small>
            </span>
            <button type="button" role="switch" aria-checked={onlyFiltered} aria-label={t("onlyFiltered")} data-testid="pos-prod-copy-onlyFiltered" disabled={busy} className="grid min-h-11 min-w-11 place-items-center" onClick={() => setOnlyFiltered((v) => !v)}>
              <span className={switchCls(onlyFiltered)}>{knob(onlyFiltered)}</span>
            </button>
          </div>
          <p data-testid="pos-prod-copy-summary" className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-[12.5px] font-semibold">
            {onlyFiltered ? t("summary", { count: visibleIds.length }) : t("summaryAll")}
          </p>
          {err ? (
            <p data-testid="pos-prod-copy-error" role="alert" className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-[12px] text-[color:var(--color-danger)]">
              {err}
            </p>
          ) : null}
        </div>
        <div className="mt-auto flex gap-2 border-t px-5 py-3">
          <button type="button" data-testid="pos-prod-copy-run" disabled={!canRun} className="btn btn-primary h-11 rounded-[11px] px-5 disabled:opacity-50" onClick={() => void run()}>
            {busy ? t("running") : t("run")}
          </button>
          <button type="button" data-testid="pos-prod-copy-cancel" disabled={busy} className="btn btn-ghost h-11 rounded-[11px] px-4" onClick={onClose}>
            {tp("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
