"use client";

import { useState } from "react";
import { MoneyInput } from "./MoneyInput";
import { QtyInput } from "./QtyInput";
import { PercentOrAmountInput } from "./PercentOrAmountInput";
import { ProductPicker, type ProductSearchResult } from "./ProductPicker";
import { MoneyText } from "@/components/ui/MoneyText";
import type { DocTotalsLineOut } from "@/lib/modules/account/totals";
import {
  VAT_OPTIONS,
  WHT_TYPE_OPTIONS,
  type LedgerOption,
  type LineDraft,
  type ProductOption,
} from "./doc-editor-types";

// ─────────────────────────────────────────────────────────────
// DocLineTable — ส่วน C ของ DESIGN-SPEC-V2 §5.2 (ภาพอ้างอิง g1-invoice-form.png กลางหน้า)
// เดสก์ท็อป = ตาราง 10 คอลัมน์ · มือถือ (g17) = การ์ดต่อบรรทัด
// โหมดง่าย: ซ่อนคอลัมน์ "บัญชี" และ "หัก ณ ที่จ่าย" (BLUEPRINT §0.3-1)
// ─────────────────────────────────────────────────────────────

const TH = "px-1.5 py-2 text-left text-xs font-normal text-[color:var(--color-muted)]";
const TD = "px-1.5 py-2 align-top text-sm";

// 🔴 ตารางรายการต้อง "พอดีการ์ด" เสมอ (Fable QC ภาพจริง 3 ก.ย.: คอลัมน์ VAT ถูกตัด · ก่อนภาษี/🗑 หายทั้งคอลัมน์)
//    วิธี: `table-fixed` + ความกว้างเป็น % ที่รวมกันได้ 100 พอดี ⇒ ไม่ว่าการ์ดกว้างเท่าไร ตารางก็ไม่ล้น
//    (ห้ามใช้ min-w-[...] ต่อ cell เด็ดขาด — นั่นคือสาเหตุเดิมที่ดันตารางกว้างเกินการ์ด)
//    ลำดับคอลัมน์ตาม g1-invoice-form.png · โหมดง่ายตัด "บัญชี" + "หัก ณ ที่จ่าย" ออก แล้วปันส่วนคืนให้ชื่อสินค้า
const COL_W = {
  accountant: ["3%", "18%", "11%", "15%", "10%", "11%", "7%", "10%", "11%", "4%"],
  easy: ["4%", "30%", "16%", "13%", "13%", "9%", "11%", "4%"],
} as const;

