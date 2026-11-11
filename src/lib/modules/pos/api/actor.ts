// actor.ts — "คีย์ API" กลายเป็นผู้ขายของระบบขายหน้าร้านได้อย่างไร (ใบ P2.13 · brief §2.3 · มติ 2 3 4)
//
// ปัญหา: facade ของ POS แทบทุกตัวรับ `(ctx, actor: RegisterActor, input)` — actor รูปคน {userId, role, unitAccess, permissions}
//   (register-shared.ts) · catalog.ts หา Membership จริงจาก `actorUserId` · แกน REST ให้ `ApiActor` ที่มีแค่ scope ของคีย์
// ทางออก (มติ 3): actor สังเคราะห์ระดับ STAFF ต่อคีย์ —
//   `userId = keyId` (บิล/กะ/รายงานผูกกับ "แอปที่ถือคีย์" ไม่ใช่เจ้าของร้านที่ออกคีย์ · ยังทำงานต่อได้หลังคนออกคีย์ลาออก)
//   `role "STAFF"` (evaluate ตรวจคีย์ตรงตัว — ไม่มีวันเป็น MANAGER/OWNER) · `permissions = scope ของคีย์` (ตัดตัวกรองสาขาทิ้ง)
//   `unitAccess = ["*"]` หรือสาขาตามตัวกรอง `pos.filter.unit:<unitId>` (มติ 2)
// catalog (มติ 4): `CatalogCtx.actorMembership` = Membership ที่สร้างจาก scope ที่นี่ + `actorUserId = "apikey:<keyId>"` —
//   catalog.ts ใช้ก็ต่อเมื่อทั้งสองอย่างมาคู่กัน (หน้าจอส่งได้แค่ userId ของคนจริง) ⇒ สิทธิ์ = scope ของคีย์ ไม่ใช่ของผู้ออกคีย์
// 🔴 actor ของคนในร้าน (kind "user" — ผู้กดยืนยันข้อเสนอ AI · ข้อสอบ P0.2) ใช้ Membership จริงของเขาเหมือนเดิม

import { membershipFromScopes, type ApiActor } from "@/lib/api/actor";
import { isPosFilterScope, POS_FILTER_UNIT_PREFIX } from "@/lib/api-keys/scopes";
import { canAccessUnit, type MembershipCtx } from "@/lib/core/rbac";
import { CATALOG_API_ACTOR_PREFIX, type CatalogCtx } from "../catalog";
import type { RegisterActor, RegisterRole } from "../register-shared";

/** ข้อความไทยเมื่อคีย์ไม่มีสิทธิ์ทำ op ของระบบขายหน้าร้าน */
export const POS_DENY_TH = "คีย์นี้ไม่มีสิทธิ์ทำรายการนี้ในระบบขายหน้าร้าน";

/** scope จริงของคีย์ (ตัดตัวกรองสาขาซึ่งเป็น pseudo-scope ทิ้ง) */
export function posRealScopes(scopes: readonly string[]): string[] {
  return scopes.filter((s) => !s.startsWith(POS_FILTER_UNIT_PREFIX));
}

/** สาขาที่คีย์ถูกจำกัดไว้ (`pos.filter.unit:<id>`) · null = ไม่จำกัด (ทุกสาขาที่ผูกระบบ POS ของคีย์) */
export function posUnitFilterOf(scopes: readonly string[]): string[] | null {
  const units = scopes.filter(isPosFilterScope).map((s) => s.slice(POS_FILTER_UNIT_PREFIX.length));
  return units.length ? [...new Set(units)] : null;
}

/** `ApiActor` ของแกน REST สำหรับคีย์ของระบบขายหน้าร้าน (`ApiModuleConfig.makeActor`) */
export function posApiKeyActor(input: {
  tenantId: string;
  systemId: string;
  keyId: string;
  keyName: string;
  scopes: string[];
  createdById?: string | null;
}): ApiActor {
  const real = posRealScopes(input.scopes);
  return {
    kind: "apikey",
    module: "pos",
    tenantId: input.tenantId,
    systemId: input.systemId,
    keyId: input.keyId,
    keyName: input.keyName,
    // คีย์ไม่มีตัวตนคน — ผู้ขายของบิลคือ keyId (ดู posRegisterActorOf) ไม่ใช่ผู้สร้างคีย์
    userId: null,
    scopes: [...input.scopes],
    membership: { ...membershipFromScopes(real), unitAccess: posUnitFilterOf(input.scopes) ?? ["*"] },
    // STAFF ตรงตัว (เหมือน evaluate ของ RBAC) — scope ที่ไม่ได้ติ๊ก = ไม่มีสิทธิ์ ไม่มีการอนุมานข้ามคีย์
    can: (action) => real.includes(action),
    denyMessageTh: POS_DENY_TH,
  };
}

const ROLES: readonly RegisterRole[] = ["OWNER", "MANAGER", "STAFF"];

/**
 * `ApiActor` → actor รูปคนที่ facade ของ POS รับ
 *   คีย์ API = actor สังเคราะห์ STAFF (userId = keyId · มติ 3) · คนในร้าน = Membership จริงของเขา
 */
export function posRegisterActorOf(actor: ApiActor): RegisterActor {
  if (actor.kind === "apikey") {
    return {
      userId: actor.keyId ?? "",
      role: "STAFF",
      unitAccess: posUnitFilterOf(actor.scopes) ?? ["*"],
      permissions: Object.fromEntries(posRealScopes(actor.scopes).map((s) => [s, true])),
    };
  }
  const role = ROLES.includes(actor.membership.role as RegisterRole) ? (actor.membership.role as RegisterRole) : "STAFF";
  return { userId: actor.userId ?? "", role, unitAccess: [...actor.membership.unitAccess], permissions: { ...actor.membership.permissions } };
}

/** ผู้กระทำใช้สาขานี้ได้ไหม (ตัวกรองของคีย์ / สิทธิ์สาขาของคน) — ไม่ได้ = ตอบ 404 เหมือนไม่มีสาขานั้น */
export function posActorCanUseUnit(actor: ApiActor, unitId: string): boolean {
  if (actor.kind === "apikey") {
    const only = posUnitFilterOf(actor.scopes);
    return !only || only.includes(unitId);
  }
  return canAccessUnit(actor.membership, unitId);
}

/** ctx ของ catalog.ts (มติ 4) — คีย์ = Membership สังเคราะห์จาก scope · คน = userId ของเขา (catalog หา Membership เอง) */
export function posCatalogCtxOf(actor: ApiActor): CatalogCtx {
  if (actor.kind === "apikey") {
    const ra = posRegisterActorOf(actor);
    const membership: MembershipCtx = { role: "STAFF", unitAccess: ra.unitAccess, permissions: ra.permissions };
    return { tenantId: actor.tenantId, systemId: actor.systemId, actorUserId: `${CATALOG_API_ACTOR_PREFIX}${actor.keyId ?? ""}`, actorMembership: membership };
  }
  return { tenantId: actor.tenantId, systemId: actor.systemId, actorUserId: actor.userId ?? "" };
}
