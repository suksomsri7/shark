"use server";

// api-actions.ts — server action ของหน้า "สมาชิก › ตั้งค่า › API" (M1.11)
//
// 🔴 ไฟล์ `"use server"` export ได้เฉพาะ action — ตัวโหลดข้อมูลอยู่ที่หน้าเว็บ
//
// ด่าน 2 ชั้นเหมือนหน้าเชื่อมต่อของบัญชี/บอร์ดงาน:
//   1) สิทธิ์ของโมดูลสมาชิก — ต้องมี `member.api.manage` ชัด ๆ (§6.1: 1 ใน 4 คีย์ที่ MANAGER
//      **ไม่ได้** โดยปริยาย) เพราะคีย์ที่ออกจากหน้านี้อ่านฐานข้อมูลลูกค้าทั้งร้านได้
//   2) สิทธิ์แพลตฟอร์ม `api.key.create` / `api.key.revoke` (คีย์ API เป็นของกลางของร้าน ไม่ใช่ของโมดูล)

import { revalidatePath } from "next/cache";
import { assertCan } from "@/lib/core/rbac";
import { requireTenant } from "@/lib/core/context";
import { writeAudit } from "@/lib/core/audit";
import { createApiKey, revokeApiKey } from "@/lib/api-keys/service";
import { DEFAULT_KEY_TTL_DAYS, expandBundles, isApiScope } from "@/lib/api-keys/scopes";
import { safeReason } from "@/lib/core/errors";
import { prisma } from "./db";
import { hasMemberPerm, toMemberActor } from "./access";
import { createEndpoint, deleteEndpoint, getEndpoint, setEndpointActive, testEndpoint } from "@/lib/webhooks/service";
import { isMemberWebhookEndpoint, memberWebhookEventsCheck, memberWebhookUrlProblem } from "./api/webhook-events";
import type { MemberWebhookActionResult, MemberWebhookCreateResult, MemberWebhookTestResult } from "./api-shared";

