// ข้อมูลกิจการ "ตั้งค่ากิจการ" ของแอปเลขา (14 พ.ย. 2026 · แบบ bizgear Ⓑ) — อ่าน/แก้ในนามกิจการจากด่าน (x-tenant-id)
//
// 🔴 ไม่มีที่เก็บใหม่ของข้อมูลที่มีอยู่แล้ว — ทุกช่องอ่าน/เขียน "แหล่งความจริงเดิม" ของมัน:
//   ชื่อ          = Tenant.name (ตัวเดียวกับ /tenant/rename ของเว็บ · เปลี่ยนได้เฉพาะ OWNER · 2–60 ตัว แบบ createTenantFromApp)
//   โลโก้         = TenantBranding.logoUrl ผ่าน `setBranding` (ล้างแคชธีม + AuditLog branding.updated + outbox เดิม)
//   ประเภทธุรกิจ  = Tenant.businessType (คอลัมน์ใหม่ migration `secretary_bizprofile` — ไม่เคยมีที่เก็บ)
//   ที่อยู่ · เบอร์ · เลขผู้เสียภาษี · สาขา = AccountSettings ของสมุดบัญชีหลัก (สมุด ACCOUNT ที่เปิดอยู่ตัวแรก) —
//       ชุดเดียวกับที่พิมพ์บนใบเสร็จ/ใบกำกับ (ม.86/4: ชื่อ ที่อยู่ เลขผู้เสียภาษี สาขา ของผู้ขาย) · ร้านไม่มีสมุดบัญชี = แก้ไม่ได้ (books: null)
//       เขียนแบบ read-merge-write (`getSettings` → ทับเฉพาะช่องที่ส่ง → `saveSettings`) — saveSettings แทนทั้งก้อน (กับดักเดียวกับ REST settings.update)
//   เวลาทำการ    = ChatSetting.businessHours ของระบบแชทหลัก (ตัวที่ "ตอบลูกค้านอกเวลา" ใช้ตัดสิน) ผ่าน `validateBusinessHours`/`setBusinessHours` เดิม
//       ร้านไม่มีระบบแชท = แก้ไม่ได้ (hours.available: false) · ส่ง days: [] = ล้างเวลาทำการ (null · ลูกค้าไม่เห็นบรรทัดเวลา)
// สิทธิ์: ด่านของ route = OWNER/MANAGER ของกิจการนั้น (อื่น ๆ 403) · ชื่อกิจการ = OWNER เท่านั้น (กติกาเดิมของเว็บ)
//   ช่องบนเอกสาร (ที่อยู่/เบอร์/เลขภาษี/สาขา) = สิทธิ์ `account.settings.manage` ตัวเดียวกับหน้า "ข้อมูลกิจการ" ของเว็บ
//   (saveSettingsAction · REST settings.update) ผ่าน `accountCanMember` (ตาราง IMPLIES เดียวกัน) — ไม่ผ่าน = 403 · GET ส่ง `can.editTax`
// เลขผู้เสียภาษี: ตัวเลข 13 หลัก + หลักตรวจ mod-11 (isValidThaiTaxIdChecksum ตัวเดียวกับใบกำกับ POS) · สาขา 5 หลัก (00000 = สำนักงานใหญ่)
// ห้าม import next/* (ถูกเรียกจาก route + ข้อสอบนอก Next context)
import { prisma } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { getBranding, invalidateBrandingCache, setBranding } from "@/lib/branding/service";
import { getSettings, saveSettings, type AccountSettingsView } from "@/lib/modules/account/service";
import { setBusinessHours } from "@/lib/modules/chat/service";
import { readBusinessHours, validateBusinessHours, type BusinessDay } from "@/lib/modules/chat/business-hours";
import { isValidThaiTaxIdChecksum } from "@/lib/modules/pos/tax-invoice-shared";
import { accountCanMember } from "@/lib/modules/account/access";
import type { MembershipCtx } from "@/lib/core/rbac";
import { TENANT_TYPES, type TenantType } from "@/lib/mobile/tenants";

