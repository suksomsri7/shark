// onboarding-drip.ts — เช็กลิสต์ "เริ่มต้นร้านให้ครบ" + แจ้งเตือนแนะขั้นถัดไปรายวัน (WO-0072)
// platform-level: prisma ตรง · คำนวณจากข้อมูลจริงล้วน (ไม่มีตารางใหม่)
// - onboardingChecklist(ctx) → 6 ข้อ (ติ๊กอัตโนมัติจาก DB) แสดงบนหน้า /app
// - sweepOnboardingDrip(now?) → drip 1 ฉบับ/วัน BKK ให้ร้านใหม่ (≤14 วัน) ที่ยังทำไม่ครบ

import { prisma } from "@/lib/core/db";

export type OnboardingItem = { key: string; label: string; done: boolean };

const DAY_MS = 86_400_000;
const DRIP_TITLE = "ขั้นถัดไปของร้านคุณ";
const MAX_AGE_DAYS = 14; // ร้านอายุเกินนี้ = ไม่ drip แล้ว
const SWEEP_CAP = 100; // จำกัดจำนวนร้านต่อรอบ

// เรียงตาม key ตามสัญญา: hasSystem → triedAi · label + คำชวนทำ (ไทยล้วน)
const ITEMS: { key: string; label: string; nudge: string }[] = [
  { key: "hasSystem", label: "เปิดระบบแรกของร้าน", nudge: "เปิดระบบแรก เช่น คลังสินค้า ร้านอาหาร หรือสมาชิก" },
  { key: "hasUnit", label: "สร้างสาขา/หน้าร้าน", nudge: "เพิ่มสาขาหรือหน้าร้านแรกของคุณ" },
  { key: "hasProduct", label: "เพิ่มสินค้า/เมนูแรก", nudge: "เพิ่มสินค้าหรือเมนูแรกเข้าระบบ" },
  { key: "hasPromptpay", label: "ตั้งค่าพร้อมเพย์รับเงิน", nudge: "ตั้งค่าพร้อมเพย์เพื่อเริ่มรับชำระเงินหน้าร้าน" },
  { key: "hasTeam", label: "เพิ่มทีมงาน/พนักงาน", nudge: "เชิญทีมงานหรือเพิ่มพนักงานเข้าร้าน" },
  { key: "triedAi", label: "ลองใช้ผู้ช่วย AI", nudge: "ลองคุยกับผู้ช่วย AI เพื่อให้ช่วยจัดการร้านให้ง่ายขึ้น" },
];

// เช็กลิสต์เริ่มต้นร้าน — ทุกข้อคำนวณจากข้อมูลจริง · ตารางไหน error/ไม่มีข้อมูล = false (ห้าม throw)
export async function onboardingChecklist(ctx: { tenantId: string }): Promise<OnboardingItem[]> {
  const { tenantId } = ctx;
  const safe = async (fn: () => Promise<boolean>): Promise<boolean> => {
    try {
      return await fn();
    } catch {
      return false;
    }
  };

  const [hasSystem, hasUnit, hasProduct, hasPromptpay, hasTeam, triedAi] = await Promise.all([
    safe(async () => (await prisma.appSystem.count({ where: { tenantId } })) >= 1),
    safe(async () => (await prisma.businessUnit.count({ where: { tenantId } })) >= 1),
    safe(async () => {
      // สินค้า = InvItem | MenuItem | ShopProduct อย่างน้อย 1
      const [inv, menu, shop] = await Promise.all([
        prisma.invItem.count({ where: { tenantId } }),
        prisma.menuItem.count({ where: { tenantId } }),
        prisma.shopProduct.count({ where: { tenantId } }),
      ]);
      return inv + menu + shop >= 1;
    }),
    safe(async () => {
      const p = await prisma.paymentProfile.findFirst({
        where: { tenantId, promptpayId: { not: null } },
        select: { id: true },
      });
      return p !== null;
    }),
    safe(async () => {
      // ทีม = Membership ของ tenant ≥2 (เจ้าของ+อย่างน้อย 1) หรือ HrEmployee ≥1
      if ((await prisma.membership.count({ where: { tenantId } })) >= 2) return true;
      return (await prisma.hrEmployee.count({ where: { tenantId } })) >= 1;
    }),
    safe(async () => (await prisma.aiConversation.count({ where: { tenantId } })) >= 1),
  ]);

  const doneMap: Record<string, boolean> = { hasSystem, hasUnit, hasProduct, hasPromptpay, hasTeam, triedAi };
  return ITEMS.map((it) => ({ key: it.key, label: it.label, done: doneMap[it.key] ?? false }));
}

// drip รายวัน: ร้าน ACTIVE อายุ ≤14 วัน ที่ยังทำเช็กลิสต์ไม่ครบ → AppNotification 1 ฉบับ/วัน BKK
// ครบทุกข้อ / แก่กว่า 14 วัน → ไม่ส่ง · ร้านไหนพัง catch แล้วไปต่อ · คืนจำนวนที่ส่งจริง
export async function sweepOnboardingDrip(now: Date = new Date()): Promise<number> {
  // ขอบเขต "วันนี้" ตามเวลาไทย เพื่อ idempotent 1 ฉบับ/วัน
  const dayKey = now.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD
  const dayStart = new Date(`${dayKey}T00:00:00+07:00`);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const ageCutoff = new Date(now.getTime() - MAX_AGE_DAYS * DAY_MS); // createdAt ต้อง ≥ ค่านี้

  let tenants: { id: string }[] = [];
  try {
    tenants = await prisma.tenant.findMany({
      where: { status: "ACTIVE", createdAt: { gte: ageCutoff } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: SWEEP_CAP,
    });
  } catch {
    return 0;
  }

  let sent = 0;
  for (const t of tenants) {
    try {
      // ส่งของวันนี้ไปแล้ว → ข้าม (idempotent ต่อวัน BKK)
      const already = await prisma.appNotification.count({
        where: { tenantId: t.id, title: DRIP_TITLE, createdAt: { gte: dayStart, lt: dayEnd } },
      });
      if (already > 0) continue;

      const list = await onboardingChecklist({ tenantId: t.id });
      const firstUndone = list.find((x) => !x.done);
      if (!firstUndone) continue; // ครบทุกข้อ → ไม่ต้อง drip

      const meta = ITEMS.find((i) => i.key === firstUndone.key);
      const nudge = meta?.nudge ?? firstUndone.label;
      await prisma.appNotification.create({
        data: {
          tenantId: t.id,
          title: DRIP_TITLE,
          body: `มาต่อกันเลย — ขั้นถัดไปคือ "${firstUndone.label}"\n${nudge}`,
        },
      });
      sent++;
    } catch {
      // ร้านนี้พัง → ข้ามไปร้านถัดไป
    }
  }
  return sent;
}
