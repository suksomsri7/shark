// link-resolvers.ts — ทะเบียนชนิดของ "เชื่อมข้อมูล SHARK" + ตัวแปลผลรายชนิด + การอ่าน (K3.1)
//                     พิมพ์เขียว `docs/modules/13-kanban-v2.md` §9.1 · สัญญา `ledger/KANBAN-RUN.md` §K3.1
//
// การ์ด 1 ใบผูกกับ "ของจริง" ในโมดูลอื่นได้ 20 ชนิด (ลูกค้า · ห้องแชท · เอกสารบัญชี · คำขออนุมัติ …)
// ตารางนี้เก็บแค่ **pointer** ⇒ ชื่อ/สถานะ/ยอด ของปลายทางต้อง resolve สดทุกครั้งที่อ่าน
//
// 🔴 กติกาที่ห้ามฝ่าฝืน (เกณฑ์ §13 K3.1)
//   1) **สิทธิ์คิดใหม่ทุกครั้ง ต่อผู้ดูแต่ละคน** — ไม่มีการจำผลไว้ที่ระดับโมดูล (เปลี่ยนสิทธิ์แล้วผลเปลี่ยนทันที)
//      ⇒ ไฟล์นี้ไม่มีตัวแปรระดับโมดูลที่เก็บผลลัพธ์ของผู้ใช้คนใดคนหนึ่งเลย
//   2) คนที่ไม่มีสิทธิ์โมดูลปลายทาง **ยังเห็นว่ามีของผูกอยู่** (ไม่ซ่อนแถว) แต่เห็นแค่ "(ไม่มีสิทธิ์เข้าถึง)"
//      — ห้ามหลุดชื่อลูกค้า / ตัวอย่างข้อความ / ยอดเงิน / ลิงก์ปลายทาง ลงไปใน DTO ของแถวนั้นเด็ดขาด
//   3) `select` ของทุกตัวแปลผลดึง **เฉพาะฟิลด์ที่จำเป็นต่อการแสดงชื่อ** — ไม่มีเบอร์/อีเมล/เลขภาษี
//      ของผู้ติดต่อ และไม่มีข้อมูลอ่อนไหวของงานบุคคล (เงินเดือน/เลขบัตร ปชช./บัญชีธนาคาร)
//   4) ผู้ติดต่อ (PARTY) แตะได้เฉพาะผ่าน facade `@/lib/modules/party` — ห้ามยิงตาราง Party ตรง (§9.1)
//
// 🔴 ทำไมแยกจาก `links.ts`: `links.ts` (ฝั่งเขียน) ต้องเรียก `service.createCard` ซึ่งลากไปถึง `cards.ts`
//    ส่วน `cards.ts` (getCardDetail) ต้องอ่านการเชื่อมกลับมาแสดง ⇒ ถ้ารวมไฟล์เดียวจะเป็น import วนกลับ
//    (cards → links → service → cards) ⇒ ฝั่ง "อ่าน" อยู่ที่นี่ซึ่งไม่รู้จัก service เลย

import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { listBriefsByIds } from "@/lib/modules/party";
import { LINK_TYPE_META } from "./link-labels";
import { KanbanNotFoundError, visibleBoardsWhere } from "./access";
import { prisma } from "./db";
import { assertCardRole, loadActor } from "./members";
import type {
  CardForTargetDto,
  CardLinkDto,
  KanbanActor,
  KanbanCtx,
  KanbanLinkKind,
  KanbanLinkRole,
} from "./types";

// ───────────────────────── ตัวแปลผล: รูปแบบร่วม ─────────────────────────

/** สิ่งที่ตัวแปลผลคืนต่อ 1 ปลายทาง — ข้อมูลเท่าที่ใช้วาดแถวและประกอบลิงก์ */
export type ResolvedTarget = {
  title: string;
  subtitle?: string | null;
  status?: string | null;
  /** สาขาที่ของชิ้นนี้สังกัด (โมดูลผูกสาขา) — ใช้ทั้งด่านสิทธิ์ระดับหน่วยและประกอบ URL */
  unitId?: string | null;
  unitSlug?: string | null;
  /** ระบบ (AppSystem.id) ของโมดูลปลายทาง — ใช้ประกอบ `/app/sys/{id}/…` */
  systemId?: string | null;
  /** ส่วนของ URL ที่รู้ได้จากตัวข้อมูลเอง เช่น docType ของเอกสารบัญชี */
  pathHint?: string | null;
  /** ผู้ยื่นคำขอ (ชนิด APPROVAL_REQUEST) — เจ้าของคำขอเห็นของตัวเองได้เสมอ */
  ownerUserId?: string | null;
};

type Resolver = (ctx: KanbanCtx, ids: string[]) => Promise<Map<string, ResolvedTarget>>;

