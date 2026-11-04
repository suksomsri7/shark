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
import { logOps } from "@/lib/core/ops";
import { prisma } from "@/lib/core/db";
import { requireMobile, mobileError, mobileUser, type MobileAuth } from "@/lib/mobile/auth";
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

/**
 * ด่านของเส้นระดับกิจการ — Bearer + x-tenant-id (Membership ที่รับแล้ว · ร้านไม่ถูกระงับ) + คีย์สิทธิ์
 *   `access` ปริยาย = `ai.chat.send` (คีย์เดียวกับประตูเว็บของเลขา · lib/ai/actions.ts) · `null` = เป็นสมาชิกพอ (lib ตรวจต่อเอง)
 */
export async function gate(req: Request, access: AccessQuery | null = AI_CHAT): Promise<{ ok: true; c: SecCtx } | { ok: false; res: Response }> {
  const g = await requireMobile(req);
  if (!g.ok) return { ok: false, res: Response.json({ error: g.error, message: g.status === 401 ? "เข้าสู่ระบบใหม่อีกครั้ง" : "บัญชีนี้ไม่ได้อยู่ในกิจการนี้" }, { status: g.status }) };
  if (access && mobileDenied(g, access)) return { ok: false, res: forbidden(access === AI_CHAT ? DENY_TH : undefined) };
  const ua = Array.isArray(g.membership.unitAccess) ? (g.membership.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [];
  const m: MembershipCtx = { role: g.membership.role, unitAccess: ua, permissions: (g.membership.permissions ?? {}) as Record<string, unknown> };
  return { ok: true, c: { g, userId: g.user.id, tenantId: g.ctx.tenantId, m, conv: mobileAiCtx(g) } };
}

/** ด่านของเส้นระดับผู้ใช้ (ไม่ต้องมี x-tenant-id): inbox · tenants/create · invites/accept · account/* */
export async function userGate(req: Request): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const user = await mobileUser(req);
  if (!user) return { ok: false, res: mobileError({ ok: false, status: 401, error: "unauthorized" }) };
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
  const v = typeof raw === "string" ? decodeURIComponent(raw).trim() : "";
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
  if (e instanceof Error && THAI.test(e.message) && !/prisma|invalid `|\bat \w+ \(/i.test(e.message)) return fail(400, "invalid", e.message.slice(0, 300));
  await logOps("WARN", "secretary-api", `${where}: ล้ม`, { detail: e instanceof Error ? (e.stack ?? e.message) : String(e) }).catch(() => {});
  return fail(500, "server_error", "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง");
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
 * กันส่งซ้ำของ `clientMessageId` (แอป retry หลังเน็ตหลุด) — จองกุญแจ `sec:cmid:<ร้าน>:<ห้อง>:<id>` 24 ชม. ด้วยคำสั่งเดียว (ChatRateBucket · INSERT … ON CONFLICT)
 *   true = ครั้งแรก (ทำต่อ) · false = เคยส่งแล้ว (ตอบ duplicate) · `release` คืนกุญแจเมื่อการส่งครั้งแรกล้มก่อนสร้างข้อความ (retry ได้)
 */
export async function claimClientMessageId(tenantId: string, roomId: string, clientMessageId: string): Promise<{ first: boolean; release: () => Promise<void> }> {
  const key = `sec:cmid:${tenantId}:${roomId}:${clientMessageId}`;
  const r = await checkRateLimitDb(key, { limit: 1, windowMs: 24 * 3_600_000 });
  return { first: r.ok, release: async () => void (await prisma.chatRateBucket.deleteMany({ where: { key } }).catch(() => {})) };
}
