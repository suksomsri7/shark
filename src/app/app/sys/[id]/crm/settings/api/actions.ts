"use server";

// actions.ts — server action ของหน้า "CRM › ตั้งค่า › API" (ใบ C1.10 · แบบเดียวกับ member/api-actions.ts)
//
// ด่าน 3 ชั้น (ทุก action):
//   1) ระบบต้องเป็น CRM ของร้านนี้ และเปิด CRM ใหม่แล้ว (uiVersion 2 — R-E.14)
//   2) คีย์ของ CRM `crm.api.manage` (OWNER หรือได้รับชัดเจน — MANAGER ปริยายไม่ได้ §6.1)
//   3) สิทธิ์แพลตฟอร์ม `api.key.*` / `webhook.endpoint.*` (คีย์และฮุคเป็นของกลางของร้าน)
// 🔴 ไฟล์ "use server" export ได้เฉพาะฟังก์ชัน async (ชนิดผลลัพธ์อยู่ที่ `_components/shared.ts`)
// 🔴 ตัวกรองทีมของคีย์ต้องเป็นทีมของร้านนี้ (ตรวจกับฐานก่อนออกคีย์ — ทีมร้านอื่น = ปฏิเสธ)

import { revalidateAndWake } from "@/lib/modules/crm/outbox-wake"; // CRM C5.4-D ▸ L3-M1b: รีเฟรชหน้า + ปลุกคิว outbox หลังเขียนสำเร็จ ◂
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
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
import { assertCrmV2, CrmV2DisabledError } from "@/lib/modules/crm/ui-version";
import { crmKeyWiderThanCreator, crmWebhookWiderThanCreator } from "@/lib/modules/crm/api/key-guard"; // CRM C5.5 ▸ L55-4 +crmWebhookWiderThanCreator ◂
import type { MemberActor } from "@/lib/modules/member";
import { crmWebhookEventsCheck, crmWebhookUrlProblem, isCrmWebhookEndpoint } from "@/lib/modules/crm/api/webhook-events";
import type { CrmActionResult, CrmKeyResult, CrmWebhookCreateResult } from "./_components/shared";

const PATH = (systemId: string) => `/app/sys/${systemId}/crm/settings/api`;
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const BUNDLES = new Set(["crm.readonly", "crm.operate", "crm.admin"]);

// C4.3-fix ▸ เดิม gate() อยู่นอก try และ "โยน" error ⇒ พนักงานที่ไม่มีสิทธิ์กดแล้วได้ error ดิบของ Next แทนข้อความไทย ·
//   ตอนนี้คืน `{ ok:false, reason }` (รูปเดียวกับที่หน้าจอแสดงอยู่แล้ว) · requireTenant() อยู่นอก try โดยตั้งใจ — redirect
//   (ยังไม่ล็อกอิน/ร้านถูกระงับ) ต้องโยนต่อให้ Next พาไปหน้าที่ถูกต้อง ห้ามถูกกลืนเป็นข้อความ
type Gate = { ok: true; tenantId: string; userId: string; actor: MemberActor } | { ok: false; reason: string };
const NO_PLATFORM_RIGHT = "บัญชีนี้ยังไม่ได้รับสิทธิ์จัดการคีย์ API / webhook ของร้าน — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง";

