// etax-ts.ts — ACC T5.4 (เลน 2) ▸ e-Tax Invoice by Time Stamp (ไม่มีผู้ให้บริการ) — ปิด B17
//
//   ส่งใบกำกับภาษี/ใบเพิ่มหนี้/ใบลดหนี้ที่ออกแล้ว: PDF 1 ใบ = 1 ไฟล์ (etax-pdf.ts) · อีเมล 1 ฉบับ ถึงผู้ซื้อ 1 ที่อยู่ + สำเนาถึงระบบประทับเวลา "ในคราวเดียวกัน"
//   หัวเรื่องตามประกาศ ข้อ 9 · สถานะบนเอกสารคำนวณจากความพยายามล่าสุด (AccountEtaxSubmission) · ไฟล์ที่ส่ง/ไฟล์ประทับเวลาเก็บไบต์ + sha256 (AccountEtaxFile)
//   🔴 ไม่บล็อกด้วยเหตุผลกฎหมาย: ยังไม่ยืนยันสิทธิ / ไม่จด VAT = คำเตือนที่ต้องกดยืนยัน · ผู้ซื้อไม่มีอีเมล/เลข = แจ้งให้ทราบ
//   🔴 ส่งจริงผ่าน etax-transport.ts เท่านั้น (นอก production = CAPTURE ไม่ยิงเครือข่าย)
// design note: ledger/wo-notes/T5.4.md
import { createHash } from "node:crypto";
import type { AccountDocType, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { recordLegalAckInTx } from "@/lib/core/legal-ack";
import { ACCOUNT_SETTING_KEYS } from "@/lib/core/settings/defs/account";
import { resolveBookSettings, setSettings } from "@/lib/core/settings/service";
import type { SettingsActor } from "@/lib/core/settings/types";
import {
  ETAX_TS_ELIGIBILITY,
  ETAX_TS_SUBJECT_DATE_FORMATS,
  SYSTEM_ETAX_TS_ROWS,
  etaxTsRow,
  type EtaxTsEligibility,
  type EtaxTsRow,
  type EtaxTsSubjectDateFormat,
} from "@/lib/core/settings/legal/th-tax-2569";
import { LEGAL_ACK_REQUIRED, legalWarning, unacknowledged, type LegalAck, type LegalAckRequired, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { accountNow } from "./clock";
import { inspectEtaxPdf, pdfkitEtaxGenerator, PDF_CONFORMANCE_NOTE, type EtaxPdfGenerator } from "./etax-pdf";
import { etaxTransport } from "./etax-transport";
import { bkkYmd, type BookCtx } from "./legal-values";
import { getPolicy } from "./policy";
import { loadPrintView } from "./print-view";
import { runAccountTx } from "./gl";
import { lockDocumentRow } from "./service";

// ═══════════════════ ชนิดเอกสาร · หัวเรื่อง · ชื่อไฟล์ (pure) ═══════════════════

/** ประกาศ ข้อ 5 ข้อ 8 [V]: ใบกำกับภาษีเต็มรูป · ใบเพิ่มหนี้ · ใบลดหนี้ — ไม่รวมใบรับ */
export const ETAX_TS_DOC_TYPES: readonly AccountDocType[] = ["TAX_INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"];
export type EtaxSubjectKind = "INV" | "DBN" | "CRN" | "INV_REPLACE";
export type EtaxState = "NOT_SENT" | "QUEUED" | "SENT" | "STAMPED" | "FAILED";
export const ETAX_STATE_LABEL_TH: Record<EtaxState, string> = {
  NOT_SENT: "ยังไม่ส่ง",
  QUEUED: "รอส่ง",
  SENT: "ส่งแล้ว รอไฟล์ประทับเวลา",
  STAMPED: "ได้ไฟล์ประทับเวลาแล้ว",
  FAILED: "ส่งไม่สำเร็จ",
};
const DEAD = ["DRAFT", "VOIDED", "CANCELLED", "REJECTED"];

/** วันที่ในหัวเรื่อง — DDMMYYYY (พ.ศ. ตามตัวอย่างในคู่มือ หรือ ค.ศ. ตามค่าตั้ง) */
export function etaxDateToken(ymd: string, fmt: EtaxTsSubjectDateFormat): string {
  const [y, m, d] = ymd.split("-");
  return `${d}${m}${fmt === "DDMMYYYY_BE" ? Number(y) + 543 : y}`;
}

/** ประกาศ ข้อ 9 + คู่มือ 5.2 ข้อ 5 [V]: วงเล็บ [ ] ไม่เว้นวรรค */
export function etaxSubject(kind: EtaxSubjectKind, issueYmd: string, docNo: string, origNo: string | null, fmt: EtaxTsSubjectDateFormat): string {
  const clean = (s: string) => s.replace(/[[\]\r\n]/g, "").replace(/\s+/g, "");
  const parts = [etaxDateToken(issueYmd, fmt), kind === "INV_REPLACE" ? "INV" : kind, clean(docNo)];
  if (kind !== "INV") parts.push(clean(origNo ?? ""));
  return parts.map((p) => `[${p}]`).join("");
}

/** ชื่อไฟล์แนบ — skill/คู่มือไม่กำหนด ⇒ ค่าเริ่มต้นระบบ `<เลขที่>.pdf` (ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้) */
export function etaxAttachmentName(docNo: string): string {
  const base = docNo.replace(/[\\/:*?"<>|\r\n\t]/g, "-").replace(/\s+/g, "").slice(0, 80) || "tax-invoice";
  return `${base}.pdf`;
}

// ═══════════════════ ค่าตั้ง ═══════════════════

export type EtaxTsSettings = {
  enabled: boolean;
  autoOnIssue: boolean;
  senderEmail: string;
  /** ที่อยู่สำเนาถึงที่ใช้จริง (ค่าร้าน หรือแถวตาราง) */
  ccAddress: string;
  ccSource: "SHOP" | "TABLE";
  subjectDateFormat: EtaxTsSubjectDateFormat;
  eligibility: EtaxTsEligibility;
  maxBytes: number;
  rows: readonly EtaxTsRow[];
  warnings: LegalWarning[];
  vatRegistered: boolean;
  /** ช่องทางส่งที่ระบบจะใช้ (CAPTURE = นอก production ไม่ยิงจริง) */
  transport: string;
};

const K = ACCOUNT_SETTING_KEYS;
const KEYS = [K.etaxTsEnabled, K.etaxTsAutoOnIssue, K.etaxTsSenderEmail, K.etaxTsCcAddress, K.etaxTsSubjectDateFormat, K.etaxTsEligibility];

export async function etaxTsSettings(ctx: BookCtx): Promise<EtaxTsSettings> {
  const [r, policy] = await Promise.all([resolveBookSettings({ tenantId: ctx.tenantId }, KEYS, ctx.systemId), getPolicy(ctx)]);
  const str = (k: string) => (typeof r[k]?.value === "string" ? (r[k]!.value as string).trim() : "");
  const tableCc = String(etaxTsRow("ETAX_TS_CC_ADDRESS").value);
  const shopCc = str(K.etaxTsCcAddress);
  const fmtRaw = str(K.etaxTsSubjectDateFormat);
  const fmt = (ETAX_TS_SUBJECT_DATE_FORMATS as readonly string[]).includes(fmtRaw) ? (fmtRaw as EtaxTsSubjectDateFormat) : "DDMMYYYY_BE";
  const elRaw = str(K.etaxTsEligibility);
  const warnings: LegalWarning[] = [];
  const cite = (row: EtaxTsRow) => ({ citation: row.source });
  if (shopCc && shopCc.toLowerCase() !== tableCc.toLowerCase())
    warnings.push(legalWarning("SHOP_DIFFERS_FROM_DEFAULT", { shop: `${etaxTsRow("ETAX_TS_CC_ADDRESS").labelTh}: ${shopCc}`, system: tableCc }, cite(etaxTsRow("ETAX_TS_CC_ADDRESS"))));
  if (fmt !== etaxTsRow("ETAX_TS_SUBJECT_DATE").value)
    warnings.push(legalWarning("SHOP_DIFFERS_FROM_DEFAULT", { shop: `${etaxTsRow("ETAX_TS_SUBJECT_DATE").labelTh}: ${fmt === "DDMMYYYY_CE" ? "ค.ศ." : "พ.ศ."}`, system: "พ.ศ." }, cite(etaxTsRow("ETAX_TS_SUBJECT_DATE"))));
  return {
    enabled: r[K.etaxTsEnabled]?.value === true,
    autoOnIssue: r[K.etaxTsAutoOnIssue]?.value === true,
    senderEmail: str(K.etaxTsSenderEmail),
    ccAddress: shopCc || tableCc,
    ccSource: shopCc ? "SHOP" : "TABLE",
    subjectDateFormat: fmt,
    eligibility: (ETAX_TS_ELIGIBILITY as readonly string[]).includes(elRaw) ? (elRaw as EtaxTsEligibility) : "UNDECLARED",
    maxBytes: Number(etaxTsRow("ETAX_TS_MAX_BYTES").value),
    rows: SYSTEM_ETAX_TS_ROWS,
    warnings,
    vatRegistered: policy.vatRegistered,
    transport: etaxTransport().name,
  };
}

export type EtaxTsSettingsPatch = { enabled?: boolean; autoOnIssue?: boolean; senderEmail?: string; ccAddress?: string; subjectDateFormat?: EtaxTsSubjectDateFormat; eligibility?: EtaxTsEligibility };

export async function saveEtaxTsSettings(actor: SettingsActor, ctx: BookCtx, patch: EtaxTsSettingsPatch): Promise<{ ok: true; settings: EtaxTsSettings } | { ok: false; reason: string }> {
  const changes: { key: string; scope: string; scopeId: string; value: unknown }[] = [];
  const push = (key: string, value: unknown) => changes.push({ key, scope: "ACCOUNT_BOOK", scopeId: ctx.systemId, value });
  if (patch.enabled !== undefined) push(K.etaxTsEnabled, patch.enabled);
  if (patch.autoOnIssue !== undefined) push(K.etaxTsAutoOnIssue, patch.autoOnIssue);
  if (patch.senderEmail !== undefined) push(K.etaxTsSenderEmail, patch.senderEmail.trim());
  if (patch.ccAddress !== undefined) push(K.etaxTsCcAddress, patch.ccAddress.trim());
  if (patch.subjectDateFormat !== undefined) push(K.etaxTsSubjectDateFormat, patch.subjectDateFormat);
  if (patch.eligibility !== undefined) push(K.etaxTsEligibility, patch.eligibility);
  if (changes.length === 0) return { ok: false, reason: "ไม่มีค่าที่เปลี่ยน" };
  const res = await setSettings(actor, { tenantId: ctx.tenantId }, changes);
  if (!res.ok) return { ok: false, reason: res.issues.map((i) => i.messageTh).join(" · ") || "บันทึกไม่สำเร็จ" };
  return { ok: true, settings: await etaxTsSettings(ctx) };
}

// ═══════════════════ สถานะเอกสาร ═══════════════════

type DocRow = {
  id: string;
  docType: AccountDocType;
  direction: string;
  status: string;
  docNo: string | null;
  issueDate: Date;
  reference: string | null;
  sourceDocId: string | null;
  replacedById: string | null;
  contactSnapshot: Prisma.JsonValue;
  contact: { email: string | null; taxId: string | null } | null;
};

async function loadDoc(ctx: BookCtx, documentId: string): Promise<DocRow | null> {
  return tenantDb(ctx).accountDocument.findFirst({
    where: { id: documentId, systemId: ctx.systemId },
    select: { id: true, docType: true, direction: true, status: true, docNo: true, issueDate: true, reference: true, sourceDocId: true, replacedById: true, contactSnapshot: true, contact: { select: { email: true, taxId: true } } },
  });
}

const snapStr = (snap: Prisma.JsonValue, k: string) => (snap && typeof snap === "object" && !Array.isArray(snap) && typeof (snap as Record<string, unknown>)[k] === "string" ? ((snap as Record<string, unknown>)[k] as string).trim() : "");

export type EtaxAttemptView = {
  id: string;
  attemptNo: number;
  mode: string;
  status: string;
  statusLabel: string;
  subject: string;
  fromAddress: string;
  toAddress: string;
  ccAddress: string | null;
  attachmentName: string;
  attachmentBytes: number;
  pdfSha256: string;
  pdfFileId: string | null;
  pdfConformance: string;
  transport: string;
  error: string | null;
  stampedFileId: string | null;
  stampedSha256: string | null;
  stampedAt: Date | null;
  createdAt: Date;
  sentAt: Date | null;
};

export type EtaxDocState = {
  documentId: string;
  docType: AccountDocType;
  docNo: string | null;
  /** ชนิดนี้อยู่ในประกาศไหม (ใบกำกับ/ใบเพิ่มหนี้/ใบลดหนี้ ขาออก) */
  covered: boolean;
  /** เอกสารออกแล้วและยังมีผล */
  live: boolean;
  state: EtaxState;
  stateLabel: string;
  subjectKind: EtaxSubjectKind | null;
  subjectPreview: string | null;
  originalDocNo: string | null;
  buyerEmail: string;
  buyerTaxId: string;
  /** แจ้งให้ทราบ (ไม่บล็อก) */
  infos: LegalWarning[];
  /** ส่งได้ตอนนี้ (ค่าตั้งเปิด · มีอีเมลผู้ส่ง · ชนิดตรง · ใบยังมีผล) — เหตุถ้าไม่ได้ */
  canSend: boolean;
  blockedReason: string | null;
  attempts: EtaxAttemptView[];
  replacedByDocNo: string | null;
  settings: Pick<EtaxTsSettings, "enabled" | "senderEmail" | "ccAddress" | "eligibility" | "transport">;
};

const SUB_SELECT = {
  id: true, attemptNo: true, mode: true, status: true, subject: true, fromAddress: true, toAddress: true, ccAddress: true, attachmentName: true, attachmentBytes: true,
  pdfSha256: true, pdfFileId: true, pdfConformance: true, transport: true, error: true, stampedFileId: true, stampedSha256: true, stampedAt: true, createdAt: true, sentAt: true,
} as const;

/** สถานะเอกสาร = ความพยายามแบบ SEND/RESEND ล่าสุด (การส่งไฟล์ประทับเวลาซ้ำให้ผู้ซื้อไม่เปลี่ยนสถานะ) */
export function etaxStateOf(attempts: readonly { mode: string; status: string }[]): EtaxState {
  const main = attempts.filter((a) => a.mode !== "RESEND_STAMPED");
  if (main.some((a) => a.status === "STAMPED")) return "STAMPED";
  const last = main[0];
  return last ? (last.status as EtaxState) : "NOT_SENT";
}

async function subjectContext(ctx: BookCtx, d: DocRow): Promise<{ kind: EtaxSubjectKind; orig: { docNo: string | null; issueDate: Date } | null }> {
  const db = tenantDb(ctx);
  if (d.docType === "TAX_INVOICE") {
    const orig = await db.accountDocument.findFirst({ where: { systemId: ctx.systemId, replacedById: d.id }, select: { docNo: true, issueDate: true } });
    return orig ? { kind: "INV_REPLACE", orig } : { kind: "INV", orig: null };
  }
  const kind: EtaxSubjectKind = d.docType === "DEBIT_NOTE" ? "DBN" : "CRN";
  if (d.sourceDocId) {
    const src = await db.accountDocument.findFirst({ where: { id: d.sourceDocId, systemId: ctx.systemId }, select: { docNo: true, issueDate: true } });
    if (src) return { kind, orig: src };
  }
  return { kind, orig: d.reference?.trim() ? { docNo: d.reference.trim(), issueDate: d.issueDate } : null };
}

export async function etaxDocState(ctx: BookCtx, documentId: string): Promise<EtaxDocState | null> {
  const db = tenantDb(ctx);
  const [d, settings] = await Promise.all([loadDoc(ctx, documentId), etaxTsSettings(ctx)]);
  if (!d) return null;
  const [rows, replacedBy] = await Promise.all([
    db.accountEtaxSubmission.findMany({ where: { systemId: ctx.systemId, documentId }, select: SUB_SELECT, orderBy: { attemptNo: "desc" }, take: 30 }),
    d.replacedById ? db.accountDocument.findFirst({ where: { id: d.replacedById, systemId: ctx.systemId }, select: { docNo: true } }) : Promise.resolve(null),
  ]);
  const covered = ETAX_TS_DOC_TYPES.includes(d.docType) && d.direction === "OUT";
  const live = !DEAD.includes(d.status);
  const buyerEmail = snapStr(d.contactSnapshot, "email") || (d.contact?.email ?? "").trim();
  const buyerTaxId = snapStr(d.contactSnapshot, "taxId") || (d.contact?.taxId ?? "").trim();
  const sc = covered && d.docNo ? await subjectContext(ctx, d) : null;
  const state = etaxStateOf(rows);
  const infos: LegalWarning[] = [];
  if (covered && live && !buyerEmail) infos.push(legalWarning("ETAX_TS_NO_BUYER_EMAIL"));
  if (covered && live && !buyerTaxId) infos.push(legalWarning("BUYER_TAX_ID_MISSING"));
  if (covered && !live && rows.some((r) => r.status === "SENT" || r.status === "STAMPED")) infos.push(legalWarning("ETAX_TS_CANCELLED", { replacement: replacedBy?.docNo ?? "" }));
  let blockedReason: string | null = null;
  if (!covered) blockedReason = "ระบบประทับเวลาใช้กับใบกำกับภาษี ใบเพิ่มหนี้ และใบลดหนี้ที่ออกให้ผู้ซื้อเท่านั้น (ไม่รวมใบเสร็จรับเงิน)";
  else if (!live) blockedReason = d.status === "DRAFT" ? "ออกเอกสารก่อนจึงจะส่งได้" : "ใบนี้ยกเลิกแล้ว — ส่งใบที่ออกแทน";
  else if (!settings.enabled) blockedReason = "ยังไม่ได้เปิดการส่ง e-Tax แบบประทับเวลาในตั้งค่า › ภาษี";
  else if (!settings.senderEmail) blockedReason = "ยังไม่ได้ตั้งอีเมลที่ร้านแจ้งกรมสรรพากรไว้สำหรับส่ง (ตั้งค่า › ภาษี)";
  return {
    documentId: d.id,
    docType: d.docType,
    docNo: d.docNo,
    covered,
    live,
    state,
    stateLabel: ETAX_STATE_LABEL_TH[state],
    subjectKind: sc?.kind ?? null,
    subjectPreview: sc && d.docNo ? etaxSubject(sc.kind, bkkYmd(d.issueDate), d.docNo, sc.orig?.docNo ?? null, settings.subjectDateFormat) : null,
    originalDocNo: sc?.orig?.docNo ?? null,
    buyerEmail,
    buyerTaxId,
    infos,
    canSend: blockedReason === null,
    blockedReason,
    attempts: rows.map((r) => ({ ...r, statusLabel: ETAX_STATE_LABEL_TH[r.status as EtaxState] ?? r.status })),
    replacedByDocNo: replacedBy?.docNo ?? null,
    settings: { enabled: settings.enabled, senderEmail: settings.senderEmail, ccAddress: settings.ccAddress, eligibility: settings.eligibility, transport: settings.transport },
  };
}

// ═══════════════════ ส่ง ═══════════════════

const EMAIL_RE = /^[^\s<>@,;"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export type EtaxSendInput = {
  documentId: string;
  /** "SEND" (ส่งครั้งแรก/ส่งซ้ำ = ความพยายามใหม่) · "RESEND_STAMPED" (ประกาศ ข้อ 7: ส่งไฟล์ประทับเวลาเดิมให้ผู้ซื้อ ไม่สำเนาระบบ) */
  mode?: "SEND" | "RESEND_STAMPED";
  /** อีเมลผู้ซื้อ (ไม่ส่ง = อีเมลบนเอกสาร/ผู้ติดต่อ) — 1 ที่อยู่ */
  to?: string | null;
  ack?: LegalAck | null;
  actorId?: string | null;
  actorType?: "USER" | "API_KEY" | "SYSTEM";
  via?: string;
  idempotencyKey?: string | null;
  /** ตัวสร้าง PDF (ข้อสอบเปลี่ยนได้) */
  generator?: EtaxPdfGenerator;
};
export type EtaxSendResult =
  | { ok: true; submissionId: string; attemptNo: number; status: EtaxState; subject: string; to: string; cc: string | null; attachmentName: string; sha256: string; sizeBytes: number; error: string | null; duplicate: boolean; warnings: LegalWarning[] }
  | { ok: false; reason: string; code: "NOT_FOUND" | "NOT_ELIGIBLE" | "NO_BUYER_EMAIL" | "LEGAL_ACK_REQUIRED" | "NOT_STAMPED"; legal?: LegalAckRequired; warnings?: LegalWarning[] };

/** คำเตือนก่อนส่ง (จอ/REST/AI ใช้ตัวเดียวกัน) */
export async function etaxSendWarnings(ctx: BookCtx, documentId: string): Promise<{ warnings: LegalWarning[]; state: EtaxDocState } | { reason: string }> {
  const st = await etaxDocState(ctx, documentId);
  if (!st) return { reason: "ไม่พบเอกสาร" };
  const s = await etaxTsSettings(ctx);
  const w: LegalWarning[] = [];
  if (s.eligibility !== "LISTED") w.push(legalWarning("ETAX_TS_NOT_DECLARED"));
  if (!s.vatRegistered) w.push(legalWarning("ETAX_TS_NOT_VAT_REGISTERED"));
  if ((st.subjectKind === "DBN" || st.subjectKind === "CRN") && !st.originalDocNo) w.push(legalWarning("ADJUST_NOTE_ORIGINAL_MISSING", { side: "sale" }));
  w.push(...st.infos.filter((x) => x.code === "BUYER_TAX_ID_MISSING"));
  w.push(legalWarning("ETAX_TS_PDFA_NOT_VALIDATED"));
  return { warnings: w, state: st };
}

export async function sendEtaxTs(ctx: BookCtx, input: EtaxSendInput): Promise<EtaxSendResult> {
  const db = tenantDb(ctx);
  const mode = input.mode ?? "SEND";
  if (input.idempotencyKey) {
    const dup = await db.accountEtaxSubmission.findFirst({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, documentId: true, attemptNo: true, status: true, subject: true, toAddress: true, ccAddress: true, attachmentName: true, pdfSha256: true, attachmentBytes: true, error: true } });
    if (dup) {
      if (dup.documentId !== input.documentId) return { ok: false, code: "NOT_ELIGIBLE", reason: "คีย์กันซ้ำนี้ถูกใช้กับเอกสารอื่นแล้ว" };
      return { ok: true, submissionId: dup.id, attemptNo: dup.attemptNo, status: dup.status as EtaxState, subject: dup.subject, to: dup.toAddress, cc: dup.ccAddress, attachmentName: dup.attachmentName, sha256: dup.pdfSha256, sizeBytes: dup.attachmentBytes, error: dup.error, duplicate: true, warnings: [] };
    }
  }
  const pre = await etaxSendWarnings(ctx, input.documentId);
  if ("reason" in pre) return { ok: false, code: "NOT_FOUND", reason: pre.reason };
  const st = pre.state;
  if (!st.canSend) return { ok: false, code: "NOT_ELIGIBLE", reason: st.blockedReason ?? "ส่งไม่ได้" };
  // ได้ไฟล์ประทับเวลาแล้ว = ใบนี้ออกทางระบบแล้ว — ส่งเข้าระบบอีกจะได้ใบกำกับที่ประทับเวลาซ้ำ ⇒ ใช้การส่งไฟล์ประทับเวลาซ้ำ (ข้อ 7) แทน (กันข้อมูลซ้ำ ไม่ใช่ด่านกฎหมาย)
  if (mode === "SEND" && st.state === "STAMPED") return { ok: false, code: "NOT_ELIGIBLE", reason: "ใบนี้ได้ไฟล์ประทับเวลาแล้ว — ถ้าผู้ซื้อต้องการไฟล์อีกครั้งใช้ \"ส่งไฟล์ประทับเวลาซ้ำให้ผู้ซื้อ\" · ถ้าใบผิดให้ยกเลิกและออกใบใหม่แทน" };
  const to = (input.to ?? "").trim() || st.buyerEmail;
  if (!to) return { ok: false, code: "NO_BUYER_EMAIL", reason: legalWarning("ETAX_TS_NO_BUYER_EMAIL").messageTh, warnings: [legalWarning("ETAX_TS_NO_BUYER_EMAIL")] };
  if (!EMAIL_RE.test(to)) return { ok: false, code: "NOT_ELIGIBLE", reason: "อีเมลผู้ซื้อไม่ถูกรูปแบบ (ระบุได้ 1 ที่อยู่)" };
  // ส่งไฟล์ประทับเวลาเดิมซ้ำ (ข้อ 7) = ไม่ได้จัดทำใบใหม่ ⇒ ไม่ถามคำเตือนของการจัดทำ/ส่งเข้าระบบอีก
  if (mode === "RESEND_STAMPED") pre.warnings = [];
  const need = unacknowledged(pre.warnings, input.ack?.codes);
  if (need.length) return { ok: false, code: "LEGAL_ACK_REQUIRED", reason: "มีคำเตือนตามกฎหมายที่ต้องกดยืนยันก่อนส่ง", legal: { code: LEGAL_ACK_REQUIRED, warnings: pre.warnings } };
  const settings = await etaxTsSettings(ctx);
  const warnings = [...pre.warnings];

  // ── ไฟล์: ส่งครั้งแรก/ซ้ำ = สร้างจากข้อมูลพิมพ์ที่ตรึงไว้ · ส่งไฟล์ประทับเวลาซ้ำ = ไบต์ที่ร้านอัปโหลดไว้ ──
  let bytes: Uint8Array;
  let sha: string;
  let conformance: string;
  let subject: string;
  let attachmentName: string;
  let stampedSource: { fileId: string } | null = null;
  const now = accountNow();
  if (mode === "RESEND_STAMPED") {
    const last = await db.accountEtaxSubmission.findFirst({ where: { systemId: ctx.systemId, documentId: input.documentId, status: "STAMPED", stampedFileId: { not: null } }, orderBy: { attemptNo: "desc" }, select: { subject: true, attachmentName: true, stampedFileId: true } });
    if (!last?.stampedFileId) return { ok: false, code: "NOT_STAMPED", reason: "ยังไม่มีไฟล์ประทับเวลาที่บันทึกไว้ — อัปโหลดไฟล์ที่ระบบประทับเวลาส่งกลับก่อน" };
    const f = await db.accountEtaxFile.findFirst({ where: { id: last.stampedFileId, systemId: ctx.systemId }, select: { id: true, bytes: true, sha256: true } });
    if (!f) return { ok: false, code: "NOT_STAMPED", reason: "ไม่พบไฟล์ประทับเวลา" };
    bytes = new Uint8Array(f.bytes);
    sha = f.sha256;
    conformance = "ไฟล์ที่ระบบประทับเวลาส่งกลับ (ไม่ได้สร้างใหม่)";
    subject = last.subject;
    attachmentName = last.attachmentName;
    stampedSource = { fileId: f.id };
  } else {
    const loaded = await loadPrintView(ctx.tenantId, ctx.systemId, input.documentId);
    if (!loaded || !st.docNo) return { ok: false, code: "NOT_FOUND", reason: "ไม่พบข้อมูลพิมพ์ของเอกสาร" };
    const gen = input.generator ?? pdfkitEtaxGenerator;
    const pdf = await gen.generate({ view: loaded.view, title: `${loaded.view.docTitle} ${st.docNo}`, createdAt: now, footer: "จัดทำเพื่อส่งทางระบบประทับรับรองเวลา (Time Stamp) ของกรมสรรพากร" });
    bytes = pdf.bytes;
    sha = pdf.sha256;
    const ins = inspectEtaxPdf(bytes);
    conformance = `${PDF_CONFORMANCE_NOTE} · ตรวจโครงสร้าง: pdfaid ${ins.pdfaPart ?? "-"}/${ins.pdfaConformance ?? "-"} · OutputIntent ${ins.outputIntent ? "มี" : "ไม่มี"} · ฟอนต์ฝัง ${ins.fontFiles} · เข้ารหัส ${ins.encrypted ? "ใช่" : "ไม่"}`;
    subject = st.subjectPreview!;
    attachmentName = etaxAttachmentName(st.docNo);
    // ใบที่ออกแทนใบที่ส่ง e-Tax แล้ว — ข้อ 6: วันที่ต้องเป็นวันที่ทำใบใหม่ (ไม่ใช่วันที่เดิมแบบกระดาษ)
    if (st.subjectKind === "INV_REPLACE") {
      const d = await loadDoc(ctx, input.documentId);
      const orig = await db.accountDocument.findFirst({ where: { systemId: ctx.systemId, replacedById: input.documentId }, select: { id: true, docNo: true, issueDate: true } });
      if (d && orig) {
        const origSent = await db.accountEtaxSubmission.count({ where: { systemId: ctx.systemId, documentId: orig.id, status: { in: ["SENT", "STAMPED"] } } });
        if (origSent > 0 && bkkYmd(orig.issueDate) === bkkYmd(d.issueDate))
          warnings.push(legalWarning("ETAX_TS_REPLACE_DATE", { orig: orig.docNo ?? "-", origDate: bkkYmd(orig.issueDate), date: bkkYmd(d.issueDate) }));
      }
    }
  }
  if (bytes.length > settings.maxBytes) warnings.push(legalWarning("ETAX_TS_FILE_TOO_LARGE", { size: bytes.length, max: settings.maxBytes }));
  const cc = mode === "RESEND_STAMPED" ? null : settings.ccAddress;
  const text =
    mode === "RESEND_STAMPED"
      ? `ส่งไฟล์${st.docNo ? ` ${st.docNo}` : ""} ที่ได้รับการประทับรับรองเวลาแล้วอีกครั้งตามที่ขอ\n— ${settings.senderEmail}`
      : `เรียนลูกค้า\nแนบ${st.docNo ? ` ${st.docNo}` : "เอกสาร"} (ไฟล์ PDF 1 ไฟล์) ส่งผ่านระบบประทับรับรองเวลา (Time Stamp) ของกรมสรรพากร`;

  // ── แถวความพยายาม + ไฟล์ (ธุรกรรมเดียว) แล้วค่อยส่ง ──
  const transport = etaxTransport();
  const row = await runAccountTx(async (tx) => {
    await lockDocumentRow(tx, ctx.tenantId, ctx.systemId, input.documentId);
    const n = await tx.accountEtaxSubmission.aggregate({ where: { documentId: input.documentId }, _max: { attemptNo: true } });
    const attemptNo = (n._max.attemptNo ?? 0) + 1;
    const sub = await tx.accountEtaxSubmission.create({
      data: {
        tenantId: ctx.tenantId, systemId: ctx.systemId, documentId: input.documentId, attemptNo, scheme: "TIME_STAMP", mode: mode === "RESEND_STAMPED" ? "RESEND_STAMPED" : attemptNo > 1 ? "RESEND" : "SEND", status: "QUEUED",
        subjectKind: st.subjectKind ?? "INV", fromAddress: settings.senderEmail, toAddress: to, ccAddress: cc, subject, bodyText: text, attachmentName, attachmentBytes: bytes.length, pdfSha256: sha,
        pdfConformance: conformance, transport: transport.name, warnings: warnings.map((w) => ({ code: w.code, tag: w.tag ?? null })) as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey ?? null, createdById: input.actorId ?? null, actorType: input.actorType ?? "USER",
      },
      select: { id: true, attemptNo: true },
    });
    let fileId = stampedSource?.fileId ?? null;
    if (!stampedSource) {
      const f = await tx.accountEtaxFile.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, documentId: input.documentId, submissionId: sub.id, role: "SENT", fileName: attachmentName, mimeType: "application/pdf", sizeBytes: bytes.length, sha256: sha, bytes: Buffer.from(bytes), createdById: input.actorId ?? null }, select: { id: true } });
      fileId = f.id;
    }
    await tx.accountEtaxSubmission.update({ where: { id: sub.id }, data: { pdfFileId: fileId } });
    if (input.ack && pre.warnings.some((w) => w.ack)) await recordLegalAckInTx(tx, { tenantId: ctx.tenantId, ack: input.ack, op: "account.etax.ts.send", targetType: "AccountDocument", targetId: input.documentId, warnings: pre.warnings.filter((w) => w.ack) });
    return sub;
  });
  const sent = await transport.send({ from: settings.senderEmail, to, cc, subject, text, attachment: { filename: attachmentName, content: bytes, contentType: "application/pdf" } });
  const status: EtaxState = sent.ok ? "SENT" : "FAILED";
  await db.accountEtaxSubmission.update({ where: { id: row.id }, data: sent.ok ? { status, sentAt: accountNow(), providerMessageId: sent.providerId } : { status, error: sent.error.slice(0, 500) } });
  await writeAudit({
    tenantId: ctx.tenantId, actorId: input.actorId ?? null, actorType: input.actorType ?? "USER", action: mode === "RESEND_STAMPED" ? "account.etax.ts.resend_stamped" : "account.etax.ts.send", targetType: "AccountDocument", targetId: input.documentId,
    after: { submissionId: row.id, attemptNo: row.attemptNo, status, subject, to, cc, attachmentName, sha256: sha, sizeBytes: bytes.length, transport: transport.name, error: sent.ok ? null : sent.error.slice(0, 200), via: input.via ?? null },
  });
  return { ok: true, submissionId: row.id, attemptNo: row.attemptNo, status, subject, to, cc, attachmentName, sha256: sha, sizeBytes: bytes.length, error: sent.ok ? null : sent.error, duplicate: false, warnings };
}

