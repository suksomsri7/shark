"use client";

import { useActionState } from "react";
import type { Role } from "@prisma/client";
import { permissionParamToInput, type PermissionModuleView } from "@/lib/core/permissions";
import { updateStaffAccessAction } from "@/lib/staff/actions";
import { staffFormInitial, type StaffFormState } from "@/lib/staff/form-state";
import { FormField } from "@/components/ui/FormField";

// ฟอร์มตั้งสิทธิ์รายคน — รายการสิทธิ์ทั้งหมดมาจากทะเบียนกลาง (props `groups`) ไม่มีลิสต์พิมพ์มือในไฟล์นี้

type Group = { group: string; label: string; modules: readonly PermissionModuleView[] };
type RoleOption = { value: Role; label: string; hint: string; disabled: boolean };

const inputCls =
  "rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]";

export function AccessForm({
  membershipId,
  role,
  roleOptions,
  unitAccess,
  unitOptions,
  canGrantAllUnits,
  permissions,
  groups,
  actorPermissions,
  actorIsFullAccess,
  disabled,
}: {
  membershipId: string;
  role: Role;
  roleOptions: RoleOption[];
  unitAccess: string[];
  unitOptions: { id: string; name: string }[];
  canGrantAllUnits: boolean;
  permissions: Record<string, unknown>;
  groups: Group[];
  actorPermissions: Record<string, unknown>;
  actorIsFullAccess: boolean;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState<StaffFormState, FormData>(
    updateStaffAccessAction,
    staffFormInitial,
  );

  const has = (key: string) => permissions[key] === true;
  // แจกได้เฉพาะสิทธิ์ที่ตัวเองมี — ช่องที่แจกไม่ได้ให้ปิดไว้พร้อมเหตุผล (ด่านจริงอยู่ที่ server)
  const grantable = (key: string, moduleName: string) =>
    actorIsFullAccess ||
    actorPermissions[key] === true ||
    actorPermissions[`${moduleName}.*`] === true ||
    has(key); // ของที่เขามีอยู่แล้ว ยังแสดง/ถอดออกได้

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="membershipId" value={membershipId} />

      <section className="card flex flex-col gap-3">
        <h2 className="text-sm font-medium">บทบาท</h2>
        <FormField label="บทบาทในร้าน">
          <select name="role" defaultValue={role} className={inputCls} disabled={disabled}>
            {roleOptions.map((r) => (
              <option key={r.value} value={r.value} disabled={r.disabled}>
                {r.label} — {r.hint}
              </option>
            ))}
          </select>
        </FormField>
        <p className="text-xs text-[color:var(--color-muted)]">
          เจ้าของกิจการและผู้จัดการทำได้ทุกอย่างอยู่แล้ว การติ๊กสิทธิ์ด้านล่างมีผลกับ “พนักงาน” เท่านั้น
        </p>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="text-sm font-medium">สาขาที่เข้าถึงได้</h2>
        {unitOptions.length === 0 && !canGrantAllUnits ? (
          <p className="text-xs text-[color:var(--color-muted)]">
            คุณยังไม่ได้รับสิทธิ์เข้าถึงสาขาไหนเลย จึงยังมอบสาขาให้คนอื่นไม่ได้
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {canGrantAllUnits && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="unit"
                  value="*"
                  defaultChecked={unitAccess.includes("*")}
                  disabled={disabled}
                />
                <span>ทุกสาขา (รวมสาขาที่เปิดเพิ่มในอนาคต)</span>
              </label>
            )}
            {unitOptions.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="unit"
                  value={u.id}
                  defaultChecked={unitAccess.includes(u.id)}
                  disabled={disabled}
                />
                <span>{u.name}</span>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-[color:var(--color-muted)]">
          ถ้าติ๊ก “ทุกสาขา” ระบบจะเก็บเป็นทุกสาขาอย่างเดียว (ไม่ต้องติ๊กรายสาขาซ้ำ)
        </p>
      </section>

      {groups.map((g) => (
        <section key={g.group} className="card flex flex-col gap-4">
          <h2 className="text-sm font-medium">{g.label}</h2>
          {g.modules.map((m) => (
            <div key={m.module} className="flex flex-col gap-1.5">
              <div className="text-xs font-medium text-[color:var(--color-muted)]">{m.label}</div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="perm"
                  value={m.wildcardKey}
                  defaultChecked={has(m.wildcardKey)}
                  disabled={disabled || !grantable(m.wildcardKey, m.module)}
                  className="mt-1"
                />
                <span className="font-medium">ทุกอย่างในหัวข้อนี้</span>
              </label>
              {m.actions.map((p) => (
                <label key={p.key} className="flex items-start gap-2 pl-5 text-sm">
                  <input
                    type="checkbox"
                    name="perm"
                    value={p.key}
                    defaultChecked={has(p.key)}
                    disabled={disabled || !grantable(p.key, m.module)}
                    className="mt-1"
                  />
                  <span>
                    {p.label}
                    {p.planned && (
                      <span className="ml-1 text-xs text-[color:var(--color-muted)]">(กำลังพัฒนา)</span>
                    )}
                    {!grantable(p.key, m.module) && (
                      <span className="ml-1 text-xs text-[color:var(--color-muted)]">
                        — คุณยังไม่มีสิทธิ์นี้ จึงมอบให้คนอื่นไม่ได้
                      </span>
                    )}
                  </span>
                </label>
              ))}
              {m.params.map((p) => (
                <div key={p.key} className="pl-5">
                  <FormField label={`${p.label} (${p.unit})`} hint={p.hint}>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      name={`param:${p.key}`}
                      defaultValue={
                        typeof permissions[p.key] === "number"
                          ? permissionParamToInput(p, permissions[p.key] as number)
                          : ""
                      }
                      className={inputCls}
                      disabled={disabled}
                    />
                  </FormField>
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}

      {state.status === "error" && (
        <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && <p className="text-sm">✅ {state.message}</p>}

      <button type="submit" disabled={pending || disabled} className="btn btn-primary disabled:opacity-50">
        {pending ? "กำลังบันทึก…" : "บันทึกสิทธิ์"}
      </button>
    </form>
  );
}

export default AccessForm;
