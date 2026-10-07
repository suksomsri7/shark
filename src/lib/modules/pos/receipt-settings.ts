// receipt-settings.ts — อ่าน/แก้ค่าตั้งใบเสร็จของระบบ POS (P1.10 · มติ R4) · แบบเดียวกับ payment-settings.ts
//
// ที่เก็บ: `AppSystem(POS).settings.pos.receipt` · คีย์อื่นของ settings (serviceCharge/tip/shift/heldCart …) ไม่ถูกแตะ
// 🔴 คำปฏิเสธ "คืน" เป็นข้อมูล {ok:false, code, message} เสมอ — ไม่โยน
// 🔴 แก้ได้เมื่อมีสิทธิ์ pos.device.manage (OWNER/MANAGER ได้โดยปริยาย · STAFF ต้องได้รับเจาะจง) · ไม่มีสิทธิ์ = PERMISSION_DENIED
// 🔴 ปฏิเสธ = ค่าเดิมไม่เปลี่ยนแม้แต่ฟิลด์เดียว (ตรวจทั้งก้อนก่อนเขียน · ล็อกแถวระบบ FOR UPDATE)
import type { Prisma } from "@prisma/client";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { prisma } from "./db";
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
    if (!isRecord(patch)) return refuse("VALIDATION");
    return await prisma.$transaction(async (tx): Promise<PosReceiptSettingsResult> => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AppSystem" WHERE id = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS' FOR UPDATE`;
      if (locked.length === 0) return refuse("NOT_FOUND");
      const sys = await loadPos(tx, ctx);
      if (!sys) return refuse("NOT_FOUND");
      const cur = receiptSettingsOf(sys.settings);
      const parsed = parseReceiptSettings(mergeReceiptSettings(cur, patch));
      if (!parsed.ok) return refuse("VALIDATION", parsed.message, parsed.field);
      const base = isRecord(sys.settings) ? sys.settings : {};
      const pos = isRecord(base.pos) ? base.pos : {};
      const settings = { ...base, pos: { ...pos, receipt: parsed.settings } } as Prisma.InputJsonValue;
      await tx.appSystem.update({ where: { id: sys.id }, data: { settings } });
      return { ok: true, settings: parsed.settings };
    });
  } catch (e) {
    console.error("[pos/receipt-settings] update", e);
    return refuse("UNKNOWN");
  }
}
