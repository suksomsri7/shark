"use server";

// api-key-actions.ts — server action ของการ์ด "คีย์ API ของระบบขายหน้าร้าน" (ใบ P2.13 · brief §2.6 · มติ 3 · U-lite §7)
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} (Next ปิดข้อความ error ใน production)
// ด่าน 2 ชั้น (แบบ kanban/settings-actions.ts):
//   1) สิทธิ์ของโมดูล — `pos.settings.manage` (ตั้งค่าหน้าขาย › การเชื่อมต่อ)
//   2) สิทธิ์แพลตฟอร์ม — `api.key.create` (ออก) / `api.key.revoke` (เพิกถอน) — คีย์ API เป็นของกลางของร้าน
// กติกาการออกคีย์ (issuer rule · HF-APIV1 §1):
//   - ผูกระบบ POS นี้เสมอ (`systemId`) · ชุดสิทธิ์ต้องเป็น `pos-*` และทุก scope ต้องเป็นคีย์ของ POS (ไม่ออกสิทธิ์ของโมดูลอื่นจากหน้านี้)
//   - คีย์ทำได้ไม่เกินคนออก: คนที่ไม่ใช่เจ้าของ/ผู้จัดการ ต้องมีทุก scope ของชุดเอง · คนที่ไม่ได้ดูแลทุกสาขา ต้องจำกัดคีย์ไว้ที่สาขาของตัวเอง
//   - ตัวกรองสาขา (`pos.filter.unit:<id>`) ต้องชี้สาขาที่ผูกระบบ POS นี้เท่านั้น
//   - คีย์ดิบคืนครั้งเดียว (DB เก็บแต่ hash) · ไม่ลงบันทึกที่ไหน

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { createApiKey, revokeApiKey } from "@/lib/api-keys/service";
import { API_SCOPE_BUNDLES, DEFAULT_KEY_TTL_DAYS, expandBundles, isApiScope, POS_FILTER_UNIT_PREFIX, POS_SCOPE_KEYS } from "@/lib/api-keys/scopes";
import { writeAudit } from "@/lib/core/audit";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { prisma } from "./db";
import { posUnits } from "./register";

type Refusal = { ok: false; code: "PERMISSION_DENIED" | "VALIDATION" | "NOT_FOUND" | "UNKNOWN"; message: string };
const POS_BUNDLE_IDS: readonly string[] = ["pos-read", "pos-operate", "pos-admin"];
const TTL_CHOICES: readonly number[] = [30, 90, 365, 0];
const NAME_MAX = 60;
const PATH = (systemId: string) => `/app/sys/${systemId}/pos/settings`;

const refuse = (code: Refusal["code"], message: string): Refusal => ({ ok: false, code, message });
const DENIED = refuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์จัดการคีย์ API ของระบบขายหน้าร้าน");
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function unexpected(where: string, e: unknown): Refusal {
  unstable_rethrow(e);
  console.error(`[pos/api-key-actions] ${where}`, e instanceof Error ? e.name : "Error");
  return refuse("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
}

/** ด่านของทุก action — ร้านจาก session · ระบบต้องเป็น POS ของร้านนี้ · `pos.settings.manage` (+ สิทธิ์แพลตฟอร์มตามงาน) */
async function gate(systemIdRaw: unknown): Promise<{ tenantId: string; userId: string; systemId: string; m: MembershipCtx } | Refusal> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const m = posMembership(auth.active);
  const systemId = str(systemIdRaw);
  if (!systemId) return refuse("NOT_FOUND", "ไม่พบระบบขายหน้าร้านนี้");
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { id: true } });
  if (!sys) return refuse("NOT_FOUND", "ไม่พบระบบขายหน้าร้านนี้ในร้านนี้");
  // ด่านชั้นที่ 1 (F6.1): assertCan ของ RBAC — ไม่ผ่าน = คำปฏิเสธ (ไม่โยนออกจาก action)
  try {
    assertCan(m, { module: "pos", action: "pos.settings.manage" });
  } catch {
    return DENIED;
  }
  return { tenantId, userId: auth.user.id, systemId, m };
}

const canCreate = (m: MembershipCtx) => evaluate(m, { module: "api", action: "api.key.create" });
const canRevoke = (m: MembershipCtx) => evaluate(m, { module: "api", action: "api.key.revoke" });
const allUnits = (m: MembershipCtx) => m.role === "OWNER" || m.unitAccess.includes("*");

