// segments-shared.ts — ส่วนที่ "หน้าจอกับเซิร์ฟเวอร์ใช้ร่วมกัน" ของกลุ่มลูกค้า (M3.1 · ภาพ 21 ขั้น 1)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่ import prisma / env / facade / Next — เพราะ `SegmentBuilder.tsx` เป็น
//    client component ที่ต้องใช้ชนิดข้อมูล + ทะเบียนป้ายไทยชุดเดียวกับเอนจิน ถ้าไปดึงจาก `segments.ts`
//    ตัวบันเดิลจะลาก `core/db.ts → @prisma/adapter-pg → pg` เข้าเบราว์เซอร์แล้ว `next build` พังทันที
//    (ตีกลับรอบ 1 ของใบนี้ — tsc ผ่านแต่ build ไม่ผ่าน · แบบเดียวกับบทเรียน use-server/export type ของ M2.2)
// 🔴 ของที่ต้อง "ถามฐานข้อมูล" (นับ/สุ่มตัวอย่าง/บันทึก) อยู่ที่ `segments.ts` และเรียกจากหน้าจอผ่าน
//    server action ใน `segments-actions.ts` เท่านั้น
// 🔴 `errors.ts` บริสุทธิ์เหมือนกัน (ไม่แตะ prisma/next) จึง import มาใช้ที่นี่ได้

import { MemberInputError } from "./errors";

// ───────────────────────── ตัวดำเนินการ ─────────────────────────

export const SEGMENT_OPS = [
  "eq", "neq", "in", "nin", "gt", "gte", "lt", "lte", "contains", "isNull", "notNull", "before", "after", "hasAny", "hasAll",
] as const;
export type SegmentOp = (typeof SEGMENT_OPS)[number];

export const SEGMENT_OP_LABELS: Record<SegmentOp, string> = {
  eq: "เป็น",
  neq: "ไม่เป็น",
  in: "เป็น",
  nin: "ไม่เป็น",
  gt: "มากกว่า",
  gte: "ตั้งแต่",
  lt: "น้อยกว่า",
  lte: "ไม่เกิน",
  contains: "มีคำว่า",
  isNull: "ยังไม่กรอก",
  notNull: "กรอกแล้ว",
  before: "ก่อนวันที่",
  after: "ตั้งแต่วันที่",
  hasAny: "มีอย่างน้อยหนึ่งอัน",
  hasAll: "มีครบทุกอัน",
};

// ───────────────────────── ชนิดข้อมูล ─────────────────────────

export type SegmentFieldKind = "text" | "number" | "money" | "date" | "select" | "multi" | "boolean";

export type SegmentFieldOption = { value: string; label: string };

export type SegmentFieldDef = {
  key: string;
  label: string;
  kind: SegmentFieldKind;
  ops: SegmentOp[];
  options?: SegmentFieldOption[];
  /** หน่วยที่โชว์ท้ายช่องค่า (วัน · ครั้ง · ใบ · ไดฟ์ …) */
  unit?: string;
};

export type SegmentCondition = { field: string; op: SegmentOp; value?: unknown };
export type SegmentGroup = { conditions: SegmentCondition[] };
/** { groups: [] } = สมาชิกทุกคน (ยกเว้นที่ถูกรวมไปแล้ว) */
export type SegmentDefinition = { groups: SegmentGroup[] };

export type SegmentScope = "TEAM" | "PRIVATE";

// ───────────────────────── ตัวช่วยอ่านค่า ─────────────────────────

export function valueList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const v of raw) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) out.push(s);
  }
  return out;
}

export function boolOf(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const s = String(value ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "ใช่";
}

// ───────────────────────── นิยาม ─────────────────────────

/** ตรวจรูปทรงของนิยาม (ยังไม่แตะฐานข้อมูล — หน้าจอกับเซิร์ฟเวอร์ตรวจด้วยกติกาเดียวกัน) */
export function parseDefinition(raw: unknown): SegmentDefinition {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MemberInputError("นิยามกลุ่มต้องอยู่ในรูป { groups: [...] } — ลองสร้างกลุ่มใหม่จากหน้าจอ");
  }
  const groupsRaw = (raw as { groups?: unknown }).groups;
  if (!Array.isArray(groupsRaw)) {
    throw new MemberInputError("นิยามกลุ่มต้องมี groups เป็นรายการ — ลองสร้างกลุ่มใหม่จากหน้าจอ");
  }
  const groups: SegmentGroup[] = [];
  for (const g of groupsRaw) {
    if (!g || typeof g !== "object" || Array.isArray(g)) {
      throw new MemberInputError("แต่ละกลุ่มเงื่อนไขต้องอยู่ในรูป { conditions: [...] }");
    }
    const conditionsRaw = (g as { conditions?: unknown }).conditions;
    if (!Array.isArray(conditionsRaw)) {
      throw new MemberInputError("แต่ละกลุ่มเงื่อนไขต้องมี conditions เป็นรายการ");
    }
    groups.push({
      conditions: conditionsRaw.map((c) => {
        const cc = (c ?? {}) as { field?: unknown; op?: unknown; value?: unknown };
        return { field: String(cc.field ?? ""), op: String(cc.op ?? "") as SegmentOp, value: cc.value };
      }),
    });
  }
  return { groups };
}

/** ประโยคไทยย่อของนิยาม (รายการกลุ่ม + หัวข้อของแคมเปญ + หน้าจอ ใช้ตัวเดียวกัน) */
export function describeDefinition(defs: SegmentFieldDef[], definition: SegmentDefinition): string {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const labelOfValue = (def: SegmentFieldDef | undefined, v: unknown): string => {
    const s = String(v ?? "");
    const opt = def?.options?.find((o) => o.value === s);
    return opt ? opt.label : s;
  };
  const groups = definition.groups
    .filter((g) => g.conditions.length > 0)
    .map((g) =>
      g.conditions
        .map((c) => {
          const def = byKey.get(c.field);
          const label = def?.label ?? c.field;
          const opLabel = SEGMENT_OP_LABELS[c.op] ?? c.op;
          if (c.op === "isNull" || c.op === "notNull") return `${label} ${opLabel}`;
          if (def?.kind === "boolean") return `${label}: ${boolOf(c.value) ? "ใช่" : "ไม่ใช่"}`;
          const values = valueList(c.value).map((v) => labelOfValue(def, v)).join(", ");
          const unit = def?.unit ? ` ${def.unit}` : "";
          return `${label} ${opLabel} ${values}${unit}`.trim();
        })
        .join(" และ "),
    );
  if (groups.length === 0) return "สมาชิกทุกคน";
  return groups.join(" หรือ ");
}
