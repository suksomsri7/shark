"use server";

// actions.ts — server action ของหน้า "CRM › ตั้งค่า › API" (ใบ C1.10 · แบบเดียวกับ member/api-actions.ts)
//
// ด่าน 3 ชั้น (ทุก action):
//   1) ระบบต้องเป็น CRM ของร้านนี้ และเปิด CRM ใหม่แล้ว (uiVersion 2 — R-E.14)
//   2) คีย์ของ CRM `crm.api.manage` (OWNER หรือได้รับชัดเจน — MANAGER ปริยายไม่ได้ §6.1)
//   3) สิทธิ์แพลตฟอร์ม `api.key.*` / `webhook.endpoint.*` (คีย์และฮุคเป็นของกลางของร้าน)
// 🔴 ไฟล์ "use server" export ได้เฉพาะฟังก์ชัน async (ชนิดผลลัพธ์อยู่ที่ `_components/shared.ts`)
// 🔴 ตัวกรองทีมของคีย์ต้องเป็นทีมของร้านนี้ (ตรวจกับฐานก่อนออกคีย์ — ทีมร้านอื่น = ปฏิเสธ)

import { revalidatePath } from "next/cache";
import { assertCan } from "@/lib/core/rbac";
import { requireTenant } from "@/lib/core/context";
import { writeAudit } from "@/lib/core/audit";
import { safeReason } from "@/lib/core/errors";
import { prisma } from "@/lib/core/db";
import { getTeam } from "@/lib/core/teams";
import { createApiKey, revokeApiKey } from "@/lib/api-keys/service";
import { CRM_FILTER_TEAM_PREFIX, DEFAULT_KEY_TTL_DAYS, expandBundles } from "@/lib/api-keys/scopes";
import { createEndpoint, deleteEndpoint, getEndpoint, setEndpointActive } from "@/lib/webhooks/service";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan } from "@/lib/modules/crm/access";
import { assertCrmV2 } from "@/lib/modules/crm/ui-version";
import { crmWebhookEventsCheck, crmWebhookUrlProblem, isCrmWebhookEndpoint } from "@/lib/modules/crm/api/webhook-events";
import type { CrmActionResult, CrmKeyResult, CrmWebhookCreateResult } from "./_components/shared";

const PATH = (systemId: string) => `/app/sys/${systemId}/crm/settings/api`;
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const BUNDLES = new Set(["crm.readonly", "crm.operate", "crm.admin"]);

async function gate(systemId: string, module: "api" | "webhook", platformAction: string) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบ CRM นี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");
  await assertCrmV2({ tenantId, systemId });
  // AUDIT-CLASS X2: คีย์ของ CRM ก่อน แล้วค่อยสิทธิ์แพลตฟอร์ม
  if (!crmCan(toMemberActor(auth.user.id, auth.active), "crm.api.manage")) {
    throw new Error("บัญชีนี้ยังไม่ได้รับสิทธิ์จัดการคีย์ API ของ CRM — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง");
  }
  assertCan(
    { role: auth.active.role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> },
    { module, action: platformAction },
  );
  return { tenantId, userId: auth.user.id };
}

