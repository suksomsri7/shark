// ops/members.ts — op ของ "สมาชิก" (MEMBER-API §2.1 · M1.11)
//
// 🔴 ทุก handler เรียก **บริการของโมดูล** เท่านั้น (profile / list / activity / import) ห้ามยิง prisma เอง:
//    ด่านสิทธิ์ · กติกา 404-not-403 · การซ่อนข้อมูลอ่อนไหว · การเขียนไทม์ไลน์/audit/event
//    อยู่ในบริการเหล่านั้นแล้ว — ถ้า op ยิง query เอง วันหนึ่งจะมีทางที่ข้ามด่านไปเงียบ ๆ
// 🔴 ค่าที่ตอบกลับต้องผ่าน `jsonSafe()` เสมอ (Date → ISO · ไม่มี tenantId/systemId หลุด)

import { z } from "zod";
import { csvRow } from "@/lib/core/csv";
import { ApiError } from "@/lib/api/respond";
import { listActivity } from "../../activity";
import * as importer from "../../import";
import { linkIdentityToMember } from "../../identities";
import { exportMembers, listMembers, type ListMembersOptions, type MemberSort } from "../../list";
import * as profile from "../../profile";
import { memberActorOf, memberCtxOf } from "../actor";
import { identityRow, jsonSafe } from "../serialize";
import { defineMemberOp, type ApiOp } from "../op";

// ── ตัวช่วยที่ใช้ร่วมกันในไฟล์นี้ ────────────────────────────────────────────
const idParam = (v: string | undefined, what = "สมาชิก"): string => {
  const s = (v ?? "").trim();
  if (!s) throw new ApiError(404, "not_found", `ไม่พบ${what}คนนี้ในระบบสมาชิกที่เปิดอยู่`, "The record was not found.");
  return s;
};

const SORTS = ["-lastActivityAt", "name", "-spent12m", "-points", "memberCode", "-createdAt"] as const;
const STATUSES = ["ACTIVE", "SUSPENDED", "CLOSED", "MERGED"] as const;
const SOURCES = [
  "WALK_IN", "POS", "BOOKING", "LINE_OA", "LIFF", "WEB_FORM", "CHAT",
  "REFERRAL", "IMPORT", "CRM", "CAMPAIGN", "API", "MARKETPLACE", "APP", "OTHER",
] as const;

/** ค่าฟิลด์กำหนดเอง — ชนิดตามที่ฟิลด์นั้นกำหนด (บริการตรวจให้อีกชั้นพร้อมข้อความไทยรายช่อง) */
const fieldValues = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]))
  .describe("Custom field values keyed by field key, as listed by GET /fields/layout.");

// ═══════════════════════════ อ่าน ═══════════════════════════

const listInput = z
  .object({
    q: z.string().trim().max(120).optional().describe("Free text over name, member code, phone and email."),
    tier: z.string().trim().max(40).optional().describe("Tier key (for example `gold`) or tier id."),
    unit: z.string().trim().max(40).optional().describe("Business unit id of the member's home branch."),
    tag: z.string().trim().max(40).optional().describe("One tag the member must carry."),
    source: z.enum(SOURCES).optional().describe("How the member first reached the shop."),
    status: z.enum(STATUSES).optional().describe("Default: everybody except merged records."),
    viewId: z.string().trim().max(40).optional().describe("Apply a saved view's filters and sort; anything you send here wins over the view."),
    sort: z.enum(SORTS).optional().describe("Default `-lastActivityAt` (most recently active first)."),
    page: z.coerce.number().int().min(1).optional().describe("1 based page number. Default 1."),
    take: z.coerce.number().int().min(1).max(100).optional().describe("Rows per page, 1-100. Default 50."),
  })
  .catchall(z.string())
  .describe("Custom field filters are passed as `f.<field key>=<value>` on top of these.");

