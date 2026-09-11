// ops/segments.ts — op ของ "กลุ่มลูกค้า" (MEMBER-API §2.13 · M3.10 · บริการ M3.1 `member/segments.ts`)
//
// 🔴 นิยามกลุ่มรับได้ 2 รูป (ผู้เชื่อมต่อ/ผู้ช่วย AI เขียนรูปสั้นบ่อยกว่า):
//      `{ groups: [{ conditions: [...] }] }`  (รูปเต็มของเอนจิน — กลุ่มต่อกันด้วย OR · เงื่อนไขในกลุ่มต่อด้วย AND)
//      `[{ field, op, value }, ...]`         (รูปสั้น = กลุ่มเดียว เงื่อนไขทั้งหมด AND กัน)
//    และค่าของฟิลด์ตัวเลือก (ระดับ · เพศ · ช่องทาง …) เทียบแบบไม่สนตัวพิมพ์ (`GOLD` = `gold`)
//    ⇒ แปลงที่ชั้น op ครั้งเดียว เอนจินได้รูปเต็มเสมอ (ห้ามให้เอนจินเดาเอง — ข้อความ error ของเอนจินพูดถึงรูปเต็ม)
// 🔴 อ่าน = `member.promo.read` · บันทึก/ลบ = `member.promo.manage` · กลุ่มส่วนตัวของคนอื่น = ไม่พบ (404)

import { z } from "zod";
import * as segments from "../../segments";
import type { MemberCtx } from "../../profile";
import { memberActorOf, memberCtxOf } from "../actor";
import { badRequest } from "../http-errors";
import { defineMemberOp, type ApiOp } from "../op";
import { jsonSafe } from "../serialize";

const TEST = "M3.10-S3.1";

const conditionSchema = z
  .object({
    field: z.string().trim().min(1).max(80).describe("Field key from GET /segments/fields, for example `tier`, `points`, `inactiveDays` or a custom field `f.<key>`."),
    op: z.enum(segments.SEGMENT_OPS).describe("Operator allowed for that field (see `ops` in GET /segments/fields)."),
    value: z.unknown().optional().describe("Value to compare with. Lists for `in` / `nin` / `hasAny` / `hasAll`."),
  })
  .strict();

const definitionSchema = z
  .union([
    z.object({ groups: z.array(z.object({ conditions: z.array(conditionSchema).max(20) }).strict()).max(10) }).strict(),
    z.array(conditionSchema).max(20),
  ])
  .describe("Either `{ groups: [{ conditions: [...] }] }` (groups are OR-ed, conditions inside a group are AND-ed) or a plain list of conditions (one group). `{ groups: [] }` means every member.");

type RawDefinition = z.infer<typeof definitionSchema>;

/** รูปสั้น/ตัวพิมพ์ → รูปเต็มของเอนจิน (ค่าตัวเลือกที่ตรงแบบไม่สนตัวพิมพ์ = ใช้ค่าจริงของร้าน) */
async function normalizeDefinition(ctx: MemberCtx, raw: RawDefinition): Promise<segments.SegmentDefinition> {
  const groups = Array.isArray(raw) ? [{ conditions: raw }] : raw.groups;
  const defs = await segments.listSegmentFields(ctx);
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const fix = (field: string, v: unknown): unknown => {
    const opts = byKey.get(field)?.options;
    if (!opts || opts.length === 0 || typeof v !== "string") return v;
    if (opts.some((o) => o.value === v)) return v;
    const hit = opts.find((o) => o.value.toLowerCase() === v.trim().toLowerCase() || o.label.trim().toLowerCase() === v.trim().toLowerCase());
    return hit ? hit.value : v;
  };
  const out: segments.SegmentDefinition = {
    groups: groups.map((g) => ({
      conditions: g.conditions.map((c) => {
        if (!byKey.has(c.field)) {
          throw badRequest(
            `ไม่รู้จักเงื่อนไข "${c.field}" — ดูรายชื่อที่ใช้ได้จาก GET /segments/fields`,
            `Unknown segment field "${c.field}". See GET /segments/fields.`,
            [{ path: "definition", message: `ไม่รู้จักฟิลด์ ${c.field}` }],
          );
        }
        const value = Array.isArray(c.value) ? c.value.map((x) => fix(c.field, x)) : fix(c.field, c.value);
        return { field: c.field, op: c.op, ...(c.value !== undefined ? { value } : {}) };
      }),
    })),
  };
  return out;
}

const fieldsList = defineMemberOp({
  id: "segments.fields",
  method: "GET",
  path: "/segments/fields",
  kind: "read",
  action: "member.promo.read",
  summary: "Everything a segment condition can test: system fields (tier, points, days since last visit, spend, visits, vouchers, consent, source, branch, tags) and the shop's filterable custom fields, each with its allowed operators and choices.",
  label: "เงื่อนไขที่ใช้สร้างกลุ่มลูกค้าได้",
  test: TEST,
  async handler({ actor }) {
    const items = await segments.listSegmentFields(memberCtxOf(actor));
    return jsonSafe({ items, total: items.length });
  },
});

const list = defineMemberOp({
  id: "segments.list",
  method: "GET",
  path: "/segments",
  kind: "read",
  action: "member.promo.read",
  summary: "Saved customer segments this key can see (team segments, newest first), each with its definition, a Thai one-line summary and the member count from its last save.",
  label: "กลุ่มลูกค้าที่บันทึกไว้",
  tool: { name: "segment_list", hint: "Use to find a saved target group before drafting a campaign." },
  test: TEST,
  async handler({ actor }) {
    const items = await segments.listSegments(memberCtxOf(actor), memberActorOf(actor));
    return jsonSafe({ items, total: items.length });
  },
});

