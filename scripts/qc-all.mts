// รันข้อสอบ **ทุกชุด** ใน scripts/qc-*.mts แล้วสรุปเป็นตารางเดียว
//
// ทำไมต้องมี (เหตุการณ์จริง 19 ส.ค. 2026): repo มี oracle 149 ชุด แต่ package.json ผูกไว้แค่ 63
// → อีก 86 ชุด (รวม qc-hardening / qc-pdpa / qc-public-api / qc-mobile-auth) **ไม่เคยถูกรันเป็น gate เลย**
// พอรันจริงพบ 2 ชุดแดงค้างมาเป็นสัปดาห์โดยไม่มีใครรู้ (ข้อสอบเน่าตามเวลา)
// → ต่อจากนี้ "ทดสอบทั้งระบบ" = `pnpm qc:all` คำสั่งเดียว ไม่มีข้อสอบตกสำรวจอีก
//
// ใช้:
//   pnpm qc:all                 → รันทุกชุด (เรียงทีละตัว — VPS 2 core ห้ามขนาน)
//   pnpm qc:all pos hr          → รันเฉพาะชุดที่ชื่อมีคำเหล่านี้
// exit 1 ถ้ามีชุดไหนแดง (ใช้เป็น gate ได้)
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const filters = process.argv.slice(2).filter((a) => !a.startsWith("-"));

const all = readdirSync(join(ROOT, "scripts"))
  .filter((f) => /^qc-.*\.mts$/.test(f) && f !== "qc-all.mts")
  .sort();
const picked = filters.length ? all.filter((f) => filters.some((q) => f.includes(q))) : all;

if (picked.length === 0) {
  console.error(`ไม่พบข้อสอบที่ตรงกับ: ${filters.join(", ")}`);
  process.exit(1);
}

console.log(`▶ รันข้อสอบ ${picked.length} ชุด (เรียงทีละตัว)\n`);

type Row = { name: string; code: number; summary: string; ms: number };
const rows: Row[] = [];

for (const f of picked) {
  const t0 = Date.now();
  const r = spawnSync("pnpm", ["exec", "tsx", join("scripts", f)], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  // ข้อสอบแต่ละยุคพิมพ์สรุปคนละแบบ — เก็บบรรทัดสรุปแบบไหนก็ได้ที่เจอท้ายสุด
  const m = out.match(/(?:ผ่าน|pass)[^\n·|]*\d+\/\d+|ผ่าน \d+ ข้อ|ผ่านทั้งหมด/g);
  const code = r.status ?? 1;
  rows.push({ name: f.replace(/^qc-|\.mts$/g, ""), code, summary: m ? m[m.length - 1]! : "-", ms: Date.now() - t0 });
  const last = rows[rows.length - 1]!;
  console.log(`  ${code === 0 ? "✅" : "❌"} ${last.name.padEnd(24)} ${last.summary.padEnd(22)} ${(last.ms / 1000).toFixed(1)}s`);
}

const failed = rows.filter((r) => r.code !== 0);
console.log(`\n===== QC ALL =====`);
console.log(`ผ่าน ${rows.length - failed.length}/${rows.length} ชุด · รวม ${(rows.reduce((a, r) => a + r.ms, 0) / 1000).toFixed(0)}s`);
if (failed.length) {
  console.log(`\n❌ ชุดที่แดง:`);
  for (const f of failed) console.log(`   · ${f.name} — ${f.summary}`);
}
console.log("\nJSON_SUMMARY " + JSON.stringify({
  total: rows.length,
  passed: rows.length - failed.length,
  findings: failed.map((f) => ({ id: f.name, detail: f.summary })),
}));
process.exit(failed.length ? 1 : 0);
