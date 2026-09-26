// GET /api/account-files/[id] — เปิดไฟล์แนบของเอกสารบัญชีที่เป็น "ไฟล์ส่วนตัว" (ใบ CRM v2 C3.5 · มติผู้คุมงาน ข้อ 2)
//
// ทำไมมี: สลิปที่ลูกค้าแนบจากพอร์ทัล (`crm.portal.uploadSlip`) เก็บเป็นไฟล์ส่วนตัวของ C0.4 — `AccountAttachment.fileUrl = private://…`
//   (ไม่ใช่ URL ที่เปิดได้) · หน้าจอบัญชีทุกหน้าแสดงลิงก์ `/api/account-files/<attachmentId>` แทน (`viewableAttachmentUrl`)
//   route นี้ตัดสินสิทธิ์แล้ว **ออกลิงก์ลงนามผู้ดูชนิด STAFF** (`privateFileUrl` · ≤ 15 นาที) แล้ว 302 ไปที่ `/api/files/<id>` (สตรีมไบต์เอง)
//
// 🔴 ลำดับด่าน (ผู้ออกใบคือผู้ตัดสินสิทธิ์ — ดูหัวไฟล์ /api/files/[id]):
//     1) session พนักงาน + ร้านที่เปิดอยู่ (`requireTenant` — ไม่มี session = ไปหน้าเข้าสู่ระบบ)
//     2) เพดานอัตราต่อผู้ใช้ (`checkRateLimitDb` · AUDIT-CLASS X7)
//     3) id ต้องเป็นรูปรหัสแถว · แถวไฟล์แนบต้องเป็นของร้านนี้ + ระบบชนิด ACCOUNT ของร้านนี้ (ร้านอื่น/ไม่มี = 404 · AUDIT-CLASS X1)
//     4) สิทธิ์ดูเอกสาร/คลังเอกสารของบัญชี (`account.doc.view` หรือ `account.document.manage`) — ไม่มี = 404 (ไม่บอกว่ามีไฟล์)
//     5) ไฟล์ต้องเป็นไฟล์ส่วนตัวของร้านนี้จริง (`FileAsset.cdnUrl` = ค่าหมายเดียวกัน · tenantId ตรง) — ไฟล์สาธารณะไม่ผ่านทางนี้
// 🔴 ทุกคำตอบ `Cache-Control: private, no-store` · ไม่มีที่อยู่ CDN/path ในคำตอบ (AUDIT-CLASS X10) · redirect ไปที่ route ภายในเท่านั้น
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { accountCan } from "@/lib/modules/account/access";
import { isPrivateAttachmentUrl } from "@/lib/modules/account/attachment-shared";
import { FILE_ASSET_ID_RE, privateFileUrl } from "@/lib/storage/service";

export const dynamic = "force-dynamic";

const NO_STORE: Record<string, string> = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
const deny = (status: number, extra?: Record<string, string>) => new Response(null, { status, headers: { ...NO_STORE, ...extra } });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireTenant();
  try {
    const tenantId = auth.active.tenantId;
    const rl = await checkRateLimitDb(`account-files:${auth.user.id}`, { limit: 120, windowMs: 60_000 });
    if (!rl.ok) return deny(429, { "retry-after": String(rl.retryAfterSec ?? 60) });
    const { id: raw } = await ctx.params;
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!FILE_ASSET_ID_RE.test(id)) return deny(404);
    const att = await prisma.accountAttachment.findFirst({ where: { id, tenantId }, select: { systemId: true, fileUrl: true } });
    if (!att || !isPrivateAttachmentUrl(att.fileUrl)) return deny(404);
    const sys = await prisma.appSystem.findFirst({ where: { id: att.systemId, tenantId, type: "ACCOUNT" }, select: { id: true } });
    if (!sys) return deny(404);
    if (!accountCan(auth, "account.doc.view") && !accountCan(auth, "account.document.manage")) return deny(404);
    const asset = await prisma.fileAsset.findFirst({ where: { tenantId, cdnUrl: att.fileUrl.trim() }, select: { id: true } });
    if (!asset) return deny(404);
    const location = privateFileUrl(asset.id, { kind: "STAFF", id: auth.user.id });
    return new Response(null, { status: 302, headers: { ...NO_STORE, location } });
  } catch {
    return deny(500);
  }
}
