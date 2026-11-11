// สร้างกิจการใหม่ + ผูกคนสร้างเป็น OWNER — single source ของ logic นี้
// (ทั้ง onboarding เว็บ createTenantAction และ POST /api/mobile/tenants เรียกตัวนี้ ห้าม copy สองที่)
// ห้าม import next/* ที่นี่ — ไฟล์นี้ถูก import โดย route ที่ oracle เรียก handler ตรงนอก Next context
import { SystemType, type Prisma, type Tenant } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { uniqueTenantSlug } from "@/lib/slug";
import { PERMISSION_MODULES } from "@/lib/core/permissions";
import { createSystemAutoLink } from "@/lib/modules/system/service";

// tenant + Membership OWNER ใน tx ที่ผู้เรียกเปิดไว้ (ใช้ร่วม createTenantForUser / createTenantFromApp)
async function createTenantTx(tx: Prisma.TransactionClient, userId: string, orgName: string): Promise<Tenant> {
  const slug = await uniqueTenantSlug(tx, orgName);
  const t = await tx.tenant.create({
    data: { name: orgName, slug, status: "ACTIVE", limits: { maxUnits: 10 } },
  });
  await tx.membership.create({
    data: { userId, tenantId: t.id, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() },
  });
  return t;
}

export async function createTenantForUser(userId: string, name: string): Promise<Tenant> {
  const orgName = name.trim();
  return prisma.$transaction((tx) => createTenantTx(tx, userId, orgName));
}

// ── SEC S1.25 ▸ สร้างกิจการจากแอป (แบบ G1) ─────────────────────────────────────
// ชื่อ 2–60 ตัว · ประเภท (ตัวพิมพ์เล็ก) ไม่รู้จัก = "other" · ระบบ ⊆ SystemType (ไม่รู้จัก/ซ้ำ = ตัด · ≤ 6) · เจ้าของได้ ≤ 3 ร้าน (นับแถว OWNER ที่ถูกระงับด้วย)
// เพดาน 3 ร้านตรวจใน tx เดียวกับการสร้าง + advisory lock ต่อผู้ใช้ (กดพร้อมกันหลายครั้งไม่ทะลุ 3)
// ระบบสร้างหลัง tx ด้วย `createSystemAutoLink` เดิม (ตัวนั้นใช้ prisma ของตัวเอง) · ห้องแรก = best-effort (นับงาน 1 ตามปกติ)
export const TENANT_TYPES = ["retail", "restaurant", "service", "clinic", "education", "dorm", "other"] as const;
export type TenantType = (typeof TENANT_TYPES)[number];
export const TENANT_MAX_OWNED = 3;
const TENANT_SYSTEMS_MAX = 6;
const TENANT_NAME_MIN = 2;
const TENANT_NAME_MAX = 60;
const TENANT_TYPE_LABEL: Record<TenantType, string> = {
  retail: "ร้านค้า",
  restaurant: "ร้านอาหาร",
  service: "งานบริการ",
  clinic: "คลินิก",
  education: "โรงเรียน/คอร์สเรียน",
  dorm: "หอพัก",
  other: "อื่น ๆ",
};

export type CreateTenantFromAppResult = {
  tenant: Tenant;
  systems: { type: string; id: string }[];
  /** SEC S3a.1-S1 R-Z3: `jobId` = งานของข้อความแรก (เกิดใน tx ของ startRoom) — route รันต่อใน `after()` · ไม่ทันก็ตัวเก็บตกรายนาที */
  room: { roomId: string; conversationId: string; jobId: string } | null;
};

/** ข้อผิดพลาดตามกติกา (ข้อความไทยให้ผู้ใช้) — route แยกจาก error ระบบได้ (R-S1.25j) */
export class TenantRuleError extends Error {}

