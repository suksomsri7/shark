// QC — Kernel guard (tenantDb) · ยามชั้นที่ 2 ของทั้งแพลตฟอร์ม
// ⚠️ Oracle ของ Fable — Builder ห้ามแตะหลังเขียว · standalone-typesafe (dynamic import + wide cast)
//
// ทำไมต้องมีข้อสอบชุดนี้: `tenantDb()` คือด่านเดียวที่กันข้อมูลรั่วข้ามร้านในระดับ query
// มี oracle รายโมดูลเยอะ แต่ **ไม่เคยมีข้อสอบที่ยิงตัวยามเองตรง ๆ** — พฤติกรรมของยามจึงเปลี่ยนได้เงียบ ๆ
//
// สัญญาที่ต้องจริงเสมอ (ทุก operation):
//   KG-1 findMany/findFirst/count  → ถูกกรองด้วย tenantId เสมอ (ร้านอื่นมองไม่เห็น)
//   KG-2 findUnique                → row ของร้านอื่น = null **แม้ where จะ unique ทั้งก้อน**
//   KG-3 🔴 findUnique + `select` ที่ไม่มี tenantId → ต้องยัง null
//        (ช่องโหว่จริงที่เจอ 19 ส.ค. 2026: ยามเช็คหลัง query ด้วย `row.tenantId === ctx` —
//         พอ select ตัดคอลัมน์ tenantId ทิ้ง ค่าที่อ่านได้เป็น undefined → ยามตีความว่า "ผ่าน"
//         = อ่านแถวข้ามร้านได้ฟรีทุกจุดที่ใช้ select. แก้: ยัดตัวกรองเข้า where ตั้งแต่ต้น)
//   KG-4 update/delete ข้ามร้าน   → โยน **โดยไม่เขียน** (preventive ไม่ใช่ post-hoc)
//   KG-5 create                    → ยัด tenantId ให้เอง (สร้างให้ร้านอื่นไม่ได้)
//   KG-6 model unit/system-scoped  → ไม่มี unitId/systemId ในบริบท = โยนทันที (fail-closed)
//
// รัน: pnpm qc:kernel
try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets */ }

const { prisma, tenantDb } = (await import("@/lib/core/db" as string)) as {
  prisma: any;
  tenantDb: (ctx: { tenantId: string; unitId?: string; systemId?: string }) => any;
};

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const threw = async (fn: () => Promise<unknown>): Promise<boolean> => {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
};

const ts = Date.now();
const tids: string[] = [];

