// QC — ลิงก์สาธารณะที่เอาไปแปะให้ลูกค้า ต้องเป็นโดเมนที่เปิดอยู่จริง (เจ้าของแจ้ง 31 ส.ค. 2026)
// ⚠️ Oracle ภายใต้ change control
//
// ที่มา: ลิงก์ "แชทหน้าเว็บ" ที่ระบบให้เจ้าของไปแปะ ชี้ไป `https://shark.suksomsri.cloud/chat/...`
// ซึ่งเป็นโดเมน VPS ที่ **ปิดไปแล้ว** (เปิดจริงได้ 502) — ค่ามาจาก env `APP_URL` ที่ตั้งด้วยมือ
// แล้วค้างอยู่ตั้งแต่ย้ายมา Vercel · ไม่มีอะไรฟ้องเลยจนเจ้าของไปกดเอง
//
// สัญญาที่ต้องจริงเสมอ:
// [1] ลิงก์ที่ "แสดงบนหน้าจอให้ผู้ใช้ก๊อปไปแปะ" ต้องมาจากโดเมนของคำขอจริง (publicOrigin)
//     ไม่ใช่ env ที่ตั้งด้วยมือ — env เน่าเงียบได้ แต่โดเมนของคำขอเน่าไม่ได้
// [2] publicOrigin ต้อง fallback ไป env.APP_URL เมื่อไม่มี request (อีเมล/cron) และห้าม throw
// [3] เส้นทางสาธารณะที่ลิงก์เหล่านั้นชี้ไป ต้องมีหน้าอยู่จริงในรีโป
//
// รัน: pnpm exec tsx scripts/qc-public-links.mts
import { existsSync, readFileSync } from "node:fs";

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; ok: boolean; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
// 🔴 กติกาประจำรีโป: เช็คที่ grep โค้ดต้องตัดคอมเมนต์ทิ้งก่อน ไม่งั้นบรรทัดที่ "เล่าว่าเคยใช้ env.APP_URL"
//    จะถูกนับเป็นการใช้จริง (เจอทันทีตอนเขียนข้อสอบนี้ — ผลลบปลอม 2 ข้อ)
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ไฟล์ที่ "สร้างลิงก์ให้ผู้ใช้เอาไปแปะ" → ต้องใช้ publicOrigin ไม่ใช่ env.APP_URL
const DISPLAY_LINK_FILES: [string, string][] = [
  ["แชทหน้าเว็บ + webhook", "src/lib/modules/chat/ui.tsx"],
  ["ลิงก์ฟอร์มสาธารณะ", "src/app/app/forms/[id]/page.tsx"],
  ["ลิงก์หน้าเพจ", "src/app/app/pages/[pageId]/page.tsx"],
  ["จอคิวสาธารณะ", "src/app/app/u/[unitSlug]/queue/page.tsx"],
  ["พอร์ทัลผู้ขาย", "src/lib/modules/inventory/ui.tsx"],
];

console.log("── [1] ลิงก์บนหน้าจอต้องมาจากโดเมนของคำขอ ──");
for (const [label, path] of DISPLAY_LINK_FILES) {
  const src = code(path);
  chk(`PL-1/${label}`, `${label} ใช้ publicOrigin (ไม่ผูกกับ env.APP_URL)`,
    src.includes("publicOrigin") && !/env\.APP_URL/.test(src), "publicOrigin", "ยังใช้ env.APP_URL");
}

console.log("\n── [2] ตัวช่วยหาโดเมน ──");
const origin = read("src/lib/core/origin.ts"); // ตัวนี้ตั้งใจอ่านทั้งไฟล์ (ตรวจว่ามี fallback)
chk("PL-2.1", "อ่านโดเมนจาก header ของคำขอ (x-forwarded-host / host)",
  /x-forwarded-host/.test(origin) && /headers\(\)/.test(origin), "อ่านจาก header", "ไม่ได้อ่าน");
chk("PL-2.2", "ไม่มี request → fallback ไป env.APP_URL และไม่ throw (อีเมล/cron ยังใช้ได้)",
  /catch\s*\{[\s\S]{0,80}fallback/.test(origin) && /env\.APP_URL/.test(origin),
  "มี fallback ใน catch", "ไม่มี");

console.log("\n── [3] ปลายทางของลิงก์มีหน้าอยู่จริง ──");
const ROUTES: [string, string][] = [
  ["/chat/<id>", "src/app/(store)/chat/[connectionId]/page.tsx"],
  ["/f/<token>", "src/app/(store)/f/[token]/page.tsx"],
  ["/p/<slug>", "src/app/p/[slug]/page.tsx"],
  ["/vendor/<token>", "src/app/(store)/vendor/[token]/page.tsx"],
];
for (const [label, file] of ROUTES) {
  chk(`PL-3/${label}`, `${label} มีหน้าอยู่จริง`, existsSync(file), "มีไฟล์", file, "MAJOR");
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: ลิงก์สาธารณะ =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
