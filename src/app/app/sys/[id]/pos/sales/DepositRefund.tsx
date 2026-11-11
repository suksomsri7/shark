"use client";

// DepositRefund.tsx — POS P2.9bU ▸ ลิ้นชักบิลของใบรับเงินมัดจำ (sourceModule POS_DEPOSIT · ภาพ 12): ปุ่ม "คืนมัดจำ (คงเหลือ ฿y)" + แผ่นคืนเงินมัดจำ (มติผู้คุม P2.9bU ข้อ 7) ◂
//   ยอด/ใบมัดจำ = registerDepositLookupAction({query: เลขใบรับ}) (ตรงเลขใบรับ — มัดจำสมาชิก/ไม่มีเบอร์เห็นยอด · มัดจำที่บันทึกเบอร์ = ใส่ 4 หลักท้ายก่อน (เซิร์ฟเวอร์นับครั้งผิด))
//   แผ่น: ยอดคืน = คงเหลือทั้งหมด (CD5 · อ่านอย่างเดียว) · วิธีคืน = เงินจริงเท่านั้น (เงินสด / พร้อมเพย์โอนเอง / โอน — ไม่มี pi_) · เหตุผลบังคับ ·
//   registerRefundDepositAction → "คืนมัดจำ #CN… ฿y" แล้วโหลดหน้าใหม่ · ไม่มี pos.sale.refund = แป้น PIN ผู้จัดการ (ทางเดียวกับหน้าต่างคืนเงิน P1.8 ของหน้านี้ — ManagerPinPad)
//   คิวอนุมัติ (POS_REFUND) ไม่ต่อกับมัดจำ (deviation 4 ของ S — งานตามหลัง)
// POS P5.1 ▸ MA13 (R1 F3 · CD-P51-O8c): มัดจำของการจอง (fromModule) ที่ OPEN มีปุ่ม "ริบมัดจำ" ข้างปุ่มคืน (ต่อยอดลิ้นชักนี้ ไม่ทำจอใหม่) —
//   แผ่นริบ: ยอด = คงเหลือทั้งหมด (อ่านอย่างเดียว) · เหตุผลบังคับ · registerForfeitDepositAction (pos.sale.manage · ไม่มีสิทธิ์ = ข้อความ ไม่มี PIN) ◂
//   POS P5.1 ▸ RC F7 (CD-P51-O10): ปุ่มแสดงเมื่อ lookup ตอบ canForfeit (มัดจำโมดูล + ผู้ใช้มี pos.sale.manage) — แคชเชียร์ไม่เห็นปุ่ม ◂
// 🔴 ข้อความจากคีย์ pos.* เท่านั้น · 4 หลักท้ายอยู่ใน ref/ช่อง password แบบไม่ควบคุม (ไม่ลง storage/URL/data-*) · ไม่มีข้อความไทยนอกคอมเมนต์ (ST7)

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { registerDepositLookupAction, registerForfeitDepositAction, registerRefundDepositAction } from "@/lib/modules/pos/deposit-actions"; // POS P5.1 ▸ MA13 ◂
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import { refusalMessageKey } from "@/lib/modules/pos/register-shared";
import { ManagerPinPad, type ManagerPinResult } from "@/components/pos/register/ManagerPinPad";
import { BillIcon, money, type T } from "./bills-ui";

type Info = { id: string; status: string; remainingSatang: number | null; needsPhoneLast4: boolean; fromModule: boolean; canForfeit: boolean }; // POS P5.1 ▸ MA13 fromModule · RC F7 canForfeit ◂
type RefundMethod = "CASH" | "PROMPTPAY" | "TRANSFER";
// POS P2.9bU ▸ fix1 มติ 7 (R1 F7): ป้ายกลางของมัดจำ (ไม่อ้าง "PromptPay เดิม"/"บัญชีที่โอนมา" ของการคืนบิลขาย P1.8) ◂
const METHODS: { m: RefundMethod; label: string }[] = [
  { m: "CASH", label: "deposit.refundMCash" },
  { m: "PROMPTPAY", label: "deposit.refundMPromptpay" },
  { m: "TRANSFER", label: "deposit.refundMTransfer" },
];
const REASON_MAX = 200;
const LAST4 = 4;
const UNSURE: ReadonlySet<string> = new Set(["UNKNOWN", "INTERNAL", "BUSY"]);
const newKey = () => `dref-${(crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "")}`.slice(0, 100);
type RefundInput = Parameters<typeof registerRefundDepositAction>[0]["input"];

