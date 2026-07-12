"use client";

import { useActionState } from "react";
import { createOrderAction } from "@/lib/modules/ticket/actions";
import type { CreateOrderResult } from "@/lib/modules/ticket/service";

type TypeOption = { id: string; name: string; priceSatang: number; remaining: number };

const baht = (s: number) => (s / 100).toLocaleString("th-TH");

export default function SellForm({
  unitSlug,
  eventId,
  types,
}: {
  unitSlug: string;
  eventId: string;
  types: TypeOption[];
}) {
  const [state, formAction, pending] = useActionState<CreateOrderResult | null, FormData>(
    async (_prev, formData) => createOrderAction(unitSlug, formData),
    null,
  );

  const sellable = types.filter((t) => t.remaining > 0);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="eventId" value={eventId} />

      {sellable.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">
          ตั๋วเต็มทุกประเภท หรือยังไม่ได้เพิ่มประเภทตั๋ว
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sellable.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <div className="text-sm">
                <span className="font-medium">{t.name}</span>
                <span className="text-[color:var(--color-muted)]">
                  {" "}
                  · ฿{baht(t.priceSatang)} · เหลือ {t.remaining}
                </span>
              </div>
              <input
                name={`qty:${t.id}`}
                type="number"
                min={0}
                max={t.remaining}
                defaultValue={0}
                className="w-16 rounded-lg border px-2 py-1.5 text-sm"
                aria-label={`จำนวน ${t.name}`}
              />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input name="buyerName" required placeholder="ชื่อผู้ซื้อ" className="rounded-lg border px-3 py-2 text-sm" />
        <input name="buyerPhone" placeholder="เบอร์ (ไม่บังคับ)" className="rounded-lg border px-3 py-2 text-sm" />
      </div>

      {state && !state.ok && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.reason}</p>
      )}
      {state && state.ok && (
        <p className="text-sm font-medium text-[color:var(--color-ink)]">
          ออก {state.admissionCount} ใบ · {state.orderNo} · รวม ฿{baht(state.totalSatang)}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          name="markPaid"
          value="1"
          disabled={pending || sellable.length === 0}
          className="btn btn-primary text-sm disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก…" : "ขาย + รับเงินแล้ว"}
        </button>
        <button
          type="submit"
          name="markPaid"
          value="0"
          disabled={pending || sellable.length === 0}
          className="btn btn-ghost text-sm disabled:opacity-50"
        >
          จองไว้ (ยังไม่จ่าย)
        </button>
      </div>
    </form>
  );
}
