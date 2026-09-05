// ops/webhooks.ts — CRUD/test/deliveries ของปลายทาง webhook ขาออก (WO D4)
//
// เหตุการณ์ที่สมัครรับได้ = `WEBHOOK_EVENTS` (แหล่งความจริงเดียว — เพิ่ม event ใหม่ที่
// `src/lib/webhooks/labels.ts` + consumer ที่ `src/lib/outbox-consumers.ts` เท่านั้น ไม่ใช่ที่นี่)
//
// 🔴 `secret` คืนให้เห็นครั้งเดียวตอน `POST /webhooks` (สร้างใหม่) — `GET /webhooks`/`PATCH` ไม่มี field
//    นี้ในผลลัพธ์เด็ดขาด (สูญหายแล้วต้องลบสร้างใหม่ ตั้งใจให้เป็นแบบนั้นเหมือนคีย์ API)
// 🔴 `WebhookEndpoint` เป็น tenant-scoped ล้วน (ไม่มี systemId) — endpoint เดียวรับ event ได้ทุกสมุดบัญชี
//    ของร้าน ⇒ ทุก op ที่นี่ใช้ `{ tenantId: actor.tenantId }` เป็น ctx ไม่ใช่ `ctxOf(actor)` แบบไฟล์อื่น

import { z } from "zod";
import {
  createEndpoint,
  deleteEndpoint,
  getEndpoint,
  listDeliveries,
  listEndpoints,
  setEndpointActive,
  setEndpointEvents,
  testEndpoint,
} from "@/lib/webhooks/service";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/labels";
import { defineOp, type ApiOp } from "../op";
import { ApiError } from "../respond";
import { iso } from "../serialize";

const EVENT_VALUES = new Set(WEBHOOK_EVENTS.map((e) => e.value));

function notFound(message_th: string): ApiError {
  return new ApiError(404, "not_found", message_th, "No such webhook endpoint.");
}

function unknownEvent(event: string): ApiError {
  return new ApiError(422, "validation", `ไม่รู้จักเหตุการณ์ "${event}"`, `Unknown event "${event}".`, undefined, [
    { path: "events", message: `ไม่รู้จักเหตุการณ์ "${event}"` },
  ]);
}

function eventsOf(eventsJson: unknown): string[] {
  return Array.isArray(eventsJson) ? eventsJson.filter((x): x is string => typeof x === "string") : [];
}

/** endpoint (ไม่มี secret) — ใช้ทั้ง list/create/update */
function endpointView(ep: { id: string; url: string; eventsJson: unknown; active: boolean; createdAt: Date }) {
  return { id: ep.id, url: ep.url, events: eventsOf(ep.eventsJson), active: ep.active, createdAt: iso(ep.createdAt) };
}

function deliveryView(d: { id: string; eventType: string; status: string; attempts: number; createdAt: Date; lastError: string | null }) {
  return { id: d.id, event: d.eventType, status: d.status, attempts: d.attempts, at: iso(d.createdAt), lastError: d.lastError };
}

async function requireEndpoint(tenantId: string, id: string) {
  const ep = await getEndpoint({ tenantId }, id);
  if (!ep) throw notFound("ไม่พบปลายทาง webhook นี้");
  return ep;
}

// ═══════════════════════════ list / create ═══════════════════════════

const webhooksList = defineOp({
  id: "webhooks.list",
  method: "GET",
  path: "/webhooks",
  kind: "read",
  action: "account.settings.manage",
  summary: "Webhook endpoints of this shop. Never includes the signing secret.",
  label: "รายการ webhook",
  test: "D4-S6.4",
  async handler({ actor }) {
    const rows = await listEndpoints({ tenantId: actor.tenantId });
    return rows.map(endpointView);
  },
});

const webhooksCreateInput = z
  .object({
    url: z.string().max(500).describe("Destination URL. Must start with http:// or https://."),
    events: z
      .array(z.string())
      .max(50)
      .default([])
      .describe("Event types to receive. Must each be one of the values in GET /help/glossary's webhook list. Empty means every event."),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!/^https?:\/\//i.test(v.url.trim())) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "ที่อยู่ปลายทางต้องขึ้นต้นด้วย http:// หรือ https://" });
    }
    for (const e of v.events) {
      if (!EVENT_VALUES.has(e)) ctx.addIssue({ code: "custom", path: ["events"], message: `ไม่รู้จักเหตุการณ์ "${e}"` });
    }
  });

