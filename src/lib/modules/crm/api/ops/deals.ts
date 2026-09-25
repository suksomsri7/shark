// ops/deals.ts — op ของดีลและ pipeline (ใบ C1.10 · CRM-API §2.3)
//
// 🔴 ไม่มี engine ที่สอง: ทุก op เรียกบริการ `deals.ts` / `pipelines.ts` ของใบ C1.5 เท่านั้น
//    (เงื่อนไขก่อนเข้าขั้น · เพดานส่วนลด → สายอนุมัติ `crm.discount` · ประวัติขั้น · event ภายใน tx = ของบริการทั้งหมด)
// AUDIT-CLASS X1: ดีล/ขั้น/pipeline/ผู้ติดต่อ/ทีม ที่ไม่ใช่ของระบบนี้ = 404 จากบริการ (dealWhere · loadPipeline)
// AUDIT-CLASS X9: delete = danger · APPROVAL_REQUIRED ของรายการสินค้า = 409 approval_required + approvalRequestId (ไม่มีอะไรถูกใช้จริง)

import { z } from "zod";
import * as deals from "../../deals";
import * as pipelines from "../../pipelines";
import { DEAL_SORTS, FORECAST_CATEGORIES, FORECAST_GROUPS } from "../../deals-shared";
import { crmActorOf, crmCtxOf } from "../actor";
import { approvalRequired } from "../http-errors";
import * as contacts from "../../contacts";
import { crmApiError } from "../http-errors";
import { assertNoTeamFilter, assertOwnerInFilter, teamInFilter } from "../filters";
import { defineCrmOp, type ApiOp } from "../op";
import { cursor, fieldsBag, flag, idStr, isOn, isoDate, optId, optText, reason, satang, tags, take, text } from "../schema";

const KINDS = ["OPEN", "WON", "LOST"] as const;

const listQuery = z
  .object({
    take,
    cursor,
    pipelineId: idStr.optional(),
    owner: text(64).optional(),
    team: text(64).optional(),
    stage: idStr.optional(),
    closeFrom: isoDate.optional(),
    closeTo: isoDate.optional(),
    stale: flag,
    tag: text(64).optional(),
    q: text(100).optional(),
    companyId: idStr.optional(),
    contactId: idStr.optional(),
    kind: z.enum(KINDS).optional(),
    sort: z.enum(DEAL_SORTS).optional(),
  })
  .strict();

const list = defineCrmOp({
  id: "deals.list",
  method: "GET",
  path: "/deals",
  kind: "read",
  action: "crm.deal.read",
  summary: "List the deals this key can see (all pipelines unless pipelineId is given), with filters and cursor paging.",
  label: "รายการดีล",
  input: listQuery,
  test: "C1.10-S2.6",
  async handler({ actor, input }) {
    const { take: n, stale, ...rest } = input;
    const r = await deals.listDeals(crmCtxOf(actor), crmActorOf(actor), { ...rest, stale: stale === undefined ? null : isOn(stale), pageSize: n ?? 50 });
    return { items: r.items, nextCursor: r.nextCursor };
  },
});

const board = defineCrmOp({
  id: "deals.board",
  method: "GET",
  path: "/deals/board",
  kind: "read",
  action: "crm.deal.read",
  summary: "The pipeline board: one column per stage with count, total and weighted value, and the deal cards in it.",
  label: "กระดานดีล",
  input: z.object({ pipelineId: idStr.optional(), owner: text(64).optional(), team: text(64).optional(), q: text(100).optional() }).strict(),
  tool: { name: "crm_pipeline_summary", hint: "Use to answer how the pipeline looks: deals per stage, totals and which deals are where." },
  test: "C1.10-X2.4",
  async handler({ actor, input }) {
    return deals.getBoard(crmCtxOf(actor), crmActorOf(actor), input);
  },
});

const forecast = defineCrmOp({
  id: "deals.forecast",
  method: "GET",
  path: "/deals/forecast",
  kind: "read",
  action: "crm.report.view",
  rate: "report",
  summary: "Forecast of open deals grouped by expected close month, owner or team, with weighted value.",
  label: "พยากรณ์ยอดขาย",
  input: z
    .object({ pipelineId: idStr.optional(), groupBy: z.enum(FORECAST_GROUPS).optional(), category: z.enum(FORECAST_CATEGORIES).optional(), from: isoDate.optional(), to: isoDate.optional() })
    .strict(),
  tool: { name: "crm_forecast", hint: "Use for questions about expected sales: this month, by owner or by team." },
  test: "C1.10-X7.2",
  async handler({ actor, input }) {
    return deals.forecast(crmCtxOf(actor), crmActorOf(actor), input);
  },
});

const get = defineCrmOp({
  id: "deals.get",
  method: "GET",
  path: "/deals/{id}",
  kind: "read",
  action: "crm.deal.read",
  summary: "One deal in full: stage and history, lines, documents, contacts, custom fields, timeline and linked task cards.",
  label: "ดีล 360",
  tool: { name: "crm_deal_360", hint: "Use to read everything about one deal before answering or proposing a change." },
  test: "C1.10-S6.2",
  async handler({ actor, params }) {
    return deals.getDeal360(crmCtxOf(actor), crmActorOf(actor), params.id ?? "");
  },
});

