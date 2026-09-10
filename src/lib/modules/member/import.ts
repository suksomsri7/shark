// import.ts — นำเข้าสมาชิกจาก CSV 3 ขั้น + ลิงก์/QR สมัครเอง (WO M1.6 · พิมพ์เขียว §5.2 §11.1 §11.9)
//
// กติกาประจำไฟล์ (สืบทอดจาก profile.ts/fields.ts)
//   • ไม่เขียนไฟล์ขึ้นเซิร์ฟเวอร์ — ฝั่ง client parse CSV เองแล้วส่ง rows เป็น JSON (MembersImportWizard.tsx)
//   • previewImport **ไม่เขียนอะไรลง DB** — ใช้ `fields.checkFieldValue` ตัวเดียวกับที่ `importMembers` ใช้จริง
//     (สองเส้นทางตรวจไม่มีวันไม่ตรงกัน เพราะเรียกฟังก์ชันเดียวกัน)
//   • สร้าง/แก้ไขจริงผ่าน `profile.createMember` / `profile.updateMember` เท่านั้น — ไม่แตะ `prisma.customer.create/update` ตรง
//     (บันทึกกิจกรรม/attribution/consent/event `member.created`/`member.updated` ได้ครบจากทางเดียวที่มีอยู่แล้ว)
//   • `onDuplicate: "candidate"` ไม่มีวัน "บังคับสร้างทับเบอร์ที่ซ้ำ" ได้จริง (เบอร์ unique ต่อระบบสมาชิกในสคีมา)
//     ⇒ โหมดนี้จึงมีความหมายเฉพาะแถวที่ **ไม่ชนเบอร์/อีเมล** แต่ชื่อคล้ายคนเดิม (สร้างสำเร็จ + ตั้งข้อสงสัยไว้ให้คนดู)
//     แถวที่ชนเบอร์/อีเมลตรง ๆ ในโหมดนี้ = `createMember` เดิมคืน `created:false` เอง → นับเป็น skip (ตัดสินใจไว้ใน wo-notes)

import type { MemberStatus } from "@prisma/client";
import QRCode from "qrcode";
import { writeAudit } from "@/lib/core/audit";
import { publicOrigin } from "@/lib/core/origin";
import * as party from "@/lib/modules/party";
import { prisma } from "./db";
import { hasMemberPerm, coversUnit, type MemberActor } from "./access";
import { MemberForbiddenError, MemberInputError } from "./errors";
import { MEMBER_LIMITS, memberLimitError } from "./limits";
import * as fieldsMod from "./fields";
import * as profile from "./profile";
import type { MemberCtx } from "./profile";

export type { MemberCtx } from "./profile";

// ───────────────────────── สิทธิ์ ─────────────────────────

function requirePerm(actor: MemberActor, key: string, what: string): void {
  if (!hasMemberPerm(actor, key)) {
    throw new MemberForbiddenError(`บัญชีของคุณยังไม่ได้รับสิทธิ์${what} — ขอสิทธิ์จากเจ้าของร้านก่อน`);
  }
}

// ───────────────────────── จับคู่คอลัมน์อัตโนมัติ ─────────────────────────

/** normalize หัวคอลัมน์ก่อนเทียบ (แบบเดียวกับ `core/csv.ts#columnIndex`) — ตัดช่องว่าง/_/-, ตัวพิมพ์เล็ก */
function normHeader(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]/g, "");
}

/** ป้ายพ้องของฟิลด์ระบบยอดฮิต — key เป็น normHeader() แล้ว (WO M1.6: ป้ายในทะเบียนไม่ตรงกับหัวคอลัมน์ทั่วไปเป๊ะทุกตัว) */
const HEADER_SYNONYMS: Record<string, string> = {
  "ชื่อ": "firstName",
  "ชื่อจริง": "firstName",
  "firstname": "firstName",
  "นามสกุล": "lastName",
  "lastname": "lastName",
  "เบอร์โทร": "phone",
  "เบอร์โทรศัพท์": "phone",
  "โทรศัพท์": "phone",
  "เบอร์มือถือ": "phone",
  "เบอร์": "phone",
  "phone": "phone",
  "mobile": "phone",
  "tel": "phone",
  "อีเมล": "email",
  "อีเมล์": "email",
  "email": "email",
  "วันเกิด": "birthDate",
  "birth": "birthDate",
  "birthday": "birthDate",
  "dateofbirth": "birthDate",
};

