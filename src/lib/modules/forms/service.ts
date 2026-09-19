import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { scheduleDrain } from "@/lib/outbox-consumers";

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

export async function submitPublicForm(
  token: string,
  answers: Record<string, unknown>,
  meta?: { ip?: string | null },
): Promise<{ id: string }> {
  // public resolve — prisma ตรง (publicToken @unique) แล้วค่อยวิ่งผ่าน tenantDb ต่อ
  const form = await prisma.formDef.findUnique({ where: { publicToken: token } });
  if (!form || !form.active) throw new Error("ฟอร์มนี้ปิดรับข้อมูลแล้ว");
  const fields = parseFields(form.fieldsJson);

  // เก็บเฉพาะ key ที่ประกาศใน fieldsJson (key แปลกปลอม → ตัดทิ้งเงียบ ๆ) + เช็ค required
  const clean: Record<string, unknown> = {};
  for (const fld of fields) {
    const rawVal = (answers ?? {})[fld.key];
    const val = typeof rawVal === "string" ? rawVal.trim() : rawVal;
    const empty = val === undefined || val === null || val === "";
    if (fld.required && empty) throw new Error(`กรุณากรอก "${fld.label}"`);
    if (!empty) clean[fld.key] = val;
  }

  // CRM C1.8 ▸ lead เข้า CRM ย้ายไปเป็น consumer ของ `forms.submission.received` (`src/lib/platform/crm-bridges/forms.ts`)
  //   ระบบปลายทาง = `resolveFormCrmSystem(form)` · ผู้รับเป็นคนเขียน `FormSubmission.crmContactId` · ไม่มีระบบ CRM = ข้ามเงียบ ๆ เหมือนเดิม
  //   🔴 คำตอบ + แจ้งเตือน + event อยู่ใน **ธุรกรรมเดียว** (COMMON: emit ใน tx ของการเขียน) — ไม่มีคำตอบที่ไม่มี event (lead หาย)
  //      และไม่มี event ที่ชี้คำตอบที่ไม่มีอยู่ ◂

  // แจ้งเจ้าของว่ามี lead ใหม่ (ปิด "โมดูลเงียบ" — เดิม submit แล้วเงียบ ตกหล่น)
  // pattern เดียวกับ chat.announceInbound: AppNotification + emitOutbox (1 submission = 1 lead จริง)
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
        ip: meta?.ip ?? null,
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
