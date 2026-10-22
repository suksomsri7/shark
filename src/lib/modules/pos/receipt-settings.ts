// receipt-settings.ts — อ่าน/แก้ค่าตั้งใบเสร็จของระบบ POS (P1.10 · มติ R4) · แบบเดียวกับ payment-settings.ts
//
// ที่เก็บ: `AppSystem(POS).settings.pos.receipt` · คีย์อื่นของ settings (serviceCharge/tip/shift/heldCart …) ไม่ถูกแตะ
// 🔴 คำปฏิเสธ "คืน" เป็นข้อมูล {ok:false, code, message} เสมอ — ไม่โยน
// 🔴 แก้ได้เมื่อมีสิทธิ์ pos.device.manage (OWNER/MANAGER ได้โดยปริยาย · STAFF ต้องได้รับเจาะจง) · ไม่มีสิทธิ์ = PERMISSION_DENIED
// 🔴 ค่าตั้งใบเสร็จใช้ทุกสาขาของ POS นี้ ⇒ ต้องมี pos.device.manage ที่ "ทุกสาขา" ที่ผูก POS นี้ (แก้รอบ 1 F9 · แบบ posCanSetTenantPrice) ·
//    OWNER / unitAccess "*" ผ่าน · POS ยังไม่ผูกสาขา = เฉพาะ OWNER / "*" · อ่านไม่เปลี่ยน
// 🔴 ปฏิเสธ = ค่าเดิมไม่เปลี่ยนแม้แต่ฟิลด์เดียว (ตรวจทั้งก้อนก่อนเขียน · ล็อกแถวระบบ FOR UPDATE)
import { Prisma } from "@prisma/client"; // POS P2.11 ▸ Prisma.sql สำหรับ jsonb_set ต่อสาขา ◂
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { prisma } from "./db";
import { writeAudit } from "@/lib/core/audit"; // POS P1.18 ▸ R6 ◂
import { maskAuditPhones, settingsAuditDiff } from "./settings-shared"; // POS P1.18 ▸ R6 · F5 ◂
import {
  mergeReceiptSettings,
  mergeReceiptUnitPatch, // POS P2.11 ▸ ตัวตนบนใบเสร็จต่อสาขา ◂
  receiptUnitOverride, // POS P2.11 ◂
  storedReceiptUnit, // POS P2.11 ◂
  type PosReceiptUnitResult, // POS P2.11 ◂
  type PosReceiptUnitPatch, // POS P2.11 ◂
  parseReceiptSettings,
  POS_RECEIPT_DEFAULTS,
  type PosReceiptSettings,
  type PosReceiptSettingsPatch,
  type PosReceiptSettingsRefusal,
  type PosReceiptSettingsResult,
} from "./receipt-settings-shared";

export { parseReceiptSettings } from "./receipt-settings-shared";

type Db = typeof prisma | Prisma.TransactionClient;
type Ctx = { tenantId: string; systemId: string };
export type PosReceiptSettingsActor = { userId: string; role: string; unitAccess?: string[]; permissions?: Record<string, unknown> };

const MSG: Record<PosReceiptSettingsRefusal["code"], string> = {
  NOT_FOUND: "ไม่พบจุดขายนี้",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ตั้งค่าใบเสร็จ — ขอสิทธิ์จากเจ้าของร้าน",
  VALIDATION: "ค่าตั้งใบเสร็จไม่ถูกต้อง",
  UNKNOWN: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
};
const refuse = (code: PosReceiptSettingsRefusal["code"], message?: string, field?: string): PosReceiptSettingsRefusal =>
  field ? { ok: false, code, message: message ?? MSG[code], field } : { ok: false, code, message: message ?? MSG[code] };
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const ctxOk = (ctx: unknown): ctx is Ctx => isRecord(ctx) && typeof ctx.tenantId === "string" && !!ctx.tenantId && typeof ctx.systemId === "string" && !!ctx.systemId;

/** ค่าที่เก็บ → ค่าตั้ง (ค่าที่เก็บพัง = ค่าปริยาย ไม่โยน — ใบเสร็จต้องพิมพ์ได้เสมอ) */
export function receiptSettingsOf(settings: unknown): PosReceiptSettings {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : {};
  const r = parseReceiptSettings(pos.receipt);
  return r.ok ? r.settings : { ...POS_RECEIPT_DEFAULTS, header: { logoUrl: null } };
}

