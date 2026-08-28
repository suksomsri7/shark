// ตัวตน 2 ระดับของ Public Chat API v1 (§3.1 ของ ledger/PLAN-CHAT-PLATFORM.md · คำตัดสิน D2)
//
// นี่คือ "ชั้น 2" ทั้งหมด — route handler ใต้ `src/app/api/v1/chat/**` ห้ามมี logic อื่น
// นอกจาก parse body → เรียกชั้น 1 (`./service`) → ตอบ (กฎเหล็กข้อ 1 §2)
//
// ┌─────────┬──────────────────────────────┬──────────────────┬────────────────────────────────┐
// │ ระดับ    │ header                       │ ใครใช้            │ ทำอะไรได้                        │
// ├─────────┼──────────────────────────────┼──────────────────┼────────────────────────────────┤
// │ secret  │ Authorization: Bearer shark_…│ เซิร์ฟเวอร์ SiamDive│ อ้างเป็นลูกค้าคนไหนก็ได้ (จาก body) │
// │ widget  │ X-Shark-Widget: swk_… +Origin│ เบราว์เซอร์        │ เฉพาะ guest token ที่เราออกให้    │
// └─────────┴──────────────────────────────┴──────────────────┴────────────────────────────────┘
//
// 🔴 ข้อบังคับที่มีข้อสอบคุมทุกข้อ (scripts/qc-chat-api-v1.mts):
//   1. secret key ผ่าน `X-Shark-Widget` ไม่ได้ · widget key ผ่าน `Authorization` ไม่ได้ → 401 ทั้งคู่
//      (คนละ prefix: `shark_` เทียบ hash ในตาราง ApiKey · `swk_` เทียบ hash ใน ChatChannelConnection)
//   2. โหมด widget อ้าง `externalUserId` ของคนอื่นไม่ได้ — ตัวตนมาจาก guest token ที่เซิร์ฟเวอร์
//      เซ็นไว้เท่านั้น (header `X-Shark-Guest` หรือ cookie) **ห้ามอ่านจาก body/query**
//   3. Origin นอก `originAllowlist` → 403 · allowlist ว่าง = ปฏิเสธทุก origin (ปลอดภัยโดยปริยาย)
//   4. `tenantId`/`systemId` มาจากกุญแจเสมอ ห้ามรับจาก body (กฎเดิมของ repo)
//   5. CORS: `Access-Control-Allow-Origin` = origin ที่ขอมาและอยู่ใน allowlist เท่านั้น
//      ห้าม `*` เพราะเราส่ง credentials · ต้องมี `Vary: Origin` ทุกคำตอบที่ขึ้นกับ origin

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ChatChannelConnection } from "@prisma/client";
import { apiJson } from "@/lib/api-keys/route-auth";
import { verifyApiKey } from "@/lib/api-keys/service";
import { rateLimitVerdict, clientIp } from "./rate-limit";
import {
  ensureWebchatConnection,
  getConnectionByPublicKey,
  isOriginAllowed,
  isOriginAllowedForAnyWidget,
  resolveChatSystemId,
} from "./service";

// ═══════════════════════ เพดานอัตราการเรียก (B2) ═══════════════════════
// 🔴 ตัวเลขคำนวณจากผู้ใช้จริง ไม่ใช่ยกของเดิมมา — ของเดิมนับใน memory **ต่อ instance**
//    (เพดานจริง = ที่ตั้ง × จำนวน instance) ย้ายมานับบน DB แล้วเพดานจะเข้มขึ้นทันทีหลายเท่า
//    ถ้าลอกตัวเลขเดิม (บทเรียน §12 · SiamDive S2)
//
// ฐานการใช้งานจริง: หน้าเว็บถามข้อความใหม่ทุก 5 วินาที = 12 ครั้ง/นาที/คน
//   · /thread 12 + /unread 12 ≈ 24 ครั้ง/นาที/คน ตอนเปิดหน้าต่างแชทค้างไว้
//   · คนพิมพ์เร็วสุดจริง ๆ ราว 10 ข้อความ/นาที
//
// 🔴 ภาระการเขียน DB: 1 request = 1 UPDATE ⇒ **ชั้นเดียวต่อคำขอ** เท่านั้น
//    (SiamDive เพิ่งตัดชั้น "ต่อห้อง" ทิ้งด้วยเหตุผลนี้) → เลือกแกนที่แม่นที่สุดที่มีในคำขอนั้น