/** `f.<key>=value` ใน query string → ตัวกรองฟิลด์กำหนดเองของ `listMembers` */
function customFieldFilters(input: Record<string, unknown>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!k.startsWith("f.") || typeof v !== "string") continue;
    out[k.slice(2)] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function listOptionsOf(input: Record<string, unknown>): ListMembersOptions {
  const f = customFieldFilters(input);
  return {
    ...(typeof input.q === "string" ? { q: input.q } : {}),
    ...(typeof input.tier === "string" ? { tier: input.tier } : {}),
    ...(typeof input.unit === "string" ? { unit: input.unit } : {}),
    ...(typeof input.tag === "string" ? { tag: input.tag } : {}),
    ...(typeof input.source === "string" ? { source: input.source } : {}),
    ...(typeof input.status === "string" ? { status: input.status } : {}),
    ...(typeof input.viewId === "string" ? { viewId: input.viewId } : {}),
    ...(typeof input.sort === "string" ? { sort: input.sort as MemberSort } : {}),
    ...(typeof input.page === "number" ? { page: input.page } : {}),
    ...(typeof input.take === "number" ? { take: input.take } : {}),
    ...(f ? { f } : {}),
  };
}

type ListPayload = { items: unknown[]; total: number; page: number; take: number };

const membersList = defineMemberOp({
  id: "members.list",
  method: "GET",
  path: "/members",
  kind: "read",
  action: "member.customer.read",
  summary:
    "Members of this system with the columns the shop chose for its list view: member code, display name, masked phone, tier, points, 12 month spend, visits, tags and the custom fields flagged 'show in list'.",
  label: "รายชื่อสมาชิก",
  tool: { name: "member_list", hint: "Use this to answer 'how many members', 'who is gold', 'members of the Patong branch'." },
  input: listInput,
  test: "M1.11-S2.2",
  csv: (_ctx, data) => {
    const payload = data as ListPayload;
    const rows = Array.isArray(payload?.items) ? (payload.items as Record<string, unknown>[]) : [];
    const head = csvRow(["memberCode", "name", "phoneMasked", "tier", "points", "spent12mSatang", "visits12m", "tags"]);
    const body = rows.map((r) =>
      csvRow([
        String(r.memberCode ?? ""),
        String(r.name ?? ""),
        String(r.phoneMasked ?? ""),
        String((r.tier as { key?: string } | null)?.key ?? ""),
        Number(r.points ?? 0),
        Number(r.spent12mSatang ?? 0),
        Number(r.visits12m ?? 0),
        Array.isArray(r.tags) ? r.tags.join(" ") : "",
      ]),
    );
    return [head, ...body].join("\n");
  },
  async handler({ actor, input }) {
    const res = await listMembers(memberCtxOf(actor), memberActorOf(actor), listOptionsOf(input as Record<string, unknown>));
    return jsonSafe(res);
  },
});

const membersSearch = defineMemberOp({
  id: "members.search",
  method: "GET",
  path: "/members/search",
  kind: "read",
  action: "member.customer.read",
  summary: "Quick lookup by name, member code, phone or email. Use it to turn something a person typed into a member id.",
  label: "ค้นหาสมาชิกแบบเร็ว",
  tool: { name: "member_search", hint: "Use this first whenever the user names a customer; it returns the member id every other tool needs." },
  input: z
    .object({
      q: z.string().trim().min(2).max(120).describe("At least 2 characters: part of a name, a member code, a phone number or an email."),
      take: z.coerce.number().int().min(1).max(20).optional().describe("How many matches to return, 1-20. Default 10."),
    })
    .strict(),
  test: "M1.11-S2.11",
  async handler({ actor, input }) {
    const res = await listMembers(memberCtxOf(actor), memberActorOf(actor), { q: input.q, take: input.take ?? 10 });
    return jsonSafe({ items: res.items, total: res.total });
  },
});

