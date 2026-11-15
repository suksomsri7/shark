import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // 🔴 28 ก.ย. 2569: บน Vercel (เครื่อง build มาตรฐาน 8 GB) ขั้น "Running TypeScript" ของ next build ค้างจนหมดเวลา 2 รอบ —
  //    tsc ของโปรเจกต์นี้กิน RAM สูงสุด ~5.1 GB (วัดบน commit เดียวกัน: 2:37 นาที · 0 error) และรันพร้อม process ของ build
  //    ⇒ บน Vercel ให้ scripts/vercel-build.sh รัน `tsc --noEmit` เป็นขั้นแยก "ก่อน" next build (ตรวจเท่าเดิม · ล้ม = build ล้ม)
  //    แล้วข้ามเฉพาะตัวตรวจซ้ำในตัว next build · เครื่องเรา/QC ยังตรวจใน next build ตามปกติ (VERCEL ไม่ได้ตั้ง)
  typescript: { ignoreBuildErrors: process.env.SHARK_TSC_PREBUILD_OK === "1" },
  // SEC S3a.5 ส่วน B ▸ PDF ใบเสนอราคาสาธารณะอ่านฟอนต์ Sarabun จากไฟล์ (fs · path จาก process.cwd()) — บังคับรวมไฟล์ฟอนต์ในฟังก์ชันของ route นี้ ◂
  outputFileTracingIncludes: {
    "/doc/\\[token\\]/pdf": ["./public/fonts/sarabun/**/*"],
    // ACC T5.4 ▸ PDF e-Tax ประทับเวลา (pdfkit อ่านฟอนต์ Sarabun + โปรไฟล์สี sRGB ของ pdfkit จากไฟล์) — ทาง REST และหน้าเอกสาร ◂
    "/api/v1/account/\\[\\.\\.\\.path\\]": ["./public/fonts/sarabun/**/*", "./node_modules/pdfkit/js/data/**/*"],
    "/app/sys/\\[id\\]/account/docs/\\[docType\\]/\\[docId\\]": ["./public/fonts/sarabun/**/*", "./node_modules/pdfkit/js/data/**/*"],
  },
  // ACC T5.4 ▸ pdfkit อ่านไฟล์ข้อมูลของตัวเอง (AFM/ICC) ด้วย fs + __dirname — ห้ามรวมเข้า bundle ◂
  serverExternalPackages: ["pdfkit"],
  experimental: {
    // Server action body ปริยาย 1MB — ไฟล์แนบบอร์ดงาน (K1.9 · D4 ≤10MB) และไฟล์แนบแชทส่งผ่าน FormData ของ action
    // ตั้ง 12mb เผื่อ overhead ของ multipart · ด่านขนาดจริงอยู่ที่ KANBAN_LIMITS.attachmentMaxBytes ใน service
    serverActions: { bodySizeLimit: "12mb" },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl(nextConfig);
