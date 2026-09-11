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

import type { MemberConsentSource, Prisma, PrismaClient, Role } from "@prisma/client";
import { emitOutbox } from "@/lib/core/outbox";
import { writeAudit } from "@/lib/core/audit";
import { sanitizeHtml } from "@/lib/core/sanitize";
import { consentChannels, getChannel } from "@/lib/core/channels";
import * as approval from "@/lib/modules/approval/service";
import * as party from "@/lib/modules/party";
import * as point from "@/lib/modules/point";
import { prisma } from "./db";
import { apiRoleOf, canManagePrivacy, coversUnit, hasMemberPerm, type MemberActor } from "./access";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import { getFieldValues } from "./fields";

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

// ════════════════════════ M1.7 — นโยบายเวอร์ชัน · ยินยอม · PDPA ════════════════════════
//
// ส่วนที่ต่อจาก M1.4 ตามสัญญา §5.10 (privacy) · §4.3 · §6.3 · §11.8
//   (ก) นโยบายความเป็นส่วนตัวแบบมีเวอร์ชัน — ร่าง → เผยแพร่ → ลูกค้ายอมรับ
//   (ข) ความยินยอมรายช่องทาง (D19 — key จากทะเบียนกลาง ไม่ฮาร์ดโค้ด)
//   (ค) ใครดูข้อมูลอ่อนไหวได้ (CRUD ของนโยบาย D8+D17) + บันทึกการดู
//   (ง) คำขอตาม PDPA: ขอสำเนาข้อมูล (ทำทันที) · ขอลบข้อมูล (ต้องผ่านสายอนุมัติกลางเสมอ)
//   (จ) ลบอัตโนมัติเมื่อลูกค้าไม่เคลื่อนไหวเกิน N ปี (cron รายวันสร้าง "คำขอ" ไม่ใช่ลบเอง)
//
// 🔴 "ลบ" ในระบบนี้ = **ทำให้ไม่ระบุตัวตน (anonymize)** ไม่ใช่ DELETE แถว: บิลขาย/รายการแต้ม/
//    ประวัติระดับ เป็นหลักฐานทางบัญชีที่กฎหมายบังคับให้เก็บ — ลบทิ้งคือทำบัญชีพัง
//    ⇒ ตัดข้อมูลที่ระบุตัวบุคคลออกให้หมด แต่คงตัวเลขและร่องรอยธุรกรรมไว้ (§11.8)
// 🔴 ทุกทางที่แตะข้อมูลอ่อนไหว/ส่งออก/ลบ ต้องเขียน AuditLog เสมอ (§6.4)

/** ที่มาของความยินยอม (enum เดียวกับ `MemberConsentSource` ของ Prisma) */
const CONSENT_SOURCES: readonly string[] = ["SIGNUP_FORM", "LIFF", "STAFF", "IMPORT", "API", "CUSTOMER_SELF"];

/** ที่มาที่แปลว่า "ลูกค้าเป็นคนกดเอง" — ใช้ตัดสินว่า actor CUSTOMER บันทึกที่มานี้ได้ไหม (M2.9) */
const CUSTOMER_SELF_SOURCES = new Set<string>(["CUSTOMER_SELF", "LIFF"]);

/** ช่องทางที่ `Customer.marketingConsent` (คอลัมน์เดิมของ v1) เป็นตัวแทนอยู่ — §4.5 */
const LEGACY_CONSENT_CHANNELS: readonly string[] = ["LINE", "EMAIL", "SMS"];

const ROLE_KEYS: readonly string[] = ["OWNER", "MANAGER", "STAFF"];

export type PolicyVersionDto = {
  version: number;
  bodyHtml: string;
  /** null = ร่าง (ยังไม่บังคับใช้) */
  effectiveAt: Date | null;
  isCurrent: boolean;
};

export type ConsentDto = {
  channel: string;
  label: string;
  /** null = ยังไม่เคยตั้งค่าช่องทางนี้ (ต่างจาก false = ปฏิเสธไว้แล้ว) */
  granted: boolean | null;
  source: string | null;
  policyVersion: number | null;
  grantedAt: Date | null;
  revokedAt: Date | null;
  byUserId: string | null;
};

export type SensitivePolicyDto = {
  id: string;
  targetType: string;
  targetId: string;
  /** ป้ายไทยของส่วน/ฟิลด์ที่นโยบายนี้คุม (ถูกลบไปแล้ว = บอกตรง ๆ ไม่โชว์ id ดิบ) */
  targetLabel: string;
  roles: string[];
  hrPositions: string[];
  hrDepartments: string[];
  sameUnitOnly: boolean;
  logAccess: boolean;
};

export type SetSensitivePolicyInput = {
  targetType: string;
  targetId: string;
  roles: string[];
  hrPositions?: string[];
  hrDepartments?: string[];
  sameUnitOnly?: boolean;
  logAccess?: boolean;
};

export type HrPositionsSummary = {
  positions: string[];
  departments: string[];
  /** พนักงานที่ยังไม่ผูกบัญชีผู้ใช้ = ตั้งสิทธิ์ตามตำแหน่งให้เขาไม่ได้ (หน้าตั้งค่าต้องเตือน) */
  unlinkedCount: number;
  unlinked: { id: string; name: string }[];
};

export type AccessLogDto = {
  id: string;
  at: Date;
  userId: string;
  userName: string;
  hrPosition: string | null;
  targetType: string;
  targetId: string;
  targetLabel: string;
  page: string | null;
  customerId: string;
  customerName: string;
};

export type AccessLogFilter = {
  customerId?: string | null;
  userId?: string | null;
  from?: Date | string | null;
  to?: Date | string | null;
  take?: number;
};

export type PrivacyRequestDto = {
  id: string;
  customerId: string;
  customerName: string;
  type: string;
  status: string;
  requestedVia: string;
  approvalRequestId: string | null;
  doneAt: Date | null;
  createdAt: Date;
};

// ───────────────────────── ตัวช่วยเล็ก ๆ ของไฟล์นี้ ─────────────────────────

function toDateOrNull(v: Date | string | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw new MemberInputError("รูปแบบวันที่ไม่ถูกต้อง — เลือกวันจากปฏิทินอีกครั้ง");
  return d;
}

function requirePrivacy(actor: MemberActor, what: string): void {
  if (!canManagePrivacy(actor)) {
    throw new MemberForbiddenError(`บัญชีของคุณยังไม่ได้รับสิทธิ์${what} — ขอสิทธิ์ "จัดการความเป็นส่วนตัว/PDPA" จากเจ้าของร้านก่อน`);
  }
}

function assertConsentSource(raw: string): MemberConsentSource {
  if (!CONSENT_SOURCES.includes(raw)) {
    throw new MemberInputError(`ไม่รู้จักที่มาของความยินยอม "${raw}" — ใช้ได้เฉพาะ ${CONSENT_SOURCES.join(" · ")}`);
  }
  return raw as MemberConsentSource;
}

/** สมาชิกคนนี้อยู่ในระบบสมาชิกที่เปิดอยู่จริงไหม (404-not-403 · §6.4) */
async function loadMemberRow(ctx: MemberCtx, customerId: string, tx?: Client) {
  const row = await clientOf(tx).customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId },
  });
  if (!row) throw new MemberNotFoundError();
  return row;
}

/** ป้ายไทยของเป้าหมายนโยบาย/บันทึกการดู — resolve ทีเดียวหลายแถว (ไม่ยิงต่อแถว) */
async function targetLabels(ctx: MemberCtx, targets: { targetType: string; targetId: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const sectionIds = [...new Set(targets.filter((t) => t.targetType === "SECTION").map((t) => t.targetId))];
  const fieldIds = [...new Set(targets.filter((t) => t.targetType === "FIELD").map((t) => t.targetId))];
  const [sections, fields] = await Promise.all([
    sectionIds.length
      ? prisma.memberSection.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: sectionIds } }, select: { id: true, label: true } })
      : Promise.resolve([]),
    fieldIds.length
      ? prisma.memberField.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: fieldIds } }, select: { id: true, label: true } })
      : Promise.resolve([]),
  ]);
  for (const s of sections) out.set(`SECTION:${s.id}`, s.label);
  for (const f of fields) out.set(`FIELD:${f.id}`, f.label);
  return out;
}

