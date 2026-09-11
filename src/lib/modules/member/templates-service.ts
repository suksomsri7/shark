// templates-service.ts — เอนจินเทมเพลตกิจการ (M3.9 · D7 · พิมพ์เขียว §10)
//
// ข้อมูลของแต่ละเทมเพลตอยู่ที่ `./templates/*.ts` (ไฟล์บริสุทธิ์ ห้าม import prisma/facade)
// ไฟล์นี้เป็นตัว "อ่านข้อมูลนั้นแล้วสร้างของจริง" — รวม 4 ส่วน (fields/tiers/stamps/journeys) ไว้ที่เดียว
//
// 🔴 กติกาเดิมของ M1.2 ยังใช้ได้เป๊ะ: `fields.applyTemplate(ctx, key)` (2 พารามิเตอร์ = เฉพาะส่วน fields)
//    ไฟล์นี้เพิ่ม `applyTemplate(ctx, key, { parts, actor })` เป็นชั้นบน ไม่ได้แทนที่ของเดิม
// 🔴 ไม่ทับของเดิมทุกส่วน: เทียบด้วย key (ส่วน/ฟิลด์/ระดับ) หรือชื่อ (สแตมป์/journey — ตารางนั้นไม่มีคอลัมน์ key)
//    เรียกซ้ำ = added ทุกช่องเป็น 0 (idempotent)

import type { MemberCtx } from "./profile";
import type { MemberActor } from "./access";
import { canManageSettings } from "./access";
import { MemberForbiddenError, MemberInputError } from "./errors";
import { prisma } from "./db";
import * as fieldsModule from "./fields";
import * as tiersModule from "./tiers";
import * as journeysModule from "./journeys";
import { JOURNEY_PRESETS } from "./journey-presets";
import { JOURNEY_TRIGGERS } from "./journeys-shared";
import { createCard, RULE_KINDS, REWARD_KINDS } from "@/lib/modules/stamp";
import {
  TEMPLATES,
  type MemberTemplate,
  type MemberTemplateField,
  type MemberTemplateJourney,
  type MemberTemplateStamp,
  type MemberTemplateTier,
} from "./templates";

export type TemplatePart = "fields" | "tiers" | "stamps" | "journeys";
const ALL_PARTS: readonly TemplatePart[] = ["fields", "tiers", "stamps", "journeys"];

export type ApplyTemplateOptions = {
  /** ส่วนที่จะนำเข้า — ไม่ระบุ = ทั้ง 4 ส่วน */
  parts?: TemplatePart[];
  /** จำเป็นเมื่อมี tiers/stamps/journeys อยู่ใน parts (ต้องมีสิทธิ์ `member.settings.manage`) */
  actor?: MemberActor;
  /** ส่งต่อให้ `fields.applyTemplate` (ใช้ตอน seed จำลองร้านที่ตั้งค่าด้วยเทมเพลตรุ่นก่อน) */
  onlyFieldKeys?: string[];
};

export type ApplyTemplateResult = {
  added: { sections: number; fields: number; tiers: number; stamps: number; journeys: number };
  created: { sectionIds: string[]; fieldIds: string[]; tierDefIds: string[]; stampCardIds: string[]; journeyIds: string[] };
};

export type TemplatePreviewField = { key: string; label: string; type: string; exists: boolean };
export type TemplatePreviewSection = { key: string; label: string; exists: boolean; fields: TemplatePreviewField[] };
export type TemplatePreviewTier = { key: string; label: string; exists: boolean };
export type TemplatePreviewStamp = { key: string; name: string; exists: boolean };
export type TemplatePreviewJourney = { key: string; name: string; exists: boolean };

export type TemplatePreview = {
  template: { key: string; name: string };
  sections: TemplatePreviewSection[];
  tiers: TemplatePreviewTier[];
  stamps: TemplatePreviewStamp[];
  journeys: TemplatePreviewJourney[];
  counts: {
    sections: number;
    fields: number;
    tiers: number;
    stamps: number;
    journeys: number;
    newSections: number;
    newFields: number;
    newTiers: number;
    newStamps: number;
    newJourneys: number;
  };
};

function requireTemplate(key: string): MemberTemplate {
  const t = TEMPLATES[key];
  if (!t) throw new MemberInputError(`ไม่รู้จักเทมเพลตกิจการ "${key}" — เลือกได้ ${Object.keys(TEMPLATES).join(" / ")}`);
  return t;
}

// ───────────────────────── validate (ข้อมูลล้วน — ไม่แตะฐานข้อมูล) ─────────────────────────

