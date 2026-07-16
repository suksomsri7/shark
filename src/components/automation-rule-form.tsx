"use client";

import { useActionState, useState } from "react";
import { createRuleAction, type CreateRuleState } from "@/lib/automation/actions";
import { AUTOMATION_EVENTS } from "@/lib/automation/labels";
import { FormField } from "@/components/ui/FormField";

const initial: CreateRuleState = { status: "idle" };
const inputCls =
  "rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]";

// ฟอร์มสร้างกติกาอัตโนมัติ: เมื่อ [เหตุการณ์] และ [ยอดถึงเกณฑ์] → [แจ้งเตือน/เว็บฮุค]
// action type สลับช่องกรอก (NOTIFY=หัวข้อ · WEBHOOK=URL) ฝั่ง client เพื่อไม่รก
export function AutomationRuleForm() {
  const [state, action, pending] = useActionState(createRuleAction, initial);
  const [actionType, setActionType] = useState<"NOTIFY" | "WEBHOOK">("NOTIFY");

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormField label="ชื่อกติกา" required hint="ตั้งชื่อให้จำง่าย เช่น แจ้งเตือนบิลใหญ่">
        <input name="name" placeholder="เช่น แจ้งเตือนบิลใหญ่" className={inputCls} />
      </FormField>

      <FormField label="เมื่อเกิดเหตุการณ์" required>
        <select name="event" className={inputCls} defaultValue={AUTOMATION_EVENTS[0].value}>
          {AUTOMATION_EVENTS.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label="และยอดขั้นต่ำ (บาท)"
        hint="เว้นว่าง = ทำงานทุกยอด · ใช้ได้กับเหตุการณ์ที่มียอดขาย"
      >
        <input name="minBaht" inputMode="decimal" placeholder="เช่น 1000" className={inputCls} />
      </FormField>

      <FormField label="ให้ทำสิ่งนี้" required>
        <select
          name="actionType"
          value={actionType}
          onChange={(e) => setActionType(e.target.value === "WEBHOOK" ? "WEBHOOK" : "NOTIFY")}
          className={inputCls}
        >
          <option value="NOTIFY">แจ้งเตือนในแอป</option>
          <option value="WEBHOOK">ส่งเว็บฮุค (เชื่อมระบบอื่น)</option>
        </select>
      </FormField>

      {actionType === "NOTIFY" ? (
        <FormField label="หัวข้อแจ้งเตือน" hint="เว้นว่าง = ใช้ชื่อกติกาเป็นหัวข้อ">
          <input name="title" placeholder="เช่น มีบิลใหญ่เข้ามา" className={inputCls} />
        </FormField>
      ) : (
        <FormField
          label="ที่อยู่ปลายทาง (URL)"
          required
          hint="ระบบจะส่งข้อมูลแบบ POST ไปที่นี่ทุกครั้งที่เข้าเงื่อนไข"
        >
          <input
            name="url"
            inputMode="url"
            placeholder="https://example.com/hook"
            className={inputCls}
          />
        </FormField>
      )}

      {state.status === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && (
        <p className="text-sm font-medium">✅ สร้างกติกาเรียบร้อย</p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary disabled:opacity-50">
        {pending ? "กำลังบันทึก…" : "สร้างกติกา"}
      </button>
    </form>
  );
}

export default AutomationRuleForm;