// secret: ผู้เรียกคือ "เซิร์ฟเวอร์ของพาร์ตเนอร์" ทุกคำขอออกจาก IP ของ Vercel ไม่กี่ตัว
// ⇒ นับต่อ IP ไม่มีความหมาย ต้องนับต่อคีย์ · พาร์ตเนอร์กันผู้ใช้รายคนเองอยู่แล้วที่ฝั่งเขา
// เพดาน = ผู้ใช้เปิดแชทค้างพร้อมกัน 30 คน × 24 + ข้อความ ≈ 800 → เผื่อ 1.5 เท่า
// (หน้าที่ของด่านนี้คือกันพาร์ตเนอร์ที่โค้ดวนลูป ไม่ใช่กันผู้ใช้รายคน)
const SECRET_LIMIT = 1_200;
// widget + รู้ตัวตน guest แล้ว: นับต่อ guest ตรง ๆ — แม่นกว่านับต่อ IP และ**ไม่พังเพราะ NAT**
// (ผู้ใช้มือถือไทยอยู่หลัง CGNAT ร่วม IP เดียวกันเป็นร้อยคน — นับต่อ IP = ตัดคนบริสุทธิ์)
// เพดาน = 24 ครั้ง/นาที ของการ poll × ~4 เท่าเผื่อ retry/หลายแท็บ
const WIDGET_GUEST_LIMIT = 90;
// widget ที่ยังไม่มี guest (/guest, /config): ตัวตนเดียวที่มีคือ IP → นับต่อ IP+connection
// 60/นาที = เปิดหน้าเว็บที่ฝัง widget ได้ 60 ครั้ง/นาที จาก IP เดียว (พอสำหรับออฟฟิศหลัง NAT)
// และการสร้าง contact จริงยังมีเพดาน 60 คน/ชม./connection ใน service ซ้อนอยู่อีกชั้น
const WIDGET_ANON_LIMIT = 60;
const WINDOW_MS = 60_000;

// ═══════════════════════ guest token ═══════════════════════
// ต้องเป็นของที่ "เซิร์ฟเวอร์ออกให้" เท่านั้น → เซ็นด้วย HMAC ผูกกับ connectionId
// ⇒ ปลอมไม่ได้ · ย้ายไปใช้กับ connection อื่นไม่ได้ · ไม่ต้องมีตารางเก็บ token
// (เดาไม่ได้อยู่แล้วเพราะสุ่ม 16 ไบต์จาก CSPRNG — ลายเซ็นเพิ่มไว้กันการ "ลองยิงมั่ว")
const GUEST_PREFIX = "swg_";
const GUEST_HEADER = "x-shark-guest";
export const WIDGET_HEADER = "x-shark-widget";
export const SYSTEM_HEADER = "x-shark-system";

function guestSecret(): Buffer {
  const raw = process.env.CHAT_CREDENTIALS_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[chat] ไม่มี env CHAT_CREDENTIALS_KEY สำหรับเซ็น guest token");
    }
    return createHash("sha256").update("chat-dev-fallback-key:guest").digest();
  }
  return createHash("sha256").update(`${raw}:guest`).digest();
}

function sign(connectionId: string, nonce: string): string {
  return createHmac("sha256", guestSecret()).update(`${connectionId}.${nonce}`).digest("hex").slice(0, 32);
}

/** ออก guest token ใหม่ (ผูกกับ connection นี้เท่านั้น) */
export function mintGuestToken(connectionId: string): string {
  const nonce = randomBytes(16).toString("hex");
  return `${GUEST_PREFIX}${nonce}.${sign(connectionId, nonce)}`;
}

/** true = token นี้เราออกให้ connection นี้จริง (ลายเซ็นตรง) */
export function verifyGuestToken(connectionId: string, token: unknown): boolean {
  if (typeof token !== "string" || !token.startsWith(GUEST_PREFIX)) return false;
  const [head, sig] = token.slice(GUEST_PREFIX.length).split(".");
  if (!head || !sig) return false;
  const expect = Buffer.from(sign(connectionId, head), "utf8");
  const got = Buffer.from(sig, "utf8");
  return expect.length === got.length && timingSafeEqual(expect, got);
}

