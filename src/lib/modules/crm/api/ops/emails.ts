// ops/emails.ts — op ของระบบอีเมล CRM ผ่าน REST (ใบ C2.11 · CRM-API "E-mail")
//
// 🔴 ไม่มี engine ที่สอง: ทุก op เรียกบริการ `emails.ts` ของใบ C2.5 เท่านั้น (ผู้รับ · ความยินยอม · การมองเห็น ·
//    การกันซ้ำระดับจดหมาย · การติดตามเปิด/คลิก · เหตุการณ์ outbox อยู่ในบริการนั้นทั้งหมด)
// 🔴 AUDIT-CLASS X9 (มติผู้คุมงาน ORACLE-EDIT 24 ก.ย. 2569): `emails.send` = ผู้รับ **คนเดียว** เสมอ (ไม่มีช่อง
//    `recipients[]` / `contactIds[]` และไม่มีธง `confirm`) · การยิงเป็นกลุ่มมีประตูของตัวเอง `POST /emails/send-bulk`
//    ซึ่งเป็น kind `danger` (ยืนยัน + เหตุผล ≥ 5 ตัวอักษร · ≤ 500 ผู้รับ) ⇒ การส่งถึงคนเดียวไม่มีวันกลายเป็นการยิงทั้งร้าน
// 🔴 AUDIT-CLASS X8: ไม่มี op ไหนคืนเนื้อความจดหมายให้คีย์ที่ไม่มี `crm.email.read` — `GET /emails/threads` คืน
//    หัวข้อ/ตัวอย่างข้อความ (snippet) เท่านั้น · เนื้อความเต็มอยู่ที่ `GET /emails/threads/{threadKey}` ซึ่งด่านของบริการ
//    บังคับคีย์ `crm.email.read` และตรวจการมองเห็น "ทีละแถว" · DTO ไม่มีลิงก์ไฟล์แนบ (ออกทาง attachmentUrl เท่านั้น)
// 🔴 `emails.routing.*` = "ที่อยู่ผู้ส่ง/ที่อยู่รับคำตอบ/สำเนา/กล่องขาเข้าของร้าน" อ่าน-เขียนผ่าน
//    `getEmailSettings`/`setEmailSettings` (บริการเดียวกับหน้าตั้งค่า) — คำว่า mode `SHARED` = ใช้ที่อยู่กลางของ SHARK
//    (ค่าในฐานคือ `fromMode: "SHARK"`) · `DOMAIN` = โดเมนของร้านที่ยืนยันแล้ว
//    ⚠️ ไม่คืน `inboundKey` ดิบ (คืนแต่ `inboundAddress` ที่ร้านเอาไปตั้ง forward — ตัวกุญแจออกเฉพาะตอนหมุนใหม่)

import { z } from "zod";
import * as emails from "../../emails";
import { CRM_EMAIL_BODY_MAX_BYTES, CRM_EMAIL_COPY_MODES, CRM_EMAIL_REPLY_MODES, CRM_EMAIL_SUBJECT_MAX } from "../../emails-shared";
import type { ApiActor } from "@/lib/api/actor";
import { crmActorOf, crmCtxOf } from "../actor";
import { defineCrmOp, type ApiOp } from "../op";
import { maskPiiPatterns } from "../serialize";
import { cursor, flag, idStr, isOn, isoDate, optId, optText, pageCursor, pageOfCursor, reason, take, text } from "../schema";

const TEMPLATE_VARS = z.record(z.string().max(80), z.string().max(2000)).refine((o) => Object.keys(o).length <= 50, { message: "ใส่ตัวแปรของแม่แบบได้ไม่เกิน 50 ช่องต่อครั้ง" });
/** เนื้อความจดหมาย — เพดานจริง (500 KB) อยู่ที่บริการ · ที่นี่กันคำขอที่ใหญ่เกินก่อนถึงฐาน */
const bodyHtml = z.string().max(CRM_EMAIL_BODY_MAX_BYTES);
const subject = z.string().min(1).max(CRM_EMAIL_SUBJECT_MAX);

/** เนื้อความที่ผู้เรียกส่งมา: `body` (ชื่อที่อ่านง่าย) หรือ `bodyHtml` — อย่างใดอย่างหนึ่ง */
const bodyOf = (input: { body?: string; bodyHtml?: string }): string | null => input.bodyHtml ?? input.body ?? null;

