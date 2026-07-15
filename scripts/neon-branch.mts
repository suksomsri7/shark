// สร้าง/ลบ Neon DB branch — 1 งาน = 1 DB ของตัวเอง
//
// ทำไมต้องมี: DB มีก้อนเดียว (production) ถ้า AI หลายตัวทำงานพร้อมกันแล้วรัน migrate/เทสต์
// บนก้อนเดียวกัน = ชนกันแน่นอน (เคยเกิดแล้ว: 7 subagent ตายพร้อมกัน ทิ้งงานครึ่ง ๆ กลาง ๆ)
// Neon branch = ก๊อป DB ทั้งก้อนใน ~1 วินาที (copy-on-write ไม่กินที่) → แต่ละตัวได้ก้อนของตัวเอง
//
// ใช้:
//   pnpm neon:create wo-0142        → สร้าง + พิมพ์ DATABASE_URL/DIRECT_URL
//   pnpm neon:delete wo-0142        → ลบทิ้ง
//   pnpm neon:list                  → ดูว่ามีอะไรค้างอยู่ (กันลืมลบ = เปลืองเงิน)
//   pnpm neon:gc                    → ลบ branch เทสต์ที่เก่ากว่า 24 ชม. ทิ้งอัตโนมัติ
//
// ⚠️ กันพลาด: ห้ามลบ branch ที่เป็น default (production) — เช็คไว้ 2 ชั้น

process.loadEnvFile(".env");

const KEY = process.env.NEON_API_KEY;
const PID = process.env.NEON_PROJECT_ID;
if (!KEY || !PID) {
  console.error("❌ ไม่มี NEON_API_KEY / NEON_PROJECT_ID ใน .env");
  process.exit(1);
}

const API = `https://console.neon.tech/api/v2/projects/${PID}`;
const H = { Authorization: `Bearer ${KEY}`, Accept: "application/json", "Content-Type": "application/json" };

// prefix บังคับ — กันสั่งลบ production ด้วยความพลั้งเผลอ
const PREFIX = "wo-";
const CI_PREFIX = "ci-";
const isDisposable = (n: string) => n.startsWith(PREFIX) || n.startsWith(CI_PREFIX);

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${API}${path}`, { ...init, headers: H });
  const body = await r.text();
  if (!r.ok) throw new Error(`Neon API ${r.status} ${path}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : {};
}

type Branch = { id: string; name: string; default?: boolean; created_at: string };
const listBranches = async (): Promise<Branch[]> => (await api("/branches")).branches ?? [];

