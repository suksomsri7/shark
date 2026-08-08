// เติมเครดิตผู้ช่วย AI ด้วยบัตรเครดิต (Beam) — แพ็กเกจ + สร้างรายการ + รับผลจาก webhook
//
// เส้นทางเงิน: กดแพ็กเกจ → createCharge(Beam) → ผู้ใช้กรอกบัตรบน Beam → Beam ยิง webhook → เครดิตเข้ากระเป๋า
// 🔴 เครดิตเข้าเฉพาะตอน webhook ยืนยันเท่านั้น — ห้ามเชื่อการ redirect กลับจากเบราว์เซอร์ (ปลอมได้)
//
// referenceId พก tenantId + จำนวนไมโครดอลลาร์ติดไปกับรายการ → webhook ไม่ต้องมีตารางค้างกลาง
// (ยอดที่เติมยังถูกตรวจซ้ำกับยอดเงินที่ Beam บอกว่าจ่ายจริง — กันแก้ค่าที่ referenceId)

import { MICRO_PER_USD } from "./pricing";
import { topUp } from "./credit";

/** ผลการเริ่มเติมเครดิต — ประกาศไว้นอกไฟล์ "use server" (ไฟล์ use server ห้ามมี export type) */
export type StartTopUpResult = { ok: true; url: string } | { ok: false; message: string };

export const REF_PREFIX = "aicredit";

/** อัตราแลกเปลี่ยนที่ใช้ตั้งราคาแพ็กเกจ (บาทต่อดอลลาร์) — ตั้ง env ทับได้เมื่อค่าเงินขยับ */
export function thbPerUsd(): number {
  const v = Number(process.env.SHARK_THB_PER_USD);
  return Number.isFinite(v) && v > 0 ? v : 36;
}

export type TopUpPack = { id: string; usd: number; satang: number; label: string; popular?: boolean };

export function topUpPacks(): TopUpPack[] {
  const rate = thbPerUsd();
  return [10, 25, 50, 100].map((usd, i) => ({
    id: `usd${usd}`,
    usd,
    satang: Math.round(usd * rate * 100),
    label: `$${usd}`,
    ...(i === 1 ? { popular: true } : {}),
  }));
}

export function packById(id: string): TopUpPack | null {
  return topUpPacks().find((p) => p.id === id) ?? null;
}

export function buildReference(tenantId: string, microUsd: number, nonce: string): string {
  return `${REF_PREFIX}:${tenantId}:${microUsd}:${nonce}`;
}

export type ParsedRef = { tenantId: string; microUsd: number; nonce: string };

/** อ่าน referenceId กลับ — รูปแบบไม่ตรง = null (webhook จะเมินรายการนั้น ไม่เดา) */
export function parseReference(ref: string): ParsedRef | null {
  const parts = String(ref ?? "").split(":");
  if (parts.length !== 4 || parts[0] !== REF_PREFIX) return null;
  const [, tenantId, microStr, nonce] = parts;
  const microUsd = Number(microStr);
  if (!tenantId || !nonce || !Number.isFinite(microUsd) || microUsd <= 0) return null;
  return { tenantId, microUsd, nonce };
}

/**
 * ลงเครดิตจากผลชำระเงินที่ยืนยันแล้ว — idempotent ต่อ chargeId
 * ตรวจซ้ำว่ายอดที่จ่ายจริงไม่ต่ำกว่าที่ referenceId อ้าง (กันแก้ค่าฝั่ง client)
 */
export async function creditFromCharge(input: {
  referenceId: string;
  chargeId: string;
  paidSatang: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const parsed = parseReference(input.referenceId);
  if (!parsed) return { ok: false, reason: "bad_reference" };

  const expectedSatang = Math.round((parsed.microUsd / MICRO_PER_USD) * thbPerUsd() * 100);
  // ยอมคลาดเคลื่อนได้ 1 บาท (ปัดเศษ/ค่าธรรมเนียมปลายทาง) แต่จ่ายน้อยกว่านั้น = ไม่เติม
  if (input.paidSatang + 100 < expectedSatang) return { ok: false, reason: "amount_mismatch" };

  await topUp(parsed.tenantId, parsed.microUsd, {
    ref: input.chargeId,
    note: `เติมเครดิตผ่านบัตรเครดิต (${(parsed.microUsd / MICRO_PER_USD).toFixed(2)} USD)`,
  });
  return { ok: true };
}
