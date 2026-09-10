import { z } from "zod";

// ตรวจ env ตอน boot — fail เร็วถ้าตั้งค่าผิด (SECURITY §6)
const schema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_ENV: z.enum(["development", "preview", "production"]).default("development"),
  SESSION_SECRET: z.string().min(32),
  RESEND_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default("SHARK <noreply@shark.in.th>"),
  STORAGE_PROVIDER: z.enum(["local", "bunny", "vercel-blob"]).default("local"),
  CRON_SECRET: z.string().default("dev-cron-secret"),
  // ── K3.9: อีเมลเข้าบอร์ดงาน (`POST /api/email/inbound`) ──
  // 🔴 ไม่ตั้งค่า = **ปิดบริการสนิท** (503) ไม่ใช่ "เปิดโล่ง" — endpoint นี้เขียนการ์ดลงบอร์ดของร้านได้
  //    ค่าปริยายที่เดาได้แม้แต่ตัวเดียว = ใครก็ยิงการ์ดเข้าร้านคนอื่นได้ (ต่างจาก CRON_SECRET ที่ของเดิม
  //    มี default ไว้ให้ dev รันได้ — ตัวนี้ยอมให้ dev เสียความสะดวกดีกว่ายอมให้ prod เสี่ยง)
  EMAIL_INBOUND_SECRET: z.string().default(""),
  // ── บัญชีสำหรับผู้ตรวจของสโตร์ (App Review) ──
  // แอป login ด้วย OTP อีเมลล้วน → ผู้ตรวจของ Apple/Google ไม่มีอีเมลของเรา = เข้าระบบไม่ได้เลย
  // = ถูกตีกลับข้อ 2.1 แน่นอน · ทางออก: อีเมลเดียวที่ระบุไว้เท่านั้นได้รหัสคงที่
  // 🔴 ไม่ตั้งค่า = ไม่มีทางลัดใด ๆ ในระบบ (ค่าว่าง = ปิดสนิท) · ต้องตั้งทั้งคู่ถึงจะทำงาน
  REVIEW_EMAIL: z.string().default(""),
  REVIEW_OTP: z.string().default(""),
});

export const env = schema.parse(process.env);

export const isProd = env.APP_ENV === "production";
export const isDev = env.APP_ENV === "development";
// cookie secure ทุกที่ที่ไม่ใช่ localhost dev (preview/prod เป็น HTTPS)
export const secureCookies = env.APP_ENV !== "development";
export const emailEnabled = env.RESEND_API_KEY.length > 0;
/** ความลับของ webhook อีเมลขาเข้า — ค่าว่าง = ยังไม่ได้เปิดบริการ (route ตอบ 503) */
export const emailInboundSecret = env.EMAIL_INBOUND_SECRET.trim();
// โชว์ OTP บนจอทุก env ที่ไม่ใช่ production (แม้ต่อ Resend แล้ว) — กัน login ติดตอน
// domain ยังไม่ verify (ส่งได้เฉพาะเจ้าของบัญชี). production = ปิด โชว์เฉพาะเมลจริง
export const previewOtp = env.APP_ENV !== "production";

// บัญชีผู้ตรวจสโตร์: เปิดใช้เมื่อ **ตั้งครบทั้งคู่** เท่านั้น · รหัสต้อง 6 หลักตามรูปแบบ OTP ปกติ
// (ตั้งไม่ครบ/รูปแบบผิด = ถือว่าไม่ได้เปิด — fail-closed ไม่ใช่เดาให้)
export const reviewLogin: { email: string; otp: string } | null =
  env.REVIEW_EMAIL.trim() && /^\d{6}$/.test(env.REVIEW_OTP.trim())
    ? { email: env.REVIEW_EMAIL.trim().toLowerCase(), otp: env.REVIEW_OTP.trim() }
    : null;
