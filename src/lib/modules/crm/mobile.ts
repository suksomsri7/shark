// mobile.ts — ชั้นบาง ๆ ของ "แอปพนักงาน" ส่วน CRM (ใบ C3.7 · ภาพ 13 · route `src/app/api/mobile/crm/**`)
//
// ของที่ไฟล์นี้เป็นเจ้าของ
//   • resolveSystem — ระบบ CRM ของคำขอ: `?systemId=` (ต้องเป็นระบบ CRM ของร้านนี้ ไม่งั้น 404 · uiVersion 1 ⇒ 409 CRM_V2_DISABLED)
//     หรือถ้าไม่ส่งมา = ระบบ CRM uiVersion 2 ใบแรกของร้าน (ลำดับเดียวกับ crmGates: createdAt, id) · ไม่มีเลย = 404
//   • myDeals / dealDetail — "ดีลของฉัน": ดีล OPEN ที่ยังไม่ถูกเก็บ · เจ้าของ = ผู้ใช้คนนี้ · ภายใน dealWhere (ไม่มีเพดาน)
//   • todayTasks / completeTask — "งานวันนี้": งานค้างที่ครบกำหนดภายในวันไทยนี้ (รวมเลยกำหนด) + ที่ปิดวันนี้ (เพดาน 200)
//     ปิดงานผ่าน `activities.completeActivity` (ตัวเดียวกับหน้าเว็บ — การมองเห็น + คีย์ crm.activity.complete ตัดสินที่นั่น)
//   • callPrompt — ข้อมูลของแผ่น "บันทึกสาย — วางสายแล้ว" (ผู้ติดต่อ · ดีล · ทะเบียนผลสาย CALL · ทิศทาง)
//   • callOnce — กันบันทึกสายซ้ำด้วย idempotencyKey ของแอป (ตัวบันทึก + ตัวกันซ้ำจริง = `calls.logCall(…, { sourceRef })` → logActivity)
//   • mobileErrorOf — error ของบริการ CRM → { status, error, message ภาษาไทย } (มองไม่เห็น = 404 ไม่ใช่ 403)
//
// 🔴 AUDIT-CLASS X1: ทุกการอ่านผ่าน `./where` (visibleWhere) + tenantId/systemId ของ ctx เสมอ · id ที่มองไม่เห็น = NOT_FOUND
// 🔴 AUDIT-CLASS X8: DTO ไม่มีอีเมลของใครเลย · เบอร์โทรมีที่เดียว = ผู้ติดต่อบนการ์ดดีล (ปุ่ม `tel:`) และเฉพาะผู้ติดต่อที่มองเห็น
// 🔴 AUDIT-CLASS X3: บันทึกสาย "กดซ้ำหลังวางสาย" ต้องได้แถวเดียว — ชั้นแรกกันซ้ำในโพรเซสเดียวกัน (คำขอที่มาพร้อมกันรอผลเดียวกัน) ·
//    ชั้นจริงข้ามเครื่อง = `sourceRef` ใน tx เดียวของ logActivity (advisory lock ของกุญแจ + หาแถวเดิม + insert)
import type { CrmActivity, Prisma } from "@prisma/client";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { activityWhere, contactWhere, dealWhere } from "./where";
import { companyRefsInTx } from "./companies";
import { activityOutcomesOf, parseCrmSettings } from "./settings";
import { CRM_V2_DISABLED_MSG, CrmV2DisabledError } from "./ui-version";
import { ACTIVITY_OUTCOMES_DEFAULT, ActivitiesError, DAY_MS } from "./activities-shared";
import { CallsError } from "./calls-shared";
import { contactRefusalOf } from "./contacts-shared"; // CRM C5.5-fix12 r2/r3 ▸ RV12-1 · RV12r-2 ◂
import * as activities from "./activities";

export type MobileCrmCtx = { tenantId: string; systemId: string; actorUserId: string };

