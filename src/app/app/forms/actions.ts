"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { createForm, updateForm, type Ctx, type FieldInput } from "@/lib/modules/forms/service";

// ตรวจสิทธิ์โมดูล Forms — convention action = "forms.form.<verb>" (F6 ratchet บังคับเรียก assertCan)
function assertFormsCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "forms", action },
  );
}

function parseFields(raw: string): FieldInput[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as FieldInput[]) : [];
  } catch {
    return [];
  }
}

// ── สร้างฟอร์มใหม่ ──
export async function createFormAction(formData: FormData) {
  const auth = await requireTenant();
  assertFormsCan(auth, "forms.form.create");
  const ctx: Ctx = { tenantId: auth.active.tenantId };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const crmEnabled = String(formData.get("crmEnabled") ?? "") === "on";
  const fields = parseFields(String(formData.get("fields") ?? "[]"));

  let id = "";
  try {
    const res = await createForm(ctx, { name, description, crmEnabled, fields });
    id = res.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
    redirect(`/app/forms/new?err=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/app/forms");
  redirect(`/app/forms/${id}`);
}

// ── แก้ไขฟอร์ม (ชื่อ/คำอธิบาย/CRM/ช่องกรอก) ──
export async function updateFormAction(formData: FormData) {
  const auth = await requireTenant();
  assertFormsCan(auth, "forms.form.update");
  const ctx: Ctx = { tenantId: auth.active.tenantId };

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const crmEnabled = String(formData.get("crmEnabled") ?? "") === "on";
  const fields = parseFields(String(formData.get("fields") ?? "[]"));

  try {
    await updateForm(ctx, id, { name, description, crmEnabled, fields });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
    redirect(`/app/forms/${id}?err=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/app/forms/${id}`);
  revalidatePath("/app/forms");
  redirect(`/app/forms/${id}?saved=1`);
}

// ── เปิด/ปิดฟอร์ม (toggle active) ──
export async function toggleActiveAction(formData: FormData) {
  const auth = await requireTenant();
  assertFormsCan(auth, "forms.form.update");
  const ctx: Ctx = { tenantId: auth.active.tenantId };

  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "1";
  if (!id) return;
  await updateForm(ctx, id, { active });
  revalidatePath(`/app/forms/${id}`);
  revalidatePath("/app/forms");
}
