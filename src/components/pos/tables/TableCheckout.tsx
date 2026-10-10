"use client";

// TableCheckout.tsx — เช็คบิลโต๊ะ (POS P2.4U · มติ 5) = จอชำระเดิมของหน้าขาย (PayDialog + PayDone) ป้อนด้วย quote ของโต๊ะ
//   quote = quoteRegisterCartAction({cart:{lines:[], tableSessionId, billDiscount?, couponCode?}}) (สมาชิกของโต๊ะ = ที่ผูกกับ session · เซิร์ฟเวอร์ใส่เอง)
//   ส่วนลดเกินเพดาน = PIN ผู้จัดการเท่านั้น (ไม่มีพักรออนุมัติสำหรับบิลโต๊ะ) → quoteRegisterCartOverrideAction + managerPin/managerUserId ตอนส่ง
//   submit = submitRegisterSaleAction({sale:{lines:[], tableSessionId, expectedTableItemsHash: quote.table.itemsHash, idempotencyKey, expectedGrandTotalSatang, payMethods, …}})
//     TABLE_ITEMS_CHANGED ⇒ quote ใหม่ + ข้อความ "รายการบนโต๊ะเปลี่ยน — ตรวจยอดใหม่" (กล่องยังเปิด ยอดใหม่) · TABLE_EMPTY / TABLE_SESSION_CLOSED ⇒ ปิดกล่อง โหลดใหม่ ·
//     UNKNOWN/INTERNAL/BUSY/เครือข่ายล้ม = "ไม่แน่ใจ" → ลองซ้ำด้วยชุดคำขอเดิม คีย์เดิมเท่านั้น · IDEMPOTENCY_CONFLICT = แสดงบิลเดิม
// 🔴 คีย์บิล: 1 คีย์ต่อการเปิดจอเช็คบิล 1 ครั้ง (newCheckoutKey ตอน mount) — ไม่หมุนระหว่างกล่องเปิด · ปฏิเสธที่ชัดว่าไม่มีบิลใช้คีย์เดิมส่งชุดใหม่ได้
// 🔴 คำขอที่ส่งแล้วแต่ยังไม่รู้ผล เก็บใน sessionStorage ต่อระบบ+สาขา+ผู้ใช้ (ไม่มี PIN ผู้จัดการ) — โหลดหน้าใหม่ = ลองซ้ำชุดเดิม (TablesScreen เปิดกล่องให้)
// 🔴 เงินทั้งหมดมาจาก quote/คำตอบของเซิร์ฟเวอร์ · ข้อความผิดพลาดมาจาก refusalMessageKey เท่านั้น

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  moneyText,
  refusalMessageKey,
  REGISTER_MAX_PAY_METHODS,
  type RegisterPayMethod,
  type RegisterQuote,
  type RegisterQuoteInput,
  type RegisterSaleStatus,
  type RegisterSubmitInput,
  type RegisterSubmitOk,
  type PosDiscountCaps,
} from "@/lib/modules/pos/register-shared";
import type { PriceDiscount } from "@/lib/modules/pos/pricing-shared";
import { quoteRegisterCartAction, quoteRegisterCartOverrideAction, submitRegisterSaleAction } from "@/lib/modules/pos/register-actions";
import type { PosPrinterConfig } from "@/lib/modules/pos/device-shared";
import { PayDialog, type PayChoice, type PayError, type PayPhase } from "@/components/pos/register/InterimPayDialog";
import { PayDone } from "@/components/pos/register/PayDone";
import { BillDiscountDialog } from "@/components/pos/register/BillDiscountDialog";
import { CouponDialog } from "@/components/pos/register/CouponDialog";
// ชื่อลงท้าย Sheet = ตัวสแกนปุ่ม (F15.3) ⇒ ชื่อแฝงตอนวาง (ปุ่มข้างในมี testid ครบ)
import { DiscountOverSheet as DiscountOverBox } from "@/components/pos/register/DiscountOverSheet";
import { normalizeCouponCode } from "@/lib/modules/pos/register-member-shared";
import { newCheckoutKey } from "./table-ui";

