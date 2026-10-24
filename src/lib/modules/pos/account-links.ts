// account-links.ts — POS P4.3 ▸ CD-P43-2 · CD-P43-O10: ตัวตัดสินเดียวของ "ลิงก์ไปหน้าบัญชี" บนจอ POS ◂
//   docs     = เปิดหน้าพิมพ์เอกสารบัญชี /account/print ได้ (account.doc.view ตามตาราง IMPLIES ของบัญชี) — ลิงก์ "เอกสารบัญชี" ในลิ้นชักบิล (sales/page.tsx)
//   settings = เปิดหน้าตั้งค่าบัญชีได้ (account.settings.manage) — ลิงก์ "ตั้งค่าบัญชี" ของแท็บใบเสร็จ (receipt-settings-actions.ts → book.canOpenAccountSettings)
//   accountSystemId = สมุดบัญชีที่ผูก POS นี้ (ไม่มีสิทธิ์ใดเลย/ไม่ผูก = null)
// 🔴 กติกาสิทธิ์บัญชีผ่าน facade `@/lib/modules/account` (accountCanMember · posAccountSystemId) เท่านั้น — ไม่ import ไฟล์ข้างในของบัญชี (fitness F2)
// 🔴 แค่ "ซ่อน/แสดงลิงก์" — ด่านจริงยังอยู่ที่หน้าบัญชี (requireAccountPage) · ไม่ throw: ctx/actor ผิดรูป = ทุกธง false
import { accountCanMember, posAccountSystemId } from "@/lib/modules/account";
import type { RegisterActor } from "./register-shared";

export type PosAccountLinks = { accountSystemId: string | null; docs: boolean; settings: boolean };
const NONE: PosAccountLinks = { accountSystemId: null, docs: false, settings: false };
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

/** ธงลิงก์บัญชีของผู้ใช้คนนี้ที่ POS นี้ (สมุดที่ผูก + สิทธิ์ 2 ข้อ) */
export async function posAccountLinks(ctx: { tenantId: string; systemId: string }, actor: RegisterActor): Promise<PosAccountLinks> {
  if (!ctx || !isId(ctx.tenantId) || !isId(ctx.systemId)) return NONE;
  if (!actor || !isId(actor.userId) || (actor.role !== "OWNER" && actor.role !== "MANAGER" && actor.role !== "STAFF")) return NONE;
  const m = {
    role: actor.role,
    unitAccess: Array.isArray(actor.unitAccess) ? actor.unitAccess.filter((u): u is string => typeof u === "string") : [],
    permissions: actor.permissions && typeof actor.permissions === "object" && !Array.isArray(actor.permissions) ? (actor.permissions as Record<string, unknown>) : {},
  };
  const docs = accountCanMember(m, "account.doc.view");
  const settings = accountCanMember(m, "account.settings.manage");
  if (!docs && !settings) return NONE;
  const accountSystemId = await posAccountSystemId(ctx.tenantId, ctx.systemId);
  return accountSystemId ? { accountSystemId, docs, settings } : NONE;
}
