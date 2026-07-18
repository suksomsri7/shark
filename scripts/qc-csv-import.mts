// QC — นำเข้า CSV (WO Wave6-A) · Fable oracle (Builder ห้ามแตะเกณฑ์)
// สัญญา:
//   src/lib/core/csv.ts       parseCsv(text) → { headers, rows } · รองรับ header/quote/comma-in-quote/บรรทัดว่าง/BOM/tab
//   src/lib/modules/member/service.ts     importCustomers(ctx{tenantId,systemId}, table) → { created, skipped, errors }
//       · ต้องมีชื่อหรือเบอร์อย่างน้อย 1 · ซ้ำเบอร์/อีเมล = ข้าม (reuse findOrCreate)
//   src/lib/modules/inventory/service.ts  importItems(ctx{tenantId,systemId}, table) → { created, skipped, errors }
//       · ชื่อว่าง = error · sku ซ้ำ = ข้าม · ราคาทุนบาท→สตางค์ · onHand เริ่ม 0
//   cross-tenant: import เข้า system ตัวเอง ไม่รั่วไป tenant/system อื่น
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const csv = await import("@/lib/core/csv");
const member = await import("@/lib/modules/member/service");
const inv = await import("@/lib/modules/inventory/service");
const sys = await import("@/lib/modules/system/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`);
};

