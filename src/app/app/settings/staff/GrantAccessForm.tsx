"use client";

import { useActionState, useState } from "react";
import { grantStaffAccessAction } from "@/lib/staff/actions";
import { staffFormInitial, type StaffFormState } from "@/lib/staff/form-state";
import type { GrantableEmployee } from "@/lib/staff/service";
import { FormField } from "@/components/ui/FormField";

const inputCls =
  "rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]";

// เลือกพนักงานจากทะเบียนงานบุคคล → ยืนยันอีเมล → กดให้สิทธิ์ได้เลย (มติ W2 · ไม่มีพิธีเชิญ)
// เลือกคนแล้วช่องอีเมลเติมให้อัตโนมัติจากทะเบียน แต่แก้ได้ (ทะเบียนบางแถวยังไม่มีอีเมล)
export function GrantAccessForm({ employees }: { employees: GrantableEmployee[] }) {
  const [state, action, pending] = useActionState<StaffFormState, FormData>(
    grantStaffAccessAction,
    staffFormInitial,
  );
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [touchedEmail, setTouchedEmail] = useState(false);

  if (employees.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-muted)]">
        ยังไม่มีพนักงานในทะเบียนที่พร้อมให้สิทธิ์ — เพิ่มพนักงานในระบบงานบุคคล (HR) ก่อน
        หรือถ้าเพิ่มไว้แล้ว แปลว่าทุกคนถูกผูกกับบัญชีเข้าใช้งานไปหมดแล้ว
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormField label="พนักงาน" required hint="รายชื่อมาจากทะเบียนงานบุคคลของทุกระบบ HR ที่ร้านเปิดใช้">
        <select
          name="employeeId"
          className={inputCls}
          value={employeeId}
          onChange={(e) => {
            const id = e.target.value;
            setEmployeeId(id);
            if (!touchedEmail) setEmail(employees.find((x) => x.id === id)?.email ?? "");
          }}
        >
          <option value="">— เลือกพนักงาน —</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.position ? ` · ${e.position}` : ""} · {e.systemName}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label="อีเมลสำหรับเข้าระบบ"
        required
        hint="ระบบนี้ไม่มีรหัสผ่าน — พนักงานจะกรอกอีเมลนี้ที่หน้าเข้าสู่ระบบ แล้วรับลิงก์/รหัสทางอีเมล"
      >
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="เช่น somchai@example.com"
          className={inputCls}
          value={email}
          onChange={(e) => {
            setTouchedEmail(true);
            setEmail(e.target.value);
          }}
        />
      </FormField>

      <p className="text-xs text-[color:var(--color-muted)]">
        เปิดให้เข้าใช้งานแล้วเขาจะยัง <strong>ไม่เห็นและทำอะไรไม่ได้เลย</strong> จนกว่าคุณจะติ๊กสิทธิ์ให้ในหน้าแก้สิทธิ์
      </p>

      {state.status === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && <p className="text-sm">✅ {state.message}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary disabled:opacity-50">
        {pending ? "กำลังเปิดสิทธิ์…" : "ให้พนักงานเข้าใช้งาน"}
      </button>
    </form>
  );
}

export default GrantAccessForm;