function membership(a: PosReceiptSettingsActor): MembershipCtx | null {
  if (!isRecord(a) || typeof a.userId !== "string" || (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF")) return null;
  return {
    role: a.role,
    unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess.filter((u): u is string => typeof u === "string") : [],
    permissions: isRecord(a.permissions) ? a.permissions : {},
  };
}

/** F9: สิทธิ์ pos.device.manage ครบทุกสาขา (ไม่เก็บถาวร) ที่ผูก POS นี้ — แบบเดียวกับ posCanSetTenantPrice (access.ts) */
export async function canManageAllLinkedUnits(db: Db, ctx: Ctx, m: MembershipCtx): Promise<boolean> {
  if (m.role === "OWNER" || m.unitAccess.includes("*")) return true;
  const links = await db.appSystemUnit.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, type: "POS" }, select: { unitId: true } });
  const live = links.length
    ? await db.businessUnit.findMany({ where: { tenantId: ctx.tenantId, id: { in: links.map((l) => l.unitId) }, status: { not: "ARCHIVED" } }, select: { id: true } })
    : [];
  return live.length > 0 && live.every((u) => evaluate(m, { module: "pos", action: "pos.device.manage", unitId: u.id }));
}

async function loadPos(db: Db, ctx: Ctx) {
  return db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { id: true, settings: true } });
}

/** ค่าตั้งใบเสร็จของระบบ POS (อ่านอย่างเดียว · หน้าขาย/ใบเสร็จอ่านผ่านที่นี่) */
export async function posReceiptSettings(ctx: Ctx, client: Db = prisma): Promise<PosReceiptSettingsResult> {
  try {
    if (!ctxOk(ctx)) return refuse("NOT_FOUND");
    const sys = await loadPos(client, ctx);
    if (!sys) return refuse("NOT_FOUND");
    return { ok: true, settings: receiptSettingsOf(sys.settings) };
  } catch (e) {
    console.error("[pos/receipt-settings] read", e);
    return refuse("UNKNOWN");
  }
}

/** แก้ค่าตั้งใบเสร็จ (patch บางส่วน · header รวมรายฟิลด์) — คืนค่าหลังแก้ */
export async function updatePosReceiptSettings(ctx: Ctx, actor: PosReceiptSettingsActor, patch: PosReceiptSettingsPatch): Promise<PosReceiptSettingsResult> {
  try {
    if (!ctxOk(ctx)) return refuse("NOT_FOUND");
    const m = membership(actor);
    if (!m || !evaluate(m, { module: "pos", action: "pos.device.manage" })) return refuse("PERMISSION_DENIED");
    if (!(await canManageAllLinkedUnits(prisma, ctx, m))) return refuse("PERMISSION_DENIED");
    if (!isRecord(patch)) return refuse("VALIDATION");
    let diff = null as ReturnType<typeof settingsAuditDiff>; // POS P1.18 ▸ R6 audit (เขียนหลัง commit · ไม่เปลี่ยน = ไม่ลง) ◂
    const res = await prisma.$transaction(async (tx): Promise<PosReceiptSettingsResult> => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AppSystem" WHERE id = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS' FOR UPDATE`;
      if (locked.length === 0) return refuse("NOT_FOUND");
      const sys = await loadPos(tx, ctx);
      if (!sys) return refuse("NOT_FOUND");
      const cur = receiptSettingsOf(sys.settings);
      const parsed = parseReceiptSettings(mergeReceiptSettings(cur, patch));
      if (!parsed.ok) return refuse("VALIDATION", parsed.message, parsed.field);
      // เขียนเฉพาะ settings.pos.receipt ในคำสั่งเดียว (jsonb_set แบบ member/reviews.ts) — คีย์อื่นของ settings/pos ที่ใบอื่นเป็นเจ้าของไม่ถูกทับ
      // POS P2.11 ▸ ค่าต่อสาขา (receipt.byUnit) เป็นของ updatePosReceiptUnitSettings — ตัวเขียนระดับระบบคงไว้ตามเดิม (ไม่ทับ) ◂
      const byUnit = rawReceiptByUnit(sys.settings);
      const json = JSON.stringify(byUnit ? { ...parsed.settings, byUnit } : parsed.settings);
      await tx.$executeRaw`
        UPDATE "AppSystem"
        SET "settings" = jsonb_set(
          CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
          '{pos}',
          (CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END)
            || jsonb_build_object('receipt', ${json}::jsonb),
          true),
          "updatedAt" = now()
        WHERE "id" = ${sys.id} AND "tenantId" = ${ctx.tenantId} AND type = 'POS'`;
      diff = settingsAuditDiff("receipt", cur as unknown as Record<string, unknown>, parsed.settings as unknown as Record<string, unknown>);
      return { ok: true, settings: parsed.settings };
    });
    if (res.ok && diff) {
      // POS P1.18 ▸ F5: header.phone ในบันทึกตรวจสอบ = แบบปิดบัง (maskPhone ของ member · เหมือนที่อื่น) — ประวัติไม่เคยได้เบอร์ดิบ ◂
      const { maskPhone } = await import("@/lib/modules/member");
      const d = diff as NonNullable<typeof diff>;
      await writeAudit({ tenantId: ctx.tenantId, actorId: actor.userId, action: "pos.settings.updated", targetType: "AppSystem", targetId: ctx.systemId, before: maskAuditPhones(d.before, maskPhone), after: maskAuditPhones(d.after, maskPhone) });
    }
    return res;
  } catch (e) {
    console.error("[pos/receipt-settings] update", e);
    return refuse("UNKNOWN");
  }
}

