// etax.ts — REST ของ ACC T5.4 (เลน 2): e-Tax Invoice by Time Stamp
//   ค่าตั้ง · สถานะต่อเอกสาร · ส่ง (ข้อเสนอของเลขา AI — เจ้าของกดยืนยัน) · บันทึกไฟล์ที่ระบบประทับเวลาส่งกลับ · อ่านไฟล์ที่เก็บ
//   design note: ledger/wo-notes/T5.4.md
import { z } from "zod";
import { ETAX_TS_ELIGIBILITY, ETAX_TS_SUBJECT_DATE_FORMATS } from "@/lib/core/settings/legal/th-tax-2569";
import { ackField } from "../ack-field";
import { actorAuditId, actorAuditType, actorRefId, type ApiActor } from "../actor";
import { defineOp, type ApiOp } from "../op";
import { ApiError, legalAckApiError } from "../respond";
import { etaxDocState, etaxFile, etaxTsSettings, recordStampedFile, saveEtaxTsSettings, sendEtaxTs, type EtaxAttemptView } from "../../etax-ts";
import { getProviderExtension } from "../../etax-provider-ext";

const ctxOf = (a: ApiActor) => ({ tenantId: a.tenantId, systemId: a.systemId });
const notFound = (m: string) => new ApiError(404, "not_found", m, "The requested record was not found in this accounting book.");
const unprocessable = (m: string, en: string) => new ApiError(422, "unprocessable", m, en);
const conflict = (m: string, en: string) => new ApiError(409, "state_conflict", m, en);
const warnView = (ws: readonly { code: string; messageTh: string; citation?: string; tag?: string; checkedAt?: string; ack?: boolean }[]) =>
  ws.map((w) => ({ code: w.code, message_th: w.messageTh, citation: w.citation ?? null, tag: w.tag ?? null, checkedAt: w.checkedAt ?? null, needsAcknowledge: !!w.ack }));
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const attemptView = (a: EtaxAttemptView) => ({
  id: a.id,
  attemptNo: a.attemptNo,
  mode: a.mode,
  status: a.status,
  statusLabel: a.statusLabel,
  subject: a.subject,
  from: a.fromAddress,
  to: a.toAddress,
  cc: a.ccAddress,
  attachmentName: a.attachmentName,
  attachmentBytes: a.attachmentBytes,
  sha256: a.pdfSha256,
  sentFileId: a.pdfFileId,
  pdfConformance: a.pdfConformance,
  transport: a.transport,
  error: a.error,
  stampedFileId: a.stampedFileId,
  stampedSha256: a.stampedSha256,
  stampedAt: iso(a.stampedAt),
  createdAt: iso(a.createdAt),
  sentAt: iso(a.sentAt),
});

const etaxSettingsGet = defineOp({
  id: "etax.settings",
  method: "GET",
  path: "/etax/settings",
  kind: "read",
  action: "account.doc.view",
  summary:
    "e-Tax Invoice by Time Stamp settings of this book (no service provider): on/off, send automatically on issue, the sender address the shop registered with the Revenue Department, the time-stamp system address in cc, subject date format, the shop's own declaration that it is listed, the transport the system would use (CAPTURE outside production = nothing is really sent), and the legal value rows of the scheme with source, tag and check date. Also the disabled provider extension point (e-Tax Invoice signed with a digital certificate through a service provider).",
  label: "ค่าตั้ง e-Tax แบบประทับเวลา",
  test: "T5.4-API.1",
  async handler({ actor }) {
    const s = await etaxTsSettings(ctxOf(actor));
    const p = getProviderExtension();
    return {
      enabled: s.enabled,
      autoOnIssue: s.autoOnIssue,
      senderEmail: s.senderEmail,
      ccAddress: s.ccAddress,
      ccSource: s.ccSource,
      subjectDateFormat: s.subjectDateFormat,
      eligibility: s.eligibility,
      vatRegistered: s.vatRegistered,
      maxBytes: s.maxBytes,
      transport: s.transport,
      legalRows: s.rows.map((r) => ({ key: r.key, label: r.labelTh, value: r.value, source: r.source, tag: r.tag, checkedAt: r.checkedAt, note: r.note ?? null })),
      provider: { available: p.available, reason: p.reasonTh, providers: p.providers },
      warnings: warnView(s.warnings),
    };
  },
});

