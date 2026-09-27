// privacy.ts — PDPA ฝั่ง CRM (ใบ C3.9 · พิมพ์เขียว §11.7 · addendum ข้อ 1–3 · มติ C20/C21 · R-E.10)
//
//   eraseContact(ctx, actor|null, { contactId, confirm, reason, source? }, deps?) — ลบตามคำขอ = ทำให้ไม่ระบุตัวตน + ลบเนื้อหา/ไฟล์
//   exportContact(ctx, actor, contactId)          — ชุดข้อมูลของคนหนึ่งคน (คำขอเข้าถึงข้อมูล · ตารางเดียวกับขอบเขตการลบ)
//   exportTenant(ctx, actor, { format })         — ขอไฟล์ส่งออกทั้งระบบ = งาน `CrmImportJob` kind CRM_EXPORT บนเลนส่งออกของ C3.1
//   runExportJobs({ now, tenantIds, deps })       — ตัวทำงานส่งออก (lease · ไฟล์ส่วนตัว C0.4) — ขี่งานรายนาที `crm.reports.exports`
//   getExport(ctx, actor, jobId)                 — สถานะ + ลิงก์ชั่วคราว `/api/files/<id>` (เฉพาะผู้ขอ)
//   purge(now, { tenantIds, systemIds, deadline, signal, deps }) — ล้างตามอายุเก็บทั้งชุด (อีเมล · เสียง · เว็บ · ไฟล์ส่งออก · lead)
//   purgeExports / retentionLeads               — ตัวงานรายวัน `crm.purge.exports` · `crm.retention.leads`
//
// ขอบเขตการลบ (addendum ข้อ 1 — ทุกตารางของ RUN นี้ที่เก็บข้อมูลบุคคล):
//   ทำให้ไม่ระบุตัวตน: แถว CrmContact (ชื่อ = CRM_ERASED_NAME · ช่องตัวตนทั้งหมด null/[]) · Party (ไม่มีผู้ถืออื่น = ล้าง · มี = ตัดการผูก) ·
//     CrmCompanyContact (โน้ต/ตำแหน่ง) · CrmContactConsent (โน้ต) · หัวข้อกิจกรรม/แจ้งเตือน/ไทม์ไลน์สมาชิก/การ์ดบอร์ดงานที่ผูก (คำที่ระบุตัว → [ข้อมูลถูกลบ]) ·
//     ชื่อเรคคอร์ดกำหนดเองของคนนั้น · หัวจดหมาย (ผู้ส่ง/ผู้รับ/หัวข้อ)
//   ลบ: เนื้อจดหมาย + ไฟล์แนบ · เนื้อ/ถอดเสียง/สรุป AI ของกิจกรรม + ไฟล์เสียง · CrmWebSession/Event · CrmTrackedClick · CrmEmailEvent ·
//     พอร์ทัล (access/session/request ผ่าน `portal.eraseContact`) · AiProposal ที่เอ่ยถึง (นามบัตร) · ค่าฟิลด์กำหนดเองของเรคคอร์ดที่มีแม่เป็นคนนี้
//     + ค่าฟิลด์ sensitive ที่อ้าง Party (R-E.10) · MemberAccessLog แถวของ CRM · AutomationRun.payload
//   คงไว้ (ตัวเลข): ดีล (ชื่อ/มูลค่า/ขั้น/ยอดรับ/ผู้ดูแล) · ประวัติขั้น · CrmDealPayment · CrmCommission · แถวกิจกรรม (เหลือแต่เปลือก) · คะแนน
//   ⇒ AuditLog `crm.contact.erase` (เหตุผล) + outbox `crm.contact.erased` {contactId, systemId, partyId} (id ล้วน · X8) ใน tx เดียวกัน
//   ผู้ติดต่อที่ผูกสมาชิก ⇒ ลบสมาชิกครั้งเดียวผ่าน member facade (`eraseMemberById` → `member.erased`) — ตัวรับ `member.erased` ของ CRM
//     เจอผู้ติดต่อที่ลบแล้ว = ไม่ทำอะไร (ไม่มีการลบซ้อน)
//   source "RETENTION" (lead หมดอายุเก็บ): เหมือนกันทุกข้อ ยกเว้นเนื้อจดหมาย/ไฟล์เสียง ที่ถูกปิดชื่อแทนการลบ — สองอย่างนี้มีนาฬิกาอายุเก็บ
//     ของตัวเอง (`email.retentionDays` · `retention.recordingDays`) ⇒ งานล้างตามอายุเป็นเจ้าของ (ไม่มีสองงานแย่งลบไฟล์เดียวกัน · X5)
//
// AUDIT-CLASS X1: ทุกทางผูก tenant + ระบบ CRM · ผู้ติดต่อผ่าน contactWhere (มองไม่เห็น/ร้านอื่น/ระบบอื่น = NOT_FOUND ไม่ใช่ 403)
// AUDIT-CLASS X3: ลบซ้ำ/พร้อมกัน 10 ทาง = ครั้งเดียว — FOR UPDATE แถวผู้ติดต่อแล้วอ่านธง "ลบแล้ว" (ชื่อ) ใต้ล็อก · ผู้แพ้ได้ erased:false
// AUDIT-CLASS X4: ตัวรับ `member.erased` วิ่งซ้ำ/พร้อมกันได้ (ธงเดียวกันใต้ล็อกแถว)
// AUDIT-CLASS X5: งานส่งออกจองด้วย lease (FOR UPDATE SKIP LOCKED) · งานล้างทุกตัวจองแถวแบบมีเงื่อนไขก่อนลบไฟล์ ⇒ รอบซ้อน = ครั้งเดียวต่อแถว
// AUDIT-CLASS X6: ไฟล์ CSV ทุกเซลล์ผ่าน csvRow
// AUDIT-CLASS X8: payload/OpsEvent id ล้วน · ไฟล์ส่งออกไม่มีเนื้อจดหมาย · MANAGER ไม่ได้ค่าฟิลด์ sensitive
// AUDIT-CLASS X9: ลบ = การกระทำอันตราย (confirm + เหตุผล ≥ 5 · คีย์ crm.contact.delete) · ส่งออก = คีย์ crm.contact.export
// AUDIT-CLASS X10: ไฟล์ส่งออกเป็นไฟล์ส่วนตัว (t/<tid>/private/… · private://) · DTO มีแต่ลิงก์ลงนามอายุ ≤ 15 นาทีของผู้ขอ
import { Prisma } from "@prisma/client";
import type { CrmContact } from "@prisma/client";
import { csvRow } from "@/lib/core/csv";
import { emitOutbox } from "@/lib/core/outbox";
import { writeAudit } from "@/lib/core/audit";
import { deleteFileAsset, privateFileUrl, uploadFile, type UploadDeps } from "@/lib/storage/service";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { crmCan, crmForbiddenMessage, isApiActor } from "./access";
import { activityWhere, companyWhere, contactWhere, dealWhere } from "./where";
import { crmRetentionOf, parseCrmSettings } from "./settings";
import { CRM_HARD_CAPS } from "./limits-shared";
import { anonymizeContactInTx } from "./contacts";
import { isPlaceholderContactName, joinName } from "./contacts-shared";
import * as party from "@/lib/modules/party";
import { logOps } from "@/lib/core/ops";
import * as portal from "./portal";
import * as emails from "./emails";
import * as calls from "./calls";
import * as tracking from "./tracking";
import {
  CRM_ERASED_MASK,
  CRM_ERASE_AUDIT_ACTION,
  CRM_ERASED_NAME,
  CRM_ERASED_RECORD_TITLE,
  CRM_EXPORT_FORMATS,
  CRM_EXPORT_KIND,
  CRM_EXPORT_LEASE_MS,
  ERASE_SOURCES,
  EXPORT_TABLE_LABEL,
  LEAD_RETENTION_WARN_DAYS,
  PRIVACY_REASON_MAX,
  PRIVACY_REASON_MIN,
  PrivacyError,
  type ContactExportBundle,
  type CrmExportDto,
  type CrmExportFormat,
  type CrmExportStatus,
  type EraseCounts,
  type EraseResult,
  type EraseSource,
  type PurgeSummary,
} from "./privacy-shared";

export { CRM_ERASED_NAME, CRM_EXPORT_KIND, PrivacyError };
export type { ContactExportBundle, CrmExportDto, EraseCounts, EraseResult, EraseSource, PurgeSummary };

export type PrivacyCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
/** ที่เก็บไฟล์ฉีดได้ (ข้อสอบ) — `del` คืน void (throw = ลบไม่สำเร็จ) หรือ status code · `put` = ตัวอัปโหลดของ C0.4 */
export type PrivacyDeps = { del?: (path: string) => Promise<unknown>; put?: UploadDeps["put"] };

type Tx = Prisma.TransactionClient;
type Actor = MemberActor;

const TX_OPTS = { maxWait: 30_000, timeout: 60_000 } as const;
const DAY_MS = 86_400_000;
const EXPORT_BATCH_MAX = 5;
const LEAD_BATCH_MAX = 200;
const NOT_FOUND_MSG = "ไม่พบผู้ติดต่อนี้ในระบบ CRM ที่เปิดอยู่ (อาจถูกลบหรืออยู่นอกทีมของคุณ) — รีเฟรชหน้าแล้วลองใหม่";
const SYSTEM_404 = "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const EXPORT_404 = "ไม่พบไฟล์ส่งออกนี้ (อาจเป็นของบัญชีอื่นหรือถูกล้างไปแล้ว) — กดส่งออกใหม่ได้เลย";
const API_EXPORT_MSG = "การส่งออกข้อมูลทั้งระบบทำได้จากหน้าจอโดยพนักงานเท่านั้น (คีย์ API ไม่มีตัวตนของผู้ขอ)";

const fail = (code: PrivacyError["code"], message: string) => new PrivacyError(code, message);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** del ของผู้ฉีด (ข้อสอบคืน void) → รูปของตัวลบกลาง (status code) · ไม่ฉีด = ที่เก็บจริง */
function storeDeps(deps?: PrivacyDeps | null): { del?: (path: string) => Promise<number> } | undefined {
  const del = deps?.del;
  if (typeof del !== "function") return undefined;
  return { del: async (p: string) => {
    const r = await del(p);
    return typeof r === "number" && Number.isFinite(r) ? r : 204;
  } };
}

// ───────────────────────── ด่าน ─────────────────────────

/** AUDIT-CLASS X1: ctx.systemId ต้องเป็นระบบ CRM ของร้านนี้ */
async function resolveSystem(ctx: PrivacyCtx): Promise<{ tenantId: string; systemId: string; settings: Prisma.JsonValue }> {
  const sys =
    ctx && typeof ctx.tenantId === "string" && typeof ctx.systemId === "string" && ctx.tenantId && ctx.systemId
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true, tenantId: true, settings: true } })
      : null;
  if (!sys) throw fail("NOT_FOUND", SYSTEM_404);
  return { tenantId: sys.tenantId, systemId: sys.id, settings: sys.settings };
}

function assertStaff(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", NOT_FOUND_MSG);
}

function need(actor: Actor, key: string): void {
  if (!crmCan(actor, key)) throw fail("FORBIDDEN", crmForbiddenMessage(key));
}

