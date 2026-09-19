// files.ts — ไฟล์แนบของ CRM (ใบ C1.6 · มติ C19 · ไฟล์ส่วนตัว C0.4/C17 · R-E.2)
//
// ของที่ไฟล์นี้เป็นเจ้าของ: `CrmFileLink` attach/list/remove บนผู้ติดต่อ · บริษัท · ดีล · รายการวัตถุกำหนดเอง
//
// 🔴 AUDIT-CLASS X10: อัปโหลดผ่าน **ทางส่วนตัว** ของ storage เท่านั้น — `uploadFile(…, { visibility: "private" })`
//    ⇒ path `t/<tenantId>/private/<สุ่ม 160 บิต>.<ext>` · `cdnUrl` เป็นค่าหมาย `private://…` (ไม่ใช่ URL ที่ใช้ได้)
//    DTO มีแค่ลิงก์ `privateFileUrl(fileId, { kind: "STAFF", id: ผู้ดู })` ที่ผูกกับผู้ดูคนนั้นและหมดอายุ (≤ 15 นาที)
//    ไม่มี URL CDN / path / ค่าหมาย ออกจากไฟล์นี้ไปทางไหนเลย
// 🔴 AUDIT-CLASS X6: ชนิดไฟล์ = ชุดย่อยของตารางอนุญาต storage **ลบ SVG** · ขนาด ≤ CRM_FILE_MAX_BYTES · ชื่อไฟล์ทำความสะอาด
//    (ไม่มี / \ < > ตัวควบคุม · ไม่ขึ้นต้นด้วยจุด · ≤ CRM_FILE_NAME_MAX · ภาษาไทยคงไว้) — ปฏิเสธ = ไม่มี put/FileAsset/ลิงก์
// 🔴 AUDIT-CLASS X1: ระเบียนแม่อ่านผ่าน where.ts ของ actor (ร้านอื่น/ระบบอื่น = NOT_FOUND) · ลิงก์อ่านผ่าน `fileWhere`
// 🔴 AUDIT-CLASS X9: ลบได้เฉพาะผู้อัปโหลด หรือผู้จัดการ/เจ้าของร้าน (มติผู้คุมงาน C1.6 ข้อ 4) · ทุกการแนบ/ลบมีแถว audit
// 🔴 AUDIT-CLASS X8: ไม่มี event (ไม่มีชนิด event ของไฟล์ในสัญญา) · log/ops ไม่มีชื่อไฟล์หรือเนื้อไฟล์

import type { CrmFileLink } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { ALLOWED_UPLOAD_TYPES, deleteFileAsset, normalizeUploadType, privateFileUrl, uploadFile, type DeleteDeps, type UploadDeps } from "@/lib/storage/service";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { contactWhere, dealWhere, fileWhere, recordWhere } from "./where";
import { crmCan, crmForbiddenMessage } from "./access";
import * as companies from "./companies";
import {
  ActivitiesError,
  CRM_FILE_ENTITY_TYPES,
  CRM_FILE_MAX_BYTES,
  CRM_FILE_MIME_ALLOWLIST,
  CRM_FILE_NAME_MAX,
  INVISIBLE_CHARS_RE,
  type CrmFileEntityType,
  type FileLinkDto,
} from "./activities-shared";

export { CRM_FILE_ENTITY_TYPES, CRM_FILE_MAX_BYTES, CRM_FILE_MIME_ALLOWLIST, CRM_FILE_NAME_MAX };

export type FilesCtx = { tenantId: string; systemId: string; actorUserId: string | null };
export type FileDeps = { put?: UploadDeps["put"]; del?: DeleteDeps["del"] };
export type AttachFileInput = { entityType: string; entityId: string; filename: string; contentType: string; data: Uint8Array };

const NOT_FOUND_MSG = "ไม่พบรายการที่จะแนบไฟล์ในระบบ CRM ที่เปิดอยู่ (อาจถูกลบหรืออยู่คนละระบบ) — รีเฟรชหน้าแล้วลองใหม่";
const LINK_NOT_FOUND_MSG = "ไม่พบไฟล์แนบนี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่";
const fail = (code: ActivitiesError["code"], message: string) => new ActivitiesError(code, message);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const isManager = (a: MemberActor) => a.role === "OWNER" || a.role === "MANAGER";

