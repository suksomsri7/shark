"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/core/rate-limit";
import { resolveRentalUnit, createBooking } from "@/lib/modules/rental/service";

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const todayBkk = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

// ลูกค้าจองเช่าออนไลน์ (public · ไม่ต้องล็อกอิน) — กรอกจากมือถือ
// resolve unit จาก slug → กันถล่มต่อ IP → createBooking (FOR UPDATE lock กันจองซ้อนในตัว)
//   → publicToken → เด้งไปหน้าสถานะ/จ่ายมัดจำ
// error ทุกกรณี = เด้งกลับหน้าจองพร้อม ?err (inline) — คงช่วงวันที่ไว้
export async function createPublicRentalAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const unitSlug = String(formData.get("unitSlug") ?? "").trim();
  const assetId = String(formData.get("assetId") ?? "").trim();
  const from = String(formData.get("from") ?? "").trim();
  const to = String(formData.get("to") ?? "").trim();
  const customerName = String(formData.get("customerName") ?? "").trim();
  const customerPhoneRaw = String(formData.get("customerPhone") ?? "").trim();

  const base = `/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/rental`;
  const keep = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  // ส่ง "รหัส" ไม่ใช่ข้อความไทย — หน้าจองเช่ารองรับ 2 ภาษา (แปลผ่าน dict rental.err.*)
  const backErr = (
    code: "rate" | "shop" | "dates" | "past" | "asset" | "name" | "phone" | "failed",
  ): never => redirect(`${base}?err=${code}&${keep}`);

  // กันยิงถล่ม — 5 ครั้ง/นาที/IP ต่อ unit
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = checkRateLimit(`rental-book:${tenantSlug}:${unitSlug}:${ip}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) backErr("rate");

  const resolved = await resolveRentalUnit(tenantSlug, unitSlug);
  if (!resolved) backErr("shop");
  const ctx = { tenantId: resolved!.tenant.id, unitId: resolved!.unit.id };

  if (!RE_DATE.test(from) || !RE_DATE.test(to)) backErr("dates");
  if (from < todayBkk()) backErr("past");
  if (!assetId) backErr("asset");
  if (customerName.length < 1) backErr("name");
  const phoneDigits = customerPhoneRaw.replace(/\D/g, "");
  if (phoneDigits.length < 9 || phoneDigits.length > 15)
    backErr("phone");

  let publicToken: string | null = null;
  try {
    const bk = await createBooking(ctx, {
      assetId,
      customerName,
      customerPhone: customerPhoneRaw,
      startDate: new Date(`${from}T00:00:00.000Z`),
      endDate: new Date(`${to}T00:00:00.000Z`),
    });
    publicToken = bk.publicToken;
  } catch (e) {
    backErr("failed"); // เหตุผลจริงอยู่ใน service/exception — ผู้ใช้เห็นข้อความเดียวที่แปลได้
  }

  // สำเร็จ → หน้าสถานะ/จ่ายมัดจำ (publicToken)
  redirect(`${base}/r/${publicToken ?? ""}`);
}
