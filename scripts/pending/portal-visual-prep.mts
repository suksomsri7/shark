// portal-visual-prep.mts — เตรียมร้าน QC ให้ถ่ายภาพสายตาลูกค้า `visual-crm.mts 3.5 --user customer:<accessId>` (C3.5 · ไฟล์ชั่วคราว)
//   prep : เปิด settings.crm.portal ของระบบ CRM ใน crm-expected.json (เก็บค่าเดิมไว้ที่ .qc-shots/crm/portal-visual-prev.json)
//          + เชิญผู้ติดต่อคนแรกของบริษัทแรกที่มีผู้ติดต่อ (role APPROVE) → พิมพ์ accessId
//   undo : bash … tsx .qc-shots/c35/portal-visual-prep.mts --undo  (ลบ access ที่สร้าง + คืน settings เดิม)
// รัน: bash scripts/iso.sh bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx .qc-shots/c35/portal-visual-prep.mts
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
const env = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
env.loadQcEnv();
delete process.env.RESEND_API_KEY; // อีเมลเชิญ = log dev เท่านั้น (ไม่ส่งถึงผู้ติดต่อ seed)
const { prisma } = await import("@/lib/core/db");
const crm = await import("@/lib/modules/crm");
const E = JSON.parse(readFileSync("scripts/crm-expected.json", "utf8")) as { tenantId: string; systemId: string; companyIds: string[]; users: Record<string, { userId?: string }> };
const PREV = ".qc-shots/crm/portal-visual-prev.json";
if (process.argv.includes("--undo")) {
  if (!existsSync(PREV)) throw new Error("ไม่มีไฟล์ค่าเดิม — ยังไม่ได้ prep");
  const prev = JSON.parse(readFileSync(PREV, "utf8")) as { settings: unknown; accessId: string };
  await prisma.crmPortalAccess.deleteMany({ where: { id: prev.accessId, tenantId: E.tenantId } });
  await prisma.appSystem.update({ where: { id: E.systemId }, data: { settings: prev.settings as never } });
  await prisma.auditLog.deleteMany({ where: { tenantId: E.tenantId, action: { startsWith: "crm.portal." }, targetId: { in: [prev.accessId, E.systemId] } } });
  unlinkSync(PREV);
  console.log(`undo ok · access ${prev.accessId} ลบแล้ว · settings คืนค่าเดิม`);
} else {
  const sys = await prisma.appSystem.findUniqueOrThrow({ where: { id: E.systemId }, select: { settings: true } });
  const link = await prisma.crmCompanyContact.findFirst({ where: { tenantId: E.tenantId, companyId: { in: E.companyIds }, contact: { archivedAt: null, mergedIntoId: null, email: { not: null } } }, orderBy: { createdAt: "asc" }, select: { companyId: true, contactId: true } });
  if (!link) throw new Error("ไม่พบบริษัทใน seed ที่มีผู้ติดต่อ (มีอีเมล)");
  const ownerId = E.users?.owner?.userId ?? "";
  const owner = { userId: ownerId, role: "OWNER" as const, unitAccess: [] as string[], permissions: {} };
  const ctx = { tenantId: E.tenantId, systemId: E.systemId, actorUserId: ownerId };
  await crm.portal.savePortalSettings(ctx, owner, { enabled: true, loginMethods: ["EMAIL_OTP", "LINE"], showDeals: false, allowIssue: true, issueBoardId: null });
  const r = await crm.portal.invite(ctx, owner, { companyId: link.companyId, contactId: link.contactId, role: "APPROVE" });
  await prisma.crmPortalAccess.update({ where: { id: r.accessId }, data: { acceptedAt: new Date(), inviteTokenHash: null } });
  writeFileSync(PREV, JSON.stringify({ settings: sys.settings, accessId: r.accessId }));
  console.log(`prep ok · ใช้: --user customer:${r.accessId}  (บริษัท ${link.companyId} · ผู้ติดต่อ ${link.contactId})`);
}
await prisma.$disconnect();