type LinkTypeSpec = {
  /** ป้ายชนิด (ไทย) ที่ผู้ใช้เห็น */
  label: string;
  /** ไอคอนในสไปรต์ `KanbanIcon` */
  icon: string;
  /** โมดูลปลายทางใน RBAC (ตัวแรก = ตัวที่ใช้กับ `evaluate`) — หลายตัว = มีสิทธิ์ตัวใดตัวหนึ่งก็พอ */
  modules: readonly string[];
  /**
   * คีย์ "อ่าน" ของโมดูลปลายทาง — `null` = โมดูลนั้นยังไม่มีคีย์อ่านใน `core/permissions.ts`
   * ⇒ ใช้กติกาเดียวกับ `canReadKanban`: "มีคีย์ `{module}.*` ตัวใดตัวหนึ่ง = อ่านได้"
   */
  action: string | null;
  /** ปลายทางเปิดได้ไหมสำหรับผู้ดูคนนี้ (คิดใหม่ทุกครั้ง) */
  canView: (actor: KanbanActor, target: ResolvedTarget | null) => boolean;
  /** URL ของปลายทาง (`null` = ไม่มีหน้าให้เปิด) */
  href: (linkId: string, target: ResolvedTarget) => string | null;
  /** `null` = ชนิดที่ไม่มีของใน DB ให้แปล (URL) */
  resolve: Resolver | null;
};

/** `KanbanActor` ใช้แทน `MembershipCtx` ได้ตรง ๆ (มีครบ 3 ฟิลด์) */
function mc(actor: KanbanActor): MembershipCtx {
  return { role: actor.role, unitAccess: actor.unitAccess, permissions: actor.permissions };
}

/** มีคีย์สิทธิ์ของโมดูลเหล่านี้อยู่บ้างไหม (ใช้กับโมดูลที่ยังไม่มีคีย์ "อ่าน" เป็นของตัวเอง) */
function hasAnyKeyOf(actor: KanbanActor, modules: readonly string[]): boolean {
  return Object.entries(actor.permissions).some(
    ([k, v]) => v === true && modules.some((m) => k === `${m}.*` || k.startsWith(`${m}.`)),
  );
}

/**
 * ด่านสิทธิ์มาตรฐานของปลายทาง 1 ชิ้น
 * OWNER ผ่านเสมอ · MANAGER ผ่านในสาขาที่คุม (rbac เดิม) · STAFF ต้องมีคีย์อ่าน (หรือคีย์ใดคีย์หนึ่งของโมดูล)
 */
function moduleGate(
  actor: KanbanActor,
  spec: Pick<LinkTypeSpec, "modules" | "action">,
  target: ResolvedTarget | null,
): boolean {
  const m = mc(actor);
  const unitId = target?.unitId ?? undefined;
  if (actor.role === "OWNER") return true;
  if (!canAccessUnit(m, unitId)) return false;
  if (actor.role === "MANAGER") return true;
  if (spec.action) {
    return spec.modules.some((mod) => evaluate(m, { module: mod, action: spec.action!, unitId }));
  }
  return hasAnyKeyOf(actor, spec.modules);
}

// ───────────────────────── ตัวช่วยของตัวแปลผล ─────────────────────────

const scopeOf = (ctx: KanbanCtx) => ({ tenantId: ctx.tenantId });

