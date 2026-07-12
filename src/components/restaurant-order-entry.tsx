"use client";

import { useMemo, useState } from "react";
import { createStaffOrderAction } from "@/lib/actions/restaurant";
import type { CartLine } from "@/lib/modules/restaurant/order";
import { formatBaht } from "@/lib/ui/money";

export type MenuChoice = { id: string; name: string; priceDelta: number; isOutOfStock: boolean };
export type MenuGroup = { groupId: string; name: string; minSelect: number; maxSelect: number; choices: MenuChoice[] };
export type MenuItemLite = { id: string; name: string; basePrice: number; isOutOfStock: boolean; groups: MenuGroup[] };
export type MenuCat = { id: string; name: string; items: MenuItemLite[] };
export type SessionLite = { sessionId: string; tableName: string };

type CartEntry = { line: CartLine; label: string; unitSatang: number };

export function RestaurantOrderEntry({
  unitSlug,
  menu,
  sessions,
  initialSessionId,
}: {
  unitSlug: string;
  menu: MenuCat[];
  sessions: SessionLite[];
  initialSessionId?: string;
}) {
  const [type, setType] = useState<"DINE_IN" | "TAKEAWAY">(initialSessionId ? "DINE_IN" : sessions.length > 0 ? "DINE_IN" : "TAKEAWAY");
  const [sessionId, setSessionId] = useState<string>(initialSessionId ?? sessions[0]?.sessionId ?? "");
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [picking, setPicking] = useState<MenuItemLite | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const total = useMemo(() => cart.reduce((s, c) => s + c.unitSatang * c.line.qty, 0), [cart]);

  function addSimple(it: MenuItemLite) {
    if (it.groups.length > 0) {
      setPicking(it);
      return;
    }
    setCart((c) => [...c, { line: { menuItemId: it.id, qty: 1, choiceIds: [] }, label: it.name, unitSatang: it.basePrice }]);
  }

  async function submit() {
    if (cart.length === 0) return;
    if (type === "DINE_IN" && !sessionId) {
      setMsg("เลือกโต๊ะก่อน");
      return;
    }
    setSubmitting(true);
    setMsg(null);
    const res = await createStaffOrderAction(unitSlug, {
      type,
      sessionId: type === "DINE_IN" ? sessionId : undefined,
      cart: cart.map((c) => c.line),
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(res.dailyNo);
      setCart([]);
    } else {
      setMsg(res.err.reason);
    }
  }

  if (done !== null) {
    return (
      <div className="card flex flex-col items-center gap-3 text-center">
        <div className="text-lg font-semibold">ส่งครัวแล้ว · ออเดอร์ #{String(done).padStart(4, "0")}</div>
        <button className="btn btn-primary text-sm" onClick={() => setDone(null)}>
          คีย์ออเดอร์ต่อ
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ประเภท + โต๊ะ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border text-sm">
          {(["DINE_IN", "TAKEAWAY"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-3 py-2 ${type === t ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : ""}`}
            >
              {t === "DINE_IN" ? "ทานที่ร้าน" : "กลับบ้าน"}
            </button>
          ))}
        </div>
        {type === "DINE_IN" && (
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="rounded-lg border px-2 py-2 text-sm">
            {sessions.length === 0 && <option value="">ยังไม่มีโต๊ะที่เปิด</option>}
            {sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                โต๊ะ {s.tableName}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* เมนู */}
      <div className="flex flex-col gap-4">
        {menu.map((cat) => (
          <div key={cat.id}>
            <div className="mb-1 text-xs text-[color:var(--color-muted)]">{cat.name}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {cat.items.map((it) => (
                <button
                  key={it.id}
                  disabled={it.isOutOfStock}
                  onClick={() => addSimple(it)}
                  className={`rounded-xl border p-2 text-left text-sm ${it.isOutOfStock ? "opacity-40" : "hover:bg-[color:var(--color-surface-2)]"}`}
                >
                  <div className="font-medium">{it.name}</div>
                  <div className="text-xs text-[color:var(--color-muted)]">
                    {formatBaht(it.basePrice)}
                    {it.isOutOfStock ? " · หมด" : ""}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ตัวเลือก modal */}
      {picking && (
        <OptionPicker
          item={picking}
          onCancel={() => setPicking(null)}
          onConfirm={(entry) => {
            setCart((c) => [...c, entry]);
            setPicking(null);
          }}
        />
      )}

      {/* ตะกร้า */}
      {cart.length > 0 && (
        <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-[color:var(--color-surface)] pt-3">
          {cart.map((c, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span>
                {c.line.qty}× {c.label}
              </span>
              <div className="flex items-center gap-2">
                <span>{formatBaht(c.unitSatang * c.line.qty)}</span>
                <button className="text-xs text-[color:var(--color-danger)] underline" onClick={() => setCart((x) => x.filter((_, j) => j !== i))}>
                  ลบ
                </button>
              </div>
            </div>
          ))}
          {msg && <div className="text-xs text-[color:var(--color-danger)]">{msg}</div>}
          <button disabled={submitting} onClick={submit} className="btn btn-primary text-sm">
            {submitting ? "กำลังส่ง…" : `ส่งครัว · ${formatBaht(total)}`}
          </button>
        </div>
      )}
    </div>
  );
}

function OptionPicker({
  item,
  onCancel,
  onConfirm,
}: {
  item: MenuItemLite;
  onCancel: () => void;
  onConfirm: (e: CartEntry) => void;
}) {
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const toggle = (g: MenuGroup, choiceId: string) => {
    setSel((prev) => {
      const cur = prev[g.groupId] ?? [];
      if (g.maxSelect === 1) return { ...prev, [g.groupId]: [choiceId] };
      return cur.includes(choiceId)
        ? { ...prev, [g.groupId]: cur.filter((x) => x !== choiceId) }
        : { ...prev, [g.groupId]: [...cur, choiceId] };
    });
  };
  const chosenIds = Object.values(sel).flat();
  const delta = item.groups.reduce((s, g) => {
    return s + g.choices.filter((c) => (sel[g.groupId] ?? []).includes(c.id)).reduce((x, c) => x + c.priceDelta, 0);
  }, 0);
  const valid = item.groups.every((g) => {
    const n = (sel[g.groupId] ?? []).length;
    return n >= g.minSelect && n <= g.maxSelect;
  });
  const labelParts = item.groups.flatMap((g) => g.choices.filter((c) => (sel[g.groupId] ?? []).includes(c.id)).map((c) => c.name));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-t-2xl bg-[color:var(--color-surface)] p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 font-semibold">{item.name}</div>
        <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
          {item.groups.map((g) => (
            <div key={g.groupId}>
              <div className="mb-1 text-xs text-[color:var(--color-muted)]">
                {g.name} {g.minSelect > 0 ? "(บังคับ)" : ""} · เลือก {g.minSelect}-{g.maxSelect}
              </div>
              <div className="flex flex-col gap-1">
                {g.choices.map((c) => {
                  const on = (sel[g.groupId] ?? []).includes(c.id);
                  return (
                    <button
                      key={c.id}
                      disabled={c.isOutOfStock}
                      onClick={() => toggle(g, c.id)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${on ? "border-2 border-[color:var(--color-ink)]" : ""} ${c.isOutOfStock ? "opacity-40" : ""}`}
                    >
                      <span>{c.name}</span>
                      <span className="text-xs text-[color:var(--color-muted)]">{c.priceDelta ? `+${formatBaht(c.priceDelta)}` : ""}</span>
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
                line: { menuItemId: item.id, qty: 1, choiceIds: chosenIds },
                label: labelParts.length ? `${item.name} (${labelParts.join(", ")})` : item.name,
                unitSatang: item.basePrice + delta,
              })
            }
          >
            เพิ่ม {formatBaht(item.basePrice + delta)}
          </button>
        </div>
      </div>
    </div>
  );
}
