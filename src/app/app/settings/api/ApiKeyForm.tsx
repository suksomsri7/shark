"use client";

import { useActionState, useState } from "react";
import { createKeyAction, type CreateKeyState } from "./actions";
import { FormField } from "@/components/ui/FormField";

const initial: CreateKeyState = { status: "idle" };
const inputCls =
  "rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]";

// ฟอร์มสร้าง API key — เมื่อสำเร็จจะโชว์ rawKey **ครั้งเดียว** พร้อมคำเตือนให้คัดลอกเก็บทันที
export function ApiKeyForm() {
  const [state, action, pending] = useActionState(createKeyAction, initial);
  const [copied, setCopied] = useState(false);

  if (state.status === "ok") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">✅ สร้างคีย์ “{state.name}” เรียบร้อย</p>
        <div className="rounded-lg border border-[color:var(--color-danger)] bg-[color:var(--color-danger)]/5 p-3">
          <p className="mb-2 text-xs font-medium text-[color:var(--color-danger)]">
            ⚠️ คัดลอกคีย์นี้เก็บไว้ทันที — ระบบจะแสดงให้เห็นเพียงครั้งเดียว ปิดหน้านี้แล้วจะดูอีกไม่ได้
          </p>
          <code className="block break-all rounded bg-[color:var(--color-surface)] px-2 py-1 text-xs">
            {state.rawKey}
          </code>
          <button
            type="button"
            className="btn btn-ghost mt-2 text-sm"
            onClick={() => {
              void navigator.clipboard?.writeText(state.rawKey);
              setCopied(true);
            }}
          >
            {copied ? "คัดลอกแล้ว ✓" : "คัดลอกคีย์"}
          </button>
        </div>
        <a href="/app/settings/api" className="btn btn-primary text-sm">
          เสร็จแล้ว
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormField label="ชื่อคีย์" required hint="ตั้งชื่อให้จำง่ายว่าคีย์นี้ใช้กับระบบไหน เช่น ระบบบัญชี">
        <input name="name" placeholder="เช่น ระบบบัญชี" className={inputCls} />
      </FormField>

      {state.status === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary disabled:opacity-50">
        {pending ? "กำลังสร้าง…" : "สร้างคีย์ใหม่"}
      </button>
    </form>
  );
}

export default ApiKeyForm;