function assertActor(actor: MemberActor | null | undefined): asserts actor is MemberActor {
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", NOT_FOUND_MSG);
}

/** AUDIT-CLASS X1: ctx.systemId ต้องเป็นระบบ CRM ของร้านนี้จริง */
async function enter(ctx: FilesCtx, actor: MemberActor | null | undefined): Promise<MemberActor> {
  assertActor(actor);
  const sys =
    typeof ctx?.systemId === "string" && typeof ctx?.tenantId === "string" && ctx.systemId && ctx.tenantId
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } })
      : null;
  if (!sys) throw fail("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  return actor;
}

function parseEntityType(v: unknown): CrmFileEntityType {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (!(CRM_FILE_ENTITY_TYPES as readonly string[]).includes(s)) throw fail("VALIDATION", "แนบไฟล์ได้กับผู้ติดต่อ บริษัท ดีล หรือรายการวัตถุเท่านั้น — เปิดหน้ารายการนั้นแล้วแนบใหม่");
  return s as CrmFileEntityType;
}

/** AUDIT-CLASS X1: ระเบียนแม่ต้องมองเห็นได้ในระบบนี้ — ไม่เห็น = NOT_FOUND (ข้อความไม่สะท้อนข้อมูลของเขา) */
async function assertEntity(ctx: FilesCtx, a: MemberActor, type: CrmFileEntityType, idRaw: unknown): Promise<string> {
  const id = str(idRaw);
  let found = false;
  if (id) {
    if (type === "CONTACT") found = (await prisma.crmContact.count({ where: { AND: [await contactWhere(ctx, a), { id }] } })) > 0;
    else if (type === "COMPANY") found = (await companies.companyRefsInTx(prisma, { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null }, a, [id])).length > 0; // ผ่าน companies.ts (companyWhere)
    else if (type === "DEAL") found = (await prisma.crmDeal.count({ where: { AND: [await dealWhere(ctx, a), { id }] } })) > 0;
    else found = (await prisma.customRecord.count({ where: { AND: [await recordWhere(ctx, a, { recordId: id }), { archivedAt: null }] } })) > 0;
  }
  if (!id || !found) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  return id;
}

/**
 * AUDIT-CLASS X6: ชื่อไฟล์ที่ปลอดภัย — ตัด / \ < > : " | ? * และตัวควบคุมทั้งหมด (NUL/CR/LF/TAB) · ไม่ขึ้นต้นด้วยจุด ·
 * ยาวไม่เกิน CRM_FILE_NAME_MAX (ตัดชื่อแต่คงนามสกุล) · ภาษาไทยคงไว้ · ว่าง = "ไฟล์แนบ.<ext>"
 */
