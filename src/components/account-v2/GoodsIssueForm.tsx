"use client";

// GoodsIssueForm — ฟอร์มใบเบิกสินค้า PRR / ใบส่งคืน RPR (WO 4.3 · DESIGN-SPEC-V2 §8.4)
// เฟรมอ้างอิง: docs/design/account-v2/g12-goods-issue-form.png
// โครงบล็อกตามเฟรมเป๊ะ: ข้อมูลทั่วไป → รายการที่เบิก → ค่าใช้จ่ายที่ปรับปรุง → หมายเหตุ/แท็ก → แนบไฟล์
//                        → แถบแจ้งตัดสต็อก → ปุ่ม ยกเลิก / บันทึกร่าง / อนุมัติใบเบิกสินค้า
import Link from "next/link";
import { useMemo, useState } from "react";
import { AccountIcon } from "./AccountIcon";
import { DateInput } from "./DateInput";
import { DocAttachments } from "./DocAttachments";
import { createGoodsMovementAction } from "@/lib/modules/account/product-actions";

export type GoodsProductOpt = {
  id: string;
  name: string;
  code: string | null;
  sku: string | null;
  unitName: string | null;
  stock: number;
  costSatang: number;
  warehouseName: string | null;
  linked: boolean;
};
export type GoodsWarehouseOpt = { id: string; name: string; isDefault: boolean };
export type GoodsAccountOpt = { code: string; name: string };

type Row = { productId: string; qty: string; locationId: string };

