// QC — KB fuzzy search (Wave5-C) · Fable oracle · Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast
// สัญญา: searchKb แตกคำถามเป็นคำ ๆ match "คำใดคำหนึ่ง" (OR) + จัดอันดับตามจำนวนคำตรง (title ×3)
//   → คำถามหลายคำ/ไม่ตรงเป๊ะก็เจอ (เดิม contains ทั้ง query = exact substring)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const kb = (await import("@/lib/modules/kb/service" as string)) as {
  createArticle: (ctx: any, i: any) => Promise<{ id: string }>;
  updateArticle: (ctx: any, id: string, p: any) => Promise<void>;
  searchKb: (ctx: any, q: string, take?: number) => Promise<{ id: string; title: string }[]>;
};

type Sev = "CRITICAL";
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: boolean, e = "", a = "") => {
  cks.push({ id, ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

let tid = "", tid2 = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC KB", slug: `qc-kbs-${Date.now()}` } });
  tid = t.id;
  const t2 = await prisma.tenant.create({ data: { name: "QC KB2", slug: `qc-kbs2-${Date.now()}` } });
  tid2 = t2.id;
  const ctx = { tenantId: tid };

  const a1 = await kb.createArticle(ctx, {
    title: "นโยบายการคืนสินค้าและคืนเงิน",
    body: "ลูกค้าสามารถคืนสินค้าภายใน 7 วัน โดยเก็บใบเสร็จไว้ ทางร้านจะคืนเงินเต็มจำนวน",
    category: "นโยบาย",
  });
  const a2 = await kb.createArticle(ctx, {
    title: "วิธีสมัครสมาชิก",
    body: "กดปุ่มสมัครที่หน้าร้าน แล้วกรอกชื่อและเบอร์โทรศัพท์ ระบบจะสร้างรหัสสมาชิกให้",
    category: "สมาชิก",
  });
  const a3 = await kb.createArticle(ctx, {
    title: "เวลาทำการ",
    body: "ร้านเปิดทุกวัน 9:00-18:00 น. หยุดวันจันทร์",
    category: null,
  });

  // 1) multi-word: "คืนเงิน ลูกค้า" — เดิม contains ทั้งสตริงไม่เจอ (ไม่มีวลีนี้ติดกัน) · fuzzy เจอ a1
  const r1 = await kb.searchKb(ctx, "คืนเงิน ลูกค้า");
  chk("KB-1", "หลายคำ 'คืนเงิน ลูกค้า' → เจอ a1", r1.some((x) => x.id === a1.id), "เจอ a1", `${r1.length} ผล`);

  // 2) คำกระจาย: "สมัคร เบอร์โทรศัพท์ รหัส" — คำอยู่คนละที่ใน body · เดิมไม่เจอ · fuzzy เจอ a2
  const r2 = await kb.searchKb(ctx, "สมัคร เบอร์โทรศัพท์ รหัส");
  chk("KB-2", "คำกระจายในบทความ → เจอ a2", r2.some((x) => x.id === a2.id));

  // 3) จัดอันดับ: คำใน title มาก่อน — "คืนสินค้า" อยู่ title a1 → a1 อันดับ 1
  const r3 = await kb.searchKb(ctx, "คืนสินค้า");
  chk("KB-3", "title-hit อันดับแรก (a1)", r3.length > 0 && r3[0].id === a1.id, "a1 แรก", r3[0]?.id ?? "ว่าง");

  // 4) ไม่ match → ว่าง (ไม่คืนมั่ว)
  const r4 = await kb.searchKb(ctx, "จองโรงแรมภูเก็ต");
  chk("KB-4", "ไม่เกี่ยวข้อง → []", r4.length === 0, "0", String(r4.length));

  // 5) query ว่าง → []
  const r5 = await kb.searchKb(ctx, "   ");
  chk("KB-5", "query ว่าง → []", r5.length === 0, "0", String(r5.length));

  // 6) inactive ถูกตัด
  await kb.updateArticle(ctx, a3.id, { active: false });
  const r6 = await kb.searchKb(ctx, "เวลาทำการ");
  chk("KB-6", "บทความปิดใช้งาน → ไม่เจอ", !r6.some((x) => x.id === a3.id));

  // 7) cross-tenant: tid2 ค้นไม่เห็นของ tid
  const r7 = await kb.searchKb({ tenantId: tid2 }, "คืนเงิน ลูกค้า");
  chk("KB-7", "cross-tenant → ไม่เห็นบทความร้านอื่น", r7.length === 0, "0", String(r7.length));
} catch (e) {
  chk("KB-ERR", "รันจบไม่ throw", false, "no throw", e instanceof Error ? e.message : String(e));
} finally {
  for (const id of [tid, tid2]) {
    if (!id) continue;
    try { await prisma.kbArticle.deleteMany({ where: { tenantId: id } }); } catch {}
    try { await prisma.tenant.delete({ where: { id } }); } catch {}
  }
  console.log("[cleanup] เรียบร้อย");
}

const fail = cks.filter((c) => !c.ok);
console.log(`\nQC KB Search: ${cks.length - fail.length}/${cks.length} ผ่าน`);
if (fail.length) { console.error(`❌ ตก ${fail.length}`); process.exit(1); }
console.log("✅ เขียวหมด");
