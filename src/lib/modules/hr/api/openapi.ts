// openapi.ts — เอกสาร OpenAPI 3.1 ของ API ระบบงานบุคคล (ใบ H4.8 · brief D4 · แบบ pos/api/openapi.ts)
//
// 🔴 ไม่มีรายชื่อ endpoint ของตัวเอง — อ่านจาก `HR_OPS` ล้วน ๆ (ทะเบียนเดียว หลายทางออก)
//    ที่นี่มีแค่ "คำนำของ HR": คีย์ผูกระบบ · ความเป็นส่วนตัว · วันที่ · หน้า · กันซ้ำ · เพดานอัตรา
import { buildOpenApi as coreBuildOpenApi, type ApiDocInfo, type OpenApiDocument } from "@/lib/api/openapi";
import type { ApiOp } from "@/lib/api/op";
import { API_RATE_LIMITS } from "@/lib/api/require";

export { jsonSchemaOf } from "@/lib/api/openapi";
export type { ApiDocInfo, JsonSchema, OpenApiDocument } from "@/lib/api/openapi";

const SERVER_URL = "https://shark.in.th/api/v1/hr";
/** เวอร์ชันของ "สัญญา" ไม่ใช่ของ build */
const API_VERSION = "1.0.0";

const INFO_DESCRIPTION = [
  "REST API for the SHARK HR system (staff list, shifts, published roster, attendance, leave, and - with a pay key - payslips and pay reports). One API key works inside one HR system (AppSystem of type HR). This first version is read-mostly: the only write is filing a leave request, which always waits for the shop's normal approval.",
  "",
  "Conventions that apply to every operation:",
  "1. Authentication is `Authorization: Bearer <api key>`. Only the shop owner can issue HR keys, from HR > Settings > API keys, and every key is bound to that one HR system. A key not bound to this HR system (a shop-wide key, or a key of another system) is refused on every operation with 403 `scope_missing`, even if it carries hr.* scopes. If the person who issued the key is no longer the shop owner, every operation answers 403 `forbidden`; ask the owner for a new key.",
  "2. Bundles: `hr-read` (default: staff list, shifts, roster, attendance, leave - no pay data), `hr-leave` (adds filing a leave request), `hr-payroll-read` (adds payslips and pay reports; the owner must confirm that pay data will leave SHARK). An operation returns 403 `scope_missing` when the key lacks the scope listed as `x-shark-scope` (the missing scope is in `hint`). Reports and filing a leave re-check a second scope inside the operation and answer the same way.",
  "3. Privacy. The API never returns national id or social security numbers, addresses, bank details, phone numbers or e-mail, PINs, photos, GPS positions, devices, notes, leave reasons or who filed a leave. Report columns with statutory ids are always left out; money columns appear only for keys with `hr.payroll.read`. Every payslip, payslip history and pay report read is written to the shop's audit log. Never put names or other personal data in a URL: paths and query strings carry ids, dates and filters only.",
  "4. Not found and not allowed look the same: an id of another HR system or shop, an id the key may not see and an unknown id all answer 404 `not_found` with identical bodies. Do not guess ids; read them from the list operations.",
  "5. Dates are `YYYY-MM-DD` and months `YYYY-MM` in the Asia/Bangkok calendar. Clock in/out times are ISO-8601 strings in UTC. Times of day in shifts and roster entries are minutes after midnight (`startMin`, `endMin`). Leave days and balances are decimal strings (`\"1.0\"`, `\"0.5\"`).",
  "6. Money is an integer number of satang (1 baht = 100 satang) in every field ending in `Satang`. Report cells are display strings, the same as the report screen.",
  "7. Paging: `GET /employees` pages with `page` and `pageSize` (10, 20 or 50; default 20) ordered by name then id, and answers `page` next to `data`. Lists that reach the limit of the screen they come from answer `truncated: true` at the top level (`GET /leaves` 100 requests, `GET /employees` 500 working employees); other lists return the whole set.",
  "8. Filing a leave (`POST /leaves`) requires an `Idempotency-Key` header. Retrying with the same key and body replays the stored answer with header `Idempotent-Replayed: true`; the same key with another body fails with 409 `idempotency_conflict`. The body is strict: unknown fields (including `reason`) fail with 422 `validation`. Overlapping leave answers 409 `duplicate`; other refusals of the HR rules answer 422 `unprocessable` with the app's Thai message in `message_th`. Leave of the shop owner cannot be filed through the API (403 `forbidden`).",
  "9. Success is `{ data, page?, truncated?, requestId }`. Failure is `{ error: { code, message_th, message_en, hint?, details? }, requestId }` - branch on `error.code`; `message_th` is already worded for a Thai shop owner.",
  `10. Rate limits are per key: ${API_RATE_LIMITS.read.limit} reads, ${API_RATE_LIMITS.write.limit} writes and ${API_RATE_LIMITS.report.limit} report-class reads (reports, payslips, payslip history) per minute (namespace hr, separate from other SHARK modules). A 429 response carries \`Retry-After\`.`,
  "11. Not available through the API on purpose: approving or rejecting anything, clocking in or out, editing employees, PINs and documents, payroll runs, bank transfer files, tax and social security filings, salary certificates, PDFs and CSV/XLSX exports, and the statutory employee register. Those stay in the HR app.",
].join("\n");

/** ส่วนหัวเอกสารของ API ระบบงานบุคคล */
export const HR_DOC_INFO: ApiDocInfo = {
  title: "SHARK HR API",
  version: API_VERSION,
  serverUrl: SERVER_URL,
  serverDescription: "Production",
  description: INFO_DESCRIPTION,
  securityDescription: "API key issued by the shop owner in HR > Settings > API keys. Send it as `Authorization: Bearer <key>`.",
};

const HR_SYSTEM_HEADER_DESCRIPTION =
  "Id of the HR system (AppSystem of type HR). Optional: HR keys are always bound to one HR system, and a header that disagrees fails with 403 `system_mismatch`.";
const HR_RESPONSE_DESCRIPTIONS: Record<string, string> = {
  "403": "The key may not do this: missing scope, a key not bound to this HR system, the issuer is no longer the shop owner, or an HR rule refused it (`scope_missing`, `system_mismatch`, `forbidden`).",
  "404": "No such operation, or the record does not exist in this HR system or is not available to this key - the same answer for both (`not_found`).",
};

/** ทะเบียน op ของ HR → เอกสาร OpenAPI 3.1 (บริสุทธิ์ · เรียกซ้ำได้ผลเท่ากันทุกไบต์) */
export function buildOpenApi(ops: readonly ApiOp[]): OpenApiDocument {
  const doc = coreBuildOpenApi(ops, HR_DOC_INFO);
  for (const item of Object.values(doc.paths)) {
    for (const operation of Object.values(item)) {
      for (const param of operation.parameters) if (param.in === "header" && param.name === "X-Shark-System") param.description = HR_SYSTEM_HEADER_DESCRIPTION;
      for (const [status, description] of Object.entries(HR_RESPONSE_DESCRIPTIONS)) {
        const res = operation.responses[status];
        if (res) res.description = description;
      }
    }
  }
  return doc;
}
