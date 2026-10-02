// actor.ts — "ใครกำลังใช้เครื่องมือของผู้ช่วย AI" (CRM C5.5-G1)
//
// 🔴 ก่อนใบนี้ tool ทุกตัวรันด้วย tenantId อย่างเดียว ⇒ ใครก็ตามที่ถือ `ai.chat.send` ได้ทุก tool ของร้าน
//    (เบอร์ลูกค้ามุ่งหวังทุกระบบ CRM · การเงินทั้งเดือน · เขียนคลังความรู้โดยไม่มี `kb.article.create` ฯลฯ)
//    ตอนนี้ `runTool` รับ actor เป็นอาร์กิวเมนต์บังคับ (ลืมส่ง = typecheck แดง ไม่ใช่เปิดทั้งร้านเงียบ ๆ)
//    และ tool แต่ละตัวใช้คีย์สิทธิ์ + ขอบเขตการมองเห็นชุดเดียวกับประตูเว็บ/REST ของข้อมูลเดียวกัน (ดู ./tool-access.ts)
//
// ผู้กระทำ 3 แบบ:
//   member  คนในร้าน (เว็บ · แอป · หน้าผู้ช่วยของโมดูล) — สิทธิ์ = Membership ของคนนั้น ณ คำขอนี้
//   apiKey  คีย์ API ของร้าน (`/api/v1/ai/tools/*`) — สิทธิ์ = scope ของคีย์ (ไม่มีคน ไม่มีบทบาท)
//   system  งานภายในที่ไม่มีคนกด — มีชื่องานตายตัวใน `AI_SYSTEM_JOBS` (grep `aiSystemActor(` ได้ทุกจุด)
//           สิทธิ์ = ของ "ผู้รับผลงาน" ไม่ใช่ทั้งร้าน (ดูคำอธิบายของแต่ละงานข้างล่าง)
//
// 🔴 ไฟล์นี้ต้องเบา: ห้าม import บริการ/โมดูล (ทะเบียน AI ถูกโหลดในโหมดไร้ env ของ fitness F10)

import type { MembershipCtx } from "@/lib/core/rbac";

export type AiMemberActor = {
  kind: "member";
  tenantId: string;
  userId: string;
  membership: MembershipCtx;
};

export type AiApiKeyActor = {
  kind: "apiKey";
  tenantId: string;
  keyId: string;
  scopes: string[];
  /** ระบบที่คีย์ผูกไว้ — null = คีย์ระดับร้าน */
  systemId: string | null;
};

/**
 * งานภายในที่รันเครื่องมือของผู้ช่วยได้ — เพิ่มชื่อใหม่ต้องเขียนเหตุผลที่นี่ (ใบ G1: system actor มีเฉพาะงานภายในจริง)
 *   scheduled-task  งานประจำของผู้ช่วย (`ai/scheduled.ts` ← `/api/cron/hourly`) · ไม่มีคนกด และแถวงานไม่ได้เก็บว่าใครตั้ง
 *                   ผลถูกส่งเป็น AppNotification แบบ `recipientUserId = null` = **สมาชิกทุกคนของร้านเห็น**
 *                   ⇒ รันด้วยสิทธิ์ของ "ผู้อ่านที่สิทธิ์น้อยที่สุด" (พนักงานที่ไม่มีคีย์ใดเลย) — เห็นเท่าที่ทุกคนในร้านเห็นอยู่แล้ว
 *                   (ไม่งั้นพนักงานที่มี `ai.schedule.create` ตั้งงาน "สรุปเบอร์ลูกค้ามุ่งหวังทุกวัน" แล้วอ่านจากกล่องแจ้งเตือนได้)
 */
export const AI_SYSTEM_JOBS = ["scheduled-task"] as const;
export type AiSystemJob = (typeof AI_SYSTEM_JOBS)[number];

export type AiSystemActor = {
  kind: "system";
  tenantId: string;
  job: AiSystemJob;
  // CRM C5.5-G1 r2 (F5) ▸ ไม่มีช่องสิทธิ์ในตัว actor: สิทธิ์อ่านจากชื่องาน (`SYSTEM_JOB_MEMBERSHIP`) และนับเฉพาะ actor ที่
  //   `aiSystemActor()` สร้างจริง (ทะเบียน WeakSet ภายในไฟล์นี้) — object ที่เขียนมือเอง `{ kind: "system", … }` = ปฏิเสธเสมอ ◂
};

export type AiActor = AiMemberActor | AiApiKeyActor | AiSystemActor;

/** สิทธิ์ของผู้อ่านที่น้อยที่สุดในร้าน — สมาชิกที่ยืนยันแล้วทุกคนเห็นได้อย่างน้อยเท่านี้ */
const SHOP_AUDIENCE: MembershipCtx = { role: "STAFF", unitAccess: [], permissions: {} };

const SYSTEM_JOB_MEMBERSHIP: Record<AiSystemJob, MembershipCtx> = {
  "scheduled-task": SHOP_AUDIENCE,
};

