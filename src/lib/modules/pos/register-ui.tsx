"use client";

import { useState, useRef, useMemo } from "react";
import { formatBaht } from "@/lib/ui/money";
import { PromptPayQr } from "@/components/PromptPayQr";
import { posQuoteAction, registerSaleAction, type QuoteState, type RegisterSaleState } from "@/lib/actions/pos";
import type { PosCatalogItem, PosMember } from "@/lib/modules/pos/register";

// itemId = InvItem.id (สินค้าจาก catalog → ตัดสต็อก) · undefined = รายการเพิ่มเอง
type CartRow = { key: string; name: string; qty: number; unitPriceSatang: number; itemId?: string };
type PayMethod = "CASH" | "PROMPTPAY";

// สตางค์จากช่องกรอกบาท (รับ "" → 0) — ปัดเป็นสตางค์เต็ม
function bahtToSatang(v: string): number {
  const n = parseFloat(v.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const newKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`;

export function PosRegister({
  systemId,
  unitId,
  catalog,
  members,
  couponEnabled,
  hasPromptPay,
}: {
  systemId: string;
  unitId: string;
  catalog: PosCatalogItem[];
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

  const [phase, setPhase] = useState<"cart" | "pay" | "done">("cart");
  const [payMethod, setPayMethod] = useState<PayMethod>("CASH");
  const [quote, setQuote] = useState<Extract<QuoteState, { ok: true }> | null>(null);
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

  // ── ตะกร้า ──
  function addCatalog(item: PosCatalogItem) {
    setCart((prev) => {
      const found = prev.find((r) => r.key === item.id);
      if (found) return prev.map((r) => (r.key === item.id ? { ...r, qty: r.qty + 1 } : r));
      return [...prev, { key: item.id, name: item.name, qty: 1, unitPriceSatang: item.priceSatang, itemId: item.id }];
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

  const inputPayload = () => ({
    systemId,
    unitId,
    lines: cart.map((r) => ({ name: r.name, qty: r.qty, unitPriceSatang: r.unitPriceSatang, itemId: r.itemId })),
    billDiscountSatang: bahtToSatang(billDiscount),
    memberId: memberId || undefined,
    couponCode: couponCode.trim() || undefined,
  });

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
        <div className="text-3xl">✅</div>
        <div className="text-lg font-semibold">ขายสำเร็จ</div>
        <div className="text-sm text-[color:var(--color-muted)]">ใบเสร็จเลขที่ {result.receiptNo ?? "—"}</div>
        <div className="text-2xl font-bold tabular-nums">{formatBaht(result.grandTotalSatang, { decimals: true })}</div>
        {result.changeSatang > 0 && (
          <div className="text-sm">
            เงินทอน <span className="font-semibold">{formatBaht(result.changeSatang, { decimals: true })}</span>
          </div>
        )}
        {result.pointEarned > 0 && <div className="text-sm text-[color:var(--color-muted)]">สมาชิกได้รับ {result.pointEarned} แต้ม</div>}
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
          ← กลับไปแก้ตะกร้า
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
  return (
    <div className="flex flex-col gap-4">
      {/* Catalog */}
      <div className="flex flex-col gap-2">
        {catalog.length > 0 && (
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาสินค้า / บาร์โค้ด" className="input" />
        )}
        {catalog.length === 0 ? (
          <p className="rounded-xl border border-dashed p-3 text-center text-xs text-[color:var(--color-muted)]">
            ยังไม่มีสินค้าในคลัง — พิมพ์รายการเองด้านล่าง หรือเพิ่มสินค้าที่ระบบคลัง
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-2 text-center text-xs text-[color:var(--color-muted)]">ไม่พบสินค้าที่ค้นหา</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filtered.map((c) => (
              <button
                key={c.id}
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

      {/* ตะกร้า */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">ตะกร้า ({cart.length})</h2>
        {cart.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-[color:var(--color-muted)]">
            แตะสินค้าด้านบนหรือพิมพ์รายการเองเพื่อเริ่มบิล
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
            {members.length > 0 && (
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                สมาชิก (สะสมแต้ม)
                <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="input">
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
            {couponEnabled && (
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)] sm:col-span-2">
                โค้ดคูปอง (ถ้ามี)
                <input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="เช่น SAVE50" className="input uppercase" />
              </label>
            )}
          </div>

          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-sm text-[color:var(--color-muted)]">ยอดรวม</span>
            <span className="text-lg font-semibold tabular-nums">{formatBaht(subtotal, { decimals: true })}</span>
          </div>

          {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}

          <button onClick={goPay} disabled={busy} className="btn btn-primary min-h-[52px] text-base disabled:opacity-50">
            {busy ? "กำลังคิดยอด…" : "ชำระเงิน"}
          </button>
        </>
      )}
      {cart.length === 0 && error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
    </div>
  );
}

export default PosRegister;
