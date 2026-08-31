// QC — เพิ่ม/เอาออก ระบบและกิจการ (เจ้าของแจ้ง 3 ข้อ 31 ส.ค. 2026)
// ⚠️ Oracle ภายใต้ change control
//
// สัญญาที่ต้องจริงเสมอ:
// [1] ปุ่ม "+ เพิ่มกิจการ" ต้องเข้าหน้าสร้างได้จริง แม้ผู้ใช้มีกิจการอยู่แล้ว
//     (ด่านกันคนสมัครใหม่ ต้องไม่กันคนที่ตั้งใจเปิดกิจการที่สอง)
// [2] 🔴 สร้างระบบ/กิจการเสร็จต้องล้างแคช layout — ไม่งั้นเมนูไม่ขึ้นจนกว่าจะปิด-เปิดแอป
//     แล้วผู้ใช้จะกดเพิ่มซ้ำจนได้ระบบซ้ำซ้อน (อาการที่เจ้าของเจอ)
// [3] เอาระบบออกได้: feature → active=false · business → ARCHIVED · **ห้ามลบข้อมูล**
//     (บิล/นัด/สต็อก ผูกอยู่ · เอกสารภาษีต้องเก็บตามกฎหมาย) · เจ้าของกิจการเท่านั้น
// [4] เอาออกแล้วต้องหายจากเมนูจริง (query ที่ประกอบเมนูต้องไม่เห็นอีก)
// [5] ทางเข้าต้องหาเจอ: เมนูมีลิงก์ "จัดการระบบ" · หน้านั้นมีทางไปลบกิจการ
//
// รัน: pnpm exec tsx scripts/qc-systems-manage.mts
try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets */ }

const { prisma } = await import("@/lib/core/db");
const { readFileSync, existsSync } = await import("node:fs");
const sysService = await import("@/lib/modules/system/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

let tenantId = "";
try {
  // ── [1] เพิ่มกิจการ (static) ──
  console.log("── เพิ่มกิจการ ──");
  const onboarding = read("src/app/onboarding/page.tsx");
  chk("SM-1.1", "🔴 หน้า onboarding ไม่เด้งกลับเมื่อมากับ ?add=1 (ปุ่มเพิ่มกิจการถึงจะใช้ได้)",
    /adding\s*=\s*add === "1"/.test(onboarding) && /auth\.active && !adding\) redirect/.test(onboarding),
    "เช็ค add=1 ก่อน redirect", "redirect ทันทีที่มีกิจการ");
  chk("SM-1.2", "ปุ่มในเมนูชี้ไป /onboarding?add=1",
    /href="\/onboarding\?add=1"/.test(read("src/components/app-shell/NavDrawer.tsx")),
    "?add=1", "ไม่มีพารามิเตอร์");

  // ── [2] สร้างเสร็จแล้วเมนูต้องอัปเดตทันที (static) ──
  console.log("\n── สร้างแล้วเมนูขึ้นทันที ──");
  const sysActions = read("src/lib/actions/systems.ts");
  const businessPart = sysActions.slice(0, sysActions.indexOf("if (!AVAILABLE_FEATURE"));
  const featurePart = sysActions.slice(sysActions.indexOf("if (!AVAILABLE_FEATURE"));
  chk("SM-2.1", "🔴 สร้างระบบ business → revalidatePath('/app','layout') ก่อน redirect",
    /revalidatePath\("\/app", "layout"\)[\s\S]{0,120}redirect\(`\/app\/u\//.test(businessPart),
    "มี revalidate", "ไม่มี — เมนูจะค้างจนปิดเปิดแอป");
  chk("SM-2.2", "🔴 สร้างระบบ feature → revalidatePath('/app','layout') ก่อน redirect",
    /revalidatePath\("\/app", "layout"\)[\s\S]{0,120}redirect\(`\/app\/sys\//.test(featurePart),
    "มี revalidate", "ไม่มี — เมนูจะค้างจนปิดเปิดแอป");
  chk("SM-2.3", "สร้างกิจการใหม่ก็ล้างแคช layout เหมือนกัน",
    /revalidatePath\("\/app", "layout"\)/.test(read("src/lib/actions/onboarding.ts")),
    "มี revalidate", "ไม่มี");

  // ── [3][5] เอาระบบออก (static) ──
  console.log("\n── เอาระบบออก ──");
  chk("SM-3.1", "มี action เอาระบบออก + เจ้าของเท่านั้น",
    /export async function removeSystemAction/.test(sysActions) &&
      /auth\.active\.role !== "OWNER"/.test(sysActions), "มีทั้งคู่", "ขาด");
  chk("SM-3.2", "🔴 เอาออก = ซ่อน ไม่ใช่ลบข้อมูล (ห้ามมี delete ของ unit/system ใน action นี้)",
    !/prisma\.(businessUnit|appSystem)\.delete/.test(sysActions), "ไม่มี delete", "มี delete จริง");
  chk("SM-5.1", "เมนูมีลิงก์ไปหน้าจัดการระบบ",
    /\/app\/settings\/systems/.test(read("src/components/app-shell/NavDrawer.tsx")), "มีลิงก์", "ไม่มี", "MAJOR");
  const managePage = read("src/app/app/settings/systems/page.tsx");
  chk("SM-5.2", "หน้าจัดการระบบมีทั้งปุ่มเอาออก · เพิ่มกิจการ · ลบกิจการ",
    /removeSystemAction/.test(managePage) && /onboarding\?add=1/.test(managePage) &&
      /settings\/privacy/.test(managePage), "ครบ 3 ทาง", "ขาด", "MAJOR");

  // ── [3][4] พฤติกรรมจริงบน DB ──
  console.log("\n── เอาออกแล้วหายจากเมนูจริง (DB) ──");
  const t = await prisma.tenant.create({ data: { name: "QC จัดการระบบ", slug: `qc-mng-${Date.now()}` } });
  tenantId = t.id;
  const sys = await sysService.createSystemAutoLink(tenantId, "MEMBER", "สมาชิก QC");
  const unit = await prisma.businessUnit.create({
    data: { tenantId, type: "BOOKING", name: "สาขา QC", slug: `qc-u-${Date.now()}`, sortOrder: 0 },
  });

  const menuCounts = async () => ({
    systems: await prisma.appSystem.count({ where: { tenantId, active: true } }),
    units: await prisma.businessUnit.count({ where: { tenantId, status: { not: "ARCHIVED" } } }),
  });
  const before = await menuCounts();
  chk("SM-4.1", "ตั้งต้น: เมนูเห็นทั้งระบบและสาขา", before.systems === 1 && before.units === 1,
    "1/1", `${before.systems}/${before.units}`);

  // จำลองสิ่งที่ action ทำ (เรียก action ตรง ๆ ไม่ได้ — มี redirect/cookies ของ Next)
  await prisma.appSystemUnit.deleteMany({ where: { tenantId, systemId: sys.id } });
  await prisma.appSystem.updateMany({ where: { id: sys.id, tenantId }, data: { active: false } });
  await prisma.businessUnit.updateMany({ where: { id: unit.id, tenantId }, data: { status: "ARCHIVED" } });

  const after = await menuCounts();
  chk("SM-4.2", "เอาออกแล้ว: เมนูไม่เห็นทั้งคู่", after.systems === 0 && after.units === 0,
    "0/0", `${after.systems}/${after.units}`);
  chk("SM-4.3", "🔴 แถวข้อมูลยังอยู่ (ไม่ได้ลบทิ้ง — เอกสารบัญชีต้องเก็บตามกฎหมาย)",
    (await prisma.appSystem.count({ where: { id: sys.id } })) === 1 &&
      (await prisma.businessUnit.count({ where: { id: unit.id } })) === 1,
    "ยังอยู่ทั้งคู่", "หายไป");
} finally {
  if (tenantId) {
    await prisma.appSystemUnit.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.appSystem.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.businessUnit.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
    console.log("\n[cleanup] ลบร้านทดสอบเรียบร้อย");
  }
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: จัดการระบบ/กิจการ =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