const membersBrief = defineMemberOp({
  id: "members.brief",
  method: "GET",
  path: "/members/brief",
  kind: "read",
  action: "member.customer.read",
  summary: "Name, tier, points and masked phone for up to 100 members at once. Use it to label ids you already hold.",
  label: "การ์ดย่อของสมาชิกหลายคน",
  input: z
    .object({
      ids: z.string().trim().min(1).max(4000).describe("Member ids separated by commas, at most 100."),
    })
    .strict(),
  test: "M1.11-S2.11",
  async handler({ actor, input }) {
    const ids = input.ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length > 100) {
      throw new ApiError(422, "validation", "ขอการ์ดย่อได้ครั้งละไม่เกิน 100 คน — แบ่งเป็นหลายรอบ", "At most 100 ids per call.");
    }
    const items = await profile.briefFor(memberCtxOf(actor), memberActorOf(actor), ids);
    return jsonSafe({ items, total: items.length });
  },
});

const membersGet = defineMemberOp({
  id: "members.get",
  method: "GET",
  path: "/members/{id}",
  kind: "read",
  action: "member.customer.read",
  summary:
    "The full member profile: system fields, every custom field section, 12 month stats, tier with progress to the next one, linked channels, consents and attribution. Sensitive sections come back as `visible: false` with no values unless the key holds the admin bundle and the shop's policy allows it.",
  label: "โปรไฟล์สมาชิก",
  tool: { name: "member_get", hint: "Use this after member_search when the user asks about one specific customer." },
  test: "M1.11-S2.3",
  async handler({ actor, params }) {
    const res = await profile.getMember360(memberCtxOf(actor), memberActorOf(actor), idParam(params.id));
    return jsonSafe(res);
  },
});

const membersActivity = defineMemberOp({
  id: "members.activity",
  method: "GET",
  path: "/members/{id}/activity",
  kind: "read",
  action: "member.customer.read",
  summary: "Timeline of one member, newest first: purchases, appointments, tier changes, imports and anything else a module recorded.",
  label: "ไทม์ไลน์ของสมาชิก",
  tool: { name: "member_activity", hint: "Use this to answer 'what happened with this customer lately'." },
  input: z
    .object({
      module: z.string().trim().max(40).optional().describe("Only events from one module, for example `pos` or `booking`."),
      type: z.string().trim().max(40).optional().describe("Only one event type, for example `VISIT`."),
      unit: z.string().trim().max(40).optional().describe("Only events recorded at one business unit."),
      from: z.string().trim().max(40).optional().describe("ISO-8601 instant; events at or after it."),
      to: z.string().trim().max(40).optional().describe("ISO-8601 instant; events at or before it."),
      take: z.coerce.number().int().min(1).max(100).optional().describe("Rows per page, 1-100. Default 20."),
      cursor: z.string().trim().max(40).optional().describe("Value of `nextCursor` from the previous page."),
    })
    .strict(),
  test: "M1.11-S2.11",
  async handler({ actor, params, input }) {
    const when = (v: string | undefined): Date | null => {
      if (!v) return null;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        throw new ApiError(422, "validation", "รูปแบบวันเวลาไม่ถูกต้อง — ใช้รูปแบบ ISO-8601 เช่น 2026-09-01T00:00:00.000Z", "Invalid ISO-8601 instant.");
      }
      return d;
    };
    const res = await listActivity(memberCtxOf(actor), memberActorOf(actor), idParam(params.id), {
      module: input.module ?? null,
      type: input.type ?? null,
      unitId: input.unit ?? null,
      from: when(input.from),
      to: when(input.to),
      ...(input.take ? { take: input.take } : {}),
      cursor: input.cursor ?? null,
    });
    return jsonSafe(res);
  },
});

const membersIdentitiesList = defineMemberOp({
  id: "members.identities.list",
  method: "GET",
  path: "/members/{id}/identities",
  kind: "read",
  action: "member.customer.read",
  summary: "Outside channels linked to this member (LINE, WhatsApp, a marketplace account). Identifiers come back masked.",
  label: "ช่องทางที่ผูกกับสมาชิก",
  test: "M1.11-S2.8",
  async handler({ actor, params }) {
    const id = idParam(params.id);
    // เห็นคนนี้ไหมก่อน (ขอบเขตสาขา/ร้าน) — ไม่เห็น = 404 เหมือนทุกทาง
    const [brief] = await profile.briefFor(memberCtxOf(actor), memberActorOf(actor), [id]);
    if (!brief) throw new ApiError(404, "not_found", "ไม่พบสมาชิกคนนี้ในระบบสมาชิกที่เปิดอยู่", "Member not found.");
    const rows = await profile.listIdentities(memberCtxOf(actor), id);
    return { items: rows.map(identityRow), total: rows.length };
  },
});

