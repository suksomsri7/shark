"use server";

// settings-actions.ts — server action ของหน้า "บอร์ดงาน › ตั้งค่า › API" (K1.15)
//
// 🔴 ไฟล์ `"use server"` export ได้เฉพาะ action (กติกาข้อ 6 ของ run นี้) — ตัวโหลดข้อมูลอยู่ที่หน้าเว็บ
//
// ด่าน 2 ชั้นเหมือนหน้าเชื่อมต่อของบัญชี:
//   1) สิทธิ์โมดูลบอร์ดงาน — ต้องจัดการสมาชิกบอร์ดได้ (`kanban.board.member.manage`) เพราะคีย์ที่ออกจาก
//      หน้านี้ทำงานได้ทุกบอร์ดของระบบ (D18) ⇒ คนที่ออกคีย์ต้องเป็นระดับที่คุมสิทธิ์บอร์ดอยู่แล้ว
//   2) สิทธิ์แพลตฟอร์ม `api.key.create` / `api.key.revoke` (คีย์ API เป็นของกลางของร้าน ไม่ใช่ของโมดูล)

import { revalidatePath } from "next/cache";
import { assertCan } from "@/lib/core/rbac";
import { requireTenant } from "@/lib/core/context";
import { writeAudit } from "@/lib/core/audit";
import { createApiKey, revokeApiKey } from "@/lib/api-keys/service";
import { DEFAULT_KEY_TTL_DAYS, expandBundles, isApiScope } from "@/lib/api-keys/scopes";
import { safeReason } from "@/lib/core/errors";
import { prisma } from "./db";

export type KanbanKeyResult = { ok: true; rawKey: string } | { ok: false; reason: string };
export type KanbanActionResult = { ok: true } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/kanban/settings`;

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** ด่านของทุก action ที่นี่ — คืน tenantId/userId เมื่อผ่าน · ระบบต้องเป็น KANBAN ของร้านนี้จริง */
async function gate(systemId: string, platformAction: string) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const mc = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  // ชั้นที่ 1 — สิทธิ์ในโมดูลบอร์ดงาน (ออกคีย์ที่ทำงานได้ทุกบอร์ด = ระดับผู้ดูแล)
  assertCan(mc, { module: "kanban", action: "kanban.board.member.manage" });
  // ชั้นที่ 2 — สิทธิ์คีย์ API ของแพลตฟอร์ม (หน้าจอ /app/settings/api ใช้ชุดเดียวกัน)
  assertCan(mc, { module: "api", action: platformAction });
  const system = await prisma.appSystem.findFirst({
    where: { id: systemId, tenantId, type: "KANBAN" },
    select: { id: true },
  });
  if (!system) throw new Error("ไม่พบระบบบอร์ดงานนี้ในร้านนี้");
  return { tenantId, userId: auth.user.id };
}

/**
 * ออกคีย์ API ของระบบบอร์ดงานนี้ — ผูก `systemId` เสมอ (คีย์ทำงานได้เฉพาะระบบที่ผูก)
 * คืนคีย์ดิบครั้งเดียว (DB เก็บแต่ hash) · ไม่ติ๊กสิทธิ์รายตัว = ใช้ทั้งชุดของ bundle ที่เลือก
 */
export async function createKanbanApiKeyAction(fd: FormData): Promise<KanbanKeyResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId, "api.key.create");
  const name = s(fd, "name");
  if (!name) return { ok: false, reason: "กรุณาตั้งชื่อคีย์ให้จำง่าย เช่น ระบบแจ้งงานของช่าง" };
  const bundle = s(fd, "bundle") || "kanban-read";
  let scopes: string[];
  try {
    scopes = expandBundles([bundle]);
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ชุดสิทธิ์ที่เลือกไม่ถูกต้อง") };
  }
  for (const sc of scopes) {
    if (!isApiScope(sc)) return { ok: false, reason: `สิทธิ์ "${sc}" ใช้เป็นขอบเขตของคีย์ไม่ได้` };
  }
  const ttlRaw = s(fd, "ttlDays");
  const ttlDays = ttlRaw === "" ? DEFAULT_KEY_TTL_DAYS : Number(ttlRaw);
  if (!Number.isFinite(ttlDays) || ttlDays < 0) return { ok: false, reason: "จำนวนวันหมดอายุไม่ถูกต้อง" };
  const expiresAt = ttlDays === 0 ? null : new Date(Date.now() + ttlDays * 86_400_000);
  try {
    const { rawKey } = await createApiKey({ tenantId }, name, { scopes, systemId, expiresAt, createdById: userId });
    await writeAudit({
      tenantId,
      actorId: userId,
      action: "kanban.board.member.manage",
      targetType: "ApiKey",
      after: { created: name, bundle, scopes, systemId, expiresAt },
    });
    revalidatePath(PATH(systemId));
    return { ok: true, rawKey };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "สร้างคีย์ไม่สำเร็จ") };
  }
}

/** เพิกถอนคีย์ (มีผลทันที — คำขอถัดไปของคีย์นั้นได้ 401) */
export async function revokeKanbanApiKeyAction(fd: FormData): Promise<KanbanActionResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId, "api.key.revoke");
  const keyId = s(fd, "keyId");
  if (!keyId) return { ok: false, reason: "ไม่พบคีย์ที่จะเพิกถอน" };
  try {
    await revokeApiKey({ tenantId }, keyId);
    await writeAudit({
      tenantId,
      actorId: userId,
      action: "kanban.board.member.manage",
      targetType: "ApiKey",
      targetId: keyId,
      after: { revoked: true, systemId },
    });
    revalidatePath(PATH(systemId));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เพิกถอนคีย์ไม่สำเร็จ") };
  }
}