const line = z
  .object({
    name: text(200).min(1),
    qty: z.number().positive().max(999_999_999),
    unitPriceSatang: satang,
    discountBp: z.number().int().min(0).max(10_000).nullable().optional(),
    productId: optId,
    vatRateBp: z.number().int().min(0).max(10_000).nullable().optional(),
    note: optText(500),
  })
  .strict();

const create = defineCrmOp({
  id: "deals.create",
  method: "POST",
  path: "/deals",
  kind: "write",
  action: "crm.deal.create",
  summary: "Open a deal for a contact in a pipeline (first stage unless stageId is given). Value above 20,000,000 baht is refused.",
  label: "เปิดดีล",
  input: z
    .object({
      pipelineId: idStr,
      stageId: optId,
      title: text(200).min(1),
      contactId: idStr,
      companyId: optId,
      valueSatang: satang.nullable().optional(),
      lines: z.array(line).max(200).nullable().optional(),
      discountBp: z.number().int().min(0).max(10_000).nullable().optional(),
      expectedCloseAt: isoDate.nullable().optional(),
      ownerUserId: optId,
      collaboratorUserIds: z.array(idStr).max(20).nullable().optional(),
      forecastCategory: z.enum(FORECAST_CATEGORIES).nullable().optional(),
      probabilityOverride: z.number().int().min(0).max(100).nullable().optional(),
      nextStep: optText(500),
      fields: fieldsBag.nullable().optional(),
      tags: tags.nullable().optional(),
    })
    .strict(),
  tool: { name: "crm_create_deal", hint: "Use when the user wants to open a new deal; find the contact and pipeline first." },
  test: "C1.10-S2.4",
  async handler({ actor, input }) {
    // AUDIT-CLASS X1 ก่อน X2: ผู้ติดต่อนอกขอบเขต = 404 · แล้วค่อยตรวจว่าดีลใหม่ลงในตัวกรองของคีย์ได้ไหม
    if (!(await contacts.briefFor(crmCtxOf(actor), crmActorOf(actor), { contactId: input.contactId }))) throw crmApiError(404, "not_found", "ไม่พบผู้ติดต่อนี้ในระบบ CRM นี้", "The contact was not found in this CRM system.");
    assertNoTeamFilter(actor, "ดีล");
    assertOwnerInFilter(actor, input.ownerUserId ?? actor.userId ?? null);
    const deal = await deals.createDeal(crmCtxOf(actor), crmActorOf(actor), { ...input, sourceKind: "API" });
    return { dealId: deal.id, deal };
  },
});

const update = defineCrmOp({
  id: "deals.update",
  method: "PATCH",
  path: "/deals/{id}",
  kind: "write",
  action: "crm.deal.update",
  summary: "Change a deal's title, value, expected close date, probability, tags, next step, forecast category or custom fields.",
  label: "แก้ไขดีล",
  input: z
    .object({
      title: optText(200),
      expectedCloseAt: isoDate.nullable().optional(),
      valueSatang: satang.nullable().optional(),
      probabilityOverride: z.number().int().min(0).max(100).nullable().optional(),
      tags: tags.nullable().optional(),
      fields: fieldsBag.nullable().optional(),
      nextStep: optText(500),
      forecastCategory: z.enum(FORECAST_CATEGORIES).optional(),
    })
    .strict(),
  // CRM C2.11 ▸ B4 (ผู้ตรวจอิสระ 25 ก.ย.): ตัดคำว่า "next step" ออกจากคำใบ้ — ขั้นถัดไปมีประตูของตัวเองแล้ว
  //   (`crm_set_next_step` → `PUT /deals/{id}/next-step`) · สองประตูที่คำใบ้พูดเรื่องเดียวกัน = โมเดลเลือกสุ่ม
  //   ⇒ ช่อง `nextStep` ของ op นี้ยังรับได้เหมือนเดิม (ผู้เรียก REST แก้หลายช่องในคำขอเดียวได้) แต่ "ประตูที่ชัด" มีหนึ่งเดียว ◂
  tool: { name: "crm_update_deal", hint: "Use to change a deal's value, close date, owner or tags." },
  test: "C1.10-S2.3",
  async handler({ actor, params, input }) {
    const c = crmCtxOf(actor);
    const a = crmActorOf(actor);
    const id = params.id ?? "";
    const { nextStep, forecastCategory, ...core } = input;
    let deal = Object.keys(core).length > 0 || (nextStep === undefined && forecastCategory === undefined) ? await deals.updateDeal(c, a, id, core) : null;
    if (nextStep !== undefined) deal = await deals.setNextStep(c, a, id, nextStep);
    if (forecastCategory !== undefined) deal = await deals.setForecastCategory(c, a, id, forecastCategory);
    return { dealId: id, deal };
  },
});

