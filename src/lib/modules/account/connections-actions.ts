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
import { createApiKey, revokeApiKey, rotateApiKey } from "@/lib/api-keys/service";
import { ACCOUNT_SCOPE_KEYS, DEFAULT_KEY_TTL_DAYS, expandBundles, isApiScope } from "@/lib/api-keys/scopes";
import { createEndpoint, deleteEndpoint, dispatchWebhooks, setEndpointActive } from "@/lib/webhooks/service";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/labels"; // CRM C5.5 ▸ กรองเหตุการณ์ ◂
import { loadAccountSystem } from "./guard";
import { assertAccountCan, mc, writeAudit } from "./access";
import { accountManagedKey, connect, disconnect, setLinkOptions, type LinkConfig, type ToggleKey } from "./connections";

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

/**
 * ออกคีย์ API ใหม่ — ผูกสมุดบัญชีเล่มนี้เสมอ (WO A2) · คืนคีย์ดิบครั้งเดียว (หลังจากนี้ดูไม่ได้อีก เพราะ DB เก็บแต่ hash)
 * `scope` (ที่ติ๊กจริงในหน้าจอ) เป็นค่าหลัก — ไม่ได้ติ๊กอะไรเลยแต่ส่ง `bundle` มา ⇒ ใช้ทั้งชุดของ bundle นั้นแทน
 */
export async function createApiKeyAction(
  fd: FormData,
): Promise<{ ok: true; rawKey: string } | { ok: false; reason: string }> {
  const systemId = s(fd, "systemId");
  const { auth, tenantId, userId } = await gate(systemId);
  assertCan(mc(auth), { module: "api", action: "api.key.create" });
  const name = s(fd, "name");
  if (!name) return { ok: false, reason: "กรุณาตั้งชื่อคีย์ให้จำง่าย เช่น ระบบบัญชีของสำนักงานบัญชี" };
  const bundle = s(fd, "bundle");
  let scopes = fd.getAll("scope").map((v) => String(v).trim()).filter(Boolean);
  if (scopes.length === 0 && bundle) {
    try {
      scopes = expandBundles([bundle]);
    } catch (e) {
      return { ok: false, reason: safeReason(e, "ชุดสิทธิ์ที่เลือกไม่ถูกต้อง") };
    }
  }
  for (const sc of scopes) {
    if (!isApiScope(sc)) return { ok: false, reason: `สิทธิ์ "${sc}" ใช้เป็นขอบเขตของคีย์ไม่ได้` };
    // C5.5-authz-sweep ▸ หน้านี้ออกคีย์ได้เฉพาะสิทธิ์ของระบบบัญชี (ที่หน้าจอมีให้ติ๊ก = ACCOUNT_SCOPE_KEYS / ชุด account) — เดิมรับ `crm.*`/`member.*`
    //   ที่ส่งมาเอง ⇒ ผู้จัดการบัญชีออกคีย์ที่ REST บัญชีแปลงเป็นผู้ดู CRM/สมาชิก (`crmViewerOfApi`) โดยไม่ผ่านด่านออกคีย์ของ CRM
    //   (`crm.api.manage` + `crmKeyWiderThanCreator`) หรือของสมาชิก (`member.api.manage`) · สิทธิ์ของระบบอื่นออกที่หน้า API ของระบบนั้น ◂
    if (!ACCOUNT_SCOPE_KEYS.includes(sc)) {
      return { ok: false, reason: `หน้านี้ออกคีย์ได้เฉพาะสิทธิ์ของระบบบัญชี — สิทธิ์ "${sc}" ต้องออกที่หน้าตั้งค่า API ของระบบนั้น` };
    }
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
      action: "account.settings.manage",
      targetType: "ApiKey",
      after: { created: name, scopes, systemId, expiresAt },
    });
    revalidatePath(PATH(systemId));
    return { ok: true, rawKey };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "สร้างคีย์ไม่สำเร็จ") };
  }
}

