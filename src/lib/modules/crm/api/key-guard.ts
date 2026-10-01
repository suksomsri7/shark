// key-guard.ts — "คีย์ API ของ CRM กว้างกว่าคนออกคีย์ไม่ได้" (CRM C5.4-B · hunter L1-m1 · owner question Q16 ค่าเริ่มต้น)
//
// 🔴 กติกาเดียว ใช้สองจุด:
//   (1) ตอนออกคีย์ (`crm/settings/api/actions.ts`) — ชุดสิทธิ์ที่ขอ ⊆ สิทธิ์ CRM ปัจจุบันของคนออก ⇒ MANAGER ที่ได้แค่
//       `crm.api.manage` ออก `crm.admin` (คีย์เจ้าของ 5 ตัว + เห็นทั้งร้าน) ไม่ได้
//   (2) ทุกคำขอ REST (`crm/api/config.ts` altAuth) — Q16 ค่าเริ่มต้น "คีย์ตายตามสิทธิ์ของคนออก": คนออกถูกเอาออกจากร้าน /
//       ถูกถอด `crm.api.manage` / ถูกลดสิทธิ์จนชุดของคีย์กว้างกว่าเขา ⇒ คีย์ใช้ไม่ได้ทันที (อ่านสดทุกครั้ง ไม่แคช)
//   คีย์เก่าที่ไม่มี `createdById` (ก่อนมีช่องนี้) ตัดสินไม่ได้ ⇒ ปล่อยตามเดิม (บันทึกไว้ใน wo-notes C5.4-B)
// 🔴 การมองเห็น: คีย์ที่ไม่มีตัวกรอง = เห็นทั้งระบบ (visibility.ts: API actor = ALL) ⇒ คนออกต้องเห็น ALL ทั้งร้านทุกเอนทิตี ·
//    คีย์ที่กรองทีม (`crm.filter.team:`) = คนออกต้องเป็นสมาชิกทีมนั้นและเห็นอย่างน้อย TEAM · กรองเจ้าของ (`crm.filter.owner:`) = ตัวเขาเองเท่านั้น
import { prisma } from "../db";
import { CRM_FILTER_OWNER_PREFIX, CRM_FILTER_TEAM_PREFIX } from "@/lib/api-keys/scopes";
import type { MemberActor } from "@/lib/modules/member";
import { crmCan } from "../access";
import { crmScope } from "../request-scope";
import { crmAccess, resolve } from "../visibility";
import { CRM_VIS_RANK, type CrmVisEntity } from "../visibility-shared";
import { parseCrmSettings } from "../settings"; // CRM C5.5 ▸ r1b ◂
import { CRM_EVENT_PREFIXES, crmWebhookEvents } from "./webhook-events"; // CRM C5.5 ▸ r1b ◂

const ENTITIES: readonly CrmVisEntity[] = ["CONTACT", "COMPANY", "DEAL", "ACTIVITY", "REPORT"];

export const CRM_KEY_WIDER_TH = "ชุดสิทธิ์ของคีย์นี้กว้างกว่าสิทธิ์ CRM ของบัญชีคุณเอง — เลือกชุดที่แคบกว่า (หรือกรองเฉพาะทีมของคุณ) หรือให้เจ้าของร้านเป็นผู้ออกคีย์";
export const CRM_KEY_CREATOR_GONE_TH = "คีย์นี้ใช้ไม่ได้แล้ว เพราะผู้ที่ออกคีย์ไม่มีสิทธิ์จัดการคีย์ CRM ในร้านนี้แล้ว (หรือสิทธิ์ลดลง) — ให้เจ้าของร้านออกคีย์ใหม่ที่หน้า CRM › ตั้งค่า › API";
export const CRM_KEY_CREATOR_GONE_EN = "This API key no longer works: the person who created it no longer has the CRM rights it carries. Ask the shop owner to create a new key.";

const isFilter = (s: string) => s.startsWith(CRM_FILTER_TEAM_PREFIX) || s.startsWith(CRM_FILTER_OWNER_PREFIX);
const wholeShop = (a: MemberActor) => a.role === "OWNER" || a.unitAccess.length === 0 || a.unitAccess.includes("*");

