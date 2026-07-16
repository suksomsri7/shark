"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { createArticle, updateArticle, type Ctx } from "@/lib/modules/kb/service";

// ตรวจสิทธิ์โมดูล KB — convention action = "kb.article.<verb>"
function assertKbCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "kb", action },
  );
}

// ── สร้างบทความใหม่ ──
export async function createArticleAction(formData: FormData) {
  const auth = await requireTenant();
  assertKbCan(auth, "kb.article.create");
  const ctx: Ctx = { tenantId: auth.active.tenantId };

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;

  let id = "";
  try {
    const res = await createArticle(ctx, { title, body, category });
    id = res.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "บันทึกไม่สำเร็จ";
    redirect(`/app/kb/new?err=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/app/kb");
  redirect(`/app/kb/${id}`);
}

// ── แก้ไขบทความ (หัวข้อ/เนื้อหา/หมวด) ──
export async function updateArticleAction(formData: FormData) {
  const auth = await requireTenant();
  assertKbCan(auth, "kb.article.update");
  const ctx: Ctx = { tenantId: auth.active.tenantId };

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;

  if (!title || !body) {
    redirect(`/app/kb/${id}?err=${encodeURIComponent("กรุณากรอกหัวข้อและเนื้อหา")}`);
  }
  await updateArticle(ctx, id, { title, body, category });
  revalidatePath("/app/kb");
  revalidatePath(`/app/kb/${id}`);
  redirect(`/app/kb/${id}`);
}

// ── เปิด/ปิดใช้งานบทความ ──
export async function toggleActiveAction(formData: FormData) {
  const auth = await requireTenant();
  assertKbCan(auth, "kb.article.update");
  const ctx: Ctx = { tenantId: auth.active.tenantId };

  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "on";
  if (!id) return;
  await updateArticle(ctx, id, { active });
  revalidatePath("/app/kb");
  revalidatePath(`/app/kb/${id}`);
}
