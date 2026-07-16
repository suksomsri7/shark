"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import type { CrmActivityType } from "@prisma/client";
import {
  addActivity,
  completeActivity,
  createContact,
  createDeal,
  moveDeal,
  type Ctx,
  issueQuotation,
} from "./service";

// ตรวจสิทธิ์โมดูล CRM (system-scoped) — OWNER/MANAGER ผ่าน · STAFF ตาม permission
// convention action = "crm.<entity>.<verb>" (F6 ratchet บังคับให้ไฟล์นี้เรียก assertCan)
function assertCrmCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "crm", action },
  );
}

const ACTIVITY_TYPES = new Set<CrmActivityType>([
  "CALL",
  "MEETING",
  "EMAIL",
  "LINE",
  "TASK",
  "NOTE",
]);

const bahtToSatang = (v: FormDataEntryValue | null): number => {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
};

const dateOrNull = (v: FormDataEntryValue | null): Date | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const revalidate = (systemId: string) => revalidatePath(`/app/sys/${systemId}`);

// ── สร้างผู้ติดต่อ (Lead) ──
export async function createContactAction(formData: FormData) {
  const auth = await requireTenant();
  assertCrmCan(auth, "crm.contact.create");
  const systemId = String(formData.get("systemId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!systemId || !name) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await createContact(ctx, {
    name,
    phone: String(formData.get("phone") ?? "").trim() || null,
    source: String(formData.get("source") ?? "").trim() || null,
  });
  revalidate(systemId);
}

// ── สร้างดีล (ลงขั้นแรกของ pipeline) ──
export async function createDealAction(formData: FormData) {
  const auth = await requireTenant();
  assertCrmCan(auth, "crm.deal.create");
  const systemId = String(formData.get("systemId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const pipelineId = String(formData.get("pipelineId") ?? "");
  const stageId = String(formData.get("stageId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!systemId || !contactId || !pipelineId || !stageId || !title) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await createDeal(ctx, {
    contactId,
    pipelineId,
    stageId,
    title,
    valueSatang: bahtToSatang(formData.get("value")),
    expectedCloseAt: dateOrNull(formData.get("expectedCloseAt")),
  });
  revalidate(systemId);
}

// ── ย้ายดีลไปขั้นตอนถัดไป/ก่อนหน้า (stageId ปลายทางมาจาก UI) ──
export async function moveDealAction(formData: FormData) {
  const auth = await requireTenant();
  assertCrmCan(auth, "crm.deal.move");
  const systemId = String(formData.get("systemId") ?? "");
  const dealId = String(formData.get("dealId") ?? "");
  const stageId = String(formData.get("stageId") ?? "");
  if (!systemId || !dealId || !stageId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await moveDeal(ctx, dealId, stageId);
  revalidate(systemId);
}

// ── เพิ่มงานติดตาม (follow-up) ──
export async function addActivityAction(formData: FormData) {
  const auth = await requireTenant();
  assertCrmCan(auth, "crm.activity.create");
  const systemId = String(formData.get("systemId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const rawType = String(formData.get("type") ?? "TASK");
  const type = (ACTIVITY_TYPES.has(rawType as CrmActivityType) ? rawType : "TASK") as CrmActivityType;
  if (!systemId || !title) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await addActivity(ctx, {
    contactId: String(formData.get("contactId") ?? "").trim() || null,
    dealId: String(formData.get("dealId") ?? "").trim() || null,
    type,
    title,
    dueAt: dateOrNull(formData.get("dueAt")),
  });
  revalidate(systemId);
}

// ── ปิดงานติดตาม ──
export async function completeActivityAction(formData: FormData) {
  const auth = await requireTenant();
  assertCrmCan(auth, "crm.activity.complete");
  const systemId = String(formData.get("systemId") ?? "");
  const activityId = String(formData.get("activityId") ?? "");
  if (!systemId || !activityId) return;
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId };
  await completeActivity(ctx, activityId);
  revalidate(systemId);
}

/** ออกใบเสนอราคาจากดีล (สะพาน → บัญชี WO-0010) */
export async function issueQuotationAction(formData: FormData) {
  const systemId = String(formData.get("systemId") ?? "");
  const dealId = String(formData.get("dealId") ?? "");
  const auth = await requireTenant();
  assertCrmCan(auth, "crm.deal.quote");
  await issueQuotation({ tenantId: auth.active.tenantId, systemId }, dealId);
  revalidate(systemId);
}