const get = defineMemberOp({
  id: "segments.get",
  method: "GET",
  path: "/segments/{id}",
  kind: "read",
  action: "member.promo.read",
  summary: "One saved segment with its definition and summary. A private segment of another person answers 404.",
  label: "ดูกลุ่มลูกค้า",
  test: TEST,
  async handler({ actor, params }) {
    return jsonSafe(await segments.getSegment(memberCtxOf(actor), memberActorOf(actor), params.id ?? ""));
  },
});

const saveSchema = z
  .object({
    name: z.string().trim().min(1).max(120).describe("What the group is for, as the team will read it."),
    definition: definitionSchema,
    scope: z.enum(["TEAM", "PRIVATE"]).optional().describe("TEAM (default) is visible to everyone who may read promotions; PRIVATE only to its owner."),
  })
  .strict();

const create = defineMemberOp({
  id: "segments.create",
  method: "POST",
  path: "/segments",
  kind: "write",
  action: "member.promo.manage",
  summary: "Save a customer segment. The member count is taken at save time and shown in lists; campaigns re-evaluate the definition when they are built.",
  label: "บันทึกกลุ่มลูกค้า",
  input: saveSchema,
  tool: { name: "segment_save", hint: "Save a target group the owner described, after segment_count confirmed the size." },
  test: TEST,
  async handler({ actor, input }) {
    const ctx = memberCtxOf(actor);
    const definition = await normalizeDefinition(ctx, input.definition);
    return jsonSafe(await segments.saveSegment(ctx, memberActorOf(actor), { name: input.name, definition, scope: input.scope ?? "TEAM" }));
  },
});

const update = defineMemberOp({
  id: "segments.update",
  method: "PATCH",
  path: "/segments/{id}",
  kind: "write",
  action: "member.promo.manage",
  summary: "Rename a segment, change its conditions or its visibility. Fields you leave out keep their value; the member count is refreshed.",
  label: "แก้กลุ่มลูกค้า",
  input: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      definition: definitionSchema.optional(),
      scope: z.enum(["TEAM", "PRIVATE"]).optional(),
    })
    .strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    const ctx = memberCtxOf(actor);
    const who = memberActorOf(actor);
    const cur = await segments.getSegment(ctx, who, params.id ?? "");
    const definition = input.definition ? await normalizeDefinition(ctx, input.definition) : cur.definition;
    return jsonSafe(
      await segments.saveSegment(ctx, who, { id: cur.id, name: input.name ?? cur.name, definition, scope: input.scope ?? cur.scope }),
    );
  },
});

const remove = defineMemberOp({
  id: "segments.delete",
  method: "DELETE",
  path: "/segments/{id}",
  kind: "danger",
  action: "member.promo.manage",
  summary: "Delete a saved segment. Campaigns already built from it keep their frozen audience; journeys never referenced it by id.",
  label: "ลบกลุ่มลูกค้า",
  input: z.object({ reason: z.string().trim().min(5).max(500) }).strict(),
  test: TEST,
  async handler({ actor, params }) {
    return jsonSafe(await segments.deleteSegment(memberCtxOf(actor), memberActorOf(actor), params.id ?? ""));
  },
});

const count = defineMemberOp({
  id: "segments.count",
  method: "POST",
  path: "/segments/count",
  kind: "read",
  action: "member.promo.read",
  rate: "report",
  summary: "How many members match a definition right now, their average 12 month spend in satang and up to 5 sample members (masked phone). Nothing is saved; POST only because a definition can be long.",
  label: "นับคนในกลุ่ม",
  input: z.object({ definition: definitionSchema }).strict(),
  tool: { name: "segment_count", hint: "Always count a group before proposing a campaign or a voucher run, and tell the owner the number." },
  test: TEST,
  async handler({ actor, input }) {
    const ctx = memberCtxOf(actor);
    const definition = await normalizeDefinition(ctx, input.definition);
    const res = await segments.countSegment(ctx, memberActorOf(actor), definition);
    return jsonSafe({ count: res.count, avgSpend12mSatang: res.avgSpend12mSatang, sample: res.sample.slice(0, 5) });
  },
});

const members = defineMemberOp({
  id: "segments.members",
  method: "GET",
  path: "/segments/{id}/members",
  kind: "read",
  action: "member.promo.read",
  summary: "Members of a saved segment, most recently active first, as card-sized rows. Page with `cursor` (the `nextCursor` of the previous reply).",
  label: "รายชื่อในกลุ่มลูกค้า",
  input: z
    .object({
      take: z.coerce.number().int().min(1).max(50).optional().describe("Rows per page, 1-50 (default 20)."),
      cursor: z.string().trim().max(40).optional(),
    })
    .strict(),
  test: TEST,
  async handler({ actor, params, input }) {
    const res = await segments.segmentMembers(memberCtxOf(actor), memberActorOf(actor), params.id ?? "", {
      take: input.take ?? 20,
      cursor: input.cursor ?? null,
    });
    return jsonSafe(res);
  },
});

export const SEGMENTS_OPS: ApiOp[] = [fieldsList, list, get, create, update, remove, count, members];
