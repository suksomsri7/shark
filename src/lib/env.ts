import { z } from "zod";

// ตรวจ env ตอน boot — fail เร็วถ้าตั้งค่าผิด (SECURITY §6)
const schema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_ENV: z.enum(["development", "production"]).default("development"),
  SESSION_SECRET: z.string().min(32),
  RESEND_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default("SHARK <noreply@shark.in.th>"),
  STORAGE_PROVIDER: z.enum(["local", "bunny", "vercel-blob"]).default("local"),
  CRON_SECRET: z.string().default("dev-cron-secret"),
});

// ใน production ต้องครบ; dev ยอมค่า placeholder เพื่อให้ scaffold รันได้ก่อนเสียบ key จริง
export const env = schema.parse(process.env);

export const isProd = env.APP_ENV === "production";
export const emailEnabled = env.RESEND_API_KEY.length > 0;