const FIXED_TARGET_LABELS: Record<string, string> = {
  EXPORT: "ส่งออกข้อมูลของสมาชิก",
  ERASE: "ลบข้อมูลของสมาชิก",
};

function labelOfTarget(map: Map<string, string>, targetType: string, targetId: string): string {
  return map.get(`${targetType}:${targetId}`) ?? FIXED_TARGET_LABELS[targetType] ?? "(รายการที่ถูกลบไปแล้ว)";
}

// ───────────────────────── (ก) นโยบายความเป็นส่วนตัว (เวอร์ชัน) ─────────────────────────

function pickCurrent<T extends { version: number; effectiveAt: Date | null }>(rows: T[], now: Date): T | null {
  const live = rows.filter((r) => r.effectiveAt !== null && r.effectiveAt.getTime() <= now.getTime());
  if (live.length === 0) return null;
  return live.reduce((best, r) => (r.version > best.version ? r : best));
}

/** ทุกเวอร์ชันของร้าน เรียงใหม่→เก่า (`isCurrent` = เวอร์ชันที่บังคับใช้อยู่วันนี้) */
export async function listPolicyVersions(ctx: MemberCtx): Promise<PolicyVersionDto[]> {
  const rows = await prisma.memberPrivacyPolicy.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: { version: "desc" },
  });
  const current = pickCurrent(rows, new Date());
  return rows.map((r) => ({
    version: r.version,
    bodyHtml: r.bodyHtml,
    effectiveAt: r.effectiveAt,
    isCurrent: current !== null && current.version === r.version,
  }));
}

/** เวอร์ชันที่บังคับใช้อยู่ ณ เวลา `now` (ยังไม่ถึงวันบังคับใช้ = ยังไม่ใช่ตัวปัจจุบัน) */
export async function currentPolicy(ctx: MemberCtx, now: Date = new Date()): Promise<PolicyVersionDto | null> {
  const rows = await prisma.memberPrivacyPolicy.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: { version: "desc" },
  });
  const current = pickCurrent(rows, now);
  return current ? { version: current.version, bodyHtml: current.bodyHtml, effectiveAt: current.effectiveAt, isCurrent: true } : null;
}

/**
 * ออกเวอร์ชันใหม่ (เลขเวอร์ชัน = สูงสุดเดิม + 1)
 * `effectiveAt` ไม่ส่ง = **ร่าง** (เขียนไว้ก่อน ยังไม่บังคับใช้) · ส่งวันอนาคตได้ (ตั้งล่วงหน้า)
 * 🔴 เนื้อความผ่าน `sanitizeHtml` เสมอ — ข้อความนี้ถูกเรนเดอร์ให้ลูกค้าอ่านบนหน้า LIFF/เว็บ
 */
export async function createPolicyVersion(
  ctx: MemberCtx,
  actor: MemberActor,
  input: { bodyHtml: string; effectiveAt?: Date | string | null },
): Promise<PolicyVersionDto> {
  requirePrivacy(actor, "แก้ไขนโยบายความเป็นส่วนตัว");
  const bodyHtml = sanitizeHtml(input.bodyHtml);
  if (!bodyHtml) throw new MemberInputError("ยังไม่มีเนื้อความของนโยบาย — พิมพ์ข้อความก่อนบันทึก");
  const effectiveAt = toDateOrNull(input.effectiveAt);

  // เลขเวอร์ชันชนกันได้ถ้ามีคนกดพร้อมกัน (unique systemId+version) → ลองใหม่สั้น ๆ แทนที่จะให้ผู้ใช้เจอ error
  let created: { version: number } | null = null;
  for (let attempt = 0; attempt < 3 && created === null; attempt++) {
    const max = await prisma.memberPrivacyPolicy.aggregate({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
      _max: { version: true },
    });
    const version = (max._max.version ?? 0) + 1;
    try {
      created = await prisma.memberPrivacyPolicy.create({
        data: { tenantId: ctx.tenantId, systemId: ctx.systemId, version, bodyHtml, effectiveAt },
        select: { version: true },
      });
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  const version = created?.version ?? 0;
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? actor.userId ?? null,
    action: "member.privacy.policy.create",
    targetType: "MemberPrivacyPolicy",
    targetId: `${ctx.systemId}:${version}`,
    after: { version, effectiveAt },
  });
  const current = await currentPolicy(ctx);
  return { version, bodyHtml, effectiveAt, isCurrent: current !== null && current.version === version };
}

/** เผยแพร่เวอร์ชันที่เป็นร่าง (หรือเลื่อนวันบังคับใช้) — ไม่ส่งวัน = เริ่มใช้เดี๋ยวนี้ */
export async function publishPolicyVersion(
  ctx: MemberCtx,
  actor: MemberActor,
  version: number,
  input: { effectiveAt?: Date | string | null } = {},
): Promise<PolicyVersionDto> {
  requirePrivacy(actor, "เผยแพร่นโยบายความเป็นส่วนตัว");
  const row = await prisma.memberPrivacyPolicy.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, version },
  });
  if (!row) throw new MemberInputError(`ไม่พบนโยบายความเป็นส่วนตัวเวอร์ชัน ${version} ในร้านนี้`);
  const effectiveAt = toDateOrNull(input.effectiveAt) ?? new Date();
  await prisma.memberPrivacyPolicy.update({ where: { id: row.id }, data: { effectiveAt } });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? actor.userId ?? null,
    action: "member.privacy.policy.publish",
    targetType: "MemberPrivacyPolicy",
    targetId: row.id,
    before: { effectiveAt: row.effectiveAt },
    after: { effectiveAt },
  });
  const current = await currentPolicy(ctx);
  return { version, bodyHtml: row.bodyHtml, effectiveAt, isCurrent: current !== null && current.version === version };
}

/**
 * ลูกค้ายอมรับนโยบายเวอร์ชันหนึ่ง (จาก LIFF/หน้าเว็บ/พนักงานกดแทนตอนสมัคร)
 * เก็บ 2 ที่: `Customer.privacyVersion` (ตอบเร็วว่ารับเวอร์ชันไหนแล้ว) + ไทม์ไลน์ (หลักฐานว่ารับเมื่อไร)
 */
export async function acceptPolicy(
  ctx: MemberCtx,
  customerId: string,
  version: number,
  via: string,
): Promise<{ version: number; acceptedAt: Date }> {
  const source = assertConsentSource(via);
  await loadMemberRow(ctx, customerId);
  const row = await prisma.memberPrivacyPolicy.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, version },
  });
  if (!row) throw new MemberInputError(`ไม่พบนโยบายความเป็นส่วนตัวเวอร์ชัน ${version} ในร้านนี้`);
  const acceptedAt = new Date();
  if (row.effectiveAt === null || row.effectiveAt.getTime() > acceptedAt.getTime()) {
    throw new MemberInputError(`นโยบายเวอร์ชัน ${version} ยังไม่ถูกเผยแพร่ — เผยแพร่ก่อนจึงให้ลูกค้ายอมรับได้`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({ where: { id: customerId }, data: { privacyVersion: version } });
    await tx.memberActivity.create({
      data: {
        tenantId: ctx.tenantId,
        customerId,
        module: "member",
        type: "POLICY_ACCEPTED",
        summary: `ยอมรับนโยบายความเป็นส่วนตัวเวอร์ชัน ${version}`,
        data: { version, via: source },
        actorUserId: ctx.actorUserId,
      },
    });
  });
  return { version, acceptedAt };
}

// ───────────────────────── (ข) ความยินยอมรายช่องทาง (D19) ─────────────────────────

