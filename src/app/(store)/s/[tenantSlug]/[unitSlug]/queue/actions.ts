"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/core/rate-limit";
import { prisma } from "@/lib/core/db";
import {
  resolveQueueUnit,
  issueTicket,
  findActiveTicketByPhone,
} from "@/lib/modules/queue/service";

// รับบัตรคิวออนไลน์ (public · ไม่ต้องล็อกอิน) — ลูกค้ากดจากมือถือ
// resolve unit จาก slug → กันถล่มต่อ IP → issueTicket(ONLINE) → เด้งไปหน้าสถานะบัตร
// error ทุกกรณี = เด้งกลับหน้ารับบัตรพร้อม ?err (inline) — คง typeId ที่เลือกไว้
export async function issuePublicTicketAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const unitSlug = String(formData.get("unitSlug") ?? "").trim();
  const typeId = String(formData.get("typeId") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const base = `/s/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(unitSlug)}/queue`;
  const backErr = (msg: string, keepType = false) =>
    redirect(`${base}?err=${encodeURIComponent(msg)}${keepType && typeId ? `&typeId=${encodeURIComponent(typeId)}` : ""}`);

  // กันยิงถล่ม — 5 ครั้ง/นาที/IP ต่อ unit (in-memory ต่อ instance ตามสัญญา core)
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = checkRateLimit(`queue-issue:${tenantSlug}:${unitSlug}:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!rl.ok) backErr("รับบัตรถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");

  const resolved = await resolveQueueUnit(tenantSlug, unitSlug);
  if (!resolved) backErr("ไม่พบร้าน หรือร้านปิดรับคิวอยู่");
  const ctx = { tenantId: resolved!.tenant.id, unitId: resolved!.unit.id };

  // master switch: ปิดรับบัตรออนไลน์
  const policy = await prisma.queuePolicy.findUnique({
    where: { unitId: ctx.unitId },
    select: { onlineIssueOpen: true },
  });
  if (policy && !policy.onlineIssueOpen) backErr("ขณะนี้ร้านปิดรับบัตรคิวออนไลน์ กรุณารับบัตรที่หน้าร้าน");

  // ประเภทต้อง ACTIVE + เปิดรับออนไลน์เท่านั้น (กันสวมค่าจาก type ปิด/ร้านอื่น)
  const type = await prisma.queueType.findFirst({
    where: { ...ctx, id: typeId, status: "ACTIVE", onlineIssuable: true },
  });
  if (!type) backErr("กรุณาเลือกประเภทคิว");

  // เบอร์โทร — บังคับเฉพาะประเภทที่ตั้ง requireContact
  let phone: string | undefined;
  if (type!.requireContact) {
    const digits = phoneRaw.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) backErr("กรุณากรอกเบอร์โทรให้ถูกต้อง", true);
    phone = phoneRaw;
    // กันรับซ้ำ: เบอร์เดิมมีบัตร active วันนี้แล้ว → พาไปดูบัตรเดิม (ไม่ออกใบใหม่)
    const existing = await findActiveTicketByPhone(ctx, phone!);
    if (existing) redirect(`${base}/t/${existing.publicToken}`);
  } else if (phoneRaw) {
    phone = phoneRaw; // ไม่บังคับ แต่ถ้ากรอกมาก็เก็บไว้
  }

  const res = await issueTicket({
    ...ctx,
    typeId: type!.id,
    channel: "ONLINE",
    actorType: "CUSTOMER",
    contact: phone ? { phone } : undefined,
  });
  if (!res.ok) backErr(res.reason, true);

  redirect(`${base}/t/${res.ok ? res.ticket.publicToken : ""}`);
}
