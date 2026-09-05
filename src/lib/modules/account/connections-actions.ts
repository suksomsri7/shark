"use server";

// connections-actions.ts — server actions ของหน้า "ตั้งค่า › การเชื่อมต่อ" (WO 8.3 · §9.5 · เฟรม g14)
//
// ทุกตัวผ่านด่านเดียวกัน: loadAccountSystem → assertAccountCan("account.settings.manage") → เขียน + audit
// คีย์ API / webhook เป็นของ **ระดับร้าน** (ไม่ผูกสมุดบัญชีเล่มใดเล่มหนึ่ง) ⇒ ตรวจสิทธิ์ของแพลตฟอร์มซ้ำอีกชั้น
// ด้วย `assertCan(module "api"/"webhook")` เหมือนหน้า /app/settings/api และ /app/settings/webhooks

import { revalidatePath } from "next/cache";
import { safeReason } from "./errors";
import type { AccountLinkedKind } from "@prisma/client";
import { assertCan } from "@/lib/core/rbac";
import { createApiKey, revokeApiKey } from "@/lib/api-keys/service";
import { createEndpoint, deleteEndpoint, dispatchWebhooks, setEndpointActive } from "@/lib/webhooks/service";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, mc, writeAudit } from "./access";
import { connect, disconnect, setLinkOptions, type LinkConfig, type ToggleKey } from "./connections";

const PATH = (systemId: string) => `/app/sys/${systemId}/account/settings/connections`;

async function gate(systemId: string) {
  const { auth, tenantId, userId } = await loadAccountSystem(systemId);
  assertAccountCan(auth, "account.settings.manage");
  return { auth, tenantId, systemId, userId };
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export type ConnResult = { ok: true } | { ok: false; reason: string };

/** เชื่อม / เชื่อมกลับ */
export async function connectAction(fd: FormData): Promise<ConnResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const kind = s(fd, "kind") as AccountLinkedKind;
  const linkedId = s(fd, "linkedId");
  const res = await connect({ tenantId, systemId }, kind, linkedId, userId);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.settings.manage",
    targetType: "AccountSystemLink",
    targetId: linkedId,
    after: res.ok ? { connected: kind } : { error: res.reason },
  });
  if (res.ok) revalidatePath(PATH(systemId));
  return res;
}

/** ตัดการเชื่อม (ไม่ลบแถว — ตัวเลือกยังอยู่ · เชื่อมกลับได้เหมือนเดิม) */
export async function disconnectAction(fd: FormData): Promise<ConnResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const kind = s(fd, "kind") as AccountLinkedKind;
  const linkedId = s(fd, "linkedId");
  const res = await disconnect({ tenantId, systemId }, kind, linkedId, userId);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.settings.manage",
    targetType: "AccountSystemLink",
    targetId: linkedId,
    after: res.ok ? { disconnected: kind } : { error: res.reason },
  });
  if (res.ok) revalidatePath(PATH(systemId));
  return res;
}

/** เปิด/ปิดตัวเลือกของการ์ด (ส่งมาทีละตัว — สวิตช์บนการ์ดมีผลทันที) */
export async function setLinkOptionAction(fd: FormData): Promise<ConnResult> {
  const systemId = s(fd, "systemId");
  const { tenantId, userId } = await gate(systemId);
  const kind = s(fd, "kind") as AccountLinkedKind;
  const linkedId = s(fd, "linkedId");
  const option = s(fd, "option") as ToggleKey;
  const on = s(fd, "on") === "1";
  const patch: LinkConfig = { [option]: on } as LinkConfig;
  const res = await setLinkOptions({ tenantId, systemId }, kind, linkedId, patch, userId);
  await writeAudit({
    tenantId,
    actorId: userId,
    action: "account.settings.manage",
    targetType: "AccountSystemLink",
    targetId: linkedId,
    after: res.ok ? { option, on } : { error: res.reason },
  });
  if (res.ok) revalidatePath(PATH(systemId));
  return res;
}

// ─────────────────────────── แอปภายนอก / API (ของแพลตฟอร์ม) ───────────────────────────

