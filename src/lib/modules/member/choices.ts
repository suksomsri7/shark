// choices.ts — "ย้ายค่าที่เก็บไว้จากตัวเลือกหนึ่งไปอีกตัวเลือกหนึ่ง" ของฟิลด์ SELECT/MULTI_SELECT (M1.11)
//
// ทำไมต้องมี: เจ้าของร้านลบตัวเลือกออกจากฟิลด์ (เช่น "Open Water" → เปลี่ยนเป็น "OWD") แถวค่าเดิม
// ของสมาชิกยังชี้ตัวเลือกที่หายไปแล้ว ⇒ หน้าจอโชว์ค่าที่ไม่มีในรายการ และตัวกรองหาไม่เจอ
// ⇒ ให้ย้ายค่าเป็นก้อนเดียวได้ (`fields.choices.replace` ของ REST) แทนที่จะไล่แก้ทีละคน
//
// 🔴 ไม่แตะ "ทะเบียนตัวเลือก" ของฟิลด์ (นั่นเป็นงานของ `fields.updateField`) — ไฟล์นี้ย้าย **ค่าที่เก็บไว้**
//    อย่างเดียว ⇒ ลำดับที่ถูกคือ แก้ตัวเลือกก่อน แล้วค่อยเรียกตัวนี้ย้ายค่าเก่ามาลงตัวเลือกใหม่
// 🔴 `to` ต้องเป็นตัวเลือกที่มีอยู่จริงในฟิลด์นั้น (fail-closed) — ไม่งั้นก็แค่ย้ายไปค่าเสียอีกค่าหนึ่ง

import { prisma } from "./db";
import { hasMemberPerm, type MemberActor } from "./access";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import type { FieldCtx } from "./fields";

export type ReplaceChoiceResult = {
  fieldId: string;
  from: string;
  to: string;
  /** จำนวนแถวค่าที่ถูกย้าย (สมาชิกกี่คน) */
  moved: number;
};

function choiceValues(options: unknown): string[] {
  if (typeof options !== "object" || options === null) return [];
  const raw = (options as { choices?: unknown }).choices;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => (typeof c === "object" && c !== null ? (c as { value?: unknown }).value : null))
    .filter((v): v is string => typeof v === "string");
}

/**
 * แทนที่ตัวเลือก `from` ด้วย `to` ในค่าของสมาชิกทุกคนสำหรับฟิลด์นี้
 * SELECT = ค่าเดียว (`valueText` + `valueOptions[0]`) · MULTI_SELECT = หลายค่า (`valueOptions`)
 * ซ้ำแล้วรันใหม่ไม่เป็นไร: รอบสองจะไม่เจอแถวที่มี `from` แล้ว ⇒ `moved: 0`
 */
export async function replaceChoice(
  ctx: FieldCtx,
  actor: MemberActor,
  fieldId: string,
  input: { from: string; to: string },
): Promise<ReplaceChoiceResult> {
  if (!hasMemberPerm(actor, "member.settings.manage")) {
    throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ตั้งค่าฟิลด์ของระบบสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  }
  const from = String(input.from ?? "").trim();
  const to = String(input.to ?? "").trim();
  if (!from || !to) throw new MemberInputError("ต้องบอกทั้งตัวเลือกเดิม (from) และตัวเลือกใหม่ (to)");
  if (from === to) throw new MemberInputError("ตัวเลือกเดิมกับตัวเลือกใหม่เป็นค่าเดียวกัน — ไม่มีอะไรต้องย้าย");

  const field = await prisma.memberField.findFirst({
    where: { id: fieldId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, type: true, label: true, options: true },
  });
  if (!field) throw new MemberNotFoundError("ไม่พบฟิลด์นี้ในระบบสมาชิกที่เปิดอยู่ (อาจถูกลบไปแล้ว)");
  if (field.type !== "SELECT" && field.type !== "MULTI_SELECT") {
    throw new MemberInputError(`ฟิลด์ "${field.label}" ไม่ใช่ฟิลด์แบบเลือกจากรายการ จึงไม่มีตัวเลือกให้ย้าย`);
  }
  const known = choiceValues(field.options);
  if (known.length > 0 && !known.includes(to)) {
    throw new MemberInputError(`ตัวเลือกใหม่ "${to}" ยังไม่มีในฟิลด์ "${field.label}" — เพิ่มตัวเลือกนี้ก่อนแล้วค่อยย้ายค่าเดิมมา`);
  }

  const rows = await prisma.memberFieldValue.findMany({
    where: { tenantId: ctx.tenantId, fieldId: field.id, valueOptions: { has: from } },
    select: { id: true, valueOptions: true },
  });
  if (rows.length === 0) return { fieldId: field.id, from, to, moved: 0 };

  await prisma.$transaction(
    rows.map((r) => {
      // คงลำดับเดิม · ไม่ให้ซ้ำเมื่อสมาชิกคนนั้นเลือก `to` อยู่แล้ว (MULTI_SELECT)
      const next: string[] = [];
      for (const v of r.valueOptions) {
        const mapped = v === from ? to : v;
        if (!next.includes(mapped)) next.push(mapped);
      }
      return prisma.memberFieldValue.update({
        where: { id: r.id },
        // SELECT/MULTI_SELECT เก็บค่าไว้ที่ `valueOptions` อย่างเดียว (ดู `fields.cellOf`)
        // ⇒ ย้ายที่นี่ที่เดียว ไม่ต้องแตะคอลัมน์อื่น
        data: { valueOptions: next, updatedById: ctx.actorUserId },
      });
    }),
  );

  return { fieldId: field.id, from, to, moved: rows.length };
}
