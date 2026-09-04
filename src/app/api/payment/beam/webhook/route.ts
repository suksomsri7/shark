// POST /api/payment/beam/webhook — Beam แจ้งผลการชำระเงินกลับมา
//
// 🔴 นี่คือจุดเดียวที่เครดิตเข้ากระเป๋าได้ — ห้ามมีเส้นทางอื่นเติมเครดิตจากฝั่งเบราว์เซอร์
// ลำดับ: อ่าน raw body → ตรวจลายเซ็น HMAC → ดูสถานะ → ลงเครดิต (idempotent ต่อ chargeId)
// ลายเซ็นไม่ผ่าน = 401 สั้น ๆ ไม่บอกรายละเอียด · payload เพี้ยน = 200 (กัน Beam ยิงซ้ำไม่รู้จบ)

import { createHash } from "node:crypto";
import { verifyWebhook } from "@/lib/payment/beam";
import { creditFromCharge } from "@/lib/ai/topup";
import { handleAccountCharge } from "@/lib/modules/account/index";
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
    // 🔴 WO 9.2 ข้อ 5 — ห้ามทิ้ง body ดิบลง log: คำขอนี้ **ยังไม่ผ่านลายเซ็น** ⇒ เนื้อหาเป็นของ
    //    คนนอกล้วน (ยัดข้อความปลอม/ข้อมูลส่วนบุคคลเข้ามาให้เราเก็บไว้ก็ได้) · เก็บแค่ขนาด+ลายนิ้วมือ
    //    ที่พอไล่จับคู่คำขอเดิมได้ตอนดีบัก
    const fp = createHash("sha256").update(raw).digest("hex").slice(0, 16);
    await logOps("WARN", "payment", "Beam webhook ลายเซ็นไม่ผ่าน", {
      detail: `body ${raw.length} ไบต์ · sha256:${fp} · sig ${sig ? "มี" : "ไม่มี"}`,
    });
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
  const referenceId = String(body.referenceId ?? "");
  const status = String(body.status ?? body.state ?? "").toUpperCase();
  const paidSatang = Math.round(Number(body.amount ?? 0));
  const succeeded = ["SUCCEEDED", "SUCCESS", "PAID", "COMPLETED"].includes(status);

  // ── WO 5.5: แยกปลายทางตามคำนำหน้าของ referenceId ──
  //    "acc:<id คำขอ>" = เก็บเงินของโมดูลบัญชี (ลิงก์+QR PromptPay) · อย่างอื่น = เติมเครดิต AI (ของเดิม)
  //    🔴 ห้าม log ข้อมูลลูกค้า — บันทึกได้แค่ referenceId/chargeId/สถานะ
  if (referenceId.startsWith("acc:")) {
    const accRes = await handleAccountCharge({ referenceId, chargeId, paidSatang, status });
    if (!accRes.ok) {
      await logOps("ERROR", "payment", "Beam webhook (บัญชี) บันทึกรับชำระไม่สำเร็จ", {
        detail: `${accRes.reason} · charge ${chargeId} · ref ${referenceId} · status ${status}`,
      });
      return Response.json({ ok: false, reason: accRes.reason }, { status: 200 });
    }
    await logOps("INFO", "payment", "Beam webhook (บัญชี) รับทราบแล้ว", {
      detail: `charge ${chargeId} · ref ${referenceId} · status ${status} · handled ${accRes.handled}`,
    });
    return Response.json({ ok: true, handled: accRes.handled }, { status: 200 });
  }

  // เติมเฉพาะรายการที่จ่ายสำเร็จจริง — สถานะอื่น (PENDING/FAILED/EXPIRED) แค่รับทราบ
  if (!chargeId || !succeeded) {
    return Response.json({ ok: true, ignored: status || "no_status" }, { status: 200 });
  }

  const result = await creditFromCharge({
    referenceId,
    chargeId,
    paidSatang,
  });

  if (!result.ok) {
    await logOps("ERROR", "payment", "Beam webhook เติมเครดิตไม่สำเร็จ", {
      detail: `${result.reason} · charge ${chargeId} · ref ${referenceId}`,
    });
    // ตอบ 200 อยู่ดี: ปัญหาอยู่ที่ข้อมูล ไม่ใช่ที่การส่ง — ให้ Beam เลิกยิงซ้ำแล้วมาดูที่ log
    return Response.json({ ok: false, reason: result.reason }, { status: 200 });
  }
  return Response.json({ ok: true }, { status: 200 });
}
