// เติมเลขที่ผู้ติดต่อ (AccountContact.code = "C00019") ให้แถวเก่าที่ยังเป็น NULL — WO 3.3
//
// ทำไมไม่ทำใน migration SQL: ข้อมูลลูกค้าจริงบน prod ต้องเติมทีละก้าวโดยคนกดเอง (ตรวจก่อน/หลังได้)
// migration ที่แก้ข้อมูลจะรันเงียบ ๆ ตอน deploy — ผิดกติกา "migration additive เท่านั้น" ของ run นี้
//
// เลขที่ให้แบบเดียวกับที่หน้ารายการ WO 3.2 คำนวณสด: เรียงตาม createdAt ASC ทั้งระบบ (ข้ามลูกค้า/ผู้ขาย)
// ⇒ หลัง backfill เลขบนจอ **ไม่เปลี่ยน** สำหรับแถวที่มีอยู่แล้ว (ผู้ใช้ไม่งง เอกสารเก่าที่อ้างเลขยังตรง)
//
// รัน (DB QC เท่านั้นในรอบนี้ — prod ให้ Fable สั่งเองหลังเฟส 3 ปิด):
//   pnpm exec tsx scripts/acc-v2-contact-code-backfill.mts            # dry-run (ไม่เขียน)
//   pnpm exec tsx scripts/acc-v2-contact-code-backfill.mts --apply    # เขียนจริง
// รันซ้ำได้ (idempotent): แถวที่มี code แล้วถูกข้ามเสมอ

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
};
const { host } = accEnv.loadQcEnv();

const APPLY = process.argv.includes("--apply");
const { prisma } = await import("@/lib/core/db");

console.log(`เติมเลขที่ผู้ติดต่อ — host ${host} · โหมด ${APPLY ? "เขียนจริง (--apply)" : "ลองดูเฉย ๆ (dry-run)"}`);

const systems = await prisma.appSystem.findMany({ where: { type: "ACCOUNT" }, select: { id: true, tenantId: true } });
let totalFilled = 0;
let totalSkipped = 0;

for (const sys of systems) {
  const rows = await prisma.accountContact.findMany({
    where: { systemId: sys.id },
    select: { id: true, code: true },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) continue;

  // เลขที่ถูกใช้ไปแล้ว (แถวที่ backfill รอบก่อน หรือผู้ใช้กรอกเอง) — ห้ามซ้ำ (partial unique index จะโยน)
  const used = new Set(rows.map((r) => r.code).filter((c): c is string => !!c));
  let seq = 0;
  const plan: { id: string; code: string }[] = [];
  for (const r of rows) {
    seq += 1;
    if (r.code) {
      totalSkipped += 1;
      continue;
    }
    let code = `C${String(seq).padStart(5, "0")}`;
    // เลขตามลำดับชนกับที่มีอยู่แล้ว → เลื่อนไปเลขว่างถัดไป (ไม่ค้างทั้งชุดเพราะแถวเดียว)
    let bump = seq;
    while (used.has(code)) {
      bump += 1;
      code = `C${String(bump).padStart(5, "0")}`;
    }
    used.add(code);
    plan.push({ id: r.id, code });
  }
  if (plan.length === 0) continue;
  console.log(`  ระบบ ${sys.id}: เติม ${plan.length} แถว (มีเลขแล้ว ${rows.length - plan.length})`);
  if (APPLY) {
    // ทีละแถว (ไม่ใช่ updateMany) เพราะแต่ละแถวได้เลขไม่เหมือนกัน · ผูก systemId กันข้ามร้าน
    for (const p of plan) {
      await prisma.accountContact.updateMany({ where: { id: p.id, systemId: sys.id }, data: { code: p.code } });
    }
  }
  totalFilled += plan.length;
}

console.log(
  `${APPLY ? "✅ เติมแล้ว" : "🔎 จะเติม"} ${totalFilled} แถว · ข้าม (มีเลขอยู่แล้ว) ${totalSkipped} แถว · ระบบบัญชี ${systems.length} ระบบ`,
);
if (!APPLY && totalFilled > 0) console.log("   สั่งจริงด้วย --apply");
await prisma.$disconnect();
