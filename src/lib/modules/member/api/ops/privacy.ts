// ops/privacy.ts — op ของ "ความยินยอม + ความเป็นส่วนตัว/PDPA" (MEMBER-API §2.3 · M1.11)
//
// 🔴 `privacy.export` / `privacy.erase` เอาข้อมูลส่วนบุคคลออกจากร้าน/ลบทิ้งถาวร ⇒ ใช้คีย์สิทธิ์
//    ที่แยกจากการอ่านทั่วไปเสมอ (`member.privacy.manage` / `member.customer.delete`) และทั้งคู่
//    เขียนบันทึกไว้ ⇒ ตอบคำถาม "ใครเอาข้อมูลลูกค้าออกไปเมื่อไร" ได้ ไม่ว่ามาทางหน้าจอหรือทาง API
// 🔴 "ลบ" = ทำให้ไม่ระบุตัวตน ไม่ใช่ DELETE แถว (บิล/แต้มเป็นหลักฐานทางบัญชี — ดู `privacy.ts`)

import { z } from "zod";
import * as privacy from "../../privacy";
import { memberActorOf, memberCtxOf } from "../actor";
import { jsonSafe } from "../serialize";
import { defineMemberOp, type ApiOp } from "../op";

const requiredId = (v: string | undefined): string => (v ?? "").trim();

const dateish = (label: string) =>
  z.string().trim().max(40).optional().describe(`${label} as an ISO-8601 instant.`);

// ── ความยินยอม ─────────────────────────────────────────────────────────────

const consentsGet = defineMemberOp({
  id: "consents.get",
  method: "GET",
  path: "/members/{id}/consents",
  kind: "read",
  action: "member.customer.read",
  summary: "Marketing consent of one member, one row per channel the shop can ask consent for, with when it was given or withdrawn.",
  label: "ความยินยอมของสมาชิก",
  test: "M1.11-S2.7",
  async handler({ actor, params }) {
    const items = await privacy.getConsents(memberCtxOf(actor), requiredId(params.id));
    return jsonSafe({ items, total: items.length });
  },
});

const consentsSet = defineMemberOp({
  id: "consents.set",
  method: "PUT",
  path: "/members/{id}/consents",
  kind: "write",
  action: "member.customer.update",
  summary:
    "Record that a member agreed to, or withdrew consent for, one channel. Always send where the answer came from; that is what makes the record defensible later.",
  label: "บันทึกความยินยอม",
  tool: { name: "member_consent_set", hint: "Only after the customer themself said yes or no to being contacted." },
  input: z
    .object({
      channel: z.string().trim().min(1).max(30).describe("Channel key from GET /channels that can carry consent."),
      granted: z.boolean(),
      source: z
        .enum(["SIGNUP_FORM", "LIFF", "STAFF", "IMPORT", "API", "CUSTOMER_SELF"])
        .describe("Where this answer came from. An outside integration should send API."),
      policyVersion: z.coerce.number().int().min(1).nullish().describe("Privacy policy version the customer agreed to, when there is one."),
    })
    .strict(),
  test: "M1.11-S2.7",
  async handler({ actor, params, input }) {
    const res = await privacy.setConsent(memberCtxOf(actor), memberActorOf(actor), requiredId(params.id), input);
    return jsonSafe(res);
  },
});

// ── นโยบายความเป็นส่วนตัว ───────────────────────────────────────────────────

const policiesList = defineMemberOp({
  id: "privacy.policies.list",
  method: "GET",
  path: "/privacy/policies",
  kind: "read",
  action: "member.privacy.manage",
  summary: "Every version of the shop's privacy policy, newest first, with which one is in force today.",
  label: "นโยบายความเป็นส่วนตัวทุกเวอร์ชัน",
  test: "M1.11-S1.2",
  async handler({ actor }) {
    const items = await privacy.listPolicyVersions(memberCtxOf(actor));
    return jsonSafe({ items, total: items.length });
  },
});