/**
 * เหตุผล (ไทย) ที่คีย์ scope ชุดนี้ "กว้างกว่า" คนออก `creator` ในระบบ CRM `ctx` — `null` = อยู่ในสิทธิ์ของเขา
 * ตรวจ: ถือ `crm.api.manage` · ทุก scope `crm.*` (ยกเว้นตัวกรอง) ผ่าน `crmCan` ของเขา · การมองเห็นของคีย์ ⊆ ของเขา
 */
export async function crmKeyWiderThanCreator(ctx: { tenantId: string; systemId: string }, creator: MemberActor, scopes: readonly string[]): Promise<string | null> {
  if (!crmCan(creator, "crm.api.manage")) return CRM_KEY_WIDER_TH;
  for (const s of scopes) {
    if (!s.startsWith("crm.") || isFilter(s)) continue;
    if (!crmCan(creator, s)) return CRM_KEY_WIDER_TH;
  }
  if (creator.role === "OWNER") return null;
  const teamFilters = scopes.filter((s) => s.startsWith(CRM_FILTER_TEAM_PREFIX)).map((s) => s.slice(CRM_FILTER_TEAM_PREFIX.length));
  const ownerFilters = scopes.filter((s) => s.startsWith(CRM_FILTER_OWNER_PREFIX)).map((s) => s.slice(CRM_FILTER_OWNER_PREFIX.length));
  // กรองเฉพาะรายการของตัวเขาเอง = แคบที่สุดแล้ว (OWN ก็พอ)
  if (ownerFilters.length > 0 && ownerFilters.every((u) => u === creator.userId)) return null;
  // รีวิว C5.4-B SF1: memo ต่อการเรียกนี้ (ด่าน/ทีม/policy อ่านครั้งเดียว · ยังสดทุกคำขอ — ไม่มีแคชข้ามคำขอ)
  return crmScope(async () => {
    const vctx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: creator.userId };
    const access = await crmAccess(ctx, creator.userId);
    // รีวิว C5.4-B note (a): policy รายไปป์ไลน์ (DEAL) แคบกว่าระดับฐานได้ ⇒ ต้องผ่านทุกไปป์ไลน์ที่มี policy ด้วย
    const pipelineIds = [...new Set(access.policies.filter((p) => p.entity === "DEAL" && !!p.pipelineId).map((p) => p.pipelineId as string))];
    const levels = await Promise.all([
      ...ENTITIES.map((e) => resolve(vctx, creator, e)),
      ...pipelineIds.map((pipelineId) => resolve(vctx, creator, "DEAL", { pipelineId })),
    ]);
    if (levels.every((l) => l === "ALL") && wholeShop(creator)) return null;
    if (teamFilters.length > 0 && levels.every((l) => CRM_VIS_RANK[l] >= CRM_VIS_RANK.TEAM)) {
      const mine = new Set(access.mine.map((m) => m.teamId));
      if (teamFilters.every((t) => mine.has(t))) return null;
    }
    return CRM_KEY_WIDER_TH;
  });
}

/**
 * Q16 ค่าเริ่มต้น — คีย์ยังใช้ได้ไหมตามสิทธิ์ "ปัจจุบัน" ของคนออก: `true` = ใช้ได้ · คีย์ไม่มี `createdById` = ใช้ได้ (ตัดสินไม่ได้)
 * คนออกไม่มี Membership ที่รับแล้วในร้านนี้ / ชุดของคีย์กว้างกว่าเขาแล้ว ⇒ `false`
 */
export async function crmKeyCreatorStillEntitled(input: { tenantId: string; systemId: string; createdById?: string | null; scopes: readonly string[] }): Promise<boolean> {
  const uid = input.createdById ?? "";
  if (!uid) return true;
  return crmScope(() => entitled(input, uid));
}

/**
 * รีวิว C5.4-B note (c): คีย์ของหน้า "ตั้งค่า › API" ที่ด่านนี้ปฏิเสธ (ผู้สร้างไม่มีสิทธิ์แล้ว) — ป้าย "ใช้ไม่ได้" · อ่านสดต่อการเปิดหน้า
 */
