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
import { prisma } from "./db";

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
    tip: { enabled: tip.enabled === true && !!ledgerAccountId, ledgerAccountId },
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

    return await prisma.$transaction(async (tx): Promise<PosPaymentSettingsResult> => {
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
      return { ok: true, ...next };
    });
  } catch (e) {
    console.error("[pos/payment-settings] update", e);
    return refuse("UNKNOWN");
  }
}