const FIELD_TYPE_SET = new Set(["TEXT", "LONG_TEXT", "NUMBER", "MONEY", "DATE", "DATETIME", "SELECT", "MULTI_SELECT", "BOOLEAN", "FILE", "LOOKUP"]);

function validateField(f: MemberTemplateField, errors: string[], seen: Set<string>): void {
  if (seen.has(f.key)) errors.push(`ฟิลด์ "${f.key}" ซ้ำกันในเทมเพลตนี้`);
  seen.add(f.key);
  if (!FIELD_TYPE_SET.has(f.type)) {
    errors.push(`ฟิลด์ "${f.key}" ใช้ชนิด "${f.type}" ที่ไม่มีอยู่จริง`);
    return;
  }
  if ((f.type === "SELECT" || f.type === "MULTI_SELECT") && (f.options?.choices?.length ?? 0) < 2) {
    errors.push(`ฟิลด์ "${f.key}" ชนิด ${f.type} ต้องมีตัวเลือกอย่างน้อย 2 ตัว`);
  }
  if (f.type === "LOOKUP" && !f.options?.target) {
    errors.push(`ฟิลด์ "${f.key}" ชนิด LOOKUP ต้องระบุปลายทาง (options.target)`);
  }
}

function validateTier(t: MemberTemplateTier, errors: string[], seen: Set<string>): void {
  if (seen.has(t.key)) errors.push(`ระดับ "${t.key}" ซ้ำกันในเทมเพลตนี้`);
  seen.add(t.key);
}

function validateStamp(s: MemberTemplateStamp, errors: string[]): void {
  if (!Number.isInteger(s.slots) || s.slots < 3 || s.slots > 30) {
    errors.push(`สแตมป์ "${s.name}" ต้องมีจำนวนช่อง 3–30 ช่อง`);
  }
  if (!(RULE_KINDS as readonly string[]).includes(s.ruleKind)) {
    errors.push(`สแตมป์ "${s.name}" ใช้เงื่อนไข "${s.ruleKind}" ที่ไม่มีอยู่จริง`);
  }
  if (!(REWARD_KINDS as readonly string[]).includes(s.rewardKind)) {
    errors.push(`สแตมป์ "${s.name}" ใช้รางวัล "${s.rewardKind}" ที่ไม่มีอยู่จริง`);
  }
}

function validateJourney(j: MemberTemplateJourney, errors: string[]): void {
  const validPreset = !!j.presetKey && JOURNEY_PRESETS.some((p) => p.key === j.presetKey);
  const validTrigger = !!j.trigger?.event && JOURNEY_TRIGGERS.some((tr) => tr.value === j.trigger?.event);
  if (!validPreset && !validTrigger) {
    errors.push(`journey "${j.name}" ต้องอ้าง preset ที่มีจริง (presetKey) หรือ trigger.event ที่ระบบรู้จัก`);
  }
}

/** ตรวจข้อมูลของเทมเพลต (ไม่แตะฐานข้อมูล) — ใช้ก่อน apply เสมอ */
export function validateTemplate(t: MemberTemplate): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const fieldKeys = new Set<string>();
  for (const sec of t.sections ?? []) {
    for (const f of sec.fields) validateField(f, errors, fieldKeys);
  }
  const tierKeys = new Set<string>();
  for (const tier of t.tiers ?? []) validateTier(tier, errors, tierKeys);
  for (const s of t.stamps ?? []) validateStamp(s, errors);
  for (const j of t.journeys ?? []) validateJourney(j, errors);
  return { ok: errors.length === 0, errors };
}

// ───────────────────────── preview (อ่านอย่างเดียว) ─────────────────────────

