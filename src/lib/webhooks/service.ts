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

import { randomBytes, createHmac, createHash } from "node:crypto";
import { isIP } from "node:net";
import type { LookupAddress } from "node:dns";
import type { Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { privateTargetsAllowed } from "./private-targets";
import { WEBHOOK_EVENTS, WEBHOOK_GUARDED_FAMILIES, type WebhookGuardedFamily } from "./labels"; // CRM C5.5-fix3b ▸ F4 · r2 RV-5 ◂

export type Ctx = { tenantId: string };
/**
 * `id` = OutboxEvent.id (C5.4 · L3-M3) — ไปอยู่ใน body `id` + หัว `X-Shark-Event-Id` ของทุกการส่ง (รวมการยิงซ้ำ)
 * ⇒ ปลายทางกันซ้ำได้ (การส่งเป็นแบบ at-least-once) · ไม่ส่ง (ผู้เรียกนอกคิว) = ระบบสุ่มให้ต่อการส่งครั้งนั้น
 */
export type WebhookEvent = { tenantId: string; type: string; payload: unknown; id?: string | null };
/** แปลงชื่อโฮสต์เป็น IP — ฉีดได้ (ข้อสอบ/ผู้เรียกที่ไม่อยากแตะ DNS จริง) · คืน null = แปลงไม่ได้ */
export type HostLookup = (hostname: string) => Promise<string | string[] | null>;
export type WebhookDeps = {
  fetchFn?: typeof fetch;
  /** ชื่อเดียวกับ global (M3.10 · ข้อสอบ/ผู้เรียกที่ส่ง `{ fetch }` มาตรง ๆ) — มี `fetchFn` ด้วย = ใช้ `fetchFn` */
  fetch?: typeof fetch;
  /** 🔴 AUDIT M1: ตัวแปลงชื่อโฮสต์ของด่านกัน SSRF (ไม่ส่ง = ใช้ DNS ของเครื่อง) */
  lookup?: HostLookup;
  /**
   * C5.4 (L4-M2) — บังคับให้ใช้ตัวส่งแบบ "ตรึง IP" แม้อยู่ในโหมด development (ข้อสอบที่อยากวัดตัวส่งจริง) ·
   * ไม่ส่ง = ตามสภาพแวดล้อม (ดู `useGlobalFetchTransport`)
   */
  transport?: "pinned";
};


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

// C4.4-fix I3 ▸ สวิตช์ย้ายไป `./private-targets` (ไฟล์บริสุทธิ์) — ตัวตรวจที่อยู่ของ CRM ใช้สวิตช์เดียวกัน · พฤติกรรมเดิมทุกตัวอักษร ◂

/** IPv4 นี้อยู่ในเครือข่ายภายใน/loopback/link-local/metadata/สงวนไหม */
function isPrivateV4(p: readonly number[]): boolean {
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // อ่านไม่ออก = บล็อกไว้ก่อน
  const [a, b, c] = [p[0]!, p[1]!, p[2]!];
  if (a === 0 || a === 10 || a === 127) return true; // 0/8 · 10/8 · loopback
  if (a === 169 && b === 254) return true; // link-local + metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10 (รวม metadata 100.100.100.200 ของบางคลาวด์)
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0/24 (IETF protocol assignments — มี metadata ของบางคลาวด์)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 (benchmark — ใช้เป็นเครือข่ายภายในได้)
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

/**
 * IPv6 → 16 ไบต์ (รองรับ `::` · ส่วนท้ายเป็น a.b.c.d · zone `%eth0`) · อ่านไม่ออก = null
 * 🔴 C5.4 (L4-M2): WHATWG URL เขียน `[::ffff:127.0.0.1]` ใหม่เป็น `[::ffff:7f00:1]` (ฐาน 16) ⇒ ตัวตรวจเดิมที่ลอก `::ffff:`
 *    แล้วรอ a.b.c.d ปล่อยผ่านว่า "สาธารณะ" · ต้องแปลงเป็นไบต์แล้วตัดสินจากบิต ไม่ใช่จากรูปตัวอักษร
 */
function ipv6Bytes(raw: string): number[] | null {
  let s = raw.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  const quad = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (quad) {
    const q = quad.slice(2, 6).map(Number);
    if (q.some((n) => n > 255)) return null;
    s = `${quad[1]}${((q[0]! << 8) | q[1]!).toString(16)}:${((q[2]! << 8) | q[3]!).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? fill !== 0 : fill < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.flatMap((g) => {
    const n = parseInt(g, 16);
    return [n >> 8, n & 0xff];
  });
}

/** IPv6 นี้ชี้เข้าเครือข่ายภายในไหม — รวมรูปที่ฝัง IPv4 ไว้ข้างใน (mapped · compatible · NAT64 · 6to4) */
function isPrivateV6(b: readonly number[]): boolean {
  const zero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  const v4At = (i: number) => isPrivateV4(b.slice(i, i + 4));
  if (zero(0, 10) && b[10] === 0xff && b[11] === 0xff) return v4At(12); // ::ffff:a.b.c.d (IPv4-mapped)
  if (zero(0, 12)) return v4At(12); // ::a.b.c.d (IPv4-compatible) · :: · ::1 (→ 0.0.0.x = บล็อก)
  if (zero(0, 8) && b[8] === 0xff && b[9] === 0xff && zero(10, 12)) return v4At(12); // ::ffff:0:a.b.c.d (IPv4-translated)
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    if (zero(4, 12)) return v4At(12); // 64:ff9b::/96 NAT64 ที่รู้จักกันทั่วไป
    return true; // 64:ff9b:1::/48 NAT64 ภายในองค์กร
  }
  if (b[0] === 0x20 && b[1] === 0x02) return v4At(2); // 2002::/16 6to4
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return true; // 2001::/32 Teredo (IPv4 ถูกพรางไว้)
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // 2001:db8::/32 (เอกสาร)
  if (b[0] === 0x01 && b[1] === 0x00 && zero(2, 8)) return true; // 100::/64 discard
  if ((b[0]! & 0xfe) === 0xfc) return true; // fc00::/7 unique local (รวม metadata fd00:ec2::254)
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0xc0) return true; // fec0::/10 site-local (เลิกใช้แล้วแต่ยัง route ภายในได้)
  if (b[0] === 0xff) return true; // multicast
  return false;
}

/** IP นี้อยู่ในเครือข่ายภายใน/loopback/link-local/metadata ไหม (v4 + v6 ทุกรูปที่ฝัง v4) · อ่านไม่ออก = บล็อก */
export function isPrivateAddress(raw: string): boolean {
  const ip = raw.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const v = isIP(ip);
  if (v === 4) return isPrivateV4(ip.split(".").map((n) => Number(n)));
  if (v === 6) {
    const bytes = ipv6Bytes(ip);
    return bytes === null ? true : isPrivateV6(bytes);
  }
  return true; // ไม่ใช่ IP ที่อ่านออก = ไม่ให้ผ่านในฐานะ "ที่อยู่สาธารณะ"
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
    return res === null || res.length === 0 ? null : res.map((a) => a.address);
  } catch {
    return null;
  }
}

const UNRESOLVED_TH =
  "หาที่อยู่ของโดเมนปลายทางไม่พบ (DNS ไม่ตอบ) จึงยังส่งข้อมูลไปไม่ได้ — ตรวจชื่อโดเมนให้ถูกต้องแล้วลองใหม่";

/**
 * ตรวจปลายทาง — คืน `null` = ผ่าน · ข้อความไทย = ห้ามส่ง
 * `unresolved`:
 *   - "block" (ค่าปริยาย · ฟังก์ชันที่ export `webhookTargetProblem`): แปลงชื่อไม่ได้/ช้าเกิน = **ไม่ผ่าน**
 *     (C5.4 · L4-M2: เดิมถือว่า "ผ่าน" ⇒ DNS ของผู้โจมตีตอบช้าครั้งแรกแล้วตอบ 127.0.0.1 ตอน fetch ถามเอง = ทะลุด่าน)
 *   - "defer": ใช้ **เฉพาะ** จุดที่การเชื่อมต่อจริงผ่านตัวส่งแบบตรึง IP (`outboundFetch`) ซึ่งแปลงชื่อ + ตรวจ IP อีกครั้ง
 *     ตอนต่อ socket และปิดทางเมื่อแปลงไม่ได้ (fail closed ที่ชั้นเชื่อมต่อ) และตอนสมัครปลายทาง (สมัครโดเมนที่ DNS ยังไม่
 *     กระจายได้ — ทุกการส่งตรวจซ้ำ) · ที่อยู่ภายใน/IP ตรง ๆ/ชื่อที่แปลงแล้วได้ IP ภายใน ยังถูกบล็อกทันทีเหมือนเดิม
 */
async function targetProblem(url: string, deps: WebhookDeps | undefined, unresolved: "block" | "defer"): Promise<string | null> {
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
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isIP(host)) return isPrivateAddress(host) ? PRIVATE_HOST_TH : null;
  if (isLocalHostname(host)) return PRIVATE_HOST_TH;
  const addrs = await resolveHost(host, deps);
  if (addrs === null) {
    // ตัวแปลงชื่อที่ถูกฉีดมาตอบ null = ผู้เรียกบอกเองว่า "ไม่รู้จัก" ⇒ บล็อกเสมอ (สัญญา AUDIT M1 เดิม)
    if (deps?.lookup || unresolved === "block") return deps?.lookup ? PRIVATE_HOST_TH : UNRESOLVED_TH;
    return null;
  }
  return addrs.some(isPrivateAddress) ? PRIVATE_HOST_TH : null;
}

/**
 * ตรวจปลายทางก่อนยิง — คืน `null` = ผ่าน · คืนข้อความไทย = ห้ามส่ง (เหตุผลที่บันทึกลง delivery)
 * 🔴 C5.4 (L4-M2): แปลงชื่อไม่ได้ = **ไม่ผ่าน** (fail closed) · IPv6 ทุกรูปที่ฝัง IPv4 ภายใน = บล็อก
 */
export async function webhookTargetProblem(url: string, deps?: WebhookDeps): Promise<string | null> {
  return targetProblem(url, deps, "block");
}

/**
 * ด่านตอน **สมัคร/บันทึก** ปลายทาง (webhook ของร้าน · URL ในกฎอัตโนมัติ) — ต่างจาก `webhookTargetProblem` ข้อเดียว:
 * โดเมนที่ DNS ยังแปลงไม่ได้ **บันทึกได้** (โดเมนใหม่ที่ยังไม่กระจาย) เพราะทุกการส่งผ่าน `outboundFetch` ซึ่งตรวจซ้ำ
 * ตอนต่อจริงและปิดทางถ้าแปลงไม่ได้/ได้ IP ภายใน · ที่อยู่ภายในที่รู้ได้ตอนนี้ยังถูกปฏิเสธทันที
 */
export async function webhookSaveProblem(url: string, deps?: WebhookDeps): Promise<string | null> {
  return targetProblem(url, deps, "defer");
}

// ── C5.4 (L4-M2): ตัวส่งออกที่ปลอดภัย — ทางเดียวที่โค้ดแพลตฟอร์มใช้ยิงไปยัง URL ที่ผู้ใช้/คนนอกกำหนด ─────────
//
// 1) ตรวจปลายทาง (`targetProblem`, โหมด defer) · 2) ไม่ตามการเปลี่ยนเส้นทาง (3xx = คำตอบสุดท้าย ผู้เรียกถือว่าล้ม)
// 3) **ตรึง IP**: แปลงชื่อครั้งเดียวตอนต่อ socket (lookup ของเราเอง) ตรวจทุก IP ที่ได้ แล้วต่อไปที่ IP ที่ตรวจแล้วนั้นเลย
//    ⇒ ปิดช่อง DNS rebinding (ตรวจกับใช้คนละรอบ) และ DNS ที่ตอบช้า/ไม่ตอบ (แปลงไม่ได้ = ต่อไม่ได้) · TLS ยังตรวจ
//    ใบรับรองกับชื่อโดเมนเดิม (SNI = hostname) เพราะเราเปลี่ยนแค่ขั้นแปลงชื่อ ไม่ได้เปลี่ยน URL
//
// ตัวส่ง: ผู้เรียกฉีด `fetch` มา = ใช้ตัวนั้น (ข้อสอบ) · APP_ENV development/test = global `fetch` (ชุดข้อสอบเดิมดักด้วยการแทน
// globalThis.fetch — ไม่มีการต่อเครือข่ายจริง) · นอกนั้น (production · preview ที่ไม่ตั้ง APP_ENV) = ตัวส่งตรึง IP เสมอ

export type OutboundInit = {
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  /** เพดานขนาดคำตอบที่อ่านเก็บ (เกิน = ล้ม) · ไม่ส่ง = 1 MB */
  maxBytes?: number;
};

export class OutboundBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundBlockedError";
  }
}

function useGlobalFetchTransport(): boolean {
  const env = process.env.APP_ENV;
  return env === "development" || env === "test";
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** lookup ของ socket: แปลงชื่อครั้งเดียว · IP ใดเป็นภายใน = ปฏิเสธทั้งชื่อ · ได้ว่าง/ล้ม = ปฏิเสธ (fail closed) */
function pinnedLookup(hostname: string, options: { all?: boolean } | number, cb: LookupCb): void {
  void (async () => {
    try {
      const dns = await import("node:dns");
      dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
        if (err) return cb(err, "");
        const list = (addrs ?? []).filter((a) => a.family === 4 || a.family === 6);
        if (list.length === 0) return cb(Object.assign(new Error(UNRESOLVED_TH), { code: "ENOTFOUND" }), "");
        if (!privateTargetsAllowed() && list.some((a) => isPrivateAddress(a.address))) {
          return cb(Object.assign(new Error(PRIVATE_HOST_TH), { code: "EPRIVATETARGET" }), "");
        }
        const first = list[0]!;
        if (typeof options === "object" && options?.all) return cb(null, [first]);
        return cb(null, first.address, first.family);
      });
    } catch (e) {
      cb(e as NodeJS.ErrnoException, "");
    }
  })();
}

/** POST/GET ผ่าน node:http(s) ที่ต่อไปยัง IP ที่ตรวจแล้วเท่านั้น (ไม่ตาม redirect เพราะ node:http ไม่ตามเองอยู่แล้ว) */
export async function pinnedFetch(url: string, init: OutboundInit): Promise<Response> {
  const u = new URL(url);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !privateTargetsAllowed() && isPrivateAddress(host)) throw new OutboundBlockedError(PRIVATE_HOST_TH);
  const mod = u.protocol === "https:" ? await import("node:https") : await import("node:http");
  const maxBytes = init.maxBytes ?? 1_048_576;
  return new Promise<Response>((resolve, reject) => {
    const req = mod.request(
      u,
      {
        method: init.method,
        headers: { ...(init.headers ?? {}), ...(init.body !== undefined ? { "content-length": String(Buffer.byteLength(init.body)) } : {}) },
        lookup: pinnedLookup as never,
        agent: false,
        signal: AbortSignal.timeout(init.timeoutMs),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy(new Error("คำตอบจากปลายทางใหญ่เกินกำหนด"));
            return;
          }
          chunks.push(c);
        });
        res.on("error", reject);
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          const headers = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
          }
          const noBody = status === 204 || status === 205 || status === 304;
          const safeStatus = status >= 200 && status <= 599 ? status : 502;
          resolve(new Response(noBody ? null : Buffer.concat(chunks), { status: safeStatus, headers }));
        });
      },
    );
    req.on("error", (e) => reject((e as { code?: string }).code === "EPRIVATETARGET" ? new OutboundBlockedError(PRIVATE_HOST_TH) : e));
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

/**
 * ยิงไปยัง URL ที่ผู้ใช้/คนนอกกำหนด (webhook · กฎอัตโนมัติ · ไฟล์แนบจากลิงก์ของผู้ให้บริการ) — ห้ามยิง fetch ตรง ๆ
 * โยน `OutboundBlockedError` (ข้อความไทย) เมื่อปลายทางเป็นเครือข่ายภายใน · 3xx คืนเป็น Response ตามจริง (ไม่ตาม) ให้ผู้เรียกถือว่าล้ม
 */
export async function outboundFetch(url: string, init: OutboundInit, deps?: WebhookDeps): Promise<Response> {
  const problem = await targetProblem(url, deps, "defer");
  if (problem) throw new OutboundBlockedError(problem);
  const injected = deps?.fetchFn ?? deps?.fetch;
  if (injected || (useGlobalFetchTransport() && deps?.transport !== "pinned")) {
    const f = injected ?? fetch;
    return f(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      redirect: "manual",
      signal: AbortSignal.timeout(init.timeoutMs),
    });
  }
  return pinnedFetch(url, init);
}

/**
 * 3xx = ปลายทาง **รับคำขอแล้ว** และสั่งให้ไปอ่านผลที่อื่น (เช่น Google Apps Script `/exec` ตอบ 302 หลัง doPost ทำงานแล้ว)
 * มติผู้คุมงาน C5.4 รอบ 2: ถือว่า **ส่งถึง** (ไม่ลองซ้ำ = ไม่เกิดรายการซ้ำ) แต่ **ไม่ตาม** ที่อยู่ใหม่ (อาจเป็นเครือข่ายภายใน —
 * SSRF) และแนบคำเตือนไทยไว้ที่บันทึกการส่ง · คืน null = ไม่ใช่ 3xx
 */
export function redirectWarning(status: number): string | null {
  return status >= 300 && status < 400
    ? `ส่งถึงแล้ว แต่ปลายทางตอบรหัส ${status} (ให้ไปที่อยู่อื่น) — ระบบไม่ตามการเปลี่ยนที่อยู่ ถ้าระบบปลายทางต้องการ ให้ใส่ที่อยู่สุดท้ายแทน`
    : null;
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

// ── CRM C5.5 ▸ (fix1 r2 · มติผู้คุมงานข้อ 5) จุดเดียวที่ทุกประตูเขียนปลายทาง webhook ต้องผ่าน ─────────────────────────────────
//   ตัวเขียน 3 ตัว (`createEndpoint` · `setEndpointActive` ตอนเปิด (ตรวจ event ที่บันทึกไว้) · `setEndpointEvents`) รับ "ผู้ทำ" (`by`) เป็นพารามิเตอร์
//   บังคับในชนิด ⇒ tsc ชี้ทุกประตู (หน้า CRM · หน้า webhook กลาง · สมาชิก UI/REST · บัญชี UI/REST) · ข้างในรัน "ตัวกันเหตุการณ์" ที่โมดูลลงทะเบียน
//   (CRM: เหตุการณ์ CRM / ทุกเหตุการณ์ ต้องผ่านกติกา "เห็นข้อมูล CRM ทั้งร้าน") — ลงทะเบียนที่ composition root `src/lib/webhook-guards.ts`
//   (แพลตฟอร์มไม่ import โมดูล CRM เอง · RV-8) · ร้านที่ไม่มี CRM v2 = ตัวกันคืน null ⇒ เหมือนเดิมทุกอย่าง
//   ผู้เรียกที่ไม่มีชนิด (สคริปต์/ข้อสอบเก่าที่เรียกบริการตรง) ไม่ส่ง `by` ⇒ ไม่ตรวจ (โค้ดใน src/ ส่งเสมอ — tsc บังคับ)
export type WebhookAuthorActor = { userId: string; role: string; unitAccess: string[]; permissions: Record<string, unknown> };
/** ผู้ทำ: actor ของ session · ผู้ใช้ (อ่าน Membership ใหม่) · คีย์ API (ผู้สร้างคีย์ — แบบเดียวกับ key-guard ของ CRM C5.4-B) */
export type WebhookAuthor = { actor: WebhookAuthorActor } | { userId: string | null } | { apiKeyId: string | null };
export type WebhookEventGuard = (tenantId: string, author: WebhookAuthorActor | null, events: readonly string[]) => Promise<string | null>;
const EVENT_GUARDS = new Map<string, WebhookEventGuard>();
/**
 * โมดูลลงทะเบียนตัวกันเหตุการณ์ของตัวเอง (ชื่อซ้ำ = แทนที่) — คืน null = ผ่าน · ข้อความไทย = ปฏิเสธ
 * CRM C5.5 ▸ (fix3b · F4) ชื่อ = ครอบครัวเหตุการณ์ที่ตัวกันนี้รับผิดชอบ (`WEBHOOK_GUARDED_FAMILIES` ใน ./labels) — บริการปฏิเสธปลายทางที่แตะ
 *   ครอบครัวที่ "ไม่มีตัวกันในชื่อนั้น" แม้ตัวกันของครอบครัวอื่นจะลงทะเบียนอยู่ (เดิมปิดเฉพาะตอนทะเบียนว่างทั้งหมด) ◂
 */
export function registerWebhookEventGuard(family: WebhookGuardedFamily, guard: WebhookEventGuard): void {
  EVENT_GUARDS.set(family, guard);
}
/** ปฏิเสธโดยตัวกันเหตุการณ์ (403 ข้อความไทย — `mapError` ของ REST แปลงเป็น 403 forbidden) */
export class WebhookGuardError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "WebhookGuardError";
  }
}
async function membershipActor(tenantId: string, userId: string | null | undefined): Promise<WebhookAuthorActor | null> {
  if (!userId) return null;
  const m = await prisma.membership.findFirst({ where: { tenantId, userId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!m) return null;
  return {
    userId,
    role: m.role,
    unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as string[]) : [],
    permissions: (m.permissions && typeof m.permissions === "object" && !Array.isArray(m.permissions) ? m.permissions : {}) as Record<string, unknown>,
  };
}
async function authorActor(tenantId: string, by: WebhookAuthor): Promise<WebhookAuthorActor | null> {
  if ("actor" in by) return by.actor;
  if ("userId" in by) return membershipActor(tenantId, by.userId);
  if (!by.apiKeyId) return null;
  const key = await prisma.apiKey.findFirst({ where: { id: by.apiKeyId, tenantId }, select: { createdById: true } });
  return membershipActor(tenantId, key?.createdById ?? null);
}
/** ผู้ทำของคำขอ REST (คีย์ = ผู้สร้างคีย์ · คนกดยืนยันข้อเสนอ = ตัวเขา) */
export function webhookAuthorOfApi(actor: { kind: string; keyId?: string; userId?: string | null }): WebhookAuthor {
  return actor.kind === "apikey" ? { apiKeyId: actor.keyId ?? null } : { userId: actor.userId ?? null };
}
// CRM C5.5 ▸ (fix3a · R2-2 → fix3b · F4) ตัวกันของครอบครัวที่ปลายทางแตะ "ไม่อยู่ในทะเบียน" หลังโหลด composition root = root ถูกแก้/ย้ายจน
//   ไม่ลงทะเบียนครอบครัวนั้น (สภาพผิดปกติเสมอ — ทุกเส้นทางที่มี `by` ผ่านบรรทัด import ด้านล่างก่อน ไม่ว่าคำขอจะมาจาก route / server action /
//   REST / ข้อเสนอ AI / สคริปต์) ⇒ ปิด (fail closed) **ต่อครอบครัว** — เดิม (fix3a) ปิดเฉพาะตอนทะเบียนว่างทั้งหมด ⇒ ถ้า root ลงทะเบียนตัวกันของ
//   โมดูลอื่นไว้แต่ตัวกัน CRM หาย ปลายทาง CRM / ทุกเหตุการณ์ ผ่านโดยไม่มีใครตรวจ · ตัดสินจากชื่อเหตุการณ์ล้วน (ไม่ import โมดูล CRM · RV-8)
//   ปลายทางที่รับเฉพาะเหตุการณ์นอกทุกครอบครัว (สมาชิก · บัญชี · …) ผ่านตามเดิม · ผู้เรียกที่ไม่มี `by` (สคริปต์/ข้อสอบเก่า) ไม่ตรวจเหมือนเดิม ◂
export const WEBHOOK_GUARDS_MISSING = "ระบบตรวจสิทธิ์เหตุการณ์ของ webhook ยังไม่พร้อม — ยังสมัครรับเหตุการณ์ CRM หรือทุกเหตุการณ์ไม่ได้ ลองใหม่ภายหลังหรือแจ้งผู้ดูแลระบบ";
/** คำนำหน้าของทุกครอบครัวที่ต้องมีตัวกัน (มาจาก `WEBHOOK_GUARDED_FAMILIES` — ไม่ใช่สำเนา) · คงชื่อเดิมไว้ให้ผู้อ่านเดิม (probe-cf3 R22) */
export const WEBHOOK_GUARDED_EVENT_PREFIXES: readonly string[] = Object.values(WEBHOOK_GUARDED_FAMILIES).flat();
const GUARDED_FAMILY_NAMES = Object.keys(WEBHOOK_GUARDED_FAMILIES) as WebhookGuardedFamily[];
/** ครอบครัวที่ปลายทางนี้แตะ: รายการว่าง (= ทุกเหตุการณ์) ⇒ ทุกครอบครัว · ไม่งั้นครอบครัวที่มีคำนำหน้าตรงกับเหตุการณ์ใดเหตุการณ์หนึ่ง */
export function webhookGuardedFamiliesOf(events: readonly string[]): WebhookGuardedFamily[] {
  if (events.length === 0) return [...GUARDED_FAMILY_NAMES];
  return GUARDED_FAMILY_NAMES.filter((f) => events.some((e) => WEBHOOK_GUARDED_FAMILIES[f].some((p) => e.startsWith(p))));
}
/** ปลายทางนี้ต้องมีตัวกันเหตุการณ์ไหม: แตะครอบครัวที่ต้องมีตัวกันอย่างน้อยหนึ่งครอบครัว */
export function webhookEventsNeedGuard(events: readonly string[]): boolean {
  return webhookGuardedFamiliesOf(events).length > 0;
}
// CRM C5.5 ▸ (fix3b r2 · รีวิว RV-5) ชื่อเหตุการณ์ที่ "ผู้ทำ" ส่งมา (`by` มีค่า = ทุกประตูใน src/) ต้องเป็นชื่อจริงในทะเบียน `WEBHOOK_EVENTS` ตรงตัว
//   หลังตัดช่องว่างหัวท้าย — เดิมเก็บ " crm.deal.won" / "CRM.deal.won" / "\tcrm.deal.won" ตามที่ส่งมา (พ้นตัวกันครอบครัว แต่ไม่มีวันได้รับอะไร
//   เพราะตัวส่งเทียบชื่อตรงตัว = แถวตาย) · ประตูเดิมกรอง/ตอบ 422 ก่อนถึงบริการอยู่แล้ว ⇒ นี่คือด่านสุดท้ายของบริการ (422 ข้อความไทย)
//   · ลำดับ: ตัดช่องว่าง → ตัวกันเหตุการณ์ (ครอบครัวที่ขาดตัวกัน = ปิดก่อน เหมือน fix3a/F4) → ชื่อต้องรู้จัก
//   · ผู้เรียกที่ไม่มี `by` (สคริปต์/ข้อสอบเก่า) เก็บตามเดิมทุกไบต์ ◂
const KNOWN_WEBHOOK_EVENTS = new Set(WEBHOOK_EVENTS.map((e) => e.value));
export class WebhookEventNameError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "WebhookEventNameError";
  }
}
function cleanEventList(events: readonly unknown[], by: WebhookAuthor | undefined): string[] {
  const raw = events.filter((e): e is string => typeof e === "string" && e.trim() !== "");
  if (by === undefined) return raw;
  return [...new Set(raw.map((e) => e.trim()))];
}
function assertKnownEvents(events: readonly string[], by: WebhookAuthor | undefined): void {
  if (by === undefined) return;
  const bad = events.find((e) => !KNOWN_WEBHOOK_EVENTS.has(e));
  if (bad !== undefined) throw new WebhookEventNameError(`ไม่รู้จักเหตุการณ์ “${bad.slice(0, 60)}” — เลือกจากรายการเหตุการณ์ของระบบ (ชื่อต้องตรงตัว ตัวพิมพ์เล็ก)`);
}
async function runEventGuards(tenantId: string, by: WebhookAuthor | undefined, events: readonly string[]): Promise<void> {
  if (by === undefined) return;
  await import("@/lib/webhook-guards");
  // CRM C5.5 ▸ fix3b F4: ทุกครอบครัวที่แตะต้องมีตัวกันในชื่อของมัน — ขาดครอบครัวเดียว = ปฏิเสธ (ก่อนรันตัวกันใด ๆ) ◂
  if (webhookGuardedFamiliesOf(events).some((f) => !EVENT_GUARDS.has(f))) throw new WebhookGuardError(WEBHOOK_GUARDS_MISSING);
  if (EVENT_GUARDS.size === 0) return;
  let actor: WebhookAuthorActor | null | undefined;
  for (const guard of EVENT_GUARDS.values()) {
    if (actor === undefined) actor = await authorActor(tenantId, by);
    const problem = await guard(tenantId, actor, events);
    if (problem) throw new WebhookGuardError(problem);
  }
}
// ◂ CRM C5.5

// ── CRUD ปลายทาง (tenant-scoped) ──────────────────────────────────────────

// สร้าง endpoint — url ต้อง http(s) เท่านั้น · secret สุ่มให้ (48 hex ≥24) · events ว่าง = ทุก event
// CRM C5.5 ▸ ลายเซ็นแรก (`by` บังคับ) = ของโค้ดใน src/ ทุกที่ · ลายเซ็นที่สอง (@deprecated ไม่มี `by` = ไม่ตรวจตัวกัน) มีไว้เพราะ
//   ข้อสอบเดิม `scripts/qc-acc-v2-permissions.mts:768` (ห้ามแก้) และ seed เรียกแบบมีชนิดโดยไม่มีผู้ทำ — ห้ามใช้ใน src/
//   (ด่าน: probe-fix1 WB-static ตรวจทุกจุดเรียกใน src/ ว่าส่ง `by`) · ถอดลายเซ็นที่สองได้เมื่อผู้คุมงานแก้ข้อสอบนั้น (ORACLE-EDIT) ◂
export async function createEndpoint(
  ctx: Ctx,
  input: { url: string; events?: string[]; by: WebhookAuthor },
  deps?: WebhookDeps,
): Promise<{ id: string; secret: string }>;
/** @deprecated สคริปต์/ข้อสอบเก่าเท่านั้น — ไม่มีผู้ทำ = ไม่ตรวจตัวกันเหตุการณ์ (ห้ามใช้ใน src/) */
export async function createEndpoint(ctx: Ctx, input: { url: string; events?: string[] }, deps?: WebhookDeps): Promise<{ id: string; secret: string }>;
export async function createEndpoint(
  ctx: Ctx,
  input: { url: string; events?: string[]; by?: WebhookAuthor },
  deps?: WebhookDeps,
): Promise<{ id: string; secret: string }> {
  const url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("ที่อยู่ปลายทางต้องขึ้นต้นด้วย http:// หรือ https://");
  }
  // 🔴 AUDIT M1: กัน SSRF ตั้งแต่ตอนสมัครปลายทาง (ตรวจซ้ำอีกครั้งตอนส่งจริง — ตัวส่งตรึง IP)
  const problem = await webhookSaveProblem(url, deps);
  if (problem) throw new Error(problem);
  const secret = randomBytes(24).toString("hex"); // 48 ตัวอักษร
  const events = Array.isArray(input.events) ? cleanEventList(input.events, input.by) : []; // CRM C5.5-fix3b r2 ▸ RV-5 ◂
  await runEventGuards(ctx.tenantId, input.by, events); // CRM C5.5 ▸ ตัวกันเหตุการณ์ (รายการว่าง = ทุกเหตุการณ์) ◂
  assertKnownEvents(events, input.by); // CRM C5.5-fix3b r2 ▸ RV-5 ◂
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
export async function setEndpointActive(ctx: Ctx, id: string, active: boolean, by: WebhookAuthor) {
  // CRM C5.5 ▸ เปิดใช้ = ปลายทางกลับมารับเหตุการณ์ที่บันทึกไว้ ⇒ ตัวกันเหตุการณ์ตรวจรายการนั้น (ปิดได้เสมอ) ◂
  if (active) {
    const row = await tenantDb(ctx).webhookEndpoint.findFirst({ where: { id }, select: { eventsJson: true } });
    if (row) await runEventGuards(ctx.tenantId, by, eventsOf(row.eventsJson));
  }
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
export async function setEndpointEvents(ctx: Ctx, id: string, events: string[], by: WebhookAuthor) {
  const clean = cleanEventList(Array.isArray(events) ? events : [], by); // CRM C5.5-fix3b r2 ▸ RV-5 ◂
  await runEventGuards(ctx.tenantId, by, clean); // CRM C5.5 ▸ ตัวกันเหตุการณ์ ◂
  assertKnownEvents(clean, by); // CRM C5.5-fix3b r2 ▸ RV-5 ◂
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
 * 🔴 C5.4 (L3-M3): `X-Shark-Event-Id` = `id` ใน body (id ของเหตุการณ์ — เท่าเดิมทุกครั้งที่ส่งซ้ำ) ⇒ ปลายทางกันซ้ำได้
 * 🔴 C5.4 (L4-M2): ส่งผ่าน `outboundFetch` เท่านั้น — ตรวจปลายทาง · ตรึง IP ตอนต่อ · **ไม่ตาม 3xx** (รอบ 2: 3xx = ส่งถึง + คำเตือน)
 */
async function deliver(
  url: string,
  body: string,
  secret: string,
  eventType: string,
  eventId: string,
  deps?: WebhookDeps,
): Promise<{ error: string | null; warning: string | null }> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  const signatureV2 = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  try {
    const res = await outboundFetch(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Shark-Signature": signature,
          "X-Shark-Timestamp": ts,
          "X-Shark-Signature-V2": signatureV2,
          "X-Shark-Event": eventType,
          "X-Shark-Event-Id": eventId,
        },
        body,
        timeoutMs: TIMEOUT_MS,
        maxBytes: 65_536,
      },
      deps,
    );
    const moved = redirectWarning(res.status);
    if (moved) return { error: null, warning: moved }; // มติ C5.4 รอบ 2: 3xx = ส่งถึง (ไม่ลองซ้ำ · ไม่ตาม)
    if (!res.ok) return { error: `ปลายทางตอบรหัส ${res.status}`, warning: null };
    return { error: null, warning: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), warning: null };
  }
}

/**
 * C5.4 (L3-M3): id ของเหตุการณ์ต้องตามไปถึงการยิงซ้ำของ cron (`retryFailedWebhooks`) ด้วย — ตาราง WebhookDelivery
 * ไม่มีคอลัมน์ event (เพิ่ม = migration) ⇒ ฝากไว้ในคีย์สงวนของ `payloadJson` (คอลัมน์ภายใน — ไม่มีหน้า/REST ไหนแสดง)
 * แล้วถอดออกก่อนสร้าง body ทุกครั้ง · payload ที่ไม่ใช่ object = เก็บตามเดิม (ยิงซ้ำจะใช้ id ของแถว delivery แทน)
 */
const EVENT_ID_KEY = "$sharkEventId";
function storedPayload(payload: unknown, eventId: string): Prisma.InputJsonValue {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>), [EVENT_ID_KEY]: eventId } as Prisma.InputJsonValue;
  }
  return (payload ?? {}) as Prisma.InputJsonValue;
}
function unpackStored(stored: unknown, fallbackId: string): { payload: unknown; eventId: string } {
  if (typeof stored === "object" && stored !== null && !Array.isArray(stored) && EVENT_ID_KEY in stored) {
    const { [EVENT_ID_KEY]: id, ...rest } = stored as Record<string, unknown>;
    return { payload: rest, eventId: typeof id === "string" && id ? id : fallbackId };
  }
  return { payload: stored, eventId: fallbackId };
}
/** C5.4 (H4): id แถวการส่งของ (event, ปลายทาง) — คงที่ ⇒ PK กันส่งซ้ำ · รูปเดียวกับ cuid (c + 24 ตัว [0-9a-f]) */
const deliveryRowId = (eventId: string, endpointId: string) =>
  `c${createHash("sha256").update(`webhook-delivery:${eventId}:${endpointId}`).digest("hex").slice(0, 24)}`;
const envelope = (eventId: string, type: string, payload: unknown) =>
  JSON.stringify({ id: eventId, type, payload, sentAt: new Date().toISOString() });

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
  const ep = await tenantDb(ctx).webhookEndpoint.findFirst({ where: { id } });
  if (!ep) throw new Error("ไม่พบปลายทางนี้");
  const payload = { test: true, message: "ทดสอบการส่งจากหน้าตั้งค่า Webhooks" };
  const eventId = `test_${randomBytes(12).toString("hex")}`;
  const { error: err, warning } = await deliver(ep.url, envelope(eventId, eventType, payload), ep.secret, eventType, eventId, deps);
  await tenantDb(ctx).webhookDelivery.create({
    data: {
      tenantId: ctx.tenantId,
      endpointId: ep.id,
      eventType,
      payloadJson: storedPayload(payload, eventId),
      status: err === null ? "OK" : "FAILED",
      attempts: 1,
      lastError: err ?? warning ?? null,
    },
  });
  return { delivered: err === null, error: err };
}

// กระจาย event ไปทุก endpoint ที่ subscribe → บันทึก WebhookDelivery · คืนจำนวนที่สำเร็จ
// kernel-level: เรียกจาก outbox (ไม่มี session) → prisma ตรง + กรอง tenantId เอง
export async function dispatchWebhooks(evt: WebhookEvent, deps?: WebhookDeps): Promise<number> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId: evt.tenantId, active: true },
  });
  const targets = endpoints.filter((ep) => {
    const ev = eventsOf(ep.eventsJson);
    return ev.length === 0 || ev.includes(evt.type); // ว่าง = รับทุก event
  });

  // C5.4 (L3-M3): id ของ OutboxEvent (เท่าเดิมทุกรอบที่คิวส่งซ้ำ) · เรียกนอกคิว = สุ่มหนึ่งค่าต่อการกระจายครั้งนี้
  const eventId = evt.id || `evt_${randomBytes(12).toString("hex")}`;
  const body = envelope(eventId, evt.type, evt.payload);
  const payloadJson = storedPayload(evt.payload, eventId);
  let ok = 0;
  for (const ep of targets) {
    // C5.4 (hunter H4): event จากคิว = **จองแถวการส่งก่อนยิง** ด้วย id ที่คำนวณจาก (event, ปลายทาง) — PK ชน = มีรอบอื่น
    //   (drainer ซ้อนตอน lease หลุด · คิว retry เมื่องานหลักล้ม) ส่งไปแล้ว/กำลังส่ง ⇒ ข้าม · กันซ้ำด้วยแถวจริง ไม่ใช่ `attempts`
    //   ตายระหว่างจองกับยิง = แถว FAILED (attempts 0) ⇒ cron `retryFailedWebhooks` ยิงให้ภายหลัง (at-least-once คงเดิม)
    const rowId = evt.id ? deliveryRowId(evt.id, ep.id) : null;
    if (rowId) {
      try {
        await prisma.webhookDelivery.create({
          data: { id: rowId, tenantId: evt.tenantId, endpointId: ep.id, eventType: evt.type, payloadJson, status: "FAILED", attempts: 0, lastError: "กำลังส่ง" },
        });
      } catch (e) {
        if ((e as { code?: unknown })?.code === "P2002") continue; // รอบอื่นจองปลายทางนี้ของ event นี้ไปแล้ว
        throw e;
      }
    }
    const { error: err, warning } = await deliver(ep.url, body, ep.secret, evt.type, eventId, deps);
    const result = { status: err === null ? ("OK" as const) : ("FAILED" as const), attempts: 1, lastError: err ?? warning ?? null };
    if (rowId) {
      await prisma.webhookDelivery.update({ where: { id: rowId }, data: result });
    } else {
      await prisma.webhookDelivery.create({ data: { tenantId: evt.tenantId, endpointId: ep.id, eventType: evt.type, payloadJson, ...result } });
    }
    if (err === null) ok++;
  }
  return ok;
}

// ยิงซ้ำการส่งที่ล้ม (attempts < 5) ทุก tenant · สำเร็จ→OK · ล้ม→attempts+1 · คืนจำนวนที่กู้สำเร็จ
// kernel-level: เรียกจาก cron (ไม่มี session) → prisma ตรงข้ามทุกร้าน
// 🔴 AUDIT M1: ข้ามใบที่ยังไม่ถึงรอบถัดไป (backoff ต่อใบ — ดู `retryDueAt`)
export async function retryFailedWebhooks(deps?: WebhookDeps): Promise<number> {
  const now = Date.now();
  const rows = await prisma.webhookDelivery.findMany({
    where: { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } },
    include: { endpoint: true },
  });
  const failed = rows.filter((d) => retryDueAt(d).getTime() <= now);
  let ok = 0;
  for (const d of failed) {
    const { payload, eventId } = unpackStored(d.payloadJson, d.id);
    const { error: err, warning } = await deliver(d.endpoint.url, envelope(eventId, d.eventType, payload), d.endpoint.secret, d.eventType, eventId, deps);
    await prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        status: err === null ? "OK" : "FAILED",
        attempts: d.attempts + 1,
        lastError: err ?? warning ?? null,
      },
    });
    if (err === null) ok++;
  }
  return ok;
}
