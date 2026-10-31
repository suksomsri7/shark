// staff-notes.ts — ความชอบ/ข้อห้ามของลูกค้าสำหรับ "การ์ดงาน" ของพนักงาน (SVC B.16 · ใบสั่ง §3.3)
//
// ผู้เรียก: `booking/customer-notes.ts#loadJobCustomerNotes` (จอแถวเดียว + มือถือหมอ) ผ่าน facade `member/index.ts`
//
// 🔴 ไม่มี engine ใหม่ — ประกอบของเดิมล้วน:
//    เลย์เอาต์ = `fields.listLayout` · ค่า = `fields.getFieldValues` · ใครดูอ่อนไหวได้ = `privacy.evaluateSensitiveAccess`
//    (ตัวตัดสินตัวเดียวของทั้งระบบ · D8 บทบาท ∪ ตำแหน่ง HR ∪ แผนก) · บันทึกการดู = `privacy.logAccessMany` (event สรุปใบเดียว)
// 🔴 เป้าหมายของนโยบายตามกติกาเดิมของหน้า 360: ฟิลด์ในส่วนอ่อนไหว ⇒ SECTION/<sectionId> · ฟิลด์อ่อนไหวในส่วนปกติ ⇒ FIELD/<fieldId>
// 🔴 อ่านอย่างเดียว — เขียนได้แค่ `MemberAccessLog` (ผ่าน logAccessMany) · ไม่มี console · DTO ไม่มีชื่อ/เบอร์/อีเมล/id
// 🔴 กันบันทึกซ้ำ (R8): (ผู้ดู, ลูกค้า, เป้าหมาย, หน้า) วันละ 1 แถวตามวันไทย — จอรีเฟรชทุก 5 วิ
// 🔴 ฟิลด์ระบบ (phone/email/birthDate …) ไม่ขึ้นเสมอ แม้ร้านใส่รหัสไว้ในค่าตั้ง (กันเบอร์หลุดผ่านค่าตั้ง)

import type { MemberFieldType } from "@prisma/client";
import { prisma } from "./db";
import type { MemberActor } from "./access";
import type { MemberCtx } from "./profile";
import { listLayout, getFieldValues, type FieldDef, type MemberFieldValueInput } from "./fields";
import { evaluateSensitiveAccess, logAccessMany, type LogAccessEntry, type SensitiveDecision, type SensitiveTargetType } from "./privacy";

export type StaffNoteItem = { key: string; label: string; display: string; sensitive: boolean };
export type StaffNotes = { items: StaffNoteItem[]; hidden: number };
export type StaffNotesInput = { customerIds: string[]; fieldKeys: string[]; page: string; now?: Date };

/** ชนิดที่การ์ดงานแสดงได้ (มติ R7) — DATE/DATETIME/MONEY/FILE/LOOKUP ข้ามเงียบ */
const CARD_TYPES: ReadonlySet<MemberFieldType> = new Set<MemberFieldType>(["TEXT", "LONG_TEXT", "NUMBER", "SELECT", "MULTI_SELECT", "BOOLEAN"]);
/** สถานะสมาชิกที่ขึ้นการ์ด (MERGED มีแถวผู้ชนะแล้ว · CLOSED = ปิดบัญชี — มติ R9) */
const CARD_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
const TEXT_MAX = 120;
const MAX_CUSTOMERS = 200;
const MAX_FIELDS = 20;
const DAY_MS = 86_400_000;
const BKK_MS = 7 * 3_600_000;

type CardField = { def: FieldDef; sensitive: boolean; target: { targetType: SensitiveTargetType; targetId: string } | null };

/** ขอบวันไทยของ now (epoch + 7 ชม. · ไม่ใช้เวลาเครื่อง) */
function bkkDayRange(now: Date): { from: Date; to: Date } {
  const start = Math.floor((now.getTime() + BKK_MS) / DAY_MS) * DAY_MS - BKK_MS;
  return { from: new Date(start), to: new Date(start + DAY_MS) };
}

function clipText(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  const cps = [...s];
  return cps.length > TEXT_MAX ? `${cps.slice(0, TEXT_MAX).join("")}…` : s;
}

/** ค่า → ข้อความบนการ์ด · "" = ไม่มีค่า (ไม่ขึ้น) */
function displayOf(def: FieldDef, value: MemberFieldValueInput | undefined): string {
  if (value === null || value === undefined) return "";
  const choices = def.options?.choices ?? [];
  const labelOf = (v: string) => choices.find((c) => c.value === v)?.label ?? null;
  switch (def.type) {
    case "SELECT":
      return typeof value === "string" ? labelOf(value) ?? "" : "";
    case "MULTI_SELECT":
      return Array.isArray(value) ? value.map((v) => labelOf(v)).filter((l): l is string => !!l).join(" · ") : "";
    case "BOOLEAN":
      return typeof value === "boolean" ? (value ? "ใช่" : "ไม่ใช่") : "";
    case "NUMBER":
      return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
    case "TEXT":
    case "LONG_TEXT":
      return typeof value === "string" ? clipText(value) : "";
    default:
      return "";
  }
}

/**
 * ความชอบ/ข้อห้ามของลูกค้าหลายคนสำหรับการ์ดงาน — คีย์ = customerId (เฉพาะคนที่มีรายการหรือมีของถูกซ่อน)
 * ลูกค้านอกร้าน/นอกระบบสมาชิกนี้/MERGED/CLOSED/ไม่มีจริง ⇒ ไม่มีคีย์
 */