async function create(name: string) {
  if (!isDisposable(name)) throw new Error(`ชื่อ branch ต้องขึ้นต้นด้วย "${PREFIX}" หรือ "${CI_PREFIX}" (กันไปแตะ production)`);
  let branches = await listBranches();
  let b = branches.find((x) => x.name === name);
  if (b) {
    console.error(`⚠️  branch "${name}" มีอยู่แล้ว — ใช้ของเดิม`);
  } else {
    const res = await api("/branches", {
      method: "POST",
      body: JSON.stringify({ branch: { name }, endpoints: [{ type: "read_write" }] }),
    });
    b = res.branch;
    branches = await listBranches();
  }
  const branchId = b!.id;

  // ⚠️ ต้องใช้ branch_id — เคยใช้ branch_name แล้ว Neon **ส่ง URI ของ production กลับมา**
  //    (bug จริง เจอ 2026-07-15) → ถ้าเผลอเอาไปรัน migrate reset = ล้าง DB จริงทิ้ง
  const q = `database_name=neondb&role_name=neondb_owner&branch_id=${branchId}`;
  const pooled = (await api(`/connection_uri?${q}&pooled=true`)).uri as string;
  // DIRECT_URL ต้อง "ไม่ผ่าน pooler" — Prisma migrate ใช้ advisory lock ซึ่ง pooler (tx mode) เอาไม่อยู่
  // Neon ส่ง pooler มาให้ทั้งคู่ → ถอด "-pooler" ออกเอง (ดู INFRA.md §2.2)
  const direct = ((await api(`/connection_uri?${q}`)).uri as string).replace("-pooler.", ".");

  // ── ด่านกันพลาด: URI ที่ได้ ต้องไม่ใช่ endpoint ของ default branch เด็ดขาด ──
  const prod = branches.find((x) => x.default);
  const eps: { branch_id: string; host: string }[] = (await api("/endpoints")).endpoints ?? [];
  const prodHost = eps.find((e) => e.branch_id === prod?.id)?.host?.replace("-pooler", "");
  const mineHost = eps.find((e) => e.branch_id === branchId)?.host?.replace("-pooler", "");
  const hostOf = (u: string) => new URL(u).hostname.replace("-pooler", "");

  for (const [label, uri] of [["DIRECT_URL", direct], ["DATABASE_URL", pooled]] as const) {
    if (prodHost && hostOf(uri) === prodHost) {
      throw new Error(
        `🔴 หยุด! ${label} ที่ Neon ส่งกลับมาชี้ไป production (${prodHost}) ไม่ใช่ branch "${name}" — ห้ามใช้เด็ดขาด`,
      );
    }
    if (mineHost && hostOf(uri) !== mineHost) {
      throw new Error(`🔴 หยุด! ${label} ชี้ไป ${hostOf(uri)} แต่ branch "${name}" ควรเป็น ${mineHost}`);
    }
  }

  console.log(`✅ branch "${name}" พร้อมใช้ (endpoint แยกจาก production: ${mineHost})\n`);
  console.log(`DATABASE_URL=${pooled}`);
  console.log(`DIRECT_URL=${direct}`);
}

async function remove(name: string) {
  const b = (await listBranches()).find((x) => x.name === name);
  if (!b) return console.log(`(ไม่มี branch "${name}" — ข้าม)`);
  if (b.default) throw new Error(`🔴 "${name}" เป็น default branch (production) — ห้ามลบ`);
  if (!isDisposable(name)) throw new Error(`🔴 "${name}" ไม่ใช่ branch ชั่วคราว — ห้ามลบ`);
  await api(`/branches/${b.id}`, { method: "DELETE" });
  console.log(`🗑️  ลบ branch "${name}" แล้ว`);
}

async function list() {
  const bs = await listBranches();
  for (const b of bs) {
    const age = (Date.now() - new Date(b.created_at).getTime()) / 3_600_000;
    const tag = b.default ? "🔒 production (ห้ามแตะ)" : isDisposable(b.name) ? "ชั่วคราว" : "?";
    console.log(`  ${b.name.padEnd(24)} ${tag.padEnd(24)} อายุ ${age.toFixed(1)} ชม.`);
  }
  console.log(`\nรวม ${bs.length} branch`);
}

/** ลบ branch ชั่วคราวที่เก่าเกิน N ชม. — กันลืมลบแล้วเปลืองเงิน (agent ตายกลางคันเกิดขึ้นจริง) */
async function gc(maxAgeHours = 24) {
  const bs = await listBranches();
  const stale = bs.filter(
    (b) => !b.default && isDisposable(b.name) && (Date.now() - new Date(b.created_at).getTime()) / 3_600_000 > maxAgeHours,
  );
  if (!stale.length) return console.log(`ไม่มี branch ค้างเกิน ${maxAgeHours} ชม.`);
  for (const b of stale) {
    await api(`/branches/${b.id}`, { method: "DELETE" });
    console.log(`🗑️  ลบ "${b.name}" (ค้าง ${((Date.now() - new Date(b.created_at).getTime()) / 3_600_000).toFixed(1)} ชม.)`);
  }
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === "create") await create(arg);
  else if (cmd === "delete") await remove(arg);
  else if (cmd === "list") await list();
  else if (cmd === "gc") await gc(Number(arg) || 24);
  else {
    console.error("ใช้: neon-branch.mts create|delete <ชื่อ> | list | gc [ชม.]");
    process.exit(1);
  }
} catch (e) {
  console.error(`❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
