"use server";
// actions.ts — action ของหน้าจอลูกค้า /d (POS P2.10 · มติ 1 2) · ไม่มี session — สิทธิ์ของจอ = token ในคุกกี้ pos_display (httpOnly · Path=/d)
//
// 🔴 token ไม่เคยกลับไปถึง JavaScript ของหน้า — แลกรหัสสำเร็จ = ตั้งคุกกี้ที่นี่ แล้วคืนแค่ {ok:true}
// 🔴 อ่าน = readCustomerDisplay ทุกครั้ง (ไม่มีตัวจำกัดอัตราต่อโพล) · DISPLAY_NOT_PAIRED = ลบคุกกี้ (จอกลับหน้าใส่รหัส)
// 🔴 เพดานแลกรหัส 10 ครั้ง/นาที/IP อยู่ใน pairCustomerDisplay (IP จาก x-forwarded-for ตัวแรก)

import { cookies, headers } from "next/headers";
import { pairCustomerDisplay, readCustomerDisplay } from "@/lib/modules/pos/display";
import { DISPLAY_COOKIE, DISPLAY_COOKIE_OPTIONS, type DisplayRefusal, type ReadCustomerDisplayResult } from "@/lib/modules/pos/display-shared";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

/** แลกรหัสจับคู่ 8 ตัว → ตั้งคุกกี้ของจอ (httpOnly) */
export async function pairDisplayAction(code: string): Promise<{ ok: true } | DisplayRefusal> {
  const r = await pairCustomerDisplay({ code: typeof code === "string" ? code : "" }, { ip: await clientIp() });
  if (!r.ok) return r;
  (await cookies()).set(DISPLAY_COOKIE, r.token, DISPLAY_COOKIE_OPTIONS);
  return { ok: true };
}

/** โพลของจอ — sinceVer = รุ่นของภาพที่จอถืออยู่ (เท่าเดิม = changed:false) */
export async function readDisplayAction(args: { sinceVer?: string }): Promise<ReadCustomerDisplayResult> {
  const jar = await cookies();
  const token = jar.get(DISPLAY_COOKIE)?.value ?? "";
  const r = await readCustomerDisplay({ token, ...(typeof args?.sinceVer === "string" ? { sinceVer: args.sinceVer } : {}) });
  if (!r.ok && r.code === "DISPLAY_NOT_PAIRED" && token) jar.set(DISPLAY_COOKIE, "", { ...DISPLAY_COOKIE_OPTIONS, maxAge: 0 });
  return r;
}

// POS P2.14 ▸ TL-5 (P6): SSR ของ /d อ่านได้ DISPLAY_NOT_PAIRED (จอถูกยกเลิก/token เก่า) = คุกกี้ค้าง — หน้าตั้งคุกกี้ระหว่าง render ไม่ได้ ⇒
//   จอเรียก action นี้ครั้งเดียวตอนเปิด (ลบคุกกี้ · maxAge 0) แล้วแสดงฟอร์มใส่รหัส ◂
export async function clearDisplayCookieAction(): Promise<{ ok: true }> {
  const jar = await cookies();
  if (jar.get(DISPLAY_COOKIE)?.value) jar.set(DISPLAY_COOKIE, "", { ...DISPLAY_COOKIE_OPTIONS, maxAge: 0 });
  return { ok: true };
}
