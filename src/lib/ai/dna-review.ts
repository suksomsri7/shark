// AI DNA ต่อเนื่อง (WO-0048 · M4.5) — ตรวจ drift ระหว่าง Business DNA กับข้อมูลจริง แล้วชวนอัปเดต
// - gatherDnaDrift: เทียบ DnaProfile.facts กับตัวเลขจริงของร้าน — deterministic ล้วน (ห้ามแตะ LLM)
//   ระบบไหนยังไม่เปิด = 0/ข้าม ไม่ throw · ไม่มี DnaProfile → { drifts: [] }
// - sweepDnaReview: cron วนทุก tenant ACTIVE ที่มี DnaProfile (cap 50) drift ≥1 → AppNotification
//   กันสแปม: มี noti title เดียวกันใน 7 วันล่าสุด → ข้าม · ร้านพัง catch แล้วไปต่อ
//
// ที่ตั้ง src/lib/ai (เหมือน analyst.ts) → เรียก prisma/tenantDb ตรงได้
// (system-scoped models ยิงผ่าน tenantDb เสมอ = defense-in-depth; global sweep ใช้ prisma ตรง)

import { prisma, tenantDb } from "@/lib/core/db";
import type { SystemType } from "@prisma/client";
import { ZDnaFacts } from "@/lib/dna/schema";

export type DnaReviewCtx = { tenantId: string };

/** drift หนึ่งข้อ — factValue = ที่ตั้งค่าไว้ตอนแรก, liveValue = ข้อมูลจริงตอนนี้ */
export type DnaDrift = { key: string; factValue: unknown; liveValue: unknown; message: string };

const REVIEW_TITLE = "ธุรกิจคุณเปลี่ยนไปจากตอนตั้งค่า";

// AppSystem เป็น tenant-scoped และ id ของมันคือ systemId ที่ domain models อ้างถึง
// → enumerate ids ของ type ที่ต้องการก่อน แล้วค่อย re-scope ยิงต่อ systemId (pattern calendar/analyst)
async function systemIds(tenantId: string, type: SystemType): Promise<string[]> {
  try {
    const rows = await tenantDb({ tenantId }).appSystem.findMany({ where: { type }, select: { id: true } });
    return rows.map((r) => r.id);
  } catch {
    return []; // ระบบยังไม่เปิด/พัง → ถือว่าไม่มี
  }
}

// รวมค่าจากทุก instance ของระบบชนิดหนึ่ง (ร้านมีได้หลาย system เดียวกัน เช่น POS หลายสาขา)
async function sumOverSystems(
  tenantId: string,
  type: SystemType,
  fn: (db: ReturnType<typeof tenantDb>) => Promise<number>,
): Promise<number> {
  let total = 0;
  for (const systemId of await systemIds(tenantId, type)) {
    try {
      total += await fn(tenantDb({ tenantId, systemId }));
    } catch {
      // ระบบนี้ยิงพัง → ข้าม (ไม่ให้ทั้งการตรวจล้ม)
    }
  }
  return total;
}

/**
 * ตรวจ drift ของร้านเดียว — เทียบ DnaProfile.facts กับข้อมูลจริง (deterministic)
 * ไม่มี DnaProfile หรือ facts พัง validation → { drifts: [] } (ไม่ throw)
 */