export type MemberKeyResult = { ok: true; rawKey: string } | { ok: false; reason: string };
export type MemberApiActionResult = { ok: true } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/member/settings/api`;

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** ชุดสิทธิ์ที่หน้านี้ออกให้ได้ — นอกรายการนี้ = ปฏิเสธ (กันคนยิง FormData ขอชุดของโมดูลอื่น) */
const MEMBER_BUNDLE_IDS = new Set(["member-read", "member-operate", "member-admin"]);

/** ด่านของทุก action ที่นี่ — คืน tenantId/userId เมื่อผ่าน · ระบบต้องเป็น MEMBER ของร้านนี้จริง */
async function gate(systemId: string, platformAction: string) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  // ชั้นที่ 1 — สิทธิ์ในโมดูลสมาชิก (§6.1 · MANAGER ไม่ได้โดยปริยาย ⇒ ใช้ hasMemberPerm ไม่ใช่ assertCan)
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!hasMemberPerm(actor, "member.api.manage")) {
    throw new Error("บัญชีของคุณยังไม่ได้รับสิทธิ์จัดการคีย์ API ของระบบสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
  // ชั้นที่ 2 — สิทธิ์คีย์ API ของแพลตฟอร์ม (หน้าจอ /app/settings/api ใช้ชุดเดียวกัน)
  assertCan(
    { role: auth.active.role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> },
    { module: "api", action: platformAction },
  );
  const system = await prisma.appSystem.findFirst({
    where: { id: systemId, tenantId, type: "MEMBER" },
    select: { id: true },
  });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้");
  return { tenantId, userId: auth.user.id };
}

/**
 * ออกคีย์ API ของระบบสมาชิกนี้ — ผูก `systemId` เสมอ (คีย์ทำงานได้เฉพาะระบบที่ผูก)
 * คืนคีย์ดิบครั้งเดียว (DB เก็บแต่ hash) · ไม่ติ๊กสิทธิ์รายตัว = ใช้ทั้งชุดของ bundle ที่เลือก
 */
export async function createMemberApiKeyAction(fd: FormData): Promise<MemberKeyResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId, "api.key.create");
  const name = s(fd, "name");
  if (!name) return { ok: false, reason: "กรุณาตั้งชื่อคีย์ให้จำง่าย เช่น เว็บร้าน — สมัครสมาชิก" };
  const bundle = s(fd, "bundle") || "member-read";
  if (!MEMBER_BUNDLE_IDS.has(bundle)) return { ok: false, reason: "ชุดสิทธิ์ที่เลือกไม่ใช่ชุดของระบบสมาชิก" };
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
      action: "member.api.manage",
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
export async function revokeMemberApiKeyAction(fd: FormData): Promise<MemberApiActionResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId, "api.key.revoke");
  const keyId = s(fd, "keyId");
  if (!keyId) return { ok: false, reason: "ไม่พบคีย์ที่จะเพิกถอน" };
  try {
    await revokeApiKey({ tenantId }, keyId);
    await writeAudit({
      tenantId,
      actorId: userId,
      action: "member.api.manage",
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

// ───────────────────────── Webhook ของระบบสมาชิก (M3.10 · ภาพ 27 ขวา) ─────────────────────────
//
// ด่าน 2 ชั้นเหมือนคีย์: `member.api.manage` (โมดูลสมาชิก) + `webhook.endpoint.*` (แพลตฟอร์ม — หน้า /app/settings/webhooks ใช้ชุดเดียวกัน)
// 🔴 แตะได้เฉพาะ "ปลายทางของระบบสมาชิก" (สมัครเฉพาะเหตุการณ์ของระบบสมาชิก) — ปลายทางของบัญชี/ทั้งร้านแก้ที่ตั้งค่าร้านเท่านั้น
// 🔴 ผลลัพธ์ใช้ชนิดจาก `api-shared.ts` (ไฟล์นี้ห้าม export type เพิ่ม)

async function gateWebhook(systemId: string, platformAction: "webhook.endpoint.create" | "webhook.endpoint.update" | "webhook.endpoint.delete") {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!hasMemberPerm(actor, "member.api.manage")) {
    throw new Error("บัญชีของคุณยังไม่ได้รับสิทธิ์จัดการการเชื่อมต่อของระบบสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
  assertCan(
    { role: auth.active.role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> },
    { module: "webhook", action: platformAction },
  );
  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้");
  return { tenantId, userId: auth.user.id };
}

/** ปลายทางนี้เป็นของระบบสมาชิกในร้านนี้ไหม (ไม่ใช่ = "ไม่พบ") */
async function memberEndpoint(tenantId: string, id: string) {
  const row = await getEndpoint({ tenantId }, id);
  return row && isMemberWebhookEndpoint(row.eventsJson) ? row : null;
}

/** เพิ่มปลายทาง — https เท่านั้น · เหตุการณ์ของระบบสมาชิกอย่างน้อย 1 ตัว · secret คืนครั้งเดียว */
export async function createMemberWebhookAction(fd: FormData): Promise<MemberWebhookCreateResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gateWebhook(systemId, "webhook.endpoint.create");
  const url = s(fd, "url");
  const urlProblem = memberWebhookUrlProblem(url);
  if (urlProblem) return { ok: false, reason: urlProblem };
  const checked = memberWebhookEventsCheck(fd.getAll("events").map((v) => String(v)));
  if (!checked.ok) return { ok: false, reason: checked.reason };
  try {
    const res = await createEndpoint({ tenantId }, { url, events: checked.events });
    await writeAudit({
      tenantId,
      actorId: userId,
      action: "member.api.manage",
      targetType: "WebhookEndpoint",
      targetId: res.id,
      after: { created: true, events: checked.events, systemId },
    });
    revalidatePath(PATH(systemId));
    return { ok: true, id: res.id, secret: res.secret };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เพิ่มปลายทางไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** พัก/เปิดใช้ปลายทาง (secret เดิม · ระบบปลายทางไม่ต้องเปลี่ยนอะไร) */
export async function toggleMemberWebhookAction(fd: FormData): Promise<MemberWebhookActionResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gateWebhook(systemId, "webhook.endpoint.update");
  const row = await memberEndpoint(tenantId, s(fd, "endpointId"));
  if (!row) return { ok: false, reason: "ไม่พบปลายทางนี้ในระบบสมาชิก — อาจถูกลบไปแล้ว" };
  const active = s(fd, "active") === "true";
  try {
    await setEndpointActive({ tenantId }, row.id, active);
    await writeAudit({ tenantId, actorId: userId, action: "member.api.manage", targetType: "WebhookEndpoint", targetId: row.id, after: { active } });
    revalidatePath(PATH(systemId));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ลบปลายทาง (ประวัติการส่งหายตาม) */
export async function deleteMemberWebhookAction(fd: FormData): Promise<MemberWebhookActionResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gateWebhook(systemId, "webhook.endpoint.delete");
  const row = await memberEndpoint(tenantId, s(fd, "endpointId"));
  if (!row) return { ok: false, reason: "ไม่พบปลายทางนี้ในระบบสมาชิก — อาจถูกลบไปแล้ว" };
  try {
    await deleteEndpoint({ tenantId }, row.id);
    await writeAudit({ tenantId, actorId: userId, action: "member.api.manage", targetType: "WebhookEndpoint", targetId: row.id, after: { deleted: true } });
    revalidatePath(PATH(systemId));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ลบไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ยิงทดสอบ 1 ครั้ง (payload `{ test: true }` · ลงประวัติการส่งเหมือนของจริง) */
export async function testMemberWebhookAction(fd: FormData): Promise<MemberWebhookTestResult> {
  const systemId = s(fd, "systemId");
  const { tenantId } = await gateWebhook(systemId, "webhook.endpoint.update");
  const row = await memberEndpoint(tenantId, s(fd, "endpointId"));
  if (!row) return { ok: false, reason: "ไม่พบปลายทางนี้ในระบบสมาชิก — อาจถูกลบไปแล้ว" };
  try {
    const res = await testEndpoint({ tenantId }, row.id, "member.updated");
    revalidatePath(PATH(systemId));
    return { ok: true, delivered: res.delivered, error: res.error };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ทดสอบส่งไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
