import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { scheduleDrain } from "@/lib/outbox-consumers";
// CRM C2.6 ▸ ด่านกันสแปม (มติ C24) — ตัวตรวจบริสุทธิ์ + เพดานความถี่บนฐาน อยู่ที่ `./spam-guard` ◂
import { submissionIpHash, submissionPageUrl, submissionReferrer, submissionWebSessionId } from "./crm-source";
import {
  FORM_HONEYPOT_FIELD,
  FORM_RESERVED_KEY_MSG,
  FORM_SPAM_GUARD_DEFAULTS,
  FORM_START_FIELD,
  checkFormRate,
  consumeFormStartToken,
  isReservedFormFieldKey,
  parseSpamGuard,
  readFormStartToken,
  verifyTurnstile,
  type FormLimiter,
} from "./spam-guard";

// Form builder v1 (WO-0054) — ฟอร์ม config ได้ + ลิงก์สาธารณะ /f/<token> + submissions → CRM lead
// scope: FormDef/FormSubmission เป็น tenant-axis → ฝั่งแอปใช้ tenantDb({ tenantId }) ทุก query
//   ฝั่ง public (/f/<token>) ยังไม่รู้ว่า tenant ไหนจนกว่าจะ resolve token → ต้อง lookup ด้วย
//   prisma ตรงครั้งเดียว (publicToken เป็น @unique ระดับ global — ปลอดภัยไม่ต้องมี tenant filter)
//   หลังได้ form.tenantId แล้ว op ที่เหลือกลับไปวิ่งผ่าน tenantDb (governed)

export type Ctx = { tenantId: string };

export const FIELD_TYPES = ["text", "phone", "email", "select", "textarea"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
const FIELD_TYPE_SET = new Set<string>(FIELD_TYPES);

export type FormFieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
};

export type FieldInput = {
  key?: unknown;
  label?: unknown;
  type?: unknown;
  required?: unknown;
  options?: unknown;
};

// ── validation ของชุด field (ใช้ทั้ง create + update) — throw ไทยเมื่อไม่ผ่าน ──
function validateFields(raw: unknown): FormFieldDef[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("ต้องมีช่องกรอกอย่างน้อย 1 ช่อง");
  }
  const seen = new Set<string>();
  return raw.map((r) => {
    const f = (r ?? {}) as FieldInput;
    const key = String(f.key ?? "").trim();
    const label = String(f.label ?? "").trim();
    const type = String(f.type ?? "");
    if (!key) throw new Error("ช่องกรอกต้องมีชื่อฟิลด์ (key)");
    // CRM C2.6 ▸ (รีวิวรอบ 2 · B1) ชื่อช่องห้ามชนกับช่องของด่านกันสแปม — ไม่งั้นคำตอบจริงของร้านจะถูกมองว่าเป็นบอต ◂
    if (isReservedFormFieldKey(key)) throw new Error(FORM_RESERVED_KEY_MSG);
    if (!label) throw new Error("ช่องกรอกต้องมีป้ายชื่อ");
    if (seen.has(key)) throw new Error(`ชื่อฟิลด์ซ้ำ: ${key}`);
    seen.add(key);
    if (!FIELD_TYPE_SET.has(type)) throw new Error(`ชนิดช่องกรอกไม่ถูกต้อง: ${type}`);
    const field: FormFieldDef = { key, label, type: type as FieldType, required: !!f.required };
    if (type === "select") {
      const options = (Array.isArray(f.options) ? f.options : [])
        .map((o) => String(o ?? "").trim())
        .filter(Boolean);
      if (options.length === 0) throw new Error("ช่องแบบตัวเลือกต้องมีอย่างน้อย 1 ตัวเลือก");
      field.options = options;
    }
    return field;
  });
}

function parseFields(json: unknown): FormFieldDef[] {
  return Array.isArray(json) ? (json as FormFieldDef[]) : [];
}

const asJson = (v: unknown) => v as Prisma.InputJsonValue;

// ── create ──
export type CreateFormInput = {
  name: string;
  description?: string | null;
  crmEnabled?: boolean;
  fields: FieldInput[];
};

