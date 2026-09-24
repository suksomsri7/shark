// calls.ts — บันทึกการโทร + ผู้ช่วย AI ของสาย + นามบัตร + ลิงก์จองคิว (CRM v2 · ใบ C2.4 · พิมพ์เขียว §5.5 · มติ C5 · ภาพ 08 ซ้าย)
//
// ของที่ไฟล์นี้เป็นเจ้าของ
//   • logCall / attachRecording / getRecording / removeRecording / purgeRecordings — เสียงบันทึกการโทรบน **ทางไฟล์ส่วนตัว** (C0.4)
//   • callAiStatus / transcribeCall / pendingCallAiProposal / acceptCallAiProposal / rejectCallAiProposal — ถอดเสียง → สรุป →
//     **ข้อเสนอ** (`AiProposal` kind `crm.activity.ai_fill`) ที่คนต้องกดรับก่อนค่าจะลงแถวกิจกรรม (ไม่มีการเขียนอัตโนมัติ)
//   • scanBusinessCard / acceptLeadProposal — อ่านนามบัตรด้วยโมเดล vision → ข้อเสนอ `crm_create_lead` ของ **ระบบนี้**
//   • bookingLinkFor — ปุ่ม "จองผ่านระบบจองคิว" (R-A)
//
// 🔴 ลำดับตายตัวทุกฟังก์ชัน (สัญญาใบ C1.7 + C2.4): resolve ระบบ CRM ใหม่ (ไม่ใช่ของร้านนี้ = NOT_FOUND) → ประตู uiVersion 2
//    (`assertCrmV2` → CrmV2DisabledError · ไม่อ่าน/ไม่เขียน/ไม่เรียกอะไรเลย) → การมองเห็น (`./where` · มองไม่เห็น = NOT_FOUND) →
//    คีย์ (`crmCan` · เห็นแต่ไม่มีคีย์ = FORBIDDEN) → ตรวจค่าที่กรอก → ลงมือ
//    ⚠️ ประตู v2 อยู่ "หลัง" resolve ระบบ เพราะระบบของร้านอื่นต้องได้ NOT_FOUND ไม่ใช่ "CRM ใหม่ยังไม่เปิด" (ไม่บอกว่ามีระบบนั้นอยู่)
// 🔴 AUDIT-CLASS X10: เสียง/ไฟล์ทุกชิ้นผ่าน `uploadFile(…, { visibility: "private" })` ⇒ path `t/<tid>/private/<สุ่ม 160 บิต>` และ
//    `cdnUrl` เป็นค่าหมาย `private://…` · DTO มีแค่ `privateFileUrl(fileId, ผู้ดู)` ที่ออก **หลัง** ด่านการมองเห็นเสมอ
//    (กติกาหัวไฟล์ `src/app/api/files/[id]/route.ts`: ผู้ออกใบเป็นคนตัดสินสิทธิ์)
// 🔴 AUDIT-CLASS X8: ข้อความถอดเสียง/สรุป **ไม่เคย** ลง outbox · OpsEvent · log · AuditLog · `AiCreditTxn.note`
//    (note = `crm.call.transcribe#<activityId>` id ล้วน) · prompt ที่ส่งโมเดลถูกปิดเบอร์/อีเมลก่อนทุกครั้ง
// 🔴 AUDIT-CLASS X3: งานถอดเสียงจองด้วย advisory lock ต่อกิจกรรม + แถว `AiProposal` PENDING เป็น "ธง" ⇒ กด 10 ครั้งพร้อมกัน =
//    ข้อเสนอ 1 ใบ · หักเครดิต 1 ครั้ง · เรียกตัวถอดเสียง 1 ครั้ง · **ล็อกถูกปล่อยก่อน** งานช้า (ไม่ถือธุรกรรมคาขณะยิงเน็ต)
// 🔴 AUDIT-CLASS X9: ลบเสียง = งานอันตราย (ยืนยัน + เหตุผล ≥ 5) · ทุก mutation มีแถว AuditLog `crm.activity.*` (targetId = id กิจกรรม)
// 🔴 AUDIT-CLASS X1 · X2 · X4 · X6: ดูที่หัวของแต่ละฟังก์ชัน

