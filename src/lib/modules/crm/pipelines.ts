// pipelines.ts — บริการตั้งค่า pipeline + ขั้นของดีล (CRM v2 · ใบ C1.5 · พิมพ์เขียว §5.4 §3.7 §11.3 · R-A)
//
// ของที่ไฟล์นี้เป็นเจ้าของ: CrmPipeline (สร้าง · แก้ชื่อ/ค่าเริ่มต้น · เก็บถาวร/กู้คืน) · CrmStage (เพิ่ม · แก้ · เรียง · ลบ)
// 🔴 R-A: เก็บ pipeline ถาวรได้เฉพาะเมื่อไม่มีดีลที่ยังเปิดอยู่ · ยืนยัน + เหตุผล (AUDIT-CLASS X9)
// 🔴 ชนิดของขั้น (OPEN/WON/LOST) เปลี่ยน/ลบขั้นได้เฉพาะเมื่อไม่มีดีลอยู่ในขั้นนั้น (ไม่งั้น `CrmDeal.kind` ไม่ตรงกับขั้น)
// 🔴 AUDIT-CLASS X1: ทุกแถวหาด้วย tenantId + systemId (ระบบ CRM ที่ resolve ใหม่) — ของระบบ/ร้านอื่น = ไม่พบ

import { Prisma } from "@prisma/client";
import type { CrmStage, CrmStageKind } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import {
  DEAL_REASON_MAX,
  DEAL_REASON_MIN,
  DealsError,
  PIPELINE_NAME_MAX,
  PIPELINE_STAGES_MAX,
  STAGE_REQUIRABLE_SYSTEM_KEYS,
  type PipelineDto,
  type StageDto,
} from "./deals-shared";

export type PipelinesCtx = { tenantId: string; systemId: string; actorUserId: string | null };
type Tx = Prisma.TransactionClient;

export type StageInput = {
  name: string;
  kind?: string | null;
  probability?: number | null;
  staleDays?: number | null;
  requireFields?: string[] | null;
  requireLines?: boolean | null;
  requireQuotation?: boolean | null;
  color?: string | null;
  description?: string | null;
};
export type StagePatch = Partial<StageInput>;

const memberFacade = () => import("@/lib/modules/member");
const fail = (code: DealsError["code"], message: string) => new DealsError(code, message);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const scope = (ctx: PipelinesCtx) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId });
const NOT_FOUND_PIPE = "ไม่พบ pipeline นี้ในระบบ CRM ที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const NOT_FOUND_STAGE = "ไม่พบขั้นนี้ในระบบ CRM ที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const KINDS: CrmStageKind[] = ["OPEN", "WON", "LOST"];

async function enter(ctx: PipelinesCtx, actor: MemberActor | null | undefined): Promise<MemberActor> {
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", NOT_FOUND_PIPE);
  const sys =
    typeof ctx?.systemId === "string" && typeof ctx?.tenantId === "string" && ctx.systemId && ctx.tenantId
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } })
      : null;
  if (!sys) throw fail("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  return actor;
}

async function audit(ctx: PipelinesCtx, action: string, targetType: string, targetId: string, body: { before?: unknown; after?: unknown }): Promise<void> {
  await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId ?? null, action, targetType, targetId, ...body });
}