export const BIZ_NAME_MIN = 2;
export const BIZ_NAME_MAX = 60;
const ADDRESS_MAX = 500;
const PHONE_MAX = 40;
const BRANCH_NAME_MAX = 120;
export const HQ_BRANCH = "00000";
/** บทบาทที่เปิดตั้งค่ากิจการได้ (ด่านของ route secretary/business/**) */
export const BIZ_ROLES: ReadonlySet<string> = new Set(["OWNER", "MANAGER"]);
export const BIZ_DENY = "ตั้งค่ากิจการได้เฉพาะเจ้าของหรือผู้จัดการของกิจการนี้";

/** ข้อผิดพลาดตามกติกา (ข้อความไทยให้ผู้ใช้ · route ตอบ 400) */
export class BusinessProfileError extends Error {}
/** ทำได้เฉพาะเจ้าของ (route ตอบ 403) */
export class BusinessProfileForbidden extends Error {}

/** สิทธิ์ที่หน้าตั้งค่ากิจการใช้เปิด/ปิดช่องแก้ (เซิร์ฟเวอร์ตรวจซ้ำตอน PATCH) */
export type BusinessProfileCan = { editName: boolean; editTax: boolean };
export const ACCOUNT_SETTINGS_ACTION = "account.settings.manage";
export function businessCan(m: MembershipCtx): BusinessProfileCan {
  return { editName: m.role === "OWNER", editTax: accountCanMember(m, ACCOUNT_SETTINGS_ACTION) };
}

export type BusinessProfile = {
  tenantId: string;
  name: string;
  logoUrl: string | null;
  /** null = ยังไม่เคยเลือก */
  businessType: TenantType | null;
  /** ช่องบนเอกสาร (สมุดบัญชีหลัก) · null = ร้านยังไม่เปิดระบบบัญชี */
  docs: {
    systemId: string;
    bookName: string;
    /** จำนวนสมุดบัญชีของร้าน (> 1 = แก้ที่สมุดหลักเท่านั้น) */
    bookCount: number;
    orgName: string;
    address: string | null;
    phone: string | null;
    taxId: string | null;
    branchCode: string;
    branchName: string | null;
  } | null;
  /** เวลาทำการ (ระบบแชทหลัก) · available false = ร้านไม่มีระบบแชท · days ว่าง = ยังไม่ได้ตั้ง */
  hours: { available: boolean; tz: string | null; days: BusinessDay[] };
};

export type BusinessProfilePatch = {
  name?: string;
  businessType?: string | null;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  branchCode?: string | null;
  branchName?: string | null;
  hours?: { days: BusinessDay[]; tz?: string | null } | null;
};

/** สมุด/ระบบหลักของชนิดนั้น — ตัวที่เปิดอยู่และสร้างก่อนสุด (ตัดสินแบบเดียวกันทั้งอ่านและเขียน) */
async function primarySystems(tenantId: string, type: "ACCOUNT" | "CHAT") {
  return prisma.appSystem.findMany({ where: { tenantId, type, active: true }, select: { id: true, name: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

const typeOf = (v: unknown): TenantType | null => (typeof v === "string" && (TENANT_TYPES as readonly string[]).includes(v) ? (v as TenantType) : null);
const clean = (v: string | null | undefined, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  if (Array.from(s).length > max) throw new BusinessProfileError(`ข้อความยาวเกิน ${max} ตัวอักษร`);
  return s || null;
};
const digits = (v: string) => v.replace(/[\s\-‐-―]/g, "");

export async function getBusinessProfile(tenantId: string): Promise<BusinessProfile> {
  const [tenant, branding, books, chats] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, businessType: true } }),
    getBranding({ tenantId }),
    primarySystems(tenantId, "ACCOUNT"),
    primarySystems(tenantId, "CHAT"),
  ]);
  const book = books[0] ?? null;
  const s = book ? await getSettings(tenantId, book.id) : null;
  const chat = chats[0] ?? null;
  const hoursRow = chat ? await prisma.chatSetting.findFirst({ where: { tenantId, systemId: chat.id }, select: { businessHours: true } }) : null;
  const hours = readBusinessHours(hoursRow?.businessHours ?? null);
  return {
    tenantId,
    name: tenant?.name ?? "",
    // โลโก้ของร้าน (ธีม) · ไม่มี = โลโก้บนเอกสารของสมุดหลัก (ร้านที่ตั้งไว้แค่ฝั่งบัญชี)
    logoUrl: branding?.logoUrl ?? s?.logoUrl ?? null,
    businessType: typeOf(tenant?.businessType),
    docs:
      book && s
        ? {
            systemId: book.id,
            bookName: book.name,
            bookCount: books.length,
            orgName: s.orgName,
            address: s.address,
            phone: s.phone,
            taxId: s.taxId,
            branchCode: s.branchCode || HQ_BRANCH,
            branchName: s.branchName,
          }
        : null,
    hours: { available: !!chat, tz: hours?.tz ?? null, days: hours?.days ?? [] },
  };
}