/**
 * จับคู่หัวคอลัมน์ไฟล์ CSV → key ของฟิลด์ในระบบสมาชิกนี้ (ระบบ + กำหนดเอง)
 * ลำดับ: ป้ายพ้องของฟิลด์ยอดฮิต → ป้าย (label) ของฟิลด์ที่มีจริงในระบบนี้ (ตรงเป๊ะหลัง normalize) → ไม่รู้จัก = null
 */
export async function autoMapping(ctx: MemberCtx, headers: string[]): Promise<Record<string, string | null>> {
  const fieldByKey = await loadFieldByKey(ctx);
  const byNormLabel = new Map<string, string>();
  for (const field of fieldByKey.values()) byNormLabel.set(normHeader(field.label), field.key);

  const out: Record<string, string | null> = {};
  for (const header of headers) {
    const norm = normHeader(header);
    const synonymKey = HEADER_SYNONYMS[norm];
    if (synonymKey && fieldByKey.has(synonymKey)) {
      out[header] = synonymKey;
      continue;
    }
    out[header] = byNormLabel.get(norm) ?? null;
  }
  return out;
}

// ───────────────────────── ตัวช่วยร่วม (preview + import ใช้ชุดเดียวกัน) ─────────────────────────

async function loadFieldByKey(ctx: MemberCtx): Promise<Map<string, fieldsMod.FieldDef>> {
  const layout = await fieldsMod.listLayout(ctx);
  const all = layout.sections.flatMap((s) => s.fields);
  return new Map(all.map((f) => [f.key, f]));
}

/** ทุกค่าปลายทางของ mapping (ที่ไม่ใช่ "skip") ต้องมีฟิลด์จริงในระบบนี้ — ผิด = throw ทั้งชุด (ก่อนแตะแถวไหนเลย) */
function assertMappingKnown(mapping: Record<string, string>, fieldByKey: Map<string, fieldsMod.FieldDef>): void {
  for (const target of Object.values(mapping)) {
    if (!target || target === "skip") continue;
    if (!fieldByKey.has(target)) {
      throw new MemberInputError(`คอลัมน์เป้าหมาย "${target}" ไม่มีฟิลด์นี้ในระบบสมาชิกนี้ — ตรวจการจับคู่คอลัมน์อีกครั้ง`);
    }
  }
}

/** ค่าดิบจาก CSV (ข้อความล้วน) → รูปแบบที่ `fields.checkFieldValue` ต้องการตามชนิดฟิลด์ · ว่าง → null (ไม่ใช่ "ไม่กรอก") */
function coerceRaw(type: fieldsMod.FieldDef["type"], raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  switch (type) {
    case "NUMBER":
    case "MONEY": {
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : trimmed; // ไม่ใช่ตัวเลข → ส่งสตริงต่อให้ checkFieldValue โยนข้อความไทยที่ถูกต้อง
    }
    case "BOOLEAN": {
      const v = trimmed.toLowerCase();
      if (["true", "1", "yes", "ใช่"].includes(v)) return true;
      if (["false", "0", "no", "ไม่ใช่"].includes(v)) return false;
      return trimmed;
    }
    case "MULTI_SELECT":
      return trimmed
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    default:
      return trimmed;
  }
}

type RowValidation = { values: Record<string, fieldsMod.MemberFieldValueInput>; error?: string };

/**
 * ตรวจ 1 แถว (ไม่เขียน) — ใช้ร่วมกันทั้ง `previewImport`/`importMembers`
 * err: เบอร์ผิดจำนวนหลัก · ค่าไม่ผ่าน `checkFieldValue` (นอกตัวเลือก/ชนิดผิด/บังคับว่าง) · ไม่มีเบอร์และอีเมล
 */
