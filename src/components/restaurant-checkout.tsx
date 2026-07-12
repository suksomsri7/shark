"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkoutAction } from "@/lib/actions/restaurant";

import { formatBaht } from "@/lib/ui/money";

export type BillLineLite = { itemId: string; name: string; qty: number; lineTotalSatang: number };

export function RestaurantCheckout({
  unitSlug,
  sessionId,
  lines,
  serviceChargeBps,
}: {
  unitSlug: string;
  sessionId: string;
  lines: BillLineLite[];
  serviceChargeBps: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(lines.map((l) => l.itemId)));
  const [pay, setPay] = useState<"CASH" | "TRANSFER" | "PROMPTPAY">("CASH");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ receiptNo: string | null; total: number; point: number; closed: boolean } | null>(null);

  const chosen = lines.filter((l) => selected.has(l.itemId));
  const subtotal = chosen.reduce((s, l) => s + l.lineTotalSatang, 0);
  const svc = Math.floor((subtotal * serviceChargeBps) / 10000);
  const total = subtotal + svc;
  const splitting = chosen.length < lines.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function pay_() {
    if (chosen.length === 0) {
      setMsg("เลือกอย่างน้อย 1 รายการ");
      return;
    }
    setSubmitting(true);
    setMsg(null);
    const res = await checkoutAction(unitSlug, {
      sessionId,
      itemIds: splitting ? chosen.map((l) => l.itemId) : undefined,
      payMethod: pay,
    });
    setSubmitting(false);
    if (res.ok) {
      setReceipt({ receiptNo: res.receiptNo, total: res.totalSatang, point: res.pointEarned, closed: res.sessionClosed });
      if (res.sessionClosed) {
        setTimeout(() => router.push(`/app/u/${unitSlug}/restaurant`), 1500);
      } else {
        router.refresh();
      }
    } else {
      setMsg(res.reason);
    }
  }

  if (receipt) {
    return (
      <div className="card flex flex-col items-center gap-2 text-center">
        <div className="text-lg font-semibold">ชำระสำเร็จ {formatBaht(receipt.total)}</div>
        {receipt.receiptNo && <div className="text-sm text-[color:var(--color-muted)]">ใบเสร็จ {receipt.receiptNo}</div>}
        {receipt.point > 0 && <div className="text-sm">ได้แต้ม +{receipt.point}</div>}
        <div className="text-sm text-[color:var(--color-muted)]">
          {receipt.closed ? "ปิดโต๊ะแล้ว กำลังกลับหน้างาน…" : "ยังมีรายการค้าง — ชำระต่อได้"}
        </div>
        {!receipt.closed && (
          <button className="btn btn-primary text-sm" onClick={() => setReceipt(null)}>
            ชำระรายการที่เหลือ
          </button>
        )}
      </div>
    );
  }

  if (lines.length === 0) {
    return <p className="text-sm text-[color:var(--color-muted)]">ไม่มีรายการค้างชำระ</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-[color:var(--color-muted)]">เลือกรายการ (ติ๊กออกเพื่อแยกบิล)</div>
      <div className="flex flex-col gap-1">
        {lines.map((l) => (
          <label key={l.itemId} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={selected.has(l.itemId)} onChange={() => toggle(l.itemId)} />
              {l.qty}× {l.name}
            </span>
            <span>{formatBaht(l.lineTotalSatang)}</span>
          </label>
        ))}
      </div>

      <div className="card flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <span>ยอดรวม</span>
          <span>{formatBaht(subtotal)}</span>
        </div>
        {svc > 0 && (
          <div className="flex justify-between text-[color:var(--color-muted)]">
            <span>ค่าบริการ {serviceChargeBps / 100}%</span>
            <span>{formatBaht(svc)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <span>ต้องชำระ{splitting ? " (แยกบิล)" : ""}</span>
          <span>{formatBaht(total)}</span>
        </div>
      </div>

      <div className="flex overflow-hidden rounded-lg border text-sm">
        {(["CASH", "TRANSFER", "PROMPTPAY"] as const).map((m) => (
          <button key={m} onClick={() => setPay(m)} className={`flex-1 px-3 py-2 ${pay === m ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : ""}`}>
            {m === "CASH" ? "เงินสด" : m === "TRANSFER" ? "โอน" : "พร้อมเพย์"}
          </button>
        ))}
      </div>

      {msg && <div className="text-xs text-[color:var(--color-danger)]">{msg}</div>}
      {confirming ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <div className="font-medium">
            ยืนยันรับชำระ {formatBaht(total)}
            {splitting ? " (แยกบิล)" : ""} ด้วย
            {pay === "CASH" ? "เงินสด" : pay === "TRANSFER" ? "โอน" : "พร้อมเพย์"}?
          </div>
          <div className="flex gap-2">
            <button
              disabled={submitting}
              onClick={pay_}
              className="btn btn-primary flex-1 text-sm disabled:opacity-50"
            >
              {submitting ? "กำลังชำระ…" : "ยืนยันชำระ"}
            </button>
            <button
              disabled={submitting}
              onClick={() => setConfirming(false)}
              className="btn btn-ghost text-sm disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : (
        <button
          disabled={chosen.length === 0}
          onClick={() => {
            setMsg(null);
            setConfirming(true);
          }}
          className="btn btn-primary text-sm disabled:opacity-50"
        >
          {`ชำระ ${formatBaht(total)}`}
        </button>
      )}
    </div>
  );
}