export async function crmKeysRefusedByGuard(ctx: { tenantId: string; systemId: string }, keys: readonly { id: string; createdById?: string | null; scopes: readonly string[] }[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const k of keys) {
    if (!(await crmKeyCreatorStillEntitled({ tenantId: ctx.tenantId, systemId: ctx.systemId, createdById: k.createdById ?? null, scopes: k.scopes }))) out.add(k.id);
  }
  return out;
}

async function entitled(input: { tenantId: string; systemId: string; scopes: readonly string[] }, uid: string): Promise<boolean> {
  const m = await prisma.membership.findFirst({ where: { userId: uid, tenantId: input.tenantId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } });
  if (!m) return false;
  const creator: MemberActor = {
    userId: uid,
    role: m.role,
    unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as string[]) : [],
    permissions: (m.permissions && typeof m.permissions === "object" && !Array.isArray(m.permissions) ? m.permissions : {}) as Record<string, unknown>,
  };
  return (await crmKeyWiderThanCreator({ tenantId: input.tenantId, systemId: input.systemId }, creator, input.scopes)) === null;
}

// CRM C5.5 ▸ L55-4 + H55-2 (มติผู้คุมงาน) — กติกาเดียวกับคีย์ API ที่ไม่มีตัวกรอง ใช้กับทางออกอีกสองทาง
//   (1) ปลายทาง webhook ของ CRM (สร้าง/เปิดใช้): ได้ event ของทุกระเบียนทุกทีมในร้าน ⇒ คนเพิ่ม/เปิดต้องเห็น ALL ทั้งร้านเหมือนคนออกคีย์ไม่กรอง
//   (2) กฎอัตโนมัติ (`automation.ts`): กฎทำงานกับระเบียนใดก็ได้ของระบบ ⇒ ผู้ตั้งกฎต้องเห็นเอนทิตีที่การกระทำแตะ "ทั้งหมด" ทั้งร้าน
export const CRM_WEBHOOK_WIDER_TH =
  "ปลายทาง webhook ของ CRM ได้รับเหตุการณ์ของทุกรายการในทุกทีมของร้าน แต่บัญชีนี้ยังมองเห็นข้อมูล CRM ไม่ครบทั้งร้าน — ให้เจ้าของร้าน (หรือผู้ที่เห็นข้อมูล CRM ทั้งร้าน) เป็นผู้เพิ่มหรือเปิดใช้ปลายทางนี้";

/** เหตุผล (ไทย) ที่ `creator` เพิ่ม/เปิดปลายทาง webhook ของ CRM ไม่ได้ — `null` = ได้ (ด่านเดียวกับคีย์ไม่มีตัวกรอง: `crmKeyWiderThanCreator(…, [])`) */
export async function crmWebhookWiderThanCreator(ctx: { tenantId: string; systemId: string }, creator: MemberActor): Promise<string | null> {
  return (await crmKeyWiderThanCreator(ctx, creator, [])) === null ? null : CRM_WEBHOOK_WIDER_TH;
}

/**
 * `actor` เห็น "ทุกรายการ" ของเอนทิตีเหล่านี้ทั้งร้านไหม (ระดับ ALL + ไม่ถูกจำกัดสาขา) — ตรรกะเดียวกับ `crmKeyWiderThanCreator`
 * DEAL: ระบุ `pipelineId` = ตรวจระดับของไปป์ไลน์นั้น · ไม่ระบุ = ระดับฐาน + ทุกไปป์ไลน์ที่มี policy ของตัวเอง
 */