function validateRow(
  fieldByKey: Map<string, fieldsMod.FieldDef>,
  mapping: Record<string, string>,
  row: Record<string, string>,
): RowValidation {
  const values: Record<string, fieldsMod.MemberFieldValueInput> = {};
  for (const [header, target] of Object.entries(mapping)) {
    if (!target || target === "skip") continue;
    const field = fieldByKey.get(target);
    if (!field) continue;
    const raw = String(row[header] ?? "");

    if (target === "phone" && raw.trim() !== "") {
      const norm = party.normalizePartyPhone(raw.trim());
      if (norm.length < 9) {
        return { values, error: `เบอร์โทร "${raw.trim()}" ยังไม่ครบจำนวนหลัก — กรอกเบอร์ 10 หลัก เช่น 0812345678` };
      }
    }

    try {
      const coerced = coerceRaw(field.type, raw);
      const value = fieldsMod.checkFieldValue(field, coerced);
      if (value !== null) values[target] = value;
    } catch (e) {
      return { values, error: e instanceof Error ? e.message : "ข้อมูลของแถวนี้ไม่ถูกต้อง — ตรวจอีกครั้ง" };
    }
  }
  if (!values.phone && !values.email) {
    return { values, error: "ต้องมีเบอร์โทรหรืออีเมลอย่างน้อย 1 อย่าง เพื่อใช้ยืนยันตัวสมาชิกครั้งต่อไป" };
  }
  return { values };
}

/** สมาชิกเดิมที่ตรงเบอร์/อีเมล (ไม่รวมคนที่ถูกรวมไปแล้ว) — เบอร์ก่อนอีเมลเสมอ (แบบเดียวกับ `profile.ts#findExisting`) */
async function findExistingLocal(ctx: MemberCtx, keys: { phone?: string | null; email?: string | null }) {
  const base = { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, status: { not: "MERGED" as MemberStatus } };
  if (keys.phone) {
    const row = await prisma.customer.findFirst({ where: { ...base, phone: keys.phone } });
    if (row) return row;
  }
  if (keys.email) {
    const row = await prisma.customer.findFirst({ where: { ...base, email: keys.email } });
    if (row) return row;
  }
  return null;
}

const CORE_KEYS = ["phone", "email", "firstName", "lastName", "name", "nickname", "birthDate", "gender"] as const;
type CoreKey = (typeof CORE_KEYS)[number];

/** แยกค่าที่ผ่านการตรวจแล้วเป็นชุด "พารามิเตอร์บนสุดของ createMember" กับ "ฟิลด์ที่เหลือ" (ระบบ+กำหนดเอง) */
function splitCoreFields(values: Record<string, fieldsMod.MemberFieldValueInput>): {
  core: Record<CoreKey, string | null>;
  rest: Record<string, unknown>;
} {
  const asStr = (v: fieldsMod.MemberFieldValueInput | undefined): string | null => (typeof v === "string" ? v : null);
  const coreSet = new Set<string>(CORE_KEYS);
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!coreSet.has(k)) rest[k] = v;
  }
  return {
    core: {
      phone: asStr(values.phone),
      email: asStr(values.email),
      firstName: asStr(values.firstName),
      lastName: asStr(values.lastName),
      name: asStr(values.name),
      nickname: asStr(values.nickname),
      birthDate: asStr(values.birthDate),
      gender: asStr(values.gender),
    },
    rest,
  };
}

/**
 * แถวที่สร้างสำเร็จในโหมด "candidate" — สงสัยว่าซ้ำกับใครไหมจากชื่อ (ไม่ใช่เบอร์/อีเมล ซึ่งตรวจแยกไปแล้ว)
 * เจอ → บันทึก PartyMergeCandidate เหตุผล NAME_SIMILAR (กลไกเดียวกับที่ `profile.findDuplicates` อ่าน)
 */
async function flagNameCandidate(ctx: MemberCtx, customerId: string, partyId: string | null, name: string): Promise<boolean> {
  const q = name.trim();
  if (!partyId || q.length < 2) return false;
  const rows = await prisma.customer.findMany({
    where: {
      tenantId: ctx.tenantId,
      memberSystemId: ctx.systemId,
      id: { not: customerId },
      status: { not: "MERGED" },
      partyId: { not: null },
      OR: [{ name: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }],
    },
    take: 5,
  });
  for (const row of rows) {
    if (!row.partyId) continue;
    if (party.nameSimilarity(row.name ?? "", q) >= 0.9) {
      const res = await party.recordMergeCandidatePair(ctx.tenantId, row.partyId, partyId, "NAME_SIMILAR");
      if (res) return true;
    }
  }
  return false;
}

// ───────────────────────── ขั้น 3: ตรวจแถว (ไม่เขียน) ─────────────────────────

export type ImportPreviewRow = {
  row: number;
  status: "ok" | "warn" | "err";
  message?: string;
  duplicateOf?: profile.MemberBrief;
};
export type ImportPreviewResult = { ok: number; warn: number; err: number; sample: ImportPreviewRow[] };