const membersDuplicates = defineMemberOp({
  id: "members.duplicates.list",
  method: "GET",
  path: "/members/duplicates",
  kind: "read",
  action: "member.customer.merge",
  summary: "Pairs of members the system believes are the same person, newest first, with the reason and a confidence score.",
  label: "รายการคนซ้ำ",
  tool: { name: "member_duplicates", hint: "Use this to answer 'do we have duplicate customers' before proposing a merge." },
  input: z
    .object({ status: z.enum(["OPEN", "MERGED", "DISMISSED"]).optional().describe("Default OPEN (still waiting for a decision).") })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, input }) {
    const pairs = await profile.findDuplicates(memberCtxOf(actor), memberActorOf(actor), {
      ...(input.status ? { status: input.status } : {}),
    });
    return jsonSafe({ items: pairs, total: pairs.length });
  },
});

const membersDuplicatesCompare = defineMemberOp({
  id: "members.duplicates.compare",
  method: "GET",
  path: "/members/duplicates/{pairId}",
  kind: "read",
  action: "member.customer.merge",
  summary: "One duplicate pair side by side, so a human (or an agent asking one) can decide which value to keep before merging.",
  label: "เปรียบเทียบคนซ้ำ",
  test: "M1.11-S1.2",
  async handler({ actor, params }) {
    const pairId = idParam(params.pairId, "คู่ที่อาจซ้ำ");
    const ctx = memberCtxOf(actor);
    const me = memberActorOf(actor);
    const pair = (await profile.findDuplicates(ctx, me, { status: "OPEN" })).find((p) => p.id === pairId);
    if (!pair) {
      throw new ApiError(404, "not_found", "ไม่พบคู่ที่อาจซ้ำคู่นี้ (อาจถูกตัดสินไปแล้ว)", "Duplicate pair not found.");
    }
    const [a, b] = await Promise.all([
      profile.getMember360(ctx, me, pair.a.id),
      profile.getMember360(ctx, me, pair.b.id),
    ]);
    return jsonSafe({ pair, a, b });
  },
});

// ═══════════════════════════ เขียน ═══════════════════════════

const createInput = z
  .object({
    phone: z.string().trim().max(30).nullish().describe("Thai mobile number. At least one of phone, email or an identity is needed."),
    email: z.string().trim().max(160).nullish(),
    firstName: z.string().trim().max(80).nullish(),
    lastName: z.string().trim().max(80).nullish(),
    name: z.string().trim().max(160).nullish().describe("Full display name, when first and last are not known separately."),
    nickname: z.string().trim().max(80).nullish(),
    birthDate: z.string().trim().max(30).nullish().describe("Date of birth as YYYY-MM-DD."),
    gender: z.string().trim().max(20).nullish(),
    fields: fieldValues.optional(),
    consents: z
      .array(z.object({ channel: z.string().trim().max(30), granted: z.boolean(), source: z.string().trim().max(30).optional() }).strict())
      .max(20)
      .optional()
      .describe("Marketing consent per channel, using the keys from GET /channels."),
    source: z.enum(SOURCES).describe("How this person reached the shop. An API key that does not know should send API."),
    sourceDetail: z.record(z.string(), z.string()).optional().describe("Free form detail of the source, for example { linkCode: 'fb-sep' }."),
    sourceChannel: z.string().trim().max(30).nullish().describe("Channel key from GET /channels, when the source is a channel."),
    referralCode: z.string().trim().max(40).nullish().describe("Referral code of the member who introduced this person."),
    homeUnitId: z.string().trim().max(40).nullish().describe("Business unit id of the branch this member belongs to."),
    tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  })
  .strict();