export async function staffNotesFor(ctx: MemberCtx, actor: MemberActor, input: StaffNotesInput): Promise<Record<string, StaffNotes>> {
  const out: Record<string, StaffNotes> = {};
  const ids = [...new Set((Array.isArray(input?.customerIds) ? input.customerIds : []).filter((x): x is string => typeof x === "string" && x !== ""))].slice(0, MAX_CUSTOMERS);
  const keys = [...new Set((Array.isArray(input?.fieldKeys) ? input.fieldKeys : []).filter((x): x is string => typeof x === "string" && x !== ""))].slice(0, MAX_FIELDS);
  if (ids.length === 0 || keys.length === 0) return out;

  // (1) ลูกค้าของร้าน + ระบบสมาชิกนี้ที่ยังใช้งานอยู่
  const customers = await prisma.customer.findMany({
    where: { id: { in: ids }, tenantId: ctx.tenantId, memberSystemId: ctx.systemId, status: { in: [...CARD_STATUSES] } },
    select: { id: true },
  });
  if (customers.length === 0) return out;
  const custIds = ids.filter((id) => customers.some((c) => c.id === id));

  // (2) ฟิลด์ตามลำดับค่าตั้ง — ข้ามรหัสไม่มีจริง/เก็บแล้ว (listLayout กรองให้)/ฟิลด์ระบบ/ชนิดที่ไม่รองรับ
  const layout = await listLayout({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId });
  const byKey = new Map<string, CardField>();
  for (const s of layout.sections) {
    for (const f of s.fields) {
      if (f.isSystem || f.archivedAt || !CARD_TYPES.has(f.type)) continue;
      const target = s.sensitive
        ? { targetType: "SECTION" as const, targetId: s.id }
        : f.sensitive
          ? { targetType: "FIELD" as const, targetId: f.id }
          : null;
      byKey.set(f.key, { def: f, sensitive: target !== null, target });
    }
  }
  const fields = keys.map((k) => byKey.get(k)).filter((x): x is CardField => !!x);
  if (fields.length === 0) return out;

  // (3) คำตัดสินอ่อนไหว — evaluateSensitiveAccess ตัวเดียว · แคชภายในคำขอนี้ต่อ (เป้าหมาย, ลูกค้า)
  //     เป้าหมายที่นโยบายไม่ตั้ง sameUnitOnly คำตัดสินไม่ขึ้นกับลูกค้า ⇒ ตัดสินครั้งเดียวใช้ทุกคน (จอรีเฟรชถี่)
  const targets = [...new Map(fields.filter((f) => f.target).map((f) => [`${f.target!.targetType}:${f.target!.targetId}`, f.target!])).values()];
  const perCustomer = new Set<string>();
  if (targets.length > 0) {
    const scoped = await prisma.memberSensitivePolicy.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, sameUnitOnly: true, OR: targets.map((t) => ({ targetType: t.targetType, targetId: t.targetId })) },
      select: { targetType: true, targetId: true },
    });
    for (const p of scoped) perCustomer.add(`${p.targetType}:${p.targetId}`);
  }
  const cache = new Map<string, SensitiveDecision>();
  const decide = async (t: { targetType: SensitiveTargetType; targetId: string }, customerId: string): Promise<SensitiveDecision> => {
    const tk = `${t.targetType}:${t.targetId}`;
    const k = perCustomer.has(tk) ? `${tk}:${customerId}` : tk;
    let d = cache.get(k);
    if (!d) {
      d = await evaluateSensitiveAccess(ctx, actor, { targetType: t.targetType, targetId: t.targetId, customerId });
      cache.set(k, d);
    }
    return d;
  };

  // (4) ค่า (engine เดิม) → รายการ
  const values = await getFieldValues({ tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId }, custIds);
  const toLog = new Map<string, LogAccessEntry>();
  for (const customerId of custIds) {
    const bag = values[customerId] ?? {};
    const items: StaffNoteItem[] = [];
    let hidden = 0;
    for (const f of fields) {
      let decision: SensitiveDecision | null = null;
      if (f.target) {
        decision = await decide(f.target, customerId);
        if (!decision.allowed) { hidden++; continue; }
      }
      const display = displayOf(f.def, bag[f.def.key]);
      if (!display) continue;
      items.push({ key: f.def.key, label: f.def.label, display, sensitive: f.sensitive });
      if (f.target && decision?.shouldLog) {
        const lk = `${customerId}|${f.target.targetType}|${f.target.targetId}`;
        if (!toLog.has(lk)) toLog.set(lk, { customerId, targetType: f.target.targetType, targetId: f.target.targetId, decision });
      }
    }
    if (items.length > 0 || hidden > 0) out[customerId] = { items, hidden };
  }

  // (5) บันทึกการดู (D17) เฉพาะค่าอ่อนไหวที่ส่งออกจริง · กันซ้ำรายวันไทยต่อ (ผู้ดู, ลูกค้า, เป้าหมาย, หน้า)
  if (toLog.size > 0 && actor.userId) {
    const { from, to } = bkkDayRange(input.now instanceof Date && !Number.isNaN(input.now.getTime()) ? input.now : new Date());
    const entries = [...toLog.values()];
    const seen = await prisma.memberAccessLog.findMany({
      where: {
        tenantId: ctx.tenantId,
        userId: actor.userId,
        page: input.page,
        customerId: { in: [...new Set(entries.map((e) => e.customerId))] },
        createdAt: { gte: from, lt: to },
      },
      select: { customerId: true, targetType: true, targetId: true },
    });
    const done = new Set(seen.map((r) => `${r.customerId}|${r.targetType}|${r.targetId}`));
    const fresh = entries.filter((e) => !done.has(`${e.customerId}|${e.targetType}|${e.targetId}`));
    if (fresh.length > 0) await logAccessMany(ctx, actor, fresh, input.page);
  }
  return out;
}