export type TableToast = { key: string; ns: "tables" | "register"; values?: Record<string, string | number> };
type Pending = { v: 1; userId: string; idempotencyKey: string; sessionId: string; tableName: string; sale: RegisterSubmitInput; phase: "sending" | "unknown" };

/** คีย์ storage ของคำขอเช็คบิลโต๊ะที่ยังไม่รู้ผล — ระบบ + สาขา + ผู้ใช้ */
export const tablePendingKey = (systemId: string, unitId: string, userId: string) => `pos-tbl-pending:${systemId}:${unitId}:${userId}`;
/** อ่านคำขอค้างของผู้ใช้นี้ (ของคนอื่น/รูปผิด = ลบทิ้ง · null) */
export function readTablePending(systemId: string, unitId: string, userId: string): Pending | null {
  try {
    const key = tablePendingKey(systemId, unitId, userId);
    const raw = window.sessionStorage.getItem(key);
    const v = raw ? (JSON.parse(raw) as Partial<Pending>) : null;
    if (!v) return null;
    if (v.userId !== userId || v.v !== 1 || typeof v.idempotencyKey !== "string" || !v.sale || v.sale.idempotencyKey !== v.idempotencyKey || typeof v.sessionId !== "string") {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return v as Pending;
  } catch {
    return null;
  }
}

type Props = {
  systemId: string;
  unitId: string;
  userId: string;
  sessionId: string;
  tableName: string;
  memberChip: string | null;
  memberAttached: boolean;
  initialQuote: RegisterQuote | null;
  /** แจ้งเตือน PAY_PROMPTPAY "ยืนยันรับเงิน": เลือกพร้อมเพย์ไว้ + ไม่สร้างใบขอรับเงินใหม่ (ลูกค้าจ่าย QR ของโต๊ะไปแล้ว — ยืนยันเองแบบ P1.6) */
  promptpayPreset: boolean;
  promptpayId: string | null;
  tipEnabled: boolean;
  payIntent: { beamCard: boolean; manualRequiresManager: boolean; canManageShift: boolean; promptpayLink: string } | null;
  maxDiscountBp: number | null;
  discountCaps?: PosDiscountCaps;
  deviceId?: string;
  staffToken?: string;
  printer: { config: PosPrinterConfig; deviceCode: string | undefined };
  locale: "th" | "en";
  salesHref: string;
  /** คำขอค้างจาก storage (โหลดหน้าใหม่) — เปิดมาในสถานะ "ไม่แน่ใจ" แล้วลองซ้ำทันที */
  restore: Pending | null;
  onToast: (m: TableToast) => void;
  onStaffTokenDead: () => void;
  /** paid = บิลจบ (ผู้เรียกโหลดผัง/แผงใหม่) · closed = โต๊ะปิด/ว่างระหว่างทาง · aborted = ปิดกล่องเอง */
  onFinished: (kind: "paid" | "closed" | "aborted") => void;
  /** fix 1 F4: โหมดพร้อมเพย์ที่แจ้งจากโต๊ะ — แตะวิธีจ่ายอื่น ⇒ ผู้เรียกปิดกล่องนี้แล้วเปิดเช็คบิลปกติ (มีใบขอรับเงิน) */
  onSwitchToNormal?: () => void;
};

type Sub = { kind: "discount" } | { kind: "coupon" } | { kind: "over" } | null;

export function TableCheckout(p: Props) {
  const t = useTranslations("pos.tables");
  const tr = useTranslations("pos.register");
  const [idemKey] = useState(() => p.restore?.idempotencyKey ?? newCheckoutKey());
  const [billDiscount, setBillDiscount] = useState<PriceDiscount | undefined>(p.restore?.sale.billDiscount);
  const [couponCode, setCouponCode] = useState<string | undefined>(p.restore?.sale.couponCode);
  const [pin, setPin] = useState<{ managerUserId: string; managerName: string; managerPin: string } | null>(null);
  const [quote, setQuote] = useState<RegisterQuote | null>(p.restore ? null : p.initialQuote);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(!p.restore);
  const [phase, setPhase] = useState<PayPhase>(p.restore ? "unknown" : "form");
  const [error, setError] = useState<PayError | null>(null);
  const [conflict, setConflict] = useState<{ receiptNo: string | null; saleStatus: RegisterSaleStatus | null } | null>(null);
  const [done, setDone] = useState<{ result: RegisterSubmitOk; payMethods: RegisterPayMethod[] } | null>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [couponErr, setCouponErr] = useState<string | null>(null);
  const pendingRef = useRef<RegisterSubmitInput | null>(p.restore?.sale ?? null);
  const sendingRef = useRef(false);
  const quoteSeq = useRef(0);
  /** fix 1 F5: ยอดก่อนส่วนลดของ quote ที่ดีล่าสุด (คิด "ขอส่วนลด N%" ของส่วนลดแบบบาท — ทาง restore/quote ล้มก็ยังมีค่า) */
  const lastSubtotal = useRef<number | null>(p.initialQuote?.subtotalSatang ?? null);
  const storeKey = tablePendingKey(p.systemId, p.unitId, p.userId);

  const savePending = (sale: RegisterSubmitInput, ph: "sending" | "unknown") => {
    try {
      const { managerPin: _pin, managerUserId: _mgr, ...stored } = sale;
      void _pin;
      void _mgr;
      const rec: Pending = { v: 1, userId: p.userId, idempotencyKey: sale.idempotencyKey, sessionId: p.sessionId, tableName: p.tableName, sale: stored, phase: ph };
      window.sessionStorage.setItem(storeKey, JSON.stringify(rec));
    } catch {
      /* เก็บไม่ได้ — ลองซ้ำในหน้านี้ยังได้ */
    }
  };
  const clearPending = () => {
    try {
      window.sessionStorage.removeItem(storeKey);
    } catch {
      /* ไม่มีอะไรให้ลบ */
    }
  };

  const cartInput = useCallback(
    (bd: PriceDiscount | undefined, cc: string | undefined): RegisterQuoteInput => ({ lines: [], tableSessionId: p.sessionId, ...(bd ? { billDiscount: bd } : {}), ...(cc ? { couponCode: cc } : {}) }),
    [p.sessionId],
  );

  /** quote ของโต๊ะ (ทุกครั้งที่ส่วนลด/คูปอง/PIN เปลี่ยน · หลัง TABLE_ITEMS_CHANGED / PRICE_CHANGED) */
  const requote = useCallback(async () => {
    const seq = ++quoteSeq.current;
    setQuoting(true);
    setQuoteErr(null);
    setQuote(null); // ยอดเก่าใช้ไม่ได้แล้ว (ส่วนลด/คูปอง/PIN/ชุดรายการเปลี่ยน) — ปุ่มยืนยันปิดจนกว่า quote ใหม่ตอบ
    try {
      const cart = cartInput(billDiscount, couponCode);
      const r = pin
        ? await quoteRegisterCartOverrideAction({
            systemId: p.systemId,
            unitId: p.unitId,
            ...(p.deviceId ? { deviceId: p.deviceId } : {}),
            cart,
            ...(p.staffToken ? { staffToken: p.staffToken } : {}),
            managerPin: pin.managerPin,
            managerUserId: pin.managerUserId,
            idempotencyKey: idemKey,
          })
        : await quoteRegisterCartAction({ systemId: p.systemId, unitId: p.unitId, cart });
      if (seq !== quoteSeq.current) return;
      if (r.ok) {
        // คูปองใช้ไม่ได้ (รายงานเป็น memberConflicts) ⇒ ถอดคูปอง + บอกเหตุผล แล้ว quote ใหม่โดยไม่มีคูปอง
        if (couponCode && r.memberConflicts?.some((x) => x.code === "COUPON_INVALID")) {
          p.onToast({ key: refusalMessageKey("COUPON_INVALID"), ns: "register" });
          setCouponCode(undefined);
          return;
        }
        setQuote(r);
        lastSubtotal.current = r.subtotalSatang;
        return;
      }
      setQuote(null);
      if (r.code === "TABLE_EMPTY" || r.code === "TABLE_SESSION_CLOSED" || r.code === "TABLE_NOT_FOUND") {
        p.onToast({ key: refusalMessageKey(r.code), ns: "register" });
        p.onFinished("closed");
        return;
      }
      if (r.code === "STAFF_TOKEN_INVALID") p.onStaffTokenDead();
      if (pin && (r.code === "PIN_INVALID" || r.code === "PIN_LOCKED" || r.code === "PIN_THROTTLED")) setPin(null);
      if (r.code === "COUPON_INVALID" && couponCode) {
        p.onToast({ key: refusalMessageKey(r.code), ns: "register" });
        setCouponCode(undefined);
        return;
      }
      setQuoteErr(r.code);
    } catch {
      if (seq === quoteSeq.current) setQuoteErr("UNKNOWN");
    } finally {
      if (seq === quoteSeq.current) setQuoting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวกระตุ้น = ส่วนลด/คูปอง/PIN
  }, [billDiscount, couponCode, pin, cartInput, idemKey]);
  useEffect(() => {
    if (phase === "form") void requote();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ส่วนลด/คูปอง/PIN เปลี่ยน = quote ใหม่
  }, [billDiscount, couponCode, pin]);

  // ระหว่างส่ง/ไม่แน่ใจ ห้ามปิดแท็บเงียบ ๆ (ชุดคำขอที่ส่งแล้วอยู่ในหน่วยความจำ + storage)
  useEffect(() => {
    if (phase !== "sending" && phase !== "unknown") return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [phase]);

  const send = async (sale: RegisterSubmitInput) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    pendingRef.current = sale;
    savePending(sale, "sending");
    setPhase("sending");
    setError(null);
    try {
      const r = await submitRegisterSaleAction({ systemId: p.systemId, unitId: p.unitId, sale, ...(p.deviceId ? { deviceId: p.deviceId } : {}) });
      if (r.ok) {
        pendingRef.current = null;
        clearPending();
        setPhase("form");
        setDone({ result: r, payMethods: sale.payMethods });
        return;
      }
      if (r.code === "UNKNOWN" || r.code === "INTERNAL" || r.code === "BUSY") {
        savePending(sale, "unknown");
        setPhase("unknown");
        return;
      }
      if (r.code === "IDEMPOTENCY_CONFLICT") {
        setConflict("saleId" in r ? { receiptNo: r.receiptNo, saleStatus: r.saleStatus } : { receiptNo: null, saleStatus: null });
        pendingRef.current = null;
        clearPending();
        setPhase("conflict");
        return;
      }
      // ปฏิเสธที่ชัดว่าไม่มีบิล ⇒ คีย์เดิม · ไม่มีคำขอค้าง
      pendingRef.current = null;
      clearPending();
      setPhase("form");
      if (r.code === "TABLE_ITEMS_CHANGED") {
        p.onToast({ key: "checkout.itemsChanged", ns: "tables" });
        void requote();
        return;
      }
      if (r.code === "TABLE_EMPTY" || r.code === "TABLE_SESSION_CLOSED" || r.code === "TABLE_NOT_FOUND") {
        p.onToast({ key: refusalMessageKey(r.code), ns: "register" });
        p.onFinished("closed");
        return;
      }
      if (r.code === "STAFF_TOKEN_INVALID") p.onStaffTokenDead();
      if (r.code === "PIN_INVALID" || r.code === "PIN_LOCKED" || r.code === "PIN_THROTTLED") setPin(null);
      setError({ code: r.code, key: refusalMessageKey(r.code) });
      if (r.code === "PRICE_CHANGED" || r.code === "PAYMENT_MISMATCH" || r.code === "COUPON_INVALID" || r.code === "DISCOUNT_EXCEEDS_LIMIT") void requote();
    } catch {
      savePending(sale, "unknown");
      setPhase("unknown"); // เครือข่ายล้ม — ไม่รู้ว่าบันทึกแล้วหรือยัง
    } finally {
      sendingRef.current = false;
    }
  };
  // โหลดหน้าใหม่ระหว่างไม่แน่ใจ ⇒ ลองซ้ำชุดเดิมทันที (คีย์เดิม)
  useEffect(() => {
    if (p.restore) void send(p.restore.sale);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวตอนเปิด
  }, []);

  const confirm = (c: PayChoice) => {
    const q = quote;
    if (!q || !q.table || sendingRef.current || phase !== "form") return;
    const due = q.grandTotalSatang;
    const tip = p.tipEnabled ? c.tipSatang : 0;
    const sum = c.payMethods.reduce((s, m) => s + m.amountSatang, 0);
    if (sum !== due + tip || c.payMethods.some((m) => m.amountSatang <= 0) || c.payMethods.length > REGISTER_MAX_PAY_METHODS) return;
    const cash = c.payMethods.find((m) => m.type === "CASH");
    if (cash && (c.cashReceivedSatang ?? 0) < cash.amountSatang) return;
    const sale: RegisterSubmitInput = {
      ...cartInput(billDiscount, couponCode),
      idempotencyKey: idemKey,
      payMethods: c.payMethods,
      ...(cash ? { cashReceivedSatang: c.cashReceivedSatang } : {}),
      ...(tip > 0 ? { tipSatang: tip } : {}),
      expectedGrandTotalSatang: due,
      expectedTableItemsHash: q.table.itemsHash,
      ...(p.staffToken ? { staffToken: p.staffToken } : {}),
      ...(pin ? { managerPin: pin.managerPin, managerUserId: pin.managerUserId } : {}),
    };
    void send(sale);
  };

  // Esc: กล่องย่อยก่อน · จอชำระปิดได้เฉพาะขั้นกรอก · จอผลลัพธ์ปิดด้วยปุ่มเท่านั้น
  const escState = useRef({ sub, phase, done: !!done });
  escState.current = { sub, phase, done: !!done };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      const s = escState.current;
      if (s.sub) {
        e.preventDefault();
        setSub(null);
      } else if (!s.done && s.phase === "form") {
        e.preventDefault();
        p.onFinished("aborted");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ตัวจับเดียวตลอดอายุกล่อง
  }, []);

  if (done) {
    return (
      <div data-testid="pos-tbl-checkout" data-phase="done">
        <PayDone
          receiptNo={done.result.receiptNo}
          totalSatang={done.payMethods.reduce((s, m) => s + m.amountSatang, 0) || done.result.grandTotalSatang}
          changeSatang={done.result.changeSatang}
          payMethods={done.payMethods}
          onNext={() => {
            p.onToast({ key: "checkout.done", ns: "tables", values: { table: p.tableName } });
            p.onFinished("paid");
          }}
          systemId={p.systemId}
          saleId={done.result.saleId}
          printer={p.printer}
          locale={p.locale}
          memberAttached={p.memberAttached}
          member={done.result.member}
        />
      </div>
    );
  }

  const over = quoteErr === "DISCOUNT_EXCEEDS_LIMIT";
  const quoteError: PayError | null = quoteErr ? { code: quoteErr, key: refusalMessageKey(quoteErr) } : null;
  const extras = (
    <div data-testid="pos-tbl-checkout-extras" className="flex flex-wrap items-center gap-2">
      <button
        data-testid="pos-tbl-checkout-discount"
        type="button"
        disabled={phase !== "form"}
        className={`btn-sm h-11 rounded-[12px] px-3 text-[13.5px] ${billDiscount ? "border-[color:var(--color-ink)] font-bold" : ""}`}
        onClick={() => setSub({ kind: "discount" })}
      >
        {billDiscount && quote ? t("checkout.discountSet", { amount: moneyText(quote.billDiscountSatang) }) : tr("actions.billDiscount")}
      </button>
      <button
        data-testid="pos-tbl-checkout-coupon"
        type="button"
        disabled={phase !== "form"}
        className={`btn-sm h-11 rounded-[12px] px-3 text-[13.5px] ${couponCode ? "border-[color:var(--color-ink)] font-bold" : ""}`}
        onClick={() => {
          setCouponErr(null);
          setSub({ kind: "coupon" });
        }}
      >
        {couponCode ? t("checkout.couponSet", { code: couponCode }) : t("checkout.coupon")}
      </button>
      {p.promptpayPreset && (
        <p data-testid="pos-tbl-checkout-preset" className="w-full text-[12.5px] text-[color:var(--color-ink-soft)]">
          {t("checkout.presetLocked")}
          {presetManagerOnly && <b className="mt-0.5 block text-[color:var(--color-danger)]">{tr("pay.intent.managerOnly")}</b>}
        </p>
      )}
      {over && (
        <button data-testid="pos-tbl-checkout-discount-over" type="button" className="h-11 px-1 text-[13.5px] font-bold text-[color:var(--color-accent)] underline underline-offset-2" onClick={() => setSub({ kind: "over" })}>
          {tr("discountOver.open")}
        </button>
      )}
    </div>
  );
  const sub0 = lastSubtotal.current;
  const wantBp = billDiscount ? (billDiscount.type === "PERCENT" ? billDiscount.value : sub0 && sub0 > 0 ? Math.ceil((billDiscount.value * 10_000) / sub0) : 0) : 0;
  // fix 1 F4 (มติผู้คุม): พร้อมเพย์ที่แจ้งจากโต๊ะ = ไม่สร้างใบใหม่ (D4) แต่ใช้ด่านเดียวกับปุ่มยืนยันเองของ QR (P1.7): ร้านตั้งให้ผู้จัดการยืนยัน + ผู้ใช้ไม่มี pos.shift.manage ⇒ ยืนยันไม่ได้
  const presetManagerOnly = p.promptpayPreset && !!p.payIntent?.manualRequiresManager && !p.payIntent?.canManageShift;

  return (
    <div data-testid="pos-tbl-checkout" data-phase={phase} className="contents">
      <div className="contents" inert={sub !== null}>
        <PayDialog
          dueSatang={quote?.grandTotalSatang ?? pendingRef.current?.expectedGrandTotalSatang ?? 0}
          breakdown={quote}
          quotePending={!quote && !quoteErr && (quoting || phase === "form")}
          quoteError={quoteError}
          itemCount={quote?.lines.length ?? (pendingRef.current ? 1 : 0)}
          promptpayId={p.promptpayId}
          tipEnabled={p.tipEnabled}
          billNote={null}
          phase={phase}
          error={error}
          conflict={conflict}
          salesHref={p.salesHref}
          onConfirm={confirm}
          onRetry={() => {
            if (pendingRef.current) void send(pendingRef.current); // ชุดเดิมทุกไบต์ · คีย์เดิม
          }}
          onClose={() => {
            if (phase === "form") p.onFinished("aborted");
          }}
          onNewBill={() => p.onFinished("aborted")}
          memberChip={p.memberChip}
          memberSection={extras}
          intent={p.payIntent && !p.promptpayPreset ? { ...p.payIntent, systemId: p.systemId, unitId: p.unitId, cartKey: idemKey, discountOverCap: over } : null}
          taxInvoice={null}
          {...(p.promptpayPreset ? { initialMethod: "PROMPTPAY" as const, lockedMethod: { managerOnly: presetManagerOnly, onSwitch: () => p.onSwitchToNormal?.() } } : {})}
        />
      </div>
      {sub?.kind === "discount" && (
        <BillDiscountDialog
          current={billDiscount}
          capBp={p.maxDiscountBp}
          onApply={(d) => {
            setBillDiscount(d);
            setSub(null);
            return null;
          }}
          onCoupon={() => setSub({ kind: "coupon" })}
          onClose={() => setSub(null)}
        />
      )}
      {sub?.kind === "coupon" && (
        <CouponDialog
          current={couponCode ?? null}
          pending={quoting}
          errorKey={couponErr}
          onApply={(raw) => {
            const code = normalizeCouponCode(raw);
            if (!code) return;
            setCouponCode(code);
            setSub(null);
          }}
          onRemove={() => {
            setCouponCode(undefined);
            setSub(null);
          }}
          onClose={() => setSub(null)}
        />
      )}
      {sub?.kind === "over" && (
        <DiscountOverBox
          systemId={p.systemId}
          unitId={p.unitId}
          deviceId={p.deviceId}
          capBp={p.maxDiscountBp}
          wantBp={wantBp}
          canRequest={false}
          busy={false}
          error={null}
          onPin={(managerUserId, managerName, managerPin) => {
            setPin({ managerUserId, managerName, managerPin });
            setSub(null);
            p.onToast({ key: "discountOver.pinArmed", ns: "register", values: { name: managerName } });
          }}
          onRequest={() => undefined}
          onClose={() => setSub(null)}
        />
      )}
    </div>
  );
}