export async function gatherDnaDrift(ctx: DnaReviewCtx): Promise<{ drifts: DnaDrift[] }> {
  const { tenantId } = ctx;

  // profile ล่าสุดของร้าน (schema ปัจจุบัน = 1/tenant; เผื่ออนาคตมี versioning เอาใบ active ล่าสุด)
  // ไม่มี = ยังไม่ได้ตั้งค่า DNA → ไม่มี drift (ห้าม throw)
  const profile = await prisma.dnaProfile.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } });
  if (!profile) return { drifts: [] };

  // validate ที่ boundary — facts เพี้ยน (schema เก่า/แก้มือ) → ถือว่ายังไม่พร้อมตรวจ ไม่ throw
  const parsed = ZDnaFacts.safeParse(profile.facts);
  if (!parsed.success) return { drifts: [] };
  const facts = parsed.data;

  const drifts: DnaDrift[] = [];

  // ── staff: พนักงานจริง (active) ต่างจากที่ตั้งไว้ ≥ 3 คน และต่างเกิน 50% ──
  const staffLive = await sumOverSystems(tenantId, "HR", (db) => db.hrEmployee.count({ where: { active: true } }));
  const staffDiff = Math.abs(staffLive - facts.staffCount);
  if (staffDiff >= 3 && staffDiff / Math.max(staffLive, facts.staffCount, 1) > 0.5) {
    drifts.push({
      key: "staff",
      factValue: facts.staffCount,
      liveValue: staffLive,
      message: `ตอนตั้งค่าระบุพนักงาน ${facts.staffCount} คน แต่ตอนนี้มีพนักงานที่ยังทำงานอยู่จริง ${staffLive} คน`,
    });
  }

  // ── membership: ตั้งว่าไม่มีระบบสมาชิก แต่มีลูกค้าในระบบ > 20 ──
  if (facts.membership === false) {
    const customerLive = await sumOverSystems(tenantId, "MEMBER", (db) => db.customer.count());
    if (customerLive > 20) {
      drifts.push({
        key: "membership",
        factValue: false,
        liveValue: customerLive,
        message: `ตอนตั้งค่ายังไม่ได้เปิดระบบสมาชิก แต่ตอนนี้มีลูกค้าในระบบแล้ว ${customerLive} คน`,
      });
    }
  }

  // ── sellsGoods: ตั้งว่าไม่ได้ขายสินค้าหน้าร้าน แต่มีบิลขายชำระแล้ว > 10 ──
  if (facts.sellsGoods === false) {
    const paidLive = await sumOverSystems(tenantId, "POS", (db) => db.posSale.count({ where: { status: "PAID" } }));
    if (paidLive > 10) {
      drifts.push({
        key: "sellsGoods",
        factValue: false,
        liveValue: paidLive,
        message: `ตอนตั้งค่าระบุว่าไม่ได้ขายสินค้าหน้าร้าน แต่มีบิลขายที่ชำระเงินแล้ว ${paidLive} ใบ`,
      });
    }
  }

  // ── vat: ตั้งว่าไม่ได้จด VAT แต่มีเอกสารบัญชีที่มีภาษีมูลค่าเพิ่ม > 0 ──
  if (facts.vatRegistered === false) {
    const vatDocs = await sumOverSystems(tenantId, "ACCOUNT", (db) =>
      db.accountDocument.count({ where: { vatAmount: { gt: 0 } } }),
    );
    if (vatDocs > 0) {
      drifts.push({
        key: "vat",
        factValue: false,
        liveValue: vatDocs,
        message: `ตอนตั้งค่าระบุว่าไม่ได้จดทะเบียน VAT แต่มีเอกสารบัญชีที่มีภาษีมูลค่าเพิ่มอยู่ ${vatDocs} ฉบับ`,
      });
    }
  }

  // ── branch: จำนวนหน่วยธุรกิจจริง ต่างจาก branchCount ที่ตั้งไว้ ≥ 2 ──
  let branchLive = facts.branchCount;
  try {
    branchLive = await tenantDb({ tenantId }).businessUnit.count();
  } catch {
    branchLive = facts.branchCount; // นับไม่ได้ → ไม่ถือว่า drift
  }
  const branchDiff = Math.abs(branchLive - facts.branchCount);
  if (branchDiff >= 2) {
    drifts.push({
      key: "branch",
      factValue: facts.branchCount,
      liveValue: branchLive,
      message: `ตอนตั้งค่าระบุ ${facts.branchCount} สาขา แต่ตอนนี้มีหน่วยธุรกิจจริง ${branchLive} แห่ง`,
    });
  }

  return { drifts };
}

/**
 * กวาดตรวจ drift ทุกร้าน — วน tenant ACTIVE ที่มี DnaProfile (cap 50/รอบ)
 * drift ≥ 1 → สร้าง AppNotification ชวนคุยกับผู้ช่วย AI (M4) เพื่ออัปเดตระบบ
 * กันสแปม: มี noti title เดียวกันภายใน 7 วันล่าสุด → ข้าม · ร้านพัง catch แล้วไปต่อ
 * คืนจำนวนร้านที่ส่งแจ้งเตือนใหม่สำเร็จ
 */
export async function sweepDnaReview(now: Date = new Date()): Promise<number> {
  // DnaProfile ไม่มี relation บน Tenant → หา tenantId ที่มี profile ก่อน แล้วกรอง ACTIVE
  // (sweep ข้ามร้าน = อยู่นอกบริบทร้านใดร้านหนึ่ง → ใช้ prisma ตรงได้ ไฟล์อยู่ src/lib/ai)
  const profiles = await prisma.dnaProfile.findMany({ select: { tenantId: true } });
  const ids = profiles.map((p) => p.tenantId);
  if (ids.length === 0) return 0;

  const tenants = await prisma.tenant.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    select: { id: true },
    take: 50, // cap 50/รอบ
  });

  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  let sent = 0;

  for (const t of tenants) {
    try {
      const { drifts } = await gatherDnaDrift({ tenantId: t.id });
      if (drifts.length === 0) continue;

      // กันสแปม — ส่ง noti ชนิดนี้ไปแล้วภายใน 7 วัน → ข้าม
      const recent = await prisma.appNotification.count({
        where: { tenantId: t.id, title: REVIEW_TITLE, createdAt: { gte: sevenDaysAgo } },
      });
      if (recent > 0) continue;

      const body = [
        "เราเห็นว่าข้อมูลจริงของธุรกิจคุณเริ่มต่างจากตอนตั้งค่าไว้:",
        ...drifts.map((d) => `• ${d.message}`),
        "",
        "อยากให้ช่วยปรับระบบให้ตรงกับธุรกิจตอนนี้ไหม? ทักคุยกับผู้ช่วย AI ได้เลย",
      ].join("\n");

      await prisma.appNotification.create({ data: { tenantId: t.id, title: REVIEW_TITLE, body } });
      sent += 1;
    } catch {
      // ร้านนี้พัง → ข้ามไปทำร้านถัดไป (cron ต้องไม่ล้มทั้งรอบ)
    }
  }
  return sent;
}
