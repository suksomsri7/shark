// templates.ts — เทมเพลต CRM ตามประเภทกิจการ 16 ชุด: ทะเบียน + ตัว apply (ใบ C1.11 · พิมพ์เขียว §10 · สัญญาข้อ C ของ oracle C1.11)
//
// ข้อมูล 16 ชุดอยู่ที่ `./templates/business/*.ts` (ข้อมูลล้วน) · ไฟล์นี้คือ "ตัวทำให้เป็นแถวจริง" ของระบบ CRM หนึ่งระบบ:
//   pipeline+ขั้น (ชื่อ · ชนิด · โอกาสปิด · staleDays · requireFields ตามข้อมูลเป๊ะ) · เหตุผลที่แพ้ (ตาม key) ·
//   ฟิลด์เพิ่มของผู้ติดต่อ/บริษัท/ดีล + ส่วน "ข้อมูลตามประเภทกิจการ" ผ่าน engine ฟิลด์ตัวเดียว (C1.2a · member facade `fields`) ·
//   วัตถุกำหนดเองผ่านบริการวัตถุ (C1.2b `objects.create`) + ฟิลด์ของวัตถุผ่าน engine ตัวเดียวกัน ·
//   `settings.crm.businessTemplate = { key, appliedAt }` (jsonb_set คำสั่งเดียว — คีย์อื่นของ settings.crm อยู่ครบ) · audit `crm.template.apply`
// 🔴 กฎคะแนน/sequence ไม่มีตารางในใบนี้ (มติผู้คุมงาน C1.11 ข้อ 2) — C2.8/C2.2 อ่าน `BUSINESS_TEMPLATES[key]` ตามตัวชี้ใน settings
// 🔴 AUDIT-CLASS X3: idempotent + ยิงพร้อมกันได้ — ล็อก advisory ต่อระบบ (`pg_try_advisory_xact_lock` วนรอ ไม่ถือ connection ระหว่างรอ
//    ⇒ ไม่แย่ง pool กับบริการวัตถุที่เปิด tx ของตัวเอง) แล้ว "หาก่อนสร้าง" ทุกชิ้น (CrmPipeline ไม่มี unique บนชื่อ ⇒ ล็อกคือด่านจริง)
//    · apply ซ้ำ = ไม่มีแถวใหม่ · วัตถุที่ key มีอยู่แล้วในระบบ = เก็บแบบที่ร้านมี (ไม่ทับ ไม่ซ้ำ)
// 🔴 AUDIT-CLASS X1: ทุกแถวเขียนด้วย tenantId + systemId ของระบบ CRM ที่ resolve ใหม่ (id + tenantId + type CRM) — ไม่แตะระบบอื่น/ร้านอื่น
// 🔴 สิทธิ์ (รีวิว N-1): action ตรวจ `crm.settings.manage` + ประตู uiVersion ก่อนเรียก · ขั้น "วัตถุกำหนดเอง" ใช้ **actor จริงของผู้กด**
//    และต้องมีคีย์ `crm.object.manage` — ไม่มี = ข้ามวัตถุทั้งหมด แล้วรายงานใน `skippedObjects` + ข้อความไทย (ไม่มี OWNER จำลองให้คนที่ไม่มีคีย์)
//    · เรียกโดยไม่ส่ง actor = งานภายในของระบบ (seed/สคริปต์ QC/ตัวย้ายข้อมูล) ⇒ ใช้ผู้ออกแบบของระบบ (actorType SYSTEM ใน audit)
// 🔴 ไม่ atomic ทั้งก้อนโดยตั้งใจ: `objects.create` (C1.2b) เปิด tx ของตัวเอง ⇒ วัตถุ commit ก่อน tx ของการ apply
//    — tx นี้ล้มหลังสร้างวัตถุ = วัตถุค้างโดยไม่มีฟิลด์ของเทมเพลต · กดซ้ำปลอดภัย: วัตถุที่ป้าย+ผูกกับตรงกับเทมเพลต (= ของเทมเพลตเอง)
//    ได้เติมเฉพาะส่วน/ฟิลด์ที่ขาด ส่วนวัตถุที่ร้านสร้างเอง (ป้าย/ผูกกับต่าง) ไม่ถูกแตะ
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { crmCan } from "./access";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import * as objects from "./objects";
import { OBJECT_TEMPLATES } from "./templates/objects";
import { BUSINESS_TEMPLATE_LIST } from "./templates/business";
import type { BusinessField, BusinessObjectSection, BusinessTemplate } from "./templates/business/types";
import type { ObjectTemplateParent } from "./templates/objects";