export async function crmSeesAllOf(
  ctx: { tenantId: string; systemId: string },
  actor: MemberActor,
  entities: readonly CrmVisEntity[],
  opts: { pipelineId?: string | null } = {},
): Promise<boolean> {
  if (actor.role === "OWNER") return true;
  if (!wholeShop(actor)) return false;
  if (entities.length === 0) return true;
  return crmScope(async () => {
    const vctx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: actor.userId };
    const pipelineId = opts.pipelineId ?? null;
    let extra: string[] = [];
    if (entities.includes("DEAL") && !pipelineId) {
      const access = await crmAccess(ctx, actor.userId);
      extra = [...new Set(access.policies.filter((p) => p.entity === "DEAL" && !!p.pipelineId).map((p) => p.pipelineId as string))];
    }
    const levels = await Promise.all([
      ...entities.map((e) => resolve(vctx, actor, e, e === "DEAL" && pipelineId ? { pipelineId } : {})),
      ...extra.map((p) => resolve(vctx, actor, "DEAL", { pipelineId: p })),
    ]);
    return levels.every((l) => l === "ALL");
  });
}

// CRM C5.5 ▸ r1b (มติผู้คุมงาน ข้อ 1): หน้าตั้งค่า webhook กลางของร้าน (`src/lib/webhooks/actions.ts` — ไม่ใช่หน้าของ CRM) ก็สมัคร event ของ CRM ได้
//   ทั้งแบบเลือกตรง ๆ (crm.* · custom.record.* · team.*) และแบบ "ทุกเหตุการณ์" (รายการว่าง) ⇒ กติกาเดียวกับหน้าของ CRM ต่อ **ทุก** ระบบ CRM v2 ของร้าน
//   ร้านที่ไม่มีระบบ CRM v2 = ไม่มีอะไรเปลี่ยน (คืน null ทันทีหลังอ่านรายการระบบ) · event ที่ไม่ใช่ของ CRM ล้วน = ไม่อ่านฐานเลย
export const CRM_PLATFORM_WEBHOOK_TH =
  "รายการเหตุการณ์นี้รวมเหตุการณ์ของ CRM (เลือกตรง ๆ หรือรวมอยู่ใน \"ทุกเหตุการณ์\") ซึ่งส่งข้อมูลของทุกทีมในร้าน แต่บัญชีนี้ยังมองเห็นข้อมูล CRM ไม่ครบทั้งร้าน — เลือกเฉพาะเหตุการณ์ที่ไม่ใช่ของ CRM หรือให้เจ้าของร้าน (หรือผู้ที่เห็นข้อมูล CRM ทั้งร้าน) เป็นผู้ตั้งปลายทางนี้";

/**
 * ปลายทาง webhook ของร้านที่รับ `events` (ว่าง = ทุกเหตุการณ์) ตั้งโดย `actor` ได้ไหม — `null` = ได้
 * r2: ลงทะเบียนเป็นตัวกันเหตุการณ์ของ `webhooks/service.ts` (ทุกประตู) · `actor` null = ระบุผู้ทำไม่ได้ (คีย์ไม่มีผู้สร้าง/ผู้สร้างออกจากร้าน)
 *   ⇒ ร้านที่มี CRM v2 ปฏิเสธเมื่อรายการแตะเหตุการณ์ CRM
 */
export async function crmPlatformWebhookProblem(
  tenantId: string,
  actor: { userId: string; role: string; unitAccess: string[]; permissions: Record<string, unknown> } | null,
  events: readonly string[],
): Promise<string | null> {
  const crmSet = new Set(crmWebhookEvents());
  const touchesCrm = events.length === 0 || events.some((e) => crmSet.has(e) || CRM_EVENT_PREFIXES.some((p) => e.startsWith(p)));
  if (!touchesCrm) return null;
  const systems = await prisma.appSystem.findMany({ where: { tenantId, type: "CRM" }, select: { id: true, settings: true } });
  for (const sys of systems) {
    if (parseCrmSettings(sys.settings).uiVersion !== 2) continue;
    if (!actor) return CRM_PLATFORM_WEBHOOK_TH;
    // บทบาทมาจาก Membership จริง (OWNER/MANAGER/STAFF) — รูปเดียวกับ MemberActor
    if (await crmWebhookWiderThanCreator({ tenantId, systemId: sys.id }, actor as MemberActor)) return CRM_PLATFORM_WEBHOOK_TH;
  }
  return null;
}
// ◂ CRM C5.5
