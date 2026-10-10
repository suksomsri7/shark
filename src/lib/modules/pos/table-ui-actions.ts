"use server";
// table-ui-actions.ts — POS P2.4U เปลือกบางเพิ่มเติมของจอโต๊ะ (deviation ของใบ U · สัญญา S ไม่มี action สองตัวนี้)
//   1) registerProductsByIdsAction — ชื่อ/ราคาของสินค้าในรอบร่างของโต๊ะ (สินค้าที่ไม่อยู่ในหน้าแรกของกริด) → registerProductsByIds (มีอยู่แล้ว · กติกามองเห็นเดียวกับกริด)
//   2) registerReservationsTodayAction — รายการจองที่ยังรอ (BOOKED) ของวันนี้ตามเวลาไทย (แผ่น "จองโต๊ะวันนี้" มติ 7 · registerTables ให้แค่จำนวน)
//      → ด่านเดียวกับผังโต๊ะ (registerScopeFor · pos.sale.create หรือ pos.sale.read) แล้วอ่านผ่าน facade ร้านอาหาร tableFloorForPos (อ่านอย่างเดียว · ไม่มีตัวเขียนใหม่)
// 🔴 "use server" export เฉพาะ async function · คำปฏิเสธคืนเป็นข้อมูล {ok:false, code, message} · ร้าน/ผู้ใช้มาจาก session เท่านั้น

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { prisma } from "./db";
import { registerProductsByIds, registerScopeFor } from "./register";
import { RESERVATION_HOLD_MAX_MINUTES } from "./table-shared";
import type { RegisterActor, RegisterCtx, RegisterProduct, RegisterRefusal } from "./register-shared";

type Session = Awaited<ReturnType<typeof requireTenant>>;
type Target = { systemId: string; unitId: string; deviceId?: string };
type TableReservationRow = { id: string; tableId: string | null; name: string; phone: string | null; partySize: number; at: string; holdFromMinutes: number };

function refusal(code: RegisterRefusal["code"], message: string): RegisterRefusal {
  return { ok: false, code, message };
}
function unexpected(where: string, e: unknown): RegisterRefusal {
  console.error(`[pos/table-ui-actions] ${where}`, e);
  return refusal("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
}
async function session(where: string): Promise<Session | RegisterRefusal> {
  try {
    return await requireTenant();
  } catch (e) {
    unstable_rethrow(e);
    return unexpected(`${where} requireTenant`, e);
  }
}
/** session → ctx + actor · เข้าสาขาไม่ได้ = NOT_FOUND · ไม่มีสิทธิ์ใดใน perms ที่สาขานี้ = PERMISSION_DENIED (ตรวจซ้ำใน register.ts) */
function sessionScope(auth: Session, args: unknown, perms: readonly string[]): { ctx: RegisterCtx; actor: RegisterActor } | RegisterRefusal {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  let allowed = false;
  for (const action of perms) {
    try {
      assertCan(m, { module: "pos", action, unitId });
      allowed = true;
      break;
    } catch {
      /* ลองสิทธิ์ถัดไป */
    }
  }
  if (!allowed) return refusal("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ใช้หน้าขาย — ขอให้เจ้าของร้านเพิ่มสิทธิ์");
  const deviceId = typeof a.deviceId === "string" ? a.deviceId : undefined;
  return { ctx: { tenantId: auth.active.tenantId, systemId, unitId, ...(deviceId !== undefined ? { deviceId } : {}) }, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } };
}

/** สินค้าตาม id ที่ยังขายได้ที่สาขานี้ (ชื่อ/ราคา/ตัวเลือก ของบรรทัดรอบร่างโต๊ะ) — ไม่พบ = ไม่อยู่ในผล */
export async function registerProductsByIdsAction(args: Target & { ids: string[] }): Promise<{ ok: true; products: RegisterProduct[] } | RegisterRefusal> {
  const auth = await session("registerProductsByIdsAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args, ["pos.sale.create"]);
    if ("ok" in s) return s;
    const ids = Array.isArray(args?.ids) ? args.ids.filter((x): x is string => typeof x === "string") : [];
    return { ok: true, products: await registerProductsByIds(s.ctx, s.actor, ids) };
  } catch (e) {
    return unexpected("registerProductsByIdsAction", e);
  }
}

/** การจองที่ยังรอ (BOOKED) ของวันนี้ (เวลาไทย 00:00–24:00) เรียงตามเวลา — ด่านเดียวกับผังโต๊ะ */
export async function registerReservationsTodayAction(args: Target): Promise<{ ok: true; reservations: TableReservationRow[] } | RegisterRefusal> {
  const auth = await session("registerReservationsTodayAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args, ["pos.sale.create", "pos.sale.read"]);
    if ("ok" in s) return s;
    const sc = await registerScopeFor(s.ctx, s.actor, ["pos.sale.create", "pos.sale.read"], prisma);
    if (!sc.ok) return sc;
    const now = new Date();
    const d = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
    const dayStart = new Date(new Date(`${d}T00:00:00Z`).getTime() - 7 * 3_600_000);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const rest = await import("@/lib/modules/restaurant");
    // ช่วงของ facade = [now − late, now + maxHold] ⇒ ตั้งให้ครอบทั้งวันนี้ (กันโต๊ะ/สถานะการ์ดยังมาจาก registerTables ไม่ใช่ที่นี่)
    const fl = await rest.tableFloorForPos(prisma, {
      tenantId: sc.ctx.tenantId,
      unitId: sc.ctx.unitId,
      now,
      lateMinutes: Math.ceil((now.getTime() - dayStart.getTime()) / 60_000),
      maxHoldMinutes: Math.max(RESERVATION_HOLD_MAX_MINUTES, Math.ceil((dayEnd.getTime() - now.getTime()) / 60_000)),
      dayStart,
      dayEnd,
    });
    const reservations = fl.reservations
      .filter((r) => r.at.getTime() >= dayStart.getTime() && r.at.getTime() < dayEnd.getTime())
      .map((r) => ({ id: r.id, tableId: r.tableId, name: r.name, phone: r.phone, partySize: r.partySize, at: r.at.toISOString(), holdFromMinutes: r.holdFromMinutes }));
    return { ok: true, reservations };
  } catch (e) {
    return unexpected("registerReservationsTodayAction", e);
  }
}
