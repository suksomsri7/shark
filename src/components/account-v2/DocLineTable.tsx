"use client";

import { useEffect, useState } from "react";
import { MoneyInput } from "./MoneyInput";
import { QtyInput } from "./QtyInput";
import { PercentOrAmountInput } from "./PercentOrAmountInput";
import { ProductPicker, type ProductSearchResult } from "./ProductPicker";
import { MoneyText } from "@/components/ui/MoneyText";
import { Modal } from "./Modal";
import { RowActions } from "./RowActions";
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
//    รอบ 3 (Fable QC ภาพจริง): เกลี่ยใหม่ — "จำนวน/หน่วย" ต้องพอให้เห็นตัวเลข · "บัญชี"/"หัก ณ ที่จ่าย"
//    ต้องอ่านออกอย่างน้อย ~8 ตัวอักษรไทย ("ตามค่าเริ่มต้น" / "40(8) บริการ") · ดึงที่มาจาก "สินค้า/บริการ"
//    ซึ่งเหลือเฟือ (พิมพ์ยาวได้เพราะ input เลื่อนเองอยู่แล้ว)
const COL_W = {
  //           ⠿   สินค้า  บัญชี  จำนวน/หน่วย  ราคา  ส่วนลด  VAT  ก่อนภาษี  WHT  🗑
  accountant: ["3%", "15%", "13%", "17%", "10%", "9%", "7%", "10%", "13%", "3%"],
  //     ⠿   สินค้า  จำนวน/หน่วย  ราคา  ส่วนลด  VAT  ก่อนภาษี  🗑
  easy: ["3%", "22%", "19%", "14%", "14%", "9%", "16%", "3%"],
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
  whtRateByIncomeType,
  invalidKeys,
  onChange,
  onRemove,
  onReorder,
  onDuplicate,
  autoEditKey,
  onAutoEditConsumed,
}: {
  lines: LineDraft[];
  breakdown: DocTotalsLineOut[];
  accounts: LedgerOption[];
  products: ProductOption[];
  searchProducts: (q: string) => Promise<ProductOption[]>;
  easy: boolean;
  /** อัตรา VAT ของกิจการ — ใช้เมื่อสินค้าที่เลือกไม่ได้กำหนดอัตราไว้เอง (ห้ามฮาร์ดโค้ด 7%) */
  defaultVatRateBp: number;
  /** WO 8.2 (§9.3): อัตรา WHT เริ่มต้นต่อประเภทเงินได้ตามนโยบายร้าน (ไม่มี = ใช้อัตราตามกฎหมาย) */
  whtRateByIncomeType?: Record<string, number>;
  requireLineAccount: boolean;
  invalidKeys: Set<string>;
  onChange: (key: string, patch: Partial<LineDraft>) => void;
  onRemove: (key: string) => void;
  onReorder: (from: number, to: number) => void;
  /** WO 9.1 รอบ 2 (§13 · g17): "ทำซ้ำ" ในเมนู ⋯ ของการ์ดมือถือ — คัดลอกบรรทัดปัจจุบันเป็นบรรทัดใหม่ */
  onDuplicate: (key: string) => void;
  /** WO 9.1 รอบ 2: เปิดแผ่นแก้ไขของบรรทัดที่เพิ่งสร้าง (ใช้ตอนกด "+ เพิ่มรายการ" บนมือถือ) — key ของบรรทัดใหม่ */
  autoEditKey?: string | null;
  onAutoEditConsumed?: () => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  // WO 9.1 รอบ 2 (§13 · g17): การ์ดมือถือเป็น "อ่านอย่างเดียว" — แก้ผ่านแผ่นเต็มจอเท่านั้น (ไม่ใช่กรอกในการ์ดตรง ๆ แบบเดิม)
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const editingLine = lines.find((l) => l.key === editingKey) ?? null;
  const editingIndex = lines.findIndex((l) => l.key === editingKey);
  useEffect(() => {
    if (autoEditKey) {
      setEditingKey(autoEditKey);
      onAutoEditConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEditKey]);

  // ── WO 8.2 (§9.3) ตัวช่วยค่าเริ่มต้นหัก ณ ที่จ่าย ──
  /** อัตราเริ่มต้นของประเภทเงินได้: นโยบายร้านก่อน → อัตราตามกฎหมาย → 3% */
  const whtRateOf = (incomeType: string): number =>
    whtRateByIncomeType?.[incomeType] ?? WHT_TYPE_OPTIONS.find((o) => o.value === incomeType)?.defaultRateBp ?? 300;
  /**
   * เลือก "บัญชี" ของบรรทัด → เติมประเภทเงินได้/อัตราให้ตามนโยบาย
   * 🔴 เติมเฉพาะตอนบรรทัดยัง**ไม่เคยเลือก**ประเภทเงินได้ — ไม่ทับค่าที่ผู้ใช้ตั้งเอง
   */
  const patchForAccount = (l: LineDraft, accountId: string | null): Partial<LineDraft> => {
    const patch: Partial<LineDraft> = { accountId };
    if (l.whtIncomeType) return patch;
    const acc = accountId ? accounts.find((a) => a.id === accountId) : null;
    if (acc?.whtIncomeType) {
      patch.whtIncomeType = acc.whtIncomeType;
      patch.whtRateBp = acc.whtRateBp ?? whtRateOf(acc.whtIncomeType);
    }
    return patch;
  };

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
                        onChange={(e) => onChange(l.key, patchForAccount(l, e.target.value || null))}
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
                        className="input w-10 shrink-0 px-1 text-center"
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
                          onChange(l.key, {
                            whtIncomeType: v,
                            whtRateBp: v ? (l.whtRateBp ?? whtRateOf(v)) : null,
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

      {/* ── มือถือ (g17): การ์ด "อ่านอย่างเดียว" ต่อบรรทัด — แก้ผ่านแผ่นเต็มจอ (⋯ → แก้ไข) เท่านั้น ── */}
      <div className="flex flex-col gap-3 md:hidden">
        {lines.map((l, i) => {
          const b = breakdown[i];
          const acc = l.accountId ? accounts.find((a) => a.id === l.accountId) : undefined;
          const accountText = l.accountId
            ? (acc ? `${acc.code} · ${acc.name}` : "—")
            : requireLineAccount
              ? "— ยังไม่เลือกบัญชี —"
              : "ตามค่าเริ่มต้น";
          const vatText = VAT_OPTIONS.find((o) => o.value === l.vatRateBp)?.label ?? `${l.vatRateBp / 100}%`;
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
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {l.name.trim() || <span className="text-[color:var(--color-muted)]">(ยังไม่มีชื่อสินค้า)</span>}
                </span>
                <RowActions
                  testId={`line-m-${i}-actions`}
                  label="ทำรายการ"
                  items={[
                    { label: "แก้ไข", onClick: () => setEditingKey(l.key) },
                    { label: "ทำซ้ำ", onClick: () => onDuplicate(l.key) },
                    // เหมือนปุ่ม 🗑 ของเดสก์ท็อปเป๊ะ — ลบทันทีไม่มีกล่องยืนยัน (บรรทัดยังไม่บันทึกจริงจนกว่าจะกดบันทึกร่าง/อนุมัติ)
                    { label: "ลบ", onClick: () => onRemove(l.key), danger: true },
                  ]}
                />
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-muted)]">
                {l.qty} {l.unitName} × <MoneyText satang={l.unitPriceSatang} decimals />
              </div>
              {!easy && <div className="mt-1 truncate text-xs text-[color:var(--color-muted)]">บัญชี: {accountText}</div>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="rounded-lg border px-2 py-0.5 text-xs">VAT {vatText}</span>
                {l.whtIncomeType && (
                  <span className="rounded-lg border px-2 py-0.5 text-xs">
                    หัก ณ ที่จ่าย {((l.whtRateBp ?? whtRateOf(l.whtIncomeType)) / 100).toString()}%
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm">
                <span className="text-[color:var(--color-muted)]">ยอด</span>
                <span className="font-medium tabular-nums" data-testid={`line-m-${i}-net`}>
                  <MoneyText satang={b?.net ?? 0} decimals />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── แผ่นแก้ไขบรรทัดเต็มจอ (มือถือเท่านั้น — เดสก์ท็อปแก้ตรงตารางเหมือนเดิม) ── */}
      <Modal
        open={!!editingLine}
        onClose={() => setEditingKey(null)}
        title={editingLine?.name.trim() || "แก้ไขรายการ"}
        size="md"
        sheetOnMobile
        testId="line-edit-sheet"
        actions={
          <button type="button" className="btn btn-primary h-11 text-sm md:h-9" onClick={() => setEditingKey(null)} data-testid="line-edit-done">
            เสร็จ
          </button>
        }
      >
        {editingLine && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              สินค้า/บริการ
              <ProductPicker
                defaultId={editingLine.productId ?? undefined}
                defaultLabel={editingLine.name}
                search={productResults}
                onSelect={(r) => applyProduct(editingLine.key, r.id, r.name)}
                onQueryChange={(q) => onChange(editingLine.key, { name: q, productId: null })}
                testId={`line-m-edit-product`}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                จำนวน
                <QtyInput
                  value={editingLine.qty}
                  onChange={(n) => onChange(editingLine.key, { qty: n })}
                  testId="line-m-edit-qty"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                ราคา/หน่วย
                <MoneyInput
                  value={editingLine.unitPriceSatang}
                  onChangeSatang={(s) => onChange(editingLine.key, { unitPriceSatang: s })}
                  testId="line-m-edit-price"
                />
              </label>
            </div>
            {!easy && (
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                บัญชี
                <select
                  className="input"
                  value={editingLine.accountId ?? ""}
                  onChange={(e) => onChange(editingLine.key, patchForAccount(editingLine, e.target.value || null))}
                  data-testid="line-m-edit-account"
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
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                VAT
                <select
                  className="input"
                  value={editingLine.vatRateBp}
                  onChange={(e) => onChange(editingLine.key, { vatRateBp: Number(e.target.value) })}
                  data-testid="line-m-edit-vat"
                >
                  {VAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      VAT {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {!easy && (
                <label className="flex flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                  หัก ณ ที่จ่าย
                  <select
                    className="input"
                    value={editingLine.whtIncomeType ?? ""}
                    onChange={(e) => {
                      const v = e.target.value || null;
                      onChange(editingLine.key, {
                        whtIncomeType: v,
                        whtRateBp: v ? (editingLine.whtRateBp ?? whtRateOf(v)) : null,
                      });
                    }}
                    data-testid="line-m-edit-wht"
                  >
                    <option value="">ไม่หัก ณ ที่จ่าย</option>
                    {WHT_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-[color:var(--color-muted)]">ยอด</span>
              <span className="font-semibold tabular-nums">
                <MoneyText satang={breakdown[editingIndex]?.net ?? 0} decimals />
              </span>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default DocLineTable;