/** slug ของสาขา (ประกอบ `/app/u/{slug}/…`) — คิวรีเดียวต่อการ resolve 1 ชนิด ไม่ใช่ต่อแถว */
async function unitSlugs(ctx: KanbanCtx, unitIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(unitIds.filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map();
  const rows = await prisma.businessUnit.findMany({
    where: { tenantId: ctx.tenantId, id: { in: ids } },
    select: { id: true, slug: true },
  });
  return new Map(rows.map((r) => [r.id, r.slug]));
}

/** วันไทยสั้น ๆ (ไม่ใช้ toLocaleDateString — บทเรียน K1.5) */
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function thDay(d: Date | null | undefined): string {
  if (!d) return "";
  // เวลาไทย = UTC+7 (คิดจาก epoch ตรง ๆ — ห้ามใช้ getDay/getDate ของเครื่องที่ TZ ไม่แน่นอน)
  const t = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return `${t.getUTCDate()} ${TH_MONTHS[t.getUTCMonth()]} ${(t.getUTCFullYear() + 543) % 100}`;
}

/** สตางค์ → "฿1,234.50" (แสดงเฉพาะแถวที่ผู้ดูมีสิทธิ์เท่านั้น — ผู้เรียกตัดทิ้งให้แล้วเมื่อไม่มีสิทธิ์) */
function baht(satang: number): string {
  return `฿${(satang / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CHAT_CHANNEL_TH: Record<string, string> = {
  LINE: "LINE",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  WEBCHAT: "เว็บแชท",
  APP: "แอป",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
};
const CHAT_STATUS_TH: Record<string, string> = { OPEN: "เปิดอยู่", PENDING: "รอตอบ", RESOLVED: "ปิดแล้ว", SNOOZED: "พักไว้" };
const APPROVAL_STATUS_TH: Record<string, string> = { PENDING: "รออนุมัติ", APPROVED: "อนุมัติแล้ว", REJECTED: "ไม่อนุมัติ", CANCELLED: "ยกเลิกแล้ว" };
const LEAVE_STATUS_TH: Record<string, string> = { PENDING: "รออนุมัติ", APPROVED: "อนุมัติแล้ว", REJECTED: "ไม่อนุมัติ", CANCELLED: "ยกเลิกแล้ว" };
const ACC_DOC_TH: Record<string, string> = {
  QUOTATION: "ใบเสนอราคา",
  INVOICE: "ใบแจ้งหนี้",
  RECEIPT: "ใบเสร็จรับเงิน",
  TAX_INVOICE: "ใบกำกับภาษี",
  BILLING_NOTE: "ใบวางบิล",
  CREDIT_NOTE: "ใบลดหนี้",
  DEBIT_NOTE: "ใบเพิ่มหนี้",
  EXPENSE: "ค่าใช้จ่าย",
  PURCHASE_ORDER: "ใบสั่งซื้อ",
};
const ACC_STATUS_TH: Record<string, string> = {
  DRAFT: "ร่าง",
  ISSUED: "ออกแล้ว",
  APPROVED: "อนุมัติแล้ว",
  PAID: "ชำระแล้ว",
  PARTIAL: "ชำระบางส่วน",
  VOID: "ยกเลิก",
  OVERDUE: "เลยกำหนด",
};

/** แปลค่า enum เป็นไทยแบบไม่ล้ม (ค่าที่ยังไม่ได้แปล = แสดงค่าดิบ ดีกว่าแสดงค่าว่าง) */
const th = (table: Record<string, string>, v: string | null | undefined): string | null =>
  v ? (table[v] ?? v) : null;

// ───────────────────────── ทะเบียนชนิด 20 ตัว (§9.1) ─────────────────────────

export const LINK_TYPES: Record<KanbanLinkKind, LinkTypeSpec> = {
  // ผู้ติดต่อกลางของร้าน — ผ่าน facade ของโมดูล party เท่านั้น (ห้ามยิงตารางตรง)
  PARTY: {
    ...LINK_TYPE_META.PARTY,
    modules: ["crm", "account", "party"],
    action: null,
    canView: (actor, target) => moduleGate(actor, { modules: ["crm", "account", "party"], action: null }, target),
    href: (linkId) => `/app/party/${linkId}`,
    resolve: async (ctx, ids) => {
      const rows = await listBriefsByIds(ctx.tenantId, ids);
      return new Map(rows.map((r) => [r.id, { title: r.name } satisfies ResolvedTarget]));
    },
  },
  CRM_CONTACT: {
    ...LINK_TYPE_META.CRM_CONTACT,
    modules: ["crm"],
    action: null,
    canView: (actor, target) => moduleGate(actor, { modules: ["crm"], action: null }, target),
    href: (linkId, t) => (t.systemId ? `/app/sys/${t.systemId}/crm/contacts?c=${linkId}` : null),
    resolve: async (ctx, ids) => {
      const rows = await prisma.crmContact.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, name: true, systemId: true, company: true, lifecycleStage: true },
      });
      return new Map(
        rows.map((r) => [r.id, { title: r.name, subtitle: r.company, status: r.lifecycleStage, systemId: r.systemId }]),
      );
    },
  },
  CHAT_CONVERSATION: {
    ...LINK_TYPE_META.CHAT_CONVERSATION,
    modules: ["chat"],
    action: "chat.conversation.read",
    canView: (actor, target) => moduleGate(actor, { modules: ["chat"], action: "chat.conversation.read" }, target),
    href: (linkId, t) => (t.systemId ? `/app/sys/${t.systemId}/chat?c=${linkId}` : null),
    resolve: async (ctx, ids) => {
      // 🔴 ไม่ดึง `lastMessagePreview` — ตัวอย่างข้อความของลูกค้าไม่ใช่ของที่การ์ดต้องโชว์ (§9.1)
      const rows = await prisma.chatConversation.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: {
          id: true,
          systemId: true,
          channel: true,
          status: true,
          unitId: true,
          contact: { select: { displayName: true } },
        },
      });
      return new Map(
        rows.map((r) => [
          r.id,
          {
            title: `แชท${CHAT_CHANNEL_TH[r.channel] ?? r.channel} · ${r.contact?.displayName ?? "ลูกค้า"}`,
            status: th(CHAT_STATUS_TH, r.status),
            systemId: r.systemId,
            unitId: r.unitId,
          },
        ]),
      );
    },
  },
  ACCOUNT_DOC: {
    ...LINK_TYPE_META.ACCOUNT_DOC,
    modules: ["account"],
    action: "account.doc.view",
    canView: (actor, target) => moduleGate(actor, { modules: ["account"], action: "account.doc.view" }, target),
    href: (linkId, t) => (t.systemId && t.pathHint ? `/app/sys/${t.systemId}/account/docs/${t.pathHint}/${linkId}` : null),
    resolve: async (ctx, ids) => {
      const rows = await prisma.accountDocument.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, systemId: true, docType: true, docNo: true, status: true, grandTotal: true },
      });
      return new Map(
        rows.map((r) => [
          r.id,
          {
            title: `${ACC_DOC_TH[r.docType] ?? r.docType} ${r.docNo ?? "(ยังไม่ออกเลขที่)"}`.trim(),
            // ยอดเงินอยู่ใน subtitle — ผู้เรียกทิ้งทั้งก้อนเมื่อ canView = false
            subtitle: baht(r.grandTotal),
            status: th(ACC_STATUS_TH, r.status),
            systemId: r.systemId,
            pathHint: r.docType,
          },
        ]),
      );
    },
  },
  APPROVAL_REQUEST: {
    ...LINK_TYPE_META.APPROVAL_REQUEST,
    modules: ["approval"],
    action: "approval.request.decide",
    // ผู้ยื่นคำขอเห็นคำขอของตัวเองได้เสมอ แม้ไม่มีสิทธิ์ "อนุมัติ/ปฏิเสธ" (§9.1)
    canView: (actor, target) =>
      (target?.ownerUserId != null && target.ownerUserId === actor.userId) ||
      moduleGate(actor, { modules: ["approval"], action: "approval.request.decide" }, target),
    href: (linkId) => `/app/approvals?r=${linkId}`,
    resolve: async (ctx, ids) => {
      const rows = await prisma.approvalRequest.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, policyId: true, status: true, unitId: true, requestedById: true, entityType: true },
      });
      const policies = rows.length
        ? await prisma.approvalPolicy.findMany({
            where: { tenantId: ctx.tenantId, id: { in: [...new Set(rows.map((r) => r.policyId))] } },
            select: { id: true, name: true },
          })
        : [];
      const nameOf = new Map(policies.map((p) => [p.id, p.name]));
      return new Map(
        rows.map((r) => [
          r.id,
          {
            title: nameOf.get(r.policyId) ?? `คำขออนุมัติ (${r.entityType})`,
            status: th(APPROVAL_STATUS_TH, r.status),
            unitId: r.unitId,
            ownerUserId: r.requestedById,
          },
        ]),
      );
    },
  },
  HR_LEAVE: {
    ...LINK_TYPE_META.HR_LEAVE,
    modules: ["hr"],
    action: "hr.leave.read",
    canView: (actor, target) => moduleGate(actor, { modules: ["hr"], action: "hr.leave.read" }, target),
    href: (_linkId, t) => (t.systemId ? `/app/sys/${t.systemId}/hr/leave` : null),
    resolve: async (ctx, ids) => {
      // 🔴 ดึงเฉพาะช่วงวัน/สถานะ/ชื่อพนักงาน — ไม่แตะข้อมูลอ่อนไหวของงานบุคคล (เลขบัตร/บัญชีธนาคาร/ค่าจ้าง)
      const rows = await prisma.hrLeave.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: {
          id: true,
          systemId: true,
          fromDate: true,
          toDate: true,
          status: true,
          employee: { select: { name: true } },
        },
      });
      return new Map(
        rows.map((r) => [
          r.id,
          {
            title: `ใบลาของ ${r.employee?.name ?? "พนักงาน"}`,
            subtitle: `${thDay(r.fromDate)} – ${thDay(r.toDate)}`,
            status: th(LEAVE_STATUS_TH, r.status),
            systemId: r.systemId,
          },
        ]),
      );
    },
  },
  HR_EMPLOYEE: {
    ...LINK_TYPE_META.HR_EMPLOYEE,
    modules: ["hr"],
    action: "hr.leave.read",
    canView: (actor, target) => moduleGate(actor, { modules: ["hr"], action: "hr.leave.read" }, target),
    href: (linkId, t) => (t.systemId ? `/app/sys/${t.systemId}/hr/employees/${linkId}` : null),
    resolve: async (ctx, ids) => {
      const rows = await prisma.hrEmployee.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, systemId: true, name: true, position: true, active: true },
      });
      return new Map(
        rows.map((r) => [
          r.id,
          { title: r.name, subtitle: r.position, status: r.active ? null : "พ้นสภาพแล้ว", systemId: r.systemId },
        ]),
      );
    },
  },
  APPOINTMENT: {
    ...LINK_TYPE_META.APPOINTMENT,
    modules: ["booking"],
    action: null,
    canView: (actor, target) => moduleGate(actor, { modules: ["booking"], action: null }, target),
    href: (_linkId, t) => (t.unitSlug ? `/app/u/${t.unitSlug}/booking` : null),
    resolve: async (ctx, ids) => {
      // 🔴 ไม่ดึงชื่อ/เบอร์ลูกค้าที่ติดมากับนัดหมาย — การ์ดโชว์ "บริการ + เวลา" พอ
      const rows = await prisma.appointment.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, unitId: true, startAt: true, status: true, service: { select: { name: true } } },
      });
      const slugs = await unitSlugs(ctx, rows.map((r) => r.unitId));
      return new Map(
        rows.map((r) => [
          r.id,
          {
            title: r.service?.name ?? "นัดหมาย",
            subtitle: thDay(r.startAt),
            status: r.status,
            unitId: r.unitId,
            unitSlug: slugs.get(r.unitId) ?? null,
          },
        ]),
      );
    },
  },
  HOTEL_RESERVATION: {
    ...LINK_TYPE_META.HOTEL_RESERVATION,
    modules: ["hotel"],
    action: null,
    canView: (actor, target) => moduleGate(actor, { modules: ["hotel"], action: null }, target),
    href: (_linkId, t) => (t.unitSlug ? `/app/u/${t.unitSlug}/hotel/reservations` : null),
    resolve: async (ctx, ids) => {
      const rows = await prisma.hotelReservation.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, unitId: true, code: true, status: true, checkInDate: true, checkOutDate: true },
      });
      const slugs = await unitSlugs(ctx, rows.map((r) => r.unitId));
      return new Map(
        rows.map((r) => [
          r.id,
          {
            title: `การจอง ${r.code}`,
            subtitle: `${thDay(r.checkInDate)} – ${thDay(r.checkOutDate)}`,
            status: r.status,
            unitId: r.unitId,
            unitSlug: slugs.get(r.unitId) ?? null,
          },
        ]),
      );
    },
  },
  RENTAL_BOOKING: {
    ...LINK_TYPE_META.RENTAL_BOOKING,
    modules: ["rental"],
    action: null,
    canView: (actor, target) => moduleGate(actor, { modules: ["rental"], action: null }, target),
    href: (_linkId, t) => (t.unitSlug ? `/app/u/${t.unitSlug}/rental` : null),
    resolve: async (ctx, ids) => {
      const rows = await prisma.rentalBooking.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, unitId: true, status: true, startDate: true, endDate: true, asset: { select: { name: true } } },
      });
      const slugs = await unitSlugs(ctx, rows.map((r) => r.unitId));
      return new Map(
        rows.map((r) => [
          r.id,
          {
            title: `เช่า ${r.asset?.name ?? "อุปกรณ์"}`,
            subtitle: `${thDay(r.startDate)} – ${thDay(r.endDate)}`,
            status: r.status,
            unitId: r.unitId,
            unitSlug: slugs.get(r.unitId) ?? null,
          },
        ]),
      );
    },
  },
  SCHOOL_CLASS: {
    ...LINK_TYPE_META.SCHOOL_CLASS,
    modules: ["school"],
    action: null,
    canView: (actor, target) => moduleGate(actor, { modules: ["school"], action: null }, target),
    href: (_linkId, t) => (t.unitSlug ? `/app/u/${t.unitSlug}/school` : null),
    resolve: async (ctx, ids) => {
      const rows = await prisma.schoolClass.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, unitId: true, name: true, startDate: true, course: { select: { name: true } } },
      });
      const slugs = await unitSlugs(ctx, rows.map((r) => r.unitId));
      return new Map(
        rows.map((r) => [
          r.id,
          {
            title: `${r.course?.name ? `${r.course.name} — ` : ""}${r.name}`,
            subtitle: r.startDate ? thDay(r.startDate) : null,
            unitId: r.unitId,
            unitSlug: slugs.get(r.unitId) ?? null,
          },
        ]),
      );
    },
  },
  INV_ITEM: {
    ...LINK_TYPE_META.INV_ITEM,
    modules: ["inventory"],
    action: "inventory.item.read",
    canView: (actor, target) => moduleGate(actor, { modules: ["inventory"], action: "inventory.item.read" }, target),
    href: (_linkId, t) => (t.systemId ? `/app/sys/${t.systemId}/inventory/items` : null),
    resolve: async (ctx, ids) => {
      const rows = await prisma.invItem.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, systemId: true, name: true, sku: true, onHand: true, unitLabel: true },
      });
      return new Map(
        rows.map((r) => [
          r.id,
          {
            title: `${r.name} #${r.sku}`,
            subtitle: `คงเหลือ ${r.onHand} ${r.unitLabel}`,
            systemId: r.systemId,
          },
        ]),
      );
    },
  },
  QUEUE_TICKET: {
    ...LINK_TYPE_META.QUEUE_TICKET,
    modules: ["queue"],
    action: null,
    canView: (actor, target) => moduleGate(actor, { modules: ["queue"], action: null }, target),
    href: (_linkId, t) => (t.unitSlug ? `/app/u/${t.unitSlug}/queue` : null),
    resolve: async (ctx, ids) => {
      const rows = await prisma.queueTicket.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, unitId: true, number: true, status: true, businessDate: true },
      });
      const slugs = await unitSlugs(ctx, rows.map((r) => r.unitId));
      return new Map(
        rows.map((r) => [
          r.id,
          {
            title: `บัตรคิว ${r.number}`,
            subtitle: r.businessDate,
            status: r.status,
            unitId: r.unitId,
            unitSlug: slugs.get(r.unitId) ?? null,
          },
        ]),
      );
    },
  },
  TICKET_EVENT: {
    ...LINK_TYPE_META.TICKET_EVENT,
    modules: ["ticket"],
    action: null,
    canView: (actor, target) => moduleGate(actor, { modules: ["ticket"], action: null }, target),
    href: (_linkId, t) => (t.unitSlug ? `/app/u/${t.unitSlug}/ticket/event` : null),
    resolve: async (ctx, ids) => {
      const rows = await prisma.ticketEvent.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, unitId: true, name: true, startAt: true, status: true },
      });
      const slugs = await unitSlugs(ctx, rows.map((r) => r.unitId));
      return new Map(
        rows.map((r) => [
          r.id,
          {
            title: r.name,
            subtitle: thDay(r.startAt),
            status: r.status,
            unitId: r.unitId,
            unitSlug: slugs.get(r.unitId) ?? null,
          },
        ]),
      );
    },
  },
  FORM_SUBMISSION: {
    ...LINK_TYPE_META.FORM_SUBMISSION,
    modules: ["forms"],
    action: null,
    canView: (actor, target) => moduleGate(actor, { modules: ["forms"], action: null }, target),
    // 🔴 ไม่ลิงก์ไปคำตอบรายใบ (หน้านั้นคือเนื้อคำตอบของลูกค้า) — พาไปที่ตัวฟอร์มแทน
    href: (_linkId, t) => (t.pathHint ? `/app/forms/${t.pathHint}` : null),
    resolve: async (ctx, ids) => {
      // 🔴 ไม่ดึง `answersJson` — เนื้อคำตอบของลูกค้าไม่ใช่ของที่แถวเชื่อมต้องรู้
      const rows = await prisma.formSubmission.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, formId: true, createdAt: true, form: { select: { name: true } } },
      });
      return new Map(
        rows.map((r) => [
          r.id,
          { title: r.form?.name ?? "คำตอบจากฟอร์ม", subtitle: thDay(r.createdAt), pathHint: r.formId },
        ]),
      );
    },
  },
  KB_ARTICLE: {
    ...LINK_TYPE_META.KB_ARTICLE,
    modules: ["kb"],
    action: null,
    canView: (actor, target) => moduleGate(actor, { modules: ["kb"], action: null }, target),
    href: (linkId) => `/app/kb/${linkId}`,
    resolve: async (ctx, ids) => {
      const rows = await prisma.kbArticle.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, title: true, category: true, active: true },
      });
      return new Map(
        rows.map((r) => [
          r.id,
          { title: r.title, subtitle: r.category, status: r.active ? null : "ปิดใช้งาน" },
        ]),
      );
    },
  },
  POS_SALE: {
    ...LINK_TYPE_META.POS_SALE,
    modules: ["pos"],
    action: null,
    canView: (actor, target) => moduleGate(actor, { modules: ["pos"], action: null }, target),
    href: (_linkId, t) => (t.systemId ? `/app/sys/${t.systemId}/pos/sales` : null),
    resolve: async (ctx, ids) => {
      const rows = await prisma.posSale.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, unitId: true, systemId: true, receiptNo: true, status: true, grandTotalSatang: true },
      });
      return new Map(
        rows.map((r) => [
          r.id,
          {
            title: `บิล ${r.receiptNo ?? r.id.slice(-6)}`,
            subtitle: baht(r.grandTotalSatang),
            status: r.status,
            unitId: r.unitId,
            systemId: r.systemId,
          },
        ]),
      );
    },
  },
  SHOP_ORDER: {
    ...LINK_TYPE_META.SHOP_ORDER,
    modules: ["shop"],
    action: null,
    canView: (actor, target) => moduleGate(actor, { modules: ["shop"], action: null }, target),
    href: (_linkId, t) => (t.unitSlug ? `/app/u/${t.unitSlug}/shop/orders` : null),
    resolve: async (ctx, ids) => {
      // 🔴 ไม่ดึงชื่อ/เบอร์ผู้สั่ง — เลขคำสั่งซื้อพอสำหรับ "รู้ว่าผูกกับบิลไหน"
      const rows = await prisma.shopOrder.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, unitId: true, code: true, status: true, totalSatang: true },
      });
      const slugs = await unitSlugs(ctx, rows.map((r) => r.unitId));
      return new Map(
        rows.map((r) => [
          r.id,
          {
            title: `คำสั่งซื้อ ${r.code}`,
            subtitle: baht(r.totalSatang),
            status: r.status,
            unitId: r.unitId,
            unitSlug: slugs.get(r.unitId) ?? null,
          },
        ]),
      );
    },
  },
  RESTAURANT_ORDER: {
    ...LINK_TYPE_META.RESTAURANT_ORDER,
    modules: ["restaurant"],
    action: null,
    canView: (actor, target) => moduleGate(actor, { modules: ["restaurant"], action: null }, target),
    href: (_linkId, t) => (t.unitSlug ? `/app/u/${t.unitSlug}/restaurant` : null),
    resolve: async (ctx, ids) => {
      const rows = await prisma.restaurantOrder.findMany({
        where: { ...scopeOf(ctx), id: { in: ids } },
        select: { id: true, unitId: true, bizDate: true, dailyNo: true, status: true, type: true },
      });
      const slugs = await unitSlugs(ctx, rows.map((r) => r.unitId));
      return new Map(
        rows.map((r) => [
          r.id,
          {
            title: `ออร์เดอร์ #${r.dailyNo}`,
            subtitle: `${r.bizDate} · ${r.type}`,
            status: r.status,
            unitId: r.unitId,
            unitSlug: slugs.get(r.unitId) ?? null,
          },
        ]),
      );
    },
  },
  // ลิงก์ภายนอก — ไม่มีของใน DB ให้แปล และไม่มีด่านสิทธิ์ (ใครเห็นการ์ดก็เปิดได้)
  URL: {
    ...LINK_TYPE_META.URL,
    modules: [],
    action: null,
    canView: () => true,
    href: (linkId) => linkId,
    resolve: null,
  },
};

