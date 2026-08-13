"use client";

import { useActionState, useState } from "react";
import { requestAdjustmentAction, type AdjustState } from "./payroll-actions";

// ยื่นรายการเพิ่ม/หักเข้างวดเงินเดือน (OT · คอมมิชชั่น · โบนัส · เบี้ยเลี้ยง · หักเงิน · เบิกล่วงหน้า)
// OT: ใส่ชั่วโมงแล้วระบบคิดเงินให้จากอัตราของคนนั้น (เงินเดือน ÷30 ÷8 ×1.5 หรืออัตราที่ร้านตั้ง)
// ยื่นแล้วสถานะ = รออนุมัติเสมอ (คนยื่น ≠ คนอนุมัติ)
const KINDS: { value: string; label: string; hint: string }[] = [
  { value: "OT", label: "ค่าล่วงเวลา (OT)", hint: "ใส่ชั่วโมง ระบบคิดเงินให้ (1.5 เท่าของค่าจ้างต่อชั่วโมง)" },
  { value: "COMMISSION", label: "คอมมิชชั่น", hint: "ใส่จำนวนเงินที่ตกลงกับพนักงาน" },
  { value: "BONUS", label: "โบนัส", hint: "ใส่จำนวนเงิน" },
  { value: "ALLOWANCE", label: "เบี้ยเลี้ยง/ค่าเดินทาง", hint: "ใส่จำนวนเงิน" },
  { value: "DEDUCTION", label: "หักเงิน (มาสาย/ขาดงาน/ค่าเสียหาย)", hint: "ใส่จำนวนเงินที่หัก" },
  { value: "ADVANCE", label: "หักเบิกล่วงหน้า", hint: "ใส่จำนวนเงินที่หักคืน" },
];

export default function PayAdjustForm({
  systemId,
  employees,
  defaultPeriod,
}: {
  systemId: string;
  employees: { id: string; name: string }[];
  defaultPeriod: string;
}) {
  const [state, formAction, pending] = useActionState<AdjustState, FormData>(
    async (prev, formData) => requestAdjustmentAction(systemId, prev, formData),
    { status: "idle" },
  );
  const [kind, setKind] = useState("OT");
  const muted = "text-[color:var(--color-muted)]";
  const isOt = kind === "OT";

  if (employees.length === 0) {
    return <p className={`text-xs ${muted}`}>เพิ่มพนักงานและตั้งเงินเดือนก่อน</p>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className={`flex flex-col gap-1 text-xs ${muted}`}>
        พนักงาน
        <select name="employeeId" required className="input">
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <label className={`flex flex-col gap-1 text-xs ${muted}`}>
        งวด
        <input name="periodKey" type="month" required defaultValue={defaultPeriod} className="input" />
      </label>
      <label className={`flex flex-col gap-1 text-xs ${muted}`}>
        รายการ
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="input">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      {isOt ? (
        <label className={`flex flex-col gap-1 text-xs ${muted}`}>
          ชั่วโมง OT
          <input name="hours" inputMode="decimal" placeholder="เช่น 6" className="input w-24" />
        </label>
      ) : (
        <label className={`flex flex-col gap-1 text-xs ${muted}`}>
          จำนวนเงิน (บาท)
          <input name="amountBaht" inputMode="decimal" placeholder="เช่น 500" className="input w-28" />
        </label>
      )}
      <label className={`flex flex-1 flex-col gap-1 text-xs ${muted}`}>
        หมายเหตุ
        <input name="note" placeholder="เช่น OT วันเสาร์ / มาสาย 3 ครั้ง" className="input min-w-0" />
      </label>
      <button type="submit" disabled={pending} className="btn btn-ghost min-h-[44px] text-sm disabled:opacity-50">
        {pending ? "กำลังยื่น…" : "+ ยื่นรายการ"}
      </button>
      <p className={`w-full text-xs ${muted}`}>{KINDS.find((k) => k.value === kind)?.hint}</p>
      {state.status === "error" && (
        <p className="w-full text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && <p className={`w-full text-sm ${muted}`}>{state.message}</p>}
    </form>
  );
}
