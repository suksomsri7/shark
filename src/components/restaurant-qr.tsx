"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderingMenuCat, OrderingMenuItem, OrderingMenuGroup } from "@/lib/modules/restaurant/menu";

const baht = (s: number) => (s / 100).toLocaleString("th-TH");

type CartEntry = { menuItemId: string; qty: number; choiceIds: string[]; label: string; unitSatang: number };

const KDS_LABEL: Record<string, string> = {
  NEW: "รอครัว",
  COOKING: "กำลังทำ",
  READY: "เสร็จแล้ว 🔔",
  SERVED: "เสิร์ฟแล้ว",
};

type SessionStatus = {
  tableName: string;
  totalSatang: number;
  serviceChargeSatang: number;
  hasBillRequest: boolean;
  hasCallRequest: boolean;
  orders: { dailyNo: number; items: { name: string; qty: number; options: string[]; kdsStatus: string; lineTotalSatang: number }[] }[];
};

export function RestaurantQr({
  tenantSlug,
  unitSlug,
  qrToken,
  tableName,
  menu,
  kitchen,
}: {
  tenantSlug: string;
  unitSlug: string;
  qrToken: string;
  tableName: string;
  menu: OrderingMenuCat[];
  kitchen: { open: boolean; reason?: string };
}) {
  const apiBase = `/api/store/${tenantSlug}/${unitSlug}/restaurant`;
  const [tab, setTab] = useState<"menu" | "orders">("menu");
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [picking, setPicking] = useState<OrderingMenuItem | null>(null);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const guestToken = useRef<string>("");

  useEffect(() => {
    const key = `rest_guest_${qrToken}`;
    let t = localStorage.getItem(key);
    if (!t) {
      t = crypto.randomUUID();
      localStorage.setItem(key, t);
    }
    guestToken.current = t;
  }, [qrToken]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/session?qrToken=${encodeURIComponent(qrToken)}`, { cache: "no-store" });
      if (r.ok) setStatus(await r.json());
    } catch {
      /* offline */
    }
  }, [apiBase, qrToken]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  function addItem(it: OrderingMenuItem) {
    if (it.isOutOfStock) return;
    if (it.groups.length > 0) return setPicking(it);
    setCart((c) => [...c, { menuItemId: it.id, qty: 1, choiceIds: [], label: it.name, unitSatang: it.basePrice }]);
  }

  const total = cart.reduce((s, c) => s + c.unitSatang * c.qty, 0);

  async function submit() {
    if (cart.length === 0) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const r = await fetch(`${apiBase}/order`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          qrToken,
          guestToken: guestToken.current,
          items: cart.map((c) => ({ menuItemId: c.menuItemId, qty: c.qty, choiceIds: c.choiceIds })),
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setCart([]);
        setTab("orders");
        setMsg(`สั่งแล้ว! ออเดอร์ #${String(data.dailyNo).padStart(4, "0")}`);
        refresh();
      } else {
        setMsg(data.reason || "สั่งไม่สำเร็จ");
      }
    } catch {
      setMsg("เชื่อมต่อไม่ได้ ลองใหม่");
    }
    setSubmitting(false);
  }

  async function serviceRequest(type: "CALL_STAFF" | "REQUEST_BILL") {
    setMsg(null);
    try {
      const r = await fetch(`${apiBase}/service-request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qrToken, type }),
      });
      if (r.ok) {
        setMsg(type === "CALL_STAFF" ? "เรียกพนักงานแล้ว กำลังไปหาค่ะ" : "แจ้งขอเช็คบิลแล้ว");
        refresh();
      }
    } catch {
      setMsg("เชื่อมต่อไม่ได้");
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-28">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-[color:var(--color-muted)]">โต๊ะ</div>
          <div className="text-xl font-semibold">{tableName}</div>
        </div>
        <div className="flex overflow-hidden rounded-lg border text-sm">
          {(["menu", "orders"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 ${tab === t ? "bg-black text-white" : ""}`}>
              {t === "menu" ? "เมนู" : "ออเดอร์โต๊ะนี้"}
            </button>
          ))}
        </div>
      </div>

      {!kitchen.open && (
        <div className="rounded-lg border border-[color:var(--color-danger)] p-2 text-sm text-[color:var(--color-danger)]">
          {kitchen.reason || "ครัวปิดอยู่"} — ดูเมนูได้แต่ยังสั่งไม่ได้
        </div>
      )}
      {msg && <div className="rounded-lg bg-[color:var(--color-surface-2)] p-2 text-sm">{msg}</div>}

      {tab === "menu" ? (
        <div className="flex flex-col gap-4">
          {menu.map((cat) => (
            <div key={cat.id}>
              <div className="mb-1 text-sm font-medium">{cat.name}</div>
              <div className="flex flex-col gap-1">
                {cat.items.map((it) => (
                  <button
                    key={it.id}
                    disabled={it.isOutOfStock || !kitchen.open}
                    onClick={() => addItem(it)}
                    className={`flex items-center justify-between rounded-xl border p-3 text-left ${it.isOutOfStock ? "opacity-40" : "active:bg-[color:var(--color-surface-2)]"}`}
                  >
                    <span className="text-sm font-medium">
                      {it.name}
                      {it.isOutOfStock && <span className="ml-2 text-xs text-[color:var(--color-danger)]">หมด</span>}
                    </span>
                    <span className="text-sm">฿{baht(it.basePrice)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {!status || status.orders.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีออเดอร์ — เลือกเมนูแล้วสั่งได้เลย</p>
          ) : (
            status.orders.map((o, i) => (
              <div key={i} className="rounded-xl border p-3">
                <div className="mb-1 text-xs text-[color:var(--color-muted)]">ออเดอร์ #{String(o.dailyNo).padStart(4, "0")}</div>
                {o.items.map((it, j) => (
                  <div key={j} className="flex items-center justify-between text-sm">
                    <span>
                      {it.qty}× {it.name}
                      {it.options.length > 0 && <span className="text-xs text-[color:var(--color-muted)]"> ({it.options.join(", ")})</span>}
                    </span>
                    <span className="text-xs text-[color:var(--color-muted)]">{KDS_LABEL[it.kdsStatus] ?? it.kdsStatus}</span>
                  </div>
                ))}
              </div>
            ))
          )}
          {status && status.totalSatang > 0 && (
            <div className="card flex justify-between text-sm font-semibold">
              <span>ยอดโดยประมาณ{status.serviceChargeSatang > 0 ? " (รวม service charge)" : ""}</span>
              <span>฿{baht(status.totalSatang)}</span>
            </div>
          )}
        </div>
      )}

      {picking && (
        <QrOptionPicker
          item={picking}
          onCancel={() => setPicking(null)}
          onConfirm={(e) => {
            setCart((c) => [...c, e]);
            setPicking(null);
          }}
        />
      )}

      {/* footer: cart / actions */}
      <div className="fixed inset-x-0 bottom-0 border-t bg-[color:var(--color-surface)] p-3">
        <div className="mx-auto flex w-full max-w-md flex-col gap-2">
          {cart.length > 0 && tab === "menu" ? (
            <>
              <div className="max-h-28 overflow-y-auto">
                {cart.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span>
                      {c.qty}× {c.label}
                    </span>
                    <button className="text-xs text-[color:var(--color-danger)]" onClick={() => setCart((x) => x.filter((_, j) => j !== i))}>
                      ลบ
                    </button>
                  </div>
                ))}
              </div>
              <button disabled={submitting} onClick={submit} className="btn btn-primary text-sm">
                {submitting ? "กำลังสั่ง…" : `สั่งอาหาร · ฿${baht(total)}`}
              </button>
            </>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => serviceRequest("CALL_STAFF")} className="btn btn-ghost flex-1 text-sm">
                🔔 เรียกพนักงาน
              </button>
              <button onClick={() => serviceRequest("REQUEST_BILL")} className="btn btn-ghost flex-1 text-sm">
                🧾 ขอเช็คบิล
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QrOptionPicker({
  item,
  onCancel,
  onConfirm,
}: {
  item: OrderingMenuItem;
  onCancel: () => void;
  onConfirm: (e: CartEntry) => void;
}) {
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const toggle = (g: OrderingMenuGroup, id: string) =>
    setSel((prev) => {
      const cur = prev[g.groupId] ?? [];
      if (g.maxSelect === 1) return { ...prev, [g.groupId]: [id] };
      return cur.includes(id) ? { ...prev, [g.groupId]: cur.filter((x) => x !== id) } : { ...prev, [g.groupId]: [...cur, id] };
    });
  const chosenIds = Object.values(sel).flat();
  const delta = item.groups.reduce(
    (s, g) => s + g.choices.filter((c) => (sel[g.groupId] ?? []).includes(c.id)).reduce((x, c) => x + c.priceDelta, 0),
    0,
  );
  const valid = item.groups.every((g) => {
    const n = (sel[g.groupId] ?? []).length;
    return n >= g.minSelect && n <= g.maxSelect;
  });
  const labelParts = item.groups.flatMap((g) => g.choices.filter((c) => (sel[g.groupId] ?? []).includes(c.id)).map((c) => c.name));

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onCancel}>
      <div className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-[color:var(--color-surface)] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 font-semibold">{item.name}</div>
        <div className="flex flex-col gap-3">
          {item.groups.map((g) => (
            <div key={g.groupId}>
              <div className="mb-1 text-xs text-[color:var(--color-muted)]">
                {g.name} · เลือก {g.minSelect}-{g.maxSelect}
              </div>
              <div className="flex flex-col gap-1">
                {g.choices.map((c) => {
                  const on = (sel[g.groupId] ?? []).includes(c.id);
                  return (
                    <button
                      key={c.id}
                      disabled={c.isOutOfStock}
                      onClick={() => toggle(g, c.id)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${on ? "border-2 border-black" : ""} ${c.isOutOfStock ? "opacity-40" : ""}`}
                    >
                      <span>{c.name}</span>
                      <span className="text-xs text-[color:var(--color-muted)]">{c.priceDelta ? `+฿${baht(c.priceDelta)}` : ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-ghost flex-1 text-sm" onClick={onCancel}>
            ยกเลิก
          </button>
          <button
            disabled={!valid}
            className="btn btn-primary flex-1 text-sm"
            onClick={() =>
              onConfirm({
                menuItemId: item.id,
                qty: 1,
                choiceIds: chosenIds,
                label: labelParts.length ? `${item.name} (${labelParts.join(", ")})` : item.name,
                unitSatang: item.basePrice + delta,
              })
            }
          >
            เพิ่ม ฿{baht(item.basePrice + delta)}
          </button>
        </div>
      </div>
    </div>
  );
}