/** ออกคีย์ของระบบ CRM นี้ (ผูก systemId เสมอ) — คืนคีย์ดิบครั้งเดียว · ตัวกรองทีม (ถ้าเลือก) เก็บเป็น pseudo-scope */
export async function createCrmApiKeyAction(fd: FormData): Promise<CrmKeyResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId, "api", "api.key.create");
  try {
    const name = s(fd, "name");
    if (!name) return { ok: false, reason: "ตั้งชื่อคีย์ให้จำง่ายก่อน เช่น ฟอร์มหน้าเว็บ — lead" };
    if (name.length > 100) return { ok: false, reason: "ชื่อคีย์ยาวได้ไม่เกิน 100 ตัวอักษร" };
    const bundle = s(fd, "bundle") || "crm.readonly";
    if (!BUNDLES.has(bundle)) return { ok: false, reason: "ชุดสิทธิ์ที่เลือกไม่ใช่ชุดของ CRM — เลือกใหม่" };
    const scopes = expandBundles([bundle]);
    const teamId = s(fd, "teamId");
    if (teamId) {
      // AUDIT-CLASS X1: ทีมต้องเป็นของร้านนี้ (ทีมของร้านอื่น = ไม่พบ)
      if (!(await getTeam({ tenantId }, teamId))) return { ok: false, reason: "ไม่พบทีมที่เลือกในร้านนี้ — รีเฟรชหน้าแล้วเลือกใหม่" };
      scopes.push(`${CRM_FILTER_TEAM_PREFIX}${teamId}`);
    }
    const expiresAt = new Date(Date.now() + DEFAULT_KEY_TTL_DAYS * 86_400_000);
    const { rawKey } = await createApiKey({ tenantId }, name, { scopes, systemId, expiresAt, createdById: userId });
    await writeAudit({ tenantId, actorId: userId, action: "crm.api.manage", targetType: "ApiKey", after: { created: name, bundle, teamId: teamId || null, systemId, expiresAt } });
    revalidatePath(PATH(systemId));
    return { ok: true, rawKey };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "สร้างคีย์ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** เพิกถอนคีย์ของระบบนี้ (มีผลทันที) — คีย์ของระบบอื่น = ไม่พบ */
export async function revokeCrmApiKeyAction(fd: FormData): Promise<CrmActionResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId, "api", "api.key.revoke");
  try {
    const keyId = s(fd, "keyId");
    const owned = keyId ? await prisma.apiKey.findFirst({ where: { id: keyId, tenantId, systemId }, select: { id: true } }) : null;
    if (!owned) return { ok: false, reason: "ไม่พบคีย์นี้ในระบบ CRM นี้ — รีเฟรชหน้าแล้วลองใหม่" };
    await revokeApiKey({ tenantId }, owned.id);
    await writeAudit({ tenantId, actorId: userId, action: "crm.api.manage", targetType: "ApiKey", targetId: owned.id, after: { revoked: true, systemId } });
    revalidatePath(PATH(systemId));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เพิกถอนคีย์ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

async function crmEndpoint(tenantId: string, id: string) {
  const row = id ? await getEndpoint({ tenantId }, id) : null;
  return row && isCrmWebhookEndpoint(row.eventsJson) ? row : null;
}

/** เพิ่มปลายทาง webhook ของ CRM — https เท่านั้น · เหตุการณ์ของ CRM อย่างน้อย 1 ตัว · secret คืนครั้งเดียว */
export async function createCrmWebhookAction(fd: FormData): Promise<CrmWebhookCreateResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId, "webhook", "webhook.endpoint.create");
  try {
    const url = s(fd, "url");
    const problem = crmWebhookUrlProblem(url);
    if (problem) return { ok: false, reason: problem };
    const checked = crmWebhookEventsCheck(fd.getAll("events").map((v) => String(v)));
    if (!checked.ok) return { ok: false, reason: checked.reason };
    const res = await createEndpoint({ tenantId }, { url, events: checked.events });
    await writeAudit({ tenantId, actorId: userId, action: "crm.api.manage", targetType: "WebhookEndpoint", targetId: res.id, after: { created: true, events: checked.events, systemId } });
    revalidatePath(PATH(systemId));
    return { ok: true, id: res.id, secret: res.secret };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เพิ่มปลายทางไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** พัก/เปิดใช้ปลายทาง */
export async function toggleCrmWebhookAction(fd: FormData): Promise<CrmActionResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId, "webhook", "webhook.endpoint.update");
  try {
    const row = await crmEndpoint(tenantId, s(fd, "endpointId"));
    if (!row) return { ok: false, reason: "ไม่พบปลายทางนี้ของ CRM — อาจถูกลบไปแล้ว" };
    const active = s(fd, "active") === "true";
    await setEndpointActive({ tenantId }, row.id, active);
    await writeAudit({ tenantId, actorId: userId, action: "crm.api.manage", targetType: "WebhookEndpoint", targetId: row.id, after: { active } });
    revalidatePath(PATH(systemId));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ลบปลายทาง (ประวัติการส่งหายตาม) */
export async function deleteCrmWebhookAction(fd: FormData): Promise<CrmActionResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId, "webhook", "webhook.endpoint.delete");
  try {
    const row = await crmEndpoint(tenantId, s(fd, "endpointId"));
    if (!row) return { ok: false, reason: "ไม่พบปลายทางนี้ของ CRM — อาจถูกลบไปแล้ว" };
    await deleteEndpoint({ tenantId }, row.id);
    await writeAudit({ tenantId, actorId: userId, action: "crm.api.manage", targetType: "WebhookEndpoint", targetId: row.id, after: { deleted: true } });
    revalidatePath(PATH(systemId));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ลบไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
