// portal.ts — พอร์ทัลลูกค้าองค์กร `/b/<slug>/*` (ใบ C3.5 · มติ C7/C15 · RESOLUTIONS R-C.5 R-C.10 R-E.2 R-E.13 · พิมพ์เขียว §3.13 §5.9 · ภาพ 12)
//
// ผู้ใช้ 2 ฝั่ง:
//   • ฝั่งลูกค้า (ผู้ติดต่อของบริษัทลูกค้า) — ทุกฟังก์ชันรับ **token ดิบของ session เป็นอาร์กิวเมนต์แรก** แล้ว resolve ใหม่ทุกครั้ง
//     (`getPortalSession` อ่าน revokedAt/สถานะผู้ติดต่อ/สถานะสมาชิก/สวิตช์ร้าน ทุกคำขอ) ⇒ พนักงานถอนสิทธิ์ = ตายทันทีที่คำขอถัดไป
//   • ฝั่งพนักงาน — `invite · revoke · listAccess · decideRequest` รับ (ctx, actor) คีย์ `crm.portal.manage` · `eraseContact` (PDPA · C3.9)
// ตัวตน/OTP/ถังเพดาน/คุกกี้ = ของโมดูลสมาชิก (`member/customer-session.ts` ผ่าน facade) — ไฟล์นี้ **ไม่ออกรหัส OTP และไม่เขียนตาราง OTP เอง**
//
// AUDIT-CLASS X1: ทุกการอ่านของลูกค้าผูก (ร้าน · ระบบ CRM · บริษัทปัจจุบันของ session) — id ของบริษัทอื่น/ร้านอื่น = NOT_FOUND
//   ข้อความเดียว (`PORTAL_NOT_FOUND_MSG`) ไม่สะท้อนชื่อ/เลขเอกสารของใคร · เอกสารบัญชีอ่านผ่าน facade บัญชีด้วย Party ของบริษัทเท่านั้น
// AUDIT-CLASS X3: ตอบใบเสนอราคา = ด่าน `updateMany … status='AWAITING_ACCEPT'` ในโมดูลบัญชี (แก้บั๊กเดิม · C3.5) · รับคำเชิญ = claim
//   แบบมีเงื่อนไข (`inviteTokenHash = hash`) · event "ดูครั้งแรกต่อวัน" = คีย์กันซ้ำ + createMany skipDuplicates (ไม่ใช่อ่านแล้วค่อยเขียน)
// AUDIT-CLASS X4: ตัวรับผลอนุมัติ (`onApprovalDecided`) เขียนเฉพาะคำขอที่ยัง PENDING (ส่งซ้ำ/พร้อมกัน = ไม่มีผลเพิ่ม)
// AUDIT-CLASS X7: ขอ/ยืนยัน OTP ใช้ถังของสมาชิกชุดเดิม · รับคำเชิญนับทุกครั้งต่อ IP (`checkRateLimitDb` 10/15 นาที) ·
//   อีเมลที่ไม่รู้จักได้คำตอบรูปเดียวกัน (ส่งอีเมลนอกเส้นทางคำขอ) · คำเชิญหมดอายุ/ใช้แล้ว/ไม่มีจริง = ข้อความเดียวกัน
// AUDIT-CLASS X8: DTO ไม่มีข้อมูลดีล (showDeals=false) · ไม่มีอีเมล/เบอร์ของพนักงานหรือของคนนอกบริษัท · payload ของ event = id ล้วน ·
//   เหตุผลที่ปฏิเสธเก็บ "ฝั่งร้าน" (audit ของเอกสาร) เท่านั้น · ip เก็บเป็น HMAC · PDPA `eraseContact`
// AUDIT-CLASS X9: เชิญ/ถอน/ตัดสินคำขอ มีแถว audit (targetId = access/คำขอ) · ลูกค้าทำรายการ = audit actorType SYSTEM (ไม่มี User)
// AUDIT-CLASS X10: ไฟล์ = ลิงก์ `/api/files/<id>?exp&sig` ผูก `PortalSession.id` (ผู้ดูชนิด PORTAL) · ไม่มี `private://`/CDN/path ใน DTO ·
//   จ่ายเงินผ่าน `account.createPaymentRequestForDoc` (`/pay/<token>` เดิม) เท่านั้น — ไม่มีทางเงินใหม่
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { PortalDocRow } from "@/lib/modules/account";
import type { MemberActor } from "@/lib/modules/member";
// 🔴 ผิว session/OTP ของสมาชิกมาทาง facade ที่สอง `member/session-facade.ts` (re-export ของ customer-session ล้วน) —
//    facade หลักแบบค่าลาก wallet → giftcard → pos → outbox-consumers → บัญชี เข้ากราฟ ⇒ วงโหลดของบัญชี (TDZ) เมื่อ crm/api โหลดไฟล์นี้
import {
  CustomerAuthError,
  getPortalSession,
  hitPortalInviteLimit,
  mintPortalSession,
  appRequiresSecureCookies,
  portalIpHash,
  portalSecretReady,
  requestPortalOtp,
  requirePortalSession,
  revokePortalSession,
  sweepPortalSessions,
  verifyPortalOtp,
  type PortalSessionInfo,
  type PortalSessionToken,
} from "@/lib/modules/member/session-facade";
import { emitOutboxMany } from "@/lib/core/outbox";
import { privateFileUrl, uploadFile, normalizeUploadType, type UploadDeps } from "@/lib/storage/service";
import { prisma } from "./db";
import { crmCan, crmForbiddenMessage } from "./access";
import * as companies from "./companies";
import { bindPortalLineUserIdInTx } from "./contacts";
import { thaiDayStartMs } from "./activities-shared";
import { formatThaiDateTimeFull } from "@/lib/ui/date"; // CRM C5.5-fix7 ▸ RV-3 ◂
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { ciEquals } from "@/lib/core/ci-equals"; // CRM C5.5-fix2 ◂
import { logOps } from "@/lib/core/ops";
import {
  PORTAL_APPROVAL_ENTITY,
  PORTAL_DOC_STATUS_LABEL,
  PORTAL_DOC_TYPE_LABEL,
  PORTAL_INVITE_FAIL_MSG,
  PORTAL_LINE_NONCE_TTL_SEC,
  PORTAL_NOT_FOUND_MSG,
  PORTAL_REQUEST_KIND_LABEL,
  PortalError,
  isPortalRole,
  parsePortalSettings,
  portalCanChangeData,
  portalCanPay,
  portalCanRespond,
  portalCardSourceKey,
  portalLive,
  portalPath,
  portalProgressOf,
  portalProgressOfStatus,
  portalRequestRoute,
  portalViewDay,
  quotationExpired,
  type PortalActivityItem,
  type PortalCompanyRef,
  type PortalContactDto,
  type PortalDocumentItem,
  type PortalFileDto,
  type PortalHomeDto,
  type PortalInvoiceDto,
  type PortalLoginMethod,
  type PortalQuotationDto,
  type PortalReceiptDto,
  type PortalRecordDto,
  type PortalRequestDto,
  type PortalRequestKind,
  type PortalSettings,
} from "./portal-shared";
import { CRM_HARD_CAPS } from "./limits-shared"; // CRM C3.9 ▸ เพดานตายตัวของโค้ดอยู่ที่เดียว ◂

// ส่งต่อผิว session ให้ผู้เรียกของ CRM ใช้ได้จากที่เดียว (ตัวจริงอยู่ที่ member/customer-session.ts — R-C.5)
export {
  PORTAL_TOKEN_PREFIX,
  getPortalSession,
  isPortalToken,
  portalCookieName,
  portalTokenFromCookies,
  revokeAllPortalSessions,
} from "@/lib/modules/member/session-facade";
// 🔴 มติผู้คุมงานรอบ 4: `mintPortalSession` **ไม่อยู่** ใน namespace สาธารณะ `crm.portal` (ออก session ได้เฉพาะทางเข้าที่ตรวจตัวตนแล้ว
//    ในไฟล์นี้) — ตัวช่วยของสคริปต์ถ่ายภาพ/QC อยู่ที่ `./portal-session.ts` ไฟล์เดียว
export type { PortalSessionInfo, PortalSessionToken } from "@/lib/modules/member/session-facade";
export { PortalError, PORTAL_BASE_PATH, portalPath } from "./portal-shared";

const accountFacade = () => import("@/lib/modules/account");
// ตัวออกแบบฟิลด์ (engine ของสมาชิก) — โหลดตอนใช้ (facade สมาชิกแบบค่าที่หัวไฟล์ = วงโหลดของบัญชี เมื่อ crm/api โหลดไฟล์นี้)
const memberFacade = () => import("@/lib/modules/member");
const approvalFacade = () => import("@/lib/modules/approval");
const kanbanLinks = () => import("@/lib/modules/kanban/links");

const INVITE_TTL_MS = 7 * 86_400_000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const nf = () => new PortalError("NOT_FOUND", PORTAL_NOT_FOUND_MSG);
const unauth = () => new PortalError("UNAUTHORIZED", "เซสชันพอร์ทัลหมดอายุหรือถูกยกเลิกแล้ว — เข้าสู่ระบบอีกครั้ง");
type Meta = { ip?: string | null; userAgent?: string | null };

// ═══════════════════════════════════════════════════════════════════════════════════
// ร้าน (slug → ระบบ CRM ที่เปิดพอร์ทัล)
// ═══════════════════════════════════════════════════════════════════════════════════

export type PortalShop = { tenantId: string; systemId: string; name: string; slug: string };

/**
 * ร้านของ slug นี้ที่ "เปิดพอร์ทัลจริง" = ระบบ CRM แรก (เก่าสุด) ที่ uiVersion 2 และ `portal.enabled` — ไม่มี = null
 * (layout `/b/<slug>` ตอบ 404 · R-E.14 ร้านรุ่นเดิม/ร้านที่ปิดพอร์ทัลไม่มีหน้านี้เลย)
 */
export async function portalShopBySlug(slug: string): Promise<PortalShop | null> {
  const s = str(slug);
  if (!s) return null;
  // มติผู้คุมงาน C3.5: กุญแจ (`SESSION_SECRET` ≥ 32) ไม่พร้อม = ไม่เปิดพอร์ทัลเลย (ipHash/ลายเซ็นไฟล์พึ่งกุญแจนี้) — แจ้ง ops (WARN · throttle ของ logOps)
  if (!portalSecretReady()) {
    await logOps("WARN", "crm.portal", "พอร์ทัลลูกค้าปิดอยู่: ยังไม่ได้ตั้ง SESSION_SECRET (อย่างน้อย 32 ตัวอักษร) — ตั้งค่าแล้วรีสตาร์ต").catch(() => undefined);
    return null;
  }
  const t = await prisma.tenant.findUnique({ where: { slug: s }, select: { id: true, name: true, slug: true } });
  if (!t) return null;
  const systems = await prisma.appSystem.findMany({ where: { tenantId: t.id, type: "CRM" }, select: { id: true, settings: true }, orderBy: { createdAt: "asc" } });
  const live = systems.find((x) => portalLive(x.settings));
  return live ? { tenantId: t.id, systemId: live.id, name: t.name, slug: t.slug } : null;
}

async function shopOfTenant(tenantId: string): Promise<PortalShop | null> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  return t ? portalShopBySlug(t.slug) : null;
}

async function settingsOf(tenantId: string, systemId: string): Promise<PortalSettings> {
  const row = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { settings: true } });
  return parsePortalSettings(row?.settings ?? null);
}

// ═══════════════════════════════════════════════════════════════════════════════════
// ตัวตน — รับคำเชิญ · OTP · LINE · สลับบริษัท · ออกจากระบบ
// ═══════════════════════════════════════════════════════════════════════════════════

const normPhone = (v: unknown) => str(v).replace(/[^\d+]/g, "");
const normEmail = (v: unknown) => str(v).toLowerCase();

async function auditSystem(
  db: Pick<Prisma.TransactionClient, "auditLog">,
  tenantId: string,
  action: string,
  targetType: string,
  targetId: string,
  after: Record<string, unknown>,
): Promise<void> {
  await db.auditLog.create({ data: { tenantId, actorType: "SYSTEM", actorId: null, action, targetType, targetId, after: after as never } });
}

/**
 * รับคำเชิญ (ลิงก์ใช้ครั้งเดียว · 7 วัน) → session พอร์ทัล
 * ลำดับ: นับถังต่อ IP ทุกครั้ง (X7.4) → ร้านต้องเปิดพอร์ทัล → หา access จาก hash → สิทธิ์ต้องใช้ได้ → claim แบบมีเงื่อนไข → ออก session
 * หมดอายุ/ใช้แล้ว/ไม่มีจริง/ร้านปิด = ข้อความเดียว (X7.3) · ยิงพร้อมกัน 12 ทาง = ผ่าน 1 (X3.3)
 */
export async function acceptInvite(slug: string, input: { token: string }, meta: Meta = {}): Promise<PortalSessionToken> {
  const shop = await portalShopBySlug(slug);
  if (!shop) throw new CustomerAuthError(PORTAL_INVITE_FAIL_MSG);
  await hitPortalInviteLimit(shop.tenantId, meta?.ip);
  const token = str(input?.token);
  if (token.length < 22 || token.length > 200) throw new CustomerAuthError(PORTAL_INVITE_FAIL_MSG);
  const hash = sha(token);
  const now = new Date();
  const access = await prisma.crmPortalAccess.findUnique({ where: { inviteTokenHash: hash }, select: { id: true, tenantId: true, systemId: true, inviteExpiresAt: true, revokedAt: true } });
  if (!access || access.tenantId !== shop.tenantId || access.systemId !== shop.systemId || access.revokedAt || !access.inviteExpiresAt || access.inviteExpiresAt <= now) {
    throw new CustomerAuthError(PORTAL_INVITE_FAIL_MSG);
  }
  const claimed = await prisma.$transaction(async (tx) => {
    const r = await tx.crmPortalAccess.updateMany({
      where: { id: access.id, inviteTokenHash: hash, revokedAt: null, inviteExpiresAt: { gt: now } },
      data: { inviteTokenHash: null, acceptedAt: now },
    });
    if (r.count !== 1) return false;
    await auditSystem(tx, shop.tenantId, "crm.portal.invite.accept", "CrmPortalAccess", access.id, { accessId: access.id });
    return true;
  });
  if (!claimed) throw new CustomerAuthError(PORTAL_INVITE_FAIL_MSG);
  try {
    return await mintPortalSession(access.id, meta);
  } catch {
    throw new CustomerAuthError(PORTAL_INVITE_FAIL_MSG);
  }
}

/** access ที่ใช้เข้าด้วยวิธี `method` ได้ของผู้ติดต่อ (ในระบบ CRM ของร้าน) — เรียงเข้าล่าสุดก่อน · บริษัทหลักก่อน */
async function accessesOfContacts(tenantId: string, systemId: string, contactIds: string[], method: PortalLoginMethod): Promise<string[]> {
  if (contactIds.length === 0) return [];
  const now = new Date();
  const rows = await prisma.crmPortalAccess.findMany({
    where: {
      tenantId, systemId, contactId: { in: contactIds }, revokedAt: null,
      AND: [
        { OR: [{ loginMethods: { has: method } }, { loginMethods: { isEmpty: true } }] },
        // มติผู้คุมงาน S6: คนที่ยังไม่รับคำเชิญ เข้าด้วย OTP/LINE ได้เฉพาะขณะคำเชิญยังไม่หมดอายุ (หมดแล้ว = คำตอบเดียวกับไม่รู้จัก)
        { OR: [{ acceptedAt: { not: null } }, { inviteExpiresAt: { gt: now } }] },
      ],
    },
    select: { id: true, companyId: true, contactId: true, lastLoginAt: true, acceptedAt: true, invitedAt: true },
    take: 50,
  });
  // CRM C5.4-B ▸ L1-M2: เฉพาะบริษัทที่ผู้ติดต่อยังอยู่ (ลิงก์ endedAt null) — ข้อมูลเก่าที่ถอดออกก่อนแก้นี้ก็ไม่ได้ OTP/LINE
  const links = await prisma.crmCompanyContact.findMany({ where: { tenantId, contactId: { in: contactIds }, endedAt: null }, select: { companyId: true, contactId: true, isPrimary: true }, take: 200 });
  const live = new Set(links.map((r) => `${r.contactId}:${r.companyId}`));
  const primary = new Set(links.filter((r) => r.isPrimary).map((r) => `${r.contactId}:${r.companyId}`));
  const liveRows = rows.filter((r) => live.has(`${r.contactId}:${r.companyId}`));
  const t = (d: Date | null) => (d ? d.getTime() : 0);
  liveRows.sort((a, b) => t(b.lastLoginAt) - t(a.lastLoginAt) || Number(primary.has(`${b.contactId}:${b.companyId}`)) - Number(primary.has(`${a.contactId}:${a.companyId}`)) || t(b.acceptedAt) - t(a.acceptedAt) || t(a.invitedAt) - t(b.invitedAt));
  return liveRows.map((r) => r.id);
}