/** จำนวนแถวสูงสุดที่ใส่ใน `sample` — ค่า ok/warn/err เป็นผลรวมของ**ทุกแถว**เสมอ (ไม่ได้ตัดตาม sample) */
const PREVIEW_SAMPLE_CAP = 500;

export async function previewImport(
  ctx: MemberCtx,
  actor: MemberActor,
  input: { rows: Record<string, string>[]; mapping: Record<string, string> },
): Promise<ImportPreviewResult> {
  requirePerm(actor, "member.customer.import", "นำเข้าสมาชิกจากไฟล์");
  if (input.rows.length > MEMBER_LIMITS.importRows) {
    throw memberLimitError(`ตรวจไฟล์ได้ครั้งละไม่เกิน ${MEMBER_LIMITS.importRows.toLocaleString("th-TH")} แถว — แบ่งไฟล์เป็นหลายรอบ`);
  }
  const fieldByKey = await loadFieldByKey(ctx);
  assertMappingKnown(input.mapping, fieldByKey);

  let ok = 0;
  let warn = 0;
  let err = 0;
  const sample: ImportPreviewRow[] = [];

  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i]!;
    const rowNum = i + 1;
    const { values, error } = validateRow(fieldByKey, input.mapping, row);
    if (error) {
      err++;
      if (sample.length < PREVIEW_SAMPLE_CAP) sample.push({ row: rowNum, status: "err", message: error });
      continue;
    }
    const phone = typeof values.phone === "string" ? values.phone : null;
    const email = typeof values.email === "string" ? values.email : null;
    const existing = await findExistingLocal(ctx, { phone, email });
    if (existing) {
      warn++;
      if (sample.length < PREVIEW_SAMPLE_CAP) {
        const [brief] = await profile.briefFor(ctx, actor, [existing.id]);
        sample.push({
          row: rowNum,
          status: "warn",
          message: `ซ้ำกับสมาชิก "${brief?.name || existing.memberCode || existing.id}" ที่มีอยู่แล้วในระบบ — เลือกวิธีจัดการตอนนำเข้าจริง`,
          duplicateOf: brief,
        });
      }
    } else {
      ok++;
      if (sample.length < PREVIEW_SAMPLE_CAP) sample.push({ row: rowNum, status: "ok" });
    }
  }
  return { ok, warn, err, sample };
}

// ───────────────────────── ขั้น 3: นำเข้าจริง ─────────────────────────

export type ImportOnDuplicate = "update" | "skip" | "candidate";
export type ImportOptions = {
  onDuplicate: ImportOnDuplicate;
  source?: string;
  fileName?: string | null;
  homeUnitId?: string | null;
  tags?: string[];
};
export type ImportRowError = { row: number; message: string };
export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  candidates: number;
  failed: number;
  errors: ImportRowError[];
};

/**
 * นำเข้าจริง — ทีละแถว ผ่าน `profile.createMember`/`profile.updateMember` (§5.2)
 * แถว err ข้ามและรายงานใน `errors[]` (แถวอื่นเดินต่อ) · `onDuplicate`:
 *   "skip"      — เจอสมาชิกเดิม (เบอร์/อีเมลตรง) → ข้าม ไม่แตะ
 *   "update"    — เจอสมาชิกเดิม → แก้เฉพาะคอลัมน์ที่ส่งมา (ค่าเดิมของคอลัมน์ที่ไม่ได้ส่งไม่ถูกแตะ)
 *   "candidate" — ไม่เช็คซ้ำล่วงหน้า (ให้ `createMember` ตัดสินเอง): ชนเบอร์/อีเมลจริง → `created:false` → skip ·
 *                 ไม่ชน → สร้างใหม่ แล้วตรวจชื่อคล้ายแยกต่างหาก เจอ → ตั้ง PartyMergeCandidate (candidates++)
 */
