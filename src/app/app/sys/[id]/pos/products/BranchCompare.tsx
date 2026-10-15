"use client";

// BranchCompare.tsx — แผ่น "เทียบราคาสาขา" ของจอ 06 (POS P2.11U · มติ 5 · ภาพ 06 "ขายที่ N สาขา")
//   unitPriceMatrixAction ครั้งเดียวต่อการเปิด/เปลี่ยนชุดสาขา (ไม่โพล) · สินค้า = รายการที่เห็นอยู่ (≤ 500 ต่อครั้ง) ·
//   แถว = สินค้า · คอลัมน์ = สาขา × ช่องทาง · ช่อง = ราคาจริงของหน้าขาย (unitPriceSatang) — ตั้งไว้ (ไม่ใช่ราคาปกติ) = ตัวหนา ·
//   ราคาปกติ = จาง · PRICE_NOT_SET = "—" · CHANNEL_NOT_SOLD = "ไม่ขาย" · สินค้าของสาขาเดียวที่สาขาอื่น = ไม่ขายที่สาขานี้ (จอซ่อนตามสัญญา) ·
//   ชิปเลือกช่องทาง (กรองฝั่งจอ ไม่เรียกซ้ำ) · ชิปเลือกสาขา (เปลี่ยน = เรียกใหม่ 1 ครั้ง) · 390 = เลื่อนแนวนอน + คอลัมน์สินค้าติดซ้าย
// 🔴 อ่านอย่างเดียว · ไม่มีข้อความไทยนอกคอมเมนต์ · เงินจากเซิร์ฟเวอร์ (จอจัดรูปอย่างเดียว)

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { unitPriceMatrixAction } from "@/lib/modules/pos/catalog-price-actions";
import { BULK_MARKUP_PRODUCTS_MAX } from "@/lib/modules/pos/price-shared";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { channelDisplayName } from "@/components/pos/settings/channel-text";
import { PriceIcon, priceReasonText, priceRefusalText, type PT } from "@/components/pos/products/price-ui";
import type { ProductsChannel, ProductsRow } from "./products-data";

type Matrix = Extract<Awaited<ReturnType<typeof unitPriceMatrixAction>>, { ok: true }>;
type Props = {
  systemId: string;
  units: { id: string; name: string }[];
  channels: ProductsChannel[];
  products: ProductsRow[];
  nameOf: (p: ProductsRow) => string;
  onClose: () => void;
};