/** ผู้ติดต่อ 1 คนตามการมองเห็นของผู้ดู (actor null = ผู้เรียกระบบ → ขอบเขตร้าน + ระบบ) */
async function loadContact(ctx: PrivacyCtx, actor: Actor | null, id: string): Promise<CrmContact> {
  const cid = str(id);
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId, id: cid };
  const row = !cid ? null : actor ? await prisma.crmContact.findFirst({ where: { AND: [await contactWhere(ctx, actor), scope] } }) : await prisma.crmContact.findFirst({ where: scope });
  if (!row) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  return row;
}

/**
 * ธง "ลบแล้ว" = แถว AuditLog `crm.contact.erase` ของผู้ติดต่อนี้ (รีวิว C3.9 S2 · มติผู้คุมงาน) — ชื่อ `CRM_ERASED_NAME` เป็นแค่ป้ายแสดงผล
 * (คนกรอกฟอร์มพิมพ์ชื่อนั้นเองได้ ⇒ ใช้ชื่อเป็นธงไม่ได้ · ตัวเขียนผู้ติดต่อทุกทางปฏิเสธชื่อสงวนอีกชั้น)
 */
async function erasedAudit(db: Tx | typeof prisma, tenantId: string, contactId: string): Promise<{ id: string; after: Prisma.JsonValue } | null> {
  return db.auditLog.findFirst({ where: { tenantId, action: CRM_ERASE_AUDIT_ACTION, targetId: contactId }, select: { id: true, after: true }, orderBy: { createdAt: "asc" } });
}

/** ผู้ติดต่อคนนี้ถูกลบตาม PDPA แล้วหรือยัง (หน้า 360 · ผู้เรียกอื่น) */
export async function isContactErased(tenantId: string, contactId: string): Promise<boolean> {
  return !!(typeof tenantId === "string" && tenantId && typeof contactId === "string" && contactId && (await erasedAudit(prisma, tenantId, contactId)));
}

type IdentityRow = { name: string; firstName: string | null; lastName: string | null; phone: string | null; email: string | null; lineUserId: string | null; previousEmails: string[] };

/**
 * คำที่ระบุตัวคนนี้ (ใช้ปิดข้อความที่คงแถวไว้) — รีวิว C3.9 S1 (มติผู้คุมงาน): **ชื่อเต็ม** (ชื่อ+นามสกุล · ไม่ใช้ชื่อ/นามสกุลแยกท่อน —
 * ท่อนสั้น ๆ ไปทับคำทั่วไปของคนอื่น) · เบอร์ · อีเมล · LINE id · อีเมลเก่า — ต่ำกว่า 4 ตัวอักษร = ไม่ใช้
 */
function identityTokens(rows: readonly IdentityRow[], party: { phone: string | null; email: string | null }[]): string[] {
  const raw: (string | null | undefined)[] = [];
  // รีวิวรอบ 2 SF2: ชื่อแทนของระบบ ("ไม่ระบุชื่อ" ฯลฯ — `CONTACT_NAME_PLACEHOLDERS`) ไม่ใช่ตัวตนของใคร ⇒ ไม่ใช้เป็นคำระบุตัว
  //   (ชื่อที่ทุกคำเป็นคำแทนชื่อ เช่น "ไม่ระบุชื่อ" หรือ "ลูกค้า ไม่ระบุ" = ไม่ใช่ชื่อจริง · มีคำจริงอย่างน้อย 1 คำ = ใช้ทั้งชื่อ)
  const realName = (v: string | null | undefined) => {
    const words = (v ?? "").trim().split(/\s+/).filter(Boolean);
    return words.length > 0 && !isPlaceholderContactName(v) && words.some((w) => !isPlaceholderContactName(w)) ? (v as string) : null;
  };
  for (const r of rows) raw.push(realName(r.name), realName(joinName(r.firstName, r.lastName)), r.phone, r.email, r.lineUserId, ...(r.previousEmails ?? []));
  for (const p of party) raw.push(p.phone, p.email);
  const out = new Set<string>();
  for (const v of raw) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s.length >= 4 && s !== CRM_ERASED_NAME) out.add(s);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

function maskText(v: string | null, tokens: readonly string[]): string | null {
  if (v === null) return null;
  let s = v;
  for (const t of tokens) if (s.includes(t)) s = s.split(t).join(CRM_ERASED_MASK);
  return s;
}

function jsonClean(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Prisma.Decimal) return v.toString();
  if (Array.isArray(v)) return v.map(jsonClean);
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonClean(x)]));
  return v;
}
const rowsOf = (rows: readonly object[]): Record<string, unknown>[] => rows.map((r) => jsonClean(r) as Record<string, unknown>);

// ═════════════════════════ ลบตามคำขอ (erase) ═════════════════════════

const ZERO_COUNTS: EraseCounts = {
  emails: 0,
  activities: 0,
  recordings: 0,
  files: 0,
  webSessions: 0,
  clicks: 0,
  portal: 0,
  proposals: 0,
  notifications: 0,
  customValues: 0,
  records: 0,
  consents: 0,
  fileLinks: 0,
  mergedContacts: 0,
  partyAnonymised: false,
  memberErased: false,
};

type EraseInput = { contactId: string; confirm?: boolean | null; reason?: string | null; source?: EraseSource | string | null };

/**
 * ลบผู้ติดต่อตามคำขอ PDPA — idempotent (ลบแล้ว = `erased:false` ไม่มี audit/event ใหม่ · ไม่ทำอะไรต่อ) · ผู้เรียกระบบส่ง actor = null
 * (ตัวรับ `member.erased` · งานอายุเก็บ lead) · ผู้เรียกที่เป็นคนต้องถือ `crm.contact.delete`
 * ข้อมูลในฐานทั้งหมดหายใน tx เดียว (รวมผู้ติดต่อที่ถูกรวมเข้ามาทั้งสาย · พอร์ทัล · ลิงก์ไฟล์) ⇒ commit แล้ว = ลบแล้วจริง ·
 * ขั้นหลัง commit (`completeErasure`: วัตถุบนที่เก็บ · คำขออนุมัติ · สมาชิก) เป็นของตัวรับ `crm.contact.erased` (ส่งใหม่จนสำเร็จ) —
 * ที่นี่ลองทำให้ทันทีหนึ่งครั้งแบบ best-effort (ล้ม = followUp "PENDING" ไม่ใช่ error — การลบ commit ไปแล้ว)
 */
export async function eraseContact(ctx: PrivacyCtx, actor: Actor | null, input: EraseInput, deps?: PrivacyDeps | null): Promise<EraseResult> {
  // AUDIT-CLASS X9: ด่านของการกระทำอันตรายมาก่อนแตะฐาน (ไม่มี confirm / เหตุผลสั้น = ไม่แตะอะไรเลย)
  if (input?.confirm !== true) throw fail("CONFIRM_REQUIRED", "การลบข้อมูลส่วนบุคคลย้อนกลับไม่ได้ — ติ๊กยืนยันก่อนแล้วลองอีกครั้ง");
  const reason = str(input?.reason);
  if (reason.length < PRIVACY_REASON_MIN) throw fail("VALIDATION", `ใส่เหตุผลของการลบอย่างน้อย ${PRIVACY_REASON_MIN} ตัวอักษร (เช่น "ลูกค้าขอลบข้อมูลทางอีเมล") เพื่อเก็บเป็นหลักฐาน`);
  if (reason.length > PRIVACY_REASON_MAX) throw fail("VALIDATION", `เหตุผลยาวเกิน ${PRIVACY_REASON_MAX} ตัวอักษร — ย่อให้สั้นลงแล้วลองใหม่`);
  const source: EraseSource = (ERASE_SOURCES as readonly string[]).includes(str(input?.source)) ? (str(input?.source) as EraseSource) : "REQUEST";
  if (actor) assertStaff(actor);
  const sys = await resolveSystem(ctx);
  const c = { tenantId: sys.tenantId, systemId: sys.systemId, actorUserId: actor ? actor.userId : null };
  const pre = await loadContact(c, actor, input?.contactId);
  if (actor) need(actor, "crm.contact.delete");

  const out = await prisma.$transaction((tx) => eraseInTx(tx, c, pre.id, reason, source), TX_OPTS);
  // รีวิว C3.9 B3: ผู้แพ้การแข่ง/เรียกซ้ำ = จบตรงนี้ (ไม่มีทางซ่อมในโพรเซส — งานค้างเป็นของตัวรับ event ที่ส่งใหม่จนสำเร็จ)
  if (!out.erased) return { contactId: pre.id, partyId: out.partyId, erased: false, counts: null, followUp: null };
  let followUp: "DONE" | "PENDING" = "DONE";
  let post = { files: 0, memberErased: false };
  try {
    post = await completeErasure(c.tenantId, pre.id, deps);
  } catch {
    followUp = "PENDING"; // completeErasure ลง OpsEvent WARN (id ล้วน) ไว้แล้ว · ตัวรับ event ทำต่อ
  }
  return { contactId: pre.id, partyId: out.partyId, erased: true, counts: { ...out.counts, files: post.files, memberErased: post.memberErased }, followUp };
}

type EraseTxOut = { erased: boolean; partyId: string | null; counts: EraseCounts };

/** ผู้ติดต่อที่ถูกรวมเข้ามาในคนนี้ทั้งสาย (`mergedIntoId` ซ้อนกันได้) — รีวิว C3.9 B2 */
const CHAIN_DEPTH_MAX = 20;
const CHAIN_ROWS_MAX = 1_000;
async function mergedChain(tx: Tx, ctx: { tenantId: string; systemId: string }, id: string): Promise<{ ids: string[]; truncated: boolean }> {
  const out: string[] = [];
  const seen = new Set([id]);
  let frontier = [id];
  let truncated = false;
  for (let depth = 0; frontier.length; depth += 1) {
    if (depth >= CHAIN_DEPTH_MAX) {
      truncated = true;
      break;
    }
    const rows = await tx.crmContact.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, mergedIntoId: { in: frontier } }, select: { id: true }, take: CHAIN_ROWS_MAX + 1 });
    if (rows.length > CHAIN_ROWS_MAX) truncated = true;
    frontier = rows.slice(0, CHAIN_ROWS_MAX).map((r) => r.id).filter((x) => !seen.has(x));
    for (const x of frontier) {
      seen.add(x);
      out.push(x);
    }
  }
  return { ids: out, truncated };
}

