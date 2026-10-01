// portal-lane.ts — เลนลูกค้าของ REST CRM: `/api/v1/crm/portal/*` (ใบ C3.5 · addendum ข้อ 2 · แบบเดียวกับเลน `/me` ของสมาชิก M2.10)
//
// ผู้เรียกของเลนนี้คือ **ผู้ติดต่อของบริษัทลูกค้า** ที่ถือ token session พอร์ทัล (`Authorization: Bearer cp_…`) — ไม่ใช่คีย์ของร้าน
//   • op ของเลนนี้อยู่ในทะเบียนแยก `PORTAL_OPS` (ไม่อยู่ใน `CRM_OPS`) ⇒ คู่มือ/OpenAPI/tool ของ AI สำหรับคีย์ร้านไม่เห็นมัน และ
//     คีย์ของร้าน (`shark_…`) เข้าเลนนี้ไม่ได้เลย (401) · token พอร์ทัลบน op ของร้าน = 403 (ด่านใน `config.ts` บล็อก C3.5)
//   • ทุก handler เรียกบริการ `crm/portal.ts` ด้วย **token ดิบ** (ไม่ใช่ id จาก actor) ⇒ ถอนสิทธิ์มีผลทันทีที่คำขอถัดไป เหมือนหน้าเว็บ
//   • ใช้ dispatch ของแกนกลางตัวเดียวกัน (จับคู่ path · สคีมา · กันซ้ำแบบ optional · audit ของ write) — ไม่มี dispatcher ตัวที่สอง
// AUDIT-CLASS X1: บริษัท = บริษัทปัจจุบันของ session (id ของบริษัทอื่น/ร้านอื่น = 404 จากบริการ) · AUDIT-CLASS X7: เพดานอัตราต่อ access
//   (`crm:portal:api:<tenant>:<kind>:<accessId>` บน `checkRateLimitDb`) · AUDIT-CLASS X10: token เก็บใน WeakMap ต่อ actor — ไม่อยู่ใน
//   actor/audit/คำตอบ
import { z } from "zod";
import type { ApiActor } from "@/lib/api/actor";
import { defineOp, rateKindOf, type ApiOp } from "@/lib/api/op";
import type { ApiModuleConfig, RequireResult } from "@/lib/api/require";
import { ApiError, fail, nothingWritten } from "@/lib/api/respond"; // CRM C5.5 ▸ RV-2 +nothingWritten ◂
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { getPortalSession, isPortalToken } from "@/lib/modules/member/session-facade"; // facade ที่สองของสมาชิก (ผิว session เท่านั้น — กันวงโหลดของบัญชี)
import * as portal from "../portal";
import { crmApiError, toCrmApiError } from "./http-errors";

/** คีย์สิทธิ์เดียวของเลนนี้ (ไม่ใช่ scope ของคีย์ — ไม่มีคีย์ API ใดถือค่านี้) */
export const PORTAL_SELF_ACTION = "crm.portal.self";
export const PORTAL_ACTOR_NAME = "ลูกค้าบริษัท (พอร์ทัล)";
const PORTAL_RATE: Record<"read" | "write" | "report", { limit: number; windowMs: number }> = {
  read: { limit: 240, windowMs: 60_000 },
  write: { limit: 30, windowMs: 60_000 },
  report: { limit: 30, windowMs: 60_000 },
};

type Carry = { token: string; ip: string; userAgent: string };
const carried = new WeakMap<ApiActor, Carry>();

function bearer(req: Request): string {
  const m = /^Bearer\s+(.+)$/i.exec((req.headers.get("authorization") ?? "").trim());
  return m?.[1]?.trim() ?? "";
}
function clientIp(req: Request): string {
  return ((req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "").slice(0, 45);
}

const deny401 = (requestId: string): RequireResult => ({
  ok: false,
  response: fail(401, "unauthorized", "ต้องเข้าสู่ระบบพอร์ทัลลูกค้าก่อน — ส่ง Authorization: Bearer <token ของพอร์ทัล> ที่ยังใช้ได้", "A valid customer-portal session token is required.", requestId),
});

/** ด่านของเลนพอร์ทัล — token พอร์ทัลเท่านั้น (คีย์ร้าน/token สมาชิก/ไม่มี token = 401) */
async function portalAuth(req: Request, op: ApiOp, requestId: string): Promise<RequireResult> {
  const raw = bearer(req);
  if (!isPortalToken(raw)) return deny401(requestId);
  const s = await getPortalSession(raw);
  if (!s) return deny401(requestId);
  const kind = rateKindOf(op);
  const spec = PORTAL_RATE[kind];
  const rl = await checkRateLimitDb(`crm:portal:api:${s.tenantId}:${kind}:${s.portalAccessId}`, spec);
  if (!rl.ok) {
    const retryAfter = rl.retryAfterSec ?? 60;
    return { ok: false, response: fail(429, "rate_limited", `เรียกใช้ถี่เกินไป — กรุณารออีก ${retryAfter} วินาทีแล้วลองใหม่`, "Too many requests for this portal session.", requestId, { headers: { "Retry-After": String(retryAfter) } }) };
  }
  const actor: ApiActor = {
    kind: "user",
    module: "crm",
    tenantId: s.tenantId,
    systemId: s.crmSystemId,
    keyId: `cp:${s.portalAccessId}`,
    userId: null,
    keyName: PORTAL_ACTOR_NAME,
    scopes: [],
    membership: { role: "STAFF", unitAccess: [], permissions: {} },
    can: (action) => action === PORTAL_SELF_ACTION,
    denyMessageTh: "บัญชีพอร์ทัลเปิดดูได้เฉพาะข้อมูลของบริษัทตัวเองในพอร์ทัลเท่านั้น",
  };
  carried.set(actor, { token: raw, ip: clientIp(req), userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300) });
  return { ok: true, actor, requestId, rateRemaining: Math.max(0, spec.limit - (rl.count ?? 0)), rateLimit: spec.limit };
}