export function DepositRefund({ systemId, unitId, receiptNo, onRefunded }: { systemId: string; unitId: string; receiptNo: string; onRefunded: (text: string) => void }) {
  const t = useTranslations("pos.bills") as T;
  const trg = useTranslations("pos.register") as T;
  const [info, setInfo] = useState<Info | null>(null);
  const [open, setOpen] = useState(false);
  const [forfeitOpen, setForfeitOpen] = useState(false); // POS P5.1 ▸ MA13 ◂
  const load = useCallback(
    async (last4?: string): Promise<Info | null> => {
      const r = await registerDepositLookupAction({ systemId, unitId, query: receiptNo, ...(last4 ? { phoneLast4: last4 } : {}) }).catch(() => null);
      const d = r && r.ok ? (r.deposits.find((x) => x.receiptNo === receiptNo) ?? null) : null;
      return d ? { id: d.id, status: d.status, remainingSatang: d.remainingSatang, needsPhoneLast4: d.needsPhoneLast4, fromModule: d.fromModule === true, canForfeit: d.canForfeit === true } : null;
    },
    [systemId, unitId, receiptNo],
  );
  useEffect(() => {
    let live = true;
    void load().then((x) => {
      if (live) setInfo(x);
    });
    return () => {
      live = false;
    };
  }, [load]);
  if (!info || info.status !== "OPEN" || info.remainingSatang === 0) return null;
  return (
    <>
      <button type="button" data-testid="pos-bills-refund-deposit" className="btn btn-primary h-12 rounded-[12px] px-3 leading-tight" onClick={() => setOpen(true)}>
        {info.remainingSatang !== null ? t("deposit.refundOpen", { amount: money(info.remainingSatang) }) : t("deposit.refundOpenNoAmount")}
      </button>
      {info.canForfeit && info.remainingSatang !== null && info.remainingSatang > 0 ? ( /* POS P5.1 ▸ RC F7 (CD-P51-O10): ซ่อนเมื่อไม่มี pos.sale.manage ◂ */
        <button type="button" data-testid="pos-bills-forfeit-deposit" className="btn btn-ghost h-12 rounded-[12px] px-3 leading-tight text-[color:var(--color-danger)]" onClick={() => setForfeitOpen(true)}>
          {t("deposit.forfeitOpen")}
        </button>
      ) : null}
      {forfeitOpen && info.remainingSatang !== null ? (
        <ForfeitDepositDialog
          systemId={systemId}
          unitId={unitId}
          receiptNo={receiptNo}
          depositId={info.id}
          remaining={info.remainingSatang}
          onClose={() => setForfeitOpen(false)}
          onDone={(text) => {
            setForfeitOpen(false);
            setInfo(null);
            onRefunded(text);
          }}
          t={t}
          trg={trg}
        />
      ) : null}
      {open ? (
        <RefundDepositDialog
          systemId={systemId}
          unitId={unitId}
          receiptNo={receiptNo}
          info={info}
          load={load}
          onClose={() => setOpen(false)}
          onDone={(text) => {
            setOpen(false);
            setInfo(null);
            onRefunded(text);
          }}
          t={t}
          trg={trg}
        />
      ) : null}
    </>
  );
}