const webhooksCreate = defineOp({
  id: "webhooks.create",
  method: "POST",
  path: "/webhooks",
  kind: "write",
  action: "account.settings.manage",
  summary: "Register a new webhook endpoint and get its signing secret. The secret is only ever shown here - store it now.",
  label: "เพิ่มปลายทาง webhook",
  input: webhooksCreateInput,
  test: "D4-S6.1",
  async handler({ actor, input }) {
    const res = await createEndpoint({ tenantId: actor.tenantId }, { url: input.url.trim(), events: input.events });
    return { id: res.id, url: input.url.trim(), events: input.events, active: true, secret: res.secret };
  },
});

// ═══════════════════════════ update / delete ═══════════════════════════

const webhooksUpdateInput = z
  .object({
    events: z.array(z.string()).max(50).optional().describe("Replace the subscribed events. Empty array means every event."),
    active: z.boolean().optional(),
  })
  .strict();

const webhooksUpdate = defineOp({
  id: "webhooks.update",
  method: "PATCH",
  path: "/webhooks/{id}",
  kind: "write",
  action: "account.settings.manage",
  summary: "Change which events an endpoint receives, or pause/resume it. The signing secret never changes here.",
  label: "แก้ปลายทาง webhook",
  input: webhooksUpdateInput,
  test: "D4-S6.5",
  async handler({ actor, params, input }) {
    const id = params.id ?? "";
    await requireEndpoint(actor.tenantId, id);
    if (input.events !== undefined) {
      for (const e of input.events) if (!EVENT_VALUES.has(e)) throw unknownEvent(e);
      await setEndpointEvents({ tenantId: actor.tenantId }, id, input.events);
    }
    if (input.active !== undefined) await setEndpointActive({ tenantId: actor.tenantId }, id, input.active);
    const fresh = await requireEndpoint(actor.tenantId, id);
    return endpointView(fresh);
  },
});

const webhooksDeleteInput = z.object({ reason: z.string().min(5).max(500).describe("Why this endpoint is being removed. At least 5 characters.") }).strict();

const webhooksDelete = defineOp({
  id: "webhooks.delete",
  method: "DELETE",
  path: "/webhooks/{id}",
  kind: "danger",
  action: "account.settings.manage",
  summary: "Remove a webhook endpoint. Its delivery history is removed with it.",
  label: "ลบปลายทาง webhook",
  input: webhooksDeleteInput,
  test: "D4-S6.8",
  async handler({ actor, params }) {
    const id = params.id ?? "";
    await requireEndpoint(actor.tenantId, id);
    await deleteEndpoint({ tenantId: actor.tenantId }, id);
    return { id, deleted: true };
  },
});

// ═══════════════════════════ test / deliveries ═══════════════════════════

const webhooksTestInput = z.object({ event: z.string().describe("Event type to simulate. Must be a known event type.") }).strict();

const webhooksTest = defineOp({
  id: "webhooks.test",
  method: "POST",
  path: "/webhooks/{id}/test",
  kind: "write",
  action: "account.settings.manage",
  summary: "Send one test delivery to this endpoint with a fake payload of the given event type, regardless of its subscription list.",
  label: "ทดสอบ webhook",
  input: webhooksTestInput,
  test: "D4-S6.6",
  async handler({ actor, params, input }) {
    if (!EVENT_VALUES.has(input.event)) throw unknownEvent(input.event);
    const id = params.id ?? "";
    await requireEndpoint(actor.tenantId, id);
    const res = await testEndpoint({ tenantId: actor.tenantId }, id, input.event);
    return { delivered: res.delivered ? 1 : 0, error: res.error };
  },
});

const deliveriesInput = z.object({ take: z.coerce.number().int().min(1).max(100).optional().describe("1-100. Default 20.") }).strict();

const webhooksDeliveries = defineOp({
  id: "webhooks.deliveries",
  method: "GET",
  path: "/webhooks/{id}/deliveries",
  kind: "read",
  action: "account.settings.manage",
  summary: "Recent delivery attempts to one endpoint, newest first.",
  label: "ประวัติการส่ง webhook",
  input: deliveriesInput,
  test: "D4-S6.7",
  async handler({ actor, params, input }) {
    const id = params.id ?? "";
    await requireEndpoint(actor.tenantId, id);
    const rows = await listDeliveries({ tenantId: actor.tenantId }, input.take ?? 20, id);
    return rows.map(deliveryView);
  },
});

export const WEBHOOKS_OPS: ApiOp[] = [webhooksList, webhooksCreate, webhooksUpdate, webhooksDelete, webhooksTest, webhooksDeliveries];
