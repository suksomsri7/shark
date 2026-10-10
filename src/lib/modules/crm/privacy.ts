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
//   คงไว้ (ตัวเลข): ดีล (มูลค่า/ขั้น/ยอดรับ/ผู้ดูแล — ชื่อดีล/ขั้นต่อไป/เหตุผลแพ้ ถูกปิดคำระบุตัว · C5.4-B L5-M1) · ประวัติขั้น · CrmDealPayment · CrmCommission · แถวกิจกรรม (เหลือแต่เปลือก) · คะแนน
//   ⇒ AuditLog `crm.contact.erase` (เหตุผล) + outbox `crm.contact.erased` {contactId, systemId, partyId} (id ล้วน · X8) ใน tx เดียวกัน
//   ผู้ติดต่อที่ผูกสมาชิก ⇒ ยื่นคำขอลบของระบบสมาชิกผ่าน member facade (`requestEraseFromCrm` — สายอนุมัติ `member.erase` · ไม่มีนโยบาย =
//     ลบทันที → `member.erased`) เฉพาะผู้กดที่มีคีย์ `member.customer.delete` (C3.9-fix H5) — ตัวรับ `member.erased` ของ CRM
//     เจอผู้ติดต่อที่ลบแล้ว = ไม่ทำอะไร (ไม่มีการลบซ้อน)
//   C3.9-fix (ล่าความปลอดภัย 27 ก.ย.): + คำตอบฟอร์ม (facade ฟอร์ม) · จดหมายที่มีที่อยู่ของเขาแม้ไม่ได้ผูกเขา · บทสนทนาผู้ช่วย AI ·
//     ความเห็น/ประวัติของการ์ดที่ผูก (facade บอร์ดงาน) · before/after ของ AuditLog ในสาย · ไฟล์ส่งออกที่ยังไม่หมดอายุ (ถอน) ·
//     คำระบุตัวรวม "ตัวตนเดิม" (คำตอบฟอร์ม · แถวแก้ไขเก่า) · ลบซ้ำ = กวาดซ้ำ (ไม่มี audit/event ใหม่)
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
import { bareEmail } from "@/lib/core/inbound-address";
import { emitOutbox } from "@/lib/core/outbox";
import { writeAudit } from "@/lib/core/audit";
import { deleteFileAsset, privateFileUrl, uploadFile, type UploadDeps } from "@/lib/storage/service";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { crmCan, crmForbiddenMessage, isApiActor } from "./access";
import { activityWhere, contactWhere, dealWhere } from "./where";
import * as companiesSvc from "./companies";
import { crmRetentionOf, parseCrmSettings } from "./settings";
import { CRM_HARD_CAPS } from "./limits-shared";
import { anonymizeContactInTx, AUDIT_CHANGED_MARK, AUDIT_IDENTITY_KEYS } from "./contacts";
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
  isExpiredTransactionError,
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
/**  `batch` (C5.5-fix9 · ข้อสอบ) = ขนาดหน้าของลูปการลบทุกตัว (ค่าเริ่มต้น = เพดานเดิมของแต่ละตัว) — ค่าเล็กพิสูจน์ว่าวนครบทุกหน้า */
/**  `txTimeoutMs` (C5.5-fix9 r2 · ข้อสอบ) = เวลาของธุรกรรมการลบ (ค่าเล็กลงเท่านั้น ≤ 60 s) — พิสูจน์ทางล้มเพราะหมดเวลา */
export type PrivacyDeps = { del?: (path: string) => Promise<unknown>; put?: UploadDeps["put"]; batch?: number | null; txTimeoutMs?: number | null };
/** ขนาดหน้า: ค่าที่ส่งมา (1..ค่าเริ่มต้น) หรือค่าเริ่มต้น */
const pageSize = (b: unknown, def: number): number => {
  const n = Math.floor(Number(b ?? def));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, def) : def;
};

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
function identityTokens(rows: readonly IdentityRow[], party: { phone: string | null; email: string | null }[], extra: { names: readonly string[]; values: readonly string[] } = { names: [], values: [] }): string[] {
  const raw: (string | null | undefined)[] = [];
  // รีวิวรอบ 2 SF2: ชื่อแทนของระบบ ("ไม่ระบุชื่อ" ฯลฯ — `CONTACT_NAME_PLACEHOLDERS`) ไม่ใช่ตัวตนของใคร ⇒ ไม่ใช้เป็นคำระบุตัว
  //   (ชื่อที่ทุกคำเป็นคำแทนชื่อ เช่น "ไม่ระบุชื่อ" หรือ "ลูกค้า ไม่ระบุ" = ไม่ใช่ชื่อจริง · มีคำจริงอย่างน้อย 1 คำ = ใช้ทั้งชื่อ)
  const realName = (v: string | null | undefined) => {
    const words = (v ?? "").trim().split(/\s+/).filter(Boolean);
    return words.length > 0 && !isPlaceholderContactName(v) && words.some((w) => !isPlaceholderContactName(w)) ? (v as string) : null;
  };
  for (const r of rows) raw.push(realName(r.name), realName(joinName(r.firstName, r.lastName)), r.phone, r.email, r.lineUserId, ...(r.previousEmails ?? []));
  for (const p of party) raw.push(p.phone, p.email);
  // C3.9-fix H1: ตัวตน "เดิม" (คำตอบฟอร์ม · แถว audit เก่าของตัวเขียนผู้ติดต่อ) — ชื่อต้องเป็นชื่อเต็ม ≥ 2 คำ (ท่อนเดียว = คำทั่วไปของคนอื่นได้)
  for (const n of extra.names) {
    const full = realName(n);
    if (full && full.trim().split(/\s+/).length >= 2) raw.push(full);
  }
  raw.push(...extra.values);
  // CRM C5.4-B ▸ hunter H3(e): รูปแบบอื่นของค่าเดียวกัน — เบอร์ (ตัวเลขล้วน · ขีด · เว้นวรรค · +66/66) · ส่วนหน้า @ ของอีเมล (≥ 6 ตัว)
  for (const v of [...raw]) {
    if (typeof v !== "string") continue;
    if (v.includes("@")) {
      const local = v.trim().split("@")[0] ?? "";
      // CRM C5.5-fix13 r2 ▸ RV13-2: ส่วนหน้า @ ที่เป็นคำของกล่องจดหมายกลาง (support · info · sales · contact · booking …) ไม่ใช่คำระบุตัว — ใช้เป็นคำเดี่ยวไม่ได้
      //   (ทับคำทั่วไปทั้งร้าน) · ที่อยู่เต็มยังเป็นคำระบุตัวเสมอ (บรรทัดของ raw) ◂
      if (local.length >= 6 && !isRoleMailboxLocal(local)) raw.push(local);
    } else if (/^[\d\s+().-]{9,}$/.test(v.trim())) raw.push(...phoneVariants(v)); // เฉพาะค่าที่เป็นเบอร์ (ไม่ใช่ LINE id ที่มีตัวเลข)
  }
  const out = new Set<string>();
  for (const v of raw) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s.length >= 4 && s !== CRM_ERASED_NAME) out.add(s);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/** CRM C5.5-fix13 r2 ▸ RV13-2: คำของกล่องจดหมายกลาง/ตามหน้าที่ (เทียบหลังตัดตัวเลข . _ - ท้าย/คั่น และตัวพิมพ์เล็ก) */
const ROLE_MAILBOX_WORDS = new Set([
  "support", "info", "admin", "administrator", "sales", "sale", "contact", "contactus", "hello", "office", "account", "accounts", "accounting",
  "billing", "service", "services", "customerservice", "noreply", "donotreply", "hr", "marketing", "team", "mail", "email", "webmaster",
  "postmaster", "hostmaster", "help", "helpdesk", "care", "customercare", "cs", "order", "orders", "booking", "bookings", "reservation",
  "reservations", "finance", "purchase", "purchasing", "procurement", "enquiry", "enquiries", "inquiry", "inquiries", "reception", "frontdesk",
  "invoice", "invoices", "payment", "payments", "shop", "store", "online", "official", "hotline", "callcenter", "career", "careers", "jobs",
  "news", "newsletter", "notification", "notifications", "system", "general",
]);
function isRoleMailboxLocal(local: string): boolean {
  const w = String(local ?? "").toLowerCase().replace(/[0-9._+-]+/g, "");
  return ROLE_MAILBOX_WORDS.has(w);
}

/** CRM C5.4-B ▸ hunter H3(e)/H4: รูปแบบที่คนพิมพ์เบอร์ไทยเดียวกัน (ไม่ใช่เบอร์ = []) — 0XXXXXXXXX · 0XX-XXX-XXXX · 0XX XXX XXXX · +66XXXXXXXXX · +66 XX XXX XXXX · 66XXXXXXXXX */
function phoneVariants(raw: string): string[] {
  const d = String(raw ?? "").replace(/\D/g, "");
  const local = d.startsWith("66") && (d.length === 11 || d.length === 10) ? `0${d.slice(2)}` : d.startsWith("0") ? d : "";
  if (local.length !== 10 && local.length !== 9) return [];
  const n = local.slice(1);
  const g = local.length === 10 ? [local.slice(0, 3), local.slice(3, 6), local.slice(6)] : [local.slice(0, 2), local.slice(2, 5), local.slice(5)];
  const ng = local.length === 10 ? [n.slice(0, 2), n.slice(2, 5), n.slice(5)] : [n.slice(0, 1), n.slice(1, 4), n.slice(4)];
  // CRM C5.5-fix13 r2 ▸ RV13-4: + เขียนแบบ 3-7 ของมือถือ (`081-2345678` · `081 2345678`) และ 2-7 ของเบอร์บ้าน (`02-1234567` · `02 1234567`) ◂
  const head = local.length === 10 ? 3 : 2;
  return [local, g.join("-"), g.join(" "), `${local.slice(0, head)}-${local.slice(head)}`, `${local.slice(0, head)} ${local.slice(head)}`, `+66${n}`, `+66 ${ng.join(" ")}`, `+66-${ng.join("-")}`, `66${n}`];
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
  formSubmissions: 0,
  aiMessages: 0,
  kanban: 0,
  auditScrubbed: 0,
  exportsWithdrawn: 0,
};

type EraseInput = { contactId: string; confirm?: boolean | null; reason?: string | null; source?: EraseSource | string | null };

/** คีย์สิทธิ์ของระบบสมาชิกที่ต้องมีจึงลบสมาชิกที่ผูกไว้ได้ (C3.9-fix H5 · `member/privacy.ts#requestErase`) */
const MEMBER_DELETE_KEY = "member.customer.delete";

/**
 * ลบผู้ติดต่อตามคำขอ PDPA — idempotent (ลบแล้ว = `erased:false` ไม่มี audit/event ใหม่) · ผู้เรียกระบบส่ง actor = null
 * (ตัวรับ `member.erased` · งานอายุเก็บ lead) · ผู้เรียกที่เป็นคนต้องถือ `crm.contact.delete`
 * ข้อมูลในฐานทั้งหมดหายใน tx เดียว (รวมผู้ติดต่อที่ถูกรวมเข้ามาทั้งสาย · พอร์ทัล · ลิงก์ไฟล์) ⇒ commit แล้ว = ลบแล้วจริง ·
 * ขั้นหลัง commit (`completeErasure`: วัตถุบนที่เก็บ · คำขออนุมัติ · สมาชิก) เป็นของตัวรับ `crm.contact.erased` (ส่งใหม่จนสำเร็จ) —
 * ที่นี่ลองทำให้ทันทีหนึ่งครั้งแบบ best-effort (ล้ม = followUp "PENDING" ไม่ใช่ error — การลบ commit ไปแล้ว)
 * C3.9-fix H7: ลบซ้ำ = **กวาดเนื้อหาซ้ำ** (ของที่หลุดเข้ามาหลังการลบครั้งแรก) โดยไม่มี audit/event ใหม่ · ยังตอบ `erased:false`
 * C3.9-fix H5: สมาชิกที่ผูกไว้ = ยื่นคำขอลบของระบบสมาชิก (ผู้กดต้องมี `member.customer.delete` · ไม่มี = ข้าม + WARN)
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
  // C3.9-fix H5 (ล่าความปลอดภัย B5): คีย์ลบสมาชิกเป็นของระบบสมาชิก — คีย์ crm.contact.delete อย่างเดียวลบสมาชิกไม่ได้
  const memberAllowed = !actor || (await import("@/lib/modules/member")).hasMemberPerm(actor, MEMBER_DELETE_KEY);

  // รีวิว C5.4-B รอบ 2 (SF): รอบของกฎ CRM ที่ subject เป็นดีลของเขาแต่ไม่มี crmContactId — หา **ก่อน** ล็อก (คำสั่งเดียว · คีย์ JSON ตรง)
  const dealRunIds = await dealRuleRunsOf(c, pre.id);
  // CRM C5.5-fix9 r2 (review M2): ธุรกรรมเดียวเกินเวลา = rollback ทั้งก้อน (ไม่มีอะไรถูกลบ) — ไม่ปล่อยเป็น "ลองใหม่" เฉย ๆ: OpsEvent ERROR
  //   (แจ้งเตือนทีมงานผ่าน logOps) + แถว audit ของความพยายามที่ล้ม (id/ตัวเลขล้วน · ไม่มีเหตุผลที่พิมพ์/ชื่อ/เบอร์) + ข้อความเฉพาะ (TOO_LARGE) ◂
  const timeoutMs = pageSize(deps?.txTimeoutMs, TX_OPTS.timeout);
  const startedAt = Date.now();
  let out: EraseTxOut;
  try {
    out = await prisma.$transaction((tx) => eraseInTx(tx, c, pre.id, reason, source, { memberAllowed, dealRunIds, batch: deps?.batch ?? null }), { ...TX_OPTS, timeout: timeoutMs });
  } catch (e) {
    if (!isTxTimeout(e)) throw e;
    const elapsedMs = Date.now() - startedAt;
    await logOps("ERROR", "crm.privacy", "ลบข้อมูลส่วนบุคคลไม่สำเร็จ — ข้อมูลของผู้ติดต่อนี้มากเกินกว่าจะลบเสร็จในธุรกรรมเดียว ระบบยกเลิกทั้งหมด (ยังไม่มีอะไรถูกลบ) ต้องให้ทีมงานดำเนินการ", {
      tenantId: c.tenantId,
      detail: JSON.stringify({ contactId: pre.id, systemId: c.systemId, source, elapsedMs, timeoutMs }),
    });
    await writeAudit({
      tenantId: c.tenantId,
      actorId: c.actorUserId,
      actorType: c.actorUserId ? "USER" : "SYSTEM",
      action: CRM_ERASE_FAILED_AUDIT_ACTION,
      targetType: "CrmContact",
      targetId: pre.id,
      after: { systemId: c.systemId, source, failure: "TIMEOUT", elapsedMs, timeoutMs },
    });
    throw fail("TOO_LARGE", "ข้อมูลของผู้ติดต่อนี้มีมากเกินกว่าจะลบให้เสร็จในครั้งเดียว — ระบบยกเลิกการลบทั้งหมด (ยังไม่มีข้อมูลใดถูกลบ) และแจ้งทีมงานแล้ว · การกดลบซ้ำจะไม่ช่วย");
  }
  const none = { memberSkipped: false, memberPending: false };
  if (!out.erased) {
    // C3.9-fix H7: การกวาดซ้ำเจอไฟล์ที่หลุดเข้ามา (ไม่มีแถว audit ใหม่ให้ตัวรับ event) ⇒ ลบวัตถุตรงนี้ · ล้ม = WARN (id ล้วน) ให้กวาดซ้ำได้อีก
    await deleteFilesNow(c.tenantId, pre.id, out.resweepFileIds, deps);
    // C5.5-fix11 (review fix9-r2 R2-4): ลบซ้ำ = ทำขั้นหลัง commit ของการลบครั้งแรกให้จบด้วย (รายการใน audit: ไฟล์ · คำขออนุมัติ · สมาชิก — idempotent)
    //   เผื่อตัวรับ `crm.contact.erased` ล้มครบ 5 ครั้งไปแล้ว (FAILED — ไม่มีใครลองให้อีก) · ล้ม = WARN ของ completeErasure + followUp PENDING
    let again: "DONE" | "PENDING" = "DONE";
    try {
      await completeErasure(c.tenantId, pre.id, deps);
    } catch {
      again = "PENDING";
    }
    return { contactId: pre.id, partyId: out.partyId, erased: false, counts: null, followUp: again, ...none };
  }
  if (out.memberSkipped.length) {
    await logOps("WARN", "crm.privacy", "ลบผู้ติดต่อ CRM แล้ว แต่ข้อมูลสมาชิกที่ผูกไว้ยังไม่ถูกลบ — ผู้ลบไม่มีสิทธิ์ลบข้อมูลสมาชิก ให้ผู้มีสิทธิ์ลบในระบบสมาชิก", {
      tenantId: c.tenantId,
      detail: JSON.stringify({ contactId: pre.id, customerIds: out.memberSkipped.slice(0, 20) }),
    });
  }
  let followUp: "DONE" | "PENDING" = "DONE";
  let post = { files: 0, memberErased: false, memberPending: false };
  // C5.5-fix9 r2 (review M3): commit แล้ว = ลบแล้ว — ขั้นหลัง commit ทำในคำขอนี้เฉพาะเมื่อเล็ก (ไฟล์บนที่เก็บลบทีละไฟล์) · ใหญ่ = ปล่อยให้ตัวรับ
  //   `crm.contact.erased` (outbox เดิม · ส่งใหม่จนสำเร็จ · ทุกขั้น idempotent) แล้วตอบ PENDING ทันที — คำขอไม่ค้างจนหน้าจอเห็นว่าล้มทั้งที่ลบแล้ว
  if (out.followUpFiles > INLINE_FOLLOWUP_FILES_MAX) followUp = "PENDING";
  else {
    try {
      post = await completeErasure(c.tenantId, pre.id, deps);
    } catch {
      followUp = "PENDING"; // completeErasure ลง OpsEvent WARN (id ล้วน) ไว้แล้ว · ตัวรับ event ทำต่อ
    }
  }
  return {
    contactId: pre.id,
    partyId: out.partyId,
    erased: true,
    counts: { ...out.counts, files: post.files, memberErased: post.memberErased },
    followUp,
    memberSkipped: out.memberSkipped.length > 0,
    memberPending: post.memberPending,
  };
}

/** ลบวัตถุไฟล์ทันที (ทางกวาดซ้ำ) — ล้ม = OpsEvent WARN (id ล้วน) · ไม่ throw (ข้อมูลในฐานถูกกวาดแล้ว) */
async function deleteFilesNow(tenantId: string, contactId: string, fileIds: readonly string[], deps?: PrivacyDeps | null): Promise<void> {
  if (!fileIds.length) return;
  const d = storeDeps(deps);
  const failed: string[] = [];
  for (const fid of new Set(fileIds)) {
    const r = await deleteFileAsset({ tenantId }, fid, d).catch(() => ({ ok: false as const }));
    if (!r.ok) failed.push(fid);
  }
  if (failed.length) {
    await logOps("WARN", "crm.privacy", "ลบไฟล์ที่หลุดเข้ามาหลังการลบข้อมูลส่วนบุคคลไม่สำเร็จ — กดลบข้อมูลของผู้ติดต่อนี้ซ้ำอีกครั้งเพื่อลองใหม่", {
      tenantId,
      detail: JSON.stringify({ contactId, fileIds: failed.slice(0, 50) }),
    });
  }
}