export async function createTenantFromApp(
  userId: string,
  input: { name: string; type: string; systems: string[] },
  now: Date = new Date(),
): Promise<CreateTenantFromAppResult> {
  const orgName = String(input?.name ?? "").trim();
  if (orgName.length < TENANT_NAME_MIN || orgName.length > TENANT_NAME_MAX) {
    throw new TenantRuleError(`ชื่อกิจการต้องยาว ${TENANT_NAME_MIN}–${TENANT_NAME_MAX} ตัวอักษร`);
  }
  const rawType = typeof input?.type === "string" ? input.type.trim().toLowerCase() : "";
  const type: TenantType = (TENANT_TYPES as readonly string[]).includes(rawType) ? (rawType as TenantType) : "other";
  const known = new Set<string>(Object.values(SystemType));
  const systems: SystemType[] = [];
  for (const s of Array.isArray(input?.systems) ? input.systems : []) {
    const v = typeof s === "string" ? s.trim().toUpperCase() : "";
    if (known.has(v) && !systems.includes(v as SystemType)) systems.push(v as SystemType);
    if (systems.length >= TENANT_SYSTEMS_MAX) break;
  }

  const tenant = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tenant-create:${userId}`}, 0))`;
    // นับ OWNER ทุกแถวรวมที่ถูกระงับ (R-S1.25j) — ถูกระงับแล้วสร้างใหม่ ไม่ใช่ทางเลี่ยงเพดาน
    const owned = await tx.membership.count({ where: { userId, role: "OWNER" } });
    if (owned >= TENANT_MAX_OWNED) {
      throw new TenantRuleError(`สร้างกิจการได้สูงสุด ${TENANT_MAX_OWNED} ร้านต่อบัญชี — ถ้าต้องการเพิ่ม ติดต่อทีมงาน`);
    }
    return createTenantTx(tx, userId, orgName);
  });

  // ระบบที่เลือก — ชื่อไทยปริยายจากทะเบียนสิทธิ์ (label ของโมดูลชื่อเดียวกัน)
  const made: { type: string; id: string }[] = [];
  for (const st of systems) {
    const label = PERMISSION_MODULES.find((m) => m.module === st.toLowerCase())?.label ?? st;
    try {
      const sys = await createSystemAutoLink(tenant.id, st, label);
      made.push({ type: st, id: sys.id });
    } catch (e) {
      // ระบบหนึ่งล้มไม่พาร้าน/ระบบอื่นล้ม (R-S1.25j) — เจ้าของเปิดเพิ่มทีหลังได้
      await logTenantOps(tenant.id, `เปิดระบบ ${st} ไม่สำเร็จ: ${e instanceof Error ? e.message.slice(0, 160) : "error"}`);
    }
  }

  // ห้องแรก "ตั้งค่าเริ่มต้น" — โควตา/ล้ม ⇒ room null + logOps (ไม่ทำให้การสร้างร้านล้ม) · lazy: ไม่ลากชั้น AI เข้ากราฟของ onboarding เว็บ
  let room: CreateTenantFromAppResult["room"] = null;
  try {
    const { startRoom } = await import("@/lib/ai/secretary/rooms");
    const { aiMemberActor } = await import("@/lib/ai/actor");
    const actor = aiMemberActor(tenant.id, userId, { role: "OWNER", unitAccess: ["*"], permissions: {} });
    const r = await startRoom(
      { tenantId: tenant.id, actor },
      { instruction: `ตั้งค่าเริ่มต้นของกิจการ ${orgName} (ประเภท ${TENANT_TYPE_LABEL[type]}) — แนะนำสิ่งที่ควรตั้งค่าก่อนเป็นลำดับ` },
      now,
    );
    if (r.ok) room = { roomId: r.roomId, conversationId: r.conversationId, jobId: r.jobId };
    else await logTenantOps(tenant.id, `ห้องแรกไม่ได้เปิด: ${r.error}`);
  } catch (e) {
    await logTenantOps(tenant.id, `ห้องแรกไม่ได้เปิด: ${e instanceof Error ? e.message.slice(0, 160) : "error"}`);
  }
  return { tenant, systems: made, room };
}

async function logTenantOps(tenantId: string, message: string): Promise<void> {
  try {
    const { logOps } = await import("@/lib/core/ops");
    await logOps("WARN", "tenant-create", message, { tenantId });
  } catch {
    /* logger ห้ามพางานหลัก */
  }
}
