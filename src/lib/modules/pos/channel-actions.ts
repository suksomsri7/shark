"use server";
// channel-actions.ts — server action ช่องทางขาย (POS P2.1 · R3) · เปลือกบาง: session → ctx/actor → channel.*
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function — ชนิดข้อมูลอยู่ที่ channel-shared.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} (Next ปิดข้อความของ error ที่โยนออกจาก action ใน production)
// 🔴 ร้าน + ผู้ใช้ (role · unitAccess · permissions) มาจาก membership ของ SESSION เท่านั้น · systemId/unitId จากคำขอถูกตรวจซ้ำใน channel.ts
//    รายการ = pos.sale.read หรือ pos.sale.create ที่สาขา · สร้าง/แก้/เก็บ = pos.channel.manage ที่สาขา (ตรวจใน channel.ts)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { archiveChannel, listChannels, saveChannel } from "./channel";
import type { ArchiveChannelResult, ChannelInput, ChannelRefusal, ListChannelsResult, SaveChannelResult } from "./channel-shared";
import type { RegisterActor, RegisterCtx } from "./register-shared";

type Target = { systemId: string; unitId: string };

function refusal(code: ChannelRefusal["code"], message: string): ChannelRefusal {
  return { ok: false, code, message };
}

function unexpected(where: string, e: unknown): ChannelRefusal {
  console.error(`[pos/channel-actions] ${where}`, e);
  return refusal("INTERNAL", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
}

/** session → ขอบเขต + ผู้ใช้ · เข้าสาขาไม่ได้ = NOT_FOUND · ไม่มีสิทธิ์ที่สาขานี้ = PERMISSION_DENIED (channel.ts ตรวจซ้ำกับ DB) */
async function sessionScope(args: unknown, need: "read" | "manage"): Promise<{ ctx: RegisterCtx; actor: RegisterActor } | ChannelRefusal> {
  const auth = await requireTenant();
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  const actions = need === "manage" ? (["pos.channel.manage"] as const) : (["pos.sale.read", "pos.sale.create"] as const);
  const allowed = actions.some((action) => {
    try {
      assertCan(m, { module: "pos", action, unitId });
      return true;
    } catch {
      return false;
    }
  });
  if (!allowed) return refusal("PERMISSION_DENIED", need === "manage" ? "บัญชีนี้ยังไม่มีสิทธิ์ตั้งค่าช่องทางขาย — ขอสิทธิ์จากเจ้าของร้าน" : "บัญชีนี้ยังไม่มีสิทธิ์ดูช่องทางขาย — ขอสิทธิ์จากเจ้าของร้าน");
  return { ctx: { tenantId: auth.active.tenantId, systemId, unitId }, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } };
}

/** ช่องทางขายของสาขา (ครั้งแรกสร้างช่องทางพื้นฐาน 4 ช่องทาง) · includeArchived = แสดงที่เก็บแล้วด้วย */
export async function listChannelsAction(args: Target & { includeArchived?: boolean }): Promise<ListChannelsResult> {
  try {
    const s = await sessionScope(args, "read");
    if ("ok" in s) return s;
    return await listChannels(s.ctx, s.actor, args?.includeArchived === undefined ? {} : { includeArchived: args.includeArchived });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("listChannelsAction", e);
  }
}

/** สร้าง (ไม่มี id · ต้องมี code) / แก้ (มี id) ช่องทาง — input คีย์ตายตัวตาม ChannelInput */
export async function saveChannelAction(args: Target & { input: ChannelInput }): Promise<SaveChannelResult> {
  try {
    const s = await sessionScope(args, "manage");
    if ("ok" in s) return s;
    return await saveChannel(s.ctx, s.actor, args?.input);
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("saveChannelAction", e);
  }
}

/** เก็บช่องทาง (soft) — ช่องทางพื้นฐานเก็บไม่ได้ */
export async function archiveChannelAction(args: Target & { id: string }): Promise<ArchiveChannelResult> {
  try {
    const s = await sessionScope(args, "manage");
    if ("ok" in s) return s;
    return await archiveChannel(s.ctx, s.actor, { id: args?.id });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("archiveChannelAction", e);
  }
}