/** ชนิดทั้งหมด (ทะเบียนเดียว — UI/API/บริการ อ่านจากที่นี่ที่เดียว) */
export const LINK_TYPE_KINDS = Object.keys(LINK_TYPES) as KanbanLinkKind[];

/** ป้ายชนิดภาษาไทย (ใช้ทั้งหลังการ์ดและมุมมองตาราง) */
export function linkTypeLabel(kind: KanbanLinkKind): string {
  return LINK_TYPES[kind].label;
}

// ───────────────────────── แปลผลเป็นชุด (กัน N+1) ─────────────────────────

/**
 * แปล pointer ทั้งชุดเป็นข้อมูลที่แสดงได้ — จัดกลุ่มตามชนิดแล้วยิงคิวรีชนิดละครั้ง
 * ปลายทางที่หาไม่เจอ (ถูกลบ / คนละร้าน) จะไม่มีใน Map ⇒ ผู้เรียกแสดงว่า "ถูกลบแล้ว"
 */
export async function resolveTargets(
  ctx: KanbanCtx,
  refs: readonly { linkType: KanbanLinkKind; linkId: string }[],
): Promise<Map<string, ResolvedTarget>> {
  const byType = new Map<KanbanLinkKind, Set<string>>();
  for (const r of refs) {
    if (!LINK_TYPES[r.linkType]?.resolve) continue;
    const set = byType.get(r.linkType) ?? new Set<string>();
    set.add(r.linkId);
    byType.set(r.linkType, set);
  }
  const out = new Map<string, ResolvedTarget>();
  const results = await Promise.all(
    [...byType.entries()].map(async ([kind, ids]) => {
      const resolver = LINK_TYPES[kind].resolve;
      if (!resolver) return [kind, new Map<string, ResolvedTarget>()] as const;
      // ปลายทางที่โมดูลนั้นล่ม/ตารางเปลี่ยน ไม่ควรทำให้ "เปิดการ์ดไม่ได้" — แถวนั้นกลายเป็น "ถูกลบแล้ว"
      const map = await resolver(ctx, [...ids]).catch(() => new Map<string, ResolvedTarget>());
      return [kind, map] as const;
    }),
  );
  for (const [kind, map] of results) for (const [id, t] of map) out.set(`${kind}:${id}`, t);
  return out;
}

