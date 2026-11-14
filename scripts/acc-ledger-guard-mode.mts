// acc-ledger-guard-mode.mts — สลับโหมดด่านกันแก้/ลบสมุดรายวัน + AuditLog ของบัญชี (ACC T4.4 · migration 20270103100000_acc_t44_ledger_guard · T5-A 20270105100000)
//
//   strict (ค่าเริ่มของ migration · production): ลบ/แก้ได้เฉพาะทางของระบบ (กลับรายการ · ธงตรวจ · กระทบยอด · รวมผู้ติดต่อ · ลบร้านที่ตั้ง shark.ledger_purge)
//   qc     (ฐานทดสอบเท่านั้น): ลบแถวได้ (ชุดทดสอบล้างฟิกซ์เจอร์ของตัวเองด้วย deleteMany) — ยังทดสอบโหมดเข้มได้ด้วย SET LOCAL shark.ledger_guard = 'strict'
//   shadow (ฐานทดสอบเท่านั้น · T5-A): ไม่ปฏิเสธ แต่ทุกคำสั่งที่โหมดเข้ม "จะปฏิเสธ" ถูกจดลงตาราง qc_ledger_guard_shadow
//          (ตารางสร้างที่นี่เท่านั้น — ไม่มีใน migration · ฐานที่ไม่มีตาราง = ปฏิเสธเหมือนโหมดเข้ม)
//
// ใช้: bash scripts/iso.sh pnpm exec tsx scripts/acc-ledger-guard-mode.mts status|qc|strict|shadow|shadow-clear|shadow-report [--json=<file>]|shadow-drop
//   🔴 ผ่าน `acc-v2-env.loadQcEnv()` เท่านั้น (ด่าน prod เด็ดขาด) — โหมด qc/shadow ห้ามตั้งบน production
//   ฐาน QC ของเลนอื่น: รันคำสั่งเดียวกันด้วย env ของฐานนั้น หรือ SQL ใน ledger/wo-notes/T4.4.md §2
import { writeFileSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
const cmd = process.argv[2] ?? "status";
const CMDS = ["status", "qc", "strict", "shadow", "shadow-clear", "shadow-report", "shadow-drop"];
if (!CMDS.includes(cmd)) {
  console.error(`ใช้: acc-ledger-guard-mode.mts ${CMDS.join("|")}`);
  process.exit(3);
}
const { prisma } = await import("@/lib/core/db");
const has = (await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'account_ledger_guard_mode'`))[0]?.n ?? 0;
if (!has) {
  console.error("🔴 ยังไม่มีฟังก์ชัน account_ledger_guard_mode — รัน acc-qc-migrate.mts deploy ก่อน");
  process.exit(2);
}
const SHADOW_DDL = `CREATE TABLE IF NOT EXISTS public.qc_ledger_guard_shadow (
  id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT clock_timestamp(), op text NOT NULL, tbl text NOT NULL, row_id text,
  cols text[], msg text, app text, fixture text, query text, xact text)`;
const setMode = (m: string) => prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION public.account_ledger_guard_mode() RETURNS text LANGUAGE sql STABLE AS $$ SELECT '${m}'::text $$`);

if (cmd === "qc" || cmd === "strict") await setMode(cmd);
if (cmd === "shadow") {
  const hasReject = (await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'account_ledger_reject'`))[0]?.n ?? 0;
  if (!hasReject) {
    console.error("🔴 ยังไม่มี account_ledger_reject (migration T5-A) — รัน acc-qc-migrate.mts deploy ก่อน");
    process.exit(2);
  }
  await prisma.$executeRawUnsafe(SHADOW_DDL);
  await setMode("shadow");
}
if (cmd === "shadow-clear") await prisma.$executeRawUnsafe(`TRUNCATE public.qc_ledger_guard_shadow RESTART IDENTITY`);
if (cmd === "shadow-drop") {
  const m = (await prisma.$queryRawUnsafe<{ m: string }[]>(`SELECT public.account_ledger_guard_mode() AS m`))[0]?.m;
  if (m === "shadow") await setMode("qc");
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS public.qc_ledger_guard_shadow`);
}
if (cmd === "shadow-report") {
  const exists = (await prisma.$queryRawUnsafe<{ t: string | null }[]>(`SELECT to_regclass('public.qc_ledger_guard_shadow')::text AS t`))[0]?.t;
  if (!exists) {
    console.error("ไม่มีตาราง qc_ledger_guard_shadow");
    process.exit(2);
  }
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT id::int AS id, at, op, tbl, row_id, cols, msg, app, fixture, query, xact FROM public.qc_ledger_guard_shadow ORDER BY id`,
  );
  const jsonArg = process.argv.find((a) => a.startsWith("--json="));
  if (jsonArg) writeFileSync(jsonArg.slice(7), JSON.stringify(rows, null, 1));
  const groups = new Map<string, number>();
  for (const r of rows) {
    const q = String(r.query ?? "").replace(/\s+/g, " ").slice(0, 140);
    const k = `${r.app ?? "?"} | ${r.op} ${r.tbl} | cols=${(r.cols as string[] | null)?.join(",") ?? "-"} | fixture=${r.fixture ?? "-"} | ${q}`;
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  console.log(`▶ shadow log: ${rows.length} แถว · ${groups.size} กลุ่ม`);
  for (const [k, n] of [...groups].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(6)}  ${k}`);
}
const mode = (await prisma.$queryRawUnsafe<{ m: string }[]>(`SELECT public.account_ledger_guard_mode() AS m`))[0]?.m;
console.log(`▶ acc-ledger-guard-mode: host = ${host.split(".")[0]} · โหมด = ${mode}`);
await prisma.$disconnect();