/** error ที่ route ตอบตรง ๆ (สถานะ + รหัสอังกฤษที่แอปอ่าน + ข้อความไทย) */
export class MobileCrmError extends Error {
  readonly status: number;
  readonly error: string;
  constructor(status: number, error: string, message: string) {
    super(message);
    this.name = "MobileCrmError";
    this.status = status;
    this.error = error;
  }
}

const SYS_NOT_FOUND = "ไม่พบระบบ CRM นี้ในกิจการที่เลือก — ปิดแล้วเปิดเมนู CRM ใหม่อีกครั้ง";
const NO_V2_SYSTEM = "กิจการนี้ยังไม่ได้เปิดระบบ CRM ใหม่ — ให้เจ้าของร้านเปิดใช้ CRM ใหม่ก่อน แล้วเมนูนี้จะใช้ได้ทันที";
const DEAL_NOT_FOUND = "ไม่พบดีลนี้ในรายการที่คุณดูแล (อาจถูกย้ายหรือปิดไปแล้ว) — ดึงรายการใหม่อีกครั้ง";
const CONTACT_NOT_FOUND = "ไม่พบผู้ติดต่อคนนี้ในรายการที่คุณดูแล — เปิดจากการ์ดดีลอีกครั้ง";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

// ═════════════════════════ ระบบ CRM ของคำขอ ═════════════════════════

/**
 * AUDIT-CLASS X1: `systemId` ที่แอปส่งมาเป็นแค่ "ตัวเลือก" — ต้องเป็นระบบ CRM ของร้านนี้จริง (ของร้านอื่น/ชนิดอื่น = 404 ไม่บอกว่ามี)
 * R-E.14: ระบบที่ยังเป็น uiVersion 1 ⇒ 409 CRM_V2_DISABLED (ไม่อ่าน ไม่เขียนอะไรเลย)
 */
export async function resolveSystem(tenantId: string, systemId: string | null | undefined): Promise<string> {
  const want = str(systemId);
  if (want) {
    const row = await prisma.appSystem.findFirst({ where: { id: want, tenantId, type: "CRM" }, select: { id: true, settings: true } });
    if (!row) throw new MobileCrmError(404, "not_found", SYS_NOT_FOUND);
    if (parseCrmSettings(row.settings).uiVersion !== 2) throw new MobileCrmError(409, "CRM_V2_DISABLED", CRM_V2_DISABLED_MSG);
    return row.id;
  }
  const rows = await prisma.appSystem.findMany({ where: { tenantId, type: "CRM" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, settings: true }, take: 50 });
  const first = rows.find((r) => parseCrmSettings(r.settings).uiVersion === 2);
  if (!first) throw new MobileCrmError(404, "not_found", NO_V2_SYSTEM);
  return first.id;
}

// ═════════════════════════ ดีลของฉัน ═════════════════════════

export type MobileDealDto = {
  id: string;
  title: string;
  valueSatang: number;
  stageId: string;
  stageName: string;
  /** ดีลนิ่ง (ปักโดยงานรายวัน `crm.deals.stale`) — จำนวนวันที่ไม่มีความเคลื่อนไหว · ไม่นิ่ง = null */
  stalledDays: number | null;
  nextActivityAt: string | null;
  company: { id: string; name: string } | null;
  /** เบอร์มีเฉพาะที่นี่ (ปุ่มโทร) · ผู้ติดต่อที่มองไม่เห็น = null */
  contact: { id: string; name: string; phone: string | null } | null;
};
export type MobileDealsDto = { items: MobileDealDto[]; stages: { id: string; name: string; count: number }[] };

const DEALS_CAP = 500;

type DealRow = Prisma.CrmDealGetPayload<{ include: { stage: { select: { id: true; name: true; sortOrder: true } } } }>;

