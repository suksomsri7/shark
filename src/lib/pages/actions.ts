"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { uploadFile } from "@/lib/storage/service";
import {
  addPageMember,
  addWidget,
  createPage,
  deletePage,
  removePageMember,
  removeWidget,
  renamePageMember,
  reorderWidgets,
  setPageMemberPin,
  updatePage,
  updateWidget,
} from "./service";

// การจัดการ Page = งานของ admin ร้าน — OWNER/MANAGER ผ่าน · STAFF ต้องได้ permission "pages.page.manage"
function assertPagesCan(auth: Awaited<ReturnType<typeof requireTenant>>) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "pages", action: "pages.page.manage" },
  );
}

const revalidate = (pageId?: string) => {
  revalidatePath("/app/pages");
  if (pageId) revalidatePath(`/app/pages/${pageId}`);
};

export async function createPageAction(formData: FormData) {
  const auth = await requireTenant();
  assertPagesCan(auth);
  const res = await createPage(
    { tenantId: auth.active.tenantId },
    { unitId: String(formData.get("unitId") ?? ""), name: String(formData.get("name") ?? "") },
  );
  revalidate();
  if (res.ok && res.id) redirect(`/app/pages/${res.id}`);
}

export async function updatePageAction(formData: FormData) {
  const auth = await requireTenant();
  assertPagesCan(auth);
  const pageId = String(formData.get("pageId") ?? "");
  if (!pageId) return;
  await updatePage({ tenantId: auth.active.tenantId }, pageId, {
    name: String(formData.get("name") ?? ""),
    active: formData.get("active") != null,
  });
  revalidate(pageId);
}

export async function deletePageAction(formData: FormData) {
  const auth = await requireTenant();
  assertPagesCan(auth);
  const pageId = String(formData.get("pageId") ?? "");
  if (!pageId) return;
  await deletePage({ tenantId: auth.active.tenantId }, pageId);
  revalidate();
  redirect("/app/pages");
}

export async function addWidgetAction(formData: FormData) {
  const auth = await requireTenant();
  assertPagesCan(auth);
  const pageId = String(formData.get("pageId") ?? "");
  const widgetKey = String(formData.get("widgetKey") ?? "");
  if (!pageId || !widgetKey) return;
  await addWidget({ tenantId: auth.active.tenantId }, pageId, widgetKey);
  revalidate(pageId);
}

export async function updateWidgetAction(formData: FormData) {
  const auth = await requireTenant();
  assertPagesCan(auth);
  const pageId = String(formData.get("pageId") ?? "");
  const widgetId = String(formData.get("widgetId") ?? "");
  if (!widgetId) return;
  const shapeRaw = String(formData.get("shape") ?? "");
  await updateWidget({ tenantId: auth.active.tenantId }, widgetId, {
    title: String(formData.get("title") ?? ""),
    ...(["RECT", "SQUARE", "CIRCLE"].includes(shapeRaw) ? { shape: shapeRaw as "RECT" } : {}),
    ...(formData.has("imageUrl") ? { imageUrl: String(formData.get("imageUrl") ?? "") } : {}),
  });
  revalidate(pageId);
}

export async function removeWidgetAction(formData: FormData) {
  const auth = await requireTenant();
  assertPagesCan(auth);
  const pageId = String(formData.get("pageId") ?? "");
  const widgetId = String(formData.get("widgetId") ?? "");
  if (!widgetId) return;
  await removeWidget({ tenantId: auth.active.tenantId }, widgetId);
  revalidate(pageId);
}

/** จัดลำดับจาก drag & drop — client เรียกตรง (ids เรียงตามตำแหน่งใหม่) */
export async function reorderWidgetsAction(pageId: string, idsCsv: string) {
  const auth = await requireTenant();
  assertPagesCan(auth);
  await reorderWidgets({ tenantId: auth.active.tenantId }, pageId, idsCsv.split(",").filter(Boolean));
  revalidate(pageId);
}

// ── รูป widget: อัปรูปที่แต่งจาก ImageEditor (dataURL) ขึ้น storage แล้วผูก ──
export type ImageState = { status: "idle" } | { status: "ok"; message: string } | { status: "error"; message: string };

export async function uploadWidgetImageAction(
  pageId: string,
  widgetId: string,
  _prev: ImageState,
  formData: FormData,
): Promise<ImageState> {
  const auth = await requireTenant();
  assertPagesCan(auth);
  const dataUrl = String(formData.get("dataUrl") ?? "");
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) return { status: "error", message: "รูปไม่ถูกต้อง — ลองเลือกไฟล์ใหม่" };
  const bytes = Buffer.from(m[2]!, "base64");
  if (bytes.length > 5 * 1024 * 1024) return { status: "error", message: "รูปใหญ่เกิน 5MB" };
  const up = await uploadFile(
    { tenantId: auth.active.tenantId },
    { kind: "ATTACHMENT", filename: `widget-${widgetId}.jpg`, contentType: m[1]!, data: new Uint8Array(bytes) },
  );
  if (!up.ok) return { status: "error", message: up.error };
  const res = await updateWidget({ tenantId: auth.active.tenantId }, widgetId, { imageUrl: up.cdnUrl });
  if (!res.ok) return { status: "error", message: res.reason ?? "บันทึกไม่ได้" };
  revalidate(pageId);
  return { status: "ok", message: "เปลี่ยนรูปแล้ว" };
}

// ── สมาชิก + PIN ──
export async function addPageMemberAction(formData: FormData) {
  const auth = await requireTenant();
  assertPagesCan(auth);
  const pageId = String(formData.get("pageId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  if (!pageId || !membershipId) return;
  await addPageMember({ tenantId: auth.active.tenantId }, pageId, membershipId);
  revalidate(pageId);
}

export type PinState = { status: "idle" } | { status: "ok"; message: string } | { status: "error"; message: string };

export async function setPagePinAction(
  pageId: string,
  pageMemberId: string,
  _prev: PinState,
  formData: FormData,
): Promise<PinState> {
  const auth = await requireTenant();
  assertPagesCan(auth);
  const pin = String(formData.get("pin") ?? "");
  const res = await setPageMemberPin({ tenantId: auth.active.tenantId }, pageMemberId, pin);
  if (!res.ok) return { status: "error", message: res.reason ?? "บันทึกไม่ได้" };
  revalidate(pageId);
  return { status: "ok", message: pin.trim() ? "ตั้ง PIN แล้ว" : "ล้าง PIN แล้ว (คนนี้เข้าไม่ได้จนกว่าจะตั้งใหม่)" };
}

export async function renamePageMemberAction(formData: FormData) {
  const auth = await requireTenant();
  assertPagesCan(auth);
  const pageId = String(formData.get("pageId") ?? "");
  const pageMemberId = String(formData.get("pageMemberId") ?? "");
  if (!pageMemberId) return;
  await renamePageMember({ tenantId: auth.active.tenantId }, pageMemberId, String(formData.get("displayName") ?? ""));
  revalidate(pageId);
}

export async function removePageMemberAction(formData: FormData) {
  const auth = await requireTenant();
  assertPagesCan(auth);
  const pageId = String(formData.get("pageId") ?? "");
  const pageMemberId = String(formData.get("pageMemberId") ?? "");
  if (!pageMemberId) return;
  await removePageMember({ tenantId: auth.active.tenantId }, pageMemberId);
  revalidate(pageId);
}