/** ผู้ติดต่อของปลายทางนี้ในระบบ (อีเมลไม่สนตัวพิมพ์ · เบอร์ตัวเลขล้วน) — ไม่รวมที่ถูกเก็บ/ถูกรวม */
async function contactsByTarget(tenantId: string, systemId: string, channel: "PHONE" | "EMAIL", target: string): Promise<string[]> {
  if (!target) return [];
  if (channel === "EMAIL") {
    // CRM C5.5-fix2 ▸ hunter 2a-6: `equals … insensitive` = ILIKE ⇒ `somchai_k@` เคย "เท่ากับ" `somchai.k@` (OTP ของกล่องที่หน้าตาคล้าย
    //   ออก session ของเหยื่อ) — ciEquals (escape wildcard) + ตรวจซ้ำว่าอีเมลของแถว = ปลายทางทุกตัวอักษร (ไม่พึ่ง SQL ที่ Prisma ปล่อย) ◂
    const rows = await prisma.crmContact.findMany({ where: { tenantId, systemId, archivedAt: null, mergedIntoId: null, email: ciEquals(target) }, select: { id: true, email: true }, take: 20 });
    return rows.filter((r) => normEmail(r.email) === normEmail(target)).map((r) => r.id);
  }
  const rows = await prisma.crmContact.findMany({ where: { tenantId, systemId, archivedAt: null, mergedIntoId: null, phone: { contains: target.slice(-9) } }, select: { id: true, phone: true }, take: 50 });
  return rows.filter((r) => normPhone(r.phone) === target).map((r) => r.id);
}

/**
 * ขอรหัส OTP เข้าพอร์ทัล — คำตอบรูปเดียวกับของสมาชิก `{otpId, expiresAt, maskedTo, devOtp?}` ทั้งคนที่มีสิทธิ์และไม่มี (X7.2)
 * ถัง `customer-otp:*` ชุดเดียวกับสมาชิก (X7.1) · อีเมลส่งนอกเส้นทางคำขอ
 */
export async function requestOtp(slug: string, input: { email?: string | null; phone?: string | null }, opts: { ip?: string | null } = {}) {
  const shop = await portalShopBySlug(slug);
  if (!shop) throw new CustomerAuthError("ไม่พบพอร์ทัลลูกค้าของร้านนี้ — ตรวจลิงก์ที่ร้านส่งให้อีกครั้ง");
  const settings = await settingsOf(shop.tenantId, shop.systemId);
  return requestPortalOtp({ id: shop.tenantId, name: shop.name }, { email: input?.email ?? null, phone: input?.phone ?? null }, {
    ip: opts?.ip ?? null,
    isKnown: async (channel, target) => {
      if (!settings.loginMethods.includes("EMAIL_OTP")) return false;
      const ids = await contactsByTarget(shop.tenantId, shop.systemId, channel, target);
      return (await accessesOfContacts(shop.tenantId, shop.systemId, ids, "EMAIL_OTP")).length > 0;
    },
  });
}

/** ยืนยัน OTP → session พอร์ทัลของ access ที่เหมาะที่สุด (เข้าล่าสุด/บริษัทหลัก) · ครั้งแรกของคนที่ถูกเชิญ = รับคำเชิญไปด้วย */
export async function verifyOtp(input: { otpId: string; code: string }, meta: Meta = {}): Promise<PortalSessionToken> {
  const t = await verifyPortalOtp(input, meta, async ({ tenantId, channel, target }) => {
    const shop = await shopOfTenant(tenantId);
    if (!shop) return null;
    const settings = await settingsOf(shop.tenantId, shop.systemId);
    if (!settings.loginMethods.includes("EMAIL_OTP")) return null;
    const ids = await contactsByTarget(shop.tenantId, shop.systemId, channel, target);
    return (await accessesOfContacts(shop.tenantId, shop.systemId, ids, "EMAIL_OTP"))[0] ?? null;
  });
  await prisma.crmPortalAccess.updateMany({ where: { id: t.portalAccessId, acceptedAt: null }, data: { acceptedAt: new Date(), inviteTokenHash: null } });
  return t;
}

/**
 * เข้าด้วย LINE — route `/b/<slug>/auth/line` ตรวจ id_token กับ LINE มาแล้ว ส่งตัวตนที่ตรวจแล้วเข้ามา
 * ต้องตรง: อีเมล LINE (ไม่สนตัวพิมพ์) หรือเบอร์ = ของผู้ติดต่อ · หรือ `lineUserId` = `CrmContact.lineUserId` · และ access ยอมรับ LINE
 * มีคำเชิญ + ไม่ตรง ⇒ คำขอ CONTACT_CHANGE `{reason:"LINE_IDENTITY"}` ให้พนักงานพิจารณา (ไม่ออก session · คำเชิญยังไม่ถูกใช้)
 */
export async function loginWithLine(
  slug: string,
  input: { lineUserId: string; email?: string | null; phone?: string | null; inviteToken?: string | null },
  meta: Meta = {},
): Promise<PortalSessionToken | { pendingApproval: true; requestId: string }> {
  const shop = await portalShopBySlug(slug);
  const lineUserId = str(input?.lineUserId);
  if (!shop || !lineUserId) throw new CustomerAuthError("เข้าสู่ระบบด้วย LINE ไม่สำเร็จ — ลองอีกครั้ง หรือเข้าด้วยอีเมลแทน");
  const settings = await settingsOf(shop.tenantId, shop.systemId);
  if (!settings.loginMethods.includes("LINE")) throw new CustomerAuthError("ร้านนี้ยังไม่เปิดให้เข้าพอร์ทัลด้วย LINE — ใช้อีเมลแทนได้");
  const email = normEmail(input?.email);
  const phone = normPhone(input?.phone);
  const matches = (c: { email: string | null; phone: string | null; lineUserId: string | null }) =>
    (!!email && normEmail(c.email) === email) || (!!phone && normPhone(c.phone) === phone) || (!!c.lineUserId && c.lineUserId === lineUserId);

  const inviteToken = str(input?.inviteToken);
  if (inviteToken) {
    await hitPortalInviteLimit(shop.tenantId, meta?.ip);
    const hash = sha(inviteToken);
    const now = new Date();
    const access = await prisma.crmPortalAccess.findUnique({
      where: { inviteTokenHash: hash },
      select: { id: true, tenantId: true, systemId: true, companyId: true, contactId: true, loginMethods: true, revokedAt: true, inviteExpiresAt: true, contact: { select: { email: true, phone: true, lineUserId: true } } },
    });
    if (!access || access.tenantId !== shop.tenantId || access.systemId !== shop.systemId || access.revokedAt || !access.inviteExpiresAt || access.inviteExpiresAt <= now) {
      throw new CustomerAuthError(PORTAL_INVITE_FAIL_MSG);
    }
    const allowsLine = access.loginMethods.length === 0 || access.loginMethods.includes("LINE");
    if (!allowsLine || !matches(access.contact)) {
      const existing = await prisma.crmPortalRequest.findFirst({
        where: { tenantId: shop.tenantId, systemId: shop.systemId, contactId: access.contactId, companyId: access.companyId, kind: "CONTACT_CHANGE", status: "PENDING", payload: { path: ["lineUserId"], equals: lineUserId } },
        select: { id: true },
      });
      if (existing) return { pendingApproval: true, requestId: existing.id };
      const created = await createRequestInternal(
        { tenantId: shop.tenantId, systemId: shop.systemId, companyId: access.companyId, contactId: access.contactId },
        "CONTACT_CHANGE",
        "ขอยืนยันตัวตนด้วยบัญชี LINE ที่ข้อมูลไม่ตรงกับที่ร้านมี",
        null,
        // `origin` = ธงฝั่งเซิร์ฟเวอร์ (ลูกค้าตั้งเองไม่ได้ — `cleanPayload` ทิ้งคีย์สงวน) ⇒ อนุมัติแล้วผูก LINE ให้ได้แบบมีด่าน
        { reason: "LINE_IDENTITY", lineUserId, origin: LINE_LOGIN_ORIGIN },
      );
      return { pendingApproval: true, requestId: created.id };
    }
    const claimed = await prisma.$transaction(async (tx) => {
      const r = await tx.crmPortalAccess.updateMany({ where: { id: access.id, inviteTokenHash: hash, revokedAt: null, inviteExpiresAt: { gt: now } }, data: { inviteTokenHash: null, acceptedAt: now } });
      if (r.count !== 1) return false;
      await bindPortalLineUserIdInTx(tx, { tenantId: shop.tenantId, systemId: shop.systemId, contactId: access.contactId, lineUserId });
      await auditSystem(tx, shop.tenantId, "crm.portal.invite.accept", "CrmPortalAccess", access.id, { accessId: access.id, method: "LINE" });
      return true;
    });
    if (!claimed) throw new CustomerAuthError(PORTAL_INVITE_FAIL_MSG);
    try {
      return await mintPortalSession(access.id, meta);
    } catch {
      throw new CustomerAuthError(PORTAL_INVITE_FAIL_MSG);
    }
  }

  // ไม่มีคำเชิญ: ผู้ติดต่อที่ตรงกับตัวตน LINE และมีสิทธิ์ที่ยอมรับ LINE
  // CRM C5.5-fix2 ▸ hunter 2a-6 (ทาง LINE): อีเมล LINE ที่หน้าตาคล้าย (`_`/`%`) ห้ามจับคู่ผู้ติดต่อคนอื่น — ciEquals + ตรวจซ้ำทุกแถว ◂
  const or: { lineUserId?: string; email?: ReturnType<typeof ciEquals> }[] = [{ lineUserId }];
  if (email) or.push({ email: ciEquals(email) });
  let ids = (await prisma.crmContact.findMany({ where: { tenantId: shop.tenantId, systemId: shop.systemId, archivedAt: null, mergedIntoId: null, OR: or }, select: { id: true, email: true, lineUserId: true }, take: 20 }))
    .filter((r) => r.lineUserId === lineUserId || (!!email && normEmail(r.email) === email))
    .map((r) => r.id);
  if (phone) ids = [...new Set([...ids, ...(await contactsByTarget(shop.tenantId, shop.systemId, "PHONE", phone))])];
  const accessId = (await accessesOfContacts(shop.tenantId, shop.systemId, ids, "LINE"))[0];
  if (!accessId) throw new CustomerAuthError("ยังไม่พบสิทธิ์พอร์ทัลที่ตรงกับบัญชี LINE นี้ — เปิดลิงก์เชิญจากร้าน หรือเข้าด้วยอีเมลแทน");
  let t: PortalSessionToken;
  try {
    t = await mintPortalSession(accessId, meta);
  } catch {
    throw new CustomerAuthError("สิทธิ์เข้าพอร์ทัลนี้ใช้ไม่ได้แล้ว — ติดต่อร้านเพื่อขอเปิดสิทธิ์ใหม่อีกครั้ง");
  }
  // มติผู้คุมงานรอบ 4 (SF2): เข้าด้วย LINE ครั้งแรกของคนที่ถูกเชิญ = รับคำเชิญ (แบบเดียวกับ verifyOtp) — ไม่งั้นหลัง 7 วันเข้าไม่ได้อีก
  await prisma.crmPortalAccess.updateMany({ where: { id: t.portalAccessId, acceptedAt: null }, data: { acceptedAt: new Date(), inviteTokenHash: null } });
  return t;
}

/**
 * สลับไปบริษัทอื่นของผู้ติดต่อคนเดิม → session ใหม่ของ access บริษัทนั้น (ไม่มีสิทธิ์ในบริษัทนั้น = NOT_FOUND)
 * `revokeCurrent` (มติผู้คุมงานรอบ 3) = เพิกถอนใบเดิมในบริการเลย — หน้าเว็บ (ที่เปลี่ยนคุกกี้เป็นใบใหม่) ส่ง true เสมอ ·
 * ค่าเริ่มต้น false: สัญญาข้อสอบ C3.5-S1.5/S4.4 ถือทั้งสองใบพร้อมกัน (ดู wo-notes · รายงาน ORACLE-CONFLICT)
 */