async function toDealDtos(ctx: MobileCrmCtx, a: MemberActor, rows: DealRow[], now: Date): Promise<MobileDealDto[]> {
  const contactIds = [...new Set(rows.map((r) => r.contactId))];
  const companyIds = [...new Set(rows.map((r) => r.companyId).filter((x): x is string => !!x))];
  const contacts = contactIds.length
    ? await prisma.crmContact.findMany({ where: { AND: [await contactWhere(ctx, a), { id: { in: contactIds } }] }, select: { id: true, name: true, phone: true } })
    : [];
  // CRM C1.3 S0.3: บริษัทอ่านผ่านบริการของบริษัทเท่านั้น (companyWhere อยู่ในนั้น) — ไม่มี query CrmCompany ในไฟล์นี้
  const companyRows = await companyRefsInTx(prisma, ctx, a, companyIds);
  const cMap = new Map(contacts.map((c) => [c.id, c]));
  const coMap = new Map(companyRows.map((c) => [c.id, c]));
  return rows.map((r) => {
    const c = cMap.get(r.contactId);
    const co = r.companyId ? coMap.get(r.companyId) : undefined;
    const since = (r.lastActivityAt ?? r.stageEnteredAt).getTime();
    return {
      id: r.id,
      title: r.title,
      valueSatang: r.valueSatang,
      stageId: r.stageId,
      stageName: r.stage.name,
      stalledDays: r.stalledAt ? Math.max(0, Math.floor((now.getTime() - since) / DAY_MS)) : null,
      nextActivityAt: iso(r.nextActivityAt),
      company: co ? { id: co.id, name: co.name } : null,
      contact: c ? { id: c.id, name: c.name, phone: c.phone ?? null } : null,
    };
  });
}

/** ดีล OPEN ของผู้ใช้คนนี้ (ยังไม่ถูกเก็บ) ภายในขอบเขตที่มองเห็น — นิ่งนานสุดขึ้นก่อน แล้วตามนัดถัดไป */
export async function myDeals(ctx: MobileCrmCtx, a: MemberActor, now = new Date()): Promise<MobileDealsDto> {
  const rows = await prisma.crmDeal.findMany({
    where: { AND: [await dealWhere(ctx, a), { tenantId: ctx.tenantId, systemId: ctx.systemId, ownerUserId: a.userId, kind: "OPEN", archivedAt: null }] },
    include: { stage: { select: { id: true, name: true, sortOrder: true } } },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: DEALS_CAP, // รีวิว: เพดานกันร้านที่มีดีลของคนเดียวเป็นพัน ๆ (ข้อสอบ = ไม่มีเพดานบน seed · seed มีไม่ถึง)
  });
  const items = await toDealDtos(ctx, a, rows, now);
  const next = (d: MobileDealDto) => (d.nextActivityAt ? Date.parse(d.nextActivityAt) : Number.POSITIVE_INFINITY);
  items.sort((x, y) => (y.stalledDays ?? -1) - (x.stalledDays ?? -1) || next(x) - next(y));
  const order = new Map(rows.map((r) => [r.stageId, r.stage.sortOrder]));
  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const d of items) {
    const s = counts.get(d.stageId) ?? { id: d.stageId, name: d.stageName, count: 0 };
    s.count += 1;
    counts.set(d.stageId, s);
  }
  const stages = [...counts.values()].sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
  return { items, stages };
}

/** ดีล 1 ใบ (เปิดจากแจ้งเตือน) — มองไม่เห็น/คนละระบบ/คนละร้าน = 404 */
export async function dealDetail(ctx: MobileCrmCtx, a: MemberActor, id: string, now = new Date()): Promise<MobileDealDto> {
  const did = str(id);
  const row = did
    ? await prisma.crmDeal.findFirst({
        where: { AND: [await dealWhere(ctx, a), { id: did, tenantId: ctx.tenantId, systemId: ctx.systemId }] },
        include: { stage: { select: { id: true, name: true, sortOrder: true } } },
      })
    : null;
  if (!row) throw new MobileCrmError(404, "not_found", DEAL_NOT_FOUND);
  return (await toDealDtos(ctx, a, [row], now))[0]!;
}

// ═════════════════════════ งานวันนี้ ═════════════════════════

