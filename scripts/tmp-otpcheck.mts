try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const since = new Date(Date.now() - 60 * 60 * 1000);
const rows = await prisma.authToken.findMany({
  where: { email: "suksomsri@gmail.com", purpose: "OTP", createdAt: { gte: since } },
  orderBy: { createdAt: "desc" },
  select: { createdAt: true, consumedAt: true, attempts: true },
});
console.log("OTP ของ suksomsri@gmail.com ใน 60 นาที:", rows.length);
for (const r of rows) console.log(" -", r.createdAt.toISOString(), "consumed:", !!r.consumedAt, "attempts:", r.attempts);
const win = new Date(Date.now() - 10 * 60 * 1000);
const inWindow = await prisma.authToken.count({ where: { email: "suksomsri@gmail.com", purpose: "OTP", createdAt: { gte: win } } });
console.log("ในหน้าต่าง rate limit 10 นาที:", inWindow, "/ 5 → ", inWindow >= 5 ? "🔴 โดนบล็อกอยู่" : "🟢 ไม่ติด");
await prisma.$disconnect();
