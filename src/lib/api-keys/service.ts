// Public API v1 — API key ต่อ tenant (WO-0061 · ขยายด้วย WO A1)
// platform-adjacent (นอก modules/ เหมือน payment/) — คีย์ให้สิทธิ์อ่านข้อมูลร้านผ่าน REST
//
// รูปแบบคีย์: rawKey = `shark_` + 32 ไบต์สุ่ม (hex 64 ตัว) → โชว์ **ครั้งเดียว** ตอนสร้าง
// DB เก็บเฉพาะ sha256(rawKey) ใน keyHash (raw ไม่เคยถูกเก็บ) + prefix 12 ตัวแรกไว้โชว์ในตาราง
//
// WO A1 เพิ่ม (ทั้งหมดเป็นของเสริม — เรียกแบบเดิม `createApiKey(ctx, name)` ได้ผลเท่าเดิมทุกอย่าง):
//   scope (permission key ชุดเดียวกับ RBAC) · ผูกสมุดบัญชี (systemId) · วันหมดอายุ · หมุนคีย์

import { createHash, randomBytes } from "node:crypto";
import { prisma, tenantDb } from "@/lib/core/db";
import { DEFAULT_KEY_TTL_DAYS, isApiScope } from "./scopes";

export type ApiKeyCtx = { tenantId: string };

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

const DAY_MS = 86_400_000;

export type CreatedApiKey = { id: string; rawKey: string; prefix: string };

export type CreateApiKeyOptions = {
  /** permission key ที่คีย์นี้ใช้ได้ — [] (ค่าปริยาย) = คีย์อ่านรุ่นเดิมของ /api/v1/* */
  scopes?: string[];
  /** ผูกคีย์กับระบบ (สมุดบัญชี/POS/…) เล่มเดียว — null = คีย์ระดับร้าน */
  systemId?: string | null;
  /** null = ไม่หมดอายุ */
  expiresAt?: Date | null;
  /** User.id คนกดสร้าง (ไว้ตอบว่าใครเปิดคีย์นี้) */
  createdById?: string | null;
};

// ── ตัวช่วยตรวจ input (ข้อความไทย — โผล่บนหน้าจอเจ้าของร้านตรง ๆ) ─────────────────
function normalizeScopes(scopes: string[] | undefined): string[] {
  if (!scopes) return [];
  const out: string[] = [];
  for (const raw of scopes) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!isApiScope(s)) throw new Error(`สิทธิ์ "${raw}" ใช้เป็นขอบเขตของ API key ไม่ได้`);
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** systemId ต้องเป็นระบบของร้านนี้จริง — ตรวจผ่าน tenantDb (กันคีย์ชี้ข้ามร้าน) */
async function resolveSystemId(ctx: ApiKeyCtx, systemId: string | null | undefined): Promise<string | null> {
  if (!systemId) return null;
  const found = await tenantDb(ctx).appSystem.findFirst({ where: { id: systemId }, select: { id: true } });
  if (!found) throw new Error("ไม่พบระบบที่จะผูกคีย์ในร้านนี้");
  return found.id;
}

function checkExpiry(expiresAt: Date | null | undefined): Date | null {
  if (!expiresAt) return null;
  if (expiresAt.getTime() <= Date.now()) throw new Error("วันหมดอายุของคีย์ต้องเป็นเวลาในอนาคต");
  return expiresAt;
}

/** scopesJson (Json ดิบจาก DB) → string[] ที่ใช้ต่อได้เสมอ */
function parseScopes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

const newRawKey = (): { rawKey: string; prefix: string } => {
  // shark_ (6) + hex(64) = 70 ตัว → เกิน 32 ตัวเสมอ
  const rawKey = `shark_${randomBytes(32).toString("hex")}`;
  return { rawKey, prefix: rawKey.slice(0, 12) };
};