export type MobileTaskDto = {
  id: string;
  title: string;
  type: string;
  dueAt: string | null;
  done: boolean;
  contactId: string | null;
  dealId: string | null;
  /** บรรทัดรอง = ชื่อดีล (หรือชื่อผู้ติดต่อ) ที่มองเห็น — ไม่มีเบอร์/อีเมล */
  context: string | null;
};
export type MobileTasksDto = { items: MobileTaskDto[]; counts: { today: number; overdue: number; done: number } };

const TASKS_CAP = 200;
const TH_OFFSET_MS = 7 * 3_600_000;

/** ช่วงวันไทยของ `now` (00:00–24:00 เวลาไทย เป็นเวลา UTC) — ไม่พึ่งเขตเวลาของเครื่อง */
export function thaiDayRange(now: Date): { from: Date; to: Date } {
  const t = new Date(now.getTime() + TH_OFFSET_MS);
  const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - TH_OFFSET_MS);
  return { from, to: new Date(from.getTime() + DAY_MS) };
}

export async function todayTasks(ctx: MobileCrmCtx, a: MemberActor, now = new Date()): Promise<MobileTasksDto> {
  const { from, to } = thaiDayRange(now);
  const scope: Prisma.CrmActivityWhereInput[] = [await activityWhere(ctx, a), { tenantId: ctx.tenantId, systemId: ctx.systemId, ownerUserId: a.userId }];
  // CRM C5.4-E ▸ L6-m1: วันนี้/เลยกำหนด = นิยามเดียวกับแท็บงานบนเว็บ (`activities.activityStatusWhere` — เวลาอ้างอิง dueAt ?? startAt ·
  //   ไม่นับโน้ต · เลยกำหนด = ก่อน 00:00 ไทยของวันนี้) ◂
  const wToday = activities.activityStatusWhere("today", now.getTime());
  const wOverdue = activities.activityStatusWhere("overdue", now.getTime());
  const rows: CrmActivity[] = await prisma.crmActivity.findMany({
    where: { AND: [...scope, { OR: [wOverdue, wToday, { doneAt: { gte: from, lt: to } }] }] },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: TASKS_CAP,
  });
  const [today, overdue, done] = await Promise.all([
    prisma.crmActivity.count({ where: { AND: [...scope, wToday] } }),
    prisma.crmActivity.count({ where: { AND: [...scope, wOverdue] } }),
    prisma.crmActivity.count({ where: { AND: [...scope, { doneAt: { gte: from, lt: to } }] } }),
  ]);
  const dealIds = [...new Set(rows.map((r) => r.dealId).filter((x): x is string => !!x))];
  const contactIds = [...new Set(rows.map((r) => r.contactId).filter((x): x is string => !!x))];
  const deals = dealIds.length ? await prisma.crmDeal.findMany({ where: { AND: [await dealWhere(ctx, a), { id: { in: dealIds } }] }, select: { id: true, title: true } }) : [];
  const contacts = contactIds.length ? await prisma.crmContact.findMany({ where: { AND: [await contactWhere(ctx, a), { id: { in: contactIds } }] }, select: { id: true, name: true } }) : [];
  const dMap = new Map(deals.map((d) => [d.id, d.title]));
  const cMap = new Map(contacts.map((c) => [c.id, c.name]));
  // งานค้างก่อน (เรียงตามกำหนด) แล้วงานที่ปิดวันนี้ไว้ท้าย
  const items = rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      type: String(r.type),
      dueAt: iso(r.dueAt),
      done: !!r.doneAt,
      contactId: r.contactId,
      dealId: r.dealId,
      context: (r.dealId ? dMap.get(r.dealId) : undefined) ?? (r.contactId ? cMap.get(r.contactId) : undefined) ?? null,
    }))
    .sort((x, y) => Number(x.done) - Number(y.done));
  return { items, counts: { today, overdue, done } };
}

