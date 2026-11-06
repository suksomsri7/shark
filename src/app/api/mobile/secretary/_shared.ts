// _shared.ts — ด่านร่วมของ route `/api/mobile/secretary/**` (ใบ SEC S1.14 · ไม่ใช่ route · สัญญา docs/api/SECRETARY-API.md)
//
// ลำดับทุกเส้น: Bearer (+ x-tenant-id เมื่อเส้นเป็นของกิจการ · `requireMobile`) → คีย์สิทธิ์ (`mobileDenied` · ปริยาย `ai.chat.send` = ประตูเว็บของเลขา)
//   → เพดานอัตรา (`withRateLimit` · ทุกเส้นเขียน) → body (zod `.strict()` · คีย์ที่ไม่รู้จัก เช่น now/userId/tenantId ⇒ 400) → lib ตัวเดียวกับเว็บ → DTO
// 🔴 ตัวตน/ร้าน/เวลา มาจากด่านเท่านั้น (โทเค็น + x-tenant-id + นาฬิกาเซิร์ฟเวอร์) — ห้ามรับจาก body/query
// รูปตอบล้มเหลว = `{ error: code, message: "<ไทย>" }` (กติกาข้อ 6) · 429 มี `retryAfterSec` + หัว Retry-After
import { after } from "next/server";
import type { z } from "zod";
import { ForbiddenError, type AccessQuery, type MembershipCtx } from "@/lib/core/rbac";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { errDetail, logOps } from "@/lib/core/ops";
import { prisma } from "@/lib/core/db";
import { requireMobile, mobileUser, type MobileAuth } from "@/lib/mobile/auth";
import { AI_CHAT, mobileAiCtx, mobileDenied } from "@/lib/mobile/guard";
import type { AiMemberActor } from "@/lib/ai/actor";

export type SecCtx = {
  g: MobileAuth;
  userId: string;
  tenantId: string;
  m: MembershipCtx;
  /** ctx ของ lib เลขา (ConvCtx) = ร้านจากด่าน + ผู้ใช้ของโทเค็น */
  conv: { tenantId: string; actor: AiMemberActor };
};
export type RouteCtx<P extends string = "id"> = { params: Promise<Record<P, string>> };

export const ID_MAX = 80;
const BODY_MAX = 64 * 1024;

export const fail = (status: number, error: string, message: string, extra?: Record<string, unknown>) =>
  Response.json({ error, message, ...(extra ?? {}) }, { status });
export const notFound = (message = "ไม่พบรายการนี้ หรือคุณยังไม่มีสิทธิ์เห็น") => fail(404, "not_found", message);
export const forbidden = (message = "บัญชีนี้ยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของกิจการ") => fail(403, "forbidden", message);
export const ok = (body: unknown) => Response.json(body);

const DENY_TH = "บัญชีนี้ยังไม่มีสิทธิ์ใช้เลขา AI ของกิจการนี้ — ขอสิทธิ์จากเจ้าของกิจการ";
/** ข้อความไทยของด่าน `requireMobile` ตามรหัส (R-S1.14g) */
const GATE_TH: Record<string, string> = {
  unauthorized: "เข้าสู่ระบบใหม่อีกครั้ง",
  missing_tenant: "เลือกกิจการก่อนใช้งาน",
  forbidden: "บัญชีนี้ไม่ได้อยู่ในกิจการนี้ หรือยังไม่ได้รับคำเชิญ",
  suspended: "กิจการนี้ถูกระงับการใช้งาน — ติดต่อทีมงาน SHARK",
};

/**
 * ด่านของเส้นระดับกิจการ — Bearer + x-tenant-id (Membership ที่รับแล้ว · ร้านไม่ถูกระงับ) + คีย์สิทธิ์
 *   `access` ปริยาย = `ai.chat.send` (คีย์เดียวกับประตูเว็บของเลขา · lib/ai/actions.ts) · `null` = เป็นสมาชิกพอ (lib ตรวจต่อเอง)
 */
