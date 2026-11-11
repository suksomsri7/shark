// platform/types.ts — ชนิดของ adapter แพลตฟอร์มภายนอก (P3-SKEL R1 R4 · สัญญา C-7) — LINE MAN · Grab · Shopee · Lazada · TikTok Shop
//
// "โครง" (บรีฟ §1(a)): ทุกเมธอดคืน {ok:false, code:"NOT_CONFIGURED", reason} — ไม่โยน ไม่กลืนเป็น 200 · ready:false เสมอ (facts คง false · มติ §10-9)
// เปิดใช้จริงภายหลัง = แทนตัวเมธอดในไฟล์ของแพลตฟอร์มนั้น + ready:true (ไม่ต้องแก้ schema/UI) — ใบตามเมื่อเจ้าของส่ง credentials (W4)
// 🔴 ไฟล์นี้มีแต่ชนิด + ตัวช่วยบริสุทธิ์ (ไม่มี prisma) — adapter ทั้งห้าเรียกได้จากทุกที่ (route · dispatch · creds) โดยไม่ลากฐานข้อมูล
import { createHmac, timingSafeEqual } from "node:crypto";
import type { OrderAdapter } from "../order-adapters";

export type PlatformProvider = "LINEMAN" | "GRAB" | "SHOPEE" | "LAZADA" | "TIKTOK";
export const PLATFORM_PROVIDERS: readonly PlatformProvider[] = ["LINEMAN", "GRAB", "SHOPEE", "LAZADA", "TIKTOK"];

/** ชื่อฟิลด์ที่เจ้าของจะวาง (ค่าเก็บในกล่องลับ · แสดงแบบปิดบัง ••••1234) — secret = ปิดกล่อง · required = ต้องกรอกจึง COMPLETE */
export type PlatformField = { name: string; secret: boolean; required: boolean; label: string };

/** ผลของโครง — ไม่มี ok:true จนกว่า adapter จริงจะมา */
export type PlatformRefusal = { ok: false; code: "NOT_CONFIGURED" | "ADAPTER_PENDING"; reason: string };
export type PlatformResult = PlatformRefusal;

/** เมธอด C-7 ทั้งหก (ชื่อเดียวกับ OrderAdapter) */
export const C7_METHODS = ["accept", "reject", "setReady", "syncMenu", "setAvailability", "setStoreStatus"] as const;
export type C7Method = (typeof C7_METHODS)[number];

/**
 * PlatformAdapter = OrderAdapter (C-7) ที่คืนผลโครงแทน void + ข้อมูลแพลตฟอร์ม
 * (เมธอด C-7 รับ input เดียวกับ OrderAdapter แต่ "unknown" — ผู้เรียกภายนอก/ข้อสอบ fuzz ส่งอะไรมาก็ได้ ห้ามโยน)
 */
export type PlatformAdapter = Omit<OrderAdapter, "code" | C7Method> & {
  code: "API";
  platform: PlatformProvider;
  /** false จนกว่า adapter จริงจะมา (P3.1/3.2/3.3-real) */
  ready: false;
  /** ชื่อที่แสดงบนการ์ดตั้งค่า */
  label: string;
  requiredFields: readonly PlatformField[];
} & Record<C7Method, (input?: unknown) => Promise<PlatformResult>> & {
    /** ตรวจลายเซ็นของคำขอขาเข้า (โครง: หัว x-shark-signature = hex HMAC-SHA256(raw, webhookSecret)) — ผิด/ขาด/ขยะ = false · ไม่โยน */
    verifyInbound: (raw: unknown, headers: unknown, creds: unknown) => boolean;
    /** แปลงคำขอขาเข้าเป็นออเดอร์ — โครง = NOT_CONFIGURED (ไม่เขียนอะไร) */
    parseInbound: (raw: unknown, creds: unknown) => Promise<PlatformResult>;
    /** ทดสอบการเชื่อม — ไม่ยิงเครือข่าย · ฟิลด์ไม่ครบ = NOT_CONFIGURED · ครบ = ADAPTER_PENDING */
    testConnection: (creds: unknown) => Promise<PlatformResult>;
  };

/** หัวลายเซ็นของโครง (CD-S1) — adapter จริงแทนด้วยรูปแบบของแพลตฟอร์มนั้น */
export const PLATFORM_SIGNATURE_HEADER = "x-shark-signature";
/** ฟิลด์ลับที่ใช้ตรวจลายเซ็นขาเข้า (LINE MAN / Grab ต้องมี) */
export const WEBHOOK_SECRET_FIELD = "webhookSecret";

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** hex HMAC-SHA256(raw, secret) เทียบแบบ timing-safe — ขยะทุกรูป = false */
export function verifySharkSignature(raw: unknown, headers: unknown, creds: unknown): boolean {
  try {
    if (typeof raw !== "string" && !(raw instanceof Uint8Array)) return false;
    if (!isRecord(creds)) return false;
    const secret = creds[WEBHOOK_SECRET_FIELD];
    if (typeof secret !== "string" || secret === "") return false;
    const get = headers && typeof (headers as { get?: unknown }).get === "function" ? (headers as { get: (n: string) => unknown }).get.bind(headers) : null;
    if (!get) return false;
    const sig = get(PLATFORM_SIGNATURE_HEADER);
    if (typeof sig !== "string" || !/^[0-9a-f]{64}$/.test(sig.trim())) return false;
    const want = createHmac("sha256", secret).update(raw).digest();
    const got = Buffer.from(sig.trim(), "hex");
    return got.length === want.length && timingSafeEqual(got, want);
  } catch {
    return false;
  }
}

const notConfigured = (label: string): PlatformRefusal => ({ ok: false, code: "NOT_CONFIGURED", reason: `${label}: ยังไม่ได้เชื่อม — รอ credentials จากเจ้าของ (W4)` });

/** ฟิลด์ที่ต้องกรอกครบไหม (ค่าเป็นสตริงไม่ว่าง) — ขยะ = false */
function fieldsComplete(fields: readonly PlatformField[], creds: unknown): boolean {
  if (!isRecord(creds)) return false;
  return fields.filter((f) => f.required).every((f) => typeof creds[f.name] === "string" && (creds[f.name] as string) !== "");
}

/** สร้าง adapter โครงหนึ่งตัว — ทุกเมธอดคืนผลปิดสุภาพ ไม่แตะ input (สตริง 1 MB / อ็อบเจกต์วนรอบไม่มีผล) */
export function skeletonAdapter(platform: PlatformProvider, label: string, requiredFields: readonly PlatformField[], opts: { signed: boolean }): PlatformAdapter {
  const refuse = async (): Promise<PlatformResult> => notConfigured(label);
  return {
    code: "API",
    platform,
    ready: false,
    label,
    requiredFields,
    accept: refuse,
    reject: refuse,
    setReady: refuse,
    syncMenu: refuse,
    setAvailability: refuse,
    setStoreStatus: refuse,
    verifyInbound: (raw, headers, creds) => (opts.signed ? verifySharkSignature(raw, headers, creds) : false),
    parseInbound: refuse,
    testConnection: async (creds) =>
      fieldsComplete(requiredFields, creds)
        ? { ok: false, code: "ADAPTER_PENDING", reason: `${label}: ข้อมูลครบแล้ว แต่ตัวเชื่อมจริงยังไม่เปิด (รอสวิตช์ W4)` }
        : notConfigured(label),
  };
}

/** ชื่อฟิลด์ที่ถือเป็นความลับเสมอ (กันผู้เพิ่มแพลตฟอร์มลืมติด secret) */
export const looksSecretField = (name: string): boolean => /secret|key|token|password/i.test(name);