function carry(actor: ApiActor): Carry {
  const c = carried.get(actor);
  if (!c) throw crmApiError(401, "unauthorized", "ต้องเข้าสู่ระบบพอร์ทัลลูกค้าก่อน", "A valid customer-portal session token is required.");
  return c;
}

/** error ของบริการพอร์ทัล → รหัส REST (UNAUTHORIZED/RATE_LIMITED ไม่มีในตัวแปลงของ C1.10) */
function mapPortalError(e: unknown): unknown {
  if (e instanceof ApiError) return e;
  const code = (e as { code?: unknown })?.code;
  const msg = e instanceof Error ? e.message : "";
  if (code === "UNAUTHORIZED" && /[ก-๙]/.test(msg)) return crmApiError(401, "unauthorized", msg, "The portal session is expired or revoked.");
  if ((code === "RATE_LIMITED" || (e as { name?: unknown })?.name === "CustomerRateLimitError") && /[ก-๙]/.test(msg)) return nothingWritten(crmApiError(429, "rate_limited", msg, "Too many attempts. Try again later.")); // CRM C5.5 ▸ RV-2: ถูกจำกัดอัตรา = ยังไม่ได้ทำงาน ◂
  if (code === "CUSTOMER_AUTH" && /[ก-๙]/.test(msg)) return crmApiError(422, "validation", msg, "The request cannot be accepted.");
  return toCrmApiError(e);
}

type Def<S extends z.ZodType | undefined> = {
  id: string;
  method: "GET" | "POST";
  path: string;
  summary: string;
  label: string;
  input?: S;
  run: (a: { c: Carry; params: Record<string, string>; input: S extends z.ZodType ? z.infer<S> : undefined }) => Promise<unknown>;
};

function portalOp<S extends z.ZodType | undefined>(d: Def<S>): ApiOp {
  return defineOp<S>({
    id: `portal.${d.id}`,
    module: "crm",
    method: d.method,
    path: d.path,
    kind: d.method === "GET" ? "read" : "write",
    action: PORTAL_SELF_ACTION,
    summary: d.summary,
    label: d.label,
    input: d.input,
    test: "C3.5-X1.5",
    auditAction: `crm.portal.api.${d.id}`,
    idempotency: "optional",
    async handler(ctx) {
      try {
        return JSON.parse(JSON.stringify(await d.run({ c: carry(ctx.actor), params: ctx.params, input: ctx.input as S extends z.ZodType ? z.infer<S> : undefined })));
      } catch (e) {
        throw mapPortalError(e);
      }
    },
  });
}

const none = z.object({}).strict();
const id = (p: Record<string, string>) => p.id ?? "";