async function eraseInTx(tx: Tx, ctx: PrivacyCtx & { actorUserId: string | null }, id: string, reason: string, source: EraseSource): Promise<EraseTxOut> {
  const t = ctx.tenantId;
  const sysScope = { tenantId: t, systemId: ctx.systemId };
  // AUDIT-CLASS X3: ล็อกแถวก่อนอ่านธง — 10 ทางพร้อมกันรอกันที่นี่ แล้วอ่านธง (แถว audit ของคนที่ชนะ commit แล้ว) ⇒ ผู้ชนะคนเดียว
  await tx.$queryRaw`SELECT "id" FROM "CrmContact" WHERE "id" = ${id} AND "tenantId" = ${t} AND "systemId" = ${ctx.systemId} FOR UPDATE`;
  const row = await tx.crmContact.findFirst({ where: { id, ...sysScope } });
  if (!row) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  if (await erasedAudit(tx, t, id)) return { erased: false, partyId: row.partyId, counts: { ...ZERO_COUNTS } };
  const now = new Date();
  const counts: EraseCounts = { ...ZERO_COUNTS };

  // ── รีวิว C3.9 B2: ผู้ติดต่อที่ถูกรวมเข้ามา (ทั้งสาย) คือคนเดียวกัน ⇒ ลบในขอบเขตเดียวกัน ล็อกเรียง id ──
  const chainOut = await mergedChain(tx, sysScope, id);
  const chain = chainOut.ids;
  // รีวิวรอบ 2 N3: สายยาวเกินเพดาน (20 ชั้น / 1,000 แถวต่อชั้น) = ไม่ตัดเงียบ — WARN (id ล้วน) ให้ตามลบส่วนที่เหลือ (ลบคนเหล่านั้นตรง ๆ ได้)
  if (chainOut.truncated) {
    await logOps("WARN", "crm.privacy", "สายผู้ติดต่อที่ถูกรวมยาวเกินเพดานของการลบครั้งเดียว — ลบส่วนที่เหลือเพิ่มเติม", { tenantId: t, detail: JSON.stringify({ contactId: id, reached: chain.length }) });
  }
  if (chain.length) await tx.$queryRaw`SELECT "id" FROM "CrmContact" WHERE "id" = ANY(${[...chain].sort()}::text[]) AND "tenantId" = ${t} ORDER BY "id" FOR UPDATE`;
  const chainRows = chain.length ? await tx.crmContact.findMany({ where: { id: { in: chain }, ...sysScope } }) : [];
  const people = [row, ...chainRows];
  const ids = people.map((p) => p.id);
  counts.mergedContacts = chainRows.length;
  const partyIds = [...new Set(people.map((p) => p.partyId).filter((x): x is string => !!x))];
  const parties = partyIds.length ? await tx.party.findMany({ where: { id: { in: partyIds }, tenantId: t }, select: { id: true, phone: true, email: true } }) : [];
  const linkedMembers = [...new Set(people.map((p) => p.memberCustomerId).filter((x): x is string => !!x))];
  // รีวิวรอบ 2 N5: สมาชิกถูกลบคู่กันเฉพาะคำขอของคน (REQUEST) — งานอัตโนมัติ (RETENTION) ห้ามลบสมาชิกเด็ดขาด · MEMBER = สมาชิกถูกลบมาก่อนแล้ว
  const memberCustomerIds = source === "REQUEST" ? linkedMembers : [];
  const tokens = identityTokens(people, parties);
  const personAddrs = new Set(
    [...people.flatMap((p) => [p.email, ...(p.previousEmails ?? [])]), ...parties.map((p) => p.email)].filter((x): x is string => !!x).map((x) => x.trim().toLowerCase()),
  );
  const fileIds: string[] = [];
  const contentToo = source !== "RETENTION";

  // ── อีเมล (แถวคงอยู่ · ล็อกแถวก่อนเก็บรหัสไฟล์แนบ — งานล้างตามอายุที่วิ่งพร้อมกันรอแล้วเห็นว่าจองไปแล้ว) ──
  const mails = await tx.$queryRaw<{ id: string; direction: string; status: string; fromAddr: string; fromName: string | null; toAddrs: string[]; ccAddrs: string[]; bccAddrs: string[]; subject: string; bodyHtml: string | null; bodyText: string | null; snippet: string | null; attachments: Prisma.JsonValue }[]>`
    SELECT "id", "direction"::text AS "direction", "status"::text AS "status", "fromAddr", "fromName", "toAddrs", "ccAddrs", "bccAddrs", "subject", "bodyHtml", "bodyText", "snippet", "attachments"
      FROM "CrmEmailMessage" WHERE "tenantId" = ${t} AND "systemId" = ${ctx.systemId} AND "contactId" = ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
  const keepAddr = (a: string) => !personAddrs.has(a.trim().toLowerCase()) && !tokens.some((tk) => a.includes(tk));
  for (const m of mails) {
    const inbound = m.direction === "IN";
    const queued = m.status === "QUEUED";
    const data: Prisma.CrmEmailMessageUpdateInput = {
      subject: maskText(m.subject, tokens) ?? "",
      fromAddr: keepAddr(m.fromAddr) ? m.fromAddr : "",
      fromName: inbound ? null : maskText(m.fromName, tokens),
      toAddrs: m.toAddrs.filter(keepAddr),
      ccAddrs: m.ccAddrs.filter(keepAddr),
      bccAddrs: m.bccAddrs.filter(keepAddr),
      providerError: null,
      // NOTE รีวิว C3.9: จดหมายที่ตั้งเวลาไว้ถึงคนที่ถูกลบต้องไม่ถูกส่งออกไปอีก (ปลายทางถูกล้างแล้ว) ⇒ FAILED ใน tx เดียวกัน
      ...(queued ? { status: "FAILED" as const, scheduledAt: null, leaseUntil: null } : {}),
    };
    if (contentToo || queued) {
      for (const a of Array.isArray(m.attachments) ? m.attachments : []) {
        const fid = isObj(a) && typeof a.fileId === "string" ? a.fileId : null;
        if (fid) fileIds.push(fid);
      }
      Object.assign(data, { bodyHtml: null, bodyText: null, snippet: null, attachments: Prisma.DbNull, purgedAt: now });
    } else {
      Object.assign(data, { bodyHtml: maskText(m.bodyHtml, tokens), bodyText: maskText(m.bodyText, tokens), snippet: maskText(m.snippet, tokens) });
    }
    await tx.crmEmailMessage.update({ where: { id: m.id }, data });
  }
  counts.emails = mails.length;
  if (mails.length) await tx.crmEmailEvent.deleteMany({ where: { emailId: { in: mails.map((m) => m.id) } } });

  // ── กิจกรรม (แถว + ตัวเลขคงอยู่ · เนื้อ/ถอดเสียง/สรุป AI หาย · ไฟล์เสียงลบหลัง commit) ──
  const acts = await tx.$queryRaw<{ id: string; title: string; recordingFileId: string | null }[]>`
    SELECT "id", "title", "recordingFileId" FROM "CrmActivity" WHERE "tenantId" = ${t} AND "contactId" = ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
  for (const a of acts) {
    const data: Prisma.CrmActivityUpdateInput = { body: null, transcript: null, aiSummary: null, aiNextStep: null, location: null, meetingUrl: null, attendees: Prisma.DbNull };
    const title = maskText(a.title, tokens);
    if (title !== a.title) data.title = title ?? "";
    if (contentToo && a.recordingFileId) {
      fileIds.push(a.recordingFileId);
      data.recordingFileId = null;
      counts.recordings += 1;
    }
    await tx.crmActivity.update({ where: { id: a.id }, data });
  }
  counts.activities = acts.length;

  // ── เว็บ · ลิงก์ติดตาม ──
  const sessions = (await tx.crmWebSession.findMany({ where: { tenantId: t, contactId: { in: ids } }, select: { id: true } })).map((s) => s.id);
  if (sessions.length) {
    await tx.crmWebEvent.deleteMany({ where: { sessionId: { in: sessions } } });
    await tx.crmTrackedClick.deleteMany({ where: { tenantId: t, webSessionId: { in: sessions } } });
    counts.webSessions = (await tx.crmWebSession.deleteMany({ where: { id: { in: sessions } } })).count;
  }
  counts.clicks = (await tx.crmTrackedClick.deleteMany({ where: { tenantId: t, contactId: { in: ids } } })).count;

  // ── พอร์ทัล (รีวิว C3.9 B3): แถวทั้งหมดหายใน tx นี้ (`portal.eraseContactInTx` — ของ C3.5) · คำขออนุมัติยกเลิกหลัง commit ──
  const portalOut = await portal.eraseContactInTx(tx, sysScope, ids);
  counts.portal = portalOut.accesses + portalOut.sessions + portalOut.requests;

  // ── ข้อเสนอ AI (นามบัตร/lead · รีวิว C3.9 S1): เฉพาะข้อเสนอชนิดของ CRM ที่เอ่ยถึงคนนี้ หรือข้อเสนอใดก็ตามที่พก id ของคนนี้ ──
  for (const cid of ids) counts.proposals += Number(await tx.$executeRaw`DELETE FROM "AiProposal" WHERE "tenantId" = ${t} AND strpos("payload"::text, ${cid}) > 0`);
  for (const tk of tokens) {
    counts.proposals += Number(
      await tx.$executeRaw`DELETE FROM "AiProposal" WHERE "tenantId" = ${t} AND "kind" LIKE 'crm%' AND (strpos("payload"::text, ${tk}) > 0 OR strpos("summary", ${tk}) > 0)`,
    );
  }

  // ── แจ้งเตือนในแอป (แถวคงอยู่ · คำที่ระบุตัว → [ข้อมูลถูกลบ]) ──
  //   🔴 AppNotification ไม่มีคอลัมน์อ้างอิง (refType/refId) ⇒ ขอบเขต = ข้อความที่มีคำระบุตัวแบบเต็ม (ชื่อเต็ม · เบอร์ · อีเมล · LINE id)
  //      เท่านั้น (ไม่ใช่ชื่อ/นามสกุลแยกท่อน — รีวิว C3.9 S1) · ข้อสอบ C3.9-S1.3 บังคับให้แจ้งเตือนที่เอ่ยชื่อ+เบอร์ถูกล้าง
  for (const tk of tokens) {
    counts.notifications += Number(
      await tx.$executeRaw`UPDATE "AppNotification" SET "title" = replace("title", ${tk}, ${CRM_ERASED_MASK}), "body" = replace("body", ${tk}, ${CRM_ERASED_MASK})
                            WHERE "tenantId" = ${t} AND (strpos("title", ${tk}) > 0 OR strpos("body", ${tk}) > 0)`,
    );
  }

  // ── ข้อมูลกำหนดเอง (R-E.10): ค่าทุกช่องของเรคคอร์ดที่มีแม่เป็นคนนี้ + ค่าฟิลด์ของตัวผู้ติดต่อ + ค่า sensitive ที่อ้าง Party ──
  const recs = (await tx.customRecord.findMany({ where: { tenantId: t, parentType: "CONTACT", parentId: { in: ids } }, select: { id: true } })).map((r) => r.id);
  const valueRecordIds = [...ids, ...recs];
  // รีวิว C3.9 B1(ข): ไฟล์ของฟิลด์ชนิดไฟล์ถูกลบ **ทุกชนิดการลบ** (ไม่มีงานล้างตามอายุตัวไหนเป็นเจ้าของ)
  const valueFiles = await tx.customRecordValue.findMany({ where: { tenantId: t, recordId: { in: valueRecordIds }, valueFileId: { not: null } }, select: { valueFileId: true } });
  for (const v of valueFiles) if (v.valueFileId) fileIds.push(v.valueFileId);
  counts.customValues = (await tx.customRecordValue.deleteMany({ where: { tenantId: t, recordId: { in: valueRecordIds } } })).count;
  await tx.customRecordValueHistory.deleteMany({ where: { tenantId: t, recordId: { in: valueRecordIds } } });
  if (partyIds.length) {
    const partyRecs = (await tx.customRecord.findMany({ where: { tenantId: t, partyId: { in: partyIds } }, select: { id: true } })).map((r) => r.id);
    if (partyRecs.length) {
      const sens = { tenantId: t, recordId: { in: partyRecs }, field: { sensitive: true } };
      for (const v of await tx.customRecordValue.findMany({ where: { ...sens, valueFileId: { not: null } }, select: { valueFileId: true } })) if (v.valueFileId) fileIds.push(v.valueFileId);
      counts.customValues += (await tx.customRecordValue.deleteMany({ where: sens })).count;
    }
  }
  if (recs.length) counts.records = (await tx.customRecord.updateMany({ where: { id: { in: recs } }, data: { title: CRM_ERASED_RECORD_TITLE } })).count;
  // แถว MemberAccessLog ของ CRM (หนี้ C1.2a S3 — `page = crm.<objectKey>` · customerId = รหัสระเบียนของ CRM)
  await tx.memberAccessLog.deleteMany({ where: { tenantId: t, customerId: { in: valueRecordIds }, page: { startsWith: "crm." } } });

  // ── รีวิว C3.9 B1(ก): ไฟล์แนบของผู้ติดต่อ / เรคคอร์ดของเขา / กิจกรรมของเขา (CrmFileLink) — ลิงก์หายใน tx · วัตถุลบหลัง commit ──
  const linkWhere: Prisma.CrmFileLinkWhereInput = {
    ...sysScope,
    OR: [
      { entityType: "CONTACT", entityId: { in: ids } },
      ...(recs.length ? [{ entityType: "RECORD", entityId: { in: recs } }] : []),
      ...(acts.length ? [{ entityType: "ACTIVITY", entityId: { in: acts.map((a) => a.id) } }] : []),
    ],
  };
  for (const l of await tx.crmFileLink.findMany({ where: linkWhere, select: { fileId: true } })) fileIds.push(l.fileId);
  counts.fileLinks = (await tx.crmFileLink.deleteMany({ where: linkWhere })).count;

  // ── ความยินยอม (แถว + สถานะคงอยู่เป็นหลักฐาน · โน้ตหาย) · บริษัทของผู้ติดต่อ ──
  counts.consents = (await tx.crmContactConsent.updateMany({ where: { tenantId: t, contactId: { in: ids }, note: { not: null } }, data: { note: null } })).count;
  await tx.crmCompanyContact.updateMany({ where: { tenantId: t, contactId: { in: ids } }, data: { note: null, jobTitle: null } });

  // ── ไทม์ไลน์สมาชิกที่ผูกคนนี้ · กฎอัตโนมัติ · การ์ดบอร์ดงานที่ผูก · ลำดับการติดตามที่เดินอยู่ ──
  const timeline = await tx.memberActivity.findMany({ where: { tenantId: t, crmContactId: { in: ids } }, select: { id: true, summary: true } });
  for (const r of timeline) await tx.memberActivity.update({ where: { id: r.id }, data: { summary: maskText(r.summary, tokens) ?? "", data: Prisma.DbNull } });
  await tx.automationRun.updateMany({ where: { tenantId: t, crmContactId: { in: ids } }, data: { payload: Prisma.DbNull, detail: null } });
  const cardIds = (await tx.kanbanCardLink.findMany({ where: { tenantId: t, linkType: "CRM_CONTACT", linkId: { in: ids } }, select: { cardId: true } })).map((l) => l.cardId);
  if (cardIds.length) {
    const cards = await tx.kanbanCard.findMany({ where: { tenantId: t, id: { in: cardIds } }, select: { id: true, title: true, description: true } });
    for (const cd of cards) {
      const title = maskText(cd.title, tokens) ?? "";
      const description = maskText(cd.description, tokens);
      if (title !== cd.title || description !== cd.description) await tx.kanbanCard.update({ where: { id: cd.id }, data: { title, description } });
    }
  }
  await tx.crmSequenceEnrollment.updateMany({
    where: { tenantId: t, contactId: { in: ids }, status: { in: ["ACTIVE", "PAUSED"] } },
    data: { status: "STOPPED", stoppedReason: "ERASED", stoppedAt: now, nextAt: null, leaseUntil: null },
  });

  // ── Party: ไม่มีผู้ถืออื่น (ตัวนับเดียวของร้าน `party.countPartyHolders` · ไม่นับคนในสายนี้และสมาชิกที่ถูกลบคู่กัน) = ล้างตัวตน ·
  //    มี = ตัดการผูกของแถวในสายนี้ ──
  const unlinkParty = new Set<string>();
  for (const pid of partyIds) {
    const holders = await party.countPartyHolders(t, pid, { crmContactIds: ids, customerIds: memberCustomerIds }, tx);
    if (holders === 0) {
      await tx.party.updateMany({ where: { id: pid, tenantId: t }, data: { name: CRM_ERASED_NAME, phone: null, phoneNorm: null, email: null, taxId: null, address: null } });
      counts.partyAnonymised = true;
    } else unlinkParty.add(pid);
  }

  // ── แถวผู้ติดต่อ (ทั้งสาย): ชื่อ = ป้าย "ลบแล้ว" · ทุกช่องตัวตน null/[] · ปิดทุกช่องทางติดต่อ · เก็บถาวร ──
  // C1.4-S0.8: คอลัมน์ที่มีกฎธุรกิจของ CrmContact เขียนได้เฉพาะในบริการผู้ติดต่อ ⇒ ตัวเขียนอยู่ที่ `contacts.ts#anonymizeContactInTx`
  for (const p of people) {
    await anonymizeContactInTx(tx, sysScope, p.id, { name: CRM_ERASED_NAME, now, keepArchivedAt: p.archivedAt, unlinkParty: !!p.partyId && unlinkParty.has(p.partyId) });
  }

  // ── หลักฐาน (= ธง "ลบแล้ว") + event (tx เดียวกัน) ──
  //   `after.followUp` = งานหลัง commit เป็น id ล้วน (ไฟล์ · คำขออนุมัติ · สมาชิก) — ตัวรับ `crm.contact.erased` อ่านจากแถวนี้
  //   (payload ของ event เป็น id ของผู้ติดต่อ/ระบบ/Party/สมาชิกเท่านั้น — ข้อสอบ C3.9-S1.4 ตรึงชุดคีย์ไว้)
  const followUp = { fileIds: [...new Set(fileIds)], approvalRequestIds: portalOut.approvalRequestIds, memberCustomerIds };
  const audit = (targetId: string, extra: Record<string, unknown>) =>
    tx.auditLog.create({
      data: { tenantId: t, actorType: ctx.actorUserId ? "USER" : "SYSTEM", actorId: ctx.actorUserId, action: CRM_ERASE_AUDIT_ACTION, targetType: "CrmContact", targetId, after: { reason, source, systemId: ctx.systemId, ...extra } as Prisma.InputJsonValue },
    });
  const partyId = row.partyId;
  await audit(id, { partyId, memberCustomerId: row.memberCustomerId, mergedIds: chain, counts: { ...counts, files: followUp.fileIds.length }, followUp });
  for (const m of chain) await audit(m, { mergedInto: id, partyId: people.find((p) => p.id === m)?.partyId ?? null });
  await emitOutbox(tx, {
    tenantId: t,
    type: "crm.contact.erased",
    idempotencyKey: `crm.contact.erased#${id}`,
    payload: { contactId: id, systemId: ctx.systemId, ...(partyId ? { partyId } : {}), ...(row.memberCustomerId ? { customerId: row.memberCustomerId } : {}) },
    systemId: ctx.systemId,
  });
  return { erased: true, partyId, counts };
}