/** ทุกช่องทางที่ขอความยินยอมได้ พร้อมสถานะของสมาชิกคนนี้ (ยังไม่เคยตั้ง = `granted: null`) */
export async function getConsents(ctx: MemberCtx, customerId: string): Promise<ConsentDto[]> {
  await loadMemberRow(ctx, customerId);
  const rows = await prisma.memberConsent.findMany({ where: { tenantId: ctx.tenantId, customerId } });
  const byChannel = new Map(rows.map((r) => [r.channel, r]));
  return consentChannels().map((def) => {
    const row = byChannel.get(def.key);
    return {
      channel: def.key,
      label: def.label,
      granted: row ? row.granted : null,
      source: row?.source ?? null,
      policyVersion: row?.policyVersion ?? null,
      grantedAt: row?.grantedAt ?? null,
      revokedAt: row?.revokedAt ?? null,
      byUserId: row?.byUserId ?? null,
    };
  });
}

/**
 * ตั้ง/ถอนความยินยอมของช่องทางหนึ่ง (upsert — 1 แถวต่อ (สมาชิก, ช่องทาง))
 * · ลูกค้าเอง (role CUSTOMER) แก้ได้เฉพาะของตัวเอง และต้องบันทึกที่มาเป็น `CUSTOMER_SELF`
 * · พนักงานต้องมีสิทธิ์แก้ข้อมูลสมาชิก
 * · sync คอลัมน์เดิม `Customer.marketingConsent` = ยินยอมช่องใดช่องหนึ่งใน LINE/EMAIL/SMS (§4.5)
 */
export async function setConsent(
  ctx: MemberCtx,
  actor: MemberActor,
  customerId: string,
  input: { channel: string; granted: boolean; source: string; policyVersion?: number | null },
): Promise<ConsentDto> {
  const def = getChannel(input.channel);
  if (!def) {
    throw new MemberInputError(`ไม่รู้จักช่องทาง "${input.channel}" — เพิ่มช่องทางใหม่ได้ที่ทะเบียนช่องทางกลางของระบบ`);
  }
  if (!def.canConsent) {
    throw new MemberInputError(`ช่องทาง "${def.label}" ยังขอความยินยอมไม่ได้ — ใช้ได้เฉพาะช่องทางที่ส่งข่าวสารถึงลูกค้าโดยตรง`);
  }
  const source = assertConsentSource(input.source);

  if (actor.role === "CUSTOMER") {
    if (!actor.customerId || actor.customerId !== customerId) {
      throw new MemberForbiddenError("แก้ความยินยอมได้เฉพาะของบัญชีตัวเองเท่านั้น");
    }
    // M2.9 — ที่มาที่ยอมรับได้เมื่อ "ลูกค้าเป็นคนกดเอง" มี 2 ค่า: กดจากหน้าลูกค้า `/m/*` (LIFF/ในแอป)
    // หรือกดจากฟอร์มอื่นของตัวเอง (CUSTOMER_SELF) — ที่มาของพนักงาน/นำเข้า/API ห้ามเด็ดขาด
    if (!CUSTOMER_SELF_SOURCES.has(source)) {
      throw new MemberInputError('ลูกค้าที่ตั้งค่าเองต้องบันทึกที่มาเป็น "ลูกค้าตั้งเอง" หรือหน้าสมาชิกเท่านั้น');
    }
  } else if (!hasMemberPerm(actor, "member.customer.update")) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์แก้ความยินยอมของสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }

  const customer = await loadMemberRow(ctx, customerId);
  const byUserId = actor.role === "CUSTOMER" ? null : ctx.actorUserId ?? (actor.userId || null);
  const granted = input.granted === true;
  const now = new Date();
  const policyVersion = input.policyVersion ?? null;

  const saved = await prisma.$transaction(async (tx) => {
    const row = await tx.memberConsent.upsert({
      where: { customerId_channel: { customerId, channel: def.key } },
      create: {
        tenantId: ctx.tenantId,
        customerId,
        channel: def.key,
        granted,
        source,
        policyVersion,
        grantedAt: granted ? now : null,
        revokedAt: granted ? null : now,
        byUserId,
      },
      update: {
        granted,
        source,
        // ไม่ส่งเวอร์ชันมา = ไม่ทับของเดิม (ความยินยอมเดิมผูกกับนโยบายเวอร์ชันไหนต้องไม่หายไป)
        ...(policyVersion === null ? {} : { policyVersion }),
        grantedAt: granted ? now : null,
        revokedAt: granted ? null : now,
        byUserId,
      },
    });

    // sync คอลัมน์เดิมของ v1 ให้โค้ดการตลาด/แคมเปญรุ่นเก่าอ่านต่อได้ (§4.5)
    const legacyGranted = await tx.memberConsent.count({
      where: { customerId, channel: { in: [...LEGACY_CONSENT_CHANNELS] }, granted: true },
    });
    const marketingConsent = legacyGranted > 0;
    if (customer.marketingConsent !== marketingConsent) {
      await tx.customer.update({
        where: { id: customerId },
        data: { marketingConsent, consentAt: marketingConsent ? now : customer.consentAt },
      });
    }

    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "member.consent.changed",
      idempotencyKey: `member.consent.changed#${row.id}#${now.getTime()}`,
      payload: { customerId, channel: def.key, granted, source, policyVersion: row.policyVersion },
      systemId: ctx.systemId,
      unitId: customer.homeUnitId,
    });
    return row;
  });

  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: byUserId,
    action: "member.privacy.consent",
    targetType: "Customer",
    targetId: customerId,
    after: { channel: def.key, granted, source },
  });

  return {
    channel: saved.channel,
    label: def.label,
    granted: saved.granted,
    source: saved.source,
    policyVersion: saved.policyVersion,
    grantedAt: saved.grantedAt,
    revokedAt: saved.revokedAt,
    byUserId: saved.byUserId,
  };
}

// ───────────────────────── (ค) ใครดูข้อมูลอ่อนไหวได้ (D8 + D17) ─────────────────────────

/** นโยบายทั้งหมดของร้าน พร้อมป้ายไทยของส่วน/ฟิลด์ที่คุมอยู่ */
export async function listSensitivePolicies(ctx: MemberCtx): Promise<SensitivePolicyDto[]> {
  const rows = await prisma.memberSensitivePolicy.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    orderBy: { createdAt: "asc" },
  });
  const labels = await targetLabels(ctx, rows);
  return rows.map((r) => ({
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    targetLabel: labelOfTarget(labels, r.targetType, r.targetId),
    roles: r.roles as string[],
    hrPositions: r.hrPositions,
    hrDepartments: r.hrDepartments,
    sameUnitOnly: r.sameUnitOnly,
    logAccess: r.logAccess,
  }));
}

/**
 * ตั้งนโยบายของส่วน/ฟิลด์หนึ่ง (upsert — 1 แถวต่อเป้าหมาย)
 * 🔴 เป็นการ "ตั้งค่าใหม่ทั้งแถว": ไม่ส่ง `hrPositions`/`hrDepartments` = ล้างเป็นว่าง
 *    (ฟอร์มบนจอส่งค่าทุกช่องเสมอ — ถ้าปล่อยให้ค่าเก่าค้าง คนกดลบชิปแล้วสิทธิ์จะไม่หายจริง)
 */
