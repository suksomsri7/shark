"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { makeT, type Locale } from "@/lib/i18n";

type Product = { id: string; name: string; description: string | null; priceSatang: number; imageUrl: string | null };

// ฿ คงเดิมทั้งสองภาษา · ตัวเลขจัดกลุ่มตาม locale (en ใช้ en-GB)
const baht = (satang: number, locale: Locale) =>
  (satang / 100).toLocaleString(locale === "en" ? "en-GB" : "th-TH", { minimumFractionDigits: 0 });

// หน้าร้านสาธารณะ: เลือกสินค้า → ตะกร้า → กรอกชื่อ/เบอร์ → สร้างออเดอร์ → ไปหน้าสถานะ+QR
export function ShopStorefront({
  tenantSlug,
  unitSlug,
  products,
  locale = "th",
}: {
  tenantSlug: string;
  unitSlug: string;
  products: Product[];
  locale?: Locale;
}) {
  const router = useRouter();
  const t = useMemo(() => makeT(locale), [locale]);
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
    if (count === 0) return setError(t("shop.err.empty"));
    if (!name.trim()) return setError(t("shop.err.name"));
    if (!phone.trim()) return setError(t("shop.err.phone"));
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
        setError(data?.message || (res.status === 429 ? t("shop.err.rate") : t("shop.err.create")));
        setSubmitting(false);
        return;
      }
      router.push(`/s/${tenantSlug}/${unitSlug}/shop/order/${data.code}`);
    } catch {
      setError(t("shop.err.network"));
      setSubmitting(false);
    }
  }

  if (products.length === 0) {
    return <p className="text-sm text-[color:var(--color-muted)]">{t("shop.empty")}</p>;
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
                <div className="text-sm font-semibold">฿{baht(p.priceSatang, locale)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQty(p.id, qty - 1)}
                  className="h-8 w-8 rounded-full border text-lg leading-none disabled:opacity-40"
                  disabled={qty === 0}
                  aria-label={t("shop.qty.less")}
                >
                  −
                </button>
                <span className="w-6 text-center text-sm">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty(p.id, qty + 1)}
                  className="h-8 w-8 rounded-full border text-lg leading-none"
                  aria-label={t("shop.qty.more")}
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
            <span className="text-sm text-[color:var(--color-muted)]">{t("shop.cart.count", { count })}</span>
            <span className="text-lg font-semibold">฿{baht(total, locale)}</span>
          </div>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder={t("shop.form.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder={t("shop.form.phone")}
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <textarea
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder={t("shop.form.note")}
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
            {submitting ? t("shop.submitting") : t("shop.submit", { total: baht(total, locale) })}
          </button>
        </div>
      )}
    </div>
  );
}

export default ShopStorefront;