/**
 * ขั้นหลัง commit ของการลบ (รีวิว C3.9 B3 · มติผู้คุมงาน) — วัตถุไฟล์บนที่เก็บ · ยกเลิกคำขออนุมัติของพอร์ทัล · ลบสมาชิกที่ผูก (member facade)
 * อ่านงานจากแถว audit ของการลบ (id ล้วน) ⇒ ทำซ้ำ/พร้อมกันได้: ไฟล์ที่ลบแล้ว = ไม่มีแถว = สำเร็จ · คำขอที่ปิดแล้ว = ข้าม · สมาชิกที่ลบแล้ว = เงียบ
 * ขั้นไหนล้ม = ทำขั้นอื่นต่อให้ครบ แล้ว OpsEvent WARN (id ล้วน) + throw ⇒ ตัวรับ event ส่งใหม่
 */
export async function completeErasure(tenantId: string, contactId: string, deps?: PrivacyDeps | null): Promise<{ files: number; memberErased: boolean }> {
  const a = await erasedAudit(prisma, tenantId, contactId);
  const f = a && isObj(a.after) && isObj(a.after.followUp) ? a.after.followUp : null;
  if (!f) return { files: 0, memberErased: false };
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : []);
  const failed: string[] = [];
  let files = 0;
  const d = storeDeps(deps);
  for (const fid of ids(f.fileIds)) {
    const r = await deleteFileAsset({ tenantId }, fid, d).catch(() => ({ ok: false as const }));
    if (r.ok) files += 1;
    else failed.push(`file:${fid}`);
  }
  await portal.cancelErasedApprovals(tenantId, ids(f.approvalRequestIds)).catch(() => failed.push("approvals"));
  let memberErased = false;
  for (const cid of ids(f.memberCustomerIds)) {
    try {
      const member = await import("@/lib/modules/member");
      if ((await member.eraseMemberById(tenantId, cid, { actorUserId: null })).erased) memberErased = true;
    } catch {
      failed.push(`customer:${cid}`);
    }
  }
  if (failed.length) {
    await logOps("WARN", "crm.privacy", "ขั้นหลังการลบข้อมูลส่วนบุคคลยังไม่ครบ — ระบบจะลองใหม่อัตโนมัติ", { tenantId, detail: JSON.stringify({ contactId, failed: failed.slice(0, 50) }) });
    throw new Error(`crm.privacy.completeErasure pending (${failed.length})`);
  }
  return { files, memberErased };
}

/** ตัวรับ `crm.contact.erased` (outbox-consumers · ขั้นแรกที่ retry ได้) — ทำขั้นหลัง commit ให้ครบ (ล้ม = throw = ส่งใหม่) */
export async function onContactErased(evt: { tenantId: string; payload: unknown }): Promise<void> {
  const p = isObj(evt?.payload) ? evt.payload : {};
  const contactId = str(p.contactId);
  if (!evt?.tenantId || !contactId) return;
  await completeErasure(evt.tenantId, contactId);
}

/**
 * ตัวรับ `member.erased` — ผู้ติดต่อ CRM ทุกคนที่ผูกสมาชิกคนนี้ (ทุกระบบ CRM ของร้าน) ถูกลบครั้งเดียว
 * วนจนเงียบ (ข้ามคนที่ลบแล้ว · ข้ามคนที่ล้มในรอบนี้) · มีคนล้ม = OpsEvent WARN (id ล้วน) + throw ⇒ event ส่งใหม่
 */