export async function switchCompany(token: string, companyId: string, meta: Meta = {}, opts: { revokeCurrent?: boolean } = {}): Promise<PortalSessionToken> {
  const s = await session(token);
  // มติผู้คุมงานรอบ 4 (SF4) + รอบ 5: การสลับบริษัท = ออก session ใหม่ ⇒ นับก่อน mint ในถังของ "ผู้ติดต่อ"
  await portalWriteGate(s, "switch");
  const target = await prisma.crmPortalAccess.findFirst({
    where: { tenantId: s.tenantId, systemId: s.crmSystemId, contactId: s.crmContactId, companyId: str(companyId), revokedAt: null, ...usableAccessWhere() },
    select: { id: true },
  });
  if (!target) throw nf();
  let next: PortalSessionToken;
  try {
    // รีวิว R2b-1 (TOCTOU): `session(token)` ข้างบนตรวจก่อน mint — การเชิญซ้ำที่ฆ่า session ทุกใบของผู้ติดต่อ (READ COMMITTED) ไม่เห็น
    //   แถวที่ mint ทีหลัง ⇒ เครื่องที่หายสลับบริษัทหนีการเชิญซ้ำได้ · แก้: ในธุรกรรมของการ mint ล็อกผู้ติดต่อ (กุญแจเดียวกับ `invite`)
    //   แล้วตรวจ session ต้นทางซ้ำ — ลำดับล็อก: advisory ของผู้ติดต่อ → แถว session/สิทธิ์ (เหมือน `invite`) ⇒ ไม่มีวงล็อกตาย ◂
    next = await mintPortalSession(target.id, meta, {
      inTx: async (tx) => {
        await lockPortalContactInTx(tx, s.tenantId, s.crmContactId);
        const live = await tx.portalSession.findFirst({ where: { tokenHash: sha(str(token)), revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
        if (!live) throw nf();
      },
    });
  } catch {
    throw nf();
  }
  // มติผู้คุมงานรอบ 5: สลับเข้าสิทธิ์ที่ยังไม่รับคำเชิญ (คำเชิญยังไม่หมด) = รับคำเชิญ (แบบเดียวกับ OTP/LINE)
  await prisma.crmPortalAccess.updateMany({ where: { id: next.portalAccessId, acceptedAt: null }, data: { acceptedAt: new Date(), inviteTokenHash: null } });
  if (opts.revokeCurrent === true) await revokePortalSession(token);
  return next;
}

/**
 * งานกวาด session พอร์ทัล (ทะเบียน C0.5 `crm.portal.sessions.sweep` เรียกผ่าน facade) — ลบแถวที่หมดอายุ/ถูกเพิกถอนเกิน 30 วัน
 * ตัวลบจริงอยู่ที่ `member/customer-session.ts#sweepPortalSessions` (DELETE คำสั่งเดียว · ซ้อนกันได้ผลเดียว)
 */
export async function sweepSessions(now: Date = new Date(), opts: { tenantId?: string | null } = {}): Promise<{ deleted: number }> {
  return { deleted: await sweepPortalSessions(now, opts) };
}

/** ชั่วโมง (เวลาไทย) ของช่องงานกวาด session พอร์ทัล */
export const PORTAL_SWEEP_HOUR_TH = 3;
/** ช่องเวลาของงานกวาด = ชั่วโมง 03:xx ตามเวลาไทย (บริสุทธิ์ — ทะเบียนงานรายชั่วโมงถามก่อนลงมือ) */
export function portalSweepSlot(now: Date): boolean {
  const ms = now.getTime();
  return Math.floor((ms - thaiDayStartMs(ms)) / 3600_000) === PORTAL_SWEEP_HOUR_TH;
}

/** ออกจากระบบ (ใบนี้ใบเดียว) */
export async function logout(token: string): Promise<{ ok: true }> {
  return revokePortalSession(token);
}

/** ด่านของหน้า `/b/<slug>/*` ที่ต้องล็อกอิน — ไม่มี session = ไปหน้าเข้าสู่ระบบ (ที่อยู่จาก PORTAL_BASE_PATH ที่เดียว) */
export async function requirePortal(slug: string): Promise<{ slug: string; tenantId: string; tenantName: string; token: string; session: PortalSessionInfo }> {
  const r = await requirePortalSession(slug, portalPath(slug, "login"));
  // มติผู้คุมงานรอบ 3: ผูกทั้งร้าน **และ** ระบบ CRM ที่เปิดพอร์ทัลของ slug นี้ (ร้านที่มี CRM หลายระบบ = session ของระบบอื่นใช้ไม่ได้)
  const shop = await portalShopBySlug(slug);
  if (!shop || shop.tenantId !== r.session.tenantId || shop.systemId !== r.session.crmSystemId) {
    const { redirect } = await import("next/navigation");
    redirect(portalPath(slug, "login"));
  }
  return r;
}

// ═══════════════════════════════════════════════════════════════════════════════════
// ฝั่งลูกค้า — อ่าน/เขียนภายในบริษัทปัจจุบันของ session เท่านั้น
// ═══════════════════════════════════════════════════════════════════════════════════

type Scope = PortalSessionInfo & { partyId: string; companyName: string; settings: PortalSettings };

async function session(token: string): Promise<PortalSessionInfo> {
  const s = await getPortalSession(str(token));
  if (!s) throw unauth();
  return s;
}

async function scope(token: string): Promise<Scope> {
  const s = await session(token);
  const [co, settings] = await Promise.all([
    // บริษัทของ session อ่านผ่านแถวสิทธิ์ (ไม่ query CrmCompany ตรง — ผู้อ่านบริษัทมีที่เดียวคือ companies.ts/where.ts · C1.3-S0.3)
    prisma.crmPortalAccess.findFirst({ where: { id: s.portalAccessId, tenantId: s.tenantId, systemId: s.crmSystemId, companyId: s.companyId }, select: { company: { select: { partyId: true, name: true } } } }).then((r) => r?.company ?? null),
    settingsOf(s.tenantId, s.crmSystemId),
  ]);
  if (!co) throw unauth();
  return { ...s, partyId: co.partyId, companyName: co.name, settings };
}

const OPEN_INVOICE = new Set(["AWAITING_PAYMENT", "PARTIAL"]);

/** ความล้มชั่วคราวที่ต้องให้คิว outbox ส่งใหม่ (ไม่ใช่ความผิดของข้อมูล) — ข้อความ id ล้วน ไม่มีข้อมูลลูกค้า */
export class PortalRetryableError extends Error {
  readonly code = "RETRYABLE" as const;
  readonly retryable = true as const;
  constructor(message: string) {
    super(message);
    this.name = "PortalRetryableError";
  }
}

/** มติผู้คุมงานรอบ 4 (SF1): สิทธิ์ที่ "ใช้ได้" = รับคำเชิญแล้ว หรือคำเชิญยังไม่หมดอายุ (กติกาเดียวกับ `portalAccessUsable`) — ใช้กรองทุกรายการ */
function usableAccessWhere(now: Date = new Date()): Prisma.CrmPortalAccessWhereInput {
  return { OR: [{ acceptedAt: { not: null } }, { inviteExpiresAt: { gt: now } }] };
}

/** ธงฝั่งเซิร์ฟเวอร์ของคำขอที่ `loginWithLine` สร้าง (ลูกค้าตั้งเองไม่ได้ — คีย์สงวนใน `cleanPayload`) */
const LINE_LOGIN_ORIGIN = "LINE_LOGIN";
/** เพดานการเขียนของลูกค้า (มติผู้คุมงาน S1) — ถังต่อสิทธิ์ ใช้ร่วมทั้งหน้าเว็บและ REST เพราะนับที่ชั้นบริการ */
const PORTAL_WRITE_LIMIT = { limit: CRM_HARD_CAPS.portalWritesPerMinute, windowMs: 60_000 }; // CRM C3.9 ▸ เพดานตายตัวอยู่ที่ limits-shared (ค่าเดิม 30/นาที) ◂
const PORTAL_SLIP_LIMIT = { limit: 10, windowMs: 60 * 60_000 };

/** AUDIT-CLASS X7: นับ 1 ครั้งในถังเขียนของสิทธิ์นี้ (`crm:portal:write:<tenant>:<access>` · สลิปมีถังของตัวเองเพิ่ม) — เกิน = RATE_LIMITED ไทย */
async function portalWriteGate(sc: { tenantId: string; portalAccessId: string; crmContactId?: string }, kind: "write" | "slip" | "switch" = "write"): Promise<void> {
  const spec = kind === "slip" ? PORTAL_SLIP_LIMIT : PORTAL_WRITE_LIMIT;
  // มติผู้คุมงานรอบ 5: ถังสลับบริษัทนับต่อ "ผู้ติดต่อ" (สลับไปมาหลายบริษัทไม่ได้ถังใหม่ทุกครั้ง) · ถังอื่นนับต่อสิทธิ์
  const owner = kind === "switch" ? sc.crmContactId ?? sc.portalAccessId : sc.portalAccessId;
  const r = await checkRateLimitDb(`crm:portal:${kind}:${sc.tenantId}:${owner}`, spec);
  if (!r.ok) {
    const mins = Math.max(1, Math.ceil((r.retryAfterSec ?? 60) / 60));
    throw new PortalError("RATE_LIMITED", kind === "slip" ? `แนบสลิปถี่เกินไป — รออีกประมาณ ${mins} นาทีแล้วลองใหม่อีกครั้ง` : `ทำรายการถี่เกินไป — รออีกประมาณ ${mins} นาทีแล้วลองใหม่อีกครั้ง`);
  }
}

/** ชนิดไฟล์จากไบต์หัวไฟล์ (ไม่เชื่อ content-type ที่ผู้ส่งบอก) — png · jpg · pdf เท่านั้น */
function sniffSlipMime(data: Uint8Array): "image/png" | "image/jpeg" | "application/pdf" | null {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 5 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46 && data[4] === 0x2d) return "application/pdf";
  return null;
}
type DocRow = PortalDocRow;

async function docs(sc: Scope, types: ("QUOTATION" | "INVOICE" | "RECEIPT" | "TAX_INVOICE")[], id?: string): Promise<DocRow[]> {
  const acc = await accountFacade();
  return acc.listPortalDocs(sc.tenantId, sc.partyId, { docTypes: types, id: id ?? null });
}

function quotationDto(d: DocRow, role: string, now = new Date()): PortalQuotationDto {
  return {
    id: d.id,
    docNo: d.docNo,
    status: d.status,
    statusLabel: d.status === "AWAITING_ACCEPT" && quotationExpired(d.validUntil, now) ? "หมดอายุ" : PORTAL_DOC_STATUS_LABEL[d.status] ?? d.status,
    issueDate: d.issueDate,
    validUntil: d.validUntil,
    grandTotalSatang: d.grandTotal,
    canRespond: d.status === "AWAITING_ACCEPT" && !quotationExpired(d.validUntil, now) && portalCanRespond(role),
  };
}

function invoiceDto(d: DocRow, role: string): PortalInvoiceDto {
  // CRM C5.4-C ▸ (cross-lane ACCOUNT) ยอดค้างหักใบลดหนี้ที่ยังมีผล — เดิมลูกค้าเห็นยอดใบลดหนี้เป็นหนี้ค้าง และลิงก์จ่ายขอยอดเต็ม ◂
  const outstanding = OPEN_INVOICE.has(d.status) ? Math.max(0, d.grandTotal - d.paidTotal - Math.max(0, d.creditNoteTotal ?? 0)) : 0;
  return {
    id: d.id,
    docNo: d.docNo,
    status: d.status,
    statusLabel: PORTAL_DOC_STATUS_LABEL[d.status] ?? d.status,
    issueDate: d.issueDate,
    dueDate: d.dueDate,
    grandTotalSatang: d.grandTotal,
    paidSatang: d.paidTotal,
    outstandingSatang: outstanding,
    canPay: outstanding > 0 && portalCanPay(role),
  };
}

/** event "ลูกค้าเปิดดูพอร์ทัล" — ครั้งแรกต่อ access ต่อวันไทย (คีย์กันซ้ำ + skipDuplicates ⇒ เปิดพร้อมกัน 12 แท็บ = 1 ใบ) · ล้มไม่ทำให้หน้าล้ม */
async function markViewed(s: PortalSessionInfo): Promise<void> {
  const day = portalViewDay();
  try {
    await emitOutboxMany(prisma, [
      {
        tenantId: s.tenantId,
        systemId: s.crmSystemId,
        type: "crm.portal.viewed",
        idempotencyKey: `crm.portal.viewed#${s.portalAccessId}#${day}`,
        payload: { companyId: s.companyId, contactId: s.crmContactId, accessId: s.portalAccessId, day },
      },
    ]);
  } catch {
    // ตัวนับการเปิดดูเป็นของแถม — ห้ามทำให้ลูกค้าเปิดหน้าไม่ได้
  }
}

/** บริษัทที่ผู้ติดต่อคนนี้เข้าได้ (ตัวสลับบริษัท) — id + ชื่อ · เรียกแยกจาก `home` (ชื่อบริษัทอื่นไม่อยู่ใน DTO ของหน้า/รายการ) */
export async function myCompanies(token: string): Promise<{ current: string; items: PortalCompanyRef[] }> {
  const s = await session(token);
  const rows = await prisma.crmPortalAccess.findMany({
    where: { tenantId: s.tenantId, systemId: s.crmSystemId, contactId: s.crmContactId, revokedAt: null, company: { archivedAt: null, mergedIntoId: null }, ...usableAccessWhere() },
    select: { companyId: true, acceptedAt: true, invitedAt: true, company: { select: { name: true } } },
    orderBy: { invitedAt: "asc" },
    take: 50,
  });
  // CRM C5.4-B ▸ hunter H6: บริษัทที่ออกแล้ว (ลิงก์จบ) หรือสิทธิ์รอบเก่า (ก่อนลิงก์รอบปัจจุบันเริ่ม) ไม่โผล่ในตัวสลับ — กติกาเดียวกับ portalAccessUsable
  const links = await prisma.crmCompanyContact.findMany({
    where: { tenantId: s.tenantId, contactId: s.crmContactId, endedAt: null, companyId: { in: rows.map((r) => r.companyId) } },
    select: { companyId: true, startedAt: true },
  });
  const since = new Map(links.map((l) => [l.companyId, l.startedAt ? l.startedAt.getTime() : 0]));
  const usable = rows.filter((r) => since.has(r.companyId) && Math.max(r.acceptedAt?.getTime() ?? 0, r.invitedAt?.getTime() ?? 0) >= (since.get(r.companyId) ?? 0));
  return { current: s.companyId, items: usable.map((r) => ({ id: r.companyId, name: r.company.name })) };
}

/** หน้าแรกของบริษัท: ค้างชำระ · ใบเสนอราคารอตอบ · กิจกรรมล่าสุด (+ จำนวนดีลเปิด เฉพาะร้านที่ตั้ง showDeals) */
export async function home(token: string): Promise<PortalHomeDto> {
  const sc = await scope(token);
  const [all, me, shop, companyIds, requests] = await Promise.all([
    docs(sc, ["QUOTATION", "INVOICE", "RECEIPT", "TAX_INVOICE"]),
    prisma.crmContact.findFirst({ where: { id: sc.crmContactId, tenantId: sc.tenantId }, select: { name: true } }),
    prisma.tenant.findUnique({ where: { id: sc.tenantId }, select: { name: true } }),
    prisma.crmPortalAccess.findMany({ where: { tenantId: sc.tenantId, systemId: sc.crmSystemId, contactId: sc.crmContactId, revokedAt: null, company: { archivedAt: null, mergedIntoId: null }, ...usableAccessWhere() }, select: { companyId: true }, take: 50 }),
    prisma.crmPortalRequest.findMany({ where: { tenantId: sc.tenantId, systemId: sc.crmSystemId, companyId: sc.companyId }, orderBy: { createdAt: "desc" }, take: 5, select: { kind: true, payload: true, createdAt: true } }),
  ]);
  const now = new Date();
  const quotes = all.filter((d) => d.docType === "QUOTATION").map((d) => quotationDto(d, sc.role, now));
  const invoices = all.filter((d) => d.docType === "INVOICE").map((d) => invoiceDto(d, sc.role));
  const open = invoices.filter((i) => i.outstandingSatang > 0);
  const dues = open.map((i) => i.dueDate).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
  const awaiting = quotes.filter((q) => q.status === "AWAITING_ACCEPT" && q.statusLabel !== "หมดอายุ");
  const recent: PortalActivityItem[] = [
    ...all.slice(0, 8).map((d): PortalActivityItem => ({
      kind: d.docType === "QUOTATION" ? "QUOTATION" : d.docType === "INVOICE" ? "INVOICE" : "RECEIPT",
      label: `${PORTAL_DOC_TYPE_LABEL[d.docType] ?? "เอกสาร"} ${d.docNo ?? ""}`.trim(),
      at: d.issueDate,
    })),
    ...requests.map((r): PortalActivityItem => ({ kind: "REQUEST", label: `${PORTAL_REQUEST_KIND_LABEL[r.kind as PortalRequestKind] ?? "คำขอ"}: ${titleOf(r.payload)}`, at: r.createdAt })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);
  const dto: PortalHomeDto = {
    company: { id: sc.companyId, name: sc.companyName },
    // 🔴 X1.3: บริษัทอื่นของคนเดียวกัน = id ล้วนในหน้าแรก (ชื่อของบริษัทอื่นมาทาง `myCompanies` ของตัวสลับเท่านั้น)
    companies: [...new Set(companyIds.map((c) => c.companyId))].map((id) => ({ id, name: id === sc.companyId ? sc.companyName : "" })),
    me: { contactId: sc.crmContactId, name: me?.name ?? "", role: sc.role },
    shopName: shop?.name ?? "",
    outstandingSatang: open.reduce((n, i) => n + i.outstandingSatang, 0),
    nextDueDate: dues[0] ?? null,
    quotesAwaiting: awaiting.length,
    openInvoices: open.length,
    awaiting,
    recent,
  };
  if (sc.settings.showDeals) {
    dto.openDealCount = await prisma.crmDeal.count({ where: { tenantId: sc.tenantId, systemId: sc.crmSystemId, companyId: sc.companyId, kind: "OPEN" } });
  }
  await markViewed(sc);
  return dto;
}

export async function listQuotations(token: string): Promise<{ items: PortalQuotationDto[] }> {
  const sc = await scope(token);
  const now = new Date();
  return { items: (await docs(sc, ["QUOTATION"])).map((d) => quotationDto(d, sc.role, now)) };
}

export async function getQuotation(token: string, docId: string): Promise<PortalQuotationDto> {
  const sc = await scope(token);
  const d = str(docId) ? (await docs(sc, ["QUOTATION"], str(docId)))[0] : undefined;
  if (!d) throw nf();
  await markViewed(sc);
  return quotationDto(d, sc.role);
}

/**
 * ตอบรับ/ปฏิเสธใบเสนอราคา → `account.respondQuotation(ctx, id, accept, {by:"PORTAL", signer})` (ด่าน AWAITING_ACCEPT ของบัญชี)
 * ปฏิเสธต้องมีเหตุผล · หมดอายุ = ปฏิเสธอย่างสุภาพ · ตอบซ้ำแบบเดิม = สำเร็จเฉย ๆ · ตอบกลับทาง = CONFLICT (เปลี่ยนคำตอบไม่ได้)
 * `crm.portal.quote.responded` ยิงใน tx เดียวกับการเปลี่ยนสถานะ (เฉพาะคำตอบที่ชนะ) · ดีลย้ายขั้นผ่านตัวรับเดิมของ `account.quotation.responded`
 */
export async function respondQuotation(
  token: string,
  docId: string,
  input: { accept: boolean; reason?: string | null; signerName: string },
  meta: Meta = {},
): Promise<{ ok: true; status: "ACCEPTED" | "REJECTED"; already?: true }> {
  const sc = await scope(token);
  const id = str(docId);
  const d = id ? (await docs(sc, ["QUOTATION"], id))[0] : undefined;
  if (!d) throw nf();
  if (!portalCanRespond(sc.role)) throw new PortalError("FORBIDDEN", "สิทธิ์พอร์ทัลของบัญชีนี้ยังตอบรับใบเสนอราคาไม่ได้ — ขอให้ผู้ดูแลของบริษัทหรือร้านเพิ่มสิทธิ์ให้");
  const accept = input?.accept === true;
  const want = accept ? "ACCEPTED" : "REJECTED";
  const signer = str(input?.signerName).slice(0, 120);
  const reason = str(input?.reason).slice(0, 500);
  if (d.status === want) return { ok: true, status: want, already: true };
  if (d.status !== "AWAITING_ACCEPT") throw answered(d.status);
  if (quotationExpired(d.validUntil)) throw new PortalError("VALIDATION", "ใบเสนอราคานี้หมดอายุแล้ว จึงตอบผ่านพอร์ทัลไม่ได้ — ติดต่อร้านเพื่อขอใบเสนอราคาใหม่");
  if (!signer) throw new PortalError("VALIDATION", "กรุณาระบุชื่อผู้ลงนามก่อนยืนยันคำตอบ");
  if (!accept && !reason) throw new PortalError("VALIDATION", "กรุณาระบุเหตุผลที่ปฏิเสธ เพื่อให้ร้านนำไปปรับใบเสนอราคาได้");
  // มติผู้คุมงานรอบ 4 (SF4): นับเฉพาะครั้งที่จะเปลี่ยนสถานะจริง (ตอบซ้ำแบบเดิม/ใบที่ตอบแล้ว/หมดอายุ = ไม่มีอะไรถูกเขียน จึงไม่กินโควตา)
  await portalWriteGate(sc);
  const ipHash = portalIpHash(meta?.ip) ?? "";
  const acc = await accountFacade();
  const r = await acc.respondQuotation({ tenantId: sc.tenantId, systemId: d.systemId }, d.id, accept, {
    by: "PORTAL",
    signer: { name: signer, ipHash, userAgent: str(meta?.userAgent).slice(0, 300) },
    reason: accept ? null : reason,
    portal: { accessId: sc.portalAccessId, contactId: sc.crmContactId },
    alsoEmit: [
      {
        type: "crm.portal.quote.responded",
        idempotencyKey: `crm.portal.quote.responded#${d.id}`,
        systemId: sc.crmSystemId,
        payload: { companyId: sc.companyId, contactId: sc.crmContactId, docId: d.id, action: accept ? "ACCEPT" : "REJECT" },
      },
    ],
  });
  if (r.ok) return { ok: true, status: want };
  // แพ้การแข่ง/สถานะเปลี่ยนระหว่างทาง — อ่านใหม่แล้วตอบตามจริง
  const now = (await docs(sc, ["QUOTATION"], d.id))[0];
  if (now?.status === want) return { ok: true, status: want, already: true };
  if (now && now.status !== "AWAITING_ACCEPT") throw answered(now.status);
  throw new PortalError("CONFLICT", "บันทึกคำตอบไม่สำเร็จในตอนนี้ — ลองใหม่อีกครั้งในอีกสักครู่");
}

function answered(status: string): PortalError {
  const was = status === "ACCEPTED" ? "ตอบรับไปแล้ว" : status === "REJECTED" ? "ปฏิเสธไปแล้ว" : "ปิดไปแล้ว";
  return new PortalError("CONFLICT", `ใบเสนอราคานี้${was} จึงเปลี่ยนคำตอบผ่านพอร์ทัลไม่ได้ — หากต้องการแก้ไข กรุณาติดต่อร้าน`);
}

export async function listInvoices(token: string): Promise<{ items: PortalInvoiceDto[] }> {
  const sc = await scope(token);
  return { items: (await docs(sc, ["INVOICE"])).map((d) => invoiceDto(d, sc.role)) };
}

export async function getInvoice(token: string, docId: string): Promise<PortalInvoiceDto> {
  const sc = await scope(token);
  const d = str(docId) ? (await docs(sc, ["INVOICE"], str(docId)))[0] : undefined;
  if (!d) throw nf();
  await markViewed(sc);
  return invoiceDto(d, sc.role);
}

/** ลิงก์ชำระของใบแจ้งหนี้ = ทางเงินเดิม `createPaymentRequestForDoc` (ช่องทางรับเงินแรกของสมุด) · ขอซ้ำ = ลิงก์เดิม */
export async function payLink(token: string, invoiceId: string): Promise<{ url: string; amountSatang: number; expiresAt: Date }> {
  const sc = await scope(token);
  await portalWriteGate(sc);
  const d = str(invoiceId) ? (await docs(sc, ["INVOICE"], str(invoiceId)))[0] : undefined;
  if (!d) throw nf();
  if (!portalCanPay(sc.role)) throw new PortalError("FORBIDDEN", "สิทธิ์พอร์ทัลของบัญชีนี้ยังชำระเงินผ่านพอร์ทัลไม่ได้ — ขอให้ผู้ดูแลของบริษัทหรือร้านเพิ่มสิทธิ์ให้");
  const acc = await accountFacade();
  const ctx = { tenantId: sc.tenantId, systemId: d.systemId };
  const financeId = await acc.firstReceiveFinanceId(ctx);
  if (!financeId) throw new PortalError("VALIDATION", "ร้านยังไม่ได้ตั้งช่องทางรับเงินออนไลน์ — ติดต่อร้านเพื่อชำระด้วยวิธีอื่น");
  const r = await acc.createPaymentRequestForDoc(ctx, d.id, { financeId, userId: null });
  if (!r.ok) throw new PortalError("VALIDATION", /[ก-๙]/.test(r.reason) ? r.reason : "ยังสร้างลิงก์ชำระของใบนี้ไม่ได้ — ติดต่อร้าน");
  if (!r.reused) await prisma.auditLog.create({ data: { tenantId: sc.tenantId, actorType: "SYSTEM", actorId: null, action: "crm.portal.pay-link", targetType: "AccountDocument", targetId: d.id, after: { accessId: sc.portalAccessId, paymentRequestId: r.request.id } } });
  return { url: r.request.url, amountSatang: r.request.amountSatang, expiresAt: r.request.expiresAt };
}

const SLIP_MIME = new Set(["image/png", "image/jpeg", "application/pdf"]);
const SLIP_MAX_BYTES = 5 * 1024 * 1024;

/** แนบสลิปโอนเงิน → ไฟล์ส่วนตัว + ไฟล์แนบของใบแจ้งหนี้ในบัญชี · คืนลิงก์ชั่วคราวที่ผูก session นี้ */
export async function uploadSlip(
  token: string,
  input: { invoiceId: string; filename: string; contentType: string; data: Uint8Array },
  deps?: { put?: UploadDeps["put"] },
): Promise<PortalFileDto> {
  const sc = await scope(token);
  await portalWriteGate(sc);
  const d = str(input?.invoiceId) ? (await docs(sc, ["INVOICE"], str(input.invoiceId)))[0] : undefined;
  if (!d) throw nf();
  if (!portalCanPay(sc.role)) throw new PortalError("FORBIDDEN", "สิทธิ์พอร์ทัลของบัญชีนี้ยังแนบสลิปไม่ได้ — ขอให้ผู้ดูแลของบริษัทหรือร้านเพิ่มสิทธิ์ให้");
  // มติผู้คุมงาน S1: แนบสลิปได้เฉพาะใบที่ยังรอชำระ/ชำระบางส่วน
  if (!OPEN_INVOICE.has(d.status)) throw new PortalError("VALIDATION", "ใบแจ้งหนี้นี้ไม่ได้รอชำระแล้ว จึงไม่ต้องแนบสลิป — หากชำระซ้ำ กรุณาติดต่อร้าน");
  const data = input?.data instanceof Uint8Array ? input.data : new Uint8Array();
  if (data.length === 0 || data.length > SLIP_MAX_BYTES) throw new PortalError("VALIDATION", "ไฟล์สลิปต้องไม่ว่างและไม่เกิน 5 MB");
  // ชนิดไฟล์จากไบต์หัวไฟล์ (ไม่เชื่อ content-type) · ประกาศไม่ตรงกับเนื้อ = ปฏิเสธ
  const declared = normalizeUploadType(str(input?.contentType));
  const mime = sniffSlipMime(data);
  if (!mime || !SLIP_MIME.has(declared) || declared !== mime) throw new PortalError("VALIDATION", "แนบสลิปได้เฉพาะไฟล์รูป PNG/JPG หรือ PDF");
  await portalWriteGate(sc, "slip");
  const name = (str(input?.filename).replace(/[\\/<>]/g, "-").replace(/^\.+/, "") || "slip").slice(0, 120);
  const up = await uploadFile({ tenantId: sc.tenantId }, { kind: "ATTACHMENT", filename: name, contentType: mime, data, maxBytes: SLIP_MAX_BYTES, visibility: "private" }, deps?.put ? { put: deps.put } : undefined);
  if (!up.ok) throw new PortalError("CONFLICT", "อัปโหลดสลิปไม่สำเร็จ ระบบยังไม่ได้บันทึกไฟล์นี้ — ลองใหม่อีกครั้งในอีกสักครู่");
  const acc = await accountFacade();
  const at = await acc.attachPrivateFileToDoc({ tenantId: sc.tenantId, systemId: d.systemId }, d.id, { fileAssetId: up.assetId, fileName: name, mimeType: mime, sizeBytes: data.length });
  if (!at.ok) throw new PortalError("CONFLICT", "บันทึกสลิปเข้ากับใบแจ้งหนี้ไม่สำเร็จ — ลองใหม่อีกครั้ง");
  await prisma.auditLog.create({ data: { tenantId: sc.tenantId, actorType: "SYSTEM", actorId: null, action: "crm.portal.slip", targetType: "AccountDocument", targetId: d.id, after: { accessId: sc.portalAccessId, attachmentId: at.id } } });
  return { id: at.id, name, url: privateFileUrl(up.assetId, { kind: "PORTAL", id: sc.sessionId }), mime, size: data.length };
}

export async function listReceipts(token: string): Promise<{ items: PortalReceiptDto[] }> {
  const sc = await scope(token);
  return {
    items: (await docs(sc, ["RECEIPT", "TAX_INVOICE"])).map((d) => ({
      id: d.id,
      docNo: d.docNo,
      docType: d.docType,
      docLabel: PORTAL_DOC_TYPE_LABEL[d.docType] ?? "เอกสาร",
      status: d.status,
      statusLabel: PORTAL_DOC_STATUS_LABEL[d.status] ?? d.status,
      issueDate: d.issueDate,
      grandTotalSatang: d.grandTotal,
    })),
  };
}

// ── เอกสาร/สัญญา = รายการของวัตถุ `portalVisible` ที่แม่คือบริษัทปัจจุบัน · เฉพาะฟิลด์ `portalVisible` ──

async function visibleRecords(sc: Scope, recordId?: string) {
  return prisma.customRecord.findMany({
    where: {
      tenantId: sc.tenantId,
      systemId: sc.crmSystemId,
      archivedAt: null,
      parentType: "COMPANY",
      parentId: sc.companyId,
      object: { portalVisible: true, archivedAt: null, tenantId: sc.tenantId, systemId: sc.crmSystemId },
      ...(recordId ? { id: recordId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: recordId ? 1 : 200,
    select: { id: true, title: true, updatedAt: true, object: { select: { key: true, label: true } } },
  });
}

async function filesOf(sc: Scope, recordIds: string[]): Promise<Map<string, PortalFileDto[]>> {
  const out = new Map<string, PortalFileDto[]>();
  if (recordIds.length === 0) return out;
  const links = await prisma.crmFileLink.findMany({
    where: { tenantId: sc.tenantId, systemId: sc.crmSystemId, entityType: "RECORD", entityId: { in: recordIds } },
    orderBy: { createdAt: "desc" },
    select: { id: true, entityId: true, fileId: true, name: true, mime: true, size: true },
    take: 500,
  });
  for (const l of links) {
    let url = "";
    try {
      url = privateFileUrl(l.fileId, { kind: "PORTAL", id: sc.sessionId });
    } catch {
      continue;
    }
    const arr = out.get(l.entityId) ?? [];
    arr.push({ id: l.id, name: l.name, url, mime: l.mime, size: l.size });
    out.set(l.entityId, arr);
  }
  return out;
}

export async function listDocuments(token: string): Promise<{ items: PortalDocumentItem[] }> {
  const sc = await scope(token);
  const recs = await visibleRecords(sc);
  const files = await filesOf(sc, recs.map((r) => r.id));
  return { items: recs.map((r) => ({ id: r.id, objectKey: r.object.key, objectLabel: r.object.label, title: r.title, updatedAt: r.updatedAt, files: files.get(r.id) ?? [] })) };
}

// CRM C5.5 ▸ (fix3b · H2b-5) ฟิลด์ DATETIME เก็บเป็นขณะจริง ⇒ แสดงเป็นวันเวลาไทย รูปแบบเดียวกับหน้าระเบียนของพนักงาน
//   ("9 ต.ค. 2569 00:30") · เดิมตัดเป็นวันที่ UTC (00:00–06:59 น. = วันก่อนหน้า · ไม่มีเวลา)
//   DATE เก็บเป็นเที่ยงคืน UTC ของวันในปฏิทิน ⇒ ตัดสตริงแบบเดิม (ค่าที่ลูกค้าเห็นและใช้ตั้งต้นช่อง "ขอแก้ข้อมูล" ไม่เปลี่ยน) ◂
// CRM C5.5-fix7 ▸ RV-3: ตัวจัดรูปตัวเดียวกับหน้าระเบียนของพนักงานและหน้าผู้ติดต่อ 360 (`formatThaiDateTimeFull` · lib/ui/date) — เลิกคัดลอกตัวเลือกรูปแบบ ◂
function valueText(v: { valueText: string | null; valueNumber: { toString(): string } | null; valueDate: Date | null; valueBool: boolean | null; valueOptions: string[] } | undefined, type?: string): string {
  if (!v) return "";
  if (v.valueText !== null && v.valueText !== undefined) return v.valueText;
  if (v.valueNumber !== null && v.valueNumber !== undefined) return v.valueNumber.toString();
  if (v.valueDate && type === "DATETIME") return formatThaiDateTimeFull(v.valueDate);
  if (v.valueDate) return v.valueDate.toISOString().slice(0, 10);
  if (v.valueBool !== null && v.valueBool !== undefined) return v.valueBool ? "ใช่" : "ไม่ใช่";
  return v.valueOptions.join(", ");
}

async function recordFields(sc: Scope, objectKey: string) {
  return prisma.memberField.findMany({
    where: { tenantId: sc.tenantId, systemId: sc.crmSystemId, objectKey, portalVisible: true, sensitive: false, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, key: true, label: true, type: true, portalEditable: true },
    take: 200,
  });
}

export async function getRecord(token: string, recordId: string): Promise<PortalRecordDto> {
  const sc = await scope(token);
  const rec = str(recordId) ? (await visibleRecords(sc, str(recordId)))[0] : undefined;
  if (!rec) throw nf();
  const fields = await recordFields(sc, rec.object.key);
  const values = await prisma.customRecordValue.findMany({
    where: { tenantId: sc.tenantId, recordType: "CUSTOM", recordId: rec.id, fieldId: { in: fields.map((f) => f.id) } },
    select: { fieldId: true, valueText: true, valueNumber: true, valueDate: true, valueBool: true, valueOptions: true },
  });
  const byField = new Map(values.map((v) => [v.fieldId, v]));
  const files = await filesOf(sc, [rec.id]);
  await markViewed(sc);
  return {
    id: rec.id,
    objectKey: rec.object.key,
    objectLabel: rec.object.label,
    title: rec.title,
    // editable = ฟิลด์เปิดให้ขอแก้ **และ** บทบาทขอแก้ข้อมูลได้ (ตารางสิทธิ์รอบ 4 — APPROVE ขึ้นไป)
    fields: fields.map((f) => ({ key: f.key, label: f.label, value: valueText(byField.get(f.id), f.type), editable: f.portalEditable && f.type !== "FILE" && f.type !== "LOOKUP" && portalCanChangeData(sc.role) })),
    files: files.get(rec.id) ?? [],
    updatedAt: rec.updatedAt,
  };
}

/** แก้ฟิลด์ `portalEditable` = คำขอ PROFILE_CHANGE รออนุมัติ (ค่าจริงยังไม่เปลี่ยนจนกว่าร้านอนุมัติ) */
export async function requestRecordChange(token: string, recordId: string, input: { fieldKey: string; value: string }): Promise<{ requestId: string }> {
  const sc = await scope(token);
  await portalWriteGate(sc);
  const rec = str(recordId) ? (await visibleRecords(sc, str(recordId)))[0] : undefined;
  if (!rec) throw nf();
  if (!portalCanChangeData(sc.role)) throw new PortalError("FORBIDDEN", "สิทธิ์พอร์ทัลของบัญชีนี้ยังขอแก้ข้อมูลไม่ได้ — ขอให้ร้านปรับสิทธิ์เป็น “ตอบรับใบเสนอราคา” ขึ้นไป");
  const field = (await recordFields(sc, rec.object.key)).find((f) => f.key === str(input?.fieldKey));
  if (!field || !field.portalEditable || field.type === "FILE" || field.type === "LOOKUP") throw new PortalError("VALIDATION", "ช่องนี้แก้ไขผ่านพอร์ทัลไม่ได้ — หากข้อมูลไม่ถูกต้อง ให้กด “แจ้งเรื่อง” เพื่อให้ร้านช่วยแก้");
  // มติผู้คุมงานรอบ 4 (SF3): ตรวจค่าด้วยตัวออกแบบฟิลด์ตัวเดียวกับตอนบันทึกจริง (ชนิด · maxLength · pattern · ต้องกรอก) — เพดานตามฟิลด์
  //   รอบ 5: **ไม่ตรวจค่าซ้ำตอนสร้างคำขอ** (`skipUnique`) — ไม่งั้นลูกค้าใช้พอร์ทัลถามได้ว่ามีรายการอื่นใช้ค่านี้อยู่ไหม ·
  //   ค่าซ้ำถูกตรวจตอนพนักงานอนุมัติ (`setFieldValues`) และแจ้งพนักงานเป็นข้อความไทย
  const raw = typeof input?.value === "string" ? input.value : "";
  if (raw.length > 4_000) throw new PortalError("VALIDATION", `ค่าของช่อง “${field.label}” ยาวเกินที่ร้านกำหนดไว้`);
  let value: unknown;
  try {
    const m = await memberFacade();
    const checked = await m.fields.checkRecordValues({ tenantId: sc.tenantId, systemId: sc.crmSystemId, actorUserId: null, objectKey: rec.object.key }, rec.id, { [field.key]: raw }, { via: "STAFF" }, undefined, { skipUnique: true });
    value = checked[field.key] ?? null;
  } catch (e) {
    const msg = e instanceof Error && /[ก-๙]/.test(e.message) ? e.message : `ค่าของช่อง “${field.label}” ยังไม่ตรงกับที่ร้านกำหนด`;
    throw new PortalError("VALIDATION", msg);
  }
  const r = await createRequestInternal(
    { tenantId: sc.tenantId, systemId: sc.crmSystemId, companyId: sc.companyId, contactId: sc.crmContactId },
    "PROFILE_CHANGE",
    `ขอแก้ “${field.label}” ของ${rec.object.label} ${rec.title}`.slice(0, 200),
    null,
    { recordId: rec.id, fieldKey: field.key, value: value as string | number | boolean | null },
  );
  return { requestId: r.id };
}

// ── คำขอ (แจ้งเรื่อง/ขอเอกสาร → การ์ดบอร์ดงาน · ขอเปลี่ยนผู้ติดต่อ/ข้อมูล → สายอนุมัติ `crm.portal_request`) ──

function titleOf(payload: unknown): string {
  return isObj(payload) && typeof payload.title === "string" ? payload.title : "";
}

/** คีย์ที่ระบบเป็นผู้เขียนเท่านั้น (มติผู้คุมงาน S2) — ลูกค้าส่งมาเอง = ถูกทิ้ง (กันปลอมคำขอผูก LINE / แก้ฟิลด์) */
const RESERVED_PAYLOAD_KEYS = new Set(["title", "body", "reason", "lineUserId", "recordId", "fieldKey", "value", "origin"]);

function cleanPayload(raw: unknown): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw).slice(0, 20)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k) || RESERVED_PAYLOAD_KEYS.has(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 1000);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean" || v === null) out[k] = v;
  }
  return out;
}

type ReqScope = { tenantId: string; systemId: string; companyId: string; contactId: string };

/**
 * สร้างคำขอ 1 ใบ (tx: แถวคำขอ + audit + `crm.portal.request.created` id ล้วน) แล้วส่งต่อตามชนิด:
 *   การ์ด → `kanban/links.createCardFromExternal` บน `settings.crm.portal.issueBoardId` (คอลัมน์แรก · sourceKey กันซ้ำ) · ไม่มีบอร์ด = คำขอเปล่า
 *   อนุมัติ → `approval.submitForApproval({entityType:"crm.portal_request"})` · ไม่มีสายอนุมัติ = รอพนักงานตัดสินเอง (`decideRequest`)
 */
async function createRequestInternal(
  rs: ReqScope,
  kind: PortalRequestKind,
  title: string,
  body: string | null,
  extra: Record<string, string | number | boolean | null>,
): Promise<{ id: string }> {
  const payload = { ...extra, title, ...(body ? { body } : {}) };
  const row = await prisma.$transaction(async (tx) => {
    const r = await tx.crmPortalRequest.create({ data: { tenantId: rs.tenantId, systemId: rs.systemId, companyId: rs.companyId, contactId: rs.contactId, kind, payload }, select: { id: true } });
    await auditSystem(tx, rs.tenantId, "crm.portal.request.create", "CrmPortalRequest", r.id, { companyId: rs.companyId, contactId: rs.contactId, kind });
    await emitOutboxMany(tx, [
      { tenantId: rs.tenantId, systemId: rs.systemId, type: "crm.portal.request.created", idempotencyKey: `crm.portal.request.created#${r.id}`, payload: { companyId: rs.companyId, contactId: rs.contactId, requestId: r.id, kind } },
    ]);
    return r;
  });
  const settings = await settingsOf(rs.tenantId, rs.systemId);
  if (portalRequestRoute(kind) === "CARD") {
    if (settings.issueBoardId) {
      try {
        // บอร์ดต้องยังใช้งาน (เก็บเข้าคลังแล้ว = คำขอเปล่า) — ประตู createCardFromExternal ตรวจซ้ำอีกชั้น
        const board = await prisma.kanbanBoard.findFirst({ where: { id: settings.issueBoardId, tenantId: rs.tenantId, status: "ACTIVE" }, select: { id: true, systemId: true } });
        if (board) {
          const L = await kanbanLinks();
          const card = await L.createCardFromExternal(
            { tenantId: rs.tenantId, systemId: board.systemId, actorUserId: null },
            { boardId: board.id, title: `[พอร์ทัล] ${title}`.slice(0, 300), description: body ?? null, sourceType: "FORM", sourceKey: portalCardSourceKey(row.id) },
          );
          await prisma.crmPortalRequest.updateMany({ where: { id: row.id, tenantId: rs.tenantId }, data: { kanbanCardId: card.cardId } });
        }
      } catch {
        // เปิดการ์ดไม่สำเร็จ = คำขอยังอยู่ครบ (พนักงานเห็นในหน้าบริษัท) — ไม่ทำให้ลูกค้าเห็นว่าส่งไม่สำเร็จ
      }
    }
  } else {
    try {
      const ap = await approvalFacade();
      const sub = await ap.submitForApproval({ tenantId: rs.tenantId }, { entityType: PORTAL_APPROVAL_ENTITY, entityId: row.id, systemId: rs.systemId, requestedById: `crm-portal:${rs.contactId}` });
      if ("requestId" in sub) await prisma.crmPortalRequest.updateMany({ where: { id: row.id, tenantId: rs.tenantId }, data: { approvalRequestId: sub.requestId } });
    } catch {
      // สายอนุมัติล่ม = คำขอยัง PENDING (ตอนพนักงานตัดสินจะยื่นใหม่ก่อน — SF5) · ไม่กลืนเงียบ: WARN ของ ops (id ล้วน)
      await logOps("WARN", "crm.portal", `ยื่นคำขอพอร์ทัลเข้าสายอนุมัติไม่สำเร็จ — คำขอ ${row.id}`, { tenantId: rs.tenantId }).catch(() => undefined);
    }
  }
  return row;
}

const CUSTOMER_REQUEST_KINDS = ["ISSUE", "DOCUMENT_REQUEST", "CONTACT_CHANGE"] as const;

export async function createRequest(
  token: string,
  input: { kind: string; title: string; body?: string | null; payload?: Record<string, unknown> | null },
): Promise<{ id: string }> {
  const sc = await scope(token);
  await portalWriteGate(sc);
  const kind = str(input?.kind).toUpperCase();
  // มติผู้คุมงาน S2: PROFILE_CHANGE เกิดได้ทางเดียวคือ `requestRecordChange` (ตรวจฟิลด์ portalEditable แล้ว) — สร้างตรงไม่ได้
  if (!(CUSTOMER_REQUEST_KINDS as readonly string[]).includes(kind)) throw new PortalError("VALIDATION", "เลือกชนิดของคำขอก่อนส่ง (แจ้งเรื่อง · ขอเอกสาร · ขอเพิ่ม/เปลี่ยนผู้ติดต่อ)");
  const k = kind as PortalRequestKind;
  // ตารางสิทธิ์ (มติผู้คุมงานรอบ 4): ขอเพิ่ม/เปลี่ยนผู้ติดต่อ = APPROVE ขึ้นไป · แจ้งเรื่อง/ขอเอกสาร = ทุกบทบาท
  if (k === "CONTACT_CHANGE" && !portalCanChangeData(sc.role)) throw new PortalError("FORBIDDEN", "สิทธิ์พอร์ทัลของบัญชีนี้ยังขอเปลี่ยนผู้ติดต่อไม่ได้ — ขอให้ร้านปรับสิทธิ์เป็น “ตอบรับใบเสนอราคา” ขึ้นไป");
  if ((k === "ISSUE" || k === "DOCUMENT_REQUEST") && !sc.settings.allowIssue) throw new PortalError("FORBIDDEN", "ร้านนี้ยังไม่เปิดให้แจ้งเรื่องผ่านพอร์ทัล — ติดต่อร้านทางช่องทางปกติได้เลย");
  const title = str(input?.title).slice(0, 200);
  if (!title) throw new PortalError("VALIDATION", "กรุณาใส่หัวข้อของเรื่องก่อนส่ง");
  const body = str(input?.body).slice(0, 4000) || null;
  return createRequestInternal({ tenantId: sc.tenantId, systemId: sc.crmSystemId, companyId: sc.companyId, contactId: sc.crmContactId }, k, title, body, cleanPayload(input?.payload));
}

async function requestDtos(sc: { tenantId: string; settings: PortalSettings }, rows: { id: string; kind: string; payload: unknown; status: string; kanbanCardId: string | null; createdAt: Date }[]): Promise<PortalRequestDto[]> {
  const cardIds = rows.map((r) => r.kanbanCardId).filter((x): x is string => !!x);
  const cards = cardIds.length ? await prisma.kanbanCard.findMany({ where: { id: { in: cardIds }, tenantId: sc.tenantId }, select: { id: true, boardId: true, columnId: true } }) : [];
  const boardIds = [...new Set(cards.map((c) => c.boardId))];
  const cols = boardIds.length
    ? await prisma.kanbanColumn.findMany({ where: { boardId: { in: boardIds }, tenantId: sc.tenantId, status: "ACTIVE" }, select: { id: true, boardId: true, isDoneColumn: true, position: true, sortOrder: true }, take: 500 })
    : [];
  const colsOf = (boardId: string) =>
    cols
      .filter((c) => c.boardId === boardId)
      .sort((a, b) => (a.position ?? "").localeCompare(b.position ?? "") || a.sortOrder - b.sortOrder)
      .map((c) => ({ id: c.id, isDoneColumn: c.isDoneColumn }));
  const cardOf = new Map(cards.map((c) => [c.id, c]));
  return rows.map((r) => {
    const card = r.kanbanCardId ? cardOf.get(r.kanbanCardId) : undefined;
    const p = card && r.status === "PENDING" ? portalProgressOf(card.columnId, colsOf(card.boardId), sc.settings.statusMap) : portalProgressOfStatus(r.status, sc.settings.statusMap);
    return { id: r.id, kind: r.kind, kindLabel: PORTAL_REQUEST_KIND_LABEL[r.kind as PortalRequestKind] ?? "คำขอ", title: titleOf(r.payload), status: r.status, progress: p.progress, progressLabel: p.progressLabel, createdAt: r.createdAt };
  });
}

export async function listRequests(token: string): Promise<{ items: PortalRequestDto[] }> {
  const sc = await scope(token);
  const rows = await prisma.crmPortalRequest.findMany({
    where: { tenantId: sc.tenantId, systemId: sc.crmSystemId, companyId: sc.companyId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, kind: true, payload: true, status: true, kanbanCardId: true, createdAt: true },
  });
  return { items: await requestDtos(sc, rows) };
}

export async function getRequest(token: string, requestId: string): Promise<PortalRequestDto> {
  const sc = await scope(token);
  const id = str(requestId);
  const row = id
    ? await prisma.crmPortalRequest.findFirst({ where: { id, tenantId: sc.tenantId, systemId: sc.crmSystemId, companyId: sc.companyId }, select: { id: true, kind: true, payload: true, status: true, kanbanCardId: true, createdAt: true } })
    : null;
  if (!row) throw nf();
  const [dto] = await requestDtos(sc, [row]);
  if (!dto) throw nf();
  return dto;
}

/** ผู้ติดต่อของบริษัทปัจจุบันเท่านั้น (ไม่รวมที่ถูกเก็บ/ถูกรวม) — ไม่มีข้อมูลของพนักงานร้าน */
export async function listContacts(token: string): Promise<{ items: PortalContactDto[] }> {
  const sc = await scope(token);
  const links = await prisma.crmCompanyContact.findMany({
    // CRM C5.4-B ▸ L1-M2: เฉพาะคนที่ยังอยู่ในบริษัท (endedAt null) — อดีตพนักงานไม่โผล่ให้คนในพอร์ทัลเห็น
    where: { tenantId: sc.tenantId, companyId: sc.companyId, endedAt: null, contact: { archivedAt: null, mergedIntoId: null, tenantId: sc.tenantId, systemId: sc.crmSystemId } },
    select: { isPrimary: true, jobTitle: true, contact: { select: { id: true, name: true, email: true, phone: true } } },
    take: 200,
  });
  const items = links
    .map((l) => ({ id: l.contact.id, name: l.contact.name, jobTitle: l.jobTitle, email: l.contact.email, phone: l.contact.phone, isPrimary: l.isPrimary, isMe: l.contact.id === sc.crmContactId }))
    .sort((a, b) => Number(b.isMe) - Number(a.isMe) || Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name, "th"));
  return { items };
}

/** ข้อมูลย่อของ session ปัจจุบัน (REST `/portal/me` · หัวหน้าเพจ) */
export async function me(token: string): Promise<{ company: PortalCompanyRef; contactId: string; name: string; role: string; shopName: string }> {
  const sc = await scope(token);
  const [c, t] = await Promise.all([
    prisma.crmContact.findFirst({ where: { id: sc.crmContactId, tenantId: sc.tenantId }, select: { name: true } }),
    prisma.tenant.findUnique({ where: { id: sc.tenantId }, select: { name: true } }),
  ]);
  return { company: { id: sc.companyId, name: sc.companyName }, contactId: sc.crmContactId, name: c?.name ?? "", role: sc.role, shopName: t?.name ?? "" };
}

// ═══════════════════════════════════════════════════════════════════════════════════
// ฝั่งพนักงาน (ctx, actor) — คีย์ `crm.portal.manage`
// ═══════════════════════════════════════════════════════════════════════════════════

export type PortalStaffCtx = { tenantId: string; systemId: string; actorUserId?: string | null };

async function staff(ctx: PortalStaffCtx, actor: MemberActor | null | undefined): Promise<MemberActor> {
  const sys =
    ctx && typeof ctx.tenantId === "string" && typeof ctx.systemId === "string" && ctx.tenantId && ctx.systemId
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } })
      : null;
  if (!sys || !actor || actor.role === "CUSTOMER") throw new PortalError("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  if (!crmCan(actor, "crm.portal.manage")) throw new PortalError("FORBIDDEN", crmForbiddenMessage("crm.portal.manage"));
  return actor;
}