export async function setSensitivePolicy(
  ctx: MemberCtx,
  actor: MemberActor,
  input: SetSensitivePolicyInput,
): Promise<SensitivePolicyDto> {
  requirePrivacy(actor, "ตั้งค่าผู้มีสิทธิ์ดูข้อมูลอ่อนไหว");
  const targetType = input.targetType === "FIELD" ? "FIELD" : input.targetType === "SECTION" ? "SECTION" : null;
  if (targetType === null) throw new MemberInputError('เป้าหมายของนโยบายต้องเป็น "ส่วน" หรือ "ฟิลด์" เท่านั้น');

  const exists =
    targetType === "SECTION"
      ? await prisma.memberSection.findFirst({ where: { id: input.targetId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, label: true } })
      : await prisma.memberField.findFirst({ where: { id: input.targetId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, label: true } });
  if (!exists) throw new MemberInputError("ไม่พบส่วน/ฟิลด์ที่จะตั้งนโยบาย — รีเฟรชหน้าแล้วลองใหม่");

  const roles = [...new Set(input.roles ?? [])];
  for (const r of roles) {
    if (!ROLE_KEYS.includes(r)) throw new MemberInputError(`ไม่รู้จักบทบาท "${r}" — เลือกได้เฉพาะเจ้าของร้าน ผู้จัดการ หรือพนักงาน`);
  }
  const hrPositions = [...new Set((input.hrPositions ?? []).map((v) => v.trim()).filter(Boolean))];
  const hrDepartments = [...new Set((input.hrDepartments ?? []).map((v) => v.trim()).filter(Boolean))];
  const sameUnitOnly = input.sameUnitOnly === true;
  const logAccess = input.logAccess !== false;

  const data = { roles: roles as Role[], hrPositions, hrDepartments, sameUnitOnly, logAccess };
  const row = await prisma.memberSensitivePolicy.upsert({
    where: { systemId_targetType_targetId: { systemId: ctx.systemId, targetType, targetId: input.targetId } },
    create: { tenantId: ctx.tenantId, systemId: ctx.systemId, targetType, targetId: input.targetId, ...data },
    update: data,
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? actor.userId ?? null,
    action: "member.privacy.sensitive.set",
    targetType: "MemberSensitivePolicy",
    targetId: row.id,
    after: { target: `${targetType}:${input.targetId}`, ...data },
  });
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    targetLabel: exists.label,
    roles: row.roles as string[],
    hrPositions: row.hrPositions,
    hrDepartments: row.hrDepartments,
    sameUnitOnly: row.sameUnitOnly,
    logAccess: row.logAccess,
  };
}

/** ลบนโยบายของเป้าหมายหนึ่ง → กลับไปใช้ค่าปริยาย (เจ้าของร้าน + ผู้จัดการ) */
export async function deleteSensitivePolicy(ctx: MemberCtx, actor: MemberActor, id: string): Promise<{ ok: true }> {
  requirePrivacy(actor, "ตั้งค่าผู้มีสิทธิ์ดูข้อมูลอ่อนไหว");
  const row = await prisma.memberSensitivePolicy.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  if (!row) throw new MemberNotFoundError("ไม่พบนโยบายนี้แล้ว — อาจถูกลบไปก่อนหน้านี้");
  await prisma.memberSensitivePolicy.delete({ where: { id: row.id } });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? actor.userId ?? null,
    action: "member.privacy.sensitive.delete",
    targetType: "MemberSensitivePolicy",
    targetId: row.id,
    before: { target: `${row.targetType}:${row.targetId}`, roles: row.roles, hrPositions: row.hrPositions },
  });
  return { ok: true };
}

/**
 * ตำแหน่ง/แผนกที่มีอยู่จริงในทะเบียนพนักงาน (D17) + คนที่ยังไม่ผูกบัญชีผู้ใช้
 * 🔴 อ่าน `HrEmployee` ตรงด้วยเหตุผลเดียวกับ `hrOf()` ข้างบน (อ่านอย่างเดียว ไม่มีตรรกะของ HR)
 * 🔴 คนที่ยังไม่ผูกบัญชี = ตั้งสิทธิ์ตามตำแหน่งให้เขาไม่มีผล — หน้าตั้งค่าต้องเตือนให้เห็น ไม่ใช่เงียบ
 */
export async function hrPositionsSummary(ctx: MemberCtx): Promise<HrPositionsSummary> {
  const rows = await prisma.hrEmployee.findMany({
    where: { tenantId: ctx.tenantId, active: true },
    select: { id: true, name: true, position: true, department: true, linkedUserId: true },
    orderBy: { name: "asc" },
  });
  const positions = [...new Set(rows.map((r) => r.position?.trim()).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "th"));
  const departments = [...new Set(rows.map((r) => r.department?.trim()).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "th"));
  const unlinked = rows.filter((r) => !r.linkedUserId).map((r) => ({ id: r.id, name: r.name }));
  return { positions, departments, unlinkedCount: unlinked.length, unlinked };
}

// ───────────────────────── บันทึกการเข้าถึงข้อมูลอ่อนไหว ─────────────────────────

/** บันทึกการดู เรียงใหม่→เก่า (กรองตามสมาชิก/ผู้ดู/ช่วงเวลาได้) */
export async function listAccessLog(ctx: MemberCtx, actor: MemberActor, filter: AccessLogFilter = {}): Promise<AccessLogDto[]> {
  requirePrivacy(actor, "ดูบันทึกการเข้าถึงข้อมูลอ่อนไหว");
  const from = toDateOrNull(filter.from);
  const to = toDateOrNull(filter.to);
  const take = Math.min(Math.max(filter.take ?? 20, 1), 200);
  const rows = await prisma.memberAccessLog.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });
  if (rows.length === 0) return [];

  const [users, customers, labels] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true, email: true } }),
    prisma.customer.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.customerId))] } }, select: { id: true, name: true } }),
    targetLabels(ctx, rows),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name ?? u.email ?? "(ผู้ใช้ที่ถูกลบ)"]));
  const custName = new Map(customers.map((c) => [c.id, c.name ?? "(ไม่มีชื่อ)"]));

  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt,
    userId: r.userId,
    userName: userName.get(r.userId) ?? "(ผู้ใช้ที่ถูกลบ)",
    hrPosition: r.hrPosition,
    targetType: r.targetType,
    targetId: r.targetId,
    targetLabel: labelOfTarget(labels, r.targetType, r.targetId),
    page: r.page,
    customerId: r.customerId,
    customerName: custName.get(r.customerId) ?? "(สมาชิกที่ถูกลบ)",
  }));
}

// ───────────────────────── (ง) คำขอตาม PDPA — สำเนาข้อมูล ─────────────────────────

/** ชื่อที่ใช้แทนคนที่ถูกลบข้อมูลแล้ว (ต้องคงที่ — หน้าอื่น/รายงานเทียบกับค่านี้) */
export const ERASED_NAME = "ลูกค้าที่ถูกลบ";

export type ExportBundle = {
  exportedAt: Date;
  profile: Record<string, unknown> & { fields: Record<string, unknown> };
  addresses: unknown[];
  consents: ConsentDto[];
  identities: unknown[];
  attribution: { first: unknown | null; last: unknown | null };
  tierHistory: unknown[];
  activities: unknown[];
  points: { balance: number; ledger: unknown[] };
  sales: unknown[];
  appointments: unknown[];
  chat: { contacts: unknown[]; conversations: number };
  account: { documents: unknown[] };
  kanban: { cards: unknown[] };
};

/** รูปแบบเบอร์ที่โมดูลอื่นอาจเก็บไว้ (0… / +66… / 66…) — ใช้จับ "ห้องแชทของคนนี้" (เหมือน profile.ts) */
function phoneKeys(phone: string | null | undefined): string[] {
  const raw = (phone ?? "").trim();
  if (!raw) return [];
  const norm = party.normalizePartyPhone(raw);
  const out = new Set<string>([raw]);
  if (norm) {
    out.add(norm);
    if (norm.startsWith("0")) {
      out.add(`+66${norm.slice(1)}`);
      out.add(`66${norm.slice(1)}`);
    }
  }
  return [...out];
}

/**
 * สำเนาข้อมูลทั้งหมดของสมาชิก 1 คน (สิทธิ์ "ขอเข้าถึง/ขอสำเนา" ตาม PDPA · §11.8)
 *
 * 🔴 ตัวนี้เป็นฟังก์ชันภายใน: **ไม่ตรวจสิทธิ์เอง** — ผู้เรียก (`requestExport` หรือ REST) ตรวจมาก่อนแล้ว
 * 🔴 ข้อมูลของโมดูลอื่นอ่านด้วย prisma ตรง พร้อมเหตุผล (แบบเดียวกับ `profile.connectionsOf` ของ M1.4):
 *    เป็นการ **อ่านอย่างเดียว เฉพาะแถวของบุคคลนี้** ไม่มีตรรกะธุรกิจของโมดูลปลายทางเข้ามาเกี่ยว
 *    และ facade ของโมดูลเหล่านั้นกรองตาม "สิทธิ์ของผู้ดู" ซึ่งผิดเจตนาของสำเนา PDPA
 *    (สำเนาต้องครบทุกแถวที่เป็นของ **เจ้าของข้อมูล** ไม่ใช่เท่าที่พนักงานคนที่กดปุ่มมีสิทธิ์เห็น)
 *    ⇒ แต้มยังผ่าน facade `point/index.ts` เพราะต้อง resolve "ระบบแต้มไหนผูกกับระบบสมาชิกนี้" ซึ่งเป็น
 *      ตรรกะของโมดูลแต้มเอง · ตัวตนกลางผ่าน `party/index.ts`
 * 🔴 `spent12mSatang` เป็น BigInt → แปลงเป็น number ก่อนเสมอ (ไม่งั้น `JSON.stringify` โยน error
 *    ตอนเขียนไฟล์ส่งให้ลูกค้า — พังตอนส่งมอบจริงเท่านั้น จับไม่ได้ตอนเขียนโค้ด)
 */
