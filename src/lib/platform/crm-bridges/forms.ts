// crm-bridges/forms.ts — ฟอร์มเว็บ → lead ใน CRM (ใบ C1.8 → ใบ C2.6 ต่อยอด · พิมพ์เขียว §7.2 แถวแรก · RESOLUTIONS R-E.3)
//
// เดิม `forms/service.ts#submitPublicForm` เรียก `crm.createContact` ตรง (ระบบ CRM ตัวแรกของร้าน) · ตอนนี้ฟอร์มแค่ยิง
// `forms.submission.received` { formId, submissionId } และ **ตัวนี้** เป็นผู้รับ (ของแถมใต้ `compose`)
//   uiVersion 2 ⇒ จับคู่ผู้ติดต่อเดิม (อีเมลไม่สนตัวพิมพ์ / เบอร์) · ไม่มี = lead ใหม่ (WEB_FORM · source "FORM" · sourceDetail {formId, submissionId, utm?})
//                 · กิจกรรม WEB 1 รายการต่อคำตอบ · ผู้ติดต่อที่ผูกสมาชิก ⇒ ไทม์ไลน์สมาชิก 1 แถว
//   uiVersion 1 ⇒ พฤติกรรม v1 เดิม (มติผู้คุมงาน C1.8 ข้อ 1 — ร้านบน prod ทุกร้านเป็น v1): ผู้ติดต่อใหม่ 1 รายต่อคำตอบ (ชื่อ/เบอร์/อีเมล · source "FORM")
//   ทั้งสองแบบ: `FormSubmission.crmContactId` เขียนโดยตัวนี้ · `bridgesEnabled = false` ⇒ ไม่ทำอะไรเลย

import { prisma } from "@/lib/core/db";
import * as crm from "@/lib/modules/crm";
import { logOps } from "@/lib/core/ops";
import { bridgeOpen, crmGate, payloadOf, str, timelineRow, type BridgeEvent } from "./core";

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

/**
 * ระบบ CRM ปลายทางของฟอร์ม — **จุดเดียว** ที่สะพานฟอร์มเลือกระบบ (ใบ C2.6 เปลี่ยนเฉพาะฟังก์ชันนี้)
 *   ฟอร์มมีช่อง "ระบบ CRM ของฟอร์ม" (คอลัมน์ `crmSystemId` ของใบ C2.0) และชี้ระบบ CRM ของร้านนี้จริง ⇒ ระบบนั้น
 *   ไม่มี/ชี้ผิด ⇒ ระบบ CRM **ตัวแรก** ของร้านเจ้าของฟอร์ม (createdAt เก่าสุด — R-E.3 · พฤติกรรมเดิมของ v1)
 * AUDIT-CLASS X1: ค้นฟอร์มด้วย id + tenantId และระบบด้วย tenantId ของฟอร์มเสมอ ⇒ ไม่มีวันได้ระบบของร้านอื่น · ร้านไม่มี CRM = null
 */
