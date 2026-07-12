"use client";

import { useMemo, useState } from "react";
import { createExpenseDocAction, updateExpenseDocAction } from "./expense-actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

type ContactOpt = { id: string; name: string };
type AccountOpt = { id: string; code: string; name: string };
type Row = {
  description: string;
  qty: string;
  unitName: string;
  unitPrice: string;
  discount: string;
  accountId: string;
};
type Line = {
  description: string;
  qty: number;
  unitName: string | null;
  unitPrice: number;
  discount: number;
  accountId?: string | null;
};

const emptyRow = (): Row => ({ description: "", qty: "1", unitName: "", unitPrice: "", discount: "", accountId: "" });
const inputCls = "rounded-lg border px-2 py-1.5 text-sm";
const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ตัวแก้เอกสารฝั่งจ่าย (บันทึกซื้อ/ค่าใช้จ่าย/PO/สินทรัพย์) — ราคาเป็นบาท
export default function ExpenseEditor({
  systemId,
  docType,
  docLabel,
  variant,
  contacts,
  accountOptions = [],
  requireAccount = false,
  vatRateBp,
  vatRegistered,
  editId,
  initial,
}: {
  systemId: string;
  docType: string;
  docLabel: string;
  variant: "purchase" | "expense" | "po" | "asset";
  contacts: ContactOpt[];
  accountOptions?: AccountOpt[]; // EXPENSE = หมวดค่าใช้จ่าย · ASSET = บัญชีสินทรัพย์
  requireAccount?: boolean; // บังคับเลือกบัญชีต่อบรรทัด
  vatRateBp: number;
  vatRegistered: boolean;
  editId?: string;
  initial?: {
    contactId: string | null;
    issueDate: string;
    dueDate: string | null;
    vatMode: string;
    vatPurchaseMode: string;
    discountAmount: number;
    note: string | null;
    lines: Line[];
  };
}) {
  const isPO = variant === "po";
  const showAccount = accountOptions.length > 0 || requireAccount;

  const [rows, setRows] = useState<Row[]>(
    initial && initial.lines.length
      ? initial.lines.map((l) => ({
          description: l.description,
          qty: String(l.qty),
          unitName: l.unitName ?? "",
          unitPrice: String(l.unitPrice / 100),
          discount: String(l.discount / 100),
          accountId: l.accountId ?? "",
        }))
      : [emptyRow()],
  );
  const [vatMode, setVatMode] = useState(!vatRegistered ? "NONE" : initial?.vatMode ?? "EXCLUDE");
  const [vatPurchaseMode, setVatPurchaseMode] = useState(initial?.vatPurchaseMode ?? "CLAIM");
  const [discount, setDiscount] = useState(initial ? String(initial.discountAmount / 100) : "");

  const update = (i: number, k: keyof Row, v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));
  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const delRow = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r));

  // NO_CLAIM → VAT รวมเป็นต้นทุน (ไม่มีบรรทัด VAT แยก)
  const effectiveVatMode = !vatRegistered || vatPurchaseMode === "NO_CLAIM" ? "NONE" : vatMode;

  const { subTotal, vat, grand, linesJson } = useMemo(() => {
    const parsed = rows
      .map((r) => ({
        description: r.description.trim(),
        qty: Number(r.qty) || 0,
        unitName: r.unitName || null,
        unitPrice: Number(r.unitPrice) || 0,
        discount: Number(r.discount) || 0,
        vatRateBp,
        accountId: r.accountId || null,
      }))
      .filter((r) => r.description.length > 0);
    const sub = parsed.reduce((s, r) => s + Math.max(0, r.qty * r.unitPrice - r.discount), 0);
    const disc = Number(discount) || 0;
    const afterDisc = Math.max(0, sub - disc);
    const rate = effectiveVatMode === "NONE" ? 0 : vatRateBp / 10000;
    let v = 0;
    let g = afterDisc;
    if (rate > 0) {
      if (effectiveVatMode === "INCLUDE") {
        v = afterDisc - afterDisc / (1 + rate);
      } else {
        v = afterDisc * rate;
        g = afterDisc + v;
      }
    }
    return { subTotal: sub, vat: v, grand: g, linesJson: JSON.stringify(parsed) };
  }, [rows, discount, effectiveVatMode, vatRateBp]);

  const action = editId ? updateExpenseDocAction : createExpenseDocAction;

  return (
    <form action={action} className="card flex flex-col gap-4">
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="docType" value={docType} />
      {editId && <input type="hidden" name="id" value={editId} />}
      <input type="hidden" name="lines" value={linesJson} />
      <input type="hidden" name="vatMode" value={effectiveVatMode} />
      {!isPO && <input type="hidden" name="vatPurchaseMode" value={vatPurchaseMode} />}

      <h2 className="text-sm font-medium">{editId ? "แก้ไข" : "สร้าง"}{docLabel}</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ผู้ขาย / ผู้รับเงิน
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
        {!isPO && (
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ครบกำหนดชำระ
            <input type="date" name="dueDate" defaultValue={initial?.dueDate ?? ""} className={inputCls} />
          </label>
        )}
        {vatRegistered ? (
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ภาษีมูลค่าเพิ่ม
            <select value={vatMode} onChange={(e) => setVatMode(e.target.value)} className={inputCls}>
              <option value="EXCLUDE">แยก VAT ({vatRateBp / 100}%)</option>
              <option value="INCLUDE">รวม VAT แล้ว ({vatRateBp / 100}%)</option>
              <option value="NONE">ไม่มี VAT</option>
            </select>
          </label>
        ) : null}
        {!isPO && vatRegistered && (
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ใบกำกับภาษีซื้อ
            <select value={vatPurchaseMode} onChange={(e) => setVatPurchaseMode(e.target.value)} className={inputCls}>
              <option value="CLAIM">มีใบกำกับ (เคลมได้ทันที)</option>
              <option value="AWAITING">ยังไม่รับใบกำกับ (พักภาษีซื้อ)</option>
              <option value="NO_CLAIM">เคลมไม่ได้ (VAT รวมในต้นทุน)</option>
            </select>
          </label>
        )}
      </div>

      {/* บรรทัดรายการ */}
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-lg border p-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_70px_70px_100px_90px_28px]">
              <input value={r.description} onChange={(e) => update(i, "description", e.target.value)} placeholder="รายละเอียด" className={`${inputCls} col-span-2 sm:col-span-1`} />
              <input value={r.qty} onChange={(e) => update(i, "qty", e.target.value)} type="number" step="0.01" placeholder="จำนวน" className={inputCls} />
              <input value={r.unitName} onChange={(e) => update(i, "unitName", e.target.value)} placeholder="หน่วย" className={inputCls} />
              <input value={r.unitPrice} onChange={(e) => update(i, "unitPrice", e.target.value)} type="number" step="0.01" placeholder="ราคา" className={inputCls} />
              <input value={r.discount} onChange={(e) => update(i, "discount", e.target.value)} type="number" step="0.01" placeholder="ส่วนลด" className={inputCls} />
              <button type="button" onClick={() => delRow(i)} className="text-sm text-[color:var(--color-danger)]" title="ลบบรรทัด">✕</button>
            </div>
            {showAccount && (
              <select
                value={r.accountId}
                onChange={(e) => update(i, "accountId", e.target.value)}
                className={`${inputCls} text-xs`}
                required={requireAccount}
              >
                <option value="">{variant === "asset" ? "— เลือกบัญชีสินทรัพย์ —" : "— เลือกหมวดค่าใช้จ่าย —"}</option>
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                ))}
              </select>
            )}
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
        {effectiveVatMode !== "NONE" && (
          <div className="flex w-full max-w-xs justify-between">
            <span className="text-[color:var(--color-muted)]">ภาษีซื้อ</span>
            <span>฿{money(vat)}</span>
          </div>
        )}
        <div className="flex w-full max-w-xs justify-between font-semibold">
          <span>ยอดสุทธิ</span>
          <span>฿{money(grand)}</span>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        หมายเหตุ
        <textarea name="note" defaultValue={initial?.note ?? ""} rows={2} className={inputCls} />
      </label>

      <SubmitButton className="self-start">{editId ? "บันทึกการแก้ไข" : "บันทึกร่าง"}</SubmitButton>
    </form>
  );
}