const membersCreate = defineMemberOp({
  id: "members.create",
  method: "POST",
  path: "/members",
  kind: "write",
  action: "member.customer.create",
  summary:
    "Register a member. A phone or email that already belongs to somebody in this system returns that person instead of creating a second record (`created: false` plus their card).",
  label: "สมัครสมาชิก",
  tool: { name: "member_register", hint: "Use this when the user asks to sign somebody up as a member." },
  // 🔴 คีย์กันซ้ำเป็นตัวระบุ "ความพยายามสมัครครั้งนั้น" ล้วน ๆ (ไม่ผสมเนื้อคำขอ) — เพราะชั้นบริการ
  //    `createMember` ตรวจ `idempotencyKey` เป็นลำดับแรกอยู่แล้ว (พิมพ์เขียว §5.2) ถ้าสองชั้นนิยาม
  //    ไม่ตรงกัน ฟอร์มสมัครที่เน็ตหลุดแล้วส่งใหม่โดยกรอกไม่ครบเท่าเดิมจะได้ 409 แล้วผู้เชื่อมต่อ
  //    จะเลี่ยงด้วยการยิงคีย์ใหม่ ซึ่งสร้างสมาชิกซ้ำจริง ๆ (ดู `src/lib/api/op.ts#idempotency`)
  idempotency: "key",
  input: createInput,
  test: "M1.11-S2.4",
  async handler({ actor, input, idempotencyKey }) {
    const res = await profile.createMember(memberCtxOf(actor), memberActorOf(actor), {
      ...input,
      // ที่มาแบบละเอียด: บันทึกชื่อคีย์ไว้เสมอ ⇒ ย้อนอ่านได้ว่า "แอปไหนพาคนนี้เข้ามา"
      sourceDetail: { ...(input.sourceDetail ?? {}), apiKeyName: actor.keyName },
      idempotencyKey: idempotencyKey ?? null,
    });
    return jsonSafe(res);
  },
});

const membersUpdate = defineMemberOp({
  id: "members.update",
  method: "PATCH",
  path: "/members/{id}",
  kind: "write",
  action: "member.customer.update",
  summary: "Change a member: system fields and custom fields in `fields`, plus tags, owner and home branch. Only what you send is touched.",
  label: "แก้ไขข้อมูลสมาชิก",
  tool: { name: "member_update", hint: "Use this to correct a customer's details or fill in a custom field." },
  input: z
    .object({
      fields: fieldValues.optional().describe("System fields (firstName, phone, ...) and custom fields, all keyed by field key."),
      tags: z.array(z.string().trim().min(1).max(40)).max(30).optional().describe("Replaces the whole tag list. Use PUT /tags to add or remove single tags."),
      status: z.enum(STATUSES).optional(),
      ownerUserId: z.string().trim().max(40).nullish(),
      homeUnitId: z.string().trim().max(40).nullish(),
    })
    .strict(),
  test: "M1.11-S2.6",
  async handler({ actor, params, input }) {
    const res = await profile.updateMember(memberCtxOf(actor), memberActorOf(actor), idParam(params.id), input);
    return jsonSafe(res);
  },
});

const membersSetStatus = defineMemberOp({
  id: "members.setStatus",
  method: "PUT",
  path: "/members/{id}/status",
  kind: "write",
  action: "member.customer.update",
  summary: "Suspend, close or reopen a membership. The reason is written to the member's timeline.",
  label: "เปลี่ยนสถานะสมาชิก",
  input: z
    .object({
      status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]),
      reason: z.string().trim().max(200).optional().describe("Shown on the member's timeline next to the change."),
    })
    .strict(),
  test: "M1.11-S2.6",
  async handler({ actor, params, input }) {
    const res = await profile.setStatus(memberCtxOf(actor), memberActorOf(actor), idParam(params.id), input.status, input.reason);
    return jsonSafe(res);
  },
});