export function sanitizeFileName(raw: unknown, ext: string): string {
  let s = typeof raw === "string" ? raw.normalize("NFC") : "";
  s = s.replace(INVISIBLE_CHARS_RE, "").replace(/[\u0000-\u001f\u007f-\u009f]+/g, "").replace(/[/\\<>:"|?*]+/g, "").replace(/\s+/g, " ").trim();
  s = s.replace(/^[.\s]+/, "").trim();
  if (!s) s = `ไฟล์แนบ.${ext}`;
  if (s.length > CRM_FILE_NAME_MAX) {
    const dot = s.lastIndexOf(".");
    const tail = dot > 0 && s.length - dot <= 10 ? s.slice(dot) : "";
    s = `${s.slice(0, CRM_FILE_NAME_MAX - tail.length).trim()}${tail}`;
    s = s.replace(/^[.\s]+/, "");
  }
  return s || `ไฟล์แนบ.${ext}`;
}

/** AUDIT-CLASS X10: DTO — ลิงก์ส่วนตัวที่ผูกกับผู้ดูคนนี้ (ไม่มี cdnUrl/path/ค่าหมาย) */
function toDto(row: CrmFileLink, viewerUserId: string): FileLinkDto {
  return {
    id: row.id,
    name: row.name,
    size: row.size,
    mime: row.mime,
    url: privateFileUrl(row.fileId, { kind: "STAFF", id: viewerUserId }),
    createdAt: row.createdAt.toISOString(),
    uploadedById: row.uploadedById,
    entityType: row.entityType as CrmFileEntityType,
    entityId: row.entityId,
  };
}

// CRM C1.7 ▸ คีย์ที่ต้องมีเพื่อแนบไฟล์ = คีย์แก้ไขของระเบียนแม่ ◂
const ATTACH_KEY: Readonly<Record<CrmFileEntityType, string>> = { CONTACT: "crm.contact.update", COMPANY: "crm.company.update", DEAL: "crm.deal.update", RECORD: "crm.record.update" };

/** แนบไฟล์ 1 ชิ้นกับระเบียน — ตรวจครบก่อนแตะที่เก็บ (ปฏิเสธ = ไม่มี put / FileAsset / ลิงก์) */
export async function attachFile(ctx: FilesCtx, actor: MemberActor, input: AttachFileInput, deps?: FileDeps): Promise<FileLinkDto> {
  const a = await enter(ctx, actor);
  const entityType = parseEntityType(input?.entityType);
  const entityId = await assertEntity(ctx, a, entityType, input?.entityId);
  // CRM C1.7 ▸ มองเห็นแล้ว (404 ก่อน) → คีย์แก้ไขของระเบียนแม่ (เห็นแต่ไม่มีคีย์ = 403 ข้อความไทย) ◂
  const key = ATTACH_KEY[entityType];
  if (!crmCan(a, key)) throw fail("FORBIDDEN", crmForbiddenMessage(key));
  const data = input?.data;
  if (!(data instanceof Uint8Array) || data.length === 0) throw fail("VALIDATION", "ไฟล์ว่างหรืออ่านไม่ได้ — เลือกไฟล์ใหม่อีกครั้ง");
  // AUDIT-CLASS X6: เพดานขนาด + ชนิดไฟล์ (ชุดย่อยของ storage ลบ SVG — สคริปต์ฝังใน SVG = stored XSS บนลิงก์ส่วนตัว)
  if (data.length > CRM_FILE_MAX_BYTES) throw fail("VALIDATION", `ไฟล์ใหญ่เกิน ${Math.round(CRM_FILE_MAX_BYTES / (1024 * 1024))} MB — ย่อขนาดหรือแบ่งไฟล์ก่อนแนบ`);
  const mime = normalizeUploadType(input?.contentType);
  const ext = ALLOWED_UPLOAD_TYPES[mime as keyof typeof ALLOWED_UPLOAD_TYPES];
  if (!CRM_FILE_MIME_ALLOWLIST.includes(mime) || !ext) {
    throw fail("VALIDATION", "ชนิดไฟล์นี้แนบใน CRM ไม่ได้ — รองรับ PDF · รูปภาพ (JPG/PNG/WEBP/GIF/HEIC) · Word · Excel · ข้อความ (.txt)");
  }
  const name = sanitizeFileName(input?.filename, ext);
  const up = await uploadFile(
    { tenantId: ctx.tenantId },
    { kind: "ATTACHMENT", filename: name, contentType: mime, data, maxBytes: CRM_FILE_MAX_BYTES, visibility: "private" },
    deps?.put ? { put: deps.put } : undefined,
  );
  if (!up.ok) throw fail("CONFLICT", "อัปโหลดไฟล์ไม่สำเร็จ ระบบยังไม่ได้แนบไฟล์นี้ — ลองใหม่อีกครั้งในอีกสักครู่");
  let row: CrmFileLink;
  try {
    row = await prisma.crmFileLink.create({
      data: { tenantId: ctx.tenantId, systemId: ctx.systemId, entityType, entityId, fileId: up.assetId, name, size: data.length, mime, uploadedById: a.userId },
    });
  } catch (e) {
    // ลิงก์เขียนไม่สำเร็จ = เก็บกวาดวัตถุที่เพิ่งอัป (ไม่ทิ้งไฟล์กำพร้าในถัง)
    await deleteFileAsset({ tenantId: ctx.tenantId }, up.assetId, deps?.del ? { del: deps.del } : undefined).catch(() => undefined);
    throw e;
  }
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? a.userId,
    action: "crm.file.attach",
    targetType: "CrmFileLink",
    targetId: row.id,
    after: { entityType, entityId, fileId: row.fileId, size: row.size, mime: row.mime },
  });
  return toDto(row, a.userId);
}