/** บริษัทที่ actor มองเห็น (ผ่าน `companies.companyRefsInTx` → companyWhere) · `live` = ยังไม่ถูกเก็บ/ถูกรวม */
async function visibleCompany(ctx: PortalStaffCtx, actor: MemberActor, companyId: string): Promise<{ id: string; name: string; live: boolean }> {
  const id = str(companyId);
  const cctx = { tenantId: ctx.tenantId, systemId: ctx.systemId, actorUserId: ctx.actorUserId ?? null };
  const co = id ? (await companies.companyRefsInTx(prisma, cctx, actor, [id]))[0] : undefined;
  if (!co) throw new PortalError("NOT_FOUND", "ไม่พบบริษัทนี้ในระบบ CRM ที่เปิดอยู่ (อาจถูกลบหรือบัญชีนี้มองไม่เห็น) — รีเฟรชหน้าแล้วลองใหม่");
  const live = (await companies.companyRefsInTx(prisma, cctx, actor, [id], { live: true })).length > 0;
  return { id: co.id, name: co.name, live };
}

/**
 * CRM C5.5-fix2 ▸ รีวิว R2b-1 — ล็อกระดับธุรกรรมต่อ (ร้าน, ผู้ติดต่อ) ของพอร์ทัล: `invite` (เชิญซ้ำ → ฆ่า session ทุกใบ) กับ `switchCompany`
 * (ตรวจ session ต้นทาง → mint) วิ่งทีละตัว · ต้องเป็นสิ่งแรกที่ธุรกรรมทำ (ก่อนล็อกแถวใด) ทั้งสองฝั่ง · namespace `crm.portal.contact:`
 * ไม่ชนกับล็อกของ event พอร์ทัล (`<tenant>:<sourceRef>` ใน onPortalEvent) ซึ่งไม่เคยถูกถือพร้อมกับล็อกนี้
 */