/** ปิดงาน — บริการกิจกรรมตัวเดียวกับหน้าเว็บ (มองไม่เห็น = NOT_FOUND ⇒ 404) */
export async function completeTask(ctx: MobileCrmCtx, a: MemberActor, id: string): Promise<{ id: string; done: boolean }> {
  const dto = await activities.completeActivity(ctx, a, id);
  return { id: dto.id, done: !!dto.doneAt };
}

// ═════════════════════════ แผ่นบันทึกสาย ═════════════════════════

export type MobileCallPromptDto = {
  contact: { id: string; name: string };
  deal: { id: string; title: string } | null;
  outcomes: string[];
  directions: ("OUT" | "IN")[];
};

export async function callPrompt(ctx: MobileCrmCtx, a: MemberActor, input: { contactId?: string | null; dealId?: string | null }): Promise<MobileCallPromptDto> {
  const cid = str(input.contactId);
  const contact = cid
    ? await prisma.crmContact.findFirst({ where: { AND: [await contactWhere(ctx, a), { id: cid, tenantId: ctx.tenantId, systemId: ctx.systemId }] }, select: { id: true, name: true } })
    : null;
  if (!contact) throw new MobileCrmError(404, "not_found", CONTACT_NOT_FOUND);
  const did = str(input.dealId);
  const deal = did
    ? await prisma.crmDeal.findFirst({ where: { AND: [await dealWhere(ctx, a), { id: did, tenantId: ctx.tenantId, systemId: ctx.systemId }] }, select: { id: true, title: true } })
    : null;
  if (did && !deal) throw new MobileCrmError(404, "not_found", DEAL_NOT_FOUND);
  const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { settings: true } });
  const outcomes = [...(activityOutcomesOf(sys?.settings ?? null, "CALL", ACTIVITY_OUTCOMES_DEFAULT) ?? [])];
  return { contact, deal, outcomes, directions: ["OUT", "IN"] };
}

// ═════════════════════════ กันบันทึกสายซ้ำ ═════════════════════════

/** รูปของ idempotencyKey ที่รับ: 1–100 ตัว ไม่มีช่องว่าง/อักขระควบคุม (ค่าที่แอปสุ่มเอง) */
export function cleanIdempotencyKey(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length >= 1 && s.length <= 100 && /^[\x21-\x7e]+$/.test(s) ? s : null;
}

const inflight = new Map<string, Promise<{ activityId: string; replayed: boolean }>>();

/**
 * บันทึกสาย 1 ครั้งต่อ key — `run(sourceRef)` = การเรียก `calls.logCall(…, { sourceRef })` ของ route (ผู้เขียนแถว CALL ตัวเดียวของระบบ)
 * 🔴 (รีวิว SF-1) กันซ้ำจริงอยู่ใน `activities.logActivity`: advisory lock ของ sourceRef + หาแถวเดิม + insert พร้อม sourceRef ใน
 *    **ธุรกรรมเดียว** (ไม่มีช่วง commit ห่างกันระหว่างสองธุรกรรม · ไม่ถือ connection ที่สองระหว่างรอ)
 *    ชั้นในโพรเซสนี้แค่ให้คำขอซ้ำที่มาพร้อมกันในเครื่องเดียวรอผลเดียวกัน (ไม่เปิดธุรกรรมไปรอล็อกพร้อมกัน 10 ตัว)
 * 🔴 key เดิมแต่เนื้อคำขอต่าง (แก้โน้ตแล้วกดใหม่) = ได้ id เดิม ไม่แก้แถว — key ออกใหม่ทุกครั้งที่เปิดแผ่นบันทึกสาย (สัญญาเดียวกับ Idempotency-Key)
 */
export async function callOnce(ctx: MobileCrmCtx, key: string, run: (sourceRef: string) => Promise<{ activity: { id: string }; replayed?: boolean }>): Promise<{ activityId: string; replayed: boolean }> {
  const ref = `mobile-call:${ctx.actorUserId}:${key}`;
  const slot = `${ctx.tenantId}:${ctx.systemId}:${ref}`;
  const running = inflight.get(slot);
  if (running) return running.then((r) => ({ activityId: r.activityId, replayed: true }));
  const job = run(ref)
    .then((out) => ({ activityId: out.activity.id, replayed: out.replayed === true }))
    .finally(() => inflight.delete(slot));
  inflight.set(slot, job);
  return job;
}