/**
 * แก้ข้อมูลกิจการ — ส่งเฉพาะช่องที่แก้ (undefined = ไม่แตะ) · คืนข้อมูลหลังบันทึก
 *   `role` จากด่าน (Membership สด) · ชื่อ = OWNER เท่านั้น · ตรวจทุกช่องก่อนเขียนช่องแรก (ผิดช่องเดียว = ไม่มีอะไรเปลี่ยน)
 */
export async function updateBusinessProfile(tenantId: string, actor: { userId: string; m: MembershipCtx }, patch: BusinessProfilePatch): Promise<BusinessProfile> {
  const can = businessCan(actor.m);
  // ── ตรวจทั้งหมดก่อน ──
  let name: string | undefined;
  if (patch.name !== undefined) {
    if (!can.editName) throw new BusinessProfileForbidden("เปลี่ยนชื่อกิจการได้เฉพาะเจ้าของกิจการ");
    name = String(patch.name ?? "").trim();
    const n = Array.from(name).length;
    if (n < BIZ_NAME_MIN || n > BIZ_NAME_MAX) throw new BusinessProfileError(`ชื่อกิจการต้องยาว ${BIZ_NAME_MIN}–${BIZ_NAME_MAX} ตัวอักษร`);
  }
  let businessType: TenantType | null | undefined;
  if (patch.businessType !== undefined) {
    businessType = patch.businessType === null || patch.businessType === "" ? null : typeOf(String(patch.businessType).trim().toLowerCase());
    if (patch.businessType && !businessType) throw new BusinessProfileError("ไม่รู้จักประเภทธุรกิจนี้ — เลือกจากรายการ");
  }

  const docKeys = ["address", "phone", "taxId", "branchCode", "branchName"] as const;
  const docsTouched = docKeys.some((k) => patch[k] !== undefined);
  if (docsTouched && !can.editTax) throw new BusinessProfileForbidden("แก้ที่อยู่/เบอร์/เลขผู้เสียภาษีได้เฉพาะผู้ที่มีสิทธิ์ตั้งค่าระบบบัญชี — ขอสิทธิ์จากเจ้าของกิจการ");
  const docPatch: Partial<AccountSettingsView> = {};
  if (patch.address !== undefined) docPatch.address = clean(patch.address, ADDRESS_MAX);
  if (patch.phone !== undefined) {
    const p = clean(patch.phone, PHONE_MAX);
    if (p && !/^[0-9+()\-\s#,/.]+$/.test(p)) throw new BusinessProfileError("เบอร์โทรใส่ได้เฉพาะตัวเลขและเครื่องหมาย + - ( )");
    docPatch.phone = p;
  }
  if (patch.taxId !== undefined) {
    const t = patch.taxId ? digits(patch.taxId) : "";
    if (t && !/^\d{13}$/.test(t)) throw new BusinessProfileError("เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก");
    if (t && !isValidThaiTaxIdChecksum(t)) throw new BusinessProfileError("เลขผู้เสียภาษีไม่ถูกต้อง (หลักตรวจสอบไม่ตรง) — ตรวจเลขอีกครั้ง");
    docPatch.taxId = t || null;
  }
  if (patch.branchCode !== undefined) {
    const b = patch.branchCode ? digits(patch.branchCode) : "";
    if (b && !/^\d{5}$/.test(b)) throw new BusinessProfileError("รหัสสาขาต้องเป็นตัวเลข 5 หลัก (สำนักงานใหญ่ = 00000)");
    docPatch.branchCode = b || HQ_BRANCH;
  }
  if (patch.branchName !== undefined) docPatch.branchName = clean(patch.branchName, BRANCH_NAME_MAX);
  const books = docsTouched ? await primarySystems(tenantId, "ACCOUNT") : [];
  if (docsTouched && !books[0]) throw new BusinessProfileError("กิจการนี้ยังไม่ได้เปิดระบบบัญชี — ที่อยู่/เลขผู้เสียภาษีเก็บในระบบบัญชี (ใช้พิมพ์บนใบเสร็จ/ใบกำกับ)");

  let hoursValue: ReturnType<typeof validateBusinessHours> | null | undefined;
  let chatId: string | null = null;
  if (patch.hours !== undefined) {
    const chats = await primarySystems(tenantId, "CHAT");
    if (!chats[0]) throw new BusinessProfileError("กิจการนี้ยังไม่ได้เปิดระบบแชท — เวลาทำการใช้กับการตอบลูกค้าในแชท");
    chatId = chats[0].id;
    if (patch.hours === null || patch.hours.days.length === 0) hoursValue = null;
    else {
      // คงข้อความเสริม/วันหยุดเดิมที่ตั้งจากเว็บ (แอปแก้แค่วัน+เวลา) — เขียนทับทั้งก้อน = ของเดิมหาย
      const row = await prisma.chatSetting.findFirst({ where: { tenantId, systemId: chatId }, select: { businessHours: true } });
      const prev = readBusinessHours(row?.businessHours ?? null);
      hoursValue = validateBusinessHours({ tz: patch.hours.tz || prev?.tz, note: prev?.note ?? null, holidays: prev?.holidays ?? [], days: patch.hours.days });
      if (!hoursValue.ok) throw new BusinessProfileError(hoursValue.error);
    }
  }

  // ── เขียน ──
  if (name !== undefined || businessType !== undefined) {
    const before = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, businessType: true } });
    await prisma.tenant.update({ where: { id: tenantId }, data: { ...(name !== undefined ? { name } : {}), ...(businessType !== undefined ? { businessType } : {}) } });
    if (name !== undefined) invalidateBrandingCache(tenantId); // displayName ปริยาย = ชื่อร้าน
    await writeAudit({ tenantId, actorId: actor.userId, action: "tenant.profile.updated", targetType: "Tenant", targetId: tenantId, before, after: { name: name ?? before?.name, businessType: businessType === undefined ? before?.businessType : businessType } });
  }
  if (docsTouched && books[0]) {
    const systemId = books[0].id;
    const current = await getSettings(tenantId, systemId);
    await saveSettings(tenantId, systemId, { ...current, ...docPatch });
    await writeAudit({
      tenantId,
      actorId: actor.userId,
      action: "account.settings.updated",
      targetType: "AccountSettings",
      targetId: systemId,
      // เลขภาษีไม่ลง log เต็ม (4 ตัวท้าย)
      after: { fields: Object.keys(docPatch), via: "mobile.business", ...(docPatch.taxId ? { taxId: `…${docPatch.taxId.slice(-4)}` } : {}) },
    });
  }
  if (hoursValue !== undefined && chatId) {
    await setBusinessHours(tenantId, chatId, hoursValue === null ? null : hoursValue.ok ? hoursValue.value : null);
    await writeAudit({ tenantId, actorId: actor.userId, action: "chat.business_hours.updated", targetType: "AppSystem", targetId: chatId, after: { via: "mobile.business", days: hoursValue && hoursValue.ok ? hoursValue.value.days : null } });
  }
  return getBusinessProfile(tenantId);
}

/** ตั้ง/ล้างโลโก้ของกิจการ (TenantBranding.logoUrl · `setBranding` เดิม) */
export async function setBusinessLogo(tenantId: string, userId: string, logoUrl: string | null): Promise<void> {
  await setBranding({ tenantId }, { logoUrl: logoUrl ?? "", updatedById: userId });
}
