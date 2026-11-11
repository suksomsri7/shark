"use client";

// DepositReceiveDialog.tsx — POS P2.9bU ▸ แผ่น "รับมัดจำ" ของหน้าขาย (มติผู้คุม P2.9bU ข้อ 5 · สัญญา S ledger/wo-notes/pos-P2.9b.md §P2.9bU "Receive") ◂
//   เข้าจากเมนู "⋯" ของแถบโหมด (md+) / ปุ่มบนแถบมือถือ — มองเห็นเมื่อค่าตั้งรับมัดจำเปิด (registerPayTendersAction · ผู้ใช้มีสิทธิ์ขาย)
//   ซ้าย = ยอดมัดจำ (> 0) · ลูกค้า = สมาชิกในบิล (ชิป) หรือ ชื่อ + เบอร์ (บังคับสำหรับลูกค้าทั่วไป 9–10 หลัก — owner line R2 F2) · หมายเหตุ · วิธีรับเงิน
//   ขวา = เงินสด (รับมา + เงินทอน + แป้นตัวเลข) · พร้อมเพย์ (ใบขอรับเงิน pi_ ผ่าน usePayIntent/PayIntentPanel แบบหน้าขายทุกอย่าง ·
//         ไม่มีใบขอรับเงิน = QR นิ่ง + ยืนยันเองตามกติกา HF-PP) · บัตร (EDC + เลขอ้างอิง · ยืนยันเองตามกติกา HF-PP)
//   ส่ง = registerTakeDepositAction (เงินสด: cashReceivedSatang ส่งเสมอ — R1 F5) → จอสำเร็จ "ใบรับเงินมัดจำ #… ฿x" + ตัวอย่างใบเสร็จ (renderReceiptHtml ของ S) + พิมพ์
// 🔴 คีย์กันซ้ำ = rcvKey จาก RegisterScreen (1 คีย์ต่อการเปิดแผ่น · ผลไม่แน่ใจ = ลองซ้ำด้วยคีย์+payload เดิม) — ไฟล์นี้ไม่สร้างคีย์ (S5.21)
// 🔴 ข้อความจากคีย์ pos.register.* เท่านั้น (ไม่แสดง message ของเซิร์ฟเวอร์) · ไม่มีข้อความไทยนอกคอมเมนต์ (ST7) · เบอร์ไม่ลง storage/console/data-*

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PromptPayQr } from "@/components/PromptPayQr";
import { promptpayPayload } from "@/lib/payment/promptpay";
import { depositPhoneOk, moneyText, REGISTER_REFERENCE_MAX, submitRefusalMessageKey } from "@/lib/modules/pos/register-shared";
import { registerTakeDepositAction } from "@/lib/modules/pos/deposit-actions";
import { registerPayTendersAction } from "@/lib/modules/pos/register-actions";
import { receiptPayloadAction, reprintReceiptAction } from "@/lib/modules/pos/receipt-actions";
import { receiptRefusalMessageKey, renderReceiptHtml, type ReceiptPayload } from "@/lib/modules/pos/receipt-render";
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import type { PosPrinterConfig } from "@/lib/modules/pos/device-shared";
import { PrintStatus } from "@/components/pos/print/PrintStatus";
import { printReceipt } from "@/components/pos/print/printReceipt";
import type { PrintResult } from "@/components/pos/print/types";
import { hundredthsText, parseHundredths } from "./LineEditor";
import { RegisterDialog } from "./RegisterDialog";
import { RegisterIcon } from "./RegisterIcon";
import { PayIntentPanel, usePayIntent, type IntentTarget, type PayIntentSetup } from "./PayIntentPanel";

