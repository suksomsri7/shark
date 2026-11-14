// HR H3.8 ▸ ตรรกะของ GET ดาวน์โหลดสลิป/หนังสือรับรองเงินเดือน (route.ts 4 ตัวเรียกตัวนี้ · ข้อสอบเรียกตรงได้ ไม่ต้องมีคุกกี้) — กติกาเดียวกับ H3.5/H3.6:
//   HEAD/เมธอดอื่น = 405 (Allow: GET) ก่อนอ่านอะไร · คำขอที่มีหัว rsc / next-router-prefetch = 204 โดยไม่เรียก service (ไม่ลงประวัติ)
//   ไม่ผ่าน = ข้อความคงที่ตามภาษาผู้ดู · text/plain · ไม่มีไบต์ · 404 (ไม่พบ/ไม่มีสิทธิ์) · 409 (ยังไม่ออก/ยังไม่ปิดงาน/ถอนคืน/ข้อมูลเสีย/ยกเลิกแล้ว/เนื้อหาไม่ตรง)
//   สำเร็จ = application/pdf · attachment · no-store · nosniff · ชื่อไฟล์ payslip-<งวด>[-<รหัสพนักงาน>].pdf / <เลขที่>.pdf (ไม่มีชื่อคน/เลขประจำตัว) ◂
import { isRouterFetch, safeFileName } from "./bank-files/download-route";
import type { SelfActor } from "./self";
import { slipTextFor, type SlipTextKey } from "./payslip-rules";
import { downloadMyPayslipPdf, downloadMySalaryCertificate, downloadPayslipPdf, downloadSalaryCertificate, type DownloadOk, type PayslipViewer, type Refusal } from "./payslip";

type Ctx = { tenantId: string; systemId: string };
type Opts = { now?: Date; locale?: string | null };
const TEXT_KEY: Record<string, SlipTextKey> = { NO: "no", NOT_ISSUED: "notIssued", NOT_FINAL: "notFinal", WITHDRAWN: "withdrawn", SLIP_DATA: "slipData", VOIDED: "voided", CERT_CHANGED: "certChanged" };
const STATUS_OF: Record<string, number> = { NO: 404, NOT_ISSUED: 409, NOT_FINAL: 409, WITHDRAWN: 409, SLIP_DATA: 409, VOIDED: 409, CERT_CHANGED: 409 };
const BASE_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;
const NOPE: Refusal = { ok: false, code: "NO", reason: "" };

async function answer(req: Request, opts: Opts | undefined, run: () => Promise<DownloadOk | Refusal>): Promise<Response> {
  if (req.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET", ...BASE_HEADERS } });
  if (isRouterFetch(req)) return new Response(null, { status: 204, headers: BASE_HEADERS });
  const tx = slipTextFor(opts?.locale);
  const r = await run();
  if (!r.ok) {
    const code = TEXT_KEY[r.code] ? r.code : "NO";
    return new Response(tx[TEXT_KEY[code]!], { status: STATUS_OF[code] ?? 404, headers: { "Content-Type": "text/plain; charset=utf-8", ...BASE_HEADERS } });
  }
  return new Response(Buffer.from(r.bytes), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safeFileName(r.fileName)}"`, "Content-Length": String(r.bytes.length), ...BASE_HEADERS },
  });
}
const sysOk = (ctx: Ctx) => /^[A-Za-z0-9_-]{1,64}$/.test(ctx?.systemId ?? "");

/** PDF สลิป (ผู้ดูเงินเดือน) */
export async function payslipPdfGet(req: Request, ctx: Ctx, viewer: PayslipViewer, runId: string, employeeId: string, opts?: Opts): Promise<Response> {
  return answer(req, opts, async () => (sysOk(ctx) ? await downloadPayslipPdf(ctx, viewer, { runId, employeeId }) : NOPE));
}
/** PDF สลิปของฉัน */
export async function myPayslipPdfGet(req: Request, actor: SelfActor, runId: string, opts?: Opts): Promise<Response> {
  return answer(req, opts, async () => downloadMyPayslipPdf(actor, { runId }));
}
/** หนังสือรับรองเงินเดือน (ผู้ผ่านด่านหนังสือรับรอง) */
export async function salaryCertGet(req: Request, ctx: Ctx, viewer: PayslipViewer, certId: string, opts?: Opts): Promise<Response> {
  return answer(req, opts, async () => (sysOk(ctx) ? await downloadSalaryCertificate(ctx, viewer, { certId }) : NOPE));
}
/** หนังสือรับรองเงินเดือนของฉัน */
export async function mySalaryCertGet(req: Request, actor: SelfActor, certId: string, opts?: Opts): Promise<Response> {
  return answer(req, opts, async () => downloadMySalaryCertificate(actor, { certId }));
}
// ◂ HR H3.8
