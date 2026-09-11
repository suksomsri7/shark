// ops/webhooks.ts — op ของ "Webhook ขาออก" ของระบบสมาชิก (MEMBER-API §2.20 · M3.10 · บริการ `src/lib/webhooks/service.ts`)
//
// ปลายทางของร้านเป็นของกลาง (ตาราง WebhookEndpoint ระดับร้าน) — REST ของระบบสมาชิกจัดการได้เฉพาะ
// **ปลายทางของระบบสมาชิก** = ปลายทางที่สมัครรับเหตุการณ์ของระบบสมาชิกเท่านั้น (ทุกตัวอยู่ใน `memberWebhookEvents()`)
// ⇒ ปลายทางที่ร้านตั้งไว้รับเหตุการณ์ของบัญชี/บอร์ดงาน/ทุกเหตุการณ์ (รายการว่าง) มองไม่เห็น = ไม่พบ (404)
//    คีย์สมาชิกจึงลบหรือแก้ฮุคของโมดูลอื่นไม่ได้แม้จะเป็นร้านเดียวกัน
//
// 🔴 url ต้องเป็น https (ส่งข้อมูลอ้างอิงสมาชิกผ่านเน็ต — http = 400) · events ต้องไม่ว่าง (ว่าง = "ทุกเหตุการณ์ของร้าน" ในบริการกลาง)
// 🔴 secret คืนครั้งเดียวตอนสร้าง (`replaySecrets`) · รายการ/แก้ไข ไม่เคยคืน secret
// 🔴 ลายเซ็น `X-Shark-Signature` = hex(HMAC-SHA256(secret, body ดิบ)) · ส่งไม่ผ่านลองใหม่สูงสุด 5 ครั้ง (cron)

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
import type { ApiActor } from "@/lib/api/actor";
import { ApiError } from "@/lib/api/respond";
import { badRequest } from "../http-errors";
import { isMemberWebhookEndpoint, memberWebhookEvents, memberWebhookEventsCheck, memberWebhookUrlProblem } from "../webhook-events";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";

const TEST = "M3.10-S3.9";

type EndpointRow = { id: string; url: string; active: boolean; eventsJson: unknown; createdAt: Date; updatedAt?: Date };

const eventsOf = (json: unknown): string[] => (Array.isArray(json) ? json.filter((x): x is string => typeof x === "string") : []);

/** ปลายทางนี้เป็น "ของระบบสมาชิก" ไหม (กติกาเดียวกับหน้าตั้งค่า — `webhook-events.ts`) */
function isMemberEndpoint(row: { eventsJson: unknown }, allowed: ReadonlySet<string>): boolean {
  return isMemberWebhookEndpoint(row.eventsJson, allowed);
}

function view(row: EndpointRow) {
  return { id: row.id, url: row.url, events: eventsOf(row.eventsJson), active: row.active, createdAt: row.createdAt };
}

function notFound(): ApiError {
  return new ApiError(404, "not_found", "ไม่พบปลายทาง webhook นี้ในระบบสมาชิก", "No member webhook endpoint has that id.");
}

async function loadMine(actor: ApiActor, id: string): Promise<EndpointRow> {
  const row = await getEndpoint({ tenantId: actor.tenantId }, id);
  if (!row || !isMemberEndpoint(row, new Set(memberWebhookEvents()))) throw notFound();
  return row;
}

function checkEvents(events: string[]): string[] {
  const res = memberWebhookEventsCheck(events);
  if (!res.ok) {
    throw badRequest(
      res.reason,
      res.bad.length > 0 ? `Not member events: ${res.bad.join(", ")}. See the Webhooks section of the member API docs.` : "Pick at least one member event.",
      [{ path: "events", message: res.reason }],
    );
  }
  return res.events;
}

function checkUrl(raw: string): string {
  const problem = memberWebhookUrlProblem(raw);
  if (problem) throw badRequest(problem, "The endpoint URL must use https.", [{ path: "url", message: "ต้องเป็น https://" }]);
  return raw.trim();
}

const list = defineMemberOp({
  id: "webhooks.list",
  method: "GET",
  path: "/webhooks",
  kind: "read",
  action: "member.api.manage",
  summary: "Webhook endpoints of the member system (those subscribed only to member events): URL, events, whether active, and the last delivery. The signing secret is never returned here.",
  label: "ปลายทาง webhook ของระบบสมาชิก",
  test: TEST,
  async handler({ actor }) {
    const ctx = { tenantId: actor.tenantId };
    const allowed = new Set(memberWebhookEvents());
    const rows = (await listEndpoints(ctx)).filter((r) => isMemberEndpoint(r, allowed));
    const deliveries = rows.length > 0 ? await listDeliveries(ctx, 200) : [];
    const items = rows.map((r) => {
      const last = deliveries.find((d) => d.endpointId === r.id);
      return { ...view(r), lastDelivery: last ? { at: last.createdAt, status: last.status, eventType: last.eventType } : null };
    });
    return jsonSafe({ items, total: items.length });
  },
});