// ───────────────────────── ผู้ช่วย AI เห็นข้อความของลูกค้าแบบปิดบัง (AUDIT-CLASS X8) ─────────────────────────
// 🔴 รอบแก้ 25 ก.ย. 2569 (ผู้ตรวจอิสระ B3): `present()` ปิดบังเบอร์/อีเมลให้ **คีย์ชุด readonly** เท่านั้น ⇒ ผู้ช่วย AI
//    (actor.kind = "assistant") ได้ `subject` / `snippet` ดิบ ซึ่งเป็นที่ที่ลูกค้าพิมพ์เบอร์โทรและอีเมลไว้เองบ่อยที่สุด
//    ("สนใจครับ โทร 08x-xxx-xxxx") ⇒ ข้อมูลติดต่อของลูกค้าไหลเข้าไปอยู่ในบทสนทนาของโมเดล
//    ที่นี่จึงเดิน `maskPiiPatterns` (ตัวปิดรูปแบบของใบ C1.10) กับ **ข้อความอิสระของลูกค้า** ทุกก้อนที่ op อีเมลคืน
//    เมื่อผู้ถามคือผู้ช่วย · คีย์ของคนในร้าน (operate/admin) เห็นของจริงเหมือนเดิม — เขาต้องโทรกลับลูกค้าได้
const maskText = (v: unknown): unknown => (typeof v === "string" && v ? maskPiiPatterns(v) : v);
/** ปิดบังช่องข้อความอิสระของแถวหนึ่ง (คืนวัตถุใหม่ — ไม่แตะของเดิม) */
function maskFreeText<T extends Record<string, unknown>>(row: T, keys: readonly string[]): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of keys) if (k in out) out[k] = maskText(out[k]);
  return out as T;
}
const forAssistant = (actor: ApiActor): boolean => actor.kind === "assistant";

// ───────────────────────── เธรดจดหมาย ─────────────────────────

const threadsList = defineCrmOp({
  id: "emails.threads.list",
  method: "GET",
  path: "/emails/threads",
  kind: "read",
  action: "crm.email.read",
  summary:
    "List e-mail threads this key can see (newest first): subject, snippet, direction, message count and the linked contact, company and deal. " +
    "Headers and snippet only - the message bodies are in GET /emails/threads/{threadKey}.",
  label: "รายการเธรดอีเมล",
  input: z
    .object({
      take,
      cursor,
      contactId: idStr.optional(),
      companyId: idStr.optional(),
      dealId: idStr.optional(),
      unmatched: flag,
      q: text(120).optional(),
    })
    .strict(),
  rate: "read",
  test: "C2.11-S2.1",
  tool: { name: "crm_email_thread", hint: "Use to see the e-mail conversation with a contact (subjects and snippets); pass contactId." },
  async handler({ actor, input }) {
    const page = pageOfCursor(input.cursor);
    const pageSize = input.take ?? 50;
    const r = await emails.listThreads(crmCtxOf(actor), crmActorOf(actor), {
      contactId: input.contactId ?? null,
      companyId: input.companyId ?? null,
      dealId: input.dealId ?? null,
      unmatched: isOn(input.unmatched),
      q: input.q ?? null,
      page,
      pageSize,
    });
    const items = forAssistant(actor) ? r.items.map((it) => maskFreeText({ ...it }, ["subject", "snippet"])) : r.items;
    return { items, total: r.total, nextCursor: page * pageSize < r.total ? pageCursor(page + 1) : null };
  },
});

const threadGet = defineCrmOp({
  id: "emails.thread.get",
  method: "GET",
  path: "/emails/threads/{threadKey}",
  kind: "read",
  action: "crm.email.read",
  summary: "One e-mail thread: every message of it this key may see, oldest first. A thread nobody of this key's scope may see answers 404.",
  label: "เธรดอีเมล",
  input: z.object({}).strict(),
  rate: "read",
  test: "C2.11-S2.1",
  async handler({ actor, params }) {
    const r = await emails.getThread(crmCtxOf(actor), crmActorOf(actor), params.threadKey ?? "");
    if (!forAssistant(actor)) return r;
    // ผู้ช่วยอ่านเธรดได้ แต่เบอร์/อีเมลในหัวข้อและเนื้อความถูกปิดบัง (ที่อยู่ในช่อง from/to ปิดด้วย — `maskPiiPatterns` จับรูปอีเมล)
    return { ...r, messages: r.messages.map((m) => maskFreeText({ ...m }, ["subject", "bodyHtml", "bodyText", "fromAddr", "fromName"])) };
  },
});