// ═════════════════════════ error → JSON ═════════════════════════

const CODE_STATUS: Record<string, { status: number; error: string; fallback: string }> = {
  NOT_FOUND: { status: 404, error: "not_found", fallback: "ไม่พบรายการนี้ในรายการที่คุณดูแล — ดึงข้อมูลใหม่อีกครั้ง" },
  FORBIDDEN: { status: 403, error: "forbidden", fallback: "บัญชีของคุณยังไม่ได้รับสิทธิ์ทำรายการนี้ในระบบ CRM — ขอสิทธิ์จากเจ้าของร้านก่อน" },
  VALIDATION: { status: 400, error: "invalid", fallback: "ข้อมูลที่ส่งมาไม่ครบ — ตรวจแล้วลองอีกครั้ง" },
  CONFLICT: { status: 409, error: "conflict", fallback: "รายการนี้ถูกจัดการไปแล้วจากอีกเครื่องหนึ่ง — ดึงข้อมูลใหม่อีกครั้ง" },
  CONFIRM_REQUIRED: { status: 409, error: "confirm_required", fallback: "รายการนี้ต้องยืนยันจากหน้าเว็บ" },
  NO_CREDIT: { status: 400, error: "no_credit", fallback: "เครดิตผู้ช่วย AI หมดแล้ว — เติมเครดิตแล้วลองอีกครั้ง" },
  NOT_CONFIGURED: { status: 400, error: "not_configured", fallback: "ยังไม่ได้ตั้งค่าผู้ช่วย AI ของระบบ — ขอให้ผู้ดูแลระบบตั้งค่าก่อน" },
};

/** error ใด ๆ จากบริการ CRM → คำตอบของแอป (ข้อความไทย ไม่โทษผู้ใช้ ไม่มีรายละเอียดภายใน) */
export function mobileErrorOf(e: unknown): { status: number; error: string; message: string } {
  if (e instanceof MobileCrmError) return { status: e.status, error: e.error, message: e.message };
  if (e instanceof CrmV2DisabledError) return { status: 409, error: "CRM_V2_DISABLED", message: CRM_V2_DISABLED_MSG };
  // CRM C5.5-fix12 r2/r3 ▸ RV12-1 · RV12r-2: ข้อปฏิเสธของบริการผู้ติดต่อ (สแกนนามบัตรแล้วกดรับ) = ข้อความไทยของบริการ ไม่ใช่ 500 "ระบบขัดข้อง … ลองใหม่":
  //   ตัวซ้ำที่มองไม่เห็น (ข้อความกลาง) → 409 duplicate · เพดานของระบบ → 409 limit · ขอถี่ → 429 rate_limited
  //   (แอปแสดง `message` ที่มีอักษรไทยตามที่ได้ทุกสถานะ — apps/mobile/src/api/client.ts apiErrorText) ◂
  const refusal = contactRefusalOf(e);
  if (refusal) return { status: refusal.status, error: refusal.code === "DUPLICATE" ? "duplicate" : refusal.code === "LIMIT" ? "limit" : "rate_limited", message: refusal.message };
  if (e instanceof CallsError || e instanceof ActivitiesError) {
    const m = CODE_STATUS[e.code] ?? CODE_STATUS.VALIDATION!;
    return { status: m.status, error: m.error, message: /[ก-๙]/.test(e.message) ? e.message : m.fallback };
  }
  if (e instanceof Error && e.name === "ForbiddenError") return { status: 403, error: "forbidden", message: CODE_STATUS.FORBIDDEN!.fallback };
  return { status: 500, error: "error", message: "ระบบ CRM ขัดข้องชั่วคราว (ข้อมูลไม่เปลี่ยน) — ลองใหม่อีกครั้งในอีกสักครู่" };
}