export async function createForm(
  ctx: Ctx,
  input: CreateFormInput,
): Promise<{ id: string; publicToken: string }> {
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("กรุณาระบุชื่อฟอร์ม");
  const fields = validateFields(input.fields);
  // token สุ่มด้วย crypto (24 ไบต์ → base64url 32 ตัว ≥20) — ห้าม Math.random
  const publicToken = randomBytes(24).toString("base64url");

  const form = await tenantDb(ctx).formDef.create({
    data: {
      tenantId: ctx.tenantId, // ใส่ตรง ๆ (กติกา) — guard re-inject ค่าเดิมเป็น defense-in-depth
      name,
      description: input.description?.toString().trim() || null,
      crmEnabled: !!input.crmEnabled,
      publicToken,
      fieldsJson: asJson(fields),
    },
  });
  return { id: form.id, publicToken: form.publicToken };
}

// ── update (patch บางส่วน) ──
export type UpdateFormPatch = {
  name?: string;
  description?: string | null;
  crmEnabled?: boolean;
  active?: boolean;
  fields?: FieldInput[];
};

export async function updateForm(ctx: Ctx, id: string, patch: UpdateFormPatch): Promise<{ id: string }> {
  const data: Prisma.FormDefUpdateInput = {};
  if (patch.name !== undefined) {
    const n = String(patch.name).trim();
    if (!n) throw new Error("กรุณาระบุชื่อฟอร์ม");
    data.name = n;
  }
  if (patch.description !== undefined) data.description = patch.description?.toString().trim() || null;
  if (patch.crmEnabled !== undefined) data.crmEnabled = !!patch.crmEnabled;
  if (patch.active !== undefined) data.active = !!patch.active;
  if (patch.fields !== undefined) data.fieldsJson = asJson(validateFields(patch.fields));

  // tenantDb.update merge tenantId เข้า where → แก้ข้ามร้านไม่ได้ (P2025 โดยไม่เขียน)
  await tenantDb(ctx).formDef.update({ where: { id }, data });
  return { id };
}

// ── reads (ฝั่งแอป) ──
export async function listForms(ctx: Ctx) {
  const forms = await tenantDb(ctx).formDef.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { submissions: true } } },
  });
  return forms.map((f) => ({
    ...f,
    fields: parseFields(f.fieldsJson),
    submissionCount: f._count.submissions,
  }));
}

export async function getForm(ctx: Ctx, id: string) {
  const f = await tenantDb(ctx).formDef.findFirst({
    where: { id },
    include: { _count: { select: { submissions: true } } },
  });
  if (!f) return null;
  return { ...f, fields: parseFields(f.fieldsJson), submissionCount: f._count.submissions };
}

