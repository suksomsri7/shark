"use client";

import { useActionState, useState } from "react";
import { updatePolicyAction, type CreatePolicyState } from "@/lib/modules/approval/actions";
import { APPROVER_ROLES, entityLabel } from "@/lib/modules/approval/labels";
import { FormField } from "@/components/ui/FormField";

const initial: CreatePolicyState = { status: "idle" };
const inputCls =
  "rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]";

// ข้อมูล policy ที่ส่งเข้า (serializable — ไม่มี Date/enum object)
export type EditablePolicy = {
  id: string;
  name: string;
  entityType: string;
  thresholdSatang: number | null;
  steps: { order: number; approverRole: string }[];
};

// ฟอร์มแก้สายอนุมัติ (prefill จากค่าเดิม) — ชื่อ/วงเงิน/ขั้นอนุมัติ 1-2 ขั้น
// ชนิดเอกสารแก้ไม่ได้ (แสดงอย่างเดียว) · steps ถูกแทนที่ทั้งชุดเมื่อบันทึก
export function ApprovalPolicyEditForm({ policy }: { policy: EditablePolicy }) {
  const [state, action, pending] = useActionState(updatePolicyAction, initial);
  const sorted = [...policy.steps].sort((a, b) => a.order - b.order);
  const [twoStep, setTwoStep] = useState(sorted.length >= 2);
  const defMinBaht = policy.thresholdSatang != null ? String(policy.thresholdSatang / 100) : "";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="policyId" value={policy.id} />

      <FormField label="ชื่อสายอนุมัติ" required>
        <input name="name" defaultValue={policy.name} className={inputCls} />
      </FormField>

      <FormField label="ชนิดเอกสาร" hint="ชนิดเอกสารแก้ไขไม่ได้ ถ้าต้องเปลี่ยนให้สร้างสายใหม่">
        <div className="rounded-lg border bg-[color:var(--color-line)]/20 px-3 py-2 text-sm text-[color:var(--color-muted)]">
          {entityLabel(policy.entityType)}
        </div>
      </FormField>

      <FormField
        label="วงเงินขั้นต่ำที่ต้องอนุมัติ (บาท)"
        hint="เว้นว่าง = ทุกจำนวนต้องอนุมัติ · ใส่ตัวเลข = อนุมัติเฉพาะยอดตั้งแต่นี้ขึ้นไป"
      >
        <input
          name="minBaht"
          inputMode="decimal"
          defaultValue={defMinBaht}
          placeholder="เช่น 5000"
          className={inputCls}
        />
      </FormField>

      <FormField label="ผู้อนุมัติขั้นที่ 1" required>
        <select
          name="role1"
          className={inputCls}
          defaultValue={sorted[0]?.approverRole ?? APPROVER_ROLES[0].value}
        >
          {APPROVER_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </FormField>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={twoStep} onChange={(e) => setTwoStep(e.target.checked)} />
        มีขั้นอนุมัติที่ 2
      </label>

      {twoStep && (
        <FormField label="ผู้อนุมัติขั้นที่ 2" hint="อนุมัติต่อจากขั้นที่ 1">
          <select
            name="role2"
            className={inputCls}
            defaultValue={sorted[1]?.approverRole ?? APPROVER_ROLES[1].value}
          >
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
      {state.status === "ok" && <p className="text-sm font-medium">✅ บันทึกการแก้ไขเรียบร้อย</p>}

      <button type="submit" disabled={pending} className="btn btn-primary disabled:opacity-50">
        {pending ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
      </button>
    </form>
  );
}

export default ApprovalPolicyEditForm;