export type * from "./templates/business/types";

/** เทมเพลตกิจการ 16 ชุด (ลำดับ = แถวของพิมพ์เขียว §10) */
export const BUSINESS_TEMPLATES: readonly BusinessTemplate[] = BUSINESS_TEMPLATE_LIST;

export function businessTemplateByKey(key: unknown): BusinessTemplate | null {
  return typeof key === "string" ? (BUSINESS_TEMPLATES.find((t) => t.key === key) ?? null) : null;
}

export type BusinessTemplateCtx = { tenantId: string; systemId: string; actorUserId: string | null };

export class BusinessTemplateError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "VALIDATION" | "BUSY",
    message: string,
  ) {
    super(message);
    this.name = "BusinessTemplateError";
  }
}

export type ApplyBusinessTemplateResult = {
  key: string;
  created: { pipelines: number; lostReasons: number; sections: number; fields: number; objects: number };
  /** key ของวัตถุที่มีอยู่แล้วในระบบ (เก็บแบบที่ร้านมี) */
  keptObjects: string[];
  /** key ของวัตถุที่ข้ามเพราะผู้กดไม่มีคีย์ `crm.object.manage` (รีวิว N-1) */
  skippedObjects: string[];
  /** ข้อความไทยเมื่อมีส่วนที่ข้าม (null = ครบ) */
  notice: string | null;
};

/** ผู้ออกแบบของระบบ — เฉพาะการเรียกภายในที่ไม่มีคน (ไม่ส่ง actor) */
const SYSTEM_DESIGNER: MemberActor = { userId: "system", role: "OWNER", unitAccess: ["*"], permissions: {} };

type Tx = Prisma.TransactionClient;
type ResolvedObject = { key: string; label: string; labelPlural: string; parentType: ObjectTemplateParent; titleFieldKey: string; templateKey: string | null; sections: BusinessObjectSection[] };

const fieldsEngine = async () => (await import("@/lib/modules/member")).fields;
const BUSINESS_SECTION = { key: "business", label: "ข้อมูลตามประเภทกิจการ" } as const;
const LOCK_WAIT_MS = 90_000;
const TX_OPTS = { timeout: 120_000, maxWait: 30_000 } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function resolveObject(o: BusinessTemplate["objects"][number]): ResolvedObject | null {
  if ("templateKey" in o) {
    const t = OBJECT_TEMPLATES.find((x) => x.key === o.templateKey);
    if (!t) return null;
    // ฟิลด์ของเทมเพลตวัตถุกลางสร้างโดยบริการวัตถุเอง (objects.create({ templateKey })) ⇒ ที่นี่ไม่ต้องสร้างซ้ำ
    return { key: t.key, label: t.label, labelPlural: t.labelPlural, parentType: t.parentType, titleFieldKey: t.titleFieldKey, templateKey: t.key, sections: [] };
  }
  return { key: o.key, label: o.label, labelPlural: o.labelPlural, parentType: o.parentType, titleFieldKey: o.titleFieldKey, templateKey: null, sections: o.sections };
}

