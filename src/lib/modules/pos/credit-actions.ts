"use server";
// POS P3.6 ▸ credit-actions.ts — server action ของวางบิล (เครดิตเทอม) + แผ่นเลือกบริษัท/ดีลของหน้าขายใหม่ (R4 R10 R14 · มติ 1 2 · CD-4) ◂
//
// 🔴 "use server" export ได้เฉพาะ async function · ชนิด/ค่าคงที่อยู่ที่ credit-shared.ts / crm-link.ts
// 🔴 ไม่มีคำสั่ง throw ในไฟล์นี้ (กฎ P1.6-R2) — ด่านสิทธิ์ใช้ assertCan ห่อเป็น boolean · ล้มที่ไม่คาดคิด = {ok:false, code:"INTERNAL"}
// 🔴 ร้าน/ผู้กระทำมาจาก membership ของ SESSION (requireTenant) เท่านั้น · systemId/unitId จากคำขอถูกตรวจซ้ำในตัวบริการ (credit.ts · crm-link.ts)
// 🔴 ตัวเลขวงเงินออกเฉพาะผู้ถือ pos.credit.manage (ตัดสินใน credit.ts — CD-4)
import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, canAccessUnit, type MembershipCtx } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { listCreditAccounts, registerCreditStatus, saveCreditAccount } from "./credit";
import { registerCompanySearch, registerDealOptions, registerMemberCompanies, type CompanySearchResult, type DealOptionsResult } from "./crm-link";
import type { ListCreditAccountsResult, PosCreditRefusal, RegisterCreditStatusResult, SaveCreditAccountInput, SaveCreditAccountResult } from "./credit-shared";
import type { RegisterActor } from "./register-shared";

type Auth = Awaited<ReturnType<typeof requireTenant>>;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const refuse = (code: PosCreditRefusal["code"], message: string): PosCreditRefusal => ({ ok: false, code, message });
const INTERNAL = (): PosCreditRefusal => refuse("INTERNAL", "เกิดข้อผิดพลาด — ลองอีกครั้ง");

/** ด่านสิทธิ์ (assertCan · คืน boolean ไม่โยน — กฎ P1.6-R2) */
function can(m: MembershipCtx, action: string, unitId?: string): boolean {
  try {
    assertCan(m, { module: "pos", action, ...(unitId ? { unitId } : {}) });
    return true;
  } catch {
    return false;
  }
}
async function session(): Promise<Auth | null> {
  try {
    return await requireTenant();
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/credit-actions] requireTenant", e);
    return null;
  }
}
const actorOf = (auth: Auth): RegisterActor => {
  const m = posMembership(auth.active);
  return { userId: auth.user.id, role: m.role as RegisterActor["role"], unitAccess: m.unitAccess, permissions: m.permissions };
};
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** ตั้ง/แก้วงเงินและเทอมของบริษัท (ผู้ถือ pos.credit.manage) */
export async function saveCreditAccountAction(args: { systemId: string } & SaveCreditAccountInput): Promise<SaveCreditAccountResult> {
  const auth = await session();
  if (!auth) return INTERNAL();
  try {
    if (!can(posMembership(auth.active), "pos.credit.manage")) return refuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ตั้งวงเงินลูกค้าเครดิต — ขอสิทธิ์จากเจ้าของร้าน");
    if (!isRecord(args)) return refuse("VALIDATION", "ข้อมูลไม่ถูกต้อง");
    const input: SaveCreditAccountInput = { partyId: str(args.partyId), limitSatang: args.limitSatang, ...(args.termDays !== undefined ? { termDays: args.termDays } : {}), ...(args.active !== undefined ? { active: args.active } : {}), ...(args.note !== undefined ? { note: args.note } : {}) };
    return await saveCreditAccount({ tenantId: auth.active.tenantId, systemId: str(args.systemId) }, actorOf(auth), input);
  } catch (e) {
    console.error("[pos/credit-actions] saveCreditAccountAction", e);
    return INTERNAL();
  }
}

