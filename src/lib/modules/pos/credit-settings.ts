// credit-settings.ts — ตัวเขียนค่าตั้ง "วางบิล (เครดิตเทอม)" + "สมาชิกบนบิลออเดอร์" ของ POS (POS P3.6U ▸ CD-P36U-2 ◂)
//
// ทางเขียนเดียวกับ board-settings.ts: สิทธิ์ (เจ้าของร้านเท่านั้น) → ตรวจแพตช์ทั้งก้อน (เข้ม) → ธุรกรรม + ล็อกแถว AppSystem FOR UPDATE →
//   jsonb_set เฉพาะ settings.pos.credit และ settings.pos.orders.memberOnBill (คีย์อื่นของ settings / pos / pos.orders ไม่ถูกแตะ) → AuditLog pos.settings.updated
// 🔴 ตัวอ่าน = posCreditSettings / posOrderMemberOnBill (settings-shared.ts) — ผลที่คืนผ่านตัวอ่านเสมอ (กฎไป-กลับ)
// 🔴 คำปฏิเสธคืนเป็นข้อมูล {ok:false, code, message(ไทย), field?} — ไม่โยน · คีย์แปลก/ชนิดผิด = VALIDATION + field (ไม่ตัดเงียบ)
// 🔴 แพตช์ที่ไม่เปลี่ยนอะไร = ok · ไม่เขียน · ไม่มี audit · audit = ค่าจริง/เท็จล้วน (ก่อน/หลัง)

import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { prisma } from "./db";
import { ctxOk, POS_SETTINGS_AUDIT, settingsMembership, settingsRefuse, type PosSettingsWriterActor } from "./settings-general";
import { posCreditSettings, posOrderMemberOnBill, type PosCreditSettings, type PosSettingsRefusal } from "./settings-shared";

type Ctx = { tenantId: string; systemId: string };
export type PosCreditSettingsPatch = { credit?: { enabled?: boolean; requireBuyer?: boolean }; memberOnBill?: boolean };
export type PosCreditSettingsResult = { ok: true; credit: PosCreditSettings; memberOnBill: boolean } | PosSettingsRefusal;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
type Bad = { field: string; message: string };

/** ตรวจแพตช์ทั้งก้อน — คืน null = ผ่าน */
function checkPatch(input: Record<string, unknown>): Bad | null {
  for (const k of Object.keys(input)) if (k !== "credit" && k !== "memberOnBill") return { field: k, message: `ไม่รู้จักคีย์ ${k}` };
  if ("credit" in input) {
    const c = input.credit;
    if (!isRecord(c)) return { field: "credit", message: "credit ต้องเป็นออบเจกต์" };
    for (const k of Object.keys(c)) if (k !== "enabled" && k !== "requireBuyer") return { field: `credit.${k}`, message: `ไม่รู้จักคีย์ ${k}` };
    for (const k of ["enabled", "requireBuyer"]) if (k in c && typeof c[k] !== "boolean") return { field: `credit.${k}`, message: `${k} ต้องเป็นจริง/เท็จ` };
  }
  if ("memberOnBill" in input && typeof input.memberOnBill !== "boolean") return { field: "memberOnBill", message: "memberOnBill ต้องเป็นจริง/เท็จ" };
  return null;
}

async function lockPos(tx: Prisma.TransactionClient, ctx: Ctx): Promise<boolean> {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AppSystem" WHERE id = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS' FOR UPDATE`;
  return locked.length > 0;
}
/** settings.pos.credit.{enabled, requireBuyer} = ค่าใหม่ — รวมเข้าออบเจกต์เดิม (คีย์อื่นใต้ pos.credit / pos / settings ไม่ถูกแตะ · fix1 F3) · credit ไม่ใช่ออบเจกต์ = เริ่มออบเจกต์ใหม่ */
async function writeCredit(tx: Prisma.TransactionClient, ctx: Ctx, credit: PosCreditSettings): Promise<void> {
  const json = JSON.stringify({ enabled: credit.enabled, requireBuyer: credit.requireBuyer });
  await tx.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{pos}',
      (CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END) ||
        jsonb_build_object('credit', (CASE WHEN jsonb_typeof("settings"->'pos'->'credit') = 'object' THEN "settings"->'pos'->'credit' ELSE '{}'::jsonb END) || ${json}::jsonb),
      true),
      "updatedAt" = now()
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS'`;
}
/** settings.pos.orders.memberOnBill = ค่าใหม่ — คีย์อื่นใต้ pos.orders ไม่ถูกแตะ (orders ไม่ใช่ออบเจกต์ = เริ่มออบเจกต์ใหม่) */
async function writeMemberOnBill(tx: Prisma.TransactionClient, ctx: Ctx, on: boolean): Promise<void> {
  const json = JSON.stringify(on);
  await tx.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{pos}',
      (CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END) ||
        jsonb_build_object('orders', (CASE WHEN jsonb_typeof("settings"->'pos'->'orders') = 'object' THEN "settings"->'pos'->'orders' ELSE '{}'::jsonb END) || jsonb_build_object('memberOnBill', ${json}::jsonb)),
      true),
      "updatedAt" = now()
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS'`;
}
/** คีย์ที่บันทึกจริงในฐาน (ไม่ใช่ค่าปริยายของตัวอ่าน) — ค่าปริยายที่ยังไม่เคยเขียนนับเป็น "ต้องเขียน" เมื่อแพตช์ระบุ */
function stored(settings: unknown): { credit: boolean; memberOnBill: boolean } {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : null;
  const c = pos && isRecord(pos.credit) ? pos.credit : null;
  const o = pos && isRecord(pos.orders) ? pos.orders : null;
  return { credit: !!c && typeof c.enabled === "boolean" && typeof c.requireBuyer === "boolean", memberOnBill: !!o && typeof o.memberOnBill === "boolean" };
}