/** ปลายทางชิ้นเดียวมีอยู่จริงในร้านนี้ไหม (ด่านของ `addLink`) */
export async function targetExists(ctx: KanbanCtx, linkType: KanbanLinkKind, linkId: string): Promise<boolean> {
  const resolver = LINK_TYPES[linkType].resolve;
  if (!resolver) return true;
  const map = await resolver(ctx, [linkId]);
  return map.has(linkId);
}

// ───────────────────────── ประกอบ DTO (จุดตัดสินสิทธิ์จุดเดียว) ─────────────────────────

type LinkRow = {
  id: string;
  linkType: KanbanLinkKind;
  linkId: string;
  role: string | null;
  label: string | null;
};

/**
 * 🔴 จุดเดียวในระบบที่ "ข้อมูลปลายทาง" กลายเป็น DTO ที่ส่งออกจอ — ด่านความลับอยู่ที่นี่ที่เดียว
 *    ไม่มีสิทธิ์ = สร้าง DTO จากป้ายชนิดล้วน ๆ (ไม่แตะ target เลย) ⇒ ไม่มีทางหลุดโดยบังเอิญ
 */
export function toLinkDto(row: LinkRow, target: ResolvedTarget | null, actor: KanbanActor): CardLinkDto {
  const spec = LINK_TYPES[row.linkType];
  const role = (row.role as KanbanLinkRole | null) ?? null;
  const canView = spec.canView(actor, target);
  if (!canView) {
    return {
      id: row.id,
      linkType: row.linkType,
      typeLabel: spec.label,
      icon: spec.icon,
      linkId: row.linkId,
      role,
      canView: false,
      title: `${spec.label} (ไม่มีสิทธิ์เข้าถึง)`,
      subtitle: null,
      status: null,
      href: null,
    };
  }
  if (row.linkType === "URL") {
    return {
      id: row.id,
      linkType: row.linkType,
      typeLabel: spec.label,
      icon: spec.icon,
      linkId: row.linkId,
      role,
      canView: true,
      title: row.label?.trim() || row.linkId,
      subtitle: row.label?.trim() ? row.linkId : null,
      status: null,
      href: spec.href(row.linkId, { title: "" }),
    };
  }
  if (!target) {
    return {
      id: row.id,
      linkType: row.linkType,
      typeLabel: spec.label,
      icon: spec.icon,
      linkId: row.linkId,
      role,
      canView: true,
      title: `${spec.label} (ถูกลบไปแล้ว)`,
      subtitle: null,
      status: null,
      href: null,
    };
  }
  return {
    id: row.id,
    linkType: row.linkType,
    typeLabel: spec.label,
    icon: spec.icon,
    linkId: row.linkId,
    role,
    canView: true,
    title: target.title,
    subtitle: target.subtitle ?? null,
    status: target.status ?? null,
    href: spec.href(row.linkId, target),
  };
}