/** ออกคีย์ API ใหม่ — คืนคีย์ดิบครั้งเดียว (หลังจากนี้ดูไม่ได้อีก เพราะ DB เก็บแต่ hash) */
export async function createApiKeyAction(
  fd: FormData,
): Promise<{ ok: true; rawKey: string } | { ok: false; reason: string }> {
  const systemId = s(fd, "systemId");
  const { auth, tenantId, userId } = await gate(systemId);
  assertCan(mc(auth), { module: "api", action: "api.key.create" });
  const name = s(fd, "name");
  if (!name) return { ok: false, reason: "กรุณาตั้งชื่อคีย์ให้จำง่าย เช่น ระบบบัญชีของสำนักงานบัญชี" };
  try {
    const { rawKey } = await createApiKey({ tenantId }, name);
    await writeAudit({ tenantId, actorId: userId, action: "account.settings.manage", targetType: "ApiKey", after: { created: name } });
    revalidatePath(PATH(systemId));
    return { ok: true, rawKey };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "สร้างคีย์ไม่สำเร็จ") };
  }
}

/** เพิกถอนคีย์ API */
export async function revokeApiKeyAction(fd: FormData): Promise<ConnResult> {
  const systemId = s(fd, "systemId");
  const { auth, tenantId, userId } = await gate(systemId);
  assertCan(mc(auth), { module: "api", action: "api.key.revoke" });
  const id = s(fd, "id");
  if (!id) return { ok: false, reason: "ไม่รู้ว่าจะเพิกถอนคีย์ไหน" };
  await revokeApiKey({ tenantId }, id);
  await writeAudit({ tenantId, actorId: userId, action: "account.settings.manage", targetType: "ApiKey", targetId: id, after: { revoked: true } });
  revalidatePath(PATH(systemId));
  return { ok: true };
}

/** เพิ่มปลายทาง webhook (เลือกเหตุการณ์บัญชีได้) */
export async function createWebhookAction(fd: FormData): Promise<ConnResult> {
  const systemId = s(fd, "systemId");
  const { auth, tenantId, userId } = await gate(systemId);
  assertCan(mc(auth), { module: "webhook", action: "webhook.endpoint.create" });
  const url = s(fd, "url");
  if (!/^https?:\/\//i.test(url)) return { ok: false, reason: "ที่อยู่ปลายทางต้องขึ้นต้นด้วย http:// หรือ https://" };
  const events = fd.getAll("events").map((e) => String(e));
  try {
    await createEndpoint({ tenantId }, { url, events });
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เพิ่มปลายทางไม่สำเร็จ") };
  }
  await writeAudit({ tenantId, actorId: userId, action: "account.settings.manage", targetType: "WebhookEndpoint", after: { created: url } });
  revalidatePath(PATH(systemId));
  return { ok: true };
}

/** เปิด/ปิด หรือลบปลายทาง webhook */
export async function updateWebhookAction(fd: FormData): Promise<ConnResult> {
  const systemId = s(fd, "systemId");
  const { auth, tenantId, userId } = await gate(systemId);
  const id = s(fd, "id");
  const op = s(fd, "op");
  if (!id) return { ok: false, reason: "ไม่รู้ว่าจะแก้ปลายทางไหน" };
  if (op === "delete") {
    assertCan(mc(auth), { module: "webhook", action: "webhook.endpoint.delete" });
    await deleteEndpoint({ tenantId }, id);
  } else {
    assertCan(mc(auth), { module: "webhook", action: "webhook.endpoint.update" });
    await setEndpointActive({ tenantId }, id, op === "on");
  }
  await writeAudit({ tenantId, actorId: userId, action: "account.settings.manage", targetType: "WebhookEndpoint", targetId: id, after: { op } });
  revalidatePath(PATH(systemId));
  return { ok: true };
}

/** ยิงทดสอบ 1 ครั้ง — ใช้เส้นทางส่งจริงของแพลตฟอร์ม (จะเห็นผลในตาราง "การส่งล่าสุด") */
export async function testWebhookAction(fd: FormData): Promise<ConnResult> {
  const systemId = s(fd, "systemId");
  const { auth, tenantId, userId } = await gate(systemId);
  assertCan(mc(auth), { module: "webhook", action: "webhook.endpoint.update" });
  const type = s(fd, "type") || "account.document.approved";
  const n = await dispatchWebhooks({ tenantId, type, payload: { test: true, at: new Date().toISOString() } });
  await writeAudit({ tenantId, actorId: userId, action: "account.settings.manage", targetType: "WebhookEndpoint", after: { test: type, sent: n } });
  revalidatePath(PATH(systemId));
  return n > 0 ? { ok: true } : { ok: false, reason: "ยังไม่มีปลายทางที่สมัครรับเหตุการณ์นี้ — เพิ่มปลายทางก่อน" };
}
