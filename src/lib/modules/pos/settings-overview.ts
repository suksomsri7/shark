// settings-overview.ts — ตัวอ่านของหน้าตั้งค่า POS (P1.18 S · R2 ภาพรวมค่าตั้ง · R10 แท็บพนักงานและสิทธิ์)
//
// 🔴 อ่านอย่างเดียว · ทุกค่ามาจากตัวอ่านเดิมของคีย์นั้น (ไม่มีตัวแกะที่สอง) · คำปฏิเสธเป็นข้อมูล ไม่โยน
// 🔴 ขอบเขต: ร้าน (session) + ระบบ POS + สาขาที่ผูก POS นี้ — ร้านอื่น / ระบบอื่น / สาขาไม่ผูก / id มั่ว = NOT_FOUND
// 🔴 posSettingsOverview: แคชเชียร์ (pos.sale.create) อ่านได้แบบดูอย่างเดียว · canEdit ต่อส่วน = สิทธิ์จริงของตัวเขียนส่วนนั้น
//    (general/caps = pos.settings.manage ครบทุกสาขา · unitStock/staff = ที่สาขานี้ · receipt = pos.device.manage ครบทุกสาขา (FU-c) · payment = เจ้าของ)

import { evaluate } from "@/lib/core/rbac";
import { prisma } from "./db";
import { posDiscountCaps } from "./register-shared";
import { parsePosPaymentSettings } from "./payment-settings";
import { unitOversellPolicy } from "./service";
import { canOnAllLinkedUnits, ctxOk, PERM_SETTINGS_MANAGE, posGeneralSettingsOf, settingsMembership, settingsRefuse, unitLinkedToPos, type PosSettingsWriterActor } from "./settings-general";
import type { PosSettingsCanEdit, PosGeneralSettings, PosOversellPolicy, PosSettingsRefusal } from "./settings-shared";
import type { PosDiscountCaps } from "./register-shared";
import type { PosPaymentSettings } from "./payment-settings";

type UnitCtx = { tenantId: string; systemId: string; unitId: string };

export type PosSettingsOverview = {
  ok: true;
  canEdit: PosSettingsCanEdit;
  general: PosGeneralSettings;
  caps: PosDiscountCaps;
  unitStock: { unitId: string; oversellPolicy: PosOversellPolicy };
  serviceCharge: PosPaymentSettings["serviceCharge"];
  tip: PosPaymentSettings["tip"];
};
export type PosSettingsOverviewResult = PosSettingsOverview | PosSettingsRefusal;

const unitCtxOk = (ctx: unknown): ctx is UnitCtx => ctxOk(ctx) && typeof (ctx as UnitCtx).unitId === "string" && !!(ctx as UnitCtx).unitId && (ctx as UnitCtx).unitId.length <= 64;

/** ขอบเขตร่วม: ระบบ POS ของร้านนี้ + สาขาผูก POS นี้ (ไม่ใช่ = NOT_FOUND) */
async function scopeOf(ctx: unknown, actor: unknown) {
  if (!unitCtxOk(ctx)) return settingsRefuse("NOT_FOUND");
  const m = settingsMembership(actor);
  if (!m) return settingsRefuse("PERMISSION_DENIED");
  const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { id: true, settings: true } });
  if (!sys || !(await unitLinkedToPos(prisma, ctx, ctx.unitId))) return settingsRefuse("NOT_FOUND");
  return { ctx, m, settings: sys.settings as unknown };
}

/** R2 — ภาพรวมค่าตั้งของหน้า "ทั่วไป" (อ่านด้วย pos.sale.create หรือ pos.settings.manage ที่สาขา) */
export async function posSettingsOverview(ctx: UnitCtx, actor: PosSettingsWriterActor, _input: unknown = {}): Promise<PosSettingsOverviewResult> {
  try {
    const s = await scopeOf(ctx, actor);
    if ("ok" in s) return s;
    const { m } = s;
    const unitId = s.ctx.unitId;
    const canRead = evaluate(m, { module: "pos", action: "pos.sale.create", unitId }) || evaluate(m, { module: "pos", action: PERM_SETTINGS_MANAGE, unitId });
    if (!canRead) return settingsRefuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ดูค่าตั้งของสาขานี้");
    const sctx = { tenantId: s.ctx.tenantId, systemId: s.ctx.systemId };
    const [allSettings, allReceipt] = await Promise.all([
      canOnAllLinkedUnits(prisma, sctx, m, PERM_SETTINGS_MANAGE),
      canOnAllLinkedUnits(prisma, sctx, m, "pos.device.manage"),
    ]);
    const atUnit = evaluate(m, { module: "pos", action: PERM_SETTINGS_MANAGE, unitId });
    const pay = parsePosPaymentSettings(s.settings);
    return {
      ok: true,
      canEdit: { general: allSettings, caps: allSettings, unitStock: atUnit, staff: atUnit, payment: m.role === "OWNER", receipt: allReceipt },
      general: posGeneralSettingsOf(s.settings),
      caps: posDiscountCaps(s.settings),
      unitStock: { unitId, oversellPolicy: await unitOversellPolicy(prisma, s.ctx.tenantId, unitId) },
      serviceCharge: pay.serviceCharge,
      tip: pay.tip,
    };
  } catch (e) {
    console.error("[pos/settings-overview] overview", e);
    return settingsRefuse("UNKNOWN");
  }
}