export async function exportBundle(ctx: MemberCtx, customerId: string): Promise<ExportBundle> {
  const c = await loadMemberRow(ctx, customerId);
  const partyId = c.partyId;
  const phones = phoneKeys(c.phone);

  const [values, addresses, identities, attributions, tierHistory, activities, sales, appointments, consents] = await Promise.all([
    getFieldValues(ctx, [customerId]),
    prisma.memberAddress.findMany({ where: { tenantId: ctx.tenantId, customerId }, orderBy: { createdAt: "asc" } }),
    prisma.memberChannelIdentity.findMany({ where: { tenantId: ctx.tenantId, customerId }, orderBy: { linkedAt: "asc" } }),
    prisma.memberAttribution.findMany({ where: { tenantId: ctx.tenantId, customerId } }),
    prisma.memberTierHistory.findMany({ where: { tenantId: ctx.tenantId, customerId }, orderBy: { createdAt: "asc" } }),
    prisma.memberActivity.findMany({ where: { tenantId: ctx.tenantId, customerId }, orderBy: { createdAt: "desc" }, take: 1000 }),
    prisma.posSale.findMany({ where: { tenantId: ctx.tenantId, memberId: customerId }, orderBy: { createdAt: "desc" }, take: 1000 }),
    prisma.appointment.findMany({ where: { tenantId: ctx.tenantId, customerId }, orderBy: { startAt: "desc" }, take: 1000 }),
    getConsents(ctx, customerId),
  ]);

  const chatWhere: Prisma.ChatContactWhereInput[] = [{ customerId }];
  if (partyId) chatWhere.push({ partyId });
  if (phones.length) chatWhere.push({ phone: { in: phones } });
  const chatContacts = await prisma.chatContact.findMany({ where: { tenantId: ctx.tenantId, OR: chatWhere } });
  const conversations = chatContacts.length
    ? await prisma.chatConversation.count({ where: { tenantId: ctx.tenantId, contactId: { in: chatContacts.map((x) => x.id) } } })
    : 0;

  const accountDocs = partyId
    ? await prisma.accountDocument.findMany({
        where: { tenantId: ctx.tenantId, contact: { partyId } },
        orderBy: { issueDate: "desc" },
        take: 500,
        select: { id: true, docNo: true, docType: true, status: true, issueDate: true, grandTotal: true, paidTotal: true },
      })
    : [];

  const kanbanLinks = partyId
    ? await prisma.kanbanCardLink.findMany({
        where: { tenantId: ctx.tenantId, linkType: "PARTY", linkId: partyId, removedAt: null },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { card: { select: { id: true, cardNo: true, title: true, status: true, board: { select: { name: true } } } } },
      })
    : [];

  const [balance, ledger, partyProfile] = await Promise.all([
    point.getCustomerPoints(ctx.tenantId, ctx.systemId, customerId),
    point.listCustomerLedger(ctx.tenantId, ctx.systemId, customerId),
    partyId ? party.getProfile(ctx.tenantId, partyId) : Promise.resolve(null),
  ]);

  const attributionOf = (touch: string) => attributions.find((a) => a.touch === touch) ?? null;

  return {
    exportedAt: new Date(),
    profile: {
      id: c.id,
      memberCode: c.memberCode,
      name: c.name,
      firstName: c.firstName,
      lastName: c.lastName,
      nickname: c.nickname,
      titleTh: c.titleTh,
      phone: c.phone,
      phone2: c.phone2,
      email: c.email,
      lineUserId: c.lineUserId,
      facebook: c.facebook,
      birthDate: c.birthDate,
      gender: c.gender,
      nationality: c.nationality,
      locale: c.locale,
      preferredChannel: c.preferredChannel,
      status: c.status,
      tags: c.tags,
      note: c.note,
      source: c.source,
      sourceChannel: c.sourceChannel,
      sourceDetail: c.sourceDetail,
      homeUnitId: c.homeUnitId,
      ownerUserId: c.ownerUserId,
      referralCode: c.referralCode,
      referredById: c.referredById,
      privacyVersion: c.privacyVersion,
      marketingConsent: c.marketingConsent,
      totalSpentSatang: c.totalSpentSatang,
      spent12mSatang: Number(c.spent12mSatang),
      visitCount: c.visitCount,
      visits12m: c.visits12m,
      lastActivityAt: c.lastActivityAt,
      createdAt: c.createdAt,
      party: partyProfile,
      // ค่าฟิลด์กำหนดเองทั้งหมด **รวมฟิลด์อ่อนไหว** — สำเนาของเจ้าของข้อมูลต้องครบ (§11.8)
      fields: values[customerId] ?? {},
    },
    addresses,
    consents,
    identities,
    attribution: { first: attributionOf("FIRST"), last: attributionOf("LAST") },
    tierHistory,
    activities,
    points: { balance, ledger },
    sales: sales.map((s) => ({
      id: s.id,
      receiptNo: s.receiptNo,
      status: s.status,
      unitId: s.unitId,
      grandTotalSatang: s.grandTotalSatang,
      pointEarned: s.pointEarned,
      paidAt: s.paidAt,
      createdAt: s.createdAt,
    })),
    appointments: appointments.map((a) => ({
      id: a.id,
      unitId: a.unitId,
      startAt: a.startAt,
      endAt: a.endAt,
      status: a.status,
      note: a.note,
      priceSatang: a.priceSatang,
    })),
    chat: {
      contacts: chatContacts.map((x) => ({
        id: x.id,
        channel: x.channel,
        displayName: x.displayName,
        phone: x.phone,
        email: x.email,
        lastSeenAt: x.lastSeenAt,
      })),
      conversations,
    },
    account: { documents: accountDocs },
    kanban: {
      cards: kanbanLinks.map((l) => ({
        id: l.card.id,
        cardNo: l.card.cardNo,
        title: l.card.title,
        status: l.card.status,
        boardName: l.card.board.name,
      })),
    },
  };
}

/** ผู้ขอเป็นเจ้าของข้อมูลเองหรือเปล่า (ลูกค้าที่ล็อกอินหน้า `/m/*`) */
function isSelf(actor: MemberActor, customerId: string): boolean {
  return actor.role === "CUSTOMER" && !!actor.customerId && actor.customerId === customerId;
}

/**
 * คำขอ "ขอสำเนาข้อมูลของฉัน" — ทำให้เสร็จทันที (ไม่ต้องอนุมัติ)
 * เก็บร่องรอย 3 ที่: คำขอ (`MemberPrivacyRequest`) · บันทึกการดู (`MemberAccessLog`) · `AuditLog`
 */