const policiesCreate = defineMemberOp({
  id: "privacy.policies.create",
  method: "POST",
  path: "/privacy/policies",
  kind: "write",
  action: "member.privacy.manage",
  summary: "Write a new version of the privacy policy. It stays a draft until it is published, so customers keep agreeing to the old one meanwhile.",
  label: "ร่างนโยบายเวอร์ชันใหม่",
  input: z
    .object({
      bodyHtml: z.string().trim().min(1).max(200_000).describe("The policy text as HTML. Scripts and event handlers are stripped."),
      effectiveAt: dateish("When it starts to apply"),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, input }) {
    const res = await privacy.createPolicyVersion(memberCtxOf(actor), memberActorOf(actor), {
      bodyHtml: input.bodyHtml,
      effectiveAt: input.effectiveAt ?? null,
    });
    return jsonSafe(res);
  },
});

const policiesPublish = defineMemberOp({
  id: "privacy.policies.publish",
  method: "POST",
  path: "/privacy/policies/{version}/publish",
  kind: "write",
  action: "member.privacy.manage",
  summary: "Put one version of the policy into force. From then on new consents are recorded against that version number.",
  label: "เผยแพร่นโยบาย",
  input: z.object({ effectiveAt: dateish("When it starts to apply") }).strict(),
  test: "M1.11-S1.2",
  async handler({ actor, params, input }) {
    const version = Number(requiredId(params.version));
    const res = await privacy.publishPolicyVersion(memberCtxOf(actor), memberActorOf(actor), version, {
      effectiveAt: input.effectiveAt ?? null,
    });
    return jsonSafe(res);
  },
});

// ── ใครดูข้อมูลอ่อนไหวได้ ───────────────────────────────────────────────────

const sensitiveList = defineMemberOp({
  id: "privacy.sensitive.list",
  method: "GET",
  path: "/privacy/sensitive",
  kind: "read",
  action: "member.privacy.manage",
  summary:
    "Who may open each sensitive section or field: by shop role, by HR position, by HR department, optionally only inside their own branch, and whether every view is logged.",
  label: "นโยบายข้อมูลอ่อนไหว",
  test: "M1.11-S1.2",
  async handler({ actor }) {
    const items = await privacy.listSensitivePolicies(memberCtxOf(actor));
    return jsonSafe({ items, total: items.length });
  },
});

const sensitiveSet = defineMemberOp({
  id: "privacy.sensitive.set",
  method: "PUT",
  path: "/privacy/sensitive",
  kind: "write",
  action: "member.privacy.manage",
  summary:
    "Set who may open one sensitive section or field. Read and operate API keys are never allowed in, whatever this policy says; it only widens or narrows what people (and admin keys) can see.",
  label: "ตั้งนโยบายข้อมูลอ่อนไหว",
  input: z
    .object({
      targetType: z.enum(["SECTION", "FIELD"]),
      targetId: z.string().trim().min(1).max(40).describe("Id of the section or the field."),
      roles: z.array(z.enum(["OWNER", "MANAGER", "STAFF"])).max(3).describe("Shop roles allowed in. An empty list means role alone never opens it."),
      hrPositions: z.array(z.string().trim().min(1).max(60)).max(50).optional().describe("HR positions allowed in, for example 'พยาบาล'."),
      hrDepartments: z.array(z.string().trim().min(1).max(40)).max(50).optional().describe("HR department ids allowed in."),
      sameUnitOnly: z.boolean().optional().describe("Only for members whose home branch the viewer covers."),
      logAccess: z.boolean().optional().describe("Record every view in the access log. Default true."),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, input }) {
    const res = await privacy.setSensitivePolicy(memberCtxOf(actor), memberActorOf(actor), input);
    return jsonSafe(res);
  },
});

