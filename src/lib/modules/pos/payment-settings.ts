// payment-settings.ts — ตั้งค่าการชำระเงินของระบบ POS (P1.6 · O19/O20 · มติ §7 + §8 ข้อ 6)
//
// ที่เก็บ: `AppSystem(POS).settings.pos.serviceCharge {enabled, rateBp}` + `.tip {enabled, ledgerAccountId}` — ปิดเป็นค่าปริยาย
//   ค่าบริการ = % ต่อระบบ POS · อยู่ในยอดบิล + ฐาน VAT (หน้าขายคิด · ผู้เรียก createSale เดิมไม่โดน)
//   ทิป = นอกยอดบิล · ไม่ใช่รายได้ · เปิดได้เมื่อมี "บัญชีพักทิป" ที่เป็นของสมุดบัญชีที่ผูกกับ POS นี้เท่านั้น
//     (POS ไม่ผูกสมุด / ไม่ระบุบัญชี / บัญชีของสมุดอื่น = TIP_ACCOUNT_REQUIRED · ทิปยังปิด)
// 🔴 คำปฏิเสธ "คืน" เป็นข้อมูล {ok:false, code, message} เสมอ — ไม่โยน (R1 · ผู้เรียกคือ action/หน้าตั้งค่า)
// 🔴 แก้ค่าได้เฉพาะเจ้าของร้าน (OWNER) — เปลี่ยนยอดเงินของทุกบิล · พนักงาน/ผู้จัดการ = PERMISSION_DENIED
// 🔴 patch = รวมทับบางส่วน (ส่งเฉพาะ {serviceCharge:{enabled:false}} = อัตราเดิมยังอยู่) · ค่าอื่นใน settings ของระบบไม่ถูกแตะ

import type { Prisma } from "@prisma/client";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { prisma } from "./db";
import {
  parsePosIntentSettings,
  POS_QR_EXPIRY_MAX,
  POS_QR_EXPIRY_MIN,
  type PosIntentSettings,
  type PosIntentSettingsPatch,
  type PosIntentSettingsRefusal,
  type PosIntentSettingsResult,
  promptpayIdForUnit, // POS P1.18 ▸ มติ Q9 ◂
} from "./payment-intent-shared";
import { canManageAllLinkedUnits } from "./receipt-settings";
import { writeAudit } from "@/lib/core/audit"; // POS P1.18 ▸ R6 ◂
import { settingsAuditDiff, type PosSettingsRefusal } from "./settings-shared"; // POS P1.18 ▸ R6 ◂
import { isValidPromptPayId } from "@/lib/payment/promptpay"; // POS P1.18 ▸ มติ Q9 ◂

type Db = typeof prisma | Prisma.TransactionClient;

export type PosPaymentSettings = {
  serviceCharge: { enabled: boolean; rateBp: number };
  tip: { enabled: boolean; ledgerAccountId: string | null };
};
export type PosPaymentSettingsCode = "NOT_FOUND" | "PERMISSION_DENIED" | "VALIDATION" | "TIP_ACCOUNT_REQUIRED" | "TIP_NOT_AVAILABLE" | "UNKNOWN";
export type PosPaymentSettingsRefusal = { ok: false; code: PosPaymentSettingsCode; message: string };
export type PosPaymentSettingsResult = ({ ok: true } & PosPaymentSettings) | PosPaymentSettingsRefusal;
export type PosPaymentSettingsPatch = {
  serviceCharge?: { enabled?: boolean; rateBp?: number };
  tip?: { enabled?: boolean; ledgerAccountId?: string | null };
};
export type PosSettingsActor = { userId: string; role: string; unitAccess?: string[]; permissions?: Record<string, unknown> };

const MSG: Record<PosPaymentSettingsCode, string> = {
  NOT_FOUND: "ไม่พบจุดขายนี้",
  PERMISSION_DENIED: "เฉพาะเจ้าของร้านเท่านั้นที่ตั้งค่าการชำระเงินได้",
  VALIDATION: "ค่าที่ตั้งไม่ถูกต้อง",
  TIP_ACCOUNT_REQUIRED: "เปิดรับทิปไม่ได้ — เลือกบัญชีพักทิปในสมุดบัญชีที่เชื่อมกับจุดขายนี้ก่อน",
  TIP_NOT_AVAILABLE: "ระบบยังไม่เปิดให้รับทิป — รอการลงบัญชีทิปเข้าบัญชีพักทิป (งานถัดไป P1.6b)",
  UNKNOWN: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
};
/**
 * P1.6 R2 F5 (มติผู้คุมงาน): ทิปยังลงบัญชีพักทิปไม่ได้ (JV ตัดทิปออก แต่ยังไม่บันทึก Dr เงินสด/Cr หนี้สินทิป) ⇒ ห้ามเปิดทิปจนกว่า
 * ใบ P1.6b จะลงบัญชีทิปได้จริง · ท่อทิปอื่นทั้งหมดยังอยู่ (ค่าตั้ง · หน้าขาย · createSale · สะพาน) — P1.6b เปลี่ยนค่านี้เป็น true
 */