const etaxSettingsUpdate = defineOp({
  id: "etax.settings.update",
  method: "PATCH",
  path: "/etax/settings",
  kind: "write",
  action: "account.settings.manage",
  summary:
    "Change e-Tax by Time Stamp settings (send only the fields that change). eligibility LISTED is the shop's own declaration that it filed form Kor.Or.01, was listed and registered the sender address; the system cannot check it. ccAddress empty = the address from the legal value table.",
  label: "แก้ค่าตั้ง e-Tax แบบประทับเวลา",
  input: z
    .object({
      enabled: z.boolean().optional(),
      autoOnIssue: z.boolean().optional(),
      senderEmail: z.string().max(200).optional().describe("Address the shop registered with the Revenue Department for sending (From)."),
      ccAddress: z.string().max(200).optional().describe("Time-stamp system address in cc; empty string = legal table value."),
      subjectDateFormat: z.enum(ETAX_TS_SUBJECT_DATE_FORMATS).optional(),
      eligibility: z.enum(ETAX_TS_ELIGIBILITY).optional(),
    })
    .strict(),
  tool: { name: "account_update_etax_settings", hint: "Use when the owner sets up e-Tax by Time Stamp (sender address, on/off, declaration). Proposed for confirmation." },
  test: "T5.4-API.2",
  async handler({ actor, input }) {
    const r = await saveEtaxTsSettings({ ...actor.membership, userId: actorRefId(actor) }, ctxOf(actor), input);
    if (!r.ok) throw unprocessable(r.reason, "The settings were rejected; see message_th.");
    return { enabled: r.settings.enabled, autoOnIssue: r.settings.autoOnIssue, senderEmail: r.settings.senderEmail, ccAddress: r.settings.ccAddress, subjectDateFormat: r.settings.subjectDateFormat, eligibility: r.settings.eligibility, warnings: warnView(r.settings.warnings) };
  },
});

const etaxDocument = defineOp({
  id: "etax.document",
  method: "GET",
  path: "/documents/{id}/etax",
  kind: "read",
  action: "account.doc.view",
  summary:
    "e-Tax by Time Stamp state of one document: whether its type is covered (tax invoice, debit note, credit note; receipts are not), state (NOT_SENT, QUEUED, SENT = awaiting the time-stamped copy, STAMPED = the shop recorded the stamped file, FAILED), the e-mail subject the system would use, buyer e-mail and tax id, informative warnings (no buyer e-mail, no buyer tax id, cancelled after sending) and every attempt with addresses, attachment name, size and SHA-256.",
  label: "สถานะ e-Tax ของเอกสาร",
  tool: { name: "account_etax_status", hint: "Use to check whether a tax invoice, debit note or credit note was sent by e-Tax Time Stamp, whether the stamped copy came back, and why it cannot be sent." },
  test: "T5.4-API.3",
  async handler({ actor, params }) {
    const st = await etaxDocState(ctxOf(actor), params.id ?? "");
    if (!st) throw notFound("ไม่พบเอกสาร");
    return {
      documentId: st.documentId,
      type: st.docType,
      docNo: st.docNo,
      covered: st.covered,
      live: st.live,
      state: st.state,
      stateLabel: st.stateLabel,
      subjectKind: st.subjectKind,
      subject: st.subjectPreview,
      originalDocNo: st.originalDocNo,
      buyerEmail: st.buyerEmail || null,
      buyerTaxId: st.buyerTaxId || null,
      canSend: st.canSend,
      blockedReason: st.blockedReason,
      replacedByDocNo: st.replacedByDocNo,
      attempts: st.attempts.map(attemptView),
      infos: warnView(st.infos),
    };
  },
});