export function guestCookieName(connectionId: string): string {
  return `swg_${connectionId}`;
}

function guestFromRequest(req: Request, connectionId: string): string | null {
  const fromHeader = req.headers.get(GUEST_HEADER)?.trim();
  if (fromHeader && verifyGuestToken(connectionId, fromHeader)) return fromHeader;
  // cookie (widget ที่ฝังแบบ same-site) — third-party cookie ถูกบล็อกในหลายเบราว์เซอร์แล้ว
  // จึงรองรับ header เป็นหลัก และ cookie เป็นทางสำรอง
  const raw = req.headers.get("cookie") ?? "";
  const want = `${guestCookieName(connectionId)}=`;
  for (const part of raw.split(";")) {
    const p = part.trim();
    if (!p.startsWith(want)) continue;
    const v = decodeURIComponent(p.slice(want.length));
    if (verifyGuestToken(connectionId, v)) return v;
  }
  return null;
}

// ═══════════════════════ CORS ═══════════════════════
const ALLOW_HEADERS = "content-type, x-shark-widget, x-shark-guest";
const ALLOW_METHODS = "GET, POST, OPTIONS";

/**
 * header CORS ของคำตอบหนึ่ง ๆ
 * 🔴 `Vary: Origin` ต้องมีเสมอ (แม้ตอนปฏิเสธ) ไม่งั้น CDN/เบราว์เซอร์จะแคชคำตอบของ origin หนึ่ง
 *    ไปเสิร์ฟให้อีก origin หนึ่ง = allowlist รั่วโดยไม่มีใครแก้โค้ดผิดเลย
 * 🔴 ห้าม `*` เด็ดขาด เพราะเราตั้ง `Allow-Credentials: true` (เบราว์เซอร์ปฏิเสธคู่นี้อยู่แล้ว
 *    และถ้าเผลอทำสำเร็จ = ทุกเว็บบนโลกอ่านแชทลูกค้าได้)
 */
export function corsHeaders(origin: string | null, allowed: boolean): Record<string, string> {
  const h: Record<string, string> = { vary: "Origin" };
  if (origin && allowed) {
    h["access-control-allow-origin"] = origin;
    h["access-control-allow-credentials"] = "true";
  }
  return h;
}

/** ตอบ preflight — origin ที่ไม่มีร้านไหนอนุญาต → 403 (ไม่มี Allow-Origin ให้เบราว์เซอร์เดินต่อ) */
export async function chatPreflight(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  const allowed = await isOriginAllowedForAnyWidget(origin);
  const headers = corsHeaders(origin, allowed);
  if (!allowed) return new Response(null, { status: 403, headers });
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      "access-control-allow-methods": ALLOW_METHODS,
      "access-control-allow-headers": ALLOW_HEADERS,
      "access-control-max-age": "600",
    },
  });
}

// ═══════════════════════ ตัวตน ═══════════════════════
export type ChatAuthMode = "secret" | "widget";

export type ChatAuthOk = {
  ok: true;
  mode: ChatAuthMode;
  tenantId: string;
  systemId: string;
  connection: ChatChannelConnection;
  /** widget = guest token ที่ยืนยันลายเซ็นแล้ว · secret = null (ตัวตนมาจาก body) */
  guestToken: string | null;
  /** ตั้งค่าเมื่อเพิ่ง mint ให้ในคำขอนี้ — ผู้เรียกต้องส่งกลับให้ client เก็บ */
  mintedGuestToken?: string;
  cors: Record<string, string>;
};

export type ChatAuth = ChatAuthOk | { ok: false; response: Response };

/** ตอบ JSON พร้อม header CORS ของคำขอนั้น (secret mode = ไม่มี CORS เลย ตามที่ควรเป็น) */
export function chatJson(
  auth: Pick<ChatAuthOk, "cors">,
  body: unknown,
  status = 200,
  extra?: Record<string, string>,
): Response {
  return apiJson(body, status, { ...auth.cors, ...extra });
}

type GuestPolicy = "require" | "mint" | "optional";

/**
 * ตรวจตัวตนของคำขอ + rate limit ครั้งเดียว → ใช้ได้ทุกเส้นใน `/api/v1/chat/*`
 * @param guest กติกาของโหมด widget: require = ต้องมี guest แล้ว · mint = ออกให้ใหม่ได้ · optional = ไม่ต้องมี
 */
