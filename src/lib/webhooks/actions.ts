"use server";

// Webhooks ขาออก (WO-0062) — server actions ฝั่งร้าน
// tenantId ดึงจาก session (requireTenant) เท่านั้น + assertCan webhook.endpoint.* ทุก action

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { createEndpoint, setEndpointActive, deleteEndpoint } from "./service";
import { WEBHOOK_EVENTS } from "./labels";

const SETTINGS_PATH = "/app/settings/webhooks";

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

// ลบ endpoint
export async function deleteEndpointAction(formData: FormData): Promise<void> {
  const auth = await requireTenant();
  assertWebhookCan(auth, "webhook.endpoint.delete");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteEndpoint({ tenantId: auth.active.tenantId }, id);
  revalidatePath(SETTINGS_PATH);
}