export async function resolveFormCrmSystem(form: { id: string; tenantId: string }): Promise<string | null> {
  if (!form?.id || !form?.tenantId) return null;
  const row = await prisma.formDef.findFirst({ where: { id: form.id, tenantId: form.tenantId } });
  if (!row) return null;
  const own = (row as unknown as Record<string, unknown>).crmSystemId;
  if (typeof own === "string" && own) {
    const sys = await prisma.appSystem.findFirst({ where: { id: own, tenantId: form.tenantId, type: "CRM" }, select: { id: true } });
    if (sys) return sys.id;
  }
  const first = await prisma.appSystem.findFirst({ where: { tenantId: form.tenantId, type: "CRM" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  return first?.id ?? null;
}

/** ช่องชื่อของฟอร์ม: key "name" ก่อน ไม่มีก็ช่องข้อความช่องแรก (เหมือน v1 เดิมใน forms/service) */
function nameKeyOf(fieldsJson: unknown): string | null {
  const list = Array.isArray(fieldsJson) ? fieldsJson : [];
  const fields = list
    .map((f) => payloadOf(f))
    .map((f) => ({ key: str(f.key), type: str(f.type) }))
    .filter((f): f is { key: string; type: string | null } => !!f.key);
  return fields.find((f) => f.key === "name")?.key ?? fields.find((f) => f.type === "text")?.key ?? null;
}

/**
 * `forms.submission.received` → lead / กิจกรรม ในระบบของ `resolveFormCrmSystem(form)` — **ขั้นหลักที่ retry ได้** (มติผู้คุมงาน C1.8 ข้อ 2)
 *   ผู้เรียก (`outbox-consumers.ts`) วิ่งขั้นนี้ **ก่อน** automation/journey/บอร์ดงาน: ล้มชั่วคราว (ฐานข้อมูล) ⇒ โยน ⇒ event ถูกส่งใหม่
 *   และขั้นอื่นยังไม่ได้วิ่ง (ไม่มี automation ซ้ำ) · ข้อมูลใช้ไม่ได้ถาวร (ContactsError) ⇒ WARN (id ล้วน) แล้วจบ ไม่ขวางขั้นอื่น
 * AUDIT-CLASS X1: คำตอบค้นด้วย id + tenantId ของ event และต้องเป็นของฟอร์มใน payload ⇒ event ปลอมที่ถือ id ของร้านอื่น = ไม่ทำอะไร
 * AUDIT-CLASS X4: (1) คำตอบที่มี `crmContactId` แล้ว (ทางเดิมก่อน C1.8 เขียนไว้ตอนส่ง หรือรอบก่อนของ event นี้) ⇒ จบทันที
 *   (2) ธงเดียวกันถูกตรวจซ้ำใต้ล็อกในบริการผู้ติดต่อ และเขียนใน tx เดียวกับ lead ⇒ ส่งซ้ำ/พร้อมกัน = ผลครั้งเดียว
 * AUDIT-CLASS X3: คำตอบคนละใบ อีเมล/เบอร์เดียวกัน ยิงพร้อมกัน ⇒ ล็อกตัวตนของบริการผู้ติดต่อ ⇒ Party เดียว (v2: ผู้ติดต่อเดียว)
 * AUDIT-CLASS X8: ไม่ log คำตอบ/ชื่อ/เบอร์/อีเมล · event ที่เกิดต่อเป็น id ล้วน
 */
export async function onFormLead(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const submissionId = str(p.submissionId);
  const formId = str(p.formId);
  if (!submissionId || !formId) return;
  if (str(p.crmContactId)) return; // event ของทางเดิม (ก่อน C1.8) — lead ถูกสร้างตอนส่งฟอร์มไปแล้ว
  const sub = await prisma.formSubmission.findFirst({
    where: { id: submissionId, tenantId: evt.tenantId, formId },
    // CRM C2.6 ▸ ที่มาของคำตอบ (utm/การเข้าชม) ต้องอ่านมาด้วย — ใช้ต่อในขั้น "ผูกการเข้าชมเข้ากับลูกค้า" ◂
    select: { id: true, formId: true, answersJson: true, crmContactId: true, utm: true, webSessionId: true },
  });
  if (!sub) return;
  const form = await prisma.formDef.findFirst({
    where: { id: sub.formId, tenantId: evt.tenantId },
    // CRM C2.6 ▸ การตั้งค่าฝั่ง CRM ของฟอร์ม (กฎมอบหมาย · คะแนน · บริษัทจากช่อง) ◂
    select: { id: true, tenantId: true, name: true, crmEnabled: true, fieldsJson: true, assignRuleId: true, scoreOnSubmit: true, createCompanyFromField: true },
  });
  if (!form || !form.crmEnabled) return;
  const systemId = await resolveFormCrmSystem({ id: form.id, tenantId: form.tenantId });
  if (!systemId) return;
  // ประตู: สวิตช์ปิดสะพาน = ไม่ทำอะไร · uiVersion 1 = lead แบบ v1 เดิม (มติผู้คุมงาน C1.8 ข้อ 1) · uiVersion 2 = แบบ v2
  const gate = await crmGate(evt.tenantId, systemId);
  if (!gate || !gate.bridgesEnabled) return;
  const v2 = gate.uiVersion === 2;

  const answers = payloadOf(sub.answersJson);
  const nameKey = nameKeyOf(form.fieldsJson);
  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = str(answers[`utm_${k}`]);
    if (v) utm[k] = v;
  }
  // CRM C2.6 ▸ utm ที่ "หน้าเว็บ" ส่งมาตอนกรอก (คอลัมน์ `FormSubmission.utm` ของใบ C2.0) ชนะค่าที่ซ่อนเป็นช่องในฟอร์ม
  {
    const captured = payloadOf(sub.utm);
    for (const k of UTM_KEYS) {
      const v = str(captured[k]);
      if (v) utm[k] = v;
    }
  }
  // ◂ CRM C2.6
  // CRM C2.6 ▸ คำตอบนี้ถูกทำเป็น lead ไปแล้วหรือยัง — ยังไม่ทำ = สร้าง · ทำแล้ว = ข้ามไปทำ "ของแถม" ที่ยังไม่ครบ (idempotent)
  //   🔴 ห้าม `return` ทิ้งเมื่อมี `crmContactId` แล้ว: ขั้นบริษัท/คะแนน/ผูกการเข้าชม อยู่หลัง lead — ถ้าขั้นใดล้มชั่วคราว
  //      (ฐานสะดุด) event จะถูกส่งใหม่ และรอบใหม่ต้อง "ทำต่อ" ได้ ไม่ใช่เงียบไปตลอดกาล ◂
  let leadContactId = sub.crmContactId ?? null;
  if (leadContactId) {
    if (v2) await applyFormExtras(evt, { systemId, form, sub: { id: sub.id, webSessionId: sub.webSessionId ?? null }, answers, contactId: leadContactId });
    return;
  }
  try {
    const lead = await crm.contacts.leadFromBridge(
      { tenantId: evt.tenantId, systemId, actorUserId: null },
      {
        kind: v2 ? "FORM" : "FORM_V1",
        name: nameKey ? str(answers[nameKey]) : null,
        phone: str(answers.phone),
        email: str(answers.email),
        submissionId: sub.id,
        sourceDetail: { formId: form.id, submissionId: sub.id, ...(Object.keys(utm).length > 0 ? { utm } : {}) },
        activityTitle: `ลูกค้ากรอกฟอร์ม “${form.name}”`,
        // CRM C2.3 ▸ ภาษาของลูกค้า → เงื่อนไข "ภาษา" ของกฎมอบหมาย · `FormDef`/`FormSubmission` ยังไม่มีคอลัมน์ภาษา (ตรวจสคีมาแล้ว)
        //   ⇒ อ่านจากคำตอบของฟอร์มเมื่อร้านตั้งช่องไว้ (`locale` · `language` · `ภาษา`) · ไม่มีช่องนั้น = ไม่ส่ง (คอลัมน์ใช้ค่าเริ่มต้นเดิม)
        //   ช่องภาษาของตัวฟอร์มเอง (เลือกภาษาตอนเปิดลิงก์) เป็นงานของใบ C2.6 ◂
        locale: str(answers.locale) ?? str(answers.language) ?? str(answers["ภาษา"]),
        // CRM C2.6 ▸ ปิดหนี้ B2/B3 ของใบ C2.3: คำตอบทุกช่องไหลเข้าฟิลด์กำหนดเองของผู้ติดต่อ (บริการเก็บเฉพาะคีย์ที่ร้าน
        //   มีฟิลด์นั้นจริง · คีย์ที่ไม่รู้จักถูกทิ้งเงียบ ๆ) ⇒ เงื่อนไข `f.<key>` และ "ภาษา" ของกฎมอบหมายใช้งานได้จริง
        fields: answers,
        // CRM C2.6 ▸ กฎมอบหมายที่ฟอร์มตั้งไว้ (`FormDef.assignRuleId`) — ชนะลำดับของกฎอื่น (C2.3 `pick` ตรวจว่าเป็นกฎของระบบนี้) ◂
        ruleId: str(form.assignRuleId),
      },
    );
    leadContactId = lead.contactId;
  } catch (e) {
    if (!(e instanceof crm.contacts.ContactsError)) throw e; // ชั่วคราว ⇒ คิวส่งใหม่
    await logOps("WARN", "crm", `ส่งคำตอบฟอร์มเข้า CRM ไม่ได้ (${e.code}) — คำตอบ ${sub.id} · ระบบ ${systemId}`, { tenantId: evt.tenantId });
    return;
  }
  // CRM C2.6 ▸ ของแถมของ lead จากฟอร์ม (v2 เท่านั้น): บริษัทจากช่อง · คะแนน · ผูกการเข้าชมเว็บย้อนหลัง ◂
  if (v2 && leadContactId) await applyFormExtras(evt, { systemId, form, sub: { id: sub.id, webSessionId: sub.webSessionId ?? null }, answers, contactId: leadContactId });
}

// CRM C2.6 ▸ ของแถมหลัง lead (ทั้งหมด **ทำซ้ำได้**: ตรวจธงก่อนเขียนใต้ล็อกของ (คำตอบ, ขั้น) เดียวกัน)
//   1) บริษัทจากช่องที่ร้านเลือก (`FormDef.createCompanyFromField`) — บริษัทเดิมชื่อเดียวกัน = ไม่สร้างใบที่สอง
//   2) คะแนนเมื่อกรอกฟอร์ม (`FormDef.scoreOnSubmit`) — CrmScoreLog 1 แถวต่อคำตอบ (`eventKey crm.form.score#<คำตอบ>`)
//      + บวกคะแนนในคำสั่ง SQL เดียว (AUDIT-CLASS X3) · ใบ C2.8 เป็นเจ้าของเครื่องคะแนนตัวจริงในอนาคต
//   3) ผูกการเข้าชมเว็บย้อนหลัง (`FormSubmission.webSessionId` → ผู้เข้าชม) ผ่าน `tracking.identify(… "FORM")`
//      ⇒ กิจกรรม WEB 1 รายการต่อวันไทย + event `crm.web.identified` เกิดจากที่นั่นที่เดียว
//   AUDIT-CLASS X4: ส่ง event ซ้ำ/พร้อมกันกี่รอบ ผลลัพธ์ยังครั้งเดียว · AUDIT-CLASS X8: ไม่ log ชื่อ/เบอร์/อีเมล
async function applyFormExtras(
  evt: BridgeEvent,
  args: {
    systemId: string;
    form: { id: string; name: string; scoreOnSubmit: number | null; createCompanyFromField: string | null };
    sub: { id: string; webSessionId: string | null };
    answers: Record<string, unknown>;
    contactId: string;
  },
): Promise<void> {
  const ctx = { tenantId: evt.tenantId, systemId: args.systemId, actorUserId: null };
  const companyKey = str(args.form.createCompanyFromField);
  if (companyKey) {
    const companyName = str(args.answers[companyKey]);
    if (companyName) {
      try {
        await prisma.$transaction(async (tx) => {
          const co = await crm.companies.createInTx(tx, ctx, { name: companyName });
          await crm.companies.linkContactInTx(tx, ctx, co.id, args.contactId, { primaryIfNone: true });
        });
      } catch (e) {
        await logOps("WARN", "crm", `สร้างบริษัทจากช่องในฟอร์มไม่ได้ — คำตอบ ${args.sub.id} · ระบบ ${args.systemId} · ${e instanceof Error ? e.name : "unknown"}`, { tenantId: evt.tenantId });
      }
    }
  }
  const points = Number(args.form.scoreOnSubmit ?? 0);
  if (Number.isInteger(points) && points > 0) {
    const eventKey = `crm.form.score#${args.sub.id}`;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm:form-score:${args.sub.id}`}, 0))`;
      const already = await tx.crmScoreLog.findFirst({ where: { tenantId: evt.tenantId, contactId: args.contactId, eventKey }, select: { id: true } });
      if (already) return;
      await tx.crmScoreLog.create({
        data: { tenantId: evt.tenantId, contactId: args.contactId, points, reason: "ลูกค้ากรอกฟอร์มบนเว็บ", refType: "FormSubmission", refId: args.sub.id, eventKey },
      });
      await tx.$executeRaw`UPDATE "CrmContact" SET "score" = "score" + ${points} WHERE "id" = ${args.contactId} AND "tenantId" = ${evt.tenantId}`;
    });
  }
  if (args.sub.webSessionId) {
    const session = await prisma.crmWebSession.findFirst({
      where: { id: args.sub.webSessionId, tenantId: evt.tenantId, systemId: args.systemId },
      select: { visitorId: true },
    });
    if (session?.visitorId) {
      await crm.tracking.identify({ tenantId: evt.tenantId, systemId: args.systemId }, { visitorId: session.visitorId, contactId: args.contactId, by: "FORM" });
    }
  }
}
// ◂ CRM C2.6