const membersSetTags = defineMemberOp({
  id: "members.setTags",
  method: "PUT",
  path: "/members/{id}/tags",
  kind: "write",
  action: "member.customer.update",
  summary: "Add and remove tags on one member in a single call. Existing tags keep their order.",
  label: "ตั้งแท็กสมาชิก",
  tool: { name: "member_set_tags", hint: "Use this to mark a customer, for example as vip or as a lapsed diver." },
  input: z
    .object({
      add: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
      remove: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    })
    .strict(),
  test: "M1.11-S2.6",
  async handler({ actor, params, input }) {
    const res = await profile.setTags(memberCtxOf(actor), memberActorOf(actor), idParam(params.id), input);
    return jsonSafe(res);
  },
});

const membersSetOwner = defineMemberOp({
  id: "members.setOwner",
  method: "PUT",
  path: "/members/{id}/owner",
  kind: "write",
  action: "member.customer.update",
  summary: "Set or clear the staff member who looks after this customer. Send `ownerUserId: null` to clear it.",
  label: "ตั้งผู้ดูแลสมาชิก",
  input: z.object({ ownerUserId: z.string().trim().max(40).nullable() }).strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    const res = await profile.setOwner(memberCtxOf(actor), memberActorOf(actor), idParam(params.id), input.ownerUserId);
    return jsonSafe(res);
  },
});

const membersDuplicatesDismiss = defineMemberOp({
  id: "members.duplicates.dismiss",
  method: "POST",
  path: "/members/duplicates/{pairId}/dismiss",
  kind: "write",
  action: "member.customer.merge",
  summary: "Mark a duplicate pair as two different people, so it stops coming back in the duplicates list.",
  label: "ยืนยันว่าไม่ใช่คนเดียวกัน",
  test: "M1.11-S1.2",
  async handler({ actor, params }) {
    return profile.dismissDuplicate(memberCtxOf(actor), memberActorOf(actor), idParam(params.pairId, "คู่ที่อาจซ้ำ"));
  },
});

