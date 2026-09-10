// PointAdjustForm.tsx — ฟอร์ม "ปรับแต้มมือ" (M2.2 · พิมพ์เขียว §5.5 §6.2 §11.4)
//
// 🔴 ถ้า `adjustApprovalOver` ตั้งไว้ และจำนวนที่กรอก (ค่าสัมบูรณ์) เกินเพดาน → เตือนล่วงหน้าว่าต้องรออนุมัติ
//    (points-adjust-approval-hint) ก่อนกดบันทึก ไม่ใช่รู้หลังโดนปฏิเสธ
"use client";

import { useMemo, useState, useTransition } from "react";
import { adjustPointsAction } from "@/lib/modules/point/points-actions";

type CustomerOpt = { id: string; name: string | null; memberCode: string; phone: string | null };

const muted = "text-[color:var(--color-muted)]";

export function PointAdjustForm({
  systemId,
  customers,
  adjustApprovalOver,
}: {
  systemId: string;
  customers: CustomerOpt[];
  adjustApprovalOver: number | null;
}) {
  const [customerId, setCustomerId] = useState("");
  const [mode, setMode] = useState<"grant" | "deduct">("grant");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const amountNum = Number(amount);
  const overCap = adjustApprovalOver !== null && Number.isFinite(amountNum) && amountNum > adjustApprovalOver;

  const submit = () => {
    setResult(null);
    if (!customerId) {
      setResult({ ok: false, message: "เลือกสมาชิกก่อน" });
      return;
    }
    if (!Number.isInteger(amountNum) || amountNum <= 0) {
      setResult({ ok: false, message: "จำนวนแต้มต้องเป็นจำนวนเต็มมากกว่า 0" });
      return;
    }
    if (!reason.trim()) {
      setResult({ ok: false, message: "กรุณาระบุเหตุผล" });
      return;
    }
    const delta = mode === "grant" ? amountNum : -amountNum;
    startTransition(async () => {
      const res = await adjustPointsAction({
        systemId,
        customerId,
        delta,
        reason: reason.trim(),
        expiresAt: mode === "grant" && expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      if (!res.ok) {
        setResult({ ok: false, message: res.reason });
        return;
      }
      if ("pending" in res.data && res.data.pending) {
        setResult({ ok: true, message: "ส่งคำขอแล้ว — เกินเพดาน รออนุมัติจากผู้มีสิทธิ์" });
      } else if ("applied" in res.data && res.data.applied) {
        setResult({ ok: true, message: `ปรับแต้มแล้ว — คงเหลือ ${res.data.balance.toLocaleString("th-TH")} แต้ม` });
      }
      setAmount("");
      setReason("");
    });
  };

  const options = useMemo(() => customers, [customers]);

  return (
    <div data-testid="points-adjust-form" className="card flex flex-col gap-3 p-4">
      <label className={`flex flex-col gap-1 text-xs ${muted}`}>
        สมาชิก
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="input min-h-[44px]">
          <option value="">เลือกสมาชิก</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name ?? "ไม่ระบุชื่อ"} · {c.memberCode}
              {c.phone ? ` · ${c.phone}` : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
          ทำรายการ
          <select value={mode} onChange={(e) => setMode(e.target.value as "grant" | "deduct")} className="input min-h-[44px]">
            <option value="grant">แจกแต้ม (+)</option>
            <option value="deduct">หักแต้ม (−)</option>
          </select>
        </label>
        <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
          จำนวนแต้ม
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
            placeholder="เช่น 200"
            className="input min-h-[44px]"
          />
        </label>
      </div>

      {mode === "grant" && (
        <label className={`flex flex-col gap-1 text-xs ${muted}`}>
          วันหมดอายุ (ไม่บังคับ — ว่าง = ตามการตั้งค่าแต้ม)
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="input min-h-[44px]" />
        </label>
      )}

      <label className={`flex flex-col gap-1 text-xs ${muted}`}>
        เหตุผล
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ชดเชยลูกค้า" className="input min-h-[44px]" />
      </label>

      {overCap && (
        <p data-testid="points-adjust-approval-hint" className="text-xs" style={{ color: "var(--color-warn, var(--color-muted))" }}>
          จำนวนนี้เกินเพดาน {adjustApprovalOver} แต้มต่อครั้ง — รายการนี้จะถูกส่งเข้าสายอนุมัติก่อนมีผลจริง
        </p>
      )}

      {result && (
        <p className="text-xs" style={{ color: result.ok ? "var(--color-ink)" : "var(--color-danger)" }}>
          {result.message}
        </p>
      )}

      <button onClick={submit} disabled={pending} className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50">
        {pending ? "กำลังบันทึก…" : "บันทึกการปรับแต้ม"}
      </button>
    </div>
  );
}

export default PointAdjustForm;