try {
  // ── setup: 2 ร้าน · ร้าน B มี Page 1 หน้า (slug = unique ระดับ global → เป็นเคสทดสอบที่ตรงที่สุด) ──
  const A = await prisma.tenant.create({ data: { name: "QC KG ร้าน A", slug: `qc-kg-a-${ts}` } });
  const B = await prisma.tenant.create({ data: { name: "QC KG ร้าน B", slug: `qc-kg-b-${ts}` } });
  tids.push(A.id, B.id);
  const unitB = await prisma.businessUnit.create({
    data: { tenantId: B.id, type: "BOOKING", name: "สาขา B", slug: `kg-b-${ts}` },
  });
  const unitA = await prisma.businessUnit.create({
    data: { tenantId: A.id, type: "BOOKING", name: "สาขา A", slug: `kg-a-${ts}` },
  });
  const pageB = await prisma.page.create({
    data: { tenantId: B.id, unitId: unitB.id, name: "หน้าของร้าน B", slug: `kg-secret-${ts}` },
  });

  // Page = unit-scoped → บริบทของร้าน A ต้องมี unitId ของตัวเอง (ยาม fail-closed ถ้าไม่มี — พิสูจน์ที่ KG-6.1)
  const dbA = tenantDb({ tenantId: A.id, unitId: unitA.id });

  // ── KG-1 list/count ──
  const listA = await dbA.page.findMany({});
  chk("KG-1.1", "findMany ของร้าน A ไม่เห็น Page ร้าน B", listA.length === 0, "0", String(listA.length));
  const cntA = await dbA.page.count({});
  chk("KG-1.2", "count ของร้าน A = 0", cntA === 0, "0", String(cntA));
  const firstA = await dbA.page.findFirst({ where: { slug: pageB.slug } });
  chk("KG-1.3", "findFirst ด้วย slug ของร้าน B → null", firstA === null, "null", JSON.stringify(firstA)?.slice(0, 60));

  // ── KG-2 findUnique เต็มแถว ──
  const uniqFull = await dbA.page.findUnique({ where: { slug: pageB.slug } });
  chk("KG-2.1", "findUnique(slug ร้าน B) → null", uniqFull === null, "null", JSON.stringify(uniqFull)?.slice(0, 60));
  const uniqById = await dbA.page.findUnique({ where: { id: pageB.id } });
  chk("KG-2.2", "findUnique(id ร้าน B) → null", uniqById === null, "null", JSON.stringify(uniqById)?.slice(0, 60));

  // ── KG-3 🔴 findUnique + select ที่ตัด tenantId ทิ้ง (ช่องโหว่ที่เพิ่งปิด) ──
  const uniqSel = await dbA.page.findUnique({ where: { slug: pageB.slug }, select: { id: true, name: true } });
  chk(
    "KG-3.1",
    "🔴 findUnique + select ไม่มี tenantId → ยังต้อง null (ยามห้ามพึ่งคอลัมน์ที่ถูก select ตัดทิ้ง)",
    uniqSel === null,
    "null",
    JSON.stringify(uniqSel)?.slice(0, 80),
  );
  const uniqSelId = await dbA.page.findUnique({ where: { id: pageB.id }, select: { id: true } });
  chk("KG-3.2", "🔴 findUnique(id) + select {id} ข้ามร้าน → null", uniqSelId === null, "null", JSON.stringify(uniqSelId)?.slice(0, 80));
  const uniqOrThrow = await threw(() => dbA.page.findUniqueOrThrow({ where: { id: pageB.id }, select: { id: true } }));
  chk("KG-3.3", "findUniqueOrThrow + select ข้ามร้าน → โยน", uniqOrThrow, "throw", "ไม่โยน");

  // ── KG-4 เขียนข้ามร้านต้องไม่เกิดผลจริง ──
  const upThrew = await threw(() => dbA.page.update({ where: { id: pageB.id }, data: { name: "โดนแฮก" } }));
  const afterUp = await prisma.page.findUnique({ where: { id: pageB.id }, select: { name: true } });
  chk("KG-4.1", "update ข้ามร้าน → โยน", upThrew, "throw", "ไม่โยน");
  chk("KG-4.2", "🔴 update ข้ามร้าน → ชื่อเดิมไม่ถูกแตะ (preventive ไม่ใช่ post-hoc)",
    afterUp?.name === "หน้าของร้าน B", "หน้าของร้าน B", String(afterUp?.name));
  const delThrew = await threw(() => dbA.page.delete({ where: { id: pageB.id } }));
  const stillThere = await prisma.page.count({ where: { id: pageB.id } });
  chk("KG-4.3", "delete ข้ามร้าน → โยน + แถวยังอยู่", delThrew && stillThere === 1, "throw+1", `${delThrew}/${stillThere}`);
  const dm = await dbA.page.deleteMany({ where: { id: pageB.id } });
  chk("KG-4.4", "deleteMany ข้ามร้าน → ลบ 0 แถว", dm.count === 0, "0", String(dm.count));
  const um = await dbA.page.updateMany({ where: { id: pageB.id }, data: { name: "x" } });
  chk("KG-4.5", "updateMany ข้ามร้าน → แก้ 0 แถว", um.count === 0, "0", String(um.count));

  // ── KG-5 create ถูกยัด tenantId ของบริบทเสมอ ──
  const madeByA = await dbA.page.create({
    data: { tenantId: B.id, unitId: unitA.id, name: "แอบสร้างให้ร้าน B", slug: `kg-mk-${ts}` },
  });
  chk("KG-5.1", "🔴 create ที่ส่ง tenantId ของร้านอื่นมา → ยามทับเป็นร้านตัวเอง",
    madeByA.tenantId === A.id, A.id, String(madeByA.tenantId));

  // ── KG-6 fail-closed: model ที่ต้องมีแกนย่อย แต่บริบทไม่ครบ ──
  const noUnit = await threw(() => tenantDb({ tenantId: A.id }).page.findMany({}));
  chk("KG-6.1", "model unit-scoped + ไม่มี unitId ในบริบท → โยน (fail-closed)", noUnit, "throw", "ไม่โยน");
  const noSystem = await threw(() => tenantDb({ tenantId: A.id }).posSale.findMany({}));
  chk("KG-6.2", "model system-scoped + ไม่มี systemId ในบริบท → โยน (fail-closed)", noSystem, "throw", "ไม่โยน");

  // ── KG-7 ของร้านตัวเองต้องยังใช้งานได้ตามปกติ (ยามต้องไม่ over-block) ──
  const ownFull = await dbA.page.findUnique({ where: { id: madeByA.id } });
  const ownSel = await dbA.page.findUnique({ where: { id: madeByA.id }, select: { id: true, name: true } });
  chk("KG-7.1", "อ่าน Page ของร้านตัวเอง (เต็มแถว) ได้", ownFull?.id === madeByA.id, madeByA.id, String(ownFull?.id));
  chk("KG-7.2", "อ่าน Page ของร้านตัวเอง (มี select) ได้", ownSel?.name === "แอบสร้างให้ร้าน B", "ชื่อเดิม", String(ownSel?.name));
  const ownUp = await dbA.page.update({ where: { id: madeByA.id }, data: { name: "เปลี่ยนชื่อได้" } });
  chk("KG-7.3", "แก้ Page ของร้านตัวเองได้", ownUp.name === "เปลี่ยนชื่อได้", "เปลี่ยนชื่อได้", String(ownUp.name));
} catch (e) {
  chk("CRASH", "harness จบไม่ error", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e));
} finally {
  for (const id of tids) {
    await prisma.pageWidget.deleteMany({ where: { tenantId: id } });
    await prisma.pageMember.deleteMany({ where: { tenantId: id } });
    await prisma.page.deleteMany({ where: { tenantId: id } });
    await prisma.businessUnit.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.deleteMany({ where: { id } });
  }
  console.log("[cleanup] ลบ test tenant เรียบร้อย");
}

const failed = cks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: Kernel guard (tenantDb) =====");
console.log(`ผ่าน ${cks.length - failed.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({
  total: cks.length,
  passed: cks.length - failed.length,
  findings: failed.map((c) => ({ id: c.id, sev: c.sev })),
}));
process.exit(failed.length > 0 ? 1 : 0);