type EraseTxOut = { erased: boolean; partyId: string | null; counts: EraseCounts; memberSkipped: string[]; resweepFileIds: string[]; followUpFiles: number };
/** ขั้นหลัง commit ทำในคำขอได้ไม่เกินจำนวนไฟล์นี้ (ไฟล์ลบทีละคำสั่งบนที่เก็บ) — มากกว่า = ตัวรับ outbox ทำ */
const INLINE_FOLLOWUP_FILES_MAX = 100;
/** แถว audit ของการลบที่ล้มเพราะหมดเวลาธุรกรรม (ไม่ใช่ธง "ลบแล้ว") */
const CRM_ERASE_FAILED_AUDIT_ACTION = "crm.contact.erase.failed";
/** C5.5-fix11 (review fix9-r2 R2-3): "ใหญ่เกิน" = ธุรกรรมหมดเวลาเท่านั้น (`isExpiredTransactionError`) — P2028 แบบอื่น (ไม่พบธุรกรรม/ถูก rollback/
 *  ภายใน/รอเริ่มไม่ได้) = ความขัดข้องชั่วคราว ⇒ โยนต่อ (ข้อความทั่วไป "ลองใหม่อีกครั้ง" ของ action) */
const isTxTimeout = isExpiredTransactionError;

// ── C5.5-fix11 (review fix9-r2 R2-1): ตัวเขียนแบบชุด — หนึ่งคำสั่งต่อหน้า (≤ 1,000 แถว) แทนหนึ่งคำสั่งต่อแถว (≈ 9–10 ms ต่อรอบไปกลับจากเครื่องนี้) ──
//   ค่าใหม่ของแต่ละแถวคำนวณใน JS เหมือนเดิมทุกตัวอักษร แล้วส่งเป็นพารามิเตอร์อาร์เรย์ (`unnest`) · ชื่อตาราง/คอลัมน์ = ค่าคงที่ในโค้ด (ตรวจรูปแบบ)
//   ไม่มี SQL ที่ประกอบจากข้อมูล · คอลัมน์ `@updatedAt` ตั้งเองในคำสั่ง (Prisma `update` ตั้งให้ — ผลปลายทางต้องเหมือนเดิม)
const WRITE_PAGE = 1_000;
type WriteCol = { col: string; kind: "text" | "jsonb" | "boolean" | "textarray" };
const ident = (x: string) => {
  if (!/^[A-Za-z]+$/.test(x)) throw new Error(`crm.privacy: bad identifier ${x}`);
  return Prisma.raw(`"${x}"`);
};
const tsSql = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
/** ค่า JSON → ข้อความ jsonb (null/undefined = SQL NULL — แบบเดียวกับ Prisma.DbNull ของตัวเขียนเดิม) */
const jsonText = (v: unknown): string | null => (v === null || v === undefined ? null : JSON.stringify(v));
/**
 * UPDATE "<table>" x SET <cols = v.cols>, <extra> FROM unnest(<arrays>) v WHERE x.id = v.id AND x.tenantId = t — ทีละ WRITE_PAGE แถว
 * `values[i]` เรียงตาม `cols` · textarray ส่งเป็น jsonb (อาร์เรย์ของข้อความ) แล้วแปลงกลับตามลำดับเดิม · `extra(v)` = SET เพิ่มที่เป็นโค้ดล้วน
 */
async function writeRows(
  tx: Tx,
  table: string,
  tenantId: string,
  cols: readonly WriteCol[],
  rows: readonly { id: string; values: readonly unknown[] }[],
  extra?: Prisma.Sql,
): Promise<number> {
  let n = 0;
  const x = Prisma.raw("x");
  for (let i = 0; i < rows.length; i += WRITE_PAGE) {
    const page = rows.slice(i, i + WRITE_PAGE);
    const arrays = [
      Prisma.sql`${page.map((r) => r.id)}::text[]`,
      ...cols.map((c, k) => {
        const vals = page.map((r) => {
          const v = r.values[k];
          if (c.kind === "jsonb") return jsonText(v);
          if (c.kind === "textarray") return JSON.stringify(Array.isArray(v) ? v : []);
          return v ?? null;
        });
        const type = c.kind === "boolean" ? "boolean[]" : c.kind === "text" ? "text[]" : "jsonb[]";
        return Prisma.sql`${vals}::${Prisma.raw(type)}`;
      }),
    ];
    const names = [Prisma.raw(`"id"`), ...cols.map((c) => ident(c.col))];
    const sets = cols
      .filter((c) => c.kind !== "boolean")
      .map((c) =>
        c.kind === "textarray"
          ? Prisma.sql`${ident(c.col)} = ARRAY(SELECT e.a FROM jsonb_array_elements_text(v.${ident(c.col)}) WITH ORDINALITY AS e(a, n) ORDER BY e.n)`
          : Prisma.sql`${ident(c.col)} = v.${ident(c.col)}`,
      );
    n += Number(
      await tx.$executeRaw`UPDATE ${ident(table)} ${x} SET ${Prisma.join([...sets, ...(extra ? [extra] : [])], ", ")}
        FROM unnest(${Prisma.join(arrays, ", ")}) AS v(${Prisma.join(names, ", ")})
        WHERE ${x}."id" = v."id" AND ${x}."tenantId" = ${tenantId}`,
    );
  }
  return n;
}

/** จดหมายหนึ่งชุด (ชุดที่ 1 = ผูกเขา · ชุดที่ 2 = มีที่อยู่ของเขา) — ค่าใหม่ทุกช่องคำนวณใน JS · QUEUED → FAILED · `clear` = ล้างเนื้อ/ไฟล์แนบ + purgedAt */
type MailWrite = {
  id: string;
  subject: string;
  fromAddr: string;
  fromName: string | null;
  toAddrs: string[];
  ccAddrs: string[];
  bccAddrs: string[];
  bodyHtml: string | null;
  bodyText: string | null;
  snippet: string | null;
  queued: boolean;
  clear: boolean;
};
const MAIL_COLS: readonly WriteCol[] = [
  { col: "subject", kind: "text" },
  { col: "fromAddr", kind: "text" },
  { col: "fromName", kind: "text" },
  { col: "toAddrs", kind: "textarray" },
  { col: "ccAddrs", kind: "textarray" },
  { col: "bccAddrs", kind: "textarray" },
  { col: "bodyHtml", kind: "text" },
  { col: "bodyText", kind: "text" },
  { col: "snippet", kind: "text" },
  { col: "queued", kind: "boolean" },
  { col: "clear", kind: "boolean" },
];
async function writeMails(tx: Tx, tenantId: string, rows: readonly MailWrite[], now: Date, clearProviderError: boolean): Promise<void> {
  const at = tsSql(now);
  await writeRows(
    tx,
    "CrmEmailMessage",
    tenantId,
    MAIL_COLS,
    rows.map((m) => ({ id: m.id, values: [m.subject, m.fromAddr, m.fromName, m.toAddrs, m.ccAddrs, m.bccAddrs, m.bodyHtml, m.bodyText, m.snippet, m.queued, m.clear] })),
    Prisma.sql`"providerError" = CASE WHEN ${clearProviderError}::boolean THEN NULL ELSE x."providerError" END,
      "status" = CASE WHEN v."queued" THEN 'FAILED'::"CrmEmailStatus" ELSE x."status" END,
      "scheduledAt" = CASE WHEN v."queued" THEN NULL ELSE x."scheduledAt" END,
      "leaseUntil" = CASE WHEN v."queued" THEN NULL ELSE x."leaseUntil" END,
      "attachments" = CASE WHEN v."clear" THEN NULL ELSE x."attachments" END,
      "purgedAt" = CASE WHEN v."clear" THEN ${at} ELSE x."purgedAt" END,
      "updatedAt" = ${at}`,
  );
}

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

/** แถว AuditLog ของสายนี้ที่ต้องขัดตัวตน (C3.9-fix H8) — ยกเว้นแถว `crm.contact.erase` (หลักฐาน/ธง: id + เหตุผล) · ขนาดหน้า (C5.5-fix9: ไม่ใช่เพดาน) */
const AUDIT_SCRUB_PAGE = 5_000;
type AuditTrailRow = { id: string; targetId: string | null; before: Prisma.JsonValue; after: Prisma.JsonValue };

/**
 * ตัวตน "เดิม" ของคนในสาย (C3.9-fix H1): ชื่อ/เบอร์/อีเมล/LINE ที่เคยอยู่ในแถว audit ของตัวเขียนผู้ติดต่อ (แถวเก่าก่อน H8 เก็บค่าดิบ)
 * ชื่อ = ชื่อเต็มเท่านั้น (ท่อนเดียวไม่ใช้ — ไปทับคำทั่วไปของคนอื่น · มติรีวิว S1) · ชื่อ/นามสกุลแยกท่อนในแถวแก้ไข = ต่อกับอีกท่อนของตัวเขาเอง
 */