let tid = "";
let tidB = "";
try {
  // ═══════ P — parseCsv ═══════
  // BOM หัวไฟล์ + quote + comma ภายใน quote ("" = literal quote) + CRLF + บรรทัดว่าง
  const raw = '﻿name,note\r\n"a,b","line""x"\r\n\r\nc,d\n';
  const t = csv.parseCsv(raw);
  chk("P-1.1", `header ถูกตัด BOM + แยกถูก (${JSON.stringify(t.headers)})`,
    t.headers.length === 2 && t.headers[0] === "name" && t.headers[1] === "note");
  chk("P-1.2", `บรรทัดว่างถูกข้าม → 2 แถว (ได้ ${t.rows.length})`, t.rows.length === 2);
  chk("P-1.3", `comma ใน quote ไม่ถูก split ("a,b")`, t.rows[0][0] === "a,b");
  chk("P-1.4", `escaped quote "" → literal (line"x)`, t.rows[0][1] === 'line"x');
  chk("P-1.5", "แถวไม่มี quote แยกถูก (c,d)", t.rows[1][0] === "c" && t.rows[1][1] === "d");

  // ตัวคั่น tab (TSV) auto-detect
  const tt = csv.parseCsv("ชื่อ\tเบอร์\nสมชาย\t0810000000\n");
  chk("P-2.1", "auto-detect tab (TSV)", tt.headers.length === 2 && tt.rows[0][1] === "0810000000");

  // columnIndex — ชื่อพ้องไทย/อังกฤษ (normalize ช่องว่าง/พิมพ์เล็ก)
  chk("P-3.1", "columnIndex เจอ 'เบอร์โทร'",
    csv.columnIndex(["ชื่อ", "เบอร์โทร", "Email"], ["phone", "เบอร์โทร"]) === 1);
  chk("P-3.2", "columnIndex ไม่เจอ → -1", csv.columnIndex(["a", "b"], ["zzz"]) === -1);

  // ═══════ เตรียม tenant ═══════
  const tn = await prisma.tenant.create({ data: { name: "QC CSV", slug: `qc-csv-${Date.now()}` } });
  tid = tn.id;
  const tnB = await prisma.tenant.create({ data: { name: "QC CSV B", slug: `qc-csv-b-${Date.now()}` } });
  tidB = tnB.id;

  const mSys = await sys.createSystem(tid, "MEMBER", "สมาชิก A");
  const mSysB = await sys.createSystem(tidB, "MEMBER", "สมาชิก B");
  const iSys = await sys.createSystem(tid, "INVENTORY", "คลัง A");
  const mCtx = { tenantId: tid, systemId: mSys.id };
  const iCtx = { tenantId: tid, systemId: iSys.id };

  // ═══════ M — importCustomers ═══════
  // มีลูกค้าเดิม 1 (เบอร์ 0812345678) → แถวที่เบอร์ตรงต้องถูกข้าม
  await member.findOrCreate({ tenantId: tid, memberSystemId: mSys.id, phone: "0812345678", name: "เดิม", source: "STAFF" });

  const mCsv =
    "ชื่อ,เบอร์โทร,อีเมล\n" +
    "สมชาย ใจดี,0899999999,somchai@example.com\n" + // ใหม่
    "สมหญิง,0812345678,\n" + // ซ้ำเบอร์กับที่มีอยู่ → skip
    ",,noname@example.com\n"; // มีอีเมลแต่ไม่มีชื่อ/เบอร์ → error (บรรทัดว่างล้วนถูกข้าม ไม่นับ error)
  const mRes = await member.importCustomers(mCtx, csv.parseCsv(mCsv));
  chk("M-1.1", `created 1 (ได้ ${mRes.created})`, mRes.created === 1);
  chk("M-1.2", `skipped 1 ซ้ำเบอร์ (ได้ ${mRes.skipped})`, mRes.skipped === 1);
  chk("M-1.3", `errors 1 ไม่มีชื่อ/เบอร์ (ได้ ${mRes.errors.length})`, mRes.errors.length === 1);
  chk("M-1.4", `error ระบุเลขแถว 4 (ได้ ${mRes.errors[0]?.row})`, mRes.errors[0]?.row === 4);
  // ลูกค้าในระบบ = เดิม 1 + ใหม่ 1 = 2 (ไม่สร้างซ้ำ)
  const mCount = await prisma.customer.count({ where: { memberSystemId: mSys.id } });
  chk("M-1.5", `รวมลูกค้า 2 (เดิม+ใหม่, ไม่ซ้ำ) — ได้ ${mCount}`, mCount === 2);
  const created = await prisma.customer.findFirst({ where: { memberSystemId: mSys.id, phone: "0899999999" } });
  chk("M-1.6", "ลูกค้าใหม่มี memberCode + tenantId ถูก", !!created?.memberCode && created?.tenantId === tid);

  // header ภาษาอังกฤษก็ map ได้ (name/phone)
  const mRes2 = await member.importCustomers(mCtx, csv.parseCsv("name,phone\nJohn,0700000001\n"));
  chk("M-2.1", "header อังกฤษ (name/phone) นำเข้าได้", mRes2.created === 1);

  // ═══════ I — importItems ═══════
  await inv.createItem(iCtx, { sku: "EX-1", name: "ของเดิม" }); // sku ที่จะชนภายหลัง
  const iCsv =
    "ชื่อสินค้า,รหัสสินค้า,ราคาทุน\n" +
    "น้ำดื่ม,W-1,45\n" + // ใหม่ · ราคาทุน 45 บาท → 4500 สตางค์
    "สินค้าซ้ำ,EX-1,10\n" + // sku ซ้ำ → skip
    ",N-3,5\n"; // ชื่อว่าง → error
  const iRes = await inv.importItems(iCtx, csv.parseCsv(iCsv));
  chk("I-1.1", `created 1 (ได้ ${iRes.created})`, iRes.created === 1);
  chk("I-1.2", `skipped 1 sku ซ้ำ (ได้ ${iRes.skipped})`, iRes.skipped === 1);
  chk("I-1.3", `errors 1 ชื่อว่าง (ได้ ${iRes.errors.length})`, iRes.errors.length === 1);
  const w1 = await prisma.invItem.findFirst({ where: { systemId: iSys.id, sku: "W-1" } });
  chk("I-1.4", `ราคาทุน 45 บาท → 4500 สตางค์ (ได้ ${w1?.costSatang})`, w1?.costSatang === 4500);
  chk("I-1.5", `onHand เริ่ม 0 (ได้ ${w1?.onHand})`, w1?.onHand === 0);
  // ในระบบมี EX-1 (เดิม) + W-1 (ใหม่) = 2 · N-3 ต้องไม่ถูกสร้าง (ชื่อว่าง)
  const iCount = await prisma.invItem.count({ where: { systemId: iSys.id } });
  chk("I-1.6", `สินค้ารวม 2 (N-3 ไม่ถูกสร้าง) — ได้ ${iCount}`, iCount === 2);
  const n3 = await prisma.invItem.findFirst({ where: { systemId: iSys.id, sku: "N-3" } });
  chk("I-1.7", "แถวชื่อว่างไม่สร้างสินค้า (N-3 = null)", n3 === null);

  // SKU ว่าง → gen อัตโนมัติ (ไม่ error, ไม่ชน)
  const iRes2 = await inv.importItems(iCtx, csv.parseCsv("ชื่อสินค้า\nสินค้าไร้รหัส\n"));
  chk("I-2.1", "SKU ว่าง → สร้างได้ (gen sku)", iRes2.created === 1);

  // ═══════ X — cross-tenant ไม่รั่ว ═══════
  chk("X-1.1", "import เข้า system A ไม่สร้างใน system B",
    (await prisma.customer.count({ where: { memberSystemId: mSysB.id } })) === 0);
  chk("X-1.2", "ลูกค้าที่สร้างทั้งหมดเป็น tenant A",
    (await prisma.customer.count({ where: { memberSystemId: mSys.id, tenantId: { not: tid } } })) === 0);
} catch (e) {
  chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 200) : String(e)), false);
} finally {
  const d = async (f: () => Promise<unknown>) => {
    try { await f(); } catch {}
  };
  for (const id of [tid, tidB]) {
    if (!id) continue;
    for (const m of ["invMovement", "invLocationStock", "invLocation", "invLot", "invItem", "memberActivity", "customer", "appSystemUnit", "appSystem"])
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC CSV Import =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
