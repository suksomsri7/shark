// channel-text.ts — ตัวช่วยข้อความของช่องทางขาย (POS P2.1U · ภาพ 10/12/09) — บริสุทธิ์ · client import ได้
//   ชื่อแบรนด์ + อักษรย่อของแพลตฟอร์มสำเร็จรูป (ชื่อเฉพาะ ไม่แปล) · ชื่อช่องทางตามภาษาจอ · บรรทัดสรุปค่าคอมฯ · อัตรา % / ฿
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ (ST7 ของ P1.18) — คำทั้งหมดมาจาก t() ของ pos.channel
// 🔴 import เฉพาะ channel-shared.ts (บริสุทธิ์) + register-shared.ts (moneyText) — ห้ามแตะโมดูลที่ถึง prisma

import { CHANNEL_BUILTIN_NAMES, isChannelBuiltinCode, type ChannelCommissionRates, type ChannelPayout } from "@/lib/modules/pos/channel-shared";
import { moneyText } from "@/lib/modules/pos/register-shared";

export type ChannelT = (key: string, values?: Record<string, string | number>) => string;

/** แพลตฟอร์มสำเร็จรูป: ชื่อแบรนด์ (ใช้เป็นชื่อช่องทางตอน "เชื่อมต่อ") + อักษรย่อบนป้าย 32px (ภาพ 10) */
export const CHANNEL_PRESET_BRAND: Readonly<Record<string, { name: string; initials: string }>> = {
  LINEMAN: { name: "LINE MAN", initials: "LM" },
  GRAB: { name: "Grab", initials: "G" },
  SHOPEE: { name: "Shopee", initials: "S" },
  FOODPANDA: { name: "foodpanda", initials: "fp" },
  LAZADA: { name: "Lazada", initials: "LZ" },
  TIKTOK: { name: "TikTok Shop", initials: "TT" },
};
/** แถว "เชื่อมต่อ" ของภาพ 10 (เดลิเวอรีอาหาร 4 ราย) — แพลตฟอร์มอื่นเพิ่มผ่าน "+ เพิ่มช่องทางอื่น" (รหัสมีใน datalist) */
export const CHANNEL_CONNECT_PRESETS = ["LINEMAN", "GRAB", "SHOPEE", "FOODPANDA"] as const;

/** bp → "30" / "25.5" (ทศนิยม ≤ 2) */
export const pctText = (bp: number): string => String(Number((bp / 100).toFixed(2)));

/** ชื่อช่องทางตามภาษาจอ: builtin ที่ยังใช้ชื่อตั้งต้น = คำแปล pos.channel.builtin.* · ชื่อที่ร้านตั้งเอง = ตามที่ตั้ง (ข้อมูล ไม่แปล) */
export function channelDisplayName(code: string, name: string, t: ChannelT): string {
  if (isChannelBuiltinCode(code) && name === CHANNEL_BUILTIN_NAMES[code]) return t(`builtin.${code}`);
  return name;
}

/** อัตราค่าคอมฯ: "30%" · "25% + ฿2" · "฿15" · ไม่มี = "" */
export function channelRateText(r: Pick<ChannelCommissionRates, "commissionBp" | "commissionFixedSatang">): string {
  const parts: string[] = [];
  if (r.commissionBp > 0) parts.push(`${pctText(r.commissionBp)}%`);
  if (r.commissionFixedSatang > 0) parts.push(moneyText(r.commissionFixedSatang));
  return parts.join(" + ");
}

/**
 * บรรทัดรองของแถวช่องทาง (ภาพ 10 · มติ 1): PLATFORM = "ค่าคอมฯ 30% + ฿2 · VAT 7% · แพลตฟอร์มโอนให้" ·
 * DIRECT มีค่าคอมฯ = "ค่าคอมฯ 10% · ร้านเก็บเอง" · DIRECT ไม่มีค่าคอมฯ = "ไม่มีค่าคอมฯ" · PLATFORM ไม่มีค่าคอมฯ = "ไม่มีค่าคอมฯ · แพลตฟอร์มโอนให้"
 */
export function channelSummary(c: ChannelCommissionRates & { payout: ChannelPayout }, t: ChannelT): string {
  const rate = channelRateText(c);
  const payout = t(c.payout === "PLATFORM" ? "summary.platformPays" : "summary.directPays");
  if (!rate) return c.payout === "PLATFORM" ? t("summary.noneWith", { payout }) : t("summary.none");
  return c.commissionVatBp > 0 ? t("summary.full", { rate, vat: pctText(c.commissionVatBp), payout }) : t("summary.commission", { rate, payout });
}
