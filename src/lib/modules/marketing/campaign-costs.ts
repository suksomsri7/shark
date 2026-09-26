// campaign-costs.ts — ต้นทุนแคมเปญแบบอ่านอย่างเดียวสำหรับโมดูลอื่น (CRM C3.1 · แท็บ "ที่มา/ROI" ของรายงาน CRM)
// 🔴 ทางเดียวที่ CRM อ่านต้นทุนแคมเปญ (มติผู้คุมงาน C3.1 ข้อ 4: ข้อมูลข้ามโมดูลต้องผ่าน facade เจ้าของ — ห้าม SQL ตรงจาก CRM)
// 🔴 ขอบเขต: เฉพาะแคมเปญของร้าน `tenantId` · id เกิน 500 ตัดทิ้ง (IN มีเพดาน) · ต้นทุน = Σ CampaignVariantStat.costSatang
//    รวมในฐานข้อมูล (groupBy) · ไม่มีการเขียนใด ๆ
import { prisma } from "./db";

export const CAMPAIGN_COST_IDS_MAX = 500;

/** id → { ชื่อแคมเปญ, ต้นทุนรวม (สตางค์) } — id ที่ไม่ใช่แคมเปญของร้านนี้ไม่อยู่ในผล */
export async function campaignCostsByIds(tenantId: string, campaignIds: string[]): Promise<Map<string, { name: string; costSatang: number }>> {
  const ids = [...new Set((Array.isArray(campaignIds) ? campaignIds : []).filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64))].slice(0, CAMPAIGN_COST_IDS_MAX);
  if (!tenantId || ids.length === 0) return new Map();
  const camps = await prisma.mktCampaign.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true }, take: CAMPAIGN_COST_IDS_MAX });
  if (camps.length === 0) return new Map();
  const sums = await prisma.campaignVariantStat.groupBy({ by: ["campaignId"], where: { tenantId, campaignId: { in: camps.map((c) => c.id) } }, _sum: { costSatang: true } });
  const cost = new Map(sums.map((s) => [s.campaignId, Number(s._sum.costSatang ?? 0)]));
  return new Map(camps.map((c) => [c.id, { name: c.name, costSatang: cost.get(c.id) ?? 0 }]));
}
