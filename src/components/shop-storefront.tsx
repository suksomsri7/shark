"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Product = { id: string; name: string; description: string | null; priceSatang: number; imageUrl: string | null };

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 0 });

// หน้าร้านสาธารณะ: เลือกสินค้า → ตะกร้า → กรอกชื่อ/เบอร์ → สร้างออเดอร์ → ไปหน้าสถานะ+QR
export function ShopStorefront({
  tenantSlug,
  unitSlug,
  products,
}: {
  tenantSlug: string;
  unitSlug: string;
  products: Product[];
}) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setQty = (id: string, qty: number) =>
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });

  const lines = useMemo(
    () => Object.entries(cart).map(([id, qty]) => ({ product: products.find((p) => p.id === id)!, qty })).filter((l) => l.product),
    [cart, products],
  );
  const total = lines.reduce((s, l) => s + l.product.priceSatang * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  async function submit() {
    setError(null);
    if (count === 0) return setError("กรุณาเลือกสินค้าอย่างน้อย 1 ชิ้น");
    if (!name.trim()) return setError("กรุณากรอกชื่อผู้สั่ง");
    if (!phone.trim()) return setError("กรุณากรอกเบอร์โทร");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/store/${tenantSlug}/${unitSlug}/shop/order`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          note: note.trim() || undefined,
          lines: lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.message || (res.status === 429 ? "สั่งบ่อยเกินไป กรุณารอสักครู่" : "สร้างออเดอร์ไม่สำเร็จ กรุณาลองใหม่"));
        setSubmitting(false);
        return;
      }
      router.push(`/s/${tenantSlug}/${unitSlug}/shop/order/${data.code}`);
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
      setSubmitting(false);
    }
  }

  if (products.length === 0) {
    return <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีสินค้าวางขายในขณะนี้</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* รายการสินค้า */}
      <div className="flex flex-col gap-3">
        {products.map((p) => {
          const qty = cart[p.id] ?? 0;
          return (
            <div key={p.id} className="card flex items-center gap-3">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt={p.name} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[color:var(--color-surface-2)] text-2xl">🛍️</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                {p.description && <div className="truncate text-xs text-[color:var(--color-muted)]">{p.description}</div>}
                <div className="text-sm font-semibold">฿{baht(p.priceSatang)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQty(p.id, qty - 1)}
                  className="h-8 w-8 rounded-full border text-lg leading-none disabled:opacity-40"
                  disabled={qty === 0}
                  aria-label="ลด"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty(p.id, qty + 1)}
                  className="h-8 w-8 rounded-full border text-lg leading-none"
                  aria-label="เพิ่ม"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ตะกร้า + checkout */}
      {count > 0 && (
        <div className="card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[color:var(--color-muted)]">รวม {count} ชิ้น</span>
            <span className="text-lg font-semibold">฿{baht(total)}</span>
          </div>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="ชื่อผู้สั่ง"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="เบอร์โทร"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <textarea
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="หมายเหตุ (ถ้ามี)"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="btn btn-primary w-full disabled:opacity-60"
          >
            {submitting ? "กำลังสั่ง…" : `สั่งซื้อ · ฿${baht(total)}`}
          </button>
        </div>
      )}
    </div>
  );
}

export default ShopStorefront;
