"use server";

// server actions ของหน้าเครดิต AI — tenantId มาจาก session เสมอ (ห้ามรับจาก client)

import crypto from "node:crypto";
import { requireTenant } from "@/lib/core/context";
import { env } from "@/lib/env";
import { beamEnabled, createCharge } from "@/lib/payment/beam";
import { buildReference, packById, type StartTopUpResult } from "./topup";
import { listTxns } from "./credit";
import { MICRO_PER_USD } from "./pricing";

/** เริ่มเติมเครดิต → คืน URL หน้ากรอกบัตรของ Beam (เครดิตยังไม่เข้าจนกว่า webhook จะยืนยัน) */
export async function startTopUpAction(packId: string): Promise<StartTopUpResult> {
  const auth = await requireTenant();
  // เจ้าของเท่านั้น — เป็นการผูกพันทางการเงินของกิจการ
  if (auth.active.role !== "OWNER") {
    return { ok: false, message: "เฉพาะเจ้าของกิจการเท่านั้นที่เติมเครดิตได้" };
  }
  if (!beamEnabled()) {
    return {
      ok: false,
      message: "ช่องทางชำระเงินยังไม่เปิดใช้ — รอเชื่อมบัตรเครดิต (Beam) ให้เรียบร้อยก่อน",
    };
  }
  const pack = packById(packId);
  if (!pack) return { ok: false, message: "ไม่พบแพ็กเกจที่เลือก" };

  const micro = Math.round(pack.usd * MICRO_PER_USD);
  const ref = buildReference(auth.active.tenantId, micro, crypto.randomUUID().slice(0, 8));
  const charge = await createCharge({
    amountSatang: pack.satang,
    referenceId: ref,
    description: `เครดิตผู้ช่วย AI ${pack.label} — ${auth.active.tenant.name}`,
    returnUrl: `${env.APP_URL}/app/settings/credit?paid=1`,
  });
  if ("error" in charge) {
    return { ok: false, message: "สร้างรายการชำระเงินไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
  return { ok: true, url: charge.url };
}

/** โหลดรายการเดินบัญชีหน้าถัดไป (ปุ่ม "ดูเพิ่ม" ในหน้าประวัติ) */
export async function loadMoreTxnsAction(cursor: string) {
  const auth = await requireTenant();
  const { rows, nextCursor } = await listTxns(auth.active.tenantId, { take: 20, cursor });
  return {
    rows: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    nextCursor,
  };
}
