"use server";
// ─────────────────────────────────────────────────────────────
// trips/cost-actions.ts — server action ของจอ "ต้นทุนและกำไรของรอบ" (RUN TRIPS T1.7a1 §6)
// 🔴 ส่งออกเฉพาะ async function ตัวเดียว · requireUnit (หน่วยจาก slug ทับ input) → assertCan ด่านแรก → แปลงยอดข้อความด้วย costRowsFromForm → บริการ
// 🔴 สิทธิ์ต้นทุนแคบ (costAccessOf · trips.* ไม่พอ) ตรวจซ้ำในบริการ — assertCan ที่นี่เป็นด่านแรกเท่านั้น
// 🔴 ไม่รับเวลาจากผู้เรียก (บริการใช้นาฬิกาเซิร์ฟเวอร์) · ไม่มีสิทธิ์ ⇒ { ok: false, code: "FORBIDDEN" } ไม่ throw
// ─────────────────────────────────────────────────────────────
import { requireUnit } from "@/lib/core/context";
import { assertCan, ForbiddenError, type MembershipCtx } from "@/lib/core/rbac";
import { saveDepartureCosts } from "./costs";
import { costRowsFromForm } from "./report-core";

const NEEDS = ["trips.departure.view", "trips.cost.edit"] as const;
const FORBIDDEN = { ok: false as const, code: "FORBIDDEN" as const, message: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ — ติดต่อเจ้าของร้านหรือผู้จัดการเพื่อขอสิทธิ์" };
const FORMAT_MSG: Record<string, string> = {
  COST_AMOUNT_FORMAT: "พิมพ์ยอดเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง",
  COST_AMOUNT_INVALID: "ยอดต้นทุนต้องมากกว่าศูนย์และไม่เกินเพดานที่ระบบรับ",
  COST_ROWS_LIMIT: "ต้นทุนของรอบมีได้ไม่เกิน 30 รายการ",
  INVALID_INPUT: "ข้อมูลที่ส่งมายังไม่ครบหรือรูปแบบยังไม่ตรง — ตรวจแล้วลองอีกครั้ง",
};

/** บันทึกต้นทุนของรอบทั้งชุด — input: { departureId, expectedToken, rows: { id?, kind, amountText, note? }[] } */
export async function saveDepartureCostsAction(unitSlug: string, input: unknown) {
  const { auth, unit } = await requireUnit(String(unitSlug ?? ""));
  const p = auth.active.permissions;
  const m: MembershipCtx = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? auth.active.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: typeof p === "object" && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : {},
  };
  try {
    for (const action of NEEDS) assertCan(m, { module: "trips", action, unitId: unit.id });
  } catch (err) {
    if (err instanceof ForbiddenError) return FORBIDDEN;
    throw err;
  }
  const body = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const rows = costRowsFromForm(body.rows);
  if (!rows.ok) return { ok: false as const, code: rows.code, message: FORMAT_MSG[rows.code] ?? FORMAT_MSG.INVALID_INPUT };
  return saveDepartureCosts({ tenantId: auth.active.tenantId, actorUserId: auth.user.id }, { unitId: unit.id, departureId: body.departureId, expectedToken: body.expectedToken, rows: rows.rows.map((r) => (r.id === null ? { kind: r.kind, amountSatang: r.amountSatang, note: r.note } : r)) });
}
