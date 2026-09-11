// join-shared.ts — ชนิดข้อมูลบริสุทธิ์ของหน้าสมัครสมาชิก `/m/<slug>/join` (M3.11 · ภาพ 29)
//
// 🔴 ไฟล์นี้ต้องไม่ import อะไรที่ลากถึง prisma/env — `JoinFlow.tsx` ('use client') import ชนิดจากที่นี่
//    (ถ้า import จาก `join.ts` ตรง ๆ = next build พัง "Module not found: pg" ใน Client Component)
// 🔴 `join-actions.ts` ("use server") ห้าม export type ⇒ ชนิดผลลัพธ์ของ action อยู่ที่นี่ทั้งหมด

/** ผลของ server action ทุกตัวในหน้าสมัคร — ไม่ผ่าน = ข้อความไทยที่ไม่โทษลูกค้า */
export type JoinActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** ฟิลด์ในฟอร์มที่ร้านตั้ง (สำเนาของ `JoinFieldDto` ใน join.ts — ชนิดเดียวกันทุกช่อง) */
export type JoinFieldView = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  description: string | null;
  choices: { value: string; label: string }[];
};

/** ฟอร์มสมัครที่หน้าจอใช้วาด (มาจาก `joinForm(slug)` จริง — ไม่มีค่าจำลอง) */
export type JoinFormView = {
  shopName: string;
  fields: JoinFieldView[];
  consents: { channel: string; label: string }[];
  policyVersion: number;
  policyHtml: string | null;
  welcomePoints: number;
  referralEnabled: boolean;
};

/** ลิงก์ที่มา `?src=` ที่ตรงกับลิงก์ของร้าน (ไม่ตรง = null · หน้าไม่โชว์บรรทัด "มาจาก") */
export type JoinSourceView = { code: string; name: string };

export type JoinStartData = { otpId: string; maskedTo: string; expiresAt: string; devOtp?: string };

export type JoinVerifyData =
  | { existing: false; joinToken: string; expiresAt: string }
  | { existing: true; next: string };

export type JoinCompleteData = { next: string; created: boolean };

export type JoinReferralData = {
  code: string;
  /** รางวัลของเพื่อนที่สมัคร (ข้อความไทยจากโปรแกรมแนะนำเพื่อนของร้าน) */
  refereeReward: string;
  /** แปลงเป็นรางวัลเมื่อไหร่ — SIGNUP = สมัครสำเร็จ · FIRST_PURCHASE = ซื้อครั้งแรก */
  convertOn: "SIGNUP" | "FIRST_PURCHASE";
};

export type JoinLineData =
  | { existing: true; next: string }
  | { existing: false; displayName: string | null };

/** ช่องเบอร์รับได้ทั้งเบอร์และอีเมล (ร้านที่ยังไม่มีผู้ส่ง SMS ใช้อีเมลแทนได้) */
export function isEmailTarget(raw: string): boolean {
  return raw.includes("@");
}

/** รหัสยืนยันผิดกี่ครั้งแล้วต้องขอใหม่ (กติกาเดียวกับ join.ts / customer-session.ts) */
export const JOIN_MAX_OTP_ATTEMPTS = 5;
