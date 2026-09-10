// privacy.ts — "ใครดูข้อมูลอ่อนไหวของสมาชิกได้" + บันทึกการดู (M1.4 ส่วนแรก · D8 + D17)
//
// ขอบเขตของใบนี้ (M1.4): `canViewSensitive` + `logAccess` เท่านั้น
//   ส่วนที่เหลือของไฟล์ (นโยบายเวอร์ชัน · consent · คำขอ export/erase · CRUD ของ policy)
//   เป็นของ M1.7 ซึ่งจะมาต่อในไฟล์นี้ — จึงวางโครง/ชนิดข้อมูลไว้ให้ต่อได้เลย
//
// อัลกอริทึม (พิมพ์เขียว §6.3 · ห้ามแก้ลำดับ):
//   policy = MemberSensitivePolicy(target) ?? ค่าปริยาย { roles: [OWNER, MANAGER] }
//   คีย์ API bundle readonly/operate → false เสมอ (แม้เจ้าของร้านเป็นคนออกคีย์)
//   OWNER (คนจริง) → true
//   hr   = HrEmployee ที่ linkedUserId = actor.userId (ไม่ผูก = ไม่มีตำแหน่ง)
//   pass = roles มีบทบาทของ actor  หรือ  hrPositions มีตำแหน่งของ hr  หรือ  hrDepartments มีแผนกของ hr
//   ถ้า pass และ sameUnitOnly → unitAccess ของ actor ต้องครอบ homeUnitId ของสมาชิก (หรือเป็น "*")
//
// 🔴 "ดูไม่ได้" ไม่ใช่ error — หน้า 360 แสดงกล่องว่างพร้อมป้าย "ซ่อน" (§6.4) และ **ไม่ส่งค่าลง client**
// 🔴 prisma มาจาก `./db` (จุดเดียวของโมดูลที่ล้วง core — ดู member/db.ts)

import type { Prisma, PrismaClient } from "@prisma/client";
import { emitOutbox } from "@/lib/core/outbox";
import { prisma } from "./db";
import { apiRoleOf, coversUnit, type MemberActor } from "./access";

type Client = PrismaClient | Prisma.TransactionClient;

export type MemberCtx = { tenantId: string; systemId: string; actorUserId: string | null };

/** เป้าหมายของนโยบาย: ทั้ง "ส่วน" (กล่องบนหน้าโปรไฟล์) หรือรายฟิลด์ */
export type SensitiveTargetType = "SECTION" | "FIELD";

export type SensitiveTarget = {
  targetType: SensitiveTargetType;
  targetId: string;
  /** สมาชิกที่กำลังจะเปิดดู — ใช้ตรวจ sameUnitOnly (สาขาหลักของสมาชิกคนนั้น) */
  customerId: string;
};

/** ผลการตัดสินแบบเต็ม — ผู้เรียกภายในโมดูล (getMember360) ใช้ต่อเพื่อรู้ว่าต้องบันทึกการดูไหม */
export type SensitiveDecision = {
  allowed: boolean;
  /** นโยบายสั่งให้บันทึกการเปิดดูไหม (ค่าปริยาย = บันทึก) */
  shouldLog: boolean;
  hrEmployeeId: string | null;
  hrPosition: string | null;
};

/** ค่าปริยายเมื่อร้านยังไม่ได้ตั้งนโยบายของเป้าหมายนี้ (D8) */
const DEFAULT_POLICY = {
  roles: ["OWNER", "MANAGER"] as string[],
  hrPositions: [] as string[],
  hrDepartments: [] as string[],
  sameUnitOnly: false,
  logAccess: true,
};

function clientOf(tx?: Client): Client {
  return tx ?? prisma;
}

/**
 * ทะเบียนพนักงาน HR ของ actor (D17)
 * 🔴 อ่าน `HrEmployee` ด้วย prisma ตรง ไม่ผ่าน facade ของโมดูล HR โดยตั้งใจ: เป็นการอ่านอย่างเดียว
 *    เพื่อรู้ "ตำแหน่ง/แผนกของบัญชีผู้ใช้นี้" ไม่มีตรรกะธุรกิจของ HR เข้ามาเกี่ยว — ถ้าเรียกผ่าน facade
 *    จะกลายเป็นเส้น import ข้ามโมดูล member→hr ถาวร (fitness F2) เพื่อคิวรีบรรทัดเดียว
 *    (วิธีเดียวกับที่ `fields.ts#lookupExists` ใช้กับปลายทางของฟิลด์ชนิด "เชื่อมรายการ")
 */
async function hrOf(ctx: MemberCtx, actor: MemberActor, db: Client) {
  if (!actor.userId) return null;
  return db.hrEmployee.findFirst({
    where: { tenantId: ctx.tenantId, linkedUserId: actor.userId },
    select: { id: true, position: true, department: true },
    orderBy: { createdAt: "asc" },
  });
}

