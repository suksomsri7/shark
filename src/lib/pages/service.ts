// ระบบ "การจัดการ" — service (P1) · อยู่นอก src/lib/modules โดยเจตนา: เป็นชั้น cross-cutting
// ที่มอง "ทุกกิจการ + ทุกระบบ" (แบบเดียวกับ src/lib/platform) — ทุก query ระบุ tenantId เสมอ
// 🔴 ความปลอดภัย: การซ่อน/โชว์ widget เป็นเรื่อง UI เท่านั้น — สิทธิ์จริงบังคับที่ assertCan
//    ชั้น action ของแต่ละระบบเหมือนเดิม (PIN login ได้ session ปกติ สิทธิ์ไม่เกิน role เดิม)
import { cache } from "react";
import { scryptSync, timingSafeEqual, randomBytes } from "node:crypto";
import { prisma } from "@/lib/core/db";
import { randomCode } from "@/lib/core/hash";
import { WIDGET_DEFS, widgetDef, widgetsFor, widgetHref, type WidgetDef } from "./registry";

export type PageCtx = { tenantId: string };

// ── PIN: scrypt + salt (PIN สั้น เดาง่าย → ต้องคู่กับ rate limit ที่ชั้น login เสมอ) ──
export function hashPin(pin: string): string {
  const salt = randomBytes(12).toString("hex");
  return `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`;
}
export function verifyPin(pin: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = scryptSync(pin, salt, 32);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

// ── ระบบ feature ที่กิจการนี้ใช้ได้ (สำหรับกรอง widget + resolve URL) ──
// ผูกกับกิจการผ่าน AppSystemUnit · ระบบที่ไม่เคยผูกสาขาไหนเลย = ระดับร้าน ใช้ได้ทุกกิจการ
export async function unitSystemMap(tenantId: string, unitId: string): Promise<Map<string, string>> {
  const [systems, links] = await Promise.all([
    prisma.appSystem.findMany({ where: { tenantId, active: true }, select: { id: true, type: true } }),
    prisma.appSystemUnit.findMany({ where: { tenantId }, select: { systemId: true, unitId: true } }),
  ]);
  const linkedHere = new Set(links.filter((l) => l.unitId === unitId).map((l) => l.systemId));
  const linkedAnywhere = new Set(links.map((l) => l.systemId));
  const map = new Map<string, string>();
  for (const s of systems) if (linkedHere.has(s.id) && !map.has(s.type)) map.set(s.type, s.id);
  for (const s of systems) if (!linkedAnywhere.has(s.id) && !map.has(s.type)) map.set(s.type, s.id);
  return map;
}

// ── Page CRUD ──
export async function listPages(ctx: PageCtx) {
  return prisma.page.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "asc" },
    include: { widgets: { select: { id: true } }, members: { select: { id: true } } },
  });
}