export function BranchCompare({ systemId, units, channels, products, nameOf, onClose }: Props) {
  const t = useTranslations("pos.products.branch.compare") as PT;
  const tprod = useTranslations("pos.products") as PT;
  const tp = useTranslations("pos.price") as PT;
  const treg = useTranslations("pos.register") as PT;
  const tch = useTranslations("pos.channel") as PT;
  const [unitSel, setUnitSel] = useState<string[]>(() => units.map((u) => u.id));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [m, setM] = useState<Matrix | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const list = useMemo(() => products.slice(0, BULK_MARKUP_PRODUCTS_MAX), [products]);
  const ids = useMemo(() => list.map((p) => p.id), [list]);
  const unitKey = unitSel.join(",");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // คำขอเดียวต่อการเปิด/เปลี่ยนชุดสาขา — ผลของคำขอเก่าทิ้งด้วยลำดับ
  useEffect(() => {
    if (!ids.length || !unitSel.length) {
      setM(null);
      return;
    }
    const my = ++seq.current;
    setLoading(true);
    setErr(null);
    unitPriceMatrixAction({ systemId, productIds: ids, unitIds: unitKey.split(",") })
      .then((r) => {
        if (my !== seq.current) return;
        if (r.ok) setM(r);
        else {
          setM(null);
          setErr(priceReasonText(r, tp) ?? priceRefusalText(r, false, tp, treg));
        }
      })
      .catch(() => {
        if (my === seq.current) setErr(tp("errors.unknown"));
      })
      .finally(() => {
        if (my === seq.current) setLoading(false);
      });
    // tp/treg คงที่ต่อภาษา — ไม่ใส่ใน deps (กันยิงซ้ำ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemId, ids, unitKey]);

  const cellOf = useMemo(() => {
    const map = new Map<string, Matrix["cells"][number]>();
    for (const c of m?.cells ?? []) map.set(`${c.productId}|${c.unitId}|${c.channelCode}`, c);
    return map;
  }, [m]);
  const codes = (m?.channelCodes ?? []).filter((c) => !hidden.has(c));
  const mUnits = m?.units ?? [];
  const chName = (code: string) => {
    const c = channels.find((x) => x.code === code);
    return channelDisplayName(code, c?.name ?? code, tch);
  };
  const toggleUnit = (id: string) => setUnitSel((s) => (s.includes(id) ? (s.length > 1 ? s.filter((x) => x !== id) : s) : units.map((u) => u.id).filter((x) => x === id || s.includes(x))));
  const toggleCode = (code: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(code)) n.delete(code);
      else if ((m?.channelCodes.length ?? 0) - n.size > 1) n.add(code);
      return n;
    });

  const cell = (p: ProductsRow, unitId: string, code: string) => {
    if (p.unitId !== null && p.unitId !== unitId) return <span className="text-[11px] text-[color:var(--color-muted)]">{tprod("notSoldHere")}</span>;
    const c = cellOf.get(`${p.id}|${unitId}|${code}`);
    if (!c) return <span className="text-[color:var(--color-muted)]">—</span>;
    if (c.refusal === "CHANNEL_NOT_SOLD") return <span className="text-[11.5px] text-[color:var(--color-muted)]">{t("notSold")}</span>;
    if (c.refusal === "PRICE_NOT_SET" || c.unitPriceSatang === null) return <span className="text-[color:var(--color-muted)]">—</span>;
    return <span className={`tabular-nums ${c.source === "BASE" ? "text-[color:var(--color-muted)]" : "font-bold"}`}>{moneyText(c.unitPriceSatang)}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="pos-prod-compare-title" data-testid="pos-prod-compare" className="flex max-h-full w-full flex-col bg-[color:var(--color-surface)] shadow-lg sm:max-w-[1400px] sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b px-5 pb-3 pt-4">
          <PriceIcon name="tag" />
          <h2 id="pos-prod-compare-title" className="min-w-0 flex-1 text-[16px] font-bold">
            {t("title", { count: unitSel.length })}
          </h2>
          <button type="button" data-testid="pos-prod-compare-close" aria-label={t("close")} className="-mr-2 grid h-11 w-11 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={onClose}>
            <PriceIcon name="x" />
          </button>
        </div>
        <div className="flex flex-col gap-2 border-b px-5 py-3 text-[12.5px]">
          {units.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[12px] font-bold text-[color:var(--color-muted)]">{t("units")}</span>
              {units.map((u) => {
                const on = unitSel.includes(u.id);
                return (
                  <button key={u.id} type="button" role="switch" aria-checked={on} data-testid={`pos-prod-compare-unit-${u.id}`} className={`inline-flex min-h-11 items-center rounded-[10px] border px-3 ${on ? "border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-muted)]"}`} onClick={() => toggleUnit(u.id)}>
                    {u.name}
                  </button>
                );
              })}
            </div>
          ) : null}
          {m && m.channelCodes.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[12px] font-bold text-[color:var(--color-muted)]">{t("channels")}</span>
              {m.channelCodes.map((code) => {
                const on = !hidden.has(code);
                return (
                  <button key={code} type="button" role="switch" aria-checked={on} data-testid={`pos-prod-compare-code-${code}`} className={`inline-flex min-h-11 items-center rounded-[10px] border px-3 ${on ? "border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-muted)]"}`} onClick={() => toggleCode(code)}>
                    {chName(code)}
                  </button>
                );
              })}
            </div>
          ) : null}
          <p className="text-[11.5px] text-[color:var(--color-muted)]">
            {t("legend")}
            {products.length > list.length ? ` · ${t("capped", { shown: list.length, total: products.length, max: BULK_MARKUP_PRODUCTS_MAX })}` : ""}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {!list.length ? (
            <p className="px-5 py-8 text-center text-[13px] text-[color:var(--color-muted)]">{t("empty")}</p>
          ) : err ? (
            <p data-testid="pos-prod-compare-error" role="alert" className="m-5 rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-[12px] text-[color:var(--color-danger)]">
              {err}
            </p>
          ) : !m || loading ? (
            <p className="px-5 py-8 text-center text-[13px] text-[color:var(--color-muted)]">{t("loading")}</p>
          ) : (
            <table className="w-max min-w-full border-separate border-spacing-0 text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] text-[color:var(--color-muted)]">
                  <th rowSpan={2} className="sticky left-0 top-0 z-20 min-w-[160px] border-b border-r bg-[color:var(--color-surface-2)] px-3 py-2 font-semibold">
                    {t("product")}
                  </th>
                  {mUnits.map((u) => (
                    <th key={u.unitId} colSpan={codes.length} className="sticky top-0 z-10 border-b border-r bg-[color:var(--color-surface-2)] px-3 py-2 text-center font-semibold text-[color:var(--color-ink)]">
                      {u.name}
                    </th>
                  ))}
                </tr>
                <tr className="text-[11px] text-[color:var(--color-muted)]">
                  {mUnits.flatMap((u) =>
                    codes.map((code, i) => (
                      <th key={`${u.unitId}|${code}`} className={`sticky top-[33px] z-10 whitespace-nowrap border-b bg-[color:var(--color-surface-2)] px-3 py-1.5 text-right font-semibold ${i === codes.length - 1 ? "border-r" : ""}`}>
                        {chName(code)}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="sticky left-0 z-10 max-w-[220px] border-b border-r bg-[color:var(--color-surface)] px-3 py-2 text-left font-semibold">
                      <span className="block truncate">{nameOf(p)}</span>
                    </th>
                    {mUnits.flatMap((u) =>
                      codes.map((code, i) => (
                        <td key={`${u.unitId}|${code}`} data-testid={`pos-prod-compare-cell-${p.id}-${u.unitId}-${code}`} className={`whitespace-nowrap border-b px-3 py-2 text-right ${i === codes.length - 1 ? "border-r" : ""}`}>
                          {cell(p, u.unitId, code)}
                        </td>
                      )),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
