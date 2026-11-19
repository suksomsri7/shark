// files.ts — ไฟล์แนบของเคสช่วยเหลือ (help-cases · 15 พ.ย. 2026)
//   ไฟล์ใหม่ (รูป · PDF · Excel · CSV) เก็บแบบส่วนตัวด้วยตัวกลางเดียวกับห้องเลขา (secretary/attachments.ts: classifyUpload · resolveAttachmentRefs)
//   ⇒ ไม่มี URL ถาวร · ออกได้ทางเดียว = route ที่ตรวจสิทธิ์เคสก่อน (แอป: Bearer + เห็นเคส · backoffice: คุกกี้ทีมงาน SUPER_ADMIN/SUPPORT)
//   แถวเก่า {name,url,kind} (รูป CDN/data URL ของแอปรุ่นก่อน) ยังอ่านได้ตามเดิม
import { tenantDb } from "@/lib/core/db";
import { attachmentsOf, CSV_MIME } from "@/lib/ai/secretary/attachments-shared";
import { FILE_ASSET_ID_RE, isPrivateStoragePath, openStoredFile } from "@/lib/storage/service";

export type CaseAttachmentDto = {
  id: string;
  name: string;
  url: string;
  kind: "image" | "pdf" | "sheet" | "file";
  mimeType: string;
  size: number;
  /** true = ไฟล์ส่วนตัว (url เป็น path ของเส้นที่ต้องยืนยันตัวตน) */
  private: boolean;
};

const SAFE_LEGACY = /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp|heic|heif);base64,)/i;

/**
 * attachmentsJson → รายการที่ส่งออก · `fileUrl(fileId)` = path ของเส้นโหลดไฟล์ส่วนตัวของผู้เรียก (แอป/backoffice)
 *   แถวเพี้ยน/scheme อันตราย = ข้าม
 */
export function caseAttachmentsDto(raw: unknown, fileUrl: (fileId: string) => string): CaseAttachmentDto[] {
  const list = Array.isArray(raw) ? raw : [];
  const priv = new Map(attachmentsOf(list).map((a) => [a.fileId, a] as const));
  const out: CaseAttachmentDto[] = [];
  list.forEach((x, i) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    if (typeof o.fileId === "string") {
      const a = priv.get(o.fileId);
      if (a) out.push({ id: a.fileId, name: a.name, url: fileUrl(a.fileId), kind: a.kind, mimeType: a.mimeType, size: a.size, private: true });
      return;
    }
    if (typeof o.url === "string" && SAFE_LEGACY.test(o.url)) {
      out.push({ id: `legacy-${i}`, name: typeof o.name === "string" ? o.name : "ไฟล์แนบ", url: o.url, kind: o.kind === "image" ? "image" : "file", mimeType: "", size: 0, private: false });
    }
  });
  return out;
}

const NO_STORE = { "cache-control": "private, no-store" };
const gone = () => new Response(null, { status: 404, headers: NO_STORE });

/**
 * ไบต์ของไฟล์แนบในเคส — ไฟล์ต้องถูกอ้างในข้อความของเคสนี้ (ร้านเดียวกัน) และเป็นไฟล์ส่วนตัว ATTACHMENT · ไม่ผ่าน = 404
 *   ผู้เรียกตรวจสิทธิ์เห็นเคสก่อนเสมอ · `download` = บังคับดาวน์โหลด (backoffice)
 */
export async function caseFileResponse(tenantId: string, caseId: string, fileId: string, opts?: { download?: boolean }): Promise<Response> {
  if (!tenantId || !caseId || !fileId || !FILE_ASSET_ID_RE.test(fileId)) return gone();
  const db = tenantDb({ tenantId });
  const msg = await db.supportMessage.findFirst({
    where: { caseId, attachmentsJson: { array_contains: [{ fileId }] } },
    select: { attachmentsJson: true },
  });
  const att = msg ? attachmentsOf(msg.attachmentsJson).find((x) => x.fileId === fileId) : undefined;
  if (!att) return gone();
  const asset = await db.fileAsset.findFirst({ where: { id: fileId, kind: "ATTACHMENT" }, select: { path: true, contentType: true } });
  if (!asset || !isPrivateStoragePath(asset.path)) return gone();
  const opened = await openStoredFile(asset.path, tenantId);
  if (!opened.ok) return new Response(null, { status: opened.status === 503 ? 503 : 404, headers: NO_STORE });
  const type = att.mimeType === CSV_MIME ? "text/csv; charset=utf-8" : att.mimeType || asset.contentType;
  const inline = !opts?.download && (att.kind === "image" || att.kind === "pdf");
  return new Response((opened.body ?? opened.bytes) as BodyInit, {
    status: 200,
    headers: {
      ...NO_STORE,
      "content-type": type,
      "x-content-type-options": "nosniff",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.name)}`,
    },
  });
}
