"use server";
// register-actions.ts — server action ของหน้าขายใหม่ (POS P1.3) · เปลือกบาง: session → ctx/actor → register.* → คืนผลตามเดิม
//
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function (สเปก G10 — export ชนิด/ค่าคงที่ = หน้าพังตอนรันทั้งที่ tsc ผ่าน)
//    ชนิดข้อมูลทั้งหมดอยู่ที่ register-shared.ts (client import ได้)
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} — Next ปิดข้อความของ error ที่โยนออกจาก action ใน production
//    ขัดข้องที่ไม่คาดคิด = {ok:false, code:"UNKNOWN"} (สเปก §3.1) · ⚠️ ที่ submit: UNKNOWN/INTERNAL/BUSY = "ยังไม่แน่ใจว่าบันทึกแล้ว"
//    จอต้องลองซ้ำด้วยคีย์+payload เดิม (สเปก §3.4 ข้อ 6) ไม่ใช่ออกคีย์ใหม่
// 🔴 ร้าน (tenantId) และผู้ขาย (role · unitAccess · permissions) มาจาก membership ของ SESSION (requireTenant) เท่านั้น —
//    ไม่เชื่อค่าจากคำขอ · systemId/unitId จากคำขอถูกตรวจซ้ำใน register.ts (ระบบ POS ของร้านนี้ · สาขาผูกระบบ · เข้าสาขาได้)
// 🔴 requireTenant: redirect ไปหน้า login/onboarding ของ Next ต้องผ่านออกไปได้ (unstable_rethrow) · ล้มแบบอื่น
//    (เช่น DB ขัดข้องตอนโหลด session) = {ok:false, code:"UNKNOWN"} ไม่ใช่ promise ที่ reject ดิบ (B1.1)

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { registerCatalog, registerScan, quoteRegisterCart, submitRegisterSale, registerStatus, registerProductOptions } from "./register";
import { discardHeldCart, holdRegisterCart, listHeldCarts, recallHeldCart } from "./held-cart";
import { registerFulfilReward, registerMemberBenefits, registerMemberLookup, registerQuickMember } from "./register-member"; // POS P1.12 ◂
import type {
  DiscardHeldCartResult,
  HoldRegisterCartResult,
  ListHeldCartsResult,
  RecallHeldCartResult,
  RegisterActor,
  RegisterCatalogInput,
  RegisterCatalogResult,
  RegisterCtx,
  RegisterFulfilRewardResult,
  RegisterMemberBenefitsResult,
  RegisterMemberLookupResult,
  RegisterProductOptionsResult,
  RegisterQuickMemberInput,
  RegisterQuickMemberResult,
  RegisterQuoteInput,
  RegisterQuoteResult,
  RegisterRefusal,
  RegisterScanResult,
  RegisterStatusResult,
  RegisterSubmitInput,
  RegisterSubmitResult,
} from "./register-shared";

type Session = Awaited<ReturnType<typeof requireTenant>>;
/** POS P1.9: deviceId (ไม่บังคับ) = รหัสเครื่องจาก localStorage — register.ts ตรวจรูปแบบ (ผิด = VALIDATION) */
type Target = { systemId: string; unitId: string; deviceId?: string };

function refusal(code: RegisterRefusal["code"], message: string): RegisterRefusal {
  return { ok: false, code, message };
}

/**
 * session → ขอบเขต + ผู้ขาย · ด่านเดียวกับหน้า (posRegisterView): เข้าสาขาไม่ได้ = NOT_FOUND (404 ไม่ใช่ 403 · มติ R8) ·
 * ไม่มี pos.sale.create ที่สาขานี้ = PERMISSION_DENIED — register.ts ตรวจซ้ำอีกชั้นพร้อมขอบเขตระบบ/สาขาจาก DB
 */
function sessionScope(auth: Session, args: unknown): { ctx: RegisterCtx; actor: RegisterActor } | RegisterRefusal {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const systemId = typeof a.systemId === "string" ? a.systemId : "";
  const unitId = typeof a.unitId === "string" ? a.unitId : "";
  if (!systemId || !unitId) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  const m = posMembership(auth.active);
  if (!canAccessUnit(m, unitId)) return refusal("NOT_FOUND", "ไม่พบสาขานี้");
  try {
    assertCan(m, { module: "pos", action: "pos.sale.create", unitId });
  } catch {
    return refusal("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ขาย — ขอให้เจ้าของร้านเพิ่มสิทธิ์");
  }
  const deviceId = typeof a.deviceId === "string" ? a.deviceId : undefined;
  return { ctx: { tenantId: auth.active.tenantId, systemId, unitId, ...(deviceId !== undefined ? { deviceId } : {}) }, actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } };
}