/** ตัดสินสิทธิ์ + คืนหลักฐานประกอบ (ตำแหน่ง HR ณ เวลาที่ดู) ให้ผู้เรียกเอาไปบันทึกต่อ */
export async function evaluateSensitiveAccess(
  ctx: MemberCtx,
  actor: MemberActor,
  target: SensitiveTarget,
  tx?: Client,
): Promise<SensitiveDecision> {
  const db = clientOf(tx);
  const policyRow = await db.memberSensitivePolicy.findFirst({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      targetType: target.targetType,
      targetId: target.targetId,
    },
  });
  const policy = policyRow
    ? {
        roles: policyRow.roles as string[],
        hrPositions: policyRow.hrPositions,
        hrDepartments: policyRow.hrDepartments,
        sameUnitOnly: policyRow.sameUnitOnly,
        logAccess: policyRow.logAccess,
      }
    : DEFAULT_POLICY;
  const deny: SensitiveDecision = { allowed: false, shouldLog: false, hrEmployeeId: null, hrPosition: null };

  // (1) คีย์ API: bundle readonly/operate ไม่เห็นข้อมูลอ่อนไหวเสมอ (§6.3) — admin ตรวจต่อตามนโยบาย
  const apiRole = apiRoleOf(actor);
  if (apiRole === "READONLY" || apiRole === "OPERATE") return deny;

  // (2) ลูกค้าดูของตัวเอง = เห็นเสมอ (เป็นข้อมูลของเขาเอง — §6.2 คอลัมน์ CUSTOMER)
  if (actor.role === "CUSTOMER") {
    return actor.customerId === target.customerId
      ? { allowed: true, shouldLog: false, hrEmployeeId: null, hrPosition: null }
      : deny;
  }

  // (3) เจ้าของร้านเห็นทุกอย่างของร้านตัวเอง
  const hr = await hrOf(ctx, actor, db);
  if (actor.role === "OWNER") {
    return { allowed: true, shouldLog: policy.logAccess, hrEmployeeId: hr?.id ?? null, hrPosition: hr?.position ?? null };
  }

  // (4) บทบาท ∪ ตำแหน่ง HR ∪ แผนก HR
  const pass =
    policy.roles.includes(actor.role) ||
    (!!hr?.position && policy.hrPositions.includes(hr.position)) ||
    (!!hr?.department && policy.hrDepartments.includes(hr.department));
  if (!pass) return deny;

  // (5) สาขาเดียวกันเท่านั้น (ตรวจจาก "สาขาหลัก" ของสมาชิก ไม่ใช่สาขาที่เคยมาใช้บริการ)
  if (policy.sameUnitOnly) {
    const customer = await db.customer.findFirst({
      where: { id: target.customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
      select: { homeUnitId: true },
    });
    if (!coversUnit(actor, customer?.homeUnitId ?? null)) return deny;
  }

  return { allowed: true, shouldLog: policy.logAccess, hrEmployeeId: hr?.id ?? null, hrPosition: hr?.position ?? null };
}

/** ดูข้อมูลอ่อนไหวชิ้นนี้ได้ไหม (§6.3) — ไม่บันทึกอะไร เรียกซ้ำได้ */
export async function canViewSensitive(
  ctx: MemberCtx,
  actor: MemberActor,
  target: SensitiveTarget,
  tx?: Client,
): Promise<boolean> {
  const decision = await evaluateSensitiveAccess(ctx, actor, target, tx);
  return decision.allowed;
}

export type LogAccessInput = SensitiveTarget & {
  /** หน้าที่เปิดดู (เช่น "member.360") — ช่วยตอบคำถาม "ดูจากที่ไหน" ตอนตรวจสอบย้อนหลัง */
  page?: string | null;
  /** ส่งผลการตัดสินที่คำนวณไว้แล้วเข้ามาได้ (กันยิง HrEmployee ซ้ำต่อส่วนอ่อนไหวทุกกล่อง) */
  decision?: SensitiveDecision;
};

/**
 * บันทึก "มีคนเปิดดูข้อมูลอ่อนไหว" (D17) + ยิง event `member.sensitive.viewed`
 * 🔴 เก็บตำแหน่ง HR **ณ เวลาที่ดู** ลงแถวเลย (ไม่ใช่ join สดตอนอ่านรายงาน) — คนย้ายตำแหน่งแล้ว
 *    ประวัติต้องยังบอกว่า "ตอนนั้นเขาเป็นพยาบาล" ไม่ใช่ตำแหน่งวันนี้
 */
export async function logAccess(ctx: MemberCtx, actor: MemberActor, input: LogAccessInput): Promise<void> {
  if (!actor.userId) return; // ลูกค้า/ระบบ ไม่ใช่ "พนักงานเปิดดูข้อมูลคนอื่น" จึงไม่มีอะไรต้องบันทึก
  const decision = input.decision ?? (await evaluateSensitiveAccess(ctx, actor, input));
  await prisma.$transaction(async (tx) => {
    const row = await tx.memberAccessLog.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: input.customerId,
        userId: actor.userId,
        hrEmployeeId: decision.hrEmployeeId,
        hrPosition: decision.hrPosition,
        targetType: input.targetType,
        targetId: input.targetId,
        page: input.page ?? null,
      },
    });
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "member.sensitive.viewed",
      idempotencyKey: `member.sensitive.viewed#${row.id}`,
      payload: {
        customerId: input.customerId,
        userId: actor.userId,
        target: { targetType: input.targetType, targetId: input.targetId },
        targetType: input.targetType,
        targetId: input.targetId,
        hrPosition: decision.hrPosition,
      },
      systemId: ctx.systemId,
    });
  });
}
