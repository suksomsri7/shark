// pdpa.ts — PDPA: export ข้อมูลร้าน + ขอลบร้าน + purge หลัง 30 วัน (WO-0042)
// อยู่ระดับ platform → ใช้ prisma ตรงได้ (กวาด/ลบข้ามหลายร้านในรอบ cron เดียว)
// 🔴 กติกาเหล็ก: ทุก query ในไฟล์นี้กรอง { tenantId } เท่านั้น — ห้ามลบข้ามร้านเด็ดขาด
//    (sweepPendingDeletes ลบร้าน A ต้องไม่แตะข้อมูลร้าน B)

import { prisma } from "@/lib/core/db";
import { registeredModels, scopeOf } from "@/lib/core/scope";

// delegate แบบหลวม ๆ สำหรับเข้าถึง model ด้วยชื่อ dynamic
type ModelDelegate = {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
};
const client = prisma as unknown as Record<string, ModelDelegate>;

// ชื่อ model (PascalCase) → client key (ตัวแรกเล็ก) — เช่น "AppNotification" → "appNotification"
const clientKey = (model: string): string => model.charAt(0).toLowerCase() + model.slice(1);

// ทุก model ที่ผูก tenant จริง (axis tenant/unit/system มี tenantId ทุกตัว)
// ข้าม global (Tenant/User/Session/Membership/…) + platform (backoffice)
function tenantScopedModels(): string[] {
  return registeredModels().filter((m) => {
    const a = scopeOf(m).axis;
    return a === "tenant" || a === "unit" || a === "system";
  });
}

const DAY_MS = 86_400_000;

// ─────────────────────────────────────────────────────────────
// EXPORT — ดึงข้อมูลทุกตารางของร้านเป็น JSON (PDPA data portability)
// โครง: { exportedAt, tenantId, data: { <ModelName>: rows[] } }
// วนทะเบียน scope → findMany({ where: { tenantId } }) ต่อ model → ไม่มีข้อมูลร้านอื่นปน
// ─────────────────────────────────────────────────────────────
export async function exportTenantData(tenantId: string): Promise<string> {
  const data: Record<string, unknown[]> = {};
  for (const model of tenantScopedModels()) {
    try {
      const rows = await client[clientKey(model)].findMany({ where: { tenantId } });
      if (rows.length > 0) data[model] = rows; // เก็บเฉพาะตารางที่มีข้อมูลจริง (export กระชับ)
    } catch {
      // ตารางที่ query ไม่ได้ (เช่นยังไม่ migrate) → ข้าม ไม่ให้ทั้ง export ล้ม
    }
  }
  return JSON.stringify({ exportedAt: new Date().toISOString(), tenantId, data }, null, 2);
}

// ─────────────────────────────────────────────────────────────
// REQUEST / CANCEL — สลับสถานะร้าน (ฝั่งร้าน OWNER เรียกผ่าน action; service ไม่เช็ค role)
// ─────────────────────────────────────────────────────────────

// ACTIVE → PENDING_DELETE + ประทับเวลา (เริ่มนับถอยหลัง 30 วัน)
export async function requestTenantDeletion(tenantId: string): Promise<boolean> {
  const res = await prisma.tenant.updateMany({
    where: { id: tenantId, status: "ACTIVE" },
    data: { status: "PENDING_DELETE", deleteRequestedAt: new Date() },
  });
  return res.count > 0;
}

// PENDING_DELETE → ACTIVE + ล้างเวลา (ยกเลิกก่อนครบกำหนด)
export async function cancelTenantDeletion(tenantId: string): Promise<boolean> {
  const res = await prisma.tenant.updateMany({
    where: { id: tenantId, status: "PENDING_DELETE" },
    data: { status: "ACTIVE", deleteRequestedAt: null },
  });
  return res.count > 0;
}

// ─────────────────────────────────────────────────────────────
// PURGE — ลบข้อมูลร้าน 1 ร้านให้หมดเกลี้ยง (children-first ผ่านการวนซ้ำ)
// FK ชน (ลบ parent ก่อน child) = catch แล้วเก็บไว้รอบถัดไป · สูงสุด 5 รอบ
// 🔴 ทุก deleteMany กรอง { tenantId } เท่านั้น — ไม่มีทางลบข้ามร้าน
// ─────────────────────────────────────────────────────────────
async function purgeTenantRows(tenantId: string): Promise<string[]> {
  let remaining = tenantScopedModels();
  for (let round = 0; round < 5 && remaining.length > 0; round++) {
    const failed: string[] = [];
    for (const model of remaining) {
      try {
        await client[clientKey(model)].deleteMany({ where: { tenantId } });
      } catch {
        failed.push(model); // ติด FK — child ยังไม่ถูกลบ → รอรอบถัดไป
      }
    }
    if (failed.length === remaining.length) break; // ไม่คืบในรอบนี้ → หยุด (กันวนเปล่า)
    remaining = failed;
  }
  return remaining; // ควรว่าง — ถ้าเหลือ = ยังลบไม่หมด (จะไม่ลบ Tenant รอบนี้)
}

// tenant PENDING_DELETE ที่ deleteRequestedAt < now-graceDays → ลบจริงทุกตาราง + Tenant
// คืนจำนวนร้านที่ลบสำเร็จ · idempotent (รันซ้ำ = 0 เพราะร้านหายไปแล้ว)
export async function sweepPendingDeletes(now: Date = new Date(), graceDays = 30): Promise<number> {
  const cutoff = new Date(now.getTime() - graceDays * DAY_MS);
  const due = await prisma.tenant.findMany({
    where: { status: "PENDING_DELETE", deleteRequestedAt: { not: null, lt: cutoff } },
    select: { id: true },
  });

  let purged = 0;
  for (const { id: tenantId } of due) {
    try {
      // 1) ลบข้อมูลทุกตารางของร้าน (children-first วนซ้ำ)
      const leftover = await purgeTenantRows(tenantId);
      if (leftover.length > 0) continue; // ยังลบไม่หมด → ทิ้งไว้รอบหน้า ไม่ลบ Tenant

      // 2) ล้าง session ของสมาชิกที่มีร้านนี้ร้านเดียว (บังคับ re-auth · ไม่แตะคนหลายร้าน)
      const memberships = await prisma.membership.findMany({
        where: { tenantId },
        select: { userId: true },
      });
      const userIds = [...new Set(memberships.map((m) => m.userId))];
      for (const userId of userIds) {
        const otherTenants = await prisma.membership.count({
          where: { userId, tenantId: { not: tenantId } },
        });
        if (otherTenants === 0) await prisma.session.deleteMany({ where: { userId } });
      }

      // 3) ลบ Membership ของร้าน แล้วลบ Tenant เป็นลำดับสุดท้าย
      await prisma.membership.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
      purged++;
    } catch {
      // ร้านนี้ลบไม่สำเร็จ (FK ค้าง/ชนกันชั่วคราว) → ข้าม รอบถัดไปค่อยลองใหม่ (idempotent)
    }
  }
  return purged;
}