async function lockPortalContactInTx(tx: Prisma.TransactionClient, tenantId: string, contactId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crm.portal.contact:${tenantId}:${contactId}`}))`;
}

function appBase(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * เชิญผู้ติดต่อเข้าพอร์ทัลของบริษัท — ลิงก์ใช้ครั้งเดียว 7 วัน (เก็บเฉพาะ sha256 ของ token) · เชิญซ้ำ = เปลี่ยน hash + เริ่มนับ 7 วันใหม่
 * ส่งอีเมล "เชิญเข้าพอร์ทัลลูกค้า <ร้าน>" ถึงอีเมลของผู้ติดต่อ (ไม่มีอีเมล/เบอร์ของพนักงาน ไม่มีข้อมูลดีล) · audit `crm.portal.invite`
 * token ดิบมีอยู่แค่ใน `inviteUrl` ที่คืน และในข้อความเชิญ — ไม่มีในแถวใด ๆ
 */
export async function invite(
  ctx: PortalStaffCtx,
  actor: MemberActor,
  input: { companyId: string; contactId: string; role?: string | null; loginMethods?: string[] | null },
): Promise<{ accessId: string; inviteUrl: string; expiresAt: Date; emailed: boolean }> {
  const a = await staff(ctx, actor);
  // มติผู้คุมงานรอบ 4: เชิญได้เฉพาะระบบ CRM ที่เป็นพอร์ทัลของร้านจริง (ร้านเปิดพอร์ทัล + ระบบแรกที่เปิด) — ลิงก์ของระบบอื่นใช้ไม่ได้อยู่แล้ว
  const tslug = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { slug: true } });
  const shopSys = tslug ? await portalShopBySlug(tslug.slug) : null;
  if (!shopSys || shopSys.systemId !== ctx.systemId) throw new PortalError("VALIDATION", "ระบบ CRM นี้ยังไม่ได้เปิดพอร์ทัลลูกค้า (หรือร้านใช้พอร์ทัลของอีกระบบหนึ่ง) — เปิดที่ตั้งค่า › พอร์ทัลลูกค้า ก่อนเชิญ");
  const co = await visibleCompany(ctx, a, input?.companyId);
  if (!co.live) throw new PortalError("VALIDATION", "บริษัทนี้ถูกเก็บหรือถูกรวมไปแล้ว จึงเชิญเข้าพอร์ทัลไม่ได้");
  const contactId = str(input?.contactId);
  const link = contactId
    ? await prisma.crmCompanyContact.findFirst({ where: { tenantId: ctx.tenantId, companyId: co.id, contactId, endedAt: null /* C5.4-B L1-M2 */, contact: { tenantId: ctx.tenantId, systemId: ctx.systemId } }, select: { contact: { select: { id: true, name: true, email: true, archivedAt: true, mergedIntoId: true } } } })
    : null;
  if (!link) throw new PortalError("NOT_FOUND", "ผู้ติดต่อคนนี้ไม่ได้อยู่ในบริษัทนี้ — เพิ่มเข้าบริษัทก่อนแล้วค่อยเชิญ");
  if (link.contact.archivedAt || link.contact.mergedIntoId) throw new PortalError("VALIDATION", "ผู้ติดต่อคนนี้ถูกเก็บหรือถูกรวมไปแล้ว จึงเชิญเข้าพอร์ทัลไม่ได้");
  const rawRole = input?.role;
  const role = isPortalRole(rawRole) ? rawRole : "VIEW";
  const methods = Array.isArray(input?.loginMethods) ? [...new Set(input.loginMethods.filter((m) => m === "EMAIL_OTP" || m === "LINE"))] : ["EMAIL_OTP", "LINE"];
  if (methods.length === 0) throw new PortalError("VALIDATION", "เลือกวิธีเข้าสู่ระบบอย่างน้อย 1 วิธี (อีเมล หรือ LINE)");
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { slug: true, name: true } });
  if (!tenant) throw new PortalError("NOT_FOUND", "ไม่พบร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  const access = await prisma.$transaction(async (tx) => {
    // รีวิว R2b-1: ล็อกผู้ติดต่อก่อนอย่างอื่นในธุรกรรม (กุญแจ/ลำดับเดียวกับ `switchCompany`) ⇒ การสลับบริษัทที่วิ่งชนกัน
    //   จบก่อน (session ใหม่ถูก commit แล้วโดนฆ่าข้างล่าง) หรือหลัง (เห็น session ต้นทางถูกฆ่าแล้ว ⇒ ปฏิเสธ) — ไม่มีทางรอด ◂
    await lockPortalContactInTx(tx, ctx.tenantId, contactId);
    // รีวิว RV2-5: "เชิญซ้ำ" = มีสิทธิ์ของ (บริษัท, ผู้ติดต่อ) นี้อยู่แล้ว — เชิญครั้งแรกเข้าบริษัทใหม่ไม่ใช่เหตุให้ออกจากบริษัทอื่น ◂
    const reinvite = !!(await tx.crmPortalAccess.findUnique({ where: { companyId_contactId: { companyId: co.id, contactId } }, select: { id: true } }));
    const row = await tx.crmPortalAccess.upsert({
      where: { companyId_contactId: { companyId: co.id, contactId } },
      create: { tenantId: ctx.tenantId, systemId: ctx.systemId, companyId: co.id, contactId, role, loginMethods: methods, invitedById: a.userId || null, invitedAt: now, inviteTokenHash: sha(token), inviteExpiresAt: expiresAt },
      update: { role, loginMethods: methods, invitedById: a.userId || null, invitedAt: now, inviteTokenHash: sha(token), inviteExpiresAt: expiresAt, revokedAt: null },
      select: { id: true, tenantId: true, systemId: true },
    });
    if (row.tenantId !== ctx.tenantId || row.systemId !== ctx.systemId) throw new PortalError("NOT_FOUND", "ไม่พบบริษัทนี้ในระบบ CRM ที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
    // CRM C5.5-fix2 ▸ hunter 2a-8: เชิญซ้ำ = เริ่มสิทธิ์ใหม่ ⇒ session ที่ยังเปิดอยู่ของสิทธิ์นี้ตายทันที (พนักงาน "ส่งคำเชิญใหม่" หลังลูกค้า
    //   แจ้งมือถือหาย/กล่องจดหมายถูกเจาะ ⇒ เครื่องเก่าต้องหลุด — เดิมอยู่ต่อจนหมดอายุ session) · ในธุรกรรมเดียวกับการหมุน hash ◂
    // รีวิว RV2-5: ผู้ติดต่อที่มีสิทธิ์หลายบริษัท — เครื่องที่หายถือ session ของบริษัทอื่นแล้ว `switchCompany` กลับมาบริษัทนี้ได้
    //   ⇒ ฆ่า session ที่ยังเปิดอยู่ **ทุกใบของผู้ติดต่อคนนี้** (ทุกบริษัทในร้านนี้) แบบเดียวกับ portal-identity เมื่อตัวตนเปลี่ยน ◂
    //   (เฉพาะการเชิญซ้ำ — เชิญครั้งแรกของบริษัทใหม่ไม่ฆ่า session ที่ผู้ติดต่อใช้อยู่กับบริษัทอื่น)
    const killed = reinvite
      ? await tx.portalSession.updateMany({ where: { tenantId: ctx.tenantId, crmContactId: contactId, revokedAt: null }, data: { revokedAt: now } })
      : { count: 0 };
    await tx.auditLog.create({ data: { tenantId: ctx.tenantId, actorType: "USER", actorId: a.userId || null, action: "crm.portal.invite", targetType: "CrmPortalAccess", targetId: row.id, after: { companyId: co.id, contactId, role, loginMethods: methods, expiresAt: expiresAt.toISOString(), sessionsRevoked: killed.count } } });
    return row;
  });
  const inviteUrl = `${appBase()}${portalPath(tenant.slug, "invite", token)}`;
  let emailed = false;
  const to = str(link.contact.email);
  if (to && methods.includes("EMAIL_OTP")) {
    try {
      const { sendEmail } = await import("@/lib/core/email");
      await sendEmail(
        to,
        `เชิญเข้าพอร์ทัลลูกค้า ${tenant.name}`,
        `เรียน คุณ${link.contact.name}\n\n${tenant.name} เชิญคุณเข้าใช้พอร์ทัลลูกค้าของบริษัท ${co.name} — ดู/ตอบรับใบเสนอราคา ชำระใบแจ้งหนี้ และแจ้งเรื่องได้ในที่เดียว\n\nเปิดลิงก์นี้เพื่อเริ่มใช้งาน:\n${inviteUrl}\n\nลิงก์ใช้ได้ 7 วัน · ใช้ได้ครั้งเดียว — หากลิงก์หมดอายุ ติดต่อ ${tenant.name} เพื่อขอลิงก์ใหม่`,
      );
      emailed = true;
    } catch {
      emailed = false;
    }
  }
  return { accessId: access.id, inviteUrl, expiresAt, emailed };
}