export async function gate(req: Request, access: AccessQuery | null = AI_CHAT): Promise<{ ok: true; c: SecCtx } | { ok: false; res: Response }> {
  const g = await requireMobile(req);
  if (!g.ok) return { ok: false, res: Response.json({ error: g.error, message: GATE_TH[g.error] ?? GATE_TH.forbidden }, { status: g.status }) };
  if (access && mobileDenied(g, access)) return { ok: false, res: forbidden(access === AI_CHAT ? DENY_TH : undefined) };
  const ua = Array.isArray(g.membership.unitAccess) ? (g.membership.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [];
  const m: MembershipCtx = { role: g.membership.role, unitAccess: ua, permissions: (g.membership.permissions ?? {}) as Record<string, unknown> };
  return { ok: true, c: { g, userId: g.user.id, tenantId: g.ctx.tenantId, m, conv: mobileAiCtx(g) } };
}

/** ด่านของเส้นระดับผู้ใช้ (ไม่ต้องมี x-tenant-id): inbox · tenants/create · invites/accept · account/* */
export async function userGate(req: Request): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const user = await mobileUser(req);
  if (!user) return { ok: false, res: Response.json({ error: "unauthorized", message: GATE_TH.unauthorized }, { status: 401 }) };
  return { ok: true, userId: user.id };
}

/**
 * เพดานต่อผู้ใช้ต่อเส้น (`sec:<route>:<key>` · fixed window 1 นาที · DB ร่วมทุก instance) — เกิน = 429 · ผ่าน = null
 *   ปริยาย 30/นาที (เส้นเขียน) · ส่งข้อความห้อง 10/นาที · `key` = `<tenantId>:<userId>` บนเส้นระดับกิจการ (ต่อ Membership แบบ inbox R-S1.21d) ·
 *   `<userId>` บนเส้นระดับผู้ใช้ · IP บนเส้นสาธารณะ
 */