type RcvMethod = "CASH" | "PROMPTPAY" | "CARD";
const METHODS: { m: RcvMethod; label: string }[] = [
  { m: "CASH", label: "pay.cash" },
  { m: "PROMPTPAY", label: "pay.promptpay" },
  { m: "CARD", label: "pay.card" },
];
const KEYS: { id: string; digits: string | null; label: string }[] = [
  ...["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((d) => ({ id: d, label: d, digits: d })),
  { id: "00", label: "00", digits: "00" },
  { id: "0", label: "0", digits: "0" },
  { id: "back", label: "⌫", digits: null },
];
const MAX_DIGITS = 7;
const NAME_MAX = 100;
const NOTE_MAX = 200;
/** คำปฏิเสธที่ไม่รู้ผล — ลองซ้ำด้วยคีย์ + payload เดิม */
const UNSURE: ReadonlySet<string> = new Set(["UNKNOWN", "INTERNAL", "BUSY"]);

type TakeInput = Parameters<typeof registerTakeDepositAction>[0]["input"];
type Done = { receiptNo: string | null; amountSatang: number; changeSatang: number; receiptSaleId: string };

export function DepositReceiveDialog(p: {
  systemId: string;
  unitId: string;
  /** คีย์กันซ้ำของการรับมัดจำครั้งนี้ (RegisterScreen ออกให้ต่อการเปิดแผ่น) */
  rcvKey: string;
  /** สมาชิกในบิล (ชิป) — ไม่มี = ลูกค้าทั่วไป (ชื่อ + เบอร์บังคับ) */
  member: { id: string; name: string } | null;
  promptpayId: string | null;
  /** ใบขอรับเงิน (สิทธิ์จากหน้าเพจเหมือนจอชำระ) — null = QR นิ่ง + ยืนยันเอง */
  intent: PayIntentSetup | null;
  printer: { config: PosPrinterConfig; deviceCode: string | undefined };
  locale: "th" | "en";
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("pos.register");
  const tc = useTranslations("common");
  const tp = useTranslations("pos.print");
  const trc = useTranslations("pos.receipt");
  // ── ฟอร์ม ──
  const [amountText, setAmountText] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<RcvMethod>("CASH");
  const [cashText, setCashText] = useState("");
  const [reference, setReference] = useState("");
  const [target, setTarget] = useState<"amount" | "cash">("amount");
  const [touched, setTouched] = useState(false);
  // ── ส่ง ──
  const [phase, setPhase] = useState<"form" | "sending" | "unknown" | "done">("form");
  const [errKey, setErrKey] = useState<string | null>(null);
  /** POS P2.9bU ▸ fix1 มติ 3 (R1 F3): ใบพร้อมเพย์ PAID แล้วแต่ S ปฏิเสธแน่นอน (ปิดรับมัดจำ / PERMISSION_DENIED) = อ้างอิง pi_ ของใบนั้น ⇒ ปิดแผ่นได้ ·
   *   ใบคงสถานะ PAID (ไม่ยกเลิก — เงินเข้าแล้ว) แบบเดียวกับจอชำระ (InterimPayDialog TERMINAL_SUBMIT :245 · close :414 · pay.intent.refundYourself :2058) ◂ */
  const [paidRef, setPaidRef] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const sentRef = useRef<TakeInput | null>(null);
  const busy = phase === "sending";

  const parsedAmount = parseHundredths(amountText);
  /** ยอดมัดจำ (สตางค์) · 0 = ยังไม่กรอก/ผิดรูป */
  const amount = parsedAmount !== null && parsedAmount > 0 ? parsedAmount : 0;
  const amountOk = amount > 0;
  const walkIn = !p.member;
  const phoneOk = !walkIn || depositPhoneOk(phone);
  const cashTyped = cashText ? parseHundredths(cashText) : null;
  const cashReceived = cashTyped ?? (amountOk ? amount : 0);
  const change = amountOk && method === "CASH" ? cashReceived - amount : 0;
  const cashOk = method !== "CASH" || ((cashTyped !== null || !cashText) && amountOk && cashReceived >= amount);
  // HF-PP (มติ 3): พร้อมเพย์/บัตรที่ยืนยันเอง + ร้านตั้ง manualConfirmRequiresManager + ผู้ใช้ไม่มี pos.shift.manage ⇒ รับด้วยวิธีนั้นไม่ได้ (เซิร์ฟเวอร์ตรวจซ้ำ)
  const manualBlocked = !!p.intent?.manualRequiresManager && !p.intent?.canManageShift;
  const cardBlocked = method === "CARD" && manualBlocked;

  // ── พร้อมเพย์: ใบขอรับเงินของยอดนี้ (คีย์ฐาน = rcvKey · แถวที่ 0) ──
  const ppTarget: IntentTarget = p.intent && method === "PROMPTPAY" && amountOk && phase === "form" ? { method: "PROMPTPAY", amountSatang: amount } : null;
  const pi = usePayIntent(p.intent ? { ...p.intent, cartKey: p.rcvKey, discountOverCap: false } : null, ppTarget, { slot: 0, usedIds: [], onPaidElsewhere: () => undefined });
  const piPaid = method === "PROMPTPAY" && !!p.intent && pi.intent?.status === "PAID" && pi.intent.amountSatang === amount;
  const staticPpBlocked = method === "PROMPTPAY" && !p.intent && manualBlocked;
  const ppReady = method !== "PROMPTPAY" || (p.intent ? piPaid : !!p.promptpayId && !staticPpBlocked);
  const qr = useMemo(() => {
    if (p.intent || method !== "PROMPTPAY" || !p.promptpayId || !amountOk) return null;
    try {
      return promptpayPayload({ id: p.promptpayId, amountSatang: amount });
    } catch {
      return null;
    }
  }, [p.intent, method, p.promptpayId, amountOk, amount]);

  const canSubmit = phase === "form" && amountOk && phoneOk && cashOk && ppReady && !cardBlocked;

  const press = (k: (typeof KEYS)[number]) => {
    if (busy || phase === "done" || (method === "PROMPTPAY" && pi.intent?.status === "PAID")) return;
    const cur = target === "cash" ? cashText : amountText;
    const set = target === "cash" ? setCashText : setAmountText;
    if (k.digits === null) return set(cur.slice(0, -1));
    const next = ((cur.includes(".") ? "" : cur) + k.digits).replace(/^0+(?=\d)/, "");
    if (next.length <= MAX_DIGITS) set(next);
  };

  // ── ส่ง (ผลไม่แน่ใจ = ลองซ้ำชุดเดิม) ──
  const buildInput = (): TakeInput | null => {
    if (!amountOk) return null;
    const pays: TakeInput["payMethods"] =
      method === "CASH"
        ? [{ type: "CASH", amountSatang: amount }]
        : method === "PROMPTPAY"
          ? [{ type: "PROMPTPAY", amountSatang: amount, ...(piPaid && pi.intent ? { reference: pi.intent.id } : {}) }]
          : [{ type: "CARD", amountSatang: amount, ...(reference.trim() ? { reference: reference.trim() } : {}) }];
    return {
      amountSatang: amount,
      payMethods: pays,
      ...(p.member ? { memberId: p.member.id } : {}),
      ...(walkIn && name.trim() ? { customerName: name.trim() } : {}),
      ...(walkIn ? { phone: phone.replace(/[\s-]/g, "") } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      // R1 F5: แถวเงินสดส่งเงินที่รับมาเสมอ (กติกาเดียวกับ submit ของหน้าขาย)
      ...(method === "CASH" ? { cashReceivedSatang: cashReceived } : {}),
      idempotencyKey: p.rcvKey,
    };
  };
  const send = async (input: TakeInput) => {
    sentRef.current = input;
    setPhase("sending");
    setErrKey(null);
    setPaidRef(null); // POS P2.9bU ▸ fix1 มติ 3 ◂
    // POS P2.9bU ▸ fix1 มติ 3: อ้างอิงของใบ PAID ที่ส่งไปกับคำขอนี้ (มีเฉพาะพร้อมเพย์ที่เงินเข้าแล้ว) ◂
    const sentPaidRef = input.payMethods[0]?.type === "PROMPTPAY" && input.payMethods[0].reference?.startsWith("pi_") ? input.payMethods[0].reference : null;
    try {
      const deviceId = getPosDeviceId();
      const r = await registerTakeDepositAction({ systemId: p.systemId, unitId: p.unitId, ...(deviceId ? { deviceId } : {}), input });
      if (r.ok) {
        if (method === "PROMPTPAY") pi.release();
        setDone({ receiptNo: r.receiptNo, amountSatang: r.deposit.amountSatang, changeSatang: r.changeSatang, receiptSaleId: r.deposit.receiptSaleId });
        setPhase("done");
        return;
      }
      if (UNSURE.has(r.code)) return setPhase("unknown");
      setPhase("form");
      if (r.code === "VALIDATION") {
        // มติ 5: ค่าตั้งถูกปิดระหว่างเปิดแผ่น = "ร้านยังไม่เปิดรับมัดจำ" · อื่น = ข้อมูลไม่ครบ
        const tn = await registerPayTendersAction({ systemId: p.systemId, unitId: p.unitId }).catch(() => null);
        const off = !!tn && tn.ok && !tn.tenders.deposit.enabled;
        setErrKey(off ? "pay.depositRcvDisabled" : "pay.depositRcvInvalid");
        if (off) setPaidRef(sentPaidRef); // POS P2.9bU ▸ fix1 มติ 3: ปิดรับมัดจำ = ปฏิเสธแน่นอน ◂
        return;
      }
      if (r.code === "PERMISSION_DENIED") setPaidRef(sentPaidRef); // POS P2.9bU ▸ fix1 มติ 3: ไม่มีสิทธิ์ = ปฏิเสธแน่นอน ◂
      setErrKey(submitRefusalMessageKey(r)); // PERMISSION_DENIED ของการยืนยันเอง = refusal.manualConfirmManager · อื่น = errors.*
    } catch {
      setPhase("unknown");
    }
  };
  const submit = () => {
    setTouched(true);
    if (!canSubmit) return;
    const input = buildInput();
    if (input) void send(input);
  };
  const retry = () => {
    if (sentRef.current) void send(sentRef.current);
  };

  // ── จอสำเร็จ: ตัวอย่างใบรับเงินมัดจำ (payload ของ S · ไม่เขียน audit) + พิมพ์ ──
  const [payload, setPayload] = useState<ReceiptPayload | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [printRes, setPrintRes] = useState<PrintResult | null>(null);
  const [printErr, setPrintErr] = useState<string | null>(null);
  useEffect(() => {
    if (!done) return;
    let live = true;
    receiptPayloadAction({ systemId: p.systemId, saleId: done.receiptSaleId })
      .then((r) => {
        if (!live) return;
        if (r.ok) setPayload(r.payload);
        else setPrintErr(trc(receiptRefusalMessageKey(r.code)));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวต่อใบรับ
  }, [done?.receiptSaleId]);
  const previewHtml = useMemo(() => (payload ? renderReceiptHtml(payload, { paper: "80", locale: p.locale }) : ""), [payload, p.locale]);
  const print = async () => {
    if (!done || printing) return;
    setPrinting(true);
    setPrintRes(null);
    setPrintErr(null);
    try {
      // ใบแรก = ต้นฉบับ (เปิดลิ้นชักเมื่อตั้งไว้ · เงินสดเข้าลิ้นชัก) · ใบถัดไป = สำเนา (reprintReceiptAction · audit) แบบจอสำเร็จของการขาย
      const r = printed ? await reprintReceiptAction({ systemId: p.systemId, saleId: done.receiptSaleId }) : payload ? { ok: true as const, payload } : await receiptPayloadAction({ systemId: p.systemId, saleId: done.receiptSaleId });
      if (!r.ok) return setPrintErr(trc(receiptRefusalMessageKey(r.code)));
      const res = await printReceipt(r.payload, p.printer.config, { locale: p.locale, deviceCode: p.printer.deviceCode, kickDrawer: !printed && p.printer.config.drawerKick && !r.payload.copy });
      if (res.ok) setPrinted(true);
      setPrintRes(res);
    } catch {
      setPrintErr(trc("errors.internal"));
    } finally {
      setPrinting(false);
    }
  };

  const tileCls = (on: boolean) =>
    `flex h-[60px] flex-col items-center justify-center gap-0.5 rounded-[16px] border px-2 text-center text-[15px] font-semibold leading-tight disabled:cursor-not-allowed disabled:text-[color:var(--color-muted)] ${
      on ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : "bg-[color:var(--color-surface)]"
    }`;
  const fieldCls = (on: boolean) =>
    `flex h-14 items-center justify-between gap-3 rounded-[10px] border bg-[color:var(--color-surface)] px-[14px] text-[13px] text-[color:var(--color-muted)] ${on ? "border-[color:var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-ink)]" : ""}`;
  // POS P2.9bU ▸ fix1 มติ 3: ใบ PAID + ปฏิเสธแน่นอน (paidRef) = ปิดได้ ◂
  const canClose = phase !== "sending" && phase !== "unknown" && !(method === "PROMPTPAY" && pi.intent?.status === "PAID" && phase !== "done" && !paidRef);
  const close = () => {
    if (!canClose) return;
    if (phase === "done") return p.onDone();
    if (pi.intent?.status === "PENDING") void pi.cancelCurrent();
    p.onClose();
  };

  return (
    <RegisterDialog onDismiss={close} locked={!canClose}>
      <div
        data-testid="pos-reg-deprcv"
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[color:var(--color-surface)] shadow-xl md:h-auto md:max-h-[min(840px,calc(100dvh-32px))] md:w-[min(960px,calc(100vw-32px))] md:rounded-[16px]"
        role="dialog"
        aria-modal="true"
        aria-label={t("pay.depositRcvTitle")}
      >
        <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2 md:px-[22px] md:py-[14px]">
          <RegisterIcon name="cheque" size={18} className="hidden md:block" />
          <h2 className="text-[19px] font-bold md:text-[17px]">{phase === "done" ? t("pay.depositRcvDone") : t("pay.depositRcvTitle")}</h2>
          <span className="flex-1" />
          {canClose && (
            <button data-testid="pos-reg-deprcv-close" className="-mr-2 grid size-11 place-items-center rounded-[11px] text-[color:var(--color-muted)] hover:bg-[color:var(--color-surface-2)]" type="button" aria-label={t("cart.close")} onClick={close}>
              <RegisterIcon name="x" size={18} />
            </button>
          )}
        </div>

        {phase === "done" && done ? (
          // ═══ จอสำเร็จ (02b ของใบรับเงินมัดจำ) ═══
          <div data-testid="pos-reg-deprcv-done" className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto px-5 py-6 text-center md:px-10">
            <span className="grid size-[52px] place-items-center rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-surface)]">
              <RegisterIcon name="check" size={26} strokeWidth={2.4} />
            </span>
            <h3 data-testid="pos-reg-deprcv-done-title" className="text-[24px] font-bold tracking-[-0.02em] tabular-nums md:text-[28px]">
              {t("pay.depositRcvDoneTitle", { no: done.receiptNo ?? "-", amount: moneyText(done.amountSatang) })}
            </h3>
            {done.changeSatang > 0 && (
              <p data-testid="pos-reg-deprcv-done-change" className="text-[16px] font-bold tabular-nums">
                {`${t("pay.change")} ${moneyText(done.changeSatang)}`}
              </p>
            )}
            {previewHtml ? (
              <iframe data-testid="pos-reg-deprcv-preview" title={t("pay.depositRcvPreview")} sandbox="allow-same-origin" srcDoc={previewHtml} className="h-[360px] w-[320px] max-w-full rounded-[10px] border bg-white" />
            ) : (
              <p className="text-[13px] text-[color:var(--color-muted)]">{tc("loading")}</p>
            )}
            {printErr && (
              <p data-testid="pos-reg-deprcv-print-error" role="alert" className="w-full max-w-[420px] rounded-[13px] border-[1.5px] border-[color:var(--color-danger)] px-4 py-2 text-left text-[13.5px]">
                {printErr}
              </p>
            )}
            {printRes && <PrintStatus result={printRes} onRetry={() => void print()} onBrowser={() => void print()} />}
            <div className="flex w-full flex-col-reverse gap-[10px] md:w-auto md:flex-row">
              <button data-testid="pos-reg-deprcv-print" className="btn btn-ghost h-12 gap-2 rounded-[13px] px-5 text-[15px] disabled:opacity-60" type="button" disabled={printing} onClick={() => void print()}>
                <RegisterIcon name="print" size={15} />
                {printing ? tp("printing") : printed ? tp("reprint") : tp("receipt")}
              </button>
              <button data-testid="pos-reg-deprcv-finish" className="btn btn-primary h-12 rounded-[13px] px-6 text-[15px] font-bold md:min-w-[180px]" type="button" autoFocus onClick={p.onDone}>
                {t("pay.depositRcvFinish")}
              </button>
            </div>
          </div>
        ) : (
          <form
            data-testid="pos-reg-deprcv-form"
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
              {/* ── ซ้าย: ยอด · ลูกค้า · หมายเหตุ · วิธีรับเงิน ── */}
              <div className="flex min-w-0 flex-col gap-4 px-5 py-4 md:flex-1 md:overflow-y-auto md:border-r md:px-[22px]">
                <label className={fieldCls(target === "amount")}>
                  <span className="min-w-0 truncate">{t("pay.depositRcvAmount")}</span>
                  <input
                    data-testid="pos-reg-deprcv-amount"
                    className="h-full w-40 min-w-0 bg-transparent text-right text-[24px] font-bold tabular-nums text-[color:var(--color-ink)] outline-none"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={amountText}
                    disabled={busy || phase === "unknown" || pi.intent?.status === "PAID"}
                    aria-invalid={touched && !amountOk}
                    onFocus={() => setTarget("amount")}
                    onChange={(e) => setAmountText(e.target.value)}
                  />
                </label>
                {touched && !amountOk && (
                  <p className="-mt-2 text-[13px] text-[color:var(--color-danger)]" role="alert">
                    {t("errors.amountInvalid")}
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <span className="text-[12px] text-[color:var(--color-muted)]">{t("pay.depositRcvCustomer")}</span>
                  {p.member ? (
                    <span data-testid="pos-reg-deprcv-member" className="inline-flex min-h-11 items-center gap-2 self-start rounded-[10px] border px-3 text-[14px] font-semibold">
                      <RegisterIcon name="users" size={14} />
                      {t("pay.depositRcvMember", { name: p.member.name })}
                    </span>
                  ) : (
                    <>
                      <label className="flex flex-col gap-1 text-[13px] text-[color:var(--color-muted)]">
                        {t("pay.depositRcvName")}
                        <input
                          data-testid="pos-reg-deprcv-name"
                          className="input h-12 rounded-[10px] text-[15px] text-[color:var(--color-ink)]"
                          autoComplete="off"
                          maxLength={NAME_MAX}
                          value={name}
                          disabled={busy || phase === "unknown"}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[13px] text-[color:var(--color-muted)]">
                        {t("pay.depositRcvPhone")}
                        <input
                          data-testid="pos-reg-deprcv-phone"
                          className="input h-12 rounded-[10px] text-[15px] tabular-nums text-[color:var(--color-ink)]"
                          inputMode="tel"
                          autoComplete="off"
                          maxLength={14}
                          value={phone}
                          disabled={busy || phase === "unknown"}
                          aria-invalid={touched && !phoneOk}
                          onChange={(e) => setPhone(e.target.value.replace(/[^\d\s-]/g, ""))}
                        />
                        <small className={`text-[12px] ${touched && !phoneOk ? "font-semibold text-[color:var(--color-danger)]" : "text-[color:var(--color-muted)]"}`} role={touched && !phoneOk ? "alert" : undefined}>
                          {touched && !phoneOk ? t("pay.depositRcvPhoneInvalid") : t("pay.depositRcvPhoneHint")}
                        </small>
                      </label>
                    </>
                  )}
                </div>

                <label className="flex flex-col gap-1 text-[13px] text-[color:var(--color-muted)]">
                  {t("pay.depositRcvNote")}
                  <input
                    data-testid="pos-reg-deprcv-note"
                    className="input h-12 rounded-[10px] text-[15px] text-[color:var(--color-ink)]"
                    autoComplete="off"
                    maxLength={NOTE_MAX}
                    placeholder={t("pay.depositRcvNotePlaceholder")}
                    value={note}
                    disabled={busy || phase === "unknown"}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>

                <div className="flex flex-col gap-2">
                  <span className="text-[12px] text-[color:var(--color-muted)]">{t("pay.depositRcvMethod")}</span>
                  <div className="grid grid-cols-3 gap-2.5" role="group" aria-label={t("pay.depositRcvMethod")}>
                    {METHODS.map(({ m, label }) => {
                      const off = busy || phase === "unknown" || (method !== m && pi.intent?.status === "PAID") || (m === "PROMPTPAY" && !p.intent && !p.promptpayId);
                      return (
                        <button
                          key={m}
                          data-testid={`pos-reg-deprcv-method-${m.toLowerCase()}`}
                          className={tileCls(method === m && !off)}
                          type="button"
                          aria-pressed={method === m}
                          disabled={off}
                          onClick={() => {
                            setMethod(m);
                            setTarget(m === "CASH" ? "cash" : "amount");
                            setErrKey(null);
                          }}
                        >
                          <span>{t(label)}</span>
                          <small className="text-[12px] font-normal text-[color:var(--color-muted)]">
                            {m === "CASH" ? t("pay.depositRcvCashSub") : m === "PROMPTPAY" ? t("pay.promptpayHint") : t("pay.cardHint")}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── ขวา: เงินสด/พร้อมเพย์/บัตร + แป้นตัวเลข ── */}
              <div className="flex flex-col gap-4 px-5 pb-4 md:w-[400px] md:shrink-0 md:overflow-y-auto md:bg-[color:var(--color-surface-2)] md:px-[22px] md:py-[18px]">
                {method === "CASH" && (
                  <>
                    <label className={fieldCls(target === "cash")}>
                      <span className="min-w-0 truncate">{t("pay.amountCash")}</span>
                      <input
                        data-testid="pos-reg-deprcv-cash"
                        className="h-full w-36 min-w-0 bg-transparent text-right text-[22px] font-bold tabular-nums text-[color:var(--color-ink)] outline-none"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder={amountOk ? hundredthsText(amount) : "0"}
                        value={cashText}
                        disabled={busy || phase === "unknown"}
                        aria-invalid={touched && !cashOk}
                        onFocus={() => setTarget("cash")}
                        onChange={(e) => setCashText(e.target.value)}
                      />
                    </label>
                    <div className="flex items-baseline justify-between rounded-[10px] bg-[color:var(--color-surface)] px-[14px] py-2.5 md:border">
                      <span className="text-[14px] text-[color:var(--color-ink-soft)]">{t("pay.change")}</span>
                      <span data-testid="pos-reg-deprcv-change" className="text-[22px] font-bold tabular-nums">
                        {amountOk && cashReceived >= amount ? moneyText(change) : "-"}
                      </span>
                    </div>
                    {touched && amountOk && !cashOk && (
                      <p className="-mt-2 text-[13px] text-[color:var(--color-danger)]" role="alert">
                        {t("errors.paymentMismatch")}
                      </p>
                    )}
                  </>
                )}
                {method === "PROMPTPAY" && p.intent && (
                  <PayIntentPanel h={pi} setup={{ ...p.intent, cartKey: p.rcvKey, discountOverCap: false }} method="PROMPTPAY" amountSatang={amountOk ? amount : 0} waiting={!amountOk} />
                )}
                {method === "PROMPTPAY" && !p.intent && p.promptpayId && (
                  <div data-testid="pos-reg-deprcv-qr" className="flex items-center gap-5 rounded-[12px] border bg-[color:var(--color-surface)] p-[14px] max-md:flex-col">
                    <PromptPayQr payload={qr} size={150} />
                    <div className="flex min-w-0 flex-1 flex-col gap-2 max-md:items-center max-md:text-center">
                      <div className="text-[28px] font-bold tracking-[-0.02em] tabular-nums">{moneyText(amountOk ? amount : 0)}</div>
                      <p className="text-[12.5px] leading-[1.45] text-[color:var(--color-ink-soft)]">{staticPpBlocked ? t("pay.intent.managerOnly") : t("pay.scanToPay")}</p>
                    </div>
                  </div>
                )}
                {method === "CARD" && (
                  <label className="flex flex-col gap-1.5 text-[13px] text-[color:var(--color-muted)]">
                    <span>
                      {t("pay.reference")} <span className="text-[12px]">· {t("pay.referenceHint")}</span>
                    </span>
                    <input
                      data-testid="pos-reg-deprcv-reference"
                      className="input h-12 rounded-[10px] text-[15px] text-[color:var(--color-ink)]"
                      value={reference}
                      maxLength={REGISTER_REFERENCE_MAX}
                      disabled={busy || phase === "unknown"}
                      autoComplete="off"
                      onChange={(e) => setReference(e.target.value)}
                    />
                    {cardBlocked && <small data-testid="pos-reg-deprcv-manager-only" className="text-[12px] text-[color:var(--color-muted)]">{t("pay.intent.managerOnly")}</small>}
                  </label>
                )}
                <div className="hidden grid-cols-3 gap-3 md:grid" role="group" aria-label={t("pay.numpad")}>
                  {KEYS.map((k) => (
                    <button
                      key={k.id}
                      data-testid={`pos-reg-deprcv-key-${k.id}`}
                      className={`grid h-14 place-items-center rounded-[14px] border text-[21px] font-semibold tabular-nums active:bg-[color:var(--color-surface-2)] disabled:opacity-50 ${
                        k.id === "00" || k.id === "back" ? "bg-[color:var(--color-surface-2)] text-[18px]" : "bg-[color:var(--color-surface)]"
                      }`}
                      type="button"
                      disabled={busy || phase === "unknown"}
                      aria-label={k.id === "back" ? t("pay.backspace") : k.label}
                      onClick={() => press(k)}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── ท้าย: ข้อผิดพลาด · ผลไม่แน่ใจ · ยกเลิก · รับมัดจำ ── */}
            <div className="flex shrink-0 flex-col gap-3 border-t px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 md:flex-row md:items-center md:gap-4 md:px-[22px] md:py-[14px]">
              <div className="min-w-0 flex-1">
                {errKey && (
                  <p data-testid="pos-reg-deprcv-error" className="text-[13.5px] font-semibold text-[color:var(--color-danger)]" role="alert">
                    {t(errKey)}
                  </p>
                )}
                {/* POS P2.9bU ▸ fix1 มติ 3: เงินเข้าแล้วแต่ไม่ได้บันทึกมัดจำ — อ้างอิงใบขอรับเงินให้ร้านกระทบยอด/คืนเงินเอง ◂ */}
                {paidRef && phase === "form" && (
                  <p data-testid="pos-reg-deprcv-paid-ref" className="mt-1 text-[13px] font-semibold text-[color:var(--color-danger)]" role="alert">
                    {t("pay.depositRcvPaidRef", { ref: paidRef })}
                  </p>
                )}
                {phase === "unknown" && (
                  <p data-testid="pos-reg-deprcv-unknown" className="text-[13.5px] font-semibold text-[color:var(--color-danger)]" role="alert">
                    {t("errors.unknownResult")}
                  </p>
                )}
              </div>
              {phase === "unknown" ? (
                <button data-testid="pos-reg-deprcv-retry" className="btn btn-primary h-12 rounded-[13px] px-5 text-[15px] font-bold" type="button" autoFocus onClick={retry}>
                  {t("pay.retry")}
                </button>
              ) : (
                <>
                  <button data-testid="pos-reg-deprcv-cancel" className="btn btn-ghost hidden h-12 rounded-[13px] px-5 text-[14.5px] md:inline-flex" type="button" disabled={!canClose} onClick={close}>
                    {t("pay.back")}
                  </button>
                  <button
                    data-testid="pos-reg-deprcv-submit"
                    className="btn btn-primary h-14 rounded-[16px] px-5 text-[16px] font-bold disabled:cursor-not-allowed disabled:border disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-muted)] md:h-12 md:rounded-[13px] md:text-[14.5px]"
                    type="submit"
                    disabled={busy || (touched && !canSubmit) || (method === "PROMPTPAY" && !ppReady) || cardBlocked}
                  >
                    {busy ? t("pay.depositRcvSending") : t("pay.depositRcvSubmit", { amount: moneyText(amountOk ? amount : 0) })}
                  </button>
                </>
              )}
            </div>
          </form>
        )}
      </div>
    </RegisterDialog>
  );
}