export function DocLineTable({
  lines,
  breakdown,
  accounts,
  products,
  searchProducts,
  easy,
  requireLineAccount,
  defaultVatRateBp,
  invalidKeys,
  onChange,
  onRemove,
  onReorder,
}: {
  lines: LineDraft[];
  breakdown: DocTotalsLineOut[];
  accounts: LedgerOption[];
  products: ProductOption[];
  searchProducts: (q: string) => Promise<ProductOption[]>;
  easy: boolean;
  /** อัตรา VAT ของกิจการ — ใช้เมื่อสินค้าที่เลือกไม่ได้กำหนดอัตราไว้เอง (ห้ามฮาร์ดโค้ด 7%) */
  defaultVatRateBp: number;
  requireLineAccount: boolean;
  invalidKeys: Set<string>;
  onChange: (key: string, patch: Partial<LineDraft>) => void;
  onRemove: (key: string) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const productResults = (q: string): Promise<ProductSearchResult[]> =>
    searchProducts(q).then((rows) =>
      rows.map((p) => ({
        id: p.id,
        name: p.name,
        sub: p.sub,
        meta: { priceSatang: p.priceSatang, unit: p.unitName ?? undefined },
      })),
    );

  const applyProduct = (key: string, id: string, name: string) => {
    const p = products.find((x) => x.id === id);
    onChange(key, {
      productId: id,
      name,
      ...(p
        ? {
            unitPriceSatang: p.priceSatang,
            unitName: p.unitName ?? "",
            vatRateBp: p.vatRateBp ?? defaultVatRateBp,
            accountId: p.accountId,
          }
        : {}),
    });
  };

  const dragProps = (i: number) => ({
    draggable: true,
    onDragStart: () => setDragFrom(i),
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: () => {
      if (dragFrom !== null && dragFrom !== i) onReorder(dragFrom, i);
      setDragFrom(null);
    },
    onDragEnd: () => setDragFrom(null),
  });

  return (
    <>
      {/* ── เดสก์ท็อป ── */}
      {/* overflow-x-auto = ตาข่ายกันตาย (ปกติไม่ควรได้ใช้เพราะ % รวม 100) · min-w-0 จำเป็น ไม่งั้น flex item
          จะยืดออกนอกการ์ดแทนที่จะสกอลในตัวเอง = อาการ "ถูกตัด" ที่เจอในภาพจริง */}
      <div className="hidden w-full min-w-0 overflow-x-auto md:block" data-testid="line-table-wrap">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            {(easy ? COL_W.easy : COL_W.accountant).map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b">
              <th className={TH} aria-label="ลากเรียง" />
              <th className={TH}>สินค้า/บริการ</th>
              {!easy && <th className={TH}>บัญชี</th>}
              <th className={TH}>จำนวน/หน่วย</th>
              <th className={`${TH} text-right`}>ราคา/หน่วย</th>
              <th className={`${TH} text-right`}>ส่วนลด/หน่วย</th>
              <th className={TH}>VAT</th>
              <th className={`${TH} text-right`}>ก่อนภาษี</th>
              {!easy && <th className={TH}>หัก ณ ที่จ่าย</th>}
              <th className={TH} aria-label="ลบ" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const b = breakdown[i];
              const bad = invalidKeys.has(l.key);
              return (
                <tr
                  key={l.key}
                  className="border-b last:border-0"
                  style={bad ? { background: "color-mix(in srgb, var(--color-danger) 6%, transparent)" } : undefined}
                  data-testid={`line-${i}`}
                  {...dragProps(i)}
                >
                  <td className={`${TD} cursor-grab text-[color:var(--color-muted)]`} aria-label="ลากเพื่อเรียงลำดับ">
                    ⠿
                  </td>
                  <td className={`${TD} min-w-0`}>
                    <ProductPicker
                      defaultId={l.productId ?? undefined}
                      defaultLabel={l.name}
                      search={productResults}
                      onSelect={(r) => applyProduct(l.key, r.id, r.name)}
                      onQueryChange={(q) => onChange(l.key, { name: q, productId: null })}
                      testId={`line-${i}-product`}
                    />
                    {l.description || l.descriptionOpen ? (
                      <textarea
                        className="input mt-1 text-xs"
                        rows={2}
                        maxLength={1000}
                        placeholder="คำอธิบาย"
                        value={l.description}
                        onChange={(e) => onChange(l.key, { description: e.target.value })}
                        data-testid={`line-${i}-desc`}
                      />
                    ) : (
                      <button
                        type="button"
                        className="mt-1 text-xs text-[color:var(--color-accent)]"
                        onClick={() => onChange(l.key, { descriptionOpen: true })}
                      >
                        + เพิ่มคำอธิบาย
                      </button>
                    )}
                  </td>
                  {!easy && (
                    <td className={`${TD} min-w-0`}>
                      <select
                        className="input"
                        value={l.accountId ?? ""}
                        onChange={(e) => onChange(l.key, { accountId: e.target.value || null })}
                        data-testid={`line-${i}-account`}
                      >
                        <option value="">{requireLineAccount ? "— เลือกบัญชี —" : "ตามค่าเริ่มต้น"}</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className={`${TD} min-w-0`}>
                    <div className="flex min-w-0 items-center gap-1">
                      <QtyInput
                        value={l.qty}
                        onChange={(n) => onChange(l.key, { qty: n })}
                        step={1}
                        compact
                        testId={`line-${i}-qty`}
                      />
                      <input
                        className="input w-11 shrink-0 px-1 text-center"
                        placeholder="หน่วย"
                        value={l.unitName}
                        onChange={(e) => onChange(l.key, { unitName: e.target.value })}
                        aria-label="หน่วย"
                      />
                    </div>
                  </td>
                  <td className={`${TD} min-w-0`}>
                    <MoneyInput
                      value={l.unitPriceSatang}
                      onChangeSatang={(s) => onChange(l.key, { unitPriceSatang: s })}
                      testId={`line-${i}-price`}
                    />
                  </td>
                  <td className={`${TD} min-w-0`}>
                    <PercentOrAmountInput
                      namePrefix={`lineDiscount_${l.key}`}
                      defaultValue={{
                        mode: l.discount.mode,
                        amountSatang: l.discount.satang,
                        percentBp: l.discount.percentBp,
                      }}
                      onChange={(d) =>
                        onChange(l.key, {
                          discount: { mode: d.mode, satang: d.amountSatang, percentBp: d.percentBp },
                        })
                      }
                      compact
                      testId={`line-${i}-discount`}
                    />
                  </td>
                  <td className={TD}>
                    <select
                      className="input w-full min-w-0 px-1"
                      value={l.vatRateBp}
                      onChange={(e) => onChange(l.key, { vatRateBp: Number(e.target.value) })}
                      aria-label="VAT"
                      data-testid={`line-${i}-vat`}
                    >
                      {VAT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={`${TD} text-right tabular-nums`} data-testid={`line-${i}-net`}>
                    <MoneyText satang={b?.net ?? 0} decimals />
                  </td>
                  {!easy && (
                    <td className={`${TD} min-w-0`}>
                      <select
                        className="input"
                        value={l.whtIncomeType ?? ""}
                        onChange={(e) => {
                          const v = e.target.value || null;
                          const def = WHT_TYPE_OPTIONS.find((o) => o.value === v);
                          onChange(l.key, {
                            whtIncomeType: v,
                            whtRateBp: v ? (l.whtRateBp ?? def?.defaultRateBp ?? 300) : null,
                          });
                        }}
                        aria-label="ประเภทเงินได้ หัก ณ ที่จ่าย"
                        data-testid={`line-${i}-wht-type`}
                      >
                        <option value="">—</option>
                        {WHT_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {l.whtIncomeType && (
                        <select
                          className="input mt-1 w-full min-w-0 px-1"
                          value={l.whtRateBp ?? 0}
                          onChange={(e) => onChange(l.key, { whtRateBp: Number(e.target.value) })}
                          aria-label="อัตราหัก ณ ที่จ่าย"
                          data-testid={`line-${i}-wht-rate`}
                        >
                          {[0, 100, 200, 300, 500, 1000, 1500].map((bp) => (
                            <option key={bp} value={bp}>
                              {bp / 100}%
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  )}
                  <td className={TD}>
                    <button
                      type="button"
                      className="text-[color:var(--color-muted)]"
                      aria-label="ลบรายการ"
                      title="ลบรายการ"
                      onClick={() => onRemove(l.key)}
                      data-testid={`line-${i}-del`}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── มือถือ (g17): การ์ดต่อบรรทัด ── */}
      <div className="flex flex-col gap-3 md:hidden">
        {lines.map((l, i) => {
          const b = breakdown[i];
          return (
            <div
              key={l.key}
              className="rounded-lg border p-3"
              style={
                invalidKeys.has(l.key)
                  ? { background: "color-mix(in srgb, var(--color-danger) 6%, transparent)" }
                  : undefined
              }
              data-testid={`line-m-${i}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <ProductPicker
                    defaultId={l.productId ?? undefined}
                    defaultLabel={l.name}
                    search={productResults}
                    onSelect={(r) => applyProduct(l.key, r.id, r.name)}
                    onQueryChange={(q) => onChange(l.key, { name: q, productId: null })}
                  />
                </div>
                <button
                  type="button"
                  className="btn-sm h-9 w-9 shrink-0 px-0"
                  aria-label="ลบรายการ"
                  onClick={() => onRemove(l.key)}
                >
                  🗑
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                  จำนวน
                  <QtyInput value={l.qty} onChange={(n) => onChange(l.key, { qty: n })} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                  ราคา/หน่วย
                  <MoneyInput
                    value={l.unitPriceSatang}
                    onChangeSatang={(s) => onChange(l.key, { unitPriceSatang: s })}
                  />
                </label>
              </div>
              {!easy && (
                <label className="mt-2 flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                  บัญชี
                  <select
                    className="input"
                    value={l.accountId ?? ""}
                    onChange={(e) => onChange(l.key, { accountId: e.target.value || null })}
                  >
                    <option value="">{requireLineAccount ? "— เลือกบัญชี —" : "ตามค่าเริ่มต้น"}</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <select
                  className="input w-24"
                  value={l.vatRateBp}
                  onChange={(e) => onChange(l.key, { vatRateBp: Number(e.target.value) })}
                  aria-label="VAT"
                >
                  {VAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      VAT {o.label}
                    </option>
                  ))}
                </select>
                {!easy && (
                  <select
                    className="input flex-1"
                    value={l.whtIncomeType ?? ""}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      const def = WHT_TYPE_OPTIONS.find((o) => o.value === v);
                      onChange(l.key, {
                        whtIncomeType: v,
                        whtRateBp: v ? (l.whtRateBp ?? def?.defaultRateBp ?? 300) : null,
                      });
                    }}
                    aria-label="หัก ณ ที่จ่าย"
                  >
                    <option value="">ไม่หัก ณ ที่จ่าย</option>
                    {WHT_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm">
                <span className="text-[color:var(--color-muted)]">ยอด</span>
                <span className="font-medium tabular-nums">
                  <MoneyText satang={b?.net ?? 0} decimals />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default DocLineTable;
