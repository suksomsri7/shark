// member-routes.ts — ของใช้ร่วมของ `/api/mobile/member/*` (แอปพนักงาน จอสมาชิก · M3.11 · ภาพ 28)
//
// 🔴 route ทุกเส้นเรียก `requireMobile` + `assertCan` เอง (ด่านอยู่ในไฟล์ route ให้อ่านเห็นทันที) —
//    ไฟล์นี้มีแค่ "แปลง error → JSON ไทย" กับ "สร้าง actor/ctx ของพนักงานคนนั้น" ที่ 4 เส้นใช้ซ้ำกัน
// 🔴 รูปคำตอบ error = `{ error: <รหัสอังกฤษเดิมที่แอปอ่าน>, message: <ข้อความไทย> }` — แอป build เก่าอ่าน `error`
//    ต่อได้เหมือนเดิม · จอใหม่โชว์ `message` (ไทย ไม่โทษผู้ใช้ ไม่มีรายละเอียดภายใน)
import type { MembershipCtx } from "@/lib/core/rbac";
import { ForbiddenError } from "@/lib/core/rbac";
import { safeReason } from "@/lib/core/errors";
import {
  MemberConflictError,
  MemberForbiddenError,
  MemberInputError,
  MemberNotFoundError,
  staffMemberCtx,
  toMemberActor,
  type MemberActor,
} from "@/lib/modules/member";
import { StampForbiddenError, StampInputError, StampNotFoundError, StampStateError } from "@/lib/modules/stamp";
import type { MobileAuth, MobileGate } from "./auth";

const AUTH_TH: Record<string, string> = {
  unauthorized: "หมดเวลาเข้าสู่ระบบ — เข้าสู่ระบบในแอปใหม่อีกครั้ง",
  missing_tenant: "ยังไม่ได้เลือกกิจการ — เลือกกิจการในแอปก่อนแล้วลองใหม่",
  forbidden: "บัญชีนี้ไม่ได้อยู่ในกิจการนี้แล้ว — ติดต่อเจ้าของร้าน",
  suspended: "กิจการนี้ถูกระงับการใช้งานอยู่",
};

/** requireMobile ไม่ผ่าน → JSON (รหัสเดิม + ข้อความไทย) */
export function mobileMemberAuthError(g: Extract<MobileGate, { ok: false }>): Response {
  return Response.json({ error: g.error, message: AUTH_TH[g.error] ?? "เข้าสู่ระบบไม่สำเร็จ — ลองใหม่อีกครั้ง" }, { status: g.status });
}

/** error จาก service → สถานะ HTTP + JSON ไทย (มองไม่เห็น = 404 ไม่ใช่ 403 ตาม §6.4) */
export function mobileMemberError(e: unknown): Response {
  if (e instanceof ForbiddenError || e instanceof MemberForbiddenError || e instanceof StampForbiddenError) {
    const msg = e instanceof ForbiddenError ? "บัญชีของคุณยังไม่ได้รับสิทธิ์ทำรายการนี้ในระบบสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน" : safeReason(e, "บัญชีของคุณยังไม่ได้รับสิทธิ์ทำรายการนี้");
    return Response.json({ error: "forbidden", message: msg }, { status: 403 });
  }
  if (e instanceof MemberNotFoundError || e instanceof StampNotFoundError) {
    return Response.json({ error: "not_found", message: safeReason(e, "ไม่พบสมาชิกคนนี้ในสาขาที่คุณดูแล") }, { status: 404 });
  }
  if (e instanceof MemberConflictError || e instanceof StampStateError) {
    return Response.json({ error: "conflict", message: safeReason(e, "ทำรายการนี้ตอนนี้ไม่ได้ — ลองใหม่อีกครั้ง") }, { status: 409 });
  }
  if (e instanceof MemberInputError || e instanceof StampInputError) {
    return Response.json({ error: "invalid", message: safeReason(e, "ข้อมูลที่ส่งมาไม่ครบ — ลองใหม่อีกครั้ง") }, { status: 400 });
  }
  return Response.json({ error: "error", message: "ระบบสมาชิกขัดข้องชั่วคราว — ลองใหม่อีกครั้งในอีกสักครู่" }, { status: 500 });
}

/** actor ของพนักงานคนนั้น (สิทธิ์/สาขาจาก membership ที่ requireMobile ตรวจสด) + ระบบสมาชิกของร้าน */
export async function mobileMemberScope(g: MobileAuth): Promise<{
  mc: MembershipCtx;
  actor: MemberActor;
  ctx: Awaited<ReturnType<typeof staffMemberCtx>>;
}> {
  const actor = toMemberActor(g.user.id, g.membership);
  const mc: MembershipCtx = { role: g.membership.role, unitAccess: actor.unitAccess, permissions: actor.permissions };
  const ctx = await staffMemberCtx(g.ctx.tenantId, g.user.id);
  return { mc, actor, ctx };
}

/** อ่าน JSON ของ body แบบไม่พัง (body เพี้ยน = {}) */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = (await req.json()) as unknown;
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