function formerIdentity(rows: readonly AuditTrailRow[], people: readonly CrmContact[]): { names: string[]; values: string[] } {
  const names: string[] = [];
  const values: string[] = [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const raw = (v: unknown) => (typeof v === "string" && v.trim() && v.trim() !== AUDIT_CHANGED_MARK && v.trim() !== CRM_ERASED_MASK ? v.trim() : null);
  for (const r of rows) {
    const p = r.targetId ? byId.get(r.targetId) : undefined;
    for (const o of [r.before, r.after]) {
      if (!isObj(o)) continue;
      const n = raw(o.name);
      if (n) names.push(n);
      const f = raw(o.firstName);
      const l = raw(o.lastName);
      if (f || l) names.push(joinName(f ?? p?.firstName ?? null, l ?? p?.lastName ?? null));
      for (const k of ["phone", "email", "lineUserId"]) {
        const v = raw(o[k]);
        if (v) values.push(v);
      }
      if (Array.isArray(o.previousEmails)) for (const e of o.previousEmails) if (raw(e)) values.push(raw(e) as string);
    }
  }
  return { names, values };
}

/** รีวิว C3.9-fix B1(c): เพดานจดหมายชุดที่ 2 (มีที่อยู่ของเขาแต่ไม่ได้ผูกเขา) ต่อการลบหนึ่งครั้ง */
const SECOND_SET_MAX = 500;

/**
 * รีวิว C3.9-fix B1 (มติผู้คุมงาน): ค่าที่ **ไม่ใช่ของคนที่ถูกลบคนเดียว** ในชุดผู้สมัคร — ห้ามใช้ปิด/ตัด/ล้างที่ไหน
 *   อีเมล: ที่อยู่ของร้าน (ตั้งค่าอีเมลระบบ + รายคน: ผู้ส่ง/ตอบกลับ/สำเนา) · ที่อยู่ของระบบ SHARK · อีเมลพนักงานของร้าน ·
 *     อีเมล/อีเมลเก่าของผู้ติดต่อคนอื่นที่ยังไม่ถูกลบ (ทุกระบบของร้าน) · อีเมลของ Party อื่น
 *   เบอร์: ของผู้ติดต่อคนอื่นที่ยังไม่ถูกลบ · ของ Party อื่น (ตรงตัวหรือรูปมาตรฐาน)
 *   ชื่อ: ชื่อของผู้ติดต่อคนอื่นที่ยังไม่ถูกลบ · ชื่อพนักงานของร้าน
 */
async function notThePerson(
  tx: Tx,
  t: string,
  ids: readonly string[],
  partyIds: readonly string[],
  cand: { emails: readonly string[]; phones: readonly string[]; names: readonly string[] },
): Promise<{ fixedEmails: Set<string>; emails: Set<string>; phones: Set<string>; names: Set<string>; holders: { id: string; email: string }[] }> {
  const out = { fixedEmails: new Set<string>(), emails: new Set<string>(), phones: new Set<string>(), names: new Set<string>(), holders: [] as { id: string; email: string }[] };
  const em = [...new Set(cand.emails.map((x) => bareEmail(x)).filter((x) => x.includes("@")))];
  const ph = [...new Set(cand.phones.map((x) => x.trim()).filter(Boolean))];
  const nm = [...new Set(cand.names.map((x) => x.trim()).filter(Boolean))];
  const liveOther = Prisma.sql`c."tenantId" = ${t} AND NOT (c."id" = ANY(${[...ids]}::text[]))
    AND NOT EXISTS (SELECT 1 FROM "AuditLog" e WHERE e."action" = ${CRM_ERASE_AUDIT_ACTION} AND e."targetId" = c."id" AND e."tenantId" = c."tenantId")`;
  const otherParty = Prisma.sql`p."tenantId" = ${t} AND NOT (p."id" = ANY(${[...partyIds]}::text[]))`;
  if (em.length) {
    const shop = await emails.shopMailAddressesInTx(tx, t);
    for (const e of em) if (shop.has(e) || emails.isSystemMailAddress(e)) out.fixedEmails.add(e);
    const staff = await tx.$queryRaw<{ v: string }[]>`
      SELECT lower(u."email") AS "v" FROM "Membership" m JOIN "User" u ON u."id" = m."userId" WHERE m."tenantId" = ${t} AND lower(u."email") = ANY(${em}::text[])`;
    for (const r of staff) if (r.v) out.fixedEmails.add(r.v);
    // CRM C5.5-fix9 (sweep): "ที่อยู่ไหนมีคนอื่นถือ" = คำสั่ง DISTINCT ที่อยู่ (ไม่มี LIMIT — ผลมีได้ไม่เกินจำนวนที่อยู่ที่ถาม) ·
    //   LIMIT เหลือเฉพาะรายชื่อผู้ถือสำหรับ WARN (≤ 20 ต่อที่อยู่ — เดิม LIMIT 200 ของคู่ (ผู้ถือ, ที่อยู่) ทำให้ที่อยู่ที่ถูกถือร่วมหลุดจากชุดได้เงียบ ๆ)
    const heldEmails = await tx.$queryRaw<{ v: string }[]>`
      SELECT DISTINCT lower(btrim(x.e)) AS "v" FROM "CrmContact" c, unnest(array_append(c."previousEmails", c."email")) x(e)
       WHERE ${liveOther} AND x.e IS NOT NULL AND lower(btrim(x.e)) = ANY(${em}::text[])`;
    const contacts = await tx.$queryRaw<{ id: string; v: string }[]>`
      SELECT h."id", h."v" FROM (
        SELECT d."id", d."v", row_number() OVER (PARTITION BY d."v" ORDER BY d."id") AS "rn" FROM (
          SELECT DISTINCT c."id", lower(btrim(x.e)) AS "v" FROM "CrmContact" c, unnest(array_append(c."previousEmails", c."email")) x(e)
           WHERE ${liveOther} AND x.e IS NOT NULL AND lower(btrim(x.e)) = ANY(${em}::text[])) d) h
       WHERE h."rn" <= 20`;
    const partiesHit = await tx.$queryRaw<{ v: string }[]>`
      SELECT DISTINCT lower(btrim(p."email")) AS "v" FROM "Party" p WHERE ${otherParty} AND lower(btrim(p."email")) = ANY(${em}::text[])`;
    for (const r of [...heldEmails, ...partiesHit]) if (r.v) out.emails.add(r.v);
    for (const r of contacts) if (r.v) out.holders.push({ id: r.id, email: r.v });
    for (const e of out.fixedEmails) out.emails.add(e);
  }
  if (ph.length) {
    const norm = [...new Set(ph.map((x) => party.normalizePartyPhone(x)).filter(Boolean))];
    const contacts = await tx.$queryRaw<{ v: string }[]>`SELECT DISTINCT c."phone" AS "v" FROM "CrmContact" c WHERE ${liveOther} AND c."phone" = ANY(${ph}::text[])`;
    const partiesHit = await tx.$queryRaw<{ v: string | null; n: string | null }[]>`
      SELECT p."phone" AS "v", p."phoneNorm" AS "n" FROM "Party" p WHERE ${otherParty} AND (p."phone" = ANY(${ph}::text[]) OR p."phoneNorm" = ANY(${norm}::text[]))`;
    const heldNorm = new Set(partiesHit.map((r) => r.n).filter((x): x is string => !!x));
    for (const r of [...contacts, ...partiesHit]) if (r.v) out.phones.add(r.v.trim());
    for (const p of ph) if (heldNorm.has(party.normalizePartyPhone(p))) out.phones.add(p);
  }
  if (nm.length) {
    const contacts = await tx.$queryRaw<{ v: string }[]>`SELECT DISTINCT c."name" AS "v" FROM "CrmContact" c WHERE ${liveOther} AND c."name" = ANY(${nm}::text[])`;
    const staff = await tx.$queryRaw<{ v: string }[]>`
      SELECT u."name" AS "v" FROM "Membership" m JOIN "User" u ON u."id" = m."userId" WHERE m."tenantId" = ${t} AND u."name" = ANY(${nm}::text[])`;
    for (const r of [...contacts, ...staff]) if (r.v) out.names.add(r.v.trim());
  }
  return out;
}

/**
 * CRM C5.4-B ▸ L5-M2 (รีวิวรอบ 2): id ของรอบกฎ scope CRM ของระบบนี้ ที่ไม่มี crmContactId แต่ subject เป็นดีลของคนนี้ (ทั้งสายที่ถูกรวม) —
 * คีย์ที่เอนจินเขียนจริง: รอบหลัก `payload.event.payload.dealId` · ขั้นที่รอเวลา `payload.refs.dealId` · อ่านนอก tx (ไม่ถือล็อก) คำสั่งเดียว
 */
async function dealRuleRunsOf(ctx: { tenantId: string; systemId: string }, contactId: string): Promise<string[]> {
  const chain = (await mergedChain(prisma as unknown as Tx, ctx, contactId)).ids;
  const people = [contactId, ...chain];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH d AS (
      SELECT x."id" FROM "CrmDeal" x
       WHERE x."tenantId" = ${ctx.tenantId} AND x."systemId" = ${ctx.systemId}
         AND (x."contactId" = ANY(${people}::text[])
              OR EXISTS (SELECT 1 FROM "CrmDealContact" dc WHERE dc."tenantId" = ${ctx.tenantId} AND dc."dealId" = x."id" AND dc."contactId" = ANY(${people}::text[])))
    )
    SELECT r."id" FROM "AutomationRun" r JOIN "AutomationRule" ru ON ru."id" = r."ruleId"
     WHERE r."tenantId" = ${ctx.tenantId} AND ru."tenantId" = ${ctx.tenantId} AND ru."scope"::text = 'CRM' AND ru."systemId" = ${ctx.systemId}
       AND r."crmContactId" IS NULL AND r."payload" IS NOT NULL
       AND (r."payload"->'event'->'payload'->>'dealId' IN (SELECT "id" FROM d) OR r."payload"->'refs'->>'dealId' IN (SELECT "id" FROM d))`;
  return rows.map((r) => r.id);
}

async function eraseInTx(
  tx: Tx,
  ctx: PrivacyCtx & { actorUserId: string | null },
  id: string,
  reason: string,
  source: EraseSource,
  opts: { memberAllowed: boolean; dealRunIds?: readonly string[]; batch?: number | null },
): Promise<EraseTxOut> {
  const t = ctx.tenantId;
  const sysScope = { tenantId: t, systemId: ctx.systemId };
  // AUDIT-CLASS X3: ล็อกแถวก่อนอ่านธง — 10 ทางพร้อมกันรอกันที่นี่ แล้วอ่านธง (แถว audit ของคนที่ชนะ commit แล้ว) ⇒ ผู้ชนะคนเดียว
  await tx.$queryRaw`SELECT "id" FROM "CrmContact" WHERE "id" = ${id} AND "tenantId" = ${t} AND "systemId" = ${ctx.systemId} FOR UPDATE`;
  const row = await tx.crmContact.findFirst({ where: { id, ...sysScope } });
  if (!row) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  // C3.9-fix H7 (ล่าความปลอดภัย M2): ลบแล้ว = ไม่มี audit/event/สมาชิก/ถอนไฟล์ส่งออกใหม่ แต่ **กวาดเนื้อหาซ้ำ** ตามขอบเขตเดิม
  //   (ของที่หลุดเข้ามาหลังการลบครั้งแรก — เช่น กิจกรรมจากทางที่ยังไม่มีด่าน) ⇒ ปุ่มลบซ้ำ = ทางแก้ของผู้ดูแล
  const resweep = !!(await erasedAudit(tx, t, id));
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
  // C3.9-fix H12 (ล่าความปลอดภัย m2): คนในสายที่ถูกลบไปก่อนแล้ว (ลบตัวเขาตรง ๆ) มีแถว audit ของตัวเองแล้ว ⇒ ไม่เขียนแถวที่สอง
  const erasedBefore = new Set(
    (await tx.auditLog.findMany({ where: { tenantId: t, action: CRM_ERASE_AUDIT_ACTION, targetId: { in: ids } }, select: { targetId: true } })).map((a) => a.targetId),
  );
  counts.mergedContacts = chainRows.length;
  const partyIds = [...new Set(people.map((p) => p.partyId).filter((x): x is string => !!x))];
  const parties = partyIds.length ? await tx.party.findMany({ where: { id: { in: partyIds }, tenantId: t }, select: { id: true, phone: true, email: true } }) : [];
  const linkedMembers = [...new Set(people.map((p) => p.memberCustomerId).filter((x): x is string => !!x))];
  // รีวิวรอบ 2 N5: สมาชิกเกี่ยวเฉพาะคำขอของคน (REQUEST) — งานอัตโนมัติ (RETENTION) ห้ามแตะสมาชิกเด็ดขาด · MEMBER = สมาชิกถูกลบมาก่อนแล้ว
  // C3.9-fix H5: REQUEST + คีย์ member.customer.delete = ยื่นคำขอลบของระบบสมาชิก (หลัง commit · สายอนุมัติของสมาชิก) · ไม่มีคีย์ = ข้าม + WARN
  const memberAsk = !resweep && source === "REQUEST" && opts.memberAllowed ? linkedMembers : [];
  const memberSkipped = !resweep && source === "REQUEST" && !opts.memberAllowed ? linkedMembers : [];

  // ── C3.9-fix H1 (ล่าความปลอดภัย B1): คำตอบฟอร์มบนเว็บของคนในสาย (ผ่าน facade ฟอร์ม) — ล้างคำตอบ + ip/หน้า/ที่มา · เก็บค่าที่เคยกรอกไว้เป็นคำระบุตัว ──
  const forms = await import("@/lib/modules/forms");
  const formOut = await forms.eraseCrmContactSubmissions(tx, t, ids, { batch: opts.batch ?? null });
  counts.formSubmissions = formOut.count;
  // ── C3.9-fix H8 (ล่าความปลอดภัย M3) + H1: ร่องรอย audit ของสาย (อ่านก่อนขัด — ตัวตนเดิมจากแถวแก้ไขเก่าเข้าชุดคำระบุตัว) ──
  //   CRM C5.5-fix9 (sweep ของ hunt-3): ทุกแถว — เดิมขัด 5,000 แถวแรกตาม createdAt แล้ว WARN "ลบซ้ำ = กวาดต่อ" แต่การลบซ้ำหยิบ 5,000 แถวเดิม
  //   (แถวที่ 5,001+ ไม่เคยถูกขัด) ⇒ รอบแรกอ่านทีละหน้า (keyset id) เก็บแค่ id + ตัวตนเดิม · รอบขัด (ท้าย tx) อ่านทีละหน้าจาก id ชุดนั้น
  const auditPage = pageSize(opts.batch, AUDIT_SCRUB_PAGE);
  const trailIds: string[] = [];
  const former: { names: string[]; values: string[] } = { names: [], values: [] };
  for (let cursor: string | null = null; ; ) {
    const page: AuditTrailRow[] = await tx.auditLog.findMany({
      where: { tenantId: t, targetId: { in: ids }, NOT: { action: CRM_ERASE_AUDIT_ACTION }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, targetId: true, before: true, after: true },
      orderBy: { id: "asc" },
      take: auditPage,
    });
    const f = formerIdentity(page, people);
    former.names.push(...f.names);
    former.values.push(...f.values);
    for (const r of page) trailIds.push(r.id);
    if (page.length < auditPage) break;
    cursor = page[page.length - 1]!.id;
  }
  former.names = [...new Set(former.names)];
  former.values = [...new Set(former.values)];

  // ── รีวิว C3.9-fix B1 (มติผู้คุมงาน): ตัวตน "ของเขาเอง" เท่านั้น — ที่อยู่ของร้าน/ระบบ/พนักงาน และค่าที่คนอื่นที่ยังไม่ถูกลบในร้านถือร่วม ห้ามถูกนับ ──
  //   ที่อยู่ของเขา (H2) = อีเมลของผู้ติดต่อ + อีเมลเก่า + อีเมลของ Party + ช่อง `email` หลักของฟอร์ม (ช่องที่สะพานฟอร์มผูกเป็นตัวตน)
  //   คำระบุตัวจากฟอร์ม/audit เก่า (H1) ผ่านตัวกรองเดียวกัน (ชื่อ · เบอร์ · อีเมล) · คำระบุตัวของแถวปัจจุบันถูกกรองเฉพาะอีเมล
  const ownEmails = [...people.flatMap((p) => [p.email, ...(p.previousEmails ?? [])]), ...parties.map((p) => p.email), ...formOut.identity.emails].map((x) => bareEmail(x)).filter((x) => x.includes("@"));
  const extraNames = [...former.names, ...formOut.identity.names];
  const extraValues = [...former.values, ...formOut.identity.phones, ...formOut.identity.emails];
  const notHis = await notThePerson(tx, t, ids, partyIds, {
    emails: [...ownEmails, ...extraValues.filter((v) => v.includes("@")).map((v) => bareEmail(v))],
    // CRM C5.4-B ▸ hunter H4: เบอร์ของแถวปัจจุบัน (ผู้ติดต่อ + Party) ด้วย — เบอร์ที่คนอื่นที่ยังไม่ถูกลบใช้อยู่ (เบอร์สำนักงาน) ไม่ถูกปิดในของคนอื่น
    phones: [...extraValues.filter((v) => !v.includes("@")), ...people.map((p) => p.phone ?? ""), ...parties.map((p) => p.phone ?? "")].filter(Boolean),
    names: extraNames,
  });
  // รีวิวรอบ 2 R2-S1 (มติผู้คุมงาน): ตัวตนของแถวปัจจุบัน (อีเมล/เบอร์/ชื่อของผู้ติดต่อ + Party) ตัดเฉพาะที่อยู่ร้าน/ระบบ/พนักงาน — ที่อยู่ที่ผู้ติดต่อคนอื่น
  //   ใช้ร่วม (เช่น ผู้ติดต่อซ้ำ) ยังเป็นของเขา ⇒ ชุดที่ 1 (จดหมายที่ผูกเขา) + การแทนคำทั้งร้าน (แจ้งเตือน/AI/บอร์ดงาน/audit) ยังตัด/ปิด เหมือน C3.9 เดิม ·
  //   ข้อยกเว้น "คนอื่นถือร่วม" ใช้กับ (ก) คำจากฟอร์ม/audit เก่า (ข) ชุดที่ 2 (จดหมายของคนอื่น) เท่านั้น — ถือร่วม = WARN พร้อม id ของผู้ถือ (id ล้วน)
  const extraTokens = identityTokens([], [], {
    names: extraNames.filter((n) => !notHis.names.has(n.trim())),
    values: extraValues.filter((v) => (v.includes("@") ? !notHis.emails.has(bareEmail(v)) : !notHis.phones.has(v.trim()))),
  });
  const coreTokens = identityTokens(people, parties).filter((tk) => !(tk.includes("@") && notHis.fixedEmails.has(bareEmail(tk))));
  const tokens = [...new Set([...coreTokens, ...extraTokens])].sort((a, b) => b.length - a.length);
  // CRM C5.4-B ▸ hunter H4: รูปแบบทั้งหมดของเบอร์ที่คนอื่นถือร่วม — ไม่ใช้กับของคนอื่น (ชุดที่ 2 + การแทนคำทั้งร้าน) แต่ยังปิดในของเขาเอง
  const sharedPhone = new Set([...notHis.phones].flatMap((p) => [p.trim(), ...phoneVariants(p)]));
  const tokens2 = tokens.filter((tk) => !(tk.includes("@") && notHis.emails.has(bareEmail(tk))) && !sharedPhone.has(tk));
  const tokensT = tokens.filter((tk) => !sharedPhone.has(tk)); // ทั้งร้าน (แจ้งเตือน/AI/ข้อเสนอ/ห้องทีม) — อีเมลตามมติ R2-S1 เดิม
  const ownSet = new Set(ownEmails);
  const personAddrs = new Set(ownEmails.filter((a) => !notHis.fixedEmails.has(a))); // ชุดที่ 1
  const personAddrs2 = new Set(ownEmails.filter((a) => !notHis.emails.has(a))); // ชุดที่ 2
  const holders = notHis.holders.filter((h) => ownSet.has(h.email));
  if (holders.length) {
    await logOps("WARN", "crm.privacy", "อีเมลของผู้ติดต่อที่ถูกลบมีผู้ติดต่อคนอื่นที่ยังไม่ถูกลบใช้อยู่ — ตัดออกจากจดหมาย/ข้อความของเขาเองแล้ว แต่คงไว้ในจดหมายของคนอื่น ตรวจว่าเป็นคนเดียวกันไหม", {
      tenantId: t,
      detail: JSON.stringify({ contactId: id, heldBy: [...new Set(holders.map((h) => h.id))].slice(0, 20) }),
    });
  }
  const mask = (v: string | null) => maskText(v, tokens);
  const mask2 = (v: string | null) => maskText(v, tokens2);
  const fileIds: string[] = [];
  const contentToo = source !== "RETENTION";

  // ── อีเมล (แถวคงอยู่ · ล็อกแถวก่อนเก็บรหัสไฟล์แนบ — งานล้างตามอายุที่วิ่งพร้อมกันรอแล้วเห็นว่าจองไปแล้ว) ──
  //   ลำดับล็อก (รีวิว C3.9-fix NOTE): ชุดที่ 1 (ผูกเขา) แล้วชุดที่ 2 (มีที่อยู่ของเขา) — ต่างชุดเรียง id · การลบสองคนพร้อมกันที่ใช้จดหมายฉบับเดียวกัน
  //   (เช่น cc กันไปมา) อาจชนกันเป็น deadlock ⇒ Postgres ยกเลิกหนึ่ง tx (rollback ทั้งการลบ · ไม่มีอะไรครึ่ง ๆ) — ผู้กดลองใหม่/งานวิ่งรอบหน้า (ยอมรับ · มติผู้คุมงาน)
  type MailRow = { id: string; contactId: string | null; direction: string; status: string; fromAddr: string; fromName: string | null; toAddrs: string[]; ccAddrs: string[]; bccAddrs: string[]; subject: string; bodyHtml: string | null; bodyText: string | null; snippet: string | null; attachments: Prisma.JsonValue };
  const mails = await tx.$queryRaw<MailRow[]>`
    SELECT "id", "contactId", "direction"::text AS "direction", "status"::text AS "status", "fromAddr", "fromName", "toAddrs", "ccAddrs", "bccAddrs", "subject", "bodyHtml", "bodyText", "snippet", "attachments"
      FROM "CrmEmailMessage" WHERE "tenantId" = ${t} AND "systemId" = ${ctx.systemId} AND "contactId" = ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
  const isPersonAddr = (a: string) => personAddrs.has(bareEmail(a));
  const keepAddr = (a: string) => notHis.fixedEmails.has(bareEmail(a)) || (!isPersonAddr(a) && !tokens.some((tk) => a.includes(tk)));
  const isPersonAddr2 = (a: string) => personAddrs2.has(bareEmail(a));
  const keepAddr2 = (a: string) => notHis.emails.has(bareEmail(a)) || (!isPersonAddr2(a) && !tokens2.some((tk) => a.includes(tk)));
  const attachmentIds = (m: MailRow) => {
    for (const a of Array.isArray(m.attachments) ? m.attachments : []) {
      const fid = isObj(a) && typeof a.fileId === "string" ? a.fileId : null;
      if (fid) fileIds.push(fid);
    }
  };
  // NOTE รีวิว C3.9: จดหมายที่ตั้งเวลาไว้ถึงคนที่ถูกลบต้องไม่ถูกส่งออกไปอีก (ปลายทางถูกล้างแล้ว) ⇒ FAILED ใน tx เดียวกัน
  //   C5.5-fix11: ค่าเดิมทุกช่อง เขียนเป็นชุด (writeMails · providerError = null ในชุดนี้)
  const set1: MailWrite[] = mails.map((m) => {
    const queued = m.status === "QUEUED";
    const clear = contentToo || queued;
    if (clear) attachmentIds(m);
    return {
      id: m.id,
      subject: mask(m.subject) ?? "",
      fromAddr: keepAddr(m.fromAddr) ? m.fromAddr : "",
      fromName: m.direction === "IN" ? null : mask(m.fromName),
      toAddrs: m.toAddrs.filter(keepAddr),
      ccAddrs: m.ccAddrs.filter(keepAddr),
      bccAddrs: m.bccAddrs.filter(keepAddr),
      bodyHtml: clear ? null : mask(m.bodyHtml),
      bodyText: clear ? null : mask(m.bodyText),
      snippet: clear ? null : mask(m.snippet),
      queued,
      clear,
    };
  });
  await writeMails(tx, t, set1, now, true);
  counts.emails = mails.length;
  if (mails.length) await tx.crmEmailEvent.deleteMany({ where: { emailId: { in: mails.map((m) => m.id) } } });

  // ── C3.9-fix H2 (ล่าความปลอดภัย B2): จดหมายที่ **ไม่ได้ผูก** คนนี้ (ของคนอื่น/ไม่ผูกใคร) แต่มีที่อยู่ของเขาใน from/to/cc/bcc ──
  //   ที่อยู่ของเขาถูกตัดออกจากรายการ · คำระบุตัวในหัวข้อ/เนื้อ/ชื่อผู้ส่งถูกปิด (ที่อยู่ของเจ้าของจดหมาย/ร้านคงไว้) ·
  //   จดหมายที่ **เขาเป็นผู้ส่ง** และไม่ผูกใคร = เนื้อหาของเขาเอง ⇒ ล้างเนื้อ/ไฟล์แนบ + หัวข้อ (RETENTION = ปิดคำระบุตัวแทน — อีเมลมีนาฬิกาของตัวเอง) ·
  //   จดหมาย QUEUED ในชุดนี้ = FAILED เหมือนชุดที่ 1 (ปลายทางที่เป็นเขาถูกตัดแล้ว — ห้ามส่งฉบับที่ถูกแก้ออกไป)
  //   รีวิว C3.9-fix B1(c): ชุดนี้เกิน SECOND_SET_MAX = ไม่แตะเลย (ไม่ล้างครึ่ง ๆ) + WARN id ล้วน — ที่อยู่ที่ตรงจดหมายจำนวนมากขนาดนั้นน่าจะไม่ใช่ของเขาคนเดียว
  const addrList = [...personAddrs2];
  const matchedCount = addrList.length
    ? Number(
        (
          await tx.$queryRaw<{ n: number }[]>`
            SELECT count(*)::int AS "n" FROM "CrmEmailMessage" m
             WHERE m."tenantId" = ${t} AND m."systemId" = ${ctx.systemId}
               AND (m."contactId" IS NULL OR NOT (m."contactId" = ANY(${ids}::text[])))
               AND (lower(btrim(m."fromAddr")) = ANY(${addrList}::text[])
                    OR EXISTS (SELECT 1 FROM unnest(m."toAddrs" || m."ccAddrs" || m."bccAddrs") x(a) WHERE lower(btrim(x.a)) = ANY(${addrList}::text[])))`
        )[0]?.n ?? 0,
      )
    : 0;
  if (matchedCount > SECOND_SET_MAX) {
    await logOps("WARN", "crm.privacy", "จดหมายที่มีที่อยู่ของผู้ติดต่อที่ถูกลบแต่ไม่ได้ผูกเขามีมากเกินเพดาน — ไม่ได้แตะชุดนี้ ตรวจสอบก่อนลบซ้ำ", { tenantId: t, detail: JSON.stringify({ contactId: id, matched: matchedCount, cap: SECOND_SET_MAX }) });
  }
  const matched = addrList.length && matchedCount > 0 && matchedCount <= SECOND_SET_MAX
    ? await tx.$queryRaw<MailRow[]>`
        SELECT m."id", m."contactId", m."direction"::text AS "direction", m."status"::text AS "status", m."fromAddr", m."fromName", m."toAddrs", m."ccAddrs", m."bccAddrs", m."subject", m."bodyHtml", m."bodyText", m."snippet", m."attachments"
          FROM "CrmEmailMessage" m
         WHERE m."tenantId" = ${t} AND m."systemId" = ${ctx.systemId}
           AND (m."contactId" IS NULL OR NOT (m."contactId" = ANY(${ids}::text[])))
           AND (lower(btrim(m."fromAddr")) = ANY(${addrList}::text[])
                OR EXISTS (SELECT 1 FROM unnest(m."toAddrs" || m."ccAddrs" || m."bccAddrs") x(a) WHERE lower(btrim(x.a)) = ANY(${addrList}::text[])))
         ORDER BY m."id" FOR UPDATE`
    : [];
  const set2: MailWrite[] = matched.map((m) => {
    const fromPerson = isPersonAddr2(m.fromAddr);
    const clear = fromPerson && !m.contactId && contentToo;
    if (clear) attachmentIds(m);
    return {
      id: m.id,
      subject: clear ? "" : (mask2(m.subject) ?? ""),
      fromAddr: keepAddr2(m.fromAddr) ? m.fromAddr : "",
      fromName: fromPerson ? null : mask2(m.fromName),
      toAddrs: m.toAddrs.filter(keepAddr2),
      ccAddrs: m.ccAddrs.filter(keepAddr2),
      bccAddrs: m.bccAddrs.filter(keepAddr2),
      bodyHtml: clear ? null : mask2(m.bodyHtml),
      bodyText: clear ? null : mask2(m.bodyText),
      snippet: clear ? null : mask2(m.snippet),
      queued: m.status === "QUEUED",
      clear,
    };
  });
  await writeMails(tx, t, set2, now, false); // ชุดที่ 2: providerError ของจดหมายคนอื่นคงไว้ (เหมือนเดิม)
  counts.emails += matched.length;

  // ── กิจกรรม (แถว + ตัวเลขคงอยู่ · เนื้อ/ถอดเสียง/สรุป AI หาย · ไฟล์เสียงลบหลัง commit) ──
  const acts = await tx.$queryRaw<{ id: string; title: string; recordingFileId: string | null }[]>`
    SELECT "id", "title", "recordingFileId" FROM "CrmActivity" WHERE "tenantId" = ${t} AND "contactId" = ANY(${ids}::text[]) ORDER BY "id" FOR UPDATE`;
  //   C5.5-fix11: ทุกแถวเขียนเป็นชุด (เดิมทุกแถวถูก update อยู่แล้ว — เนื้อ/ถอดเสียง/สรุป = NULL · หัวข้อ = ปิดคำ · ไฟล์เสียง = NULL เมื่อ contentToo)
  const actRows = acts.map((a) => {
    const dropRec = contentToo && !!a.recordingFileId;
    if (dropRec) {
      fileIds.push(a.recordingFileId as string);
      counts.recordings += 1;
    }
    return { id: a.id, values: [mask(a.title) ?? "", dropRec ? null : a.recordingFileId] };
  });
  await writeRows(tx, "CrmActivity", t, [{ col: "title", kind: "text" }, { col: "recordingFileId", kind: "text" }], actRows,
    Prisma.sql`"body" = NULL, "transcript" = NULL, "aiSummary" = NULL, "aiNextStep" = NULL, "location" = NULL, "meetingUrl" = NULL, "attendees" = NULL`);
  counts.activities = acts.length;

  // ── CRM C5.4-B ▸ L5-M1: ดีลของเขา (ผูกตรง หรือผ่าน CrmDealContact) — แถว/ตัวเลข/ขั้น/ผู้ดูแลคงอยู่ แต่คำระบุตัวใน title · nextStep ·
  //   lostReason ถูกปิด (ชื่อดีลปริยาย "ดีล <ชื่อ>" ของหน้าแปลง lead · กฎ CREATE_DEAL {ชื่อ} · ขั้นต่อไปที่ AI/พนักงานเขียน) ──
  const deals = await tx.$queryRaw<{ id: string; title: string; nextStep: string | null; lostReason: string | null }[]>`
    SELECT d."id", d."title", d."nextStep", d."lostReason" FROM "CrmDeal" d
     WHERE d."tenantId" = ${t} AND d."systemId" = ${ctx.systemId}
       AND (d."contactId" = ANY(${ids}::text[])
            OR EXISTS (SELECT 1 FROM "CrmDealContact" dc WHERE dc."tenantId" = ${t} AND dc."dealId" = d."id" AND dc."contactId" = ANY(${ids}::text[])))
     ORDER BY d."id" FOR UPDATE`;
  const dealRows: { id: string; values: unknown[] }[] = [];
  for (const d of deals) {
    const title = mask(d.title) ?? "";
    const nextStep = mask(d.nextStep);
    const lostReason = mask(d.lostReason);
    if (title !== d.title || nextStep !== d.nextStep || lostReason !== d.lostReason) dealRows.push({ id: d.id, values: [title || CRM_ERASED_MASK, nextStep, lostReason] });
  }
  await writeRows(tx, "CrmDeal", t, [{ col: "title", kind: "text" }, { col: "nextStep", kind: "text" }, { col: "lostReason", kind: "text" }], dealRows, Prisma.sql`"updatedAt" = ${tsSql(now)}`);
  // CRM C5.4-B ▸ hunter H3(a–c): บันทึกการย้ายขั้นของดีลเหล่านั้น · กิจกรรมระดับดีล (ของผู้ติดต่อคนอื่นบนดีลของเขา — เปลือกคงอยู่) ·
  //   การ์ดบอร์ดงานที่ผูก DEAL ของดีลเหล่านั้น — ปิดคำระบุตัวของเขา (ตัวเลข/ขั้น/เจ้าของคงอยู่)
  const dealIds = deals.map((d) => d.id);
  if (dealIds.length) {
    const notes: { id: string; values: unknown[] }[] = [];
    for (const h of await tx.crmDealStageHistory.findMany({ where: { tenantId: t, dealId: { in: dealIds }, note: { not: null } }, select: { id: true, note: true } })) {
      const note = mask(h.note);
      if (note !== h.note) notes.push({ id: h.id, values: [note] });
    }
    await writeRows(tx, "CrmDealStageHistory", t, [{ col: "note", kind: "text" }], notes);
    const dealActs = await tx.$queryRaw<{ id: string; title: string; body: string | null }[]>`
      SELECT "id", "title", "body" FROM "CrmActivity" WHERE "tenantId" = ${t} AND "dealId" = ANY(${dealIds}::text[])
         AND ("contactId" IS NULL OR NOT ("contactId" = ANY(${ids}::text[]))) ORDER BY "id" FOR UPDATE`;
    const dealActRows: { id: string; values: unknown[] }[] = [];
    for (const a of dealActs) {
      const title = mask(a.title) ?? "";
      const body = mask(a.body);
      if (title !== a.title || body !== a.body) dealActRows.push({ id: a.id, values: [title || CRM_ERASED_MASK, body] });
    }
    await writeRows(tx, "CrmActivity", t, [{ col: "title", kind: "text" }, { col: "body", kind: "text" }], dealActRows);
    const kd = await (await import("@/lib/modules/kanban/links")).maskCardsLinkedInTx(tx, t, "DEAL", dealIds, (x) => maskText(x, tokens) ?? x, { batch: opts.batch ?? null });
    counts.kanban += kd.cards + kd.comments + kd.activities;
  }
  // ◂ CRM C5.4-B

  // ── เว็บ · ลิงก์ติดตาม ──
  const sessions = (await tx.crmWebSession.findMany({ where: { tenantId: t, contactId: { in: ids } }, select: { id: true } })).map((s) => s.id);
  if (sessions.length) {
    await tx.crmWebEvent.deleteMany({ where: { sessionId: { in: sessions } } });
    await tx.crmTrackedClick.deleteMany({ where: { tenantId: t, webSessionId: { in: sessions } } });
    counts.webSessions = (await tx.crmWebSession.deleteMany({ where: { id: { in: sessions } } })).count;
  }
  counts.clicks = (await tx.crmTrackedClick.deleteMany({ where: { tenantId: t, contactId: { in: ids } } })).count;

  // ── พอร์ทัล (รีวิว C3.9 B3): แถวทั้งหมดหายใน tx นี้ (`portal.eraseContactInTx` — ของ C3.5) · คำขออนุมัติยกเลิกหลัง commit ──
  const portalOut = await portal.eraseContactInTx(tx, sysScope, ids, { mask: (s) => maskText(s, tokens) ?? s, batch: opts.batch ?? null });
  counts.portal = portalOut.accesses + portalOut.sessions + portalOut.requests;

  // ── ข้อเสนอ AI (นามบัตร/lead · รีวิว C3.9 S1): เฉพาะข้อเสนอชนิดของ CRM ที่เอ่ยถึงคนนี้ หรือข้อเสนอใดก็ตามที่พก id ของคนนี้ ──
  for (const cid of ids) counts.proposals += Number(await tx.$executeRaw`DELETE FROM "AiProposal" WHERE "tenantId" = ${t} AND strpos("payload"::text, ${cid}) > 0`);
  for (const tk of tokensT) {
    counts.proposals += Number(
      await tx.$executeRaw`DELETE FROM "AiProposal" WHERE "tenantId" = ${t} AND "kind" LIKE 'crm%' AND (strpos("payload"::text, ${tk}) > 0 OR strpos("summary", ${tk}) > 0)`,
    );
  }

  // ── แจ้งเตือนในแอป · บทสนทนาผู้ช่วย AI (แถวคงอยู่ · คำที่ระบุตัว → [ข้อมูลถูกลบ]) ──
  //   🔴 AppNotification ไม่มีคอลัมน์อ้างอิง (refType/refId) ⇒ ขอบเขต = ข้อความที่มีคำระบุตัวแบบเต็ม (ชื่อเต็ม · เบอร์ · อีเมล · LINE id)
  //      เท่านั้น (ไม่ใช่ชื่อ/นามสกุลแยกท่อน — รีวิว C3.9 S1) · ข้อสอบ C3.9-S1.3 บังคับให้แจ้งเตือนที่เอ่ยชื่อ+เบอร์ถูกล้าง
  //   C3.9-fix H3 (ล่าความปลอดภัย B3): AiMessage.content + AiConversation.title ของร้านด้วยคำชุดเดียวกัน (แถวคงอยู่ — ตัวนับโทเคน/การใช้งาน)
  // CRM C5.4-B ▸ hunter H3(d): ข้อความของระบบในห้องทีม (โพสต์ปิดดีล/ดีลนิ่งที่ส่งไปแล้ว) — ผ่าน facade ของ MEETING
  counts.notifications += await (await import("@/lib/modules/meeting")).maskSystemMessagesInTx(tx, t, tokensT, CRM_ERASED_MASK);
  for (const tk of tokensT) {
    counts.notifications += Number(
      await tx.$executeRaw`UPDATE "AppNotification" SET "title" = replace("title", ${tk}, ${CRM_ERASED_MASK}), "body" = replace("body", ${tk}, ${CRM_ERASED_MASK})
                            WHERE "tenantId" = ${t} AND (strpos("title", ${tk}) > 0 OR strpos("body", ${tk}) > 0)`,
    );
    counts.aiMessages += Number(
      await tx.$executeRaw`UPDATE "AiMessage" SET "content" = replace("content", ${tk}, ${CRM_ERASED_MASK}) WHERE "tenantId" = ${t} AND strpos("content", ${tk}) > 0`,
    );
    counts.aiMessages += Number(
      await tx.$executeRaw`UPDATE "AiConversation" SET "title" = replace("title", ${tk}, ${CRM_ERASED_MASK}) WHERE "tenantId" = ${t} AND strpos("title", ${tk}) > 0`,
    );
    // CRM C5.5-fix13 ▸ hunt-4 H4-1: ความจำของผู้ช่วย (AiMemory — ส่วนตัวของทุกคน `u~` · ของร้าน `o~` · ของคีย์/งาน `k~`/`s~` · รุ่นเดิม) ถูกฉีดเข้า
    //   system prompt ทุกเทิร์น ⇒ ปิดคำชุดเดียวกับข้อความแชท (ทั้งร้าน ทุกเจ้าของความจำ) · `updatedAt` ไม่ขยับ (ลำดับความจำ = "จด/ยืนยันล่าสุด"
    //   ของผู้จด — การลบไม่ใช่การยืนยันเรื่องนั้น) · ความจำที่เหลือแต่คำที่ถูกปิด → ลบทั้งแถว (ด้านล่าง) ◂
    counts.aiMessages += Number(
      await tx.$executeRaw`UPDATE "AiMemory" SET "content" = replace("content", ${tk}, ${CRM_ERASED_MASK}) WHERE "tenantId" = ${t} AND strpos("content", ${tk}) > 0`,
    );
    // CRM C5.5-fix13 r2 ▸ RV13-1: งานประจำของผู้ช่วย (AiScheduledTask.instruction — ส่งเข้าโมเดลทุกวัน + คัดลอกลงแจ้งเตือน/push) · ตารางนี้ไม่มีช่องผล/หัวเรื่องอื่น ◂
    counts.aiMessages += Number(
      await tx.$executeRaw`UPDATE "AiScheduledTask" SET "instruction" = replace("instruction", ${tk}, ${CRM_ERASED_MASK}) WHERE "tenantId" = ${t} AND strpos("instruction", ${tk}) > 0`,
    );
  }
  // CRM C5.5-fix13 ▸ H4-1: ความจำที่หลังปิดคำแล้วไม่เหลือเนื้อหาอื่น (มีแต่ "[ข้อมูลถูกลบ]" · ช่องว่าง · เครื่องหมาย) = ทั้งแถวคือข้อมูลของเขา ⇒ ลบ
  //   (ความจำที่ยังมีเนื้อหาอื่น เช่น "ลูกค้า [ข้อมูลถูกลบ] ชอบโปรวันศุกร์" คงไว้แบบเดียวกับข้อความแชท) · ลบซ้ำ = 0 แถว ◂
  if (tokensT.length) {
    counts.aiMessages += Number(
      await tx.$executeRaw`DELETE FROM "AiMemory" WHERE "tenantId" = ${t} AND strpos("content", ${CRM_ERASED_MASK}) > 0
                            AND regexp_replace(replace("content", ${CRM_ERASED_MASK}, ''), '[[:space:][:punct:]]', '', 'g') = ''`,
    );
    // CRM C5.5-fix13 r2 ▸ RV13-1: งานประจำที่เหลือแต่คำที่ถูกปิด = ลบ (กติกาเดียวกับความจำ — ไม่มีอะไรเหลือให้ทำ) · ที่ยังมีเนื้อหาอื่น = คงไว้ (ปิดคำแล้ว) ◂
    counts.aiMessages += Number(
      await tx.$executeRaw`DELETE FROM "AiScheduledTask" WHERE "tenantId" = ${t} AND strpos("instruction", ${CRM_ERASED_MASK}) > 0
                            AND regexp_replace(replace("instruction", ${CRM_ERASED_MASK}, ''), '[[:space:][:punct:]]', '', 'g') = ''`,
    );
  }
  // CRM C5.5-fix13 ▸ H4-1: แผนของผู้ช่วย (AiPlan — title + stepsJson: summary/payload/note ของทุกขั้น) ทุกสถานะ ทุกห้อง — ปิดคำในค่าข้อความของ JSON
  //   (เดินโครง JSON ใน JS · ไม่แทนบนข้อความ jsonb ตรง ๆ = ไม่มีทางทำ JSON พัง) · แผนที่ยัง PENDING และเอ่ยถึงเขา → EXPIRED (ทำต่อไม่ได้แล้ว —
  //   ขั้นของมันกระทำต่อคนที่ถูกลบ: เหตุผลเดียวกับจดหมาย QUEUED → FAILED และข้อเสนอ CRM ที่ถูกลบทิ้ง) · เขียนเป็นชุด (writeRows) · อ่านทีละหน้า ◂
  if (tokensT.length) {
    const tokensJ = tokensT.map((tk) => JSON.stringify(tk).slice(1, -1)); // รูปของคำในข้อความ jsonb (escape " \ ตัวควบคุม)
    // CRM C5.5-fix13 r2 ▸ RV13-4: คีย์ของ JSON ก็ปิดคำด้วย — คีย์ที่ปิดแล้วชนกับคีย์ที่มีอยู่ = ต่อท้าย " #2", " #3" (ไม่มีค่าใดหายเพราะชื่อคีย์ซ้ำ) ◂
    const maskJson = (v: unknown): unknown => {
      if (typeof v === "string") return maskText(v, tokensT);
      if (Array.isArray(v)) return v.map(maskJson);
      if (!isObj(v)) return v;
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        const mk = maskText(k, tokensT) ?? k;
        let key = mk;
        for (let n = 2; key !== k && Object.prototype.hasOwnProperty.call(out, key); n += 1) key = `${mk} #${n}`;
        out[key] = maskJson(x);
      }
      return out;
    };
    const planPage = pageSize(opts.batch, 1_000);
    for (let cursor = ""; ; ) {
      const page = await tx.$queryRaw<{ id: string; title: string; status: string; stepsJson: Prisma.JsonValue }[]>`
        SELECT p."id", p."title", p."status", p."stepsJson" FROM "AiPlan" p
         WHERE p."tenantId" = ${t} AND p."id" > ${cursor}
           AND EXISTS (SELECT 1 FROM unnest(${tokensT}::text[], ${tokensJ}::text[]) AS k(tk, tj) WHERE strpos(p."title", k.tk) > 0 OR strpos(p."stepsJson"::text, k.tj) > 0)
         ORDER BY p."id" LIMIT ${planPage} FOR UPDATE`;
      const planRows = page.map((p) => ({ id: p.id, values: [maskText(p.title, tokensT) ?? "", p.stepsJson === null ? [] : maskJson(p.stepsJson), p.status === "PENDING" ? "EXPIRED" : p.status] }));
      counts.aiMessages += await writeRows(tx, "AiPlan", t, [{ col: "title", kind: "text" }, { col: "stepsJson", kind: "jsonb" }, { col: "status", kind: "text" }], planRows);
      if (page.length < planPage) break;
      cursor = page[page.length - 1]!.id;
    }
  }
  // CRM C5.5-fix13 r2 ▸ RV13-5 (มติผู้คุมงาน — กติกาเดียวกับแผน): ข้อเสนอ AI ชนิด **ไม่ใช่ CRM** ที่เอ่ยถึงเขา (ข้อเสนอชนิด CRM ถูกลบทิ้งข้างบนแล้ว ·
  //   C3.9 S1) — summary · resultNote · payload (เดิน JSON แบบเดียวกับแผน) ปิดคำ · ที่ยัง PENDING → EXPIRED (สถานะ "หมดอายุ" ที่มีอยู่แล้วของข้อเสนอ —
  //   ยืนยันไม่ได้อีก: งานของมันจะสร้างข้อมูลของคนที่ถูกลบขึ้นใหม่ในอีกโมดูล) · ที่จบแล้ว = ปิดคำอย่างเดียว · ทีละหน้า · เขียนเป็นชุด ◂
  if (tokensT.length) {
    const tokensJ = tokensT.map((tk) => JSON.stringify(tk).slice(1, -1));
    const maskJ = (v: unknown): unknown => {
      if (typeof v === "string") return maskText(v, tokensT);
      if (Array.isArray(v)) return v.map(maskJ);
      if (!isObj(v)) return v;
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) {
        const mk = maskText(k, tokensT) ?? k;
        let key = mk;
        for (let n = 2; key !== k && Object.prototype.hasOwnProperty.call(out, key); n += 1) key = `${mk} #${n}`;
        out[key] = maskJ(x);
      }
      return out;
    };
    const propPage = pageSize(opts.batch, 1_000);
    for (let cursor = ""; ; ) {
      const page = await tx.$queryRaw<{ id: string; summary: string; resultNote: string | null; status: string; payload: Prisma.JsonValue }[]>`
        SELECT p."id", p."summary", p."resultNote", p."status"::text AS "status", p."payload" FROM "AiProposal" p
         WHERE p."tenantId" = ${t} AND p."id" > ${cursor} AND p."kind" NOT LIKE 'crm%'
           AND EXISTS (SELECT 1 FROM unnest(${tokensT}::text[], ${tokensJ}::text[]) AS k(tk, tj)
                        WHERE strpos(p."summary", k.tk) > 0 OR strpos(COALESCE(p."resultNote", ''), k.tk) > 0 OR strpos(p."payload"::text, k.tj) > 0)
         ORDER BY p."id" LIMIT ${propPage} FOR UPDATE`;
      const rows = page.map((p) => ({ id: p.id, values: [maskText(p.summary, tokensT) ?? "", maskText(p.resultNote, tokensT), p.payload === null ? {} : maskJ(p.payload)] }));
      counts.proposals += await writeRows(tx, "AiProposal", t, [{ col: "summary", kind: "text" }, { col: "resultNote", kind: "text" }, { col: "payload", kind: "jsonb" }], rows);
      const pending = page.filter((p) => p.status === "PENDING").map((p) => p.id);
      if (pending.length) await tx.$executeRaw`UPDATE "AiProposal" SET "status" = 'EXPIRED' WHERE "tenantId" = ${t} AND "id" = ANY(${pending}::text[]) AND "status" = 'PENDING'`;
      if (page.length < propPage) break;
      cursor = page[page.length - 1]!.id;
    }
  }
  // CRM C5.5-fix13 ▸ H4-1 (เคสแจ้งทีมงานที่ผู้ช่วยเปิด `support_open_case` / ที่ร้านเขียนเอง): หัวเคส + ข้อความในเคส — ผ่าน facade ของ support ◂
  counts.notifications += await (await import("@/lib/support/service")).maskSupportTextInTx(tx, t, tokensT, CRM_ERASED_MASK);

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
  await writeRows(tx, "MemberActivity", t, [{ col: "summary", kind: "text" }], timeline.map((r) => ({ id: r.id, values: [mask(r.summary) ?? ""] })), Prisma.sql`"data" = NULL`);
  // CRM C5.4-B ▸ L5-M2: การ์ดที่กฎของเขาเปิด (`crm-rule:<runId>:<i>`) ก่อนมีลิงก์ผูกผู้ติดต่อ — เก็บ runId ก่อนล้าง payload ของรอบ แล้วปิดคำในการ์ดเหล่านั้น
  //   รีวิว C5.4-B note (e): ทุกรอบ (แบ่งหน้า ไม่ตัดที่ 5,000) + รอบของกฎที่ subject เป็นดีลของเขาแต่ไม่มี crmContactId (dealRuleRunsOf · คีย์ JSON)
  const ruleRuns: { id: string }[] = [];
  const runPage = pageSize(opts.batch, 5_000);
  for (let cursor: string | null = null; ; ) {
    const page: { id: string }[] = await tx.automationRun.findMany({
      where: { tenantId: t, crmContactId: { in: ids }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true },
      orderBy: { id: "asc" },
      take: runPage,
    });
    ruleRuns.push(...page);
    if (page.length < runPage) break;
    cursor = page[page.length - 1]!.id;
  }
  ruleRuns.push(...(opts.dealRunIds ?? []).map((rid) => ({ id: rid }))); // รอบของดีลเขา (หาไว้ก่อนล็อก — dealRuleRunsOf)
  await tx.automationRun.updateMany({ where: { tenantId: t, crmContactId: { in: ids } }, data: { payload: Prisma.DbNull, detail: null } });
  // C3.9-fix H4 (ล่าความปลอดภัย B4): การ์ดที่ผูก — หัว · รายละเอียด · ความเห็น · ประวัติการ์ด ผ่าน facade ของบอร์ดงาน (ตารางบอร์ดงานไม่ถูกเขียนจากไฟล์นี้)
  const kb = await (await import("@/lib/modules/kanban/links")).maskCardsLinkedInTx(tx, t, "CRM_CONTACT", ids, (s) => maskText(s, tokens) ?? s, { batch: opts.batch ?? null });
  counts.kanban += kb.cards + kb.comments + kb.activities;
  if (ruleRuns.length) {
    const { maskCardsBySourcePrefixInTx } = await import("@/lib/modules/kanban/links");
    const prefixes = [...new Set(ruleRuns.map((r) => `crm-rule:${r.id}:`))];
    // C5.5-fix9: ตัวปิดการ์ดรับ prefix ได้ไม่จำกัด (แบ่งคำสั่งละ 500 prefix · การ์ดทีละหน้าในตัวมันเอง) — ไม่มีรอบไหนหลุด
    const kr = await maskCardsBySourcePrefixInTx(tx, t, prefixes, (s) => maskText(s, tokens) ?? s, { batch: opts.batch ?? null });
    counts.kanban += kr.cards + kr.comments + kr.activities;
  }
  await tx.crmSequenceEnrollment.updateMany({
    where: { tenantId: t, contactId: { in: ids }, status: { in: ["ACTIVE", "PAUSED"] } },
    data: { status: "STOPPED", stoppedReason: "ERASED", stoppedAt: now, nextAt: null, leaseUntil: null },
  });

  // ── Party: ไม่มีผู้ถืออื่น (ตัวนับเดียวของร้าน `party.countPartyHolders` · ไม่นับคนในสายนี้) = ล้างตัวตน · มี = ตัดการผูกของแถวในสายนี้ ──
  //   C3.9-fix H5: สมาชิกที่ผูกไว้ **นับเป็นผู้ถือเสมอ** — สมาชิกถูกลบ (ถ้าถูกลบ) โดยระบบสมาชิกเองหลัง commit (อาจรออนุมัติ) แล้วมันล้าง Party เอง
  const unlinkParty = new Set<string>();
  for (const pid of partyIds) {
    const holders = await party.countPartyHolders(t, pid, { crmContactIds: ids, customerIds: [] }, tx);
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

  // ── C3.9-fix H8 (ล่าความปลอดภัย M3): ขัดตัวตนออกจาก before/after ของแถว audit ในสาย (คีย์ตัวตน → [ข้อมูลถูกลบ] · ข้อความ → ปิดคำระบุตัว) ──
  //   แถว `crm.contact.erase` (ธง + หลักฐาน: id + เหตุผล) ไม่ถูกแตะ · ตัวเขียนผู้ติดต่อเลิกเขียนค่าตัวตนลง audit แล้ว (contacts.ts AUDIT_IDENTITY_KEYS)
  const scrub = (v: unknown, key?: string): unknown => {
    if (key && AUDIT_IDENTITY_KEYS.has(key) && v !== null && v !== undefined && v !== AUDIT_CHANGED_MARK) return CRM_ERASED_MASK;
    if (typeof v === "string") return maskText(v, tokens);
    if (Array.isArray(v)) return v.map((x) => scrub(x));
    if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x, k)]));
    return v;
  };
  for (let i = 0; i < trailIds.length; i += auditPage) {
    const part = trailIds.slice(i, i + auditPage);
    const changed: { id: string; values: unknown[] }[] = [];
    for (const r of await tx.auditLog.findMany({ where: { tenantId: t, id: { in: part } }, select: { id: true, before: true, after: true } })) {
      const before = scrub(r.before);
      const after = scrub(r.after);
      if (JSON.stringify(before) === JSON.stringify(r.before) && JSON.stringify(after) === JSON.stringify(r.after)) continue;
      changed.push({ id: r.id, values: [before, after] });
    }
    // C5.5-fix11: หนึ่งคำสั่งต่อหน้า (เดิมหนึ่งคำสั่งต่อแถว = 46.5 ของ 53.4 วินาทีในชุดทดสอบของรีวิว)
    counts.auditScrubbed += await writeRows(tx, "AuditLog", t, [{ col: "before", kind: "jsonb" }, { col: "after", kind: "jsonb" }], changed);
  }

  if (resweep) return { erased: false, partyId: row.partyId, counts, memberSkipped: [], resweepFileIds: [...new Set(fileIds)], followUpFiles: 0 };

  // ── C3.9-fix H9 (ล่าความปลอดภัย M4): ไฟล์ส่งออกของระบบที่ยังไม่หมดอายุ (สร้างก่อนการลบ = มีข้อมูลของเขา) ถูกถอน ──
  //   CRM_EXPORT: ไฟล์ส่วนตัวลบหลัง commit (followUp) · แถวงาน fileId = null + result.withdrawn ⇒ getExport = EXPIRED ·
  //   REPORT_EXPORT: CSV ในแถว (C3.1) ถูกล้าง · RETENTION ไม่ถอน (ไฟล์ส่งออกมีนาฬิกาอายุเก็บของตัวเอง `retention.exportDays` — แบบเดียวกับอีเมล/เสียง)
  if (source !== "RETENTION") {
    // งานที่กำลังสร้างไฟล์อยู่ (อ่านข้อมูลก่อนการลบนี้ commit ได้) = กลับเข้าคิว ⇒ `finish` ของรอบนั้นเสีย lease → ทิ้งไฟล์ที่อัปโหลด ·
    //   รอบถัดไปสร้างใหม่จากข้อมูลหลังลบ (ล็อกแถวเดียวกับ finish — ทำ **ก่อน** การถอน: finish ที่ commit ก่อนหน้า = แถว DONE ถูกถอนในคำสั่งถัดไป · finish ที่ตามมา = เสีย lease)
    await tx.$executeRaw`UPDATE "CrmImportJob" SET "status" = 'QUEUED', "leaseUntil" = NULL
                          WHERE "tenantId" = ${t} AND "systemId" = ${ctx.systemId} AND "kind" = ${CRM_EXPORT_KIND} AND "status" = 'RUNNING'`;
    const withdrawn = await tx.$queryRaw<{ fileId: string }[]>`
      WITH p AS (
        SELECT "id", "fileId" FROM "CrmImportJob"
         WHERE "tenantId" = ${t} AND "systemId" = ${ctx.systemId} AND "kind" = ${CRM_EXPORT_KIND} AND "fileId" IS NOT NULL
         ORDER BY "id" FOR UPDATE)
      UPDATE "CrmImportJob" j SET "fileId" = NULL,
             "result" = COALESCE(CASE WHEN jsonb_typeof(j."result") = 'object' THEN j."result" ELSE NULL END, '{}'::jsonb) || '{"expired":true,"withdrawn":true}'::jsonb
        FROM p WHERE j."id" = p."id" RETURNING p."fileId" AS "fileId"`;
    for (const w of withdrawn) fileIds.push(w.fileId);
    const reports = await tx.$executeRaw`
      UPDATE "CrmImportJob" SET "result" = ("result" - 'csv') || '{"expired":true,"withdrawn":true}'::jsonb
       WHERE "tenantId" = ${t} AND "systemId" = ${ctx.systemId} AND "kind" = 'REPORT_EXPORT' AND jsonb_typeof("result") = 'object' AND "result" ? 'csv'`;
    counts.exportsWithdrawn = withdrawn.length + Number(reports);
  }

  // ── หลักฐาน (= ธง "ลบแล้ว") + event (tx เดียวกัน) ──
  //   `after.followUp` = งานหลัง commit เป็น id ล้วน (ไฟล์ · คำขออนุมัติ · คำขอลบสมาชิก) — ตัวรับ `crm.contact.erased` อ่านจากแถวนี้
  //   (payload ของ event เป็น id ของผู้ติดต่อ/ระบบ/Party/สมาชิกเท่านั้น — ข้อสอบ C3.9-S1.4 ตรึงชุดคีย์ไว้)
  const followUp = {
    fileIds: [...new Set(fileIds)],
    approvalRequestIds: portalOut.approvalRequestIds,
    // C3.9-fix H5: คำขอลบของระบบสมาชิก (ผ่านสายอนุมัติ `member.erase`) · ผู้ยื่น = ผู้กดลบ (ผ่านด่านคีย์แล้วก่อน tx)
    memberRequests: memberAsk,
    memberRequestedBy: ctx.actorUserId,
    memberSkipped,
  };
  const audit = (targetId: string, extra: Record<string, unknown>) =>
    tx.auditLog.create({
      data: { tenantId: t, actorType: ctx.actorUserId ? "USER" : "SYSTEM", actorId: ctx.actorUserId, action: CRM_ERASE_AUDIT_ACTION, targetType: "CrmContact", targetId, after: { reason, source, systemId: ctx.systemId, ...extra } as Prisma.InputJsonValue },
    });
  const partyId = row.partyId;
  await audit(id, { partyId, memberCustomerId: row.memberCustomerId, mergedIds: chain, counts: { ...counts, files: followUp.fileIds.length }, followUp });
  for (const m of chain) if (!erasedBefore.has(m)) await audit(m, { mergedInto: id, partyId: people.find((p) => p.id === m)?.partyId ?? null });
  await emitOutbox(tx, {
    tenantId: t,
    type: "crm.contact.erased",
    idempotencyKey: `crm.contact.erased#${id}`,
    payload: { contactId: id, systemId: ctx.systemId, ...(partyId ? { partyId } : {}), ...(row.memberCustomerId ? { customerId: row.memberCustomerId } : {}) },
    systemId: ctx.systemId,
  });
  return { erased: true, partyId, counts, memberSkipped, resweepFileIds: [], followUpFiles: followUp.fileIds.length };
}