export async function withRateLimit(key: string, route: string, perMinute = 30): Promise<Response | null> {
  const rl = await checkRateLimitDb(`sec:${route}:${key}`, { limit: perMinute, windowMs: 60_000 });
  if (rl.ok) return null;
  const retryAfterSec = rl.retryAfterSec ?? 60;
  return Response.json(
    { error: "rate_limited", message: "ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่", retryAfterSec },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

/** IP ของผู้เรียก (หัวของ proxy) — ใช้เป็นกุญแจเพดานของเส้นสาธารณะเท่านั้น */
export function clientIp(req: Request): string {
  const f = req.headers.get("x-forwarded-for") ?? "";
  return (f.split(",")[0] ?? "").trim().slice(0, 64) || req.headers.get("x-real-ip")?.trim().slice(0, 64) || "unknown";
}

/** body JSON ด้วย zod (schema `.strict()`) · ว่าง = {} · เกิน 64 KB = 413 · JSON เสีย = 400 bad_json · รูปผิด = 400 invalid */
export async function readBody<T extends z.ZodType>(req: Request, schema: T): Promise<{ ok: true; v: z.infer<T> } | { ok: false; res: Response }> {
  const raw = await req.text().catch(() => "");
  if (raw.length > BODY_MAX) return { ok: false, res: fail(413, "too_large", "ข้อมูลที่ส่งมาใหญ่เกินไป") };
  let json: unknown;
  try {
    json = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, res: fail(400, "bad_json", "รูปแบบข้อมูลไม่ถูกต้อง") };
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    const field = r.error.issues[0]?.path?.join(".") ?? "";
    return { ok: false, res: fail(400, "invalid", "ข้อมูลที่ส่งมาไม่ครบหรือไม่ถูกต้อง", field ? { field } : undefined) };
  }
  return { ok: true, v: r.data };
}

/** id จาก path — string 1..80 ตัว ไม่งั้น null (ผู้เรียกตอบ 404) */
export async function idParam<P extends string>(ctx: RouteCtx<P> | undefined, name: P): Promise<string | null> {
  const raw = ctx ? (await ctx.params)[name] : undefined;
  let v = "";
  try {
    v = typeof raw === "string" ? decodeURIComponent(raw).trim() : "";
  } catch {
    return null; // % เสีย ⇒ 404 (ไม่โยน 500)
  }
  return v && v.length <= ID_MAX ? v : null;
}

/** id ใน query/ตัวเลือก — ว่าง = undefined · ยาวเกิน = null (ผู้เรียกตอบ 400) */
export function optId(v: string | null): string | undefined | null {
  if (v === null || v.trim() === "") return undefined;
  const s = v.trim();
  return s.length <= ID_MAX ? s : null;
}

/** จำนวนใน query (`take`) — ไม่ส่ง/เพี้ยน = ค่าปริยาย · บีบเข้า [1, max] */
export function takeOf(v: string | null, dflt: number, max: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : dflt;
}

/** เวลาใน query (ISO) — ไม่ส่ง = undefined · เพี้ยน = null */
export function dateOf(v: string | null): Date | undefined | null {
  if (v === null || v === "") return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const THAI = /[฀-๿]/;

/**
 * error ที่ lib โยน → รูปตอบ: ForbiddenError = 403 · Error ที่มีข้อความไทย (กติกาของ lib) = 400 invalid พร้อมข้อความนั้น
 *   อื่น ๆ (Prisma/ระบบ) = 500 ข้อความไทยทั่วไป + logOps (ไม่ส่งรายละเอียดดิบถึงไคลเอนต์)
 */
export async function thrown(e: unknown, where: string): Promise<Response> {
  if (e instanceof ForbiddenError) return forbidden(THAI.test(e.message) && !e.message.startsWith("ไม่มีสิทธิ์:") ? e.message : undefined);
  if (e instanceof Error && THAI.test(e.message) && !/prisma|invocation|invalid `|\bat \w+ \(/i.test(e.message)) return fail(400, "invalid", e.message.slice(0, 300));
  await logOps("WARN", "secretary-api", `${where}: ล้ม`, { detail: errDetail(e) }).catch(() => {}); // R-Z26: ชื่อ/code/บรรทัดแรก ◂
  return fail(500, "server_error", "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง");
}

/**
 * SEC S3a.1-S2 ▸ R-Z20 (L4): ห่อ handler ทุกเส้นของ secretary/** — exception ที่หลุด ⇒ `thrown()` (ForbiddenError 403 · ข้อความไทยของ lib 400 ·
 *   อื่น ๆ 500 `{error:"server_error", message}` + logOps) — ไม่มี 500 ที่ไม่ใช่ JSON และไม่มี e.message ดิบ ◂
 */
export function withErrors<A extends unknown[]>(where: string, h: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await h(...args);
    } catch (e) {
      return thrown(e, where);
    }
  };
}

/** งานหลังตอบ (worker ของห้อง) — ในคำขอ = `after()` (คืน promise ให้ waitUntil) · นอกคำขอ (สคริปต์/ข้อสอบ) `after()` โยน ⇒ รอจนจบ */
export async function runAfter(task: () => Promise<unknown>): Promise<void> {
  try {
    after(() => task());
  } catch {
    await task().catch(() => {});
  }
}

/**
 * กันส่งซ้ำของ `clientMessageId` (แอป retry หลังเน็ตหลุด) — จองกุญแจ `sec:cmid:<ร้าน>:<ห้อง>:<ผู้ใช้>:<id>` 24 ชม. ด้วยคำสั่งเดียว
 *   (ChatRateBucket · INSERT … ON CONFLICT · SEC S3a.1-S1 R-Z11: กุญแจรวมผู้ใช้ — คนละคนใช้ id ซ้ำกันไม่ชน · id ห้ามมี ":")
 *   first = ครั้งแรก (ทำต่อ) · ไม่ใช่ = เคยส่งแล้ว ⇒ `existingMessageId()` (ยังไม่จด = ครั้งแรกยังไม่จบ ⇒ ผู้เรียกตอบ 409 pending)
 *   `remember(messageId)` จดข้อความของครั้งแรกที่แถว `<กุญแจ>:msg` (id = `sm_<messageId>`) · `release()` คืนกุญแจเมื่อครั้งแรกล้มก่อนมีข้อความ
 *   🔴 R-Z11: การคืน/จดกุญแจไม่กลืน error — ล้ม = throw ให้ผู้เรียก logOps + ตอบ 500 (ไม่งั้นกุญแจค้าง = retry ได้ pending ตลอด 24 ชม.)
 */
export async function claimClientMessageId(tenantId: string, roomId: string, userId: string, clientMessageId: string) {
  const key = `sec:cmid:${tenantId}:${roomId}:${userId}:${clientMessageId}`;
  const r = await checkRateLimitDb(key, { limit: 1, windowMs: 24 * 3_600_000 });
  return {
    first: r.ok,
    release: async (): Promise<void> => {
      await prisma.chatRateBucket.deleteMany({ where: { key } });
    },
    remember: async (messageId: string): Promise<void> => {
      await prisma.chatRateBucket.create({ data: { id: `sm_${messageId}`, key: `${key}:msg`, count: 1, windowStart: new Date() } });
    },
    existingMessageId: async (): Promise<string | null> => {
      const row = await prisma.chatRateBucket.findUnique({ where: { key: `${key}:msg` }, select: { id: true } });
      return row && row.id.startsWith("sm_") ? row.id.slice(3) || null : null;
    },
  };
}

/**
 * §Z.4 Q3 ▸ จดกุญแจล้ม **หลัง** ห้อง/ข้อความเกิดแล้ว — คืน claim (retry ด้วย id เดิมไม่ติด 409 pending 24 ชม.) + logOps WARN ·
 *   ผู้เรียกตอบ 200 ตามปกติ (ของมีจริง) · คืน claim ก็ล้มอีก = log เพิ่ม (ไม่ throw) ◂
 */
export async function rememberFailed(e: unknown, claim: { release: () => Promise<void> } | null, where: string): Promise<void> {
  let releaseError: unknown = null;
  try {
    await claim?.release();
  } catch (re) {
    releaseError = re;
  }
  const detail = `${errDetail(e)}${releaseError ? ` · release: ${errDetail(releaseError)}` : ""}`; // SEC S3a.1-S2 R-Z34: ไม่เก็บ stack ◂
  await logOps("WARN", "secretary-api", `${where}: จดกุญแจกันส่งซ้ำไม่สำเร็จ (ของเกิดแล้ว · คืน claim)`, { detail }).catch(() => undefined);
}

/** R-Z11 ▸ คืน/จดกุญแจล้ม = จดเหตุ (logOps) แล้วตอบ 500 ไทย — ไม่กลืนเงียบ ◂ */
export async function claimFailed(e: unknown, where: string): Promise<Response> {
  await logOps("WARN", "secretary-api", `${where}: จัดการกุญแจกันส่งซ้ำไม่สำเร็จ`, { detail: errDetail(e) }).catch(() => undefined); // SEC S3a.1-S2 R-Z34 ◂
  return fail(500, "server_error", "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง");
}

/** cursor คู่ `before=<iso>|<id>` (แบบ inbox R-S1.21h) — ไม่ส่ง = undefined · รูปผิด = null (ผู้เรียกตอบ 400) */
export function pairCursor(v: string | null): { at: Date; id: string } | undefined | null {
  if (v === null || v === "") return undefined;
  const i = v.lastIndexOf("|");
  if (i <= 0) return null;
  const at = new Date(v.slice(0, i));
  const id = v.slice(i + 1).trim();
  if (Number.isNaN(at.getTime()) || !id || id.length > ID_MAX) return null;
  return { at, id };
}
export const cursorOf = (at: Date, id: string) => `${at.toISOString()}|${id}`;

/**
 * กันเปิดห้องซ้ำ (R-S1.14a) — `POST rooms` ที่แอป retry ด้วย clientMessageId เดิม
 *   claim `sec:cmid:<ร้าน>:new:<ผู้ใช้>:<id>` (คำสั่งเดียว · 24 ชม. · id ห้ามมี ":") ก่อน startRoom · สำเร็จแล้วจดห้องที่แถวกุญแจตรง `<claim>:room`
 *   (ใช้ทั้ง route `POST rooms` และ action เว็บ `secStartRoomAction` — SEC S3a.1-S1 R-Z11)
 *   (รหัสห้องเก็บในคอลัมน์ id ของแถว = `sr_<roomId>` — ตารางนี้ไม่มีช่องค่า) · ซ้ำ ⇒ อ่านแถวด้วยกุญแจตรง (ยังสร้างไม่เสร็จ = `pending`) · หนี้ S3: คอลัมน์ clientMessageId (secretary_c)
 */
export async function claimNewRoom(tenantId: string, userId: string, clientMessageId: string) {
  const key = `sec:cmid:${tenantId}:new:${userId}:${clientMessageId}`;
  const r = await checkRateLimitDb(key, { limit: 1, windowMs: 24 * 3_600_000 });
  return {
    first: r.ok,
    // SEC S3a.1-S1 R-Z11: ไม่กลืน error — ผู้เรียกจับแล้ว logOps + 500 (`claimFailed`)
    release: async (): Promise<void> => {
      await prisma.chatRateBucket.deleteMany({ where: { key } });
    },
    remember: async (roomId: string): Promise<void> => {
      await prisma.chatRateBucket.create({ data: { id: `sr_${roomId}`, key: `${key}:room`, count: 1, windowStart: new Date() } });
    },
    existingRoomId: async (): Promise<string | null> => {
      const row = await prisma.chatRateBucket.findUnique({ where: { key: `${key}:room` }, select: { id: true } });
      return row && row.id.startsWith("sr_") ? row.id.slice(3) || null : null;
    },
  };
}
