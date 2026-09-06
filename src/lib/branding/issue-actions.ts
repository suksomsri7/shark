"use server";

// "แจ้งปัญหาการใช้งาน" (B3 · T8 · แบบ §7b) — ปุ่มมุมขวาบนของทุกหน้า → แผ่นเล็ก → action นี้
//
// 🔴 ห้าม throw — คืน { ok:false, error } เป็นไทยเสมอ (คนกำลังจะบอกว่าระบบพัง ห้ามพังซ้ำ)
// 🔴 tenantId/userId มาจาก session เท่านั้น (requireTenant) — client ส่งมาแค่ "สิ่งที่ตัวเองเห็น"
//    (ประเภท · ข้อความ · หน้าที่อยู่ · เบราว์เซอร์/เวอร์ชันแอป · ภาพแนบ)
// 🔴 ไฟล์แนบเดินผ่าน validateLogoFile ตัวเดียวกับโลโก้ (สนิฟ magic bytes · ≤2MB · SVG ต้องไม่มีสคริปต์)
//    ไม่เชื่อ mime/ชื่อไฟล์ที่เบราว์เซอร์อ้าง — ช่องนี้เปิดให้ "ใครก็ได้ที่เป็นสมาชิกร้าน" อัปไฟล์

import { headers } from "next/headers";
import { requireTenant } from "@/lib/core/context";
import { assertCanReport, createIssueReport } from "@/lib/branding/issues";
import { validateLogoFile } from "@/lib/branding/logo";
import { uploadFile } from "@/lib/storage/service";

export type ReportIssueResult = { ok: true } | { ok: false; error: string };

/** เวอร์ชันแอปจาก UA ของ WebView (`SharkApp/1.2.3`) — เว็บปกติ = null */
function appVersionFrom(userAgent: string): string | null {
  const m = /SharkApp\/([\w.+-]+)/i.exec(userAgent);
  return m ? m[1] : null;
}

export async function reportIssueAction(formData: FormData): Promise<ReportIssueResult> {
  const auth = await requireTenant();
  const ctx = { tenantId: auth.active.tenantId };

  try {
    await assertCanReport(ctx, auth.user.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "แจ้งปัญหาไม่ได้ในตอนนี้" };
  }

  const kind = String(formData.get("kind") ?? "");
  const message = String(formData.get("message") ?? "");
  const pageUrl = String(formData.get("pageUrl") ?? "");
  // UA ที่ผู้ใช้เห็นจริง (navigator) ดีกว่าของ request header เวลาแอปห่อ WebView — แต่ถ้าไม่ส่งมาก็ถอยไปใช้ header
  const clientUa = String(formData.get("userAgent") ?? "").trim();
  const userAgent = clientUa || (await headers()).get("user-agent") || "ไม่ทราบ";
  const appVersion = String(formData.get("appVersion") ?? "").trim() || appVersionFrom(userAgent);

  // ── ภาพแนบ (ไม่บังคับ) ──
  let screenshotUrl: string | null = null;
  const file = formData.get("screenshot");
  if (file instanceof File && file.size > 0) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checked = validateLogoFile({ name: file.name, type: file.type, bytes });
    if (!checked.ok) return { ok: false, error: checked.error };
    const up = await uploadFile(ctx, {
      kind: "ATTACHMENT",
      filename: file.name,
      contentType: file.type,
      data: bytes,
    });
    if (!up.ok) return { ok: false, error: up.error };
    screenshotUrl = up.cdnUrl;
  }

  try {
    await createIssueReport(ctx, {
      userId: auth.user.id,
      kind,
      message,
      pageUrl,
      userAgent,
      appVersion,
      screenshotUrl,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ส่งเรื่องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }
}