export const PORTAL_OPS: ApiOp[] = [
  portalOp({ id: "me", method: "GET", path: "/portal/me", summary: "Who is signed in to the customer portal and for which company.", label: "ข้อมูลผู้ใช้พอร์ทัล", input: none, run: ({ c }) => portal.me(c.token) }),
  portalOp({ id: "home", method: "GET", path: "/portal/home", summary: "Company home: outstanding balance, quotations awaiting an answer, recent activity.", label: "หน้าแรกบริษัท", input: none, run: ({ c }) => portal.home(c.token) }),
  portalOp({ id: "quotations.list", method: "GET", path: "/portal/quotations", summary: "Quotations of the signed-in company.", label: "ใบเสนอราคา", input: none, run: ({ c }) => portal.listQuotations(c.token) }),
  portalOp({ id: "quotations.get", method: "GET", path: "/portal/quotations/{id}", summary: "One quotation of the signed-in company.", label: "ใบเสนอราคา 1 ใบ", input: none, run: ({ c, params }) => portal.getQuotation(c.token, id(params)) }),
  portalOp({
    id: "quotations.respond",
    method: "POST",
    path: "/portal/quotations/{id}/respond",
    summary: "Accept or reject a quotation (reject needs a reason).",
    label: "ตอบรับ/ปฏิเสธใบเสนอราคา",
    input: z.object({ accept: z.boolean(), reason: z.string().max(500).optional().nullable(), signerName: z.string().min(1).max(120) }).strict(),
    run: ({ c, params, input }) => portal.respondQuotation(c.token, id(params), input, { ip: c.ip, userAgent: c.userAgent }),
  }),
  portalOp({ id: "invoices.list", method: "GET", path: "/portal/invoices", summary: "Invoices of the signed-in company with the outstanding amount.", label: "ใบแจ้งหนี้", input: none, run: ({ c }) => portal.listInvoices(c.token) }),
  portalOp({ id: "invoices.get", method: "GET", path: "/portal/invoices/{id}", summary: "One invoice of the signed-in company.", label: "ใบแจ้งหนี้ 1 ใบ", input: none, run: ({ c, params }) => portal.getInvoice(c.token, id(params)) }),
  portalOp({ id: "invoices.payLink", method: "POST", path: "/portal/invoices/{id}/pay-link", summary: "The payment link (/pay/<token>) of an invoice.", label: "ลิงก์ชำระเงิน", input: z.object({}).strict(), run: ({ c, params }) => portal.payLink(c.token, id(params)) }),
  portalOp({ id: "receipts.list", method: "GET", path: "/portal/receipts", summary: "Receipts and tax invoices of the signed-in company.", label: "ใบเสร็จ/ใบกำกับภาษี", input: none, run: ({ c }) => portal.listReceipts(c.token) }),
  portalOp({ id: "documents.list", method: "GET", path: "/portal/documents", summary: "Shared documents and contracts of the signed-in company.", label: "เอกสาร/สัญญา", input: none, run: ({ c }) => portal.listDocuments(c.token) }),
  portalOp({ id: "records.get", method: "GET", path: "/portal/records/{id}", summary: "One shared record with its visible fields and files.", label: "เอกสาร/สัญญา 1 รายการ", input: none, run: ({ c, params }) => portal.getRecord(c.token, id(params)) }),
  portalOp({
    id: "records.changeRequest",
    method: "POST",
    path: "/portal/records/{id}/change-request",
    summary: "Ask the shop to change an editable field of a shared record.",
    label: "ขอแก้ข้อมูลในเอกสาร",
    input: z.object({ fieldKey: z.string().min(1).max(80), value: z.string().max(2000) }).strict(),
    run: ({ c, params, input }) => portal.requestRecordChange(c.token, id(params), input),
  }),
  portalOp({ id: "requests.list", method: "GET", path: "/portal/requests", summary: "Requests of the signed-in company with their progress.", label: "คำขอ/แจ้งเรื่อง", input: none, run: ({ c }) => portal.listRequests(c.token) }),
  portalOp({
    id: "requests.create",
    method: "POST",
    path: "/portal/requests",
    summary: "Create a request (issue, document request or contact change). Field edits go through records/{id}/change-request.",
    label: "แจ้งเรื่อง/ส่งคำขอ",
    input: z.object({ kind: z.string().min(1).max(40), title: z.string().min(1).max(200), body: z.string().max(4000).optional().nullable(), payload: z.record(z.string(), z.unknown()).optional().nullable() }).strict(),
    run: ({ c, input }) => portal.createRequest(c.token, input),
  }),
  portalOp({ id: "requests.get", method: "GET", path: "/portal/requests/{id}", summary: "One request of the signed-in company.", label: "คำขอ 1 รายการ", input: none, run: ({ c, params }) => portal.getRequest(c.token, id(params)) }),
  portalOp({ id: "contacts.list", method: "GET", path: "/portal/contacts", summary: "Contacts of the signed-in company.", label: "ผู้ติดต่อบริษัท", input: none, run: ({ c }) => portal.listContacts(c.token) }),
];

/** config ของเลนพอร์ทัล — ด่านเดียวคือ `portalAuth` (ไม่ตกไปด่านคีย์ของแกนเลย) */
export function portalApiConfig(base: ApiModuleConfig): ApiModuleConfig {
  return {
    ...base,
    rateNs: "crm-portal",
    makeActor: () => {
      throw crmApiError(401, "unauthorized", "เลนนี้ใช้ได้เฉพาะ session พอร์ทัลลูกค้า", "Portal lane only.");
    },
    messages: { ...base.messages, notFoundTh: "ไม่พบปลายทางนี้ใน API ของพอร์ทัลลูกค้า", notFoundEn: "No portal API operation matches this path." },
    altAuth: portalAuth,
  };
}
