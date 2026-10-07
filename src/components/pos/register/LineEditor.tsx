"use client";

// LineEditor.tsx — แก้บรรทัดตะกร้า: จำนวน −/+ · ส่วนลดรายการ บาท/% · ลบรายการ (สเปก §1.1 แถว 18 · §4.6)
//   ไม่มีภาพออกแบบของตัวแก้ ⇒ ใช้กล่องกลางจอ/แผ่นล่างแบบเดียวกับกล่องอื่นของหน้าขาย (สเปกเสนอ popover ยึดบรรทัดบน D/T —
//   ส่วนต่างที่บันทึกไว้ในโน้ต B2) · ปุ่ม −/+ 48×48 · ปุ่มยืนยัน/ลบ สูง 48
// 🔴 ส่วนลด %: ผู้ใช้กรอกเป็นเปอร์เซ็นต์ ("10") → เก็บเป็น basis point (×100) · บาท: ทศนิยมไม่เกิน 2 ตำแหน่ง → สตางค์ · ไม่โชว์ "bp"
// 🔴 ตรวจด้วย priceCart ก่อนใช้จริง (RegisterScreen.tryLine): ไม่ผ่าน = กล่องค้าง + ข้อความใต้ช่อง · ห้ามตัดเลขให้พอดีเงียบ ๆ
// 🔴 ลบรายการไม่มีกล่องยืนยันซ้ำ (มติ Q27 — เปิดตัวแก้แล้วกดลบ = สองขั้นอยู่แล้ว)
// P1.6 U (R5 · มติ Q11): หมายเหตุรายการ ≤ REGISTER_NOTE_MAX ตัวอักษร — ว่าง = ไม่มี · ส่งไปกับ quote/submit (บิลที่พักไม่เก็บ)

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PriceDiscount } from "@/lib/modules/pos/pricing-shared";
import { REGISTER_MAX_QTY, REGISTER_NOTE_MAX } from "@/lib/modules/pos/register-shared";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";

export type LineEditResult = { qty: number; discount: PriceDiscount | undefined; note: string | undefined };

/** "12.5" → 1250 (สตางค์ หรือ basis point) · ว่าง = 0 · ผิดรูป/เกิน 2 ตำแหน่ง = null */
export function parseHundredths(raw: string): number | null {
  const s = raw.trim().replace(/,/g, "");
  if (s === "") return 0;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [i, f = ""] = s.split(".");
  return Number(i) * 100 + Number((f + "00").slice(0, 2));
}
/** 1250 → "12.5" (แสดงค่าเดิมในช่อง) */
export const hundredthsText = (v: number) => String(Number((v / 100).toFixed(2)));

type Props = {
  lineKey: string;
  name: string;
  qty: number;
  discount: PriceDiscount | undefined;
  note?: string;
  focus: "qty" | "discount";
  /** คืนคีย์ข้อความผิดพลาด (พร้อมค่า) ถ้าใช้ไม่ได้ · null = ใช้แล้ว ปิดกล่อง */
  onApply: (r: LineEditResult) => { key: string; values?: Record<string, string | number> } | null;
  onRemove: () => void;
  onClose: () => void;
};