export async function listSubmissions(ctx: Ctx, formId: string, take = 200) {
  return tenantDb(ctx).formSubmission.findMany({
    where: { formId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

// ── public (/f/<token>) — ไม่ใช้ ctx ──
// resolve token ด้วย prisma ตรง (ดูเหตุผลหัวไฟล์) — คืนเฉพาะฟอร์ม active
export async function getPublicForm(token: string) {
  const f = await prisma.formDef.findUnique({ where: { publicToken: token } });
  if (!f || !f.active) return null;
  return {
    tenantId: f.tenantId, // white-label (WO-0064): หน้า /f/[token] ใช้ดึงแบรนด์ร้าน
    form: {
      id: f.id,
      name: f.name,
      description: f.description,
      crmEnabled: f.crmEnabled,
      fields: parseFields(f.fieldsJson),
    },
  };
}

/** คำตอบที่เก็บได้จริง (เฉพาะ key ที่ประกาศใน fieldsJson · required ต้องมี) — key แปลกปลอมถูกตัดทิ้งเงียบ ๆ */
function cleanAnswers(fields: FormFieldDef[], answers: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const fld of fields) {
    const rawVal = (answers ?? {})[fld.key];
    const val = typeof rawVal === "string" ? rawVal.trim() : rawVal;
    const empty = val === undefined || val === null || val === "";
    if (fld.required && empty) throw new Error(`กรุณากรอก "${fld.label}"`);
    if (!empty) clean[fld.key] = val;
  }
  return clean;
}

export async function submitPublicForm(
  token: string,
  answers: Record<string, unknown>,
  meta?: { ip?: string | null },
): Promise<{ id: string }> {
  // public resolve — prisma ตรง (publicToken @unique) แล้วค่อยวิ่งผ่าน tenantDb ต่อ
  const form = await prisma.formDef.findUnique({ where: { publicToken: token } });
  if (!form || !form.active) throw new Error("ฟอร์มนี้ปิดรับข้อมูลแล้ว");
  const fields = parseFields(form.fieldsJson);
  const clean = cleanAnswers(fields, answers);

  // CRM C1.8 ▸ lead เข้า CRM ย้ายไปเป็น consumer ของ `forms.submission.received` (`src/lib/platform/crm-bridges/forms.ts`)
  //   ระบบปลายทาง = `resolveFormCrmSystem(form)` · ผู้รับเป็นคนเขียน `FormSubmission.crmContactId` · ไม่มีระบบ CRM = ข้ามเงียบ ๆ เหมือนเดิม
  //   🔴 คำตอบ + แจ้งเตือน + event อยู่ใน **ธุรกรรมเดียว** (COMMON: emit ใน tx ของการเขียน) — ไม่มีคำตอบที่ไม่มี event (lead หาย)
  //      และไม่มี event ที่ชี้คำตอบที่ไม่มีอยู่ ◂

  const sub = await writeSubmission({ id: form.id, tenantId: form.tenantId, name: form.name }, clean, { ip: meta?.ip ?? null });
  return { id: sub.id };
}

/** ที่มาของคำตอบที่ใบ C2.6 เก็บเพิ่ม (คอลัมน์ของใบ C2.0 — nullable ทั้งหมด · ทางเดิมส่งแค่ ip) */
type SubmissionSource = {
  ip: string | null;
  pageUrl?: string | null;
  referrer?: string | null;
  utm?: Record<string, string> | null;
  webSessionId?: string | null;
};

/**
 * ผู้เขียน `FormSubmission` **ที่เดียว** ของโมดูล — ทางเดิม (`submitPublicForm`) และทางที่มีด่านกันสแปม
 * (`submitPublicFormGuarded`) ใช้ตัวนี้ร่วมกัน ⇒ ไม่มีวันมีคำตอบที่ไม่มี event / ไม่มีแจ้งเตือน
 * แจ้งเจ้าของว่ามี lead ใหม่ (ปิด "โมดูลเงียบ" — เดิม submit แล้วเงียบ ตกหล่น) · pattern เดียวกับ chat.announceInbound
 */
async function writeSubmission(
  form: { id: string; tenantId: string; name: string },
  clean: Record<string, unknown>,
  source: SubmissionSource,
): Promise<{ id: string }> {
  const leadName =
    (typeof clean.name === "string" && clean.name) ||
    (typeof clean.phone === "string" && clean.phone) ||
    "ไม่ระบุชื่อ";
  const sub = await prisma.$transaction(async (tx) => {
    const row = await tx.formSubmission.create({
      data: {
        tenantId: form.tenantId, // ใส่ตรง ๆ (กติกา) · ค้นฟอร์มด้วย token แล้ว = ร้านของฟอร์มนี้
        formId: form.id,
        answersJson: asJson(clean),
        ip: source.ip ?? null,
        // CRM C2.6 ▸ ที่มาของคำตอบ (utm/หน้า/ผู้แนะนำ/การเข้าชม) — ทางเดิมไม่ส่งค่าพวกนี้ ⇒ null เหมือนเดิม ◂
        ...(source.pageUrl !== undefined ? { pageUrl: source.pageUrl } : {}),
        ...(source.referrer !== undefined ? { referrer: source.referrer } : {}),
        ...(source.utm !== undefined ? { utm: (source.utm ?? null) as Prisma.InputJsonValue } : {}),
        ...(source.webSessionId !== undefined ? { webSessionId: source.webSessionId } : {}),
      },
    });
    await emitOutbox(tx, {
      tenantId: form.tenantId,
      type: "forms.submission.received",
      idempotencyKey: `forms.sub.${row.id}`,
      // CRM C1.8 ▸ AUDIT-CLASS X8: id ล้วน (crmContactId ยังไม่มีตอนนี้ — ผู้รับ CRM เขียนลงคำตอบเอง) ◂
      payload: { formId: form.id, submissionId: row.id },
    });
    await tx.appNotification.create({
      data: {
        tenantId: form.tenantId,
        title: "มีคนกรอกฟอร์มเข้ามา",
        body: `${form.name}: ${leadName} · ดูข้อมูล /app/forms/${form.id}`,
      },
    });
    return row;
  });
  scheduleDrain();
  return { id: sub.id };
}

// CRM C2.6 ▸ ด่านกันสแปม (มติ C24) + ที่มาของคำตอบ — **ทางใหม่** (`submitPublicForm` เดิมไม่ถูกแตะพฤติกรรมเลย)
//   ลำดับ: ฟอร์มเปิดอยู่ไหม → honeypot (กรอก = ตอบว่าสำเร็จแต่ไม่เขียนอะไร) → ตั๋วเริ่มกรอก/เวลาขั้นต่ำ →
//          เพดานความถี่บนฐาน (ต่อ IP-hash และต่อฟอร์ม) → Turnstile (เฉพาะเมื่อร้านเปิด **และ** มีกุญแจใน env) → เขียนคำตอบ
//   🔴 AUDIT-CLASS X8: `FormSubmission.ip` เก็บ **ค่าแฮช** (เดิมเก็บ IP ดิบ) · `pageUrl` เหลือแต่ `utm_*` · `referrer` ตัด query
//   🔴 ทุกการปฏิเสธ **ไม่เขียนอะไรเลย** (ไม่มีคำตอบ ไม่มี event ไม่มีแจ้งเตือน) และคืนข้อความไทยที่ไม่โทษผู้ใช้
export type GuardedFormResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: "CLOSED" | "TOO_FAST" | "RATE_LIMITED" | "TURNSTILE" | "VALIDATION"; message: string };

export type GuardedFormInput = { answers: Record<string, unknown>; hp?: string; st?: string; turnstileToken?: string };
export type GuardedFormMeta = {
  ip: string;
  userAgent?: string | null;
  pageUrl?: string | null;
  referrer?: string | null;
  utm?: Record<string, string> | null;
  visitorId?: string | null;
};
export type GuardedFormDeps = {
  turnstileVerify?: (token: string, ip: string) => Promise<boolean>;
  now?: Date;
  limiter?: FormLimiter;
};

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

export async function submitPublicFormGuarded(
  token: string,
  input: GuardedFormInput,
  meta: GuardedFormMeta,
  deps: GuardedFormDeps = {},
): Promise<GuardedFormResult> {
  const now = deps?.now ?? new Date();
  const form = await prisma.formDef.findUnique({ where: { publicToken: String(token ?? "") } });
  if (!form || !form.active) return { ok: false, reason: "CLOSED", message: "ฟอร์มนี้ปิดรับข้อมูลแล้ว — ติดต่อร้านได้ทางช่องทางอื่นนะ" };
  const guard = parseSpamGuard((form as unknown as { spamGuard?: unknown }).spamGuard ?? null);
  const fields = parseFields(form.fieldsJson);
  // CRM C2.6 ▸ (รีวิวรอบ 2 · B1) ฟอร์มเก่าที่ตั้งชื่อช่องชนกับของระบบ (มีมาก่อนกติกา "ห้ามใช้ `_sd_`"):
  //   **ไม่ตีความ** ค่านั้นเป็น honeypot / ตั๋วเริ่มกรอก — คำตอบจริงของร้านต้องไม่ถูกทิ้งเงียบ ๆ เพราะชื่อช่องชนกัน
  //   (หน้า `/crm/settings/forms` ขึ้นคำเตือนให้เจ้าของร้านเปลี่ยนชื่อช่อง) ◂
  const declared = new Set(fields.map((f) => String(f.key ?? "")));
  const honeypotOn = guard.honeypot && !declared.has(FORM_HONEYPOT_FIELD);
  const startTokenOn = !declared.has(FORM_START_FIELD);

  // 🔴 ของฝั่ง CRM (ตัวแทนของ IP · ตัวล้าง url · การเข้าชมที่ยินยอม) อยู่ใน `./crm-source` ไฟล์เดียว —
  //    ไฟล์นี้ต้องไม่อ้างถึงโมดูล CRM เลย (ด่าน `C1.8-S0.3`: ใบ C1.8 ย้ายการสร้าง lead ออกเป็นผู้รับ event)
  const ipHash = await submissionIpHash(String(meta?.ip ?? ""), now);

  // honeypot: ช่องที่คนมองไม่เห็น ⇒ มีค่ามาแปลว่าเป็นเครื่อง · ตอบเหมือนสำเร็จ (บอกความจริง = บอตแก้แล้วยิงใหม่)
  // 🔴 (รีวิวรอบ 2 · S4) นับเข้าเพดานความถี่ **ก่อน** ตอบกลับเสมอ — ไม่งั้นบอตที่กรอกช่องหลอกยิงได้ไม่จำกัดโดยไม่มีต้นทุน
  if (honeypotOn && String(input?.hp ?? "").trim() !== "") {
    await checkFormRate(form.id, ipHash, guard, deps?.limiter);
    return { ok: true, id: null };
  }

  const st = startTokenOn ? readFormStartToken(input?.st, form.id, now) : null;
  if (startTokenOn && (st === null || st.ageSec < guard.minSeconds)) {
    return { ok: false, reason: "TOO_FAST", message: "ส่งข้อมูลเร็วเกินไป — กรุณาเปิดฟอร์มใหม่แล้วกรอกอีกครั้ง" };
  }

  const passed = await checkFormRate(form.id, ipHash, guard, deps?.limiter);
  if (!passed) return { ok: false, reason: "RATE_LIMITED", message: "ส่งข้อมูลถี่เกินไป — รอสักครู่แล้วลองอีกครั้งนะ" };

  if (guard.turnstile && process.env.TURNSTILE_SECRET_KEY) {
    const verify = deps?.turnstileVerify ?? verifyTurnstile;
    const okTs = await verify(String(input?.turnstileToken ?? ""), String(meta?.ip ?? ""));
    if (!okTs) return { ok: false, reason: "TURNSTILE", message: "ยืนยันว่าไม่ใช่โปรแกรมอัตโนมัติไม่ผ่าน — กรุณาลองอีกครั้ง" };
  }

  let clean: Record<string, unknown>;
  try {
    clean = cleanAnswers(fields, input?.answers ?? {});
  } catch (e) {
    return { ok: false, reason: "VALIDATION", message: e instanceof Error ? e.message : "ข้อมูลยังไม่ครบ — ตรวจช่องที่มีเครื่องหมาย * อีกครั้ง" };
  }

  const utmIn = meta?.utm && typeof meta.utm === "object" ? meta.utm : null;
  const utmCapture = (form as unknown as { utmCapture?: boolean }).utmCapture !== false;
  let utm: Record<string, string> | null = null;
  if (utmCapture && utmIn) {
    const out: Record<string, string> = {};
    for (const k of UTM_KEYS) {
      const v = utmIn[k];
      if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 200);
    }
    utm = Object.keys(out).length > 0 ? out : null;
  }

  // การเข้าชมของผู้เข้าชมรายนี้ (ถ้าเว็บของร้านมีสคริปต์ติดตามและลูกค้ายอมรับคุกกี้) — ระบบ CRM ปลายทางของฟอร์มเท่านั้น
  let webSessionId: string | null = null;
  const visitorId = String(meta?.visitorId ?? "");
  if (visitorId) webSessionId = await submissionWebSessionId({ id: form.id, tenantId: form.tenantId }, visitorId);

  // CRM C2.6 ▸ (รีวิวรอบ 2 · S4) ตั๋วเริ่มกรอกใช้ได้ **ครั้งเดียว** — เผาตั๋วตรงนี้ (หลังด่านอื่นผ่านหมด ก่อนเขียน)
  //   🔴 ถ้าเผาก่อนตรวจคำตอบ คนที่กรอกไม่ครบแล้วกดส่งใหม่จะโดนปฏิเสธทั้งที่ไม่ได้ทำอะไรผิด ◂
  if (st && !(await consumeFormStartToken(st.nonce, deps?.limiter))) {
    return { ok: false, reason: "TOO_FAST", message: "ฟอร์มนี้ถูกส่งไปแล้ว — ถ้าต้องการส่งอีกครั้ง กรุณาเปิดฟอร์มใหม่แล้วกรอกใหม่นะ" };
  }

  const sub = await writeSubmission({ id: form.id, tenantId: form.tenantId, name: form.name }, clean, {
    ip: ipHash,
    pageUrl: await submissionPageUrl(meta?.pageUrl ?? null),
    referrer: await submissionReferrer(meta?.referrer ?? null),
    utm,
    webSessionId,
  });
  return { ok: true, id: sub.id };
}

/** โค้ดฝังฟอร์มบนเว็บของร้าน (iframe — `src/proxy.ts` ไม่ส่ง X-Frame-Options DENY ให้ `/f/*` แล้ว) */
export function formEmbedCode(form: { publicToken: string }, origin: string): string {
  const base = String(origin ?? "").replace(/\/+$/, "");
  const url = `${base}/f/${String(form?.publicToken ?? "")}`;
  return `<iframe src="${url}" style="width:100%;max-width:520px;height:680px;border:0" loading="lazy" title="แบบฟอร์มติดต่อ"></iframe>`;
}

// ── ฟอร์ม → CRM (หน้า `/crm/settings/forms` ของใบ C2.6 · เรียกผ่าน `crm/tracking.ts` เท่านั้น) ──
export type CrmFormTarget = {
  formId: string;
  name: string;
  active: boolean;
  crmEnabled: boolean;
  crmSystemId: string | null;
  assignRuleId: string | null;
  scoreOnSubmit: number | null;
  utmCapture: boolean;
  createCompanyFromField: string | null;
  spamGuard: Record<string, unknown> | null;
  fieldKeys: string[];
  /** CRM C2.6 ▸ (รีวิวรอบ 2 · B1) ชื่อช่องของฟอร์มนี้ที่ชนกับของด่านกันสแปม — หน้าตั้งค่าเอาไปขึ้นคำเตือน ◂ */
  reservedKeys: string[];
  embedCode: string;
  publicUrl: string;
};

type FormDefRow = {
  id: string;
  name: string;
  active: boolean;
  crmEnabled: boolean;
  publicToken: string;
  fieldsJson: unknown;
  crmSystemId: string | null;
  assignRuleId: string | null;
  scoreOnSubmit: number | null;
  utmCapture: boolean;
  createCompanyFromField: string | null;
  spamGuard: unknown;
};

const targetOf = (f: FormDefRow, origin: string): CrmFormTarget => ({
  formId: f.id,
  name: f.name,
  active: f.active,
  crmEnabled: f.crmEnabled,
  crmSystemId: f.crmSystemId ?? null,
  assignRuleId: f.assignRuleId ?? null,
  scoreOnSubmit: f.scoreOnSubmit ?? null,
  utmCapture: f.utmCapture !== false,
  createCompanyFromField: f.createCompanyFromField ?? null,
  spamGuard: f.spamGuard && typeof f.spamGuard === "object" && !Array.isArray(f.spamGuard) ? ({ ...parseSpamGuard(f.spamGuard) } as Record<string, unknown>) : ({ ...FORM_SPAM_GUARD_DEFAULTS } as Record<string, unknown>),
  fieldKeys: parseFields(f.fieldsJson).map((x) => x.key),
  reservedKeys: parseFields(f.fieldsJson).map((x) => String(x.key ?? "")).filter((k) => isReservedFormFieldKey(k)),
  embedCode: formEmbedCode({ publicToken: f.publicToken }, origin),
  publicUrl: `${String(origin ?? "").replace(/\/+$/, "")}/f/${f.publicToken}`,
});

const TARGET_SELECT = {
  id: true,
  name: true,
  active: true,
  crmEnabled: true,
  publicToken: true,
  fieldsJson: true,
  crmSystemId: true,
  assignRuleId: true,
  scoreOnSubmit: true,
  utmCapture: true,
  createCompanyFromField: true,
  spamGuard: true,
} as const;

/** ฟอร์มทั้งหมดของร้าน + การตั้งค่าฝั่ง CRM (AUDIT-CLASS X1: ผูก tenantId ของผู้เรียกเสมอ) */
export async function listCrmFormTargets(tenantId: string, origin: string): Promise<CrmFormTarget[]> {
  const rows = await tenantDb({ tenantId }).formDef.findMany({ where: { tenantId }, orderBy: [{ createdAt: "desc" }], take: 200, select: TARGET_SELECT });
  return rows.map((f) => targetOf(f as FormDefRow, origin));
}

export async function getCrmFormTarget(tenantId: string, formId: string, origin: string): Promise<CrmFormTarget | null> {
  const f = await tenantDb({ tenantId }).formDef.findFirst({ where: { id: String(formId ?? ""), tenantId }, select: TARGET_SELECT });
  return f ? targetOf(f as FormDefRow, origin) : null;
}

/** เขียนการตั้งค่าฝั่ง CRM ของฟอร์ม (ผู้เรียกตรวจว่า id ที่เลือกเป็นของร้านนี้มาแล้ว) */
export async function updateCrmFormTarget(
  tenantId: string,
  formId: string,
  patch: {
    crmSystemId?: string | null;
    assignRuleId?: string | null;
    scoreOnSubmit?: number | null;
    utmCapture?: boolean;
    createCompanyFromField?: string | null;
    spamGuard?: Record<string, unknown> | null;
    crmEnabled?: boolean;
  },
  origin: string,
): Promise<CrmFormTarget | null> {
  const data: Record<string, unknown> = {};
  if (patch?.crmSystemId !== undefined) data.crmSystemId = patch.crmSystemId ? String(patch.crmSystemId) : null;
  if (patch?.assignRuleId !== undefined) data.assignRuleId = patch.assignRuleId ? String(patch.assignRuleId) : null;
  if (patch?.scoreOnSubmit !== undefined) data.scoreOnSubmit = patch.scoreOnSubmit === null ? null : Math.floor(Number(patch.scoreOnSubmit));
  if (patch?.utmCapture !== undefined) data.utmCapture = !!patch.utmCapture;
  if (patch?.createCompanyFromField !== undefined) {
    // CRM C2.6 ▸ (รีวิวรอบ 2 · B1) ช่องที่ชี้ต้องไม่ใช่ชื่อที่ระบบสงวนไว้ ◂
    if (patch.createCompanyFromField && isReservedFormFieldKey(patch.createCompanyFromField)) throw new Error(FORM_RESERVED_KEY_MSG);
    data.createCompanyFromField = patch.createCompanyFromField ? String(patch.createCompanyFromField) : null;
  }
  if (patch?.crmEnabled !== undefined) data.crmEnabled = !!patch.crmEnabled;
  if (patch?.spamGuard !== undefined) data.spamGuard = patch.spamGuard === null ? null : (parseSpamGuard(patch.spamGuard) as unknown as Prisma.InputJsonValue);
  if (Object.keys(data).length > 0) {
    const n = await tenantDb({ tenantId }).formDef.updateMany({ where: { id: String(formId ?? ""), tenantId }, data: data as Prisma.FormDefUpdateManyMutationInput });
    if (n.count === 0) return null;
  }
  return getCrmFormTarget(tenantId, formId, origin);
}
// ◂ CRM C2.6

// CRM C1.8 ▸ ทางเชื่อม "คำตอบฟอร์ม ↔ ผู้ติดต่อ CRM" (ออกทาง facade `forms/index.ts` · ผู้เรียก = บริการผู้ติดต่อของ CRM)
//   รับ client ของธุรกรรมผู้เรียก ⇒ ธง (`crmContactId`) ถูกอ่าน/เขียนใต้ล็อกเดียวกับการสร้างผู้ติดต่อ (AUDIT-CLASS X4)
//   AUDIT-CLASS X1: ทุกคำสั่งผูก id + tenantId ของคำตอบ
type FormsDb = Pick<Prisma.TransactionClient, "formSubmission">;

/** ผู้ติดต่อ CRM ที่คำตอบนี้ผูกไว้แล้ว (ธงของสะพาน) — คำตอบไม่พบ/ร้านอื่น = null */
export async function submissionCrmContactId(db: FormsDb, tenantId: string, submissionId: string): Promise<string | null> {
  const row = await db.formSubmission.findFirst({ where: { id: submissionId, tenantId }, select: { crmContactId: true } });
  return row?.crmContactId ?? null;
}

/** ผูกคำตอบกับผู้ติดต่อ CRM ครั้งเดียว (มีแล้ว = ไม่ทับ) — คืน true เมื่อเขียนจริง */
export async function linkSubmissionCrmContact(db: FormsDb, tenantId: string, submissionId: string, contactId: string): Promise<boolean> {
  const n = await db.formSubmission.updateMany({ where: { id: submissionId, tenantId, crmContactId: null }, data: { crmContactId: contactId } });
  return n.count === 1;
}
// ◂ CRM C1.8