export async function authenticateChatRequest(
  req: Request,
  opts: { guest?: GuestPolicy } = {},
): Promise<ChatAuth> {
  const guestPolicy = opts.guest ?? "require";
  const widgetKey = req.headers.get(WIDGET_HEADER)?.trim();
  const authHeader = req.headers.get("authorization")?.trim() ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(authHeader)?.[1]?.trim();
  const origin = req.headers.get("origin");

  // ส่งมาทั้งสองแบบ = เจตนาไม่ชัด (และเป็นท่ามาตรฐานของการลองสับสนตัวตรวจ) → ปฏิเสธตรง ๆ
  if (widgetKey && bearer) {
    return deny(401, "ส่งกุญแจได้ครั้งละแบบเดียว (Authorization หรือ X-Shark-Widget)", origin);
  }

  if (widgetKey) return authenticateWidget(req, widgetKey, origin, guestPolicy);
  if (bearer) return authenticateSecret(req, bearer);
  return deny(
    401,
    "ต้องส่งกุญแจ — เซิร์ฟเวอร์ใช้ Authorization: Bearer <API key> · widget ใช้ X-Shark-Widget",
    origin,
  );
}

function deny(status: number, message: string, origin: string | null, allowed = false): ChatAuth {
  return { ok: false, response: apiJson({ error: message }, status, corsHeaders(origin, allowed)) };
}

// ───────── โหมด widget (เบราว์เซอร์) ─────────
async function authenticateWidget(
  req: Request,
  rawKey: string,
  origin: string | null,
  guestPolicy: GuestPolicy,
): Promise<ChatAuth> {
  // `shark_…` (secret key) ที่ถูกเอามาใส่ช่องนี้จะตกที่นี่ — prefix ไม่ใช่ `swk_` → null
  const connection = await getConnectionByPublicKey(rawKey);
  if (!connection) return deny(401, "กุญแจ widget ไม่ถูกต้องหรือถูกยกเลิกแล้ว", origin);

  // 🔴 allowlist ว่าง = ปฏิเสธทุก origin · ไม่มี Origin ก็ปฏิเสธ (ตัดสินไม่ได้ = ไม่อนุญาต)
  const allowed = isOriginAllowed(connection, origin);
  if (!allowed) {
    return deny(403, "ไม่อนุญาตให้เรียกจากโดเมนนี้ — เพิ่มโดเมนในรายการที่อนุญาตก่อน", origin);
  }
  const cors = corsHeaders(origin, true);

  let guestToken = guestFromRequest(req, connection.id);
  let minted: string | undefined;
  if (!guestToken && guestPolicy === "mint") {
    guestToken = mintGuestToken(connection.id);
    minted = guestToken;
  }
  if (!guestToken && guestPolicy === "require") {
    return {
      ok: false,
      response: apiJson({ error: "ยังไม่มีตัวตนผู้เยี่ยมชม — เรียก /api/v1/chat/guest ก่อน" }, 401, cors),
    };
  }

  // ชั้นเดียวต่อคำขอ: มี guest แล้วนับต่อ guest (แม่น · ไม่พังเพราะ NAT) ไม่งั้นนับต่อ IP
  const key = guestToken
    ? `chat:v1:guest:${connection.id}:${createHash("sha256").update(guestToken).digest("hex").slice(0, 24)}`
    : `chat:v1:origin:${connection.id}:${clientIp(req.headers)}`;
  const limit = guestToken ? WIDGET_GUEST_LIMIT : WIDGET_ANON_LIMIT;
  const rl = await rateLimitVerdict(key, limit, WINDOW_MS);
  if (!rl.ok) {
    return {
      ok: false,
      response: apiJson({ error: `เรียกใช้บ่อยเกินไป — จำกัด ${limit} ครั้งต่อนาที` }, 429, {
        ...cors,
        "retry-after": String(rl.retryAfterSec ?? 60),
      }),
    };
  }

  return {
    ok: true,
    mode: "widget",
    tenantId: connection.tenantId,
    systemId: connection.systemId,
    connection,
    guestToken,
    ...(minted ? { mintedGuestToken: minted } : {}),
    cors,
  };
}