async function gate(systemId: string, module: "api" | "webhook", platformAction: string): Promise<Gate> {
  const auth = await requireTenant();
  try {
    const tenantId = auth.active.tenantId;
    const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { id: true } });
    if (!system) return { ok: false, reason: "ไม่พบระบบ CRM นี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่" };
    await assertCrmV2({ tenantId, systemId });
    // AUDIT-CLASS X2: คีย์ของ CRM ก่อน แล้วค่อยสิทธิ์แพลตฟอร์ม
    const actor = toMemberActor(auth.user.id, auth.active);
    if (!crmCan(actor, "crm.api.manage")) {
      return { ok: false, reason: "บัญชีนี้ยังไม่ได้รับสิทธิ์จัดการคีย์ API ของ CRM — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง" };
    }
    assertCan(
      { role: auth.active.role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> },
      { module, action: platformAction },
    );
    return { ok: true, tenantId, userId: auth.user.id, actor };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, reason: NO_PLATFORM_RIGHT };
    // ปฏิเสธที่คาดไว้ (ระบบยังไม่เปิด CRM ใหม่) ไม่ต้อง log · อย่างอื่น = ไม่คาดคิด ⇒ log ชนิด error ล้วน (AUDIT-CLASS X8 แบบ `crm/*-actions.ts`)
    if (!(e instanceof CrmV2DisabledError)) console.error(`[crm.settings.api] ด่านสิทธิ์ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
    return { ok: false, reason: safeReason(e, "ตรวจสิทธิ์ไม่สำเร็จ — รีเฟรชหน้าแล้วลองอีกครั้ง") };
  }
}

/** C4.3-fix part 2 ▸ ปฏิเสธที่เป็นของช่องเดียว: `reason` เดิม + `fieldErrors` ให้ฟอร์มแสดงใต้ช่องนั้น ◂ */
const fieldFail = (field: string, reason: string) => ({ ok: false as const, reason, fieldErrors: { [field]: reason } });

/** ออกคีย์ของระบบ CRM นี้ (ผูก systemId เสมอ) — คืนคีย์ดิบครั้งเดียว · ตัวกรองทีม (ถ้าเลือก) เก็บเป็น pseudo-scope */
export async function createCrmApiKeyAction(fd: FormData): Promise<CrmKeyResult> {
  const systemId = s(fd, "systemId");
  const g = await gate(systemId, "api", "api.key.create");
  if (!g.ok) return g;
  const { tenantId, userId } = g;
  try {
    const name = s(fd, "name");
    // C4.3-fix part 2 ▸ ข้อความของช่อง "ชื่อคีย์" (ฟอร์มแสดงใต้ช่อง) ◂
    if (!name) return fieldFail("name", "ตั้งชื่อคีย์ให้จำง่ายก่อน เช่น ฟอร์มหน้าเว็บ — lead");
    if (name.length > 100) return fieldFail("name", "ชื่อคีย์ยาวได้ไม่เกิน 100 ตัวอักษร");
    const bundle = s(fd, "bundle") || "crm.readonly";
    if (!BUNDLES.has(bundle)) return { ok: false, reason: "ชุดสิทธิ์ที่เลือกไม่ใช่ชุดของ CRM — เลือกใหม่" };
    const scopes = expandBundles([bundle]);
    const teamId = s(fd, "teamId");
    if (teamId) {
      // AUDIT-CLASS X1: ทีมต้องเป็นของร้านนี้ (ทีมของร้านอื่น = ไม่พบ)
      if (!(await getTeam({ tenantId }, teamId))) return fieldFail("teamId", "ไม่พบทีมที่เลือกในร้านนี้ — รีเฟรชหน้าแล้วเลือกใหม่");
      scopes.push(`${CRM_FILTER_TEAM_PREFIX}${teamId}`);
    }
    // CRM C5.4-B ▸ L1-m1: คีย์กว้างกว่าคนออกไม่ได้ (ชุดสิทธิ์ ⊆ สิทธิ์ CRM ปัจจุบัน + การมองเห็น) — crm.admin จึงเป็นของเจ้าของร้าน
    const wider = await crmKeyWiderThanCreator({ tenantId, systemId }, g.actor, scopes);
    if (wider) return { ok: false, reason: wider };
    const expiresAt = new Date(Date.now() + DEFAULT_KEY_TTL_DAYS * 86_400_000);
    const { rawKey } = await createApiKey({ tenantId }, name, { scopes, systemId, expiresAt, createdById: userId });
    await writeAudit({ tenantId, actorId: userId, action: "crm.api.manage", targetType: "ApiKey", after: { created: name, bundle, teamId: teamId || null, systemId, expiresAt } });
    revalidateAndWake(PATH(systemId));
    return { ok: true, rawKey };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "สร้างคีย์ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** เพิกถอนคีย์ของระบบนี้ (มีผลทันที) — คีย์ของระบบอื่น = ไม่พบ */
export async function revokeCrmApiKeyAction(fd: FormData): Promise<CrmActionResult> {
  const systemId = s(fd, "systemId");
  const g = await gate(systemId, "api", "api.key.revoke");
  if (!g.ok) return g;
  const { tenantId, userId } = g;
  try {
    const keyId = s(fd, "keyId");
    const owned = keyId ? await prisma.apiKey.findFirst({ where: { id: keyId, tenantId, systemId }, select: { id: true } }) : null;
    if (!owned) return { ok: false, reason: "ไม่พบคีย์นี้ในระบบ CRM นี้ — รีเฟรชหน้าแล้วลองใหม่" };
    await revokeApiKey({ tenantId }, owned.id);
    await writeAudit({ tenantId, actorId: userId, action: "crm.api.manage", targetType: "ApiKey", targetId: owned.id, after: { revoked: true, systemId } });
    revalidateAndWake(PATH(systemId));
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
  const g = await gate(systemId, "webhook", "webhook.endpoint.create");
  if (!g.ok) return g;
  const { tenantId, userId } = g;
  try {
    const url = s(fd, "url");
    const problem = crmWebhookUrlProblem(url);
    if (problem) return fieldFail("url", problem);
    const checked = crmWebhookEventsCheck(fd.getAll("events").map((v) => String(v)));
    if (!checked.ok) return fieldFail("events", checked.reason);
    // CRM C5.5 ▸ L55-4: ปลายทางได้ event ของทุกระเบียนทุกทีม ⇒ คนเพิ่มต้องเห็น ALL ทั้งร้าน (กติกาเดียวกับคีย์ไม่กรอง C5.4-B) ◂
    const wider = await crmWebhookWiderThanCreator({ tenantId, systemId }, g.actor);
    if (wider) return { ok: false, reason: wider };
    const res = await createEndpoint({ tenantId }, { url, events: checked.events, by: { actor: g.actor } }); // CRM C5.5 ▸ by ◂
    await writeAudit({ tenantId, actorId: userId, action: "crm.api.manage", targetType: "WebhookEndpoint", targetId: res.id, after: { created: true, events: checked.events, systemId } });
    revalidateAndWake(PATH(systemId));
    return { ok: true, id: res.id, secret: res.secret };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เพิ่มปลายทางไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** พัก/เปิดใช้ปลายทาง */
export async function toggleCrmWebhookAction(fd: FormData): Promise<CrmActionResult> {
  const systemId = s(fd, "systemId");
  const g = await gate(systemId, "webhook", "webhook.endpoint.update");
  if (!g.ok) return g;
  const { tenantId, userId } = g;
  try {
    const row = await crmEndpoint(tenantId, s(fd, "endpointId"));
    if (!row) return { ok: false, reason: "ไม่พบปลายทางนี้ของ CRM — อาจถูกลบไปแล้ว" };
    const active = s(fd, "active") === "true";
    // CRM C5.5 ▸ L55-4: เปิดใช้ = แก้ปลายทางให้รับ event อีกครั้ง ⇒ ด่านเดียวกับตอนเพิ่ม (พักได้เสมอ) ◂
    if (active) {
      const wider = await crmWebhookWiderThanCreator({ tenantId, systemId }, g.actor);
      if (wider) return { ok: false, reason: wider };
    }
    await setEndpointActive({ tenantId }, row.id, active, { actor: g.actor }); // CRM C5.5 ▸ by ◂
    await writeAudit({ tenantId, actorId: userId, action: "crm.api.manage", targetType: "WebhookEndpoint", targetId: row.id, after: { active } });
    revalidateAndWake(PATH(systemId));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** ลบปลายทาง (ประวัติการส่งหายตาม) */
export async function deleteCrmWebhookAction(fd: FormData): Promise<CrmActionResult> {
  const systemId = s(fd, "systemId");
  const g = await gate(systemId, "webhook", "webhook.endpoint.delete");
  if (!g.ok) return g;
  const { tenantId, userId } = g;
  try {
    const row = await crmEndpoint(tenantId, s(fd, "endpointId"));
    if (!row) return { ok: false, reason: "ไม่พบปลายทางนี้ของ CRM — อาจถูกลบไปแล้ว" };
    await deleteEndpoint({ tenantId }, row.id);
    await writeAudit({ tenantId, actorId: userId, action: "crm.api.manage", targetType: "WebhookEndpoint", targetId: row.id, after: { deleted: true } });
    revalidateAndWake(PATH(systemId));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ลบไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