// ───────────────────────── ส่งจดหมาย ─────────────────────────

/** AUDIT-CLASS X9: ผู้รับคนเดียว — ไม่มี `to[]`, `recipients[]`, `contactIds[]` (การยิงกลุ่มอยู่ที่ /emails/send-bulk) */
const sendInput = z
  .object({
    contactId: idStr,
    subject: subject.optional(),
    body: bodyHtml.optional(),
    bodyHtml: bodyHtml.optional(),
    templateId: optId,
    vars: TEMPLATE_VARS.optional(),
    dealId: optId,
    companyId: optId,
    replyToEmailId: optId,
  })
  .strict();

const send = defineCrmOp({
  id: "emails.send",
  method: "POST",
  path: "/emails/send",
  kind: "write",
  action: "crm.email.send",
  summary:
    "Send one e-mail to ONE contact (the address on the contact record - the API never takes a free-text recipient). " +
    "Give subject and body, or a templateId with vars. The customer's marketing consent is checked first; a contact who opted out answers 409. " +
    "To write to many contacts at once use POST /emails/send-bulk, which needs confirm and a reason.",
  label: "ส่งอีเมล",
  input: sendInput,
  test: "C2.11-S2.2",
  tool: { name: "crm_send_email", hint: "Use to propose sending one e-mail to one contact; read crm_draft_email or crm_contact_360 first." },
  async handler({ actor, input, idempotencyKey }) {
    const r = await emails.sendEmail(crmCtxOf(actor), crmActorOf(actor), {
      contactId: input.contactId,
      subject: input.subject ?? null,
      bodyHtml: bodyOf(input),
      templateId: input.templateId ?? null,
      ...(input.vars ? { vars: input.vars } : {}),
      dealId: input.dealId ?? null,
      companyId: input.companyId ?? null,
      replyToEmailId: input.replyToEmailId ?? null,
      idempotencyKey,
    });
    return { emailId: r.emailId, threadKey: r.threadKey, status: r.status, reused: r.reused === true };
  },
});

const sendBulk = defineCrmOp({
  id: "emails.sendBulk",
  method: "POST",
  path: "/emails/send-bulk",
  kind: "danger",
  action: "crm.email.send",
  summary:
    "Send the same e-mail to up to 500 contacts (one message per contact, each checked against that customer's consent). " +
    "Needs confirm: true and a reason of at least 5 characters; the reason goes into the audit log. " +
    "The answer reports how many were sent, queued or failed and names the contacts that were skipped with the Thai reason.",
  label: "ส่งอีเมลเป็นกลุ่ม",
  input: z
    .object({
      contactIds: z.array(idStr).min(1).max(500),
      subject: subject.optional(),
      body: bodyHtml.optional(),
      bodyHtml: bodyHtml.optional(),
      templateId: optId,
      vars: TEMPLATE_VARS.optional(),
      scheduledAt: isoDate.optional(),
      reason,
    })
    .strict(),
  // AUDIT-CLASS X7 (รอบแก้ 25 ก.ย. · ผู้ตรวจ B1): ถัง `write` ไม่ใช่ `report` — `report` คือ 60 ครั้ง/นาที ซึ่งกับประตูนี้
  //   เท่ากับ 60 × 500 = 30,000 จดหมาย/นาที โดยไม่กินงบการเขียนเลย · การยิงกลุ่มคือ "การเขียน" ที่หนักที่สุดของ CRM
  rate: "write",
  test: "C2.11-X9.2",
  async handler({ actor, input, idempotencyKey }) {
    // AUDIT-CLASS X9: dispatch ของแกนถอด `confirm` ออกก่อนถึงสคีมาแล้ว ⇒ ส่งต่อให้บริการเองเพื่อให้ด่านของบริการยังมีผล
    return emails.sendBulk(crmCtxOf(actor), crmActorOf(actor), {
      contactIds: input.contactIds,
      subject: input.subject ?? null,
      bodyHtml: bodyOf(input),
      templateId: input.templateId ?? null,
      ...(input.vars ? { vars: input.vars } : {}),
      scheduledAt: input.scheduledAt ?? null,
      confirm: true,
      reason: input.reason,
      idempotencyKey,
    });
  },
});