import type { CrmActivity, FileAsset, Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { logOps } from "@/lib/core/ops";
import type { MemberActor } from "@/lib/modules/member";
import { ALLOWED_UPLOAD_TYPES, deleteFileAsset, normalizeUploadType, openStoredFile, privateFileUrl, uploadFile, type DeleteDeps, type UploadDeps } from "@/lib/storage/service";
import { canSpend, canSpendPeek, chargeUsageSafe } from "@/lib/ai/credit";
import { resolveProvider, type AiProvider } from "@/lib/ai/provider";
import { prisma } from "./db";
import { crmCan, crmForbiddenMessage } from "./access";
import { assertCrmV2 } from "./ui-version";
import { activityWhere, contactWhere } from "./where";
import { crmAiSettingsOf, crmRecordingDaysOf, parseCrmSettings } from "./settings";
import * as activities from "./activities";
import { sanitizeFileName } from "./files";
import { ActivitiesError, DAY_MS, type ActivityDto } from "./activities-shared";
import { getCrmTranscriber, type CrmTranscriber } from "./transcriber";
import {
  CRM_CALL_AI_OFF_MSG,
  CRM_CALL_AI_READY_MSG,
  CRM_CALL_AI_WORKING_MSG,
  CRM_CARD_MAX_BYTES,
  CRM_CARD_MIME_ALLOWLIST,
  CRM_RECORDING_DAYS_DEFAULT,
  CRM_RECORDING_MAX_BYTES,
  CRM_RECORDING_MIME_ALLOWLIST,
  CRM_RECORDING_REASON_MAX,
  CRM_RECORDING_REASON_MIN,
  CRM_TRANSCRIBER_MISSING_MSG,
  CallsError,
  mbOf,
  redactContactInfo,
  type CallAiProposalView,
  type CallAiStatus,
  type CallDirection,
  type CallErrorCode,
  type CardDraft,
  type LogCallInput,
  type RecordingDto,
  type RecordingUpload,
} from "./calls-shared";

export {
  CRM_CARD_MAX_BYTES,
  CRM_CARD_MIME_ALLOWLIST,
  CRM_RECORDING_MAX_BYTES,
  CRM_RECORDING_MIME_ALLOWLIST,
  CallsError,
  // AUDIT-CLASS X8: ตัวปิดเบอร์/อีเมลอยู่ที่ `calls-shared` (สะพานแชทใช้ตัวเดียวกัน) — เปิดต่อที่นี่ให้ผู้เรียกในโมดูล
  redactContactInfo,
};

/** ทะเบียนข้อเสนอที่ยังรออยู่ ผูกกับกิจกรรมผ่านค่าหมายของ `AiProposal.conversationId` (ตารางนั้นไม่มีช่อง activityId) */
export const CALL_AI_PROPOSAL_KIND = "crm.activity.ai_fill";
export const LEAD_PROPOSAL_KIND = "crm_create_lead";
const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000; // เท่ากับ TTL ของ `ai/proposals` (ที่เดียวกัน คนละทางรับ — มติผู้คุมงาน C2.4 ข้อ 4)
const convOf = (activityId: string) => `crm:activity:${activityId}`;

/**
 * AUDIT-CLASS X3: "ธง" ของงานถอดเสียงที่ **ยังทำอยู่** — แถว `AiProposal` PENDING ที่ payload ยังว่าง
 * 🔴 ทำไมต้องแยกสถานะนี้ออกมา: ธงถูกปักก่อนยิงตัวถอดเสียง (ไม่ถือธุรกรรมคาเน็ต) ⇒ มีช่วงที่ใบนั้น "จองแล้วแต่ยังไม่มีเนื้อ"
 *    ถ้าปล่อยให้กดรับได้ในช่วงนั้น ค่าที่ลงกิจกรรมจะเป็นค่าว่าง (ทับของเดิมเป็น NULL) และผลจริงที่มาทีหลังจะตกใส่ใบที่
 *    EXECUTED ไปแล้ว = จ่ายค่า AI แล้วไม่ได้อะไร ⇒ `resultNote` ถือเครื่องหมาย `WORKING#<epoch ms>` (ตัวเลขล้วน ไม่มี PII)
 * 🔴 ตารางไม่มีคอลัมน์ `claimedAt` และใบนี้ห้ามมี migration ⇒ เวลาจองอยู่ในเครื่องหมายนี้
 */
const WORKING_MARK = "WORKING#";
/** ธงที่ค้างเกินเท่านี้ = โพรเซสเดิมตายกลางทาง ⇒ ปล่อยให้คนถัดไปจองใหม่ (ไม่ต้องรอ TTL 24 ชม.) */
export const CALL_AI_WORKING_STALE_MS = 15 * 60 * 1000;
const workingMark = () => `${WORKING_MARK}${Date.now()}`;
/** เวลาที่ธงถูกปัก (ms) — ไม่ใช่ธง "กำลังทำ" = null */
const workingSince = (resultNote: unknown): number | null => {
  const s = typeof resultNote === "string" && resultNote.startsWith(WORKING_MARK) ? resultNote.slice(WORKING_MARK.length) : "";
  const n = Number(s);
  return s && Number.isFinite(n) ? n : null;
};

export type CallsCtx = { tenantId: string; systemId: string; actorUserId: string | null };
export type CallStoreDeps = { put?: UploadDeps["put"]; del?: DeleteDeps["del"] };
export type TranscribeDeps = { transcriber?: CrmTranscriber; ai?: AiProvider };
export type LogCallResult = { activity: ActivityDto; nextTaskId: string | null; recording: RecordingDto | null };

type Tx = Prisma.TransactionClient;

const ACT_NOT_FOUND = "ไม่พบกิจกรรมนี้ในระบบ CRM ที่เปิดอยู่ (อาจถูกลบหรืออยู่คนละระบบ) — รีเฟรชหน้าแล้วลองใหม่";
const SYS_NOT_FOUND = "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";
const CONTACT_NOT_FOUND = "ไม่พบผู้ติดต่อคนนี้ในระบบ CRM ที่เปิดอยู่ (อาจถูกลบหรืออยู่คนละระบบ) — รีเฟรชหน้าแล้วลองใหม่";
const PROPOSAL_NOT_FOUND = "ไม่พบข้อเสนอของผู้ช่วย AI ใบนี้ (อาจหมดอายุหรืออยู่คนละระบบ) — กดถอดเสียงใหม่ได้เลย";
const PROPOSAL_TAKEN = "ข้อเสนอใบนี้ถูกจัดการไปแล้วจากอีกหน้าจอหนึ่ง — รีเฟรชหน้าเพื่อดูผลล่าสุด";

const fail = (code: CallErrorCode, message: string) => new CallsError(code, message);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isManager = (a: MemberActor) => a.role === "OWNER" || a.role === "MANAGER";
const lockKey = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;

/** error ของบริการกิจกรรม (C1.6) → รหัสของใบนี้ (รหัสชุดเดียวกัน ข้อความไทยเดิม) */
function mapError(e: unknown): unknown {
  if (e instanceof ActivitiesError) return new CallsError(e.code as CallErrorCode, e.message);
  return e;
}

/** AUDIT-CLASS X2: หลังการมองเห็นเสมอ — เห็นแต่ไม่มีคีย์ = FORBIDDEN ข้อความไทย */
function need(a: MemberActor, key: string): void {
  if (!crmCan(a, key)) throw fail("FORBIDDEN", crmForbiddenMessage(key));
}

/**
 * AUDIT-CLASS X1: ระบบของ ctx ต้องเป็นระบบ **CRM ของร้านนี้** จริง (ของร้านอื่น/ชนิดอื่น = NOT_FOUND ไม่บอกว่ามีอยู่)
 * แล้วจึงถึงประตู uiVersion 2 (R-E.14 — ระบบที่ยังไม่เปิด v2 ไม่อ่าน ไม่เขียน ไม่เรียกตัวถอดเสียง/AI อะไรเลย)
 */
async function enter(ctx: CallsCtx, actor: MemberActor | null | undefined): Promise<{ a: MemberActor; settings: unknown }> {
  // ลูกค้า (portal) ไม่มีทางเข้าบริการฝั่งพนักงาน — ตอบ "ไม่พบ" (404-not-403)
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", ACT_NOT_FOUND);
  const sys =
    typeof ctx?.systemId === "string" && typeof ctx?.tenantId === "string" && ctx.systemId && ctx.tenantId
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true, settings: true } })
      : null;
  if (!sys) throw fail("NOT_FOUND", SYS_NOT_FOUND);
  await assertCrmV2({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  return { a: actor, settings: sys.settings };
}

/** AUDIT-CLASS X1: กิจกรรม 1 แถวผ่าน `activityWhere` — ระบบอื่น/ร้านอื่น/มองไม่เห็น = NOT_FOUND */
async function loadActivity(ctx: CallsCtx, a: MemberActor, id: unknown): Promise<CrmActivity> {
  const aid = str(id);
  const row = aid ? await prisma.crmActivity.findFirst({ where: { AND: [await activityWhere(ctx, a), { id: aid }] } }) : null;
  if (!row) throw fail("NOT_FOUND", ACT_NOT_FOUND);
  return row;
}

async function audit(ctx: CallsCtx, action: string, targetId: string, body: { before?: unknown; after?: unknown }): Promise<void> {
  // AUDIT-CLASS X8: before/after เก็บแค่ id · ชนิด · ขนาด · ธง — ไม่มีข้อความถอดเสียง ไม่มี path ของไฟล์
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? null,
    actorType: ctx.actorUserId ? "USER" : "SYSTEM",
    action,
    targetType: "CrmActivity",
    targetId,
    ...body,
  });
}

// ═════════════════════════ ตรวจไฟล์เสียง (AUDIT-CLASS X6 — ก่อนแตะที่เก็บ/ฐานเสมอ) ═════════════════════════

type CleanRecording = { name: string; mime: string; data: Uint8Array };

/**
 * AUDIT-CLASS X6: ไฟล์เสียงที่รับได้ — ชนิด ∈ ทะเบียน `audio/*` (หลัง `normalizeUploadType` ⇒ `audio/webm;codecs=opus` ผ่าน) ·
 * ขนาด ≤ 25 MB · ชื่อไฟล์ทำความสะอาดแบบเดียวกับไฟล์แนบ (ไม่มี / \ < > ตัวควบคุม อักขระสลับทิศ · ไม่ขึ้นต้นด้วยจุด)
 * 🔴 บริสุทธิ์: ไม่แตะฐาน ไม่แตะที่เก็บ ⇒ ปฏิเสธ = ไม่มีแถว ไม่มี put ไม่มี FileAsset
 */
function cleanRecording(input: unknown): CleanRecording {
  if (!isObj(input)) throw fail("VALIDATION", "ยังไม่ได้เลือกไฟล์เสียง — เลือกไฟล์แล้วลองอีกครั้ง");
  const data = input.data;
  if (!(data instanceof Uint8Array) || data.length === 0) throw fail("VALIDATION", "ไฟล์เสียงว่างหรืออ่านไม่ได้ — เลือกไฟล์ใหม่อีกครั้ง");
  if (data.length > CRM_RECORDING_MAX_BYTES) {
    throw fail("VALIDATION", `ไฟล์เสียงใหญ่เกิน ${mbOf(CRM_RECORDING_MAX_BYTES)} MB — ตัดช่วงที่ต้องการหรือบีบอัดก่อนแนบ`);
  }
  const mime = normalizeUploadType(typeof input.contentType === "string" ? input.contentType : "");
  const ext = ALLOWED_UPLOAD_TYPES[mime as keyof typeof ALLOWED_UPLOAD_TYPES];
  if (!CRM_RECORDING_MIME_ALLOWLIST.includes(mime) || !ext) {
    throw fail("VALIDATION", "ไฟล์นี้ไม่ใช่ไฟล์เสียงที่ระบบรองรับ — รองรับ m4a · mp3 · webm · ogg · wav · aac");
  }
  return { name: sanitizeFileName(input.filename, ext), mime, data };
}

/** AUDIT-CLASS X10: DTO ของเสียง — ลิงก์ที่ผูกกับผู้ดูคนนี้และหมดอายุเท่านั้น (ไม่มี path / cdnUrl / ค่าหมาย) */
function toRecordingDto(row: Pick<CrmActivity, "id" | "durationSec">, asset: Pick<FileAsset, "id" | "contentType" | "bytes">, name: string, viewerUserId: string): RecordingDto {
  const url = privateFileUrl(asset.id, { kind: "STAFF", id: viewerUserId });
  const exp = Number(/[?&]exp=(\d+)/.exec(url)?.[1] ?? 0);
  return {
    activityId: row.id,
    name,
    size: asset.bytes,
    mime: asset.contentType,
    url,
    expiresAt: new Date(exp * 1000).toISOString(),
    durationSec: row.durationSec,
  };
}

