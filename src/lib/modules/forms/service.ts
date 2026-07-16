import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { createContact } from "@/lib/modules/crm/service";

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

  const tdb = tenantDb({ tenantId: form.tenantId });

  // ส่ง lead เข้า CRM (ถ้าเปิด + tenant มีระบบ CRM ตัวแรก) — ไม่มีระบบ CRM → ข้ามเงียบ ๆ
  let crmContactId: string | null = null;
  if (form.crmEnabled) {
    const crmSystem = await tdb.appSystem.findFirst({
      where: { type: "CRM" },
      orderBy: { createdAt: "asc" },
    });
    if (crmSystem) {
      const nameField = fields.find((f) => f.key === "name") ?? fields.find((f) => f.type === "text");
      const nameVal = nameField ? clean[nameField.key] : undefined;
      const contact = await createContact(
        { tenantId: form.tenantId, systemId: crmSystem.id },
        {
          name: typeof nameVal === "string" && nameVal ? nameVal : "ไม่ระบุชื่อ",
          phone: typeof clean.phone === "string" ? clean.phone : null,
          email: typeof clean.email === "string" ? clean.email : null,
          source: "FORM",
        },
      );
      crmContactId = contact.id;
    }
  }

  const sub = await tdb.formSubmission.create({
    data: {
      tenantId: form.tenantId, // ใส่ตรง ๆ (กติกา) — guard re-inject ค่าเดิม
      formId: form.id,
      answersJson: asJson(clean),
      crmContactId,
      ip: meta?.ip ?? null,
    },
  });
  return { id: sub.id };
}