/** ชุดของ scope (ตรงชุดไหนพอดี · ไม่ตรง = custom) */
function bundleOf(scopes: string[]): string {
  const real = [...new Set(scopes.filter((s) => !s.startsWith(POS_FILTER_UNIT_PREFIX)))].sort().join(",");
  const hit = API_SCOPE_BUNDLES.find((b) => POS_BUNDLE_IDS.includes(b.id) && [...b.scopes].sort().join(",") === real);
  return hit ? hit.id : "custom";
}

/**
 * รายการคีย์ของระบบ POS นี้ (ไม่คืน hash · คืน prefix ไว้จำ) + สิทธิ์ของผู้ดู + สาขาที่ใช้ทำตัวกรองได้
 * เรียงใหม่ → เก่า · คีย์ที่เพิกถอนแล้วยังแสดง (สถานะ)
 */
export async function listPosApiKeysAction(input: { systemId: string }) {
  try {
    const g = await gate(isRecord(input) ? input.systemId : undefined);
    if ("ok" in g) return g;
    const rows = await prisma.apiKey.findMany({
      where: { tenantId: g.tenantId, systemId: g.systemId },
      select: { id: true, name: true, prefix: true, scopesJson: true, expiresAt: true, lastUsedAt: true, revokedAt: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    });
    const units = (await posUnits(g.tenantId, g.systemId)).filter((u) => canAccessUnit(g.m, u.id)).map((u) => ({ id: u.id, name: u.name }));
    const unitName = new Map(units.map((u) => [u.id, u.name]));
    const keys = rows.map((r) => {
      const scopes = Array.isArray(r.scopesJson) ? (r.scopesJson as unknown[]).filter((s): s is string => typeof s === "string") : [];
      const unitIds = scopes.filter((s) => s.startsWith(POS_FILTER_UNIT_PREFIX)).map((s) => s.slice(POS_FILTER_UNIT_PREFIX.length));
      return {
        id: r.id,
        name: r.name,
        prefix: r.prefix,
        bundle: bundleOf(scopes),
        scopeCount: scopes.length - unitIds.length,
        units: unitIds.map((id) => ({ id, name: unitName.get(id) ?? null })),
        createdAt: r.createdAt.toISOString(),
        lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        revokedAt: r.revokedAt?.toISOString() ?? null,
      };
    });
    return { ok: true as const, keys, units, allUnits: allUnits(g.m), canCreate: canCreate(g.m), canRevoke: canRevoke(g.m) };
  } catch (e) {
    return unexpected("list", e);
  }
}

/**
 * ออกคีย์ API ของระบบ POS นี้ — input {systemId, name, bundle (pos-read|pos-operate|pos-admin), ttlDays (30|90|365|0 = ไม่หมดอายุ), unitIds? (จำกัดสาขา)}
 * คืนคีย์ดิบครั้งเดียว
 */
export async function createPosApiKeyAction(input: { systemId: string; name: string; bundle: string; ttlDays?: number; unitIds?: string[] }) {
  try {
    if (!isRecord(input)) return refuse("VALIDATION", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
    const g = await gate(input.systemId);
    if ("ok" in g) return g;
    if (!canCreate(g.m)) return refuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ออกคีย์ API (api.key.create)");
    const name = str(input.name);
    if (!name || name.length > NAME_MAX) return refuse("VALIDATION", `ตั้งชื่อคีย์ให้จำง่าย (ไม่เกิน ${NAME_MAX} ตัวอักษร) เช่น แอปสั่งอาหารของร้าน`);
    const bundle = str(input.bundle);
    if (!POS_BUNDLE_IDS.includes(bundle)) return refuse("VALIDATION", "ชุดสิทธิ์ที่เลือกไม่ใช่ชุดของระบบขายหน้าร้าน — สิทธิ์ของระบบอื่นออกที่หน้าตั้งค่า API ของระบบนั้น");
    let scopes: string[];
    try {
      scopes = expandBundles([bundle]);
    } catch {
      return refuse("VALIDATION", "ชุดสิทธิ์ที่เลือกไม่ถูกต้อง");
    }
    for (const sc of scopes) {
      if (!isApiScope(sc) || !POS_SCOPE_KEYS.includes(sc)) return refuse("VALIDATION", `หน้านี้ออกคีย์ได้เฉพาะสิทธิ์ของระบบขายหน้าร้าน — สิทธิ์ "${sc}" ใช้ไม่ได้`);
      // คีย์ทำได้ไม่เกินคนออก: STAFF ต้องมีทุก scope ของชุดเอง (เจ้าของ/ผู้จัดการ = ตามบทบาท)
      if (!evaluate(g.m, { module: "pos", action: sc })) return refuse("PERMISSION_DENIED", `ออกคีย์ชุดนี้ไม่ได้ — บัญชีนี้ไม่มีสิทธิ์ "${sc}" เอง`);
    }
    // ตัวกรองสาขา: ต้องเป็นสาขาที่ผูกระบบ POS นี้และผู้ออกเข้าได้ · ผู้ที่ไม่ได้ดูแลทุกสาขาต้องจำกัดคีย์เสมอ
    const linked = new Set((await posUnits(g.tenantId, g.systemId)).filter((u) => canAccessUnit(g.m, u.id)).map((u) => u.id));
    const wanted = Array.isArray(input.unitIds) ? [...new Set(input.unitIds.map(str).filter(Boolean))] : [];
    if (wanted.some((u) => !linked.has(u))) return refuse("VALIDATION", "สาขาที่เลือกไม่ใช่สาขาของระบบขายหน้าร้านนี้");
    if (wanted.length === 0 && !allUnits(g.m)) return refuse("VALIDATION", "บัญชีนี้ดูแลไม่ครบทุกสาขา — เลือกสาขาที่คีย์นี้ใช้ได้");
    const ttlDays = input.ttlDays === undefined ? DEFAULT_KEY_TTL_DAYS : input.ttlDays;
    if (typeof ttlDays !== "number" || !TTL_CHOICES.includes(ttlDays)) return refuse("VALIDATION", "อายุคีย์ไม่ถูกต้อง");
    const expiresAt = ttlDays === 0 ? null : new Date(Date.now() + ttlDays * 86_400_000);
    const allScopes = [...scopes, ...wanted.map((u) => `${POS_FILTER_UNIT_PREFIX}${u}`)];
    const { id, rawKey, prefix } = await createApiKey({ tenantId: g.tenantId }, name, { scopes: allScopes, systemId: g.systemId, expiresAt, createdById: g.userId });
    await writeAudit({
      tenantId: g.tenantId,
      actorId: g.userId,
      action: "pos.api.key.create",
      targetType: "ApiKey",
      targetId: id,
      after: { name, bundle, systemId: g.systemId, unitIds: wanted, expiresAt, prefix },
    });
    revalidatePath(PATH(g.systemId));
    return { ok: true as const, keyId: id, rawKey, prefix };
  } catch (e) {
    return unexpected("create", e);
  }
}

/** เพิกถอนคีย์ของระบบ POS นี้ (มีผลทันที — คำขอถัดไปของคีย์นั้นได้ 401) */
export async function revokePosApiKeyAction(input: { systemId: string; keyId: string }) {
  try {
    if (!isRecord(input)) return refuse("VALIDATION", "ข้อมูลที่ส่งมาไม่ถูกต้อง");
    const g = await gate(input.systemId);
    if ("ok" in g) return g;
    if (!canRevoke(g.m)) return refuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์เพิกถอนคีย์ API (api.key.revoke)");
    const keyId = str(input.keyId);
    // เพิกถอนได้เฉพาะคีย์ที่ผูก **ระบบ POS นี้** (แบบ kanban HF-APIV1) — คีย์กลาง/คีย์ของระบบอื่น = ไม่พบ
    const owned = keyId ? await prisma.apiKey.findFirst({ where: { id: keyId, tenantId: g.tenantId, systemId: g.systemId }, select: { id: true, revokedAt: true } }) : null;
    if (!owned) return refuse("NOT_FOUND", "ไม่พบคีย์นี้ในระบบขายหน้าร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");
    if (!owned.revokedAt) {
      await revokeApiKey({ tenantId: g.tenantId }, keyId);
      await writeAudit({ tenantId: g.tenantId, actorId: g.userId, action: "pos.api.key.revoke", targetType: "ApiKey", targetId: keyId, after: { revoked: true, systemId: g.systemId } });
    }
    revalidatePath(PATH(g.systemId));
    return { ok: true as const };
  } catch (e) {
    return unexpected("revoke", e);
  }
}