/** ชื่อไฟล์ที่แสดงตอนอ่านย้อนหลัง — ตาราง `CrmActivity` ไม่มีช่องเก็บชื่อไฟล์เสียง ⇒ ประกอบจากชนิดไฟล์ + ป้ายไทย */
function displayName(asset: Pick<FileAsset, "contentType">): string {
  const ext = ALLOWED_UPLOAD_TYPES[normalizeUploadType(asset.contentType) as keyof typeof ALLOWED_UPLOAD_TYPES] ?? "audio";
  return `เสียงบันทึกการโทร.${ext}`;
}

// ═════════════════════════ บันทึกการโทร ═════════════════════════

const DIR_LABEL: Record<CallDirection, string> = { IN: "สายเข้า", OUT: "โทรออก" };

function parseDirection(v: unknown): CallDirection {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (s !== "IN" && s !== "OUT") throw fail("VALIDATION", "เลือกทิศทางของสายก่อน — สายเข้า หรือ โทรออก");
  return s;
}

/**
 * บันทึกสาย 1 รายการ (+ งานถัดไป + ไฟล์เสียง) — ต่อยอดบน `activities.logActivity` ของ C1.6 (ผู้เขียน `CrmActivity` ที่เดียว)
 * AUDIT-CLASS X6: ไฟล์เสียงถูกตรวจ **ก่อน** เขียนอะไรทั้งหมด ⇒ ไฟล์ผิด = ไม่มีกิจกรรม ไม่มี put ไม่มี FileAsset
 * AUDIT-CLASS X1 · X2: การมองเห็นเป้าหมาย + คีย์ `crm.activity.create` ตัดสินใน `logActivity` (ทางเดียวกับฟอร์มกิจกรรม)
 */
export async function logCall(ctx: CallsCtx, actor: MemberActor, input: LogCallInput, deps?: CallStoreDeps): Promise<LogCallResult> {
  const { a } = await enter(ctx, actor);
  if (!isObj(input)) throw fail("VALIDATION", "ข้อมูลของสายไม่ครบ — กรอกฟอร์มใหม่อีกครั้ง");
  const direction = parseDirection(input.direction);
  // ตรวจไฟล์เสียงก่อนแตะฐาน/ที่เก็บ (X6)
  const rec = input.recording === undefined || input.recording === null ? null : cleanRecording(input.recording);
  const outcome = str(input.outcome);
  // ทะเบียนผลสาย (`settings.crm.activityOutcomes.CALL`) ถูกตรวจใน `logActivity` — ไม่มีตัวตรวจที่สองในใบนี้
  if (!outcome) throw fail("VALIDATION", "เลือกผลสายก่อน — เช่น รับสาย · ไม่รับ · สนใจ");
  const startAt = input.startAt ?? new Date();
  const logged = await activities
    .logActivity(ctx, a, {
      type: "CALL",
      title: str(input.title) ?? `${DIR_LABEL[direction]} — ${outcome}`,
      body: input.body ?? null,
      direction,
      outcome,
      contactId: str(input.contactId),
      companyId: str(input.companyId),
      dealId: str(input.dealId),
      startAt,
      durationSec: input.durationSec ?? null,
      remindAt: input.remindAt ?? null,
      ...(input.nextTask ? { nextTask: input.nextTask } : {}),
    })
    .catch((e: unknown) => {
      throw mapError(e);
    });
  let recording: RecordingDto | null = null;
  if (rec) {
    recording = await attachCore(ctx, a, logged.id, rec, deps).catch((e: unknown) => {
      // กิจกรรมถูกบันทึกแล้ว (สายที่เกิดขึ้นจริงต้องไม่หายไปเพราะที่เก็บไฟล์ล่ม) — บอกตรง ๆ ว่าเหลือแค่ไฟล์เสียง
      if (e instanceof CallsError) throw fail(e.code, `บันทึกสายเรียบร้อยแล้ว แต่${e.message}`);
      throw e;
    });
  }
  return { activity: logged, nextTaskId: logged.nextTaskId, recording };
}

/**
 * แนบไฟล์เสียงกับสาย 1 รายการ — **หนึ่งสาย หนึ่งไฟล์** (X4: conditional update `recordingFileId IS NULL` ⇒ แนบพร้อมกัน = คนชนะคนเดียว)
 * AUDIT-CLASS X10: `visibility: "private"` ⇒ path `t/<tid>/private/…` · `cdnUrl` = `private://…` (ไม่ใช่ URL ที่ใช้ได้)
 */
export async function attachRecording(ctx: CallsCtx, actor: MemberActor, activityId: string, upload: RecordingUpload, deps?: CallStoreDeps): Promise<RecordingDto> {
  const { a } = await enter(ctx, actor);
  const rec = cleanRecording(upload);
  return attachCore(ctx, a, activityId, rec, deps);
}

async function attachCore(ctx: CallsCtx, a: MemberActor, activityId: string, rec: CleanRecording, deps?: CallStoreDeps): Promise<RecordingDto> {
  const row = await loadActivity(ctx, a, activityId);
  need(a, "crm.activity.create");
  if (row.type !== "CALL") throw fail("VALIDATION", "แนบไฟล์เสียงได้กับกิจกรรมชนิด “โทร” เท่านั้น — เปิดสายที่ต้องการแล้วแนบใหม่");
  if (row.recordingFileId) throw fail("CONFLICT", "สายนี้มีไฟล์เสียงอยู่แล้ว — ลบไฟล์เดิมก่อนถ้าต้องการเปลี่ยนไฟล์");
  const up = await uploadFile(
    { tenantId: ctx.tenantId },
    { kind: "ATTACHMENT", filename: rec.name, contentType: rec.mime, data: rec.data, maxBytes: CRM_RECORDING_MAX_BYTES, visibility: "private" },
    deps?.put ? { put: deps.put } : undefined,
  );
  if (!up.ok) throw fail("CONFLICT", "อัปโหลดไฟล์เสียงไม่สำเร็จ ระบบจึงยังไม่ได้แนบไฟล์นี้ — ลองใหม่อีกครั้งในอีกสักครู่");
  const claimed = await prisma.crmActivity.updateMany({
    where: { id: row.id, tenantId: ctx.tenantId, systemId: ctx.systemId, type: "CALL", recordingFileId: null },
    data: { recordingFileId: up.assetId },
  });
  if (claimed.count !== 1) {
    await deleteFileAsset({ tenantId: ctx.tenantId }, up.assetId, deps?.del ? { del: deps.del } : undefined).catch(() => undefined);
    throw fail("CONFLICT", "สายนี้มีไฟล์เสียงอยู่แล้ว (เพิ่งถูกแนบจากอีกหน้าจอหนึ่ง) — รีเฟรชหน้าแล้วดูไฟล์ล่าสุด");
  }
  const asset = await prisma.fileAsset.findFirst({ where: { id: up.assetId, tenantId: ctx.tenantId } });
  if (!asset) throw fail("CONFLICT", "แนบไฟล์เสียงไม่สำเร็จ — ลองใหม่อีกครั้งในอีกสักครู่");
  await audit(ctx, "crm.activity.recording_attach", row.id, { after: { fileId: asset.id, size: asset.bytes, mime: asset.contentType } });
  return toRecordingDto(row, asset, rec.name, a.userId);
}

/**
 * ลิงก์ฟังเสียงของสายหนึ่ง — **ด่านการมองเห็นก่อนออกใบผ่านเสมอ** (กติกาหัวไฟล์ `/api/files/[id]`)
 * มองไม่เห็น/ร้านอื่น/ระบบอื่น = NOT_FOUND (ไม่มีใบผ่านถูกออก) · ไม่มีไฟล์เสียง = null
 */
export async function getRecording(ctx: CallsCtx, actor: MemberActor, activityId: string): Promise<RecordingDto | null> {
  const { a } = await enter(ctx, actor);
  const row = await loadActivity(ctx, a, activityId);
  if (!row.recordingFileId) return null;
  const asset = await prisma.fileAsset.findFirst({ where: { id: row.recordingFileId, tenantId: ctx.tenantId } });
  if (!asset) return null;
  return toRecordingDto(row, asset, displayName(asset), a.userId);
}

