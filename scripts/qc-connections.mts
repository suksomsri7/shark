// QC — รวมการเชื่อมระบบไว้ที่เดียว + ซ่อนจากหน้าระบบ (คำสั่งเจ้าของ 24 ก.ค.) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา:
//   1) หน้า /app/sys/[id] ไม่มีกล่อง "เชื่อมต่อกับระบบ" อีก (ไม่ import linkUnitAction/unlinkUnitAction)
//      — กิจการหลายสาขา: มีลิงก์เล็กไป /app/settings/connections แทน
//   2) หน้าใหม่ /app/settings/connections: ตารางสาขา × ระบบ feature ติ๊กเชื่อม/ถอด — reuse linkUnitAction/unlinkUnitAction เดิม
//   3) system/service.ts เพิ่ม createSystemAutoLink(tenantId, type, name) → สร้าง + ถ้ากิจการมี 1 unit เชื่อมให้อัตโนมัติ
//      (ซ่อน UI สำหรับสาขาเดียวแล้ว ระบบใหม่ต้องไม่หลุดการเชื่อม) — addSystemAction ใช้ตัวนี้
//   4) NavDrawer หมวดตั้งค่า มี "สาขาและการเชื่อมระบบ"
try { process.loadEnvFile(".env"); } catch {}
import { readFileSync, existsSync } from "node:fs";
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

const ts = Date.now();
const tids: string[] = [];
try {
  // ── 3) auto-link เมื่อสาขาเดียว (runtime) ──
  const svc = (await import("@/lib/modules/system/service")) as unknown as { [k: string]: (...a: any[]) => Promise<any> };
  if (typeof svc.createSystemAutoLink !== "function") chk("CN-1.0", "มี createSystemAutoLink ใน system/service", false, "มี", "ยังไม่สร้าง");
  else {
    const t1 = await prisma.tenant.create({ data: { name: "QC CN เดี่ยว", slug: `qc-cn1-${ts}` } }); tids.push(t1.id);
    const u1 = await prisma.businessUnit.create({ data: { tenantId: t1.id, type: "BOOKING", name: "สาขาเดียว", slug: `qc-cn-u1-${ts}` } });
    const s1 = await svc.createSystemAutoLink(t1.id, "MEMBER", "สมาชิก");
    const links1 = await prisma.appSystemUnit.count({ where: { tenantId: t1.id, systemId: s1.id } });
    chk("CN-1.1", "กิจการ 1 สาขา → ระบบใหม่เชื่อมสาขาให้อัตโนมัติ", links1 === 1, "1", String(links1));

    const t2 = await prisma.tenant.create({ data: { name: "QC CN คู่", slug: `qc-cn2-${ts}` } }); tids.push(t2.id);
    await prisma.businessUnit.create({ data: { tenantId: t2.id, type: "BOOKING", name: "สาขา A", slug: `qc-cn-a-${ts}` } });
    await prisma.businessUnit.create({ data: { tenantId: t2.id, type: "BOOKING", name: "สาขา B", slug: `qc-cn-b-${ts}` } });
    const s2 = await svc.createSystemAutoLink(t2.id, "MEMBER", "สมาชิก");
    const links2 = await prisma.appSystemUnit.count({ where: { tenantId: t2.id, systemId: s2.id } });
    chk("CN-1.2", "กิจการ 2 สาขา → ไม่เชื่อมเอง (เจ้าของเลือกที่หน้ารวม)", links2 === 0, "0", String(links2));
  }

  // ── 1) หน้าระบบไม่มีกล่องเชื่อมต่อ ──
  const sysPage = readFileSync("src/app/app/sys/[id]/page.tsx", "utf8");
  chk("CN-2.1", "หน้า /app/sys/[id] ไม่ใช้ linkUnitAction/unlinkUnitAction แล้ว", !sysPage.includes("linkUnitAction") && !sysPage.includes("unlinkUnitAction"), "ไม่ใช้", "ยังอยู่");
  chk("CN-2.2", "หลายสาขา → มีลิงก์ไป /app/settings/connections (สาขาเดียว = ไม่มีอะไรเลย)", sysPage.includes("/app/settings/connections"), "มี", "ไม่พบ");

  // ── 2) หน้ารวมการเชื่อม ──
  const connPath = "src/app/app/settings/connections/page.tsx";
  if (!existsSync(connPath)) chk("CN-3.0", "มีหน้า /app/settings/connections", false, "มี", "ยังไม่สร้าง");
  else {
    const conn = readFileSync(connPath, "utf8");
    chk("CN-3.1", "reuse linkUnitAction/unlinkUnitAction เดิม (ห้าม fork/แตะ prisma ใน page เกินอ่าน)", conn.includes("linkUnitAction") && conn.includes("unlinkUnitAction"), "ใช้", "ไม่พบ");
    chk("CN-3.2", "เป็นตารางสาขา × ระบบ (มีทั้ง units และ systems)", /unit/i.test(conn) && /system/i.test(conn), "มี", "ไม่ครบ");
  }
  const nav = readFileSync("src/components/app-shell/NavDrawer.tsx", "utf8");
  chk("CN-4.1", "NavDrawer หมวดตั้งค่า มี 'สาขาและการเชื่อมระบบ'", nav.includes("สาขาและการเชื่อมระบบ") && nav.includes("/app/settings/connections"), "มี", "ไม่พบ");
} finally {
  for (const tid of tids) {
    for (const m of ["appSystemUnit", "appSystem", "businessUnit", "membership"] as const) {
      await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }).catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
  await prisma.$disconnect();
}
const crit = cks.filter((c) => !c.ok && c.sev === "CRITICAL").length;
console.log(`\nqc-connections: ${cks.filter((c) => c.ok).length}/${cks.length} ผ่าน · CRITICAL fail ${crit}`);
if (cks.some((c) => !c.ok)) process.exit(1);