export function LineEditor({ lineKey, name, qty, discount, note, focus, onApply, onRemove, onClose }: Props) {
  const t = useTranslations("pos.register");
  const [q, setQ] = useState(String(qty));
  const [mode, setMode] = useState<"AMOUNT" | "PERCENT">(discount?.type ?? "AMOUNT");
  const [val, setVal] = useState(discount ? hundredthsText(discount.value) : "");
  const [noteVal, setNoteVal] = useState(note ?? "");
  const [err, setErr] = useState<{ key: string; values?: Record<string, string | number> } | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const discRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    (focus === "qty" ? qtyRef : discRef).current?.focus();
  }, [focus]);

  const n = /^\d+$/.test(q.trim()) ? Number(q.trim()) : NaN;
  const step = (d: number) => {
    const base = Number.isFinite(n) ? n : qty;
    setQ(String(Math.min(REGISTER_MAX_QTY, Math.max(1, base + d))));
    setErr(null);
  };
  const apply = () => {
    if (!Number.isInteger(n) || n < 1 || n > REGISTER_MAX_QTY) return setErr({ key: "errors.qtyInvalid", values: { max: REGISTER_MAX_QTY.toLocaleString("th-TH") } });
    const v = parseHundredths(val);
    if (v === null || (mode === "PERCENT" && v > 10_000)) return setErr({ key: "errors.amountInvalid" });
    if (noteVal.length > REGISTER_NOTE_MAX) return setErr({ key: "note.tooLong", values: { max: REGISTER_NOTE_MAX } });
    const r = onApply({ qty: n, discount: v > 0 ? { type: mode, value: v } : undefined, note: noteVal.trim() ? noteVal : undefined });
    setErr(r);
  };

  const seg = (on: boolean) =>
    `h-11 flex-1 rounded-[11px] text-[14px] ${on ? "bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)]"}`;
  return (
    <RegisterDialog onDismiss={onClose}>
      <div data-testid="pos-reg-line-editor" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("editor.title")}>
        <SheetGrab />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] font-bold">{t("editor.title")}</h2>
            <p className="mt-0.5 break-words text-[14.5px] text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">{name}</p>
          </div>
          <button
            data-testid="pos-reg-editor-close"
            className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-[11px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]"
            type="button"
            aria-label={t("cart.close")}
            onClick={onClose}
          >
            <RegisterIcon name="x" size={18} />
          </button>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
          data-testid="pos-reg-editor-form"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-[color:var(--color-muted)]">{t("editor.qty")}</span>
            <div className="flex items-center gap-2">
              <button
                data-testid="pos-reg-editor-qty-dec"
                className="btn btn-ghost h-12 w-12 shrink-0 rounded-[13px] px-0"
                type="button"
                aria-label={t("editor.qtyDec")}
                onClick={() => step(-1)}
              >
                <RegisterIcon name="minus" size={18} />
              </button>
              <input
                data-testid="pos-reg-editor-qty-input"
                className="input h-12 min-w-0 flex-1 rounded-[13px] text-center text-[18px] font-bold tabular-nums"
                ref={qtyRef}
                inputMode="numeric"
                value={q}
                aria-label={t("editor.qty")}
                onChange={(e) => {
                  setQ(e.target.value.replace(/[^\d]/g, "").slice(0, 4));
                  setErr(null);
                }}
              />
              <button
                data-testid="pos-reg-editor-qty-inc"
                className="btn btn-ghost h-12 w-12 shrink-0 rounded-[13px] px-0"
                type="button"
                aria-label={t("editor.qtyInc")}
                onClick={() => step(1)}
              >
                <RegisterIcon name="plus" size={18} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-[color:var(--color-muted)]">{t("editor.discount")}</span>
            <div className="flex gap-1 rounded-[13px] border p-1" role="group" aria-label={t("editor.discount")}>
              <button data-testid="pos-reg-editor-discount-amount" className={seg(mode === "AMOUNT")} type="button" aria-pressed={mode === "AMOUNT"} onClick={() => setMode("AMOUNT")}>
                {t("editor.baht")}
              </button>
              <button data-testid="pos-reg-editor-discount-percent" className={seg(mode === "PERCENT")} type="button" aria-pressed={mode === "PERCENT"} onClick={() => setMode("PERCENT")}>
                {t("editor.percent")}
              </button>
            </div>
            <input
              data-testid={`pos-reg-line-discount-${lineKey}`}
              className="input h-12 rounded-[13px] text-[16px] tabular-nums"
              ref={discRef}
              inputMode="decimal"
              value={val}
              placeholder="0"
              aria-label={`${t("editor.discount")} (${mode === "AMOUNT" ? t("editor.baht") : t("editor.percent")})`}
              onChange={(e) => {
                setVal(e.target.value);
                setErr(null);
              }}
            />
          </div>

          <label className="flex flex-col gap-1.5 text-[13px] text-[color:var(--color-muted)]">
            {t("editor.note")}
            <textarea
              data-testid={`pos-reg-line-note-${lineKey}`}
              className="input min-h-[72px] resize-y rounded-[13px] py-2.5 text-[15px] leading-[1.5] text-[color:var(--color-ink)]"
              value={noteVal}
              placeholder={t("editor.notePlaceholder")}
              aria-invalid={noteVal.length > REGISTER_NOTE_MAX}
              onChange={(e) => {
                setNoteVal(e.target.value);
                setErr(null);
              }}
            />
          </label>

          {err && (
            <p data-testid="pos-reg-editor-error" className="text-[13.5px] text-[color:var(--color-danger)]" role="alert">
              {t(err.key, err.values)}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              data-testid={`pos-reg-line-remove-${lineKey}`}
              className="btn btn-ghost h-12 rounded-[13px] text-[15px] text-[color:var(--color-danger)]"
              type="button"
              onClick={onRemove}
            >
              {t("editor.remove")}
            </button>
            <button data-testid="pos-reg-editor-apply" className="btn btn-primary h-12 rounded-[13px] text-[15px]" type="submit">
              {t("editor.apply")}
            </button>
          </div>
        </form>
      </div>
    </RegisterDialog>
  );
}
