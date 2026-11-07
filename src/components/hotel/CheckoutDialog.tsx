"use client";
// SVC H.5 ▸ ไดอะล็อกเช็กเอาต์ (ภาพ 09 ครึ่งขวา · ใบสั่ง h.5 §2.4 §2.7 §4) — ปิดเป็นบิล POS ใบเดียว (ต้นทาง HOTEL) ด้วยวิธีจ่ายจริง
//   • โหลดยอดจาก prepareCheckout (บรรทัดบิล · มัดจำที่ใช้ · ยอดต้องจ่าย · กะที่เปิด · ตรวจภาษี) · เลือกวิธีจ่าย 4 ปุ่ม หรือ «แยกจ่าย» หลายแถว
//   • ขอใบกำกับภาษีเต็มรูป → ข้อมูลผู้ซื้อ (ตรวจที่ POS) · เงินประกัน: คืน หรือ ริบ + เหตุผล (ริบเฉพาะ canManage · ผู้จัดการ)
//   • มือถือ: เต็มจอ (inset-0 · h-full) · เดสก์ท็อป: กล่องกลาง max-w-2xl
import { useEffect, useState } from "react";
import SplitPayEditor from "./SplitPayEditor";
import { CHECKOUT_DONE_TH, FORFEIT_LABEL_TH, FORFEIT_REASON_TH, PAY_OPTIONS, PAY_TH, bahtTh, emptyRow, payMethodsOf, type FolioAction, type FolioActionResult, type PayRowDraft, type PrepareOk } from "./folio-shared";

type Props = { reservationId: string; canManage: boolean; onPrepare: FolioAction; onSettle: FolioAction; onDone: (r: FolioActionResult) => void; onClose: () => void };
const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm";
const INPUT = "min-h-11 w-full rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-sm";