/** ส่วน (section) ของวัตถุนี้ที่ key ตรง — ไม่มี = สร้างผ่าน engine */
async function ensureSection(tx: Tx, ctx: BusinessTemplateCtx, objectKey: string, sec: { key: string; label: string }): Promise<{ id: string; created: boolean }> {
  const hit = await tx.memberSection.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey, key: sec.key }, select: { id: true } });
  if (hit) return { id: hit.id, created: false };
  const fc = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId, objectKey };
  const row = await (await fieldsEngine()).createSection(fc, { key: sec.key, label: sec.label }, tx);
  return { id: row.id, created: true };
}

/** ฟิลด์ที่ key ยังไม่มีในวัตถุนี้ (ทั้งวัตถุ ไม่ใช่แค่ในส่วน) — สร้างผ่าน engine · มีแล้ว = ไม่แตะ (ร้านแก้ป้าย/ตัวเลือกไว้ได้) */
async function ensureFields(tx: Tx, ctx: BusinessTemplateCtx, objectKey: string, sectionId: string, fields: readonly BusinessField[]): Promise<number> {
  let n = 0;
  const fc = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId, objectKey };
  for (const f of fields) {
    const hit = await tx.memberField.findFirst({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, objectKey, key: f.key }, select: { id: true } });
    if (hit) continue;
    await (await fieldsEngine()).createField(fc, { sectionId, key: f.key, label: f.label, type: f.type, options: f.options ?? {} }, tx);
    n += 1;
  }
  return n;
}

/** ส่วน+ฟิลด์ของวัตถุที่เทมเพลตกำหนดเอง (ไม่ใช่เทมเพลตวัตถุกลาง) */
async function ensureObjectSections(tx: Tx, ctx: BusinessTemplateCtx, obj: ResolvedObject): Promise<{ sections: number; fields: number }> {
  let sections = 0;
  let fields = 0;
  for (const sec of obj.sections) {
    const s = await ensureSection(tx, ctx, obj.key, sec);
    if (s.created) sections += 1;
    fields += await ensureFields(tx, ctx, obj.key, s.id, sec.fields);
  }
  return { sections, fields };
}