// CRM C5.4-B ▸ hunter H2: หน้านี้จัดการได้เฉพาะคีย์ "ของบัญชี" — คีย์ที่ผูกระบบบัญชี (สมุดใดก็ได้ของร้าน — หน้านี้แสดงคีย์ทุกเล่ม · WO A2)
//   หรือคีย์ไม่ผูกระบบที่ไม่มี scope ของโมดูลอื่น · คีย์ของ CRM/สมาชิก/บอร์ดงาน = "ไม่พบ" (จัดการจากหน้าตั้งค่า API ของโมดูลนั้นเท่านั้น —
//   เดิมพนักงานบัญชีหมุนคีย์ crm.admin ของเจ้าของได้: คีย์เดิมถูกเพิกถอน + ได้คีย์ใหม่ที่ข้ามด่านออกคีย์ของ CRM)
const KEY_NOT_HERE = "ไม่พบคีย์นี้ในหน้าการเชื่อมต่อของบัญชี — คีย์ของระบบอื่นจัดการได้จากหน้าตั้งค่า API ของระบบนั้น";

/** เพิกถอนคีย์ API */
export async function revokeApiKeyAction(fd: FormData): Promise<ConnResult> {
  const systemId = s(fd, "systemId");
  const { auth, tenantId, userId } = await gate(systemId);
  assertCan(mc(auth), { module: "api", action: "api.key.revoke" });
  const id = s(fd, "id");
  if (!id) return { ok: false, reason: "ไม่รู้ว่าจะเพิกถอนคีย์ไหน" };
  if (!(await accountManagedKey(tenantId, id))) return { ok: false, reason: KEY_NOT_HERE };
  await revokeApiKey({ tenantId }, id);
  await writeAudit({ tenantId, actorId: userId, action: "account.settings.manage", targetType: "ApiKey", targetId: id, after: { revoked: true } });
  revalidatePath(PATH(systemId));
  return { ok: true };
}

/** หมุนคีย์ API — เพิกถอนตัวเก่า + ออกตัวใหม่ที่คัดลอกชื่อ/สิทธิ์/สมุด/วันหมดอายุ (rawKey ใหม่โชว์ครั้งเดียว) */
export async function rotateApiKeyAction(
  fd: FormData,
): Promise<{ ok: true; rawKey: string } | { ok: false; reason: string }> {
  const systemId = s(fd, "systemId");
  const { auth, tenantId, userId } = await gate(systemId);
  assertCan(mc(auth), { module: "api", action: "api.key.create" });
  const id = s(fd, "id");
  if (!id) return { ok: false, reason: "ไม่รู้ว่าจะหมุนคีย์ไหน" };
  if (!(await accountManagedKey(tenantId, id))) return { ok: false, reason: KEY_NOT_HERE };
  try {
    const { rawKey } = await rotateApiKey({ tenantId }, id, { createdById: userId });
    await writeAudit({ tenantId, actorId: userId, action: "account.settings.manage", targetType: "ApiKey", targetId: id, after: { rotated: true } });
    revalidatePath(PATH(systemId));
    return { ok: true, rawKey };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "หมุนคีย์ไม่สำเร็จ") };
  }
}