const schedule = defineCrmOp({
  id: "emails.schedule",
  method: "POST",
  path: "/emails/schedule",
  kind: "write",
  action: "crm.email.send",
  summary: "Queue one e-mail to one contact for a time in the future (scheduledAt, ISO-8601). The minute job sends it; a time in the past is sent at once.",
  label: "ตั้งเวลาส่งอีเมล",
  input: sendInput.extend({ scheduledAt: isoDate }).strict(),
  test: "C2.11-S2.3",
  async handler({ actor, input, idempotencyKey }) {
    const r = await emails.sendEmail(crmCtxOf(actor), crmActorOf(actor), {
      contactId: input.contactId,
      subject: input.subject ?? null,
      bodyHtml: bodyOf(input),
      templateId: input.templateId ?? null,
      ...(input.vars ? { vars: input.vars } : {}),
      dealId: input.dealId ?? null,
      companyId: input.companyId ?? null,
      replyToEmailId: input.replyToEmailId ?? null,
      scheduledAt: input.scheduledAt,
      idempotencyKey,
    });
    return { emailId: r.emailId, threadKey: r.threadKey, status: r.status, scheduledAt: input.scheduledAt };
  },
});

const draft = defineCrmOp({
  id: "emails.draft",
  method: "POST",
  path: "/emails/draft",
  kind: "read",
  action: "crm.email.read",
  summary:
    "Build a draft e-mail for one contact WITHOUT sending anything: the suggested subject, an empty body with the sender's signature, " +
    "and the shop's templates to choose from. Nothing is written and no message is created - feed the result to POST /emails/send when the person agrees.",
  label: "ร่างอีเมล",
  input: z.object({ contactId: idStr, goal: text(300).optional(), templateId: optId }).strict(),
  rate: "read",
  test: "C2.11-S3.3",
  tool: { name: "crm_draft_email", hint: "Use to prepare the text of an e-mail to a contact. This only drafts - it never sends and never becomes a send." },
  async handler({ actor, input }) {
    const ctx = crmCtxOf(actor);
    const a = crmActorOf(actor);
    const [templates, mine] = await Promise.all([emails.listTemplates(ctx, a), emails.getUserSetting(ctx, a).catch(() => null)]);
    const picked = input.templateId ? templates.find((t) => t.id === input.templateId) ?? null : null;
    const goal = (input.goal ?? "").trim();
    return {
      contactId: input.contactId,
      // ไม่มีที่อยู่อีเมลในคำตอบ (AUDIT-CLASS X8 — ผู้ช่วยไม่ต้องรู้ที่อยู่เพื่อร่างจดหมาย · ผู้ส่งจริงคือบริการ)
      subject: picked ? picked.subject : goal ? goal.slice(0, CRM_EMAIL_SUBJECT_MAX) : "",
      bodyHtml: picked ? picked.bodyHtml : "",
      signatureHtml: mine?.signatureHtml ?? null,
      templates: templates.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, subject: t.subject })),
      sendWith: "POST /emails/send",
    };
  },
});

// ───────────────────────── ตั้งค่ารายคน · ที่อยู่ของร้าน ─────────────────────────

const userSettingsGet = defineCrmOp({
  id: "emails.userSettings.get",
  method: "GET",
  path: "/emails/user-settings",
  kind: "read",
  action: "crm.email.settings",
  summary: "The sender settings of the person this key acts for (from name, from address, reply-to mode, copy-to and the HTML signature). null = never set.",
  label: "ตั้งค่าผู้ส่งรายคน",
  input: z.object({ userId: idStr.optional() }).strict(),
  rate: "read",
  test: "C2.11-S2.3",
  async handler({ actor, input }) {
    const row = await emails.getUserSetting(crmCtxOf(actor), crmActorOf(actor), input.userId ?? null);
    return row ?? { userId: input.userId ?? actor.userId ?? null, signatureHtml: null, fromName: null };
  },
});

