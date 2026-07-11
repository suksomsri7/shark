"use client";

import { useMemo, useState } from "react";
import { createDocumentAction, updateDocumentAction } from "./actions";

type ContactOpt = { id: string; name: string };
type Row = { description: string; qty: string; unitName: string; unitPrice: string; discount: string };

type Line = { description: string; qty: number; unitName: string | null; unitPrice: number; discount: number };

const emptyRow = (): Row => ({ description: "", qty: "1", unitName: "", unitPrice: "", discount: "" });

const inputCls = "rounded-lg border px-2 py-1.5 text-sm";
const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ตัวแก้เอกสาร (สร้าง/แก้ DRAFT) — บรรทัดสินค้าเพิ่ม/ลบได้ + พรีวิวยอด · ราคาเป็นบาท
export default function DocEditor({
  systemId,
  docType,
  docLabel,
  contacts,
  vatRateBp,
  vatRegistered,
  editId,
  initial,
}: {
  systemId: string;
  docType: string;
  docLabel: string;
  contacts: ContactOpt[];
  vatRateBp: number;
  vatRegistered: boolean;
  editId?: string;
  initial?: {
    contactId: string | null;
    issueDate: string;
    dueDate: string | null;
    validUntil: string | null;
    vatMode: string;
    discountAmount: number; // สตางค์
    note: string | null;
    lines: Line[];
  };
}) {
  const isQuote = docType === "QUOTATION";
  const [rows, setRows] = useState<Row[]>(
    initial && initial.lines.length
      ? initial.lines.map((l) => ({
          description: l.description,
          qty: String(l.qty),
          unitName: l.unitName ?? "",
          unitPrice: String(l.unitPrice / 100),
          discount: String(l.discount / 100),
        }))
      : [emptyRow()],
  );
  const [vatMode, setVatMode] = useState(initial?.vatMode ?? "EXCLUDE");
  const [discount, setDiscount] = useState(initial ? String(initial.discountAmount / 100) : "");

  const update = (i: number, k: keyof Row, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const delRow = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r));

  const { subTotal, vat, grand, linesJson } = useMemo(() => {
    const parsed = rows
      .map((r) => ({
        description: r.description.trim(),
        qty: Number(r.qty) || 0,
        unitName: r.unitName || null,
        unitPrice: Number(r.unitPrice) || 0, // บาท
        discount: Number(r.discount) || 0, // บาท
        vatRateBp,
      }))
      .filter((r) => r.description.length > 0);
    const sub = parsed.reduce((s, r) => s + Math.max(0, r.qty * r.unitPrice - r.discount), 0);
    const disc = Number(discount) || 0;
    const afterDisc = Math.max(0, sub - disc);
    const rate = vatMode === "NONE" || !vatRegistered ? 0 : vatRateBp / 10000;
    let v = 0;
    let g = afterDisc;
    if (rate > 0) {
      if (vatMode === "INCLUDE") {
        const net = afterDisc / (1 + rate);
        v = afterDisc - net;
      } else {
        v = afterDisc * rate;
        g = afterDisc + v;
      }
    }
    return { subTotal: sub, vat: v, grand: g, linesJson: JSON.stringify(parsed) };
  }, [rows, discount, vatMode, vatRateBp, vatRegistered]);

  const action = editId ? updateDocumentAction : createDocumentAction;

  return (
    <form action={action} className="card flex flex-col gap-4">
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="docType" value={docType} />
      {editId && <input type="hidden" name="id" value={editId} />}
      <input type="hidden" name="lines" value={linesJson} />

      <h2 className="text-sm font-medium">{editId ? "แก้ไข" : "สร้าง"}{docLabel}</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ผู้ติดต่อ
          <select name="contactId" defaultValue={initial?.contactId ?? ""} className={inputCls}>
            <option value="">— ไม่ระบุ —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          วันที่เอกสาร
          <input type="date" name="issueDate" defaultValue={initial?.issueDate ?? ""} className={inputCls} />
        </label>
        {isQuote ? (
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ยืนราคาถึง
            <input type="date" name="validUntil" defaultValue={initial?.validUntil ?? ""} className={inputCls} />
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ครบกำหนดชำระ
            <input type="date" name="dueDate" defaultValue={initial?.dueDate ?? ""} className={inputCls} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ภาษีมูลค่าเพิ่ม
          <select name="vatMode" value={vatMode} onChange={(e) => setVatMode(e.target.value)} className={inputCls}>
            <option value="EXCLUDE">แยก VAT ({vatRateBp / 100}%)</option>
            <option value="INCLUDE">รวม VAT แล้ว ({vatRateBp / 100}%)</option>
            <option value="NONE">ไม่มี VAT</option>
          </select>
        </label>
      </div>

      {/* บรรทัดสินค้า/บริการ */}
      <div className="flex flex-col gap-2">
        <div className="hidden gap-2 text-xs text-[color:var(--color-muted)] sm:grid sm:grid-cols-[1fr_70px_70px_100px_90px_28px]">
          <span>รายการ</span><span>จำนวน</span><span>หน่วย</span><span>ราคา/หน่วย</span><span>ส่วนลด</span><span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_70px_70px_100px_90px_28px]">
            <input value={r.description} onChange={(e) => update(i, "description", e.target.value)} placeholder="รายละเอียด" className={`${inputCls} col-span-2 sm:col-span-1`} />
            <input value={r.qty} onChange={(e) => update(i, "qty", e.target.value)} type="number" step="0.01" placeholder="จำนวน" className={inputCls} />
            <input value={r.unitName} onChange={(e) => update(i, "unitName", e.target.value)} placeholder="หน่วย" className={inputCls} />
            <input value={r.unitPrice} onChange={(e) => update(i, "unitPrice", e.target.value)} type="number" step="0.01" placeholder="ราคา" className={inputCls} />
            <input value={r.discount} onChange={(e) => update(i, "discount", e.target.value)} type="number" step="0.01" placeholder="ส่วนลด" className={inputCls} />
            <button type="button" onClick={() => delRow(i)} className="text-sm text-[color:var(--color-danger)]" title="ลบบรรทัด">✕</button>
          </div>
        ))}
        <button type="button" onClick={addRow} className="self-start text-xs underline">+ เพิ่มบรรทัด</button>
      </div>

      <div className="flex flex-col items-end gap-1 border-t pt-3 text-sm">
        <div className="flex w-full max-w-xs justify-between">
          <span className="text-[color:var(--color-muted)]">รวมเป็นเงิน</span>
          <span>฿{money(subTotal)}</span>
        </div>
        <label className="flex w-full max-w-xs items-center justify-between gap-2">
          <span className="text-[color:var(--color-muted)]">ส่วนลดท้ายบิล</span>
          <input name="discountAmount" value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" step="0.01" placeholder="0.00" className={`${inputCls} w-28 text-right`} />
        </label>
        <div className="flex w-full max-w-xs justify-between">
          <span className="text-[color:var(--color-muted)]">ภาษีมูลค่าเพิ่ม</span>
          <span>฿{money(vat)}</span>
        </div>
        <div className="flex w-full max-w-xs justify-between font-semibold">
          <span>ยอดสุทธิ</span>
          <span>฿{money(grand)}</span>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        หมายเหตุ
        <textarea name="note" defaultValue={initial?.note ?? ""} rows={2} className={inputCls} />
      </label>

      <button className="btn btn-primary self-start text-sm">{editId ? "บันทึกการแก้ไข" : "บันทึกร่าง"}</button>
    </form>
  );
}