/**
 * AUDIT-CLASS X9: ลบไฟล์เสียง = งานอันตราย — ไม่ยืนยัน = CONFIRM_REQUIRED · เหตุผลสั้นกว่า 5 ตัวอักษร = VALIDATION (ไฟล์ยังอยู่)
 * ลบวัตถุจริงบนที่เก็บ + `FileAsset` ก่อน แล้วค่อยล้าง `recordingFileId` (ที่เก็บล้ม = ไฟล์ยังอยู่ครบ ลองใหม่ได้)
 */
export async function removeRecording(
  ctx: CallsCtx,
  actor: MemberActor,
  activityId: string,
  opts: { confirm?: boolean | null; reason?: string | null } | null | undefined,
  deps?: CallStoreDeps,
): Promise<{ ok: true }> {
  const { a } = await enter(ctx, actor);
  const row = await loadActivity(ctx, a, activityId);
  need(a, "crm.activity.create");
  if (!isManager(a) && row.ownerUserId !== a.userId) {
    throw fail("FORBIDDEN", "ลบไฟล์เสียงได้เฉพาะเจ้าของสายหรือผู้จัดการ — ขอให้ผู้จัดการช่วยลบให้");
  }
  if (opts?.confirm !== true) throw fail("CONFIRM_REQUIRED", "ลบไฟล์เสียงแล้วกู้คืนไม่ได้ — ติ๊กยืนยันและใส่เหตุผลก่อน");
  const reason = str(opts?.reason) ?? "";
  if (reason.length < CRM_RECORDING_REASON_MIN) throw fail("VALIDATION", `ใส่เหตุผลที่ลบอย่างน้อย ${CRM_RECORDING_REASON_MIN} ตัวอักษร — เก็บไว้ในประวัติให้ตรวจย้อนหลังได้`);
  if (!row.recordingFileId) throw fail("VALIDATION", "สายนี้ไม่มีไฟล์เสียงให้ลบ — รีเฟรชหน้าแล้วดูรายการล่าสุด");
  const fileId = row.recordingFileId;
  const del = await deleteFileAsset({ tenantId: ctx.tenantId }, fileId, deps?.del ? { del: deps.del } : undefined);
  if (!del.ok) throw fail("CONFLICT", "ลบไฟล์เสียงจากที่เก็บไม่สำเร็จ ไฟล์ยังอยู่ครบ — ลองใหม่อีกครั้งในอีกสักครู่");
  await prisma.crmActivity.updateMany({ where: { id: row.id, tenantId: ctx.tenantId, systemId: ctx.systemId }, data: { recordingFileId: null } });
  await audit(ctx, "crm.activity.recording_remove", row.id, { before: { fileId }, after: { removed: true, reason: reason.slice(0, CRM_RECORDING_REASON_MAX) } });
  return { ok: true };
}

// ═════════════════════════ ผู้ช่วย AI ของสาย (ถอดเสียง → สรุป → ข้อเสนอ) ═════════════════════════

/** สถานะปุ่ม "ถอดเสียง" ของโมดัล — ทุกสถานะมีข้อความไทยที่บอกว่าต้องทำอะไรต่อ (ไม่โทษผู้ใช้) */
export async function callAiStatus(ctx: CallsCtx, actor: MemberActor, deps?: TranscribeDeps): Promise<CallAiStatus> {
  const { settings } = await enter(ctx, actor);
  if (crmAiSettingsOf(settings).callTranscribe !== true) return { state: "OFF", message: CRM_CALL_AI_OFF_MSG };
  if (!(deps?.transcriber ?? getCrmTranscriber())) return { state: "NO_PROVIDER", message: CRM_TRANSCRIBER_MISSING_MSG };
  // 🔴 N16: อ่านสถานะ = ห้ามเขียน — `canSpendPeek` ไม่เปิดกระเป๋าและไม่แจกเครดิตต้อนรับ (ต่างจาก `canSpend` ที่เรียก `ensureWallet`)
  //    หน้าผู้ติดต่อ/ดีลเรียกตัวนี้ทุกครั้งที่เปิด ⇒ ถ้าใช้ `canSpend` ร้านที่ยังไม่เคยใช้ AI จะได้กระเป๋า + แถว GRANT จากการ "เปิดดูหน้า"
  if (!(await canSpendPeek(ctx.tenantId))) return { state: "NO_CREDIT", message: "เครดิตผู้ช่วย AI หมดแล้ว — เติมเครดิตที่ ตั้งค่า → เครดิต AI แล้วกดถอดเสียงได้ทันที" };
  return { state: "READY", message: CRM_CALL_AI_READY_MSG };
}

const SUMMARY_PROMPT = [
  "คุณเป็นผู้ช่วยของทีมขาย อ่านข้อความถอดเสียงการคุยโทรศัพท์ด้านล่าง แล้วตอบเป็น JSON เท่านั้น",
  'รูปแบบ: {"summary": "สรุปสายสั้น ๆ ไม่เกิน 3 บรรทัด", "nextStep": "สิ่งที่ควรทำต่อ 1 ข้อ"}',
  "เขียนเป็นภาษาไทย · ห้ามใส่เบอร์โทรหรืออีเมล · ห้ามเดาข้อมูลที่ไม่ได้อยู่ในข้อความ",
].join("\n");

const CARD_PROMPT = [
  "อ่านรูปนามบัตรใบนี้ แล้วตอบเป็น JSON เท่านั้น",
  'รูปแบบ: {"name": "", "phone": "", "email": "", "company": "", "jobTitle": ""}',
  "ช่องที่อ่านไม่ได้ให้เป็นข้อความว่าง · ห้ามเดา · ห้ามเติมข้อมูลที่ไม่ปรากฏบนนามบัตร",
].join("\n");

/** อ่าน JSON จากคำตอบของโมเดล (โมเดลมักห่อด้วย ```json … ```) — อ่านไม่ได้ = ออบเจ็กต์ว่าง */
function jsonOf(text: unknown): Record<string, unknown> {
  const s = String(text ?? "");
  const m = /\{[\s\S]*\}/.exec(s);
  if (!m) return {};
  try {
    const v: unknown = JSON.parse(m[0]);
    return isObj(v) ? v : {};
  } catch {
    return {};
  }
}
const field = (o: Record<string, unknown>, k: string, max = 2000): string => (typeof o[k] === "string" ? (o[k] as string).trim().slice(0, max) : "");

type ProposalPayload = { activityId: string; systemId: string; transcript: string; aiSummary: string; aiNextStep: string };
/** ข้อเสนอที่มี "เนื้อ" แล้ว (ถอดเสียงเสร็จ) — payload ว่างทั้งสามช่อง = ยังทำอยู่ */
const payloadFilled = (p: ProposalPayload | null): boolean => !!p && !!(p.transcript.trim() || p.aiSummary.trim() || p.aiNextStep.trim());

const payloadOf = (v: unknown): ProposalPayload | null => {
  if (!isObj(v)) return null;
  const activityId = str(v.activityId);
  const systemId = str(v.systemId);
  if (!activityId || !systemId) return null;
  return { activityId, systemId, transcript: String(v.transcript ?? ""), aiSummary: String(v.aiSummary ?? ""), aiNextStep: String(v.aiNextStep ?? "") };
};

/**
 * ถอดเสียงสาย → สรุป/ขั้นถัดไป → **ข้อเสนอ** (ไม่เขียนลงกิจกรรมเอง) · หักเครดิตครั้งเดียวต่อข้อเสนอ (source `CRM_ASSIST`)
 *
 * ลำดับการปฏิเสธ (มติผู้คุมงาน C2.4 ข้อ 5 — ทุกข้อ "ไม่เรียกอะไร ไม่หักอะไร"):
 *   ประตู v2 → การมองเห็น (NOT_FOUND) → คีย์ `crm.activity.create` (FORBIDDEN) → ต้องเป็นสายที่มีไฟล์เสียง (VALIDATION) →
 *   `settings.crm.ai.callTranscribe` (AI_DISABLED) → มีตัวถอดเสียง/โมเดล (NOT_CONFIGURED) → `canSpend` (NO_CREDIT)
 *
 * AUDIT-CLASS X3: "ธงก่อน แล้วค่อยทำงาน" — advisory lock ต่อกิจกรรม + แถว `AiProposal` PENDING เป็นธง ในธุรกรรม **สั้น** ที่จบก่อน
 *   จะยิงตัวถอดเสียง/โมเดล ⇒ กด 10 ครั้งพร้อมกัน: 1 คนสร้างธงแล้วทำงาน · 9 คนได้ id เดิม (`reused`) และไม่มีใครถือธุรกรรมคาเน็ต
 */