/** ถอนสิทธิ์ — session ทุกใบของ access นี้ตายทันที (และตัวอ่าน session เช็ค revokedAt ทุกคำขออยู่แล้ว) · audit `crm.portal.revoke` */
export async function revoke(ctx: PortalStaffCtx, actor: MemberActor, input: { accessId: string; reason?: string | null }): Promise<{ ok: true; sessionsRevoked: number }> {
  const a = await staff(ctx, actor);
  const id = str(input?.accessId);
  const row = id ? await prisma.crmPortalAccess.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, companyId: true } }) : null;
  if (!row) throw new PortalError("NOT_FOUND", "ไม่พบสิทธิ์พอร์ทัลนี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่");
  await visibleCompany(ctx, a, row.companyId);
  const now = new Date();
  const n = await prisma.$transaction(async (tx) => {
    await tx.crmPortalAccess.update({ where: { id: row.id }, data: { revokedAt: now, inviteTokenHash: null } });
    const s = await tx.portalSession.updateMany({ where: { portalAccessId: row.id, revokedAt: null }, data: { revokedAt: now } });
    await tx.auditLog.create({ data: { tenantId: ctx.tenantId, actorType: "USER", actorId: a.userId || null, action: "crm.portal.revoke", targetType: "CrmPortalAccess", targetId: row.id, after: { sessionsRevoked: s.count, ...(str(input?.reason) ? { reason: str(input?.reason).slice(0, 300) } : {}) } } });
    return s.count;
  });
  return { ok: true, sessionsRevoked: n };
}

export type PortalAccessRow = {
  id: string;
  contactId: string;
  contactName: string;
  role: string;
  loginMethods: string[];
  invitedAt: Date;
  acceptedAt: Date | null;
  lastLoginAt: Date | null;
  revokedAt: Date | null;
  inviteExpiresAt: Date | null;
  status: "ACTIVE" | "INVITED" | "EXPIRED" | "REVOKED";
};

/** ใครเข้าพอร์ทัลของบริษัทนี้ได้ (บล็อกในบริษัท 360) — ไม่มี hash/token */
export async function listAccess(ctx: PortalStaffCtx, actor: MemberActor, input: { companyId: string }): Promise<{ items: PortalAccessRow[]; portalEnabled: boolean }> {
  const a = await staff(ctx, actor);
  const co = await visibleCompany(ctx, a, input?.companyId);
  const [rows, settings, uiv] = await Promise.all([
    prisma.crmPortalAccess.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, companyId: co.id },
      orderBy: { invitedAt: "asc" },
      select: { id: true, contactId: true, role: true, loginMethods: true, invitedAt: true, acceptedAt: true, lastLoginAt: true, revokedAt: true, inviteExpiresAt: true, contact: { select: { name: true } } },
      take: 200,
    }),
    settingsOf(ctx.tenantId, ctx.systemId),
    prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId }, select: { settings: true } }),
  ]);
  const now = Date.now();
  return {
    portalEnabled: settings.enabled && portalLive(uiv?.settings ?? null),
    items: rows.map((r): PortalAccessRow => ({
      id: r.id,
      contactId: r.contactId,
      contactName: r.contact.name,
      role: String(r.role),
      loginMethods: r.loginMethods,
      invitedAt: r.invitedAt,
      acceptedAt: r.acceptedAt,
      lastLoginAt: r.lastLoginAt,
      revokedAt: r.revokedAt,
      inviteExpiresAt: r.inviteExpiresAt,
      // มติผู้คุมงาน S6: สถานะเดียวกับกติกาเข้าใช้ — ยังไม่รับ + คำเชิญยังไม่หมด = INVITED · หมด/ถูกล้าง (ตัวตนเปลี่ยน) = EXPIRED (ต้องเชิญใหม่)
      status: r.revokedAt ? "REVOKED" : r.acceptedAt ? "ACTIVE" : r.inviteExpiresAt && r.inviteExpiresAt.getTime() > now ? "INVITED" : "EXPIRED",
    })),
  };
}

export type PortalRequestStaffRow = PortalRequestDto & { contactId: string; contactName: string; approvalRequestId: string | null; kanbanCardId: string | null; payload: Record<string, unknown> };

/** คำขอของบริษัท (ฝั่งพนักงาน) — สถานะ + ลิงก์การ์ด/อนุมัติ */
export async function listCompanyRequests(ctx: PortalStaffCtx, actor: MemberActor, input: { companyId: string }): Promise<{ items: PortalRequestStaffRow[] }> {
  const a = await staff(ctx, actor);
  const co = await visibleCompany(ctx, a, input?.companyId);
  const rows = await prisma.crmPortalRequest.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, companyId: co.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, kind: true, payload: true, status: true, kanbanCardId: true, approvalRequestId: true, createdAt: true, contactId: true, contact: { select: { name: true } } },
  });
  const settings = await settingsOf(ctx.tenantId, ctx.systemId);
  const dtos = await requestDtos({ tenantId: ctx.tenantId, settings }, rows);
  return {
    items: rows.map((r, i) => ({ ...(dtos[i] as PortalRequestDto), contactId: r.contactId, contactName: r.contact.name, approvalRequestId: r.approvalRequestId, kanbanCardId: r.kanbanCardId, payload: isObj(r.payload) ? r.payload : {} })),
  };
}

/** ใช้ผลของคำขอ PROFILE_CHANGE (ค่าตัวอักษรของฟิลด์ `portalEditable`) — ภายใน tx ของการตัดสิน */
async function applyProfileChange(
  tx: Prisma.TransactionClient,
  req: { tenantId: string; systemId: string; companyId: string; payload: unknown },
  byUserId: string | null,
  strict = false,
): Promise<boolean> {
  const p = isObj(req.payload) ? req.payload : {};
  const recordId = str(p.recordId);
  const fieldKey = str(p.fieldKey);
  if (!recordId || !fieldKey) return false;
  // มติผู้คุมงาน S2: ตรวจซ้ำ ณ ตอนอนุมัติ — วัตถุยังเปิดพอร์ทัล · แม่ยังเป็นบริษัทของคำขอ · ฟิลด์ยังเห็นได้+แก้ได้ในพอร์ทัล · ไม่อ่อนไหว
  const rec = await tx.customRecord.findFirst({
    where: { id: recordId, tenantId: req.tenantId, systemId: req.systemId, parentType: "COMPANY", parentId: req.companyId, archivedAt: null, object: { portalVisible: true, archivedAt: null } },
    select: { id: true, object: { select: { key: true } } },
  });
  if (!rec) return false;
  const field = await tx.memberField.findFirst({ where: { tenantId: req.tenantId, systemId: req.systemId, objectKey: rec.object.key, key: fieldKey, portalVisible: true, portalEditable: true, sensitive: false, archivedAt: null }, select: { id: true, type: true } });
  if (!field || field.type === "FILE" || field.type === "LOOKUP") return false;
  // มติผู้คุมงานรอบ 4 (SF3): เขียนผ่านตัวออกแบบฟิลด์ใน tx นี้ (ตรวจค่าซ้ำอีกรอบ · ล็อกรายการ · ประวัติเมื่อฟิลด์เปิด trackHistory ·
  //   updatedById = พนักงานที่ตัดสิน) — ค่าใช้ไม่ได้แล้ว (ร้านเปลี่ยนกติกาฟิลด์หลังลูกค้าขอ) = ไม่เขียน (applied=false) ไม่ล้มทั้งการตัดสิน
  //   (ตัวตรวจของ engine โยนก่อนคำสั่งเขียนใด ๆ จึงไม่ทำให้ tx ของ Postgres เสีย)
  try {
    const m = await memberFacade();
    await m.fields.setFieldValues({ tenantId: req.tenantId, systemId: req.systemId, actorUserId: byUserId, objectKey: rec.object.key }, rec.id, { [fieldKey]: p.value ?? null }, { via: "STAFF", byUserId }, tx);
    return true;
  } catch (e) {
    // รอบ 5: พนักงานตัดสินเอง (strict) = บอกเหตุผลเป็นข้อความไทย (เช่น ค่าซ้ำกับรายการอื่น) และไม่อนุมัติ — ไม่ใช่ 500 ·
    //   ผลจากสายอนุมัติ (ไม่มีคนรอดูหน้าจอ) = ไม่เขียน (applied=false)
    if (strict) throw new PortalError("VALIDATION", e instanceof Error && /[ก-๙]/.test(e.message) ? `${e.message} — จึงอนุมัติคำขอนี้ไม่ได้` : "ค่าที่ลูกค้าขอใช้กับช่องนี้ไม่ได้แล้ว จึงอนุมัติคำขอนี้ไม่ได้");
    return false;
  }
}