// ───────────────────────── ฝั่งอ่าน ─────────────────────────

/**
 * การเชื่อมทั้งหมดของการ์ด 1 ใบ (VIEWER+ ของบอร์ด · มองบอร์ดไม่เห็น = 404)
 * 🔴 `actor` เป็นพารามิเตอร์ ไม่ใช่ค่าที่อ่านจาก ctx: สิทธิ์ของ "ผู้ดู" คิดใหม่ทุกครั้งที่เรียก
 *    (ให้สิทธิ์เพิ่มแล้วเรียกซ้ำ = เห็นทันที · ไม่มีการจำผลข้ามผู้ใช้ที่ไหนทั้งสิ้น)
 */
export async function listCardLinks(ctx: KanbanCtx, actor: KanbanActor, cardId: string): Promise<CardLinkDto[]> {
  await assertCardRole(ctx, cardId, "VIEWER");
  const rows = await prisma.kanbanCardLink.findMany({
    where: { cardId, tenantId: ctx.tenantId, systemId: ctx.systemId, removedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, linkType: true, linkId: true, role: true, label: true },
  });
  if (rows.length === 0) return [];
  const targets = await resolveTargets(ctx, rows);
  return rows.map((r) => toLinkDto(r, targets.get(`${r.linkType}:${r.linkId}`) ?? null, actor));
}