const create = defineMemberOp({
  id: "webhooks.create",
  method: "POST",
  path: "/webhooks",
  kind: "write",
  action: "member.api.manage",
  summary: "Add an https endpoint that receives the chosen member events. The signing secret is in `secret` and is shown only in this reply; verify every delivery with HMAC-SHA256 of the raw body.",
  label: "เพิ่มปลายทาง webhook",
  input: z
    .object({
      url: z.string().trim().min(1).max(500).describe("https URL that accepts POST."),
      events: z.array(z.string().trim().min(1).max(80)).min(1).max(60).describe("Member events to receive (see the Webhooks section)."),
    })
    .strict(),
  replaySecrets: ["secret"],
  test: TEST,
  async handler({ actor, input }) {
    const url = checkUrl(input.url);
    const events = checkEvents(input.events);
    const res = await createEndpoint({ tenantId: actor.tenantId }, { url, events });
    return jsonSafe({ id: res.id, secret: res.secret, url, events, active: true });
  },
});

const update = defineMemberOp({
  id: "webhooks.update",
  method: "PATCH",
  path: "/webhooks/{id}",
  kind: "write",
  action: "member.api.manage",
  summary: "Change the events an endpoint receives or pause it (`active: false`). The secret does not change, so the receiving system keeps verifying signatures.",
  label: "แก้ปลายทาง webhook",
  input: z
    .object({
      events: z.array(z.string().trim().min(1).max(80)).min(1).max(60).optional(),
      active: z.boolean().optional(),
    })
    .strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    const ctx = { tenantId: actor.tenantId };
    const row = await loadMine(actor, params.id ?? "");
    if (input.events) await setEndpointEvents(ctx, row.id, checkEvents(input.events));
    if (input.active !== undefined) await setEndpointActive(ctx, row.id, input.active);
    const after = await getEndpoint(ctx, row.id);
    return jsonSafe(after ? view(after) : view(row));
  },
});

const remove = defineMemberOp({
  id: "webhooks.delete",
  method: "DELETE",
  path: "/webhooks/{id}",
  kind: "danger",
  action: "member.api.manage",
  summary: "Delete an endpoint and its delivery log. Deliveries still queued for it are dropped.",
  label: "ลบปลายทาง webhook",
  input: z.object({ reason: z.string().trim().min(5).max(500) }).strict(),
  test: TEST,
  async handler({ actor, params }) {
    const row = await loadMine(actor, params.id ?? "");
    await deleteEndpoint({ tenantId: actor.tenantId }, row.id);
    return jsonSafe({ id: row.id, deleted: true });
  },
});

const deliveries = defineMemberOp({
  id: "webhooks.deliveries",
  method: "GET",
  path: "/webhooks/{id}/deliveries",
  kind: "read",
  action: "member.api.manage",
  summary: "Latest deliveries to one endpoint: event, status (OK or FAILED), attempts, last error and time. Failed deliveries are retried up to 5 times.",
  label: "ประวัติการส่ง webhook",
  input: z.object({ take: z.coerce.number().int().min(1).max(100).optional().describe("Rows, 1-100 (default 20).") }).strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    const row = await loadMine(actor, params.id ?? "");
    const rows = await listDeliveries({ tenantId: actor.tenantId }, input.take ?? 20, row.id);
    const items = rows.map((d) => ({
      id: d.id,
      eventType: d.eventType,
      status: d.status,
      attempts: d.attempts,
      lastError: d.lastError,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));
    return jsonSafe({ items, total: items.length });
  },
});

const test = defineMemberOp({
  id: "webhooks.test",
  method: "POST",
  path: "/webhooks/{id}/test",
  kind: "write",
  action: "member.api.manage",
  summary: "Send one signed test delivery to the endpoint right now (payload `{ test: true }`), whatever events it subscribes to, and log it like a real delivery.",
  label: "ทดสอบส่ง webhook",
  input: z.object({ event: z.string().trim().max(80).optional().describe("Event type to put in the test (default member.updated).") }).strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    const row = await loadMine(actor, params.id ?? "");
    const event = input.event ? checkEvents([input.event])[0]! : "member.updated";
    const res = await testEndpoint({ tenantId: actor.tenantId }, row.id, event);
    const latest = (await listDeliveries({ tenantId: actor.tenantId }, 1, row.id))[0] ?? null;
    return jsonSafe({ ok: res.delivered, delivered: res.delivered, error: res.error, deliveryId: latest?.id ?? null, event });
  },
});

export const WEBHOOKS_OPS: ApiOp[] = [list, create, update, remove, deliveries, test];