const move = defineCrmOp({
  id: "deals.move",
  method: "PUT",
  path: "/deals/{id}/stage",
  kind: "write",
  action: "crm.deal.move",
  summary: "Move a deal to another stage of its pipeline. Missing stage requirements fail with 409 stage_requirements; a lost stage takes lostReasonId.",
  label: "ย้ายขั้นดีล",
  input: z
    .object({
      stageId: idStr,
      note: optText(2000),
      lostReasonId: optId,
      lostNote: optText(2000),
      requireFieldsValues: fieldsBag.nullable().optional(),
    })
    .strict(),
  tool: { name: "crm_move_deal", hint: "Use when a deal progresses, is won or is lost; read crm_deal_360 first to pick the stage id." },
  test: "C1.10-S4.1",
  async handler({ actor, params, input }) {
    const deal = await deals.moveDeal(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", input);
    return { dealId: deal.id, deal };
  },
});

const reassign = defineCrmOp({
  id: "deals.reassign",
  method: "PUT",
  path: "/deals/{id}/owner",
  kind: "write",
  action: "crm.deal.reassign",
  summary: "Give the deal to another owner, optionally in another team.",
  label: "โอนดีล",
  input: z.object({ ownerUserId: idStr.nullable(), teamId: optId }).strict(),
  test: "C1.10-S4.4",
  async handler({ actor, params, input }) {
    assertOwnerInFilter(actor, input.ownerUserId);
    const teamId = teamInFilter(actor, input.teamId ?? null);
    const deal = await deals.reassignDeal(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", { ...input, ...(teamId !== undefined ? { teamId } : {}) });
    return { dealId: deal.id, deal };
  },
});

const setLines = defineCrmOp({
  id: "deals.lines.set",
  method: "PUT",
  path: "/deals/{id}/lines",
  kind: "write",
  action: "crm.deal.lines",
  summary: "Replace the product lines of a deal; the deal value is recalculated. A discount above the shop's cap waits for approval (409 approval_required).",
  label: "ตั้งรายการสินค้าในดีล",
  input: z.object({ lines: z.array(line).max(200), discountBp: z.number().int().min(0).max(10_000).nullable().optional() }).strict(),
  test: "C1.10-S4.2",
  async handler({ actor, params, input }) {
    const r = await deals.setLines(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", input);
    if (r.status === "APPROVAL_REQUIRED") {
      // ไม่มีอะไรถูกใช้จริง — รายการรออยู่ใน pendingLines จนกว่าสายอนุมัติ crm.discount จะตัดสิน
      throw approvalRequired("ส่วนลดเกินเพดานของร้าน — ส่งคำขออนุมัติแล้ว รายการสินค้าจะมีผลเมื่ออนุมัติ", r.approvalRequestId);
    }
    return { dealId: r.deal.id, status: r.status, deal: r.deal };
  },
});

const quote = defineCrmOp({
  id: "deals.quote",
  method: "POST",
  path: "/deals/{id}/quotation",
  kind: "write",
  action: "crm.deal.quote",
  summary: "Issue a quotation in the accounting book from the deal's lines (a repeat call returns the same document).",
  label: "ออกใบเสนอราคาจากดีล",
  input: z.object({ validDays: z.number().int().min(1).max(365).nullable().optional(), note: optText(2000) }).strict(),
  test: "C1.10-S2.3",
  async handler({ actor, params, input }) {
    const r = await deals.issueQuotation(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", input);
    return { dealId: params.id ?? "", documentId: r.docId, created: r.created };
  },
});

const del = defineCrmOp({
  id: "deals.delete",
  method: "DELETE",
  path: "/deals/{id}",
  kind: "danger",
  action: "crm.deal.delete",
  summary: "Delete a deal for good. Needs confirm: true and a reason.",
  label: "ลบดีล",
  input: z.object({ reason }).strict(),
  test: "C1.10-X9.2",
  async handler({ actor, params, input }) {
    await deals.deleteDeal(crmCtxOf(actor), crmActorOf(actor), params.id ?? "", { confirm: true, reason: input.reason });
    return { dealId: params.id ?? "", deleted: true };
  },
});

const pipelinesList = defineCrmOp({
  id: "pipelines.list",
  method: "GET",
  path: "/pipelines",
  kind: "read",
  action: "crm.deal.read",
  summary: "The pipelines of this CRM system with their stages (id, name, kind, probability, requirements) and open deal counts.",
  label: "pipeline และขั้น",
  input: z.object({ includeArchived: flag }).strict(),
  test: "C1.10-S0.3",
  async handler({ actor, input }) {
    const items = await pipelines.listPipelines(crmCtxOf(actor), crmActorOf(actor), { includeArchived: isOn(input.includeArchived) });
    return { items };
  },
});

export const DEALS_OPS: ApiOp[] = [list, board, forecast, pipelinesList, get, create, update, move, reassign, setLines, quote, del];