function RefundDepositDialog({
  systemId,
  unitId,
  receiptNo,
  info: info0,
  load,
  onClose,
  onDone,
  t,
  trg,
}: {
  systemId: string;
  unitId: string;
  receiptNo: string;
  info: Info;
  load: (last4?: string) => Promise<Info | null>;
  onClose: () => void;
  onDone: (text: string) => void;
  t: T;
  trg: T;
}) {
  const [info, setInfo] = useState<Info>(info0);
  const [method, setMethod] = useState<RefundMethod>("CASH");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [unsure, setUnsure] = useState(false);
  const [pinFor, setPinFor] = useState<RefundInput | null>(null);
  const [checking, setChecking] = useState(false);
  const [last4Wrong, setLast4Wrong] = useState(false);
  const [last4Len, setLast4Len] = useState(0);
  const last4Ref = useRef("");
  const last4Input = useRef<HTMLInputElement>(null);
  /** 1 คีย์ต่อการเปิดแผ่น (ผลไม่แน่ใจ = ลองซ้ำคีย์ + คำขอเดิม) */
  const keyRef = useRef(newKey());
  const sentRef = useRef<RefundInput | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  useEffect(
    () => () => {
      last4Ref.current = "";
    },
    [],
  );
  const remaining = info.remainingSatang;

  const check = async () => {
    if (last4Ref.current.length !== LAST4 || checking) return;
    setChecking(true);
    setLast4Wrong(false);
    const x = await load(last4Ref.current);
    setChecking(false);
    last4Ref.current = "";
    if (last4Input.current) last4Input.current.value = "";
    setLast4Len(0);
    if (x && x.remainingSatang !== null) setInfo(x);
    else setLast4Wrong(true);
  };

  const send = async (input: RefundInput) => {
    sentRef.current = input;
    setBusy(true);
    setErr(null);
    setUnsure(false);
    try {
      const deviceId = getPosDeviceId();
      const r = await registerRefundDepositAction({ systemId, unitId, ...(deviceId ? { deviceId } : {}), input });
      if (r.ok) {
        onDone(t("deposit.refundDone", { no: r.refund.receiptNo ?? "-", amount: money(r.refund.grandTotalSatang) }));
        return { ok: true as const };
      }
      if (UNSURE.has(r.code)) {
        setUnsure(true);
        return { ok: false as const, code: r.code };
      }
      if (r.code === "PERMISSION_DENIED" && !input.managerPin) {
        setPinFor(input); // มติ 7: ไม่มี pos.sale.refund ⇒ PIN ผู้จัดการ (ทาง P1.8 ของหน้านี้)
        return { ok: false as const, code: r.code };
      }
      if (r.code === "VALIDATION") {
        // ยอดคงเหลือเปลี่ยน (Σ ≠ คงเหลือ) ⇒ อ่านยอดใหม่
        const x = await load();
        if (x) setInfo((cur) => ({ ...x, remainingSatang: x.remainingSatang ?? cur.remainingSatang }));
        setErr("deposit.refundChanged");
      } else if (r.code === "DEPOSIT_CLOSED") setErr("deposit.refundClosed");
      else if (r.code === "SHIFT_REQUIRED") setErr("deposit.refundNoShift");
      else setErr(`reg:${refusalMessageKey(r.code)}`);
      return { ok: false as const, code: r.code };
    } catch {
      setUnsure(true);
      return { ok: false as const, code: "UNKNOWN" };
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    if (busy || remaining === null || remaining <= 0 || !reason.trim()) return;
    void send({ depositId: info.id, payMethods: [{ type: method, amountSatang: remaining }], reason: reason.trim(), idempotencyKey: keyRef.current });
  };
  const pinSubmit = async (managerUserId: string, managerPin: string): Promise<ManagerPinResult> => {
    if (!pinFor) return { ok: false, code: "NOT_FOUND" };
    const r = await send({ ...pinFor, managerPin, managerUserId });
    if (r.ok) setPinFor(null);
    return r;
  };
  const errText = err ? (err.startsWith("reg:") ? trg(err.slice(4)) : t(err)) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-start sm:p-4 sm:pt-[8vh]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-bills-refund-deposit-title"
        data-testid="pos-bills-refund-deposit-sheet"
        className="flex max-h-full w-full flex-col overflow-y-auto bg-[color:var(--color-surface)] shadow-lg sm:max-h-[86vh] sm:max-w-[520px] sm:rounded-2xl"
      >
        <div className="flex items-start gap-3 border-b px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2 id="pos-bills-refund-deposit-title" className="text-[17px] font-bold">
              {t("deposit.refundTitle")}
            </h2>
            <span className="text-[12px] tabular-nums text-[color:var(--color-muted)]">{`${t("deposit.receiptTitle")} · ${receiptNo}`}</span>
          </div>
          <button type="button" data-testid="pos-bills-refund-deposit-close" aria-label={t("drawer.close")} disabled={busy} className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={onClose}>
            <BillIcon name="x" />
          </button>
        </div>
        {pinFor ? (
          <div className="flex flex-col gap-3 px-5 py-4">
            <p data-testid="pos-bills-refund-deposit-pin-note" className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">
              {t("deposit.refundManagerPin")}
            </p>
            <ManagerPinPad systemId={systemId} unitId={unitId} deviceId={getPosDeviceId()} onPinEntered={pinSubmit} />
            <button type="button" data-testid="pos-bills-refund-deposit-pin-back" className="btn btn-ghost h-12 self-start rounded-[12px] px-5" onClick={() => setPinFor(null)}>
              {t("refund.cancel")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-5 py-4 text-[13px]">
            {remaining === null && info.needsPhoneLast4 ? (
              <div className="flex flex-col gap-1.5">
                <span className="font-bold">{t("deposit.refundLast4")}</span>
                <div className="flex items-center gap-2">
                  <input
                    data-testid="pos-bills-refund-deposit-last4"
                    ref={last4Input}
                    className="input h-12 w-32 rounded-[12px] text-center text-[20px] font-bold tracking-[0.3em]"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={LAST4}
                    defaultValue=""
                    disabled={checking}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, LAST4);
                      if (v !== e.target.value) e.target.value = v;
                      last4Ref.current = v;
                      setLast4Len(v.length);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void check();
                      }
                    }}
                  />
                  <button type="button" data-testid="pos-bills-refund-deposit-check" className="btn btn-ghost h-12 rounded-[12px] px-4 disabled:opacity-50" disabled={checking || last4Len !== LAST4} onClick={() => void check()}>
                    {t("deposit.refundCheck")}
                  </button>
                </div>
                <small className={last4Wrong ? "font-semibold text-[color:var(--color-danger)]" : "text-[color:var(--color-muted)]"} role={last4Wrong ? "alert" : undefined}>
                  {last4Wrong ? t("deposit.refundLast4Wrong") : t("deposit.refundLast4Hint")}
                </small>
              </div>
            ) : null}
            <label className="flex flex-col gap-1.5">
              <span className="font-bold">{t("deposit.refundAmount")}</span>
              <input data-testid="pos-bills-refund-deposit-amount" className="input h-12 rounded-[12px] text-[18px] font-bold tabular-nums" readOnly value={remaining !== null ? money(remaining) : "-"} />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="font-bold">{t("deposit.refundMethod")}</span>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("deposit.refundMethod")}>
                {METHODS.map(({ m, label }) => (
                  <button
                    key={m}
                    type="button"
                    data-testid={`pos-bills-refund-deposit-method-${m.toLowerCase()}`}
                    aria-pressed={method === m}
                    disabled={busy}
                    onClick={() => setMethod(m)}
                    className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border px-2 text-center text-[13px] font-semibold leading-tight ${
                      method === m ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : "bg-[color:var(--color-surface)]"
                    }`}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="font-bold">{t("deposit.refundReason")}</span>
              <textarea
                data-testid="pos-bills-refund-deposit-reason"
                className="input min-h-[72px] rounded-[12px] py-2 text-[14px]"
                maxLength={REASON_MAX}
                placeholder={t("deposit.refundReasonPlaceholder")}
                value={reason}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {errText ? (
              <span data-testid="pos-bills-refund-deposit-error" role="alert" className="text-[13px] font-semibold text-[color:var(--color-danger)]">
                {errText}
              </span>
            ) : null}
            {unsure ? (
              <div className="flex flex-wrap items-center gap-3 text-[13px] text-[color:var(--color-danger)]" role="alert">
                <span>{trg("errors.unknownResult")}</span>
                <button type="button" data-testid="pos-bills-refund-deposit-retry" className="btn btn-ghost min-h-[44px]" disabled={busy} onClick={() => sentRef.current && void send(sentRef.current)}>
                  {trg("pay.retry")}
                </button>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-3">
              <button type="button" data-testid="pos-bills-refund-deposit-cancel" className="btn btn-ghost h-12 rounded-[12px] px-5" disabled={busy} onClick={onClose}>
                {t("refund.cancel")}
              </button>
              <button
                type="button"
                data-testid="pos-bills-refund-deposit-submit"
                className="btn btn-primary h-12 rounded-[12px] px-6 disabled:opacity-50"
                disabled={busy || unsure || remaining === null || remaining <= 0 || !reason.trim()}
                onClick={submit}
              >
                {busy ? t("deposit.refundSending") : t("deposit.refundConfirm", { amount: remaining !== null ? money(remaining) : "-" })}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// POS P5.1 ▸ MA13 (R1 F3 · CD-P51-O8c): แผ่นริบมัดจำ — ยอด = คงเหลือทั้งหมด · เหตุผลบังคับ · ผลไม่แน่ใจ = ลองซ้ำคำขอเดิม (เซิร์ฟเวอร์ใช้คีย์ต่อมัดจำ ⇒ บิลเดียว) ◂
function ForfeitDepositDialog({
  systemId,
  unitId,
  receiptNo,
  depositId,
  remaining,
  onClose,
  onDone,
  t,
  trg,
}: {
  systemId: string;
  unitId: string;
  receiptNo: string;
  depositId: string;
  remaining: number;
  onClose: () => void;
  onDone: (text: string) => void;
  t: T;
  trg: T;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [unsure, setUnsure] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  const send = async () => {
    if (busy || !reason.trim()) return;
    setBusy(true);
    setErr(null);
    setUnsure(false);
    try {
      const deviceId = getPosDeviceId();
      const r = await registerForfeitDepositAction({ systemId, unitId, ...(deviceId ? { deviceId } : {}), input: { depositId, reason: reason.trim() } });
      if (r.ok) {
        onDone(t("deposit.forfeitDone", { no: r.sale.receiptNo ?? "-", amount: money(r.sale.grandTotalSatang) }));
        return;
      }
      if (UNSURE.has(r.code)) setUnsure(true);
      else if (r.code === "PERMISSION_DENIED") setErr("deposit.forfeitNoPermission");
      else if (r.code === "DEPOSIT_CLOSED") setErr("deposit.refundClosed");
      else setErr(`reg:${refusalMessageKey(r.code)}`);
    } catch {
      setUnsure(true);
    } finally {
      setBusy(false);
    }
  };
  const errText = err ? (err.startsWith("reg:") ? trg(err.slice(4)) : t(err)) : null;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-start sm:p-4 sm:pt-[8vh]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-bills-forfeit-deposit-title"
        data-testid="pos-bills-forfeit-deposit-sheet"
        className="flex max-h-full w-full flex-col overflow-y-auto bg-[color:var(--color-surface)] shadow-lg sm:max-h-[86vh] sm:max-w-[520px] sm:rounded-2xl"
      >
        <div className="flex items-start gap-3 border-b px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2 id="pos-bills-forfeit-deposit-title" className="text-[17px] font-bold">
              {t("deposit.forfeitTitle")}
            </h2>
            <span className="text-[12px] tabular-nums text-[color:var(--color-muted)]">{`${t("deposit.receiptTitle")} · ${receiptNo}`}</span>
          </div>
          <button type="button" data-testid="pos-bills-forfeit-deposit-close" aria-label={t("drawer.close")} disabled={busy} className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-[color:var(--color-surface-2)]" onClick={onClose}>
            <BillIcon name="x" />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4 text-[13px]">
          <p data-testid="pos-bills-forfeit-deposit-note" className="text-[13px] text-[color:var(--color-ink-soft)]">
            {t("deposit.forfeitNote", { amount: money(remaining) })}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="font-bold">{t("deposit.forfeitAmount")}</span>
            <input data-testid="pos-bills-forfeit-deposit-amount" className="input h-12 rounded-[12px] text-[18px] font-bold tabular-nums" readOnly value={money(remaining)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-bold">{t("deposit.refundReason")}</span>
            <textarea
              data-testid="pos-bills-forfeit-deposit-reason"
              className="input min-h-[72px] rounded-[12px] py-2 text-[14px]"
              maxLength={REASON_MAX}
              placeholder={t("deposit.forfeitReasonPlaceholder")}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {errText ? (
            <span data-testid="pos-bills-forfeit-deposit-error" role="alert" className="text-[13px] font-semibold text-[color:var(--color-danger)]">
              {errText}
            </span>
          ) : null}
          {unsure ? (
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-[color:var(--color-danger)]" role="alert">
              <span>{trg("errors.unknownResult")}</span>
              <button type="button" data-testid="pos-bills-forfeit-deposit-retry" className="btn btn-ghost min-h-[44px]" disabled={busy} onClick={() => void send()}>
                {trg("pay.retry")}
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-3">
            <button type="button" data-testid="pos-bills-forfeit-deposit-cancel" className="btn btn-ghost h-12 rounded-[12px] px-5" disabled={busy} onClick={onClose}>
              {t("refund.cancel")}
            </button>
            <button
              type="button"
              data-testid="pos-bills-forfeit-deposit-submit"
              className="btn btn-primary h-12 rounded-[12px] px-6 disabled:opacity-50"
              disabled={busy || unsure || !reason.trim()}
              onClick={() => void send()}
            >
              {busy ? t("deposit.forfeitSending") : t("deposit.forfeitConfirm", { amount: money(remaining) })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
