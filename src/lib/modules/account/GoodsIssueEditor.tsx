"use client";

import { useMemo, useState } from "react";
import { createGoodsMovementAction } from "./product-actions";

type ProductOpt = { id: string; name: string; sku: string | null; qtyOnHand: number };
type ContactOpt = { id: string; name: string };
type Row = { productId: string; qty: string; description: string };

const emptyRow = (): Row => ({ productId: "", qty: "1", description: "" });

// ตัวสร้างเอกสารเบิก/คืนสินค้า — เลือกสินค้า (GOODS) + จำนวน · ราคาไม่เกี่ยว (ตัดจำนวนเท่านั้น)
export default function GoodsIssueEditor({
  systemId,
  products,
  contacts,
}: {
  systemId: string;
  products: ProductOpt[];
  contacts: ContactOpt[];
}) {
  const [docType, setDocType] = useState<"GOODS_ISSUE" | "GOODS_ISSUE_RETURN">("GOODS_ISSUE");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [allowNegative, setAllowNegative] = useState(false);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const lines = rows
    .map((r) => ({ productId: r.productId, qty: Number(r.qty) || 0, description: r.description || null }))
    .filter((l) => l.productId && l.qty > 0);
  const canSubmit = lines.length > 0;

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  if (products.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-muted)]">
        ยังไม่มีสินค้าประเภท “สินค้า” (GOODS) — เพิ่มสินค้าก่อนจึงเบิกได้
      </p>
    );
  }

  return (
    <form action={createGoodsMovementAction} className="card flex flex-col gap-3">
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="docType" value={docType} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <input type="hidden" name="allowNegative" value={allowNegative ? "1" : "0"} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 text-sm">
          <button
            type="button"
            onClick={() => setDocType("GOODS_ISSUE")}
            className={`rounded-full border px-3 py-1.5 ${docType === "GOODS_ISSUE" ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface-2)]" : ""}`}
          >
            เบิกออก
          </button>
          <button
            type="button"
            onClick={() => setDocType("GOODS_ISSUE_RETURN")}
            className={`rounded-full border px-3 py-1.5 ${docType === "GOODS_ISSUE_RETURN" ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface-2)]" : ""}`}
          >
            ส่งคืน
          </button>
        </div>
        <select name="contactId" defaultValue="" className="input flex-1">
          <option value="">ผู้ติดต่อ (ไม่ระบุ)</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((r, i) => {
          const p = byId.get(r.productId);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={r.productId}
                onChange={(e) => setRow(i, { productId: e.target.value })}
                className="input min-w-[12rem] flex-1"
              >
                <option value="">— เลือกสินค้า —</option>
                {products.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                    {opt.sku ? ` (${opt.sku})` : ""} · คงเหลือ {opt.qtyOnHand}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="any"
                min="0"
                value={r.qty}
                onChange={(e) => setRow(i, { qty: e.target.value })}
                placeholder="จำนวน"
                className="input w-24"
              />
              <input
                value={r.description}
                onChange={(e) => setRow(i, { description: e.target.value })}
                placeholder="หมายเหตุบรรทัด"
                className="input flex-1"
              />
              {p && (
                <span className="text-xs text-[color:var(--color-muted)]">คงเหลือ {p.qtyOnHand}</span>
              )}
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  className="text-xs text-[color:var(--color-danger)]"
                >
                  ลบ
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, emptyRow()])}
          className="self-start text-sm text-[color:var(--color-muted)] underline"
        >
          + เพิ่มบรรทัด
        </button>
      </div>

      <textarea name="note" placeholder="หมายเหตุเอกสาร" className="input min-h-[3rem]" />

      {docType === "GOODS_ISSUE" && (
        <label className="flex items-center gap-2 text-xs text-[color:var(--color-muted)]">
          <input type="checkbox" checked={allowNegative} onChange={(e) => setAllowNegative(e.target.checked)} />
          อนุญาตให้สต็อกติดลบ (เบิกเกินยอดคงเหลือ)
        </label>
      )}

      <button disabled={!canSubmit} className="btn btn-primary self-start text-sm disabled:opacity-40">
        {docType === "GOODS_ISSUE" ? "บันทึกเบิกออก" : "บันทึกส่งคืน"}
      </button>
    </form>
  );
}
