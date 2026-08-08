"use client";

import { useState, useTransition } from "react";
import { loadMoreTxnsAction } from "@/lib/ai/credit-actions";
import { formatUsd } from "@/lib/ai/pricing";

export type TxnView = {
  id: string;
  kind: string;
  source: string;
  amountMicro: number;
  balanceAfter: number;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  note: string | null;
  createdAt: string;
};

function thaiDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// ชื่อโมเดลแบบภาษาคน — เจ้าของร้านไม่ต้องรู้จัก id ของผู้ให้บริการ
function modelLabel(model: string | null): string {
  const m = (model ?? "").toLowerCase();
  if (m.includes("haiku")) return "ประหยัด";
  if (m.includes("sonnet")) return "ฉลาด";
  if (m.includes("opus")) return "ฉลาดพิเศษ";
  return model ? "อื่น ๆ" : "";
}

// ประวัติการเดินบัญชีเครดิต — ล่าสุดก่อน + ปุ่มดูเพิ่ม (cursor)
export function CreditHistory({
  initialRows,
  initialCursor,
  sourceLabels,
}: {
  initialRows: TxnView[];
  initialCursor: string | null;
  sourceLabels: Record<string, string>;
}) {
  const [rows, setRows] = useState<TxnView[]>(initialRows);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [pending, startTransition] = useTransition();

  function more() {
    if (!cursor) return;
    startTransition(async () => {
      const res = await loadMoreTxnsAction(cursor);
      setRows((prev) => [...prev, ...(res.rows as TxnView[])]);
      setCursor(res.nextCursor);
    });
  }

  return (
    <section className="card flex flex-col gap-3">
      <h2 className="text-sm font-semibold">ประวัติเครดิต</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีรายการ</p>
      ) : (
        <div className="flex flex-col divide-y">
          {rows.map((r) => {
            const isIn = r.amountMicro > 0;
            return (
              <div key={r.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm">
                    {sourceLabels[r.source] ?? r.source}
                    {modelLabel(r.model) && (
                      <span className="ml-1.5 rounded-full border px-1.5 py-0.5 text-[10px] text-[color:var(--color-muted)]">
                        {modelLabel(r.model)}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-[color:var(--color-muted)]">
                    {thaiDateTime(r.createdAt)}
                    {r.tokensIn + r.tokensOut > 0 &&
                      ` · ${(r.tokensIn + r.tokensOut).toLocaleString("th-TH")} token`}
                    {r.note ? ` · ${r.note}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      isIn ? "text-[color:var(--color-accent)]" : ""
                    }`}
                  >
                    {isIn ? "+" : "−"}
                    {formatUsd(Math.abs(r.amountMicro))}
                  </span>
                  <span className="text-[11px] tabular-nums text-[color:var(--color-muted)]">
                    เหลือ {formatUsd(r.balanceAfter)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {cursor && (
        <button
          type="button"
          onClick={more}
          disabled={pending}
          className="mx-auto rounded-lg border px-4 py-2 text-sm hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
        >
          {pending ? "กำลังโหลด…" : "ดูรายการเพิ่ม"}
        </button>
      )}
    </section>
  );
}

export default CreditHistory;