export async function requestExport(
  ctx: MemberCtx,
  actor: MemberActor,
  customerId: string,
  via: string,
): Promise<{ requestId: string; bundle: ExportBundle }> {
  const source = assertConsentSource(via);
  if (!isSelf(actor, customerId)) requirePrivacy(actor, "ส่งออกข้อมูลของสมาชิก");
  await loadMemberRow(ctx, customerId);

  const bundle = await exportBundle(ctx, customerId);
  const request = await prisma.memberPrivacyRequest.create({
    data: { tenantId: ctx.tenantId, customerId, type: "EXPORT", status: "DONE", requestedVia: source, doneAt: new Date() },
    select: { id: true },
  });

  // พนักงานเป็นคนกด = "มีคนเปิดดูข้อมูลของลูกค้าทั้งก้อน" ต้องอยู่ในบันทึกการดูเหมือนเปิดส่วนอ่อนไหว
  // (ลูกค้าขอของตัวเองไม่ต้องบันทึก — ไม่ใช่ "พนักงานเปิดดูข้อมูลคนอื่น" · กติกาเดียวกับ logAccess)
  if (actor.userId) {
    const hr = await hrOf(ctx, actor, prisma);
    await prisma.memberAccessLog.create({
      data: {
        tenantId: ctx.tenantId,
        customerId,
        userId: actor.userId,
        hrEmployeeId: hr?.id ?? null,
        hrPosition: hr?.position ?? null,
        targetType: "EXPORT",
        targetId: request.id,
        page: "member.privacy",
      },
    });
  }
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? (actor.userId || null),
    action: "member.privacy.export",
    targetType: "Customer",
    targetId: customerId,
    after: { requestId: request.id, via: source },
  });
  return { requestId: request.id, bundle };
}

// ───────────────────────── (ง) คำขอตาม PDPA — ลบข้อมูล ─────────────────────────

/**
 * คำขอ "ลบข้อมูลของฉัน" — **ต้องผ่านสายอนุมัติกลางเสมอ** (§11.8 · D8)
 * ไม่มีนโยบายอนุมัติในร้าน = `autoApproved` ⇒ ลบทันที (เจ้าของร้านตั้งนโยบายเองได้ที่หน้าอนุมัติ)
 * ขอซ้ำระหว่างที่คำขอเดิมยังค้าง = คืนคำขอเดิม (ไม่สร้างซ้อน · ปุ่มกดรัวไม่พัง)
 */
export async function requestErase(
  ctx: MemberCtx,
  actor: MemberActor,
  customerId: string,
  input: string | { via: string; reason?: string | null },
): Promise<{ requestId: string; approvalRequestId?: string; status: string }> {
  // M2.9 — หน้าลูกค้าส่ง `{ reason, via }` มา (มีเหตุผลให้ร้านอ่านก่อนอนุมัติ) · ผู้เรียกเดิมส่ง `via` เป็นข้อความ
  const via = typeof input === "string" ? input : input?.via;
  const reason = typeof input === "string" ? null : (input?.reason ?? null);
  const source = assertConsentSource(via);
  const self = isSelf(actor, customerId);
  if (!self && !hasMemberPerm(actor, "member.customer.delete")) {
    throw new MemberForbiddenError('บัญชีของคุณยังไม่ได้รับสิทธิ์ลบข้อมูลสมาชิก — ขอสิทธิ์ "ลบข้อมูลสมาชิกถาวร (คำขอ PDPA)" จากเจ้าของร้านก่อน');
  }
  const customer = await loadMemberRow(ctx, customerId);
  // 🔴 คำขอที่ **ลูกค้ากดเอง** = ชนิด ERASE และ **ไม่ลบทันทีเด็ดขาด** แม้ร้านยังไม่ตั้งนโยบายอนุมัติ
  //    (ปุ่มเดียวในไลน์ลบประวัติทั้งชีวิตของตัวเองโดยไม่มีใครเห็น = อุบัติเหตุที่ย้อนไม่ได้)
  //    คำขอที่ร้าน/ระบบเปิดให้ = DELETE ตามเดิม (ผ่านสายอนุมัติ · ไม่มีนโยบาย = ลบทันที)
  const type = self ? "ERASE" : "DELETE";

  const pending = await prisma.memberPrivacyRequest.findFirst({
    where: { tenantId: ctx.tenantId, customerId, type: { in: ["DELETE", "ERASE"] }, status: { in: ["PENDING", "APPROVED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (pending) return { requestId: pending.id, ...(pending.approvalRequestId ? { approvalRequestId: pending.approvalRequestId } : {}), status: pending.status };

  const request = await prisma.memberPrivacyRequest.create({
    data: { tenantId: ctx.tenantId, customerId, type, status: "PENDING", requestedVia: source },
    select: { id: true },
  });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorType: self ? "SYSTEM" : "USER",
    actorId: ctx.actorUserId ?? (actor.userId || null),
    action: "member.erase",
    targetType: "Customer",
    targetId: customerId,
    after: { requestId: request.id, via: source, step: "requested", ...(self ? { by: "customer" } : {}), ...(reason ? { reason } : {}) },
  });
  if (self) {
    // ลูกค้าขอเอง → เปิดคำขออนุมัติให้ร้านเห็นเสมอ (มีนโยบาย = เข้าสายอนุมัติ · ไม่มี = ค้าง PENDING รอร้านกด)
    const submittedSelf = await approval.submitForApproval(
      { tenantId: ctx.tenantId },
      {
        entityType: "member.erase",
        entityId: request.id,
        systemId: ctx.systemId,
        unitId: customer.homeUnitId,
        requestedById: "member.privacy.customer",
      },
    );
    if (!("autoApproved" in submittedSelf)) {
      await prisma.memberPrivacyRequest.update({ where: { id: request.id }, data: { approvalRequestId: submittedSelf.requestId } });
      return { requestId: request.id, approvalRequestId: submittedSelf.requestId, status: "PENDING" };
    }
    return { requestId: request.id, status: "PENDING" };
  }

  const submitted = await approval.submitForApproval(
    { tenantId: ctx.tenantId },
    {
      entityType: "member.erase",
      entityId: request.id,
      systemId: ctx.systemId,
      unitId: customer.homeUnitId,
      requestedById: ctx.actorUserId ?? (actor.userId || "member.privacy.auto"),
    },
  );
  if ("autoApproved" in submitted) {
    await eraseMember(ctx, customerId, { requestId: request.id });
    return { requestId: request.id, status: "DONE" };
  }
  await prisma.memberPrivacyRequest.update({ where: { id: request.id }, data: { approvalRequestId: submitted.requestId } });
  return { requestId: request.id, approvalRequestId: submitted.requestId, status: "PENDING" };
}

/**
 * ลบข้อมูลจริง = **ทำให้ไม่ระบุตัวตน** (§11.8)
 *
 * ตัดทิ้ง : ชื่อ/เบอร์/อีเมล/วันเกิด/รูป/id ช่องทาง · ค่าฟิลด์กำหนดเองทั้งหมด (รวมประวัติค่าเก่า) ·
 *          ที่อยู่ · แท็ก · โน้ต · ตัวตนกลาง (Party) ถ้าไม่มีโมดูลอื่นชี้อยู่
 * คงไว้   : บิลขาย · รายการแต้ม · ประวัติระดับ · ไทม์ไลน์ · บันทึกการดู · แถวความยินยอม (ถอนทั้งหมด)
 *          — เป็นหลักฐานทางบัญชี/การตรวจสอบที่กฎหมายบังคับให้เก็บ ลบทิ้ง = ทำบัญชีของร้านพัง
 *
 * 🔴 idempotent: เรียกซ้ำกับคนที่ถูกลบแล้ว = เงียบ (ไม่ throw · ไม่แตะอะไร) — ตัวระบายคิวยิงซ้ำได้
 */
export async function eraseMember(
  ctx: MemberCtx,
  customerId: string,
  options: { requestId?: string | null } = {},
): Promise<{ erased: boolean }> {
  const c = await prisma.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId } });
  if (!c) return { erased: false };

  const closeRequest = async () => {
    await prisma.memberPrivacyRequest.updateMany({
      where: {
        tenantId: ctx.tenantId,
        customerId,
        type: "DELETE",
        status: { in: ["PENDING", "APPROVED"] },
        ...(options.requestId ? { id: options.requestId } : {}),
      },
      data: { status: "DONE", doneAt: new Date() },
    });
  };

  if (c.name === ERASED_NAME && c.status === "CLOSED") {
    await closeRequest(); // ลบไปแล้ว แต่คำขออาจยังค้างอยู่ (เช่น drain ซ้ำหลังล้มกลางคัน)
    return { erased: false };
  }

  // ตัวตนกลาง (Party) ถูกโมดูลอื่นใช้อยู่ไหม — ถ้ามี ห้ามแตะ (เอกสารบัญชี/ผู้ติดต่อ CRM ยังต้องมีชื่อ)
  let anonymizeParty = false;
  if (c.partyId) {
    const pid = c.partyId;
    const [acc, crm, chat, hr, cards] = await Promise.all([
      prisma.accountContact.count({ where: { tenantId: ctx.tenantId, partyId: pid } }),
      prisma.crmContact.count({ where: { tenantId: ctx.tenantId, partyId: pid } }),
      prisma.chatContact.count({ where: { tenantId: ctx.tenantId, partyId: pid } }),
      prisma.hrEmployee.count({ where: { tenantId: ctx.tenantId, partyId: pid } }),
      prisma.kanbanCardLink.count({ where: { tenantId: ctx.tenantId, linkType: "PARTY", linkId: pid, removedAt: null } }),
    ]);
    anonymizeParty = acc + crm + chat + hr + cards === 0;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.memberFieldValue.deleteMany({ where: { customerId } });
    await tx.memberFieldValueHistory.deleteMany({ where: { customerId } });
    await tx.memberAddress.deleteMany({ where: { customerId } });
    await tx.memberChannelIdentity.deleteMany({ where: { customerId } });
    await tx.memberConsent.updateMany({ where: { customerId, granted: true }, data: { granted: false, revokedAt: now } });
    await tx.customer.update({
      where: { id: customerId },
      data: {
        name: ERASED_NAME,
        firstName: null,
        lastName: null,
        nickname: null,
        titleTh: null,
        phone: null,
        phone2: null,
        email: null,
        birthDate: null,
        gender: null,
        nationality: null,
        avatarFileId: null,
        lineUserId: null,
        facebook: null,
        note: null,
        tags: [],
        marketingConsent: false,
        status: "CLOSED",
      },
    });
    if (anonymizeParty && c.partyId) {
      await tx.party.updateMany({
        where: { id: c.partyId, tenantId: ctx.tenantId },
        data: { name: ERASED_NAME, phone: null, email: null },
      });
    }
    await tx.memberActivity.create({
      data: {
        tenantId: ctx.tenantId,
        customerId,
        module: "member",
        type: "PDPA_ERASED",
        summary: "ลบข้อมูลส่วนบุคคลตามคำขอ PDPA (คงเฉพาะหลักฐานทางบัญชี)",
        data: { requestId: options.requestId ?? null },
        actorUserId: ctx.actorUserId,
      },
    });
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "member.updated",
      idempotencyKey: `member.erased#${customerId}`,
      payload: { customerId, changedKeys: ["erased"], summary: "ลบข้อมูลส่วนบุคคลตามคำขอ PDPA" },
      systemId: ctx.systemId,
      unitId: c.homeUnitId,
    });
  });
  await closeRequest();
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId,
    action: "member.erase",
    targetType: "Customer",
    targetId: customerId,
    after: { requestId: options.requestId ?? null, step: "erased", partyAnonymized: anonymizeParty },
  });
  return { erased: true };
}

