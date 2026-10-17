"use server";
// ai-settings-actions.ts — ตัวเขียนค่าตั้งผู้ช่วย AI ของระบบ POS (POS P3.9 ▸ R10 มติ 4 5 ◂) · เปลือกของจอ 10 (P3.9U)
//
// 🔴 "use server" export ได้เฉพาะ async function · ชนิด/ตัวอ่านอยู่ที่ settings-shared.ts (posAiSettings)
// 🔴 เจ้าของร้านเท่านั้น (OWNER ของ session) · ร้าน/บทบาทมาจาก session · systemId ตรวจซ้ำว่าเป็น POS ของร้านนี้
// 🔴 เขียนเฉพาะคีย์ settings.pos.ai ในคำสั่งเดียว (jsonb_set — คีย์อื่นไม่ถูกแตะ) → audit pos.settings.updated {section:"ai"}
// 🔴 managerUserIds ต้องเป็นผู้จัดการ (MANAGER) ของร้านที่รับคำเชิญแล้วทุกคน — ไม่ใช่ = VALIDATION (ไม่บันทึกอะไร)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { writeAudit } from "@/lib/core/audit";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { prisma } from "./db";
import { posAiSettings, POS_AI_MANAGERS_MAX, type PosAiSettings, type PosSettingsRefusal } from "./settings-shared";

type Result = { ok: true; ai: PosAiSettings } | PosSettingsRefusal;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const refuse = (code: PosSettingsRefusal["code"], message: string, field?: string): PosSettingsRefusal => ({ ok: false, code, message, ...(field ? { field } : {}) });

/** อ่านค่าตั้งผู้ช่วย AI ของระบบ POS (สมาชิกของร้านที่เปิดหน้าตั้งค่าได้) */
export async function getPosAiSettingsAction(systemId: string): Promise<Result> {
  try {
    const auth = await requireTenant();
    const sys = await prisma.appSystem.findFirst({ where: { id: String(systemId ?? ""), tenantId: auth.active.tenantId, type: "POS" }, select: { settings: true } });
    if (!sys) return refuse("NOT_FOUND", "ไม่พบระบบขายหน้าร้านนี้");
    return { ok: true, ai: posAiSettings(sys.settings) };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/ai-settings-actions] get", e);
    return refuse("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
  }
}

/** แก้ค่าตั้งผู้ช่วย AI (รวมทับบางส่วน: enabled · anomalyInBrief · brief.{enabled, hourBkk, email, managerUserIds}) */
export async function updatePosAiSettingsAction(systemId: string, patch: unknown): Promise<Result> {
  try {
    const auth = await requireTenant();
    const tenantId = auth.active.tenantId;
    if (auth.active.role !== "OWNER") return refuse("PERMISSION_DENIED", "เฉพาะเจ้าของร้านเท่านั้นที่แก้ค่าตั้งผู้ช่วย AI ได้");
    try {
      assertCan(posMembership(auth.active), { module: "pos", action: "pos.settings.manage" });
    } catch (e) {
      if (e instanceof ForbiddenError) return refuse("PERMISSION_DENIED", "เฉพาะเจ้าของร้านเท่านั้นที่แก้ค่าตั้งผู้ช่วย AI ได้");
      throw e;
    }
    if (!isRecord(patch)) return refuse("VALIDATION", "ข้อมูลไม่ถูกต้อง");
    const sys = await prisma.appSystem.findFirst({ where: { id: String(systemId ?? ""), tenantId, type: "POS" }, select: { id: true, settings: true } });
    if (!sys) return refuse("NOT_FOUND", "ไม่พบระบบขายหน้าร้านนี้");
    const before = posAiSettings(sys.settings);
    const next: PosAiSettings = { ...before, brief: { ...before.brief } };
    const bool = (v: unknown, field: string): boolean | PosSettingsRefusal => (typeof v === "boolean" ? v : refuse("VALIDATION", "ต้องเป็นเปิด/ปิด", field));
    for (const [k, v] of Object.entries(patch)) {
      if (k === "enabled" || k === "anomalyInBrief") {
        const b = bool(v, k);
        if (typeof b !== "boolean") return b;
        next[k] = b;
      } else if (k === "brief" && isRecord(v)) {
        for (const [bk, bv] of Object.entries(v)) {
          if (bk === "enabled" || bk === "email") {
            const b = bool(bv, `brief.${bk}`);
            if (typeof b !== "boolean") return b;
            next.brief[bk] = b;
          } else if (bk === "hourBkk") {
            if (typeof bv !== "number" || !Number.isInteger(bv) || bv < 0 || bv > 23) return refuse("VALIDATION", "เวลาต้องเป็นชั่วโมง 0–23", "brief.hourBkk");
            next.brief.hourBkk = bv;
          } else if (bk === "managerUserIds") {
            if (!Array.isArray(bv) || bv.length > POS_AI_MANAGERS_MAX || !bv.every((x) => typeof x === "string" && x.length > 0 && x.length <= 64)) return refuse("VALIDATION", "รายชื่อผู้รับไม่ถูกต้อง", "brief.managerUserIds");
            const ids = [...new Set(bv as string[])];
            const ok = ids.length ? await prisma.membership.count({ where: { tenantId, userId: { in: ids }, role: "MANAGER", acceptedAt: { not: null } } }) : 0;
            if (ok !== ids.length) return refuse("VALIDATION", "ผู้รับต้องเป็นผู้จัดการของร้านที่รับคำเชิญแล้ว", "brief.managerUserIds");
            next.brief.managerUserIds = ids;
          } else return refuse("VALIDATION", `ไม่รู้จักค่า brief.${bk}`, `brief.${bk}`);
        }
      } else return refuse("VALIDATION", `ไม่รู้จักค่า ${k}`, k);
    }
    if (JSON.stringify(next) === JSON.stringify(before)) return { ok: true, ai: before };
    const json = JSON.stringify(next);
    await prisma.$executeRaw`
      UPDATE "AppSystem"
      SET "settings" = jsonb_set(
        jsonb_set(CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END, '{pos}',
          CASE WHEN jsonb_typeof("settings"->'pos') = 'object' THEN "settings"->'pos' ELSE '{}'::jsonb END, true),
        '{pos,ai}', ${json}::jsonb, true),
        "updatedAt" = now()
      WHERE "id" = ${sys.id} AND "tenantId" = ${tenantId} AND type = 'POS'`;
    await writeAudit({ tenantId, actorId: auth.user.id, action: "pos.settings.updated", targetType: "AppSystem", targetId: sys.id, before: { section: "ai", ...before }, after: { section: "ai", ...next } });
    return { ok: true, ai: next };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/ai-settings-actions] update", e);
    return refuse("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
  }
}