const hrPositions = defineMemberOp({
  id: "privacy.hrPositions",
  method: "GET",
  path: "/privacy/hr-positions",
  kind: "read",
  action: "member.privacy.manage",
  summary:
    "The positions and departments that exist in the shop's HR records, plus the staff who have no user account yet - a policy by position cannot reach those people.",
  label: "ตำแหน่ง/แผนกจากทะเบียนพนักงาน",
  test: "M1.11-S1.2",
  async handler({ actor }) {
    return jsonSafe(await privacy.hrPositionsSummary(memberCtxOf(actor)));
  },
});

const accessLog = defineMemberOp({
  id: "privacy.accessLog",
  method: "GET",
  path: "/privacy/access-log",
  kind: "read",
  action: "member.privacy.manage",
  rate: "report",
  summary: "Who opened sensitive member data, when, and in which position they held at that moment.",
  label: "บันทึกการเปิดดูข้อมูลอ่อนไหว",
  input: z
    .object({
      customerId: z.string().trim().max(40).optional(),
      userId: z.string().trim().max(40).optional(),
      from: dateish("Only views at or after this instant"),
      to: dateish("Only views at or before this instant"),
      take: z.coerce.number().int().min(1).max(200).optional().describe("Rows to return, 1-200. Default 20."),
    })
    .strict(),
  test: "M1.11-S1.2",
  async handler({ actor, input }) {
    const items = await privacy.listAccessLog(memberCtxOf(actor), memberActorOf(actor), {
      customerId: input.customerId ?? null,
      userId: input.userId ?? null,
      from: input.from ?? null,
      to: input.to ?? null,
      ...(input.take ? { take: input.take } : {}),
    });
    return jsonSafe({ items, total: items.length });
  },
});

const requestsList = defineMemberOp({
  id: "privacy.requests.list",
  method: "GET",
  path: "/privacy/requests",
  kind: "read",
  action: "member.privacy.manage",
  summary: "PDPA requests of this member system: copies of data that were taken out, and deletions waiting for approval or already done.",
  label: "คำขอตาม PDPA",
  input: z.object({ take: z.coerce.number().int().min(1).max(200).optional().describe("Rows to return, 1-200. Default 20.") }).strict(),
  test: "M1.11-S1.2",
  async handler({ actor, input }) {
    const items = await privacy.listPrivacyRequests(memberCtxOf(actor), memberActorOf(actor), input.take ?? 20);
    return jsonSafe({ items, total: items.length });
  },
});

const exportOne = defineMemberOp({
  id: "privacy.export",
  method: "POST",
  path: "/members/{id}/privacy/export",
  kind: "write",
  action: "member.privacy.manage",
  summary:
    "Everything the shop holds about one member, as one bundle, and a PDPA request row recording that it was taken out. Hand the bundle to the customer, not to a third party.",
  label: "ส่งออกข้อมูลของสมาชิก (PDPA)",
  test: "M1.11-S1.2",
  async handler({ actor, params }) {
    const res = await privacy.requestExport(memberCtxOf(actor), memberActorOf(actor), requiredId(params.id), "API");
    return jsonSafe(res);
  },
});

const eraseOne = defineMemberOp({
  id: "privacy.erase",
  method: "POST",
  path: "/members/{id}/privacy/erase",
  kind: "danger",
  action: "member.customer.delete",
  summary:
    "Ask for a member's personal data to be erased. It goes through the shop's approval chain first; once approved the record is anonymised, keeping the accounting trail but removing everything that names the person. This cannot be undone.",
  label: "ขอลบข้อมูลสมาชิก (PDPA)",
  input: z.object({ reason: z.string().trim().min(5).max(200).describe("Why the data is being erased. Stored in the audit log.") }).strict(),
  test: "M1.11-S2.10",
  async handler({ actor, params }) {
    const res = await privacy.requestErase(memberCtxOf(actor), memberActorOf(actor), requiredId(params.id), "API");
    return jsonSafe(res);
  },
});

export const PRIVACY_OPS: ApiOp[] = [
  consentsGet,
  consentsSet,
  policiesList,
  policiesCreate,
  policiesPublish,
  sensitiveList,
  sensitiveSet,
  hrPositions,
  accessLog,
  requestsList,
  exportOne,
  eraseOne,
];