/**
 * ผลของการอนุมัติ/ปฏิเสธคำขอลบ — เรียกจาก `approval-effects.ts` เท่านั้น (composition root)
 * อนุมัติ → ลบจริง · ปฏิเสธ → ปิดคำขอเป็น REJECTED (ข้อมูลลูกค้าไม่ถูกแตะเลย)
 * idempotent ทั้งสองทาง (guard สถานะใน updateMany + eraseMember เงียบเมื่อลบไปแล้ว)
 */
export async function applyEraseApproved(
  ctx: MemberCtx,
  input: { requestId: string; approved: boolean },
): Promise<{ ok: boolean }> {
  const request = await prisma.memberPrivacyRequest.findFirst({
    where: { id: input.requestId, tenantId: ctx.tenantId, type: { in: ["DELETE", "ERASE"] } },
  });
  if (!request) return { ok: false };
  if (!input.approved) {
    await prisma.memberPrivacyRequest.updateMany({
      where: { id: request.id, status: { in: ["PENDING", "APPROVED"] } },
      data: { status: "REJECTED" },
    });
    return { ok: true };
  }
  await eraseMember(ctx, request.customerId, { requestId: request.id });
  return { ok: true };
}

/** คำขอ PDPA ล่าสุดของร้าน (หน้าตั้งค่าความเป็นส่วนตัว) */
export async function listPrivacyRequests(ctx: MemberCtx, actor: MemberActor, take = 20): Promise<PrivacyRequestDto[]> {
  requirePrivacy(actor, "ดูคำขอตาม PDPA");
  // 🔴 `MemberPrivacyRequest` ไม่มี relation ไปตาราง Customer (ตารางนี้ผูกด้วย id เปล่า ๆ ตาม §4.3)
  //    ⇒ ดึงตามร้านก่อน แล้วค่อยคัดเฉพาะคนที่อยู่ใน "ระบบสมาชิก" ที่เปิดอยู่ (ร้านหนึ่งมีได้หลายระบบ)
  const raw = await prisma.memberPrivacyRequest.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(take, 1), 100) * 2,
  });
  if (raw.length === 0) return [];
  const customers = await prisma.customer.findMany({
    where: { id: { in: [...new Set(raw.map((r) => r.customerId))] }, memberSystemId: ctx.systemId },
    select: { id: true, name: true },
  });
  const names = new Map(customers.map((c) => [c.id, c.name ?? "(ไม่มีชื่อ)"]));
  const rows = raw.filter((r) => names.has(r.customerId)).slice(0, Math.min(Math.max(take, 1), 100));
  return rows.map((r) => ({
    id: r.id,
    customerId: r.customerId,
    customerName: names.get(r.customerId) ?? "(สมาชิกที่ถูกลบ)",
    type: r.type,
    status: r.status,
    requestedVia: r.requestedVia,
    approvalRequestId: r.approvalRequestId,
    doneAt: r.doneAt,
    createdAt: r.createdAt,
  }));
}

// ───────────────────────── (จ) ลบอัตโนมัติเมื่อไม่เคลื่อนไหว ─────────────────────────

