// kanban-qc-env.mts — ค่าคงที่ + ตัวหาขอบเขตของชุดข้อมูล QC "บอร์ดงาน" (RUN kanban→Trello)
//
// ใช้คู่กับ `acc-v2-env.mts` (loadQcEnv = โหลด .env.qc + ด่านกัน prod ตัวเดียวกัน)
// 🔴 ไฟล์นี้ไม่ import prisma เอง — ผู้เรียกส่ง PrismaClient เข้ามา (ข้อสอบแต่ละชุด import db เอง)

export const KQC = {
  tenantName: "SIAM DIVE KANBAN QC",
  tenantSlug: "siam-dive-kanban-qc",
  ownerEmail: "kb-owner@shark.local",
  ownerName: "เจ้าของร้าน (KB QC)",
  managerEmail: "kb-manager-patong@shark.local",
  staff: [
    { key: "thana", email: "kb-thana@shark.local", name: "ธนา ศรีสมบัติ" },
    { key: "pook", email: "kb-pook@shark.local", name: "ปุ๊ก มณีรัตน์" },
    { key: "kitti", email: "kb-kitti@shark.local", name: "กิตติ ช่างอุปกรณ์" },
  ],
  noPermEmail: "kb-noperm@shark.local",
  units: [
    { key: "patong", name: "สาขาป่าตอง", slug: "patong" },
    { key: "kata", name: "สาขากะตะ", slug: "kata" },
  ],
  boards: {
    patong: "งานร้าน — สาขาป่าตอง",
    maint: "ซ่อมบำรุงอุปกรณ์",
    kataSecret: "บอร์ดลับสาขากะตะ",
  },
  expectedPath: "scripts/kanban-expected.json",
  shotsDir: ".qc-shots/kanban",
  /** วันอ้างอิงของชุดข้อมูล (ตรึงให้ผลนิ่ง — กำหนดส่งทุกใบคำนวณจากวันนี้) */
  today: "2026-09-30",
  oracleValidUntil: "2026-10-31",
} as const;

type MinimalPrisma = {
  tenant: { findFirst: (a: unknown) => Promise<{ id: string } | null> };
  appSystem: { findFirst: (a: unknown) => Promise<{ id: string } | null> };
};

/** คืน tenantId/systemId ของร้าน QC บอร์ดงาน จากคีย์ที่เสถียร (slug + type) · null = ยังไม่ได้ seed */
export async function resolveKanbanScope(prisma: MinimalPrisma): Promise<{ tenantId: string; systemId: string } | null> {
  const t = await prisma.tenant.findFirst({ where: { slug: KQC.tenantSlug }, select: { id: true } });
  if (!t) return null;
  const s = await prisma.appSystem.findFirst({ where: { tenantId: t.id, type: "KANBAN" }, select: { id: true }, orderBy: { createdAt: "asc" } });
  if (!s) return null;
  return { tenantId: t.id, systemId: s.id };
}

/** วันที่ `today` + n วัน (UTC เที่ยงคืนของวันไทย = 17:00 UTC วันก่อน — ใช้ 12:00 BKK เพื่อกันเพี้ยนข้ามวัน) */
export function dayFromToday(n: number, hourBkk = 12): Date {
  const [y, m, d] = KQC.today.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n, hourBkk - 7, 0, 0));
}