// ───────── โหมด secret (server-to-server) ─────────
// ไม่มี CORS เลย: คำขอไม่ได้มาจากเบราว์เซอร์ · ใส่ Allow-Origin ให้ = เปิดช่องให้เอา secret key
// ไปแปะในหน้าเว็บแล้วใช้งานได้จริง ซึ่งเป็นสิ่งที่ D2 ห้ามไว้ชัดเจน
async function authenticateSecret(req: Request, rawKey: string): Promise<ChatAuth> {
  // `swk_…` (widget key) ที่ถูกเอามาใส่ช่องนี้จะตกที่นี่ — verifyApiKey รับเฉพาะ `shark_`
  const key = await verifyApiKey(rawKey);
  if (!key) return { ok: false, response: apiJson({ error: "API key ไม่ถูกต้องหรือถูกเพิกถอนแล้ว" }, 401) };

  const rl = await rateLimitVerdict(`chat:v1:key:${key.keyId}`, SECRET_LIMIT, WINDOW_MS);
  if (!rl.ok) {
    return {
      ok: false,
      response: apiJson({ error: `เรียกใช้บ่อยเกินไป — จำกัด ${SECRET_LIMIT} ครั้งต่อนาที` }, 429, {
        "retry-after": String(rl.retryAfterSec ?? 60),
      }),
    };
  }

  // systemId มาจากร้านของกุญแจเสมอ — header ระบุเจาะจงได้แต่ต้องเป็นระบบของร้านตัวเอง
  const systemId = await resolveChatSystemId(key.tenantId, req.headers.get(SYSTEM_HEADER));
  if (!systemId) {
    return {
      ok: false,
      response: apiJson({ error: "ร้านนี้ยังไม่ได้เปิดระบบแชท (AppSystem ชนิด CHAT)" }, 404),
    };
  }
  const connection = await ensureWebchatConnection(key.tenantId, systemId);

  return {
    ok: true,
    mode: "secret",
    tenantId: key.tenantId,
    systemId,
    connection,
    guestToken: null,
    cors: {},
  };
}

// ═══════════════════════ ตัวตนของ "ลูกค้า" ในคำขอ ═══════════════════════
/**
 * 🔴 หัวใจของข้อ 2: โหมด widget **ห้าม**เอา externalUserId จาก body/query
 * - secret → ต้องส่งมาและเป็นสตริงไม่ว่าง (พาร์ตเนอร์อ้างแทนลูกค้าคนไหนก็ได้ในร้านตัวเอง)
 * - widget → ใช้ guest token เท่านั้น · ถ้าดันส่งของคนอื่นมาด้วย = 403 (ไม่ใช่เงียบ ๆ ข้ามไป
 *   เพื่อให้คนเขียน widget รู้ตัวทันที ว่าอ้างแทนคนอื่นไม่ได้)
 */
export function resolveExternalUserId(
  auth: ChatAuthOk,
  claimed: unknown,
): { ok: true; externalUserId: string } | { ok: false; response: Response } {
  const asked = typeof claimed === "string" ? claimed.trim() : "";
  if (auth.mode === "secret") {
    if (!asked) return { ok: false, response: chatJson(auth, { error: "ต้องระบุ externalUserId" }, 400) };
    return { ok: true, externalUserId: asked };
  }
  const guest = auth.guestToken;
  if (!guest) {
    return {
      ok: false,
      response: chatJson(auth, { error: "ยังไม่มีตัวตนผู้เยี่ยมชม — เรียก /api/v1/chat/guest ก่อน" }, 401),
    };
  }
  if (asked && asked !== guest) {
    return {
      ok: false,
      response: chatJson(auth, { error: "กุญแจ widget อ้างเป็นผู้ใช้คนอื่นไม่ได้" }, 403),
    };
  }
  return { ok: true, externalUserId: guest };
}

/** header ตั้ง cookie ให้ guest ที่เพิ่ง mint (สำหรับ widget แบบ same-site) */
export function guestCookieHeader(connectionId: string, token: string): Record<string, string> {
  const secure = process.env.NODE_ENV === "production";
  return {
    "set-cookie": [
      `${guestCookieName(connectionId)}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=None",
      ...(secure ? ["Secure"] : []),
      `Max-Age=${90 * 24 * 60 * 60}`,
    ].join("; "),
  };
}