export async function transcribeCall(ctx: CallsCtx, actor: MemberActor, activityId: string, deps?: TranscribeDeps): Promise<{ proposalId: string; reused: boolean }> {
  const { a, settings } = await enter(ctx, actor);
  const row = await loadActivity(ctx, a, activityId);
  need(a, "crm.activity.create");
  if (row.type !== "CALL" || !row.recordingFileId) {
    throw fail("VALIDATION", "ถอดเสียงได้เฉพาะสายที่มีไฟล์เสียงแนบอยู่ — แนบไฟล์เสียงของสายนี้ก่อน");
  }
  if (crmAiSettingsOf(settings).callTranscribe !== true) throw fail("AI_DISABLED", CRM_CALL_AI_OFF_MSG);
  const transcriber = deps?.transcriber ?? getCrmTranscriber();
  if (!transcriber) throw fail("NOT_CONFIGURED", CRM_TRANSCRIBER_MISSING_MSG);
  const ai = deps?.ai ?? resolveProvider();
  if (!ai) throw fail("NOT_CONFIGURED", `${CRM_TRANSCRIBER_MISSING_MSG} (ยังไม่ได้ตั้งค่าผู้ช่วย AI ของระบบ)`);
  if (!(await canSpend(ctx.tenantId))) {
    throw fail("NO_CREDIT", "เครดิตผู้ช่วย AI หมดแล้ว — เติมเครดิตที่ ตั้งค่า → เครดิต AI แล้วกดถอดเสียงได้ทันที");
  }
  const asset = await prisma.fileAsset.findFirst({ where: { id: row.recordingFileId, tenantId: ctx.tenantId } });
  if (!asset) throw fail("VALIDATION", "ไม่พบไฟล์เสียงของสายนี้ในที่เก็บ (อาจถูกลบไปแล้ว) — แนบไฟล์ใหม่แล้วลองอีกครั้ง");

  // ── ธง: ข้อเสนอ PENDING ใบเดียวต่อกิจกรรม (ล็อกต่อกิจกรรม · ธุรกรรมสั้น) ──
  const claim = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `crm:call-ai:${row.id}`);
    const open = await tx.aiProposal.findFirst({
      where: { tenantId: ctx.tenantId, kind: CALL_AI_PROPOSAL_KIND, conversationId: convOf(row.id), status: "PENDING", expiresAt: { gt: new Date() } },
      select: { id: true, payload: true, resultNote: true },
    });
    if (open) {
      const since = workingSince(open.resultNote);
      const stale = since !== null && Date.now() - since > CALL_AI_WORKING_STALE_MS;
      if (!stale || payloadFilled(payloadOf(open.payload))) return { id: open.id, mine: false };
      // ธงค้างจากโพรเซสที่ตายกลางทาง — ปิดเป็น EXPIRED (เก็บแถวไว้ให้ตรวจย้อนหลัง) แล้วจองใหม่ให้คนที่กดตอนนี้
      await tx.aiProposal.updateMany({ where: { id: open.id, tenantId: ctx.tenantId, status: "PENDING" }, data: { status: "EXPIRED", resultNote: "STALE" } });
    }
    const created = await tx.aiProposal.create({
      data: {
        tenantId: ctx.tenantId,
        conversationId: convOf(row.id),
        kind: CALL_AI_PROPOSAL_KIND,
        risk: "NORMAL",
        summary: "ผู้ช่วย AI ถอดเสียงและสรุปสายนี้ — ตรวจแล้วกดบันทึกลงกิจกรรม",
        payload: { activityId: row.id, systemId: ctx.systemId, transcript: "", aiSummary: "", aiNextStep: "" } satisfies ProposalPayload,
        // เครื่องหมาย "กำลังทำ" + เวลาที่จอง (ตัวเลขล้วน) — กดรับไม่ได้จนกว่าเนื้อจะมา · ค้างเกิน 15 นาที = ปล่อยให้จองใหม่
        resultNote: workingMark(),
        expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
      },
      select: { id: true },
    });
    return { id: created.id, mine: true };
  });
  if (!claim.mine) return { proposalId: claim.id, reused: true };

  try {
    const stt = await transcriber.transcribe({
      tenantId: ctx.tenantId,
      activityId: row.id,
      fileId: asset.id,
      mime: asset.contentType,
      open: async () => {
        const r = await openStoredFile(asset.path, ctx.tenantId);
        if (!r.ok) return null;
        if (r.bytes) return r.bytes;
        return r.body ? new Uint8Array(await new Response(r.body).arrayBuffer()) : null;
      },
    });
    const transcript = String(stt?.text ?? "").slice(0, 100_000);
    if (!transcript.trim()) throw fail("CONFLICT", "ถอดเสียงไม่ได้ข้อความจากไฟล์นี้ — ลองไฟล์ที่เสียงชัดกว่าเดิม");
    // AUDIT-CLASS X8: prompt ที่ออกไปนอกเครื่องถูกปิดเบอร์/อีเมลแล้ว
    const reply = await ai.chat(
      [
        { role: "system", content: SUMMARY_PROMPT },
        { role: "user", content: redactContactInfo(transcript).slice(0, 24_000) },
      ],
      { maxTokens: 700 },
    );
    const parsed = jsonOf(reply?.text);
    const aiSummary = field(parsed, "summary", 4000);
    const aiNextStep = field(parsed, "nextStep", 1000);
    // เขียนเนื้อลงใบเดิม **เฉพาะเมื่อยังเป็น PENDING** (ธงอาจถูกปล่อยเพราะค้างนานเกิน ⇒ ห้ามเขียนทับใบที่ปิดไปแล้ว)
    const applied = await prisma.aiProposal.updateMany({
      where: { id: claim.id, tenantId: ctx.tenantId, status: "PENDING" },
      data: { payload: { activityId: row.id, systemId: ctx.systemId, transcript, aiSummary, aiNextStep } satisfies ProposalPayload, resultNote: null },
    });
    // หักเครดิตครั้งเดียวต่อข้อเสนอ · note = id ล้วน (X8) · source `CRM_ASSIST` (มติผู้คุมงาน R2 · enum มาจาก C2.0)
    //   ค่าใช้จ่ายรวม = ค่าถอดเสียงของผู้ให้บริการ STT (`costMicroUsd` ของอะแดปเตอร์) + ค่าโมเดลสรุป — แถวเดียว บิลใบเดียว
    const sttMicro = Math.max(0, Math.round(Number(stt?.costMicroUsd ?? 0)));
    await chargeUsageSafe(
      { tenantId: ctx.tenantId },
      {
        source: "CRM_ASSIST",
        model: String(reply?.model ?? "unknown"),
        tokensIn: Number(reply?.tokensIn ?? 0) + Math.max(0, Math.round(Number(stt?.tokensIn ?? 0))),
        tokensOut: Number(reply?.tokensOut ?? 0) + Math.max(0, Math.round(Number(stt?.tokensOut ?? 0))),
        ...(sttMicro > 0 ? { extraMicroUsd: sttMicro } : {}),
        ...(ctx.actorUserId ? { userId: ctx.actorUserId } : {}),
        note: `crm.call.transcribe#${row.id}`,
      },
    );
    await audit(ctx, "crm.activity.ai_request", row.id, { after: { proposalId: claim.id, transcriptChars: transcript.length, hasSummary: !!aiSummary, hasNextStep: !!aiNextStep, sttMicro } });
    if (applied.count !== 1) {
      // ธงถูกปล่อย/ปิดไปก่อนที่งานจะเสร็จ (โพรเซสนี้ช้ากว่า 15 นาที) — ผู้ให้บริการเก็บเงินไปแล้วจึงต้องลงบิล
      //   แต่ผลใช้ไม่ได้ ⇒ บอกตรง ๆ ให้กดใหม่ (AUDIT-CLASS X8: log ไม่มีข้อความถอดเสียง)
      await logOps("WARN", "crm.call.transcribe", "ผลถอดเสียงมาถึงหลังธงถูกปล่อย — ไม่ได้ใช้ผลรอบนี้", { tenantId: ctx.tenantId, detail: `proposal:${claim.id} activity:${row.id}` });
      throw fail("CONFLICT", "งานถอดเสียงรอบนี้ใช้เวลานานเกินไป ระบบจึงยกเลิกให้แล้ว — กดถอดเสียงอีกครั้งได้เลย");
    }
    return { proposalId: claim.id, reused: false };
  } catch (e) {
    // ธงต้องหายไปด้วย ไม่งั้นกดใหม่ไม่ได้ตลอดกาล (ยังไม่ได้หักเครดิต ⇒ ลบทิ้งได้)
    await prisma.aiProposal.deleteMany({ where: { id: claim.id, tenantId: ctx.tenantId, status: "PENDING" } }).catch(() => null);
    throw e;
  }
}

