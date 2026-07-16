// White label v1 (WO-0064) — โลโก้/สี/ชื่อแบรนด์ ต่อร้าน ใช้บน storefront สาธารณะ
// ฝั่งร้าน tenant-scoped ผ่าน tenantDb({ tenantId }) → inject tenantId อัตโนมัติ (kernel guard)
// ร้านอื่นมองไม่เห็น · getPublicBranding รับ tenantId ตรง (public surface) → default = ชื่อ tenant

import { prisma, tenantDb } from "@/lib/core/db";

type Ctx = { tenantId: string };

export type BrandingInput = {
  displayName?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
};

export type PublicBranding = {
  displayName: string;
  logoUrl: string | null;
  brandColor: string | null;
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/; // #RRGGBB เท่านั้น

// http(s) เท่านั้น — กัน javascript:/data: และ scheme อันตรายอื่น
function isSafeHttpUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// อ่านแบรนด์ของร้านนี้ (ยังไม่ตั้ง → null)
export async function getBranding(
  ctx: Ctx,
): Promise<{ displayName: string | null; logoUrl: string | null; brandColor: string | null } | null> {
  const row = await tenantDb(ctx).tenantBranding.findUnique({
    where: { tenantId: ctx.tenantId },
  });
  if (!row) return null;
  return { displayName: row.displayName, logoUrl: row.logoUrl, brandColor: row.brandColor };
}

// ตั้ง/แก้แบรนด์ — validate สี hex + logo http(s) ก่อน (เพี้ยน → throw ไทย)
// partial update: field ที่เป็น undefined = ไม่แตะ (คงค่าเดิม) · "" = ล้างเป็น null · มีค่า = ตั้ง
// find→update/create เอง (ห้าม upsert ผ่าน tenantDb — guard ห่อ where ด้วย AND ทำ unique พัง)
export async function setBranding(ctx: Ctx, input: BrandingInput): Promise<{ ok: true }> {
  const patch: { displayName?: string | null; logoUrl?: string | null; brandColor?: string | null } = {};

  if (input.displayName !== undefined) {
    patch.displayName = input.displayName?.trim() || null;
  }

  if (input.logoUrl !== undefined) {
    const v = input.logoUrl?.trim() || "";
    if (v !== "" && !isSafeHttpUrl(v)) {
      throw new Error("ลิงก์โลโก้ไม่ถูกต้อง — ต้องขึ้นต้นด้วย http:// หรือ https:// เท่านั้น");
    }
    patch.logoUrl = v || null;
  }

  if (input.brandColor !== undefined) {
    const v = input.brandColor?.trim() || "";
    if (v !== "" && !HEX_RE.test(v)) {
      throw new Error("รหัสสีไม่ถูกต้อง — ต้องเป็นรูปแบบ #RRGGBB เช่น #1A2B3C");
    }
    patch.brandColor = v || null;
  }

  const db = tenantDb(ctx);
  const existing = await db.tenantBranding.findUnique({ where: { tenantId: ctx.tenantId } });
  if (existing) {
    await db.tenantBranding.update({ where: { tenantId: ctx.tenantId }, data: patch });
  } else {
    await db.tenantBranding.create({
      data: {
        tenantId: ctx.tenantId,
        displayName: patch.displayName ?? null,
        logoUrl: patch.logoUrl ?? null,
        brandColor: patch.brandColor ?? null,
      },
    });
  }
  return { ok: true };
}

// สำหรับ storefront สาธารณะ — รับ tenantId ตรง ๆ
// ยังไม่ตั้งแบรนด์ (หรือ displayName ว่าง) → default ใช้ชื่อ tenant
export async function getPublicBranding(tenantId: string): Promise<PublicBranding> {
  const [row, tenant] = await Promise.all([
    tenantDb({ tenantId }).tenantBranding.findUnique({ where: { tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);
  const fallbackName = tenant?.name ?? "";
  return {
    displayName: row?.displayName?.trim() || fallbackName,
    logoUrl: row?.logoUrl ?? null,
    brandColor: row?.brandColor ?? null,
  };
}