/**
 * ขั้นหลัง commit ของการลบ (รีวิว C3.9 B3 · มติผู้คุมงาน) — วัตถุไฟล์บนที่เก็บ · ยกเลิกคำขออนุมัติของพอร์ทัล · สมาชิกที่ผูก (member facade)
 * อ่านงานจากแถว audit ของการลบ (id ล้วน) ⇒ ทำซ้ำ/พร้อมกันได้: ไฟล์ที่ลบแล้ว = ไม่มีแถว = สำเร็จ · คำขอที่ปิดแล้ว = ข้าม · สมาชิกที่ลบแล้ว/คำขอค้าง = เงียบ
 * ขั้นไหนล้ม = ทำขั้นอื่นต่อให้ครบ แล้ว OpsEvent WARN (id ล้วน) + throw ⇒ ตัวรับ event ส่งใหม่
 * C3.9-fix H5: `followUp.memberRequests` = ยื่นคำขอลบของระบบสมาชิก (`requestEraseFromCrm` — ไม่มีนโยบายอนุมัติ = ลบทันที · มี = PENDING)
 *   แถวเก่าก่อน C3.9-fix (`followUp.memberCustomerIds`) = ลบตรงแบบเดิม (ตัดสินไปแล้วตอนนั้น)
 */
export async function completeErasure(tenantId: string, contactId: string, deps?: PrivacyDeps | null): Promise<{ files: number; memberErased: boolean; memberPending: boolean }> {
  const a = await erasedAudit(prisma, tenantId, contactId);
  const f = a && isObj(a.after) && isObj(a.after.followUp) ? a.after.followUp : null;
  if (!f) return { files: 0, memberErased: false, memberPending: false };
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
  let memberPending = false;
  const legacy = ids(f.memberCustomerIds);
  const asks = ids(f.memberRequests);
  if (legacy.length || asks.length) {
    const member = await import("@/lib/modules/member");
    for (const cid of legacy) {
      try {
        if ((await member.eraseMemberById(tenantId, cid, { actorUserId: null })).erased) memberErased = true;
      } catch {
        failed.push(`customer:${cid}`);
      }
    }
    const by = typeof f.memberRequestedBy === "string" && f.memberRequestedBy ? f.memberRequestedBy : null;
    const why = a && isObj(a.after) && typeof a.after.reason === "string" ? a.after.reason : null;
    // รีวิว C3.9-fix S2: คำขอที่ยื่นแล้วจดไว้ใน followUp (`memberRequestIds`) — ส่งใหม่อ่านสถานะของคำขอนั้น ไม่ยื่นใหม่ ·
    //   ยื่นแล้วแต่ยังไม่ได้จด (ล้มระหว่างทาง) = ระบบสมาชิกหา "คำขอหลังเวลาการลบ" เอง (`since`) ⇒ ไม่มีคำขอซ้อน/ลบอัตโนมัติรอบใหม่
    const known = isObj(f.memberRequestIds) ? (f.memberRequestIds as Record<string, unknown>) : {};
    const since = a ? await erasedAt(tenantId, a.id) : null;
    const record: Record<string, string> = {};
    for (const cid of asks) {
      try {
        const rid = typeof known[cid] === "string" ? (known[cid] as string) : null;
        const r = await member.requestEraseFromCrm(tenantId, cid, { actorUserId: by, reason: why, since, requestId: rid });
        if (r.status === "DONE") memberErased = true;
        else if (r.status === "PENDING") memberPending = true;
        if (r.requestId && !rid) record[cid] = r.requestId;
      } catch {
        failed.push(`customer:${cid}`);
      }
    }
    if (a && Object.keys(record).length) await rememberMemberRequests(a.id, record).catch(() => failed.push("followUp.memberRequestIds"));
  }
  if (failed.length) {
    await logOps("WARN", "crm.privacy", "ขั้นหลังการลบข้อมูลส่วนบุคคลยังไม่ครบ — ระบบจะลองใหม่อัตโนมัติ", { tenantId, detail: JSON.stringify({ contactId, failed: failed.slice(0, 50) }) });
    throw new Error(`crm.privacy.completeErasure pending (${failed.length})`);
  }
  return { files, memberErased, memberPending };
}