const TIP_POSTING_READY = false;
const refuse = (code: PosPaymentSettingsCode, message?: string): PosPaymentSettingsRefusal => ({ ok: false, code, message: message ?? MSG[code] });

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isRate = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10_000;

/** อ่านค่าจาก settings JSON ของระบบ (ค่าเพี้ยน = ปิด · ไม่โยน) */
export function parsePosPaymentSettings(settings: unknown): PosPaymentSettings {
  const pos = isRecord(settings) && isRecord(settings.pos) ? settings.pos : {};
  const sc = isRecord(pos.serviceCharge) ? pos.serviceCharge : {};
  const tip = isRecord(pos.tip) ? pos.tip : {};
  const rateBp = isRate(sc.rateBp) ? sc.rateBp : 0;
  const ledgerAccountId = typeof tip.ledgerAccountId === "string" && tip.ledgerAccountId ? tip.ledgerAccountId : null;
  return {
    serviceCharge: { enabled: sc.enabled === true && rateBp > 0, rateBp },
    // R4 H5: ทิปเปิดจริงได้เฉพาะเมื่อลงบัญชีทิปได้แล้ว (ค่าเก่าที่เคยเปิดไว้ = อ่านเป็นปิด)
    tip: { enabled: tip.enabled === true && !!ledgerAccountId && TIP_POSTING_READY, ledgerAccountId },
  };
}

/** ค่าบริการ (สตางค์) ของยอดหลังส่วนลด — ปัดครึ่งขึ้นที่ระดับบิล (มติ K3) · ใช้ร่วมกับ pricing-shared ผ่านสูตรเดียวกัน */
export function serviceChargeOf(netSatang: number, rateBp: number): number {
  if (!(rateBp > 0) || !(netSatang > 0)) return 0;
  return Math.floor((2 * netSatang * rateBp + 10_000) / 20_000);
}

async function loadPos(db: Db, ctx: { tenantId: string; systemId: string }) {
  return db.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { id: true, settings: true } });
}

/** ค่าตั้งการชำระเงินของระบบ POS (อ่านอย่างเดียว) */
export async function posPaymentSettings(ctx: { tenantId: string; systemId: string }, client: Db = prisma): Promise<PosPaymentSettingsResult> {
  try {
    if (!isRecord(ctx) || typeof ctx.tenantId !== "string" || typeof ctx.systemId !== "string") return refuse("NOT_FOUND");
    const sys = await loadPos(client, ctx);
    if (!sys) return refuse("NOT_FOUND");
    return { ok: true, ...parsePosPaymentSettings(sys.settings) };
  } catch (e) {
    console.error("[pos/payment-settings] read", e);
    return refuse("UNKNOWN");
  }
}

/** บัญชีพักทิปต้องเป็นของสมุดบัญชีที่ผูก (เปิดการเชื่อมอยู่) กับ POS นี้ (มติ §8 ข้อ 6) */
async function tipLedgerOk(db: Db, tenantId: string, posSystemId: string, ledgerId: string | null): Promise<boolean> {
  if (!ledgerId) return false;
  const link = await db.accountSystemLink.findFirst({
    where: { tenantId, linkedKind: "POS", linkedId: posSystemId, archivedAt: null, enabled: true },
    select: { systemId: true },
  });
  if (!link) return false;
  const ledger = await db.accountLedger.findFirst({ where: { id: ledgerId, tenantId, systemId: link.systemId, archivedAt: null }, select: { id: true } });
  return !!ledger;
}

