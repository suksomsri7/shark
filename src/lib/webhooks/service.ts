// Webhooks ขาออก (WO-0062) — สมัคร URL ต่อ event + ลายเซ็น HMAC + retry
//
// อยู่นอก modules (kernel-adjacent เหมือน automation/) เพราะ dispatch/retry เดินจาก outbox/cron
// ซึ่ง "ไม่มี session" → ใช้ prisma ตรงได้ (มี comment กำกับ) ส่วน CRUD ฝั่งร้านผ่าน tenantDb
//
// createEndpoint/list/setActive/delete : tenant-scoped ผ่าน tenantDb({ tenantId }) — ร้านอื่นเห็น 0
// dispatchWebhooks(evt, deps?) : หา endpoint active ของ tenant ที่ subscribe event → POST + ลายเซ็น
//   สำเร็จ(2xx) → WebhookDelivery OK · ล้ม → FAILED + lastError (เก็บแล้วไปต่อ — ห้ามโยนออก)
// retryFailedWebhooks(deps?) : หยิบ FAILED ที่ attempts < 5 ยิงซ้ำ · สำเร็จ→OK · ล้ม→attempts+1

import { randomBytes, createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";

export type Ctx = { tenantId: string };
export type WebhookEvent = { tenantId: string; type: string; payload: unknown };
export type WebhookDeps = { fetchFn?: typeof fetch };

const TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 5;

// อ่าน events จาก eventsJson แบบปลอดภัย (ไม่ใช่ array/มีค่าไม่ใช่ string → กรองทิ้ง)
const eventsOf = (eventsJson: unknown): string[] =>
  Array.isArray(eventsJson) ? eventsJson.filter((x): x is string => typeof x === "string") : [];

// ── CRUD ปลายทาง (tenant-scoped) ──────────────────────────────────────────

// สร้าง endpoint — url ต้อง http(s) เท่านั้น · secret สุ่มให้ (48 hex ≥24) · events ว่าง = ทุก event
export async function createEndpoint(
  ctx: Ctx,
  input: { url: string; events?: string[] },
): Promise<{ id: string; secret: string }> {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("ที่อยู่ปลายทางต้องขึ้นต้นด้วย http:// หรือ https://");
  }
  const secret = randomBytes(24).toString("hex"); // 48 ตัวอักษร
  const events = Array.isArray(input.events)
    ? input.events.filter((e) => typeof e === "string" && e.trim() !== "")
    : [];
  const ep = await tenantDb(ctx).webhookEndpoint.create({
    data: { tenantId: ctx.tenantId, url, secret, eventsJson: events as Prisma.InputJsonValue },
  });
  return { id: ep.id, secret };
}

// รายการ endpoint ของร้านนี้ (ใหม่สุดก่อน)
export async function listEndpoints(ctx: Ctx) {
  return tenantDb(ctx).webhookEndpoint.findMany({ orderBy: { createdAt: "desc" } });
}

// เปิด/ปิด endpoint (ปิดแล้ว dispatch ข้าม)
export async function setEndpointActive(ctx: Ctx, id: string, active: boolean) {
  return tenantDb(ctx).webhookEndpoint.update({ where: { id }, data: { active } });
}

// ลบ endpoint (deliveries ผูก onDelete: Cascade → หายตาม)
export async function deleteEndpoint(ctx: Ctx, id: string): Promise<void> {
  await tenantDb(ctx).webhookEndpoint.delete({ where: { id } });
}

// รายการการส่งล่าสุด (สำหรับตารางในหน้า UI)
export async function listDeliveries(ctx: Ctx, limit = 20) {
  return tenantDb(ctx).webhookDelivery.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { endpoint: { select: { url: true } } },
  });
}

// ── ยิงจริง ───────────────────────────────────────────────────────────────

// POST body ไป url พร้อมลายเซ็น · คืน null = สำเร็จ · คืน string = ข้อความ error (ไม่โยน)
async function deliver(
  url: string,
  body: string,
  signature: string,
  eventType: string,
  fetchFn: typeof fetch,
): Promise<string | null> {
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Shark-Signature": signature,
        "X-Shark-Event": eventType,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return `ปลายทางตอบรหัส ${res.status}`;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

// กระจาย event ไปทุก endpoint ที่ subscribe → บันทึก WebhookDelivery · คืนจำนวนที่สำเร็จ
// kernel-level: เรียกจาก outbox (ไม่มี session) → prisma ตรง + กรอง tenantId เอง
export async function dispatchWebhooks(evt: WebhookEvent, deps?: WebhookDeps): Promise<number> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId: evt.tenantId, active: true },
  });
  const targets = endpoints.filter((ep) => {
    const ev = eventsOf(ep.eventsJson);
    return ev.length === 0 || ev.includes(evt.type); // ว่าง = รับทุก event
  });

  const body = JSON.stringify({ type: evt.type, payload: evt.payload, sentAt: new Date().toISOString() });
  const payloadJson = (evt.payload ?? {}) as Prisma.InputJsonValue;
  let ok = 0;
  for (const ep of targets) {
    const signature = createHmac("sha256", ep.secret).update(body).digest("hex");
    const err = await deliver(ep.url, body, signature, evt.type, fetchFn);
    await prisma.webhookDelivery.create({
      data: {
        tenantId: evt.tenantId,
        endpointId: ep.id,
        eventType: evt.type,
        payloadJson,
        status: err === null ? "OK" : "FAILED",
        attempts: 1,
        lastError: err ?? null,
      },
    });
    if (err === null) ok++;
  }
  return ok;
}

// ยิงซ้ำการส่งที่ล้ม (attempts < 5) ทุก tenant · สำเร็จ→OK · ล้ม→attempts+1 · คืนจำนวนที่กู้สำเร็จ
// kernel-level: เรียกจาก cron (ไม่มี session) → prisma ตรงข้ามทุกร้าน
export async function retryFailedWebhooks(deps?: WebhookDeps): Promise<number> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const failed = await prisma.webhookDelivery.findMany({
    where: { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } },
    include: { endpoint: true },
  });
  let ok = 0;
  for (const d of failed) {
    const body = JSON.stringify({ type: d.eventType, payload: d.payloadJson, sentAt: new Date().toISOString() });
    const signature = createHmac("sha256", d.endpoint.secret).update(body).digest("hex");
    const err = await deliver(d.endpoint.url, body, signature, d.eventType, fetchFn);
    await prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        status: err === null ? "OK" : "FAILED",
        attempts: d.attempts + 1,
        lastError: err ?? null,
      },
    });
    if (err === null) ok++;
  }
  return ok;
}
