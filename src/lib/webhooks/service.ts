// Webhooks ขาออก (WO-0062) — สมัคร URL ต่อ event + ลายเซ็น HMAC + retry
//
// อยู่นอก modules (kernel-adjacent เหมือน automation/) เพราะ dispatch/retry เดินจาก outbox/cron
// ซึ่ง "ไม่มี session" → ใช้ prisma ตรงได้ (มี comment กำกับ) ส่วน CRUD ฝั่งร้านผ่าน tenantDb
//
// createEndpoint/list/setActive/delete : tenant-scoped ผ่าน tenantDb({ tenantId }) — ร้านอื่นเห็น 0
// dispatchWebhooks(evt, deps?) : หา endpoint active ของ tenant ที่ subscribe event → POST + ลายเซ็น
//   สำเร็จ(2xx) → WebhookDelivery OK · ล้ม → FAILED + lastError (เก็บแล้วไปต่อ — ห้ามโยนออก)
// retryFailedWebhooks(deps?) : หยิบ FAILED ที่ attempts < 5 **และถึงรอบถัดไปแล้ว** ยิงซ้ำ · สำเร็จ→OK · ล้ม→attempts+1
//
// 🔴 AUDIT M1 (ตรวจรับ 16 ก.ย.): ปลายทางภายใน/loopback/link-local/metadata ถูกปฏิเสธทั้งตอนสร้างและตอนส่ง
//    (`webhookTargetProblem`) · ลายเซ็นมี timestamp (`X-Shark-Signature-V2`) กันยิงซ้ำ · retry มี backoff ต่อใบ

import { randomBytes, createHmac } from "node:crypto";
import { isIP } from "node:net";
import type { Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";

export type Ctx = { tenantId: string };
export type WebhookEvent = { tenantId: string; type: string; payload: unknown };
/** แปลงชื่อโฮสต์เป็น IP — ฉีดได้ (ข้อสอบ/ผู้เรียกที่ไม่อยากแตะ DNS จริง) · คืน null = แปลงไม่ได้ */
export type HostLookup = (hostname: string) => Promise<string | string[] | null>;
export type WebhookDeps = {
  fetchFn?: typeof fetch;
  /** ชื่อเดียวกับ global (M3.10 · ข้อสอบ/ผู้เรียกที่ส่ง `{ fetch }` มาตรง ๆ) — มี `fetchFn` ด้วย = ใช้ `fetchFn` */
  fetch?: typeof fetch;
  /** 🔴 AUDIT M1: ตัวแปลงชื่อโฮสต์ของด่านกัน SSRF (ไม่ส่ง = ใช้ DNS ของเครื่อง) */
  lookup?: HostLookup;
};

/** ตัวยิงที่ใช้จริง: `fetchFn` → `fetch` ที่ฉีดมา → global fetch */
const fetchOf = (deps?: WebhookDeps): typeof fetch => deps?.fetchFn ?? deps?.fetch ?? fetch;

const TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 5;
const DNS_TIMEOUT_MS = 1500;

// ── 🔴 AUDIT M1: ด่านกัน SSRF (ปลายทางภายใน) ─────────────────────────────
//
// ปลายทาง webhook มาจากผู้ใช้ ⇒ ใครก็ตั้งเป็น `http://169.254.169.254/…` (metadata ของคลาวด์) หรือ
// `http://10.0.0.5/admin` แล้วให้เซิร์ฟเวอร์ของเรายิงแทน (SSRF) · ตรวจ **ทั้งตอนสร้างและตอนส่ง**
// เพราะ endpoint ที่สร้างไว้ก่อนด่านนี้มี และชื่อโฮสต์เปลี่ยน IP ทีหลังได้ (DNS rebinding)
//
// ช่องทดสอบเดียวที่เปิดได้: `WEBHOOK_ALLOW_PRIVATE=1` **และ** ไม่ใช่ production
// (ชุดข้อสอบยิงไปที่ 127.0.0.1 — ตั้ง env นี้เอง · บน prod ต่อให้ env หลุดไปก็ไม่เปิด)

const PRIVATE_HOST_TH =
  "ที่อยู่ปลายทางนี้ชี้ไปยังเครื่องภายในเครือข่าย จึงส่งข้อมูลออกไปไม่ได้ — ใช้ที่อยู่สาธารณะของระบบปลายทาง";

function privateTargetsAllowed(): boolean {
  return process.env.WEBHOOK_ALLOW_PRIVATE === "1" && process.env.APP_ENV !== "production";
}

/** IP นี้อยู่ในเครือข่ายภายใน/loopback/link-local/metadata ไหม (v4 + v6) */
function isPrivateAddress(raw: string): boolean {
  const ip = raw.trim().toLowerCase();
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map((n) => Number(n));
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true; // อ่านไม่ออก = บล็อกไว้ก่อน
    const [a, b] = [p[0]!, p[1]!];
    if (a === 0 || a === 10 || a === 127) return true; // 0/8 · 10/8 · loopback
    if (a === 169 && b === 254) return true; // link-local + metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (v === 6) {
    const mapped = ip.replace(/^::ffff:/, "");
    if (isIP(mapped) === 4) return isPrivateAddress(mapped); // ::ffff:127.0.0.1
    if (ip === "::1" || ip === "::") return true;
    const head = ip.split(":")[0] ?? "";
    if (/^f[cd]/.test(head)) return true; // fc00::/7 (unique local)
    if (/^fe[89ab]/.test(head)) return true; // fe80::/10 (link-local)
    return false;
  }
  return false;
}