const etaxSend = defineOp({
  id: "etax.send",
  method: "POST",
  path: "/documents/{id}/etax/send",
  kind: "write",
  action: "account.doc.issue",
  summary:
    "Send an issued tax invoice, debit note or credit note by e-Tax Invoice by Time Stamp: the system builds one PDF from the document's frozen print data, then sends one e-mail from the registered sender address to one buyer address with the time-stamp system in cc and the subject format of the Revenue Department notice. Each call is a new attempt (resend). mode RESEND_STAMPED sends the time-stamped file recorded earlier to the buyer only (lost file; no substitute invoice). Warnings that need confirmation (shop has not declared it is listed, book not VAT registered, debit/credit note without the original invoice number) come back as 409 legal_ack_required until listed in `acknowledge`. Outside production the e-mail is captured, never sent.",
  label: "ส่ง e-Tax (ประทับเวลา)",
  input: z
    .object({
      mode: z.enum(["SEND", "RESEND_STAMPED"]).optional(),
      to: z.string().max(200).optional().describe("Buyer address (exactly one); default the e-mail on the document or contact."),
      idempotencyKey: z.string().min(8).max(80).optional(),
      acknowledge: ackField,
    })
    .strict(),
  tool: { name: "account_etax_send", hint: "Use when the owner asks to send a tax invoice, debit note or credit note through the Revenue Department time-stamp e-mail system. Show the warnings first; proposed for confirmation." },
  test: "T5.4-API.4",
  async handler({ actor, params, input }) {
    const r = await sendEtaxTs(ctxOf(actor), {
      documentId: params.id ?? "",
      mode: input.mode,
      to: input.to ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      actorId: actorAuditId(actor),
      actorType: actorAuditType(actor) as "USER" | "API_KEY",
      via: actor.kind === "apikey" ? "rest" : "ai-proposal",
      ack: { codes: input.acknowledge ?? [], actorId: actorAuditId(actor), actorType: actorAuditType(actor), via: actor.kind === "apikey" ? "rest" : "ai-proposal" },
    });
    if (!r.ok) {
      if (r.legal) throw legalAckApiError(r.legal.warnings);
      if (r.code === "NOT_FOUND") throw notFound(r.reason);
      throw conflict(r.reason, "The document cannot be sent by e-Tax Time Stamp now; see message_th.");
    }
    return { documentId: params.id, submissionId: r.submissionId, attemptNo: r.attemptNo, status: r.status, subject: r.subject, to: r.to, cc: r.cc, attachmentName: r.attachmentName, sha256: r.sha256, sizeBytes: r.sizeBytes, error: r.error, duplicate: r.duplicate, warnings: warnView(r.warnings) };
  },
});

const etaxStamped = defineOp({
  id: "etax.stamped",
  method: "POST",
  path: "/documents/{id}/etax/stamped",
  kind: "write",
  action: "account.doc.issue",
  summary:
    "Record the time-stamped PDF that the time-stamp system e-mailed back for the latest successful attempt (or submissionId). The bytes are stored unchanged with their SHA-256 and the document state becomes STAMPED. The system does not read or verify the time-stamp signature inside the file (check it at validation.teda.th).",
  label: "บันทึกไฟล์ประทับเวลา",
  input: z
    .object({
      fileName: z.string().min(1).max(120),
      contentBase64: z.string().min(8).max(7_000_000).describe("The PDF file, base64 encoded (at most 5 MB)."),
      submissionId: z.string().max(40).optional(),
    })
    .strict(),
  tool: { name: "account_etax_record_stamped", hint: "Use when the owner forwards the time-stamped PDF returned by the system. Proposed for confirmation." },
  test: "T5.4-API.5",
  async handler({ actor, params, input }) {
    const bytes = new Uint8Array(Buffer.from(input.contentBase64, "base64"));
    const r = await recordStampedFile(ctxOf(actor), { documentId: params.id ?? "", submissionId: input.submissionId ?? null, fileName: input.fileName, bytes, actorId: actorAuditId(actor), actorType: actorAuditType(actor) as "USER" | "API_KEY", via: actor.kind === "apikey" ? "rest" : "ai-proposal" });
    if (!r.ok) throw unprocessable(r.reason, "The stamped file was rejected; see message_th.");
    return { documentId: params.id, submissionId: r.submissionId, fileId: r.fileId, sha256: r.sha256, sizeBytes: r.sizeBytes, sameAsSent: r.sameAsSent, state: "STAMPED" };
  },
});

const etaxFileGet = defineOp({
  id: "etax.file",
  method: "GET",
  path: "/etax/files/{id}",
  kind: "read",
  action: "account.doc.view",
  summary: "One stored e-Tax file (the PDF that was sent, or the time-stamped copy) as base64, with its SHA-256 and whether the stored bytes still match it.",
  label: "ไฟล์ e-Tax ที่เก็บไว้",
  test: "T5.4-API.6",
  async handler({ actor, params }) {
    const f = await etaxFile(ctxOf(actor), params.id ?? "");
    if (!f) throw notFound("ไม่พบไฟล์");
    return { fileId: params.id, documentId: f.documentId, role: f.role, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.bytes.length, sha256: f.sha256, intact: f.intact, contentBase64: Buffer.from(f.bytes).toString("base64") };
  },
});

export const ETAX_OPS: ApiOp[] = [etaxSettingsGet, etaxSettingsUpdate, etaxDocument, etaxSend, etaxStamped, etaxFileGet];