function unexpected(where: string, e: unknown): RegisterRefusal {
  console.error(`[pos/register-actions] ${where}`, e);
  return refusal("UNKNOWN", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
}

/** session ของคำขอ — redirect/notFound ของ Next ส่งต่อ (unstable_rethrow) · ล้มแบบอื่น = UNKNOWN (คืน ไม่ reject) */
async function session(where: string): Promise<Session | RegisterRefusal> {
  try {
    return await requireTenant();
  } catch (e) {
    unstable_rethrow(e);
    return unexpected(`${where} requireTenant`, e);
  }
}

/** กริด/หมวด/ค้นหา (แบ่งหน้า) */
export async function registerCatalogAction(args: Target & RegisterCatalogInput): Promise<RegisterCatalogResult> {
  const auth = await session("registerCatalogAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    const input: RegisterCatalogInput = {};
    if (args.q !== undefined) input.q = args.q;
    if (args.categoryId !== undefined) input.categoryId = args.categoryId;
    if (args.cursor !== undefined) input.cursor = args.cursor;
    if (args.limit !== undefined) input.limit = args.limit;
    return await registerCatalog(s.ctx, s.actor, input);
  } catch (e) {
    return unexpected("registerCatalogAction", e);
  }
}

/** ยอดบนจอจากราคาฝั่งเซิร์ฟเวอร์ — `cart` = ผลของ cartToQuoteInput (register-shared) */
export async function quoteRegisterCartAction(args: Target & { cart: RegisterQuoteInput }): Promise<RegisterQuoteResult> {
  const auth = await session("quoteRegisterCartAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    return await quoteRegisterCart(s.ctx, s.actor, args.cart);
  } catch (e) {
    return unexpected("quoteRegisterCartAction", e);
  }
}

/** ส่งบิล — `sale` = ผลของ cartToSubmitInput (เก็บไว้ส่งตัวเดิมทุกครั้งที่ลองซ้ำ) */
export async function submitRegisterSaleAction(args: Target & { sale: RegisterSubmitInput }): Promise<RegisterSubmitResult> {
  const auth = await session("submitRegisterSaleAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    const r = await submitRegisterSale(s.ctx, s.actor, args.sale);
    if (r.ok) {
      // ประวัติบิล/ภาพรวมระบบเห็นบิลใหม่ — ไม่ revalidate หน้าขายเอง (สถานะตะกร้าอยู่ฝั่ง client)
      // บิลบันทึกแล้ว: revalidate ล้มต้องไม่ทำให้คำตอบกลายเป็น "ไม่แน่ใจ"
      try {
        revalidatePath(`/app/sys/${s.ctx.systemId}/pos/sales`);
        revalidatePath(`/app/sys/${s.ctx.systemId}`);
      } catch (e) {
        console.error("[pos/register-actions] revalidatePath", e);
      }
    }
    return r;
  } catch (e) {
    return unexpected("submitRegisterSaleAction", e);
  }
}

/** สแกนบาร์โค้ด / Enter บนรหัสตรงตัว (Q24 · P1.4 ต่อยอด) → one · choose · none */
export async function registerScanAction(args: Target & { barcode: string }): Promise<RegisterScanResult> {
  const auth = await session("registerScanAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    return await registerScan(s.ctx, s.actor, { barcode: typeof args?.barcode === "string" ? args.barcode : "" });
  } catch (e) {
    return unexpected("registerScanAction", e);
  }
}

/** POS P1.2 R7 — ตัวเลือก/ตัวแปรของสินค้า (ป๊อปโอเวอร์ภาพ 01) · ปฏิเสธเป็นข้อมูล ไม่โยน */
export async function registerProductOptionsAction(args: Target & { productId: string }): Promise<RegisterProductOptionsResult> {
  const auth = await session("registerProductOptionsAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    return await registerProductOptions(s.ctx, s.actor, { productId: typeof args?.productId === "string" ? args.productId : "" });
  } catch (e) {
    return unexpected("registerProductOptionsAction", e);
  }
}

/** แถบสถานะ (สาขา · ผู้ขาย · รอตัดสต็อก) */
export async function registerStatusAction(args: Target): Promise<RegisterStatusResult> {
  const auth = await session("registerStatusAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    return await registerStatus(s.ctx, s.actor);
  } catch (e) {
    return unexpected("registerStatusAction", e);
  }
}

// ═══════ POS P1.5 — พักบิล / เรียกคืน (held-cart.ts) · ปฏิเสธคืนเป็นข้อมูล ไม่ throw ═══════

/** พักตะกร้าปัจจุบัน — `cart` = ผลของ cartToQuoteInput (ไม่มีคีย์บิล) · label ไม่บังคับ (≤ 60 ตัวอักษร) */
export async function holdRegisterCartAction(args: Target & { cart: RegisterQuoteInput; label?: string | null; staffToken?: string | null }): Promise<HoldRegisterCartResult> {
  const auth = await session("holdRegisterCartAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    // POS P1.15 ▸ R3: staffToken = ผู้ขายบนเครื่อง (held-cart ตรวจ · ผิด = STAFF_TOKEN_INVALID) ◂
    return await holdRegisterCart(s.ctx, s.actor, { cart: args.cart, label: args.label ?? null, ...(typeof args?.staffToken === "string" ? { staffToken: args.staffToken } : {}) });
  } catch (e) {
    return unexpected("holdRegisterCartAction", e);
  }
}

/** บิลที่พักของสาขานี้ (ใหม่สุดก่อน · ทิ้งบิลหมดอายุให้ด้วย) */
export async function listHeldCartsAction(args: Target): Promise<ListHeldCartsResult> {
  const auth = await session("listHeldCartsAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    return await listHeldCarts(s.ctx, s.actor);
  } catch (e) {
    return unexpected("listHeldCartsAction", e);
  }
}

/** เรียกคืน (ผู้ชนะคนเดียว) — ได้ตะกร้า + quote ราคาปัจจุบัน + notices · จอต้อง resetBill() ก่อนวางตะกร้า (คีย์บิลใหม่) */
export async function recallHeldCartAction(args: Target & { id: string; staffToken?: string | null }): Promise<RecallHeldCartResult> {
  const auth = await session("recallHeldCartAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    return await recallHeldCart(s.ctx, s.actor, { id: typeof args?.id === "string" ? args.id : "", ...(typeof args?.staffToken === "string" ? { staffToken: args.staffToken } : {}) });
  } catch (e) {
    return unexpected("recallHeldCartAction", e);
  }
}

/** ทิ้งบิลที่พัก (สิทธิ์เดียวกับล้างบิล · บันทึก audit) */
export async function discardHeldCartAction(args: Target & { id: string }): Promise<DiscardHeldCartResult> {
  const auth = await session("discardHeldCartAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    return await discardHeldCart(s.ctx, s.actor, { id: typeof args?.id === "string" ? args.id : "" });
  } catch (e) {
    return unexpected("discardHeldCartAction", e);
  }
}

// ═══════ POS P1.12 — สมาชิกที่ตะกร้า (register-member.ts) · ทุก action ต้องมี pos.sale.create ที่สาขา (sessionScope + register-member ตรวจซ้ำ) ═══════

/** ค้นสมาชิก (เบอร์ ≥ 3 หลัก · ชื่อ ≥ 2 ตัว · รหัสสมาชิก · SHARK-MC:<token>) — ≤ 8 แถว · เบอร์ปิดบัง */
export async function registerMemberLookupAction(args: Target & { q: string }): Promise<RegisterMemberLookupResult> {
  const auth = await session("registerMemberLookupAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    return await registerMemberLookup(s.ctx, s.actor, { q: typeof args?.q === "string" ? args.q : "" });
  } catch (e) {
    return unexpected("registerMemberLookupAction", e);
  }
}

/** สมัครสมาชิกด่วนแล้วผูกกับบิล — created:false = มีสมาชิกเบอร์นี้แล้ว (ผูกคนเดิม) · idempotencyKey เดิม = คนเดิม */
export async function registerQuickMemberAction(args: Target & { input: RegisterQuickMemberInput }): Promise<RegisterQuickMemberResult> {
  const auth = await session("registerQuickMemberAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    return await registerQuickMember(s.ctx, s.actor, args?.input);
  } catch (e) {
    return unexpected("registerQuickMemberAction", e);
  }
}

/** สิทธิ์ของสมาชิกกับตะกร้านี้ (จอชำระ) — อ่านอย่างเดียว · `cart` = ผลของ cartToQuoteInput */
export async function registerMemberBenefitsAction(args: Target & { memberId: string; cart: RegisterQuoteInput }): Promise<RegisterMemberBenefitsResult> {
  const auth = await session("registerMemberBenefitsAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    return await registerMemberBenefits(s.ctx, s.actor, { memberId: typeof args?.memberId === "string" ? args.memberId : "", cart: args?.cart });
  } catch (e) {
    return unexpected("registerMemberBenefitsAction", e);
  }
}

/** ส่งมอบของรางวัลที่สมาชิกแลกไว้ (ไม่ใช่บรรทัดบิล) — ส่งซ้ำ = ok */
export async function registerFulfilRewardAction(args: Target & { memberId: string; redemptionId: string }): Promise<RegisterFulfilRewardResult> {
  const auth = await session("registerFulfilRewardAction");
  if ("ok" in auth) return auth;
  try {
    const s = sessionScope(auth, args);
    if ("ok" in s) return s;
    return await registerFulfilReward(s.ctx, s.actor, {
      memberId: typeof args?.memberId === "string" ? args.memberId : "",
      redemptionId: typeof args?.redemptionId === "string" ? args.redemptionId : "",
    });
  } catch (e) {
    return unexpected("registerFulfilRewardAction", e);
  }
}