/** เปรียบเทียบเทมเพลตกับของที่ระบบสมาชิกนี้มีอยู่แล้ว — ใช้วาดแผงตัวอย่างก่อนกด "ใช้เทมเพลต" */
export async function previewTemplate(ctx: MemberCtx, templateKey: string): Promise<TemplatePreview> {
  const template = requireTemplate(templateKey);
  const [{ sections: currentSections }, tierRows, stampRows, journeyRows] = await Promise.all([
    fieldsModule.listLayout(ctx),
    prisma.memberTierDef.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { key: true } }),
    prisma.stampCard.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { name: true } }),
    prisma.automationRule.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, scope: "MEMBER_JOURNEY" },
      select: { name: true },
    }),
  ]);
  const sectionByKey = new Map(currentSections.map((s) => [s.key, s]));
  // 🔴 fields.ts#applyTemplate ตัดสิน "มีแล้วไหม" ด้วย key ของฟิลด์แบบ **รวมทั้งระบบ** ไม่ใช่แค่ในส่วนเดียวกัน
  //    (ฟิลด์ชนิด LOOKUP อย่าง instructorId ถูกสร้างไว้ในส่วน "dive" ของเทมเพลตอื่น แต่เทมเพลตนี้ประกาศไว้ใน
  //    ส่วน "health" — ต้องเทียบด้วยชุด key รวมชุดเดียวกัน ไม่งั้น preview นับ "ใหม่" เกินจริงจนไม่ตรงกับที่ apply จริง)
  const existingFieldKeysGlobal = new Set(currentSections.flatMap((s) => s.fields.map((f) => f.key)));
  const tierKeys = new Set(tierRows.map((t) => t.key));
  const stampNames = new Set(stampRows.map((s) => s.name));
  const journeyNames = new Set(journeyRows.map((j) => j.name));

  const sections: TemplatePreviewSection[] = (template.sections ?? []).map((sec) => {
    const existingSec = sectionByKey.get(sec.key);
    return {
      key: sec.key,
      label: sec.label,
      exists: !!existingSec,
      fields: sec.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, exists: existingFieldKeysGlobal.has(f.key) })),
    };
  });
  const tiers: TemplatePreviewTier[] = (template.tiers ?? []).map((t) => ({ key: t.key, label: t.label, exists: tierKeys.has(t.key) }));
  const stamps: TemplatePreviewStamp[] = (template.stamps ?? []).map((s) => ({ key: s.key, name: s.name, exists: stampNames.has(s.name) }));
  const journeys: TemplatePreviewJourney[] = (template.journeys ?? []).map((j) => ({ key: j.key, name: j.name, exists: journeyNames.has(j.name) }));

  const allFields = sections.flatMap((s) => s.fields);
  return {
    template: { key: template.key, name: template.name },
    sections,
    tiers,
    stamps,
    journeys,
    counts: {
      sections: sections.length,
      fields: allFields.length,
      tiers: tiers.length,
      stamps: stamps.length,
      journeys: journeys.length,
      newSections: sections.filter((s) => !s.exists).length,
      newFields: allFields.filter((f) => !f.exists).length,
      newTiers: tiers.filter((t) => !t.exists).length,
      newStamps: stamps.filter((s) => !s.exists).length,
      newJourneys: journeys.filter((j) => !j.exists).length,
    },
  };
}

// ───────────────────────── apply (เขียนจริง — ไม่ทับของเดิม) ─────────────────────────

async function applyTiers(ctx: MemberCtx, actor: MemberActor, template: MemberTemplate): Promise<{ added: number; ids: string[] }> {
  const list = template.tiers ?? [];
  if (list.length === 0) return { added: 0, ids: [] };
  const existing = await prisma.memberTierDef.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { key: true } });
  const existingKeys = new Set(existing.map((t) => t.key));
  const ids: string[] = [];
  let added = 0;
  for (const t of list) {
    if (existingKeys.has(t.key)) continue;
    const created = await tiersModule.createTierDef(ctx, actor, {
      key: t.key,
      name: t.label,
      color: t.color ?? "SLATE",
      description: t.description ?? null,
    });
    existingKeys.add(t.key);
    ids.push(created.id);
    added += 1;
    if (t.benefits?.length) {
      await tiersModule.setBenefits(
        ctx,
        actor,
        created.id,
        t.benefits.map((b) => ({ type: b.kind, config: b.config, active: true })),
      );
    }
    if (t.rule && (t.rule.spentSatang || t.rule.visits)) {
      const conditions: { field: tiersModule.RuleField; op: "gte"; value: number; windowMonths?: number }[] = [];
      if (t.rule.spentSatang) {
        conditions.push({ field: "spent12m", op: "gte", value: t.rule.spentSatang, ...(t.rule.windowMonths ? { windowMonths: t.rule.windowMonths } : {}) });
      }
      if (t.rule.visits) conditions.push({ field: "visits12m", op: "gte", value: t.rule.visits });
      if (conditions.length) {
        await tiersModule.setTierRules(ctx, actor, created.id, { upgrade: { match: "ALL", conditions } });
      }
    }
  }
  return { added, ids };
}

