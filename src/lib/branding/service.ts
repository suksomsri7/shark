// White label v1 (WO-0064) → ธีมกิจการ B1 (ledger/BRANDING-RUN.md §สัญญา B1)
// โลโก้/สี/ชื่อแบรนด์/โทนแถบเมนู ต่อร้าน — ใช้ทั้งโครงแอป (B3) หน้าร้าน (B4) และแอปมือถือ (B5)
//
// ฝั่งร้าน tenant-scoped ผ่าน tenantDb({ tenantId }) → inject tenantId อัตโนมัติ (kernel guard)
// ร้านอื่นมองไม่เห็น · getPublicBranding / getBrandingTokens รับ tenantId ตรง (public surface)
//   → default = ชื่อ tenant + ธีมปริยายของแพลตฟอร์ม
//
// 🔴 ที่เดียวที่คำนวณ "โทเคนธีม" — หน้าไหนก็ตามที่อยากได้สี/โลโก้ ต้องเรียก getBrandingTokens
//    ห้ามอ่านแถว TenantBranding ตรงแล้วตีความเอง (ไม่งั้นสูตร BRAND/DARK จะเพี้ยนคนละที่)

import type { NavTone } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { fgAlpha, isHex, pickReadableFg, softOf, FG_DARK, FG_LIGHT } from "./color";

type Ctx = { tenantId: string };

export type BrandingInput = {
  displayName?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  navTone?: NavTone | string | null;
  applyStorefront?: boolean | null;
  applyMobile?: boolean | null;
  /** User.id ของคนที่กดบันทึก (มาจาก session เท่านั้น — ห้ามรับจาก client) */
  updatedById?: string | null;
};

export type PublicBranding = {
  displayName: string;
  logoUrl: string | null;
  brandColor: string | null;
};

/** โทเคนธีมสำเร็จรูป — ผู้ใช้ทุกฝั่ง (เว็บ/หน้าร้าน/เอกสาร/แอป) รับชุดนี้ชุดเดียว */
export type BrandingTokens = {
  displayName: string;
  logoUrl: string | null;
  /** สีหลักของกิจการ (#RRGGBB) */
  accent: string;
  /** สีตัวอักษรบนสีหลัก — คำนวณจาก contrast ไม่ใช่เดา */
  accentFg: string;
  /** สีหลักแบบจาง 8% (พื้นชิป/แถวที่เลือก) */
  accentSoft: string;
  navTone: NavTone;
  /** พื้นแถบเมนู/รางไอคอน */
  navBg: string;
  /** ตัวอักษรหลักบนแถบเมนู */
  navFg: string;
  /** ตัวอักษรรอง/ไอคอนจาง บนแถบเมนู */
  navFg2: string;
  /** พื้นของรายการที่ถูกเลือกบนแถบเมนู */
  navOn: string;
  applyStorefront: boolean;
  applyMobile: boolean;
  /** true = ร้านยังไม่เลือกสีแบรนด์ → ใช้ธีมปริยายของแพลตฟอร์ม */
  isDefault: boolean;
};

// ── ค่าปริยายของแพลตฟอร์ม (ร้านที่ยังไม่ตั้งธีม เห็นหน้าตาเหมือนเดิมทุกประการ) ──
const DEFAULT_ACCENT = "#1d4ed8";
const LIGHT_NAV = { navBg: "#fafafa", navFg: FG_DARK, navFg2: "#737373", navOn: "#ffffff" } as const;
const DARK_NAV = { navBg: "#111827", navFg: "#f9fafb", navFg2: "#9ca3af", navOn: "rgba(255, 255, 255, 0.1)" } as const;