/** แก้ค่าตั้งการชำระเงิน (OWNER เท่านั้น) — คืนค่าหลังแก้ · ปฏิเสธ = ค่าเดิมไม่เปลี่ยนแม้แต่ฟิลด์เดียว */
export async function updatePosPaymentSettings(
  ctx: { tenantId: string; systemId: string },
  actor: PosSettingsActor,
  patch: PosPaymentSettingsPatch,
): Promise<PosPaymentSettingsResult> {
  try {
    if (!isRecord(ctx) || typeof ctx.tenantId !== "string" || typeof ctx.systemId !== "string") return refuse("NOT_FOUND");
    if (!isRecord(actor) || actor.role !== "OWNER") return refuse("PERMISSION_DENIED");
    if (!isRecord(patch)) return refuse("VALIDATION");
    const sc = patch.serviceCharge;
    const tip = patch.tip;
    if (sc !== undefined) {
      if (!isRecord(sc)) return refuse("VALIDATION");
      if (sc.enabled !== undefined && typeof sc.enabled !== "boolean") return refuse("VALIDATION");
      if (sc.rateBp !== undefined && !isRate(sc.rateBp)) return refuse("VALIDATION", "อัตราค่าบริการต้องเป็นจำนวนเต็ม 0–10000 (0–100%)");
    }
    if (tip !== undefined) {
      if (!isRecord(tip)) return refuse("VALIDATION");
      if (tip.enabled !== undefined && typeof tip.enabled !== "boolean") return refuse("VALIDATION");
      if (tip.ledgerAccountId !== undefined && tip.ledgerAccountId !== null && (typeof tip.ledgerAccountId !== "string" || tip.ledgerAccountId.length > 64)) return refuse("VALIDATION");
    }

    let diff = null as ReturnType<typeof settingsAuditDiff>; // POS P1.18 ▸ R6 audit (หลัง commit · ไม่เปลี่ยน = ไม่ลง) ◂
    const res = await prisma.$transaction(async (tx): Promise<PosPaymentSettingsResult> => {
      // ล็อกแถวระบบก่อนอ่าน settings (แก้พร้อมกันสองหน้าจอ = ไม่ทับกันหาย)
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AppSystem" WHERE id = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS' FOR UPDATE`;
      if (locked.length === 0) return refuse("NOT_FOUND");
      const sys = await loadPos(tx, ctx);
      if (!sys) return refuse("NOT_FOUND");
      const cur = parsePosPaymentSettings(sys.settings);
      const next: PosPaymentSettings = {
        serviceCharge: {
          enabled: sc?.enabled ?? cur.serviceCharge.enabled,
          rateBp: sc?.rateBp ?? cur.serviceCharge.rateBp,
        },
        tip: {
          enabled: tip?.enabled ?? cur.tip.enabled,
          ledgerAccountId: tip && "ledgerAccountId" in tip ? (tip.ledgerAccountId ?? null) : cur.tip.ledgerAccountId,
        },
      };
      if (next.serviceCharge.enabled && next.serviceCharge.rateBp <= 0) return refuse("VALIDATION", "เปิดค่าบริการต้องระบุอัตรามากกว่า 0");
      if (next.tip.enabled && !(await tipLedgerOk(tx, ctx.tenantId, ctx.systemId, next.tip.ledgerAccountId))) return refuse("TIP_ACCOUNT_REQUIRED");
      // R2 F5: บัญชีพักทิปถูกต้องแล้วก็ยังเปิดไม่ได้ จนกว่า P1.6b (ตรวจหลังบัญชี ⇒ ผู้ใช้เห็นปัญหาบัญชีก่อน)
      if (next.tip.enabled && !TIP_POSTING_READY) return refuse("TIP_NOT_AVAILABLE");

      const base = isRecord(sys.settings) ? sys.settings : {};
      const pos = isRecord(base.pos) ? base.pos : {};
      const settings = { ...base, pos: { ...pos, serviceCharge: next.serviceCharge, tip: next.tip } } as Prisma.InputJsonValue;
      await tx.appSystem.update({ where: { id: sys.id }, data: { settings } });
      diff = settingsAuditDiff("payment", cur, next);
      return { ok: true, ...next };
    });
    if (res.ok && diff) await writeAudit({ tenantId: ctx.tenantId, actorId: actor.userId, action: "pos.settings.updated", targetType: "AppSystem", targetId: ctx.systemId, before: diff.before, after: diff.after });
    return res;
  } catch (e) {
    console.error("[pos/payment-settings] update", e);
    return refuse("UNKNOWN");
  }
}