/** เพิ่มปลายทาง webhook (เลือกเหตุการณ์บัญชีได้) */
export async function createWebhookAction(fd: FormData): Promise<ConnResult> {
  const systemId = s(fd, "systemId");
  const { auth, tenantId, userId } = await gate(systemId);
  assertCan(mc(auth), { module: "webhook", action: "webhook.endpoint.create" });
  const url = s(fd, "url");
  if (!/^https?:\/\//i.test(url)) return { ok: false, reason: "ที่อยู่ปลายทางต้องขึ้นต้นด้วย http:// หรือ https://" };
  // CRM C5.5 ▸ (fix1 r2 · มติผู้คุมงานข้อ 5) หน้านี้เลือกได้เฉพาะเหตุการณ์บัญชี ⇒ กรองให้เหลือ account.* ที่มีในทะเบียนจริง (เดิมรับทุกค่าที่ส่งมา)
  //   · ผู้ทำ = ผู้ใช้ที่ล็อกอิน (ตัวกันเหตุการณ์กลาง — รายการว่าง = ทุกเหตุการณ์ ต้องผ่านกติกา CRM เมื่อร้านมี CRM v2) ◂
  const named = fd
    .getAll("events")
    .map((e) => String(e).trim())
    .filter((e) => e !== "");
  const events = named.filter((e) => e.startsWith("account.") && WEBHOOK_EVENTS.some((w) => w.value === e));
  // CRM C5.5 ▸ (fix3a · R2-1) ฟอร์มระบุเหตุการณ์มา ≥1 แต่ไม่มีตัวไหนเป็นเหตุการณ์บัญชีเลย ⇒ ปฏิเสธ (เดิมกรองจนเหลือ [] = "ทุกเหตุการณ์ของร้าน"
  //   ทั้ง CRM/สมาชิก/แชท — ตรงข้ามกับที่ผู้ใช้ขอ) · ไม่ส่งเหตุการณ์มาเลย = ทุกเหตุการณ์ ตามที่หน้าบอกไว้ (ตัวกันเหตุการณ์กลางตรวจต่อ) ◂
  if (named.length > 0 && events.length === 0) {
    return { ok: false, reason: "หน้านี้เลือกได้เฉพาะเหตุการณ์ของระบบบัญชี — เหตุการณ์ของระบบอื่นตั้งที่หน้า ตั้งค่า › Webhooks ของร้าน" };
  }
  try {
    await createEndpoint({ tenantId }, { url, events, by: { userId } });
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
    // CRM C5.5 ▸ (fix3a · R2-3) ตัวกันเหตุการณ์ปฏิเสธการเปิด ⇒ คืนเหตุผลไทยทางช่องปกติของหน้า (เดิมโยนออกไปหน้า error) ◂
    try {
      await setEndpointActive({ tenantId }, id, op === "on", { userId }); // CRM C5.5 ▸ by: เปิด = ตัวกันเหตุการณ์ตรวจ ◂
    } catch (e) {
      return { ok: false, reason: safeReason(e, "แก้ปลายทางไม่สำเร็จ") };
    }
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
  // C5.5-authz-sweep ▸ ยิงทดสอบได้เฉพาะเหตุการณ์ของระบบบัญชีที่มีในทะเบียน (เดิมส่ง `type` ดิบของ client ไปทุกปลายทางของร้าน ⇒ ปลอม
  //   `crm.deal.won`/`member.*` ใส่ระบบเชื่อมต่อของ CRM/สมาชิกได้) — REST บัญชี `webhooks.test` ก็รับเฉพาะเหตุการณ์ที่รู้จัก ·
  //   ปุ่มในหน้าส่ง "ป้ายไทย" ของเหตุการณ์มา ⇒ แปลงป้ายกลับเป็นค่าก่อน ◂
  const asked = s(fd, "type") || "account.document.approved";
  const ev = WEBHOOK_EVENTS.find((w) => w.value.startsWith("account.") && (w.value === asked || w.label === asked));
  if (!ev) return { ok: false, reason: "ยิงทดสอบได้เฉพาะเหตุการณ์ของระบบบัญชี" };
  const type = ev.value;
  const n = await dispatchWebhooks({ tenantId, type, payload: { test: true, at: new Date().toISOString() } });
  await writeAudit({ tenantId, actorId: userId, action: "account.settings.manage", targetType: "WebhookEndpoint", after: { test: type, sent: n } });
  revalidatePath(PATH(systemId));
  return n > 0 ? { ok: true } : { ok: false, reason: "ยังไม่มีปลายทางที่สมัครรับเหตุการณ์นี้ — เพิ่มปลายทางก่อน" };
}