const emptyRow = (): Row => ({ productId: "", qty: "1", locationId: "" });
const money = (satang: number) => `฿${(satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function GoodsIssueForm({
  systemId,
  docType,
  docNoPreview,
  today,
  reasons,
  products,
  warehouses,
  expenseAccounts,
  defaultAccountCode,
  cancelHref,
  storageEnabled,
  presetProductId,
  sourceDocId,
  sourceDocNo,
}: {
  systemId: string;
  docType: "GOODS_ISSUE" | "GOODS_ISSUE_RETURN";
  docNoPreview: string;
  today: string;
  reasons: readonly string[];
  products: GoodsProductOpt[];
  warehouses: GoodsWarehouseOpt[];
  expenseAccounts: GoodsAccountOpt[];
  defaultAccountCode: string;
  cancelHref: string;
  storageEnabled: boolean;
  presetProductId?: string;
  sourceDocId?: string | null;
  sourceDocNo?: string | null;
}) {
  const isIssue = docType === "GOODS_ISSUE";
  const label = isIssue ? "ใบเบิกสินค้า" : "ใบส่งคืนเบิกสินค้า";
  const [rows, setRows] = useState<Row[]>(() => [presetProductId ? { ...emptyRow(), productId: presetProductId } : emptyRow()]);
  const [accountCode, setAccountCode] = useState(defaultAccountCode);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const lines = rows
    .map((r) => ({ productId: r.productId, qty: Number(r.qty) || 0, locationId: r.locationId || null }))
    .filter((l) => l.productId && l.qty > 0);
  const totalQty = lines.reduce((n, l) => n + l.qty, 0);
  const totalCost = lines.reduce((n, l) => n + Math.round((byId.get(l.productId)?.costSatang ?? 0) * l.qty), 0);
  const canSubmit = lines.length > 0;

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const accName = expenseAccounts.find((a) => a.code === accountCode)?.name ?? "";

  if (products.length === 0) {
    return (
      <div className="card">
        <p className="text-sm text-[color:var(--color-muted)]">
          ยังไม่มีสินค้าที่มีสต็อก — เพิ่มสินค้าประเภท “สินค้า” ก่อนจึงจะเบิกได้
        </p>
      </div>
    );
  }

  return (
    <form action={createGoodsMovementAction} className="flex max-w-4xl flex-col gap-4 pb-24" data-testid="goods-issue-form">
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="docType" value={docType} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <input type="hidden" name="adjustAccountCode" value={accountCode} />
      <input type="hidden" name="allowNegative" value={allowNegative ? "1" : "0"} />
      {sourceDocId && <input type="hidden" name="sourceDocId" value={sourceDocId} />}
      {tags.map((t) => (
        <input key={t} type="hidden" name="tags" value={t} />
      ))}

      {/* ── ข้อมูลทั่วไป ── */}
      <section className="card" data-testid="gi-general">
        <h2 className="mb-3 text-sm font-bold">ข้อมูลทั่วไป</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            วันที่
            {/* 🔴 ห้ามใช้ input[type=date] ดิบ — เบราว์เซอร์โชว์ MM/DD/YYYY (บทเรียน WO 1.3) */}
            <DateInput name="issueDate" defaultValue={today} testId="gi-date" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            เลขที่เอกสาร
            <div className="relative">
              <input value={docNoPreview} readOnly className="input pr-8" data-testid="gi-docno" />
              <AccountIcon name="gear" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-muted)]" />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            อ้างอิง
            <input name="reference" maxLength={35} placeholder="คำขอเบิกอุปกรณ์ — สาขา" className="input" data-testid="gi-reference" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            {isIssue ? "สาเหตุการเบิก" : "เหตุผลการคืน"}
            <select name="adjustReason" defaultValue={reasons[0]} className="input" data-testid="gi-reason">
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)] sm:col-span-2">
            คำอธิบาย
            <textarea name="note" maxLength={512} placeholder="เบิกอุปกรณ์เสริมประจำเดือนให้หน้าร้าน" className="input min-h-[4.5rem]" data-testid="gi-note" />
          </label>
        </div>
        {sourceDocNo && (
          <p className="mt-2 text-xs text-[color:var(--color-muted)]">
            อ้างอิงใบเบิก <b>{sourceDocNo}</b>
          </p>
        )}
      </section>

      {/* ── รายการที่เบิก ── */}
      <section className="card" data-testid="gi-lines">
        <h2 className="mb-3 text-sm font-bold">{isIssue ? "รายการที่เบิก" : "รายการที่คืน"}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr>
                {["สินค้า", "จำนวน", "หน่วย", "คลัง", "ต้นทุน/หน่วย", "รวม", ""].map((h, i) => (
                  <th
                    key={h || i}
                    className={`border-b px-2 py-2 text-xs font-medium text-[color:var(--color-muted)] ${i >= 1 && i <= 1 ? "text-right" : i >= 4 && i <= 5 ? "text-right" : "text-left"}`}
                    style={{ borderColor: "var(--color-line)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const p = byId.get(r.productId);
                const qty = Number(r.qty) || 0;
                return (
                  <tr key={i} data-testid={`gi-row-${i}`}>
                    <td className="border-b px-2 py-2" style={{ borderColor: "var(--color-line)" }}>
                      <select value={r.productId} onChange={(e) => setRow(i, { productId: e.target.value })} className="input min-w-[14rem]" aria-label="สินค้า">
                        <option value="">— เลือกสินค้า —</option>
                        {products.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} · คงเหลือ {o.stock}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b px-2 py-2 text-right" style={{ borderColor: "var(--color-line)" }}>
                      <input
                        inputMode="decimal"
                        value={r.qty}
                        onChange={(e) => setRow(i, { qty: e.target.value })}
                        className="input w-20 text-right"
                        aria-label="จำนวน"
                        data-testid={`gi-qty-${i}`}
                      />
                    </td>
                    <td className="border-b px-2 py-2 text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                      {p?.unitName ?? "—"}
                    </td>
                    <td className="border-b px-2 py-2" style={{ borderColor: "var(--color-line)" }}>
                      {warehouses.length > 0 ? (
                        <select value={r.locationId} onChange={(e) => setRow(i, { locationId: e.target.value })} className="input min-w-[9rem]" aria-label="คลัง">
                          <option value="">{p?.warehouseName ?? "คลังหลัก"}</option>
                          {warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[color:var(--color-muted)]">—</span>
                      )}
                    </td>
                    <td className="border-b px-2 py-2 text-right tabular-nums" style={{ borderColor: "var(--color-line)" }}>
                      {p ? money(p.costSatang) : "—"}
                    </td>
                    <td className="border-b px-2 py-2 text-right font-semibold tabular-nums" style={{ borderColor: "var(--color-line)" }} data-testid={`gi-line-total-${i}`}>
                      {p ? money(Math.round(p.costSatang * qty)) : "—"}
                    </td>
                    <td className="border-b px-2 py-2 text-right" style={{ borderColor: "var(--color-line)" }}>
                      {rows.length > 1 && (
                        <button type="button" aria-label="ลบรายการ" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-[color:var(--color-muted)]">
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => setRows((rs) => [...rs, emptyRow()])} className="mt-2 text-sm font-semibold" style={{ color: "var(--color-accent)" }} data-testid="gi-add-line">
          + เพิ่มรายการ
        </button>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm" style={{ borderColor: "var(--color-line)" }}>
          <span>
            จำนวนทั้งสิ้น <b data-testid="gi-total-qty">{totalQty}</b> รายการ
          </span>
          <span>
            มูลค่าต้นทุน <b data-testid="gi-total-cost">{money(totalCost)}</b>
          </span>
        </div>
      </section>

      {/* ── ค่าใช้จ่ายที่ปรับปรุง ── */}
      <section className="card" data-testid="gi-adjust-expense">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold">ค่าใช้จ่ายที่ปรับปรุง</h2>
          <span className="flex-1" />
          <span className="text-xs text-[color:var(--color-muted)]">ลงบัญชีอัตโนมัติเมื่ออนุมัติ</span>
        </div>
        {/* มือถือ 390: ตารางนี้ต้องอยู่ในกล่องเลื่อนแนวนอนด้วย ไม่งั้นคอลัมน์ "จำนวนเงิน" ดันหน้าล้น 6px */}
        <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b px-2 py-2 text-left text-xs font-medium text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                บัญชี (Dr)
              </th>
              <th className="border-b px-2 py-2 text-right text-xs font-medium text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                จำนวนเงิน
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-2 py-2">
                <select value={accountCode} onChange={(e) => setAccountCode(e.target.value)} className="input w-full sm:min-w-[18rem]" aria-label="บัญชีค่าใช้จ่ายที่ปรับปรุง" data-testid="gi-account">
                  {expenseAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-2 text-right font-semibold tabular-nums" data-testid="gi-adjust-amount">
                {money(totalCost)} <span className="text-xs font-normal text-[color:var(--color-muted)]">(auto)</span>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
        <p className="mt-1 text-xs text-[color:var(--color-muted)]">
          {isIssue ? `Dr ${accountCode} ${accName} / Cr 1200 สินค้าคงเหลือ` : `Dr 1200 สินค้าคงเหลือ / Cr ${accountCode} ${accName}`}
        </p>
      </section>

      {/* ── หมายเหตุ | แท็ก ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          หมายเหตุ
          <input name="internalNote" placeholder="ตรวจนับสต็อกทุกสิ้นเดือน" className="input" data-testid="gi-internal-note" />
        </label>
        <div className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          แท็ก
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs" style={{ borderColor: "var(--color-line)" }}>
                {t}
                <button type="button" aria-label={`ลบแท็ก ${t}`} onClick={() => setTags((prev) => prev.filter((x) => x !== t))}>
                  ✕
                </button>
              </span>
            ))}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const v = tagDraft.trim();
                if (v && !tags.includes(v)) setTags((prev) => [...prev, v]);
                setTagDraft("");
              }}
              placeholder="+ เพิ่ม"
              className="input w-28"
              aria-label="เพิ่มแท็ก"
              data-testid="gi-tag-input"
            />
          </div>
        </div>
      </div>

      {/* ── แนบไฟล์ ── */}
      <section data-testid="gi-attachments">
        <h2 className="mb-2 text-xs text-[color:var(--color-muted)]">แนบไฟล์</h2>
        <DocAttachments systemId={systemId} storageEnabled={storageEnabled} initial={[]} />
      </section>

      {/* ── แถบแจ้ง ── */}
      <div
        className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm"
        style={{ borderColor: "var(--color-accent)", background: "color-mix(in srgb, var(--color-accent) 8%, transparent)" }}
        data-testid="gi-hint"
      >
        <AccountIcon name="info" className="h-4 w-4 shrink-0" />
        สินค้าที่ผูกกับคลังจะ{isIssue ? "ตัด" : "คืน"}สต็อกในคลังสินค้าอัตโนมัติเมื่ออนุมัติ
      </div>

      {isIssue && (
        <label className="flex items-center gap-2 text-xs text-[color:var(--color-muted)]">
          <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
          อนุญาตให้สต็อกติดลบ (เบิกเกินยอดคงเหลือ)
        </label>
      )}

      {/* ── ปุ่มท้าย ── */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: "var(--color-line)" }}>
        <Link href={cancelHref} className="btn btn-ghost">
          ยกเลิก
        </Link>
        <button type="submit" name="asDraft" value="1" className="btn-sm" disabled={!canSubmit} data-testid="gi-save-draft">
          บันทึกร่าง
        </button>
        <button type="submit" name="asDraft" value="0" className="btn btn-primary" disabled={!canSubmit} data-testid="gi-approve">
          อนุมัติ{label}
        </button>
      </div>
    </form>
  );
}

export default GoodsIssueForm;
