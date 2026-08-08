// POST /api/payment/beam/webhook — Beam แจ้งผลการชำระเงินกลับมา
//
// 🔴 นี่คือจุดเดียวที่เครดิตเข้ากระเป๋าได้ — ห้ามมีเส้นทางอื่นเติมเครดิตจากฝั่งเบราว์เซอร์
// ลำดับ: อ่าน raw body → ตรวจลายเซ็น HMAC → ดูสถานะ → ลงเครดิต (idempotent ต่อ chargeId)
// ลายเซ็นไม่ผ่าน = 401 สั้น ๆ ไม่บอกรายละเอียด · payload เพี้ยน = 200 (กัน Beam ยิงซ้ำไม่รู้จบ)

import { verifyWebhook } from "@/lib/payment/beam";
import { creditFromCharge } from "@/lib/ai/topup";
import { logOps } from "@/lib/core/ops";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  // ต้องอ่าน raw text ก่อน parse — HMAC คิดจากไบต์ดิบ (JSON.stringify ใหม่ = ลายเซ็นไม่ตรง)
  const raw = await req.text();
  const sig =
    req.headers.get("x-beam-signature") ??
    req.headers.get("beam-signature") ??
    req.headers.get("x-signature");

  if (!verifyWebhook(raw, sig)) {
    await logOps("WARN", "payment", "Beam webhook ลายเซ็นไม่ผ่าน", { detail: raw.slice(0, 200) });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    chargeId?: string;
    id?: string;
    referenceId?: string;
    status?: string;
    state?: string;
    amount?: number;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: true, ignored: "bad_json" }, { status: 200 });
  }

  const chargeId = body.chargeId ?? body.id ?? "";
  const status = String(body.status ?? body.state ?? "").toUpperCase();
  // เติมเฉพาะรายการที่จ่ายสำเร็จจริง — สถานะอื่น (PENDING/FAILED/EXPIRED) แค่รับทราบ
  if (!chargeId || !["SUCCEEDED", "SUCCESS", "PAID", "COMPLETED"].includes(status)) {
    return Response.json({ ok: true, ignored: status || "no_status" }, { status: 200 });
  }

  const result = await creditFromCharge({
    referenceId: String(body.referenceId ?? ""),
    chargeId,
    paidSatang: Math.round(Number(body.amount ?? 0)),
  });

  if (!result.ok) {
    await logOps("ERROR", "payment", "Beam webhook เติมเครดิตไม่สำเร็จ", {
      detail: `${result.reason} · charge ${chargeId} · ref ${body.referenceId}`,
    });
    // ตอบ 200 อยู่ดี: ปัญหาอยู่ที่ข้อมูล ไม่ใช่ที่การส่ง — ให้ Beam เลิกยิงซ้ำแล้วมาดูที่ log
    return Response.json({ ok: false, reason: result.reason }, { status: 200 });
  }
  return Response.json({ ok: true }, { status: 200 });
}