/** เวลาของแถว audit การลบ (จุดตัดของ "คำขอลบสมาชิกที่ยื่นหลังการลบ" — รีวิว C3.9-fix S2) */
async function erasedAt(tenantId: string, auditId: string): Promise<Date | null> {
  return (await prisma.auditLog.findFirst({ where: { id: auditId, tenantId }, select: { createdAt: true } }))?.createdAt ?? null;
}

/** จด requestId ของคำขอลบสมาชิกลง `after.followUp.memberRequestIds` ของแถว audit การลบ (jsonb คำสั่งเดียว · ไม่ทับของที่จดไว้แล้ว) */
async function rememberMemberRequests(auditId: string, ids: Record<string, string>): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "AuditLog" SET "after" = jsonb_set("after", '{followUp,memberRequestIds}',
           ${JSON.stringify(ids)}::jsonb || COALESCE("after"->'followUp'->'memberRequestIds', '{}'::jsonb), true)
     WHERE "id" = ${auditId} AND jsonb_typeof("after"->'followUp') = 'object'`;
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
  let more = false;
  for (let round = 0; round < 50; round += 1) {
    more = false;
    const rows = await prisma.$queryRaw<{ id: string; systemId: string }[]>`
      SELECT c."id", c."systemId" FROM "CrmContact" c
       WHERE c."tenantId" = ${evt.tenantId} AND c."memberCustomerId" = ${customerId}
         AND NOT (c."id" = ANY(${skip}::text[]))
         AND NOT EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."action" = ${CRM_ERASE_AUDIT_ACTION} AND a."targetId" = c."id" AND a."tenantId" = c."tenantId")
       ORDER BY c."id" LIMIT 100`;
    if (rows.length === 0) break;
    more = rows.length === 100;
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
  // CRM C5.5-fix9 (sweep): ครบ 50 รอบแล้วรอบสุดท้ายยังเต็ม = อาจยังมีผู้ติดต่อที่ผูกสมาชิกนี้เหลือ — ห้ามตอบสำเร็จ (throw ⇒ event ส่งใหม่ · คนที่ลบแล้วถูกข้าม)
  if (more) throw new Error("crm.privacy.onMemberErased pending (more linked contacts than one delivery handles)");
  return { erased };
}

// ═════════════════════════ ส่งออกข้อมูลของคนหนึ่งคน ═════════════════════════

/** ฟิลด์ sensitive เห็นได้ไหม (นโยบายของใบนี้: เจ้าของร้านเท่านั้น — MANAGER/STAFF/คีย์ API ได้ชุดที่ตัดค่า sensitive) */
const seesSensitive = (actor: Actor) => actor.role === "OWNER" && !isApiActor(actor);

/**
 * CRM C5.5-fix9 ▸ hunt-3 H3-2: ชุดข้อมูลของคนหนึ่งคน = **ทุกแถว** ของทุกตาราง — อ่านทีละหน้า (keyset ตาม id ใหม่→เก่า · ลำดับคงที่ ⇒ ส่งออกสองครั้ง
 * ได้ไฟล์เดียวกัน) · ไฟล์ส่งกลับเป็น JSON ทั้งก้อนผ่าน server action (ไม่มีทาง stream) ⇒ ยังมีเพดานต่อตาราง `PERSON_EXPORT_TABLE_MAX` เพื่อขนาดคำตอบ/
 * หน่วยความจำ แต่ **ไม่เงียบ**: ตารางที่ถูกตัด = แถวใหม่สุดตามเพดาน + `truncated.<ตาราง> = { exported, total }` + `complete: false` ในไฟล์และในแถว audit
 * (หน่วยความจำ ≤ เพดาน + 1 หน้า ต่อตาราง) · `opts` = ข้อสอบเท่านั้น (เพดาน/ขนาดหน้าที่เล็กลง — ทางจริงไม่ส่ง) ◂
 */
const PERSON_EXPORT_TABLE_MAX = 50_000;
const PERSON_EXPORT_PAGE = 1_000;
/** ข้อสอบเท่านั้น: เพดาน/ขนาดหน้าที่เล็กลง · `beforeCount` = จุดแทรกระหว่างอ่านหน้ากับนับยอด (พิสูจน์ review L2) */
export type ContactExportOpts = { tableMax?: number | null; page?: number | null; beforeCount?: ((table: string) => Promise<void>) | null };
type ExportLim = { max: number; page: number };
const byIdDesc = (cursor: string | null) => (cursor ? { id: { lt: cursor } } : {});
const omitId = <R extends { id: string }>(r: R): Omit<R, "id"> => {
  const o: Record<string, unknown> = { ...r };
  delete o.id;
  return o as Omit<R, "id">;
};

/**
 * อ่านทุกหน้า (id ใหม่→เก่า) จนหน้าสั้น หรือเกินเพดาน (อ่านเกิน 1 แถวเพื่อรู้ว่าเกิน) · r2 (review L2): "ถูกตัด" ตัดสินจากการอ่านหน้าเอง
 * (มีแถวเกินเพดานจริง) — ยอดจาก `count` ที่นับทีหลังใช้แค่บอกจำนวน (แถวถูกลบระหว่างนั้น ⇒ ยอด = max(นับได้, อ่านได้))
 */
async function readAllPages<R extends { id: string }>(lim: ExportLim, read: (cursor: string | null, take: number) => Promise<R[]>, count: () => Promise<number>): Promise<{ rows: R[]; total: number; cut: boolean }> {
  const rows: R[] = [];
  for (let cursor: string | null = null; ; ) {
    const want = Math.min(lim.page, lim.max + 1 - rows.length);
    const page = await read(cursor, want);
    rows.push(...page);
    if (page.length < want || rows.length > lim.max) break;
    cursor = page[page.length - 1]!.id;
  }
  if (rows.length <= lim.max) return { rows, total: rows.length, cut: false };
  return { rows: rows.slice(0, lim.max), total: Math.max(await count(), rows.length), cut: true };
}

export async function exportContact(ctx: PrivacyCtx, actor: Actor, contactId: string, opts?: ContactExportOpts | null): Promise<ContactExportBundle> {
  assertStaff(actor);
  const sys = await resolveSystem(ctx);
  const c = { tenantId: sys.tenantId, systemId: sys.systemId, actorUserId: actor.userId };
  const row = await loadContact(c, actor, contactId);
  need(actor, "crm.contact.export");
  const t = c.tenantId;
  const id = row.id;
  // r2 (review M1-b): ผู้ติดต่อที่ถูกรวมเข้ามาในคนนี้ทั้งสาย = คนเดียวกัน — ขอบเขตเดียวกับการลบ (`mergedChain` ตัวเดียวกัน)
  const chainOut = await mergedChain(prisma as unknown as Tx, { tenantId: t, systemId: c.systemId }, id);
  const ids = [id, ...chainOut.ids];
  const lim: ExportLim = { max: pageSize(opts?.tableMax, PERSON_EXPORT_TABLE_MAX), page: pageSize(opts?.page, PERSON_EXPORT_PAGE) };
  const truncated: Record<string, { exported: number; total: number }> = {};
  const all = async <R extends { id: string }>(table: string, read: (cursor: string | null, take: number) => Promise<R[]>, count: () => Promise<number>): Promise<R[]> => {
    const r = await readAllPages(lim, read, async () => {
      if (opts?.beforeCount) await opts.beforeCount(table);
      return count();
    });
    if (r.cut) truncated[table] = { exported: r.rows.length, total: r.total };
    return r.rows;
  };
  const actWhere = await activityWhere(c, actor);
  const dealW = await dealWhere(c, actor);
  const recs = await prisma.customRecord.findMany({ where: { tenantId: t, systemId: c.systemId, parentType: "CONTACT", parentId: { in: ids } }, select: { id: true, objectId: true, title: true, status: true, createdAt: true, updatedAt: true }, orderBy: { id: "desc" } });
  const values = await prisma.customRecordValue.findMany({
    where: { tenantId: t, recordId: { in: [...ids, ...recs.map((r) => r.id)] }, ...(seesSensitive(actor) ? {} : { field: { sensitive: false } }) },
    select: { recordId: true, valueText: true, valueNumber: true, valueDate: true, valueBool: true, valueOptions: true, valueRef: true, field: { select: { key: true, label: true, objectKey: true } } },
    orderBy: { id: "asc" },
  });
  const sessW = { tenantId: t, contactId: { in: ids } };
  const sessions = await all(
    "CrmWebSession",
    (cur, take) => prisma.crmWebSession.findMany({ where: { ...sessW, ...byIdDesc(cur) }, select: { id: true, startedAt: true, lastSeenAt: true, pageViews: true, firstUrl: true, referrer: true, utm: true, consentVersion: true, consentAt: true }, orderBy: { id: "desc" }, take }),
    () => prisma.crmWebSession.count({ where: sessW }),
  );
  const actW = { AND: [actWhere, { contactId: { in: ids } }] };
  const mailW = { tenantId: t, systemId: c.systemId, contactId: { in: ids } };
  // เหตุการณ์เว็บของทุก session ของเขา (ผ่านความสัมพันธ์ — ไม่ขึ้นกับรายการ session ที่ถูกตัด)
  const evW = { tenantId: t, session: { tenantId: t, contactId: { in: ids } } };
  const clickW = { tenantId: t, contactId: { in: ids } };
  const scoreW = { tenantId: t, contactId: { in: ids } };
  const forms = await import("@/lib/modules/forms");
  const fileLinks = await fileLinksOf(lim, truncated, { tenantId: t, systemId: c.systemId }, ids, recs.map((r) => r.id), actWhere);
  const tables: Record<string, Record<string, unknown>[]> = {
    CrmCompanyContact: rowsOf(await prisma.crmCompanyContact.findMany({ where: { tenantId: t, contactId: { in: ids } }, select: { companyId: true, role: true, jobTitle: true, isPrimary: true, startedAt: true, endedAt: true, company: { select: { name: true } } }, orderBy: { id: "desc" } })),
    CrmContactConsent: rowsOf(await prisma.crmContactConsent.findMany({ where: { tenantId: t, contactId: { in: ids } }, select: { channel: true, granted: true, source: true, policyVersion: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })),
    CrmDeal: rowsOf(await prisma.crmDeal.findMany({ where: { AND: [dealW, { contactId: { in: ids } }] }, select: { id: true, title: true, valueSatang: true, kind: true, paidSatang: true, currency: true, expectedCloseAt: true, closedAt: true, createdAt: true, stage: { select: { name: true } } }, orderBy: { id: "desc" } })),
    CrmActivity: rowsOf(
      await all(
        "CrmActivity",
        (cur, take) => prisma.crmActivity.findMany({ where: { AND: [actWhere, { contactId: { in: ids } }, byIdDesc(cur)] }, select: { id: true, type: true, title: true, body: true, direction: true, channel: true, outcome: true, durationSec: true, dueAt: true, doneAt: true, startAt: true, createdAt: true }, orderBy: { id: "desc" }, take }),
        () => prisma.crmActivity.count({ where: actW }),
      ),
    ),
    // AUDIT-CLASS X8: หัวจดหมายเท่านั้น — เนื้อจดหมายไม่เคยอยู่ในไฟล์ส่งออก
    CrmEmailMessage: rowsOf(
      await all(
        "CrmEmailMessage",
        (cur, take) => prisma.crmEmailMessage.findMany({ where: { ...mailW, ...byIdDesc(cur) }, select: { id: true, direction: true, fromAddr: true, toAddrs: true, subject: true, status: true, sentAt: true, receivedAt: true, openCount: true, clickCount: true }, orderBy: { id: "desc" }, take }),
        () => prisma.crmEmailMessage.count({ where: mailW }),
      ),
    ),
    CrmWebSession: rowsOf(sessions),
    CrmWebEvent: rowsOf(
      (
        await all(
          "CrmWebEvent",
          (cur, take) => prisma.crmWebEvent.findMany({ where: { ...evW, ...byIdDesc(cur) }, select: { id: true, sessionId: true, kind: true, url: true, title: true, at: true }, orderBy: { id: "desc" }, take }),
          () => prisma.crmWebEvent.count({ where: evW }),
        )
      ).map(omitId),
    ),
    CrmTrackedClick: rowsOf(
      (
        await all(
          "CrmTrackedClick",
          (cur, take) => prisma.crmTrackedClick.findMany({ where: { ...clickW, ...byIdDesc(cur) }, select: { id: true, at: true, link: { select: { name: true, url: true } } }, orderBy: { id: "desc" }, take }),
          () => prisma.crmTrackedClick.count({ where: clickW }),
        )
      ).map(omitId),
    ),
    CrmPortalAccess: rowsOf(await prisma.crmPortalAccess.findMany({ where: { tenantId: t, contactId: { in: ids } }, select: { companyId: true, role: true, invitedAt: true, acceptedAt: true, lastLoginAt: true, revokedAt: true, loginMethods: true }, orderBy: { id: "desc" } })),
    CrmPortalRequest: rowsOf(await prisma.crmPortalRequest.findMany({ where: { tenantId: t, contactId: { in: ids } }, select: { id: true, kind: true, payload: true, status: true, createdAt: true, decidedAt: true }, orderBy: { id: "desc" } })),
    CrmScoreLog: rowsOf(
      (
        await all(
          "CrmScoreLog",
          (cur, take) => prisma.crmScoreLog.findMany({ where: { ...scoreW, ...byIdDesc(cur) }, select: { id: true, points: true, reason: true, createdAt: true }, orderBy: { id: "desc" }, take }),
          () => prisma.crmScoreLog.count({ where: scoreW }),
        )
      ).map(omitId),
    ),
    CrmSequenceEnrollment: rowsOf(await prisma.crmSequenceEnrollment.findMany({ where: { tenantId: t, contactId: { in: ids } }, select: { sequence: { select: { name: true } }, status: true, stoppedReason: true, createdAt: true, stoppedAt: true }, orderBy: { id: "desc" } })),
    CustomRecord: rowsOf(recs),
    CustomRecordValue: rowsOf(values),
    // รีวิว C3.9 B1: ไฟล์แนบของผู้ติดต่อ/เรคคอร์ด/กิจกรรมของเขา — ชื่อ ชนิด ขนาด วันที่ (ไฟล์จริงเปิดผ่านหน้า 360 ด้วยลิงก์ส่วนตัว)
    //   C5.5-fix9: ลิงก์ของ **ทุก** กิจกรรมที่ผู้ขอเห็น (id กิจกรรมอ่านทีละหน้า ไม่ตัดที่ 5,000) · รวมแล้วเรียง id ใหม่→เก่า · เพดานเดียวกัน
    CrmFileLink: rowsOf(fileLinks.rows.map(omitId)),
    // C3.9-fix H1: คำตอบฟอร์มบนเว็บที่เขากรอก (ผ่าน facade ฟอร์ม · ตารางเดียวกับขอบเขตการลบ) · C5.5-fix9: ทุกหน้า
    FormSubmission: rowsOf(
      (
        await all(
          "FormSubmission",
          (cur, take) => forms.submissionsOfCrmContacts(prisma, t, ids, { take, beforeId: cur }),
          () => forms.countSubmissionsOfCrmContacts(prisma, t, ids),
        )
      ).map((x) => ({
        id: x.id,
        form: x.formName,
        answers: x.answers,
        createdAt: x.createdAt,
        pageUrl: x.pageUrl,
        referrer: x.referrer,
        utm: x.utm,
      })),
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
  // r2 (review M1-a): แถว/ค่าที่ผู้ขอมองไม่เห็น (การมองเห็นกิจกรรม/ดีลของเขา · ค่าฟิลด์อ่อนไหวที่ไม่ใช่เจ้าของร้าน) — ไม่ขยายสิ่งที่ผู้ขออ่านได้
  //   แต่ไฟล์ต้องไม่อ้างว่าครบ: นับยอดทั้งหมดเทียบยอดที่เห็น (ตัวเลขล้วน) → `scope.limitedByRequesterVisibility` + ชื่อตาราง ในไฟล์ · จำนวนใน audit
  const withheld = await withheldByVisibility(c, ids, recs.map((r) => r.id), { actW, dealW, sensitive: seesSensitive(actor), activityLinks: fileLinks.activityLinks });
  const truncatedAny = Object.keys(truncated).length > 0;
  const withheldTables = Object.keys(withheld);
  const scope = {
    ...(chainOut.ids.length ? { mergedContactIds: chainOut.ids } : {}),
    ...(chainOut.truncated ? { mergedChainIncomplete: true as const } : {}),
    ...(withheldTables.length ? { limitedByRequesterVisibility: true as const, withheldTables } : {}),
  };
  const hasScope = Object.keys(scope).length > 0;
  const complete = !truncatedAny && !withheldTables.length && !chainOut.truncated;
  // audit: จำนวนที่ส่งออกต่อตาราง + (ถ้าถูกตัด) ยอดจริง + จำนวนที่ผู้ขอมองไม่เห็น + สายที่ถูกรวม — ไม่บันทึกไฟล์ที่ไม่ครบราวกับครบ
  await writeAudit({
    tenantId: t,
    actorId: actor.userId,
    action: "crm.contact.export.person",
    targetType: "CrmContact",
    targetId: id,
    after: {
      systemId: c.systemId,
      tables: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
      complete,
      ...(truncatedAny ? { truncated } : {}),
      ...(withheldTables.length ? { withheld } : {}),
      ...(hasScope ? { scope } : {}),
      sensitive: seesSensitive(actor),
    },
  });
  return { exportedAt: new Date().toISOString(), complete, ...(truncatedAny ? { truncated } : {}), ...(hasScope ? { scope } : {}), contact, tables };
}

/** ลิงก์ไฟล์ของคนนี้ (ผู้ติดต่อ · เรคคอร์ดของเขา · กิจกรรมที่ผู้ขอเห็น) — ทุกหน้า · เก็บไว้ไม่เกินเพดาน (ใหม่สุดตาม id) + นับยอดจริง */
async function fileLinksOf(
  lim: ExportLim,
  truncated: Record<string, { exported: number; total: number }>,
  sys: { tenantId: string; systemId: string },
  contactIds: readonly string[],
  recordIds: readonly string[],
  actWhere: Prisma.CrmActivityWhereInput,
): Promise<{ rows: { id: string; entityType: string; entityId: string; name: string; mime: string; size: number; createdAt: Date }[]; activityLinks: number }> {
  type L = { id: string; entityType: string; entityId: string; name: string; mime: string; size: number; createdAt: Date };
  let kept: L[] = [];
  let total = 0;
  const sink = (rows: L[]) => {
    total += rows.length;
    kept = [...kept, ...rows].sort((x, y) => (x.id < y.id ? 1 : x.id > y.id ? -1 : 0)).slice(0, lim.max);
  };
  const select = { id: true, entityType: true, entityId: true, name: true, mime: true, size: true, createdAt: true } as const;
  const linksOf = async (or: Prisma.CrmFileLinkWhereInput[]): Promise<number> => {
    let n = 0;
    for (let cursor: string | null = null; ; ) {
      const page: L[] = await prisma.crmFileLink.findMany({ where: { ...sys, OR: or, ...byIdDesc(cursor) }, select, orderBy: { id: "desc" }, take: lim.page });
      sink(page);
      n += page.length;
      if (page.length < lim.page) return n;
      cursor = page[page.length - 1]!.id;
    }
  };
  await linksOf([{ entityType: "CONTACT", entityId: { in: [...contactIds] } }, ...(recordIds.length ? [{ entityType: "RECORD", entityId: { in: [...recordIds] } }] : [])]);
  let activityLinks = 0;
  for (let cursor: string | null = null; ; ) {
    const acts: { id: string }[] = await prisma.crmActivity.findMany({ where: { AND: [actWhere, { contactId: { in: [...contactIds] } }, byIdDesc(cursor)] }, select: { id: true }, orderBy: { id: "desc" }, take: lim.page });
    if (acts.length) activityLinks += await linksOf([{ entityType: "ACTIVITY", entityId: { in: acts.map((a) => a.id) } }]);
    if (acts.length < lim.page) break;
    cursor = acts[acts.length - 1]!.id;
  }
  if (total > kept.length) truncated.CrmFileLink = { exported: kept.length, total };
  return { rows: kept, activityLinks };
}

/**
 * r2 (review M1-a): จำนวนแถว/ค่าของคนนี้ (ทั้งสาย) ที่ผู้ขอมองไม่เห็น — ตัวเลขล้วน (ไม่มีแถวใดถูกอ่านออกมา) ·
 * กิจกรรม/ดีล = ยอดทั้งหมดของระบบนี้ − ยอดที่ผู้ขอเห็น · ไฟล์แนบของกิจกรรม = ทั้งหมด − ของกิจกรรมที่เห็น · ค่าฟิลด์อ่อนไหว (ไม่ใช่เจ้าของร้าน)
 */
async function withheldByVisibility(
  c: { tenantId: string; systemId: string },
  ids: readonly string[],
  recordIds: readonly string[],
  v: { actW: Prisma.CrmActivityWhereInput; dealW: Prisma.CrmDealWhereInput; sensitive: boolean; activityLinks: number },
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const people = [...ids];
  const scopeW = { tenantId: c.tenantId, systemId: c.systemId, contactId: { in: people } };
  const actsAll = await prisma.crmActivity.count({ where: scopeW });
  const actsSeen = await prisma.crmActivity.count({ where: v.actW });
  if (actsAll > actsSeen) out.CrmActivity = actsAll - actsSeen;
  const dealsAll = await prisma.crmDeal.count({ where: scopeW });
  const dealsSeen = await prisma.crmDeal.count({ where: { AND: [v.dealW, { contactId: { in: people } }] } });
  if (dealsAll > dealsSeen) out.CrmDeal = dealsAll - dealsSeen;
  if (out.CrmActivity) {
    const linksAll = Number(
      (
        await prisma.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS "n" FROM "CrmFileLink" l
           WHERE l."tenantId" = ${c.tenantId} AND l."systemId" = ${c.systemId} AND l."entityType" = 'ACTIVITY'
             AND l."entityId" IN (SELECT a."id" FROM "CrmActivity" a WHERE a."tenantId" = ${c.tenantId} AND a."systemId" = ${c.systemId} AND a."contactId" = ANY(${people}::text[]))`
      )[0]?.n ?? 0,
    );
    if (linksAll > v.activityLinks) out.CrmFileLink = linksAll - v.activityLinks;
  }
  if (!v.sensitive) {
    const hidden = await prisma.customRecordValue.count({ where: { tenantId: c.tenantId, recordId: { in: [...people, ...recordIds] }, field: { sensitive: true } } });
    if (hidden) out.CustomRecordValue = hidden;
  }
  return out;
}