// ═══════ POS P1.7U ▸ มติ 6: ค่าตั้งใบขอรับเงิน settings.pos.payment (หน้า 17A "วิธีรับเงิน") ═══════
//   ตัวเขียนพี่น้องของ updatePosPaymentSettings (ตัวนั้นไม่แตะ · มันคง pos.payment ไว้อยู่แล้ว — CD-H) — ทางเขียนเดียวกัน:
//   ธุรกรรม + ล็อกแถวระบบ FOR UPDATE + รวม settings ทับเฉพาะ pos.payment (คีย์อื่นของ pos/settings ไม่ถูกแตะ · คีย์ที่ไม่รู้จักใน pos.payment คงไว้)
//   สิทธิ์ = pos.device.manage แบบค่าตั้งใบเสร็จ (ระดับร้าน + ครบทุกสาขาที่ผูก POS นี้ — F9) · ตัวอ่าน = parsePosIntentSettings
// 🔴 ปฏิเสธ = ค่าเดิมไม่เปลี่ยนแม้แต่ฟิลด์เดียว · คืนเป็นข้อมูลเสมอ ไม่โยน ◂
const INTENT_MSG: Record<PosIntentSettingsRefusal["code"], string> = {
  NOT_FOUND: "ไม่พบจุดขายนี้",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ตั้งค่าการรับเงิน — ต้องมีสิทธิ์จัดการเครื่องขายทุกสาขาของจุดขายนี้",
  VALIDATION: "ค่าตั้งการรับเงินไม่ถูกต้อง",
  UNKNOWN: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
};
const intentRefuse = (code: PosIntentSettingsRefusal["code"], message?: string, field?: PosIntentSettingsRefusal["field"]): PosIntentSettingsRefusal =>
  field ? { ok: false, code, message: message ?? INTENT_MSG[code], field } : { ok: false, code, message: message ?? INTENT_MSG[code] };
const INTENT_PATCH_KEYS = new Set(["beam", "qrExpiryMinutes", "manualConfirmRequiresManager"]);