/**
 * ผลของ "อนุมัติ" ที่ต้องเขียนใน tx เดียวกับการเปลี่ยนสถานะ:
 *   PROFILE_CHANGE → ค่าที่ขอของฟิลด์ portalEditable (ตรวจซ้ำทุกเงื่อนไข) ·
 *   CONTACT_CHANGE ที่ระบบสร้างจาก `loginWithLine` (`origin` ฝั่งเซิร์ฟเวอร์ + reason LINE_IDENTITY) → ผูก lineUserId แบบมีด่าน
 *   (ผู้ติดต่อยังไม่มี LINE และไม่มีผู้ติดต่ออื่นในระบบนี้ใช้ LINE นี้อยู่) — ลูกค้าปลอมคำขอแบบนี้ไม่ได้เพราะ `cleanPayload` ทิ้งคีย์สงวน
 */
async function applyApprovedInTx(
  tx: Prisma.TransactionClient,
  req: { tenantId: string; systemId: string; companyId: string; contactId: string; kind: string; payload: unknown },
  byUserId: string | null,
  strict = false,
): Promise<boolean> {
  if (req.kind === "PROFILE_CHANGE") return applyProfileChange(tx, req, byUserId, strict);
  if (req.kind !== "CONTACT_CHANGE") return false;
  const p = isObj(req.payload) ? req.payload : {};
  const lineUserId = str(p.lineUserId);
  if (p.origin !== LINE_LOGIN_ORIGIN || p.reason !== "LINE_IDENTITY" || !lineUserId) return false;
  return bindPortalLineUserIdInTx(tx, { tenantId: req.tenantId, systemId: req.systemId, contactId: req.contactId, lineUserId });
}

/**
 * พนักงานตัดสินคำขอเอง — เฉพาะที่ยัง PENDING · audit `crm.portal.request.decide`
 * มติผู้คุมงาน S3: คำขอที่อยู่ในสายอนุมัติกลาง (`approvalRequestId`) — **อนุมัติ** ต้องทำในกล่องคำขออนุมัติ (ห้ามข้ามสาย) ·
 *   **ไม่อนุมัติ** = ยกเลิกผ่านเครื่องยนต์อนุมัติก่อน (`cancelRequest` · ได้ก็ต่อเมื่อสายยัง PENDING) แล้วจึงปิดคำขอ ·
 *   ตัดสินตรงได้เต็มรูปเฉพาะคำขอที่ไม่มีสายอนุมัติ (ไม่มี policy)
 */
export async function decideRequest(
  ctx: PortalStaffCtx,
  actor: MemberActor,
  input: { requestId: string; approve: boolean; reason?: string | null },
): Promise<{ ok: true; status: "APPROVED" | "REJECTED"; applied: boolean }> {
  const a = await staff(ctx, actor);
  const id = str(input?.requestId);
  const req = id ? await prisma.crmPortalRequest.findFirst({ where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, companyId: true, contactId: true, kind: true, payload: true, status: true, approvalRequestId: true } }) : null;
  if (!req) throw new PortalError("NOT_FOUND", "ไม่พบคำขอนี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่");
  await visibleCompany(ctx, a, req.companyId);
  if (req.status !== "PENDING") throw new PortalError("CONFLICT", "คำขอนี้ได้รับการตัดสินไปแล้ว — รีเฟรชหน้าเพื่อดูสถานะล่าสุด");
  const approve = input?.approve === true;
  const inbox = "คำขอนี้อยู่ในสายอนุมัติของร้าน — อนุมัติได้ที่เมนู “คำขออนุมัติ” (ผู้อนุมัติตามสาย) เพื่อให้ขั้นอนุมัติครบถ้วน";
  let via: "DIRECT" | "APPROVAL_CANCEL" | "APPROVAL_CANCELLED" = "DIRECT";
  if (req.approvalRequestId) {
    // รอบ 5 (กันคำขอค้าง PENDING): อ่านสถานะใบอนุมัติก่อนเสมอ — ไม่ยื่นใหม่ในกรณีนี้
    const ar = await prisma.approvalRequest.findFirst({ where: { id: req.approvalRequestId, tenantId: ctx.tenantId }, select: { status: true } });
    const arStatus = String(ar?.status ?? "");
    if (arStatus === "APPROVED" || arStatus === "REJECTED") {
      // สายตัดสินแล้วแต่ผลยังไม่ถึงคำขอ (event ค้าง/ล้ม) ⇒ ปรับตามผลของสาย (ทางเดียวกับตัวรับ event) — พนักงานตัดสินทับไม่ได้
      await onApprovalDecided({ tenantId: ctx.tenantId, approvalRequestId: req.approvalRequestId, requestId: req.id, approved: arStatus === "APPROVED" });
      throw new PortalError("CONFLICT", `สายอนุมัติตัดสินคำขอนี้แล้ว (${arStatus === "APPROVED" ? "อนุมัติ" : "ไม่อนุมัติ"}) — ระบบปรับสถานะให้ตรงแล้ว รีเฟรชหน้าเพื่อดู`);
    }
    if (arStatus === "CANCELLED" || !ar) {
      // ใบอนุมัติถูกยกเลิก (หรือหายไป) ⇒ ปฏิเสธตรงได้ · อนุมัติไม่ได้ (ไม่ยื่นซ้ำ — ให้ลูกค้าส่งคำขอใหม่)
      if (approve) throw new PortalError("FORBIDDEN", "สายอนุมัติของคำขอนี้ถูกยกเลิกไปแล้ว จึงอนุมัติไม่ได้ — ปฏิเสธคำขอนี้แล้วให้ลูกค้าส่งคำขอใหม่");
      via = "APPROVAL_CANCELLED";
    } else {
      if (approve) throw new PortalError("FORBIDDEN", inbox);
      const cancelled = await (await approvalFacade()).cancelRequest({ tenantId: ctx.tenantId }, req.approvalRequestId).catch(() => false);
      if (!cancelled) throw new PortalError("CONFLICT", "สายอนุมัติของคำขอนี้ตัดสินไปแล้วหรือกำลังดำเนินการ — รีเฟรชหน้าเพื่อดูสถานะล่าสุด");
      via = "APPROVAL_CANCEL";
    }
  } else if (approve && portalRequestRoute(req.kind as PortalRequestKind) === "APPROVAL") {
    // SF5 (+ รอบ 5): ชนิดที่ต้องผ่านสายแต่ยังไม่มีใบ ⇒ ยื่นใหม่ **เฉพาะตอนจะอนุมัติ** ในนามผู้ติดต่อ (เหมือนตอนสร้าง — ไม่ใช่พนักงาน)
    //   ตัดสินตรงได้ก็ต่อเมื่อเครื่องยนต์ตอบ `autoApproved` (ไม่มีสายที่ใช้กับคำขอนี้) · ยื่นล้ม = WARN + CONFLICT (ไม่กลืนเงียบ)
    let sub: { autoApproved: true } | { requestId: string };
    try {
      sub = await (await approvalFacade()).submitForApproval({ tenantId: ctx.tenantId }, { entityType: PORTAL_APPROVAL_ENTITY, entityId: req.id, systemId: ctx.systemId, requestedById: `crm-portal:${req.contactId}` });
    } catch {
      await logOps("WARN", "crm.portal", `ยื่นคำขอพอร์ทัลเข้าสายอนุมัติไม่สำเร็จ — คำขอ ${req.id}`, { tenantId: ctx.tenantId }).catch(() => undefined);
      throw new PortalError("CONFLICT", "ส่งคำขอนี้เข้าสายอนุมัติของร้านไม่สำเร็จในตอนนี้ — ลองใหม่อีกครั้งในอีกสักครู่");
    }
    if ("requestId" in sub) {
      await prisma.crmPortalRequest.updateMany({ where: { id: req.id, tenantId: ctx.tenantId }, data: { approvalRequestId: sub.requestId } });
      throw new PortalError("FORBIDDEN", inbox);
    }
  }
  const status = approve ? "APPROVED" : "REJECTED";
  const now = new Date();
  const res = await prisma.$transaction(async (tx) => {
    const r = await tx.crmPortalRequest.updateMany({ where: { id: req.id, status: "PENDING" }, data: { status, decidedAt: now, decidedById: a.userId || null } });
    if (r.count !== 1) return null;
    const applied = approve ? await applyApprovedInTx(tx, { tenantId: ctx.tenantId, systemId: ctx.systemId, companyId: req.companyId, contactId: req.contactId, kind: req.kind, payload: req.payload }, a.userId || null, true) : false;
    await tx.auditLog.create({ data: { tenantId: ctx.tenantId, actorType: "USER", actorId: a.userId || null, action: "crm.portal.request.decide", targetType: "CrmPortalRequest", targetId: req.id, after: { status, applied, via, ...(str(input?.reason) ? { reason: str(input?.reason).slice(0, 300) } : {}) } } });
    return { applied };
  });
  if (!res) throw new PortalError("CONFLICT", "คำขอนี้ได้รับการตัดสินไปแล้ว — รีเฟรชหน้าเพื่อดูสถานะล่าสุด");
  return { ok: true, status, applied: res.applied };
}

/**
 * ตัวรับผลสายอนุมัติ `crm.portal_request` (เรียกจาก `approval-effects.ts` — ขั้นแรกที่ retry ได้ของ approval.request.approved|rejected)
 * มติผู้คุมงาน S7: ต้องมี requestId และ `approvalRequestId` ของคำขอ **ตรงกันเป๊ะ** กับใบที่ตัดสิน · ระบบต้องยังเปิดพอร์ทัล (uiVersion 2 + enabled)
 * AUDIT-CLASS X4: เขียนเฉพาะคำขอที่ยัง PENDING ⇒ ส่งซ้ำ/พร้อมกัน = ไม่มีผลเพิ่ม (audit ใบเดียว)
 */
export async function onApprovalDecided(evt: { tenantId: string; approvalRequestId: string; requestId: string; approved: boolean }): Promise<void> {
  const id = str(evt?.requestId);
  const approvalId = str(evt?.approvalRequestId);
  if (!id || !approvalId || !evt?.tenantId) return;
  const req = await prisma.crmPortalRequest.findFirst({ where: { id, tenantId: evt.tenantId }, select: { id: true, systemId: true, companyId: true, contactId: true, kind: true, payload: true, status: true, approvalRequestId: true } });
  if (!req || req.status !== "PENDING" || req.approvalRequestId !== approvalId) return;
  const sys = await prisma.appSystem.findFirst({ where: { id: req.systemId, tenantId: evt.tenantId, type: "CRM" }, select: { settings: true } });
  if (!sys || !portalLive(sys.settings)) {
    // มติผู้คุมงานรอบ 4–5: ร้านปิดพอร์ทัล = ไม่กลืนผลอนุมัติ — คำขอคง PENDING + WARN (id ล้วน) แล้ว **โยนข้อผิดพลาดที่ retry ได้**
    //   ⇒ outbox ส่ง event ใหม่ตามรอบถอยของตัวระบายคิว (attempts++ · หน่วง 2^n นาที · ครบ 5 ครั้ง = FAILED ให้คนดู) — ถ้าร้านเปิดพอร์ทัลกลับ
    //   ภายในรอบนั้น ผลจะถูกใช้เอง · ไม่งั้นพนักงานปรับได้จากหน้าบริษัท (`decideRequest` อ่านสถานะใบอนุมัติแล้วปรับตาม)
    await logOps("WARN", "crm.portal", `ผลอนุมัติคำขอพอร์ทัลยังไม่ถูกใช้เพราะพอร์ทัลของระบบนี้ปิดอยู่ — คำขอ ${req.id} · ใบอนุมัติ ${approvalId}`, { tenantId: evt.tenantId }).catch(() => undefined);
    throw new PortalRetryableError(`portal disabled — request ${req.id} kept PENDING (approval ${approvalId})`);
  }
  const status = evt.approved ? "APPROVED" : "REJECTED";
  // ผู้ตัดสินคนสุดท้ายของสายอนุมัติ = updatedById ของค่าที่เขียน (SF3)
  const decider = (await prisma.approvalDecision.findFirst({ where: { requestId: approvalId, tenantId: evt.tenantId }, orderBy: { createdAt: "desc" }, select: { decidedById: true } }).catch(() => null))?.decidedById ?? null;
  await prisma.$transaction(async (tx) => {
    const r = await tx.crmPortalRequest.updateMany({ where: { id: req.id, status: "PENDING", approvalRequestId: approvalId }, data: { status, decidedAt: new Date() } });
    if (r.count !== 1) return;
    const applied = evt.approved ? await applyApprovedInTx(tx, { tenantId: evt.tenantId, systemId: req.systemId, companyId: req.companyId, contactId: req.contactId, kind: req.kind, payload: req.payload }, decider) : false;
    await auditSystem(tx, evt.tenantId, "crm.portal.request.decide", "CrmPortalRequest", req.id, { status, applied, approvalRequestId: approvalId });
  });
}

/**
 * PDPA (C3.9 เป็นเจ้าของการลบทั้งกระบวน — ฟังก์ชันนี้คือส่วนของพอร์ทัล): ลบสิทธิ์พอร์ทัล (session ตาม cascade) และคำขอทั้งหมดของผู้ติดต่อ
 * ในระบบ CRM นี้ · มติผู้คุมงาน S8: ยกเลิกคำขออนุมัติที่ค้างของคำขอเหล่านั้นผ่านเครื่องยนต์อนุมัติ + ล้างข้อความการ์ดบอร์ดงานที่เปิดจากคำขอ
 * (หัวข้อ → "ลบตามคำขอ PDPA" · คำอธิบายว่าง · sourceKey คงไว้กันเปิดซ้ำ) · ไม่มี actor · ร้านอื่น/ระบบอื่น = ไม่แตะ
 */
export async function eraseContact(ctx: PortalStaffCtx, contactId: string): Promise<{ accesses: number; sessions: number; requests: number; approvalsCancelled: number; cardsRedacted: number }> {
  const id = str(contactId);
  const sys = ctx?.tenantId && ctx?.systemId ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } }) : null;
  if (!sys || !id) throw new PortalError("NOT_FOUND", "ไม่พบระบบ CRM หรือผู้ติดต่อนี้ในร้านที่เปิดอยู่");
  const reqs = await prisma.crmPortalRequest.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, contactId: id }, select: { id: true, approvalRequestId: true, kanbanCardId: true }, take: 5_000 });
  let approvalsCancelled = 0;
  const ap = await approvalFacade();
  for (const r of reqs) {
    if (r.approvalRequestId && (await ap.cancelRequest({ tenantId: ctx.tenantId }, r.approvalRequestId).catch(() => false))) approvalsCancelled += 1;
  }
  const cardIds = reqs.map((r) => r.kanbanCardId).filter((x): x is string => !!x);
  const kb = await kanbanLinks();
  return prisma.$transaction(async (tx) => {
    // รีวิว C3.9-fix S1: การ์ดของคำขอถูกล้างผ่าน facade บอร์ดงาน (หัว · รายละเอียด · ความเห็น · ประวัติ) — portal.ts ไม่เขียนตารางบอร์ดงานเอง
    const cards = { count: cardIds.length ? (await kb.redactCardsInTx(tx, ctx.tenantId, cardIds, { title: PORTAL_CARD_ERASED_TITLE, sourceKeyPrefix: PORTAL_CARD_SOURCE_PREFIX })).cards : 0 };
    const accessIds = (await tx.crmPortalAccess.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, contactId: id }, select: { id: true }, take: 1_000 })).map((r) => r.id);
    const sessions = accessIds.length ? await tx.portalSession.deleteMany({ where: { tenantId: ctx.tenantId, portalAccessId: { in: accessIds } } }) : { count: 0 };
    const requests = await tx.crmPortalRequest.deleteMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, contactId: id } });
    const accesses = await tx.crmPortalAccess.deleteMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, contactId: id } });
    await tx.auditLog.create({ data: { tenantId: ctx.tenantId, actorType: ctx.actorUserId ? "USER" : "SYSTEM", actorId: ctx.actorUserId ?? null, action: "crm.portal.erase", targetType: "CrmContact", targetId: id, after: { accesses: accesses.count, sessions: sessions.count, requests: requests.count, approvalsCancelled, cardsRedacted: cards.count } } });
    return { accesses: accesses.count, sessions: sessions.count, requests: requests.count, approvalsCancelled, cardsRedacted: cards.count };
  });
}