// สร้างคีย์ใหม่ — คืน rawKey ให้โชว์ครั้งเดียว (เก็บ hash ลง DB ผ่าน tenantDb → inject tenantId)
export async function createApiKey(
  ctx: ApiKeyCtx,
  name: string,
  opts: CreateApiKeyOptions = {},
): Promise<CreatedApiKey> {
  const clean = name.trim();
  if (!clean) throw new Error("กรุณาตั้งชื่อคีย์");
  const scopes = normalizeScopes(opts.scopes);
  const systemId = await resolveSystemId(ctx, opts.systemId);
  const expiresAt = checkExpiry(opts.expiresAt);
  const { rawKey, prefix } = newRawKey();
  const row = await tenantDb(ctx).apiKey.create({
    data: {
      tenantId: ctx.tenantId,
      name: clean,
      keyHash: sha256hex(rawKey),
      prefix,
      scopesJson: scopes,
      systemId,
      expiresAt,
      createdById: opts.createdById ?? null,
    },
  });
  return { id: row.id, rawKey, prefix };
}

export type VerifiedApiKey = {
  tenantId: string;
  keyId: string;
  /** [] = คีย์รุ่นเดิม (ผู้เรียกเดิมไม่เคยอ่านฟิลด์นี้ → พฤติกรรมเดิมไม่เปลี่ยน) */
  scopes: string[];
  systemId: string | null;
  expiresAt: Date | null;
};

// lastUsedAt เป็นข้อมูล "เห็นภาพว่าคีย์ยังถูกใช้อยู่ไหม" ไม่ใช่ audit log ที่ต้องละเอียดถึงวินาที
// เดิมเขียนทุก request → เพดาน 60 ครั้ง/นาที/คีย์ = เขียน DB 60 ครั้ง/นาที เปล่า ๆ
// และผู้เรียกต้องรอ UPDATE จบก่อนได้คำตอบ (บวกรอบเดินทางไป Neon SG ให้ทุก API call)
const LAST_USED_GRANULARITY_MS = 60_000;

/** ผลตรวจคีย์แบบละเอียด — แยก "หมดอายุ" ออกจาก "ไม่ถูกต้อง" (REST บัญชีตอบคนละรหัส) */
export type ApiKeyVerification =
  | { status: "ok"; key: VerifiedApiKey & { name: string } }
  | { status: "expired" }
  | { status: "invalid" };

/**
 * ตรวจ rawKey แบบละเอียด — ใช้โดย REST บัญชี (WO A3) ที่ต้องตอบ 401 `key_expired`
 * แยกจาก 401 `unauthorized` เพื่อให้ผู้เชื่อมต่อรู้ว่า "ต้องหมุนคีย์" ไม่ใช่ "พิมพ์คีย์ผิด"
 *
 * คืน `name` มาด้วยเพื่อไม่ต้องอ่านแถวเดิมซ้ำตอนเขียน AuditLog (ทุกคำขอ = 1 query ไม่ใช่ 2)
 */
export async function verifyApiKeyDetailed(rawKey: unknown): Promise<ApiKeyVerification> {
  if (typeof rawKey !== "string" || !rawKey.startsWith("shark_")) return { status: "invalid" };
  // hash lookup ก่อนรู้ tenant → prisma ตรงได้เฉพาะจุดนี้ (keyHash @unique · ยังไม่มีบริบท tenant)
  const row = await prisma.apiKey.findUnique({ where: { keyHash: sha256hex(rawKey) } });
  if (!row || row.revokedAt) return { status: "invalid" };
  const now = Date.now();
  // หมดอายุ = ใช้ไม่ได้ และ **ไม่แตะ lastUsedAt** (ไม่ให้คีย์ตายแล้วดูเหมือนยังมีคนใช้)
  if (row.expiresAt && row.expiresAt.getTime() <= now) return { status: "expired" };
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > LAST_USED_GRANULARITY_MS) {
    // ไม่ await — คำตอบของ API ไม่ควรรอ bookkeeping · พังก็ไม่กระทบการยืนยันคีย์
    void prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date(now) } }).catch(() => {});
  }
  return {
    status: "ok",
    key: {
      tenantId: row.tenantId,
      keyId: row.id,
      scopes: parseScopes(row.scopesJson),
      systemId: row.systemId,
      expiresAt: row.expiresAt,
      name: row.name,
    },
  };
}