export async function onMemberErased(evt: { tenantId: string; payload: unknown }): Promise<{ erased: number }> {
  const p = isObj(evt?.payload) ? evt.payload : {};
  const customerId = str(p.customerId);
  if (!evt?.tenantId || !customerId) return { erased: 0 };
  let erased = 0;
  const skip: string[] = [];
  for (let round = 0; round < 50; round += 1) {
    const rows = await prisma.$queryRaw<{ id: string; systemId: string }[]>`
      SELECT c."id", c."systemId" FROM "CrmContact" c
       WHERE c."tenantId" = ${evt.tenantId} AND c."memberCustomerId" = ${customerId}
         AND NOT (c."id" = ANY(${skip}::text[]))
         AND NOT EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."action" = ${CRM_ERASE_AUDIT_ACTION} AND a."targetId" = c."id" AND a."tenantId" = c."tenantId")
       ORDER BY c."id" LIMIT 100`;
    if (rows.length === 0) break;
    for (const r of rows) {
      try {
        const res = await eraseContact(
          { tenantId: evt.tenantId, systemId: r.systemId, actorUserId: null },
          null,
          { contactId: r.id, confirm: true, reason: "สมาชิกถูกลบข้อมูลตามคำขอ PDPA (ลบผู้ติดต่อ CRM ที่ผูกกันตาม)", source: "MEMBER" },
        );
        if (res.erased) erased += 1;
        else skip.push(r.id);
      } catch {
        skip.push(r.id);
        await logOps("WARN", "crm.privacy", "ลบผู้ติดต่อ CRM ที่ผูกสมาชิกที่ถูกลบไม่สำเร็จ — ระบบจะลองใหม่อัตโนมัติ", { tenantId: evt.tenantId, detail: JSON.stringify({ contactId: r.id, customerId }) });
      }
    }
  }
  const pending = skip.length
    ? await prisma.auditLog.count({ where: { tenantId: evt.tenantId, action: CRM_ERASE_AUDIT_ACTION, targetId: { in: skip } } })
    : 0;
  if (skip.length > pending) throw new Error(`crm.privacy.onMemberErased pending (${skip.length - pending})`);
  return { erased };
}

// ═════════════════════════ ส่งออกข้อมูลของคนหนึ่งคน ═════════════════════════

/** ฟิลด์ sensitive เห็นได้ไหม (นโยบายของใบนี้: เจ้าของร้านเท่านั้น — MANAGER/STAFF/คีย์ API ได้ชุดที่ตัดค่า sensitive) */
const seesSensitive = (actor: Actor) => actor.role === "OWNER" && !isApiActor(actor);

export async function exportContact(ctx: PrivacyCtx, actor: Actor, contactId: string): Promise<ContactExportBundle> {
  assertStaff(actor);
  const sys = await resolveSystem(ctx);
  const c = { tenantId: sys.tenantId, systemId: sys.systemId, actorUserId: actor.userId };
  const row = await loadContact(c, actor, contactId);
  need(actor, "crm.contact.export");
  const t = c.tenantId;
  const id = row.id;
  const recs = await prisma.customRecord.findMany({ where: { tenantId: t, systemId: c.systemId, parentType: "CONTACT", parentId: id }, select: { id: true, objectId: true, title: true, status: true, createdAt: true, updatedAt: true } });
  const values = await prisma.customRecordValue.findMany({
    where: { tenantId: t, recordId: { in: [id, ...recs.map((r) => r.id)] }, ...(seesSensitive(actor) ? {} : { field: { sensitive: false } }) },
    select: { recordId: true, valueText: true, valueNumber: true, valueDate: true, valueBool: true, valueOptions: true, valueRef: true, field: { select: { key: true, label: true, objectKey: true } } },
  });
  const sessions = await prisma.crmWebSession.findMany({ where: { tenantId: t, contactId: id }, select: { id: true, startedAt: true, lastSeenAt: true, pageViews: true, firstUrl: true, referrer: true, utm: true, consentVersion: true, consentAt: true }, take: 5_000 });
  const tables: Record<string, Record<string, unknown>[]> = {
    CrmCompanyContact: rowsOf(await prisma.crmCompanyContact.findMany({ where: { tenantId: t, contactId: id }, select: { companyId: true, role: true, jobTitle: true, isPrimary: true, startedAt: true, endedAt: true, company: { select: { name: true } } } })),
    CrmContactConsent: rowsOf(await prisma.crmContactConsent.findMany({ where: { tenantId: t, contactId: id }, select: { channel: true, granted: true, source: true, policyVersion: true, createdAt: true }, orderBy: { createdAt: "asc" } })),
    CrmDeal: rowsOf(await prisma.crmDeal.findMany({ where: { AND: [await dealWhere(c, actor), { contactId: id }] }, select: { id: true, title: true, valueSatang: true, kind: true, paidSatang: true, currency: true, expectedCloseAt: true, closedAt: true, createdAt: true, stage: { select: { name: true } } } })),
    CrmActivity: rowsOf(await prisma.crmActivity.findMany({ where: { AND: [await activityWhere(c, actor), { contactId: id }] }, select: { id: true, type: true, title: true, body: true, direction: true, channel: true, outcome: true, durationSec: true, dueAt: true, doneAt: true, startAt: true, createdAt: true }, take: 5_000 })),
    // AUDIT-CLASS X8: หัวจดหมายเท่านั้น — เนื้อจดหมายไม่เคยอยู่ในไฟล์ส่งออก
    CrmEmailMessage: rowsOf(await prisma.crmEmailMessage.findMany({ where: { tenantId: t, systemId: c.systemId, contactId: id }, select: { id: true, direction: true, fromAddr: true, toAddrs: true, subject: true, status: true, sentAt: true, receivedAt: true, openCount: true, clickCount: true }, take: 5_000 })),
    CrmWebSession: rowsOf(sessions),
    CrmWebEvent: rowsOf(sessions.length ? await prisma.crmWebEvent.findMany({ where: { sessionId: { in: sessions.map((s) => s.id) } }, select: { sessionId: true, kind: true, url: true, title: true, at: true }, take: 20_000 }) : []),
    CrmTrackedClick: rowsOf(await prisma.crmTrackedClick.findMany({ where: { tenantId: t, contactId: id }, select: { at: true, link: { select: { name: true, url: true } } }, take: 5_000 })),
    CrmPortalAccess: rowsOf(await prisma.crmPortalAccess.findMany({ where: { tenantId: t, contactId: id }, select: { companyId: true, role: true, invitedAt: true, acceptedAt: true, lastLoginAt: true, revokedAt: true, loginMethods: true } })),
    CrmPortalRequest: rowsOf(await prisma.crmPortalRequest.findMany({ where: { tenantId: t, contactId: id }, select: { id: true, kind: true, payload: true, status: true, createdAt: true, decidedAt: true } })),
    CrmScoreLog: rowsOf(await prisma.crmScoreLog.findMany({ where: { tenantId: t, contactId: id }, select: { points: true, reason: true, createdAt: true }, take: 5_000 })),
    CrmSequenceEnrollment: rowsOf(await prisma.crmSequenceEnrollment.findMany({ where: { tenantId: t, contactId: id }, select: { sequence: { select: { name: true } }, status: true, stoppedReason: true, createdAt: true, stoppedAt: true } })),
    CustomRecord: rowsOf(recs),
    CustomRecordValue: rowsOf(values),
    // รีวิว C3.9 B1: ไฟล์แนบของผู้ติดต่อ/เรคคอร์ด/กิจกรรมของเขา — ชื่อ ชนิด ขนาด วันที่ (ไฟล์จริงเปิดผ่านหน้า 360 ด้วยลิงก์ส่วนตัว)
    CrmFileLink: rowsOf(
      await prisma.crmFileLink.findMany({
        where: {
          tenantId: t,
          systemId: c.systemId,
          OR: [
            { entityType: "CONTACT", entityId: id },
            ...(recs.length ? [{ entityType: "RECORD", entityId: { in: recs.map((r) => r.id) } }] : []),
            { entityType: "ACTIVITY", entityId: { in: (await prisma.crmActivity.findMany({ where: { AND: [await activityWhere(c, actor), { contactId: id }] }, select: { id: true }, take: 5_000 })).map((a) => a.id) } },
          ],
        },
        select: { entityType: true, entityId: true, name: true, mime: true, size: true, createdAt: true },
        take: 5_000,
      }),
    ),
  };
  const contact = jsonClean({
    id: row.id,
    name: row.name,
    firstName: row.firstName,
    lastName: row.lastName,
    titleTh: row.titleTh,
    phone: row.phone,
    email: row.email,
    lineUserId: row.lineUserId,
    jobTitle: row.jobTitle,
    department: row.department,
    lifecycleStage: row.lifecycleStage,
    leadStatus: row.leadStatus,
    score: row.score,
    tags: row.tags,
    locale: row.locale,
    sourceKind: row.sourceKind,
    sourceChannel: row.sourceChannel,
    emailOptOut: row.emailOptOut,
    marketingOptOut: row.marketingOptOut,
    trackingOptOut: row.trackingOptOut,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }) as Record<string, unknown>;
  await writeAudit({ tenantId: t, actorId: actor.userId, action: "crm.contact.export.person", targetType: "CrmContact", targetId: id, after: { systemId: c.systemId, tables: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), sensitive: seesSensitive(actor) } });
  return { exportedAt: new Date().toISOString(), contact, tables };
}

// ═════════════════════════ ส่งออกทั้งระบบ (งาน async บนเลนของ C3.1) ═════════════════════════

export async function exportTenant(ctx: PrivacyCtx, actor: Actor, input: { format?: CrmExportFormat | string | null }, deps?: PrivacyDeps | null): Promise<{ jobId: string; status: "QUEUED" }> {
  void deps; // ไฟล์ถูกเขียนตอน runExportJobs (ผู้เรียกฉีด put ที่นั่น)
  assertStaff(actor);
  const sys = await resolveSystem(ctx);
  // ไฟล์ส่งออกผูกกับ "คน" (ผู้ขอ) — คีย์ API ไม่มีตัวตนคงที่ (แบบเดียวกับ reports.startExport ของ C3.1)
  if (isApiActor(actor)) throw fail("FORBIDDEN", API_EXPORT_MSG);
  need(actor, "crm.contact.export");
  const format = (CRM_EXPORT_FORMATS as readonly string[]).includes(str(input?.format).toUpperCase()) ? (str(input?.format).toUpperCase() as CrmExportFormat) : null;
  if (!format) throw fail("VALIDATION", "เลือกรูปแบบไฟล์ส่งออกเป็น CSV หรือ JSON");
  const job = await prisma.crmImportJob.create({
    data: {
      tenantId: sys.tenantId,
      systemId: sys.systemId,
      kind: CRM_EXPORT_KIND,
      status: "QUEUED",
      createdById: actor.userId,
      options: { format, requesterKind: "USER", requesterId: actor.userId },
    },
    select: { id: true },
  });
  await writeAudit({ tenantId: sys.tenantId, actorId: actor.userId, action: "crm.contact.export", targetType: "CrmImportJob", targetId: job.id, after: { systemId: sys.systemId, format, scope: "SYSTEM" } });
  return { jobId: job.id, status: "QUEUED" };
}

/** actor ของพนักงานจาก Membership ปัจจุบัน (re-resolve ทุกครั้ง — ถูกเอาออกจากร้าน = null) */
async function staffActor(tenantId: string, userId: string | null): Promise<Actor | null> {
  if (!userId) return null;
  const m = await prisma.membership.findFirst({ where: { tenantId, userId, acceptedAt: { not: null } }, select: { userId: true, role: true, unitAccess: true, permissions: true } });
  if (!m) return null;
  return {
    userId: m.userId,
    role: m.role,
    unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as string[]) : [],
    permissions: isObj(m.permissions) ? (m.permissions as Record<string, unknown>) : {},
  };
}