export default function CheckoutDialog({ reservationId, canManage, onPrepare, onSettle, onDone, onClose }: Props) {
  const canForfeit = canManage;
  const [prep, setPrep] = useState(null as PrepareOk | null);
  const [loadError, setLoadError] = useState("");
  const [method, setMethod] = useState("PROMPTPAY" as PayRowDraft["type"] | "SPLIT");
  const [rows, setRows] = useState([] as PayRowDraft[]);
  const [tenderedText, setTenderedText] = useState("");
  const [reference, setReference] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [wantInvoice, setWantInvoice] = useState(false);
  const [buyer, setBuyer] = useState({ kind: "JURISTIC", name: "", taxId: "", branchCode: "00000", address: "", email: "" });
  const [security, setSecurity] = useState("REFUND" as "REFUND" | "FORFEIT");
  const [forfeitReason, setForfeitReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null as FolioActionResult | null);

  useEffect(() => {
    let live = true;
    onPrepare({ reservationId }).then(
      (r) => {
        if (!live) return;
        if (!r.ok) setLoadError(r.reason || "โหลดยอดเช็กเอาต์ไม่สำเร็จ");
        else {
          const p = r as unknown as PrepareOk;
          setPrep(p);
          setRows([emptyRow("CASH", Math.ceil(p.payableSatang / 2)), emptyRow("PROMPTPAY", p.payableSatang - Math.ceil(p.payableSatang / 2))]);
          if (p.openShifts.length === 1) setShiftId(p.openShifts[0]!.id);
        }
      },
      () => live && setLoadError("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง"),
    );
    return () => {
      live = false;
    };
  }, [onPrepare, reservationId]);

  const payable = prep?.payableSatang ?? 0;
  const held = prep?.security.state === "HELD" ? prep.security.heldSatang : 0;
  function payMethods() {
    if (payable === 0) return { ok: true as const, payMethods: [], changeSatang: 0 };
    if (method === "SPLIT") return payMethodsOf(rows, payable);
    return payMethodsOf([{ type: method, amountText: (payable / 100).toFixed(2), tenderedText: method === "CASH" ? tenderedText : "", reference }], payable);
  }
  const pm = payMethods();
  async function submit() {
    if (busy || !prep || !pm.ok) return;
    if (security === "FORFEIT" && forfeitReason.trim().length < 3) {
      setError(FORFEIT_REASON_TH);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await onSettle({
        reservationId,
        payMethods: pm.payMethods,
        shiftId: shiftId || null,
        securityDeposit: security,
        ...(security === "FORFEIT" ? { forfeitReason: forfeitReason.trim() } : {}),
        ...(wantInvoice ? { taxInvoice: { kind: buyer.kind, name: buyer.name, taxId: buyer.taxId, branchCode: buyer.branchCode, address: buyer.address, ...(buyer.email ? { email: buyer.email } : {}) } } : {}),
      });
      if (!r.ok) setError(r.reason || "เช็กเอาต์ไม่สำเร็จ");
      else setDone(r);
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }
  const label = `รับ ฿${bahtTh(payable)} · เช็กเอาต์${held ? ` · ${security === "REFUND" ? "คืนประกัน" : FORFEIT_LABEL_TH} ฿${bahtTh(held)}` : ""}`;

  return (
    <div role="dialog" aria-modal="true" aria-label="เช็กเอาต์" data-checkout-dialog="" className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="flex h-full w-full flex-col gap-4 overflow-y-auto bg-[color:var(--color-surface)] p-5 shadow-xl sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">เช็กเอาต์ · ปิดบิล POS ใบเดียว</h2>
            <p className="text-sm text-[color:var(--color-muted)]">ค่าห้อง + ลงห้องจาก POS + มินิบาร์/บริการ รวมเป็นบิลเดียว · ภาษีคิดที่บิลครั้งเดียว</p>
          </div>
          <button type="button" className={BTN} onClick={onClose} disabled={busy}>
            ปิด
          </button>
        </header>
        {loadError ? <p role="alert" className="text-sm text-[color:var(--color-danger)]">{loadError}</p> : null}
        {!prep && !loadError ? <p className="text-sm text-[color:var(--color-muted)]">กำลังคำนวณยอด…</p> : null}
        {done ? (
          <section data-checkout-done="" className="flex flex-col gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-bold">เช็กเอาต์เรียบร้อย{typeof done.receiptNo === "string" ? ` · ใบเสร็จ ${done.receiptNo}` : ""}</p>
            <p>{CHECKOUT_DONE_TH}</p>
            {typeof done.changeSatang === "number" && done.changeSatang ? <p>เงินทอน ฿{bahtTh(done.changeSatang)}</p> : null}
            {Array.isArray(done.warnings) && done.warnings.length ? <p className="text-amber-800">{done.warnings.join(" · ")}</p> : null}
            <div className="flex justify-end">
              <button type="button" className={BTN} onClick={() => onDone(done)}>
                เสร็จสิ้น
              </button>
            </div>
          </section>
        ) : null}
        {prep && !done ? (
          <>
            <section className="flex flex-col gap-1 rounded-xl border border-[color:var(--color-line)] p-3 text-sm" data-checkout-lines="">
              {prep.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <span className="min-w-0">{l.name}{l.qty > 1 && l.kind !== "ROOM" ? ` × ${l.qty}` : ""}</span>
                  <span className="tabular-nums">{bahtTh(l.qty * l.unitPriceSatang - (l.discountSatang ?? 0))}</span>
                </div>
              ))}
              {prep.billDiscountSatang ? (
                <div className="flex justify-between gap-3 text-[color:var(--color-muted)]">
                  <span>ส่วนลด</span>
                  <span className="tabular-nums">-{bahtTh(prep.billDiscountSatang)}</span>
                </div>
              ) : null}
              {prep.serviceChargeSatang ? (
                <div className="flex justify-between gap-3">
                  <span>ค่าบริการ (รวมภาษีแล้ว)</span>
                  <span className="tabular-nums">{bahtTh(prep.serviceChargeSatang)}</span>
                </div>
              ) : null}
              <div className="mt-1 flex justify-between gap-3 border-t border-[color:var(--color-line)] pt-2 font-bold">
                <span>ยอดชำระ</span>
                <span className="tabular-nums">฿{bahtTh(prep.grandTotalSatang)}</span>
              </div>
              {prep.depositSatang ? (
                <div className="flex justify-between gap-3 text-[color:var(--color-muted)]">
                  <span>หักมัดจำที่รับไว้</span>
                  <span className="tabular-nums">-{bahtTh(prep.depositSatang)}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 text-base font-bold">
                <span>ต้องรับเงิน</span>
                <span className="tabular-nums">฿{bahtTh(payable)}</span>
              </div>
              <p className="text-xs text-[color:var(--color-muted)]">{prep.taxMode === "INCLUSIVE" ? `ราคารวม VAT แล้ว (ภาษี ฿${bahtTh(prep.vatIncludedSatang)})` : "แยกภาษี · บรรทัดบิลเป็นราคารวมภาษีแล้ว"}</p>
            </section>
            {prep.warnings.length ? (
              <ul role="alert" className="flex flex-col gap-1 text-sm text-amber-800">
                {prep.warnings.map((w) => (
                  <li key={w.code}>{w.message}</li>
                ))}
              </ul>
            ) : null}
            {payable ? (
              <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <legend className="mb-1 text-sm font-medium">วิธีรับเงิน</legend>
                {PAY_OPTIONS.map((p) => (
                  <label key={p.value} data-pay-method={p.value} className={`${BTN} cursor-pointer flex-col ${method === p.value ? "border-2 border-[color:var(--color-ink)] font-bold" : ""}`}>
                    <input type="radio" name="checkoutPay" value={p.value} checked={method === p.value} onChange={() => setMethod(p.value)} className="sr-only" />
                    <span>{p.labelTh}</span>
                    <span className="text-xs font-normal text-[color:var(--color-muted)]">{p.subTh}</span>
                  </label>
                ))}
                <label data-pay-method="SPLIT" className={`${BTN} cursor-pointer flex-col ${method === "SPLIT" ? "border-2 border-[color:var(--color-ink)] font-bold" : ""}`}>
                  <input type="radio" name="checkoutPay" value="SPLIT" checked={method === "SPLIT"} onChange={() => setMethod("SPLIT")} className="sr-only" />
                  <span>แยกจ่าย</span>
                  <span className="text-xs font-normal text-[color:var(--color-muted)]">2 คนขึ้นไป</span>
                </label>
              </fieldset>
            ) : (
              <p className="text-sm text-[color:var(--color-muted)]">มัดจำครอบคลุมยอดทั้งหมด — ไม่ต้องรับเงินเพิ่ม (ยังออกใบเสร็จตามปกติ)</p>
            )}
            {payable && method === "SPLIT" ? <SplitPayEditor rows={rows} payableSatang={payable} onChange={setRows} /> : null}
            {payable && method === "CASH" ? (
              <label className="flex flex-col gap-1 text-sm">
                <span>รับเงินมา (บาท · ไม่กรอก = พอดียอด)</span>
                <input value={tenderedText} onChange={(e) => setTenderedText(e.target.value)} inputMode="decimal" className={INPUT} />
                {pm.ok && pm.changeSatang ? <span className="text-emerald-700">เงินทอน ฿{bahtTh(pm.changeSatang)}</span> : null}
              </label>
            ) : null}
            {payable && (method === "CARD" || method === "TRANSFER") ? (
              <label className="flex flex-col gap-1 text-sm">
                <span>เลขอ้างอิง (ถ้ามี)</span>
                <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={64} className={INPUT} />
              </label>
            ) : null}
            {prep.openShifts.length > 1 ? (
              <label className="flex flex-col gap-1 text-sm">
                <span>กะที่รับเงิน</span>
                <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className={INPUT}>
                  <option value="">นอกกะ</option>
                  {prep.openShifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {prep.invoiceFromPos ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={wantInvoice} onChange={(e) => setWantInvoice(e.target.checked)} className="h-5 w-5" />
                <span>ขอใบกำกับภาษีเต็มรูป</span>
              </label>
            ) : null}
            {wantInvoice ? (
              <div className="grid grid-cols-1 gap-2 rounded-xl border border-[color:var(--color-line)] p-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span>ชนิดผู้ซื้อ</span>
                  <select value={buyer.kind} onChange={(e) => setBuyer({ ...buyer, kind: e.target.value })} className={INPUT}>
                    <option value="JURISTIC">นิติบุคคล</option>
                    <option value="PERSON">บุคคลธรรมดา</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>เลขประจำตัวผู้เสียภาษี 13 หลัก</span>
                  <input value={buyer.taxId} onChange={(e) => setBuyer({ ...buyer, taxId: e.target.value })} inputMode="numeric" maxLength={17} className={INPUT} />
                </label>
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span>ชื่อผู้ซื้อ</span>
                  <input value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} maxLength={200} className={INPUT} />
                </label>
                <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                  <span>ที่อยู่</span>
                  <input value={buyer.address} onChange={(e) => setBuyer({ ...buyer, address: e.target.value })} maxLength={400} className={INPUT} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>รหัสสาขา (สำนักงานใหญ่ 00000)</span>
                  <input value={buyer.branchCode} onChange={(e) => setBuyer({ ...buyer, branchCode: e.target.value })} inputMode="numeric" maxLength={5} className={INPUT} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>อีเมลส่งใบกำกับ (ถ้ามี)</span>
                  <input value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} inputMode="email" maxLength={120} className={INPUT} />
                </label>
              </div>
            ) : null}
            {held ? (
              <fieldset className="flex flex-col gap-2 rounded-xl border border-[color:var(--color-line)] p-3 text-sm" data-checkout-security="">
                <legend className="px-1 font-medium">เงินประกันห้อง ฿{bahtTh(held)}</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="security" checked={security === "REFUND"} onChange={() => setSecurity("REFUND")} />
                  <span>คืนเต็มให้แขก (วิธีเดียวกับตอนรับ)</span>
                </label>
                {canForfeit ? (
                  <>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="security" checked={security === "FORFEIT"} onChange={() => setSecurity("FORFEIT")} />
                      <span>ริบเต็มเป็นค่าเสียหาย (ผู้จัดการ)</span>
                    </label>
                    {security === "FORFEIT" ? (
                      <input value={forfeitReason} onChange={(e) => setForfeitReason(e.target.value)} maxLength={300} placeholder="เหตุผล เช่น ผ้าเช็ดตัวหาย 2 ผืน" className={INPUT} />
                    ) : null}
                  </>
                ) : null}
              </fieldset>
            ) : null}
            {!pm.ok && payable ? <p className="text-sm text-[color:var(--color-muted)]">{pm.reasonTh}</p> : null}
            {error ? <p role="alert" className="text-sm text-[color:var(--color-danger)]">{error}</p> : null}
            <button type="button" data-checkout-submit="" onClick={submit} disabled={busy || !pm.ok || !prep.taxOk || !prep.posLinked} className="min-h-14 rounded-xl bg-[color:var(--color-ink)] px-4 py-3 text-base font-bold text-white disabled:opacity-50">
              {busy ? "กำลังปิดบิล…" : label}
            </button>
            <p className="text-xs text-[color:var(--color-muted)]">กดแล้ว: {CHECKOUT_DONE_TH}</p>
            {prep.depositSatang ? <p className="text-xs text-[color:var(--color-muted)]">ใช้มัดจำ ฿{bahtTh(prep.depositSatang)} เป็นวิธีจ่าย «{PAY_TH.DEPOSIT}» ในบิลเดียวกัน</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
