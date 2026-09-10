"use client";

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { formatBaht } from "@/lib/ui/money";
import { PromptPayQr } from "@/components/PromptPayQr";
import { MemberIcon } from "@/components/member/MemberIcon";
import {
  posQuoteAction,
  posMemberRightsAction,
  registerSaleAction,
  type QuoteState,
  type RegisterSaleState,
} from "@/lib/actions/pos";
import type {
  PosServiceItem,
  PosCatalogItem,
  PosMember,
  PosMemberChoicesInput,
  PosMemberRights,
} from "@/lib/modules/pos/register";

// itemId = InvItem.id (สินค้าจาก catalog → ตัดสต็อก) · undefined = รายการเพิ่มเอง
type CartRow = { key: string; name: string; qty: number; unitPriceSatang: number; itemId?: string; serviceId?: string };
type PayMethod = "CASH" | "PROMPTPAY";
type OkQuote = Extract<QuoteState, { ok: true }>;

// สตางค์จากช่องกรอกบาท (รับ "" → 0) — ปัดเป็นสตางค์เต็ม
function bahtToSatang(v: string): number {
  const n = parseFloat(v.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const newKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`;

const num = (n: number) => n.toLocaleString("th-TH");

// ── M2.8 · แผงสิทธิ์ที่หน้าขาย (ภาพ 06) ──────────────────────────────────────
// 🔴 ลำดับส่วนลด (ระดับ → voucher → คูปอง → แต้ม → gift card) และ "ใช้ซ้อนได้ไหม"
//    ถูกตัดสินที่ฝั่งเซิร์ฟเวอร์ (`member.quoteApply`) เสมอ — แผงนี้ **แค่แสดงผลที่ได้กลับมา**
//    ห้ามคำนวณส่วนลดเองในไฟล์นี้ ไม่งั้นยอดบนจอกับยอดที่ตัดจริงจะเพี้ยนกันเงียบ ๆ
// 🔴 ไม่มีอีโมจิ/สัญลักษณ์พิเศษ · ไม่มีสีตายตัว (โทเคนล้วน) · ไอคอนผ่าน MemberIcon เท่านั้น

/** ชิปเล็ก ๆ (ระดับสมาชิก · ลำดับการใช้สิทธิ์) */
function Chip({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${muted ? "text-[color:var(--color-muted)]" : "font-medium"}`}
    >
      {children}
    </span>
  );
}

