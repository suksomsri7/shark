// ops/portal-staff.ts — ฝั่ง "ร้าน" ของพอร์ทัลลูกค้าบริษัท ผ่าน REST (ใบ C3.8) — ใครเข้าพอร์ทัลได้ · เชิญ · ถอนสิทธิ์
//
//   portal.access.list  GET  /companies/{id}/portal-access    crm.portal.manage  read
//   portal.invite       POST /companies/{id}/portal-invites   crm.portal.manage  write
//   portal.revoke       POST /portal-access/{id}/revoke       crm.portal.manage  danger
//
// 🔴 path ฝั่งร้านห้ามขึ้นต้น `/portal` (มติผู้คุมงาน C3.6–C3.9 ข้อ 1): dispatch ส่ง `path[0] === "portal"` ไปเลนลูกค้า (Bearer cp_…)
//    ⇒ op ของร้านอยู่ใต้ `/companies/{id}/…` และ `/portal-access/{id}/…` (คนละ segment กับ `portal`)
// 🔴 ไม่มี engine ที่สอง: บริการ `crm/portal.ts` (C3.5) ตัวเดียว — การมองเห็นบริษัท (visibleWhere + ตัวกรองคีย์) · ระบบที่เปิดพอร์ทัล ·
//    ผู้ติดต่อต้องอยู่ในบริษัท · audit `crm.portal.invite/revoke` อยู่ในบริการ · ถอนสิทธิ์ = session ทุกใบตายที่คำขอถัดไป
// AUDIT-CLASS X10: `inviteUrl` (ลิงก์ใช้ครั้งเดียวที่มี token ดิบ) คืน **ครั้งเดียว** — ตอบซ้ำด้วย Idempotency-Key เดิม = null (replaySecrets)
import { z } from "zod";
import * as portal from "../../portal";
import { PORTAL_ROLES } from "../../portal-shared";
import { crmActorOf, crmCtxOf } from "../actor";
import { defineCrmOp, type ApiOp } from "../op";
import { idStr, reason } from "../schema";

const accessList = defineCrmOp({
  id: "portal.access.list",
  method: "GET",
  path: "/companies/{id}/portal-access",
  kind: "read",
  action: "crm.portal.manage",
  summary:
    "Who can sign in to the customer portal of one company: each contact's portal role, sign-in methods, invite/accept/last-login times and status " +
    "(ACTIVE, INVITED, EXPIRED, REVOKED), plus whether the shop's portal is switched on. No tokens or hashes.",
  label: "สิทธิ์พอร์ทัลของบริษัท",
  input: z.object({}).strict(),
  test: "C3.8-S1.1",
  async handler({ actor, params }) {
    return portal.listAccess(crmCtxOf(actor), crmActorOf(actor), { companyId: params.id ?? "" });
  },
});

const invite = defineCrmOp({
  id: "portal.invite",
  method: "POST",
  path: "/companies/{id}/portal-invites",
  kind: "write",
  action: "crm.portal.manage",
  summary:
    "Invite one contact of the company to the customer portal (role VIEW, PAY, APPROVE or ADMIN; sign-in EMAIL_OTP and/or LINE). A one-time link valid 7 days is " +
    "e-mailed to the contact and returned once as inviteUrl (a replay with the same Idempotency-Key returns inviteUrl: null). Inviting again renews the link.",
  label: "เชิญเข้าพอร์ทัลลูกค้า",
  input: z
    .object({
      contactId: idStr,
      role: z.enum(PORTAL_ROLES).optional(),
      loginMethods: z.array(z.enum(["EMAIL_OTP", "LINE"])).min(1).max(2).optional(),
    })
    .strict(),
  replaySecrets: ["inviteUrl"],
  test: "C3.8-S1.1",
  async handler({ actor, params, input }) {
    return portal.invite(crmCtxOf(actor), crmActorOf(actor), {
      companyId: params.id ?? "",
      contactId: input.contactId,
      role: input.role ?? null,
      loginMethods: input.loginMethods ?? null,
    });
  },
});

const revoke = defineCrmOp({
  id: "portal.revoke",
  method: "POST",
  path: "/portal-access/{id}/revoke",
  kind: "danger",
  action: "crm.portal.manage",
  summary: "Revoke one portal access: every session of it ends at its next request and the invite link stops working. Needs confirm: true and a reason.",
  label: "ถอนสิทธิ์พอร์ทัล",
  input: z.object({ reason }).strict(),
  test: "C3.8-S2.4",
  async handler({ actor, params, input }) {
    const r = await portal.revoke(crmCtxOf(actor), crmActorOf(actor), { accessId: params.id ?? "", reason: input.reason });
    return { accessId: params.id ?? "", ...r };
  },
});

export const PORTAL_STAFF_OPS: ApiOp[] = [accessList, invite, revoke];