/** ชื่อโฮสต์ที่แปลว่า "เครื่องนี้" โดยไม่ต้องถาม DNS */
function isLocalHostname(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "";
}

async function resolveHost(host: string, deps?: WebhookDeps): Promise<string[] | null> {
  try {
    if (deps?.lookup) {
      const r = await deps.lookup(host);
      return r === null || r === undefined ? null : Array.isArray(r) ? r : [r];
    }
    const dns = await import("node:dns/promises");
    const res = await Promise.race([
      dns.lookup(host, { all: true }),
      new Promise<null>((r) => setTimeout(() => r(null), DNS_TIMEOUT_MS)),
    ]);
    return res === null ? null : res.map((a) => a.address);
  } catch {
    return null;
  }
}

/**
 * ตรวจปลายทางก่อนยิง — คืน `null` = ผ่าน · คืนข้อความไทย = ห้ามส่ง (เหตุผลที่บันทึกลง delivery)
 * 🔴 แปลงชื่อไม่ได้ = ไม่บล็อก: ยิงไปก็ไม่ถึงอยู่ดี และเครื่องที่ไม่มี DNS (คอนเทนเนอร์ QC/CI) ต้องยังใช้งานได้
 */
export async function webhookTargetProblem(url: string, deps?: WebhookDeps): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "ที่อยู่ปลายทางยังไม่ถูกต้อง — ใส่ลิงก์เต็มที่ขึ้นต้นด้วย https://";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return "ที่อยู่ปลายทางต้องขึ้นต้นด้วย http:// หรือ https://";
  }
  if (privateTargetsAllowed()) return null;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(host)) return isPrivateAddress(host) ? PRIVATE_HOST_TH : null;
  if (isLocalHostname(host)) return PRIVATE_HOST_TH;
  const addrs = await resolveHost(host, deps);
  if (addrs === null) return deps?.lookup ? PRIVATE_HOST_TH : null;
  return addrs.some(isPrivateAddress) ? PRIVATE_HOST_TH : null;
}

/**
 * 🔴 AUDIT M1: รอบถัดไปของใบที่ล้มมาถึงหรือยัง (backoff แบบทวีคูณต่อใบ — ไม่มีคอลัมน์ใหม่:
 * คำนวณจาก `attempts` + `updatedAt` ที่มีอยู่แล้ว) · เดิมยิงซ้ำรวดเดียว 5 ครั้งทุกครั้งที่ cron วิ่ง
 * ⇒ ปลายทางที่ล่มโดนถล่มซ้ำทุกนาที
 */
