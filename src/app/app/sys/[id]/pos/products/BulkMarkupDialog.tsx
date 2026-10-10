"use client";

// BulkMarkupDialog.tsx — กล่อง "+X% ทั้งช่องทาง" ของจอ 06 (POS P2.2U · มติ 3 · CD6)
//   ช่องทาง (แพลตฟอร์มสำเร็จรูป + ช่องทางที่ร้านตั้งเอง) · % (1–200 ทศนิยม 2 ตำแหน่ง ↔ bp) · ปัดเป็นบาท (100) | สตางค์ (1) ·
//   ขอบเขต = หมวดที่กรองอยู่ หรือสินค้าที่เลือก (≤ 500) · ตัวอย่าง 5 รายการแรกด้วย channelMarkupPrice (ฝั่ง client · เซิร์ฟเวอร์คือความจริง) ·
//   ข้อความ: แถวที่ตั้ง "ไม่ขาย" ไว้แล้วคงเดิมและนับเป็นข้าม · ตั้งราคา = bulkChannelMarkupAction → แจ้ง "ตั้งราคา N รายการ · ข้าม M"
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · ปุ่ม ≥ 44px · คำปฏิเสธผ่านคีย์

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { bulkChannelMarkupAction } from "@/lib/modules/pos/catalog-price-actions";
import { BULK_MARKUP_PRODUCTS_MAX, channelMarkupPrice } from "@/lib/modules/pos/price-shared";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { channelDisplayName } from "@/components/pos/settings/channel-text";
import { PriceIcon, parsePctToBp, priceErrorText, priceRefusalText, type PT } from "@/components/pos/products/price-ui";
import type { ProductsChannel, ProductsRow } from "./products-data";

type Props = {
  systemId: string;
  channels: ProductsChannel[];
  unit: string | null;
  scopeName: string;
  category: { id: string; name: string } | null;
  categoryProducts: ProductsRow[];
  selected: ProductsRow[];
  onClose: () => void;
  onDone: (text: string) => void;
};