async function applyStamps(ctx: MemberCtx, actor: MemberActor, template: MemberTemplate): Promise<{ added: number; ids: string[] }> {
  const list = template.stamps ?? [];
  if (list.length === 0) return { added: 0, ids: [] };
  const existing = await prisma.stampCard.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { name: true } });
  const existingNames = new Set(existing.map((s) => s.name));
  const ids: string[] = [];
  let added = 0;
  for (const s of list) {
    if (existingNames.has(s.name)) continue;
    const created = await createCard(ctx, actor, {
      name: s.name,
      description: s.description ?? null,
      slots: s.slots,
      ruleKind: s.ruleKind,
      ruleConfig: s.ruleConfig ?? null,
      rewardKind: s.rewardKind,
      rewardConfig: s.rewardConfig ?? {},
    });
    existingNames.add(s.name);
    ids.push(created.id);
    added += 1;
  }
  return { added, ids };
}

async function applyJourneys(ctx: MemberCtx, actor: MemberActor, template: MemberTemplate): Promise<{ added: number; ids: string[] }> {
  const list = template.journeys ?? [];
  if (list.length === 0) return { added: 0, ids: [] };
  const existing = await prisma.automationRule.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, scope: "MEMBER_JOURNEY" },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((j) => j.name));
  const ids: string[] = [];
  let added = 0;
  for (const j of list) {
    if (existingNames.has(j.name)) continue;
    let id: string;
    if (j.presetKey) {
      const created = await journeysModule.createFromPreset(ctx, actor, j.presetKey, { name: j.name, enabled: false });
      id = created.id;
    } else if (j.trigger?.event) {
      const created = await journeysModule.createJourney(ctx, actor, {
        name: j.name,
        trigger: j.trigger,
        conditions: j.conditions ?? { groups: [] },
        actions: j.actions ?? [],
        holdoutPct: 0,
        reentryDays: null,
        enabled: false,
      });
      id = created.id;
    } else {
      continue; // validateTemplate ควรกันไว้ก่อนถึงตรงนี้แล้ว
    }
    existingNames.add(j.name);
    ids.push(id);
    added += 1;
  }
  return { added, ids };
}

/**
 * เปิดใช้เทมเพลตกิจการ — เพิ่มเฉพาะส่วนที่ยังไม่มี ไม่ทับของเดิม เรียกซ้ำได้ (idempotent)
 * `parts` ปริยาย = ทั้ง 4 ส่วน · `actor` จำเป็นเมื่อมี tiers/stamps/journeys อยู่ใน parts (ต้องมีสิทธิ์ `member.settings.manage`)
 * รูปแบบเดิมของ M1.2 (`fields.applyTemplate(ctx, key)`) ยังใช้ได้ตรง ๆ = เทียบเท่า `parts: ["fields"]`
 */
export async function applyTemplate(ctx: MemberCtx, templateKey: string, opts: ApplyTemplateOptions = {}): Promise<ApplyTemplateResult> {
  const template = requireTemplate(templateKey);
  const parts = opts.parts && opts.parts.length > 0 ? opts.parts : [...ALL_PARTS];
  const needsActor = parts.some((p) => p !== "fields");

  const added = { sections: 0, fields: 0, tiers: 0, stamps: 0, journeys: 0 };
  const created = { sectionIds: [] as string[], fieldIds: [] as string[], tierDefIds: [] as string[], stampCardIds: [] as string[], journeyIds: [] as string[] };

  if (parts.includes("fields")) {
    const r = await fieldsModule.applyTemplate(ctx, templateKey, { onlyFieldKeys: opts.onlyFieldKeys });
    added.sections = r.added.sections;
    added.fields = r.added.fields;
    created.sectionIds = r.created.sectionIds;
    created.fieldIds = r.created.fieldIds;
  }

  if (needsActor) {
    if (!opts.actor) throw new MemberInputError("ต้องระบุผู้ทำรายการก่อนนำเข้าระดับ/สแตมป์/journey ของเทมเพลต");
    if (!canManageSettings(opts.actor)) {
      throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ตั้งค่าระบบสมาชิก — ขอสิทธิ์ member.settings.manage จากเจ้าของร้านก่อน");
    }
    const actor = opts.actor;
    if (parts.includes("tiers")) {
      const r = await applyTiers(ctx, actor, template);
      added.tiers = r.added;
      created.tierDefIds = r.ids;
    }
    if (parts.includes("stamps")) {
      const r = await applyStamps(ctx, actor, template);
      added.stamps = r.added;
      created.stampCardIds = r.ids;
    }
    if (parts.includes("journeys")) {
      const r = await applyJourneys(ctx, actor, template);
      added.journeys = r.added;
      created.journeyIds = r.ids;
    }
  }

  return { added, created };
}
