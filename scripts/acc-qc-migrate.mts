// acc-qc-migrate.mts — Prisma `migrate status|deploy` กับฐานทดสอบของงานบัญชี (เลนของทรีนี้) เท่านั้น (ACC T1.2)
//
// ทำไมไม่ใช้ scripts/qc-prisma.sh: ตัวนั้นรับเฉพาะ host ของฐาน QC ที่ใช้ร่วมของงาน CRM (ep-plain-art …)
//   ฐานของงานบัญชี (T0.3 — Neon branch แยกต่อเลน) ไม่อยู่ในรายชื่อ ⇒ ตัวนี้ทำกลับด้าน:
//   ① โหลด env ผ่าน `acc-v2-env.loadQcEnv()` (ด่าน prod เด็ดขาด + APP_ENV=development)
//   ② ปฏิเสธ host ของฐาน QC ที่ใช้ร่วม (ห้าม migrate ฐานร่วม — ACCOUNT-TAX-PLAN กติกาข้อ 7)
//   ③ อนุญาตแค่ `status` · `deploy` · `drift` (diff อ่านอย่างเดียว) (ไม่มี dev/reset/push — เหตุผลเดียวกับ qc-prisma.sh)
//
// ใช้: bash scripts/iso.sh pnpm exec tsx scripts/acc-qc-migrate.mts status|deploy
import { spawnSync } from "node:child_process";

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const SHARED_QC = ["ep-plain-art", "ep-cool-shadow", "ep-weathered-river"];
const direct = process.env.DIRECT_URL ?? "";
if (!direct) {
  console.error("🔴 acc-qc-migrate: ไม่มี DIRECT_URL ใน env QC");
  process.exit(2);
}
for (const u of [direct, process.env.DATABASE_URL ?? ""]) {
  if (SHARED_QC.some((m) => u.includes(m))) {
    console.error("🔴 acc-qc-migrate: หยุด! host เป็นฐาน QC ที่ใช้ร่วม — ใช้ scripts/qc-prisma.sh แทน (และห้าม migrate ฐานร่วม)");
    process.exit(4);
  }
}
const cmd = process.argv[2];
if (cmd !== "status" && cmd !== "deploy" && cmd !== "drift") {
  console.error("ใช้: acc-qc-migrate.mts status|deploy|drift");
  process.exit(3);
}
console.log(`▶ acc-qc-migrate: host = ${host.split(".")[0]} (ฐานงานบัญชีของเลนนี้) · prisma migrate ${cmd}`);
// drift = `pnpm drift` (package.json) แบบอ่านอย่างเดียว กับฐานของเลนนี้ (ไม่ใช่ datasource ปริยาย)
const args =
  cmd === "drift"
    ? ["exec", "prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema", "--exit-code"]
    : ["exec", "prisma", "migrate", cmd];
const r = spawnSync("pnpm", args, { stdio: "inherit", env: process.env });
// ACC T4.4 ▸ ฐานทดสอบของเลนนี้: หลัง deploy สลับด่านสมุดรายวันเป็นโหมด qc (ชุดทดสอบล้างฟิกซ์เจอร์ได้) — production ไม่ผ่านสคริปต์นี้ ◂
if (cmd === "deploy" && r.status === 0) {
  const g = spawnSync("pnpm", ["exec", "tsx", "scripts/acc-ledger-guard-mode.mts", "qc"], { stdio: "inherit", env: process.env });
  process.exit(g.status ?? 1);
}
process.exit(r.status ?? 1);
