"use server";

// /b/[slug]/actions.ts — server actions ของพอร์ทัลลูกค้าองค์กร (ใบ C3.5) · เรียกบริการผ่าน facade CRM เท่านั้น (F2.3)
//
// 🔴 "use server" = ส่งออกได้เฉพาะ async function (ชนิดข้อมูลอยู่ที่ `@/lib/modules/crm` / คอมโพเนนต์)
// 🔴 token มาจากคุกกี้ของพอร์ทัลเท่านั้น (ไม่รับ id ของผู้ติดต่อ/บริษัทจากหน้าจอ) · บริการ resolve session ใหม่ทุกครั้ง
// 🔴 คุกกี้ตั้งผ่าน `customerCookieOptions` ชุดเดียวกับลูกค้า (Secure ตามโปรโตคอล/สภาพแวดล้อม · ไม่ตั้ง flag เอง — X10.2)
// 🔴 ข้อความ error ไม่โทษผู้ใช้ · error ที่ไม่รู้จัก = ข้อความกลาง (ไม่ส่งข้อความเทคนิคออกไป)
import { cookies, headers } from "next/headers";
import { portal, portalPath } from "@/lib/modules/crm";
import { customerCookieOptions } from "@/lib/modules/member/session-facade";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; code?: string };

function failOf(e: unknown, fallback: string): { ok: false; error: string; code?: string } {
  const msg = e instanceof Error ? e.message : "";
  const code = (e as { code?: unknown })?.code;
  if (/[ก-๙]/.test(msg) && msg.length < 300) return { ok: false, error: msg, ...(typeof code === "string" ? { code } : {}) };
  console.error(`[portal] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: fallback };
}

async function meta() {
  const h = await headers();
  return { h, meta: { ip: (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null, userAgent: (h.get("user-agent") ?? "portal-web").slice(0, 300) } };
}

async function token(): Promise<string> {
  return (await cookies()).get(portal.portalCookieName())?.value ?? "";
}

async function setSession(t: { cookieName: string; token: string }, h: Headers): Promise<void> {
  const jar = await cookies();
  jar.set(t.cookieName, t.token, customerCookieOptions(h));
}

export async function portalRequestOtpAction(slug: string, email: string): Promise<Result<{ otpId: string; maskedTo: string; devOtp?: string }>> {
  try {
    const { meta: m } = await meta();
    const r = await portal.requestOtp(String(slug ?? ""), { email: String(email ?? "") }, { ip: m.ip });
    return { ok: true, otpId: r.otpId, maskedTo: r.maskedTo, ...(r.devOtp ? { devOtp: r.devOtp } : {}) };
  } catch (e) {
    return failOf(e, "ขอรหัสยืนยันไม่สำเร็จ — ลองใหม่อีกครั้ง");
  }
}

export async function portalVerifyOtpAction(slug: string, otpId: string, code: string): Promise<Result<{ next: string }>> {
  try {
    const { h, meta: m } = await meta();
    const t = await portal.verifyOtp({ otpId: String(otpId ?? ""), code: String(code ?? "") }, m);
    await setSession(t, h);
    return { ok: true, next: portalPath(String(slug ?? "")) };
  } catch (e) {
    return failOf(e, "ยืนยันรหัสไม่สำเร็จ — ลองใหม่อีกครั้ง");
  }
}

export async function portalAcceptInviteAction(slug: string, inviteToken: string): Promise<Result<{ next: string }>> {
  try {
    const { h, meta: m } = await meta();
    const t = await portal.acceptInvite(String(slug ?? ""), { token: String(inviteToken ?? "") }, m);
    await setSession(t, h);
    return { ok: true, next: portalPath(String(slug ?? "")) };
  } catch (e) {
    return failOf(e, "รับคำเชิญไม่สำเร็จ — ลองใหม่อีกครั้ง หรือติดต่อร้านเพื่อขอลิงก์ใหม่");
  }
}

export async function portalSwitchCompanyAction(slug: string, companyId: string): Promise<Result<{ next: string }>> {
  try {
    const { h, meta: m } = await meta();
    const old = await token();
    // ใบเดิมถูกเพิกถอนในบริการเลย (มติผู้คุมงานรอบ 3) — ลิงก์ไฟล์ที่ออกให้ใบเดิมใช้ไม่ได้ต่อ
    const t = await portal.switchCompany(old, String(companyId ?? ""), m, { revokeCurrent: true });
    await setSession(t, h);
    return { ok: true, next: portalPath(String(slug ?? "")) };
  } catch (e) {
    return failOf(e, "สลับบริษัทไม่สำเร็จ — ลองใหม่อีกครั้ง");
  }
}

export async function portalLogoutAction(slug: string): Promise<Result<{ next: string }>> {
  try {
    const t = await token();
    if (t) await portal.logout(t);
    // ลบด้วยตัวเลือกชุดเดียวกับตอนตั้ง (`__Host-` ต้องมี Secure — `delete` เปล่า ๆ ถูกเบราว์เซอร์ปฏิเสธ) · session ถูกเพิกถอนที่ฐานแล้วข้างบน
    (await cookies()).set(portal.portalCookieName(), "", { ...customerCookieOptions(await headers()), maxAge: 0 });
    return { ok: true, next: portalPath(String(slug ?? ""), "login") };
  } catch (e) {
    return failOf(e, "ออกจากระบบไม่สำเร็จ — ลองใหม่อีกครั้ง");
  }
}

export async function portalRespondQuotationAction(docId: string, input: { accept: boolean; reason?: string; signerName: string }): Promise<Result<{ status: string }>> {
  try {
    const { meta: m } = await meta();
    const r = await portal.respondQuotation(await token(), String(docId ?? ""), { accept: input?.accept === true, reason: input?.reason ?? null, signerName: String(input?.signerName ?? "") }, m);
    return { ok: true, status: r.status };
  } catch (e) {
    return failOf(e, "บันทึกคำตอบไม่สำเร็จ — ลองใหม่อีกครั้ง");
  }
}

export async function portalPayLinkAction(invoiceId: string): Promise<Result<{ url: string }>> {
  try {
    const r = await portal.payLink(await token(), String(invoiceId ?? ""));
    return { ok: true, url: r.url };
  } catch (e) {
    return failOf(e, "สร้างลิงก์ชำระเงินไม่สำเร็จ — ลองใหม่อีกครั้ง");
  }
}

export async function portalUploadSlipAction(form: FormData): Promise<Result<{ name: string }>> {
  try {
    const invoiceId = String(form.get("invoiceId") ?? "");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "เลือกไฟล์สลิปก่อนกดแนบ" };
    const data = new Uint8Array(await file.arrayBuffer());
    const r = await portal.uploadSlip(await token(), { invoiceId, filename: file.name, contentType: file.type, data });
    return { ok: true, name: r.name };
  } catch (e) {
    return failOf(e, "แนบสลิปไม่สำเร็จ — ลองใหม่อีกครั้ง");
  }
}

export async function portalCreateRequestAction(input: { kind: string; title: string; body?: string }): Promise<Result<{ id: string }>> {
  try {
    const r = await portal.createRequest(await token(), { kind: String(input?.kind ?? ""), title: String(input?.title ?? ""), body: input?.body ?? null });
    return { ok: true, id: r.id };
  } catch (e) {
    return failOf(e, "ส่งเรื่องไม่สำเร็จ — ลองใหม่อีกครั้ง");
  }
}

export async function portalRecordChangeAction(recordId: string, input: { fieldKey: string; value: string }): Promise<Result<{ requestId: string }>> {
  try {
    const r = await portal.requestRecordChange(await token(), String(recordId ?? ""), { fieldKey: String(input?.fieldKey ?? ""), value: String(input?.value ?? "") });
    return { ok: true, requestId: r.requestId };
  } catch (e) {
    return failOf(e, "ส่งคำขอแก้ข้อมูลไม่สำเร็จ — ลองใหม่อีกครั้ง");
  }
}

/**
 * เริ่มเข้าด้วย LINE: ออก nonce ใช้ครั้งเดียว (คุกกี้ httpOnly 10 นาที) — route `auth/line` รับคำขอเฉพาะที่ส่ง nonce ตรงกับคุกกี้
 * (ผูกคำขอกับเบราว์เซอร์ที่เปิดหน้าเข้าสู่ระบบจริง · กันยิงข้ามเว็บ) · ร้านที่ไม่มีพอร์ทัล = ไม่ออก
 */
export async function portalLineNonceAction(slug: string): Promise<Result<{ nonce: string }>> {
  try {
    const shop = await portal.portalShopBySlug(String(slug ?? ""));
    if (!shop) return { ok: false, error: "ไม่พบพอร์ทัลลูกค้าของร้านนี้ — ตรวจลิงก์ที่ร้านส่งให้อีกครั้ง" };
    const { h } = await meta();
    const n = portal.lineNonceIssue(String(slug ?? ""));
    (await cookies()).set(n.cookieName, n.cookieValue, { ...customerCookieOptions(h), maxAge: n.maxAge });
    return { ok: true, nonce: n.nonce };
  } catch (e) {
    return failOf(e, "เริ่มเข้าสู่ระบบด้วย LINE ไม่สำเร็จ — ลองใหม่อีกครั้ง");
  }
}
