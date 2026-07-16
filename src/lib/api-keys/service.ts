// Public API v1 — API key ต่อ tenant (WO-0061)
// platform-adjacent (นอก modules/ เหมือน payment/) — คีย์ให้สิทธิ์อ่านข้อมูลร้านผ่าน REST
//
// รูปแบบคีย์: rawKey = `shark_` + 32 ไบต์สุ่ม (hex 64 ตัว) → โชว์ **ครั้งเดียว** ตอนสร้าง
// DB เก็บเฉพาะ sha256(rawKey) ใน keyHash (raw ไม่เคยถูกเก็บ) + prefix 12 ตัวแรกไว้โชว์ในตาราง

import { createHash, randomBytes } from "node:crypto";
import { prisma, tenantDb } from "@/lib/core/db";

export type ApiKeyCtx = { tenantId: string };

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

export type CreatedApiKey = { id: string; rawKey: string; prefix: string };

// สร้างคีย์ใหม่ — คืน rawKey ให้โชว์ครั้งเดียว (เก็บ hash ลง DB ผ่าน tenantDb → inject tenantId)
export async function createApiKey(ctx: ApiKeyCtx, name: string): Promise<CreatedApiKey> {
  const clean = name.trim();
  if (!clean) throw new Error("กรุณาตั้งชื่อคีย์");
  // shark_ (6) + hex(64) = 70 ตัว → เกิน 32 ตัวเสมอ
  const rawKey = `shark_${randomBytes(32).toString("hex")}`;
  const prefix = rawKey.slice(0, 12);
  const row = await tenantDb(ctx).apiKey.create({
    data: { tenantId: ctx.tenantId, name: clean, keyHash: sha256hex(rawKey), prefix },
  });
  return { id: row.id, rawKey, prefix };
}

export type VerifiedApiKey = { tenantId: string; keyId: string };

// ตรวจ rawKey → คืน tenant/keyId ถ้าใช้ได้ · เพิกถอนแล้ว/ไม่มี → null · อัป lastUsedAt เมื่อผ่าน
export async function verifyApiKey(rawKey: unknown): Promise<VerifiedApiKey | null> {
  if (typeof rawKey !== "string" || !rawKey.startsWith("shark_")) return null;
  // hash lookup ก่อนรู้ tenant → prisma ตรงได้เฉพาะจุดนี้ (keyHash @unique · ยังไม่มีบริบท tenant)
  const row = await prisma.apiKey.findUnique({ where: { keyHash: sha256hex(rawKey) } });
  if (!row || row.revokedAt) return null;
  await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return { tenantId: row.tenantId, keyId: row.id };
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
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

// รายการคีย์ของร้าน — select ตัดคอลัมน์ keyHash ทิ้ง (ห้าม hash หลุดออก API/UI)
export async function listApiKeys(ctx: ApiKeyCtx): Promise<ApiKeyRow[]> {
  return tenantDb(ctx).apiKey.findMany({
    select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}