/** รายการบัญชีเครดิตของระบบ POS (ผู้ถือ pos.credit.manage) */
export async function listCreditAccountsAction(args: { systemId: string }): Promise<ListCreditAccountsResult> {
  const auth = await session();
  if (!auth) return INTERNAL();
  try {
    if (!can(posMembership(auth.active), "pos.credit.manage")) return refuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ดูวงเงินลูกค้าเครดิต");
    return await listCreditAccounts({ tenantId: auth.active.tenantId, systemId: str(isRecord(args) ? args.systemId : "") }, actorOf(auth));
  } catch (e) {
    console.error("[pos/credit-actions] listCreditAccountsAction", e);
    return INTERNAL();
  }
}

/** สถานะวางบิลของบริษัทที่หน้าขาย (ผู้ขายที่สาขา · ตัวเลขวงเงินเฉพาะผู้ถือ pos.credit.manage) */
export async function registerCreditStatusAction(args: { systemId: string; unitId: string; customerPartyId: string; amountSatang?: number }): Promise<RegisterCreditStatusResult> {
  const auth = await session();
  if (!auth) return INTERNAL();
  try {
    const unitId = str(isRecord(args) ? args.unitId : "");
    const m = posMembership(auth.active);
    if (!unitId || !canAccessUnit(m, unitId)) return refuse("NOT_FOUND", "ไม่พบสาขานี้");
    if (!can(m, "pos.sale.create", unitId)) return refuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ขายที่สาขานี้");
    return await registerCreditStatus(
      { tenantId: auth.active.tenantId, systemId: str(args.systemId), unitId },
      actorOf(auth),
      { customerPartyId: str(args.customerPartyId), ...(args.amountSatang !== undefined ? { amountSatang: args.amountSatang } : {}) },
    );
  } catch (e) {
    console.error("[pos/credit-actions] registerCreditStatusAction", e);
    return INTERNAL();
  }
}

type RegTarget = { systemId: string; unitId: string };
/** แผ่นเลือกบริษัท: ค้นชื่อ/เลขผู้เสียภาษี (ผู้ขายที่สาขา · ไม่ต้องมีคีย์ CRM) */
export async function registerCompanySearchAction(args: RegTarget & { q: string }): Promise<CompanySearchResult> {
  const auth = await session();
  if (!auth) return { ok: false, code: "INTERNAL", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  try {
    if (!isRecord(args) || !can(posMembership(auth.active), "pos.sale.create", str(args.unitId))) return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ขายที่สาขานี้" };
    return await registerCompanySearch({ tenantId: auth.active.tenantId, systemId: str(args.systemId), unitId: str(args.unitId) }, actorOf(auth), { q: str(args.q) });
  } catch (e) {
    console.error("[pos/credit-actions] registerCompanySearchAction", e);
    return { ok: false, code: "INTERNAL", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  }
}

/** แผ่นเลือกบริษัท: บริษัทของสมาชิกในบิล */
export async function registerMemberCompaniesAction(args: RegTarget & { memberId: string }): Promise<CompanySearchResult> {
  const auth = await session();
  if (!auth) return { ok: false, code: "INTERNAL", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  try {
    if (!isRecord(args) || !can(posMembership(auth.active), "pos.sale.create", str(args.unitId))) return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ขายที่สาขานี้" };
    return await registerMemberCompanies({ tenantId: auth.active.tenantId, systemId: str(args.systemId), unitId: str(args.unitId) }, actorOf(auth), { memberId: str(args.memberId) });
  } catch (e) {
    console.error("[pos/credit-actions] registerMemberCompaniesAction", e);
    return { ok: false, code: "INTERNAL", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  }
}

/** ตัวเลือกดีลของบิล (ว่างเมื่อไม่มีคีย์ crm.deal.update) */
export async function registerDealOptionsAction(args: RegTarget & { memberId?: string | null; customerPartyId?: string | null }): Promise<DealOptionsResult> {
  const auth = await session();
  if (!auth) return { ok: false, code: "INTERNAL", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  try {
    if (!isRecord(args) || !can(posMembership(auth.active), "pos.sale.create", str(args.unitId))) return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ขายที่สาขานี้" };
    return await registerDealOptions({ tenantId: auth.active.tenantId, systemId: str(args.systemId), unitId: str(args.unitId) }, actorOf(auth), {
      memberId: typeof args.memberId === "string" ? args.memberId : null,
      customerPartyId: typeof args.customerPartyId === "string" ? args.customerPartyId : null,
    });
  } catch (e) {
    console.error("[pos/credit-actions] registerDealOptionsAction", e);
    return { ok: false, code: "INTERNAL", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
  }
}