/** จำนวนการเชื่อมของหลายการ์ดในเที่ยวเดียว (ชิป 🔗 n บนการ์ด/แถวตาราง) — ไม่ตัดสินสิทธิ์ (แค่ "มีของผูกอยู่กี่ชิ้น") */
export async function linkCountsOfCards(ctx: KanbanCtx, cardIds: readonly string[]): Promise<Map<string, number>> {
  if (cardIds.length === 0) return new Map();
  const rows = await prisma.kanbanCardLink.groupBy({
    by: ["cardId"],
    where: { cardId: { in: [...cardIds] }, tenantId: ctx.tenantId, systemId: ctx.systemId, removedAt: null },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.cardId, r._count._all]));
}

/**
 * ป้ายสั้น ๆ ของการเชื่อมต่อการ์ด (คอลัมน์ "เชื่อม" ของมุมมองตาราง — K2.1)
 * 🔴 คืนเฉพาะแถวที่ผู้ดู **มีสิทธิ์เห็น** (แถวที่ไม่มีสิทธิ์หายไปจากตาราง ไม่ใช่แสดงเป็นช่องเทา —
 *    ตารางคือมุมมองสรุป ไม่ใช่หลังการ์ดที่ต้องบอกว่า "มีของอยู่")
 */
export async function linkChipsOfCards(
  ctx: KanbanCtx,
  actor: KanbanActor,
  cardIds: readonly string[],
): Promise<Map<string, { type: string; label: string }[]>> {
  const out = new Map<string, { type: string; label: string }[]>();
  if (cardIds.length === 0) return out;
  const rows = await prisma.kanbanCardLink.findMany({
    where: { cardId: { in: [...cardIds] }, tenantId: ctx.tenantId, systemId: ctx.systemId, removedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, cardId: true, linkType: true, linkId: true, role: true, label: true },
  });
  if (rows.length === 0) return out;
  const targets = await resolveTargets(ctx, rows);
  for (const r of rows) {
    const dto = toLinkDto(r, targets.get(`${r.linkType}:${r.linkId}`) ?? null, actor);
    if (!dto.canView) continue;
    const list = out.get(r.cardId) ?? [];
    list.push({ type: dto.linkType, label: dto.title });
    out.set(r.cardId, list);
  }
  return out;
}