const BACKOFF_MIN = [2, 5, 15, 60, 180];
export function retryDueAt(row: { attempts: number; updatedAt: Date }): Date {
  const idx = Math.min(Math.max(row.attempts, 1), BACKOFF_MIN.length) - 1;
  return new Date(row.updatedAt.getTime() + BACKOFF_MIN[idx]! * 60_000);
}

// อ่าน events จาก eventsJson แบบปลอดภัย (ไม่ใช่ array/มีค่าไม่ใช่ string → กรองทิ้ง)
const eventsOf = (eventsJson: unknown): string[] =>
  Array.isArray(eventsJson) ? eventsJson.filter((x): x is string => typeof x === "string") : [];

// ── CRUD ปลายทาง (tenant-scoped) ──────────────────────────────────────────

// สร้าง endpoint — url ต้อง http(s) เท่านั้น · secret สุ่มให้ (48 hex ≥24) · events ว่าง = ทุก event
export async function createEndpoint(
  ctx: Ctx,
  input: { url: string; events?: string[] },
  deps?: WebhookDeps,
): Promise<{ id: string; secret: string }> {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("ที่อยู่ปลายทางต้องขึ้นต้นด้วย http:// หรือ https://");
  }
  // 🔴 AUDIT M1: กัน SSRF ตั้งแต่ตอนสมัครปลายทาง (ตรวจซ้ำอีกครั้งตอนส่งจริง)
  const problem = await webhookTargetProblem(url, deps);
  if (problem) throw new Error(problem);
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

/**
 * แก้รายการเหตุการณ์ที่ปลายทางนี้รับ — **โดยไม่แตะ secret**
 *
 * 🔴 ก่อนหน้านี้หน้าตั้งค่ามีแต่ "เพิ่ม/ลบ" ⇒ ร้านที่อยากรับ event ใหม่เพิ่มต้องลบทิ้งแล้วสร้างใหม่
 *    ซึ่ง**สุ่ม secret ใหม่** ⇒ ระบบปลายทางที่ยังถือรหัสเดิมจะตรวจลายเซ็นไม่ผ่านทุกใบทันที
 *    (เจ้าของเจอเองตอนต้องเพิ่ม `chat.conversation.read` — 30 ส.ค. 2026)
 * รายการว่าง = รับทุกเหตุการณ์ (กติกาเดียวกับตอนสร้าง · ดู dispatchWebhooks)
 */
export async function setEndpointEvents(ctx: Ctx, id: string, events: string[]) {
  const clean = events.filter((e) => typeof e === "string" && e.trim() !== "");
  return tenantDb(ctx).webhookEndpoint.update({
    where: { id },
    data: { eventsJson: clean as Prisma.InputJsonValue },
  });
}

// ลบ endpoint (deliveries ผูก onDelete: Cascade → หายตาม)
export async function deleteEndpoint(ctx: Ctx, id: string): Promise<void> {
  await tenantDb(ctx).webhookEndpoint.delete({ where: { id } });
}

/** endpoint เดียวของร้านนี้ (ทวนสิทธิ์เจ้าของก่อนแก้/ลบ/ทดสอบ — REST WO D4 ไม่ผ่าน session) */
export async function getEndpoint(ctx: Ctx, id: string) {
  return tenantDb(ctx).webhookEndpoint.findFirst({ where: { id } });
}

