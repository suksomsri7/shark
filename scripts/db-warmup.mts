// อุ่นเครื่อง DB — retry จนต่อได้จริง (Neon compute เพิ่งเกิดใช้เวลาตื่น)
// ใช้ใน CI ก่อนยิงชุดเทสต์ · ใช้บนเครื่องก็ได้: pnpm exec tsx scripts/db-warmup.mts
// ⚠️ ห้ามเขียนแบบ `tsx -e "await ..."` — tsx eval คอมไพล์เป็น CJS ไม่รองรับ top-level await (run #9 พังเพราะงี้)

try { process.loadEnvFile(".env"); } catch { /* CI ไม่มี .env */ }

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("❌ ไม่มี DIRECT_URL/DATABASE_URL");
  process.exit(1);
}

const { Client } = await import("pg");
const MAX = 10;
for (let i = 1; i <= MAX; i++) {
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  try {
    await c.connect();
    await c.query("SELECT 1");
    await c.end();
    console.log(`✅ DB พร้อม (รอบที่ ${i})`);
    process.exit(0);
  } catch (e) {
    await c.end().catch(() => {});
    console.log(`รอ DB ตื่น... (${i}/${MAX}) — ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    if (i < MAX) await new Promise((r) => setTimeout(r, 3000));
  }
}
console.error(`❌ DB ไม่ตื่นใน ${MAX} รอบ`);
process.exit(1);
