// receipt-settings.ts — อ่าน/แก้ค่าตั้งใบเสร็จของระบบ POS (P1.10 · มติ R4) · แบบเดียวกับ payment-settings.ts
//
// ที่เก็บ: `AppSystem(POS).settings.pos.receipt` · คีย์อื่นของ settings (serviceCharge/tip/shift/heldCart …) ไม่ถูกแตะ
// 🔴 คำปฏิเสธ "คืน" เป็นข้อมูล {ok:false, code, message} เสมอ — ไม่โยน
// 🔴 แก้ได้เมื่อมีสิทธิ์ pos.device.manage (OWNER/MANAGER ได้โดยปริยาย · STAFF ต้องได้รับเจาะจง) · ไม่มีสิทธิ์ = PERMISSION_DENIED
// 🔴 ค่าตั้งใบเสร็จใช้ทุกสาขาของ POS นี้ ⇒ ต้องมี pos.device.manage ที่ "ทุกสาขา" ที่ผูก POS นี้ (แก้รอบ 1 F9 · แบบ posCanSetTenantPrice) ·
//    OWNER / unitAccess "*" ผ่าน · POS ยังไม่ผูกสาขา = เฉพาะ OWNER / "*" · อ่านไม่เปลี่ยน
// 🔴 ปฏิเสธ = ค่าเดิมไม่เปลี่ยนแม้แต่ฟิลด์เดียว (ตรวจทั้งก้อนก่อนเขียน · ล็อกแถวระบบ FOR UPDATE)
import type { Prisma } from "@prisma/client";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { prisma } from "./db";
import { writeAudit } from "@/lib/core/audit"; // POS P1.18 ▸ R6 ◂
import { maskAuditPhones, settingsAuditDiff } from "./settings-shared"; // POS P1.18 ▸ R6 · F5 ◂
import {
  mergeReceiptSettings,
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
      const json = JSON.stringify(parsed.settings);
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