const userSettingsSet = defineCrmOp({
  id: "emails.userSettings.set",
  method: "PUT",
  path: "/emails/user-settings",
  kind: "write",
  action: "crm.email.settings",
  summary:
    "Change the sender settings of the person this key acts for: from name, from address, reply-to mode (SHARK, STAFF, SELF, CUSTOM) and address, " +
    "copy mode (NONE, IN, OUT, BOTH) and address, and the signature (field `signature`, HTML, sanitised before it is stored).",
  label: "แก้ตั้งค่าผู้ส่งรายคน",
  input: z
    .object({
      userId: idStr.optional(),
      fromName: optText(120),
      fromAddr: optText(200),
      replyToMode: z.enum(CRM_EMAIL_REPLY_MODES).optional(),
      replyToAddr: optText(200),
      copyMode: z.enum(CRM_EMAIL_COPY_MODES).optional(),
      copyToAddr: optText(200),
      signature: optText(4000),
      signatureHtml: optText(4000),
    })
    .strict(),
  test: "C2.11-S2.3",
  async handler({ actor, input }) {
    const { signature, signatureHtml, ...rest } = input;
    const patch: Record<string, unknown> = { ...rest };
    // ชื่อช่องที่ผู้เรียกใช้จริงคือ `signature` (คู่มือ/หน้าจอเรียกว่า "ลายเซ็น") — ฐานเก็บเป็น HTML ที่ผ่านตัวตัดแล้ว
    if (signatureHtml !== undefined) patch.signatureHtml = signatureHtml;
    else if (signature !== undefined) patch.signatureHtml = signature;
    return emails.setUserSetting(crmCtxOf(actor), crmActorOf(actor), patch);
  },
});

/** `SHARED` = ที่อยู่กลางของ SHARK (ฐานเก็บ `SHARK`) · `DOMAIN` = โดเมนของร้านที่ยืนยันแล้ว */
const ROUTING_MODES = ["SHARED", "SHARK", "DOMAIN"] as const;
const fromModeOf = (m: (typeof ROUTING_MODES)[number]): "SHARK" | "DOMAIN" => (m === "DOMAIN" ? "DOMAIN" : "SHARK");

const routingView = (s: Awaited<ReturnType<typeof emails.getEmailSettings>>) => ({
  mode: s.fromMode === "DOMAIN" ? "DOMAIN" : "SHARED",
  fromMode: s.fromMode,
  fromName: s.fromName,
  fromAddr: s.fromAddr,
  replyToMode: s.replyToMode,
  replyToAddr: s.replyToAddr,
  copyMode: s.copyMode,
  copyToAddr: s.copyToAddr,
  inboundEnabled: s.inboundEnabled,
  // ที่อยู่กล่องขาเข้าที่ร้านเอาไปตั้ง forward — คืนได้ (หน้าตั้งค่าโชว์อยู่แล้ว) · ตัวกุญแจดิบไม่คืน
  inboundAddress: s.inboundAddress,
  trackOpens: s.trackOpens,
  trackClicks: s.trackClicks,
  allowUserOverride: s.allowUserOverride,
  strangerToLead: s.strangerToLead,
  retentionDays: s.retentionDays,
});

const routingGet = defineCrmOp({
  id: "emails.routing.get",
  method: "GET",
  path: "/emails/routing",
  kind: "read",
  action: "crm.email.settings",
  summary:
    "How this shop's CRM sends and receives e-mail: mode (SHARED = the shared SHARK address, DOMAIN = the shop's verified domain), " +
    "from name and address, reply-to and copy rules, whether the inbox is on and the address customers reply to. The raw inbox key is never returned.",
  label: "ที่อยู่ส่ง/รับอีเมลของร้าน",
  input: z.object({}).strict(),
  rate: "read",
  test: "C2.11-S2.4",
  async handler({ actor }) {
    return routingView(await emails.getEmailSettings(crmCtxOf(actor), crmActorOf(actor)));
  },
});

const routingSet = defineCrmOp({
  id: "emails.routing.set",
  method: "PUT",
  path: "/emails/routing",
  kind: "write",
  action: "crm.email.settings",
  summary:
    "Change how the shop sends e-mail: mode (SHARED or DOMAIN - DOMAIN needs a verified domain), from name and address, reply-to mode and address, " +
    "copy mode and address, whether the CRM inbox is on, open and click tracking, and how many days message bodies are kept.",
  label: "แก้ที่อยู่ส่ง/รับอีเมลของร้าน",
  input: z
    .object({
      mode: z.enum(ROUTING_MODES).optional(),
      fromName: optText(120),
      fromAddr: optText(200),
      replyToMode: z.enum(CRM_EMAIL_REPLY_MODES).optional(),
      replyToAddr: optText(200),
      copyMode: z.enum(CRM_EMAIL_COPY_MODES).optional(),
      copyToAddr: optText(200),
      inboundEnabled: z.boolean().optional(),
      trackOpens: z.boolean().optional(),
      trackClicks: z.boolean().optional(),
      allowUserOverride: z.boolean().optional(),
      strangerToLead: z.boolean().optional(),
      retentionDays: z.number().int().min(30).max(3650).optional(),
    })
    .strict(),
  test: "C2.11-S2.4",
  async handler({ actor, input }) {
    const { mode, ...rest } = input;
    const patch: Record<string, unknown> = { ...rest };
    if (mode !== undefined) patch.fromMode = fromModeOf(mode);
    return routingView(await emails.setEmailSettings(crmCtxOf(actor), crmActorOf(actor), patch));
  },
});

