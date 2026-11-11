"use server";
// SVC D.9 ▸ action จอ "ผูก LINE ผู้เช่า" — ร้าน/ผู้กระทำมาจาก session เท่านั้น · ด่าน requireUnit + หน่วย DORM
//   สิทธิ์ละเอียด (dorm.lease.manage ออกรหัส · dorm.settings.edit ตั้งเมนู) ตรวจสดใน facade platform/dorm-line ทุกครั้ง — ไม่ผ่าน ⇒ NOT_FOUND
//   🔴 รหัสผูกคืนครั้งเดียวให้หน้าพิมพ์/แสดง — ไม่ log · ไม่เก็บในหน้า
import { requireUnit } from "@/lib/core/context";
import { issueDormLinkCode, syncDormRichMenu } from "@/lib/platform/dorm-line";

const NO_ACCESS = { ok: false as const, code: "NOT_FOUND" as const, reason: "ไม่พบหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์ทำรายการ" };

async function gate(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") return null;
  return { ctx: { tenantId: auth.active.tenantId, actorUserId: auth.active.userId }, unitId: unit.id };
}

export async function issueDormLinkCodeAction(unitSlug: string, leaseId: string) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  const r = await issueDormLinkCode(g.ctx, { unitId: g.unitId, leaseId: typeof leaseId === "string" ? leaseId : "" });
  return r.ok ? { ok: true as const, code: r.code, deepLink: r.deepLink, expiresAt: r.expiresAt.toISOString(), qrSvgDataUrl: r.qrSvgDataUrl } : r;
}

export async function syncDormRichMenuAction(unitSlug: string) {
  const g = await gate(unitSlug);
  if (!g) return NO_ACCESS;
  return syncDormRichMenu(g.ctx, { unitId: g.unitId });
}
