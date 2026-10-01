"use server";

// Webhooks ขาออก (WO-0062) — server actions ฝั่งร้าน
// tenantId ดึงจาก session (requireTenant) เท่านั้น + assertCan webhook.endpoint.* ทุก action

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { createEndpoint, setEndpointActive, setEndpointEvents, deleteEndpoint } from "./service";
import { WEBHOOK_EVENTS } from "./labels";

const SETTINGS_PATH = "/app/settings/webhooks";

// CRM C5.5 ▸ (fix1 r1b · มติผู้คุมงาน ข้อ 1) ปลายทางที่รับ event ของ CRM (เลือกตรง ๆ หรือ "ทุกเหตุการณ์" = รายการว่าง) ตั้งได้เฉพาะคนที่ผ่าน
//   กติกา "เห็นข้อมูล CRM ทั้งร้าน" ของทุกระบบ CRM v2 ของร้าน — ตัดสินที่ facade ของ CRM (ร้านที่ไม่มี CRM v2 = เหมือนเดิมทุกอย่าง) ·
//   ปลายทางที่บันทึกไว้แล้วไม่ถูกแตะ (ตรวจเฉพาะตอนสร้าง/แก้รายการเหตุการณ์)
async function crmEventsProblem(auth: Awaited<ReturnType<typeof requireTenant>>, events: string[]): Promise<string | null> {
  const { crmPlatformWebhookProblem } = await import("@/lib/modules/crm");
  return crmPlatformWebhookProblem(
    auth.active.tenantId,
    {
      userId: auth.user.id,
      role: auth.active.role,
      unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
      permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    },
    events,
  );
}
// ◂ CRM C5.5

function assertWebhookCan(auth: Awaited<ReturnType<typeof requireTenant>>, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "webhook", action },
  );
}

export type CreateEndpointState =
  | { status: "idle" }
  | { status: "ok"; secret: string; url: string }
  | { status: "error"; message: string };

// สร้าง endpoint จากฟอร์ม — โชว์ secret กลับครั้งเดียว (เก็บไม่ได้อีก)
export async function createEndpointAction(
  _prev: CreateEndpointState,
  formData: FormData,
): Promise<CreateEndpointState> {
  const auth = await requireTenant();
  assertWebhookCan(auth, "webhook.endpoint.create");

  const url = String(formData.get("url") ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return {
      status: "error",
      message: "กรุณากรอกที่อยู่ปลายทางที่ขึ้นต้นด้วย http:// หรือ https://",
    };
  }

  // เก็บเฉพาะ event ที่รู้จัก · ไม่เลือกเลย = รับทุกเหตุการณ์ (events ว่าง)
  const selected = formData.getAll("events").map((v) => String(v));
  const events = selected.filter((e) => WEBHOOK_EVENTS.some((w) => w.value === e));

  // CRM C5.5 ▸ r1b ◂
  const crmProblem = await crmEventsProblem(auth, events);
  if (crmProblem) return { status: "error", message: crmProblem };

  try {
    const ep = await createEndpoint({ tenantId: auth.active.tenantId }, { url, events });
    revalidatePath(SETTINGS_PATH);
    return { status: "ok", secret: ep.secret, url };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
  }
}

// เปิด/ปิด endpoint
export async function toggleEndpointAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  assertWebhookCan(auth, "webhook.endpoint.update");
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return;
  await setEndpointActive({ tenantId: auth.active.tenantId }, id, active);
  revalidatePath(SETTINGS_PATH);
}

export type UpdateEventsState =
  | { status: "idle" }
  /** `events` = ค่าที่ **อ่านกลับจากฐานข้อมูล** ไม่ใช่ค่าที่ฟอร์มส่งไป — คำยืนยันต้องเชื่อถือได้ */
  | { status: "ok"; events: string[] }
  | { status: "error"; message: string };

// แก้เหตุการณ์ที่ปลายทางเดิมรับ — 🔴 secret ต้องเหมือนเดิม ไม่งั้นปลายทางตรวจลายเซ็นไม่ผ่าน
export async function updateEndpointEventsAction(
  _prev: UpdateEventsState,
  formData: FormData,
): Promise<UpdateEventsState> {
  const auth = await requireTenant();
  assertWebhookCan(auth, "webhook.endpoint.update");
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "ไม่พบปลายทางนี้" };
  const selected = formData.getAll("events").map((v) => String(v));
  const events = selected.filter((e) => WEBHOOK_EVENTS.some((w) => w.value === e));
  // CRM C5.5 ▸ r1b ◂
  const crmProblem = await crmEventsProblem(auth, events);
  if (crmProblem) return { status: "error", message: crmProblem };
  try {
    const saved = await setEndpointEvents({ tenantId: auth.active.tenantId }, id, events);
    revalidatePath(SETTINGS_PATH);
    const stored = Array.isArray(saved.eventsJson)
      ? (saved.eventsJson as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    return { status: "ok", events: stored };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" };
  }
}

// ลบ endpoint
export async function deleteEndpointAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  assertWebhookCan(auth, "webhook.endpoint.delete");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteEndpoint({ tenantId: auth.active.tenantId }, id);
  revalidatePath(SETTINGS_PATH);
}