// ═══════════ POS P2.11 ▸ ตัวตนบนใบเสร็จต่อสาขา (brief P2.11 §4 · มติ 4 14 15) ═══════════

/** ก้อน byUnit ดิบที่เก็บอยู่ (ออบเจกต์เท่านั้น) — ตัวเขียนระดับระบบส่งต่อทั้งก้อน */
function rawReceiptByUnit(settings: unknown): Record<string, unknown> | null {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : null;
  const rc = pos && isRecord(pos.receipt) ? pos.receipt : null;
  return rc && isRecord(rc.byUnit) ? rc.byUnit : null;
}

/**
 * แก้ "สาขาที่ / ที่อยู่ / โทร" บนใบเสร็จของสาขาเดียว (`settings.pos.receipt.byUnit.<unitId>`) — ใช้กับระบบ POS ใดก็ได้ใน ctx (มีหรือไม่มีสมุดบัญชี · มติ 14)
 *   • input `{unitId, patch: {taxBranchNo?, address?, phone?}}` · null/ว่าง = ล้างช่อง · คีย์แปลก/ค่าผิด = VALIDATION + field
 *   • สาขาต้องเป็นของร้านนี้ ผูก POS ใน ctx และไม่เก็บถาวร — ไม่ใช่ (มั่ว/ร้านอื่น/เลิกผูก/เก็บถาวร) = VALIDATION field "unitId" (มติ 15)
 *   • สิทธิ์: pos.device.manage ที่สาขานั้น · ตั้ง/ล้าง taxBranchNo (ตัวตนภาษี) = OWNER หรือ unitAccess "*" เท่านั้น — ไม่ผ่าน = PERMISSION_DENIED
 *   • jsonb_set เฉพาะคีย์ของสาขานั้นใต้ล็อกแถวระบบ FOR UPDATE (คีย์อื่น/สาขาอื่น/หัวใบไม่ถูกทับ) · ค่าเดิม = ไม่เขียน ไม่ลง audit
 *   • audit `pos.settings.updated` (targetId = POS · มี unitId · เบอร์ปิดบัง) หลัง commit
 */