export async function importMembers(
  ctx: MemberCtx,
  actor: MemberActor,
  input: { rows: Record<string, string>[]; mapping: Record<string, string>; options: ImportOptions },
): Promise<ImportResult> {
  requirePerm(actor, "member.customer.import", "นำเข้าสมาชิกจากไฟล์");
  if (input.rows.length > MEMBER_LIMITS.importRows) {
    throw memberLimitError(`นำเข้าได้ครั้งละไม่เกิน ${MEMBER_LIMITS.importRows.toLocaleString("th-TH")} แถว — แบ่งไฟล์เป็นหลายรอบแล้วนำเข้าใหม่`);
  }
  const homeUnitId = input.options.homeUnitId ? String(input.options.homeUnitId).trim() || null : null;
  if (homeUnitId && !coversUnit(actor, homeUnitId)) {
    throw new MemberForbiddenError("นำเข้าสมาชิกเข้าสาขาที่คุณไม่ได้ดูแลไม่ได้ — เลือกสาขาที่คุณมีสิทธิ์");
  }
  const fieldByKey = await loadFieldByKey(ctx);
  assertMappingKnown(input.mapping, fieldByKey);

  const onDuplicate = input.options.onDuplicate;
  const fileName = input.options.fileName ? String(input.options.fileName).trim() || null : null;
  const source = input.options.source?.trim() || "IMPORT";
  const importTags = (input.options.tags ?? []).map((t) => String(t).trim()).filter(Boolean);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let candidates = 0;
  let failed = 0;
  const errors: ImportRowError[] = [];

  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i]!;
    const rowNum = i + 1;
    const { values, error } = validateRow(fieldByKey, input.mapping, row);
    if (error) {
      failed++;
      errors.push({ row: rowNum, message: error });
      continue;
    }
    const phone = typeof values.phone === "string" ? values.phone : null;
    const email = typeof values.email === "string" ? values.email : null;

    const existing = onDuplicate === "candidate" ? null : await findExistingLocal(ctx, { phone, email });
    if (existing) {
      if (onDuplicate === "skip") {
        skipped++;
        continue;
      }
      await profile.updateMember(ctx, actor, existing.id, { fields: values });
      updated++;
      continue;
    }

    const { core, rest } = splitCoreFields(values);
    const res = await profile.createMember(ctx, actor, {
      ...core,
      fields: rest,
      source,
      sourceDetail: fileName ? { fileName } : undefined,
      homeUnitId,
      tags: importTags,
    });
    if (!res.created) {
      skipped++; // createMember ตัดสินเองว่าซ้ำ (เกิดได้เฉพาะโหมด candidate ที่ไม่เช็คซ้ำล่วงหน้า)
      continue;
    }
    created++;
    if (onDuplicate === "candidate") {
      const name = [core.firstName, core.lastName].filter(Boolean).join(" ") || core.name || "";
      const flagged = await flagNameCandidate(ctx, res.customerId, res.partyId, name);
      if (flagged) candidates++;
    }
  }

  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId,
    action: "member.import",
    targetType: "MemberImportSystem",
    targetId: ctx.systemId,
    after: { created, updated, skipped, candidates, failed, rows: input.rows.length, fileName },
  });

  return { created, updated, skipped, candidates, failed, errors };
}

// ───────────────────────── ตรวจซ้ำสด (โมดัลสมัคร) ─────────────────────────

function normEmail(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null;
}
function normPhoneRaw(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** ตรวจซ้ำสดตอนกรอกฟอร์มสมัคร/preview นำเข้า — เบอร์ปิดบังเสมอ (ผ่าน `profile.briefFor`) · ไม่พบ → null */
export async function checkDuplicate(
  ctx: MemberCtx,
  actor: MemberActor,
  keys: { phone?: string | null; email?: string | null },
): Promise<profile.MemberBrief | null> {
  const phone = normPhoneRaw(keys.phone);
  const email = normEmail(keys.email);
  if (!phone && !email) return null;
  const existing = await findExistingLocal(ctx, { phone, email });
  if (!existing) return null;
  const [brief] = await profile.briefFor(ctx, actor, [existing.id]);
  return brief ?? null;
}

// ───────────────────────── ลิงก์/QR ให้ลูกค้ากรอกเอง ─────────────────────────

export type JoinLink = { url: string; qrDataUrl: string };

/** ลิงก์สมัครสมาชิกที่ลูกค้ากรอกเอง (LIFF/เว็บ) — `src` = โค้ดที่มา (M1.8 ใช้ต่อ attribution) */
export async function joinLinkFor(ctx: MemberCtx, opts: { src?: string | null } = {}): Promise<JoinLink> {
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { slug: true } });
  const origin = await publicOrigin();
  const src = opts.src ? String(opts.src).trim() : "";
  const url = `${origin}/m/${tenant?.slug ?? ""}/join${src ? `?src=${encodeURIComponent(src)}` : ""}`;
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: "M" });
  return { url, qrDataUrl };
}