const NAV_TONES = ["LIGHT", "BRAND", "DARK"] as const;
const isNavTone = (v: unknown): v is NavTone =>
  typeof v === "string" && (NAV_TONES as readonly string[]).includes(v);

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
export async function getBranding(ctx: Ctx): Promise<{
  displayName: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  brandFg: string | null;
  navTone: NavTone;
  applyStorefront: boolean;
  applyMobile: boolean;
} | null> {
  const row = await tenantDb(ctx).tenantBranding.findUnique({
    where: { tenantId: ctx.tenantId },
  });
  if (!row) return null;
  return {
    displayName: row.displayName,
    logoUrl: row.logoUrl,
    brandColor: row.brandColor,
    brandFg: row.brandFg,
    navTone: row.navTone,
    applyStorefront: row.applyStorefront,
    applyMobile: row.applyMobile,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// แคชโทเคนธีมในหน่วยความจำ (ต่อร้าน · TTL 60 วิ)
//
// 🔴 ทำไมต้องมี: โทเคนถูกอ่าน **ทุกคำขอ** (layout ของทุกหน้า + ทุก membership ใน /api/mobile/me)
//    แต่เปลี่ยนปีละไม่กี่ครั้ง ⇒ ไม่แคช = query ฟรี ๆ ต่อการเปิดหน้าจอ 1 ครั้ง
// 🔴 TTL สั้น (60 วิ) + invalidate ตอนบันทึก ⇒ คนกดบันทึกเห็นผลทันทีในอินสแตนซ์ที่กด
//    ส่วนอินสแตนซ์อื่น (serverless หลายตัว) รอไม่เกิน 60 วิ · outbox `tenant.branding.updated`
//    เป็นตัวบอกอินสแตนซ์/แอปให้ล้างแคชของตัวเองอีกชั้น
// ─────────────────────────────────────────────────────────────────────────────
const TOKENS_TTL_MS = 60_000;
const tokensCache = new Map<string, { at: number; tokens: BrandingTokens }>();

/** ล้างแคชธีมของร้าน (ไม่ส่ง tenantId = ล้างทั้งโปรเซส — ใช้ในข้อสอบ/สคริปต์) */
export function invalidateBrandingCache(tenantId?: string): void {
  if (tenantId) tokensCache.delete(tenantId);
  else tokensCache.clear();
}

/** สร้างโทเคนจากแถว (pure — ทดสอบง่าย และเป็นสูตรเดียวของทั้งระบบ) */
function tokensFrom(
  row: {
    displayName: string | null;
    logoUrl: string | null;
    brandColor: string | null;
    brandFg: string | null;
    navTone: NavTone;
    applyStorefront: boolean;
    applyMobile: boolean;
  } | null,
  tenantName: string,
): BrandingTokens {
  const accent = row?.brandColor && isHex(row.brandColor) ? row.brandColor : DEFAULT_ACCENT;
  // brandFg ที่เก็บไว้เชื่อได้เฉพาะเมื่อเป็น hex ที่ระบบเลือกเอง — ไม่งั้นคำนวณใหม่
  const accentFg =
    row?.brandFg === FG_LIGHT || row?.brandFg === FG_DARK ? row.brandFg : pickReadableFg(accent);
  const navTone: NavTone = row?.navTone ?? "LIGHT";

  let nav: { navBg: string; navFg: string; navFg2: string; navOn: string };
  if (navTone === "BRAND") {
    nav = {
      navBg: accent,
      navFg: accentFg,
      navFg2: fgAlpha(accentFg, 0.72),
      navOn: fgAlpha(accentFg, 0.16),
    };
  } else if (navTone === "DARK") {
    nav = { ...DARK_NAV };
  } else {
    nav = { ...LIGHT_NAV };
  }

  return {
    displayName: row?.displayName?.trim() || tenantName,
    logoUrl: row?.logoUrl ?? null,
    accent,
    accentFg,
    accentSoft: softOf(accent),
    navTone,
    ...nav,
    applyStorefront: row?.applyStorefront ?? true,
    applyMobile: row?.applyMobile ?? true,
    isDefault: !row?.brandColor,
  };
}

/**
 * โทเคนธีมของร้าน — จุดเดียวที่ทุกฝั่งเรียกใช้ (แคช 60 วิ)
 * ร้านที่ยังไม่ตั้งอะไรเลย → ค่าปริยายของแพลตฟอร์ม + ชื่อร้านเป็น displayName
 */
export async function getBrandingTokens(tenantId: string): Promise<BrandingTokens> {
  const hit = tokensCache.get(tenantId);
  if (hit && Date.now() - hit.at < TOKENS_TTL_MS) return hit.tokens;

  const [row, tenant] = await Promise.all([
    tenantDb({ tenantId }).tenantBranding.findUnique({ where: { tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);
  const tokens = tokensFrom(row, tenant?.name ?? "");
  tokensCache.set(tenantId, { at: Date.now(), tokens });
  return tokens;
}

// ตั้ง/แก้แบรนด์ — validate สี hex + logo http(s) + โทนแถบ ก่อน (เพี้ยน → throw ไทย)
// partial update: field ที่เป็น undefined = ไม่แตะ (คงค่าเดิม) · "" = ล้างเป็น null · มีค่า = ตั้ง
// find→update/create เอง (ห้าม upsert ผ่าน tenantDb — guard ห่อ where ด้วย AND ทำ unique พัง)
//
// ทุกครั้งที่บันทึกสำเร็จ: คำนวณ brandFg · ล้างแคช · เขียน AuditLog · ยิง outbox ให้ที่อื่นรู้
export async function setBranding(ctx: Ctx, input: BrandingInput): Promise<{ ok: true }> {
  const patch: {
    displayName?: string | null;
    logoUrl?: string | null;
    brandColor?: string | null;
    brandFg?: string | null;
    navTone?: NavTone;
    applyStorefront?: boolean;
    applyMobile?: boolean;
    updatedById?: string | null;
  } = {};

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
    if (v !== "" && !isHex(v)) {
      throw new Error("รหัสสีไม่ถูกต้อง — ต้องเป็นรูปแบบ #RRGGBB เช่น #1A2B3C");
    }
    patch.brandColor = v || null;
    // สีเปลี่ยน = สีตัวอักษรบนสีนั้นต้องคำนวณใหม่เสมอ (ไม่มีสี = ไม่มี brandFg)
    patch.brandFg = v ? pickReadableFg(v) : null;
  }

  if (input.navTone !== undefined && input.navTone !== null) {
    if (!isNavTone(input.navTone)) {
      throw new Error("โทนแถบเมนูไม่ถูกต้อง — เลือกได้เฉพาะ สว่าง / สีหลักของกิจการ / เข้ม");
    }
    patch.navTone = input.navTone;
  }

  if (input.applyStorefront !== undefined && input.applyStorefront !== null) {
    patch.applyStorefront = input.applyStorefront;
  }
  if (input.applyMobile !== undefined && input.applyMobile !== null) {
    patch.applyMobile = input.applyMobile;
  }
  if (input.updatedById !== undefined) {
    patch.updatedById = input.updatedById || null;
  }

  const db = tenantDb(ctx);
  const before = await db.tenantBranding.findUnique({ where: { tenantId: ctx.tenantId } });

  // เขียนแถว + ยิง outbox ใน tx เดียว — บันทึกรอด = event รอด (ไม่มีทางธีมเปลี่ยนแต่ไม่มีใครรู้)
  const saved = await prisma.$transaction(async (tx) => {
    const row = before
      ? await tx.tenantBranding.update({ where: { tenantId: ctx.tenantId }, data: patch })
      : await tx.tenantBranding.create({
          data: {
            tenantId: ctx.tenantId,
            displayName: patch.displayName ?? null,
            logoUrl: patch.logoUrl ?? null,
            brandColor: patch.brandColor ?? null,
            brandFg: patch.brandFg ?? null,
            navTone: patch.navTone ?? "LIGHT",
            applyStorefront: patch.applyStorefront ?? true,
            applyMobile: patch.applyMobile ?? true,
            updatedById: patch.updatedById ?? null,
          },
        });
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "tenant.branding.updated",
      // 1 การบันทึก = 1 event · ผูกกับ updatedAt ⇒ ยิงซ้ำจากการ retry ไม่เพิ่มแถว
      idempotencyKey: `branding#${ctx.tenantId}#${row.updatedAt.getTime()}`,
      payload: {
        brandColor: row.brandColor,
        brandFg: row.brandFg,
        navTone: row.navTone,
        applyStorefront: row.applyStorefront,
        applyMobile: row.applyMobile,
        updatedById: row.updatedById,
      },
    });
    return row;
  });

  // แคชของโปรเซสนี้ต้องหายทันที ไม่งั้นคนกดบันทึกจะเห็นของเก่าอีก 60 วิ
  invalidateBrandingCache(ctx.tenantId);

  const changed = Object.keys(patch).filter((k) => k !== "updatedById");
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: patch.updatedById ?? null,
    action: "branding.updated",
    targetType: "TenantBranding",
    targetId: saved.id,
    before: before
      ? {
          displayName: before.displayName,
          logoUrl: before.logoUrl,
          brandColor: before.brandColor,
          brandFg: before.brandFg,
          navTone: before.navTone,
          applyStorefront: before.applyStorefront,
          applyMobile: before.applyMobile,
        }
      : null,
    after: {
      fields: changed,
      displayName: saved.displayName,
      logoUrl: saved.logoUrl,
      brandColor: saved.brandColor,
      brandFg: saved.brandFg,
      navTone: saved.navTone,
      applyStorefront: saved.applyStorefront,
      applyMobile: saved.applyMobile,
    },
  });

  // ระบายคิวหลังตอบ response (นอกบริบทคำขอ = drain ตรง ๆ) → ฮุค/กฎอัตโนมัติของร้านได้ยินทันที
  const { scheduleDrain } = await import("@/lib/outbox-consumers");
  scheduleDrain();

  return { ok: true };
}

// สำหรับ storefront สาธารณะ — รับ tenantId ตรง ๆ
// ยังไม่ตั้งแบรนด์ (หรือ displayName ว่าง) → default ใช้ชื่อ tenant
// 🔴 applyStorefront = false → หน้าร้านกลับไปใช้หน้าตาปริยาย (ไม่มีสี/โลโก้ของร้าน)
//    แต่ **ชื่อที่แสดงยังใช้** เพราะเป็นชื่อกิจการ ไม่ใช่ธีม (ลูกค้าต้องรู้ว่าจองกับใคร)
export async function getPublicBranding(tenantId: string): Promise<PublicBranding> {
  const t = await getBrandingTokens(tenantId);
  if (!t.applyStorefront) {
    return { displayName: t.displayName, logoUrl: null, brandColor: null };
  }
  return {
    displayName: t.displayName,
    logoUrl: t.logoUrl,
    // ยังไม่เลือกสี = null เหมือนเดิม (หน้าร้านมีค่าปริยายของตัวเอง — ห้ามยัด #1d4ed8 ให้)
    brandColor: t.isDefault ? null : t.accent,
  };
}