/** คนในร้าน — `membership` มาจาก session/โทเค็นของคำขอนี้เสมอ (ห้ามรับจาก body) */
export function aiMemberActor(
  tenantId: string,
  userId: string,
  m: { role: MembershipCtx["role"]; unitAccess: unknown; permissions: unknown },
): AiMemberActor {
  return {
    kind: "member",
    tenantId,
    userId,
    membership: {
      role: m.role,
      unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [],
      permissions: m.permissions && typeof m.permissions === "object" ? (m.permissions as Record<string, unknown>) : {},
    },
  };
}

/** คีย์ API — ค่าจาก `authenticateApiRequest` เท่านั้น */
export function aiApiKeyActor(k: { tenantId: string; keyId: string; scopes: string[]; systemId: string | null }): AiApiKeyActor {
  return { kind: "apiKey", tenantId: k.tenantId, keyId: k.keyId, scopes: [...k.scopes], systemId: k.systemId };
}

/** actor ของงานภายในที่ไฟล์นี้สร้างจริง — ตัวอื่น (เขียน object เอง) ไม่ได้สิทธิ์อะไรเลย */
const GENUINE_SYSTEM_ACTORS = new WeakSet<object>();

/** งานภายใน — ชื่องานต้องอยู่ใน `AI_SYSTEM_JOBS` (สิทธิ์ผูกกับชื่องาน ไม่ใช่ผู้เรียก) */
export function aiSystemActor(tenantId: string, job: AiSystemJob): AiSystemActor {
  const a: AiSystemActor = Object.freeze({ kind: "system" as const, tenantId, job });
  GENUINE_SYSTEM_ACTORS.add(a);
  return a;
}

/**
 * Membership ที่ใช้ตัดสินสิทธิ์ของคน/งานภายใน · คีย์ API = null (ตัดสินด้วย scope)
 * งานภายใน = สิทธิ์ตายตัวของชื่องาน **เฉพาะ actor ที่ aiSystemActor สร้าง** · ของปลอม = null (ไม่มีสิทธิ์)
 */
export function aiActorMembership(a: AiActor): MembershipCtx | null {
  if (a.kind === "member") return a.membership;
  if (a.kind === "system") {
    const m = GENUINE_SYSTEM_ACTORS.has(a) && Object.prototype.hasOwnProperty.call(SYSTEM_JOB_MEMBERSHIP, a.job) ? SYSTEM_JOB_MEMBERSHIP[a.job] : null;
    return m ? { role: m.role, unitAccess: [...m.unitAccess], permissions: { ...m.permissions } } : null;
  }
  return null;
}

/** userId ของคนจริง (ประวัติ/การมองเห็นแบบ "ของฉัน") — คีย์/งานภายใน = null */
export function aiActorUserId(a: AiActor): string | null {
  return a.kind === "member" ? a.userId : null;
}

/**
 * CRM C5.5-G1 r2 (F6) ▸ ด่านแรกของทุกเครื่องมือ (runTool + ตัวห่อทุกตัวในทะเบียน + adapter ของ 4 โมดูล):
 *   ไม่มี actor · ชนิดไม่รู้จัก · คนละร้าน · งานภายในที่ไม่ได้สร้างจาก aiSystemActor ⇒ ข้อความปฏิเสธ (ปิดไว้ก่อน — ไม่มีทางถอยไปชุดอ่านกว้าง)
 *   ผ่าน = null
 */
export function actorProblem(ctx: { tenantId: string; actor?: unknown }): string | null {
  const a = ctx.actor as AiActor | undefined;
  const bad = "ไม่ทราบว่าใครเป็นผู้ใช้เครื่องมือนี้ จึงยังทำรายการให้ไม่ได้";
  if (!a || typeof a !== "object" || a.tenantId !== ctx.tenantId) return bad;
  if (a.kind === "member") return a.membership && typeof a.userId === "string" ? null : bad;
  if (a.kind === "apiKey") return Array.isArray(a.scopes) ? null : bad;
  if (a.kind === "system") return aiActorMembership(a) ? null : bad;
  return bad;
}

/** scope ของคีย์ → permissions แบบตรงตัว (ไม่มี wildcard) — ผู้ดูของคีย์ที่ส่งให้ตัวรันของโมดูลสมาชิก/CRM */
export function keyPermissions(scopes: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(scopes.map((s) => [s, true]));
}

/**
 * "คีย์กลาง" = คีย์รุ่นเดิมระดับร้าน (scope ว่าง · ไม่ผูกระบบ) — ทางเดินข้อมูลรุ่นเดิมของ `/api/v1/*` สร้างมาให้คีย์แบบนี้
 * 🔴 ความหมายเดียวกับ `isGeneralApiKey` ของ hotfix/apiv1-scope (ซึ่งเพิ่มเงื่อนไข scopesJson เสีย) — เมื่อรวมกันแล้วให้เรียกตัวนั้นแทน
 */
export function isGeneralKeyActor(a: AiApiKeyActor): boolean {
  return a.scopes.length === 0 && a.systemId === null;
}