// ═══════════════════ ไฟล์ประทับเวลาที่ระบบส่งกลับ ═══════════════════

export const STAMPED_MAX_BYTES = 5_000_000;

export async function recordStampedFile(
  ctx: BookCtx,
  input: { documentId: string; submissionId?: string | null; fileName: string; bytes: Uint8Array; actorId?: string | null; actorType?: "USER" | "API_KEY" | "SYSTEM"; via?: string },
): Promise<{ ok: true; submissionId: string; fileId: string; sha256: string; sizeBytes: number; sameAsSent: boolean } | { ok: false; reason: string }> {
  const db = tenantDb(ctx);
  if (!input.bytes?.length) return { ok: false, reason: "ไม่มีไฟล์" };
  if (input.bytes.length > STAMPED_MAX_BYTES) return { ok: false, reason: "ไฟล์ใหญ่เกิน 5 MB" };
  if (Buffer.from(input.bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") return { ok: false, reason: "ไฟล์ต้องเป็น PDF ที่ระบบประทับเวลาส่งกลับมา" };
  const sub = await db.accountEtaxSubmission.findFirst({
    where: { systemId: ctx.systemId, documentId: input.documentId, ...(input.submissionId ? { id: input.submissionId } : { status: { in: ["SENT", "STAMPED"] }, mode: { not: "RESEND_STAMPED" } }) },
    orderBy: { attemptNo: "desc" },
    select: { id: true, status: true, pdfSha256: true, mode: true },
  });
  if (!sub) return { ok: false, reason: "ยังไม่มีการส่งที่สำเร็จของเอกสารนี้ — ส่งทางระบบประทับเวลาก่อน" };
  if (sub.mode === "RESEND_STAMPED") return { ok: false, reason: "เลือกการส่งครั้งที่สำเนาถึงระบบประทับเวลา" };
  if (sub.status !== "SENT" && sub.status !== "STAMPED") return { ok: false, reason: "การส่งครั้งนี้ยังไม่สำเร็จ" };
  const sha = createHash("sha256").update(input.bytes).digest("hex");
  const name = (input.fileName || "stamped.pdf").replace(/[\\/:*?"<>|\r\n\t]/g, "-").slice(0, 120);
  const r = await runAccountTx(async (tx) => {
    const f = await tx.accountEtaxFile.create({ data: { tenantId: ctx.tenantId, systemId: ctx.systemId, documentId: input.documentId, submissionId: sub.id, role: "STAMPED", fileName: name, mimeType: "application/pdf", sizeBytes: input.bytes.length, sha256: sha, bytes: Buffer.from(input.bytes), createdById: input.actorId ?? null }, select: { id: true } });
    await tx.accountEtaxSubmission.update({ where: { id: sub.id }, data: { status: "STAMPED", stampedFileId: f.id, stampedSha256: sha, stampedAt: accountNow(), stampedById: input.actorId ?? null } });
    return f;
  });
  await writeAudit({ tenantId: ctx.tenantId, actorId: input.actorId ?? null, actorType: input.actorType ?? "USER", action: "account.etax.ts.stamped", targetType: "AccountDocument", targetId: input.documentId, after: { submissionId: sub.id, fileId: r.id, sha256: sha, sizeBytes: input.bytes.length, fileName: name, sameAsSent: sha === sub.pdfSha256, via: input.via ?? null } });
  return { ok: true, submissionId: sub.id, fileId: r.id, sha256: sha, sizeBytes: input.bytes.length, sameAsSent: sha === sub.pdfSha256 };
}

/** ไฟล์ที่เก็บ (ส่ง/ประทับเวลา) — ตรวจ hash ซ้ำทุกครั้งที่อ่าน */
export async function etaxFile(ctx: BookCtx, fileId: string): Promise<{ fileName: string; mimeType: string; bytes: Uint8Array; sha256: string; role: string; documentId: string; intact: boolean } | null> {
  const f = await tenantDb(ctx).accountEtaxFile.findFirst({ where: { id: fileId, systemId: ctx.systemId }, select: { fileName: true, mimeType: true, bytes: true, sha256: true, role: true, documentId: true } });
  if (!f) return null;
  const bytes = new Uint8Array(f.bytes);
  return { fileName: f.fileName, mimeType: f.mimeType, bytes, sha256: f.sha256, role: f.role, documentId: f.documentId, intact: createHash("sha256").update(bytes).digest("hex") === f.sha256 };
}

// ═══════════════════ อัตโนมัติตอนออกเอกสาร (outbox `account.document.issued`) ═══════════════════

/** ส่งเมื่อ: เปิดค่าตั้ง + เปิดส่งอัตโนมัติ + ร้านยืนยันสิทธิแล้ว + ชนิดตรง + มีอีเมลผู้ซื้อ + ยังไม่เคยส่ง — ไม่ถามคำเตือนแทนร้าน (ยังไม่ยืนยันสิทธิ = ไม่ส่งอัตโนมัติ) */
export async function onDocumentIssuedEtax(evt: { tenantId: string; systemId: string | null; payload: unknown }): Promise<"SKIPPED" | "SENT" | "FAILED"> {
  const p = (evt.payload ?? {}) as { documentId?: unknown; type?: unknown };
  if (!evt.systemId || typeof p.documentId !== "string") return "SKIPPED";
  if (typeof p.type === "string" && !(ETAX_TS_DOC_TYPES as readonly string[]).includes(p.type)) return "SKIPPED";
  const ctx = { tenantId: evt.tenantId, systemId: evt.systemId };
  const s = await etaxTsSettings(ctx);
  if (!s.enabled || !s.autoOnIssue || s.eligibility !== "LISTED" || !s.vatRegistered || !s.senderEmail) return "SKIPPED";
  const st = await etaxDocState(ctx, p.documentId);
  if (!st || !st.canSend || !st.buyerEmail || st.attempts.length > 0) return "SKIPPED";
  const codes = (await etaxSendWarnings(ctx, p.documentId)) as { warnings: LegalWarning[] };
  // คำเตือนที่ต้องยืนยันที่เหลือ (เช่น ใบลดหนี้ไม่อ้างใบเดิม) = ไม่ส่งอัตโนมัติ — รอร้านกดเอง
  if (codes.warnings?.some((w) => w.ack)) return "SKIPPED";
  const r = await sendEtaxTs(ctx, { documentId: p.documentId, actorType: "SYSTEM", via: "auto-on-issue", idempotencyKey: `etax-auto:${p.documentId}` });
  return r.ok && r.status === "SENT" ? "SENT" : r.ok ? "FAILED" : "SKIPPED";
}