function intentMembership(a: PosSettingsActor): MembershipCtx | null {
  if (!isRecord(a) || typeof a.userId !== "string" || (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF")) return null;
  return {
    role: a.role,
    unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess.filter((u): u is string => typeof u === "string") : [],
    permissions: isRecord(a.permissions) ? a.permissions : {},
  };
}

/** แก้ค่าตั้งใบขอรับเงิน (beam.enabled · qrExpiryMinutes 5..60 · manualConfirmRequiresManager) — คืนค่าหลังแก้ (ตัวอ่านเดียวกับ createPaymentIntent) */
export async function updatePosIntentSettings(
  ctx: { tenantId: string; systemId: string },
  actor: PosSettingsActor,
  patch: PosIntentSettingsPatch,
): Promise<PosIntentSettingsResult> {
  try {
    if (!isRecord(ctx) || typeof ctx.tenantId !== "string" || !ctx.tenantId || typeof ctx.systemId !== "string" || !ctx.systemId) return intentRefuse("NOT_FOUND");
    const m = intentMembership(actor);
    if (!m || !evaluate(m, { module: "pos", action: "pos.device.manage" })) return intentRefuse("PERMISSION_DENIED");
    if (!(await canManageAllLinkedUnits(prisma, ctx, m))) return intentRefuse("PERMISSION_DENIED");
    if (!isRecord(patch) || Object.keys(patch).some((k) => !INTENT_PATCH_KEYS.has(k))) return intentRefuse("VALIDATION");
    const beam: unknown = patch.beam;
    const q: unknown = patch.qrExpiryMinutes;
    const mc: unknown = patch.manualConfirmRequiresManager;
    if (beam !== undefined && (!isRecord(beam) || Object.keys(beam).some((k) => k !== "enabled") || (beam.enabled !== undefined && typeof beam.enabled !== "boolean")))
      return intentRefuse("VALIDATION", undefined, "beam");
    if (q !== undefined && !(typeof q === "number" && Number.isInteger(q) && q >= POS_QR_EXPIRY_MIN && q <= POS_QR_EXPIRY_MAX))
      return intentRefuse("VALIDATION", `อายุ QR ต้องเป็นจำนวนเต็ม ${POS_QR_EXPIRY_MIN}–${POS_QR_EXPIRY_MAX} นาที`, "qrExpiryMinutes");
    if (mc !== undefined && typeof mc !== "boolean") return intentRefuse("VALIDATION", undefined, "manualConfirmRequiresManager");

    let diff = null as ReturnType<typeof settingsAuditDiff>; // POS P1.18 ▸ R6 audit ◂
    const res = await prisma.$transaction(async (tx): Promise<PosIntentSettingsResult> => {
      // ล็อกแถวระบบก่อนอ่าน settings (แบบ updatePosPaymentSettings — แก้พร้อมกันสองหน้าจอ = ไม่ทับกันหาย)
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AppSystem" WHERE id = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS' FOR UPDATE`;
      if (locked.length === 0) return intentRefuse("NOT_FOUND");
      const sys = await loadPos(tx, ctx);
      if (!sys) return intentRefuse("NOT_FOUND");
      const cur = parsePosIntentSettings(sys.settings);
      const b = beam as { enabled?: boolean } | undefined;
      const next: PosIntentSettings = {
        beam: { enabled: b?.enabled ?? cur.beam.enabled },
        qrExpiryMinutes: (q as number | undefined) ?? cur.qrExpiryMinutes,
        manualConfirmRequiresManager: (mc as boolean | undefined) ?? cur.manualConfirmRequiresManager,
      };
      const base = isRecord(sys.settings) ? sys.settings : {};
      const pos = isRecord(base.pos) ? base.pos : {};
      const rawPay = isRecord(pos.payment) ? pos.payment : {};
      const rawBeam = isRecord(rawPay.beam) ? rawPay.beam : {};
      const payment = { ...rawPay, beam: { ...rawBeam, enabled: next.beam.enabled }, qrExpiryMinutes: next.qrExpiryMinutes, manualConfirmRequiresManager: next.manualConfirmRequiresManager };
      const settings = { ...base, pos: { ...pos, payment } } as Prisma.InputJsonValue;
      await tx.appSystem.update({ where: { id: sys.id }, data: { settings } });
      diff = settingsAuditDiff("intent", cur, next);
      return { ok: true, settings: parsePosIntentSettings(settings) };
    });
    if (res.ok && diff) await writeAudit({ tenantId: ctx.tenantId, actorId: actor.userId, action: "pos.settings.updated", targetType: "AppSystem", targetId: ctx.systemId, before: diff.before, after: diff.after });
    return res;
  } catch (e) {
    console.error("[pos/payment-settings] update intent", e);
    return intentRefuse("UNKNOWN");
  }
}

// ═══════ POS P1.18 ▸ มติ Q9 + CD-10: เลขพร้อมเพย์รายสาขา settings.pos.payment.promptpayIdByUnit.<unitId> ═══════
//   ปลายทางเงิน ⇒ เจ้าของร้านเท่านั้น (คนอื่น = SETTINGS_SECTION_LOCKED · R16) · ตรวจด้วย isValidPromptPayId · สาขาต้องผูก POS นี้ (ไม่งั้น NOT_FOUND)
//   null = ลบเลขของสาขา (กลับไปใช้เลขของโปรไฟล์ร้าน) · เขียนเฉพาะ promptpayIdByUnit ใต้ pos.payment (คีย์พี่น้องของ payment คงไว้)
//   ทางเขียน: ธุรกรรม + ล็อกแถว FOR UPDATE + jsonb_set ในคำสั่งเดียว · audit section "payment" ค่าปิดบัง (เลขท้าย 4 หลัก — ไม่มีเลขดิบใน AuditLog)
//   ตัวอ่าน = promptpayIdForUnit (payment-intent-shared.ts · ทาง QR ไดนามิกอ่านเลขสาขาก่อน โปรไฟล์ทีหลัง) ◂
export type PosUnitPromptpayResult = { ok: true; unitId: string; promptpayMasked: string | null } | PosSettingsRefusal;
const UNIT_PP_MSG: Record<PosSettingsRefusal["code"], string> = {
  NOT_FOUND: "ไม่พบสาขานี้ในจุดขายนี้",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ตั้งค่านี้",
  VALIDATION: "เลขพร้อมเพย์ไม่ถูกต้อง — ใช้เบอร์มือถือ 10 หลัก หรือเลขผู้เสียภาษี/บัตรประชาชน 13 หลัก",
  UNKNOWN: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
  SETTINGS_SECTION_LOCKED: "เลขพร้อมเพย์เป็นปลายทางเงิน — เจ้าของร้านเท่านั้นที่ตั้งได้",
  CONFIRM_REQUIRED: "ต้องยืนยันก่อน",
};
const unitPpRefuse = (code: PosSettingsRefusal["code"], field?: string): PosSettingsRefusal =>
  field ? { ok: false, code, message: UNIT_PP_MSG[code], field } : { ok: false, code, message: UNIT_PP_MSG[code] };
/** เลขที่แสดง/บันทึก audit — เห็นแค่ 4 ตัวท้าย */
export function maskPromptpayId(id: string | null): string | null {
  if (!id) return null;
  const digits = id.replace(/\D/g, "");
  return `••••${digits.slice(-4)}`;
}

export async function updatePosUnitPromptpay(
  ctx: { tenantId: string; systemId: string },
  actor: PosSettingsActor,
  input: { unitId: string; promptpayId: string | null },
): Promise<PosUnitPromptpayResult> {
  try {
    if (!isRecord(ctx) || typeof ctx.tenantId !== "string" || !ctx.tenantId || typeof ctx.systemId !== "string" || !ctx.systemId) return unitPpRefuse("NOT_FOUND");
    if (!isRecord(actor) || typeof actor.userId !== "string" || !actor.userId) return unitPpRefuse("PERMISSION_DENIED");
    if (actor.role !== "OWNER") return unitPpRefuse("SETTINGS_SECTION_LOCKED");
    if (!isRecord(input) || typeof input.unitId !== "string" || !input.unitId || input.unitId.length > 64) return unitPpRefuse("VALIDATION", "unitId");
    const raw: unknown = input.promptpayId;
    if (raw !== null && (typeof raw !== "string" || raw.length > 32 || !isValidPromptPayId(raw.trim()))) return unitPpRefuse("VALIDATION", "promptpayId");
    const next = raw === null ? null : (raw as string).trim();
    const unitId = input.unitId;
    const link = await prisma.appSystemUnit.findUnique({ where: { tenantId_unitId_type: { tenantId: ctx.tenantId, unitId, type: "POS" } }, select: { systemId: true } });
    const unit = link?.systemId === ctx.systemId ? await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId: ctx.tenantId, status: { not: "ARCHIVED" } }, select: { id: true } }) : null;
    if (!unit) return unitPpRefuse("NOT_FOUND");
    let before = null as string | null;
    const changed = await prisma.$transaction(async (tx): Promise<boolean | PosSettingsRefusal> => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AppSystem" WHERE id = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS' FOR UPDATE`;
      if (locked.length === 0) return unitPpRefuse("NOT_FOUND");
      const sys = await loadPos(tx, ctx);
      if (!sys) return unitPpRefuse("NOT_FOUND");
      before = promptpayIdForUnit(sys.settings, unitId);
      const pos = isRecord(sys.settings) && isRecord(sys.settings.pos) ? sys.settings.pos : {};
      const pay = isRecord(pos.payment) ? pos.payment : {};
      const map: Record<string, unknown> = { ...(isRecord(pay.promptpayIdByUnit) ? pay.promptpayIdByUnit : {}) };
      const had = Object.prototype.hasOwnProperty.call(map, unitId);
      if (next === null ? !had : map[unitId] === next) return false;
      if (next === null) delete map[unitId];
      else map[unitId] = next;
      const json = JSON.stringify(map);
      await tx.$executeRaw`
        UPDATE "AppSystem"
        SET "settings" = jsonb_set(
          CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
          '{pos}',
          (CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END)
            || jsonb_build_object('payment',
                 (CASE WHEN jsonb_typeof("settings"->'pos'->'payment') = 'object' THEN "settings"->'pos'->'payment' ELSE '{}'::jsonb END)
                   || jsonb_build_object('promptpayIdByUnit', ${json}::jsonb)),
          true),
          "updatedAt" = now()
        WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND type = 'POS'`;
      return true;
    });
    if (typeof changed !== "boolean") return changed;
    if (changed)
      await writeAudit({
        tenantId: ctx.tenantId,
        actorId: actor.userId,
        action: "pos.settings.updated",
        targetType: "AppSystem",
        targetId: ctx.systemId,
        before: { section: "payment", unitId, promptpayMasked: maskPromptpayId(before) },
        after: { section: "payment", unitId, promptpayMasked: maskPromptpayId(next) },
      });
    return { ok: true, unitId, promptpayMasked: maskPromptpayId(next) };
  } catch (e) {
    console.error("[pos/payment-settings] unit promptpay", e);
    return unitPpRefuse("UNKNOWN");
  }
}