/** ล็อกแถว pipeline (FOR UPDATE) — ผู้แก้ขั้น/เก็บถาวรเรียงคิวกัน · สร้างดีลถือล็อกแชร์ของแถวเดียวกัน */
async function lockPipe(tx: Tx, ctx: PipelinesCtx, pipelineId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "CrmPipeline" WHERE "id" = ${pipelineId} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} FOR UPDATE`;
}

function cleanName(v: unknown, label: string, max = PIPELINE_NAME_MAX): string {
  const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!t) throw fail("VALIDATION", `ใส่${label}ก่อน`);
  if (t.length > max) throw fail("VALIDATION", `${label}ยาวเกิน ${max} ตัวอักษร — ย่อให้สั้นลง`);
  return t;
}

function cleanKind(v: unknown): CrmStageKind {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "OPEN";
  if (!(KINDS as string[]).includes(s)) throw fail("VALIDATION", "ชนิดของขั้นต้องเป็น เปิดอยู่ · ชนะ · แพ้");
  return s as CrmStageKind;
}

function cleanProbability(v: unknown, kind: CrmStageKind): number {
  if (v === undefined || v === null) return kind === "WON" ? 100 : kind === "LOST" ? 0 : 10;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100) throw fail("VALIDATION", "โอกาสปิดของขั้นต้องเป็นจำนวนเต็ม 0–100 (%)");
  return v;
}

function cleanStaleDays(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 365) throw fail("VALIDATION", "จำนวนวันที่ถือว่านิ่งต้องเป็นจำนวนเต็ม 0–365 (0 = ไม่นับ)");
  return v;
}

function cleanColor(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw fail("VALIDATION", "สีของขั้นต้องเป็นรหัสสีแบบ #RRGGBB");
  return s;
}

function cleanDescription(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (s.length > 300) throw fail("VALIDATION", "คำอธิบายขั้นยาวเกิน 300 ตัวอักษร");
  return s;
}

/** key ที่ตั้งเป็น "ต้องกรอกก่อนเข้าขั้น" ได้ = ฟิลด์ระบบที่รองรับ หรือ key ของฟิลด์กำหนดเองของดีลที่มีอยู่จริงในระบบนี้ */
async function cleanRequireFields(ctx: PipelinesCtx, actor: MemberActor, v: unknown): Promise<string[]> {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw fail("VALIDATION", "รายการฟิลด์ที่ต้องกรอกอ่านไม่ออก");
  const keys = [...new Set(v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()))];
  if (keys.length > 30) throw fail("VALIDATION", "ตั้งฟิลด์ที่ต้องกรอกได้ไม่เกิน 30 ฟิลด์ต่อขั้น");
  const system = new Set<string>(STAGE_REQUIRABLE_SYSTEM_KEYS);
  const custom = keys.filter((k) => !system.has(k));
  if (custom.length > 0) {
    let known = new Set<string>();
    try {
      const layout = await (await memberFacade()).fields.listLayout({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null, objectKey: "deal", actor });
      known = new Set(layout.sections.flatMap((s) => s.fields.filter((f) => !f.isSystem).map((f) => f.key)));
    } catch {
      known = new Set();
    }
    const bad = custom.filter((k) => !known.has(k));
    if (bad.length > 0) throw fail("VALIDATION", `ไม่พบฟิลด์ของดีลชื่ออ้างอิง ${bad.map((b) => `"${b}"`).join(", ")} — เลือกจากรายการฟิลด์ของดีล`);
  }
  return keys;
}

function stageDto(s: CrmStage): StageDto {
  return {
    id: s.id,
    name: s.name,
    kind: s.kind,
    probability: s.probability,
    sortOrder: s.sortOrder,
    staleDays: s.staleDays,
    requireFields: s.requireFields,
    requireLines: s.requireLines,
    requireQuotation: s.requireQuotation,
    color: s.color,
    description: s.description,
  };
}

type PipeRow = Prisma.CrmPipelineGetPayload<{ include: { stages: true } }>;
function toDto(p: PipeRow): PipelineDto {
  return { id: p.id, name: p.name, isDefault: p.isDefault, archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null, stages: [...p.stages].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).map(stageDto) };
}

async function loadPipe(ctx: PipelinesCtx, id: unknown, db: typeof prisma | Tx = prisma): Promise<PipeRow> {
  const pid = str(id);
  const row = pid ? await db.crmPipeline.findFirst({ where: { ...scope(ctx), id: pid }, include: { stages: true } }) : null;
  if (!row) throw fail("NOT_FOUND", NOT_FOUND_PIPE);
  return row;
}

async function loadStage(ctx: PipelinesCtx, id: unknown): Promise<CrmStage> {
  const sid = str(id);
  const row = sid ? await prisma.crmStage.findFirst({ where: { ...scope(ctx), id: sid } }) : null;
  if (!row) throw fail("NOT_FOUND", NOT_FOUND_STAGE);
  return row;
}

async function stageData(ctx: PipelinesCtx, actor: MemberActor, s: StageInput) {
  const kind = cleanKind(s?.kind ?? "OPEN");
  return {
    name: cleanName(s?.name, "ชื่อขั้น", 60),
    kind,
    probability: cleanProbability(s?.probability, kind),
    staleDays: cleanStaleDays(s?.staleDays),
    requireFields: await cleanRequireFields(ctx, actor, s?.requireFields),
    requireLines: s?.requireLines === true,
    requireQuotation: s?.requireQuotation === true,
    color: cleanColor(s?.color),
    description: cleanDescription(s?.description),
  };
}

/** รายการ pipeline ของระบบนี้ (พร้อมขั้น) — includeArchived = รวมที่เก็บถาวร */
export async function listPipelines(ctx: PipelinesCtx, actor: MemberActor, opts: { includeArchived?: boolean } = {}): Promise<(PipelineDto & { openDeals: number })[]> {
  await enter(ctx, actor);
  const rows = await prisma.crmPipeline.findMany({
    where: { ...scope(ctx), ...(opts.includeArchived ? {} : { archivedAt: null }) },
    include: { stages: true },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    take: 100,
  });
  const counts = rows.length
    ? await prisma.crmDeal.groupBy({ by: ["pipelineId"], where: { ...scope(ctx), kind: "OPEN", pipelineId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
    : [];
  const byPipe = new Map(counts.map((c) => [c.pipelineId, c._count._all]));
  return rows.map((r) => ({ ...toDto(r), openDeals: byPipe.get(r.id) ?? 0 }));
}

/** สร้าง pipeline + ขั้นตามลำดับที่ส่งมา (ต้องมีขั้นที่เปิดอยู่อย่างน้อย 1) */
export async function createPipeline(ctx: PipelinesCtx, actor: MemberActor, input: { name: string; stages: StageInput[]; isDefault?: boolean | null }): Promise<PipelineDto> {
  const a = await enter(ctx, actor);
  const name = cleanName(input?.name, "ชื่อ pipeline");
  if (!Array.isArray(input?.stages) || input.stages.length === 0) throw fail("VALIDATION", "pipeline ต้องมีอย่างน้อย 1 ขั้น");
  if (input.stages.length > PIPELINE_STAGES_MAX) throw fail("VALIDATION", `pipeline หนึ่งมีได้ไม่เกิน ${PIPELINE_STAGES_MAX} ขั้น`);
  const stages: Awaited<ReturnType<typeof stageData>>[] = [];
  for (const s of input.stages) stages.push(await stageData(ctx, a, s));
  if (!stages.some((s) => s.kind === "OPEN")) throw fail("VALIDATION", "pipeline ต้องมีขั้นที่ \"เปิดอยู่\" อย่างน้อย 1 ขั้น (ดีลใหม่เริ่มที่ขั้นนั้น)");
  const row = await prisma.$transaction(async (tx) => {
    const n = await tx.crmPipeline.count({ where: { ...scope(ctx), archivedAt: null } });
    const makeDefault = input.isDefault === true || n === 0;
    if (makeDefault) await tx.crmPipeline.updateMany({ where: { ...scope(ctx), isDefault: true }, data: { isDefault: false } });
    return tx.crmPipeline.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        name,
        isDefault: makeDefault,
        sortOrder: n,
        stages: { create: stages.map((s, i) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId, sortOrder: i, ...s })) },
      },
      include: { stages: true },
    });
  });
  await audit(ctx, "crm.pipeline.create", "CrmPipeline", row.id, { after: { name: row.name, stages: row.stages.length } });
  return toDto(row);
}

/** แก้ชื่อ / ตั้งเป็นค่าเริ่มต้น */
export async function updatePipeline(ctx: PipelinesCtx, actor: MemberActor, id: string, patch: { name?: string | null; isDefault?: boolean | null }): Promise<PipelineDto> {
  await enter(ctx, actor);
  const cur = await loadPipe(ctx, id);
  const data: Prisma.CrmPipelineUpdateInput = {};
  if (patch?.name !== undefined && patch.name !== null) data.name = cleanName(patch.name, "ชื่อ pipeline");
  const row = await prisma.$transaction(async (tx) => {
    if (patch?.isDefault === true && !cur.isDefault) {
      if (cur.archivedAt) throw fail("VALIDATION", "pipeline ที่เก็บถาวรตั้งเป็นค่าเริ่มต้นไม่ได้ — กู้คืนก่อน");
      await tx.crmPipeline.updateMany({ where: { ...scope(ctx), isDefault: true }, data: { isDefault: false } });
      data.isDefault = true;
    }
    return tx.crmPipeline.update({ where: { id: cur.id }, data, include: { stages: true } });
  });
  await audit(ctx, "crm.pipeline.update", "CrmPipeline", row.id, { before: { name: cur.name, isDefault: cur.isDefault }, after: { name: row.name, isDefault: row.isDefault } });
  return toDto(row);
}

/** R-A: เก็บ pipeline ถาวร — ปฏิเสธเมื่อยังมีดีลที่เปิดอยู่ · AUDIT-CLASS X9: ยืนยัน + เหตุผล */
export async function archivePipeline(ctx: PipelinesCtx, actor: MemberActor, id: string, opts: { confirm?: boolean | null; reason?: string | null }): Promise<PipelineDto> {
  if (opts?.confirm !== true) throw fail("CONFIRM_REQUIRED", "การเก็บ pipeline ถาวรต้องกดยืนยันก่อน — ติ๊กช่องยืนยันแล้วลองอีกครั้ง");
  const reason = String(opts?.reason ?? "").trim();
  if (reason.length < DEAL_REASON_MIN) throw fail("VALIDATION", `ใส่เหตุผลอย่างน้อย ${DEAL_REASON_MIN} ตัวอักษร เพื่อให้ทีมย้อนดูได้`);
  if (reason.length > DEAL_REASON_MAX) throw fail("VALIDATION", `เหตุผลยาวเกิน ${DEAL_REASON_MAX} ตัวอักษร`);
  await enter(ctx, actor);
  const cur = await loadPipe(ctx, id);
  const row = await prisma.$transaction(async (tx) => {
    // ล็อกแถว pipeline แล้วนับดีลเปิดใต้ล็อก — ดีลใหม่ที่เข้ามาพร้อมกันเห็นว่า pipeline ถูกเก็บแล้ว (createDeal อ่าน archivedAt)
    await tx.$queryRaw`SELECT "id" FROM "CrmPipeline" WHERE "id" = ${cur.id} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} FOR UPDATE`;
    const open = await tx.crmDeal.count({ where: { ...scope(ctx), pipelineId: cur.id, kind: "OPEN" } });
    if (open > 0) throw fail("CONFLICT", `pipeline นี้ยังมีดีลที่เปิดอยู่ ${open.toLocaleString("th-TH")} ดีล — ปิดหรือย้ายดีลไป pipeline อื่นก่อนแล้วค่อยเก็บถาวร`);
    return tx.crmPipeline.update({ where: { id: cur.id }, data: { archivedAt: new Date(), isDefault: false }, include: { stages: true } });
  });
  await audit(ctx, "crm.pipeline.archive", "CrmPipeline", row.id, { before: { name: cur.name }, after: { reason, archived: true } });
  return toDto(row);
}

/** กู้คืน pipeline ที่เก็บถาวร */
export async function restorePipeline(ctx: PipelinesCtx, actor: MemberActor, id: string): Promise<PipelineDto> {
  await enter(ctx, actor);
  const cur = await loadPipe(ctx, id);
  const row = await prisma.crmPipeline.update({ where: { id: cur.id }, data: { archivedAt: null }, include: { stages: true } });
  await audit(ctx, "crm.pipeline.restore", "CrmPipeline", row.id, { after: { restored: true } });
  return toDto(row);
}

/** เพิ่มขั้นท้าย pipeline */
export async function addStage(ctx: PipelinesCtx, actor: MemberActor, pipelineId: string, input: StageInput): Promise<StageDto> {
  const a = await enter(ctx, actor);
  const pipe = await loadPipe(ctx, pipelineId);
  if (pipe.stages.length >= PIPELINE_STAGES_MAX) throw fail("VALIDATION", `pipeline หนึ่งมีได้ไม่เกิน ${PIPELINE_STAGES_MAX} ขั้น`);
  const data = await stageData(ctx, a, input);
  const max = pipe.stages.reduce((m, s) => Math.max(m, s.sortOrder), -1);
  const row = await prisma.crmStage.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, pipelineId: pipe.id, sortOrder: max + 1, ...data } });
  await audit(ctx, "crm.stage.create", "CrmStage", row.id, { after: { pipelineId: pipe.id, name: row.name, kind: row.kind } });
  return stageDto(row);
}

/**
 * แก้ขั้น — ชื่อ · โอกาสปิด · วันนิ่ง · เงื่อนไขก่อนเข้าขั้น (requireFields/requireLines/requireQuotation) · สี · คำอธิบาย
 * ชนิดของขั้นเปลี่ยนได้เฉพาะเมื่อไม่มีดีลอยู่ในขั้นนี้
 */
export async function updateStage(ctx: PipelinesCtx, actor: MemberActor, stageId: string, patch: StagePatch): Promise<StageDto> {
  const a = await enter(ctx, actor);
  const cur = await loadStage(ctx, stageId);
  const data: Prisma.CrmStageUpdateInput = {};
  if (patch?.name !== undefined && patch.name !== null) data.name = cleanName(patch.name, "ชื่อขั้น", 60);
  let kind = cur.kind;
  const kindChange = patch?.kind !== undefined && patch.kind !== null && cleanKind(patch.kind) !== cur.kind;
  if (kindChange) {
    kind = cleanKind(patch.kind);
    data.kind = kind;
  }
  if (patch?.probability !== undefined && patch.probability !== null) data.probability = cleanProbability(patch.probability, kind);
  if (patch?.staleDays !== undefined) data.staleDays = cleanStaleDays(patch.staleDays);
  if (patch?.requireFields !== undefined) data.requireFields = await cleanRequireFields(ctx, a, patch.requireFields);
  if (patch?.requireLines !== undefined && patch.requireLines !== null) data.requireLines = patch.requireLines === true;
  if (patch?.requireQuotation !== undefined && patch.requireQuotation !== null) data.requireQuotation = patch.requireQuotation === true;
  if (patch?.color !== undefined) data.color = cleanColor(patch.color);
  if (patch?.description !== undefined) data.description = cleanDescription(patch.description);
  // รีวิว C1.5 S7: เปลี่ยนชนิดของขั้น = นับดีลใน tx ใต้ล็อก pipeline + แถวขั้น (moveDeal อ่านชนิดของขั้นแบบ FOR SHARE ⇒ เรียงคิวกัน)
  //   ห้ามเปลี่ยนขั้นเปิดขั้นสุดท้ายเป็นชนะ/แพ้ (ดีลใหม่ต้องมีขั้นเริ่ม)
  const row = await prisma.$transaction(async (tx) => {
    if (kindChange) {
      await lockPipe(tx, ctx, cur.pipelineId);
      await tx.$queryRaw`SELECT "id" FROM "CrmStage" WHERE "id" = ${cur.id} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} FOR UPDATE`;
      const fresh = await tx.crmStage.findFirst({ where: { ...scope(ctx), id: cur.id } });
      if (!fresh) throw fail("NOT_FOUND", NOT_FOUND_STAGE);
      const n = await tx.crmDeal.count({ where: { ...scope(ctx), stageId: cur.id } });
      if (n > 0) throw fail("CONFLICT", `ขั้นนี้มีดีลอยู่ ${n.toLocaleString("th-TH")} ดีล จึงเปลี่ยนชนิด (เปิด/ชนะ/แพ้) ไม่ได้ — ย้ายดีลออกก่อน`);
      if (fresh.kind === "OPEN" && kind !== "OPEN") {
        const openLeft = await tx.crmStage.count({ where: { ...scope(ctx), pipelineId: cur.pipelineId, kind: "OPEN", id: { not: cur.id } } });
        if (openLeft === 0) throw fail("VALIDATION", "ขั้นนี้เป็นขั้นที่เปิดอยู่ขั้นสุดท้ายของ pipeline — ต้องเหลือขั้นเปิดอย่างน้อย 1 ขั้น (ดีลใหม่เริ่มที่ขั้นนั้น)");
      }
    }
    return tx.crmStage.update({ where: { id: cur.id }, data });
  });
  await audit(ctx, "crm.stage.update", "CrmStage", row.id, { before: stageDto(cur), after: stageDto(row) });
  return stageDto(row);
}

/** เรียงขั้นใหม่ (ต้องส่ง id ครบทุกขั้นของ pipeline) */
export async function reorderStages(ctx: PipelinesCtx, actor: MemberActor, pipelineId: string, ids: string[]): Promise<PipelineDto> {
  await enter(ctx, actor);
  const pipe = await loadPipe(ctx, pipelineId);
  const want = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  const have = pipe.stages.map((s) => s.id);
  if (want.length !== have.length || [...want].sort().join("|") !== [...have].sort().join("|")) throw fail("VALIDATION", "ลำดับขั้นไม่ครบ — รีเฟรชหน้าแล้วลองใหม่");
  await prisma.$transaction(want.map((id, i) => prisma.crmStage.update({ where: { id }, data: { sortOrder: i } })));
  await audit(ctx, "crm.stage.reorder", "CrmPipeline", pipe.id, { after: { order: want } });
  return toDto(await loadPipe(ctx, pipe.id));
}

/** ลบขั้น — เฉพาะเมื่อไม่มีดีลอยู่ในขั้นนี้ และ pipeline ยังเหลือขั้นที่เปิดอยู่ (ประวัติขั้นเดิมยังอยู่ — ไม่มี FK) */
export async function deleteStage(ctx: PipelinesCtx, actor: MemberActor, stageId: string): Promise<{ ok: true }> {
  await enter(ctx, actor);
  const cur = await loadStage(ctx, stageId);
  try {
    await prisma.$transaction(async (tx) => {
      await lockPipe(tx, ctx, cur.pipelineId);
      await tx.$queryRaw`SELECT "id" FROM "CrmStage" WHERE "id" = ${cur.id} AND "tenantId" = ${ctx.tenantId} AND "systemId" = ${ctx.systemId} FOR UPDATE`;
      const n = await tx.crmDeal.count({ where: { ...scope(ctx), stageId: cur.id } });
      if (n > 0) throw fail("CONFLICT", `ขั้นนี้มีดีลอยู่ ${n.toLocaleString("th-TH")} ดีล — ย้ายดีลไปขั้นอื่นก่อนแล้วค่อยลบ`);
      const openLeft = await tx.crmStage.count({ where: { ...scope(ctx), pipelineId: cur.pipelineId, kind: "OPEN", id: { not: cur.id } } });
      if (cur.kind === "OPEN" && openLeft === 0) throw fail("VALIDATION", "ต้องเหลือขั้นที่เปิดอยู่อย่างน้อย 1 ขั้นใน pipeline");
      // รีวิว C1.5 S7: ตัวชี้ "ย้ายไปขั้นนี้เมื่อลูกค้าตอบใบเสนอราคา" ของ pipeline ต้องไม่ชี้ขั้นที่ถูกลบ
      await tx.crmPipeline.updateMany({ where: { ...scope(ctx), stageOnQuoteAcceptedId: cur.id }, data: { stageOnQuoteAcceptedId: null } });
      await tx.crmPipeline.updateMany({ where: { ...scope(ctx), stageOnQuoteRejectedId: cur.id }, data: { stageOnQuoteRejectedId: null } });
      await tx.crmStage.delete({ where: { id: cur.id } });
    });
  } catch (e) {
    // ดีลถูกย้ายเข้าขั้นนี้พร้อมกัน (FK ของ CrmDeal.stageId) = ข้อความไทย ไม่ใช่ error ดิบ
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2003" || e.code === "P2014")) {
      throw fail("CONFLICT", "มีดีลเพิ่งถูกย้ายเข้าขั้นนี้พร้อมกัน จึงยังลบไม่ได้ — ย้ายดีลออกก่อนแล้วลองอีกครั้ง");
    }
    throw e;
  }
  await audit(ctx, "crm.stage.delete", "CrmStage", cur.id, { before: stageDto(cur) });
  return { ok: true };
}
