import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Server action body ปริยาย 1MB — ไฟล์แนบบอร์ดงาน (K1.9 · D4 ≤10MB) และไฟล์แนบแชทส่งผ่าน FormData ของ action
    // ตั้ง 12mb เผื่อ overhead ของ multipart · ด่านขนาดจริงอยู่ที่ KANBAN_LIMITS.attachmentMaxBytes ใน service
    serverActions: { bodySizeLimit: "12mb" },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);