async function applyInTx(tx: Tx, ctx: BusinessTemplateCtx, t: BusinessTemplate, designer: MemberActor | null): Promise<ApplyBusinessTemplateResult> {
  const created = { pipelines: 0, lostReasons: 0, sections: 0, fields: 0, objects: 0 };
  const keptObjects: string[] = [];
  const skippedObjects: string[] = [];
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };

  // ① ฟิลด์เพิ่มของผู้ติดต่อ/บริษัท/ดีล (ก่อน pipeline — requireFields อ้าง key ฟิลด์ดีลของเทมเพลต)
  for (const objectKey of ["contact", "company", "deal"] as const) {
    const list = t.fields[objectKey];
    if (list.length === 0) continue;
    const s = await ensureSection(tx, ctx, objectKey, BUSINESS_SECTION);
    if (s.created) created.sections += 1;
    created.fields += await ensureFields(tx, ctx, objectKey, s.id, list);
  }

  // ② pipeline + ขั้น ตามข้อมูลเป๊ะ (หาจากชื่อที่ยังไม่เก็บถาวร — มีแล้ว = ไม่แตะขั้นที่ร้านอาจแก้ไว้)
  for (const p of t.pipelines) {
    const hit = await tx.crmPipeline.findFirst({ where: { ...scope, name: p.name, archivedAt: null }, select: { id: true } });
    if (hit) continue;
    const live = await tx.crmPipeline.count({ where: { ...scope, archivedAt: null } });
    const all = await tx.crmPipeline.count({ where: scope });
    await tx.crmPipeline.create({
      data: {
        ...scope,
        name: p.name,
        isDefault: live === 0,
        sortOrder: all,
        stages: {
          create: p.stages.map((s, i) => ({
            ...scope,
            sortOrder: i,
            name: s.name,
            kind: s.kind,
            probability: s.probability,
            staleDays: s.kind === "OPEN" ? (s.staleDays ?? null) : null,
            requireFields: [...(s.requireFields ?? [])],
          })),
        },
      },
    });
    created.pipelines += 1;
  }

  // ③ เหตุผลที่แพ้ (unique [systemId, key] — มีแล้ว = ข้าม · ร้านแก้ป้ายไว้ = คงป้ายของร้าน)
  const have = new Set((await tx.crmLostReason.findMany({ where: scope, select: { key: true } })).map((r) => r.key));
  const maxSort = (await tx.crmLostReason.aggregate({ where: scope, _max: { sortOrder: true } }))._max.sortOrder ?? -1;
  const add = t.lostReasons.filter((r) => !have.has(r.key));
  if (add.length > 0) {
    const r = await tx.crmLostReason.createMany({
      data: add.map((x, i) => ({ ...scope, key: x.key, label: x.label, sortOrder: maxSort + 1 + i, active: true, isSystem: x.key === "other" })),
      skipDuplicates: true,
    });
    created.lostReasons += r.count;
  }

  // ④ วัตถุกำหนดเอง — key มีอยู่แล้ว = เก็บแบบที่ร้านมี · ยกเว้นวัตถุที่เป็น "ของเทมเพลตนี้เอง" (ป้าย+ผูกกับตรงกัน) ที่ฟิลด์ยังไม่ครบ
  //    (apply รอบก่อนล้มหลังสร้างวัตถุ) ⇒ เติมเฉพาะฟิลด์ที่ขาด
  for (const raw of t.objects) {
    const obj = resolveObject(raw);
    if (!obj) continue;
    if (!designer) {
      skippedObjects.push(obj.key);
      continue;
    }
    const existing = await tx.customObject.findFirst({ where: { ...scope, key: obj.key }, select: { label: true, parentType: true } });
    if (existing) {
      keptObjects.push(obj.key);
      if (!obj.templateKey && existing.label === obj.label && existing.parentType === obj.parentType) {
        const r = await ensureObjectSections(tx, ctx, obj);
        created.sections += r.sections;
        created.fields += r.fields;
      }
      continue;
    }
    try {
      // บริการวัตถุ C1.2b (tx ของตัวเอง · ตรวจ key/ชื่อ/ผูกกับ/ฟิลด์ชื่อรายการ · audit crm.object.create) — ฟิลด์ของเทมเพลตวัตถุกลางสร้างในนั้น
      await objects.create(ctx, designer, {
        key: obj.key,
        label: obj.label,
        labelPlural: obj.labelPlural,
        parentType: obj.parentType,
        titleFieldKey: obj.titleFieldKey,
        ...(obj.templateKey ? { templateKey: obj.templateKey } : {}),
      });
      created.objects += 1;
    } catch (e) {
      // มีคนสร้าง key เดียวกันแทรกเข้ามา (unique systemId+key) = เก็บของเขาไว้
      if (e instanceof objects.ObjectsError && e.code === "DUPLICATE") {
        keptObjects.push(obj.key);
        continue;
      }
      throw e;
    }
    if (!obj.templateKey) {
      const r = await ensureObjectSections(tx, ctx, obj);
      created.sections += r.sections;
      created.fields += r.fields;
    }
  }

  // ⑤ ตัวชี้เทมเพลตใน settings.crm (jsonb_set คำสั่งเดียว — ไม่อ่านทั้งก้อนมาเขียนทับ) · key เดิม = คง appliedAt ครั้งแรก
  const value = JSON.stringify({ key: t.key, appliedAt: new Date().toISOString() });
  await tx.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END)
        || jsonb_build_object('businessTemplate', ${value}::jsonb),
      true)
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND "type" = 'CRM'
      AND COALESCE("settings"->'crm'->'businessTemplate'->>'key', '') <> ${t.key}`;

  const notice = skippedObjects.length > 0
    ? `ตั้งค่าเทมเพลตแล้ว ยกเว้นรายการเฉพาะกิจการ ${skippedObjects.length} แบบ — ต้องใช้สิทธิ์ "ตั้งค่าวัตถุกำหนดเอง" ขอให้เจ้าของร้านเลือกเทมเพลตเดิมอีกครั้งเพื่อเพิ่มส่วนนี้`
    : null;
  return { key: t.key, created, keptObjects, skippedObjects, notice };
}

/**
 * ใส่เทมเพลตกิจการ `key` ให้ระบบ CRM `ctx.systemId` — idempotent (ใส่ซ้ำ = ไม่มีแถวใหม่) · ยิงพร้อมกันได้ (ผลเท่าใส่ครั้งเดียว)
 * key ไม่รู้จัก = NOT_FOUND · ระบบไม่ใช่ CRM ของร้านนี้ = NOT_FOUND · รอล็อกนานเกิน = BUSY (ข้อความไทย ลองใหม่ได้)
 */
export async function applyBusinessTemplate(ctx: BusinessTemplateCtx, key: string, opts: { actor?: MemberActor | null } = {}): Promise<ApplyBusinessTemplateResult> {
  const t = businessTemplateByKey(key);
  if (!t) throw new BusinessTemplateError("NOT_FOUND", "ไม่พบเทมเพลตกิจการที่เลือก — เลือกจากรายการ 16 แบบอีกครั้ง");
  const sys =
    typeof ctx?.systemId === "string" && typeof ctx?.tenantId === "string" && ctx.systemId && ctx.tenantId
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } })
      : null;
  if (!sys) throw new BusinessTemplateError("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  const c: BusinessTemplateCtx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null };
  // N-1: คนกด = actor จริงของเขา และต้องมีคีย์ออกแบบวัตถุ (ไม่มี = ข้ามวัตถุ) · ไม่มีคน (งานภายใน) = ผู้ออกแบบของระบบ
  const who = opts.actor ?? null;
  const designer: MemberActor | null = who ? (crmCan(who, "crm.object.manage") ? who : null) : SYSTEM_DESIGNER;
  const lock = `crm:business-template:${c.systemId}`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    const out = await prisma.$transaction(async (tx) => {
      const got = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${lock}, 0)) AS "ok"`;
      if (got[0]?.ok !== true) return null;
      return applyInTx(tx, c, t, designer);
    }, TX_OPTS);
    if (out) {
      await writeAudit({
        tenantId: c.tenantId,
        actorId: c.actorUserId,
        actorType: c.actorUserId ? "USER" : "SYSTEM",
        action: "crm.template.apply",
        targetType: "CrmSystem",
        targetId: c.systemId,
        after: { key: t.key, created: out.created, keptObjects: out.keptObjects, skippedObjects: out.skippedObjects },
      });
      return out;
    }
    if (Date.now() > deadline) throw new BusinessTemplateError("BUSY", "มีการตั้งค่าเทมเพลตของระบบนี้ค้างอยู่ — รอสักครู่แล้วลองใหม่");
    await sleep(80 + Math.floor(Math.random() * 120));
  }
}

/**
 * SF-7 (รีวิว C1.11): "ไม่ใช้เทมเพลต" — `settings.crm.businessTemplate = "none"` (jsonb_set คำสั่งเดียว · เขียนเฉพาะตอนยังไม่ได้เลือก)
 * ตัวเลือกบนหน้าแรกหายไป · ไม่มีแถวอื่นถูกเขียน · audit `crm.template.skip` · คืน true เมื่อเขียนจริง
 */
export async function skipBusinessTemplate(ctx: BusinessTemplateCtx): Promise<boolean> {
  const n = await prisma.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END)
        || jsonb_build_object('businessTemplate', to_jsonb('none'::text)),
      true)
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND "type" = 'CRM'
      AND ("settings"->'crm'->'businessTemplate') IS NULL`;
  if (n > 0) {
    await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId, action: "crm.template.skip", targetType: "CrmSystem", targetId: ctx.systemId, after: { businessTemplate: "none" } });
  }
  return n > 0;
}
