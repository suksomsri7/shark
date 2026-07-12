"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceItemAction } from "@/lib/actions/restaurant";
import type { KdsItemStatus } from "@prisma/client";

export type KdsItemLite = {
  id: string;
  name: string;
  qty: number;
  options: string[];
  note: string | null;
  kdsStatus: KdsItemStatus;
  isRush: boolean;
  tableName: string | null;
  dailyNo: number;
  waitMins: number;
};

const COLUMNS: { status: KdsItemStatus; label: string; next?: KdsItemStatus; nextLabel?: string }[] = [
  { status: "NEW", label: "รอทำ", next: "COOKING", nextLabel: "รับ / เริ่มทำ" },
  { status: "COOKING", label: "กำลังทำ", next: "READY", nextLabel: "เสร็จ" },
  { status: "READY", label: "เสร็จ รอเสิร์ฟ", next: "SERVED", nextLabel: "เสิร์ฟแล้ว" },
];

export function RestaurantKdsBoard({
  unitSlug,
  items,
  warnMins,
  criticalMins,
}: {
  unitSlug: string;
  items: KdsItemLite[];
  warnMins: number;
  criticalMins: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  // polling ทุก 6 วินาที (P1 realtime = polling; SSE เป็น P2)
  useEffect(() => {
    const t = setInterval(() => startTransition(() => router.refresh()), 6000);
    return () => clearInterval(t);
  }, [router]);

  async function advance(id: string, to: KdsItemStatus) {
    setBusy(id);
    await advanceItemAction(unitSlug, id, to);
    setBusy(null);
    startTransition(() => router.refresh());
  }

  const byStatus = (s: KdsItemStatus) => items.filter((i) => i.kdsStatus === s);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {COLUMNS.map((col) => {
        const list = byStatus(col.status);
        return (
          <div key={col.status} className="flex flex-col gap-2">
            <div className="text-sm font-medium">
              {col.label} ({list.length})
            </div>
            {list.length === 0 && <div className="text-xs text-[color:var(--color-muted)]">—</div>}
            {list.map((it) => {
              const border =
                it.waitMins >= criticalMins
                  ? "border-2 border-[color:var(--color-danger)]"
                  : it.waitMins >= warnMins
                    ? "border-2 border-[color:var(--color-ink)]"
                    : "border";
              return (
                <div key={it.id} className={`rounded-xl ${border} p-3 ${it.isRush ? "bg-[color:var(--color-surface-2)]" : ""}`}>
                  <div className="flex items-center justify-between text-xs text-[color:var(--color-muted)]">
                    <span>
                      {it.tableName ? `โต๊ะ ${it.tableName}` : `#${String(it.dailyNo).padStart(4, "0")}`}
                    </span>
                    <span>{it.waitMins} นาที{it.isRush ? " · เร่ง!" : ""}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {it.qty}× {it.name}
                  </div>
                  {it.options.length > 0 && <div className="text-xs text-[color:var(--color-muted)]">{it.options.join(", ")}</div>}
                  {it.note && <div className="text-xs text-[color:var(--color-danger)]">หมายเหตุ: {it.note}</div>}
                  {col.next && (
                    <button
                      disabled={busy === it.id}
                      onClick={() => advance(it.id, col.next!)}
                      className="btn-sm mt-2 w-full disabled:opacity-50"
                    >
                      {busy === it.id ? "กำลังบันทึก…" : col.nextLabel}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