function PanelCard({
  testid,
  icon,
  children,
}: {
  testid: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testid} className="card flex items-start gap-2 p-3">
      <span className="mt-0.5 text-[color:var(--color-muted)]">
        <MemberIcon name={icon} size="sm" />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

/** สวิตช์เปิด/ปิดสิทธิ์ (แต้ม/บัตรกำนัล) — ปุ่มจริง มี aria-checked ให้เครื่องอ่านหน้าจอ */
function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${on ? "bg-[color:var(--color-fg)]" : "bg-[color:var(--color-surface-2)]"}`}
    >
      <span
        className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-[color:var(--color-bg)] transition-all ${on ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}

export function PosRegister({
  systemId,
  unitId,
  catalog,
  services,
  members,
  couponEnabled,
  hasPromptPay,
}: {
  systemId: string;
  unitId: string;
  catalog: PosCatalogItem[];
  /** บริการของหน้างานนี้ (ตัดผม/นวด ฯลฯ) — ไม่ตัดสต็อก */
  services: PosServiceItem[];
  members: PosMember[];
  couponEnabled: boolean;
  hasPromptPay: boolean;
}) {
  const [cart, setCart] = useState<CartRow[]>([]);
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [billDiscount, setBillDiscount] = useState(""); // บาท
  const [memberId, setMemberId] = useState("");
  const [couponCode, setCouponCode] = useState("");

  // ── สิทธิ์สมาชิก (M2.8) ──
  const [rights, setRights] = useState<PosMemberRights | null>(null);
  const [live, setLive] = useState<OkQuote | null>(null);
  const [voucherId, setVoucherId] = useState("");
  const [usePoints, setUsePoints] = useState(false);
  const [pointsInput, setPointsInput] = useState("");
  const [gcNumber, setGcNumber] = useState("");
  const [gcPin, setGcPin] = useState("");
  const [gcAmount, setGcAmount] = useState(""); // บาท

  const [phase, setPhase] = useState<"cart" | "pay" | "done">("cart");
  const [payMethod, setPayMethod] = useState<PayMethod>("CASH");
  const [quote, setQuote] = useState<OkQuote | null>(null);
  const [cashReceived, setCashReceived] = useState(""); // บาท
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Extract<RegisterSaleState, { status: "ok" }> | null>(null);

  const idemRef = useRef<string>(newKey());

  const subtotal = useMemo(() => cart.reduce((s, r) => s + r.unitPriceSatang * r.qty, 0), [cart]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((c) => c.name.toLowerCase().includes(q) || c.sku.toLowerCase().includes(q) || (c.barcode ?? "").toLowerCase().includes(q));
  }, [catalog, search]);
  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [services, search]);

  // ── ตะกร้า ──
  function addCatalog(item: PosCatalogItem) {
    setCart((prev) => {
      const found = prev.find((r) => r.key === item.id);
      if (found) return prev.map((r) => (r.key === item.id ? { ...r, qty: r.qty + 1 } : r));
      return [...prev, { key: item.id, name: item.name, qty: 1, unitPriceSatang: item.priceSatang, itemId: item.id }];
    });
  }
  // บริการ = ไม่ผูก InvItem จึงไม่ตัดสต็อก · key ใช้ srv- กัน id ชนกับสินค้า
  function addService(sv: PosServiceItem) {
    const key = `srv-${sv.id}`;
    setCart((prev) => {
      const found = prev.find((r) => r.key === key);
      if (found) return prev.map((r) => (r.key === key ? { ...r, qty: r.qty + 1 } : r));
      return [...prev, { key, name: sv.name, qty: 1, unitPriceSatang: sv.priceSatang, serviceId: sv.id }];
    });
  }
  function addCustom() {
    const name = customName.trim();
    const price = bahtToSatang(customPrice);
    if (!name) return setError("ใส่ชื่อรายการก่อน");
    if (price < 0) return setError("ราคาติดลบไม่ได้");
    setCart((prev) => [...prev, { key: newKey(), name, qty: 1, unitPriceSatang: price }]);
    setCustomName("");
    setCustomPrice("");
    setError("");
  }
  const setQty = (key: string, delta: number) =>
    setCart((prev) => prev.flatMap((r) => (r.key === key ? (r.qty + delta <= 0 ? [] : [{ ...r, qty: r.qty + delta }]) : [r])));
  const removeRow = (key: string) => setCart((prev) => prev.filter((r) => r.key !== key));

  // ── สิทธิ์ที่ติ๊กไว้ → payload เดียวที่ทั้ง quote และการขายจริงใช้ร่วมกัน ──
  const points = usePoints ? Math.max(0, Math.floor(Number(pointsInput.replace(/,/g, "")) || 0)) : 0;
  const gcSatang = bahtToSatang(gcAmount);
  const memberChoices: PosMemberChoicesInput | undefined = memberId
    ? {
        voucherIds: voucherId ? [voucherId] : [],
        points,
        giftCard: gcNumber.trim() && gcSatang > 0 ? { number: gcNumber.trim(), pin: gcPin.trim(), satang: gcSatang } : undefined,
      }
    : undefined;

  const choiceKey = JSON.stringify(memberChoices ?? null);

  const inputPayload = useCallback(
    () => ({
      systemId,
      unitId,
      lines: cart.map((r) => ({ name: r.name, qty: r.qty, unitPriceSatang: r.unitPriceSatang, itemId: r.itemId, serviceId: r.serviceId })),
      billDiscountSatang: bahtToSatang(billDiscount),
      memberId: memberId || undefined,
      memberChoices,
      couponCode: couponCode.trim() || undefined,
    }),
    // choiceKey แทน memberChoices (object ใหม่ทุกเรนเดอร์ = ยิง quote ไม่หยุด)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [systemId, unitId, cart, billDiscount, memberId, choiceKey, couponCode],
  );

  // ── โหลดกระเป๋าสิทธิ์เมื่อเลือกสมาชิก (ครั้งเดียวต่อคน ไม่ใช่ทุกครั้งที่ตะกร้าเปลี่ยน) ──
  useEffect(() => {
    let alive = true;
    setVoucherId("");
    setUsePoints(false);
    setPointsInput("");
    setGcNumber("");
    setGcPin("");
    setGcAmount("");
    setLive(null);
    if (!memberId) {
      setRights(null);
      return;
    }
    posMemberRightsAction({ systemId, unitId, memberId })
      .then((r) => {
        if (alive) setRights(r);
      })
      .catch(() => {
        if (alive) setRights(null);
      });
    return () => {
      alive = false;
    };
  }, [memberId, systemId, unitId]);

  // ── ใบเสนอราคาสด: ตะกร้า/สิทธิ์เปลี่ยน → ถามเซิร์ฟเวอร์ใหม่ (หน่วงสั้น ๆ กันยิงถี่) ──
  useEffect(() => {
    if (!memberId || cart.length === 0 || phase !== "cart") return;
    let alive = true;
    const t = setTimeout(() => {
      posQuoteAction(inputPayload())
        .then((q) => {
          if (!alive) return;
          if (q.ok) setLive(q);
        })
        .catch(() => {
          /* ใบเสนอราคาโหลดไม่ได้ = แสดงค่าที่มีอยู่เดิม (ยอดจริงตัดสินที่ตอนกดชำระ) */
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [memberId, cart.length, phase, inputPayload]);

  // ── ไปหน้าชำระเงิน: คิดยอดสุทธิ + payload QR ที่ฝั่ง server ก่อน ──
  async function goPay() {
    if (cart.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const q = await posQuoteAction(inputPayload());
      if (!q.ok) {
        setError(q.message);
        return;
      }
      setQuote(q);
      setLive(q);
      setCashReceived("");
      setPayMethod("CASH");
      setPhase("pay");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSale() {
    if (!quote) return;
    setBusy(true);
    setError("");
    try {
      const res = await registerSaleAction({
        ...inputPayload(),
        payType: payMethod,
        cashReceivedSatang: payMethod === "CASH" ? bahtToSatang(cashReceived) : undefined,
        idempotencyKey: idemRef.current,
      });
      if (res.status === "error") {
        setError(res.message);
        return;
      }
      if (res.status === "ok") {
        setResult(res);
        setPhase("done");
      }
    } finally {
      setBusy(false);
    }
  }

  function resetSale() {
    setCart([]);
    setBillDiscount("");
    setMemberId("");
    setCouponCode("");
    setCashReceived("");
    setQuote(null);
    setLive(null);
    setResult(null);
    setError("");
    setPhase("cart");
    idemRef.current = newKey();
  }

  const changeSatang = quote ? bahtToSatang(cashReceived) - quote.grandTotalSatang : 0;

  // ═══════════ หน้าสรุปหลังขายสำเร็จ ═══════════
  if (phase === "done" && result) {
    return (
      <div className="card flex flex-col items-center gap-3 py-8 text-center">
        <span className="text-[color:var(--color-accent)]">
          <MemberIcon name="check" size="lg" />
        </span>
        <div className="text-lg font-semibold">ขายสำเร็จ</div>
        <div className="text-sm text-[color:var(--color-muted)]">ใบเสร็จเลขที่ {result.receiptNo ?? "—"}</div>
        <div className="text-2xl font-bold tabular-nums">{formatBaht(result.grandTotalSatang, { decimals: true })}</div>
        {result.changeSatang > 0 && (
          <div className="text-sm">
            เงินทอน <span className="font-semibold">{formatBaht(result.changeSatang, { decimals: true })}</span>
          </div>
        )}
        <button onClick={resetSale} className="btn btn-primary mt-2 min-h-[44px] w-full max-w-xs text-base">
          ขายบิลใหม่
        </button>
      </div>
    );
  }

  // ═══════════ หน้าชำระเงิน ═══════════
  if (phase === "pay" && quote) {
    return (
      <div className="flex flex-col gap-4">
        <button onClick={() => { setPhase("cart"); setError(""); }} className="self-start text-sm text-[color:var(--color-muted)]">
          กลับไปแก้ตะกร้า
        </button>

        <div className="card flex flex-col gap-1">
          <div className="flex justify-between text-sm text-[color:var(--color-muted)]">
            <span>ยอดรวม</span>
            <span className="tabular-nums">{formatBaht(quote.subtotalSatang, { decimals: true })}</span>
          </div>
          {quote.billDiscountSatang > 0 && (
            <div className="flex justify-between text-sm text-[color:var(--color-muted)]">
              <span>ส่วนลดท้ายบิล</span>
              <span className="tabular-nums">−{formatBaht(quote.billDiscountSatang, { decimals: true })}</span>
            </div>
          )}
          {quote.couponDiscountSatang > 0 && (
            <div className="flex justify-between text-sm text-[color:var(--color-muted)]">
              <span>ส่วนลดคูปอง</span>
              <span className="tabular-nums">−{formatBaht(quote.couponDiscountSatang, { decimals: true })}</span>
            </div>
          )}
          {quote.memberDiscountSatang > 0 && (
            <div className="flex justify-between text-sm text-[color:var(--color-muted)]">
              <span>ส่วนลดที่ใช้สิทธิ์</span>
              <span className="tabular-nums">−{formatBaht(quote.memberDiscountSatang, { decimals: true })}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
            <span>ยอดสุทธิ</span>
            <span className="tabular-nums">{formatBaht(quote.grandTotalSatang, { decimals: true })}</span>
          </div>
        </div>

        {/* เลือกวิธีชำระ */}
        <div className="flex gap-2">
          <button
            onClick={() => setPayMethod("CASH")}
            className={`min-h-[44px] flex-1 rounded-xl border text-sm font-medium ${payMethod === "CASH" ? "border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)]" : ""}`}
          >
            เงินสด
          </button>
          {hasPromptPay && (
            <button
              onClick={() => setPayMethod("PROMPTPAY")}
              className={`min-h-[44px] flex-1 rounded-xl border text-sm font-medium ${payMethod === "PROMPTPAY" ? "border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)]" : ""}`}
            >
              พร้อมเพย์
            </button>
          )}
        </div>

        {payMethod === "CASH" ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              รับเงินมา (บาท)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                placeholder="เช่น 100"
                className="input text-lg"
              />
            </label>
            {cashReceived.trim() !== "" && (
              <div className={`text-sm ${changeSatang < 0 ? "text-[color:var(--color-danger)]" : ""}`}>
                {changeSatang < 0 ? `ยังขาดอีก ${formatBaht(-changeSatang, { decimals: true })}` : `เงินทอน ${formatBaht(changeSatang, { decimals: true })}`}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {quote.promptpayPayload ? (
              <PromptPayQr payload={quote.promptpayPayload} caption={formatBaht(quote.grandTotalSatang, { decimals: true })} />
            ) : (
              <p className="text-sm text-[color:var(--color-danger)]">สร้าง QR ไม่สำเร็จ — ตรวจ PromptPay ID ของร้าน</p>
            )}
            <p className="text-xs text-[color:var(--color-muted)]">ให้ลูกค้าสแกนจ่าย แล้วกดยืนยันเมื่อเงินเข้าแล้ว</p>
          </div>
        )}

        {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}

        <button
          onClick={confirmSale}
          disabled={busy || (payMethod === "PROMPTPAY" && !quote.promptpayPayload)}
          className="btn btn-primary min-h-[52px] text-base disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก…" : payMethod === "CASH" ? "ยืนยันขาย" : "ยืนยันรับเงินแล้ว"}
        </button>
      </div>
    );
  }

  // ═══════════ หน้าตะกร้า (ขาย) ═══════════
  const panelOpen = !!rights;
  const memberQuote = live?.member ?? null;
  const lineOf = (kind: string) => memberQuote?.lines.find((l) => l.kind === kind) ?? null;
  const conflictOf = (kind: string, ref?: string) =>
    memberQuote?.conflicts.find((c) => c.kind === kind && (ref === undefined || c.ref === ref)) ?? null;
  const memberDiscount = live?.memberDiscountSatang ?? 0;
  const payable = live ? live.grandTotalSatang : Math.max(0, subtotal - bahtToSatang(billDiscount));
  const pointValue = rights ? points * Math.max(1, rights.burnRateSatang) : 0;

  const payButton = (
    <button
      data-testid="pos-pay-button"
      onClick={goPay}
      disabled={busy || cart.length === 0}
      className="btn btn-primary min-h-[52px] text-base disabled:opacity-50"
    >
      {busy
        ? "กำลังคิดยอด…"
        : panelOpen
          ? `ใช้สิทธิ์และรับชำระ ${formatBaht(payable, { decimals: true })}`
          : "ชำระเงิน"}
    </button>
  );

  const panel = rights ? (
    <aside data-testid="pos-member-panel" className="flex w-full flex-col gap-2.5 lg:w-[22rem] lg:shrink-0">
      {/* หัวแผง — ใครกำลังใช้สิทธิ์ */}
      <div className="card flex items-start gap-2 p-3">
        <span className="mt-0.5 text-[color:var(--color-muted)]">
          <MemberIcon name="person" size="sm" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">สิทธิ์ของ {rights.name}</div>
          <div className="truncate text-xs text-[color:var(--color-muted)]">
            {rights.memberCode || "ไม่มีรหัสสมาชิก"} · {rights.memberSinceLabel}
          </div>
        </div>
        {rights.tierName ? <Chip>{rights.tierName}</Chip> : null}
      </div>

      {/* 1. ระดับสมาชิก — ไม่ต้องติ๊ก */}
      <PanelCard testid="pos-panel-tier" icon="crown">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">
              ส่วนลดระดับ {rights.tierName ?? "สมาชิก"}
              {rights.tierDiscountPct > 0 ? ` ${rights.tierDiscountPct}%` : ""}
            </div>
            <div className="text-xs text-[color:var(--color-muted)]">ใช้อัตโนมัติทุกบิล</div>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {lineOf("TIER") ? `−${formatBaht(lineOf("TIER")!.discountSatang)}` : "—"}
          </span>
        </div>
      </PanelCard>

      {/* 2. voucher — บิลเดียวใช้ได้ 1 ใบ (กติกาอยู่ที่เซิร์ฟเวอร์) */}
      <PanelCard testid="pos-panel-vouchers" icon="tag">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-sm font-medium">Voucher</span>
          <span className="text-xs text-[color:var(--color-muted)]">เลือกได้ 1 ใบ</span>
        </div>
        {rights.vouchers.length === 0 ? (
          <p className="text-xs text-[color:var(--color-muted)]">สมาชิกคนนี้ยังไม่มี voucher ที่ใช้ได้</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rights.vouchers.map((v) => {
              const picked = voucherId === v.id;
              const blocked = conflictOf("VOUCHER", v.id);
              const usable = v.applicable && !blocked;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVoucherId(picked ? "" : v.id)}
                  className={`flex items-start justify-between gap-2 rounded-xl border p-2 text-left ${picked ? "border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)]" : ""} ${usable ? "" : "opacity-60"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{v.name}</span>
                    <span className="block truncate text-[11px] text-[color:var(--color-muted)]">
                      {blocked ? blocked.message : (v.reason ?? v.expiresLabel)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums">{v.valueLabel}</span>
                    <span className="block text-[11px] text-[color:var(--color-muted)]">{picked ? "เลือกแล้ว" : "แตะเพื่อใช้"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </PanelCard>

      {/* 3. แต้ม */}
      <PanelCard testid="pos-panel-points" icon="star">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">ใช้แต้มแลกส่วนลด</div>
            <div className="text-xs text-[color:var(--color-muted)]">
              มี {num(rights.pointBalance)} แต้ม
              {usePoints && points > 0 ? ` · ใช้ ${num(points)} แต้ม = ${formatBaht(pointValue)}` : ""}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-semibold tabular-nums">
              {lineOf("POINTS") ? `−${formatBaht(lineOf("POINTS")!.discountSatang)}` : "—"}
            </span>
            <Toggle
              label="ใช้แต้มแลกส่วนลด"
              on={usePoints}
              onClick={() => {
                const next = !usePoints;
                setUsePoints(next);
                if (next && !pointsInput) {
                  const capSatang =
                    rights.burnMaxPct > 0 && rights.burnMaxPct < 100
                      ? Math.floor((payable * rights.burnMaxPct) / 100)
                      : payable;
                  const max = Math.floor(capSatang / Math.max(1, rights.burnRateSatang));
                  setPointsInput(String(Math.max(0, Math.min(rights.pointBalance, max))));
                }
              }}
            />
          </div>
        </div>
        {usePoints && (
          <div className="mt-2 flex items-center gap-2">
            <input
              value={pointsInput}
              onChange={(e) => setPointsInput(e.target.value)}
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="จำนวนแต้ม"
              className="input w-28 text-sm"
            />
            <span className="text-[11px] text-[color:var(--color-muted)]">
              ขั้นต่ำ {num(rights.burnMinPoints)} แต้ม
            </span>
          </div>
        )}
        {conflictOf("POINTS") && <p className="mt-1 text-[11px] text-[color:var(--color-danger)]">{conflictOf("POINTS")!.message}</p>}
      </PanelCard>

      {/* 4. บัตรกำนัล — ต้องกรอกเลขเต็ม + PIN (ของมีมูลค่า ห้ามตัดจากเลขปิดบัง) */}
      <PanelCard testid="pos-panel-giftcard" icon="gift">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-medium">Gift Card</div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {lineOf("GIFTCARD") ? `−${formatBaht(lineOf("GIFTCARD")!.discountSatang)}` : "—"}
          </span>
        </div>
        {rights.giftCards.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5">
            {rights.giftCards.map((g) => (
              <li key={g.numberMasked} className="text-[11px] text-[color:var(--color-muted)]">
                {g.numberMasked} · คงเหลือ {formatBaht(g.balanceSatang)}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <input value={gcNumber} onChange={(e) => setGcNumber(e.target.value)} placeholder="หมายเลขบัตร" className="input min-w-0 flex-1 text-sm" />
          <input value={gcPin} onChange={(e) => setGcPin(e.target.value)} placeholder="PIN" className="input w-20 text-sm" />
          <input value={gcAmount} onChange={(e) => setGcAmount(e.target.value)} type="number" inputMode="decimal" min={0} placeholder="ยอดที่ใช้" className="input w-24 text-sm" />
        </div>
        {conflictOf("GIFTCARD") && <p className="mt-1 text-[11px] text-[color:var(--color-danger)]">{conflictOf("GIFTCARD")!.message}</p>}
      </PanelCard>

      {/* 5. สแตมป์ที่บิลนี้จะได้ */}
      <PanelCard testid="pos-panel-stamps" icon="stamp">
        {rights.stamps.length === 0 ? (
          <p className="text-xs text-[color:var(--color-muted)]">ร้านนี้ยังไม่มีใบสะสมสแตมป์</p>
        ) : (
          rights.stamps.map((s) => {
            const add = memberQuote?.stampsToAdd.find((x) => x.cardId === s.cardId)?.count ?? 0;
            const after = Math.min(s.slots, s.stamps + add);
            return (
              <div key={s.cardId} className="mb-1.5 last:mb-0">
                <div className="truncate text-sm font-medium">สแตมป์ “{s.name}”</div>
                <div className="text-xs text-[color:var(--color-muted)]">
                  {add > 0 ? `บิลนี้ได้ +${add} ดวง → ครบ ${after}/${s.slots}` : `บิลนี้ได้ +0 ดวง · ตอนนี้ ${s.stamps}/${s.slots}`}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {Array.from({ length: s.slots }).map((_, i) => (
                    <span
                      key={i}
                      className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] tabular-nums ${
                        i < s.stamps
                          ? "bg-[color:var(--color-fg)] text-[color:var(--color-bg)]"
                          : i < after
                            ? "border-dashed"
                            : "text-[color:var(--color-muted)]"
                      }`}
                    >
                      {i < s.stamps ? "" : i < after ? "+" : i + 1}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </PanelCard>

      {/* ลำดับการใช้สิทธิ์ + หมายเหตุกันซ้อน + แต้มที่จะได้ */}
      <div className="flex flex-col gap-1.5 px-1">
        <div data-testid="pos-panel-order" className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-[color:var(--color-muted)]">ลำดับที่ใช้:</span>
          <Chip>ระดับ</Chip>
          <Chip>voucher</Chip>
          <Chip>แต้ม</Chip>
          <Chip>gift card</Chip>
        </div>
        <p data-testid="pos-panel-earn" className="text-[11px] leading-relaxed text-[color:var(--color-muted)]">
          ห้ามใช้ voucher 2 ใบซ้อน (ตั้งค่าไว้) · แต้มที่จะได้รับบิลนี้{" "}
          <span className="font-semibold text-[color:var(--color-fg)]">+{num(memberQuote?.pointsToEarn ?? 0)}</span>
        </p>
        {memberQuote?.conflicts
          .filter((c) => c.kind === "COUPON")
          .map((c) => (
            <p key={c.message} className="text-[11px] text-[color:var(--color-danger)]">
              {c.message}
            </p>
          ))}
      </div>

      {payButton}
    </aside>
  ) : null;

  return (
    <div data-testid="pos-register" className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
      <div className={`flex min-w-0 flex-1 flex-col gap-4 ${panelOpen ? "" : "mx-auto w-full max-w-2xl"}`}>
        {/* เลือกสมาชิกอยู่บนสุด — สิทธิ์ต้องขึ้นก่อนเริ่มหยิบของ ไม่ใช่ตอนจะจ่ายเงินแล้ว */}
        {members.length > 0 && (
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            สมาชิก (สะสมแต้ม / ใช้สิทธิ์)
            <select data-testid="pos-member-select" value={memberId} onChange={(e) => setMemberId(e.target.value)} className="input">
              <option value="">ไม่ระบุ</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? "ไม่ระบุชื่อ"} · {m.memberCode}
                  {m.phone ? ` · ${m.phone}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Catalog */}
        <div className="flex flex-col gap-2">
          {(catalog.length > 0 || services.length > 0) && (
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาบริการ / สินค้า / บาร์โค้ด" className="input" />
          )}

          {/* บริการ — ร้านตัดผม/นวด/คลินิก รายได้หลักอยู่ตรงนี้ จึงวางไว้ก่อนสินค้า */}
          {services.length > 0 && (
            <>
              <div className="text-xs text-[color:var(--color-muted)]">บริการ</div>
              {filteredServices.length === 0 ? (
                <p className="p-2 text-center text-xs text-[color:var(--color-muted)]">ไม่พบบริการที่ค้นหา</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {filteredServices.map((sv) => (
                    <button
                      key={sv.id}
                      data-testid="pos-catalog-item"
                      onClick={() => addService(sv)}
                      className="flex min-h-[56px] flex-col items-start justify-center rounded-xl border border-[color:var(--color-accent)] p-2 text-left hover:bg-[color:var(--color-surface-2)]"
                    >
                      <span className="line-clamp-2 text-sm font-medium">{sv.name}</span>
                      <span className="text-xs tabular-nums text-[color:var(--color-muted)]">
                        {formatBaht(sv.priceSatang)}
                        {sv.bookable && sv.durationMin > 0 ? ` · ${sv.durationMin} นาที` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {catalog.length > 0 && <div className="mt-1 text-xs text-[color:var(--color-muted)]">สินค้า</div>}
            </>
          )}

          {catalog.length === 0 && services.length === 0 ? (
            <p className="rounded-xl border border-dashed p-3 text-center text-xs text-[color:var(--color-muted)]">
              ยังไม่มีบริการหรือสินค้าให้ขาย — ตั้งรายการที่แท็บ “บริการ/สินค้า” หรือพิมพ์รายการเองด้านล่าง
            </p>
          ) : catalog.length === 0 ? null : filtered.length === 0 ? (
            <p className="p-2 text-center text-xs text-[color:var(--color-muted)]">ไม่พบสินค้าที่ค้นหา</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  data-testid="pos-catalog-item"
                  onClick={() => addCatalog(c)}
                  className="flex min-h-[56px] flex-col items-start justify-center rounded-xl border p-2 text-left hover:bg-[color:var(--color-surface-2)]"
                >
                  <span className="line-clamp-2 text-sm font-medium">{c.name}</span>
                  <span className="text-xs text-[color:var(--color-muted)] tabular-nums">{formatBaht(c.priceSatang)}</span>
                </button>
              ))}
            </div>
          )}
          {/* เพิ่มรายการเอง */}
          <div className="flex gap-2">
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="ชื่อรายการเอง" className="input flex-1" />
            <input value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} type="number" inputMode="decimal" min={0} placeholder="ราคา" className="input w-24" />
            <button onClick={addCustom} className="btn btn-ghost text-sm">+ เพิ่ม</button>
          </div>
        </div>

        {/* รายการในบิล */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">รายการในบิล ({cart.length})</h2>
          {cart.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-[color:var(--color-muted)]">
              แตะบริการ/สินค้าด้านบน หรือพิมพ์รายการเองเพื่อเริ่มบิล
            </p>
          ) : (
            <div className="flex flex-col divide-y rounded-xl border">
              {cart.map((r) => (
                <div key={r.key} className="flex items-center gap-2 p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.name}</div>
                    <div className="text-xs text-[color:var(--color-muted)] tabular-nums">
                      {formatBaht(r.unitPriceSatang)} × {r.qty} = {formatBaht(r.unitPriceSatang * r.qty)}
                    </div>
                  </div>
                  <button onClick={() => setQty(r.key, -1)} className="flex h-9 w-9 items-center justify-center rounded-lg border text-lg">−</button>
                  <span className="w-6 text-center tabular-nums">{r.qty}</span>
                  <button onClick={() => setQty(r.key, 1)} className="flex h-9 w-9 items-center justify-center rounded-lg border text-lg">+</button>
                  <button onClick={() => removeRow(r.key)} className="px-1 text-xs text-[color:var(--color-danger)]">ลบ</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <>
            {/* ตัวเลือกเสริม */}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                ส่วนลดท้ายบิล (บาท)
                <input value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} type="number" inputMode="decimal" min={0} placeholder="0" className="input" />
              </label>
              {couponEnabled && (
                <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                  โค้ดคูปอง (ถ้ามี)
                  <input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="เช่น SAVE50" className="input uppercase" />
                </label>
              )}
            </div>

            <div className="flex flex-col gap-1 border-t pt-2">
              <div className="flex items-center justify-between text-sm text-[color:var(--color-muted)]">
                <span>ยอดรวมสินค้า</span>
                <span className="tabular-nums">{formatBaht(subtotal, { decimals: true })}</span>
              </div>
              {memberDiscount > 0 && (
                <div className="flex items-center justify-between text-sm text-[color:var(--color-muted)]">
                  <span>ส่วนลดที่ใช้สิทธิ์ (ดูแผงขวา)</span>
                  <span className="tabular-nums">−{formatBaht(memberDiscount, { decimals: true })}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1 text-base font-semibold">
                <span>ยอดที่ต้องชำระ</span>
                <span className="text-lg tabular-nums">{formatBaht(payable, { decimals: true })}</span>
              </div>
            </div>

            {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}

            {!panelOpen && payButton}
          </>
        )}
        {cart.length === 0 && error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
      </div>

      {panel}
    </div>
  );
}

export default PosRegister;