/** จำนวนปีที่ร้านตั้งไว้ใน `AppSystem.settings.member.privacy.autoEraseYears` (0/ไม่ตั้ง = ปิด) */
export function autoEraseYearsOf(settings: unknown): number {
  const s = settings as { member?: { privacy?: { autoEraseYears?: unknown } } } | null;
  const raw = s?.member?.privacy?.autoEraseYears;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** actor ของงานอัตโนมัติ (ไม่มีคนกด) — สิทธิ์เต็มเพราะเป็นกติกาที่เจ้าของร้านตั้งไว้เองในหน้าตั้งค่า */
const SYSTEM_ACTOR: MemberActor = { userId: "", role: "OWNER", unitAccess: ["*"], permissions: {} };

/**
 * cron รายวัน (§7.5): ร้านที่ตั้ง "ลบข้อมูลลูกค้าที่ไม่เคลื่อนไหวเกิน N ปี" → **สร้างคำขอลบ**
 * 🔴 ไม่ลบเอง: ทุกการลบต้องผ่านสายอนุมัติเหมือนที่คนกดขอ (ร้านที่ไม่ตั้งนโยบายอนุมัติ = ลบทันที
 *    ซึ่งเป็นการตัดสินใจของเจ้าของร้านเอง ไม่ใช่ของ cron)
 * 🔴 idempotent: ข้ามคนที่มีคำขอลบค้าง/เสร็จแล้ว ⇒ รันซ้ำวันเดียวกันได้คำตอบ 0
 */
export async function sweepAutoErase(ctx?: MemberCtx, now: Date = new Date()): Promise<{ created: number }> {
  const systems = await prisma.appSystem.findMany({
    where: { type: "MEMBER", active: true, ...(ctx ? { id: ctx.systemId, tenantId: ctx.tenantId } : {}) },
    select: { id: true, tenantId: true, settings: true },
  });
  let created = 0;
  for (const sys of systems) {
    const years = autoEraseYearsOf(sys.settings);
    if (years <= 0) continue;
    const cutoff = new Date(now.getTime());
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
    const sysCtx: MemberCtx = { tenantId: sys.tenantId, systemId: sys.id, actorUserId: null };
    try {
      // คนที่เคยมีคำขอลบ (ค้าง/ทำแล้ว) ต้องไม่ถูกขอซ้ำ — ตารางคำขอไม่มี relation จึงคัดเป็น 2 จังหวะ
      const already = await prisma.memberPrivacyRequest.findMany({
        where: { tenantId: sys.tenantId, type: { in: ["DELETE", "ERASE"] }, status: { in: ["PENDING", "APPROVED", "DONE"] } },
        select: { customerId: true },
      });
      const stale = await prisma.customer.findMany({
        where: {
          tenantId: sys.tenantId,
          memberSystemId: sys.id,
          status: { notIn: ["CLOSED", "MERGED"] },
          lastActivityAt: { lt: cutoff },
          ...(already.length ? { id: { notIn: [...new Set(already.map((r) => r.customerId))] } } : {}),
        },
        select: { id: true },
        take: 200,
      });
      for (const cust of stale) {
        try {
          await requestErase(sysCtx, SYSTEM_ACTOR, cust.id, "API");
          created += 1;
        } catch {
          // สมาชิกคนนี้สร้างคำขอไม่สำเร็จ → ข้ามไปคนถัดไป (รอบพรุ่งนี้ได้ใหม่)
        }
      }
    } catch {
      // ร้านนี้กวาดไม่สำเร็จ → ข้ามไปร้านถัดไป (ห้ามพา cron ทั้งรอบล้ม)
    }
  }
  return { created };
}

// ───────────────────────── ข้อมูลประกอบหน้าตั้งค่า (M1.7 · ภาพ 14) ─────────────────────────

export type ConsentStatRow = {
  channel: string;
  label: string;
  /** ประโยคที่ลูกค้าเห็นตอนถูกถาม (ยังไม่ให้ร้านแก้เอง — ใบ M3.6 จะย้ายไปเก็บใน settings) */
  askText: string;
  granted: number;
  total: number;
};

/** จำนวนคนที่ยินยอมต่อช่องทาง (การ์ด "ช่องทางความยินยอม") */
export async function consentStats(ctx: MemberCtx, actor: MemberActor): Promise<{ rows: ConsentStatRow[]; members: number }> {
  requirePrivacy(actor, "ดูสรุปความยินยอมของสมาชิก");
  const members = await prisma.customer.count({
    where: { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, status: { notIn: ["MERGED"] } },
  });
  // 🔴 `MemberConsent` ผูกด้วย customerId เปล่า ๆ (ไม่มี relation — §4.3) ⇒ นับในขอบเขต "ร้าน"
  //    ร้านที่มีระบบสมาชิกมากกว่าหนึ่งระบบจะได้ตัวเลขรวมทั้งร้าน (ตัวเลขสรุปบนการ์ด ไม่ใช่ตัวเลขคิดเงิน)
  const grouped = await prisma.memberConsent.groupBy({
    by: ["channel"],
    where: { tenantId: ctx.tenantId, granted: true },
    _count: { _all: true },
  });
  const byChannel = new Map(grouped.map((g) => [g.channel, g._count._all]));
  const rows = consentChannels().map((def) => ({
    channel: def.key,
    label: def.label,
    askText: `อนุญาตให้ร้านส่งข่าวสารและสิทธิพิเศษทาง${def.label}`,
    granted: byChannel.get(def.key) ?? 0,
    total: members,
  }));
  return { rows, members };
}

export type SensitiveMatrixRow = SensitivePolicyDto & {
  /** false = ยังไม่มีแถวนโยบาย → ใช้ค่าปริยาย (เจ้าของร้าน + ผู้จัดการ · บันทึกการดู) */
  hasPolicy: boolean;
};

/**
 * ตารางเมทริกซ์ "ใครดูข้อมูลอ่อนไหวได้" ของภาพ 14
 * ทุกส่วน/ฟิลด์ที่ตั้ง `sensitive = true` ต้องมีแถว **แม้ยังไม่เคยตั้งนโยบาย** (จะได้เห็นค่าปริยาย
 * แล้วแก้ได้เลย) + แถวของนโยบายที่ชี้ไปยังเป้าหมายที่ถูกปิด sensitive ไปแล้ว (จะได้ลบทิ้งได้)
 */
export async function sensitiveMatrix(ctx: MemberCtx, actor: MemberActor): Promise<SensitiveMatrixRow[]> {
  requirePrivacy(actor, "ตั้งค่าผู้มีสิทธิ์ดูข้อมูลอ่อนไหว");
  const [sections, fields, policies] = await Promise.all([
    prisma.memberSection.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, sensitive: true },
      select: { id: true, label: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.memberField.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, sensitive: true, archivedAt: null },
      select: { id: true, label: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    }),
    listSensitivePolicies(ctx),
  ]);
  const byTarget = new Map(policies.map((p) => [`${p.targetType}:${p.targetId}`, p]));
  const rows: SensitiveMatrixRow[] = [];
  const push = (targetType: string, targetId: string, targetLabel: string) => {
    const p = byTarget.get(`${targetType}:${targetId}`);
    byTarget.delete(`${targetType}:${targetId}`);
    rows.push(
      p
        ? { ...p, targetLabel, hasPolicy: true }
        : {
            id: "",
            targetType,
            targetId,
            targetLabel,
            roles: [...DEFAULT_POLICY.roles],
            hrPositions: [],
            hrDepartments: [],
            sameUnitOnly: false,
            logAccess: true,
            hasPolicy: false,
          },
    );
  };
  for (const s of sections) push("SECTION", s.id, s.label);
  for (const f of fields) push("FIELD", f.id, f.label);
  for (const leftover of byTarget.values()) rows.push({ ...leftover, hasPolicy: true });
  return rows;
}

/** จำนวนปีของ "ลบอัตโนมัติเมื่อไม่เคลื่อนไหว" ที่ร้านตั้งไว้ (0 = ปิด) */
export async function getAutoEraseYears(ctx: MemberCtx): Promise<number> {
  const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId }, select: { settings: true } });
  return autoEraseYearsOf(sys?.settings ?? null);
}

/**
 * ตั้ง "ลบข้อมูลลูกค้าที่ไม่เคลื่อนไหวอัตโนมัติหลัง N ปี" (0 = ปิด)
 * 🔴 อ่าน-แก้-เขียน `settings` ทั้งก้อน: เก็บคีย์อื่นของระบบไว้ครบ (settings เป็น Json ก้อนเดียว)
 */
export async function setAutoEraseYears(ctx: MemberCtx, actor: MemberActor, years: number): Promise<{ years: number }> {
  requirePrivacy(actor, "ตั้งค่าการลบข้อมูลอัตโนมัติ");
  const n = Number(years);
  if (!Number.isFinite(n) || n < 0 || n > 20) throw new MemberInputError("จำนวนปีต้องอยู่ระหว่าง 0 ถึง 20 (0 = ไม่ลบอัตโนมัติ)");
  const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId }, select: { settings: true } });
  if (!sys) throw new MemberNotFoundError("ไม่พบระบบสมาชิกนี้ในร้านนี้");
  const current = (sys.settings ?? {}) as Record<string, unknown>;
  const member = (current.member ?? {}) as Record<string, unknown>;
  const privacy = (member.privacy ?? {}) as Record<string, unknown>;
  const settings = {
    ...current,
    member: { ...member, privacy: { ...privacy, autoEraseYears: Math.floor(n) } },
  } as Prisma.InputJsonValue;
  await prisma.appSystem.update({ where: { id: ctx.systemId }, data: { settings } });
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? actor.userId ?? null,
    action: "member.privacy.auto_erase",
    targetType: "AppSystem",
    targetId: ctx.systemId,
    after: { autoEraseYears: Math.floor(n) },
  });
  return { years: Math.floor(n) };
}
