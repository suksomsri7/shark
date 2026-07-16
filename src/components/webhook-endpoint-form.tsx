"use client";

import { useActionState } from "react";
import {
  createEndpointAction,
  type CreateEndpointState,
} from "@/lib/webhooks/actions";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/labels";
import { FormField } from "@/components/ui/FormField";

const initial: CreateEndpointState = { status: "idle" };
const inputCls =
  "rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]";

// ฟอร์มเพิ่มปลายทาง webhook: URL + เลือกเหตุการณ์ (ไม่เลือก = ทุกเหตุการณ์)
// สร้างเสร็จโชว์ secret ครั้งเดียว — ผู้ใช้ต้องคัดลอกเก็บทันที
export function WebhookEndpointForm() {
  const [state, action, pending] = useActionState(createEndpointAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormField
        label="ที่อยู่ปลายทาง (URL)"
        required
        hint="ระบบจะส่งข้อมูลแบบ POST พร้อมลายเซ็นไปที่นี่ทุกครั้งที่เกิดเหตุการณ์"
      >
        <input
          name="url"
          inputMode="url"
          placeholder="https://example.com/hook"
          className={inputCls}
        />
      </FormField>

      <FormField
        label="เหตุการณ์ที่จะส่ง"
        hint="ไม่เลือกเลย = ส่งทุกเหตุการณ์ · เลือกได้หลายอย่าง"
      >
        <div className="flex flex-col gap-2 rounded-lg border px-3 py-2">
          {WEBHOOK_EVENTS.map((e) => (
            <label key={e.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="events" value={e.value} />
              {e.label}
            </label>
          ))}
        </div>
      </FormField>

      {state.status === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && (
        <div className="flex flex-col gap-1 rounded-lg border border-[color:var(--color-ink)] bg-[color:var(--color-surface)] px-3 py-2 text-sm">
          <p className="font-medium">✅ เพิ่มปลายทางเรียบร้อย</p>
          <p className="text-xs text-[color:var(--color-muted)]">
            คัดลอกรหัสลับด้านล่างเก็บไว้ทันที — จะแสดงเพียงครั้งเดียว ใช้ตรวจลายเซ็น
            (X-Shark-Signature)
          </p>
          <code className="mt-1 break-all rounded border px-2 py-1 font-mono text-xs">
            {state.secret}
          </code>
        </div>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary disabled:opacity-50">
        {pending ? "กำลังบันทึก…" : "เพิ่มปลายทาง"}
      </button>
    </form>
  );
}

export default WebhookEndpointForm;
