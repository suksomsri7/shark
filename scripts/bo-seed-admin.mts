// seed PlatformUser (backoffice admin) — วิธีเดียวที่สร้าง PlatformUser ได้ (ไม่มีหน้า register)
// รันซ้ำได้ (upsert ตาม email) — เปลี่ยนชื่อ/role ได้ด้วยการรันซ้ำ
//
// ใช้:
//   DATABASE_URL='...' pnpm exec tsx scripts/bo-seed-admin.mts <email> [ชื่อ]
// ตัวอย่าง:
//   pnpm exec tsx scripts/bo-seed-admin.mts admin@shark.in.th "เจ้าของแพลตฟอร์ม"

try {
  process.loadEnvFile(".env");
} catch {}

const { prisma } = await import("@/lib/core/db");

const email = (process.argv[2] ?? "").trim().toLowerCase();
const name = (process.argv[3] ?? "").trim() || null;

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("❌ ต้องระบุอีเมลที่ถูกต้อง: pnpm exec tsx scripts/bo-seed-admin.mts <email> [ชื่อ]");
  process.exit(1);
}

try {
  const user = await prisma.platformUser.upsert({
    where: { email },
    update: { name, role: "SUPER_ADMIN" },
    create: { email, name, role: "SUPER_ADMIN" },
  });
  console.log(`✅ พร้อมใช้งานหลังบ้าน: ${user.email} (${user.role})${user.name ? ` · ${user.name}` : ""}`);
  console.log("   เข้าสู่ระบบที่ /backoffice/login ด้วยอีเมลนี้ (OTP)");
} catch (e) {
  console.error("❌ สร้าง PlatformUser ไม่สำเร็จ:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