/**
 * ขาย้อน — "ของชิ้นนี้ถูกอ้างในการ์ดใบไหนบ้าง" (§9.1)
 * 🔴 กรองด้วย `visibleBoardsWhere(actor)` เสมอ: ไม่งั้นคนที่รู้ id ของลูกค้าคนหนึ่ง จะอ่านชื่อการ์ด
 *    ในบอร์ดลับของสาขาอื่นได้ผ่านทางนี้
 */
export async function listCardsForTarget(
  ctx: KanbanCtx,
  actor: KanbanActor,
  target: { linkType: KanbanLinkKind; linkId: string },
): Promise<CardForTargetDto[]> {
  const rows = await prisma.kanbanCardLink.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      linkType: target.linkType,
      linkId: target.linkId,
      removedAt: null,
      card: { board: { status: "ACTIVE", ...visibleBoardsWhere(actor) } },
    },
    orderBy: { createdAt: "desc" },
    select: {
      card: {
        select: {
          id: true,
          cardNo: true,
          title: true,
          status: true,
          boardId: true,
          board: { select: { name: true } },
          column: { select: { name: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    cardId: r.card.id,
    cardNo: r.card.cardNo,
    title: r.card.title,
    boardId: r.card.boardId,
    boardName: r.card.board.name,
    columnName: r.card.column.name,
    status: r.card.status as "ACTIVE" | "ARCHIVED",
  }));
}

/** actor ของผู้เรียก (ไม่มี membership ในร้านนี้ = ทำอะไรกับบอร์ดงานไม่ได้) */
export async function requireLinkActor(ctx: KanbanCtx): Promise<KanbanActor> {
  const actor = await loadActor(ctx);
  if (!actor) throw new KanbanNotFoundError("ไม่พบบัญชีผู้ใช้ในร้านนี้");
  return actor;
}