// รายการการส่งล่าสุด (สำหรับตารางในหน้า UI) — ระบุ `endpointId` เพื่อจำกัดเฉพาะปลายทางเดียว (REST WO D4)
export async function listDeliveries(ctx: Ctx, limit = 20, endpointId?: string) {
  return tenantDb(ctx).webhookDelivery.findMany({
    where: endpointId ? { endpointId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { endpoint: { select: { url: true } } },
  });
}

// ── ยิงจริง ───────────────────────────────────────────────────────────────

/**
 * POST body ไป url พร้อมลายเซ็น · คืน null = สำเร็จ · คืน string = ข้อความ error (ไม่โยน)
 *
 * 🔴 AUDIT M1 ลายเซ็นสองชั้น:
 *   `X-Shark-Signature`    = hmac(secret, body)                — ของเดิม คงไว้เพื่อความเข้ากันได้
 *   `X-Shark-Timestamp`    = วินาที unix ตอนยิง
 *   `X-Shark-Signature-V2` = hmac(secret, `${timestamp}.${body}`) — ปลายทางเทียบเวลาได้ ⇒ กันยิงซ้ำ (replay)
 * 🔴 ตรวจปลายทางอีกครั้งก่อนยิงทุกใบ (endpoint เก่า/ชื่อโฮสต์ที่เพิ่งเปลี่ยน IP)
 */
async function deliver(
  url: string,
  body: string,
  secret: string,
  eventType: string,
  fetchFn: typeof fetch,
  deps?: WebhookDeps,
): Promise<string | null> {
  const problem = await webhookTargetProblem(url, deps);
  if (problem) return problem;
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  const signatureV2 = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Shark-Signature": signature,
        "X-Shark-Timestamp": ts,
        "X-Shark-Signature-V2": signatureV2,
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

/**
 * ทดสอบ endpoint เดียว (ปุ่ม "ทดสอบ" ของหน้าตั้งค่า / REST `webhooks.test`) — ยิงตรงเจาะจงปลายทางนั้น
 * ด้วย event ที่เลือก โดย**ไม่ผ่านตัวกรอง subscribe** ของ `dispatchWebhooks` (จงใจ: อยากรู้ว่าปลายทาง
 * รับได้จริงไหม ไม่ใช่ทดสอบว่าสมัคร event นั้นไว้หรือเปล่า) — บันทึก WebhookDelivery เหมือนของจริงทุกอย่าง
 */
export async function testEndpoint(
  ctx: Ctx,
  id: string,
  eventType: string,
  deps?: WebhookDeps,
): Promise<{ delivered: boolean; error: string | null }> {
  const fetchFn = fetchOf(deps);
  const ep = await tenantDb(ctx).webhookEndpoint.findFirst({ where: { id } });
  if (!ep) throw new Error("ไม่พบปลายทางนี้");
  const payload = { test: true, message: "ทดสอบการส่งจากหน้าตั้งค่า Webhooks" };
  const body = JSON.stringify({ type: eventType, payload, sentAt: new Date().toISOString() });
  const err = await deliver(ep.url, body, ep.secret, eventType, fetchFn, deps);
  await tenantDb(ctx).webhookDelivery.create({
    data: {
      tenantId: ctx.tenantId,
      endpointId: ep.id,
      eventType,
      payloadJson: payload as Prisma.InputJsonValue,
      status: err === null ? "OK" : "FAILED",
      attempts: 1,
      lastError: err ?? null,
    },
  });
  return { delivered: err === null, error: err };
}

// กระจาย event ไปทุก endpoint ที่ subscribe → บันทึก WebhookDelivery · คืนจำนวนที่สำเร็จ
// kernel-level: เรียกจาก outbox (ไม่มี session) → prisma ตรง + กรอง tenantId เอง
export async function dispatchWebhooks(evt: WebhookEvent, deps?: WebhookDeps): Promise<number> {
  const fetchFn = fetchOf(deps);
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
    const err = await deliver(ep.url, body, ep.secret, evt.type, fetchFn, deps);
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
// 🔴 AUDIT M1: ข้ามใบที่ยังไม่ถึงรอบถัดไป (backoff ต่อใบ — ดู `retryDueAt`)
export async function retryFailedWebhooks(deps?: WebhookDeps): Promise<number> {
  const fetchFn = fetchOf(deps);
  const now = Date.now();
  const rows = await prisma.webhookDelivery.findMany({
    where: { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } },
    include: { endpoint: true },
  });
  const failed = rows.filter((d) => retryDueAt(d).getTime() <= now);
  let ok = 0;
  for (const d of failed) {
    const body = JSON.stringify({ type: d.eventType, payload: d.payloadJson, sentAt: new Date().toISOString() });
    const err = await deliver(d.endpoint.url, body, d.endpoint.secret, d.eventType, fetchFn, deps);
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