// ═════════════════════════ ส่งออกทั้งระบบ (งาน async บนเลนของ C3.1) ═════════════════════════

export async function exportTenant(
  ctx: PrivacyCtx,
  actor: Actor,
  input: { format?: CrmExportFormat | string | null; confirm?: boolean | null; reason?: string | null },
  deps?: PrivacyDeps | null,
): Promise<{ jobId: string; status: "QUEUED" }> {
  void deps; // ไฟล์ถูกเขียนตอน runExportJobs (ผู้เรียกฉีด put ที่นั่น)
  assertStaff(actor);
  const sys = await resolveSystem(ctx);
  // ไฟล์ส่งออกผูกกับ "คน" (ผู้ขอ) — คีย์ API ไม่มีตัวตนคงที่ (แบบเดียวกับ reports.startExport ของ C3.1)
  if (isApiActor(actor)) throw fail("FORBIDDEN", API_EXPORT_MSG);
  need(actor, "crm.contact.export");
  const format = (CRM_EXPORT_FORMATS as readonly string[]).includes(str(input?.format).toUpperCase()) ? (str(input?.format).toUpperCase() as CrmExportFormat) : null;
  if (!format) throw fail("VALIDATION", "เลือกรูปแบบไฟล์ส่งออกเป็น CSV หรือ JSON");
  // CRM C5.4-B ▸ L5-m7 (AUDIT-CLASS X9 · แบบเดียวกับส่งออกรายชื่อผู้ติดต่อ): ไฟล์นี้มีเบอร์/อีเมล/โน้ตของทุกคนที่มองเห็น ⇒ ต้องมีเหตุผล + ยืนยัน
  //   ก่อนแตะฐาน · เหตุผลลง audit + ตัวเลือกงาน ◂
  const why = str(input?.reason);
  if (why.length < PRIVACY_REASON_MIN) throw fail("VALIDATION", `ใส่เหตุผลของการส่งออกข้อมูลทั้งระบบอย่างน้อย ${PRIVACY_REASON_MIN} ตัวอักษร เพื่อให้ทีมย้อนดูได้ว่าส่งออกไปเพราะอะไร`);
  if (why.length > PRIVACY_REASON_MAX) throw fail("VALIDATION", `เหตุผลยาวเกิน ${PRIVACY_REASON_MAX} ตัวอักษร — ย่อให้สั้นลง`);
  if (input?.confirm !== true) throw fail("CONFIRM_REQUIRED", "การส่งออกข้อมูลทั้งระบบต้องกดยืนยันก่อน — ติ๊กช่องยืนยันแล้วลองอีกครั้ง");
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
  await writeAudit({ tenantId: sys.tenantId, actorId: actor.userId, action: "crm.contact.export", targetType: "CrmImportJob", targetId: job.id, after: { systemId: sys.systemId, format, scope: "SYSTEM", reason: why } });
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
  // รีวิวรอบ 4 (C1.3-S0.3): อ่านบริษัทผ่านบริการบริษัท (companyWhere อยู่ในนั้น) — ไม่มีคิวรี CrmCompany นอก companies*.ts
  const companies = await companiesSvc.listForExport({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null }, actor, cap);
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
    error:
      status === "FAILED"
        ? (job.error ?? "สร้างไฟล์ไม่สำเร็จ — กดส่งออกใหม่อีกครั้ง")
        : status === "EXPIRED"
          ? r.withdrawn === true
            ? "ไฟล์นี้ถูกถอนเพราะมีการลบข้อมูลส่วนบุคคลตามคำขอหลังสร้างไฟล์ — กดส่งออกใหม่ได้เลย (ไฟล์ใหม่จะไม่มีข้อมูลของคนที่ถูกลบ)"
            : "ไฟล์นี้หมดอายุและถูกล้างตามนโยบายเก็บข้อมูลแล้ว — กดส่งออกใหม่ได้เลย"
          : null,
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

/** เตือน lead ชุดหนึ่ง (ใต้ advisory lock ต่อระบบ) — ธง "เตือนแล้ว" = แถว AuditLog `crm.retention.warned` ที่เขียน **หลัง** วันเคลื่อนไหวล่าสุด
 *  (after.anchor = วันที่ไม่เคลื่อนไหวล่าสุด เก็บเป็นหลักฐาน) · กลับมาเคลื่อนไหวแล้วหยุดอีก = คำเตือนเก่าอยู่ก่อนวันเคลื่อนไหวใหม่ = เตือนใหม่ได้ ·
 *  เป็นหลักฐานด้วยว่าร้านได้รับคำเตือนก่อนลบ (ผูกร้าน — ไม่มีแถวกำพร้าในตารางกลาง) */
async function warnBatch(sys: { id: string; tenantId: string }, near: { id: string; ownerUserId: string | null; anchor: Date }[], months: number, at: Date): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm.retention.warn:${sys.id}`}, 0))`;
    const dayOf = (d: Date) => new Date(d).toISOString().slice(0, 10);
    const prior = await tx.auditLog.findMany({ where: { tenantId: sys.tenantId, action: LEAD_WARNED_ACTION, targetId: { in: near.map((r) => r.id) } }, select: { targetId: true, createdAt: true } });
    const byOwner = new Map<string, number>();
    let n = 0;
    for (const r of near) {
      // ใต้ล็อก: อีกรอบที่วิ่งซ้อนเตือนคนนี้ไปแล้ว (หลังวันเคลื่อนไหวล่าสุดของเขา) = ข้าม
      if (prior.some((p) => p.targetId === r.id && p.createdAt.getTime() >= new Date(r.anchor).getTime())) continue;
      await tx.auditLog.create({ data: { tenantId: sys.tenantId, actorType: "SYSTEM", actorId: null, action: LEAD_WARNED_ACTION, targetType: "CrmContact", targetId: r.id, after: { anchor: dayOf(r.anchor), systemId: sys.id, leadMonths: months } } });
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
          body: `lead ${count.toLocaleString("th-TH")} รายที่${owner ? "คุณดูแล" : "ยังไม่มีผู้ดูแล"}ไม่มีความเคลื่อนไหวมานาน จะถูกลบข้อมูลอัตโนมัติตามอายุเก็บข้อมูลของร้านในอีก ${LEAD_RETENTION_WARN_DAYS} วัน — ติดต่อหรือบันทึกกิจกรรมเพื่อเก็บไว้`,
          createdAt: at,
        });
      }
    }
    if (rows.length) await tx.appNotification.createMany({ data: rows });
    return n;
  }, TX_OPTS);
}