export async function updatePosReceiptUnitSettings(ctx: Ctx, actor: PosReceiptSettingsActor, input: { unitId: string; patch: PosReceiptUnitPatch }): Promise<PosReceiptUnitResult> {
  try {
    if (!ctxOk(ctx)) return refuse("NOT_FOUND");
    const m = membership(actor);
    if (!m) return refuse("PERMISSION_DENIED");
    if (!isRecord(input)) return refuse("VALIDATION");
    const unitId = input.unitId;
    if (typeof unitId !== "string" || !unitId || unitId.length > 200 || /[\u0000-\u001F]/.test(unitId)) return refuse("VALIDATION", "เลือกสาขาให้ถูกต้อง", "unitId");
    // POS P5.2 ▸ CD-P52-F5: ด่านสิทธิ์ที่สาขาก่อนตรวจ patch/สาขาผูก — คนไม่มีสิทธิ์ได้ PERMISSION_DENIED ไม่ใช่ VALIDATION (บรรทัดเดิมด้านล่างคงไว้) ◂
    if (!evaluate(m, { module: "pos", action: "pos.device.manage", unitId })) return refuse("PERMISSION_DENIED");
    const pre = mergeReceiptUnitPatch({ taxBranchNo: null, address: null, phone: null }, input.patch);
    if (!pre.ok) return refuse("VALIDATION", pre.message, pre.field);
    const sys0 = await loadPos(prisma, ctx);
    if (!sys0) return refuse("NOT_FOUND");
    // สาขาของร้านนี้ ผูก POS นี้ ไม่เก็บถาวร (AppSystemUnit unique tenant+unit+type ⇒ สาขาร้านอื่น/POS อื่น = ไม่พบ)
    const link = await prisma.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId: ctx.tenantId, unitId, type: "POS" } }, select: { systemId: true } });
    const unit = link && link.systemId === ctx.systemId ? await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId: ctx.tenantId, status: { not: "ARCHIVED" } }, select: { id: true } }) : null;
    if (!unit) return refuse("VALIDATION", "สาขานี้ไม่ได้ผูกกับจุดขายนี้ หรือถูกเก็บถาวรแล้ว", "unitId");
    if (!evaluate(m, { module: "pos", action: "pos.device.manage", unitId })) return refuse("PERMISSION_DENIED");
    const patch = input.patch as Record<string, unknown>;
    if ("taxBranchNo" in patch && !(m.role === "OWNER" || m.unitAccess.includes("*"))) return refuse("PERMISSION_DENIED", "สาขาที่บนใบกำกับภาษีแก้ได้เฉพาะเจ้าของร้านหรือผู้ดูแลทุกสาขา");
    let audit: { before: Record<string, unknown>; after: Record<string, unknown> } | null = null;
    const res = await prisma.$transaction(async (tx): Promise<PosReceiptUnitResult> => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AppSystem" WHERE id = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS' FOR UPDATE`;
      if (locked.length === 0) return refuse("NOT_FOUND");
      const sys = await loadPos(tx, ctx);
      if (!sys) return refuse("NOT_FOUND");
      const cur = receiptUnitOverride(sys.settings, unitId);
      const merged = mergeReceiptUnitPatch(cur, patch);
      if (!merged.ok) return refuse("VALIDATION", merged.message, merged.field);
      const next = merged.next;
      if (next.taxBranchNo === cur.taxBranchNo && next.address === cur.address && next.phone === cur.phone) return { ok: true, unitId, override: cur };
      const stored = storedReceiptUnit(next);
      const base = Prisma.sql`CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END`;
      const pos = Prisma.sql`(CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END)`;
      const rc = Prisma.sql`(CASE WHEN jsonb_typeof("settings"->'pos'->'receipt') = 'object' THEN "settings"->'pos'->'receipt' ELSE '{}'::jsonb END)`;
      const by = Prisma.sql`(CASE WHEN jsonb_typeof("settings"->'pos'->'receipt'->'byUnit') = 'object' THEN "settings"->'pos'->'receipt'->'byUnit' ELSE '{}'::jsonb END)`;
      const nextBy = stored ? Prisma.sql`${by} || jsonb_build_object(${unitId}::text, ${JSON.stringify(stored)}::jsonb)` : Prisma.sql`${by} - ${unitId}::text`;
      // คำสั่งเดียว: แทนเฉพาะ pos.receipt.byUnit.<unitId> — คีย์อื่นของ receipt / pos / settings คงเดิม
      await tx.$executeRaw`
        UPDATE "AppSystem"
        SET "settings" = jsonb_set(${base}, '{pos}', ${pos} || jsonb_build_object('receipt', ${rc} || jsonb_build_object('byUnit', ${nextBy})), true),
            "updatedAt" = now()
        WHERE "id" = ${sys.id} AND "tenantId" = ${ctx.tenantId} AND type = 'POS'`;
      audit = { before: { receipt: { byUnit: { [unitId]: storedReceiptUnit(cur) } } }, after: { receipt: { byUnit: { [unitId]: stored } } } };
      return { ok: true, unitId, override: next };
    });
    if (res.ok && audit) {
      const { maskPhone } = await import("@/lib/modules/member");
      const a = audit as { before: Record<string, unknown>; after: Record<string, unknown> };
      await writeAudit({ tenantId: ctx.tenantId, actorId: actor.userId, action: "pos.settings.updated", targetType: "AppSystem", targetId: ctx.systemId, before: { unitId, ...maskAuditPhones(a.before, maskPhone) }, after: { unitId, ...maskAuditPhones(a.after, maskPhone) } });
    }
    return res;
  } catch (e) {
    console.error("[pos/receipt-settings] update unit", e);
    return refuse("UNKNOWN");
  }
}
// ◂
