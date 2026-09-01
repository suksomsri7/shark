// QC — DB ที่โค้ดชี้อยู่ ต้องตามทัน migration ในรีโป (ปิดช่องที่ทำแชท prod ดับ 1 ก.ย. 2026)
//
// 🔴 ทำไมต้องมี: commit ที่เพิ่มคอลัมน์ถูก deploy แต่ไม่มีใคร `migrate deploy` ⇒ Prisma client รู้จัก
//    คอลัมน์ที่ DB ไม่มี ⇒ `findFirst` ที่ไม่ระบุ select **พังทั้งตาราง** ⇒ แชทดับ ~2.5 ชม. เงียบ ๆ
//    · CI เขียวตลอดเพราะ CI migrate บน Neon branch ของตัวเอง — **ไม่เคยมองไปที่ prod**
//    · ชุดที่จับได้ในวันนั้นคือชุดที่ต่อ DB จริง 2 ชุด และรายงานเป็น "HARNESS error" ไม่ใช่ "DB ตกรุ่น"
//
// ด่านนี้วัด **DB ที่ .env ชี้อยู่** (เครื่อง dev = prod · CI = branch ที่ migrate แล้ว)
//  MS-1) `prisma migrate status` ต้องไม่มี migration ค้าง
//  MS-2) `prisma migrate diff` DB ↔ schema ต้องไม่ต่างกัน (drift — คอลัมน์ที่ใครไปเติมมือ / ลืมสร้าง migration)
//  MS-3) ไม่มี DATABASE_URL = **แดง** ไม่ใช่ข้าม (ด่านที่ข้ามเงียบ = ไม่มีด่าน)
//
// ⚠️ อ่านอย่างเดียว — ไม่ apply อะไร · การ apply เป็นหน้าที่ `scripts/vercel-build.sh` ตอน deploy
// ⚠️ standalone: ไม่ import จาก src/ — ด่านนี้ต้องทำงานได้แม้ src/ พังจากคอลัมน์ที่หาย
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";

try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets */ }

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
function prisma(args: string[]): { code: number; out: string } {
  const r = spawnSync("pnpm", ["exec", "prisma", ...args], { encoding: "utf8", env: process.env });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 300);

const url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
const host = url.match(/@([^/?:]+)/)?.[1] ?? "<ไม่มี>";
console.log(`\n── ตรวจ DB: ${host} ──`);

// MS-3 ก่อน — ไม่มี DB ให้วัด ต้องแดงชัด ๆ ไม่ใช่ปล่อยให้ 2 ข้อล่างพังแบบอ่านไม่ออก
chk("MS-3", "มี DATABASE_URL/DIRECT_URL ให้ตรวจ (ไม่มี = แดง ไม่ใช่ข้าม)", url.length > 0, "url", "ว่าง");

if (url) {
  // MS-1 — migration ค้าง
  const st = prisma(["migrate", "status"]);
  const pending = /have not yet been applied/i.test(st.out);
  const upToDate = /Database schema is up to date/i.test(st.out);
  const localCount = existsSync("prisma/migrations")
    ? readdirSync("prisma/migrations").filter((d) => /^\d{14}_/.test(d)).length
    : 0;
  const pendingList = pending
    ? (st.out.split("\n").filter((l) => /^\d{14}_/.test(l.trim())).map((l) => l.trim()).join(", ") || "(ดูรายละเอียดใน log)")
    : "";
  chk(
    "MS-1",
    `ไม่มี migration ค้าง (ในรีโป ${localCount} ตัว)`,
    st.code === 0 && upToDate && !pending,
    "Database schema is up to date",
    pending ? `ค้าง: ${pendingList}` : oneLine(st.out.split("\n").slice(-4).join(" ")),
  );

  // MS-2 — drift (สิ่งที่ migrate status มองไม่เห็น: คอลัมน์ที่ต่างกันโดยไม่มี migration)
  const df = prisma(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema", "--exit-code"]);
  chk(
    "MS-2",
    "DB ตรงกับ prisma/schema (ไม่มี drift)",
    df.code === 0,
    "No difference detected",
    oneLine(df.out) || `exit ${df.code}`,
  );
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: DB ตามทัน migration =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
