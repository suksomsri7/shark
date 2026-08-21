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
//   pnpm qc:all --shard=2/6     → รันเฉพาะส่วนที่ 2 จาก 6 ส่วน (สำหรับ CI ที่ซอยงานขนาน)
// exit 1 ถ้ามีชุดไหนแดง (ใช้เป็น gate ได้)
//
// 🔴 ทำไมต้องมี --shard (วัดจริง 21 ส.ค. 2026): บน GitHub runner ชุดเดียวกันช้ากว่าเครื่อง dev ~10 เท่า
// (`qc:account` 18 วิ บนเครื่อง → **195 วิ** บน CI) เพราะ DB อยู่ ap-southeast-1 แต่ runner อยู่ US
// → ทุก round-trip กิน ~200ms · ข้อสอบพวกนี้ยิง query ต่อเนื่องเป็นร้อยครั้ง
// รันเรียงทีละตัวทั้ง 152 ชุดบน CI = ~92 นาที (ทะลุ timeout ตัดจบเปล่า 2 รอบ)
// → ซอยเป็นส่วน ๆ ให้ CI รันขนาน · งานรวมเท่าเดิม (Neon compute-time ไม่เพิ่ม) แต่เวลารอหารด้วยจำนวนส่วน
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const filters = argv.filter((a) => !a.startsWith("-"));

// --shard=i/n · i เริ่มที่ 1
const shardArg = argv.find((a) => a.startsWith("--shard="))?.slice("--shard=".length);
let shard: { i: number; n: number } | null = null;
if (shardArg) {
  const [i, n] = shardArg.split("/").map((x) => Number.parseInt(x, 10));
  if (!Number.isInteger(i) || !Number.isInteger(n) || n < 1 || i < 1 || i > n) {
    console.error(`--shard ต้องเป็นรูป i/n และ 1 ≤ i ≤ n (ได้มา: ${shardArg})`);
    process.exit(1);
  }
  shard = { i: i!, n: n! };
}

const all = readdirSync(join(ROOT, "scripts"))
  .filter((f) => /^qc-.*\.mts$/.test(f) && f !== "qc-all.mts")
  .sort();
const matched = filters.length ? all.filter((f) => filters.some((q) => f.includes(q))) : all;
// แบ่งแบบสลับฟันปลา (ไม่ใช่ตัดเป็นก้อน) — ชุดที่ชื่อใกล้กันมักหนักพอ ๆ กัน
// ตัดเป็นก้อนจะได้ส่วนที่หนักกระจุกอยู่ส่วนเดียว แล้วส่วนนั้นกลายเป็นคอขวด
const picked = shard ? matched.filter((_, idx) => idx % shard!.n === shard!.i - 1) : matched;

if (picked.length === 0) {
  console.error(`ไม่พบข้อสอบที่ตรงกับ: ${filters.join(", ")}${shard ? ` (shard ${shard.i}/${shard.n})` : ""}`);
  process.exit(1);
}

const scope = shard ? ` · ส่วนที่ ${shard.i}/${shard.n} จากทั้งหมด ${matched.length} ชุด` : "";
console.log(`▶ รันข้อสอบ ${picked.length} ชุด (เรียงทีละตัว)${scope}\n`);

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
console.log(`\n===== QC ALL${shard ? ` (ส่วนที่ ${shard.i}/${shard.n})` : ""} =====`);
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
