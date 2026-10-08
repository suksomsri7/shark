// activity.ts — ไทม์ไลน์ของสมาชิกหนึ่งคน (M1.11)
//
// ทำไมเป็นไฟล์ใหม่ ไม่ใช่ฟังก์ชันใน `profile.ts`: หน้า 360 เดิมอ่านแถว `MemberActivity` เอง
// (ต่างคนต่าง query) แต่ REST/สกิล AI ต้องมี "สัญญาเดียว" ของไทม์ไลน์ที่มีตัวกรอง+เคอร์เซอร์
// ⇒ ยกขึ้นมาเป็นบริการของโมดูลตัวหนึ่ง เพื่อให้ op ของ API ไม่ต้องยิง prisma เอง (F2/F5)
//
// 🔴 ด่านสิทธิ์ = ด่านเดียวกับหน้า 360: มองไม่เห็นสมาชิกคนนี้ (คนละร้าน/นอกสาขาที่ดูแล) = 404
//    ⇒ ใช้ `briefFor` เป็นตัวตัดสิน "เห็นไหม" (มันกรองตามขอบเขตสาขาของ actor ให้แล้ว)

import { prisma } from "./db";
import { canReadMember, type MemberActor } from "./access";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import { briefFor, type MemberCtx } from "./profile";

export type MemberActivityDto = {
  id: string;
  at: Date;
  module: string;
  type: string;
  summary: string;
  data: Record<string, unknown> | null;
  refType: string | null;
  refId: string | null;
  unitId: string | null;
  actorUserId: string | null;
};

export type ListActivityOptions = {
  /** กรองตามโมดูลต้นทาง (`pos` · `booking` · `member` …) */
  module?: string | null;
  /** กรองตามชนิดเหตุการณ์ (`VISIT` · `TIER_CHANGED` …) */
  type?: string | null;
  /** ช่วงเวลา (ไม่ระบุ = ทั้งหมด) */
  from?: Date | null;
  to?: Date | null;
  unitId?: string | null;
  /** ≤ 100 */
  take?: number;
  /** id ของแถวสุดท้ายที่ได้ไปแล้ว (เคอร์เซอร์เดินหน้าอย่างเดียว) */
  cursor?: string | null;
};

export type ListActivityResult = {
  items: MemberActivityDto[];
  /** null = หมดแล้ว */
  nextCursor: string | null;
};

const MAX_TAKE = 100;

/**
 * C5.4 (L1-m5): โมดูลที่เป็น **ข้อมูลภายในร้าน** — ไม่แสดงในไทม์ไลน์ที่ลูกค้าเปิดดูเอง (`/m/[slug]/history` · actor CUSTOMER)
 * แถว CRM เขียนชื่อดีล · มูลค่า · ชื่อขั้นการขาย · ชื่อระเบียนกำหนดเอง (สะพาน `onCrmDealWon` · crm-bridges · objects) — เป็นข้อมูลการขาย
 * ของร้าน ไม่ใช่ประวัติของลูกค้า (พอร์ทัลบริษัทก็ซ่อนดีลจากลูกค้าเหมือนกัน `showDeals=false`) · พนักงานยังเห็นครบในหน้า 360 เหมือนเดิม
 */
export const STAFF_ONLY_MODULES: readonly string[] = ["crm", "crm.object"];

function objectOf(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * ไทม์ไลน์ของสมาชิก (ใหม่สุดขึ้นก่อน) — ใช้ทั้งแท็บ "ประวัติ" ของหน้า 360 และ `GET /members/{id}/activity`
 * 🔴 ไม่มีข้อมูลอ่อนไหวอยู่ในตารางนี้ (มีแต่สรุปเหตุการณ์) ⇒ ไม่ต้องผ่านนโยบาย D8 ซ้ำ
 */
export async function listActivity(
  ctx: MemberCtx,
  actor: MemberActor,
  customerId: string,
  opts: ListActivityOptions = {},
): Promise<ListActivityResult> {
  if (!canReadMember(actor)) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์เข้าโมดูลสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
  // เห็นสมาชิกคนนี้ไหม (ขอบเขตสาขา/ร้าน) — ไม่เห็น = ไม่พบ เสมอ (§6.4)
  const [brief] = await briefFor(ctx, actor, [customerId]);
  if (!brief) throw new MemberNotFoundError();

  const take = opts.take ?? 20;
  if (!Number.isInteger(take) || take < 1) throw new MemberInputError("จำนวนต่อหน้าต้องเป็นจำนวนเต็มมากกว่า 0");
  if (take > MAX_TAKE) throw new MemberInputError(`ดูไทม์ไลน์ได้สูงสุด ${MAX_TAKE} รายการต่อครั้ง — ลดจำนวนต่อหน้าแล้วลองใหม่`);

  const createdAt: { gte?: Date; lte?: Date } = {};
  if (opts.from) createdAt.gte = opts.from;
  if (opts.to) createdAt.lte = opts.to;

  const customerView = actor.role === "CUSTOMER";
  if (customerView && opts.module && STAFF_ONLY_MODULES.includes(opts.module)) return { items: [], nextCursor: null };
  const rows = await prisma.memberActivity.findMany({
    where: {
      tenantId: ctx.tenantId,
      customerId,
      ...(opts.module ? { module: opts.module } : customerView ? { module: { notIn: [...STAFF_ONLY_MODULES] } } : {}),
      ...(opts.type ? { type: opts.type } : {}),
      ...(opts.unitId ? { unitId: opts.unitId } : {}),
      ...(createdAt.gte || createdAt.lte ? { createdAt } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const page = rows.slice(0, take);
  return {
    items: page.map((r) => ({
      id: r.id,
      at: r.createdAt,
      module: r.module,
      type: r.type,
      summary: r.summary,
      data: objectOf(r.data),
      refType: r.refType,
      refId: r.refId,
      unitId: r.unitId,
      actorUserId: r.actorUserId,
    })),
    nextCursor: rows.length > take ? (page[page.length - 1]?.id ?? null) : null,
  };
}
