// HR H3.6 ▸ ตรรกะของ GET ดาวน์โหลดแบบยื่น/หนังสือรับรอง (route.ts 3 ตัวเรียกตัวนี้ · ข้อสอบเรียกตรงได้ ไม่ต้องมีคุกกี้) — กติกาเดียวกับ H3.5:
//   🔴 คำขอที่มีหัว `rsc` หรือ `next-router-prefetch` (Next ดึงเองตอน action redirect / prefetch) = 204 โดยไม่เรียก service (ไม่นับ ไม่ลงประวัติ)
//   ไม่ผ่าน = ข้อความคงที่ตามภาษาผู้ดู · text/plain · ไม่มีไบต์ · 404 (ไม่พบ/ไม่มีสิทธิ์) · 409 (สถานะ/ข้อมูลเปลี่ยน/เนื้อหาไม่ตรง/ยกเลิกแล้ว) · 410 (หมดอายุ)
//   สำเร็จ = attachment (ชื่อไฟล์ตัดเหลือ A-Z a-z 0-9 _ . -) · no-store · nosniff · ชื่อไฟล์หนังสือรับรอง = <เลขที่>.pdf (ไม่มีเลขประจำตัว) ◂
import { isRouterFetch, safeFileName } from "../bank-files/download-route";
import type { SelfActor } from "../self";
import { filingTextFor } from "./texts";
import { downloadFiling, downloadMyTaxCertificate, downloadTaxCertificate, type FilingViewer } from "./service";

type Ctx = { tenantId: string; systemId: string };
type Opts = { now?: Date; locale?: string | null };
const TEXT_KEY = { NO: "no", STATUS: "status", NOT_FINAL: "notFinal", CHANGED: "changed", EXPIRED: "expired", CERT_CHANGED: "certChanged", VOIDED: "voided" } as const;
const STATUS_OF: Record<string, number> = { NO: 404, STATUS: 409, NOT_FINAL: 409, CHANGED: 409, CERT_CHANGED: 409, VOIDED: 409, EXPIRED: 410 };
const BASE_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;

type Result = { ok: true; fileName: string; contentType: string; bytes: Uint8Array } | { ok: false; code: string };
async function answer(req: Request, opts: Opts | undefined, run: () => Promise<Result>): Promise<Response> {
  if (isRouterFetch(req)) return new Response(null, { status: 204, headers: BASE_HEADERS });
  const tx = filingTextFor(opts?.locale);
  const r = await run();
  if (!r.ok) {
    const key = TEXT_KEY[r.code as keyof typeof TEXT_KEY] ?? "no";
    return new Response(tx[key], { status: STATUS_OF[r.code] ?? 404, headers: { "Content-Type": "text/plain; charset=utf-8", ...BASE_HEADERS } });
  }
  return new Response(Buffer.from(r.bytes), {
    status: 200,
    headers: { "Content-Type": r.contentType, "Content-Disposition": `attachment; filename="${safeFileName(r.fileName)}"`, "Content-Length": String(r.bytes.length), ...BASE_HEADERS },
  });
}
const sysOk = (ctx: Ctx) => /^[A-Za-z0-9_-]{1,64}$/.test(ctx?.systemId ?? "");
const NOPE: Result = { ok: false, code: "NO" };

/** ไฟล์ ภ.ง.ด.1 / 1ก / สปส.1-10 ที่สร้างไว้ (ผู้ผ่านด่านแบบยื่น) */
export async function filingFileGet(req: Request, ctx: Ctx, viewer: FilingViewer, fileId: string, opts?: Opts): Promise<Response> {
  return answer(req, opts, async () => (sysOk(ctx) ? await downloadFiling(ctx, viewer, { fileId }, opts?.now ? { now: opts.now } : undefined) : NOPE));
}
/** หนังสือรับรอง 50 ทวิ (ผู้ผ่านด่านแบบยื่น) */
export async function taxCertGet(req: Request, ctx: Ctx, viewer: FilingViewer, certId: string, opts?: Opts): Promise<Response> {
  return answer(req, opts, async () => (sysOk(ctx) ? await downloadTaxCertificate(ctx, viewer, { certId }, opts?.now ? { now: opts.now } : undefined) : NOPE));
}
/** หนังสือรับรองของตัวเอง (หน้า "เงินเดือน" ของฉัน) */
export async function myTaxCertGet(req: Request, actor: SelfActor, certId: string, opts?: Opts): Promise<Response> {
  return answer(req, opts, async () => downloadMyTaxCertificate(actor, { certId }));
}