// CRM C3.9-fix ▸ รีวิว S1: ป้ายของการ์ดคำขอที่ถูกลบ + prefix ของ sourceKey ที่พอร์ทัลใช้เปิดการ์ด (facade บอร์ดงานแตะเฉพาะการ์ดที่ขึ้นต้นด้วยค่านี้) ◂
const PORTAL_CARD_ERASED_TITLE = "ลบตามคำขอ PDPA";
const PORTAL_CARD_SOURCE_PREFIX = portalCardSourceKey("");

// CRM C3.9 ▸ ส่วนของพอร์ทัลในการลบตาม PDPA — แยกเป็น 2 ขั้น (รีวิว C3.9 B3 · มติผู้คุมงาน):
//   `eraseContactInTx` = แถวทั้งหมด (session · คำขอ · สิทธิ์ · ชื่อการ์ดบอร์ดงานของคำขอ) ใน tx ของการลบ ⇒ ข้อมูลหายพร้อมการลบ ไม่มีช่วงค้าง
//   `cancelErasedApprovals` = ยกเลิกคำขออนุมัติของคำขอเหล่านั้น (ข้ามโมดูล · นอก tx) — ผู้เรียก = ตัวรับ `crm.contact.erased` (retry ได้ · idempotent)
//   `eraseContact` เดิมยังอยู่ให้ผู้เรียกเก่า (ทางเดียวกัน ทำครบในคราวเดียว)
export async function eraseContactInTx(
  tx: Prisma.TransactionClient,
  ctx: { tenantId: string; systemId: string },
  contactIds: readonly string[],
  opts?: { mask?: ((text: string) => string) | null },
): Promise<{ accesses: number; sessions: number; requests: number; cardsRedacted: number; approvalRequestIds: string[] }> {
  const ids = [...new Set(contactIds.filter(Boolean))];
  if (ids.length === 0) return { accesses: 0, sessions: 0, requests: 0, cardsRedacted: 0, approvalRequestIds: [] };
  const reqs = await tx.crmPortalRequest.findMany({ where: { tenantId: ctx.tenantId, contactId: { in: ids } }, select: { approvalRequestId: true, kanbanCardId: true }, take: 5_000 });
  const cardIds = reqs.map((r) => r.kanbanCardId).filter((x): x is string => !!x);
  // รีวิว C3.9-fix S1: ผ่าน facade บอร์ดงาน · `mask` = ตัวปิดคำระบุตัวของการลบ (privacy.ts) ⇒ ความเห็น/ประวัติของการ์ดคำขอถูกปิดด้วยคำชุดเดียวกัน
  const cards = { count: cardIds.length ? (await (await kanbanLinks()).redactCardsInTx(tx, ctx.tenantId, cardIds, { title: PORTAL_CARD_ERASED_TITLE, sourceKeyPrefix: PORTAL_CARD_SOURCE_PREFIX, mask: opts?.mask ?? null })).cards : 0 };
  const accessIds = (await tx.crmPortalAccess.findMany({ where: { tenantId: ctx.tenantId, contactId: { in: ids } }, select: { id: true }, take: 1_000 })).map((r) => r.id);
  const sessions = await tx.portalSession.deleteMany({ where: { tenantId: ctx.tenantId, OR: [{ crmContactId: { in: ids } }, ...(accessIds.length ? [{ portalAccessId: { in: accessIds } }] : [])] } });
  const requests = await tx.crmPortalRequest.deleteMany({ where: { tenantId: ctx.tenantId, contactId: { in: ids } } });
  const accesses = await tx.crmPortalAccess.deleteMany({ where: { tenantId: ctx.tenantId, contactId: { in: ids } } });
  return {
    accesses: accesses.count,
    sessions: sessions.count,
    requests: requests.count,
    cardsRedacted: cards.count,
    approvalRequestIds: reqs.map((r) => r.approvalRequestId).filter((x): x is string => !!x),
  };
}

/** ยกเลิกคำขออนุมัติของคำขอพอร์ทัลที่ถูกลบ (ขั้นหลัง commit ของการลบ PDPA) — คำขอที่ปิดไปแล้ว = ข้าม (idempotent) */
export async function cancelErasedApprovals(tenantId: string, approvalRequestIds: readonly string[]): Promise<number> {
  if (!approvalRequestIds.length) return 0;
  const ap = await approvalFacade();
  let n = 0;
  for (const id of approvalRequestIds) if (await ap.cancelRequest({ tenantId }, id)) n += 1; // ล้ม = โยนต่อ ⇒ event ถูกส่งใหม่
  return n;
}
// ◂ CRM C3.9

// ── ตั้งค่าพอร์ทัลของระบบ (`settings.crm.portal`) — jsonb_set คำสั่งเดียว (ไม่ read-modify-write ทั้งก้อน) ──

export async function getPortalSettings(ctx: PortalStaffCtx, actor: MemberActor): Promise<PortalSettings & { slug: string; boards: { id: string; name: string }[] }> {
  const a = await staff(ctx, actor);
  const [settings, tenant, boards] = await Promise.all([
    settingsOf(ctx.tenantId, ctx.systemId),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { slug: true } }),
    boardsVisibleTo(ctx.tenantId, a),
  ]);
  return { ...settings, slug: tenant?.slug ?? "", boards };
}

/** บอร์ดงานที่พนักงานคนนี้มองเห็น (ด่านการมองเห็นของโมดูลบอร์ดงานเอง · มติผู้คุมงานรอบ 3) */
async function boardsVisibleTo(tenantId: string, a: MemberActor, boardId?: string | null): Promise<{ id: string; name: string }[]> {
  if (a.role === "CUSTOMER") return [];
  const L = await kanbanLinks();
  const rows = await L.visibleBoardOptions(tenantId, { userId: a.userId, role: a.role, unitAccess: a.unitAccess, permissions: a.permissions }, boardId ? { boardId } : {});
  return rows.map((b) => ({ id: b.id, name: b.name }));
}

export async function savePortalSettings(
  ctx: PortalStaffCtx,
  actor: MemberActor,
  input: { enabled: boolean; loginMethods: string[]; showDeals: boolean; allowIssue: boolean; issueBoardId: string | null },
): Promise<PortalSettings> {
  const a = await staff(ctx, actor);
  const methods = [...new Set((input?.loginMethods ?? []).filter((m) => m === "EMAIL_OTP" || m === "LINE"))];
  if (methods.length === 0) throw new PortalError("VALIDATION", "เลือกวิธีเข้าสู่ระบบอย่างน้อย 1 วิธี (อีเมล หรือ LINE)");
  const boardId = str(input?.issueBoardId) || null;
  if (boardId && (await boardsVisibleTo(ctx.tenantId, a, boardId)).length === 0) {
    throw new PortalError("VALIDATION", "ไม่พบบอร์ดงานที่เลือก (อาจถูกเก็บแล้ว) — เลือกบอร์ดใหม่");
  }
  const before = await settingsOf(ctx.tenantId, ctx.systemId);
  const next = { enabled: input?.enabled === true, loginMethods: methods, showDeals: input?.showDeals === true, allowIssue: input?.allowIssue !== false, issueBoardId: boardId, statusMap: before.statusMap };
  const n = await prisma.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END)
        || jsonb_build_object('portal',
             (CASE WHEN jsonb_typeof("settings"->'crm'->'portal') = 'object' THEN "settings"->'crm'->'portal' ELSE '{}'::jsonb END)
               || ${JSON.stringify(next)}::jsonb),
      true)
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND "type" = 'CRM'`;
  if (n === 0) throw new PortalError("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้าน");
  await prisma.auditLog.create({ data: { tenantId: ctx.tenantId, actorType: "USER", actorId: a.userId || null, action: "crm.portal.settings", targetType: "AppSystem", targetId: ctx.systemId, before: before as never, after: next as never } });
  return settingsOf(ctx.tenantId, ctx.systemId);
}

// ── ตัวรับ event ของพอร์ทัล (สะพาน `crm-bridges/portal.ts` เรียกผ่าน facade) ──

/**
 * `crm.portal.quote.responded` / `crm.portal.request.created` → กิจกรรมชนิด PORTAL 1 ใบบนผู้ติดต่อ (ร้านเห็นในไทม์ไลน์) ·
 * `crm.portal.viewed` = ไม่สร้างอะไร (เปิดดูรายวันไม่ใช่กิจกรรมที่ต้องบันทึก — มีไว้ให้กฎอัตโนมัติ/เว็บฮุค)
 * AUDIT-CLASS X4: กุญแจ = idempotencyKey ของ event (`sourceRef`) ใต้ advisory lock ของ tx ⇒ ส่งซ้ำ/พร้อมกันกี่รอบ = กิจกรรมใบเดียว
 * AUDIT-CLASS X8: หัวข้อกิจกรรมไม่มีเหตุผลที่ลูกค้าพิมพ์ (เหตุผลอยู่ใน audit ของเอกสารบัญชี)
 */
export async function onPortalEvent(evt: { id?: string; tenantId: string; type: string; payload: unknown; systemId?: string | null }): Promise<void> {
  if (evt.type !== "crm.portal.quote.responded" && evt.type !== "crm.portal.request.created") return;
  const p = isObj(evt.payload) ? evt.payload : {};
  const contactId = str(p.contactId);
  const companyId = str(p.companyId);
  if (!contactId || !evt.tenantId) return;
  const contact = await prisma.crmContact.findFirst({ where: { id: contactId, tenantId: evt.tenantId }, select: { id: true, systemId: true, ownerUserId: true } });
  if (!contact) return;
  const ref = evt.type === "crm.portal.quote.responded" ? `crm.portal.quote.responded#${str(p.docId)}` : `crm.portal.request.created#${str(p.requestId)}`;
  const title =
    evt.type === "crm.portal.quote.responded"
      ? p.action === "ACCEPT"
        ? "ลูกค้าตอบรับใบเสนอราคาผ่านพอร์ทัล"
        : "ลูกค้าปฏิเสธใบเสนอราคาผ่านพอร์ทัล"
      : `ลูกค้าส่งคำขอผ่านพอร์ทัล (${PORTAL_REQUEST_KIND_LABEL[str(p.kind) as PortalRequestKind] ?? "คำขอ"})`;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${evt.tenantId}:${ref}`}))`;
    const exists = await tx.crmActivity.findFirst({ where: { tenantId: evt.tenantId, systemId: contact.systemId, source: "PORTAL", sourceRef: ref }, select: { id: true } });
    if (exists) return;
    const now = new Date();
    await tx.crmActivity.create({
      data: { tenantId: evt.tenantId, systemId: contact.systemId, contactId: contact.id, companyId: companyId || null, type: "PORTAL", title, source: "PORTAL", sourceRef: ref, startAt: now, doneAt: now, ownerUserId: contact.ownerUserId ?? null },
    });
  });
}

/** ข้อมูลของเปลือกหน้า (หัว/ตัวสลับบริษัท) — ชื่อบริษัทอื่นของคนเดียวกันมาทางนี้ทางเดียว */
export async function frameData(token: string): Promise<{ companyName: string; shopName: string; meName: string; role: string; currentCompanyId: string; companies: PortalCompanyRef[]; settings: PortalSettings }> {
  const [m, cs, sc] = await Promise.all([me(token), myCompanies(token), scope(token)]);
  return { companyName: m.company.name, shopName: m.shopName, meName: m.name, role: m.role, currentCompanyId: cs.current, companies: cs.items, settings: sc.settings };
}

/** ค่าตั้งของพอร์ทัลของร้าน (หน้าเข้าสู่ระบบ/รับคำเชิญ — วิธีเข้าที่ร้านเปิด) */
export async function shopSettings(shop: PortalShop): Promise<PortalSettings> {
  return settingsOf(shop.tenantId, shop.systemId);
}

// ── nonce ของการเข้าด้วย LINE (มติผู้คุมงานรอบ 4) ──
//   คุกกี้ `__Host-shark_portal_ln` (กติกา APP_ENV เดียวกับคุกกี้ session) เก็บ `<exp>.<HMAC(nonce|slug|exp)>` — ไม่เก็บ nonce ดิบ ·
//   ผูก slug (ใช้ข้ามร้านไม่ได้) · หมดอายุฝั่งเซิร์ฟเวอร์ 10 นาที (ไม่พึ่ง maxAge ของเบราว์เซอร์) · route ลบทิ้งทันทีที่ตรวจ (ใช้ครั้งเดียว)
export function lineNonceCookieName(): string {
  return appRequiresSecureCookies() ? "__Host-shark_portal_ln" : "shark_portal_ln";
}
function lineNonceMac(nonce: string, slug: string, exp: number): string {
  return createHmac("sha256", `portal-line-nonce:v1:${process.env.SESSION_SECRET ?? ""}`).update(`${nonce}|${slug}|${exp}`).digest("hex");
}
/** ออก nonce ใหม่ของ slug นี้ → `{ nonce (ให้หน้าเว็บ), cookieName, cookieValue (ให้ตั้งคุกกี้ httpOnly), maxAge }` */
export function lineNonceIssue(slug: string): { nonce: string; cookieName: string; cookieValue: string; maxAge: number } {
  if (!portalSecretReady()) throw new PortalError("CONFLICT", "พอร์ทัลลูกค้ายังไม่พร้อมใช้งาน — ลองใหม่ภายหลัง");
  const nonce = randomBytes(24).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + PORTAL_LINE_NONCE_TTL_SEC;
  return { nonce, cookieName: lineNonceCookieName(), cookieValue: `${exp}.${lineNonceMac(nonce, str(slug), exp)}`, maxAge: PORTAL_LINE_NONCE_TTL_SEC };
}
/** ตรวจ nonce ที่หน้าเว็บส่งมากับค่าในคุกกี้ — slug ต้องตรง · ยังไม่หมดอายุ · ลายเซ็นตรง (เทียบแบบเวลาคงที่) */
export function lineNonceVerify(slug: string, nonce: string, cookieValue: string): boolean {
  const m = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(str(cookieValue));
  const n = str(nonce);
  if (!m || n.length < 16 || !portalSecretReady()) return false;
  const exp = Number(m[1]);
  const now = Math.floor(Date.now() / 1000);
  // ยอมนาฬิกาคลาดได้ 60 วินาที (ทั้งสองทาง) — มติผู้คุมงานรอบ 5
  if (!Number.isSafeInteger(exp) || exp + 60 <= now || exp - now > PORTAL_LINE_NONCE_TTL_SEC + 60) return false;
  const want = Buffer.from(lineNonceMac(n, str(slug), exp), "hex");
  const got = Buffer.from(m[2]!, "hex");
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * ใช้ nonce ของ LINE **ครั้งเดียวจริง** (มติผู้คุมงานรอบ 5): ตรวจลายเซ็น/อายุ แล้วจองในถัง `portal-line-nonce:<sha256(คุกกี้)>`
 * เพดาน 1 ครั้ง/10 นาที บน `checkRateLimitDb` (ตารางกลาง ทุก instance เห็นเหมือนกัน) — คุกกี้เดิมที่ถูกส่งซ้ำ = ปฏิเสธ
 * (การลบคุกกี้ฝั่งเบราว์เซอร์เป็นแค่ความสะอาด ไม่ใช่ด่าน)
 */
export async function lineNonceConsume(slug: string, nonce: string, cookieValue: string): Promise<boolean> {
  if (!lineNonceVerify(slug, nonce, cookieValue)) return false;
  const r = await checkRateLimitDb(`portal-line-nonce:${sha(str(cookieValue))}`, { limit: 1, windowMs: 600_000 });
  return r.ok;
}