// ตรวจ rawKey → คืน tenant/keyId/scope ถ้าใช้ได้ · เพิกถอน/หมดอายุ/ไม่มี → null · แตะ lastUsedAt แบบหยาบ ๆ
export async function verifyApiKey(rawKey: unknown): Promise<VerifiedApiKey | null> {
  const v = await verifyApiKeyDetailed(rawKey);
  if (v.status !== "ok") return null;
  return {
    tenantId: v.key.tenantId,
    keyId: v.key.keyId,
    scopes: v.key.scopes,
    systemId: v.key.systemId,
    expiresAt: v.key.expiresAt,
  };
}

/**
 * หมุนคีย์ — เพิกถอนตัวเก่า + ออกตัวใหม่ที่คัดลอกสิทธิ์/สมุด/วันหมดอายุ ใน tx เดียว
 *
 * 🔴 การ "จอง" ตัวเก่าใช้ `updateMany(revokedAt: null)` แล้วดู count = 1 (อะตอมมิกใน SQL คำสั่งเดียว)
 *    ถ้าอ่านก่อนแล้วค่อยเขียน สองคำขอที่ยิงพร้อมกันจะได้คีย์ใหม่คนละใบจากคีย์แม่ใบเดียว
 */
export async function rotateApiKey(
  ctx: ApiKeyCtx,
  keyId: string,
  opts: { createdById?: string | null } = {},
): Promise<CreatedApiKey> {
  const { rawKey, prefix } = newRawKey();
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.apiKey.updateMany({
      where: { id: keyId, tenantId: ctx.tenantId, revokedAt: null },
      data: { revokedAt: now },
    });
    if (claimed.count !== 1) throw new Error("ไม่พบคีย์หรือถูกเพิกถอนแล้ว");
    const old = await tx.apiKey.findUniqueOrThrow({ where: { id: keyId } });
    // วันหมดอายุเดิมยังไม่ถึง → ใช้ต่อ (หมุนคีย์ไม่ใช่การต่ออายุ) · ไม่มี/เลยแล้ว → ตั้งใหม่ตามค่าปริยาย
    const expiresAt =
      old.expiresAt && old.expiresAt.getTime() > now.getTime()
        ? old.expiresAt
        : new Date(now.getTime() + DEFAULT_KEY_TTL_DAYS * DAY_MS);
    const row = await tx.apiKey.create({
      data: {
        tenantId: old.tenantId,
        name: old.name,
        keyHash: sha256hex(rawKey),
        prefix,
        scopesJson: parseScopes(old.scopesJson),
        systemId: old.systemId,
        expiresAt,
        createdById: opts.createdById ?? old.createdById,
        rotatedFromId: old.id,
      },
    });
    return { id: row.id, rawKey, prefix };
  });
}

// เพิกถอนคีย์ (idempotent) — คืน true เมื่อเพิ่งเพิกถอน · false ถ้าไม่มี/เพิกถอนไปแล้ว
export async function revokeApiKey(ctx: ApiKeyCtx, keyId: string): Promise<boolean> {
  const db = tenantDb(ctx);
  const row = await db.apiKey.findUnique({ where: { id: keyId } });
  if (!row || row.revokedAt) return false;
  await db.apiKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });
  return true;
}

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  systemId: string | null;
  expiresAt: Date | null;
  rotatedFromId: string | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

// รายการคีย์ของร้าน — select ตัดคอลัมน์ keyHash ทิ้ง (ห้าม hash หลุดออก API/UI)
export async function listApiKeys(ctx: ApiKeyCtx): Promise<ApiKeyRow[]> {
  const rows = await tenantDb(ctx).apiKey.findMany({
    select: {
      id: true,
      name: true,
      prefix: true,
      scopesJson: true,
      systemId: true,
      expiresAt: true,
      rotatedFromId: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(({ scopesJson, ...r }) => ({ ...r, scopes: parseScopes(scopesJson) }));
}