const membersIdentitiesLink = defineMemberOp({
  id: "members.identities.link",
  method: "POST",
  path: "/members/{id}/identities",
  kind: "write",
  action: "member.customer.update",
  summary:
    "Attach an outside channel account (a LINE user id, a WhatsApp number, a marketplace buyer id) to this member. If that identifier already belongs to somebody else, the call fails with 409 instead of guessing.",
  label: "ผูกช่องทางเข้ากับสมาชิก",
  tool: { name: "member_link_identity", hint: "Use this once you know which member a chat account belongs to." },
  input: z
    .object({
      channel: z.string().trim().min(1).max(30).describe("Channel key from GET /channels."),
      externalId: z.string().trim().min(1).max(200).describe("The id that channel knows this person by."),
      displayName: z.string().trim().max(120).nullish(),
      verified: z.boolean().optional().describe("True when the shop confirmed the person really owns this account."),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    const res = await linkIdentityToMember(memberCtxOf(actor), memberActorOf(actor), idParam(params.id), input);
    return jsonSafe(res);
  },
});

const membersIdentitiesUnlink = defineMemberOp({
  id: "members.identities.unlink",
  method: "DELETE",
  path: "/members/{id}/identities/{identityId}",
  kind: "write",
  action: "member.customer.update",
  summary: "Detach a channel account from a member. Needs a key of the admin bundle: unlinking the wrong one hands a customer's chat history to somebody else.",
  label: "ถอดการผูกช่องทาง",
  test: "M1.11-S1.2",
  async handler({ actor, params }) {
    return profile.unlinkIdentity(memberCtxOf(actor), memberActorOf(actor), idParam(params.identityId, "การผูกช่องทาง"));
  },
});

const membersResolve = defineMemberOp({
  id: "members.resolve",
  method: "POST",
  path: "/members/resolve",
  kind: "write",
  action: "member.customer.update",
  summary:
    "Answer 'who is this person' for an outside system: give a channel account plus whatever contact details you have, get back the member it belongs to (and link the account to them). No match returns `customerId: null` with candidates by name, and never creates anybody.",
  label: "จับคู่ตัวตนจากช่องทาง",
  tool: { name: "member_resolve", hint: "Use this when a chat or an order arrives and you need to know which member it is." },
  input: z
    .object({
      channel: z.string().trim().min(1).max(30).describe("Channel key from GET /channels."),
      externalId: z.string().trim().min(1).max(200).describe("The id that channel knows this person by."),
      phone: z.string().trim().max(30).nullish().describe("Matched first, before email and before the channel id."),
      email: z.string().trim().max(160).nullish(),
      displayName: z.string().trim().max(120).nullish().describe("Used to suggest candidates when nothing matched."),
      contactId: z.string().trim().max(40).nullish().describe("Chat contact id, when the caller is a chat integration."),
      verified: z.boolean().optional(),
    })
    .strict(),
  test: "M1.11-S2.8",
  async handler({ actor, input }) {
    const res = await profile.linkIdentity(memberCtxOf(actor), input);
    return jsonSafe(res);
  },
});

// ── นำเข้า / ส่งออก ────────────────────────────────────────────────────────

const importRows = z
  .array(z.record(z.string(), z.string()))
  .min(1)
  .max(5000)
  .describe("Rows of the file, each a flat object of column name to cell text.");

const membersImportStart = defineMemberOp({
  id: "members.import.start",
  method: "POST",
  path: "/members/import",
  kind: "write",
  action: "member.customer.import",
  summary:
    "Import members from rows you already parsed. `dryRun: true` only checks the rows and reports what would happen; without it the rows are imported and the counters come back in the same reply.",
  label: "นำเข้าสมาชิก",
  tool: { name: "member_import_preview", hint: "Use with dryRun true to tell the user what a member file would do before importing it." },
  input: z
    .object({
      rows: importRows,
      mapping: z.record(z.string(), z.string()).describe("Column name to field key, as listed by GET /fields/layout. Unknown field keys are rejected."),
      dryRun: z.boolean().optional().describe("Check only, write nothing. Default false."),
      options: z
        .object({
          onDuplicate: z.enum(["update", "skip", "candidate"]).describe("What to do with a row that matches an existing member."),
          source: z.enum(SOURCES).optional().describe("Where these members came from. Default IMPORT."),
          fileName: z.string().trim().max(200).nullish(),
          homeUnitId: z.string().trim().max(40).nullish(),
          tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, input, requestId }) {
    const ctx = memberCtxOf(actor);
    const me = memberActorOf(actor);
    const preview = await importer.previewImport(ctx, me, { rows: input.rows, mapping: input.mapping });
    if (input.dryRun) return { jobId: null, status: "PREVIEW", preview };
    const result = await importer.importMembers(ctx, me, {
      rows: input.rows,
      mapping: input.mapping,
      options: input.options ?? { onDuplicate: "skip" },
    });
    // ⚠️ การนำเข้าผ่าน API นี้ทำงานจบในคำขอเดียว (ยังไม่มีคิวงานเบื้องหลังของโมดูลสมาชิก)
    //    `jobId` = requestId ของคำขอนี้ เพื่อให้ผู้เรียกอ้างถึงงานเดิมได้ในบันทึก/ตั๋วแจ้งปัญหา
    return { jobId: requestId, status: "DONE", preview, ...result };
  },
});

const membersImportStatus = defineMemberOp({
  id: "members.import.status",
  method: "GET",
  path: "/members/import/{jobId}",
  kind: "read",
  action: "member.customer.import",
  summary:
    "Status of an import. Imports through this API finish inside the POST that started them, so this always answers DONE and the real counters are the ones POST /members/import already returned.",
  label: "สถานะการนำเข้า",
  test: "M1.11-S1.2",
  async handler({ params }) {
    return {
      jobId: idParam(params.jobId, "งานนำเข้า"),
      status: "DONE",
      async: false,
      note: "การนำเข้าผ่าน API นี้ทำงานจบในคำขอเดียว — ตัวเลขผลลัพธ์อยู่ในคำตอบของ POST /members/import แล้ว",
    };
  },
});

const membersExport = defineMemberOp({
  id: "members.export",
  method: "POST",
  path: "/members/export",
  kind: "write",
  action: "member.customer.export",
  summary:
    "Export the members matching a filter as CSV. The file comes back inline in `csv` (UTF-8, no BOM) together with the row count; exporting is audited because it takes personal data out of the shop.",
  label: "ส่งออกรายชื่อสมาชิก",
  input: z
    .object({
      filters: z
        .object({
          q: z.string().trim().max(120).optional(),
          tier: z.string().trim().max(40).optional(),
          unit: z.string().trim().max(40).optional(),
          tag: z.string().trim().max(40).optional(),
          source: z.enum(SOURCES).optional(),
          status: z.enum(STATUSES).optional(),
          f: z.record(z.string(), z.string()).optional().describe("Custom field filters, keyed by field key."),
        })
        .strict()
        .optional(),
      columns: z.array(z.string().trim().min(1).max(60)).min(1).max(60).describe("Column keys, for example memberCode, name, phone, tier, points or any custom field key."),
    })
    .strict(),
  test: "M1.11-S2.11",
  async handler({ actor, input }) {
    const res = await exportMembers(memberCtxOf(actor), memberActorOf(actor), {
      ...(input.filters ? { filters: input.filters as ListMembersOptions } : {}),
      columns: input.columns,
    });
    return { rows: res.rows, csv: res.csv };
  },
});

// ── อันตราย ────────────────────────────────────────────────────────────────

const membersMerge = defineMemberOp({
  id: "members.merge",
  method: "POST",
  path: "/members/{id}/merge",
  kind: "danger",
  action: "member.customer.merge",
  summary:
    "Merge a duplicate into this member: points, history, identities and consents move over and the other record becomes MERGED. Cannot be undone. The shop's approval chain can hold it, in which case the reply is `{ pending: true, approvalRequestId }`.",
  label: "รวมสมาชิกซ้ำ",
  tool: { name: "member_merge", hint: "Only after the user confirmed which record to keep.", risk: "DESTRUCTIVE" },
  input: z
    .object({
      mergeId: z.string().trim().min(1).max(40).describe("Id of the member that gets absorbed and closed."),
      fieldChoices: z
        .record(z.string(), z.enum(["A", "B"]))
        .optional()
        .describe("Which record wins per field: A is the one in the path, B is mergeId. Default A."),
      reason: z.string().trim().min(5).max(200).describe("Why these are the same person. Stored in the audit log."),
    })
    .strict(),
  test: "M1.11-S2.10",
  async handler({ actor, params, input }) {
    const res = await profile.mergeMembers(memberCtxOf(actor), memberActorOf(actor), {
      keepId: idParam(params.id),
      mergeId: input.mergeId,
      ...(input.fieldChoices ? { fieldChoices: input.fieldChoices } : {}),
      // ชั้นยืนยันของ REST คือ `confirm: true` + `reason` ที่แกนกลางบังคับไปแล้ว
      // ⇒ แปลงเป็นคำยืนยันที่บริการต้องการ (หน้าจอให้คนพิมพ์ "MERGE" เอง)
      confirm: "MERGE",
    });
    return jsonSafe(res);
  },
});

export const MEMBERS_OPS: ApiOp[] = [
  membersList,
  membersSearch,
  membersBrief,
  membersGet,
  membersActivity,
  membersIdentitiesList,
  membersDuplicates,
  membersDuplicatesCompare,
  membersCreate,
  membersUpdate,
  membersSetStatus,
  membersSetTags,
  membersSetOwner,
  membersDuplicatesDismiss,
  membersIdentitiesLink,
  membersIdentitiesUnlink,
  membersResolve,
  membersImportStart,
  membersImportStatus,
  membersExport,
  membersMerge,
];
