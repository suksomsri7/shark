"use server";
// price-rule-actions.ts — server action โปรราคา / happy hour (POS P2.2 · R3) · เปลือกบาง: session → ctx/actor → price-rule.*
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ price-shared.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} (Next ปิดข้อความของ error ที่โยนออกจาก action ใน production)
// 🔴 ร้าน + ผู้ใช้ (role · unitAccess · permissions) มาจาก membership ของ SESSION เท่านั้น · systemId/unitId จากคำขอถูกตรวจซ้ำใน price-rule.ts
//    รายการ = pos.sale.read หรือ pos.sale.create ที่สาขา · บันทึก/เก็บถาวร = pos.price.rule ที่ทุกสาขาของกติกา (ตรวจใน price-rule.ts)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { archivePriceRule, listPriceRules, savePriceRule } from "./price-rule";
import type { ArchivePriceRuleResult, ListPriceRulesResult, PriceRuleInput, PriceRuleRefusal, SavePriceRuleResult } from "./price-shared";
import type { RegisterActor, RegisterCtx } from "./register-shared";

type Target = { systemId: string; unitId: string };

function refusal(code: PriceRuleRefusal["code"], message: string): PriceRuleRefusal {
  return { ok: false, code, message };
}

function unexpected(where: string, e: unknown): PriceRuleRefusal {
  console.error(`[pos/price-rule-actions] ${where}`, e);
  return refusal("INTERNAL", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
}

/** session → ขอบเขต + ผู้ใช้ · เข้าสาขาไม่ได้ = PRICE_RULE_NOT_FOUND · ไม่มีสิทธิ์ที่สาขานี้ = PERMISSION_DENIED (price-rule.ts ตรวจซ้ำกับ DB) */
async function sessionScope(args: unknown, need: "read" | "write"): Promise<{ ctx: RegisterCtx; actor: RegisterActor } | PriceRuleRefusal> {
  const auth = await requireTenant();
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return refusal("PRICE_RULE_NOT_FOUND", "ไม่พบสาขานี้");
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return refusal("PRICE_RULE_NOT_FOUND", "ไม่พบสาขานี้");
  const actions = need === "write" ? (["pos.price.rule"] as const) : (["pos.sale.read", "pos.sale.create"] as const);
  const allowed = actions.some((action) => {
    try {
      assertCan(m, { module: "pos", action, unitId });
      return true;
    } catch {
      return false;
    }
  });
  if (!allowed) return refusal("PERMISSION_DENIED", need === "write" ? "บัญชีนี้ยังไม่มีสิทธิ์ตั้งโปรราคาและ happy hour — ขอสิทธิ์จากเจ้าของร้าน" : "บัญชีนี้ยังไม่มีสิทธิ์ดูโปรราคา — ขอสิทธิ์จากเจ้าของร้าน");
  return { ctx: { tenantId: auth.active.tenantId, systemId, unitId }, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } };
}

/** โปรราคาของระบบ (ปริยาย = ที่ยังไม่เก็บถาวร) · includeArchived = รวมที่เก็บถาวร */
export async function listPriceRulesAction(args: Target & { includeArchived?: boolean }): Promise<ListPriceRulesResult> {
  try {
    const s = await sessionScope(args, "read");
    if ("ok" in s) return s;
    return await listPriceRules(s.ctx, s.actor, args?.includeArchived === undefined ? {} : { includeArchived: args.includeArchived });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("listPriceRulesAction", e);
  }
}

/** สร้าง (ไม่มี id) / แก้ (มี id) โปรราคา — input คีย์ตายตัวตาม PriceRuleInput */
export async function savePriceRuleAction(args: Target & { input: PriceRuleInput }): Promise<SavePriceRuleResult> {
  try {
    const s = await sessionScope(args, "write");
    if ("ok" in s) return s;
    return await savePriceRule(s.ctx, s.actor, args?.input);
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("savePriceRuleAction", e);
  }
}

/** เก็บถาวรโปรราคา (soft) — บิลเก่ายังอ้าง id เดิม */
export async function archivePriceRuleAction(args: Target & { id: string }): Promise<ArchivePriceRuleResult> {
  try {
    const s = await sessionScope(args, "write");
    if ("ok" in s) return s;
    return await archivePriceRule(s.ctx, s.actor, { id: args?.id });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("archivePriceRuleAction", e);
  }
}