/**
 * ของแถม (ใต้ compose): ผู้ติดต่อ v2 ที่ผูกสมาชิก ⇒ ไทม์ไลน์สมาชิก 1 แถวต่อคำตอบ (member.recordOnce · refId = คำตอบ)
 * อ่านผลของขั้นหลักจาก `FormSubmission.crmContactId` · ล้ม = WARN ไม่ทำให้ event ล้ม
 */
export async function onFormTimeline(evt: BridgeEvent): Promise<void> {
  const p = payloadOf(evt.payload);
  const submissionId = str(p.submissionId);
  const formId = str(p.formId);
  if (!submissionId || !formId) return;
  const sub = await prisma.formSubmission.findFirst({ where: { id: submissionId, tenantId: evt.tenantId, formId }, select: { id: true, crmContactId: true, form: { select: { name: true } } } });
  if (!sub?.crmContactId) return;
  const contact = await prisma.crmContact.findFirst({ where: { id: sub.crmContactId, tenantId: evt.tenantId }, select: { id: true, systemId: true, memberCustomerId: true } });
  if (!contact?.memberCustomerId) return;
  const gate = await crmGate(evt.tenantId, contact.systemId);
  if (!bridgeOpen(gate)) return;
  await timelineRow(evt, {
    customerId: contact.memberCustomerId,
    type: "FORM_SUBMITTED",
    summary: `กรอกฟอร์ม “${sub.form.name}”`,
    crmContactId: contact.id,
    refType: "FormSubmission",
    refId: sub.id,
    data: { formId, submissionId: sub.id },
  });
}