export function BulkMarkupDialog({ systemId, channels, unit, scopeName, category, categoryProducts, selected, onClose, onDone }: Props) {
  const tp = useTranslations("pos.price") as PT;
  const tb = useTranslations("pos.price.bulk") as PT;
  const treg = useTranslations("pos.register") as PT;
  const tch = useTranslations("pos.channel") as PT;
  const locale = useLocale();
  const options = useMemo(() => channels.filter((c) => c.kind !== "BUILTIN"), [channels]);
  const [code, setCode] = useState(options[0]?.code ?? "");
  const [pct, setPct] = useState("27");
  const [roundTo, setRoundTo] = useState<1 | 100>(100);
  const [scope, setScope] = useState<"category" | "selected">(selected.length ? "selected" : "category");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const bp = parsePctToBp(pct);
  const list = scope === "selected" ? selected : category ? categoryProducts : [];
  const tooMany = scope === "selected" && selected.length > BULK_MARKUP_PRODUCTS_MAX;
  const canRun = !!code && bp !== null && list.length > 0 && !tooMany && !busy;
  const nameOf = (p: ProductsRow) => (locale.startsWith("en") && p.nameEn ? p.nameEn : p.name);

  const run = async () => {
    if (!canRun || bp === null) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await bulkChannelMarkupAction(
        scope === "selected" ? { systemId, channelCode: code, unitId: unit, markupBp: bp, roundTo, productIds: selected.map((p) => p.id) } : { systemId, channelCode: code, unitId: unit, markupBp: bp, roundTo, categoryId: category!.id },
      );
      if (r.ok) onDone(tb("done", { count: r.written, skipped: r.skipped }));
      // P2.2U fix รอบ 1 F5: หมวดเกิน BULK_MARKUP_PRODUCTS_MAX (เซิร์ฟเวอร์นับสินค้าทุกตัวของหมวดรวม variant) ⇒ bulk.tooMany ·
      //   VALIDATION อื่นไม่มีช่องให้ชี้ ⇒ ข้อความของบริการ (F4) · รหัสอื่น = เดิม
      else if (r.code === "VALIDATION" && scope === "category" && r.message.includes(String(BULK_MARKUP_PRODUCTS_MAX))) setErr(tb("tooMany", { max: BULK_MARKUP_PRODUCTS_MAX }));
      else if (r.code === "VALIDATION") setErr(priceRefusalText(r, false, tp, treg));
      else setErr(priceErrorText(r.code, tp, treg));
    } catch {
      setErr(tp("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-start sm:p-4 sm:pt-[8vh]">
      <div role="dialog" aria-modal="true" aria-labelledby="pos-prod-bulk-title" data-testid="pos-prod-bulk" className="flex max-h-full w-full flex-col overflow-y-auto bg-[color:var(--color-surface)] shadow-lg sm:max-h-[86vh] sm:max-w-[520px] sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b px-5 pb-3 pt-4">
          <PriceIcon name="percent" />
          <h2 id="pos-prod-bulk-title" className="min-w-0 flex-1 text-[16px] font-bold">
            {tb("title")}
          </h2>
          <button type="button" data-testid="pos-prod-bulk-close" aria-label={tp("cancel")} disabled={busy} className="-mr-2 grid h-11 w-11 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={onClose}>
            <PriceIcon name="x" />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4 text-[13px]">
          {options.length === 0 ? (
            <p data-testid="pos-prod-bulk-nochannel" className="rounded-lg border border-dashed px-3 py-2 text-[12px] text-[color:var(--color-muted)]">
              {tb("noChannels")}
            </p>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-[color:var(--color-muted)]">{tb("channel")}</span>
              <select data-testid="pos-prod-bulk-channel" className="input h-11" value={code} disabled={busy} onChange={(e) => setCode(e.target.value)}>
                {options.map((c) => (
                  <option key={c.code} value={c.code}>
                    {channelDisplayName(c.code, c.name, tch)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-[color:var(--color-muted)]">{tb("percent")}</span>
              <input data-testid="pos-prod-bulk-pct" inputMode="decimal" className={`input h-11 w-28 text-right tabular-nums ${bp === null ? "border-[color:var(--color-danger)]" : ""}`} value={pct} disabled={busy} onChange={(e) => setPct(e.target.value)} />
            </label>
            <div role="radiogroup" aria-label={tb("round")} className="flex gap-1">
              <button type="button" role="radio" aria-checked={roundTo === 100} data-testid="pos-prod-bulk-round-100" disabled={busy} className={`min-h-11 rounded-lg border px-3 text-[12.5px] ${roundTo === 100 ? "border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-muted)]"}`} onClick={() => setRoundTo(100)}>
                {tb("roundBaht")}
              </button>
              <button type="button" role="radio" aria-checked={roundTo === 1} data-testid="pos-prod-bulk-round-1" disabled={busy} className={`min-h-11 rounded-lg border px-3 text-[12.5px] ${roundTo === 1 ? "border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-muted)]"}`} onClick={() => setRoundTo(1)}>
                {tb("roundSatang")}
              </button>
            </div>
          </div>
          {bp === null ? <p className="-mt-2 text-[11.5px] text-[color:var(--color-danger)]">{tb("pctInvalid")}</p> : null}
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-[color:var(--color-muted)]">{tb("scopeLabel")}</span>
            <div role="radiogroup" aria-label={tb("scopeLabel")} className="flex flex-wrap gap-1">
              <button type="button" role="radio" aria-checked={scope === "category"} data-testid="pos-prod-bulk-scope-category" disabled={busy || !category} className={`min-h-11 rounded-lg border px-3 text-[12.5px] disabled:opacity-50 ${scope === "category" ? "border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-muted)]"}`} onClick={() => setScope("category")}>
                {category ? tb("scopeCategory", { name: category.name }) : tb("scopeNoCategory")}
              </button>
              <button type="button" role="radio" aria-checked={scope === "selected"} data-testid="pos-prod-bulk-scope-selected" disabled={busy || !selected.length} className={`min-h-11 rounded-lg border px-3 text-[12.5px] disabled:opacity-50 ${scope === "selected" ? "border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-muted)]"}`} onClick={() => setScope("selected")}>
                {tb("scopeSelected", { count: selected.length })}
              </button>
            </div>
            <span className="text-[11.5px] text-[color:var(--color-muted)]">{tb("branchScope", { scope: scopeName })}</span>
            {tooMany ? <span className="text-[11.5px] text-[color:var(--color-danger)]">{tb("tooMany", { max: BULK_MARKUP_PRODUCTS_MAX })}</span> : null}
            {!list.length ? <span className="text-[11.5px] text-[color:var(--color-muted)]">{tb("needScope")}</span> : null}
          </div>
          {/* ตัวอย่าง 5 รายการแรก */}
          <div data-testid="pos-prod-bulk-preview" className="rounded-lg border">
            <div className="border-b px-3 py-1.5 text-[11.5px] font-bold text-[color:var(--color-muted)]">{tb(scope === "category" ? "previewCategory" : "preview")}</div>
            {list.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center gap-2 border-b px-3 py-1.5 text-[12.5px] last:border-b-0">
                <span className="min-w-0 flex-1 truncate">{nameOf(p)}</span>
                {p.basePriceSatang === null || p.soldByWeight ? (
                  <small className="text-[11px] text-[color:var(--color-muted)]">{tb("skipRow")}</small>
                ) : (
                  <span className="tabular-nums">
                    <span className="text-[color:var(--color-muted)]">{moneyText(p.basePriceSatang)}</span>
                    {" → "}
                    <b>{bp === null ? "—" : moneyText(channelMarkupPrice(p.basePriceSatang, bp, roundTo))}</b>
                  </span>
                )}
              </div>
            ))}
            {!list.length ? <div className="px-3 py-2 text-[12px] text-[color:var(--color-muted)]">—</div> : null}
          </div>
          <p className="text-[11.5px] text-[color:var(--color-muted)]">{tb("notSoldKept")}</p>
          {err ? (
            <p data-testid="pos-prod-bulk-error" role="alert" className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-[12px] text-[color:var(--color-danger)]">
              {err}
            </p>
          ) : null}
        </div>
        <div className="mt-auto flex gap-2 border-t px-5 py-3">
          <button type="button" data-testid="pos-prod-bulk-run" disabled={!canRun} className="btn btn-primary h-11 rounded-[11px] px-5 disabled:opacity-50" onClick={() => void run()}>
            {busy ? tb("running") : tb("apply")}
          </button>
          <button type="button" data-testid="pos-prod-bulk-cancel" disabled={busy} className="btn btn-ghost h-11 rounded-[11px] px-4" onClick={onClose}>
            {tp("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