/**
 * CD-P36U-2 — บันทึกค่าตั้งวางบิล (enabled · requireBuyer) และสมาชิกบนบิลออเดอร์ (memberOnBill) · เจ้าของร้านเท่านั้น
 * ผล = ค่าหลังบันทึกผ่านตัวอ่าน · แพตช์ไม่เปลี่ยนอะไร = ok ไม่เขียน ไม่ audit
 */
export async function updatePosCreditSettings(ctx: Ctx, actor: PosSettingsWriterActor, input: unknown): Promise<PosCreditSettingsResult> {
  try {
    if (!ctxOk(ctx)) return settingsRefuse("NOT_FOUND");
    const m = settingsMembership(actor);
    if (!m || m.role !== "OWNER") return settingsRefuse("PERMISSION_DENIED", "ค่าตั้งวางบิลและสมาชิกบนบิลออเดอร์ เจ้าของร้านเท่านั้นที่แก้ได้");
    if (!isRecord(input)) return settingsRefuse("VALIDATION", "ค่าที่ส่งมาต้องเป็นออบเจกต์");
    const bad = checkPatch(input);
    if (bad) return settingsRefuse("VALIDATION", bad.message, bad.field);
    if (!("credit" in input) && !("memberOnBill" in input)) return settingsRefuse("VALIDATION", "ต้องส่ง credit หรือ memberOnBill");
    const patchCredit = isRecord(input.credit) ? (input.credit as { enabled?: boolean; requireBuyer?: boolean }) : null;
    const patchMember = typeof input.memberOnBill === "boolean" ? input.memberOnBill : null;

    const done = await prisma.$transaction(async (tx) => {
      if (!(await lockPos(tx, ctx))) return settingsRefuse("NOT_FOUND");
      const sys = await tx.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { settings: true } });
      if (!sys) return settingsRefuse("NOT_FOUND");
      const beforeC = posCreditSettings(sys.settings);
      const beforeM = posOrderMemberOnBill(sys.settings);
      const has = stored(sys.settings);
      const afterC: PosCreditSettings = patchCredit ? posCreditSettings({ pos: { credit: { ...beforeC, ...patchCredit } } }) : beforeC;
      const afterM = patchMember ?? beforeM;
      const credChanged = !!patchCredit && (afterC.enabled !== beforeC.enabled || afterC.requireBuyer !== beforeC.requireBuyer || (!has.credit && Object.keys(patchCredit).length > 0));
      const memChanged = patchMember !== null && (afterM !== beforeM || !has.memberOnBill);
      if (!credChanged && !memChanged) return { ok: true as const, credit: afterC, memberOnBill: afterM, audit: null };
      if (credChanged) await writeCredit(tx, ctx, afterC);
      if (memChanged) await writeMemberOnBill(tx, ctx, afterM);
      return {
        ok: true as const,
        credit: afterC,
        memberOnBill: afterM,
        audit: {
          before: { section: "credit", credit: { enabled: beforeC.enabled, requireBuyer: beforeC.requireBuyer }, memberOnBill: beforeM },
          after: { section: "credit", credit: { enabled: afterC.enabled, requireBuyer: afterC.requireBuyer }, memberOnBill: afterM },
        },
      };
    });
    if (!done.ok) return done;
    if (done.audit) await writeAudit({ tenantId: ctx.tenantId, actorId: m.userId, action: POS_SETTINGS_AUDIT, targetType: "AppSystem", targetId: ctx.systemId, before: done.audit.before, after: done.audit.after });
    return { ok: true, credit: done.credit, memberOnBill: done.memberOnBill };
  } catch (e) {
    console.error("[pos/credit-settings] update", e);
    return settingsRefuse("UNKNOWN");
  }
}