const LEAD_WARNED_ACTION = "crm.retention.warned";

/**
 * อายุเก็บ lead ที่ไม่แปลง (มติ C21 · `retention.leadMonths` ค่าเริ่มต้น 24 · 0 = ปิด):
 *   วันยึด = GREATEST(COALESCE(lastActivityAt, createdAt), createdAt) (C3.9-fix H6 — กิจกรรมที่บันทึกย้อนหลังดึงวันยึดไปก่อนวันสร้างไม่ได้)
 *   ลบ (source RETENTION) **เฉพาะ** lead ที่เกินอายุ **และ** ได้รับคำเตือน (`crm.retention.warned` หลังวันยึด) มาแล้ว ≥ LEAD_RETENTION_WARN_DAYS วัน ·
 *   เตือน = lead ที่อีกไม่ถึง 30 วันจะครบ **หรือเกินอายุแล้วแต่ยังไม่เคยถูกเตือน** (รอบแรกของร้าน/ขยับค่าอายุ) — แจ้งในแอปถึงผู้ดูแลครั้งเดียว (ไม่มีชื่อคน)
 * "lead ที่ไม่แปลง" = ขั้น LEAD/PROSPECT/LOST · ไม่เคยแปลง · ไม่ผูกสมาชิก · ไม่มีดีลเปิด/ชนะ · ไม่มีสิทธิ์พอร์ทัล · ไม่ถูกรวม/ลบ
 *   (C3.9-fix H10: **รวม** lead ที่เก็บถาวร — เก็บถาวรคือสิ่งที่ข้อความเพดานแนะนำ ต้องไม่กลายเป็นทางหลบอายุเก็บ)
 * 🔴 เฉพาะระบบ uiVersion 2 (R-E.14): การลบอัตโนมัติเป็นการกระทำที่ย้อนไม่ได้ — ร้านที่ยังไม่เปิด v2 ไม่ถูกแตะ
 * AUDIT-CLASS X5: ลบ = idempotent ใต้ล็อกแถว (ธง = แถว audit ของการลบ) · เตือน = แถว audit `crm.retention.warned` ใต้ advisory lock
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
    const warnedBy = new Date(at.getTime() - LEAD_RETENTION_WARN_DAYS * DAY_MS);
    const reason = `lead ไม่มีความเคลื่อนไหวเกิน ${months} เดือน — ลบอัตโนมัติตามอายุเก็บข้อมูลของร้าน`;
    // รีวิว C3.9 S4 (ข)(ค): วนจนเงียบ (เคารพ deadline/signal) · lead ที่ลบไม่สำเร็จ = OpsEvent WARN (id ล้วน) + ข้ามไปตลอดรอบนี้
    //   (ไม่ขวางคิว) · คนที่เตือนแล้ว (หลังวันยึด) ไม่ถูกหยิบซ้ำ ⇒ รอบถัดไปของลูปได้คนใหม่เสมอ
    const skip: string[] = [];
    const anchor = Prisma.sql`GREATEST(COALESCE(c."lastActivityAt", c."createdAt"), c."createdAt")`;
    const warning = (extra: Prisma.Sql) =>
      Prisma.sql`SELECT 1 FROM "AuditLog" w WHERE w."action" = ${LEAD_WARNED_ACTION} AND w."targetId" = c."id" AND w."tenantId" = c."tenantId" AND w."createdAt" >= ${anchor} ${extra}`;
    const idle = (hi: Date, mode: "erase" | "warn") => prisma.$queryRaw<{ id: string; ownerUserId: string | null; anchor: Date }[]>`
      SELECT c."id", c."ownerUserId", ${anchor} AS "anchor" FROM "CrmContact" c
       WHERE c."tenantId" = ${sys.tenantId} AND c."systemId" = ${sys.id}
         AND c."mergedIntoId" IS NULL
         AND c."convertedAt" IS NULL AND c."memberCustomerId" IS NULL
         AND c."lifecycleStage"::text IN ('LEAD', 'PROSPECT', 'LOST')
         AND NOT (c."id" = ANY(${skip}::text[]))
         AND ${anchor} < (${ts(hi)}::timestamptz AT TIME ZONE 'UTC')
         AND NOT EXISTS (SELECT 1 FROM "CrmDeal" d WHERE d."contactId" = c."id" AND d."kind"::text IN ('OPEN', 'WON'))
         AND NOT EXISTS (SELECT 1 FROM "CrmPortalAccess" p WHERE p."contactId" = c."id" AND p."revokedAt" IS NULL)
         AND NOT EXISTS (SELECT 1 FROM "AuditLog" e WHERE e."action" = ${CRM_ERASE_AUDIT_ACTION} AND e."targetId" = c."id" AND e."tenantId" = c."tenantId")
         ${mode === "erase"
           ? Prisma.sql`AND EXISTS (${warning(Prisma.sql`AND w."createdAt" <= (${ts(warnedBy)}::timestamptz AT TIME ZONE 'UTC')`)})`
           : Prisma.sql`AND NOT EXISTS (${warning(Prisma.empty)})`}
       ORDER BY ${anchor} ASC, c."id" ASC LIMIT ${LEAD_BATCH_MAX}`;
    for (let round = 0; round < 50 && !stopped(opts); round += 1) {
      const batch = await idle(cutoff, "erase");
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
      const near = await idle(warnFrom, "warn");
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