/** ข้อเสนอที่ยังรออยู่ของสายนี้ (การ์ดผู้ช่วย AI ในโมดัล) — ไม่มี = null */
export async function pendingCallAiProposal(ctx: CallsCtx, actor: MemberActor, activityId: string): Promise<CallAiProposalView | null> {
  const { a } = await enter(ctx, actor);
  const row = await loadActivity(ctx, a, activityId);
  const p = await prisma.aiProposal.findFirst({
    where: { tenantId: ctx.tenantId, kind: CALL_AI_PROPOSAL_KIND, conversationId: convOf(row.id), status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  const payload = p ? payloadOf(p.payload) : null;
  if (!p || !payload || payload.systemId !== ctx.systemId) return null;
  // ยังถอดเสียงอยู่ = ไม่มีเนื้อให้ตรวจ ⇒ บอกหน้าจอให้รอ (ห้ามให้กดรับค่าว่างทับของเดิม)
  if (!payloadFilled(payload)) {
    return { proposalId: p.id, transcript: "", aiSummary: "", aiNextStep: "", working: true, message: CRM_CALL_AI_WORKING_MSG };
  }
  return { proposalId: p.id, transcript: payload.transcript, aiSummary: payload.aiSummary, aiNextStep: payload.aiNextStep, working: false };
}

/** AUDIT-CLASS X1: ข้อเสนอของร้าน/ระบบนี้เท่านั้น — ของที่อื่น = NOT_FOUND (ไม่บอกว่ามีอยู่) */
async function loadProposal(ctx: CallsCtx, proposalId: unknown, kind: string): Promise<{ id: string; payload: unknown }> {
  const id = str(proposalId);
  const p = id ? await prisma.aiProposal.findFirst({ where: { id, tenantId: ctx.tenantId, kind } }) : null;
  if (!p) throw fail("NOT_FOUND", PROPOSAL_NOT_FOUND);
  return { id: p.id, payload: p.payload };
}

/**
 * รับข้อเสนอ ⇒ เขียน `transcript` / `aiSummary` / `aiNextStep` ลงกิจกรรม (ค่าที่พนักงานแก้ชนะค่าของ AI)
 * AUDIT-CLASS X3: จอง PENDING→EXECUTED แบบอะตอมมิก (`updateMany … status PENDING`) ⇒ กด 10 ครั้งพร้อมกัน = สำเร็จ 1 · CONFLICT 9
 */
export async function acceptCallAiProposal(
  ctx: CallsCtx,
  actor: MemberActor,
  proposalId: string,
  edits?: { transcript?: string | null; aiSummary?: string | null; aiNextStep?: string | null } | null,
): Promise<ActivityDto> {
  const { a } = await enter(ctx, actor);
  const p = await loadProposal(ctx, proposalId, CALL_AI_PROPOSAL_KIND);
  const payload = payloadOf(p.payload);
  if (!payload || payload.systemId !== ctx.systemId) throw fail("NOT_FOUND", PROPOSAL_NOT_FOUND);
  // 🔴 ยังถอดเสียงอยู่ (payload ว่าง) = กดรับไม่ได้ — ไม่งั้นค่าว่างจะทับ transcript/สรุปของเดิมเป็น NULL
  //    และผลจริงที่มาทีหลังจะตกใส่ใบที่ EXECUTED แล้ว (จ่ายค่า AI ไปฟรี ๆ)
  if (!payloadFilled(payload)) throw fail("CONFLICT", CRM_CALL_AI_WORKING_MSG);
  const row = await loadActivity(ctx, a, payload.activityId);
  need(a, "crm.activity.create");
  const claim = await prisma.aiProposal.updateMany({ where: { id: p.id, tenantId: ctx.tenantId, status: "PENDING" }, data: { status: "EXECUTED", executedAt: new Date() } });
  if (claim.count !== 1) throw fail("CONFLICT", PROPOSAL_TAKEN);
  /**
   * ค่าที่จะลงแถว: ค่าที่พนักงานแก้ชนะ → ค่าของ AI → **ค่าเดิมในแถว**
   * 🔴 ห้าม "ลดเกรด" ช่องที่มีค่าอยู่แล้วให้เป็น NULL: ใบที่สรุปไม่ออก (aiSummary ว่าง) ต้องไม่ล้างสรุปที่คนเขียนไว้ก่อน
   */
  const pick = (edit: unknown, fromAi: string, current: string | null): string | null => {
    const e = typeof edit === "string" ? edit.trim() : null;
    const v = (e !== null ? e : fromAi).trim();
    return v ? v.slice(0, 100_000) : current;
  };
  await prisma.crmActivity.updateMany({
    where: { id: row.id, tenantId: ctx.tenantId, systemId: ctx.systemId },
    data: {
      transcript: pick(edits?.transcript, payload.transcript, row.transcript),
      aiSummary: pick(edits?.aiSummary, payload.aiSummary, row.aiSummary),
      aiNextStep: pick(edits?.aiNextStep, payload.aiNextStep, row.aiNextStep),
    },
  });
  // AUDIT-CLASS X8: ประวัติเก็บแค่ "ใบไหน แก้ช่องไหน ยาวเท่าไร" — ไม่เก็บข้อความถอดเสียง
  await audit(ctx, "crm.activity.ai_accept", row.id, {
    after: { proposalId: p.id, edited: { transcript: typeof edits?.transcript === "string", aiSummary: typeof edits?.aiSummary === "string", aiNextStep: typeof edits?.aiNextStep === "string" } },
  });
  const fresh = await prisma.crmActivity.findFirst({ where: { id: row.id, tenantId: ctx.tenantId } });
  return activities.toActivityDto(fresh ?? row);
}

/** ปฏิเสธข้อเสนอ ⇒ REJECTED · ช่องของกิจกรรมไม่ถูกแตะเลย */
export async function rejectCallAiProposal(ctx: CallsCtx, actor: MemberActor, proposalId: string): Promise<{ ok: true }> {
  const { a } = await enter(ctx, actor);
  const p = await loadProposal(ctx, proposalId, CALL_AI_PROPOSAL_KIND);
  const payload = payloadOf(p.payload);
  if (!payload || payload.systemId !== ctx.systemId) throw fail("NOT_FOUND", PROPOSAL_NOT_FOUND);
  // ยังถอดเสียงอยู่ = ยังไม่มีผลให้ปฏิเสธ (และถ้าปิดใบตอนนี้ ผลที่มาทีหลังจะตกใส่ใบที่ปิดแล้ว)
  if (!payloadFilled(payload)) throw fail("CONFLICT", CRM_CALL_AI_WORKING_MSG);
  const row = await loadActivity(ctx, a, payload.activityId);
  need(a, "crm.activity.create");
  const claim = await prisma.aiProposal.updateMany({ where: { id: p.id, tenantId: ctx.tenantId, status: "PENDING" }, data: { status: "REJECTED" } });
  if (claim.count !== 1) throw fail("CONFLICT", PROPOSAL_TAKEN);
  await audit(ctx, "crm.activity.ai_reject", row.id, { after: { proposalId: p.id, rejected: true } });
  return { ok: true };
}

// ═════════════════════════ นามบัตร (vision) → ข้อเสนอ lead ═════════════════════════

/**
 * อ่านนามบัตรด้วยโมเดล vision → **ข้อเสนอ** `crm_create_lead` ของระบบนี้ (ยังไม่สร้างผู้ติดต่อ)
 * AUDIT-CLASS X6: ชนิดรูป ∈ jpeg/png/webp/heic(heif) · ขนาด ≤ 5 MB · ไม่รับ SVG (สคริปต์ฝังได้)
 * AUDIT-CLASS X10: รูป **ไม่ถูกเก็บ** และไปถึงโมเดลเป็น `data:` URL เท่านั้น — ไม่มี URL ของ CDN/ที่เก็บเกิดขึ้นเลย
 */
export async function scanBusinessCard(
  ctx: CallsCtx,
  actor: MemberActor,
  input: { filename?: string | null; contentType: string; data: Uint8Array },
  deps?: { ai?: AiProvider },
): Promise<{ proposalId: string; draft: CardDraft }> {
  const { a } = await enter(ctx, actor);
  need(a, "crm.contact.create");
  if (!isObj(input) || !(input.data instanceof Uint8Array) || input.data.length === 0) {
    throw fail("VALIDATION", "ยังไม่ได้เลือกรูปนามบัตร — ถ่ายรูปหรือเลือกไฟล์แล้วลองอีกครั้ง");
  }
  if (input.data.length > CRM_CARD_MAX_BYTES) throw fail("VALIDATION", `รูปนามบัตรใหญ่เกิน ${mbOf(CRM_CARD_MAX_BYTES)} MB — ถ่ายใหม่ด้วยความละเอียดต่ำลงหรือย่อรูปก่อน`);
  const mime = normalizeUploadType(input.contentType);
  if (!CRM_CARD_MIME_ALLOWLIST.includes(mime)) throw fail("VALIDATION", "ไฟล์นี้ไม่ใช่รูปที่ระบบอ่านได้ — รองรับ JPG · PNG · WEBP · HEIC");
  // 🔴 N19: ลำดับเดียวกับฝั่งถอดเสียง (มติข้อ 5) — "ระบบยังไม่ได้ตั้งค่า" (NOT_CONFIGURED) มาก่อน "ร้านไม่มีเครดิต" (NO_CREDIT)
  //    ร้านที่ยังไม่มีโมเดลจะได้คำตอบที่แก้ได้จริง (ให้ผู้ดูแลตั้งค่า) ไม่ใช่ให้ไปเติมเงินทั้งที่เติมแล้วก็ยังใช้ไม่ได้
  const ai = deps?.ai ?? resolveProvider();
  if (!ai) throw fail("NOT_CONFIGURED", "ยังไม่ได้ตั้งค่าผู้ช่วย AI ของระบบ — ขอให้ผู้ดูแลระบบตั้งค่าก่อน แล้วกดอ่านนามบัตรอีกครั้ง");
  if (!(await canSpend(ctx.tenantId))) throw fail("NO_CREDIT", "เครดิตผู้ช่วย AI หมดแล้ว — เติมเครดิตที่ ตั้งค่า → เครดิต AI แล้วอ่านนามบัตรได้ทันที");
  // 🔴 `data:` URL เท่านั้น — รูปไม่เคยถูกอัปโหลด ไม่เคยมีที่อยู่ถาวร
  const dataUrl = `data:${mime};base64,${Buffer.from(input.data).toString("base64")}`;
  const reply = await ai.chat([{ role: "user", content: CARD_PROMPT, imageUrls: [dataUrl] }], { maxTokens: 500 });
  const parsed = jsonOf(reply?.text);
  const draft: CardDraft = {
    name: field(parsed, "name", 200),
    phone: field(parsed, "phone", 40),
    email: field(parsed, "email", 200),
    company: field(parsed, "company", 200),
    jobTitle: field(parsed, "jobTitle", 120),
  };
  const created = await prisma.aiProposal.create({
    data: {
      tenantId: ctx.tenantId,
      conversationId: `crm:card:${ctx.systemId}`,
      kind: LEAD_PROPOSAL_KIND,
      risk: "NORMAL",
      summary: "ผู้ช่วย AI อ่านนามบัตรแล้ว — ตรวจข้อมูลก่อนเพิ่มเป็นผู้ติดต่อใหม่",
      payload: { systemId: ctx.systemId, ...draft },
      expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
    },
    select: { id: true },
  });
  await chargeUsageSafe(
    { tenantId: ctx.tenantId },
    {
      source: "CRM_ASSIST",
      model: String(reply?.model ?? "unknown"),
      tokensIn: Number(reply?.tokensIn ?? 0),
      tokensOut: Number(reply?.tokensOut ?? 0),
      ...(ctx.actorUserId ? { userId: ctx.actorUserId } : {}),
      note: `crm.card.scan#${created.id}`,
    },
  );
  return { proposalId: created.id, draft };
}

/**
 * รับข้อเสนอจากนามบัตร ⇒ ผู้ติดต่อใหม่ใน **ระบบนี้** (ข้อเสนอของระบบอื่น = NOT_FOUND · มติผู้คุมงาน C2.4 ข้อ 6)
 * AUDIT-CLASS X3: จอง PENDING→EXECUTED ก่อนลงมือ ⇒ กดสองครั้ง = ผู้ติดต่อใบเดียว (ครั้งที่สอง CONFLICT)
 * 🔴 `force: true` โดยเจตนา: คนอ่านนามบัตรแล้วกดยอมรับเอง — ถ้าไปชนคนซ้ำ CRM มีหน้า "ผู้ติดต่อที่น่าจะซ้ำ" ให้รวมทีหลัง
 *    (พฤติกรรมเดียวกับ lead จากฟอร์ม/เครื่องมือ AI เดิม) ดีกว่าการเงียบแล้วไม่สร้างอะไรให้เลย
 */
export async function acceptLeadProposal(ctx: CallsCtx, actor: MemberActor, proposalId: string): Promise<{ contactId: string }> {
  const { a } = await enter(ctx, actor);
  need(a, "crm.contact.create");
  const p = await loadProposal(ctx, proposalId, LEAD_PROPOSAL_KIND);
  const payload = isObj(p.payload) ? p.payload : {};
  if (str(payload.systemId) !== ctx.systemId) throw fail("NOT_FOUND", PROPOSAL_NOT_FOUND);
  const claim = await prisma.aiProposal.updateMany({ where: { id: p.id, tenantId: ctx.tenantId, status: "PENDING" }, data: { status: "EXECUTED", executedAt: new Date() } });
  if (claim.count !== 1) throw fail("CONFLICT", PROPOSAL_TAKEN);
  const full = (str(payload.name) ?? "ผู้ติดต่อจากนามบัตร").replace(/\s+/g, " ");
  const at = full.indexOf(" ");
  try {
    const contacts = await import("./contacts");
    const res = await contacts.createContact(ctx, a, {
      firstName: at < 0 ? full : full.slice(0, at),
      lastName: at < 0 ? null : full.slice(at + 1) || null,
      phone: str(payload.phone),
      email: str(payload.email),
      jobTitle: str(payload.jobTitle),
      sourceKind: "OTHER",
      // 🔴 ไม่ตั้ง `sourceChannel`: ช่องนั้นรับได้เฉพาะคีย์ในทะเบียนช่องทางของระบบ (EMAIL/LINE/…) — "นามบัตร" ไม่ใช่ช่องทางสื่อสาร
      //    ที่มาที่แท้จริงถูกเก็บใน `sourceDetail.via` ซึ่งเป็นช่องอิสระอยู่แล้ว
      sourceDetail: { via: "card-scan", proposalId: p.id },
      force: true,
    });
    await prisma.aiProposal.update({ where: { id: p.id }, data: { resultNote: `เพิ่มผู้ติดต่อแล้ว (${res.contact.id})` } });
    return { contactId: res.contact.id };
  } catch (e) {
    /**
     * 🔴 F9 (รอบ 2): ใบที่ล้มต้อง "ลองใหม่ได้" — ของเดิมตั้ง FAILED ทุกกรณี ⇒ ใบนั้นตายถาวร: กดอีกครั้งได้ CONFLICT
     *    (คำสั่งจอง `status PENDING` ไม่เจอแถวแล้ว) ทั้งที่สาเหตุมักเป็นเรื่องชั่วคราวของระบบ (ฐานสะดุด · ประตู v2 ถูกปิดคาไว้
     *    ระหว่างที่พนักงานยังถือการ์ดอยู่) และค่า AI ก็จ่ายไปแล้ว
     *    ⇒ **คืนใบเป็น PENDING เสมอ** พร้อมเหตุใน `resultNote` (ข้อความระบบ ไม่มี PII) แล้วโยน error ให้หน้าจอบอกผู้ใช้
     * 🔴 ทำไมไม่แยก "ผิดถาวร (VALIDATION) = FAILED": รหัสที่ได้จากชั้นล่างเชื่อไม่ได้ — `crm/contacts.ts#mapError` แปลง
     *    Error ธรรมดาที่ข้อความเป็นภาษาไทย (รวมถึงความผิดพลาดของฐาน/โครงสร้าง) เป็น VALIDATION ⇒ เกณฑ์นั้นจะฆ่าใบที่
     *    ลองใหม่ได้จริง ๆ · ใบที่ร่างเสียจริงมีทางออกของคนอยู่แล้ว: ปุ่ม "ทิ้งผลนี้" (`rejectLeadProposal`) ซึ่งปิดใบ + ล้าง PII
     */
    const note = e instanceof Error ? e.message.slice(0, 400) : "เพิ่มผู้ติดต่อไม่สำเร็จ";
    await prisma.aiProposal
      .updateMany({ where: { id: p.id, tenantId: ctx.tenantId }, data: { status: "PENDING", executedAt: null, resultNote: note } })
      .catch(() => null);
    throw mapError(e);
  }
}

/**
 * ปฏิเสธข้อเสนอจากนามบัตร (ปุ่ม "ทิ้งผลนี้") ⇒ PENDING→REJECTED **และล้างข้อมูลส่วนบุคคลออกจากแถว**
 * 🔴 ทำไมต้องมีปุ่มนี้จริง ๆ ไม่ใช่ปิดการ์ดในหน้าจอ: ร่างนามบัตรถือ ชื่อ · เบอร์ · อีเมล ของคนจริง
 *    ถ้าหน้าจอแค่ "ลืม" ใบนั้น แถว `AiProposal` ยังนอนอยู่กับ PII อีก 24 ชั่วโมงโดยไม่มีใครใช้ ⇒ เก็บข้อมูลเกินจำเป็น
 *    ⇒ กดทิ้ง = ปิดสถานะ + payload เหลือแค่ `systemId` (ตรวจย้อนหลังได้ว่า "มีใบและถูกทิ้ง" โดยไม่เก็บตัวคน)
 * AUDIT-CLASS X1: ใบของร้าน/ระบบอื่น = NOT_FOUND · AUDIT-CLASS X3: จอง PENDING→REJECTED แบบอะตอมมิก (กดซ้ำ = CONFLICT)
 */
export async function rejectLeadProposal(ctx: CallsCtx, actor: MemberActor, proposalId: string): Promise<{ ok: true }> {
  const { a } = await enter(ctx, actor);
  need(a, "crm.contact.create");
  const p = await loadProposal(ctx, proposalId, LEAD_PROPOSAL_KIND);
  const payload = isObj(p.payload) ? p.payload : {};
  if (str(payload.systemId) !== ctx.systemId) throw fail("NOT_FOUND", PROPOSAL_NOT_FOUND);
  const claim = await prisma.aiProposal.updateMany({
    where: { id: p.id, tenantId: ctx.tenantId, status: "PENDING" },
    // AUDIT-CLASS X8: payload ที่เหลือมีแค่ id ของระบบ — ชื่อ/เบอร์/อีเมลบนนามบัตรหายไปพร้อมการกดทิ้ง
    data: { status: "REJECTED", payload: { systemId: ctx.systemId }, resultNote: "ทิ้งผลนี้" },
  });
  if (claim.count !== 1) throw fail("CONFLICT", PROPOSAL_TAKEN);
  // ประวัติชี้ไปที่ "ใบข้อเสนอ" (ไม่ใช่กิจกรรม) — ไม่มีชื่อ/เบอร์/อีเมลในนั้นเลย (X8)
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? null,
    actorType: ctx.actorUserId ? "USER" : "SYSTEM",
    action: "crm.contact.card_reject",
    targetType: "AiProposal",
    targetId: p.id,
    after: { proposalId: p.id, rejected: true, piiCleared: true },
  });
  return { ok: true };
}

// ═════════════════════════ R-A: ปุ่ม "จองผ่านระบบจองคิว" ═════════════════════════

/**
 * ลิงก์ไปหน้าจองคิวของร้าน พร้อม `partyId` ของผู้ติดต่อ — ร้านที่ไม่มีสาขาชนิด BOOKING ที่ใช้งานอยู่ = `null`
 * AUDIT-CLASS X8: URL มีแต่ `partyId` (id ล้วน) — ไม่มีชื่อ เบอร์ หรืออีเมลอยู่ใน query string (ลิงก์ถูกแชร์/ลง log ได้)
 */
export async function bookingLinkFor(ctx: CallsCtx, actor: MemberActor, input: { contactId: string }): Promise<{ href: string } | null> {
  const { a } = await enter(ctx, actor);
  const id = str(input?.contactId);
  const contact = id ? await prisma.crmContact.findFirst({ where: { AND: [await contactWhere(ctx, a), { id }] }, select: { id: true, partyId: true } }) : null;
  if (!contact) throw fail("NOT_FOUND", CONTACT_NOT_FOUND);
  if (!contact.partyId) return null;
  const unit = await prisma.businessUnit.findFirst({
    where: { tenantId: ctx.tenantId, type: "BOOKING", status: "ACTIVE" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { slug: true },
  });
  if (!unit) return null;
  return { href: `/app/u/${encodeURIComponent(unit.slug)}/booking?partyId=${encodeURIComponent(contact.partyId)}` };
}

// ═════════════════════════ R-A: กวาดไฟล์เสียงที่หมดอายุเก็บ ═════════════════════════

/**
 * ลบไฟล์เสียง (และข้อความถอดเสียง) ของสายที่เก่ากว่า `settings.crm.retention.recordingDays` (ปริยาย 730 วัน) — **แถวกิจกรรมยังอยู่**
 * 🔴 R-A: ใบ C2.10 เป็นคนลงทะเบียนเป็นงานรายวัน · ใบนี้เป็นเจ้าของตรรกะ
 * 🔴 R-E.14: ระบบที่ยัง uiVersion 1 ถูกข้าม (ไม่มีงานเบื้องหลังของ v2 แตะร้านที่ยังไม่เปิด)
 * AUDIT-CLASS X4: ทำซ้ำได้ — `recordingFileId` ถูกล้างแบบมีเงื่อนไข ⇒ รอบถัดไปไม่เจอแถวเดิมอีก
 */
export async function purgeRecordings(now: Date, opts?: { tenantIds?: string[]; deps?: CallStoreDeps; limit?: number }): Promise<{ purged: number }> {
  const at = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const tenantIds = Array.isArray(opts?.tenantIds) ? opts!.tenantIds.filter((x): x is string => typeof x === "string" && !!x) : null;
  const limit = Math.min(Math.max(opts?.limit ?? 500, 1), 5000);
  const systems = await prisma.appSystem.findMany({
    where: { type: "CRM", ...(tenantIds ? { tenantId: { in: tenantIds } } : {}) },
    select: { id: true, tenantId: true, settings: true },
    orderBy: { id: "asc" },
  });
  let purged = 0;
  for (const sys of systems) {
    if (parseCrmSettings(sys.settings).uiVersion !== 2) continue;
    const days = crmRecordingDaysOf(sys.settings, CRM_RECORDING_DAYS_DEFAULT);
    const cutoff = new Date(at.getTime() - days * DAY_MS);
    const rows = await prisma.crmActivity.findMany({
      where: {
        tenantId: sys.tenantId,
        systemId: sys.id,
        type: "CALL",
        recordingFileId: { not: null },
        OR: [{ startAt: { lt: cutoff } }, { startAt: null, createdAt: { lt: cutoff } }],
      },
      select: { id: true, recordingFileId: true },
      orderBy: { id: "asc" },
      take: limit,
    });
    for (const row of rows) {
      const fileId = row.recordingFileId;
      if (!fileId) continue;
      const del = await deleteFileAsset({ tenantId: sys.tenantId }, fileId, opts?.deps?.del ? { del: opts.deps.del } : undefined).catch(() => ({ ok: false as const, reason: "throw" }));
      if (!del.ok) continue; // ที่เก็บล่ม = คงแถวไว้ให้รอบหน้าทำต่อ (ห้ามล้างช่องแล้วทิ้งไฟล์กำพร้า)
      const cleared = await prisma.crmActivity.updateMany({ where: { id: row.id, tenantId: sys.tenantId, recordingFileId: fileId }, data: { recordingFileId: null, transcript: null } });
      if (cleared.count === 1) purged += 1;
    }
  }
  return { purged };
}
