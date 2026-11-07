"use client";
// SVC H.5 ▸ ลงรายการในบิลระหว่างพัก (ใบสั่ง h.5 §3.2) — มินิบาร์ · บริการ · ค่าปรับ · ส่วนลด (ส่วนลดเฉพาะผู้จัดการ · canManage จากเซิร์ฟเวอร์)
//   ราคาเป็นบาท (ทศนิยม 2) → สตางค์ · ส่วนลดส่งเป็นยอดติดลบ · เพดานต่อบรรทัดตรวจที่เซิร์ฟเวอร์ (ค่าตั้ง rooms.hotel.folio.manualItemMaxSatang)
import { useState } from "react";
import { MANUAL_TYPES, bahtTh, satangOfInput, type FolioAction, type FolioActionResult } from "./folio-shared";

type Props = { reservationId: string; canManage: boolean; onSubmit: FolioAction; onDone: (r: FolioActionResult) => void; onClose: () => void };
const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm";
const BTN_PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const INPUT = "min-h-11 w-full rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-sm";

export default function PostItemDialog({ reservationId, canManage, onSubmit, onDone, onClose }: Props) {
  const types = MANUAL_TYPES.filter((t) => canManage || !t.managerOnly);
  const [type, setType] = useState(types[0]?.value ?? "MINIBAR");
  const [description, setDescription] = useState("");
  const [qtyText, setQtyText] = useState("1");
  const [priceText, setPriceText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const price = satangOfInput(priceText);
  const qty = Number(qtyText);
  const valid = description.trim().length > 0 && price !== null && price > 0 && Number.isInteger(qty) && qty >= 1;
  const total = valid && price !== null ? price * qty : 0;
  async function submit() {
    if (busy || !valid || price === null) return;
    setBusy(true);
    setError("");
    try {
      const r = await onSubmit({ reservationId, type, description: description.trim(), qty, unitAmountSatang: type === "DISCOUNT" ? -price : price });
      if (!r.ok) setError(r.reason || "ลงรายการไม่สำเร็จ");
      else onDone(r);
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="ลงรายการในบิลห้อง" data-post-dialog="" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-[color:var(--color-surface)] p-5 shadow-xl">
        <h2 className="text-lg font-bold">ลงรายการในบิลห้อง</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span>ชนิดรายการ</span>
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={INPUT}>
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.labelTh}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>รายละเอียด</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="เช่น มินิบาร์ · น้ำอัดลม 2" className={INPUT} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>จำนวน</span>
            <input value={qtyText} onChange={(e) => setQtyText(e.target.value)} inputMode="numeric" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>{type === "DISCOUNT" ? "ส่วนลดต่อหน่วย (บาท)" : "ราคาต่อหน่วย (บาท)"}</span>
            <input value={priceText} onChange={(e) => setPriceText(e.target.value)} inputMode="decimal" placeholder="0.00" className={INPUT} />
          </label>
        </div>
        <p className="text-sm text-[color:var(--color-muted)]">รวม {type === "DISCOUNT" ? "−" : ""}฿{bahtTh(total)}</p>
        {error ? <p role="alert" className="text-sm text-[color:var(--color-danger)]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className={BTN} onClick={onClose} disabled={busy}>
            ปิด
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={submit} disabled={busy || !valid}>
            {busy ? "กำลังบันทึก…" : "ลงรายการ"}
          </button>
        </div>
      </div>
    </div>
  );
}
