"use client";

import { useActionState, useState } from "react";
import { createPolicyAction, type CreatePolicyState } from "@/lib/modules/approval/actions";
import { ENTITY_TYPES, APPROVER_ROLES } from "@/lib/modules/approval/labels";
import { FormField } from "@/components/ui/FormField";

const initial: CreatePolicyState = { status: "idle" };
const inputCls =
  "rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]";

// ฟอร์มสร้างสายอนุมัติ: ชนิดเอกสาร + วงเงินขั้นต่ำ(บาท) + ขั้นอนุมัติ 1-2 ขั้น (role ตามลำดับ)
// ขั้นที่ 2 เปิด/ปิดด้วย checkbox ฝั่ง client — ไม่เปิด = สายขั้นเดียว
export function ApprovalPolicyForm() {
  const [state, action, pending] = useActionState(createPolicyAction, initial);
  const [twoStep, setTwoStep] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormField label="ชื่อสายอนุมัติ" required hint="ตั้งชื่อให้จำง่าย เช่น อนุมัติใบสั่งซื้อเกินห้าพัน">
        <input name="name" placeholder="เช่น อนุมัติใบสั่งซื้อเกินห้าพัน" className={inputCls} />
      </FormField>

      <FormField label="ชนิดเอกสาร" required>
        <select name="entityType" className={inputCls} defaultValue={ENTITY_TYPES[0].value}>
          {ENTITY_TYPES.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label="วงเงินขั้นต่ำที่ต้องอนุมัติ (บาท)"
        hint="เว้นว่าง = ทุกจำนวนต้องอนุมัติ · ใส่ตัวเลข = อนุมัติเฉพาะยอดตั้งแต่นี้ขึ้นไป"
      >
        <input name="minBaht" inputMode="decimal" placeholder="เช่น 5000" className={inputCls} />
      </FormField>

      <FormField label="ผู้อนุมัติขั้นที่ 1" required>
        <select name="role1" className={inputCls} defaultValue={APPROVER_ROLES[0].value}>
          {APPROVER_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </FormField>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={twoStep} onChange={(e) => setTwoStep(e.target.checked)} />
        เพิ่มขั้นอนุมัติที่ 2
      </label>

      {twoStep && (
        <FormField label="ผู้อนุมัติขั้นที่ 2" hint="อนุมัติต่อจากขั้นที่ 1">
          <select name="role2" className={inputCls} defaultValue={APPROVER_ROLES[1].value}>
            {APPROVER_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </FormField>
      )}

      {state.status === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && <p className="text-sm font-medium">✅ สร้างสายอนุมัติเรียบร้อย</p>}

      <button type="submit" disabled={pending} className="btn btn-primary disabled:opacity-50">
        {pending ? "กำลังบันทึก…" : "สร้างสายอนุมัติ"}
      </button>
    </form>
  );
}

export default ApprovalPolicyForm;