export async function getPage(ctx: PageCtx, pageId: string) {
  return prisma.page.findFirst({
    where: { id: pageId, tenantId: ctx.tenantId },
    include: {
      widgets: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      members: { where: { active: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

export async function createPage(
  ctx: PageCtx,
  input: { unitId: string; name: string },
): Promise<{ ok: boolean; reason?: string; id?: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "ตั้งชื่อ Page ก่อน" };
  const unit = await prisma.businessUnit.findFirst({
    where: { id: input.unitId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!unit) return { ok: false, reason: "ไม่พบกิจการ" };
  // slug สาธารณะ global-unique — สุ่มสั้น อ่านง่าย (หน้าอยู่หลัง login อยู่แล้ว)
  for (let i = 0; i < 20; i++) {
    const slug = randomCode(8, SLUG_ALPHABET);
    const dup = await prisma.page.findUnique({ where: { slug }, select: { id: true } });
    if (dup) continue;
    const row = await prisma.page.create({
      data: { tenantId: ctx.tenantId, unitId: unit.id, name, slug },
      select: { id: true },
    });
    return { ok: true, id: row.id };
  }
  return { ok: false, reason: "สร้างลิงก์ไม่สำเร็จ — ลองใหม่" };
}

export async function updatePage(
  ctx: PageCtx,
  pageId: string,
  patch: { name?: string; active?: boolean },
): Promise<{ ok: boolean; reason?: string }> {
  const page = await prisma.page.findFirst({ where: { id: pageId, tenantId: ctx.tenantId } });
  if (!page) return { ok: false, reason: "ไม่พบ Page" };
  const name = patch.name?.trim();
  if (patch.name !== undefined && !name) return { ok: false, reason: "ต้องมีชื่อ Page" };
  await prisma.page.update({
    where: { id: page.id },
    data: { ...(name ? { name } : {}), ...(patch.active !== undefined ? { active: patch.active } : {}) },
  });
  return { ok: true };
}

/** ลบ Page — เป็นแค่ผังหน้าจอ (ไม่มีข้อมูลเงิน/ประวัติผูก) ลบจริงได้ · widget/สมาชิก cascade */
export async function deletePage(ctx: PageCtx, pageId: string): Promise<{ ok: boolean }> {
  await prisma.page.deleteMany({ where: { id: pageId, tenantId: ctx.tenantId } });
  return { ok: true };
}

// ── Widgets ──
/** widget ที่ Page นี้เลือกได้ (ตามชนิดกิจการ + ระบบที่กิจการใช้ได้) — มติเจ้าของ: เห็นเฉพาะของกิจการนั้น */
export async function availableWidgets(ctx: PageCtx, pageId: string): Promise<WidgetDef[]> {
  const page = await prisma.page.findFirst({ where: { id: pageId, tenantId: ctx.tenantId } });
  if (!page) return [];
  const unit = await prisma.businessUnit.findFirst({ where: { id: page.unitId }, select: { type: true } });
  if (!unit) return [];
  const systems = await unitSystemMap(ctx.tenantId, page.unitId);
  // CRM C3.6 ▸ widget ข้อมูลของ CRM เลือกได้เฉพาะกิจการที่ระบบ CRM เปิด v2 แล้ว (v1 = ไม่มีอะไรให้แสดง) ◂
  const crmV2 = await crmV2Of(ctx.tenantId, systems.get("CRM"));
  return widgetsFor(unit.type, new Set(systems.keys())).filter((w) => !w.data || crmV2);
}

// CRM C3.6 ▸ ระบบ CRM ของกิจการเปิด CRM v2 แล้วไหม (R-E.14 — v1 = widget ข้อมูลของ CRM ไม่แสดง/ไม่ให้เลือก)
//   โหลด facade CRM ตอนใช้: หน้า Page ที่ไม่มี widget ของ CRM ไม่ต้องลากกราฟ CRM เข้ามา
async function crmV2Of(tenantId: string, crmSystemId: string | undefined): Promise<boolean> {
  if (!crmSystemId) return false;
  const crm = await import("@/lib/modules/crm");
  return (await crm.crmUiVersion({ tenantId, systemId: crmSystemId })) === 2;
}
// ◂ CRM C3.6

export async function addWidget(
  ctx: PageCtx,
  pageId: string,
  widgetKey: string,
): Promise<{ ok: boolean; reason?: string }> {
  const page = await prisma.page.findFirst({ where: { id: pageId, tenantId: ctx.tenantId } });
  if (!page) return { ok: false, reason: "ไม่พบ Page" };
  const allowed = await availableWidgets(ctx, pageId);
  if (!allowed.some((w) => w.key === widgetKey)) {
    return { ok: false, reason: "เมนูนี้ไม่ได้เปิดใช้ในกิจการนี้" };
  }
  const dup = await prisma.pageWidget.findFirst({ where: { pageId, widgetKey } });
  if (dup) return { ok: false, reason: "มี widget นี้บนหน้าแล้ว" };
  const count = await prisma.pageWidget.count({ where: { pageId } });
  await prisma.pageWidget.create({
    data: { tenantId: ctx.tenantId, pageId, widgetKey, sortOrder: count },
  });
  return { ok: true };
}

export async function updateWidget(
  ctx: PageCtx,
  widgetId: string,
  patch: { title?: string | null; shape?: "RECT" | "SQUARE" | "CIRCLE"; imageUrl?: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  const w = await prisma.pageWidget.findFirst({ where: { id: widgetId, tenantId: ctx.tenantId } });
  if (!w) return { ok: false, reason: "ไม่พบ widget" };
  if (patch.imageUrl && !/^https?:\/\//i.test(patch.imageUrl)) {
    return { ok: false, reason: "ลิงก์รูปต้องเป็น http(s)" };
  }
  await prisma.pageWidget.update({
    where: { id: w.id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title?.trim() || null } : {}),
      ...(patch.shape !== undefined ? { shape: patch.shape } : {}),
      ...(patch.imageUrl !== undefined ? { imageUrl: patch.imageUrl?.trim() || null } : {}),
    },
  });
  return { ok: true };
}

export async function removeWidget(ctx: PageCtx, widgetId: string): Promise<{ ok: boolean }> {
  await prisma.pageWidget.deleteMany({ where: { id: widgetId, tenantId: ctx.tenantId } });
  return { ok: true };
}

/** จัดลำดับใหม่ทั้งหน้า (จาก drag & drop) — id ที่ไม่อยู่ใน Page นี้ถูกเมิน (กันยิงมั่วข้ามร้าน) */
export async function reorderWidgets(ctx: PageCtx, pageId: string, orderedIds: string[]): Promise<{ ok: boolean }> {
  const rows = await prisma.pageWidget.findMany({ where: { pageId, tenantId: ctx.tenantId }, select: { id: true } });
  const valid = new Set(rows.map((r) => r.id));
  const writes = orderedIds
    .filter((id) => valid.has(id))
    .map((id, i) =>
      // tenantId ใน where ด้วย — กันแก้ข้ามร้านแม้ id หลุดมาจาก valid set ผิดพลาด (defense-in-depth)
      prisma.pageWidget.updateMany({ where: { id, tenantId: ctx.tenantId }, data: { sortOrder: i } }),
    );
  // ลากสลับทีนึงมี widget ได้ถึง ~70 ตัว → เดิม await ทีละตัว = 70 รอบเดินทางไป Neon SG (ช้ามากบนมือถือ)
  // $transaction แบบ array = ยิงเป็นชุดเดียว + ได้ atomicity ฟรี (ลำดับไม่มีทางค้างครึ่ง ๆ กลาง ๆ)
  if (writes.length) await prisma.$transaction(writes);
  return { ok: true };
}

// ── สมาชิกของ Page ──
export async function tenantMembers(ctx: PageCtx) {
  const memberships = await prisma.membership.findMany({
    where: { tenantId: ctx.tenantId, acceptedAt: { not: null } },
    select: { id: true, role: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({
    membershipId: m.id,
    role: m.role,
    label: m.user.name?.trim() || m.user.email.split("@")[0]!,
    email: m.user.email,
  }));
}

export async function addPageMember(
  ctx: PageCtx,
  pageId: string,
  membershipId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const page = await prisma.page.findFirst({ where: { id: pageId, tenantId: ctx.tenantId } });
  if (!page) return { ok: false, reason: "ไม่พบ Page" };
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, tenantId: ctx.tenantId, acceptedAt: { not: null } },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  if (!membership) return { ok: false, reason: "ไม่พบพนักงานคนนี้ในร้าน" };
  const existing = await prisma.pageMember.findFirst({ where: { pageId, membershipId } });
  if (existing) {
    if (existing.active) return { ok: false, reason: "คนนี้อยู่ใน Page แล้ว" };
    await prisma.pageMember.update({ where: { id: existing.id }, data: { active: true } });
    return { ok: true };
  }
  await prisma.pageMember.create({
    data: {
      tenantId: ctx.tenantId,
      pageId,
      membershipId,
      // โชว์ชื่อบนจอ login สาธารณะ — ห้ามใช้อีเมลเต็ม (ข้อมูลส่วนตัว)
      displayName: membership.user.name?.trim() || membership.user.email.split("@")[0]!,
    },
  });
  return { ok: true };
}

export async function setPageMemberPin(
  ctx: PageCtx,
  pageMemberId: string,
  pin: string,
): Promise<{ ok: boolean; reason?: string }> {
  const clean = pin.trim();
  if (clean && !/^\d{4,8}$/.test(clean)) return { ok: false, reason: "PIN ต้องเป็นตัวเลข 4-8 หลัก" };
  const pm = await prisma.pageMember.findFirst({ where: { id: pageMemberId, tenantId: ctx.tenantId } });
  if (!pm) return { ok: false, reason: "ไม่พบสมาชิก" };
  await prisma.pageMember.update({
    where: { id: pm.id },
    data: { pinHash: clean ? hashPin(clean) : null },
  });
  return { ok: true };
}

export async function renamePageMember(
  ctx: PageCtx,
  pageMemberId: string,
  displayName: string,
): Promise<{ ok: boolean; reason?: string }> {
  const name = displayName.trim();
  if (!name) return { ok: false, reason: "ต้องมีชื่อ" };
  const pm = await prisma.pageMember.findFirst({ where: { id: pageMemberId, tenantId: ctx.tenantId } });
  if (!pm) return { ok: false, reason: "ไม่พบสมาชิก" };
  await prisma.pageMember.update({ where: { id: pm.id }, data: { displayName: name } });
  return { ok: true };
}

export async function removePageMember(ctx: PageCtx, pageMemberId: string): Promise<{ ok: boolean }> {
  await prisma.pageMember.updateMany({
    where: { id: pageMemberId, tenantId: ctx.tenantId },
    data: { active: false, pinHash: null },
  });
  return { ok: true };
}

// ── Login ด้วย PIN (เรียกจาก route สาธารณะ /api/page-login — rate limit อยู่ที่ route) ──
export type PageLoginResult =
  | { ok: true; userId: string; tenantId: string }
  | { ok: false; reason: "not_found" | "no_pin" | "wrong_pin" };

export async function verifyPageLogin(slug: string, pageMemberId: string, pin: string): Promise<PageLoginResult> {
  const page = await prisma.page.findFirst({ where: { slug, active: true }, select: { id: true, tenantId: true } });
  if (!page) return { ok: false, reason: "not_found" };
  const pm = await prisma.pageMember.findFirst({
    where: { id: pageMemberId, pageId: page.id, active: true },
    select: { pinHash: true, membershipId: true },
  });
  if (!pm) return { ok: false, reason: "not_found" };
  if (!pm.pinHash) return { ok: false, reason: "no_pin" };
  if (!verifyPin(pin, pm.pinHash)) return { ok: false, reason: "wrong_pin" };
  const membership = await prisma.membership.findFirst({
    where: { id: pm.membershipId, tenantId: page.tenantId, acceptedAt: { not: null } },
    select: { userId: true },
  });
  if (!membership) return { ok: false, reason: "not_found" };
  return { ok: true, userId: membership.userId, tenantId: page.tenantId };
}

// ── ข้อมูลสำหรับหน้าแสดงผล /p/<slug> ──
// หน้า /p ต้องรู้ 2 อย่างที่เริ่มจาก slug เดียวกัน: "คนนี้เข้าได้ไหม" (accessFor) และ "หน้ามีอะไรบ้าง"
// (pageForRender) → ห่อการค้นหน้าไว้ใน cache() ของ React เพื่อ **ยิงจริงครั้งเดียวต่อ request**
// แม้จะเรียกทั้งสองทางพร้อมกัน (เดิมค้นซ้ำ 2 รอบ + เรียงกัน = เสียรอบเดินทางไป Neon SG เปล่า)
export const pageBySlug = cache(async function pageBySlug(slug: string) {
  return prisma.page.findFirst({ where: { slug, active: true }, select: { id: true, tenantId: true } });
});

export type RenderWidget = {
  id: string;
  key: string;
  title: string;
  icon: string;
  imageUrl: string | null;
  shape: "RECT" | "SQUARE" | "CIRCLE";
  href: string;
  // CRM C3.6 ▸ widget ข้อมูล: แหล่งข้อมูล (registry `data`) + ระบบที่ให้ข้อมูล (id ระบบของกิจการ) — หน้า /p โหลดด้วย session ของผู้เปิด ◂
  data?: string;
  systemId?: string;
};

export async function pageForRender(slug: string) {
  const page = await prisma.page.findFirst({
    where: { slug, active: true },
    include: { widgets: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  if (!page) return null;
  // unit กับ systems ไม่ขึ้นแก่กัน → ยิงพร้อมกัน (เดิมเรียงกัน = เสียรอบเดินทางไป Neon SG ฟรี ๆ 1 รอบ)
  const [unit, systems] = await Promise.all([
    prisma.businessUnit.findFirst({
      where: { id: page.unitId, tenantId: page.tenantId },
      select: { slug: true, name: true, type: true },
    }),
    unitSystemMap(page.tenantId, page.unitId),
  ]);
  if (!unit) return null;
  // CRM C3.6 ▸ widget ข้อมูลของ CRM แสดงเฉพาะเมื่อระบบ CRM ของกิจการนี้เปิด v2 (ถามครั้งเดียวต่อหน้า · เฉพาะหน้าที่มี widget แบบนี้) ◂
  const hasData = page.widgets.some((w) => !!widgetDef(w.widgetKey)?.data);
  const crmV2 = hasData ? await crmV2Of(page.tenantId, systems.get("CRM")) : false;
  const widgets: RenderWidget[] = [];
  for (const w of page.widgets) {
    const def = widgetDef(w.widgetKey);
    if (!def) continue; // registry เปลี่ยน → widget เก่าที่ไม่รู้จักซ่อนไว้ (ไม่พังทั้งหน้า)
    if (def.data && !crmV2) continue; // CRM C3.6 ▸ R-E.14: CRM uiVersion 1 = ไม่มี widget ข้อมูล ◂
    const href = widgetHref(def, unit.slug, systems);
    if (!href) continue; // ระบบถูกปิด/เลิกผูก → ซ่อน
    widgets.push({
      id: w.id,
      key: w.widgetKey,
      title: w.title?.trim() || def.label,
      icon: def.icon,
      imageUrl: w.imageUrl,
      shape: w.shape,
      href,
      ...(def.data ? { data: def.data, systemId: systems.get(def.type) } : {}), // CRM C3.6 ◂
    });
  }
  return { page, unit, widgets };
}

/** รายชื่อบนจอ login (สาธารณะ) — เฉพาะชื่อที่ตั้งไว้ ไม่มีอีเมล · เฉพาะคนที่ตั้ง PIN แล้ว */
export async function loginRoster(slug: string) {
  const page = await prisma.page.findFirst({ where: { slug, active: true }, select: { id: true, name: true } });
  if (!page) return null;
  const members = await prisma.pageMember.findMany({
    where: { pageId: page.id, active: true },
    select: { id: true, displayName: true, pinHash: true },
    orderBy: { createdAt: "asc" },
  });
  return {
    pageName: page.name,
    members: members.map((m) => ({ id: m.id, name: m.displayName, hasPin: !!m.pinHash })),
  };
}

// CRM C3.6 ▸ สิทธิ์จริงของผู้เปิดหน้า /p (ร้านของ Page + บทบาท/สาขา/สิทธิ์ของเขาในร้านนั้น) — widget ข้อมูลโหลดด้วยตัวนี้
//   (ข้อมูลที่เห็น = ข้อมูลที่เขาเห็นในแอปอยู่แล้ว: visibleWhere ของ CRM ใช้กับ actor นี้) · ไม่เป็นสมาชิกร้าน = null
export async function pageViewer(slug: string, userId: string) {
  const page = await pageBySlug(slug);
  if (!page) return null;
  const membership = await prisma.membership.findFirst({
    where: { tenantId: page.tenantId, userId, acceptedAt: { not: null } },
    select: { role: true, unitAccess: true, permissions: true },
  });
  return membership ? { tenantId: page.tenantId, membership } : null;
}
// ◂ CRM C3.6

/** สิทธิ์เข้าดู /p ของ user ที่ login แล้ว: OWNER/MANAGER ของร้าน = เห็นหมด · PageMember = ตามที่กำหนด */
export async function accessFor(slug: string, userId: string) {
  const page = await pageBySlug(slug);
  if (!page) return null;
  const membership = await prisma.membership.findFirst({
    where: { tenantId: page.tenantId, userId, acceptedAt: { not: null } },
    select: { id: true, role: true },
  });
  if (!membership) return null;
  if (membership.role === "OWNER" || membership.role === "MANAGER") return { admin: true, allowedKeys: null };
  const pm = await prisma.pageMember.findFirst({
    where: { pageId: page.id, membershipId: membership.id, active: true },
    select: { allowedWidgetKeys: true },
  });
  if (!pm) return null;
  const keys = Array.isArray(pm.allowedWidgetKeys) ? (pm.allowedWidgetKeys as string[]) : [];
  return { admin: false, allowedKeys: keys.length > 0 ? new Set(keys) : null }; // null = เห็นทุก widget
}

export { WIDGET_DEFS };