type ExportTables = Record<string, { columns: string[]; rows: (string | number | null)[][] }>;

const cell = (v: unknown): string | number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Prisma.Decimal) return v.toString();
  if (Array.isArray(v)) return v.map((x) => String(x)).join("|");
  if (typeof v === "object") return JSON.stringify(jsonClean(v));
  return String(v);
};

/** ข้อมูลทั้งระบบตามการมองเห็นของผู้ขอ (ไม่มีเนื้อจดหมาย · ค่า sensitive เฉพาะ OWNER · เพดานต่อตาราง) */
async function buildTenantExport(ctx: PrivacyCtx, actor: Actor): Promise<ExportTables> {
  const cap = CRM_HARD_CAPS.tenantExportRowsPerTable;
  const t = ctx.tenantId;
  const contacts = await prisma.crmContact.findMany({
    where: { AND: [await contactWhere(ctx, actor), { mergedIntoId: null }] },
    select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true, lineUserId: true, jobTitle: true, lifecycleStage: true, leadStatus: true, score: true, ownerUserId: true, teamId: true, companyId: true, sourceKind: true, tags: true, emailOptOut: true, marketingOptOut: true, note: true, createdAt: true, lastActivityAt: true },
    orderBy: { createdAt: "asc" },
    take: cap,
  });
  const companies = await prisma.crmCompany.findMany({
    where: { AND: [await companyWhere(ctx, actor), { mergedIntoId: null }] },
    select: { id: true, name: true, legalName: true, taxId: true, branchCode: true, industry: true, website: true, phone: true, email: true, ownerUserId: true, teamId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: cap,
  });
  const deals = await prisma.crmDeal.findMany({
    where: await dealWhere(ctx, actor),
    select: { id: true, title: true, contactId: true, companyId: true, valueSatang: true, paidSatang: true, kind: true, currency: true, ownerUserId: true, teamId: true, expectedCloseAt: true, closedAt: true, createdAt: true, stage: { select: { name: true } }, pipeline: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: cap,
  });
  const activities = await prisma.crmActivity.findMany({
    where: await activityWhere(ctx, actor),
    select: { id: true, type: true, title: true, contactId: true, dealId: true, companyId: true, ownerUserId: true, dueAt: true, doneAt: true, startAt: true, durationSec: true, outcome: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: cap,
  });
  const contactIds = contacts.map((c) => c.id);
  const consents = contactIds.length
    ? await prisma.crmContactConsent.findMany({ where: { tenantId: t, systemId: ctx.systemId, contactId: { in: contactIds.slice(0, cap) } }, select: { contactId: true, channel: true, granted: true, source: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: cap })
    : [];
  // ข้อมูลกำหนดเองของผู้ติดต่อที่ผู้ขอเห็น (แม่ = ผู้ติดต่อ) + ค่าฟิลด์ (ตัด sensitive สำหรับคนที่ไม่ใช่เจ้าของร้าน)
  const recs = contactIds.length
    ? await prisma.customRecord.findMany({ where: { tenantId: t, systemId: ctx.systemId, parentType: "CONTACT", parentId: { in: contactIds.slice(0, cap) }, archivedAt: null }, select: { id: true, parentId: true, title: true, object: { select: { key: true } } }, take: cap })
    : [];
  const vals = recs.length
    ? await prisma.customRecordValue.findMany({
        where: { tenantId: t, recordId: { in: recs.map((r) => r.id) }, ...(seesSensitive(actor) ? {} : { field: { sensitive: false } }) },
        select: { recordId: true, valueText: true, valueNumber: true, valueDate: true, valueBool: true, valueOptions: true, field: { select: { key: true } } },
        take: cap,
      })
    : [];
  // AUDIT-CLASS X8: อีเมลเฉพาะหัวจดหมาย (ไม่มี bodyHtml/bodyText/snippet)
  const mails = await prisma.crmEmailMessage.findMany({
    where: { tenantId: t, systemId: ctx.systemId, contactId: { in: contactIds.slice(0, cap) } },
    select: { id: true, contactId: true, direction: true, fromAddr: true, toAddrs: true, subject: true, status: true, sentAt: true, receivedAt: true },
    orderBy: { createdAt: "asc" },
    take: cap,
  });
  const table = (rows: readonly Record<string, unknown>[], columns: string[]) => ({ columns, rows: rows.map((r) => columns.map((k) => cell(r[k]))) });
  return {
    CrmContact: table(contacts, ["id", "name", "firstName", "lastName", "phone", "email", "lineUserId", "jobTitle", "lifecycleStage", "leadStatus", "score", "ownerUserId", "teamId", "companyId", "sourceKind", "tags", "emailOptOut", "marketingOptOut", "note", "createdAt", "lastActivityAt"]),
    CrmCompany: table(companies, ["id", "name", "legalName", "taxId", "branchCode", "industry", "website", "phone", "email", "ownerUserId", "teamId", "createdAt"]),
    CrmDeal: table(
      deals.map((d) => ({ ...d, stage: d.stage?.name ?? null, pipeline: d.pipeline?.name ?? null })),
      ["id", "title", "contactId", "companyId", "pipeline", "stage", "kind", "valueSatang", "paidSatang", "currency", "ownerUserId", "teamId", "expectedCloseAt", "closedAt", "createdAt"],
    ),
    CrmActivity: table(activities, ["id", "type", "title", "contactId", "dealId", "companyId", "ownerUserId", "dueAt", "doneAt", "startAt", "durationSec", "outcome", "createdAt"]),
    CrmContactConsent: table(consents, ["contactId", "channel", "granted", "source", "createdAt"]),
    CrmEmailMessage: table(mails, ["id", "contactId", "direction", "fromAddr", "toAddrs", "subject", "status", "sentAt", "receivedAt"]),
    CustomRecord: table(recs.map((r) => ({ ...r, object: r.object?.key ?? null })), ["id", "object", "parentId", "title"]),
    CustomRecordValue: table(
      vals.map((v) => ({ ...v, field: v.field?.key ?? null, value: v.valueText ?? v.valueNumber ?? v.valueDate ?? v.valueBool ?? (v.valueOptions.length ? v.valueOptions : null) })),
      ["recordId", "field", "value"],
    ),
  };
}

function serialize(tables: ExportTables, format: CrmExportFormat): { text: string; rows: number } {
  let rows = 0;
  if (format === "JSON") {
    const obj: Record<string, Record<string, string | number | null>[]> = {};
    for (const [name, tb] of Object.entries(tables)) {
      obj[name] = tb.rows.map((r) => Object.fromEntries(tb.columns.map((c, i) => [c, r[i] ?? null])));
      rows += tb.rows.length;
    }
    return { text: JSON.stringify({ exportedAt: new Date().toISOString(), tables: obj }), rows };
  }
  // AUDIT-CLASS X6: ทุกบรรทัดผ่าน csvRow (เซลล์ขึ้นต้น = + - @ ถูกทำให้เป็นข้อความ) · BOM ให้ Excel อ่านภาษาไทยถูก
  const lines: string[] = [];
  for (const [name, tb] of Object.entries(tables)) {
    lines.push(csvRow([`# ${EXPORT_TABLE_LABEL[name] ?? name} (${name})`]));
    lines.push(csvRow(tb.columns));
    for (const r of tb.rows) lines.push(csvRow(r));
    lines.push("");
    rows += tb.rows.length;
  }
  return { text: `﻿${lines.join("\r\n")}\r\n`, rows };
}

type RunOpts = { now?: Date; tenantIds?: string[]; systemIds?: string[]; deadline?: number; signal?: AbortSignal; deps?: PrivacyDeps | null };
const stopped = (o: RunOpts) => !!o.signal?.aborted || (typeof o.deadline === "number" && Date.now() >= o.deadline - 500);
const clockOf = (now: unknown) => (now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date());
const ts = (d: Date) => d.toISOString();

/**
 * AUDIT-CLASS X5: ทำงานส่งออกทั้งระบบที่ค้าง — จองทีละแถวด้วย lease (RUNNING + leaseUntil = now + 15 นาที) ด้วย `FOR UPDATE SKIP LOCKED`
 * (แบบเดียวกับ `reports.runExportJobs`) ⇒ รอบซ้อนกี่ตัวก็ทำงานละครั้ง · โพรเซสตายหลังจอง = รอบหลัง lease หมดหยิบใหม่
 */
export async function runExportJobs(opts: RunOpts = {}): Promise<{ done: number; failed: number }> {
  const now = clockOf(opts?.now);
  const out = { done: 0, failed: 0 };
  const tenants = Array.isArray(opts?.tenantIds) ? opts.tenantIds.filter((x) => typeof x === "string") : null;
  const systems = Array.isArray(opts?.systemIds) ? opts.systemIds.filter((x) => typeof x === "string") : null;
  const t0 = Date.now();
  for (let i = 0; i < EXPORT_BATCH_MAX && !stopped(opts); i += 1) {
    const claimNow = new Date(now.getTime() + (Date.now() - t0));
    const until = new Date(claimNow.getTime() + CRM_EXPORT_LEASE_MS);
    const claimed = await prisma.$queryRaw<{ id: string; tenantId: string; systemId: string; createdById: string | null; options: unknown }[]>`
      UPDATE "CrmImportJob" j SET "status" = 'RUNNING', "leaseUntil" = (${ts(until)}::timestamptz AT TIME ZONE 'UTC'),
             "startedAt" = COALESCE(j."startedAt", (${ts(claimNow)}::timestamptz AT TIME ZONE 'UTC')), "updatedAt" = (${ts(claimNow)}::timestamptz AT TIME ZONE 'UTC')
       WHERE j."id" = (
         SELECT x."id" FROM "CrmImportJob" x
          WHERE x."kind" = ${CRM_EXPORT_KIND}
            AND (x."status" = 'QUEUED' OR (x."status" = 'RUNNING' AND (x."leaseUntil" IS NULL OR x."leaseUntil" <= (${ts(claimNow)}::timestamptz AT TIME ZONE 'UTC'))))
            ${tenants ? Prisma.sql`AND x."tenantId" = ANY(${tenants}::text[])` : Prisma.empty}
            ${systems ? Prisma.sql`AND x."systemId" = ANY(${systems}::text[])` : Prisma.empty}
          ORDER BY x."createdAt" ASC, x."id" ASC
          LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING j."id", j."tenantId", j."systemId", j."createdById", j."options"`;
    const job = claimed[0];
    if (!job) break;
    const finish = async (data: Prisma.CrmImportJobUpdateManyMutationInput) =>
      // NOTE รีวิว: ปิดงานได้เฉพาะเมื่อ lease ยังเป็นของรอบนี้ (แบบ reports.ts) — รอบที่ lease หมดแล้วมีคนอื่นหยิบต่อ ห้ามเขียนทับผลของเขา
      (await prisma.crmImportJob.updateMany({ where: { id: job.id, status: "RUNNING", leaseUntil: until }, data: { ...data, leaseUntil: null, finishedAt: new Date() } })).count;
    try {
      const o = isObj(job.options) ? job.options : {};
      const format: CrmExportFormat = o.format === "JSON" ? "JSON" : "CSV";
      const who = o.requesterKind === "USER" && typeof o.requesterId === "string" && o.requesterId === job.createdById ? await staffActor(job.tenantId, job.createdById) : null;
      if (!who) throw fail("FORBIDDEN", "ผู้ขอไฟล์นี้ไม่ได้เป็นพนักงานของร้านนี้แล้ว — ขอส่งออกใหม่จากบัญชีที่ยังใช้งานอยู่");
      if (!crmCan(who, "crm.contact.export")) throw fail("FORBIDDEN", crmForbiddenMessage("crm.contact.export"));
      const ctx = { tenantId: job.tenantId, systemId: job.systemId, actorUserId: who.userId };
      const { text, rows } = serialize(await buildTenantExport(ctx, who), format);
      const data = new TextEncoder().encode(text);
      if (data.byteLength > CRM_HARD_CAPS.tenantExportMaxBytes) throw fail("VALIDATION", "ไฟล์ใหญ่เกินที่ส่งออกได้ในครั้งเดียว — ติดต่อทีม SHARK เพื่อขอไฟล์สำรองทั้งร้าน");
      const day = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `crm-export-${day}.${format === "JSON" ? "json" : "csv"}`;
      // AUDIT-CLASS X10: ไฟล์ส่วนตัว (t/<tid>/private/<สุ่ม 160 บิต> · cdnUrl private://) — ออกได้ทางลิงก์ลงนามของผู้ขอเท่านั้น
      const up = await uploadFile(
        { tenantId: job.tenantId },
        { kind: "ATTACHMENT", filename, contentType: "text/plain", data, maxBytes: CRM_HARD_CAPS.tenantExportMaxBytes, visibility: "private" },
        opts.deps?.put ? { put: opts.deps.put } : undefined,
      );
      if (!up.ok) throw fail("VALIDATION", up.error);
      // X10: แถวงานเก็บรหัสไฟล์ ไม่เก็บ URL
      const n = await finish({ status: "DONE", fileId: up.assetId, totalRows: rows, processedRows: rows, error: null, result: { format, filename, rowCount: rows, bytes: data.byteLength } });
      if (n > 0) out.done += 1;
      else await deleteFileAsset({ tenantId: job.tenantId }, up.assetId, storeDeps(opts.deps)).catch(() => null);
    } catch (e) {
      const msg = e instanceof PrivacyError ? e.message : "สร้างไฟล์ไม่สำเร็จเพราะระบบขัดข้องชั่วคราว — กดส่งออกใหม่อีกครั้ง";
      const n = await finish({ status: "FAILED", error: msg.slice(0, 500) }).catch(() => 0);
      if (n > 0) out.failed += 1;
    }
  }
  return out;
}

/** สถานะ + ลิงก์ของงานส่งออก — **เฉพาะผู้ขอ** (คนอื่น/ร้านอื่น/ระบบอื่น = NOT_FOUND) */
export async function getExport(ctx: PrivacyCtx, actor: Actor, jobId: string): Promise<CrmExportDto> {
  assertStaff(actor);
  const sys = await resolveSystem(ctx);
  if (isApiActor(actor)) throw fail("FORBIDDEN", API_EXPORT_MSG);
  const id = str(jobId);
  const job = id
    ? await prisma.crmImportJob.findFirst({
        where: { id, tenantId: sys.tenantId, systemId: sys.systemId, kind: CRM_EXPORT_KIND, createdById: actor.userId },
        select: { id: true, status: true, options: true, result: true, totalRows: true, error: true, fileId: true, createdAt: true },
      })
    : null;
  const o = isObj(job?.options) ? job.options : {};
  if (!job || o.requesterKind !== "USER" || o.requesterId !== actor.userId) throw fail("NOT_FOUND", EXPORT_404);
  const r = isObj(job.result) ? job.result : {};
  let status: CrmExportStatus = (["QUEUED", "RUNNING", "DONE", "FAILED"].includes(job.status) ? job.status : "FAILED") as CrmExportStatus;
  let url: string | null = null;
  if (status === "DONE") {
    const file = job.fileId ? await prisma.fileAsset.findFirst({ where: { id: job.fileId, tenantId: sys.tenantId }, select: { id: true } }) : null;
    if (file) url = privateFileUrl(file.id, { kind: "STAFF", id: actor.userId });
    else status = "EXPIRED";
  }
  return {
    jobId: job.id,
    status,
    format: o.format === "JSON" ? "JSON" : o.format === "CSV" ? "CSV" : null,
    filename: typeof r.filename === "string" ? r.filename : null,
    rowCount: job.totalRows,
    url,
    error: status === "FAILED" ? (job.error ?? "สร้างไฟล์ไม่สำเร็จ — กดส่งออกใหม่อีกครั้ง") : status === "EXPIRED" ? "ไฟล์นี้หมดอายุและถูกล้างตามนโยบายเก็บข้อมูลแล้ว — กดส่งออกใหม่ได้เลย" : null,
    createdAt: job.createdAt.toISOString(),
  };
}

/** งานส่งออกล่าสุดของผู้ขอ (หน้า 360 / ตั้งค่า) */
export async function listMyExports(ctx: PrivacyCtx, actor: Actor): Promise<CrmExportDto[]> {
  assertStaff(actor);
  const sys = await resolveSystem(ctx);
  if (isApiActor(actor) || !crmCan(actor, "crm.contact.export")) return [];
  const rows = await prisma.crmImportJob.findMany({ where: { tenantId: sys.tenantId, systemId: sys.systemId, kind: CRM_EXPORT_KIND, createdById: actor.userId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true } });
  const out: CrmExportDto[] = [];
  for (const r of rows) out.push(await getExport({ ...sys, actorUserId: actor.userId }, actor, r.id));
  return out;
}

// ═════════════════════════ ล้างตามอายุเก็บ (retention) ═════════════════════════

type PurgeOpts = { tenantIds?: string[]; systemIds?: string[]; deadline?: number; signal?: AbortSignal; deps?: PrivacyDeps | null };

async function crmSystems(opts: PurgeOpts): Promise<{ id: string; tenantId: string; settings: Prisma.JsonValue }[]> {
  const tenantIds = Array.isArray(opts.tenantIds) ? opts.tenantIds.filter((x) => typeof x === "string" && x) : null;
  const systemIds = Array.isArray(opts.systemIds) ? opts.systemIds.filter((x) => typeof x === "string" && x) : null;
  if ((tenantIds && tenantIds.length === 0) || (systemIds && systemIds.length === 0)) return [];
  return prisma.appSystem.findMany({
    where: { type: "CRM", ...(tenantIds ? { tenantId: { in: tenantIds } } : {}), ...(systemIds ? { id: { in: systemIds } } : {}) },
    select: { id: true, tenantId: true, settings: true },
    orderBy: { id: "asc" },
  });
}

/**
 * ไฟล์ส่งออกที่เกิน `retention.exportDays` (ค่าเริ่มต้น 7 วัน): CRM_EXPORT = ลบไฟล์ส่วนตัว (แถวงานคงอยู่ · fileId = null · result.expired) ·
 * REPORT_EXPORT (C3.1 เก็บ CSV ในแถว — หนี้ N5) = ล้างเนื้อ CSV ออกจากแถว
 * AUDIT-CLASS X5: จองด้วย UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED) — รอบซ้อนได้ไฟล์คนละชุด ⇒ ไฟล์ละครั้ง
 */
export async function purgeExports(now: Date, opts: PurgeOpts = {}): Promise<{ exports: number }> {
  const at = clockOf(now);
  let exports = 0;
  const del = storeDeps(opts.deps);
  for (const sys of await crmSystems(opts)) {
    if (stopped(opts)) break;
    const cutoff = new Date(at.getTime() - crmRetentionOf(sys.settings).exportDays * DAY_MS);
    for (let round = 0; round < 20; round += 1) {
      const picked = await prisma.$queryRaw<{ id: string; fileId: string }[]>`
        WITH p AS (
          SELECT "id", "fileId" FROM "CrmImportJob"
           WHERE "systemId" = ${sys.id} AND "kind" = ${CRM_EXPORT_KIND} AND "fileId" IS NOT NULL
             AND COALESCE("finishedAt", "createdAt") < (${ts(cutoff)}::timestamptz AT TIME ZONE 'UTC')
           ORDER BY "id" LIMIT 100 FOR UPDATE SKIP LOCKED)
        UPDATE "CrmImportJob" j SET "fileId" = NULL,
               "result" = COALESCE(CASE WHEN jsonb_typeof(j."result") = 'object' THEN j."result" ELSE NULL END, '{}'::jsonb) || '{"expired":true}'::jsonb
          FROM p WHERE j."id" = p."id" RETURNING p."fileId" AS "fileId", j."id" AS "id"`;
      for (const r of picked) {
        const d = await deleteFileAsset({ tenantId: sys.tenantId }, r.fileId, del).catch(() => ({ ok: false as const }));
        if (d.ok) exports += 1;
      }
      if (picked.length < 100) break;
    }
    const reportCsv = await prisma.$executeRaw`
      UPDATE "CrmImportJob" SET "result" = ("result" - 'csv') || '{"expired":true}'::jsonb
       WHERE "systemId" = ${sys.id} AND "kind" = 'REPORT_EXPORT' AND jsonb_typeof("result") = 'object' AND "result" ? 'csv'
         AND COALESCE("finishedAt", "createdAt") < (${ts(cutoff)}::timestamptz AT TIME ZONE 'UTC')`;
    exports += Number(reportCsv);
  }
  return { exports };
}

/** เดือนย้อนหลังแบบปฏิทินไทย (วันเดียวกันของเดือนก่อน ๆ · ไม่มีวันนั้น = วันสุดท้ายของเดือน) */
function monthsBefore(now: Date, months: number): Date {
  const local = new Date(now.getTime() + 7 * 3_600_000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() - months;
  const target = new Date(Date.UTC(y, m, 1, local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(local.getUTCDate(), lastDay));
  return new Date(target.getTime() - 7 * 3_600_000);
}

/** เตือน lead ชุดหนึ่ง (ใต้ advisory lock ต่อระบบ) — ธง "เตือนแล้ว" = แถว AuditLog `crm.retention.warned` (after.anchor = วันที่ไม่เคลื่อนไหวล่าสุด)
 *  กลับมาเคลื่อนไหวแล้วหยุดอีก = วันที่ใหม่ = เตือนใหม่ได้ · เป็นหลักฐานด้วยว่าร้านได้รับคำเตือนก่อนลบ (ผูกร้าน — ไม่มีแถวกำพร้าในตารางกลาง) */
async function warnBatch(sys: { id: string; tenantId: string }, near: { id: string; ownerUserId: string | null; anchor: Date }[], months: number, at: Date): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm.retention.warn:${sys.id}`}, 0))`;
    const dayOf = (d: Date) => new Date(d).toISOString().slice(0, 10);
    const prior = await tx.auditLog.findMany({ where: { tenantId: sys.tenantId, action: "crm.retention.warned", targetId: { in: near.map((r) => r.id) } }, select: { targetId: true, after: true } });
    const seen = new Set(prior.map((a) => `${a.targetId}:${isObj(a.after) && typeof a.after.anchor === "string" ? a.after.anchor : ""}`));
    const byOwner = new Map<string, number>();
    let n = 0;
    for (const r of near) {
      const anchor = dayOf(r.anchor);
      if (seen.has(`${r.id}:${anchor}`)) continue;
      await tx.auditLog.create({ data: { tenantId: sys.tenantId, actorType: "SYSTEM", actorId: null, action: "crm.retention.warned", targetType: "CrmContact", targetId: r.id, after: { anchor, systemId: sys.id, leadMonths: months } } });
      n += 1;
      const key = r.ownerUserId ?? "";
      byOwner.set(key, (byOwner.get(key) ?? 0) + 1);
    }
    if (n === 0) return 0;
    const owners = byOwner.has("") ? (await tx.membership.findMany({ where: { tenantId: sys.tenantId, role: "OWNER", acceptedAt: { not: null } }, select: { userId: true }, take: 20 })).map((m) => m.userId) : [];
    const rows: Prisma.AppNotificationCreateManyInput[] = [];
    for (const [owner, count] of byOwner) {
      for (const uid of owner ? [owner] : owners) {
        rows.push({
          tenantId: sys.tenantId,
          recipientUserId: uid,
          title: "lead ใกล้ครบอายุเก็บข้อมูล",
          // AUDIT-CLASS X8: ไม่มีชื่อ/เบอร์ของลูกค้าในแจ้งเตือน — จำนวนล้วน
          body: `lead ${count.toLocaleString("th-TH")} รายที่${owner ? "คุณดูแล" : "ยังไม่มีผู้ดูแล"}ไม่มีความเคลื่อนไหวมานาน จะถูกลบข้อมูลอัตโนมัติตามอายุเก็บข้อมูลของร้านภายใน ${LEAD_RETENTION_WARN_DAYS} วัน — ติดต่อหรือบันทึกกิจกรรมเพื่อเก็บไว้`,
          createdAt: at,
        });
      }
    }
    if (rows.length) await tx.appNotification.createMany({ data: rows });
    return n;
  }, TX_OPTS);
}

/**
 * อายุเก็บ lead ที่ไม่แปลง (มติ C21 · `retention.leadMonths` ค่าเริ่มต้น 24 · 0 = ปิด):
 *   ไม่เคลื่อนไหวเกินอายุ ⇒ ลบ (source RETENTION) · อีกไม่ถึง 30 วันจะครบ ⇒ แจ้งเตือนในแอปถึงผู้ดูแลครั้งเดียว (ไม่มีชื่อคนในข้อความ)
 * "lead ที่ไม่แปลง" = ขั้น LEAD/PROSPECT/LOST · ไม่เคยแปลง · ไม่ผูกสมาชิก · ไม่มีดีลเปิด/ชนะ · ไม่มีสิทธิ์พอร์ทัล · ยังไม่ถูกเก็บถาวร/รวม
 * 🔴 เฉพาะระบบ uiVersion 2 (R-E.14): การลบอัตโนมัติเป็นการกระทำที่ย้อนไม่ได้ — ร้านที่ยังไม่เปิด v2 ไม่ถูกแตะ
 * AUDIT-CLASS X5: ลบ = idempotent ใต้ล็อกแถว (ธง = แถว audit ของการลบ) · เตือน = แถว audit `crm.retention.warned` ต่อวันที่ไม่เคลื่อนไหว ใต้ advisory lock
 */
export async function retentionLeads(now: Date, opts: PurgeOpts = {}): Promise<{ leadsErased: number; leadsWarned: number }> {
  const at = clockOf(now);
  let leadsErased = 0;
  let leadsWarned = 0;
  for (const sys of await crmSystems(opts)) {
    if (stopped(opts)) break;
    if (parseCrmSettings(sys.settings).uiVersion !== 2) continue;
    const months = crmRetentionOf(sys.settings).leadMonths;
    if (months <= 0) continue;
    const cutoff = monthsBefore(at, months);
    const warnFrom = new Date(cutoff.getTime() + LEAD_RETENTION_WARN_DAYS * DAY_MS);
    const reason = `lead ไม่มีความเคลื่อนไหวเกิน ${months} เดือน — ลบอัตโนมัติตามอายุเก็บข้อมูลของร้าน`;
    // รีวิว C3.9 S4 (ข)(ค): วนจนเงียบ (เคารพ deadline/signal) · lead ที่ลบไม่สำเร็จ = OpsEvent WARN (id ล้วน) + ข้ามไปตลอดรอบนี้
    //   (ไม่ขวางคิว) · คนที่เตือนแล้ว (วันที่ไม่เคลื่อนไหวเดียวกัน) ไม่ถูกหยิบซ้ำ ⇒ รอบถัดไปของลูปได้คนใหม่เสมอ
    const skip: string[] = [];
    const idle = (lo: Date | null, hi: Date, excludeWarned: boolean) => prisma.$queryRaw<{ id: string; ownerUserId: string | null; anchor: Date }[]>`
      SELECT c."id", c."ownerUserId", COALESCE(c."lastActivityAt", c."createdAt") AS "anchor" FROM "CrmContact" c
       WHERE c."tenantId" = ${sys.tenantId} AND c."systemId" = ${sys.id}
         AND c."archivedAt" IS NULL AND c."mergedIntoId" IS NULL
         AND c."convertedAt" IS NULL AND c."memberCustomerId" IS NULL
         AND c."lifecycleStage"::text IN ('LEAD', 'PROSPECT', 'LOST')
         AND NOT (c."id" = ANY(${skip}::text[]))
         AND COALESCE(c."lastActivityAt", c."createdAt") < (${ts(hi)}::timestamptz AT TIME ZONE 'UTC')
         ${lo ? Prisma.sql`AND COALESCE(c."lastActivityAt", c."createdAt") >= (${ts(lo)}::timestamptz AT TIME ZONE 'UTC')` : Prisma.empty}
         AND NOT EXISTS (SELECT 1 FROM "CrmDeal" d WHERE d."contactId" = c."id" AND d."kind"::text IN ('OPEN', 'WON'))
         AND NOT EXISTS (SELECT 1 FROM "CrmPortalAccess" p WHERE p."contactId" = c."id" AND p."revokedAt" IS NULL)
         AND NOT EXISTS (SELECT 1 FROM "AuditLog" e WHERE e."action" = ${CRM_ERASE_AUDIT_ACTION} AND e."targetId" = c."id" AND e."tenantId" = c."tenantId")
         ${excludeWarned
           ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM "AuditLog" w WHERE w."action" = 'crm.retention.warned' AND w."targetId" = c."id" AND w."tenantId" = c."tenantId"
                          AND w."after"->>'anchor' = to_char(COALESCE(c."lastActivityAt", c."createdAt"), 'YYYY-MM-DD'))`
           : Prisma.empty}
       ORDER BY COALESCE(c."lastActivityAt", c."createdAt") ASC, c."id" ASC LIMIT ${LEAD_BATCH_MAX}`;
    for (let round = 0; round < 50 && !stopped(opts); round += 1) {
      const batch = await idle(null, cutoff, false);
      if (batch.length === 0) break;
      for (const r of batch) {
        if (stopped(opts)) break;
        try {
          const res = await eraseContact({ tenantId: sys.tenantId, systemId: sys.id, actorUserId: null }, null, { contactId: r.id, confirm: true, reason, source: "RETENTION" }, opts.deps);
          if (res.erased) leadsErased += 1;
          else skip.push(r.id);
        } catch {
          skip.push(r.id);
          await logOps("WARN", "crm.privacy", "ลบ lead ที่ครบอายุเก็บข้อมูลไม่สำเร็จ — ข้ามไปรอบหน้า", { tenantId: sys.tenantId, detail: JSON.stringify({ systemId: sys.id, contactId: r.id }) });
        }
      }
    }
    for (let round = 0; round < 50 && !stopped(opts); round += 1) {
      const near = await idle(cutoff, warnFrom, true);
      if (near.length === 0) break;
      const n = await warnBatch(sys, near, months, at);
      leadsWarned += n;
      if (n === 0) break; // ทุกคนในชุดถูกอีกรอบที่วิ่งซ้อนเตือนไปแล้ว (ใต้ล็อก) — ชุดถัดไปจะว่างเอง
    }
  }
  return { leadsErased, leadsWarned };
}

/**
 * ล้างตามอายุเก็บทั้งชุด (ข้อสอบ/ปุ่มของผู้ดูแลระบบ) — ลำดับ: อีเมล → เสียง → เว็บ → ไฟล์ส่งออก → lead
 * (lead ท้ายสุด: เนื้อหาที่หมดอายุถูกงานของมันเองจองไปก่อนแล้ว — ไม่มีงานไหนแย่งลบไฟล์เดียวกัน)
 * งานรายวันจริงแยกตัว: `crm.purge.email` (อีเมล+เสียง) · `crm.purge.web` · `crm.purge.exports` · `crm.retention.leads`
 */
export async function purge(now: Date, opts: PurgeOpts = {}): Promise<PurgeSummary> {
  const at = clockOf(now);
  const sysOpts = { ...(opts.tenantIds ? { tenantIds: opts.tenantIds } : {}), ...(opts.systemIds ? { systemIds: opts.systemIds } : {}) };
  const del = storeDeps(opts.deps);
  const mail = await emails.purgeBodies(at, { ...sysOpts, ...(del ? { deps: { del: del.del } } : {}), deadline: opts.deadline, signal: opts.signal });
  const rec = await calls.purgeRecordings(at, { ...sysOpts, ...(del ? { deps: { del: del.del } } : {}) });
  const web = await tracking.purgeWeb(at, { ...sysOpts, deadline: opts.deadline, signal: opts.signal });
  const ex = await purgeExports(at, opts);
  const leads = await retentionLeads(at, opts);
  return {
    emails: mail.purged,
    recordings: rec.purged,
    webSessions: web.sessionsDeleted + web.sessionsSummarised,
    exports: ex.exports,
    leadsErased: leads.leadsErased,
    leadsWarned: leads.leadsWarned,
  };
}

/** ค่าอายุเก็บของระบบ (หน้า /crm/settings) */
export async function retentionSettings(ctx: PrivacyCtx, actor: Actor): Promise<{ exportDays: number; leadMonths: number; recordingDays: number | null; emailDays: number; webDays: number }> {
  assertStaff(actor);
  const sys = await resolveSystem(ctx);
  need(actor, "crm.settings.manage");
  const s = isObj(sys.settings) ? sys.settings : {};
  const crm = isObj(s.crm) ? s.crm : {};
  const ret = isObj(crm.retention) ? crm.retention : {};
  const em = isObj(crm.email) ? crm.email : {};
  const tr = isObj(crm.tracking) && isObj(crm.tracking.web) ? crm.tracking.web : {};
  const r = crmRetentionOf(sys.settings);
  return {
    exportDays: r.exportDays,
    leadMonths: r.leadMonths,
    recordingDays: typeof ret.recordingDays === "number" ? ret.recordingDays : null,
    emailDays: typeof em.retentionDays === "number" ? em.retentionDays : 730,
    webDays: typeof tr.retentionDays === "number" ? tr.retentionDays : 180,
  };
}
