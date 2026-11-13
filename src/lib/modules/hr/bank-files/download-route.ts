// HR H3.5 fix r1 ▸ F5 — ตรรกะของ GET ดาวน์โหลดไฟล์โอน (route.ts เรียกตัวนี้ · ข้อสอบเรียกตรงได้ ไม่ต้องมีคุกกี้)
//   🔴 คำขอที่มีหัว `rsc` หรือ `next-router-prefetch` = Next ดึงเองฝั่ง server ตอน action redirect (action-handler.js createRedirectRenderResult
//      ส่ง RSC_HEADER=1 + คุกกี้ต่อ) หรือ router prefetch — ตอบ 204 โดยไม่เรียก service (ไม่นับดาวน์โหลด ไม่ลงประวัติ)
//   ไม่ผ่าน = ข้อความคงที่ตามภาษาผู้ดู · text/plain · ไม่มีไบต์ไฟล์ · 404 (ไม่พบ/ไม่มีสิทธิ์) · 409 (รอบ/ข้อมูลเปลี่ยน/รูปแบบปิด) · 410 (หมดอายุ)
//   สำเร็จ = attachment (ชื่อไฟล์ตัดเหลือ A-Z a-z 0-9 _ . -) · no-store · nosniff ◂
import { bankTextFor } from "./codes";
import { downloadBankFile, type BankViewer } from "./service";

type Ctx = { tenantId: string; systemId: string };
const TEXT_KEY = { NO: "no", STATUS: "status", CHANGED: "changed", EXPIRED: "expired", FORMAT_OFF: "formatOff" } as const;
const STATUS_OF: Record<string, number> = { NO: 404, STATUS: 409, CHANGED: 409, FORMAT_OFF: 409, EXPIRED: 410 };
const BASE_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;

/** คำขอที่ Next ดึงเอง (action redirect / prefetch) — ไม่ใช่การกดดาวน์โหลดของคน */
export const isRouterFetch = (req: Request) => req.headers.has("rsc") || req.headers.has("next-router-prefetch");
export const safeFileName = (n: string) => n.replace(/[^A-Za-z0-9_.-]/g, "_");
/** HR H3.9 fix r1 F2a ▸ Next ตอบ HEAD ด้วย GET — คำขอที่ไม่ใช่ GET (HEAD จากตัวตรวจลิงก์ ฯลฯ) = 405 ก่อนอ่านอะไร: ไม่สร้างไฟล์ ไม่นับ ไม่ลงประวัติ ◂ */
export const notGet = (req: Request) => req.method !== "GET"; // HR H3.9 ◂
export const notGetResponse = () => new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); // HR H3.9 ◂

export async function bankFileGet(req: Request, ctx: Ctx, viewer: BankViewer, fileId: string, opts?: { now?: Date; locale?: string | null }): Promise<Response> {
  if (notGet(req)) return notGetResponse(); // HR H3.9 fix r1 F2a ◂
  if (isRouterFetch(req)) return new Response(null, { status: 204, headers: BASE_HEADERS });
  const tx = bankTextFor(opts?.locale);
  const refuse = (code: string) =>
    new Response(String(tx[TEXT_KEY[code as keyof typeof TEXT_KEY] ?? "no"]), { status: STATUS_OF[code] ?? 404, headers: { "Content-Type": "text/plain; charset=utf-8", ...BASE_HEADERS } });
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(ctx?.systemId ?? "")) return refuse("NO");
  const r = await downloadBankFile(ctx, viewer, { fileId }, opts?.now ? { now: opts.now } : undefined);
  if (!r.ok) return refuse(r.code);
  return new Response(Buffer.from(r.bytes), {
    status: 200,
    headers: {
      "Content-Type": r.contentType,
      "Content-Disposition": `attachment; filename="${safeFileName(r.fileName)}"`,
      "Content-Length": String(r.bytes.length),
      ...BASE_HEADERS,
    },
  });
}