/** ไฟล์ของระเบียน (ใหม่สุดก่อน) — ลิงก์ในแต่ละแถวผูกกับผู้ดูคนนี้ */
export async function listFiles(ctx: FilesCtx, actor: MemberActor, input: { entityType: string; entityId: string }): Promise<{ items: FileLinkDto[] }> {
  const a = await enter(ctx, actor);
  const entityType = parseEntityType(input?.entityType);
  const entityId = await assertEntity(ctx, a, entityType, input?.entityId);
  const rows = await prisma.crmFileLink.findMany({
    where: { AND: [await fileWhere(ctx, a, { entityType, entityId }), { entityType, entityId }] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  return { items: rows.map((r) => toDto(r, a.userId)) };
}

/**
 * ลบไฟล์แนบ: วัตถุจริงบนที่เก็บ + FileAsset (`storage.deleteFileAsset`) แล้วค่อยลบลิงก์ (ที่เก็บล้ม = ลิงก์คงอยู่ ลองใหม่ได้)
 * AUDIT-CLASS X9: ผู้อัปโหลด หรือผู้จัดการ/เจ้าของร้านเท่านั้น (พนักงานคนอื่น = FORBIDDEN) · แถว audit
 */
export async function removeFile(ctx: FilesCtx, actor: MemberActor, linkId: string, opts?: { confirm?: boolean | null; reason?: string | null } | null, deps?: FileDeps): Promise<{ ok: true }> {
  const a = await enter(ctx, actor);
  const id = str(linkId);
  // CRM C1.7 ▸ หาลิงก์ในร้าน+ระบบก่อน แล้วตัดสินการมองเห็นจากระเบียนแม่ของมัน (fileWhere ต่อแม่ตัวเดียว — ไม่ดึงรายการ id ทั้งระบบ) ◂
  const cand = id ? await prisma.crmFileLink.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { entityType: true, entityId: true } }) : null;
  const row = cand ? await prisma.crmFileLink.findFirst({ where: { AND: [await fileWhere(ctx, a, cand), { id: id! }] } }) : null;
  if (!row) throw fail("NOT_FOUND", LINK_NOT_FOUND_MSG);
  // ระเบียนแม่ต้องยังมองเห็นได้ (C1.7 จำกัดการมองเห็นรายระเบียน — ลิงก์ของระเบียนที่มองไม่เห็น = ไม่พบ)
  await assertEntity(ctx, a, row.entityType as CrmFileEntityType, row.entityId).catch(() => {
    throw fail("NOT_FOUND", LINK_NOT_FOUND_MSG);
  });
  if (!isManager(a) && row.uploadedById !== a.userId) {
    throw fail("FORBIDDEN", "ลบไฟล์ได้เฉพาะคนที่อัปโหลดหรือผู้จัดการ — ขอให้ผู้จัดการช่วยลบให้");
  }
  const del = await deleteFileAsset({ tenantId: ctx.tenantId }, row.fileId, deps?.del ? { del: deps.del } : undefined);
  if (!del.ok) throw fail("CONFLICT", "ลบไฟล์จากที่เก็บไม่สำเร็จ ไฟล์ยังอยู่ครบ — ลองใหม่อีกครั้งในอีกสักครู่");
  await prisma.crmFileLink.deleteMany({ where: { id: row.id, tenantId: ctx.tenantId, systemId: ctx.systemId } });
  const reason = typeof opts?.reason === "string" ? opts.reason.trim().slice(0, 500) : null;
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? a.userId,
    action: "crm.file.remove",
    targetType: "CrmFileLink",
    targetId: row.id,
    before: { entityType: row.entityType, entityId: row.entityId, fileId: row.fileId, uploadedById: row.uploadedById },
    after: { removed: true, reason },
  });
  return { ok: true };
}