const inboundRotate = defineCrmOp({
  id: "emails.inbound.rotate",
  method: "POST",
  path: "/emails/inbound/rotate-key",
  kind: "danger",
  action: "crm.email.settings",
  summary:
    "Give the CRM inbox a new address. The old address stops accepting mail at once, so anything a customer replies to it is lost - " +
    "needs confirm: true and a reason. The answer carries the new address; put it in the shop's forwarding rule right away.",
  label: "หมุนกุญแจกล่องอีเมล",
  input: z.object({ reason }).strict(),
  test: "C2.11-S2.4",
  async handler({ actor, input }) {
    const r = await emails.rotateInboundKey(crmCtxOf(actor), crmActorOf(actor), { confirm: true, reason: input.reason });
    return { inboundAddress: r.address, rotated: true };
  },
});

// ───────────────────────── แม่แบบจดหมาย ─────────────────────────

const templatesList = defineCrmOp({
  id: "emails.templates.list",
  method: "GET",
  path: "/emails/templates",
  kind: "read",
  action: "crm.email.read",
  summary: "The shop's e-mail templates (name, subject, body with {{contact.firstName}}-style variables, category and whether they are active).",
  label: "รายการแม่แบบอีเมล",
  input: z.object({ take, cursor }).strict(),
  rate: "read",
  test: "C2.11-S2.1",
  async handler({ actor, input }) {
    const rows = await emails.listTemplates(crmCtxOf(actor), crmActorOf(actor));
    const page = pageOfCursor(input.cursor);
    const size = input.take ?? 50;
    return { items: rows.slice((page - 1) * size, page * size), total: rows.length, nextCursor: page * size < rows.length ? pageCursor(page + 1) : null };
  },
});

const templatesUpsert = defineCrmOp({
  id: "emails.templates.upsert",
  method: "PUT",
  path: "/emails/templates",
  kind: "write",
  action: "crm.email.settings",
  summary: "Create an e-mail template, or change one by sending its id. The body is sanitised before it is stored; two templates cannot share a name.",
  label: "บันทึกแม่แบบอีเมล",
  input: z
    .object({ id: optId, name: text(120).min(1), subject, body: bodyHtml.optional(), bodyHtml: bodyHtml.optional(), category: optText(60), active: z.boolean().optional() })
    .strict(),
  test: "C2.11-S2.1",
  async handler({ actor, input }) {
    return emails.saveTemplate(crmCtxOf(actor), crmActorOf(actor), {
      id: input.id ?? null,
      name: input.name,
      subject: input.subject,
      bodyHtml: bodyOf(input) ?? "",
      category: input.category ?? null,
      ...(input.active === undefined ? {} : { active: input.active }),
    });
  },
});

const templatesDelete = defineCrmOp({
  id: "emails.templates.delete",
  method: "DELETE",
  path: "/emails/templates/{id}",
  kind: "danger",
  action: "crm.email.settings",
  summary:
    "Delete an e-mail template. A sequence step or an e-mail that is queued for later and points at it stops working, so this needs confirm: true and a reason. " +
    "The answer reports what still used it as inUse: { sequences, scheduled } - the same counts land in the audit log.",
  label: "ลบแม่แบบอีเมล",
  input: z.object({ reason }).strict(),
  test: "C2.11-X9.1",
  async handler({ actor, params }) {
    // MINOR 8 (ผู้ตรวจอิสระ 25 ก.ย.): บอกให้ชัดว่าตอนลบยังมีอะไรอ้างถึงแม่แบบนี้อยู่กี่ชิ้น (บริการนับ + ลงแถว audit ให้)
    const r = await emails.deleteTemplate(crmCtxOf(actor), crmActorOf(actor), params.id ?? "");
    return { templateId: params.id ?? "", deleted: true, inUse: r.inUse };
  },
});

export const EMAILS_OPS: ApiOp[] = [
  threadsList,
  threadGet,
  send,
  sendBulk,
  schedule,
  draft,
  userSettingsGet,
  userSettingsSet,
  routingGet,
  routingSet,
  inboundRotate,
  templatesList,
  templatesUpsert,
  templatesDelete,
];
