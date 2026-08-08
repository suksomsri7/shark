// Beam Checkout — รับบัตรเครดิตสำหรับ "เติมเครดิตผู้ช่วย AI"
//
// 🔑 ต้องมี env 3 ตัวถึงจะเปิดใช้ได้ (ยังไม่มี = ปุ่มเติมเครดิตแจ้งว่ายังไม่เปิด ไม่พังหน้า):
//    BEAM_MERCHANT_ID · BEAM_API_KEY · BEAM_WEBHOOK_SECRET
// เอกสาร Beam: สร้าง charge → ผู้ใช้จ่ายบนหน้า Beam → Beam ยิง webhook กลับมาบอกผล
//
// กติกาความปลอดภัย:
// - เครดิตเข้ากระเป๋า **เฉพาะตอน webhook ยืนยันว่าจ่ายสำเร็จ** เท่านั้น (ห้ามเชื่อ redirect กลับจากเบราว์เซอร์)
// - ยอดเงินที่เติมอ่านจาก payload ของ Beam ไม่ใช่จาก client (กันแก้ราคาหน้าเว็บ)
// - webhook ตรวจลายเซ็น HMAC-SHA256 ก่อนเสมอ + เทียบแบบ timing-safe

import crypto from "node:crypto";

const BASE = process.env.BEAM_API_BASE || "https://api.beamcheckout.com";

export type BeamConfig = { merchantId: string; apiKey: string; webhookSecret: string };

/** อ่าน config — ขาดตัวใดตัวหนึ่ง = ยังไม่เปิดใช้ (คืน null ห้าม throw) */
export function beamConfig(): BeamConfig | null {
  const merchantId = process.env.BEAM_MERCHANT_ID?.trim();
  const apiKey = process.env.BEAM_API_KEY?.trim();
  const webhookSecret = process.env.BEAM_WEBHOOK_SECRET?.trim();
  if (!merchantId || !apiKey || !webhookSecret) return null;
  return { merchantId, apiKey, webhookSecret };
}

export function beamEnabled(): boolean {
  return beamConfig() !== null;
}

/**
 * สร้างรายการชำระเงิน → คืน URL ให้ผู้ใช้ไปกรอกบัตร
 * amountSatang = จำนวนเงินบาทเป็นสตางค์ (Beam คิดเป็นหน่วยย่อยของสกุลเงิน)
 * referenceId = กุญแจกันซ้ำของเรา — จะย้อนกลับมาใน webhook
 */
export async function createCharge(input: {
  amountSatang: number;
  referenceId: string;
  description: string;
  returnUrl: string;
}): Promise<{ url: string; chargeId: string } | { error: string }> {
  const cfg = beamConfig();
  if (!cfg) return { error: "beam_not_configured" };

  const res = await fetch(`${BASE}/api/v1/charges`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${cfg.merchantId}:${cfg.apiKey}`).toString("base64"),
    },
    body: JSON.stringify({
      amount: Math.round(input.amountSatang),
      currency: "THB",
      referenceId: input.referenceId,
      description: input.description,
      returnUrl: input.returnUrl,
      paymentMethod: { paymentMethodType: "CARD" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { error: `beam_${res.status}: ${body.slice(0, 160)}` };
  }
  const data = (await res.json()) as {
    chargeId?: string;
    id?: string;
    paymentMethod?: { card?: { redirectUrl?: string } };
    redirectUrl?: string;
    encryptedChargeId?: string;
  };
  const url = data.paymentMethod?.card?.redirectUrl ?? data.redirectUrl;
  const chargeId = data.chargeId ?? data.id;
  if (!url || !chargeId) return { error: "beam_bad_response" };
  return { url, chargeId };
}

/**
 * ตรวจลายเซ็น webhook — HMAC-SHA256 ของ raw body ด้วย webhookSecret
 * ⚠️ ต้องใช้ **raw body ดิบ** ไม่ใช่ JSON ที่ parse แล้ว serialize ใหม่ (ไบต์เปลี่ยน = ลายเซ็นไม่ตรง)
 */
export function verifyWebhook(rawBody: string, signature: string | null): boolean {
  const cfg = beamConfig();
  if (!cfg || !signature) return false;
  const expected = crypto.createHmac("sha256", cfg.webhookSecret).update(rawBody, "utf8").digest("hex");
  const got = signature.trim().toLowerCase().replace(/^sha256=/, "");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(got, "utf8");
  if (a.length !== b.length) return false; // timingSafeEqual โยนถ้าความยาวต่าง
  return crypto.timingSafeEqual(a, b);
}
